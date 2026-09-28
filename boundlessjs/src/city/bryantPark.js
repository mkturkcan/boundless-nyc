// BP28 — Bryant Park as it is laid out (owner 2026-09-27: "Work on some new areas like Times Square and Bryant Park for
// the new teaser"). The compiled city had the NYC Parks polygon as one lawn with park trees scattered at random over it
// (compile.mjs, one per 260 m2), so the open Great Lawn was full of trees and the allees that frame it were missing.
// Here, for the park proper (the half of the block west of the library, 135 m along 42nd St by 138 m from 40th to 42nd):
//   * the scattered park trees inside it are dropped (census street trees on the sidewalks stay);
//   * London planes in four allee rows, two either side of the lawn, 8 m apart;
//   * gravel walks over everything but the lawn and the planting strips along the streets, with low hedges along the
//     lawn's long edges (openings at the thirds);
//   * the green bistro chairs and small tables in clusters under the allees and on the terraces (one draw each);
//   * the Josephine Shaw Lowell fountain on the Sixth Avenue terrace (campus.js tazzaFountain, the Low Plaza type).
// Layout frame: u along 42nd St from the Sixth Avenue line (bearing 119), v from the 40th St line toward 42nd (29).
// `?bp28=0` restores the compiled park.
import * as THREE from 'three';
import { project } from '../shared/geo.js';
import { applyLightTrim } from '../world/materials.js';
import { tazzaFountain } from './campus.js';
import { mkConvex, tpSplit } from './tsqPlaza.js';

export const BP28 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('bp28') === '0');

// NYC Parks M008 corners (the park proper: the library parcel east of the mid-block line is the NYPL landmark's)
const SW = project(-73.984802, 40.753557);   // 40th St x Sixth Ave
const NW = project(-73.984011, 40.754645);   // 42nd St x Sixth Ave
const NE = project(-73.982616, 40.754058);   // 42nd St at the library's west line
const U = (() => { const dx = NE[0] - NW[0], dz = NE[1] - NW[1], l = Math.hypot(dx, dz); return [dx / l, dz / l, l]; })();
const V = (() => { const dx = NW[0] - SW[0], dz = NW[1] - SW[1], l = Math.hypot(dx, dz); return [dx / l, dz / l, l]; })();
export const BP = { LU: U[2], LV: V[2] };     // ~135 x ~138 m
// (u, v) -> world x, z
export const bpWorld = (u, v) => [SW[0] + U[0] * u + V[0] * v, SW[1] + U[1] * u + V[1] * v];
// world x, z -> (u, v)
export const bpLocal = (x, z) => { const dx = x - SW[0], dz = z - SW[1]; return [dx * U[0] + dz * U[1], dx * V[0] + dz * V[1]]; };
export const bpYaw = Math.atan2(U[0], U[1]);   // a local +u heading as a three.js yaw

// the layout (metres in the park frame)
const LAWN = { u0: 32, u1: 122, v0: 47, v1: 91 };
const GRAVEL = { u0: 0.5, u1: 134.5, v0: 11, v1: 127 };
const ROWS_V = [21, 36, 102, 117];                 // allee rows
const ROW_U0 = 26, ROW_U1 = 128, ROW_STEP = 8;
const FOUNT = [15, 69];

export function bpInside(x, z, pad = 0) {
  const [u, v] = bpLocal(x, z);
  return u > -pad && u < BP.LU + pad && v > -pad && v < BP.LV + pad;
}

// the four small footprints in the park proper (the corner kiosks and the 42nd St restroom, 3.4-4.6 m) extrude as
// brick boxes, one of them a 10 m chimney on the 42nd St planting strip in the canyon view: not built
export function bpSkipBuilding(cx, cz, h, area) {
  return BP28 && h < 6 && area < 150 && bpInside(cx, cz, 2);
}
// the compiler's scattered park trees inside the park proper go (census street trees, p2 bit 0, stay)
export function bpDropTree(x, z, f) {
  if (!BP28) return false;
  if (f.p2 & 1) return false;
  return bpInside(x, z, 0.5);
}

// the allee planes as furniture records for the tile at (ox, oz) (512 m tiles; the caller keeps those inside it)
export function bpTrees(ox, oz, groundY) {
  if (!BP28) return [];
  const out = [];
  let k = 0;
  for (const v of ROWS_V) {
    for (let u = ROW_U0; u <= ROW_U1 + 0.01; u += ROW_STEP) {
      const [x, z] = bpWorld(u, v);
      if (x < ox || x >= ox + 512 || z < oz || z >= oz + 512) { k++; continue; }
      const h = Math.sin(k * 12.9898 + 4.1) * 43758.5453;
      const r = h - Math.floor(h);
      out.push({ k: 1, x: x - ox, y: groundY, z: z - oz, rot: r * 6.28, p0: 1, p1: 22 + ((r * 97) % 1) * 8, p2: 0 });
      k++;
    }
  }
  return out;
}

