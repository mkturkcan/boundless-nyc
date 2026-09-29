// GP31 ground PBR bank: scanned CC0 sets (ambientCG, Poly Haven) -> two KTX2 2D-array textures for the ground shader.
//   node tools/assets/encode_ground_pbr.mjs <srcDir> [outDir=boundlessjs/public/textures]
//
// gp31_alb.ktx2  sRGB  RGB = albedo with its lowest frequencies flattened, A = height (displacement, 1-99 % stretched)
// gp31_nrm.ktx2  linear RG = tangent normal XY (OpenGL, +Y up the texture), B = roughness, A = ambient occlusion
//                the last layer is the 30 m aerial asphalt: R = luminance / mean (x 0.5), G = roughness, B = AO, A = height
// Layers 0-5 are the same set in both arrays; nrm layer 6 is the aerial scan.
// Every layer is 2048 x 2048 with a full mip chain, UASTC (BC7 on desktop, 1 byte a texel: 5.3 MB a layer on the GPU).
// Two arrays instead of one sampler per map: the ground shader was already at the 16-sampler limit (docs/notes/surfaces.md
// section 6) and these two replace six. The linear means printed at the end go into GP31_SETS in world/materials.js,
// which divides by them so a surface keeps its calibrated tone at every distance (the mip chain converges to the mean).
// Sources and licences: docs/notes/ground-pbr.md.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { BASISU } from './lib/tex.mjs';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
sharp.cache(false);

const here = path.dirname(fileURLToPath(import.meta.url));
const [,, srcArg, outArg] = process.argv;
if (!srcArg) { console.error('usage: node tools/assets/encode_ground_pbr.mjs <srcDir> [outDir]'); process.exit(2); }
const src = path.resolve(srcArg);
const out = path.resolve(outArg || path.join(here, '..', '..', 'boundlessjs', 'public', 'textures'));
const tex = path.join(here, '..', '..', 'boundlessjs', 'public', 'textures');
const N = 2048;

// layer order is the shader's (GP31_SETS in world/materials.js). flat = share of the tile-scale tone drift removed (a
// 1-2 m blotch that repeats every tile is the first thing that reads as tiling); sigma in texels of the 2048 map. The
// asphalt keeps its 10-40 cm mottling (sigma 380 = 37 cm at 2 m a tile): at 110 texels the flattening took out the tone
// structure that makes a road read at 2-5 m, and the hex tiling already breaks the repeat of anything larger.
// GP31_ONLY=alb re-encodes the albedo array alone.
const A = (id, m) => path.join(src, `${id}_2K`, `${id}_2K-JPG_${m}.jpg`);
const P = (id, m) => path.join(src, `${id}_${m}_2k.jpg`);
const LAYERS = [
  { key: 'asphA', col: A('Asphalt031', 'Color'), nrm: A('Asphalt031', 'NormalGL'), rgh: A('Asphalt031', 'Roughness'), ao: A('Asphalt031', 'AmbientOcclusion'), disp: A('Asphalt031', 'Displacement'), flat: 0.6, sigma: 380 },
  { key: 'asphB', col: P('asphalt_pit_lane', 'diff'), nrm: P('asphalt_pit_lane', 'nor_gl'), rgh: P('asphalt_pit_lane', 'rough'), ao: P('asphalt_pit_lane', 'ao'), disp: P('asphalt_pit_lane', 'disp'), flat: 0.6, sigma: 380 },
  { key: 'concA', col: A('Concrete048', 'Color'), nrm: A('Concrete048', 'NormalGL'), rgh: A('Concrete048', 'Roughness'), ao: A('Concrete048', 'AmbientOcclusion'), disp: A('Concrete048', 'Displacement'), flat: 0.75, sigma: 110 },
  { key: 'concB', col: A('Concrete037', 'Color'), nrm: A('Concrete037', 'NormalGL'), rgh: A('Concrete037', 'Roughness'), ao: A('Concrete037', 'AmbientOcclusion'), disp: A('Concrete037', 'Displacement'), flat: 0.75, sigma: 110 },
  // Poly Haven stone_wall_03, already in the bank as the campus cgranite set (jpg sources kept beside the ktx2)
  { key: 'granite', col: path.join(tex, 'cgranite_col.jpg'), nrm: path.join(tex, 'cgranite_nrm.jpg'), rgh: path.join(tex, 'cgranite_rgh.jpg'), ao: null, disp: null, flat: 0.6, sigma: 140 },
  // Poly Haven gravel_floor_02 (2.0 m): loose crushed stone, 5-10 mm, for Bryant Park's walks (matId 17)
  { key: 'gravel', col: P('gravel_floor_02', 'diff'), nrm: P('gravel_floor_02', 'nor_gl'), rgh: P('gravel_floor_02', 'rough'), ao: P('gravel_floor_02', 'ao'), disp: P('gravel_floor_02', 'disp'), flat: 0.7, sigma: 110 },
];
const MACRO = { key: 'macro', col: P('aerial_asphalt_01', 'diff'), rgh: P('aerial_asphalt_01', 'rough'), ao: P('aerial_asphalt_01', 'ao'), disp: P('aerial_asphalt_01', 'disp') };

