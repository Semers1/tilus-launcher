<script setup lang="ts">
import { CheckIcon, CpuIcon, MemoryStickIcon, MonitorIcon, SpinnerIcon, XIcon } from '@modrinth/assets'
import {
	Button,
	commonMessages,
	defineMessages,
	injectNotificationManager,
	type MessageDescriptor,
	NewModal,
	useVIntl,
} from '@modrinth/ui'
import { computed, ref } from 'vue'

import type { GameOptionCanonicalValue } from '@/helpers/game-options'

import { type AutotuneChange, type AutotunePlan, applyAutotune, planAutotune } from './autotune'

/** Shows what autotune would change in an instance for this PC and applies it on confirmation. */
const emit = defineEmits<{ applied: [] }>()

const { formatMessage } = useVIntl()
const { handleError, addNotification } = injectNotificationManager()

const messages = defineMessages({
	header: { id: 'tilus.autotune.header', defaultMessage: 'Autotune for this PC' },
	description: {
		id: 'tilus.autotune.description',
		defaultMessage:
			'Picks memory, Java garbage collector and video settings for this instance from your hardware.',
	},
	yourPc: { id: 'tilus.autotune.your-pc', defaultMessage: 'Your PC' },
	cpu: { id: 'tilus.autotune.cpu', defaultMessage: '{name} ({threads} threads)' },
	ram: { id: 'tilus.autotune.ram', defaultMessage: '{amount} of RAM' },
	integrated: { id: 'tilus.autotune.integrated', defaultMessage: 'integrated' },
	discrete: { id: 'tilus.autotune.discrete', defaultMessage: 'discrete, {memory}' },
	noGpu: { id: 'tilus.autotune.no-gpu', defaultMessage: 'GPU not detected' },
	changes: { id: 'tilus.autotune.changes', defaultMessage: 'What will change' },
	nothing: {
		id: 'tilus.autotune.nothing',
		defaultMessage: 'This instance is already tuned for this PC.',
	},
	shared: {
		id: 'tilus.autotune.shared',
		defaultMessage:
			'This instance syncs its game settings, so graphics, particles, clouds and shadows change for all synced instances.',
	},
	apply: { id: 'tilus.autotune.apply', defaultMessage: 'Apply' },
	appliedTitle: { id: 'tilus.autotune.applied', defaultMessage: 'Instance tuned for this PC' },
	memory: { id: 'tilus.autotune.memory', defaultMessage: 'Memory for the game' },
	garbageCollector: { id: 'tilus.autotune.gc', defaultMessage: 'Java garbage collector' },
	gpuPreference: { id: 'tilus.autotune.gpu-preference', defaultMessage: 'GPU for Java' },
	gpuAny: { id: 'tilus.autotune.gpu-any', defaultMessage: 'Chosen by Windows' },
	collectorDefault: { id: 'tilus.autotune.collector.default', defaultMessage: 'Java default' },
	collectorCustom: { id: 'tilus.autotune.collector.custom', defaultMessage: 'Custom' },
	collectorG1: { id: 'tilus.autotune.collector.g1', defaultMessage: 'G1 with short pauses' },
	collectorZgc: { id: 'tilus.autotune.collector.zgc', defaultMessage: 'ZGC, pauses under 1 ms' },
	gigabytes: { id: 'tilus.autotune.gigabytes', defaultMessage: '{value} GB' },
	chunks: {
		id: 'tilus.autotune.chunks',
		defaultMessage: '{count, plural, one {# chunk} other {# chunks}}',
	},
	on: { id: 'tilus.autotune.on', defaultMessage: 'On' },
	off: { id: 'tilus.autotune.value.off', defaultMessage: 'Off' },
	optionGraphics: { id: 'tilus.autotune.option.graphics', defaultMessage: 'Graphics' },
	optionRenderDistance: { id: 'tilus.autotune.option.render-distance', defaultMessage: 'Render distance' },
	optionSimulationDistance: {
		id: 'tilus.autotune.option.simulation-distance',
		defaultMessage: 'Simulation distance',
	},
	optionEntityDistance: { id: 'tilus.autotune.option.entity-distance', defaultMessage: 'Entity distance' },
	optionParticles: { id: 'tilus.autotune.option.particles', defaultMessage: 'Particles' },
	optionClouds: { id: 'tilus.autotune.option.clouds', defaultMessage: 'Clouds' },
	optionEntityShadows: { id: 'tilus.autotune.option.entity-shadows', defaultMessage: 'Entity shadows' },
	optionMipmapLevels: { id: 'tilus.autotune.option.mipmap-levels', defaultMessage: 'Mipmap levels' },
	optionBiomeBlend: { id: 'tilus.autotune.option.biome-blend', defaultMessage: 'Biome blend' },
	optionVsync: { id: 'tilus.autotune.option.vsync', defaultMessage: 'VSync' },
	valueFast: { id: 'tilus.autotune.value.fast', defaultMessage: 'Fast' },
	valueFancy: { id: 'tilus.autotune.value.fancy', defaultMessage: 'Fancy' },
	valueFabulous: { id: 'tilus.autotune.value.fabulous', defaultMessage: 'Fabulous' },
	valueParticlesAll: { id: 'tilus.autotune.value.particles-all', defaultMessage: 'All' },
	valueParticlesDecreased: {
		id: 'tilus.autotune.value.particles-decreased',
		defaultMessage: 'Decreased',
	},
	valueParticlesMinimal: { id: 'tilus.autotune.value.particles-minimal', defaultMessage: 'Minimal' },
})

