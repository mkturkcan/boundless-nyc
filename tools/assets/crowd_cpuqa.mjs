// CPU check of crowd bodies under the runtime's clips (no GPU): the pose pass of sim/crowd.js re-implemented in JS,
// linear-blend skinning of a body's LOD0, a small software rasteriser for front / side views, and per-clip foot metrics.
//   node tools/assets/crowd_cpuqa.mjs --bodies RB_Male_Adult_01,SK_AmerM_001_MH --clip s_neutral_walk --frames 0,10,20,30 --out qa.png
//   node tools/assets/crowd_cpuqa.mjs --bodies ... --clip s_neutral_walk --metrics
// Metrics per body: the lowest sole point over the cycle (floating > 0 / sinking < 0, metres, after the runtime's hips
// scaling) and the stance-foot slip when the clip plays at the rate the runtime uses for a walker at 1.3 m/s.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { RB_AVATARS, RB_ROOT } from './lib/rocketbox.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const PEDS = path.join(ROOT, 'boundlessjs/public/models/peds24');
const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const base = JSON.parse(fs.readFileSync(path.join(PEDS, 'manifest.json'), 'utf8'));
const rbM = path.join(PEDS, 'rb27', opt('rbmanifest', 'manifest.json'));
const extra = fs.existsSync(rbM) ? JSON.parse(fs.readFileSync(rbM, 'utf8')) : { bodies: {} };
const bodiesM = { ...base.bodies, ...extra.bodies };
const clipIdx = JSON.parse(fs.readFileSync(path.join(PEDS, 'clips.json'), 'utf8'));
const S = base.skeletons.gen2, NB = S.bones.length;
const clipData = new Float32Array(fs.readFileSync(path.join(PEDS, 'clips_gen2.bin')).buffer.slice(0));
const HIPS = S.bones.findIndex((b) => /hips/i.test(b));
const CY = opt('cy') != null ? Number(opt('cy')) : null;   // zoom: view centre height (m), with --scale px/m
const SHOWP = new Set((opt('props', '') || '').split(',').filter((x) => x !== '').map(Number));
// --tex: Rocketbox bodies sampled from their source colour TGAs (slot name -> <material>_color.tga), for identity sheets
const TEX = args.includes('--tex');
function tgaSampler(file, S = 512) {
  const b = fs.readFileSync(file);
  const idLen = b[0], w = b.readUInt16LE(12), h = b.readUInt16LE(14), ch = b[16] / 8, topDown = (b[17] & 0x20) !== 0;
  const px = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const sx = Math.floor((x + 0.5) * w / S); let sy = Math.floor((y + 0.5) * h / S); if (!topDown) sy = h - 1 - sy;
    const o = 18 + idLen + (sy * w + sx) * ch, d = (y * S + x) * 4;
    px[d] = b[o + 2]; px[d + 1] = b[o + 1]; px[d + 2] = b[o]; px[d + 3] = ch === 4 ? b[o + 3] : 255;
  }
  return (u, v) => { const x = Math.min(S - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * S))), y = Math.min(S - 1, Math.max(0, Math.floor((((v % 1) + 1) % 1) * S))); const d = (y * S + x) * 4; return [px[d], px[d + 1], px[d + 2], px[d + 3]]; };
}
function slotSamplers(name) {
  const A = RB_AVATARS.find((a) => 'RB_' + a.name === name);
  const B = bodiesM[name];
  if (!A || !B) return null;
  return B.slots.map((sl) => {
    const f = path.join(RB_ROOT, 'dl', A.group, A.name, 'Textures', sl.name.replace(/_(skin|eyes)$/, '') + '_color.tga');
    return fs.existsSync(f) ? tgaSampler(f) : null;
  });
}
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
await MeshoptDecoder.ready;

const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qrot = (q, v) => { const p = qmul(qmul(q, [v[0], v[1], v[2], 0]), [-q[0], -q[1], -q[2], q[3]]); return [p[0], p[1], p[2]]; };
const qn = (q) => { const l = Math.hypot(...q) || 1; return q.map((v) => v / l); };
const qToM = (q, t) => { const [x, y, z, w] = q; return [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y), 0, 2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x), 0, 2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y), 0, t[0], t[1], t[2], 1]; };
const mmul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; };

