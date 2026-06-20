import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { createHash, randomBytes } from 'node:crypto'

export interface CamConfig {
	host: string
	port: number
	user: string
	pass: string
	tls: boolean
}

export interface CamResult {
	ok: boolean
	status: number
	text: string
	error?: string
}

export interface PresetItem {
	channel?: number
	no: number
	name: string
}
export interface TourItem {
	channel?: number
	id: string
	name: string
	running: boolean
}
export interface OverlayItem {
	serviceId: number
	name: string
	enabled?: boolean
}
export interface StreamItem {
	streamId: string
	name: string
	enabled?: boolean
}
export interface ViewItem {
	name: string
	label: string
}

export interface Catalog {
	presets: PresetItem[]
	tours: TourItem[]
	overlays: OverlayItem[]
	streams: StreamItem[]
	views: ViewItem[]
}

const md5 = (s: string): string => createHash('md5').update(s).digest('hex')

/**
 * Direct LAN client for one Axis camera. TypeScript port of the Stream Deck /
 * Macro Deck plugins' camera layer (CameraClient.cs). Same VAPIX + CamStreamer /
 * CamOverlay / CamSwitcher endpoints. Implements HTTP digest + basic auth so it
 * works against default (digest-only) Axis configs, which the Generic HTTP
 * Companion module cannot do.
 */
export class AxisCamera {
	private readonly cfg: CamConfig
	private readonly timeoutMs = 6000

	constructor(cfg: CamConfig) {
		this.cfg = cfg
	}

	get usable(): boolean {
		const h = this.cfg.host
		return !!h && h !== 'localhost' && !h.startsWith('127.') && h !== '::1'
	}

	private effectivePort(): number {
		return this.cfg.port > 0 ? this.cfg.port : this.cfg.tls ? 443 : 80
	}

