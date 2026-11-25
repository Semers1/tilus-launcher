// Splits the strings still missing in a Tilus overlay locale into numbered batches for translation,
// and merges a translated batch back (through i18n-merge.cjs, which validates every message).
//   node branding/i18n-batches.cjs split <locale> <out dir> [batch size]
//     writes <out dir>/<locale>-NN.tsv: "N<TAB>id<TAB>English<TAB>Russian" (newlines escaped as \n)
//   node branding/i18n-batches.cjs apply <locale> <batch.tsv> <translated.tsv>
//     translated.tsv: "N<TAB>translation" or "N|translation" lines, numbered as in the batch
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const OVERLAY = path.join(ROOT, 'apps/app-frontend/src/locales-tilus')
/** Modrinth Hosting, billing and payouts are not part of Tilus Launcher; these fall back to Russian. */
const SKIPPED_PREFIXES = ['servers.', 'hosting.', 'billing.', 'payment-method.', 'affiliate.']

function flat(file) {
	if (!fs.existsSync(file)) return {}
	const out = {}
	for (const [id, value] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8'))))
		out[id] = typeof value === 'string' ? value : (value.message ?? value.defaultMessage)
	return out
}

const escape = (text) => text.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n')
const unescape = (text) =>
	text.replace(/\\(\\|t|n)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : '\\'))

function sources() {
	const app = flat(path.join(ROOT, 'apps/app-frontend/src/locales/en-US/index.json'))
	const ui = flat(path.join(ROOT, 'packages/ui/src/locales/en-US/index.json'))
	const russian = {
		...flat(path.join(ROOT, 'apps/app-frontend/src/locales/ru-RU/index.json')),
		...flat(path.join(ROOT, 'packages/ui/src/locales/ru-RU/index.json')),
		...flat(path.join(OVERLAY, 'ru-RU.json')),
	}
	const english = { ...app, ...ui, ...flat(path.join(OVERLAY, 'en-US.json')) }
	const ids = [...new Set([...Object.keys(app).sort(), ...Object.keys(ui).sort()])]
	return { ids, english, russian }
}

const [command, locale, ...rest] = process.argv.slice(2)
if (command === 'split') {
	const [outDir, size = '150'] = rest
	const { ids, english, russian } = sources()
	const done = flat(path.join(OVERLAY, `${locale}.json`))
	const todo = ids.filter(
		(id) => !(id in done) && english[id] && !SKIPPED_PREFIXES.some((prefix) => id.startsWith(prefix)),
	)
	fs.mkdirSync(outDir, { recursive: true })
	const batchSize = Number(size)
	for (let start = 0, n = 1; start < todo.length; start += batchSize, n++) {
		const lines = todo
			.slice(start, start + batchSize)
			.map(
				(id, i) =>
					`${i + 1}\t${id}\t${escape(english[id].replace(/Modrinth[\s\u00a0-]App/g, 'Tilus Launcher'))}\t${escape(
						(russian[id] ?? '').replace(/Modrinth[\s\u00a0-]App/g, 'Tilus Launcher'),
					)}`,
			)
		fs.writeFileSync(path.join(outDir, `${locale}-${String(n).padStart(2, '0')}.tsv`), lines.join('\n') + '\n')
	}
	console.log(`${todo.length} strings to translate into ${locale}, ${Math.ceil(todo.length / batchSize)} batches`)
} else if (command === 'apply') {
	const [batchFile, translatedFile] = rest
	const ids = fs
		.readFileSync(batchFile, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map((line) => line.split('\t')[1])
	const messages = {}
	for (const line of fs.readFileSync(translatedFile, 'utf8').split('\n').filter((l) => l.trim())) {
		const match = line.match(/^(\d+)[\t|](.*)$/)
		if (!match) throw new Error(`Bad line: ${line}`)
		const index = Number(match[1])
		if (!ids[index - 1]) throw new Error(`No string #${index} in ${batchFile}`)
		messages[ids[index - 1]] = unescape(match[2].replace(/\r$/, ''))
	}
	const missing = ids.filter((id) => !(id in messages))
	const json = path.join(path.dirname(translatedFile), `${path.basename(translatedFile)}.json`)
	fs.writeFileSync(json, JSON.stringify({ [locale]: messages }, null, '\t'))
	console.log(`${Object.keys(messages).length} translated${missing.length ? `, missing: ${missing.join(', ')}` : ''}`)
	execFileSync(process.execPath, [path.join(__dirname, 'i18n-merge.cjs'), json], { stdio: 'inherit' })
} else {
	console.log('usage: split <locale> <out dir> [size] | apply <locale> <batch.tsv> <translated.tsv>')
	process.exit(1)
}
