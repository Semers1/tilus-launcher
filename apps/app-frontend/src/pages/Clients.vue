<script setup lang="ts">
import { CopyIcon, DownloadIcon, ExternalIcon, ImportIcon, PlayIcon, SpinnerIcon } from '@modrinth/assets'
import { defineMessages, injectNotificationManager, useVIntl } from '@modrinth/ui'
import { useQuery } from '@tanstack/vue-query'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, inject, reactive, ref, watch } from 'vue'

import {
	dotMinecraftInfo,
	EXTERNAL_CLIENTS,
	type ExternalClientInfo,
	type ImportPart,
	importDotMinecraft,
	installExternalClient,
	launchExternalClient,
	OPEN_CLIENTS,
	type OpenClient,
	scanExternalClients,
} from '@/features/tilus/clients'
import { TILUS_SERVERS } from '@/features/tilus/servers'
import { install_create_instance, installJobInstanceId, wait_for_install_job } from '@/helpers/install'
import { get_full_path, install_project_with_dependencies } from '@/helpers/instance'
import { start_join_server } from '@/helpers/worlds'
import { instanceListQueryOptions } from '@/pages/instance/query-options'
import { injectAppEvents } from '@/providers/app-events'

/** Клиенты: PvP-сборки в один клик, лаунчеры Lunar/Dawn/LabyMod/Badlion из папки лаунчера и перенос из .minecraft. */
const { formatMessage } = useVIntl()
const { handleError, addNotification } = injectNotificationManager()
const appEvents = injectAppEvents()
const showCreationModal = inject<() => void>('showCreationModal')
const server = TILUS_SERVERS[0]

const instancesQuery = useQuery(instanceListQueryOptions())
const instances = computed(() => instancesQuery.data.value ?? [])
const progress = reactive<Record<string, string>>({})

function instanceOf(client: OpenClient) {
	return instances.value.find((i) => i.name === client.name)
}

/** Мод качается в фоне после ответа бэкенда: ждём его события «готово» или «не вышло», но не дольше трёх минут. */
function waitForContent(instanceId: string) {
	let off: (() => void) | undefined
	const done = new Promise<boolean>((resolve) => {
		const timer = setTimeout(() => {
			off?.()
			resolve(false)
		}, 180_000)
		off = appEvents.on('instance', (event) => {
			if (event.instance_id !== instanceId) return
			if (event.event !== 'content_install_finished' && event.event !== 'content_install_failed') return
			clearTimeout(timer)
			off?.()
			resolve(event.event === 'content_install_finished')
		})
	})
	return { done, cancel: () => off?.() }
}

async function playOpen(client: OpenClient) {
	if (progress[client.id]) return
	try {
		let id = instanceOf(client)?.id
		if (!id) {
			progress[client.id] = formatMessage(messages.creating)
			const job = await install_create_instance({
				name: client.name,
				gameVersion: '26.3',
				loader: 'fabric',
				loaderVersion: 'latest',
				iconPath: null,
			})
			id = installJobInstanceId(job) ?? undefined
			if (!id) throw new Error(formatMessage(messages.createFailed))
			await wait_for_install_job(appEvents, job.job_id)
			for (const [index, mod] of client.mods.entries()) {
				progress[client.id] = formatMessage(messages.installingMods, {
					done: index,
					total: client.mods.length,
				})
				const waiter = waitForContent(id)
				const resolved = await install_project_with_dependencies(id, {
					project_id: mod,
					content_type: 'mod',
				}).then(
					() => true,
					() => false,
				)
				if (resolved) await waiter.done
				else waiter.cancel()
			}
			await instancesQuery.refetch()
		}
		progress[client.id] = formatMessage(messages.starting)
		await start_join_server(id, server.address)
	} catch (error) {
		handleError(error as Error)
	} finally {
		delete progress[client.id]
	}
}

const externalQuery = useQuery({
	queryKey: ['tilus-external-clients'],
	queryFn: scanExternalClients,
	refetchInterval: 5_000,
})
const externalState = computed(
	() => new Map((externalQuery.data.value ?? []).map((state) => [state.id, state])),
)
const externalBusy = reactive<Record<string, boolean>>({})

async function installExternal(client: ExternalClientInfo) {
	externalBusy[client.id] = true
	try {
		await installExternalClient(client.id)
		addNotification({
			title: formatMessage(messages.installerStarted, { client: client.name }),
			text: formatMessage(messages.installerHint),
			type: 'success',
		})
	} catch (error) {
		handleError(error as Error)
	} finally {
		externalBusy[client.id] = false
	}
}

