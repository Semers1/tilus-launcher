<script setup lang="ts">
import { CopyIcon, PlayIcon, PlusIcon, SpinnerIcon } from '@modrinth/assets'
import { defineMessages, injectNotificationManager, useVIntl } from '@modrinth/ui'
import { autoToHTML } from '@sfirew/minecraft-motd-parser'
import { useQuery } from '@tanstack/vue-query'
import { computed, ref } from 'vue'

import type { GameInstance } from '@/helpers/types'
import { get_server_status, start_join_server } from '@/helpers/worlds'

import { TILUS_SERVERS } from '../servers'

/** The live tilus.ru card of the home page: who is online, the MOTD and a button that joins in the current instance. */
const props = defineProps<{ instance: GameInstance | undefined; running: boolean }>()
const emit = defineEmits<{ create: [] }>()

const { formatMessage } = useVIntl()
const { handleError, addNotification } = injectNotificationManager()

const server = TILUS_SERVERS[0]
const status = useQuery({
	queryKey: ['tilus-server-status', server.address],
	queryFn: () => get_server_status(server.address),
	refetchInterval: 60_000,
	staleTime: 30_000,
	retry: false,
})

const joining = ref(false)
const players = computed(() => status.data.value?.players)
const motd = computed(() => {
	const description = status.data.value?.description
	return description ? autoToHTML(description) : null
})
const canJoin = computed(
	() =>
		!!props.instance &&
		!props.running &&
		!props.instance.quarantined &&
		props.instance.install_stage === 'installed',
)

async function join() {
	if (!props.instance || !canJoin.value || joining.value) return
	joining.value = true
	await start_join_server(props.instance.id, server.address).catch(handleError)
	joining.value = false
}

async function copyAddress() {
	await navigator.clipboard.writeText(server.address).catch(() => {})
	addNotification({ title: formatMessage(messages.copied, { address: server.address }), type: 'success' })
}

const messages = defineMessages({
	now: { id: 'tilus.player.server.now', defaultMessage: 'Now on {server}' },
	online: { id: 'tilus.player.server.online', defaultMessage: '/ {max} online' },
	offline: { id: 'tilus.servers.offline', defaultMessage: 'Server is not responding' },
	play: { id: 'tilus.player.server.play', defaultMessage: 'Play on the server' },
	ping: { id: 'tilus.servers.ping', defaultMessage: '{ping} ms' },
	via: { id: 'tilus.servers.via', defaultMessage: 'in {instance}' },
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
	<section class="player-server">
		<div class="player-server__head">
			<span
				class="player-live-dot"
				:class="{ 'player-live-dot--off': !status.isLoading.value && !status.data.value }"
				aria-hidden="true"
			/>
			{{ formatMessage(messages.now, { server: server.name }) }}
			<img
				v-if="status.data.value?.favicon"
				:src="status.data.value.favicon"
				alt=""
				class="player-server__favicon"
			/>
		</div>

		<div v-if="status.isLoading.value" class="player-server__count">
			<SpinnerIcon class="size-6 animate-spin text-secondary" />
		</div>
		<div v-else-if="players" class="player-server__count">
			{{ players.online }}
			<small>{{ formatMessage(messages.online, { max: players.max }) }}</small>
		</div>
		<p v-else class="player-server__offline">{{ formatMessage(messages.offline) }}</p>

		<!-- eslint-disable-next-line vue/no-v-html -->
		<div v-if="motd" class="player-server__motd motd-renderer font-minecraft" v-html="motd" />

		<template v-if="instance">
			<div class="player-server__actions">
				<button class="player-button" :disabled="!canJoin || joining" @click="join">
					<SpinnerIcon v-if="joining" class="animate-spin" />
					<PlayIcon v-else />
					{{ formatMessage(messages.play) }}
				</button>
				<button
					class="player-chip player-chip--icon"
					:aria-label="formatMessage(messages.copyAddress)"
					:title="formatMessage(messages.copyAddress)"
					@click="copyAddress"
				>
					<CopyIcon />
				</button>
			</div>
			<span class="player-server__foot">
				<template v-if="status.data.value?.ping">
					{{ formatMessage(messages.ping, { ping: status.data.value.ping }) }} ·
				</template>
				{{ formatMessage(messages.via, { instance: instance.name }) }}
			</span>
		</template>
		<template v-else>
			<span class="player-server__foot">{{ formatMessage(messages.noInstance) }}</span>
			<button class="player-button" @click="emit('create')">
				<PlusIcon />
				{{ formatMessage(messages.createInstance) }}
			</button>
		</template>
	</section>
</template>
