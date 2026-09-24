# 06 — Modern Glass Condo Tower (Williamsburg / Greenpoint Waterfront + LIC)

> 2005–2025 glass-and-metal residential towers on the East River waterfront: Kent Ave / Northside Piers / Domino / Greenpoint Landing / Williamsburg Wharf and their Long Island City equivalents — window-wall-clad concrete flat-plate towers on podiums, 6–57 stories, with balcony grids, ACM/precast/brick-panel accents, and raised flood-resistant bases.

---

## 1. MASSING & GEOMETRY

### 1.1 Reference buildings (measured — use these to calibrate)

| Building | Address | Stories | Arch. height | Year | Architect | Units | Gross m/floor |
|---|---|---|---|---|---|---|---|
| The Edge — South Tower | 22 N 6th St | 30 | — | 2009 | Stephen B. Jacobs Group | 360 | — |
| The Edge — North Tower | 34 N 7th St | 15 | — | 2008 | Stephen B. Jacobs Group | 205 | — |
| One Northside Piers | 1 Northside Piers / 4 N 5th St | 29 | — | 2009 | FXFOWLE | 181 | — |
| Two Northside Piers | 164 Kent Ave | 30 | — | 2009 | FXFOWLE | 269 | — |
| 420 Kent (3 towers) | 420 Kent Ave | 22 ea. | 77.11 m (253 ft) | 2019 | ODA New York | 857 | 3.51 |
| 325 Kent ("the doughnut") | 325 Kent Ave | 16 over 5-story podium | 57.61 m (189 ft) | 2017 | SHoP | 522 | 3.60 |
| One South First / 260 Kent | 1 South 1st St | 42 | 132.59 m (435 ft) | 2019 | COOKFOX | 330 | 3.16 |
| Ten Grand Street (office) | 10 Grand St | 22 | — | 2019 | COOKFOX | — | — |
| The Oosten | 429 Kent Ave | 7 | — | 2016 | Piet Boon | 216 | — |
| 250N10 | 250 N 10th St | 6 | — | 2014 | SLCE | 234 | — |
| The Greenpoint | 21 India St / 10 Huron St | 39 | 132.28 m (434 ft) | 2018 | — | — | 3.39 |
| One Blue Slip | 37 Blue Slip | 30 | 103.63 m (340 ft) | 2018 | — | — | 3.45 |
| Two Blue Slip | Greenpoint Landing | 39 | 134.11 m (440 ft) | 2020 | — | — | 3.44 |
| One Domino Square (rental) | Domino | 57 | 174.96 m (574 ft) | 2024 | — | — | 3.07 |
| One Domino Square (condo) | Domino | 39 | 143.87 m (472 ft) | 2024 | — | — | 3.69 |
| Williamsburg Wharf (5 towers) | 464–484 Kent Ave | 22 ea. | — | 2025 | Brandon Haw / Hill West | ~850 | — |
| 500 Kent Ave (office, proposed) | 500 Kent Ave | 23 | 106.68 m (350 ft) excl. bulkhead | — | — | — | 4.64 |

Gross m/floor = architectural height ÷ story count. It is **not** the residential floor-to-floor: it absorbs a tall ground floor, one or two double-height amenity floors, and the parapet. Solve residential floor-to-floor from:

```
H_arch = h_ground + n_amenity * h_amenity + (n_floors - 1 - n_amenity) * ftf + h_parapet
```

Worked check, One South First (42 fl, 132.59 m): `h_ground 5.49 + h_amenity 4.27 + 40 * 3.05 + parapet 1.07 = 132.83 m` → **ftf = 3.05 m (10 ft)**. Buildings with gross ≥ 3.40 m/floor (420 Kent, Greenpoint Landing, One Domino Square condo) carry an extra double-height amenity level, a mechanical transfer floor, or 3.20–3.35 m residential floors.

### 1.2 Vertical dimensions

| Element | Range | Modal | Feet |
|---|---|---|---|
| Residential floor-to-floor | 2.90–3.20 m | **3.05 m** | 9.5–10.5 ft (10 ft) |
| Finished ceiling height | 2.59–2.90 m | 2.74 m | 8.5–9.5 ft (9 ft) |
| Concrete flat-plate slab | 0.20–0.30 m | 0.22 m | 8–12 in (8.75 in) |
| Ceiling void (ducts/sprinkler) | 0.15–0.45 m | 0.25 m | 6–18 in |
| Floor finish build-up | 0.03–0.10 m | 0.05 m | 1.25–4 in |
| Ground floor / lobby | 4.27–6.10 m | 5.03 m | 14–20 ft (16.5 ft) |
| Retail base floor | 4.27–5.49 m | 4.57 m | 14–18 ft (15 ft) |
| Amenity floor (double-height) | 4.00–6.10 m | 4.57 m | 13–20 ft (15 ft) |
| Mechanical transfer floor | 3.66–5.49 m | 4.27 m | 12–18 ft |
| Parapet above finished roof | 1.07–1.37 m | 1.07 m | 42–54 in |
| Mechanical penthouse / bulkhead | 3.05–7.62 m | 4.88 m | 10–25 ft (16 ft) |
| Elevator overrun bulkhead | 3.66–5.49 m | 4.27 m | 12–18 ft |

Amenity floors sit at: ground/2nd (weight 0.42), mid-building setback level (0.18), top floor / roof level (0.34), podium roof (0.28) — sampling is non-exclusive; 1–3 amenity levels per tower.

### 1.3 Plan and site

| Element | Range | Notes |
|---|---|---|
| Tower floorplate (residential, GFA) | 700–1000 m² | 7,500–10,800 ft². Rental leans 900–1000, condo 700–850 |
| Tower plan width (long face) | 25.0–40.0 m | 82–131 ft |
| Tower plan depth (short face) | 20.0–30.0 m | 66–98 ft; double-loaded corridor drives this |
| Corridor width | 1.52–1.83 m | 5–6 ft |
| Unit depth from glass to corridor | 8.5–13.7 m | 28–45 ft |
| Unit width at facade | 3.05–7.62 m | 10–25 ft = 2–5 facade modules |
| Slenderness H/W (Williamsburg band) | 2.0–5.0 | The Edge S ≈ 2.7; One South First ≈ 3.9 |
| Podium height | 7.0–27.0 m (2–8 stories) | Modal 5 stories = 17.0 m (56 ft) — 325 Kent |
| Podium lot coverage | 0.80–1.00 | Fills the site to the street lines |
| Tower lot coverage | 0.35–0.60 | |
| Tower setback from podium face | 1.52–6.10 m | Modal 3.05 m (10 ft) |
| Base height before required setback | 9.14–13.72 m (30–45 ft) | Waterfront district streetwall |
| Waterfront yard / setback from bulkhead line | 12.19–24.38 m (40–80 ft) | Public access area occupies it |
| Superblock site frontage | 60.96–182.88 m (200–600 ft) | These are assembled superblocks, NOT 7.62 m lots |

Massing variants and weights:

| Variant | Weight | Description |
|---|---|---|
| Podium + single slab tower | 0.26 | The Edge N, Northside Piers |
| Podium + twin towers on shared base | 0.20 | 325 Kent, One South First / Ten Grand, 260 Kent |
| Shifted/stacked-box tower (cantilevers) | 0.16 | 420 Kent, ODA idiom. Box shift 1.52–4.57 m, cantilever 1.52–3.05 m |
| Perimeter block with courtyard ("doughnut") | 0.14 | The Oosten, 325 Kent. Courtyard 15–40 m across |
| Terraced / stepped ziggurat | 0.12 | Setback 2.44–4.88 m every 3–6 floors |
| Uniform extruded slab, no podium | 0.12 | 250N10, low-rise mid-block |

---

## 2. FACADE COMPOSITION

### 2.1 Horizontal module (the vertical rhythm)

| Module width | Metric | Feet | Weight | Use |
|---|---|---|---|---|
| Standard | 1.52 m | 5 ft | 0.44 | Default NYC residential |
| Narrow | 1.37 m | 4.5 ft | 0.20 | Tight window-wall grids, rentals |
| Wide | 1.83 m | 6 ft | 0.22 | Condo, larger vision panes |
| Extra wide | 2.13–3.05 m | 7–10 ft | 0.10 | Corner and living-room panes |
| Extended range (manufacturer) | 0.91–3.05 m | 3–10 ft | 0.04 | Custom |

Confirmed industry envelope: unitized panel width standard **1200–1500 mm (4–5 ft)**, extended **900–3000 mm (3–10 ft)**; a unit is one story tall.

Bay counting rule: `n_modules = round(facade_width / module_width)`; absorb the remainder into the two end modules (±0.30 m each), never into a mid-facade half-module.

### 2.2 Vertical division per floor (3.05 m floor-to-floor)

| Zone | Height | Feet | Notes |
|---|---|---|---|
| Vision glass | 1.98–2.44 m | 6.5–8 ft | Modal 2.29 m (7.5 ft) |
| Spandrel / shadowbox | 0.61–1.07 m | 24–42 in | Modal 0.71 m (28 in) |
| Head rail | 0.05–0.10 m | 2–4 in | |
| Sill rail | 0.05–0.10 m | 2–4 in | |
| Horizontal transom (mid-lite) | 0.064–0.102 m | 2.5–4 in | Present in 0.30 of designs, at 0.61–1.07 m AFF |

