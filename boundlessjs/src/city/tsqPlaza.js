// TP28 — the Times Square plaza (owner 2026-09-27: "Work on some new areas like Times Square and Bryant Park for the
// new teaser"). Broadway from 42nd to 47th St has been a pedestrian plaza since 2009 (rebuilt flush in precast pavers in
// 2017). The compiler already takes its traffic away (CSCL non-vehicular, compile.mjs pedStreet: bit 7 of rclass) but
// keeps the street's ground, so the bowtie still drew as an asphalt avenue with gutters down both kerbs. Here the
// ground build re-kinds that asphalt: every asphalt, gutter or bus-lane triangle is cut exactly against the plaza (the
// pedestrianised Broadway ribbons) minus the carriageways that still cross it (Seventh Avenue and the cross streets,
// bridged across the plaza where CSCL leaves a gap), and the plaza part becomes matId 16, the paver branch of the
// ground shader (materials.js). Paint inside the plaza goes. `?tp28=0` restores the compiled ground.
import * as THREE from 'three';
import { ENV, applyLightTrim as LT, applySkyGlass } from '../world/materials.js';
import { TQ32 } from '../world/tq32.js';   // TQ32: the TKTS risers as backlit red glass (?tq32=0)
import { COLLIDERS } from './colliders.js';
import { chairGeo31, tableGeo31 } from './bryantParkKit.js';   // the same folding bistro set, in the Alliance's red
import { frameAt, addPieces, station, duffyMonument, cohanMonument, ticketTotem, subwayEntrance, redKiosk, foodCart, compactor, marquee, posterCube, streetKiosk } from './tsqKit.js';   // TF32
export const TP28 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('tp28') === '0');
export const TP_MAT = 16;

// Broadway's pedestrian pieces between 42nd and 47th lie in this box (world x, z)
const BOX = { x0: -1330, x1: -1120, z0: 2600, z1: 3070 };

// a convex quad for the ribbon piece p -> q, half width hw, extended e0 / e1 metres past its ends
function ribbonQuad(p, q, hw, e0, e1) {
  const dx = q[0] - p[0], dz = q[2] - p[2], L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
  const ax = p[0] - ux * e0, az = p[2] - uz * e0, bx = q[0] + ux * e1, bz = q[2] + uz * e1;
  return mkConvex([[ax + nx * hw, az + nz * hw], [bx + nx * hw, bz + nz * hw], [bx - nx * hw, bz - nz * hw], [ax - nx * hw, az - nz * hw]]);
}
export function mkConvex(q) {
  let a = 0, x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (let i = 0; i < q.length; i++) {
    const p = q[i], r = q[(i + 1) % q.length];
    a += p[0] * r[1] - r[0] * p[1];
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]);
  }
  return { q, s: a >= 0 ? 1 : -1, bb: [x0, z0, x1, z1] };
}

// The plaza and the carriageways across it, for one tile, from the tile's own road records (world pts). null when the
// tile holds no piece of the plaza.
export function tpRegions(roads) {
  if (!TP28) return null;
  const ped = [], car = [], ends = [];
  let bb = [1e9, 1e9, -1e9, -1e9];
  for (const r of roads) {
    if (r.level > 0 || r.pts.length < 2) continue;
    const inBox = r.pts.some((p) => p[0] > BOX.x0 && p[0] < BOX.x1 && p[2] > BOX.z0 && p[2] < BOX.z1);
    if (!inBox) continue;
    const hw = r.width / 2, last = r.pts.length - 2;
    if (r.noTraffic) {
      if (!/BROADWAY/.test(r.name || '')) continue;
      for (let k = 0; k <= last; k++) {
        const Q = ribbonQuad(r.pts[k], r.pts[k + 1], hw + 0.5, k === 0 ? 0 : 0.8, k === last ? 0 : 0.8);   // + 0.5: the gutter strips to the kerb (only asphalt is re-kinded, so nothing past the kerb is touched)
        ped.push(Q);
        bb = [Math.min(bb[0], Q.bb[0]), Math.min(bb[1], Q.bb[1]), Math.max(bb[2], Q.bb[2]), Math.max(bb[3], Q.bb[3])];
      }
    } else if (r.rclass <= 4) {
      for (let k = 0; k <= last; k++) car.push(ribbonQuad(r.pts[k], r.pts[k + 1], hw, k === 0 ? 3 : 0.8, k === last ? 3 : 0.8));
      const P = r.pts, n = P.length;
      const d0 = [P[0][0] - P[1][0], P[0][2] - P[1][2]], d1 = [P[n - 1][0] - P[n - 2][0], P[n - 1][2] - P[n - 2][2]];
      const l0 = Math.hypot(d0[0], d0[1]) || 1, l1 = Math.hypot(d1[0], d1[1]) || 1;
      ends.push({ p: P[0], d: [d0[0] / l0, d0[1] / l0], hw, name: r.name, r });
      ends.push({ p: P[n - 1], d: [d1[0] / l1, d1[1] / l1], hw, name: r.name, r });
    }
  }
  if (!ped.length) return null;
  // CSCL stops a cross street at both edges of the plaza (W 43rd: 19 m apart, W 44th 16, W 45th 13, W 46th 10), and the
  // junction asphalt between them is still that street's carriageway: bridge each such pair (same name, the gap running
  // on with both ends, facing each other) with the narrower street's width.
  for (const a of ends) for (const b of ends) {
    if (a === b || a.r === b.r || a.name !== b.name) continue;
    const gx = b.p[0] - a.p[0], gz = b.p[2] - a.p[2], g = Math.hypot(gx, gz);
    if (g < 1 || g > 32) continue;
    if ((gx * a.d[0] + gz * a.d[1]) / g < 0.96 || a.d[0] * b.d[0] + a.d[1] * b.d[1] > -0.9) continue;
    car.push(ribbonQuad(a.p, b.p, Math.min(a.hw, b.hw), 0.5, 0.5));
  }
  return { ped, car, bb };
}

