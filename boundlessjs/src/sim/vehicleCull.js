// Culled draw sets for the traffic pools (moving + parked vehicles).
//
// traffic.js keeps writing every vehicle's matrix/colour into its pool meshes
// (mb/md[/shell]); those become invisible STORAGE. Each frame the vehicles
// whose bounding sphere intersects the padded view frustum are compacted into
// render meshes (one draw per pool part), and a second, shadow-only set holds
// the vehicles inside the near shadow cascade box — visible only during the
// shadow pass (engine shadow listeners), so off-screen cars still cast into
// view. Lossless: same geometry, same materials (mirrored every frame, so the
// ground-truth material swaps in gt.js keep working). Vehicles are excluded
// from the cached far cascade (2.3 m texels — a car is a one-texel blob).
//
// Before: every pool drew all its instances in both passes (~13M tris/pass on
// 125th St, 30 draws); a street-level frustum holds a small fraction of them.
import * as THREE from 'three';
import { Instancer } from '../city/instancer.js';
import { applySpecAA } from '../world/materials.js';
import { csVehicles } from '../city/contactShadow.js';   // CS11

const PAD_MAIN = 3;      // metres added to each vehicle sphere vs the view frustum
const PAD_SHADOW = 12;   // vs the near shadow box (planes refreshed every 8 m)

const _pl = new Float32Array(24), _pl2 = new Float32Array(24);
const _fr = new THREE.Frustum();
const _pv = new THREE.Matrix4();
function planesFrom(camera, out) {
  _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _fr.setFromProjectionMatrix(_pv);
  for (let i = 0; i < 6; i++) {
    const p = _fr.planes[i];
    out[i * 4] = p.normal.x; out[i * 4 + 1] = p.normal.y; out[i * 4 + 2] = p.normal.z; out[i * 4 + 3] = p.constant;
  }
}

// r8: `applySpecAA` is idempotent (`mat.__specAA`) and a no-op under ?aa=0, so
// this is a property test on the hot path and a compile only when a material
// the fleet has never shown before appears (async GLB loads, gt.js id swaps).
function fleetSpecAA(m) {
  if (!m || m.__specAA) return;
  for (const mt of (Array.isArray(m) ? m : [m])) {
    if (mt && (mt.isMeshStandardMaterial || mt.isMeshPhysicalMaterial)) {
      applySpecAA(mt, { sigma2: 0.25, kappa: 0.20, clearcoat: !!mt.isMeshPhysicalMaterial });
    }
  }
}

function mkRender(src, cap, name, forShadow) {
  const m = new THREE.InstancedMesh(src.geometry, src.material, cap);
  m.name = name;
  m.count = 0;
  m.frustumCulled = false;
  m.matrixAutoUpdate = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (src.instanceColor && !forShadow) {
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }
  m.castShadow = forShadow;
  m.receiveShadow = !forShadow;
  m.visible = !forShadow;
  // A car is a CLOSED shell, and three's depth pass renders a FrontSide
  // material's BACK faces — so the depth written over a car's footprint is its
  // UNDERBODY, ~250 mm above the tarmac. The road's own depth is then inside
  // the shadow bias of it and every vehicle in the city threw nothing
  // (critic r5 2 #2 / 7.1). shadowSide is read only by the shadow depth pass,
  // so this changes no pixel of the main draw.
  if (forShadow && src.material && !Array.isArray(src.material)) src.material.shadowSide = THREE.DoubleSide;
  return m;
}

