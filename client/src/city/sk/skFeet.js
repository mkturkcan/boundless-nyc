// AR34 sk: the Riverside Drive viaduct's feet at the 125th Street / Twelfth Avenue junction put on the walk, as the
// on the street, with two crosswalks intersecting below it"). Pure (no three, no DOM); called from skFix.js before anything
// samples or draws the tile's ground; `?skfeet=0` (or `?skfix=0`) keeps the compiled ground.
// What the compiled tiles had (node probe of public/tiles 2026-10-02; tower and column feet from vk/rsd.js's frame and
// vk/vkData.js's stations, pedestal 1.95 m along the line x 2.4 m across):
// - the arch's NW tower (u 140, l -9.15) stood in the asphalt 5.5 m south-west of the NW corner's tip, and two compiled
// crossings met under it: the Twelfth Avenue crossing along the bent (NW tower to NE tower) and a diagonal one from the
// west corner's tip to (916.6, -3889), whose bars ran 1.3-3.6 m south of the tower and over the other crossing's end;
// - the SW, SE and NE towers straddled their corners' kerbs (half the pedestal on the road);
// - the columns at u 83.8 and 159.5 (both lines) stood in the ends of the wide Twelfth Avenue crossings (the end bars 0.5-0.9 m
// from the column's centre).
// foot; the SW tower stands on the SW corner behind the end of the Twelfth Avenue crossing; no crossing runs past the camera
// (the diagonal crossing would pass 2-3 m south of it: plain asphalt with lane dashes and a stop line in h090 and h180); the
// crossing of W 125th west of the junction runs from the west corner to Dinosaur's corner (h270, kept).
// So: a walk (the compiled sidewalk's height, flagged and kerbed by the kit like any compiled walk) round each foot with the
// kerb ~0.9 m (towers) / 0.6 m (columns) clear of the pedestal, joined to the corner's walk (the NW tower: the corner's tip
// carried to the tower); the compiled walk under it cut out (no double flags); paint under it dropped (whole bars; long lines
// clipped); the old kerb faces inside it dropped; new kerb faces where it borders the road;
// show dropped (DROP_X); the north bent's doubled zebra made single and moved north of the towers (NBENT).
import { Field, ROAD } from './skField.js';
import { clipHalf, fanUp } from './skGeom.js';
import { RSD_STATIONS } from '../vk/vkData.js';

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
export const SK_FEET_ON = !(Q && Q.get('skfeet') === '0');

// vk/rsd.js's frame (RS.A, RS.dir, RS.lc, RS.ribs; kept equal by hand: rsd.js pulls three, this file stays pure)
const A = [850.0, -3762.7], DIR = [0.48737, -0.87320], NR = [-DIR[1], DIR[0]], LC = 1.0, RIBS = [-9.15, 9.15];
const PA = 1.95, PB = 2.4;          // the pedestal: along the line, across (rsdBent)
const RP = (u, l) => [A[0] + DIR[0] * u + NR[0] * (l + LC), A[1] + DIR[1] * u + NR[1] * (l + LC)];
// [u, kerb clearance m, extra world points the walk is carried to (the hull's), what]
const FEET = [
  [140.0, 0.9, { '-9.15': [[912.3, -3897.6], [915.2, -3897.6]] }, 'the arch towers (north)'],
  [102.0, 0.9, null, 'the arch towers (south)'],
  [159.5, 0.6, null, 'the columns at the north crossing'],
  [83.8, 0.6, null, 'the columns at the south crossing'],
];
const DROP_X = [
  // the diagonal one from the west corner's tip past the NW tower (8I93 2023-09 h090 / h180: plain asphalt 2-3 m south of
  // the lens, lane dashes and a stop line, no bars)
  { a: [898.5, -3878.4], b: [916.8, -3889.3], hw: 2.6, ang: 58, len: 3.07 },
  // the one over the NNW road at the NW corner, (888.4, -3893.8) to (905.0, -3905.3): RmsEF5 2023-09 stands on its
  // line with the corner's kerb 5 m to the left and plain asphalt round the lens; 8I93 h000 sees the corner's planted beds
  // and plain asphalt there (the compiled road runs ~14 m too far east here: LEAD.md, the NW corner)
  { a: [888.0, -3893.5], b: [905.4, -3905.6], hw: 2.0, ang: 56, len: 7.63 },
];
const BOX = [870, -3915, 960, -3815];   // the junction (world x0, z0, x1, z1)
// the Twelfth Avenue crossing at the north bent: compiled as two overlapping zebras along the bent line between the NW and NE
// towers (bars 4.85 m at u 141.2 and 4.69 m at u 142.3, 0.4 m apart across: a doubled, crossed-looking hatch) with a stop line
// either side (6.49 m at u 145.2 and 138.4).
// edge ~20 m from the lens on the axis (u ~144.8-147.1 on the ALT 2.9 lens): north of the towers, the towers on the corners'
// walks beside it. So the second zebra goes, and the first with its stop lines moves north by DU (its west end then meets
// the NW corner's kerb and is trimmed there)
const NBENT = { u0: 136.5, u1: 146.5, l: 10.5, dupU: 142.3, keepU: 141.2, du: 4.5 };

