// ============================================================================
// RUNTIME ROOFTOP ENGINE
// ----------------------------------------------------------------------------
// The Spider-Man lesson: dense city detail is GENERATED near the camera, not
// stored. Tiles carry one packed byte per building (membrane + real-data bits
// from DOB tanks / NYSERDA+Roofpedia solar / TNC+Roofpedia green joins); this
// module instantiates the full roofscape into instanced pools at tile stream-
// in, so density costs no disk, no compile time, and iterates without a
// recompile. Claims release with the tile like every other prop.
//
// Layout logic (per building):
//   archetype  <- style + flags + massing (12 types)
//   template   <- 10 seeded variants per archetype
//   solver     <- OBB-frame rectangle occupancy, FDNY access corridors
//                 reserved first, per-kind clearance pads + parapet setbacks,
//                 rejection sampling against the REAL footprint polygon so
//                 L/U-shaped buildings fill their actual roof, not their bbox
//   systems    <- vent fields on the bay module, exhaust fans, condenser
//                 banks on dunnage, cooling towers, cell corner leases,
//                 5G monopoles, comms farms, davits, chimneys, dish clusters,
//                 pipe networks, guardrails, solar fields (winter-sun pitch),
//                 sedum tray fields, amenity decks, sawtooth monitors,
//                 mechanical penthouses, cardboard junk
//
// THE YAW RULE: orientedBBox angles are math-convention (atan2(dz,dx));
// instance rotations are yaw where facing = (sin y, cos y). The one and only
// conversion happens at emission: yaw = PI/2 - mathAngle. Everything internal
// stays math-convention. (Getting this wrong made two prior versions read as
// "randomly rotated" — the row POSITIONS aligned, each prop's facing didn't.)
// ============================================================================
import { KIND_MAP } from './furnitureKit.js';
import { nextTint, tintOf, U10 } from './instancer.js';

const K = {
  WATER_TOWER: 22, ROOF_AC: 23, BULKHEAD: 24,
  VENT: 40, DISH: 41, MAST: 42, SKYLIGHT: 43, DUCT: 44,
  CHAIR: 45, TABLE: 46, PLANTER: 47, UMBRELLA: 48, COOLTOWER: 49, SOLAR: 50,
  CELL_SLED: 51, CELL_CAB: 52, CABLE_TRAY: 53, MUSHROOM: 54, UPBLAST: 55,
  GOOSENECK: 56, CHIMNEY: 57, HATCH: 58, GUARDRAIL: 59, DAVIT: 60,
  MICROWAVE: 61, DISH_CLUSTER: 62, DUNNAGE: 63, SCREENWALL: 64,
  SEDUM_TRAY: 65, PERGOLA: 66, MONITOR: 67, PENTHOUSE: 68, PIPE_RUN: 69, MONOPOLE: 70,
  // ROOF9 (docs/notes/roofs-r9.md): the large end of the size histogram plus
  // the stain decal. furnitureKit.js KIND_MAP 73-76.
  RTU: 73, PLENUM: 74, PAD: 75, STACK: 76, WALK: 77,
};
// ?roof9=0 restores round-8 behaviour for everything in this file (the flag is
// parsed in assemble.js and arrives as env.roof9, so there is one parse site).
const cl9 = (v, a, b) => (v < a ? a : v > b ? b : v);
// Which archetypes run PACKAGED plant rather than a field of split condensers.
const COMMERCIAL9 = new Set(['office_low', 'office_tower', 'hotel', 'institutional',
  'industrial', 'loft', 'retail', 'bigbox']);

// clearance pads (m): tight service gaps, not the old cautious exclusions
const PAD = {
  [K.WATER_TOWER]: 2.2, [K.ROOF_AC]: 0.55, [K.BULKHEAD]: 1.6,
  [K.VENT]: 0.16, [K.DISH]: 0.35, [K.MAST]: 0.4, [K.SKYLIGHT]: 0.85, [K.DUCT]: 1.0,
  [K.CHAIR]: 0.25, [K.TABLE]: 0.5, [K.PLANTER]: 0.5, [K.UMBRELLA]: 0.25,
  [K.COOLTOWER]: 1.5, [K.SOLAR]: 1.3,
  [K.CELL_SLED]: 0.9, [K.CELL_CAB]: 0.5, [K.CABLE_TRAY]: 0.25, [K.MUSHROOM]: 0.32,
  [K.UPBLAST]: 0.45, [K.GOOSENECK]: 0.14, [K.CHIMNEY]: 0.5, [K.HATCH]: 0.6,
  [K.GUARDRAIL]: 0.22, [K.DAVIT]: 0.4, [K.MICROWAVE]: 0.45, [K.DISH_CLUSTER]: 0.4,
  [K.DUNNAGE]: 0.18, [K.SCREENWALL]: 0.35, [K.SEDUM_TRAY]: 0.42, [K.PERGOLA]: 1.9,
  [K.MONITOR]: 1.5, [K.PENTHOUSE]: 3.0, [K.PIPE_RUN]: 0.14, [K.MONOPOLE]: 0.8,
  // ROOF9. An RTU is 3.0 x 2.1 m, so its occupancy half-extent is 1.85 m plus a
  // service gap; a plenum is 4.4 m long and gets a square 2.4 m because the
  // solver's occupancy is axis-aligned in the OBB frame and the run may be
  // rotated 90 degrees. The stain decal takes 0.02: it is flat, things stand ON
  // it, and it is emitted through decal() which never touches occupancy at all.
  [K.RTU]: 1.95, [K.PLENUM]: 2.4, [K.STACK]: 0.4, [K.PAD]: 0.02, [K.WALK]: 0.02,
};
// parapet setback (m); parapet-mounted kinds are exceptions via atParapet
const SETBACK = {
  default: 0.7,
  // A WATER TANK IS 3.6 m ACROSS AT THE EAVE, AND IT MUST STAND ON THE ROOF.
  // `default` let the tank's CENTRE sit 0.7 m inside the roof's OBB edge, while
  // the `waterTower` geometry's widest element is the cone eave at r = 1.82 m
  // (x sx, up to 1.25 -> 2.28 m): the tank could legally overhang the parapet by
  // 1.58 m with only its four legs (+-1.15 m) over the deck. From any street
  // camera the overhanging half is a tank hanging in the alley — critic round 5
  // defect 19, "a water tower floating unsupported in mid-air between two
  // facades" (grandCentral_day.png x 950-1150, y 150-430).
  [K.WATER_TOWER]: 2.6,
  [K.CELL_SLED]: 0.25, [K.GUARDRAIL]: 0.12, [K.DAVIT]: 0.35, [K.DISH]: 0.3,
  [K.DISH_CLUSTER]: 0.25, [K.MAST]: 0.35, [K.PLANTER]: 0.4, [K.VENT]: 0.4,
  [K.GOOSENECK]: 0.35, [K.SEDUM_TRAY]: 0.7, [K.CHIMNEY]: 0.25, [K.PIPE_RUN]: 0.3,
  // ROOF9: a 3 m cabinet centred 0.7 m inside the OBB edge would hang 0.8 m
  // over the parapet — the water-tank lesson above, one size down.
  [K.RTU]: 2.1, [K.PLENUM]: 2.6, [K.STACK]: 0.55, [K.PAD]: 0.15, [K.WALK]: 0.2,
};

// ============================================================ U10 VARIANCE
// docs/notes/uniformity-r10.md. The round-9 blind pass named two roof tells and
// both are this table's job:
//   finding 2 — "the pale 1 m squares are the loudest CG tell on every roof":
//     roofHatch (0.95 m), mushroomFan (0.86 m) and the skylight curbs present as
//     a dozen IDENTICAL pale squares per roof at 150 m. Real small roof plant is
//     dark (drains, conduit, pipe) and varies in size; the pale stuff is big.
//   the round's own verdict — "ours are many, small and evenly spread".
//
// Per kind: s = scale spread (MULTIPLIES whatever the caller already passed, so
// the r9 RTU/AC jitter is not doubled — those get tint only), y = yaw jitter in
// radians (+-), m = probability the item simply is not there, v = value
// multiplier range, w = warm/cool swing (+ rust and soot, - galvanised).
// Everything is hashed from the item's WORLD position and the building seed,
// never from the tile and never from the placement rnd() stream — so the same
// building keeps the same roof across a reload, a tile boundary changes nothing,
// and none of this perturbs where round 9 put anything.
const VAR9 = {
  // ---- the pale offenders. Value floors are deliberately low: a 0.58x on a
  // #8a8478 curb lands at #504e46, which is what a 40-year-old galvanised curb
  // on a white membrane actually looks like from a helicopter.
  // The first probe of these three came back at mean value 0.75 / 0.78 / 0.83,
  // and r9 finding 2 does not ask for "some variation" — it asks for the census
  // DOWN and the tops DARKER, because the reference's small roof plant is dark
  // (drains, conduit, pipe) and only its BIG plant is pale. Pushed down to means
  // of 0.70 / 0.75 / 0.77. The skylight is the stubborn one: its glazing is
  // tilted, so from a 150 m oblique it mirrors sky and reads pale however dark
  // its curb is — which is also true of a real one, so it is not pushed further.
  [K.HATCH]:     { s: [0.84, 1.16], y: 0.30, m: 0.00, v: [0.50, 0.90], w: 0.20 },
  [K.MUSHROOM]:  { s: [0.76, 1.30], y: 0.50, m: 0.07, v: [0.54, 0.96], w: 0.22 },
  [K.SKYLIGHT]:  { s: [0.86, 1.18], y: 0.05, m: 0.05, v: [0.58, 0.96], w: 0.12 },
  [K.UPBLAST]:   { s: [0.85, 1.22], y: 0.40, m: 0.06, v: [0.64, 1.00], w: 0.24 },
  // ---- the fine grain. A vent field of 60 identical pipes is the same defect
  // one size down, and it is most of the item count on a tenement.
  [K.VENT]:      { s: [0.78, 1.32], y: 0.90, m: 0.05, v: [0.60, 1.04], w: 0.26 },
  [K.GOOSENECK]: { s: [0.80, 1.26], y: 1.20, m: 0.07, v: [0.62, 1.02], w: 0.26 },
  [K.PIPE_RUN]:  { s: null,         y: 0.03, m: 0.05, v: [0.62, 1.04], w: 0.30 },
  [K.CABLE_TRAY]:{ s: null,         y: 0.02, m: 0.03, v: [0.70, 1.02], w: 0.14 },
  [K.DUCT]:      { s: [0.85, 1.20], y: 0.12, m: 0.04, v: [0.66, 1.02], w: 0.20 },
  // ---- plant that already carries its own scale jitter: tint only.
  [K.ROOF_AC]:   { s: null, y: 0.00, m: 0.00, v: [0.68, 1.06], w: 0.24 },
  [K.RTU]:       { s: null, y: 0.00, m: 0.00, v: [0.76, 1.06], w: 0.16 },
  [K.STACK]:     { s: null, y: 0.00, m: 0.00, v: [0.66, 1.04], w: 0.30 },
  [K.WATER_TOWER]:{ s: null, y: 0.00, m: 0.00, v: [0.70, 1.08], w: 0.30 },
  [K.PLENUM]:    { s: null, y: 0.00, m: 0.00, v: [0.74, 1.04], w: 0.18 },
  [K.MICROWAVE]: { s: null, y: 0.00, m: 0.00, v: [0.78, 1.04], w: 0.10 },
  [K.DISH]:      { s: null, y: 0.00, m: 0.00, v: [0.74, 1.04], w: 0.12 },
  // ---- everything else that repeats
  [K.BULKHEAD]:  { s: [0.90, 1.14], y: 0.02, m: 0.00, v: [0.70, 1.06], w: 0.18 },
  [K.CHIMNEY]:   { s: [0.86, 1.22], y: 0.10, m: 0.00, v: [0.68, 1.06], w: 0.20 },
  [K.DUNNAGE]:   { s: [0.88, 1.16], y: 0.04, m: 0.06, v: [0.62, 1.04], w: 0.34 },
  [K.DISH_CLUSTER]:{ s: [0.86, 1.20], y: 0.16, m: 0.00, v: [0.74, 1.04], w: 0.12 },
  [K.COOLTOWER]: { s: [0.90, 1.14], y: 0.03, m: 0.00, v: [0.72, 1.06], w: 0.22 },
  [K.CELL_CAB]:  { s: [0.90, 1.12], y: 0.06, m: 0.00, v: [0.78, 1.04], w: 0.10 },
  [K.PLANTER]:   { s: [0.80, 1.28], y: 0.22, m: 0.06, v: [0.68, 1.08], w: 0.30 },
  [K.CHAIR]:     { s: [0.90, 1.12], y: 0.35, m: 0.08, v: [0.72, 1.08], w: 0.22 },
  [K.TABLE]:     { s: [0.90, 1.14], y: 0.25, m: 0.00, v: [0.74, 1.06], w: 0.20 },
  [K.UMBRELLA]:  { s: [0.88, 1.16], y: 0.60, m: 0.10, v: [0.70, 1.10], w: 0.26 },
  [K.SEDUM_TRAY]:{ s: null, y: 0.02, m: 0.07, v: [0.72, 1.10], w: 0.22 },
  [K.SOLAR]:     { s: null, y: 0.015, m: 0.03, v: [0.86, 1.06], w: 0.05 },
  [K.GUARDRAIL]: { s: null, y: 0.01, m: 0.02, v: [0.76, 1.04], w: 0.12 },
  [K.SCREENWALL]:{ s: null, y: 0.01, m: 0.00, v: [0.80, 1.04], w: 0.10 },
  [K.MONITOR]:   { s: null, y: 0.01, m: 0.00, v: [0.78, 1.05], w: 0.12 },
  [K.MAST]:      { s: [0.82, 1.24], y: 0.80, m: 0.00, v: [0.70, 1.04], w: 0.18 },
  [K.PAD]:       { s: null, y: 0.00, m: 0.00, v: [0.62, 1.18], w: 0.36 },
  [K.WALK]:      { s: null, y: 0.00, m: 0.00, v: [0.80, 1.06], w: 0.10 },
};
// U10 90-DEGREE FIX — found while deriving the ribbon's orientation, and it is
// not cosmetic. THE YAW RULE at the top of this file is right (local +Z lands on
// the caller's math angle; verified numerically against the davit, whose boom
// must point out over the parapet, and against cellSite's outward-facing sleds),
// but SIX kinds are modelled with their LONG axis on local X and are then run or
// gridded along that same math angle — so each one comes out broadside to its
// own run:
//   guardrail  2.42 m rail, run on a 2.45 m step  -> a comb of crossbars
//   screenWall 2.40 m louvre bank, 2.42 m step    -> the same
//   sawtoothMonitor 6.4 x 3.4, grid 7.2 x 4.6     -> 6.4 laid into the 4.6 pitch
//   sedumTray  1.90 x 0.95, grid 2.0 x 1.05       -> 1.9 laid into the 1.05 pitch
//   solarPanel 3.2 wide x 1.7 slope, 3.5 x pitch  -> array laid across itself,
//                                                    and the tilt faces sideways
//   roofPlanter 1.5 x 0.55, run on a 2.1 m step   -> planters end-on
// Every one of those steps EQUALS the geometry's X extent, which is the proof of
// intent. Adding 90 degrees at emission makes each of them continuous or
// correctly pitched — the guardrail becomes a rail instead of a picket comb,
// which is the walkway-ribbon finding in a second place.
const ROT_X = new Set([K.GUARDRAIL, K.SCREENWALL, K.MONITOR, K.SEDUM_TRAY, K.SOLAR, K.PLANTER]);

