// AR33 sk: wear on the compiled markings. The crosswalk bars and stop lines (tile.S.paintW, drawn by the ground shader 24 mm
// over the asphalt) are pristine white; on 125th Street they are worn through to the asphalt in the wheel paths, cracked and
// chipped at the ends. Each bar gets a few
// irregular blotches of asphalt over it, clipped to the bar, most of them on the bars a wheel path crosses. Placed by rule
// (hashes), not traced from a photograph. Pure (no three): docs/notes/ar33-street.md.
import { hash2, clipHalf } from './skGeom.js';

// the paint section's triangles grouped into pieces (shared corners), each with its oriented box
export function paintPieces(tile, ox, oz, sec = 'paintW', inZone = null) {
  const a = tile.S[sec]; if (!a || a.length < 9) return [];
  const tris = [];
  for (let o = 0; o + 8 < a.length; o += 9) {
    const P = [0, 1, 2].map((i) => [a[o + i * 3] + ox, a[o + i * 3 + 2] + oz, a[o + i * 3 + 1]]);
    if (inZone && !inZone((P[0][0] + P[1][0] + P[2][0]) / 3, (P[0][1] + P[1][1] + P[2][1]) / 3)) continue;
    tris.push(P);
  }
  const par = tris.map((_, i) => i), f = (i) => (par[i] === i ? i : (par[i] = f(par[i])));
  const vmap = new Map();
  tris.forEach((T, i) => T.forEach((p) => { const k = p[0].toFixed(2) + ',' + p[1].toFixed(2); if (vmap.has(k)) par[f(i)] = f(vmap.get(k)); else vmap.set(k, i); }));
  const groups = new Map();
  tris.forEach((T, i) => { const r = f(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(T); });
  const out = [];
  for (const g of groups.values()) {
    if (g.length > 8) continue;    // legends and arrows are many-triangle pieces: bars and lines are 1-4 triangles
    const pts = [];
    for (const T of g) for (const p of T) if (!pts.some((q) => Math.abs(q[0] - p[0]) < 0.01 && Math.abs(q[1] - p[1]) < 0.01)) pts.push(p);
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, mz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    let sxx = 0, szz = 0, sxz = 0;
    for (const p of pts) { sxx += (p[0] - mx) ** 2; szz += (p[1] - mz) ** 2; sxz += (p[0] - mx) * (p[1] - mz); }
    const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz), ux = Math.cos(ang), uz = Math.sin(ang);
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9, y = 0;
    for (const p of pts) { const A = (p[0] - mx) * ux + (p[1] - mz) * uz, B = -(p[0] - mx) * uz + (p[1] - mz) * ux; a0 = Math.min(a0, A); a1 = Math.max(a1, A); b0 = Math.min(b0, B); b1 = Math.max(b1, B); y += p[2]; }
    const cx = mx + ux * (a0 + a1) / 2 - uz * (b0 + b1) / 2, cz = mz + uz * (a0 + a1) / 2 + ux * (b0 + b1) / 2;
    out.push({ x: cx, z: cz, ux, uz, L: a1 - a0, W: b1 - b0, y: y / pts.length });
  }
  return out;
}

