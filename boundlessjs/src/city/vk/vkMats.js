// AR33 VIADUCT materials (vk/): painted riveted steel, weathered in the shader from the geometry's metre uvs and the
// rivet rows each face carries (vk/vkKit.js: uv, aRv, aJ):
//   * rivet heads (button heads, 7/8 in rivets: 36 mm across) lit as domes by a normal perturbation, a dark crevice ring
//     and a rust halo round each; faded out once a head is under ~2 px (no shimmer at distance);
//   * bevelled arrises (6 mm) on every face edge;
//   * the paint: a patchy repaint (large blotches of slightly different green), fine mottling;
//   * rust: chipped arrises, joints (near member ends), vertical run streaks on upright faces, pooled rust on up-facing
//     flanges, halos round rivets; soot on the undersides; the splash zone over the street darker and dirtier.
// Stone, concrete, timber, ballast and rail steel come from mat/pbrLib.js (the MATS worker's library) when it loads, else
// from lit-trimmed standard materials (world/materials.js applyLightTrim; applyStoneDetail for granite).
import * as THREE from 'three';
import { ENV, applyLightTrim, applyStoneDetail, ST34 } from '../../world/materials.js';

let PBR = null;
// the library is optional: a missing or broken mat/pbrLib.js leaves the fallbacks in place (no static import, so a
// syntax error there never takes this part down)
const PBR_PATH = '../mat/pbrLib.js';
// (globalThis.__VK_NOPBR: the offline bench skips the library to keep its memory small)
export const vkMatsReady = (globalThis.__VK_NOPBR ? Promise.resolve() : import('../mat/pbrLib.js').then((m) => { if (m && m.pbrMaterial) PBR = m; })).catch(() => {});

const hex3 = (h) => { const c = new THREE.Color(h); return new THREE.Vector3(c.r, c.g, c.b); };   // linear

const STEEL_VS_PARS = /* glsl */`
attribute vec4 aRv; attribute vec2 aJ;
varying vec4 vRv; varying vec2 vJ; varying vec2 vUvM; varying vec3 vWp; varying vec3 vWn;`;
const STEEL_VS = /* glsl */`
vUvM = uv; vRv = aRv; vJ = aJ;
{ vec4 wq = vec4(transformed, 1.0);
  vec3 wn = objectNormal;
  #ifdef USE_INSTANCING
    wq = instanceMatrix * wq; wn = mat3(instanceMatrix) * wn;
  #endif
  vWp = (modelMatrix * wq).xyz; vWn = normalize(mat3(modelMatrix) * wn); }`;
