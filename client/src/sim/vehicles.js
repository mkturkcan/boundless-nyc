// Vehicle geometry (placeholder fleet until real meshes are provided):
// two instanced meshes per class — tintable body + dark glass/wheels.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// VH13 — vehicle model pass, round 13 (docs/notes/vehicles-r13.md). `?vh13=0`
// restores the round-12 fleet verbatim: no plate uvs, no per-model lamp anchors.
export const VH13 = typeof location === 'undefined' || new URLSearchParams(location.search).get('vh13') !== '0';

function g(geo, x, y, z) { geo.translate(x, y, z); return geo; }

// VH13 — PLANAR UVs FOR THE LICENCE-PLATE BUCKET. `keepAttr` below strips every
// uv on load (the CARLA GLBs are untextured PBR constants, so a uv was dead
// weight on 14 buckets out of 15), which left PART_MATS.plate able to be a flat
// colour and nothing else: the blank white rectangle on every car in the owner's
// 2026-09-16 day frames. A plate is a flat panel and by the time this runs the
// model is centred with +Z forward, so a projection along z is exact. Front and
// rear plates are separate groups (split at z = 0) normalised to their own
// bounds, and u is MIRRORED on the rear group: a viewer reading the rear plate
// stands at -Z looking +Z, whose screen-right is -X.
function uvPlanarPlate(g2) {
  const pa = g2.getAttribute('position');
  if (!pa) return;
  const p = pa.array;
  const uv = new Float32Array((p.length / 3) * 2);
  for (const rear of [false, true]) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, hit = false;
    for (let t = 0; t + 8 < p.length; t += 9) {
      if (((p[t + 2] + p[t + 5] + p[t + 8]) / 3 < 0) !== rear) continue;
      hit = true;
      for (let k = 0; k < 9; k += 3) {
        if (p[t + k] < x0) x0 = p[t + k];
        if (p[t + k] > x1) x1 = p[t + k];
        if (p[t + k + 1] < y0) y0 = p[t + k + 1];
        if (p[t + k + 1] > y1) y1 = p[t + k + 1];
      }
    }
    if (!hit || x1 - x0 < 1e-5 || y1 - y0 < 1e-5) continue;
    const iw = 1 / (x1 - x0), ih = 1 / (y1 - y0);
    for (let t = 0; t + 8 < p.length; t += 9) {
      if (((p[t + 2] + p[t + 5] + p[t + 8]) / 3 < 0) !== rear) continue;
      for (let k = 0; k < 9; k += 3) {
        const u = (p[t + k] - x0) * iw, vi = (t / 3 + k / 3) * 2;
        uv[vi] = rear ? 1 - u : u;
        uv[vi + 1] = (p[t + k + 1] - y0) * ih;
      }
    }
  }
  g2.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// VH13 — LAMP ANCHORS in final model space. carlights.js used to hang every
// night sprite off ONE hard-coded offset (nose at +2.05 m, tail at -2.15 m,
// |x| 0.62, y 0.62) for a 3.7 m Micra, a 6.6 m Fuso Rosa and a 7.2 m box truck
// alike, so half the fleet's headlights floated clear of the bodywork and the
// other half's sat buried inside it. The models know where their lamps are —
// the `light` and `tail` buckets ARE the lenses — so take an AREA-WEIGHTED
// centroid per side (the lens dominates its own bracketry) plus a half-size for
// the sprite. Returns [left, right] per end; a single centred lamp (motorcycle,
// Vespa) is handed to both sides.
function lampAnchors(lightG, tailG, sz) {
  const end = (g2, dir) => {
    const p = g2?.getAttribute('position')?.array;
    if (!p) return null;
    // THE END-MOST 0.55 m ONLY. One CARLA lamp material spans everything that
    // glows: the ambulance's `light` bucket carries its roof beacons and side
    // markers as well as its headlamps, and an area-weighted centroid over the
    // whole bucket put its "headlight" 1.2 m behind the nose and 1.6 m up. The
    // lamp we want is always the one at the end of the car.
    let zEx = dir > 0 ? -1e9 : 1e9;
    for (let t = 0; t + 8 < p.length; t += 9) {
      const cz = (p[t + 2] + p[t + 5] + p[t + 8]) / 3;
      if (dir > 0 ? cz > zEx : cz < zEx) zEx = cz;
    }
    const zCut = zEx - dir * 0.55;
    const S = [-1, 1].map(() => ({ sx: 0, sy: 0, sz: 0, w: 0, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, zEx: dir > 0 ? -1e9 : 1e9 }));
    for (let t = 0; t + 8 < p.length; t += 9) {
      const cz0 = (p[t + 2] + p[t + 5] + p[t + 8]) / 3;
      if (dir > 0 ? cz0 < zCut : cz0 > zCut) continue;
      const cx = (p[t] + p[t + 3] + p[t + 6]) / 3;
      const ux = p[t + 3] - p[t], uy = p[t + 4] - p[t + 1], uz = p[t + 5] - p[t + 2];
      const vx = p[t + 6] - p[t], vy = p[t + 7] - p[t + 1], vz = p[t + 8] - p[t + 2];
      const a = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
      if (!(a > 1e-9)) continue;
      const c = S[cx < 0 ? 0 : 1];
      c.sx += cx * a; c.w += a;
      c.sy += ((p[t + 1] + p[t + 4] + p[t + 7]) / 3) * a;
      c.sz += ((p[t + 2] + p[t + 5] + p[t + 8]) / 3) * a;
      for (let k = 0; k < 9; k += 3) {
        if (p[t + k] < c.x0) c.x0 = p[t + k];
        if (p[t + k] > c.x1) c.x1 = p[t + k];
        if (p[t + k + 1] < c.y0) c.y0 = p[t + k + 1];
        if (p[t + k + 1] > c.y1) c.y1 = p[t + k + 1];
        const z = p[t + k + 2];
        if (dir > 0 ? z > c.zEx : z < c.zEx) c.zEx = z;
      }
    }
    // x and y from the area-weighted centroid, but z from the lens's OUTERMOST
    // vertex plus 1 cm: the sprite is a camera-facing billboard and the depth
    // test will eat any part of it that falls behind the lens it belongs to. A
    // curved lens's centroid sits centimetres inside its own surface, and that is
    // the same failure the old constants had at the Prius's tail.
    const mk = (c) => (c.w > 0 ? [c.sx / c.w, c.sy / c.w, c.zEx + dir * 0.01,
      Math.min(0.42, Math.max(0.055, (c.x1 - c.x0) / 2)), Math.min(0.32, Math.max(0.045, (c.y1 - c.y0) / 2))] : null);
    const L = mk(S[0]), R = mk(S[1]);
    if (!L && !R) return null;
    return [L || R, R || L];
  };
  // an END WITH NO GEOMETRY still needs an anchor, or carlights falls back to the
  // one-size constant that buried a Prius's tail sprite 100 mm inside its own
  // bumper (see the dusk-rain frame: the taxi at the stop bar shows no tail lamps
  // at all). Synthesise it from the model's own envelope instead — outboard,
  // a little over half height, just proud of the end face.
  const box = (dir) => (sz ? [[-0.33 * sz.x, 0.46 * sz.y, dir * (sz.z / 2 - 0.05), 0.10, 0.08],
    [0.33 * sz.x, 0.46 * sz.y, dir * (sz.z / 2 - 0.05), 0.10, 0.08]] : null);
  const front = end(lightG, 1) || box(1), rear = end(tailG, -1) || box(-1);
  return front || rear ? { front, rear } : null;
}

