/** Servers shown in the sidebar of Tilus Launcher, with live status and one-click join. */
export type TilusServer = {
	name: string
	address: string
}

export const TILUS_SERVERS: TilusServer[] = [{ name: 'tilus.ru', address: 'play.tilus.ru' }]