const clipBy = (n) => clipIdx.clips.find((c) => c.name === n && c.skeleton === 'gen2');
const hipsHOf = (B) => Math.hypot(B.refT[HIPS * 3], B.refT[HIPS * 3 + 1], B.refT[HIPS * 3 + 2]);
// the runtime's per-bone skinning matrices for body B at clip frame f (fractional)
function pose(B, clip, f) {
  const F = clip.frames, f0 = Math.floor(f), a = f - f0;
  const r0 = clip.row + (f0 % F), r1 = clip.row + ((f0 + 1) % F);
  const hs = hipsHOf(B) / (clip.hipsH || hipsHOf(B));
  const Gq = [], Gt = [], Sm = [];
  for (let b = 0; b < NB; b++) {
    const o0 = (r0 * NB + b) * 8, o1 = (r1 * NB + b) * 8;
    let q0 = Array.from(clipData.slice(o0, o0 + 4)), q1 = Array.from(clipData.slice(o1, o1 + 4));
    if (q0[0] * q1[0] + q0[1] * q1[1] + q0[2] * q1[2] + q0[3] * q1[3] < 0) q1 = q1.map((v) => -v);
    const valid = clipData[o0 + 7] > 0.5;
    const lq = valid ? qn(q0.map((v, i) => v + (q1[i] - v) * a)) : B.refR.slice(b * 4, b * 4 + 4);
    let lt = B.refT.slice(b * 3, b * 3 + 3);
    if (b === HIPS && valid) lt = [0, 1, 2].map((i) => (clipData[o0 + 4 + i] + (clipData[o1 + 4 + i] - clipData[o0 + 4 + i]) * a) * hs);
    const p = S.parents[b];
    if (p < 0) { Gq[b] = lq; Gt[b] = lt; }
    else { Gt[b] = qrot(Gq[p], lt).map((v, i) => v + Gt[p][i]); Gq[b] = qn(qmul(Gq[p], lq)); }
    Sm[b] = mmul(qToM(Gq[b], Gt[b]), B.ibm.slice(b * 16, b * 16 + 16));
  }
  return { Sm, Gt };
}
async function meshOf(name) {
  const B = bodiesM[name];
  const doc = await io.read(path.join(PEDS, B.file));
  const out = { P: [], I: [], J: [], W: [], cls: [], UV: [], SL: [], tex: TEX ? slotSamplers(name) : null };
  for (const n of doc.getRoot().listNodes()) {
    if (n.getName() !== 'LOD' + (opt('lod', '0')) || !n.getMesh()) continue;
    const M = n.getWorldMatrix();
    for (const p of n.getMesh().listPrimitives()) {
      const pa = p.getAttribute('POSITION'), ja = p.getAttribute('JOINTS_0'), wa = p.getAttribute('WEIGHTS_0'), pr = p.getAttribute('_PART'), ca = p.getAttribute('_CLS'), ta = p.getAttribute('TEXCOORD_0'), sa = p.getAttribute('_SLOT');
      const base = out.P.length / 3, v = [0, 0, 0], j = [0, 0, 0, 0], w = [0, 0, 0, 0];
      for (let i = 0; i < pa.getCount(); i++) {
        pa.getElement(i, v);
        out.P.push(M[0] * v[0] + M[4] * v[1] + M[8] * v[2] + M[12], M[1] * v[0] + M[5] * v[1] + M[9] * v[2] + M[13], M[2] * v[0] + M[6] * v[1] + M[10] * v[2] + M[14]);
        ja.getElement(i, j); wa.getElement(i, w);
        out.J.push(...j); out.W.push(...w);
        out.UV.push(ta ? ta.getElement(i, [0, 0])[0] : 0, ta ? ta.getElement(i, [0, 0])[1] : 0); out.SL.push(sa ? Math.round(sa.getScalar(i)) : -1);
        const part = pr ? Math.round(pr.getScalar(i)) : 0;
        out.cls.push(part >= 10 ? (SHOWP.has(part - 10) ? 4 : -1) : ca ? ca.getScalar(i) : 1);   // -1: a prop not shown (--props ids)
      }
      const ia = p.getIndices().getArray();
      for (let k = 0; k < ia.length; k += 3) {
        const a = base + ia[k], b = base + ia[k + 1], c = base + ia[k + 2];
        if (out.cls[a] < 0 || out.cls[b] < 0 || out.cls[c] < 0) continue;
        out.I.push(a, b, c);
      }
    }
  }
  return { B, ...out };
}
function skin(m, Sm) {
  const n = m.P.length / 3, O = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = m.P[i * 3], y = m.P[i * 3 + 1], z = m.P[i * 3 + 2];
    let ox = 0, oy = 0, oz = 0;
    for (let k = 0; k < 4; k++) {
      const w = m.W[i * 4 + k]; if (!w) continue;
      const M = Sm[m.J[i * 4 + k]];
      ox += w * (M[0] * x + M[4] * y + M[8] * z + M[12]); oy += w * (M[1] * x + M[5] * y + M[9] * z + M[13]); oz += w * (M[2] * x + M[6] * y + M[10] * z + M[14]);
    }
    O[i * 3] = ox; O[i * 3 + 1] = oy; O[i * 3 + 2] = oz;
  }
  return O;
}
// orthographic z-buffer raster: view 'front' (camera on +Z looking -Z) or 'side' (camera on +X looking -X)
function raster(img, W, H, x0, P, I, view, scale, cls, m = null) {
  const zb = img.zb;
  const proj = (i) => (view === 'front' ? [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]] : [-P[i * 3 + 2], P[i * 3 + 1], P[i * 3]]);
  for (let t = 0; t < I.length; t += 3) {
    const a = proj(I[t]), b = proj(I[t + 1]), c = proj(I[t + 2]);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const nl = Math.hypot(...nrm) || 1;
    const shade = Math.max(0.15, Math.abs(nrm[2] / nl) * 0.75 + (nrm[1] / nl) * 0.15 + 0.1);
    const col = cls[I[t]] === 0 ? [230, 180, 150] : cls[I[t]] === 3 ? [90, 70, 50] : cls[I[t]] === 2 ? [255, 255, 255] : cls[I[t]] === 4 ? [220, 90, 60] : [150, 160, 190];
    const sx = (p) => x0 + W / 2 + p[0] * scale, sy = (p) => (CY != null ? H / 2 - (p[1] - CY) * scale : H - 20 - p[1] * scale);
    const A = [sx(a), sy(a), a[2]], Bv = [sx(b), sy(b), b[2]], C = [sx(c), sy(c), c[2]];
    const minX = Math.max(x0, Math.floor(Math.min(A[0], Bv[0], C[0]))), maxX = Math.min(x0 + W - 1, Math.ceil(Math.max(A[0], Bv[0], C[0])));
    const minY = Math.max(0, Math.floor(Math.min(A[1], Bv[1], C[1]))), maxY = Math.min(H - 1, Math.ceil(Math.max(A[1], Bv[1], C[1])));
    const den = (Bv[1] - C[1]) * (A[0] - C[0]) + (C[0] - Bv[0]) * (A[1] - C[1]);
    if (Math.abs(den) < 1e-9) continue;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const l1 = ((Bv[1] - C[1]) * (x - C[0]) + (C[0] - Bv[0]) * (y - C[1])) / den, l2 = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (y - C[1])) / den, l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      const z = l1 * A[2] + l2 * Bv[2] + l3 * C[2];
      const o = y * img.w + x;
      if (z <= zb[o]) continue;
      let cc = col;
      const smp = m && m.tex && m.SL[I[t]] >= 0 && m.SL[I[t]] < 100 ? m.tex[m.SL[I[t]]] : null;
      if (smp) {
        const u = l1 * m.UV[I[t] * 2] + l2 * m.UV[I[t + 1] * 2] + l3 * m.UV[I[t + 2] * 2], v = l1 * m.UV[I[t] * 2 + 1] + l2 * m.UV[I[t + 1] * 2 + 1] + l3 * m.UV[I[t + 2] * 2 + 1];
        const c = smp(u, v);
        if (cls[I[t]] === 3 && c[3] < 90) continue;   // hair cards: alpha-tested as at runtime
        cc = c;
      }
      zb[o] = z;
      const sh = smp ? 0.55 + 0.45 * shade : shade;
      img.px[o * 3] = Math.min(255, cc[0] * sh); img.px[o * 3 + 1] = Math.min(255, cc[1] * sh); img.px[o * 3 + 2] = Math.min(255, cc[2] * sh);
    }
  }
}

