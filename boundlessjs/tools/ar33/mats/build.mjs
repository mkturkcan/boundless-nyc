// AR33 PBR library builder: download a CC0 set, calibrate it, pack it, encode it to KTX2.
//   node boundlessjs/tools/ar33/mats/build.mjs <set> [<set> ...] [--force] [--keep]     (sets: tools/ar33/mats/sets.mjs)
//   node boundlessjs/tools/ar33/mats/build.mjs --all | --gen (regenerate src/city/mat/pbrSets.js from packed.json)
// Output per set, boundlessjs/public/textures/pbr/<set>/:
//   albedo.ktx2  sRGB RGB, calibrated: tile-scale tone drift flattened, the mean set to the set's colour, the 1st / 99th
//                luminance percentiles compressed into sRGB 40..220 (no baked light, no crushed blacks)
//   normal.ktx2  linear RGB tangent-space normal, OpenGL (+Y up the texture), renormalised
//   orm.ktx2     linear RGBA: R occlusion, G roughness, B metalness, A height (or the paint coverage mask)
// The sources go to ~/.tools/texcache/ar33src/<id>_<res>/ and are deleted after packing (the zip at once; --keep keeps
// the maps). packed.json records every packed set (source, licence, size, means) and feeds src/city/mat/pbrSets.js.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { TEX, COURSE, MODULE } from './sets.mjs';
import { procSet } from './proc.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..', '..');   // boundlessjs/
const require = createRequire(path.join(ROOT, '..', 'tools', 'assets', 'package.json'));
const sharp = require('sharp');
sharp.cache(false);
const HOME = process.env.USERPROFILE || process.env.HOME;
const BASISU = process.platform === 'win32' ? `${HOME}/.tools/basisu/basis_universal-1_60/bin/basisu.exe` : '/data0/projectnyc_aux/.tools/basisu/basis_universal-1_60/bin/basisu';   // (Linux build, 2026-10-01)
const SRC = `${HOME}/.tools/texcache/ar33src`;
const OUT = path.join(ROOT, 'public', 'textures', 'pbr');
const DB = path.join(here, 'packed.json');
const GEN = path.join(ROOT, 'src', 'city', 'mat', 'pbrSets.js');
const UA = 'valdrada-research/0.1 (project contact: github.com/mkturkcan/valdrada)';
fs.mkdirSync(SRC, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) { const v = i / 255; LUT[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
const enc = (v) => { v = Math.min(1, Math.max(0, v)); return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); };
const dec = (s) => LUT[Math.max(0, Math.min(255, Math.round(s)))];
const hexLin = (h) => [1, 3, 5].map((i) => LUT[parseInt(h.slice(i, i + 2), 16)]);
const linHex = (c) => '#' + c.map((v) => enc(v).toString(16).padStart(2, '0')).join('');
const pow2 = (v) => 2 ** Math.round(Math.log2(v));

async function download(url, file) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      return file;
    } catch (e) { if (a === 2) throw e; await new Promise((res) => setTimeout(res, 1500 * (a + 1))); }
  }
}

// ---------------------------------------------------------------- sources
const KEYS = { col: /_Color\.jpg$/i, nrm: /_NormalGL\.jpg$/i, rgh: /_Roughness\.jpg$/i, ao: /_AmbientOcclusion\.jpg$/i, disp: /_Displacement\.jpg$/i, met: /_Metalness\.jpg$/i, opa: /_Opacity\.jpg$/i };
async function fetchAcg(T) {
  const tag = T.res >= 2048 ? '2K' : '1K';
  const dir = path.join(SRC, `${T.id}_${tag}`);
  const have = () => fs.existsSync(path.join(dir, 'col.jpg'));
  if (!have()) {
    fs.mkdirSync(dir, { recursive: true });
    const zip = path.join(SRC, `${T.id}_${tag}.zip`);
    await download(`https://ambientcg.com/get?file=${T.id}_${tag}-JPG.zip`, zip);
    try { execFileSync('unzip', ['-o', '-q', zip, '*.jpg', '-d', dir], { stdio: 'pipe' }); } catch (e) { /* unzip exits 11 when a pattern is unmatched */ }
    fs.rmSync(zip, { force: true });
    for (const f of fs.readdirSync(dir)) {
      const k = Object.keys(KEYS).find((key) => KEYS[key].test(f));
      if (k) fs.renameSync(path.join(dir, f), path.join(dir, `${k}.jpg`)); else fs.rmSync(path.join(dir, f), { force: true });
    }
  }
  return dir;
}
const PHKEYS = { Diffuse: 'col', nor_gl: 'nrm', Rough: 'rgh', AO: 'ao', Displacement: 'disp', Metal: 'met', Opacity: 'opa' };
async function fetchPh(T) {
  const tag = T.res >= 2048 ? '2k' : '1k';
  const dir = path.join(SRC, `${T.id}_${tag}`);
  if (!fs.existsSync(path.join(dir, 'col.jpg'))) {
    fs.mkdirSync(dir, { recursive: true });
    const r = await fetch(`https://api.polyhaven.com/files/${T.id}`, { headers: { 'User-Agent': UA } });
    const j = await r.json();
    await Promise.all(Object.entries(PHKEYS).map(async ([k, mine]) => {
      const f = j[k]?.[tag]?.jpg?.url || j[k]?.[tag]?.png?.url;
      if (f) await download(f, path.join(dir, `${mine}${path.extname(f)}`.replace('.png', '.jpg')));
    }));
  }
  return dir;
}

