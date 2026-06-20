# companion-module-axis-camera-control

Fifth member of the *Stream Deck on Axis* family — a native **Bitfocus Companion**
module. Unlike the Generic-HTTP button page (`../companion-for-axis/`), this gives
real dropdown actions populated from the camera, live-state **feedbacks**, and
proper **digest auth** (so it works on default Axis configs).

Same command set as the other plugins; `src/camera.ts` is the TypeScript port of
`macro-deck-for-axis/CameraClient.cs`.

## Build & dev

Companion modules are Node 22 / TypeScript and run as isolated child processes
(a crash can't take down Companion — unlike the Logi host).

```bash
corepack enable            # provides yarn 4
yarn install
yarn build                 # -> dist/main.js
```

Develop with hot output:
```bash
yarn dev                   # tsc --watch
```

### Load it into Companion (dev)

Point Companion at a folder of dev modules:
1. Companion launcher → **Settings** → set **Developer modules path** to the folder
   *containing* this module directory.
2. Restart Companion; the **Axis Camera Control** connection appears under
   *Add connection*.
3. Add it, enter IP / user / password, and the actions/feedbacks populate.

### Package for distribution
```bash
yarn package               # builds + produces the module package via companion-module-build
```

## Layout

```
companion/manifest.json    module manifest (id: axis-camera-control)
companion/HELP.md          in-app help
src/main.ts                InstanceBase: connect, discover, poll, wire everything
src/camera.ts              VAPIX/CamStreamer/CamOverlay/CamSwitcher client + digest auth
src/config.ts              connection settings (host/port/user/pass/tls/poll)
src/actions.ts             5 actions, dropdowns built from discovery
src/feedbacks.ts           stream live / overlay on / tour running (boolean)
src/variables.ts           streams_on, tour_running
src/upgrades.ts            (empty)
```

## Status / TODO

- Type-checks and builds clean against `@companion-module/base` 2.0.4 + TypeScript 5.9
  (verified with `tsc -p tsconfig.build.json`). `node_modules`/`dist` are not committed —
  run `yarn install` then `yarn build`.
- Presets (ready-made button templates) not yet defined.
- Could add per-channel PTZ and absolute pan/tilt/zoom later.
