# 09 — Corner Buildings (corner-condition modifier)
> Not a building type — a **modifier applied on top of any typology** (brownstone/rowhouse, tenement, loft/warehouse, prewar apartment, mixed-use taxpayer). Defines corner lot geometry, corner-cut variants (chamfer / round / turret), wraparound cornices and belt courses, avenue-vs-side-street asymmetry, the corner storefront, the **exposed blind party wall** (the single highest-value authenticity element), and the corner streetscape. Applies at every Manhattan avenue × side-street intersection, every Brooklyn/Williamsburg corner (Bedford, Driggs, Metropolitan, Grand, Broadway, Kent), and 125th St / Lenox / 3rd Ave in Harlem.

---

## 1. CORNER LOT GEOMETRY

### Legal definition (drives everything downstream)
| Fact | Value | Source |
|---|---|---|
| Corner lot | a zoning lot **bounded entirely by streets**, OR one adjoining the intersection of two or more streets where the interior angle formed by the extended street lines is **≤ 135°** | NYC ZR 12-10 |
| Extent of "corner" regulations on the lot | the portion within **30.48 m (100 ft)** of *each* intersecting street line | NYC ZR 12-10 |
| Street ROW, Manhattan avenue | **30.48 m (100 ft)** | canon |
| Street ROW, Manhattan side street | **18.29 m (60 ft)** | canon |
| Street ROW, wide crosstown (14/23/34/42/57/72/79/86/96/116/125) | **30.48 m (100 ft)** | canon |
| Street ROW, Williamsburg/Greenpoint | **18.29 m (60 ft)**; Bedford / Metropolitan / Grand **21.34–24.38 m (70–80 ft)** | canon |
| Curb return radius at the corner | **3.05 – 6.10 m (10 – 20 ft)**; typ **4.57 m (15 ft)** | NYC DOT |
| Sidewalk width at the corner | side street 3.66–4.57 m; avenue 4.57–6.10 m — the corner *reads wider* because two sidewalks merge across the return | canon |

### Lot dimensions
| Case | Frontage on the primary (avenue) street | Frontage on the secondary (side) street | Weight |
|---|---|---|---|
| Single lot turned to the corner | **7.62 m (25 ft)** | 22.86–30.48 m (75–100 ft) | 0.24 |
| Widened corner lot (the common case) | **7.62 – 9.14 m (25 – 30 ft)** | 25.91–30.48 m (85–100 ft) | 0.31 |
| 2-lot corner assemblage (New Law tenement / prewar) | **12.19 – 15.24 m (40 – 50 ft)** | 25.91–30.48 m | 0.26 |
| 3–4 lot corner (prewar apartment, taxpayer) | **18.29 – 30.48 m (60 – 100 ft)** | 25.91–30.48 m | 0.14 |
| Corner loft / warehouse | 15.24–45.72 m | 22.86–61.0 m | 0.05 |

**Rule: the deep dimension runs along the SIDE STREET.** A 25 × 100 ft lot rotated to the corner presents its 25 ft face on the avenue and its 100 ft face on the side street. This is why the side-street facade has 2–3× as many bays.

### Lot coverage — corners get more
| Regime | Interior / through lot | **Corner lot** | Note |
|---|---|---|---|
| Tenement House Act 1901 (governs New Law tenements) | **70%** | **90%** | the historical rule that produced the deep corner tenement |
| Current ZR, contextual R6A / R6B | 60% | **80%** | |
| Current ZR, contextual R7A / R7B / R7D | 65% | **80%** | |
| Current ZR, contextual R7X / R8A / R8B / R8X / R9A | 70% | **80%** | |
| Current ZR, contextual R10A | 70% | **100%** | |
| Current ZR, non-contextual R6 / R7 | 65% | 70% | |
| Current ZR, non-contextual R8 / R9 / R10 | 65% | 75% | |
| Current ZR, multiple dwellings in R1–R5 | 80% | **100%** | ZR 23-361 |

**Geometric consequences:**
- Corner lots need **no rear yard** in most districts (a corner lot has no true rear lot line within 30.48 m of the corner) ⇒ the building runs **lot-line to lot-line, front to back**, producing an **L, T or full-rectangle footprint** instead of the mid-block bar + rear yard.
- Interior court/air shaft is pushed to the **interior corner** of the L, or eliminated. Old-law dumbbell indents appear on the *interior* lot line only, never on either street.
- The building is deeper than its mid-block neighbours by **3–9 m**, which is the second reason the party wall gets exposed.

### Corner-cut footprint loss (compute this, don't guess)
| Cut | Formula | W or R = 1.22 m | 1.52 m | 2.44 m | 4.00 m |
|---|---|---|---|---|---|
| 45° chamfer, face width W | area = W² / 4; setback along each facade = **0.707 W** | 0.37 m² | 0.58 m² | 1.49 m² | — |
| Quarter-round, radius R | area = 0.2146 R² | 0.32 m² | 0.50 m² | 1.28 m² | 3.43 m² |

---

## 2. CORNER-CUT VARIANTS

### Variant weights by host typology
| Typology | Square | 45° chamfer | Rounded | Projecting corner bay/oriel | Tower / turret |
|---|---|---|---|---|---|
| Rowhouse / brownstone corner | **0.80** | 0.08 | 0.02 | 0.08 | 0.02 |
| Old-law tenement corner | **0.78** | 0.14 | 0.02 | 0.04 | 0.02 |
| **New-law tenement corner** | 0.66 | **0.22** | 0.04 | 0.04 | **0.04** |
| Loft / warehouse corner | **0.86** | 0.08 (base-only) | 0.06 | 0.00 | 0.00 |
| Prewar apartment 1900–1930 | 0.72 | **0.16** | 0.08 | 0.00 | 0.04 |
| Art Deco / Streamline 1930–1942 | 0.44 | 0.14 | **0.42** | 0.00 | 0.00 |
| Mixed-use taxpayer 1920–1955 | 0.68 | **0.26** (base-only, for the store door) | 0.06 | 0.00 | 0.00 |
| Queen Anne / Romanesque flats 1885–1900 | 0.58 | 0.14 | 0.04 | 0.10 | **0.14** |

### 2a. Chamfered / canted corner
| Property | Value |
|---|---|
| **Chamfer face width** | **1.22 – 2.44 m (4 – 8 ft)**; mode **1.52 m (5 ft)** |
| Setback along each facade from the theoretical corner point | **0.707 × W** = 0.86 – 1.73 m |
| Angle | **45.0°** (bisector of a 90° corner). At an acute street intersection (Broadway, Flatbush, Bedford at Lorimer), the chamfer bisects the actual angle: 30–60° faces occur; the chamfer face width grows to 2.44–3.66 m at angles under 70° |
| **Full-height** chamfer (grade → cornice) | probability **0.62** |
| **Base-only** chamfer (stories 1–2, then corbelled back to square) | probability **0.38**; corbel-back happens over **3–7 courses (0.20–0.47 m)** in the story above, each course advancing 0.045–0.10 m, OR under a stone/pressed-metal shelf 0.10–0.20 m thick |
| Windows on the chamfer face | 1 per floor (**0.72**), 0 / blind (**0.20**), 2 narrow (**0.08**) |
| Chamfer window width | **0.61 – 0.91 m (24 – 36 in)** — narrower than the typical 0.86–1.07 m; height unchanged |
| Chamfer arris treatment | square arris (0.52), quoined/rusticated blocks 0.30–0.46 m tall alternating 0.10 m out (0.24), bullnose brick radius **0.05–0.10 m** (0.18), engaged pilaster/column 0.20–0.40 m wide (0.06) |
| Top of the chamfer | continues into the cornice (0.55); capped by a small pediment 1.22–2.44 m wide rising 0.30–0.91 m (0.25); capped by a raised parapet panel 0.61–1.22 m tall (0.20) |
| Cornice across the chamfer | the cornice runs as a **third straight segment**; the two miters are cut at **22.5°**. On a 1.52 m chamfer this segment carries **1–2 brackets** (bracket pitch on the main facade 0.61–1.22 m, so 1.52 m of chamfer = 1–2). Never round the cornice over a chamfer. |
| Belt courses across the chamfer | continue 1.00 probability, same 22.5° miters |
| Fire escape on the chamfer | **never** |

### 2b. Rounded corner
| Property | Value |
|---|---|
| **Radius** | **1.52 – 4.00 m**; Art Deco / Streamline Moderne mode **1.83 – 3.05 m (6 – 10 ft)**; tight "bullnose" corner **0.61 – 1.22 m** |
| Construction, R ≥ 1.50 m | standard 0.203 m stretchers laid to the chord — sagitta (deviation) is only **0.002 m** at R = 2.44 m, so it reads as a true curve; **quarter-arc facet count = πR / 2 / 0.213 ≈ 18 facets at R = 2.44 m** |
| Construction, R < 1.50 m | requires **radial / bullnose special-shape brick**; sagitta reaches 0.008 m at R = 0.61 m and a chorded curve reads faceted |
| Radius diminishes with height | on stepped Deco towers R drops **0.15–0.45 m per setback**; on a straight shaft R is constant |
| Fenestration | ribbon window wrapping the curve (0.42) — 3–7 lights, each light 0.46–0.76 m, mullion 0.05 m; corner casement pair (0.24); glass block (0.16) — block **0.194 × 0.194 × 0.098 m**, joint 0.010 m, in a panel 0.78–1.94 m wide; blank (0.18) |
| Parapet / coping | follows the radius exactly; coping stones cut to the arc in 0.61–0.91 m segments |
| Spandrel banding | horizontal bands (brick, stone, or metal) 0.15–0.46 m tall wrapping the curve are the Moderne signature — 2–5 bands per story |
| Corner column behind the curve at the ground floor | steel pipe 0.15–0.25 m dia, or none if the curve is structural masonry |

