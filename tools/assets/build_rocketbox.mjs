// Microsoft Rocketbox avatars -> extra crowd identities for the NYC twin (boundlessjs/public/models/peds24/rb27/).
//   node tools/assets/rocketbox_fetch.mjs                  (sources + FBX2glTF conversion into ~/.tools/rocketbox)
//   node tools/assets/build_rocketbox.mjs [--only Name,...] [--notex] [--noprops]
//
// Source: github.com/microsoft/Microsoft-Rocketbox (MIT licence, Copyright (c) 2020 Microsoft). Each avatar is one
// "hipoly" skinned mesh (~7-9k triangles; materials <id>_body, <id>_head, <id>_opacity) on a 3ds Max Biped (Bip01)
// skeleton in an A-pose, with 2048^2 colour / normal / specular TGAs.
//
// SKELETON. The avatars are re-bound to CARLA's 66-joint GEN2 skeleton (sim/crowd.js plays 54 GEN2 clips), so they are
// ordinary gen2 bodies at runtime: the same clips, walk styles, props and LODs as the CARLA set. Per body:
//   - joint positions come from the Rocketbox bind (Bip01 -> crl_* map in lib/rocketbox.mjs); finger / toe end joints
//     from the nub nodes; the hips joint sits above the thigh line by GEN2's hips-thigh offset scaled by leg length,
//     so hipsH (the runtime's clip-translation and stride scale) tracks this body's legs the way it does for CARLA's;
//   - each joint's orientation is the GEN2 reference bind orientation (a T-pose) turned by DELTA, the rotation that takes
//     the bone's anatomical frame in the GEN2 bind onto the same frame in the Rocketbox bind (primary axis = direction to
//     the child joint; secondary = lateral for the torso, elbow-flexion normal for the arm, index->pinky for the hand and
//     fingers, palm normal for the thumb, forward for the legs, up for the feet);
//   - refT = parent-local offsets in that matched pose, IBM = inverse(matched global). With every bone at a clip's local
//     rotation, a Rocketbox limb then moves exactly as the GEN2 limb does relative to its bind frame.
// Weights: Bip01 joints map onto crl_* joints (Spine1 -> the lower spine, facial joints -> the head, eyes -> crl_eye).
// Children (Bip02 rigs) use the CARLA GEN2 boy / girl as the reference bind and get the runtime's child clips.
// LODs: LOD0 = the source mesh after one level of Phong tessellation (~30k triangles), LOD1 / LOD2 simplified from the
// source mesh; the peds24 bags and phones are fitted per body as in build_peds.mjs.
// MATERIALS -> slots: body cloth / body skin (per triangle, by the texel's match to the hand skin tone), head skin, eyes
// (vertices on the eye joints), hair and lash cards (opacity material, alpha-tested). No garment recolour (_PART 0): one
// texture sheet carries shirt, jacket, tie and trousers together.
// TEXTURES go into this set's own KTX2 2D arrays (albedo 1024 sRGB, normal 512, orm 512, hair 1024 RGBA), the same
// layout as peds24/tex; the runtime binds them to these bodies only.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { weld, simplifyPrimitive, reorder, quantize, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import { BASISU } from './lib/tex.mjs';
import { FITS, loadProps, fitProps, propGeometry } from './lib/propfit.mjs';
import { invert } from './lib/mat4.mjs';
import { RB_AVATARS, RB_ROOT, RB_TO_GEN2 } from './lib/rocketbox.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const PEDS = path.join(ROOT, 'boundlessjs/public/models/peds24');
const SET = 'rb27';
const OUT = path.join(PEDS, SET);
const TMP = path.join(RB_ROOT, 'tmp');
const args = process.argv.slice(2);
const NOTEX = args.includes('--notex');
const ONLY = (() => { const i = args.indexOf('--only'); return i >= 0 ? args[i + 1].split(',') : null; })();
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const d of [path.join(OUT, 'tex'), path.join(OUT, 'bodies'), TMP]) fs.mkdirSync(d, { recursive: true });

// ---------------- vector / rotation helpers (3x3 rotations as three column vectors) ----------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => scl(a, 1 / (len(a) || 1));
const mid = (a, b) => scl(add(a, b), 0.5);
const mv = (M, v) => add(add(scl(M[0], v[0]), scl(M[1], v[1])), scl(M[2], v[2]));
const mm = (A, B) => [mv(A, B[0]), mv(A, B[1]), mv(A, B[2])];
const tr = (M) => [[M[0][0], M[1][0], M[2][0]], [M[0][1], M[1][1], M[2][1]], [M[0][2], M[1][2], M[2][2]]];
const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
function frame(a, b) {
  const e1 = norm(a);
  const e2 = norm(sub(b, scl(e1, dot(b, e1))));
  return [e1, e2, cross(e1, e2)];
}
const angleOf = (M) => (Math.acos(Math.min(1, Math.max(-1, (M[0][0] + M[1][1] + M[2][2] - 1) / 2))) * 180) / Math.PI;
function matToQuat(M) {
  // M columns -> quaternion (x, y, z, w)
  const m00 = M[0][0], m11 = M[1][1], m22 = M[2][2], m01 = M[1][0], m10 = M[0][1], m02 = M[2][0], m20 = M[0][2], m12 = M[2][1], m21 = M[1][2];
  const t = m00 + m11 + m22;
  let x, y, z, w;
  if (t > 0) { const s = 0.5 / Math.sqrt(t + 1); w = 0.25 / s; x = (m21 - m12) * s; y = (m02 - m20) * s; z = (m10 - m01) * s; }
  else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; }
  else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; }
  else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; }
  return [x, y, z, w];
}

// ---------------- GEN2 reference (the CARLA set's manifest) ----------------
const baseManifest = JSON.parse(fs.readFileSync(path.join(PEDS, 'manifest.json'), 'utf8'));
const SK = baseManifest.skeletons.gen2;
const NB = SK.bones.length;
const IDX = new Map(SK.bones.map((b, i) => [b, i]));
// reference bind per gender: an adult CARLA man and woman (T-pose)
const REF = { m: 'SK_AmerM_001_MH', f: 'SK_EuroW_', cm: 'SK_EuBoy02_GEN2_v2', cf: 'SK_EuGirl02_GEN2_CO' };
function bindOf(bodyName) {
  const B = baseManifest.bodies[bodyName];
  const R = [], P = [];
  for (let j = 0; j < NB; j++) {
    const g = invert(B.ibm.slice(j * 16, j * 16 + 16));
    R.push([[g[0], g[1], g[2]], [g[4], g[5], g[6]], [g[8], g[9], g[10]]]);
    P.push([g[12], g[13], g[14]]);
  }
  return { B, R, P, pos: (n) => P[IDX.get(n)] };
}
const GREF = Object.fromEntries(Object.entries(REF).map(([k, n]) => [k, bindOf(n)]));