const lin = new Float32Array(256); for (let i = 0; i < 256; i++) { const v = i / 255; lin[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
const enc = (v) => { v = Math.min(1, Math.max(0, v)); return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); };

async function load(file, channels) {
  if (!file || !fs.existsSync(file)) return null;
  const { data, info } = await sharp(file).resize(N, N, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (channels === 1) {   // first channel of a grey map
    const o = new Uint8Array(N * N); for (let i = 0; i < N * N; i++) o[i] = data[i * info.channels]; return o;
  }
  return { data, ch: info.channels };
}
// wrap-around separable box blur, 3 passes (~gaussian), on a w x w float map
function blurWrap(f, w, r) {
  let a = Float32Array.from(f), b = new Float32Array(w * w);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < w; y++) {
      let s = 0; for (let k = -r; k <= r; k++) s += a[y * w + ((k % w) + w) % w];
      for (let x = 0; x < w; x++) { b[y * w + x] = s / (2 * r + 1); s += a[y * w + (x + r + 1) % w] - a[y * w + ((x - r) % w + w) % w]; }
    }
    for (let x = 0; x < w; x++) {
      let s = 0; for (let k = -r; k <= r; k++) s += b[(((k % w) + w) % w) * w + x];
      for (let y = 0; y < w; y++) { a[y * w + x] = s / (2 * r + 1); s += b[((y + r + 1) % w) * w + x] - b[(((y - r) % w + w) % w) * w + x]; }
    }
  }
  return a;
}
// low-frequency luminance field of a linear RGB map, on a 256 grid, sampled back bilinearly (wrapping)
function lowFreq(rgbLin, sigma) {
  const w = 256, s = N / w, g = new Float32Array(w * w);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 3;
    g[((y / s) | 0) * w + ((x / s) | 0)] += (0.2126 * rgbLin[i] + 0.7152 * rgbLin[i + 1] + 0.0722 * rgbLin[i + 2]) / (s * s);
  }
  const r = Math.max(1, Math.round(sigma / s));   // 3 box passes of radius r: std ~ r + 0.5 cells
  const bl = blurWrap(g, w, r);
  return (x, y) => {
    const fx = x / s - 0.5, fy = y / s - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const at = (xx, yy) => bl[(((yy % w) + w) % w) * w + (((xx % w) + w) % w)];
    return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
  };
}
function stretch(g) {   // 1-99 % percentile stretch of a grey map to 0..255
  const h = new Uint32Array(256); for (const v of g) h[v]++;
  let lo = 0, hi = 255, acc = 0; const n = g.length;
  for (let i = 0; i < 256; i++) { acc += h[i]; if (acc > n * 0.01) { lo = i; break; } }
  acc = 0; for (let i = 255; i >= 0; i--) { acc += h[i]; if (acc > n * 0.01) { hi = i; break; } }
  const o = new Uint8Array(n); const d = Math.max(1, hi - lo);
  for (let i = 0; i < n; i++) o[i] = Math.max(0, Math.min(255, Math.round((g[i] - lo) / d * 255)));
  return o;
}