// ==================================================== R12 MEMBRANE CONTRAST
// docs/notes/silhouette-r12.md §3.1 and brief C item 3. Until this round the
// roof engine did not know what surface it was standing on: `buildRoof` was
// handed style, flags, colorVar, year, greenRoof, hasTank, hasSolar — and never
// the membrane. So VAR9's value multipliers above were ONE distribution applied
// equally to a white TPO roof and a black tar roof, and since every range there
// tops out at 1.00-1.10 the plant could only ever be DARKER than its own kit
// colour. That is roofs-r9 blind finding 4 in one line — "everything on our
// roofs sits at nearly the MEMBRANE's own value" — and it is why the roof
// luminance span at 150 m measures 130-133 against the reference's 163-166
// (edges-r10 §8): both tails are missing, not one.
//
// A real roof is the opposite. The plant is chosen and weathered independently
// of the coating under it, so on a silver-coated roof the mechanical equipment
// is the DARK thing in the frame (galvanised gone grey, tar-patched curbs, a
// cedar tank) and on a black built-up roof it is the PALE thing (new duct,
// white packaged units, aluminium). Contrast, not value, is what the membrane
// decides.
//
// Linear-albedo mid-tones of the five membranes, read off the ids assemble.js
// now passes as `env.memb` (materials.js fac8 membrane branch; the ranges are
// quoted in assemble.js at the buildRoof call site):
//   0 hash/EPDM 0.24-0.29 | 1 silver 0.50-0.585 | 2 tar 0.085-0.12
//   3 gravel 0.28-0.39    | 4 pavers 0.42-0.52  | 5 sedum (green roof)
const MEMB_LUM = [0.265, 0.545, 0.102, 0.335, 0.470, 0.200];
// The pivot is the middle of that set, so a gravel roof — the commonest — moves
// almost nothing and only the two extremes do real work. 1.15 turns the +-0.26
// of luminance either side of the pivot into a +-0.30 multiplier on the plant's
// value; past that a galvanised curb on a white roof goes black rather than
// dark. Instancer note: `_tint` is written straight into `instanceColor` as a
// LINEAR multiplier with no clamp anywhere on the path (instancer.js L555-560),
// so a factor over 1 really does brighten — checked before this was written.
const MEMB_PIVOT = 0.285, MEMB_K = 1.15, MEMB_SPREAD = 1.45;
// Kinds the membrane must NOT decide. A solar module is dark on every roof in
// the city because it is glass over silicon; sedum is a plant. Skylight glazing
// is tilted and mirrors sky whatever its curb does (the VAR9 note above makes
// the same point), so it takes half the shift.
const MEMB_SKIP = new Set([K.SOLAR, K.SEDUM_TRAY]);
const MEMB_HALF = new Set([K.SKYLIGHT, K.MONITOR]);
// R12 SIZE SPREAD (plan item S2). Two kinds carry the roofline's silhouette and
// both had ranges too tight to read as anything: every bulkhead in the city was
// within 14 % of every other (VAR9 [0.90, 1.14]) and every chimney within 22 %.
// A real block has a 2 m scuttle head next to a 3.2 m stair tower. Only these
// two are widened, and only under ?r12, because the rest of that table was
// calibrated against the round-10 plates.
const R12_S = { [K.BULKHEAD]: [0.82, 1.26], [K.CHIMNEY]: [0.80, 1.42] };
// hash of a world point + the building seed. Math.sin scrambling, like the rest
// of the project, so it is reproducible across runs and platforms.
function hw3(wx, wz, seed, n) {
  const v = Math.sin(wx * 127.1 + wz * 311.7 + seed * 13.77 + n * 74.731) * 43758.5453;
  return v - Math.floor(v);
}

const stats = { roofs: 0, items: 0, byArch: {} };
if (typeof window !== 'undefined') window.__ROOF = stats;

function mulberry(seed) {
  let a = seed | 0 || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pointInPoly(px, pz, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function ringOBB(pts) {
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
    const ang = Math.atan2(z2 - z1, x2 - x1);
    const c = Math.cos(-ang), s = Math.sin(-ang);
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const [px, pz] of pts) {
      const rx = px * c - pz * s, rz = px * s + pz * c;
      minX = Math.min(minX, rx); maxX = Math.max(maxX, rx);
      minZ = Math.min(minZ, rz); maxZ = Math.max(maxZ, rz);
    }
    const area = (maxX - minX) * (maxZ - minZ);
    if (!best || area < best.area) best = { area, ang, minX, maxX, minZ, maxZ };
  }
  const c = Math.cos(best.ang), s = Math.sin(best.ang);
  const cxr = (best.minX + best.maxX) / 2, czr = (best.minZ + best.maxZ) / 2;
  let w = best.maxX - best.minX, h = best.maxZ - best.minZ, ang = best.ang;
  if (h > w) { const t = w; w = h; h = t; ang += Math.PI / 2; }
  // rotate the rectified center BACK by +ang (standard rotation): the
  // mirrored version put the OBB center outside every footprint and every
  // single placement failed its inside() test
  return { w, h, ang, cx: cxr * c - czr * s, cz: cxr * s + czr * c };
}

