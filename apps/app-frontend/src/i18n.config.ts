import {
	createMessageCompiler,
	type CrowdinMessages,
	TILUS_LOCALES,
	transformCrowdinMessages,
} from '@modrinth/ui'
import englishUi from '@modrinth/ui/src/locales/en-US/index.json'
import russianUi from '@modrinth/ui/src/locales/ru-RU/index.json'
import { createI18n } from 'vue-i18n'

import englishApp from './locales/en-US/index.json'
import russianApp from './locales/ru-RU/index.json'
import tilusEnglish from './locales-tilus/en-US.json'
import tilusRussian from './locales-tilus/ru-RU.json'

/**
 * Tilus Launcher is Russian first: it starts in Russian, any language other than the offered ones becomes Russian,
 * and Kazakh falls back to Russian for strings it does not have yet.
 */
export const DEFAULT_LOCALE = 'ru-RU'
const ALWAYS_LOADED = new Set(['en-US', DEFAULT_LOCALE])

const localeUrls = import.meta.glob<string>('./locales/*/index.json', {
	eager: true,
	query: '?url',
	import: 'default',
})
const uiLocaleUrls = import.meta.glob<string>('../../../packages/ui/src/locales/*/index.json', {
	eager: true,
	query: '?url',
	import: 'default',
})
const tilusLocaleUrls = import.meta.glob<string>('./locales-tilus/*.json', {
	eager: true,
	query: '?url',
	import: 'default',
})

/**
 * Modrinth's translations (app, then shared UI) with the Tilus overlay on top: strings of Tilus features and fixes.
 * Upstream strings still name the Modrinth App, so the name is swapped here instead of in every translation file.
 * The Russian and Ukrainian overlays reword every other mention of Modrinth; a locale that falls back to Russian
 * passes `dropModrinth` so its own strings that still name Modrinth give way to the Russian ones.
 */
function composeMessages(
	app: CrowdinMessages,
	ui: CrowdinMessages,
	tilus: CrowdinMessages,
	dropModrinth = false,
): Record<string, string> {
	const messages = {
		...transformCrowdinMessages(app),
		...transformCrowdinMessages(ui),
		...transformCrowdinMessages(tilus),
	}
	for (const [id, message] of Object.entries(messages)) {
		const renamed = message.replace(/Modrinth[\s\u00a0-]App/g, 'Tilus Launcher')
		if (dropModrinth && /modrinth/i.test(renamed)) delete messages[id]
		else messages[id] = renamed
	}
	return messages
}

const initialMessages: Record<string, Record<string, string>> = {
	'en-US': composeMessages(englishApp, englishUi, tilusEnglish),
	[DEFAULT_LOCALE]: composeMessages(russianApp, russianUi, tilusRussian),
}

const i18n = createI18n({
	legacy: false,
	locale: DEFAULT_LOCALE,
	fallbackLocale: { 'kk-KZ': [DEFAULT_LOCALE, 'en-US'], default: ['en-US'] },
	messageCompiler: createMessageCompiler(),
	missingWarn: false,
	fallbackWarn: false,
	messages: initialMessages,
})

const pendingLocales = new Map<string, Promise<Record<string, string>>>()
let localeRequest = 0

async function fetchMessages(url: string | undefined): Promise<CrowdinMessages> {
	if (!url) return {}
	const response = await fetch(url)
	if (!response.ok) throw new Error(`Could not load translations: ${response.status}`)
	return response.json()
}

export function resolveLocale(requestedLocale: string | null | undefined): string {
	return TILUS_LOCALES.some((candidate) => candidate.code === requestedLocale)
		? (requestedLocale as string)
		: DEFAULT_LOCALE
}

export async function setLocale(requestedLocale: string): Promise<void> {
	const request = ++localeRequest
	const locale = resolveLocale(requestedLocale)
	if (!ALWAYS_LOADED.has(locale) && locale !== i18n.global.locale.value) {
		let pending = pendingLocales.get(locale)
		if (!pending) {
			pending = Promise.all([
				fetchMessages(localeUrls[`./locales/${locale}/index.json`]),
				fetchMessages(uiLocaleUrls[`../../../packages/ui/src/locales/${locale}/index.json`]),
				fetchMessages(tilusLocaleUrls[`./locales-tilus/${locale}.json`]),
			])
				.then(([app, ui, tilus]) => composeMessages(app, ui, tilus, locale === 'kk-KZ'))
				.finally(() => pendingLocales.delete(locale))
			pendingLocales.set(locale, pending)
		}
		const messages = await pending
		if (request !== localeRequest) return
		i18n.global.setLocaleMessage(locale, messages)
	}
	if (request !== localeRequest) return
	const previous = i18n.global.locale.value
	i18n.global.locale.value = locale
	if (previous !== locale && !ALWAYS_LOADED.has(previous)) {
		i18n.global.setLocaleMessage(previous, {})
	}
}

export default i18n