const STEEL_FS_PARS = /* glsl */`
varying vec4 vRv; varying vec2 vJ; varying vec2 vUvM; varying vec3 vWp; varying vec3 vWn;
uniform vec3 vkPaint; uniform vec3 vkPaint2; uniform vec3 vkRustC; uniform vec3 vkRustD; uniform float vkRustAmt;
uniform float vkGround; uniform float vkSeed; uniform float vkRivOn; uniform vec4 vkBand; uniform float vkGuanoAmt; uniform float vkChalk; uniform float vkCorr;
uniform float vkSpecK; uniform float vkAmbK; uniform float vkDirK; uniform float vkDnK; uniform float vkGrime;
float vkH3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vkN3(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(vkH3(i), vkH3(i + vec3(1, 0, 0)), f.x), mix(vkH3(i + vec3(0, 1, 0)), vkH3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(vkH3(i + vec3(0, 0, 1)), vkH3(i + vec3(1, 0, 1)), f.x), mix(vkH3(i + vec3(0, 1, 1)), vkH3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// the nearest rivet on this face: (du, dv) metres from its centre; z = 1 when the face has rivets
vec3 vkRivet(vec2 uv, vec4 rv, float L) {
  float W = rv.x, e = rv.y, c = rv.z, p = rv.w;
  if (abs(p) < 1e-4) return vec3(1e3, 1e3, 0.0);
  float ua;
  if (p > 0.0) ua = (floor(uv.x / p) + 0.5) * p;
  else ua = (uv.x < 0.5 * L) ? -p : L + p;
  float va;
  if (c < 0.0) {
    float g = -c, nMax = max(floor((W - 2.0 * e) / g + 1e-3), 0.0);
    va = e + clamp(floor((uv.y - e) / g + 0.5), 0.0, nMax) * g;
  } else {
    va = 0.5 * W;
    float best = 1e3;
    if (e > 0.0) { float a = e, b = W - e; va = abs(uv.y - a) < abs(uv.y - b) ? a : b; best = abs(uv.y - va); }
    if (c > 0.0) { float a = 0.5 * W - c, b = 0.5 * W + c; float vb = abs(uv.y - a) < abs(uv.y - b) ? a : b; if (abs(uv.y - vb) < best) va = vb; }
  }
  return vec3(uv.x - ua, uv.y - va, 1.0);
}
mat3 vkTBN(vec3 eye_pos, vec3 N, vec2 uv) {
  vec3 q0 = dFdx(eye_pos), q1 = dFdy(eye_pos); vec2 st0 = dFdx(uv), st1 = dFdy(uv);
  vec3 q1perp = cross(q1, N), q0perp = cross(N, q0);
  vec3 T = q1perp * st0.x + q0perp * st1.x, B = q1perp * st0.y + q0perp * st1.y;
  float det = max(dot(T, T), dot(B, B)), sc = det == 0.0 ? 0.0 : inversesqrt(det);
  return mat3(T * sc, B * sc, N);
}`;
// masks computed once (at map_fragment) and read by the roughness, metalness and normal injections
const STEEL_FS_COLOR = /* glsl */`
vec3 vkRv3 = vkRivet(vUvM, vRv, vJ.x);
const float vkRr = 0.018;
vec2 vkFw = fwidth(vUvM);
float vkPix = max(max(vkFw.x, vkFw.y), 1e-5);
float vkAA = (1.0 - smoothstep(0.25, 0.7, vkPix / vkRr)) * vkRv3.z * vkRivOn;
vec2 vkBd = vWp.xz - vkBand.yz;
vkAA *= 1.0 - step(vWp.y, vkBand.x) * step(dot(vkBd, vkBd), vkBand.w);   // instanced heads there (vk/vkKit.js rivZone)
float vkD = length(vkRv3.xy) / vkRr;
float vkIn = (1.0 - smoothstep(0.86, 1.0, vkD)) * vkAA;
float vkRing = smoothstep(0.75, 1.0, vkD) * (1.0 - smoothstep(1.0, 1.9, vkD)) * vkAA;
float vkHalo = (1.0 - smoothstep(1.0, 3.2, vkD)) * vkRv3.z * (1.0 - smoothstep(0.6, 1.4, vkPix / vkRr));
vec3 vkN = normalize(vWn);
float vkUp = vkN.y;
vec3 vkP = vWp + vec3(vkSeed * 17.3, 0.0, vkSeed * 5.1) + vec3(vJ.y * 0.37);
float vkBlot = vkN3(vkP * 0.33);
float vkBlot2 = vkN3(vkP * 0.9 + 7.0);
float vkFine = vkN3(vkP * 4.3);
float vkMic = vkN3(vkP * 21.0);
float vkStreak = vkN3(vec3(vkP.x * 7.0, vkP.y * 0.28, vkP.z * 7.0));
float vkStreak2 = vkN3(vec3(vkP.x * 23.0, vkP.y * 0.9, vkP.z * 23.0));
float vkVert = 1.0 - smoothstep(0.3, 0.7, abs(vkUp));
float vkEdgeV = min(vUvM.y, vRv.x - vUvM.y), vkEdgeU = min(vUvM.x, vJ.x - vUvM.x);
float vkEdge = min(vkEdgeV, vkEdgeU);
float vkChip = (1.0 - smoothstep(0.0, 0.016, vkEdge)) * smoothstep(0.5, 0.78, vkFine * 0.6 + vkMic * 0.4);
float vkJoint = (1.0 - smoothstep(0.03, 0.4, vkEdgeU)) * smoothstep(0.5, 0.8, vkBlot2 * 0.55 + vkFine * 0.45);
float vkRun = vkVert * smoothstep(0.6, 0.86, vkStreak * 0.7 + vkStreak2 * 0.3) * smoothstep(0.35, 0.75, vkBlot);
float vkPool = smoothstep(0.65, 0.95, vkUp) * smoothstep(0.45, 0.8, vkFine * 0.7 + vkBlot * 0.3);
// rust bleed: a thin run down the face from under each rivet (the face's down direction in its uv from the screen
// derivatives), a random length per rivet, only on upright faces
float vkBleed = 0.0;
if (vkRv3.z > 0.5 && vkVert > 0.05) {
  mat3 vkT0 = vkTBN(-vViewPosition, normalize(vNormal), vUvM);
  vec3 vkDn = (viewMatrix * vec4(0.0, -1.0, 0.0, 0.0)).xyz;
  vec2 vkDuv = vec2(dot(vkDn, vkT0[0]) / max(dot(vkT0[0], vkT0[0]), 1e-8), dot(vkDn, vkT0[1]) / max(dot(vkT0[1], vkT0[1]), 1e-8));
  float vkDl = length(vkDuv);
  if (vkDl > 1e-6) {
    vkDuv /= vkDl;
    vec2 vkC = floor((vUvM - vkRv3.xy) * 97.0 + 0.5);
    float vkRid = fract(sin(dot(vkC, vec2(12.9898, 78.233)) + vJ.y) * 43758.5453);
    float vkLs = 0.06 + 0.32 * vkRid * vkRid;
    float vkS = dot(vkRv3.xy, vkDuv), vkLat = abs(dot(vkRv3.xy, vec2(-vkDuv.y, vkDuv.x)));
    float vkW = vkRr * (0.55 + 0.5 * (1.0 - vkS / vkLs));
    vkBleed = smoothstep(vkRr * 0.7, vkRr * 1.4, vkS) * (1.0 - smoothstep(vkLs * 0.4, vkLs, vkS)) * (1.0 - smoothstep(vkW * 0.5, vkW, vkLat))
            * step(0.42, vkRid) * vkVert * (1.0 - smoothstep(0.008, 0.03, vkPix)) * (0.6 + 0.4 * vkStreak2);
  }
}
// the splash zone over the street: salt and kicked-up wet grit rust the lowest metre (shoes, column bases)
float vkLow = 1.0 - smoothstep(0.0, 1.4, vWp.y - vkGround);
float vkRust = clamp(vkRustAmt * (vkChip * 1.1 + vkJoint * 0.75 + vkRun * 0.6 + vkPool * 0.55 + vkHalo * 0.4 * smoothstep(0.3, 0.7, vkFine) + vkRing * 0.35
             + vkLow * smoothstep(0.45, 0.8, vkFine * 0.5 + vkBlot2 * 0.5) * 0.8) + vkBleed * 0.75, 0.0, 1.0);
vec3 vkCol = mix(vkPaint, vkPaint2, smoothstep(0.35, 0.65, vkBlot)) * (0.95 + 0.1 * vkBlot2) * (0.96 + 0.08 * vkFine);
vec3 vkRc = mix(vkRustD, vkRustC, smoothstep(0.2, 0.8, vkFine * 0.6 + vkMic * 0.4));
vkRc = mix(vkRc, vkCol * vec3(0.85, 0.72, 0.62), 0.3);   // weathered rust: browner, dulled by the soot over it
vkCol = mix(vkCol, vkRc, vkRust);
float vkUnder = smoothstep(0.25, 0.9, -vkUp);
float vkSplash = 1.0 - smoothstep(0.0, 2.2, vWp.y - vkGround);
vkCol *= 1.0 - 0.22 * vkUnder - 0.28 * vkSplash * (0.55 + 0.45 * vkFine) - 0.35 * vkRing;
vkCol *= 1.0 - (0.12 + vkGrime) * vkRun * (1.0 - vkRust);   // vkGrime: sooty water runs darker still (Riverside Drive)
// chalking: old paint turns pale and dusty on the up-facing flanges and the sun-baked rims (the pale teal along the ribs)
vkCol = mix(vkCol, vkCol * 1.45 + vec3(0.018, 0.022, 0.02), vkChalk * smoothstep(0.5, 0.95, vkUp) * (0.35 + 0.65 * vkBlot2) * (1.0 - vkRust));
// pigeon droppings: white specks and crusts on the up-facing flanges and ledges, a few drips just under them
float vkGuano = smoothstep(0.6, 0.95, vkUp) * smoothstep(0.74, 0.9, vkN3(vkP * 7.0) * 0.6 + vkMic * 0.4) * smoothstep(0.35, 0.7, vkBlot2);
vkGuano += vkVert * smoothstep(0.86, 0.97, vkN3(vec3(vkP.x * 31.0, vkP.y * 2.2, vkP.z * 31.0))) * smoothstep(0.55, 0.85, vkBlot) * 0.5;
vkCol = mix(vkCol, vec3(0.72, 0.71, 0.66), clamp(vkGuano, 0.0, 0.85) * vkGuanoAmt);
// corrugated pan / buckle plate: ridges across the face (uv.y) every vkCorr metres
float vkCph = vkCorr > 0.0 ? vUvM.y / vkCorr * 6.2831853 : 0.0;
float vkCaa = vkCorr > 0.0 ? 1.0 - smoothstep(0.25, 0.8, vkPix / vkCorr) : 0.0;
vkCol *= 1.0 - 0.2 * (0.5 - 0.5 * cos(vkCph)) * vkCaa;
diffuseColor.rgb = vkCol;`;
const STEEL_FS_ROUGH = /* glsl */`
roughnessFactor = clamp(mix(roughnessFactor * (0.9 + 0.25 * vkFine), 0.88, vkRust) + 0.12 * vkSplash + 0.08 * vkUnder, 0.25, 1.0);`;
const STEEL_FS_METAL = /* glsl */`
metalnessFactor = mix(metalnessFactor, 0.0, vkRust);`;
const STEEL_FS_NORMAL = /* glsl */`
{
  mat3 vkT = vkTBN(-vViewPosition, normal, vUvM);
  vec3 tn = vec3(0.0, 0.0, 1.0);
  if (vkIn > 0.0) { vec2 g = vkRv3.xy / vkRr; float q = max(1.0 - dot(g, g), 0.06); tn.xy += g * (0.55 / sqrt(q)) * vkIn; }
  // bevels: the last 6 mm of a face tip toward its edge
  float bw = 0.006, bAA = 1.0 - smoothstep(0.5, 1.5, vkPix / bw);
  tn.y += ((1.0 - smoothstep(0.0, bw, vUvM.y)) * -0.9 + (1.0 - smoothstep(0.0, bw, vRv.x - vUvM.y)) * 0.9) * bAA;
  tn.x += ((1.0 - smoothstep(0.0, bw, vUvM.x)) * -0.9 + (1.0 - smoothstep(0.0, bw, vJ.x - vUvM.x)) * 0.9) * bAA;
  if (vkCorr > 0.0) tn.y += -sin(vkCph) * 0.75 * vkCaa;
  // paint over pitted steel: a faint orange peel and rust scale
  float pAA = 1.0 - smoothstep(0.004, 0.02, vkPix);
  tn.xy += (vec2(vkN3(vkP * 60.0), vkN3(vkP * 60.0 + 3.7)) - 0.5) * (0.05 + 0.35 * vkRust) * pAA;
  normal = normalize(vkT * tn);
}`;

