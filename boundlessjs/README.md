# boundless.js

boundless.js is the client of BoundlessNYC: a three.js (r185) WebGL2 application that streams the compiled city and
renders and simulates it. The same page runs in three settings:

- interactively in a browser;
- headless under the render harnesses in `../tools/`;
- as the world of the simulation server (`?api=1`), stepped by the Electron host in `../server/`.

## Run

```
npm install
npm run dev                  # http://127.0.0.1:5219 (strict port)
```

`public/tiles/` and `public/textures/cityao.*` must exist first; [../BUILDING.md](../BUILDING.md) (section 2) explains
how to download or compile them. Click the canvas to capture the pointer. The session starts as a free-flying camera
over Morningside Heights.

### Controls

| Input | Action |
|---|---|
| W A S D, mouse | move, look |
| Shift / Ctrl | rise / descend |
| Tab | toggle free-flying camera and first-person pedestrian view |
| 1 – 6 | teleport: Morningside Heights, Harlem 125th St, Times Square, Midtown 34th St, Civic Center, Financial District |
| T | time of day: day, golden hour, dusk, night |
| R | rain on/off (wet streets, puddles, precipitation) |
| G | graphics and weather editor |
| P | hide the HUD (photo mode) |
| L | copy a link to the current camera pose |
| O | automatic tour of the teleport locations |
| H | help overlay |

### URL parameters

| Parameter | Effect |
|---|---|
| `spawn=columbia\|harlem\|timessq\|esb\|bkbridge\|wallst` | start location |
| `x=…&y=…&z=…&yaw=…&pitch=…` | start pose in world metres and radians (the format the `L` key produces) |
| `time=day\|golden\|dusk\|night` | time of day |
| `rain=0…1`, `snow=0…1`, `cloud=0…1` | weather |
| `hud=0` | hide the HUD |
| `api=1` | server mode: fixed-step simulation driven by the TCP API (set by the server) |

## Architecture

| Path | Contents |
|---|---|
| `src/core/engine.js` | renderer, cascaded shadows, TAA, post-processing chain, frame loop, fixed-step and sim-only frames |
| `src/world/` | tile streaming (`streamer.js`: near tiles within 1 km, far tiles within 13 km), tile decoding and read-time overrides (`tiledata.js`), mesh assembly (`assemble.js`), facade, ground and water shaders (`materials.js`), facade dressing (`nycDress.js`), physical sky and image-based lighting, weather |
| `src/city/` | instanced street furniture, 55 landmark builders, bridges, elevated rail, Columbia campus, trees, storefront signage and named storefronts, rooftop equipment, colliders |
| `src/sim/` | vehicle traffic (IDM car following on the lane graph, signal phases, turns), pedestrians (sidewalk graph, signal-aware crossings, vehicle avoidance), the vehicle fleet and animated crowd renderers |
| `src/perception/` | semantic, instance and depth rendering with synchronous readback; per-object labels (visible and amodal boxes, occlusion, 3D pose) |
| `src/api/bridge.js` | server-side API: actors, sensors, stepping, map queries (see `../docs/api/`) |
| `src/shared/` | projection and tiling (`geo.js`), landmark registry and building overrides (`landmarkSpec.js`) |
| `tools/pipeline/` | city compiler: `fetch.mjs` (open-data download), `compile.mjs` (tiles, far tiles, bridges, occlusion bake), `classify.mjs`, `rooftops.mjs`, `columbia.mjs`, `elevated.mjs`, `extract3d.mjs` |
| `tools/tests/` | geometry and tiling tests (`npm test`) |
| `public/` | texture, model, LUT, font and data banks fetched at run time |

Tiles are 512 m squares in a metric frame with x east and z south. Each tile carries building prisms with
per-building attributes, road and sidewalk surfaces, lane paint, the lane and sidewalk graphs, furniture placements and
tree records. `../src/` holds the procedural building generator shared with the client through the `@nyc` alias.

## Further documentation

- [docs/NYC_BUILDINGS.md](docs/NYC_BUILDINGS.md): the building dresser and the procedural generator in `../src/`.
- [docs/PERFORMANCE.md](docs/PERFORMANCE.md): rendering performance architecture and measurement protocol.
- [DATA_SOURCES.md](DATA_SOURCES.md): every dataset, the fields used and their provenance.
- [../docs/techniques.md](../docs/techniques.md), [../docs/typology/](../docs/typology/),
  [../docs/interior-mapping.md](../docs/interior-mapping.md): rendering techniques and building typologies.
