// CARLA prop passes (CC-BY 4.0, see DATA_SOURCES.md).
// Phase 1 (upgradeProps): swap already-PLACED street furniture pool geometry
// for real CARLA meshes — instances (positions from NYC open data) stay.
// Phase 2 (placeProps): NEW placements that stream with their host furniture —
// instancer.claim/release are hooked so every bikeRack/litter/scaffold claim
// also claims companion instances (bikes, trash bags, construction clusters)
// in dedicated pools, and releases them with the host tile.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { steamSpots, plumeSpots, lampSpots } from '../world/life.js';
// N11 — night ambient (docs/notes/night-r11.md 1.4): street-light fixture type
// per pole, and the Bishop's Crook posts, which registered no light pool at all.
import { N11, lampKind } from '../world/night11.js';

// street-bike frame palette (matte/anodised tones; the white-framed glb takes these per instance).
// The three near-black entries are gone: a black frame on a black-tyred bike at
// a rack reads as a tangle of dark rings with no bicycle in it, which is half of
// what "a broken pile of bicycles" (critic round 5 defect 4) was seeing.
const BIKE_COLORS = [0x2b5f9e, 0xb33a3a, 0x2f7a4f, 0xc9952c, 0xd9dde2, 0x5d3f9c, 0x8a9099, 0x0f6f80, 0x8a4a22, 0x3f7fb5, 0xd8552f, 0x6f9a3a];

// Kasa (algebraic) least-squares circle fit over a flat [a0,b0, a1,b1, ...] list:
// minimises |p|^2 - 2a*x - 2b*y - c, i.e. solves a 3x3 normal system. Returns
// [centreA, centreB, radius] or null on a degenerate system.
function fitCircle(P) {
  const n = P.length / 2;
  if (n < 6) return null;
  let Sx = 0, Sy = 0, Sxx = 0, Syy = 0, Sxy = 0, Sxz = 0, Syz = 0, Sz = 0;
  for (let i = 0; i < n; i++) {
    const x = P[i * 2], y = P[i * 2 + 1], z = x * x + y * y;
    Sx += x; Sy += y; Sxx += x * x; Syy += y * y; Sxy += x * y; Sxz += x * z; Syz += y * z; Sz += z;
  }
  const A = [2 * Sxx, 2 * Sxy, Sx, 2 * Sxy, 2 * Syy, Sy, 2 * Sx, 2 * Sy, n];
  const B = [Sxz, Syz, Sz];
  const det3 = (m) => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
  const D = det3(A);
  if (Math.abs(D) < 1e-12) return null;
  const col = (k) => { const m = A.slice(); for (let i = 0; i < 3; i++) m[i * 3 + k] = B[i]; return det3(m) / D; };
  const a = col(0), b = col(1), r2 = col(2) + a * a + b * b;
  return r2 > 1e-6 ? [a, b, Math.sqrt(r2)] : null;
}

