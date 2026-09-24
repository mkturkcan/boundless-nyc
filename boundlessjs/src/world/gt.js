// Ground-truth export for synthetic data generation (the Boundless mission):
//   window.__GT.boxes()  -> JSON: vehicles + pedestrians with 3D pose and
//                           projected 2D boxes, plus camera intrinsics.
//   ?gt=seg (or __GT.setMode('seg')) -> instance segmentation view: every
//                           vehicle/ped rendered in a unique flat ID color,
//                           static classes in flat category colors, post off.
// Colors encode instance ids: R = id & 255, G = (id >> 8) & 255,
// B = 200 vehicles, 201 pedestrians. Category colors use B < 100.
import * as THREE from 'three';

const CAT = {
  building: new THREE.Color(70 / 255, 70 / 255, 10 / 255),
  ground: new THREE.Color(50 / 255, 50 / 255, 20 / 255),
  vegetation: new THREE.Color(35 / 255, 90 / 255, 30 / 255),
  water: new THREE.Color(30 / 255, 40 / 255, 90 / 255),
  furniture: new THREE.Color(90 / 255, 60 / 255, 60 / 255),
};

const DIMS = { bus: [2.5, 3.1, 11.5], sprinter: [2.1, 2.6, 6.0], van: [2.0, 2.2, 5.2], default: [1.95, 1.6, 4.7] };

