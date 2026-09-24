// NYC building dresser — rebuilds the buildings nearest the camera on their REAL
// footprints with the procedural generator's kit (the subproject at ../src,
// imported through the `@nyc` alias): punched brick/stone walls with recessed
// windows (frames, glass with sky reflections, room tones, lit at night), sills,
// lintels, cornices, storefront glazing, entrance doors, parapets and roofs.
// The tile's shader facade for a dressed building is hidden through the
// per-tile hide texture (attribute aBid → uniform uHide, see materials.js).
//
// Budgeted and incremental: a few milliseconds of building per frame, one
// merged mesh per material per building, all repeated parts in shared pooled
// InstancedMeshes (claim/release with slot compaction).
import * as THREE from 'three';
import { TOWER_H } from './towers.js';
import earcut from 'earcut';
import { createMaterials } from '@nyc/materials.js';
import { Batcher } from '@nyc/batcher.js';
import { makeKit } from '@nyc/kit.js';
import { punchedWall } from '@nyc/buildings/lib.js';
import { tmat, box, ensureColor, mergeGeoms } from '@nyc/geo.js';
import { STYLE, BF } from '../shared/geo.js';
import { StaticPool } from './staticPool.js';
import { applyCityAO, wlHash } from './materials.js';   // WL11: the shared CPU/GPU-exact hash

// see assemble.js: `?nodatum=1` restores the pre-seam-pass datums for A/B plates
const NO_DATUM = typeof location !== 'undefined' && new URLSearchParams(location.search).get('nodatum') === '1';
// ?gfix=0 restores the pre-2026-09-10 motion-artefact behaviour for A/B
// measurement (docs/notes/glitch-r7.md; tools/tflick.mjs --flags "...&gfix=0").
const GFIX = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('gfix') === '0');
// ?fac8=0 restores round-7 facade trim / composition (docs/notes/facades-r8.md)
const FAC8 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('fac8') === '0');
// ?e10=0 restores the pre-round-10 dresser base (docs/notes/edges-r10.md §3). The r9
// blind pass named "perfect edges — no dirt where two surfaces meet" as one of the two
// remaining tells, and at `lenoxRef` / `harlem125` the near buildings are DRESSER-built
// (dress.active = 48, materials-r9 §2.7), so the shader's contact terms never touch the
// layer the critic was actually looking at. Two changes here: a splash course at the
// sidewalk joint, and a grime ramp that is a BASE BAND rather than a whole-wall tilt.
const E10 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('e10') === '0');
// WL11 — ?wl11=0 restores the perfect window lattice (docs/notes/lattice-r11.md).
// Three blind packs in a row identified our facades by the grid. The dresser owns the 48
// NEAREST buildings — the ones the street plates actually show — and it laid every bay at
// exactly ww, every sill at exactly the same height, every sash the same colour, with no
// opening in the city ever filled in. Here that means: per-bay u jitter (the door bay
// pinned — assemble.js doorAnchors), ±2 cm per-window sill noise, replaced-sash tints,
// bricked-up openings that keep their stone, and AC units that cluster and sit off-centre.
const WL11 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('wl11') === '0');
// AM120 (owner 2026-09-15, docs/notes/amst120.md): the record colour picks the brick/stone FAMILY of a dressed wall.
// The dresser used to pick the family by hash and only tint it 35 % toward the record colour, so Mudd Hall's dark
// brick record came out as a pale 'brickTan' wall at 60 m while the tile shader drew the same record dark red.
const AM120 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('am120') === '0');
// R12 (docs/notes/silhouette-r12.md) — ?r12=0 restores round-11 behaviour. In THIS file
// that covers the per-block DEAL of the brick family, the wall value, the sash, the
// cornice and the parapet height, plus the dresser's half of the party-wall fire walls.
const R12 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('r12') === '0');
// WB13 (docs/notes/wburg-r13.md) — ?wb13=0 restores round-12 behaviour. In THIS file:
// the RECIPES entries for STYLE.FRAME_HOUSE / STYLE.CONDO_NEW (without them the dresser
// skips a style for free — `dressable()` starts with `if (!RECIPES[rec.style]) return
// false` — which is how RETAIL_MODERN was excluded in round 9), the frame belt's low
// parapet, and its LOW parlour door (the kit stoop is a 1.70 m Harlem high stoop and
// assemble.js scales it by WB13_STOOP_SY for a frame house, so the door has to follow).
const WB13 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('wb13') === '0');
// FD14 (docs/notes/fd14.md) — ?fd14=0 restores round-13 behaviour. In THIS file: the
// cornice yaw (the moulding was extruded INTO the building, so only its brackets showed —
// critic-r14 fix 7 "a row of floating teeth" and the "mortar hatch streaks", which are the
// same z-fight), the corbels that carry it, the boxed coil cornice on the frame belt, the
// entrance architrave over the kit's deep door reveal, and the mullioned wide sash.
const FD14 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('fd14') === '0');
// A COPY of assemble.js's WB13_STOOP_SY, for the same reason this file already carries
// its own parapetH and r12Deal: importing assemble.js from here would be a cycle
// (main.js imports both). 10 x 0.170 m kit stoop x 0.62 = a 1.05 m landing. Keep in step.
const WB13_STOOP_SY = 0.62;
// LD13 (docs/notes/lod-r13.md) — ?ld13=0 restores the round-12 LOD / z-fight behaviour.
// In THIS file: `owns()` (the hand-off to the hero ring), nearest-first dress slots with
// build-before-evict, and one "overlap, never abut" separation at the wall base. All
// three are MOTION artefacts of the ad's two brownstone takes (mBrownstone, fBrownstone).
// `let`, not `const`: `window.__LD13_SET` flips it at runtime so one page can A/B the
// whole LOD schedule against itself (scratchpad/probe_sim.js) instead of two sessions.
let LD13 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('ld13') === '0');
// The separation every LD13 overlap uses. zfight.md §0: one depth LSB at range d is
// 1.490e-7 * d^2 m ALONG THE VIEW RAY, so a pair 10 m away needs 0.03 mm and one 150 m
// away 3.4 mm just to be RESOLVABLE — but the pairs this fixes are at dY = 0.0 exactly,
// where no depth bias of any size can separate them and the winner is decided by draw
// order (engine `_opaqueSortBS`, a function of camera POSITION — glitch-r7 §3.1). So the
// fix has to be geometric. 6 mm is COPING_SINK's proven 5 mm plus a margin, and it is
// buried inside surfaces that already stand 17-20 mm proud: no silhouette changes.
const LD13_LAP = 0.006;
// LD13: how much NEARER a candidate must be than the farthest dressed building before it
// takes its slot. Pure hysteresis — without it two buildings at nearly equal range would
// trade the last slot on every rescan (4x/s) and the whole facade would swap 4 times a
// second. 25 m is comfortably more than one Harlem lot depth.
const LD13_EVICT_MARGIN = 25;
// LD13: and how FAR the building being evicted has to be. An eviction is itself a
// transition — the evicted facade goes from the kit back to the tile shader — so the
// brief's rule applies to it too: it has to happen where it cannot read. Beyond 110 m a
// 6 m rowhouse front is about 90 px wide at 2560, its window bay about 40, and the
// kit/shader difference is a value difference inside that; it is also the far side of the
// hero ring's own DETAIL_OUT = 112 m band boundary, so both of this round's far-field
// transitions live in the same zone rather than at two different radii.
const LD13_EVICT_MIN = 110;
// R12 DEAL CHANNELS — a copy of assemble.js's r12Deal, for the same reason this file
// already carries its own copy of parapetH: nycDress is imported from main.js alongside
// assemble.js and importing one from the other would be a cycle. `rec.deal` is put on
// the hero record by assemble.js's dealer pass. Keep the two in step; the construction
// is documented at the assemble.js copy (a full-cycle LCG over 16 slots with an odd
// stride, so two ordinals differing by 1 are at least stride/16 apart in every channel).
// Channels: 0 parapet height, 1 fire-wall rise, 2 brick family, 3 cornice depth,
//           4 window/sash profile, 5 roof template.
const R12_CH = [7, 5, 9, 11, 13, 3];
function r12Deal(rec, ch) {
  const d = R12 ? rec.deal : -1;
  if (!(d >= 0)) return -1;
  const slot = (d * R12_CH[ch % R12_CH.length]) & 15;
  return (slot + ((rec.colorVar * 61.7 + ch * 7.3) % 1)) / 16;
}
// approximate linear luminance of each wall family's texture (measured mid-tone), for the nearest-family pick
const FAMILY_LUM = { brickPaintedCream: 0.58, limestone: 0.55, concrete: 0.45, brickTan: 0.40, graniteBase: 0.30,
  brickOrange: 0.27, brickNycha: 0.21, brickRed: 0.19, brownstone: 0.14, brickBrown: 0.13, brownstoneDark: 0.09 };
function pickWallFamily(mats, rec, h) {
  const lin = rec.color.map((c) => Math.pow(c / 255, 2.2));
  const lum = 0.3 * lin[0] + 0.59 * lin[1] + 0.11 * lin[2];
  const ranked = mats.filter((m) => FAMILY_LUM[m] != null).sort((a, b) => Math.abs(FAMILY_LUM[a] - lum) - Math.abs(FAMILY_LUM[b] - lum));
  if (!ranked.length) return mats[Math.floor(h * mats.length) % mats.length];
  // R12 (plan item D2, notes §3.5). AM120 made this pick LESS various on purpose and it
  // was right to: two neighbours with similar record colours now get the same family
  // where the old hash would have split them, which is fidelity to the record and a bad
  // block read at the same time. The deal breaks the tie WITHIN the near-equal set
  // rather than overriding the record — the set is still chosen by the record's own
  // luminance, and a family that is not near-equal is still never picked. The tie
  // window goes 0.05 -> 0.075 (FAMILY_LUM's neighbours are 0.02-0.08 apart, so 0.05 let
  // a genuine tie fall out of the set), and the tie is broken by the ORDINAL, so two
  // buildings next door to each other cannot land on the same brick while the set has
  // two members — where a hash could only make it unlikely (uniformity-r10 §6).
  const d2 = R12 && rec.deal >= 0 ? rec.deal : -1;
  if (ranked.length > 1) {
    const d0 = Math.abs(FAMILY_LUM[ranked[0]] - lum);
    if (d2 >= 0) {
      const near = ranked.filter((m) => Math.abs(FAMILY_LUM[m] - lum) - d0 < 0.075);
      // the ORDINAL itself, not a channel of it: d -> d % n is the one mapping
      // for which consecutive ordinals differ for EVERY n >= 2, which is the
      // whole point (a 16-slot channel with an odd stride can still collide on
      // a 2-bucket fold — checked, slot 7 -> 0 with stride 9).
      if (near.length > 1) return near[d2 % near.length];
    }
    if (Math.abs(Math.abs(FAMILY_LUM[ranked[1]] - lum) - d0) < 0.05) return ranked[h < 0.5 ? 0 : 1];
  }
  return ranked[0];
}
const DRESS_R = 150;      // dress within this radius (m)
const DROP_R = 190;       // undress beyond (hysteresis)
const MAX_DRESS = 48;     // active dressed buildings
const BUDGET_MS = 6;      // building time per frame
const WALL_T = 0.35;      // wall thickness (inward from the footprint plane)
const SKIRT_H = 0.7;      // below-grade foundation course under every wall (see buildDressed)
const MAX_WINDOWS = 720;  // skip buildings that would need more windows than this
const SMALL_PART = /^(win:|glass:|lit:|streak:|sill:|lintel:|acUnit|light:|shade)/;

