# Data sources & provenance

Every dataset the pipeline ingests, what we take from it, and where it lands.
All fetches are cached in `data/raw/` (re-run `npm run fetch -- --boro 1,2,3,4` to refresh;
cached files are skipped). Compiled output: `public/tiles/`.

## NYC Open Data (Socrata, data.cityofnewyork.us — public domain / NYC Open Data terms)

| Dataset | ID | Cache file | What we use |
|---|---|---|---|
| **Building Footprints (BUILDING)** | `5zhs-2jue` | `buildings_<boro>.geojson` | Real footprint polygon, `height_roof` (ft), `ground_elevation` (ft), `construction_year`, `bin`, `mappluto_bbl` → building massing, terrain samples, BBL join key |
| **PLUTO** | `64uk-42ks` | `pluto_<boro>.csv` | `numfloors`, `yearbuilt`, `bldgclass`, `landuse`, `histdist`, `address` → floor counts, facade style/palette classification, storefront logic |
| **DOB NOW: Safety – Facades Compliance Filings (FISP/Local Law 11)** | `xubg-57si` | `fisp.csv` | `bin`, `exterior_wall_material_s_`, `exterior_wall_type_s_`, `filing_date` → **real facade material per building** (MASONRY / TERRA COTTA / NATURAL STONE / CAST STONE / CONCRETE / STUCCO-EIFS / GLASS / METAL; CURTAIN WALL detection). Mandatory filings for every NYC building over 6 stories; latest filing per BIN wins. Overrides the class-based palette in `classify.mjs`. |
| **Street Centerlines (CSCL)** | `inkn-q76z` | `streets_<boro>.geojson` | Geometry, `streetwidth`, `number_travel_lanes`, `number_park_lanes`, `trafdir` (one-way), `posted_speed`, `bike_lane` (bike-lane class → green lanes), `rw_type` (street/highway/bridge/ramp/path), `from/to_level_code` (per-vertex ramp elevation), names → roadbed, sidewalks, lane paint, traffic graph, bridge alignments |
| **2015 Street Tree Census** | `uvpi-gqnh` | `trees_<boro>.csv` | `spc_common`, `tree_dbh`, lat/lon of every living street tree → species archetype, trunk size, tree-pit fences |
| **Forestry Tree Points** (NYC Parks, updated daily) | `hn5i-inap` | `forestry/forestry_<box>.json` | Living street trees (structure Full, not Dead) in the 125th Street and Hunters Point boxes: genus, `dbh`, position (fetched 2026-10-01) → `public/data/tree_forestry.json` (tools/pipeline/tree_forestry.mjs); at runtime the compiled 2015 census trees in those boxes are matched, removed or added so the streets carry the trees standing today |
| **NYCDEP Citywide Hydrants** | `5bgh-vtsn` | `hydrants.geojson` | Real hydrant positions |
| **Parks Properties** | `enfh-gkve` | `parks_<boro>.geojson` | Park polygons → lawns, park tree scatter |
| **Borough Boundaries** | `gthc-hcne` | `boundaries.geojson` | Land polygons → water mask for terrain |
| **Bus Stop Shelters** | `t4f2-8md7` | `shelters.geojson` | Shelter positions/orientation |
| **LinkNYC Kiosks** | `s4kf-3yrf` | `linknyc.geojson` | Kiosk positions |
| **DOT Bicycle Parking (CityRacks)** | `592z-n7dk` | `bikeracks.geojson` | 47,267 rack positions → bike racks, some with parked bicycles |
| **Bus Lanes – Local Streets** | `ycrg-ses3` | `bus_lanes.json` (optional) | Red-lane segments, matched geometrically to CSCL roads → red bus lanes |
| **Drinking-water tank inspections** | — | `watertanks_bins.json` (optional) | Building identification numbers of buildings with rooftop tanks → water tanks |

## NY State Open Data (data.ny.gov)