Consistency constraint: `ftf = vision + spandrel + head + sill + 2 * joint`. With `joint = 0.019 m` and `ftf = 3.05`: `vision 2.29 + spandrel 0.71 = 3.00`, remainder to rails/joints. Spandrel height is derived, not free: `spandrel = slab (0.22) + ceiling_void (0.25) + floor_finish (0.05) + sill_upstand (0.10–0.55)`.

"Floor-to-ceiling glass" in marketing copy means vision glass runs from **0.10–0.25 m above finished floor** to **0.05–0.15 m below the ceiling** — there is always a sill upstand and always a head reveal. Vision glass never touches the floor.

### 2.3 Base / shaft / cap

| Zone | Floors | Treatment |
|---|---|---|
| Flood base | 0 | Blank/solid band 0.61–1.83 m tall: precast, stone, metal, brick. Louvers and flood vents only |
| Base | 1–2 | Storefront glazing 4.27–6.10 m tall, sightline 0.05–0.06 m, transom at 3.05 m. Canopy projection 1.52–3.05 m at 3.35–4.27 m AFG |
| Podium | 2–8 | Distinct cladding (brick, ACM, perforated metal). Punched or ribbon windows, 0.10–0.20 m reveal |
| Shaft | 3–N | Repeating window wall, uninterrupted for 15–40 floors |
| Amenity / setback band | mid + top | Taller glass, guardrails, planters 0.61–0.91 m tall |
| Cap | top 1–2 | Slightly taller floor (+0.30–0.61 m), deeper mullion cap, or a 0.61–1.22 m projecting cornice/eyebrow |
| Bulkhead | roof | Louvered or clad box, 3.05–7.62 m, 15–35% of roof footprint |

Corner treatment weights: butt-glazed structural silicone corner (0.34), corner mullion 0.089–0.152 m (0.30), chamfer 0.61–1.52 m (0.14), curved radius 1.5–6.0 m (0.08), spandrel-wrapped opaque corner (0.14).

---

## 3. WINDOW WALL vs CURTAIN WALL — THE CRITICAL DISTINCTION

**Most Williamsburg/Greenpoint/LIC residential towers are WINDOW WALL, not curtain wall.** Window wall is glazed floor-by-floor from the inside, sits *on* each slab, and stops at the slab above. Curtain wall hangs *outboard* of the slab edge as a continuous self-supporting skin and is craned in from outside. Window wall is the residential standard for cost, acoustic separation between floors, and installation without a crane.

### 3.1 Window wall (weight 0.72 for 2005–2025 NYC residential)

| Parameter | Value | Feet/inches |
|---|---|---|
| Unit height | = floor-to-floor, 2.90–3.20 m | 9.5–10.5 ft |
| Frame depth | 0.114–0.127 m | 4.5–5 in (Starline 9000 = 4.5 in; YKK YWW 50 T = 5 in) |
| Mullion face width (sightline), captured | 0.064–0.102 m | 2.5–4 in |
| Mullion face width, structural silicone glazed | 0.038–0.051 m | 1.5–2 in |
| Silicone joint width (SSG) | 0.016–0.025 m | 5/8–1 in |
| Glass plane setback from slab edge face | 0.05–0.15 m | 2–6 in |
| Mullion cap projection outboard of glass | 0.013–0.038 m | 0.5–1.5 in |
| Head deflection channel travel | 0.019 m max | 3/4 in slab-edge differential deflection |
| Glazing infill | 0.025 m IGU (0.006 m in 0.4× cases) | 1 in / 1/4 in |
| IGU total thickness | 0.026–0.032 m typical | 1–1.25 in; laminated 0.034–0.042 m; full range 0.024–0.052 m |
| **Visible horizontal joint pitch** | **exactly ftf, i.e. 3.05 m** | at every slab, no exceptions |

Slab-edge treatment — the identity of the building. Weights:

| Slab-edge treatment | Weight | Geometry |
|---|---|---|
| Spandrel glass aligned with vision plane | 0.42 | Band 0.61–1.07 m tall, same glass gloss, opaque backing. Reads as curtain wall at 30 m |
| Shadowbox (glass over 0.05–0.10 m air gap + insulated back pan) | 0.18 | Slight depth, faint double reflection, back-pan seams at module pitch |
| Aluminum / ACM slab-edge cover panel | 0.22 | 0.30–0.61 m tall, projects 0.00–0.05 m proud of glass, R-2 bare or R-6 with 0.025 m continuous insulation |
| Exposed painted or stucco concrete slab edge | 0.12 | 0.25–0.45 m tall band, 0.03–0.10 m proud of glass, visible form-tie marks — the cheap-rental tell |
| Projecting concrete eyebrow / shadow shelf | 0.06 | 0.20–0.61 m projection, casts a hard horizontal shadow |

### 3.2 True unitized curtain wall (weight 0.28; mostly office and premium condo)

| Parameter | Value | Feet/inches |
|---|---|---|
| Module width | 1.37–1.83 m (std 1.52 m) | 4.5–6 ft (5 ft) |
| Module height | one story, 2.90–4.20 m | 9.5–13.8 ft |
| Sightline, captured (Kawneer 1600) | 0.0635 m | 2.5 in |
| System depth (Kawneer 1600) | 0.152 m or 0.191 m | 6 in or 7.5 in |
| Frame depth, low/mid-rise | 0.150–0.180 m | 6–7 in |
| Frame depth, high-rise | 0.175–0.225 m | 7–9 in |
| Frame depth, supertall/coastal | 0.200–0.250 m | 8–10 in |
| Vertical split-mullion joint | 0.010–0.015 m | 0.4–0.6 in |
| Horizontal stack joint, standard | 0.015–0.025 m | 0.6–1 in |
| Horizontal stack joint, high wind | 0.025–0.045 m | 1–1.75 in |
| Horizontal stack joint, seismic | 0.035–0.050 m | 1.4–2 in |
| **Stack joint location** | **1.00–1.22 m above finished floor** | 3.3–4 ft — NOT at the slab |
| Glass outboard of slab edge | 0.05–0.20 m | 2–8 in |

**The single geometric difference a generator must encode:** window wall puts a mullion-to-mullion horizontal seam at *every floor level*; unitized curtain wall puts its horizontal seam *1.0–1.2 m above* the floor and leaves the floor level itself continuous. Getting this wrong is why CG towers read as offices.

### 3.3 Decorative vertical fins (weight 0.15)

Projecting mullion fins/blades: projection 0.10–0.30 m, thickness 0.019–0.038 m, at every module (0.55) or every 2nd module (0.45). Material = anodized or painted aluminum extrusion. They double the apparent verticality and are the cheapest way to make a flat window wall read as designed.

---

## 4. BALCONIES, TERRACES & RAILINGS

### 4.1 Balcony geometry

| Parameter | Range | Modal | Feet |
|---|---|---|---|
| Depth (projecting cantilever) | 1.52–2.44 m | 1.83 m | 5–8 ft (6 ft) |
| Depth (recessed / inset loggia) | 1.83–3.05 m | 2.13 m | 6–10 ft |
| Width | 2.44–6.10 m | 3.66 m | 8–20 ft (12 ft) = 2.4 modules |
| Slab thickness at balcony | 0.20–0.30 m | 0.25 m | 8–12 in |
| Slab nosing / drip edge | 0.019–0.025 m | 0.019 m | 3/4–1 in |
| Slab underside slope (drainage) | 1.5–2.0% | — | toward outer edge |
| Soffit reveal at wall junction | 0.013–0.025 m | 0.019 m | thermal break shadow line |
| Terrace (setback floor) depth | 2.44–7.62 m | 3.66 m | 8–25 ft |
| Juliet balcony depth | 0.30–0.61 m | 0.46 m | 12–24 in |
| Deck finish above slab | 0.05–0.10 m | 0.06 m | pedestal pavers 0.61 × 0.61 m or ipe 0.14 m boards |

### 4.2 Guards (NYC Building Code 1015.3 / 1015.4)

| Parameter | Value |
|---|---|
| Guard height above walking surface | **1.07 m (42 in) minimum** — never less |
| Maximum sphere passable through openings | 0.102 m (4 in) |
| Glass panel thickness, laminated | 0.012 m min; typical 0.0135–0.0215 m (1/2–7/8 in laminated) |
| Glass panel width | 0.91–1.52 m |
| Glass edge exposed green tint band | 0.006–0.012 m |
| Frameless base shoe | 0.102–0.152 m tall × 0.064–0.102 m wide aluminum |
| Post size (framed glass) | 0.038–0.064 m square or 0.051 m round |
| Post spacing | 1.22–1.52 m |
| Top cap / handrail | 0.038–0.064 m dia round, or 0.051 × 0.038 m rect |
| Picket diameter | 0.013–0.019 m; clear spacing 0.089–0.102 m |
| Cable diameter | 0.005–0.008 m; vertical spacing 0.076 m; 12–14 runs |
| Horizontal top/bottom rails on picket guard | 0.038 × 0.038 m |
| Perforated metal infill | 0.003–0.006 m holes, 30–45% open |