async function launchExternal(client: ExternalClientInfo) {
	await launchExternalClient(client.id).catch(handleError)
}

async function copyAddress() {
	await navigator.clipboard.writeText(server.address).catch(() => {})
	addNotification({ title: formatMessage(messages.copied, { address: server.address }), type: 'success' })
}

const dotMinecraft = useQuery({ queryKey: ['tilus-dot-minecraft'], queryFn: dotMinecraftInfo })
const importParts = reactive<Record<ImportPart, boolean>>({
	options: true,
	servers: true,
	resourcepacks: true,
	shaderpacks: true,
	saves: false,
	screenshots: false,
})
const importTarget = ref<string>('')
const importing = ref(false)

watch(
	instances,
	(list) => {
		if (!importTarget.value && list.length) importTarget.value = list[0].id
	},
	{ immediate: true },
)

const importRows = computed(() => {
	const info = dotMinecraft.data.value
	if (!info) return []
	return [
		{ part: 'options' as const, label: messages.partOptions, present: info.options },
		{ part: 'servers' as const, label: messages.partServers, present: info.servers },
		{ part: 'resourcepacks' as const, label: messages.partResourcepacks, count: info.resourcepacks },
		{ part: 'shaderpacks' as const, label: messages.partShaderpacks, count: info.shaderpacks },
		{ part: 'saves' as const, label: messages.partSaves, count: info.saves },
		{ part: 'screenshots' as const, label: messages.partScreenshots, count: info.screenshots },
	].filter((row) => row.present || (row.count ?? 0) > 0)
})

async function runImport() {
	if (!importTarget.value || importing.value) return
	const parts = (Object.keys(importParts) as ImportPart[]).filter((part) => importParts[part])
	if (!parts.length) return
	importing.value = true
	try {
		const path = await get_full_path(importTarget.value)
		const report = await importDotMinecraft(path, parts)
		addNotification({
			title: formatMessage(messages.imported, { copied: report.copied }),
			text: report.skipped ? formatMessage(messages.importedSkipped, { skipped: report.skipped }) : undefined,
			type: 'success',
		})
	} catch (error) {
		handleError(error as Error)
	} finally {
		importing.value = false
	}
}

const messages = defineMessages({
	title: { id: 'tilus.clients.title', defaultMessage: 'Clients' },
	openTitle: { id: 'tilus.clients.open.title', defaultMessage: 'PvP clients' },
	openHint: {
		id: 'tilus.clients.open.hint',
		defaultMessage: 'Installs as a separate instance for 26.3 and joins {address} right away.',
	},
	tilusPvp: {
		id: 'tilus.clients.tilus-pvp',
		defaultMessage: 'Our build: Sodium and Iris, keystrokes, CPS, armor and potion HUD, zoom, voice chat.',
	},
	axolotlclient: {
		id: 'tilus.clients.axolotlclient',
		defaultMessage: 'An open PvP client: HUD, zoom, freelook, keystrokes and CPS.',
	},
	essential: {
		id: 'tilus.clients.essential',
		defaultMessage: 'Cosmetics, emotes and friends from Essential.',
	},
	install: { id: 'tilus.clients.install', defaultMessage: 'Install and play' },
	play: { id: 'tilus.clients.play', defaultMessage: 'Play on tilus.ru' },
	creating: { id: 'tilus.clients.creating', defaultMessage: 'Creating the instance…' },
	installingMods: { id: 'tilus.clients.installing-mods', defaultMessage: 'Installing mods {done}/{total}…' },
	starting: { id: 'tilus.clients.starting', defaultMessage: 'Starting the game…' },
	createFailed: { id: 'tilus.clients.create-failed', defaultMessage: 'Could not create the instance' },
	externalTitle: { id: 'tilus.clients.external.title', defaultMessage: 'Client launchers' },
	externalHint: {
		id: 'tilus.clients.external.hint',
		defaultMessage:
			'The official installer is downloaded into the launcher folder; its desktop shortcuts move there too. Server address: {address}.',
	},
	lunar: { id: 'tilus.clients.lunar', defaultMessage: 'Installed through Overwolf.' },
	dawn: { id: 'tilus.clients.dawn', defaultMessage: 'The new name of Feather Client.' },
	labymod: { id: 'tilus.clients.labymod', defaultMessage: 'Laby Launcher with its own instances.' },
	badlion: {
		id: 'tilus.clients.badlion',
		defaultMessage: 'The Badlion site only allows downloading in a browser: install it from there.',
	},
	launch: { id: 'tilus.clients.launch', defaultMessage: 'Launch' },
	installExternal: { id: 'tilus.clients.install-external', defaultMessage: 'Install' },
	openSite: { id: 'tilus.clients.open-site', defaultMessage: 'Open the site' },
	copyAddress: { id: 'tilus.clients.copy-address', defaultMessage: 'Copy the address' },
	copied: { id: 'tilus.servers.copied', defaultMessage: 'Copied {address}' },
	installerStarted: { id: 'tilus.clients.installer-started', defaultMessage: '{client}: installer started' },
	installerHint: {
		id: 'tilus.clients.installer-hint',
		defaultMessage: 'Go through it — the desktop shortcut will move into the launcher folder.',
	},
	importTitle: { id: 'tilus.clients.import.title', defaultMessage: 'Move from another launcher' },
	importHint: {
		id: 'tilus.clients.import.hint',
		defaultMessage: 'Official launcher and TLauncher keep everything in {path}.',
	},
	importNone: {
		id: 'tilus.clients.import.none',
		defaultMessage: 'The .minecraft folder was not found on this computer.',
	},
	importTarget: { id: 'tilus.clients.import.target', defaultMessage: 'Into the instance' },
	importRun: { id: 'tilus.clients.import.run', defaultMessage: 'Move' },
	importOther: {
		id: 'tilus.clients.import.other',
		defaultMessage: 'Instances from Prism, MultiMC, CurseForge, ATLauncher and GDLauncher — in Create instance.',
	},
	partOptions: { id: 'tilus.clients.import.options', defaultMessage: 'Settings and controls' },
	partServers: { id: 'tilus.clients.import.servers', defaultMessage: 'Server list' },
	partResourcepacks: { id: 'tilus.clients.import.resourcepacks', defaultMessage: 'Resource packs' },
	partShaderpacks: { id: 'tilus.clients.import.shaderpacks', defaultMessage: 'Shaders' },
	partSaves: { id: 'tilus.clients.import.saves', defaultMessage: 'Worlds' },
	partScreenshots: { id: 'tilus.clients.import.screenshots', defaultMessage: 'Screenshots' },
	imported: { id: 'tilus.clients.import.done', defaultMessage: 'Moved: {copied} files' },
	importedSkipped: {
		id: 'tilus.clients.import.skipped',
		defaultMessage: '{skipped} files were already in the instance and stayed as they were.',
	},
})

