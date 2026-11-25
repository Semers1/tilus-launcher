// Merges translations into the Tilus overlay (apps/app-frontend/src/locales-tilus/<locale>.json) and checks them.
//   node branding/i18n-merge.cjs <file.json>   file: { "<locale>": { "<message id>": "<ICU message>" } }
//   node branding/i18n-merge.cjs --check       only checks the overlay files
// Every message must parse as ICU and use the same {placeholders} and <tags> as the English source.
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const OVERLAY = path.join(ROOT, 'apps/app-frontend/src/locales-tilus')
const { IntlMessageFormat } = require(
	require.resolve('intl-messageformat', { paths: [path.join(ROOT, 'packages/ui')] }),
)

function flat(file) {
	if (!fs.existsSync(file)) return {}
	const out = {}
	for (const [id, value] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8'))))
		out[id] = typeof value === 'string' ? value : (value.message ?? value.defaultMessage)
	return out
}

const loadEnglish = () => ({
	...flat(path.join(ROOT, 'apps/app-frontend/src/locales/en-US/index.json')),
	...flat(path.join(ROOT, 'packages/ui/src/locales/en-US/index.json')),
	...flat(path.join(OVERLAY, 'en-US.json')),
})
let english = {}

/** Placeholder names and tag names used by a message, sorted. */
function signature(message) {
	const names = new Set()
	const walk = (elements) => {
		for (const el of elements) {
			if (el.value !== undefined && typeof el.value === 'string' && el.type !== 0) names.add(`{${el.value}}`)
			if (el.type === 8) {
				names.add(`<${el.value}>`)
				walk(el.children)
			}
			if (el.options) for (const option of Object.values(el.options)) walk(option.value)
		}
	}
	walk(new IntlMessageFormat(message, 'en').getAst())
	return [...names].sort().join(' ')
}

function check(locale, messages) {
	const problems = []
	for (const [id, message] of Object.entries(messages)) {
		try {
			const own = signature(message)
			if (english[id] !== undefined) {
				const source = signature(english[id])
				if (own !== source) problems.push(`${locale} ${id}: uses "${own}", English uses "${source}"`)
			} else if (locale !== 'en-US') problems.push(`${locale} ${id}: no English source message`)
		} catch (error) {
			problems.push(`${locale} ${id}: ${error.message}`)
		}
	}
	return problems
}

function write(locale, messages) {
	const file = path.join(OVERLAY, `${locale}.json`)
	const sorted = Object.fromEntries(Object.keys(messages).sort().map((id) => [id, messages[id]]))
	fs.writeFileSync(file, JSON.stringify(sorted, null, '\t') + '\n')
}

const arg = process.argv[2]
let problems = []
if (arg && arg !== '--check') {
	const incoming = JSON.parse(fs.readFileSync(arg, 'utf8'))
	for (const [locale, messages] of Object.entries(incoming)) {
		const merged = { ...flat(path.join(OVERLAY, `${locale}.json`)), ...messages }
		write(locale, merged)
		console.log(`${locale}: +${Object.keys(messages).length}, ${Object.keys(merged).length} total`)
	}
}
english = loadEnglish()
for (const file of fs.readdirSync(OVERLAY).filter((f) => f.endsWith('.json'))) {
	const locale = file.replace(/\.json$/, '')
	problems = problems.concat(check(locale, flat(path.join(OVERLAY, file))))
}
if (problems.length) {
	console.log(problems.join('\n'))
	process.exit(1)
}
console.log('overlay ok')