// anatomical axes of a GEN2 bone from joint positions (P: GEN2 joint name -> position); null = inherit the parent's delta
const UP = [0, 1, 0], FWD = [0, 0, 1];
function axes(bone, P, opt) {
  const s = /__L$/.test(bone) ? 'L' : 'R';
  const J = (n) => P(n.replace('#', s));
  const lat = () => sub(P('crl_arm__L'), P('crl_arm__R'));
  if (bone === 'crl_root') return 'identity';
  if (bone === 'crl_hips__C') return [sub(P('crl_spine01__C'), P('crl_hips__C')), sub(P('crl_thigh__L'), P('crl_thigh__R'))];
  if (bone === 'crl_spine__C') return [sub(P('crl_spine01__C'), P('crl_spine__C')), lat()];
  if (bone === 'crl_spine01__C') return [sub(P('crl_neck__C'), P('crl_spine01__C')), lat()];
  if (bone === 'crl_neck__C') return [sub(P('crl_Head__C'), P('crl_neck__C')), lat()];
  if (bone === 'crl_Head__C') return [sub(mid(P('crl_eye__L'), P('crl_eye__R')), P('crl_Head__C')), sub(P('crl_eye__L'), P('crl_eye__R'))];
  if (/crl_eye__/.test(bone)) return null;
  if (/crl_shoulder__/.test(bone)) return [sub(J('crl_arm__#'), J('crl_shoulder__#')), UP];
  const handLat = () => sub(J('crl_handIndex__#'), J('crl_handPinky__#'));
  const flex = () => (opt.flex[s] ? cross(sub(J('crl_foreArm__#'), J('crl_arm__#')), sub(J('crl_hand__#'), J('crl_foreArm__#'))) : handLat());
  if (/crl_arm__/.test(bone)) return [sub(J('crl_foreArm__#'), J('crl_arm__#')), flex()];
  if (/crl_foreArm__/.test(bone)) return [sub(J('crl_hand__#'), J('crl_foreArm__#')), opt.foreByHand ? handLat() : flex()];
  if (/crl_hand__/.test(bone)) return [sub(J('crl_handMiddle__#'), J('crl_hand__#')), handLat()];
  const fm = bone.match(/^crl_hand(Thumb|Index|Middle|Ring|Pinky)(01|02|End)?__/);
  if (fm) {
    const seq = ['', '01', '02', 'End'], k = seq.indexOf(fm[2] || ''), f = fm[1];
    if (k === 3) return null;
    const a = sub(J(`crl_hand${f}${seq[k + 1]}__#`), J(`crl_hand${f}${seq[k]}__#`));
    const palmN = cross(sub(J('crl_handMiddle__#'), J('crl_hand__#')), handLat());
    return [a, f === 'Thumb' ? palmN : handLat()];
  }
  if (/crl_thigh__/.test(bone)) return [sub(J('crl_leg__#'), J('crl_thigh__#')), FWD];
  if (/crl_leg__/.test(bone)) return [sub(J('crl_foot__#'), J('crl_leg__#')), FWD];
  if (/crl_foot__/.test(bone)) return [sub(J('crl_toe__#'), J('crl_foot__#')), UP];
  if (/crl_toe__/.test(bone)) return [sub(J('crl_toeEnd__#'), J('crl_toe__#')), UP];
  return null;
}

// ---------------- TGA (uncompressed / RLE true-colour) ----------------
function readTGA(file) {
  const b = fs.readFileSync(file);
  const idLen = b[0], cmType = b[1], type = b[2];
  const w = b.readUInt16LE(12), h = b.readUInt16LE(14), bpp = b[16], desc = b[17];
  if (cmType !== 0 || (type !== 2 && type !== 10) || (bpp !== 24 && bpp !== 32)) throw new Error(`${path.basename(file)}: unsupported TGA type ${type} / ${bpp} bpp`);
  const ch = bpp / 8, topDown = (desc & 0x20) !== 0;
  const px = Buffer.alloc(w * h * ch);
  let o = 18 + idLen;
  if (type === 2) b.copy(px, 0, o, o + w * h * ch);
  else {
    let i = 0;
    while (i < w * h) {
      const c = b[o++], n = (c & 0x7f) + 1;
      if (c & 0x80) { for (let k = 0; k < n; k++) b.copy(px, (i + k) * ch, o, o + ch); o += ch; }
      else { b.copy(px, i * ch, o, o + n * ch); o += n * ch; }
      i += n;
    }
  }
  // BGR(A) -> RGB(A), rows top to bottom
  const out = Buffer.alloc(w * h * ch);
  for (let y = 0; y < h; y++) {
    const sy = topDown ? y : h - 1 - y;
    for (let x = 0; x < w; x++) {
      const s = (sy * w + x) * ch, d = (y * w + x) * ch;
      out[d] = px[s + 2]; out[d + 1] = px[s + 1]; out[d + 2] = px[s];
      if (ch === 4) out[d + 3] = px[s + 3];
    }
  }
  return { data: out, w, h, ch };
}
const tgaCache = new Map();
function tga(file) {
  if (!tgaCache.has(file)) { if (tgaCache.size > 6) tgaCache.delete(tgaCache.keys().next().value); tgaCache.set(file, readTGA(file)); }
  return tgaCache.get(file);
}
// RGB plane resized to S (never through an alpha channel: sharp premultiplies)
async function planeRGB(file, S) {
  const t = tga(file);
  let rgb = t.data;
  if (t.ch === 4) { rgb = Buffer.alloc(t.w * t.h * 3); for (let i = 0; i < t.w * t.h; i++) { rgb[i * 3] = t.data[i * 4]; rgb[i * 3 + 1] = t.data[i * 4 + 1]; rgb[i * 3 + 2] = t.data[i * 4 + 2]; } }
  return sharp(rgb, { raw: { width: t.w, height: t.h, channels: 3 } }).resize(S, S, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
}
async function planeA(file, S) {
  const t = tga(file);
  const a = Buffer.alloc(t.w * t.h);
  for (let i = 0; i < t.w * t.h; i++) a[i] = t.ch === 4 ? t.data[i * 4 + 3] : 255;
  return sharp(a, { raw: { width: t.w, height: t.h, channels: 1 } }).resize(S, S, { kernel: 'lanczos3', fit: 'fill' }).extractChannel(0).raw().toBuffer();
}
const toL = (b) => { const v = b / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toS = (v) => Math.round(255 * Math.min(1, Math.max(0, v >= 0.0031308 ? 1.055 * v ** (1 / 2.4) - 0.055 : 12.92 * v)));

// tangent-space convention of a normal map: the green axis whose slope field is curl-free (a baked height / surface
// gradient) is the right one. Returns 'dx' (green toward +row, as UE / CARLA) or 'gl'.
async function normalConvention(file) {
  const S = 256, p = await planeRGB(file, S);
  const sx = new Float32Array(S * S), sy = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const nx = p[i * 3] / 127.5 - 1, ny = p[i * 3 + 1] / 127.5 - 1, nz = Math.max(0.2, p[i * 3 + 2] / 127.5 - 1);
    sx[i] = -nx / nz; sy[i] = -ny / nz;
  }
  let cdx = 0, cgl = 0, n = 0;
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    const i = y * S + x;
    const dsy_dx = (sy[i + 1] - sy[i - 1]) / 2, dsx_dy = (sx[i + S] - sx[i - S]) / 2;
    if (Math.abs(dsy_dx) + Math.abs(dsx_dy) < 1e-3) continue;
    cdx += Math.abs(dsy_dx - dsx_dy); cgl += Math.abs(-dsy_dx - dsx_dy); n++;
  }
  return { conv: cdx < cgl ? 'dx' : 'gl', cdx: cdx / Math.max(1, n), cgl: cgl / Math.max(1, n) };
}

