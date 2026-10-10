// AR32 w125e kit: the geometry and materials of E 125th Street's structures (city/w125e.js places them).
// Everything is extruded quadrilaterals ("ext": a convex footprint of four points, extruded between two heights) with
// vertex colours, gathered per material into one mesh per tile (the city/cpLandmarksKit.js pattern), so a tile's
// viaduct, station and ramps cost a handful of draw calls.
// Frame: most pieces are laid in the Manhattan grid's frame, u along the streets (bearing 119 deg, ESE) and v along the
// avenues (bearing 29 deg, NNE): x = C u + S v, z = S u - C v (C = cos 29, S = sin 29; the map is its own inverse).
import * as THREE from 'three';
import { applyLightTrim, applyCityAO } from '../world/materials.js';

export const C29 = Math.cos((29 * Math.PI) / 180), S29 = Math.sin((29 * Math.PI) / 180);
export const toUV = (x, z) => [C29 * x + S29 * z, S29 * x - C29 * z];
export const toXZ = (u, v) => [C29 * u + S29 * v, S29 * u - C29 * v];
export const K = (hex) => new THREE.Color(hex);

// colours (sRGB; the materials' light trim calibrates them as the city's other kits do)
export const COL = {
  steel: K(0x3f4a46), steelD: K(0x2f3734), steelU: K(0x2a302e),    // the viaduct's paint: a dark grey-green, its shade
  slab: K(0x77746e), slabU: K(0x5d5a55), ballast: K(0x4a453f), tie: K(0x3b3530),
  rail: K(0x8a8680), third: K(0x6c6a66), cover: K(0xa7a296),
  brick: K(0xa9825f), brickD: K(0x916e50), lime: K(0xd3c8b2), limeD: K(0xbdb29c), granite: K(0x8f8a82),
  frame: K(0x2e4538), glass: K(0x1d2528), door: K(0x3a2a20),
  plat: K(0xa9a69f), platEdge: K(0xd9b43a), canopy: K(0x2f4a3c), roof: K(0xb7b8b4), roofU: K(0xd6d4cc),
  conc: K(0x9c988f), concD: K(0x807c74), barrier: K(0xb4b0a6), pier: K(0x8e8a82), asph: K(0x3a3a3b),
  green: K(0x2d5a3c), globe: K(0x6fd08a), globeW: K(0xf1efe6), sign: K(0xf4f2ea),
  rfk: K(0x53616e), rfkD: K(0x44505b),                                // the RFK Bridge's grey-blue (city/bridgeKit.js STEEL.rfk)
};

// ---- materials ----------------------------------------------------------------------------------------------------
const MATS = {};
const own = (m, k) => { const f = m.customProgramCacheKey.bind(m); m.customProgramCacheKey = () => f() + '|ar32e' + k; return m; };
const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, ...o });
export function mats() {
  if (MATS.matte) return MATS;
  MATS.matte = own(applyLightTrim(applyCityAO(std({ roughness: 0.9, metalness: 0.0 }))), 'matte');
  // painted structural steel: an enamel over steel reads as a dielectric with a sheen
  MATS.steel = own(applyLightTrim(applyCityAO(std({ roughness: 0.58, metalness: 0.18 }))), 'steel');
  MATS.rail = own(applyLightTrim(applyCityAO(std({ roughness: 0.32, metalness: 0.75 }))), 'rail');
  MATS.glass = own(applyLightTrim(applyCityAO(std({ roughness: 0.12, metalness: 0.35 }))), 'glass');
  // the subway entrances' globes: lit (green for an entrance open at all hours), no trim so they read as lamps
  MATS.lamp = own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0.55, toneMapped: true }), 'lamp');
  MATS.lamp.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= diffuseColor.rgb;'); };
  return MATS;
}