const names = opt('bodies', 'RB_Male_Adult_01,SK_AmerM_001_MH').split(',');
const clip = clipBy(opt('clip', 's_neutral_walk'));
if (!clip) throw new Error('no clip');
const meshes = [];
for (const n of names) meshes.push(await meshOf(n));
if (args.includes('--metrics')) {
  for (const m of meshes) {
    const hH = hipsHOf(m.B);
    // sole = vertices weighted mostly to the feet / toes
    const footJ = new Set(S.bones.map((b, i) => (/foot|toe/i.test(b) ? i : -1)).filter((i) => i >= 0));
    const sole = [];
    for (let i = 0; i < m.P.length / 3; i++) if (footJ.has(m.J[i * 4]) && m.W[i * 4] > 0.6 && m.P[i * 3 + 1] < 0.04) sole.push(i);
    let lowMin = 1e9, lowMax = -1e9;
    const lows = [];
    const Ffr = clip.frames;
    const refB = Object.values(base.bodies).find((B) => B.skeleton === 'gen2' && B.height > 1.5);
    const gait = hH / hipsHOf(refB);
    for (let f = 0; f < Ffr; f++) {
      const { Sm } = pose(m.B, clip, f);
      let low = 1e9;
      for (const i of sole) {
        const x = m.P[i * 3], y = m.P[i * 3 + 1], z = m.P[i * 3 + 2];
        let oy = 0;
        for (let k = 0; k < 4; k++) { const w = m.W[i * 4 + k]; if (!w) continue; const M = Sm[m.J[i * 4 + k]]; oy += w * (M[1] * x + M[5] * y + M[9] * z + M[13]); }
        low = Math.min(low, oy);
      }
      lows.push(low); lowMin = Math.min(lowMin, low); lowMax = Math.max(lowMax, low);
    }
    // stance slip: the planted foot joint's ground velocity in body space, times the runtime rate for 1.3 m/s
    let slip = 0;
    if (clip.kind === 'walk' && clip.speed > 0.1) {
      const rate = Math.min(2.3, Math.max(0.5, 1.3 / (clip.speed * gait)));
      const fi = ['L', 'R'].map((s) => S.bones.indexOf(`crl_foot__${s}`));
      const vs = [];
      for (let f = 0; f < Ffr; f++) {
        const g0 = pose(m.B, clip, f).Gt, g1 = pose(m.B, clip, (f + 1) % Ffr).Gt;
        const k = g0[fi[0]][1] < g0[fi[1]][1] ? 0 : 1;
        const p0 = g0[fi[k]], p1 = g1[fi[k]];
        if (p0[1] - Math.min(g0[fi[0]][1], g0[fi[1]][1]) > 0.02) continue;
        vs.push(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) * clip.fps * rate);
      }
      // body-space foot speed while planted should equal the walker's ground speed (1.3 m/s): the residue slides
      const mv = vs.reduce((s, v) => s + v, 0) / Math.max(1, vs.length);
      slip = mv - 1.3;
    }
    console.log(`${m.B.file.split('/').pop().padEnd(34)} hipsH ${hH.toFixed(3)} gait ${gait.toFixed(3)} sole low min ${lowMin.toFixed(3)} max ${lowMax.toFixed(3)} (m)  stance slip ${slip.toFixed(3)} m/s`);
  }
}
const out = opt('out');
if (out) {
  const frames = (opt('frames', '0')).split(',').map(Number);
  const scale = Number(opt('scale', '260')), W = Number(opt('w', '260')), H = Number(opt('h', '520'));
  const cols = meshes.length * 2;
  const img = { w: cols * W, h: frames.length * H, px: Buffer.alloc(cols * W * frames.length * H * 3, 40), zb: null };
  for (let fi = 0; fi < frames.length; fi++) {
    const sub = { w: img.w, h: H, px: Buffer.alloc(img.w * H * 3, 40), zb: new Float32Array(img.w * H).fill(-1e9) };
    meshes.forEach((m, k) => {
      const { Sm } = pose(m.B, clip, frames[fi] % clip.frames);
      const P = skin(m, Sm);
      sub.zb.fill(-1e9, 0);
      raster(sub, W, H, k * 2 * W, P, m.I, 'front', scale, m.cls, m);
      if (!args.includes('--frontonly')) raster(sub, W, H, (k * 2 + 1) * W, P, m.I, 'side', scale, m.cls, m);
    });
    sub.px.copy(img.px, fi * img.w * H * 3);
  }
  await sharp(img.px, { raw: { width: img.w, height: img.h, channels: 3 } }).png().toFile(out);
  console.log('wrote', out, `${clip.name} frames ${frames.join(',')} of ${clip.frames}`);
}
