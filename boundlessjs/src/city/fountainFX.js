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

const NOISE_GLSL = /* glsl */ `
  float fwH3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float fwN3(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(fwH3(i), fwH3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(fwH3(i + vec3(0.0, 1.0, 0.0)), fwH3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
               mix(mix(fwH3(i + vec3(0.0, 0.0, 1.0)), fwH3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(fwH3(i + vec3(0.0, 1.0, 1.0)), fwH3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
  }
  float fwFbm(vec3 p) { return 0.55 * fwN3(p) + 0.3 * fwN3(p * 2.03 + 7.1) + 0.15 * fwN3(p * 4.1 + 3.3); }`;

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
        float fwN2 = fwN3(vec3(vFwL.xz * fwF * 3.1, fwAl * 16.0));
        float fwThr = fwA.z * smoothstep(0.22, 1.0, fwU);                  // tears open as the sheet accelerates
        float fwCov = smoothstep(fwThr - 0.07, fwThr + 0.05, fwN);
        float fwEdge = (1.0 - smoothstep(0.0, 0.14, fwN - fwThr)) * step(0.015, fwThr);   // torn edges foam
        float fwAer = clamp(smoothstep(fwA.x, fwA.y, fwU) * (0.5 + 0.65 * fwN2) + fwEdge * 0.65, 0.0, 1.0);
        diffuseColor.rgb = mix(vec3(0.012, 0.024, 0.026), vec3(0.8, 0.85, 0.86), fwAer);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.035, 0.5, fwAer);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // capillary bands across the smooth sheet near the source, rope relief across the flow further down
          vec3 fwUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          vec3 fwAc = cross(fwUp, normal); float fwAcL = length(fwAc); fwAc = fwAcL > 1e-4 ? fwAc / fwAcL : vec3(0.0);
          float fwBand = sin(fwAl * 47.0 + fwN * 6.0) * (1.0 - fwU) * 0.3;
          float fwRope = (fwN2 - 0.5) * (0.25 + 0.55 * fwU) + (fwN - 0.5) * 0.5;
          normal = normalize(normal + fwUp * fwBand + fwAc * fwRope);
        }`)
      .replace('#include <opaque_fragment>', `
        {
          // straight alpha whose colour carries the reflection divided by the body opacity: after blending the sky and
          // sun reflection keep their full Fresnel strength while clear water lets the scene through
          float fwBody = mix(fwA.w, 0.9, fwAer);
          vec3 fwToFrag = normalize(vFwW - cameraPosition);
          float fwFwd = pow(max(dot(fwToFrag, fwSunD), 0.0), 5.0) * (1.0 - fwNight);   // looking into the sun through it
          vec3 fwTr = fwSunC * fwFwd * (0.2 + 0.8 * fwAer) * 0.5;
          float fwOut = fwCov * fwBody;
          if (fwOut < 0.003) discard;
          gl_FragColor = vec4(totalDiffuse + totalEmissiveRadiance + fwTr + totalSpecular / max(fwBody, 0.05), fwOut);
        }`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key ? key() : '') + '|fw26veil';
  mat.needsUpdate = true;
  mat.name = 'fw26:veil';
  return mat;
}

const VS = /* glsl */ `
  attribute vec4 aSeed;        // x angle, y speed jitter, z life jitter, w phase
  attribute float aKind;       // 0 sheet breakup, 1 pool splash, 2 jet column, 3 bowl splash
  uniform float uT, uLipR, uLipY, uWl, uImpR, uJetY, uJetH, uBowlY, uBowlR, uPx;
  uniform vec2 uRes; uniform vec3 uSunD;
  varying float vA; varying vec2 vQ; varying float vFwd; varying float vW;
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
    } else {                                 // splash crowns in the bowl where the jet lands
      float rr = 0.25 + (uBowlR - 0.35) * aSeed.y;
      p0 = vec3(dir.x * rr, uBowlY + 0.005, dir.y * rr);
      float up = 0.35 + 0.9 * aSeed.z * aSeed.z;
      v0 = vec3(dir.x * 0.15, up, dir.y * 0.15);
      life = 2.0 * up / G;
    }
    life *= 0.92 + 0.16 * aSeed.z;
    float t = fract(uT / life + aSeed.w) * life;
    vec3 p = p0 + v0 * t + vec3(0.0, -0.5 * G * t * t, 0.0);
    vec3 v = v0 + vec3(0.0, -G * t, 0.0);
    float u = t / life;
    float fade = smoothstep(0.0, 0.06, u) * smoothstep(1.0, 0.9, u);
    if (aKind < 0.5) fade *= smoothstep(0.18, 0.42, u);   // the sheet is still intact near the lip
    // streak = the drop's travel over one 1/30 s exposure, drawn in screen space
    vec4 c0 = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    vec4 c1 = projectionMatrix * modelViewMatrix * vec4(p - v * (1.0 / 30.0), 1.0);
    vec2 s0 = c0.xy / c0.w, s1 = c1.xy / c1.w;
    vec2 sd = (s0 - s1) * uRes * 0.5;
    float len = length(sd);
    vec2 ax = len > 1e-3 ? sd / len : vec2(0.0, 1.0);
    vec2 px = vec2(-ax.y, ax.x);
    float sizeM = aKind > 1.5 ? 0.012 : 0.009;                       // drop diameter, metres
    float wPx = sizeM * uRes.y / max(c0.w, 1e-3) * projectionMatrix[1][1] * 0.5;
    float wDraw = max(wPx, uPx);
    vA = fade * clamp(wPx / wDraw, 0.08, 1.0) * (aKind > 0.5 && aKind < 1.5 ? 0.75 : 0.9);
    vW = wDraw;
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
  varying float vA; varying vec2 vQ; varying float vFwd; varying float vW;
  void main() {
    float across = 1.0 - vQ.x * vQ.x;
    float along = 1.0 - pow(abs(vQ.y), 3.0);
    float a = vA * across * along;
    if (a < 0.004) discard;
    vec3 col = uSky * 0.9 + uSunC * (0.35 + 2.4 * pow(max(vFwd, 0.0), 6.0)) * (1.0 - uNight);
    gl_FragColor = vec4(col * 1.6, a);
    #include <colorspace_fragment>
  }`;

// one spray mesh per fountain; positions are LOCAL to the fountain group
export function fountainSpray(o) {
  const counts = [o.sheet ?? 1400, o.splash ?? 900, o.jet ?? 520, o.bowl ?? 320];
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
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.fwRC = uC; sh.uniforms.fwRR = uR; sh.uniforms.fwRT = ENV.time; sh.uniforms.fwRF = uF;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFwW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFwW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec2 fwRC; uniform vec3 fwRR; uniform float fwRT; uniform vec3 fwRF; varying vec3 vFwW;${NOISE_GLSL}`)
      // white water where the veil lands: churned from just inside the landing circle, carried outward and thinning,
      // a coarse froth of bubble cells over a finer one
      .replace('#include <color_fragment>', `#include <color_fragment>
        float fwFoam = 0.0;
        if (fwRF.x > 0.0) {
          vec2 fd = vFwW.xz - fwRC; float fr = length(fd); vec2 fdir = fr > 1e-4 ? fd / fr : vec2(0.0);
          float fx = fr - fwRR.x;
          float band = smoothstep(-fwRF.y, -0.04, fx) * exp(-max(fx, 0.0) * fwRF.z);
          vec2 fa = fd - fdir * fwRT * 0.32;
          float fn = fwFbm(vec3(fa * 3.3, fwRT * 0.55));
          float fc = fwN3(vec3(fa * 12.0, fwRT * 1.7));
          fwFoam = fwRF.x * band * smoothstep(0.62 - 0.42 * band, 0.86 - 0.2 * band, fn * 0.72 + fc * 0.38);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.83, 0.84), fwFoam);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.55, fwFoam);`)
      // anchored on the chunk AFTER the normal maps: FW.water's ripple scroll expands normal_fragment_maps inline, so its
      // include token is gone by the time this runs (the FW25 rings never drew)
      .replace('#include <clearcoat_normal_fragment_begin>', `
        {
          vec2 d = vFwW.xz - fwRC; float rr = length(d);
          vec2 dirR = rr > 1e-4 ? d / rr : vec2(0.0);
          float x = rr - fwRR.x;
          // two trains, outward from the landing circle and inward from it, dispersed (shorter waves travel slower)
          float s1 = cos(fwRR.z * x - fwRT * 7.5) * exp(-abs(x) * 2.0);
          float s2 = cos(fwRR.z * 1.7 * x + fwRT * 6.1 + 1.3) * exp(-abs(x) * 3.5) * 0.6;
          float jet = cos(22.0 * rr - fwRT * 9.0) * exp(-rr * 1.6) * 0.5;
          float slope = (s1 + s2 + jet) * fwRR.y * (1.0 - 0.75 * fwFoam);   // froth is rough, not a clean ring train
          vec3 pw = vec3(-dirR.x * slope, 0.0, -dirR.y * slope);
          normal = normalize(normal + (viewMatrix * vec4(pw, 0.0)).xyz);
        }
        #include <clearcoat_normal_fragment_begin>`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key ? key() : '') + '|fw25rings' + (FW26 ? '|fw26foam' : '');
  mat.needsUpdate = true;
  return (cx, cz) => uC.value.set(cx, cz);
}
