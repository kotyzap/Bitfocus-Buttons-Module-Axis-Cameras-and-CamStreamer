import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions, type VariablesSchema } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { AxisCamera, type Catalog } from './camera.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

export interface LiveState {
	streams: Map<string, boolean | undefined>
	overlays: Map<number, boolean | undefined>
	tours: Map<string, boolean>
}

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig
	camera!: AxisCamera
	catalog: Catalog = { presets: [], tours: [], overlays: [], streams: [], views: [] }
	state: LiveState = { streams: new Map(), overlays: new Map(), tours: new Map() }
	/** Flips ~every 0.6s to drive the blinking tally feedback. */
	blinkPhase = false
	private pollTimer: NodeJS.Timeout | undefined
	private blinkTimer: NodeJS.Timeout | undefined

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config
		await this.reconnect()
	}

	async destroy(): Promise<void> {
		if (this.pollTimer) clearInterval(this.pollTimer)
		if (this.blinkTimer) clearInterval(this.blinkTimer)
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		await this.reconnect()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	private async reconnect(): Promise<void> {
		if (this.pollTimer) clearInterval(this.pollTimer)
		if (this.blinkTimer) clearInterval(this.blinkTimer)
		this.camera = new AxisCamera({
			host: this.config.host,
			port: this.config.port,
			user: this.config.user || 'root',
			pass: this.config.pass || '',
			tls: !!this.config.tls,
		})
		if (!this.camera.usable) {
			this.updateStatus(InstanceStatus.BadConfig, 'Set camera IP')
			return
		}
		this.updateStatus(InstanceStatus.Connecting)
		try {
			this.catalog = await this.camera.discover()
			this.updateStatus(InstanceStatus.Ok)
		} catch (e) {
			this.updateStatus(InstanceStatus.ConnectionFailure, e instanceof Error ? e.message : String(e))
		}
		UpdateActions(this)
		UpdateFeedbacks(this)
		UpdatePresets(this)
		UpdateVariableDefinitions(this)
		await this.pollState()
		const sec = this.config.poll ?? 5
		if (sec > 0) this.pollTimer = setInterval(() => void this.pollState(), sec * 1000)

		// Blink driver for the tally feedback (only re-renders the tally buttons).
		this.blinkTimer = setInterval(() => {
			this.blinkPhase = !this.blinkPhase
			this.checkFeedbacks('stream_tally')
		}, 600)
	}

	async pollState(): Promise<void> {
		if (!this.camera?.usable) return
		try {
			const [streams, overlays, tours] = await Promise.all([
				this.camera.discoverStreams(),
				this.camera.discoverOverlays(),
				this.camera.discoverTours(),
			])
			this.state.streams = new Map(streams.map((s) => [s.streamId, s.enabled]))
			this.state.overlays = new Map(overlays.map((o) => [o.serviceId, o.enabled]))
			this.state.tours = new Map(tours.map((t) => [t.id, t.running]))
			this.setVariableValues({
				streams_on: streams.filter((s) => s.enabled).length,
				tour_running: tours.some((t) => t.running) ? 'yes' : 'no',
			})
			this.checkFeedbacks('stream_state', 'overlay_state', 'tour_state')
		} catch {
			// transient; keep last known state
		}
	}

	updateActions(): void {
		UpdateActions(this)
	}
	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}
	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}
}
