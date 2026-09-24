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
| Vehicle and prop models | dataset `Content/models/fleet24/`, `Content/models/carla/` | CC BY 4.0, CARLA Simulator |
| Pedestrian models | dataset `Content/models/peds24/` | CC BY 4.0, CARLA Simulator, **and Epic Games' MetaHuman terms** |
| Pedestrian motion clips | dataset `Content/models/peds24/clips_*.bin` | CC BY 4.0, 100STYLE |
| Bag and backpack models | baked into `Content/models/peds24/` | CC BY 4.0, individual authors ([ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md)) |
| Textures and sky HDRIs | dataset `Content/textures/` (except `cityao.*`) | CC0 1.0, Poly Haven and ambientCG |
| Inter typeface | `boundlessjs/public/fonts/` | SIL Open Font License 1.1 |
| Libraries bundled in the built client | dataset `Content/assets/` | three.js MIT, postprocessing Zlib, n8ao ISC, ez-tree MIT, meshoptimizer MIT, Basis Universal Apache-2.0 |
| Electron and Chromium runtime | release builds | MIT (`LICENSE.electron.txt`) and the Chromium licences (`LICENSES.chromium.html`) |

## The compiled city

The tiles combine NYC Open Data and New York State open data with data from OpenStreetMap: building colours,
footprints the city file lacks, the Columbia campus map and the elevated-rail alignments. A database derived from
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
currently operates through the Unreal Engine EULA, in addition to CC BY 4.0. Epic's terms permit MetaHuman characters
in other engines and software, including commercial projects. They do not permit using MetaHumans to train or enhance
artificial-intelligence models, and revenue thresholds apply to commercial users. Read Epic's current terms before
relying on this summary.

In practice:

- **Exploring, rendering and publishing images or video.** Use the photoreal pedestrians, with the attributions above.
- **Frames meant to train, fine-tune, test or benchmark a machine-learning model.** Render without the MetaHuman-derived
  assets, unless Epic's terms permit your use. The simulation server does this with `--pedestrians procedural`. It
  replaces the bank with the built-in procedural pedestrians, which use no third-party assets and are MIT-licensed
  like the rest of the code, and it exposes one walker blueprint, `walker.pedestrian.procedural`. In the browser
  client, the URL parameter `?crowd=0` does the same.
