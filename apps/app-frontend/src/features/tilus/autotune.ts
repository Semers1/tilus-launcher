import { invoke } from '@tauri-apps/api/core'

import {
	type GameOptionCanonicalValue,
	type GameSettingsEditorState,
	get_local_game_options_config,
	get_synced_game_options_config,
	preview_local_game_option_changes,
	preview_synced_game_option_changes,
	save_local_game_option_changes,
	save_synced_game_option_changes,
	type UpdateGameSettingsRequest,
} from '@/helpers/game-options'
import { edit, get, get_projects } from '@/helpers/instance'
import { get as getSettings } from '@/helpers/settings.ts'
import type { GameInstance } from '@/helpers/types'

export type GpuInfo = {
	name: string
	vendor_id: number
	dedicated_memory_mb: number
	integrated: boolean
}

export type HardwareInfo = {
	cpu_name: string
	cpu_threads: number
	cpu_cores: number | null
	total_memory_mb: number
	gpus: GpuInfo[]
}

export type GpuTier = 'integrated' | 'entry' | 'mid' | 'high'

type CanonicalValue = GameOptionCanonicalValue

export type AutotuneChange =
	| { kind: 'memory'; from: number; to: number }
	| { kind: 'gc'; from: string; to: string; args: string[] }
	| {
			kind: 'option'
			optionId: string
			from: CanonicalValue | null
			to: CanonicalValue
			/** options.txt key when the value is written straight to the instance's file */
			rawKey?: string
	  }
	| { kind: 'gpu' }

export type AutotunePlan = {
	instanceId: string
	hardware: HardwareInfo
	gpu: GpuInfo | null
	tier: GpuTier
	javaMajor: number
	modCount: number
	changes: AutotuneChange[]
	/** Video settings go to the settings shared by all instances that sync them. */
	optionsSynced: boolean
	/** Arguments to store for the instance: the user's own ones plus the tuned garbage collector. */
	launchArgs: string[]
	memoryMb: number
}

export const getHardwareInfo = () => invoke<HardwareInfo>('plugin:tilus|hardware_info')
const setInstanceGameOptions = (instanceId: string, values: [string, string][]) =>
	invoke<void>('plugin:tilus|set_instance_game_options', { instanceId, values })
const getInstanceGameOptions = (instanceId: string, keys: string[]) =>
	invoke<Record<string, string>>('plugin:tilus|get_instance_game_options', { instanceId, keys })
export const preferHighPerformanceGpu = () =>
	invoke<string[]>('plugin:tilus|prefer_high_performance_gpu')

/** The GPU Minecraft should run on: the discrete one with the most memory, else the integrated one. */
export function pickGpu(hardware: HardwareInfo): { gpu: GpuInfo | null; tier: GpuTier } {
	const discrete = hardware.gpus
		.filter((gpu) => !gpu.integrated)
		.sort((a, b) => b.dedicated_memory_mb - a.dedicated_memory_mb)[0]
	if (!discrete) return { gpu: hardware.gpus[0] ?? null, tier: 'integrated' }
	const vram = discrete.dedicated_memory_mb
	return { gpu: discrete, tier: vram >= 10_000 ? 'high' : vram >= 5_500 ? 'mid' : 'entry' }
}

/** Java version Mojang ships with a Minecraft version (26.x moved to year-based numbers). */
export function javaMajorFor(gameVersion: string): number {
	const parts = gameVersion.split(/[.-]/).map((part) => parseInt(part, 10))
	if (parts[0] >= 26) return 25
	if (parts[0] !== 1) return 21
	const minor = parts[1] ?? 0
	const patch = parts[2] ?? 0
	if (minor > 20 || (minor === 20 && patch >= 5)) return 21
	if (minor >= 18) return 17
	if (minor === 17) return 16
	return 8
}

/** Whether a Minecraft version is at least 1.<minor> (all year-based 26.x versions are newer). */
function atLeast(gameVersion: string, minor: number): boolean {
	const [major, versionMinor] = gameVersion.split(/[.-]/).map((part) => parseInt(part, 10))
	return major >= 26 || (major === 1 && (versionMinor ?? 0) >= minor)
}