// the light balance after accumulation: the lit trim (world/materials.js) takes the diffuse albedo to 0.3 by day while the
// specular keeps its full strength, so a dark paint read as a grey sheen; vkSpecK scales the specular back, vkAmbK the sky and probe light where the deck
// overhead hides most of the sky,
// vkDirK the sun on the floor system: the day sun (azimuth 128, 42 deg up) reaches under the station's platforms onto
// street
// ST34 (LOOK, in the main tree since 2026-10-02 00:00) trims a lit-trimmed material's specular to ENV.st34.x (0.5) by
// day on top of vkSpecK, so the steel's sheen fell to half its round-1 balance.
// By day vkSpecK takes 1.6x (0.8 of round 1 with the trim: the diffuse and the specular then share the trim's scale on
// the arch, 0.32 x 1.6 x 0.5 = 0.26); at night ST34 is whole and so is vkSpecK. ltNight comes from applyLightTrim.
// vkDnK (`dn`, default 0): the street's bounce under a deck, a fill on down-facing faces by day (1 + dn x the share of the
// normal pointing down): the floor system under the 125th St station read 31,37,34
const VK_ST34K = ST34 ? '1.6' : '1.0';
const STEEL_FS_LIGHT = /* glsl */`
float vkSK = vkSpecK * mix(${VK_ST34K}, 1.0, ltNight);
reflectedLight.directDiffuse *= vkDirK;
reflectedLight.directSpecular *= vkSK * vkDirK;
reflectedLight.indirectSpecular *= vkSK * vkAmbK;
reflectedLight.indirectDiffuse *= vkAmbK * (1.0 + vkDnK * clamp(-vWn.y, 0.0, 1.0) * (1.0 - ltNight));`;

