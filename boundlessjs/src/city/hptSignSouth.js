// AR34 b5 (HPT): Gantry Plaza State Park's ground south of the gantries' slip, between the curved walkway and the LIC Greenway
// (Center Boulevard's wide west walk). The compiled city drew it as bare terrain (tile 1_8, 2_8: no section between the greenway's
// sidewalk and the river;
// (2022-02, h22 / h297) show planted beds of grasses and shrubs, lawns, the park's paths and its Central Park lamps.
// Laid as the tile's own sections before anything samples the ground (hptSign.js apply), so the walkers, the furniture and the
// camera stand on them:
// * lawns and beds: OpenStreetMap landuse=grass / natural=scrub / natural=wetland ways (ODbL, (c) OpenStreetMap contributors;
// Overpass 2026-10-02), the beds as grassU;
// * the rest of the land between the greenway and the river as planted beds (grassU): 2 m cells where the shore-applied
// terrain is the park's level (>= 3.0) at all four corners (so no bed reaches the river's slope), behind the wall where it
// * the park's paths: OSM highway=footway ways 1213322046, 1210162928, 696508285, 1210162927 at 1.25 m half width (NOT measured);
// and built (buildSouth): Central Park lamps along the inner path;
// the greenway's west wall: split-face grey-pink granite in two courses under a flamed coping, 0.86 m over the walk, 10 m north-west
// ar33-hpt.md batch 5): the coping's top lies (lens - top) = 0.17 x its distance off the line in both (h297 at both frame edges:
// 0.166 and 0.177; h22 at the left edge: 0.171), so with the 2023-24 rig's lens 2.76 m over the walk and the wall 0.85 m tall
// it stands 10-11 m off; the walk between is laid as sidewalk.
// Its ends are NOT measured.
// `?hpso=0` leaves the compiled ground.
import * as THREE from 'three';
import { Builder } from './hptSignSteel.js';
import { hmat } from './hptSignMats.js';
import { buildLamps } from './hptSignPark.js';

export const SOUTH = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('hpso') === '0');

// (980.7, 4375.4) to (1049.0, 4310.6); s along it (north-east), p to its north-west (the park side)
const GX = 1008.21, GZ = 4348.35, GL = Math.hypot(1049.0 - 980.7, 4310.6 - 4375.4);
const DX = (1049.0 - 980.7) / GL, DZ = (4310.6 - 4375.4) / GL, NX = DZ, NZ = -DX;   // N = (-0.688, -0.726): north-west
const sp = (x, z) => [(x - GX) * DX + (z - GZ) * DZ, (x - GX) * NX + (z - GZ) * NZ];
const BED = { s0: -32, s1: 50, p0: 3.0, p1: 45, cell: 2.0 };
// the greenway's west wall (s range, p of its walk-side face, thickness, course heights, coping) and the walk up to it
const WALL = { s0: -16, s1: 40, p: 10.0, t: 0.45, courses: [0.36, 0.34], cope: 0.16, over: 0.03 };
const at = (s, p) => [GX + DX * s + NX * p, GZ + DZ * s + NZ * p];
const inWall = (s) => s >= WALL.s0 - 0.5 && s <= WALL.s1 + 0.5;

export const S_LAWNS = [
  [1213322038, 'lawn', [[1002.0, 4355.2], [1006.0, 4358.3], [996.7, 4366.9], [994.1, 4369.9], [991.9, 4373.0], [987.4, 4372.2], [985.1, 4375.1], [983.9, 4375.0], [991.4, 4365.1], [993.9, 4362.8]]],
  [1213322033, 'lawn', [[982.3, 4379.0], [980.8, 4378.6], [968.7, 4399.3], [961.8, 4412.2], [959.4, 4417.0], [960.1, 4417.4], [958.3, 4420.9], [957.4, 4420.4], [955.8, 4423.6], [956.8, 4424.1], [955.1, 4427.4], [954.1, 4426.8], [951.2, 4432.5], [956.8, 4433.9], [964.5, 4413.6], [970.6, 4400.3]]],
  [1213322039, 'bed', [[966.6, 4383.4], [968.5, 4383.8], [969.9, 4375.3], [968.6, 4375.1]]],
  [1213322040, 'bed', [[970.4, 4371.6], [969.6, 4371.4], [972.3, 4361.8], [972.9, 4361.8], [973.0, 4361.5], [973.9, 4361.7]]],
  [1213322041, 'bed', [[983.0, 4364.1], [980.6, 4373.3], [986.8, 4365.0]]],
];
export const S_PATHS = [
  [1213322046, 1.25, [[1031.6, 4297.3], [1025.1, 4299.8], [1019.9, 4302.5], [1014.7, 4307.1], [1010.7, 4311.1], [1008.5, 4313.9], [1004.8, 4322.2], [1002.6, 4329.2], [1002.1, 4333.2], [1000.2, 4337.6], [994.3, 4341.9], [992.8, 4343.1], [979.7, 4354.0], [977.9, 4358.8], [974.6, 4364.4], [970.9, 4381.0], [970.1, 4392.0]]],
  [1210162928, 1.25, [[985.1, 4361.1], [986.3, 4357.6], [989.2, 4353.8], [993.6, 4350.9], [997.5, 4348.9], [1000.2, 4337.6]]],
  [696508285, 1.25, [[1002.1, 4333.2], [1012.7, 4335.7], [1017.9, 4337.3]]],
  [1210162927, 1.25, [[1016.4, 4320.5], [1008.5, 4313.9]]],
];
// lamps: the inner path's straight runs [x0, z0, x1, z1, half width]
const S_LAMP_WALKS = [[1025.1, 4299.8, 1008.5, 4313.9, 2.2], [1008.5, 4313.9, 1000.2, 4337.6, 2.2], [1000.2, 4337.6, 979.7, 4354.0, 2.2]];