// bars: pieces 0.3-0.75 m wide and 2-10 m long
export function buildWear(pieces, getBuf, seed = 11) {
  let n = 0;
  for (const p of pieces) {
    if (p.W < 0.3 || p.W > 0.75 || p.L < 2 || p.L > 10) continue;
    const hb = hash2(Math.round(p.x * 7) + seed, Math.round(p.z * 7));
    // how worn: most bars a little, about one in three (a wheel path) a lot
    const worn = hb < 0.33 ? 0.6 + 0.4 * hash2(Math.round(p.x * 3), Math.round(p.z * 3) + 1) : 0.12 + 0.3 * hb;
    const k = Math.max(1, Math.round(p.L * (0.45 + 1.4 * worn)));
    const vx = -p.uz, vz = p.ux, hu = p.L / 2 - 0.01, hv = p.W / 2 - 0.01;
    const buf = getBuf(p.x, p.z);
    for (let q = 0; q < k; q++) {
      const h = (m) => hash2(Math.round(p.x * 13) + q * 977 + m * 31, Math.round(p.z * 13) + seed + m * 7);
      // along the bar: spread over its length, denser toward the middle of a worn bar (the lanes), and at the chipped ends
      const t = h(1) < 0.18 ? (h(2) < 0.5 ? -1 : 1) * (0.8 + 0.2 * h(3)) : (h(4) + h(5) - 1) * (worn > 0.5 ? 0.9 : 1.0);
      const ca = t * hu, cb = (h(6) - 0.5) * p.W * 0.8;
      // mostly flakes a few cm across, now and then a worn-through patch (b2_fdb, b3_mid: the bars lose paint in flakes)
      const ra = (0.03 + 0.22 * h(7) * h(7) * h(7)) * (0.5 + worn), rb = Math.min(p.W * 0.4, (0.025 + 0.1 * h(8) * h(8)) * (0.6 + worn));
      const NV = 9, poly = [];
      for (let i = 0; i < NV; i++) {
        const an = (i / NV) * Math.PI * 2, rr = 0.86 + 0.28 * h(10 + i);   // near-convex (the clip and the fan want it)
        const a = ca + Math.cos(an) * ra * rr, b = cb + Math.sin(an) * rb * rr;
        poly.push([p.x + p.ux * a + vx * b, p.z + p.uz * a + vz * b]);
      }
      // keep it on the bar
      const fa = (P) => (P[0] - p.x) * p.ux + (P[1] - p.z) * p.uz, fb = (P) => (P[0] - p.x) * vx + (P[1] - p.z) * vz;
      let c = clipHalf(poly, (P) => -hu - fa(P)); c = clipHalf(c, (P) => fa(P) - hu); c = clipHalf(c, (P) => -hv - fb(P)); c = clipHalf(c, (P) => fb(P) - hv);
      if (c.length < 3) continue;
      let A = 0; for (let i = 0; i < c.length; i++) { const P = c[i], Q = c[(i + 1) % c.length]; A += P[0] * Q[1] - Q[0] * P[1]; }
      if (Math.abs(A) < 2e-4) continue;
      const up = A < 0 ? c : c.slice().reverse();
      // the asphalt that shows through: a touch lighter than the open road (paint dust, polished by tyres); one tone per bar,
      // so two blotches that overlap (same height, same world UVs) draw the same texel and cannot flicker
      // (the library's asphalt drew 17 % darker than the ground's at tone 1: 133 vs 160 sRGB, w2r1_b/b1_morn_day.jpg)
      const tone = 1.42 + 0.2 * hash2(Math.round(p.x * 5) + 3, Math.round(p.z * 5) + seed);
      const ids = up.map((P) => buf.v(P[0], p.y + 0.003, P[1], 0, 1, 0, P[0] * 0.9, P[1] * 0.9, tone, tone, tone));
      buf.fan(ids);
      n++;
    }
  }
  return n;
}

// ---- markings the compiled ground lacks, from the references (each entry says where its numbers come from)
// xwalk: a high-visibility crosswalk across 125th Street: centre, the street's direction u, bar length along u (= the
// crosswalk's width), bar width and pitch across the street, kerb to kerb; the stop lines `stop` m before each edge, 0.61 m
// wide, across the approach half (traffic keeps right: eastbound on the south half stops on the west side).
export const MARKS = [
  // the State Office Building's mid-block crossing between Adam Clayton Powell and Lenox:
  // 14 bars at 0.927 m pitch, bars 66 px = 9.4 m long, stop lines 4.6 m out;
  // its centre 11 px (1.6 m) WNW of the shot's centre (40.808375 N, 73.946894 W read off the shot, taken as its centre);
  // The compiled ground has the bus lanes running through and no crosswalk here.
  { kind: 'xwalk', x: 2047.0, z: -2808.2, ux: 0.8740, uz: 0.4859, len: 9.4, barW: 0.46, pitch: 0.927, stop: 4.6, bars: 14, padW: 9.4 },
];

