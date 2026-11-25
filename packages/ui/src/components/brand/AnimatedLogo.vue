<template>
	<div>
		<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none">
			<circle cx="12" cy="12" r="10" stroke="var(--color-brand)" stroke-opacity="0.25" stroke-width="2" />
			<path
				d="M12 2a10 10 0 0 1 10 10"
				stroke="var(--color-brand)"
				stroke-width="2"
				stroke-linecap="round"
			/>
		</svg>
	</div>
</template>

<style lang="scss" scoped>
div {
	height: 5rem;

	svg {
		width: 5rem;
		height: 5rem;
		animation: rotate 1.2s infinite linear;
	}

	@keyframes rotate {
		100% {
			transform: rotate(360deg);
		}
	}
}
</style>