const _mats = new Map();
// o: { paint, paint2 (the repaint patches), rust (colour), rustAmt, rough, metal, ground (street y), seed, noShadow }
export function steelMat(key, o = {}) {
  if (_mats.has(key)) return _mats.get(key);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: o.rough ?? 0.62, metalness: o.metal ?? 0.08 });
  m.name = 'vk-' + key;
  const U = {
    vkPaint: { value: hex3(o.paint ?? 0x46645b) }, vkPaint2: { value: hex3(o.paint2 ?? o.paint ?? 0x46645b) },
    vkRustC: { value: hex3(o.rust ?? 0x8a4a26) }, vkRustD: { value: hex3(o.rustD ?? 0x4a2a1a) },
    vkRustAmt: { value: o.rustAmt ?? 0.6 }, vkGround: { value: o.ground ?? 3.38 }, vkSeed: { value: o.seed ?? 0 },
    vkRivOn: { value: o.rivets === false ? 0 : 1 }, vkBand: { value: new THREE.Vector4(-1e4, 0, 0, 0) }, vkGuanoAmt: { value: o.guano ?? 0.55 },
    vkChalk: { value: o.chalk ?? 0.0 }, vkCorr: { value: o.corr ?? 0.0 },
    vkSpecK: { value: o.spec ?? 0.45 }, vkAmbK: { value: o.amb ?? 1.0 }, vkDirK: { value: o.dir ?? 1.0 }, vkDnK: { value: o.dn ?? 0.0 }, vkGrime: { value: o.grime ?? 0.0 },
  };
  m.userData.vk = U;
  if (o.noShadow) m.userData.noShadow = true;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + STEEL_VS_PARS)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + STEEL_VS);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + STEEL_FS_PARS)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + STEEL_FS_COLOR)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + STEEL_FS_ROUGH)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + STEEL_FS_METAL)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + STEEL_FS_NORMAL)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + STEEL_FS_LIGHT);
  };
  m.customProgramCacheKey = () => 'vkSteel8';
  applyLightTrim(m, o.trim ?? 1);
  _mats.set(key, m);
  return m;
}

