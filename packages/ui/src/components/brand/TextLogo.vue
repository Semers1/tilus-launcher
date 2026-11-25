<template>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		:class="{ animate }"
	>
		<path
			d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
		/>
		<polyline points="3.29 7 12 12 20.71 7" />
		<line x1="12" y1="22" x2="12" y2="12" />
	</svg>
</template>

<script setup>
defineProps({
	animate: {
		type: Boolean,
		default: false,
	},
})
</script>

<style lang="scss" scoped>
.animate {
	animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
	50% {
		opacity: 0.5;
	}
}
</style>
