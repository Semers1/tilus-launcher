// Tilus Launcher branding: the "wave" TILUS wordmark (same letters as the lobby tab logo, TilusTabLogo/logo.js)
// and the app icon. Run `node branding/gen.cjs` from the repo root; `--preview` also writes branding/out/preview.png.
const fs = require('fs')
const path = require('path')
const { Img, Mask, hex, mix, encodeIco } = require('./gfx.cjs')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(__dirname, 'out')
const FRONTEND_ASSETS = path.join(ROOT, 'apps/app-frontend/src/assets/tilus')
const APP_ICONS = path.join(ROOT, 'apps/app/icons')

const NAVY = hex(0x0d2748)
const WHITE = hex(0xffffff)
const FOAM = hex(0xd6f1ff)
const WATER = [hex(0x5bb4f5), hex(0x3a93e6), hex(0x2873cc)]
const SIDE = [hex(0x1c57a6), hex(0x153f7d)]

/** Bold block letters TILUS: height H, stems sv, bars sh. Returns the word mask (top left is 0, 0). */
function word(o = {}) {
	const H = o.H || 25
	const sv = o.sv || 7
	const sh = o.sh || 5
	const r = 2
	const R = 6
	const L = []
	{
		const w = sv + 12
		const m = new Mask().rect(0, 0, w, sh).rect(6, 0, sv, H)
		m.round(0, 0, 1, 1, r).round(w - 1, 0, -1, 1, r).round(0, sh - 1, 1, -1, r).round(w - 1, sh - 1, -1, -1, r)
		m.round(6, H - 1, 1, -1, r).round(6 + sv - 1, H - 1, -1, -1, r)
		L.push({ w, m, kern: 3 })
	}
	{
		const m = new Mask().rect(0, 0, sv, H)
		m.round(0, 0, 1, 1, r).round(sv - 1, 0, -1, 1, r).round(0, H - 1, 1, -1, r).round(sv - 1, H - 1, -1, -1, r)
		L.push({ w: sv, m, kern: 4 })
	}
	{
		const w = sv + 10
		const m = new Mask().rect(0, 0, sv, H).rect(0, H - sh, w, sh)
		m.round(0, 0, 1, 1, r).round(sv - 1, 0, -1, 1, r).round(0, H - 1, 1, -1, r).round(w - 1, H - 1, -1, -1, r)
		m.round(w - 1, H - sh, -1, 1, r)
		L.push({ w, m, kern: 3 })
	}
	{
		const w = 2 * sv + 5
		const m = new Mask().rect(0, 0, sv, H).rect(w - sv, 0, sv, H).rect(0, H - sh, w, sh)
		m.round(0, 0, 1, 1, r).round(sv - 1, 0, -1, 1, r).round(w - sv, 0, 1, 1, r).round(w - 1, 0, -1, 1, r)
		m.round(0, H - 1, 1, -1, R).round(w - 1, H - 1, -1, -1, R)
		m.round(sv, H - sh - 1, 1, -1, 3, true).round(w - sv - 1, H - sh - 1, -1, -1, 3, true)
		L.push({ w, m, kern: 4 })
	}
	{
		const w = 2 * sv + 4
		const g = (H - 3 * sh) >> 1
		const y1 = sh + g
		const y2 = y1 + sh
		const y3 = H - sh
		const m = new Mask().rect(0, 0, w, sh).rect(0, 0, sv, y2).rect(0, y1, w, sh).rect(w - sv, y1, sv, H - y1)
		m.rect(0, y3, w, sh)
		m.round(0, 0, 1, 1, R - 1).round(w - 1, 0, -1, 1, r).round(w - 1, sh - 1, -1, -1, r).round(0, y2 - 1, 1, -1, R - 1)
		m.round(w - 1, y1, -1, 1, R - 1).round(w - 1, H - 1, -1, -1, R - 1).round(0, H - 1, 1, -1, r).round(0, y3, 1, 1, r)
		m.round(sv, sh, 1, 1, 3, true).round(sv, y1 - 1, 1, -1, 3, true).round(w - sv - 1, y2, -1, 1, 3, true)
		m.round(w - sv - 1, y3 - 1, -1, -1, 3, true)
		L.push({ w, m, kern: 0 })
	}
	const mask = new Mask()
	let x = 0
	for (const l of L) {
		l.m.each((px, py) => mask.add(x + px, py))
		x += l.w + l.kern
	}
	return { mask, W: x, H }
}