// per-style recipe: candidate wall materials, window style, trim material
const RECIPES = {
  [STYLE.TENEMENT]:      { mats: ['brickRed', 'brickBrown', 'brickOrange'], win: 'dh1', trim: 'limestone', cornice: true, sills: true, ac: 0.10 },
  [STYLE.PREWAR_APT]:    { mats: ['brickTan', 'brickRed', 'brickBrown'], win: 'dh1', trim: 'limestone', cornice: true, sills: true, ac: 0.07 },
  [STYLE.POSTWAR_BRICK]: { mats: ['brickPaintedCream', 'brickTan', 'brickNycha'], win: 'fixed', trim: 'concrete', cornice: false, sills: false, ac: 0.12, wide: true },
  [STYLE.DECO_MASONRY]:  { mats: ['limestone', 'brickTan'], win: 'dh1', trim: 'limestone', cornice: false, sills: true, ac: 0.03 },
  [STYLE.ROWHOUSE]:      { mats: ['brownstone', 'brickRed', 'brownstoneDark'], win: 'dh2', trim: 'brownstone', cornice: true, sills: true, ac: 0.05 },
  [STYLE.LOFT_CASTIRON]: { mats: ['brickRed', 'brickBrown'], win: 'steel', trim: 'cornicePaint', cornice: true, sills: false, ac: 0.02, loft: true },
  [STYLE.INDUSTRIAL]:    { mats: ['brickBrown', 'brickRed'], win: 'steel', trim: 'concrete', cornice: false, sills: false, ac: 0.0, loft: true },
  [STYLE.CIVIC_STONE]:   { mats: ['limestone', 'graniteBase'], win: 'dh1', trim: 'limestone', cornice: true, sills: true, ac: 0.0 },
  [STYLE.RETAIL_STRIP]:  { mats: ['brickTan', 'brickPaintedCream'], win: 'fixed', trim: 'concrete', cornice: false, sills: false, ac: 0.05 },
  [STYLE.PROJECT_BRICK]: { mats: ['brickNycha', 'brickBrown'], win: 'dh1', trim: 'concrete', cornice: false, sills: true, ac: 0.14 },
  // WB13 (docs/notes/wburg-r13.md). `siding` is the one material in the 66-material
  // dresser palette that had no style pointing at it (src/materials.js L90, and a
  // FAC8_CAL entry below has been waiting for it) — this is what it is for.
  // `sills: false` is the load-bearing field: a vinyl-clad house has FLAT white
  // brickmold and a J-channel, and the projecting limestone sill the other
  // residential recipes carry is the "limestone on siding" defect this round names.
  // `trim: cornicePaint` is the white aluminium coil, `ac: 0.26` the typology's own
  // through-wall sleeve rate (docs/typology/08-vinyl-rowhouse.md §6), and the mats
  // array has ONE member because a sided house is sided — the variety comes from the
  // record colour, which is the 14-tone siding palette classify.mjs now hands over.
  [STYLE.FRAME_HOUSE]:   { mats: ['siding'], win: 'dh1', trim: 'cornicePaint', cornice: true, sills: false, ac: 0.26 },
  // The condo: grey panel or thin-set brick, wide fixed glazing, no cornice, no
  // sills, and almost no window units (that generation is PTAC or split).
  [STYLE.CONDO_NEW]:     { mats: ['concrete', 'stucco', 'brickBrown'], win: 'fixed', trim: 'concrete', cornice: false, sills: false, ac: 0.02, wide: true },
};
const ROOF_MATS = ['roofSilver', 'roofBlack', 'roofGravel', 'roofSilver'];
// FAC8: indexed by the shader membrane id assemble.js now hands over on the
// record (`fmemb`: 0 mixed, 1 silver coat, 2 tar, 3 gravel, 4 pavers, 5 sedum),
// so a dressed roof and its shader-facade neighbours agree on which membrane
// this building has. The old table indexed the compiler's 2-bit field and put
// silver on BOTH 0 and 3, which is half of why every roof was white.
const ROOF_MATS8 = ['roofGravel', 'roofSilver', 'roofBlack', 'roofGravel', 'concrete', 'roofGravel'];