const OPTION_LABELS: Record<string, MessageDescriptor> = {
	graphics: messages.optionGraphics,
	render_distance: messages.optionRenderDistance,
	simulation_distance: messages.optionSimulationDistance,
	entity_distance: messages.optionEntityDistance,
	particles: messages.optionParticles,
	clouds: messages.optionClouds,
	entity_shadows: messages.optionEntityShadows,
	mipmap_levels: messages.optionMipmapLevels,
	biome_blend_radius: messages.optionBiomeBlend,
	vsync: messages.optionVsync,
}

const VALUE_LABELS: Record<string, MessageDescriptor> = {
	'graphics:fast': messages.valueFast,
	'graphics:fancy': messages.valueFancy,
	'graphics:fabulous': messages.valueFabulous,
	'particles:0': messages.valueParticlesAll,
	'particles:1': messages.valueParticlesDecreased,
	'particles:2': messages.valueParticlesMinimal,
	'clouds:false': messages.off,
	'clouds:fast': messages.valueFast,
	'clouds:true': messages.valueFancy,
}


const modal = ref<InstanceType<typeof NewModal>>()
const plan = ref<AutotunePlan | null>(null)
const loading = ref(false)
const applying = ref(false)

async function show(instanceId: string) {
	plan.value = null
	loading.value = true
	modal.value?.show()
	try {
		plan.value = await planAutotune(instanceId)
	} catch (error) {
		handleError(error as Error)
		modal.value?.hide()
	} finally {
		loading.value = false
	}
}

async function apply() {
	if (!plan.value || applying.value) return
	applying.value = true
	try {
		await applyAutotune(plan.value)
		addNotification({ title: formatMessage(messages.appliedTitle), type: 'success' })
		modal.value?.hide()
		emit('applied')
	} catch (error) {
		handleError(error as Error)
	} finally {
		applying.value = false
	}
}

defineExpose({ show })

const gb = (mb: number) => {
	const value = mb / 1024
	return formatMessage(messages.gigabytes, { value: Number.isInteger(value) ? value : value.toFixed(1) })
}

const primaryGpu = computed(() => plan.value?.gpu ?? null)

function formatValue(optionId: string, value: GameOptionCanonicalValue | null): string {
	if (!value) return '—'
	const label = VALUE_LABELS[`${optionId}:${value.value}`]
	if (label) return formatMessage(label)
	if (value.type === 'bool') return formatMessage(value.value ? messages.on : messages.off)
	if (optionId === 'render_distance' || optionId === 'simulation_distance')
		return formatMessage(messages.chunks, { count: value.value as number })
	if (optionId === 'entity_distance') return `${Math.round(Number(value.value) * 100)}%`
	return String(value.value)
}

function changeLabel(change: AutotuneChange): string {
	switch (change.kind) {
		case 'memory':
			return formatMessage(messages.memory)
		case 'gc':
			return formatMessage(messages.garbageCollector)
		case 'option':
			return OPTION_LABELS[change.optionId] ? formatMessage(OPTION_LABELS[change.optionId]) : change.optionId
		case 'gpu':
			return formatMessage(messages.gpuPreference)
	}
}

