import { invoke } from '@tauri-apps/api/core'

import tilusIcon from '@/assets/tilus/icon-96.png'

/** Моды, без которых на play.tilus.ru неудобно: голосовой чат, голосовые сообщения, кэш ресурспака сервера. */
const SERVER_MODS = ['plasmo-voice', 'voicemessages', 'resourcepackcached']

/** Сборка-клиент из открытых модов Modrinth: ставится в один клик и сразу заходит на сервер. */
export interface OpenClient {
	id: string
	name: string
	icon: string
	mods: string[]
}

export const OPEN_CLIENTS: OpenClient[] = [
	{
		id: 'tilus-pvp',
		name: 'Tilus PvP',
		icon: tilusIcon,
		mods: [
			'sodium',
			'iris',
			'immediatelyfast',
			'entityculling',
			'ferrite-core',
			'dynamic-fps',
			'axolotlclient',
			'appleskin',
			'mouse-tweaks',
			'shulkerboxtooltip',
			'3dskinlayers',
			'modmenu',
			...SERVER_MODS,
		],
	},
	{
		id: 'axolotlclient',
		name: 'AxolotlClient',
		icon: 'https://cdn.modrinth.com/data/p2rxzX0q/60a3ba0d5af7958a6961359dcc748833e482bc82.png',
		mods: ['axolotlclient', 'sodium', 'modmenu', ...SERVER_MODS],
	},
	{
		id: 'essential',
		name: 'Essential',
		icon: 'https://cdn.modrinth.com/data/k2ZPuTBm/7f7ac7cf2a46d5f02e9644372c44b3095ad61ffb_96.webp',
		mods: ['essential', 'sodium', 'modmenu', ...SERVER_MODS],
	},
]

/** Клиенты со своими лаунчерами: ставятся их официальным установщиком в папку Tilus Launcher. */
export interface ExternalClientInfo {
	id: 'lunar' | 'dawn' | 'labymod' | 'badlion'
	name: string
	site: string
}

export const EXTERNAL_CLIENTS: ExternalClientInfo[] = [
	{ id: 'lunar', name: 'Lunar Client', site: 'https://www.lunarclient.com/download' },
	{ id: 'dawn', name: 'Dawn (Feather)', site: 'https://dawn.gg' },
	{ id: 'labymod', name: 'LabyMod', site: 'https://laby.net/client' },
	{ id: 'badlion', name: 'Badlion Client', site: 'https://client.badlion.net' },
]

export interface ExternalClientState {
	id: string
	installed: boolean
	managed: boolean
	downloadable: boolean
}

export interface DotMinecraftInfo {
	path: string
	options: boolean
	servers: boolean
	resourcepacks: number
	shaderpacks: number
	saves: number
	screenshots: number
}

export interface ImportReport {
	copied: number
	skipped: number
}

export type ImportPart = 'options' | 'servers' | 'resourcepacks' | 'shaderpacks' | 'saves' | 'screenshots'

export async function scanExternalClients() {
	return await invoke<ExternalClientState[]>('plugin:tilus|tilus_external_scan')
}

export async function installExternalClient(id: string) {
	return await invoke<void>('plugin:tilus|tilus_external_install', { id })
}

export async function launchExternalClient(id: string) {
	return await invoke<void>('plugin:tilus|tilus_external_launch', { id })
}

export async function dotMinecraftInfo() {
	return await invoke<DotMinecraftInfo | null>('plugin:tilus|tilus_dotminecraft_info')
}

export async function importDotMinecraft(instancePath: string, parts: ImportPart[]) {
	return await invoke<ImportReport>('plugin:tilus|tilus_import_dotminecraft', { instancePath, parts })
}