// the road under an oriented box as up-facing polygons (asphalt + bus lane clipped to it; gutter pieces left out)
function roadUnder(field, tile, ox, oz, cx, cz, ux, uz, hu, hv, emit) {
  const vx = -uz, vz = ux, fu = (p) => (p[0] - cx) * ux + (p[1] - cz) * uz, fv = (p) => (p[0] - cx) * vx + (p[1] - cz) * vz;
  const R = hu + hv;
  for (const sec of ['asphalt', 'busred']) {
    const a = tile.S[sec]; if (!a) continue;
    for (let o = 0; o + 8 < a.length; o += 9) {
      const P = [0, 1, 2].map((i) => [a[o + i * 3] + ox, a[o + i * 3 + 2] + oz, a[o + i * 3 + 1]]);
      if (Math.min(P[0][0], P[1][0], P[2][0]) > cx + R || Math.max(P[0][0], P[1][0], P[2][0]) < cx - R || Math.min(P[0][1], P[1][1], P[2][1]) > cz + R || Math.max(P[0][1], P[1][1], P[2][1]) < cz - R) continue;
      let q = clipHalf(P, (p) => -hu - fu(p)); q = clipHalf(q, (p) => fu(p) - hu); q = clipHalf(q, (p) => -hv - fv(p)); q = clipHalf(q, (p) => fv(p) - hv);
      if (q.length < 3) continue;
      let A = 0; for (let k = 0; k < q.length; k++) { const p = q[k], r = q[(k + 1) % q.length]; A += p[0] * r[1] - r[0] * p[1]; }
      if (Math.abs(A) < 0.01) continue;
      const mx = q.reduce((s, p) => s + p[0], 0) / q.length, mz = q.reduce((s, p) => s + p[1], 0) / q.length;
      if (field.has('gutter', mx, mz)) continue;
      emit(A < 0 ? q : q.slice().reverse());
    }
  }
}
// an up-facing rectangle (centre, u axis, half sizes) at height y
function flatRect(buf, x, z, y, ux, uz, hu, hv, tone) {
  const vx = -uz, vz = ux;
  const pts = [[-hu, -hv], [hu, -hv], [hu, hv], [-hu, hv]].map(([a, b]) => [x + ux * a + vx * b, z + uz * a + vz * b]);
  let A = 0; for (let k = 0; k < 4; k++) { const p = pts[k], r = pts[(k + 1) % 4]; A += p[0] * r[1] - r[0] * p[1]; }
  const up = A < 0 ? pts : pts.slice().reverse();
  buf.fan(up.map((p) => buf.v(p[0], y, p[1], 0, 1, 0, p[0], p[1], tone, tone, tone)));
}

// getBuf(x, z, part): part 'xmask' (asphalt laid over the bus lane in the crossing) or 'xpaint' (the new bars and lines)
export function buildMarks(field, tile, ox, oz, getBuf, inTile, padsOut = null) {
  let n = 0;
  for (const m of MARKS) {
    // built by the tile whose compiled road covers the centre (sections run a little past a tile's square: the SOB crossing at
    // x 2047 is drawn by tile 4_-6, whose road reaches x 2043, not by 3_-6 whose square it is in)
    if (m.kind !== 'xwalk' || !['asphalt', 'busred'].includes(field.kindAt(m.x, m.z))) continue;
    const vx = -m.uz, vz = m.ux;
    // kerb to kerb across the street (the road kinds, gutter included), from the centre
    const span = (dir) => { let d = 0; while (d < 20) { const k = field.kindAt(m.x + vx * dir * (d + 0.1), m.z + vz * dir * (d + 0.1)); if (!k || !['asphalt', 'busred', 'gutter', 'paintW', 'paintY', 'paintG'].includes(k)) break; d += 0.1; } return d; };
    const dN = span(-1), dS = span(1);
    if (dN < 3 || dS < 3) continue;
    const yRoad = field.yAt('asphalt', m.x, m.z) ?? field.yAt('busred', m.x, m.z) ?? 3.385;
    // the crossing's asphalt over the red lane and the lines that ran through it, 0.6 m past the bars either way
    const mb = getBuf(m.x, m.z, 'xmask');
    roadUnder(field, tile, ox, oz, m.x, m.z, m.ux, m.uz, m.len / 2 + 0.6, 20, (poly) => {
      buf_fan(mb, poly.map((p) => mb.v(p[0], p[2] + 0.026, p[1], 0, 1, 0, p[0] * 0.9, p[1] * 0.9, 1.35, 1.35, 1.35)));   // over the compiled paint (24 mm up)
    });
    // the bars: `bars` of them (the count read off the reference) or as many as fit 0.3 m off each kerb, centred between the kerbs
    const total = dN + dS - 0.6, nb = m.bars || Math.max(1, Math.floor((total - m.barW) / m.pitch) + 1), used = (nb - 1) * m.pitch + m.barW;
    const b0 = -dN + 0.3 + (total - used) / 2 + m.barW / 2;
    const pb = getBuf(m.x, m.z, 'xpaint'), worn = [];
    for (let i = 0; i < nb; i++) {
      const b = b0 + i * m.pitch;
      flatRect(pb, m.x + vx * b, m.z + vz * b, yRoad + 0.029, m.ux, m.uz, m.len / 2, m.barW / 2, 0.97 + 0.06 * hash2(i + 5, 77));
      worn.push({ x: m.x + vx * b, z: m.z + vz * b, ux: m.ux, uz: m.uz, L: m.len, W: m.barW, y: yRoad + 0.029 });
      n++;
    }
    // worn like the compiled ones (b3_mid 2026-08: cracked and flaking along the wheel paths)
    buildWear(worn, (x, z) => getBuf(x, z, 'wear'), 29);
    // the warning strip along each kerb, the crossing's whole width (b3_mid 2026-08: a light grey tactile strip on the walk,
    // dark domes), 0.61 m deep just behind the kerb face; buildPads draws it from the spot
    if (m.padW) for (const [dir, d] of [[-1, dN], [1, dS]]) {
      const px = m.x + vx * dir * (d + 0.42), pz = m.z + vz * dir * (d + 0.42);
      // the strip can lie past this tile's sections (the south walk at x 2043 is tile 3_-6's): then the walk's 3.52 m datum
      const k = field.kindAt(px, pz);
      if (k && k !== 'sidewalk') continue;
      if (padsOut) padsOut.push({ x: px, z: pz, y: (field.yAt('sidewalk', px, pz) ?? 3.52) + 0.0045, w: m.padW, d: 0.61, ux: m.ux, uz: m.uz, kind: 'white' });
    }
    // the stop lines, centre line (midway kerb to kerb) to the kerb on the approach side
    const mid = (dS - dN) / 2;
    for (const [side, along] of [[1, -1], [-1, 1]]) {      // south half: west side; north half: east side
      const a = along * (m.len / 2 + m.stop + 0.305), bIn = mid, bOut = side > 0 ? dS - 0.3 : -dN + 0.3;
      const bc = (bIn + bOut) / 2, hl = Math.abs(bOut - bIn) / 2;
      flatRect(pb, m.x + m.ux * a + vx * bc, m.z + m.uz * a + vz * bc, yRoad + 0.026, vx, vz, hl, 0.305, 0.95);
      n++;
    }
  }
  return n;
}
const buf_fan = (buf, ids) => buf.fan(ids);

