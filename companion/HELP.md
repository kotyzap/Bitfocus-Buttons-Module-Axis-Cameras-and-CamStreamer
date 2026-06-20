# Axis Camera Control

Controls Axis IP cameras and the CamStreamer suite directly over the LAN, using the
same endpoints as the Stream Deck / Macro Deck plugins in this project.

## Configuration

| Field | Notes |
|-------|-------|
| Camera IP / host | e.g. `192.168.1.156` |
| Port | `0` = 80 (or 443 with TLS) |
| User / Password | VAPIX account. **Digest and basic auth both work.** |
| Use HTTPS | enable for TLS cameras |
| State poll | seconds between live-state refreshes (0 = off) |

On connect the module discovers presets, guard tours, CamStreamer streams,
CamOverlay services and CamSwitcher views, and populates the action dropdowns.

## Actions

- **PTZ Preset / Home** — recall a preset (or Home), per view-area channel.
- **AXIS Guarded Tour** — start / stop / toggle a guard tour.
- **CamStreamer Stream** — start / stop / toggle a stream.
- **CamOverlay Widget** — enable / disable / toggle one overlay service
  (read-modify-write, so other services are preserved).
- **CamSwitcher Source** — switch the active playlist / view.

## Feedbacks

Boolean feedbacks tint a button when a **stream is live**, an **overlay is enabled**,
or a **guard tour is running** — driven by the state poll.

## Variables

- `$(axis:streams_on)` — number of live streams
- `$(axis:tour_running)` — `yes` / `no`