export function buildVehicleGeos() {
  // sedan body (per-instance color)
  const sedanBody = mergeGeometries([
    g(new THREE.BoxGeometry(1.8, 0.5, 4.45), 0, 0.58, 0),
    g(new THREE.BoxGeometry(1.72, 0.14, 4.5), 0, 0.36, 0),
  ]);
  const sedanDark = mergeGeometries([
    g(new THREE.BoxGeometry(1.6, 0.5, 2.3), 0, 1.06, -0.1),   // cabin/glass
    g(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 10).rotateZ(Math.PI / 2), -0.82, 0.33, 1.45),
    g(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 10).rotateZ(Math.PI / 2), 0.82, 0.33, 1.45),
    g(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 10).rotateZ(Math.PI / 2), -0.82, 0.33, -1.45),
    g(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 10).rotateZ(Math.PI / 2), 0.82, 0.33, -1.45),
  ]);
  // van/truck
  const vanBody = mergeGeometries([
    // the sim drives +Z forward (traffic.js yaw = atan2(dirx, dirz)); the cab used to sit at -Z, so every far-LOD van and
    // truck shell drove back-first (owner 2026-09-16). Body biased to the rear (-Z), cab and windscreen at the front (+Z).
    g(new THREE.BoxGeometry(2.05, 1.9, 5.6), 0, 1.3, -0.35),
    g(new THREE.BoxGeometry(1.95, 0.9, 1.6), 0, 0.85, 2.6),
  ]);
  const vanDark = mergeGeometries([
    g(new THREE.BoxGeometry(1.85, 0.6, 0.9), 0, 1.55, 2.75),
    g(new THREE.CylinderGeometry(0.4, 0.4, 0.28, 10).rotateZ(Math.PI / 2), -0.95, 0.4, 1.8),
    g(new THREE.CylinderGeometry(0.4, 0.4, 0.28, 10).rotateZ(Math.PI / 2), 0.95, 0.4, 1.8),
    g(new THREE.CylinderGeometry(0.4, 0.4, 0.28, 10).rotateZ(Math.PI / 2), -0.95, 0.4, -2.2),
    g(new THREE.CylinderGeometry(0.4, 0.4, 0.28, 10).rotateZ(Math.PI / 2), 0.95, 0.4, -2.2),
  ]);
  // bus
  const busBody = mergeGeometries([g(new THREE.BoxGeometry(2.55, 2.6, 11.6), 0, 1.65, 0)]);
  const busDark = mergeGeometries([
    g(new THREE.BoxGeometry(2.35, 0.8, 11.3), 0, 2.15, 0),
    g(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10).rotateZ(Math.PI / 2), -1.1, 0.45, 3.6),
    g(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10).rotateZ(Math.PI / 2), 1.1, 0.45, 3.6),
    g(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10).rotateZ(Math.PI / 2), -1.1, 0.45, -3.6),
    g(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10).rotateZ(Math.PI / 2), 1.1, 0.45, -3.6),
  ]);
  return { sedanBody, sedanDark, vanBody, vanDark, busBody, busDark };
}

// Manhattan fleet palette: yellow cabs over a mostly grayscale fleet
export function fleetColor(rnd) {
  const r = rnd();
  // reference calibration: cabs are common but not a third of the street;
  // the real fleet skews dark (blacks/grays/SUVs) with occasional color
  if (r < 0.17) return 0xf7b500;            // taxi
  if (r < 0.37) return 0x1a1c1f;            // black
  if (r < 0.5) return 0xe8e8e6;             // white
  if (r < 0.63) return 0x9aa0a4;            // silver
  if (r < 0.76) return 0x5b6165;            // gray
  if (r < 0.85) return 0x35404e;            // dark blue
  if (r < 0.91) return 0x6e1f1f;            // dark red
  if (r < 0.96) return 0x274a30;            // green
  return 0x7a5b28;                          // bronze
}


// Rebuild a COARSE wheel-cover plate as a wheel face. `list` is the raw
// per-material sub-geometries of a `*WheelCover*`/`*HubCap*` material, still in
// CARLA vehicle space. Returns { chrome: [geo], dark: [geo] }, or null when the
// cover is dense enough to be real modelled geometry (>= 60 tris per wheel) or
// cannot be read as wheels at all — in which case the caller keeps the original.
//
// Every triangle is emitted TWICE, in both windings with matching normals, so
// the face is correct from either side and the vertex-normal repair pass below
// leaves it alone (each triangle agrees with its own winding). Backface culling
// discards one copy per view, so nothing z-fights.
function remeshWheelCovers(list) {
  const geos = list.filter((g2) => g2.getAttribute('position'));
  if (!geos.length) return null;
  let tris = 0;
  const bb = new THREE.Box3();
  for (const g2 of geos) { tris += g2.getAttribute('position').count / 3; bb.union(new THREE.Box3().setFromBufferAttribute(g2.getAttribute('position'))); }
  const ext = [bb.max.x - bb.min.x, 0, bb.max.z - bb.min.z];
  // the LATERAL axis is the shorter horizontal one: a car is longer than wide,
  // and the wheel plane always contains y
  const axL = ext[0] <= ext[2] ? 0 : 2, axA = axL === 0 ? 2 : 0;
  if (ext[axL] < 0.4 || ext[axA] < 0.8) return null;
  const K = ['x', 'y', 'z'];
  const midL = (bb.min[K[axL]] + bb.max[K[axL]]) / 2, midA = (bb.min[K[axA]] + bb.max[K[axA]]) / 2;
  // four clusters: min/max of each vertex triple's own bounds
  const cl = [];
  for (let i = 0; i < 4; i++) cl.push({ n: 0, mnA: 1e9, mxA: -1e9, mnY: 1e9, mxY: -1e9, mnL: 1e9, mxL: -1e9 });
  for (const g2 of geos) {
    const p = g2.getAttribute('position').array;
    for (let t = 0; t + 8 < p.length; t += 9) {
      const cA = (p[t + axA] + p[t + 3 + axA] + p[t + 6 + axA]) / 3;
      const cL = (p[t + axL] + p[t + 3 + axL] + p[t + 6 + axL]) / 3;
      const c = cl[(cL < midL ? 0 : 1) * 2 + (cA < midA ? 0 : 1)];
      c.n++;
      for (let v = 0; v < 9; v += 3) {
        const a = p[t + v + axA], y = p[t + v + 1], l = p[t + v + axL];
        if (a < c.mnA) c.mnA = a; if (a > c.mxA) c.mxA = a;
        if (y < c.mnY) c.mnY = y; if (y > c.mxY) c.mxY = y;
        if (l < c.mnL) c.mnL = l; if (l > c.mxL) c.mxL = l;
      }
    }
  }
  const live = cl.filter((c) => c.n > 4);
  if (live.length < 2 || tris / live.length >= 60) return null;
  const out = { chrome: [], dark: [] };
  const mk = (pos, nrm) => {
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g2.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
    return g2;
  };
  for (let ci = 0; ci < 4; ci++) {
    const c = cl[ci];
    if (c.n <= 4) continue;
    const cA = (c.mnA + c.mxA) / 2, cY = (c.mnY + c.mxY) / 2;
    const R = Math.max(c.mxA - c.mnA, c.mxY - c.mnY) / 2;
    if (!(R > 0.06 && R < 0.9)) continue;
    const sgn = ci < 2 ? -1 : 1;                    // outboard direction
    const off = sgn < 0 ? c.mnL : c.mxL;            // the outboard skin's plane
    const bright = { pos: [], nrm: [] }, dish = { pos: [], nrm: [] };
    const V = (a, y, l) => { const q = [0, 0, 0]; q[axA] = cA + a; q[1] = cY + y; q[axL] = off + l * sgn; return q; };
    const tri = (acc, A, B, Cq) => {
      for (const v of [A, B, Cq]) { acc.pos.push(v[0], v[1], v[2]); acc.nrm.push(axL === 0 ? sgn : 0, 0, axL === 2 ? sgn : 0); }
      for (const v of [A, Cq, B]) { acc.pos.push(v[0], v[1], v[2]); acc.nrm.push(axL === 0 ? -sgn : 0, 0, axL === 2 ? -sgn : 0); }
    };
    const ring = (acc, r0, r1, n, l) => {
      for (let i = 0; i < n; i++) {
        const t0 = (i / n) * Math.PI * 2, t1 = ((i + 1) / n) * Math.PI * 2;
        const p = (r, t) => V(Math.cos(t) * r, Math.sin(t) * r, l);
        if (r0 <= 1e-4) tri(acc, p(0, 0), p(r1, t0), p(r1, t1));
        else { tri(acc, p(r0, t0), p(r1, t0), p(r1, t1)); tri(acc, p(r0, t0), p(r1, t1), p(r0, t1)); }
      }
    };
    ring(dish, 0, R * 0.98, 20, 0.000);             // the dish behind the spokes
    ring(bright, R * 0.86, R, 20, 0.006);           // rim lip
    ring(bright, 0, R * 0.20, 8, 0.010);            // hub boss
    for (let s = 0; s < 5; s++) {                   // five spokes
      const th = (s / 5) * Math.PI * 2 + 0.31, hw = 0.20;
      const p = (r, dt) => V(Math.cos(th + dt) * r, Math.sin(th + dt) * r, 0.008);
      const A = p(R * 0.17, -hw * 0.9), B = p(R * 0.87, -hw * 0.34), Cq = p(R * 0.87, hw * 0.34), D = p(R * 0.17, hw * 0.9);
      tri(bright, A, B, Cq); tri(bright, A, Cq, D);
    }
    if (dish.pos.length) out.dark.push(mk(dish.pos, dish.nrm));
    if (bright.pos.length) out.chrome.push(mk(bright.pos, bright.nrm));
  }
  return out.chrome.length ? out : null;
}

