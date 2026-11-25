<script setup lang="ts">
import { defineMessages, injectNotificationManager, useVIntl } from '@modrinth/ui'

import { useAppEvent } from '@/composables/use-app-event'

import { applyAutotune, planAutotune } from './autotune'

/** New instances are tuned for this PC as soon as their installation finishes. */
const NEW_INSTANCE_JOBS = new Set(['create_instance', 'create_modpack_instance', 'create_shared_instance'])
const handledJobs = new Set<string>()

const { formatMessage } = useVIntl()
const { addNotification } = injectNotificationManager()

useAppEvent('install_job', async (job) => {
	if (
		job.status !== 'succeeded' ||
		!NEW_INSTANCE_JOBS.has(job.kind) ||
		!job.instance_id ||
		handledJobs.has(job.job_id)
	)
		return
	handledJobs.add(job.job_id)
	try {
		const plan = await planAutotune(job.instance_id)
		if (!plan.changes.length) return
		await applyAutotune(plan)
		addNotification({
			title: formatMessage(messages.title),
			text: formatMessage(messages.text),
			type: 'success',
		})
	} catch (error) {
		console.warn('Autotune after installation failed', error)
	}
})

const messages = defineMessages({
	title: { id: 'tilus.autotune.auto.title', defaultMessage: 'New instance tuned for this PC' },
	text: {
		id: 'tilus.autotune.auto.text',
		defaultMessage: 'Memory, Java and video settings were picked for your hardware.',
	},
})
</script>

<template></template>