function collectorLabel(name: string): string {
	if (name === 'ZGC') return formatMessage(messages.collectorZgc)
	if (name === 'G1') return formatMessage(messages.collectorG1)
	if (name === 'custom') return formatMessage(messages.collectorCustom)
	return formatMessage(messages.collectorDefault)
}

function changeValues(change: AutotuneChange): [string, string] {
	switch (change.kind) {
		case 'memory':
			return [gb(change.from), gb(change.to)]
		case 'gc':
			return [collectorLabel(change.from), collectorLabel(change.to)]
		case 'option':
			return [formatValue(change.optionId, change.from), formatValue(change.optionId, change.to)]
		case 'gpu':
			return [formatMessage(messages.gpuAny), primaryGpu.value?.name ?? '']
	}
}

const hasSharedOptions = computed(
	() => !!plan.value?.optionsSynced && plan.value.changes.some((c) => c.kind === 'option' && !c.rawKey),
)

</script>

<template>
	<NewModal ref="modal" :header="formatMessage(messages.header)" max-width="560px">
		<div class="flex flex-col gap-5">
			<p class="m-0 text-secondary">{{ formatMessage(messages.description) }}</p>

			<div v-if="loading" class="flex items-center justify-center py-10">
				<SpinnerIcon class="size-8 animate-spin text-secondary" />
			</div>

			<template v-else-if="plan">
				<section class="flex flex-col gap-2">
					<h3 class="m-0 text-base font-semibold text-contrast">{{ formatMessage(messages.yourPc) }}</h3>
					<div class="flex items-center gap-2 text-primary">
						<CpuIcon class="size-5 shrink-0 text-secondary" />
						{{
							formatMessage(messages.cpu, {
								name: plan.hardware.cpu_name,
								threads: plan.hardware.cpu_threads,
							})
						}}
					</div>
					<div class="flex items-center gap-2 text-primary">
						<MemoryStickIcon class="size-5 shrink-0 text-secondary" />
						{{ formatMessage(messages.ram, { amount: gb(plan.hardware.total_memory_mb) }) }}
					</div>
					<div class="flex items-center gap-2 text-primary">
						<MonitorIcon class="size-5 shrink-0 text-secondary" />
						<template v-if="primaryGpu">
							{{ primaryGpu.name }}
							<span class="text-secondary">
								({{
									primaryGpu.integrated
										? formatMessage(messages.integrated)
										: formatMessage(messages.discrete, { memory: gb(primaryGpu.dedicated_memory_mb) })
								}})
							</span>
						</template>
						<template v-else>{{ formatMessage(messages.noGpu) }}</template>
					</div>
				</section>

				<section class="flex flex-col gap-2">
					<h3 class="m-0 text-base font-semibold text-contrast">{{ formatMessage(messages.changes) }}</h3>
					<p v-if="plan.changes.length === 0" class="m-0 text-secondary">
						{{ formatMessage(messages.nothing) }}
					</p>
					<div
						v-for="(change, index) in plan.changes"
						:key="index"
						class="flex items-center justify-between gap-4 rounded-xl bg-button-bg px-3 py-2"
					>
						<span class="font-medium text-contrast">{{ changeLabel(change) }}</span>
						<span class="flex shrink-0 items-center gap-2 whitespace-nowrap text-right">
							<span class="text-secondary line-through">{{ changeValues(change)[0] }}</span>
							<span class="text-secondary">→</span>
							<span class="font-semibold text-brand">{{ changeValues(change)[1] }}</span>
						</span>
					</div>
					<p v-if="hasSharedOptions" class="m-0 text-sm text-secondary">
						{{ formatMessage(messages.shared) }}
					</p>
				</section>
			</template>
		</div>
		<template #actions>
			<div class="flex items-center justify-end gap-2">
				<Button type="outlined" @click="modal?.hide()">
					<XIcon />
					{{ formatMessage(commonMessages.cancelButton) }}
				</Button>
				<Button
					type="colored"
					color="brand"
					:disabled="!plan || plan.changes.length === 0 || applying"
					@click="apply"
				>
					<SpinnerIcon v-if="applying" class="animate-spin" />
					<CheckIcon v-else />
					{{ formatMessage(messages.apply) }}
				</Button>
			</div>
		</template>
	</NewModal>
</template>
