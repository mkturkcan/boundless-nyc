// TV25 STREET-TREE GENERATOR (trees agent, 2026-09-25; notes in the lead's docs/notes when promoted).
//
// Replaces the three ez-tree presets that every street tree in the city shared ('Oak Medium' for all of the plane,
// oak, linden, maple and "other" trees = 74 % of the census) with an ENVELOPE-DRIVEN generator per species form:
//
//   crown envelope   a surface of revolution R(t) per crown habit (broad plane, round maple, oval pear, pyramidal
//                    pin oak, vase zelkova/honeylocust, columnar ginkgo, spreading cherry), made lumpy and lopsided
//                    per seed, so the silhouette against the sky is the species' and no two variants share it;
//   architecture     a clear trunk to the crown base (NYC street trees are limbed up over the walk and the road),
//                    then either a FORK into 3-9 scaffold limbs (decurrent: plane, maple, honeylocust, pear, zelkova,
//                    cherry) or a LEADER to the top with limbs in whorls whose angle runs from drooping at the
//                    bottom to ascending at the top (excurrent: pin oak, linden, ginkgo);
//   secondaries      grown from the scaffolds toward the envelope with phyllotaxis, outward/up bias and tropism,
//                    every branch stopped at the envelope, so the crown fills its habit from the inside out;
//   leafy shoots     leaf cards (spray images: stem at the card's base) anchored ON the secondaries and radiating
//                    from them, sampled with a preference for the outer shell (that is where a real crown's leaves
//                    are) and never below the crown base;
//   crown AO         leaf-area density voxelised over the crown, Beer-Lambert transmittance along 17 sky directions
//                    per card / per trunk ring -> the interior and the underside of the crown go dark, the sun-side
//                    shell stays open. Baked, so it costs nothing per frame.
//
// Two LODs come from ONE skeleton (same envelope, same shoots), so the far swap never changes the tree: LOD1 keeps a
// quarter of the cards at ~2x the size (coverage held, cost cut ~4x) and carries a crossed-quad TRUNK PROXY in the
// crown geometry, so a far tree needs no trunk draw at all.
//
// Pure geometry: `three` only, no DOM, deterministic per (form, seed). Coordinates: metres, y up, trunk base at the
// origin, the tree normalised to the H x W box the caller passes (instance scale 1 = that box).

import * as THREE from 'three';

// Bump when a change here alters the generated geometry: the baked set (public/models/trees25, tools/bake_trees.mjs)
// carries this in its key, and trees.js falls back to runtime generation (and says so) when the key is stale.
export const TREE_GEN_VERSION = 9;   // 2: TC26 aSun + aClu; 3: TR34 leaves at their own scale (sister shoots), twigs + thin limbs drawn; 4: rounder, finer-sectioned trunks and limbs; 5: no stubby fat secondaries; 6: TR35 street cells + softer clumps; 7: street cells by the shader, not the geometry; 8: darker honeylocust bark; 9: bark wound outward (TR37), stub scaffolds not drawn, the fork trunk ends in a point
// TR35 (AR34 wave 2 round 2; docs/notes/ar34-trees.md): the fine-leaved street forms (furnitureKit TREE_FORMS, told apart
// by their seeds; Central Park's cpFloraKit forms carry none of these) shade their twig clumps a quarter less (`cluK`: the
// clump direction blended toward the crown-volume normal; 0.5 in the first try, w2r2b, flattened the lit side), so the
// crown reads as a mass of small leaflets, not a pile of lit puffs (the lead's review of the segments' sheets, 2026-10-01
// 23:53); the honeylocust's open crown passes more sky to its inside and underside; and its trunk and limbs are darker
// The street leaf colours themselves
// are atlas cells the crown shader swaps in outside Central Park (treeAtlas.js STREET_CELLS, trees.js TR35).
const TR35_FORM = {
  202: { cluK: 0.75, aoExt: 0.38, barkK: 0.55 },   // honeylocust (H, and its young sub-form)
  1010: { cluK: 0.75 },               // sophora / ash (S)
};
// FNV-1a over the forms, the pool list and the code versions: the identity of a bake
export function bakeKey25(forms, pools, extra = '') {
  const s = JSON.stringify(forms) + '|' + pools.join(',') + '|g' + TREE_GEN_VERSION + '|' + extra;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
const GOLD = 2.39996323;   // golden angle (rad): phyllotaxis
// TR39: 3D value noise in [0, 1] (smoothstep between hashed lattice values): the crown-gap field of buildTree36
const hash3 = (x, y, z) => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return v - Math.floor(v); };
function vnoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  let r = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
    r += hash3(xi + dx, yi + dy, zi + dz) * (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz);
  }
  return r;
}

// ---------------------------------------------------------------- crown habits
// R(t) with t = 0 at the crown base and 1 at the top; the maximum is ~1 (the crown's half-width sits there).
export const PROFILES = {
  // London plane: broad, flat-sided, a heavy shoulder; widest at mid height
  broad: (t) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 1.04), 2.5)), 1 / 2.5),
  // Norway maple / sophora / linden (old): round, widest a little below the middle
  round: (t) => { const t0 = 0.46, s = t < t0 ? t0 : 1 - t0; return Math.sqrt(Math.max(0, 1 - ((t - t0) / s) ** 2)); },
  // Callery pear / littleleaf linden: an egg, widest just above the base
  oval: (t) => { const t0 = 0.42, s = t < t0 ? t0 * 1.05 : 1 - t0; return Math.pow(Math.max(0, 1 - ((t - t0) / s) ** 2), 0.62); },
  // pin oak: pyramidal with a drooping skirt; widest near the bottom, a spire on top
  pyramid: (t) => (t < 0.16 ? 0.55 + 0.45 * Math.sin((Math.PI / 2) * (t / 0.16)) : Math.pow(Math.max(0, 1 - (t - 0.16) / 0.84), 0.78)),
  // zelkova / elm / honeylocust: narrow at the fork, flaring upward, rounded top
  vase: (t) => (t < 0.7 ? 0.26 + 0.74 * Math.sin((Math.PI / 2) * (t / 0.7)) : Math.sqrt(Math.max(0, 1 - ((t - 0.7) / 0.3) ** 2))),
  // ginkgo: columnar-irregular, full through the middle
  columnar: (t) => { const t0 = 0.4, s = t < t0 ? t0 * 1.1 : 1 - t0; return Math.pow(Math.max(0, 1 - ((t - t0) / s) ** 2), 0.45); },
  // TR37 (TR36 forms only): round with a base width of 0.3, so the scaffolds leave the fork inside the crown (with `round`
  // the envelope has no width at the crown base, and a limb leaving the trunk at 50 deg was steered straight up after one
  // step: a J-shaped hook at the fork, treeH2 in tr37a)
  roundb: (t) => { const t0 = 0.46, s = t < t0 ? t0 : 1 - t0; const r = Math.sqrt(Math.max(0, 1 - ((t - t0) / s) ** 2)); return t < t0 ? 0.3 + 0.7 * r : r; },
  // cherry / honeylocust (open-grown): wide and low, a flat top
  spreading: (t) => (t < 0.62 ? 0.3 + 0.7 * Math.pow(Math.sin((Math.PI / 2) * (t / 0.62)), 0.8) : Math.pow(Math.max(0, 1 - ((t - 0.62) / 0.38) ** 2), 0.55)),
};

// ---------------------------------------------------------------- envelope
function makeEnvelope(F, H, W, rnd) {
  const yb = F.crownBase * H;
  const cH = H - yb;
  const prof = PROFILES[F.profile] || PROFILES.round;
  const R0 = W / 2;
  // lumps: a few azimuthal harmonics whose phase drifts with height -> lobes that spiral a little, not a lathe
  const lumps = [];
  const lumpA = F.lump ?? 0.12;
  for (let k = 1; k <= 5; k++) lumps.push({ k, a: lumpA * (0.35 + 0.65 * rnd()) / Math.sqrt(k), p: rnd() * TAU, tv: rnd() * TAU, tf: 0.6 + rnd() * 1.6 });
  // one-sided crown (pruned for trucks on the street side, reaching for light on the other): the crown centre drifts
  const off = (F.lopside ?? 0.06) * W * (0.4 + 0.6 * rnd()), offA = rnd() * TAU;
  const ox = Math.cos(offA) * off, oz = Math.sin(offA) * off;
  const centre = (y) => { const t = clamp((y - yb) / cH, 0, 1); return [ox * t, oz * t]; };
  const R = (y, phi) => {
    const t = (y - yb) / cH;
    if (t < 0 || t > 1) return 0;
    let m = 1;
    for (const L of lumps) m += L.a * Math.cos(L.k * phi + L.p + Math.sin(t * L.tf * 3.1 + L.tv) * 0.9);
    return R0 * prof(t) * Math.max(0.35, m);
  };
  // radial fraction of a point (0 on the axis, 1 on the envelope; > 1 outside)
  const frac = (x, y, z) => {
    const [cx, cz] = centre(y);
    const dx = x - cx, dz = z - cz;
    const r = Math.hypot(dx, dz);
    const Re = R(y, Math.atan2(dz, dx));
    if (Re <= 1e-4) return y > H ? 9 : (y < yb ? 9 : r / 1e-4);
    return r / Re;
  };
  const inside = (x, y, z, m = 1) => y >= yb - 0.02 * H && y <= H && frac(x, y, z) <= m;
  return { yb, H, W, cH, R, R0, centre, frac, inside };
}

// distance from p along unit d to the envelope boundary (marched)
function distToEnv(env, px, py, pz, dx, dy, dz, maxD) {
  const st = Math.max(0.12, env.W / 60);
  let t = 0;
  // start inside? if the start is outside (a limb root below the crown base), march until inside first
  let wasIn = env.inside(px, py, pz);
  for (let i = 0; i < 400 && t < maxD; i++) {
    t += st;
    const x = px + dx * t, y = py + dy * t, z = pz + dz * t;
    const nowIn = env.inside(x, y, z);
    if (wasIn && !nowIn) return t - st * 0.5;
    if (nowIn) wasIn = true;
  }
  return wasIn ? Math.min(t, maxD) : 0;
}

// ---------------------------------------------------------------- polyline helpers
function polyLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); return L; }
// sample a branch at arc fraction s: position, unit direction, radius
function sampleAt(b, s) {
  const pts = b.pts, rs = b.rs;
  const L = b.len ?? (b.len = polyLen(pts));
  let target = clamp(s, 0, 1) * L, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], c = pts[i];
    const dl = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    if (acc + dl >= target || i === pts.length - 1) {
      const u = dl > 1e-6 ? clamp((target - acc) / dl, 0, 1) : 0;
      const inv = dl > 1e-6 ? 1 / dl : 0;
      return {
        p: [lerp(a[0], c[0], u), lerp(a[1], c[1], u), lerp(a[2], c[2], u)],
        d: [(c[0] - a[0]) * inv, (c[1] - a[1]) * inv, (c[2] - a[2]) * inv],
        r: lerp(rs[i - 1], rs[i], u),
      };
    }
    acc += dl;
  }
  const n = pts.length - 1;
  return { p: pts[n].slice(), d: [0, 1, 0], r: rs[n] };
}
function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; v[0] /= l; v[1] /= l; v[2] /= l; return v; }
function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
// a direction at `ang` (rad) from unit d, at azimuth psi around it
function rotAway(d, psi, ang) {
  const ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm3(cross3(d, ref));
  const v = cross3(d, u);
  const ca = Math.cos(ang), sa = Math.sin(ang), cp = Math.cos(psi), sp = Math.sin(psi);
  return norm3([
    d[0] * ca + (u[0] * cp + v[0] * sp) * sa,
    d[1] * ca + (u[1] * cp + v[1] * sp) * sa,
    d[2] * ca + (u[2] * cp + v[2] * sp) * sa,
  ]);
}