/**
 * Settings Modrinth keeps per instance even when the other game settings are synced. They are written
 * straight into the instance's options.txt, which also works before the game was ever started.
 */
const PER_INSTANCE_KEYS: Record<string, { key: string; since: number }> = {
	render_distance: { key: 'renderDistance', since: 0 },
	simulation_distance: { key: 'simulationDistance', since: 18 },
	entity_distance: { key: 'entityDistanceScaling', since: 16 },
	mipmap_levels: { key: 'mipmapLevels', since: 0 },
}

/** Reads a raw options.txt value as the same kind of value as the target. */
function parseRaw(raw: string | undefined, like: CanonicalValue): CanonicalValue | null {
	if (raw === undefined) return null
	if (like.type === 'integer') return { type: 'integer', value: parseInt(raw, 10) }
	if (like.type === 'decimal') return { type: 'decimal', value: raw }
	return null
}

function rawValue(value: CanonicalValue): string {
	return typeof value.value === 'string' ? value.value : String(value.value)
}

/** Heap the instance needs (MiB) for its size, kept within what this PC can spare. */
export function recommendedMemoryMb(totalMb: number, loader: string, modCount: number): number {
	const wanted =
		loader === 'vanilla' || modCount === 0
			? 2048
			: modCount < 40
				? 3072
				: modCount < 120
					? 4096
					: modCount < 220
						? 6144
						: 8192
	const spare = Math.min(totalMb * 0.5, totalMb - 4096, 10_240)
	const memory = Math.max(1536, Math.min(wanted, spare))
	return Math.round(memory / 512) * 512
}

const GC_ARG = /^-XX:[+-]?(Use\w*GC|ZGenerational|ParallelRefProcEnabled|MaxGCPauseMillis=.*|G1\w+=?.*|UnlockExperimentalVMOptions|DisableExplicitGC)$/
const HEAP_ARG = /^-Xm[sx]\d+[kKmMgG]?$/

/**
 * Garbage collector for the client. Generational ZGC keeps pauses under a millisecond when there are
 * enough cores and heap for it; otherwise G1 tuned for short pauses, which every Java since 8 supports.
 */
export function garbageCollector(
	javaMajor: number,
	threads: number,
	memoryMb: number,
): { name: string; args: string[] } {
	if (javaMajor >= 21 && threads >= 8 && memoryMb >= 6144) {
		return {
			name: 'ZGC',
			args: javaMajor >= 23 ? ['-XX:+UseZGC'] : ['-XX:+UseZGC', '-XX:+ZGenerational'],
		}
	}
	return {
		name: 'G1',
		args: [
			'-XX:+UseG1GC',
			'-XX:+ParallelRefProcEnabled',
			'-XX:MaxGCPauseMillis=40',
			'-XX:+UnlockExperimentalVMOptions',
			'-XX:G1NewSizePercent=30',
			'-XX:G1MaxNewSizePercent=40',
			'-XX:G1HeapRegionSize=8M',
			'-XX:G1ReservePercent=20',
			'-XX:+DisableExplicitGC',
		],
	}
}

function describeGarbageCollector(args: string[]): string {
	if (args.includes('-XX:+UseZGC')) return 'ZGC'
	if (args.includes('-XX:+UseG1GC')) return 'G1'
	if (args.some((arg) => /^-XX:\+Use\w*GC$/.test(arg))) return 'custom'
	return 'default'
}

const int = (value: number): CanonicalValue => ({ type: 'integer', value })
const bool = (value: boolean): CanonicalValue => ({ type: 'bool', value })
const choice = (value: string): CanonicalValue => ({ type: 'enum', value })
const decimal = (value: number): CanonicalValue => ({ type: 'decimal', value: value.toFixed(2) })

