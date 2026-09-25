# Acknowledgements and attributions

BoundlessNYC is compiled almost entirely from public records and openly licensed assets. This file lists every
external source contained in the repository, the compiled city or the release builds, with the attribution each
licence requires. [LICENSING.md](LICENSING.md) gives the licence of each part of the project, and
[boundlessjs/DATA_SOURCES.md](boundlessjs/DATA_SOURCES.md) records, field by field, what each dataset contributes.

## City data

**City of New York, NYC Open Data** (NYC Open Data terms of use):

- Building Footprints (`5zhs-2jue`)
- PLUTO (`64uk-42ks`)
- DOB NOW: Safety – Facades Compliance Filings (`xubg-57si`)
- Street Centerline, CSCL (`inkn-q76z`)
- 2015 Street Tree Census (`uvpi-gqnh`)
- NYCDEP Citywide Hydrants (`5bgh-vtsn`)
- Parks Properties (`enfh-gkve`)
- Borough Boundaries (`gthc-hcne`)
- Bus Stop Shelters (`t4f2-8md7`)
- LinkNYC Kiosks (`s4kf-3yrf`)
- DOT Bicycle Parking (`592z-n7dk`)
- Bus Lanes – Local Streets (`ycrg-ses3`)
- drinking-water tank inspection records (building identification numbers only)
- the DoITT NYC 3D Building Model (CityGML LOD2, 2014)

**New York State, data.ny.gov.**

- MTA Subway Entrances and Exits, 2024 (`i9wp-a4ja`)
- NYSERDA Statewide Distributed Solar Projects (locations, module counts)

**OpenStreetMap contributors.** The project uses `building:colour` tags, gap-fill building footprints, the Columbia
University campus micro-map and elevated-rail alignments. © OpenStreetMap contributors, available under the Open
Database Licence (ODbL 1.0), <https://www.openstreetmap.org/copyright>. Data derived from OpenStreetMap is contained
in the compiled tiles and in `boundlessjs/public/data/`, and is available under the ODbL 1.0. The attribution must
accompany any distribution of the compiled city or imagery rendered from it.

**U.S. Geological Survey.** 3DEP elevation (via AWS Terrain Tiles) for park relief. Public domain.

**Rooftop inventories.**

- M. L. Treglia et al., green-roof footprints for New York City, The Nature Conservancy (2016).
- A. Wu and F. Biljecki, *Roofpedia: automatic mapping of green and solar roofs for an open roofscape registry and
  evaluation of urban sustainability*, Landscape and Urban Planning 214 (2021),
  <https://github.com/ualsg/Roofpedia>.

**Federal Highway Administration.** Pavement-arrow outlines (MUTCD 2009, Figure 3B-24) and the Standard Alphabets
for Traffic Control Devices (Series C) glyph outlines, extracted from the official PDFs. Public domain.

## 3D models and animation

- **CARLA Simulator** (<https://carla.org>), assets under **CC BY 4.0**.
  - `boundlessjs/public/models/carla/`: vehicles and about 180 street, construction and trash props, converted
    from CARLA 0.9.15.
  - `boundlessjs/public/models/fleet24/`: 13 vehicle models, converted from CARLA 0.10.0.
  - `boundlessjs/public/models/peds24/`: 25 pedestrian bodies in 37 outfit variants, converted from CARLA 0.10.0.

  NYC-specific edits: taxi and police liveries, New York licence plates, a plain white box-truck body, removed CARLA
  lettering and recalibrated skin tones. *Vehicle and pedestrian models: CARLA Simulator (carla.org), CC BY 4.0.*

  The pedestrian bank contains components created with Epic Games' MetaHuman. Those components are subject to Epic's
  MetaHuman licence in addition to CC BY 4.0, which does not allow using them to build or enhance a database or to
  train or test AI models.
  See the MetaHuman notice in [LICENSING.md](LICENSING.md) and the server option `--pedestrians procedural`.
- **100STYLE** locomotion dataset: I. Mason, S. Starke and T. Komura, *Real-Time Style Modelling of Human Locomotion
  via Feature-Wise Transformations and Local Motion Phases*, 2022, Zenodo record 8127870. **CC BY 4.0.** Sixteen
  styles (walk and idle) and four further walks are retargeted onto the pedestrian skeleton
  (`peds24/clips_gen2.bin`).
- **Bag and backpack models** (Sketchfab, obtained via Objaverse 1.0), each **CC BY 4.0**:
  - "Retreat Herschel bag" by alban
  - "Kanken backpack" by Modelified (recoloured)
  - "Sling Bag" by Hydro3D Solution
  - "Feuerwear Shoulder Bag Walter UK" by Feuerwear
  - "Worn leather handbag" by Lassi Kaukonen

## Textures, skies and fonts

- **Poly Haven** (<https://polyhaven.com>), **CC0 1.0**:
  - PBR sets: `asphalt_02`, `dirty_concrete`, `leafy_grass`, `concrete_pavement_03`, `red_bricks_04`,
    `brown_brick_02`, `white_bricks`, `sandstone_blocks_04`, `plastered_wall_05`
  - eight 4K sky HDRIs
- **ambientCG** (<https://ambientcg.com>), **CC0 1.0**: Asphalt025C, Concrete031, Grass004, PavingStones128,
  Bricks090.
- **Inter** by Rasmus Andersson, **SIL Open Font License 1.1** (`boundlessjs/public/fonts/OFL.txt`).
- The colour-grade LUTs in `boundlessjs/public/luts/` and the storefront signage are generated in this repository.

## Software

| Component | Licence | Use |
|---|---|---|
| three.js 0.185 | MIT | renderer (bundled) |
| postprocessing 6.39 | Zlib | post-processing passes (bundled) |
| n8ao 2.0 | ISC | ambient occlusion (bundled) |
| ez-tree 1.1 (Dan Greenheck) | MIT | parametric trees (bundled) |
| earcut 3.2 | ISC | polygon triangulation (bundled, compiler) |
| meshoptimizer decoder | MIT | mesh decompression (bundled) |
| Basis Universal transcoder | Apache-2.0 | KTX2 texture transcoding (bundled) |
| Electron 44 (Chromium, Node.js) | MIT; Chromium licences in `LICENSES.chromium.html` | simulation server runtime (release builds) |
| Vite 8, pngjs | MIT | build and tooling |
| @electron/packager | BSD-2-Clause | release packaging |
| Playwright, puppeteer-core | Apache-2.0 | headless render harnesses (tooling only) |
| ffmpeg-static | GPL-3.0-or-later | video tooling only; not bundled or distributed |
| Turbo colour map, polynomial fit (Anton Mikhailov, Google) | Apache-2.0 | depth visualisation in `tools/figures/` |

Design references, both MIT-licensed: BuildingGeneratorThreeJS by achrefelouafi for the precipitation and
wet-surface model and the window air-conditioner kit, and Threejs-Awesome-Graphics-Agent-Skills for the
precipitation-surface conventions.

## Reference imagery

During development, Google Street View panoramas and web photographs of New York buildings were viewed as visual
references for comparison renders. They are not contained in this repository, the compiled city or any release. No
such image has been used as a texture, as a source of geometry or as training data.

## Related publication

M. K. Turkcan, Y. Li, C. Zang, J. Ghaderi, G. Zussman and Z. Kostic. *Boundless: Generating photorealistic
synthetic data for object detection in urban streetscapes.* arXiv:2409.03022, 2024.
<https://arxiv.org/abs/2409.03022>