// ---------------------------------------------------------------- image helpers
async function load(file, W, H, grey) {
  if (!file || !fs.existsSync(file)) return null;
  let img = sharp(file).resize(W, H, { kernel: 'lanczos3', fit: 'fill' }).removeAlpha();
  if (grey) img = img.extractChannel(0);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, ch: info.channels };
}
// wrap-around separable box blur (3 passes ~ gaussian) on a w x h float grid
function blurWrap(f, w, h, r) {
  let a = Float32Array.from(f); const b = new Float32Array(w * h);
  const m = (v, n) => ((v % n) + n) % n;
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      let s = 0; for (let k = -r; k <= r; k++) s += a[y * w + m(k, w)];
      for (let x = 0; x < w; x++) { b[y * w + x] = s / (2 * r + 1); s += a[y * w + m(x + r + 1, w)] - a[y * w + m(x - r, w)]; }
    }
    for (let x = 0; x < w; x++) {
      let s = 0; for (let k = -r; k <= r; k++) s += b[m(k, h) * w + x];
      for (let y = 0; y < h; y++) { a[y * w + x] = s / (2 * r + 1); s += b[m(y + r + 1, h) * w + x] - b[m(y - r, h) * w + x]; }
    }
  }
  return a;
}
// low-frequency luminance of a linear RGB map (on a coarse grid, sampled back bilinearly with wrap)
function lowFreq(lin, W, H, sigmaPx) {
  const gw = 256, gh = Math.max(8, Math.round(256 * H / W)), sx = W / gw, sy = H / gh;
  const g = new Float32Array(gw * gh), cnt = new Float32Array(gw * gh);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3, c = Math.min(gh - 1, (y / sy) | 0) * gw + Math.min(gw - 1, (x / sx) | 0);
    g[c] += 0.2126 * lin[i] + 0.7152 * lin[i + 1] + 0.0722 * lin[i + 2]; cnt[c]++;
  }
  for (let i = 0; i < g.length; i++) g[i] /= Math.max(1, cnt[i]);
  const r = Math.max(1, Math.round(sigmaPx / sx));
  const bl = blurWrap(g, gw, gh, r);
  const m = (v, n) => ((v % n) + n) % n;
  return (x, y) => {
    const fx = x / sx - 0.5, fy = y / sy - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const at = (xx, yy) => bl[m(yy, gh) * gw + m(xx, gw)];
    return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
  };
}
function percentile(arr, p) {   // arr: Float32Array (copied, sorted)
  const s = Float32Array.from(arr).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))];
}
// ---------------------------------------------------------------- brick measurement
// normalised circular autocorrelation of a profile at lag L (fractional lags interpolate)
function acorr(p, L) {
  const n = p.length; let m = 0; for (const v of p) m += v; m /= n;
  let s0 = 0, s = 0;
  for (let i = 0; i < n; i++) {
    const a = p[i] - m; s0 += a * a;
    const j = i + L, j0 = Math.floor(j), t = j - j0;
    const b = (p[j0 % n] * (1 - t) + p[(j0 + 1) % n] * t) - m;
    s += a * b;
  }
  return s / Math.max(s0, 1e-9);
}
// the pattern's repeat count across the profile: the first autocorrelation peak after its first minimum is the
// fundamental period; the whole count N nearest to length / period is refined by the correlation at exactly length / N
function countRepeats(p, lo, hi) {
  const n = p.length, half = Math.floor(n / 2), r = new Float32Array(half + 1);
  for (let L = 1; L <= half; L++) r[L] = acorr(p, L);
  let L = 2; while (L < half && !(r[L] < r[L - 1] && r[L] <= r[L + 1])) L++;   // first minimum
  let pk = -1;
  for (let k = L + 1; k < half; k++) if (r[k] > r[k - 1] && r[k] >= r[k + 1] && r[k] > 0.15) { pk = k; break; }
  if (pk < 0) return { N: null, top: `no peak (first min ${L})` };
  let N0 = Math.round(n / pk), best = null;
  for (let N = Math.max(lo, N0 - 2); N <= Math.min(hi, N0 + 2); N++) { const c = acorr(p, n / N); if (!best || c > best[1]) best = [N, c]; }
  return { N: best ? best[0] : null, top: `peak ${pk}px r ${r[pk].toFixed(2)} -> N ${best ? best[0] + ' r ' + best[1].toFixed(2) : '?'}` };
}
function measureBrick(h, W, H) {   // h: grey Uint8 (height, AO or luminance), mortar LOW
  const rows = new Float32Array(H);
  for (let y = 0; y < H; y++) { let s = 0; for (let x = 0; x < W; x++) s += h[y * W + x]; rows[y] = s / W; }
  const cr = countRepeats(rows, 2, 80);
  if (!cr.N) return { courses: null, bricks: null, note: 'courses ? ' + cr.top };
  const L = H / cr.N;
  // fold the row profile into one course: the bed joint is its minimum
  const fold = new Float32Array(Math.round(L));
  for (let y = 0; y < H; y++) fold[Math.floor((y % L) / L * fold.length) % fold.length] += rows[y];
  let jmin = 0; for (let i = 1; i < fold.length; i++) if (fold[i] < fold[jmin]) jmin = i;
  const phase = jmin / fold.length * L;   // rows of the bed joint centre, mod L
  // per course: the column profile of its middle half (the brick bodies and head joints); the courses' profiles are
  // concatenated course by course is wrong for running bond (each is shifted), so each course is measured on its own and
  // the counts are voted
  const votes = new Map(); const tops = [];
  for (let k = 0; k < cr.N; k++) {
    const y0 = Math.round(phase + (k + 0.3) * L), y1 = Math.round(phase + (k + 0.7) * L);
    const col = new Float32Array(W);
    for (let y = y0; y < y1; y++) { const yy = ((y % H) + H) % H; for (let x = 0; x < W; x++) col[x] += h[yy * W + x]; }
    const c = countRepeats(col, 1, 80);
    if (c.N) votes.set(c.N, (votes.get(c.N) || 0) + 1);
    if (k < 3) tops.push(c.top);
  }
  const bv = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  // a unit shorter than ~2.2 courses is a half brick (headers in the bond): count in half-module steps
  const unit = bv[0] ? (W / bv[0][0]) / (H / cr.N) : 0;
  return { courses: cr.N, bricks: bv[0] ? bv[0][0] : null, half: unit > 0 && unit < 2.2, note: `unit ${unit.toFixed(2)} courses | ` + `courses ${cr.top} | bricks votes ${bv.slice(0, 4).map(([M, v]) => `${M}x${v}`).join(' ')} (${tops.join('; ')})` };
}

