// CROWD — photoreal pedestrians for the sim (docs/notes/peds-veh-v2.md). `?crowd=0` restores the procedural mannequins
// (sim/pedmesh.js).
//
// Assets (tools/assets/build_peds.mjs, build_clips.mjs -> public/models/peds24/): 25 CARLA 0.10 bodies (CC-BY 4.0) in 37
// outfit variants, three LODs each, two primitives per LOD (opaque skin/clothes/eyes, alpha-tested hair); textures are
// layers of four KTX2 2D ARRAYS (albedo / normal / orm / hair) and a variant is a slot -> layer table; animation clips are
// per-skeleton float textures of local bone rotations/translations.
//
// Frame pipeline:
//   1. peds.js writes each walker's matrix (+ shirt colour) into the STORAGE mesh and anim hints via setAnim/setAmp.
//   2. update(): per visible walker, advance its clip state (walk <-> idle crossfades, walk played at the speed the sim
//      moves it), and assign it a POSE ROW.
//   3. POSE PASS: one fragment per (bone, walker) walks the bone's parent chain, samples/blends both clips, and writes the
//      3x4 skinning matrix (global x inverse-bind) into three RGBA32F targets (MRT).
//   4. Draw: per (body, LOD) one opaque + one hair InstancedMesh; the vertex shader skins from the pose targets, the
//      fragment shader samples the texture arrays with the walker's per-slot layers and recolours its garments.
import * as THREE from 'three';
import { ENV } from '../world/materials.js';
import { Instancer } from '../city/instancer.js';

const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const BASE = 'models/peds24/';
const MAXI = 1024;                                  // pose rows per skeleton (visible + shadow walkers)
const LODD = (QS.get('crowdlod') || '9,26').split(',').map(Number);
const LOD0_2 = LODD[0] * LODD[0], LOD1_2 = LODD[1] * LODD[1];
const FADE = 0.28;                                   // clip crossfade, seconds
const INST_W = 10;                                   // instance data texels per pose row (see SKIN_VERT_PARS)
// NYC adult heights (hair-top, shoes on): CARLA's bodies stand 1.80-1.86 m, taller than the street; scale to these
const TARGET_H = { m: 1.77, f: 1.65, child: 1.22 };

// ---------------------------------------------------------------- loading
function toFloat(attr) {
  if (!attr || (attr.array instanceof Float32Array && !attr.normalized)) return attr;
  const out = new Float32Array(attr.count * attr.itemSize);
  for (let i = 0; i < attr.count; i++) for (let c = 0; c < attr.itemSize; c++) out[i * attr.itemSize + c] = attr.getComponent(i, c);
  return new THREE.BufferAttribute(out, attr.itemSize);
}