const tmp = path.join(src, '_gp31_tmp'); fs.mkdirSync(tmp, { recursive: true });
const albPng = [], nrmPng = [], stats = {};
for (const L of LAYERS) {
  const col = await load(L.col, 3), nrm = await load(L.nrm, 3), rgh = await load(L.rgh, 1), ao = await load(L.ao, 1), disp = await load(L.disp, 1);
  if (!col || !nrm || !rgh) throw new Error(`${L.key}: missing col/nrm/rgh`);
  const n = N * N, cl = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) cl[i * 3 + c] = lin[col.data[i * col.ch + c]];
  let mY = 0; for (let i = 0; i < n; i++) mY += 0.2126 * cl[i * 3] + 0.7152 * cl[i * 3 + 1] + 0.0722 * cl[i * 3 + 2]; mY /= n;
  const lf = lowFreq(cl, L.sigma);
  const alb = Buffer.alloc(n * 4), nb = Buffer.alloc(n * 4);
  const hgt = disp ? stretch(disp) : null;
  const mean = [0, 0, 0]; let mR = 0, mAO = 0, sdY = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const k = Math.min(2.0, Math.max(0.5, Math.pow(mY / Math.max(lf(x, y), 1e-5), L.flat)));
    for (let c = 0; c < 3; c++) { const v = cl[i * 3 + c] * k; mean[c] += v; alb[i * 4 + c] = enc(v); }
    const Y = (0.2126 * cl[i * 3] + 0.7152 * cl[i * 3 + 1] + 0.0722 * cl[i * 3 + 2]) * k; sdY += (Y - mY) * (Y - mY);
    alb[i * 4 + 3] = hgt ? hgt[i] : 128;
    nb[i * 4] = nrm.data[i * nrm.ch]; nb[i * 4 + 1] = nrm.data[i * nrm.ch + 1];
    nb[i * 4 + 2] = rgh[i]; nb[i * 4 + 3] = ao ? ao[i] : 255;
    mR += rgh[i] / 255; mAO += (ao ? ao[i] : 255) / 255;
  }
  let mH = 0; if (hgt) for (let i = 0; i < n; i++) mH += hgt[i] / 255; else mH = 0.502 * n;
  stats[L.key] = { mean: mean.map((v) => +(v / n).toFixed(4)), rough: +(mR / n).toFixed(3), ao: +(mAO / n).toFixed(3), hMean: +(mH / n).toFixed(3), cv: +(Math.sqrt(sdY / n) / mY).toFixed(3) };
  const pa = path.join(tmp, `alb_${L.key}.png`), pn = path.join(tmp, `nrm_${L.key}.png`);
  await sharp(alb, { raw: { width: N, height: N, channels: 4 } }).png().toFile(pa);
  await sharp(nb, { raw: { width: N, height: N, channels: 4 } }).png().toFile(pn);
  albPng.push(pa); nrmPng.push(pn);
  console.log(L.key, JSON.stringify(stats[L.key]));
}
const ONLY = process.env.GP31_ONLY || '';
if (ONLY !== 'alb') { // macro layer
  const M = MACRO, col = await load(M.col, 3), rgh = await load(M.rgh, 1), ao = await load(M.ao, 1), disp = await load(M.disp, 1);
  const n = N * N, Y = new Float32Array(n); let mY = 0;
  for (let i = 0; i < n; i++) { Y[i] = 0.2126 * lin[col.data[i * 3]] + 0.7152 * lin[col.data[i * 3 + 1]] + 0.0722 * lin[col.data[i * 3 + 2]]; mY += Y[i]; }
  mY /= n;
  const hgt = stretch(disp), nb = Buffer.alloc(n * 4); let mr = 0;
  for (let i = 0; i < n; i++) { const r = Y[i] / mY; mr += r; nb[i * 4] = Math.max(0, Math.min(255, Math.round(r * 127.5))); nb[i * 4 + 1] = rgh[i]; nb[i * 4 + 2] = ao[i]; nb[i * 4 + 3] = hgt[i]; }
  stats.macro = { lumMean: +mY.toFixed(4), ratioMean: +(mr / n).toFixed(4) };
  const pn = path.join(tmp, 'nrm_macro.png');
  await sharp(nb, { raw: { width: N, height: N, channels: 4 } }).png().toFile(pn);
  nrmPng.push(pn);
  console.log('macro', JSON.stringify(stats.macro));
}
const encode = (files, dst, linear) => {
  const args = ['-ktx2', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', '0.75', '-mipmap', '-tex_type', '2darray'];
  if (linear) args.push('-linear', '-mip_linear');
  for (const f of files) args.push('-file', f);
  args.push('-output_file', dst);
  execFileSync(BASISU, args, { stdio: 'pipe', maxBuffer: 64 << 20 });
  console.log(path.basename(dst), (fs.statSync(dst).size / 1048576).toFixed(2), 'MB,', files.length, 'layers');
};
encode(albPng, path.join(out, 'gp31_alb.ktx2'), false);
if (ONLY !== 'alb') encode(nrmPng, path.join(out, 'gp31_nrm.ktx2'), true);
fs.writeFileSync(path.join(out, 'gp31_stats.json'), JSON.stringify(stats, null, 1));
fs.rmSync(tmp, { recursive: true, force: true });
console.log('stats -> gp31_stats.json');
