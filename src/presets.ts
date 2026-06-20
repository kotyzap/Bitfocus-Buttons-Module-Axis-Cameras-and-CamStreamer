import type ModuleInstance from './main.js'
import type { ModuleSchema } from './main.js'
import {
	combineRgb,
	type CompanionPresetDefinitions,
	type CompanionPresetSection,
	type CompanionButtonStyleProps,
} from '@companion-module/base'

const WHITE = combineRgb(255, 255, 255)

// Unified palette matching the Stream Deck layout.
// Each category has a full (bright = ON / action) tone and a dim (OFF) tone.
const PAL = {
	ptz: { full: combineRgb(40, 167, 69), dim: combineRgb(22, 74, 36) }, // green
	tour: { full: combineRgb(40, 167, 69), dim: combineRgb(22, 74, 36) }, // green
	stream: { full: combineRgb(0, 110, 210), dim: combineRgb(13, 42, 80) }, // blue
	overlay: { full: combineRgb(232, 140, 22), dim: combineRgb(82, 50, 10) }, // orange
	view: { full: combineRgb(124, 86, 214), dim: combineRgb(48, 34, 86) }, // purple
}

const style = (text: string, bgcolor: number): CompanionButtonStyleProps => ({
	text,
	size: 14,
	color: WHITE,
	bgcolor,
	show_topbar: false,
})

// ON style applied by a boolean feedback: bright full-colour fill.
const onStyle = (full: number) => ({ bgcolor: full, color: WHITE })

