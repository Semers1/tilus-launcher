<script setup lang="ts">
import { CopyIcon, MoreVerticalIcon, PlayIcon, PlusIcon, SpinnerIcon } from '@modrinth/assets'
import {
	Button,
	type ButtonMenuOption,
	defineMessages,
	IconButton,
	injectNotificationManager,
	TeleportOverflowMenu,
	useVIntl,
} from '@modrinth/ui'
import { autoToHTML } from '@sfirew/minecraft-motd-parser'
import { useQueries } from '@tanstack/vue-query'
import { computed, onMounted, ref } from 'vue'

import { useAppEvent } from '@/composables/use-app-event'
import { list } from '@/helpers/instance'
import type { GameInstance } from '@/helpers/types'
import { get_server_status, start_join_server } from '@/helpers/worlds'

import { TILUS_SERVERS } from './servers'

/** The sidebar block that replaces Modrinth's news: our servers with their online and a Play button. */
const emit = defineEmits<{ 'create-instance': [] }>()

const { formatMessage } = useVIntl()
const { handleError, addNotification } = injectNotificationManager()

const CHOSEN_INSTANCE_KEY = 'tilus-server-instance'

const statuses = useQueries({
	queries: TILUS_SERVERS.map((server) => ({
		queryKey: ['tilus-server-status', server.address],
		queryFn: () => get_server_status(server.address),
		refetchInterval: 60_000,
		staleTime: 30_000,
		retry: false,
	})),
})

const instances = ref<GameInstance[]>([])
const chosenId = ref<string | null>(readChosen())
const joining = ref<string | null>(null)

function readChosen(): string | null {
	try {
		return localStorage.getItem(CHOSEN_INSTANCE_KEY)
	} catch {
		return null
	}
}

async function refreshInstances() {
	instances.value = ((await list().catch(() => [])) ?? []) as GameInstance[]
}

onMounted(() => void refreshInstances())
useAppEvent('instance', () => void refreshInstances())

const lastPlayed = computed(() =>
	[...instances.value].sort(
		(a, b) => Date.parse(String(b.last_played ?? 0)) - Date.parse(String(a.last_played ?? 0)),
	)[0],
)
const instance = computed(
	() => instances.value.find((candidate) => candidate.id === chosenId.value) ?? lastPlayed.value,
)

const instanceOptions = computed<ButtonMenuOption[]>(() =>
	instances.value.map((candidate) => ({
		id: candidate.id,
		label: `${candidate.name} · ${candidate.game_version}`,
		action: () => {
			chosenId.value = candidate.id
			try {
				localStorage.setItem(CHOSEN_INSTANCE_KEY, candidate.id)
			} catch {
				// storage blocked
			}
		},
	})),
)

async function join(address: string) {
	if (!instance.value || joining.value) return
	joining.value = address
	try {
		await start_join_server(instance.value.id, address)
	} catch (error) {
		handleError(error as Error)
	} finally {
		joining.value = null
	}
}

async function copyAddress(address: string) {
	await navigator.clipboard.writeText(address).catch(() => {})
	addNotification({ title: formatMessage(messages.copied, { address }), type: 'success' })
}

function motd(index: number): string | null {
	const description = statuses.value[index]?.data?.description
	return description ? autoToHTML(description) : null
}

const messages = defineMessages({
	title: { id: 'tilus.servers.title', defaultMessage: 'Servers' },
	online: { id: 'tilus.servers.online', defaultMessage: '{online}/{max} online' },
	ping: { id: 'tilus.servers.ping', defaultMessage: '{ping} ms' },
	offline: { id: 'tilus.servers.offline', defaultMessage: 'Server is not responding' },
	play: { id: 'tilus.servers.play', defaultMessage: 'Play' },
	via: { id: 'tilus.servers.via', defaultMessage: 'in {instance}' },
	chooseInstance: { id: 'tilus.servers.choose-instance', defaultMessage: 'Choose instance' },
	noInstance: {
		id: 'tilus.servers.no-instance',
		defaultMessage: 'Create an instance to play on the server.',
	},
	createInstance: { id: 'tilus.servers.create-instance', defaultMessage: 'Create instance' },
	copyAddress: { id: 'tilus.servers.copy-address', defaultMessage: 'Copy address' },
	copied: { id: 'tilus.servers.copied', defaultMessage: 'Copied {address}' },
})
</script>

