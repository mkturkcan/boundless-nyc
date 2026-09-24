// CS11 — CONTACT SHADOWS FOR PROPS (round 11, brief A; docs/notes/contact-r11.md)
//
// THE DEFECT, three blind packs running (uniformity-r10 §11.5/§13/§15, edges-r10 §160):
//   "Nothing on our roofs casts a shadow that reads at 150 m. Every unit in the
//    reference is anchored by a hard dark shadow; ours have almost none."
// and at street level the same thing from below: furniture and parked cars sit ON the
// pavement with a lit gap under them, i.e. they FLOAT.
//
// WHY THE CASCADES CANNOT FIX IT ALONE. The engine splits the key between a near
// cascade (4096 over +/-150..700 m) and a cached, BUILDINGS-ONLY far cascade, and the
// split follows camera height (`shadowMixFor`): 0.88 near at eye level, 0.34 near at
// 200 m+. Instanced props cast into the NEAR map only. So at `lenoxTop` (260 m) a roof
// unit's shadow is worth 34 % of the key while the building masses around it are
// shadowed by both maps and read at 100 %; at `lenoxRef` (150 m) it is 49 %. On top of
// that the near texel is 15-21 cm there with a 1.6-texel PCF kernel, against a 1.4 m
// RTU. Raising the near share is only free where the near box covers the whole frame
// (engine.js CS11 does exactly that, and only that); at an oblique 150 m framing the
// frame reaches 700 m and the far map still has to carry the background.
//
// SO: A DECAL, which is resolution-independent and costs one draw call. Each claimed
// prop gets one soft dark ellipse on the surface it stands on, centred at its base and
// stretched down-sun by a fraction of its own height. The ellipse is built in the
// VERTEX shader from the live sun direction, so the quad is never bigger than the blob
// it holds (fill is the only real cost here) and the blob tracks time of day instead of
// being baked to one sun. It is multiplied into the frame (MultiplyBlending), which is
// what a shadow does to incoming light, and it writes no depth, so GTAO — which reads
// the prepass depth — never sees it.
//
// STRENGTH IS COUPLED TO THE CASCADE'S OWN WEAKNESS (`engine.shadowMix`): weak at eye
// level, where the near map already casts a good hard shadow and a strong blob would
// punch a black hole under a bench; strong from the air, where the cascade has handed
// two thirds of the key to a map that cannot see props. That is the whole trick.
//
// FLAG: `?cs11=0` removes every instance (nothing is claimed, the pool is never built).
import * as THREE from 'three';
import { ENV } from '../world/materials.js';

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
// OFF by default for the 2026-09-15 ready version: with the shader finally compiling, the vehicle blob drew as a WHITE
// capsule under parked cars (final_v17 amst120W) — the multiply blend is not surviving the engine's transparent pass.
// Opt in with ?cs11=1 while that is debugged (docs/notes/r11-triage.md).
export const CS11 = Q.get('cs11') === '1';
// ATTRIBUTION MATRIX. The round has two independent halves and they must be separable
// on a plate and on a bench, or the report is a guess:
//   ?cs11=0     everything off (the `before` control)
//   ?cs11cas=0  engine.js cascade coverage off, decals on   (engine.js reads this)
//   ?cs11d=0    decals off (nothing claimed, no mesh, no fill), cascade on
//   ?cs11v=0    vehicle decals only
//   ?cs11s=<x>  scale the blob strength (visual only — the fill is still paid)
export const CS11D = CS11 && Q.get('cs11d') !== '0';
const STR_SCALE = Q.get('cs11s') !== null ? Math.max(0, parseFloat(Q.get('cs11s')) || 0) : 1;

