# boundless.js — rendering performance notes

Target set by the project owner: 60 fps at native resolution **with no visual
change**. Everything below is a lossless restructuring of how the same pixels
are drawn. Numbers are for the Harlem / 125th St street view at 1760×990 on an
RTX 3060 Laptop GPU through Chrome's ANGLE/D3D11 backend.

## Measure first — and with the right meter

- `Engine.fps` used to average a dt **clamped to 50 ms**, so it could never
  report worse than 20 fps. It reported 22–25 fps while the real rate was 3.2.
  `engine.rawDt` is unclamped and feeds fps/profiling now.
- `node tools/bshot.mjs --views harlem125 --wait 80 --fps <layers>` (run from
  the repo root) launches Chromium on the discrete GPU with vsync and the frame
  limiter off, waits for the tiles and the dresser, then samples the real frame
  rate from Node while hiding scene layers one at a time (`window.__LAYER`).
  `--tris` gives deterministic per-layer draw/triangle counts, `--ab` toggles
  the sort/sky changes in-session, `--node dx,dz,dy,pitch` snaps the camera to
  the nearest junction, `--who <MaterialType>` names anonymous meshes.
- Never edit `src/` or `public/` while a run is in flight: Vite reloads the page
  and the probes measure an empty scene. GPU timer queries (`__PASSES`) stall
  the D3D11 pipeline; use them for relative pass shares only. The GPU heats up
  over back-to-back runs (clocks drop) — compare A/B inside one session
  (`--ab`) rather than across runs.

## What was wrong and what replaced it

| cost | cause | fix |
|---|---|---|
| ~250 ms/frame | `THREE.BatchedMesh` furniture: WEBGL_multi_draw is emulated per draw on ANGLE/D3D11 → ~45k driver draws per pass | `city/instancer.js` v4: one InstancedMesh per pool, CPU frustum compaction into the draw buffer each frame (padded frustum, recomputed when the camera moves), a second instance set culled to the near shadow cascade box and shown only during the shadow pass, 20-tri proxies for the cached far cascade |
| 64k instances in view | rooftop clutter (vents, goosenecks, pipe runs…) drawn from street level where parapets hide it | low roof items skipped when the camera is >1.5 m under their base and >25 m away |
| 14M tris | every tree at full ez-tree detail | LOD build past 120 m (¼ of the triangles), same seed/height |
| 13M tris | every vehicle in every pass | `sim/vehicleCull.js`: per-frame frustum compaction for moving + parked pools, shadow-only sets, collision-shell LOD past 120 m (the parked fleet's existing swap) |
| overdraw of the heaviest shaders | three sorts opaques by object *origin*; baked world-space tile meshes all sit at the origin; water was `renderOrder -3`, sky is camera-centred | `renderer.setOpaqueSort` by bounding-sphere centre distance; water, far terrain and the sky dome draw after the city |
| ~700 draws | 628 bridge parts, 148 dresser part pools, 110 hero trims, 274 far-terrain skirts, 4 sign/decal meshes per tile as separate meshes | `bridgeKit.js` merges per material; `world/staticPool.js` bakes many small static geometries into one mesh per material (dresser parts, hero trims, far-terrain skirts, sign text / decals / billboards / shop signs) |
| 49M-tri spikes | far cascade re-rendered every 3 s and every 24 m | re-render only on sun movement, 64 m of travel or tile changes; casters exclude vehicles/props (proxies for trees) |

Shadow-pass hooks: `engine.addShadowListener(fn)` fires `nearBegin/nearEnd`
and `farBegin/farEnd` around the two cascade renders (three itself tests
casters against the *scene* camera's layers, so `shadow.camera.layers` never
filtered anything).

## Where the frame goes now (v7, 38 ms)

furniture 7.4 · far tiles 6.2 · dresser 5 (fragment-bound: glass + triplanar
grunge) · buildings 3.6 · ground 3.0 · sky 2.9 (moved after the city in v8) ·
shadow sets 2.8 · vehicles 2.5 · post chain ~4 · rest ~2. Draw calls
1,046 → 563 per frame, triangles 78M → 16M.

## Debug hooks (console)

`__PERF()` counters · `__PROF()` per-system CPU (needs `?prof=1`) · `__TRIS()`
per-layer draws/tris · `__LAYER(name, vis)` · `__SHADOWSETS(on)` ·
`__SHADOWDBG()` per-pool instance counts · `__SORT(on)` · `__SKYORDER(n)` ·
`__GOTO_NODE(dx, dz, dy, pitch)` · `__POOLS()` · `__REST()` · `__WHO(type)`.
Query flags: `?cull=0` (draw every instance), `?nodress=1`, `?nosim=1`,
`?noshadow=1`, `?nocascade2=1`, `?nofar=1`, `?nopost=1`, `?prof=1`.