// the zone where a structure carries instanced rivet heads (vk/vkKit.js Geo.rivZone): the shader draws none there
export function setRivBand(mat, y1, cx, cz, r) { if (mat && mat.userData.vk) mat.userData.vk.vkBand.value.set(y1, cx, cz, r * r); }

// the other materials: the library's set when it is in, else a lit-trimmed standard material of the mean colour
const FALL = {
  granite: { color: 0x8d8a84, rough: 0.85, stone: 'cgranite' },
  graniteD: { color: 0x74716b, rough: 0.88, stone: 'cgranite' },
  concrete: { color: 0x9a968e, rough: 0.9, stone: 'cpave' },
  timber: { color: 0x4a3d31, rough: 0.9 },
  ballast: { color: 0x3d3833, rough: 0.95 },
  rail: { color: 0x6f6a64, rough: 0.45, metal: 0.6 },
  railTop: { color: 0xb9b6b0, rough: 0.28, metal: 0.9 },
  panel: { color: 0xd9d0bc, rough: 0.6 },
  canopy: { color: 0x7a2a22, rough: 0.6, metal: 0.1 },
  roof: { color: 0x3e3a36, rough: 0.8 },
  glass: { color: 0x2f3b42, rough: 0.1, metal: 0.35 },
  yellow: { color: 0xd8b23a, rough: 0.7 },
  white: { color: 0xdedcd6, rough: 0.7 },
  netting: { color: 0x1c1d1e, rough: 0.9 },
  brick: { color: 0x9c7a5c, rough: 0.9 },
  lime: { color: 0xcdc3ad, rough: 0.8 },
  asphalt: { color: 0x3a3a3b, rough: 0.95 },
};
const LIB = {   // [pbr set name, opts]
  granite: ['granite_grey', { tint: '#8d8a84', dirt: 0.35 }],
  graniteD: ['granite_grey', { tint: '#74716b', dirt: 0.45, seed: 3 }],
  concrete: ['concrete_precast', { tint: '#9a968e', dirt: 0.35 }],
  panel: ['metal_painted', { tint: '#d6ccb5', dirt: 0.1, seed: 5 }],
  canopy: ['metal_painted', { tint: '#6b2a22', dirt: 0.25, seed: 6 }],
  roof: ['metal_painted', { tint: '#56575a', dirt: 0.4, seed: 7 }],
  brick: ['brick_tan', { tint: '#9c7a5c', dirt: 0.3 }],
  lime: ['stone_lime', { tint: '#cdc3ad', dirt: 0.3 }],
};
const _other = new Map();
export function otherMat(name, extra = {}) {
  const k = name + JSON.stringify(extra);
  if (_other.has(k)) return _other.get(k);
  let m = null;
  if (PBR && LIB[name]) { try { m = PBR.pbrMaterial(LIB[name][0], { ...LIB[name][1], ...extra }); } catch { m = null; } }
  if (!m) {
    const f = FALL[name] || FALL.concrete;
    m = new THREE.MeshStandardMaterial({ color: f.color, roughness: f.rough, metalness: f.metal || 0 });
    if (f.stone) applyStoneDetail(m, f.stone, { amt: 0.8, nrm: 0.7 });
    applyLightTrim(m);
  }
  m.name = m.name || 'vk-' + name;
  _other.set(k, m);
  return m;
}
// lamps and lit windows: emissive, brighter after dark (ENV.night)
export function litMat(name, color, dayK, nightK, o = {}) {
  const k = 'lit:' + name;
  if (_other.has(k)) return _other.get(k);
  const m = new THREE.MeshStandardMaterial({ color: o.base ?? color, roughness: o.rough ?? 0.4, metalness: o.metal ?? 0, emissive: color, emissiveIntensity: 1.0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.kNightW = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float kNightW;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n totalEmissiveRadiance *= mix(${dayK.toFixed(3)}, ${nightK.toFixed(3)}, kNightW);`);
  };
  m.customProgramCacheKey = () => 'vkLit' + name;
  applyLightTrim(m);
  m.userData.noShadow = true;
  _other.set(k, m);
  return m;
}

// the debris netting under the deck: black polyethylene cord knotted in a 4 cm square mesh, seen through; the cords as a tiling alpha map (uv in metres), so the mesh averages to a dark
// veil at distance (mipmapped coverage, no alpha-test shimmer) and resolves into cords close up; no shadow
let _net = null;
export function netMat() {
  if (_net) return _net;
  let map = null;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
    const c = cv.getContext('2d');
    c.clearRect(0, 0, 128, 128);
    c.fillStyle = 'rgba(255,255,255,1)';
    for (let k = 0; k < 8; k++) { c.fillRect(k * 16, 0, 4, 128); c.fillRect(0, k * 16 + 1, 128, 4); }
    for (let k = 0; k < 8; k++) for (let j = 0; j < 8; j++) c.fillRect(k * 16 - 1, j * 16, 6, 6);   // the knots
    map = new THREE.CanvasTexture(cv); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(1 / 0.32, 1 / 0.32); map.anisotropy = 4;
  }
  _net = applyLightTrim(new THREE.MeshStandardMaterial({ color: 0x1a1b1c, roughness: 0.95, metalness: 0, alphaMap: map, transparent: true, opacity: map ? 0.95 : 0.45, depthWrite: false, side: THREE.DoubleSide }));
  _net.name = 'vk-netting';
  _net.userData.noShadow = true;
  return _net;
}

// the parapet's welded-wire infill (Riverside Drive): galvanised wire on 50 x 100 mm cells, see-through; from the street
// a pale grey veil between the posts
let _fence = null;
export function fenceMat() {
  if (_fence) return _fence;
  let map = null;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
    const c = cv.getContext('2d');
    c.clearRect(0, 0, 64, 128);
    c.fillStyle = 'rgba(255,255,255,1)';
    for (let k = 0; k < 4; k++) c.fillRect(k * 16, 0, 5, 128);
    for (let k = 0; k < 4; k++) c.fillRect(0, k * 32, 64, 5);
    map = new THREE.CanvasTexture(cv); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(1 / 0.2, 1 / 0.4); map.anisotropy = 4;
  }
  _fence = applyLightTrim(new THREE.MeshStandardMaterial({ color: 0xc4c8c9, roughness: 0.5, metalness: 0.45, alphaMap: map, transparent: true, opacity: map ? 0.9 : 0.4, depthWrite: false, side: THREE.DoubleSide }));
  _fence.name = 'vk-fence';
  _fence.userData.noShadow = true;
  return _fence;
}

// anti-pigeon spikes: stainless wires fanned from a clear base, drawn on a card (alpha-tested, both sides)
let _spike = null;
export function spikeMat() {
  if (_spike) return _spike;
  let map = null;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
    const c = cv.getContext('2d');
    c.clearRect(0, 0, 128, 128);
    c.lineCap = 'round';
    for (let k = 0; k < 9; k++) {
      const a = (-0.62 + (1.24 * k) / 8) + (Math.sin(k * 7.3) * 0.06), x0 = 34 + k * 7.5, L = 96 + ((k * 37) % 23);
      c.strokeStyle = k % 2 ? 'rgba(230,232,235,1)' : 'rgba(205,208,212,1)'; c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(x0, 124); c.lineTo(x0 + Math.sin(a) * L, 124 - Math.cos(a) * L); c.stroke();
    }
    c.fillStyle = 'rgba(200,205,210,0.9)'; c.fillRect(20, 118, 88, 10);   // the base strip seen edge on
    map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  }
  _spike = applyLightTrim(new THREE.MeshStandardMaterial({ color: 0xd8dadc, roughness: 0.32, metalness: 0.65, map, alphaTest: 0.45, transparent: false, side: THREE.DoubleSide }));
  _spike.name = 'vk-spikes';
  return _spike;
}