// ---- convex clipping (vertices [x, y, z]; y interpolates with the plane it lies on)
function clipHalf(poly, ax, az, bx, bz, s, inside) {
  const out = [], n = poly.length, ex = bx - ax, ez = bz - az;
  let P = poly[n - 1], sp = s * (ex * (P[2] - az) - ez * (P[0] - ax));
  if (!inside) sp = -sp;
  for (let i = 0; i < n; i++) {
    const Q = poly[i];
    let sq = s * (ex * (Q[2] - az) - ez * (Q[0] - ax));
    if (!inside) sq = -sq;
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq);
      out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t, P[2] + (Q[2] - P[2]) * t]);
    }
    if (sq >= 0) out.push(Q);
    P = Q; sp = sq;
  }
  return out.length >= 3 ? out : null;
}
function area(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[2] - q[0] * p[2]; }
  return Math.abs(a) / 2;
}
function hits(poly, C) {
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const p of poly) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[2] < z0) z0 = p[2]; if (p[2] > z1) z1 = p[2]; }
  return !(x1 < C.bb[0] || x0 > C.bb[2] || z1 < C.bb[1] || z0 > C.bb[3]);
}
function cut(poly, C) {
  // [inside C, [convex pieces outside C]]
  const outs = [];
  let cur = poly;
  for (let i = 0; i < C.q.length && cur; i++) {
    const a = C.q[i], b = C.q[(i + 1) % C.q.length];
    const o = clipHalf(cur, a[0], a[1], b[0], b[1], C.s, false);
    if (o && area(o) > 1e-4) outs.push(o);
    cur = clipHalf(cur, a[0], a[1], b[0], b[1], C.s, true);
  }
  return [cur && area(cur) > 1e-4 ? cur : null, outs];
}
// split one triangle (world [x, y, z] x 3) into { plaza: [polys], road: [polys] }
export function tpSplit(tri, R) {
  let rest = [tri];
  const inPed = [];
  for (const C of R.ped) {
    const nr = [];
    for (const p of rest) {
      if (!hits(p, C)) { nr.push(p); continue; }
      const [i, outs] = cut(p, C);
      if (i) inPed.push(i);
      nr.push(...outs);
    }
    rest = nr;
    if (!rest.length) break;
  }
  let plaza = inPed;
  for (const C of R.car) {
    if (!plaza.length) break;
    const np = [];
    for (const p of plaza) {
      if (!hits(p, C)) { np.push(p); continue; }
      const [i, outs] = cut(p, C);
      if (i) rest.push(i);
      np.push(...outs);
    }
    plaza = np;
  }
  return { plaza, road: rest };
}
// is (x, z) on the plaza (for the paint that goes)
export function tpOnPlaza(x, z, R) {
  const inside = (C) => {
    if (x < C.bb[0] || x > C.bb[2] || z < C.bb[1] || z > C.bb[3]) return false;
    for (let i = 0; i < C.q.length; i++) {
      const a = C.q[i], b = C.q[(i + 1) % C.q.length];
      if (C.s * ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0])) < 0) return false;
    }
    return true;
  };
  return R.ped.some(inside) && !R.car.some(inside);
}

// ---- the tile's ground, re-kinded (world/assemble.js, before anything samples the sections)
export function tpTileHit(ox, oz) {
  return TP28 && !(ox + 512 < BOX.x0 || ox > BOX.x1 || oz + 512 < BOX.z0 || oz > BOX.z1);
}
// Cuts the asphalt, gutter and bus-lane triangles of `tile` (local coords, origin ox, oz) against the plaza, drops the
// paint on it, and puts the plaza's triangles in a new section `plaza` (a WALK kind to every sampler: the walkers and the
// parking check see pavement, not carriageway). Returns the plaza's area in m2 (0: no plaza in this tile).
export function tpApply(tile, ox, oz, roadsW) {
  const R = tpRegions(roadsW);
  if (!R) return 0;
  const [bx0, bz0, bx1, bz1] = R.bb;
  const plaza = [];
  let m2 = 0;
  const fan = (poly, out) => {
    for (let k = 1; k + 1 < poly.length; k++) for (const p of [poly[0], poly[k], poly[k + 1]]) out.push(p[0] - ox, p[1], p[2] - oz);
  };
  for (const name of ['asphalt', 'gutter', 'busred']) {
    const a = tile.S[name];
    if (!a || a.length < 9) continue;
    const out = [];
    let changed = false;
    for (let i = 0; i + 8 < a.length; i += 9) {
      const x0 = a[i] + ox, z0 = a[i + 2] + oz, x1 = a[i + 3] + ox, z1 = a[i + 5] + oz, x2 = a[i + 6] + ox, z2 = a[i + 8] + oz;
      const keep = () => { for (let k = 0; k < 9; k++) out.push(a[i + k]); };
      if (Math.max(x0, x1, x2) < bx0 || Math.min(x0, x1, x2) > bx1 || Math.max(z0, z1, z2) < bz0 || Math.min(z0, z1, z2) > bz1) { keep(); continue; }
      const S = tpSplit([[x0, a[i + 1], z0], [x1, a[i + 4], z1], [x2, a[i + 7], z2]], R);
      if (!S.plaza.length) { keep(); continue; }
      changed = true;
      for (const poly of S.road) fan(poly, out);
      for (const poly of S.plaza) { fan(poly, plaza); m2 += area(poly); }
    }
    if (changed) tile.S[name] = Float32Array.from(out);
  }
  for (const name of ['paintW', 'paintY', 'paintG']) {
    const a = tile.S[name];
    if (!a || a.length < 9) continue;
    const out = [];
    let dropped = 0;
    for (let i = 0; i + 8 < a.length; i += 9) {
      const cx = (a[i] + a[i + 3] + a[i + 6]) / 3 + ox, cz = (a[i + 2] + a[i + 5] + a[i + 8]) / 3 + oz;
      if (cx > bx0 && cx < bx1 && cz > bz0 && cz < bz1 && tpOnPlaza(cx, cz, R)) { dropped++; continue; }
      for (let k = 0; k < 9; k++) out.push(a[i + k]);
    }
    if (dropped) tile.S[name] = Float32Array.from(out);
  }
  // Duffy Square's lawn strip (the Parks polygon) and the island's walk are paved like the plaza round it
  for (const name of ['sidewalk']) {
    const a = tile.S[name];
    if (!a || a.length < 9) continue;
    const out = [];
    let moved = 0;
    for (let i = 0; i + 8 < a.length; i += 9) {
      const cx = (a[i] + a[i + 3] + a[i + 6]) / 3 + ox, cz = (a[i + 2] + a[i + 5] + a[i + 8]) / 3 + oz;
      if (tpInIsland(cx, cz)) { for (let k = 0; k < 9; k++) plaza.push(a[i + k]); moved++; continue; }
      for (let k = 0; k < 9; k++) out.push(a[i + k]);
    }
    if (moved) tile.S[name] = Float32Array.from(out);
  }
  for (const name of ['grass', 'grassU']) {
    const a = tile.S[name];
    if (!a || a.length < 9) continue;
    const out = [];
    let moved = 0;
    for (let i = 0; i + 8 < a.length; i += 9) {
      const cx = (a[i] + a[i + 3] + a[i + 6]) / 3 + ox, cz = (a[i + 2] + a[i + 5] + a[i + 8]) / 3 + oz;
      if (tpDuffyIn(cx, cz)) { for (let k = 0; k < 9; k++) plaza.push(a[i + k]); moved++; continue; }
      for (let k = 0; k < 9; k++) out.push(a[i + k]);
    }
    if (moved) tile.S[name] = Float32Array.from(out);
  }
  if (!plaza.length) return 0;
  tile.S.plaza = Float32Array.from(plaza);
  if (typeof window !== 'undefined') window.__TP28 = (window.__TP28 || 0) + m2;
  console.log(`[tp28] ${m2.toFixed(0)} m2 of the Broadway plaza in this tile (${R.ped.length} plaza pieces, ${R.car.length} carriageway pieces)`);
  return m2;
}