Guard type weights: frameless laminated glass in base shoe 0.30; framed glass with posts + top cap 0.24; vertical steel/aluminum picket 0.20; horizontal cable 0.10; perforated/expanded metal panel 0.08; solid opaque metal panel 0.08.

### 4.3 Balcony distribution patterns (sampling weights)

| Pattern | Weight | Rule |
|---|---|---|
| Every unit, every floor | 0.28 | Uniform grid, same depth. 420 Kent, Greenpoint Landing |
| Checkerboard | 0.18 | `(bay + floor) % 2 == 0` |
| Alternating floors (banded) | 0.14 | Every 2nd floor gets a continuous balcony band |
| Stacked column | 0.16 | 1–3 continuous vertical stacks of balconies, 2–4 modules wide, held at 1–3 bays from a corner |
| Corner-only | 0.12 | Wrap-around corner balconies, 2 legs of 2.44–4.88 m. The Edge idiom |
| Setback terraces only | 0.08 | Balconies only where the massing steps |
| None (Juliets / no projection) | 0.04 | 325 Kent, precast-facade buildings |

Modifiers applied on top: skip the lowest 2 floors (probability 0.65); skip the top floor in favour of a full terrace (0.45); randomize depth per balcony by ±0.15 m (0.30); randomize 8–15% of balconies to a different guard type or with a privacy screen 1.83 m tall at one side (0.35).

### 4.4 Balcony clutter (LOD0, <30 m)

Occupancy 0.40–0.70 of balconies show objects. Per occupied balcony: 1–2 folding chairs (0.55 × 0.55 × 0.85 m), small table (0.60 dia × 0.72 m), 1–4 planters (0.25–0.45 dia × 0.30–0.50 m), bicycle leaned (1.70 × 1.05 m), grill (0.55 × 0.45 m — banned but present at 0.10), string lights along the guard, drying rack, 1–2 cardboard boxes. Object color saturation should be high (this is the only saturated color on the building).

---

## 5. PODIUM, GROUND FLOOR & FLOOD-RESISTANT BASE

### 5.1 Flood rules (NYC ZR Article VI Ch. 4, ASCE 24, FEMA)

| Rule | Value |
|---|---|
| Design Flood Elevation | Base Flood Elevation **+ 0.61 m (2 ft)** freeboard |
| BFE, Zone AE, Williamsburg/Greenpoint waterfront | 3.05–3.96 m (10–13 ft) NAVD88 |
| Reference plane, high-risk zone | Between the flood-resistant construction elevation and **3.05 m (10 ft)** above the base plane / curb level |
| Reference plane, moderate-risk zone | Up to **1.52 m (5 ft)** above the base plane / curb level |
| Ground floor elevation | At or below the flood-resistant construction elevation **or 1.52 m (5 ft) above curb level, whichever is higher** |
| Flood-proofed (dry-floodproofed) ground floor | No more than 0.61 m (2 ft) above nor 0.61 m below curb level |
| Retaining wall visible from street (residential) | Max 0.91 m (3 ft) |
| Berm height | Max 1.52 m (5 ft) above lowest adjoining grade |
| Streetwall setback tolerance | Within 2.44 m (8 ft) of the street line; up to 50% of aggregate streetwall width may recess 3.05 m (wide street) / 4.57 m (narrow street) |

### 5.2 Resulting geometry

| Element | Range | Modal |
|---|---|---|
| Finished ground floor above adjacent grade | 0.61–1.52 m | 0.91 m (36 in) |
| Maximum raised base (reference plane rule) | up to 3.05 m | — |
| Blank flood-resistant base band height | 0.61–1.83 m | 1.07 m |
| Entry stair riser count | 3–8 | 4 |
| Entry riser / tread | 0.152 / 0.330 m | 6 / 13 in |
| Accessible ramp slope | 1:12 max, run 3.05–9.14 m | |
| Flood vent (net area rule) | 1 in² net open area per ft² of enclosed area | |
| Flood vent size | 0.41 × 0.20 m (16 × 8 in) engineered louver | serves ≈5.9 m² (64 ft²) |
| Flood vent spacing along base | 1.52–3.05 m | bottom of opening within 0.30 m (12 in) of grade; min 2 openings on 2 walls |
| Garage / generator louver | 1.22–2.44 m w × 1.22–2.03 m h | blade pitch 0.051 m, 45° |
| Loading dock door | 3.05–4.27 m w × 3.66–4.27 m h | |
| Transformer vault grille | 1.83 × 1.22 m, flush in sidewalk | |

Base cladding weights: precast concrete or cast stone 0.26; granite/limestone veneer 0.18; brick 0.20; ACM/metal panel 0.18; board-formed architectural concrete 0.10; perforated metal screen 0.08.

Ground-floor use weights: residential lobby only 0.34; lobby + retail 0.38; lobby + garage entry 0.16; retail only (podium building) 0.12. Lobby glazing 4.27–6.10 m tall, 3–6 modules wide, revolving door 2.13 m dia (0.20) or 2-leaf swing 1.83 m (0.80).

---

## 6. ROOF, BULKHEAD & AMENITY DECK

| Element | Dimensions |
|---|---|
| Parapet height above roof deck | 1.07–1.37 m (42–54 in); coping cap 0.30–0.50 m wide × 0.05 m thick, aluminum or stone |
| Parapet thickness | 0.20–0.30 m |
| Mechanical penthouse / bulkhead | 3.05–7.62 m tall; plan 15–35% of roof; louvered on 2–4 faces, louver blade pitch 0.051 m |
| Elevator overrun | 3.66–5.49 m tall, plan 4.0 × 6.0 m |
| Stair bulkhead | 2.44–4.00 m tall, plan 3.0 × 4.5 m |
| Cooling tower | 2.44–4.00 m tall × 3.05–6.10 m long × 2.44 m wide, louvered sides + 2 fan cowls 1.22 m dia |
| Condenser / chiller units | 1.0–1.5 m tall × 1.2–2.4 m, 4–20 units on 0.15 m housekeeping pads |
| Screen wall around equipment | 2.44–3.66 m tall, perforated metal 40% open or louver, on 0.10 m posts at 1.83 m |
| Rooftop amenity pergola | 2.44–3.05 m clear height; posts 0.10–0.20 m; beams 0.10 × 0.30 m; bay 3.05–4.27 m; slat pitch 0.15–0.30 m |
| Glass windscreen | 1.52–2.13 m tall, 0.012–0.015 m laminated, posts at 1.52 m |
| Planters on roof | 0.61–0.91 m tall × 0.91–1.22 m wide, runs of 3.0–9.0 m |
| Pool (amenity roof) | 6.0–12.0 m × 3.0–5.0 m, deck 0.15 m above surround |
| PV array | modules 1.00 × 2.00 m, tilt 10°, rows at 2.4 m pitch, 0.30 m above roof |
| Roof pavers / pedestal deck | 0.61 × 0.61 m concrete or 0.30 × 0.61 m; 0.10 m above membrane |
| Window-washing davit sockets / monorail | tie-backs at 0.61 m in from parapet, pitch 3.66 m; davit arm 2.44 m |
| Roof drains / overflow scuppers | scupper 0.20 × 0.10 m through parapet at 0.05 m above roof, pitch 12.2 m |
| Aviation obstruction light | Buildings > 61 m (200 ft): red beacon, 1 Hz flash |
| Antenna / cell array | 1.83–3.05 m tall panels on a 0.10 m frame, 3 sectors at 120° |

**Water towers:** modern towers use internal pressure tanks and fire pumps — the wooden water tower is **absent**. Probability of a decorative/vestigial wooden tower on a 2005–2025 tower: **0.05**. Probability of a rooftop water tower on a converted 1900s loft in the same view: 0.85. Getting this backwards is the fastest way to make the skyline read as fake.

---

## 7. METAL PANEL / ACM CLADDING

| Parameter | Value |
|---|---|
| Nominal design module | 1.20 × 3.00 m (4 × 10 ft) |
| Real optimal panel sizes (rainscreen, from yield tables) | 0.76 × 1.60, 0.76 × 2.44, 0.76 × 4.93, 1.52 × 1.60, 1.52 × 2.44, 1.52 × 4.93, 0.94 × 1.52, 1.19 × 1.52 m |
| Reveal (dry) joint width | 0.010–0.020 m; commonly 0.013 m (1/2 in). Filler options 0.013–0.203 m |
| Reveal depth (shadow) | 0.019–0.025 m — render as near-black, not as a line texture |
| ACM sheet thickness | 0.004 m (4 mm) or 0.006 m |
| Return leg / edge fold | 0.019–0.025 m |
| Panel bow tolerance | L/175 → apply 0.002–0.004 m random center bow (oil-canning) |
| Corrugated profile rib pitch | 0.076–0.203 m (3–8 in); rib depth 0.019–0.038 m |
| Standing-seam / plate panel seam pitch | 0.305–0.610 m; seam height 0.019–0.038 m |
| Perforated panel (325 Kent idiom) | hole dia 0.006–0.019 m, 25–50% open area, 60° stagger, pitch 0.013–0.038 m |
| Fastener / clip pitch (visible on cheap jobs) | 0.406 m |

Panel-color weights: dark gray/graphite 0.22; bronze 0.16; black 0.14; champagne/warm silver 0.12; white 0.12; mill/clear anodized 0.10; copper 0.06; pre-weathered zinc 0.06; deep green or blue 0.02.

