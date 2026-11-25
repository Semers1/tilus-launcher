<script setup lang="ts">
import { PlusIcon } from '@modrinth/assets'
import { defineMessages, useVIntl } from '@modrinth/ui'
import { useRouter } from 'vue-router'

import type { GameInstance } from '@/helpers/types'

import PlayerCover from './PlayerCover.vue'

/** Instances side by side like albums: a click makes one the current instance, a double click opens it. */
defineProps<{
	instances: GameInstance[]
	currentId: string | undefined
	isRunning: (instanceId: string) => boolean
}>()
const emit = defineEmits<{ pick: [instanceId: string]; create: [] }>()

const { formatMessage } = useVIntl()
const router = useRouter()

function scrollSideways(event: WheelEvent) {
	const shelf = event.currentTarget as HTMLElement
	if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || shelf.scrollWidth <= shelf.clientWidth)
		return
	event.preventDefault()
	shelf.scrollLeft += event.deltaY
}

const messages = defineMessages({
	title: { id: 'tilus.player.shelf.title', defaultMessage: 'My instances' },
	create: { id: 'tilus.player.shelf.create', defaultMessage: 'New instance' },
	running: { id: 'tilus.player.shelf.running', defaultMessage: 'running' },
})
</script>

<template>
	<section class="player-shelf">
		<h2 class="player-section-title">{{ formatMessage(messages.title) }}</h2>
		<div class="player-shelf__row" @wheel="scrollSideways">
			<button
				v-for="instance in instances"
				:key="instance.id"
				class="player-shelf__item"
				:class="{ 'player-shelf__item--current': instance.id === currentId }"
				:aria-pressed="instance.id === currentId"
				@click="emit('pick', instance.id)"
				@dblclick="router.push(`/instance/${encodeURIComponent(instance.id)}`)"
			>
				<PlayerCover :instance="instance" :size="112" />
				<span class="player-shelf__name">{{ instance.name }}</span>
				<span class="player-shelf__meta">
					<template v-if="isRunning(instance.id)">
						<span class="player-live-dot" aria-hidden="true" />
						{{ formatMessage(messages.running) }}
					</template>
					<template v-else>{{ instance.game_version }}</template>
				</span>
			</button>
			<button class="player-shelf__item player-shelf__item--new" @click="emit('create')">
				<span class="player-shelf__plus"><PlusIcon /></span>
				<span class="player-shelf__name">{{ formatMessage(messages.create) }}</span>
			</button>
		</div>
	</section>
</template>