// ---------------- texture layers ----------------
const AL = 1024, NL = 512, HL = 1024;
const layers = [];          // opaque layers: { key, albedo, normal, orm }
const layerOf = new Map();
const hairLayers = [];
const hairOf = new Map();
function flatNormal(S) { const b = Buffer.alloc(S * S * 3); for (let i = 0; i < S * S; i++) { b[i * 3] = 128; b[i * 3 + 1] = 128; b[i * 3 + 2] = 255; } return b; }
function constRGB(S, r, g, b) { const o = Buffer.alloc(S * S * 3); for (let i = 0; i < S * S; i++) { o[i * 3] = r; o[i * 3 + 1] = g; o[i * 3 + 2] = b; } return o; }
function fixNormal(buf, flipG) { for (let i = 0; i < buf.length; i += 3) { let x = buf[i] / 127.5 - 1, y = (buf[i + 1] / 127.5 - 1) * (flipG ? -1 : 1), z = Math.max(0, buf[i + 2] / 127.5 - 1); const l = Math.hypot(x, y, z) || 1; buf[i] = Math.round((x / l + 1) * 127.5); buf[i + 1] = Math.round((y / l + 1) * 127.5); buf[i + 2] = Math.round((z / l + 1) * 127.5); } return buf; }
let NORMAL_FLIP = true;   // set from the curl test on the first avatar's maps
function opaqueLayer(tex) {
  if (layerOf.has(tex.color)) return layerOf.get(tex.color);
  const L = layers.length;
  layers.push({
    key: tex.color,
    albedo: () => planeRGB(tex.color, AL),
    normal: async () => (tex.normal ? fixNormal(await planeRGB(tex.normal, NL), NORMAL_FLIP) : flatNormal(NL)),
    orm: async () => {
      // Rocketbox "specular" = a grey specular-intensity sheet: shiny leather / hair / lips bright, fabric dark.
      // -> roughness (G), no occlusion map (R = 1), no metal (B = 0)
      if (!tex.spec) return constRGB(NL, 255, 210, 0);
      const p = await planeRGB(tex.spec, NL);
      for (let i = 0; i < p.length; i += 3) { const s = (p[i] + p[i + 1] + p[i + 2]) / 765; p[i] = 255; p[i + 1] = Math.round(255 * Math.min(0.95, Math.max(0.3, 0.95 - 0.75 * s))); p[i + 2] = 0; }
      return p;
    },
  });
  layerOf.set(tex.color, L);
  return L;
}
function hairLayer(tex) {
  if (hairOf.has(tex.color)) return hairOf.get(tex.color);
  const L = hairLayers.length;
  hairLayers.push({
    key: tex.color,
    build: async () => {
      const rgb = await planeRGB(tex.color, HL), a = await planeA(tex.color, HL);
      const px = Buffer.alloc(HL * HL * 4);
      for (let i = 0; i < HL * HL; i++) { px[i * 4] = rgb[i * 3]; px[i * 4 + 1] = rgb[i * 3 + 1]; px[i * 4 + 2] = rgb[i * 3 + 2]; px[i * 4 + 3] = a[i]; }
      return px;
    },
  });
  hairOf.set(tex.color, L);
  return L;
}
async function encodeArray(name, bufs, S, ch, kind) {
  const files = [];
  for (let i = 0; i < bufs.length; i++) {
    const f = path.join(TMP, `${name}_${String(i).padStart(3, '0')}.png`);
    await sharp(bufs[i], { raw: { width: S, height: S, channels: ch } }).png().toFile(f);
    files.push(f);
  }
  // encoded next to the live file and renamed over it at the end, so a running page never reads a half-written array
  const out = path.join(OUT, 'tex', `${name}.ktx2`), tmpOut = out.replace(/\.ktx2$/, '.new.ktx2');
  const a = ['-ktx2', '-tex_type', '2darray', '-mipmap', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', kind === 'normal' ? '0.5' : '1.0', '-output_file', tmpOut];
  if (kind === 'normal') a.push('-normal_map'); else if (kind === 'data') a.push('-linear');
  if (ch === 3) a.push('-no_alpha'); else a.push('-force_alpha');
  for (const f of files) a.push('-file', f);
  const t0 = Date.now();
  execFileSync(BASISU, a, { stdio: 'pipe', maxBuffer: 1 << 26 });
  for (let k = 0; ; k++) { try { fs.renameSync(tmpOut, out); break; } catch (e) { if (k > 40) throw e; await new Promise((r) => setTimeout(r, 250)); } }
  for (const f of files) fs.rmSync(f, { force: true });
  console.log(`  ${name}.ktx2: ${bufs.length} layers ${S}x${S}, ${(fs.statSync(out).size / 1048576).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return `${SET}/tex/${name}.ktx2`;
}

// ---------------- one avatar ----------------
const CLS = { skin: 0, cloth: 1, eye: 2, hair: 3 };
const ARM = /crl_(arm|foreArm|hand)/;
async function buildAvatar(A) {
  const glb = path.join(RB_ROOT, 'gltf', A.name + '.glb');
  const texDir = path.join(RB_ROOT, 'dl', A.group, A.name, 'Textures');
  const doc = await io.read(glb);
  const root = doc.getRoot();
  const meshNode = root.listNodes().find((n) => n.getMesh() && n.getSkin());
  const skin = meshNode.getSkin();
  const joints = skin.listJoints();
  // the children's rigs are named Bip02: every joint name is read as Bip01
  const nm = (n) => n.replace(/^Bip0\d/, 'Bip01');
  const jn = joints.map((j) => nm(j.getName()));
  const ibmA = skin.getInverseBindMatrices().getArray();
  const parentOf = new Map();
  for (const n of root.listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);
  // bind positions, Z-up mesh space -> body space (Y up, +Z forward): (x, y, z) -> (x, z, -y)
  const yup = (v) => [v[0], v[2], -v[1]];
  const rbPos = new Map();
  joints.forEach((j, i) => { const g = invert(Array.from(ibmA.slice(i * 16, i * 16 + 16))); rbPos.set(nm(j.getName()), yup([g[12], g[13], g[14]])); });
  // nub nodes (not skinned): world matrices are already Y-up and equal the bind (checked on Male_Adult_01)
  for (const n of root.listNodes()) if (!rbPos.has(nm(n.getName())) && /^Bip0\d/.test(n.getName())) { const m = n.getWorldMatrix(); rbPos.set(nm(n.getName()), [m[12], m[13], m[14]]); }
  const R = (n) => { const p = rbPos.get(n); if (!p) throw new Error(`${A.name}: joint ${n} missing`); return p; };

  // ---- matched GEN2 joint positions
  const G = GREF[(A.age === 'child' ? 'c' : '') + A.gender];
  const pm = new Array(NB).fill(null);
  const set = (g, p) => { pm[IDX.get(g)] = p; };
  set('crl_root', [0, 0, 0]);
  for (const [rb, g] of Object.entries(RB_TO_GEN2)) if (IDX.has(g)) set(g, R(rb));
  for (const s of ['L', 'R']) {
    for (const [f, k] of [['Thumb', 0], ['Index', 1], ['Middle', 2], ['Ring', 3], ['Pinky', 4]]) {
      const nub = rbPos.get(`Bip01 ${s} Finger${k}Nub`) || rbPos.get(`Bip01 ${s} Finger${k}2Nub`);
      const p1 = pm[IDX.get(`crl_hand${f}01__${s}`)], p2 = pm[IDX.get(`crl_hand${f}02__${s}`)];
      set(`crl_hand${f}End__${s}`, nub || add(p2, scl(sub(p2, p1), 0.85)));
    }
    const toe = pm[IDX.get(`crl_toe__${s}`)], foot = pm[IDX.get(`crl_foot__${s}`)];
    const tn = rbPos.get(`Bip01 ${s} Toe0Nub`);
    set(`crl_toeEnd__${s}`, tn || add(toe, scl(norm([toe[0] - foot[0], 0, toe[2] - foot[2]]), 0.045)));
  }
  // HIPS. The runtime scales a clip's hips translation AND its stride by hipsH (the hips joint's distance from the root),
  // but a stride is set by leg length (thigh -> knee -> ankle). The hips joint therefore goes where this body's leg length
  // over hipsH equals the GEN2 reference's: the same stride per hipsH, so a walk played at the runtime's rate plants the
  // feet as it does on the CARLA bodies (with GEN2's offset above the thighs scaled by leg length, the Rocketbox legs,
  // shorter against a higher ankle, slid ~4 % of walking speed). Stance height stays consistent to first order.
  const gThigh = mid(G.pos('crl_thigh__L'), G.pos('crl_thigh__R')), rThigh = mid(pm[IDX.get('crl_thigh__L')], pm[IDX.get('crl_thigh__R')]);
  const legLen = (P) => ['L', 'R'].reduce((q, s) => q + len(sub(P(`crl_leg__${s}`), P(`crl_thigh__${s}`))) + len(sub(P(`crl_foot__${s}`), P(`crl_leg__${s}`))), 0) / 2;
  const gHipsH = len(G.pos('crl_hips__C'));
  const legK = legLen((n) => pm[IDX.get(n)]) / legLen(G.pos);
  const hipsH = gHipsH * legK;
  const gOff = sub(G.pos('crl_hips__C'), gThigh);
  const hz = rThigh[2] + gOff[2] * legK;
  set('crl_hips__C', [0, Math.sqrt(Math.max(rThigh[1] * rThigh[1], hipsH * hipsH - hz * hz)), hz]);
  const miss = SK.bones.filter((b, i) => !pm[i]);
  if (miss.length) throw new Error(`${A.name}: unmatched GEN2 joints ${miss.join(',')}`);
  // LIFT: the Rocketbox soles sit ~1.2 cm lower than the CARLA soles under the same clips (crowd_cpuqa --metrics: walk
  // minimum 0.0 vs +1.3 cm, idle -1.5 vs -0.6 cm); the body and its joints (not the root) are raised by 8 mm to split it
  const LIFT = 0.008;
  for (let j = 1; j < NB; j++) pm[j] = [pm[j][0], pm[j][1] + LIFT, pm[j][2]];
  const PR = (n) => pm[IDX.get(n)];

  // ---- deltas and matched orientations
  // elbow flexion normal only where both binds bend the elbow by > 6 deg (else the hand's lateral axis)
  const bend = (P, s) => { const u = norm(sub(P(`crl_foreArm__${s}`), P(`crl_arm__${s}`))), f = norm(sub(P(`crl_hand__${s}`), P(`crl_foreArm__${s}`))); return (Math.acos(Math.min(1, dot(u, f))) * 180) / Math.PI; };
  const opt = { flex: { L: bend(G.pos, 'L') > 6 && bend(PR, 'L') > 6, R: bend(G.pos, 'R') > 6 && bend(PR, 'R') > 6 }, foreByHand: false };
  const delta = new Array(NB), Rm = new Array(NB);
  for (let j = 0; j < NB; j++) {
    const b = SK.bones[j], p = SK.parents[j];
    const ag = axes(b, G.pos, opt), ar = axes(b, PR, opt);
    if (ag === 'identity') delta[j] = I3;
    else if (!ag || !ar) delta[j] = p >= 0 ? delta[p] : I3;
    else delta[j] = mm(frame(ar[0], ar[1]), tr(frame(ag[0], ag[1])));
    Rm[j] = mm(delta[j], G.R[j]);
  }
  // wrist check: the forearm's and hand's deltas should agree up to the swing between them (a large twist between the
  // two reads as a broken wrist); report the relative angle
  const twist = ['L', 'R'].map((s) => {
    const q = matToQuat(mm(tr(delta[IDX.get(`crl_hand__${s}`)]), delta[IDX.get(`crl_foreArm__${s}`)]));
    const a = norm(sub(G.pos(`crl_hand__${s}`), G.pos(`crl_foreArm__${s}`)));
    return (2 * Math.atan2(q[0] * a[0] + q[1] * a[1] + q[2] * a[2], q[3]) * 180) / Math.PI;
  });
  const refT = new Array(NB * 3), ibm = new Array(NB * 16), refR = G.B.refR.slice();
  for (let j = 0; j < NB; j++) {
    const p = SK.parents[j];
    const t = p < 0 ? pm[j] : mv(tr(Rm[p]), sub(pm[j], pm[p]));
    refT.splice(j * 3, 3, ...t);
    const Rt = tr(Rm[j]), ti = scl(mv(Rt, pm[j]), -1);
    const m = [Rt[0][0], Rt[0][1], Rt[0][2], 0, Rt[1][0], Rt[1][1], Rt[1][2], 0, Rt[2][0], Rt[2][1], Rt[2][2], 0, ti[0], ti[1], ti[2], 1];
    for (let k = 0; k < 16; k++) ibm[j * 16 + k] = m[k];
  }

  // ---- skin joint -> canonical GEN2 index (nearest mapped ancestor)
  const remap = joints.map((j) => {
    let n = j;
    while (n) { const g = RB_TO_GEN2[nm(n.getName())]; if (g && IDX.has(g)) return IDX.get(g); n = parentOf.get(n); }
    return IDX.get('crl_hips__C');
  });

  // ---- geometry per material
  const texOf = (mat) => {
    const f = (k) => { const p = path.join(texDir, `${mat}_${k}.tga`); return fs.existsSync(p) ? p : null; };
    return { color: f('color'), normal: f('normal'), spec: f('specular') };
  };
  const mats = [];
  for (const prim of meshNode.getMesh().listPrimitives()) {
    const mat = prim.getMaterial()?.getName() || 'mat';
    const pa = prim.getAttribute('POSITION'), na = prim.getAttribute('NORMAL'), ta = prim.getAttribute('TEXCOORD_0'), ja = prim.getAttribute('JOINTS_0'), wa = prim.getAttribute('WEIGHTS_0');
    const n = pa.getCount();
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), T = new Float32Array(n * 2), J = new Uint8Array(n * 4), W = new Float32Array(n * 4), dom = new Int16Array(n);
    const v3 = [0, 0, 0], v2 = [0, 0], jv = [0, 0, 0, 0], wv = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const pp = yup(pa.getElement(i, v3)); pp[1] += LIFT;
      P.set(pp, i * 3); N.set(norm(yup(na.getElement(i, v3))), i * 3); T.set(ta.getElement(i, v2), i * 2);
      ja.getElement(i, jv); wa.getElement(i, wv);
      // merge influences that land on the same GEN2 joint, keep the top four, renormalise
      const acc = new Map();
      for (let k = 0; k < 4; k++) if (wv[k] > 0) { const c = remap[jv[k]]; acc.set(c, (acc.get(c) || 0) + wv[k]); }
      const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const s = top.reduce((q, e) => q + e[1], 0) || 1;
      for (let k = 0; k < 4; k++) { J[i * 4 + k] = top[k] ? top[k][0] : 0; W[i * 4 + k] = top[k] ? top[k][1] / s : 0; }
      if (!top.length) { J[i * 4] = IDX.get('crl_hips__C'); W[i * 4] = 1; }
      dom[i] = J[i * 4];
    }
    mats.push({ mat, P, N, T, J, W, dom, I: Uint32Array.from(prim.getIndices().getArray()), tex: texOf(mat), hair: /opacity/i.test(mat), head: /head/i.test(mat) });
  }
  // UV orientation check: the hands' texels on the body sheet must read as skin (red > green > blue) — FBX2glTF already
  // flips V to glTF's top-left origin; flip here only if the flipped lookup is the one that reads as skin
  const eyeJ = new Set([IDX.get('crl_eye__L'), IDX.get('crl_eye__R')]);
  const handJ0 = new Set(SK.bones.map((b, i) => (/crl_hand/.test(b) ? i : -1)).filter((i) => i >= 0));
  let vFlip = false;
  const bm = mats.find((m) => !m.head && !m.hair && m.tex.color);
  if (bm) {
    const t = tga(bm.tex.color);
    const at = (u, v) => { const x = Math.min(t.w - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * t.w))), y = Math.min(t.h - 1, Math.max(0, Math.floor((((v % 1) + 1) % 1) * t.h))); const o = (y * t.w + x) * t.ch; return [t.data[o], t.data[o + 1], t.data[o + 2]]; };
    let a = 0, b = 0, c = 0;
    const skinish = (p) => (p[0] > p[1] && p[1] >= p[2] * 0.9 && p[0] > 40 ? 1 : 0);
    for (let i = 0; i < bm.dom.length; i++) if (handJ0.has(bm.dom[i])) { a += skinish(at(bm.T[i * 2], bm.T[i * 2 + 1])); b += skinish(at(bm.T[i * 2], 1 - bm.T[i * 2 + 1])); c++; }
    if (c && b > a * 1.5 && b > c * 0.5) vFlip = true;
    if (c) console.log(`  hands: ${c} verts, skin-like texels ${(a / c * 100).toFixed(0)} % (V flipped ${(b / c * 100).toFixed(0)} %)${vFlip ? ' -> flip V' : ''}`);
  }
  if (vFlip) for (const m of mats) for (let i = 1; i < m.T.length; i += 2) m.T[i] = 1 - m.T[i];

  // ---- skin tone of the hands (body sheet) for the per-triangle skin / cloth split
  const handJ = new Set(SK.bones.map((b, i) => (/crl_hand/.test(b) ? i : -1)).filter((i) => i >= 0));
  let tone = null;     // median sRGB of the hands' texels on the body sheet
  const groups = [];   // { slot, cls, mat, tex, tris: [i0, i1, i2 ...] }
  const slots = [];
  const addSlot = (name, cls, tex, hair) => { slots.push({ name, cls, tex, hair }); return slots.length - 1; };
  for (const m of mats) {
    if (!m.tex.color) { console.warn(`  ${A.name}: ${m.mat} has no colour texture, dropped`); continue; }
    if (m.hair) { groups.push({ m, slot: addSlot(m.mat, 'hair', m.tex, true), cls: 'hair', I: m.I }); continue; }
    if (m.head) {
      const eye = [], rest = [];
      for (let t = 0; t < m.I.length; t += 3) { const k = [m.I[t], m.I[t + 1], m.I[t + 2]]; (k.every((v) => eyeJ.has(m.dom[v])) ? eye : rest).push(...k); }
      groups.push({ m, slot: addSlot(m.mat, 'skin', m.tex), cls: 'skin', I: Uint32Array.from(rest) });
      if (eye.length) groups.push({ m, slot: addSlot(m.mat + '_eyes', 'eye', m.tex), cls: 'eye', I: Uint32Array.from(eye) });
      continue;
    }
    const t = tga(m.tex.color);
    const texel = (u, v) => { const x = Math.min(t.w - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * t.w))), y = Math.min(t.h - 1, Math.max(0, Math.floor((((v % 1) + 1) % 1) * t.h))); const o = (y * t.w + x) * t.ch; return [toL(t.data[o]), toL(t.data[o + 1]), toL(t.data[o + 2])]; };
    const chroma = (c) => { const s = c[0] + c[1] + c[2] + 1e-6; return [c[0] / s, c[1] / s, 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]]; };
    const handC = [], handS = [];
    for (let q = 0; q < m.I.length; q += 3) {
      const k = [m.I[q], m.I[q + 1], m.I[q + 2]];
      if (!k.every((v) => handJ.has(m.dom[v]))) continue;
      const u = (m.T[k[0] * 2] + m.T[k[1] * 2] + m.T[k[2] * 2]) / 3, v = (m.T[k[0] * 2 + 1] + m.T[k[1] * 2 + 1] + m.T[k[2] * 2 + 1]) / 3;
      const c = texel(u, v);
      handC.push(chroma(c)); handS.push(c.map(toS));
    }
    if (handS.length > 20 && !tone) tone = [0, 1, 2].map((c) => { const a = handS.map((h) => h[c]).sort((x, y) => x - y); return a[a.length >> 1]; });
    let ref = null;
    if (handC.length > 20) ref = [0, 1, 2].map((c) => { const a = handC.map((h) => h[c]).sort((x, y) => x - y); return a[a.length >> 1]; });
    const nT = m.I.length / 3, isSkin = new Uint8Array(nT);
    for (let q = 0; q < nT; q++) {
      const k = [m.I[q * 3], m.I[q * 3 + 1], m.I[q * 3 + 2]];
      let hits = 0;
      if (ref) {
        const pts = [...k.map((v) => [m.T[v * 2], m.T[v * 2 + 1]]), [(m.T[k[0] * 2] + m.T[k[1] * 2] + m.T[k[2] * 2]) / 3, (m.T[k[0] * 2 + 1] + m.T[k[1] * 2 + 1] + m.T[k[2] * 2 + 1]) / 3]];
        for (const [u, v] of pts) { const c = chroma(texel(u, v)); if (Math.abs(c[0] - ref[0]) < 0.045 && Math.abs(c[1] - ref[1]) < 0.03 && c[2] > ref[2] * 0.4 && c[2] < ref[2] * 2.0) hits++; }
      }
      isSkin[q] = hits >= 3 ? 1 : 0;
    }
    // two passes of a neighbour majority vote (triangles sharing a vertex position): each triangle keeps one lighting model,
    // so isolated flips read as faceted patches (skin wraps the light past the terminator, cloth does not)
    const key = (v) => `${Math.round(m.P[v * 3] * 2000)},${Math.round(m.P[v * 3 + 1] * 2000)},${Math.round(m.P[v * 3 + 2] * 2000)}`;
    const byPos = new Map();
    for (let q = 0; q < nT; q++) for (let c = 0; c < 3; c++) { const kk = key(m.I[q * 3 + c]); if (!byPos.has(kk)) byPos.set(kk, []); byPos.get(kk).push(q); }
    for (let pass = 0; pass < 2; pass++) {
      const next = isSkin.slice();
      for (let q = 0; q < nT; q++) {
        const nb = new Set();
        for (let c = 0; c < 3; c++) for (const o of byPos.get(key(m.I[q * 3 + c]))) if (o !== q) nb.add(o);
        let sk = 0; for (const o of nb) sk += isSkin[o];
        if (nb.size >= 3) { if (sk * 3 > nb.size * 2) next[q] = 1; else if (sk * 3 < nb.size) next[q] = 0; }
      }
      isSkin.set(next);
    }
    const skinT = [], clothT = [];
    for (let q = 0; q < nT; q++) (isSkin[q] ? skinT : clothT).push(m.I[q * 3], m.I[q * 3 + 1], m.I[q * 3 + 2]);
    if (clothT.length) groups.push({ m, slot: addSlot(m.mat, 'cloth', m.tex), cls: 'cloth', I: Uint32Array.from(clothT) });
    if (skinT.length) groups.push({ m, slot: addSlot(m.mat + '_skin', 'skin', m.tex), cls: 'skin', I: Uint32Array.from(skinT) });
    console.log(`  ${m.mat}: ${clothT.length / 3} cloth + ${skinT.length / 3} skin tris (hand tone ${ref ? ref.map((v) => v.toFixed(3)).join(',') : '-'})`);
  }
  let ymax = 0;
  for (const g of groups) for (const i of g.I) ymax = Math.max(ymax, g.m.P[i * 3 + 1]);
  return { name: 'RB_' + A.name, A, refT, refR, ibm, groups, slots, height: +ymax.toFixed(3), twist, legK, vFlip, tone };
}

// skin + cloth bind positions for the prop fits, without the arms (in the A-pose the hands hang at hip height and would
// read as hip width)
function propVerts(B) {
  const out = [];
  for (const g of B.groups) {
    if (g.cls !== 'skin' && g.cls !== 'cloth') continue;
    const seen = new Set();
    for (const i of g.I) {
      if (seen.has(i)) continue;
      seen.add(i);
      if (ARM.test(SK.bones[g.m.dom[i]])) continue;
      out.push(g.m.P[i * 3], g.m.P[i * 3 + 1], g.m.P[i * 3 + 2]);
    }
  }
  return out;
}

// PHONG TESSELLATION (Boubekeur and Alexa 2008), one level: every triangle -> four, each new edge midpoint pulled toward
// the tangent planes of its two end vertices (alpha 0.75). The Rocketbox "hipoly" meshes are ~7-9k triangles; this rounds
// shoulders, heads and limbs at LOD0 without moving the original vertices. Displacement uses normals averaged per
// POSITION, so the two sides of a UV seam (split vertices, same position) get the same midpoint: no cracks.
const TESS = !args.includes('--notess');
function phongTess(g) {
  const m = g.m;
  const key = (v) => `${Math.round(m.P[v * 3] * 1e5)},${Math.round(m.P[v * 3 + 1] * 1e5)},${Math.round(m.P[v * 3 + 2] * 1e5)}`;
  const nsum = new Map();
  for (const v of g.I) { const k = key(v); const a = nsum.get(k) || [0, 0, 0]; a[0] += m.N[v * 3]; a[1] += m.N[v * 3 + 1]; a[2] += m.N[v * 3 + 2]; nsum.set(k, a); }
  const nAvg = (v) => norm(nsum.get(key(v)));
  const P = Array.from(m.P), N = Array.from(m.N), T = Array.from(m.T), J = Array.from(m.J), W = Array.from(m.W), dom = Array.from(m.dom);
  const mids = new Map();
  const midOf = (a, b) => {
    const k = a < b ? a + ',' + b : b + ',' + a;
    if (mids.has(k)) return mids.get(k);
    // symmetric in (a, b), on positions and position-averaged normals
    const [p, q] = key(a) < key(b) ? [a, b] : [b, a];
    const pa = [m.P[p * 3], m.P[p * 3 + 1], m.P[p * 3 + 2]], pb = [m.P[q * 3], m.P[q * 3 + 1], m.P[q * 3 + 2]];
    const na = nAvg(p), nb = nAvg(q);
    const c = mid(pa, pb);
    const prA = sub(c, scl(na, dot(sub(c, pa), na))), prB = sub(c, scl(nb, dot(sub(c, pb), nb)));
    const pos = add(scl(c, 0.25), scl(mid(prA, prB), 0.75));
    const o = P.length / 3;
    P.push(...pos);
    N.push(...norm(add([m.N[a * 3], m.N[a * 3 + 1], m.N[a * 3 + 2]], [m.N[b * 3], m.N[b * 3 + 1], m.N[b * 3 + 2]])));
    T.push((m.T[a * 2] + m.T[b * 2]) / 2, (m.T[a * 2 + 1] + m.T[b * 2 + 1]) / 2);
    const accw = new Map();
    for (const v of [a, b]) for (let k2 = 0; k2 < 4; k2++) { const w = m.W[v * 4 + k2]; if (w > 0) accw.set(m.J[v * 4 + k2], (accw.get(m.J[v * 4 + k2]) || 0) + w * 0.5); }
    const top = [...accw.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4), sw = top.reduce((s2, e) => s2 + e[1], 0) || 1;
    for (let k2 = 0; k2 < 4; k2++) { J.push(top[k2] ? top[k2][0] : 0); W.push(top[k2] ? top[k2][1] / sw : 0); }
    dom.push(top[0] ? top[0][0] : m.dom[a]);
    mids.set(k, o);
    return o;
  };
  const I = [];
  for (let t = 0; t < g.I.length; t += 3) {
    const a = g.I[t], b = g.I[t + 1], c = g.I[t + 2];
    const ab = midOf(a, b), bc = midOf(b, c), ca = midOf(c, a);
    I.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  return { ...g, m: { P, N, T, J, W, dom }, I };
}

async function writeBody(B, lodCfg, PROPSET) {
  const doc = new Document();
  const buf = doc.createBuffer();
  const rootN = doc.createNode(B.name);
  doc.createScene(B.name).addChild(rootN);
  const matO = doc.createMaterial('opaque').setExtras({ cls: 'opaque' }), matH = doc.createMaterial('hair').setExtras({ cls: 'hair' });
  const acc = (arr, type) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const lods = [];
  for (let li = 0; li < 3; li++) {
    const mesh = doc.createMesh('LOD' + li);
    for (const group of ['opaque', 'hair']) {
      const P = [], N = [], T = [], J = [], W = [], S = [], C = [], R = [], I = [];
      for (const g0 of B.groups) {
        if ((group === 'hair') !== (g0.cls === 'hair')) continue;
        if (li > 0 && g0.cls === 'eye') continue;
        // LOD0 (inside 9 m) of the opaque parts: one level of Phong tessellation, for rounder silhouettes up close
        const g = li === 0 && g0.cls !== 'hair' && TESS ? phongTess(g0) : g0;
        const m = g.m, map = new Map();
        for (const v of g.I) {
          let o = map.get(v);
          if (o == null) {
            o = P.length / 3; map.set(v, o);
            P.push(m.P[v * 3], m.P[v * 3 + 1], m.P[v * 3 + 2]); N.push(m.N[v * 3], m.N[v * 3 + 1], m.N[v * 3 + 2]); T.push(m.T[v * 2], m.T[v * 2 + 1]);
            for (let k = 0; k < 4; k++) { J.push(m.J[v * 4 + k]); W.push(m.W[v * 4 + k]); }
            S.push(g.slot); C.push(CLS[g.cls]); R.push(0);
          }
          I.push(o);
        }
      }
      if (!I.length) continue;
      const n = P.length / 3;
      mesh.addPrimitive(doc.createPrimitive().setMaterial(group === 'hair' ? matH : matO)
        .setAttribute('POSITION', acc(new Float32Array(P), 'VEC3')).setAttribute('NORMAL', acc(new Float32Array(N), 'VEC3'))
        .setAttribute('TEXCOORD_0', acc(new Float32Array(T), 'VEC2')).setAttribute('JOINTS_0', acc(new Uint8Array(J), 'VEC4'))
        .setAttribute('WEIGHTS_0', acc(new Float32Array(W), 'VEC4')).setAttribute('_SLOT', acc(new Float32Array(S), 'SCALAR'))
        .setAttribute('_CLS', acc(new Float32Array(C), 'SCALAR')).setAttribute('_PART', acc(new Float32Array(R), 'SCALAR'))
        .setIndices(acc(n > 65535 ? new Uint32Array(I) : new Uint16Array(I), 'SCALAR')));
    }
    rootN.addChild(doc.createNode('LOD' + li).setMesh(mesh));
    lods.push(mesh);
  }
  await doc.transform(weld({ tolerance: 0.00005 }));
  await MeshoptSimplifier.ready;
  const tris = (m) => m.listPrimitives().reduce((s, p) => s + p.getIndices().getCount() / 3, 0);
  const raw = tris(lods[1]);   // the untessellated body (LOD0 carries the tessellated one)
  for (let li = 1; li < 3; li++) {
    const ratio = Math.min(1, lodCfg[li] / raw);
    if (ratio >= 0.999) continue;
    for (const p of lods[li].listPrimitives()) {
      const hair = p.getMaterial() === matH;
      const err = li === 1 ? 0.006 : (hair ? 0.05 : 0.02);
      simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: Math.min(1, ratio * (hair ? 1.5 : 1)), error: err, lockBorder: false });
    }
  }
  // PROPS (lib/propfit.mjs), fitted in this body's bind pose from its matched GEN2 joints, as in build_peds.mjs
  const fits = PROPSET ? fitProps(B, IDX, propVerts(B), PROPSET) : [];
  for (let li = 0; li < 3 && fits.length; li++) {
    const prim = lods[li].listPrimitives().find((p) => p.getMaterial() === matO);
    if (!prim) continue;
    const get = (n) => Array.from(prim.getAttribute(n).getArray());
    const P = get('POSITION'), N = get('NORMAL'), T = get('TEXCOORD_0'), J = get('JOINTS_0'), W = get('WEIGHTS_0'), S = get('_SLOT'), C = get('_CLS'), R = get('_PART');
    const I = Array.from(prim.getIndices().getArray());
    for (const F of fits) {
      const g = propGeometry(PROPSET[F.prop], F, li);
      const base = P.length / 3;
      P.push(...g.P); N.push(...g.N); T.push(...g.U);
      for (let k = 0; k < g.P.length / 3; k++) { J.push(F.bone, F.bone2 ?? 0, 0, 0); W.push(g.Wt[k], 1 - g.Wt[k], 0, 0); S.push(100 + F.layer); C.push(1); R.push(10 + F.id); }
      for (const v of g.I) I.push(base + v);
    }
    prim.setAttribute('POSITION', acc(new Float32Array(P), 'VEC3')).setAttribute('NORMAL', acc(new Float32Array(N), 'VEC3'))
      .setAttribute('TEXCOORD_0', acc(new Float32Array(T), 'VEC2')).setAttribute('JOINTS_0', acc(new Uint8Array(J), 'VEC4'))
      .setAttribute('WEIGHTS_0', acc(new Float32Array(W), 'VEC4')).setAttribute('_SLOT', acc(new Float32Array(S), 'SCALAR'))
      .setAttribute('_CLS', acc(new Float32Array(C), 'SCALAR')).setAttribute('_PART', acc(new Float32Array(R), 'SCALAR'))
      .setIndices(acc(P.length / 3 > 65535 ? new Uint32Array(I) : new Uint16Array(I), 'SCALAR'));
  }
  for (const m of lods) for (const p of m.listPrimitives()) {
    const a = p.getAttribute('POSITION').getArray();
    for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i]) || Math.abs(a[i]) > 3) throw new Error(`${B.name}: vertex out of range (${a[i]}) in ${m.getName()}`);
  }
  const counts = lods.map(tris);
  rootN.setExtras({ body: B.name, skeleton: 'gen2', height: B.height, source: 'Microsoft Rocketbox (MIT)', props: fits.map((F) => F.id) });
  await doc.transform(prune({ keepAttributes: true }));
  await MeshoptEncoder.ready;
  await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize({ pattern: /^(POSITION|NORMAL|JOINTS_0|WEIGHTS_0)$/ }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  io.registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const out = path.join(OUT, 'bodies', B.name + '.glb');
  fs.writeFileSync(out, await io.writeBinary(doc));
  return { counts, bytes: fs.statSync(out).size, props: fits.map((F) => F.id) };
}

// ---------------- main ----------------
const t00 = Date.now();
const PROPSET = args.includes('--noprops') ? null : await loadProps();
const propLayer = new Map();
if (PROPSET) for (const F of FITS) {
  const pr = PROPSET[F.prop];
  const lk = F.prop + '|' + (F.recolor || []).join(',');
  if (propLayer.has(lk)) { F.layer = propLayer.get(lk); continue; }
  F.layer = layers.length;
  propLayer.set(lk, F.layer);
  layers.push({
    key: 'prop|' + lk,
    albedo: async () => {
      if (!pr.images.bc) return constRGB(AL, 60, 60, 64);
      const p = await sharp(pr.images.bc).removeAlpha().resize(AL, AL, { fit: 'fill' }).raw().toBuffer();
      if (F.recolor) {
        const Y = (i) => 0.2126 * toL(p[i]) + 0.7152 * toL(p[i + 1]) + 0.0722 * toL(p[i + 2]);
        let sY = 0, n = 0; for (let i = 0; i < p.length; i += 3 * 7) { sY += Y(i); n++; }
        const mY = sY / Math.max(1, n);
        for (let i = 0; i < p.length; i += 3) { const k = Math.min(2.2, Math.max(0.3, Y(i) / mY)); for (let c = 0; c < 3; c++) p[i + c] = toS(F.recolor[c] * k); }
      }
      return p;
    },
    normal: async () => (pr.images.n ? sharp(pr.images.n).removeAlpha().resize(NL, NL, { fit: 'fill' }).raw().toBuffer() : flatNormal(NL)),
    orm: async () => {
      if (!pr.images.mr) return constRGB(NL, 255, 205, 0);
      const p = await sharp(pr.images.mr).removeAlpha().resize(NL, NL, { fit: 'fill' }).raw().toBuffer();
      for (let i = 0; i < p.length; i += 3) { p[i] = 255; p[i + 2] = Math.min(p[i + 2], 40); }
      return p;
    },
  });
}
const manifest = {
  version: 2, set: SET, built: new Date().toISOString(),
  source: 'Microsoft Rocketbox Avatar Library (github.com/microsoft/Microsoft-Rocketbox), MIT licence, Copyright (c) 2020 Microsoft',
  license: { spdx: 'MIT', source: 'Microsoft Rocketbox Avatar Library', notice: `${SET}/NOTICE.md`, terms: ['https://github.com/microsoft/Microsoft-Rocketbox/blob/master/LICENSE.md'] },
  skeletons: {}, bodies: {}, variants: [], arrays: {},
};
let normalChecked = false;
for (const A of RB_AVATARS) {
  if (ONLY && !ONLY.includes(A.name)) continue;
  const t0 = Date.now();
  let B;
  try { B = await buildAvatar(A); } catch (e) { console.warn(`${A.name}: ${e.message}`); continue; }
  if (!normalChecked) {
    const nm = B.groups.find((g) => g.m.tex.normal && g.cls === 'cloth');
    if (nm) { const c = await normalConvention(nm.m.tex.normal); NORMAL_FLIP = c.conv === 'dx'; console.log(`  normal maps: ${c.conv} (curl dx ${c.cdx.toFixed(4)} / gl ${c.cgl.toFixed(4)}) -> ${NORMAL_FLIP ? 'flip green' : 'keep'}`); normalChecked = true; }
  }
  const w = await writeBody(B, [0, 4200, 1400], PROPSET);
  const layersOf = B.slots.map((s) => (s.hair ? hairLayer(s.tex) : opaqueLayer(s.tex)));
  manifest.bodies[B.name] = {
    file: `${SET}/bodies/${B.name}.glb`, skeleton: 'gen2', set: SET, height: B.height, lodTris: w.counts, props: w.props,
    slots: B.slots.map((s) => ({ name: s.name, cls: s.cls, part: 0 })),
    refT: B.refT.map((v) => +v.toFixed(5)), refR: B.refR.map((v) => +v.toFixed(6)), ibm: B.ibm.map((v) => +v.toFixed(6)),
  };
  // POOL WEIGHT (crowd.js: CARLA adults 10, heavy builds 4, children 2, police 1). The set is 45 identities against CARLA's
  // 37, and mostly light-skinned (hand medians sRGB ~190-220 red; seven at 131-172): light identities weigh 4 and the
  // darker ones 7, so the set is ~40 % of the crowd and the crowd's skin-tone mix stays close to the CARLA set's
  const weight = A.age === 'child' ? 2 : B.tone && B.tone[0] < 176 ? 7 : 4;
  manifest.variants.push({ name: B.name, body: B.name, set: SET, scale: 1, gender: A.gender, age: A.age || 'adult', uniform: null, build: 'regular', weight, tone: B.tone, layers: layersOf });
  console.log(`${B.name.padEnd(28)} h ${B.height} tone ${B.tone ? B.tone.join(',') : '-'} legK ${B.legK.toFixed(3)} wrist twist ${B.twist.map((v) => v.toFixed(1)).join('/')} deg, slots ${B.slots.length}, LOD ${w.counts.join('/')} ${(w.bytes / 1024).toFixed(0)} KB, props ${w.props.length}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
manifest.props = PROPSET ? FITS.map((F) => ({ id: F.id, prop: F.prop, fit: F.fit, side: F.side || null, layer: F.layer, credit: PROPSET[F.prop].credit })) : [];
manifest.arrays = { albedo: { size: AL, layers: layers.length }, normal: { size: NL, layers: layers.length }, orm: { size: NL, layers: layers.length }, hair: { size: HL, layers: hairLayers.length } };
console.log(`${layers.length} opaque layers, ${hairLayers.length} hair layers`);
if (!NOTEX) {
  const alb = [], nrm = [], orm = [], hair = [];
  for (const L of layers) { alb.push(await L.albedo()); nrm.push(await L.normal()); orm.push(await L.orm()); }
  for (const H of hairLayers) hair.push(await H.build());
  manifest.arrays.albedo.file = await encodeArray('albedo', alb, AL, 3, 'color');
  manifest.arrays.normal.file = await encodeArray('normal', nrm, NL, 3, 'normal');
  manifest.arrays.orm.file = await encodeArray('orm', orm, NL, 3, 'data');
  manifest.arrays.hair.file = await encodeArray('hair', hair, HL, 4, 'color');
} else {
  for (const k of ['albedo', 'normal', 'orm', 'hair']) if (fs.existsSync(path.join(OUT, 'tex', k + '.ktx2'))) manifest.arrays[k].file = `${SET}/tex/${k}.ktx2`;
}
// --nomanifest: a trial build (e.g. --only) that must not replace the live manifest -> manifest_trial.json (not loaded)
fs.writeFileSync(path.join(OUT, args.includes('--nomanifest') ? 'manifest_trial.json' : 'manifest.json'), JSON.stringify(manifest));
fs.copyFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'rocketbox_NOTICE.md'), path.join(OUT, 'NOTICE.md'));
console.log(`${SET} manifest: ${manifest.variants.length} variants in ${((Date.now() - t00) / 1000).toFixed(0)} s`);