/** Video settings per GPU class; the CPU decides how far the world is simulated. */
export function videoSettings(tier: GpuTier, threads: number): Record<string, CanonicalValue> {
	const simulation = threads >= 12 ? 10 : threads >= 8 ? 8 : 6
	switch (tier) {
		case 'integrated':
			return {
				graphics: choice('fast'),
				render_distance: int(8),
				simulation_distance: int(Math.min(simulation, 6)),
				entity_distance: decimal(0.75),
				particles: choice('1'),
				clouds: choice('false'),
				entity_shadows: bool(false),
				mipmap_levels: int(2),
				biome_blend_radius: int(1),
				vsync: bool(false),
			}
		case 'entry':
			return {
				graphics: choice('fancy'),
				render_distance: int(10),
				simulation_distance: int(Math.min(simulation, 8)),
				entity_distance: decimal(1),
				particles: choice('0'),
				clouds: choice('fast'),
				entity_shadows: bool(true),
				mipmap_levels: int(4),
				biome_blend_radius: int(2),
			}
		case 'mid':
			return {
				graphics: choice('fancy'),
				render_distance: int(14),
				simulation_distance: int(simulation),
				entity_distance: decimal(1),
				particles: choice('0'),
				clouds: choice('true'),
				entity_shadows: bool(true),
				mipmap_levels: int(4),
				biome_blend_radius: int(3),
			}
		case 'high':
			return {
				graphics: choice('fancy'),
				render_distance: int(20),
				simulation_distance: int(simulation),
				entity_distance: decimal(1.25),
				particles: choice('0'),
				clouds: choice('true'),
				entity_shadows: bool(true),
				mipmap_levels: int(4),
				biome_blend_radius: int(5),
			}
	}
}

function sameValue(a: CanonicalValue | null | undefined, b: CanonicalValue): boolean {
	if (!a || a.type !== b.type) return false
	if (a.type === 'decimal') return Number(a.value) === Number(b.value)
	return a.value === b.value
}

export async function planAutotune(
	instanceId: string,
	hardware?: HardwareInfo,
): Promise<AutotunePlan> {
	const [instance, info, settings, projects] = await Promise.all([
		get(instanceId) as Promise<GameInstance | null>,
		hardware ?? getHardwareInfo(),
		getSettings(),
		get_projects(instanceId).catch(() => ({})),
	])
	if (!instance) throw new Error(`Instance ${instanceId} not found`)
	const optionsSynced = !!instance.synced_options?.game_options
	const editor = optionsEditor(instanceId, optionsSynced)
	const options = await editor.load().catch(() => null)

	const { gpu, tier } = pickGpu(info)
	const javaMajor = javaMajorFor(instance.game_version)
	const modCount = Object.entries(projects).filter(
		([path, file]) => path.replaceAll('\\', '/').startsWith('mods/') && file.enabled !== false,
	).length
	const changes: AutotuneChange[] = []

	const currentMemory = instance.memory?.maximum ?? settings.memory.maximum
	const memoryMb = recommendedMemoryMb(info.total_memory_mb, instance.loader, modCount)
	if (memoryMb !== currentMemory) changes.push({ kind: 'memory', from: currentMemory, to: memoryMb })

	const currentArgs = instance.extra_launch_args ?? settings.extra_launch_args ?? []
	const collector = garbageCollector(javaMajor, info.cpu_threads, memoryMb)
	const launchArgs = [
		...currentArgs.filter((arg) => !GC_ARG.test(arg) && !HEAP_ARG.test(arg)),
		...collector.args,
	]
	const currentCollector = describeGarbageCollector(currentArgs)
	if (launchArgs.join(' ') !== currentArgs.join(' ')) {
		changes.push({ kind: 'gc', from: currentCollector, to: collector.name, args: collector.args })
	}

	const wanted = videoSettings(tier, info.cpu_threads)
	const fileValues = await getInstanceGameOptions(
		instanceId,
		Object.values(PER_INSTANCE_KEYS).map((entry) => entry.key),
	).catch(() => ({}) as Record<string, string>)
	const candidates: AutotuneChange[] = []
	for (const [optionId, target] of Object.entries(wanted)) {
		const setting = options?.settings.find((candidate) => candidate.option_id === optionId)
		const current = setting?.canonical_value ?? null
		const perInstance = PER_INSTANCE_KEYS[optionId]
		if (perInstance) {
			const inFile = parseRaw(fileValues[perInstance.key], target)
			if (!atLeast(instance.game_version, perInstance.since) || sameValue(inFile, target)) continue
			changes.push({ kind: 'option', optionId, from: inFile, to: target, rawKey: perInstance.key })
			continue
		}
		if (!setting || setting.controlled || (optionsSynced && !setting.sync_enabled)) continue
		if (sameValue(current, target)) continue
		candidates.push({ kind: 'option', optionId, from: current, to: target })
	}
	if (options) changes.push(...(await acceptedOptionChanges(editor, options, candidates)))

	if (gpu && !gpu.integrated && info.gpus.length > 1) changes.push({ kind: 'gpu' })

	return {
		instanceId,
		hardware: info,
		gpu,
		tier,
		javaMajor,
		modCount,
		changes,
		optionsSynced,
		launchArgs,
		memoryMb,
	}
}