<template>
	<section class="flex flex-col gap-3 p-4">
		<h3 class="m-0 text-base font-medium text-primary">{{ formatMessage(messages.title) }}</h3>
		<article
			v-for="(server, index) in TILUS_SERVERS"
			:key="server.address"
			class="flex flex-col gap-3 rounded-2xl border border-solid border-[--brand-gradient-border] bg-[--brand-gradient-button] p-3"
		>
			<div class="flex items-center gap-3">
				<img
					v-if="statuses[index]?.data?.favicon"
					:src="statuses[index].data.favicon"
					alt=""
					class="size-12 shrink-0 rounded-lg [image-rendering:pixelated]"
				/>
				<div v-else class="size-12 shrink-0 rounded-lg bg-button-bg" />
				<div class="flex min-w-0 flex-col">
					<span class="truncate font-semibold text-contrast">{{ server.name }}</span>
					<span v-if="statuses[index]?.isLoading" class="text-sm text-secondary">
						<SpinnerIcon class="size-4 animate-spin" />
					</span>
					<span
						v-else-if="statuses[index]?.data"
						class="flex items-center gap-1.5 whitespace-nowrap text-sm text-secondary"
					>
						<span class="size-2 shrink-0 rounded-full bg-brand-green" />
						{{
							formatMessage(messages.online, {
								online: statuses[index].data.players?.online ?? 0,
								max: statuses[index].data.players?.max ?? 0,
							})
						}}
						<template v-if="statuses[index].data.ping">
							· {{ formatMessage(messages.ping, { ping: statuses[index].data.ping }) }}
						</template>
					</span>
					<span v-else class="flex items-center gap-1.5 text-sm text-secondary">
						<span class="size-2 shrink-0 rounded-full bg-brand-red" />
						{{ formatMessage(messages.offline) }}
					</span>
				</div>
			</div>
			<!-- eslint-disable-next-line vue/no-v-html -->
			<div
				v-if="motd(index)"
				class="motd-renderer font-minecraft font-normal text-sm leading-5 text-secondary"
				v-html="motd(index)"
			/>
			<template v-if="instance">
				<div class="flex items-center gap-2">
					<Button
						type="colored"
						color="brand"
						class="grow"
						:disabled="!!joining"
						@click="join(server.address)"
					>
						<SpinnerIcon v-if="joining === server.address" class="animate-spin" />
						<PlayIcon v-else />
						{{ formatMessage(messages.play) }}
					</Button>
					<TeleportOverflowMenu
						v-if="instanceOptions.length > 1"
						type="outlined"
						:label="formatMessage(messages.chooseInstance)"
						:tooltip="formatMessage(messages.chooseInstance)"
						:options="instanceOptions"
					>
						<MoreVerticalIcon />
					</TeleportOverflowMenu>
					<IconButton
						v-tooltip="formatMessage(messages.copyAddress)"
						type="outlined"
						:label="formatMessage(messages.copyAddress)"
						@click="copyAddress(server.address)"
					>
						<CopyIcon />
					</IconButton>
				</div>
				<span class="truncate text-xs text-secondary">
					{{ formatMessage(messages.via, { instance: instance.name }) }} · {{ server.address }}
				</span>
			</template>
			<template v-else>
				<span class="text-sm text-secondary">{{ formatMessage(messages.noInstance) }}</span>
				<Button type="colored" color="brand" @click="emit('create-instance')">
					<PlusIcon />
					{{ formatMessage(messages.createInstance) }}
				</Button>
			</template>
		</article>
	</section>
</template>