// ---------------------------------------------------------------- units (AR34)
// The units of a brick or tile set labelled on its height channel (the faces above the joint level found by Otsu's
// threshold, 4-connected, wrapping at the tile edges as the texture does), then each unit given a tone of its own
// (log-normal value, a warm / cool shift, a share of grey sooted units and of light replaced ones), a roughness of
// its own and a glaze tilt (the normal map), and the joints a neutral grey at T.units.joint of the faces' luminance.
// The packed mean is put back on the set's colour afterwards. Writes alb / nrm / orm in place; returns a note.
function units(T, W, H, alb, nrm, orm, rec) {
  const U = T.units, n = W * H;
  if (U.mask === 'chroma') return jointsByChroma(T, W, H, alb, rec);
  let s = (U.seed || 1) >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, rnd()))) * Math.cos(2 * Math.PI * rnd());
  // the joints are narrow and low: the height minus its local mean (a scan's faces are often pillowed, a plain
  // threshold cuts the low half of a face off), Otsu on that
  const hf = new Float32Array(n); for (let i = 0; i < n; i++) hf[i] = orm[i * 4 + 3];
  const lo = blurWrap(hf, W, H, Math.max(3, Math.round(W / 96)));
  const hp = new Uint8Array(n); for (let i = 0; i < n; i++) hp[i] = Math.max(0, Math.min(255, Math.round(128 + 2 * (hf[i] - lo[i]))));
  const hist = new Float64Array(256); for (let i = 0; i < n; i++) hist[hp[i]]++;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wB = 0, sB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += t * hist[t]; const d = sB / wB - (sum - sB) / wF, v = wB * wF * d * d; if (v > best) { best = v; thr = t; } }
  const lab = new Int32Array(n).fill(-1), size = [];
  const stack = [];
  let nl = 0;
  for (let s0 = 0; s0 < n; s0++) {
    if (lab[s0] >= 0 || hp[s0] <= thr) continue;
    lab[s0] = nl; stack.push(s0); let c = 0;
    while (stack.length) {
      const i = stack.pop(), x = i % W, y = (i / W) | 0; c++;
      const nb = [y * W + ((x + 1) % W), y * W + ((x + W - 1) % W), ((y + 1) % H) * W + x, ((y + H - 1) % H) * W + x];
      for (const j of nb) if (lab[j] < 0 && hp[j] > thr) { lab[j] = nl; stack.push(j); }
    }
    size.push(c); nl++;
  }
  // one draw per unit (specks under 0.2 % of a tile's units' mean size stay joint)
  const meanSize = size.reduce((a, b) => a + b, 0) / Math.max(1, nl);
  const tone = [], rr = [], tilt = [];
  for (let k = 0; k < nl; k++) {
    let v = Math.exp(gauss() * U.v), w = gauss() * U.warm, g = 0;
    const r = rnd();
    if (r < U.grey) { v *= 0.8 - 0.1 * rnd(); g = 0.55; } else if (r < U.grey + U.light) { v *= 1.07; g = 0.3; }
    tone.push([v, w, g]); rr.push(gauss() * U.rough); tilt.push([gauss() * U.tilt, gauss() * U.tilt]);
  }
  // the faces' luminance (for the joint grey)
  let fY = 0, fN = 0;
  for (let i = 0; i < n; i++) if (lab[i] >= 0) { fY += 0.2126 * LUT[alb[i * 3]] + 0.7152 * LUT[alb[i * 3 + 1]] + 0.0722 * LUT[alb[i * 3 + 2]]; fN++; }
  fY /= Math.max(1, fN);
  const jc = [1.01, 1.0, 0.97].map((c) => c * fY * U.joint);
  const lin = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const h = hp[i];
    let c = [LUT[alb[i * 3]], LUT[alb[i * 3 + 1]], LUT[alb[i * 3 + 2]]];
    const k = lab[i];
    if (k >= 0 && size[k] > meanSize * 0.002) {
      const [v, w, g] = tone[k];
      const Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      c = c.map((q) => q + (Y - q) * g);
      c = [c[0] * v * (1 + 0.6 * w), c[1] * v * (1 + 0.15 * w), c[2] * v * (1 - 0.9 * w)];
      orm[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(orm[i * 4 + 1] + rr[k] * 255)));
      let x = nrm[i * 3] / 127.5 - 1 + tilt[k][0], y = nrm[i * 3 + 1] / 127.5 - 1 + tilt[k][1], z = nrm[i * 3 + 2] / 127.5 - 1;
      const l = Math.hypot(x, y, z) || 1;
      nrm[i * 3] = Math.round((x / l + 1) * 127.5); nrm[i * 3 + 1] = Math.round((y / l + 1) * 127.5); nrm[i * 3 + 2] = Math.round((z / l + 1) * 127.5);
    }
    // the joint grey, soft across the joint's edge
    const jm = Math.min(1, Math.max(0, (thr + 6 - h) / 14));
    for (let q = 0; q < 3; q++) lin[i * 3 + q] = c[q] + (jc[q] - c[q]) * jm;
  }
  // the mean back on the set's colour
  const target = hexLin(T.mean), m = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let q = 0; q < 3; q++) m[q] += lin[i * 3 + q];
  const kk = target.map((t, q) => t / Math.max(m[q] / n, 1e-5));
  for (let i = 0; i < n; i++) for (let q = 0; q < 3; q++) alb[i * 3 + q] = enc(lin[i * 3 + q] * kk[q]);
  let jN = 0; for (let i = 0; i < n; i++) if (lab[i] < 0) jN++;
  rec.units = nl; rec.jointShare = +(jN / n).toFixed(3);
  return `units: ${nl} (threshold ${thr}, joints ${(100 * jN / n).toFixed(1)} %, joint grey ${linHex(jc)})`;
}

