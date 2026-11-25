export type Rgb = [number, number, number]

/** Colours of the "wave" TILUS logo, used when there is no instance or its icon is grey. */
export const TILUS_PALETTE: [Rgb, Rgb] = [
	[58, 147, 230],
	[40, 115, 204],
]

const SAMPLE_SIZE = 32
const HUE_BINS = 12

export function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
	const rn = r / 255
	const gn = g / 255
	const bn = b / 255
	const max = Math.max(rn, gn, bn)
	const min = Math.min(rn, gn, bn)
	const l = (max + min) / 2
	if (max === min) return [0, 0, l]
	const d = max - min
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
	let h
	if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0)
	else if (max === gn) h = (bn - rn) / d + 2
	else h = (rn - gn) / d + 4
	return [h * 60, s, l]
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
	const k = (n: number) => (n + h / 30) % 12
	const a = s * Math.min(l, 1 - l)
	const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
	return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

/** WCAG relative luminance. */
export function luminance([r, g, b]: Rgb): number {
	const lin = (v: number) => {
		const c = v / 255
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
	}
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export const rgbTriplet = ([r, g, b]: Rgb) => `${r} ${g} ${b}`
export const rgbHex = (rgb: Rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('')

/**
 * Brand colour for buttons, links and highlights derived from an icon colour: saturation and lightness are pulled
 * into a range that reads well on the theme background, and the text colour on top of it is picked by contrast.
 */
export function accentFrom(rgb: Rgb, dark: boolean): { accent: Rgb; contrast: string } {
	const [h, s] = rgbToHsl(rgb)
	const sat = Math.min(0.9, Math.max(0.55, s))
	const accent = dark ? hslToRgb(h, sat, 0.58) : hslToRgb(h, sat, 0.42)
	const onWhite = 1.05 / (luminance(accent) + 0.05)
	return { accent, contrast: onWhite >= 3 ? '#ffffff' : '#000000' }
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.crossOrigin = 'anonymous'
		img.onload = () => resolve(img)
		img.onerror = () => reject(new Error(`Could not load ${url}`))
		img.src = url
	})
}

/**
 * The two most prominent vivid colours of an image, grouped by hue. Returns null when the image is mostly grey,
 * black or white, or cannot be read (for example a remote icon served without CORS headers).
 */
export async function extractPalette(url: string): Promise<[Rgb, Rgb] | null> {
	let data: Uint8ClampedArray
	try {
		const img = await loadImage(url)
		const canvas = document.createElement('canvas')
		canvas.width = SAMPLE_SIZE
		canvas.height = SAMPLE_SIZE
		const ctx = canvas.getContext('2d', { willReadFrequently: true })
		if (!ctx) return null
		ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
		data = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data
	} catch {
		return null
	}

	const bins = Array.from({ length: HUE_BINS }, () => ({ weight: 0, r: 0, g: 0, b: 0 }))
	let opaque = 0
	for (let i = 0; i < data.length; i += 4) {
		if (data[i + 3] < 128) continue
		opaque++
		const rgb: Rgb = [data[i], data[i + 1], data[i + 2]]
		const [h, s, l] = rgbToHsl(rgb)
		if (s < 0.22 || l < 0.1 || l > 0.93) continue
		const weight = s * (1 - Math.abs(l - 0.5) * 1.2)
		const bin = bins[Math.floor(h / (360 / HUE_BINS)) % HUE_BINS]
		bin.weight += weight
		bin.r += rgb[0] * weight
		bin.g += rgb[1] * weight
		bin.b += rgb[2] * weight
	}

	const ranked = bins
		.map((bin, index) => ({ ...bin, index }))
		.filter((bin) => bin.weight > 0)
		.sort((a, b) => b.weight - a.weight)
	if (!ranked.length || ranked[0].weight < opaque * 0.04) return null

	const colour = (bin: (typeof ranked)[number]): Rgb => [
		Math.round(bin.r / bin.weight),
		Math.round(bin.g / bin.weight),
		Math.round(bin.b / bin.weight),
	]
	const primary = colour(ranked[0])
	const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), HUE_BINS - Math.abs(a - b))
	const second = ranked.find(
		(bin) => bin.weight >= ranked[0].weight * 0.2 && hueDistance(bin.index, ranked[0].index) >= 2,
	)
	if (second) return [primary, colour(second)]

	const [h, s, l] = rgbToHsl(primary)
	return [primary, hslToRgb((h + 32) % 360, s, Math.max(0.25, l - 0.12))]
}