const openDescriptions: Record<string, (typeof messages)[keyof typeof messages]> = {
	'tilus-pvp': messages.tilusPvp,
	axolotlclient: messages.axolotlclient,
	essential: messages.essential,
}
const externalDescriptions: Record<string, (typeof messages)[keyof typeof messages]> = {
	lunar: messages.lunar,
	dawn: messages.dawn,
	labymod: messages.labymod,
	badlion: messages.badlion,
}
</script>

<template>
	<div class="tilus-clients">
		<h1 class="tilus-clients__title">{{ formatMessage(messages.title) }}</h1>

		<section class="tilus-clients__panel">
			<h2 class="player-section-title">{{ formatMessage(messages.openTitle) }}</h2>
			<p class="tilus-clients__hint">
				{{ formatMessage(messages.openHint, { address: server.address }) }}
			</p>
			<div class="tilus-clients__grid">
				<article v-for="client in OPEN_CLIENTS" :key="client.id" class="tilus-client">
					<img :src="client.icon" alt="" class="tilus-client__icon" />
					<div class="tilus-client__body">
						<h3 class="tilus-client__name">{{ client.name }}</h3>
						<p class="tilus-client__text">{{ formatMessage(openDescriptions[client.id]) }}</p>
					</div>
					<button class="player-button" :disabled="!!progress[client.id]" @click="playOpen(client)">
						<SpinnerIcon v-if="progress[client.id]" class="animate-spin" />
						<PlayIcon v-else-if="instanceOf(client)" />
						<DownloadIcon v-else />
						{{
							progress[client.id] ??
							formatMessage(instanceOf(client) ? messages.play : messages.install)
						}}
					</button>
				</article>
			</div>
		</section>

		<section class="tilus-clients__panel">
			<h2 class="player-section-title">{{ formatMessage(messages.externalTitle) }}</h2>
			<p class="tilus-clients__hint">
				{{ formatMessage(messages.externalHint, { address: server.address }) }}
			</p>
			<div class="tilus-clients__grid">
				<article v-for="client in EXTERNAL_CLIENTS" :key="client.id" class="tilus-client">
					<div class="tilus-client__body">
						<h3 class="tilus-client__name">{{ client.name }}</h3>
						<p class="tilus-client__text">{{ formatMessage(externalDescriptions[client.id]) }}</p>
					</div>
					<div class="tilus-client__actions">
						<button
							v-if="externalState.get(client.id)?.installed"
							class="player-button"
							@click="launchExternal(client)"
						>
							<PlayIcon />
							{{ formatMessage(messages.launch) }}
						</button>
						<button
							v-else-if="externalState.get(client.id)?.downloadable"
							class="player-button"
							:disabled="externalBusy[client.id]"
							@click="installExternal(client)"
						>
							<SpinnerIcon v-if="externalBusy[client.id]" class="animate-spin" />
							<DownloadIcon v-else />
							{{ formatMessage(messages.installExternal) }}
						</button>
						<button v-else class="player-button" @click="openUrl(client.site)">
							<ExternalIcon />
							{{ formatMessage(messages.openSite) }}
						</button>
					</div>
				</article>
			</div>
			<button class="player-chip tilus-clients__copy" @click="copyAddress">
				<CopyIcon />
				{{ formatMessage(messages.copyAddress) }}
			</button>
		</section>

		<section class="tilus-clients__panel">
			<h2 class="player-section-title">{{ formatMessage(messages.importTitle) }}</h2>
			<template v-if="dotMinecraft.data.value">
				<p class="tilus-clients__hint">
					{{ formatMessage(messages.importHint, { path: dotMinecraft.data.value.path }) }}
				</p>
				<div class="tilus-import">
					<label v-for="row in importRows" :key="row.part" class="tilus-import__row">
						<input v-model="importParts[row.part]" type="checkbox" />
						<span>{{ formatMessage(row.label) }}</span>
						<span v-if="row.count" class="tilus-import__count">{{ row.count }}</span>
					</label>
				</div>
				<div class="tilus-import__go">
					<label class="tilus-import__target">
						{{ formatMessage(messages.importTarget) }}
						<select v-model="importTarget">
							<option v-for="instance in instances" :key="instance.id" :value="instance.id">
								{{ instance.name }}
							</option>
						</select>
					</label>
					<button class="player-button" :disabled="importing || !importTarget" @click="runImport">
						<SpinnerIcon v-if="importing" class="animate-spin" />
						<ImportIcon v-else />
						{{ formatMessage(messages.importRun) }}
					</button>
				</div>
			</template>
			<p v-else-if="!dotMinecraft.isLoading.value" class="tilus-clients__hint">
				{{ formatMessage(messages.importNone) }}
			</p>
			<button class="player-chip tilus-clients__copy" @click="showCreationModal?.()">
				<ImportIcon />
				{{ formatMessage(messages.importOther) }}
			</button>
		</section>
	</div>
