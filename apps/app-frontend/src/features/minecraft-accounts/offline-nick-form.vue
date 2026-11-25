<script setup lang="ts">
import { LogInIcon, SpinnerIcon, UserIcon } from '@modrinth/assets'
import { Button, defineMessages, Input, useVIntl } from '@modrinth/ui'
import { computed, ref } from 'vue'

import { handleSevereError } from '@/composables/use-error.js'
import { login_offline } from '@/helpers/auth'

/** Nickname-only (no license) sign-in for offline-mode servers. */
const emit = defineEmits<{
	added: [account: { profile: { id: string; name: string } }]
}>()

const { formatMessage } = useVIntl()

const NICKNAME = /^[A-Za-z0-9_]{3,16}$/
const nickname = ref('')
const busy = ref(false)
const invalid = computed(() => nickname.value.trim().length > 0 && !NICKNAME.test(nickname.value.trim()))

async function submit() {
	const name = nickname.value.trim()
	if (busy.value || !NICKNAME.test(name)) return
	busy.value = true
	const account = await login_offline(name).catch(handleSevereError)
	busy.value = false
	if (account) {
		nickname.value = ''
		emit('added', account)
	}
}

const messages = defineMessages({
	placeholder: {
		id: 'minecraft-account.offline.placeholder',
		defaultMessage: 'Nickname',
	},
	submit: {
		id: 'minecraft-account.offline.submit',
		defaultMessage: 'Play with a nickname',
	},
	hint: {
		id: 'minecraft-account.offline.hint',
		defaultMessage: 'No license needed: for servers with online-mode off, like tilus.ru',
	},
	invalid: {
		id: 'minecraft-account.offline.invalid',
		defaultMessage: '3–16 characters: Latin letters, digits and _',
	},
})
</script>

<template>
	<form class="flex flex-col gap-2" @submit.prevent="submit">
		<Input
			v-model="nickname"
			:icon="UserIcon"
			:placeholder="formatMessage(messages.placeholder)"
			:error="invalid"
			:maxlength="16"
			size="small"
			autocomplete="off"
			:spellcheck="false"
		/>
		<span v-if="invalid" class="text-xs text-red">{{ formatMessage(messages.invalid) }}</span>
		<Button :disabled="busy || !nickname.trim() || invalid" @click="submit">
			<LogInIcon v-if="!busy" />
			<SpinnerIcon v-else class="animate-spin" />
			{{ formatMessage(messages.submit) }}
		</Button>
		<span class="text-xs text-secondary">{{ formatMessage(messages.hint) }}</span>
	</form>
</template>