Precast concrete variant (One South First, COOKFOX): panel 1.52–3.05 m wide × 3.05–3.66 m tall, faceted relief depth 0.05–0.20 m, joint 0.019 m, sand-blasted finish, custom aggregate. Weight 0.10 of the typology.

---

## 8. BRICK-VENEER-ON-MODERN VARIANT (very Williamsburg)

New construction that references the industrial context with brick. Weight **0.22** of 2010–2025 Williamsburg/Greenpoint residential.

| Parameter | Value |
|---|---|
| Panelized thin-brick-on-precast panel | 1.52–3.05 m wide × 3.05–3.66 m tall (one floor), joint 0.013–0.019 m |
| Thin brick face | 0.203 × 0.057 m; course height 0.0678 m (modern modular); 3 courses = 0.203 m |
| Hand-laid brick veneer on CMU/steel stud | running bond only; course 0.0667–0.0678 m; mortar joint 0.0095 m |
| Long-format ("Kolumba"-style) brick | 0.53 × 0.037 m face, course 0.047 m — weight 0.10 of brick jobs |
| Punched opening (large) | 1.83–3.66 m w × 2.13–2.74 m h |
| Punched opening (paired) | two 1.22 m lites with a 0.10 m mullion |
| Pier width between openings | 0.30–0.91 m |
| Window reveal from brick face | 0.10–0.20 m — mandatory; this is the one number that separates real brick from a decal |
| Spandrel between stacked openings | 0.61–1.07 m |
| Steel lintel / angle | 0.089–0.152 m exposed, painted dark |
| Precast sill | 0.05–0.08 m projection, 12° slope |
| Soldier-course or corbel accent band | 0.20–0.41 m tall at 1–2 levels |
| Brick base / water table | 0.61–1.07 m, contrasting darker brick or cast stone |

Brick colors for new-build Williamsburg: iron-spot dark red `#6e3a2e`, blackened manganese `#3a3234`, buff `#c3a97e`, gray `#8c8b86`, deep red `#8c4535`, warm white `#d8d2c6`. Weights: 0.24 / 0.18 / 0.16 / 0.16 / 0.16 / 0.10. Mortar `#8a8880` for gray, `#3c3a38` for dark manganese jobs.

---

## 9. WATERFRONT CONTEXT (esplanade, bulkhead, pilings)

| Element | Dimensions |
|---|---|
| Shore public walkway width | 12.19 m (40 ft) typical; range 9.14–18.29 m (30–60 ft) |
| Upland connection width | 4.57–9.14 m (15–30 ft) |
| Esplanade paving | concrete unit pavers 0.61 × 0.61 m or 0.30 × 0.61 m; joint 0.005 m; or ipe decking 0.14 m boards, 0.006 m gap |
| Guardrail at water edge | 1.07 m high, pipe dia 0.051 m, posts at 1.52 m, cable or picket infill at 0.102 m |
| Bulkhead / seawall cap | 0.61–1.22 m above mean high water; concrete cap 0.61 m wide |
| Steel sheet-pile bulkhead | corrugation pitch 0.61 m, amplitude 0.15 m |
| Timber fender piles | dia 0.30–0.40 m, spacing 1.5–3.0 m, 0.61–1.22 m above water |
| Relic pier pile stubs (clustered) | dia 0.25–0.45 m, 0.5–2.5 m above water, clusters of 4–30, irregular spacing 0.9–2.5 m, 5–15° random lean |
| Riprap revetment | stone 0.30–0.90 m dia, slope 1:2 |
| Salt-tolerant planting beds | 0.30–0.61 m raised, widths 1.5–4.0 m |
| Bench | 1.83 m long, seat at 0.43 m |
| Light pole (esplanade) | 3.66–4.57 m, pole dia 0.13 m, pitch 15.2–22.9 m |
| Domino Park elevated walkway (reference) | deck 9.1 m above grade on relic crane trestle |
| Williamsburg Wharf esplanade length (reference) | 160.0 m (525 ft) |

---

## 10. NIGHT STATE

| Parameter | Value |
|---|---|
| Interior warm white (residential) | `#ffd9a3` to `#ffc27a`; correlated color temp 2400–2900 K |
| Interior neutral (newer LED, kitchens) | `#fff1dc`, 3000–3500 K |
| Amenity / lobby glow | `#fff0d6`, 2700–3000 K, 1.6× residential intensity |
| Corridor / stair core windows | `#e8f0ff`, 4000 K, always on, constant |
| TV flicker (cool blue) | `#9fc0ff`, probability 0.06 per lit unit, 0.5–4 Hz irregular |
| Lit fraction of residential units | 0.30–0.60; modal **0.42** |
| Amenity floor lit fraction | 0.95 |
| Lobby / retail lit fraction | 1.00 |
| Sampling granularity | **Per unit (2–5 contiguous modules), not per module.** Within a lit unit, 0.6–0.9 of its modules glow |
| Emissive intensity ratio (lit vision : unlit vision) | 8:1 to 20:1 |
| Curtain / blind occlusion | 0.35 of lit units read as a diffuse glow (roughness 1.0 backing), 0.45 show a visible warm rectangle, 0.20 show partial blind bands at 0.05 m pitch |
| **Spandrel glass emission** | **Zero. Spandrel is opaque and never lights up.** Also zero for slab-edge covers and shadowbox |
| Balcony soffit downlights | 0.05 m dia, 2 per balcony, `#ffe3b0`, on at 0.30 of balconies |
| Balcony string lights | `#ffcf8a`, 0.20 m bulb pitch, at 0.18 of balconies |
| Facade accent uplighting on podium | `#e8dfc8`, grazing, 0.61 m fixture pitch, on at 0.55 |
| Canopy underside lighting | `#fff4e0`, continuous cove |
| Bulkhead obstruction beacon (>61 m) | `#ff2200`, 1 Hz |
| Glass reflectivity at night | Fresnel still active — dark glass mirrors the neighbouring lit tower; do not make unlit glass a flat black |

---

## PARAMETERS