### 2c. Corner entrance
| Property | Value |
|---|---|
| Door on the chamfer face — probability given a chamfer | **0.46** (commercial) / **0.18** (residential) |
| Single leaf | 0.91 – 1.07 m wide × 2.13 – 2.44 m tall |
| Double leaf | 1.68 – 1.98 m total |
| **Recessed vestibule depth** | **1.00 – 2.00 m**; mode 1.37 m. Width 1.52 – 2.44 m. Reveal walls splayed 0–15° |
| Angled/diagonal storefront entry cut into a *square* corner (the bodega/bar classic) | recess depth **0.61 – 1.52 m**, entry face at 45°, width 1.22 – 2.13 m |
| Steps | 0 – 3 risers at **0.15 m (6 in)** each; 60% of commercial corner doors are at grade + 1 riser |
| Transom over the door | 0.45 – 0.90 m tall |
| **Corner column at the apex** | cast iron **0.20 – 0.36 m dia** (0.44), steel pipe 0.15 – 0.25 m (0.28), masonry pier 0.40 – 0.60 m square (0.28); free-standing so the glazing wraps behind it |
| Vestibule floor | hex tile 0.025 m across, or terrazzo with a brass strip; step nosing steel angle 0.05 m |
| Residential corner entrance (prewar apartment) | on the chamfer with a canopy **1.83 – 3.05 m** projection, 2.44–3.05 m wide, clear height 2.90–3.35 m, on 2 steel rods at 35–45° |
| ADA ramp retrofit | 1.22 m wide, 1:12, run 1.8–3.7 m, steel or concrete, pipe rail 0.86 + 1.07 m |