// ---------------------------------------------------------------------------
// WHO GETS ONE. Two rules, both necessary:
//  * the pool must be a thing that STANDS ON a horizontal surface (so: no awnings,
//    no fire escapes, no marquees, no cornice parts — they hang off walls, and a
//    ground ellipse under them would sit on the pavement 4 m below and read as a
//    stain, not a shadow);
//  * and the instance must be big enough to read. The size gate below is applied per
//    INSTANCE, not per pool, because U10 scales every roof prop by up to +-25 % and a
//    roof is full of 0.3 m goosenecks whose blob would be a sub-pixel dot at 150 m —
//    i.e. exactly the stipple round 7 spent a week removing.
// `v` is the blob's footprint multiplier over the prop's own half-width: 1.0 hugs the
// object, which is what a contact shadow does. The ellipse is ANISOTROPIC and yaw-
// aligned, so a long plenum is served correctly; what is still out is anything whose
// footprint is not a solid rectangle — pipe runs, cable trays, guardrails, walkways,
// and the sidewalk shed, whose footprint is four posts and not a box.
// ROOF vs STREET is not cosmetic: the roof blobs go into a SECOND pool named
// `csBlobRoof`, which is listed in the instancer's ROOF_LOW set. From a camera under
// the deck and more than 25 m away a roof blob is behind the parapet like the prop it
// belongs to, and without that split every street framing would pay full vertex and
// setup cost for tens of thousands of ellipses that early-Z then throws away.
const CS_ROOF_KINDS = {
  // ---- roof plant that reads at 100-150 m (the brief's first target)
  roofRTU: 1.05, roofPlenum: 1.05, roofStack: 0.95, coolingTower: 1.0, waterTower: 0.95,
  bulkhead: 1.0, mechPenthouse: 1.0, chimneyMasonry: 0.95, roofAC: 1.05, upblastFan: 1.0,
  mushroomFan: 1.0, skylight: 1.0, sawtoothMonitor: 1.0, screenWall: 0.9,
  cellCabinet: 1.05, cellSled: 1.0, dishCluster: 1.0, microwaveDrum: 1.0, monopole5G: 1.0,
  pergola: 1.0, roofPlanter: 1.05, roofTable: 1.0, roofUmbrella: 0.9,
  standpipe: 1.1, roofHatch: 1.05, roofDish: 1.0, roofAntenna: 1.0, davit: 1.0,
};
const CS_STREET_KINDS = {
  // ---- street furniture and kit that reads at 40-80 m (the brief's second target)
  dumpster: 1.05, newsstand: 1.0, busShelter: 1.0, subway: 1.0, linknyc: 1.15,
  bench: 1.05, litter: 1.15, mailbox: 1.15, bikeRack: 1.1, foodcart: 1.05,
  newsbox: 1.15, cone: 1.2, bollard: 1.3, hydrant: 1.3, treeFence: 1.0,
  signPole: 1.4, signPoleOneWay: 1.4, stoop: 0.9, viaductPier: 1.0,   // no scaffold: a shed's footprint is POSTS, not a box
  // ---- CARLA companion pools (props.js): the loose kit on the pavement
  trashbag: 1.2, cbox: 1.2, conep: 1.2, barrier: 1.05, bike: 1.1,
};
export const CS_POOL_ROOF = 'csBlobRoof', CS_POOL_STREET = 'csBlob';
const CS_KINDS = new Map();
for (const [k, v] of Object.entries(CS_ROOF_KINDS)) CS_KINDS.set(k, [v, CS_POOL_ROOF]);
for (const [k, v] of Object.entries(CS_STREET_KINDS)) CS_KINDS.set(k, [v, CS_POOL_STREET]);
// per-instance gates. A blob under something smaller than this is a dot.
const MIN_FOOT = 0.15;   // footprint half-extent, m (the shader fades anything under ~2 px anyway)
const MIN_H = 0.40;      // prop height, m