export function initGT(engine, refs) {
  const { traffic, peds, scene } = refs;
  let mode = null;
  const swapped = []; // [obj, oldMaterial]
  const colorStash = new Map(); // instancedMesh -> Float32Array copy
  const flat = {};
  for (const k of Object.keys(CAT)) flat[k] = new THREE.MeshBasicMaterial({ color: CAT[k], fog: false });
  const idMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });

  const idColor = (id, cls) => new THREE.Color((id & 255) / 255, ((id >> 8) & 255) / 255, cls / 255);

  const classify = (obj) => {
    const n = (obj.material && obj.material.uuid) || '';
    if ((refs.facadeMat && obj.material === refs.facadeMat) || obj.material?.userData?.isFacade || obj.userData?.nycDress) return 'building';
    if (refs.groundMat && obj.material === refs.groundMat) return 'ground';
    if (refs.farMat && obj.material === refs.farMat) return 'building';
    if (refs.instancer && obj.material === refs.instancer.crownMat) return 'vegetation';
    if (refs.instancer && obj.material === refs.instancer.baseMat) return 'furniture';
    return null;
  };

  const enter = () => {
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const cls = classify(o);
      if (cls) { swapped.push([o, o.material]); o.material = flat[cls]; return; }
    });
    // vehicles: ID colors on every pool (paint + dark share the matrix; color
    // the paint mesh, dark mesh gets the same id via material swap + color)
    if (traffic) {
      let vid = 1;
      const pools = { ...traffic.pools, ...(traffic.parked || {}) };
      for (const P of Object.values(pools)) {
        for (const m of [P.mb, P.md, ...(P.shell ? [P.shell] : [])]) {
          swapped.push([m, m.material]);
          m.material = idMat;
        }
        if (P.shell && P.shell.instanceColor) {
          colorStash.set(P.shell, P.shell.instanceColor.array.slice());
          for (let i = 0; i < P.cap; i++) {
            const c = idColor(vid + i, 200);
            P.shell.instanceColor.setXYZ(i, c.r, c.g, c.b);
          }
          P.shell.instanceColor.needsUpdate = true;
        }
        if (P.mb.instanceColor) {
          colorStash.set(P.mb, P.mb.instanceColor.array.slice());
          for (let i = 0; i < P.cap; i++) {
            const c = idColor(vid + i, 200);
            P.mb.instanceColor.setXYZ(i, c.r, c.g, c.b);
            if (P.md.instanceColor) P.md.instanceColor.setXYZ(i, c.r, c.g, c.b);
          }
          P.mb.instanceColor.needsUpdate = true;
        }
        vid += P.cap;
      }
    }
    if (peds && peds.mesh) {
      swapped.push([peds.mesh, peds.mesh.material]);
      peds.mesh.material = idMat;
      colorStash.set(peds.mesh, peds.mesh.instanceColor.array.slice());
      for (let i = 0; i < peds.cap; i++) {
        const c = idColor(i + 1, 201);
        peds.mesh.instanceColor.setXYZ(i, c.r, c.g, c.b);
      }
      peds.mesh.instanceColor.needsUpdate = true;
    }
    engine.gtRaw = true; // loop renders raw (no post, no tone map)
  };
  const exit = () => {
    for (const [o, m] of swapped) o.material = m;
    swapped.length = 0;
    for (const [mesh, arr] of colorStash) { mesh.instanceColor.array.set(arr); mesh.instanceColor.needsUpdate = true; }
    colorStash.clear();
    engine.gtRaw = false;
  };

  const project2d = (wx, wy, wz, cam, out) => {
    const v = new THREE.Vector3(wx, wy, wz).project(cam);
    if (v.z > 1) return null;
    out[0] = Math.min(out[0], (v.x * 0.5 + 0.5) * innerWidth);
    out[1] = Math.min(out[1], (1 - (v.y * 0.5 + 0.5)) * innerHeight);
    out[2] = Math.max(out[2], (v.x * 0.5 + 0.5) * innerWidth);
    out[3] = Math.max(out[3], (1 - (v.y * 0.5 + 0.5)) * innerHeight);
    return out;
  };

  const boxes = () => {
    const cam = engine.camera;
    const out = { camera: { pos: cam.position.toArray(), quat: cam.quaternion.toArray(), fov: cam.fov, aspect: cam.aspect, width: innerWidth, height: innerHeight }, vehicles: [], pedestrians: [] };
    if (traffic) {
      traffic.cars.forEach((car, i) => {
        const p = car._pose;
        if (!p) return;
        const dim = DIMS[car.kind] || DIMS.default;
        const [x, y, z, yaw] = p;
        const bb = [1e9, 1e9, -1e9, -1e9];
        let vis = false;
        const c = Math.cos(yaw), s = Math.sin(yaw);
        for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) {
          const lx = sx * dim[0] / 2, lz = sz * dim[2] / 2;
          if (project2d(x + lx * c + lz * s, y + sy * dim[1], z - lx * s + lz * c, cam, bb)) vis = true;
        }
        if (!vis || bb[2] < 0 || bb[0] > innerWidth || bb[3] < 0 || bb[1] > innerHeight) return;
        out.vehicles.push({ id: i + 1, kind: car.kind, pos: [x, y, z], yaw, v: +car.v.toFixed(2), dims: dim, bbox2d: bb.map((b) => Math.round(b)) });
      });
    }
    if (peds) {
      peds.peds.forEach((p2, i) => {
        const m = new THREE.Matrix4();
        peds.mesh.getMatrixAt(p2.idx, m);
        const pos = new THREE.Vector3().setFromMatrixPosition(m);
        const bb = [1e9, 1e9, -1e9, -1e9];
        let vis = false;
        for (const sy of [0.05, 1.68]) for (const sx of [-0.26, 0.26]) {
          if (project2d(pos.x + sx, pos.y + sy, pos.z, cam, bb) ) vis = true;
          if (project2d(pos.x, pos.y + sy, pos.z + sx, cam, bb)) vis = true;
        }
        if (!vis || bb[2] < 0 || bb[0] > innerWidth || bb[3] < 0 || bb[1] > innerHeight) return;
        out.pedestrians.push({ id: i + 1, pos: pos.toArray().map((v) => +v.toFixed(2)), bbox2d: bb.map((b) => Math.round(b)) });
      });
    }
    return out;
  };

  const api = {
    setMode(m) {
      if (m === mode) return;
      if (mode) exit();
      mode = m || null;
      if (mode === 'seg') enter();
    },
    get mode() { return mode; },
    boxes,
  };
  if (typeof window !== 'undefined') window.__GT = api;
  return api;
}