### 2d. Corner tower / turret / dome
| Property | Value |
|---|---|
| Plan form | circular (0.46), octagonal (0.28), square (0.14), semi-hexagonal / 5-sided (0.12) |
| **Diameter / across flats** | **3.05 – 5.49 m**; mode **3.66 m (12 ft)** |
| Projection beyond the facade plane | **0.61 – 1.52 m** |
| Starts at | grade (0.34); corbelled out at the 2nd or 3rd floor on a 3–7 course corbel or a stone bracket 0.30–0.61 m deep (0.66) |
| Drum height above the main roofline | **1.22 – 3.05 m** |
| Roof height | **2.44 – 6.10 m** |
| **Total above main roofline** | **3.05 – 9.14 m (10 – 30 ft)** |
| Roof form weights | **conical** 0.42 (pitch **55 – 70°**, slate), pyramidal 4–8 sided 0.18 (45 – 60°), **ogee / bell** 0.16 (height = 0.8–1.2 × dia, S-curve with the inflection at 0.45 × height), onion 0.06, flat/deck with metal cresting 0.12, dome/hemisphere 0.06 |
| Finial | **0.91 – 2.44 m** tall, 0.10–0.20 m dia at the base, ball-and-spike |
| Cresting (flat-top variant) | 0.30 – 0.61 m tall, pierced pressed metal, pitch 0.15 m |
| Roof material | slate `#4a4f52` in 0.20 × 0.36 m courses (0.44); standing-seam copper, seam pitch 0.46 m (0.28); pressed metal shingle 0.20 × 0.25 m (0.20); tile (0.08) |
| Windows in the turret | 1 per plan face per story: 0.61–0.91 m wide × 1.37–1.83 m tall; curved-glass sash on circular turrets (rare, 0.10) |
| Cornice / eave at the turret | wraps the full circle; bracket pitch 0.46–0.76 m (tighter than the facade's) |
| Real reference | **Renaissance Apartments**, Hancock St × Nostrand Ave, Brooklyn, 1892 — 5-story French Renaissance flats with **circular corner towers and slate conical roofs** |

### 2e. Projecting corner bay / oriel
Square or canted (3-sided) bay stacked at the corner, on both facades or only one. Width **1.83 – 3.05 m**, projection **0.46 – 0.91 m**, running stories 2 → n−1 or 2 → cornice; supported on a corbel/bracket course 0.30–0.61 m deep at the 2nd floor; capped by a shallow pediment or by the cornice. Bay windows: 3 lights (canted) at 0.46 / 0.91 / 0.46 m, or 2 lights (square).

---

## 3. WRAPAROUND CORNICE, BELT COURSES & RETURN DEPTH

| Element | Behaviour at the corner | Numbers |
|---|---|---|
| **Main cornice — full return** | continues the entire length of the secondary facade at full profile | probability **0.55** |
| **Main cornice — partial return** | continues past the corner then **stops at a vertical break**, leaving plain brick beyond | probability **0.45**; return depth **1.52 – 6.10 m**, i.e. **1 – 2 bays** (mode 1 bay ≈ 3.05 m). The stop is a clean vertical cut, sometimes finished with a corbelled end block 0.20–0.40 m wide |
| Cornice **profile reduction** on the secondary facade | projection drops **20 – 40%**; bracket pitch increases **10 – 30%**; bracket depth drops 15–30% | probability 0.34 (when the cornice does return full length) |
| Belt / string courses | continue **100%** of the secondary facade — they are cheap. Never stop a belt course at the corner. | 1.00 |
| Water table / base course | continues 100% | 1.00 |
| Window lintel course used as a belt | continues at 0.86 probability |  |
| Stone quoins at the corner | 0.30 – 0.46 m tall blocks alternating 0.30 / 0.46 m long, projecting **0.019 – 0.038 m**, running full height | probability 0.22 |
| Cornice miter at a **square** corner | single 45° miter; the return end of the cornice on the secondary facade is fully modeled (many CG buildings leave it open) | 1.00 |
| Cornice miter at a **chamfer** | **three segments, two 22.5° miters** | 1.00 |
| Cornice at a **rounded** corner | swept along the radius; bracket spacing measured along the arc, so the outermost brackets fan out 2–5° | 1.00 |
| Parapet height change at the corner | none within the first 3.05 m; steps down 0.30–0.61 m at the far end of the secondary facade | 0.40 |

---

## 4. ASYMMETRY: AVENUE FACADE vs SIDE-STREET FACADE

This is the rule that makes a corner building read as real. The **avenue (primary) facade is short and ornate; the side-street (secondary) facade is long and plain.**

### Bay counts (primary / secondary)
| Host typology | Avenue bays | Side-street bays | Real pairs |
|---|---|---|---|
| Rowhouse corner | 3 | 5 – 7 | |
| Old-law tenement corner | 3 – 4 | 5 – 8 | |
| New-law tenement corner | 4 – 6 | 6 – 10 | |
| Prewar apartment corner | 4 – 7 | 7 – 12 | |
| **Loft / warehouse corner** | 4 – 7 | 8 – 28 | DUMBO measured pairs: **6/8, 4/5, 6/12, 2/6, 5/9, 7/3, 10/12, 7/7, 28/12** |

Note the DUMBO **7/3** pair: occasionally the *avenue* face is the long one (when the lot's depth runs along the avenue). Give this a **0.15** probability so not every corner is stereotyped.

### Ornament attenuation (secondary facade multipliers vs primary)
| Property | Multiplier |
|---|---|
| Ornament density (brackets, keystones, pediments, panels per m²) | **0.40 – 0.70** |
| Cornice projection | 0.60 – 1.00 |
| Window enframement richness | plain brick or flat-arch lintels where the avenue has stone lintels + keystones; probability of downgrade **0.62** |
| Stone content (limestone/brownstone area fraction) | **0.20 – 0.55** |
| Belt courses | 1.00 (unchanged) |
| Sill material | stone on the avenue → brick rowlock or plain concrete on the side street, probability 0.44 |
| Brick quality | side street uses **common brick**: hue **4–10° redder**, roughness +0.05, per-brick value jitter ±16% (vs ±10% on face brick). Historic practice through the 1890s: high-quality brick on the front, low-quality on the rest |
| Bond | avenue running bond; side street **common bond with a header course every 6th or 7th course** (probability 0.55) |
| Window sizes | identical to the avenue (do NOT shrink them) — only the trim changes |
| Storefronts | avenue 100% of the frontage; side street **1 – 2 bays** of store then the residential entrance and plain wall |
| Residential entrance location | **side street 0.70**, avenue 0.18, chamfer 0.12 — keeping the avenue frontage for retail is the economic rule |
| Rear/interior lot-line wall | plain common brick, irregular bays, stucco/parge patches, painted |

---

## 5. THE CORNER STOREFRONT

| Element | Value |
|---|---|
| Storefront wraps the corner | probability **0.82** on avenue corners, 0.36 on side-street-only corners |
| Wraparound extent | full avenue frontage (7.62 – 15.24 m) + **1.52 – 6.10 m** onto the side street |
| Glass panel | **1.22 – 1.83 m wide × 2.13 – 2.74 m tall**; mullion face 0.05 – 0.10 m |
| Bulkhead | **0.30 – 0.76 m** tall; mode 0.46 m. Marble/granite (0.22), painted metal (0.34), tile (0.18), wood (0.26) |
| **Corner column** | cast iron **0.20 – 0.35 m dia** (pre-1930), steel pipe 0.15 – 0.25 m (post-1930), masonry pier 0.40 – 0.60 m; free-standing, glazing returns behind it on both faces |
| Transom band | **0.45 – 0.90 m** tall; covered by a sign panel with probability **0.86** post-1960 |
| Sign band / fascia | **0.60 – 1.20 m** tall, wrapping continuously around the corner; internally-lit box (0.44), flat panel (0.30), pressed-metal cornice (0.26) |
| Storefront cornice / lintel above | 0.15 – 0.46 m tall, projecting 0.08 – 0.30 m |
| Roll-down gate | slat pitch **0.057 m**, coil box **0.35 × 0.35 m** at the head, guides 0.076 m; covers 60–100% of the storefront width |
| Cellar hatch in the sidewalk | 1.22 × 1.52 m steel diamond plate, or 2 leaves 0.61 × 1.52 m |
| Corner door step | 1 riser at 0.15 m, 1.22 × 0.46 m landing |
| **Bodega dressing** | produce racks 0.61–0.91 m deep × 0.91 m tall along the storefront under the awning; milk-crate stacks 0.40 × 0.40 × 0.28 m in stacks of 3–6; ice chest 1.22 × 0.66 × 0.91 m; newspaper rack 0.61 × 0.30 × 1.07 m; ATM decal 0.30 × 0.46 m; lotto / beer / deli neon **0.30 – 0.90 m** tall in 2–5 units in the window; window flyers covering 15–40% of the glass |
| **Corner bar / tavern dressing** | door on the chamfer; 1–2 windows per facade, each 1.07–1.52 m wide with a 0.91 m tall painted or leaded lower panel; dark painted wood surround `#2a2018`; neon script sign 0.45–1.20 m tall; a single blade sign; no roll-down gate |
| Awning over the storefront | see §8 |

---

## 6. THE BLIND PARTY WALL (highest-value element)

When the corner building is taller and/or deeper than its mid-block neighbour, a large blank wall is exposed. **This is what makes a NYC corner read as NYC.** Build it as a full geometry+texture element, not an afterthought.

### When it happens
| Condition | Exposed wall height (self − neighbour) | Probability of some exposure |
|---|---|---|
| New-law corner tenement (6 st) beside old-law (5 st) | 1 story = **2.90 – 3.35 m** | 0.85 |
| Prewar corner apartment (6–8 st) beside rowhouses (3–4 st) | 3–4 stories = **9.0 – 13.5 m** | 0.95 |
| Corner loft (6–8 st) beside a 2-story taxpayer | 4–6 stories = **15.0 – 24.0 m** | 0.90 |
| Corner building beside a vacant lot / parking lot | **full height** | 0.18 |
| Deeper-than-neighbour exposure on the side lot line | 3.0 – 9.0 m of extra depth, exposed as a vertical strip of the rear-half wall | 0.60 |
| Corner building shorter than its neighbour (its own wall is the covered one) | — | 0.15 |

### Wall itself
| Property | Value |
|---|---|
| Thickness at the exposed level | **0.20 – 0.41 m (8 – 16 in)** — reads thin at the parapet; the parapet coping is often only 0.23 m wide |
| Bond | **common / American bond, header course every 6th or 7th course**, probability 0.72; running bond 0.28 |
| Brick quality | soft salmon/orange common brick `#c07a5e` `#b8734f` (never face brick); per-brick value jitter **±16%**, hue ±6° |
| Parapet on the party wall | **0.30 – 0.90 m** above the roof deck, stepping down toward the rear in 1–3 steps of 0.30–0.61 m |
| Surface finish weights | painted **0.45**, bare brick **0.35**, stuccoed / parged **0.20** |
| Party-wall paint colours | `#e6e2d7` white, `#8d8f8f` grey, `#7c3d31` red oxide, `#c3ae8c` tan, `#b9b9b4` aluminium paint, `#4a5a62` slate blue |
| Parge / cement coating | applied as an irregular band, typically the **upper 40–100%**, colour `#b8b4a8` `#a9a49a`, thickness 0.010–0.020 m with a visible 0.015 m step edge where it stops; 8–25% cracked/spalled off revealing brick |

### Fenestration on the party wall
| Case | Probability | Numbers |
|---|---|---|
| Zero windows | **0.45** | |
| 1 – 3 small "lot-line" windows per floor | **0.40** | **0.61 × 0.91 m (24 × 36 in)**; steel frame, **wire glass**; placed **0.61 – 1.22 m in from the front facade edge** and again in the rear third; never in the middle third |
| Full window rows (wall was never expected to be covered) | 0.15 | standard openings, but with brick sills and no ornament |
| **Bricked-up openings** | 0.50 of all party-wall openings | infill brick offset **8 – 20% in value** and **5 – 12° in hue**; a visible 0.010–0.020 m recess or projection at the perimeter; the original arch/lintel still readable |
| Cinderblock infill | 0.20 of infills | block **0.397 × 0.194 m**, `#a5a29a`, set back 0.06 m |
| A/C sleeve punched through | 0.66 × 0.41 m, 1 – 6 per wall | |

### ROOFLINE SCARS — quantify these precisely
| Scar element | Numbers |
|---|---|
| **Former roof line (the primary scar)** | horizontal **tar / asphalt band**, thickness **0.10 – 0.30 m** (mode 0.15 m), colour `#2a2724` → `#3d3a34`, opacity **0.50 – 0.85**, hard top edge and a ragged/dripped bottom edge with 0.02–0.12 m tongues every 0.3–1.0 m |
| Roof pitch in the scar | flat roofs pitch 2% toward the rear ⇒ the band **drops 0.15 m over a 7.62 m depth** (0.30 m over 15.24 m). Never draw it dead level. |
| Pitched-roof scar (pre-1880 neighbour) | gable at **30 – 45°**, apex **1.52 – 3.05 m** above the eave line; on a 7.62 m wide neighbour a 35° gable apexes 2.67 m above the eave |
| Mansard scar | 2-slope: lower 65–75°, upper 20–30°, break at 1.83–2.44 m above the eave |
| Stepped scar (neighbour had a rear extension) | 1 – 2 steps of **0.61 – 1.22 m** vertical, at 4.6–9.1 m from the street |
| **Floor-line scars (secondary bands)** | count = neighbour's story count, **2 – 5 parallel bands**. Spacing: tenement **2.90 – 3.35 m**; rowhouse **3.20 – 3.66 m**; loft **3.66 – 4.27 m**; postwar 2.44 – 2.74 m. Band thickness 0.05 – 0.15 m, opacity 0.20 – 0.45 |
| **Joist pockets** | rectangular holes or filled patches **0.10 × 0.20 m** (or 0.08 × 0.24 m), spaced **0.41 m (16 in) o.c.** horizontally, in a row at each former floor line. **60 – 90% filled** with mismatched brick/mortar; the unfilled ones read as 0.10–0.15 m deep black voids |
| Girder / beam pocket | 0.20 × 0.30 m, 1 – 3 per floor line at 3.0–4.6 m spacing, deeper (0.20 m) |
| Flashing reglet | a horizontal saw-cut slot **0.015 – 0.025 m** tall, 0.02–0.04 m deep, mortar-filled, running 0.05–0.15 m above the tar band |
| **"Protected" zone below the scar** | the area formerly covered by the neighbour is **cleaner and lighter**: value multiplier **1.10 – 1.25**, soot reduced 60–80%, efflorescence reduced, sharper mortar joints. The boundary at the scar line is **hard, not blended** (transition width ≤ 0.05 m). This contrast is the single most convincing part of the effect. |
| Modern waterproofing band applied after exposure | 1.00 – 2.00 m tall band immediately above the scar, elastomeric coating `#b8b4a8`, sprayed edge feathering 0.05–0.15 m |
| Stair-profile scar (interior stair against the party wall) | a diagonal line at **32 – 38°** with 0.20–0.28 m steps, running between two floor-line bands; probability 0.22 |
| Chimney-breast scar | a **vertical** lighter/darker rectangle 0.61–1.22 m wide running from grade to the roof line, offset in value by 8–18%; probability 0.35 |
| Steel tie-back plates / walers (installed at exposure) | plates **0.20 × 0.20 m** on a **2.44 × 3.05 m grid**, or horizontal channels 0.15 m deep at each floor line; probability 0.30 on recently exposed walls |
| Weep / drip staining below the coping | vertical streaks 0.5–2.5 m long, opacity 0.20–0.40, spaced 0.6–1.5 m |

### CHIMNEY STACKS ON THE PARTY WALL
| Property | Value |
|---|---|
| Flue stack as a pilaster on the wall face | **0.40 – 0.90 m wide × 0.30 – 0.60 m deep**, projecting **0.05 – 0.15 m** from the wall plane, running full height; **1 – 4 per party wall**, spaced **3.05 – 9.14 m** |
| Chimney above the roof | **0.91 – 2.44 m** tall; corbelled cap **2 – 4 courses** projecting 0.032–0.064 m per course |
| Terracotta flue pots | dia **0.20 – 0.30 m**, height **0.20 – 0.61 m**, **1 – 6 per chimney**, colour `#a8613c` `#b87550` |
| Metal flue caps / vents | 0.10 – 0.20 m dia, 0.30 – 0.61 m tall, galvanised, some with spinning cowls |
| Leaning / out-of-plumb | 0.5 – 2.0° lean, probability 0.30 |
| Rebuilt top (mismatched brick) | top 0.30–0.91 m in different brick + grey portland mortar, probability 0.44 |

### GHOST SIGNS & MURALS ON THE PARTY WALL
| Property | Value |
|---|---|
| Probability of a ghost sign on an exposed party wall | **0.42** (this is the best-preserved location in the city) |
| Sign field size | **6.10 – 25.0 m wide × 6.10 – 20.0 m tall** |
| Cap height | 0.61 – 1.22 m body copy; hero word 1.52 – 2.44 m |
| Placement | occupies the **upper 40–70%** of the exposed wall, top edge 1.0–3.0 m below the coping; bottom edge stops at the old scar line (the sign was painted after the neighbour was already low) |
| Opacity | south/west-facing **0.10 – 0.25**; north/east-facing **0.35 – 0.60**; freshly exposed 0.55 – 0.80 |
| Palimpsest | 1 – 3 overlaid generations at 0.08 – 0.18 opacity, rotated ±2°, offset 0.3 – 1.5 m |
| Paint colours | `#eae4d6` lead white, `#23201d` black, `#8c3a2b` red oxide, `#2b3a5c` blue, `#b8883a` ochre, `#5c6b4a` green. White and black survive at ~1.4× the opacity of red and blue |
| Modern advertising mural (sharp, saturated) | 6.0 – 20.0 m wide × 6.0 – 15.0 m tall, opacity 1.0, probability 0.14; often with a 0.15 m black border and a QR/handle block |
| Painted address / "NO PARKING" / arrow legends | cap height 0.30 – 0.61 m, near grade, probability 0.35 |

### GRAFFITI & GROUND CONDITION AT THE PARTY WALL
| Property | Value |
|---|---|
| Reachable graffiti band | 0 → **3.00 m** above grade; coverage **25 – 60%** (party walls attract far more than street facades) |
| Full-height pieces (where roof or scaffold access exists) | 2.0 – 6.0 m tall × 3.0 – 12.0 m wide, probability 0.30 |
| Buff-over patches | 0.60 – 2.40 m rectangles, value offset 8 – 20%, 4 – 10 per wall |
| Adjacent lot condition (if vacant) | chain-link fence **1.83 – 2.44 m** tall with green privacy scrim (opacity 0.7), posts at 3.05 m; ailanthus/buddleia 1.0 – 4.0 m tall, 2 – 8 plants; rubble/gravel; a shipping container or 2–6 parked cars; asphalt patchwork |
| Weeds at the wall base | 0.10 – 0.50 m tall, along 40 – 80% of the base |
| Standpipe / sprinkler riser on the party wall | 0.10 – 0.15 m dia, painted red, full height, probability 0.30 |
| Cable / conduit runs | 0.019 – 0.05 m dia, 2 – 8 runs, horizontal at 3.0 m and vertical at the corner |

---

## 7. FIRE ESCAPE PLACEMENT ON CORNER BUILDINGS

| Rule | Value |
|---|---|
| Location weights | **side-street facade 0.72**, rear/interior lot line 0.20, avenue facade 0.06, chamfer **0.00** |
| Position along the side street | **1 – 2 bays in from the corner** (0.72), mid-facade (0.20), far end (0.08). Never in the bay adjacent to the corner cut |
| Count | 1 stack per **9.1 – 15.2 m** of facade; a 25.9–30.5 m side street facade gets **2 stacks** |
| Balcony depth / length | tenement **0.914 m** clear width × 1.83–2.44 m long (MDL §53); party-wall balcony may be 0.61 m; industrial 0.91–1.22 m × 2.44–4.88 m |
| Stair pitch | ≤ **60°** |
| Tread / riser | 0.152 m wide × 0.508 m long; riser ≤ 0.229 m |
| Drop ladder | 0.381 m wide; lowest balcony ≤ **4.88 m** above grade |
| Gooseneck to roof | required from the top balcony; 0.457 m wide, projecting 0.30 m over the parapet |
| Access window | ≥ 0.61 m clear width × 0.762 m clear height, sill within 0.914 m of the floor |
| Why it matters visually | the avenue facade stays clean and the side street gets the black iron zig-zag — reversing this is an instant tell |

---

## 8. CORNER-SPECIFIC SIGNAGE

| Element | Value |
|---|---|
| **Projecting blade sign** | face **0.60 – 1.20 m tall × 0.45 – 1.20 m out**; thickness 0.10 – 0.25 m; mounted **3.05 – 4.57 m** above the sidewalk; 1 – 2 steel arms or a top bracket |
| Blade sign legal projection (ZR 32-652) | **0.305 m (12 in)** across the street line for a flat sign; **0.457 m (18 in)** for a double- or multi-faceted sign. Legacy / non-conforming signs project **0.60 – 1.20 m** — use those on pre-1961 buildings |
| Blade sign max height above curb (ZR 32-655) | **7.62 m (25 ft)** in C1, C2, C3, C5-1/-2/-3/-5; **12.19 m (40 ft)** in C4, C5-4, most C6, C7; unrestricted in C6-5 and C6-7 |
| **Vertical blade on the chamfer bisector** (hotel/bar/theatre) | **1.83 – 6.10 m tall × 0.61 – 1.22 m wide**, projecting 0.61 – 1.22 m, mounted on the 45° bisector so it reads from both streets; probability 0.16 on chamfered commercial corners |
| **Corner-wrapping awning** | projection **1.22 – 2.13 m**, clear height **2.29 – 2.74 m**, valance **0.20 – 0.30 m** with the address and phone; frame 0.032 m tube at 1.0–1.5 m rib spacing |
| Awning at the corner geometry | mitered as one continuous unit (0.38); split into 2 units with a **triangular gore over the chamfer** (0.42); 2 separate awnings with a 0.10–0.30 m gap (0.20) |
| Neon | script or block letters **0.45 – 1.20 m** tall; tube dia **0.012 – 0.018 m**; standoff from the backing 0.06 – 0.10 m; 2 – 5 words; colours `#ff3b30` red, `#2b7bff` blue, `#39ff88` green, `#ffd23b` amber |
| Painted wall sign on the side street | 1st–2nd story band, 1.22 – 3.05 m tall, cap height 0.30 – 0.91 m; probability 0.30 |
| Sign band wrapping the corner | 0.60 – 1.20 m tall, continuous around the chamfer/radius; the store name repeats on **both** frontages |
| Window lettering | gold-leaf or vinyl, cap height 0.08 – 0.20 m, on 2 – 6 lines |
| A-frame / sidewalk sign | 0.61 × 0.91 m, 1 per corner |
| Two street-name signs on one pole at 90° | blade 0.23 m tall × 0.61 – 1.22 m long, green `#006341`, white legend, mounted 2.74 – 3.35 m |
| House numbers | appear on **both** frontages (avenue number and side-street number), 0.10 – 0.20 m tall |

---

## 9. STREETSCAPE AT THE CORNER

| Element | Dimensions | Count / placement |
|---|---|---|
| **Curb return** | radius **3.05 – 6.10 m** (typ 4.57 m); granite curb reveal **0.15 m (6 in)**, curb stone 0.30–0.50 m wide, cut in 0.61–0.91 m arc segments | 1 per corner |
| **Pedestrian ramp** | width ≥ **1.22 m (48 in)**; running slope max **1:12 (8.33%)**; flare slope 1:10; landing 1.22 × 1.22 m | 1 (diagonal) or 2 (perpendicular, one per crosswalk); 2-ramp corners are the modern standard |
| Detectable warning pad | **0.61 m (24 in) deep**, full ramp width; truncated domes base dia **0.023 m**, top dia 0.014 m, height **0.005 m**, spacing **0.041 – 0.061 m** o.c.; colour `#9c3b26` brick red or `#3a3a3a` | on every ramp |
| Sidewalk flags | 1.52 × 1.52 m; at the return they are **cut radially into wedges** — 4–8 tapered flags around the arc | |
| Crosswalk markings | 2 lines 0.30 m wide, 3.05–4.88 m apart; or continental bars 0.61 m wide at 0.76 m gaps | |
| **Fire hydrant** | barrel dia 0.18 m, height above grade **0.71 – 0.79 m**; steamer outlet 0.114 m, 2 side outlets 0.064 m; set **0.30 – 0.61 m** behind the curb face, within **4.6 m** of the corner | 1 per 1–2 corners |
| Hydrant colours | body `#b8b2a6` silver, `#c0392b` red, or `#d9d5cc` white; bonnet often a contrasting `#d9a520` / `#2b7bff` | |
| **USPS collection box** | **0.46 w × 0.66 d × 1.27 m tall** (incl. legs), blue `#0b3b8c`; snorkel variant adds a 0.61 m angled chute | 0.35 probability per corner |
| **Litter basket** (DSNY wire mesh) | 0.56 m dia × 0.81 m tall, green `#1f4a2c`, 0.006 m wire at 0.05 m mesh | 1 – 2 per corner |
| **Traffic signal** | pole 6.10 – 9.14 m tall, octagonal tapered, 0.20 → 0.13 m dia; **mast arm 4.88 – 13.72 m**; 3-section head **1.07 m tall × 0.34 m wide** with 0.30 m lenses; pedestrian head 0.46 × 0.43 m; controller cabinet 0.61 × 0.41 × 1.22 m at the base | 1 – 4 per intersection |
| **Street light** | NYC octagonal tapered pole, mounting height **9.14 m** on avenues / 7.62 m on side streets; mast arm 2.44 – 4.57 m; cobra-head luminaire 0.76 m long; colour `#6e7377` | 1 per corner |
| **Subway entrance** (avenue corners) | stair opening **1.83 – 3.05 m wide × 4.88 – 7.32 m long**; handrail **1.07 m**; NYC standard steel railing, posts 0.05 m at 1.5 m; **globe lamp 0.35 m dia** on a 3.05 m post (green = always open, red = restricted); station name plaque 0.30 × 1.22 m; adjacent sidewalk vent grating 1.52 × 3.05 m | 0.12 probability per corner |
| Manhole / vault covers | 0.66 m dia cast iron; 2 – 6 per corner; Con Ed square vault 0.91 × 0.91 m | |
| Tree pit | 1.52 × 1.52 m, soil 0.05 m below the flag, steel guard 0.61 m tall; tree caliper 0.15 – 0.45 m | 0.45 probability |
| Bus stop (avenue) | shelter 1.52 × 4.00 m, 2.44 m tall, glass + steel; pole-mounted sign 0.30 × 0.61 m at 2.90 m | 0.20 |
| Citi Bike dock | 1.22 m deep × 6.0 – 18.0 m long, 0.91 m tall | 0.10 |
| Bike rack (hoop) | 0.61 m tall × 0.76 m wide, 2 – 6 per corner | 0.40 |
| **Sidewalk shed / scaffold** | deck clear height 2.44 – 3.05 m, posts at 2.44 m o.c., plywood fascia 0.30 m tall painted `#1b5e3a` hunter green, lights every 4.57 m, netting on the vertical face | **0.12** probability — a genuinely common NYC corner condition |
| Bollards / planters at the corner | 0.22 m dia × 0.90 m, or concrete planter 0.91 × 0.91 × 0.61 m | 0.15 |
| Parking / regulation signs | 0.30 × 0.61 m blades, 2 – 5 on a single 2.74 m post | 1 post per corner |
| Belgian block (DUMBO / industrial corners) | block 0.20–0.30 × 0.10–0.13 × 0.13–0.20 m, laid in arcs; the arcs bend around the curb return | |
| Wheelchair-ramp patch concrete | 8–20% lighter than the surrounding flags, hard-edged rectangle | |

---

## PARAMETERS

```json
{
  "modifier": "corner_condition",
  "applies_to": ["rowhouse_brownstone", "tenement_old_law", "tenement_new_law", "loft_warehouse", "prewar_apartment", "mixed_use_taxpayer", "art_deco"],
  "lot": {
    "corner_reg_extent_from_street_line_m": 30.48,
    "corner_max_interior_angle_deg": 135,
    "primary_frontage_m": [7.62, 30.48],
    "secondary_frontage_m": [22.86, 30.48],
    "frontage_case_weights": {"single_25ft": 0.24, "widened_25_30ft": 0.31, "two_lot_40_50ft": 0.26, "three_four_lot_60_100ft": 0.14, "loft_corner": 0.05},
    "deep_dimension_on_secondary_probability": 0.85,
    "lot_coverage_corner": {"tenement_act_1901": 0.90, "R6A_R9A_contextual": 0.80, "R10A": 1.00, "R6_R7_non_contextual": 0.70, "R8_R10_non_contextual": 0.75, "multiple_dwelling_R1_R5": 1.00},
    "lot_coverage_interior": {"tenement_act_1901": 0.70, "R6A_R6B": 0.60, "R7A_R7B_R7D": 0.65, "R7X_R9A": 0.70, "R10A": 0.70, "non_contextual": 0.65},
    "rear_yard_required": false,
    "extra_depth_vs_midblock_m": [3.0, 9.0],
    "avenue_row_m": 30.48,
    "side_street_row_m": 18.29,
    "williamsburg_street_row_m": 18.29,
    "bedford_metropolitan_grand_row_m": [21.34, 24.38],
    "curb_return_radius_m": [3.05, 6.10],
    "curb_return_radius_mode_m": 4.57
  },
  "corner_cut": {
    "variant_weights_by_typology": {
      "rowhouse": {"square": 0.80, "chamfer": 0.08, "round": 0.02, "corner_bay": 0.08, "turret": 0.02},
      "tenement_old_law": {"square": 0.78, "chamfer": 0.14, "round": 0.02, "corner_bay": 0.04, "turret": 0.02},
      "tenement_new_law": {"square": 0.66, "chamfer": 0.22, "round": 0.04, "corner_bay": 0.04, "turret": 0.04},
      "loft_warehouse": {"square": 0.86, "chamfer": 0.08, "round": 0.06, "corner_bay": 0.00, "turret": 0.00},
      "prewar_apartment": {"square": 0.72, "chamfer": 0.16, "round": 0.08, "corner_bay": 0.00, "turret": 0.04},
      "art_deco_moderne": {"square": 0.44, "chamfer": 0.14, "round": 0.42, "corner_bay": 0.00, "turret": 0.00},
      "mixed_use_taxpayer": {"square": 0.68, "chamfer": 0.26, "round": 0.06, "corner_bay": 0.00, "turret": 0.00},
      "queen_anne_flats": {"square": 0.58, "chamfer": 0.14, "round": 0.04, "corner_bay": 0.10, "turret": 0.14}
    },
    "chamfer": {
      "face_w_m": [1.22, 2.44],
      "face_w_mode_m": 1.52,
      "setback_factor": 0.707,
      "angle_deg": 45.0,
      "acute_intersection_face_w_m": [2.44, 3.66],
      "full_height_probability": 0.62,
      "base_only_probability": 0.38,
      "base_only_stories": [1, 2],
      "corbel_back_courses": [3, 7],
      "corbel_back_per_course_m": [0.045, 0.10],
      "windows_per_floor_weights": {"1": 0.72, "0": 0.20, "2": 0.08},
      "window_w_m": [0.61, 0.91],
      "arris_weights": {"square": 0.52, "quoin": 0.24, "bullnose": 0.18, "engaged_pilaster": 0.06},
      "bullnose_radius_m": [0.05, 0.10],
      "top_treatment_weights": {"into_cornice": 0.55, "pediment": 0.25, "raised_parapet_panel": 0.20},
      "pediment_w_m": [1.22, 2.44],
      "pediment_rise_m": [0.30, 0.91],
      "cornice_miter_deg": 22.5,
      "brackets_on_chamfer": [1, 2],
      "footprint_loss_m2_formula": "W*W/4"
    },
    "round": {
      "radius_m": [1.52, 4.00],
      "radius_mode_deco_m": [1.83, 3.05],
      "radius_bullnose_m": [0.61, 1.22],
      "chord_facet_len_m": 0.213,
      "special_shape_brick_below_radius_m": 1.50,
      "radius_reduction_per_setback_m": [0.15, 0.45],
      "fenestration_weights": {"ribbon_window": 0.42, "corner_casement": 0.24, "glass_block": 0.16, "blank": 0.18},
      "ribbon_lights": [3, 7],
      "ribbon_light_w_m": [0.46, 0.76],
      "glass_block_m": [0.194, 0.194, 0.098],
      "glass_block_joint_m": 0.010,
      "spandrel_bands_per_story": [2, 5],
      "band_h_m": [0.15, 0.46],
      "coping_segment_m": [0.61, 0.91],
      "footprint_loss_m2_formula": "0.2146*R*R"
    },
    "entrance": {
      "on_chamfer_commercial_probability": 0.46,
      "on_chamfer_residential_probability": 0.18,
      "leaf_w_m": [0.91, 1.07],
      "double_leaf_w_m": [1.68, 1.98],
      "door_h_m": [2.13, 2.44],
      "vestibule_depth_m": [1.00, 2.00],
      "vestibule_depth_mode_m": 1.37,
      "vestibule_w_m": [1.52, 2.44],
      "splay_deg": [0, 15],
      "angled_entry_in_square_corner_depth_m": [0.61, 1.52],
      "risers": [0, 3],
      "riser_m": 0.15,
      "transom_h_m": [0.45, 0.90],
      "apex_column_weights": {"cast_iron": 0.44, "steel_pipe": 0.28, "masonry_pier": 0.28},
      "cast_iron_dia_m": [0.20, 0.36],
      "steel_pipe_dia_m": [0.15, 0.25],
      "masonry_pier_m": [0.40, 0.60],
      "canopy_projection_m": [1.83, 3.05],
      "canopy_w_m": [2.44, 3.05],
      "canopy_clear_h_m": [2.90, 3.35],
      "ada_ramp_w_m": 1.22,
      "ada_ramp_slope": 0.0833
    },
    "turret": {
      "plan_weights": {"circular": 0.46, "octagonal": 0.28, "square": 0.14, "semi_hex": 0.12},
      "dia_m": [3.05, 5.49],
      "dia_mode_m": 3.66,
      "projection_m": [0.61, 1.52],
      "start_weights": {"grade": 0.34, "corbelled_at_2nd_3rd": 0.66},
      "corbel_courses": [3, 7],
      "corbel_bracket_depth_m": [0.30, 0.61],
      "drum_above_roof_m": [1.22, 3.05],
      "roof_h_m": [2.44, 6.10],
      "total_above_roof_m": [3.05, 9.14],
      "roof_form_weights": {"conical": 0.42, "pyramidal": 0.18, "ogee_bell": 0.16, "flat_with_cresting": 0.12, "onion": 0.06, "dome": 0.06},
      "conical_pitch_deg": [55, 70],
      "pyramidal_pitch_deg": [45, 60],
      "ogee_height_over_dia": [0.8, 1.2],
      "ogee_inflection_fraction": 0.45,
      "finial_h_m": [0.91, 2.44],
      "cresting_h_m": [0.30, 0.61],
      "roof_material_weights": {"slate": 0.44, "standing_seam_copper": 0.28, "pressed_metal_shingle": 0.20, "tile": 0.08},
      "slate_course_m": [0.20, 0.36],
      "copper_seam_pitch_m": 0.46,
      "window_w_m": [0.61, 0.91],
      "window_h_m": [1.37, 1.83],
      "eave_bracket_pitch_m": [0.46, 0.76]
    },
    "corner_bay": {
      "w_m": [1.83, 3.05],
      "projection_m": [0.46, 0.91],
      "start_story": 2,
      "corbel_depth_m": [0.30, 0.61],
      "canted_light_w_m": [0.46, 0.91, 0.46]
    }
  },
  "wraparound": {
    "cornice_full_return_probability": 0.55,
    "cornice_partial_return_probability": 0.45,
    "partial_return_depth_m": [1.52, 6.10],
    "partial_return_bays": [1, 2],
    "return_end_block_w_m": [0.20, 0.40],
    "secondary_cornice_projection_factor": [0.60, 1.00],
    "secondary_bracket_pitch_factor": [1.10, 1.30],
    "secondary_bracket_depth_factor": [0.70, 0.85],
    "belt_course_continues_probability": 1.00,
    "water_table_continues_probability": 1.00,
    "lintel_belt_continues_probability": 0.86,
    "quoin_probability": 0.22,
    "quoin_block_h_m": [0.30, 0.46],
    "quoin_projection_m": [0.019, 0.038],
    "square_corner_miter_deg": 45,
    "chamfer_miter_deg": 22.5,
    "parapet_step_at_far_end_probability": 0.40,
    "parapet_step_m": [0.30, 0.61]
  },
  "asymmetry": {
    "bays_primary": {"rowhouse": [3, 3], "tenement_old_law": [3, 4], "tenement_new_law": [4, 6], "prewar_apartment": [4, 7], "loft_warehouse": [4, 7]},
    "bays_secondary": {"rowhouse": [5, 7], "tenement_old_law": [5, 8], "tenement_new_law": [6, 10], "prewar_apartment": [7, 12], "loft_warehouse": [8, 28]},
    "documented_loft_pairs": [[6, 8], [4, 5], [6, 12], [2, 6], [5, 9], [7, 3], [10, 12], [7, 7], [28, 12]],
    "reversed_long_avenue_probability": 0.15,
    "ornament_density_factor": [0.40, 0.70],
    "stone_area_fraction_factor": [0.20, 0.55],
    "window_enframement_downgrade_probability": 0.62,
    "sill_material_downgrade_probability": 0.44,
    "secondary_brick_hue_shift_deg": [4, 10],
    "secondary_brick_value_jitter": 0.16,
    "secondary_common_bond_probability": 0.55,
    "header_course_every": [6, 7],
    "window_size_change": 0.0,
    "storefront_on_secondary_bays": [1, 2],
    "residential_entrance_location_weights": {"side_street": 0.70, "avenue": 0.18, "chamfer": 0.12}
  },
  "corner_storefront": {
    "wraps_probability_avenue": 0.82,
    "wraps_probability_side_street": 0.36,
    "wrap_onto_secondary_m": [1.52, 6.10],
    "glass_panel_w_m": [1.22, 1.83],
    "glass_panel_h_m": [2.13, 2.74],
    "mullion_face_m": [0.05, 0.10],
    "bulkhead_h_m": [0.30, 0.76],
    "bulkhead_h_mode_m": 0.46,
    "bulkhead_material_weights": {"painted_metal": 0.34, "wood": 0.26, "marble_granite": 0.22, "tile": 0.18},
    "corner_column_weights": {"cast_iron": 0.44, "steel_pipe": 0.28, "masonry_pier": 0.28},
    "corner_column_dia_m": [0.20, 0.35],
    "transom_h_m": [0.45, 0.90],
    "transom_covered_probability": 0.86,
    "sign_band_h_m": [0.60, 1.20],
    "sign_band_weights": {"internally_lit_box": 0.44, "flat_panel": 0.30, "pressed_metal_cornice": 0.26},
    "storefront_cornice_h_m": [0.15, 0.46],
    "storefront_cornice_projection_m": [0.08, 0.30],
    "rolldown_slat_pitch_m": 0.057,
    "rolldown_coil_box_m": [0.35, 0.35],
    "rolldown_coverage_fraction": [0.60, 1.00],
    "cellar_hatch_m": [1.22, 1.52],
    "bodega_probability": 0.34,
    "produce_rack_depth_m": [0.61, 0.91],
    "produce_rack_h_m": 0.91,
    "crate_m": [0.40, 0.40, 0.28],
    "crate_stack": [3, 6],
    "neon_units": [2, 5],
    "neon_h_m": [0.30, 0.90],
    "window_flyer_coverage": [0.15, 0.40],
    "corner_bar_probability": 0.14
  },
  "party_wall": {
    "exposure_probability_by_case": {"new_law_beside_old_law": 0.85, "prewar_beside_rowhouse": 0.95, "loft_beside_taxpayer": 0.90, "beside_vacant_lot": 0.18, "depth_only_exposure": 0.60, "self_is_shorter": 0.15},
    "exposed_h_m": {"one_story": [2.90, 3.35], "three_four_story": [9.0, 13.5], "four_six_story": [15.0, 24.0]},
    "thickness_m": [0.20, 0.41],
    "bond_weights": {"common_header_6_or_7": 0.72, "running": 0.28},
    "brick_value_jitter": 0.16,
    "brick_hue_jitter_deg": 6,
    "parapet_h_m": [0.30, 0.90],
    "parapet_steps": [1, 3],
    "parapet_step_m": [0.30, 0.61],
    "finish_weights": {"painted": 0.45, "bare_brick": 0.35, "stucco_parge": 0.20},
    "parge_band_fraction": [0.40, 1.00],
    "parge_thickness_m": [0.010, 0.020],
    "parge_spalled_fraction": [0.08, 0.25],
    "fenestration_weights": {"none": 0.45, "few_small": 0.40, "full_rows": 0.15},
    "lot_line_window_m": [0.61, 0.91],
    "lot_line_window_inset_from_front_m": [0.61, 1.22],
    "bricked_up_fraction": 0.50,
    "infill_value_offset": [0.08, 0.20],
    "infill_hue_offset_deg": [5, 12],
    "infill_recess_m": [0.010, 0.020],
    "cinderblock_infill_fraction": 0.20,
    "cinderblock_m": [0.397, 0.194],
    "ac_sleeve_m": [0.66, 0.41],
    "ac_sleeve_count": [1, 6]
  },
  "roofline_scars": {
    "tar_band_thickness_m": [0.10, 0.30],
    "tar_band_thickness_mode_m": 0.15,
    "tar_band_opacity": [0.50, 0.85],
    "tar_drip_len_m": [0.02, 0.12],
    "tar_drip_spacing_m": [0.3, 1.0],
    "flat_roof_pitch_pct": 2.0,
    "band_drop_per_7p62m_depth_m": 0.15,
    "gable_scar_pitch_deg": [30, 45],
    "gable_apex_above_eave_m": [1.52, 3.05],
    "mansard_lower_deg": [65, 75],
    "mansard_upper_deg": [20, 30],
    "mansard_break_h_m": [1.83, 2.44],
    "step_scar_count": [1, 2],
    "step_scar_h_m": [0.61, 1.22],
    "step_scar_from_street_m": [4.57, 9.14],
    "floor_scar_count": [2, 5],
    "floor_scar_spacing_m": {"tenement": [2.90, 3.35], "rowhouse": [3.20, 3.66], "loft": [3.66, 4.27], "postwar": [2.44, 2.74]},
    "floor_scar_thickness_m": [0.05, 0.15],
    "floor_scar_opacity": [0.20, 0.45],
    "joist_pocket_m": [0.10, 0.20],
    "joist_pocket_spacing_m": 0.41,
    "joist_pocket_filled_fraction": [0.60, 0.90],
    "joist_pocket_void_depth_m": [0.10, 0.15],
    "girder_pocket_m": [0.20, 0.30],
    "girder_pocket_per_floor": [1, 3],
    "girder_pocket_spacing_m": [3.0, 4.6],
    "reglet_h_m": [0.015, 0.025],
    "reglet_depth_m": [0.02, 0.04],
    "reglet_above_tar_band_m": [0.05, 0.15],
    "protected_zone_value_multiplier": [1.10, 1.25],
    "protected_zone_soot_reduction": [0.60, 0.80],
    "scar_transition_width_m": 0.05,
    "waterproof_band_h_m": [1.00, 2.00],
    "stair_scar_probability": 0.22,
    "stair_scar_angle_deg": [32, 38],
    "stair_scar_step_m": [0.20, 0.28],
    "chimney_breast_scar_probability": 0.35,
    "chimney_breast_scar_w_m": [0.61, 1.22],
    "chimney_breast_value_offset": [0.08, 0.18],
    "tieback_plate_probability": 0.30,
    "tieback_plate_m": [0.20, 0.20],
    "tieback_grid_m": [2.44, 3.05],
    "coping_drip_streak_len_m": [0.5, 2.5],
    "coping_drip_opacity": [0.20, 0.40],
    "coping_drip_spacing_m": [0.6, 1.5]
  },
  "party_wall_chimneys": {
    "stack_count": [1, 4],
    "stack_w_m": [0.40, 0.90],
    "stack_d_m": [0.30, 0.60],
    "stack_projection_m": [0.05, 0.15],
    "stack_spacing_m": [3.05, 9.14],
    "above_roof_h_m": [0.91, 2.44],
    "cap_courses": [2, 4],
    "cap_step_m": [0.032, 0.064],
    "flue_pot_dia_m": [0.20, 0.30],
    "flue_pot_h_m": [0.20, 0.61],
    "flue_pot_count": [1, 6],
    "metal_vent_dia_m": [0.10, 0.20],
    "metal_vent_h_m": [0.30, 0.61],
    "lean_deg": [0.5, 2.0],
    "lean_probability": 0.30,
    "rebuilt_top_probability": 0.44,
    "rebuilt_top_h_m": [0.30, 0.91]
  },
  "party_wall_signage": {
    "ghost_sign_probability": 0.42,
    "field_w_m": [6.10, 25.0],
    "field_h_m": [6.10, 20.0],
    "cap_h_m": [0.61, 1.22],
    "hero_cap_h_m": [1.52, 2.44],
    "vertical_placement_fraction": [0.40, 0.70],
    "top_edge_below_coping_m": [1.0, 3.0],
    "opacity_south_west": [0.10, 0.25],
    "opacity_north_east": [0.35, 0.60],
    "opacity_recent_exposure": [0.55, 0.80],
    "palimpsest_layers": [1, 3],
    "palimpsest_opacity": [0.08, 0.18],
    "palimpsest_rotation_deg": [-2, 2],
    "modern_mural_probability": 0.14,
    "modern_mural_w_m": [6.0, 20.0],
    "modern_mural_h_m": [6.0, 15.0],
    "painted_legend_probability": 0.35,
    "painted_legend_cap_h_m": [0.30, 0.61]
  },
  "fire_escape": {
    "location_weights": {"side_street": 0.72, "rear_lot_line": 0.20, "avenue": 0.06, "chamfer": 0.00},
    "position_weights": {"one_two_bays_from_corner": 0.72, "mid_facade": 0.20, "far_end": 0.08},
    "stack_spacing_m": [9.14, 15.24],
    "balcony_clear_w_m": 0.914,
    "balcony_party_wall_w_m": 0.61,
    "balcony_len_m": [1.83, 2.44],
    "industrial_balcony_depth_m": [0.91, 1.22],
    "industrial_balcony_len_m": [2.44, 4.88],
    "stair_pitch_max_deg": 60,
    "tread_w_m": 0.152,
    "tread_len_m": 0.508,
    "riser_max_m": 0.229,
    "stair_opening_m": [0.533, 0.711],
    "drop_ladder_w_m": 0.381,
    "lowest_balcony_max_h_m": 4.88,
    "gooseneck_w_m": 0.457,
    "gooseneck_projection_m": 0.30,
    "access_window_min_m": [0.61, 0.762],
    "access_sill_max_above_floor_m": 0.914
  },
  "signage": {
    "blade_face_h_m": [0.60, 1.20],
    "blade_projection_m": [0.45, 1.20],
    "blade_thickness_m": [0.10, 0.25],
    "blade_mount_h_m": [3.05, 4.57],
    "zr_max_projection_flat_m": 0.305,
    "zr_max_projection_double_faced_m": 0.457,
    "zr_max_height_c1_c2_c3_m": 7.62,
    "zr_max_height_c4_c6_m": 12.19,
    "vertical_blade_probability": 0.16,
    "vertical_blade_h_m": [1.83, 6.10],
    "vertical_blade_w_m": [0.61, 1.22],
    "vertical_blade_projection_m": [0.61, 1.22],
    "awning_projection_m": [1.22, 2.13],
    "awning_clear_h_m": [2.29, 2.74],
    "awning_valance_h_m": [0.20, 0.30],
    "awning_rib_spacing_m": [1.0, 1.5],
    "awning_corner_weights": {"gore_split": 0.42, "single_mitered": 0.38, "two_separate": 0.20},
    "neon_cap_h_m": [0.45, 1.20],
    "neon_tube_dia_m": [0.012, 0.018],
    "neon_standoff_m": [0.06, 0.10],
    "painted_side_street_sign_probability": 0.30,
    "painted_band_h_m": [1.22, 3.05],
    "window_letter_cap_h_m": [0.08, 0.20],
    "street_name_sign_h_m": 0.23,
    "street_name_sign_len_m": [0.61, 1.22],
    "street_name_mount_h_m": [2.74, 3.35],
    "house_numbers_on_both_frontages": true
  },
  "streetscape": {
    "curb_reveal_m": 0.15,
    "curb_stone_w_m": [0.30, 0.50],
    "curb_arc_segment_m": [0.61, 0.91],
    "ramp_min_w_m": 1.22,
    "ramp_slope_max": 0.0833,
    "ramp_flare_slope": 0.10,
    "ramp_count_weights": {"2": 0.62, "1": 0.38},
    "warning_pad_depth_m": 0.61,
    "dome_base_dia_m": 0.023,
    "dome_top_dia_m": 0.014,
    "dome_h_m": 0.005,
    "dome_spacing_m": [0.041, 0.061],
    "sidewalk_flag_m": [1.52, 1.52],
    "radial_wedge_flags": [4, 8],
    "crosswalk_line_w_m": 0.30,
    "crosswalk_spacing_m": [3.05, 4.88],
    "hydrant_barrel_dia_m": 0.18,
    "hydrant_h_m": [0.71, 0.79],
    "hydrant_behind_curb_m": [0.30, 0.61],
    "hydrant_within_of_corner_m": 4.6,
    "hydrant_probability": 0.55,
    "mailbox_m": [0.46, 0.66, 1.27],
    "mailbox_probability": 0.35,
    "litter_basket_dia_m": 0.56,
    "litter_basket_h_m": 0.81,
    "litter_basket_count": [1, 2],
    "signal_pole_h_m": [6.10, 9.14],
    "mast_arm_len_m": [4.88, 13.72],
    "signal_head_h_m": 1.07,
    "signal_head_w_m": 0.34,
    "signal_lens_dia_m": 0.30,
    "ped_head_m": [0.46, 0.43],
    "controller_cabinet_m": [0.61, 0.41, 1.22],
    "signal_count": [1, 4],
    "street_light_h_avenue_m": 9.14,
    "street_light_h_side_m": 7.62,
    "street_light_arm_m": [2.44, 4.57],
    "luminaire_len_m": 0.76,
    "subway_probability": 0.12,
    "subway_stair_w_m": [1.83, 3.05],
    "subway_stair_len_m": [4.88, 7.32],
    "subway_rail_h_m": 1.07,
    "globe_dia_m": 0.35,
    "globe_post_h_m": 3.05,
    "vent_grating_m": [1.52, 3.05],
    "manhole_dia_m": 0.66,
    "manhole_count": [2, 6],
    "tree_pit_m": [1.52, 1.52],
    "tree_probability": 0.45,
    "bus_shelter_m": [1.52, 4.00, 2.44],
    "bus_shelter_probability": 0.20,
    "citibike_probability": 0.10,
    "citibike_len_m": [6.0, 18.0],
    "bike_hoop_probability": 0.40,
    "sidewalk_shed_probability": 0.12,
    "shed_clear_h_m": [2.44, 3.05],
    "shed_post_spacing_m": 2.44,
    "shed_fascia_h_m": 0.30,
    "shed_light_spacing_m": 4.57,
    "bollard_planter_probability": 0.15,
    "reg_sign_post_h_m": 2.74,
    "reg_signs_per_post": [2, 5]
  },
  "colors": {
    "party_wall_brick": ["#c07a5e", "#b8734f", "#a8664a", "#c98a68"],
    "party_wall_paint": ["#e6e2d7", "#8d8f8f", "#7c3d31", "#c3ae8c", "#b9b9b4", "#4a5a62"],
    "parge_stucco": ["#b8b4a8", "#a9a49a", "#c4c0b4"],
    "tar_scar": ["#2a2724", "#3d3a34", "#1f1d1b"],
    "flue_pot_terracotta": ["#a8613c", "#b87550"],
    "ghost_sign_paint": ["#eae4d6", "#23201d", "#8c3a2b", "#2b3a5c", "#b8883a", "#5c6b4a"],
    "slate_roof": ["#4a4f52", "#3f4447", "#565c5f"],
    "copper_patina": ["#6e8f77", "#5d7f68"],
    "copper_new": ["#8a5a3a", "#a06a42"],
    "pressed_metal_cornice": ["#5a5f5c", "#7a7f7c", "#2f3130"],
    "cast_iron_paint": ["#2f3130", "#4a3f39", "#5a5f5c", "#7a4034"],
    "storefront_metal": ["#2b2b2b", "#4a4642", "#7b3f2f", "#1f3a2e"],
    "bar_woodwork": ["#2a2018", "#3a2c20"],
    "neon": ["#ff3b30", "#2b7bff", "#39ff88", "#ffd23b", "#ff7ad9"],
    "awning_canvas": ["#1f4a2c", "#7c1f1f", "#1f3a5c", "#5c1f4a", "#c9b393", "#2b2b2b"],
    "street_name_green": ["#006341"],
    "mailbox_blue": ["#0b3b8c"],
    "litter_basket_green": ["#1f4a2c"],
    "sidewalk_shed_green": ["#1b5e3a"],
    "hydrant": ["#b8b2a6", "#c0392b", "#d9d5cc"],
    "hydrant_bonnet": ["#d9a520", "#2b7bff", "#c0392b"],
    "pole_gray": ["#6e7377", "#585c5f"],
    "warning_pad": ["#9c3b26", "#3a3a3a"],
    "chainlink_scrim": ["#2f5d3a", "#3c6b45"],
    "granite_curb": ["#8c8880", "#9a968d"],
    "concrete_flag": ["#b8b5ac", "#c4c1b8", "#a8a59c"]
  },
  "lod": {
    "LOD0_under_30m": ["chamfer_arris_and_quoins", "corner_column_capital", "vestibule_recess", "joist_pockets", "flue_pots", "lot_line_window_wire_glass", "neon_tubes", "blade_sign_brackets", "truncated_domes", "bodega_crates_and_racks", "cornice_miter_at_22.5deg"],
    "LOD1_30_100m": ["chamfer_or_radius_silhouette", "cornice_wrap_and_return_stop", "belt_courses_wrapping", "bay_count_asymmetry", "party_wall_scars_and_ghost_sign", "chimney_stacks_on_party_wall", "fire_escape_on_side_street", "wraparound_awning_and_sign_band", "traffic_signal_mast_arm", "turret_roof"],
    "LOD2_over_100m": ["L_footprint", "corner_cut_as_a_notch", "turret_or_tower_silhouette_above_roofline", "party_wall_as_a_light_value_plane_with_one_dark_scar_band", "parapet_step_down_on_secondary"]
  }
}
```

---

## MATERIALS & COLORS

### Party wall (its own material set — do not reuse the front facade's)
| Material | Hex | roughness | metalness | bump_scale_m | tile_m |
|---|---|---|---|---|---|
| Soft salmon common brick | `#c07a5e` `#b8734f` `#a8664a` `#c98a68` | **0.94** | 0.0 | **0.006** (rougher and deeper than face brick) | 0.203 × 0.0667 |
| Common-bond header striping | same, value −4% on header courses | 0.94 | 0.0 | 0.006 | header line every 0.40 m (6 c.) or 0.467 m (7 c.) |
| Party-wall paint | `#e6e2d7` `#8d8f8f` `#7c3d31` `#c3ae8c` `#b9b9b4` `#4a5a62` | 0.80 | 0.0 | 0.003 (paint fills joints — reduce bump 50%) | — |
| Parge / cement stucco | `#b8b4a8` `#a9a49a` `#c4c0b4` | 0.88 | 0.0 | 0.002, trowel swirl 0.30 m | 1.0 |
| Elastomeric waterproof coating | `#b8b4a8` | 0.72 | 0.0 | 0.001 | — |
| **Tar / asphalt roof scar** | `#2a2724` `#3d3a34` `#1f1d1b` | **0.45** (bitumen is slightly glossy) | 0.0 | 0.004 | — |
| Terracotta flue pot | `#a8613c` `#b87550` | 0.72 | 0.0 | 0.003 | — |

### Corner-cut & turret
| Material | Hex | roughness | metalness | Note |
|---|---|---|---|---|
| Slate turret roof | `#4a4f52` `#3f4447` `#565c5f` | 0.62 | 0.0 | courses 0.20 × 0.36 m; per-slate value jitter ±10%; 2–6% missing slates |
| Copper, patinated | `#6e8f77` `#5d7f68` | 0.66 | **0.40** | standing seams at 0.46 m pitch, 0.025 m tall |
| Copper, new/oxidising | `#8a5a3a` `#a06a42` | 0.58 | 0.55 | |
| Pressed-metal cornice / cresting | `#5a5f5c` `#7a7f7c` `#2f3130` | 0.58 | 0.30 | 0.6 mm sheet — dents, seams every 2.44 m, 1–4 open joints |
| Glass block | `#c8d4d2` | **0.14** | 0.0 | 0.194 m module, joint 0.010 m, refraction fake via 0.65 opacity + 0.25 blur |
| Bullnose / radial special brick | matches wall brick, arris radius 0.05–0.10 m | 0.88 | 0.0 | |

### Corner storefront & signage
| Material | Hex | roughness | metalness |
|---|---|---|---|
| Cast iron, painted | `#2f3130` `#4a3f39` `#5a5f5c` `#7a4034` | 0.60 | 0.30 |
| Painted steel storefront frame | `#2b2b2b` `#4a4642` `#7b3f2f` `#1f3a2e` | 0.52 | 0.35 |
| Anodised aluminium (post-1960 replacement) | `#8e8b85` `#2a2a2c` | **0.32** | **0.58** |
| Internally-lit sign box (day) | face `#f2efe4`, emissive 0.0 | 0.42 | 0.0 |
| Internally-lit sign box (night) | emissive `#fff6d8` at 2.0–4.0 cd multiplier | — | — |
| Neon tube | `#ff3b30` `#2b7bff` `#39ff88` `#ffd23b` `#ff7ad9`; emissive 6–14× | 0.10 | 0.0 |
| Awning canvas | `#1f4a2c` `#7c1f1f` `#1f3a5c` `#5c1f4a` `#c9b393` `#2b2b2b` | 0.86 | 0.0; 0.008 m weave tile; 6–18% faded on the sun face |
| Roll-down gate, galvanised | `#7b7d80` `#4c4e50` | 0.62 | 0.48 |
| Marble bulkhead | `#ddd8cc` with 0.15 m grey veining | 0.30 | 0.0 |
| Bar woodwork | `#2a2018` `#3a2c20` | 0.66 | 0.0 |

### Streetscape
| Material | Hex | roughness | metalness |
|---|---|---|---|
| Granite curb | `#8c8880` `#9a968d` | 0.76 | 0.0 |
| Concrete sidewalk flag | `#b8b5ac` `#c4c1b8` `#a8a59c`; per-flag value jitter ±7%; joints 0.010 m, 0.005 m deep | 0.88 | 0.0 |
| Patch concrete (ramp retrofit) | `#c9c6bd` (8–20% lighter) | 0.86 | 0.0 |
| Detectable warning pad | `#9c3b26` or `#3a3a3a`, cast iron or composite | 0.70 | 0.10 |
| Asphalt roadway | `#3a3a3c`, patches `#2c2c2e` and `#4a4a4c`, 12–30% patched | 0.90 | 0.0 |
| Belgian block | `#6e6a63` `#7c776e` `#5b5750`, per-block jitter ±14% | 0.82 | 0.0 |
| Painted street pole | `#6e7377` `#585c5f`; 8–20% rust bleed at the base | 0.62 | 0.35 |
| Street-name sign | `#006341` ground, white legend, retroreflective | 0.40 | 0.10 |
| Sidewalk shed plywood | `#1b5e3a` | 0.88 | 0.0 |

---

## WEATHERING & IMPERFECTION

### Corner-specific weathering (differs from mid-block)
| Effect | Numbers | Placement rule |
|---|---|---|
| **Two-sided sun exposure** | the two facades get different soot/fade values: the sunnier one 8–18% lighter, more chalked paint, 1.3× more spalling; the shadier one 15–30% more soot and 2× more efflorescence and biological growth (`#5a6350` green-black film at 0.10–0.25 opacity in the lower 3 m) | assign per facade from the sun vector; the **chamfer/radius face is intermediate** |
| **Wind-driven rain scour at the corner arris** | the outer 0.30–0.90 m of each facade adjacent to the corner is 6–14% lighter (washed), and mortar there is eroded 0.002–0.006 m deeper | both facades, full height, strongest in the top third |
| Vehicle-impact damage at the corner | curb chipped in 3–8 places 0.05–0.20 m; corner column dented / patched; bollard scraped to bare metal over 30–60% | ground level only |
| Corner column paint loss | 20–50% of the lower 1.0 m worn to primer/rust; 3–8 sticker/tape residue patches 0.05–0.15 m | |
| Sidewalk staining at the storefront | dark grease/gum field 1.0–2.5 m out from the door, opacity 0.10–0.25; gum spots 0.02–0.05 m at 8–25 per m² near the door | |
| Pigeon droppings under the cornice return and blade sign | white streaks 0.10–0.40 m, opacity 0.25–0.55, 10–30 per element | |
| **Party wall soot gradient** | soot increases 20–40% from the scar line upward (that part was always exposed); below the scar the wall is 10–25% lighter and much cleaner, with a hard boundary ≤0.05 m wide | |
| Party wall efflorescence | coverage **6–20%** (2× a street facade), patches 0.30–2.00 m, opacity 0.20–0.50, concentrated under the coping, around the scar, and in the bottom 2.5 m | |
| Party wall spalling | **4–10%** of face bricks, depth 0.005–0.030 m; freeze-thaw damage worst in the top 1.5 m and along the scar line | |
| Party wall repointing patches | **8–22%** of area in irregular zones 0.5–4.0 m; mortar 15–30% lighter/greyer, often smeared over the brick face by 0.005–0.015 m | |
| Painted-over ghost sign | a modern flat paint band covering 30–70% of an older sign, leaving fragments; the paint is 5–15% off from the surrounding wall | probability 0.25 |
| Chalking / peeling paint on the party wall | 8–30% peeled in 0.05–0.80 m patches with a 0.01–0.03 m hard edge; paint runs 0.10–0.60 m below every projection | |
| Rust bleed from tie-back plates, conduit clips, sign anchors | 0.10–0.50 m teardrops, opacity 0.35–0.65, `#6b3b22` | 4–20 per party wall |
| Graffiti on the party wall | 0 → 3.00 m coverage **25–60%**; plus full-height pieces at 0.30 probability | |
| Buff-over patches | 0.60–2.40 m rectangles, value offset 8–20%, 4–10 per wall | |
| Weeds / ailanthus at the base and in the cornice | 0.10–4.00 m tall, 2–8 plants; probability 0.45 at a party wall vs 0.20 at a street facade | |
| Snow/salt scaling at the base | bottom 0.60 m: brick face 15–30% lighter, mortar recessed 0.004–0.010 m, 8–20% of bricks pitted | |
| Awning fade & tear | sun face 6–18% faded, 0–3 tears 0.10–0.40 m, 10–25% sag between ribs | |
| Sign band rust / detachment | 1–3 open seams 0.005–0.020 m, 10–30% rust at the fasteners, 0–2 missing letters | |

---

## DETAILS CHECKLIST
*(ordered by what makes a corner read as NYC at 30 m)*

1. **The exposed blind party wall** — a large plane of soft salmon common brick in common bond, **0.20–0.41 m thick at the parapet**, painted or bare, occupying 3–24 m of height above the neighbour.
2. **The roofline scar**: a **0.10–0.30 m tar band at 0.50–0.85 opacity that drops 0.15 m over each 7.62 m of depth**, with the wall **10–25% lighter and cleaner below it** across a hard boundary.
3. **Bay-count asymmetry**: avenue **3–6 bays**, side street **5–12 bays** (loft corners up to 28), with ornament density on the secondary facade at **0.40–0.70** of the primary.
4. **The corner cut**: a **1.22–2.44 m chamfer at exactly 45°** (or a **1.83–3.05 m radius** for Deco), with the cornice crossing it as a third segment on **two 22.5° miters**.
5. **Wraparound cornice and belt courses**, and — critically — the **return stop**: 45% of the time the cornice dies at a vertical break **1.52–6.10 m (1–2 bays)** onto the side street, leaving plain brick beyond.
6. **The corner storefront wrapping the corner** — glazing continuous from the avenue **1.52–6.10 m onto the side street**, past a **0.20–0.35 m free-standing corner column**, under a **0.60–1.20 m sign band**.
7. **Joist pockets and floor-line scars** on the party wall: 2–5 bands at **2.90–4.27 m** spacing, pockets **0.10 × 0.20 m at 0.41 m o.c.**, 60–90% filled with mismatched brick.
8. **Chimney flue stacks as pilasters on the party wall** — 1–4 of them, **0.40–0.90 m wide projecting 0.05–0.15 m**, with corbelled caps and **0.20–0.30 m terracotta pots** above the roof.
9. **Ghost sign on the party wall** at 0.42 probability — 6–25 m wide, cap height 0.61–1.22 m, opacity **0.10–0.25 on sun-facing walls, 0.35–0.60 on shaded ones**.
10. **Fire escape on the side street, 1–2 bays in from the corner**, never on the avenue and never on the chamfer.
11. **Residential entrance on the side street** (0.70 probability) so the avenue frontage stays retail; corner-store door on the chamfer with a **1.00–2.00 m recessed vestibule**.
12. **Projecting blade sign** at 3.05–4.57 m above the sidewalk, projecting 0.45–1.20 m, plus a corner-wrapping awning with a **triangular gore over the chamfer**.
13. **Corner tower / turret** where the typology allows (Queen Anne flats 0.14, New-Law tenement 0.04): **3.05–5.49 m diameter, 3.05–9.14 m above the roofline**, conical slate at 55–70°.
14. **Traffic-signal mast arm 4.88–13.72 m** with a 1.07 m head, plus two street-name signs at 90° on one pole, a hydrant within 4.6 m, a 0.56 m litter basket, and a **4.57 m curb return with a 0.61 m truncated-dome pad**.
15. **Two-sided sun weathering** — one facade 8–18% lighter, the other 15–30% sootier with 2× efflorescence.
16. **Wind scour at the corner arris**: the outer 0.30–0.90 m of both facades 6–14% lighter with mortar 0.002–0.006 m deeper.
17. Lot-line windows: 0.61 × 0.91 m, wire glass, **half of them bricked up** with brick 8–20% off in value.
18. Vacant-lot condition next door (0.18) — chain-link with green scrim at 1.83–2.44 m, ailanthus, rubble.

---

## COMMON MISTAKES

1. **No exposed party wall.** A corner building is almost always taller and/or deeper than its mid-block neighbour. Model the blank wall — **0.20–0.41 m thick, common bond, salmon common brick** — or the corner reads as a free-standing model on a plinth.
2. **A clean, uniform party wall.** It needs the tar scar, floor-line bands, joist pockets, chimney pilasters, patched brick (8–22%), spalls (4–10%), efflorescence (6–20%), and the **lighter protected zone below the scar**. This is where the authenticity budget belongs.
3. **A dead-level roof scar.** Flat roofs pitch 2% to the rear: the scar **drops 0.15 m per 7.62 m of depth**. And the boundary at the scar must be **hard (≤0.05 m)**, not a soft gradient.
4. **Symmetric facades.** The avenue face is short (3–6 bays) and ornate; the side street is long (5–12 bays) and plain, with **0.40–0.70×** the ornament, common brick, and plainer lintels. Window *sizes* stay the same — only the trim downgrades.
5. **Wrapping ornament all the way around at full richness.** Belt courses continue 100%; the **cornice stops after 1–2 bays 45% of the time**. Model the vertical break and the plain brick beyond it.
6. **Chamfer at the wrong angle or the wrong width.** It is **exactly 45°** and **1.22–2.44 m** wide (mode 1.52 m), setting back **0.707 × W** on each facade. A 0.6 m chamfer looks like a bevelled box; a 4 m chamfer looks like a different building.
7. **Rounding a cornice over a chamfer.** The cornice crosses the chamfer as a **straight third segment with two 22.5° miters**, carrying 1–2 brackets. Only a *rounded* corner sweeps the cornice.
8. **Rounded corners on the wrong era.** Radii of 1.83–3.05 m are **Art Deco / Streamline Moderne (1930–1942)**, weight 0.42. On a 1900 tenement the corner is square (0.66) or chamfered (0.22).
9. **Faceted round corners.** At R ≥ 1.50 m standard 0.203 m stretchers laid to the chord deviate only **0.002 m** — it must read smooth. Only below R = 1.50 m does faceting become visible, and there real buildings used **radial/bullnose special shapes**.
10. **Fire escape on the avenue or on the chamfer.** **0.72 side street, 0.20 rear, 0.06 avenue, 0.00 chamfer**, and 1–2 bays in from the corner.
11. **Residential entrance on the avenue.** 0.70 of the time it is on the side street — the avenue frontage is worth more as retail.
12. **A storefront that stops at the corner.** It wraps **1.52–6.10 m onto the side street** past a free-standing **0.20–0.35 m** corner column, with a continuous sign band and the store name repeated on both frontages.
13. **A structural pier at the glass corner.** The classic corner storefront has a **single slender free-standing column** with glass returning on both faces — not a 0.9 m masonry mass.
14. **Interior-lot coverage on a corner lot.** Corner lots get **80–100%** coverage (90% under the 1901 Tenement House Act) versus 60–70% interior, need **no rear yard**, and are therefore **3–9 m deeper** than their neighbours. That extra depth is the second source of exposed wall.
15. **Forgetting that corner regulations only reach 30.48 m (100 ft)** from each street line — on a deep lot the far end reverts to interior-lot rules, which is why the rear third of a corner building often steps down or narrows.
16. **Ghost signs at full opacity.** Sun-facing party walls read at **0.10–0.25 opacity** with 20–40% stroke breakup; only a freshly exposed wall exceeds 0.55.
17. **Chimneys as free-floating boxes on the roof.** They are **flue pilasters 0.40–0.90 m wide projecting 0.05–0.15 m** running the full height of the party wall, emerging **0.91–2.44 m** above the roof with a corbelled cap and **1–6 terracotta pots**.
18. **Identical weathering on both facades.** Split them: sunny face 8–18% lighter and chalkier; shaded face 15–30% sootier with 2× efflorescence and green-black biofilm in the lower 3 m.
19. **Blade signs oversized.** Code projection across the street line is **0.305 m** flat / **0.457 m** double-faced, capped at **7.62 m (25 ft)** above the curb in C1/C2 and **12.19 m (40 ft)** in C4/C6. Only pre-1961 legacy signs reach 0.60–1.20 m.
20. **A bare, empty corner.** A real NYC corner carries a traffic signal with a **4.88–13.72 m mast arm**, a street light, two street-name signs, a hydrant, a litter basket, a curb ramp with a **0.61 m truncated-dome pad**, 2–6 manhole covers, regulation-sign posts — and, 12% of the time, a green **sidewalk shed** with 2.44–3.05 m clear height.
21. **Turret dimensions guessed.** **3.05–5.49 m diameter, 0.61–1.52 m projection, 3.05–9.14 m above the roofline**, conical roof at **55–70°**, finial 0.91–2.44 m. A stubby turret or one flush with the wall both read wrong.
22. **Curb return as a hard 90° corner.** Radius **3.05–6.10 m** (typ 4.57 m), with sidewalk flags cut into **4–8 radial wedges** around it.
</content>