/** The letter T alone, for the icon: arm is how far the bar reaches past the stem on each side. */
function letterT({ H, sv, sh, arm, r }) {
	const w = sv + 2 * arm
	const m = new Mask().rect(0, 0, w, sh).rect(arm, 0, sv, H)
	m.round(0, 0, 1, 1, r).round(w - 1, 0, -1, 1, r).round(0, sh - 1, 1, -1, r).round(w - 1, sh - 1, -1, -1, r)
	m.round(arm, H - 1, 1, -1, r).round(arm + sv - 1, H - 1, -1, -1, r)
	return m
}

/** Paints a mask with a face, `depth` rows of side below it and a 1 px outline around everything. */
function build(mask, o) {
	const depth = o.depth || 0
	const pad = o.pad ?? 1
	const b = mask.bounds()
	const ox = pad - b.x0
	const oy = pad - b.y0
	const img = new Img(b.w + pad * 2, b.h + depth + pad * 2)
	let body = mask.clone()
	for (let d = 1; d <= depth; d++) body = body.or(mask.shift(0, d))
	if (o.outline)
		body.grow(true).each((x, y) => {
			if (!body.has(x, y)) img.set(ox + x, oy + y, o.outline)
		})
	for (let d = depth; d >= 1; d--)
		mask.shift(0, d).each((x, y) => {
			if (!mask.has(x, y)) img.set(ox + x, oy + y, o.side(x, y, d))
		})
	mask.each((x, y) => img.set(ox + x, oy + y, o.face(x, y)))
	return img
}

/** Face colour of the wave letters: white above the water line, foam on it, then three bands of water. */
function waterFace(level) {
	return (x, y) => {
		const d = y - Math.round(level(x))
		if (d < 0) return WHITE
		if (d === 0) return FOAM
		if (d < 4) return WATER[0]
		if (d < 8) return WATER[1]
		return WATER[2]
	}
}

const waveSide = (x, y, d) => (d === 1 ? SIDE[0] : SIDE[1])

/** One frame of the wordmark; phase 0..1 moves the wave along the word (same curve as the lobby tab logo). */
function wordmark(phase) {
	const w = word()
	const level = (x) =>
		13.5 + 1.6 * Math.sin((x / 26 + phase) * Math.PI * 2) + 0.7 * Math.sin((x / 13 - phase * 2) * Math.PI * 2)
	return build(w.mask, { depth: 2, outline: NAVY, face: waterFace(level), side: waveSide })
}

/**
 * Pixel classes of the still wordmark for the launcher to draw water at any level itself
 * (download progress fills the letters): outline, the two side rows below the letters, and the face.
 */
function wordmarkMask() {
	const w = word()
	const depth = 2
	const b = w.mask.bounds()
	const ox = 1 - b.x0
	const oy = 1 - b.y0
	let body = w.mask.clone()
	for (let d = 1; d <= depth; d++) body = body.or(w.mask.shift(0, d))
	const outline = []
	body.grow(true).each((x, y) => {
		if (!body.has(x, y)) outline.push([ox + x, oy + y])
	})
	const side = []
	for (let d = depth; d >= 1; d--)
		w.mask.shift(0, d).each((x, y) => {
			if (!w.mask.has(x, y)) side.push([ox + x, oy + y, d])
		})
	const face = []
	w.mask.each((x, y) => face.push([ox + x, oy + y]))
	const sort = (a, b) => a[1] - b[1] || a[0] - b[0]
	return {
		width: b.w + 2,
		height: b.h + depth + 2,
		faceTop: oy + b.y0,
		faceBottom: oy + b.y1,
		outline: outline.sort(sort),
		side: side.sort(sort),
		face: face.sort(sort),
	}
}

/** Rounded square tile of size N with corner radius R. */
function tileMask(N, R) {
	const m = new Mask().rect(0, 0, N, N)
	m.round(0, 0, 1, 1, R).round(N - 1, 0, -1, 1, R).round(0, N - 1, 1, -1, R).round(N - 1, N - 1, -1, -1, R)
	return m
}

