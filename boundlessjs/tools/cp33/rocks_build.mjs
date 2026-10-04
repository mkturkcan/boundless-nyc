// CP33 rocks: the park's schist outcrop and boulder assets (city/cpRocks.js, cpRocksKit.js; docs/notes/central-park-photoreal.md).
//   node boundlessjs/tools/cp33/rocks_build.mjs [--tex] [--models] [--keep]
// Sources (all CC0 1.0, Poly Haven, https://polyhaven.com/license):
//   textures  dark_rock_02 (Amal Kumar): the schist face, 2.0 m square;  lichen_rock: the lichen and moss crusts
//   models    boulder_01 (Rico Cilliers), rock_moss_set_01 / _02, rock_07, rock_09: photogrammetry scans; CP34 (2026-10-01):
//             namaqualand_boulder_02 .. _06 (granite boulders: the glacial erratics), stone_01 (all Poly Haven, CC0 1.0)
// Output:
//   public/textures/cp33/rocks/<set>_{alb,nrm,orm}.ktx2   alb sRGB (its low-frequency tone drift flattened, so the 2 m
//                                                         repeat does not show); nrm linear OpenGL; orm linear R AO,
//                                                         G roughness, B height
//   public/models/cp33/rocks/rocks.bin + rocks.json       every scanned rock piece, welded, set on its base, scaled to a
//                                                         1 m footprint, at three LODs (meshoptimizer), smooth normals
// The sources go to ~/.tools/texcache/cp33rocks and are deleted after packing (--keep keeps them).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');   // boundlessjs/
const require = createRequire(path.join(ROOT, '..', 'tools', 'assets', 'package.json'));
const sharp = require('sharp');
sharp.cache(false);
const { MeshoptSimplifier } = await import('file:///' + path.join(ROOT, '..', 'tools', 'assets', 'node_modules', 'meshoptimizer', 'index.module.js').replace(/\\/g, '/'));
const HOME = process.env.USERPROFILE || process.env.HOME;
const BASISU = `${HOME}/.tools/basisu/basis_universal-1_60/bin/basisu.exe`;
const SRC = `${HOME}/.tools/texcache/cp33rocks`;
const OUT_T = path.join(ROOT, 'public', 'textures', 'cp33', 'rocks');
const OUT_M = process.env.ROCKS_OUT_M || path.join(ROOT, 'public', 'models', 'cp33', 'rocks');   // (ROCKS_OUT_M: stage elsewhere first)
const UA = 'boundless-nyc-research/0.1 (project contact: github.com/boundless-nyc)';
const args = process.argv.slice(2);
const has = (k) => args.includes('--' + k);
const doTex = has('tex') || !has('models'), doModels = has('models') || !has('tex');
fs.mkdirSync(SRC, { recursive: true });
fs.mkdirSync(OUT_T, { recursive: true });
fs.mkdirSync(OUT_M, { recursive: true });

async function download(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      return file;
    } catch (e) { if (a === 2) throw e; await new Promise((res) => setTimeout(res, 1500 * (a + 1))); }
  }
}
const files = async (id) => (await fetch(`https://api.polyhaven.com/files/${id}`, { headers: { 'User-Agent': UA } })).json();