// ---- CARLA fleet (CC-BY 4.0, see DATA_SOURCES.md): converted cooked-release
// GLBs baked into TWO merged geometries per model — paint slots (per-instance
// fleet color) and everything else (glass/wheels/lights/details) — matching
// the traffic pools' body+dark structure exactly.
export async function loadCarlaFleet() {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  const BASE = 'models/carla/Carla/Static/';
  const SPECS = [
    { key: 'tesla', file: 'Car/4Wheeled/Tesla/SM_Tesla.glb', cap: 110, w: 3, auto: true, shell: 'Car/4Wheeled/Tesla/SM_sc_TeslaM3.glb' },
    { key: 'crown', file: 'Car/4Wheeled/Ford_Crown/SK_Ford_Crown.glb', cap: 110, w: 3, auto: true, shell: 'Car/4Wheeled/Ford_Crown/SM_sc_FordCrown.glb' },
    { key: 'charger', file: 'Car/4Wheeled/DodgeCharger2020/SK_Charger2020.glb', cap: 80, w: 2, auto: true },
    { key: 'prius', file: 'Car/4Wheeled/Toyota_Prius/SK_Toyota_Prius.glb', cap: 110, w: 3, shell: 'Car/4Wheeled/Toyota_Prius/SM_sc_ToyotaPrius.glb' },
    { key: 'micra', file: 'Car/4Wheeled/Nissan_Micra/SM_NissanMicra.glb', cap: 80, w: 2, shell: 'Car/4Wheeled/Nissan_Micra/SM_sc_NissanMicra.glb' },
    { key: 'jeep', file: 'Car/4Wheeled/Jeep/SM_JeepWranglerRubicon.glb', cap: 80, w: 2, shell: 'Car/4Wheeled/Jeep/SM_sc_JeepWranglerR.glb' },
    { key: 'cybertruck', file: 'Car/4Wheeled/Cybertruck/SM_Cybertruck_v2.glb', cap: 36, w: 1, auto: true },
    // the CARLA Fuso Rosa is authored ~1.55x life size: 10.26 m long, 3.92 m
    // WIDE (no lane holds that) and 4.23 m tall (over the 4.11 m legal height),
    // wheelbase 5.63 m against the real bus's 3.49, and its licence plate is
    // 0.60 m wide where every other kind's is 0.24-0.44. 0.645 lands it on
    // 6.62 x 2.53 x 2.73 m, wheelbase 3.63 — a Rosa.
    { key: 'bus', file: 'Bus/Mitsubishi_FusoRosa/SK_Mitsubishi_FusoRosa.glb', cap: 30, w: 1, auto: true, scale: 0.645 },
    // trucks: the NYC working fleet (auto: merge folder-mate Door/Light/Glass
    // parts — CARLA ships doors as separate meshes in vehicle space)
    { key: 'sprinter', file: 'Truck/Sprinter/SK_Sprinter.glb', cap: 64, w: 2, auto: true },
    { key: 'boxtruck', file: 'Truck/CarlaCola/SM_CarlaCola.glb', cap: 36, w: 1, auto: true },
    { key: 'vwvan', file: 'Truck/VolkswagenT2/SK_Volkswagen_T2.glb', cap: 36, w: 1, auto: true, shell: 'Truck/VolkswagenT2/SM_sc_Volkswagen_T2.glb' },
    { key: 'ambulance', file: 'Truck/Ambulance/SK_Ambulance.glb', cap: 10, w: 1, auto: true },
    // two-wheelers (rider meshes are a later pass)
    // no auto on the Harley: its SM_Harley_Emissive_Front/Back.glb overlays are
    // coincident with the M_CarLightGlass_* lenses the body mesh already has
    { key: 'harley', file: 'Motorcycle/Harley/SM_Harley.glb', cap: 24, w: 1 },
    { key: 'vespa', file: 'Motorcycle/Vespa/SM_Vespa.glb', cap: 24, w: 1 },
    { key: 'yamaha', file: 'Motorcycle/Yamaha/SM_Yamaha.glb', cap: 24, w: 1, auto: true },
  ];
  // HAND-AUTHORED LAMPS, for kinds whose GLB ships no lamp material at all.
  // The Nissan Micra is the only one: SM_NissanMicra.glb is wheels / bodywork /
  // interior / details / glass / plate and the folder has no *Lights*.glb, so it
  // drove with no headlights AND no tail lamps while every other kind now has
  // both (docs/notes/fleet-qa.md open item 1). Rows are
  //   [|x| from centre, y, width, height, +1 front / -1 rear]
  // in the FINAL frame (origin at ground centre, +Z forward, metres), and both
  // sides are mirrored from each row. Quads go into `light`; the z = 0 split
  // further down sends the rear pair to `tail`, so they get the red lens.
  // Chosen by sweeping candidates against the model's own surface and keeping
  // the pair whose standoff is most uniform across the lamp: head 6-14 mm over
  // a 90 mm wrap, tail 5-12 mm over 26 mm. (|x| 0.58 w 0.32 was the first try
  // and put the outboard edge 200 mm off the bodywork; |x| 0.72 for the tail
  // reached 95 mm at the rear quarter.)
  //
  // VH13 adds REAR-ONLY rows for the two kinds that ship front lamps and no rear
  // ones at all. The fleet load log is unambiguous — `jeep: light:200` and
  // `prius: light:321` with no `tail` bucket on either, against a `tail` on the
  // other thirteen — so the z < 0 split has nothing to hand the red lens, and a
  // Prius taxi standing at a stop bar at dusk shows no tail lamps whatsoever
  // (fWeather frame 200). Both are in the PARKED fleet on 125th, so they are in
  // every Harlem street plate. Dimensions are the real cars': a Gen-3 Prius
  // carries tall vertical corner units from the beltline to the bumper, a JK
  // Wrangler two small squares either side of the tailgate.
  const LAMPS = {
    micra: [[0.46, 0.66, 0.24, 0.15, 1], [0.66, 0.92, 0.20, 0.28, -1]],
    // |x| chosen by PROBING each model's own tail face, not from the real car's
    // lamp position: both rear panels are flat out to x ~0.77 and then fall away
    // hard (prius at y 0.90, z is -2.147 at x 0.64 and -2.140 at x 0.76 but
    // -1.884 at 0.82; jeep -1.585 out to x 0.76 and -1.30 at 0.82). A first pass
    // at the real |x| (0.74 / 0.68) put one edge of every quad in that fall-away
    // and raked the lamp 39 cm (prius) and 56 cm (jeep) front-to-back — a lamp
    // lying along the flank. Inboard by 12 cm and both edges sit on the flat.
    prius: [[0.62, 0.94, 0.20, 0.34, -1]],
    jeep: [[0.62, 1.02, 0.22, 0.26, -1]],
  };
  const keepAttr = ['position', 'normal'];
  const splitByGroups = (ge, mats) => {
    if (!ge.groups || !ge.groups.length) return [[ge, mats[0]]];
    return ge.groups.map((gr) => {
      const sub = new THREE.BufferGeometry();
      for (const name of keepAttr) {
        const src = ge.getAttribute(name);
        if (!src) continue;
        const arr = src.array.slice(gr.start * src.itemSize, (gr.start + gr.count) * src.itemSize);
        sub.setAttribute(name, new THREE.BufferAttribute(arr, src.itemSize));
      }
      return [sub, mats[gr.materialIndex] ?? mats[0]];
    });
  };
  // canonical door id from a mesh/node/file name. Handles every CARLA naming
  // scheme in the fleet: Door_FL, Door_Front_Left, Door_L, SM_DoorFL,
  // CrownDoor_Front_L, CyberTruckDoor_Rear_L... FL/LF-style pairs are NOT
  // ambiguous (fl+lf=front-left, rl+lr=rear-left, fr+rf=front-right).
  const doorCanon = (s) => {
    s = s.toLowerCase().replace(/\.glb$/, '');
    let pos = /front/.test(s) ? 'front' : /rear|back/.test(s) ? 'rear' : '';
    let side = /left/.test(s) ? 'left' : /right/.test(s) ? 'right' : '';
    const m = s.match(/door_?(fl|fr|rl|rr|lf|rf|lr)(?:_|$)/) || s.match(/(?:^|_)(fl|fr|rl|rr)(?:_|$)/)
      || (!side && (s.match(/door_?(l|r)(?:_|$|\d)/) || s.match(/_(l|r)$/)));
    const t = m && m[1];
    if (t === 'fl' || t === 'lf') { pos = 'front'; side = 'left'; }
    else if (t === 'fr' || t === 'rf') { pos = 'front'; side = 'right'; }
    else if (t === 'rl' || t === 'lr') { pos = 'rear'; side = 'left'; }
    else if (t === 'rr') { pos = 'rear'; side = 'right'; }
    else if (t === 'l') side = 'left';
    else if (t === 'r') side = 'right';
    return side ? (pos ? pos + '_' + side : side) : null;
  };
  const fleet = {};
  // manifest lists every staged glb per vehicle folder — used to auto-merge
  // the separate Door/Light/Glass meshes (authored in vehicle space)
  let manifest = {};
  try { manifest = await (await fetch(BASE.replace('Carla/Static/', '') + 'manifest.json')).json(); } catch {}
  await Promise.all(SPECS.map(async (sp) => {
    try {
      const dirKey = sp.file.split('/').slice(-2, -1)[0];
      const files = [sp.file];
      if (sp.auto && manifest[dirKey]) {
        for (const rel of manifest[dirKey]) {
          const fn = rel.split('/').pop();
          // int_*/ *_int / ext2 glass files are duplicate interior/inner layers
          // coincident with ext1 — invisible from outside, pure tri waste.
          // *Cop*/*Police*: the Charger folder ships a SECOND lights bundle for
          // the police car — same lamp material, coincident with the civilian
          // one (z-fight) plus M_sirensCop, a roof bar that was riding every
          // random-coloured Charger in the fleet (2026-09-04 fleet QA).
          if (/door|light|glass|emissive|blinker/i.test(fn)
            && !/sc_|_parked|skeleton|int_?\d|_int\d|ext_?2|cop|police/i.test(fn)
            && !rel.endsWith(sp.file.split('/').pop())) {
            files.push(rel.replace(/^Carla\/Static\//, ''));
          }
        }
      }
      const scenes = await Promise.all(files.map(async (f) => {
        try { const g2 = await loader.loadAsync(BASE + f); g2.scene.updateMatrixWorld(true); return g2.scene; }
        catch { return null; }
      }));
      // door SOCKETS: the main glb (SK skeleton or SM socket export) carries
      // Door_* nodes with the exact hinge transforms in vehicle space
      const doorNodes = new Map();
      if (scenes[0]) scenes[0].traverse((o) => {
        if (/(^|_)door/i.test(o.name)) { const k = doorCanon(o.name); if (k) doorNodes.set(k, o.matrixWorld.clone()); }
      });
      // material classes: the CARLA GLBs carry no textures, only named PBR constants
      // (Bodywork_Mat, GlassInstance, Rubber_Inst, PolishedAluminium*, MI_CarLightGlass_*_back...).
      // Collapsing everything but the paint into ONE dark material made the fleet read as toys
      // (2026-09-04 review) — keep glass / chrome / tyres / lamps / plates as their own pools.
      //
      // The name is ALL there is, so the rules below were written against a dump
      // of every material in the fleet WITH ITS BOUNDING BOX (docs/notes/fleet-qa.md):
      // that is what says MI_Harley_LampSupport (1798 t of fork bracket) is not a
      // lamp, CarlaCola's "WindowMat" (y 0.37-0.65, under the deck) is not a
      // window, and the VW T2's "White" (y 0.37-2.03, whole body) is its upper
      // body shell and must not go to the near-black trim pool.
      const CLASS_OF = (n) => {
        if (/plate|license|licence/.test(n)) return 'plate';
        // brackets/bezels that merely carry "lamp"/"light" in the name
        if (/lamp ?support|light ?support|light ?edge|lightholder|light ?bar/.test(n)) return 'dark';
        if (/siren/.test(n)) return 'tail';                     // roof light bar: red lens
        if (/wiper/.test(n)) return 'dark';
        if (/tail|back|rear|brake/.test(n) && /light|lamp|glass/.test(n)) return 'tail';
        if (/light|lamp|headl|emissive|blinker|_led|\bled\b/.test(n)) return 'light';
        if (/orangemetal/.test(n)) return 'light';              // indicator / round headlamp lens (jeep, prius)
        if (/glass|window|windshield|windscreen/.test(n)) return 'glass';
        // hub caps and wheel covers are brightwork, not tyre rubber — they were
        // matte black, which is why the wheels read as flat discs
        if (/hub ?cap|wheel ?cover|cover ?wheel|\brim\b|alloy/.test(n)) return 'chrome';
        if (/rubber|tire|tyre|wheel|hub/.test(n)) return 'tire';
        if (/polished|chrome|mirror|alumin/.test(n)) return 'chrome';
        // structural metal (VespaMetal, YamahaMetal, CarlaCola's MetalBars) is
        // satin, not brightwork: mirror chrome over a whole scooter read as a toy
        if (/metal|steel|brushed|grill|bars/.test(n)) return 'trim';
        if (/^white$|_white$/.test(n)) return 'body2';          // the T2's two-tone upper body
        if (/body|paint|carpaint|bodyside|bodywork/.test(n)) return 'paint';
        return 'dark';
      };
      // per-kind corrections where the name is simply wrong or missing
      const OVERRIDE = {
        yamaha: [[/^yamahaothers$/, 'paint']],                  // the only body material the bike has
        boxtruck: [[/windowmat/, 'dark']],                      // lower side skirt, not glazing
        // a Vespa's monocoque IS steel: VespaMetal spans the whole envelope
        // (x -0.76..0.81, y 0.14..1.24, z +-0.43) and is the painted shell,
        // while VespaBOdy is a +-0.22 m spine down the middle
        vespa: [[/vespametal/, 'paint']],
      };
      // whole materials to drop: inner glazing layers coincident with the
      // exterior pane (M_Glass_Int), and the cybertruck's per-window M_windows
      // copies of the same panes SM_Cyber_Glass_ext_1 already carries
      const DROP_MAT = /glass_?int|_int(\d|$)/;
      const DROP_KIND = { cybertruck: /^m_windows$/ };
      // wheel covers / hub caps are held aside so a COARSE one can be rebuilt —
      // see the wheel-face pass below
      const COVER_RE = /hub ?cap|wheel ?cover|cover ?wheel/;
      const covers = [];
      const buckets = { paint: [], body2: [], dark: [], glass: [], chrome: [], trim: [], light: [], tail: [], tire: [], plate: [] };
      const paint = buckets.paint, dark = buckets.dark;
      const over = OVERRIDE[sp.key] || null;
      const dropKind = DROP_KIND[sp.key] || null;
      const classOf = (n) => {
        if (over) for (const [re, cls] of over) if (re.test(n)) return cls;
        return CLASS_OF(n);
      };
      const bbTmp = new THREE.Box3();
      let mainHasLamp = false;
      for (let si = 0; si < scenes.length; si++) {
        if (si === 1) mainHasLamp = !!(buckets.light.length || buckets.tail.length);
        const sc = scenes[si];
        if (!sc) continue;
        const fn = files[si].split('/').pop();
        // A LIGHTS BUNDLE ON A MODEL WHOSE OWN MESH ALREADY HAS LAMPS IS A
        // DUPLICATE. The VW T2's body mesh carries MI_CarLightGlass_..._front
        // AND ..._back; the folder's SM_Volkswagen_T2Lights.glb is the same
        // lamps again, so a white copy sat on top of the red tail lenses.
        // (Only the MAIN mesh counts: the Sprinter's lens and reflector arrive
        // as two different auto-merged files and both belong. Emissive/blinker
        // files add lamps a model lacks, so they are never skipped.)
        if (si > 0 && mainHasLamp && /light/i.test(fn) && !/emissive|blinker|glass|door/i.test(fn)) continue;
        // *_Emissive_*/*Blinker* files name their material "Default_Material":
        // the class has to come from the file, not the material
        const forced = /emissive|blinker/i.test(fn) ? 'light' : null;
        // separate door-BODY meshes are exported HINGE-LOCAL (they hang below
        // origin: bbox min.y < -0.3); door GLASS files are already in vehicle
        // space (min.y ~ +1). Re-seat hinge-local parts at their socket, and
        // drop them entirely if no socket matches (missing beats floating).
        let extraMat = null;
        if (si > 0 && /door/i.test(files[si])) {
          bbTmp.setFromObject(sc);
          if (bbTmp.min.y < -0.3) {
            extraMat = doorNodes.get(doorCanon(files[si].split('/').pop())) || null;
            if (!extraMat) {
              const side = /left|_l\b|l\.glb/i.test(files[si]) ? 'left' : 'right';
              extraMat = doorNodes.get(side) || null;
            }
            if (!extraMat) { console.warn('[fleet]', sp.key, 'no socket for', files[si].split('/').pop()); continue; }
          }
        }
        sc.traverse((o) => {
          if (!o.isMesh) return;
          let ge = o.geometry.clone().applyMatrix4(o.matrixWorld);
          if (extraMat) ge.applyMatrix4(extraMat);
          if (ge.index) ge = ge.toNonIndexed();
          for (const a of Object.keys(ge.attributes)) if (!keepAttr.includes(a)) ge.deleteAttribute(a);
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const [sub, mat] of splitByGroups(ge, mats)) {
            const n = (mat?.name || '').toLowerCase();
            if (DROP_MAT.test(n) || (dropKind && dropKind.test(n))) continue;
            const cls = forced || classOf(n);
            if (cls === 'chrome' && COVER_RE.test(n)) { covers.push(sub); continue; }
            buckets[cls].push(sub);
          }
        });
      }
      // A COARSE WHEEL COVER IS NOT A WHEEL FACE, IT IS A PLATE.
      // `Vh_Car_toyotaPrius_CoverWheelMat_BaseColor_Mat` is 112 triangles for
      // FOUR wheels — two coplanar skins of ~11-16 facets each, median area
      // 6.4e-3 m², 32 of them over 0.02 m², and the largest a single
      // 0.30 x 0.45 m triangle on a wheel of radius 0.245 m. Its normals are all
      // +-Z and 0 of 112 disagree with their winding, so nothing is broken about
      // it: it is simply a hexagonal plate. fleet-qa defect 11 moved it out of
      // matte tyre rubber into `chrome` (0xe4e8ea, roughness 0.16, metalness 1)
      // and thereby turned it into the critic's "large flat white triangle...
      // a play button painted on the tyre", confirmed on three instances in
      // three frames in three colours (round 5 defect 5).
      //
      // So rebuild it. Cluster the cover into up to four wheels (2 along the
      // lateral axis x 2 along the longitudinal), measure each cluster's centre,
      // radius and outboard plane from its own vertices, and emit a wheel face:
      // a dark dish, a bright rim lip, five spokes and a hub boss. Gated on
      // FEWER THAN 60 TRIANGLES PER WHEEL, which is what makes this safe — the
      // Jeep's hub cap (1210 t), the CarlaCola's (1520 t) and the T2's are real
      // geometry and are left exactly alone.
      // VH13 — A WHEEL FACE IS SATIN ALLOY, NOT BRIGHTWORK. Everything that came
      // out of a wheel used to land in `chrome` (0xe4e8ea, roughness 0.16,
      // metalness 1.0), i.e. a mirror, and a wheel face is broad and flat enough
      // to catch the whole sun lobe at once: measured on the round-13 street
      // plate vehicles13/before/markings125_day.png, the foreground Prius's
      // five-spoke faces read 144,145,143 (L p95 214) against a BONNET of
      // 80,119,154 (L 113) — the wheels are the brightest thing on the car.
      // That is round 5 defect 5 ("a large flat white triangle ... a play button
      // painted on the tyre") returning through a different door. `trim`
      // (0x6f767c, roughness 0.44, metalness 0.85) is the satin-metal pool the
      // fleet already has for exactly this kind of surface. Mirror brightwork —
      // bumpers, grilles, mirror shells — keeps `chrome`.
      const wheelFace = VH13 ? buckets.trim : buckets.chrome;
      if (covers.length) {
        const re = remeshWheelCovers(covers);
        if (re) { for (const g2 of re.chrome) wheelFace.push(g2); for (const g2 of re.dark) buckets.dark.push(g2); }
        else for (const g2 of covers) wheelFace.push(g2);
      }
      // WHEELS OUT OF THE BODY BUCKET. The crown / charger / sprinter /
      // ambulance / bus / cybertruck put the entire wheel in the one big
      // "M_Details"/"M_Interior" material, so rim and tyre came out as a single
      // flat dark disc (the review's "the Crown's wheels read as flat discs").
      // Their SK skeletons carry Wheel_* bones, and a bone's y IS the wheel
      // radius, so the wheels can be found geometrically: take the triangles
      // inside each hub cylinder out of `dark` — the inner 62 % of the radius is
      // the rim face (brightwork), the rest is tyre rubber.
      // VH13: ...OR WHEN THE `tire` BUCKET IS A DECOY. The gate used to be "no
      // tyre bucket at all", and the VW T2 has one that never touches the road:
      // its only rubber-named material is `Rubber_Inst`, the window and door
      // seals at y 1.348..1.868 (measured on the glb), while the road wheels are
      // `Fbx Default Material 17` at y -0.004..0.701 and therefore sat in `dark`
      // — four flat dark discs, which is exactly how the T2 reads in the owner's
      // fBrownstone frame. A tyre bucket whose LOWEST vertex is 0.3 m clear of
      // the ground is not tyres. (Every real one measures under 0.05: tesla
      // -0.009, micra 0.030, prius -0.038, jeep -0.007, carlacola -0.030.)
      let tireLowY = 1e9;
      for (const g2 of buckets.tire) { const b = new THREE.Box3().setFromBufferAttribute(g2.getAttribute('position')); if (b.min.y < tireLowY) tireLowY = b.min.y; }
      if (!buckets.tire.length || (VH13 && tireLowY > 0.3)) {
        const wheels = [];
        if (scenes[0]) scenes[0].traverse((o) => {
          if (!/^wheel_/i.test(o.name || '')) return;
          const p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
          if (p.y > 0.1 && p.y < 1.0) wheels.push(p);
        });
        if (wheels.length >= 2) {
          const hit = (cx, cy, cz) => {
            for (const w of wheels) {
              if (Math.abs(cz - w.z) > 0.26) continue;
              const dr = Math.hypot(cx - w.x, cy - w.y);
              if (dr <= w.y * 1.02) return dr < w.y * 0.62 ? 'chrome' : 'tire';
            }
            return null;
          };
          const keep = [], out = { tire: [], chrome: [] };
          for (const g2 of dark) {
            const pos = g2.getAttribute('position').array, nrm = g2.getAttribute('normal')?.array;
            const acc = { dark: [[], []], tire: [[], []], chrome: [[], []] };
            for (let t = 0; t < pos.length; t += 9) {
              const cls = hit((pos[t] + pos[t + 3] + pos[t + 6]) / 3, (pos[t + 1] + pos[t + 4] + pos[t + 7]) / 3, (pos[t + 2] + pos[t + 5] + pos[t + 8]) / 3) || 'dark';
              const a = acc[cls];
              for (let k = 0; k < 9; k++) { a[0].push(pos[t + k]); if (nrm) a[1].push(nrm[t + k]); }
            }
            for (const cls of ['dark', 'tire', 'chrome']) {
              const a = acc[cls];
              if (!a[0].length) continue;
              const ng = new THREE.BufferGeometry();
              ng.setAttribute('position', new THREE.BufferAttribute(new Float32Array(a[0]), 3));
              if (a[1].length) ng.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(a[1]), 3));
              (cls === 'dark' ? keep : out[cls]).push(ng);
            }
          }
          if (out.tire.length) {
            dark.length = 0; for (const g2 of keep) dark.push(g2);
            for (const g2 of out.tire) buckets.tire.push(g2);
            for (const g2 of out.chrome) wheelFace.push(g2);   // VH13: satin alloy, see the note above
          }
        }
      }
      // VH13 — A WHOLE WHEEL IN ONE TYRE MATERIAL IS A BLACK DISC. The pass above
      // only helps kinds whose wheels are buried in `dark`. The Tesla and the
      // Micra have the opposite problem: `M_TeslaWheelsN` and `M_NissanWheels`
      // are the ENTIRE wheel — tyre, rim face and hub — and the name rule sends
      // all of it to matte rubber, so the hero car of the owner's 2026-09-16 day
      // frames stands on four featureless black blobs. They are the only two
      // kinds in the fleet with a `tire` bucket and no `chrome` one at all, and
      // neither GLB carries Wheel_* bones (both are SM_ exports), so the wheels
      // have to be found in the tyre bucket itself: quadrant clusters on the
      // lateral/longitudinal axes, each accepted ONLY if it is actually round —
      // its longitudinal extent within 30 % of its vertical one — which is what
      // keeps a mud flap or an arch liner from being read as a wheel. Then the
      // same 0.62 R split the bone path uses. Gated on a car-width track so no
      // motorcycle (whose tyres are one narrow band) can enter.
      if (VH13 && buckets.tire.length && !buckets.chrome.length && !buckets.trim.length) {
        const bbT = new THREE.Box3();
        for (const g2 of buckets.tire) bbT.union(new THREE.Box3().setFromBufferAttribute(g2.getAttribute('position')));
        const eX = bbT.max.x - bbT.min.x, eZ = bbT.max.z - bbT.min.z;
        const axL = eX <= eZ ? 0 : 2, axA = axL === 0 ? 2 : 0;   // lateral is the shorter horizontal span
        const extL = axL === 0 ? eX : eZ;
        if (extL > 0.9 && extL < 3.2) {                          // a car's track; excludes the two-wheelers
          const K = ['x', 'y', 'z'];
          const midL = (bbT.min[K[axL]] + bbT.max[K[axL]]) / 2, midA = (bbT.min[K[axA]] + bbT.max[K[axA]]) / 2;
          const cl = [];
          for (let i = 0; i < 4; i++) cl.push({ n: 0, mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] });
          for (const g2 of buckets.tire) {
            const p = g2.getAttribute('position').array;
            for (let t = 0; t + 8 < p.length; t += 9) {
              const cL = (p[t + axL] + p[t + 3 + axL] + p[t + 6 + axL]) / 3;
              const cA = (p[t + axA] + p[t + 3 + axA] + p[t + 6 + axA]) / 3;
              const c = cl[(cL < midL ? 0 : 1) * 2 + (cA < midA ? 0 : 1)];
              c.n++;
              for (let k = 0; k < 9; k += 3) for (let d = 0; d < 3; d++) {
                const v = p[t + k + d];
                if (v < c.mn[d]) c.mn[d] = v;
                if (v > c.mx[d]) c.mx[d] = v;
              }
            }
          }
          const wheels = [];
          for (const c of cl) {
            if (c.n < 40) continue;
            const r = (c.mx[1] - c.mn[1]) / 2, rA = (c.mx[axA] - c.mn[axA]) / 2, wL = (c.mx[axL] - c.mn[axL]) / 2;
            if (!(r > 0.18 && r < 0.65)) continue;
            if (Math.abs(rA - r) > r * 0.30) continue;           // not round: not a wheel
            if (wL > r * 0.9) continue;                          // wider than it is tall across the axle
            wheels.push({ a: (c.mn[axA] + c.mx[axA]) / 2, y: (c.mn[1] + c.mx[1]) / 2, l: (c.mn[axL] + c.mx[axL]) / 2, r, hw: wL + 0.03 });
          }
          if (wheels.length >= 2) {
            const keepT = [], outC = [];   // rim face -> `trim` via wheelFace, see the note above
            for (const g2 of buckets.tire) {
              const pos = g2.getAttribute('position').array, nrm = g2.getAttribute('normal')?.array;
              const acc = { tire: [[], []], chrome: [[], []] };
              for (let t = 0; t + 8 < pos.length; t += 9) {
                const cA = (pos[t + axA] + pos[t + 3 + axA] + pos[t + 6 + axA]) / 3;
                const cY = (pos[t + 1] + pos[t + 4] + pos[t + 7]) / 3;
                const cL = (pos[t + axL] + pos[t + 3 + axL] + pos[t + 6 + axL]) / 3;
                let cls = 'tire';
                for (const w of wheels) {
                  if (Math.abs(cL - w.l) > w.hw) continue;
                  const dr = Math.hypot(cA - w.a, cY - w.y);
                  if (dr <= w.r * 1.05) { if (dr < w.r * 0.62) cls = 'chrome'; break; }
                }
                const a = acc[cls];
                for (let k = 0; k < 9; k++) { a[0].push(pos[t + k]); if (nrm) a[1].push(nrm[t + k]); }
              }
              for (const cls of ['tire', 'chrome']) {
                const a = acc[cls];
                if (!a[0].length) continue;
                const ng = new THREE.BufferGeometry();
                ng.setAttribute('position', new THREE.BufferAttribute(new Float32Array(a[0]), 3));
                if (a[1].length) ng.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(a[1]), 3));
                (cls === 'tire' ? keepT : outC).push(ng);
              }
            }
            if (outC.length) {
              buckets.tire.length = 0;
              for (const g2 of keepT) buckets.tire.push(g2);
              for (const g2 of outC) wheelFace.push(g2);
            }
          }
        }
      }
      if (!paint.length && dark.length) paint.push(dark.pop());
      // an empty bucket still needs a geometry for its InstancedMesh: a 1 cm placeholder box.
      // It must NEVER enter the bounds — the old code unioned it (parked at y = -5) into bb2, so
      // every model whose dark bucket was empty (the Yamaha: all-paint materials) was translated
      // +5 m and rode 5 m above the street. That was the "flying vehicles" of the 2026-09-04 review.
      const placeholders = new Set();
      const merge2 = (list) => { if (list.length) return mergeGeometries(list, false); const g0 = new THREE.BoxGeometry(0.01, 0.01, 0.01); placeholders.add(g0); return g0; };
      let body = merge2(paint), darkG = merge2(dark);
      const parts = {};
      for (const k of ['glass', 'chrome', 'trim', 'body2', 'light', 'tail', 'tire', 'plate']) if (buckets[k].length) parts[k] = mergeGeometries(buckets[k], false);
      const allG = [body, darkG, ...Object.values(parts)];
      const realG = allG.filter((g2) => !placeholders.has(g2));
      // INVERTED / DEAD VERTEX NORMALS. three.js shades with the vertex normal,
      // so a normal pointing into the body renders that face unlit black. The
      // Dodge Charger is wound consistently (94 % of its edges have an opposite
      // twin — the same as every other kind) but only 42.5 % of its vertex
      // normals point outward, against the Crown's 77.7 %: half the car was
      // black. The Fuso Rosa and the ambulance also ship zero-length normals
      // (489 and 67 body triangles). The winding is trustworthy, so per
      // triangle: replace a dead normal with the winding normal, and negate one
      // that opposes it. The geometry is non-indexed by here, so each triangle
      // owns its three normals and smooth shading survives everywhere the
      // normals were already right (a no-op on 13 of the 15 kinds).
      let nFix = 0;
      for (const g2 of realG) {
        const pa = g2.getAttribute('position'), na = g2.getAttribute('normal');
        if (!pa || !na) continue;
        const p = pa.array, n = na.array;
        let touched = 0;
        for (let t = 0; t + 8 < p.length; t += 9) {
          const ux = p[t + 3] - p[t], uy = p[t + 4] - p[t + 1], uz = p[t + 5] - p[t + 2];
          const vx = p[t + 6] - p[t], vy = p[t + 7] - p[t + 1], vz = p[t + 8] - p[t + 2];
          let gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
          const gl = Math.hypot(gx, gy, gz);
          if (gl < 1e-12) continue;
          gx /= gl; gy /= gl; gz /= gl;
          const nx = n[t] + n[t + 3] + n[t + 6], ny = n[t + 1] + n[t + 4] + n[t + 7], nz = n[t + 2] + n[t + 5] + n[t + 8];
          const nl = Math.hypot(nx, ny, nz) / 3;
          if (nl < 0.3) { for (let k = 0; k < 9; k += 3) { n[t + k] = gx; n[t + k + 1] = gy; n[t + k + 2] = gz; } touched++; continue; }
          if ((gx * nx + gy * ny + gz * nz) / (nl * 3) < -0.25) { for (let k = 0; k < 9; k++) n[t + k] = -n[t + k]; touched++; }
        }
        if (touched) { na.needsUpdate = true; nFix += touched; }
      }
      // per-kind scale correction (the Fuso Rosa is authored ~1.55x life size)
      if (sp.scale) for (const g2 of allG) g2.scale(sp.scale, sp.scale, sp.scale);
      // auto-orient: cars are longer than wide — if the long axis is X, yaw 90 (decided on the
      // whole model, not the paint alone: a jeep's paint bucket is nearly square)
      const bbAll = new THREE.Box3();
      for (const g2 of realG) bbAll.union(new THREE.Box3().setFromBufferAttribute(g2.getAttribute('position')));
      const size = bbAll.getSize(new THREE.Vector3());
      const flipped = size.x > size.z;
      if (flipped) for (const g2 of allG) g2.rotateY(Math.PI / 2);
      // CARLA fronts export opposite our +Z-forward convention — flip 180
      for (const g2 of allG) g2.rotateY(Math.PI);
      // normalize: origin at ground center (real geometry only)
      const bb2 = new THREE.Box3();
      for (const g2 of realG) bb2.union(new THREE.Box3().setFromBufferAttribute(g2.getAttribute('position')));
      const c = bb2.getCenter(new THREE.Vector3());
      for (const g2 of allG) g2.translate(-c.x, -bb2.min.y, -c.z);
      // ---- lamp quads for a kind that has none. Heights and widths come from
      // the table above; the SHAPE comes from the body. Each lamp is probed at
      // its two vertical EDGES separately, in a narrow (+-0.05 m) window, and
      // the quad is built as a chord between those two local surface points —
      // so it wraps with the panel instead of standing off a single depth.
      //
      // A single probe over the lamp's whole width does NOT work, and it is
      // worth saying why: the Micra's nose at lamp height falls from z 1.796 on
      // the centreline to 1.568 at x 0.73, so a 0.32 m lamp spans 180 mm of
      // curvature. Taking the furthest surface in one wide window put the quad
      // at 1.768 and left its outboard end hanging 200 mm clear of the bodywork
      // — a lamp floating in mid-air, which is exactly the class of defect this
      // pass exists to remove. A chord between the two edges can only ever sit
      // slightly INSIDE a convex panel, which is what a recessed lamp does.
      // VH13: `rearOnly` is the second way in — a kind that HAS front lamps but no
      // tail bucket (jeep, prius) takes only its dir = -1 rows, and they go
      // straight into `parts.tail` so the red lens material picks them up.
      const rearOnly = VH13 && !!LAMPS[sp.key] && !parts.tail && !!parts.light;
      if (LAMPS[sp.key] && ((!parts.light && !parts.tail) || rearOnly)) {
        const bodyTris = [body, darkG].filter((g2) => !placeholders.has(g2));
        const faceZ = (px, ly, dir) => {
          let best = null;
          for (const g2 of bodyTris) {
            const p = g2.getAttribute('position').array;
            for (let t = 0; t + 8 < p.length; t += 9) {
              const cx = (p[t] + p[t + 3] + p[t + 6]) / 3;
              if (Math.abs(cx - px) > 0.05) continue;
              const cy = (p[t + 1] + p[t + 4] + p[t + 7]) / 3;
              if (Math.abs(cy - ly) > 0.11) continue;
              const cz = (p[t + 2] + p[t + 5] + p[t + 8]) / 3;
              if (best === null || (dir > 0 ? cz > best : cz < best)) best = cz;
            }
          }
          return best;
        };
        const quads = [];
        for (const [xs, ly, w, h, dir] of LAMPS[sp.key]) {
          if (rearOnly && dir > 0) continue;   // VH13: this kind's front lamps are real geometry
          for (const side of [-1, 1]) {
            const lx = side * xs, x0 = lx - w / 2, x1 = lx + w / 2;
            const z0 = faceZ(x0, ly, dir), z1 = faceZ(x1, ly, dir);
            if (z0 == null || z1 == null) continue;
            const e = dir * 0.012;
            const y0 = ly - h / 2, y1 = ly + h / 2;
            const A = [x0, y0, z0 + e], B = [x1, y0, z1 + e], Cq = [x1, y1, z1 + e], D = [x0, y1, z0 + e];
            const t3 = dir > 0 ? [A, B, Cq, A, Cq, D] : [B, A, D, B, D, Cq];
            // one normal for the whole quad, taken from its own winding
            const ux = t3[1][0] - t3[0][0], uz = t3[1][2] - t3[0][2];
            const vy = t3[2][1] - t3[0][1];
            let nx = -uz * vy, nz = ux * vy;
            const nl = Math.hypot(nx, nz) || 1;
            nx /= nl; nz /= nl;
            if (nz * dir < 0) { nx = -nx; nz = -nz; }
            const pos = new Float32Array(18), nrm = new Float32Array(18);
            for (let i = 0; i < 6; i++) {
              pos[i * 3] = t3[i][0]; pos[i * 3 + 1] = t3[i][1]; pos[i * 3 + 2] = t3[i][2];
              nrm[i * 3] = nx; nrm[i * 3 + 2] = nz;
            }
            const q = new THREE.BufferGeometry();
            q.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            q.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
            quads.push(q);
          }
        }
        if (quads.length) {
          if (rearOnly) parts.tail = mergeGeometries(quads, false);   // VH13
          else parts.light = mergeGeometries(quads, false);
        }
      }
      // FRONT LAMPS vs TAIL LAMPS. CARLA ships ONE lamp material per vehicle
      // spanning both ends (M_Lights_Ford_Crown x -2.39..2.72, MI_Lights_Sprinter,
      // M_Lights_Ambulance, M_lights, the bus's M_Lights, CarlaCola's LightMat),
      // so a name rule can never find the rear pair: 14 of 15 kinds drove around
      // with white-glowing tail lamps. The geometry knows, though — by here the
      // model is centred with +Z forward, so split the lamp triangles at z = 0.
      if (parts.light) {
        const pos = parts.light.getAttribute('position').array;
        const nrm = parts.light.getAttribute('normal')?.array;
        const fp = [], rp = [], fn2 = [], rn2 = [];
        for (let t = 0; t < pos.length; t += 9) {
          const rear = (pos[t + 2] + pos[t + 5] + pos[t + 8]) / 3 < 0;
          const P2 = rear ? rp : fp, N2 = rear ? rn2 : fn2;
          for (let k = 0; k < 9; k++) { P2.push(pos[t + k]); if (nrm) N2.push(nrm[t + k]); }
        }
        const mk = (P2, N2) => {
          const g2 = new THREE.BufferGeometry();
          g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P2), 3));
          if (N2.length) g2.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N2), 3));
          return g2;
        };
        if (rp.length) {
          const rear = mk(rp, rn2);
          parts.tail = parts.tail ? mergeGeometries([parts.tail, rear], false) : rear;
        }
        if (fp.length) parts.light = mk(fp, fn2); else delete parts.light;
      }
      // VH13 — plate uvs and per-model lamp anchors (helpers at the top of this
      // file). Both are pure metadata on the finished, centred, +Z-forward model.
      let lamps = null;
      if (VH13) {
        if (parts.plate) uvPlanarPlate(parts.plate);
        lamps = lampAnchors(parts.light, parts.tail, bb2.getSize(new THREE.Vector3()));
      }
      // far-LOD shell: CARLA's ~2k-tri collision mesh, exported in the SAME
      // vehicle space — it must ride the exact orient/flip/ground-origin chain
      // the visual meshes got (flipped flag + bb2/c from the body+dark union)
      let shell = null;
      if (sp.shell) {
        try {
          const g3 = await loader.loadAsync(BASE + sp.shell);
          g3.scene.updateMatrixWorld(true);
          const sparts = [];
          g3.scene.traverse((o) => {
            if (!o.isMesh) return;
            let ge = o.geometry.clone().applyMatrix4(o.matrixWorld);
            if (ge.index) ge = ge.toNonIndexed();
            for (const a of Object.keys(ge.attributes)) if (!keepAttr.includes(a)) ge.deleteAttribute(a);
            sparts.push(ge);
          });
          if (sparts.length) {
            shell = mergeGeometries(sparts, false);
            if (sp.scale) shell.scale(sp.scale, sp.scale, sp.scale);
            if (flipped) shell.rotateY(Math.PI / 2);
            shell.rotateY(Math.PI);
            shell.translate(-c.x, -bb2.min.y, -c.z);
          }
        } catch { /* no shell: kind stays full-res at all distances */ }
      }
      fleet[sp.key] = { paint: body, dark: darkG, parts, shell, cap: sp.cap, w: sp.w, lamps };   // VH13: `lamps`
      const sz = bb2.getSize(new THREE.Vector3());
      const cls = Object.entries(parts).map(([k, g2]) => `${k}:${g2.getAttribute('position').count / 3 | 0}`).join(' ');
      // VH13 diagnostics on the same line: `tyreY` is the lowest point of the TYRE
      // bucket after the model is seated at y = 0, i.e. the gap between the tread
      // and the asphalt (anything over ~1 cm means the car is standing on a
      // splitter or a step and its wheels float); `lamp` is the anchor carlights
      // will use, `(box)` when it was synthesised from the envelope because the
      // model ships no lens at that end.
      let vhDiag = '';
      if (VH13) {
        const tg = parts.tire;
        if (tg) vhDiag += `, tyreY ${(new THREE.Box3().setFromBufferAttribute(tg.getAttribute('position')).min.y).toFixed(3)}`;
        if (lamps) {
          const f2 = (a) => (a ? `${a[1][0].toFixed(2)},${a[1][1].toFixed(2)},${a[1][2].toFixed(2)}` : '-');
          vhDiag += `, lampF ${f2(lamps.front)}${parts.light ? '' : '(box)'} lampR ${f2(lamps.rear)}${parts.tail ? '' : '(box)'}`;
        }
      }
      console.log(`[fleet] ${sp.key}: ${(sz.z).toFixed(1)}x${(sz.x).toFixed(1)}x${(sz.y).toFixed(1)}m, paint:${body.getAttribute('position').count / 3 | 0} dark:${darkG.getAttribute('position').count / 3 | 0} ${cls}${shell ? `, shell ${shell.getAttribute('position').count / 3 | 0}` : ''}${nFix ? `, normals repaired ${nFix}` : ''}${vhDiag}`);
    } catch (e) { console.warn('[fleet] failed', sp.key, e); }
  }));
  // DETERMINISTIC ORDER. The loads race, so Object.keys(fleet) came back in a
  // different order every run — and the pools, the spawn bag and the showroom
  // row all inherit that order. Rebuild in SPECS order.
  const ordered = {};
  for (const sp of SPECS) if (fleet[sp.key]) ordered[sp.key] = fleet[sp.key];
  return Object.keys(ordered).length ? ordered : null;
}
