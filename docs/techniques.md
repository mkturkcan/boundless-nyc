# Procedural NYC Building Generator — Technique Reference

**Target:** 100–150 highly detailed buildings, 60 fps, RTX 3060 Laptop (GA106), 1080p, WebGL2, three.js r160+ (written against `dev` ≈ r184–r186).

**Status:** engineering reference. Every recommendation is meant to be implementable as written. Where an API changed recently the version is given.

---

## 0. Hardware envelope and where the real budget goes

### 0.1 The GPU

| Spec | RTX 3060 Laptop (GA106) |
|---|---|
| CUDA cores | 3840 (30 SMs) |
| FP32 peak | 9.9–13.1 TFLOPS (varies 60–130 W TGP) |
| Boost clock | 1283–1703 MHz (TGP-dependent) |
| TMUs / ROPs | 120 / 48 |
| VRAM | 6 GB GDDR6, 192-bit, 336 GB/s |

Derived per-frame budgets at 60 fps (16.67 ms):

- **FP32:** ~218 GFLOP/frame. At 1080p (2.07 Mpx) that is ~105k FLOP/pixel at theoretical peak; assume 10–20% real efficiency → **~10–20k FLOP per pixel available**. A `MeshStandardMaterial` fragment with IBL + one shadow lookup costs roughly 300–600 FLOP. **Fragment ALU is not your bottleneck.**
- **Bandwidth:** 336 GB/s ÷ 60 = **5.6 GB/frame**. A forward pass at 1080p with 2× overdraw and 4 texture fetches/pixel is ~150 MB. GTAO at 16 samples full-res is ~250 MB. Also not the bottleneck.
- **Fill:** 48 ROPs × 1.7 GHz = ~81 Gpx/s → ~1.36 Gpx/frame → **~650 full-screen layers of blending headroom**. Only a problem if you stack transparency.
- **VRAM:** 6 GB. Budget ≤ 1.5 GB for textures, ≤ 200 MB geometry, ~200 MB render targets.

### 0.2 The actual bottleneck: draw calls and JS

In three.js/WebGL you will be **CPU-bound on draw call submission long before you are GPU-bound.** Each draw call costs:

- three.js JS work per render item: matrix flattening, uniform diffing, program/state binding.
- The browser's WebGL validation layer.
- ANGLE → D3D11 translation (on Windows, Chrome default).

Published desktop figures cluster around **50–200 µs per state-changing draw call**, which naively implies only 80–330 calls/frame. That number is pessimistic for *batched* calls that share a program and only change a uniform block — those are closer to 10–30 µs. Use these planning numbers:

| Budget line | Safe | Aggressive ceiling |
|---|---|---|
| Draw calls, main opaque pass | **≤ 150** | 400 |
| Draw calls, all passes incl. shadows + AO G-buffer | **≤ 400** | 900 |
| Triangles, main pass | **≤ 3 M** | 5 M |
| Triangles, all passes | **≤ 6 M** | 10 M |
| Unique materials (programs) | **≤ 12** | 25 |
| Texture binds/frame | **≤ 60** | 150 |
| JS frame time | **≤ 4 ms** | 8 ms |

Two consequences that shape the entire architecture:

1. **Spend triangles freely, spend draw calls like they cost money.** A 90-triangle window unit × 6000 windows = 540k triangles in *one* draw call is a great trade. 6000 separate `Mesh` objects is a catastrophe.
2. **Every shadow-casting light and every AO pass re-submits your geometry.** `GTAOPass` renders a full normal+depth G-buffer — that is a second complete geometry pass. Count it.

Instrument this from day one:

```js
// call after renderer.render() / composer.render()
const i = renderer.info;
console.log(i.render.calls, i.render.triangles, i.memory.geometries, i.memory.textures, i.programs.length);
```

---

## 1. Facade generation: a practical split grammar

### 1.1 CGA shape, distilled

Müller et al., *Procedural Modeling of Buildings* (SIGGRAPH 2006) introduced **CGA shape**. Only a small subset matters for facades. The whole system is: a **shape** carries a **scope** (an oriented bounding box), and **rules** rewrite shapes into smaller shapes with derived scopes.

**Scope** = `{ position: Vector3, basis: Matrix3 (or quaternion), size: Vector3 }`. Everything a rule does is expressed relative to this local box. In practice this is a 4×4 matrix plus a size vector.

The operators you actually need:

| CGA | Meaning | Notes |
|---|---|---|
| `T(x,y,z)` | translate scope | in scope-local axes |
| `S(x,y,z)` | set scope size | `'` prefix = relative to current |
| `R(...)` | rotate scope | rarely needed for orthogonal facades |
| `[ ... ]` | push/pop scope | lets one rule emit siblings |
| `extrude(h)` | footprint polygon → prism | your building mass |
| `comp(f){ front \| side \| top \| bottom : Rule }` | **component split** — one new shape per face of the current geometry | this is how you get from a 3D mass to 2D facades |
| `split(axis){ ... }` | subdivide scope along x/y/z | the workhorse |
| `i("asset")` | insert geometry into scope | your instanced components |

**Size prefixes in `split` (this is the part people get wrong):**

- **absolute**: `4` → exactly 4 units.
- **relative**: `'0.25` → 0.25 × current scope extent.
- **floating**: `~1` → takes a share of whatever is left after absolute and relative terms, weighted.
- **repeat**: trailing `*` on the block repeats it as many times as it fits.

Canonical CityEngine examples (verbatim from the CGA reference):

```
split(x){ '0.5 : Z | '0.1 : Y(2) | '0.2 : X(1) }
split(x){ 2 : X(2) | 1 : Y(1) }*
split(x){ 1 : X(3) | { ~1 : Y(2) | 0.2 : Z(1) }* | 1 : X(3) }
```

And the archetypal facade chain:

```
Mass     --> comp(f) { side : Facade | top : Roof }
Facade   --> split(y) { 4 : GroundFloor | ~3.5 : UpperFloor }*
UpperFloor --> split(x) { ~1.8 : Bay }*
Bay      --> split(x) { ~0.3 : Wall | 1.2 : WindowCell | ~0.3 : Wall }
```

Each produced shape also gets **`split.index`** and **`split.total`**. These are indispensable: "ground floor is different", "top floor gets the cornice", "first and last bay are pilasters", "every 6th course is a header course".

### 1.2 A minimal split-grammar engine in JS

You do not need a parser. Represent rules as plain functions over a scope. This is ~150 lines and is the correct amount of machinery.

```js
// ---------- Scope ----------
class Scope {
  constructor(matrix = new THREE.Matrix4(), size = new THREE.Vector3(1,1,1)) {
    this.matrix = matrix;   // scope-local -> building-local
    this.size = size;       // extents along local x,y,z
  }
  clone() { return new Scope(this.matrix.clone(), this.size.clone()); }
  // child scope offset by (ox,oy,oz) in local units, with new size
  sub(ox, oy, oz, sx, sy, sz) {
    const m = this.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(ox, oy, oz));
    return new Scope(m, new THREE.Vector3(sx, sy, sz));
  }
}

// ---------- The size solver: absolute / relative / floating / repeat ----------
// terms: [{ kind:'abs'|'rel'|'float', value:number, rule:Function }]
function solveSplit(total, terms, { repeat = false, mode = 'fit' } = {}) {
  if (repeat) {
    // one pass of the pattern at its natural (abs+rel) length
    const unit = terms.reduce((s,t) =>
      s + (t.kind === 'abs' ? t.value : t.kind === 'rel' ? t.value * total : t.value), 0);
    let n;
    if (mode === 'floor') n = Math.max(1, Math.floor(total / unit));      // CGA default, leaves remainder
    else                  n = Math.max(1, Math.round(total / unit));      // 'fit': no remainder, slight scale
    const scale = mode === 'floor' ? 1 : total / (n * unit);
    const out = [];
    let cursor = 0;
    for (let r = 0; r < n; r++) {
      for (const t of terms) {
        const len = (t.kind === 'abs' ? t.value : t.kind === 'rel' ? t.value * total : t.value) * scale;
        out.push({ offset: cursor, length: len, rule: t.rule, index: r, total: n });
        cursor += len;
      }
    }
    return out;
  }

  let used = 0, floatWeight = 0;
  for (const t of terms) {
    if (t.kind === 'abs') used += t.value;
    else if (t.kind === 'rel') used += t.value * total;
    else floatWeight += t.value;
  }
  const slack = Math.max(0, total - used);
  const out = [];
  let cursor = 0;
  terms.forEach((t, i) => {
    const len = t.kind === 'abs'   ? t.value
              : t.kind === 'rel'   ? t.value * total
              : floatWeight > 0 ? slack * (t.value / floatWeight) : 0;
    out.push({ offset: cursor, length: len, rule: t.rule, index: i, total: terms.length });
    cursor += len;
  });
  return out;
}

// ---------- split on an axis ----------
const AXIS = { x: 0, y: 1, z: 2 };
function split(ctx, scope, axis, terms, opts) {
  const a = AXIS[axis];
  const total = scope.size.getComponent(a);
  for (const part of solveSplit(total, terms, opts)) {
    const off = [0,0,0]; off[a] = part.offset;
    const siz = scope.size.toArray(); siz[a] = part.length;
    const child = scope.sub(off[0], off[1], off[2], siz[0], siz[1], siz[2]);
    part.rule(ctx, child, { index: part.index, total: part.total });
  }
}

// sugar
const abs   = (v, rule) => ({ kind: 'abs',   value: v, rule });
const rel   = (v, rule) => ({ kind: 'rel',   value: v, rule });
const flt   = (v, rule) => ({ kind: 'float', value: v, rule });
```

`ctx` is your **emit sink**. Rules never build meshes directly; they push records:

```js
class BuildCtx {
  constructor(rng, seed) { this.rng = rng; this.seed = seed;
    this.parts = [];    // { partId, matrix, color, params:Float32Array }  -> instanced later
    this.panels = [];   // { kind:'wall'|'opening'|'roof', matrix, size, matId } -> merged later
  }
  emitPart(partId, scope, opts = {}) {
    this.parts.push({ partId, matrix: scopeToMatrix(scope), ...opts });
  }
  emitPanel(kind, scope, matId) {
    this.panels.push({ kind, matrix: scope.matrix, size: scope.size.clone(), matId });
  }
}
```

Building a real NYC tenement facade then reads almost like the CGA:

```js
const R = {};

R.Facade = (ctx, s) => {
  const gh = ctx.typology.groundFloorHeight;   // 4.2 m tenement, 5.5 m loft
  const fh = ctx.typology.floorHeight;         // 3.1 m
  const ch = ctx.typology.corniceHeight;       // 0.9 m
  split(ctx, s, 'y', [
    abs(gh,  R.GroundFloor),
    flt(1,   R.UpperFloors),
    abs(ch,  R.Cornice),
  ]);
};

R.UpperFloors = (ctx, s) =>
  split(ctx, s, 'y', [ abs(ctx.typology.floorHeight, R.Floor) ], { repeat: true, mode: 'fit' });

R.Floor = (ctx, s, info) => {
  ctx.floorIndex = info.index;
  // pilaster | N bays | pilaster
  split(ctx, s, 'x', [
    abs(0.45, R.Pilaster),
    flt(1, (c, sub) => split(c, sub, 'x',
      [ abs(c.typology.bayWidth, R.Bay) ], { repeat: true, mode: 'fit' })),
    abs(0.45, R.Pilaster),
  ]);
};

R.Bay = (ctx, s, info) => {
  ctx.bayIndex = info.index;
  const w = ctx.typology.windowWidth;          // 1.05–1.30 m
  split(ctx, s, 'x', [ flt(1, R.Wall), abs(w, R.WindowColumn), flt(1, R.Wall) ]);
};

R.WindowColumn = (ctx, s) => {
  const h = ctx.typology.windowHeight;         // 1.6–2.1 m
  const sill = ctx.typology.sillHeight;        // 0.75–0.95 m
  split(ctx, s, 'y', [
    abs(sill, R.Wall),
    abs(h,    R.WindowCell),
    flt(1,    R.Wall),
  ]);
};

R.WindowCell = (ctx, s) => {
  ctx.emitPanel('opening', s);                 // punch a hole in the merged wall
  ctx.emitPart('windowUnit', s, {              // the instanced component
    color: ctx.glassTint(),
    params: ctx.windowParams(),                // lit, roomId, depth, blind
  });
  if (ctx.typology.hasSills) ctx.emitPart('sill', s);
  if (ctx.typology.hasLintels) ctx.emitPart('lintel', s);
  if (ctx.rng() < ctx.typology.acDensity) ctx.emitPart('acUnit', s);
};

R.Wall = (ctx, s) => ctx.emitPanel('wall', s, ctx.typology.wallMat);
R.Pilaster = (ctx, s) => ctx.emitPanel('wall', s, ctx.typology.wallMat);
```

**Why this shape of engine, specifically:**

- Rules are **functions, not strings** — no parser, full debuggability, you can breakpoint a rule.
- Rules **emit records, not geometry** — this is the critical decoupling that makes batching possible later (§3, §8). Geometry is only realised at block-merge time, when you know everything.
- `split.index` / `split.total` fall out naturally as `info`.
- Determinism comes from a seeded PRNG on `ctx`. Use a counter-based hash, not a stateful `Math.random`, so that changing one rule doesn't reshuffle every other building:

```js
// splitmix32 — cheap, good enough, and reproducible
function rngFor(seed) {
  let a = seed | 0;
  return () => { a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16); t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15); t = Math.imul(t, 0x735a2d97);
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296; };
}
// derive stable sub-seeds so edits stay local
const seedOf = (...ints) => ints.reduce((h, v) => Math.imul(h ^ v, 0x01000193) >>> 0, 0x811c9dc5);
```

### 1.3 Building the mass: NYC-specific `extrude` + setbacks

The 1916 Zoning Resolution is what makes pre-war Manhattan look the way it does, and it is trivially proceduralisable. The rule: a building may rise vertically to a height of **`multiple × street width`**, then must stay under a **sky exposure plane** sloping up and inward. The five districts used multiples **1, 1.25, 1.5, 2, 2.5**. Above that, a **tower on ≤ 25% of the lot** could rise without limit.

```js
function generateMass(lot, zoning, rng) {
  const streetW = lot.frontage === 'avenue' ? 30.5 : 18.3;   // 100 ft / 60 ft
  const baseH = zoning.multiple * streetW;                    // vertical wall allowance
  const slope = zoning.setbackRatio;                          // e.g. 1 ft in per 4 ft up -> 0.25

  const tiers = [];
  let poly = lot.polygon, h = 0;

  tiers.push({ poly, from: 0, to: baseH });                   // the base block
  h = baseH;

  // "wedding cake": step in until we run out of lot or hit the tower threshold
  const lotArea = polygonArea(lot.polygon);
  while (h < zoning.maxSetbackHeight && polygonArea(poly) > lotArea * 0.25) {
    const rise = THREE.MathUtils.lerp(8, 20, rng());          // 2–6 storeys per tier
    const inset = rise * slope;
    poly = insetPolygon(poly, inset);
    if (polygonArea(poly) < lotArea * 0.25) break;
    tiers.push({ poly, from: h, to: h + rise });
    h += rise;
  }

  if (zoning.allowTower && rng() < zoning.towerChance) {
    const towerPoly = insetPolygonToAreaFraction(lot.polygon, 0.25);
    tiers.push({ poly: towerPoly, from: h, to: h + THREE.MathUtils.lerp(20, 90, rng()) });
  }
  return tiers;   // each tier -> extrude -> comp(f) -> Facade rules
}
```

Then each tier is `comp(f)`-split: side faces → `Facade`, the exposed top ring of each tier → **setback terrace** (parapet + roof clutter, which is where water towers and bulkheads live and is a huge part of the NYC read).

### 1.4 NYC dimensional constants (use these, do not guess)