function basis(png, out, kind) {
  const a = ['-ktx2', '-mipmap', '-file', png, '-output_file', out];
  if (kind === 'albedo') a.push('-no_alpha', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', '1.0');
  else if (kind === 'normal') a.push('-no_alpha', '-normal_map', '-mip_renorm', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', '0.5');
  else a.push('-no_alpha', '-linear', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', '0.75');
  execFileSync(BASISU, a, { stdio: 'pipe' });
  return fs.statSync(out).size;
}

// ---------------------------------------------------------------- textures
const TEX = [
  { name: 'schist', id: 'dark_rock_02', res: 2048 },
  { name: 'lichen', id: 'lichen_rock', res: 2048 },
];
const LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) { const v = i / 255; LUT[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
const enc = (v) => { v = Math.min(1, Math.max(0, v)); return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); };
async function raw(file, W, ch) {
  let img = sharp(file).resize(W, W, { kernel: 'lanczos3', fit: 'fill' }).removeAlpha();
  if (ch === 1) img = img.extractChannel(0);
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  return data;
}
async function packTex(T) {
  const dir = path.join(SRC, T.id);
  fs.mkdirSync(dir, { recursive: true });
  const j = await files(T.id), tag = '2k';
  const want = { col: 'Diffuse', nrm: 'nor_gl', rgh: 'Rough', ao: 'AO', disp: 'Displacement' };
  const got = {};
  for (const [k, key] of Object.entries(want)) {
    const u = j[key]?.[tag]?.jpg?.url || j[key]?.[tag]?.png?.url;
    if (!u) continue;
    got[k] = await download(u, path.join(dir, k + path.extname(u)));
  }
  const W = T.res, n = W * W;
  const col = await raw(got.col, W, 3), nrm = await raw(got.nrm, W, 3);
  const rgh = got.rgh ? await raw(got.rgh, W, 1) : null, ao = got.ao ? await raw(got.ao, W, 1) : null, disp = got.disp ? await raw(got.disp, W, 1) : null;
  // albedo: the low-frequency luminance (a 32 x 32 box average, bilinear back up, wrapped) divided out, so the 2 m tile's
  // own light-dark drift does not repeat across an outcrop; the mean kept
  const G = 32, cs = W / G, low = new Float32Array(G * G);
  let mean = 0;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, L = 0.2126 * LUT[col[i * 3]] + 0.7152 * LUT[col[i * 3 + 1]] + 0.0722 * LUT[col[i * 3 + 2]];
    low[((y / cs) | 0) * G + ((x / cs) | 0)] += L; mean += L;
  }
  mean /= n;
  for (let i = 0; i < G * G; i++) low[i] /= cs * cs;
  const lowAt = (x, y) => {
    const fx = x / cs - 0.5, fy = y / cs - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const at = (a, b) => low[(((b % G) + G) % G) * G + (((a % G) + G) % G)];
    return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
  };
  const alb = Buffer.alloc(n * 3);
  let sr = 0, sg = 0, sb = 0;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, k = Math.min(1.7, Math.max(0.6, Math.pow(mean / Math.max(lowAt(x, y), 1e-5), 0.85)));
    const r = LUT[col[i * 3]] * k, g = LUT[col[i * 3 + 1]] * k, b = LUT[col[i * 3 + 2]] * k;
    sr += r; sg += g; sb += b;
    alb[i * 3] = enc(r); alb[i * 3 + 1] = enc(g); alb[i * 3 + 2] = enc(b);
  }
  const orm = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) { orm[i * 3] = ao ? ao[i] : 255; orm[i * 3 + 1] = rgh ? rgh[i] : 200; orm[i * 3 + 2] = disp ? disp[i] : 128; }
  const out = {};
  for (const [k, buf, kind] of [['alb', alb, 'albedo'], ['nrm', nrm, 'normal'], ['orm', orm, 'data']]) {
    const png = path.join(dir, `${T.name}_${k}.png`);
    await sharp(buf, { raw: { width: W, height: W, channels: 3 } }).png({ compressionLevel: 1 }).toFile(png);
    out[k] = basis(png, path.join(OUT_T, `${T.name}_${k}.ktx2`), kind);
    // a small JPG fallback for a GPU without a KTX2 transcode target
    await sharp(buf, { raw: { width: W, height: W, channels: 3 } }).resize(1024, 1024).jpeg({ quality: 88 }).toFile(path.join(OUT_T, `${T.name}_${k}.jpg`));
  }
  const m = [sr / n, sg / n, sb / n].map((v) => +v.toFixed(4));
  console.log(`[tex] ${T.name} (${T.id}): mean linear ${m.join(' ')}; ktx2 bytes`, out);
  if (!has('keep')) fs.rmSync(dir, { recursive: true, force: true });
  return { name: T.name, id: T.id, url: `https://polyhaven.com/a/${T.id}`, licence: 'CC0 1.0', mean: m, size: 2.0 };
}

// ---------------------------------------------------------------- models
const MODELS = ['boulder_01', 'rock_moss_set_01', 'rock_moss_set_02', 'rock_07', 'rock_09',
  'namaqualand_boulder_02', 'namaqualand_boulder_03', 'namaqualand_boulder_04', 'namaqualand_boulder_05', 'namaqualand_boulder_06', 'stone_01'];