// ---------------------------------------------------------------------------
// FAC8 VALUE CALIBRATION for the generator palette (docs/notes/facades-r8.md §6)
//
// Every other material family in the city is trimmed: the ground, the props and
// the campus run through `applyLightTrim` (0.30 x a warm calibration by day),
// the landmarks are authored against it, and the tile facade shader ends with
// `pow(albedo, 1.22) * 0.88`. The 66 materials `createMaterials()` hands the
// dresser go through NONE of that — they are the only untrimmed opaque surfaces
// in the frame, which is why a dressed limestone wall renders 2-3 x hotter than
// the shader facade of the identical building next door, and why the Wall St
// canyon's sill/lintel bands clip to pure white.
//
// The fix is a palette scale, not a shader: MeshStandardMaterial.color
// multiplies the map, so one number per family puts the dresser on the same
// value ladder as its neighbours without touching a line of GLSL (materials.js
// stays unchanged). Factors are chosen so a dressed wall
// lands where the SHADER facade of the same colour lands (measured: mid brick
// 0.31 -> 0.215, ratio 0.69; light stone 0.61 -> 0.47, ratio 0.77).
// Metals, glass and the emissive/unlit fills are left alone — applyLightTrim's
// own notes (facades-r6 §5) record that trimming a metal crushes its specular
// colour with its diffuse.
const FAC8_CAL = {
  limestone: 0.66, graniteBase: 0.72, terracotta: 0.70, stucco: 0.70, concrete: 0.68,
  cornicePaint: 0.62, paintFlat: 0.62, canvasFlat: 0.70, doorPaint: 0.70, sidewalk: 0.72,
  // windowFrame is 0xbdb9b0 untrimmed, i.e. a near-white sash on EVERY opening
  // in the city: the `timessqNorth` plate's right-hand brick tower reads as a
  // white waffle grid because the frames, not the brick, carry the facade. A
  // white-painted wood sash IS the New York norm — at the right value.
  windowFrame: 0.66,
  brickPaintedCream: 0.64, brickPaintedGray: 0.72, brickPaintedRed: 0.82, brickWhite: 0.64,
  brickRed: 0.82, brickOrange: 0.78, brickTan: 0.72, brickBrown: 0.86, brickNycha: 0.82,
  brownstone: 0.82, brownstoneDark: 0.88, castIron: 0.90, siding: 0.72, woodStave: 0.85,
  fillerFacade: 0.74,
  // roofs: the silver coat is the single brightest surface in any aerial frame
  roofSilver: 0.62, roofGravel: 0.84, roofBlack: 1.0,
};
function fac8Calibrate(M) {
  for (const [name, k] of Object.entries(FAC8_CAL)) {
    const m = M.get(name);
    if (m && m.color) m.color.multiplyScalar(k);
  }
}
// Parapet height, shared with assemble.js fac8Parapet — keep the two in step.
function parapetH(rec) {
  const tall = rec.height > 11 && (rec.style === STYLE.TENEMENT || rec.style === STYLE.PREWAR_APT
    || rec.style === STYLE.ROWHOUSE || rec.style === STYLE.LOFT_CASTIRON || rec.style === STYLE.DECO_MASONRY);
  // R12 (plan item D2, notes §5.1). The dresser HIDES the tile facade of the 48
  // buildings it owns, so this function and assemble.js fac8Parapet are the same
  // building either side of DRESS_R = 150 m — and D3 widened the tile side's
  // spread to 0.72/0.52 and put it on the DEAL. Left un-mirrored, every parapet
  // in the city would step by up to 0.17 m as a dolly crosses 150 m, which is
  // exactly the pop the FAC8 comment at the call site records having fixed once
  // already. Same deal channel, same range, same fallback.
  const pv = R12 && r12Deal(rec, 0) >= 0 ? r12Deal(rec, 0) : (rec.colorVar * 7.7) % 1;
  // WB13: the frame belt's low coping — the twin of the `frame13` branch in
  // assemble.js fac8Parapet. Same reason as the R12 note above: these two are
  // the same building either side of DRESS_R and a 0.2 m step at 150 m pops.
  if (WB13 && rec.style === STYLE.FRAME_HOUSE) return 0.48 + pv * 0.50;
  if (R12) return (tall ? 0.95 : 0.62) + pv * (tall ? 0.72 : 0.52);
  return (tall ? 0.95 : 0.62) + pv * (tall ? 0.55 : 0.4);
}
const fract = (v) => v - Math.floor(v);
const hash1 = (a, b = 0, c = 0) => fract(Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------------------------------------------------------------------------
// Pooled instanced parts (shared by every dressed building)
// ---------------------------------------------------------------------------
// Kit parts (windows, glass, sills, lintels, cornices, AC units, doors...) are
// baked into ONE static mesh per (material, casts-shadow, night-only) bucket
// (world/staticPool.js): ~150 InstancedMesh draws per pass became ~12. Each
// part instance is transformed + tinted on the CPU once when its building is
// dressed and zeroed when undressed.
class PartPools {
  constructor(scene, M) {
    this.scene = scene; this.M = M;
    this.parts = new Map();     // id -> { geom, bucket }
    this.buckets = new Map();   // key -> StaticPool
    this.nightOn = false;       // night buckets created after the toggle must inherit it
  }
  has(id) { return this.parts.has(id); }
  define(id, geom, matName, opts = {}) {
    if (this.parts.has(id)) return;
    ensureColor(geom);
    const mat = this.M.get(matName);
    if (!mat) throw new Error('nycDress: unknown material ' + matName);
    const nightOnly = id.startsWith('lit:') || id.includes(':lit') || id === 'light:pool' || id === 'light:glow';
    const castShadow = opts.castShadow !== false && !SMALL_PART.test(id) && !nightOnly;
    const key = `${matName}|${castShadow ? 's' : '-'}|${nightOnly ? 'n' : '-'}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = new StaticPool(this.scene, mat, {
        attrs: { position: 3, normal: 3, uv: 2, color: 3 },
        capVerts: 32768, castShadow, receiveShadow: opts.receiveShadow !== false && !nightOnly,
        name: 'nyc:parts:' + key, userData: { nycDress: true }, enabled: nightOnly ? this.nightOn : true,
      });
      b.nightOnly = nightOnly;
      b.mesh.layers.enable(3);          // far shadow cascade: buildings only
      this.buckets.set(key, b);
    }
    this.parts.set(id, { geom, bucket: b });
  }
  claim(id, matrix, tint) {
    const p = this.parts.get(id);
    if (!p) return null;
    const h = p.bucket.alloc(p.geom, matrix, tint || null);
    if (!h) return null;
    h.bucket = p.bucket;
    return h;
  }
  release(id, handle) {
    if (!handle || !handle.bucket) return;
    handle.bucket.free(handle);
  }
  flush() { /* uploads are range-marked at alloc/free time */ }
  setNight(on) {
    this.nightOn = !!on;
    for (const b of this.buckets.values()) if (b.nightOnly) b.setEnabled(on);
  }
  drawCalls() { let n = 0; for (const b of this.buckets.values()) if (b.mesh.visible && b.live > 0) n++; return n; }
}

// The generator's kit talks to a Batcher; this one routes repeated parts to
// the shared pools and keeps the merged path (world-UV masonry, tint, grime)
// per building. Grime is measured from the building's own ground level.
class DressBatcher extends Batcher {
  constructor(M, pools, baseY) {
    super(M);
    this.pools = pools;
    this.baseY = baseY;
    this.handles = [];
  }
  definePart(id, geometry, matName, opts = {}) { this.pools.define(id, geometry, matName, opts); }
  hasPart(id) { return this.pools.has(id); }
  addInstance(id, matrix, tint = null) {
    const h = this.pools.claim(id, matrix, tint);
    if (h) this.handles.push([id, h]);
  }
  addMerged(matName, geometry, matrix, opts = {}) {
    const grime = opts.grime || 0;
    super.addMerged(matName, geometry, matrix, { ...opts, grime: 0 });
    if (grime > 0) {
      const g = this.mergeBins.get(matName).at(-1);
      const pos = g.attributes.position, col = g.attributes.color;
      // E10: the ramp was 2.4 m, but `punchedWall` emits ONE box per band with two vertex
      // rows, so on a wall whose first window row starts at 3-4 m the 2.4 m "base grime"
      // was interpolated over the WHOLE band and read as a gentle tilt up the facade
      // instead of as dirt at the pavement. 1.6 m puts the whole of the ramp inside the
      // bottom band on every style, which is where the contact is.
      const RAMP = E10 ? 1.6 : 2.4;
      for (let i = 0; i < pos.count; i++) {
        const t = clamp((pos.getY(i) - this.baseY) / RAMP, 0, 1);
        const f = (1 - grime) + grime * (t * t * (3 - 2 * t));
        col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
      }
    }
  }
  releaseAll() { for (const [id, h] of this.handles) this.pools.release(id, h); this.handles = []; }
  // one merged geometry per material for THIS building (handed to TileMerges)
  buildMergedGeoms() {
    const out = new Map();
    for (const [matName, geoms] of this.mergeBins) {
      const merged = mergeGeoms(geoms);
      out.set(matName, merged);
      for (const g of geoms) g.dispose();
    }
    this.mergeBins.clear();
    return out;
  }
}

// Merged masonry is kept per TILE per material (one draw call each) rather
// than per building: 48 dressed buildings × 6 materials was ~300 draw calls.
// Adding or removing a building re-merges that tile's bucket (a few ms).
class TileMerges {
  constructor(scene, M) { this.scene = scene; this.M = M; this.tiles = new Map(); }
  add(tileKey, recKey, geoms) {
    let t = this.tiles.get(tileKey);
    if (!t) this.tiles.set(tileKey, (t = new Map()));
    for (const [matName, g] of geoms) {
      let b = t.get(matName);
      if (!b) t.set(matName, (b = { mesh: null, geos: new Map() }));
      b.geos.set(recKey, g);
      this._rebuild(tileKey, matName, b);
    }
  }
  remove(tileKey, recKey) {
    const t = this.tiles.get(tileKey);
    if (!t) return;
    for (const [matName, b] of t) {
      const g = b.geos.get(recKey);
      if (!g) continue;
      b.geos.delete(recKey);
      g.dispose();
      this._rebuild(tileKey, matName, b);
    }
  }
  _rebuild(tileKey, matName, b) {
    if (b.mesh) { b.mesh.geometry.dispose(); this.scene.remove(b.mesh); b.mesh = null; }
    if (!b.geos.size) return;
    const merged = mergeGeoms([...b.geos.values()]);
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, this.M.get(matName));
    mesh.name = `nyc:merge:${tileKey}:${matName}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.layers.enable(3);            // far shadow cascade: buildings only
    mesh.userData.nycDress = true;
    this.scene.add(mesh);
    b.mesh = mesh;
  }
  drawCalls() { let n = 0; for (const t of this.tiles.values()) for (const b of t.values()) if (b.mesh) n++; return n; }
}

// ---------------------------------------------------------------------------
// Dressing recipe for one building record (assemble.js heroRecs)
// ---------------------------------------------------------------------------
function dressable(rec) {
  if (!RECIPES[rec.style]) return false;                    // glass towers, churches: shader facade stays
  // WB13: with ?wb13=0 the two new styles must fall all the way back to the tile
  // shader, where the re-opened `style > 11.5` ranges render them as the red-brick
  // walk-up round 12 drew — otherwise the A/B pair would differ by the DRESSER too.
  if (!WB13 && (rec.style === STYLE.FRAME_HOUSE || rec.style === STYLE.CONDO_NEW)) return false;
  if (rec.setbacks) return false;                           // wedding-cake tiers stay on the shader (v1)
  if ((rec.heroTop ?? rec.height) < rec.height - 0.6) return false; // mansard / hip caps
  // CW13 (owner 2026-09-17, 01_mCollegeWalk centre-left): a GABLE or HIP roofed prism (Columbia's copper hips, roofKind 1/2)
  // keeps its tile facade and roof — the dressed version draws a flat deck with a parapet, so the whole massing changed the
  // moment the camera came within range (a hip roof became a crenellated flat top). Shape bits only: assemble masks to & 7.
  if (rec.roofKind === 1 || rec.roofKind === 2 || rec.roofKind === 3) return false;   // CH14b: 3 = slate hip
  // 2026-09-04 skyscraper pass (docs/notes/skyscrapers.md): the cap was 70 m,
  // but anything over TOWER_H now carries a crown built into the tile mesh
  // (parapet + coping + bulkhead + tiers, world/towers.js). Dressing such a
  // building sets its hide texel, which discards the crown with the facade and
  // leaves a bald flat roof between two crowned neighbours; and the dresser
  // builds its OWN parapet and roof deck, so keeping the crown visible instead
  // would z-fight. 45-70 m buildings therefore stay on the shader facade —
  // the dresser's 48 slots go to the low-rise stock, where the kit reads.
  if (rec.height < 5 || rec.height > TOWER_H) return false;
  if (!rec.ring || rec.ring.length < 3 || rec.ring.length > 24) return false;
  // window budget
  let wins = 0;
  const floors = Math.max(1, Math.floor(rec.height / Math.max(2.4, rec.floorH)));
  for (let i = 0; i < rec.ring.length; i++) {
    const [ax, az] = rec.ring[i], [bx, bz] = rec.ring[(i + 1) % rec.ring.length];
    const len = Math.hypot(bx - ax, bz - az);
    if (i < 32 && ((rec.blind >> i) & 1)) continue;
    wins += Math.max(0, Math.floor((len - 0.44) / Math.max(0.8, rec.winW))) * floors;
  }
  return wins > 0 && wins <= MAX_WINDOWS;
}

function wallTint(rec, k) {
  // data color (sRGB bytes) → a tint that keeps the record's hue family but
  // lets the brick/stone texture carry the value
  const lin = rec.color.map((c) => Math.pow(c / 255, 2.2));
  const lum = 0.3 * lin[0] + 0.59 * lin[1] + 0.11 * lin[2];
  const kk = clamp(lum / 0.28, 0.62, 1.4) * k;
  const g = new THREE.Color(kk, kk, kk);
  const hueC = new THREE.Color(lin[0], lin[1], lin[2]).multiplyScalar(kk / Math.max(0.02, lum));
  return g.lerp(hueC, 0.35);
}

function buildDressed(ctx, rec) {
  const { batcher: B, kit: K } = ctx;
  const R = RECIPES[rec.style];
  const ring = rec.ring, n = ring.length;
  const y0 = rec.baseY, H = rec.height;
  const fh = Math.max(2.5, rec.floorH || 3.1), ww = Math.max(1.4, rec.winW || 2.6);
  const cv = rec.colorVar;
  // WL11 — the building seed as the EXACT integer the facade shader derives from the same
  // record (`floor(vAux2.z * 1024 + 0.5)`), so `wlHash` gives the same numbers on both
  // sides. colorVar is a uint8/255, so this round-trip is never ambiguous.
  const cvI = Math.floor(rec.colorVar * 1024 + 0.5);
  // an explicit family from BUILDING_OVERRIDES (`wall`, read off the references) beats the luminance pick: after fac8Palette
  // a buff-brick record sits halfway between brickTan and brickRed and the block deal decided (1217 Amsterdam came out red)
  const mat = rec.wall && FAMILY_LUM[rec.wall] != null ? rec.wall
    : AM120 ? pickWallFamily(R.mats, rec, hash1(cv * 511, 3))   // AM120: record colour → wall family
    : R.mats[Math.floor(hash1(cv * 511, 3) * R.mats.length) % R.mats.length];
  // R12 (plan item D2): WALL VALUE. Breaking the family tie is not enough on a
  // block where the whole row genuinely IS one brick — a Harlem tenement row is
  // six buildings of the same red brick, and what separates them in a photograph
  // is that each was pointed, painted and washed in a different decade. +-7 % of
  // value on the record's own tint is that, and it is small enough that it can
  // never be read as a different material: the record still decides the colour,
  // the deal only decides how weathered this one is. Channel 2 is shared with
  // the family pick (the family now indexes on the raw ordinal, so the channel
  // was free) — keep that in step with assemble.js's channel list.
  const d12v = R12 ? r12Deal(rec, 2) : -1;
  const tint = wallTint(rec, d12v >= 0 ? 1.0 + (d12v - 0.5) * 0.14 : 1.0);
  const store = (rec.flags & BF.STOREFRONT) && rec.storeH > 2;
  const dWall = rec.doorI >= 0 ? rec.doorI : -1;
  const dBay = Math.floor((rec.doorPack || 0) / 8) - 1;
  const litP = 0.2 + 0.4 * (rec.lit ?? 0.5);
  // FAC8 WINDOW PROPORTION. 0.62 x bay by 0.62 x floor gave a tenement a
  // 1.50 x 2.05 m opening — aspect 1.37, where a real New York double-hung is
  // 0.8-1.1 m wide by 1.5-1.8 m tall, i.e. 1.7-1.9, and a rowhouse parlour
  // window is over 2. Squat wide holes are one of the strongest "procedural"
  // tells at 30-80 m, and the wider hole also ate the wall between bays that
  // the sills need (section 5). Strip-window styles (`wide`) keep their width:
  // a post-war slab really is glazed nearly bay to bay.
  // WB13: ...and the frame belt is the OTHER end of the same argument. Its opening is
  // a 0.71-0.91 m x 1.22-1.52 m vinyl replacement unit (modal 0.81 x 1.37,
  // docs/typology/08-vinyl-rowhouse.md §5.1) dropped into a 19th-century hole and
  // panned around — the smallest window in the city. The generic 0.50 x bay by 0.66 x
  // floor draws 1.20 x 2.10 m on the same house: a tenement sash, aspect 1.75 where the
  // real one is 1.69 but HALF the area. Undersized is the whole tell of the type.
  const frame13 = WB13 && rec.style === STYLE.FRAME_HOUSE;
  const winW = frame13 ? clamp(0.36 * ww, 0.71, 0.95)
    : FAC8 ? clamp(R.wide ? 0.62 * ww : 0.50 * ww, R.wide ? 0.85 : 0.75, R.wide ? 2.2 : 1.25)
    : clamp(0.62 * ww, 0.85, R.wide ? 2.2 : 1.5);
  const winH = frame13 ? clamp(0.46 * fh, 1.22, 1.58)
    : FAC8 ? clamp((rec.style === STYLE.ROWHOUSE ? 0.70 : 0.66) * fh, 1.5, 2.5)
    : clamp(0.62 * fh, 1.4, 2.3);
  const sfTop = 3.9;                                     // storefront opening head
  // ---- FAC8 TRIM SIZING (docs/notes/facades-r8.md §5) ----------------------
  // A sill that stands 0.11 m off the wall hides 0.11 / tan(theta) metres of
  // wall at incidence theta: on the wallSt canyon the eye sees the facades at
  // 8-12 deg, so each sill occludes 0.5-0.8 m of the 0.35-0.9 m of brick
  // between bays, and a floor of separate sills becomes ONE continuous white
  // band. Two rules keep sills per opening: the stone never grows so wide that
  // the gap closes in plan, and it never projects so far that the gap closes in
  // perspective. A stone office additionally gets a FLUSH head (real limestone
  // spandrel courses are not corbelled) instead of a projecting lintel.
  const stoneStyle = rec.style === STYLE.DECO_MASONRY || rec.style === STYLE.CIVIC_STONE;
  // R12 (plan item D2): SASH PROFILE and the sash's own paint. One recipe gave
  // every tenement in Harlem a 1/1 sash and every brownstone a 2/2, so a row is
  // one window repeated — the tell the blind packs call "a perfect window grid".
  // A real row is a mixture of what each owner replaced and when: 1/1, 2/2 and
  // the surviving 6/6 originals stand next to each other. Three profiles on
  // `deal % 3`, so consecutive lots ALWAYS differ; kit.js keys the pooled part
  // on (style, w x h, recess), so this mints two more window parts per size
  // class and no extra draw call — staticPool.js merges them into the same
  // material bucket. Only the residential styles: a loft's steel sash and a
  // post-war slab's fixed lights are correct as they are.
  const d12w = R12 && rec.deal >= 0
    && (rec.style === STYLE.TENEMENT || rec.style === STYLE.PREWAR_APT || rec.style === STYLE.ROWHOUSE)
    ? rec.deal % 3 : -1;
  const winStyle = d12w < 0 ? R.win
    : (R.win === 'dh2' ? ['dh2', 'dh6', 'dh1'] : ['dh1', 'dh2', 'dh6'])[d12w];
  const bayGap = Math.max(0.05, ww - winW);
  // Both QUANTISED: the kit keys its pooled part id on (material, width,
  // projection), and a continuous projection would mint a new geometry per
  // building — hundreds of one-off 24-vertex boxes that PartPools never frees.
  // 0.05 m on width (q05 in the kit) and 0.01 m here bound the set to ~90 parts.
  const trimOver = Math.round(clamp(Math.min(0.16, bayGap - 0.62), 0, 0.16) * 100) / 100;
  const trimProj = Math.round(clamp(Math.min(stoneStyle ? 0.05 : 0.085, (bayGap - trimOver) * 0.13), 0.022, 0.11) * 100) / 100;
  const trimTint = new THREE.Color().setScalar(stoneStyle ? 0.86 : 0.94);

  for (let i = 0; i < n; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % n];
    const ex = bx - ax, ez = bz - az;
    const len = Math.hypot(ex, ez);
    if (len < 0.3) continue;
    const dx = ex / len, dz = ez / len;
    // generator convention: facade along local X centered on 0, +z outward,
    // building extends into -z. Outward normal of an exterior edge is (dz, -dx),
    // so ry = atan2(dz, -dx) and wall-local u (from a) maps to x = len/2 - u.
    const frame = tmat((ax + bx) / 2, y0, (az + bz) / 2, Math.atan2(dz, -dx));
    const lx = (u) => len / 2 - u;
    const blind = (i < 32 && ((rec.blind >> i) & 1)) || len < 2.2;
    const bayN = Math.floor((len - 0.44) / ww);

    // FOUNDATION SKIRT — the shader path extrudes its prism from `fndY` (well
    // below the terrain) so a wall never floats where the pavement stops short
    // of the lot line; the dresser started its walls exactly AT the record's
    // base, so the same buildings gained a hairline-to-40 cm gap the moment
    // the sidewalk polygon didn't reach them (measured 0.40 m on Lenox Ave,
    // where the pavement is missing and the drawn terrain sits at base-0.40).
    // A below-grade course seals it for good: overshot 2 cm each way so the
    // corners of adjacent walls close, dark and fully grimed like real stone.
    // A projecting base course from SKIRT_H below grade up to the pavement.
    // Overshoots 2 cm along the wall EACH WAY so adjacent walls close at the
    // corners, and stands 2 cm proud of the wall plane so the wall's own bottom
    // edge can never show a hairline against it. Its TOP is exactly at v = 0:
    // the wall above starts there, so the two meet edge to edge with no
    // overlapping — and therefore no z-fighting — faces.
    //
    // LD13 (docs/notes/lod-r13.md §2.6): "edge to edge" is exactly the defect, not the
    // fix — it is the abutment COPING_SINK was written to remove, one storey lower down.
    // THREE surfaces meet at v = 0 on every wall of every dressed building: this skirt's
    // TOP face, the E10 splash course's BOTTOM face, and `punchedWall`'s first box's
    // BOTTOM face. The wall and the splash are both `mat`, so they share a TileMerges
    // bucket and their tie is settled once, at build time, by index order. The skirt is
    // `limestone`/`concrete` — a DIFFERENT bucket, a different mesh — and three sorts
    // opaque draws by distance to each mesh's bounding-sphere centre, which is a function
    // of camera POSITION, so the two meshes swap order as the camera moves and every
    // coplanar pair between them flips with them. Stills clean, film flickering: the
    // exact signature of silhouette-r12 §19's `Mesh` vs `Mesh`, dY = 0.0 mm, ratio 0.
    // Raising the skirt's top LD13_LAP above v = 0 turns both abutments into overlaps.
    // It is invisible: the skirt already stands 2 cm proud and is grimed to 0.55 x tint,
    // so 6 mm more of it reads as the same dark base course.
    if (!NO_DATUM) B.addMerged(R.trim === 'concrete' ? 'concrete' : 'limestone',
      box(len + 0.04, SKIRT_H + (LD13 ? LD13_LAP : 0), WALL_T + 0.02, { segY: 1 }),
      frame.clone().multiply(tmat(0, -SKIRT_H, -(WALL_T + 0.02) / 2 + 0.02)),
      { tint: tint.clone().multiplyScalar(0.55), grime: 0.9 });

    // ---- E10 SPLASH COURSE — the wall/sidewalk contact (docs/notes/edges-r10.md §3).
    // The skirt above seals the joint BELOW grade and is invisible; what the blind pass
    // sees is the metre ABOVE it, where our dressed walls meet the flags with a perfect
    // edge and one soft 22 % gradient. On a real New York wall that metre is a different
    // surface: splash off the pavement, salting, mopping, dog urine and the sweepings a
    // super piles against the building line, with efflorescence blooming pale through it.
    // Built as a 1.7 cm proud course rather than a vertex tint because a tint cannot make
    // a SHADOW LINE, and the shadow line is what says "two surfaces" at 40 m. It overlaps
    // the wall in depth (never abuts — docs/notes/zfight.md §6) and overshoots 1.5 cm each
    // way so adjacent walls close at the corner, exactly like the skirt. One box per wall,
    // merged into the building's own masonry bin: 12 triangles, no draw call.
    // On a storefront wall it is 0.42 m — which is a bulkhead, and correct.
    if (E10 && !NO_DATUM) {
      const shH = (store && len >= 4) ? 0.42 : 1.02;
      const shT = tint.clone().lerp(new THREE.Color(0.60, 0.59, 0.565), 0.42).multiplyScalar(0.88);
      B.addMerged(mat, box(len + 0.03, shH, WALL_T + 0.034, { segY: 1 }),
        frame.clone().multiply(tmat(0, 0, -(WALL_T + 0.034) / 2 + 0.017)),
        { tint: shT, grime: 0.46 });
    }

    if (blind || bayN < 1) {
      // party wall: 2-4 tonal bands (old paint / tar lines) + grime
      const nB = 2 + Math.floor(hash1(cv * 97, i) * 2.99);
      let yb = 0;
      for (let b = 0; b < nB; b++) {
        const y1 = b === nB - 1 ? H : Math.min(H, yb + (H / nB) * (0.7 + 0.6 * hash1(cv * 31, i, b)));
        if (y1 - yb < 0.3) continue;
        B.addMerged(mat, box(len, y1 - yb, WALL_T, { segY: 1 }), frame.clone().multiply(tmat(0, yb, -WALL_T / 2)), {
          tint: tint.clone().multiplyScalar(0.86 + 0.2 * hash1(cv * 53, i, b)), grime: 0.2 + 0.15 * hash1(cv * 7, i, b),
        });
        yb = y1;
      }
      continue;
    }

    const sideM = (len - bayN * ww) / 2;
    const storeHere = store && len >= 4;
    const mStart = storeHere ? Math.max(1, Math.ceil(sfTop / fh)) : 0;
    const mEnd = Math.floor((H - 0.9) / fh);
    const rows = [];
    const doorHere = dWall === i && dBay >= 0 && !storeHere && len > 3.4;
    const uD = doorHere ? clamp(sideM + (dBay + 0.5) * ww, 1.0, len - 1.0) : -1;
    // a stooped building (compiler BF.STOOP — rowhouses AND PLUTO class-C
    // brownstones) has its parlour-floor door at the stoop landing: 10 x 0.170 m
    // (furnitureKit stoop). Older tiles without the flag fall back to the style.
    const stooped = !!(rec.flags & BF.STOOP) || rec.style === STYLE.ROWHOUSE;
    // WB13: a frame house's stoop is 3-6 risers to a 0.50-1.15 m parlour floor, not
    // the brownstone's flight — assemble.js scales the kit stoop by WB13_STOOP_SY
    // (0.62 x 1.70 m = 1.05 m) and the door has to land on the landing it makes.
    const lowStoop = WB13 && stooped && rec.style === STYLE.FRAME_HOUSE;
    const doorW = stooped ? 1.15 : 1.35;
    const doorY = lowStoop ? 1.70 * WB13_STOOP_SY : stooped ? 1.70 : 0.02;
    const doorH = 2.6;
    for (let m = mStart; m < mEnd; m++) {
      // FAC8: the sill drops with the taller opening so the HEAD stays at
      // 0.86-0.87 of the floor — 0.30 + 0.66 would have put it at 0.96, with
      // no spandrel left between the lintel and the floor slab above.
      const sill = m * fh + (FAC8 ? (rec.style === STYLE.ROWHOUSE ? 0.16 : 0.21) : 0.3) * fh;
      if (sill + winH > H - 0.8) break;
      const openings = [];
      for (let k = 0; k < bayN; k++) {
        const u = sideM + (k + 0.5) * ww;
        if (doorHere && m === 0 && Math.abs(u - uD) < ww * 0.5 + 0.3) continue;   // door takes this bay
        // ---- WL11 (docs/notes/lattice-r11.md): bay jitter and sill noise on the DRESSED
        // path. The test above and `uD` are both computed on the UNJITTERED u, and the
        // door bay is pinned to zero offset, so the stoop still lands on its door
        // (assemble.js doorAnchors, owner 2026-09-11).
        // Position and sill height only — NOT width: kit.js keys the window/sill/lintel
        // pool id on q05(w), so a jittered width would mint three pooled parts where
        // there was one, i.e. three times the dresser's draw calls for a 2 cm effect.
        // The sill offset moves y0 and y1 TOGETHER: K.window's part is a fixed winH and
        // the punched hole has to match it exactly or the wall cavity shows at the head.
        let ju = 0, jy = 0, brickK = false;
        if (WL11) {
          const pin = (doorHere && k === dBay) ? 0 : 1;
          const bkv = (k % 64) + (m % 64) * 64 + 1;
          ju = (wlHash(cvI + 17, k + 1) * 2 - 1) * 0.028 * ww * pin;
          jy = (wlHash(cvI + 89, bkv) * 2 - 1) * 0.02;
          if (bayN >= 2 && wlHash(cvI + 211, 3) < 0.38) {
            const rate = (k === 0 || k >= bayN - 1) ? 0.20 : 0.025;
            brickK = (wlHash(cvI + 401, bkv) < rate || wlHash(cvI + 307, k + 1) < 0.05)
              && !(doorHere && m <= 1) && !(doorHere && k === dBay) && !(storeHere && m <= mStart);
          }
        }
        openings.push({ x: lx(u + ju), w: winW, u, k, m, y0: sill + jy, y1: sill + jy + winH, brickK });
      }
      let ry0 = sill, ry1 = sill + winH;
      for (const o of openings) { ry0 = Math.min(ry0, o.y0); ry1 = Math.max(ry1, o.y1); }   // WL11: the band spans the jittered sills
      if (doorHere && m === 0) {
        // door and ground-floor windows share one row band (per-opening y ranges)
        openings.push({ x: lx(uD), w: doorW + 0.1, y0: doorY, y1: doorY + doorH + 0.06, door: true });
        ry0 = Math.min(ry0, doorY); ry1 = Math.max(ry1, doorY + doorH + 0.06);
      }
      if (openings.length) rows.push({ y0: ry0, y1: ry1, openings });
    }
    if (storeHere) {
      // storefront units: one opening each, piers of 0.5 m between them
      const nU = Math.max(1, Math.round((len - 0.6) / 5.8));
      const uw = (len - 0.4) / nU;
      const firstSill = rows.length ? rows[0].y0 : H;
      const y1 = Math.min(sfTop, firstSill - 0.08);
      const ops = [];
      for (let j = 0; j < nU; j++) ops.push({ x: lx(0.2 + (j + 0.5) * uw), w: uw - 0.5, store: true, uw });
      rows.unshift({ y0: 0.02, y1, openings: ops });
    }
    // WL11: a bricked-up opening is NOT punched — the wall runs solid through it — but it
    // still gets its sill and its lintel below, which is exactly what a filled opening
    // looks like from the street (the stone stays, the hole goes). Filtering here rather
    // than at the push keeps the dressing loop's per-opening data intact.
    const punchRows = WL11 ? rows.map((r) => (r.openings.some((o) => o.brickK)
      ? { ...r, openings: r.openings.filter((o) => !o.brickK) } : r)) : rows;
    // A STONE BASE (BUILDING_OVERRIDES `base: { wall, floors }`, read off the references): the lower floors in their own
    // masonry, split at a floor line so no window straddles it — 1217 Amsterdam is limestone ashlar for three storeys
    // under its buff brick, 1225 has a two-storey rusticated limestone base
    const yB = rec.baseWall && rec.baseFloors > 0 && FAMILY_LUM[rec.baseWall] != null ? Math.min(H - 2, rec.baseFloors * fh) : 0;
    if (yB > 0) {
      const sh = (o) => ({ ...o, y0: o.y0 === undefined ? undefined : o.y0 - yB, y1: o.y1 === undefined ? undefined : o.y1 - yB });
      const lower = punchRows.filter((r) => r.y1 <= yB + 0.02);
      const upper = punchRows.filter((r) => r.y0 >= yB - 0.02).map((r) => ({ ...r, y0: r.y0 - yB, y1: r.y1 - yB, openings: r.openings.map(sh) }));
      punchedWall(ctx, frame, { width: len, height: yB, depth: WALL_T, mat: rec.baseWall, tint: new THREE.Color(1.0, 0.98, 0.94), rows: lower, grime: 0.18, aoTop: y0 + H });
      punchedWall(ctx, frame.clone().multiply(tmat(0, yB, 0)), { width: len, height: H - yB, depth: WALL_T, mat, tint, rows: upper, grime: 0.22, aoTop: y0 + H });
    } else punchedWall(ctx, frame, { width: len, height: H, depth: WALL_T, mat, tint, rows: punchRows, grime: 0.22, aoTop: y0 + H });

    // windows, sills, lintels, AC units
    // R12: the ORIGINAL sash paint is dealt too. WL11 already scatters replaced
    // units (white vinyl, mill aluminium, a dark one) through a building, but
    // every building's UNREPLACED sash was the one kit colour, so a row read as
    // one paint job with noise on it. New York's three are white, warm cream and
    // the dark green-black of an un-restored original. Channel 4; the WL11
    // replacement logic below still overrides per opening, which is the right
    // order — a replaced sash does not know what the building's original was.
    const d12sp = R12 ? r12Deal(rec, 4) : -1;
    const sashTint = R.loft ? new THREE.Color(0.22, 0.22, 0.23)
      : (d12sp < 0 ? null : d12sp < 0.42 ? null
        : d12sp < 0.78 ? new THREE.Color(1.04, 1.00, 0.91) : new THREE.Color(0.60, 0.63, 0.58));
    for (const row of rows) {
      for (const op of row.openings) {
        if (op.store) {
          // FAC8 STOREFRONT VARIETY (docs/notes/facades-r8.md §7). The kit has
          // had awnings and a full roll-down gate since round 6 and the dresser
          // asked for NEITHER: awningIndex was hard -1 and only 18 % of units
          // got the narrow partial gate, so an avenue block was 30 identical
          // glass boxes with 30 identical sign bands. On 125th St the real
          // rhythm is roughly: 45 % awning, 18 % closed gate, 14 % partial
          // gate over the entry, the rest open glazing — and the closed ones
          // are what break the repeat.
          const sfR = hash1(cv * 311, i, op.x * 3.1);
          K.storefront({
            width: op.uw,
            signIndex: Math.floor(hash1(cv * 211, i, op.x) * 64),
            awningIndex: FAC8 && sfR < 0.45 ? Math.floor(hash1(cv * 407, i, op.x * 1.7) * 64) : -1,
            gate: FAC8 ? (sfR > 0.90 ? 2 : sfR > 0.76 ? 1 : 0) : (hash1(cv * 17, i, op.x) < 0.18 ? 1 : 0),
            entrySide: hash1(cv * 5, i) < 0.5 ? 1 : -1,
          }, frame.clone().multiply(tmat(op.x, 0, 0)));
          continue;
        }
        if (op.door) {
          K.door({ w: doorW, h: doorH, style: rec.style === STYLE.ROWHOUSE ? 'paneled' : 'paneled', transom: true },
            frame.clone().multiply(tmat(op.x, doorY, 0)), { tint: new THREE.Color().setHSL(hash1(cv * 3, i) * 0.1 + 0.02, 0.35, FD14 ? 0.24 : 0.16) });
          // THRESHOLD: kit.door's 0.38 m entrance reveal has jambs and a head
          // but no floor, and the slab starts at doorY (+0.02) — so the recess
          // was open at the bottom: a 2 cm slot into the wall cavity under
          // every street door, right where the AO pass darkens it. A stone
          // threshold fills the reveal floor and buries its own bottom 6 cm
          // below grade so the pavement can never undercut it. (Rowhouses
          // keep their stoop; doorY there is the stoop top, not the flags.)
          //
          // ---- FD14 (critic-r14 fix 7): THE PARLOUR DOOR IS A BLACK VOID.
          // `kit.js K.door` does build a panelled leaf — but it stands at z = -0.33 m
          // inside a 0.38 m reveal, painted at HSL L 0.16, under an AO pass; and the
          // kit's own `surroundTint` option is accepted and never used, so there is no
          // architrave anywhere in the city. What a brownstone entrance actually shows
          // from the far pavement, in order: the SURROUND (two pilasters and a bracketed
          // hood, in the building's trim stone — this is what draws the doorway), then
          // the glazed upper panel of the leaf, then the panel mouldings. So: the
          // surround is built here in the trim material, the leaf's upper panel is
          // glazed, and the paint value goes to L 0.24 (a dark door still reads dark —
          // 0.16 with cityAO on top of it is a hole). Merged boxes, no new pooled part.
          if (FD14) {
            const trimM = R.trim === 'brownstone' ? 'brownstone' : R.trim === 'concrete' ? 'concrete' : 'limestone';
            const surT = trimTint.clone().multiplyScalar(0.94);
            const dj = doorW / 2 + 0.09;
            for (const sgn of [-1, 1]) {                                   // pilasters
              B.addMerged(trimM, box(0.18, doorH + 0.16, 0.11, { segY: 1 }),
                frame.clone().multiply(tmat(op.x + sgn * dj, doorY - 0.04, 0.055)), { tint: surT });
              B.addMerged(trimM, box(0.12, 0.26, 0.19, { segY: 1 }),       // console under the hood
                frame.clone().multiply(tmat(op.x + sgn * dj, doorY + doorH - 0.10, 0.095)), { tint: surT });
            }
            B.addMerged(trimM, box(doorW + 0.46, 0.17, 0.17, { segY: 1 }),  // entablature
              frame.clone().multiply(tmat(op.x, doorY + doorH + 0.12, 0.085)), { tint: surT });
            B.addMerged(trimM, box(doorW + 0.58, 0.09, 0.25, { segY: 1 }),  // hood cap
              frame.clone().multiply(tmat(op.x, doorY + doorH + 0.29, 0.125)), { tint: surT });
            // glazed upper panel, one per leaf, just proud of the kit's panel boxes
            const dLeaf = doorH - 0.55, nLf = doorW > 1.15 ? 2 : 1, lwF = (doorW - 0.06) / nLf;
            for (let lf = 0; lf < nLf; lf++) {
              const cxF = -doorW / 2 + 0.03 + lwF * (lf + 0.5);
              B.addMerged('glass', box(lwF * 0.60, dLeaf * 0.32, 0.02, { segY: 1 }),
                frame.clone().multiply(tmat(op.x + cxF, doorY + dLeaf * 0.53, -0.272)), {});
            }
          }
          continue;
        }
        const wy = op.y0 ?? row.y0;
        const lit = hash1(cv * 131, op.k * 7 + 1, op.m * 13 + 2) < litP;
        // ---- WL11: REPLACED SASHES (5-10 %, clustered per flat) and BRICKED openings.
        // The dresser gave every window in the city one sash colour; a New York building
        // over forty years old carries a scatter of white vinyl and mill-aluminium units
        // among its originals, because sashes get replaced one apartment at a time.
        // Colour only — `kit.js` keys the window part on (style, q05(w) x q05(h), recess),
        // so a per-window tint rides the existing pooled part for free while a different
        // PROFILE would mint a second pool. The shader path carries the profile change.
        let wSash = sashTint;
        if (WL11 && !op.brickK) {
          const bkv2 = (op.k % 64) + (op.m % 64) * 64 + 1;
          const rr = wlHash(cvI + 613, ((op.k >> 1) % 64) + (op.m % 64) * 64 + 1);
          const rw = wlHash(cvI + 727, bkv2);
          if ((rr < 0.12 && rw < 0.62) || rw < 0.022) {
            const rc = wlHash(cvI + 829, bkv2);
            wSash = rc < 0.62 ? new THREE.Color(0.80, 0.795, 0.775)
              : rc < 0.86 ? new THREE.Color(0.52, 0.53, 0.545)
                : new THREE.Color(0.16, 0.145, 0.125);
          }
        }
        // the sill and the lintel below are emitted for a bricked opening TOO — the stone
        // stays when the hole is filled, and it is what makes the infill read as a window
        if (!op.brickK) {
          // FD14 (critic-r14 runner-up, "wbS1st's loft windows are flat grey panels with no
          // frame, reveal or mullion"): probe_bldg says that building is STYLE.POSTWAR_BRICK,
          // whose recipe is `win: 'fixed', wide: true` — and the kit's `fixed` part is a
          // perimeter frame and nothing else, so a 2.2 m opening renders as one flat sheet.
          // Every wide commercial/loft unit that size is MULLIONED: a centre mullion and a
          // transom bar at least. `steel` with a 2x2 or 3x2 grid is that unit, and it rides
          // the same pooled-part key (style + size + panes), so it costs no draw call.
          const fdWide = FD14 && (R.wide || R.loft) && winW > 1.25;
          K.window({
            w: winW, h: winH, style: fdWide ? 'steel' : winStyle, recess: fdWide ? 0.16 : 0.14,   // R12: dealt profile
            panesX: fdWide ? clamp(Math.round(winW / 1.0), 2, 3) : 4,
            panesY: fdWide ? clamp(Math.round(winH / 0.95), 2, 3) : 3,
          }, frame.clone().multiply(tmat(op.x, wy, 0)), { lit, tint: wSash });
        }
        if (R.sills) {
          if (FAC8) {
            K.sill(winW, frame.clone().multiply(tmat(op.x, wy, 0)),
              { mat: R.trim, over: trimOver, proj: trimProj, tint: trimTint });
            // a stone office's window head is a flush course, not a shelf
            K.lintel(winW, frame.clone().multiply(tmat(op.x, wy + winH, 0)),
              { mat: R.trim, style: 'flat', over: trimOver, proj: stoneStyle ? 0.02 : Math.round(trimProj * 80) / 100, tint: trimTint });
          } else {
            K.sill(winW, frame.clone().multiply(tmat(op.x, wy, 0)), { mat: R.trim });
            K.lintel(winW, frame.clone().multiply(tmat(op.x, wy + winH, 0)), { mat: R.trim, style: 'flat' });
          }
        }
        // ---- WL11: AC units. refs/streetview/morningside has a unit in a quarter of the
        // openings, each hard LEFT or hard RIGHT in its sash (nobody centres one) and
        // clustered by apartment — ours were centred, independent, and never on the
        // bricked openings they now have to avoid. `R.ac` stays the per-style rate; what
        // changes is the correlation and the placement.
        const acR11 = WL11
          ? (op.brickK ? 1 : wlHash(cvI + 1667, (op.k % 64) + (op.m % 64) * 64 + 1) * 0.45
            + wlHash(cvI + 1789, ((op.k >> 1) % 64) + (op.m % 64) * 64 + 1) * 0.55)
          : hash1(cv * 71, op.k * 3, op.m * 5 + i);
        if (R.ac > 0 && op.m > 0 && acR11 < R.ac) {
          const acDx = WL11 ? (wlHash(cvI + 1907, (op.k % 64) + (op.m % 64) * 64 + 1) < 0.5 ? -1 : 1) * winW * 0.19 : 0;
          K.acUnit(frame.clone().multiply(tmat(op.x + acDx, wy + 0.04, 0.02)));
        }
      }
    }
    // ---- FAC8 BASE - SHAFT - CAP (docs/notes/facades-r8.md §5) -------------
    // A limestone office is not a uniform grid of punched holes from pavement
    // to parapet: it is a rusticated base of two or three tall storeys, a plain
    // shaft, and a capital of one or two storeys under the cornice. Wall St
    // rendered as one grid all the way up, which is the second half of why the
    // canyon reads as striped wallpaper. Everything here is merged into this
    // building's own masonry bins: no extra draw call, ~8 boxes per wall.
    if (FAC8 && stoneStyle && !blind && len > 3.2 && H > 12) {
      const baseTop = clamp(Math.round((storeHere ? sfTop + 1.1 : fh * 2) / fh) * fh, 4.6, Math.min(12.5, H * 0.34));
      // rusticated ashlar: shallow raised courses, deep shadow line between
      for (let yb2 = 0.95; yb2 < baseTop - 0.45; yb2 += 0.92) {
        B.addMerged('graniteBase', box(len - 0.03, 0.07, 0.09, { segY: 1 }),
          frame.clone().multiply(tmat(0, yb2, 0.005)), { tint: new THREE.Color().setScalar(0.8), grime: 0.55 });
      }
      // water table: the projecting band that ends the base
      B.addMerged('limestone', box(len + 0.02, 0.28, 0.17, { segY: 1 }),
        frame.clone().multiply(tmat(0, baseTop, 0.03)), { tint: trimTint, grime: 0.35 });
      // capital: a string course two storeys under the parapet, and a second
      // thinner one just above it, so the top of the shaft reads as a cap
      const capY = clamp(H - Math.max(2.2 * fh, H * 0.11), baseTop + fh * 2, H - 1.6);
      B.addMerged('limestone', box(len + 0.02, 0.22, 0.13, { segY: 1 }),
        frame.clone().multiply(tmat(0, capY, 0.02)), { tint: trimTint });
      B.addMerged('limestone', box(len + 0.02, 0.11, 0.09, { segY: 1 }),
        frame.clone().multiply(tmat(0, capY + 0.62, 0.01)), { tint: trimTint });
    }
    // cornice along the wall top
    if ((R.cornice || (FAC8 && stoneStyle && H > 12)) && ((rec.flags & BF.CORNICE) || (FAC8 && stoneStyle && H > 12)) && len > 3) {
      // FAC8 cornice SCALE: the pre-war residential crown carries 1.45x, which
      // takes it from 0.48 m projection / 0.52 m face to 0.70 / 0.75 — inside
      // the real 0.6-0.9 / 0.7-1.2 range, and deep enough to throw the shadow
      // line that reads as a cornice from the far pavement. Stone offices keep
      // 1.0: a limestone office cornice really is a shallower moulding, and it
      // now sits on top of the string courses added above.
      // R12 (plan item D2): CORNICE DEPTH AND BRACKETS are dealt. A flat 1.45
      // put the same 0.70 m projection and the same bracket pitch on every
      // pre-war building in the frame, and the cornice line is the strongest
      // horizontal a row has — at 150 m a block of them is one ruled line with
      // one shadow under it. The real range is 0.6-0.9 m of projection, and
      // whether a cornice is bracketed at all is a period/price decision per
      // building, not a length threshold. Channel 3, quantised to 0.05 because
      // kit.js keys the BRACKET part on `scale.toFixed(2)` (the moulding itself
      // is addMerged and costs nothing per variant, but a continuous scale here
      // would mint an unbounded set of bracket parts, which PartPools never
      // frees). `len < 30` stays: a 30 m frontage with brackets is a warehouse.
      const d12c = R12 ? r12Deal(rec, 3) : -1;
      const cs = FAC8 && !stoneStyle
        ? (d12c >= 0 ? Math.round((1.18 + d12c * 0.54) * 20) / 20 : 1.45) : 1;
      const cornTint = tint.clone().multiplyScalar(FAC8 ? 0.7 : 0.82);
      const brOn = len < 30 && !(FAC8 && stoneStyle) && (d12c < 0 || d12c > 0.22);
      // FD14: the PI yaw is the fix — see the block below. `?fd14=0` restores the
      // un-yawed call (moulding inside the wall, brackets alone, hatch and all).
      if (!(FD14 && frame13)) {
        K.cornice(len - 0.06, frame.clone().multiply(tmat(0, H - 0.62 * cs, 0, FD14 ? Math.PI : 0)), {
          profile: 'main', tint: cornTint,
          brackets: FD14 ? false : brOn,
          scale: cs,
        });
      }
      // ---- FD14 (docs/notes/fd14.md, critic-r14 fix 7): THE BAND THE BRACKETS CARRY.
      // `K.cornice` merges `profileAlongX(prof, width)`, and profileAlongX (geo.js:46)
      // extrudes its profile with "out" toward **-Z** — every generator caller compensates
      // with a PI yaw (brownstone.js:913 `at(F,0,H,0,Math.PI)`), the dresser did not, and the
      // dresser's frame has +Z OUTWARD (the convention comment at the top of this loop).
      // So the whole Italianate moulding has been extruded INTO the building since FAC8, and
      // only the instanced brackets ever showed: the critic's "row of floating teeth", on
      // every plate in the set. The profile's back wall also landed exactly coplanar with the
      // wall face over len x 0.52*cs m, FRONT-facing (rotateY(+PI/2) turns its -x normal into
      // +z) — at grazing incidence that z-fight resolves per pixel and draws the "diagonal
      // hatch streaks in the mortar" (fd14/before/hatch.png at 9x: the dashes are
      // cornicePaint-coloured, not mortar; there is no diagonal term in the facade shader).
      // The yaw above fixes both at once: the moulding projects outward, and its back wall
      // now faces INTO the building, where backface culling drops it.
      // What the yaw would break is the kit's BRACKETS — they are composed at +z in the same
      // frame and would flip inward — so they are drawn here instead, and lowered 0.30*cs so
      // they hang UNDER the band (the kit put their feet at its base, where the corona would
      // now swallow them). Body projects 0.30*cs and the cap 0.38*cs against the moulding's
      // 0.48*cs, i.e. the band overhangs its brackets, which is the Italianate order.
      // One pooled part per dealt scale (cs is quantised to 0.05), ~14 instances per wall.
      if (FD14 && brOn && !frame13) {
        const bId = `fd14:corbel:${cs.toFixed(2)}`;
        if (!B.hasPart(bId)) {
          const bg = mergeGeoms([
            box(0.13 * cs, 0.46 * cs, 0.30 * cs, { segY: 1 }).translate(0, 0, 0.15 * cs),
            box(0.17 * cs, 0.08 * cs, 0.38 * cs, { segY: 1 }).translate(0, 0.46 * cs, 0.19 * cs),
          ]);
          B.definePart(bId, bg, 'cornicePaint');
        }
        const cy = H - 0.62 * cs - 0.30 * cs;
        const nB = Math.max(2, Math.round((len - 0.06) / (0.8 * cs)));
        for (let bI = 0; bI <= nB; bI++) {
          B.addInstance(bId, frame.clone().multiply(tmat(-(len - 0.06) / 2 + ((len - 0.06) / nB) * bI, cy, 0.02)), cornTint);
        }
      }
      // FD14: …and the frame belt does NOT get an Italianate crown. WB13 §2.3 calls the
      // boxed aluminium-coil cornice the typology's "strongest single authenticity
      // variable": a flat fascia over a dark vented soffit, no brackets, no mouldings.
      // The tile shader already draws it that way (materials.js, the `cornice && sidingS`
      // branch); the dresser was still handing a sided house the masonry moulding.
      if (FD14 && frame13) {
        B.addMerged('cornicePaint', box(len - 0.04, 0.40, 0.26, { segY: 1 }),
          frame.clone().multiply(tmat(0, H - 0.40, 0.11)), { tint: new THREE.Color(0.96, 0.95, 0.92) });
        B.addMerged('cornicePaint', box(len - 0.08, 0.10, 0.22, { segY: 1 }),
          frame.clone().multiply(tmat(0, H - 0.50, 0.09)), { tint: new THREE.Color(0.40, 0.40, 0.39) });
      }
    }
    // parapet + coping (behind the cornice, so the roofline never reads as a knife edge)
    //
    // COPING_SINK (docs/notes/glitch-r7.md 3.1, zfight.md 7 / C2). The coping used
    // to START at exactly the parapet's top, `H + 0.7`: bottom-origin boxes, so
    // the parapet's top face and the coping's bottom face were EXACTLY coplanar
    // over 204-249 m2 per framing — and the two are in DIFFERENT material meshes
    // (`nyc:merge:<tile>:brickRed` vs `:limestone`), which is what makes an exact
    // tie a MOTION artefact rather than a still-frame one: no depth bias can
    // separate 0 mm, so the winner is decided by draw order, and three sorts
    // opaque draws by distance to each mesh's bounding-sphere centre
    // (engine.js `_opaqueSortBS`) — a function of camera POSITION. Two dresser
    // meshes whose centres are nearly equidistant swap order as the camera moves,
    // and every coplanar pair between them flips with them. Stills are stable and
    // the film flickers, which is exactly the report.
    // The fix is to OVERLAP instead of ABUT: sink the coping 5 mm into the
    // parapet. The coping is 0.38 deep against the parapet's 0.30 and 0.04 longer,
    // so it already covers the parapet's whole top face — burying that face 5 mm
    // deeper changes no silhouette and no visible surface, and leaves no coplanar
    // pair anywhere in the roofline.
    const COPING_SINK = GFIX ? 0.005 : 0;
    // FAC8: the SAME height rule as the tile path (assemble.js fac8Parapet).
    // A dressed building's parapet was a flat 0.7 m against the shader path's
    // 0.55-1.15 m, so a building's roofline JUMPED as it crossed DRESS_R at
    // 150 m — a pop in every dolly that approaches a block.
    const parH0 = FAC8 ? parapetH(rec) : 0.7;
    // R12 (plan item S1, dresser half — notes §5.1). assemble.js r12FireWalls
    // carries every PARTY WALL up past the roof as a fire wall, which is what
    // steps a row's roofline; the dresser hides the tile facade of the 48
    // buildings it owns, so without this the same row LOSES its steps inside
    // 150 m and gets them back outside it. Same deal channel, same 0.28-0.95 m
    // range and the SAME edge index `i` as the tile path — the two iterate the
    // same world ring in the same order, so a building's fire walls are the
    // same height on both sides of DRESS_R and nothing pops.
    // Cut as a taller parapet on that edge rather than as a separate prism: on
    // a lot line there is no street side to show the lower coping to, and the
    // silhouette — which is the whole point — is identical.
    // the mask bit itself, not `blind` — `blind` also folds in `len < 2.2`, and
    // a 2 m return is not a lot line (the tile path refuses those too).
    const isParty = i < 32 && ((rec.blind >> i) & 1) && len >= 2.2;
    const fwOn = R12 && FAC8 && isParty && rec.height >= 6;
    const fwD = fwOn ? (r12Deal(rec, 1) >= 0 ? r12Deal(rec, 1) : (rec.colorVar * 23.9) % 1) : -1;
    const parH = fwD >= 0
      ? parH0 + 0.05 + 0.28 + ((fwD + i * 0.31) % 1) * 0.67
      : parH0;
    B.addMerged(mat, box(len - 0.02, parH, 0.3, { segY: 1 }), frame.clone().multiply(tmat(0, H, -0.15)), { tint });
    B.addMerged(R.trim === 'concrete' ? 'concrete' : 'limestone',
      box(len + 0.04, 0.08 + COPING_SINK, 0.38, { segY: 1 }),
      frame.clone().multiply(tmat(0, H + parH - COPING_SINK, -0.15)), {});
  }

  // roof deck: earcut fill of the footprint.
  // The rooftop engine claims every roof prop at EXACTLY rec.baseY + height
  // (assemble.js passes roofYt = topY into buildRoof's claim closure), so the
  // deck must land on that plane. It used to sit at topY - 0.02, which floated
  // every vent, AC unit and duct 2 cm with an AO band under it and left a 2 cm
  // slot where the deck met the parapet. 3 mm PROUD instead: props sink an
  // invisible 3 mm, and the deck still wins the depth test against the tile's
  // own roof fill at topY if the per-building hide texture is unavailable.
  {
    const roofDeckY = y0 + H + (NO_DATUM ? -0.02 : 0.003);
    const flat = [];
    for (const [x, z] of ring) flat.push(x, z);
    // CY12 (docs/notes/courtyards-r12.md): a pre-war block is a DONUT and this deck is the
    // lid on it. `rec.holes` is assemble.js's court rings, already wound CW, so they go in
    // as earcut hole lists and the dresser's deck is punched exactly where the tile's own
    // roof fill is. The court walls, floor and parapet are NOT rebuilt here — they stay in
    // the tile mesh under a sentinel bid the hide texture never reaches.
    let holeIdx = null;
    if (rec.holes && rec.holes.length) {
      holeIdx = [];
      for (const h of rec.holes) { holeIdx.push(flat.length / 2); for (const [x, z] of h) flat.push(x, z); }
    }
    const tris = earcut(flat, holeIdx);
    if (tris.length) {
      const pos = new Float32Array(tris.length * 3), nrm = new Float32Array(tris.length * 3), uv = new Float32Array(tris.length * 2);
      // RF13 (owner 2026-09-16: "avoid non-aligned textures on the rooftops"): the deck texture is laid in the
      // BUILDING'S frame — along its longest parapet edge, from that edge's first vertex — instead of world X/Z,
      // so the roll seams and gravel of the map run with the parapets like a real membrane does.
      let rfBest = -1, rfI = 0;
      for (let i = 0; i < ring.length; i++) { const a = ring[i], b2 = ring[(i + 1) % ring.length]; const l = (b2[0] - a[0]) ** 2 + (b2[1] - a[1]) ** 2; if (l > rfBest) { rfBest = l; rfI = i; } }
      const rfA = ring[rfI], rfB = ring[(rfI + 1) % ring.length];
      const rfAng = Math.atan2(rfB[1] - rfA[1], rfB[0] - rfA[0]), rfC = Math.cos(rfAng), rfS = Math.sin(rfAng);
      for (let t = 0; t < tris.length; t += 3) {
        // reverse winding so the face points up (ring is shoelace-positive in x,z)
        const ids = [tris[t], tris[t + 2], tris[t + 1]];
        for (let q = 0; q < 3; q++) {
          const vi = ids[q];
          const o = t + q;
          pos[o * 3] = flat[vi * 2]; pos[o * 3 + 1] = roofDeckY; pos[o * 3 + 2] = flat[vi * 2 + 1];
          nrm[o * 3] = 0; nrm[o * 3 + 1] = 1; nrm[o * 3 + 2] = 0;
          const rdx = flat[vi * 2] - rfA[0], rdz = flat[vi * 2 + 1] - rfA[1];
          uv[o * 2] = rfC * rdx + rfS * rdz; uv[o * 2 + 1] = -rfS * rdx + rfC * rdz;   // RF13 building-frame UVs
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(Array.from({ length: tris.length }, (_, k) => k));
      const roofMat = rec.greenRoof ? 'roofGravel'
        : FAC8 ? (ROOF_MATS8[rec.fmemb ?? 0] || 'roofGravel')
          : (ROOF_MATS[rec.membrane ?? 1] || 'roofBlack');
      B.addMerged(roofMat, g, new THREE.Matrix4(), { tint: rec.greenRoof ? new THREE.Color(0.55, 0.7, 0.4) : null });
      g.dispose();
    }
  }
}

// ---------------------------------------------------------------------------
export class NycDresser {
  constructor(scene, { night = () => 0 } = {}) {
    const t0 = performance.now();
    const { M, extra } = createMaterials();
    if (FAC8) fac8Calibrate(M);
    // City AO on the dresser's opaque generator materials (materials-r9.md "biggest thing
    // still broken": these 66 materials were the last opaque layer outside applyCityAO, so a
    // dressed wall kept all of its ambient while the shader facade next to it kept 0.32-0.45
    // in a canyon — the same mechanism that drew the Wall St ladder). Glass, metals and the
    // emissive/unlit fills are left alone, as applyLightTrim leaves them. `?dressao=0` A/B.
    if (!(typeof location !== 'undefined' && new URLSearchParams(location.search).get('dressao') === '0')) {
      let n = 0;
      for (const [name, m] of M) {
        if (!m || !m.isMeshStandardMaterial || m.transparent || (m.transmission || 0) > 0) continue;
        if (m.emissive && m.emissive.getHex() !== 0) continue;
        if (/glass|metal|chrome|steel|iron|lit|light|glow|neon|copper|brass|bronze|alum/i.test(name)) continue;
        applyCityAO(m); n++;
      }
      console.log(`[nycDress] city AO applied to ${n} of ${M.size} generator materials`);
    }
    console.log(`[nycDress] generator materials ready in ${(performance.now() - t0).toFixed(0)}ms (${M.size} materials)`);
    this.M = M; this.extra = extra;
    this.scene = scene;
    this.night = night;
    this.pools = new PartPools(scene, M);
    this.merges = new TileMerges(scene, M);
    this.tiles = new Map();    // tileKey -> { recs, hideTex }
    this.active = new Map();   // recKey -> { group, handles, tile, bid }
    this.queue = [];
    this._queued = new Set();
    this._acc = 0;
    this._nightOn = null;
    this.stats = { built: 0, ms: 0, skipped: 0 };
    this._evict = null;        // LD13: the slot the next completed build pays for
    // LD13 (docs/notes/lod-r13.md): a handle for the offline probes. `window.__DRESS()`
    // is a closure that returns COUNTS, so no harness could ask which record is dressed,
    // what its hide texel reads or how many bays its front has — which is the whole
    // question this round is about. Read-only diagnostics; nothing in the app uses it.
    // `__LD13_SET` flips the round's behaviour at runtime so ONE page can A/B the whole
    // LOD schedule against itself (a second page is a second tile stream, a second warm-up
    // and a second GPU slot, which is how a schedule measurement gets confounded).
    if (typeof window !== 'undefined') {
      window.__LD13 = this;
      window.__LD13_SET = (v) => { LD13 = !!v; return LD13; };
    }
    // the generator's night dimming of unlit rooms / lit shop interiors
    this._rf = M.get('roomFill'); this._sf = M.get('shopFill');
  }
  setTile(key, data) {
    const recs = (data.bldgs || []).filter(dressable);
    this.tiles.set(key, { recs, hideTex: data.hideTex || null });
  }
  removeTile(key) {
    const t = this.tiles.get(key);
    if (t) for (const r of t.recs) this._undress(r.key);
    this.tiles.delete(key);
  }
  // LD13 (docs/notes/lod-r13.md §2.5). This is the hero ring's hand-off test
  // (main.js:67 — `heroes.skip = (recKey) => dresser.owns(recKey)`), and answering
  // "queued OR active" was the round's headline LOD bug. The sequence it produced:
  //   1. the rescan pushes a record onto the dress queue      -> owns() true
  //   2. the hero ring drops that building's whole appliqué   -> no reveals, no frames,
  //      no sills, no lintels, no corbel brackets, no cornice
  //   3. the tile facade is STILL the thing being drawn, because the hide texel is only
  //      set when `_dress` completes
  //   4. `_dress` runs against BUDGET_MS = 6 ms with builds of 10-40 ms, i.e. at most one
  //      building per frame, so a 48-slot refill takes up to 48 frames (1.6 s at 30 fps)
  // — for all of which the building draws a BARE shader facade. That is the owner's
  // "building fronts disappearing", and it is a race between two rings, not a hide bug.
  // Answering `active` only means the trim goes in the frame AFTER the kit wall is
  // actually in the scene, which is the invariant this round is about: a facade is never
  // between two representations. (heroFacades.js runs the `skip` sweep every frame now,
  // so the reverse overlap — hero trim over a dressed wall — lasts one frame, not twenty.)
  owns(recKey) { return LD13 ? this.active.has(recKey) : (this.active.has(recKey) || this._queued.has(recKey)); }
  update(px, pz) {
    const nightOn = this.night() > 0.5;
    if (nightOn !== this._nightOn) {
      this._nightOn = nightOn;
      this.pools.setNight(nightOn);
      if (this._rf) this._rf.color.setScalar(nightOn ? 0.3 : 1.0);
      if (this._sf) this._sf.color.setScalar(nightOn ? 0.85 : 1.0);
    }
    // build within the frame budget
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < BUDGET_MS) {
      const rec = this.queue.shift();
      this._queued.delete(rec.key);
      if (this.active.has(rec.key)) continue;
      if (Math.hypot(rec.cx - px, rec.cz - pz) > DROP_R) continue;
      const tile = this.tiles.get(rec.tile);
      if (!tile) continue;
      this._dress(rec, tile);
    }
    this.pools.flush();
    if (++this._acc < 15) return;      // rescan ~4x/sec
    this._acc = 0;
    // LD13: a pending eviction is only ever paid for by a COMPLETED build. If the
    // candidate that was meant to pay for it never built (its tile was unloaded, or it
    // left DROP_R while queued) the debt would otherwise stand forever and the
    // nearest-first policy would silently switch itself off. An empty queue means there
    // is no build left to pay it, so forget it and let the next rescan decide again.
    if (LD13 && this._evict && !this.queue.length) this._evict = null;
    const cands = [];
    for (const t of this.tiles.values()) {
      for (const r of t.recs) {
        const d = Math.hypot(r.cx - px, r.cz - pz);
        if (this.active.has(r.key)) { if (d > DROP_R) this._undress(r.key); }
        else if (d < DRESS_R && !this._queued.has(r.key)) cands.push({ r, d });
      }
    }
    cands.sort((a, b) => a.d - b.d);
    const room = MAX_DRESS - this.active.size - this.queue.length;
    for (const c of cands.slice(0, Math.max(0, room))) { this.queue.push(c.r); this._queued.add(c.r.key); }
    // LD13 (docs/notes/lod-r13.md §2.3): the 48 slots used to be FIRST COME. A slot is
    // only released at DROP_R = 190 m, so once the ring is full every building that comes
    // into frame AFTER it filled stays on the shader facade no matter how near it gets.
    // On the ad's mBrownstone the camera travels 22 m and NOTHING ever reaches 190 m, so
    // the dressed set is frozen at whatever the 300-frame warm-up captured and the
    // kit/shader boundary simply walks across the frame as the dolly moves.
    // Nearest-first instead, with the two guards that keep it from becoming a new pop:
    //   * LD13_EVICT_MARGIN of hysteresis, so two buildings at nearly equal range cannot
    //     trade the last slot on every rescan;
    //   * the eviction is REMEMBERED, not performed — `_dress` runs it only after the
    //     replacement is in the scene, so no facade is ever between representations.
    if (LD13 && room <= 0 && cands.length && !this._evict) {
      let far = null;
      for (const [k, a] of this.active) {
        if (a.cx === undefined) continue;
        const d = Math.hypot(a.cx - px, a.cz - pz);
        if (!far || d > far.d) far = { k, d };
      }
      const c = cands[0];
      if (far && far.d > LD13_EVICT_MIN && c.d < far.d - LD13_EVICT_MARGIN && !this._queued.has(c.r.key)) {
        this.queue.push(c.r); this._queued.add(c.r.key); this._evict = far.k;
      }
    }
  }
  _dress(rec, tile) {
    const t0 = performance.now();
    const B = new DressBatcher(this.M, this.pools, rec.baseY);
    const K = makeKit(B, this.extra);
    const ctx = { batcher: B, kit: K, extra: this.extra };
    try {
      buildDressed(ctx, rec);
    } catch (e) {
      B.releaseAll();
      this.stats.skipped++;
      if (!this._warned) { this._warned = true; console.warn('nycDress build failed', rec.key, e); }
      return;
    }
    const merged = B.buildMergedGeoms();
    // LD13 — THE INVARIANT, stated as code: the hide texel is a promise that a
    // replacement exists. `buildDressed` returning normally is not that promise; a
    // building whose every wall was rejected (all ring edges under 0.3 m, or a kit path
    // that emitted only pooled parts) produces an EMPTY merge map, `TileMerges.add`
    // iterates nothing, no mesh reaches the scene — and the old code set the hide texel
    // anyway, which discards the tile facade of a building that now has no geometry at
    // all. That is a blank front with no recovery: nothing ever unhides it until the
    // camera walks 190 m away. Treat it exactly like a thrown build.
    if (LD13 && merged.size === 0) {
      B.releaseAll();
      this.stats.skipped++;
      if (!this._warnedEmpty) { this._warnedEmpty = true; console.warn('[nycDress] LD13: empty dressed build, keeping the tile facade', rec.key); }
      return;
    }
    this.merges.add(rec.tile, rec.key, merged);
    // LD13: `cx`/`cz` on the active entry so the nearest-first slot policy above can ask
    // how far away an ALREADY dressed building is without a second lookup into the recs.
    this.active.set(rec.key, { handles: B.handles, tile: rec.tile, bid: rec.bid, hideTex: tile.hideTex, cx: rec.cx, cz: rec.cz });
    if (tile.hideTex) { tile.hideTex.image.data[rec.bid] = 255; tile.hideTex.needsUpdate = true; }
    // LD13: the deferred eviction. The far building's kit comes out only NOW, with the
    // near one's already merged into the scene and its hide texel already set — so the
    // count never exceeds MAX_DRESS for longer than these two statements, and neither
    // facade is ever without a representation. `_undress` restores the tile facade by
    // clearing the hide texel, which is what "buildings the dresser declines keep the
    // tile facade" means for a building it has decided to hand BACK.
    if (LD13 && this._evict) {
      const k = this._evict; this._evict = null;
      if (k !== rec.key && this.active.size > MAX_DRESS) this._undress(k);
    }
    this.stats.built++;
    const ms = performance.now() - t0;
    this.stats.ms += ms;
    if (ms > 80) console.warn(`[nycDress] slow build ${ms.toFixed(0)}ms`, rec.key, 'style', rec.style, 'walls', rec.ring.length, 'h', rec.height.toFixed(1));
  }
  _undress(recKey) {
    const a = this.active.get(recKey);
    if (!a) return;
    for (const [id, h] of a.handles) this.pools.release(id, h);
    this.merges.remove(a.tile, recKey);
    if (a.hideTex) { a.hideTex.image.data[a.bid] = 0; a.hideTex.needsUpdate = true; }
    this.active.delete(recKey);
  }
  drawCalls() { return this.pools.drawCalls() + this.merges.drawCalls(); }
}