// CARLA's road bike is modelled with SOLID wheel plates, so the in-plane wheel
// geometry is dropped and rebuilt as a real bicycle wheel: tyre, rim, hub and
// spokes at the measured centre and radius. Pedals, cranks and the handlebar
// live in the SAME "wheels" material but out of plane, and are kept.
//
// ROUND 6 (critic round 5 defect 4, "a broken pile of bicycles"). The wheel
// centres and radii used to come from the centroid and the MAXIMUM vertex
// radius of each half, split at the MEAN axis coordinate of the wheel vertices.
// On SM_RoadBike all three of those are wrong, measured:
//   mean split      -0.0742  (dragged off centre by the bottom bracket)
//   -> the chainring verts at x ~ -0.065 land on the FRONT wheel's side, 0.50 m
//      from its centre, and max-radius swallows them:
//   front R  0.501 vs 0.321 true (+56 %),  rear R 0.382 vs 0.319 (+20 %)
//   torus bottoms  -0.048 / -0.148 m, i.e. BELOW the model's own ground plane
// and because bakeGeo measures height and re-grounds on what this function
// returns, that scaled the whole bike to 86 % (1.64 -> 1.41 m long) and lifted
// its frame 0.128 m off its own dropouts: two different-sized wheels, forks not
// meeting them, and a hollow 14 mm ring with nothing inside it.
//
// Now: split at the GEOMETRIC midpoint of the axis extremes, then fit each
// wheel with a trimmed Kasa circle fit (4 passes over the vertices within
// +-22 % of the current circle). The tyre is a dense band at constant radius so
// the fit locks onto it and the crank/pedal outliers never enter the system.
// Measured output: R 0.319 / 0.321, centres within 15 mm of the frame's own
// dropouts. Both wheels then take the mean radius and a shared hub height, and
// the returned geometry reports `userData.groundY` = the tyre contact, which is
// what bakeGeo must scale and ground on (the model's lowest vertex is a PEDAL
// 19 mm under the tyre).
function hollowWheels(ge, hollow) {
  const pos = ge.getAttribute('position'), P = pos.array, n = pos.count;
  const idx = []; for (let i = 0; i < n; i++) if (hollow[i]) idx.push(i);
  if (idx.length < 30) return ge;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const i of idx) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i * 3 + k]); mx[k] = Math.max(mx[k], P[i * 3 + k]); }
  const ax = (mx[0] - mn[0]) >= (mx[2] - mn[2]) ? 0 : 2;   // long axis: wheels lie in the (ax, y) plane
  const lat = ax === 0 ? 2 : 0;
  // the CARLA "wheels" material also carries pedals, cranks and the handlebar (lateral +-0.17,
  // y up to 1.04): only vertices in the wheel plane (|lateral| < 0.06) and below 72 % of the
  // model height define the wheel centres and radii
  let latSum = 0; for (const i of idx) latSum += P[i * 3 + lat]; const lat0 = latSum / idx.length;
  const yTop = mn[1] + (mx[1] - mn[1]) * 0.72;
  const wheelV = idx.filter((i) => Math.abs(P[i * 3 + lat] - lat0) < 0.06 && P[i * 3 + 1] < yTop);
  if (wheelV.length < 60) return ge;
  // ground datum + a radius seed: the in-plane wheel material spans exactly one
  // wheel diameter from the mesh's lowest point to the top of the tyre
  let yG = 1e9, yMx = -1e9, axMin = 1e9, axMax = -1e9;
  for (let i = 0; i < n; i++) if (P[i * 3 + 1] < yG) yG = P[i * 3 + 1];
  for (const i of wheelV) {
    const a = P[i * 3 + ax], y = P[i * 3 + 1];
    if (a < axMin) axMin = a; if (a > axMax) axMax = a; if (y > yMx) yMx = y;
  }
  const Rg = Math.max(0.04, (yMx - yG) / 2);
  const midG = (axMin + axMax) / 2;                        // GEOMETRIC, not mean
  const C = [null, null], R = [Rg, Rg];
  for (let w = 0; w < 2; w++) {
    let cA = w === 0 ? axMin + Rg : axMax - Rg, cY = yG + Rg, r = Rg;
    for (let it = 0; it < 4; it++) {
      const sel = [];
      for (const i of wheelV) {
        const a = P[i * 3 + ax], y = P[i * 3 + 1];
        if ((a < midG ? 0 : 1) !== w) continue;
        if (Math.abs(Math.hypot(a - cA, y - cY) - r) > 0.22 * r) continue;
        sel.push(a, y);
      }
      const f = sel.length >= 40 ? fitCircle(sel) : null;
      if (!f || !(f[2] > 0.04 && f[2] < 1.2)) break;
      cA = f[0]; cY = f[1]; r = f[2];
    }
    C[w] = [cA, cY]; R[w] = r;
  }
  // a bicycle's two wheels are the same size and share a hub height
  const Rw = (R[0] + R[1]) / 2, hubY = (C[0][1] + C[1][1]) / 2;
  if (!(Rw > 0.05 && Rw < 0.9)) return ge;
  // drop the whole in-plane wheel (a fan disc cannot be partially cut without
  // leaving a dashed rim); everything out of plane or above yTop is kept
  const T = n / 3, keep = new Uint8Array(T).fill(1); let m = T;
  for (let t = 0; t < T; t++) {
    const a = t * 3;
    if (!hollow[a] || !hollow[a + 1] || !hollow[a + 2]) continue;
    const cl = (P[a * 3 + lat] + P[(a + 1) * 3 + lat] + P[(a + 2) * 3 + lat]) / 3;
    const cy = (P[a * 3 + 1] + P[(a + 1) * 3 + 1] + P[(a + 2) * 3 + 1]) / 3;
    if (Math.abs(cl - lat0) < 0.08 && cy < yTop) { keep[t] = 0; m--; }
  }
  if (m === T) return ge;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const src = ge.getAttribute(name); if (!src) continue;
    const it = src.itemSize, dst = new Float32Array(m * 3 * it); let o = 0;
    for (let t = 0; t < T; t++) { if (!keep[t]) continue; dst.set(src.array.subarray(t * 3 * it, (t + 1) * 3 * it), o); o += 3 * it; }
    out.setAttribute(name, new THREE.BufferAttribute(dst, it));
  }
  // ---- the wheel itself. 662 tris each against 680 for the old ring+hub, so a
  // wheel that READS as a wheel at 3-8 m is free: a tyre with volume, a rim
  // ring inside it, a hub barrel and 8 spokes. The tyre keeps the material's
  // own (black) colour so it stays black under any instance tint; rim, hub and
  // spokes are baked as greys, so the value structure INSIDE the wheel survives
  // whatever frame colour the instance carries.
  const col = ge.getAttribute('color');
  let wc = [0.08, 0.08, 0.08];
  if (col) for (const i of wheelV) { wc = [col.array[i * 3], col.array[i * 3 + 1], col.array[i * 3 + 2]]; break; }
  const RIM = [0.56, 0.58, 0.60], HUB = [0.62, 0.64, 0.66], SPK = [0.74, 0.76, 0.78];
  const SPOKES = 8, wheels = [];
  for (let w = 0; w < 2; w++) {
    const cA = C[w][0];
    const build = [
      [new THREE.TorusGeometry(Math.max(0.01, Rw - 0.017), 0.017, 6, 30), wc],                 // tyre
      [new THREE.TorusGeometry(Math.max(0.008, Rw - 0.048), 0.011, 4, 30), RIM],               // rim
      [new THREE.CylinderGeometry(0.028, 0.028, 0.085, 7, 1, true).rotateX(Math.PI / 2), HUB], // hub barrel
    ];
    const r0 = 0.030, r1 = Math.max(r0 + 0.02, Rw - 0.052);
    for (let s = 0; s < SPOKES; s++) {
      const th = (s / SPOKES) * Math.PI * 2 + 0.19, L = r1 - r0;
      const sg = new THREE.CylinderGeometry(0.0045, 0.0045, L, 3, 1, true);
      sg.translate(0, L / 2 + r0, 0);
      sg.rotateZ(th - Math.PI / 2);
      build.push([sg, SPK]);
    }
    for (const [g2, c3] of build) {
      if (lat === 0) g2.rotateY(Math.PI / 2);          // wheel plane (x,y) with axis z -> plane (z,y) with axis x
      const p3 = [0, 0, 0]; p3[ax] = cA; p3[1] = hubY; p3[lat] = lat0;
      g2.translate(p3[0], p3[1], p3[2]);
      const ng = g2.toNonIndexed(); ng.deleteAttribute('uv');
      const nv = ng.getAttribute('position').count, cc = new Float32Array(nv * 3);
      for (let i = 0; i < nv; i++) { cc[i * 3] = c3[0]; cc[i * 3 + 1] = c3[1]; cc[i * 3 + 2] = c3[2]; }
      ng.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      wheels.push(ng);
    }
  }
  const merged = mergeGeometries(m > 0 ? [out, ...wheels] : wheels, false);
  merged.userData.groundY = hubY - Rw;   // the tyre contact patch
  return merged;
}