// a red or brown brick's joints by their colour (grey or beige mortar against a saturated face; the height map of a
// rough scan marks the pits in its faces as joints): Otsu on the chroma, the joints then darkened toward a neutral grey
// (their texture kept: T.units.joint of their own value, T.units.grey of desaturation) and the mean put back on the
// set's colour, so the faces carry more of it
function jointsByChroma(T, W, H, alb, rec) {
  const U = T.units, n = W * H, ch = new Float32Array(n), hist = new Float64Array(256);
  for (let i = 0; i < n; i++) {
    const r = alb[i * 3], g = alb[i * 3 + 1], b = alb[i * 3 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    ch[i] = (mx - mn) / Math.max(mx, 1); hist[Math.min(255, Math.round(ch[i] * 255))]++;
  }
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wB = 0, sB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += t * hist[t]; const d = sB / wB - (sum - sB) / wF, v = wB * wF * d * d; if (v > best) { best = v; thr = t; } }
  const jm0 = new Float32Array(n);
  for (let i = 0; i < n; i++) jm0[i] = Math.min(1, Math.max(0, (thr / 255 + 0.04 - ch[i]) / 0.08));
  const jm = blurWrap(jm0, W, H, 1);
  const lin = new Float32Array(n * 3); let jS = 0;
  for (let i = 0; i < n; i++) {
    const c = [LUT[alb[i * 3]], LUT[alb[i * 3 + 1]], LUT[alb[i * 3 + 2]]];
    const Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], k = jm[i]; jS += k;
    const j = [Y * 1.0, Y * 0.98, Y * 0.95].map((q, ci) => (c[ci] + (q - c[ci]) * U.grey) * U.joint);
    for (let q = 0; q < 3; q++) lin[i * 3 + q] = c[q] + (j[q] - c[q]) * k;
  }
  const target = hexLin(T.mean), m = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let q = 0; q < 3; q++) m[q] += lin[i * 3 + q];
  const kk = target.map((t, q) => t / Math.max(m[q] / n, 1e-5));
  for (let i = 0; i < n; i++) for (let q = 0; q < 3; q++) alb[i * 3 + q] = enc(lin[i * 3 + q] * kk[q]);
  rec.jointShare = +(jS / n).toFixed(3);
  return `joints by chroma: threshold ${(thr / 255).toFixed(2)}, joints ${(100 * jS / n).toFixed(1)} %, darkened to ${U.joint} with ${U.grey} desaturation`;
}