```json
{
  "typology": "modern_glass_condo_tower",
  "region": ["williamsburg_waterfront", "greenpoint_waterfront", "long_island_city"],
  "years": [2005, 2025],
  "site": {
    "site_frontage_m": [60.96, 182.88],
    "podium_lot_coverage": [0.8, 1.0],
    "tower_lot_coverage": [0.35, 0.6],
    "waterfront_yard_m": [12.19, 24.38],
    "shore_public_walkway_width_m": [9.14, 18.29],
    "shore_public_walkway_typical_m": 12.19,
    "upland_connection_width_m": [4.57, 9.14]
  },
  "massing": {
    "stories": [6, 57],
    "stories_typical": [20, 42],
    "stories_weights": {"6_12": 0.18, "13_22": 0.34, "23_32": 0.26, "33_42": 0.16, "43_57": 0.06},
    "floor_to_floor_m": [2.9, 3.2],
    "floor_to_floor_modal_m": 3.05,
    "ceiling_height_m": [2.59, 2.9],
    "ceiling_height_modal_m": 2.74,
    "slab_thickness_m": [0.2, 0.3],
    "slab_thickness_modal_m": 0.22,
    "ceiling_void_m": [0.15, 0.45],
    "floor_finish_m": [0.03, 0.1],
    "ground_floor_height_m": [4.27, 6.1],
    "retail_floor_height_m": [4.27, 5.49],
    "amenity_floor_height_m": [4.0, 6.1],
    "mechanical_transfer_floor_height_m": [3.66, 5.49],
    "n_amenity_floors": [1, 3],
    "podium_stories": [2, 8],
    "podium_height_m": [7.0, 27.0],
    "podium_height_modal_m": 17.0,
    "tower_setback_from_podium_m": [1.52, 6.1],
    "tower_setback_modal_m": 3.05,
    "base_height_before_setback_m": [9.14, 13.72],
    "tower_floorplate_m2": [700, 1000],
    "tower_plan_width_m": [25.0, 40.0],
    "tower_plan_depth_m": [20.0, 30.0],
    "corridor_width_m": [1.52, 1.83],
    "unit_depth_m": [8.5, 13.7],
    "unit_facade_width_m": [3.05, 7.62],
    "slenderness_h_over_w": [2.0, 5.0],
    "height_formula": "h_ground + n_amenity*h_amenity + (n_floors-1-n_amenity)*ftf + parapet",
    "weights": {
      "podium_plus_single_slab_tower": 0.26,
      "podium_plus_twin_towers": 0.2,
      "shifted_stacked_boxes": 0.16,
      "perimeter_block_courtyard": 0.14,
      "terraced_stepped": 0.12,
      "extruded_slab_no_podium": 0.12
    },
    "shifted_box_offset_m": [1.52, 4.57],
    "cantilever_projection_m": [1.52, 3.05],
    "terrace_setback_step_m": [2.44, 4.88],
    "terrace_step_interval_floors": [3, 6],
    "courtyard_span_m": [15.0, 40.0]
  },
  "facade_module": {
    "module_width_m": [1.37, 1.83],
    "module_width_modal_m": 1.52,
    "module_width_weights": {"1.37": 0.2, "1.52": 0.44, "1.83": 0.22, "2.13_3.05": 0.1, "custom_0.91_3.05": 0.04},
    "manufacturer_standard_width_m": [1.2, 1.5],
    "manufacturer_extended_width_m": [0.91, 3.05],
    "vision_glass_height_m": [1.98, 2.44],
    "vision_glass_modal_m": 2.29,
    "spandrel_height_m": [0.61, 1.07],
    "spandrel_modal_m": 0.71,
    "head_rail_m": [0.05, 0.1],
    "sill_rail_m": [0.05, 0.1],
    "sill_upstand_above_floor_m": [0.1, 0.25],
    "head_reveal_below_ceiling_m": [0.05, 0.15],
    "horizontal_transom_width_m": [0.064, 0.102],
    "horizontal_transom_height_aff_m": [0.61, 1.07],
    "horizontal_transom_probability": 0.3
  },
  "system": {
    "weights": {"window_wall": 0.72, "unitized_curtain_wall": 0.28},
    "window_wall": {
      "unit_height_m": [2.9, 3.2],
      "frame_depth_m": [0.114, 0.127],
      "mullion_face_width_captured_m": [0.064, 0.102],
      "mullion_face_width_ssg_m": [0.038, 0.051],
      "silicone_joint_width_m": [0.016, 0.025],
      "glass_setback_from_slab_edge_m": [0.05, 0.15],
      "mullion_cap_projection_m": [0.013, 0.038],
      "head_deflection_travel_m": 0.019,
      "igu_thickness_m": [0.026, 0.032],
      "igu_thickness_laminated_m": [0.034, 0.042],
      "igu_thickness_full_range_m": [0.024, 0.052],
      "horizontal_joint_pitch_m": "equals floor_to_floor",
      "slab_edge_weights": {
        "spandrel_glass_aligned": 0.42,
        "aluminum_or_acm_cover_panel": 0.22,
        "shadowbox": 0.18,
        "exposed_concrete_slab_edge": 0.12,
        "projecting_concrete_eyebrow": 0.06
      },
      "slab_edge_cover_height_m": [0.3, 0.61],
      "slab_edge_cover_proud_of_glass_m": [0.0, 0.05],
      "exposed_slab_edge_band_m": [0.25, 0.45],
      "exposed_slab_edge_proud_m": [0.03, 0.1],
      "shadowbox_air_gap_m": [0.05, 0.1],
      "eyebrow_projection_m": [0.2, 0.61]
    },
    "unitized_curtain_wall": {
      "module_width_m": [1.37, 1.83],
      "module_height_m": [2.9, 4.2],
      "sightline_captured_m": 0.0635,
      "system_depth_options_m": [0.152, 0.191],
      "frame_depth_low_mid_rise_m": [0.15, 0.18],
      "frame_depth_high_rise_m": [0.175, 0.225],
      "frame_depth_supertall_m": [0.2, 0.25],
      "vertical_split_mullion_joint_m": [0.01, 0.015],
      "horizontal_stack_joint_m": [0.015, 0.025],
      "horizontal_stack_joint_high_wind_m": [0.025, 0.045],
      "horizontal_stack_joint_seismic_m": [0.035, 0.05],
      "stack_joint_height_above_floor_m": [1.0, 1.22],
      "glass_outboard_of_slab_m": [0.05, 0.2]
    },
    "vertical_fins": {
      "probability": 0.15,
      "projection_m": [0.1, 0.3],
      "thickness_m": [0.019, 0.038],
      "spacing_weights": {"every_module": 0.55, "every_second_module": 0.45}
    },
    "corner_weights": {
      "butt_glazed_silicone": 0.34,
      "corner_mullion": 0.3,
      "chamfer": 0.14,
      "spandrel_wrapped": 0.14,
      "curved_radius": 0.08
    },
    "corner_mullion_width_m": [0.089, 0.152],
    "corner_chamfer_m": [0.61, 1.52],
    "corner_radius_m": [1.5, 6.0]
  },
  "balconies": {
    "distribution_weights": {
      "every_unit": 0.28,
      "checkerboard": 0.18,
      "stacked_column": 0.16,
      "alternating_floors": 0.14,
      "corner_only": 0.12,
      "setback_terraces_only": 0.08,
      "none": 0.04
    },
    "depth_projecting_m": [1.52, 2.44],
    "depth_projecting_modal_m": 1.83,
    "depth_recessed_m": [1.83, 3.05],
    "width_m": [2.44, 6.1],
    "width_modal_m": 3.66,
    "slab_thickness_m": [0.2, 0.3],
    "slab_thickness_modal_m": 0.25,
    "nosing_drip_edge_m": [0.019, 0.025],
    "soffit_reveal_m": [0.013, 0.025],
    "underside_slope_pct": [1.5, 2.0],
    "terrace_depth_m": [2.44, 7.62],
    "juliet_depth_m": [0.3, 0.61],
    "deck_finish_above_slab_m": [0.05, 0.1],
    "paver_m": [0.61, 0.61],
    "guard_height_m": 1.07,
    "max_sphere_m": 0.102,
    "glass_thickness_m": [0.012, 0.0215],
    "glass_panel_width_m": [0.91, 1.52],
    "glass_edge_tint_band_m": [0.006, 0.012],
    "base_shoe_height_m": [0.102, 0.152],
    "base_shoe_width_m": [0.064, 0.102],
    "post_size_m": [0.038, 0.064],
    "post_spacing_m": [1.22, 1.52],
    "top_cap_dia_m": [0.038, 0.064],
    "picket_dia_m": [0.013, 0.019],
    "picket_clear_spacing_m": [0.089, 0.102],
    "cable_dia_m": [0.005, 0.008],
    "cable_spacing_m": 0.076,
    "cable_runs": [12, 14],
    "perforation_dia_m": [0.003, 0.006],
    "perforation_open_ratio": [0.3, 0.45],
    "guard_type_weights": {
      "frameless_glass_base_shoe": 0.3,
      "framed_glass_posts": 0.24,
      "vertical_picket": 0.2,
      "horizontal_cable": 0.1,
      "perforated_metal": 0.08,
      "solid_metal_panel": 0.08
    },
    "modifiers": {
      "skip_lowest_two_floors_probability": 0.65,
      "top_floor_full_terrace_probability": 0.45,
      "depth_jitter_probability": 0.3,
      "depth_jitter_m": 0.15,
      "variant_guard_fraction": [0.08, 0.15],
      "privacy_screen_probability": 0.35,
      "privacy_screen_height_m": 1.83
    },
    "clutter": {
      "occupied_fraction": [0.4, 0.7],
      "chair_m": [0.55, 0.55, 0.85],
      "table_dia_m": 0.6,
      "table_height_m": 0.72,
      "planter_dia_m": [0.25, 0.45],
      "planter_height_m": [0.3, 0.5],
      "bicycle_m": [1.7, 1.05],
      "grill_probability": 0.1
    }
  },
  "flood_base": {
    "bfe_navd88_m": [3.05, 3.96],
    "freeboard_m": 0.61,
    "reference_plane_max_above_base_plane_high_risk_m": 3.05,
    "reference_plane_max_above_base_plane_moderate_risk_m": 1.52,
    "ground_floor_above_grade_m": [0.61, 1.52],
    "ground_floor_above_grade_modal_m": 0.91,
    "ground_floor_min_above_curb_m": 1.52,
    "dry_floodproofed_tolerance_m": 0.61,
    "blank_base_band_height_m": [0.61, 1.83],
    "blank_base_band_modal_m": 1.07,
    "retaining_wall_max_visible_m": 0.91,
    "berm_max_height_m": 1.52,
    "entry_riser_count": [3, 8],
    "riser_m": 0.152,
    "tread_m": 0.33,
    "ramp_slope": 0.0833,
    "ramp_run_m": [3.05, 9.14],
    "flood_vent_m": [0.41, 0.2],
    "flood_vent_spacing_m": [1.52, 3.05],
    "flood_vent_bottom_above_grade_max_m": 0.3,
    "flood_vent_area_rule": "1 sq in net open area per sq ft of enclosed area, min 2 openings on 2 walls",
    "garage_louver_m": [[1.22, 2.44], [1.22, 2.03]],
    "louver_blade_pitch_m": 0.051,
    "loading_door_m": [[3.05, 4.27], [3.66, 4.27]],
    "streetwall_within_street_line_m": 2.44,
    "streetwall_recess_wide_street_m": 3.05,
    "streetwall_recess_narrow_street_m": 4.57,
    "base_cladding_weights": {
      "precast_or_cast_stone": 0.26,
      "brick": 0.2,
      "granite_limestone_veneer": 0.18,
      "acm_metal_panel": 0.18,
      "board_formed_concrete": 0.1,
      "perforated_metal_screen": 0.08
    },
    "ground_floor_use_weights": {
      "lobby_plus_retail": 0.38,
      "lobby_only": 0.34,
      "lobby_plus_garage": 0.16,
      "retail_only": 0.12
    },
    "lobby_glazing_height_m": [4.27, 6.1],
    "canopy_projection_m": [1.52, 3.05],
    "canopy_height_above_grade_m": [3.35, 4.27]
  },
  "roof": {
    "parapet_height_m": [1.07, 1.37],
    "parapet_thickness_m": [0.2, 0.3],
    "coping_width_m": [0.3, 0.5],
    "coping_thickness_m": 0.05,
    "bulkhead_height_m": [3.05, 7.62],
    "bulkhead_height_modal_m": 4.88,
    "bulkhead_footprint_ratio": [0.15, 0.35],
    "elevator_overrun_height_m": [3.66, 5.49],
    "elevator_overrun_plan_m": [4.0, 6.0],
    "stair_bulkhead_height_m": [2.44, 4.0],
    "stair_bulkhead_plan_m": [3.0, 4.5],
    "cooling_tower_height_m": [2.44, 4.0],
    "cooling_tower_length_m": [3.05, 6.1],
    "cooling_tower_width_m": 2.44,
    "fan_cowl_dia_m": 1.22,
    "condenser_unit_height_m": [1.0, 1.5],
    "condenser_unit_count": [4, 20],
    "housekeeping_pad_m": 0.15,
    "screen_wall_height_m": [2.44, 3.66],
    "screen_wall_open_ratio": 0.4,
    "pergola_clear_height_m": [2.44, 3.05],
    "pergola_post_m": [0.1, 0.2],
    "pergola_bay_m": [3.05, 4.27],
    "pergola_slat_pitch_m": [0.15, 0.3],
    "windscreen_height_m": [1.52, 2.13],
    "windscreen_glass_thickness_m": [0.012, 0.015],
    "roof_planter_height_m": [0.61, 0.91],
    "roof_planter_width_m": [0.91, 1.22],
    "pool_length_m": [6.0, 12.0],
    "pool_width_m": [3.0, 5.0],
    "pv_module_m": [1.0, 2.0],
    "pv_tilt_deg": 10,
    "pv_row_pitch_m": 2.4,
    "roof_paver_m": [0.61, 0.61],
    "davit_tieback_inset_m": 0.61,
    "davit_tieback_pitch_m": 3.66,
    "scupper_m": [0.2, 0.1],
    "scupper_pitch_m": 12.2,
    "obstruction_light_height_threshold_m": 61.0,
    "wooden_water_tower_probability": 0.05,
    "antenna_panel_height_m": [1.83, 3.05]
  },
  "metal_panel": {
    "design_module_m": [1.2, 3.0],
    "real_panel_sizes_m": [[0.76, 1.6], [0.76, 2.44], [0.76, 4.93], [1.52, 1.6], [1.52, 2.44], [1.52, 4.93], [0.94, 1.52], [1.19, 1.52]],
    "reveal_joint_width_m": [0.01, 0.02],
    "reveal_joint_modal_m": 0.013,
    "reveal_depth_m": [0.019, 0.025],
    "acm_thickness_m": [0.004, 0.006],
    "return_leg_m": [0.019, 0.025],
    "bow_tolerance_ratio": 0.00571,
    "oil_canning_amplitude_m": [0.002, 0.004],
    "corrugated_rib_pitch_m": [0.076, 0.203],
    "corrugated_rib_depth_m": [0.019, 0.038],
    "standing_seam_pitch_m": [0.305, 0.61],
    "standing_seam_height_m": [0.019, 0.038],
    "perforation_dia_m": [0.006, 0.019],
    "perforation_open_ratio": [0.25, 0.5],
    "perforation_pitch_m": [0.013, 0.038],
    "fastener_pitch_m": 0.406,
    "color_weights": {
      "dark_gray_graphite": 0.22,
      "bronze": 0.16,
      "black": 0.14,
      "champagne_warm_silver": 0.12,
      "white": 0.12,
      "clear_anodized_mill": 0.1,
      "copper": 0.06,
      "preweathered_zinc": 0.06,
      "deep_green_or_blue": 0.02
    },
    "precast_variant": {
      "probability": 0.1,
      "panel_width_m": [1.52, 3.05],
      "panel_height_m": [3.05, 3.66],
      "relief_depth_m": [0.05, 0.2],
      "joint_m": 0.019
    }
  },
  "brick_modern_variant": {
    "probability": 0.22,
    "panelized_panel_width_m": [1.52, 3.05],
    "panelized_panel_height_m": [3.05, 3.66],
    "panelized_joint_m": [0.013, 0.019],
    "thin_brick_face_m": [0.203, 0.057],
    "course_height_m": 0.0678,
    "mortar_joint_m": 0.0095,
    "long_format_brick_face_m": [0.53, 0.037],
    "long_format_course_m": 0.047,
    "long_format_weight": 0.1,
    "punched_opening_w_m": [1.83, 3.66],
    "punched_opening_h_m": [2.13, 2.74],
    "paired_lite_width_m": 1.22,
    "paired_mullion_m": 0.1,
    "pier_width_m": [0.3, 0.91],
    "window_reveal_m": [0.1, 0.2],
    "spandrel_between_openings_m": [0.61, 1.07],
    "steel_lintel_m": [0.089, 0.152],
    "sill_projection_m": [0.05, 0.08],
    "sill_slope_deg": 12,
    "accent_band_height_m": [0.2, 0.41],
    "water_table_height_m": [0.61, 1.07],
    "bond": "running"
  },
  "waterfront": {
    "esplanade_paver_m": [[0.61, 0.61], [0.3, 0.61]],
    "esplanade_paver_joint_m": 0.005,
    "decking_board_width_m": 0.14,
    "decking_gap_m": 0.006,
    "guardrail_height_m": 1.07,
    "guardrail_pipe_dia_m": 0.051,
    "guardrail_post_spacing_m": 1.52,
    "bulkhead_cap_above_mhw_m": [0.61, 1.22],
    "bulkhead_cap_width_m": 0.61,
    "sheet_pile_corrugation_pitch_m": 0.61,
    "sheet_pile_amplitude_m": 0.15,
    "fender_pile_dia_m": [0.3, 0.4],
    "fender_pile_spacing_m": [1.5, 3.0],
    "relic_pile_dia_m": [0.25, 0.45],
    "relic_pile_height_above_water_m": [0.5, 2.5],
    "relic_pile_cluster_count": [4, 30],
    "relic_pile_lean_deg": [5, 15],
    "riprap_stone_dia_m": [0.3, 0.9],
    "riprap_slope": 0.5,
    "planting_bed_raise_m": [0.3, 0.61],
    "planting_bed_width_m": [1.5, 4.0],
    "bench_length_m": 1.83,
    "bench_seat_height_m": 0.43,
    "light_pole_height_m": [3.66, 4.57],
    "light_pole_dia_m": 0.13,
    "light_pole_pitch_m": [15.2, 22.9]
  },
  "night": {
    "lit_fraction_residential": [0.3, 0.6],
    "lit_fraction_modal": 0.42,
    "lit_fraction_amenity": 0.95,
    "lit_fraction_lobby_retail": 1.0,
    "sample_granularity": "per_unit",
    "modules_per_unit": [2, 5],
    "lit_modules_within_lit_unit": [0.6, 0.9],
    "emissive_ratio_lit_to_unlit": [8, 20],
    "spandrel_emission": 0.0,
    "tv_flicker_probability": 0.06,
    "tv_flicker_hz": [0.5, 4.0],
    "occlusion_weights": {"diffuse_glow": 0.35, "clear_rectangle": 0.45, "blind_bands": 0.2},
    "blind_band_pitch_m": 0.05,
    "balcony_downlight_dia_m": 0.05,
    "balcony_downlight_count": 2,
    "balcony_downlight_probability": 0.3,
    "balcony_string_light_probability": 0.18,
    "balcony_string_light_pitch_m": 0.2,
    "podium_uplight_pitch_m": 0.61,
    "podium_uplight_probability": 0.55,
    "obstruction_beacon_hz": 1.0,
    "colors": {
      "interior_warm": ["#ffd9a3", "#ffce8f", "#ffc27a"],
      "interior_neutral": ["#fff1dc", "#fdf3e6"],
      "amenity_lobby": ["#fff0d6", "#ffeccb"],
      "corridor_core": ["#e8f0ff", "#eef4ff"],
      "tv_flicker": ["#9fc0ff"],
      "balcony_downlight": ["#ffe3b0"],
      "string_light": ["#ffcf8a"],
      "podium_uplight": ["#e8dfc8"],
      "canopy_cove": ["#fff4e0"],
      "obstruction_beacon": ["#ff2200"]
    }
  },
  "colors": {
    "vision_glass_low_e_bluegreen": ["#a9bfbb", "#9fb7b3", "#b3c6c8"],
    "vision_glass_neutral_gray": ["#6f7679", "#7d8386", "#8e9497"],
    "vision_glass_bronze": ["#6b5b46", "#7a6852"],
    "vision_glass_blue_reflective": ["#4f6f8c", "#5c7d9c", "#6a8caa"],
    "vision_glass_low_iron_clear": ["#cfe0dc", "#d8e6e2"],
    "vision_glass_interior_dark": ["#2a3336", "#1f2629"],
    "spandrel_charcoal": ["#34383b"],
    "spandrel_black": ["#1c1e20"],
    "spandrel_warm_dark_gray": ["#3f403c"],
    "spandrel_bronze": ["#4a3c2e"],
    "spandrel_medium_gray": ["#7c8285"],
    "spandrel_gray_green": ["#55625c"],
    "spandrel_blue_gray": ["#4e5b68"],
    "spandrel_white": ["#e8e9e6"],
    "mullion_clear_anodized": ["#a5a8aa"],
    "mullion_dark_bronze_anodized": ["#3b332b"],
    "mullion_black_painted": ["#232527"],
    "mullion_white_painted": ["#dcdcd8"],
    "mullion_champagne": ["#b09a72"],
    "acm_bronze": ["#6f5a3f"],
    "acm_champagne": ["#b09a72"],
    "acm_dark_gray": ["#4a4d4f"],
    "acm_white": ["#e6e6e3"],
    "acm_black": ["#232527"],
    "acm_copper_new": ["#a4643c"],
    "acm_copper_patina": ["#5d7a6b"],
    "acm_zinc_gray": ["#8e9293"],
    "acm_preweathered_zinc": ["#6c7274"],
    "acm_mill_anodized": ["#a8abad"],
    "precast_warm_gray": ["#cdc7bb", "#c4bcae"],
    "concrete_slab_edge": ["#b8b4ab", "#aca79d"],
    "brick_iron_spot_red": ["#6e3a2e"],
    "brick_manganese_black": ["#3a3234"],
    "brick_buff": ["#c3a97e"],
    "brick_gray": ["#8c8b86"],
    "brick_deep_red": ["#8c4535"],
    "brick_warm_white": ["#d8d2c6"],
    "mortar_gray": ["#8a8880"],
    "mortar_dark": ["#3c3a38"],
    "glass_guard": ["#cdd8d6"],
    "glass_guard_edge_green": ["#7fa89a"],
    "railing_steel": ["#8e9294"]
  },
  "spandrel_color_weights": {
    "charcoal": 0.26,
    "black": 0.18,
    "medium_gray": 0.16,
    "warm_dark_gray": 0.1,
    "bronze": 0.1,
    "blue_gray": 0.08,
    "gray_green": 0.06,
    "white": 0.06
  },
  "vision_glass_weights": {
    "low_e_bluegreen": 0.42,
    "neutral_gray": 0.22,
    "blue_reflective": 0.16,
    "bronze": 0.1,
    "low_iron_clear": 0.1
  },
  "mullion_finish_weights": {
    "clear_anodized": 0.3,
    "dark_bronze_anodized": 0.24,
    "black_painted": 0.22,
    "champagne": 0.14,
    "white_painted": 0.1
  },
  "lod": {
    "lod0_under_30m": [
      "mullion_cap_and_gasket",
      "silicone_joint",
      "glass_guard_base_shoe",
      "glass_edge_green_tint",
      "acm_reveal_shadow",
      "flood_vent_louver_blades",
      "balcony_soffit_downlight",
      "balcony_clutter",
      "esplanade_paver_joints",
      "oil_canning",
      "sealant_bleed_staining"
    ],
    "lod1_30_to_100m": [
      "floor_line_at_every_slab",
      "vision_spandrel_split",
      "mullion_vertical_rhythm",
      "balcony_slab_and_guard",
      "parapet_and_coping",
      "bulkhead_mass",
      "podium_setback",
      "raised_flood_base",
      "punched_openings_on_brick_variant"
    ],
    "lod2_over_100m": [
      "silhouette_and_setbacks",
      "horizontal_banding_ratio",
      "gross_reflectivity_and_fresnel",
      "night_lit_window_pattern",
      "rooftop_equipment_silhouette",
      "obstruction_beacon"
    ]
  }
}
```

