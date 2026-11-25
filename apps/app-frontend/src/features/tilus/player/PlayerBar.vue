<script setup lang="ts">
import { ChevronUpIcon } from '@modrinth/assets'
import { Avatar, defineMessages, useVIntl } from '@modrinth/ui'
import { useQuery } from '@tanstack/vue-query'
import { onClickOutside, useEventListener, useIntervalFn } from '@vueuse/core'
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'

import { useAppEvent } from '@/composables/use-app-event'
import AccountsCard from '@/features/minecraft-accounts/accounts-card.vue'
import { get_default_user, users } from '@/helpers/auth'
import type { GameInstance } from '@/helpers/types'
import { instanceListQueryOptions } from '@/pages/instance/query-options'

import { downloadProgress } from '../activity'
import PlayerCover from './PlayerCover.vue'
import { currentInstance, useRunningInstances } from './state'

/**
 * The strip along the bottom of the window, like the transport bar of a music player: what is current or running,
 * the download progress as a filling wave and the Minecraft account.
 */
const { formatMessage } = useVIntl()
const instancesQuery = useQuery(instanceListQueryOptions())
const instances = computed<GameInstance[]>(() => instancesQuery.data.value ?? [])
const { running } = useRunningInstances()

const runningProcess = computed(() =>
	[...running.value].sort((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time))[0],
)
const shown = computed(
	() =>
		instances.value.find((instance) => instance.id === runningProcess.value?.instance_id) ??
		currentInstance(instances.value),
)

const now = ref(Date.now())
useIntervalFn(() => (now.value = Date.now()), 30_000)
const elapsed = computed(() => {
	if (!runningProcess.value) return ''
	const minutes = Math.max(0, Math.floor((now.value - Date.parse(runningProcess.value.start_time)) / 60_000))
	return minutes >= 60
		? formatMessage(messages.hoursMinutes, { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
		: formatMessage(messages.minutes, { minutes })
})

const progress = computed(() => downloadProgress.value)
const status = computed(() => {
	if (progress.value !== null)
		return formatMessage(messages.downloading, { percent: Math.round(progress.value * 100) })
	if (runningProcess.value) return formatMessage(messages.playing, { time: elapsed.value })
	return shown.value ? formatMessage(messages.ready) : formatMessage(messages.noInstance)
})

type Account = { profile: { id: string; name: string }; offline?: boolean }
const account = ref<Account | null>(null)

async function refreshAccount() {
	const [defaultId, list] = await Promise.all([
		get_default_user().catch(() => null),
		users().catch(() => []),
	])
	account.value = ((list ?? []) as Account[]).find((entry) => entry.profile.id === defaultId) ?? null
}

onMounted(() => void refreshAccount())
useAppEvent('onboarding_checklist', () => void refreshAccount())
useEventListener(window, 'focus', () => void refreshAccount())

const accountsOpen = ref(false)
const accountsPanel = useTemplateRef('accountsPanel')
const accountButton = useTemplateRef('accountButton')
onClickOutside(accountsPanel, () => (accountsOpen.value = false), { ignore: [accountButton] })
watch(accountsOpen, (open) => {
	if (!open) void refreshAccount()
})

const messages = defineMessages({
	ready: { id: 'tilus.player.bar.ready', defaultMessage: 'Ready to play' },
	noInstance: { id: 'tilus.player.bar.no-instance', defaultMessage: 'Create an instance to start' },
	playing: { id: 'tilus.player.bar.playing', defaultMessage: 'In game · {time}' },
	downloading: { id: 'tilus.player.bar.downloading', defaultMessage: 'Downloading · {percent}%' },
	minutes: { id: 'tilus.player.bar.minutes', defaultMessage: '{minutes} min' },
	hoursMinutes: { id: 'tilus.player.bar.hours-minutes', defaultMessage: '{hours} h {minutes} min' },
	signIn: { id: 'tilus.player.bar.sign-in', defaultMessage: 'Sign in' },
	offline: { id: 'minecraft-account.offline-badge', defaultMessage: 'nick' },
	microsoft: { id: 'tilus.player.bar.microsoft', defaultMessage: 'Microsoft' },
})
</script>

<template>
	<footer class="player-bar">
		<div class="player-bar__now">
			<PlayerCover v-if="shown" :instance="shown" :size="38" />
			<div class="player-bar__text">
				<span class="player-bar__name">{{ shown?.name ?? 'Tilus Launcher' }}</span>
				<span class="player-bar__status">
					<span v-if="runningProcess" class="player-live-dot" aria-hidden="true" />
					{{ status }}
				</span>
			</div>
		</div>
		<div
			class="player-bar__track"
			:class="{
				'player-bar__track--active': progress !== null,
				'player-bar__track--playing': progress === null && !!runningProcess,
			}"
			aria-hidden="true"
		>
			<div class="player-bar__fill" :style="{ width: `${Math.round((progress ?? 1) * 100)}%` }" />
		</div>
		<div class="player-bar__account-wrap">
			<button
				ref="accountButton"
				class="player-chip player-bar__account"
				:aria-expanded="accountsOpen"
				@click="accountsOpen = !accountsOpen"
			>
				<Avatar
					v-if="account"
					size="22px"
					:src="`https://mc-heads.net/avatar/${account.profile.id}/64`"
					:alt="account.profile.name"
				/>
				<span>{{ account?.profile.name ?? formatMessage(messages.signIn) }}</span>
				<span v-if="account" class="player-bar__badge">
					{{ formatMessage(account.offline ? messages.offline : messages.microsoft) }}
				</span>
				<ChevronUpIcon class="player-bar__chevron" :class="{ 'rotate-180': !accountsOpen }" />
			</button>
			<Transition name="player-pop">
				<div v-if="accountsOpen" ref="accountsPanel" class="player-bar__accounts">
					<Suspense>
						<AccountsCard expanded @change="refreshAccount" />
					</Suspense>
				</div>
			</Transition>
		</div>
	</footer>
</template>