/** T proportions per icon size, so that the small sizes are drawn natively instead of being scaled down. */
const T_SIZES = {
	16: { H: 10, sv: 4, sh: 3, arm: 3, r: 1, depth: 1, tileR: 3 },
	24: { H: 15, sv: 5, sh: 4, arm: 5, r: 1, depth: 1, tileR: 5 },
	32: { H: 20, sv: 6, sh: 5, arm: 6, r: 2, depth: 2, tileR: 7 },
}

const ICON_VARIANTS = {
	/** Dark glass tile with a blue glow from below; the T is in the wordmark's wave style. */
	glow(N) {
		const p = T_SIZES[N]
		const tile = tileMask(N, p.tileR)
		const img = new Img(N, N)
		tile.each((x, y) => {
			const v = y / (N - 1)
			let c = mix(hex(0x152540), hex(0x0b1424), v)
			const g = Math.max(0, 1 - Math.hypot((x - (N - 1) / 2) / (N * 0.55), (y - N * 0.95) / (N * 0.5)))
			c = mix(c, hex(0x2873cc), g * 0.55)
			img.put(x, y, c)
		})
		tile.each((x, y) => {
			let edge = false
			for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!tile.has(x + dx, y + dy)) edge = true
			if (edge) img.put(x, y, mix(img.get(x, y), hex(0x5bb4f5), 0.35))
		})
		const t = letterT(p)
		const level = (x) => p.H * 0.52 + (N >= 32 ? 0.9 * Math.sin((x / (p.sv + 2 * p.arm)) * Math.PI * 2) : 0)
		const face = N >= 24 ? waterFace(level) : (x, y) => (y < p.H * 0.5 ? WHITE : WATER[1])
		const glyph = build(t, { depth: p.depth, outline: NAVY, face, side: waveSide })
		img.draw(glyph, Math.round((N - glyph.w) / 2), Math.round((N - glyph.h) / 2))
		return img
	},
	/** The tile is a glass of water: dark top, water bands below a wave line, a white T standing in it. */
	water(N) {
		const p = T_SIZES[N]
		const tile = tileMask(N, p.tileR)
		const img = new Img(N, N)
		const line = (x) => N * 0.58 + (N >= 24 ? (N / 32) * 1.3 * Math.sin((x / N + 0.15) * Math.PI * 2) : 0)
		tile.each((x, y) => {
			const d = y - Math.round(line(x))
			let c
			if (d < 0) c = mix(hex(0x18294a), hex(0x0e1a30), y / (N * 0.6))
			else if (d === 0) c = FOAM
			else if (d < Math.max(2, N / 8)) c = WATER[0]
			else if (d < Math.max(4, N / 4)) c = WATER[1]
			else c = WATER[2]
			img.put(x, y, c)
		})
		const t = letterT(p)
		const glyph = build(t, {
			depth: p.depth,
			outline: NAVY,
			face: () => WHITE,
			side: () => hex(0x9fb6d3),
		})
		const gx = Math.round((N - glyph.w) / 2)
		const gy = Math.round((N - glyph.h) / 2) - (N >= 24 ? 1 : 0)
		img.draw(glyph, gx, gy)
		for (let y = 0; y < N; y++)
			for (let x = 0; x < N; x++) {
				const c = img.get(x, y)
				if (y > line(x) && c[0] > 200 && c[1] > 200 && c[2] > 200) img.put(x, y, hex(0xbfe4ff))
			}
		return img
	},
	/** Brand blue tile with a white T and a soft wave highlight. */
	blue(N) {
		const p = T_SIZES[N]
		const tile = tileMask(N, p.tileR)
		const img = new Img(N, N)
		const line = (x) => N * 0.62 + (N >= 24 ? (N / 32) * 1.2 * Math.sin((x / N) * Math.PI * 2) : 0)
		tile.each((x, y) => {
			let c = mix(hex(0x4aa3f0), hex(0x2873cc), y / (N - 1))
			if (y > line(x)) c = mix(c, hex(0x1c57a6), 0.45)
			img.put(x, y, c)
		})
		const t = letterT(p)
		const glyph = build(t, { depth: p.depth, outline: NAVY, face: () => WHITE, side: () => hex(0xb5cbe6) })
		img.draw(glyph, Math.round((N - glyph.w) / 2), Math.round((N - glyph.h) / 2))
		return img
	},
}