// ---------------------------------------------------------------- the solver
class Roof {
  constructor(env) {
    this.env = env;
    this.rnd = env.rnd;
    const obb = ringOBB(env.ring);
    this.ang = obb.ang;
    this.ca = Math.cos(obb.ang); this.sa = Math.sin(obb.ang);
    this.hw = obb.w / 2; this.hh = obb.h / 2;
    // OBB center, not centroid: L-shaped rings have off-center centroids
    this.cx = obb.cx; this.cz = obb.cz;
    this.occ = [];
    this.reserved = [];
    this.items = 0;
    this.budget = env.budget;
    // U10: the per-building half of every variance seed. colorVar is the
    // building's own identity byte, so two neighbouring roofs of the same
    // archetype get different prop states even where their layouts match.
    this.u10 = U10 && env.roof9 !== false;
    this.vseed = ((env.colorVar || 0.5) * 977.31) % 101.7;
    // R12: the membrane this roof stands on, and the value shift it implies for
    // everything standing on it (see MEMB_LUM above). `mShift` is signed: it is
    // NEGATIVE on a bright membrane (plant reads dark against silver or pavers)
    // and POSITIVE on a dark one (plant reads pale against tar).
    this.r12 = !!env.r12;
    this.memb = env.memb | 0;
    this.mShift = this.r12 ? cl9((MEMB_PIVOT - (MEMB_LUM[this.memb] ?? MEMB_PIVOT)) * MEMB_K, -0.30, 0.30) : 0;
    // R12 DEAL. `env.deal` is the building's ordinal along its block (assemble.js
    // r12Deal / the dealer pass). -1 means the building got no deal — a tile-seam
    // straggler — and every consumer below falls back to the round-11 hash.
    this.deal = this.r12 && env.deal >= 0 ? env.deal : -1;
  }
  world(lx, lz) { return [this.cx + lx * this.ca - lz * this.sa, this.cz + lx * this.sa + lz * this.ca]; }
  // R12: the inverse of world(), so a world-space edge handed over by
  // assemble.js (the party-wall segments — see perimeterKit) can be walked in
  // the OBB frame everything else in this file works in.
  local(wx, wz) {
    const dx = wx - this.cx, dz = wz - this.cz;
    return [dx * this.ca + dz * this.sa, -dx * this.sa + dz * this.ca];
  }
  // `exact`: EDGE clearance instead of a ray probe. A disc of radius r lies
  // inside a simple polygon iff its centre is inside AND no edge comes within r
  // of the centre — cheap for a ring of 4-12 points, and unlike a ray probe it
  // cannot miss whatever falls between its directions. Measured over swept
  // positions, the 4-ray probe at 1.65 m let a 2.28 m tank eave hang 0.5 m off a
  // plain rectangle and 2.02 m off a light-well corner; edge clearance is 0 mm
  // everywhere by construction. Any kind that declares its real footprint
  // (`opts.foot`) gets it; everything else keeps the probe it always had.
  inside(lx, lz, r, exact = false) {
    const ring = this.env.ring;
    const [px, pz] = this.world(lx, lz);
    if (!pointInPoly(px, pz, ring)) return false;
    if (r <= 0.01) return true;
    if (exact) {
      const r2 = r * r;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const ax = ring[j][0], az = ring[j][1], ex = ring[i][0] - ax, ez = ring[i][1] - az;
        const L2 = ex * ex + ez * ez;
        let t = L2 > 1e-9 ? ((px - ax) * ex + (pz - az) * ez) / L2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = px - (ax + ex * t), dz = pz - (az + ez * t);
        if (dx * dx + dz * dz < r2) return false;
      }
      return true;
    }
    for (const [ox, oz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      const [qx, qz] = this.world(lx + ox, lz + oz);
      if (!pointInPoly(qx, qz, ring)) return false;
    }
    return true;
  }
  hits(list, x0, z0, x1, z1) {
    for (const r of list) if (x0 < r[2] && x1 > r[0] && z0 < r[3] && z1 > r[1]) return true;
    return false;
  }
  reserve(x0, z0, x1, z1) { this.reserved.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]); }
  // U10 per-instance state. Returns a NEW opts (the caller's object is reused
  // across a whole scatter/run, so mutating it would compound), or null when
  // this one is simply not there. `scatter` opts out of the missing test: it
  // rejection-samples, so a refusal there only moves the item somewhere else.
  vary(k, lx, lz, opts) {
    const V = VAR9[k];
    if (!V) return opts;
    const [wx, wz] = this.world(lx, lz);
    const s = this.vseed;
    if (V.m > 0 && !opts.__scatter && hw3(wx, wz, s, 1.13) < V.m) return null;
    const o = { ...opts };
    const VS = (this.r12 && R12_S[k]) || V.s;          // R12: see R12_S
    if (VS) {
      const f = VS[0] + hw3(wx, wz, s, 2.71) * (VS[1] - VS[0]);
      const fy = VS[0] + hw3(wx, wz, s, 3.37) * (VS[1] - VS[0]);
      o.sx = (o.sx ?? 1) * f; o.sz = (o.sz ?? 1) * f;
      o.sy = (o.sy ?? 1) * (0.5 * f + 0.5 * fy);     // height varies less than plan
      // clearance and footprint follow the size, or a 1.25x prop overlaps its
      // neighbour by exactly the amount it grew
      o.pad = (o.pad ?? PAD[k] ?? 0.5) * f;
      if (o.foot) o.foot *= f;
    }
    o.__yaw = V.y ? (hw3(wx, wz, s, 5.19) - 0.5) * 2 * V.y : 0;
    // R12: the value range is re-centred AGAINST the membrane and widened about
    // its new centre, instead of being one distribution for every roof in the
    // city. Widening matters as much as shifting: the measured defect is a
    // narrow SPAN (ours 130, the photograph's 166), so both tails have to move.
    let v0 = V.v[0], v1 = V.v[1];
    if (this.mShift !== 0 && !MEMB_SKIP.has(k)) {
      const f = 1 + this.mShift * (MEMB_HALF.has(k) ? 0.5 : 1);
      // the stain decal is the strongest statement the membrane makes about its
      // own dirt, so it carries the shift at 1.55x — see the L2 note on decal().
      const fk = k === K.PAD ? 1 + this.mShift * 1.55 : f;
      const c = ((v0 + v1) / 2) * fk, h = ((v1 - v0) / 2) * fk * MEMB_SPREAD;
      v0 = cl9(c - h, 0.24, 1.5); v1 = cl9(c + h, 0.24, 1.5);
    }
    const v = v0 + hw3(wx, wz, s, 7.43) * (v1 - v0);
    let w = (hw3(wx, wz, s, 11.7) - 0.5) * 2 * V.w;
    // R12: what a stain IS depends on the membrane. On a silver or paver roof it
    // is soot and traffic film — dark and WARM. On tar it is the opposite
    // chemistry: mineral bloom, ponding residue and washed-out bitumen, which
    // are pale and COOL. `tintOf` puts warm at +w and cool at -w, so on a dark
    // membrane the swing is simply inverted rather than re-rolled, and the
    // per-instance hash that decides it stays the same one.
    if (k === K.PAD && this.mShift > 0.04) w = -Math.abs(w) - 0.10;
    o.__tint = tintOf(v, w);
    return o;
  }
  // math-convention rotation in, YAW out — the single conversion point
  emit(k, lx, lz, rotMath, opts = {}) {
    const [wx, wz] = this.world(lx, lz);
    if (this.u10) {
      if (ROT_X.has(k)) rotMath += Math.PI / 2;      // see ROT_X
      if (opts.__tint) nextTint(opts.__tint[0], opts.__tint[1], opts.__tint[2]);
    }
    this.env.claim(k, wx, wz, Math.PI / 2 - rotMath, opts.sx, opts.sy, opts.sz);
    this.items++;
  }
  place(k, lx, lz, rotMath, opts = {}) {
    if (this.items >= this.budget) return false;
    if (this.u10) {
      const o = this.vary(k, lx, lz, opts);
      if (!o) return false;
      if (o !== opts) { opts = o; rotMath += o.__yaw || 0; }
    }
    const r = opts.pad ?? PAD[k] ?? 0.5;
    const sb = SETBACK[k] ?? SETBACK.default;
    // FAC8: the tile parapet is now a real wall 0.26-0.42 m thick standing ON
    // the deck (assemble.js fac8Parapet) rather than a lid over it, so an
    // `atParapet` kind — guardrail (setback 0.12), davit, dish, cell sled —
    // would be planted INSIDE the masonry. Pull it just clear of the inner face.
    if (this.env.fac8 && opts.atParapet) {
      const mx = Math.max(0.2, this.hw - 0.46), mz = Math.max(0.2, this.hh - 0.46);
      if (Math.abs(lx) > mx) lx = Math.sign(lx) * mx;
      if (Math.abs(lz) > mz) lz = Math.sign(lz) * mz;
    }
    if (!opts.atParapet && (Math.abs(lx) > this.hw - sb || Math.abs(lz) > this.hh - sb)) return false;
    // `opts.foot` = the prop's TRUE footprint radius, tested against the real
    // footprint polygon on 8 directions. Without it the old `r * 0.75` heuristic
    // stands in, as it does for every other kind.
    if (!this.inside(lx, lz, opts.foot ?? Math.max(0.05, r * 0.75), !!opts.foot)) return false;
    if (this.hits(this.occ, lx - r, lz - r, lx + r, lz + r)) return false;
    if (!opts.ignoreReserve && this.hits(this.reserved, lx - r, lz - r, lx + r, lz + r)) return false;
    this.emit(k, lx, lz, rotMath, opts);
    this.occ.push([lx - r, lz - r, lx + r, lz + r]);
    return true;
  }
  // ROOF9 STAIN DECAL. No occupancy and no reserve test: it is a flat disc that
  // things stand on, and if it took a slot in this.occ the very prop it belongs
  // to would fail its own place() against it (hits() is a rectangle overlap, so
  // even a 0.02 m pad blocks a 1.9 m cabinet at the same centre). Emitted AFTER
  // its parent for the same reason. r = the disc's world radius in metres.
  decal(k, lx, lz, rotMath, r) {
    if (this.items >= this.budget) return false;
    if (!this.inside(lx, lz, Math.max(0.1, r * 0.55))) return false;
    // a stain is one irregular blob geometry shared by every instance, so it
    // takes a random yaw or the same outline repeats all over the block. The
    // walkway paver must NOT: it is square and aligned to the run.
    const o = { sx: r, sy: 1, sz: r };
    // the roofWalk module is now a 0.9 x 1.0 m RIBBON, not a 0.62 m square; the
    // legacy (?u10=0) paver path asks for the old shape explicitly so that flag
    // still reproduces the round-9 plate exactly.
    if (k === K.WALK) { o.sx = r * 0.6889; o.sz = r * 0.62; }
    if (this.u10) { const v = this.vary(k, lx, lz, {}); if (v && v.__tint) o.__tint = v.__tint; }
    this.emit(k, lx, lz, k === K.PAD ? rotMath + this.rnd() * 6.2832 : rotMath, o);
    return true;
  }
  // U10 WALKWAY RIBBON (roofs-r9 blind finding 1: "the walkway is DASHED where
  // the real one is a continuous ribbon"). `roofWalk` is now a UNIT ribbon —
  // 0.9 m wide on local X, 1.0 m along local Z, and local +Z is what the yaw
  // rule lands on the caller's math angle — so one instance with sz = the run
  // length IS the whole walkway. 1 instance and 2 triangles where decalRun laid
  // 26 of each, i.e. this makes the roofs BOTH more reference-like and cheaper.
  walk(x0, z0, x1, z1, width = 0.9) {
    const dx = x1 - x0, dz = z1 - z0;
    const L = Math.hypot(dx, dz);
    if (L < 1.4 || this.items >= this.budget) return 0;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    // a walkway may pass under plant (it is flat and 35 mm proud) but it must
    // not hang off the roof: trim the run to what the footprint contains
    let lo = 0, hi = 0.5;
    for (let i = 0; i < 7; i++) {                  // bisect the half-length
      const t = (lo + hi) / 2;
      if (this.inside(mx - dx * t, mz - dz * t, 0.5) && this.inside(mx + dx * t, mz + dz * t, 0.5)) lo = t;
      else hi = t;
    }
    const Lr = L * lo * 2;
    if (Lr < 1.4) return 0;
    // atan2 gives the run's angle in the OBB-LOCAL frame; every other caller
    // passes a WORLD math angle (a run along local +x is `P.ang`), so add ang.
    const rot = this.ang + Math.atan2(dz, dx);
    // ---- BLIND PACK A (this round's own, §11 finding 3) CORRECTED THIS ONCE
    // MORE. Round 9 laid 0.62 m pavers on a 1.3 m step — 48 % duty — and its
    // blind pass called it "DASHED where the real one is a continuous ribbon",
    // so the first version here was ONE stretched quad. Looking at the
    // reference at 3x, that over-corrected: the real walkway is a run of BUTTED
    // pads whose cross-joints still read at 150 m — a chain of squares, not a
    // smooth strip — and a single quad came out as a featureless pale ROD.
    // The truth is neither: ~96 % duty, joints every ~1.5 m (about 10 px at this
    // framing), and a per-segment tone from the position hash so no two pads
    // match. 13 instances on a 20 m run against round 9's 26, so it is still
    // half the census it replaces AND it reads correctly.
    const n = Math.max(1, Math.round(Lr / 1.5));
    const seg = Lr / n;
    const ux = dx / L, uz = dz / L;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;                 // -0.5 .. +0.5 along the run
      const px = mx + ux * Lr * t, pz = mz + uz * Lr * t;
      const o = { sx: width / 0.9, sy: 1, sz: Math.max(0.2, seg - 0.05) };   // 5 cm joint
      if (this.u10) { const v = this.vary(K.WALK, px, pz, {}); if (v && v.__tint) o.__tint = v.__tint; }
      this.emit(K.WALK, px, pz, rot, o);
    }
    return n;
  }
  // ROOF9: a straight run of flat decals (the walkway). Same no-occupancy rule
  // as decal() — a walkway runs UP TO and around the plant, not instead of it.
  decalRun(k, x0, z0, x1, z1, step, r) {
    const dx = x1 - x0, dz = z1 - z0;
    const L = Math.hypot(dx, dz);
    const n = Math.max(1, Math.min(26, Math.floor(L / step)));
    let put = 0;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      if (this.decal(k, x0 + dx * t, z0 + dz * t, this.ang, r)) put++;
    }
    return put;
  }
  // snapped scatter: n placements via rejection sampling over a local region
  scatter(k, n, region, opts = {}) {
    const [x0, z0, x1, z1] = region || [-this.hw, -this.hh, this.hw, this.hh];
    let placed = 0;
    // U10: a scatter is a COUNT met by rejection sampling, so a "missing" here
    // would just be re-rolled somewhere else — the missing rule belongs to the
    // ordered emitters (rows, runs, grids), where a gap is actually visible.
    const o = this.u10 ? { ...opts, __scatter: 1 } : opts;
    for (let t = 0; t < n * 7 && placed < n; t++) {
      const lx = x0 + this.rnd() * (x1 - x0), lz = z0 + this.rnd() * (z1 - z0);
      const rot = this.ang + ((this.rnd() * 4) | 0) * (Math.PI / 2) + (this.rnd() - 0.5) * 0.04;
      if (this.place(k, lx, lz, rot, o)) placed++;
    }
    return placed;
  }
  // straight run of instances between two local points, all one orientation
  run(k, x0, z0, x1, z1, step, rotMath, opts = {}) {
    const dx = x1 - x0, dz = z1 - z0;
    const L = Math.hypot(dx, dz);
    const n = Math.max(1, Math.floor(L / step));
    let placed = 0;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      if (this.place(k, x0 + dx * t, z0 + dz * t, rotMath, opts)) placed++;
    }
    return placed;
  }
  // U10 (roofs-r9 blind finding 3: "our plant is SCATTERED where the
  // reference's is CLUSTERED"). Three independent fields each scattering over
  // the whole deck is what makes a roof read as confetti; a real roof keeps its
  // small plant in two or three zones — beside the bulkhead, along one parapet —
  // with large empty membrane between. Returns n overlapping sub-rectangles of
  // the deck; the caller splits its count across them.
  zones(n) {
    const out = [];
    const a0 = this.rnd() * 6.2832;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * 6.2832 + (this.rnd() - 0.5) * 0.9;
      const cx = Math.cos(a) * this.hw * (0.20 + this.rnd() * 0.34);
      const cz = Math.sin(a) * this.hh * (0.20 + this.rnd() * 0.34);
      const rx = this.hw * (0.16 + this.rnd() * 0.24), rz = this.hh * (0.16 + this.rnd() * 0.24);
      out.push([cx - rx, cz - rz, cx + rx, cz + rz]);
    }
    return out;
  }
  scatterZ(k, n, zs, opts = {}) {
    let placed = 0;
    for (let i = 0; i < zs.length && placed < n; i++) {
      placed += this.scatter(k, Math.ceil((n - placed) / (zs.length - i)), zs[i], opts);
    }
    return placed;
  }
  snap() { return this.ang + ((this.rnd() * 4) | 0) * (Math.PI / 2) + (this.rnd() - 0.5) * 0.04; }
}

