// Fails when a UI string still names Modrinth in a language Tilus Launcher offers, composed the way
// apps/app-frontend/src/i18n.config.ts does it. Reword such strings in apps/app-frontend/src/locales-tilus.
//
// Usage: node scripts/tilus/check-no-modrinth.mjs

import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')

function read(file) {
	const full = path.join(root, file)
	return fs.existsSync(full) ? JSON.parse(fs.readFileSync(full, 'utf8')) : {}
}

function compose(locale, dropModrinth = false) {
	const messages = {}
	for (const layer of [
		read(`apps/app-frontend/src/locales/${locale}/index.json`),
		read(`packages/ui/src/locales/${locale}/index.json`),
		read(`apps/app-frontend/src/locales-tilus/${locale}.json`),
	]) {
		for (const [id, value] of Object.entries(layer)) {
			messages[id] = typeof value === 'string' ? value : (value.message ?? value.defaultMessage ?? '')
		}
	}
	for (const [id, message] of Object.entries(messages)) {
		const renamed = message.replace(/Modrinth[\s -]App/g, 'Tilus Launcher')
		if (dropModrinth && /modrinth/i.test(renamed)) delete messages[id]
		else messages[id] = renamed
	}
	return messages
}

const english = compose('en-US')
const russian = compose('ru-RU')
const chains = {
	'ru-RU': [russian, english],
	'uk-UA': [compose('uk-UA'), english],
	'kk-KZ': [compose('kk-KZ', true), russian, english],
}

let failures = 0
for (const [locale, chain] of Object.entries(chains)) {
	const ids = new Set(chain.flatMap((messages) => Object.keys(messages)))
	for (const id of ids) {
		const message = chain.find((messages) => messages[id])?.[id]
		if (message && /modrinth/i.test(message)) {
			console.log(`${locale} ${id}: ${message}`)
			failures++
		}
	}
}

if (failures) {
	console.error(`\n${failures} UI strings still name Modrinth`)
	process.exit(1)
}
console.log('No UI strings name Modrinth')
