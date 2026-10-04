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
// PL31 (crowdMaterial31): skin / hair / fabric shading, `?pl31=0` restores PV2. SIT31: seven seated loops synthesized at
// load (sim/crowdSit.js) with each walker's own arms from the bake (models/peds24/sit31_arms.json); st.pose / setPose /
// seatOf / fitSeat / moveSlot / sitPoses are the sim's contract (docs/notes/crowd-looks.md). NF31: walkers at the lens
// dissolve instead of being cut open by the near plane. LD31: the LOD from the 3D distance.
import * as THREE from 'three';
import { ENV } from '../world/materials.js';
import { Instancer } from '../city/instancer.js';
import { sweepOut } from '../core/shadowSweep.js';   // SV29
import { synthSitClips, ARM_SLOTS, TABLE31, sitKeyW } from './crowdSit.js';   // SIT31, SIT32
import { makeCrowdProps } from './crowdProps.js';   // SIT32

const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const BASE = 'models/peds24/';
const MAXI = 1024;                                  // pose rows per skeleton (visible + shadow walkers)
const LODD = (QS.get('crowdlod') || '9,26').split(',').map(Number);
// FP37 (core/engine.js, the film policy): while recording, a walker's level changes only where it is a few pixels tall (LOD0
// within 45 m, LOD1 within 140 m at least), so no level switch shows in a take (the film's crowdlod=20,60 switched at 20 m)
if (QS.get('record') === '1' && QS.get('fp37') !== '0') { LODD[0] = Math.max(LODD[0], 45); LODD[1] = Math.max(LODD[1], 140); }
const LOD0_2 = LODD[0] * LODD[0], LOD1_2 = LODD[1] * LODD[1];
const FADE = 0.28;                                   // clip crossfade, seconds
// PL31 (owner 2026-09-28: "The people look rather low quality and undetailed"; notes docs/notes/crowd-looks.md): skin,
// hair and fabric shading. `?pl31=0` restores the PV2 materials; `?crowdab=1` builds both looks so a harness can switch
// them live on the same frozen walkers (window.__CROWD.setLook(0 | 1)).
const PL31 = QS.get('pl31') !== '0';
const CROWD_AB = QS.get('crowdab') === '1';
// SIT31 (Bryant Park: "no sitting people on chairs"; round 2: "arms on tables", "upper arms clipping into chests"): seven
// seated clips synthesized at load for the GEN2 skeleton from an idle frame (crowdSit.js synthSitClips), and per walker
// its own arms as override rows (the bake). `?sit31=0` leaves them out and st.pose is ignored.
const SIT31 = QS.get('sit31') !== '0';
// SIT32 (owner 2026-09-29, after teaser 3 and film 14: "fix the seated people poses more for people with tables in front of
// them etc. need more details"): six more table loops with motion (talking, eating, reading, a laptop, leaning back with
// an arm over the chair, legs crossed) and a sip for the cup pose, each body's second arm pose blended in on the loop's
// schedule (crowdSit.js sitKeyW); props in the hands and on the top (crowdProps.js); gaze toward a point or another
// walker (setGaze / setLookAt), shared over the upper spine, neck and head. `?sit32=0` restores SIT31's seven poses.
const SIT32 = SIT31 && QS.get('sit32') !== '0';
const FADE_SIT = 0.9;                                // standing <-> seated blend, seconds (the hips travel ~0.5 m)
// ?crowdcheck=N: every N frames, the pose rows read back and every drawn walker's bone matrices checked (Crowd._checkPose)
const CROWD_CHECK = Number(QS.get('crowdcheck') || 0);
// NF31 (the park's 42nd St stills st42_a3 / st42_a4, 2026-09-28: "an exploded walker", eyeballs, rows of teeth, hair cards
// and a stretched face in front of the lens). Not a skinning fault: tools/assets/crowd_skinqa.mjs --all skins every body in
// every clip, the seated clips and their crossfades, at every LOD, and no vertex lands further than 0.43 m from its bone
// (a long skirt between the legs in a wide stride). Those were faces 0.4-0.6 m from the lens (an eyeball there is 50 px
// across at fov 55, 0.5 m away) and the camera's near plane, 0.4 m (core/engine.js), cut the front of the head away: what
// showed is what a face covers. The camera stood on the walking line of the 42nd St sidewalk and walkers walked into it.
// A walker whose surface comes within NF_W of the near plane now dissolves (a per-pixel dither) and is gone, not drawn,
// once it reaches it; its shadow stays. The surface is a head sphere and a body box (update()) that stand ~2.5 cm proud
// of a real face, so a face straight ahead dissolves between 0.63 and 0.55 m from the eyes and its nose tip is still
// 2.5 cm short of the plane when it goes. A first version began 17 cm further out and a face 0.6 m away, uncut, was
// already 97 % gone (shots/crowd31/repro_lens_70_60cm_nf31.jpg). Toward the corners of a 55 deg frame the plane cuts
// points up to 0.58 m away, so a shoulder at the frame edge can still show a cut while it dithers. `?nf31=0` draws
// walkers as before.
const NF31 = QS.get('nf31') !== '0';
const NF32 = NF31 && QS.get('nf32') !== '0';   // NF32: carried backpacks and bags in the near-fade volume (`?nf32=0`: the NF31 volume)
const NF_W = 0.08;
// LD31: the LOD distance was the HORIZONTAL distance from the lens, so from an aerial lens every walker and seated
// person in a wide circle below it drew at LOD0 (the park worker measured Bryant Park's seated people at up to +14.4 M
// triangles and +364 draws in the t2Aerial view, 46-56 m up). It is the 3D distance to the walker's middle (0.9 m over
// its feet) now. `?ld31=0` restores the horizontal distance; window.__CROWD.lod3d switches it live.
const LD31 = QS.get('ld31') !== '0';
const INST_W = 12;                                   // instance data texels per pose row (see SKIN_VERT_PARS; 10 = SIT31 arm rows and SIT32 key weights, 11 = SIT32 gaze)
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
  // SIT31: each GEN2 body's arms per seated pose, solved offline (tools/assets/crowd_sitqa.mjs --write)
  const sitBakeP = SIT31 ? fetch(BASE + 'sit31_arms.json').then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
  // RB27 (tools/assets/build_rocketbox.mjs): Microsoft Rocketbox avatars (MIT) re-bound to the GEN2 skeleton, so they play
  // the same clips; they carry their own texture arrays (arraysX[set]). `?rb27=0` leaves them out.
  const extra = QS.get('rb27') === '0' ? null : await fetch(BASE + 'rb27/manifest.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const ktx2 = (await import('../city/mat/ktx2.js')).ktx2Loader(renderer);   // the app's one KTX2 loader (MATS 06:15)
  const loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  const arrays = {}, arraysX = {};
  const loadArrays = (list, into) => Promise.all(Object.entries(list).map(async ([k, a]) => {
    if (!a.file) return;
    const t = await ktx2.loadAsync(BASE + a.file);
    t.colorSpace = k === 'albedo' || k === 'hair' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = k === 'albedo' || k === 'hair' ? 8 : 4;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.needsUpdate = true;
    into[k] = t;
  }));
  await Promise.all([loadArrays(manifest.arrays, arrays), extra ? loadArrays(extra.arrays, (arraysX[extra.set || 'rb27'] = {})) : null]);
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
    skel[k] = { name: k, nb, bones: S.bones, parents: S.parents, hips: S.bones.findIndex((b) => /hips/i.test(b)), clipTex, clipData: data, clips, bodies: [] };
  }
  const bodies = {};
  const loadBody = async ([name, B]) => {
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
      return { name, ...B, lods };
    } catch (e) { console.warn('[crowd] body failed', name, e?.message || e); return null; }
  };
  // the rb27 bodies load alongside but join after the CARLA ones, which keep their skeleton rows and S.refHips
  const extraBodies = extra ? Promise.all(Object.entries(extra.bodies).map(loadBody)) : null;
  await Promise.all(Object.entries(manifest.bodies).map(async (e) => { const b = await loadBody(e); if (b) bodies[b.name] = b; }));
  if (extraBodies) for (const b of await extraBodies) if (b) bodies[b.name] = b;
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
    if (SIT31 && S.name === 'gen2') {
      try {
        const bake = sitBakeP ? await sitBakeP : null;
        const t1 = performance.now(), r = synthSitClips(S, null, bake, { sit32: SIT32 });
        let nb = 0;
        if (bake && bake.bodies) for (const B of S.bodies) { const e = bake.bodies[B.name]; if (e) { B.sitBake = e; nb++; } }
        S.sitScales = bake ? bake.scales : null;
        if (r) {
          S.clipData = r.data;
          S.clipTex = new THREE.DataTexture(r.data, S.nb * 2, r.data.length / (S.nb * 8), THREE.RGBAFormat, THREE.FloatType);
          S.clipTex.needsUpdate = true;
          S.clips.push(...r.clips);
          const up = r.clips[0].seat.filter(Boolean).map((v) => v[0]);
          console.log(`[crowd] SIT31: ${r.clips.map((c) => c.name).join(', ')} from ${r.ref} in ${(performance.now() - t1).toFixed(0)} ms (seat ${Math.min(...up).toFixed(2)}-${Math.max(...up).toFixed(2)} model m), baked arms for ${nb} of ${S.bodies.length} bodies`);
        }
      } catch (e) { console.warn('[crowd] SIT31 synthesis failed', e?.message || e); }
    }
  }
  const variants = [...manifest.variants, ...(extra ? extra.variants : [])].filter((v) => bodies[v.body]);
  console.log(`[crowd] ${Object.keys(bodies).length} bodies, ${variants.length} variants${extra ? ` (rb27 ${extra.variants.length})` : ''}, arrays ${Object.entries(arrays).map(([k, t]) => `${k}:${t.image?.depth ?? '?'}`).join(' ')}, clips ${clipIdx.clips.length} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  return { manifest, bodies, variants, skel, arrays, arraysX };
}

// ---------------------------------------------------------------- shaders
const POSE_VS = /* glsl */ `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const POSE_FS = (nb) => /* glsl */ `
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uClips, uBodies, uInst, uArm;
uniform int uParent[${nb}];
uniform int uArmSlot[${nb}];   // SIT31: bone -> its slot in a walker's arm row (crowdSit.js ARM_SLOTS), -1 none
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
  vec4 iD = texelFetch(uInst, ivec2(10, inst), 0);   // SIT31: this walker's arm row + 1 (0 none) for clip A, clip B; SIT32: their key-1 weights (< 0: none)
  vec4 iE = texelFetch(uInst, ivec2(11, inst), 0);   // SIT32: gaze yaw, pitch (walker frame, radians)
  int armA = int(iD.x + 0.5) - 1, armB = int(iD.y + 0.5) - 1;
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
    int sl = uArmSlot[bb];
    if (sl >= 0) {   // w = 2 marks a slot that keeps the clip's rotation
      // SIT32: a row with a key 1 (the next row) blends the two by the loop's weight; a w = 2 slot stands for the clip's
      if (armA >= 0) { vec4 ov = texelFetch(uArm, ivec2(sl, armA), 0); if (iD.z >= 0.0) { vec4 ov1 = texelFetch(uArm, ivec2(sl, armA + 1), 0); la = nl(ov.w < 1.5 ? ov : la, ov1.w < 1.5 ? ov1 : la, iD.z); } else if (ov.w < 1.5) la = ov; }
      if (armB >= 0) { vec4 ov = texelFetch(uArm, ivec2(sl, armB), 0); if (iD.w >= 0.0) { vec4 ov1 = texelFetch(uArm, ivec2(sl, armB + 1), 0); lb = nl(ov.w < 1.5 ? ov : lb, ov1.w < 1.5 ? ov1 : lb, iD.w); } else if (ov.w < 1.5) lb = ov; }
    }
    vec4 lq = nl(la, lb, iA.w);
    // SIT32 GAZE: a turn about the walker's vertical and a nod about its lateral axis, in its model frame, shared out as
    // upper spine 20 / neck 35 / head 45 % of the yaw and neck 40 / head 60 % of the pitch (sl 8-10: ARM_SLOTS spine01,
    // neck, head); each bone's share is put on top of its parent's global rotation, so the head ends up turned by all of it
    if (sl >= 8 && (iE.x != 0.0 || iE.y != 0.0)) {
      float gy = iE.x * (sl == 8 ? 0.2 : sl == 9 ? 0.35 : 0.45), gp = iE.y * (sl == 8 ? 0.0 : sl == 9 ? 0.4 : 0.6);
      vec4 R = qmul(vec4(0.0, sin(0.5 * gy), 0.0, cos(0.5 * gy)), vec4(sin(-0.5 * gp), 0.0, 0.0, cos(-0.5 * gp)));
      lq = normalize(qmul(qmul(vec4(-gq.xyz, gq.w), R), qmul(gq, lq)));
    }
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
uniform sampler2D uInstData;   // per pose row: texels 0-2 clip state (pose pass; 2 .w the NF31 fade), 3-6 slot layers, 7-9 tints, 10 SIT31 arms
varying float vLayer;
varying float vCls;
varying vec4 vTint;
varying vec2 vUvA;
varying float vCrowdFade;
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
  vCrowdFade = texelFetch(uInstData, ivec2(2, crowdR), 0).w;
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
varying float vCrowdFade;
uniform float uCrowdFadeF, uCrowdFadeD;
// NF31: a walker at the lens dissolves through interleaved gradient noise (a new pattern per accumulated sample in record
// mode, so the film's accumulation resolves it to a smooth fade)
bool crowdFaded() {
  if (vCrowdFade <= 0.0) return false;
  vec2 p = gl_FragCoord.xy + 5.588238 * mod(uCrowdFadeF, 64.0) * uCrowdFadeD;
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))) < vCrowdFade;
}
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

function crowdMaterial(kind, arrays, pose, instTex, look = PL31 ? 1 : 0, fab0 = false) {
  if (look) return crowdMaterial31(kind, arrays, pose, instTex, fab0);
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
    sh.uniforms.uCrowdFadeF = CROWD_U.frame; sh.uniforms.uCrowdFadeD = CROWD_U.dith;   // NF31
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
    sh.fragmentShader = fs.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if (crowdFaded()) discard;   // NF31');
  };
  m.customProgramCacheKey = () => 'crowd|' + kind;
  return m;
}

// ---------------------------------------------------------------- PL31 looks
// What the film frame showed (shots/ad/clips/fStreetLife frame 60, the nearest walker at ~2.6 m): skin and hair with a
// plastic sheen, the hair a shiny shell, a knit sweater covered in a grid of glints. Measured causes and the fixes below:
//  - FABRIC ROUGHNESS: CARLA's cloth ORM greens run down to 0 (UV padding, but also real texels: the knit of layer 56 sits
//    at 0.36 with a stitch pattern), and the PV2 clamp let them shade at 0.35 — satin. Tops and bottoms (tint parts 1-2;
//    every RB27 garment, which carries no part tags) now map G to 0.62-1.0; shoes, belts, bags and hats keep G >= 0.35
//    (leather is glossy). Woven and knit fabric also gets a Charlie sheen lobe (three's sheen, per pixel): the soft rim
//    a fibre surface shows at grazing light, which a plain GGX lobe does not have.
//  - TOKSVIG: the normal arrays' mips are box-filtered without renormalising (mean length of the knit layer 56: 1.000 at
//    mip 0, 0.932 at mip 3, 0.901 at mip 5), so a minified bumpy texel returns a SHORT normal. Its missing length is the
//    bump variance the mip averaged away; it is folded back into the roughness, so a knit, a twill or a cheek stays as
//    rough at 20 m as at 2 m instead of going smooth and shiny as its mips flatten.
//  - SKIN: F0 0.028 (skin's IOR 1.4) instead of three's 0.04, GGX roughness 0.50-0.68 from the skin ORM (was 0.42-0.62),
//    the direct highlight occluded in creases by the baked AO, and the wrapped diffuse lit per channel from progressively
//    sharper normals (red from the vertex normal blended 35 % toward the detail normal, green 80 %, blue the detail
//    normal): light scattered under the skin blurs red detail most, which is what separates skin from painted plastic.
//  - HAIR: the cards were lit as a GGX surface: a smooth normal field over the whole hairdo, one broad highlight and the
//    sky mirrored at grazing angles — a shell. Now two Kajiya-Kay strand lobes (Scheuermann's shifted tangents: a white
//    primary and a broader secondary tinted by the hair colour) along a strand direction taken from gravity (hair falls
//    down and back over the head: the direction projected on the card), shifted and scaled per strand by the texel's
//    coverage (and luminance) against its local mean, and faded out on the crown, where that projection is short and
//    says nothing about how the strands part (lit as one lobe, backlit crowns read as grey hair at 4 m: crown sRGB
//    143 against PV2's 81-101); the diffuse is a softly wrapped strand term; the sky reflection keeps 30 %. CARLA's cards run
//    their strands along V, but RB27's hair is an atlas of pieces at every angle, so a UV tangent would be wrong for half
//    the crowd. In record mode with accumulation (the film) the alpha-test threshold is dithered per sample, so strand
//    tips and the silhouette resolve to partial coverage instead of a cut-out edge; live frames keep the fixed 0.35.
//  - CONTACT: shoes and ankles take 60 % of the sky at the ground, rising to all of it by 0.32 m (the ground hides the
//    lower sky from them); the sun's contact comes from the shadow map as before.
const CROWD_U = { dith: { value: 0 }, frame: { value: 0 } };
const SKIN_VERT_PARS31 = /* glsl */ `
varying float vPart;
varying float vFootH;
#ifdef CROWD_HAIR
varying vec3 vHairG;
#endif
`;
const SKIN_VERT_POS31 = /* glsl */ `
vPart = aMeta.z;
vFootH = transformed.y;   // skinned height over the instance origin (the feet), model metres
#ifdef CROWD_HAIR
{
  // hair falls down and a little toward the back of the head (the walker's heading from the instance matrix)
  vec3 crowdFw = vec3(instanceMatrix[2].x, 0.0, instanceMatrix[2].z);
  crowdFw = dot(crowdFw, crowdFw) > 1e-8 ? normalize(crowdFw) : vec3(0.0, 0.0, 1.0);
  vHairG = normalize(mat3(viewMatrix) * (vec3(0.0, -1.0, 0.0) - 0.35 * crowdFw));
}
#endif
`;
const FRAG_PARS31 = /* glsl */ `
uniform float uCrowdDith, uCrowdFrame;
varying float vPart;
varying float vFootH;
#ifdef CROWD_HAIR
varying vec3 vHairG;
#endif
vec3 crowdGeoN = vec3(0.0, 0.0, 1.0);   // the interpolated vertex normal (skin's red channel lights from it)
float crowdSpecOcc = 1.0;             // skin: crease occlusion of the direct highlight
vec3 crowdSheenC = vec3(0.0);          // fabric sheen colour (0 elsewhere)
vec3 crowdHairT = vec3(0.0, 1.0, 0.0); // hair: strand direction, view space
float crowdHairV = 0.0;               // hair: strand-to-strand variation, -1..1
float crowdHairK = 1.0;               // hair: how well gravity gives the strand direction here (0 on the crown)
float crowdIGN(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;
let _pl31Warned = false;
function swap31(src, a, b) {
  if (src.includes(a)) return src.replace(a, b);
  if (!_pl31Warned) { _pl31Warned = true; console.warn('[crowd] PL31: shader anchor not found, stock lighting kept:', a.slice(0, 80)); }
  return src;
}
function crowdMaterial31(kind, arrays, pose, instTex, fab0) {
  const hair = kind === 'hair';
  const m = hair
    ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.35, envMapIntensity: 0.6 })
    : new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, side: THREE.FrontSide, envMapIntensity: 0.6, sheen: 1, sheenRoughness: 0.55, sheenColor: 0xffffff });
  // merged, not replaced: the constructors put STANDARD / PHYSICAL here, and three gates the IBL diffuse on STANDARD
  Object.assign(m.defines || (m.defines = {}), hair ? { CROWD_HAIR: '' } : fab0 ? { CROWD_FAB0: '' } : {});
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPose0 = pose[0]; sh.uniforms.uPose1 = pose[1]; sh.uniforms.uPose2 = pose[2];
    sh.uniforms.uInstData = { value: instTex };
    sh.uniforms.uAlbedo = { value: arrays.albedo || null };
    sh.uniforms.uNormalA = { value: arrays.normal || null };
    sh.uniforms.uOrm = { value: arrays.orm || null };
    sh.uniforms.uHairA = { value: arrays.hair || null };
    sh.uniforms.uCrowdNight = ENV.night;
    sh.uniforms.uCrowdFadeF = CROWD_U.frame; sh.uniforms.uCrowdFadeD = CROWD_U.dith;   // NF31
    sh.uniforms.uCrowdDith = CROWD_U.dith;
    sh.uniforms.uCrowdFrame = CROWD_U.frame;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 skinIndex;\nattribute vec4 skinWeight;\n' + SKIN_VERT_PARS + SKIN_VERT_PARS31)
      .replace('#include <beginnormal_vertex>', SKIN_VERT_NORMAL)
      .replace('#include <begin_vertex>', SKIN_VERT_POS + SKIN_VERT_POS31);
    let fs = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_PARS + FRAG_PARS31);
    const L = THREE.ShaderChunk.lights_physical_pars_fragment;
    const SPEC = 'reflectedLight.directSpecular += irradiance * BRDF_GGX_Multiscatter( directLight.direction, geometryViewDir, geometryNormal, material );';
    const DIFF = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );';
    if (hair) {
      fs = fs.replace('#include <lights_physical_pars_fragment>', swap31(swap31(L, SPEC, `{
          // two Kajiya-Kay lobes along the strand (Scheuermann 2004): sin(T, H)^44 white primary, sin(T, H)^20 secondary
          // tinted by the hair; the tangents are tilted toward the normal by a per-strand amount, so neighbouring strands
          // catch the light at slightly different heights instead of one band across the whole hairdo
          vec3 crowdHv = normalize( directLight.direction + geometryViewDir );
          float crowdNL = dot( geometryNormal, directLight.direction );
          float crowdSh = crowdHairV * 0.06;
          vec3 crowdT1 = normalize( crowdHairT + geometryNormal * ( 0.06 + crowdSh ) );
          vec3 crowdT2 = normalize( crowdHairT + geometryNormal * ( crowdSh - 0.1 ) );
          float crowdC1 = dot( crowdT1, crowdHv ), crowdC2 = dot( crowdT2, crowdHv );
          float crowdS1 = pow( max( 1.0 - crowdC1 * crowdC1, 0.0 ), 22.0 );
          float crowdS2 = pow( max( 1.0 - crowdC2 * crowdC2, 0.0 ), 10.0 );
          float crowdVis = saturate( crowdNL * 1.4 + 0.3 );
          float crowdStr = crowdHairK * ( 0.3 + 0.7 * saturate( 0.5 + 0.5 * crowdHairV ) );   // strand centres catch it, edges less
          // the white primary at half strength on black hair (a narrow lobe on low-res cards reads as blotchy grey streaks on
          // black: owner review 2026-09-28), full from mid-brown up; the secondary carries the hair's own colour
          float crowdHk = mix( 0.5, 1.0, saturate( dot( material.diffuseColor, vec3( 0.2126, 0.7152, 0.0722 ) ) / 0.12 ) );
          reflectedLight.directSpecular += directLight.color * crowdVis * crowdStr * ( vec3( 0.03 * crowdHk ) * crowdS1 + material.diffuseColor * 0.4 * crowdS2 );
        }`), DIFF, `{
          // a volume of fibres: the terminator is soft, and a strand lit across its length scatters more than one lit along it
          float crowdNL2 = dot( geometryNormal, directLight.direction );
          float crowdTL = dot( crowdHairT, directLight.direction );
          float crowdKd = sqrt( max( 0.0, 1.0 - crowdTL * crowdTL ) );
          reflectedLight.directDiffuse += directLight.color * saturate( ( crowdNL2 + 0.55 ) / 1.55 ) * mix( 0.65, 1.0, crowdKd ) * BRDF_Lambert( material.diffuseContribution );
        }`));
      fs = fs.replace('#include <map_fragment>', `
        vec4 crowdH = texture(uHairA, vec3(vUvA, vLayer));
        diffuseColor.rgb *= crowdH.rgb;
        {
          const vec3 crowdY = vec3(0.2126, 0.7152, 0.0722);
          // strand structure from the coverage (a strand's centre against the local mean of its mip 5) and, where the hair
          // is not black, from its luminance too: black hair (CARLA's dreadlocks are RGB 0) has no luminance variation at all
          vec4 crowdHm4 = textureLod(uHairA, vec3(vUvA, vLayer), 5.0);
          float crowdHl = dot(crowdH.rgb, crowdY), crowdHm = dot(crowdHm4.rgb, crowdY);
          float crowdAv = clamp(crowdH.a / max(crowdHm4.a, 0.05) - 1.0, -1.0, 1.0);
          crowdHairV = clamp(0.7 * crowdAv + (crowdHm > 0.01 ? 0.5 * (crowdHl / crowdHm - 1.0) : 0.0), -1.0, 1.0);
        }
        // thin strands average away in the mips: scale alpha by the sampled mip level so coverage survives distance
        vec2 crowdDx = dFdx(vUvA * 1024.0), crowdDy = dFdy(vUvA * 1024.0);
        float crowdLod = max(0.0, 0.5 * log2(max(dot(crowdDx, crowdDx), dot(crowdDy, crowdDy))));
        diffuseColor.a *= crowdH.a * (1.0 + crowdLod * 0.55);`)
        .replace('#include <alphatest_fragment>', `{
          float crowdTh = ${m.alphaTest.toFixed(2)} + (crowdIGN(gl_FragCoord.xy + 5.588238 * mod(uCrowdFrame, 64.0)) - 0.5) * 0.3 * uCrowdDith;
          if (diffuseColor.a < crowdTh) discard;
        }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 crowdG = normalize(vHairG);
          vec3 crowdTt = crowdG - normal * dot(normal, crowdG);
          float crowdTl = length(crowdTt);
          crowdHairT = crowdTl > 1e-3 ? crowdTt / crowdTl : vec3(0.0, 1.0, 0.0);
          // on cards facing up (the crown) gravity says little about the strands, which part and swirl from the whorl: the
          // projection shrinks to 0.33 there, and the strand lobes fade out instead of lighting the crown as one grey cap
          // (the backlit look-dev row: crown luma 143 against PV2's 81-101, read as grey hair at 4 m)
          crowdHairK = smoothstep(0.45, 0.85, crowdTl);
        }`)
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        // strands scatter the sky instead of mirroring it (the cards' IBL reflection was the shell), and the inner strands
        // see less of it
        reflectedLight.indirectSpecular *= 0.3;
        reflectedLight.indirectDiffuse *= 0.85;`);
    } else {
      fs = fs.replace('#include <lights_physical_pars_fragment>', swap31(swap31(L, SPEC,
        'reflectedLight.directSpecular += irradiance * BRDF_GGX_Multiscatter( directLight.direction, geometryViewDir, geometryNormal, material ) * crowdSpecOcc;'), DIFF, `{
          // SKIN: wrapped, red-shifted direct diffuse (light bleeds past the terminator the way it scatters through skin), each
          // channel from its own normal: red from the vertex normal blended 35 % toward the detail normal, green 80 %, blue the
          // detail normal. Other pixels keep three's physical model.
          vec3 crowdL = directLight.direction;
          float crowdNr = dot( normalize( mix( crowdGeoN, geometryNormal, 0.35 ) ), crowdL );
          float crowdNg = dot( normalize( mix( crowdGeoN, geometryNormal, 0.8 ) ), crowdL );
          float crowdNb = dot( geometryNormal, crowdL );
          vec3 wrapD = vec3( saturate( ( crowdNr + 0.42 ) / 1.42 ), saturate( ( crowdNg + 0.22 ) / 1.22 ), saturate( ( crowdNb + 0.16 ) / 1.16 ) );
          vec3 irrD = mix( irradiance, wrapD * directLight.color, crowdSkinK );
          reflectedLight.directDiffuse += irrD * BRDF_Lambert( material.diffuseContribution );
        }`));
      fs = fs.replace('#include <map_fragment>', `
        vec3 crowdT = crowdUV();
        crowdSkinK = vCls < 0.5 ? 1.0 : 0.0;
        vec3 crowdAlb = texture(uAlbedo, crowdT).rgb;
        if (vTint.a > 0.0) {
          const vec3 crowdY = vec3(0.2126, 0.7152, 0.0722);
          float lum = dot(crowdAlb, crowdY);
          float mlum = max(dot(textureLod(uAlbedo, crowdT, 6.0).rgb, crowdY), 0.02);
          vec3 rec = min(vTint.rgb * clamp(lum / mlum, 0.25, 2.2), vec3(0.85));
          crowdAlb = mix(crowdAlb, rec, vTint.a);
        }
        diffuseColor.rgb *= crowdAlb;
        diffuseColor.rgb *= mix(0.9, 1.0, uCrowdNight);
        // woven / knit fabric: tops and bottoms (every garment of a set without part tags)
        #ifdef CROWD_FAB0
        float crowdFab = vCls > 0.5 && vCls < 1.5 && vPart < 9.5 ? 1.0 : 0.0;
        #else
        float crowdFab = vCls > 0.5 && vCls < 1.5 && vPart > 0.5 && vPart < 2.5 ? 1.0 : 0.0;
        #endif
        crowdSheenC = crowdFab * sqrt(max(diffuseColor.rgb, vec3(0.0))) * 0.3;`)
        .replace('#include <roughnessmap_fragment>', `
        vec3 crowdOrm = texture(uOrm, crowdT).rgb;
        vec3 crowdNm = texture(uNormalA, crowdT).xyz * 2.0 - 1.0;
        float roughnessFactor = vCls < 0.5 ? mix(0.5, 0.68, crowdOrm.g) : vCls > 1.5 ? 0.08 : crowdFab > 0.5 ? mix(0.62, 1.0, crowdOrm.g) : clamp(crowdOrm.g, 0.35, 1.0);
        if (vCls < 1.5) {   // Toksvig (eyes keep their wet 0.08)
          float crowdNl = clamp(length(crowdNm), 0.05, 1.0);
          float crowdA2 = roughnessFactor * roughnessFactor;
          roughnessFactor = sqrt(sqrt(crowdA2 * crowdA2 + min(2.0 * (1.0 - crowdNl) / crowdNl, 0.35)));
        }
        crowdSpecOcc = mix(1.0, crowdOrm.r * crowdOrm.r, 0.85 * crowdSkinK);`)
        .replace('#include <metalnessmap_fragment>', `
        float metalnessFactor = vCls > 0.5 && vCls < 1.5 ? crowdOrm.b * 0.8 : 0.0;`)
        .replace('#include <normal_fragment_maps>', `
        crowdGeoN = normal;
        {
          vec3 mapN = crowdNm;
          mapN.xy *= vCls < 0.5 ? 0.9 : 1.0;
          normal = crowdPerturb(-vViewPosition, normal, mapN, crowdT.xy);
        }`)
        .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        if (crowdSkinK > 0.5) { material.specularColor = vec3(0.028); material.specularColorBlended = vec3(0.028); }
        #ifdef USE_SHEEN
        material.sheenColor = crowdSheenC;
        material.sheenRoughness = 0.55;
        #endif`)
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        {
          float crowdAo = mix(1.0, crowdOrm.r, 0.8);
          crowdAo *= mix(0.6, 1.0, smoothstep(0.02, 0.32, vFootH));   // CONTACT: the ground hides the lower sky
          reflectedLight.indirectDiffuse *= crowdAo;
          reflectedLight.indirectSpecular *= crowdAo * crowdAo;
          #ifdef USE_SHEEN
          sheenSpecularIndirect *= crowdAo;
          #endif
          // EYES sit in sockets under the brow and lids: most of the sky they would mirror is occluded; the sun's glint stays
          if (vCls > 1.5 && vCls < 2.5) { reflectedLight.indirectSpecular *= 0.18; reflectedLight.indirectDiffuse *= 0.7; }
        }`);
    }
    sh.fragmentShader = fs.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if (crowdFaded()) discard;   // NF31');
  };
  m.customProgramCacheKey = () => 'crowd31|' + kind + (fab0 ? '|fab0' : '');
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
      mesh.userData.crowdLooks = mats.looks ? mats.looks.map((L) => L[kind]) : null;   // PL31 A/B (Crowd.setLook)
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
// WS27 (owner 2026-09-26: "There are too many weird walk cycles right now. The non-standard walk animations should be
// rarer"): 45 % of adults walked a performed style. The neutral walk now carries 80 of 97 (phone calls 8, hands in pockets
// 6, rushed 2, crowd dodging 1); depressed / arms behind back / looking up / arms folded / old leave the mix (an old walk on
// a young body read as a limp). `?ws27=0` restores the old weights.
const WS27 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('ws27') === '0');
if (WS27) {
  const W27 = { s_neutral_walk: 80, s_onphoneleft_walk: 4, s_onphoneright_walk: 4, s_handsinpockets_walk: 6, s_rushed_walk: 2, s_crowdavoidance_walk: 1 };
  for (const st of STYLES) st.w = W27[st.walk[0]] ?? 0;
}
// KC27 (same review: "I don't want to see broken pedestrian animations"): children picked their walk by speed alone from
// every child locomotion clip, so a GEN3 child at an adult's pace got joy_c (a skipping hop, filed as a walk) and every GEN2
// child, boys included, walked CARLA's girl clip, whose arm swing flares out from the body. Children now walk: GEN2 boys the
// neutral adult walk (the same skeleton; the rate follows the child's leg length), GEN2 girls their own walk or the neutral
// one, GEN3 children walk_c / walk_c2, never joy_c. `?kc27=0` restores the speed-only pick.
const KC27 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('kc27') === '0');
const SHOW_STYLES = STYLES.map((s, i) => (s.w > 0 ? i : -1)).filter((i) => i >= 0);
const STYLE_BAG = STYLES.flatMap((s, i) => Array(s.w).fill(i));
const hash = (a, b = 0) => { let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b | 0, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return ((h >>> 0) % 100003) / 100003; };
// NYC trouser / shoe palettes (linear-ish sRGB picks; applied by luminance-preserving recolour)
const BOTTOMS = [[0.10, 0.11, 0.13], [0.05, 0.05, 0.06], [0.16, 0.19, 0.27], [0.28, 0.25, 0.20], [0.20, 0.20, 0.21], [0.33, 0.29, 0.22], [0.09, 0.12, 0.20]];
const SHOES = [[0.04, 0.04, 0.045], [0.75, 0.75, 0.74], [0.18, 0.12, 0.08], [0.30, 0.30, 0.32]];
// showroom outerwear (linear): the sim's NYC mix — black, navy, brown, grey, red, olive, off-white, dark navy
const SHOW_TOPS = [[0.02, 0.02, 0.025], [0.03, 0.04, 0.08], [0.12, 0.09, 0.06], [0.35, 0.35, 0.36], [0.25, 0.03, 0.03], [0.05, 0.07, 0.04], [0.6, 0.6, 0.58], [0.015, 0.02, 0.04]];

// column-major 4x4 helpers (SIT32 props): the inverse of a rigid matrix, a product, an nlerp of two quaternions into dst
function invRigid4(m) {
  const r = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]], t = [m[12], m[13], m[14]];
  return [r[0], r[3], r[6], 0, r[1], r[4], r[7], 0, r[2], r[5], r[8], 0, -(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]), -(r[3] * t[0] + r[4] * t[1] + r[5] * t[2]), -(r[6] * t[0] + r[7] * t[1] + r[8] * t[2]), 1];
}
function mul4(a, b, o) { for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }
function nlerpInto(D, o, A, ia, B, ib, t) {
  const sg = A[ia] * B[ib] + A[ia + 1] * B[ib + 1] + A[ia + 2] * B[ib + 2] + A[ia + 3] * B[ib + 3] < 0 ? -1 : 1;
  const x = A[ia] + (sg * B[ib] - A[ia]) * t, y = A[ia + 1] + (sg * B[ib + 1] - A[ia + 1]) * t, z = A[ia + 2] + (sg * B[ib + 2] - A[ia + 2]) * t, w = A[ia + 3] + (sg * B[ib + 3] - A[ia + 3]) * t;
  const l = Math.hypot(x, y, z, w) || 1;
  D[o] = x / l; D[o + 1] = y / l; D[o + 2] = z / l; D[o + 3] = w / l;
}

// SIT2 look-dev layout (?crowdset=sit2), relative to the showroom anchor; yaw = the walker's heading (atan2(dx, dz))
function sit2Layout() {
  const V = [5, 24, 51, 60, 18, 29, 14, 73, 21, 42, 27, 35, 16, 55, 10, 67, 44, 30, 38, 20, 33, 47, 61, 8];
  let vi = 0;
  const seats = [], tables = [], benches = [];
  const table = (x, z, n, square, poses, r = 0.62, a0 = 0) => {
    const t = tables.length;
    tables.push({ x, z, square });
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * 2 * Math.PI, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
      seats.push({ x: px, z: pz, yaw: Math.atan2(x - px, z - pz), pose: poses[i % poses.length], v: V[vi++ % V.length], seatH: 0.452, chair: true, table: t });
    }
  };
  let bx = 10.5;
  if (SIT32) {
    table(0, 0, 2, false, [8, 8], 0.62, Math.PI / 2);        // two people talking
    table(3, 0, 4, true, [9, 10, 5, 11], 0.64, 0);           // eating, reading, a sip, a laptop
    table(6, 0, 3, false, [12, 13, 8], 0.62, 0.3);           // leaning back, legs crossed, talking
    table(9, 0, 2, false, [3, 4], 0.62, Math.PI / 2);
    bx = 12.5;
  } else {
    table(0, 0, 2, false, [3, 5], 0.62, Math.PI / 2);
    table(3, 0, 4, true, [3, 4, 5, 6], 0.64, 0);
    table(6, 0, 3, false, [3, 4, 5], 0.62, 0.3);
  }
  for (let i = 0; i < 6; i++) seats.push({ x: -0.5 + i * 1.2, z: -3.2, yaw: 0, pose: 1 + (i % 2), v: V[vi++ % V.length], seatH: 0.452, chair: true });
  benches.push({ x: bx, z: 0, len: 2.6, yaw: 0 });
  [[-0.95, 7], [-0.3, 7], [0.35, 6], [1.0, 7]].forEach(([dx, p]) => seats.push({ x: bx + dx, z: 0.02, yaw: 0, pose: p, v: V[vi++ % V.length], seatH: 0.46, chair: false }));
  return { seats, tables, benches, placed: false };
}

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
    this.st = { phase: f(), speed: f(), amp: f(), seed: f(), gait: new Int16Array(cap).fill(-1), variant: new Int16Array(cap).fill(-1), clipA: new Int16Array(cap).fill(-1), tA: f(), clipB: new Int16Array(cap).fill(-1), tB: f(), w: f(), style: f(4), pace: f().fill(1), pose: new Int8Array(cap),
      fit: f().fill(1), armPose: new Int8Array(cap), armPose2: new Int8Array(cap), armV: new Int16Array(cap).fill(-1), armS: f(), armKW: f(),
      gzMode: new Int8Array(cap), gzT: f(3), gzJ: new Int16Array(cap).fill(-1), gzY: f(), gzP: f(), gzTau: f().fill(0.5), gzSeed: f(), gzC: new Int16Array(cap * 3).fill(-1), gzCS: f(3), gzAt: f().fill(-1) };
    // variant weights: adults of both genders, a heavier build, children, rare police
    this.pool = [];
    for (let i = 0; i < assets.variants.length; i++) {
      const v = assets.variants[i];
      // RB27 variants carry their own pool weight (build_rocketbox.mjs: the set is ~40 % of the crowd)
      const w = v.weight ?? (v.uniform === 'police' ? 1 : v.age === 'child' ? 2 : v.build === 'heavy' ? 4 : 10);
      for (let k = 0; k < w; k++) this.pool.push(i);
    }
    // pose targets + passes per skeleton
    this.passes = {};
    for (const S of Object.values(assets.skel)) {
      const rt = new THREE.WebGLRenderTarget(S.nb, MAXI, { count: 3, type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false });
      const instData = new Float32Array(INST_W * MAXI * 4);
      const instTex = new THREE.DataTexture(instData, INST_W, MAXI, THREE.RGBAFormat, THREE.FloatType);
      instTex.needsUpdate = true;
      // SIT31 / SIT32: three arm rows per walker slot (3i: its present seated pose, 3i + 1: that pose's key 1, 3i + 2: the
      // one it is blending out of, frozen as it was shown)
      const NSL = ARM_SLOTS.length, sitOn = S.clips.some((c) => c.kind === 'sit');
      const armData = new Float32Array(NSL * 4 * (sitOn ? 3 * cap : 1)).fill(0);
      for (let k = 3; k < armData.length; k += 4) armData[k] = 2;
      const armTex = new THREE.DataTexture(armData, sitOn ? NSL : 1, sitOn ? 3 * cap : 1, THREE.RGBAFormat, THREE.FloatType);
      armTex.needsUpdate = true;
      const armSlot = S.bones.map((n) => (sitOn ? ARM_SLOTS.indexOf(n) : -1));
      const mat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: POSE_VS, fragmentShader: POSE_FS(S.nb),
        uniforms: { uClips: { value: S.clipTex }, uBodies: { value: S.bodyTex }, uInst: { value: instTex }, uParent: { value: S.parents.map((p) => p) }, uHips: { value: S.hips }, uArm: { value: armTex }, uArmSlot: { value: armSlot } },
        depthTest: false, depthWrite: false,
      });
      const quad = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)), mat);
      quad.frustumCulled = false;
      const pose = [0, 1, 2].map((i) => ({ value: rt.textures[i] }));
      // PL31: the page's look, and with ?crowdab=1 the other one too (looks[0] PV2, looks[1] PL31) for a live A/B
      const L0 = PL31 ? 1 : 0;
      const lookMats = (look, arr, fab0) => ({ opaque: crowdMaterial('opaque', arr, pose, instTex, look, fab0), hair: crowdMaterial('hair', arr, pose, instTex, look, fab0) });
      const withLooks = (m, arr, fab0) => { if (CROWD_AB) { const alt = lookMats(1 - L0, arr, fab0), own = { opaque: m.opaque, hair: m.hair }; m.looks = L0 ? [alt, own] : [own, alt]; } return m; };
      const mats = withLooks({ ...lookMats(L0, assets.arrays, false), depth: crowdDepthMaterial(pose, instTex), id: crowdIdMaterial(pose, instTex) }, assets.arrays, false);
      const skinU = { uPose0: pose[0], uPose1: pose[1], uPose2: pose[2], uInstData: { value: instTex }, uHairA: { value: assets.arrays.hair || null } };
      // RB27: bodies of an extra set sample that set's texture arrays (same programs and pose targets, other uniforms)
      const matsX = {}, skinUX = {};
      for (const [k, arr] of Object.entries(assets.arraysX || {})) {
        matsX[k] = withLooks({ ...mats, ...lookMats(L0, arr, true), looks: null }, arr, true);
        skinUX[k] = { ...skinU, uHairA: { value: arr.hair || null } };
      }
      this.passes[S.name] = { S, rt, instData, instTex, mat, quad, armData, armTex, sitOn, pose, scene: new THREE.Scene().add(quad), cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), rows: 0, mats, skinU, matsX, skinUX };
    }
    // render sets per (body, LOD) main + shadow
    this.sets = new Map();
    for (const B of Object.values(assets.bodies)) {
      const P = this.passes[B.skeleton];
      if (!P) continue;
      const bm = (B.set && P.matsX[B.set]) || P.mats, bs = (B.set && P.skinUX[B.set]) || P.skinU;
      this.sets.set(B.name, {
        main: B.lods.map((parts, li) => new RenderSet(scene, parts, `${B.name}:lod${li}`, bm, false, bs)),
        shadow: B.lods.map((parts, li) => new RenderSet(scene, parts, `${B.name}:lod${li}`, bm, true)),
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
      // ?crowdpose=1..7|alt seats the row (SIT31 pose ids, see sitPoses; alt: sit_a and sit_b in turn)
      this.show = { x: at[0], z: at[1], yaw: ((at[2] ?? 180) * Math.PI) / 180, sp: Number(QS.get('crowdsp') || 1.1), list, walk: QS.get('crowdwalk'), pose: QS.get('crowdpose') || 0, y: null };
      console.log('[crowd] showroom', list.length, 'variants at', at.join(','));
      // ?crowdset=sit2: SEATED LOOK-DEV with real furniture (city/bryantParkKit.js chairGeo31 / tableGeo31: seat 0.452 m,
      // tops 0.7275 m): a round table for two, a square table for four, a round table for three, a row of chairs in poses
      // 1 and 2, and a 2.6 m bench (seat 0.46 m) in poses 7 and 6. Each walker is fitted to its seat (fitSeat) and placed
      // by seatOf; the chairs stand 0.62 m from the table centres (the park's 0.56-0.70).
      if (QS.get('crowdset') === 'sit2') this.show.set = sit2Layout();
    }
    this.look = PL31 ? 1 : 0;
    this.nearFade = NF31;   // NF31 A/B: a harness may switch it on a frozen frame (window.__CROWD.nearFade)
    this.lod3d = LD31;      // LD31 A/B, the same way (window.__CROWD.lod3d)
    this.sit32 = SIT32;     // SIT32 A/B on a frozen frame (window.__CROWD.sit32 = false: no props, key-1 blend or gaze)
    // SIT31 pose ids for the sim (sim/peds.js SW31 reads table and bench, and falls back to 1 / 2 without them)
    const haveSit = Object.values(assets.skel).some((S) => S.clips.some((c) => c.kind === 'sit' && c.sitPose >= 3));
    const ids = new Set(Object.values(assets.skel).flatMap((S) => S.clips.filter((c) => c.kind === 'sit').map((c) => c.sitPose)));
    const only = (a) => a.filter((p) => ids.has(p));
    // SIT32 adds six table loops (talk 8, eat 9, read 10, laptop 11, lean 12, cross 13) to table, and each by name
    this.sitPoses = haveSit ? { upright: [1], relaxed: [2], table: only([3, 4, 5, 8, 9, 10, 11, 12, 13]), bench: [7], phone: [6], talk: only([8]), eat: only([9]), read: only([10]), laptop: only([11]), lean: only([12]), cross: only([13]) } : { upright: [1], relaxed: [2], table: [], bench: [], phone: [] };
    // SIT32 props: one instanced mesh per kind, carried by the GEN2 pass's pose rows
    this.props = SIT32 && this.passes.gen2 ? makeCrowdProps(scene, this.passes.gen2.pose) : null;
    if (typeof window !== 'undefined') window.__CROWD = this;   // look-dev / A/B harnesses (setLook, show, seatOf)
    this.clipsBy = {};
    for (const S of Object.values(assets.skel)) {
      const by = (kind) => S.clips.filter((c) => c.kind === kind);
      this.clipsBy[S.name] = { walk: by('walk'), idle: by('idle'), sit: S.clips.filter((c) => c.kind === 'sit').sort((a, b) => a.sitPose - b.sitPose), all: S.clips };
    }
  }
  // PL31 A/B (?crowdab=1): 0 = the PV2 materials, 1 = PL31, on every drawn walker from the next frame
  setLook(v) {
    v = v ? 1 : 0;
    let n = 0;
    for (const s of this.sets.values()) for (const x of s.main) for (const m of x.meshes) {
      const L = m.userData.crowdLooks;
      if (!L) continue;
      if (m.material === m.userData.crowdMat) m.material = L[v];
      m.userData.crowdMat = L[v];
      n++;
    }
    this.look = v;
    return n;
  }
  // ---- the pedmesh.js rig API (peds.js)
  setAnim(idx, phase, rate, amp, skin) {
    if (this.show) return;
    const s = this.st;
    // SIT32: a new walker in this slot (another seed) starts with no gaze, whatever its variant
    if (s.seed[idx] !== Math.fround(skin)) { s.gzMode[idx] = 0; s.gzY[idx] = 0; s.gzP[idx] = 0; }
    s.phase[idx] = phase; s.speed[idx] = rate / 4.4; s.amp[idx] = amp; s.seed[idx] = skin; s.pace[idx] = 1;
    const v = this.pool[Math.min(this.pool.length - 1, Math.floor(skin * this.pool.length))];
    if (s.variant[idx] !== v) { s.variant[idx] = v; s.clipA[idx] = -1; s.clipB[idx] = -1; s.w[idx] = 0; s.fit[idx] = 1; s.armPose[idx] = 0; s.armPose2[idx] = 0; s.gzMode[idx] = 0; s.gzY[idx] = 0; s.gzP[idx] = 0; }
    // walk style: heavier builds walk heavyset, fast walkers hurry, the rest from the NYC mix
    const V = this.A.variants[v], hsd = hash(Math.floor(skin * 1e6), 5);
    // WS27: the heavyset walk on a fifth of heavy builds (was 40 %), the rushed walk on an eighth of fast walkers (was 30 %)
    const hvK = WS27 ? 0.2 : 0.4, fsK = WS27 ? 0.12 : 0.3;
    s.gait[idx] = V.build === 'heavy' && hsd < hvK ? STYLES.length - 1 : s.speed[idx] > 1.62 && hsd < fsK ? 5 : STYLE_BAG[Math.floor(hash(Math.floor(skin * 1e6), 9) * STYLE_BAG.length)];
  }
  setAmp(idx, amp) { if (!this.show) this.st.amp[idx] = amp; }
  // SIT31 CONTRACT (docs/notes/crowd-looks.md): st.pose[idx] (or setPose) = 0 stand / walk (the sim's amp decides), else
  // a seated pose id (this.sitPoses: 1 upright, 2 relaxed, 3-5 at a table, 6 phone, 7 bench). While pose > 0 the walker plays
  // that seated loop whatever its amp, blending FADE_SIT s in and out, with its own arms (the bake, per body and scale). The
  // instance origin stays at the FEET, on the floor; heading = the instance yaw (face the chair's front). GEN2 bodies only.
  setPose(idx, p) { if (!this.show) this.st.pose[idx] = p | 0; }
  // the seat point (under the pelvis) of walker idx in pose p for ITS body and scale: { up, back, feet, table? } in metres:
  // the seat point is back m behind the origin along the heading and up m above it; feet: each toe tip [side, fwd] from the
  // seat point (side + = the walker's left); table (poses 3-5): the top height h over the seat point, the edge and elbow
  // distances in front of it the pose is solved for. null: no variant yet, or a body without seated clips.
  seatOf(idx, p = this.st.pose[idx] || 1) {
    const vi = this.st.variant[idx];
    if (vi < 0) return null;
    const V = this.A.variants[vi], B = this.A.bodies[V.body], C = this.clipsBy[B.skeleton];
    const c = C && C.sit.find((x) => x.sitPose === (p | 0));
    if (!c || !c.seat || !c.seat[B.index]) return null;
    // SIT32: legs crossed only where the body's thighs allow it: the bake measures the upper thigh in the lower one (crowd_sitqa
    // legs metric: median 3.8 cm over the 66 adults, 11.6 on the heaviest); past 5 cm (10 of them) no seat for that pose, and
    // sim/peds.js _seatSpawn draws another body
    if (c.spec && c.spec.cross && B.sitBake && B.sitBake.legs && B.sitBake.legs[p | 0] > 0.05) return null;
    const k = (V.scale || 1) * this._heightScale(V, B, idx) * (this.st.fit[idx] || 1), r3 = (v) => +v.toFixed(3);
    const out = { up: r3(c.seat[B.index][0] * k), back: r3(c.seat[B.index][1] * k), feet: c.feet ? c.feet[B.index].map(([x, z]) => [r3(x * k), r3(z * k)]) : null };
    if (c.spec && c.spec.table) out.table = { h: TABLE31.h, edge: TABLE31.edge, elbow: TABLE31.elbow };
    // SIT32: the crossed knee's top (h over the floor; fwd in front of the seat point and side, + the walker's left: the
    // legs turn 40 deg aside so it clears the park's tables), the props the walker holds, and the items it puts on the top
    // (side / fwd from the seat point, h over it like table.h)
    if (c.knee && c.knee[B.index]) out.knee = { h: r3(c.knee[B.index][0] * k), fwd: r3(c.knee[B.index][1] * k), side: r3((c.knee[B.index][2] || 0) * k) };
    const pr = SIT32 && B.sitBake && B.sitBake.props && B.sitBake.props[p | 0];
    if (pr) {
      const e = pr[Math.min(pr.length - 1, pr.length >> 1)];
      out.props = e.filter((x) => x.b).map((x) => x.k);
      out.items = e.filter((x) => !x.b).map((x) => ({ k: x.k, side: r3(x.m[12] * k), fwd: r3((x.m[14] + c.seat[B.index][1]) * k), h: r3(x.m[13] * k - out.up) }));
    }
    return out;
  }
  // SIT32 GAZE (sim/peds.js SW31 for table companions): walker idx turns its head and shoulders toward a world point, or
  // toward walker j's head (followed as j moves), easing over tau s; clearGaze eases back to the clip's own head. The turn
  // is limited to 72 deg either side and 20 deg up / 34 deg down of where the clip itself looks (crowdSit.js look0: a
  // reader looks 38 deg down at its book, a talker 5 deg), shared over the upper spine, neck and head (the pose pass).
  // setLookAt keeps to that walker (by its seed): moveSlot carries the gaze along when the walker changes slot, and once it
  // is gone (despawned, its slot reused) the gaze eases back.
  setGaze(idx, x, y, z, tau = 0.5) { const st = this.st; st.gzMode[idx] = 1; st.gzT[idx * 3] = x; st.gzT[idx * 3 + 1] = y; st.gzT[idx * 3 + 2] = z; st.gzTau[idx] = tau; }
  setLookAt(idx, j, tau = 0.5) { const st = this.st; if (j === idx || !(j >= 0)) return this.clearGaze(idx); st.gzMode[idx] = 2; st.gzJ[idx] = j; st.gzSeed[idx] = st.seed[j]; st.gzTau[idx] = tau; }
  clearGaze(idx, tau = 0.5) { this.st.gzMode[idx] = 0; this.st.gzTau[idx] = tau; }
  // SIT32 TABLE GAZE: walkers ids share a table whose top's middle is (x, y, z), world metres. Each looks by turns at one of
  // up to three companions, at the top, or where its own loop looks, holding each for 2.5-6 s (by its seed, so a replayed
  // frame is the same) and turning over ~0.6 s: a talker mostly at a companion (80 %), a reader or a laptop user mostly at
  // its own page or screen (70 %), the others 60 / 20 / 20. One call when the table fills (again when someone joins);
  // clearGaze takes one walker out, and a companion that is gone drops out of the turns.
  setTableGaze(ids, x, y, z) {
    const st = this.st;
    for (const i of ids) {
      st.gzMode[i] = 3; st.gzTau[i] = 0.2;
      st.gzT[i * 3] = x; st.gzT[i * 3 + 1] = y; st.gzT[i * 3 + 2] = z;
      let m = 0;
      for (const j of ids) if (j !== i && m < 3) { st.gzC[i * 3 + m] = j; st.gzCS[i * 3 + m] = st.seed[j]; m++; }
      for (; m < 3; m++) st.gzC[i * 3 + m] = -1;
    }
  }
  // the eye point of walker i in world metres (seated: 1.2 of its scale up and 0.3 behind its feet; standing: 1.6 up)
  _eyeOf(i, Ms, out) {
    const o = i * 16, st = this.st, vi = st.variant[i];
    if (vi < 0) return null;
    const V = this.A.variants[vi], B = this.A.bodies[V.body], k = (V.scale || 1) * this._heightScale(V, B, i) * (st.fit[i] || 1);
    const fl = Math.hypot(Ms[o + 8], Ms[o + 10]) || 1, fx = Ms[o + 8] / fl, fz = Ms[o + 10] / fl, sat = st.pose[i] > 0;
    out[0] = Ms[o + 12] + fx * (sat ? -0.3 * k : 0); out[1] = Ms[o + 13] + (sat ? 1.2 : 1.6) * k; out[2] = Ms[o + 14] + fz * (sat ? -0.3 * k : 0);
    return out;
  }
  // FIT: scale walker idx (within +-8 % of its own height) so its seat point in pose p lands at seatH over the floor, and
  // solve its arms for that scale (a table top stays 0.275 m over the seat in metres). Returns seatOf() as achieved, or
  // null when 8 % cannot bring it within 1 cm; the walker is then back at its natural height (a fit left over from an
  // earlier skin of the same variant would otherwise stay: setAnim clears the fit only when the variant changes, and
  // peds.js _seatSpawn tries up to 12 skins on one slot, falling back to seatOf). Meant for walkers placed already
  // seated: the height change is never seen.
  fitSeat(idx, seatH, p = this.st.pose[idx] || 1) {
    const vi = this.st.variant[idx];
    if (vi < 0) return null;
    const V = this.A.variants[vi], B = this.A.bodies[V.body], C = this.clipsBy[B.skeleton];
    const c = C && C.sit.find((x) => x.sitPose === (p | 0));
    if (!c || !c.seat || !c.seat[B.index]) { this.st.fit[idx] = 1; return null; }
    const s0 = (V.scale || 1) * this._heightScale(V, B, idx), up = c.seat[B.index][0];
    const k = Math.min(1.08, Math.max(0.92, seatH / (up * s0)));
    if (Math.abs(up * s0 * k - seatH) > 0.01) { this.st.fit[idx] = 1; return null; }
    this.st.fit[idx] = k;
    const so = this.seatOf(idx, p);   // null for a pose this body is not given (SIT32 legs crossed)
    if (!so) this.st.fit[idx] = 1;
    return so;
  }
  // peds.js _remove moves the LAST walker into a freed slot: carry every per-walker state with it (before its setAnim /
  // setStyle), so its clip, phase, fade, pose, fit and arms go on where they were
  moveSlot(from, to) {
    if (from === to) return;
    const st = this.st;
    for (const k of ['phase', 'speed', 'amp', 'seed', 'gait', 'variant', 'clipA', 'tA', 'clipB', 'tB', 'w', 'pace', 'pose', 'fit', 'armPose', 'armPose2', 'armV', 'armS', 'armKW', 'gzMode', 'gzJ', 'gzY', 'gzP', 'gzTau', 'gzSeed', 'gzAt']) st[k][to] = st[k][from];
    st.style.copyWithin(to * 4, from * 4, from * 4 + 4);
    st.gzT.copyWithin(to * 3, from * 3, from * 3 + 3);
    // SIT32: a gaze on the walker moved follows it to its new slot (one on the walker removed from 'to' lets go by its seed)
    for (let k = 0; k < this.cap; k++) if (st.gzMode[k] === 2 && st.gzJ[k] === from) st.gzJ[k] = to;
    st.gzC.copyWithin(to * 3, from * 3, from * 3 + 3); st.gzCS.copyWithin(to * 3, from * 3, from * 3 + 3);
    for (let k = 0; k < st.gzC.length; k++) if (st.gzC[k] === from) st.gzC[k] = to;
    for (const P of Object.values(this.passes)) {
      if (!P.sitOn) continue;
      const L = ARM_SLOTS.length * 4;
      P.armData.copyWithin(3 * to * L, 3 * from * L, 3 * from * L + 3 * L);
      P.armTex.needsUpdate = true;
    }
  }
  // this walker's own arms for its seated pose, from the bake: row 3i (the pose it sits in), 3i + 1 (that pose's key 1,
  // or key 0 again) and 3i + 2 (the pose it blends out of, as it was shown: its two keys at their last weight); the table
  // poses blend the bake's five scale samples by the walker's scale
  _ensureArms(i, P, vi, B, pose, s) {
    const st = this.st, L = ARM_SLOTS.length * 4;
    if (st.armPose[i] === pose && st.armV[i] === vi && Math.abs(st.armS[i] - s) < 0.002) return;
    const e = B.sitBake, list = e && e.poses[pose];
    if (!list) return;
    const D = P.armData, o = 3 * i * L;
    if (st.armPose[i] && st.armPose[i] !== pose) {
      for (let q = 0; q < L; q += 4) {
        const a0 = o + q, a1 = o + L + q, dst = o + 2 * L + q;
        if (D[a0 + 3] > 1.5 && D[a1 + 3] > 1.5) { D[dst] = D[dst + 1] = D[dst + 2] = 0; D[dst + 3] = 2; continue; }
        const qa = D[a0 + 3] > 1.5 ? a1 : a0, qb = D[a1 + 3] > 1.5 ? a0 : a1;
        nlerpInto(D, dst, D, qa, D, qb, st.armKW[i]);
      }
      st.armPose2[i] = st.armPose[i];
    }
    const SC = P.S.sitScales, k = s / e.s0;
    const put = (lst, dst) => {
      let a = lst[0], b = lst[0], t = 0;
      if (lst.length > 1 && SC) {
        let j = 0; while (j < SC.length - 2 && k > SC[j + 1]) j++;
        a = lst[j]; b = lst[j + 1]; t = Math.min(1, Math.max(0, (k - SC[j]) / (SC[j + 1] - SC[j])));
      }
      for (let q = 0; q < L; q += 4) {
        if (a[q + 3] > 1.5) { D[dst + q] = 0; D[dst + q + 1] = 0; D[dst + q + 2] = 0; D[dst + q + 3] = 2; continue; }
        nlerpInto(D, dst + q, a, q, b, q, t);
      }
    };
    put(list, o);
    put((e.keys1 && e.keys1[pose]) || list, o + L);
    st.armPose[i] = pose; st.armV[i] = vi; st.armS[i] = s;
    P.armTex.needsUpdate = true;
  }
  // PY25 (sim/peds.js): a walker slowed behind someone plays its walk at that fraction of its rate, so the feet stay
  // planted; the walk clip itself is still the one picked for its own pace (no clip swap while easing)
  setPace(idx, f) { if (!this.show) this.st.pace[idx] = f; }
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
    // SIT31 phone pose: the fitted phone in the right hand (both hands hold it), no handbag in that fist
    if (this.st.pose[i] === 6) return ((bits & ~(1 << 6)) | (1 << 5) | (m & 4 && g !== 5 && g !== 6 ? 1 << (h < 0.55 ? 1 : 0) : 0)) & have;
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
  _clipFor(skelName, variant, body, walking, seed, speed, gait, styleIdx = -1, pose = 0) {
    const C = this.clipsBy[skelName];
    const force = QS.get('crowdclip');
    if (force) { const fc = C.all.find((x) => x.name === force); if (fc) return fc; }
    if (pose > 0 && C.sit.length) return C.sit.find((c) => c.sitPose === pose) || C.sit[0];
    const age = variant.age === 'child' || body.height * (variant.scale || 1) < 1.4 ? 'child' : 'adult';
    const pool = walking ? C.walk : C.idle;
    let list = pool.filter((c) => c.age === age);
    if (KC27 && walking && age === 'child') {
      if (skelName === 'gen2') {
        const names = variant.gender === 'f' ? ['walk_f', 's_neutral_walk'] : ['s_neutral_walk', 'walk_m'];
        const sl = C.all.filter((c) => names.includes(c.name));
        if (sl.length) list = sl;
      } else list = list.filter((c) => c.name !== 'joy_c');
    }
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
    this._clock = (this._clock || 0) + dt;   // SIT32 table gaze turns
    const A = this.A, st = this.st, cam = this.engine.camera, r = this.engine.renderer;
    // PL31 hair: dither the alpha threshold per accumulated sample (record mode with ?accum), fixed in live frames
    CROWD_U.frame.value = this.engine.frames || 0;
    CROWD_U.dith.value = this.engine.recordMode && this.engine.taa && this.engine.taa.accum ? 1 : 0;
    let n = this.mesh.count, Ms = this.mesh.instanceMatrix.array, Cs = this.mesh.instanceColor.array;
    if (this.show) {
      const sh = this.show;
      if (sh.y == null) { const g = this.engine.groundAt ? this.engine.groundAt(sh.x, sh.z) : (window.__STREAMER?.surfaceAt?.(sh.x, sh.z)); if (g != null && isFinite(g)) sh.y = g; }
      if (sh.set && sh.y != null) { this._showSet(sh); Ms = sh.M; Cs = sh.C; n = sh.list.length; }
      else {
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
        this.st.pose[k] = sh.pose === 'alt' ? 1 + (k % 2) : Number(sh.pose) || 0;
      }
      Ms = sh.M; Cs = sh.C;
      }
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
    if (this.props) this.props.begin();
    const eye = this._eyeA || (this._eyeA = [0, 0, 0]), tgt = this._tgtA || (this._tgtA = [0, 0, 0]);
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z, nearZ = cam.near || 0.4;
    const W = this._W, M = this._M, idc = [0, 0, 0];
    this.stats.visible = this.stats.shadow = this.stats.faded = 0; this.stats.lod[0] = this.stats.lod[1] = this.stats.lod[2] = 0;
    const inside = (pl, x, y, z, rad) => { for (let q = 0; q < 6; q++) { const p = pl[q]; if (p.normal.x * x + p.normal.y * y + p.normal.z * z + p.constant < -rad) return false; } return true; };
    for (let i = 0; i < n; i++) {
      const o = i * 16;
      if (Ms[o] === 0 && Ms[o + 5] === 0 && Ms[o + 10] === 0) continue;
      const x = Ms[o + 12], y = Ms[o + 13], z = Ms[o + 14];
      const vis = inside(planes, x, y + 0.9, z, 1.1);
      const shv = shPlanes ? inside(shPlanes, x, y + 0.9, z, 2.0) && !sweepOut(x, y + 0.9, z, 2.0) : false;   // SV29
      if (!vis && !shv) continue;
      const vi = st.variant[i];
      if (vi < 0) continue;
      const V = A.variants[vi], B = A.bodies[V.body];
      const P = this.passes[B.skeleton];
      if (!P || P.rows >= MAXI) continue;
      const S = P.S;
      // ---- clip state: walk while amp > 0.5, else idle (SIT31: seated while st.pose > 0); crossfade FADE seconds
      const pose = SIT31 ? st.pose[i] : 0;
      const walking = !pose && st.amp[i] > 0.5;
      const vScale0 = (V.scale || 1) * this._heightScale(V, B, i) * (st.fit[i] || 1);
      const want = this._clipFor(B.skeleton, V, B, walking, st.seed[i], st.speed[i], (B.hipsH / S.refHips) * vScale0, st.gait[i], pose);
      const wantIdx = S.clips.indexOf(want);
      if (st.clipA[i] < 0) { st.clipA[i] = wantIdx; st.tA[i] = (st.phase[i] * 13.7 % 1) * want.frames; st.clipB[i] = wantIdx; st.w[i] = 0; }
      else if (st.clipA[i] !== wantIdx) {
        st.clipB[i] = st.clipA[i]; st.tB[i] = st.tA[i];
        st.clipA[i] = wantIdx; st.tA[i] = walking ? 0 : (st.seed[i] * 97.1 % 1) * want.frames;
        st.w[i] = 1;
      }
      const cA = S.clips[st.clipA[i]], cB = S.clips[st.clipB[i]];
      const vScale = (V.scale || 1) * this._heightScale(V, B, i) * (st.fit[i] || 1);
      const gait = (B.hipsH / S.refHips) * vScale;
      // feet stay planted only while the playback rate tracks the walker's speed: clamp widened 1.9 -> 2.3 (film 7 review: a
      // quarter of the walkers were over 1.9 and skated), and peds.js walks 1.05-1.5 m/s now (was 1.15-1.8)
      const rateOf = (c) => (c.kind === 'walk' && c.speed > 0.1 ? Math.min(2.3, Math.max(0.5, st.speed[i] / (c.speed * gait))) : 1);
      const pace = this.show ? 1 : st.pace[i] || 1;
      st.tA[i] += dt * cA.fps * rateOf(cA) * (cA.kind === 'walk' ? pace : 1);
      st.tB[i] += dt * cB.fps * rateOf(cB) * (cB.kind === 'walk' ? pace : 1);
      st.w[i] = Math.max(0, st.w[i] - dt / (cA.kind === 'sit' || cB.kind === 'sit' ? FADE_SIT : FADE));
      // NF31: how far the walker's surface is from the lens, in the walker's own frame (across, forward, up; its scale k):
      // the head a 0.125 m sphere (nose tip to the back of the hair) 1.62 k over the floor (seated 1.22 k and 0.3 k behind
      // the feet), the body a box 0.48 k across and 0.30 k deep with 0.08 k round edges from the shins to the shoulders
      // (seated 0.60 k deep, knees to back, up to 1.05 k). NF32 (film 15's fStreetLife, frames 69-72: a backpack floating in
      // front of the lens after its wearer had walked past it): what the walker carries counts too, a backpack deepening
      // the box 0.35 k behind the back and a bag widening it 0.12 k at the side, so the pack fades with the body
      let fade = 0;
      if (this.nearFade) {
        const k = vScale, fl = Math.hypot(Ms[o + 8], Ms[o + 10]) || 1, fwx = Ms[o + 8] / fl, fwz = Ms[o + 10] / fl;
        const lx = cx - x, lz = cz - z, la = Math.abs(lx * fwz - lz * fwx), lf = lx * fwx + lz * fwz, ly = cy - y;
        const sat = pose > 0;
        const pm = NF32 ? this._propMask(i, V, B) : 0, pack = (pm & 3) !== 0 && !sat, bag = (pm & 28) !== 0;
        const sdH = Math.hypot(la, lf - (sat ? -0.3 : 0.02) * k, ly - (sat ? 1.22 : 1.62) * k) - 0.125 * k;
        const r = 0.08 * k, y0 = 0.1 * k, y1 = (sat ? 1.05 : 1.45) * k;
        const bc = sat ? -0.25 : pack ? -0.175 : 0, bh = sat ? 0.3 : pack ? 0.325 : 0.15;   // the box's forward centre and half depth
        const qx = Math.max(0, la - (bag ? 0.36 : 0.24) * k + r), qz = Math.max(0, Math.abs(lf - bc * k) - bh * k + r);
        const sd = Math.min(sdH, Math.hypot(qx, qz, ly < y0 ? y0 - ly : ly > y1 ? ly - y1 : 0) - r);
        fade = Math.min(1, Math.max(0, (nearZ + NF_W - sd) / NF_W));
        if (fade >= 1) this.stats.faded++;
      }
      if (fade >= 1 && !shv) continue;
      // ---- pose row
      const row = P.rows++;
      if (CROWD_CHECK) (P.rowInfo || (P.rowInfo = []))[row] = { i, vi, body: B.name, a: cA.name, b: cB.name, tA: +st.tA[i].toFixed(2), tB: +st.tB[i].toFixed(2), w: +st.w[i].toFixed(3), pose, vis, shv };
      const d = P.instData, q = row * INST_W * 4;
      d[q] = cA.row; d[q + 1] = cA.frames; d[q + 2] = st.tA[i] % cA.frames; d[q + 3] = st.w[i];
      d[q + 4] = cB.row; d[q + 5] = cB.frames; d[q + 6] = st.tB[i] % cB.frames; d[q + 7] = B.index;
      // SIT31: a seated clip carries each body's own hips scale (its soles on the floor, crowdSit.js kBody)
      d[q + 8] = cA.kBody ? cA.kBody[B.index] : B.hipsH / (cA.hipsH || B.hipsH); d[q + 9] = cB.kBody ? cB.kBody[B.index] : B.hipsH / (cB.hipsH || B.hipsH);
      d[q + 10] = this._propMask(i, V, B); d[q + 11] = fade;
      // SIT31: the walker's own arm rows for a seated clip A / B (the bake, per body and scale)
      let armA = -1, armB = -1;
      if (P.sitOn) {
        if (pose > 0 && B.sitBake) this._ensureArms(i, P, vi, B, pose, vScale);
        armA = cA.sitPose ? (st.armPose[i] === cA.sitPose ? 3 * i : st.armPose2[i] === cA.sitPose ? 3 * i + 2 : -1) : -1;
        armB = cB.sitPose ? (st.armPose[i] === cB.sitPose ? 3 * i : st.armPose2[i] === cB.sitPose ? 3 * i + 2 : -1) : -1;
      }
      // SIT32: the key-1 weight on the present pose's rows, from the clip's own loop time (so the shared clip's head beats
      // and each walker's arms move together); -1 = rows without keys
      const kwA = this.sit32 && armA === 3 * i && cA.spec && cA.spec.keys === 2 ? sitKeyW(cA.spec, (st.tA[i] % cA.frames) / cA.fps) : -1;
      const kwB = this.sit32 && armB === 3 * i && cB.spec && cB.spec.keys === 2 ? sitKeyW(cB.spec, (st.tB[i] % cB.frames) / cB.fps) : -1;
      if (kwA >= 0) st.armKW[i] = kwA;
      d[q + 40] = armA + 1; d[q + 41] = armB + 1; d[q + 42] = kwA; d[q + 43] = kwB;
      // SIT32 gaze: the target in the walker's frame, limited, eased. A walker out of view is not updated (its clip waits
      // too): back in view, or after a cut, it starts at its present target instead of turning to it on camera
      let gy = 0, gp = 0;
      const gzGap = this._clock - st.gzAt[i];
      st.gzAt[i] = this._clock;
      if (this.sit32 && (st.gzMode[i] || st.gzY[i] || st.gzP[i])) {
        let ty = 0, tp = 0;
        let j = st.gzJ[i], mode = st.gzMode[i];
        if (mode === 2 && !(j < n && st.seed[j] === st.gzSeed[i] && Ms[j * 16 + 5] !== 0)) st.gzMode[i] = mode = 0;   // its walker is gone
        if (mode === 3 && !pose) st.gzMode[i] = mode = 0;   // up from the table: its turns end
        if (mode === 3) {
          // a table: this turn's target, from the walker's seed and the turn's number
          const sd = Math.floor(st.seed[i] * 1e6), h0 = hash(sd, 43), len = 2.5 + 3.5 * h0, turn = Math.floor((this._clock + 13 * h0) / len), c = hash(sd + turn * 7919, 47);
          const cand = this._gzCand || (this._gzCand = [0, 0, 0]);
          let nc = 0;
          for (let m = 0; m < 3; m++) { const jj = st.gzC[i * 3 + m]; if (jj >= 0 && jj < n && st.seed[jj] === st.gzCS[i * 3 + m] && Ms[jj * 16 + 5] !== 0) cand[nc++] = jj; }
          const down = (cA.look0 || 0) < -0.35, pc = !nc ? 0 : cA.spec && cA.spec.arms === 'talk' ? 0.8 : down ? 0.3 : 0.6, pt = down ? 0 : 0.2;
          if (c < pc) { mode = 2; j = cand[Math.min(nc - 1, Math.floor((c / pc) * nc))]; } else mode = c < pc + pt ? 1 : 0;
        }
        const t3 = mode === 1 ? [st.gzT[i * 3], st.gzT[i * 3 + 1], st.gzT[i * 3 + 2]] : mode === 2 ? this._eyeOf(j, Ms, tgt) : null;
        if (t3 && this._eyeOf(i, Ms, eye)) {
          const fl = Math.hypot(Ms[o + 8], Ms[o + 10]) || 1, fx = Ms[o + 8] / fl, fz = Ms[o + 10] / fl;
          const dx = t3[0] - eye[0], dy = t3[1] - eye[1], dz = t3[2] - eye[2], lx = dx * fz - dz * fx, lz = dx * fx + dz * fz;
          // the pitch against the clip's own (crowdSit.js look0: a reader already looks down at its book), through a crossfade
          const p0 = (cA.look0 || 0) * (1 - st.w[i]) + (cB.look0 || 0) * st.w[i];
          ty = Math.max(-1.25, Math.min(1.25, Math.atan2(lx, lz))); tp = Math.max(-0.6, Math.min(0.35, Math.atan2(dy, Math.hypot(lx, lz)) - p0));
        }
        const a = gzGap > 0.3 ? 1 : 1 - Math.exp(-dt / Math.max(0.05, st.gzTau[i]));
        st.gzY[i] += (ty - st.gzY[i]) * a; st.gzP[i] += (tp - st.gzP[i]) * a;
        if (!st.gzMode[i] && Math.abs(st.gzY[i]) < 1e-3 && Math.abs(st.gzP[i]) < 1e-3) st.gzY[i] = st.gzP[i] = 0;
        // none on the chin-on-hand pose (the head rests on the hand); a bite or a sip takes the head to the hand, so the gaze
        // gives way over the key's envelope
        const gw = cA.spec && cA.spec.headSolve ? 0 : cA.spec && (cA.spec.arms === 'eat' || cA.spec.arms === 'cup') && kwA > 0 ? 1 - kwA : 1;
        gy = st.gzY[i] * gw; gp = st.gzP[i] * gw;
      }
      d[q + 44] = gy; d[q + 45] = gp; d[q + 46] = 0; d[q + 47] = 0;
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
      // keyed by the walker's seed, not its slot: peds.js moves the last walker into a freed slot (swap-with-last), and a
      // slot-keyed tint or height switched on or off mid-shot when a despawn 330 m away moved a walker near the lens
      const wk = Math.floor(st.seed[i] * 1e6);
      const topK = tintOn * (hash(wk, 7) < 0.55 ? 0.85 : 0);
      W.tint[0] = Cs[i * 3]; W.tint[1] = Cs[i * 3 + 1]; W.tint[2] = Cs[i * 3 + 2]; W.tint[3] = topK;
      const bt = BOTTOMS[Math.floor(sd * 7919) % BOTTOMS.length], sh = SHOES[Math.floor(sd * 104729) % SHOES.length];
      const botK = tintOn * (hash(wk, 11) < 0.6 ? 0.8 : 0);
      W.tint[4] = bt[0]; W.tint[5] = bt[1]; W.tint[6] = bt[2]; W.tint[7] = botK;
      W.tint[8] = sh[0]; W.tint[9] = sh[1]; W.tint[10] = sh[2]; W.tint[11] = tintOn * (hash(wk, 13) < 0.5 ? 0.7 : 0);
      if (idMode) { idc[0] = Cs[i * 3]; idc[1] = Cs[i * 3 + 1]; idc[2] = Cs[i * 3 + 2]; }
      const sets = this.sets.get(B.name);
      // LD31: the LOD from the lens to the walker's middle in 3D (the draw set and the shadow set below both take this li)
      const dx = x - cx, dz = z - cz, dy = this.lod3d ? y + 0.9 - cy : 0, d2 = dx * dx + dy * dy + dz * dz;
      const li = d2 < LOD0_2 ? 0 : d2 < LOD1_2 ? 1 : 2;
      d.set(W.layers, q + 12);
      d.set(W.tint, q + 28);
      if (vis && fade < 1) { sets.main[li].push(M, row, idMode ? idc : null, i); this.stats.visible++; this.stats.lod[li]++; }
      // SIT32 props: a seated walker's cup, wrap, book or paper, laptop, within 45 m of the lens
      if (this.props && this.sit32 && pose > 0 && vis && fade < 1 && d2 < 2025 && !idMode && B.sitBake && B.sitBake.props && B.sitBake.props[pose]) this._pushProps(i, B, pose, vScale, M, row);
      if (shv) { sets.shadow[Math.max(1, li)].push(M, row, null); this.stats.shadow++; }
    }
    if (this.props) { this.props.finish(); this.stats.props = this.props.count(); }
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
    if (CROWD_CHECK && (this._chkN = (this._chkN || 0) + 1) % CROWD_CHECK === 0) this._checkPose();
    this.stats.ms = performance.now() - t0;
  }
  // CHECK (?crowdcheck=N): read the pose rows back and test every row's bone matrices (skinning = G * inverse bind) for
  // rigidity (the 3x3 orthonormal, det 1) and for the posed joint (the matrix applied to the bone's bind joint) lying within
  // 2.5 m of the walker's origin; and every drawn instance's row for having been written this frame for that same walker.
  // Failures go to window.__CROWD_BAD (the last 50) and the console, with the slot, variant, body, LOD and clips; their
  // counts by kind to window.__CROWD_BADN ({ pose, draw }).
  _checkPose() {
    const r = this.engine.renderer, bad = (window.__CROWD_BAD = window.__CROWD_BAD || []);
    const cnt = (window.__CROWD_BADN = window.__CROWD_BADN || { pose: 0, draw: 0 });
    let checked = 0;
    // each target attachment is copied into a single-attachment float target and read from there, so the readback does
    // not depend on glReadBuffer over an MRT target (on D3D11 both ways read the root column as "not rigid 1.000" on every
    // row, SwiftShader both ways rigid; see the bone loop below)
    const C = this._chkCopy || (this._chkCopy = (() => {
      const mat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: POSE_VS, fragmentShader: 'precision highp float; precision highp sampler2D; uniform sampler2D uT; out vec4 o; void main() { o = texelFetch(uT, ivec2(gl_FragCoord.xy), 0); }', uniforms: { uT: { value: null } }, depthTest: false, depthWrite: false });
      const quad = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)), mat);
      quad.frustumCulled = false;
      return { mat, scene: new THREE.Scene().add(quad), cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), rt: new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false }) };
    })());
    const prevRT = r.getRenderTarget();
    for (const P of Object.values(this.passes)) {
      const n = P.rows, nb = P.S.nb;
      if (!n) continue;
      const buf = [0, 1, 2].map(() => new Float32Array(nb * n * 4));
      if (C.rt.width !== nb || C.rt.height !== n) C.rt.setSize(nb, n);
      for (let a = 0; a < 3; a++) {
        C.mat.uniforms.uT.value = P.rt.textures[a];
        r.setRenderTarget(C.rt);
        r.render(C.scene, C.cam);
        { const gl = r.getContext(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); }   // FR35: three's async reads leave a pack buffer bound
        r.readRenderTargetPixels(C.rt, 0, 0, nb, n, buf[a]);
      }
      for (let row = 0; row < n; row++) {
        const info = P.rowInfo && P.rowInfo[row], B = info && this.A.bodies[info.body];
        if (!B) continue;
        if (!B.bindJ) { B.bindJ = []; for (let b = 0; b < nb; b++) { const m = B.ibm.slice(b * 16, b * 16 + 16), R = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]], t = [m[12], m[13], m[14]]; B.bindJ.push([-(R[0] * t[0] + R[1] * t[1] + R[2] * t[2]), -(R[3] * t[0] + R[4] * t[1] + R[5] * t[2]), -(R[6] * t[0] + R[7] * t[1] + R[8] * t[2])]); } }
        let why = null;
        // from bone 1: the root's column read back as "not rigid (1.000)" on every row on D3D11 even through the copy pass
        // (SwiftShader: rigid), and no vertex of any body is weighted to crl_root, so it says nothing about what is drawn
        for (let b = 1; b < nb && !why; b++) {
          const o = (row * nb + b) * 4, a0 = buf[0], a1 = buf[1], a2 = buf[2];
          const R0 = [a0[o], a0[o + 1], a0[o + 2]], R1 = [a1[o], a1[o + 1], a1[o + 2]], R2 = [a2[o], a2[o + 1], a2[o + 2]], T = [a0[o + 3], a1[o + 3], a2[o + 3]];
          if (![...R0, ...R1, ...R2, ...T].every(Number.isFinite)) { why = `bone ${P.S.bones[b]} not finite`; break; }
          const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
          const err = Math.max(Math.abs(dot(R0, R0) - 1), Math.abs(dot(R1, R1) - 1), Math.abs(dot(R2, R2) - 1), Math.abs(dot(R0, R1)), Math.abs(dot(R0, R2)), Math.abs(dot(R1, R2)));
          if (err > 0.03) { why = `bone ${P.S.bones[b]} not rigid (${err.toFixed(3)})`; break; }
          const J = B.bindJ[b], p = [dot(R0, J) + T[0], dot(R1, J) + T[1], dot(R2, J) + T[2]];
          if (Math.hypot(p[0], p[2]) > 2.5 || p[1] < -0.5 || p[1] > 3) why = `bone ${P.S.bones[b]} joint at ${p.map((v) => v.toFixed(2)).join(',')}`;
        }
        checked++;
        if (why) { cnt.pose++; const e = { t: performance.now() | 0, skel: P.S.name, row, why, ...info }; bad.push(e); if (bad.length > 50) bad.shift(); console.warn('[crowd] POSE CHECK', JSON.stringify(e)); }
      }
    }
    r.setRenderTarget(prevRT);
    // the draw side: each drawn instance's row belongs to the walker drawn there
    for (const [bn, sets] of this.sets) {
      const P = this.passes[this.A.bodies[bn].skeleton];
      for (const x of sets.main) for (let k = 0; k < x.k; k++) {
        const row = x.attrs.aRow.array[k], info = P.rowInfo && P.rowInfo[row];
        if (!(row < P.rows) || !info || info.i !== x.src[k] || info.body !== bn) {
          const e = { t: performance.now() | 0, set: x.name, k, row, rows: P.rows, owner: info || null, src: x.src[k], why: 'instance row not this walker\'s' };
          cnt.draw++; bad.push(e); if (bad.length > 50) bad.shift(); console.warn('[crowd] POSE CHECK', JSON.stringify(e));
        }
      }
    }
    this.stats.checked = (this.stats.checked || 0) + checked;
  }
  // the sit2 look-dev scene: seats fitted and placed once (the walkers' variants set first), the furniture added to the scene
  _showSet(sh) {
    const L = sh.set, st = this.st;
    if (!sh.M || sh.M.length !== L.seats.length * 16) { sh.M = new Float32Array(L.seats.length * 16); sh.C = new Float32Array(L.seats.length * 3); L.seats.forEach((_, k) => sh.C.set(SHOW_TOPS[k % SHOW_TOPS.length], k * 3)); sh.list = L.seats.map((q) => q.v); }
    L.seats.forEach((q, k) => {
      if (st.variant[k] !== q.v) { st.variant[k] = q.v; st.clipA[k] = -1; st.fit[k] = 1; st.armPose[k] = 0; }
      st.seed[k] = (q.v + 0.5) / this.A.variants.length; st.phase[k] = k * 0.37; st.speed[k] = 0; st.amp[k] = 0; st.gait[k] = 0; st.pose[k] = q.pose;
    });
    if (!L.placed) {
      L.placed = true;
      L.fits = [];
      L.seats.forEach((q, k) => {
        const fit = this.fitSeat(k, q.seatH, q.pose), so = fit || this.seatOf(k, q.pose);
        L.fits.push({ k, v: q.v, pose: q.pose, fit: !!fit, so });
        const d = [Math.sin(q.yaw), Math.cos(q.yaw)], back = so ? so.back : 0.5;
        // the origin (feet) back m in front of the seat point, along the heading
        const x = sh.x + q.x + d[0] * back, z = sh.z + q.z + d[1] * back, c = Math.cos(q.yaw), si = Math.sin(q.yaw);
        sh.M.set([c, 0, -si, 0, 0, 1, 0, 0, si, 0, c, 0, x, sh.y + 0.001, z, 1], k * 16);
      });
      window.__SIT2 = L.fits;
      // SIT32 gaze: each table's sitters look by turns at each other, the top, or their own page (setTableGaze)
      if (SIT32) L.tables.forEach((t, ti) => { const ids = []; L.seats.forEach((q, k) => { if (q.table === ti) ids.push(k); }); if (ids.length > 1) this.setTableGaze(ids, sh.x + t.x, sh.y + 0.73, sh.z + t.z); });
      import('../city/bryantParkKit.js').then(({ chairGeo31, tableGeo31 }) => {
        const mat = new THREE.MeshStandardMaterial({ color: 0x2f4a3a, roughness: 0.55, metalness: 0.4 });   // the park's green-painted steel
        const add = (geo, x, z, yaw, y = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(sh.x + x, sh.y + y, sh.z + z); m.rotation.y = yaw; m.castShadow = m.receiveShadow = true; this.scene.add(m); };
        const cg = chairGeo31(), tr = tableGeo31(false), ts = tableGeo31(true);
        // the chair's centre 4 cm in front of its seat point, as sim/peds.js seats people (and SIT32's lean pose assumes)
        for (const q of L.seats) if (q.chair) add(cg, q.x + Math.sin(q.yaw) * 0.04, q.z + Math.cos(q.yaw) * 0.04, q.yaw);
        for (const t of L.tables) add(t.square ? ts : tr, t.x, t.z, t.yaw || 0);
        for (const b of L.benches) { const m = new THREE.Mesh(new THREE.BoxGeometry(b.len, 0.46, 0.45).translate(0, 0.23, 0), new THREE.MeshStandardMaterial({ color: 0x8c8a86, roughness: 0.85 })); m.position.set(sh.x + b.x, sh.y, sh.z + b.z); m.rotation.y = b.yaw; m.castShadow = m.receiveShadow = true; this.scene.add(m); }
        console.log('[crowd] sit2 furniture placed', L.seats.length, 'seats, fits', JSON.stringify(L.fits.map((x) => [x.v, x.pose, x.fit, x.so && x.so.up])));
      }).catch((e) => console.warn('[crowd] sit2 furniture failed', e?.message || e));
    }
  }
  // SIT32: walker i's props for pose p from the bake's nearest scale sample: a hand prop rides its bone (its bind frame x
  // the grip, so the pose row's skinning matrix carries it), a table item the walker's model frame; a book is one of three
  // covers or a folded newspaper, by the walker's seed
  _pushProps(i, B, p, vScale, M, row) {
    const e = B.sitBake, list = e.props[p], SC = this.passes.gen2.S.sitScales;
    let j = 0;
    if (list.length > 1 && SC) { const k = vScale / e.s0; let bd = 1e9; SC.forEach((v, n) => { if (Math.abs(v - k) < bd) { bd = Math.abs(v - k); j = n; } }); }
    const bones = this.passes.gen2.S.bones, h = hash(Math.floor(this.st.seed[i] * 1e6), 31);
    for (const x of list[Math.min(j, list.length - 1)]) {
      let kind = x.k, L = x.m, b = -1;
      if (x.b) {
        b = bones.indexOf(x.b);
        const Bm = (B._bindM || (B._bindM = {}))[b] || (B._bindM[b] = invRigid4(B.ibm.slice(b * 16, b * 16 + 16)));
        L = mul4(Bm, x.m, this._propL || (this._propL = new Array(16)));
      }
      if (kind === 'book') kind = h < 0.3 ? 'paper' : 'book' + Math.floor(h * 10) % 3;
      this.props.push(kind, M, row, b, L);
      if (kind === 'laptop') this.props.push('screen', M, row, b, L);
    }
  }
  // per-walker height: NYC adult means with a +-4 % spread, from the body's own bind height; keyed by the walker's seed
  // (setAnim carries it), not its slot, so a walker moved to another slot keeps its height
  _heightScale(V, B, i) {
    const key = V.age === 'child' ? 'child' : V.gender;
    const target = TARGET_H[key] * (0.96 + 0.08 * hash(Math.floor(this.st.seed[i] * 1e6), 3));
    const h = B.height * (V.scale || 1);
    return Math.max(0.7, Math.min(1.1, target / h));
  }
}

export async function createCrowd(scene, engine, cap = 700) {
  const assets = await loadCrowd(engine.renderer);
  if (!assets || !assets.variants.length) return null;
  return new Crowd(scene, engine, assets, cap);
}