// ---------------------------------------------------------------- systems
function accessAndBulkhead(P, env, variant) {
  // WB13: a frame house's roof access is a SCUTTLE, not a stair bulkhead —
  // docs/typology/08-vinyl-rowhouse.md puts the added roof stair at probability
  // 0.22, and a 2.4 m masonry bulkhead on a 7 m two-storey house is the single
  // most visible wrong object in an oblique aerial of the belt. The two frame
  // templates that carry a roof deck (extras 16) keep the bulkhead, because a
  // deck people use is exactly the case that got the stair built.
  const small = env.area < 95 || (env.arch === 'rowhouse' && env.h < 22)
    || (env.arch === 'frame' && env.h < 13 && !(variant === 2 || variant === 6));
  if (small) {
    // R12: a brownstone row is the case where this branch runs for every
    // building in sight, and the scuttle is the ONLY thing on those roofs — so
    // it is dealt for the same reason the bulkhead below is. 2 is coprime with
    // 3, so consecutive ordinals never share a spot.
    const sp = [[0, -P.hh * 0.3], [P.hw * 0.25, 0], [0, 0]];
    const o0 = P.deal >= 0 ? (P.deal * 2) % 3 : 0;
    for (let q = 0; q < sp.length; q++) {
      const [lx, lz] = sp[(o0 + q) % sp.length];
      if (P.place(K.HATCH, lx, lz, P.ang + (variant % 2) * Math.PI)) return [lx, lz];
    }
    return null;
  }
  const spots = [
    [0, 0], [0, -P.hh * 0.45], [P.hw * 0.35, -P.hh * 0.4], [-P.hw * 0.35, -P.hh * 0.4],
    [0, P.hh * 0.35], [P.hw * 0.3, 0], [-P.hw * 0.3, P.hh * 0.2],
  ];
  // R12 (plan item S2): the bulkhead SPOT is dealt, not taken from the template
  // index. `variant % 7` collides for neighbours whenever their two template
  // indices are congruent mod 7, which on a 10-template table is most of the
  // time; 3 is coprime with 7, so d -> 3d mod 7 is a bijection and next-door
  // roofs always put their stair head somewhere else. That is the single
  // cheapest thing on this list for the aerial read: the bulkhead is the only
  // object on a small roof, so a row of them in line IS the repeat.
  const si12 = P.deal >= 0 ? (P.deal * 3) % spots.length : variant % spots.length;
  const [bx, bz] = spots[si12];
  const rot = P.ang + (variant % 2) * Math.PI;
  let at = null;
  if (P.place(K.BULKHEAD, bx, bz, rot)) at = [bx, bz];
  else if (P.place(K.BULKHEAD, 0, 0, P.ang)) at = [0, 0];
  // FAC8: a New York roof of any size has TWO structures on it, not one — the
  // stair bulkhead and, on anything with a lift, the machine-room overrun; a
  // pre-war walk-up gets a skylight over the stair head instead of the second
  // mass. `ref_lenox.png`: not one mid-rise roof in the frame carries a single
  // bulkhead, and the second mass is what stops a block of roofs reading as
  // identical white rectangles with one grey box each.
  if (P.env.fac8 && at) {
    const lift = env.floors >= 6 && env.area > 210;
    if (lift) {
      // R12 (plan item S2, notes §5.4). `G.bulkhead` is 3.4 x 2.5 x 2.8 m, so
      // sy 0.78 drew the LIFT OVERRUN at 1.95 m — 0.55 m SHORTER than the stair
      // head beside it, which is backwards. A machine-room overrun is the
      // tallest thing on a pre-war roof after the tank (4.2-4.8 m) and it is
      // NARROWER in plan than a stair head, not wider: a lift shaft is 2.4-3.0 m
      // across. Dealt within that range so a row of six does not step up in
      // unison; `sy` carries the deal because height is what the silhouette
      // actually shows at 150 m.
      // STREAM PARITY (see the note at the tank, item S4): this branch must
      // draw NOTHING from rnd(), or ?r12=0 consumes a value round 11 never did
      // and every scatter downstream of it moves — a control whose random stream
      // is shifted is not a control.
      // VAR9[BULKHEAD] multiplies both of these again (0.82-1.26 under R12), so
      // the base is set to land the FINAL overrun at 2.9-5.2 m.
      const dl = P.env.r12 ? (P.deal >= 0 ? ((P.deal * 5) & 15) / 16 : (env.colorVar * 137.3) % 1) : 0;
      const ls = P.env.r12 ? 0.70 + dl * 0.16 : 0.72;
      const ly = P.env.r12 ? 1.45 + ((dl * 2.7) % 1) * 0.22 : 0.78;
      for (const [ox, oz] of [[4.6, 1.4], [-4.6, 1.4], [0, 4.4], [0, -4.4], [3.4, -3.4]]) {
        if (P.place(K.BULKHEAD, at[0] + ox, at[1] + oz, rot + Math.PI / 2, { sx: ls, sy: ly, sz: ls })) break;
      }
    } else if (env.year < 1946) {
      for (const [ox, oz] of [[2.9, 0.6], [-2.9, 0.6], [0, 2.8]]) {
        if (P.place(K.SKYLIGHT, at[0] + ox, at[1] + oz, rot, { sx: 1.25, sy: 1.15, sz: 1.25 })) break;
      }
    }
  }
  // ROOF9: a roof with a stair bulkhead has a scuttle hatch too — the hatch was
  // only ever placed on roofs too small for a bulkhead, so no mid-rise had one.
  if (P.env.roof9 && at && env.area > 150) {
    for (const [ox, oz] of [[-3.4, -1.2], [3.4, -1.2], [0, -3.6], [2.6, 2.6]]) {
      if (P.place(K.HATCH, at[0] + ox, at[1] + oz, rot)) break;
    }
  }
  if (at && env.area > 140) {
    // FDNY clear path: narrow corridor from the roof door to the front
    // parapet; big roofs get the crossing corridor too
    const cw = 0.55;
    P.reserve(at[0] - cw, Math.min(at[1], -P.hh), at[0] + cw, at[1]);
    if (env.area > 320 && variant % 3 !== 2) P.reserve(-P.hw, at[1] - cw, P.hw, at[1] + cw);
  }
  return at;
}

function ventField(P, env, density, door) {
  // one soil stack per stack of wet rooms: bay-module columns, two interior
  // rows plus scattered laterals. This is the fine grain of every NYC roof.
  const bay = Math.max(1.8, env.winW || 2.7);
  // ---- FD14 (critic-r14 runner-up, "rooftop prop density has overshot"): the Lenox
  // roofs carry 15-20 identical black stacks at even pitch where the reference's cluster
  // at the bulkhead and along the party wall and are ABSENT over most of the deck.
  // Two things were wrong and the second is the one that reads from the air:
  //   * the count. area x floors / 130 x density puts 27 stacks on a 400 m2 six-storey
  //     tenement. A tenement is two flats a floor: six kitchens and six bathrooms rise in
  //     TWO OR THREE stacks, not twenty-seven. /260 halves it (12-13 on that building).
  //   * the arrangement. The old loop drew a fresh bay column per vent and pinned z to
  //     -0.38 / +0.30 / random x hh, i.e. two rows straight across the whole deck. Real
  //     soil stacks come up in 2-3 RISER GROUPS — against a party wall and beside the
  //     bulkhead — because that is where the plumbing wall is. So: pick the groups first,
  //     then draw every vent inside one of them, with ~14 % strays for the laterals.
  if (P.env.fd14) {
    const n = Math.min(26, Math.max(2, Math.round((env.area * Math.min(env.floors, 8)) / 260 * density)));
    const nG = 2 + ((P.rnd() * 2) | 0);
    const grp = [];
    for (let r = 0; r < nG; r++) {
      const side = r === 0 ? -1 : r === 1 ? 1 : (P.rnd() < 0.5 ? -1 : 1);
      // group 0/1 hug the party walls; any third sits inboard. The FIRST group moves to
      // the bulkhead when there is one — that is the riser every real roof shows.
      const gx = r === 0 && door ? door[0] + (P.rnd() - 0.5) * 1.2
        : r < 2 ? side * (P.hw - 0.70 - P.rnd() * 0.55) : side * P.hw * (0.12 + P.rnd() * 0.34);
      const gz = r === 0 && door ? door[1] + (P.rnd() - 0.5) * 1.6 : (P.rnd() - 0.5) * 1.15 * P.hh;
      grp.push([gx, gz]);
    }
    let placedF = 0;
    for (let t = 0; t < n * 6 && placedF < n; t++) {
      const stray = P.rnd() < 0.14;
      const g = grp[(P.rnd() * grp.length) | 0];
      const lx = stray ? (P.rnd() - 0.5) * 1.8 * P.hw : g[0] + (P.rnd() - 0.5) * 1.05;
      const lz = stray ? (P.rnd() - 0.5) * 1.7 * P.hh : g[1] + (P.rnd() - 0.5) * 0.52 * P.hh;
      if (P.place(K.VENT, lx, lz, P.snap(), { ignoreReserve: t % 4 === 0 })) placedF++;
    }
    return placedF;
  }
  const n = Math.min(60, Math.max(3, Math.round((env.area * Math.min(env.floors, 8)) / 130 * density)));
  const cols = Math.max(1, Math.floor((P.hw * 2) / bay));
  let placed = 0;
  for (let t = 0; t < n * 5 && placed < n; t++) {
    const col = ((P.rnd() * cols) | 0) * bay - P.hw + bay * 0.5;
    const rowZ = (t % 3 === 0 ? -0.38 : t % 3 === 1 ? 0.3 : (P.rnd() - 0.5) * 1.4) * P.hh;
    if (P.place(K.VENT, col + (P.rnd() - 0.5) * 0.5, rowZ + (P.rnd() - 0.5) * 1.2, P.snap(), { ignoreReserve: t % 4 === 0 })) placed++;
  }
  return placed;
}

function exhaustField(P, env, density) {
  const nG = Math.min(24, Math.max(2, Math.round(env.area / 55 * density)));
  // U10: the mushroom census is HALVED (roofs-r9 finding 2 — "halving that
  // census and darkening their tops would do more for the aerial read than
  // anything this round added"), and both fields cluster instead of dusting the
  // whole deck (finding 3).
  const nM = P.u10 ? Math.min(5, Math.max(1, Math.round(env.area / 300 * density)))
    : Math.min(10, Math.max(1, Math.round(env.area / 160 * density)));
  if (P.u10) {
    const zs = P.zones(2 + ((P.rnd() * 2) | 0));
    P.scatterZ(K.GOOSENECK, nG, zs);
    P.scatterZ(K.MUSHROOM, nM, zs);
  } else {
    P.scatter(K.GOOSENECK, nG, [-P.hw * 0.85, -P.hh * 0.2, P.hw * 0.85, P.hh * 0.9]);
    P.scatter(K.MUSHROOM, nM, null);
  }
  if (env.store && P.rnd() < 0.8) {
    P.scatter(K.UPBLAST, 1 + ((P.rnd() * 2) | 0), [-P.hw * 0.6, P.hh * 0.3, P.hw * 0.6, P.hh * 0.9]);
  }
}

