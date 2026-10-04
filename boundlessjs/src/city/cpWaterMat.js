// CPW: the park's water shader, shared by the Lake and the other bodies (city/cpLand.js, CP32L) and Bethesda Fountain's
// pool and basins (city/cpBethesdaKit.js). Notes: docs/notes/central-park-land.md (the bodies), central-park-fix.md
// (the fountain's water, 2026-09-30).
//
// The water's own radiance replaces three's lit surface: the surroundings mirrored with the Fresnel term (a probe
// captured over the water, parallax-fixed on a proxy of what stands round it), capillary-gravity ripples that fade
// with the pixel footprint and hand their slope variance to the roughness (so nothing repeats and nothing sparkles at
// range), the water column's single scatter lit and shadowed by the city's lights (Beer extinction), the bed through
// the shallows, the sun's glint clamped. A body's own GLSL (cpWaterMat's `glsl`, after the core below) defines
// cpwShore(xz), the distance into the water from its shore (m), and cpwRefl(R, lod), what it mirrors.
//
// A fountain pool (define CPW_POOL, cpPoolWaterMat) adds: an even basin with a dark granite floor and a caustic web on
// it, the path through the water from the refracted view ray; the fountain itself in the reflection (its veils, the
// rock and the angel with her wings as analytic tiers round the centre, fountainFX's rope pattern on the veils); the
// coping's inner face; the terrace as the probe's parallax proxy (an ellipse round the fountain in the terrace frame);
// ring waves off the landing circle, choppier water round it and the white churn where the veil plunges (city/
// fountainFX.js FW27's pool, carried over). The pool reflects the probe that fountainFX.fountainProbe captures over it
// (material.userData.fw27).
//
// MR33 (the owner's review of teaser 4 v2, 2026-09-30): the level bodies take a planar mirror. The probe over a body's
// deepest point mirrored its banks with the wrong parallax: on the Lake only a central band of the screen mirrored
// anything (the bank switch either side left opaque olive water), a seam split the Lake behind the terrace, sky shards
// stood in it, the Pond was opaque olive under Gapstow, and the pool's analytic fountain mirrored as a dark slab. A level
// body is a plane, so one mirror a frame serves the body that fills the view (three's Reflector scheme): the scene drawn
// at half resolution by the camera mirrored in the water's plane, that plane its oblique near plane, looked up in the
// shader along the rippled reflection (the ripples the distortion, the roughness the blur, the Fresnel weight, the bed
// and the scatter as before; cast shadows stay on those two terms). Every other body keeps its probe. A body registers
// with cpwMirrorBody(); the materials pick the body by casting a grid of rays from the lens. `?cpmir=0` restores the
// probes everywhere.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ENV } from '../world/materials.js';

const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
export const CPMIR = !(QS && QS.get('cpmir') === '0');
const POOLCAP = !(QS && QS.get('poolcap') === '0');   // the pool's bent-crest ripples (cpwCapB); ?poolcap=0 restores the straight trains
const MIR_RES = Math.min(1, Math.max(0.2, Number(QS?.get('cpmirres')) || 0.5));   // the mirror against the drawing buffer
const MIR_MARGIN = 1.12;   // the mirror's frustum a little wider than the lens's (tan): room for the ripples' distortion
const NSLOT = 2;           // the mirrors a frame draws: the body that fills the view takes the first, a second body the other
const SLOT_RAYS = [3, 8];  // the rays (of the grid below) a body needs to take the first / the second mirror
// WS34 (owner 2026-10-01, teaser 4 v3: "water getting weird/switching into something else"): a recording gives every body
// in view a mirror of its own from the first ray it gets (the pool crossed the second mirror's 8 rays at t4Crane's frames
// 54, 80 and 84 and swapped its probe for the mirror and back each time), and a body's mirror fades in and out over
// FADE_S of the scene's time instead of switching in one frame. `?cpmirfade=0` switches as before.
const NSLOT_REC = 4, SLOT_RAYS_REC = [1, 1, 1, 1];
const FADE_S = QS && QS.get('cpmirfade') === '0' ? 0 : 0.5;
// WS37 (owner 2026-10-03, the Central Park explainer: "vast amounts of shimmering and weird bugs in the water reflections"):
// the fade stepped a body that held its mirror at full weight DOWN by one step on every stepped frame (target 1 is not
// greater than w 1, so the else branch faded it) and back up on the next, so the mirror's weight alternated 1 / 0.93 frame
// by frame and the probe's sky showed through in every other frame (t4Lake: the Lake's lower half flipped teal / olive at
// 15 Hz through the whole take, the period-2 residual 59 levels). The weight now moves toward its target and stops there.
// `?ws37=0` restores the old step.
const WS37 = !(QS && QS.get('ws37') === '0');
// WE37 (exCpCastle, 2026-10-03: the Lake's mirror at weight 0.53 over 2.1-2.7 % of the view at f70-74): while recording, a
// body that comes into view small (3 rays or fewer, under 1 % of the view: the Lake's far shore rising over the Ramble as
// the crane goes up) takes its mirror at full weight at once, with nothing on screen to fade from, and a body that drops
// out of the picks keeps its mirror while it is still drawn and holds a slot (the Lake had one ray at f40, faded out, and
// faded in again from 0 over f63-77 as it filled 2.7 % of the view). The fade stays for every other change. `?we37=0`.
const WE37 = !(QS && QS.get('we37') === '0');
// the uniforms every water material shares (set per draw by mirHook from the body's slot): the mirror's image; world ->
// its uv; x its pixels per radian, y the mirrored plane's level, z its last mip level, w 1 / its height in pixels
const MIR_U = { cpwMir: { value: null }, cpwMirM: { value: new THREE.Matrix4() }, cpwMirP: { value: new THREE.Vector4(500, 0, 6, 0) } };
const mkSlot = (i) => ({ i, rt: null, raw: null, vc: new THREE.PerspectiveCamera(), body: null, key: new Float64Array(20), reuse: 0,
  M: new THREE.Matrix4(), P: new THREE.Vector4(500, 0, 6, 0) });
const MIR = { slots: Array.from({ length: NSLOT_REC }, (_, i) => mkSlot(i)), bodies: [], frame: -1, busy: false, dummy: null, tPrev: null,
  stats: { renders: 0, reused: 0, ms: 0, pick: [], cover: [], logged: new Set() } };