// the shore-applied terrain under a world point (the tile's own grid, as streamer.terrainAt splits its cells)
function terrY(tile, ox, oz, x, z) {
  const res = tile.header.res, n = res + 1, cw = 512 / res, g = tile.S.terrain;
  const fx = (x - ox) / cw, fz = (z - oz) / cw;
  if (fx < 0 || fz < 0 || fx > res || fz > res) return NaN;
  const i = Math.min(res - 1, Math.floor(fx)), j = Math.min(res - 1, Math.floor(fz)), u = fx - i, v = fz - j;
  const y00 = g[j * n + i], y10 = g[j * n + i + 1], y01 = g[(j + 1) * n + i], y11 = g[(j + 1) * n + i + 1];
  return u >= v ? y00 + (y10 - y00) * u + (y11 - y10) * v : y00 + (y01 - y00) * v + (y11 - y01) * u;
}
const quad = (a, b, c, d) => [[a, b, c], [a, c, d]];
// a polyline as a strip of quads (half width hw) with a square at each joint
function stripTris(pts, hw) {
  const T = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 1e-3) continue;
    const nx = -(z1 - z0) / L * hw, nz = (x1 - x0) / L * hw;
    T.push(...quad([x0 + nx, z0 + nz], [x1 + nx, z1 + nz], [x1 - nx, z1 - nz], [x0 - nx, z0 - nz]));
  }
  for (let i = 1; i + 1 < pts.length; i++) { const [x, z] = pts[i], h = hw * 0.98; T.push(...quad([x - h, z - h], [x + h, z - h], [x + h, z + h], [x - h, z + h])); }
  return T;
}
let _paths = null;
export function southPathTris() { return _paths || (_paths = S_PATHS.flatMap(([, hw, pts]) => stripTris(pts, hw))); }

// the bed cells in this tile (needs the shore-applied terrain: call after shoreApply)
export function southBedTris(tile, ox, oz) {
  if (!SOUTH || !tile.S.terrain) return [];
  const T = [], c = BED.cell;
  // the box's world bounds from its s / p corners
  const cs = [[BED.s0, BED.p0], [BED.s1, BED.p0], [BED.s0, BED.p1], [BED.s1, BED.p1]].map(([s, p]) => [GX + DX * s + NX * p, GZ + DZ * s + NZ * p]);
  const x0 = Math.max(ox, Math.floor(Math.min(...cs.map((q) => q[0])) / c) * c), x1 = Math.min(ox + 512, Math.max(...cs.map((q) => q[0])));
  const z0 = Math.max(oz, Math.floor(Math.min(...cs.map((q) => q[1])) / c) * c), z1 = Math.min(oz + 512, Math.max(...cs.map((q) => q[1])));
  for (let x = x0; x < x1; x += c) for (let z = z0; z < z1; z += c) {
    const [s, p] = sp(x + c / 2, z + c / 2);
    if (s < BED.s0 || s > BED.s1 || p < (inWall(s) ? WALL.p + WALL.t : BED.p0) || p > BED.p1) continue;
    let ok = true;
    for (const [a, b] of [[x, z], [x + c, z], [x + c, z + c], [x, z + c]]) { const y = terrY(tile, ox, oz, a, b); if (!(y >= 3.0)) { ok = false; break; } }
    if (ok) T.push(...quad([x, z], [x + c, z], [x + c, z + c], [x, z + c]));
  }
  return T;
}