// ---------------------------------------------------------------- skeleton
function growSkeleton(F, env, rnd) {
  const { H, W, yb, cH } = env;
  const B = [];
  const r0 = (F.trunkR ?? 0.017) * H;
  // ---- trunk (+ leader)
  const excurrent = (F.leader ?? 0) >= 0.6;
  const topY = excurrent ? yb + F.leader * cH : yb + (F.leader ?? 0.08) * cH;
  const leanA = rnd() * TAU, lean = (F.lean ?? 0.03) * (0.3 + 0.7 * rnd());
  const wig = (F.wiggle ?? 0.012) * H, wph = rnd() * TAU, wph2 = rnd() * TAU;
  const nT = excurrent ? 12 : 9;
  const tp = [], tr = [];
  for (let i = 0; i <= nT; i++) {
    const f = i / nT, y = -0.1 + f * (topY + 0.1);
    const [cx, cz] = env.centre(y);
    const pull = smooth(0.1, 1, f);
    const x = Math.cos(leanA) * lean * y + Math.sin(y * 0.9 + wph) * wig * f + cx * pull * 0.85;
    const z = Math.sin(leanA) * lean * y + Math.sin(y * 0.7 + wph2) * wig * f + cz * pull * 0.85;
    const flare = 1 + 0.42 * Math.pow(clamp(1 - y / 0.55, 0, 1), 2);
    const taper = excurrent ? Math.max(0.05, 1 - 0.95 * Math.pow(f, 1.15)) : 1 - 0.38 * Math.pow(f, 1.3);
    tp.push([x, y, z]); tr.push(r0 * flare * taper);
  }
  const trunk = { lvl: 0, pts: tp, rs: tr };
  B.push(trunk);
  const trunkAt = (y) => sampleAt(trunk, clamp((y + 0.1) / (topY + 0.1), 0, 1));

  // ---- grow one branch: tropism, gnarl, envelope containment
  const grow = (p0, d0, len, rA, rB, lvl) => {
    const step = lvl === 1 ? Math.max(0.35, H / 30) : Math.max(0.28, H / 40);
    const n = Math.max(2, Math.ceil(len / step));
    const seg = len / n;
    let p = p0.slice(), d = d0.slice();
    const pts = [p.slice()], rs = [rA];
    const trop = (F.trop && F.trop[lvl]) ?? 0.04, gn = (F.gnarl && F.gnarl[lvl]) ?? 0.12;
    for (let i = 1; i <= n; i++) {
      d[1] += trop * seg;
      d[0] += (rnd() - 0.5) * gn; d[1] += (rnd() - 0.5) * gn * 0.45; d[2] += (rnd() - 0.5) * gn;
      norm3(d);
      let q = [p[0] + d[0] * seg, p[1] + d[1] * seg, p[2] + d[2] * seg];
      // (TR37, `scafEase`, TR36 forms only: a scaffold is not steered while it is still under the crown base, where the
      // envelope has no width yet: it was turned straight up after its first step, a J-shaped hook at the fork. For its first
      // 1.6 m at most, and it arcs upward meanwhile: a limb leaving at 64 deg ran 2 m out under the crown, a bare straight plank
      // over the street at c120, tr37e)
      const ease = F.scafEase && lvl === 1 && q[1] < yb + 0.08 * cH && i * seg < 1.6;
      if (ease) { d[1] += 0.35 * seg; norm3(d); q = [p[0] + d[0] * seg, p[1] + d[1] * seg, p[2] + d[2] * seg]; }
      if (!ease && !env.inside(q[0], q[1], q[2], 1.0) && i > 1) {
        // steer along the surface: take out the outward radial part, lift a little
        const [cx, cz] = env.centre(q[1]);
        const ox = q[0] - cx, oz = q[2] - cz, ol = Math.hypot(ox, oz) || 1;
        const dotO = (d[0] * ox + d[2] * oz) / ol;
        if (dotO > 0) { d[0] -= (ox / ol) * dotO * 1.15; d[2] -= (oz / ol) * dotO * 1.15; }
        if (q[1] > H * 0.97) d[1] = Math.min(d[1], -0.1);
        norm3(d);
        q = [p[0] + d[0] * seg, p[1] + d[1] * seg, p[2] + d[2] * seg];
        if (!env.inside(q[0], q[1], q[2], 1.08)) break;
      }
      p = q; pts.push(p.slice()); rs.push(lerp(rA, rB, i / n));
    }
    if (pts.length < 2) return null;
    const b = { lvl, pts, rs };
    b.len = polyLen(pts);
    B.push(b);
    return b;
  };

  // ---- scaffolds
  const nS = Math.round(lerp(F.scaffolds[0], F.scaffolds[1], rnd()));
  const az0 = rnd() * TAU;
  const scaf = [];
  for (let i = 0; i < nS; i++) {
    let y0, elev, az;
    if (excurrent) {
      const t = clamp((i + 0.5 + (rnd() - 0.5) * 0.7) / nS, 0.02, 0.98);
      y0 = yb - 0.02 * cH + t * (topY - yb) * 0.9;
      const e = F.whorlAngle || [100, 50];
      elev = lerp(e[0], e[1], t) + (rnd() - 0.5) * 16;
      az = az0 + i * GOLD + (rnd() - 0.5) * 0.5;
    } else {
      y0 = topY - rnd() * (F.forkSpread ?? 0.12) * cH;
      const e = F.scafAngle || [30, 55];
      elev = lerp(e[0], e[1], rnd());
      az = az0 + (i / nS) * TAU + (rnd() - 0.5) * (TAU / nS) * 0.55;
    }
    const at = trunkAt(y0);
    const er = (elev * Math.PI) / 180;
    const d = norm3([Math.sin(er) * Math.cos(az), Math.cos(er), Math.sin(er) * Math.sin(az)]);
    const reach = distToEnv(env, at.p[0], at.p[1], at.p[2], d[0], d[1], d[2], 2.5 * Math.max(W, cH));
    const len = Math.max(0.35 * cH, reach * lerp(F.scafReach?.[0] ?? 0.82, F.scafReach?.[1] ?? 0.96, rnd()));
    let rA = Math.max(0.02, at.r * (F.scafRad ?? 0.62) * (0.85 + 0.3 * rnd()));
    // (TR36 only, `scafRadLen`: a short scaffold no fatter than that share of its length; trees25's forms do not set it)
    if (F.scafRadLen) rA = Math.max(0.02, Math.min(rA, len * F.scafRadLen));
    const b = grow(at.p, d, len, rA, Math.max(0.006, rA * 0.12), 1);
    // TR37: a scaffold born below the crown base, where the envelope has no width, stops after a step or two: a fat cone
    // 0.3-0.7 m long (treeH: 0.35 m at r 0.084) that read as a horn or a plate at the fork (sbs36/ab_hero_fork). It stays in
    // `scaf` (its secondaries keep the random stream, so every other branch is where it was) but draws no bark.
    if (b && b.len < Math.min(1.2, 0.3 * len)) { b.stub = true; B.splice(B.indexOf(b), 1); }
    if (b) scaf.push(b);
  }
  // the upper leader of an excurrent tree bears secondaries too
  const bearers = scaf.slice();
  if (excurrent) {
    // (a fresh object: the trunk's cached `len` would stretch sampleAt over the cut leader)
    const keep = trunk.pts.map((q, i) => i).filter((i) => trunk.pts[i][1] > yb + 0.35 * cH);
    if (keep.length >= 2) bearers.push({ lvl: 1, pts: keep.map((i) => trunk.pts[i]), rs: keep.map((i) => trunk.rs[i]) });
  }

  // ---- secondaries
  const sec = [];
  for (const b of bearers) {
    if (!b.pts || b.pts.length < 2) continue;
    const L = b.len ?? (b.len = polyLen(b.pts));
    const n2 = Math.max(1, Math.round((F.kids2 ?? 1.4) * L * (0.8 + 0.4 * rnd())));
    const s0 = F.kidStart2 ?? 0.22;
    let psi = rnd() * TAU;
    for (let k = 0; k < n2; k++) {
      const s = s0 + (1 - s0) * clamp((k + 0.15 + 0.7 * rnd()) / n2, 0, 1);
      const at = sampleAt(b, s);
      psi += GOLD + (rnd() - 0.5) * 0.6;
      const ka = F.kidAngle2 || [35, 60];
      let cd = rotAway(at.d, psi, (lerp(ka[0], ka[1], rnd()) * Math.PI) / 180);
      const [cx, cz] = env.centre(at.p[1]);
      const ox = at.p[0] - cx, oz = at.p[2] - cz, ol = Math.hypot(ox, oz) || 1;
      const ob = F.outBias2 ?? 0.35, ub = F.upBias2 ?? 0.12;
      cd = norm3([cd[0] + (ox / ol) * ob, cd[1] + ub, cd[2] + (oz / ol) * ob]);
      if (cd[1] < -0.55) cd = norm3([cd[0], -0.55, cd[2]]);
      const reach = distToEnv(env, at.p[0], at.p[1], at.p[2], cd[0], cd[1], cd[2], 1.6 * W);
      const kr = F.kidReach2 || [0.55, 0.95];
      let len = Math.min((F.kidLenMax2 ?? 0.36) * W, reach * lerp(kr[0], kr[1], rnd()));
      len *= 1 - 0.3 * s;
      if (len < 0.25) continue;
      // TR34 v5: never fatter than 7 % of its length (a 0.3 m secondary born 7 cm thick on a scaffold drew as a flat bark
      // 'blade' beside the trunk: c120, w2r1j)
      const rA = Math.max(0.012, Math.min(at.r * 0.58, len * 0.07));
      const c = grow(at.p, cd, len, rA, Math.max(0.003, rA * 0.12), 2);
      // TR37: one that stopped after a step (0.27 m at r 0.055 under treeH2's fork: a horn) draws no bark; kept in the stream
      if (c && c.len < 8 * rA) { c.stub = true; B.splice(B.indexOf(c), 1); }
      if (c) sec.push(c);
    }
  }
  return { B, trunk, scaf, sec, r0, topY, excurrent };
}

