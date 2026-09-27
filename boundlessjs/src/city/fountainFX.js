// FW25 — fountain water that reads as water (owner 2026-09-25: "Columbia steps fountains' water still looks
// basic/nonrealistic. I'd like proper high quality graphics for that shot").
//
// What was there: pools as flat discs with two scrolling ripple normals, a translucent white veil of strands and foam
// rings. In the film that reads as a frosted glass bowl, because nothing on it behaves like falling water. Real falling
// water is dominated by three things this adds:
//   * DROPLETS. The sheet off a lip breaks into ropes and drops within a metre; the landing throws splash crowns; a jet
//     is a column of drops that fans out at the top. Each drop here is a ballistic particle (p0 + v t + g t^2 / 2 on
//     the sim clock ENV.time, so a recorded take steps them frame-exactly), drawn as a screen-space streak along its
//     own velocity (the motion blur of a 1/30 s exposure) with a one-pixel floor whose alpha keeps the energy of a
//     sub-pixel drop. Lit by the sun with a strong forward lobe: backlit spray glows, which is what sells it at golden
//     hour.
//   * RING WAVES. The pool surface carries travelling capillary rings from the impact circle and the jet, decaying with
//     distance, on top of the wind ripple; the reflection of the sky and the campus breaks up along them.
//   * A CLEAR SHEET. The veil is mostly transparent, glossy and Fresnel-bright, and breaks up into ropes towards the
//     bottom (see campus.js FW.sheet).
// The spray is transparent with depthWrite off, so the perception passes leave it out (segRender isHideable).
// `?fw25=0` restores the round-14 fountains.
import * as THREE from 'three';
import { ENV } from '../world/materials.js';

export const FW25 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('fw25') === '0');
// FW26 (owner review of FW25 frames, same day): the veil still read as a striped glass lampshade and the landing zone as
// dark cells. Falling water is modelled along its own travel time now (veilMat): glassy with capillary bands off the lip,
// roping and tearing as it accelerates, aerated white at the bottom, its reflection kept at full strength while the
// body stays see-through, backlit glow towards the sun; the pools churn white where it lands (poolRings foam). `?fw26=0`
// keeps FW25.
export const FW26 = FW25 && !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('fw26') === '0');
// FW27 (owner 2026-09-26: "fountains need more work to look photorealistic"). The film-9 pools were a dark teal plane
// with one tiled ripple and next to no reflection: the pool took its mirror from three's IBL, a sun-free sky PMREM at
// scene.environmentIntensity. From eye height a pool mirrors the CAMPUS (Low's steps, the terraces, the trees), not the
// sky, and it is clear: the floor shows through, darkening with the path length through the water. Now:
//   * a small cube probe per plaza fountain (fountainProbe), captured from above its pool with both fountains hidden,
//     is what the pool, the bowl and the veils reflect; the fountain's own veil and the coping's inner face are added
//     analytically where the reflected ray meets them
//   * the surface refracts into an analytic basin (floor, outer wall, pedestal foot): Beer absorption and in-scatter
//     over the path, the floor lit by the pool's own shadowed light with a caustic web on the direct sun
//   * capillary-gravity ripples (12 dispersive trains) replace most of the tiled map, choppier round the landing ring;
//     each train fades once it is under ~2.5 px and its slope variance widens the glint instead of sparkling
//   * a white churning core where the veil plunges, mist and more splash drops, finer veil ropes, a broken crown
// `?fw27=0` keeps FW26.
export const FW27 = FW26 && !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('fw27') === '0');

const NOISE_GLSL = /* glsl */ `
  float fwH3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float fwN3(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(fwH3(i), fwH3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(fwH3(i + vec3(0.0, 1.0, 0.0)), fwH3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
               mix(mix(fwH3(i + vec3(0.0, 0.0, 1.0)), fwH3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(fwH3(i + vec3(0.0, 1.0, 1.0)), fwH3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
  }
  float fwFbm(vec3 p) { return 0.55 * fwN3(p) + 0.3 * fwN3(p * 2.03 + 7.1) + 0.15 * fwN3(p * 4.1 + 3.3); }`;

