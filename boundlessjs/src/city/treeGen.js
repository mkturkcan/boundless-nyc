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
export const TREE_GEN_VERSION = 1;
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
      if (!env.inside(q[0], q[1], q[2], 1.0) && i > 1) {
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
    const rA = Math.max(0.02, at.r * (F.scafRad ?? 0.62) * (0.85 + 0.3 * rnd()));
    const b = grow(at.p, d, len, rA, Math.max(0.006, rA * 0.12), 1);
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
      const rA = Math.max(0.012, at.r * 0.58);
      const c = grow(at.p, cd, len, rA, Math.max(0.003, rA * 0.12), 2);
      if (c) sec.push(c);
    }
  }
  return { B, trunk, scaf, sec, r0, topY, excurrent };
}

// ---------------------------------------------------------------- leafy shoots (card candidates)
function shootCandidates(F, env, sk, rnd) {
  const C = [];
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
    const w = (1 - shell) + shell * smooth(0.3, 1.0, c.outer) + 1e-3;
    return [Math.pow(rnd(), 1 / w), c];
  });
  keyed.sort((a, b) => b[0] - a[0]);
  return keyed.slice(0, Math.min(n, keyed.length)).map((k) => k[1]);
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

// ---------------------------------------------------------------- geometry: bark tubes
function tubes(branches, segsByLvl, secLenByLvl, tint, aoFn, barkU, minR2) {
  const P = [], N = [], U = [], Cc = [], I = [];
  let vbase = 0;
  for (const b of branches) {
    const seg = segsByLvl[b.lvl] ?? 3;
    if (!seg) continue;
    // thin secondaries live inside the foliage: a 3-sided tube there is triangles nobody sees
    if (b.lvl >= 2 && b.rs[0] < minR2) continue;
    // resample along the branch
    const L = b.len ?? (b.len = polyLen(b.pts));
    const nSec = Math.max(1, Math.min(b.pts.length - 1, b.lvl >= 2 ? 2 : 99, Math.ceil(L / (secLenByLvl[b.lvl] ?? 1.2))));
    const rings = [];
    for (let i = 0; i <= nSec; i++) rings.push(sampleAt(b, i / nSec));
    // start inside the parent a little (hides the joint)
    if (b.lvl > 0) { const r0 = rings[0]; r0.p = [r0.p[0] - r0.d[0] * r0.r * 0.8, r0.p[1] - r0.d[1] * r0.r * 0.8, r0.p[2] - r0.d[2] * r0.r * 0.8]; }
    // parallel transport frames
    let nrm = null;
    const circ = TAU * Math.max(0.02, b.rs[0]);
    const uRep = Math.max(1, Math.round(circ / (barkU ?? 0.9)));
    let vAcc = 0;
    for (let i = 0; i <= nSec; i++) {
      const R = rings[i];
      const t = i < nSec ? norm3([rings[i + 1].p[0] - R.p[0], rings[i + 1].p[1] - R.p[1], rings[i + 1].p[2] - R.p[2]]) : R.d;
      if (!nrm) { const ref = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; nrm = norm3(cross3(t, ref)); }
      else { const d = nrm[0] * t[0] + nrm[1] * t[1] + nrm[2] * t[2]; nrm = norm3([nrm[0] - t[0] * d, nrm[1] - t[1] * d, nrm[2] - t[2] * d]); }
      const bin = cross3(t, nrm);
      if (i > 0) vAcc += Math.hypot(R.p[0] - rings[i - 1].p[0], R.p[1] - rings[i - 1].p[1], R.p[2] - rings[i - 1].p[2]);
      const ao = aoFn(R.p);
      // limbs end in a POINT (the lab showed sawn-off stubs where a branch stopped at the envelope)
      const r = i === nSec && b.lvl > 0 ? 0.0015 : Math.max(0.004, R.r);
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        const nx = nrm[0] * ca + bin[0] * sa, ny = nrm[1] * ca + bin[1] * sa, nz = nrm[2] * ca + bin[2] * sa;
        P.push(R.p[0] + nx * r, R.p[1] + ny * r, R.p[2] + nz * r);
        N.push(nx, ny, nz);
        U.push((j / seg) * uRep, vAcc / (circ / uRep));
        Cc.push(tint[0] * ao, tint[1] * ao, tint[2] * ao);
      }
    }
    const rowN = seg + 1;
    for (let i = 0; i < nSec; i++) for (let j = 0; j < seg; j++) {
      const a = vbase + i * rowN + j, b2 = a + 1, c = a + rowN, d = c + 1;
      I.push(a, c, b2, b2, c, d);
    }
    vbase += (nSec + 1) * rowN;
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
function cardsGeo(cards, env, cellUV, colFn) {
  const n = cards.length;
  const P = new Float32Array(n * 12), N = new Float32Array(n * 12), UV = new Float32Array(n * 8);
  const C = new Float32Array(n * 12), FA = new Float32Array(n * 12), AO = new Float32Array(n * 4);
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
        const wk = c.clump ? 0.5 : 0.3;
        nx = nx * (1 - wk) + (kx / kl) * wk; ny = ny * (1 - wk) + (ky / kl) * wk; nz = nz * (1 - wk) + (kz / kl) * wk;
      }
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
  // LOD0 cards
  const n0 = Math.round(F.cards0 ?? 800);
  let cards0 = pickCards(C, n0, F.shell ?? 0.6, rnd);
  // too few candidates for the budget: enlarge what there is to hold the coverage
  const grow0 = C.length && C.length < n0 ? Math.min(1.5, Math.sqrt(n0 / C.length)) : 1;
  cards0 = cards0.map((c) => ({ ...c, size: c.size * grow0, cell: cells[(rnd() * cells.length) | 0], flip: rnd() < 0.5, opacity: F.opacity ?? 0.45, aspect: F.aspect ?? 1 }));
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
  const ext = F.aoExt ?? 0.55;
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
  const leaves0 = cardsGeo(cards0, env, cellUV, colFn);
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
  const leaves1 = cardsGeo(cards1, env, cellUV, (c) => (c.bark ? [1, 1, 1] : colFn(c)));
  // ---- bark: trunk, scaffolds, secondaries (LOD0 only; far trees draw the proxy above)
  const tint = F.barkTint || [1, 1, 1];
  const aoBark = (p) => 0.34 + 0.66 * Math.pow(aoOf(p[0], p[1], p[2]), 0.7);
  const trunk0 = tubes(sk.B, F.barkSegs || [8, 5, 3], F.barkSecLen || [1.1, 1.2, 1.6], tint, aoBark, F.barkU ?? 0.9, (F.minR2 ?? 0.022) * (H / 12.6));
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