// ROOF9 HVAC: a SIZE DISTRIBUTION, not just a count. Round 8 fixed how many
// condensers a roof carries and the round-8 blind pass then failed on how big
// they all were — one 1.7 x 1.15 m split condenser for every roof in the city.
// What the reference actually shows, by building type:
//   * pre-war walk-up / tenement: 8-40 SMALL split condensers in ragged rows on
//     dunnage (one per apartment that ever added AC), no packaged plant at all;
//   * post-war residential: fewer splits, and one packaged unit if it has
//     central air;
//   * commercial / retail / industrial: 2-12 PACKAGED units of 2.6-4.2 m, long
//     insulated plenums with elbows between them, tall flues, and only a few
//     splits (the tenanted floors that never went on the central system);
//   * any of them, if the roof is SMALL: two or three things, bigger, not a
//     dozen small ones (brief B3). A 9 x 14 m roof with fourteen 1.7 m boxes on
//     it reads as a stamped grid at every distance.
// Every unit also gets per-instance scale and position jitter and an occasional
// missing unit — facades-r8 §13 item 5 ("hvacBanks rows are a regular 1.55 m
// lattice; at 3x in the plan view a big roof reads as a stamped grid").
function hvacBanks9(P, env, arrangement, scale) {
  const served = env.area * Math.min(env.floors, 14);
  const era = env.year < 1946 ? 2.35 : env.year < 1975 ? 1.5 : 1.0;
  // pickArchetype() sends any DECO_MASONRY / CIVIC_STONE building over 26 m to
  // the RESIDENTIAL 'elevator_apt' archetype, and classify.mjs uses both styles
  // for pre-war OFFICES and institutions — so the roof of a 1931 office tower
  // was being given 42 apartment split condensers and no packaged plant at all.
  // Corrected here rather than in pickArchetype, because the archetype also
  // carries the deck/cell/solar template bits and re-pointing it would change
  // the whole programme for every pre-war office in the city.
  const comm = COMMERCIAL9.has(env.arch) || env.style === 4 || env.style === 8;
  const small = env.area < 185 || P.hw * 2 < 11.5;
  const rnd = P.rnd;
  // ---------------------------------------------------------- packaged units
  // One packaged RTU is 2-25 tons and serves roughly 450-900 m2 of commercial
  // floor area; a pre-war walk-up has none, ever.
  let rtu = comm ? cl9(Math.round(served / 760), 1, 9)
    : (env.year >= 1972 && env.area > 320 ? 1 : 0);
  if (env.arch === 'bigbox') rtu = cl9(Math.round(env.area / 480), 2, 12);
  rtu = Math.min(rtu, Math.max(comm ? 1 : 0, Math.floor(env.area / 190)));
  const step = 4.6;
  const rowZ = [-P.hh * 0.30, P.hh * 0.26, -P.hh * 0.02];
  let put = 0;
  for (let r = 0; r < 3 && put < rtu; r++) {
    const per = Math.max(1, Math.min(rtu - put, Math.floor((P.hw * 2 - 3.6) / step)));
    for (let i = 0; i < per && put < rtu; i++) {
      const lx = -((per - 1) / 2) * step + i * step + (rnd() - 0.5) * 0.55;
      const lz = rowZ[r] + (rnd() - 0.5) * 0.7;
      const sc = 0.86 + rnd() * 0.42;                       // 2.6-4.2 m cabinets
      if (P.place(K.RTU, lx, lz, P.ang + (rnd() < 0.14 ? Math.PI / 2 : 0),
        { sx: sc, sy: 0.88 + rnd() * 0.34, sz: sc, pad: 1.95 * sc, foot: 1.9 * sc })) {
        put++;
        P.decal(K.PAD, lx, lz, P.ang, 1.85 * sc);            // the rust halo
      }
    }
  }
  // ------------------------------------------------- plenums with elbows
  if (comm && env.area > 420) {
    const nP = env.area > 1400 ? 2 + ((rnd() * 2) | 0) : 1;
    for (let i = 0; i < nP; i++) {
      P.place(K.PLENUM, (rnd() - 0.5) * 1.25 * P.hw, (rnd() - 0.5) * 1.05 * P.hh,
        P.ang + (i % 2 ? Math.PI / 2 : 0), { sy: 0.85 + rnd() * 0.4 });
    }
  }
  // ------------------------------------------------- tall flues / stacks
  const nS = comm ? (env.area > 900 ? 3 : env.area > 260 ? 2 : 1)
    : (env.year < 1946 && env.area > 200 ? 2 : env.area > 110 ? 1 : 0);
  for (let i = 0; i < nS; i++) {
    const s = 0.85 + rnd() * 0.5;
    P.scatter(K.STACK, 1, [-P.hw * 0.8, -P.hh * 0.15, P.hw * 0.8, P.hh * 0.85],
      { sx: s, sy: 0.78 + rnd() * 0.6, sz: s });
  }
  // ------------------------------------------------- split condensers
  let n = Math.min(46, Math.max(comm ? 1 : 2,
    Math.round((served / 380) * scale * era * (comm ? 0.34 : 1))));
  if (small) n = Math.min(n, 5);
  const sstep = 1.62;
  let acPut = 0;
  const rowAt = (z0, count, xoff = 0, rot90 = false) => {
    const rot = P.ang + (rot90 ? Math.PI / 2 : 0);
    // U10 (blind pack A, §11 finding 2): round 9 jittered these by +-0.44 m
    // against a 1.62 m step, which is not enough to break a 4 x 3 read at 150 m —
    // pack A called the bank a lattice again. A real tenement roof's condensers
    // were bolted down one at a time over thirty years: the PITCH itself varies
    // (1.3-2.1 m), the row wanders in z, and one flat in six never converted, in
    // runs. Accumulating a variable pitch instead of jittering a fixed one is
    // what removes the lattice — jitter around a fixed step still reads as a
    // step, because the eye locks onto the mean.
    let acc = xoff - ((count - 1) / 2) * sstep;
    let gap = 0;
    for (let i = 0; i < count; i++) {
      const step = P.u10 ? sstep * (0.80 + rnd() * 0.46) : sstep;
      const lxB = P.u10 ? acc : xoff - ((count - 1) / 2) * sstep + i * sstep;
      acc += step;
      if (P.u10) {
        // gaps come in RUNS: one refusal makes the next more likely
        if (rnd() < 0.11 + gap * 0.30) { gap = Math.min(2, gap + 1); continue; }
        gap = 0;
      } else if (rnd() < 0.08) continue;              // the flat that never converted
      const lx = lxB + (rnd() - 0.5) * (P.u10 ? 0.30 : 0.44);
      const lz = z0 + (rnd() - 0.5) * (P.u10 ? 0.78 : 0.5);
      const sc = small ? 1.06 + rnd() * 0.34 : 0.9 + rnd() * 0.32;
      if (i % 2 === 0 && !small) P.place(K.DUNNAGE, lx + sstep / 2, lz, rot, { ignoreReserve: true });
      if (P.place(K.ROOF_AC, lx, lz, rot + (rnd() - 0.5) * 0.07,
        { sx: sc, sy: 0.92 + rnd() * 0.26, sz: sc })) {
        acPut++;
        if (rnd() < 0.3) P.decal(K.PAD, lx, lz, P.ang, 1.15 * sc);
      }
    }
  };
  const rowLen = Math.max(2, Math.min(10, ((P.hw * 2 - 2) / sstep) | 0));
  if (arrangement === 2 && n >= 6) {
    rowAt(-P.hh * 0.32, Math.min((n / 2) | 0, rowLen));
    for (let i = 0; i < Math.min(n - ((n / 2) | 0), 8); i++) {
      const sc = 0.9 + rnd() * 0.32;
      P.place(K.ROOF_AC, P.hw * 0.32 + (rnd() - 0.5) * 0.4, -P.hh * 0.32 + (i + 1) * sstep,
        P.ang + Math.PI / 2, { sx: sc, sy: 0.92 + rnd() * 0.26, sz: sc });
    }
  } else if (arrangement === 3 && n >= 6) {
    rowAt(-P.hh * 0.34, Math.min((n / 2) | 0, rowLen), -P.hw * 0.18);
    rowAt(P.hh * 0.3, Math.min(n - ((n / 2) | 0), rowLen), P.hw * 0.18);
  } else {
    const rows = arrangement === 1 && !small ? 2 : 1;
    let rem = n;
    for (let r = 0; r < rows && rem > 0; r++) {
      const c = Math.min(rem, rowLen);
      rowAt(-P.hh * 0.3 + r * 2.3, c);
      rem -= c;
    }
  }
  // TOP-UP, and it is not cosmetic: on a narrow roof (a 24 x 8 m tenement) the
  // row Z positions run straight through the stair bulkhead's 1.6 m clearance
  // pad, so the rows placed 2 of 6 in round 8 and 0 of 6 once the jitter was
  // added. The old code only scattered leftovers in the DEFAULT arrangement, so
  // arrangements 2 and 3 silently lost theirs. Every arrangement tops up now.
  if (acPut < n) {
    const left = P.scatter(K.ROOF_AC, Math.min(n - acPut, small ? 3 : 26), null,
      { sx: 0.92 + rnd() * 0.3, sy: 0.95, sz: 0.92 + rnd() * 0.3 });
    if (left > 0 && rnd() < 0.5) P.decal(K.PAD, (rnd() - 0.5) * P.hw, (rnd() - 0.5) * P.hh, P.ang, 1.1);
  }
}
function hvacBanks(P, env, arrangement, scale) {
  if (env.roof9) return hvacBanks9(P, env, arrangement, scale);
  const served = env.area * Math.min(env.floors, 14);
  // FAC8 condenser census. Counted off `ref_lenox.png`: a 20 x 40 m Harlem
  // walk-up roof carries 15-40 split-system condensers in ragged rows, because
  // every apartment that added AC after the war put its outdoor unit up here.
  // served/380 gave a six-storey 300 m2 walk-up FIVE units. A post-war
  // building with central air has FEWER but bigger boxes; a pre-war one has
  // many small ones. Era, not floor area alone, sets the grain.
  const era = env.fac8
    ? (env.year < 1946 ? 2.35 : env.year < 1975 ? 1.5 : 1.0)
    : 1;
  let n = Math.min(env.fac8 ? 46 : 30, Math.max(2, Math.round(served / 380 * scale * era)));
  const step = 1.55;
  const rowAt = (z0, count, xoff = 0, rot90 = false) => {
    const rot = P.ang + (rot90 ? Math.PI / 2 : 0);
    for (let i = 0; i < count; i++) {
      const lx = xoff - ((count - 1) / 2) * step + i * step;
      if (i % 2 === 0) P.place(K.DUNNAGE, lx + step / 2, z0, rot, { ignoreReserve: true });
      P.place(K.ROOF_AC, lx, z0, rot);
    }
  };
  const rowLen = Math.max(2, Math.min(10, ((P.hw * 2 - 2) / step) | 0));
  if (arrangement === 2 && n >= 6) {
    rowAt(-P.hh * 0.32, Math.min((n / 2) | 0, rowLen));
    for (let i = 0; i < Math.min(n - ((n / 2) | 0), 8); i++) {
      P.place(K.ROOF_AC, P.hw * 0.32, -P.hh * 0.32 + (i + 1) * step, P.ang + Math.PI / 2);
    }
  } else if (arrangement === 3 && n >= 6) {
    rowAt(-P.hh * 0.34, Math.min((n / 2) | 0, rowLen), -P.hw * 0.18);
    rowAt(P.hh * 0.3, Math.min(n - ((n / 2) | 0), rowLen), P.hw * 0.18);
  } else {
    const rows = arrangement === 1 ? 2 : 1;
    for (let r = 0; r < rows && n > 0; r++) {
      const c = Math.min(n, rowLen);
      rowAt(-P.hh * 0.3 + r * 2.1, c);
      n -= c;
    }
    // leftovers scatter as split units
    if (n > 0) P.scatter(K.ROOF_AC, Math.min(n, P.env.fac8 ? 26 : 8), null);
  }
}