// a storage group: meshes that share one matrix stream (paint + dark of a car)
class Group {
  constructor(scene, srcs, cap, tag, lodSrc = null) {
    this.srcs = srcs;                     // [mb, md] or [shell]
    const g = srcs[0].geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    this.radius = g.boundingSphere.radius + 0.5;
    const c = Math.max(32, Math.min(cap, 512));
    this.main = srcs.map((s, i) => mkRender(s, c, `veh:${tag}:${i}`, false));
    this.shadow = srcs.map((s, i) => mkRender(s, c, `vehS:${tag}:${i}`, true));
    for (const m of [...this.main, ...this.shadow]) scene.add(m);
    for (const s of srcs) { s.visible = false; s.castShadow = false; }
    // moving-car LOD: beyond LOD_DIST the CARLA collision shell stands in for
    // the full model — the same 120 m swap the parked fleet already uses
    this.lod = null;
    if (lodSrc) {
      this.lodSrc = lodSrc;
      this.lodMain = [mkRender(lodSrc, c, `veh:${tag}:lod`, false)];
      this.lodShadow = [mkRender(lodSrc, c, `vehS:${tag}:lod`, true)];
      this.lodMain[0].instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(c * 3).fill(1), 3);
      this.lodMain[0].instanceColor.setUsage(THREE.DynamicDrawUsage);
      for (const m of [...this.lodMain, ...this.lodShadow]) scene.add(m);
      this.lod = true;
    }
  }
  _grow(list, need, withColor) {
    for (const m of list) {
      const cap = Math.max(need, m.instanceMatrix.count * 2);
      const im = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16);
      im.setUsage(THREE.DynamicDrawUsage);
      im.array.set(m.instanceMatrix.array);
      m.instanceMatrix = im;
      if (m.instanceColor) {
        const ic = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
        ic.setUsage(THREE.DynamicDrawUsage);
        ic.array.set(m.instanceColor.array);
        m.instanceColor = ic;
      }
    }
  }
  _finish(list, srcs, k, dim) {
    for (let j = 0; j < list.length; j++) {
      const dst = list[j];
      dst.count = k;
      // mirror storage geometry/material (fleet swaps, gt.js id materials)
      const src = srcs[Math.min(j, srcs.length - 1)];
      if (dst.material !== src.material) dst.material = src.material;
      // a fleet/gt material swap must carry the shadowSide with it or the new
      // material falls back to three's BackSide default and the car stops
      // casting again
      if (dst.castShadow && dst.material && !Array.isArray(dst.material) && dst.material.shadowSide !== THREE.DoubleSide) dst.material.shadowSide = THREE.DoubleSide;
      fleetSpecAA(dst.material);   // r8: a fleet/gt material swap must carry the specular AA too

      if (dst.geometry !== src.geometry) dst.geometry = src.geometry;
      const im = dst.instanceMatrix; im.clearUpdateRanges(); im.addUpdateRange(0, k * 16); im.needsUpdate = true;
      if (dst.instanceColor) { const ic = dst.instanceColor; ic.clearUpdateRanges(); ic.addUpdateRange(0, k * 3); ic.needsUpdate = true; }
    }
  }
  // write the in-frustum vehicles into `list` (and, past LOD_DIST, into the
  // shell list when this group has one)
  compact(list, lodList, planes, pad, cx, cz) {
    const src0 = this.srcs[0];
    const n = src0.count;
    const A = src0.instanceMatrix.array;
    const col = src0.instanceColor ? src0.instanceColor.array : null;
    const r = this.radius + pad;
    const useLod = !!(this.lod && lodList);
    let k = 0, kl = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 16;
      // skip zero-scaled (hidden) instances
      if (A[o] === 0 && A[o + 5] === 0 && A[o + 10] === 0) continue;
      const x = A[o + 12], y = A[o + 13], z = A[o + 14];
      let inside = true;
      for (let q = 0; q < 24; q += 4) {
        if (planes[q] * x + planes[q + 1] * y + planes[q + 2] * z + planes[q + 3] < -r) { inside = false; break; }
      }
      if (!inside) continue;
      if (useLod && (x - cx) * (x - cx) + (z - cz) * (z - cz) > LOD_DIST2) {
        if (kl >= lodList[0].instanceMatrix.count) this._grow(lodList, kl + 1);
        for (let j = 0; j < lodList.length; j++) {
          const dst = lodList[j];
          dst.instanceMatrix.array.set(A.subarray(o, o + 16), kl * 16);
          if (dst.instanceColor && col) { const c = dst.instanceColor.array; c[kl * 3] = col[i * 3] * 0.82; c[kl * 3 + 1] = col[i * 3 + 1] * 0.82; c[kl * 3 + 2] = col[i * 3 + 2] * 0.82; }
        }
        kl++;
        continue;
      }
      if (k >= list[0].instanceMatrix.count) this._grow(list, k + 1);
      for (let j = 0; j < list.length; j++) {
        const dst = list[j];
        dst.instanceMatrix.array.set(A.subarray(o, o + 16), k * 16);
        if (dst.instanceColor && col) { const c = dst.instanceColor.array; c[k * 3] = col[i * 3]; c[k * 3 + 1] = col[i * 3 + 1]; c[k * 3 + 2] = col[i * 3 + 2]; }
      }
      k++;
    }
    this._finish(list, this.srcs, k);
    if (useLod) this._finish(lodList, [this.lodSrc], kl);
    return k + kl;
  }
}
const LOD_DIST2 = 120 * 120;

