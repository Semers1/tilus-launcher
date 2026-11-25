<script setup lang="ts">
import { defineMessages, useVIntl } from '@modrinth/ui'
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'

import LibrarySection from '@/components/ui/library/index.vue'
import RecentWorldsList from '@/components/ui/world/RecentWorldsList.vue'
import { useAppSettings } from '@/composables/use-app-settings.ts'
import type { GameInstance } from '@/helpers/types'

import AutotuneModal from '../AutotuneModal.vue'
import PlayerHero from './PlayerHero.vue'
import PlayerServerCard from './PlayerServerCard.vue'
import PlayerShelf from './PlayerShelf.vue'
import { byRecentPlay, currentInstance, pickInstance, useRunningInstances } from './state'

/** The home page of the player layout: the current instance, the shelf of instances and the server. */
const props = defineProps<{ instances: GameInstance[] }>()

const { formatMessage } = useVIntl()
const appSettings = useAppSettings()
const showCreationModal = inject<() => void>('showCreationModal')
const autotuneModal = ref<InstanceType<typeof AutotuneModal>>()
const { isRunning } = useRunningInstances()

const recent = computed(() => byRecentPlay(props.instances))
const current = computed(() => currentInstance(props.instances))

onMounted(() => document.documentElement.classList.add('tilus-home'))
onBeforeUnmount(() => document.documentElement.classList.remove('tilus-home'))

const messages = defineMessages({
	library: { id: 'tilus.player.library', defaultMessage: 'Whole library' },
})
</script>

<template>
	<div class="player-home">
		<div class="player-home__top">
			<div class="player-home__main">
				<PlayerHero
					v-if="current"
					:instance="current"
					:running="isRunning(current.id)"
					@autotune="(id) => autotuneModal?.show(id)"
				/>
				<PlayerShelf
					:instances="recent"
					:current-id="current?.id"
					:is-running="isRunning"
					@pick="pickInstance"
					@create="showCreationModal?.()"
				/>
			</div>
			<aside class="player-home__side">
				<PlayerServerCard
					:instance="current"
					:running="isRunning(current?.id ?? '')"
					@create="showCreationModal?.()"
				/>
			</aside>
		</div>
		<RecentWorldsList
			v-if="recent.length > 0 && appSettings.showJumpIn"
			:recent-instances="recent"
		/>
		<section class="player-library">
			<h2 class="player-section-title">{{ formatMessage(messages.library) }}</h2>
			<LibrarySection :instances="instances" />
		</section>
		<AutotuneModal ref="autotuneModal" />
	</div>
</template>
