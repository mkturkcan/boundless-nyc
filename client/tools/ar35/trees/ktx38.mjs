// TR38: the street trees' textures as KTX2 (UASTC 4x4 + zstd, basisu 1.60), each in a file of its own beside trees36.bin:
//   leaf_col.ktx2      the leaf atlas, sRGB RGBA, its OWN coverage-preserving mip chain (furnitureKit alphaMipLevels, the chain
//                      the raw-RGBA bake carried), fed to basisu level by level as a mipmapped DDS
//   leaf_nrm.ktx2      the leaf normal + translucency atlas, linear RGBA, 2 x 2 box mips with xyz renormalised (as bake36)
//   bark_<f>_col.ktx2  every species' bark colour, sRGB RGB, box mips in linear light (what the GPU's generateMipmap gave the
//                      JPEG it replaces)
//   bark_<f>_nrm.ktx2  its normal xy + the scan's height in blue, linear RGB, box mips (no renormalising: blue is a height)
// Row order: every chain is written t = 0 first (the bark flipped, as the JPEGs were decoded with imageOrientation flipY), so
// three's KTX2Loader, which uploads rows as stored, puts each texel where the JPEG / DataTexture path put it.
//
//   node tools/ar35/trees/ktx38.mjs [texDir] [outDir] [--force] [--only leaf_col,bark_H_nrm,...] [--bark]
//     texDir: build36.py's output (leaf36_col.png, leaf36_nrm.png, meta36.json; bark_<f>_{col,nrm}.png with --bark)
//     outDir: default public/models/trees36
//   or from bake36.mjs: `await ktx38(texDir, outDir, { only, force, bark })`
// TR38 ships the two leaf atlases as KTX2 and keeps the bark as JPEG (bake36.mjs): measured on Bark001 (1024 x 2048) UASTC
// is 2.6 / 2.7 MB a colour / normal map against the JPEGs' 1.0 / 2.3 MB (PSNR 37.5 / 26.1 dB against 36.4 / 27.3), ETC1S is
// 0.5 / 0.6 MB but 29.6 dB on the colour and 16.8 dB on the normal + height (three independent channels); `--bark` encodes the
// bark too (UASTC) for a later decision (4x less GPU memory for +14 MB).
// A texture is re-encoded only when its source bytes or its settings change (stamps in <outDir>/ktx38.json), so a geometry-
// only re-bake rewrites no texture file (and adds no texture blob to the history). Deterministic RDO (-uastc_rdo_m).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bdir = path.resolve(here, '..', '..', '..');
const BASISU = process.env.BASISU || '/data0/projectnyc_aux/.tools/basisu/basis_universal-1_60/bin/basisu';
const TMP = path.join(process.env.TMPDIR || '/tmp', 'ktx38');
const { alphaMipLevels } = await import(pathToFileURL(path.join(bdir, 'src', 'city', 'furnitureKit.js')).href);
const { PNG } = createRequire(path.join(bdir, 'package.json'))('pngjs');
const ALPHA = 0.42;   // trees.js T25.ALPHA (the crown's alpha test)

// encoder settings per kind (part of each file's stamp)
const SET = {
  leaf_col: ['-uastc', '-uastc_level', '2', '-uastc_rdo_l', '0.5', '-uastc_rdo_m'],
  leaf_nrm: ['-uastc', '-linear', '-uastc_level', '2', '-uastc_rdo_l', '0.75', '-uastc_rdo_m'],
  bark_col: ['-uastc', '-no_alpha', '-uastc_level', '2', '-uastc_rdo_l', '1.5', '-uastc_rdo_m'],
  bark_nrm: ['-uastc', '-no_alpha', '-linear', '-uastc_level', '2', '-uastc_rdo_l', '1.0', '-uastc_rdo_m'],
};
const ZSTD = ['-ktx2', '-ktx2_zstandard_level', '19'];

const readPng = (f) => { const p = PNG.sync.read(fs.readFileSync(f)); return { data: new Uint8Array(p.data.buffer, p.data.byteOffset, p.data.byteLength), w: p.width, h: p.height }; };
// uncompressed RGBA8 DDS, levels in the order given (basisu keeps a DDS file's mip chain as the KTX2's levels)
function writeDDS(file, mips) {
  const { width: w, height: h } = mips[0];
  const H = Buffer.alloc(128);
  H.write('DDS ', 0, 'latin1');
  const u = (o, v) => H.writeUInt32LE(v >>> 0, o);
  u(4, 124); u(8, 0x1 | 0x2 | 0x4 | 0x8 | 0x1000 | (mips.length > 1 ? 0x20000 : 0)); u(12, h); u(16, w); u(20, w * 4); u(28, mips.length);
  u(76, 32); u(80, 0x41); u(88, 32); u(92, 0x000000ff); u(96, 0x0000ff00); u(100, 0x00ff0000); u(104, 0xff000000);
  u(108, 0x1000 | (mips.length > 1 ? 0x8 | 0x400000 : 0));
  fs.writeFileSync(file, Buffer.concat([H, ...mips.map((m) => Buffer.from(m.data.buffer, m.data.byteOffset, m.data.byteLength))]));
}
const S2L = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const l2s = (v) => { const c = Math.min(1, Math.max(0, v)); return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255); };
// 2 x 2 box chain; srgb: rgb averaged in linear light; renorm: xyz renormalised as a vector (the leaf normals)
function boxChain(lvl, w, h, { srgb = false, renorm = false } = {}) {
  const mips = [{ data: lvl, width: w, height: h }];
  while (w > 1 || h > 1) {
    const w2 = Math.max(1, w >> 1), h2 = Math.max(1, h >> 1), nx = new Uint8Array(w2 * h2 * 4);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
      const acc = [0, 0, 0, 0];
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const i = (Math.min(h - 1, y * 2 + dy) * w + Math.min(w - 1, x * 2 + dx)) * 4;
        for (let q = 0; q < 3; q++) acc[q] += srgb ? S2L[lvl[i + q]] : renorm ? lvl[i + q] / 127.5 - 1 : lvl[i + q];
        acc[3] += lvl[i + 3];
      }
      const o = (y * w2 + x) * 4;
      if (renorm) {
        const l = Math.hypot(acc[0], acc[1], acc[2]) || 1;
        for (let q = 0; q < 3; q++) nx[o + q] = Math.round((acc[q] / l + 1) * 127.5);
      } else for (let q = 0; q < 3; q++) nx[o + q] = srgb ? l2s(acc[q] / 4) : Math.round(acc[q] / 4);
      nx[o + 3] = Math.round(acc[3] / 4);
    }
    mips.push({ data: nx, width: w2, height: h2 });
    lvl = nx; w = w2; h = h2;
  }
  return mips;
}
const flipRows = (d, w, h) => { const o = new Uint8Array(d.length); for (let y = 0; y < h; y++) o.set(d.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); return o; };