export function installVehicleCulling(traffic, engine) {
  const scene = engine.scene;
  const groups = [];
  const add = (pools, tag, lodFrom) => {
    for (const [k, P] of Object.entries(pools || {})) {
      const lodSrc = lodFrom && lodFrom[k] && lodFrom[k].shell ? lodFrom[k].shell : null;
      if (P.mb && P.md) groups.push(new Group(scene, [P.mb, P.md, ...(P.mx || [])], P.cap || 128, `${tag}:${k}`, lodSrc));
      if (P.shell) groups.push(new Group(scene, [P.shell], P.cap || 128, `${tag}:${k}:shell`));
    }
  };
  add(traffic.pools, 'm', traffic.parked);   // moving cars borrow the parked fleet's shells as LOD
  add(traffic.parked, 'p', null);            // parked pools already rebucket to shells at 120 m
  // r8 GEOMETRIC SPECULAR AA on the fleet (?aa=0 reverts). glitch-r7.md 3.6 #8:
  // "white car bodywork — specular highlight aliasing on vehicle paint". Car
  // paint is a MeshPhysicalMaterial at roughness 0.30 under clearcoat 1.0 /
  // clearcoatRoughness 0.06, and a 0.06 lobe on a curved, sub-pixel-detailed
  // body panel cannot be resolved by one shaded sample: it sparkles. three's
  // own geometryRoughness widens both lobes from `nonPerturbedNormal`, but it
  // uses max(|dN|) per component with no variance weighting and no clamp,
  // which under-filters exactly at high curvature. applySpecAA replaces that
  // with the Tokuyoshi-Kaplanyan filtered variance (materials.js).
  //
  // WHY HERE AND NOT IN traffic.js, WHERE THE MATERIALS ARE AUTHORED: that
  // file is off-limits to this pass. This module already reaches into and
  // mutates the same material objects (mkRender sets `shadowSide` on them for
  // the same kind of reason), and it sees every pool exactly once at install.
  // LEAD: the one-line home for this is traffic.js's material factory —
  // `applySpecAA(new THREE.MeshPhysicalMaterial({...}), { clearcoat: true })`
  // on `body`/`body2`/`chrome`/`trim`/`glass` — move it there when convenient.
  for (const g of groups) for (const s of [...(g.srcs || []), g.lodSrc]) if (s) fleetSpecAA(s.material);
  const camPos = new THREE.Vector3(1e9, 1e9, 1e9), camQ = new THREE.Quaternion();
  const sunT = new THREE.Vector3(1e9, 0, 1e9), sunD = new THREE.Vector3(), v = new THREE.Vector3();
  let shBoxV = -1;
  const stats = { main: 0, shadow: 0, ms: 0 };
  const cull = () => {
    const t0 = performance.now();
    const cam = engine.camera;
    cam.updateMatrixWorld();
    if (cam.position.distanceToSquared(camPos) > 0.25 || 1 - Math.abs(cam.quaternion.dot(camQ)) > 2e-5) {
      camPos.copy(cam.position); camQ.copy(cam.quaternion); planesFrom(cam, _pl);
    }
    const sun = engine.sun;
    let shadowOn = false;
    if (sun && sun.castShadow) {
      shadowOn = true;
      sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
      v.subVectors(sun.position, sun.target.position).normalize();
      // engine.shadowBoxV ticks when the near cascade's ortho box resizes with
      // camera height — the cached plane set has to be rebuilt for that too
      const bv = engine.shadowBoxV || 0;
      if (sun.target.position.distanceToSquared(sunT) > 64 || v.dot(sunD) < 0.99995 || bv !== shBoxV) {
        shBoxV = bv;
        sunT.copy(sun.target.position); sunD.copy(v);
        sun.shadow.updateMatrices(sun);
        planesFrom(sun.shadow.camera, _pl2);
      }
    }
    let a = 0, b = 0;
    const cx = cam.position.x, cz = cam.position.z;
    for (const g of groups) {
      a += g.compact(g.main, g.lodMain, _pl, PAD_MAIN, cx, cz);
      if (shadowOn) b += g.compact(g.shadow, g.lodShadow, _pl2, PAD_SHADOW, cx, cz);
      else { for (const m of g.shadow) m.count = 0; if (g.lodShadow) g.lodShadow[0].count = 0; }
    }
    // CS11 (docs/notes/contact-r11.md, ?cs11v=0): re-emit this frame's visible
    // vehicles as contact ellipses so a car reads as standing on the asphalt
    // rather than hovering 10 cm over it. Runs on the COMPACTED sets, i.e. only
    // the cars already on screen.
    csVehicles(scene, groups);
    stats.main = a; stats.shadow = b; stats.ms = performance.now() - t0;
  };
  const orig = traffic.update.bind(traffic);
  traffic.update = (dt, px, pz) => { orig(dt, px, pz); cull(); };
  const shadowMeshes = () => { const out = []; for (const g of groups) { out.push(...g.shadow); if (g.lodShadow) out.push(...g.lodShadow); } return out; };
  const sm = shadowMeshes();
  engine.addShadowListener?.((phase) => {
    if (phase === 'nearBegin') { const on = Instancer.shadowSets; for (const m of sm) m.visible = on && m.count > 0; }
    else if (phase === 'nearEnd') { for (const m of sm) m.visible = false; }
  });
  traffic.cullStats = stats;
  return stats;
}