if (typeof window !== 'undefined') window.__CPMIR = MIR;   // harness access (the bodies picked, the renders, their cost)
function mirDummy() {
  if (!MIR.dummy) { MIR.dummy = new THREE.DataTexture(new Uint8Array([24, 30, 22, 255]), 1, 1); MIR.dummy.needsUpdate = true; }
  return MIR.dummy;
}
MIR_U.cpwMir.value = CPMIR ? mirDummy() : null;
// A level body the mirror can serve. o: { key, box ([x0, z0, x1, z1] world), inside(x, z) (on its water), ground(x, z)
// (the ground's height there, optional: a ray that passes under it before it reaches the water does not count), mats
// (its materials), level (the water's level, a number or a function: else the median height of the first mesh drawn with
// the materials; the first cut of this took the middle of a piece's bounding box, and the Pond's piece with one outline
// vertex at +0.09 put the mirror at -1.05, a metre over its water) }.
export function cpwMirrorBody(o) {
  if (!CPMIR) return null;
  const B = { key: o.key, box: o.box, inside: o.inside, ground: o.ground || null, mats: new Set(o.mats || []), level: null, levelOf: o.level ?? null, last: -99, n: 0, slot: null, mirFrame: -99 };
  MIR.bodies.push(B);
  for (const m of B.mats) m.userData.cpwBody = B;
  return B;
}
const _sz = new THREE.Vector2();
function mirRT(renderer, S) {
  renderer.getDrawingBufferSize(_sz);
  const w = Math.max(64, Math.round(_sz.x * MIR_RES)), h = Math.max(64, Math.round(_sz.y * MIR_RES));
  if (!S.rt) {
    S.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    S.rt.texture.name = 'cpw:mirror' + S.i;
    S.rt.isCpwMirror = true;
    // WS34: the scene is drawn here and only reaches S.rt through the guard (mirGuard)
    S.raw = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    S.raw.texture.name = 'cpw:mirrorRaw' + S.i;
    S.raw.isCpwMirror = true;
  } else if (S.rt.width !== w || S.rt.height !== h) { S.rt.setSize(w, h); S.raw.setSize(w, h); }
  return S.rt;
}
// WS34 (teaser 4 v3, t4Lake: a black block stood in the Lake one frame in 36): a non-finite pixel in the mirrored scene
// (one walker's shading at one phase of its cycle) went into the mirror's mip chain, which spreads it over a whole mip
// texel and on up the chain, and the water's blurred lookups came back NaN, painted black by the composer's guard
// (engine.js NaNGuardShader). The main view never shows it: its guard catches the single pixel. The mirror's image now
// passes the same bit test before its mips are built, a bad pixel taking the mean of its finite neighbours.
let _guard = null;
function mirGuard() {
  if (_guard) return _guard;
  _guard = new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, texel: { value: new THREE.Vector2(1, 1) } },
    depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tSrc; uniform vec2 texel; varying vec2 vUv;
      bool nfBad(float x) { return (floatBitsToUint(x) & 0x7F800000u) == 0x7F800000u; }
      bool nfBad4(vec4 v) { return nfBad(v.x) || nfBad(v.y) || nfBad(v.z) || nfBad(v.w); }
      void main(){
        vec4 c = texture2D(tSrc, vUv);
        if (nfBad4(c)) {
          vec4 s = vec4(0.0); float n = 0.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec4 q = texture2D(tSrc, vUv + vec2(float(i), float(j)) * texel);
            if (!nfBad4(q)) { s += q; n += 1.0; }
          }
          c = n > 0.0 ? s / n : vec4(0.0, 0.0, 0.0, 1.0);
        }
        gl_FragColor = vec4(min(c.rgb, vec3(256.0)), c.a);
      }`,
  }));
  return _guard;
}
const mainCam = () => (typeof window !== 'undefined' && window.__ENGINE ? window.__ENGINE.camera : null);
const recMode = () => !!(typeof window !== 'undefined' && window.__ENGINE && window.__ENGINE.recordMode);
const frameNo = (renderer) => (typeof window !== 'undefined' && window.__ENGINE ? window.__ENGINE.frames : renderer.info.render.frame);
function mainView(renderer, camera) {
  if (!camera.isPerspectiveCamera || Math.abs(camera.fov - 90) < 0.01) return false;   // the probes' cube faces
  const rt = renderer.getRenderTarget();
  if (rt && (rt.isWebGLCubeRenderTarget || rt.isCpwMirror)) return false;
  const E = mainCam();
  return !E || camera === E;
}
// which bodies fill the view: a grid of rays from the lens, each counted for the nearest body whose water it meets (and
// not first under that body's ground); the bodies mirrored lately keep their place unless another covers a third more
const NX = 24, NY = 14;
const _o = new THREE.Vector3(), _d = new THREE.Vector3();
function pickBodies(camera, f) {
  const L = MIR.bodies.filter((B) => B.level != null && f - B.last <= 3);
  if (!L.length) return [];
  for (const B of L) B.n = 0;
  _o.setFromMatrixPosition(camera.matrixWorld);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    _d.set(-0.96 + (1.92 * (i + 0.5)) / NX, -0.96 + (1.92 * (j + 0.5)) / NY, 0.5).unproject(camera).sub(_o);
    if (_d.y > -1e-4 * _d.length()) continue;
    _d.normalize();
    let best = null, bt = 3000;
    for (const B of L) {
      if (_o.y <= B.level + 0.05) continue;
      const t = (_o.y - B.level) / -_d.y;
      if (t >= bt) continue;
      const x = _o.x + _d.x * t, z = _o.z + _d.z * t;
      if (x < B.box[0] || x > B.box[2] || z < B.box[1] || z > B.box[3] || !B.inside(x, z)) continue;
      if (B.ground) {
        let hid = false;
        for (const s of [0.35, 0.55, 0.72, 0.86]) {
          const px = _o.x + _d.x * t * s, pz = _o.z + _d.z * t * s, py = _o.y + _d.y * t * s;
          if (py < B.ground(px, pz) - 0.6 && !B.inside(px, pz)) { hid = true; break; }
        }
        if (hid) continue;
      }
      best = B; bt = t;
    }
    if (best) best.n++;
  }
  const held = (B) => (f - B.mirFrame <= 4 ? 1.33 : 1);
  const rec = recMode(), nslot = rec ? NSLOT_REC : NSLOT, need = rec ? SLOT_RAYS_REC : SLOT_RAYS;
  const ranked = L.filter((B) => B.n >= need[0]).sort((a, b) => b.n * held(b) - a.n * held(a));
  const out = [];
  for (const B of ranked) { if (out.length >= nslot) break; if (B.n >= need[out.length]) out.push(B); }
  MIR.stats.pick = out.map((B) => B.key); MIR.stats.cover = out.map((B) => +(B.n / (NX * NY)).toFixed(3));
  return out;
}
// the mirrored camera and the mirror's image (three's Reflector: the camera reflected in the plane, the plane its oblique
// near plane, Lengyel's frustum); false when the lens is under the water
const _cw = new THREE.Vector3(), _pp = new THREE.Vector3(), _la = new THREE.Vector3(), _tg = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _rm = new THREE.Matrix4(), _pl = new THREE.Plane(), _cp = new THREE.Vector4(), _q4 = new THREE.Vector4();
function renderMirror(renderer, scene, camera, B, S) {
  _cw.setFromMatrixPosition(camera.matrixWorld);
  const h = B.level;
  if (_cw.y <= h + 0.05) return false;
  const vc = S.vc;
  // the same pose, time and body as the last image (a recorder's accumulation samples of one stepped frame): reuse it; a
  // live view whose lens stands still lags the animation by two frames instead of drawing the scene again
  const K = S.key, e0 = camera.matrixWorld.elements, tNow = ENV.time?.value ?? 0;
  let same = !!S.rt && S.body === B, pose = same;
  for (let k = 0; k < 16 && pose; k++) if (K[k] !== e0[k]) pose = false;
  if (pose && (K[17] !== h || K[18] !== camera.fov || K[19] !== camera.aspect)) pose = false;
  const live = !recMode();
  same = pose && ((K[16] === tNow && S.reuse < 24) || (live && S.reuse < 2));
  if (same) { S.reuse++; MIR.stats.reused++; return true; }
  for (let k = 0; k < 16; k++) K[k] = e0[k];
  K[16] = tNow; K[17] = h; K[18] = camera.fov; K[19] = camera.aspect;
  S.reuse = 0;
  const t0 = performance.now();
  _pp.set(_cw.x, h, _cw.z);
  vc.position.set(_cw.x, 2 * h - _cw.y, _cw.z);
  _rm.extractRotation(camera.matrixWorld);
  _la.set(0, 0, -1).applyMatrix4(_rm).add(_cw);
  _tg.subVectors(_pp, _la).reflect(_up).negate().add(_pp);
  vc.up.set(0, 1, 0).applyMatrix4(_rm).reflect(_up);
  vc.lookAt(_tg);
  vc.fov = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2) * MIR_MARGIN) * 180) / Math.PI;
  vc.aspect = camera.aspect; vc.near = camera.near; vc.far = camera.far; vc.zoom = 1;
  vc.layers.mask = camera.layers.mask;
  vc.updateProjectionMatrix();
  vc.updateMatrixWorld(true);
  const rt = mirRT(renderer, S);
  S.P.set((rt.height / 2) * vc.projectionMatrix.elements[5], h, Math.max(0, Math.floor(Math.log2(Math.min(rt.width, rt.height))) - 3), 1 / rt.height);
  S.M.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
  _pl.setFromNormalAndCoplanarPoint(_up, _pp).applyMatrix4(vc.matrixWorldInverse);
  _cp.set(_pl.normal.x, _pl.normal.y, _pl.normal.z, _pl.constant);
  const e = vc.projectionMatrix.elements;
  _q4.set((Math.sign(_cp.x) + e[8]) / e[0], (Math.sign(_cp.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
  _cp.multiplyScalar(2 / _cp.dot(_q4));
  e[2] = _cp.x; e[6] = _cp.y; e[10] = _cp.z + 1; e[14] = _cp.w;
  vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();
  const prevRT = renderer.getRenderTarget(), prevFace = renderer.getActiveCubeFace(), prevMip = renderer.getActiveMipmapLevel();
  const xr = renderer.xr.enabled, sh = renderer.shadowMap.autoUpdate, au = scene.matrixWorldAutoUpdate;
  const hid = [];
  for (const m of B.mats) if (m.visible) { m.visible = false; hid.push(m); }
  MIR_U.cpwMir.value = mirDummy();   // nothing may sample the image being drawn
  MIR.busy = true;
  let ok = true;
  try {
    renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false;   // the frame's shadow maps serve the mirror too
    scene.matrixWorldAutoUpdate = false;                                  // (the frame's own render just updated them)
    renderer.setRenderTarget(S.raw);
    renderer.clear(true, true, true);
    renderer.render(scene, vc);
    const G = mirGuard();
    G.material.uniforms.tSrc.value = S.raw.texture;
    G.material.uniforms.texel.value.set(1 / S.raw.width, 1 / S.raw.height);
    renderer.setRenderTarget(rt);
    G.render(renderer);   // (the mips are built from this)
  } catch (err) {
    ok = false;
    console.warn('[cpw] mirror', err);
  } finally {
    MIR.busy = false;
    for (const m of hid) m.visible = true;
    scene.matrixWorldAutoUpdate = au;
    renderer.setRenderTarget(prevRT, prevFace, prevMip);
    renderer.xr.enabled = xr; renderer.shadowMap.autoUpdate = sh;
  }
  if (!ok) { S.body = null; return false; }
  S.body = B;
  MIR.stats.renders++; MIR.stats.ms += performance.now() - t0;
  if (!MIR.stats.logged.has(B.key)) {
    MIR.stats.logged.add(B.key);
    console.log(`[cpw] mirror ${S.i}: ${B.key} at y ${h.toFixed(2)}, ${rt.width}x${rt.height}, ${MIR.stats.renders} renders, ${(MIR.stats.ms / MIR.stats.renders).toFixed(1)} ms each, ${((MIR.stats.cover[S.i] || 0) * 100).toFixed(0)} % of the rays`);
  }
  return true;
}
// the frame's mirrors: the first main-view water draw of a frame picks the bodies and draws their mirrors
function mirrorFrame(renderer, scene, camera, f) {
  for (const B of MIR.bodies) B.slot = null;
  const picks = pickBodies(camera, f);
  // WS34: a body leaving the picks keeps drawing its mirror while it fades out (it is still drawn, so still in view)
  const nslot = recMode() ? NSLOT_REC : NSLOT;
  const want = picks.concat(MIR.bodies.filter((B) => !picks.includes(B) && (B.w || 0) > 0 && f - B.last <= 3)).slice(0, nslot);
  const used = new Set(), at = [];
  for (const B of want) {
    const keep = MIR.slots.find((S, k) => k < nslot && S.body === B && !used.has(S));   // the slot that still holds its image
    if (keep) used.add(keep);
    at.push(keep || null);
  }
  for (let i = 0; i < want.length; i++) if (!at[i]) { at[i] = MIR.slots.find((S, k) => k < nslot && !used.has(S)) || null; if (at[i]) used.add(at[i]); }
  for (let i = 0; i < want.length; i++) {
    const B = want[i], S = at[i];
    if (S && renderMirror(renderer, scene, camera, B, S)) { B.slot = S; B.mirFrame = f; }
  }
  // the mirror's weight against the probe: toward 1 for the picked bodies, toward 0 for the fading ones, by the scene's
  // time (a recording's accumulation samples of one frame all draw at the same weight); no image, no weight
  const tNow = ENV.time?.value ?? 0;
  const dtT = MIR.tPrev == null ? 0 : Math.min(0.25, Math.max(0, tNow - MIR.tPrev));
  MIR.tPrev = tNow;
  const rec = recMode();
  for (const B of MIR.bodies) {
    if (!B.slot) { B.w = 0; continue; }
    let target = picks.includes(B) ? 1 : 0;
    if (WE37 && rec && FADE_S > 0) {
      if (!target && (B.w || 0) > 0) target = 1;                                     // still drawn, still in its slot
      else if (target && !((B.w || 0) > 0) && B.n <= 3) { B.w = 1; continue; }      // comes into view small: at once
    }
    if (!(FADE_S > 0)) { B.w = target; continue; }
    const w0 = B.w || 0, st = dtT / FADE_S;
    if (WS37) B.w = target >= w0 ? Math.min(target, w0 + st) : Math.max(target, w0 - st);
    else B.w = target > w0 ? Math.min(1, w0 + st) : Math.max(0, w0 - st);
  }
}
// every water material's draw hook: each material mirrors only if its body holds a slot this frame
function mirHook(renderer, scene, camera, geometry, object) {
  const U = this.userData.cpw;
  if (!U || !U.cpwMirOn) return;
  if (MIR.busy || !mainView(renderer, camera)) { U.cpwMirOn.value = 0; return; }
  const B = this.userData.cpwBody, f = frameNo(renderer);
  if (B) {
    B.last = f;
    if (B.level == null) {
      const lv = typeof B.levelOf === 'function' ? B.levelOf() : B.levelOf;
      if (typeof lv === 'number' && Number.isFinite(lv)) B.level = lv;
      else {
        // (the median height of this piece's vertices: the water of a level body, whatever outliers its outline has)
        const pa = geometry.attributes && geometry.attributes.position, me = object.matrixWorld.elements;
        if (pa && pa.count > 0) {
          const ys = new Float32Array(pa.count);
          for (let i = 0; i < pa.count; i++) ys[i] = pa.getY(i);
          ys.sort();
          B.level = ys[ys.length >> 1] * me[5] + me[13];
        }
      }
    }
  }
  if (MIR.frame !== f) {
    MIR.frame = f;
    mirrorFrame(renderer, scene, camera, f);
    // (the mirrors' renders drew with their own camera: this draw's matrices again)
    object.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
    object.normalMatrix.getNormalMatrix(object.modelViewMatrix);
  }
  const S = B ? B.slot : null;
  U.cpwMirOn.value = S ? (B.w ?? 1) : 0;
  if (S) { MIR_U.cpwMir.value = S.rt.texture; MIR_U.cpwMirM.value.copy(S.M); MIR_U.cpwMirP.value.copy(S.P); }
}

// the uniforms, the noise and the ripples every body shares (the Lake's CP32L code; CPW_LAM and CPW_SLOW are its
// longest ripple, 1.4 m, and its slowing, 0.55: a calm park lake)
export const CPW_CORE_GLSL = /* glsl */ `
  #ifndef CPW_LAM
  #define CPW_LAM 1.4
  #endif
  #ifndef CPW_SLOW
  #define CPW_SLOW 0.55
  #endif
  uniform vec3 cpwCol; uniform vec4 cpwP; uniform vec4 cpwProbe;
  uniform samplerCube cpwEnv; uniform float cpwEnvOn; uniform float cpwT; uniform float cpwNight; uniform vec3 cpwSky;
  varying vec3 vCpW;
  #ifdef CPW_MIR
  // MR33: the planar mirror (cpWaterMat.js renderMirror): cpwMirOn 1 when this body is the one mirrored this frame
  uniform sampler2D cpwMir; uniform mat4 cpwMirM; uniform vec4 cpwMirP; uniform float cpwMirOn;
  // what the mirror shows along the reflected ray R: the point the ray reaches at the reflected things' distance T, seen
  // by the mirrored camera (the flat reflection lands on the fragment's own point, so the ripples' tilt of R is the
  // distortion and T sets how far it carries); the roughness (the ripples' unresolved slopes) blurs it by its lobe, and
  // the far, grazing water streaks it down the screen as a lake's reflections do
  vec3 cpwMirror(vec3 R, float rough, float T, float streak) {
    vec4 c = cpwMirM * vec4(vec3(vCpW.x, cpwMirP.y, vCpW.z) + R * T, 1.0);
    vec2 uv = c.xy / max(c.w, 1e-4);
    float ang = 0.32 * rough * rough;
    float lod = clamp(log2(max(ang * cpwMirP.x, 1.0)), 0.0, cpwMirP.z);
    vec2 du = vec2(0.0, streak * exp2(lod) * cpwMirP.w);
    vec2 lo = vec2(0.002), hi = vec2(0.998);
    return textureLod(cpwMir, clamp(uv, lo, hi), lod).rgb * 0.5
         + textureLod(cpwMir, clamp(uv + du, lo, hi), lod).rgb * 0.25
         + textureLod(cpwMir, clamp(uv - du, lo, hi), lod).rgb * 0.25;
  }
  #endif
  float cpwHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float cpwH(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(cpwHash(i), cpwHash(i + vec2(1.0, 0.0)), f.x), mix(cpwHash(i + vec2(0.0, 1.0)), cpwHash(i + vec2(1.0, 1.0)), f.x), f.y); }
  // capillary-gravity ripples, 10 trains from CPW_LAM down (x 0.66 each) in golden-angle directions on their own
  // dispersion; a train fades once it is under ~2.5 pixels and returns its slope variance in .z
  vec3 cpwCap(vec2 p, float t, float fp, float amp) {
    vec2 s = vec2(0.0); float lost = 0.0;
    for (int i = 0; i < 10; i++) {
      float fi = float(i);
      float a = fi * 2.3999632 + 0.7;
      vec2 d = vec2(cos(a), sin(a));
      float lam = CPW_LAM * pow(0.66, fi);
      float k = 6.2831853 / lam;
      float w = sqrt(9.81 * k + 7.3e-5 * k * k * k) * CPW_SLOW;
      float sa = amp * (0.55 + 0.45 * fract(fi * 0.618034)) * mix(1.0, 0.6, fi / 9.0);
      float aa = 1.0 - smoothstep(0.9, 2.4, k * fp);
      s += d * (sa * aa * cos(k * dot(d, p) - w * t + fi * 1.93));
      lost += sa * sa * (1.0 - aa) * 0.5;
    }
    return vec3(s, lost);
  }
  #ifdef CPW_OPEN
  // An open body (the Reservoir, 40 ha, ~700 m of fetch): wind-driven short-crested waves. Ten plane trains in fixed
  // directions summed into a lattice that repeated across the whole surface (the owner's review of teaser 4: "a tiled
  // lattice of ripples"); here 18 trains within +-75 deg of the wind, CPW_LAM (2.4 m) down by 0.8 a train, random
  // amplitudes, and each train's crests bent by a slow noise field (a phase of +-2 rad over ~60 m), so no two trains
  // keep a fixed crossing and nothing repeats; a train fades once it is under ~2.5 pixels as the lake's do
  vec3 cpwCapO(vec2 p, float t, float fp, float amp) {
    vec2 s = vec2(0.0); float lost = 0.0;
    vec2 wq = vec2(cpwH(p * 0.017 + vec2(3.7, 1.3)), cpwH(p * 0.017 + vec2(9.1, 5.7))) - 0.5;
    for (int i = 0; i < 18; i++) {
      float fi = float(i);
      float a = 2.35 + (fract(fi * 0.618034 + 0.13) - 0.5) * 2.6;   // the wind from the north-west (toward +x, +z)
      vec2 d = vec2(cos(a), sin(a));
      float lam = CPW_LAM * pow(0.8, fi);
      float k = 6.2831853 / lam;
      float w = sqrt(9.81 * k + 7.3e-5 * k * k * k) * CPW_SLOW;
      float sa = amp * (0.4 + 0.6 * fract(fi * 0.381966 + 0.29)) * mix(1.0, 0.5, fi / 17.0);
      float aa = 1.0 - smoothstep(0.9, 2.4, k * fp);
      float bend = (wq.x * d.y - wq.y * d.x) * 4.0 + (wq.x + wq.y) * (1.0 + fract(fi * 0.7548777)) * 2.0;
      s += d * (sa * aa * cos(k * dot(d, p) - w * t + fi * 1.93 + bend));
      lost += sa * sa * (1.0 - aa) * 0.5;
    }
    return vec3(s, lost);
  }
  #endif`;