```js
export const NYC = {
  // Urban grid — Commissioners' Plan 1811
  blockShortAxis: 61.0,        // 200 ft, avenue-to-avenue depth (real range 55–63 m)
  blockLongAxis:  244.0,       // 800 ft typical (real range 183–280 m)
  streetWidth:    18.3,        // 60 ft
  avenueWidth:    30.5,        // 100 ft
  sidewalkWidth:  4.6,         // 15 ft typical

  // Lots
  lotStandard:    { w: 7.62, d: 30.5 },   // 25 x 100 ft
  lotBrownstone:  { wMin: 4.9, wMax: 8.5 }, // 16–28 ft observed in 19th-c. lot data

  // Storey heights (Müller's facade paper searched 3.0–5.5 m for floor height,
  // and 0.5–9 m for horizontal tile widths — good validation of these ranges)
  floorHeight: { tenement: 3.05, brownstone: 3.35, prewarOffice: 3.8, loft: 4.0, modern: 3.6 },
  groundFloor: { tenement: 4.2,  brownstone: 3.9,  prewarOffice: 5.5, loft: 4.9, modern: 5.5 },

  // Facade module
  bayWidth:     { tenement: 1.85, brownstone: 2.35, loft: 2.9, curtainWall: 1.524 }, // 5 ft mullion
  windowWidth:  { tenement: 1.10, brownstone: 1.30, loft: 2.20 },
  windowHeight: { tenement: 1.75, brownstone: 2.10, loft: 2.60 },
  sillHeight:   0.85,
  windowInset:  { l0: 0.20, l1: 0.12 },   // reveal depth — see §2.2, this matters enormously

  // Masonry — US modular brick
  brick: { l: 0.194, h: 0.057, d: 0.092, joint: 0.0095 },  // 7 5/8 x 2 1/4 x 3 5/8 in, 3/8 in joint
  courseHeight: 0.0665,        // brick h + joint
  stretcherModule: 0.2035,     // brick l + joint  (8 in nominal)

  // Signature clutter
  waterTower:  { tankH: 3.66, tankD: 3.66, frameH: 4.0, capacityGal: 10000, staves: 40 },
  fireEscape:  { landingDepth: 0.91, clearance: 0.91, stairAngle: 50 * Math.PI/180, railH: 1.07 },
  cornice:     { projection: [0.30, 1.00], bracketSpacing: [0.60, 1.20] },
  parapet:     { h: 1.07 },     // 42 in
  scaffoldShed:{ h: 3.4, postSpacing: 2.4, deckOverhang: 1.5 },  // sidewalk sheds — extremely NYC

  // Zoning
  zoningMultiples: [1, 1.25, 1.5, 2, 2.5],
  towerLotFraction: 0.25,
};
```

### 1.5 The seven typologies worth building

Cover these and you have covered visually 95% of Manhattan below 59th St.

| # | Typology | Storeys | Width | Signature features |
|---|---|---|---|---|
| 1 | **Brownstone / row house** | 3–5 | 5–8 m | stoop, high basement, bracketed cornice, segmental-arch lintels, bay/oriel window, areaway railing |
| 2 | **Old/new-law tenement** | 5–7 | 7.6–15 m | **street-facing fire escape** (the single most NYC-reading element), brick, stone lintels, corbelled cornice, ground-floor retail with roll-down gate |
| 3 | **Cast-iron loft (SoHo/Tribeca)** | 5–7 | 15–25 m | very wide windows, thin cast-iron columns/pilasters, heavy projecting cornice, painted metal, loading bay |
| 4 | **Pre-war setback office** | 15–40 | 25–60 m | wedding-cake tiers, limestone base + brick shaft, spandrel panels, terracotta ornament, water tower on a setback |
| 5 | **Post-war International curtain wall** | 20–45 | 30–60 m | uniform mullion grid at 1.524 m, dark spandrel glass, plaza setback, no cornice |
| 6 | **Art Deco tower** | 25–70 | 30–50 m | stepped crown, vertical piers, chevron/setback ornament, spire |
| 7 | **Modern glass tower** | 30–80 | 30–50 m | unitised glazing, minimal mullions, mechanical floors as louvre bands |

Assign typologies with **adjacency rules**, not per-lot independent randomness — that is what makes a generated street read as a real street:

```js
// row houses come in runs; corners go commercial/tall; avenues get bigger buildings
function assignTypologies(lots, rng) {
  let run = null, runLeft = 0;
  for (const lot of lots) {
    if (lot.isCorner)            { lot.typology = pick(rng, ['tenement','prewarOffice','loft']); runLeft = 0; continue; }
    if (lot.frontage==='avenue') { lot.typology = pick(rng, ['prewarOffice','curtainWall','loft']); runLeft = 0; continue; }
    if (runLeft <= 0) { run = pick(rng, ['brownstone','brownstone','tenement','loft']); runLeft = 3 + Math.floor(rng()*7); }
    lot.typology = run; runLeft--;
  }
  // then: cluster heights (neighbours differ by <=2 storeys within a run), share cornice lines
}
```

The **shared cornice line** trick is worth calling out: real row-house runs were built by one developer, so cornices and floor lines align across 5–10 buildings. Snapping `floorHeight` and `corniceHeight` per run — Müller's "snap lines" — costs nothing and dramatically increases realism.

### 1.6 How games actually do this — and what to copy

The industry consensus is a **texture + geometry hybrid**, split by distance. Nobody ships pure-geometry facades and nobody ships pure-texture facades.

