# Building from source

This document covers the interactive client, the city compiler, the simulation server and the Python package. The
reference platform is Windows 11 x64 with Node.js 24 and an NVIDIA RTX 3060 Laptop GPU. The client and compiler are
platform-independent. Commands are written for a POSIX shell; on Windows, use Git Bash.

## Requirements

| Component | Requirement |
|---|---|
| Client, compiler, server | Node.js ≥ 22.12 and npm (Vite 8) |
| Rendering | A WebGL2-capable browser and GPU; a discrete GPU is recommended |
| Binary banks | About 3.1 GB of disk; compiling the tiles needs about 3.3 GB more for raw downloads and a 6 GB Node heap |
| Python API | Python ≥ 3.8; `numpy` optional; [uv](https://docs.astral.sh/uv/) optional (wheel builds) |
| Downloads | `huggingface_hub` ≥ 1.0 for the `hf` command (`pip install -U huggingface_hub`; tested with 2.0) |

## 1. Dependencies

```
git clone https://github.com/mkturkcan/boundless-nyc.git
cd boundless-nyc
npm install                        # three.js, postprocessing, n8ao (shared by boundlessjs/ and src/)
(cd boundlessjs && npm install)    # Vite, earcut, ez-tree
(cd server && npm install)         # Electron runtime and packager; simulation server only
```

Recent npm releases may skip dependency install scripts. If `server/node_modules/electron/dist/` is missing after
the install, run `node node_modules/electron/install.js` in `server/`. Release builds do not need this step, because
the packager fetches the runtime itself.

## 2. Binary banks: tiles, models, textures

Three binary banks under `boundlessjs/public/` are not under version control. The Hugging Face dataset
`mehmetkeremturkcan/boundless-nyc` distributes them (folder `Content/`):

| Folder | Contents |
|---|---|
| `tiles/` | the compiled city |
| `models/` | vehicles, pedestrians, props |
| `textures/` | PBR sets, sky HDRIs, the city-scale sky-occlusion bake `cityao.*` |

The smaller banks (`basis/`, `data/`, `fonts/`, `luts/`, `settings/`) are committed.

### 2a. Download (recommended)

```
hf download mehmetkeremturkcan/boundless-nyc --repo-type dataset --revision v0.1.0 \
    --include "Content/tiles/*" --include "Content/models/*" --include "Content/textures/*" --local-dir .cache/hf
mv .cache/hf/Content/tiles .cache/hf/Content/models .cache/hf/Content/textures boundlessjs/public/
```

This fetches 3,737 files (3.1 GB). While the dataset is private, run `hf auth login` first with an account that has
access.

### 2b. Compile the tiles from public records

The models and textures come from the download in any case (omit `Content/tiles/*` from the command above). The
tiles and the occlusion bake can be rebuilt from the public sources:

```
cd boundlessjs
npm run fetch -- --boro 1,2,3,4      # NYC Open Data and NY State open data -> data/raw/ (cached; about 2.4 GB)
npm run compile -- --boro 1,2,3,4    # -> public/tiles/, public/textures/cityao.*
```

Boroughs are 1 Manhattan, 2 the Bronx, 3 Brooklyn and 4 Queens. `fetch` pages through the Socrata endpoints listed in
[boundlessjs/DATA_SOURCES.md](boundlessjs/DATA_SOURCES.md) and skips cached files. `compile` writes 2,884 near tiles
(512 m), 210 far-field tiles (2,048 m), the bridge alignments and the occlusion bake.

The inputs below are optional. The compiler uses each one when it is present in `boundlessjs/data/raw/`. The
published tiles were compiled with all of them.

| Input | How to obtain | Effect |
|---|---|---|
| `osm_buildings_<boro>.json` | `node tools/osm_fetch.mjs <boro>` (Overpass; OpenStreetMap, ODbL) | footprints absent from the city file |
| `osm_columbia.xml` | `curl -o data/raw/osm_columbia.xml "https://api.openstreetmap.org/api/0.6/map?bbox=-73.9648,40.8045,-73.9575,40.8112"`, then `node tools/pipeline/columbia.mjs` | Columbia campus micro-map: lawns, walks, steps, monuments, terrace grades |
| `bus_lanes.json` | NYC Open Data, *Bus Lanes – Local Streets* (`ycrg-ses3`), JSON rows | red bus lanes |
| `watertanks_bins.json`, `greenroofs_tnc.csv`, `solar_nyserda.json`, `roofpedia_NY_{green,solar}.geojson` | DOB water-tank inspections, TNC green-roof inventory, NYSERDA distributed solar, Roofpedia; formats in `tools/pipeline/rooftops.mjs` | rooftop water tanks, green roofs, solar arrays |
| `park_elev_<boro>.json` | `node tools/pipeline/fetch_elev.mjs --boro <n>` (USGS 3DEP) | park relief; used only with `TERRAIN=real` (the default compile is flat) |

The derived files in `boundlessjs/public/data/` are committed: the campus features, the elevated-rail structures and
the CityGML landmark meshes. Regenerating them is optional; see the headers of `tools/pipeline/columbia.mjs`,
`elevated.mjs` and `extract3d.mjs`.

`tools/assets/` contains the scripts that built the vehicle and pedestrian banks: retargeting, texture baking and NYC
liveries. Rerunning them requires the CARLA 0.10.0 release, the 100STYLE archive and an Unreal-asset extraction step
that is not part of this repository.

## 3. Interactive client

```
cd boundlessjs
npm run dev                          # http://127.0.0.1:5219
```

Controls and URL parameters are listed in [boundlessjs/README.md](boundlessjs/README.md).

## 4. Simulation server from source

The server is an Electron host. It loads the client with `?api=1`, steps it on request and serves the TCP API
(default port 2000).

```
(cd boundlessjs && npm run dev)      # terminal 1: client at :5219
(cd server && npm run dev)           # terminal 2: server on 127.0.0.1:2000, page from the dev server
pip install -e PythonAPI             # terminal 3
python PythonAPI/examples/quickstart.py
```

Server options: `--port`, `--host`, `--res WxH`, `--headless`, `--content <dir>`, `--time day|golden|dusk|night`,
`--quality high|medium`, `--start-lat/--start-lon` and `--verbose`. A URL option must use the `=` form, for example
`--dev-url=http://127.0.0.1:5219`.

## 5. Release build

```
node server/build.mjs [--link] [--zip] [--skip-content] [--platform linux] [--out <dir>]
```

The command produces `release/BoundlessNYC_<version>_<platform>/` in four steps:

1. Package the server with `@electron/packager`.
2. Run the Vite production build and assemble `Content/`, which holds the built client and every runtime asset
   (`tools/package.mjs --content-only`).
3. Copy `PythonAPI/` and build its wheel when `uv` is available.
4. Write `Docs/`, the launchers (`StartServer[_Headless].bat|.sh`), the legal files and `RELEASE.json`.

Options:

- `--link` hardlinks `Content/` instead of copying it; the output must be on the same volume.
- `--skip-content` keeps `Content/` from the previous build.
- `--platform linux` cross-packages a Linux x64 server. It downloads that Electron runtime once. It has not been
  tested for this release.

## 6. Python package

```
pip install -e PythonAPI                          # editable install from source
uv build --wheel PythonAPI                        # -> PythonAPI/dist/boundless-<version>-py3-none-any.whl
```

The package has no required dependencies. `numpy` enables the array accessors (`to_numpy`, `instance_ids`, `mask`).

## 7. Static web package

```
node tools/package.mjs [--zip] [--link] [--verify]
```

This writes `dist-package/`: the built client, its runtime assets and a dependency-free static server
(`start.cmd` / `start.sh`). The client fetches `/settings/graphics.json` from the server root, so serve the package
at a root path, not a sub-path.

## 8. Tests

```
(cd boundlessjs && npm test)         # geometry and tiling invariants (tools/tests/geometry.mjs, 81 checks)
```

## Coordinate frames

- **Client and tiles.** Metres, with x east and z south; +y is up. Tiles are 512 m squares on the projected plane
  (`boundlessjs/src/shared/geo.js`).
- **Python API.** ENU metres (x east, y north, z up) from 40.7831 N, 73.9712 W. Rotations are pitch, yaw and roll in
  degrees, with yaw counter-clockwise from east. Attachment offsets are x forward, y left, z up.