const PAINT = ['paintW', 'paintY', 'paintG', 'busred'];

function hull(pts) {
  const P = pts.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));     // counter-clockwise in (x, z): positive shoelace area
}

// the rounded rectangle round a pedestal, clearance c, in world (x, z)
function footRing(u, l, c) {
  const hu = PA / 2 + c, hl = PB / 2 + c, r = Math.min(c + 0.25, hu, hl), out = [];
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (const [su, sl] of corners) {
    const cu = su * (hu - r), cl = sl * (hl - r), a0 = Math.atan2(sl, su) - Math.PI / 4;
    for (let k = 0; k <= 4; k++) { const a = a0 + (k / 4) * (Math.PI / 2); out.push(RP(u + cu + r * Math.cos(a), l + cl + r * Math.sin(a))); }
  }
  return out;
}

// edges of a CCW polygon as inside tests: f(p) <= 0 inside (p = [x, y, z] world)
function edgeFns(P, grow = 0) {
  const fs = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    const ex = (b[0] - a[0]) / L, ez = (b[1] - a[1]) / L;
    // left of a -> b is inside (CCW in x-z with a positive shoelace area); signed distance outward
    fs.push((p) => -((ex) * (p[2] - a[1]) - (ez) * (p[0] - a[0])) - grow);
  }
  return fs;
}
const inside = (fs, x, z) => { const p = [x, 0, z]; for (const f of fs) if (f(p) > 0) return false; return true; };

// world polygon minus the convex polygon (its edge tests): convex pieces
function diffConvex(poly, fs) {
  const out = [];
  let rest = poly;
  for (const f of fs) {
    const o = clipHalf(rest, (p) => -f(p)); if (o.length > 2) out.push(o);
    rest = clipHalf(rest, f); if (rest.length < 3) break;
  }
  return out;
}

function sectionWorldTris(a, ox, oz, keep) {
  const tris = [], kept = [];
  for (let o = 0; o + 8 < a.length; o += 9) {
    const T = [[a[o] + ox, a[o + 1], a[o + 2] + oz], [a[o + 3] + ox, a[o + 4], a[o + 5] + oz], [a[o + 6] + ox, a[o + 7], a[o + 8] + oz]];
    if (keep(T)) { for (let i = 0; i < 9; i++) kept.push(a[o + i]); } else tris.push(T);
  }
  return { tris, kept };
}
const triBox = (T) => [Math.min(T[0][0], T[1][0], T[2][0]), Math.min(T[0][2], T[1][2], T[2][2]), Math.max(T[0][0], T[1][0], T[2][0]), Math.max(T[0][2], T[1][2], T[2][2])];
const boxHit = (b, c) => !(b[2] < c[0] || b[0] > c[2] || b[3] < c[1] || b[1] > c[3]);

// the paint's bars (triangles sharing vertices) inside the box: groups of triangle indices
function paintGroups(a, ox, oz, box) {
  const n = Math.floor(a.length / 9), par = new Int32Array(n);
  for (let i = 0; i < n; i++) par[i] = i;
  const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  const inB = new Uint8Array(n), vm = new Map();
  for (let t = 0; t < n; t++) {
    const x = (a[t * 9] + a[t * 9 + 3] + a[t * 9 + 6]) / 3 + ox, z = (a[t * 9 + 2] + a[t * 9 + 5] + a[t * 9 + 8]) / 3 + oz;
    if (x < box[0] || x > box[2] || z < box[1] || z > box[3]) continue;
    inB[t] = 1;
    for (let v = 0; v < 3; v++) {
      const key = Math.round(a[t * 9 + v * 3] * 100) + ',' + Math.round(a[t * 9 + v * 3 + 2] * 100), u = vm.get(key);
      if (u === undefined) vm.set(key, t); else { const p = find(t), q = find(u); if (p !== q) par[p] = q; }
    }
  }
  const G = new Map();
  for (let t = 0; t < n; t++) if (inB[t]) { const r = find(t); let g = G.get(r); if (!g) G.set(r, (g = [])); g.push(t); }
  return [...G.values()];
}
function groupShape(a, g, ox, oz) {
  const pts = [];
  for (const t of g) for (let v = 0; v < 3; v++) pts.push([a[t * 9 + v * 3] + ox, a[t * 9 + v * 3 + 2] + oz]);
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, mz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let sxx = 0, szz = 0, sxz = 0;
  for (const p of pts) { sxx += (p[0] - mx) ** 2; szz += (p[1] - mz) ** 2; sxz += (p[0] - mx) * (p[1] - mz); }
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz), c = Math.cos(ang), s = Math.sin(ang);
  let q0 = 1e9, q1 = -1e9;
  for (const p of pts) { const q = (p[0] - mx) * c + (p[1] - mz) * s; q0 = Math.min(q0, q); q1 = Math.max(q1, q); }
  return { pts, mx, mz, deg: ang * 180 / Math.PI, len: q1 - q0 };
}