</template>

<style scoped lang="scss">
.tilus-clients {
	display: flex;
	flex-direction: column;
	gap: 16px;
	max-width: 1100px;
	margin: 0 auto;
	padding: 24px;
}

.tilus-clients__title {
	margin: 0;
	font-size: 28px;
	font-weight: 800;
	color: var(--color-contrast);
}

.tilus-clients__panel {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 18px;
	border: 1px solid var(--tilus-panel-border);
	border-radius: 20px;
	background-color: var(--tilus-panel);
}

.tilus-clients__hint {
	margin: 0;
	font-size: 13px;
	color: var(--color-secondary);
}

.tilus-clients__grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
	gap: 12px;
}

.tilus-client {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 14px;
	border: 1px solid var(--tilus-panel-border);
	border-radius: 16px;
	background-color: var(--color-bg);

	.player-button {
		margin-top: auto;
	}
}

.tilus-client__icon {
	width: 48px;
	height: 48px;
	border-radius: 12px;
	object-fit: cover;
}

.tilus-client__body {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.tilus-client__name {
	margin: 0;
	font-size: 16px;
	font-weight: 700;
	color: var(--color-contrast);
}

.tilus-client__text {
	margin: 0;
	font-size: 13px;
	line-height: 1.4;
	color: var(--color-secondary);
}

.tilus-client__actions {
	display: flex;
	margin-top: auto;

	.player-button {
		flex: 1;
	}
}

.tilus-clients__copy {
	align-self: flex-start;
}

.tilus-import {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	gap: 8px;
}

.tilus-import__row {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 10px 12px;
	border-radius: 12px;
	background-color: var(--color-bg);
	font-size: 14px;
	cursor: pointer;
}

.tilus-import__count {
	margin-left: auto;
	font-size: 12px;
	color: var(--color-secondary);
}

.tilus-import__go {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 12px;
}

.tilus-import__target {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 14px;
	color: var(--color-secondary);

	select {
		padding: 8px 10px;
		border-radius: 10px;
	}
}
</style>