// ---------------------------------------------------------------------------
// Geometry: a unit-radius OCTAGON fan in the XZ plane (8 tris, 9 verts). Its mid-edge
// inset is 0.924 and the fragment falloff is ~0 by then (smoothstep 0.42 -> 0.98), so
// it clips nothing visible, and it costs 17 % less blended fill than the circumscribed
// quad — fill is the entire cost of this system, triangles are not.
function blobGeo() {
  const N = 8, pos = new Float32Array((N + 1) * 3), idx = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    pos[(i + 1) * 3] = Math.cos(a);
    pos[(i + 1) * 3 + 2] = Math.sin(a);
    idx.push(0, i + 1, ((i + 1) % N) + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

// SUN ELEVATION FLOOR. cot(elev) runs away at sunrise/sunset (a 1.5 m unit at 5
// degrees throws 17 m), and a 17 m blob is a smear across the whole roof. The cast is
// clamped to 2.2x the prop height, which is a 24-degree sun — past that the geometry
// cascade's own shadow is the long one and the blob stays a contact patch.
const CAST_MAX = 2.2;

function blobMat() {
  const m = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.MultiplyBlending,
    // CS12 — THE WHITE CAPSULE (docs/notes/contact-r12.md §2). three r185 split
    // WebGLState.setBlending into a premultiplied branch and a straight-alpha branch, and
    // MultiplyBlending EXISTS ONLY IN THE PREMULTIPLIED ONE. The straight-alpha branch logs
    //   "THREE.WebGLState: MultiplyBlending requires material.premultipliedAlpha = true"
    // and calls NO gl.blendFunc at all — it falls through and still records currentBlending,
    // so the draw silently inherits the previous transparent material's SRC_ALPHA /
    // ONE_MINUS_SRC_ALPHA. With this shader's alpha of 1.0 that is a straight paint-over:
    // the ground was being REPLACED by linear ~0.8-1.0, which is the bright white capsule on
    // final_v17/{amst120W,stoopClose,markings125} (308/321/268 copies of that error in their
    // own page logs). Nothing in the composite chain was ever involved.
    // With the flag on, the factors are blendFuncSeparate(DST_COLOR, ONE_MINUS_SRC_ALPHA, ZERO, ONE):
    //   out.rgb = src.rgb*dst.rgb + dst.rgb*(1 - src.a) = dst.rgb * (src.rgb + 1 - src.a)
    //   out.a   = dst.a                                 (the HDR alpha channel is untouched)
    // and because the fragment folds coverage into the colour and writes src.a = 1.0, that is
    // exactly dst * (1 - a*k) — a pure multiply, with no change to the shader maths.
    premultipliedAlpha: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    // 5 cm of world lift already clears the deck (roofPad sits at 3 cm); the offset is
    // the quantisation guard at range, same reasoning as the assemble.js AO skirt —
    // factor 0 because two parallel planes need only the constant term.
    polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -6,
    uniforms: {
      uSunDir: ENV.sunDir,      // shared with materials.js: one sun, no drift
      uNight: ENV.night,
      uWet: ENV.wet,
      uStr: { value: 0.30 },
      uCast: { value: 1.0 },
      uPx: { value: 900 },      // 0.5 * drawingBufferHeight / tan(fovY/2)
      uFar: { value: 700 },     // blob fade-out distance (m)
    },
    vertexShader: /* glsl */`
      uniform vec3 uSunDir; uniform float uNight; uniform float uCast; uniform float uPx; uniform float uFar;
      varying vec2 vQ; varying float vF;
      void main() {
        // claim() builds the instance matrix as translate(base) * rotY(yaw) * scale(a, h, b),
        // so columns 0 and 2 are the prop's own horizontal axes (unit, orthogonal — the
        // rotation is yaw-only) scaled by its footprint half-extents. A car and a 6:1
        // screen wall therefore get an ellipse that is actually their shape; a round blob
        // under a 4.5 m car is the thing that reads as a sticker.
        vec3 base = instanceMatrix[3].xyz;
        float a = length(instanceMatrix[0].xyz);
        float h = length(instanceMatrix[1].xyz);
        float b = length(instanceMatrix[2].xyz);
        vec2 e0 = instanceMatrix[0].xz / max(a, 1e-4);
        vec2 e2 = instanceMatrix[2].xz / max(b, 1e-4);
        vec2 sh = -uSunDir.xz;                       // ground direction the shadow runs
        float shl = length(sh);
        vec2 s = shl > 1e-3 ? sh / shl : vec2(1.0, 0.0);
        // cot(elevation), floored so a low sun cannot smear the blob across the roof
        float cot = shl / max(uSunDir.y, 0.34);
        // THREE CAPS, and the third is the one that matters. This is a CONTACT shadow:
        // the long throw belongs to the geometry cascade, which projects onto whatever
        // surface is actually there. The blob is a flat plane at the prop's own base, so
        // a 3.4 m stack allowed its full 2.2h reach would hang a dark patch 7 m out —
        // over the parapet and in mid-air above the street. 2.6 footprints is as far as
        // a decal can go and still be landing on the deck it was claimed on.
        float mx = max(a, b);
        // 'cast' is a GLSL ES reserved word: the shader failed to compile and the blobs never drew (lead, 2026-09-15)
        float castLen = min(min(h * cot, h * ${CAST_MAX.toFixed(1)}), 2.6 * mx)
                   * uCast * (1.0 - 0.8 * uNight);
        vec2 q = position.xz;                        // unit disc
        // the footprint ellipse, in world XZ
        vec2 P = q.x * (a * e0) + q.y * (b * e2);
        // ...swept down-sun: the up-sun edge (u = -1) stays on the footprint, the
        // down-sun edge (u = +1) runs out to the shadow tip. That is a capsule, which
        // is what the shadow of a box on flat ground actually looks like.
        vec2 sl = vec2(dot(s, e0), dot(s, e2));
        float u = dot(q, normalize(sl + vec2(1e-5)));
        vec2 off = P + s * (0.5 * castLen * (u + 1.0));
        vec4 mv = modelViewMatrix * vec4(base.x + off.x, base.y, base.z + off.y, 1.0);
        vQ = q;
        // FLICKER GATE. A blob that shrinks under ~2 px is a sub-pixel gradient moving
        // over the pixel grid, i.e. a stipple candidate; it is faded to nothing before
        // it can twinkle, and again past uFar where it is haze anyway.
        float d = max(-mv.z, 1.0);
        float px = min(a, b) * uPx / d;
        vF = smoothstep(1.6, 3.4, px) * (1.0 - smoothstep(uFar * 0.62, uFar, d));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uStr; uniform float uWet;
      varying vec2 vQ; varying float vF;
      void main() {
        float d = length(vQ);
        // flat core, soft shoulder: the contact itself is opaque dark, the tail is a
        // penumbra. Wet asphalt reflects, so the contact reads a little weaker in rain.
        // In ref_lenox.png a condenser's shadow has a HARD edge with a 2-3 px penumbra
        // at 150 m, not a soft airbrush blob; 0.24 -> 0.92 spread the shoulder over
        // two thirds of the radius and read as a smudge. 0.42 -> 0.98 keeps a solid
        // core and a shoulder ~5 px wide on a 23 px blob at that framing, which is
        // about right for a sun the size of half a degree.
        float k = 1.0 - smoothstep(0.42, 0.98, d);
        float a = uStr * k * vF * (1.0 - 0.35 * uWet);
        // NOT a neutral grey multiply. What a contact occludes is the SKY, and the sky
        // in this renderer is a pure Rayleigh spectrum (materials.js: linear R:G:B
        // ~0.45:0.62:1.0) — so the light a contact takes away is the BLUE part of the
        // ambient and what is left is warm masonry bounce. A flat neutral darkening is
        // exactly the "black hole punched in the roof" the round-9 stain pad was pulled
        // back from (furnitureKit roofPad); this removes ~15 % more blue than red.
        gl_FragColor = vec4(1.0 - a * 0.94, 1.0 - a * 0.99, 1.0 - a * 1.09, 1.0);
      }`,
  });
  return m;
}

