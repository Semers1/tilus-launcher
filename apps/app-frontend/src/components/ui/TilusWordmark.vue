<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { useAppEvent } from '@/composables/use-app-event'
import { downloadProgress } from '@/features/tilus/activity'
import { get_all as getRunningProcesses } from '@/helpers/process.js'

/**
 * The TILUS wordmark in the title bar. Water stands in the lower part of its letters; while something
 * downloads it rises with the overall progress and its surface rolls, while the game runs the surface rolls at
 * a calm level, and otherwise the water stands still, so it costs nothing when idle.
 */
const runningGames = ref(0)

async function refreshRunning() {
	const processes = ((await getRunningProcesses().catch(() => [])) ?? []) as unknown[]
	runningGames.value = processes.length
}

useAppEvent('process', () => void refreshRunning())
onMounted(() => void refreshRunning())

const downloading = computed(() => downloadProgress.value !== null)
const level = computed(() => {
	if (downloading.value) return 14 + 74 * Math.min(1, Math.max(0, downloadProgress.value ?? 0))
	return runningGames.value > 0 ? 58 : 44
})
</script>

<template>
	<span
		class="tilus-mark"
		:class="{ 'tilus-mark--moving': downloading || runningGames > 0 }"
		:style="{ '--tilus-water-level': `${Math.round(level)}%` }"
		role="img"
		aria-label="Tilus"
		>TILUS</span
	>
</template>