---

## MATERIALS & COLORS

### Glass

| Material | Hex | Roughness | Metalness | Other |
|---|---|---|---|---|
| Vision, low-e blue-green (default) | `#a9bfbb` reflected / `#2a3336` interior | 0.03 | 0.00 | IOR 1.52, F0 0.04, `reflectivity` 0.5, `envMapIntensity` 1.0–1.4. VLT 0.62–0.70, ext. reflectance 0.11–0.12 |
| Vision, neutral gray | `#6f7679` | 0.04 | 0.00 | VLT 0.35–0.50, ext. refl. 0.10–0.14 |
| Vision, blue reflective (Northside Piers idiom) | `#5c7d9c` | 0.02 | 0.00 | ext. refl. 0.20–0.30 |
| Vision, bronze | `#6b5b46` | 0.05 | 0.00 | VLT 0.35–0.50 |
| Vision, low-iron clear | `#d8e6e2` | 0.02 | 0.00 | VLT 0.78–0.85 |
| Spandrel glass (opaque back) | per `spandrel_*` palette | 0.04 | 0.00 | Same front-surface gloss as vision. `transmission` 0, `emissive` 0 always |
| Shadowbox | spandrel hex × 0.85 | 0.05 | 0.00 | Add 0.05–0.10 m parallax depth + back-pan seam at module pitch |
| Glass guard | `#cdd8d6` | 0.03 | 0.00 | opacity 0.16–0.22, edge band `#7fa89a` |