// ---------------------------------------------------------------- basisu
function basis(png, out, kind) {
  const args = ['-ktx2', '-mipmap', '-file', png, '-output_file', out];
  if (kind === 'albedo') args.push('-no_alpha', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', '1.0');
  else if (kind === 'normal') args.push('-no_alpha', '-normal_map', '-mip_renorm', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', '0.5');
  else args.push('-force_alpha', '-linear', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', '0.75');
  execFileSync(BASISU, args, { stdio: 'pipe' });
  return fs.statSync(out).size;
}

// ---------------------------------------------------------------- pack one set
async function pack(name, T) {
  const t0 = Date.now();
  let maps, dir = null;
  if (T.src === 'proc') maps = await procSet(name, T, sharp);   // { W, H, alb, nrm, orm } raw buffers already calibrated
  else {
    dir = T.src === 'acg' ? await fetchAcg(T) : await fetchPh(T);
    maps = null;
  }
  const outDir = path.join(OUT, name); fs.mkdirSync(outDir, { recursive: true });
  const rec = { name, src: T.src, id: T.id || null, licence: 'CC0 1.0',
    url: T.src === 'acg' ? `https://ambientcg.com/a/${T.id}` : T.src === 'ph' ? `https://polyhaven.com/a/${T.id}` : 'procedural (tools/ar33/mats/proc.mjs)' };
  let W, H, alb, nrm, orm, notes = [];
  if (maps) { ({ W, H, alb, nrm, orm } = maps); rec.size = T.size; rec.roughMean = maps.roughMean; }
  else {
    const f = (k) => { const p = path.join(dir, `${k}.jpg`); return fs.existsSync(p) ? p : null; };
    const meta = await sharp(f('col')).metadata();
    W = Math.min(T.res, pow2(meta.width)); H = pow2(W * meta.height / meta.width);
    const col = await load(f('col'), W, H, false), nm = await load(f('nrm'), W, H, false);
    const rg = await load(f('rgh'), W, H, true), ao = await load(f('ao'), W, H, true), disp = await load(f('disp'), W, H, true), met = await load(f('met'), W, H, true);
    if (!col || !nm) throw new Error(`${name}: missing colour or normal map in ${dir}`);
    const n = W * H;
    // --- size: measured brick courses, or the table's
    let size = T.size;
    if (T.courses === 'measure') {
      const hsrc = disp ? disp.data : ao ? ao.data : (() => { const g = new Uint8Array(n); for (let i = 0; i < n; i++) g[i] = col.data[i * 3 + 1]; return g; })();
      const m = measureBrick(hsrc, W, H);
      notes.push(m.note);
      rec.courses = T.coursesFix || m.courses; rec.bricks = T.bricksFix || m.bricks;
      rec.halfBricks = T.halfFix ?? m.half;
      if (rec.courses && rec.bricks) size = [rec.bricks * (rec.halfBricks ? MODULE / 2 : MODULE), rec.courses * COURSE];
      else throw new Error(`${name}: brick measurement failed (${m.note}); set coursesFix / bricksFix`);
      rec.aniso = +((size[0] / W) / (size[1] / H)).toFixed(3);   // texel stretch u vs v (1 = square texels)
    }
    rec.size = size.map((v) => +v.toFixed(4));
    // --- albedo
    const lin = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) lin[i * 3 + c] = LUT[col.data[i * col.ch + c]];
    const lum = (i) => 0.2126 * lin[i * 3] + 0.7152 * lin[i * 3 + 1] + 0.0722 * lin[i * 3 + 2];
    let mY = 0; for (let i = 0; i < n; i++) mY += lum(i); mY /= n;
    if (T.flat > 0) {
      const lf = lowFreq(lin, W, H, (T.sigma || 0.5) / size[0] * W);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, k = Math.min(2, Math.max(0.5, Math.pow(mY / Math.max(lf(x, y), 1e-5), T.flat)));
        lin[i * 3] *= k; lin[i * 3 + 1] *= k; lin[i * 3 + 2] *= k;
      }
    }
    // paint mask (before the colour moves): 2-means on the albedo, the cluster farther from rust orange is the paint
    let paint = null;
    if (T.alpha === 'paint') {
      let c0 = [0.05, 0.12, 0.08], c1 = [0.3, 0.12, 0.05];
      for (let it = 0; it < 8; it++) {
        const s0 = [0, 0, 0, 0], s1 = [0, 0, 0, 0];
        for (let i = 0; i < n; i += 7) {
          const p = [lin[i * 3], lin[i * 3 + 1], lin[i * 3 + 2]];
          const d0 = Math.hypot(p[0] - c0[0], p[1] - c0[1], p[2] - c0[2]), d1 = Math.hypot(p[0] - c1[0], p[1] - c1[1], p[2] - c1[2]);
          const s = d0 < d1 ? s0 : s1; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
        }
        if (s0[3]) c0 = s0.slice(0, 3).map((v) => v / s0[3]); if (s1[3]) c1 = s1.slice(0, 3).map((v) => v / s1[3]);
      }
      const rustness = (c) => (c[0] - c[2]) / (c[0] + c[1] + c[2] + 1e-4);
      if (rustness(c0) > rustness(c1)) [c0, c1] = [c1, c0];
      paint = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const p = [lin[i * 3], lin[i * 3 + 1], lin[i * 3 + 2]];
        const d0 = Math.hypot(p[0] - c0[0], p[1] - c0[1], p[2] - c0[2]), d1 = Math.hypot(p[0] - c1[0], p[1] - c1[1], p[2] - c1[2]);
        const m = d1 / (d0 + d1 + 1e-6); paint[i] = Math.min(1, Math.max(0, (m - 0.35) / 0.3));
      }
      paint = blurWrap(paint, W, H, 1);
      let cover = 0; for (let i = 0; i < n; i++) cover += paint[i]; rec.paintCover = +(cover / n).toFixed(3);
      rec.paintMean = c0.map((v) => +v.toFixed(4)); rec.chipMean = c1.map((v) => +v.toFixed(4));
    }
    // mean -> the set's colour (per channel), then the luminance range into [lo, hi] sRGB (log compression about the mean)
    if (T.desat) for (let i = 0; i < n; i++) { const Y = lum(i); for (let q = 0; q < 3; q++) lin[i * 3 + q] += (Y - lin[i * 3 + q]) * T.desat; }
    const target = hexLin(T.mean);
    const meanRGB = () => { const m = [0, 0, 0]; for (let i = 0; i < n; i++) { m[0] += lin[i * 3]; m[1] += lin[i * 3 + 1]; m[2] += lin[i * 3 + 2]; } return m.map((v) => v / n); };
    const toMean = () => { const m = meanRGB(); const k = target.map((t, c) => t / Math.max(m[c], 1e-5)); for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) lin[i * 3 + c] *= k[c]; };
    if (T.alpha !== 'paint') toMean();
    const [rlo, rhi] = T.range || [40, 220];
    const Ys = new Float32Array(n); for (let i = 0; i < n; i++) Ys[i] = lum(i);
    const p1 = percentile(Ys, 0.01), p99 = percentile(Ys, 0.99);
    let Ym = 0; for (const v of Ys) Ym += v; Ym /= n;
    const lo = dec(rlo), hi = dec(rhi);
    let c = 1;
    if (p99 > hi) c = Math.min(c, Math.log(hi / Ym) / Math.log(p99 / Ym));
    if (p1 < lo) c = Math.min(c, Math.log(Ym / lo) / Math.log(Ym / Math.max(p1, 1e-5)));
    c = Math.max(0.35, c);
    if (c < 1) for (let i = 0; i < n; i++) { const Y = Math.max(Ys[i], 1e-5), k = Ym * Math.pow(Y / Ym, c) / Y; for (let q = 0; q < 3; q++) lin[i * 3 + q] *= k; }
    if (T.alpha !== 'paint') toMean();
    notes.push(`lum p1 ${enc(p1)} p99 ${enc(p99)} mean ${enc(Ym)} -> compress ${c.toFixed(2)}`);
    alb = Buffer.alloc(n * 3);
    for (let i = 0; i < n * 3; i++) alb[i] = enc(lin[i]);
    // --- normal (OpenGL), renormalised
    nrm = Buffer.alloc(n * 3);
    for (let i = 0; i < n; i++) {
      let x = nm.data[i * nm.ch] / 127.5 - 1, y = nm.data[i * nm.ch + 1] / 127.5 - 1, z = nm.data[i * nm.ch + 2] / 127.5 - 1;
      if (T.flipY) y = -y;
      z = Math.max(z, 0.05); const l = Math.hypot(x, y, z) || 1;
      nrm[i * 3] = Math.round((x / l + 1) * 127.5); nrm[i * 3 + 1] = Math.round((y / l + 1) * 127.5); nrm[i * 3 + 2] = Math.round((z / l + 1) * 127.5);
    }
    // --- ORM (+ height / paint in A)
    orm = Buffer.alloc(n * 4);
    let rLo = 0, rHi = 1;
    if (rg) { const rf = new Float32Array(n); for (let i = 0; i < n; i++) rf[i] = rg.data[i]; rLo = percentile(rf, 0.02); rHi = percentile(rf, 0.98); }
    const [tLo, tHi] = T.rough || [0.5, 0.9];
    let hLo = 0, hHi = 255;
    if (disp) { const hf = new Float32Array(n); for (let i = 0; i < n; i++) hf[i] = disp.data[i]; hLo = percentile(hf, 0.01); hHi = percentile(hf, 0.99); }
    let mR = 0;
    for (let i = 0; i < n; i++) {
      const r = rg ? tLo + (tHi - tLo) * Math.min(1, Math.max(0, (rg.data[i] - rLo) / Math.max(1, rHi - rLo))) : (tLo + tHi) / 2;
      mR += r;
      orm[i * 4] = ao ? ao.data[i] : 255;
      orm[i * 4 + 1] = Math.round(r * 255);
      orm[i * 4 + 2] = met ? met.data[i] : Math.round((T.metal || 0) * 255);
      orm[i * 4 + 3] = paint ? Math.round(paint[i] * 255) : disp ? Math.round(Math.min(1, Math.max(0, (disp.data[i] - hLo) / Math.max(1, hHi - hLo))) * 255) : 128;
    }
    rec.roughMean = +(mR / n).toFixed(3);
    if (T.units && T.alpha === 'height') notes.push(units(T, W, H, alb, nrm, orm, rec));
  }
  // --- means of what was packed
  {
    const n = W * H; const m = [0, 0, 0];
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) m[c] += LUT[alb[i * 3 + c]];
    rec.mean = m.map((v) => +(v / n).toFixed(4)); rec.meanHex = linHex(rec.mean);
    if (!rec.size) rec.size = T.size;
  }
  rec.res = [W, H]; rec.alpha = T.alpha || 'none';
  if (DRY) { console.log(`${name} (dry): ${W}x${H} size ${rec.size.join(' x ')} m mean ${rec.meanHex}`, notes.join(' || ')); return null; }
  // --- encode
  const tmp = path.join(SRC, `_${name}`); fs.mkdirSync(tmp, { recursive: true });
  const bytes = {};
  const jobs = [['albedo', alb, 3], ['normal', nrm, 3], ['orm', orm, 4]];
  for (const [k, buf, ch] of jobs) {
    const png = path.join(tmp, `${k}.png`);
    await sharp(buf, { raw: { width: W, height: H, channels: ch } }).png().toFile(png);
    bytes[k] = basis(png, path.join(outDir, `${k}.ktx2`), k);
  }
  // a small preview of the albedo (for the notes and the test board), 256 px wide
  await sharp(alb, { raw: { width: W, height: H, channels: 3 } }).resize(256).jpeg({ quality: 82 }).toFile(path.join(outDir, 'preview.jpg'));
  fs.rmSync(tmp, { recursive: true, force: true });
  if (dir && !process.argv.includes('--keep')) fs.rmSync(dir, { recursive: true, force: true });
  rec.bytes = Object.values(bytes).reduce((a, b) => a + b, 0);
  rec.built = new Date().toISOString();
  console.log(`${name}: ${W}x${H} size ${rec.size.join(' x ')} m mean ${rec.meanHex} rough ${rec.roughMean ?? '-'} ${(rec.bytes / 1048576).toFixed(2)} MB ${((Date.now() - t0) / 1000).toFixed(0)} s${notes.length ? '\n   ' + notes.join('\n   ') : ''}`);
  return rec;
}