// ---- walkers on the plaza (sim/peds.js): promenade lines along each pedestrian Broadway piece, 4.3 m apart across its
// 18 m, like College Walk's; the walk builder cuts them where a carriageway crosses and at anything built on the plaza
export function tpPromenades(roads) {
  if (!TP28) return [];
  const out = [];
  for (const r of roads) {
    if (!r.noTraffic || r.level > 0 || r.pts.length < 2 || !/BROADWAY/.test(r.name || '')) continue;
    if (!r.pts.some((p) => p[0] > BOX.x0 && p[0] < BOX.x1 && p[2] > BOX.z0 && p[2] < BOX.z1)) continue;
    // TF31: the outer lines come in off the benches that frame the plaza (their inner edge 2.65 m from its side)
    const half = r.width / 2 - (TF31 && r.width / 2 >= 5.5 ? 4.2 : 2.6);
    for (const f of [-1, -1 / 3, 1 / 3, 1]) out.push({ pts: r.pts, off: f * half });
  }
  return out;
}

// ---- TF31 (owner 2026-09-28: "We need much higher quality and realism for Bryant Park and Times Square there are no
// details, no sitting people on chairs, etc. it's extremely barebones"): the plaza's furniture, after Snohetta's 2017
// reconstruction (Architectural Record 2017-04-19: ten 30-50 ft granite benches along the Broadway axis that "define and
// frame the public plaza", dark precast pavers, most curbs gone), with the steel bollards where the plaza meets the cross
// streets and the Times Square Alliance's red cafe tables and chairs in the pockets between the benches, planters at the
// bench ends. Each piece is built by the tile that holds its centre, only where its whole footprint is plaza (not a
// carriageway), registered as a collider, and every bench place and chair is a seat for the seated walkers (tpSeats).
// `?tf31=0` leaves the plaza bare.
export const TF31 = TP28 && !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('tf31') === '0');
const SEATS31 = new Map();   // tile key -> [{ x, y, z, yaw (the way a seated person faces), h (seat height), kind, group }]
let _seatsFlat = null;
const KIT31 = new Set();   // pieces already registered as walker obstacles (a tile rebuilt does not add them again)
export function tpSeats() { return _seatsFlat || (_seatsFlat = [].concat(...SEATS31.values())); }
let _furnMats = null;
function furnMats() {
  if (_furnMats) return _furnMats;
  return (_furnMats = {
    granite: LT(new THREE.MeshStandardMaterial({ color: 0x5f5e5b, roughness: 0.78, metalness: 0.02 })),   // flamed grey granite
    steel: LT(new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.42, metalness: 0.72 })),
    red: LT(new THREE.MeshStandardMaterial({ color: 0xa3201b, roughness: 0.46, metalness: 0.35 })),   // the Alliance's red cafe set
    planter: LT(new THREE.MeshStandardMaterial({ color: 0x33363a, roughness: 0.6, metalness: 0.45 })),
    shrub: LT(new THREE.MeshStandardMaterial({ color: 0x2f4a24, roughness: 0.95, flatShading: true })),
    wood: LT(new THREE.MeshStandardMaterial({ color: 0x7a5a3c, roughness: 0.74, metalness: 0.0 })),   // the benches' weathered hardwood slats
  });
}
// template geometries (local: +z along the piece, y up, origin at the foot)
let _furnGeo = null;
function furnGeo() {
  if (_furnGeo) return _furnGeo;
  const merge = (parts) => {
    const pos = [], nor = [];
    for (const [g, m] of parts) { const gg = g.toNonIndexed(); gg.applyMatrix4(m); pos.push(...gg.getAttribute('position').array); nor.push(...gg.getAttribute('normal').array); }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.computeBoundingSphere();
    return out;
  };
  const T = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(sx, sy, sz));
  const B = new THREE.BoxGeometry(1, 1, 1), C = (r0, r1, h, n = 12) => new THREE.CylinderGeometry(r0, r1, h, n);
  // bench: a 1.5 m wide granite block on a recessed plinth (the shadow line), its top 0.415 m up; on it the seat of
  // hardwood slats along the bench to 0.46 m (the photos: dark granite with a timber top), sixteen 7.5 cm slats with
  // 1.9 cm gaps, drawn as their own kind (the wood material)
  const bench = (L) => merge([[B, T(0, 0.2675, 0, 1.5, 0.295, L)], [B, T(0, 0.06, 0, 1.3, 0.12, L - 0.2)]]);
  const benchTop = (L) => merge(Array.from({ length: 16 }, (_, i) => [B, T(-0.7425 + 0.0375 + i * 0.094, 0.4375, 0, 0.075, 0.045, L - 0.04)]));
  // bollard: 0.22 m steel post 0.95 m tall with a domed cap and a collar
  const bollard = merge([[C(0.11, 0.11, 0.9), T(0, 0.45, 0)], [new THREE.SphereGeometry(0.11, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), T(0, 0.9, 0)], [C(0.125, 0.125, 0.05), T(0, 0.78, 0)]]);
  // the cafe set: the plaza's red folding bistro chairs and small round tables are the Bryant Park models (the reference
  // photos: slatted seat, crossed legs; a 0.6 m top at 0.73 m), city/bryantParkKit.js, facing +z like these
  const table = tableGeo31(false);
  const chair = chairGeo31();
  const planter = merge([[B, T(0, 0.38, 0, 1.1, 0.76, 2.2)]]);
  const shrub = merge([[new THREE.IcosahedronGeometry(1, 1), T(0, 1.05, 0, 0.62, 0.42, 1.05)]]);
  return (_furnGeo = { bench12: bench(12), bench9: bench(9), benchTop12: benchTop(12), benchTop9: benchTop(9), bollard, table, chair, planter, shrub });
}
export function tpBuildFurniture(group, roadsW, yAt, ox, oz, tileKey) {
  if (!TF31) return 0;
  const R = tpRegions(roadsW);
  if (!R) return 0;
  const M = furnMats(), G = furnGeo();
  const seats = [];
  SEATS31.set(tileKey, seats); _seatsFlat = null;
  const inTile = (x, z) => x >= ox && x < ox + 512 && z >= oz && z < oz + 512;
  const onP = (x, z) => tpOnPlaza(x, z, R);
  const lists = { bench12: [], bench9: [], benchTop12: [], benchTop9: [], bollard: [], table: [], chair: [], planter: [], shrub: [] };
  const put = (k, x, z, yaw, y) => lists[k].push([x, y ?? yAt(x, z), z, yaw]);
  // a footprint (centre, along-unit u, half length hl, half width hw2) wholly on the plaza
  const fits = (cx, cz, ux, uz, hl, hw2) => { const nx = -uz, nz = ux; for (const a of [-hl, 0, hl]) for (const b of [-hw2, hw2]) if (!onP(cx + ux * a + nx * b, cz + uz * a + nz * b)) return false; return true; };
  // walker obstacles under 'kit31' (sim/peds.js reads it with the campus kit: walked round, never a building), once each
  const box = (cx, cy, cz, ux, uz, hl, hw2, hh) => {
    const k = `${Math.round(cx * 10)},${Math.round(cz * 10)}`;
    if (KIT31.has(k)) return;
    KIT31.add(k);
    try { COLLIDERS.addBox('kit31', { x: cx, y: cy + hh, z: cz, hw: hw2, hh, hd: hl, rotY: Math.atan2(-ux, uz) }); } catch { /* colliders not loaded */ }
  };
  let nSeat = 0;
  for (const r of roadsW) {
    if (!r.noTraffic || r.level > 0 || r.pts.length < 2 || !/BROADWAY/.test(r.name || '')) continue;
    if (!r.pts.some((p) => p[0] > BOX.x0 && p[0] < BOX.x1 && p[2] > BOX.z0 && p[2] < BOX.z1)) continue;
    const hw = r.width / 2;
    // stations every metre along the centre line
    const st = [];
    let sAcc = 0;
    for (let k = 0; k < r.pts.length - 1; k++) {
      const A = r.pts[k], Bp = r.pts[k + 1], dx = Bp[0] - A[0], dz = Bp[2] - A[2], L = Math.hypot(dx, dz);
      if (L < 1e-3) continue;
      for (let t = 0; t < L; t += 1) st.push({ x: A[0] + (dx / L) * t, z: A[2] + (dz / L) * t, ux: dx / L, uz: dz / L, s: sAcc + t });
      sAcc += L;
    }
    if (st.length < 20) continue;
    const at = (s) => st[Math.max(0, Math.min(st.length - 1, Math.round(s)))];
    const Lt = st.length - 1;
    // bollards across each end, 1.2 m in from it, every 1.6 m
    for (const s of [1.2, Lt - 1.2]) {
      const q = at(s), nx = -q.uz, nz = q.ux;
      for (let t = -hw + 0.8; t <= hw - 0.8 + 1e-6; t += 1.6) {
        const x = q.x + nx * t, z = q.z + nz * t;
        if (!inTile(x, z) || !onP(x, z)) continue;
        put('bollard', x, z, 0);
        box(x, yAt(x, z), z, q.ux, q.uz, 0.12, 0.12, 0.48);
      }
    }
    if (hw < 5.5) continue;
    // the framing benches: 12 m slabs (9 m where a 12 does not fit) either side, 1.9 m in from the plaza's side, a 7 m
    // gap between; cafe tables in the gaps, a planter at each run's ends
    for (const side of [-1, 1]) {
      const off = side * (hw - 1.9);
      let s = 7;
      let first = true;
      while (s < Lt - 7) {
        let placed = false;
        for (const [key, L] of [['bench12', 12], ['bench9', 9]]) {
          if (s + L > Lt - 7) continue;
          const q = at(s + L / 2), nx = -q.uz, nz = q.ux, cx = q.x + nx * off, cz = q.z + nz * off;
          if (!fits(cx, cz, q.ux, q.uz, L / 2, 0.75)) continue;
          if (inTile(cx, cz)) {
            const y = yAt(cx, cz);
            put(key, cx, cz, Math.atan2(q.ux, q.uz), y);
            put(key.replace('bench', 'benchTop'), cx, cz, Math.atan2(q.ux, q.uz), y);
            box(cx, y, cz, q.ux, q.uz, L / 2, 0.75, 0.23);
            // places on both long sides every 0.9 m (people sit on either face of these)
            for (let a = -L / 2 + 0.6; a <= L / 2 - 0.6; a += 0.9) for (const f of [-1, 1]) {
              seats.push({ x: cx + q.ux * a + nx * f * 0.55, y, z: cz + q.uz * a + nz * f * 0.55, yaw: Math.atan2(nx * f, nz * f), h: 0.46, kind: 'bench', group: -1 });
              nSeat++;
            }
            // a planter off the run's first bench end
            if (first) {
              const px = cx - q.ux * (L / 2 + 1.6), pz = cz - q.uz * (L / 2 + 1.6);
              if (onP(px, pz) && fits(px, pz, q.ux, q.uz, 1.1, 0.55)) { const py = yAt(px, pz); put('planter', px, pz, Math.atan2(q.ux, q.uz), py); put('shrub', px, pz, Math.atan2(q.ux, q.uz), py); box(px, py, pz, q.ux, q.uz, 1.1, 0.55, 0.9); }
            }
          }
          s += L;
          placed = true; first = false;
          break;
        }
        // the gap: two cafe tables, three chairs each, facing the table
        const gq = at(s + 3.5), gnx = -gq.uz, gnz = gq.ux;
        for (const da of [-1.6, 1.6]) {
          const tx = gq.x + gnx * off + gq.ux * da, tz = gq.z + gnz * off + gq.uz * da;
          if (!onP(tx, tz) || !fits(tx, tz, gq.ux, gq.uz, 0.95, 0.95)) continue;
          if (!inTile(tx, tz)) continue;
          const ty = yAt(tx, tz), grp = seats.length;
          put('table', tx, tz, 0, ty);
          box(tx, ty, tz, gq.ux, gq.uz, 0.95, 0.95, 0.37);   // the table and its chairs: walkers go round the group
          for (let c = 0; c < 3; c++) {
            const ang = (c / 3) * Math.PI * 2 + (da > 0 ? 0.5 : 0.1);
            const chx = tx + Math.sin(ang) * 0.66, chz = tz + Math.cos(ang) * 0.66, face = ang + Math.PI;   // facing the table, pulled in
            put('chair', chx, chz, face, ty);
            seats.push({ x: chx, y: ty, z: chz, yaw: face, h: 0.452, kind: 'chair', group: grp, tx, tz });   // h: the seat's top
            nSeat++;
          }
        }
        s += placed ? 7 : 2;
      }
    }
  }
  // one instanced mesh per kind
  const kinds = { bench12: M.granite, bench9: M.granite, benchTop12: M.wood, benchTop9: M.wood, bollard: M.steel, table: M.red, chair: M.red, planter: M.planter, shrub: M.shrub };
  let n = 0;
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  for (const [k, L] of Object.entries(lists)) {
    if (!L.length) continue;
    const im = new THREE.InstancedMesh(G[k], kinds[k], L.length);
    L.forEach(([x, y, z, yaw], i) => { q4.setFromAxisAngle(up, yaw); m4.compose(v3.set(x, y, z), q4, one); im.setMatrixAt(i, m4); });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = true; im.receiveShadow = true;
    im.name = 'tf31:' + k;
    group.add(im);
    n += L.length;
  }
  if (typeof window !== 'undefined') window.__TF31 = { seats: tpSeats().length, pieces: n };
  tf32Build(group, roadsW, yAt, inTile, onP, fits, box, lists);
  return n;
}

