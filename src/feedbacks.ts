import type ModuleInstance from './main.js'
import { combineRgb, type DropdownChoice } from '@companion-module/base'

export type FeedbacksSchema = {
	stream_state: { type: 'boolean'; options: { stream: string } }
	stream_tally: { type: 'boolean'; options: { stream: string } }
	overlay_state: { type: 'boolean'; options: { service: string } }
	tour_state: { type: 'boolean'; options: { tour: string } }
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	const cat = self.catalog
	const streamChoices: DropdownChoice[] = cat.streams.map((s) => ({ id: s.streamId, label: s.name }))
	const overlayChoices: DropdownChoice[] = cat.overlays.map((o) => ({ id: String(o.serviceId), label: o.name }))
	const tourChoices: DropdownChoice[] = cat.tours.map((t) => ({ id: t.id, label: t.name }))

	const green = { bgcolor: combineRgb(0, 153, 51), color: combineRgb(255, 255, 255) }

	self.setFeedbackDefinitions({
		stream_state: {
			name: 'Stream is live',
			type: 'boolean',
			defaultStyle: green,
			options: [{ id: 'stream', type: 'dropdown', label: 'Stream', default: streamChoices[0]?.id ?? '', choices: streamChoices }],
			callback: (fb) => self.state.streams.get(String(fb.options.stream)) === true,
		},
		stream_tally: {
			name: 'Stream tally (blinks when live)',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(220, 0, 0), color: combineRgb(255, 255, 255), text: '● LIVE' },
			options: [{ id: 'stream', type: 'dropdown', label: 'Stream', default: streamChoices[0]?.id ?? '', choices: streamChoices }],
			// True only on the bright phase while the stream is live -> button flashes.
			callback: (fb) => self.state.streams.get(String(fb.options.stream)) === true && self.blinkPhase,
		},
		overlay_state: {
			name: 'Overlay is enabled',
			type: 'boolean',
			defaultStyle: green,
			options: [{ id: 'service', type: 'dropdown', label: 'Service', default: overlayChoices[0]?.id ?? '', choices: overlayChoices }],
			callback: (fb) => self.state.overlays.get(Number(fb.options.service)) === true,
		},
		tour_state: {
			name: 'Guard tour running',
			type: 'boolean',
			defaultStyle: green,
			options: [{ id: 'tour', type: 'dropdown', label: 'Tour', default: tourChoices[0]?.id ?? '', choices: tourChoices }],
			callback: (fb) => self.state.tours.get(String(fb.options.tour)) === true,
		},
	})
}
