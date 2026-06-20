import type ModuleInstance from './main.js'
import type { DropdownChoice } from '@companion-module/base'

export type ActionsSchema = {
	ptz_preset: { options: { target: string } }
	guard_tour: { options: { tour: string; run: string } }
	stream_set: { options: { stream: string; enabled: string } }
	overlay_toggle: { options: { service: string; enabled: string } }
	view_switch: { options: { view: string } }
}

const onOffToggle: DropdownChoice[] = [
	{ id: 'on', label: 'On' },
	{ id: 'off', label: 'Off' },
	{ id: 'toggle', label: 'Toggle' },
]

function resolve(value: string, current: boolean | undefined): boolean {
	if (value === 'on') return true
	if (value === 'off') return false
	return !current // toggle
}

export function UpdateActions(self: ModuleInstance): void {
	const cat = self.catalog

	// PTZ targets: Home (per channel) + each preset
	const channels = [...new Set(cat.presets.map((p) => p.channel))]
	const ptzChoices: DropdownChoice[] = []
	if (channels.length <= 1) {
		ptzChoices.push({ id: 'home', label: '🏠 Home' })
	} else {
		for (const ch of channels) if (ch != null) ptzChoices.push({ id: `home:${ch}`, label: `🏠 Home [cam ${ch}]` })
	}
	for (const p of cat.presets) {
		const id = p.channel != null ? `preset:${p.name}:${p.channel}` : `preset:${p.name}:`
		const label = p.channel != null ? `${p.name} [cam ${p.channel}]` : p.name
		ptzChoices.push({ id, label })
	}

	const tourChoices: DropdownChoice[] = cat.tours.map((t) => ({ id: t.id, label: t.name }))
	const streamChoices: DropdownChoice[] = cat.streams.map((s) => ({ id: s.streamId, label: s.name }))
	const overlayChoices: DropdownChoice[] = cat.overlays.map((o) => ({ id: String(o.serviceId), label: o.name }))
	const viewChoices: DropdownChoice[] = cat.views.map((v) => ({ id: v.name, label: v.label }))

	self.setActionDefinitions({
		ptz_preset: {
			name: 'PTZ Preset / Home',
			options: [{ id: 'target', type: 'dropdown', label: 'Target', default: ptzChoices[0]?.id ?? 'home', choices: ptzChoices }],
			callback: async (event) => {
				const v = String(event.options.target)
				if (v.startsWith('home')) {
					const ch = v.includes(':') ? Number(v.split(':')[1]) : undefined
					await self.camera.home(ch)
				} else {
					const [, name, chStr] = v.split(':')
					await self.camera.gotoPresetName(name, chStr ? Number(chStr) : undefined)
				}
			},
		},
		guard_tour: {
			name: 'AXIS Guarded Tour',
			options: [
				{ id: 'tour', type: 'dropdown', label: 'Tour', default: tourChoices[0]?.id ?? '', choices: tourChoices },
				{ id: 'run', type: 'dropdown', label: 'Action', default: 'on', choices: onOffToggle },
			],
			callback: async (event) => {
				const id = String(event.options.tour)
				const run = resolve(String(event.options.run), self.state.tours.get(id))
				await self.camera.guardTour(id, run)
				await self.pollState()
			},
		},
		stream_set: {
			name: 'CamStreamer Stream',
			options: [
				{ id: 'stream', type: 'dropdown', label: 'Stream', default: streamChoices[0]?.id ?? '', choices: streamChoices },
				{ id: 'enabled', type: 'dropdown', label: 'State', default: 'toggle', choices: onOffToggle },
			],
			callback: async (event) => {
				const id = String(event.options.stream)
				const on = resolve(String(event.options.enabled), self.state.streams.get(id))
				await self.camera.streamSet(id, on)
				await self.pollState()
			},
		},
		overlay_toggle: {
			name: 'CamOverlay Widget',
			options: [
				{ id: 'service', type: 'dropdown', label: 'Service', default: overlayChoices[0]?.id ?? '', choices: overlayChoices },
				{ id: 'enabled', type: 'dropdown', label: 'State', default: 'toggle', choices: onOffToggle },
			],
			callback: async (event) => {
				const id = Number(event.options.service)
				const on = resolve(String(event.options.enabled), self.state.overlays.get(id))
				await self.camera.overlayToggle(id, on)
				await self.pollState()
			},
		},
		view_switch: {
			name: 'CamSwitcher Source',
			options: [{ id: 'view', type: 'dropdown', label: 'View', default: viewChoices[0]?.id ?? '', choices: viewChoices }],
			callback: async (event) => {
				await self.camera.viewSwitch(String(event.options.view))
			},
		},
	})
}