| Dataset | ID | Cache file | What we use |
|---|---|---|---|
| **MTA Subway Entrances and Exits (2024)** | `i9wp-a4ja` | `subway.csv` | Entrance stair positions → green-railing entrance kit |
| **NYSERDA Statewide Distributed Solar Projects** | — | `solar_nyserda.json` (optional) | Locations and module counts → rooftop solar arrays |

## OpenStreetMap (ODbL — attribution required if shipped)

| Data | Endpoint | Cache file | What we use |
|---|---|---|---|
| **`building:colour` tags** | Overpass API (`overpass.kumi.systems`, fallbacks in `fetch.mjs`) | `osm_colours.json` | Literal facade colours (~2.2k tagged buildings in the NYC bbox), matched to footprints by centroid (≤22m). **Note:** Overpass mirrors intermittently refuse requests (406/502); the fetch is optional — pipeline proceeds without it and picks the file up on a later successful fetch. |
| **Columbia campus micro-map** | Main OSM API `api.openstreetmap.org/api/0.6/map` (bbox `-73.9648,40.8045,-73.9575,40.8112` — works where Overpass is blocked) | `osm_columbia.xml` → `data/columbia_campus.json` (parser: `tools/pipeline/columbia.mjs`) → enriched + published to `public/data/columbia_campus.json` by `compile.mjs` | The campus detail pass: 62 lawn/garden polygons (South Field, Butler commons…), 512 footways with surfaces (paving_stones ⇒ College Walk brick, matId 10), 74 step runs (incl. the 3 "Low Library Steps" flights that also fix the campus axis), 429 individual trees (census covers street trees only), 16 walls, 61 lawn fences, 2 hedges, 15 monuments by name (**Alma Mater**, The Sundial, Scholars' Lion, Hamilton/Jefferson/Pulitzer, Curl, Three-Way Piece, Reclining Woman, Tightrope Walker, Bellerophon, Carl Schurz, Lenape), 3 fountains (Low Plaza pair), 2 flagpoles, 43 benches, 23 litter baskets. Campus terrain is a TOTAL override inside the measured superblock (`CAMPUS_RECT` in compile.mjs — property lines fit from CSCL centerlines; streets sit ~1.2–1.3° skew to the McKim axis): flat terrace pads (South Field 39.7 / College Walk 40.2 / plaza 41.4 / upper campus 46.9 / Low terrace 47.6) hand-set from footprint ground elevations + the OSM steps, since no open DEM carries the McKim split-levels crisply; College Walk + the South Field seam live in the CITY-GRID (sheared) frame along the OSM walk centerline, the rest is axis-aligned; a single 20m perimeter fade meets the street-carved grade inside the property line, and the avenues are never touched. Runtime dressing: `src/city/campus.js`. |
| **Building footprints (gap-fill)** | Overpass API via `tools/osm_fetch.mjs <boro>` (banded bbox, server rotation, User-Agent required) | `osm_buildings_<boro>.json` | Footprint polygons the DOITT file lacks (e.g. 100 W 125th St, 2017), `height` / `building:levels` / `building` tags → height and PLUTO-style class; borough-limited, overlap-deduped; 761 Manhattan + 6,417 Brooklyn added in v13 |
| **Central Park, 125th Street and Hunters Point extracts** | Overpass API (bbox extracts, 2026-09-28 to 2026-10-02) | baked into data modules under `src/city/` (`cpLandData.js`, `cpFloraData.js`, `cpReliefData.js`, `cpLandmarks*.js`, `cpBethesdaKit.js`, `w125eData.js`, `w125wData.js`, `hptSignData.js`, `hptShoreData.js`, `hptSignSouth.js`, `bryantParkData.js`; each names its OSM objects and carries the ODbL notice) | Park land cover, water bodies, paths, drives, pitches and mapped trees; landmark outlines and bridge decks; the Park Avenue Viaduct, station houses and entrances on 125th Street; Hunters Point's piers, benches, lawns and ferry routes |
| **Hedges, planted beds, scrub** | Overpass API via `boundlessjs/tools/ar35/veg/osm_vg37.mjs` | baked into `src/world/vg37Data.js` (ODbL notice in its head) | `barrier=hedge`, `landuse=flowerbed`, `natural=scrub` outlines in Central Park, Columbia's campus and Gantry Plaza: where hedges, beds and scrub grow, and where walkers and benches keep out |

## Research inventories, elevation and federal standards

| Data | Cache file | What we use |
|---|---|---|
| **Green-roof footprints for NYC** (Treglia et al., The Nature Conservancy, 2016) | `greenroofs_tnc.csv` (optional) | Building identification numbers → sedum green roofs (tools/pipeline/rooftops.mjs) |
| **Roofpedia** (Wu & Biljecki, Landscape and Urban Planning 214, 2021) | `roofpedia_NY_{green,solar}.geojson` (optional) | Detected green and solar roofs; extends the two inventories above (deduplicated within 25 m) |
| **USGS 3DEP elevation** (via AWS Terrain Tiles; public domain) | `park_elev_<boro>.json` (optional) | Park relief; used only when compiling with `TERRAIN=real` |
| **FHWA MUTCD 2009 Figure 3B-24; Standard Alphabets, Series C** (public domain) | — (constants in compile.mjs) | Pavement-arrow and lettering outlines, extracted from the official PDFs by tools/refs/pdfpaths.mjs, mutcd_arrows.mjs and pdfglyphs.mjs |
| **USGS NAIP orthoimagery** (red, green, blue and near-infrared bands; The National Map image service; public domain) | not cached in the repository | Central Park's tree crowns: resampled to 0.5 m cells in the park's frame, the vegetation index from the near-infrared band, crowns segmented by watershed and turned into trees (`tools/cp/flora_*.py`, baked into `src/city/cpFloraData.js`); the far park's ground colour (`tools/cp/relief_farphoto.py`) |
| **NYS ITS orthoimagery** (orthos.its.ny.gov, 2022 to 2025 mosaic; public) | not cached in the repository | Measurements of Bethesda Terrace, the Lake's edges and the park landmarks in plan |
| **Central Park's published tree composition** (the Conservancy's 1982 survey as tabulated by Loeb, Journal of Arboriculture 19(4), 1993; the Conservancy's later counts and species pages) | constants in `tools/cp/flora_species.py` | The park-wide shares of 33 species groups (black cherry about 18 %, then black locust, pin oak, Norway maple, American elm, London plane), to which the placed trees' species are fitted |
| **NYC Municipal Archives, Central Park drawings** (1860s) and **Scientific American, 21 July 1900** | not reproduced | Dimensions of Bethesda Terrace and its fountain, and of the Riverside Drive viaduct at 125th Street; read for measurement only |

## Hand-authored (registries in-repo, derived from public knowledge)

- `src/shared/landmarkSpec.js` — 55 landmark lat/lons, 4 style districts (Columbia campus, Teachers College, SoHo cast-iron, Times Square billboards) and read-time building overrides (wall material, stone base) checked against on-site reference.
- `BRIDGE_DEFS` in `tools/pipeline/compile.mjs` — per-bridge type/clearance/tower params; **alignments themselves come from CSCL** bridge segments.
- Columbia South Field lawns (`EXTRA_LAWNS` in compile.mjs) — private grounds absent from Parks data.
- Palettes/probabilities in `classify.mjs` (used only where no FISP/OSM real data exists).

## Evaluated and not used

- **Google Street View** — the ideal source for facade appearance; licensing prohibits extraction. Not used as data: panoramas were viewed for visual comparison only and are not redistributed.
- **Mapillary** (CC-BY-SA street imagery) — viable future path: sample dominant facade colour per building via their API + segmentation. Heavy pipeline; not implemented.
- ~~**NYC 3D Building Model (DoITT)** — massing only, no materials; our extrusions already come from footprints+heights.~~ **Now partially used** (2026-07-07): citywide 2014 CityGML LOD2 from `maps.nyc.gov/download/3dmodel/DA_WISE_GML.zip` (916MB, cached `data/raw/DA_WISE_GML.zip`; also `DA_WISE_Multipatch.zip` 257MB). Real roof forms (Low Library's true saucer dome) but LOD2 walls are blank planes — no facade detail. Pipeline `tools/pipeline/extract3d.mjs`: DeliveryArea.shp point-lookup (Columbia = **DA13**), stream-scan the DA GML for landmark BINs (Low 1084472, Butler 1082165, St Paul's 1084459), EPSG:2263 ftUS → lon/lat (Lambert Conformal Conic 2SP inverse, GRS80) → world; output `public/data/landmark_meshes.json`. Runtime toggle `?lm3d=1` (landmarks.js `preloadMeshes`/`realMassing`) for A/B against the procedural builders; verdict so far: real dome/massing outline wins, procedural porticos/facades win — hybrid (real roof + procedural walls) is the future path. |
- **LPC designation reports** — facade material descriptions exist but only in unstructured PDFs.

## Textures, models and animation

- **ambientCG** (`ambientcg.com`, CC0): Asphalt025C, Concrete031, Grass004, PavingStones128, Bricks090 — 1K JPG PBR sets (Color/NormalGL/Roughness/Displacement) in `public/textures/`, wired into the ground + facade shaders (world-UV, anti-tiled). 2026-07-08: grass/paving still ambientCG; asphalt/concrete/brick superseded below.
- **Poly Haven** (`polyhaven.com`, CC0): `dirty_concrete` (sidewalk concrete family: concrete_col/nrm) and `red_bricks_04` (facade masonry relief: brick_nrm + roughness from the ARM green channel) — 4K sources downsized to 2K JPG into the same `public/textures/` GTEX slots.
- **Poly Haven sky HDRI library** (CC0, 4K .hdr in `public/textures/hdri/`, ~145MB): kloofendal_48d_partly_cloudy, qwantani_mid_morning, lonely_road_afternoon, belfast_sunset, qwantani_dusk_2, kloofendal_overcast, kloofendal_misty_morning, qwantani_night (all puresky). Selected in the Tab editor; each sky RELIGHTS the world — brightest-texel sun detection, luminance-statistic sun/ambient/night factors, horizon-band fog color (sky.js setHDRI).
- **Generated LUTs** (in-repo, `public/luts/*.cube`, 33³, generated procedurally — no external source): teal_orange, bleach_bypass, film_warm, noir_cool, vintage_fade, vibrant. Applied via three LUTPass after the grade pass.
- **Poly Haven facade wall tiles** (CC0, fetched via api.polyhaven.com, 1K in `public/textures/wall_*.jpg`): `red_bricks_04` (tenement/industrial/projects), `brown_brick_02` (prewar), `white_bricks` (postwar), `sandstone_blocks_04` (deco/rowhouse/civic/church cut stone), `plastered_wall_05` (cast-iron/retail). Sampled per wall in the facade shader keyed by building STYLE, mean-normalized and multiplied into the PLUTO-palette albedo (photo carries pattern, palette keeps per-building identity; ratio mips to 1.0 so distant walls converge to the flat tint).
- **Poly Haven 4K ground sets** (CC0, fetched via api.polyhaven.com, installed 4096px into the GTEX filenames): `asphalt_02` (roads — diffuse darkened ×0.58 to NYC tone, cracks read as real wear), `dirty_concrete` (sidewalks), `leafy_grass` (lawns/parks: col+nor), `concrete_pavement_03` (plaza/paver detail layer — deliberately pattern-neutral so it doesn't clash with the procedural herringbone/paver drawing), plus `red_bricks_04` facade relief (nor + ARM.G roughness) at 4K. **2026-07-08: the whole bank ships as KTX2/BasisU** (encoded with KTX-Software toktx: ETC1S for color/rough/disp, UASTC for normal maps, mipmapped) — GPU-native BC formats bring texture VRAM from ~1.2GB to ~210MB with no visible quality loss; JPGs remain on disk as the runtime fallback path.
- **ez-tree** (`github.com/dgreenheck/ez-tree`, MIT, npm `@dgreenheck/ez-tree`): parametric street trees generated at boot (Oak Medium / Ash Medium / Aspen Small presets, density-reduced) replacing the procedural puff trees; bark + leaf textures ship inside the package build (src/city/trees.js).
- **NYC DOT Bicycle Parking** (NYC Open Data `592z-n7dk`, CityRacks, 47,267 points): fetched to `data/raw/bikeracks.geojson`, compiled as FURN.BIKE_RACK street furniture (faceRoad); runtime leans bicycles (CARLA RoadBike) on ~60% of racks via the props.js companion system.

- **CARLA 0.10.0 vehicles and pedestrians — PV2** (carla.org, UE 5.5 release, "CARLA specific assets are distributed under
  CC-BY License" — **CC-BY 4.0, attribution required in credits**: "Vehicle and pedestrian models: CARLA Simulator
  (carla.org), CC-BY 4.0"). Extracted from the Windows release with CUE4Parse-based tooling (not included in this repository), rebuilt by tools/assets/build_vehicle.mjs (11 kinds: taxi Ford
  Crown 2024, Lincoln MKZ 2024, Dodge Charger 2024 + police, Mini 2024, Nissan Patrol 2024, Mercedes Sprinter 2024,
  Ambulance 2024, CarlaCola 2024 box truck, Fuso Rosa 2024 minibus, Actros fire truck; three LODs, KTX2 textures) into
  public/models/fleet24/, and by build_peds.mjs / build_clips.mjs (25 walker bodies, 37 outfit variants, walk/run/turn/idle
  clips) into public/models/peds24/. Provenance note: many walker materials carry
  MetaHuman naming (`MI_EyeRefractive`, `MI_LacrimalFluid`, `*_MH`) and some bodies are tagged `_G3`/`GEN23`; CARLA ships
  them under its CC-BY declaration. Epic's MetaHuman licence forbids using MetaHuman characters to build or enhance a
  database or to train or test AI (LICENSING.md quotes the clause): datasets are rendered with `--pedestrians procedural`. Raw exports are not included.
  NYC edits (tools/assets): the taxi's "CARLA TAXI" door logos repainted "NYC TAXI" (livery_taxi.mjs); the police car's
  CARLA livery replaced by an NYPD side livery drawn at runtime (sim/fleet24.js nypdDecal); "CARLA" lettering removed from
  the red bomber's albedo / normal / ORM (build_peds.mjs PATCHES); walker skin tones recalibrated per character.
  Further NYC edits: CARLA's "California CARLA" plate sheet -> New York Empire Gold (livery_plate.mjs) and a runtime atlas of
  64 NY / TLC plates per instance (fleet24.js plateAtlas); the CarlaCola box truck's Coca-Cola-parody box livery -> plain
  white aluminium (livery_boxtruck.mjs); a modern TLC cab (taxi2) derived at runtime from the Lincoln MKZ 2024 body.
  FLEET27 (2026-09-26): three older cars from the same CARLA 0.10.0 package added by build_vehicle.mjs, Tesla Model 3
  (SM_Tesla + its parked mesh), Audi TT and Ford Mustang 1966 (parked only); same CC-BY 4.0 attribution. NYC edits
  (livery_fleet27.mjs): the CARLA roundel and badges painted out of the Mustang's detail atlas (albedo and normal map)
  and the "California CARLA" plate on the Tesla's parked-mesh atlas repainted as a New York plate.
- **100STYLE locomotion dataset** (Ian Mason, Sebastian Starke, Taku Komura, "Real-Time Style Modelling of Human
  Locomotion via Feature-Wise Transformations and Local Motion Phases", 2022; Zenodo record 8127870; **CC-BY 4.0** —
  attribution required). 16 styles (walk + idle) and the rushed / old / neutral-fast / neutral-slow walks, read out of the
  1.5 GB archive by HTTP range requests and retargeted onto the CARLA GEN2 skeleton by
  tools/assets/retarget_bvh.mjs (neutral-pose calibration, wrists 75 % CARLA relaxed hand), baked into
  public/models/peds24/clips_gen2.bin by build_clips.mjs.
- **Pedestrian bag / backpack scans** (Sketchfab via Objaverse 1.0 — allenai/objaverse on Hugging Face, each model under
  its author's Sketchfab licence; only CC-BY 4.0 models used, **attribution required**): "Retreat Herschel bag" by alban;
  "Kanken backpack" by Modelified (recoloured dark navy); "Sling Bag" by Hydro3D Solution; "Feuerwear Shoulder Bag Walter
  UK" by Feuerwear; "Worn leather handbag" by Lassi Kaukonen. Normalised by tools/assets/build_props.mjs, fitted per body
  and baked into the walker meshes by build_peds.mjs (lib/propfit.mjs); textures are layers of the peds24 arrays.
- **Microsoft Rocketbox Avatar Library** (github.com/microsoft/Microsoft-Rocketbox, **MIT licence, "Copyright (c) 2020
  Microsoft"** — keep the licence text with the files; Gonzalez-Franco et al., "The Rocketbox library and the utility of
  freely available rigged avatars", Frontiers in Virtual Reality 2020, doi:10.3389/frvir.2020.561558). RB27: adult
  everyday / office / delivery avatars (no uniforms, costumes or swimwear), fetched by tools/assets/rocketbox_fetch.mjs
  (FBX + colour / normal / specular TGAs), converted with FBX2glTF 0.13.1, re-bound from the 3ds Max Biped skeleton to the
  CARLA GEN2 walker skeleton and packed by tools/assets/build_rocketbox.mjs into public/models/peds24/rb27/ (bodies, KTX2
  arrays, manifest.json, NOTICE.md with the MIT text). The crowd plays the peds24 clips on them; `?rb27=0` leaves them out.
- **CARLA vehicle models** (carla.org, **CC-BY 4.0** — attribution required in credits): 29 cars, FusoRosa bus, 8 trucks (Sprinter/CarlaCola/Ambulance/Firetruck/HGV/VW T2...) and ~180 street/construction/trash props (Static/Dynamic trees), converted from the CARLA 0.9.15 Windows release to glTF with a CUE4Parse-based converter (not included; exporter outputs metres). GLBs + manifest in public/models/carla/. Material slots are named, textures not baked — assign PBR by slot name (Bodywork/glass/wheel/light).
- **PBR material library** (ambientCG and Poly Haven, CC0): 35 sets (bricks, brownstone, granite, limestone, concrete, asphalt, paving, metals, timber, roofing; four of them procedural) packed to KTX2 albedo, normal and ORM in `public/textures/pbr/<set>/` by tools/ar33/mats/build.mjs; tools/ar33/mats/sets.mjs lists each set's source asset and calibration.
- **Central Park textures** (CC0, `public/textures/cp33/`): Poly Haven `dark_rock_02` and `lichen_rock` (schist), `rock_boulder_dry` and `roof_slates_03` (Belvedere Castle), `weathered_planks` (bridge decks), `weathered_brown_planks` (bench slats), `jolcham_oak_bark_01` (the Mall's elms), ambientCG `Metal028` (cast iron); the boats, the Loeb Boathouse and the Lake's walls from sets fetched by tools/assets/lakeside_tex.mjs, which reads only from these two CC0 libraries (among them Poly Haven `green_rough_planks`, `brick_wall_09`, `rock_wall_08` and ambientCG `Metal058C`); the rock sets packed by tools/cp33/rocks_build.mjs.
- **Central Park boulders** (Poly Haven, CC0 photogrammetry scans, geometry only): `boulder_01`, `rock_moss_set_01`, `rock_moss_set_02`, `rock_07`, `rock_09`, `namaqualand_boulder_02` to `_06`, `stone_01`; welded, decimated to three levels and packed into `public/models/cp33/rocks/` by tools/cp33/rocks_build.mjs.
- **Angel of the Waters and the cherubs of Bethesda Fountain** (Sketchfab via Objaverse 1.0): the figure is cut from "Engel" by noe-3d.at (https://sketchfab.com/3d-models/15edd1e0e422482586dd4dd4aebe8d55, **CC BY 4.0**, attribution required), the cherubs from "Putto auf Fisch" by noe-3d.at (https://sketchfab.com/3d-models/8ba656b736a54a24904d163c7097c3c9, CC0); cut from their bases, scaled to the Stebbins figures, re-posed and simplified to three levels of detail by tools/cp33/bethesda/angel.mjs and cherub.mjs into `public/models/cp33/bethesda/`.
- **Rowboat passengers** (`public/models/cp33/lakeside/people/`): seated meshes baked from the photoreal pedestrian bank (CARLA 0.10 walkers, CC BY 4.0, the MetaHuman notice of LICENSING.md applies) by tools/assets/lakeside_people.mjs.
- **Street trees, web set** (CC0 scans, procedural geometry; `public/models/trees36/` and `public/models/bxtrees/`, each with its NOTICE.md): leaves cut from ambientCG LeafSet010, LeafSet014, LeafSet016, LeafSet022 and LeafSet024; barks from Poly Haven `bark_willow_02`, `japanese_sycamore`, `japanese_zelkova_bark`, `sakura_bark`, `jolcham_oak_bark_01`, `trident_maple_bark` and ambientCG `Bark001` and `Bark012`; built by tools/ar35/trees/ (trees36) and tools/ar34/bxtrees/ (bxtrees).
- **Shrubs, hedges and beds** (CC0, fetched by tools/ar35/veg/fetch_vg37.sh, built into `public/textures/veg/` by build_vg37.py): ambientCG LeafSet001, LeafSet017, LeafSet019, LeafSet020, LeafSet022, LeafSet024 and LeafSet026, cut out, scaled and recoloured; the lawn blades, turf and tree-pit fills are procedural.
- **Blender target assets** (dataset folder `Blender/`): the street tree set at film detail (`Blender/bxtrees/`, the same trees and sources as `public/models/bxtrees/`) and the window interiors (`Blender/bxwin/rooms_atlas.png`, eight CC0 Poly Haven interior HDRIs listed in its ASSETS_NOTICE.md).
- **Sign typefaces** (github.com/google/fonts; SIL Open Font License 1.1, Apache License 2.0 for Roboto Slab and Yellowtail): the storefront and landmark sign families in `public/fonts/ar33/`, each with its licence text beside it and listed in FONTS.txt; fetched by tools/ar33/signs/fetch_fonts.mjs. The three.js outlines in `o/` are format conversions and stay under each font's licence.
- **NV200 taxi body** (Sketchfab via Objaverse 1.0, **CC BY 4.0**, attribution required): "Dhl delivery van" (Nissan NV200) by memoov, https://sketchfab.com/3d-models/6f952a34d1f44905af42c803cba2805f; re-proportioned to Nissan's North American sheet, re-wheeled, glazed, fitted with a cab interior and roof equipment, given a TLC livery drawn from scratch and reduced to levels of detail by tools/ar34/vehicles/taxi/build_nv200.py and finish.mjs into `public/models/fleet24/taxinv200.glb`.
- **26 ft box truck cab and chassis** (Sketchfab via Objaverse 1.0, **CC BY 4.0**, attribution required): "Isuzu FFR" by mekanismo, https://sketchfab.com/3d-models/29931659dfe84909a226a625cf5a8f75; re-materialised, the chassis lengthened to a 6.10 m wheelbase, a 26 ft box with its lamps, markers and DOT tape built from scratch, by tools/ar34/vehicles/vh36/build_ftr26.py and finish_vh36.mjs into `public/models/fleet24/boxtruck26_vh36.glb`.
- **Other NYC vehicles** (original models, CC BY 4.0, M. K. Turkcan): the MTA buses (`mtalfs`, `mtalfsa`, `mtalfsal`, `mtaxd40`, `mtaxd60`), `nypd`, `uspsllv`, `uspsngdv`, `dsny`, `schoolbus`, `stepvan`, `cargovan`, `boxtruck26`, `foodtruck` and `icecream` in `public/models/fleet24/` are built from scratch by the scripts under tools/ar34/vehicles/, with liveries drawn from scratch; photographs were used as look references only and are not included. The subway and commuter trains (R62A, M7A, M8) and the 125th Street station are modelled in code from published dimensions.