// ---------------------------------------------------------------------------
// STRENGTH COUPLING. `engine.shadowMix` is the near cascade's share of the key, and
// the near cascade is the only one that can see a prop. 1 - mix is therefore exactly
// the fraction of the prop's own shadow that the renderer is throwing away at this
// camera height, and it is what the blob is here to replace.
const STR_LO = 0.20;   // eye level (mix 0.88): grounding only — the cascade does the rest
const STR_HI = 0.46;   // aerial (mix 0.34): the blob IS the shadow
function strengthFor(mix) {
  const w = Math.max(0, Math.min(1, (0.88 - mix) / 0.54));
  return (STR_LO + (STR_HI - STR_LO) * w) * STR_SCALE;
}

let _inst = null, _pool = null, _mat = null;
const stats = { claimed: 0, skipped: 0, live: 0, veh: 0, byPool: {} };
const _v2 = new THREE.Vector2();

function ensureMat() {
  if (!_mat) _mat = blobMat();
  return _mat;
}
// one place that refreshes the shared uniforms, hung on whichever blob mesh draws
function uniformHook(renderer, scene, camera) {
  const u = _mat.uniforms;
  const mix = (_inst && _inst.engine && _inst.engine.shadowMix) || 0.88;
  u.uStr.value = strengthFor(mix);
  const sz = renderer.getDrawingBufferSize(_v2);
  u.uPx.value = (0.5 * sz.y) / Math.tan(((camera.fov || 60) * Math.PI) / 360);
}
function mkBlobMesh(name, cap) {
  const mesh = new THREE.InstancedMesh(blobGeo(), ensureMat(), cap);
  mesh.name = name;
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.castShadow = false;       // a flat decal 5 cm off its own receiver casts acne
  mesh.receiveShadow = false;    // it is a multiplier, not a surface
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // transparent: drawn after every opaque surface, so the depth test alone decides
  // what it lands on. renderOrder keeps it behind the weather/steam sprites.
  mesh.renderOrder = -1;
  mesh.onBeforeRender = uniformHook;
  return mesh;
}