// ---- the fountain pool's helpers (CPW_POOL)
const POOL_GLSL = /* glsl */ `
  uniform vec4 cpwFc;        // x, z the fountain's centre (world); y the probe's height (world); w the water's level (world)
  uniform vec4 cpwAx;        // the terrace frame: +a (x, z) toward the Lake, +b (x, z) east
  uniform vec4 cpwPx;        // the probe's parallax ellipse round the centre: a+, a-, b (m); w 1 = the fountain in the water
  uniform vec4 cpwBasin;     // x the rim's inner radius, y the pedestal's radius, z the depth (m), w the coping over the water (m)
  uniform vec4 cpwRing;      // x the landing circle's radius, y the ring waves' slope, z their wavenumber, w the chop round it
  uniform vec4 cpwFoamU;     // x foam strength, y how far inside the landing circle it starts, z its outward decay (1/m)
  uniform vec4 cpwTier[4];   // the fountain round the centre: x radius, y bottom, z top (m over this water), w 0 veil / 1 bronze
  uniform vec4 cpwWing;      // the angel's wings: x the plane's a, y half span, z root bottom, w root top (m over this water)
  float cpwH3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float cpwN3(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(cpwH3(i), cpwH3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(cpwH3(i + vec3(0.0, 1.0, 0.0)), cpwH3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
               mix(mix(cpwH3(i + vec3(0.0, 0.0, 1.0)), cpwH3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(cpwH3(i + vec3(0.0, 1.0, 1.0)), cpwH3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
  }
  float cpwFbm(vec3 p) { return 0.55 * cpwN3(p) + 0.3 * cpwN3(p * 2.03 + 7.1) + 0.15 * cpwN3(p * 4.1 + 3.3); }
  // into the water from the rim and from the pedestal (m)
  float cpwShore(vec2 xz) { float r = length(xz - cpwFc.xy); return min(cpwBasin.x - r, r - cpwBasin.y); }
  // the white churn where the veil plunges and the froth it carries outward (fountainFX FW27): x amount, y its shade
  vec2 cpwFoamAt(vec2 xz) {
    if (cpwFoamU.x <= 0.0) return vec2(0.0, 1.0);
    vec2 fd = xz - cpwFc.xy; float fr = length(fd); vec2 fdir = fr > 1e-4 ? fd / fr : vec2(0.0);
    float fx = fr - cpwRing.x;
    fx -= (cpwN3(vec3(fd * 1.9, cpwT * 0.45)) - 0.5) * 0.55 + (cpwN3(vec3(fd * 6.0, cpwT * 1.1)) - 0.5) * 0.18;   // a ragged edge
    float band = smoothstep(-cpwFoamU.y, -0.04, fx) * exp(-max(fx, 0.0) * cpwFoamU.z);
    vec2 fa = fd - fdir * cpwT * 0.32;
    float fn = cpwFbm(vec3(fa * 3.3, cpwT * 0.55));
    float fc = cpwN3(vec3(fa * 12.0, cpwT * 1.7));
    float f = cpwFoamU.x * band * smoothstep(0.62 - 0.42 * band, 0.86 - 0.2 * band, fn * 0.72 + fc * 0.38);
    float cz = (fx + 0.02) / 0.24; float core = exp(-cz * cz);
    float clot = cpwFbm(vec3(fa * 6.5, cpwT * 1.3)) * 0.75 + cpwN3(vec3(fa * 21.0, cpwT * 2.6)) * 0.35;
    f = max(f, cpwFoamU.x * smoothstep(0.52, 0.78, core * (0.35 + clot)));
    return vec2(clamp(f, 0.0, 1.0), 0.62 + 0.3 * fn + 0.2 * fc);
  }
  // the ring waves off the landing circle, broken into arcs (FW27): xy the slope (outward), z the variance lost to the
  // pixel footprint
  vec3 cpwRings(vec2 xz, float fp, float foam) {
    vec2 d = xz - cpwFc.xy; float rr = length(d);
    vec2 dirR = rr > 1e-4 ? d / rr : vec2(0.0);
    float x = rr - cpwRing.x, k = cpwRing.z;
    float jit = cpwN3(vec3(d * 1.7 + 11.0, cpwT * 0.3)) * 6.0;
    float str = 0.35 + 1.1 * cpwN3(vec3(d * 2.3, cpwT * 0.7));
    float a1 = 1.0 - smoothstep(0.9, 2.4, k * fp), a2 = 1.0 - smoothstep(0.9, 2.4, 1.7 * k * fp), a3 = 1.0 - smoothstep(0.9, 2.4, 22.0 * fp);
    float e1 = exp(-abs(x) * 1.7) * str, e2 = exp(-abs(x) * 3.0) * 0.6 * str, e3 = exp(-rr * 1.6) * 0.5;
    float s1 = cos(k * x - cpwT * 7.5 + jit) * e1 * a1;
    float s2 = cos(k * 1.7 * x + cpwT * 6.1 + 1.3 - jit * 0.6) * e2 * a2;
    float jet = cos(22.0 * rr - cpwT * 9.0 + jit) * e3 * a3;
    float g = cpwRing.y * (1.0 - 0.75 * foam);
    float lost = g * g * (e1 * e1 * (1.0 - a1) + e2 * e2 * (1.0 - a2) + e3 * e3 * (1.0 - a3)) * 0.5;
    return vec3(dirR * (s1 + s2 + jet) * g, lost);
  }
  // choppier round the landing ring and across the pool the falling water keeps stirring (the wavelets reach the rim:
  // the photographs from the rim), in patches that drift with the turbulence (a pool, not a lake: metres, not tens)
  float cpwChop(vec2 xz) {
    vec2 cp = xz - cpwFc.xy; float cr = length(cp);
    float chop = 1.0 + 1.8 * exp(-abs(cr - cpwRing.x) * 1.6) * cpwRing.w + 0.8 * exp(-max(cr - cpwRing.x, 0.0) / 5.0);
    return chop * (0.55 + 0.9 * cpwN3(vec3(cp * 0.6, cpwT * 0.12)));
  }
  // MR33 (the review of teaser 4 v2: "a fine, regular diagonal cross-hatch at one fixed spacing across the whole basin"):
  // cpwCap's ten straight trains in fixed directions summed into a lattice. Here 14 trains whose crests are bent by two slow
  // noise fields (a phase of several radians over a metre or two, a different mix for each train; the Reservoir's cpwCapO
  // scheme at the pool's scale), random amplitudes and wavelengths stepped by 0.74, so no two trains keep a crossing; the
  // chop of the falling water (vector noise in three scales, drifting on different bearings) carries most of the slope
  // between them, the ring waves (cpwRings) the rest; each scale fades once under ~2.5 pixels, as the lake's do
  vec3 cpwCapB(vec2 pw, float t, float fp, float amp) {
    vec2 p = pw - cpwFc.xy;
    vec2 s = vec2(0.0); float lost = 0.0;
    vec2 w1 = vec2(cpwH(p * 0.46 + vec2(3.7, 1.3)), cpwH(p * 0.46 + vec2(9.1, 5.7))) - 0.5;
    vec2 w2 = vec2(cpwH(p * 1.21 + vec2(-4.3, 8.1) + t * 0.05), cpwH(p * 1.21 + vec2(2.9, -6.6) - t * 0.04)) - 0.5;
    for (int i = 0; i < 14; i++) {
      float fi = float(i);
      float a = fi * 2.3999632 + 0.7;
      vec2 d = vec2(cos(a), sin(a));
      float lam = CPW_LAM * pow(0.74, fi);
      float k = 6.2831853 / lam;
      float w = sqrt(9.81 * k + 7.3e-5 * k * k * k) * CPW_SLOW;
      float sa = 0.6 * amp * (0.3 + 0.7 * fract(fi * 0.381966 + 0.29)) * mix(1.0, 0.5, fi / 13.0);
      float aa = 1.0 - smoothstep(0.9, 2.4, k * fp);
      float bend = (w1.x * d.y - w1.y * d.x) * 9.0 + (w2.x * d.x + w2.y * d.y) * (3.0 + 3.0 * fract(fi * 0.7548777)) + (w2.x - w1.y) * 2.0;
      s += d * (sa * aa * cos(k * dot(d, p) - w * t + fi * 1.93 + bend));
      lost += sa * sa * (1.0 - aa) * 0.5;
    }
    float cf = 1.9, ca = 1.0;
    for (int j = 0; j < 3; j++) {
      float fj = float(j);
      vec2 dr = vec2(cos(fj * 2.1 + 0.4), sin(fj * 2.1 + 0.4)) * (0.16 + 0.09 * fj);
      vec2 q = p * cf + dr * t * cf + vec2(fj * 7.3, fj * 3.1);
      float aj = 1.0 - smoothstep(0.9, 2.4, 6.2831853 * cf * fp);
      s += (ca * aj * amp * 1.7) * (vec2(cpwH(q), cpwH(q + vec2(17.3, 5.1))) - 0.5);
      lost += ca * ca * amp * amp * 0.15 * (1.0 - aj);
      cf *= 2.3; ca *= 0.55;
    }
    return vec3(s, lost);
  }
  // the web of light the rippled surface focuses on the floor (FW27): ridges of two drifting noise fields
  float cpwCaus(vec2 p, float t) {
    vec2 q = p * 2.4 + 0.45 * vec2(sin(t * 0.8 + p.y * 1.7), cos(t * 0.7 + p.x * 1.5));
    float r1 = 1.0 - abs(2.0 * cpwN3(vec3(q, t * 0.9)) - 1.0);
    float r2 = 1.0 - abs(2.0 * cpwN3(vec3(q * 1.63 + 3.7, t * 1.2 + 5.0)) - 1.0);
    r1 *= r1; r1 *= r1 * r1; r2 *= r2; r2 *= r2 * r2;
    return r1 * 0.8 + r2 * 0.6;
  }
  vec3 cpwSkyL(vec3 R) {
    vec3 zen = cpwSky * 1.95, hor = cpwSky * 2.3;
    #ifdef USE_FOG
      hor = fogSkyColor(vec3(R.x, max(R.y, 0.0), R.z), hor);
    #endif
    return mix(hor, zen, pow(clamp(R.y, 0.0, 1.0), 0.42)) * (1.0 - 0.85 * cpwNight);
  }
  // where the ray from (o, the terrace frame) along d meets the ellipse of semi-axes A (along a) and B (along b)
  float cpwEll(vec2 o, vec2 d, float A, float B) {
    vec2 q = vec2(1.0 / (A * A), 1.0 / (B * B));
    float qa = max(dot(d * d, q), 1e-9), qb = 2.0 * dot(o * d, q), qc = dot(o * o, q) - 1.0;
    return (-qb + sqrt(max(qb * qb - 4.0 * qa * qc, 0.0))) / (2.0 * qa);
  }
  // the terrace mirrored: the probe over the pool (captured with the fountain hidden), looked up toward the point where
  // the reflected ray meets the terrace's proxy (the Arcade's face to the south, the side walls and the slopes' trees
  // either side, the Lake's far shore to the north), else the sky and the far shore's dark band
  vec3 cpwRefl(vec3 R, float lod) {
    if (cpwEnvOn < 0.5) {
      float band = 1.0 - smoothstep(0.02, 0.16, R.y);
      return mix(cpwSkyL(R), vec3(0.018, 0.026, 0.014) * (1.0 - 0.8 * cpwNight), band * 0.85);
    }
    vec2 o = vCpW.xz - cpwFc.xy;
    vec2 oa = vec2(dot(o, cpwAx.xy), dot(o, cpwAx.zw)), da = vec2(dot(R.xz, cpwAx.xy), dot(R.xz, cpwAx.zw));
    vec3 dir = R;
    if (dot(da, da) > 1e-6) {
      bool n0 = oa.x >= 0.0;
      float t = cpwEll(oa, da, n0 ? cpwPx.x : cpwPx.y, cpwPx.z);
      if ((oa.x + da.x * t >= 0.0) != n0) t = cpwEll(oa, da, n0 ? cpwPx.y : cpwPx.x, cpwPx.z);
      vec3 hit = vCpW + R * t;
      dir = normalize(hit - vec3(cpwFc.x, cpwFc.z, cpwFc.y));
    }
    dir.y = max(dir.y, 0.03);
    return textureLod(cpwEnv, normalize(dir), lod).rgb;
  }
  // the fountain where the reflected ray meets it: its tiers (cylinders round the centre), the plane of the angel's
  // wings, the coping's inner face; else what cpwRefl found
  vec3 cpwFount(vec3 R, vec3 refl, vec3 eD, vec3 eA, float trim) {
    vec2 o = vCpW.xz - cpwFc.xy, d = R.xz;
    float a = max(dot(d, d), 1e-6), bb = dot(o, d), c0 = dot(o, o);
    float sBest = 1e9, kind = -1.0, hy = 0.0; vec2 hp = vec2(0.0);
    if (cpwPx.w > 0.5) {
      for (int k = 0; k < 4; k++) {
        vec4 T = cpwTier[k];
        if (T.x <= 0.0) continue;
        float c = c0 - T.x * T.x, q = bb * bb - a * c;
        if (c <= 0.0 || bb >= 0.0 || q <= 0.0) continue;
        float s = (-bb - sqrt(q)) / a, h = s * R.y;
        if (h < T.y || h > T.z || s >= sBest) continue;
        sBest = s; kind = T.w; hp = o + d * s; hy = h;
      }
      if (cpwWing.y > 0.0) {
        // she faces the Arcade (-a); the wings are raised in a V behind her, the tips over her head
        float oA = dot(o, cpwAx.xy), dA = dot(d, cpwAx.xy);
        if (abs(dA) > 1e-4) {
          float s = (cpwWing.x - oA) / dA;
          if (s > 0.0 && s < sBest) {
            float hb = abs(dot(o, cpwAx.zw) + dot(d, cpwAx.zw) * s), h = s * R.y;
            if (hb < cpwWing.y && h > cpwWing.z + 0.3 * hb && h < cpwWing.w + 0.46 * hb) { sBest = s; kind = 1.0; hp = o + d * s; hy = h; }
          }
        }
      }
    }
    if (kind > 0.5) return (eD * 0.3 + eA * 0.7) * trim * vec3(0.052, 0.066, 0.058);   // the weathered bronze
    if (kind > -0.5) {
      // a veil: ropes ~0.18 m apart riding down it (fountainFX FW27), over the dark stone behind the sheet
      float st = cpwN3(vec3(hp * 5.5, hy * 0.9 + cpwT * 1.9)) * 0.7 + cpwN3(vec3(hp * 17.0 + 4.0, hy * 2.5 + cpwT * 3.1)) * 0.45;
      float rope = smoothstep(0.38, 0.6, st);
      vec3 white = (eD * 0.4 + eA * 1.15) * trim * 0.8, dark = (eD * 0.15 + eA * 0.6) * trim * 0.14;
      #ifdef CPW_MIR
      // MR33 (the review of teaser 4 v2: "the fountain's reflection in the pool is a dark slab"): the sheets are clear
      // water over the lit stone of the base and the columns, white where they rope and aerate, as they stand over the
      // pool; only the mirror's own fountain (cpwMirOn) is sharper
      dark = (eD * 0.45 + eA * 0.75) * trim * vec3(0.46, 0.43, 0.38);
      return mix(mix(dark, refl, 0.25), white, 0.3 + 0.55 * rope);
      #else
      return mix(dark, white, rope);
      #endif
    }
    // the coping's inner face, where the ray leaves the basin under the coping's top
    float q = bb * bb - a * (c0 - cpwBasin.x * cpwBasin.x);
    if (q > 0.0 && (-bb + sqrt(q)) / a * R.y < cpwBasin.w) return (eD * 0.3 + eA * 0.6) * trim * vec3(0.26, 0.245, 0.225);
    return refl;
  }`;