// CLIP HYGIENE (film 7 review, 2026-09-24). Measured per clip: every walk loop wraps with a step no larger than its own
// median frame step (e.g. s_neutral_walk 8.6 vs 8.7 deg), so the joint loops are already seamless and are left alone. What
// is fixed here: the hips' mean horizontal offset is removed so walk / idle crossfades do not slide the body (up to 12.5 cm on s_rushed_walk).
// Layout per row (frame): bone b = texel 2b quaternion xyzw, texel 2b+1 translation xyz + valid flag.
function fixLoop(D, nb, hips, c) {
  if (!c.loop || !(c.frames > 3)) return;
  const F = c.frames, r0 = c.row, W = nb * 8;
  const at = (r, b, t) => r0 * W + r * W + b * 8 + (t ? 4 : 0);
  if (hips >= 0) {   // centre the hips' horizontal path (this skeleton's up axis is z: hip height ~ -1.0)
    let mx = 0, my = 0;
    for (let r = 0; r < F; r++) { const o = at(r, hips, 1); mx += D[o]; my += D[o + 1]; }
    mx /= F; my /= F;
    for (let r = 0; r < F; r++) { const o = at(r, hips, 1); D[o] -= mx; D[o + 1] -= my; }
  }
}
export async function loadCrowd(renderer) {
  const [{ GLTFLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'), import('three/addons/loaders/KTX2Loader.js'), import('three/addons/libs/meshopt_decoder.module.js'),
  ]);
  const t0 = performance.now();
  const manifest = await (await fetch(BASE + 'manifest.json')).json();
  const clipIdx = await (await fetch(BASE + 'clips.json')).json();
  const ktx2 = new KTX2Loader().setTranscoderPath('basis/').detectSupport(renderer);
  const loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  const arrays = {};
  await Promise.all(Object.entries(manifest.arrays).map(async ([k, a]) => {
    if (!a.file) return;
    const t = await ktx2.loadAsync(BASE + a.file);
    t.colorSpace = k === 'albedo' || k === 'hair' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = k === 'albedo' || k === 'hair' ? 8 : 4;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.needsUpdate = true;
    arrays[k] = t;
  }));
  const skel = {};
  for (const [k, S] of Object.entries(manifest.skeletons)) {
    if (!S.parents) continue;
    const buf = await (await fetch(BASE + `clips_${k}.bin`)).arrayBuffer();
    const nb = S.bones.length;
    const rows = buf.byteLength / (nb * 8 * 4);
    const data = new Float32Array(buf);
    const clips = clipIdx.clips.filter((c) => c.skeleton === k);
    const hipsBone = S.bones.findIndex((b) => /hips/i.test(b));
    for (const c of clips) fixLoop(data, nb, hipsBone, c);
    const clipTex = new THREE.DataTexture(data, nb * 2, rows, THREE.RGBAFormat, THREE.FloatType);
    clipTex.needsUpdate = true;
    skel[k] = { name: k, nb, bones: S.bones, parents: S.parents, hips: S.bones.findIndex((b) => /hips/i.test(b)), clipTex, clips, bodies: [] };
  }
  const bodies = {};
  await Promise.all(Object.entries(manifest.bodies).map(async ([name, B]) => {
    try {
      const g = await loader.loadAsync(BASE + B.file);
      g.scene.updateMatrixWorld(true);
      const lods = [];
      for (let li = 0; li < 3; li++) {
        const node = g.scene.getObjectByName('LOD' + li);
        const parts = {};
        if (node) node.traverse((o) => {
          if (!o.isMesh) return;
          const geo = new THREE.BufferGeometry();
          for (const [k, a] of Object.entries(o.geometry.attributes)) geo.setAttribute(k, k === 'skinIndex' ? a : toFloat(a));
          // slot / class / tint part -> ONE vec3 attribute (the vertex shader is at WebGL's 16-attribute limit)
          const sl = geo.getAttribute('_slot'), cl = geo.getAttribute('_cls'), pa = geo.getAttribute('_part');
          if (sl) {
            const meta = new Float32Array(sl.count * 3);
            for (let i = 0; i < sl.count; i++) { meta[i * 3] = sl.getX(i); meta[i * 3 + 1] = cl ? cl.getX(i) : 0; meta[i * 3 + 2] = pa ? pa.getX(i) : 0; }
            geo.setAttribute('aMeta', new THREE.BufferAttribute(meta, 3));
            for (const k of ['_slot', '_cls', '_part']) geo.deleteAttribute(k);
          }
          geo.setIndex(o.geometry.index);
          geo.applyMatrix4(o.matrixWorld);
          geo.computeBoundingSphere();
          parts[o.material.name === 'hair' ? 'hair' : 'opaque'] = geo;
        });
        lods.push(parts);
      }
      bodies[name] = { name, ...B, lods };
    } catch (e) { console.warn('[crowd] body failed', name, e?.message || e); }
  }));
  for (const [name, B] of Object.entries(bodies)) { const S = skel[B.skeleton]; if (S) { B.index = S.bodies.length; S.bodies.push(B); } }
  // body reference texture per skeleton: per bone refT, refR, ibm rows 0..2 (5 texels)
  for (const S of Object.values(skel)) {
    const w = S.nb * 5, h = Math.max(1, S.bodies.length);
    const d = new Float32Array(w * h * 4);
    S.bodies.forEach((B, bi) => {
      for (let b = 0; b < S.nb; b++) {
        const o = (bi * w + b * 5) * 4;
        d[o] = B.refT[b * 3]; d[o + 1] = B.refT[b * 3 + 1]; d[o + 2] = B.refT[b * 3 + 2]; d[o + 3] = 1;
        d[o + 4] = B.refR[b * 4]; d[o + 5] = B.refR[b * 4 + 1]; d[o + 6] = B.refR[b * 4 + 2]; d[o + 7] = B.refR[b * 4 + 3];
        const m = B.ibm.slice(b * 16, b * 16 + 16);   // column-major
        for (let r = 0; r < 3; r++) { d[o + 8 + r * 4] = m[r]; d[o + 9 + r * 4] = m[4 + r]; d[o + 10 + r * 4] = m[8 + r]; d[o + 11 + r * 4] = m[12 + r]; }
      }
    });
    S.bodyTex = new THREE.DataTexture(d, w, h, THREE.RGBAFormat, THREE.FloatType);
    S.bodyTex.needsUpdate = true;
    // hips height per body (for the gait scale)
    for (const B of S.bodies) B.hipsH = Math.hypot(B.refT[S.hips * 3], B.refT[S.hips * 3 + 1], B.refT[S.hips * 3 + 2]);
    S.refHips = (S.bodies.find((B) => B.height > 1.5) || S.bodies[0])?.hipsH || 1;
  }
  const variants = manifest.variants.filter((v) => bodies[v.body]);
  console.log(`[crowd] ${Object.keys(bodies).length} bodies, ${variants.length} variants, arrays ${Object.entries(arrays).map(([k, t]) => `${k}:${t.image?.depth ?? '?'}`).join(' ')}, clips ${clipIdx.clips.length} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  return { manifest, bodies, variants, skel, arrays };
}

// ---------------------------------------------------------------- shaders
const POSE_VS = /* glsl */ `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const POSE_FS = (nb) => /* glsl */ `
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uClips, uBodies, uInst;
uniform int uParent[${nb}];
uniform int uHips;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
vec4 qmul(vec4 a, vec4 b) { return vec4(a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz), a.w * b.w - dot(a.xyz, b.xyz)); }
vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
vec4 nl(vec4 a, vec4 b, float t) { if (dot(a, b) < 0.0) b = -b; return normalize(mix(a, b, t)); }
void clipAt(vec4 c, int b, out vec4 q, out vec3 tr, out float ok) {
  // c = (row0, frames, time, -)
  float f = floor(c.z), a = c.z - f;
  int r0 = int(c.x + mod(f, c.y) + 0.5), r1 = int(c.x + mod(f + 1.0, c.y) + 0.5);
  vec4 q0 = texelFetch(uClips, ivec2(b * 2, r0), 0), q1 = texelFetch(uClips, ivec2(b * 2, r1), 0);
  vec4 t0 = texelFetch(uClips, ivec2(b * 2 + 1, r0), 0), t1 = texelFetch(uClips, ivec2(b * 2 + 1, r1), 0);
  ok = t0.w;
  q = ok > 0.5 ? nl(q0, q1, a) : vec4(0.0, 0.0, 0.0, 1.0);
  tr = mix(t0.xyz, t1.xyz, a);
}
void main() {
  int b = int(gl_FragCoord.x), inst = int(gl_FragCoord.y);
  vec4 iA = texelFetch(uInst, ivec2(0, inst), 0);   // rowA, framesA, timeA, weightB
  vec4 iB = texelFetch(uInst, ivec2(1, inst), 0);   // rowB, framesB, timeB, body
  vec4 iC = texelFetch(uInst, ivec2(2, inst), 0);   // hips scale for clip A, clip B (body hips / clip hips)
  int body = int(iB.w + 0.5);
  int chain[24];
  int n = 0, k = b;
  for (int s = 0; s < 24; s++) { if (k < 0) break; chain[s] = k; n = s + 1; k = uParent[k]; }
  vec4 gq = vec4(0.0, 0.0, 0.0, 1.0);
  vec3 gt = vec3(0.0);
  for (int s = 23; s >= 0; s--) {
    if (s >= n) continue;
    int bb = chain[s];
    vec4 qa, qb; vec3 ta, tb; float va, vb;
    clipAt(vec4(iA.xyz, 0.0), bb, qa, ta, va);
    clipAt(vec4(iB.xyz, 0.0), bb, qb, tb, vb);
    vec4 rT = texelFetch(uBodies, ivec2(bb * 5, body), 0);
    vec4 rR = texelFetch(uBodies, ivec2(bb * 5 + 1, body), 0);
    vec4 la = va > 0.5 ? qa : rR, lb = vb > 0.5 ? qb : rR;
    vec4 lq = nl(la, lb, iA.w);
    vec3 lt = rT.xyz;
    if (bb == uHips) {
      vec3 ha = va > 0.5 ? ta * iC.x : rT.xyz, hb = vb > 0.5 ? tb * iC.y : ha;
      lt = mix(ha, hb, iA.w);
    }
    gt += qrot(gq, lt);
    gq = normalize(qmul(gq, lq));
  }
  // skinning matrix = G * IBM (rows of the 3x4)
  vec3 cx = qrot(gq, vec3(1.0, 0.0, 0.0)), cy = qrot(gq, vec3(0.0, 1.0, 0.0)), cz = qrot(gq, vec3(0.0, 0.0, 1.0));
  mat4 G = mat4(vec4(cx, 0.0), vec4(cy, 0.0), vec4(cz, 0.0), vec4(gt, 1.0));
  vec4 r0 = texelFetch(uBodies, ivec2(b * 5 + 2, body), 0), r1 = texelFetch(uBodies, ivec2(b * 5 + 3, body), 0), r2 = texelFetch(uBodies, ivec2(b * 5 + 4, body), 0);
  mat4 I = mat4(vec4(r0.x, r1.x, r2.x, 0.0), vec4(r0.y, r1.y, r2.y, 0.0), vec4(r0.z, r1.z, r2.z, 0.0), vec4(r0.w, r1.w, r2.w, 1.0));
  mat4 S = G * I;
  o0 = vec4(S[0][0], S[1][0], S[2][0], S[3][0]);
  o1 = vec4(S[0][1], S[1][1], S[2][1], S[3][1]);
  o2 = vec4(S[0][2], S[1][2], S[2][2], S[3][2]);
}
`;

// vertex skinning shared by the colour, depth and id materials
const SKIN_VERT_PARS = /* glsl */ `
uniform sampler2D uPose0, uPose1, uPose2;
attribute float aRow;
attribute vec3 aMeta;          // slot, class (0 skin 1 cloth 2 eye 3 hair), tint part (1 top 2 bottom 3 shoes)
uniform sampler2D uInstData;   // per pose row: texels 0-2 clip state (pose pass), 3-6 slot layers, 7-9 tints
varying float vLayer;
varying float vCls;
varying vec4 vTint;
varying vec2 vUvA;
vec4 crowdRow(sampler2D t, int b, int r) { return texelFetch(t, ivec2(b, r), 0); }
mat4 crowdBone(float fb, int r) {
  int b = int(fb + 0.5);
  vec4 a = crowdRow(uPose0, b, r), c = crowdRow(uPose1, b, r), d = crowdRow(uPose2, b, r);
  return mat4(vec4(a.x, c.x, d.x, 0.0), vec4(a.y, c.y, d.y, 0.0), vec4(a.z, c.z, d.z, 0.0), vec4(a.w, c.w, d.w, 1.0));
}
`;
// PROPS (build_peds.mjs + lib/propfit.mjs): bags / backpacks are part of every body mesh, rigid on one bone, tagged
// _PART = 10 + fit id; a walker's prop mask (instance texel 2 .z) keeps the ones it carries, the rest collapse to a
// point (zero-area triangles) in the colour, depth and id passes alike
const PROP_HIDE = /* glsl */ `
{
  int crowdP = int(aMeta.z + 0.5);
  if (crowdP >= 10) {
    int crowdPM = int(texelFetch(uInstData, ivec2(2, crowdR), 0).z + 0.5);
    if (((crowdPM >> (crowdP - 10)) & 1) == 0) transformed = vec3(0.0);
  }
}
`;
// GROUND TRUTH (perception/segRender.js, film 2026-09-23): segRender draws every labelled object with its own class / id /
// depth shaders; for the crowd those need THIS skinning, or the masks show T-posed bind meshes at each walker's feet.
// PARS declares what the chunk reads, APPLY skins segRender's local position `tp` (and hides props not carried),
// mesh.userData.crowdSkin carries the uniform objects (shared with the crowd's own materials, so they stay live).
export const CROWD_SEG_PARS = 'attribute vec4 skinIndex;\nattribute vec4 skinWeight;\n' + SKIN_VERT_PARS;
export const CROWD_SEG_APPLY = /* glsl */ `
{
  int crowdR = int(aRow + 0.5);
  mat4 crowdS = crowdBone(skinIndex.x, crowdR) * skinWeight.x + crowdBone(skinIndex.y, crowdR) * skinWeight.y
              + crowdBone(skinIndex.z, crowdR) * skinWeight.z + crowdBone(skinIndex.w, crowdR) * skinWeight.w;
  tp = (crowdS * vec4(tp, 1.0)).xyz;
  int crowdP = int(aMeta.z + 0.5);
  if (crowdP >= 10) {
    int crowdPM = int(texelFetch(uInstData, ivec2(2, crowdR), 0).z + 0.5);
    if (((crowdPM >> (crowdP - 10)) & 1) == 0) tp = vec3(0.0);
  }
  int si = int(aMeta.x + 0.5);
  float lay;
  if (si >= 100) lay = float(si - 100);
  else {
    vec4 L = texelFetch(uInstData, ivec2(3 + si / 4, crowdR), 0);
    int c = si - (si / 4) * 4;
    lay = c == 0 ? L.x : c == 1 ? L.y : c == 2 ? L.z : L.w;
  }
  vLayer = lay;
  vUvA = uv;
}
`;
const SKIN_VERT_NORMAL = /* glsl */ `
#include <beginnormal_vertex>
int crowdR = int(aRow + 0.5);
mat4 crowdS = crowdBone(skinIndex.x, crowdR) * skinWeight.x + crowdBone(skinIndex.y, crowdR) * skinWeight.y
            + crowdBone(skinIndex.z, crowdR) * skinWeight.z + crowdBone(skinIndex.w, crowdR) * skinWeight.w;
objectNormal = normalize(mat3(crowdS) * objectNormal);
`;
const SKIN_VERT_POS = /* glsl */ `
#include <begin_vertex>
transformed = (crowdS * vec4(transformed, 1.0)).xyz;
${PROP_HIDE}
{
  int si = int(aMeta.x + 0.5);
  float lay;
  if (si >= 100) lay = float(si - 100);   // a prop: its own fixed layer
  else {
    vec4 L = texelFetch(uInstData, ivec2(3 + si / 4, crowdR), 0);
    int c = si - (si / 4) * 4;
    lay = c == 0 ? L.x : c == 1 ? L.y : c == 2 ? L.z : L.w;
  }
  vLayer = lay;
  vCls = aMeta.y;
  int p = int(aMeta.z + 0.5);
  vTint = p >= 1 && p <= 3 ? texelFetch(uInstData, ivec2(6 + p, crowdR), 0) : vec4(0.0);
  vUvA = uv;
}
`;

const FRAG_PARS = /* glsl */ `
precision highp sampler2DArray;
float crowdSkinK = 0.0;   // set in main() before lighting: 1 on skin pixels (wrapped diffuse below)
uniform sampler2DArray uAlbedo, uNormalA, uOrm, uHairA;
uniform float uCrowdNight;
varying float vLayer;
varying float vCls;
varying vec4 vTint;
varying vec2 vUvA;
vec3 crowdUV() {
  // UDIM: u in [0, 2) -> tile = floor(u) selects the next layer
  float tile = floor(vUvA.x);
  return vec3(vUvA.x - tile, vUvA.y, vLayer + tile);
}
vec3 crowdPerturb(vec3 surf_pos, vec3 surf_norm, vec3 mapN, vec2 uvv) {
  vec3 q0 = dFdx(surf_pos), q1 = dFdy(surf_pos);
  vec2 st0 = dFdx(uvv), st1 = dFdy(uvv);
  vec3 N = surf_norm;
  vec3 q1perp = cross(q1, N), q0perp = cross(N, q0);
  vec3 T = q1perp * st0.x + q0perp * st1.x, B = q1perp * st0.y + q0perp * st1.y;
  float det = max(dot(T, T), dot(B, B));
  float scale = det == 0.0 ? 0.0 : inversesqrt(det);
  return normalize(T * (mapN.x * scale) + B * (mapN.y * scale) + N * mapN.z);
}
`;

function crowdMaterial(kind, arrays, pose, instTex) {
  // kind: 'opaque' | 'hair'
  const hair = kind === 'hair';
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: hair ? 0.5 : 0.6, metalness: 0, side: hair ? THREE.DoubleSide : THREE.FrontSide, alphaTest: hair ? 0.35 : 0, envMapIntensity: 0.6 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPose0 = pose[0]; sh.uniforms.uPose1 = pose[1]; sh.uniforms.uPose2 = pose[2];
    sh.uniforms.uInstData = { value: instTex };
    sh.uniforms.uAlbedo = { value: arrays.albedo || null };
    sh.uniforms.uNormalA = { value: arrays.normal || null };
    sh.uniforms.uOrm = { value: arrays.orm || null };
    sh.uniforms.uHairA = { value: arrays.hair || null };
    sh.uniforms.uCrowdNight = ENV.night;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 skinIndex;\nattribute vec4 skinWeight;\n' + SKIN_VERT_PARS)
      .replace('#include <beginnormal_vertex>', SKIN_VERT_NORMAL)
      .replace('#include <begin_vertex>', SKIN_VERT_POS);
    let fs = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_PARS);
    // SKIN: a wrapped, red-shifted direct diffuse (light bleeds past the terminator the way it scatters through skin),
    // on skin pixels only; every other pixel keeps three's physical model unchanged
    if (!hair) {
      fs = fs.replace('#include <lights_physical_pars_fragment>', THREE.ShaderChunk.lights_physical_pars_fragment.replace(
        'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );',
        `{
          float nlr = dot( geometryNormal, directLight.direction );
          vec3 wrapD = vec3( saturate( ( nlr + 0.42 ) / 1.42 ), saturate( ( nlr + 0.22 ) / 1.22 ), saturate( ( nlr + 0.16 ) / 1.16 ) );
          vec3 irrD = mix( irradiance, wrapD * directLight.color, crowdSkinK );
          reflectedLight.directDiffuse += irrD * BRDF_Lambert( material.diffuseContribution );
        }`));
    }
    if (hair) {
      fs = fs.replace('#include <map_fragment>', `
        vec4 crowdH = texture(uHairA, vec3(vUvA, vLayer));
        diffuseColor.rgb *= crowdH.rgb;
        // thin strands average away in the mips: scale alpha by the sampled mip level so coverage survives distance
        vec2 crowdDx = dFdx(vUvA * 1024.0), crowdDy = dFdy(vUvA * 1024.0);
        float crowdLod = max(0.0, 0.5 * log2(max(dot(crowdDx, crowdDx), dot(crowdDy, crowdDy))));
        diffuseColor.a *= crowdH.a * (1.0 + crowdLod * 0.55);`)
        .replace('#include <alphatest_fragment>', `if (diffuseColor.a < ${m.alphaTest.toFixed(2)}) discard;`);
    } else {
      fs = fs.replace('#include <map_fragment>', `
        vec3 crowdT = crowdUV();
        crowdSkinK = vCls < 0.5 ? 1.0 : 0.0;
        vec3 crowdAlb = texture(uAlbedo, crowdT).rgb;
        // garment recolour: the part's instance tint replaces hue and mean value, the texture keeps its folds. The
        // garment's own local mean (a coarse mip) maps to the tint, so a light garment tinted dark stays dark and
        // a yellow puffer tinted white does not go past a real fabric's albedo (was lum / 0.18 -> albedo 1.2)
        if (vTint.a > 0.0) {
          const vec3 crowdY = vec3(0.2126, 0.7152, 0.0722);
          float lum = dot(crowdAlb, crowdY);
          float mlum = max(dot(textureLod(uAlbedo, crowdT, 6.0).rgb, crowdY), 0.02);
          vec3 rec = min(vTint.rgb * clamp(lum / mlum, 0.25, 2.2), vec3(0.85));
          crowdAlb = mix(crowdAlb, rec, vTint.a);
        }
        diffuseColor.rgb *= crowdAlb;
        // the scene's sun and sky are hot by design (traffic.js vhTrim): same albedo trim as the fleet's trim parts
        diffuseColor.rgb *= mix(0.9, 1.0, uCrowdNight);`)
        .replace('#include <roughnessmap_fragment>', `
        vec3 crowdOrm = texture(uOrm, crowdT).rgb;
        float roughnessFactor = vCls < 0.5 ? mix(0.42, 0.62, crowdOrm.g) : vCls > 1.5 ? 0.08 : clamp(crowdOrm.g, 0.35, 1.0);`)
        .replace('#include <metalnessmap_fragment>', `
        float metalnessFactor = vCls > 0.5 && vCls < 1.5 ? crowdOrm.b * 0.8 : 0.0;`)
        .replace('#include <normal_fragment_maps>', `
        {
          vec3 mapN = texture(uNormalA, crowdT).xyz * 2.0 - 1.0;
          mapN.xy *= vCls < 0.5 ? 0.9 : 1.0;
          normal = crowdPerturb(-vViewPosition, normal, mapN, crowdT.xy);
        }`)
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        {
          float crowdAo = mix(1.0, crowdOrm.r, 0.8);
          reflectedLight.indirectDiffuse *= crowdAo;
          reflectedLight.indirectSpecular *= crowdAo;
          // EYES sit in sockets under the brow and lids: most of the sky they would mirror is occluded (unoccluded, a
          // 4 % reflection of the bright sky washed every iris out to a blank blue-white oval); the sun's glint stays
          if (vCls > 1.5 && vCls < 2.5) { reflectedLight.indirectSpecular *= 0.18; reflectedLight.indirectDiffuse *= 0.7; }
        }`);
    }
    sh.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => 'crowd|' + kind;
  return m;
}

function crowdDepthMaterial(pose, instTex) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPose0 = pose[0]; sh.uniforms.uPose1 = pose[1]; sh.uniforms.uPose2 = pose[2];
    sh.uniforms.uInstData = { value: instTex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 skinIndex;\nattribute vec4 skinWeight;\n' + SKIN_VERT_PARS)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        int crowdR = int(aRow + 0.5);
        mat4 crowdS = crowdBone(skinIndex.x, crowdR) * skinWeight.x + crowdBone(skinIndex.y, crowdR) * skinWeight.y
                    + crowdBone(skinIndex.z, crowdR) * skinWeight.z + crowdBone(skinIndex.w, crowdR) * skinWeight.w;
        transformed = (crowdS * vec4(transformed, 1.0)).xyz;` + PROP_HIDE);
  };
  m.customProgramCacheKey = () => 'crowddepth';
  return m;
}