export async function ktx38(TEX, OUT, { only = null, force = false, bark = false, log = console.log } = {}) {
fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
// the jobs: [name, source files, kind, chain builder]
const meta = JSON.parse(fs.readFileSync(path.join(TEX, 'meta36.json'), 'utf8'));
const jobs = [
  ['leaf_col', ['leaf36_col.png'], 'leaf_col', () => {
    const c = readPng(path.join(TEX, 'leaf36_col.png'));
    const chain = alphaMipLevels(c.data, c.w, c.h, ALPHA, { name: 'leafAtlas36', cells: meta.cells });
    if (!chain) throw new Error('atlas has no partial coverage');
    return chain.mips;
  }],
  ['leaf_nrm', ['leaf36_nrm.png'], 'leaf_nrm', () => {
    const n = readPng(path.join(TEX, 'leaf36_nrm.png'));
    return boxChain(flipRows(n.data, n.w, n.h), n.w, n.h, { renorm: true });
  }],
];
if (bark) for (const f of Object.keys(meta.barkMeans)) for (const k of ['col', 'nrm']) {
  jobs.push([`bark_${f}_${k}`, [`bark_${f}_${k}.png`], `bark_${k}`, () => {
    const b = readPng(path.join(TEX, `bark_${f}_${k}.png`));
    return boxChain(flipRows(b.data, b.w, b.h), b.w, b.h, { srgb: k === 'col' });
  }]);
}

const stampFile = path.join(OUT, 'ktx38.json');   // (the stamps of the files in OUT: source hash + settings)
const stamps = fs.existsSync(stampFile) ? JSON.parse(fs.readFileSync(stampFile, 'utf8')) : {};
const run = (a) => new Promise((res, rej) => execFile(BASISU, a, { maxBuffer: 1 << 26 }, (e, so, se) => (e ? rej(new Error(se || so || e.message)) : res(so))));
const t0 = Date.now();
const results = await Promise.all(jobs.filter(([name]) => !only || only.split(',').includes(name)).map(async ([name, srcs, kind, build]) => {
  if (!fs.existsSync(path.join(TEX, srcs[0]))) throw new Error(`ktx38: ${srcs[0]} missing in ${TEX}`);
  const h = crypto.createHash('sha256');
  for (const s of srcs) h.update(fs.readFileSync(path.join(TEX, s)));
  h.update(JSON.stringify([SET[kind], ZSTD, ALPHA, kind === 'leaf_col' ? meta.cells : 0, 'ktx38v1']));
  const stamp = h.digest('hex').slice(0, 16);
  const file = path.join(OUT, `${name}.ktx2`);
  if (!force && stamps[name]?.stamp === stamp && fs.existsSync(file)) return [name, { ...stamps[name], kept: true }];
  const mips = build();
  const dds = path.join(TMP, `${name}.dds`);
  writeDDS(dds, mips);
  const tmpOut = path.join(TMP, `${name}.ktx2`);
  await run([...SET[kind], ...ZSTD, '-file', dds, '-output_file', tmpOut]);
  fs.renameSync(tmpOut, file);   // (atomic within one file system: TMPDIR and the repo are both on /data0)
  fs.rmSync(dds);
  const bytes = fs.statSync(file).size;
  return [name, { stamp, bytes, w: mips[0].width, h: mips[0].height, levels: mips.length, kind }];
}));
for (const [name, r] of results) stamps[name] = { stamp: r.stamp, bytes: r.bytes, w: r.w, h: r.h, levels: r.levels, kind: r.kind };
fs.writeFileSync(stampFile, JSON.stringify(stamps, null, 1));
let tot = 0;
for (const [name, r] of results) { tot += r.bytes; log(`${name.padEnd(12)} ${r.w} x ${r.h}, ${r.levels} levels, ${(r.bytes / 1e6).toFixed(3)} MB${r.kept ? ' (kept: source and settings unchanged)' : ''}`); }
log(`ktx38: ${results.length} textures, ${(tot / 1e6).toFixed(2)} MB, ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${path.relative(bdir, OUT) || OUT}`);
return Object.fromEntries(results);
}

// as a script
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  const flag = (k) => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  const only = flag('--only');
  const sw = (k) => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
  const force = sw('--force'), bark = sw('--bark');
  await ktx38(args[0] || '/data0/projectnyc_aux/tmp/trees/tex36', args[1] || path.join(bdir, 'public', 'models', 'trees36'), { only, force, bark });
}