// ---------------------------------------------------------------- leafy shoots (card candidates)
function shootCandidates(F, env, sk, rnd) {
  const C = [];
  // TR34: the twigs themselves, kept as third-order branches for the bark mesh (C.twigs): the open crowns on 125th Street
  // (honeylocust, sophora) show their fine branching between the leaf clumps, and a crown of cards hung on nothing is the
  // "paper cutout" look
  const T = [];
  C.twigs = T;
  const { yb } = env;
  const sl = F.shootLen || [0.6, 0.9];
  const sa = F.shootAngle || [25, 60];
  let clumpNow = null;   // the twig clump the next shoots belong to (cluster normals, cardsGeo)
  const add = (p, d, sizeK) => {
    if (p[1] < yb + 0.04 * env.cH) return;
    const f = env.frac(p[0], p[1], p[2]);
    if (f > 1.28) return;
    C.push({ p, d, size: lerp(sl[0], sl[1], rnd()) * sizeK, outer: clamp(f, 0, 1.1), clump: clumpNow });
  };
  const shootDir = (p, d0, psi) => {
    let d = rotAway(d0, psi, (lerp(sa[0], sa[1], rnd()) * Math.PI) / 180);
    const [cx, cz] = env.centre(p[1]);
    const ox = p[0] - cx, oz = p[2] - cz, ol = Math.hypot(ox, oz) || 1;
    return norm3([d[0] + (ox / ol) * 0.3, d[1] + (F.shootUp ?? 0.2), d[2] + (oz / ol) * 0.3]);
  };
  const along = (b, perM, sFrom, sizeK) => {
    const L = b.len ?? (b.len = polyLen(b.pts));
    const n = Math.max(1, Math.round(perM * L * (0.8 + 0.4 * rnd())));
    let psi = rnd() * TAU;
    for (let k = 0; k < n; k++) {
      const s = sFrom + (1 - sFrom) * clamp((k + rnd()) / n, 0, 1);
      const at = sampleAt(b, s);
      psi += GOLD + (rnd() - 0.5) * 0.9;
      add(at.p, shootDir(at.p, at.d, psi), sizeK);
    }
    // the tip carries a terminal shoot along the branch
    const tip = sampleAt(b, 1);
    add(tip.p, norm3([tip.d[0], tip.d[1] + 0.15, tip.d[2]]), sizeK * 1.05);
  };
  // TWIGS: short virtual third-order branches (no geometry) along the outer part of each secondary, each bearing a
  // CLUMP of 2-5 shoots. A real crown's foliage is clumped on its twigs, with dark gaps between the clumps; a card per
  // metre of secondary spread evenly is the "noisy cards" look.
  const twigs = (b, perM, sFrom) => {
    const L = b.len ?? (b.len = polyLen(b.pts));
    const n = Math.max(1, Math.round(perM * L * (0.8 + 0.4 * rnd())));
    let psi = rnd() * TAU;
    const tl = F.twigLen || [0.7, 1.4], ta = F.twigAngle || [35, 65];
    for (let k = 0; k < n; k++) {
      const s = sFrom + (1 - sFrom) * clamp((k + rnd()) / n, 0, 1);
      const at = sampleAt(b, s);
      psi += GOLD + (rnd() - 0.5) * 0.7;
      let d = rotAway(at.d, psi, (lerp(ta[0], ta[1], rnd()) * Math.PI) / 180);
      const [cx, cz] = env.centre(at.p[1]);
      const ox = at.p[0] - cx, oz = at.p[2] - cz, ol = Math.hypot(ox, oz) || 1;
      d = norm3([d[0] + (ox / ol) * 0.35, d[1] + (F.twigUp ?? 0.18), d[2] + (oz / ol) * 0.35]);
      const len = lerp(tl[0], tl[1], rnd()) * (1 - 0.35 * s);
      const nC = C.length;
      const m = Math.max(1, Math.round(lerp(F.clump?.[0] ?? 2, F.clump?.[1] ?? 4, rnd())));
      let psi2 = rnd() * TAU;
      // the clump's volume centre: out along the twig, lifted by about a card (the shoots grow up and out of it)
      const sk0 = (sl[0] + sl[1]) * 0.5;
      clumpNow = [at.p[0] + d[0] * len * 0.7, at.p[1] + d[1] * len * 0.7 + sk0 * 0.35, at.p[2] + d[2] * len * 0.7, sk0 * 0.9];
      for (let j = 0; j < m; j++) {
        const f = m === 1 ? 0.6 : 0.25 + 0.75 * (j / (m - 1));
        const p = [at.p[0] + d[0] * len * f, at.p[1] + d[1] * len * f, at.p[2] + d[2] * len * f];
        psi2 += GOLD + (rnd() - 0.5) * 0.8;
        add(p, j === m - 1 ? norm3([d[0], d[1] + 0.1, d[2]]) : shootDir(p, d, psi2), 1);
      }
      clumpNow = null;
      // the twig's tube, only when it bears leaves (below the crown base or outside the envelope its shoots are dropped,
      // and a bare fan of twigs there read as a broom: c120, w2r1e). Radius from the bearer at the root, ending in a point.
      if (C.length > nC) T.push({ lvl: 3, pts: [at.p.slice(), [at.p[0] + d[0] * len, at.p[1] + d[1] * len, at.p[2] + d[2] * len]], rs: [Math.max(0.0045, Math.min(0.012, at.r * 0.55)), 0.002] });
    }
  };
  for (const b of sk.sec) {
    along(b, F.shootsPerM ?? 1.2, F.shootFrom ?? 0.3, 1);
    twigs(b, F.twigsPerM ?? 1.0, F.twigFrom ?? 0.3);
  }
  // scaffolds bear shoots and twigs on their outer part (fills the crown between secondaries)
  for (const b of sk.scaf) {
    along(b, (F.shootsPerM ?? 1.2) * (F.scafShoots ?? 0.5), F.scafFrom ?? 0.35, 1.05);
    twigs(b, (F.twigsPerM ?? 1.0) * (F.scafShoots ?? 0.5), (F.scafFrom ?? 0.35) + 0.05);
  }
  // spur shoots (ginkgo): short clusters straight on the scaffolds' whole length
  if (F.spurs) for (const b of sk.scaf) along(b, F.spurs, 0.15, 0.8);
  return C;
}

// weighted sampling without replacement (Efraimidis-Spirakis): keys u^(1/w)
function pickCards(C, n, shell, rnd) {
  const keyed = C.map((c) => {
    const w = ((1 - shell) + shell * smooth(0.3, 1.0, c.outer) + 1e-3) * (c.gw ?? 1);   // (TR39: gw, the crown-gap weight)
    return [Math.pow(rnd(), 1 / w), c];
  });
  keyed.sort((a, b) => b[0] - a[0]);
  return keyed.slice(0, Math.min(n, keyed.length)).map((k) => k[1]);
}

// TR34 SISTER SHOOTS. A form whose skeleton yields fewer shoot candidates than its card budget used to ENLARGE every card
// (up to 1.5x) to hold the coverage: the honeylocust, sophora, pin oak and maple crowns drew 1.37-1.5x leaves, i.e. a
// sophora leaflet the size of a hand and a crown that read as a few big flat cut-outs (s120, lenoxW, 2026-10-01). A real
// twig carries several shoots: add them beside the existing ones (same clump, a little along and around the parent's stem,
// splayed off it) until the coverage the enlargement bought is reached at the leaf's own scale -- more, smaller cards, more
// layers in depth, the same leaf area.
function sisterShoots(F, env, C, n, rnd) {
  const out = [];
  const sl = F.shootLen || [0.6, 0.9];
  for (let it = 0; out.length < n && it < n * 4 && C.length; it++) {
    const c = C[(rnd() * C.length) | 0];
    const psi = rnd() * TAU;
    const d0 = rotAway(c.d, psi, ((16 + 24 * rnd()) * Math.PI) / 180);
    const [cx, cz] = env.centre(c.p[1]);
    const ox = c.p[0] - cx, oz = c.p[2] - cz, ol = Math.hypot(ox, oz) || 1;
    const d = norm3([d0[0] + (ox / ol) * 0.15, d0[1] + (F.shootUp ?? 0.2) * 0.5, d0[2] + (oz / ol) * 0.15]);
    const sd = rotAway(c.d, psi + 1.3, Math.PI / 2);
    const k = c.size * (0.1 + 0.22 * rnd()), a = c.size * (rnd() - 0.3) * 0.3;
    const p = [c.p[0] + sd[0] * k + c.d[0] * a, c.p[1] + sd[1] * k + c.d[1] * a, c.p[2] + sd[2] * k + c.d[2] * a];
    if (p[1] < env.yb + 0.04 * env.cH) continue;
    const f = env.frac(p[0], p[1], p[2]);
    if (f > 1.28) continue;
    out.push({ p, d, size: lerp(sl[0], sl[1], rnd()), outer: clamp(f, 0, 1.1), clump: c.clump });
  }
  return out;
}

// ---------------------------------------------------------------- crown AO (leaf-area density + sky transmittance)
const SKY_DIRS = (() => {
  const d = [[0, 1, 0, 1.0]];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU, e = (58 * Math.PI) / 180; d.push([Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e), 0.85]); }
  for (let i = 0; i < 7; i++) { const a = ((i + 0.5) / 7) * TAU, e = (26 * Math.PI) / 180; d.push([Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e), 0.6]); }
  for (let i = 0; i < 3; i++) { const a = ((i + 0.2) / 3) * TAU, e = (4 * Math.PI) / 180; d.push([Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e), 0.35]); }
  return d;
})();
function makeDensity(cards, env) {
  const pad = 1.0;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const c of cards) { x0 = Math.min(x0, c.p[0]); y0 = Math.min(y0, c.p[1]); z0 = Math.min(z0, c.p[2]); x1 = Math.max(x1, c.p[0]); y1 = Math.max(y1, c.p[1]); z1 = Math.max(z1, c.p[2]); }
  x0 -= pad; y0 -= pad; z0 -= pad; x1 += pad; y1 += pad; z1 += pad;
  const cs = Math.max(0.35, Math.max(x1 - x0, y1 - y0, z1 - z0) / 22);
  const nx = Math.max(1, Math.ceil((x1 - x0) / cs)), ny = Math.max(1, Math.ceil((y1 - y0) / cs)), nz = Math.max(1, Math.ceil((z1 - z0) / cs));
  const g = new Float32Array(nx * ny * nz);
  const vol = cs * cs * cs;
  for (const c of cards) {
    const i = Math.floor((c.p[0] + c.d[0] * c.size * 0.5 - x0) / cs), j = Math.floor((c.p[1] + c.d[1] * c.size * 0.5 - y0) / cs), k = Math.floor((c.p[2] + c.d[2] * c.size * 0.5 - z0) / cs);
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
    g[(k * ny + j) * nx + i] += (c.size * c.size * (c.opacity ?? 0.45)) / vol;   // leaf area density m^2/m^3
  }
  const at = (x, y, z) => {
    const i = Math.floor((x - x0) / cs), j = Math.floor((y - y0) / cs), k = Math.floor((z - z0) / cs);
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return 0;
    return g[(k * ny + j) * nx + i];
  };
  return { at, cs, reach: Math.hypot(x1 - x0, y1 - y0, z1 - z0) };
}
function skyVis(D, x, y, z, ext) {
  let sw = 0, sv = 0;
  const st = D.cs * 0.75;
  for (const [dx, dy, dz, w] of SKY_DIRS) {
    let tau = 0;
    for (let t = st * 0.6; t < D.reach; t += st) tau += D.at(x + dx * t, y + dy * t, z + dz * t) * st;
    sv += w * Math.exp(-ext * tau);
    sw += w;
  }
  return sv / sw;
}
// TC26 SUN VISIBILITY: the same transmittance along the 17 sky directions, fitted (least squares) as vis(L) ~ c0 + c1.L,
// so the shader can self-shadow a card toward the ACTUAL sun: the sun-side shell of every clump stays open, the clump's
// far side, the crown interior and the anti-sun half go dark. SUN_FIT[k] = row k of (A^T A)^-1 A^T, A rows [1, d].
const SUN_FIT = (() => {
  const a = [0, 1, 2, 3].map(() => new Array(8).fill(0));
  for (const [dx, dy, dz] of SKY_DIRS) { const r = [1, dx, dy, dz]; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) a[i][j] += r[i] * r[j]; }
  for (let i = 0; i < 4; i++) a[i][4 + i] = 1;
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    const d = a[c][c];
    for (let j = 0; j < 8; j++) a[c][j] /= d;
    for (let r = 0; r < 4; r++) if (r !== c) { const f = a[r][c]; for (let j = 0; j < 8; j++) a[r][j] -= f * a[c][j]; }
  }
  return SKY_DIRS.map(([dx, dy, dz]) => [0, 1, 2, 3].map((i) => a[i][4] + a[i][5] * dx + a[i][6] * dy + a[i][7] * dz));
})();
function sunFit(D, x, y, z, ext) {
  const st = D.cs * 0.75;
  let c0 = 0, c1 = 0, c2 = 0, c3 = 0;
  for (let k = 0; k < SKY_DIRS.length; k++) {
    const [dx, dy, dz] = SKY_DIRS[k];
    let tau = 0;
    for (let t = st * 0.6; t < D.reach; t += st) tau += D.at(x + dx * t, y + dy * t, z + dz * t) * st;
    const T = Math.exp(-ext * tau), m = SUN_FIT[k];
    c0 += m[0] * T; c1 += m[1] * T; c2 += m[2] * T; c3 += m[3] * T;
  }
  return [c1, c2, c3, c0];
}
// a clump's tone offset in [-1, 1] from its centre (no rnd(): the generator's stream, and so every other output, is unchanged)
const toneHash = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };

