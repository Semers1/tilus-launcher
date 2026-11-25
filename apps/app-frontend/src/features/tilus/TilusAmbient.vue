<script setup lang="ts">
import { Effect, getCurrentWindow } from '@tauri-apps/api/window'
import { computed, onMounted, ref, shallowRef, watch, watchEffect } from 'vue'
import { useRoute } from 'vue-router'

import { useAppEvent } from '@/composables/use-app-event'
import { isDarkTheme, useTheme } from '@/composables/use-theme'
import { get, getInstanceIconUrl, list } from '@/helpers/instance'
import { get_all as getRunningProcesses } from '@/helpers/process.js'
import type { GameInstance, InstanceIconConfig } from '@/helpers/types'

import {
	accentFrom,
	extractPalette,
	type Rgb,
	rgbHex,
	rgbToHsl,
	rgbTriplet,
	TILUS_PALETTE,
} from './palette'
import PlayerBar from './player/PlayerBar.vue'
import { currentInstance } from './player/state'

/**
 * Glass background of the window, tinted by the "current" instance: the one whose page is open, otherwise the one
 * the home player shows (picked on the shelf or last played), otherwise the one that is running. Its icon is blurred
 * into the background, its two main colours glow from the corners and the brand colour of the whole app follows the
 * first of them. With glass on, the window also gets the player layout and its bottom bar.
 */
const route = useRoute()
const theme = useTheme()

const runningInstanceId = ref<string | null>(null)
const instances = shallowRef<GameInstance[]>([])
const iconRevision = ref(0)
const routeInstanceId = computed(() =>
	route.path.startsWith('/instance/') ? String(route.params.id ?? '') || null : null,
)
const currentInstanceId = computed(
	() =>
		routeInstanceId.value ?? currentInstance(instances.value)?.id ?? runningInstanceId.value,
)

const art = shallowRef<string | null>(null)
const palette = shallowRef<[Rgb, Rgb] | null>(null)

const glass = computed(() => theme.active !== 'retro')
/** Windows acrylic behind the whole window; follows the "advanced rendering" setting. */
const windowGlass = computed(() => glass.value && theme.advancedRendering)

type RunningProcess = { instance_id: string; start_time: string }

async function refreshRunning() {
	const processes = ((await getRunningProcesses().catch(() => [])) ?? []) as RunningProcess[]
	const latest = [...processes].sort((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time))[0]
	runningInstanceId.value = latest?.instance_id ?? null
}

async function refreshInstances() {
	instances.value = ((await list().catch(() => [])) ?? []) as GameInstance[]
}

