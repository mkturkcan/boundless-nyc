// TRAINS (AR34): the car models, built once per type and cached: LOD0 (near, 0-45 m: interior, gaskets, reveals, decals,
// roof flutes) and LOD1 (far: the shell, dark glazing), the door leaves, the trucks, the wheelsets, the coupling gap.
// staticCar(): a plain Group of one car for the model sheet (sheet.html); the runner (sim/trains.js) instances the same
// geometries, one InstancedMesh per material class.
import * as THREE from 'three';
import { buildCar, buildDoorLeaf, buildTruck, buildWheelset, buildGap, SPECS } from './cars.js';
import { trainMats } from './mats.js';

const CACHE = new Map();
export function carModel(kind) {
  let m = CACHE.get(kind);
  if (m) return m;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const l0 = buildCar(kind, 0), l1 = buildCar(kind, 1);
  m = { kind, spec: SPECS[kind], lod: [l0.geos, l1.geos], tris: [l0.tris, l1.tris], door: buildDoorLeaf(kind), truck: buildTruck(kind).geos, wheel: buildWheelset(kind).geos, gap: buildGap(kind).geos };
  m.ms = typeof performance !== 'undefined' ? +(performance.now() - t0).toFixed(1) : 0;
  CACHE.set(kind, m);
  return m;
}
// the door leaves' closed positions on the +z side: [x of the leaf's middle, slide direction]
export function doorSlots(S) {
  const out = [], lw = S.doorW / S.leaves;
  for (const dx of S.doors) {
    if (S.leaves === 2) { out.push([dx - lw / 2, -1]); out.push([dx + lw / 2, 1]); }
    else out.push([dx, dx < 0 ? 1 : -1]);
  }
  return out;
}
// one car as a Group (sheet): doors at `open` (0..1), lamps per `lamps` [frontW, frontR, rearW, rearR]
export function staticCar(kind, { lod = 0, open = 0, lamps = [0, 0, 0, 0], doorLamp = 0, numCell = 0, destCell = 0 } = {}) {
  const M = trainMats(), m = carModel(kind), S = m.spec, g = new THREE.Group();
  const add = (geos, mat0 = null, mtx = null) => {
    for (const [k, geo] of Object.entries(geos)) {
      const mat = M[k]; if (!mat) continue;
      let gg = geo;
      if (k === 'lamps' || k === 'signs' || k === 'decals') {
        gg = geo.clone();
        const n = gg.getAttribute('position').count;
        if (k === 'lamps') {
          const a = new Float32Array(n * 4).fill(0), b = new Float32Array(n * 4).fill(0);
          for (let i = 0; i < n; i++) { a.set(lamps, i * 4); b[i * 4] = doorLamp; }
          gg.setAttribute('iLampA', new THREE.BufferAttribute(a, 4)); gg.setAttribute('iLampB', new THREE.BufferAttribute(b, 4));
        } else {
          const u = new Float32Array(n * 4);
          const [nu, nv] = numOffset(S, numCell), dv = destOffset(destCell);
          for (let i = 0; i < n; i++) u.set([nu, nv, 0, dv], i * 4);
          gg.setAttribute('iUvo', new THREE.BufferAttribute(u, 4));
        }
      }
      const mesh = new THREE.Mesh(gg, mat0 || mat);
      mesh.castShadow = k !== 'glass' && k !== 'lamps' && k !== 'signs' && k !== 'lit' && k !== 'interior';
      mesh.receiveShadow = k !== 'lamps' && k !== 'signs' && k !== 'lit';
      if (mtx) { mesh.matrixAutoUpdate = false; mesh.matrix.copy(mtx); }
      g.add(mesh);
    }
  };
  add(m.lod[lod]);
  // doors
  const lw = S.doorW / S.leaves;
  for (const [x, dir] of doorSlots(S)) for (const sgn of [1, -1]) {
    const mx = new THREE.Matrix4().makeTranslation(x + dir * lw * open * 0.98, 0, sgn * (S.W / 2 - 0.022));
    if (sgn < 0) mx.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
    add(m.door.geos, null, mx);
  }
  // trucks and wheels
  for (const tx of [-S.truckX, S.truckX]) {
    add(m.truck, null, new THREE.Matrix4().makeTranslation(tx, 0, 0));
    for (const ax of [-S.wheelBase / 2, S.wheelBase / 2]) add(m.wheel, null, new THREE.Matrix4().makeTranslation(tx + ax, S.wheelR, 0));
  }
  return g;
}
// per-instance atlas offsets: the number cell (CELLS.num0 / numM grid) relative to cell 0, the destination row
import { CELLS, ATLAS } from './mats.js';
export function numOffset(S, i) {
  const c = CELLS[S.num], cols = S.numCols, idx = (S.numBase || 0) + i;
  return [((idx % cols) * c[2]) / ATLAS.W, -(Math.floor(idx / cols) * c[3]) / ATLAS.H];
}
export function destOffset(i) { return -(i * CELLS.dest0[3]) / ATLAS.H; }