// ROOF9. The round-8 blind pass, finding 3: "nothing on a roof is stained.
// Every reference roof has a dark rim where water and soot pool against the
// parapet, tan/rust haloes around each unit, and dark streaks to the drains.
// Ours is uniformly clean." The haloes are emitted with their units in
// hvacBanks9 / the tank and cooling-tower placements; this is the other half —
// PONDING. An old membrane deflects between joists, water stands in the low
// spots for days after rain and leaves a dark ring, and soot collects where the
// deck meets the parapet. Biased outward for that reason (0.5-0.9 of the half
// extent), 1-8 per roof by area, 12 triangles each.
//
// The rim itself — a continuous darkening within ~0.5 m of the parapet — is a
// shader term on the membrane, i.e. materials.js, outside the roof planner.
// These discs are what can be done from here.
function stainField(P, env) {
  const n = cl9(Math.round(env.area / 260), 1, 8);
  for (let i = 0; i < n; i++) {
    const sx = (P.rnd() < 0.5 ? -1 : 1) * (0.5 + P.rnd() * 0.4);
    const sz = (P.rnd() < 0.5 ? -1 : 1) * (0.5 + P.rnd() * 0.4);
    P.decal(K.PAD, sx * P.hw, sz * P.hh, P.ang, 0.7 + P.rnd() * 1.1);
  }
}
function pipeNetwork(P, env, runs) {
  // L-shaped conduit/gas/condensate runs on sleepers: the connective tissue
  // that makes a roof read as a working system. Pipes ride LOW: they may
  // cross the access path (walkover ramps exist in reality).
  for (let r = 0; r < runs; r++) {
    const x0 = (P.rnd() - 0.5) * 1.6 * P.hw, z0 = (P.rnd() - 0.5) * 1.6 * P.hh;
    const x1 = (P.rnd() - 0.5) * 1.6 * P.hw, z1 = (P.rnd() - 0.5) * 1.6 * P.hh;
    P.run(K.PIPE_RUN, x0, z0, x1, z0, 2.9, P.ang, { ignoreReserve: true });
    P.run(K.PIPE_RUN, x1, z0, x1, z1, 2.9, P.ang + Math.PI / 2, { ignoreReserve: true });
  }
}

function cellSite(P, env, corners) {
  const cs = [[1, 1], [-1, 1], [1, -1], [-1, -1]].sort(() => P.rnd() - 0.5);
  let done = 0;
  for (const [qx, qz] of cs) {
    if (done >= corners) break;
    const lx = qx * (P.hw - 0.8), lz = qz * (P.hh - 0.8);
    // sector sleds face OUTWARD over each street edge (math direction of the
    // outward normal): +x edge normal = ang, +z edge normal = ang + 90
    const okA = P.place(K.CELL_SLED, lx, lz - qz * 1.1, P.ang + (qx > 0 ? 0 : Math.PI), { atParapet: true });
    const okB = P.place(K.CELL_SLED, lx - qx * 1.4, lz, P.ang + (qz > 0 ? Math.PI / 2 : -Math.PI / 2), { atParapet: true });
    if (okA || okB) {
      P.place(K.CELL_CAB, lx - qx * 2.2, lz - qz * 2.0, P.ang, { ignoreReserve: true });
      P.run(K.CABLE_TRAY, lx - qx * 3.0, lz - qz * 2.6, lx * 0.1, lz * 0.1, 2.9, P.ang + (Math.abs(lx) > Math.abs(lz) ? 0 : Math.PI / 2), { ignoreReserve: true });
      done++;
    }
  }
  return done;
}

function solarField(P, env, modules) {
  const tilt = 0.35, Lp = 1.7;
  const pitch = Lp * Math.cos(tilt) + (Lp * Math.sin(tilt)) / Math.tan(0.454);
  const perRow = Math.max(1, Math.min(7, ((P.hw * 2 - 2.4) / 3.5) | 0));
  const rows = Math.max(1, Math.min(6, Math.ceil(modules / 10 / perRow)));
  const rot = P.ang + ((P.rnd() * 2) | 0) * Math.PI; // one azimuth per roof
  for (let r = 0; r < rows; r++) {
    for (let p = 0; p < perRow; p++) {
      P.place(K.SOLAR, -((perRow - 1) / 2) * 3.5 + p * 3.5, -((rows - 1) / 2) * pitch + r * pitch + P.hh * 0.1, rot);
    }
  }
}

function sedumField(P, env) {
  const gx = P.hw - 1.2, gz = P.hh - 1.2;
  for (let lz = -gz; lz <= gz; lz += 1.05) {
    for (let lx = -gx; lx <= gx; lx += 2.0) {
      if (P.rnd() < 0.08) continue;
      P.place(K.SEDUM_TRAY, lx, lz, P.ang, { ignoreReserve: false });
    }
  }
  P.run(K.GUARDRAIL, -P.hw + 0.4, -P.hh + 0.35, P.hw - 0.4, -P.hh + 0.35, 2.45, P.ang, { atParapet: true });
}

function amenityDeck(P, env, variant) {
  const qx = variant % 2 ? 1 : -1, qz = variant % 4 < 2 ? 1 : -1;
  const cxD = qx * P.hw * 0.42, czD = qz * P.hh * 0.36;
  if (variant % 3 === 0) P.place(K.PERGOLA, cxD, czD, P.ang + (variant % 2) * (Math.PI / 2));
  const nT = 2 + ((P.rnd() * 3) | 0);
  for (let ti = 0; ti < nT; ti++) {
    const tx = cxD - qx * ti * 2.4, tz = czD - qz * (ti % 2) * 2.2;
    if (!P.place(K.TABLE, tx, tz, P.snap())) continue;
    if (P.rnd() < 0.6) P.place(K.UMBRELLA, tx + (P.rnd() - 0.5) * 0.35, tz + (P.rnd() - 0.5) * 0.35, P.snap(), { pad: 0.18 });
    for (let ci = 0; ci < 3; ci++) {
      const aM = P.ang + ci * (Math.PI / 2) + (P.rnd() - 0.5) * 0.25;
      // chair faces the table: its +Z (math dir aM+PI) points inward
      P.place(K.CHAIR, tx + Math.cos(aM) * 0.85, tz + Math.sin(aM) * 0.85, aM + Math.PI, { pad: 0.22 });
    }
  }
  P.run(K.PLANTER, -qx * P.hw * 0.3, qz * (P.hh - 0.7), qx * (P.hw - 1.0), qz * (P.hh - 0.7), 2.1, P.ang, { atParapet: true });
  P.run(K.GUARDRAIL, qx * (P.hw - 0.35), qz * (P.hh - 0.35) - qz * P.hh * 1.3, qx * (P.hw - 0.35), qz * (P.hh - 0.35), 2.45, P.ang + Math.PI / 2, { atParapet: true });
}

function perimeterKit(P, env, variant) {
  // chimneys on pre-war party walls (rear + side), dish clusters and masts on
  // the street parapet, davits on the tall, guardrail runs where people go
  if (env.year < 1946 && env.arch !== 'office_tower') {
    // R12 (plan item S3, notes §3.7). A New York chimney stands on the PARTY
    // WALL — the flues of both lots share the lot-line masonry and come out
    // together above the roof — and ours stood in a straight line 0.55 m inside
    // the REAR parapet on every pre-war building in the city, whichever way the
    // building faced. `b.blind` has carried the lot lines all along (a set bit
    // is an abutting neighbour, which is why that wall gets no windows);
    // assemble.js now hands them over as world segments and they are walked in
    // the OBB frame here. The whole building shares a height CLASS from its
    // deal, because at 150 m what reads is one roof's chimneys standing taller
    // than the next roof's, not the spread within one roof.
    const party = P.env.r12 ? (env.party || null) : null;
    let made = 0;
    if (party && party.length) {
      const dh = P.deal >= 0 ? ((P.deal * 9) & 15) / 16 : (env.colorVar * 211.7) % 1;
      // VAR9[CHIMNEY] multiplies this again (R12_S: 0.80-1.42), and the shaft is
      // 2.1 m with pots to 2.8 — so 0.95-1.33 here lands the visible flue at
      // 2.4-4.6 m above the deck, which is a boiler flue at the top of the range
      // and a fireplace stack at the bottom. Round 11's flat 1.0 x [0.86,1.22]
      // put every chimney in the city between 2.4 and 3.4 m.
      const hb = 0.95 + dh * 0.38;
      for (const seg of party) {
        if (made >= 4) break;
        const [ax, az] = P.local(seg[0], seg[1]);
        const [bx, bz] = P.local(seg[2], seg[3]);
        const ex = bx - ax, ez = bz - az, len = Math.hypot(ex, ez);
        if (len < 3.0) continue;
        // step off the lot line toward the roof's middle: the shaft is 0.6 m
        // deep and the parapet/fire wall is standing on the line itself
        let nx = -ez / len, nz = ex / len;
        if (nx * ((ax + bx) / 2) + nz * ((az + bz) / 2) > 0) { nx = -nx; nz = -nz; }
        const cn = Math.min(3, Math.max(1, Math.round(len / 9)));
        for (let i = 0; i < cn && made < 4; i++) {
          const t = (i + 0.6) / (cn + 0.2);
          // rotMath convention: local +Z lands on the caller's math angle, so a
          // shaft whose 0.9 m face is to run ALONG the wall takes the wall's own
          // angle in the world frame — the same form the old rear-parapet call
          // used (a +Z edge runs along local X, i.e. atan2 = 0, i.e. P.ang).
          if (P.place(K.CHIMNEY, ax + ex * t + nx * 0.62, az + ez * t + nz * 0.62,
            P.ang + Math.atan2(ez, ex), { atParapet: true, sy: hb })) made++;
        }
      }
    }
    // no lot lines (a corner building, a freestanding one, or ?r12=0): the
    // round-11 rear-parapet line, with a dealt count so a row is not all threes
    if (!made) {
      const nb = Math.min(4, Math.max(1, Math.round(env.area / 180)));
      const n = P.deal >= 0 ? Math.max(1, Math.min(4, nb + ((P.deal * 11) & 3) - 1)) : nb;
      for (let i = 0; i < n; i++) {
        const lx = (i / Math.max(1, n - 1) - 0.5) * P.hw * 1.5;
        P.place(K.CHIMNEY, lx, P.hh - 0.55, P.ang, { atParapet: true });
      }
    }
  }
  if (env.arch === 'tenement' || env.arch === 'prewar' || env.arch === 'rowhouse' || env.arch === 'loft') {
    // FD14 (critic-r14 pair 3 tell 9: "roof props silhouette as identical grey paddles on
    // every parapet"). 1-3 dish clusters on the front parapet of EVERY walk-up in the city
    // is the defect — a satellite dish is a per-TENANT thing, so on a real block it is a
    // minority of buildings carrying one or two, not all of them carrying three. The gate
    // is a hash of the record, NOT a P.rnd() draw, so the random stream is unchanged and
    // ?fd14=0 still walks the round-13 sequence (the stream-parity rule this file keeps
    // for its R12 branches).
    const dGate = env.fd14 ? ((env.colorVar * 977.13 + (env.ring[0][0] | 0) * 0.317) % 1 + 1) % 1 : 0;
    const nD = env.fd14 ? (dGate < 0.52 ? 0 : dGate < 0.86 ? 1 : 2) : 1 + ((P.rnd() * 3) | 0);
    if (env.fd14) P.rnd();                                   // keep the draw count identical
    for (let i = 0; i < nD; i++) {
      // dishes on the FRONT parapet aiming outward (math dir = -z edge normal)
      P.place(K.DISH_CLUSTER, (P.rnd() - 0.5) * 1.5 * P.hw, -(P.hh - 0.55), P.ang - Math.PI / 2, { atParapet: true });
    }
    if (P.rnd() < 0.55) P.scatter(K.MAST, 1 + ((P.rnd() * 2) | 0), null, { ignoreReserve: true });
    // ROOF9: dish diameter varies from a 45 cm Ku-band pizza dish to a 1.2 m
    // commercial one; one size for all of them was part of finding 2.
    if (P.rnd() < 0.4) P.scatter(K.DISH, 1 + ((P.rnd() * 2) | 0), null,
      P.env.roof9 ? { sx: 0.78 + P.rnd() * 0.8, sy: 0.78 + P.rnd() * 0.8, sz: 0.78 + P.rnd() * 0.8 } : {});
  }
  if (env.h > 46) {
    const n = Math.min(8, ((P.hw * 2) / 10) | 0);
    for (let i = 0; i < n; i++) {
      const lx = -P.hw + 2.2 + i * 10;
      P.place(K.DAVIT, lx, P.hh - 0.65, P.ang + Math.PI / 2, { atParapet: true });
      P.place(K.DAVIT, -lx, -P.hh + 0.65, P.ang - Math.PI / 2, { atParapet: true });
    }
  }
}