// FW27 pool helpers (after the fog chunk, so the sky fallback can read the FS26 horizon ring)
const POOL27_GLSL = /* glsl */ `
  // capillary-gravity ripples: 12 trains from 26 cm down to 2.2 cm in scattered (golden-angle) directions, each on its
  // own dispersion w = sqrt(g k + (sigma / rho) k^3); a train fades once its wavelength is under ~2.5 pixels and its
  // slope variance comes back in .z for the roughness
  vec3 fwCap(vec2 p, float t, float fp, float amp) {
    vec2 s = vec2(0.0); float lost = 0.0;
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      float a = fi * 2.3999632 + 0.5;
      vec2 d = vec2(cos(a), sin(a));
      float k = 6.2831853 / (0.26 * pow(0.8, fi));
      float w = sqrt(9.81 * k + 7.3e-5 * k * k * k);
      float sa = amp * (0.6 + 0.4 * fract(fi * 0.618034));
      float aa = 1.0 - smoothstep(0.9, 2.4, k * fp);
      s += d * (sa * aa * cos(k * dot(d, p) - w * t + fi * 1.93));
      lost += sa * sa * (1.0 - aa) * 0.5;
    }
    return vec3(s, lost);
  }
  // the web of light the rippled surface focuses on the floor: ridges of two drifting noise fields
  float fwCaus(vec2 p, float t) {
    vec2 q = p * 2.4 + 0.45 * vec2(sin(t * 0.8 + p.y * 1.7), cos(t * 0.7 + p.x * 1.5));
    float r1 = 1.0 - abs(2.0 * fwN3(vec3(q, t * 0.9)) - 1.0);
    float r2 = 1.0 - abs(2.0 * fwN3(vec3(q * 1.63 + 3.7, t * 1.2 + 5.0)) - 1.0);
    r1 *= r1; r1 *= r1 * r1; r2 *= r2; r2 *= r2 * r2;
    return r1 * 0.8 + r2 * 0.6;
  }
  // what the surface mirrors: the fountain's probe once it has been captured, else the analytic sky
  vec3 fwSkyL(vec3 d, float lod) {
    vec3 c;
    if (fwEnvOn > 0.5) c = textureLod(fwEnv, d, lod).rgb;
    else {
      vec3 zen = fwSky * 1.95, hor = fwSky * 2.3;
      #ifdef USE_FOG
        hor = fogSkyColor(vec3(d.x, max(d.y, 0.0), d.z), hor);
      #endif
      c = mix(hor, zen, pow(clamp(d.y, 0.0, 1.0), 0.42)) * (1.0 - 0.85 * fwNight);
    }
    return c;
  }`;

// FW27 reflection probes: one 128 px cube per plaza fountain, rendered from above its pool with every fountain hidden.
// A capture is requested from the pool's own onBeforeRender (main view only, within 400 m; the pool is never frustum
// culled, so the probe is ready before the fountain turns into the frame) on a short schedule of main-view frames (tiles
// and the campus kit are still streaming in; a recorder's settle draws hundreds) and again whenever the sun moves; it
// runs from a one-shot scene.onBeforeRender, i.e. before the next render of the scene has started, never nested inside
// a pass. A late re-capture of a settled world changes nothing but the walkers' reflections.
const PROBES = [];
const SCHED = [1, 6, 24, 80, 200];
const _wp = new THREE.Vector3();
const pending = new Set();
let capturing = false;
function captureProbe(P, r, scene) {
  capturing = true;
  const vis = PROBES.map((q) => q.G.visible);
  try {
    for (const q of PROBES) q.G.visible = false;
    P.G.updateWorldMatrix(true, false);
    P.cam.position.set(0, P.y, 0);
    P.G.localToWorld(P.cam.position);
    P.cam.updateMatrixWorld(true);
    if (P.cam.coordinateSystem !== r.coordinateSystem) { P.cam.coordinateSystem = r.coordinateSystem; P.cam.updateCoordinateSystem(); }
    const rt0 = r.getRenderTarget(), f0 = r.getActiveCubeFace(), m0 = r.getActiveMipmapLevel();
    const xr = r.xr.enabled, sh = r.shadowMap.autoUpdate;
    r.xr.enabled = false; r.shadowMap.autoUpdate = false;
    const tex = P.rt.texture;
    tex.generateMipmaps = false;
    for (let i = 0; i < 6; i++) {
      if (i === 5) tex.generateMipmaps = true;   // the mip chain is built after the last face
      r.setRenderTarget(P.rt, i);
      r.clear(true, true, true);
      r.render(scene, P.cam.children[i]);
    }
    r.setRenderTarget(rt0, f0, m0);
    r.xr.enabled = xr; r.shadowMap.autoUpdate = sh;
    tex.needsPMREMUpdate = true;               // the veils take it through three's PMREM
    P.sun.copy(ENV.sunDir.value);
    for (const m of P.mats) { const u = m?.userData.fw27; if (u) { u.env.value = tex; u.on.value = 1; } }
    for (const m of P.veils) if (m.envMap !== tex) { m.envMap = tex; m.envMapIntensity = 1.0; m.needsUpdate = true; }
  } finally {
    PROBES.forEach((q, i) => { q.G.visible = vis[i]; });
    capturing = false;
  }
}
function requestProbe(P, scene) {
  pending.add(P);
  if (scene.userData.fw27Armed) return;
  scene.userData.fw27Armed = true;
  const orig = scene.onBeforeRender;
  scene.onBeforeRender = function (r, s, c, rt) {
    scene.onBeforeRender = orig;
    scene.userData.fw27Armed = false;
    for (const q of [...pending]) captureProbe(q, r, scene);
    pending.clear();
    orig.call(this, r, s, c, rt);
  };
}
// pool: the pool mesh (its onBeforeRender drives the schedule); G: the fountain group; mats: the pool and bowl
// materials (poolRings); y: the probe height in the group's frame
export function fountainProbe(pool, G, mats, y) {
  if (!FW27 || !pool) return;
  const rt = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const P = { G, rt, cam: new THREE.CubeCamera(0.3, 900, rt), y, mats, veils: [], n: 0, step: 0, sun: new THREE.Vector3(), has: false };
  G.traverse((o) => { if (o.material?.name === 'fw26:veil') P.veils.push(o.material); });
  PROBES.push(P);
  const prevBR = pool.onBeforeRender;
  pool.frustumCulled = false;
  pool.onBeforeRender = function (renderer, scene, camera, ...rest) {
    prevBR.call(this, renderer, scene, camera, ...rest);
    if (capturing || !camera.isPerspectiveCamera || Math.abs(camera.fov - 90) < 0.01) return;   // cube faces are 90 deg
    const rt0 = renderer.getRenderTarget();
    if (rt0 && rt0.isWebGLCubeRenderTarget) return;
    if (G.getWorldPosition(_wp).distanceToSquared(camera.position) > 160000) return;
    if (P.has && P.sun.distanceToSquared(ENV.sunDir.value) > 1e-4) { P.step = 0; P.n = 0; }   // a new time of day
    P.n++;
    if (P.step < SCHED.length && P.n >= SCHED[P.step]) { P.step++; P.has = true; requestProbe(P, scene); }
  };
}