async function bakeGeo(loader, base, file, tint, targetH, longAxisX = false, matTints = null, hollowRe = null) {
  const g = await loader.loadAsync(base + file);
  g.scene.updateMatrixWorld(true);
  const parts = [];
  let groundY = null;   // a re-meshed wheel reports its tyre contact patch
  // per-material vertex colours: `matTints` = [[/name regex/, hex], ...] overrides `tint` for the
  // matching glTF material (a bike's tyres stay black while its frame takes the instance colour)
  const tintFor = (mat) => { if (!matTints) return tint; const n = (mat?.name || '').toLowerCase(); for (const [re, hex] of matTints) if (re.test(n)) return hex; return tint; };
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    let ge = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (ge.index) ge = ge.toNonIndexed();
    for (const a of Object.keys(ge.attributes)) if (a !== 'position' && a !== 'normal') ge.deleteAttribute(a);
    const n = ge.getAttribute('position').count;
    const carr = new Float32Array(n * 3);
    const hollow = new Uint8Array(n);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const groups = ge.groups && ge.groups.length ? ge.groups : [{ start: 0, count: n, materialIndex: 0 }];
    for (const gr of groups) {
      const mat = mats[gr.materialIndex] ?? mats[0];
      const col = new THREE.Color(tintFor(mat));
      const isH = !!(hollowRe && hollowRe.test((mat?.name || '').toLowerCase()));
      const end = Math.min(n, gr.start + (gr.count === Infinity ? n : gr.count));
      for (let i = gr.start; i < end; i++) { carr[i * 3] = col.r; carr[i * 3 + 1] = col.g; carr[i * 3 + 2] = col.b; if (isH) hollow[i] = 1; }
    }
    ge.setAttribute('color', new THREE.BufferAttribute(carr, 3));
    ge.clearGroups();
    if (hollowRe) {
      ge = hollowWheels(ge, hollow);
      if (ge.userData && ge.userData.groundY != null) groundY = ge.userData.groundY;
    }
    parts.push(ge);
  });
  if (!parts.length) return null;
  const geo = mergeGeometries(parts, false);
  const bb = new THREE.Box3().setFromBufferAttribute(geo.getAttribute('position'));
  const size = bb.getSize(new THREE.Vector3());
  // GROUND DATUM. A re-meshed wheel has a real contact patch, and it is NOT the
  // model's lowest vertex: on SM_RoadBike a pedal hangs 19 mm below the tyre.
  // Height and grounding both have to come from the wheel, or the bike is
  // scaled by a pedal and stood on one (critic round 5 defect 4).
  const gy = groundY != null ? groundY : bb.min.y;
  const sc = targetH / Math.max(bb.max.y - gy, 0.01);
  geo.scale(sc, sc, sc);
  if (longAxisX && size.z * sc > size.x * sc) geo.rotateY(Math.PI / 2);
  const bb2 = new THREE.Box3().setFromBufferAttribute(geo.getAttribute('position'));
  const c = bb2.getCenter(new THREE.Vector3());
  geo.translate(-c.x, -(groundY != null ? groundY * sc : bb2.min.y), -c.z);
  return geo;
}