// ---------------------------------------------------------------- archetypes
// [bulkheadSpot, hvacArrangement, density, extras]
// extras: 1 cell, 2 solar-ok, 4 screenwall, 8 comms, 16 deck, 32 skylights,
//         64 monitors, 128 penthouse
const T = {
  tenement: [[0, 0, 1.5, 0], [1, 0, 1.3, 1], [2, 3, 1.6, 0], [3, 0, 1.4, 1], [4, 0, 1.3, 0], [5, 3, 1.5, 0], [6, 0, 1.7, 0], [0, 3, 1.3, 1], [1, 0, 1.6, 0], [2, 0, 1.4, 0]],
  rowhouse: [[0, 0, 1.0, 0], [1, 0, 1.1, 0], [2, 0, 0.9, 0], [3, 0, 1.0, 0], [4, 0, 1.1, 0], [5, 0, 1.0, 0], [6, 0, 0.9, 0], [0, 0, 1.2, 0], [1, 0, 1.0, 0], [2, 0, 1.1, 0]],
  prewar: [[0, 0, 1.3, 1], [1, 1, 1.2, 0], [2, 0, 1.4, 3], [3, 3, 1.2, 0], [4, 0, 1.3, 0], [5, 1, 1.2, 1], [6, 0, 1.4, 0], [0, 3, 1.2, 2], [1, 0, 1.3, 1], [2, 1, 1.2, 0]],
  elevator_apt: [[0, 1, 1.1, 19], [1, 0, 1.0, 18], [2, 1, 1.1, 17], [3, 2, 1.0, 18], [4, 1, 1.1, 16], [5, 0, 1.0, 19], [6, 1, 1.1, 18], [0, 2, 1.0, 17], [1, 1, 1.1, 18], [2, 0, 1.0, 16]],
  hotel: [[0, 1, 1.0, 22], [1, 2, 1.0, 20], [2, 1, 0.9, 21], [3, 1, 1.0, 20], [4, 2, 1.0, 22], [5, 1, 0.9, 20], [6, 1, 1.0, 21], [0, 2, 0.9, 20], [1, 1, 1.0, 22], [2, 2, 0.9, 20]],
  office_low: [[0, 1, 1.1, 7], [1, 2, 1.2, 6], [2, 3, 1.1, 5], [3, 1, 1.2, 6], [4, 2, 1.1, 4], [5, 1, 1.2, 7], [6, 3, 1.1, 6], [0, 2, 1.2, 5], [1, 1, 1.1, 6], [2, 3, 1.2, 4]],
  office_tower: [[0, 1, 0.9, 140], [1, 2, 0.9, 142], [2, 1, 0.9, 140], [3, 2, 0.9, 140], [4, 1, 0.9, 142], [5, 2, 0.9, 140], [6, 1, 0.9, 140], [0, 2, 0.9, 142], [1, 1, 0.9, 140], [2, 2, 0.9, 140]],
  loft: [[0, 3, 1.3, 35], [1, 0, 1.3, 34], [2, 3, 1.4, 33], [3, 0, 1.3, 32], [4, 3, 1.3, 34], [5, 0, 1.4, 33], [6, 3, 1.3, 34], [0, 0, 1.3, 32], [1, 3, 1.4, 35], [2, 0, 1.3, 32]],
  industrial: [[1, 3, 1.1, 98], [4, 3, 1.1, 102], [1, 2, 1.2, 96], [4, 3, 1.1, 98], [1, 3, 1.1, 100], [4, 2, 1.2, 98], [1, 3, 1.1, 96], [4, 3, 1.1, 102], [1, 2, 1.2, 96], [4, 3, 1.1, 98]],
  retail: [[0, 0, 1.3, 2], [1, 0, 1.4, 0], [2, 0, 1.3, 2], [3, 0, 1.3, 0], [4, 0, 1.4, 2], [5, 0, 1.3, 0], [6, 0, 1.3, 2], [0, 0, 1.4, 0], [1, 0, 1.3, 2], [2, 0, 1.3, 0]],
  institutional: [[0, 1, 1.0, 34], [1, 2, 1.0, 32], [2, 1, 1.1, 34], [3, 2, 1.0, 32], [4, 1, 1.0, 34], [5, 2, 1.1, 32], [6, 1, 1.0, 32], [0, 2, 1.0, 34], [1, 1, 1.1, 32], [2, 2, 1.0, 34]],
  project_slab: [[0, 1, 1.2, 1], [1, 1, 1.3, 0], [2, 1, 1.2, 1], [3, 1, 1.2, 0], [4, 1, 1.3, 1], [5, 1, 1.2, 0], [6, 1, 1.2, 1], [0, 1, 1.3, 0], [1, 1, 1.2, 1], [2, 1, 1.2, 0]],
  // ROOF9: STYLE.RETAIL_MODERN. A big-box roof is a big flat field of PACKAGED
  // units (hvacBanks9 gives it one per ~480 m2) behind a screen wall, with
  // daylight skylights (extras 32) — and a LOW vent density, because it has no
  // stacks of wet rooms over it: the density figure here is the vent field's,
  // and 1.3 on a 3000 m2 roof would have put 60 soil stacks on a shop.
  bigbox: [[0, 3, 0.5, 36], [1, 2, 0.45, 36], [2, 3, 0.5, 37], [3, 3, 0.45, 4], [4, 2, 0.5, 36], [5, 3, 0.45, 36], [6, 3, 0.5, 4], [0, 2, 0.45, 37], [1, 3, 0.5, 36], [2, 2, 0.45, 36]],
  // WB13 (docs/notes/wburg-r13.md): STYLE.FRAME_HOUSE. A 6 m x 14 m coated deck
  // behind a 0.66 m front parapet, reached by a scuttle or a small stair head.
  // Its programme is SHORT and that is the finding, not a shortcut: three floors
  // of two flats each is six kitchens and six bathrooms, i.e. a handful of vent
  // stacks, one or two condensers and the party-wall flue — density 0.75-0.95
  // against the tenement's 1.3-1.7. The `rowhouse` template was the nearest
  // thing and still put a mid-rise plumbing field on a two-family house.
  // 2 of the 10 carry a deck (extras 16): a roof deck on a Williamsburg frame
  // house is a real and very visible thing, but it is not on every roof.
  frame: [[0, 0, 0.85, 0], [1, 0, 0.75, 0], [2, 0, 0.90, 16], [3, 0, 0.80, 0], [4, 0, 0.75, 0],
    [5, 0, 0.95, 0], [6, 0, 0.80, 16], [0, 0, 0.85, 0], [1, 0, 0.90, 0], [2, 0, 0.75, 0]],
  // WB13: STYLE.CONDO_NEW. The opposite roof — the amenity deck IS the product
  // (extras 16 on 8 of 10: pergola, tables, planter run, guardrail), the plant is
  // packaged and few, and there is no tank and no chimney (fac8Year returns 2012,
  // which is what shuts those off). A bulkhead and a lift overrun, and a low vent
  // density because the risers are consolidated in new construction.
  condo: [[0, 1, 0.55, 16], [1, 2, 0.5, 16], [2, 1, 0.55, 16], [3, 1, 0.5, 0], [4, 2, 0.55, 16],
    [5, 1, 0.5, 16], [6, 2, 0.55, 16], [0, 1, 0.5, 48], [1, 2, 0.55, 16], [2, 1, 0.5, 0]],
};

function pickArchetype(env) {
  const S = env.style;
  if (env.wb13 && S === 14) return 'frame';    // WB13: STYLE.FRAME_HOUSE
  if (env.wb13 && S === 15) return 'condo';    // WB13: STYLE.CONDO_NEW
  if (S === 13) return 'bigbox';   // ROOF9: STYLE.RETAIL_MODERN
  if (S === 12) return 'project_slab';
  if (S === 9 || S === 8) return 'institutional';
  if (S === 7) return 'industrial';
  if (S === 6) return 'loft';
  if (S === 3 || S === 11) return env.h > 60 ? 'office_tower' : 'office_low';
  if (S === 10 || (env.store && env.h < 12)) return 'retail';
  if (S === 5) return 'rowhouse';
  if (S === 2 || (S === 1 && env.h > 26) || S === 4 && env.h > 26) return 'elevator_apt';
  if (S === 1 || S === 4) return 'prewar';
  return 'tenement';
}