// The water material. o: { name, color (the base colour three lights with: only the foam and the glint use it), rough,
// U (uniforms: the core's cpwCol, cpwP (x ripple slope, y shore depth gain (1/m), z bed albedo, w probe lod bias),
// cpwProbe, cpwEnv, cpwEnvOn, cpwT, cpwNight, cpwSky, and the body's own), glsl (the body's helpers after the core),
// key (the program cache key), defines }
export function cpWaterMat(o) {
  const m = new THREE.MeshStandardMaterial({ color: o.color ?? 0x0a120a, roughness: o.rough ?? 0.05, metalness: 0 });
  m.name = o.name || 'cpw:water';
  if (o.defines) m.defines = { ...(m.defines || {}), ...o.defines };   // (keeps three's STANDARD)
  const U = o.U;
  m.userData.cpw = U;
  if (CPMIR) {
    // MR33: the shared mirror and this material's switch (mirHook sets it per draw)
    m.defines = { ...(m.defines || {}), CPW_MIR: '' };
    Object.assign(U, MIR_U);
    if (!U.cpwMirOn) U.cpwMirOn = { value: 0 };
    m.onBeforeRender = mirHook;
  }
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCpW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCpW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>')
      .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\n' + CPW_CORE_GLSL + (o.glsl || ''))
      .replace('#include <color_fragment>', `#include <color_fragment>
        float cpwFp = max(length(dFdx(vCpW.xz)), length(dFdy(vCpW.xz)));
        float cpwS = cpwShore(vCpW.xz);
        #ifdef CPW_POOL
          // the pool: the churn where the veil lands and the ring waves off it; ripples in patches a few metres across,
          // choppier round the landing ring, calmer against the rim
          vec2 cpwFm = cpwFoamAt(vCpW.xz);
          float cpwFoam = cpwFm.x;
          vec3 cpwRg = cpwRings(vCpW.xz, cpwFp, cpwFoam);
          float cpwPatch = 0.35 + 0.95 * smoothstep(0.25, 0.85, cpwH(vCpW.xz * 0.31 + vec2(cpwT * 0.05, -cpwT * 0.035)))
                         * (0.6 + 0.4 * cpwH(vCpW.xz * 0.93 - vec2(cpwT * 0.09, cpwT * 0.06)));
          cpwPatch *= mix(0.55, 1.0, smoothstep(0.2, 2.5, cpwS)) * cpwChop(vCpW.xz);
          #ifdef CPW_OLDCAP
          vec3 cpwCp = cpwCap(vCpW.xz, cpwT, cpwFp, cpwP.x * cpwPatch * (1.0 - 0.6 * cpwFoam));
          #else
          vec3 cpwCp = cpwCapB(vCpW.xz, cpwT, cpwFp, cpwP.x * cpwPatch * (1.0 - 0.6 * cpwFoam));
          #endif
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.89, 0.9) * cpwFm.y, cpwFoam);
        #else
        // wind patches (cat's paws) drift over the water; the shore's lee is calmer
        float cpwPatch = 0.35 + 0.95 * smoothstep(0.25, 0.85, cpwH(vCpW.xz * 0.018 + vec2(cpwT * 0.011, -cpwT * 0.007)))
                       * (0.6 + 0.4 * cpwH(vCpW.xz * 0.07 - vec2(cpwT * 0.02, cpwT * 0.013)));
        cpwPatch *= mix(0.45, 1.0, smoothstep(0.5, 12.0, cpwS));
        #ifdef CPW_OPEN
        vec3 cpwCp = cpwCapO(vCpW.xz, cpwT, cpwFp, cpwP.x * cpwPatch);
        #else
        vec3 cpwCp = cpwCap(vCpW.xz, cpwT, cpwFp, cpwP.x * cpwPatch);
        #endif
        #endif`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        #ifdef CPW_POOL
          roughnessFactor = clamp(pow(roughnessFactor * roughnessFactor * roughnessFactor * roughnessFactor + 2.0 * (cpwCp.z + cpwRg.z), 0.25), 0.04, 0.45);
          roughnessFactor = mix(roughnessFactor, 0.55, cpwFoam);
        #else
        roughnessFactor = clamp(pow(roughnessFactor * roughnessFactor * roughnessFactor * roughnessFactor + 2.0 * cpwCp.z, 0.25), 0.04, 0.45);
        #endif`)
      .replace('#include <clearcoat_normal_fragment_begin>', `
        #ifdef CPW_POOL
          normal = normalize(normal + (viewMatrix * vec4(-cpwCp.x - cpwRg.x, 0.0, -cpwCp.y - cpwRg.y, 0.0)).xyz);
        #else
        normal = normalize(normal + (viewMatrix * vec4(-cpwCp.x, 0.0, -cpwCp.y, 0.0)).xyz);
        #endif
        #include <clearcoat_normal_fragment_begin>`)
      .replace('#include <opaque_fragment>', `
        {
          vec3 wV = normalize(cameraPosition - vCpW);
          vec3 wN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          wN = normalize(vec3(wN.x, max(wN.y, 0.35), wN.z));
          float fr = 0.0204 + 0.9796 * pow(1.0 - clamp(dot(wN, wV), 0.0, 1.0), 5.0);
          vec3 dif = max(material.diffuseContribution, vec3(1e-4));
          vec3 eD = reflectedLight.directDiffuse / dif, eA = reflectedLight.indirectDiffuse / dif;
          float trim = mix(0.30, 0.88, cpwNight);
          vec3 wR = reflect(-wV, wN); wR.y = max(wR.y, 0.015); wR = normalize(wR);
          // the mirror's blur from the surface's roughness (which already carries the ripples' unresolved slopes), not
          // per-pixel slope noise, so it does not sparkle into grain at range
          #ifdef CPW_OPEN
          // an open body: the rippled normal already stretches the reflections into long streaks, so the probe's blur
          // is kept low (the near shore read as a smear under the lake's blur)
          float cpwLod = cpwP.w + clamp(roughnessFactor * 4.0 - 0.15, 0.0, 2.5);
          #else
          float cpwLod = cpwP.w + clamp(roughnessFactor * 9.0 - 0.2, 0.0, 5.0);
          #endif
          vec3 refl = vec3(0.0);
          #ifdef CPW_MIR
          if (cpwMirOn < 0.999) {
          #endif
            refl = cpwRefl(wR, cpwLod);
            #ifdef CPW_POOL
            refl = cpwFount(wR, refl, eD, eA, trim);
            #endif
          #ifdef CPW_MIR
          }
          if (cpwMirOn > 0.001) {
            // MR33: the planar mirror. T the reflected things' distance: the far shore's from the body's field (the
            // pool's fountain and terrace close by); the far, grazing water streaked down the screen
            #ifdef CPW_POOL
            float cpwTm = clamp(2.0 + 1.2 * max(cpwS, 0.0), 3.0, 14.0);
            #else
            float cpwTm = clamp(8.0 + 1.5 * max(cpwS, 0.0), 10.0, 90.0);
            #endif
            float cpwSt = smoothstep(0.35, 0.05, abs(wV.y)) * 1.5;
            #ifdef CPW_OPEN
            vec3 cpwMr = cpwMirror(wR, roughnessFactor * 0.6, cpwTm, cpwSt);
            #else
            vec3 cpwMr = cpwMirror(wR, roughnessFactor, cpwTm, cpwSt);
            #endif
            refl = mix(refl, cpwMr, cpwMirOn);
          }
          #endif
          #ifdef CPW_POOL
            // an even basin: the path through it from the refracted view ray; its floor dark granite with the sun's
            // caustic web on it, faded once the web is under a few pixels
            vec3 wT = refract(-wV, wN, 0.7502);
            float cpwDy = max(-wT.y, 0.25);
            float depth = cpwBasin.z / cpwDy;
            vec3 sig = vec3(3.2, 1.9, 2.6);
            vec3 T = exp(-sig * depth * 1.6);
            vec3 lit = (eD + eA * 0.8) * trim;
            vec2 cpwFl = vCpW.xz + wT.xz / cpwDy * cpwBasin.z;
            float caus = mix(0.25, cpwCaus(cpwFl, cpwT), 1.0 - smoothstep(0.02, 0.08, cpwFp));
            vec3 bed = (eD * (0.35 + 1.3 * caus) + eA * 0.8) * trim * cpwP.z * vec3(0.62, 0.62, 0.58) * (0.75 + 0.5 * cpwH(cpwFl * 2.1));
            vec3 body = lit * cpwCol * 0.9 * (1.0 - T) + bed * T;
            // the coping's shade on the water along the rim
            body *= mix(0.62, 1.0, smoothstep(0.0, 0.9, cpwS));
          #else
          // the water column: sunlight and skylight scattered back by the fine silt, and the bed through the shallows
          float depth = max(cpwS, 0.0) * cpwP.y + 0.08;
          vec3 sig = vec3(3.2, 1.9, 2.6);                         // per metre: the green water swallows red and blue first
          vec3 T = exp(-sig * depth * 1.6);
          vec3 lit = (eD + eA * 0.8) * trim;
          vec3 bed = lit * cpwP.z * vec3(0.72, 0.62, 0.46) * (0.7 + 0.6 * cpwH(vCpW.xz * 1.3));
          // algae: the summer's green scum drifting in the still water near the shores (the NAIP frames show it on the
          // Lake's south-west arms), in slow patches
          float alg = smoothstep(0.62, 0.9, cpwH(vCpW.xz * 0.045 + vec2(cpwT * 0.002, 0.0)) * 0.7 + cpwH(vCpW.xz * 0.31) * 0.3) * (1.0 - smoothstep(4.0, 22.0, cpwS));
          vec3 colA = mix(cpwCol, vec3(0.040, 0.066, 0.018), alg * 0.55);
          // (the stills from above at 30-40 degrees read a lawn-bright green at 1.5: a park lake's water column sends back
          // 2-4 % of the light, so it is dark there and the mirror carries it at the low angles)
          vec3 body = lit * colA * 0.9 * (1.0 - T) + bed * T;
          // the bank's shade in the water along the shore (the trees and the bank itself over it)
          body *= mix(0.62, 1.0, smoothstep(0.0, 3.5, cpwS));
          #endif
          vec3 gl = reflectedLight.directSpecular;
          gl *= min(1.0, 40.0 / max(dot(gl, vec3(0.2126, 0.7152, 0.0722)), 1e-4));
          outgoingLight = refl * fr + body * (1.0 - fr) + gl;
          #ifdef CPW_POOL
            // the churned white water, lit as every lit surface is (the city's light trim)
            outgoingLight = mix(outgoingLight, (eD * 0.9 + eA) * trim * diffuseColor.rgb, cpwFoam);
          #endif
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => o.key || 'cpw-water';
  m.needsUpdate = true;
  return m;
}

// A fountain pool's water (Bethesda's pool and basins). o: { name, level (world y of the water), c (world [x, z] of the
// fountain's centre), ax ([+a x, +a z, +b x, +b z], the terrace frame), probeY (world y of fountainFX's probe), rimR,
// pedR, depth, cope (the coping over the water), col ([r, g, b]), amp (ripple slope), bed (floor albedo), ring:
// { impR, amp, k, chop }, foam: { s, in, out }, tiers ([[radius, bottom, top, 0 veil | 1 bronze] x <= 4], m over this
// water), wing ([a, half span, root bottom, root top] or null), ell ([a+, a-, b]) }. The probe is filled by
// fountainFX.fountainProbe through material.userData.fw27.
export function cpPoolWaterMat(o) {
  const V4 = (a) => new THREE.Vector4(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, a[3] ?? 0);
  const tiers = (o.tiers || []).concat([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]).slice(0, 4).map(V4);
  const U = {
    cpwCol: { value: new THREE.Vector3(...(o.col || [0.026, 0.042, 0.038])) },
    cpwP: { value: new THREE.Vector4(o.amp ?? 0.02, 0, o.bed ?? 0.1, 0) },
    cpwProbe: { value: new THREE.Vector4(o.c[0], o.c[1], o.probeY ?? o.level + 1.6, 40) },
    cpwEnv: { value: null }, cpwEnvOn: { value: 0 },
    cpwT: ENV.time, cpwNight: ENV.night, cpwSky: ENV.skyAmbient,
    cpwFc: { value: new THREE.Vector4(o.c[0], o.c[1], o.probeY ?? o.level + 1.6, o.level) },
    cpwAx: { value: V4(o.ax || [0, -1, 1, 0]) },
    cpwPx: { value: V4([...(o.ell || [150, 52, 32]), o.tiers && o.tiers.length ? 1 : 0]) },
    cpwBasin: { value: new THREE.Vector4(o.rimR, o.pedR ?? 0, o.depth ?? 0.5, o.cope ?? 0.15) },
    cpwRing: { value: new THREE.Vector4(o.ring?.impR ?? 0, o.ring?.amp ?? 0, o.ring?.k ?? 14, o.ring?.chop ?? 0) },
    cpwFoamU: { value: new THREE.Vector4(o.foam?.s ?? 0, o.foam?.in ?? 0.5, o.foam?.out ?? 1.4, 0) },
    cpwTier: { value: tiers },
    cpwWing: { value: V4(o.wing || [0, 0, 0, 0]) },
  };
  const m = cpWaterMat({ name: o.name || 'cpw:pool', color: 0x0a120a, rough: 0.05, U, glsl: POOL_GLSL, key: 'cpw-pool-1',
    defines: { CPW_POOL: '', CPW_LAM: (o.lam ?? 0.55).toFixed(3), CPW_SLOW: (o.slow ?? 0.85).toFixed(3), ...(POOLCAP ? {} : { CPW_OLDCAP: '' }) } });
  m.userData.fw27 = { env: U.cpwEnv, on: U.cpwEnvOn };   // fountainFX.fountainProbe hands its capture over here
  // MR33: a pool (not the basins on the fountain) is a body the mirror can serve: then the real fountain is in its water
  if (CPMIR && (o.rimR ?? 0) >= 5) {
    const cx = o.c[0], cz = o.c[1], r0 = o.pedR ?? 0, r1 = o.rimR;
    cpwMirrorBody({ key: o.name || 'cpw:pool', box: [cx - r1, cz - r1, cx + r1, cz + r1], mats: [m], level: o.level,
      inside: (x, z) => { const r = Math.hypot(x - cx, z - cz); return r < r1 && r > r0; } });
  }
  return m;
}