function parseHex(value: string | undefined): Rgb | null {
	const hex = value?.trim().replace(/^#/, '') ?? ''
	const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex.slice(0, 6)
	if (!/^[0-9a-f]{6}$/i.test(full)) return null
	return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb
}

function paletteFromIconConfig(config: InstanceIconConfig | null | undefined): [Rgb, Rgb] | null {
	const background = config?.background
	if (!background) return null
	const colours =
		background.type === 'color'
			? [parseHex(background.value)]
			: [parseHex(background.top_color), parseHex(background.bottom_color)]
	const vivid = colours.filter((c): c is Rgb => !!c && rgbToHsl(c)[1] > 0.2)
	if (!vivid.length) return null
	return [vivid[0], vivid[1] ?? vivid[0]]
}

let request = 0
watch(
	[currentInstanceId, iconRevision],
	async ([instanceId]) => {
		const token = ++request
		if (!instanceId) {
			art.value = null
			palette.value = null
			return
		}
		const instance = await get(instanceId).catch(() => null)
		if (token !== request) return
		const url = getInstanceIconUrl(instance?.icon_path)
		const colours = (url ? await extractPalette(url) : null) ?? paletteFromIconConfig(instance?.icon_config)
		if (token !== request) return
		art.value = url
		palette.value = colours
	},
	{ immediate: true },
)

useAppEvent('process', (event) => {
	if (event.event === 'launched') runningInstanceId.value = event.instance_id
	else {
		void refreshRunning()
		void refreshInstances()
	}
})

useAppEvent('instance', (event) => {
	if (event.event === 'edited' && event.instance_id === currentInstanceId.value) iconRevision.value++
	if (event.event === 'created' || event.event === 'removed' || event.event === 'edited')
		void refreshInstances()
})

onMounted(() => {
	void refreshRunning()
	void refreshInstances()
})

watch(
	windowGlass,
	async (enabled) => {
		document.documentElement.classList.toggle('tilus-window-glass', enabled)
		const appWindow = getCurrentWindow()
		try {
			if (enabled) await appWindow.setEffects({ effects: [Effect.Acrylic] })
			else await appWindow.clearEffects()
		} catch (error) {
			console.warn('Could not change window effects', error)
			document.documentElement.classList.remove('tilus-window-glass')
		}
	},
	{ immediate: true },
)

const BRAND_PROPERTIES = [
	'--color-brand',
	'--color-brand-highlight',
	'--color-brand-shadow',
	'--color-accent-contrast',
] as const

watchEffect(() => {
	const html = document.documentElement
	const [first, second] = palette.value ?? TILUS_PALETTE
	html.style.setProperty('--tilus-glow-1', `rgb(${rgbTriplet(first)})`)
	html.style.setProperty('--tilus-glow-2', `rgb(${rgbTriplet(second)})`)
	html.classList.toggle('tilus-glass', glass.value)
	html.classList.toggle('tilus-glass-lite', glass.value && !theme.advancedRendering)
	html.classList.toggle('tilus-player', glass.value)

	if (!palette.value || theme.active === 'retro') {
		for (const property of BRAND_PROPERTIES) html.style.removeProperty(property)
		return
	}
	const { accent, contrast } = accentFrom(first, isDarkTheme(theme.active))
	html.style.setProperty('--color-brand', rgbHex(accent))
	html.style.setProperty('--color-brand-highlight', `rgb(${rgbTriplet(accent)} / 0.25)`)
	html.style.setProperty('--color-brand-shadow', `rgb(${rgbTriplet(accent)} / 0.7)`)
	html.style.setProperty('--color-accent-contrast', contrast)
})
</script>

<template>
	<div v-if="glass" class="tilus-ambient" aria-hidden="true">
		<Transition name="tilus-ambient-fade">
			<div
				v-if="art"
				:key="art"
				class="tilus-ambient-art"
				:style="{ backgroundImage: `url(&quot;${art}&quot;)` }"
			/>
		</Transition>
		<div class="tilus-ambient-glow" />
	</div>
	<PlayerBar v-if="glass" />
</template>

<style scoped lang="scss">
.tilus-ambient {
	position: fixed;
	inset: 0;
	z-index: 0;
	overflow: hidden;
	pointer-events: none;
	background: var(--tilus-ambient-base, #0a0d13);
}

.tilus-ambient-art {
	position: absolute;
	inset: -30%;
	background-position: center;
	background-size: cover;
	filter: blur(90px) saturate(1.7) brightness(0.8);
	opacity: var(--tilus-ambient-art-opacity, 0.5);
}

:global(html.tilus-glass-lite) .tilus-ambient-art {
	display: none;
}

.tilus-ambient-glow {
	position: absolute;
	inset: 0;
	background:
		radial-gradient(70% 65% at 0% 0%, color-mix(in srgb, var(--tilus-glow-1) 40%, transparent), transparent 72%),
		radial-gradient(
			60% 70% at 100% 100%,
			color-mix(in srgb, var(--tilus-glow-2) 32%, transparent),
			transparent 72%
		),
		radial-gradient(45% 45% at 100% 0%, color-mix(in srgb, var(--tilus-glow-2) 14%, transparent), transparent 70%);
	transition:
		--tilus-glow-1 0.8s ease,
		--tilus-glow-2 0.8s ease;
}

.tilus-ambient-fade-enter-active,
.tilus-ambient-fade-leave-active {
	transition: opacity 0.8s ease;
}

.tilus-ambient-fade-enter-from,
.tilus-ambient-fade-leave-to {
	opacity: 0;
}
</style>
