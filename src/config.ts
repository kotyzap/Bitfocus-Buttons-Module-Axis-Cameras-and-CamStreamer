import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export type ModuleConfig = {
	host: string
	port: number
	user: string
	pass: string
	tls: boolean
	poll: number
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{ type: 'textinput', id: 'host', label: 'Camera IP / host', width: 8, regex: Regex.HOSTNAME },
		{ type: 'number', id: 'port', label: 'Port (0 = 80/443)', width: 4, min: 0, max: 65535, default: 0 },
		{ type: 'textinput', id: 'user', label: 'User', width: 6, default: 'root' },
		{ type: 'textinput', id: 'pass', label: 'Password', width: 6 },
		{ type: 'checkbox', id: 'tls', label: 'Use HTTPS (TLS)', width: 6, default: false },
		{ type: 'number', id: 'poll', label: 'State poll (sec, 0 = off)', width: 6, min: 0, max: 600, default: 5 },
	]
}