export function UpdatePresets(self: ModuleInstance): void {
	const cat = self.catalog
	const presets: CompanionPresetDefinitions<ModuleSchema> = {}
	const ptzIds: string[] = []
	const tourIds: string[] = []
	const streamIds: string[] = []
	const overlayIds: string[] = []
	const viewIds: string[] = []

	// PTZ: one Home + named presets per *PTZ-capable* view-area (solid green).
	const isHome = (name: string): boolean => name.trim().toLowerCase() === 'home'
	const byChannel = new Map<number | undefined, typeof cat.presets>()
	for (const p of cat.presets) {
		const list = byChannel.get(p.channel) ?? []
		list.push(p)
		byChannel.set(p.channel, list)
	}
	const ptzChannels = [...byChannel.entries()].filter(([, list]) => list.some((p) => !isHome(p.name)))
	const multi = ptzChannels.length > 1

	for (const [ch, list] of ptzChannels) {
		const homeTarget = multi && ch != null ? `home:${ch}` : 'home'
		const homeId = `ptz_home_${ch ?? 0}`
		const homeLabel = multi && ch != null ? `PTZ\\nHome ${ch}` : 'PTZ\\nHome'
		presets[homeId] = {
			type: 'simple',
			name: homeLabel.replace('\\n', ' '),
			style: style(homeLabel, PAL.ptz.full),
			steps: [{ down: [{ actionId: 'ptz_preset', options: { target: homeTarget } }], up: [] }],
			feedbacks: [],
		}
		ptzIds.push(homeId)

		for (const p of list) {
			if (isHome(p.name)) continue
			const target = p.channel != null ? `preset:${p.name}:${p.channel}` : `preset:${p.name}:`
			const id = `ptz_preset_${p.channel ?? 0}_${p.name}`
			const label = multi && p.channel != null ? `${p.name}\\ncam ${p.channel}` : p.name
			presets[id] = {
				type: 'simple',
				name: `PTZ ${p.name}${multi && p.channel != null ? ` (cam ${p.channel})` : ''}`,
				style: style(label, PAL.ptz.full),
				steps: [{ down: [{ actionId: 'ptz_preset', options: { target } }], up: [] }],
				feedbacks: [],
			}
			ptzIds.push(id)
		}
	}

	// Guard tours: dim when stopped, bright green when running.
	for (const t of cat.tours) {
		const id = `tour_${t.id}`
		presets[id] = {
			type: 'simple',
			name: `Tour ${t.name}`,
			style: style(`Tour\\n${t.name}`, PAL.tour.dim),
			steps: [{ down: [{ actionId: 'guard_tour', options: { tour: t.id, run: 'toggle' } }], up: [] }],
			feedbacks: [{ feedbackId: 'tour_state', options: { tour: t.id }, style: onStyle(PAL.tour.full) }],
		}
		tourIds.push(id)
	}

	// CamStreamer streams: dim when off, bright blue when live.
	for (const s of cat.streams) {
		const id = `stream_${s.streamId}`
		presets[id] = {
			type: 'simple',
			name: `Stream ${s.name}`,
			style: style(s.name, PAL.stream.dim),
			steps: [{ down: [{ actionId: 'stream_set', options: { stream: s.streamId, enabled: 'toggle' } }], up: [] }],
			feedbacks: [{ feedbackId: 'stream_state', options: { stream: s.streamId }, style: onStyle(PAL.stream.full) }],
		}
		streamIds.push(id)
	}

	// CamOverlay services: dim when off, bright orange when enabled.
	for (const o of cat.overlays) {
		const id = `overlay_${o.serviceId}`
		presets[id] = {
			type: 'simple',
			name: `Overlay ${o.name}`,
			style: style(o.name, PAL.overlay.dim),
			steps: [
				{ down: [{ actionId: 'overlay_toggle', options: { service: String(o.serviceId), enabled: 'toggle' } }], up: [] },
			],
			feedbacks: [{ feedbackId: 'overlay_state', options: { service: String(o.serviceId) }, style: onStyle(PAL.overlay.full) }],
		}
		overlayIds.push(id)
	}

	// Stream Tally: broadcast-style blinking red while live, gray when off.
	const tallyIds: string[] = []
	const TALLY_BASE = combineRgb(45, 45, 45)
	const TALLY_DARK = combineRgb(70, 0, 0)
	const TALLY_BRIGHT = combineRgb(220, 0, 0)
	for (const s of cat.streams) {
		const id = `tally_${s.streamId}`
		presets[id] = {
			type: 'simple',
			name: `Tally ${s.name}`,
			style: style(s.name, TALLY_BASE),
			steps: [{ down: [{ actionId: 'stream_set', options: { stream: s.streamId, enabled: 'toggle' } }], up: [] }],
			feedbacks: [
				{ feedbackId: 'stream_state', options: { stream: s.streamId }, style: { bgcolor: TALLY_DARK, color: WHITE } },
				{ feedbackId: 'stream_tally', options: { stream: s.streamId }, style: { bgcolor: TALLY_BRIGHT, color: WHITE, text: '● LIVE' } },
			],
		}
		tallyIds.push(id)
	}

	// CamSwitcher views: solid purple (momentary switch, no on/off state).
	for (const v of cat.views) {
		const id = `view_${v.name}`
		presets[id] = {
			type: 'simple',
			name: `View ${v.label}`,
			style: style(`View\\n${v.label}`, PAL.view.full),
			steps: [{ down: [{ actionId: 'view_switch', options: { view: v.name } }], up: [] }],
			feedbacks: [],
		}
		viewIds.push(id)
	}

	const structure: CompanionPresetSection<ModuleSchema>[] = [
		{ id: 'ptz', name: 'PTZ Presets', definitions: ptzIds },
		{ id: 'tours', name: 'Guard Tours', definitions: tourIds },
		{ id: 'streams', name: 'CamStreamer Streams', definitions: streamIds },
		{ id: 'tally', name: 'Stream Tally (blinking)', definitions: tallyIds },
		{ id: 'overlays', name: 'CamOverlay Widgets', definitions: overlayIds },
		{ id: 'views', name: 'CamSwitcher Sources', definitions: viewIds },
	]

	self.setPresetDefinitions(structure, presets)
}