// ---- the geometry bag ---------------------------------------------------------------------------------------------
export class Bag {
  constructor() { this.b = new Map(); }
  arr(mat) { let a = this.b.get(mat); if (!a) this.b.set(mat, (a = { p: [], n: [], c: [] })); return a; }
  // one flat face, points in order round it, `nrm` its intended outward normal (the winding is fixed to match it)
  face(mat, pts, nrm, col) {
    const A = this.arr(mat);
    const [a, b, c] = pts;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    const P = gx * nrm[0] + gy * nrm[1] + gz * nrm[2] < 0 ? pts.slice().reverse() : pts;
    for (let i = 1; i + 1 < P.length; i++) {
      for (const q of [P[0], P[i], P[i + 1]]) { A.p.push(q[0], q[1], q[2]); A.n.push(nrm[0], nrm[1], nrm[2]); A.c.push(col.r, col.g, col.b); }
    }
  }
  // a convex footprint of world [x, z] points (in order round it) extruded from y0 to y1; `top`/`bot` false leaves that face out
  ext(mat, F, y0, y1, col, o = {}) {
    let cx = 0, cz = 0; for (const p of F) { cx += p[0] / F.length; cz += p[1] / F.length; }
    if (o.top !== false) this.face(mat, F.map(([x, z]) => [x, y1, z]), [0, 1, 0], o.topCol || col);
    if (o.bot !== false) this.face(mat, F.map(([x, z]) => [x, y0, z]), [0, -1, 0], o.botCol || col);
    for (let i = 0; i < F.length; i++) {
      const a = F[i], b = F[(i + 1) % F.length];
      let nx = b[1] - a[1], nz = -(b[0] - a[0]); const L = Math.hypot(nx, nz) || 1; nx /= L; nz /= L;
      if (((a[0] + b[0]) / 2 - cx) * nx + ((a[1] + b[1]) / 2 - cz) * nz < 0) { nx = -nx; nz = -nz; }
      this.face(mat, [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], [nx, 0, nz], o.sideCol || col);
    }
  }
  // the same in the grid frame: u0..u1 x v0..v1
  box(mat, u0, u1, v0, v1, y0, y1, col, o) { this.ext(mat, [toXZ(u0, v0), toXZ(u1, v0), toXZ(u1, v1), toXZ(u0, v1)], y0, y1, col, o); }
  // a bar of half width hw along the world segment A -> B ([x, z])
  bar(mat, A, B, hw, y0, y1, col, o) {
    const dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz) || 1, px = (-dz / L) * hw, pz = (dx / L) * hw;
    this.ext(mat, [[A[0] - px, A[1] - pz], [B[0] - px, B[1] - pz], [B[0] + px, B[1] + pz], [A[0] + px, A[1] + pz]], y0, y1, col, o);
  }
  // an upright square post of half side h at (x, z)
  post(mat, x, z, h, y0, y1, col) { const [u, v] = toUV(x, z); this.box(mat, u - h, u + h, v - h, v + h, y0, y1, col, { bot: false }); }
  // a sloped plank between two world points (x, y, z) with half width hw and thickness t (a ramp, a stair's stringer)
  slope(mat, A, B, hw, t, col) {
    const dx = B[0] - A[0], dz = B[2] - A[2], L = Math.hypot(dx, dz) || 1, px = (-dz / L) * hw, pz = (dx / L) * hw;
    const q = [[A[0] - px, A[1], A[2] - pz], [B[0] - px, B[1], B[2] - pz], [B[0] + px, B[1], B[2] + pz], [A[0] + px, A[1], A[2] + pz]];
    const up = q.map((p) => [p[0], p[1] + t, p[2]]);
    const ny = [-(B[1] - A[1]) * (dx / L), L, -(B[1] - A[1]) * (dz / L)], nl = Math.hypot(...ny);
    this.face(mat, up, ny.map((c) => c / nl), col);
    this.face(mat, q, ny.map((c) => -c / nl), col);
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4], a2 = up[i], b2 = up[(i + 1) % 4];
      let nx = b[2] - a[2], nz = -(b[0] - a[0]); const Ln = Math.hypot(nx, nz) || 1;
      const mx = (a[0] + b[0]) / 2 - (A[0] + B[0]) / 2, mz = (a[2] + b[2]) / 2 - (A[2] + B[2]) / 2;
      if (mx * nx + mz * nz < 0) { nx = -nx; nz = -nz; }
      this.face(mat, [a, b, b2, a2], [nx / Ln, 0, nz / Ln], col);
    }
  }
  // a low-poly sphere (the entrance globes)
  ball(mat, x, y, z, r, col) {
    const N = 8, M = 5, ring = [];
    for (let j = 0; j <= M; j++) { const t = (j / M) * Math.PI, row = []; for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; row.push([x + r * Math.sin(t) * Math.cos(a), y + r * Math.cos(t), z + r * Math.sin(t) * Math.sin(a)]); } ring.push(row); }
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
      const a = ring[j][i], b = ring[j][(i + 1) % N], c = ring[j + 1][(i + 1) % N], d = ring[j + 1][i];
      const mx = (a[0] + c[0]) / 2 - x, my = (a[1] + c[1]) / 2 - y, mz = (a[2] + c[2]) / 2 - z, l = Math.hypot(mx, my, mz) || 1;
      this.face(mat, j === 0 ? [a, c, d] : j === M - 1 ? [a, b, c] : [a, b, c, d], [mx / l, my / l, mz / l], col);
    }
  }
  // one mesh per material into the group
  flush(group, name) {
    let n = 0, tris = 0;
    for (const [mat, A] of this.b) {
      if (!A.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(A.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(A.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(A.c, 3));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.name = `ar32e:${name}`; m.castShadow = mat !== MATS.lamp && mat !== MATS.glass; m.receiveShadow = true;
      m.matrixAutoUpdate = false; m.updateMatrix();
      m.layers.enable(3);   // the far shadow cascade, like the dressed buildings
      group.add(m); n++; tris += A.p.length / 9;
    }
    this.b.clear();
    return { meshes: n, tris };
  }
}