**Critical PBR rule:** architectural glass is a **dielectric** — `metalness = 0.0`, `roughness 0.02–0.08`, IOR 1.50–1.52. Normal-incidence reflectance is only 4% (F0 = 0.04); the mirror look comes from the Fresnel ramp to ~100% at grazing angles. Setting `metalness = 1.0` produces the tinted-chrome look that instantly reads as CG. Reflective coatings raise F0 to 0.10–0.30, not to 1.0.

### Metals

| Material | Hex | Roughness | Metalness | bump_scale_m | tile_m |
|---|---|---|---|---|---|
| Clear anodized aluminum mullion | `#a5a8aa` | 0.35 | 0.55 | 0.0004 | 0.15 |
| Dark bronze anodized mullion | `#3b332b` | 0.40 | 0.45 | 0.0004 | 0.15 |
| Black painted mullion | `#232527` | 0.42 | 0.20 | 0.0003 | — |
| ACM, solid color PVDF | palette | 0.32 | 0.15 | 0.0015 (oil-can) | 1.2 × 3.0 |
| ACM, metallic PVDF | palette | 0.28 | 0.45 | 0.0015 | 1.2 × 3.0 |
| Zinc / pre-weathered zinc | `#6c7274` | 0.50 | 0.40 | 0.0020 | 0.61 |
| Copper, new | `#a4643c` | 0.42 | 0.60 | 0.0020 | 0.61 |
| Copper, patinated | `#5d7a6b` | 0.62 | 0.25 | 0.0030 | 0.61 |
| Perforated metal screen | `#7f8385` | 0.45 | 0.35 | — | use alpha map, 25–50% open |
| Stainless steel base trim | `#b6b9ba` | 0.28 | 0.80 | 0.0002 | — |
| Painted steel railing | `#8e9294` | 0.35 | 0.70 | 0.0003 | — |
| Aluminum coping | `#a9aaa6` | 0.42 | 0.35 | 0.0006 | 0.5 |
| Galvanized rooftop equipment | `#9ea2a3` | 0.55 | 0.50 | 0.0010 | 0.3 |

### Masonry / concrete

| Material | Hex | Roughness | Metalness | bump_scale_m | tile_m |
|---|---|---|---|---|---|
| Architectural precast, sandblasted | `#cdc7bb` | 0.72 | 0.00 | 0.0060 | 1.52 × 3.05 |
| Exposed slab edge, painted | `#b8b4ab` | 0.80 | 0.00 | 0.0025 | 3.05 |
| Board-formed concrete | `#a9a49b` | 0.82 | 0.00 | 0.0080 | 0.15 board |
| Cast stone base | `#c7c1b4` | 0.70 | 0.00 | 0.0040 | 0.61 × 1.22 |
| Thin brick panel, iron-spot | `#6e3a2e` | 0.78 | 0.00 | 0.0040 | 0.203 × 0.0678 |
| Thin brick panel, manganese | `#3a3234` | 0.74 | 0.00 | 0.0040 | 0.203 × 0.0678 |
| Mortar, gray | `#8a8880` | 0.86 | 0.00 | 0.0020 | — |
| Esplanade paver | `#b9b5ac` | 0.85 | 0.00 | 0.0030 | 0.61 |
| Ipe decking | `#6a4f3a` | 0.68 | 0.00 | 0.0015 | 0.14 |

---

## WEATHERING & IMPERFECTION

Glass towers weather less than masonry, but they weather **in specific, legible places**. Zero weathering is a stronger CG tell here than on brick, because the eye expects streaking below every horizontal.