function ensurePool(inst, name) {
  let p = inst.pools.get(name);
  if (p) return p;
  if (!inst.scene) return null;
  const mesh = mkBlobMesh('pool:' + name, 4096);
  inst.scene.add(mesh);
  // CS12: `name` must be in the record. Instancer._ensure() adopts an external pool with
  // `p.name || t.name || 'ext'`, and t.name is already 'pool:csBlobRoof' — so without this
  // the pool was registered as "pool:csBlobRoof" and `ROOF_LOW.has(name)` was false, i.e.
  // the roof/street split of §5e-1 existed but its whole reason (a street framing not
  // paying vertex + setup for tens of thousands of behind-the-parapet ellipses) never fired.
  inst.pools.set(name, { name, mesh, free: [], top: 0, cap: 140000, dirty: false });
  p = inst.pools.get(name);
  if (name === CS_POOL_STREET) _pool = p;
  return p;
}

// per-pool parallel index: host slot -> encoded blob handle (0 = none, >0 street,
// <0 roof). Kept here rather than in the instancer's own store so nothing in
// _growStore has to know about this round; Int32Array zero-fills, so "none" is free.
function idxFor(p) {
  let a = p.__cs;
  if (!a || a.length < p.size) {
    const n = new Int32Array(p.size);
    if (a) n.set(a);
    p.__cs = a = n;
  }
  return a;
}

// Called at the END of Instancer.claim(): the host's slot is live and its transform is
// already in the store, so everything needed is in the arguments.
export function csClaim(inst, name, p, slot, x, y, z, rotY, sx, sy, sz) {
  if (!CS11D) return;
  const e = CS_KINDS.get(name);
  if (e === undefined) return;
  const bb = p.geo && p.geo.boundingBox;
  if (!bb) return;
  const v = e[0];
  // footprint half-extents and height in WORLD metres, from the kit geometry and this
  // instance's own scale (U10 varies both).
  const a = (bb.max.x - bb.min.x) * 0.5 * Math.abs(sx) * v;
  const b = (bb.max.z - bb.min.z) * 0.5 * Math.abs(sz) * v;
  const h = bb.max.y * Math.abs(sy);                   // top of the prop above its base
  if (Math.min(a, b) < MIN_FOOT || h < MIN_H) { stats.skipped++; return; }
  if (Math.max(a, b) > 14) { stats.skipped++; return; }   // a run, not a prop
  if (!ensurePool(inst, e[1])) return;
  // 5 cm proud of the claimed surface. bb.min.y is normally 0 (props are modelled
  // base-at-origin) but is clamped, so a kit part with a raised origin puts its blob
  // on the deck rather than floating halfway up itself.
  const base = y + Math.min(0.12, Math.max(0, bb.min.y * Math.abs(sy))) + 0.05;
  const id = inst.claim(e[1], x, base, z, rotY, a, h, b);
  if (id < 0) return;
  // the blob's pool is encoded in the sign of the stored handle (+1 offset so 0 is a
  // real slot): one Int32Array per host pool, no second allocation per instance.
  idxFor(p)[slot] = e[1] === CS_POOL_ROOF ? -(id + 2) : (id + 1);
  stats.claimed++;
  stats.byPool[name] = (stats.byPool[name] || 0) + 1;
  stats.live++;
}

// Called at the START of Instancer.release(), while the host slot is still alive.
export function csRelease(inst, p, slot) {
  const a = p.__cs;
  if (!a || slot >= a.length) return;
  const h = a[slot];
  if (h === 0) return;
  a[slot] = 0;
  if (h > 0) inst.release(CS_POOL_STREET, h - 1);
  else inst.release(CS_POOL_ROOF, -h - 2);
  stats.live--;
}