function readDB() { try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return {}; } }
function gen(db) {
  const keep = ['src', 'id', 'url', 'licence', 'res', 'size', 'mean', 'meanHex', 'alpha', 'roughMean', 'paintMean', 'chipMean', 'paintCover', 'courses', 'bricks', 'halfBricks', 'aniso'];
  const out = {};
  for (const [k, r] of Object.entries(db).sort()) { out[k] = {}; for (const f of keep) if (r[f] !== undefined) out[k][f] = r[f]; }
  const js = `// GENERATED by boundlessjs/tools/ar33/mats/build.mjs from packed.json: do not edit by hand.
// The packed AR33 texture sets (public/textures/pbr/<set>/{albedo,normal,orm}.ktx2): real-world size of one repeat in
// metres [u, v], the packed albedo's linear mean, the ORM alpha channel's meaning, and the CC0 source.
export const PBR_TEX = ${JSON.stringify(out, null, 1).replace(/\n\s+(?=[\]\d-])/g, ' ').replace(/\[\s+/g, '[')};
`;
  fs.mkdirSync(path.dirname(GEN), { recursive: true });
  fs.writeFileSync(GEN, js);
  console.log('wrote', path.relative(ROOT, GEN), Object.keys(out).length, 'sets');
}

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const force = process.argv.includes('--force');
const DRY = process.argv.includes('--dry');
const db = readDB();
if (process.argv.includes('--gen')) { gen(db); process.exit(0); }
const names = process.argv.includes('--all') ? Object.keys(TEX) : args;
for (const name of names) {
  const T = TEX[name];
  if (!T) { console.error('unknown set', name); continue; }
  if (db[name] && !force && fs.existsSync(path.join(OUT, name, 'orm.ktx2'))) { console.log(name, 'packed (use --force)'); continue; }
  try { const rec = await pack(name, T); if (rec) { db[name] = rec; fs.writeFileSync(DB, JSON.stringify(db, null, 1)); gen(db); } }
  catch (e) { console.error(`${name}: FAILED ${e.stack || e.message}`); }
}