// ---- TF32 (owner 2026-09-29: "not enough details ... Add more details to Times Square and add daytime shots using
// proper references"): the Square's street pieces after the Wikimedia Commons photographs listed in
// docs/notes/tsq-graphics.md (TF32), built by city/tsqKit.js. The recruiting station with its neon flag stands on the
// 43rd St island on its own footprint (tile -3_5 building 59, which drew as a brick two-floor tenement box and is no
// longer built); Father Duffy with his Celtic cross 4.6 m before the red steps' foot, facing down the Square, the red
// ticket signs either side of the foot, George M. Cohan at the island's south end; the subway canopy on the plaza at
// 42nd St; at each plaza block's north end a red kiosk with a poster cube beside it and a food cart, in the bench line
// (where TF31's pieces leave room, up to 10 m back), a pair of solar compactor bins and a street kiosk at its south
// end; the Kestrel Theatre's marquee on 1515 Broadway's Seventh Avenue frontage (building 21 e9), under its screen
// stack. Walker obstacles as TF31.
// `?tf32=0` leaves them out and builds building 59 again (so does `?tf31=0`).
export const TF32 = TF31 && !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('tf32') === '0');
const ST32 = { ring: [[-1264.4, 2914.1], [-1260.7, 2915.6], [-1265.3, 2928.1], [-1270.9, 2925.3]], c: [-1265.3, 2920.8] };
// the frontage props the compiler hung on building 59 (its awnings: FURN.AWNING, and any FURN.MARQUEE) stay in the tile's
// furniture when tpSkipBuilding drops the building, and float in front of the station's flag at 3-4.5 m (probe
// t3DayFlag_day_0): the assembler's furniture loop asks here, as it asks namedShopZone for the named shop fronts
export function tpDropFrontage(x, z) {
  return TF32 && Math.hypot(x - ST32.c[0], z - ST32.c[1]) < 9.5;
}
const MQ32 = { a: [-1229.8, 2798.3], b: [-1253.6, 2841.8], n: [0.88, 0.48], w: 16 };
function tf32Build(group, roadsW, yAt, inTile, onP, fits, box, lists) {
  if (!TF32) return 0;
  const P = [], got = {};
  // TF31's pieces as obstacles (benches as capsules along their yaw, the cafe groups and planters as discs): the gap
  // tables after a run's last bench can reach within 1 m of the block's end, so a slot is taken only where it is clear
  const obs = [];
  for (const [k, L] of Object.entries(lists)) for (const [x, , z, yaw] of L) {
    if (k === 'bench12' || k === 'bench9') obs.push([x, z, Math.sin(yaw), Math.cos(yaw), k === 'bench12' ? 6 : 4.5, 0.8]);
    else if (k === 'table' || k === 'planter' || k === 'bollard') obs.push([x, z, 0, 0, 0, k === 'table' ? 1.3 : k === 'planter' ? 1.3 : 0.25]);
  }
  const clear = (cx, cz, ux, uz, hl, hw2) => {
    const nx = -uz, nz = ux;
    for (const [ox, oz, dx, dz, hL, r] of obs) {
      if (Math.abs(ox - cx) > hl + hw2 + hL + r + 1 || Math.abs(oz - cz) > hl + hw2 + hL + r + 1) continue;
      for (const a of [-hl, 0, hl]) for (const b of [-hw2, 0, hw2]) {
        const px = cx + ux * a + nx * b - ox, pz = cz + uz * a + nz * b - oz, t = Math.max(-hL, Math.min(hL, px * dx + pz * dz));
        if (Math.hypot(px - dx * t, pz - dz * t) < r + 0.3) return false;
      }
    }
    return true;
  };
  const add = (k, parts, x, y, z, fx, fz) => { P.push({ parts, place: frameAt(x, y, z, fx, fz) }); got[k] = (got[k] || 0) + 1; };
  // the station, in world coordinates on its footprint; its obstacle along the long edge e1 (13.3 m), 5.2 m across
  const [scx, scz] = ST32.c;
  if (inTile(scx, scz)) {
    const y = yAt(scx, scz), [p1, p2] = [ST32.ring[1], ST32.ring[2]], L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    P.push({ parts: station(ST32.ring, y), place: null }); got.station = 1;
    box(scx, y, scz, (p2[0] - p1[0]) / L, (p2[1] - p1[1]) / L, 6.7, 2.6, 2.3);
  }
  // Duffy Square: s up the steps' axis from their centre, t across (east); the island is 12-27 m wide from s -54 to 13
  const [dcx, dcz] = DUFFY.c, [ax, az] = DUFFY.a, bx = -az, bz = ax;
  const isl = (s, t) => [dcx + ax * s + bx * t, dcz + az * s + bz * t];
  const inIsl = (s, t, r) => [[0, 0], [r, r], [r, -r], [-r, r], [-r, -r]].every(([ds, dt]) => tpInIsland(...isl(s + ds, t + dt)));
  if (inTile(dcx, dcz)) {
    const foot = -(DUFFY.run + DUFFY.land) / 2;
    let [x, z] = isl(foot - 4.6, 0.75);
    if (inIsl(foot - 4.6, 0.75, 1.6)) { const y = yAt(x, z); add('duffy', duffyMonument(), x, y, z, -ax, -az); box(x, y, z, ax, az, 1.5, 1.3, 3.1); }
    for (const sd of [-1, 1]) {
      const t = sd * (DUFFY.halfW + 0.7);
      [x, z] = isl(foot - 0.6, t);
      if (inIsl(foot - 0.6, t, 0.6)) { const y = yAt(x, z); add('totem', ticketTotem(), x, y, z, -ax, -az); box(x, y, z, ax, az, 0.16, 0.5, 1.6); }
    }
    // Cohan: the southmost s where the island is still 13 m wide, centred across it, 3 m in
    let cp = null;
    for (let s = foot - 20; s > -70; s -= 1) {
      let t0 = null, t1 = null;
      for (let t = -25; t <= 25; t += 0.5) if (tpInIsland(...isl(s, t))) { if (t0 === null) t0 = t; t1 = t; }
      if (t0 === null || t1 - t0 < 13) break;
      cp = [s + 3, (t0 + t1) / 2];
    }
    if (cp && inIsl(cp[0], cp[1], 3)) { [x, z] = isl(cp[0], cp[1]); const y = yAt(x, z); add('cohan', cohanMonument(), x, y, z, -ax, -az); box(x, y, z, ax, az, 3.0, 3.0, 1.9); }
  }
  // the plaza blocks, 42nd (0) to 46th (4) by where each Broadway piece starts
  for (const r of roadsW) {
    if (!r.noTraffic || r.level > 0 || r.pts.length < 2 || !/BROADWAY/.test(r.name || '')) continue;
    if (!r.pts.some((p) => p[0] > BOX.x0 && p[0] < BOX.x1 && p[2] > BOX.z0 && p[2] < BOX.z1)) continue;
    const hw = r.width / 2;
    if (hw < 5.5) continue;
    const st = [];                                  // stations every metre along the centre line, as TF31's
    for (let k = 0; k < r.pts.length - 1; k++) {
      const A = r.pts[k], Bp = r.pts[k + 1], dx = Bp[0] - A[0], dz = Bp[2] - A[2], L = Math.hypot(dx, dz);
      if (L < 1e-3) continue;
      for (let t = 0; t < L; t += 1) st.push({ x: A[0] + (dx / L) * t, z: A[2] + (dz / L) * t, ux: dx / L, uz: dz / L });
    }
    if (st.length < 50) continue;
    const Lt = st.length - 1, at = (s) => st[Math.max(0, Math.min(Lt, Math.round(s)))];
    const blk = Math.round((3032.1 - r.pts[0][2]) / 80);
    // a piece at (s, t) on this block, its front toward the centre line (or `face`), its footprint hl along, hw2 across
    // (the first of the stations `ss` where it fits the plaza and is clear of TF31 and of what this block has placed)
    const mine = [];
    const place = (k, parts, ss, t, hl, hw2, hh, face = null) => {
      for (const s of ss) {
        const q = at(s), nx = -q.uz, nz = q.ux, cx = q.x + nx * t, cz = q.z + nz * t;
        if (!inTile(cx, cz) || !fits(cx, cz, q.ux, q.uz, hl, hw2) || !clear(cx, cz, q.ux, q.uz, hl, hw2)) continue;
        if (mine.some(([mx, mz, mr]) => Math.hypot(mx - cx, mz - cz) < mr + Math.hypot(hl, hw2) + 0.3)) continue;
        const [fx, fz] = face ? face(q) : t > 0 ? [-nx, -nz] : [nx, nz];
        const y = yAt(cx, cz);
        add(k, parts, cx, y, cz, fx, fz);
        box(cx, y, cz, q.ux, q.uz, hl, hw2, hh);
        mine.push([cx, cz, Math.hypot(hl, hw2)]);
        return;
      }
    };
    const off = hw - 1.9, north = Array.from({ length: 21 }, (_, i) => Lt - 3.3 - i * 0.5);   // from the block's end back 10 m
    const plan = [
      { kiosk: 0, cart: 1, bins: -1 },
      { kiosk: -1, cart: 1, bins: 1 },
      { kiosk: 1, cart: -1, bins: -1 },
      { kiosk: -1, cart: 1, bins: 1 },     // r10: the red kiosk on the west side, 45th-46th
      { kiosk: 1, cart: -1, bins: -1 },
    ][Math.max(0, Math.min(4, blk))];
    if (plan.kiosk) place('kiosk', redKiosk(), north, plan.kiosk * off, 1.3, 0.9, 1.4);
    if (plan.cart) place('cart', foodCart(), north, plan.cart * off, 0.95, 0.45, 0.9);
    if (plan.kiosk) place('cube', posterCube(blk), north.map((s) => s - 3.4), plan.kiosk * off, 0.68, 0.68, 1.05);   // r10: a poster cube by the kiosk
    for (const s of [2.6, 3.4]) place('bin', compactor(), [s, s + 1.6, s + 3.2], plan.bins * off, 0.32, 0.32, 0.64);
    // a street kiosk (a 2.9 m pillar, a lit screen each side, facing along the plaza) opposite the bins
    place('link', streetKiosk(), [3.0, 4.6, 6.2, 7.8], -plan.bins * off, 0.17, 0.5, 1.45, (q) => [q.ux, q.uz]);
    // the subway canopy on the 42nd-43rd block (r16, r22), open toward 42nd St, between the promenade's two centre lanes
    if (blk === 0) place('subway', subwayEntrance(), [14, 16, 18], 0, 2.55, 1.55, 1.5, (q) => [-q.ux, -q.uz]);
  }
  // the marquee, centred on the frontage, its foot 2.35 m over the pavement in front of the wall: its top (3.95 m) stays
  // under the brackets of the stack's catwalk (billboards.js TF32, 4.1-4.5 m over the building's base)
  {
    const [a, b] = [MQ32.a, MQ32.b], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, [nx, nz] = MQ32.n;
    if (inTile(mx, mz)) add('marquee', marquee(MQ32.w, 2.2), mx, yAt(mx + nx * 1.2, mz + nz * 1.2) + 2.35, mz, nx, nz);
  }
  const n = P.length ? addPieces(group, P, 'tf32') : 0;
  if (typeof window !== 'undefined') window.__TF32 = { ...(window.__TF32 || {}), ...got, meshes: n };
  return n;
}

