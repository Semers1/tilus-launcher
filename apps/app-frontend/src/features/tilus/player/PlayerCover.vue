<script setup lang="ts">
import { Avatar } from '@modrinth/ui'
import { computed } from 'vue'

import { useImageThumbnail } from '@/composables/use-image-thumbnail'
import { getInstanceIconUrl } from '@/helpers/instance'
import type { GameInstance } from '@/helpers/types'

/** An instance icon shown big, like an album cover, with an optional glow in the window's colour. */
const props = withDefaults(defineProps<{ instance: GameInstance; size: number; glow?: boolean }>(), {
	glow: false,
})

const localIcon = computed(() => {
	const path = props.instance.icon_path
	return path && !/^https?:/.test(path) && !path.toLowerCase().endsWith('.svg') ? path : undefined
})
const thumbnail = useImageThumbnail(
	localIcon,
	() => Math.min(512, props.size * 2),
	() => String(props.instance.modified),
)
const src = computed(() =>
	localIcon.value ? thumbnail.value : getInstanceIconUrl(props.instance.icon_path),
)
</script>

<template>
	<div
		class="tilus-cover"
		:class="{ 'tilus-cover--glow': glow }"
		:style="{
			width: `${size}px`,
			height: `${size}px`,
			borderRadius: `${Math.max(8, Math.round(size * 0.12))}px`,
		}"
	>
		<Avatar
			class="pointer-events-none !rounded-[inherit]"
			size="100%"
			:src="src"
			:alt="instance.name"
			:tint-by="instance.id"
			pad-transparent-corners
		/>
	</div>
</template>