| Effect | Numbers |
|---|---|
| Rain streaking below slab-edge covers / eyebrows | Vertical streaks 0.30–1.20 m long, width 0.02–0.06 m, opacity 0.08–0.22, color `#6f6f68`. Origin at the drip edge, pitch 0.30–0.60 m, denser under mullion intersections. Coverage 4–12% of spandrel band |
| Mullion drip staining on glass | Streaks 0.15–0.60 m below each horizontal transom, width 0.008–0.020 m, opacity 0.06–0.15 |
| Salt haze (waterfront, within 150 m of the river) | Uniform roughness increase +0.01–0.03 and a 3–8% desaturating white film on the west/river elevation; strongest floors 1–8 |
| Hard-water spotting | Dot field 0.002–0.006 m dia, density 40–160 per m², opacity 0.05–0.12, on the lower 6 floors and around window-washing anchor lines |
| Sealant / silicone bleed | Dark halo 0.010–0.025 m wide alongside 15–35% of vertical joints, opacity 0.10–0.25, color `#5c5a55`. Only on buildings older than 8 years |
| Gasket chalking | EPDM shifts from `#1a1a1a` to `#3d3d3a`, roughness 0.55 → 0.75, on 20–50% of exposed gaskets after 10 years |
| Oil-canning / panel bow (ACM) | Amplitude 0.002–0.004 m, one lobe per panel, random sign; visible only as a broken reflection at grazing angles. Bow tolerance L/175 |
| IGU reflection distortion | ±0.5–1.5% per-pane normal tilt, random per module; 3–8% of panes show a visibly different reflected sky angle. This is what makes a real glass wall shimmer |
| Failed / fogged IGU | Probability 0.004 per pane; milky `#c8cdcb`, roughness 0.35 |
| Cracked pane with tape | Probability 0.0008 per pane |
| Efflorescence at concrete/precast base | White bloom `#ddd9cf`, opacity 0.15–0.40, patches 0.15–0.60 m, from grade to 1.5 m, coverage 3–10% |
| Tide/flood line on the base | Horizontal stain band at 0.61–1.22 m above grade, height 0.08–0.20 m, opacity 0.15–0.30, color `#6d6a5e` |
| Rust bleed from fasteners | Streaks 0.05–0.25 m, width 0.004–0.010 m, `#7a4a2a`, at 0.406 m pitch on corrugated/perforated panels only |
| Bird guano at parapet and ledges | Speckle 0.01–0.04 m, `#e6e4dc`, density 8–40 per m² on the parapet top, coping, and balcony guard top caps; on the river-facing side at 2× |
| Balcony slab underside staining | Grid of 0.30 m-wide darker bands tracing rebar/formwork, opacity 0.06–0.14; drip stain at the nosing 0.05–0.15 m tall, opacity 0.20 |
| Esplanade concrete staining | Irregular patches 0.5–3.0 m, opacity 0.10–0.30, `#8c887c`; algae in joints `#4a5546`, width 0.005 m |
| Graffiti / stickers | Only on the base below 2.4 m: 0–2 tags, 0.4–1.6 m wide, probability 0.14 |
| Window-cleaner squeegee arcs | Faint arcs radius 0.4–0.8 m, opacity 0.03–0.06, on 5–15% of panes below floor 6 |
| Blind/curtain color variation | 6–14 distinct interior treatments per building sampled per unit: white `#eeece5`, cream `#e6ddc8`, gray `#a9aaa6`, blackout dark `#2f3134`, plus 5% saturated outliers. Never a single uniform interior color |
| Interior clutter visible through glass | 0.35–0.60 of vision panes show a dark rectangle 0.4–1.2 m (furniture/shelf) at 0.3–1.2 m above the sill |

---

## DETAILS CHECKLIST (ordered by visual importance at 30 m)

1. **Horizontal floor line at every slab — pitch exactly 3.05 m.** Window wall puts a full-width joint at each floor; this banding *is* the building. Line contrast: 12–30% luminance step over a 0.02–0.05 m band.
2. **Vision-to-spandrel ratio 2.29 : 0.71 (76% : 24%)** within each 3.05 m floor. Spandrel is opaque and darker than vision glass by 25–55% luminance.
3. **Vertical mullion rhythm at 1.52 m** with a cap projecting 0.013–0.038 m from the glass. Verticals must be weaker than the horizontals.
4. **Dielectric glass: metalness 0.0, roughness 0.03, F0 0.04, IOR 1.52.** Grazing-angle Fresnel does the mirror work, not metalness.
5. **Balcony grid: slab 0.25 m + guard 1.07 m, depth 1.83 m, width 3.66 m,** distributed by one of the seven weighted patterns — never uniformly on every unit at every floor unless `every_unit` was sampled.
6. **Parapet 1.07 m + bulkhead 3.05–7.62 m** breaking the silhouette over 15–35% of the roof. A flat-topped extrusion with no bulkhead is instantly wrong.
7. **Raised flood base: finished ground floor 0.61–1.52 m above grade**, entered up 3–8 risers or a ramp, with a 0.61–1.83 m blank band and 0.41 × 0.20 m flood vents.
8. **Podium + tower setback 1.52–6.10 m** at 7.0–27.0 m, with a materially different podium skin.
9. **ACM reveal joints as 0.013 m pure-black shadow lines** on a 1.2 × 3.0 m grid — modelled geometry or a real depth of 0.019–0.025 m, not a painted line.
10. **Ground-floor storefront 4.27–6.10 m tall** with a canopy projecting 1.52–3.05 m at 3.35–4.27 m — a base that is the same height as the residential floors is the second-fastest tell.
11. **Rooftop equipment: cooling towers 2.44–4.00 m, screen wall 2.44–3.66 m, no wooden water tower** (probability 0.05).
12. **Per-unit night lighting at 0.42 lit fraction, sampled per unit (2–5 modules), spandrel emission 0.**
13. **Interior variation behind the glass** — 6–14 blind/curtain colors, 0.35–0.60 of panes with a dark furniture silhouette.
14. **Rain streaking 0.30–1.20 m below every slab-edge cover**, opacity 0.08–0.22.
15. **Waterfront apron: 12.19 m esplanade, 1.07 m pipe guard, relic timber piles 0.25–0.45 m dia** in clusters offshore.

---

## COMMON MISTAKES

1. **Glass modelled as metal.** `metalness = 1.0` gives tinted chrome. Correct: `metalness 0.0`, `roughness 0.03`, `ior 1.52`, F0 0.04, `envMapIntensity 1.0–1.4`.
2. **Continuous unbroken glass from floor 3 to the roof.** NYC residential is window wall: a horizontal joint at **every** 3.05 m. If you want a continuous look, that is unitized curtain wall — and then the seam goes 1.00–1.22 m *above* the floor, still visible.
3. **Spandrel glowing at night.** Spandrel, shadowbox, and slab-edge covers are opaque: emission 0. Only the 1.98–2.44 m vision band lights up, which is why lit towers read as horizontal dashes, not solid columns.
4. **Balcony guard at 0.90–1.00 m.** NYC BC 1015.3 minimum is **1.07 m (42 in)**. A 36 in rail reads suburban.
5. **Guard openings wider than 0.102 m.** 4 in sphere rule — picket clear spacing 0.089–0.102 m, cable pitch 0.076 m.
6. **Glass flush with the facade plane.** The mullion cap stands 0.013–0.038 m proud, the glass sits 0.05–0.15 m back from the slab-edge face, and on the brick variant the reveal is 0.10–0.20 m.
7. **Office floor-to-floor on a condo.** 4.0–4.5 m is office. Residential is **2.90–3.20 m**, modal 3.05 m, with a 2.59–2.90 m ceiling.
8. **Uniform balconies on every unit, every floor, same depth.** Sample from the weighted distribution table; skip the lowest 2 floors at 0.65; jitter depth ±0.15 m.
9. **A wooden water tower on a 2018 glass tower.** Probability 0.05. Internal pressure tanks replaced them. Put the water towers on the converted loft next door instead.
10. **Ground floor sitting at grade on the waterfront.** The Design Flood Elevation is BFE + 0.61 m; the finished floor lands 0.61–1.52 m above grade, entered by 3–8 risers, over a blank flood-resistant base.
11. **No bulkhead / mechanical penthouse.** Every tower has one at 3.05–7.62 m over 15–35% of the roof, plus a 1.07 m parapet. A clean flat top is a massing study, not a building.
12. **Mullion sightlines too wide.** 0.064–0.102 m captured, 0.038–0.051 m structural silicone. A 0.20 m mullion reads as a 1960s storefront.
13. **All windows lit at equal intensity, or a random per-pane noise pattern.** Sample **per unit** (2–5 contiguous modules) at a 0.42 lit fraction; lit units show 0.6–0.9 of their own modules on.
14. **One uniform glass tint across the whole facade with no per-pane variation.** Add ±0.5–1.5% random pane tilt and 3–8% visibly-off panes, or the wall looks like a single flat plane.
15. **Podium clad in the same skin as the tower.** The podium is a different material (brick, ACM, perforated metal, precast) with punched or ribbon windows and a 0.10–0.20 m reveal.
16. **Reveal joints painted on ACM instead of recessed.** They need 0.019–0.025 m of real depth so they read as black regardless of sun angle.
17. **Brick modelled with no reveal and no course scale.** Course height 0.0678 m, 3 courses = 0.203 m, mortar 0.0095 m, opening reveal 0.10–0.20 m. Panelized brick adds a 0.013–0.019 m panel joint every 1.52–3.05 m.
18. **Perfectly clean glass and unstained concrete on a building sited 30 m from a tidal river.** Salt haze on the river face, tide-line stain at 0.61–1.22 m, efflorescence on the base at 3–10% coverage.
19. **Slenderness pushed toward supertall.** Williamsburg/Greenpoint towers run H/W 2.0–5.0, 20–42 stories. A 1:10 needle in this neighbourhood is wrong.
20. **Balconies with nothing on them.** 0.40–0.70 are occupied by chairs, planters, bikes, and boxes — the only saturated color on an otherwise gray-green building.