export async function upgradeProps(instancer) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  const BASE = 'models/carla/Carla/Static/';
  const MAP = [
    // poolName, glb, tint (baked as vertex color — the pool material expects it), targetHeight
    ['litter', 'Dynamic/Trash/SM_TrashCan01.glb', 0x3a4a3c, 1.15],
    ['dumpster', 'Dynamic/Trash/SM_Dumpster.glb', 0x2f5233, 1.45],
    ['cone', 'Dynamic/Construction/SM_ConstructionCone.glb', 0xc2481f, 0.72],
  ];
  for (const [pool, file, tint, targetH] of MAP) {
    const p = instancer.pools.get(pool);
    if (!p) continue;
    try {
      const geo = await bakeGeo(loader, BASE, file, tint, targetH);
      if (!geo) continue;
      const old = p.mesh.geometry;
      p.mesh.geometry = geo;
      old.dispose();
      console.log('[props] upgraded', pool);
    } catch (e) { console.warn('[props] failed', pool, e); }
  }
}

// phase 2: hook installs SYNCHRONOUSLY (host claims from the first streamed
// tiles queue up until the GLBs finish loading, then backfill)
export function placeProps(instancer) {
  const scene = instancer.pools.values().next().value.mesh.parent;
  const origClaim = instancer.claim.bind(instancer);
  const origRelease = instancer.release.bind(instancer);
  const companions = new Map(); // 'host:id' -> [[pool, id], ...]
  const pending = new Map();    // 'host:id' -> [name, x, y, z, rotY] awaiting geo load
  let ready = false;
  const HOSTS = new Set(['bikeRack', 'litter', 'scaffold', 'ventPipe', 'bulkhead', 'lampCobra']);
  // N11: a historic-district block lit by Bishop's Crooks had NO light at night —
  // lampCrook was never a companion host, so it registered no pool and no lamp.
  if (N11) HOSTS.add('lampCrook');
  const h2 = (x, z, s) => { const v = Math.sin(x * 12.9898 + z * 78.233 + s * 37.719) * 43758.5453; return v - Math.floor(v); };

  const addKids = (name, id, x, y, z, rotY) => {
    const kids = [];
    const ca = Math.cos(rotY), sa = Math.sin(rotY);
    const put = (pool, dx, dz, ry, s = 1, color = null) => {
      const kid = origClaim(pool, x + dx * ca + dz * sa, y, z - dx * sa + dz * ca, ry, s, s, s, color);
      if (kid >= 0) kids.push([pool, kid]);
    };
    const r = h2(x, z, 1);
    if (name === 'bikeRack') {
      // bikes lean parallel to the rack hoop (both long axes = local X); frame colour per bike.
      // 0.18 m off the hoop plane, not 0.26-0.28: a bike locked to a hoop rack is AGAINST it, and
      // at a quarter of a metre the two read as unrelated objects that happen to overlap.
      const bikeCol = (k) => BIKE_COLORS[(h2(x, z, k) * BIKE_COLORS.length) | 0];
      if (r < 0.62) put('bike', 0.05, 0.18, rotY + (h2(x, z, 2) - 0.5) * 0.22, 1, bikeCol(8));
      if (r < 0.26) put('bike', -0.10, -0.19, rotY + Math.PI + (h2(x, z, 3) - 0.5) * 0.22, 1, bikeCol(9));
    } else if (name === 'litter') {
      // curbside garbage day: bags/boxes tucked against some cans
      if (r < 0.22) put('trashbag', 0.55 + h2(x, z, 4) * 0.3, 0.15, h2(x, z, 5) * 6.28);
      if (r < 0.1) put('trashbag', -0.5, 0.45, h2(x, z, 6) * 6.28, 0.85);
      if (r > 0.9) put('cbox', 0.7, -0.3, h2(x, z, 7) * 6.28);
      // curb steam grate (NYC signature — consumed by world/life.js)
      if (r > 0.3 && r < 0.37) steamSpots.push([x + 1.8, y, z + 1.2]);
    } else if (name === 'lampCobra') {
      // ground light pool under the cobra head (arm reaches ~3.4m street-side)
      // N11: + the fixture kind (3000 K / 4000 K LED / sodium) and the luminaire's
      // MOUNTING HEIGHT, which carlights.js had hard-coded at 6.6 m for every lamp
      // against a kit cobrahead that puts its head 9.1 m up.
      lampSpots.push([x + Math.sin(rotY) * 3.4, y + 0.07, z + Math.cos(rotY) * 3.4, lampKind(x, z, false), 8.2]);
    } else if (name === 'lampCrook') {
      // N11: Bishop's Crook — teardrop luminaire 6.6 m up and 1.7 m out, so a much
      // smaller and (mostly) sodium-warmer pool than a cobrahead's.
      lampSpots.push([x + Math.sin(rotY) * 1.7, y + 0.07, z + Math.cos(rotY) * 1.7, lampKind(x, z, true), 5.9]);
    } else if (name === 'ventPipe') {
      // some roof vents breathe: photoreal smoke plumes (world/life.js)
      if (r < 0.16) plumeSpots.push([x, y + 1.6, z, 0.5 + h2(x, z, 21)]);
    } else if (name === 'bulkhead') {
      if (r < 0.1) plumeSpots.push([x, y + 2.4, z, 0.8 + h2(x, z, 22)]);
    } else if (name === 'scaffold') {
      // 30% of sidewalk sheds get a work zone: cone run + barrier + sign
      // along the street face (shed local +Z = curb side, X = frontage)
      if (r < 0.3) {
        for (let i = 0; i < 4; i++) {
          put('conep', -3.6 + i * 2.4, 2.35 + Math.sin(i * 2.1) * 0.35 + h2(x, z, 8 + i) * 0.25, h2(x, z, 12 + i) * 6.28);
        }
        put('barrier', 4.6, 1.9, rotY + Math.PI / 2 + (h2(x, z, 16) - 0.5) * 0.3);
        put('warnsign', -4.7, 2.1, rotY + Math.PI + (h2(x, z, 17) - 0.5) * 0.4);
      }
    }
    if (kids.length) companions.set(name + ':' + id, kids);
  };

  instancer.claim = (name, x, y, z, rotY = 0, sx = 1, sy = 1, sz = 1, color = null) => {
    const id = origClaim(name, x, y, z, rotY, sx, sy, sz, color);
    if (id >= 0 && HOSTS.has(name)) {
      if (ready) addKids(name, id, x, y, z, rotY);
      else pending.set(name + ':' + id, [name, id, x, y, z, rotY]);
    }
    return id;
  };
  instancer.release = (name, id) => {
    const k = name + ':' + id;
    pending.delete(k);
    const kids = companions.get(k);
    if (kids) { for (const [p, i] of kids) origRelease(p, i); companions.delete(k); }
    origRelease(name, id);
  };

  // async part: load companion geometry, create pools, backfill queued hosts
  (async () => {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const BASE = 'models/carla/Carla/Static/';
    const DEFS = [
      // pool, glb, tint, height, cap, castShadow, longAxisX, [matTints]
      // bike: white frame so the per-instance colour (addKids palette) IS the frame colour; tyres/rims black
      ['bike', 'Bicycle/Roadbike/SM_RoadBike.glb', 0xffffff, 1.02, 2200, true, true, [[/wheel|tire|tyre|rim/, 0x141414]], /wheel|tire|tyre|rim/],
      ['trashbag', 'Dynamic/Trash/SM_TrasdhBag.glb', 0x24272b, 0.62, 1400, false, false],
      ['cbox', 'Dynamic/Trash/SM_CreasedBox02.glb', 0x8a6f4d, 0.5, 600, false, false],
      ['conep', 'Dynamic/Construction/SM_ConstructionCone.glb', 0xc2481f, 0.72, 3200, false, false],
      ['barrier', 'Dynamic/Construction/SM_StreetBarrier.glb', 0xb1502e, 1.0, 900, true, true],
      ['warnsign', 'Dynamic/Construction/SM_WarningConstruction.glb', 0xc27f28, 1.1, 900, true, false],
    ];
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    await Promise.all(DEFS.map(async ([pool, file, tint, h, cap, shadow, axX, matTints, hollowRe]) => {
      try {
        const geo = await bakeGeo(loader, BASE, file, tint, h, axX, matTints || null, hollowRe || null);
        if (!geo) return;
        const mesh = new THREE.InstancedMesh(geo, instancer.baseMat, cap);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        for (let i = 0; i < cap; i++) mesh.setMatrixAt(i, zero);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.castShadow = shadow;
        scene.add(mesh);
        instancer.pools.set(pool, { mesh, free: [], top: 0, cap, dirty: false });
      } catch (e) { console.warn('[props] companion failed', pool, e); }
    }));
    ready = true;
    const queued = [...pending.values()];
    pending.clear();
    for (const args of queued) addKids(...args);
    instancer.flush();
    console.log('[props] companion pools live,', queued.length, 'hosts backfilled');
    // debug: cap.mjs --eval "window.__rackPos()" -> a few live rack positions
    window.__rackPos = (n = 5) => {
      const p = instancer.pools.get('bikeRack');
      const out = [];
      const m = new THREE.Matrix4();
      for (let i = 0; i < p.top && out.length < n; i++) {
        p.mesh.getMatrixAt(i, m);
        const e = m.elements;
        if (e[0] || e[5]) out.push([Math.round(e[12]), Math.round(e[13]), Math.round(e[14])]);
      }
      return out;
    };
    // debug: cap.mjs --eval "window.__propCounts()"
    window.__propCounts = () => {
      const out = {};
      for (const n of ['bikeRack', 'litter', 'scaffold', 'bike', 'trashbag', 'cbox', 'conep', 'barrier', 'warnsign']) {
        const p = instancer.pools.get(n);
        if (p) out[n] = p.top - p.free.length;
      }
      return out;
    };
  })();
}