// ---- Duffy Square (46th-47th St, between Broadway and Seventh Avenue) --------------------------------------------------
// The compiled island is an NYC Parks lawn strip; the real one is paved like the rest of the plaza and carries the TKTS
// booth under its red steps (2008): 27 red glass steps rising north to 4.9 m, seats for the view down the bowtie, the
// risers lit red from inside. The island's grass goes to the plaza pavers (tpApply), and the steps are built here, on the
// booth's own footprint (tile -3_5 building 93: a 17.4 m wedge, 10.5 m wide at the south end and 14.5 m at the north,
// 4.9 m tall, its axis between Broadway's and Seventh Avenue's), which the assembler no longer builds as a shop box.
const DUFFY = { c: [-1157.65, 2661.15], a: [0.374, -0.927], halfW: 5.75, run: 13.5, land: 3.9, n: 27, top: 4.9 };
// buildings that are not there: the booth (its footprint carries the steps) and the 3 m storefront box the footprints put
// on the Broadway plaza between 46th and 47th (centroid -1179.2, 2671.5)
export function tpSkipBuilding(cx, cz, h, area) {
  if (!TP28 || h > 6 || area > 400) return false;
  if (TF32 && Math.hypot(cx - ST32.c[0], cz - ST32.c[1]) < 2.5) return true;   // TF32: the recruiting station is built instead
  return Math.hypot(cx - DUFFY.c[0], cz - DUFFY.c[1]) < 3 || Math.hypot(cx + 1179.2, cz - 2671.5) < 2.5;
}
export function tpDuffyIn(x, z) {
  const dx = x - DUFFY.c[0], dz = z - DUFFY.c[1];
  return Math.hypot(dx, dz) < 32;
}
// The island itself, 46th to 47th between the Broadway plaza and Seventh Avenue: inside all four street lines (the
// compiled centre lines, each moved out by its half width), on the side of each that holds the booth. Its concrete walk
// goes to the pavers too, so the whole square is one surface (the lawn strip alone read as a dark carpet on a pale walk).
const ISLAND = (() => {
  const L = [
    [[-1191.9, 2711.4], [-1172.4, 2633.8], 9.15],   // Broadway (the plaza's east edge)
    [[-1167.5, 2724.7], [-1139.7, 2671.6], 7.6],    // Seventh Avenue (its west kerb)
    [[-1131.2, 2655.2], [-1166.2, 2635.7], 4.55],   // W 47th St (its south kerb)
    [[-1167.5, 2724.7], [-1191.9, 2711.4], 5.2],    // W 46th St (its north kerb)
  ];
  const [bx, bz] = DUFFY.c;
  return L.map(([a, b, hw]) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
    const sd = (x, z) => (x - a[0]) * -uz + (z - a[1]) * ux;          // signed distance from the centre line
    const side = Math.sign(sd(bx, bz));
    return (x, z) => side * sd(x, z) > hw;
  });
})();
export function tpInIsland(x, z) {
  return Math.hypot(x - DUFFY.c[0], z - DUFFY.c[1]) < 60 && ISLAND.every((f) => f(x, z));
}
export function tpStepsOwner(ox, oz) {
  return TP28 && DUFFY.c[0] >= ox && DUFFY.c[0] < ox + 512 && DUFFY.c[1] >= oz && DUFFY.c[1] < oz + 512;
}
let _stepMats = null;
const TKY = { value: new THREE.Vector2(0, 1) };   // TQ32: the steps' ground height and rise, for the risers' backlight
function stepMats() {
  if (_stepMats) return _stepMats;
  // the risers: red glass lit from behind, a light source after dark (the board material's night lift, redder)
  const riser = new THREE.MeshBasicMaterial({ color: 0xa00b08 });
  riser.onBeforeCompile = (sh) => {
    sh.uniforms.bbNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float bbNight;')
      .replace('#include <fog_fragment>', 'gl_FragColor.rgb *= mix(0.55, 2.2, bbNight);\n#include <fog_fragment>');
  };
  riser.customProgramCacheKey = () => 'tkts-riser';
  // the treads and the sides: dark red glass, glossy
  const tread = LT(new THREE.MeshStandardMaterial({ color: 0x5a0a08, roughness: 0.16, metalness: 0.0, emissive: 0x3a0402, emissiveIntensity: 0.0 }));
  tread.onBeforeCompile = (sh) => {
    sh.uniforms.bbNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float bbNight;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.30, 0.012, 0.008) * bbNight;');
  };
  tread.customProgramCacheKey = () => 'tkts-tread';
  const steel = LT(new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.35, metalness: 0.85 }));
  const booth = new THREE.MeshBasicMaterial({ color: 0xf2efe6 });   // the lit ticket windows on the north face
  booth.onBeforeCompile = (sh) => {
    sh.uniforms.bbNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float bbNight;')
      .replace('#include <fog_fragment>', 'gl_FragColor.rgb *= mix(0.9, 2.2, bbNight);\n#include <fog_fragment>');
  };
  booth.customProgramCacheKey = () => 'tkts-booth';
  // TQ32 (owner 2026-09-29, teaser 3: "the materials need to be PBR ... It seems rather unlit and basic"): the unlit flat
  // red above read as painted planes in t3DayDuffy. The risers are red glass lit from behind (r01, r04): a glossy face
  // that mirrors the sky and catches the sun by day (applySkyGlass), over the backlight, brightest at each riser's foot
  // where the LED strip is and dimmer toward the nosing shadow; the same levels by night. `?tq32=0` keeps the flat red.
  if (TQ32) {
    const r2 = new THREE.MeshStandardMaterial({ color: 0x160202, roughness: 0.07, metalness: 0.0, emissive: 0xa00b08 });
    r2.onBeforeCompile = (sh) => {
      sh.uniforms.bbNight = ENV.night;
      sh.uniforms.tkY = TKY;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vTkY;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTkY = (modelMatrix * vec4(transformed, 1.0)).y;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float bbNight; uniform vec2 tkY; varying float vTkY;')
        .replace('#include <emissivemap_fragment>', `{
          float fy = fract((vTkY - tkY.x) / max(tkY.y, 0.01));
          float glow = mix(1.3, 0.74, smoothstep(0.0, 0.8, fy)) * (1.0 - 0.3 * smoothstep(0.88, 1.0, fy));
          totalEmissiveRadiance *= glow * mix(0.55, 2.2, bbNight);
        }
        #include <emissivemap_fragment>`);
    };
    r2.customProgramCacheKey = () => 'tkts-riser-tq32';
    applySkyGlass(r2, { f0: 0.05, tint: [1.0, 0.94, 0.94], rough: 0.04, aureole: 1.2 });
    _stepMats = { riser: r2, tread, steel, booth };
  }
  if (_stepMats) return _stepMats;
  return (_stepMats = { riser, tread, steel, booth });
}
// the steps into `group` (world coords), standing on the ground at height y0
export function tpBuildSteps(group, y0) {
  if (!TP28) return;
  const M = stepMats();
  const [cx, cz] = DUFFY.c, [ax, az] = DUFFY.a, bx = -az, bz = ax;   // a: up the steps (north), b: across (east)
  const W = DUFFY.halfW, n = DUFFY.n, dRun = DUFFY.run / n, dRise = DUFFY.top / n, s0 = -(DUFFY.run + DUFFY.land) / 2;
  const P = (s, t, y) => [cx + ax * s + bx * t, y0 + y, cz + az * s + bz * t];
  TKY.value.set(y0, dRise);   // TQ32
  const rise = [], tread = [], steel = [], booth = [];
  // a quad (A, B, C, D counter-clockwise seen from its front) as two triangles
  const quad = (arr, A, B, C, D) => arr.push(...A, ...B, ...C, ...A, ...C, ...D);
  for (let i = 0; i < n; i++) {
    const sA = s0 + i * dRun, sB = sA + dRun, yL = i * dRise, yH = (i + 1) * dRise;
    // riser: the vertical face at sA from yL to yH, facing south (-a)
    quad(rise, P(sA, -W, yL), P(sA, W, yL), P(sA, W, yH), P(sA, -W, yH));
    // tread: the horizontal face at yH from sA to sB, facing up
    quad(tread, P(sA, -W, yH), P(sA, W, yH), P(sB, W, yH), P(sB, -W, yH));
  }
  // the top landing, over the booth's north end
  const sL = s0 + DUFFY.run, sT = sL + DUFFY.land, yT = DUFFY.top;
  quad(tread, P(sL, -W, yT), P(sL, W, yT), P(sT, W, yT), P(sT, -W, yT));
  quad(tread, P(sL, W, 0), P(sT, W, 0), P(sT, W, yT), P(sL, W, yT));
  quad(tread, P(sT, -W, 0), P(sL, -W, 0), P(sL, -W, yT), P(sT, -W, yT));
  // the two sides: the sawtooth profile, a strip per step down to the ground (east side faces +b, west side faces -b)
  for (let i = 0; i < n; i++) {
    const sA = s0 + i * dRun, sB = sA + dRun, yH = (i + 1) * dRise;
    quad(tread, P(sA, W, 0), P(sB, W, 0), P(sB, W, yH), P(sA, W, yH));
    quad(tread, P(sB, -W, 0), P(sA, -W, 0), P(sA, -W, yH), P(sB, -W, yH));
  }
  // the north face (the booth): a dark glass wall with a band of lit ticket windows
  quad(tread, P(sT, W, 0), P(sT, -W, 0), P(sT, -W, yT), P(sT, W, yT));
  for (let k = 0; k < 6; k++) {
    const t0 = -W + 0.7 + k * ((2 * W - 1.4) / 6), t1 = t0 + (2 * W - 1.4) / 6 - 0.35;
    quad(booth, P(sT + 0.02, t1, 1.05), P(sT + 0.02, t0, 1.05), P(sT + 0.02, t0, 2.35), P(sT + 0.02, t1, 2.35));
  }
  // glass balustrades read as their steel: a handrail 1.0 m over the nosings each side, posts every 4 steps
  const bar = (A, B, r) => {
    const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], L = Math.hypot(dx, dy, dz);
    const g = new THREE.BoxGeometry(r, r, L).toNonIndexed();
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(dx, dy, dz), new THREE.Vector3(0, 1, 0));
    m.setPosition((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2);
    g.applyMatrix4(m);
    steel.push(...g.getAttribute('position').array);
  };
  for (const t of [W - 0.08, -W + 0.08]) {
    bar(P(s0, t, 1.0 + dRise), P(sL, t, yT + 1.0), 0.06);
    bar(P(sL, t, yT + 1.0), P(sT, t, yT + 1.0), 0.06);
    for (let i = 0; i <= n; i += 4) { const s = s0 + Math.min(i, n) * dRun; bar(P(s, t, Math.min(i + 1, n) * dRise), P(s, t, Math.min(i + 1, n) * dRise + 1.0), 0.05); }
  }
  const mk = (arr, mat, name, shadow) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.name = name; m.castShadow = shadow; m.receiveShadow = true;
    group.add(m);
  };
  mk(rise, M.riser, 'tp28:tktsRisers', false);
  mk(tread, M.tread, 'tp28:tktsSteps', true);
  mk(steel, M.steel, 'tp28:tktsRails', true);
  mk(booth, M.booth, 'tp28:tktsWindows', false);
  if (typeof window !== 'undefined') window.__TKTS = { c: DUFFY.c, y0 };
}
