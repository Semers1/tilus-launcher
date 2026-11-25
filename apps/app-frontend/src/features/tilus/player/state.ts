import { onMounted, ref } from 'vue'

import { useAppEvent } from '@/composables/use-app-event'
import { get_all as getRunningProcesses } from '@/helpers/process.js'
import type { GameInstance } from '@/helpers/types'

const PICKED_INSTANCE_KEY = 'tilus-picked-instance'

function readPicked(): string | null {
	try {
		return localStorage.getItem(PICKED_INSTANCE_KEY)
	} catch {
		return null
	}
}

/**
 * The instance the player shows on the home page and tints the window with; null means the last played one.
 * It is what the user picked on the shelf, kept between launches.
 */
export const pickedInstanceId = ref<string | null>(readPicked())

export function pickInstance(instanceId: string) {
	pickedInstanceId.value = instanceId
	try {
		localStorage.setItem(PICKED_INSTANCE_KEY, instanceId)
	} catch {
		// Storage can be blocked; the pick then only lasts until the app closes.
	}
}

/** Instances by the time they were last played (or created), most recent first. */
export function byRecentPlay(instances: GameInstance[]): GameInstance[] {
	const time = (instance: GameInstance) =>
		Date.parse(String(instance.last_played ?? instance.created ?? 0)) || 0
	return [...instances].sort((a, b) => time(b) - time(a))
}

/** The picked instance when it still exists, otherwise the last played one. */
export function currentInstance(instances: GameInstance[]): GameInstance | undefined {
	return (
		instances.find((instance) => instance.id === pickedInstanceId.value) ?? byRecentPlay(instances)[0]
	)
}

type RunningProcess = { instance_id: string; start_time: string }

/** Ids of the instances whose game is running right now, kept in sync with process events. */
export function useRunningInstances() {
	const running = ref<RunningProcess[]>([])

	async function refresh() {
		running.value = ((await getRunningProcesses().catch(() => [])) ?? []) as RunningProcess[]
	}

	onMounted(() => void refresh())
	useAppEvent('process', () => void refresh())

	return {
		running,
		isRunning: (instanceId: string | undefined) =>
			!!instanceId && running.value.some((process) => process.instance_id === instanceId),
	}
}

/** Total playtime of an instance in seconds. */
export function playtimeSeconds(instance: GameInstance): number {
	return (instance.submitted_time_played ?? 0) + (instance.recent_time_played ?? 0)
}