type OptionsEditor = {
	load: () => Promise<GameSettingsEditorState>
	preview: (request: UpdateGameSettingsRequest) => Promise<GameSettingsEditorState>
	save: (request: UpdateGameSettingsRequest) => Promise<unknown>
}

/** Instances that sync game settings can only be changed through the shared settings. */
function optionsEditor(instanceId: string, synced: boolean): OptionsEditor {
	return synced
		? {
				load: get_synced_game_options_config,
				preview: preview_synced_game_option_changes,
				save: save_synced_game_option_changes,
			}
		: {
				load: () => get_local_game_options_config(instanceId),
				preview: (request) => preview_local_game_option_changes(instanceId, request),
				save: (request) => save_local_game_option_changes(instanceId, request),
			}
}

function optionRequest(
	editor: GameSettingsEditorState,
	changes: AutotuneChange[],
): UpdateGameSettingsRequest {
	const revisions = new Map(editor.settings.map((setting) => [setting.option_id, setting.option_revision]))
	return {
		expected_summary_revision: editor.summary_revision,
		expected_canonical_revision: editor.canonical_revision,
		expected_catalog_revision: editor.catalog_revision,
		changes: changes.flatMap((change) =>
			change.kind === 'option'
				? [
						{
							option_id: change.optionId,
							base_option_revision: revisions.get(change.optionId) ?? 0,
							canonical_value: change.to,
						},
					]
				: [],
		),
	}
}

/** Keeps the video changes the game options editor accepts for this instance's Minecraft version. */
async function acceptedOptionChanges(
	editor: OptionsEditor,
	state: GameSettingsEditorState,
	candidates: AutotuneChange[],
): Promise<AutotuneChange[]> {
	if (!candidates.length) return []
	const preview = await editor.preview(optionRequest(state, candidates)).catch(() => null)
	if (!preview) return []
	const rejected = new Set(
		preview.settings.filter((setting) => setting.validation_error).map((setting) => setting.option_id),
	)
	return candidates.filter((change) => change.kind === 'option' && !rejected.has(change.optionId))
}

export async function applyAutotune(plan: AutotunePlan): Promise<void> {
	const memoryChange = plan.changes.find((change) => change.kind === 'memory')
	const gcChange = plan.changes.find((change) => change.kind === 'gc')
	if (memoryChange || gcChange) {
		await edit(plan.instanceId, {
			...(memoryChange ? { memory: { maximum: plan.memoryMb } } : {}),
			...(gcChange ? { extra_launch_args: plan.launchArgs } : {}),
		} as Partial<GameInstance>)
	}

	const perInstance = plan.changes.flatMap((change) =>
		change.kind === 'option' && change.rawKey ? [[change.rawKey, rawValue(change.to)] as [string, string]] : [],
	)
	if (perInstance.length) await setInstanceGameOptions(plan.instanceId, perInstance)

	const shared = plan.changes.filter((change) => change.kind === 'option' && !change.rawKey)
	if (shared.length) {
		const editor = optionsEditor(plan.instanceId, plan.optionsSynced)
		await editor.save(optionRequest(await editor.load(), shared))
	}

	if (plan.changes.some((change) => change.kind === 'gpu')) await preferHighPerformanceGpu()
}