// the walk from the greenway's line to the wall (sidewalk), and a bed strip along the wall's back so no bare cell edge shows there
// (in 2 m pieces along s, so each triangle lies in the tile that holds its centroid)
const band = (p0, p1) => { const T = []; for (let s = WALL.s0; s < WALL.s1 - 1e-6; s += 2) { const s1 = Math.min(WALL.s1, s + 2); T.push(...quad(at(s, p0), at(s1, p0), at(s1, p1), at(s, p1))); } return T; };
export function southWalkTris() { return SOUTH ? band(-1.0, WALL.p + 0.05) : []; }
export function southWallBedTris() { return SOUTH ? band(WALL.p + 0.2, WALL.p + 3.0) : []; }

const hsh = (i, k) => { let h = (i * 374761393 + k * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// a box in the wall's frame (s along, p across, y up) with UVs in metres from the wall's own coordinates, so the tiling set
// does not repeat block to block
function wallBox(B, s0, s1, p0, p1, y0, y1) {
  const V = (s, p, y) => { const [x, z] = at(s, p); return new THREE.Vector3(x, y, z); };
  const nS = new THREE.Vector3(DX, 0, DZ), nP = new THREE.Vector3(NX, 0, NZ), nY = new THREE.Vector3(0, 1, 0);
  // (s, p, y) is a left-handed frame here (D x N = up), so each quad is wound d-c-b-a to face along its normal
  const q = (a, b, c, d, n, ua, ub, uc, ud) => { B.tri(a, c, b, n, n, n, ua, uc, ub); B.tri(a, d, c, n, n, n, ua, ud, uc); };
  // walk side (-p) and back (+p), u = s, v = y
  q(V(s1, p0, y0), V(s0, p0, y0), V(s0, p0, y1), V(s1, p0, y1), nP.clone().negate(), [s1, y0], [s0, y0], [s0, y1], [s1, y1]);
  q(V(s0, p1, y0), V(s1, p1, y0), V(s1, p1, y1), V(s0, p1, y1), nP, [s0, y0], [s1, y0], [s1, y1], [s0, y1]);
  // top (u = s, v = p) and the two ends (u = p, v = y)
  q(V(s0, p0, y1), V(s0, p1, y1), V(s1, p1, y1), V(s1, p0, y1), nY, [s0, p0], [s0, p1], [s1, p1], [s1, p0]);
  q(V(s0, p0, y0), V(s0, p1, y0), V(s0, p1, y1), V(s0, p0, y1), nS.clone().negate(), [p0, y0], [p1, y0], [p1, y1], [p0, y1]);
  q(V(s1, p1, y0), V(s1, p0, y0), V(s1, p0, y1), V(s1, p1, y1), nS, [p1, y0], [p0, y0], [p0, y1], [p1, y1]);
}
// the wall: a mortar core, block courses (1.15-1.6 m, 18 mm joints, each face 0-15 mm proud for the split face), the coping in 1.8 m stones
export function wallGeo(y) {
  const blocks = new Builder(), core = new Builder(), cope = new Builder();
  const { s0, s1, p, t, courses } = WALL;
  const top = y + courses.reduce((a, b) => a + b, 0);   // the courses' top, 0.70 m over the walk (the coping's 0.86)
  wallBox(core, s0 + 0.01, s1 - 0.01, p + 0.025, p + t - 0.025, y - 0.12, top);   // the mortar 25 mm back from both faces (b5_e at 1:1: 10 mm joints did not read)
  let yc = y;
  courses.forEach((h, k) => {
    const y0 = k === 0 ? y - 0.12 : yc + 0.009, y1 = yc + h - 0.009;   // the first course runs 0.12 m under the walk; 18 mm bed joints
    let s = s0, i = 0;
    while (s < s1 - 0.05) {
      const L = Math.min(s1 - s, 1.15 + 0.45 * hsh(i, k * 7 + 1)), pr = 0.015 * hsh(i, k * 7 + 3), pb = 0.012 * hsh(i, k * 7 + 5);
      wallBox(blocks, s + (s === s0 ? 0 : 0.009), s + L - (s + L >= s1 - 1e-6 ? 0 : 0.009), p - pr, p + t + pb, y0, y1);   // 18 mm head joints
      s += L; i++;
    }
    yc += h;
  });
  for (let s = s0; s < s1 - 0.05; s += 1.8) wallBox(cope, s + (s === s0 ? 0 : 0.003), Math.min(s1, s + 1.8) - 0.003, p - WALL.over, p + t + WALL.over, top, top + WALL.cope);
  return { blocks, core, cope, top };
}

// the rip-rap: granite rocks over the shore's slope south of the walkway.
// Rocks stand where the shore-applied terrain is between the water (-0.6) and the park's level (3.0) inside the box; their
// sizes and spacing are NOT measured. A rock: a jittered, flattened icosahedron, half sunk.
const RIP = { x0: 935, x1: 1012, z0: 4311, z1: 4352, step: 0.45, weedY: 0.95 };
function rockInto(B, x, y, z, r, seed) {
  const g = new THREE.IcosahedronGeometry(1, 0), P = g.attributes.position;   // 20 faces: angular quarry stone (b5_d: detail 1 read as round cobbles)
  const fl = 0.55 + 0.25 * hsh(seed, 11), rot = hsh(seed, 13) * Math.PI * 2, c = Math.cos(rot), sn = Math.sin(rot);
  const ax = 0.8 + 0.4 * hsh(seed, 17), az = 0.8 + 0.4 * hsh(seed, 19);
  const v = [];
  for (let i = 0; i < P.count; i++) {
    const px = P.getX(i), py = P.getY(i), pz = P.getZ(i);
    const k = 0.82 + 0.3 * hsh(seed * 31 + Math.round((px + 2) * 7) * 13 + Math.round((py + 2) * 7) * 7, Math.round((pz + 2) * 7));   // the same jitter for a shared corner
    const lx = px * k * ax * r, ly = py * k * fl * r, lz = pz * k * az * r;
    v.push(new THREE.Vector3(x + lx * c - lz * sn, y + ly, z + lx * sn + lz * c));
  }
  for (let i = 0; i < P.count; i += 3) {
    const a = v[i], b = v[i + 1], cc = v[i + 2];
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(cc, a)).normalize();
    B.tri(a, b, cc, n, n, n, [a.x + a.z * 0.5, a.y], [b.x + b.z * 0.5, b.y], [cc.x + cc.z * 0.5, cc.y]);
  }
  g.dispose();
}
export function riprapGeo(sampleT) {
  const dry = new Builder(), weed = new Builder();
  let n = 0, i = 0;
  for (let x = RIP.x0; x < RIP.x1; x += RIP.step) for (let z = RIP.z0; z < RIP.z1; z += RIP.step, i++) {
    const jx = x + (hsh(i, 1) - 0.5) * RIP.step, jz = z + (hsh(i, 2) - 0.5) * RIP.step, t = sampleT(jx, jz);
    if (!(t > -0.6 && t < 3.0)) continue;
    const r = 0.16 + 0.32 * hsh(i, 3) ** 1.5;
    const y = Math.max(t, -0.35) + r * 0.15;
    rockInto(y < RIP.weedY ? weed : dry, jx, y, jz, r, i);
    n++;
  }
  return { dry, weed, n };
}

// the lamps along the inner path, the wall and the rip-rap; the rip-rap's
// stones cast no shadow (2,700 small parts)
export function buildSouth(group, ctx, y) {
  if (!SOUTH) return 0;
  if (!(GX >= ctx.ox && GX < ctx.ox + 512 && GZ >= ctx.oz && GZ < ctx.oz + 512)) return 0;
  const r = buildLamps(group, y, S_LAMP_WALKS, []);
  const W = wallGeo(y), out = new THREE.Group(); out.name = 'ar34h:southWall';
  const mk = (B, mat, name, cast = true) => { const m = new THREE.Mesh(B.geometry(), mat); m.name = 'ar34h:south:' + name; m.castShadow = cast; m.receiveShadow = true; out.add(m); };
  mk(W.core, hmat('mortar'), 'wallCore'); mk(W.blocks, hmat('wallGranite'), 'wallBlocks'); mk(W.cope, hmat('copeGranite'), 'wallCoping');
  let rr = 0;
  if (ctx.sampleT) {
    try {
      const R = riprapGeo((x, z) => ctx.sampleT(x, z));
      if (R.dry.tris) mk(R.dry, hmat('riprap'), 'riprap', false); if (R.weed.tris) mk(R.weed, hmat('riprapWeed'), 'riprapWeed', false);
      rr = R.dry.tris + R.weed.tris; console.log(`[ar34h] rip-rap: ${R.n} rocks, ${rr} triangles`);
    } catch (e) { console.warn('[ar34h] rip-rap', e); }
  }
  group.add(out);
  return r.tris + W.blocks.tris + W.core.tris + W.cope.tris + rr;
}