// ---------------------------------------------------------------- geometry: bark tubes
// o36 (TR36 only; trees25 passes nothing): { buttress: lobes, flare: extra base flare, collar: radius gain at a branch root }
function tubes(branches, segsByLvl, secLenByLvl, tint, aoFn, barkU, minR2, o36) {
  const P = [], N = [], U = [], Cc = [], I = [];
  let vbase = 0;
  for (const b of branches) {
    // (TR34 twigs, lvl 3: 3-sided, and only where the form draws its secondaries at all)
    let seg = b.lvl === 3 ? (segsByLvl[2] ? segsByLvl[3] ?? 3 : 0) : segsByLvl[b.lvl] ?? 3;
    if (!seg) continue;
    // thin secondaries live inside the foliage: a 3-sided tube there is triangles nobody sees
    if (b.lvl === 2 && b.rs[0] < minR2) continue;
    // (a thick secondary on 3 sides is a triangular prism: 5 from 3 cm up)
    if (b.lvl === 2 && b.rs[0] > 0.03) seg = Math.max(seg, 5);
    // resample along the branch
    const L = b.len ?? (b.len = polyLen(b.pts));
    const nSec = Math.max(1, Math.min(b.pts.length - 1, b.lvl >= 2 ? 2 : 99, Math.ceil(L / (secLenByLvl[b.lvl] ?? 1.2))));
    let rings = [];
    if (o36 && b.lvl === 0) {
      // TR36: rings close together at the foot, where the flare and the buttress roots change the section fastest
      const fr = new Set();
      for (const d of [0, 0.06, 0.14, 0.24, 0.36, 0.5, 0.68, 0.9, 1.2, 1.6]) if (d < L) fr.add(d / L);
      for (let i = 0; i <= nSec; i++) fr.add(i / nSec);
      // (TR37: a ring 6 cm under the top, so the pointed end is a short dome over the fork, not a 0.45 m cone the limbs' roots
      // stick out of)
      if (L > 0.5) fr.add((L - 0.06) / L);
      rings = [...fr].sort((a, c) => a - c).map((f) => sampleAt(b, f));
    } else if (o36 && b.lvl >= 1 && b.lvl <= 2) {
      // TR36: a branch collar: the root ring swollen and a second ring just above it
      rings.push(sampleAt(b, 0));
      rings.push(sampleAt(b, Math.min(0.5 / nSec, 0.045)));
      for (let i = 1; i <= nSec; i++) rings.push(sampleAt(b, i / nSec));
      rings[0].k36 = o36.collar; rings[1].k36 = 1 + (o36.collar - 1) * 0.35;
    } else for (let i = 0; i <= nSec; i++) rings.push(sampleAt(b, i / nSec));
    // start inside the parent a little (hides the joint)
    if (b.lvl > 0) { const r0 = rings[0]; r0.p = [r0.p[0] - r0.d[0] * r0.r * 0.8, r0.p[1] - r0.d[1] * r0.r * 0.8, r0.p[2] - r0.d[2] * r0.r * 0.8]; }
    const nR = rings.length - 1;
    const ph36 = (Math.abs(Math.sin((b.pts[0][0] + 1.7) * 12.9898 + (b.pts[0][2] + 3.1) * 78.233)) * 6.283) % 6.283;
    // parallel transport frames
    let nrm = null;
    const circ = TAU * Math.max(0.02, b.rs[0]);
    const uRep = Math.max(1, Math.round(circ / (barkU ?? 0.9)));
    let vAcc = 0;
    for (let i = 0; i <= nR; i++) {
      const R = rings[i];
      const t = i < nR ? norm3([rings[i + 1].p[0] - R.p[0], rings[i + 1].p[1] - R.p[1], rings[i + 1].p[2] - R.p[2]]) : R.d;
      if (!nrm) { const ref = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; nrm = norm3(cross3(t, ref)); }
      else { const d = nrm[0] * t[0] + nrm[1] * t[1] + nrm[2] * t[2]; nrm = norm3([nrm[0] - t[0] * d, nrm[1] - t[1] * d, nrm[2] - t[2] * d]); }
      const bin = cross3(t, nrm);
      if (i > 0) vAcc += Math.hypot(R.p[0] - rings[i - 1].p[0], R.p[1] - rings[i - 1].p[1], R.p[2] - rings[i - 1].p[2]);
      const ao = aoFn(R.p);
      // limbs end in a POINT (the lab showed sawn-off stubs where a branch stopped at the envelope)
      // (TR37, TR36 forms only: the trunk too: a fork form's trunk stopped at its top ring, an open tube end over the fork; the
      // trees25 trunk keeps its ring, which cpFloraKit's trunk remesh reads)
      const r = (i === nR && (b.lvl > 0 || o36) ? 0.0015 : Math.max(0.004, R.r)) * (R.k36 ?? 1);
      // TR36 foot: an extra flare and buttress roots (lobes fading out by ~0.8 m), a slight out-of-round all the way up
      const y36 = o36 && b.lvl === 0 ? R.p[1] + 0.1 : -1;
      const foot = y36 >= 0 ? Math.pow(clamp(1 - y36 / 0.85, 0, 1), 1.7) : 0;
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        const nx = nrm[0] * ca + bin[0] * sa, ny = nrm[1] * ca + bin[1] * sa, nz = nrm[2] * ca + bin[2] * sa;
        const rj = y36 >= 0
          ? r * (1 + foot * (o36.flare + o36.buttress * Math.pow(Math.max(0, Math.cos(5 * a + ph36)), 3)) + 0.05 * Math.sin(3 * a + ph36 * 1.7))
          : r;
        P.push(R.p[0] + nx * rj, R.p[1] + ny * rj, R.p[2] + nz * rj);
        N.push(nx, ny, nz);
        U.push((j / seg) * uRep, vAcc / (circ / uRep));
        Cc.push(tint[0] * ao, tint[1] * ao, tint[2] * ao);
      }
    }
    const rowN = seg + 1;
    for (let i = 0; i < nR; i++) for (let j = 0; j < seg; j++) {
      const a = vbase + i * rowN + j, b2 = a + 1, c = a + rowN, d = c + 1;
      // TR37 (2026-10-02): wound OUTWARD (counter-clockwise seen from outside). It was I.push(a, c, b2, b2, c, d), i.e. every
      // bark triangle faced inward (100 % of trees25 and TR36 bark, checked against the normal attribute), so the FrontSide
      // bark drew the inside of each tube's far wall: the near wall culled, the scaffold roots buried in the trunk showed
      // through as flat plates at the fork (sbs36/ab_hero_fork.jpg), and the trunk took the far side's normals (dark, smooth).
      // (`a` stays first in each quad: cpFloraKit's trunk remesh finds the trunk's last ring from it.)
      I.push(a, b2, c, b2, d, c);
    }
    vbase += (nR + 1) * rowN;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  g.setIndex(vbase > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

// ---------------------------------------------------------------- geometry: leaf cards
// `cellUV(cell)` -> [u0, v0, u1, v1] in the leaf atlas. Normals are the crown-VOLUME normal (ellipsoid gradient from
// the crown centre, lifted toward the sky) so a card shades as part of the crown mass, not as a flat sheet; `aFace`
// keeps the true card facing for the edge-on fade; `aAO` is the baked crown sky visibility.
function cardsGeo(cards, env, cellUV, colFn, sunFn, cluK = 1) {
  const n = cards.length;
  const P = new Float32Array(n * 12), N = new Float32Array(n * 12), UV = new Float32Array(n * 8);
  const C = new Float32Array(n * 12), FA = new Float32Array(n * 12), AO = new Float32Array(n * 4);
  // TC26: aSun (sun-visibility fit, xyz gradient + w constant) and aClu (the pure clump normal x (0.75 + 0.25 tone))
  const SV = new Float32Array(n * 16), CLU = new Float32Array(n * 12);
  const I = new (n * 4 > 65535 ? Uint32Array : Uint16Array)(n * 6);
  const cy = env.yb + env.cH * 0.55, ry = Math.max(0.5, env.cH * 0.55), rx = Math.max(0.5, env.R0);
  for (let k = 0; k < n; k++) {
    const c = cards[k];
    const u = c.d;                       // stem -> tip
    const w = c.size * (c.aspect ?? 1), h = c.size;
    const s = c.side, nf = c.face;       // card side axis, card facing
    const q = [
      [c.p[0] - s[0] * w * 0.5, c.p[1] - s[1] * w * 0.5, c.p[2] - s[2] * w * 0.5],
      [c.p[0] + s[0] * w * 0.5, c.p[1] + s[1] * w * 0.5, c.p[2] + s[2] * w * 0.5],
      [c.p[0] + s[0] * w * 0.5 + u[0] * h, c.p[1] + s[1] * w * 0.5 + u[1] * h, c.p[2] + s[2] * w * 0.5 + u[2] * h],
      [c.p[0] - s[0] * w * 0.5 + u[0] * h, c.p[1] - s[1] * w * 0.5 + u[1] * h, c.p[2] - s[2] * w * 0.5 + u[2] * h],
    ];
    const [u0, v0, u1, v1] = cellUV(c.cell, c.flip);
    const uvq = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    const col = colFn(c);
    for (let j = 0; j < 4; j++) {
      const o = (k * 4 + j) * 3;
      P[o] = q[j][0]; P[o + 1] = q[j][1]; P[o + 2] = q[j][2];
      const [ccx, ccz] = env.centre(q[j][1]);
      let nx = (q[j][0] - ccx) / (rx * rx), ny = (q[j][1] - cy) / (ry * ry), nz = (q[j][2] - ccz) / (rx * rx);
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny = ny / l + 0.32; nz /= l;
      // CLUSTER NORMALS: the shoots of one twig clump shade as one small volume (a lit top, a darker underside),
      // which is the medium-frequency light/dark structure a real crown has between its leaf masses. A lone shoot
      // is a volume of its own (a "puffy" card, centred a card-half above its stem).
      {
        const cl = c.clump || [c.p[0] + u[0] * h * 0.5, c.p[1] + u[1] * h * 0.5 + h * 0.25, c.p[2] + u[2] * h * 0.5];
        let kx = q[j][0] - cl[0], ky = q[j][1] - cl[1], kz = q[j][2] - cl[2];
        const kl = Math.hypot(kx, ky, kz) || 1;
        const wk = (c.clump ? 0.5 : 0.3) * cluK;
        // (TR35 cluK < 1: the clump direction blended toward the crown-volume normal, for the CLU attribute as well)
        const vl = Math.hypot(nx, ny, nz) || 1, vx = nx / vl, vy = ny / vl, vz = nz / vl;
        nx = nx * (1 - wk) + (kx / kl) * wk; ny = ny * (1 - wk) + (ky / kl) * wk; nz = nz * (1 - wk) + (kz / kl) * wk;
        if (!c.bark) {
          const tk = 0.75 + 0.25 * toneHash(cl[0], cl[1], cl[2]);
          let ux = kx / kl, uy = ky / kl, uz = kz / kl;
          if (cluK < 1) { ux = vx + (ux - vx) * cluK; uy = vy + (uy - vy) * cluK; uz = vz + (uz - vz) * cluK; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul; }
          CLU[o] = ux * tk; CLU[o + 1] = uy * tk; CLU[o + 2] = uz * tk;
        }
      }
      if (sunFn) { const sv = sunFn(q[j][0], q[j][1], q[j][2]); SV.set(sv, (k * 4 + j) * 4); }
      else SV[(k * 4 + j) * 4 + 3] = 1;
      // a quarter of the card's own facing (flipped to the outside) keeps some leaf-to-leaf value break-up
      const sgn = nf[0] * nx + nf[1] * ny + nf[2] * nz < 0 ? -0.22 : 0.22;
      nx += nf[0] * sgn; ny += nf[1] * sgn; nz += nf[2] * sgn;
      const l2 = Math.hypot(nx, ny, nz) || 1;
      N[o] = nx / l2; N[o + 1] = ny / l2; N[o + 2] = nz / l2;
      FA[o] = nf[0]; FA[o + 1] = nf[1]; FA[o + 2] = nf[2];
      C[o] = col[0]; C[o + 1] = col[1]; C[o + 2] = col[2];
      UV[(k * 4 + j) * 2] = uvq[j][0]; UV[(k * 4 + j) * 2 + 1] = uvq[j][1];
      AO[k * 4 + j] = c.ao ?? 1;
    }
    const b = k * 4;
    I.set([b, b + 1, b + 2, b, b + 2, b + 3], k * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.setAttribute('aFace', new THREE.BufferAttribute(FA, 3));
  g.setAttribute('aAO', new THREE.BufferAttribute(AO, 1));
  g.setAttribute('aSun', new THREE.BufferAttribute(SV, 4));
  g.setAttribute('aClu', new THREE.BufferAttribute(CLU, 3));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

// orient a card: `d` stem->tip, facing turned toward the crown outside and the sky, rolled at random
function orientCard(c, env, rnd, roll) {
  const [cx, cz] = env.centre(c.p[1]);
  const ox = c.p[0] - cx, oz = c.p[2] - cz, ol = Math.hypot(ox, oz) || 1;
  const want = norm3([ox / ol, 0.75, oz / ol]);
  const u = c.d;
  const dp = want[0] * u[0] + want[1] * u[1] + want[2] * u[2];
  let f = [want[0] - u[0] * dp, want[1] - u[1] * dp, want[2] - u[2] * dp];
  if (Math.hypot(f[0], f[1], f[2]) < 0.15) f = cross3(u, [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]);
  norm3(f);
  // roll around the stem axis
  const a = (rnd() - 0.5) * 2 * roll, ca = Math.cos(a), sa = Math.sin(a);
  const s0 = norm3(cross3(u, f));
  const face = norm3([f[0] * ca + s0[0] * sa, f[1] * ca + s0[1] * sa, f[2] * ca + s0[2] * sa]);
  c.face = face;
  c.side = norm3(cross3(face, u));
}

// ---------------------------------------------------------------- public entry
// F: form spec (furnitureKit TREE_FORMS), H/W: target box in metres, seed: variant seed.
// opts.cellUV(cell, flip) -> [u0,v0,u1,v1]; opts.barkCell: atlas cell of the solid bark swatch (LOD1 trunk proxy).
// Returns { trunk0, leaves0, leaves1, stats }.
export function buildTree(F, H, W, seed, opts) {
  const rnd = mulberry32(seed * 7919 + 13);
  // the lumps push the crown past its nominal radius; build a little narrow and normalise to the box at the end
  const env = makeEnvelope(F, H, W * (F.envK ?? 0.86), rnd);
  const sk = growSkeleton(F, env, rnd);
  const C = shootCandidates(F, env, sk, rnd);
  const cells = Array.isArray(F.cell) ? F.cell : [F.cell];
  const T35 = TR35_FORM[F.seed] || null, cluK = T35?.cluK ?? 1;
  // LOD0 cards
  const n0 = Math.round(F.cards0 ?? 800);
  // too few candidates for the budget: (was) enlarge what there is to hold the coverage, up to 1.5x; TR34: the same leaf
  // area as more cards at the leaf's own scale (sister shoots, above). Coverage goes as count x size^2, so the count that
  // matches the old enlargement is C x grow0^2, capped at the budget.
  const grow0 = C.length && C.length < n0 ? Math.min(1.5, Math.sqrt(n0 / C.length)) : 1;
  const nFill = grow0 > 1 ? Math.min(n0, Math.round(C.length * grow0 * grow0)) : C.length;
  const C0 = nFill > C.length ? C.concat(sisterShoots(F, env, C, nFill - C.length, rnd)) : C;
  let cards0 = pickCards(C0, n0, F.shell ?? 0.6, rnd);
  const grow1 = C0.length < n0 ? Math.min(1.5, Math.sqrt(Math.min(n0, C.length * grow0 * grow0) / Math.max(1, C0.length))) : 1;   // (1 unless the sisters ran short)
  cards0 = cards0.map((c) => ({ ...c, size: c.size * grow1, cell: cells[(rnd() * cells.length) | 0], flip: rnd() < 0.5, opacity: F.opacity ?? 0.45, aspect: F.aspect ?? 1 }));
  for (const c of cards0) orientCard(c, env, rnd, (F.roll ?? 55) * Math.PI / 180);
  // LOD1: the outer shell of the same shoots, fewer and larger
  const n1 = Math.min(Math.round(F.cards1 ?? n0 * 0.24), Math.round(cards0.length * 0.4));
  // (x1.0 of the area ratio measured 5 % less side coverage than LOD0 at 0.92: the swap would thin the crown)
  const k1 = F.size1 ?? Math.min(2.4, Math.sqrt(cards0.length / Math.max(1, n1)) * 1.0);
  let cards1 = pickCards(cards0, n1, Math.min(0.95, (F.shell ?? 0.6) + 0.3), rnd).map((c) => ({ ...c, size: c.size * k1, p: c.p.slice() }));
  // pull the enlarged cards' anchors inward so they do not balloon the silhouette
  for (const c of cards1) {
    const [cx, cz] = env.centre(c.p[1]);
    const pull = (k1 - 1) * c.size / k1 * 0.35;
    const ox = c.p[0] - cx, oz = c.p[2] - cz, ol = Math.hypot(ox, oz) || 1;
    c.p[0] -= (ox / ol) * pull; c.p[2] -= (oz / ol) * pull; c.p[1] -= c.d[1] * pull * 0.6;
  }
  // ---- crown AO from the LOD0 leaf density (both LODs share it: one tree)
  const D = makeDensity(cards0, env);
  const ext = T35?.aoExt ?? F.aoExt ?? 0.55;
  const aoOf = (x, y, z) => skyVis(D, x, y, z, ext);
  for (const c of cards0) {
    const m = [c.p[0] + c.d[0] * c.size * 0.5, c.p[1] + c.d[1] * c.size * 0.5, c.p[2] + c.d[2] * c.size * 0.5];
    c.ao = 0.16 + 0.84 * Math.pow(aoOf(m[0], m[1], m[2]), 0.8);
  }
  for (const c of cards1) {
    const m = [c.p[0] + c.d[0] * c.size * 0.5, c.p[1] + c.d[1] * c.size * 0.5, c.p[2] + c.d[2] * c.size * 0.5];
    c.ao = 0.2 + 0.8 * Math.pow(aoOf(m[0], m[1], m[2]), 0.8);
  }
  // ---- per-card colour: sun leaves (outer, open) warmer and lighter, shade leaves (inner) cooler and darker,
  // plus a per-card value/hue jitter. Multiplies the atlas; stays near 1 (the atlas carries the albedo).
  const colFn = (c) => {
    const o = smooth(0.35, 1.0, c.outer) * 0.7 + (c.ao ?? 1) * 0.3;
    const j = 0.9 + rnd() * 0.18, hj = (rnd() - 0.5) * 0.06;
    return [(0.93 + 0.1 * o + hj) * j, (0.97 + 0.05 * o) * j, (1.0 - 0.1 * o - hj * 0.5) * j];
  };
  const cellUV = opts.cellUV;
  const sunOf = (x, y, z) => sunFit(D, x, y, z, ext);
  const leaves0 = cardsGeo(cards0, env, cellUV, colFn, sunOf, cluK);
  // LOD1 crown + trunk proxy (two crossed quads in the solid bark cell of the atlas)
  if (opts.barkCell != null) {
    const trunkTopY = Math.min(sk.topY, env.yb + 0.25 * env.cH);
    const t0 = sampleAt(sk.trunk, 0), tT = sampleAt(sk.trunk, clamp((trunkTopY + 0.1) / (sk.topY + 0.1), 0, 1));
    const len = Math.hypot(tT.p[0] - t0.p[0], tT.p[1] - t0.p[1], tT.p[2] - t0.p[2]);
    const dir = norm3([tT.p[0] - t0.p[0], tT.p[1] - t0.p[1], tT.p[2] - t0.p[2]]);
    for (const a of [0, Math.PI / 2]) {
      const side = norm3([Math.cos(a), 0, Math.sin(a)]);
      const face = norm3(cross3(side, dir));
      cards1.push({ p: [t0.p[0], -0.08, t0.p[2]], d: dir, size: len + 0.08, aspect: (sk.r0 * 2.3) / (len + 0.08), side, face, cell: opts.barkCell, flip: false, outer: 0.2, ao: 0.55, bark: true });
    }
  }
  const leaves1 = cardsGeo(cards1, env, cellUV, (c) => (c.bark ? [1, 1, 1] : colFn(c)), sunOf, cluK);
  // ---- bark: trunk, scaffolds, secondaries (LOD0 only; far trees draw the proxy above)
  const tint = (F.barkTint || [1, 1, 1]).map((v) => v * (T35?.barkK ?? 1));
  const aoBark = (p) => 0.34 + 0.66 * Math.pow(aoOf(p[0], p[1], p[2]), 0.7);
  // TR34: the secondaries down to 9 mm at the root (was 22 mm: the thinner limbs were culled, and a sophora or a honeylocust
  // at s120 showed a trunk, one or two limbs and leaf cards floating on nothing) and the twigs (C.twigs) as 3-sided tubes. A form opts out of the twigs with `twigTubes: false`; `minR2` still overrides the threshold.
  const twigB = F.twigTubes === false ? [] : (C.twigs || []);
  // TR34 (QA Q12, 2026-10-01: "close up the trunks and limbs read as flat straight planks", c120 / q2130Sw / q2050Ne /
  // q1970Se): the default tube was 8-sided trunk and 5-sided limbs resampled every 1.1-1.2 m, i.e. straight prisms between
  // rings that skip the skeleton's own bends (it is grown in ~0.4 m steps with tropism and gnarl). Default now 10 / 7 sides
  // and a ring every 0.55 / 0.6 m; what a form sets itself (the plane's and the young sub-form's barkSegs, Central Park's
  // elms' both) is kept.
  const trunk0 = tubes(twigB.length ? sk.B.concat(twigB) : sk.B, F.barkSegs || [10, 7, 3], F.barkSecLen || [0.55, 0.6, 1.2], tint, aoBark, F.barkU ?? 0.9, (F.minR2 ?? 0.009) * (H / 12.6));
  // ---- normalise to the box: crown width W, tree height H (the base stays on the origin)
  {
    const bb = leaves0.boundingBox;
    const cw = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z, 0.01);
    const ht = Math.max(bb.max.y, trunk0.boundingBox.max.y, 0.01);
    const sx = W / cw, sy = H / ht;
    for (const g of [trunk0, leaves0, leaves1]) { g.scale(sx, sy, sx); g.computeBoundingSphere(); g.computeBoundingBox(); }
  }
  return {
    trunk0, leaves0, leaves1,
    stats: {
      branches: sk.B.length, scaf: sk.scaf.length, sec: sk.sec.length, cand: C.length,
      cards0: cards0.length, cards1: cards1.length,
      trunkTris: trunk0.index.count / 3, leafTris0: leaves0.index.count / 3, leafTris1: leaves1.index.count / 3,
      crownW: 2 * env.R0, H, yb: env.yb,
    },
  };
}

// ================================================================ TR36: the leaf and twig layer at a scanned-leaf scale
// (2026-10-02; docs/notes/ar34-trees.md). The trees25 crown hangs 600-1,900 leaf cards of 0.6-1.15 m on each tree: from the
// pavement that reads as a few big flat cut-outs. TR36 keeps the trees25 skeleton (the same envelope, scaffolds,
// secondaries and leafy shoots from the same random stream, so a tree keeps its place, size and habit) and replaces the
// leaves: every leafy shoot becomes a twig (a bark tube) carrying the species' leaf units along it, each a small card of a
// composed scan (tools/ar35/trees/build36.py: a honeylocust spur cluster of once-pinnate leaves 0.34 x 0.24 m, a sophora
// shoot of pinnate leaves), folded along its stem line into a shallow umbrella and drooping toward its tip. Per vertex:
// the crown-volume / clump normals and the baked sky and sun visibility of trees25 (so the TV25 / TC26 crown shading holds),
// plus `aWind` (x flutter weight 0 at the card's stem .. 1 at its tip, y the card's own phase) for the TR36 crown material.
// LOD1 (beyond the pool's swap distance) is a quarter of the shoots as larger cards of the same cells plus the crossed-quad
// trunk proxy in the atlas's bark swatch.
export const TREE36_VERSION = 16;   // 16: crown gaps (TR39: `gap`), the plane's smaller units, the zelkova's inner sprays; 2: the shadow caster's bark (trunkS); 3: units turned in their plane; 4: LOD1 900 cards; 5: trunk foot, collars, an open H; 6: TR37 bark wound outward, no stub scaffolds; 7: roundb habit, the fork trunk ends at its limbs; 8: in a short dome; 9: LOD2 (the far pool); 10: the London plane, H aoK 0.55; 11: zelkova / elm; 12: young budgets by crown box; 13: oak; 14: the bake in half floats; 15: H opened (n0 5400), bake format v3
// per form id: the atlas cells (tools/ar35/trees/build36.py), the leaf unit spacing along a twig (m), the card budget at
// LOD0 / LOD1, the fold and droop of a card (radians / fraction of its height), the card scale range
// shoots: the twig count the form grows to (trees25's shoots plus sister shoots); from: the shoot's leafless base (fraction)
// form: TREE_FORMS fields overridden for the TR36 build only (the trees25 fallback keeps the kit's); wk: crown width factor.
// gap (TR39): [strength, noise cell (m), threshold]: crown gaps, a value noise over the crown sampled at each unit's twig clump;
// the clumps under the threshold are left out of the LOD0 picks (strength 1: entirely), and n0 is capped at the units outside.
// v2: the leaf area was there (~250 m2 a mature H against trees25's ~145) but units every
// 5-7.5 cm along few shoots overlapped each other, so the crowns read thin; and the 125th Street honeylocusts (N2330fdb_sq,
// N219w_sq) are broad, rounded and low where the H vase is narrow at its base: twice the shoots, units 12-18 cm apart,
// a round habit 15 % wider with a lower crown base.
export const TR36_FORMS = {
  // (TR39: the budget gathered in clumps with open gaps between them, `gap`; the units 20 % smaller and closer along their twigs,
  // 6,600 of them (the leaf area 8 % under TR38's), a finer texture in denser clumps; the shell preference 0.8 -> 0.6 (units
  // along the whole twig, not its tip alone), the extinction aoK 0.55 -> 0.5 (the clumps hold their cards closer together); a twig
  // for every shoot that carries a unit (twigs 1500 -> 2400: units without one floated in the sky, g39c hero_near))
  H: { cells: [0, 1], step: [0.14, 0.21], from: 0.35, shoots: 3000, n0: 6600, n1: 700, n2: 110, fold: 0.42, droop: 0.12, scale: [0.7, 0.92], up: 0.55, twigR: [0.0055, 0.0018],
    twigs: 2400, aoK: 0.5, wk: 1.15, gap: [1, 2.4, 0.45], form: { profile: 'roundb', crownBase: 0.26, lump: 0.16, scafAngle: [28, 55], outBias2: 0.5, scafRadLen: 0.05, scafEase: true, shell: 0.6 } },
  // TR37 (session 2): the London plane (P, P2, the young P9; 14 % of the city's street trees): shoots of three palmate leaves and
  // a terminal one (ambientCG LeafSet010 maple scans standing in for the plane's 3-5 lobed leaf; atlas cells 4, 5, 0.62 m a
  // card), on the trees25 plane skeleton (broad habit); scanned Platanus bark (japanese_sycamore)
  // (TR39: the crown read coarse (sbs37 plane_*): units 15 % smaller and closer along their twigs, 5,800 of them in clumps)
  P: { cells: [4, 5], step: [0.2, 0.3], from: 0.3, shoots: 2200, n0: 5800, n1: 600, n2: 110, fold: 0.22, droop: 0.16, scale: [0.72, 0.95], up: 0.4,
    twigR: [0.007, 0.0025], twigs: 2200, aoK: 0.6, gap: [1, 2.6, 0.43], form: { scafRadLen: 0.05, scafEase: true } },
  // TR37: zelkova and elm (Z, the young Z9; the census's zelkova, elms and a third of its "other" class): distichous sprays of
  // ovate serrate leaves (ambientCG LeafSet014; cells 6, 7, 0.42 m a card) on the trees25 vase; scanned zelkova bark
  // (tr37f, zel_sun / zel_near: the crown read thin from below; 8,000 sprays a little larger)
  // (TR39: thin from below, every spray on the outer shell (sbs37 zel_near): sprays from 0.1 of each shoot, the inner crown
  // picked as often as the shell (shell 0.35), 10,000 of them, gathered in clumps)
  Z: { cells: [6, 7], step: [0.14, 0.2], from: 0.1, shoots: 3600, n0: 10000, n1: 700, n2: 120, fold: 0.3, droop: 0.18, scale: [0.95, 1.25], up: 0.35,
    twigR: [0.005, 0.0018], twigs: 4000, aoK: 0.6, gap: [1, 2.6, 0.42], form: { scafRadLen: 0.05, scafEase: true, shell: 0.35 } },
  // TR37: oak (Q, the young Q9; the census's pin oaks, swamp white and red oaks): shoots ending in a whorl of lobed leaves
  // (ambientCG LeafSet016, rounded lobes: the swamp white oak's leaf; cells 8, 9, 0.46 m a card) on the trees25 pyramidal leader
  // form; scanned oak bark (jolcham_oak_bark_01)
  Q: { cells: [8, 9], step: [0.16, 0.24], from: 0.3, shoots: 2400, n0: 6000, n1: 650, n2: 120, fold: 0.25, droop: 0.12, scale: [0.85, 1.12], up: 0.3,
    twigR: [0.006, 0.002], twigs: 1800, aoK: 0.6, form: { scafRadLen: 0.05, scafEase: true } },
  S: { cells: [2, 3], step: [0.13, 0.19], from: 0.2, shoots: 3600, n0: 9500, n1: 950, n2: 140, fold: 0.38, droop: 0.2, scale: [0.88, 1.15], up: 0.35, twigR: [0.006, 0.002], twigs: 2000, aoK: 0.6,
    form: { profile: 'roundb', scafRadLen: 0.05, scafEase: true } },
};

// `opts36`: { content: { cell: [x, y, w, h] image px (y down) }, size: atlas px, cardM: { cell: metres per cell width },
// cellPx: px per cell, swatch: [x, y, w, h] }
export function buildTree36(F, H, W, seed, opts36) {
  const S36 = TR36_FORMS[opts36.form];
  if (!S36) throw new Error('no TR36 spec for form ' + opts36.form);
  if (S36.form) F = { ...F, ...S36.form, ...(F.leader >= 0.6 ? { leader: F.leader } : {}) };
  if (S36.wk) W *= S36.wk;
  const rnd = mulberry32(seed * 7919 + 13);
  const env = makeEnvelope(F, H, W * (F.envK ?? 0.86), rnd);
  const sk = growSkeleton(F, env, rnd);
  const C = shootCandidates(F, env, sk, rnd);
  const T35 = TR35_FORM[F.seed] || null, cluK = T35?.cluK ?? 1;
  // the same shoot set trees25 hangs its cards on (sister shoots to the old budget), each now a twig
  const n0old = Math.round(F.cards0 ?? 800);
  const grow0 = C.length && C.length < n0old ? Math.min(1.5, Math.sqrt(n0old / C.length)) : 1;
  const nFill = grow0 > 1 ? Math.min(n0old, Math.round(C.length * grow0 * grow0)) : C.length;
  let shoots = nFill > C.length ? C.concat(sisterShoots(F, env, C, nFill - C.length, rnd)) : C.slice();
  // (more twigs than trees25 hung cards on: a real crown is many short leafy twigs, densest in its outer shell)
  const nSh = Math.round((S36.shoots ?? shoots.length) * (H * W) / (10.6 * 9.2));
  if (shoots.length < nSh) shoots = shoots.concat(sisterShoots(F, env, C, nSh - shoots.length, rnd));
  const A = opts36.size;
  const uvOf = (cell) => { const [x, y, w, h] = opts36.content[cell]; return [x / A, 1 - (y + h) / A, (x + w) / A, 1 - y / A]; };
  const dimOf = (cell) => { const [, , w, h] = opts36.content[cell]; const m = opts36.cardM[cell] / opts36.cellPx; return [w * m, h * m]; };
  const covOf = (cell) => opts36.coverage?.[cell] ?? 0.3;
  // ---- leaf units along every shoot twig
  const units = [];
  const twigs36 = [];
  const up = [0, 1, 0];
  for (let si = 0; si < shoots.length; si++) {
    const sh = shoots[si];
    const len = sh.size;
    const d = sh.d;
    const end = [sh.p[0] + d[0] * len, sh.p[1] + d[1] * len, sh.p[2] + d[2] * len];
    twigs36.push({ lvl: 3, pts: [sh.p.slice(), end], rs: [S36.twigR[0] * (0.8 + 0.4 * rnd()), S36.twigR[1]], si });
    let s = (S36.from ?? 0.15) + rnd() * 0.08;
    let psi = rnd() * TAU;
    while (s <= 1.0) {
      const p = [sh.p[0] + d[0] * len * s, sh.p[1] + d[1] * len * s, sh.p[2] + d[2] * len * s];
      if (p[1] >= env.yb + 0.03 * env.cH && env.frac(p[0], p[1], p[2]) <= 1.12) {
        psi += GOLD + (rnd() - 0.5) * 0.6;
        // the unit's stem: off the twig, outward and up (honeylocust spur clusters lie near horizontal and face the sky)
        const [cx, cz] = env.centre(p[1]);
        const ox = p[0] - cx, oz = p[2] - cz, ol = Math.hypot(ox, oz) || 1;
        let u = rotAway(d, psi, ((35 + 35 * rnd()) * Math.PI) / 180);
        u = norm3([u[0] + (ox / ol) * 0.45 + d[0] * 0.3, u[1] + S36.up * 0.4, u[2] + (oz / ol) * 0.45 + d[2] * 0.3]);
        const cell = S36.cells[(rnd() * S36.cells.length) | 0];
        const k = lerp(S36.scale[0], S36.scale[1], rnd());
        const [w0, h0] = dimOf(cell);
        units.push({ p, d: u, w: w0 * k, h: h0 * k, size: Math.sqrt(w0 * h0) * k, cell, outer: clamp(env.frac(p[0], p[1], p[2]), 0, 1.1),
          clump: sh.clump, opacity: covOf(cell), phase: rnd(), flip: rnd() < 0.5, si });
      }
      s += lerp(S36.step[0], S36.step[1], rnd()) / Math.max(0.3, len);
    }
    // the shoot's tip unit, along the twig
    const p = end;
    if (p[1] >= env.yb + 0.03 * env.cH && env.frac(p[0], p[1], p[2]) <= 1.15) {
      const cell = S36.cells[(rnd() * S36.cells.length) | 0];
      const k = lerp(S36.scale[0], S36.scale[1], rnd());
      const [w0, h0] = dimOf(cell);
      units.push({ p, d: norm3([d[0], d[1] + 0.25, d[2]]), w: w0 * k, h: h0 * k, size: Math.sqrt(w0 * h0) * k, cell, outer: clamp(env.frac(p[0], p[1], p[2]), 0, 1.1), clump: sh.clump, opacity: covOf(cell), phase: rnd(), si });
    }
  }
  // ---- TR39 (session 4): crown gaps.
  // (crown38.py: 33-35 % sky in the s313 / s317 crown boxes against the twin's 19-20 %), where the TR36 budget spread evenly
  // through the shell. `gap`: [strength, noise cell (m), threshold]: a two-octave value noise over the crown weights the LOD0
  // picks (pickCards), so the budget gathers in clumps and the low part of the field goes open; the twigs of the shoots left
  // bare are not drawn (below), so the limbs show through the gaps. Positions only: the random stream is unchanged.
  if (S36.gap) {
    const [gk, gs, gt] = S36.gap;
    const o = (seed % 997) * 0.7311;
    // (sampled at the unit's twig clump, else its shoot's base: a clump is kept or left out whole, so no lone unit hangs on a
    // bare twig in a gap: g39a hero_near)
    for (const u of units) {
      const q = u.clump || shoots[u.si].p;
      const x = q[0] / gs + o, y = q[1] / gs, z = q[2] / gs - o;
      const nz = 0.68 * vnoise3(x, y, z) + 0.32 * vnoise3(x * 2.3 + 17.1, y * 2.3, z * 2.3 + 5.3);
      u.gw = 1 - gk * (1 - smooth(gt - 0.05, gt + 0.05, nz));
    }
  }
  // the LOD0 budget: the outer shell first (pickCards weights by `outer`); (TR37) scaled by the crown box against a mature
  // tree's, so a young sub-form (H9, P9, Z9: 47-62 m2 against 97.5) does not carry a mature crown's cards (Z9 drew 6,000)
  let n0 = Math.round(S36.n0 * Math.min(1, (H * W) / (10.6 * 9.2)));
  // (TR39: never more than the units outside the gaps hold, or the rest are drawn from the gaps as lone units on bare twigs:
  // g39b, where the budget overflowed the clumps of H, H2, H9, P and P9)
  if (S36.gap) n0 = Math.min(n0, Math.round(0.92 * units.filter((u) => u.gw >= 0.5).length));
  let cards0 = units.length > n0 ? pickCards(units, n0, F.shell ?? 0.6, rnd) : units;
  // (TR39: a shoot left with a single unit drew a bare twig with one frond at its tip, a whisker out of the crown's edge (g39d
  // hero_near); with gaps, such units go: 3.6 % of H's cards, 4.9 % of H2's)
  if (S36.gap) {
    const per = new Map();
    for (const c of cards0) per.set(c.si, (per.get(c.si) || 0) + 1);
    cards0 = cards0.filter((c) => per.get(c.si) >= 2);
  }
  for (const c of cards0) {
    orientCard(c, env, rnd, ((F.roll ?? 60) * 0.8 * Math.PI) / 180);
    // (v6) a turn of the unit in its own plane about its stem point, +-0.45 rad: the fans of a spur cluster stop lining up
    // with their twig (at 6 m the units read as rows of identical fans: tr36c_wind)
    const t = (rnd() - 0.5) * 0.9, ct = Math.cos(t), st = Math.sin(t), d0 = c.d, s0 = c.side;
    c.d = norm3([d0[0] * ct + s0[0] * st, d0[1] * ct + s0[1] * st, d0[2] * ct + s0[2] * st]);
    c.side = norm3(cross3(c.face, c.d));
  }
  // ---- crown AO / sun visibility from the LOD0 leaf density
  const D = makeDensity(cards0, env);
  const ext = (T35?.aoExt ?? F.aoExt ?? 0.55) * (S36.aoK ?? 1);
  const aoOf = (x, y, z) => skyVis(D, x, y, z, ext);
  for (const c of cards0) {
    const m = [c.p[0] + c.d[0] * c.h * 0.5, c.p[1] + c.d[1] * c.h * 0.5, c.p[2] + c.d[2] * c.h * 0.5];
    c.ao = 0.16 + 0.84 * Math.pow(aoOf(m[0], m[1], m[2]), 0.8);
  }
  const colFn = (c) => {
    const o = smooth(0.35, 1.0, c.outer) * 0.7 + (c.ao ?? 1) * 0.3;
    const j = 0.92 + rnd() * 0.14, hj = (rnd() - 0.5) * 0.05;
    return [(0.94 + 0.08 * o + hj) * j, (0.97 + 0.05 * o) * j, (1.0 - 0.08 * o - hj * 0.5) * j];
  };
  const sunOf = (x, y, z) => sunFit(D, x, y, z, ext);
  const leaves0 = cards36Geo(cards0, env, uvOf, colFn, sunOf, cluK, S36);
  // ---- LOD1: a share of the shoots as larger cards (coverage held: the LOD0 card area over n1), plus the trunk proxy
  const area0 = cards0.reduce((a, c) => a + c.w * c.h * c.opacity, 0);
  const n1 = Math.min(S36.n1, cards0.length);
  let cards1 = pickCards(cards0, n1, Math.min(0.95, (F.shell ?? 0.6) + 0.3), rnd).map((c) => ({ ...c, p: c.p.slice() }));
  const area1 = cards1.reduce((a, c) => a + c.w * c.h * c.opacity, 0);
  // (v6: 340 cards at a 3.2 cap held only ~40 % of the LOD0 card area: the far crowns and the shadow casters, which are
  // these cards, went thin, and the golden Mall frame took sun flecks through a TR36 crown's shadow: cp_tr36)
  const k1 = Math.min(3.6, Math.sqrt(area0 / Math.max(1e-3, area1)));
  for (const c of cards1) {
    c.w *= k1; c.h *= k1; c.size *= k1;
    const [cx, cz] = env.centre(c.p[1]);
    const pull = c.h * 0.3;
    const ox = c.p[0] - cx, oz = c.p[2] - cz, ol = Math.hypot(ox, oz) || 1;
    c.p[0] -= (ox / ol) * pull; c.p[2] -= (oz / ol) * pull; c.p[1] -= c.d[1] * pull * 0.5;
    c.fold = 0.15; c.droop = 0.05;
  }
  {
    const trunkTopY = Math.min(sk.topY, env.yb + 0.25 * env.cH);
    const t0 = sampleAt(sk.trunk, 0), tT = sampleAt(sk.trunk, clamp((trunkTopY + 0.1) / (sk.topY + 0.1), 0, 1));
    const len = Math.hypot(tT.p[0] - t0.p[0], tT.p[1] - t0.p[1], tT.p[2] - t0.p[2]);
    const dir = norm3([tT.p[0] - t0.p[0], tT.p[1] - t0.p[1], tT.p[2] - t0.p[2]]);
    for (const a of [0, Math.PI / 2]) {
      const side = norm3([Math.cos(a), 0, Math.sin(a)]);
      const face = norm3(cross3(side, dir));
      cards1.push({ p: [t0.p[0], -0.08, t0.p[2]], d: dir, h: len + 0.08, w: sk.r0 * 2.3, size: len, side, face, cell: 'swatch', outer: 0.2, ao: 0.55, bark: true, fold: 0, droop: 0, phase: 0 });
    }
  }
  const sw = opts36.swatch;
  const uvOf1 = (cell) => (cell === 'swatch' ? [sw[0] / A, 1 - (sw[1] + sw[3]) / A, (sw[0] + sw[2]) / A, 1 - sw[1] / A] : uvOf(cell));
  const leaves1 = cards36Geo(cards1, env, uvOf1, (c) => (c.bark ? [1, 1, 1] : colFn(c)), sunOf, cluK, S36);
  // ---- LOD2 (TR37): the far crown trees.js draws past ~150 m in a pool of its own (a dithered cross-fade from LOD1): ~110-140
  // cards of the outer shell at the LOD0 card area (capped at 7x a unit), pulled in, + the same trunk proxy. Built after LOD0 / LOD1
  // so their random draws (and so their cards and colours) are unchanged. (At qc_lenox 2,600 trees past 90 m drew 3.2 M of the
  // trees' 4 M triangles, TR36's LOD1 2.8-3.8k each: tr37c.)
  const n2 = Math.min(S36.n2 ?? 120, cards0.length);
  const cards2 = pickCards(cards0, n2, Math.min(0.97, (F.shell ?? 0.6) + 0.35), rnd).map((c) => ({ ...c, p: c.p.slice() }));
  const area2 = cards2.reduce((a, c) => a + c.w * c.h * c.opacity, 0);
  const k2 = Math.min(7, Math.sqrt(area0 / Math.max(1e-3, area2)));
  for (const c of cards2) {
    c.w *= k2; c.h *= k2; c.size *= k2;
    const [cx, cz] = env.centre(c.p[1]);
    const pull = c.h * 0.35;
    const ox = c.p[0] - cx, oz = c.p[2] - cz, ol = Math.hypot(ox, oz) || 1;
    c.p[0] -= (ox / ol) * pull; c.p[2] -= (oz / ol) * pull; c.p[1] -= c.d[1] * pull * 0.5;
    c.fold = 0.1; c.droop = 0.03;
  }
  const leaves2 = cards36Geo(cards2.concat(cards1.filter((c) => c.bark)), env, uvOf1, (c) => (c.bark ? [1, 1, 1] : colFn(c)), sunOf, cluK, S36);
  // ---- bark: trunk, scaffolds, secondaries, the clump twigs of trees25 and the TR36 shoot twigs
  const tint = (F.barkTint || [1, 1, 1]).map((v) => v * (T35?.barkK ?? 1));
  const aoBark = (p) => 0.34 + 0.66 * Math.pow(aoOf(p[0], p[1], p[2]), 0.7);
  // (a shoot's twig only when one of its units is drawn: the budget leaves many shoots bare, and bare twigs were half of the
  // sophora's bark triangles)
  const nOn = new Map();
  for (const c of cards0) nOn.set(c.si, (nOn.get(c.si) || 0) + 1);
  const tw = twigs36.filter((t) => t.pts[0][1] >= env.yb && nOn.has(t.si)).sort((a, b) => nOn.get(b.si) - nOn.get(a.si)).slice(0, S36.twigs ?? 2000);
  const twigB = (C.twigs || []).concat(tw);
  // (v7, the lead's 05:59 review: "trunks and forks are plain cylinders": a 16-sided trunk with buttress roots and an extra flare
  // at the foot, collars where limbs and secondaries leave their parent)
  // (TR37: a fork form's trunk ends 0.35 m over the highest scaffold's root, where the limbs take over, in a short dome; it ran
  // on to topY, 0.5-1 m of trunk over the fork that ended in a spike once the open top was closed: tr37a, treeH2)
  let B36 = sk.B;
  if (!sk.excurrent) {
    const ys = sk.scaf.filter((b) => !b.stub).map((b) => b.pts[0][1]);
    const yc = ys.length ? Math.min(sk.topY, Math.max(...ys) + 0.35) : sk.topY;
    const tp = sk.trunk.pts, trs = sk.trunk.rs, keep = [], kr = [];
    for (let i = 0; i < tp.length; i++) {
      if (tp[i][1] < yc) { keep.push(tp[i]); kr.push(trs[i]); continue; }
      const a = tp[i - 1], u = i > 0 ? (yc - a[1]) / Math.max(1e-6, tp[i][1] - a[1]) : 0;
      if (i > 0) { keep.push([lerp(a[0], tp[i][0], u), yc, lerp(a[2], tp[i][2], u)]); kr.push(lerp(trs[i - 1], trs[i], u)); }
      break;
    }
    if (keep.length >= 3) { const cut = { lvl: 0, pts: keep, rs: kr }; B36 = sk.B.map((b) => (b === sk.trunk ? cut : b)); }
  }
  const trunk0 = tubes(B36.concat(twigB), [16, 9, 6, 3], [0.45, 0.5, 1.2], tint, aoBark, F.barkU ?? 0.9, 0.006 * (H / 12.6), { flare: 0.28, buttress: 0.3, collar: 1.3 });
  // the shadow caster's bark: trunk, scaffolds and the secondaries over 2 cm (twigs are below a shadow-map texel)
  const trunkS = tubes(B36.filter((b) => b.lvl < 2 || b.rs[0] >= 0.02), [8, 6, 4, 3], [0.9, 1.0, 1.2], tint, () => 1, F.barkU ?? 0.9, 0.02);
  // ---- normalise to the box (as buildTree)
  {
    const bb = leaves0.boundingBox;
    const cw = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z, 0.01);
    const ht = Math.max(bb.max.y, trunk0.boundingBox.max.y, 0.01);
    const sx = W / cw, sy = H / ht;
    for (const g of [trunk0, trunkS, leaves0, leaves1, leaves2]) { g.scale(sx, sy, sx); g.computeBoundingSphere(); g.computeBoundingBox(); }
  }
  return {
    trunk0, trunkS, leaves0, leaves1, leaves2,
    stats: {
      branches: sk.B.length, scaf: sk.scaf.length, sec: sk.sec.length, shoots: shoots.length, units: units.length, trunkSTris: trunkS.index.count / 3,
      unitsOpen: units.filter((u) => (u.gw ?? 1) >= 0.5).length, twigsOn: nOn.size, twigsDrawn: tw.length,
      hist: [...nOn.values()].reduce((h, n) => { h[Math.min(n, 5)] = (h[Math.min(n, 5)] || 0) + 1; return h; }, {}),
      cards0: cards0.length, cards1: cards1.length,
      trunkTris: trunk0.index.count / 3, leafTris0: leaves0.index.count / 3, leafTris1: leaves1.index.count / 3, leafTris2: leaves2.index.count / 3,
      crownW: 2 * env.R0, H, yb: env.yb,
    },
  };
}

// TR36 cards: 6 vertices, 4 triangles each: a centre line (the unit's stem line, u = 0.5) and two side edges folded down by
// `fold` (an umbrella: the leaves of a spur cluster arch away from the spur), the far row lowered by `droop` x height.
function cards36Geo(cards, env, uvOf, colFn, sunFn, cluK, S36) {
  const n = cards.length, NV = 6;
  const P = new Float32Array(n * NV * 3), N = new Float32Array(n * NV * 3), UV = new Float32Array(n * NV * 2);
  const Cc = new Float32Array(n * NV * 3), FA = new Float32Array(n * NV * 3), AO = new Float32Array(n * NV);
  const SV = new Float32Array(n * NV * 4), CLU = new Float32Array(n * NV * 3), WD = new Float32Array(n * NV * 2);
  const I = new (n * NV > 65535 ? Uint32Array : Uint16Array)(n * 12);
  const cy = env.yb + env.cH * 0.55, ry = Math.max(0.5, env.cH * 0.55), rx = Math.max(0.5, env.R0);
  const GU = [0, 0.5, 1, 0, 0.5, 1], GV = [0, 0, 0, 1, 1, 1];
  for (let k = 0; k < n; k++) {
    const c = cards[k];
    const u = c.d, s = c.side, f = c.face;
    const w = c.w, h = c.h;
    const fold = c.fold ?? S36.fold, droop = c.droop ?? S36.droop;
    const [ua, v0, ub, v1] = uvOf(c.cell);
    const u0 = c.flip ? ub : ua, u1 = c.flip ? ua : ub;   // (a mirrored unit: two cells read as four)
    const col = colFn(c);
    const cl = c.clump || [c.p[0] + u[0] * h * 0.5, c.p[1] + u[1] * h * 0.5 + h * 0.25, c.p[2] + u[2] * h * 0.5];
    const tk = 0.75 + 0.25 * toneHash(cl[0], cl[1], cl[2]);
    for (let j = 0; j < NV; j++) {
      const gu = GU[j], gv = GV[j];
      const a = (gu - 0.5) * w;
      // the fold: the side edges drop below the stem line (along -face), by sin(fold) x half width
      const drop = Math.abs(gu - 0.5) * 2 * Math.sin(fold) * w * 0.5;
      const q = [
        c.p[0] + s[0] * a + u[0] * h * gv - f[0] * drop,
        c.p[1] + s[1] * a + u[1] * h * gv - f[1] * drop - droop * h * gv * gv,
        c.p[2] + s[2] * a + u[2] * h * gv - f[2] * drop,
      ];
      const o = (k * NV + j) * 3;
      P[o] = q[0]; P[o + 1] = q[1]; P[o + 2] = q[2];
      // crown-volume normal + clump normal (cardsGeo's recipe)
      const [ccx, ccz] = env.centre(q[1]);
      let nx = (q[0] - ccx) / (rx * rx), ny = (q[1] - cy) / (ry * ry), nz = (q[2] - ccz) / (rx * rx);
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny = ny / l + 0.32; nz /= l;
      let kx = q[0] - cl[0], ky = q[1] - cl[1], kz = q[2] - cl[2];
      const kl = Math.hypot(kx, ky, kz) || 1;
      const wk = (c.clump ? 0.5 : 0.3) * cluK;
      const vl = Math.hypot(nx, ny, nz) || 1, vx = nx / vl, vy = ny / vl, vz = nz / vl;
      nx = nx * (1 - wk) + (kx / kl) * wk; ny = ny * (1 - wk) + (ky / kl) * wk; nz = nz * (1 - wk) + (kz / kl) * wk;
      if (!c.bark) {
        let ux = kx / kl, uy = ky / kl, uz = kz / kl;
        if (cluK < 1) { ux = vx + (ux - vx) * cluK; uy = vy + (uy - vy) * cluK; uz = vz + (uz - vz) * cluK; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul; }
        CLU[o] = ux * tk; CLU[o + 1] = uy * tk; CLU[o + 2] = uz * tk;
      }
      if (sunFn) SV.set(sunFn(q[0], q[1], q[2]), (k * NV + j) * 4); else SV[(k * NV + j) * 4 + 3] = 1;
      const sgn = f[0] * nx + f[1] * ny + f[2] * nz < 0 ? -0.22 : 0.22;
      nx += f[0] * sgn; ny += f[1] * sgn; nz += f[2] * sgn;
      const l2 = Math.hypot(nx, ny, nz) || 1;
      N[o] = nx / l2; N[o + 1] = ny / l2; N[o + 2] = nz / l2;
      FA[o] = f[0]; FA[o + 1] = f[1]; FA[o + 2] = f[2];
      Cc[o] = col[0]; Cc[o + 1] = col[1]; Cc[o + 2] = col[2];
      UV[(k * NV + j) * 2] = u0 + (u1 - u0) * gu; UV[(k * NV + j) * 2 + 1] = v0 + (v1 - v0) * gv;
      AO[k * NV + j] = c.ao ?? 1;
      WD[(k * NV + j) * 2] = c.bark ? 0 : gv * (0.6 + 0.4 * Math.abs(gu - 0.5) * 2);
      WD[(k * NV + j) * 2 + 1] = c.phase ?? 0;
    }
    const b = k * NV;
    I.set([b, b + 1, b + 4, b, b + 4, b + 3, b + 1, b + 2, b + 5, b + 1, b + 5, b + 4], k * 12);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
  g.setAttribute('aFace', new THREE.BufferAttribute(FA, 3));
  g.setAttribute('aAO', new THREE.BufferAttribute(AO, 1));
  g.setAttribute('aSun', new THREE.BufferAttribute(SV, 4));
  g.setAttribute('aClu', new THREE.BufferAttribute(CLU, 3));
  g.setAttribute('aWind', new THREE.BufferAttribute(WD, 2));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