	// ---- low level: one request with digest/basic auth retry ------------------
	private once(
		method: string,
		path: string,
		authHeader: string | undefined,
		body?: string,
		contentType?: string,
	): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; text: string }> {
		return new Promise((resolve, reject) => {
			const reqFn = this.cfg.tls ? httpsRequest : httpRequest
			const headers: Record<string, string> = {}
			if (authHeader) headers['Authorization'] = authHeader
			if (body !== undefined) {
				headers['Content-Type'] = contentType ?? 'application/json'
				headers['Content-Length'] = Buffer.byteLength(body).toString()
			}
			const req = reqFn(
				{
					host: this.cfg.host,
					port: this.effectivePort(),
					method,
					path,
					headers,
					rejectUnauthorized: false,
					timeout: this.timeoutMs,
				},
				(res) => {
					let data = ''
					res.setEncoding('utf8')
					res.on('data', (c) => (data += c))
					res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text: data }))
				},
			)
			req.on('error', reject)
			req.on('timeout', () => req.destroy(new Error('timeout')))
			if (body !== undefined) req.write(body)
			req.end()
		})
	}

	private buildDigest(method: string, path: string, challenge: string): string {
		const get = (k: string): string => {
			const m = new RegExp(`${k}="?([^",]+)"?`).exec(challenge)
			return m ? m[1] : ''
		}
		const realm = get('realm')
		const nonce = get('nonce')
		const qop = get('qop')
		const opaque = get('opaque')
		const algorithm = get('algorithm') || 'MD5'
		const cnonce = randomBytes(8).toString('hex')
		const nc = '00000001'
		const ha1 = md5(`${this.cfg.user}:${realm}:${this.cfg.pass}`)
		const ha2 = md5(`${method}:${path}`)
		const response = qop
			? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
			: md5(`${ha1}:${nonce}:${ha2}`)
		let h = `Digest username="${this.cfg.user}", realm="${realm}", nonce="${nonce}", uri="${path}", algorithm=${algorithm}, response="${response}"`
		if (qop) h += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`
		if (opaque) h += `, opaque="${opaque}"`
		return h
	}

	private async req(method: string, path: string, body?: string, contentType?: string): Promise<CamResult> {
		try {
			let res = await this.once(method, path, undefined, body, contentType)
			if (res.status === 401) {
				const wa = res.headers['www-authenticate']
				const challenge = Array.isArray(wa) ? wa.join(',') : wa ?? ''
				let auth: string | undefined
				if (/digest/i.test(challenge)) {
					auth = this.buildDigest(method, path, challenge)
				} else if (/basic/i.test(challenge)) {
					auth = 'Basic ' + Buffer.from(`${this.cfg.user}:${this.cfg.pass}`).toString('base64')
				}
				if (auth) res = await this.once(method, path, auth, body, contentType)
			}
			const ok = res.status >= 200 && res.status < 300
			return { ok, status: res.status, text: res.text }
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e)
			return { ok: false, status: 0, text: msg, error: msg }
		}
	}

	private get(path: string): Promise<CamResult> {
		return this.req('GET', path)
	}

	private static toBool(v: unknown): boolean | undefined {
		if (v === true || v === 1 || v === '1') return true
		if (v === false || v === 0 || v === '0') return false
		return undefined
	}

	// ---- discovery ------------------------------------------------------------
	async discoverPresets(): Promise<PresetItem[]> {
		const res = await this.get('/axis-cgi/com/ptz.cgi?query=presetposall')
		const items: PresetItem[] = []
		if (!res.ok) return items
		let channel: number | undefined
		for (const raw of res.text.split('\n')) {
			const line = raw.trim()
			const h = /^Preset Positions for camera\s+(\d+)/i.exec(line)
			if (h) {
				channel = parseInt(h[1], 10)
				continue
			}
			const m = /^presetposno(\d+)=(.*)$/.exec(line)
			if (m) items.push({ channel, no: parseInt(m[1], 10), name: m[2].trim() })
		}
		return items
	}

	async discoverTours(): Promise<TourItem[]> {
		const res = await this.get('/axis-cgi/param.cgi?action=list&group=GuardTour')
		const tours = new Map<string, { ch?: number; name: string; running: boolean; active: boolean }>()
		if (!res.ok) return []
		for (const raw of res.text.split('\n')) {
			const m = /^root\.GuardTour\.(G\d+)\.(\w+)=(.*)$/.exec(raw.trim())
			if (!m) continue
			const [, id, key, val] = m
			const t = tours.get(id) ?? { name: '', running: false, active: false }
			if (/^name$/i.test(key)) t.name = val.trim()
			else if (/^camnbr$/i.test(key)) t.ch = parseInt(val, 10) || undefined
			else if (/^running$/i.test(key)) t.running = /yes/i.test(val.trim())
			else if (/^active$/i.test(key)) t.active = /yes/i.test(val.trim())
			tours.set(id, t)
		}
		const out: TourItem[] = []
		for (const [id, t] of tours) {
			if (t.active || t.name.length > 0)
				out.push({ channel: t.ch, id, name: t.name || id, running: t.running })
		}
		return out
	}

	async discoverOverlays(): Promise<OverlayItem[]> {
		const res = await this.get('/local/camoverlay/api/services.cgi?action=get')
		const items: OverlayItem[] = []
		if (!res.ok) return items
		const data = this.parse(res.text)
		const list: any[] = data?.services ?? (Array.isArray(data) ? data : [])
		for (const s of list) {
			const id = Number(s.id ?? s.service_id ?? s.serviceID)
			if (!Number.isFinite(id)) continue
			const name = String(s.customName || s.name || s.title || `Service ${id}`)
			items.push({ serviceId: id, name, enabled: AxisCamera.toBool(s.enabled) })
		}
		return items
	}

	async discoverStreams(): Promise<StreamItem[]> {
		const res = await this.get('/local/camstreamer/stream_list.cgi?action=get')
		if (!res.ok) return []
		const data = this.parse(res.text)
		const arr: any[] = data?.data?.streamList ?? data?.streamList ?? []
		return arr
			.map((s) => ({
				streamId: String(s.streamId ?? s.stream_id ?? s.id ?? ''),
				name: String(s.title ?? s.name ?? 'Stream'),
				enabled: AxisCamera.toBool(s.enabled),
			}))
			.filter((s) => s.streamId.length > 0)
	}

	async discoverViews(): Promise<ViewItem[]> {
		const res = await this.get('/local/camswitcher/playlists.cgi?action=get')
		const items: ViewItem[] = []
		if (!res.ok) return items
		const data = this.parse(res.text)
		const dict = data?.data
		if (dict && typeof dict === 'object') {
			for (const key of Object.keys(dict)) {
				const v = dict[key]
				items.push({ name: key, label: String(v?.niceName || v?.name || key) })
			}
		}
		return items
	}

	async discover(): Promise<Catalog> {
		const [presets, tours, overlays, streams, views] = await Promise.all([
			this.discoverPresets(),
			this.discoverTours(),
			this.discoverOverlays(),
			this.discoverStreams(),
			this.discoverViews(),
		])
		return { presets, tours, overlays, streams, views }
	}

	private parse(text: string): any {
		try {
			return JSON.parse(text)
		} catch {
			return undefined
		}
	}

	// ---- commands -------------------------------------------------------------
	private async stopToursOnChannel(channel?: number): Promise<void> {
		const tours = await this.discoverTours()
		for (const t of tours) {
			if (!t.running) continue
			if (channel != null && t.channel != null && t.channel !== channel) continue
			await this.get(`/axis-cgi/param.cgi?action=update&GuardTour.${t.id}.Running=no`)
		}
	}

	async gotoPresetName(name: string, channel?: number): Promise<CamResult> {
		await this.stopToursOnChannel(channel)
		const cam = channel != null ? `&camera=${channel}` : ''
		return this.get(`/axis-cgi/com/ptz.cgi?gotoserverpresetname=${encodeURIComponent(name)}${cam}`)
	}

	async home(channel?: number): Promise<CamResult> {
		await this.stopToursOnChannel(channel)
		const cam = channel != null ? `&camera=${channel}` : ''
		return this.get(`/axis-cgi/com/ptz.cgi?move=home${cam}`)
	}

	async guardTour(id: string, run: boolean, channel?: number): Promise<CamResult> {
		if (run) await this.stopToursOnChannel(channel)
		return this.get(`/axis-cgi/param.cgi?action=update&GuardTour.${encodeURIComponent(id)}.Running=${run ? 'yes' : 'no'}`)
	}

	async streamSet(streamId: string, enabled: boolean): Promise<CamResult> {
		return this.get(
			`/local/camstreamer/set_stream_enabled.cgi?stream_id=${encodeURIComponent(streamId)}&enabled=${enabled ? 1 : 0}`,
		)
	}

	async viewSwitch(name: string): Promise<CamResult> {
		return this.get(`/local/camswitcher/playlist_switch.cgi?playlist_name=${encodeURIComponent(name)}`)
	}

	/** Read-modify-write: flips one CamOverlay service's enabled flag, preserving all others. */
	async overlayToggle(serviceId: number, enabled: boolean): Promise<CamResult> {
		const list = await this.get('/local/camoverlay/api/services.cgi?action=get')
		if (!list.ok) return { ok: false, status: list.status, text: '', error: `services.cgi get ${list.status}` }
		const data = this.parse(list.text)
		const services: any[] = data?.services ?? (Array.isArray(data) ? data : [])
		if (!services.length) return { ok: false, status: 0, text: '', error: 'no services' }
		let found = false
		for (const s of services) {
			if (Number(s.id ?? s.service_id ?? s.serviceID) === serviceId) {
				s.enabled = enabled ? 1 : 0
				found = true
			}
		}
		if (!found) return { ok: false, status: 0, text: '', error: `service ${serviceId} not found` }
		const body = JSON.stringify({ services })
		return this.req('POST', '/local/camoverlay/api/services.cgi?action=set', body, 'application/json')
	}
}