// flat per-instance colour for world/gt.js + perception (instanceColor = id code), skinned
function crowdIdMaterial(pose, instTex) {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPose0 = pose[0]; sh.uniforms.uPose1 = pose[1]; sh.uniforms.uPose2 = pose[2];
    sh.uniforms.uInstData = { value: instTex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 skinIndex;\nattribute vec4 skinWeight;\n' + SKIN_VERT_PARS)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        int crowdR = int(aRow + 0.5);
        mat4 crowdS = crowdBone(skinIndex.x, crowdR) * skinWeight.x + crowdBone(skinIndex.y, crowdR) * skinWeight.y
                    + crowdBone(skinIndex.z, crowdR) * skinWeight.z + crowdBone(skinIndex.w, crowdR) * skinWeight.w;
        transformed = (crowdS * vec4(transformed, 1.0)).xyz;` + PROP_HIDE);
  };
  m.customProgramCacheKey = () => 'crowdid';
  return m;
}

// ---------------------------------------------------------------- render sets
// WebGL allows 16 vertex attributes: position normal uv skinIndex skinWeight aMeta + instanceMatrix (4) + aRow
// (+ instanceColor in id mode) — everything else per walker lives in the instance data texture
const INST_ATTRS = [['aRow', 1]];
class RenderSet {
  constructor(scene, parts, name, mats, shadow, skinU = null) {
    this.name = name; this.shadow = shadow; this.cap = 0; this.meshes = []; this.k = 0; this.src = new Int32Array(64);
    this._alloc(64);
    for (const [kind, geo] of Object.entries(parts)) {
      if (!geo || (shadow && kind === 'hair')) continue;
      const g = new THREE.BufferGeometry();
      for (const [k, a] of Object.entries(geo.attributes)) g.setAttribute(k, a);
      g.setIndex(geo.index);
      g.boundingSphere = geo.boundingSphere;
      for (const [n] of INST_ATTRS) g.setAttribute(n, this.attrs[n]);
      const mesh = new THREE.InstancedMesh(g, mats[kind], this.cap);
      mesh.instanceMatrix = this.im;
      mesh.name = `${shadow ? 'pedS' : 'ped'}:${name}:${kind}`;
      mesh.count = 0; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false;
      mesh.castShadow = shadow; mesh.receiveShadow = !shadow; mesh.visible = false;
      mesh.customDepthMaterial = mats.depth;
      mesh.userData.crowdMat = mats[kind];
      mesh.userData.crowdSkin = skinU;          // segRender: skinned label materials (CROWD_SEG_*)
      mesh.userData.crowdHair = kind === 'hair';
      scene.add(mesh);
      this.meshes.push(mesh);
    }
  }
  _alloc(cap) {
    const grow = (old, size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size); a.setUsage(THREE.DynamicDrawUsage); if (old) a.array.set(old.array.subarray(0, Math.min(old.array.length, a.array.length))); return a; };
    this.im = grow(this.im, 16);
    this.attrs = this.attrs || {};
    for (const [n, s] of INST_ATTRS) this.attrs[n] = grow(this.attrs[n], s);
    this.ic = this.ic ? grow(this.ic, 3) : null;
    if (this.src && this.src.length < cap) { const n = new Int32Array(cap); n.set(this.src); this.src = n; }
    this.cap = cap;
    for (const m of this.meshes || []) { m.instanceMatrix = this.im; for (const [n] of INST_ATTRS) m.geometry.setAttribute(n, this.attrs[n]); if (m.instanceColor) m.instanceColor = this.ic; }
  }
  begin() { this.k = 0; }
  // copy each drawn instance's code from the storage mesh's instanceColor (segRender writes class / id codes there)
  syncIds(Cs) {
    if (!this.ic) { this.ic = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3); this.ic.setUsage(THREE.DynamicDrawUsage); }
    const a = this.ic.array;
    for (let k = 0; k < this.k; k++) { const i = this.src[k]; if (i < 0) continue; a[k * 3] = Cs[i * 3]; a[k * 3 + 1] = Cs[i * 3 + 1]; a[k * 3 + 2] = Cs[i * 3 + 2]; }
    this.ic.clearUpdateRanges(); this.ic.addUpdateRange(0, this.k * 3); this.ic.needsUpdate = true;
    for (const m of this.meshes) if (m.instanceColor !== this.ic) m.instanceColor = this.ic;
  }
  push(M, row, idCol, si = -1) {
    if (this.k >= this.cap) this._alloc(this.cap * 2);
    const k = this.k++;
    this.src[k] = si;
    this.im.array.set(M, k * 16);
    this.attrs.aRow.array[k] = row;
    if (idCol) {
      if (!this.ic) { this.ic = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3).fill(1), 3); this.ic.setUsage(THREE.DynamicDrawUsage); }
      this.ic.array.set(idCol, k * 3);
    }
  }
  finish(idMat, extMat = false) {
    const k = this.k;
    for (const a of [this.im, ...Object.values(this.attrs)]) { a.clearUpdateRanges(); a.addUpdateRange(0, k * a.itemSize); a.needsUpdate = true; }
    if (idMat && this.ic) { this.ic.clearUpdateRanges(); this.ic.addUpdateRange(0, k * 3); this.ic.needsUpdate = true; }
    for (const m of this.meshes) {
      m.count = k;
      m.visible = !this.shadow && k > 0;
      if (extMat) continue;   // segRender is labelling: it owns material + instanceColor (syncIds)
      if (idMat) { if (m.material !== idMat) m.material = idMat; if (m.instanceColor !== this.ic) m.instanceColor = this.ic; }
      else if (m.material !== m.userData.crowdMat) { m.material = m.userData.crowdMat; m.instanceColor = null; }
    }
  }
}

// ---------------------------------------------------------------- the rig
// WALK STYLES for adult GEN2 bodies (100STYLE retargets + CARLA's own): every walker keeps one style for its life, with
// a matching idle for crosswalk waits. Weights: NYC sidewalk mix (phones and pockets are common, tourists look up).
// 100STYLE is one actor PERFORMING styles: next to street photos proud / strutting / pendulum hands / big steps / elated
// read as theatre, so they stay out of the mix (w 0; the showroom still lists only w > 0).
const STYLES = [
  { w: 40, walk: ['s_neutral_walk', 's_neutral_walk_fast', 's_neutral_walk_slow', 'walk_m'], idle: ['s_neutral_idle', 'idle_a'] },
  { w: 6, walk: ['s_onphoneleft_walk'], idle: ['s_onphoneleft_idle'] },
  { w: 6, walk: ['s_onphoneright_walk'], idle: ['s_onphoneright_idle'] },
  { w: 8, walk: ['s_handsinpockets_walk'], idle: ['s_handsinpockets_idle'] },
  { w: 0, walk: ['s_proud_walk'], idle: ['s_proud_idle', 's_akimbo_idle'] },
  { w: 3, walk: ['s_rushed_walk', 's_neutral_walk_fast'], idle: ['s_rushed_idle'], fast: true },
  { w: 1, walk: ['s_depressed_walk'], idle: ['s_depressed_idle'] },
  { w: 1, walk: ['s_armsbehindback_walk'], idle: ['s_armsbehindback_idle'] },
  { w: 1, walk: ['s_lookup_walk'], idle: ['s_lookup_idle'] },
  { w: 3, walk: ['s_crowdavoidance_walk'], idle: ['s_neutral_idle'] },
  { w: 0, walk: ['s_strutting_walk'], idle: ['s_strutting_idle'] },
  { w: 0, walk: ['s_pendulumhands_walk'], idle: ['s_pendulumhands_idle'] },
  { w: 0, walk: ['s_bigsteps_walk'], idle: ['s_armsfolded_idle'] },
  { w: 1, walk: ['s_armsfolded_walk'], idle: ['s_armsfolded_idle'] },
  { w: 3, walk: ['s_old_walk'], idle: ['s_old_idle'] },
  { w: 0, walk: ['s_elated_walk'], idle: ['s_elated_idle'] },
  { w: 0, heavy: true, walk: ['s_heavyset_walk'], idle: ['s_heavyset_idle'] },
];
const SHOW_STYLES = STYLES.map((s, i) => (s.w > 0 ? i : -1)).filter((i) => i >= 0);
const STYLE_BAG = STYLES.flatMap((s, i) => Array(s.w).fill(i));
const hash = (a, b = 0) => { let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b | 0, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return ((h >>> 0) % 100003) / 100003; };
// NYC trouser / shoe palettes (linear-ish sRGB picks; applied by luminance-preserving recolour)
const BOTTOMS = [[0.10, 0.11, 0.13], [0.05, 0.05, 0.06], [0.16, 0.19, 0.27], [0.28, 0.25, 0.20], [0.20, 0.20, 0.21], [0.33, 0.29, 0.22], [0.09, 0.12, 0.20]];
const SHOES = [[0.04, 0.04, 0.045], [0.75, 0.75, 0.74], [0.18, 0.12, 0.08], [0.30, 0.30, 0.32]];
// showroom outerwear (linear): the sim's NYC mix — black, navy, brown, grey, red, olive, off-white, dark navy
const SHOW_TOPS = [[0.02, 0.02, 0.025], [0.03, 0.04, 0.08], [0.12, 0.09, 0.06], [0.35, 0.35, 0.36], [0.25, 0.03, 0.03], [0.05, 0.07, 0.04], [0.6, 0.6, 0.58], [0.015, 0.02, 0.04]];

export class Crowd {
  constructor(scene, engine, assets, cap = 700) {
    this.scene = scene; this.engine = engine; this.A = assets; this.cap = cap;
    this.timeRef = { value: 0 };
    // STORAGE (peds.js writes here; world/gt.js and perception read here)
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 1.7, 0.3).translate(0, 0.85, 0), new THREE.MeshBasicMaterial(), cap);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    this.mesh.visible = false; this.mesh.castShadow = false; this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.mesh.name = 'crowd:storage';
    this.storeMat = this.mesh.material;
    // per-slot state
    const f = (n = 1) => new Float32Array(cap * n);
    this.st = { phase: f(), speed: f(), amp: f(), seed: f(), gait: new Int16Array(cap).fill(-1), variant: new Int16Array(cap).fill(-1), clipA: new Int16Array(cap).fill(-1), tA: f(), clipB: new Int16Array(cap).fill(-1), tB: f(), w: f(), style: f(4) };
    // variant weights: adults of both genders, a heavier build, children, rare police
    this.pool = [];
    for (let i = 0; i < assets.variants.length; i++) {
      const v = assets.variants[i];
      const w = v.uniform === 'police' ? 1 : v.age === 'child' ? 2 : v.build === 'heavy' ? 4 : 10;
      for (let k = 0; k < w; k++) this.pool.push(i);
    }
    // pose targets + passes per skeleton
    this.passes = {};
    for (const S of Object.values(assets.skel)) {
      const rt = new THREE.WebGLRenderTarget(S.nb, MAXI, { count: 3, type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false });
      const instData = new Float32Array(INST_W * MAXI * 4);
      const instTex = new THREE.DataTexture(instData, INST_W, MAXI, THREE.RGBAFormat, THREE.FloatType);
      instTex.needsUpdate = true;
      const mat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: POSE_VS, fragmentShader: POSE_FS(S.nb),
        uniforms: { uClips: { value: S.clipTex }, uBodies: { value: S.bodyTex }, uInst: { value: instTex }, uParent: { value: S.parents.map((p) => p) }, uHips: { value: S.hips } },
        depthTest: false, depthWrite: false,
      });
      const quad = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)), mat);
      quad.frustumCulled = false;
      const pose = [0, 1, 2].map((i) => ({ value: rt.textures[i] }));
      const mats = { opaque: crowdMaterial('opaque', assets.arrays, pose, instTex), hair: crowdMaterial('hair', assets.arrays, pose, instTex), depth: crowdDepthMaterial(pose, instTex), id: crowdIdMaterial(pose, instTex) };
      const skinU = { uPose0: pose[0], uPose1: pose[1], uPose2: pose[2], uInstData: { value: instTex }, uHairA: { value: assets.arrays.hair || null } };
      this.passes[S.name] = { S, rt, instData, instTex, mat, quad, scene: new THREE.Scene().add(quad), cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), rows: 0, mats, skinU };
    }
    // render sets per (body, LOD) main + shadow
    this.sets = new Map();
    for (const B of Object.values(assets.bodies)) {
      const P = this.passes[B.skeleton];
      if (!P) continue;
      this.sets.set(B.name, {
        main: B.lods.map((parts, li) => new RenderSet(scene, parts, `${B.name}:lod${li}`, P.mats, false, P.skinU)),
        shadow: B.lods.map((parts, li) => new RenderSet(scene, parts, `${B.name}:lod${li}`, P.mats, true)),
      });
    }
    this._shadowMeshes = [];
    for (const s of this.sets.values()) for (const r of s.shadow) this._shadowMeshes.push(...r.meshes);
    engine.addShadowListener?.((phase) => {
      if (phase === 'nearBegin') { const on = Instancer.shadowSets; for (const m of this._shadowMeshes) m.visible = on && m.count > 0; }
      else if (phase === 'nearEnd') { for (const m of this._shadowMeshes) m.visible = false; }
    });
    this._W = { layers: new Float32Array(16), tint: new Float32Array(12) };
    this._M = new Float32Array(16);
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
    this._fr = new THREE.Frustum(); this._pv = new THREE.Matrix4();
    this.stats = { visible: 0, shadow: 0, lod: [0, 0, 0], ms: 0 };
    for (const B of Object.values(assets.bodies)) B.propBits = (B.props || []).reduce((m, id) => m | (1 << id), 0);
    const qp = QS.get('crowdprops');
    this.showProps = qp === 'all' ? 'all' : qp ? qp.split(',').reduce((m, v) => m | (1 << Number(v)), 0) : null;
    // ?crowdshow=1 — LOOK-DEV ROW: every variant stands in a line on the Great Lawn (the fleet showroom's anchor),
    // alternately walking in place and idling. ?crowdshowat=x,z,yawdeg moves the row; ?crowdsp=<m> spacing;
    // ?crowdonly=<i,j,...> variant indices; ?crowdwalk=0|1 forces idle / walk for everyone.
    if (QS.has('crowdshow')) {
      const at = (QS.get('crowdshowat') || '396,215,180').split(',').map(Number);
      const only = QS.get('crowdonly') ? QS.get('crowdonly').split(',').map(Number) : null;
      const list = only || assets.variants.map((_, i) => i);
      this.show = { x: at[0], z: at[1], yaw: ((at[2] ?? 180) * Math.PI) / 180, sp: Number(QS.get('crowdsp') || 1.1), list, walk: QS.get('crowdwalk'), y: null };
      console.log('[crowd] showroom', list.length, 'variants at', at.join(','));
    }
    this.clipsBy = {};
    for (const S of Object.values(assets.skel)) {
      const by = (kind) => S.clips.filter((c) => c.kind === kind);
      this.clipsBy[S.name] = { walk: by('walk'), idle: by('idle'), all: S.clips };
    }
  }
  // ---- the pedmesh.js rig API (peds.js)
  setAnim(idx, phase, rate, amp, skin) {
    if (this.show) return;
    const s = this.st;
    s.phase[idx] = phase; s.speed[idx] = rate / 4.4; s.amp[idx] = amp; s.seed[idx] = skin;
    const v = this.pool[Math.min(this.pool.length - 1, Math.floor(skin * this.pool.length))];
    if (s.variant[idx] !== v) { s.variant[idx] = v; s.clipA[idx] = -1; s.clipB[idx] = -1; s.w[idx] = 0; }
    // walk style: heavier builds walk heavyset, fast walkers hurry, the rest from the NYC mix
    const V = this.A.variants[v], hsd = hash(Math.floor(skin * 1e6), 5);
    s.gait[idx] = V.build === 'heavy' && hsd < 0.4 ? STYLES.length - 1 : s.speed[idx] > 1.62 && hsd < 0.3 ? 5 : STYLE_BAG[Math.floor(hash(Math.floor(skin * 1e6), 9) * STYLE_BAG.length)];
  }
  setAmp(idx, amp) { if (!this.show) this.st.amp[idx] = amp; }
  // PROPS: peds.js outfit bits (4 backpack, 8 bag) -> which fitted backpack / bag (stable per walker); uniformed police and
  // bodies without fits (GEN3 kids) carry none. The look-dev row takes ?crowdprops=all (fit k % 5 on walker k) or a list.
  _propMask(i, V, B) {
    const have = B.propBits || 0;
    if (!have || V.uniform) return 0;
    if (this.showProps) return (this.showProps === 'all' ? (1 << (i % 5)) | (this.st.gait[i] === 1 ? 64 : this.st.gait[i] === 2 ? 32 : 0) : this.showProps) & have;
    const m = this.st.style[i * 4] | 0, h = hash(Math.floor(this.st.seed[i] * 1e6), 21);
    // a phone in the hand the phone-call clips raise to the ear (STYLES 1 = OnPhoneLeft, 2 = OnPhoneRight)
    const g = this.st.gait[i];
    let bits = g === 1 ? 1 << 6 : g === 2 ? 1 << 5 : 0;
    // FILM 7 (2026-09-23): the rushed (5) and depressed (6) gaits pitch the upper spine forward past what the pack's two-bone
    // skin (chest + lower back) follows — on about half the bodies the pack floats behind the shoulders (bshot crowdBackRow
    // with crowdstyle=5 crowdprops=1). Walkers in those gaits carry no backpack until the fits are re-weighted.
    if (m & 4) { if (g !== 5 && g !== 6) bits |= 1 << (h < 0.55 ? 1 : 0); }   // the dark Kanken a little more often than the grey Herschel
    // a phone in the right hand rules out the right-hand bag
    else if (m & 8) bits |= 1 << (V.gender === 'f' ? [g === 2 ? 2 : 4, 2, g === 2 ? 3 : 4, 3] : [3, 2, 3, 2])[Math.floor(h * 4) % 4];
    return bits & have;
  }
  setStyle(idx, mask, bagTone, umbTone) { this.st.style.set([mask, bagTone, umbTone, 0], idx * 4); }
  // perception/segRender.js: while it labels, it owns the draw sets' materials (extMat) and pushes the storage mesh's
  // class / instance codes into the drawn instances (syncIds) right before each label pass
  syncIds() {
    const Cs = this.mesh.instanceColor.array;
    for (const s of this.sets.values()) for (const x of s.main) x.syncIds(Cs);
  }
  // ...and drops them when it exits: left on, the beauty material multiplies every walker by the last class colour
  releaseIds() {
    for (const s of this.sets.values()) for (const x of s.main) for (const m of x.meshes) if (m.material === m.userData.crowdMat) m.instanceColor = null;
  }

  // a clip of the body's own age class (CARLA's "Girl" clips are authored on the child proportions); for walks the one
  // whose natural speed (scaled to this body's legs) is closest to the speed the sim moves it, so the playback rate stays
  // near 1; idles by seed
  _clipFor(skelName, variant, body, walking, seed, speed, gait, styleIdx = -1) {
    const C = this.clipsBy[skelName];
    const force = QS.get('crowdclip');
    if (force) { const fc = C.all.find((x) => x.name === force); if (fc) return fc; }
    const age = variant.age === 'child' || body.height * (variant.scale || 1) < 1.4 ? 'child' : 'adult';
    const pool = walking ? C.walk : C.idle;
    let list = pool.filter((c) => c.age === age);
    const sty = STYLES[styleIdx];
    if (sty && age === 'adult' && skelName === 'gen2') {
      const names = walking ? sty.walk : sty.idle;
      const sl = C.all.filter((c) => names.includes(c.name));
      if (sl.length) list = sl;
    }
    if (!list.length) list = pool;
    if (!list.length) return C.all[0];
    if (!walking) return list[Math.floor(seed * 7.13 * list.length) % list.length];
    let best = list[0], bd = 1e9;
    for (const c of list) { const d = Math.abs(Math.log(Math.max(0.2, speed) / Math.max(0.2, c.speed * gait))); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  update(dt) {
    const t0 = performance.now();
    dt = Math.min(0.1, Math.max(0, dt || 0));
    const A = this.A, st = this.st, cam = this.engine.camera, r = this.engine.renderer;
    let n = this.mesh.count, Ms = this.mesh.instanceMatrix.array, Cs = this.mesh.instanceColor.array;
    if (this.show) {
      const sh = this.show;
      if (sh.y == null) { const g = this.engine.groundAt ? this.engine.groundAt(sh.x, sh.z) : (window.__STREAMER?.surfaceAt?.(sh.x, sh.z)); if (g != null && isFinite(g)) sh.y = g; }
      if (!sh.M) { sh.M = new Float32Array(sh.list.length * 16); sh.C = new Float32Array(sh.list.length * 3); for (let k = 0; k < sh.list.length; k++) sh.C.set(SHOW_TOPS[k % SHOW_TOPS.length], k * 3); }
      n = sh.list.length;
      const rx = Math.cos(sh.yaw), rz = -Math.sin(sh.yaw);
      for (let k = 0; k < n; k++) {
        const t = (k - (n - 1) / 2) * sh.sp;
        const o = k * 16, c = Math.cos(sh.yaw), si = Math.sin(sh.yaw);
        sh.M.set([c, 0, -si, 0, 0, 1, 0, 0, si, 0, c, 0, sh.x + rx * t, (sh.y ?? 0) + 0.005, sh.z + rz * t, 1], o);
        const v = sh.list[k];
        if (this.st.variant[k] !== v) { this.st.variant[k] = v; this.st.clipA[k] = -1; }
        this.st.seed[k] = (v + 0.5) / this.A.variants.length;
        this.st.phase[k] = k * 0.37;
        this.st.speed[k] = 1.35;
        this.st.amp[k] = sh.walk === '1' ? 1 : sh.walk === '0' ? 0 : (k % 2);
        this.st.gait[k] = QS.has('crowdstyle') ? Number(QS.get('crowdstyle')) : SHOW_STYLES[k % SHOW_STYLES.length];
      }
      Ms = sh.M; Cs = sh.C;
      if (sh.y == null) return;
    }
    const idMode = this.mesh.material !== this.storeMat;
    cam.updateMatrixWorld();
    this._pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this._fr.setFromProjectionMatrix(this._pv);
    const planes = this._fr.planes;
    // shadow frustum (near cascade)
    let shPlanes = null;
    const sun = this.engine.sun;
    if (sun && sun.castShadow) {
      sun.shadow.updateMatrices(sun);
      const f2 = this._fr2 || (this._fr2 = new THREE.Frustum()), pv2 = this._pv2 || (this._pv2 = new THREE.Matrix4());
      pv2.multiplyMatrices(sun.shadow.camera.projectionMatrix, sun.shadow.camera.matrixWorldInverse);
      f2.setFromProjectionMatrix(pv2);
      shPlanes = f2.planes;
    }
    for (const P of Object.values(this.passes)) P.rows = 0;
    for (const s of this.sets.values()) { for (const x of s.main) x.begin(); for (const x of s.shadow) x.begin(); }
    const cx = cam.position.x, cz = cam.position.z;
    const W = this._W, M = this._M, idc = [0, 0, 0];
    this.stats.visible = this.stats.shadow = 0; this.stats.lod[0] = this.stats.lod[1] = this.stats.lod[2] = 0;
    const inside = (pl, x, y, z, rad) => { for (let q = 0; q < 6; q++) { const p = pl[q]; if (p.normal.x * x + p.normal.y * y + p.normal.z * z + p.constant < -rad) return false; } return true; };
    for (let i = 0; i < n; i++) {
      const o = i * 16;
      if (Ms[o] === 0 && Ms[o + 5] === 0 && Ms[o + 10] === 0) continue;
      const x = Ms[o + 12], y = Ms[o + 13], z = Ms[o + 14];
      const vis = inside(planes, x, y + 0.9, z, 1.1);
      const shv = shPlanes ? inside(shPlanes, x, y + 0.9, z, 2.0) : false;
      if (!vis && !shv) continue;
      const vi = st.variant[i];
      if (vi < 0) continue;
      const V = A.variants[vi], B = A.bodies[V.body];
      const P = this.passes[B.skeleton];
      if (!P || P.rows >= MAXI) continue;
      const S = P.S;
      // ---- clip state: walk while amp > 0.5, else idle; crossfade FADE seconds
      const walking = st.amp[i] > 0.5;
      const vScale0 = (V.scale || 1) * this._heightScale(V, B, i);
      const want = this._clipFor(B.skeleton, V, B, walking, st.seed[i], st.speed[i], (B.hipsH / S.refHips) * vScale0, st.gait[i]);
      const wantIdx = S.clips.indexOf(want);
      if (st.clipA[i] < 0) { st.clipA[i] = wantIdx; st.tA[i] = (st.phase[i] * 13.7 % 1) * want.frames; st.clipB[i] = wantIdx; st.w[i] = 0; }
      else if (st.clipA[i] !== wantIdx) {
        st.clipB[i] = st.clipA[i]; st.tB[i] = st.tA[i];
        st.clipA[i] = wantIdx; st.tA[i] = walking ? 0 : (st.seed[i] * 97.1 % 1) * want.frames;
        st.w[i] = 1;
      }
      const cA = S.clips[st.clipA[i]], cB = S.clips[st.clipB[i]];
      const vScale = (V.scale || 1) * this._heightScale(V, B, i);
      const gait = (B.hipsH / S.refHips) * vScale;
      // feet stay planted only while the playback rate tracks the walker's speed: clamp widened 1.9 -> 2.3 (film 7 review: a
      // quarter of the walkers were over 1.9 and skated), and peds.js walks 1.05-1.5 m/s now (was 1.15-1.8)
      const rateOf = (c) => (c.kind === 'walk' && c.speed > 0.1 ? Math.min(2.3, Math.max(0.5, st.speed[i] / (c.speed * gait))) : 1);
      st.tA[i] += dt * cA.fps * rateOf(cA);
      st.tB[i] += dt * cB.fps * rateOf(cB);
      st.w[i] = Math.max(0, st.w[i] - dt / FADE);
      // ---- pose row
      const row = P.rows++;
      const d = P.instData, q = row * INST_W * 4;
      d[q] = cA.row; d[q + 1] = cA.frames; d[q + 2] = st.tA[i] % cA.frames; d[q + 3] = st.w[i];
      d[q + 4] = cB.row; d[q + 5] = cB.frames; d[q + 6] = st.tB[i] % cB.frames; d[q + 7] = B.index;
      d[q + 8] = B.hipsH / (cA.hipsH || B.hipsH); d[q + 9] = B.hipsH / (cB.hipsH || B.hipsH); d[q + 10] = this._propMask(i, V, B); d[q + 11] = 0;
      // ---- instance matrix: position + yaw from the sim, uniform scale from the body (never the mannequin's squash)
      const yaw = Math.atan2(Ms[o + 8], Ms[o + 10]);
      const c0 = Math.cos(yaw) * vScale, s0 = Math.sin(yaw) * vScale;
      M[0] = c0; M[1] = 0; M[2] = -s0; M[3] = 0;
      M[4] = 0; M[5] = vScale; M[6] = 0; M[7] = 0;
      M[8] = s0; M[9] = 0; M[10] = c0; M[11] = 0;
      M[12] = x; M[13] = y; M[14] = z; M[15] = 1;
      // ---- per-walker texture layers and garment tints
      W.layers.fill(0);
      for (let k = 0; k < Math.min(16, V.layers.length); k++) W.layers[k] = Math.max(0, V.layers[k]);
      const sd = st.seed[i];
      const tintOn = V.uniform || QS.get('crowdtint') === '0' ? 0 : 1;
      // top: the sim's outerwear colour on ~half the walkers; bottoms/shoes from NYC palettes
      const topK = tintOn * (hash(i, 7) < 0.55 ? 0.85 : 0);
      W.tint[0] = Cs[i * 3]; W.tint[1] = Cs[i * 3 + 1]; W.tint[2] = Cs[i * 3 + 2]; W.tint[3] = topK;
      const bt = BOTTOMS[Math.floor(sd * 7919) % BOTTOMS.length], sh = SHOES[Math.floor(sd * 104729) % SHOES.length];
      const botK = tintOn * (hash(i, 11) < 0.6 ? 0.8 : 0);
      W.tint[4] = bt[0]; W.tint[5] = bt[1]; W.tint[6] = bt[2]; W.tint[7] = botK;
      W.tint[8] = sh[0]; W.tint[9] = sh[1]; W.tint[10] = sh[2]; W.tint[11] = tintOn * (hash(i, 13) < 0.5 ? 0.7 : 0);
      if (idMode) { idc[0] = Cs[i * 3]; idc[1] = Cs[i * 3 + 1]; idc[2] = Cs[i * 3 + 2]; }
      const sets = this.sets.get(B.name);
      const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
      const li = d2 < LOD0_2 ? 0 : d2 < LOD1_2 ? 1 : 2;
      d.set(W.layers, q + 12);
      d.set(W.tint, q + 28);
      if (vis) { sets.main[li].push(M, row, idMode ? idc : null, i); this.stats.visible++; this.stats.lod[li]++; }
      if (shv) { sets.shadow[Math.max(1, li)].push(M, row, null); this.stats.shadow++; }
    }
    for (const [bn, s] of this.sets) {
      const P = this.passes[this.A.bodies[bn].skeleton];
      const id = idMode ? P.mats.id : null;
      for (const x of s.main) x.finish(id, this.extMat);
      for (const x of s.shadow) x.finish(null);
    }
    // ---- pose passes
    const prevRT = r.getRenderTarget(), prevAuto = r.autoClear;
    for (const P of Object.values(this.passes)) {
      if (!P.rows) continue;
      P.instTex.needsUpdate = true;
      // a render target draws with ITS OWN viewport/scissor (WebGLRenderer), not the renderer's
      P.rt.viewport.set(0, 0, P.S.nb, P.rows);
      P.rt.scissor.set(0, 0, P.S.nb, P.rows);
      P.rt.scissorTest = true;
      r.setRenderTarget(P.rt);
      r.autoClear = false;
      r.render(P.scene, P.cam);
    }
    r.autoClear = prevAuto;
    r.setRenderTarget(prevRT);
    this.stats.ms = performance.now() - t0;
  }
  // per-walker height: NYC adult means with a +-4 % spread, from the body's own bind height
  _heightScale(V, B, i) {
    const key = V.age === 'child' ? 'child' : V.gender;
    const target = TARGET_H[key] * (0.96 + 0.08 * hash(i, 3));
    const h = B.height * (V.scale || 1);
    return Math.max(0.7, Math.min(1.1, target / h));
  }
}

export async function createCrowd(scene, engine, cap = 700) {
  const assets = await loadCrowd(engine.renderer);
  if (!assets || !assets.variants.length) return null;
  return new Crowd(scene, engine, assets, cap);
}