// ---- the crosswalks' ends: where the compiled bars of a crossing meet a sidewalk. Every crossing on 125th Street ends at a
// ramp with a detectable warning surface, but the
// compiled ground has pads at only some of them (warn / warnIron). Returns the spots that have none within 2.5 m: { x, z, y,
// w, d, ux, uz, kind } in the shape of skBuild.padCentres (the pad's long side along the kerb, just behind the kerb top).
export function crossingEnds(pieces, field, have) {
  const bars = pieces.filter((p) => p.W > 0.35 && p.W < 0.6 && p.L > 3 && p.L < 9);
  const par = bars.map((_, i) => i), f = (i) => (par[i] === i ? i : (par[i] = f(par[i])));
  for (let i = 0; i < bars.length; i++) for (let j = i + 1; j < bars.length; j++) {
    const A = bars[i], B = bars[j];
    if (Math.abs(A.ux * B.ux + A.uz * B.uz) < 0.998) continue;
    const dx = B.x - A.x, dz = B.z - A.z, D = Math.hypot(dx, dz);
    if (D > 1.3 || Math.abs(dx * A.ux + dz * A.uz) > 0.3) continue;
    par[f(i)] = f(j);
  }
  const groups = new Map();
  bars.forEach((b, i) => { const r = f(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(b); });
  const out = [];
  for (const g of groups.values()) {
    if (g.length < 4) continue;
    const ux = g[0].ux, uz = g[0].uz, ax = -uz, az = ux;
    const cx = g.reduce((s, b) => s + b.x, 0) / g.length, cz = g.reduce((s, b) => s + b.z, 0) / g.length;
    let s0 = 1e9, s1 = -1e9;
    for (const b of g) { const s = (b.x - cx) * ax + (b.z - cz) * az; s0 = Math.min(s0, s); s1 = Math.max(s1, s); }
    for (const [s, dir] of [[s0, -1], [s1, 1]]) {
      // walk out of the last bar to the first sidewalk point (the kerb face), at most 5 m
      let K = null;
      for (let d = 0.25; d < 5; d += 0.1) {
        const x = cx + ax * (s + dir * d), z = cz + az * (s + dir * d);
        if (field.kindAt(x, z) === 'sidewalk') { K = [x, z]; break; }
      }
      if (!K) continue;
      if (have.some((p) => Math.hypot(p.x - K[0], p.z - K[1]) < 2.5)) continue;
      // right behind the kerb top (0.17 m) as the real ones sit at the foot of the ramp (b1_morn 2024-08); the kerb stays shut
      // in front of an added pad (no compiled ramp there: an opening showed the dark compiled face, w2r1_e/b1_morn)
      const px = K[0] + ax * dir * 0.5, pz = K[1] + az * dir * 0.5;
      if (!field.has('sidewalk', px, pz)) continue;
      const y = field.yAt('sidewalk', px, pz);
      out.push({ x: px, z: pz, y: y + 0.0045, w: 1.52, d: 0.61, ux, uz, kind: 'red', added: true });
    }
  }
  return out;
}