function upscaleOn(img, k, bg) {
	const o = new Img(img.w * k, img.h * k)
	for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.put(x, y, bg)
	o.draw(img.scale(k), 0, 0)
	return o
}

function preview() {
	const bgs = [hex(0x1f1f1f), hex(0xf3f3f3), hex(0x2b4f80)]
	const cells = []
	for (const name of Object.keys(ICON_VARIANTS))
		for (const bg of bgs) cells.push([16, 24, 32].map((N) => upscaleOn(ICON_VARIANTS[name](N), N === 32 ? 6 : N === 24 ? 8 : 12, bg)))
	const cellW = cells[0].reduce((s, i) => s + i.w + 8, 8)
	const cellH = 192 + 16
	const sheet = new Img(cellW * bgs.length, cellH * Object.keys(ICON_VARIANTS).length + 260)
	for (let y = 0; y < sheet.h; y++) for (let x = 0; x < sheet.w; x++) sheet.put(x, y, hex(0x101010))
	cells.forEach((row, i) => {
		const cx = (i % bgs.length) * cellW
		const cy = Math.floor(i / bgs.length) * cellH
		let x = cx + 8
		for (const img of row) {
			for (let yy = 0; yy < cellH - 8; yy++) for (let xx = 0; xx < img.w + 8; xx++) sheet.put(x - 4 + xx, cy + 4 + yy, bgs[i % bgs.length])
			sheet.draw(img, x, cy + 8)
			x += img.w + 8
		}
	})
	const wm = wordmark(0).scale(3)
	const wy = cellH * Object.keys(ICON_VARIANTS).length + 20
	for (let y = wy - 10; y < wy + wm.h + 10; y++) for (let x = 0; x < sheet.w; x++) sheet.put(x, y, hex(0x16181c))
	sheet.draw(wm, 16, wy)
	sheet.draw(wordmark(0.25).scale(3), 32 + wm.w, wy)
	sheet.save(path.join(OUT, 'preview.png'))
}

function main() {
	const args = process.argv.slice(2)
	if (args.includes('--preview')) {
		preview()
		console.log('preview: branding/out/preview.png')
		return
	}
	const variant = ICON_VARIANTS[args.find((a) => !a.startsWith('--')) || 'glow']

	const still = wordmark(0)
	for (const k of [1, 2, 3]) still.scale(k).save(path.join(FRONTEND_ASSETS, k === 1 ? 'wordmark.png' : `wordmark@${k}x.png`))
	fs.writeFileSync(path.join(FRONTEND_ASSETS, 'wordmark-mask.json'), JSON.stringify(wordmarkMask()))
	const FRAMES = 40
	const sheet = new Img(still.w, still.h * FRAMES)
	for (let i = 0; i < FRAMES; i++) sheet.draw(wordmark(i / FRAMES), 0, i * still.h)
	sheet.save(path.join(FRONTEND_ASSETS, 'wordmark-wave.png'))

	const i16 = variant(16)
	const i24 = variant(24)
	const i32 = variant(32)
	i24.save(path.join(FRONTEND_ASSETS, 'icon-24.png'))
	i24.scale(2).save(path.join(FRONTEND_ASSETS, 'icon-24@2x.png'))
	i32.scale(3).save(path.join(FRONTEND_ASSETS, 'icon-96.png'))
	i32.scale(6).save(path.join(FRONTEND_ASSETS, 'icon-96@2x.png'))
	i32.scale(32).save(path.join(OUT, 'icon-1024.png'))
	const ico = encodeIco([i16, i24, i32, i16.scale(3), i32.scale(2), i32.scale(4), i32.scale(8)])
	fs.mkdirSync(OUT, { recursive: true })
	fs.writeFileSync(path.join(OUT, 'icon.ico'), ico)
	if (fs.existsSync(APP_ICONS)) {
		fs.writeFileSync(path.join(APP_ICONS, 'icon.ico'), ico)
		fs.writeFileSync(path.join(APP_ICONS, 'favicon.ico'), ico)
		i32.scale(4).save(path.join(APP_ICONS, '128x128.png'))
		i32.scale(8).save(path.join(APP_ICONS, '128x128@2x.png'))
	}
	console.log(`wordmark ${still.w}x${still.h}, ${FRAMES} wave frames; icon sizes 16/24/32/48/64/128/256`)
}

main()
