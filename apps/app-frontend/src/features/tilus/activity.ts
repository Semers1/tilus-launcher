import { ref } from 'vue'

/**
 * Overall progress (0 to 1) of what the launcher is downloading or installing right now, or null when
 * nothing is. Set by the download manager in the title bar, read by the TILUS wordmark next to it.
 */
export const downloadProgress = ref<number | null>(null)
