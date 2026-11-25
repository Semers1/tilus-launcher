<script setup lang="ts">
import {
	DownloadIcon,
	ExternalIcon,
	GaugeIcon,
	PlayIcon,
	ServerIcon,
	SpinnerIcon,
	StopCircleIcon,
} from '@modrinth/assets'
import {
	commonMessages,
	defineMessages,
	injectNotificationManager,
	useRelativeTime,
	useVIntl,
} from '@modrinth/ui'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { handleSevereError } from '@/composables/use-error.js'
import { install_existing_instance } from '@/helpers/install'
import { kill, run } from '@/helpers/instance'
import type { GameInstance } from '@/helpers/types'
import { start_join_server } from '@/helpers/worlds'

import { TILUS_SERVERS } from '../servers'
import PlayerCover from './PlayerCover.vue'
import { playtimeSeconds } from './state'

/** "Now playing" for the home page: the current instance as a big cover with a round Play button. */
const props = defineProps<{ instance: GameInstance; running: boolean }>()
const emit = defineEmits<{ autotune: [instanceId: string] }>()

const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()
const formatRelativeTime = useRelativeTime()
const router = useRouter()

const starting = ref(false)
const stopping = ref(false)
const joining = ref(false)

const server = TILUS_SERVERS[0]
const installing = computed(() => props.instance.install_stage.includes('installing'))
const needsInstall = computed(
	() => !installing.value && props.instance.install_stage !== 'installed',
)
const busy = computed(() => starting.value || stopping.value || joining.value || installing.value)

const LOADER_NAMES: Record<string, string> = {
	vanilla: 'Vanilla',
	fabric: 'Fabric',
	quilt: 'Quilt',
	forge: 'Forge',
	neoforge: 'NeoForge',
}

const details = computed(() => {
	const loader = LOADER_NAMES[props.instance.loader] ?? props.instance.loader
	const parts = [
		props.instance.loader === 'vanilla'
			? loader
			: [loader, props.instance.loader_version].filter(Boolean).join(' '),
		formatMessage(messages.minecraft, { version: props.instance.game_version }),
	]
	const played = playtimeLabel.value
	if (played) parts.push(formatMessage(messages.played, { time: played }))
	return parts.join(' · ')
})

const playtimeLabel = computed(() => {
	const seconds = playtimeSeconds(props.instance)
	const hours = Math.floor(seconds / 3600)
	if (hours >= 1) return formatMessage(messages.hours, { count: hours })
	const minutes = Math.floor(seconds / 60)
	return minutes >= 1 ? formatMessage(messages.minutes, { count: minutes }) : null
})

const kicker = computed(() => {
	if (props.running) return formatMessage(messages.playingNow)
	if (props.instance.last_played)
		return formatMessage(messages.lastPlayed, {
			time: formatRelativeTime(props.instance.last_played),
		})
	return formatMessage(messages.neverPlayed)
})

async function play() {
	if (busy.value || props.instance.quarantined) return
	if (props.running) {
		stopping.value = true
		await kill(props.instance.id).catch(handleError)
		stopping.value = false
		return
	}
	if (needsInstall.value) {
		await install_existing_instance(props.instance.id, false).catch(handleError)
		return
	}
	starting.value = true
	await run(props.instance.id).catch((error) =>
		handleSevereError(error, { instanceId: props.instance.id }),
	)
	starting.value = false
}

async function joinServer() {
	if (busy.value || props.running || needsInstall.value || props.instance.quarantined) return
	joining.value = true
	await start_join_server(props.instance.id, server.address).catch(handleError)
	joining.value = false
}

const messages = defineMessages({
	playingNow: { id: 'tilus.player.playing-now', defaultMessage: 'Playing now' },
	lastPlayed: { id: 'tilus.player.last-played', defaultMessage: 'Instance · played {time}' },
	neverPlayed: { id: 'tilus.player.never-played', defaultMessage: 'Instance · not played yet' },
	minecraft: { id: 'tilus.player.minecraft', defaultMessage: 'Minecraft {version}' },
	played: { id: 'tilus.player.played', defaultMessage: 'played {time}' },
	hours: {
		id: 'tilus.playtime.hours',
		defaultMessage: '{count, plural, one {# hour} other {# hours}}',
	},
	minutes: {
		id: 'tilus.playtime.minutes',
		defaultMessage: '{count, plural, one {# minute} other {# minutes}}',
	},
	install: { id: 'tilus.player.install', defaultMessage: 'Install' },
	joinServer: { id: 'tilus.player.join-server', defaultMessage: 'On {server}' },
	autotune: { id: 'tilus.player.autotune', defaultMessage: 'Autotune' },
	open: { id: 'tilus.player.open', defaultMessage: 'Open instance' },
})
</script>

<template>
	<section class="player-hero">
		<PlayerCover :instance="instance" :size="200" glow />
		<div class="player-hero__text">
			<span class="player-kicker">
				<span v-if="running" class="player-live-dot" aria-hidden="true" />
				{{ kicker }}
			</span>
			<h1 class="player-title" :title="instance.name">{{ instance.name }}</h1>
			<p class="player-details">{{ details }}</p>
			<div class="player-actions">
				<button
					class="player-play"
					:class="{ 'player-play--stop': running }"
					:disabled="busy || instance.quarantined"
					:aria-label="
						formatMessage(
							running
								? commonMessages.stopButton
								: needsInstall
									? messages.install
									: commonMessages.playButton,
						)
					"
					:title="
						formatMessage(
							running
								? commonMessages.stopButton
								: needsInstall
									? messages.install
									: commonMessages.playButton,
						)
					"
					@click="play"
				>
					<SpinnerIcon v-if="busy" class="animate-spin" />
					<StopCircleIcon v-else-if="running" />
					<DownloadIcon v-else-if="needsInstall" />
					<PlayIcon v-else class="ml-1" />
				</button>
				<button
					class="player-chip"
					:disabled="busy || running || needsInstall || instance.quarantined"
					@click="joinServer"
				>
					<ServerIcon />
					{{ formatMessage(messages.joinServer, { server: server.name }) }}
				</button>
				<button class="player-chip" @click="emit('autotune', instance.id)">
					<GaugeIcon />
					{{ formatMessage(messages.autotune) }}
				</button>
				<button
					class="player-chip player-chip--icon"
					:aria-label="formatMessage(messages.open)"
					:title="formatMessage(messages.open)"
					@click="router.push(`/instance/${encodeURIComponent(instance.id)}`)"
				>
					<ExternalIcon />
				</button>
			</div>
		</div>
	</section>
</template>