const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function accessor(gl, bin, i) {
  const A = gl.accessors[i], V = gl.bufferViews[A.bufferView], T = CT[A.componentType], nc = NC[A.type];
  const off = (V.byteOffset || 0) + (A.byteOffset || 0), stride = V.byteStride || 0, es = T.BYTES_PER_ELEMENT;
  const out = new Float64Array(A.count * nc);
  if (!stride || stride === es * nc) {
    const a = new T(bin.buffer, bin.byteOffset + off, A.count * nc);
    for (let k = 0; k < out.length; k++) out[k] = a[k];
  } else {
    const dv = new DataView(bin.buffer, bin.byteOffset);
    for (let e = 0; e < A.count; e++) for (let c = 0; c < nc; c++) {
      const o = off + e * stride + c * es;
      out[e * nc + c] = T === Float32Array ? dv.getFloat32(o, true) : T === Uint16Array ? dv.getUint16(o, true) : T === Uint32Array ? dv.getUint32(o, true) : dv.getUint8(o);
    }
  }
  return out;
}
const mmul = (a, b) => { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
function trs(N) {
  if (N.matrix) return N.matrix.slice();
  const [tx, ty, tz] = N.translation || [0, 0, 0], [qx, qy, qz, qw] = N.rotation || [0, 0, 0, 1], [sx, sy, sz] = N.scale || [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz, xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2, wx = qw * x2, wy = qw * y2, wz = qw * z2;
  return [(1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0, (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0, (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0, tx, ty, tz, 1];
}
function smoothNormals(P, I) {
  const N = new Float32Array(P.length);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { N[v] += nx; N[v + 1] += ny; N[v + 2] += nz; }
  }
  for (let v = 0; v < N.length; v += 3) { const l = Math.hypot(N[v], N[v + 1], N[v + 2]) || 1; N[v] /= l; N[v + 1] /= l; N[v + 2] /= l; }
  return N;
}
async function packModels() {
  await MeshoptSimplifier.ready;
  const pieces = [], chunks = [];
  let off = 0;
  const push = (ta) => { const pad = (4 - (ta.byteLength % 4)) % 4; const b = Buffer.concat([Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength), Buffer.alloc(pad)]); const o = off; chunks.push(b); off += b.length; return o; };
  for (const id of MODELS) {
    const dir = path.join(SRC, id);
    fs.mkdirSync(dir, { recursive: true });
    const j = await files(id), G = j.gltf?.['1k']?.gltf;
    if (!G) { console.warn('[model] no gltf', id); continue; }
    const gf = await download(G.url, path.join(dir, id + '.gltf'));
    const binName = Object.keys(G.include).find((k) => k.endsWith('.bin'));
    const bf = await download(G.include[binName].url, path.join(dir, path.basename(binName)));
    const gl = JSON.parse(fs.readFileSync(gf, 'utf8')), bin = fs.readFileSync(bf);
    // every node with a mesh, with its world matrix
    const roots = gl.scenes[gl.scene || 0].nodes, list = [];
    const walk = (ni, M) => { const N = gl.nodes[ni], W = mmul(M, trs(N)); if (N.mesh !== undefined) list.push([N, W]); for (const c of N.children || []) walk(c, W); };
    for (const r of roots) walk(r, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    // a scanned asset with LODs ("lods": true) carries them as extra nodes: keep the densest of each name stem
    const best = new Map();
    for (const [N, W] of list) {
      const stem = (N.name || gl.meshes[N.mesh].name || 'p').replace(/_?LOD\d+$/i, '');
      const tris = gl.meshes[N.mesh].primitives.reduce((a, p) => a + (p.indices !== undefined ? gl.accessors[p.indices].count / 3 : 0), 0);
      if (!best.has(stem) || best.get(stem).tris < tris) best.set(stem, { N, W, tris, stem });
    }
    for (const { N, W, tris, stem } of best.values()) {
      if (tris < 1500) continue;   // pebbles
      // gather the primitives in world space, welded at 0.5 mm
      const P = [], I = [], map = new Map();
      for (const pr of gl.meshes[N.mesh].primitives) {
        if (pr.attributes.POSITION === undefined || pr.indices === undefined) continue;
        const pos = accessor(gl, bin, pr.attributes.POSITION), idx = accessor(gl, bin, pr.indices), remap = new Int32Array(pos.length / 3);
        for (let v = 0; v < pos.length / 3; v++) {
          const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
          const wx = W[0] * x + W[4] * y + W[8] * z + W[12], wy = W[1] * x + W[5] * y + W[9] * z + W[13], wz = W[2] * x + W[6] * y + W[10] * z + W[14];
          const key = `${Math.round(wx * 2000)},${Math.round(wy * 2000)},${Math.round(wz * 2000)}`;
          let k = map.get(key);
          if (k === undefined) { k = P.length / 3; map.set(key, k); P.push(wx, wy, wz); }
          remap[v] = k;
        }
        for (let t = 0; t < idx.length; t++) I.push(remap[idx[t]]);
      }
      // on its base, centred, its footprint's larger side 1
      let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
      for (let v = 0; v < P.length; v += 3) { x0 = Math.min(x0, P[v]); x1 = Math.max(x1, P[v]); y0 = Math.min(y0, P[v + 1]); y1 = Math.max(y1, P[v + 1]); z0 = Math.min(z0, P[v + 2]); z1 = Math.max(z1, P[v + 2]); }
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, s = 1 / Math.max(x1 - x0, z1 - z0);
      const Pf = new Float32Array(P.length);
      for (let v = 0; v < P.length; v += 3) { Pf[v] = (P[v] - cx) * s; Pf[v + 1] = (P[v + 1] - y0) * s; Pf[v + 2] = (P[v + 2] - cz) * s; }
      const I0 = Uint32Array.from(I);
      const lods = [];
      for (const target of [7000, 1400, 280]) {
        let ix = I0;
        if (I0.length / 3 > target) {
          const [r] = MeshoptSimplifier.simplify(I0, Pf, 3, target * 3, target > 3000 ? 0.004 : 0.05, []);
          ix = r;
        }
        // compact: only the vertices this LOD uses
        const used = new Int32Array(Pf.length / 3).fill(-1), vp = [];
        const ii = new Uint16Array(ix.length);
        for (let t = 0; t < ix.length; t++) { let u = used[ix[t]]; if (u < 0) { u = used[ix[t]] = vp.length / 3; vp.push(Pf[ix[t] * 3], Pf[ix[t] * 3 + 1], Pf[ix[t] * 3 + 2]); } ii[t] = u; }
        const vpf = Float32Array.from(vp), nrm = smoothNormals(vpf, ii);
        const n8 = new Int8Array(nrm.length);
        for (let k = 0; k < nrm.length; k++) n8[k] = Math.round(nrm[k] * 127);
        lods.push({ nv: vpf.length / 3, ni: ii.length, p: push(vpf), n: push(n8), i: push(ii) });
      }
      const dims = [+((x1 - x0) * s).toFixed(3), +((y1 - y0) * s).toFixed(3), +((z1 - z0) * s).toFixed(3)];
      pieces.push({ src: id, piece: stem, url: `https://polyhaven.com/a/${id}`, licence: 'CC0 1.0', size_m: [+(x1 - x0).toFixed(2), +(y1 - y0).toFixed(2), +(z1 - z0).toFixed(2)], dims, tris: lods.map((l) => l.ni / 3), lods });
      console.log(`[model] ${id}/${stem}: ${tris} tris, ${dims.join(' x ')} (1 m footprint) -> LOD ${lods.map((l) => l.ni / 3).join(' / ')}`);
    }
    if (!has('keep')) fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.writeFileSync(path.join(OUT_M, 'rocks.bin'), Buffer.concat(chunks));
  fs.writeFileSync(path.join(OUT_M, 'rocks.json'), JSON.stringify({ note: 'CP33 scanned rock pieces (tools/cp33/rocks_build.mjs); positions float32 on a 1 m footprint, normals int8x3, indices uint16', pieces }, null, 1));
  console.log(`[model] ${pieces.length} pieces, ${(off / 1e6).toFixed(2)} MB`);
}

const meta = { textures: [] };
if (doTex) for (const T of TEX) meta.textures.push(await packTex(T));
if (doModels) await packModels();
if (doTex) fs.writeFileSync(path.join(OUT_T, 'sets.json'), JSON.stringify(meta, null, 1));