// ---------------------------------------------------------------------------
// VEHICLES (`?cs11v=0`). Parked and moving cars are not instancer pools — they live in
// the traffic pools and are compacted per frame by sim/vehicleCull.js — so they get a
// DYNAMIC blob set instead of a claimed one: after the cull has written this frame's
// visible vehicles, their transforms are re-emitted as ellipses. traffic.js parks a car
// with "the instance origin IS the contact patch", so the blob sits 4 cm over the
// asphalt with no datum guesswork. A car's own cast shadow has been correct since r5;
// what makes it float at 40-80 m is the absence of anything in the gap UNDER the body,
// which is the one place a 7 cm shadow texel plus a 6 cm normal bias cannot reach.
export const CS11V = CS11D && Q.get('cs11v') !== '0';
let _veh = null;
const _vm = new Float32Array(16);
export function csVehicles(scene, groups) {
  if (!CS11V) return;
  if (!_veh) { _veh = mkBlobMesh('pool:csBlobVeh', 256); scene.add(_veh); }
  let k = 0;
  let out = _veh.instanceMatrix.array;
  for (const g of groups) {
    const src = g.srcs && g.srcs[0];
    if (!src || !src.geometry) continue;
    let dim = g.__csDim;
    if (!dim) {
      const bb = src.geometry.boundingBox || (src.geometry.computeBoundingBox(), src.geometry.boundingBox);
      if (!bb) continue;
      // 0.44 of the full extent = 0.88 of the half-extent: a car's contact patch is
      // its wheelbase and track, not its widest panel or its wing mirrors.
      g.__csDim = dim = [(bb.max.x - bb.min.x) * 0.44, (bb.max.z - bb.min.z) * 0.44, Math.max(0.5, bb.max.y)];
    }
    for (const list of [g.main, g.lodMain]) {
      const m = list && list[0];
      if (!m || !m.count) continue;
      const A = m.instanceMatrix.array;
      for (let i = 0; i < m.count; i++) {
        const o = i * 16;
        const l0 = Math.hypot(A[o], A[o + 1], A[o + 2]) || 1;
        const l1 = Math.hypot(A[o + 4], A[o + 5], A[o + 6]) || 1;
        const l2 = Math.hypot(A[o + 8], A[o + 9], A[o + 10]) || 1;
        // the blob's own axes are the vehicle's, flattened: the pitch/roll the sim
        // applies would tilt the ellipse off the road, so only the yaw columns are kept
        // and renormalised in the XZ plane.
        const c0x = A[o] / l0, c0z = A[o + 2] / l0, n0 = Math.hypot(c0x, c0z) || 1;
        const c2x = A[o + 8] / l2, c2z = A[o + 10] / l2, n2 = Math.hypot(c2x, c2z) || 1;
        const a = dim[0] * l0, b = dim[1] * l2, h = dim[2] * l1;
        _vm[0] = (c0x / n0) * a; _vm[1] = 0; _vm[2] = (c0z / n0) * a; _vm[3] = 0;
        _vm[4] = 0; _vm[5] = h; _vm[6] = 0; _vm[7] = 0;
        _vm[8] = (c2x / n2) * b; _vm[9] = 0; _vm[10] = (c2z / n2) * b; _vm[11] = 0;
        _vm[12] = A[o + 12]; _vm[13] = A[o + 13] + 0.04; _vm[14] = A[o + 14]; _vm[15] = 1;
        if (k >= _veh.instanceMatrix.count) {
          const cap = Math.min(1 << 16, Math.max(k + 1, _veh.instanceMatrix.count * 2));
          const im = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16);
          im.setUsage(THREE.DynamicDrawUsage);
          im.array.set(_veh.instanceMatrix.array);
          _veh.instanceMatrix = im;
          out = im.array;
        }
        out.set(_vm, k * 16);
        k++;
      }
    }
  }
  _veh.count = k;
  stats.veh = k;
  const im = _veh.instanceMatrix;
  im.clearUpdateRanges(); im.addUpdateRange(0, k * 16); im.needsUpdate = true;
}

if (typeof window !== 'undefined') {
  window.__CS11 = () => ({
    on: CS11, strScale: STR_SCALE,
    mix: (_inst && _inst.engine && _inst.engine.shadowMix) || null,
    str: strengthFor((_inst && _inst.engine && _inst.engine.shadowMix) || 0.88),
    drawnStreet: _inst && _inst.pools.get(CS_POOL_STREET) ? _inst.pools.get(CS_POOL_STREET).mesh.count : 0,
    drawnRoof: _inst && _inst.pools.get(CS_POOL_ROOF) ? _inst.pools.get(CS_POOL_ROOF).mesh.count : 0,
    liveStreet: _inst && _inst.pools.get(CS_POOL_STREET) ? _inst.pools.get(CS_POOL_STREET).n : 0,
    liveRoof: _inst && _inst.pools.get(CS_POOL_ROOF) ? _inst.pools.get(CS_POOL_ROOF).n : 0,
    ...stats,
  });
}
export function csAttach(inst) { _inst = inst; }
