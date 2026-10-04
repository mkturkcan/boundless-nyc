# Licensing

BoundlessNYC combines original code, original documentation, data compiled from public records and third-party
assets. Each part carries its own licence. In short: code is MIT, documentation and original media are CC BY 4.0, the
compiled city is ODbL 1.0 because it contains OpenStreetMap data, and third-party assets keep their licences. The
photoreal pedestrians additionally fall under Epic Games' MetaHuman terms (see the notice below).

| Part | Location | Licence |
|---|---|---|
| Source code | everything in this repository unless listed below | [MIT](LICENSE) |
| Documentation, figures and other original media | `docs/`, the READMEs, `docs/assets/figures/`, `boundlessjs/public/luts/` | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Compiled city: tiles, derived data and the sky-occlusion bake | dataset `Content/tiles/`, `Content/data/`, `Content/textures/cityao.*`; `boundlessjs/public/data/` | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) |
| Data modules with OpenStreetMap-derived positions and outlines | the files under `boundlessjs/src/` whose header carries the ODbL notice (`city/cpLandData.js`, `cpFloraData.js`, `cpReliefData.js`, `cpLandmarks.js`, `cpLandmarksKit.js`, `cpBethesdaKit.js`, `w125eData.js`, `w125wData.js`, `hptSignData.js`, `hptSignSouth.js`, `hptShoreData.js`, `bryantParkData.js`, `world/vg37Data.js`) | ODbL 1.0 for the data they hold; the code around it is MIT |
| Vehicle and prop models | dataset `Content/models/carla/`, the CARLA-derived models in `Content/models/fleet24/` | CC BY 4.0, CARLA Simulator |
| Vehicle bodies from Sketchfab | dataset `Content/models/fleet24/taxinv200.glb`, `boxtruck26_vh36.glb` | CC BY 4.0, memoov and mekanismo ([ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md)) |
| Original models: the NYC buses, service and delivery vehicles, the street trees, the Blender tree set | dataset `Content/models/fleet24/` (`mtalfs`, `mtalfsa`, `mtalfsal`, `mtaxd40`, `mtaxd60`, `nypd`, `uspsllv`, `uspsngdv`, `dsny`, `schoolbus`, `stepvan`, `cargovan`, `boxtruck26`, `foodtruck`, `icecream`), `Content/models/trees36/`, `Content/models/bxtrees/`, `Blender/bxtrees/` | CC BY 4.0, M. K. Turkcan; the leaf and bark textures in them are CC0 1.0 |
| Bethesda Fountain figures | dataset `Content/models/cp33/bethesda/` | `angel.glb` CC BY 4.0, "Engel" by noe-3d.at; `cherub.glb` CC0 1.0, "Putto auf Fisch" by noe-3d.at |
| Central Park boulders | dataset `Content/models/cp33/rocks/` | CC0 1.0, Poly Haven scans |
| Pedestrian models | dataset `Content/models/peds24/`, the rowboat passengers baked from them in `Content/models/cp33/lakeside/people/` | CC BY 4.0, CARLA Simulator, **and Epic Games' MetaHuman terms** |
| Pedestrian models, Rocketbox set | dataset `Content/models/peds24/rb27/` | MIT, Microsoft Rocketbox Avatar Library (`rb27/NOTICE.md`) |
| Pedestrian motion clips | dataset `Content/models/peds24/clips_*.bin` | CC BY 4.0, 100STYLE |
| Bag and backpack models | baked into `Content/models/peds24/` | CC BY 4.0, individual authors ([ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md)) |
| Textures and sky HDRIs | dataset `Content/textures/` (except `cityao.*`), `Blender/bxwin/` | CC0 1.0, Poly Haven and ambientCG |
| Alma Mater statue model | dataset `Content/models/landmarks/alma_mater.glb` | CC BY 4.0, M. K. Turkcan, photogrammetry scan ([doi:10.5281/zenodo.10312053](https://doi.org/10.5281/zenodo.10312053)) |
| Inter typeface and the Times Square display typefaces | `boundlessjs/public/fonts/`, the display families in `boundlessjs/public/fonts/ta31/` (listed with their copyright holders in `FONTS.txt`, each licence beside its files) | SIL Open Font License 1.1 |
| Sign typefaces of 125th Street and Hunters Point | `boundlessjs/public/fonts/ar33/` (listed with their copyright holders in `FONTS.txt`, each licence beside its files) | SIL Open Font License 1.1; Apache License 2.0 for Roboto Slab and Yellowtail |
| Libraries bundled in the built client | dataset `Content/assets/` | three.js MIT, postprocessing Zlib, n8ao ISC, ez-tree MIT, meshoptimizer MIT, Basis Universal Apache-2.0 |
| Electron and Chromium runtime | release builds | MIT (`LICENSE.electron.txt`) and the Chromium licences (`LICENSES.chromium.html`) |

## The compiled city

The tiles combine NYC Open Data and New York State open data with data from OpenStreetMap: building colours,
footprints the city file lacks, the Columbia campus map and the elevated-rail alignments. The data modules listed in the
table carry further OpenStreetMap data (Central Park, 125th Street, Hunters Point, Bryant Park, hedges and beds) into
the client. A database derived from
OpenStreetMap must be shared under the Open Database License, so the compiled city is released under ODbL 1.0.
Redistributions and derived databases must carry the notice "© OpenStreetMap contributors" and remain under the
ODbL.

Images, videos and labels rendered from the compiled city are Produced Works under the ODbL. You may license them as
you choose, provided they carry the attribution "© OpenStreetMap contributors". Where vehicles or pedestrians appear,
they must also carry "CARLA Simulator (carla.org), CC BY 4.0". The MetaHuman notice below still applies to the
photoreal pedestrians.

## MetaHuman notice

The photoreal pedestrians are converted from the CARLA 0.10.0 walkers, which CARLA distributes under CC BY 4.0. Their
asset names indicate components created with Epic Games' MetaHuman. All 25 bodies have material instances with an
`_MH` suffix (128 of 249 material slots) and use MetaHuman-style eye materials (`MI_EyeRefractive`,
`MI_EyeOcclusion`). Which meshes and textures derive from MetaHuman cannot be established from the assets, so the
whole pedestrian bank is flagged:

- `Content/models/peds24/manifest.json` carries `"metahuman": true` in its `license` block;
- `Content/models/peds24/NOTICE.md` repeats this notice next to the assets.

MetaHuman-derived components are subject to Epic's MetaHuman licence (<https://www.metahuman.com/license>), which
operates through the Unreal Engine EULA, in addition to CC BY 4.0. On artificial intelligence the licence states:

> You can use MetaHuman characters and animation in workflows that incorporate artificial intelligence technology.
> However, you may not use MetaHuman characters or animation curves to build or enhance any database or train or test
> artificial intelligence, machine learning, deep learning, neural networks, or similar technologies (as further
> detailed in the Unreal Engine EULA). This includes the use of rendered output from MetaHuman digital characters and
> animation curves, if created to replicate the functionality of MetaHuman.

The Unreal Engine EULA gives the full terms. Read Epic's current terms before relying on this notice.

In practice:

- **Exploring, rendering and publishing images or video, and workflows that incorporate AI technology.** The
  photoreal pedestrians may be used, with the attributions above.
- **Building or enhancing a dataset, and training or testing a model.** This covers the simulator's main uses:
  recording labelled frames, and training or evaluating perception, prediction or driving models on such frames or in
  closed loop. Do not use the MetaHuman-derived assets for these unless Epic's terms permit your use. Start the
  simulation server with `--pedestrians procedural`: it replaces the bank with the built-in procedural pedestrians,
  which use no third-party assets and are MIT-licensed like the rest of the code, and it exposes one walker blueprint,
  `walker.pedestrian.procedural`. In the browser client, the URL parameter `?crowd=0` does the same.
