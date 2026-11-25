// Minimal RGBA canvas, pixel masks and a PNG/ICO writer on node:zlib only (no image libraries needed).
// Taken from TilusTabLogo/tools (gfx.js + png.js), trimmed to what the launcher branding uses.
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const hex = (h, a = 255) => [(h >> 16) & 255, (h >> 8) & 255, h & 255, a]
const mix = (a, b, k) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k)).concat([255])

function crc32(buf) {
	let crc = ~0
	for (let n = 0; n < buf.length; n++) {
		let c = (crc ^ buf[n]) & 0xff
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
		crc = (crc >>> 8) ^ c
	}
	return ~crc >>> 0
}

function encodePng(w, h, data) {
	const raw = Buffer.alloc((w * 4 + 1) * h)
	for (let y = 0; y < h; y++) data.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
	const chunk = (type, d) => {
		const b = Buffer.alloc(12 + d.length)
		b.writeUInt32BE(d.length, 0)
		b.write(type, 4, 'ascii')
		d.copy(b, 8)
		b.writeUInt32BE(crc32(b.subarray(4, 8 + d.length)), 8 + d.length)
		return b
	}
	const ihdr = Buffer.alloc(13)
	ihdr.writeUInt32BE(w, 0)
	ihdr.writeUInt32BE(h, 4)
	ihdr[8] = 8
	ihdr[9] = 6
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', ihdr),
		chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0)),
	])
}

class Img {
	constructor(w, h) {
		this.w = w
		this.h = h
		this.d = Buffer.alloc(w * h * 4)
	}
	png() {
		return encodePng(this.w, this.h, this.d)
	}
	save(file) {
		fs.mkdirSync(path.dirname(file), { recursive: true })
		fs.writeFileSync(file, this.png())
		return this
	}
	get(x, y) {
		if (x < 0 || y < 0 || x >= this.w || y >= this.h) return [0, 0, 0, 0]
		const i = (y * this.w + x) * 4
		return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]
	}
	put(x, y, c) {
		if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
		const i = (y * this.w + x) * 4
		this.d[i] = c[0]
		this.d[i + 1] = c[1]
		this.d[i + 2] = c[2]
		this.d[i + 3] = c[3] === undefined ? 255 : c[3]
	}
	/** Paints over the existing pixel, respecting alpha on both sides. */
	set(x, y, c) {
		if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
		const i = (y * this.w + x) * 4
		const a = (c[3] === undefined ? 255 : c[3]) / 255
		const da = this.d[i + 3] / 255
		const oa = a + da * (1 - a)
		if (oa <= 0) return
		for (let k = 0; k < 3; k++) this.d[i + k] = Math.round((c[k] * a + this.d[i + k] * da * (1 - a)) / oa)
		this.d[i + 3] = Math.round(oa * 255)
	}
	draw(src, ox, oy) {
		for (let y = 0; y < src.h; y++)
			for (let x = 0; x < src.w; x++) {
				const c = src.get(x, y)
				if (c[3]) this.set(ox + x, oy + y, c)
			}
		return this
	}
	bounds() {
		let x0 = this.w
		let x1 = -1
		let y0 = this.h
		let y1 = -1
		for (let y = 0; y < this.h; y++)
			for (let x = 0; x < this.w; x++)
				if (this.d[(y * this.w + x) * 4 + 3]) {
					x0 = Math.min(x0, x)
					x1 = Math.max(x1, x)
					y0 = Math.min(y0, y)
					y1 = Math.max(y1, y)
				}
		return { x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 }
	}
	crop(x0, y0, w, h) {
		const o = new Img(w, h)
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o.put(x, y, this.get(x0 + x, y0 + y))
		return o
	}
	trim() {
		const b = this.bounds()
		return this.crop(b.x0, b.y0, b.w, b.h)
	}
	scale(k) {
		const o = new Img(this.w * k, this.h * k)
		for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.put(x, y, this.get((x / k) | 0, (y / k) | 0))
		return o
	}
}

/** A set of pixels "x,y". */
class Mask {
	constructor() {
		this.s = new Set()
	}
	add(x, y) {
		this.s.add(x + ',' + y)
		return this
	}
	del(x, y) {
		this.s.delete(x + ',' + y)
		return this
	}
	has(x, y) {
		return this.s.has(x + ',' + y)
	}
	each(fn) {
		for (const k of this.s) {
			const i = k.indexOf(',')
			fn(+k.slice(0, i), +k.slice(i + 1))
		}
		return this
	}
	rect(x, y, w, h) {
		for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.add(x + i, y + j)
		return this
	}
	clone() {
		const m = new Mask()
		m.s = new Set(this.s)
		return m
	}
	shift(dx, dy) {
		const m = new Mask()
		this.each((x, y) => m.add(x + dx, y + dy))
		return m
	}
	or(o) {
		const m = this.clone()
		o.each((x, y) => m.add(x, y))
		return m
	}
	grow(diag) {
		const m = new Mask()
		this.each((x, y) => {
			for (let dy = -1; dy <= 1; dy++)
				for (let dx = -1; dx <= 1; dx++) if (diag || !dx || !dy) m.add(x + dx, y + dy)
		})
		return m
	}
	bounds() {
		let x0 = 1e9
		let x1 = -1e9
		let y0 = 1e9
		let y1 = -1e9
		this.each((x, y) => {
			x0 = Math.min(x0, x)
			x1 = Math.max(x1, x)
			y0 = Math.min(y0, y)
			y1 = Math.max(y1, y)
		})
		return { x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 }
	}
	/**
	 * Rounds a corner: (cx, cy) is the corner pixel, (dx, dy) points inside the shape, R is the radius.
	 * With fill=true it fills a concave corner instead.
	 */
	round(cx, cy, dx, dy, R, fill) {
		for (let j = 0; j < R; j++)
			for (let i = 0; i < R; i++) {
				if (Math.hypot(R - i - 0.5, R - j - 0.5) > R) {
					if (fill) this.add(cx + i * dx, cy + j * dy)
					else this.del(cx + i * dx, cy + j * dy)
				}
			}
		return this
	}
}

/** Windows .ico with PNG-compressed entries (supported since Vista). */
function encodeIco(images) {
	const header = Buffer.alloc(6)
	header.writeUInt16LE(0, 0)
	header.writeUInt16LE(1, 2)
	header.writeUInt16LE(images.length, 4)
	const pngs = images.map((img) => img.png())
	const dir = Buffer.alloc(16 * images.length)
	let offset = 6 + dir.length
	images.forEach((img, i) => {
		const e = i * 16
		dir[e] = img.w >= 256 ? 0 : img.w
		dir[e + 1] = img.h >= 256 ? 0 : img.h
		dir.writeUInt16LE(1, e + 4)
		dir.writeUInt16LE(32, e + 6)
		dir.writeUInt32LE(pngs[i].length, e + 8)
		dir.writeUInt32LE(offset, e + 12)
		offset += pngs[i].length
	})
	return Buffer.concat([header, dir, ...pngs])
}

module.exports = { Img, Mask, hex, mix, encodeIco }