// Falling (or rising) water on a lathe mesh in the fountain group's frame. o: { y0 source height, dir +1 falls from y0 /
// -1 rises from y0, v0 speed at the source (m/s), tMax travel time of the whole run (s), aer [start, end] of the
// aeration ramp over the run (0..1), holes hole fraction reached at the end, body opacity of clear water, freq across-flow
// frequency (1/m) }. Every veil shares one program; the per-mesh values are uniforms.
export function veilMat(o, trim) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.04, metalness: 0.0, ior: 1.333, specularIntensity: 1.0, envMapIntensity: 1.25,
    transparent: true, side: THREE.DoubleSide, depthWrite: false,
  });
  if (trim) trim(mat);
  const prev = mat.onBeforeCompile;
  const uV = { value: new THREE.Vector4(o.y0, o.dir ?? 1, o.v0 ?? 0.3, o.tMax ?? 0.6) };
  const uA = { value: new THREE.Vector4(o.aer?.[0] ?? 0.4, o.aer?.[1] ?? 1.0, o.holes ?? 0.5, o.body ?? 0.28) };
  const uF = { value: o.freq ?? 5.5 };
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    Object.assign(sh.uniforms, { fwT: ENV.time, fwV: uV, fwA: uA, fwF: uF, fwSunD: ENV.sunDir, fwSunC: ENV.sunColor, fwNight: ENV.night });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFwL; varying vec3 vFwW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFwL = transformed; vFwW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float fwT; uniform vec4 fwV; uniform vec4 fwA; uniform float fwF;
        uniform vec3 fwSunD; uniform vec3 fwSunC; uniform float fwNight;
        varying vec3 vFwL; varying vec3 vFwW;${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // travel time since the source: falls d = v0 t + g t^2 / 2, rises d = v0 t - g t^2 / 2
        float fwD = max((fwV.x - vFwL.y) * fwV.y, 0.0);
        float fwTf = fwV.y > 0.0 ? (-fwV.z + sqrt(fwV.z * fwV.z + 19.62 * fwD)) / 9.81
                                 : (fwV.z - sqrt(max(fwV.z * fwV.z - 19.62 * fwD, 0.0))) / 9.81;
        float fwU = clamp(fwTf / fwV.w, 0.0, 1.0);
        float fwAl = fwT - fwTf;                          // when this water left the source: the pattern rides the flow
        vec2 fwQ = vFwL.xz * fwF;
        // pure advection: a feature is a parcel of water (its release time), so it falls at the water's own speed and
        // stretches as the sheet accelerates; tears open with age through the threshold below, not the noise
        float fwN = fwFbm(vec3(fwQ, fwAl * 9.0));
        float fwN2 = fwN3(vec3(vFwL.xz * fwF * 3.1, fwAl * 16.0));${FW27 ? `
        // FW27: a finer octave in the tearing field, so the sheet opens into thin ropes and drop-sized holes
        float fwN4 = fwN3(vec3(vFwL.xz * fwF * 7.3 + 2.1, fwAl * 34.0));
        fwN = mix(fwN, fwN4, 0.3);` : ''}
        float fwThr = fwA.z * smoothstep(0.22, 1.0, fwU);                  // tears open as the sheet accelerates
        float fwCov = smoothstep(fwThr - 0.07, fwThr + 0.05, fwN);
        float fwEdge = (1.0 - smoothstep(0.0, 0.14, fwN - fwThr)) * step(0.015, fwThr);   // torn edges foam
        float fwAer = clamp(smoothstep(fwA.x, fwA.y, fwU) * (0.5 + 0.65 * fwN2) + fwEdge * 0.65, 0.0, 1.0);
        diffuseColor.rgb = mix(vec3(0.012, 0.024, 0.026), vec3(${FW27 ? '0.88, 0.91, 0.92' : '0.8, 0.85, 0.86'}), fwAer);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.035, 0.5, fwAer);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // capillary bands across the smooth sheet near the source, rope relief across the flow further down
          vec3 fwUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          vec3 fwAc = cross(fwUp, normal); float fwAcL = length(fwAc); fwAc = fwAcL > 1e-4 ? fwAc / fwAcL : vec3(0.0);
          float fwBand = sin(fwAl * 47.0 + fwN * 6.0) * (1.0 - fwU) * 0.3;
          float fwRope = (fwN2 - 0.5) * (0.25 + 0.55 * fwU) + (fwN - 0.5) * 0.5;${FW27 ? `
          // FW27: shorter ropes of relief (long unbroken ones drew the sheen into cellophane streaks), broken along the fall
          fwRope *= 0.6;
          fwBand += (fwN4 - 0.5) * 0.45 * fwU;` : ''}
          normal = normalize(normal + fwUp * fwBand + fwAc * fwRope);
        }`)
      .replace('#include <opaque_fragment>', `
        {
          // straight alpha whose colour carries the reflection divided by the body opacity: after blending the sky and
          // sun reflection keep their full Fresnel strength while clear water lets the scene through
          float fwBody = mix(fwA.w, ${FW27 ? '0.42 + 0.42 * fwN2' : '0.9'}, fwAer);   // FW27: translucent, uneven ropes
          vec3 fwToFrag = normalize(vFwW - cameraPosition);
          float fwFwd = pow(max(dot(fwToFrag, fwSunD), 0.0), 5.0) * (1.0 - fwNight);   // looking into the sun through it
          vec3 fwTr = fwSunC * fwFwd * (0.2 + 0.8 * fwAer) * 0.5;
          float fwOut = fwCov * fwBody;
          if (fwOut < 0.003) discard;
          gl_FragColor = vec4(totalDiffuse + totalEmissiveRadiance + fwTr + totalSpecular / max(fwBody, 0.05), fwOut);
        }`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key ? key() : '') + '|fw26veil' + (FW27 ? '|fw27' : '');
  mat.needsUpdate = true;
  mat.name = 'fw26:veil';
  return mat;
}

const VS = /* glsl */ `
  attribute vec4 aSeed;        // x angle, y speed jitter, z life jitter, w phase
  attribute float aKind;       // 0 sheet breakup, 1 pool splash, 2 jet column, 3 bowl splash, 4 mist (FW27)
  uniform float uT, uLipR, uLipY, uWl, uImpR, uJetY, uJetH, uBowlY, uBowlR, uPx;
  uniform vec2 uRes; uniform vec3 uSunD;
  varying float vA; varying vec2 vQ; varying float vFwd; varying float vW; varying float vK;
  const float G = 9.81;
  float h1(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
  void main() {
    float ang = aSeed.x * 6.2831853;
    vec2 dir = vec2(cos(ang), sin(ang));
    vec3 p0, v0; float life;
    if (aKind < 0.5) {                       // off the lip: radial throw, then gravity down to the pool
      float vr = 0.35 + 0.35 * aSeed.y;
      v0 = vec3(dir.x * vr, 0.05 + 0.1 * aSeed.z, dir.y * vr);
      p0 = vec3(dir.x * (uLipR + 0.02), uLipY, dir.y * (uLipR + 0.02));
      float drop = uLipY - uWl;
      life = (v0.y + sqrt(v0.y * v0.y + 2.0 * G * drop)) / G;
    } else if (aKind < 1.5) {                // the splash where the veil lands
      float rr = uImpR + (aSeed.y - 0.5) * 0.28;
      p0 = vec3(dir.x * rr, uWl + 0.005, dir.y * rr);
      float up = 0.55 + 1.35 * aSeed.z * aSeed.z;
      float lat = (h1(aSeed.w * 13.1) - 0.35) * 0.9;
      v0 = vec3(dir.x * lat, up, dir.y * lat);
      life = 2.0 * up / G;
    } else if (aKind < 2.5) {                // the jet: a column that fans out and falls back into the bowl
      float vy = sqrt(2.0 * G * uJetH) * (0.9 + 0.12 * aSeed.y);
      float spread = 0.08 + 0.45 * aSeed.z * aSeed.z;
      p0 = vec3(dir.x * 0.03, uJetY, dir.y * 0.03);
      v0 = vec3(dir.x * spread, vy, dir.y * spread);
      life = (v0.y + sqrt(v0.y * v0.y + 2.0 * G * max(uJetY - uBowlY, 0.0))) / G;
    } else if (aKind < 3.5) {                // splash crowns in the bowl where the jet lands
      float rr = 0.25 + (uBowlR - 0.35) * aSeed.y;
      p0 = vec3(dir.x * rr, uBowlY + 0.005, dir.y * rr);
      float up = 0.35 + 0.9 * aSeed.z * aSeed.z;
      v0 = vec3(dir.x * 0.15, up, dir.y * 0.15);
      life = 2.0 * up / G;
    } else {                                 // FW27 mist: fine spray lifted off the landing ring, drifting up and out
      float rr = uImpR + (aSeed.y - 0.35) * 0.8;
      p0 = vec3(dir.x * rr, uWl + 0.04, dir.y * rr);
      float out1 = 0.1 + 0.2 * aSeed.z;
      v0 = vec3(dir.x * out1, 0.22 + 0.3 * aSeed.z, dir.y * out1);
      life = 1.4 + 1.4 * aSeed.z;
    }
    life *= 0.92 + 0.16 * aSeed.z;
    float t = fract(uT / life + aSeed.w) * life;
    vec3 p = p0 + v0 * t + vec3(0.0, -0.5 * G * t * t, 0.0);
    vec3 v = v0 + vec3(0.0, -G * t, 0.0);
    if (aKind > 3.5) { p = p0 + v0 * t; v = v0; }        // mist rides the air, not a ballistic arc
    float u = t / life;
    float fade = smoothstep(0.0, 0.06, u) * smoothstep(1.0, 0.9, u);
    if (aKind > 3.5) fade = smoothstep(0.0, 0.25, u) * smoothstep(1.0, 0.45, u);
    if (aKind < 0.5) fade *= smoothstep(0.18, 0.42, u);   // the sheet is still intact near the lip
    // streak = the drop's travel over one 1/30 s exposure, drawn in screen space
    vec4 c0 = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    vec4 c1 = projectionMatrix * modelViewMatrix * vec4(p - v * (1.0 / 30.0), 1.0);
    vec2 s0 = c0.xy / c0.w, s1 = c1.xy / c1.w;
    vec2 sd = (s0 - s1) * uRes * 0.5;
    float len = length(sd);
    vec2 ax = len > 1e-3 ? sd / len : vec2(0.0, 1.0);
    vec2 px = vec2(-ax.y, ax.x);
    float sizeM = aKind > 3.5 ? 0.16 + 0.22 * aSeed.y : aKind > 1.5 ? 0.012 : 0.009;   // drop (puff) diameter, metres
    float wPx = sizeM * uRes.y / max(c0.w, 1e-3) * projectionMatrix[1][1] * 0.5;
    float wDraw = max(wPx, uPx);
    vA = fade * clamp(wPx / wDraw, 0.08, 1.0) * (aKind > 3.5 ? 0.07 : aKind > 0.5 && aKind < 1.5 ? 0.75 : 0.9);
    vW = wDraw; vK = aKind;
    // corners: position.x in {-1, 1} across the streak, position.y in {0, 1} from the tail to the head
    vec2 off = px * position.x * wDraw * 0.5 + ax * (position.y - 0.5) * max(len, wDraw);
    vec2 mid = (s0 + s1) * 0.5;
    vec2 ndc = mid + off / (uRes * 0.5);
    gl_Position = vec4(ndc * c0.w, c0.z, c0.w);
    vQ = vec2(position.x, position.y * 2.0 - 1.0);
    // forward scattering towards the camera: a backlit drop glows
    vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
    vec3 toCam = normalize(cameraPosition - wp);
    vFwd = dot(-toCam, uSunD);   // 1 when the camera looks towards the sun through the drop
  }`;

const FS = /* glsl */ `
  uniform vec3 uSunD; uniform vec3 uSunC; uniform vec3 uSky; uniform float uNight;
  varying float vA; varying vec2 vQ; varying float vFwd; varying float vW; varying float vK;
  void main() {
    float across = 1.0 - vQ.x * vQ.x;
    float along = 1.0 - pow(abs(vQ.y), 3.0);
    float a = vK > 3.5 ? vA * exp(-3.0 * dot(vQ, vQ)) : vA * across * along;
    if (a < 0.004) discard;
    vec3 col = uSky * 0.9 + uSunC * (0.35 + 2.4 * pow(max(vFwd, 0.0), 6.0)) * (1.0 - uNight);
    gl_FragColor = vec4(col * 1.6, a);
    #include <colorspace_fragment>
  }`;

// one spray mesh per fountain; positions are LOCAL to the fountain group
export function fountainSpray(o) {
  // FW27: denser landing splash and jet, and the mist puffs
  const counts = FW27 ? [o.sheet ?? 1700, o.splash ?? 1500, o.jet ?? 800, o.bowl ?? 400, o.mist ?? 260] : [o.sheet ?? 1400, o.splash ?? 900, o.jet ?? 520, o.bowl ?? 320];
  const n = counts.reduce((a, b) => a + b, 0);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seed = new Float32Array(n * 4), kind = new Float32Array(n);
  let s = 1234567 + (o.seed || 0);
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let k = 0;
  counts.forEach((c, ki) => { for (let i = 0; i < c; i++, k++) { seed.set([rnd(), rnd(), rnd(), rnd()], k * 4); kind[k] = ki; } });
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 1));
  g.instanceCount = n;
  const res = new THREE.Vector2(1600, 900);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uT: ENV.time, uLipR: { value: o.lipR }, uLipY: { value: o.lipY }, uWl: { value: o.wl }, uImpR: { value: o.impR },
      uJetY: { value: o.jetY }, uJetH: { value: o.jetH }, uBowlY: { value: o.bowlY }, uBowlR: { value: o.bowlR },
      uPx: { value: 1.0 }, uRes: { value: res },
      uSunD: ENV.sunDir, uSunC: ENV.sunColor, uSky: ENV.skyAmbient, uNight: ENV.night,
    },
    vertexShader: VS, fragmentShader: FS,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 3;
  m.name = 'fountainSpray';
  m.onBeforeRender = (renderer) => { renderer.getDrawingBufferSize(res); };
  return m;
}

// travelling ring waves on a pool: `mat` is the pool's MeshPhysicalMaterial (campus.js FW.water); rings radiate from the
// circle of radius `impR` about the fountain centre (and, with `jetR`, from the jet's landing zone)
export function poolRings(mat, rings) {
  if (!FW25 || !mat) return mat;
  const prev = mat.onBeforeCompile;
  const uC = { value: new THREE.Vector2() }, uR = { value: new THREE.Vector3(rings.impR, rings.amp ?? 0.16, rings.k ?? 17) };
  // FW26 foam: x strength, y how far inside the landing circle the churn starts (m), z outward decay (1/m)
  const uF = { value: new THREE.Vector3(FW26 ? rings.foam ?? 0 : 0, rings.foamIn ?? 0.5, rings.foamOut ?? 1.4) };
  mat.userData.fwRings = { c: uC };
  // FW27 basin behind the surface: x inner radius, y depth, z pedestal-foot radius (0 none), w veil radius (0 none);
  // B2: x veil top above the water, y coping height above the water, z floor albedo, w chop gain round the landing ring
  const b = rings.basin || {};
  const uB = { value: new THREE.Vector4(b.R ?? 5, b.depth ?? 0.3, b.ped ?? 0, b.veilR ?? 0) };
  const uB2 = { value: new THREE.Vector4(b.veilH ?? 0, b.copeH ?? 0.2, b.floor ?? 0.22, b.chop ?? 1) };
  const uEnv = { value: null }, uEnvOn = { value: 0 };
  if (FW27) {
    mat.userData.fw27 = { env: uEnv, on: uEnvOn };
    // the tiled map is only the long swell now; clean water's own Fresnel (the 0.72 trim fought the old IBL sheet)
    mat.normalScale.multiplyScalar(0.4);
    mat.ior = 1.333; mat.specularIntensity = 1.0;
  }
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.fwRC = uC; sh.uniforms.fwRR = uR; sh.uniforms.fwRT = ENV.time; sh.uniforms.fwRF = uF;
    if (FW27) Object.assign(sh.uniforms, { fwB: uB, fwB2: uB2, fwEnv: uEnv, fwEnvOn: uEnvOn, fwSky: ENV.skyAmbient, fwNight: ENV.night });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFwW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFwW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec2 fwRC; uniform vec3 fwRR; uniform float fwRT; uniform vec3 fwRF; varying vec3 vFwW;${NOISE_GLSL}`
        + (FW27 ? '\nuniform vec4 fwB; uniform vec4 fwB2; uniform samplerCube fwEnv; uniform float fwEnvOn; uniform vec3 fwSky; uniform float fwNight;' : ''))
      .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>' + (FW27 ? POOL27_GLSL : ''))
      // white water where the veil lands: churned from just inside the landing circle, carried outward and thinning,
      // a coarse froth of bubble cells over a finer one
      .replace('#include <color_fragment>', `#include <color_fragment>
        float fwFoam = 0.0;
        if (fwRF.x > 0.0) {
          vec2 fd = vFwW.xz - fwRC; float fr = length(fd); vec2 fdir = fr > 1e-4 ? fd / fr : vec2(0.0);
          float fx = fr - fwRR.x;${FW27 ? `
          fx -= (fwN3(vec3(fd * 1.9, fwRT * 0.45)) - 0.5) * 0.55 + (fwN3(vec3(fd * 6.0, fwRT * 1.1)) - 0.5) * 0.18;   // FW27: a ragged edge` : ''}
          float band = smoothstep(-fwRF.y, -0.04, fx) * exp(-max(fx, 0.0) * fwRF.z);
          vec2 fa = fd - fdir * fwRT * 0.32;
          float fn = fwFbm(vec3(fa * 3.3, fwRT * 0.55));
          float fc = fwN3(vec3(fa * 12.0, fwRT * 1.7));
          fwFoam = fwRF.x * band * smoothstep(0.62 - 0.42 * band, 0.86 - 0.2 * band, fn * 0.72 + fc * 0.38);${FW27 ? `
          // FW27: the plunge line itself is solid white churn, torn at its edges
          float cz = (fx + 0.02) / 0.24; float core = exp(-cz * cz);
          float clot = fwFbm(vec3(fa * 6.5, fwRT * 1.3)) * 0.75 + fwN3(vec3(fa * 21.0, fwRT * 2.6)) * 0.35;
          fwFoam = max(fwFoam, fwRF.x * smoothstep(0.52, 0.78, core * (0.35 + clot)));` : ''}
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${FW27 ? '0.86, 0.89, 0.9) * (0.62 + 0.3 * fn + 0.2 * fc' : '0.78, 0.83, 0.84'}), fwFoam);
        }${FW27 ? `
        // FW27 ripple slope (xy) and its unresolved variance (z), choppier round the landing ring, in wind patches
        float fwFp = max(length(dFdx(vFwW.xz)), length(dFdy(vFwW.xz)));
        vec3 fwCp;
        {
          vec2 cp = vFwW.xz - fwRC; float cr = length(cp);
          float chop = 1.0 + 1.8 * exp(-abs(cr - fwRR.x) * 1.6) * fwB2.w;
          float patchA = 0.55 + 0.9 * fwN3(vec3(cp * 0.6, fwRT * 0.12));
          fwCp = fwCap(cp, fwRT, fwFp, 0.03 * chop * patchA);
        }` : ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>${FW27 ? `
        roughnessFactor = clamp(pow(6e-6 + 2.0 * fwCp.z, 0.25), 0.05, 0.5);` : ''}
        roughnessFactor = mix(roughnessFactor, 0.55, fwFoam);`)
      // anchored on the chunk AFTER the normal maps: FW.water's ripple scroll expands normal_fragment_maps inline, so its
      // include token is gone by the time this runs (the FW25 rings never drew)
      .replace('#include <clearcoat_normal_fragment_begin>', `
        {
          vec2 d = vFwW.xz - fwRC; float rr = length(d);
          vec2 dirR = rr > 1e-4 ? d / rr : vec2(0.0);
          float x = rr - fwRR.x;
          ${FW27 ? `// FW27: the rings break into arcs (phase and strength wander round the circle), not a turned lattice
          float jit = fwN3(vec3(d * 1.7 + 11.0, fwRT * 0.3)) * 6.0;
          float str = 0.35 + 1.1 * fwN3(vec3(d * 2.3, fwRT * 0.7));
          float s1 = cos(fwRR.z * x - fwRT * 7.5 + jit) * exp(-abs(x) * 1.7) * str;
          float s2 = cos(fwRR.z * 1.7 * x + fwRT * 6.1 + 1.3 - jit * 0.6) * exp(-abs(x) * 3.0) * 0.6 * str;
          float jet = cos(22.0 * rr - fwRT * 9.0 + jit) * exp(-rr * 1.6) * 0.5;` : `// two trains, outward from the landing circle and inward from it, dispersed (shorter waves travel slower)
          float s1 = cos(fwRR.z * x - fwRT * 7.5) * exp(-abs(x) * 2.0);
          float s2 = cos(fwRR.z * 1.7 * x + fwRT * 6.1 + 1.3) * exp(-abs(x) * 3.5) * 0.6;
          float jet = cos(22.0 * rr - fwRT * 9.0) * exp(-rr * 1.6) * 0.5;`}
          float slope = (s1 + s2 + jet) * fwRR.y * (1.0 - 0.75 * fwFoam);   // froth is rough, not a clean ring train
          vec3 pw = vec3(-dirR.x * slope, 0.0, -dirR.y * slope);${FW27 ? `
          pw += vec3(-fwCp.x, 0.0, -fwCp.y) * (1.0 - 0.6 * fwFoam);` : ''}
          normal = normalize(normal + (viewMatrix * vec4(pw, 0.0)).xyz);
        }
        #include <clearcoat_normal_fragment_begin>`);
    // FW27: the water's own radiance, a mirror over a clear basin; the foam keeps three's lit diffuse
    if (FW27) sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
        {
          vec3 wV = normalize(cameraPosition - vFwW);
          vec3 wN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          wN = normalize(vec3(wN.x, max(wN.y, 0.3), wN.z));
          float fr = 0.0204 + 0.9796 * pow(1.0 - clamp(dot(wN, wV), 0.0, 1.0), 5.0);
          // the light that reaches a unit albedo here, shadow and sky occlusion included: three already summed it
          vec3 dif = max(material.diffuseContribution, vec3(1e-4));
          vec3 eD = reflectedLight.directDiffuse / dif, eA = reflectedLight.indirectDiffuse / dif;
          float trim = mix(0.30, 0.88, fwNight);                 // the campus light trim every lit surface carries
          vec2 o = vFwW.xz - fwRC;
          // reflection: the campus (probe) or the sky, then the fountain's own veil and the coping's inner face
          vec3 wR = reflect(-wV, wN); wR.y = max(wR.y, 0.02); wR = normalize(wR);
          vec3 refl = fwSkyL(wR, 1.0 + 40.0 * fwCp.z);
          {
            vec2 d = wR.xz; float a = max(dot(d, d), 1e-6), bb = dot(o, d), c0 = dot(o, o);
            bool hit = false;
            if (fwB.w > 0.0) {
              float c = c0 - fwB.w * fwB.w, q = bb * bb - a * c;
              if (c > 0.0 && bb < 0.0 && q > 0.0) {
                float s = (-bb - sqrt(q)) / a, hy = s * wR.y;
                if (hy < fwB2.x) {
                  vec2 hp = o + d * s;
                  // ropes ~0.18 m apart round the ring, riding down it with the fall
                  float st = fwN3(vec3(hp * 5.5, hy * 0.9 + fwRT * 1.9)) * 0.7 + fwN3(vec3(hp * 17.0 + 4.0, hy * 2.5 + fwRT * 3.1)) * 0.45;
                  float rope = smoothstep(0.38, 0.6, st) * mix(1.0, 0.3, smoothstep(0.8, 1.6, hy));
                  vec3 white = (eD * 0.4 + eA * 1.15) * trim * 0.8, dark = (eD * 0.15 + eA * 0.6) * trim * 0.14;
                  refl = mix(dark, white, rope);
                  hit = true;
                }
              }
            }
            if (!hit) {
              float q = bb * bb - a * (c0 - fwB.x * fwB.x);
              if (q > 0.0 && (-bb + sqrt(q)) / a * wR.y < fwB2.y) refl = (eD * 0.3 + eA * 0.6) * trim * vec3(0.26, 0.245, 0.225);
            }
          }
          // transmission into the basin: floor, outer wall or pedestal foot, whichever the refracted ray meets first
          vec3 wT = refract(-wV, wN, 0.7502);
          float dy = max(-wT.y, 0.05);
          vec2 d = wT.xz; float a = dot(d, d);
          float sH = fwB.y / dy, what = 0.0;
          if (a > 1e-6) {
            float bb = dot(o, d), c0 = dot(o, o);
            float q = bb * bb - a * (c0 - fwB.x * fwB.x);
            if (q > 0.0) { float s = (-bb + sqrt(q)) / a; if (s < sH) { sH = max(s, 0.0); what = 1.0; } }
            float c = c0 - fwB.z * fwB.z, q2 = bb * bb - a * c;
            if (fwB.z > 0.0 && c > 0.0 && bb < 0.0 && q2 > 0.0) { float s = (-bb - sqrt(q2)) / a; if (s < sH) { sH = s; what = 2.0; } }
          }
          vec2 hp = o + d * sH;
          vec3 sig = vec3(2.2, 1.05, 0.95);                      // extinction per metre: faintly green, fine silt
          vec3 sunIn = exp(-sig * fwB.y * 1.6);                  // sunlight down through the water to the floor
          float caus = mix(0.22, fwCaus(hp, fwRT), 1.0 - smoothstep(0.015, 0.06, fwFp));
          float mott = 0.75 + 0.5 * fwN3(vec3(hp * 4.0, 1.7));
          float rimAO = mix(0.55, 1.0, smoothstep(0.0, 0.7, fwB.x - length(hp))) * mix(1.0, mix(0.6, 1.0, smoothstep(0.0, 0.5, length(hp) - fwB.z)), step(0.001, fwB.z));
          vec3 lit = what < 0.5 ? (eD * sunIn * (0.25 + 1.5 * caus) + eA * 0.85) * rimAO
                                : eD * sunIn * 0.3 * (0.4 + caus) + eA * 0.5;
          vec3 T = exp(-sig * sH);
          vec3 scat = (eD * 0.35 + eA) * trim * vec3(0.035, 0.07, 0.068);   // the lit water column itself
          vec3 trans = lit * fwB2.z * mott * vec3(1.0, 0.96, 0.9) * trim * T + scat * (1.0 - T);
          // the sun's glint: three's own GGX on the rippled normal (shadowed), clamped so a sub-pixel facet cannot flash
          vec3 gl = reflectedLight.directSpecular;
          gl *= min(1.0, 60.0 / max(dot(gl, vec3(0.2126, 0.7152, 0.0722)), 1e-4));
          vec3 water = refl * fr + trans * (1.0 - fr) + gl;
          outgoingLight = mix(water, outgoingLight, clamp(fwFoam, 0.0, 1.0));
        }
        #include <opaque_fragment>`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key ? key() : '') + '|fw25rings' + (FW26 ? '|fw26foam' : '') + (FW27 ? '|fw27pool' : '');
  mat.needsUpdate = true;
  return (cx, cz) => uC.value.set(cx, cz);
}
