// CP33 castle kit (city/cpCastle.js builds Belvedere Castle, its terraces and Vista Rock with it): the photoscan materials
// (triplanar, world-space, no UVs), the noise, the mesh bin, the coursed-rubble stone generator, the swept granite
// mouldings and the rock's height field. Sources: docs/notes/central-park-photoreal.md (castle section).
// Textures (CC0, Poly Haven, public/textures/cp33/castle/): lichen_rock (Rico Cilliers), rock_boulder_dry and
// roof_slates_03 (Poly Haven); re-encoded to JPG, the albedo means measured for the calibration below.
import * as THREE from 'three';
import { ENV, applyLightTrim, applyCityAO } from '../world/materials.js';

// ---- noise ----------------------------------------------------------------------------------------------------------
export const fract = (v) => v - Math.floor(v);
export const h2 = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
export const h1 = (x) => fract(Math.sin(x * 91.3458) * 47453.5453);
export function vn(x, y) {
  const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const a = h2(i, j), b = h2(i + 1, j), c = h2(i, j + 1), d = h2(i + 1, j + 1);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}
export function fbm(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let k = 0; k < oct; k++) { s += a * vn(x * f + k * 17.3, y * f - k * 9.1); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
export function rng(seed) {
  let t = (seed * 2654435761) >>> 0;
  return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

// ---- the materials --------------------------------------------------------------------------------------------------
// One MeshStandardMaterial per surface, its photoscan sampled triplanar in world space (Ben Golus's whiteout blend for
// the normals), a second sample at 0.29x the scale over it against the tiling, a value-noise drift of the tone, then the
// city's applyLightTrim (0.30 by day) and applyCityAO. aOff (per stone) shifts the sampling so no two stones share a face.
// Calibration: the texture's linear mean times `tint` lands on the park kits' pre-trim tones (cpLandmarksKit.js COL /
// buildBelvedere: schist 0x9a948a, granite 0xcac6bd, the living rock 0x7a756d); vertex colours carry each stone's tone.
const TEX = 'textures/cp33/castle/';
const _tex = new Map();
function tex(name, srgb) {
  let t = _tex.get(name);
  if (t) return t;
  t = new THREE.TextureLoader().load(TEX + name + '.jpg', undefined, undefined, () => console.warn('[cp33c] texture missing', name));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  _tex.set(name, t);
  return t;
}
// kinds: rock (Vista Rock: moss on the flats, stains down the faces, the wet band), stone (the castle's schist rubble),
// granite (trim, coping, flags), mortar, slate (roofs)
const KIND = { rock: 0, stone: 1, granite: 2, mortar: 3, slate: 4, flag: 5 };
// (tints re-fitted 10-01 02:35: the vertex colours are the stones' RELATIVE tones around 1.0 (white base), so texture
// mean x tint = the absolute pre-trim tone; measured linear means vrock 0.065/0.049/0.035, granite 0.40/0.34/0.27,
// slate 0.169/0.162/0.143, after the desaturation: rock 0.061/0.050/0.039, stone 0.057/0.051/0.045, trim 0.36/0.34/0.32)
// (10-01 08:00: calm = how far the sample is pulled to the texture's mean tone (the lichen crust's white speckle read as
// dalmatian on the castle's rubble), grain = the dressed stone's salt-and-pepper grain and 1-2 cm bush-hammering, live
// within ~4 m; the mortar is a pale lime, no longer the blue-black the recessed joints rendered as)
const SET = {
  rock: { set: 'vrock', s: 0.5, tint: [3.0, 3.35, 3.7], desat: 0.25, rough: 1.0, nrm: 1.0, calm: 0.0, grain: 0.0 },
  stone: { set: 'vrock', s: 0.62, tint: [7.5, 7.5, 7.7], desat: 0.62, rough: 1.0, nrm: 0.9, calm: 0.55, grain: 0.35 },
  granite: { set: 'granite', s: 0.55, tint: [1.66, 1.68, 1.72], desat: 0.8, rough: 1.0, nrm: 0.8, calm: 0.4, grain: 1.0 },
  mortar: { set: 'granite', s: 1.6, tint: [1.55, 1.48, 1.3], desat: 0.85, rough: 1.0, nrm: 0.4, calm: 0.6, grain: 0.7 },
  slate: { set: 'slate', s: 0.9, tint: [1.12, 1.2, 1.34], desat: 0.45, rough: 0.82, nrm: 0.7, calm: 0.2, grain: 0.0, rmin: 0.72 },
  flag: { set: 'granite', s: 0.7, tint: [0.98, 1.0, 1.05], desat: 0.75, rough: 1.0, nrm: 0.9, calm: 0.3, grain: 1.0 },
};
const MATS = {};
const GLSL_NOISE = `
float cpH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cpVN(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(cpH(i), cpH(i + vec2(1.0, 0.0)), u.x), mix(cpH(i + vec2(0.0, 1.0)), cpH(i + vec2(1.0, 1.0)), u.x), u.y); }
float cpFbm(vec2 p) { return 0.55 * cpVN(p) + 0.3 * cpVN(p * 2.07 + 5.3) + 0.15 * cpVN(p * 4.13 - 2.1); }
float cpH3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
`;
export function castleMat(kind, o = {}) {
  const key = kind + (o.key || '');
  if (MATS[key]) return MATS[key];
  const S = SET[kind];
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: S.rough, metalness: 0.0, side: o.side ?? THREE.FrontSide, flatShading: false });
  m.name = 'cp33c:' + key;
  const U = {
    cpC: { value: tex(S.set + '_col', true) }, cpN: { value: tex(S.set + '_nrm', false) }, cpA: { value: tex(S.set + '_arm', false) },
    cpS: { value: S.s }, cpTint: { value: new THREE.Vector3(...S.tint) }, cpDesat: { value: S.desat }, cpNA: { value: S.nrm },
    cpWater: { value: o.water ?? -100 }, cpKind: { value: KIND[kind] }, cpOrg: { value: new THREE.Vector3() }, cpCalm: { value: S.calm || 0 }, cpGrain: { value: S.grain || 0 }, cpRmin: { value: S.rmin || 0 },
  };
  m.userData.cp = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aOff;\nvarying vec3 vCw;\nvarying vec3 vCn;\nvarying vec3 vCo;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCw = (modelMatrix * vec4(transformed, 1.0)).xyz; vCn = normalize(mat3(modelMatrix) * objectNormal); vCo = aOff;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D cpC; uniform sampler2D cpN; uniform sampler2D cpA;
uniform float cpS; uniform vec3 cpTint; uniform float cpDesat; uniform float cpNA; uniform float cpWater; uniform float cpKind; uniform float cpCalm; uniform float cpGrain; uniform float cpRmin;
varying vec3 vCw; varying vec3 vCn; varying vec3 vCo;
${GLSL_NOISE}
vec3 cpArm; vec3 cpNw; float cpWet;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 cN = normalize(vCn) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 bw = pow(abs(cN), vec3(4.0)); bw /= max(1e-4, bw.x + bw.y + bw.z);
  vec3 sg = vec3(cN.x < 0.0 ? -1.0 : 1.0, cN.y < 0.0 ? -1.0 : 1.0, cN.z < 0.0 ? -1.0 : 1.0);
  vec3 P = vCw + vCo;
  vec2 uX = P.zy * cpS, uY = P.xz * cpS, uZ = P.xy * cpS;
  uX.x *= sg.x; uY.x *= sg.y; uZ.x *= -sg.z;
  vec3 c = texture2D(cpC, uX).rgb * bw.x + texture2D(cpC, uY).rgb * bw.y + texture2D(cpC, uZ).rgb * bw.z;
  // the macro sample (0.29x, shifted) against the tiling
  vec2 mX = uX * 0.29 + 0.37, mY = uY * 0.29 + 0.61, mZ = uZ * 0.29 + 0.13;
  vec3 c2 = texture2D(cpC, mX).rgb * bw.x + texture2D(cpC, mY).rgb * bw.y + texture2D(cpC, mZ).rgb * bw.z;
  c = mix(c, c2, 0.38);
  float pxw = max(length(dFdx(P)), length(dFdy(P)));
  float gfade = 1.0 - smoothstep(0.0011, 0.0055, pxw);
  if (cpCalm > 0.0) {
    vec3 cm = texture2D(cpC, uX, 6.0).rgb * bw.x + texture2D(cpC, uY, 6.0).rgb * bw.y + texture2D(cpC, uZ, 6.0).rgb * bw.z;
    c = mix(c, cm, cpCalm);
  }
  if (cpGrain > 0.0 && gfade > 0.0) {
    float g1 = cpVN(vec2(P.x + P.z * 0.7, P.y + P.z * 0.37) * 150.0 + 3.1);
    float g2 = cpVN(vec2(P.z - P.x * 0.5, P.y * 1.3 + P.x * 0.2) * 60.0 + 8.3);
    float sp = smoothstep(0.64, 0.78, g1) * -0.36 + smoothstep(0.36, 0.22, g1) * 0.32 + (g2 - 0.5) * 0.22;
    c *= 1.0 + sp * cpGrain * gfade;
  }
  cpArm = texture2D(cpA, uX).rgb * bw.x + texture2D(cpA, uY).rgb * bw.y + texture2D(cpA, uZ).rgb * bw.z;
  vec3 tX = texture2D(cpN, uX).xyz * 2.0 - 1.0, tY = texture2D(cpN, uY).xyz * 2.0 - 1.0, tZ = texture2D(cpN, uZ).xyz * 2.0 - 1.0;
  tX.xy *= cpNA; tY.xy *= cpNA; tZ.xy *= cpNA;
  tX.x *= sg.x; tY.x *= sg.y; tZ.x *= -sg.z;
  tX = vec3(tX.xy + cN.zy, abs(tX.z) * cN.x);
  tY = vec3(tY.xy + cN.xz, abs(tY.z) * cN.y);
  tZ = vec3(tZ.xy + cN.xy, abs(tZ.z) * cN.z);
  cpNw = normalize(tX.zyx * bw.x + tY.xzy * bw.y + tZ.xyz * bw.z);
  if (cpGrain > 0.0 && gfade > 0.0) {
    vec3 q = P * 38.0;
    vec3 gq = vec3(cpVN(q.yz + 3.1), cpVN(q.zx + 7.7), cpVN(q.xy + 1.9)) - 0.5;
    cpNw = normalize(cpNw + gq * 0.55 * cpGrain * gfade);
  }
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3(lum), cpDesat) * cpTint;
  // the tone's drift (2-9 m), so a face never reads as one print
  float dr = cpFbm(P.xz * 0.21 + P.y * 0.13);
  c *= 0.86 + 0.28 * dr;
  cpWet = 0.0;
  if (cpKind < 0.5) {
    // Vista Rock: moss and lichen on the flats and ledges, rust and soot stains streaked down the faces, the wet band
    float up = smoothstep(0.5, 0.92, cN.y);
    float mn = cpFbm(P.xz * 0.45 + 3.1);
    float moss = up * smoothstep(0.5, 0.72, mn) * 0.85;
    vec3 mossC = vec3(0.105, 0.125, 0.052) * (0.7 + 0.6 * lum / 0.12);
    c = mix(c, mossC, moss);
    float steep = 1.0 - smoothstep(0.35, 0.7, abs(cN.y));
    float st = cpFbm(vec2(P.x * 1.3 + P.z * 0.9, P.y * 0.16)) ;
    c *= 1.0 - steep * smoothstep(0.55, 0.85, st) * 0.32;
    float rust = smoothstep(0.62, 0.9, cpFbm(P.xz * 0.33 + P.y * 0.2 - 7.7));
    c *= mix(vec3(1.0), vec3(1.12, 0.94, 0.78), rust * 0.6);
    cpWet = 1.0 - smoothstep(cpWater + 0.05, cpWater + 0.45 + 0.25 * cpVN(P.xz * 1.7), P.y);
    c *= 1.0 - 0.45 * cpWet;
  } else if (cpKind < 1.5) {
    // the castle's stones: soot and damp low on the walls, a weathered fringe
    float damp = 1.0 - smoothstep(0.0, 1.6, P.y - cpWater);
    c *= 1.0 - 0.18 * damp;
    // rain streaks down the faces (noise stretched along the fall line), a green-grey bloom in the damp
    float vert = 1.0 - abs(cN.y);
    float sk = cpFbm(vec2((P.x + P.z) * 2.6 + P.y * 0.05, P.y * 0.2 + 7.0));
    c *= 1.0 - vert * smoothstep(0.55, 0.9, sk) * 0.24;
    float gb = smoothstep(0.6, 0.85, cpFbm(vec2(P.x * 0.7 + P.z * 0.7, P.y * 0.5 + 3.0)));
    c *= mix(vec3(1.0), vec3(0.9, 1.0, 0.9), gb * 0.45);
  }
  diffuseColor.rgb *= c;
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor *= max(mix(cpArm.g, 0.35, cpWet), cpRmin);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize((viewMatrix * vec4(cpNw, 0.0)).xyz);`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
{ float cao = mix(1.0, cpArm.r, 0.85); reflectedLight.indirectDiffuse *= cao; reflectedLight.indirectSpecular *= cao; }`);
  };
  m.customProgramCacheKey = () => 'cp33c' + kind;
  applyLightTrim(m);
  applyCityAO(m);
  MATS[key] = m;
  return m;
}
// painted timber (the pavilions), flat vertex-coloured paint with a faint grain; dark glass in the windows; flag cloth
export function plainMat(kind) {
  if (MATS[kind]) return MATS[kind];
  let m;
  if (kind === 'paint') {
    m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.0, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPw;').replace('#include <project_vertex>', '#include <project_vertex>\nvPw = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vPw;
float pgH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float pgV(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(pgH(i), pgH(i + vec2(1.0, 0.0)), u.x), mix(pgH(i + vec2(0.0, 1.0)), pgH(i + vec2(1.0, 1.0)), u.x), u.y); }`).replace('#include <color_fragment>', `#include <color_fragment>
{
  float gr = pgV(vec2((vPw.x + vPw.z) * 90.0, vPw.y * 6.0)) * 0.6 + pgV(vec2((vPw.x - vPw.z) * 23.0, vPw.y * 40.0)) * 0.4;
  float wear = smoothstep(0.62, 0.9, pgV(vPw.xz * 2.3 + vPw.y * 1.7)) * 0.22;
  diffuseColor.rgb *= 0.86 + 0.26 * gr;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.35, 1.22, 1.0), wear);
}`);
    };
    m.customProgramCacheKey = () => 'cp33c-paint-1';
  }
  else if (kind === 'cloth') m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide });
  else if (kind === 'iron') m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.6, side: THREE.DoubleSide });
  else {
    m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.2, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.cgNight = ENV.night;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float cgNight;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(1.0, 0.72, 0.42) * smoothstep(0.25, 0.8, cgNight) * 0.45;');
    };
    m.customProgramCacheKey = () => 'cp33cglass';
  }
  m.name = 'cp33c:' + kind;
  applyLightTrim(m);
  applyCityAO(m);
  MATS[kind] = m;
  return m;
}

// ---- the mesh bin -------------------------------------------------------------------------------------------------
// Triangles in the castle frame (u, y, w), each vertex with its own normal (smooth inside a stone's face, sharp at its
// arrises), colour and sampling offset. mesh() maps them to the world, relative to the LOD's origin (x0, z0).
export class CBin {
  constructor() { this.P = []; this.N = []; this.C = []; this.O = []; }
  // a triangle; normals na/nb/nc ([u, y, w]); the winding is turned to face the normals
  tri(a, b, c, na, nb, nc, col, off) {
    const e1u = b[0] - a[0], e1y = b[1] - a[1], e1w = b[2] - a[2], e2u = c[0] - a[0], e2y = c[1] - a[1], e2w = c[2] - a[2];
    const fu = e1y * e2w - e1w * e2y, fy = e1w * e2u - e1u * e2w, fw = e1u * e2y - e1y * e2u;
    if (fu * fu + fy * fy + fw * fw < 1e-14) return;
    const s = fu * (na[0] + nb[0] + nc[0]) + fy * (na[1] + nb[1] + nc[1]) + fw * (na[2] + nb[2] + nc[2]);
    const cc = Array.isArray(col) ? col : [col, col, col], oo = off || [0, 0, 0];
    const V = s >= 0 ? [[a, na, cc[0]], [b, nb, cc[1]], [c, nc, cc[2]]] : [[a, na, cc[0]], [c, nc, cc[2]], [b, nb, cc[1]]];
    for (const [p, n, k] of V) { this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); this.C.push(k.r, k.g, k.b); this.O.push(oo[0], oo[1], oo[2]); }
  }
  // a flat quad facing n (or its own winding's normal when n is omitted)
  quad(a, b, c, d, col, off, n) {
    if (!n) { const e1 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], e2 = [d[0] - b[0], d[1] - b[1], d[2] - b[2]]; n = nrm3([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]); }
    this.tri(a, b, c, n, n, n, col, off); this.tri(a, c, d, n, n, n, col, off);
  }
  get tris() { return this.P.length / 9; }
  mesh(mat, name, F, o = {}) {
    if (!this.P.length) return null;
    const n = this.P.length / 3, P = new Float32Array(n * 3), N = new Float32Array(n * 3);
    const { x0, z0, ox, oz, ax, az } = F;
    for (let i = 0; i < n; i++) {
      const u = this.P[i * 3], y = this.P[i * 3 + 1], w = this.P[i * 3 + 2];
      P[i * 3] = ox + ax * u - az * w - x0; P[i * 3 + 1] = y; P[i * 3 + 2] = oz + az * u + ax * w - z0;
      const nu = this.N[i * 3], ny = this.N[i * 3 + 1], nw = this.N[i * 3 + 2];
      N[i * 3] = ax * nu - az * nw; N[i * 3 + 1] = ny; N[i * 3 + 2] = az * nu + ax * nw;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.C), 3));
    g.setAttribute('aOff', new THREE.BufferAttribute(new Float32Array(this.O), 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.name = name; m.castShadow = o.cast !== false; m.receiveShadow = true;
    return m;
  }
}
export const nrm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
export const K = (hex) => new THREE.Color(hex);
export const shade = (c, f, warm = 0) => new THREE.Color(c.r * f * (1 + warm), c.g * f, c.b * f * (1 - warm));

// ---- walls ----------------------------------------------------------------------------------------------------------
// A wall face is a map M(s, y, t) -> frame (u, y, w): s along the face, t out of it. flatWall: from (u0, w0) to (u1, w1),
// out to the right of the direction of travel in plan (the outline traversed clockwise seen from above, x east z south:
// the outside is on the left... the normal is given explicitly: side +1 or -1). roundWall: a cylinder (cu, cw, r), s the
// arc length from angle a0.
export function flatWall(a, b, side = 1) {
  const du = b[0] - a[0], dw = b[1] - a[1], L = Math.hypot(du, dw), eu = du / L, ew = dw / L, nu = -ew * side, nw = eu * side;
  return { L, M: (s, y, t) => [a[0] + eu * s + nu * t, y, a[1] + ew * s + nw * t], N: () => [nu, 0, nw], d: [eu, ew], n: [nu, nw] };
}
export function roundWall(cu, cw, r, a0, a1) {
  const L = Math.abs(a1 - a0) * r, sg = a1 >= a0 ? 1 : -1;
  return { L, M: (s, y, t) => { const a = a0 + sg * s / r; return [cu + Math.cos(a) * (r + t), y, cw + Math.sin(a) * (r + t)]; },
    N: (s) => { const a = a0 + sg * s / r; return [Math.cos(a), 0, Math.sin(a)]; }, round: true };
}
// One rock-faced stone of coursed rubble: the face bulged (a pillow with noise, the schist's cleft), chamfered arrises,
// returns back into the joint. (s0..s1, y0..y1) in the face; t0 its face's offset; R a random source.
function stoneBlock(B, Wf, s0, s1, y0, y1, col, R, o) {
  const L = s1 - s0, H = y1 - y0;
  if (L < 0.05 || H < 0.05) return;
  const ch = Math.min(0.03, 0.16 * Math.min(L, H)), amp = (o.amp ?? 1) * Math.min(0.045, 0.07 * Math.min(L, H) + 0.004);
  const ns = Math.max(2, Math.min(o.nsMax ?? 7, Math.round(L / 0.14))), ny = Math.max(2, Math.min(o.nyMax ?? 4, Math.round(H / 0.11)));
  const tz = (o.t0 || 0) + (R() - 0.5) * 0.024, tiltS = (R() - 0.5) * 0.02, tiltY = (R() - 0.5) * 0.02;
  const seed = R() * 100, off = [R() * 37, R() * 23, R() * 41];
  const G = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= ns; i++) {
    const fs = i / ns, fy = j / ny, s = s0 + ch + (L - 2 * ch) * fs, y = y0 + ch + (H - 2 * ch) * fy;
    const pil = (1 - Math.pow(2 * fs - 1, 4)) * (1 - Math.pow(2 * fy - 1, 4));
    const edge = (i === 0 || i === ns || j === 0 || j === ny) ? 0.35 : 1;
    const t = tz + amp * (0.35 + 0.65 * pil) * (0.75 + 0.5 * vn(seed + fs * 2.3, fy * 1.7)) * edge + (h2(seed + i, j) - 0.5) * 0.006 * edge + tiltS * (fs - 0.5) * L + tiltY * (fy - 0.5) * H;
    G.push(Wf.M(s, y, t));
  }
  const at = (i, j) => G[j * (ns + 1) + i];
  const nOut = Wf.N((s0 + s1) / 2);
  const vnm = (i, j) => {
    const a = at(Math.min(ns, i + 1), j), b = at(Math.max(0, i - 1), j), c = at(i, Math.min(ny, j + 1)), d = at(i, Math.max(0, j - 1));
    const e1 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], e2 = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
    let n = nrm3([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]);
    if (n[0] * nOut[0] + n[1] * nOut[1] + n[2] * nOut[2] < 0) n = [-n[0], -n[1], -n[2]];
    return n;
  };
  const NN = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= ns; i++) NN.push(vnm(i, j));
  const nat = (i, j) => NN[j * (ns + 1) + i];
  for (let j = 0; j < ny; j++) for (let i = 0; i < ns; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    B.tri(a, b, c, nat(i, j), nat(i + 1, j), nat(i + 1, j + 1), col, off); B.tri(a, c, d, nat(i, j), nat(i + 1, j + 1), nat(i, j + 1), col, off);
  }
  // the arris: the face's rim to the stone's edge (t = tz - 0.004), then the return into the joint (t = -0.05)
  const rim = [], back = [];
  const per = [];
  for (let i = 0; i <= ns; i++) per.push([i, 0]);
  for (let j = 1; j <= ny; j++) per.push([ns, j]);
  for (let i = ns - 1; i >= 0; i--) per.push([i, ny]);
  for (let j = ny - 1; j >= 1; j--) per.push([0, j]);
  const dark = shade(col, 0.8), darker = shade(col, 0.64);
  for (const [i, j] of per) {
    const fs = i / ns, fy = j / ny, s = s0 + L * fs, y = y0 + H * fy;
    rim.push(Wf.M(s, y, tz - 0.004)); back.push(Wf.M(s, y, -0.05));
  }
  for (let k = 0; k < per.length; k++) {
    const k1 = (k + 1) % per.length, [i0, j0] = per[k], [i1, j1] = per[k1];
    const g0 = at(i0, j0), g1 = at(i1, j1), r0 = rim[k], r1 = rim[k1], b0 = back[k], b1 = back[k1];
    // the chamfer's normal: between the face's and the side's
    const sd = [(r0[0] + r1[0]) / 2 - (g0[0] + g1[0]) / 2, (r0[1] + r1[1]) / 2 - (g0[1] + g1[1]) / 2, (r0[2] + r1[2]) / 2 - (g0[2] + g1[2]) / 2];
    const nc = nrm3([sd[0] + nOut[0] * 0.02, sd[1] + nOut[1] * 0.02, sd[2] + nOut[2] * 0.02]);
    const ns2 = nrm3(sd);
    B.tri(g0, r0, r1, nc, nc, nc, dark, off); B.tri(g0, r1, g1, nc, nc, nc, dark, off);
    if (!o.noBack) { B.tri(r0, b0, b1, ns2, ns2, ns2, darker, off); B.tri(r0, b1, r1, ns2, ns2, ns2, darker, off); }
  }
}
// openings: { s0, s1, y0, y1, arch: true (a round head of half the width), pt: true (a pointed head) }
const inOpen = (ops, s0, s1, y0, y1, pad) => {
  for (const op of ops) {
    if (s1 <= op.s0 - pad || s0 >= op.s1 + pad) continue;
    const top = op.y1 + (op.arch || op.pt ? 0 : 0) + pad;
    if (y1 <= op.y0 - pad || y0 >= top) continue;
    return op;
  }
  return null;
};
// the opening's outline half width at height y (for the stones round a head)
function openHalf(op, y) {
  const hw = (op.s1 - op.s0) / 2, sp = op.y1 - (op.arch ? hw : op.pt ? hw * 1.3 : 0);
  if (y <= sp) return hw;
  if (op.arch) { const d = y - sp; return d >= hw ? 0 : Math.sqrt(hw * hw - d * d); }
  if (op.pt) { const r = hw * 1.345, d = y - sp; return Math.max(0, Math.sqrt(Math.max(0, r * r - d * d)) - (r - hw)); }   // the apex 1.3 hw over the springing
  return hw;
}
// Coursed rubble over a face from s 0..L, y y0..y1: courses 0.2-0.42 m (thin and thick together, the schist split along
// its foliation), stones 0.35-1.25 m long staggered over the joints below, 14 mm joints; the stones stop at the openings'
// outlines (their granite dressings cover the rest). The mortar behind, recessed 1.4 cm.
export function rubble(B, BM, Wf, y0, y1, o = {}) {
  const R = rng(o.seed ?? 1), ops = o.ops || [], J = 0.014, base = o.col || K(0x9a948a);
  const sA = o.s0 ?? 0, sB = o.s1 ?? Wf.L;
  let y = y0, row = 0;
  while (y < y1 - 0.04) {
    let ch = 0.2 + R() * 0.22; if (R() < 0.18) ch = 0.14 + R() * 0.06;
    if (o.course) { ch = o.course * (0.72 + R() * 0.56); if (R() < 0.12) ch = o.course * (0.5 + R() * 0.12); }
    if (y1 - (y + ch) < 0.14) ch = y1 - y;
    const ya = y + J / 2, yb = y + ch - J / 2;
    let s = sA + (row % 2 ? -R() * 0.5 : 0);
    while (s < sB - 0.02) {
      let ln = Math.min(1.25, Math.max(0.32, ch * (1.4 + R() * 2.6)));
      let sa = Math.max(sA, s + J / 2), sb = Math.min(sB, s + ln - J / 2);
      if (sB - sb < 0.25) sb = sB;
      // the openings: cut the stone back to the outline at this course
      let skip = false;
      for (const op of ops) {
        if (yb <= op.y0 - 0.02 || ya >= op.y1 + 0.02) continue;
        const c = (op.s0 + op.s1) / 2, hw = Math.max(openHalf(op, ya), openHalf(op, yb)) + (op.pad ?? 0.06);
        if (sb <= c - hw || sa >= c + hw) continue;
        if (sa >= c - hw && sb <= c + hw) { skip = true; break; }
        if (sa < c - hw) sb = Math.min(sb, c - hw - J / 2); else sa = Math.max(sa, c + hw + J / 2);
      }
      if (!skip && sb - sa > 0.06) {
        const v = R(), tone = (0.76 + 0.42 * R()) * (R() < 0.06 ? 0.78 : 1);
        const warm = v < 0.2 ? 0.09 : v > 0.78 ? -0.07 : (v - 0.5) * 0.06;
        const damp = o.damp ? 1 - 0.26 * Math.max(0, Math.min(1, 1 - (ya - o.damp) / 1.8)) : 1;
        let streak = 1;
        for (const op of ops) {
          if (yb > op.y0 + 0.02 || op.y0 - yb > 2.2) continue;
          const ov = Math.min(sb, op.s1 + 0.1) - Math.max(sa, op.s0 - 0.1);
          if (ov > 0) streak = Math.min(streak, 1 - 0.2 * (1 - (op.y0 - yb) / 2.2) * Math.min(1, ov / Math.max(0.2, sb - sa)));
        }
        const c = shade(base, tone * damp * streak, warm);
        stoneBlock(B, Wf, sa, sb, ya, yb, c, R, o);
      }
      s += ln;
    }
    y += ch; row++;
  }
  // the mortar bed behind the stones
  if (BM) {
    const mc = shade(o.mortar || K(0x8a857b), 1.0), n = Wf.N(0), seg = Wf.round ? Math.max(4, Math.ceil(Wf.L / 0.5)) : 1;
    for (let k = 0; k < seg; k++) {
      const s0 = sA + (sB - sA) * k / seg, s1 = sA + (sB - sA) * (k + 1) / seg;
      // leave the openings open: the mortar in strips between them (vertical bands at each opening's sides)
      const cuts = [s0];
      for (const op of ops) if (op.s1 > s0 && op.s0 < s1) cuts.push(Math.max(s0, op.s0), Math.min(s1, op.s1));
      cuts.push(s1); cuts.sort((a, b) => a - b);
      for (let q = 0; q + 1 < cuts.length; q++) {
        const a = cuts[q], b = cuts[q + 1]; if (b - a < 1e-3) continue;
        const mid = (a + b) / 2, op = ops.find((p) => mid > p.s0 && mid < p.s1);
        const N0 = Wf.N(a), N1 = Wf.N(b);
        if (!op) { BM.tri(Wf.M(a, y0, -0.014), Wf.M(b, y0, -0.014), Wf.M(b, y1, -0.014), N0, N1, N1, mc); BM.tri(Wf.M(a, y0, -0.014), Wf.M(b, y1, -0.014), Wf.M(a, y1, -0.014), N0, N1, N0, mc); continue; }
        // under the sill and over the head
        if (op.y0 > y0) { BM.tri(Wf.M(a, y0, -0.014), Wf.M(b, y0, -0.014), Wf.M(b, op.y0, -0.014), N0, N1, N1, mc); BM.tri(Wf.M(a, y0, -0.014), Wf.M(b, op.y0, -0.014), Wf.M(a, op.y0, -0.014), N0, N1, N0, mc); }
        if (op.y1 < y1) { BM.tri(Wf.M(a, op.y1, -0.014), Wf.M(b, op.y1, -0.014), Wf.M(b, y1, -0.014), N0, N1, N1, mc); BM.tri(Wf.M(a, op.y1, -0.014), Wf.M(b, y1, -0.014), Wf.M(a, y1, -0.014), N0, N1, N0, mc); }
        // the head's spandrels (round or pointed), filled up to the outline
        const sp = op.y1 - (op.arch ? (op.s1 - op.s0) / 2 : op.pt ? (op.s1 - op.s0) / 2 * 1.3 : 0);
        if (sp < op.y1) {
          const c = (op.s0 + op.s1) / 2, n = 6;
          for (let k2 = 0; k2 < n; k2++) {
            const ya = sp + (op.y1 - sp) * k2 / n, yb = sp + (op.y1 - sp) * (k2 + 1) / n, ha = openHalf(op, ya), hb = openHalf(op, yb);
            for (const sgn of [-1, 1]) {
              const ea = c + sgn * ha, eb = c + sgn * hb, far = sgn < 0 ? a : b;
              if ((sgn < 0 && far > ea) || (sgn > 0 && far < ea)) continue;
              BM.quad(Wf.M(far, ya, -0.014), Wf.M(ea, ya, -0.014), Wf.M(eb, yb, -0.014), Wf.M(far, yb, -0.014), mc, null, Wf.N(mid));
            }
          }
        }
      }
    }
  }
}
// A swept moulding along a face: prof [[t, y], ...] (out from the face, up), from s0 to s1, cut into blocks of `blk`
// metres with 5 mm joints (dressed granite reads as stones, not an extrusion); smooth across the profile where `smooth`.
export function moulding(B, Wf, s0, s1, yb, prof, col, o = {}) {
  const blk = o.blk || 0.9, R = rng(o.seed ?? 7);
  const L = s1 - s0, nb = Math.max(1, Math.round(L / blk)), seg = Wf.round ? Math.max(1, Math.ceil((L / nb) / 0.3)) : 1;
  const pn = (k) => { const a = prof[Math.max(0, k - 1)], b = prof[Math.min(prof.length - 1, k + 1)]; const dt = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dt, dy) || 1; return [dy / l, -dt / l]; };   // (t, y) normal of the profile
  for (let i = 0; i < nb; i++) {
    const a = s0 + L * i / nb + 0.0025, b = s0 + L * (i + 1) / nb - 0.0025, c = shade(col, 0.9 + 0.18 * R()), off = [R() * 30, R() * 30, R() * 30];
    for (let q = 0; q < seg; q++) {
      const sa = a + (b - a) * q / seg, sb = a + (b - a) * (q + 1) / seg;
      for (let k = 0; k + 1 < prof.length; k++) {
        const [t0, y0] = prof[k], [t1, y1] = prof[k + 1];
        const n0 = o.smooth ? pn(k) : null, n1 = o.smooth ? pn(k + 1) : null;
        const fl = (() => { const dt = t1 - t0, dy = y1 - y0, l = Math.hypot(dt, dy) || 1; return [dy / l, -dt / l]; })();
        const N = (s, nn) => { const W = Wf.N(s), m = nn || fl; return nrm3([W[0] * m[0], m[1], W[2] * m[0]]); };
        const A = Wf.M(sa, yb + y0, t0), Bq = Wf.M(sb, yb + y0, t0), C = Wf.M(sb, yb + y1, t1), D = Wf.M(sa, yb + y1, t1);
        B.tri(A, Bq, C, N(sa, n0), N(sb, n0), N(sb, n1), c, off); B.tri(A, C, D, N(sa, n0), N(sb, n1), N(sa, n1), c, off);
      }
    }
    // the block's ends (flat caps)
    if (!o.noEnds) for (const s of [a, b]) {
      const d = Wf.round ? null : (s === a ? -1 : 1);
      if (d === null) continue;
      const [eu, ew] = Wf.d, n = [eu * d, 0, ew * d];
      for (let k = 0; k + 1 < prof.length; k++) {
        const [t0, y0] = prof[k], [t1, y1] = prof[k + 1];
        B.tri(Wf.M(s, yb + y0, -0.02), Wf.M(s, yb + y0, t0), Wf.M(s, yb + y1, t1), n, n, n, shade(c, 0.8), off);
        B.tri(Wf.M(s, yb + y0, -0.02), Wf.M(s, yb + y1, t1), Wf.M(s, yb + y1, -0.02), n, n, n, shade(c, 0.8), off);
      }
    }
  }
}
// the voussoirs of a round or pointed head and the jambs' dressings, in granite: a ring of `n` stones round the outline
export function archRing(B, Wf, op, col, o = {}) {
  const c = (op.s0 + op.s1) / 2, hw = (op.s1 - op.s0) / 2, sp = op.y1 - (op.pt ? hw * 1.3 : hw), wd = o.wd ?? 0.26, pr = o.pr ?? 0.035, R = rng(o.seed ?? 3);
  const n = o.n ?? (op.pt ? 11 : 9);
  const pt = (k, rr) => {
    // the outline point at fraction k/n from the left springing over the head, at radius offset rr
    const f = k / n;
    if (op.pt) {
      // two arcs of radius 1.345 hw struck from the springing line (the apex 1.3 hw up), the left from c + (r - hw)
      const r = 1.345 * hw, aA = Math.atan2(1.3 * hw, -(r - hw));
      if (f <= 0.5) { const a = Math.PI + (aA - Math.PI) * (f / 0.5), cc = c + (r - hw); return [cc + Math.cos(a) * (r + rr), sp + Math.sin(a) * (r + rr)]; }
      const a = (Math.PI - aA) * ((1 - f) / 0.5), cc = c - (r - hw);
      return [cc + Math.cos(a) * (r + rr), sp + Math.sin(a) * (r + rr)];
    }
    const a = Math.PI * (1 - f), r = hw + rr;
    return [c + Math.cos(a) * r, sp + Math.sin(a) * r];
  };
  for (let k = 0; k < n; k++) {
    const g = 0.0035, p0 = pt(k + g * n, 0), p1 = pt(k + 1 - g * n, 0), q0 = pt(k + g * n, wd), q1 = pt(k + 1 - g * n, wd);
    const tone = shade(col, 0.88 + 0.2 * R()), off = [R() * 40, R() * 40, R() * 40];
    const F = (p, t) => Wf.M(p[0], p[1], t);
    const nF = Wf.N(c);
    B.quad(F(p0, pr), F(p1, pr), F(q1, pr), F(q0, pr), tone, off, nF);              // the face
    B.quad(F(q0, -0.02), F(q0, pr), F(q1, pr), F(q1, -0.02), shade(tone, 0.85), off);   // its extrados
    // the soffit of the ring (the intrados face, into the reveal)
    const dpt = -(o.rev ?? 0.3);
    B.quad(F(p0, pr), F(p0, dpt), F(p1, dpt), F(p1, pr), shade(tone, 0.8), off);
  }
}
// a reveal (the opening's sides into the wall's depth) and its dark back: the window's glazing or a door's void
export function reveal(B, BG, Wf, op, depth, col, glassCol) {
  const c = (op.s0 + op.s1) / 2, hw = (op.s1 - op.s0) / 2, n = 10;
  const prof = [];
  const sp = op.y1 - (op.arch ? hw : op.pt ? hw * 1.3 : 0);
  prof.push([op.s0, op.y0], [op.s0, sp]);
  if (sp < op.y1) for (let k = 1; k < n; k++) { const y = sp + (op.y1 - sp) * k / n; prof.push([c - openHalf(op, y), y]); }
  prof.push([c, op.y1]);
  if (sp < op.y1) for (let k = n - 1; k >= 1; k--) { const y = sp + (op.y1 - sp) * k / n; prof.push([c + openHalf(op, y), y]); }
  prof.push([op.s1, sp], [op.s1, op.y0]);
  for (let k = 0; k + 1 < prof.length; k++) {
    const [s0, y0] = prof[k], [s1, y1] = prof[k + 1];
    B.quad(Wf.M(s0, y0, 0.0), Wf.M(s1, y1, 0.0), Wf.M(s1, y1, -depth), Wf.M(s0, y0, -depth), col);
  }
  B.quad(Wf.M(op.s0, op.y0, 0.01), Wf.M(op.s1, op.y0, 0.01), Wf.M(op.s1, op.y0, -depth), Wf.M(op.s0, op.y0, -depth), shade(col, 1.1));   // the sill's top
  if (BG) {
    // the glazing at the back, its sashes as a darker cross
    const nB = Wf.N(c), gt = -depth + 0.02;
    for (let k = 0; k + 1 < prof.length; k++) BG.tri(Wf.M(c, (op.y0 + op.y1) / 2, gt), Wf.M(prof[k][0], prof[k][1], gt), Wf.M(prof[k + 1][0], prof[k + 1][1], gt), nB, nB, nB, glassCol);
    BG.tri(Wf.M(c, (op.y0 + op.y1) / 2, gt), Wf.M(prof[prof.length - 1][0], prof[prof.length - 1][1], gt), Wf.M(prof[0][0], prof[0][1], gt), nB, nB, nB, glassCol);
  }
}

// ---- the rock's ground ----------------------------------------------------------------------------------------------
// polygon helpers in the frame
export function polyDist(P, u, w) {
  let d = 1e9, ins = false;
  for (let i = 0, k = P.length - 1; i < P.length; k = i++) {
    const a = P[k], c = P[i], eu = c[0] - a[0], ew = c[1] - a[1], L = eu * eu + ew * ew;
    let t = L > 0 ? ((u - a[0]) * eu + (w - a[1]) * ew) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    d = Math.min(d, Math.hypot(u - a[0] - eu * t, w - a[1] - ew * t));
    if ((a[1] > w) !== (c[1] > w) && u < ((c[0] - a[0]) * (w - a[1])) / (c[1] - a[1]) + a[0]) ins = !ins;
  }
  return ins ? -d : d;   // negative inside
}
// the distance to an open polyline, signed by the side (+ to the left of travel in u, w)
export function lineDist(P, u, w) {
  let d = 1e9, sg = 1;
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], c = P[i + 1], eu = c[0] - a[0], ew = c[1] - a[1], L = eu * eu + ew * ew;
    let t = L > 0 ? ((u - a[0]) * eu + (w - a[1]) * ew) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const du = u - a[0] - eu * t, dw = w - a[1] - ew * t, dd = Math.hypot(du, dw);
    if (dd < d) { d = dd; sg = eu * dw - ew * du >= 0 ? 1 : -1; }
  }
  return d * sg;
}