export function fixFeet(tile, ox, oz, st) {
  if (!SK_FEET_ON || !tile || !tile.S || !tile.S.sidewalk) return;
  if (ox > BOX[2] || ox + 512 < BOX[0] || oz > BOX[3] || oz + 512 < BOX[1]) return;
  const F = new Field(tile, ox, oz);                                   // the compiled ground, before this pass
  const SW = new Field(tile, ox, oz, ['sidewalk']);
  const RD = new Field(tile, ox, oz, ['asphalt', 'gutter', 'busred']);
  // 1. the bulbs: a convex walk polygon per foot that touches the road
  const bulbs = [];
  for (const [u, c, extra] of FEET) {
    if (!RSD_STATIONS.some((s) => Math.abs(s - u) < 0.05)) continue;   // the stations moved: re-measure before trusting this
    for (const l of RIBS) {
      const ring = footRing(u, l, c), ex = (extra && extra[String(l)]) || [];
      let touches = false;
      for (const p of ring) { const k = F.kindAt(p[0], p[1]); if (k && ROAD.has(k)) { touches = true; break; } }
      if (!touches) continue;
      const P = hull(ring.concat(ex));
      const [cx, cz] = RP(u, l);
      // heights: the road at the foot, the walk round it (the highest compiled walk within 5 m), else the road + 0.135
      let yR = RD.yAt('asphalt', cx, cz) ?? RD.yAt('gutter', cx, cz);
      let yW = null;
      for (let r = 1.5; r <= 5 && yW === null; r += 0.5) for (let k = 0; k < 16; k++) {
        const y = SW.yAt('sidewalk', cx + r * Math.cos(k * Math.PI / 8), cz + r * Math.sin(k * Math.PI / 8));
        if (y !== null && (yW === null || y > yW)) yW = y;
      }
      if (yR === null) { for (const p of P) { const y = RD.yAt('asphalt', p[0], p[1]) ?? RD.yAt('gutter', p[0], p[1]); if (y !== null) { yR = y; break; } } }
      if (yR === null && yW === null) continue;
      if (yR === null) yR = yW - 0.135;
      if (yW === null || yW < yR + 0.05) yW = yR + 0.135;
      bulbs.push({ u, l, P, fs: edgeFns(P), fsG: edgeFns(P, 0.2), yR, yW, box: [Math.min(...P.map((p) => p[0])) - 0.3, Math.min(...P.map((p) => p[1])) - 0.3, Math.max(...P.map((p) => p[0])) + 0.3, Math.max(...P.map((p) => p[1])) + 0.3] });
    }
  }
  {
    const a = tile.S.paintW;
    if (a && a.length >= 9) {
      const n = Math.floor(a.length / 9), drop = new Uint8Array(n);
      let k = 0;
      for (const g of paintGroups(a, ox, oz, BOX)) {
        const s = groupShape(a, g, ox, oz);
        for (const X of DROP_X) {
          const dx = X.b[0] - X.a[0], dz = X.b[1] - X.a[1], L = Math.hypot(dx, dz);
          const t = ((s.mx - X.a[0]) * dx + (s.mz - X.a[1]) * dz) / (L * L);
          const off = Math.abs((s.mx - X.a[0]) * dz - (s.mz - X.a[1]) * dx) / L;
          let dA = Math.abs(s.deg - X.ang) % 180; dA = Math.min(dA, 180 - dA);
          if (t < -0.02 || t > 1.02 || off > X.hw || dA > 4 || Math.abs(s.len - X.len) > 0.25) continue;
          for (const tt of g) drop[tt] = 1;
          k++; break;
        }
      }
      if (k) { const out = []; for (let t = 0; t < n; t++) if (!drop[t]) for (let i = 0; i < 9; i++) out.push(a[t * 9 + i]); tile.S.paintW = Float32Array.from(out); st.diag = k; }
    }
  }
  // 2b. the north bent's crossing: the doubled zebra made single, it and its stop lines moved north (before the bulbs trim it)
  {
    const a = tile.S.paintW;
    if (a && a.length >= 9) {
      const n = Math.floor(a.length / 9), drop = new Uint8Array(n), move = new Uint8Array(n);
      let dup = 0, moved = 0;
      for (const g of paintGroups(a, ox, oz, BOX)) {
        const s = groupShape(a, g, ox, oz);
        const dx = s.mx - A[0], dz = s.mz - A[1], u = dx * DIR[0] + dz * DIR[1], l = dx * NR[0] + dz * NR[1] - LC;
        if (u < NBENT.u0 || u > NBENT.u1 || Math.abs(l) > NBENT.l) continue;
        let dA = Math.abs(s.deg - (-59.5)) % 180; dA = Math.min(dA, 180 - dA);         // a bar: along the line
        let dS = Math.abs(s.deg - 29.5) % 180; dS = Math.min(dS, 180 - dS);            // a stop line: across it
        if (dA < 3 && s.len > 4.5 && s.len < 5.0) {
          if (Math.abs(u - NBENT.dupU) < 0.35) { for (const t of g) drop[t] = 1; dup++; }
          else if (Math.abs(u - NBENT.keepU) < 0.35) { for (const t of g) move[t] = 1; moved++; }
        } else if (dS < 3 && s.len > 6 && s.len < 7) { for (const t of g) move[t] = 1; moved++; }
      }
      if (dup || moved) {
        const out = [], mx = DIR[0] * NBENT.du, mz = DIR[1] * NBENT.du;
        for (let t = 0; t < n; t++) {
          if (drop[t]) continue;
          for (let v = 0; v < 3; v++) { const o = t * 9 + v * 3; out.push(a[o] + (move[t] ? mx : 0), a[o + 1], a[o + 2] + (move[t] ? mz : 0)); }
        }
        tile.S.paintW = Float32Array.from(out); st.nbentDup = dup; st.nbentMoved = moved;
      }
    }
  }
  if (!bulbs.length) return;
  // 3. paint under a bulb: short bars whole, long lines clipped round it
  for (const name of PAINT) {
    const a = tile.S[name]; if (!a || a.length < 9) continue;
    const n = Math.floor(a.length / 9), drop = new Uint8Array(n), clip = new Uint8Array(n);
    let any = 0;
    for (const g of paintGroups(a, ox, oz, BOX)) {
      const s = groupShape(a, g, ox, oz);
      const gb = [Math.min(...s.pts.map((p) => p[0])), Math.min(...s.pts.map((p) => p[1])), Math.max(...s.pts.map((p) => p[0])), Math.max(...s.pts.map((p) => p[1]))];
      for (const B of bulbs) {
        if (!boxHit(gb, B.box)) continue;
        let hit = inside(B.fsG, s.mx, s.mz);
        for (const p of s.pts) if (!hit && inside(B.fsG, p[0], p[1])) hit = true;
        if (!hit) for (const t of g) {   // an edge through the bulb with both ends outside
          for (let v = 0; v < 3 && !hit; v++) { const w = (v + 1) % 3; for (let q = 1; q < 8 && !hit; q++) { const x = a[t * 9 + v * 3] + (a[t * 9 + w * 3] - a[t * 9 + v * 3]) * q / 8 + ox, z = a[t * 9 + v * 3 + 2] + (a[t * 9 + w * 3 + 2] - a[t * 9 + v * 3 + 2]) * q / 8 + oz; if (inside(B.fsG, x, z)) hit = true; } }
        }
        if (!hit) continue;
        for (const t of g) { if (s.len < 8) drop[t] = 1; else clip[t] = 1; }
        any++;
      }
    }
    if (!any) continue;
    const out = [];
    for (let t = 0; t < n; t++) {
      if (drop[t]) continue;
      if (!clip[t]) { for (let i = 0; i < 9; i++) out.push(a[t * 9 + i]); continue; }
      let pieces = [[[a[t * 9] + ox, a[t * 9 + 1], a[t * 9 + 2] + oz], [a[t * 9 + 3] + ox, a[t * 9 + 4], a[t * 9 + 5] + oz], [a[t * 9 + 6] + ox, a[t * 9 + 7], a[t * 9 + 8] + oz]]];
      for (const B of bulbs) { const nx = []; for (const p of pieces) for (const q of diffConvex(p, B.fsG)) nx.push(q); pieces = nx; }
      for (const p of pieces) fanUp(p, ox, oz, out);
    }
    tile.S[name] = Float32Array.from(out);
    st.paint = (st.paint || 0) + any;
  }
  // 4. warning pads inside a bulb
  for (const name of ['warn', 'warnIron']) {
    const a = tile.S[name]; if (!a || a.length < 18) continue;
    const out = []; let k = 0;
    for (let o = 0; o + 17 < a.length; o += 18) {
      let x = 0, z = 0; for (let v = 0; v < 6; v++) { x += a[o + v * 3] / 6; z += a[o + v * 3 + 2] / 6; }
      if (bulbs.some((B) => inside(B.fsG, x + ox, z + oz))) { k++; continue; }
      for (let i = 0; i < 18; i++) out.push(a[o + i]);
    }
    for (let o = Math.floor(a.length / 18) * 18; o < a.length; o++) out.push(a[o]);
    if (k) { tile.S[name] = Float32Array.from(out); st.pads = (st.pads || 0) + k; }
  }
  // 5. the compiled walk under a bulb cut out, then the bulbs' walk
  {
    const { tris, kept } = sectionWorldTris(tile.S.sidewalk, ox, oz, (T) => !bulbs.some((B) => boxHit(triBox(T), B.box)));
    const out = kept;
    for (const T of tris) {
      let pieces = [T];
      for (const B of bulbs) { if (!boxHit(triBox(T), B.box)) continue; const nx = []; for (const p of pieces) for (const q of diffConvex(p, B.fs)) nx.push(q); pieces = nx; }
      for (const p of pieces) fanUp(p, ox, oz, out);
    }
    for (const B of bulbs) fanUp(B.P.map((p) => [p[0], B.yW, p[1]]), ox, oz, out);
    tile.S.sidewalk = Float32Array.from(out);
  }
  // 6. kerbs: the old faces inside a bulb dropped; a face on each bulb edge that borders the road (the compiled ground's
  // kind 0.35 m out), from under the road to the walk, facing the road
  {
    const a = tile.S.curb || new Float32Array(0), out = [];
    let dropped = 0;
    for (let o = 0; o + 8 < a.length; o += 9) {
      const x = (a[o] + a[o + 3] + a[o + 6]) / 3 + ox, z = (a[o + 2] + a[o + 5] + a[o + 8]) / 3 + oz;
      if (bulbs.some((B) => inside(edgeFns(B.P, -0.05), x, z))) { dropped++; continue; }
      for (let i = 0; i < 9; i++) out.push(a[o + i]);
    }
    let faces = 0;
    for (const B of bulbs) {
      const P = B.P;
      for (let i = 0; i < P.length; i++) {
        const p = P[i], q = P[(i + 1) % P.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (L < 0.02) continue;
        const ex = (q[0] - p[0]) / L, ez = (q[1] - p[1]) / L, nx = ez, nz = -ex;   // outward (inside is to the left)
        const mx = (p[0] + q[0]) / 2 + nx * 0.35, mz = (p[1] + q[1]) / 2 + nz * 0.35;
        const k = F.kindAt(mx, mz);
        if (k && !ROAD.has(k)) continue;                                // walk or bed beyond: no kerb
        if (bulbs.some((C) => C !== B && inside(C.fs, mx, mz))) continue;
        const y0 = B.yR - 0.04, y1 = B.yW;
        const T1 = [[p[0], y1, p[1]], [q[0], y1, q[1]], [q[0], y0, q[1]]], T2 = [[p[0], y1, p[1]], [q[0], y0, q[1]], [p[0], y0, p[1]]];
        for (const T of [T1, T2]) {
          // three's front face: (B - A) x (C - A) toward the road
          const ux = T[1][0] - T[0][0], uy = T[1][1] - T[0][1], uz = T[1][2] - T[0][2], vx = T[2][0] - T[0][0], vy = T[2][1] - T[0][1], vz = T[2][2] - T[0][2];
          const cx = uy * vz - uz * vy, cz = ux * vy - uy * vx;
          const R = cx * nx + cz * nz >= 0 ? T : [T[0], T[2], T[1]];
          for (const v of R) out.push(v[0] - ox, v[1], v[2] - oz);
        }
        faces++;
      }
    }
    tile.S.curb = Float32Array.from(out);
    st.kerbFaces = faces; st.kerbDropped = dropped;
  }
  st.feet = bulbs.length;
  st.feetList = bulbs.map((B) => `${B.u}/${B.l}`).join(' ');
  st.feetPolys = bulbs.map((B) => B.P.map((p) => [+p[0].toFixed(2), +p[1].toFixed(2)]));   // world (x, z): the page check
}