**Modular kit-bashing (Assassin's Creed / Ubisoft Anvil lineage).** Facades are assembled from a hand-authored **kit** of wall pieces, window pieces, cornices, and trim that share a small number of **trim-sheet** materials, snapped to a grid. A procedural/scripted layer places kit pieces; artists override. Key transferable ideas:

- **Snap everything to a module grid.** All kit pieces are authored to multiples of one number. This is exactly what `split(..., {repeat:true, mode:'fit'})` gives you.
- **Trim sheets:** one texture holds all the profiles (cornice, sill, moulding, brick, stone) in horizontal strips; every kit piece UVs into that one sheet. Result: **the entire facade kit is one material and one texture bind.** This is the single most important texturing idea to steal — see §4.3.
- **Vertex-colour masks** to drive per-instance variation (dirt amount, paint colour, wear) with no extra texture.

**Baked-facade-plus-parallax (Spider-Man / open-world-at-speed lineage).** When the camera moves fast and buildings are mostly seen from 30–300 m, the geometry that matters is the **silhouette and the window recess**, not the mouldings. So: real geometry for the massing, parapet and window reveals; everything else in the albedo/normal; **fake interiors** behind the glass so windows don't read as painted-on. Transferable:

- **Recessed windows are non-negotiable** even at distance — they are what makes a facade read as a solid object rather than a decal.
- Fake interiors are what stop a city looking like a diorama at night.

**Decal / detail-layer (Division / Snowdrop lineage).** A clean base facade material plus a heavy layer of **decals** for grime, signage, pipes, stains, damage, posters. This decouples "structure" from "history" and gives per-building uniqueness for almost no authoring cost. Transferable: don't try to bake grime into the tiling brick texture; add it as a separate multiplied layer driven by world position (§4.6).

**Fake interior cubemaps (GTA-lineage, and the standard Unreal `InteriorCubemap`/interior-mapping material function).** Analytic ray-box intersection in tangent space, one cubemap fetch. See §2.3 — this is cheap enough to run on every window in the city.

**Synthesis — the recommended hybrid:**

| Distance | Massing | Facade surface | Windows |
|---|---|---|---|
| 0–40 m | full tiers | tiling brick + normal + trim-sheet mouldings | inset geometry + frame + interior mapping + glass |
| 40–120 m | full tiers | tiling brick + normal | inset geometry (simplified) + interior mapping |
| 120–350 m | tiers, no mouldings | baked facade atlas | flat quad, single-offset parallax + emissive mask |
| 350 m+ | impostor quad | baked atlas | baked into atlas, emissive mask only |

---

## 2. Window rendering: AAA quality per unit of budget

Windows are ~80% of what the eye reads on a building. Four independent techniques stack; you choose which are active per LOD.

### 2.1 The four layers

| | Technique | Cost | What it buys |
|---|---|---|---|
| **a** | Real inset geometry + instanced frames | triangles (60–110/window), 1–2 draw calls total | correct silhouette, real self-shadowing, real AO, correct parallax from any angle. **Highest payoff of anything in this document.** |
| **b** | Interior mapping (parallax rooms behind glass) | ~20 ALU + 1 texture fetch per window pixel | depth behind the glass; kills the "painted window" read; the single biggest "how is this WebGL" moment |
| **c** | Emissive night windows, per-window random lit state | ~5 ALU, one hash | the night skyline; also cheap daytime variation (blinds/curtains) |
| **d** | Glass: envmap reflection + Fresnel | ~10 ALU + 1 cubemap fetch | grazing-angle sheen, sky reflection, makes glass read as glass |

### 2.2 (a) Real inset geometry + instanced window units

**The geometry.** A window unit is a small mesh authored once, in **cell-local space normalised to the window opening**, so one geometry serves every opening size via non-uniform instance scale:

```
local space: x,y in [-0.5, 0.5] (opening plane), z = 0 at wall face, -1 = full inset depth
```

Contents at L0 (~90 tris):

| Part | Tris | Note |
|---|---|---|
| reveal / jamb (4 quads, wall face → glass plane) | 8 | this is where the AO and shadow live |
| sill slope + drip edge | 10 | separate instance if you want per-typology sills |
| frame ring (mitred box profile) | 24 | |
| 2 sashes + meeting rail | 16 | double-hung — the NYC default |
| muntins (optional, 6-over-6 for brownstones) | 24 | drop at L1 |
| glass quad | 2 | **separate material → separate InstancedMesh** |

**The wall must actually have a hole.** Two options:

1. **Punch the merged wall.** During block merge, build each wall panel as a grid tessellated around its openings. A clean way: for each wall panel, collect its openings, run a simple rectangular-hole tessellation (sweep the union of opening x-ranges and y-ranges into a grid, drop cells that are openings). ~8–12 tris per opening plus the background grid. This is the correct approach: it produces watertight walls, no z-fighting, and the reveal geometry is on the instanced unit.
2. **Alpha-test the wall.** Cheaper to author, but you lose early-Z, you get sorting issues, and you cannot cast clean shadows. **Don't.**

```js
// rectangular-hole tessellation of one wall panel
function punchedPanel(w, h, openings) {
  const xs = new Set([0, w]), ys = new Set([0, h]);
  for (const o of openings) { xs.add(o.x0); xs.add(o.x1); ys.add(o.y0); ys.add(o.y1); }
  const X = [...xs].sort((a,b)=>a-b), Y = [...ys].sort((a,b)=>a-b);
  const pos = [], uv = [], idx = [];
  for (let j = 0; j < Y.length-1; j++) for (let i = 0; i < X.length-1; i++) {
    const cx = (X[i]+X[i+1])/2, cy = (Y[j]+Y[j+1])/2;
    if (openings.some(o => cx > o.x0 && cx < o.x1 && cy > o.y0 && cy < o.y1)) continue;
    const b = pos.length/3;
    pos.push(X[i],Y[j],0, X[i+1],Y[j],0, X[i+1],Y[j+1],0, X[i],Y[j+1],0);
    // world-scale UVs so brick tiles continuously across panels and buildings
    uv.push(X[i],Y[j], X[i+1],Y[j], X[i+1],Y[j+1], X[i],Y[j+1]);
    idx.push(b,b+1,b+2, b,b+2,b+3);
  }
  return { pos, uv, idx };
}
```

**Inset depth is the tuning knob that matters most.** Real NYC masonry reveals are 100–250 mm (a brick's depth plus the frame setback). Use **0.20 m** at L0. If you only take one thing from this document: a flat facade with a 0.20 m recess added looks like a different renderer.

**Instance layout.** One `InstancedMesh` per (block × window-part), so frustum culling works (§6.2):

```js
const windowFrames = new THREE.InstancedMesh(WINDOW_L0_OPAQUE, facadeTrimMat, n);
const windowGlass  = new THREE.InstancedMesh(WINDOW_L0_GLASS,  glassMat,      n);
// per-instance scale encodes the opening size AND the inset depth
m.compose(pos, quat, new THREE.Vector3(openingW, openingH, insetDepth));
windowFrames.setMatrixAt(i, m);
windowGlass.setMatrixAt(i, m);
```

### 2.3 (b) Interior mapping

**The technique.** Joost van Dongen, *Interior Mapping: A new technique for rendering realistic buildings* (CGI 2008). The insight: you do not need geometry, and you do not need a raymarching loop. Space is filled with three **infinite families of axis-aligned planes** — floors/ceilings, plus walls in two directions — at regular intervals. Cast a ray from the eye through the fragment, solve for the one plane of each family the ray is heading toward, take the nearest of the three hits, and use the *other two* components of the hit point as its texture coordinates.

Cost is **O(1) in the number of rooms** — a plane-family lookup replaces any traversal. Van Dongen measured that going from 1,000 rooms per building to 4,000,000 *"does not influence the performance at all."*

Primary sources are still live: [paper](https://www.proun-game.com/Oogst3D/CODING/InteriorMapping/InteriorMapping.pdf), [demo + full Cg source](https://www.proun-game.com/Oogst3D/CODING/InteriorMapping/InteriorMapping.zip). Note the paper contains **no displayed equation** — the authoritative statement of the math is `Media/InteriorMapping.cg` inside the zip, and it differs from the paper's prose (the shader is branchless; the paper describes a `ceil`-based form).

**Two families.** Know both; ship A as the primary.

| | **A — van Dongen plane grid** | **B — interior cubemap / box projection** |
|---|---|---|
| Space | **object** (or a per-building lattice space) | **tangent** |
| Model | infinite lattice; rooms exist independently of the surface | one box per UV cell |
| Interior texture fetches | **4** (ceiling, floor, wallXY, wallZY) | **1** cubemap |
| Core ALU | `floor`, `step`, one vec3 divide, 3 mad, ~6 `step`/`mix` to select | reciprocal, `abs`, mad, `min3`, mad |
| **Rooms match across a building corner** | **yes, by construction** — the north and east facades trace the *same* lattice, so it is literally the same room | **no** — each facade traces its own box in its own tangent frame, and they disagree |
| Curved / rotated / inset facades | works; the lattice is independent of the surface | needs clean non-overlapping UVs and correct tangents |
| Per-plane authored art | separate ceiling/floor/wall textures with distinct UVs | one cubemap, art baked in |
| Per-room variation | hash the integer cell (the shader already computes it) | hash the UV cell |
| Shipped in | van Dongen's paper, **SimCity (2013)**, Marvel's Spider-Man (2018) | Unreal's `InteriorCubemap` material function, GTA-lineage facades |

Family B is genuinely cheaper (1 fetch vs 4). But van Dongen measured the four fetches as *cheaper than* the single-texture alternative — one atlas plus the index arithmetic to address it was **slower**, because *"the extra instructions required to calculate which of the texture coordinates to use to read from the single texture are less efficient than just reading from four different textures."* And family A buys correct corners, which family B cannot provide at any price. On a 2026 GPU, 4 fetches is noise. **Use A. Keep B as the far-LOD variant**, where its single fetch and its corner error both stop mattering.

**The math — verbatim from `InteriorMapping.cg`** (the canonical `calculateFullyTexturedRoomsColour`):

```cg
	//get the vector from camera to surface
	float3 direction = position - cameraPosition;

	//calculate wall locations
	float3 walls = (floor(position * wallFrequencies) + step(float3(0, 0, 0), direction)) / wallFrequencies;

	//how much of the ray is needed to get from the cameraPosition to each of the walls
	float3 rayFractions = (float3(walls.x, walls.y, walls.z) - cameraPosition) / direction;

	//texture-coordinates of intersections
	float2 intersectionXY = 4 * (cameraPosition + rayFractions.z * direction).xy;
	float2 intersectionXZ = 4 * (cameraPosition + rayFractions.y * direction).xz;
	float2 intersectionZY = 4 * (cameraPosition + rayFractions.x * direction).zy;
```

Four things in there are load-bearing and easy to get wrong:

1. **`direction` is not normalised, deliberately.** The ray parameter then equals exactly `1.0` at the facade, so every valid interior hit satisfies `t > 1`. Free validity test, one fewer `normalize`.
2. **`floor(...) + step(0, direction)`** selects, branchlessly and for all three axes at once, the plane the ray is *heading toward*. `floor` gives the plane below; `step` adds one where the ray travels positively. This is the whole "only 3 of the 6 planes matter" optimisation.
3. **`t = (walls - cameraPosition) / direction`** — one `float3` divide performs all three ray-plane intersections.
4. **Texture coords are the hit point's other two components.** Plane `x = const` (a YZ plane) → swizzle `.zy`; plane `y = const` → `.xz`; plane `z = const` → `.xy`. The `4 *` is a hardcoded tiling scalar.

`wallFrequencies` is **rooms per object-space unit** — the reciprocal of room spacing. Set it from your grammar: `vec3(1/roomWidth, 1/floorHeight, 1/roomDepth)`, e.g. `(1/3.5, 1/3.05, 1/4.5)` for a tenement.

There is a provable invariant worth exploiting: the winning hit always lies in the **same lattice cell as the fragment**, so room-local `[0,1)` UVs come out for free — `(intersection - corner) * wallFrequencies`, the form van Dongen uses in his atlas variant.

**`wallFrequencies` must be non-integer. This is a real trap.** Every material in the original demo says `float3 7.99 7.99 7.99`, never `8.0`, and the reason is undocumented. It is this: **if the facade lies exactly on a lattice plane, `floor` returns the facade itself** and you sample a flat wall at the surface instead of the room behind it. On a unit cube at frequency `8.0`, roughly **44% of front-facing fragments degenerate**; at `7.99`, none do. Three equivalent fixes — pick one, but you must pick one:

```glsl
uWallFreq = vec3(7.99);                         // (1) non-integer frequency   <- van Dongen
vec3 corner = floor(pos * uWallFreq * 0.999);   // (2) shrink the lattice
rayStart += rayDir * 1e-4;                      // (3) push the ray start inward
```

**A complete GLSL port:**

```glsl
// ---------- vertex ----------
varying vec3 vObjPos;
varying vec2 vUv;
void main() {
  vObjPos = position;                 // object space, BEFORE modelMatrix
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

// ---------- fragment ----------
uniform vec3      uCamObj;            // camera position in OBJECT space
uniform vec3      uWallFreq;          // rooms per object unit; keep NON-INTEGER
uniform float     uTexScale;          // van Dongen's 4.0
uniform sampler2D uCeiling, uFloor, uWallXY, uWallZY;
uniform sampler2D uExterior;          // .a = window mask (1 = window, 0 = wall)
varying vec3 vObjPos;
varying vec2 vUv;

void main() {
  vec3 dir   = vObjPos - uCamObj;                                    // do NOT normalize
  vec3 walls = (floor(vObjPos * uWallFreq) + step(vec3(0.0), dir)) / uWallFreq;
  vec3 t     = (walls - uCamObj) / dir;                              // 3 ray-plane solves at once

  vec2 uvXY = uTexScale * (uCamObj + t.z * dir).xy;   // plane z = const
  vec2 uvXZ = uTexScale * (uCamObj + t.y * dir).xz;   // plane y = const (floor / ceiling)
  vec2 uvZY = uTexScale * (uCamObj + t.x * dir).zy;   // plane x = const

  vec4 vertC = mix(texture2D(uFloor, uvXZ), texture2D(uCeiling, uvXZ), step(0.0, dir.y));
  vec4 wXY   = texture2D(uWallXY, uvXY);
  vec4 wZY   = texture2D(uWallZY, uvZY);

  // nearest-hit select, branchless (min of the three t)
  float xVSz    = step(t.x, t.z);
  vec4  interior = mix(wXY, wZY, xVSz);
  float tXZ     = mix(t.z, t.x, xVSz);
  interior      = mix(vertC, interior, step(tXZ, t.y));

  vec4 ext = texture2D(uExterior, vUv);
  gl_FragColor = mix(ext, interior, ext.a);          // alpha channel IS the window mask
}
```

**Getting the object-space camera.** This is the only plumbing the technique needs:

```js
const inv = new THREE.Matrix4();
// per mesh, per frame:
inv.copy(mesh.matrixWorld).invert();
mesh.material.uniforms.uCamObj.value.copy(camera.position).applyMatrix4(inv);
```

**And here is the part that matters for our architecture.** "Object space" is per-object, so naively merging a whole block collapses every building onto one shared lattice, and rooms stop aligning with each building's own floor heights. Two clean solutions — you will want both:

- **Merged block shells and flat LOD facades:** don't use object space. Write **per-vertex lattice attributes** during block merge — you are generating the geometry, so you know each building's floor height and bay width. The lattice is then per-building even though the geometry is one buffer:

  ```glsl
  attribute vec3 aLatticeFreq;     // rooms per metre, per axis, for THIS building
  attribute vec3 aLatticeOrigin;   // this building's corner, in world space
  // ...
  vec3 pos   = vWorldPos - aLatticeOrigin;                 // building-local
  vec3 walls = (floor(pos * aLatticeFreq) + step(vec3(0.0), dir)) / aLatticeFreq;
  ```
  Cost: 24 bytes per vertex. Worth it — this is what makes interior mapping compatible with block-level merging, and it is the key enabling trick for this architecture.

- **Instanced window units:** the `position` attribute is already per-instance local space, so only the camera needs fixing. Reconstruct it in the vertex shader from `instanceMatrix` (rigid + non-uniform scale, so the inverse is a transposed normalised basis):

  ```glsl
  vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  mat3 Rt = transpose(mat3(instanceMatrix[0].xyz / sc.x,
                           instanceMatrix[1].xyz / sc.y,
                           instanceMatrix[2].xyz / sc.z));
  vec3 originWS = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vCamObj = (Rt * (cameraPosition - originWS)) / sc;
  ```
  The alternative — an instanced `vec3` attribute holding each instance's object-space camera position, refreshed on the CPU each frame — costs 12 bytes per instance and one `Vector3.applyMatrix4` per instance (~0.3 ms of JS for 6,000 windows). Prefer the shader version.

**Family B's math, for the far LOD** (verified to 1e-15 against a brute-force slab test). Box half-extents `e`, ray origin `pos` on the near face, tangent-space direction `v` pointing inward:

```glsl
vec3  id  = 1.0 / v;
vec3  k   = e * abs(id) - pos * id;
float t   = min(min(k.x, k.y), k.z);
vec3  hit = pos + t * v;
vec3  dir = hit / e;          // <- renormalise to the UNIT box, or the cubemap lands on the wrong face
```

The `/ e` is the step everyone omits. The cubemap must be captured **from the box centre**, since the exit point is used directly as a direction from that centre. A working three.js implementation of family B exists at [mohsenheydari/three-interior-mapping](https://github.com/mohsenheydari/three-interior-mapping) (MIT); its `sampleDir *= vec3(-1.,-1.,1.)` looks like a bug but is correct — it starts the ray on the far face with an outward direction and reflects through `z`, which is exactly the handedness flip a GL cubemap wants.

**Three.js integration — inject into `totalEmissiveRadiance`.** This is the clean hook. Emissive is added after direct+indirect lighting and *before* fog and tone mapping, which is exactly the right place for "light coming out of a room": it is not affected by the sun, it fogs correctly, it tone-maps correctly, and you keep the standard envmap specular for the glass on top.

```js
const glassMat = new THREE.MeshStandardMaterial({
  color: 0x0b0f14, metalness: 0.0, roughness: 0.05,
  envMapIntensity: 1.6, emissive: 0xffffff, emissiveIntensity: 1.0,
});

glassMat.userData.uniforms = {
  uCeiling:     { value: texCeiling },
  uFloorTex:    { value: texFloor },
  uWallXY:      { value: texWallXY },
  uWallZY:      { value: texWallZY },
  uWallFreq:    { value: new THREE.Vector3(1/3.47, 1/3.05, 1/4.53) },  // NON-integer spacing
  uInteriorLit: { value: 0.35 },     // daylight interior brightness
  uNightMix:    { value: 0.0 },      // 0 = day, 1 = night
  uLitFraction: { value: 0.45 },     // fraction of rooms lit at night
};

glassMat.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, glassMat.userData.uniforms);

  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', /* glsl */`
      #include <common>
      attribute vec4 aWinState;      // x=litSeed  y=roomId  z=depthJitter  w=blind
      varying vec3 vPosLocal;
      varying vec3 vEyeLocal;
      varying vec4 vWinState;
      varying vec3 vLocalScale;
    `)
    .replace('#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      vWinState = aWinState;
      vPosLocal = position;
      vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
      vLocalScale = sc;
      mat3 Rt = transpose(mat3(instanceMatrix[0].xyz / sc.x,
                               instanceMatrix[1].xyz / sc.y,
                               instanceMatrix[2].xyz / sc.z));
      vec3 originWS = (modelMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
      vEyeLocal = (Rt * (cameraPosition - originWS)) / sc;
    `);

  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', /* glsl */`
      #include <common>
      uniform sampler2D uCeiling, uFloorTex, uWallXY, uWallZY;
      uniform vec3  uWallFreq;
      uniform float uInteriorLit, uNightMix, uLitFraction;
      varying vec3 vPosLocal;
      varying vec3 vEyeLocal;
      varying vec4 vWinState;

      // pcg3d -- Jarzynski & Olano, "Hash Functions for GPU Rendering", JCGT 9(3) 2020.
      // 3 integers in, 3 independent randoms out: room type, lit state, curtain. One call.
      uvec3 pcg3d(uvec3 v) {
        v = v * 1664525u + 1013904223u;
        v.x += v.y*v.z; v.y += v.z*v.x; v.z += v.x*v.y;
        v ^= v >> 16u;
        v.x += v.y*v.z; v.y += v.z*v.x; v.z += v.x*v.y;
        return v;
      }
      vec3 hash3(vec3 cell) {
        return vec3(pcg3d(uvec3(ivec3(cell) + 4096))) * (1.0 / 4294967295.0);
      }

      vec3 interiorMapping() {
        vec3 dir = vPosLocal - vEyeLocal;               // NOT normalized: t == 1 at the facade

        // ---- cell id must be taken BEFORE the +step(), or windows flicker between two ids ----
        vec3 cell = floor(vPosLocal * uWallFreq);
        vec3 r    = hash3(cell);

        vec3 walls = (cell + step(vec3(0.0), dir)) / uWallFreq;
        vec3 t     = (walls - vEyeLocal) / dir;

        vec3 pXY = vEyeLocal + t.z * dir;
        vec3 pXZ = vEyeLocal + t.y * dir;
        vec3 pZY = vEyeLocal + t.x * dir;

        // room-local [0,1) UVs come free: the hit is always in the fragment's own cell
        vec2 uvXY = (pXY.xy - cell.xy / uWallFreq.xy) * uWallFreq.xy;
        vec2 uvXZ = (pXZ.xz - cell.xz / uWallFreq.xz) * uWallFreq.xz;
        vec2 uvZY = (pZY.zy - cell.zy / uWallFreq.zy) * uWallFreq.zy;

        // one-mix mirror trick: doubles apparent room variety for ~zero cost.
        // Do this before spending memory on more atlas cells.
        uvXY.x = mix(uvXY.x, 1.0 - uvXY.x, step(0.5, r.x));
        uvZY.x = mix(uvZY.x, 1.0 - uvZY.x, step(0.5, r.x));

        // 2x2 atlas index from the same hash
        vec2 atlas = floor(vec2(fract(r.x * 4.0) * 2.0, fract(r.x * 8.0) * 2.0)) * 0.5;

        vec4 vertC = mix(texture2D(uFloorTex, atlas + uvXZ * 0.5),
                         texture2D(uCeiling,  atlas + uvXZ * 0.5), step(0.0, dir.y));
        vec4 wXY   = texture2D(uWallXY, atlas + uvXY * 0.5);
        vec4 wZY   = texture2D(uWallZY, atlas + uvZY * 0.5);

        // nearest-hit select, branchless
        float xVSz = step(t.x, t.z);
        vec4  room = mix(wXY, wZY, xVSz);
        float tXZ  = mix(t.z, t.x, xVSz);
        room       = mix(vertC, room, step(tXZ, t.y));

        // ---- blinds / curtains: an opaque plane just behind the glass ----
        float blind = step(0.78, r.z);
        room.rgb = mix(room.rgb, vec3(0.55, 0.52, 0.46), blind);

        // ---- lit state; unlit sits at 30%, never black (van Dongen's *0.7+0.3) ----
        float on    = mix(1.0, step(r.y, uLitFraction) * 0.7 + 0.3, uNightMix);
        float level = mix(uInteriorLit, 2.2, uNightMix);
        vec3  lamp  = mix(vec3(1.0, 0.86, 0.62), vec3(0.75, 0.88, 1.0), step(0.8, fract(r.y * 13.0)));

        // fade out at grazing angles: kills the worst of the through-the-side-wall artefact
        float graze = smoothstep(0.05, 0.30, abs(dot(normalize(vNormal), normalize(vViewPosition))));

        return room.rgb * level * on * mix(vec3(1.0), lamp, uNightMix) * graze;
      }
    `)
    .replace('#include <emissivemap_fragment>', /* glsl */`
      #include <emissivemap_fragment>
      totalEmissiveRadiance += interiorMapping();
    `);
};
glassMat.customProgramCacheKey = () => 'interior-mapping-A-v1';
```

Notes that will save you hours:

- **`customProgramCacheKey` is mandatory.** Without it three.js may hand you a cached program from an unmodified `MeshStandardMaterial` and your injection silently does nothing.
- **`pcg3d`, not a `sin`-based hash.** The Jarzynski & Olano paper is explicit that trig hashes show *"visible banding, linear artifacts, and repeated patterns"* — and that banding aligns with the grid you are hashing, which is the worst possible case here. `pcg3d` is on their Pareto frontier for both 3→1 and N→N, is credited to Epic Games, and gives you three independent randoms in one call. It needs integer ops, so WebGL2/GLSL ES 3.0 (three emits this for `WebGLRenderer` on WebGL2; for a raw `ShaderMaterial` set `glslVersion: THREE.GLSL3`).
- **The interior must be linear-space.** Room textures loaded from PNG → `colorSpace = THREE.SRGBColorSpace`. Procedurally generated into a `DataTexture` → write linear values, leave `NoColorSpace`.
- **Do not write `gl_FragDepth`.** The fragment's depth is the facade's, which is *correct* — the building is solid and the virtual room has no real surface. Writing depth would disable early-Z and break the prepass trick below, costing far more than it buys. As a bonus, shadows, AO and depth fog all behave without any special handling.
- **A z-prepass gives a measured +44%.** This is in the original demo: material `IM_DiffuseCube_FullyTexturedRooms_EarlyZOut` renders a first pass with `colour_write off` and *no fragment program at all*, then the real pass. Van Dongen measured **881 → 1265 frames per 5 s**, because *"overdraw means that Interior Mapping is performed several times on the same pixel on the screen. With z-cull, this never occurs."* Note the asymmetry he also measured: a prepass makes *polygonised* interiors **slower**, because those are vertex-bound. So: prepass the interior-mapped glass, don't prepass everything. See §6.5.
- **Corners: family A already solves the part people worry about.** Because the lattice is shared, a room seen through the north facade and through the east facade *is the same room* — the floor, the desk and the walls continue seamlessly across the corner. Van Dongen frames this as the technique's advantage over block maps. What *does* break is (i) any facade-parallel furniture plane, which gets sliced, and (ii) geometry *"clip[ping] beyond building corners"* — the planes are infinite, so near a corner a ray can hit a virtual wall outside the building's real silhouette. His fix for both, and it is the right one: **avoid transparency in the exterior mask exactly at the corner.** *"This also makes sense from an architectural point of view: most buildings do not have windows that span the building's corners anyway."* Your grammar already puts a pilaster there (§1.2, `R.Floor`). Add the grazing-angle fade in the snippet above and you are done.
- **Texture resolution is essentially free.** He measured 256² → 64² → 16² interior textures at 999 → 1032 → 1053 frames per 5 s. **A 256× memory reduction bought 5% of performance.** So do not economise here — the detail visible inside the rooms is the whole point, and it costs nothing. Use 512² room textures without guilt.
- **Room count is free too.** 1,000 → 4,000,000 rooms per building: no measurable difference. The lattice is O(1).
- **Flat quads are fine.** Interior mapping needs no inset geometry — which is exactly why it is the right technique for LOD1/LOD2, where the reveals have been dropped. On *inset* geometry it is arguably more correct, because the reveal moves the fragment deeper in object space so the ray starts deeper and the parallax is right for free.
- **Varying room sizes**, if the uniform grid reads too regular. Van Dongen's trick: displace alternate wall indices by `frac(n/2) * displacementStrength` (0 for even `n`, 0.5 for odd) to get a deterministic wide/narrow alternation; `displacementStrengths = (0.3, 0.0, 0.3)`, horizontal only. Two candidate walls must then be tested per axis, because displacement can move a wall past the fragment — *"Because walls can never be displaced further than the size of a room, only two walls need to be checked."* Swap `frac(n/2)` for `hash3(n).x` to randomise it at the same cost.
- **One known artefact neither family escapes:** where the winning plane changes across a quad, the UV derivative is discontinuous, so hardware mip selection collapses to a coarse level along a 1–2 pixel seam. Fix with `textureGrad` and analytic gradients, or an explicit `textureLod`. Usually tolerable; visible at grazing angles.

**Cheaper LOD2/LOD3 variant — single-offset parallax, no plane test:**

```glsl
// ~6 ALU, one fetch. Good beyond ~150 m where the parallax error is sub-pixel.
vec2 pOff = vViewDirLocal.xy / max(0.15, -vViewDirLocal.z) * uRoomDepth;
vec3 room = texture2D(uFacadeAtlas, vCellUV + pOff * 0.5).rgb;
```

**Original-source fetch counts**, so you can budget precisely:

| Variant | Texture fetches |
|---|---|
| Ceiling only | 1 |
| Fully-textured rooms (interior only) | 4 |
| + exterior mask + cubemap reflection | 6 |
| + per-room light variation | 9 (3 were noise taps; `pcg3d` makes them 0) |
| + furniture plane, everything on | 10 |
| Family B, for comparison | 2 (1 cube + 1 exterior) |

The complete practical feature set — room grid, 4 authored interior textures, window mask, cubemap reflection, per-room lit/unlit randomisation — fit in **64 instructions on `ps_2_0`** in 2008. On this GPU shader complexity is simply not the constraint; overdraw is, which is what the z-prepass addresses.

### 2.4 (c) Emissive night windows with per-window random lit state

Two ways to get a stable per-window random. Use whichever matches your LOD:

**Instanced windows → per-instance attribute** (exact, already in the snippet above):

```js
const state = new Float32Array(n * 4);
for (let i = 0; i < n; i++) {
  const s = seedOf(buildingId, floorIdx, bayIdx);
  state[i*4+0] = (s & 0xffff) / 65535;       // lit seed
  state[i*4+1] = (s >>> 16) / 65535;         // room id
  state[i*4+2] = rng();                      // depth jitter
  state[i*4+3] = rng() < 0.22 ? 1.0 : 0.0;   // blinds down
}
geom.setAttribute('aWinState', new THREE.InstancedBufferAttribute(state, 4));
```

Note: `InstancedMesh` shares the geometry you hand it, so **clone the geometry per `InstancedMesh`** before adding instanced attributes, or every batch will share one attribute buffer.

**Flat textured facades (LOD2/LOD3) → `fract()` on world-scaled UVs.** This is the trick the 3DWorld procedural city uses, and it is the right one: derive UVs by scaling world-space position so windows align across triangle/quad seams, then split integer and fractional parts.

```glsl
// vFacadeUV is worldPos scaled so 1 unit == 1 window cell
vec2 cell  = floor(vFacadeUV);      // stable per-window index
vec2 inCell = fract(vFacadeUV);     // 0..1 inside the window

float h = hash22(cell + vBuildingSeed);
float litDensity = mix(0.10, 0.50, hash11(vBuildingSeed));  // per-building: 10%–50% lit
float on = step(1.0 - litDensity, h);

// window vs wall mask from the tiling window texture
float win = texture2D(uWindowMask, inCell).r;
if (win < 0.5) { /* wall */ }
totalEmissiveRadiance += uNight * on * win * lampTint(h);
```

Per-building lit density (rather than a global constant) is what makes a night skyline look real — some buildings are 15% lit, some are 90%.

**Do not `discard`** for unlit windows in the main pass — `discard` disables early-Z on many drivers and costs more than it saves. Multiply by zero instead. `discard` is fine in a dedicated additive night pass where there is no depth write.

**Bloom is what sells emissive.** Emissive values must exceed 1.0 in linear space for the bloom threshold to catch them. `emissiveIntensity` 2–4 for lit windows, `UnrealBloomPass` threshold ~0.85, strength 0.35–0.6, radius 0.4. Keep the composer's render target `HalfFloatType` (it is by default) or you clip the HDR and bloom dies.

**Extra credit, very cheap:** a handful of real `PointLight`s (≤ 8) placed at street level for shop windows and street lamps, plus fake light *spill* as a screen-space additive quad on the sidewalk. Do not try to light 500 windows with real lights.

### 2.5 (d) Glass: envmap + Fresnel

**Do not use `transmission`.** `MeshPhysicalMaterial.transmission` forces a transmission render pass (a resampled copy of the framebuffer per object) and is wildly out of budget for thousands of windows. Glass in an exterior city shot is a *reflector*, not a refractor.

```js
const glassMat = new THREE.MeshStandardMaterial({
  color: 0x0a0e12,          // dark tint; the reflection provides the brightness
  metalness: 0.0,
  roughness: 0.05,          // never 0 — see specular aliasing, §5.6
  envMapIntensity: 1.6,     // scene.environment does the work
  emissive: 0xffffff,       // carrier for the interior (§2.3)
  emissiveIntensity: 1.0,
  // no transparency at all if interior mapping is on: the interior IS the "see-through"
  transparent: false,
});
```

`MeshStandardMaterial` already applies a Fresnel-weighted `envMap` term (Schlick with F0 = 0.04 for dielectrics), so grazing-angle sheen is physically there. If you want the stylised, stronger sheen that reads as "AAA glass", boost it explicitly:

```js
// in onBeforeCompile, after lighting is resolved
.replace('#include <emissivemap_fragment>', `
  #include <emissivemap_fragment>
  float fres = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 5.0);
  totalEmissiveRadiance += interiorMapping() * (1.0 - fres * 0.9);   // interior fades out at grazing
  totalEmissiveRadiance += uSkyTint * fres * 0.35;                   // extra rim sheen
`)
```

Two details that matter more than the shader:

- **Per-window normal jitter.** Real single-pane glass is never flat — it ripples, and each pane sits slightly differently in its frame. Rotate each glass instance by ±0.4° on two axes. The reflection then *breaks up* across the facade instead of sweeping uniformly, which is the difference between "glass building" and "mirror box". Nearly free, enormous payoff.
- **Per-window tint jitter** via `instanceColor` (±5% value, slight hue spread toward green/blue). Real curtain walls have visible pane-to-pane variation.

```js
glass.rotation set per instance:
q.setFromEuler(new THREE.Euler((rng()-0.5)*0.014, (rng()-0.5)*0.014, 0));
```

- **Spandrel panels.** In curtain-wall typologies, roughly half the grid is opaque spandrel (the floor slab zone), not vision glass. Use the same instanced quad with `aWinState.w` flagging spandrel → skip interior mapping, raise roughness, darken. Getting the vision/spandrel rhythm right is most of what makes a modern tower read correctly.

### 2.6 Recommended combination per LOD

| LOD | Distance | (a) inset geo | (b) interior | (c) emissive | (d) glass | Tris/window | Notes |
|---|---|---|---|---|---|---|---|
| **L0** | 0–40 m | full: reveal+frame+sashes+muntins | cubemap box, full | per-instance attr | envmap + Fresnel + normal jitter | ~90 | 2 draw calls per block (opaque + glass) |
| **L1** | 40–120 m | reveal + frame ring only | cubemap box, orientation shuffle only | per-instance attr | envmap + Fresnel | ~26 | drop muntins/sashes first — they are the least visible and the most triangles |
| **L2** | 120–350 m | none — window is 2 tris in the merged facade | single-offset parallax into facade atlas | `fract()` hash | envmap on the whole facade | 2 | windows fold into the merged block geometry; zero extra draw calls |
| **L3** | 350 m+ | none | none | `fract()` hash on impostor atlas | none | 0 | one instanced quad per building |

Transition distances should be **hysteretic** (see `LOD.addLevel(obj, dist, hysteresis)`, §6.1) and **cross-faded** if you can — the L1→L2 pop is the one users notice, because that is where the recess disappears. Pushing L2 out to 150 m is usually worth the triangles.

---

## 3. Instancing strategy in three.js

### 3.1 The decision table

| Situation | Use | Why |
|---|---|---|
| Same geometry, > ~50 copies, same material | **`InstancedMesh`** | one draw call, geometry stored once, `setMatrixAt`/`setColorAt` |
| Same material, *different* geometries, static, never moves | **`mergeGeometries`** | one draw call, zero per-object overhead, best possible vertex locality |
| Same material, different geometries, need per-object visibility/culling/sorting | **`BatchedMesh`** | multi-draw with native per-object frustum culling |
| Same geometry, thousands of copies, need real per-instance culling + LOD | **`@three.ez/instanced-mesh` (`InstancedMesh2`)** | BVH culling, per-instance LOD, per-instance uniforms |
| < ~20 copies | plain `Mesh`, or merge into the block | instancing overhead isn't worth it |

A caveat worth knowing: **`InstancedMesh` is not automatically faster than `Mesh`.** There is a documented three.js issue (#30352) where 5000 instanced high-poly spheres were *slower* than 5000 meshes, because the bottleneck was vertex shading, not draw calls. Instancing removes CPU submission cost; it does nothing for GPU vertex cost. If you are instancing heavy geometry, you still need LOD.

### 3.2 The component library

Everything repeated in the city becomes an entry in a part registry. Target: **one geometry per part per LOD**, all sharing ≤ 6 materials.

```js
export const PARTS = {
  // ---- facade ----
  windowUnitOpaque: { lods: [90, 26], mat: 'trim'   },   // reveal+frame+sash
  windowGlass:      { lods: [2, 2],   mat: 'glass'  },
  sill:             { lods: [10, 4],  mat: 'stone'  },
  lintel:           { lods: [12, 4],  mat: 'stone'  },
  corniceBracket:   { lods: [34, 0],  mat: 'stone'  },   // LOD1 = gone, baked to normal map
  corniceRun:       { lods: [24, 12], mat: 'stone'  },
  pilasterCap:      { lods: [40, 0],  mat: 'stone'  },
  doorSurround:     { lods: [60, 12], mat: 'stone'  },
  stoop:            { lods: [120, 30],mat: 'stone'  },
  areawayRail:      { lods: [80, 2],  mat: 'metal'  },   // LOD1 = alpha-tested quad

  // ---- fire escape (the NYC tell) ----
  feLanding:        { lods: [48, 12], mat: 'metal'  },
  feRailSection:    { lods: [96, 2],  mat: 'metal'  },   // LOD1 = one alpha-tested quad
  feStairFlight:    { lods: [84, 8],  mat: 'metal'  },
  feDropLadder:     { lods: [40, 2],  mat: 'metal'  },

  // ---- roof ----
  waterTankStaved:  { lods: [180, 40],mat: 'wood'   },
  waterTankFrame:   { lods: [200, 24],mat: 'metal'  },
  waterTankRoof:    { lods: [32, 12], mat: 'wood'   },
  roofBulkhead:     { lods: [40, 12], mat: 'brick'  },
  parapetCap:       { lods: [8, 4],   mat: 'stone'  },
  hvacBox:          { lods: [36, 12], mat: 'metal'  },
  ventPipe:         { lods: [24, 6],  mat: 'metal'  },
  satDish:          { lods: [48, 0],  mat: 'metal'  },
  chimneyPot:       { lods: [28, 8],  mat: 'brick'  },

  // ---- street ----
  acUnitWindow:     { lods: [40, 10], mat: 'metal'  },
  awning:           { lods: [16, 8],  mat: 'fabric' },
  rollDownGate:     { lods: [8, 4],   mat: 'metal'  },
  sidewalkShedPost: { lods: [24, 8],  mat: 'metal'  },
  sidewalkShedDeck: { lods: [12, 6],  mat: 'wood'   },
  streetLamp:       { lods: [90, 12], mat: 'metal'  },
  hydrant:          { lods: [70, 10], mat: 'metal'  },
  standpipe:        { lods: [30, 8],  mat: 'metal'  },
};
```

Two authoring rules that pay for themselves:

1. **Author every part in a normalised local space** so instance scale can adapt it (window units in a unit opening; cornice runs 1 m long scaled to the facade width). This collapses part count dramatically.
2. **Railings and grilles become alpha-tested quads at LOD1.** A fire-escape railing is ~96 triangles of balusters; the LOD1 version is 2 triangles with an alpha-tested texture and is indistinguishable past 30 m. Across 30 buildings × 6 floors this is the difference between 100k and 2k triangles. This is the highest-leverage LOD decision in the whole component library.

### 3.3 Per-instance data

**`instanceColor` — the free one.** `itemSize` 3, `null` until you call `setColorAt`, at which point three defines `USE_INSTANCING_COLOR` and multiplies it into diffuse.

```js
mesh.setColorAt(i, color);            // creates instanceColor lazily
mesh.instanceColor.needsUpdate = true;
```

Colour-management gotcha: with `ColorManagement` enabled (default since r152), `THREE.Color` holds **linear-sRGB working values**. So build your colours as `new THREE.Color().setHex(0xb0654a, THREE.SRGBColorSpace)` (or `setStyle`, which assumes sRGB) — never assign raw sRGB floats to `.r/.g/.b`, or your bricks will come out washed out.

Use `instanceColor` for: brick/stone tint per building, glass tint per pane, paint colour per fire escape, dirt amount packed into one channel if you can spare it.

**Custom per-instance attributes — for everything else.** Add `InstancedBufferAttribute` to the geometry. Remember to clone geometry per batch:

```js
function makeBatch(baseGeom, material, n, attrs) {
  const geom = baseGeom.clone();                     // MUST clone — attributes are per-geometry
  for (const [name, {array, itemSize}] of Object.entries(attrs))
    geom.setAttribute(name, new THREE.InstancedBufferAttribute(array, itemSize));
  const im = new THREE.InstancedMesh(geom, material, n);
  im.instanceMatrix.setUsage(THREE.StaticDrawUsage); // static city -> tell the driver
  im.frustumCulled = true;
  return im;
}
```

Then declare it in `onBeforeCompile` (see §2.3). Attribute budget: WebGL2 guarantees 16 vertex attributes. `InstancedMesh` already consumes 4 for `instanceMatrix` (+1 for `instanceColor`), and `MeshStandardMaterial` uses position/normal/uv/tangent. **You have room for about 3–4 `vec4` custom attributes.** Pack aggressively — one `vec4` of normalised floats holds four parameters; a single float can hold two 16-bit fields.

**Alternatives worth knowing:** `troika`'s `InstancedUniformsMesh` (`setUniformAt(name, i, value)`) turns any material uniform into a per-instance attribute automatically; `@three.ez/instanced-mesh` has `initUniformsPerInstance({fragment:{roughness:'float', emissive:'vec3'}})` + `setUniformAt`. Both are good if you want per-instance PBR params without writing chunk injections.

### 3.4 Merging static geometry

```js
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
const merged = BufferGeometryUtils.mergeGeometries(geometries, /* useGroups = */ false);
```

Hard requirements (the function returns `null` and logs an error otherwise):

- **Every geometry must have exactly the same attribute set.** If one has `tangent` and another doesn't, it fails. Normalise your builders.
- **All indexed, or none indexed.** Mixed fails.
- `useGroups: true` produces one group per input geometry → **one draw call per group**, which defeats the purpose. Only use it when you genuinely need a material array. For batching, `false`.

Practical merge workflow per city block:

```js
function buildBlock(block) {
  const byMat = new Map();
  for (const b of block.buildings)
    for (const panel of b.panels) {
      const g = panelToGeometry(panel);                 // already in world space
      applyVertexAO(g, block.occluders);                // §4.6 — do it here, you know the neighbours
      (byMat.get(panel.matId) ?? byMat.set(panel.matId, []).get(panel.matId)).push(g);
    }
  const meshes = [];
  for (const [matId, geoms] of byMat) {
    const merged = BufferGeometryUtils.mergeGeometries(geoms, false);
    merged.computeBoundingSphere();                     // needed for block-level frustum culling
    geoms.forEach(g => g.dispose());                    // free the intermediates!
    meshes.push(new THREE.Mesh(merged, MATERIALS[matId]));
  }
  return meshes;
}
```

**Tradeoffs, stated plainly:**

| | `InstancedMesh` | `mergeGeometries` |
|---|---|---|
| Draw calls | 1 per (part × batch) | 1 per (material × batch) |
| GPU memory | geometry once + 64 B/instance | full geometry per copy |
| Per-object culling | no (one bounding sphere for all) | no (one bounding sphere for all) |
| Can move objects | yes, `setMatrixAt` | no (rebuild) |
| Build cost | trivial | real: allocation + copy, do it in a worker |
| Vertex cost | same | slightly better (no instance matrix fetch/multiply) |
| Right for | repeated parts: windows, brackets, water towers | unique-per-building geometry: walls, roofs, punched panels |

The split is clean: **walls and roofs merge, components instance.** Walls are unique per building anyway (the grammar punched unique holes in them), so instancing buys nothing; components are identical thousands of times, so merging would waste hundreds of MB.

### 3.5 `BatchedMesh`

`BatchedMesh` (r156+, API settled by r166) is the interesting middle ground: **different geometries, one material, one draw call, and native per-object frustum culling.**

```js
const bm = new THREE.BatchedMesh(maxInstanceCount, maxVertexCount, maxIndexCount, material);
const gid = bm.addGeometry(geometry);      // returns geometryId
const iid = bm.addInstance(gid);           // returns instanceId  (required since r166)
bm.setMatrixAt(iid, matrix);
bm.setColorAt(iid, color);                 // Color or Vector4
bm.setVisibleAt(iid, true);
bm.setGeometryIdAt(iid, gid2);             // swap geometry per instance — this is your LOD hook
bm.perObjectFrustumCulled = true;          // default
bm.sortObjects = true;                     // default; front-to-back for opaque
bm.optimize();                             // repack after deletions
```

Why it is attractive here: `setGeometryIdAt` means **per-instance LOD switching inside a single draw call**, and `perObjectFrustumCulled` gives you the per-object culling `InstancedMesh` lacks. A `BatchedMesh` holding all 120 building shells with 2 LOD geometries each would be one draw call for the entire city shell, self-culling and self-LODing.

Why to be careful: it relies on **`WEBGL_multi_draw`, which Firefox does not support** (three falls back, losing the sorting/culling benefit). It requires pre-declaring max vertex/index counts. And it is one material for the whole batch, so you must fold brick/stone/concrete into a single material with an array texture or atlas.

**Recommendation:** ship the `merge` + `InstancedMesh` architecture first (works everywhere, zero deps). Treat `BatchedMesh` as a well-defined upgrade for the shell layer once you have a profile showing block-level culling granularity is the problem.

### 3.6 Concrete budget targets

For the 12-block / ~120-building scene (full derivation in §8.2):

| Pass | Draw calls | Triangles |
|---|---|---|
| Opaque shells (merged, per block × material) | 10–24 | 300k |
| Instanced components (per block × part, culled) | 60–90 | 450k |
| Glass (per block) | 6–12 | 30k |
| Ground / roads / sidewalk / street furniture | 6–10 | 120k |
| Distant impostors | 1–2 | < 1k |
| Sky | 1 | 2 |
| **Main pass total** | **85–140** | **~0.9–1.2 M** |
| Shadow pass (2 cascades, shells + big parts only) | 80–120 | 1.0–1.5 M |
| AO G-buffer (only if `GTAOPass`; N8AO avoids this) | +90–140 | +0.9 M |
| Post fullscreen quads | 5–8 | 16 |
| **Frame total (N8AO)** | **~180–270** | **~2.0–2.7 M** |

Both well inside the safe budget from §0.2, with roughly 2× headroom to double detail.

---

## 4. Textures

### 4.1 Procedural brick on a canvas

Canvas 2D is the right tool: it is fast, it runs at load time, and it composites in gamma space which is what you want for hand-authored albedo. Generate **height first**, then derive albedo, normal, roughness and AO from it — that keeps everything consistent.

Make the tile an exact whole number of modules so it wraps. With `stretcherModule = 0.2035 m` and `courseHeight = 0.0665 m`, a 1024² tile at **8 bricks × 24 courses** covers 1.628 m × 1.596 m ≈ **629 px/m** — plenty for a 0.5 m-from-the-wall shot.

```js
const BOND = {
  running:  (row) => [0.5 * (row % 2), 1],                 // offset, headerEvery
  common:   (row) => [0.5 * (row % 2), (row % 6 === 5) ? 0 : 1],  // header course every 6th
  english:  (row) => (row % 2 ? [0.25, 0] : [0, 1]),
  flemish:  (row) => [0.5 * (row % 2), -1],                // alternating stretcher/header in-course
  stack:    () => [0, 1],
};

function brickMaps({
  size = 1024, bricksX = 8, courses = 24, bond = 'running',
  base = { h: 12, s: 0.45, l: 0.42 },        // HSL of the brick body (NYC red 8–18 deg)
  mortar = '#b9b3a6', jointPx = null,
  darkChance = 0.09, lightChance = 0.06, jitter = { h: 6, s: 0.14, l: 0.10 },
  seed = 1,
} = {}) {
  const rng = rngFor(seed);
  const bw = size / bricksX, bh = size / courses;
  const joint = jointPx ?? Math.max(2, Math.round(bh * 0.0095 / NYC.courseHeight));

  // ---------- HEIGHT ----------
  const hc = document.createElement('canvas'); hc.width = hc.height = size;
  const h = hc.getContext('2d', { willReadFrequently: true });
  h.fillStyle = '#3a3a3a'; h.fillRect(0, 0, size, size);      // mortar = recessed

  // ---------- ALBEDO ----------
  const ac = document.createElement('canvas'); ac.width = ac.height = size;
  const a = ac.getContext('2d');
  a.fillStyle = mortar; a.fillRect(0, 0, size, size);

  const drawBrick = (x, y, w, hgt, lum) => {
    // albedo
    const cl = { ...base };
    cl.h += (rng() - 0.5) * 2 * jitter.h;
    cl.s += (rng() - 0.5) * 2 * jitter.s;
    cl.l += (rng() - 0.5) * 2 * jitter.l;
    const r = rng();
    if (r < darkChance)                    { cl.l *= 0.55; cl.s *= 0.8; }   // burnt / clinker
    else if (r < darkChance + lightChance) { cl.l *= 1.30; cl.s *= 0.7; }   // salmon / underfired
    a.fillStyle = `hsl(${cl.h} ${cl.s*100}% ${cl.l*100}%)`;
    a.fillRect(x + joint*0.5, y + joint*0.5, w - joint, hgt - joint);

    // per-brick grain: a few low-alpha specks, and a subtle vertical gradient
    a.save(); a.beginPath();
    a.rect(x + joint*0.5, y + joint*0.5, w - joint, hgt - joint); a.clip();
    for (let k = 0; k < 26; k++) {
      a.fillStyle = `rgba(${rng()<0.5?0:255},${rng()<0.5?0:255},${rng()<0.5?0:255},${0.02 + rng()*0.05})`;
      a.fillRect(x + rng()*w, y + rng()*hgt, 1 + rng()*4, 1 + rng()*3);
    }
    const g = a.createLinearGradient(0, y, 0, y + hgt);
    g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.07)');
    a.fillStyle = g; a.fillRect(x, y, w, hgt);
    a.restore();

    // height: brick face raised, slight per-brick variation (some proud, some recessed)
    const v = Math.round(190 + lum * 40 + (rng() - 0.5) * 26);
    h.fillStyle = `rgb(${v},${v},${v})`;
    h.fillRect(x + joint*0.5, y + joint*0.5, w - joint, hgt - joint);
  };

  for (let row = 0; row < courses; row++) {
    const y = row * bh;
    const [offset, headerEvery] = BOND[bond](row);
    const isHeaderCourse = headerEvery === 0;
    const w = isHeaderCourse ? bw * 0.5 : bw;
    const n = Math.ceil(size / w) + 2;
    for (let i = -1; i < n; i++) {
      let x = (i + offset) * w;
      let ww = w;
      if (headerEvery === -1 && i % 2 === 1) ww = w * 0.5;   // flemish
      // draw, then wrap-draw so the tile seams correctly
      drawBrick(x, y, ww, bh, rng());
      if (x + ww > size)  drawBrick(x - size, y, ww, bh, rng());
      if (x < 0)          drawBrick(x + size, y, ww, bh, rng());
    }
  }

  const albedo = new THREE.CanvasTexture(ac);
  albedo.colorSpace = THREE.SRGBColorSpace;                 // canvas RGB is sRGB-encoded
  const { normal, roughness, ao } = derivedMaps(h, size);   // §4.2
  for (const t of [albedo, normal, roughness, ao]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = MAX_ANISO;                               // §4.5
    t.needsUpdate = true;
  }
  return { albedo, normal, roughness, ao, metersPerTile: bricksX * NYC.stretcherModule };
}
```

Variants you get almost free by changing `base`/`bond`: NYC red common brick (`h:12,s:.45,l:.42`, running), yellow/buff Kreischer brick (`h:38,s:.30,l:.62`), brown ironspot (`h:20,s:.28,l:.30`), painted-over brick (low saturation + high lightness + reduce jitter), whitewashed (`l:.82, s:.05`), and glazed white terracotta.

For **limestone / cast stone**, replace the brick loop with large ashlar blocks (0.6–1.2 m) and much lower colour jitter; for **terracotta**, add a subtle gloss by lowering the roughness map.

### 4.2 Normal / roughness / AO from the canvas heightmap

Sobel on the height canvas. **Two sign conventions will bite you:**

1. Canvas `y` increases **downward**; tangent-space normal maps are **+Y up** (OpenGL convention, which is what three.js expects). You must negate the y gradient.
2. Sample with wraparound so the derived maps tile as well as the source.

```js
function derivedMaps(hctx, size, strength = 2.2) {
  const src = hctx.getImageData(0, 0, size, size).data;
  const H = (x, y) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;

  const nrm = new Uint8Array(size * size * 4);
  const rgh = new Uint8Array(size * size * 4);
  const aoc = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // Sobel
    const dx = (H(x+1,y-1) + 2*H(x+1,y) + H(x+1,y+1)) - (H(x-1,y-1) + 2*H(x-1,y) + H(x-1,y+1));
    const dy = (H(x-1,y+1) + 2*H(x,y+1) + H(x+1,y+1)) - (H(x-1,y-1) + 2*H(x,y-1) + H(x+1,y-1));

    let nx = -dx * strength, ny = dy * strength, nz = 1.0;   // note: +dy because canvas y is flipped
    const inv = 1 / Math.hypot(nx, ny, nz);
    nx *= inv; ny *= inv; nz *= inv;

    const i = (y * size + x) * 4;
    nrm[i]   = (nx * 0.5 + 0.5) * 255;
    nrm[i+1] = (ny * 0.5 + 0.5) * 255;
    nrm[i+2] = (nz * 0.5 + 0.5) * 255;
    nrm[i+3] = 255;

    // roughness: mortar (low height) is rougher than fired brick face
    const hh = H(x, y);
    const r = THREE.MathUtils.lerp(0.95, 0.62, THREE.MathUtils.smoothstep(hh, 0.45, 0.85));
    rgh[i] = rgh[i+1] = rgh[i+2] = r * 255; rgh[i+3] = 255;

    // cheap cavity AO: how much lower am I than my neighbourhood?
    let sum = 0, N = 0;
    for (let oy = -3; oy <= 3; oy += 2) for (let ox = -3; ox <= 3; ox += 2) { sum += H(x+ox, y+oy); N++; }
    const cav = THREE.MathUtils.clamp(1.0 - (sum / N - hh) * 3.0, 0.35, 1.0);
    aoc[i] = aoc[i+1] = aoc[i+2] = cav * 255; aoc[i+3] = 255;
  }

  const mk = (buf) => {
    const t = new THREE.DataTexture(buf, size, size, THREE.RGBAFormat);
    t.colorSpace = THREE.NoColorSpace;     // NEVER sRGB for data maps
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  };
  return { normal: mk(nrm), roughness: mk(rgh), ao: mk(aoc) };
}
```

Wire it up, noting three.js's channel packing conventions:

```js
const brickMat = new THREE.MeshStandardMaterial({
  map: albedo, normalMap: normal, roughnessMap: roughness, aoMap: ao,
  normalScale: new THREE.Vector2(1, 1),
  roughness: 1.0, metalness: 0.0,   // multiplied by the maps
});
// aoMap uses the uv channel selected by aoMap.channel (0 = 'uv', 1 = 'uv1').
// Since r151 the attribute formerly called uv2 is 'uv1'. Default channel is 0,
// which is what you want when AO comes from the same tiling texture.
brickMat.aoMap.channel = 0;
```

Do this generation **once per material variant at load**, in an `OffscreenCanvas` inside a worker if it stalls, and cache. Twelve brick variants at 1024² is ~48 MB of RGBA per map type — see §4.4 for keeping that in budget.

### 4.3 Atlases, and why a texture array is better in WebGL2

The trim-sheet idea from game facade kits is the right one, but the naive "put tiling brick in an atlas" fails: you cannot use `RepeatWrapping` on an atlas tile, and doing the repeat in-shader with `fract()` creates a **derivative discontinuity** at the wrap line, which makes the GPU pick mip level 0 and produces a visible seam.

Three workable approaches, in order of preference:

**1. `DataArrayTexture` / `CompressedArrayTexture` (`sampler2DArray`) — the WebGL2 answer.** Each tiling material is a layer. Real `RepeatWrapping` per layer, correct mips, no bleeding, one texture bind for 16 brick/stone variants, and the layer index can come from a per-instance attribute or vertex attribute.

```js
const N = 16, S = 1024;
const data = new Uint8Array(S * S * 4 * N);
variants.forEach((v, i) => data.set(v.rgba, i * S * S * 4));
const arr = new THREE.DataArrayTexture(data, S, S, N);
arr.format = THREE.RGBAFormat;
arr.colorSpace = THREE.SRGBColorSpace;
arr.wrapS = arr.wrapT = THREE.RepeatWrapping;
arr.generateMipmaps = true;
arr.minFilter = THREE.LinearMipmapLinearFilter;
arr.needsUpdate = true;
```

No built-in material supports it, so inject:

```glsl
// declarations
uniform sampler2DArray uFacadeArray;
attribute float aLayer;        // per-instance or per-vertex
varying float vLayer;
// fragment, replacing #include <map_fragment>
vec4 sampledDiffuseColor = texture(uFacadeArray, vec3(vMapUv, vLayer));
diffuseColor *= sampledDiffuseColor;
```

Requires GLSL ES 3.0, which three.js emits for WebGL2 — `texture()` not `texture2D()`, and use `THREE.GLSL3` if writing a raw `ShaderMaterial`.

**2. Classic 2D atlas for *non-tiling* content.** Trim profiles, mouldings, signage, decals, alpha-tested railings, impostor frames — anything sampled once with clamped UVs. Use 2048² with 8–16 px gutters and edge-extended borders so mip levels don't bleed. This is where a real trim sheet lives, and it collapses your entire ornament library to one bind.

**3. Channel-packing.** Roughness/metalness/AO in R/G/B of one texture (`ORM`). three.js reads `aoMap` from `.r`, `roughnessMap` from `.g`, `metalnessMap` from `.b`, so **one texture can serve all three** by assigning the same texture to all three slots. Immediate 3× reduction in binds and memory.

```js
mat.aoMap = mat.roughnessMap = mat.metalnessMap = ormTexture;   // r=AO, g=rough, b=metal
```

**Compression.** `KTX2Loader` + Basis Universal transcodes to a GPU-native format (BC7/BC5 on desktop) and **stays compressed in VRAM**, typically 4–8× smaller than the decoded RGBA. A 2048² RGBA8 costs **16 MB + ~5 MB mips ≈ 21 MB uncompressed**; the same as BC7 is ~5.5 MB. For a procedural generator this is awkward — you generate at runtime, so there is nothing to pre-compress. Pragmatic split: **generate tiling materials procedurally** (they are few and small: 12 variants × 1024² × 3 maps ≈ 150 MB, which fits), and **ship the trim/decal/impostor atlases as pre-baked KTX2** (they are large and static). If VRAM gets tight, drop procedural tiles to 512² — at 629 px/m a 512² tile is still 315 px/m, which is fine beyond 2 m.

### 4.4 sRGB / colour-management workflow (three r152+)

The rules, and the version each landed:

| Setting | Value | Since |
|---|---|---|
| `THREE.ColorManagement.enabled` | `true` (default) | r152 |
| `renderer.outputColorSpace` | `THREE.SRGBColorSpace` (default) — replaced `outputEncoding` | r152 |
| `Texture.colorSpace` — replaced `Texture.encoding` | see below | r152 |
| `renderer.useLegacyLights` | `false` by default and deprecated (lights are physically-scaled) — replaced `physicallyCorrectLights` | r150 → r155 |
| `uv2` attribute renamed `uv1`; `aoMap`/`lightMap` use `.channel` instead of `uv2` | | r151 |

**Which textures get which colour space** — get this wrong and everything looks slightly plastic:

| Map | `colorSpace` |
|---|---|
| `map` (albedo/diffuse) | `SRGBColorSpace` |
| `emissiveMap` | `SRGBColorSpace` |
| `specularColorMap`, `sheenColorMap` | `SRGBColorSpace` |
| `normalMap`, `roughnessMap`, `metalnessMap`, `aoMap`, `displacementMap`, `alphaMap`, `bumpMap`, `lightMap` (as data) | `NoColorSpace` |
| environment map from `PMREMGenerator` | handled for you — don't touch |

Specific to canvas generation: a `CanvasTexture` whose canvas you painted with CSS colours contains **sRGB-encoded** bytes → set `SRGBColorSpace` if it is albedo. A `DataTexture` you filled with computed normals/roughness contains **raw data** → `NoColorSpace`. The `derivedMaps` function above does exactly that.

One more: `THREE.Color` in working space. `new THREE.Color(0xb0654a)` and `.setStyle('#b0654a')` **assume sRGB and convert**; assigning `.r = 0.69` does **not**. Use `setHex(hex, THREE.SRGBColorSpace)` explicitly when in doubt.

### 4.5 Anisotropy and the aliasing problem

Facades are the pathological case for texture filtering: you look along them at extreme grazing angles, and they carry a high-frequency regular grid (bricks, mullions, windows). Both isotropic mip filtering and moiré will destroy the image.

```js
export const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();   // 16 on desktop NVIDIA
tex.anisotropy = Math.min(8, MAX_ANISO);      // 8 is the sweet spot; 16 for hero facades only
tex.generateMipmaps = true;
tex.minFilter = THREE.LinearMipmapLinearFilter;   // trilinear, the default
tex.magFilter = THREE.LinearFilter;
```

Anisotropic filtering costs texture bandwidth (up to N× the taps) but you have bandwidth to spare (§0.1). **This is one of the cheapest large visual wins available** — a brick facade at 8× aniso versus 1× is night and day at street level.

Also, and this is often missed: **clamp minimum roughness and grow roughness with mip level.** Specular aliasing on a distant window grid produces exactly the shimmering that makes WebGL look cheap.

```glsl
// in onBeforeCompile, after roughnessmap_fragment
roughnessFactor = max(roughnessFactor, 0.045);
// crude specular-antialiasing: widen the lobe where the normal varies fast
vec3 dNx = dFdx(normal), dNy = dFdy(normal);
float variance = 0.25 * (dot(dNx, dNx) + dot(dNy, dNy));
roughnessFactor = sqrt(saturate(roughnessFactor*roughnessFactor + min(2.0*variance, 0.25)));
```

### 4.6 Grime, weathering and baked AO — the cheap realism layer

Real facades are dirty in *structured* ways. Four effects, in payoff order, all nearly free.

**1. Vertex AO baked at block-merge time.** You are generating the geometry, so you know the occluders analytically. No raytracing needed — sum a handful of terms into the `color` attribute:

```js
function applyVertexAO(geom, ctx) {
  const pos = geom.attributes.position, nrm = geom.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3(), n = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nrm, i);
    let ao = 1.0;

    // (a) ground contact + street splash: strong, short falloff
    ao *= 1.0 - 0.55 * Math.exp(-p.y / 1.2);

    // (b) under overhangs (cornices, sills, setback soffits): find nearest overhang above
    const over = ctx.overhangAbove(p);            // {dist, projection} or null
    if (over) ao *= 1.0 - 0.60 * Math.exp(-over.dist / (over.projection * 1.8));

    // (c) concave corners between wall planes (light wells, setback returns, party walls)
    ao *= 1.0 - 0.45 * ctx.cornerProximity(p, n); // 0..1, from a 2D distance field of the block

    // (d) urban canyon: narrow streets and light wells are darker at the bottom
    ao *= THREE.MathUtils.lerp(0.72, 1.0, THREE.MathUtils.smoothstep(ctx.skyView(p, n), 0.0, 0.55));

    // (e) upward faces collect dirt; downward faces stay clean but dark
    ao *= 1.0 - 0.12 * Math.max(0, n.y);

    col[i*3] = col[i*3+1] = col[i*3+2] = THREE.MathUtils.clamp(ao, 0.18, 1.0);
  }
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
// material: vertexColors: true   -> multiplied into diffuse
```

This one function is responsible for an enormous fraction of "looks grounded" versus "looks like it is floating on a plane". It costs zero at runtime and it works on hardware where you cannot afford SSAO. **Do this before you reach for a screen-space AO pass.**

Caveat: vertex AO resolution == vertex density. Your punched wall panels are tessellated around openings (§2.2), so you get vertices exactly where you need them. Consider one extra subdivision of large blank wall panels (a 4×4 grid) purely to carry AO gradients.

**2. Soot streaks below sills and ledges.** Water runs off a sill, carries dirt, and deposits it in vertical streaks 0.3–1.5 m long. Implement as a **screen-independent detail layer** multiplied into albedo, driven by distance below the nearest ledge:

```glsl
// vStreak.x = normalised distance below the nearest ledge (0 at the ledge, 1 at fadeout)
//             computed per-vertex at merge time -> another packed attribute
// vStreak.y = ledge "wetness" weight (sills 1.0, cornices 0.7, string courses 0.4)
float streakNoise = texture2D(uStreakTex, vec2(vWorldPos.xz * 1.7 + vWorldPos.y * 0.02)).r;
float streak = (1.0 - vStreak.x) * vStreak.y * streakNoise;
diffuseColor.rgb *= mix(vec3(1.0), vec3(0.42, 0.40, 0.37), streak * 0.85);
roughnessFactor = mix(roughnessFactor, 0.95, streak * 0.6);
```

`uStreakTex` is a 256×1024 texture of vertical smears — generate it on canvas with ~200 tapered vertical gradient strips of random width and alpha. Stretch it 1:20 so the streaks are long and thin.

**3. Rain-streak / weathering gradient on the whole facade.** A very low-frequency vertical noise multiplied into albedo and roughness, plus the classic "top of the building is bleached, bottom is filthy" gradient. Two lines, works on every typology.

**4. Contact darkening on the ground.** Separately from AO: put a soft dark quad on the sidewalk at each building's footprint (an alpha-blended radial-gradient decal, all instanced into one draw call). This fakes the contact shadow that a 2048² city-wide shadow map cannot resolve, and it is the trick that makes buildings sit on the ground rather than intersect it.

Also worth it, in decreasing order: **efflorescence** (white salt bloom near the base, additive white noise masked to low Y), **paint ghosting** (faded old signage on party walls — a decal, and *extremely* NYC), **replaced-brick patches** (rectangular regions of different tint — do it in the brick generator by picking a few random rects and shifting hue), and **AC-unit rust streaks** below every window AC.

**Decals.** three.js ships `DecalGeometry` (`three/addons/geometries/DecalGeometry.js`), which clips a box against target geometry to produce a projected mesh. It works, with two documented limits: it distorts around corners, and it **fails when a target triangle is larger than the projection volume with no vertices inside** — which is exactly the case for a big flat wall panel. So either subdivide wall panels (you should anyway, for vertex AO) or do decals as **shader-space projections** driven by world position, which is cheaper and has no such failure mode. For a procedural generator, generating "decals" as instanced quads offset 5 mm off the wall (polygon-offset via `material.polygonOffset`) and merged into the block is simpler and faster than `DecalGeometry`.

---

## 5. Lighting and atmosphere: what makes WebGL look AAA

This section has the best payoff-per-line-of-code in the entire document. A flat-looking three.js city and a photoreal one often differ by about 25 lines of renderer configuration.

### 5.1 The five things that separate "AAA" from "flat"

Ranked. If you do nothing else in this section, do 1–3.

1. **HDR environment lighting instead of `AmbientLight`.** `AmbientLight` adds a constant to every surface — it is the single biggest cause of the flat, chalky "three.js look". An IBL from a physical sky gives you direction-dependent ambient: sky-blue from above, warm bounce from below, correct specular reflections. This one change transforms a scene.
2. **Filmic tone mapping on an HDR pipeline.** Without it, every bright surface clips to flat white and every shadow crushes to flat black. `ACESFilmicToneMapping` + a `HalfFloat` framebuffer.
3. **Correct colour management.** `outputColorSpace = SRGBColorSpace` and per-texture `colorSpace` (§4.4). Getting this wrong makes everything look washed out and plasticky, and no amount of shader work recovers it.
4. **One strong, low-angle directional light with well-tuned shadows.** Form is read from shadow. High-noon light with weak shadows is what makes renders look like architectural clip-art.
5. **Atmospheric depth.** Fog/aerial perspective is what tells the eye a city is kilometres deep rather than a model on a table.

### 5.2 Renderer configuration (copy this)

```js
const renderer = new THREE.WebGLRenderer({
  antialias: false,              // we do MSAA on the composer target instead — see §5.7
  powerPreference: 'high-performance',
  stencil: false,                // saves bandwidth; we don't need it
  depth: true,
  logarithmicDepthBuffer: false, // costs perf; use a sane near/far instead
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));  // cap! 2.0 on a 1080p laptop = 4x the pixels
renderer.setSize(innerWidth, innerHeight);

// --- colour + tone (r152+) ---
renderer.outputColorSpace = THREE.SRGBColorSpace;   // default, but be explicit
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// --- shadows ---
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;       // see note below
renderer.shadowMap.autoUpdate = false;              // static city: render shadows once, then on demand

// near/far discipline: this is a depth-precision decision, not a taste one
camera.near = 0.5;    // 0.5 m — you are a person on a street
camera.far  = 3000;   // 3 km covers Manhattan; ratio 6000:1 is fine for a 24-bit depth buffer
```

`PCFSoftShadowMap` is **deprecated as of r186** (`@deprecated since r186. Use PCFShadowMap instead.`) — the two now behave equivalently. If you are on r160–r185, `PCFSoftShadowMap` is still fine; write `PCFShadowMap` for forward compatibility.

Available tone mapping constants (from `src/constants.js`): `NoToneMapping` 0, `Linear` 1, `Reinhard` 2, `Cineon` 3, **`ACESFilmic` 4**, `Custom` 5, **`AgX` 6**, **`Neutral` 7**.

| Tone mapper | Character | Use for |
|---|---|---|
| **`ACESFilmicToneMapping`** | contrasty, desaturates highlights toward white, cinematic | **default choice** — golden hour, night, anything dramatic |
| **`AgXToneMapping`** | better hue preservation in highlights, gentler rolloff, less contrast; renders darker so needs ~+0.3–0.6 exposure | overcast/flat daylight, when ACES over-crushes |
| `NeutralToneMapping` | Khronos PBR Neutral — preserves albedo almost exactly | product viz. **Not this.** |
| `ReinhardToneMapping` | washed out, low contrast | no |

Ship ACES at exposure 0.9–1.1 for golden hour; if you add a bright-overcast preset, switch to AgX at exposure ~1.4.

### 5.3 Sky + IBL: the procedural HDR environment

`Sky` (`three/addons/objects/Sky.js`) is a Preetham/Hošek-style analytic sky. As of recent `dev` it also has **procedural clouds** built in, which is a substantial upgrade and worth knowing about:

```js
Sky.SkyShader.uniforms = {
  turbidity: 2, rayleigh: 1, mieCoefficient: 0.005, mieDirectionalG: 0.8,
  sunPosition: Vector3, up: Vector3(0,1,0),
  cloudScale: 0.0002, cloudSpeed: 0.0001, cloudCoverage: 0.4,
  cloudDensity: 0.4, cloudElevation: 0.5,
  showSunDisc: 1, time: 0.0,
}
```

The full setup — sky as background *and* as the light source:

```js
import { Sky } from 'three/addons/objects/Sky.js';

const sky = new Sky();
sky.scale.setScalar(450000);                 // must be huge; the shader assumes atmospheric scale
scene.add(sky);

const u = sky.material.uniforms;
u.turbidity.value        = 6.0;    // 2 = crystal clear, 10+ = hazy/humid summer NYC
u.rayleigh.value         = 1.8;    // higher = more blue scattering, stronger sunset reds
u.mieCoefficient.value   = 0.008;  // haze amount
u.mieDirectionalG.value  = 0.86;   // sun glow tightness (0.8–0.95)
u.cloudCoverage.value    = 0.35;
u.showSunDisc.value      = 1;

// --- sun direction ---
function setSun(elevationDeg, azimuthDeg) {
  const phi   = THREE.MathUtils.degToRad(90 - elevationDeg);
  const theta = THREE.MathUtils.degToRad(azimuthDeg);
  const dir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
  u.sunPosition.value.copy(dir);
  sun.position.copy(dir).multiplyScalar(1200);      // the DirectionalLight
  sun.target.position.set(0, 0, 0);
  return dir;
}

// --- bake the sky into an IBL ---
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();               // do this once, up front, to avoid a hitch later

let envRT = null;
function updateEnvironment() {
  envRT?.dispose();
  envRT = pmrem.fromScene(sky, /* sigma */ 0.0, /* near */ 0.1, /* far */ 1000);
  scene.environment = envRT.texture;
  scene.background  = envRT.texture;                // or keep the Sky mesh as background for the sun disc
  scene.environmentIntensity = 1.0;                 // r163+
}
```

Notes that matter:

- **`fromScene` is the right call for a procedural sky** (`fromEquirectangular` is for loaded HDRIs, `fromCubemap` for cubemaps). It renders the scene into a cubemap and then runs the roughness prefilter chain.
- **Regenerate only when the sun moves.** `fromScene` costs a few milliseconds — fine at load or on a time-of-day slider, fatal per-frame. If you animate a day cycle, regenerate at most every ~10 frames and lerp `environmentIntensity` between.
- **Always `dispose()` the old render target.** This leak will eat your 6 GB.
- `scene.environmentIntensity` (r163+) is the correct knob for dialling ambient down — do **not** dial down the sky's own brightness, or the background stops matching the lighting. `scene.environmentRotation` and `scene.backgroundBlurriness`/`backgroundIntensity` are also available on recent versions.
- `RoomEnvironment` (`three/addons/environments/RoomEnvironment.js`) is the cheap fallback studio IBL. Note its scene position changed in **r183**, so lighting from it looks different across that boundary.
- A **legacy gamma correction was removed from `Sky` in r183.** If you tune sky values on one version and see them shift after upgrading, that is why.

### 5.4 Physically-scaled lights and golden hour

Since r150/r155 lights are physically scaled by default (`useLegacyLights = false`, `physicallyCorrectLights` gone). Consequences:

- **`DirectionalLight`** has no distance falloff; `intensity` is an irradiance multiplier. For a sun with ACES + exposure 1.0, use **intensity 2.5–4.0**. (Do not try to plug in 100,000 lux — three's directional light is not calibrated in lux.)
- **`PointLight` / `SpotLight`** intensity is in **candela**, with `decay = 2` (inverse square) by default. Use `light.power` to set **lumens** instead, which is far more intuitive: a 100 W-equivalent bulb ≈ **1600 lm**; a shop window ≈ 4000–8000 lm; a high-pressure-sodium street lamp ≈ 10,000–30,000 lm.
- **Never use `AmbientLight`** in this project. `HemisphereLight` is an acceptable cheap supplement (sky colour from above, ground bounce from below) but the PMREM environment already does this better.

```js
const sun = new THREE.DirectionalLight(0xfff0dd, 3.2);
sun.castShadow = true;
scene.add(sun, sun.target);

// Golden hour: elevation 4–12 deg. Below ~3 deg the shadows get so long they read as broken.
const dir = setSun(8, 285);

// Warm the sun and cool the sky as elevation drops — this is most of the "golden hour" read
const t = THREE.MathUtils.smoothstep(8, 0, 25);          // 1 at horizon, 0 at 25 deg
sun.color.setHSL(THREE.MathUtils.lerp(0.10, 0.055, t), THREE.MathUtils.lerp(0.25, 0.75, t), 0.62);
sun.intensity = THREE.MathUtils.lerp(3.6, 1.4, t);        // sun dims as it reddens
```

**NYC-specific sun angles.** The Manhattan street grid is rotated ~29° from true north. That means the sun aligns *down the cross-streets* — **Manhattanhenge** — at a sun azimuth of roughly **299°** (WNW) at sunset, around 28 May and 12 July. Using elevation ~1–3° with azimuth 299° and the camera looking west down a cross street gives you the single most recognisable lighting condition in the city, for free. Presets worth shipping:

| Preset | Elevation | Azimuth | Turbidity | Exposure | Notes |
|---|---|---|---|---|---|
| Manhattanhenge | 2° | 299° | 8 | 0.85 | look W down a cross street; huge bloom on the sun |
| Golden hour | 9° | 275° | 6 | 1.0 | long shadows across avenues |
| Midday | 62° | 180° | 4 | 1.05 | harsh, good for testing AO |
| Overcast | 40° | 200° | 12, rayleigh 0.6 | 1.4 + AgX | shadowless, tests albedo |
| Blue hour | −4° | 292° | 7 | 1.2 | sun below horizon; window emissives dominate |
| Night | −18° | — | — | 1.3 | `uNightMix = 1`, bloom up, street lamps on |

### 5.5 Shadows for a whole city

The problem: one directional shadow map must cover both a 0.2 m window reveal at 5 m and a 200 m tower at 800 m. A single map cannot.

**Baseline (do this first) — a camera-following tight shadow frustum:**

```js
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far  = 900;
sun.shadow.bias        = -0.0004;
sun.shadow.normalBias  = 0.03;      // in world units; for thick masonry 0.02–0.05. Prefer this over bias.
sun.shadow.blurSamples = 8;

// Follow the camera with a modest box, snapped to texel grid to stop shadow crawl
const EXTENT = 130;                                     // metres — covers what you can actually see detail on
function updateShadowFrustum(cam) {
  const c = sun.shadow.camera;
  c.left = -EXTENT; c.right = EXTENT; c.top = EXTENT; c.bottom = -EXTENT;
  const texel = (2 * EXTENT) / sun.shadow.mapSize.x;
  const focus = cam.position.clone().add(cam.getWorldDirection(new THREE.Vector3()).multiplyScalar(EXTENT * 0.55));
  focus.x = Math.round(focus.x / texel) * texel;        // texel snapping: without this shadows shimmer as you walk
  focus.z = Math.round(focus.z / texel) * texel;
  sun.target.position.copy(focus).setY(0);
  sun.position.copy(sun.target.position).add(dir.clone().multiplyScalar(500));
  c.updateProjectionMatrix();
  renderer.shadowMap.needsUpdate = true;                // we set autoUpdate = false
}
```

**Texel snapping is not optional.** Without it, a walking camera makes every shadow edge crawl, and that crawl is one of the loudest "this is a game engine demo" tells.

**Upgrade — Cascaded Shadow Maps.** three.js ships `CSM` at `three/addons/csm/CSM.js` (plus `CSMHelper`, `CSMShader`, `CSMFrustum`):

```js
import { CSM } from 'three/addons/csm/CSM.js';
const csm = new CSM({
  maxFar: 900, cascades: 3, mode: 'practical',       // 'uniform' | 'logarithmic' | 'practical' | 'custom'
  shadowMapSize: 2048, lightDirection: dir.clone().negate(),
  lightIntensity: 3.2, camera, parent: scene, shadowBias: -0.0004,
});
csm.setupMaterial(brickMat);                            // must be called for EVERY material that receives shadows
// per frame:
csm.update();
```

Costs: **N cascades = N shadow-map render passes**, so your shadow-pass draw calls and triangles multiply. 3 cascades at 2048² costs roughly 2.5–4 ms on this GPU with ~500k triangles per cascade. Mitigations that work well:

- **Only large objects cast.** Set `castShadow = false` on window units, brackets, railings, AC units, sills. Their contribution is invisible and they are the bulk of your objects. Cast from: block shells, roof structures, water towers, sidewalk sheds, street lamps. This can cut the shadow pass by 5×.
- **`renderer.shadowMap.autoUpdate = false`** and re-render only when the sun or the shadow frustum actually moves. For a static sun and a slowly-moving camera, that is maybe every 8th frame.
- **Two cascades is usually enough** for a street-level city camera; the third cascade covers ground you are looking at through fog.
- Shadow-map resolution beats cascade count for facade detail. 4096² × 2 often looks better than 2048² × 4 here, because facades are near-planar and the shadow frustum is tight.

**Contact shadows.** Neither AO nor a 2048² cascade resolves the dark line where a stoop meets a sidewalk. Fake it: an instanced alpha-blended radial-gradient quad under every ground-contact object (§4.6 item 4). One draw call, looks better than another cascade.

### 5.6 Ambient occlusion: which one, and is it worth it

**The honest answer: bake vertex AO first (§4.6), then add a screen-space pass only for the small-scale contacts vertex AO cannot express** (window reveal corners, fire-escape-to-wall junctions, pipe-to-wall, sill undersides). Screen-space AO is *not* a substitute for baked AO on procedural geometry, because you already know the occluders analytically and baking is free at runtime.

The options, with what is actually known about them:

| Option | Where | Notes |
|---|---|---|
| **N8AO** — `github.com/N8python/n8ao`, npm `n8ao` | drop-in | **Recommended.** CC0-1.0, WebGL2, three r161+. Two entry points: `N8AOPass(scene, camera, w, h)` **replaces** `RenderPass` in three's `EffectComposer`; `N8AOPostPass` is for `pmndrs/postprocessing` and **requires a `RenderPass` before it**. Its half-resolution mode is a documented **2–4× speedup**, with depth-aware upscaling costing **~1 ms fixed**. Debug mode exposes `lastTime` so you can measure the pass exactly — use it. |
| **`GTAOPass`** | `three/addons/postprocessing/GTAOPass.js` | Built-in, replaced `HBAOPass` in **r160**. Ground-truth-ambient-occlusion with a poisson denoise pass. Good quality. **Its cost is not just the AO: it renders a full normal+depth G-buffer, i.e. a second complete geometry submission** — that is the expensive part in a scene with 150 draw calls. |
| `SSAOPass` | `three/addons/postprocessing/SSAOPass.js` | Older, noisier, also needs a normal/depth pass. Superseded by GTAO. |
| `SAOPass` | `three/addons/postprocessing/SAOPass.js` | Scalable AO, still present. Middle ground. |
| `SSAOEffect` | `pmndrs/postprocessing` | Reuses the library's shared depth/normal buffers, so it is cheaper *if you are already in that pipeline*. |

**Verdict for this project:** N8AO at half resolution, `aoRadius` 1.5–3.0 m (world units — set it to roughly the size of the detail you want occluded: a window reveal is 0.2 m, a street canyon is 20 m, so ~2 m is the useful compromise), `intensity` 1.5–2.5, `denoiseSamples` 8, and **turn the AO down where you already have baked AO** so you don't double-darken. Budget ~1.2–2.0 ms at 1080p half-res on this GPU.

`GTAOPass` reference settings, if you prefer zero dependencies (these are three's own example values):

```js
const gtao = new GTAOPass(scene, camera, width, height);
gtao.output = GTAOPass.OUTPUT.Default;      // Off/-1, Default/0, Diffuse, Depth, Normal, AO, Denoise
gtao.blendIntensity = 1.0;
gtao.updateGtaoMaterial({ radius: 0.25, distanceExponent: 1, thickness: 1, scale: 1, samples: 16, screenSpaceRadius: false });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, samples: 16 });
```
For a city, raise `radius` well above 0.25 (that value is tuned for a small model) or set `screenSpaceRadius: true`. On r185+ `distanceExponent`/`distanceFallOff` are deprecated in the node version — the distance model changed.

**A depth prepass pays for AO.** If you render a cheap depth-only pass first (see §6.5), both AO and early-Z get faster, and you avoid GTAO's duplicate geometry pass.

### 5.7 Antialiasing: the window-grid problem

A city facade is the worst case: a regular high-frequency grid of thin bright mullions against dark glass, viewed at grazing angles, in motion. You need **two different fixes for two different aliasing sources.**

**Geometric aliasing (mullion and silhouette edges) → MSAA.** This is the one that matters, and MSAA is the only technique that genuinely solves it. With an `EffectComposer` you cannot use `WebGLRenderer({antialias:true})` (that only affects the default framebuffer), so put the samples on the composer's target — WebGL2 multisampled render targets, exposed as the `samples` option:

```js
const size = new THREE.Vector2();
renderer.getDrawingBufferSize(size);
const target = new THREE.WebGLRenderTarget(size.x, size.y, {
  type: THREE.HalfFloatType,        // keep HDR for bloom + tone mapping
  samples: 4,                       // 4x MSAA. 8x is available and costs ~1.5x more bandwidth.
  depthBuffer: true, stencilBuffer: false,
});
const composer = new THREE.EffectComposer(renderer, target);
```

(`EffectComposer` already defaults to `HalfFloatType` if you pass no target; you are overriding purely to add `samples`.) With `pmndrs/postprocessing` the equivalent is `new EffectComposer(renderer, { multisampling: 4 })` — note that library's own docs warn of artifacts when combining MSAA with depth-based effects such as SSAO, because the resolved depth is not the multisampled depth.

**Shader/specular aliasing (glinting glass, shimmering brick normals) → not MSAA.** MSAA does nothing here because it only supersamples coverage, not shading. Fixes, in order of effectiveness:

1. **Anisotropic filtering at 8×** (§4.5) — biggest single win.
2. **Minimum roughness clamp + normal-variance roughness widening** (§4.5 snippet).
3. **Mip bias:** never sample facade textures at a sharper mip than the geometry warrants; do not set `texture.minFilter = LinearFilter` "to make it look sharper".
4. A light post-AA pass on top: **SMAA**.

**Post-AA options in three.js, factually:**

| Pass | Where | Verdict |
|---|---|---|
| `SMAAPass` | `three/addons/postprocessing/SMAAPass.js` | **Use this.** Better edge reconstruction than FXAA, minimal texture blurring, ~0.4 ms at 1080p. `pmndrs/postprocessing` has `SMAAEffect({preset: SMAAPreset.ULTRA})`. |
| `FXAAShader` | `three/addons/shaders/FXAAShader.js` | Cheaper (~0.2 ms) but noticeably softens the fine facade detail you worked hard to generate. Acceptable fallback on weak hardware. Note `pmndrs/postprocessing` does **not** ship FXAA. |
| `TAARenderPass`, `SSAARenderPass` | `three/addons/postprocessing/` | **Not viable for a moving camera.** These accumulate jittered samples across frames and only converge while the scene and camera are static. Great for a "hero screenshot" mode; useless for navigation. `pmndrs/postprocessing` ships no TAA at all. |

**Recommended stack:** 4× MSAA + 8× anisotropy + roughness clamp + `SMAAPass`. Expect ~0.6 ms combined for the AA passes and a genuinely stable image in motion. Also cap `setPixelRatio` at 1.5 — on a 1080p laptop panel with `devicePixelRatio` 2, uncapped means rendering 4× the pixels for no visible benefit once MSAA is on.

### 5.8 Fog and aerial perspective

```js
// FogExp2 is the right choice: exponential-squared falloff reads as real atmosphere,
// and it has no far-plane discontinuity the way linear Fog does.
scene.fog = new THREE.FogExp2(0x9fb4c7, 0.0022);   // 0.0015 clear, 0.0035 hazy summer NYC
```

Two things people get wrong:

- **Match the fog colour to the horizon sky colour**, and update it when the sun moves. Sample it from the sky: render the `Sky` to a 4×4 target once per sun change and read back the horizon pixel, or evaluate an approximation on the CPU. A fog colour that doesn't match the horizon produces a visible band where buildings meet sky, and that band is instantly recognisable as "engine".
- Fog is applied **in linear space before tone mapping** in three's shader chunks, which is correct — do not add fog in post.

**Height fog** (the fake aerial-perspective layer that makes a skyline look like a skyline) is worth the twenty lines. Inject into the fog chunk:

```js
mat.onBeforeCompile = (shader) => {
  shader.uniforms.uFogHeight = { value: 90.0 };     // fog thins out above this
  shader.uniforms.uFogFalloff = { value: 45.0 };
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <fog_pars_fragment>', `
      #include <fog_pars_fragment>
      uniform float uFogHeight, uFogFalloff;
      varying vec3 vWorldPosFog;
    `)
    .replace('#include <fog_fragment>', `
      #ifdef USE_FOG
        float fogDepth = vFogDepth;
        float fogFactor = 1.0 - exp( -fogDensity * fogDensity * fogDepth * fogDepth );
        // attenuate by height: towers poke out of the haze
        fogFactor *= exp( -max(0.0, vWorldPosFog.y - uFogHeight) / uFogFalloff );
        gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, saturate(fogFactor) );
      #endif
    `);
  shader.vertexShader = shader.vertexShader
    .replace('#include <fog_vertex>', `
      #include <fog_vertex>
      vWorldPosFog = (modelMatrix * vec4(transformed, 1.0)).xyz;
    `)
    .replace('#include <fog_pars_vertex>', `
      #include <fog_pars_vertex>
      varying vec3 vWorldPosFog;
    `);
};
```

Add a very slight **blue shift with distance** (Rayleigh) on top of the fog mix and distant buildings will read as genuinely distant rather than merely faded.

### 5.9 The post stack: order and cost

Order matters because each pass has assumptions about what is in the buffer.

```
1. RenderPass                  (HDR, HalfFloat, 4x MSAA)     — or N8AOPass, which replaces it
2. N8AO / GTAO                 (needs linear depth + normals; must be BEFORE tone mapping)
3. (optional) SSR              — skip; too expensive here, and glass envmaps cover it
4. Bloom (UnrealBloomPass)     (must be BEFORE tone mapping, on HDR values > 1.0)
5. OutputPass                  (applies renderer.toneMapping AND outputColorSpace)
6. SMAAPass                    (AFTER tone mapping, on LDR — SMAA is tuned for perceptual space)
```

**`OutputPass` is the piece people miss.** When three.js renders into a render target it skips tone mapping and colour-space conversion; `OutputPass` reads `renderer.toneMapping` / `renderer.toneMappingExposure` / `renderer.outputColorSpace` and applies them, rebuilding its defines when they change. So you still configure tone mapping on the *renderer* and simply add `new OutputPass()` last-but-one. Without it, an `EffectComposer` scene looks flat and dark and everyone blames the tone mapper.

```js
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }     from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass }       from 'three/addons/postprocessing/SMAAPass.js';
import { N8AOPass }       from 'n8ao';

const composer = new THREE.EffectComposer(renderer, target);   // target has samples: 4

const n8 = new N8AOPass(scene, camera, size.x, size.y);        // replaces RenderPass
n8.configuration.aoRadius = 2.0;
n8.configuration.distanceFalloff = 1.0;
n8.configuration.intensity = 2.0;
n8.configuration.halfRes = true;                                // 2–4x faster
composer.addPass(n8);

const bloom = new UnrealBloomPass(size, 0.45, 0.4, 0.85);       // strength, radius, threshold
composer.addPass(bloom);                                        // threshold 0.85 catches lit windows only

composer.addPass(new OutputPass());
composer.addPass(new SMAAPass(size.x, size.y));
```

Estimated frame cost at 1080p on an RTX 3060 Laptop (measure, don't trust):

| Pass | ms |
|---|---|
| Opaque geometry (≈120 calls, 1.2 M tris, MSAA 4×) | 2.5–4.0 |
| Shadow maps (2 cascades, 2048², big objects only) | 1.5–2.5 |
| Glass pass | 0.3–0.6 |
| N8AO (half-res + upscale) | 1.2–2.0 |
| UnrealBloom (5 mips) | 0.8–1.2 |
| OutputPass | 0.15 |
| SMAA | 0.4 |
| MSAA resolve | 0.3 |
| **GPU total** | **7.2–11.2** |
| JS/CPU | 2–4 |

That lands at roughly **75–110 fps**, i.e. comfortable 60 with real headroom for the detail you will inevitably add. Bloom and AO are the two knobs to turn down first if you overspend.

### 5.10 Night mode

Night is where a procedural city either looks spectacular or looks like a black box with dots. What actually works:

- `uNightMix = 1` drives per-window emissive (§2.4) with **per-building lit density** between 10% and 50%.
- Raise `toneMappingExposure` to ~1.3 and *drop* `scene.environmentIntensity` to ~0.10–0.18 rather than to zero — a real city night sky is bright orange-brown from light pollution, never black. Regenerate the PMREM from a night sky (sun below horizon, high turbidity, warm tint) so glass reflects a plausible sky.
- Bloom threshold down to ~0.6, strength up to ~0.7, radius ~0.5.
- ~8 real `PointLight`s at street level near the camera for shop-window spill, with `power` in lumens. Move them with the camera rather than having hundreds.
- Emissive street-lamp cones as additive cone geometry (not real spotlights) — one instanced mesh, huge payoff.
- **Wet ground.** Lower the road's roughness to ~0.15 and let the envmap plus emissive windows reflect. A wet street at night doubles the apparent lighting complexity for one material tweak.

---

## 6. LOD and culling

### 6.1 `THREE.LOD`

```js
const lod = new THREE.LOD();
lod.addLevel(meshHigh, 0);            // addLevel(object, distance = 0, hysteresis = 0)
lod.addLevel(meshMid, 120, 0.08);     // hysteresis is a FRACTION of distance — 0.08 = 8% dead zone
lod.addLevel(meshLow, 350, 0.08);
lod.autoUpdate = true;                // renderer calls lod.update(camera) during render
scene.add(lod);
// also: lod.getCurrentLevel(), lod.getObjectForDistance(d), lod.removeLevel(d)
```

`hysteresis` exists specifically to stop the flicker when you stand exactly on a boundary. **Always set it** (0.05–0.10). Distance is camera-to-`lod.position`, so put the LOD's origin at the building's *centre of mass*, not its footprint corner, or tall buildings will switch too early.

### 6.2 The `InstancedMesh` culling problem, stated precisely

`InstancedMesh.frustumCulled` has been `true` by default since **r151** (when bounding-volume computation was added), but the volume is **a single bounding sphere enclosing every instance**. So:

> A city-wide `InstancedMesh` containing 8,000 window units has a bounding sphere covering the whole city and is therefore **never culled**. Every instance is submitted every frame, and the vertex shader runs on all of them.

Core three.js still has no per-instance frustum culling for `InstancedMesh` (tracked in mrdoob/three.js#28102, which proposes replacing `instanceMatrix`/`instanceColor` with an `instanceIndex` + matrix/colour textures). Three real strategies:

**Strategy 1 — spatial partitioning (recommended baseline, zero dependencies).**

Create one `InstancedMesh` per **(block × part type)**. Each has a tight bounding sphere, so three's built-in frustum culling works, per block, for free.

```js
// 12 blocks x ~14 part types = up to 168 InstancedMeshes,
// but a street-level frustum sees 3–6 blocks -> 40–90 survive culling.
for (const block of blocks)
  for (const [partId, placements] of block.byPart) {
    if (placements.length === 0) continue;
    const im = makeBatch(PART_GEOM[partId][0], MATERIALS[PARTS[partId].mat], placements.length, attrs);
    placements.forEach((p, i) => im.setMatrixAt(i, p.matrix));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();          // tight, per block -> culling actually works
    blockGroup.add(im);
  }
```

Cost: ~50–90 draw calls instead of ~14. Benefit: you skip 50–75% of all instance vertex work, and the CPU-side cull is a cheap sphere test. On this hardware that trade is clearly worth it — you have draw calls to spare and vertex throughput is the thing you are actually protecting. **Sub-partition further if a block is large:** for a full 61 × 244 m Manhattan block, split into 3–4 sub-cells along the long axis, because at street level you see a quarter of a block.

**Strategy 2 — `@three.ez/instanced-mesh` (`InstancedMesh2`).** Real per-instance culling via a dynamic BVH, keeping one draw call per part.

```js
import { InstancedMesh2, createRadixSort } from '@three.ez/instanced-mesh';

const m = new InstancedMesh2(geometry, material, { capacity: 8000 });
m.addInstances(count, (obj, i) => { obj.position.copy(p[i]); obj.quaternion.copy(q[i]); obj.scale.copy(s[i]); obj.updateMatrix(); });
m.computeBVH({ margin: 0 });                 // static instances -> margin 0 is optimal
m.perObjectFrustumCulled = true;             // default
m.addLOD(geomMid, material, 50);             // per-instance LOD, inside one mesh
m.addLOD(geomLow, material, 200);
m.addShadowLOD(geomLow, 100);                // cheaper shadow geometry
m.initUniformsPerInstance({ fragment: { emissive: 'vec3', roughness: 'float' } });
m.setUniformAt(i, 'emissive', color);
m.sortObjects = true; m.customSort = createRadixSort(m);
```

This is a genuinely good fit: 446★, MIT, TypeScript, ships a 1M-instance demo, and `addLOD` + `addShadowLOD` solve two of your problems at once. Its BVH is designed for **mostly static** instances, which describes a city exactly. Use it if Strategy 1's draw-call count becomes the bottleneck, or once you want per-instance LOD rather than per-block LOD.

**Strategy 3 — `BatchedMesh`.** `perObjectFrustumCulled = true` natively, plus `setGeometryIdAt` for per-instance LOD, in one draw call. Caveats from §3.5 (multi-draw, Firefox, one material). Note that the three.js example `webgl_batch_lod_bvh` (500,000 instances of 10 geometries with LOD + BVH culling + radix sort) achieves that using **external** packages, not core three:

```js
import { acceleratedRaycast, computeBatchedBoundsTree } from 'three-mesh-bvh';
import { createRadixSort, extendBatchedMeshPrototype, getBatchedMeshLODCount } from '@three.ez/batched-mesh-extensions';
import { performanceRangeLOD, simplifyGeometriesByErrorLOD } from '@three.ez/simplify-geometry';

extendBatchedMeshPrototype();
const lods = await simplifyGeometriesByErrorLOD(geometries, 4, performanceRangeLOD);
batchedMesh.addGeometryLOD(geometryId, lods[1], 0.08);   // then 0.04, 0.033, 0.02
batchedMesh.computeBoundsTree();
batchedMesh.computeBVH(THREE.WebGLCoordinateSystem);
batchedMesh.customSort = createRadixSort(batchedMesh);
```

`addGeometryLOD`, `computeBVH` and `createRadixSort` are **not** core three.js — verify against the source before you plan around them. `@three.ez/simplify-geometry` in particular is at version 0.0.1; consider calling `meshoptimizer` directly instead.

### 6.3 Merging by city block

The block is the right batching unit, for four independent reasons:

1. It matches the frustum: a street-level camera sees 3–6 blocks, so block-granularity culling throws away 50–75% of the scene.
2. It matches the real-world structure: buildings in a block share party walls, cornice lines and materials.
3. It bounds the merge cost: rebuilding one block after a parameter change is ~10 ms, not 2 seconds.
4. It bounds the vertex-AO computation: occluders are local, so `applyVertexAO` only needs the block's own geometry plus the facing blocks.

```js
// Manhattan-accurate block grid. Note real blocks are ~61 x 244 m — for a 120-building
// scene, subdivide the long axis so each batch stays frustum-sized.
const BLOCK = { short: 61, long: 244, subdivisions: 3 };  // -> 61 x 81 m batches
```

Build blocks **in a Web Worker** and transfer the resulting typed arrays. The grammar evaluation plus merging plus AO baking for 120 buildings is 200–600 ms of pure JS; doing it on the main thread is a visible stall. `mergeGeometries` needs `three` in the worker but that is fine (it is pure math on typed arrays); alternatively write your own concatenation that operates on raw `Float32Array`s and post them back as transferables.

```js
// worker -> main
self.postMessage({ position, normal, uv, color, index, blockId },
                 [position.buffer, normal.buffer, uv.buffer, color.buffer, index.buffer]);
```

Also: **dispose the intermediate geometries** after merging (`g.dispose()`), or you keep 120 buildings' worth of per-panel geometries alive in GPU memory for nothing.

### 6.4 Impostors for the far skyline

Beyond ~350–400 m a building occupies so few pixels that its silhouette and its window pattern are all that survive. Replace it with a textured quad.

**Do not build octahedral impostors here.** Octahedral impostors (à la Ryan Brucks' Fortnite technique) sample a hemisphere or full sphere of view directions, which matters for trees you fly over. You look at distant buildings from *approximately horizontal*, always. A **horizontal-only turntable atlas** is far cheaper and entirely sufficient:

```js
// Bake once at load: N azimuth steps around each building type, orthographic camera, horizontal
function bakeImpostor(buildingMesh, { steps = 12, tile = 256 } = {}) {
  const atlas = new THREE.WebGLRenderTarget(tile * steps, tile,
    { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace });
  const box = new THREE.Box3().setFromObject(buildingMesh);
  const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.z) * 0.5;
  const cam = new THREE.OrthographicCamera(-radius, radius, size.y * 0.5, -size.y * 0.5, 0.1, radius * 8);

  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    cam.position.set(centre.x + Math.sin(a) * radius * 4, centre.y, centre.z + Math.cos(a) * radius * 4);
    cam.lookAt(centre);
    renderer.setRenderTarget(atlas);
    renderer.setViewport(i * tile, 0, tile, tile);
    renderer.setScissor(i * tile, 0, tile, tile);
    renderer.setScissorTest(true);
    renderer.render(buildingMesh, cam);
  }
  renderer.setScissorTest(false);
  renderer.setRenderTarget(null);
  return { atlas, steps, aspect: (radius * 2) / size.y, height: size.y };
}
```

At runtime: **one `InstancedMesh` of quads for the entire distant skyline** — one draw call, ~2 triangles per building. The shader picks the atlas slice from the view azimuth and blends the two nearest slices:

```glsl
float a = atan(vViewDirWS.x, vViewDirWS.z) / (2.0 * PI) + 0.5;   // 0..1 around the building
float f = a * uSteps;
float i0 = floor(f), i1 = mod(i0 + 1.0, uSteps), w = fract(f);
vec2 uv0 = vec2((vQuadUv.x + i0) / uSteps, vQuadUv.y);
vec2 uv1 = vec2((vQuadUv.x + i1) / uSteps, vQuadUv.y);
vec4 c = mix(texture2D(uImpostor, uv0), texture2D(uImpostor, uv1), w);
if (c.a < 0.35) discard;    // discard is fine here: alpha-tested, far away, tiny pixel count
```

12 azimuth steps (30° apart) is enough at 400 m+. Bake albedo+alpha only; relight by tinting with the fog/sky colour, since at that distance the building is mostly fog anyway. Also bake the **night** variant (emissive window pattern) into a second atlas row — the distant skyline at night is basically free this way.

**Even simpler and often enough:** at 400 m+, a coloured box with the flat facade texture and `fract()`-hashed emissive windows (§2.4) costs 12 triangles and needs no baking at all. Try this before you build the impostor system, and only upgrade if silhouettes look wrong.

### 6.5 Optional: depth prepass and occlusion

A dense city has enormous occlusion — from a street you see maybe 20% of the geometry in your frustum, but you still shade all of it (three.js sorts opaque front-to-back by default, which helps but doesn't eliminate overdraw).

If profiling shows you are fragment-bound (unlikely on this GPU, per §0.1, but possible with interior mapping + a heavy standard material), a **depth prepass** pays:

```js
// Pass 1: depth only, cheap material, no shading
scene.overrideMaterial = depthOnlyMaterial;   // colorWrite:false, depthWrite:true
renderer.render(scene, camera);
// Pass 2: full shading, only where depth already matches
scene.overrideMaterial = null;
mainMaterials.forEach(m => { m.depthFunc = THREE.EqualDepth; m.depthWrite = false; });
renderer.render(scene, camera);
```

This doubles your draw calls, so it is only a win when fragment cost clearly dominates. The version that is *always* worth it: reuse the prepass depth for AO instead of letting `GTAOPass` render its own G-buffer.

For actual occlusion culling, don't build a hierarchical Z-buffer. A city has an easy structural shortcut: **buildings occlude along streets**. Precompute, per block, which other blocks are visible from it (a 2D visibility precomputation over the street network, done once at generation time), and skip the rest. This is a large win for street-level cameras and cheap to compute because the street grid is regular. Skip it entirely if you have an aerial camera.

---