// ---------------------------------------------------------------- entry
// env: { ring, roofY, area, h, floors, style, flags, colorVar, winW, storeH,
//        year, greenRoof, hasTank, hasSolar, claim(kind, wx, wz, yaw, sx?, sy?, sz?) }
export function buildRoof(env) {
  if (env.h <= 4 || env.area < 40 || env.ring.length < 3) return;
  const rnd = mulberry(((env.colorVar * 2654435761) ^ (env.ring[0][0] * 977 + env.ring[0][1] * 31)) | 0);
  env.rnd = rnd;
  env.store = !!(env.flags & 8);
  env.arch = pickArchetype(env);
  env.year = env.year || (env.style <= 1 || env.style === 5 ? 1925 : 1965);
  const P = new Roof({ ...env, budget: Math.min(450, 24 + env.area * 0.55) });
  if (P.hw < 2.2 || P.hh < 1.8) return;
  // R12 (plan item D3). The roof template was an independent draw off a hash of
  // colorVar and the ring's first vertex, so two neighbours of the same
  // archetype picked the same one of ten templates with probability 1/10 — and
  // the template carries the HVAC arrangement, the vent density and every extra
  // (deck, skylights, monitors, cell, penthouse), so a collision is a pair of
  // roofs that are the same roof. `deal` is the ordinal along the block; 7 is
  // coprime with 10, so d -> 7d mod 10 is a bijection and two ordinals that
  // differ by 1 CANNOT land on the same template. (The table's D3 row says
  // assemble.js; the variant is drawn here, so it is cut here — notes §5.3.)
  const rvar = (rnd() * 10) | 0;          // drawn ALWAYS — stream parity, see item S4
  const variant = P.deal >= 0 ? (P.deal * 7) % 10 : rvar;
  const [, hvacArr, density, extras] = T[env.arch][variant];

  const door = accessAndBulkhead(P, env, variant);

  // real-data singletons first
  if (env.hasTank && env.h > 12 && P.hw > 4 && P.hh > 3.5) {
    const s = 0.85 + rnd() * 0.4;
    // R12 (plan item S4). The tank already stands on X-braced steel dunnage
    // (furnitureKit `waterTower`: four 0.15 m legs, base shoes, two X-braces, a
    // 2.6 m platform, then the staves) — what it lacked is HEIGHT. `sy` ran
    // 0.9-1.3, i.e. every tank in Harlem within 18 % of every other, while the
    // real range is a 2-storey dunnage under a squat 15 000-gallon tank next to
    // a tall one on a 6 m tower. Dealt, so neighbours differ by construction:
    // a water tank is the tallest thing on the block's skyline and two at the
    // same height side by side is the silhouette tell in its purest form.
    // STREAM PARITY. Every R12 branch in this file draws the SAME number of
    // rnd() values as the round-11 code it replaces, so ?r12=0 and the default
    // walk identical random streams and the A/B plates differ by the FEATURE
    // rather than by a reshuffled scatter. (edges-r10 §2.2 proves its own
    // control on the CPU for the same reason; this is the cheap version —
    // make the control impossible to shift rather than measure that it did not.)
    // ...and the draw has to stay INSIDE the loop and AFTER P.snap(), because
    // round 11 evaluated `{ sy: 0.9 + rnd()*0.3 }` as an argument of P.place()
    // AFTER its `P.snap()` argument, ONCE PER CANDIDATE POSITION — hoisting it
    // out of the loop kept the COUNT right and still changed the ORDER, which a
    // CPU diff against git HEAD caught (scratchpad/controlproof.mjs: 24 of 32
    // synthetic buildings differed in the tank yaw and height under ?r12=0).
    // `foot` is the tank's own footprint, cone eave included (1.82 m x sx plus a
    // little): with SETBACK[WATER_TOWER] = 2.6 the first four candidates now
    // fail on a small roof, so two tighter ones sit ahead of the centred
    // fallback — a tank that used to land at a given candidate still does.
    for (const [tx, tz] of [[P.hw * 0.32, P.hh * 0.3], [-P.hw * 0.32, P.hh * 0.28], [P.hw * 0.3, -P.hh * 0.3], [0, P.hh * 0.35],
      [P.hw * 0.18, P.hh * 0.16], [-P.hw * 0.16, -P.hh * 0.16], [0, 0]]) {
      const rot12 = P.snap();
      const rty = rnd();                       // r11 order: snap() then the sy draw
      const ty = P.env.r12
        ? (P.deal >= 0 ? 0.80 + (((P.deal * 13) & 15) / 16) * 0.66 : 0.80 + rty * 0.66)
        : 0.9 + rty * 0.3;
      if (P.place(K.WATER_TOWER, tx, tz, rot12, { sx: s, sy: ty, sz: s, foot: 1.95 * s })) {
        // ROOF9: the drip ring. A cedar tank leaks, its overflow discharges onto
        // the roof and its cone eave sheds every rainfall in the same circle —
        // in the reference every tank stands in a dark stain wider than itself.
        if (env.roof9) P.decal(K.PAD, tx, tz, P.ang, 2.2 * s);
        break;
      }
    }
  }
  if (extras & 128) P.place(K.PENTHOUSE, 0, -P.hh * 0.15, P.ang + (variant % 2) * Math.PI);
  const served = env.area * Math.min(env.floors, 14);
  if (served > 9000 && (env.arch === 'office_tower' || env.arch === 'office_low' || env.arch === 'hotel' || env.arch === 'institutional')) {
    if (P.place(K.COOLTOWER, -P.hw * 0.2, -P.hh * 0.3, P.ang + (variant % 2) * Math.PI) && env.roof9) {
      P.decal(K.PAD, -P.hw * 0.2, -P.hh * 0.3, P.ang, 2.3);   // wet basin bleed
    }
    if (served > 22000 && P.place(K.COOLTOWER, P.hw * 0.25, -P.hh * 0.3, P.ang + (variant % 2) * Math.PI) && env.roof9) {
      P.decal(K.PAD, P.hw * 0.25, -P.hh * 0.3, P.ang, 2.3);
    }
  }

  if (env.greenRoof) {
    sedumField(P, env);
  } else {
    if (extras & 16) amenityDeck(P, env, variant);
    if (extras & 64) {
      // sawtooth monitors along the long axis
      const rows = Math.min(4, Math.max(1, (P.hh / 4.6) | 0));
      const per = Math.min(5, Math.max(1, ((P.hw * 2 - 4) / 7.2) | 0));
      // U10: same argument as the skylight bank — a sawtooth monitor run is
      // structurally regular ALONG the roof but the bank as a whole is set out
      // from one wall, so it is never centred and never perfectly square to the
      // OBB. (Also 90 degrees out until this round: see ROT_X.)
      const mo = P.u10 ? (P.rnd() - 0.5) * 1.6 : 0;
      for (let r = 0; r < rows; r++) for (let p = 0; p < per; p++) {
        P.place(K.MONITOR, -((per - 1) / 2) * 7.2 + p * 7.2 + mo + (P.u10 ? (P.rnd() - 0.5) * 0.3 : 0),
          (r - (rows - 1) / 2) * 4.6 + (P.u10 ? (P.rnd() - 0.5) * 0.22 : 0), P.ang);
      }
    }
    if (extras & 32) {
      const per = Math.min(7, Math.max(2, ((P.hw * 2 - 2) / 2.6) | 0));
      const rows = Math.min(3, Math.max(1, (P.hh / 3.0) | 0));
      // U10 (blind pack A, §11 finding 1): THIS GRID HAD NO JITTER AT ALL.
      // Every other roof system got position jitter in round 8 or 9; the two
      // that lay on a rigid lattice — skylights here and the sawtooth monitors
      // below — never did, and they are the "stamped waffle" the r9 blind pass
      // filed against p4 and my own pack A filed again. A rooflight bank IS
      // regular (it follows the structural bay), so the fix is not to scatter
      // it: it is a small per-row offset (the bank is set out from one edge, not
      // centred), a little per-unit slop, and the fact that a real bank has a
      // unit or two blanked off where a duct came through. `place()` already
      // supplies the per-instance scale, yaw and missing from VAR9.
      const rj = P.u10 ? (P.rnd() - 0.5) * 1.1 : 0;    // the whole bank is off-centre
      for (let r = 0; r < rows; r++) {
        const ro = P.u10 ? (P.rnd() - 0.5) * 0.55 : 0; // ...and each row starts differently
        for (let p = 0; p < per; p++) {
          const jx = P.u10 ? (P.rnd() - 0.5) * 0.22 : 0, jz = P.u10 ? (P.rnd() - 0.5) * 0.26 : 0;
          P.place(K.SKYLIGHT, -((per - 1) / 2) * 2.6 + p * 2.6 + ro + jx,
            (r - (rows - 1) / 2) * 3.0 + P.hh * 0.15 + rj + jz, P.ang);
        }
      }
    }
    // ROOF9: > 5.2 m, not > 8 m. A one-storey taxpayer on 125th St carries one
    // packaged unit or a condenser on its roof, and at 8 m exactly (the old
    // test is strict) it carried nothing at all — a bare white rectangle in
    // every oblique of the block.
    if (env.h > (env.roof9 ? 5.2 : 8) && env.area > 80) {
      hvacBanks(P, env, hvacArr, env.arch === 'retail' || env.arch === 'bigbox' ? 0.7 : 1);
    }
    if (extras & 4 && env.area > 240) P.run(K.SCREENWALL, -Math.min(P.hw, 6), -P.hh * 0.3 - 2.0, Math.min(P.hw, 6), -P.hh * 0.3 - 2.0, 2.42, P.ang);
    if (door) { P.place(K.DUCT, door[0] + 2.6, door[1], P.ang); if (env.area > 200) P.place(K.DUCT, door[0] - 2.8, door[1] + 0.8, P.ang + Math.PI / 2); }
    if (env.hasSolar) solarField(P, env, Math.max(8, Math.min(60, Math.round(env.area / 8))));
  }

  // dense small systems everywhere (sedum roofs keep a reduced set)
  const dMul = env.greenRoof ? 0.35 : 1;
  if (env.roof9 && !env.greenRoof) stainField(P, env);
  // ROOF9 walkways: from the roof door along the long axis, and a cross run on
  // a big roof. Commercial/large only — a 6 x 17 m rowhouse roof has no
  // walkway, and on a tenement the whole roof IS the walkway.
  if (env.roof9 && !env.greenRoof && env.area > 380) {
    // 1.3 m step and 26 pavers per run: a real walkway is contiguous, but the
    // dashes are what the eye reads at 150 m and the count is the instance
    // budget — 0.95 m over the full width put 73 extra claims on a 3000 m2 roof
    // (the whole round-9 delta was +27 before this), and the cull loop pays per
    // instance every frame.
    const wz = door ? door[1] : -P.hh * 0.2;
    const wx = door ? door[0] : 0;
    if (P.u10) {
      // U10: continuous ribbons, and now that a run costs ONE instance the
      // network can be what a real roof has — the main spine from the bulkhead,
      // a cross leg on a big roof, and a spur out to the plant rows. Widths
      // differ because a walkway pad really is 0.6 m (single) or 0.9 m (double).
      P.walk(-P.hw * 0.70, wz, P.hw * 0.70, wz, 0.9);
      if (env.area > 900) P.walk(wx, -P.hh * 0.70, wx, P.hh * 0.70, 0.9);
      if (env.area > 1400) P.walk(-P.hw * 0.55, P.hh * 0.34, P.hw * 0.55, P.hh * 0.34, 0.62);
      if (env.area > 2200) P.walk(-P.hw * 0.55, -P.hh * 0.40, P.hw * 0.55, -P.hh * 0.40, 0.62);
    } else {
      P.decalRun(K.WALK, -P.hw * 0.62, wz, P.hw * 0.62, wz, 1.3, 1.0);
      if (env.area > 1200) {
        P.decalRun(K.WALK, wx, -P.hh * 0.62, wx, P.hh * 0.62, 1.3, 1.0);
      }
    }
  }
  ventField(P, env, density * dMul, door);   // FD14: the bulkhead anchors the first riser group
  exhaustField(P, env, density * dMul);
  perimeterKit(P, env, variant);
  pipeNetwork(P, env, env.greenRoof ? 1 : env.area > 300 ? 3 : env.area > 120 ? 2 : 1);
  if (env.roof9) {
    // ROOF9 (brief B2, "cell antennas on the tallest roof of each block"). A
    // carrier leases the roof that CLEARS the ones around it, and then puts a
    // farm on it — three sector sleds per corner, cabinets, cable trays, a
    // monopole, microwave drums — while its neighbours get nothing. Ours put a
    // single sled on 60 % of every 16-78 m roof with the cell bit set, which is
    // both too many sites and too little on each. assemble.js elects the host
    // per ~110 m block cell and passes env.blockTall.
    if (env.blockTall && env.h > 14 && P.hw > 3.6) {
      cellSite(P, env, env.area > 380 ? 2 : 1);
      if (env.h > 26 && P.hw > 5) {
        P.place(K.MONOPOLE, (rnd() - 0.5) * P.hw * 0.8, (rnd() - 0.5) * P.hh * 0.8, P.snap());
      }
      if (env.h > 34) {
        const ms = 0.9 + rnd() * 0.55;
        P.scatter(K.MICROWAVE, 1 + ((rnd() * 2) | 0), null, { sx: ms, sy: ms, sz: ms });
      }
    } else if ((extras & 1) && env.h > 16 && env.h < 78 && P.hw > 5 && rnd() < 0.12) {
      cellSite(P, env, 1);
    }
  } else if ((extras & 1) && env.h > 16 && env.h < 78 && P.hw > 5 && rnd() < 0.6) {
    cellSite(P, env, 1 + (env.area > 450 && rnd() < 0.35 ? 1 : 0));
  }
  if (extras & 8) {
    for (let i = 0, n = 4 + ((rnd() * 5) | 0); i < n; i++) {
      const lx = (rnd() - 0.5) * P.hw * 1.4, lz = (rnd() - 0.5) * P.hh * 1.4;
      if (i % 3 === 2) P.place(K.MICROWAVE, lx, lz, P.snap());
      else P.place(K.MAST, lx, lz, P.snap(), { ignoreReserve: true });
    }
  }
  if ((env.arch === 'office_low' || env.arch === 'retail' || env.arch === 'loft') && rnd() < 0.1) {
    P.place(K.MONOPOLE, (rnd() - 0.5) * P.hw, (rnd() - 0.5) * P.hh, P.snap());
  }
  // roof junk: cardboard, spare planters
  if (!env.greenRoof && rnd() < 0.5) P.scatter(K.PLANTER, (rnd() * 2) | 0, null);

  stats.roofs++;
  stats.items += P.items;
  stats.byArch[env.arch] = (stats.byArch[env.arch] || 0) + P.items;
}

export { KIND_MAP as ROOF_KIND_MAP };