// The gravel walks are the park's own ground re-kinded, not a mesh laid over it: every grass triangle of the tile is cut
// against the walks' rectangle minus the lawn (the Times Square plaza's clipper) and the walk part moves to the `path`
// section `gravel`, the ground shader's pale stone dust (matId 17), where walkers and the samplers treat it as paving. The
// 2.5 cm canvas-textured overlay it replaces read as one flat grey sheet from any height (survey sBryantGold).
// Returns the walks' area in m2 (0: the park is not in this tile, and bpBuild lays the overlay instead).
const rectQ = (r) => mkConvex([bpWorld(r.u0, r.v0), bpWorld(r.u1, r.v0), bpWorld(r.u1, r.v1), bpWorld(r.u0, r.v1)]);
export function bpApply(tile, ox, oz) {
  if (!BP28) return 0;
  const G = rectQ(GRAVEL), Lw = rectQ(LAWN), R = { ped: [G], car: [Lw] };
  if (G.bb[2] < ox || G.bb[0] > ox + 512 || G.bb[3] < oz || G.bb[1] > oz + 512) return 0;
  let m2 = 0;
  const walk = [];
  const fan = (poly, out) => { for (let k = 1; k + 1 < poly.length; k++) for (const p of [poly[0], poly[k], poly[k + 1]]) out.push(p[0] - ox, p[1], p[2] - oz); };
  for (const name of ['grass', 'grassU']) {
    const a = tile.S[name];
    if (!a || a.length < 9) continue;
    const out = [];
    let changed = false;
    for (let i = 0; i + 8 < a.length; i += 9) {
      const x0 = a[i] + ox, z0 = a[i + 2] + oz, x1 = a[i + 3] + ox, z1 = a[i + 5] + oz, x2 = a[i + 6] + ox, z2 = a[i + 8] + oz;
      const keep = () => { for (let k = 0; k < 9; k++) out.push(a[i + k]); };
      if (Math.max(x0, x1, x2) < G.bb[0] || Math.min(x0, x1, x2) > G.bb[2] || Math.max(z0, z1, z2) < G.bb[1] || Math.min(z0, z1, z2) > G.bb[3]) { keep(); continue; }
      const S = tpSplit([[x0, a[i + 1], z0], [x1, a[i + 4], z1], [x2, a[i + 7], z2]], R);
      if (!S.plaza.length) { keep(); continue; }
      changed = true;
      for (const poly of S.road) fan(poly, out);
      for (const poly of S.plaza) {
        fan(poly, walk);
        let A = 0; for (let k = 0; k < poly.length; k++) { const p = poly[k], q = poly[(k + 1) % poly.length]; A += p[0] * q[2] - q[0] * p[2]; }
        m2 += Math.abs(A) / 2;
      }
    }
    if (changed) tile.S[name] = Float32Array.from(out);
  }
  if (!walk.length) return 0;
  // their own section, `gravel` (matId 17, a WALK kind): the park path (6) is the asphalt-dark of Central Park's drives
  tile.S.gravel = Float32Array.from(walk);
  _walksIn = true;
  console.log(`[bp28] ${m2.toFixed(0)} m2 of gravel walks re-kinded from the park's lawn`);
  return m2;
}
let _walksIn = false;

// walkers down the two allees (sim/peds.js promenade lines, resolved once the ground is in): the middle of each, 7.5 m
// from either tree row, from the Sixth Avenue terrace to the library; the chairs keep clear of them (bpBuild)
const ALLEE_V = [28.5, 109.5];
export function bpPromenades() {
  if (!BP28) return [];
  return ALLEE_V.map((v) => ({ pts: [22, 50, 80, 110, 132].map((u) => { const [x, z] = bpWorld(u, v); return [x, 0, z]; }), off: 0 }));
}
// the owner tile builds everything that is not a tree (the one holding the lawn's centre)
export function bpOwns(ox, oz) {
  const [x, z] = bpWorld((LAWN.u0 + LAWN.u1) / 2, (LAWN.v0 + LAWN.v1) / 2);
  return x >= ox && x < ox + 512 && z >= oz && z < oz + 512;
}

