/** Telemetry exists only in builds made with VITE_ENABLE_ANALYTICS. */
export const analyticsAvailable = import.meta.env.VITE_ENABLE_ANALYTICS === 'true'

/**
 * Rich Presence needs Tilus Launcher's own Discord application (Modrinth's one shows "Modrinth App");
 * enable together with DISCORD_APPLICATION_ID in packages/app-lib/src/state/discord.rs.
 */
export const discordRichPresenceAvailable = false

export const privacySettingsAvailable = analyticsAvailable || discordRichPresenceAvailable