let _gravelMat = null, _hedgeMat = null, _chairMat = null;
function gravelMat() {
  if (_gravelMat) return _gravelMat;
  // stone dust over compacted gravel: a warm pale grey with fine grain and a few darker drifts (a small tiled canvas)
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d'), img = c.createImageData(S, S);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < S * S; i++) {
    const g = 0.86 + rnd() * 0.22 - (rnd() < 0.05 ? 0.25 : 0);
    img.data[i * 4] = 178 * g; img.data[i * 4 + 1] = 168 * g; img.data[i * 4 + 2] = 148 * g; img.data[i * 4 + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  _gravelMat = applyLightTrim(new THREE.MeshStandardMaterial({ map: t, color: 0xffffff, roughness: 0.94, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  return _gravelMat;
}
function hedgeMat() {
  return _hedgeMat || (_hedgeMat = applyLightTrim(new THREE.MeshStandardMaterial({ color: 0x2c4a22, roughness: 0.9, metalness: 0 })));
}
function chairMat() {
  // the park's green: a dark bottle-green enamel on steel
  return _chairMat || (_chairMat = applyLightTrim(new THREE.MeshStandardMaterial({ color: 0x1f4a33, roughness: 0.45, metalness: 0.55 })));
}

// a flat mesh over the park frame's rectangle [u0,u1] x [v0,v1] minus holes, at height y (world), UVs in metres / 3
function gravelGeo(y) {
  const pts = [], idx = [];
  // a grid of 2 m cells, dropping the cells inside the lawn (a rectangle with a hole, no seams at 2 m)
  const du = 2, dv = 2;
  const nu = Math.round((GRAVEL.u1 - GRAVEL.u0) / du), nv = Math.round((GRAVEL.v1 - GRAVEL.v0) / dv);
  const vid = new Map();
  const vert = (i, j) => {
    const key = i * 10000 + j;
    let id = vid.get(key);
    if (id !== undefined) return id;
    const u = GRAVEL.u0 + i * du, v = GRAVEL.v0 + j * dv, [x, z] = bpWorld(u, v);
    id = pts.length / 5; pts.push(x, y, z, u / 3, v / 3); vid.set(key, id);
    return id;
  };
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const u = GRAVEL.u0 + (i + 0.5) * du, v = GRAVEL.v0 + (j + 0.5) * dv;
    if (u > LAWN.u0 && u < LAWN.u1 && v > LAWN.v0 && v < LAWN.v1) continue;      // the lawn
    if (Math.hypot(u - FOUNT[0], v - FOUNT[1]) < 6.2) continue;                  // the fountain's footprint
    const a = vert(i, j), b = vert(i + 1, j), c = vert(i + 1, j + 1), d = vert(i, j + 1);
    idx.push(a, b, c, a, c, d);   // u x v points up in this frame (u east-south-east, v north-north-east)
  }
  const g = new THREE.BufferGeometry();
  const P = new Float32Array((pts.length / 5) * 3), T = new Float32Array((pts.length / 5) * 2), N = new Float32Array((pts.length / 5) * 3);
  for (let i = 0; i < pts.length / 5; i++) {
    P[i * 3] = pts[i * 5]; P[i * 3 + 1] = pts[i * 5 + 1]; P[i * 3 + 2] = pts[i * 5 + 2];
    T[i * 2] = pts[i * 5 + 3]; T[i * 2 + 1] = pts[i * 5 + 4]; N[i * 3 + 1] = 1;
  }
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(T, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// one bistro chair / table as a merged geometry (local +z = the chair's front)
function chairGeo() {
  const parts = [];
  const bx = (w, h, d, x, y, z, rx = 0) => { const b = new THREE.BoxGeometry(w, h, d); if (rx) b.rotateX(rx); b.translate(x, y, z); parts.push(b); };
  bx(0.42, 0.03, 0.40, 0, 0.45, 0);                                    // seat (slats read as one plate at this scale)
  bx(0.42, 0.40, 0.025, 0, 0.72, -0.2, -0.12);                         // back
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(0.022, 0.45, 0.022, sx * 0.19, 0.225, sz * 0.18);
  for (const sx of [-1, 1]) bx(0.022, 0.46, 0.022, sx * 0.2, 0.68, -0.2, -0.12);   // back uprights
  return merge(parts);
}
function tableGeo() {
  const parts = [];
  const top = new THREE.CylinderGeometry(0.32, 0.32, 0.025, 20); top.translate(0, 0.72, 0); parts.push(top);
  const col = new THREE.CylinderGeometry(0.025, 0.03, 0.7, 8); col.translate(0, 0.36, 0); parts.push(col);
  const foot = new THREE.CylinderGeometry(0.2, 0.22, 0.03, 16); foot.translate(0, 0.015, 0); parts.push(foot);
  return merge(parts);
}
function merge(parts) {
  let n = 0; for (const p of parts) n += p.index ? p.index.count : p.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.computeBoundingSphere();
  return g;
}

// everything but the trees, into `group`, at the lawn's height `y` (world)
export function bpBuild(group, y) {
  if (!BP28) return;
  // gravel walks: the re-kinded ground (bpApply) when that ran, else a mesh a little over the lawn
  if (!_walksIn) {
    const gm = new THREE.Mesh(gravelGeo(y + 0.025), gravelMat());
    gm.receiveShadow = true; gm.name = 'bp28:gravel';
    group.add(gm);
  }
  // hedges along the lawn's long edges, openings at the thirds
  const hedges = [];
  const L = LAWN.u1 - LAWN.u0;
  for (const v of [LAWN.v0 - 0.9, LAWN.v1 + 0.9]) {
    for (const [a, b] of [[0, 0.31], [0.36, 0.64], [0.69, 1]]) {
      const u0 = LAWN.u0 + a * L, u1 = LAWN.u0 + b * L, [x, z] = bpWorld((u0 + u1) / 2, v);
      hedges.push([x, z, u1 - u0]);
    }
  }
  // a unit-long box, 1.1 m across and 0.75 m tall; with the park's yaw its local z runs along u, scaled to the run
  const hg = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.75, 1), hedgeMat(), hedges.length);
  const m4 = new THREE.Matrix4(), qU = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), bpYaw);
  hedges.forEach(([x, z, len], i) => { m4.compose(new THREE.Vector3(x, y + 0.375, z), qU, new THREE.Vector3(1, 1, len)); hg.setMatrixAt(i, m4); });
  hg.castShadow = true; hg.receiveShadow = true; hg.name = 'bp28:hedges';
  group.add(hg);
  // chairs and tables: clusters of 2-4 chairs round a table, in the allees and on the two terraces, off the tree rows
  let seed = 911;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const chairs = [], tables = [];
  const bands = [[26, 128, 12, 32], [26, 128, 96, 125], [2, 28, 40, 98], [124, 134, 20, 118]];   // u0, u1, v0, v1
  for (const [u0, u1, v0, v1] of bands) {
    const area = (u1 - u0) * (v1 - v0), n = Math.round(area / 55);
    for (let i = 0; i < n; i++) {
      const u = u0 + rnd() * (u1 - u0), v = v0 + rnd() * (v1 - v0);
      if (ROWS_V.some((rv) => Math.abs(v - rv) < 1.4) && ((u - ROW_U0) % ROW_STEP + ROW_STEP) % ROW_STEP < 1.6) continue;   // a trunk
      if (Math.hypot(u - FOUNT[0], v - FOUNT[1]) < 8) continue;
      if (ALLEE_V.some((av) => Math.abs(v - av) < 3.2)) continue;   // the allee walkers' lane
      const [x, z] = bpWorld(u, v);
      const hasT = rnd() < 0.7, nC = 1 + ((rnd() * 3.2) | 0);
      if (hasT) tables.push([x, z]);
      const a0 = rnd() * 6.28;
      for (let c = 0; c < nC; c++) {
        const a = a0 + (c / nC) * 6.28 + (rnd() - 0.5) * 0.5, r = hasT ? 0.62 + rnd() * 0.12 : 0;
        const cx = x + Math.sin(a) * r, cz = z + Math.cos(a) * r;
        chairs.push([cx, cz, a + Math.PI + (rnd() - 0.5) * 0.6]);   // facing the table (or anywhere, for a lone chair)
      }
    }
  }
  const cm = new THREE.InstancedMesh(chairGeo(), chairMat(), chairs.length);
  chairs.forEach(([x, z, yaw], i) => { m4.compose(new THREE.Vector3(x, y + 0.02, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)); cm.setMatrixAt(i, m4); });
  cm.castShadow = true; cm.receiveShadow = true; cm.name = 'bp28:chairs';
  group.add(cm);
  const tm = new THREE.InstancedMesh(tableGeo(), chairMat(), Math.max(1, tables.length));
  tables.forEach(([x, z], i) => { m4.compose(new THREE.Vector3(x, y + 0.02, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)); tm.setMatrixAt(i, m4); });
  tm.count = tables.length; tm.castShadow = true; tm.receiveShadow = true; tm.name = 'bp28:tables';
  group.add(tm);
  // the Lowell fountain
  const [fx, fz] = bpWorld(FOUNT[0], FOUNT[1]);
  const F = tazzaFountain({ x: fx, z: fz, R: 5.35, seed: 4241 });
  F.group.position.set(fx, y, fz);
  F.group.name = 'bp28:fountain';
  group.add(F.group);
  if (typeof window !== 'undefined') window.__BP28 = { chairs: chairs.length, tables: tables.length, hedges: hedges.length, y: +y.toFixed(2) };
}
