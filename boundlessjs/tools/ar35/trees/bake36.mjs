// TR36 street-tree bake: the TR36 forms (treeGen.js TR36_FORMS: honeylocust H, sophora S, London plane P, zelkova / elm Z,
// oak Q) generated with buildTree36 on the trees25 skeleton, with the TR36 leaf atlas and every species' bark.
//
//   node tools/ar35/trees/bake36.mjs [texDir]      (from boundlessjs/; texDir = build36.py's output,
//                                                   default /data0/projectnyc_aux/tmp/trees/tex36)
//
// Writes public/models/trees36/ (TR38, bake format v3: a split bundle, so a geometry-only re-bake rewrites the geometry alone
// and adds no texture blob to the history):
//   trees36.json        key (forms + generator), atlas key, per-pool geometry layout (streams of trees36.bin), stats, files
//   trees36.bin         the geometry only: one gzip member of quantised, delta-coded, byte-planed streams (src/city/
//                       treeGeo38.js: positions and leaf uvs u16 over each stream's box, colours f16, bark uvs f32,
//                       normals / facings / sun / clump i8, AO / wind u8, indices delta u16 / u32)
//   leaf_col.ktx2       the leaf atlas, UASTC + zstd, its own coverage-preserving mip chain   } ktx38.mjs: re-encoded only
//   leaf_nrm.ktx2       the leaf normal + translucency atlas, UASTC + zstd, box mips           } when their source changes
//   bark_<f>_{col,nrm}.jpg  every species' bark (colour; normal xy + the scan's height in blue): rewritten only when changed
//   ktx38.json          the KTX2 files' stamps (source hash + settings)
// trees.js (TR36) checks the key and keeps the trees25 forms when it does not match: re-run after editing buildTree36,
// TR36_FORMS, the TREE_FORMS rows of the TR36 forms or the atlas.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bdir = path.resolve(here, '..', '..', '..');
const src = (p) => pathToFileURL(path.join(bdir, 'src', p)).href;
const { buildTree36, TR36_FORMS, TREE36_VERSION, bakeKey25 } = await import(src('city/treeGen.js'));
const { geo38Encode, geo38Decode } = await import(src('city/treeGeo38.js'));
const { DataUtils } = await import(pathToFileURL(path.join(bdir, 'node_modules', 'three', 'build', 'three.module.js')).href);
const { TREE_FORMS, TV25_POOLS, tv25Spec } = await import(src('city/furnitureKit.js'));
const { ktx38 } = await import(pathToFileURL(path.join(here, 'ktx38.mjs')).href);
const TEX = process.argv[2] || '/data0/projectnyc_aux/tmp/trees/tex36';
const out = path.join(bdir, 'public', 'models', 'trees36');
fs.mkdirSync(out, { recursive: true });
const t0 = Date.now();
const ALPHA = 0.42;   // trees.js T25.ALPHA
const FORMAT = 3;
const { PNG } = createRequire(path.join(bdir, 'package.json'))('pngjs');
const meta = JSON.parse(fs.readFileSync(path.join(TEX, 'meta36.json'), 'utf8'));
const readPng = (f) => { const p = PNG.sync.read(fs.readFileSync(path.join(TEX, f))); return { data: new Uint8Array(p.data.buffer, p.data.byteOffset, p.data.byteLength), w: p.width, h: p.height }; };
const col = readPng('leaf36_col.png');
// the coverage (alpha >= the cut) of each cell's content box: the generator's leaf-area density uses it
const coverage = {};
for (const [cell, [x, y, w, h]] of Object.entries(meta.content)) {
  let n = 0;
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (col.data[(j * col.w + i) * 4 + 3] >= ALPHA * 255) n++;
  coverage[cell] = +(n / (w * h)).toFixed(4);
}
const atlasStamp = JSON.stringify({ content: meta.content, swatch: meta.swatch, cardM: meta.cardM, calib: meta.calib });
// TR38: the trunk-proxy swatch's mean linear colour and every bark scan's (trees.js gives the far trunk stand-ins their species'
// bark colour from these)
const s2l = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const swatchMean = (() => {
  const [x, y, w, h] = meta.swatch, m = [0, 0, 0];
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) for (let q = 0; q < 3; q++) m[q] += s2l(col.data[(j * col.w + i) * 4 + q]);
  return m.map((v) => +(v / (w * h)).toFixed(4));
})();
const barkMean = Object.fromEntries(Object.entries(meta.barkMeans).map(([f, b]) => [f, b.mean]));
const forms36 = Object.fromEntries(Object.keys(TR36_FORMS).map((id) => [id, TREE_FORMS[id]]));
const pools36 = TV25_POOLS.filter((b) => TR36_FORMS[b.slice(4).replace(/\d+$/, '')]);
// the code key (what trees.js can recompute: the forms, the pools, the generator) and the atlas build's own stamp
const key = bakeKey25(forms36, pools36, 'tr36v' + TREE36_VERSION + '|' + JSON.stringify(TR36_FORMS) + '|t' + ALPHA);
const atlasKey = bakeKey25({}, [], atlasStamp);

// ---------------------------------------------------------------- geometry (treeGeo38.js streams)
// a half float rounded to nearest (DataUtils.toHalfFloat truncates: a whole step where rounding gives half)
const toHalf = (v) => {
  const h = DataUtils.toHalfFloat(v), a = DataUtils.fromHalfFloat(h), b = DataUtils.fromHalfFloat(h + 1);
  return Math.abs(b - v) < Math.abs(a - v) && Number.isFinite(b) ? h + 1 : h;
};
const streams = [], parts = [], check = [];
let off = 0;
const stream = (arr, count, size, codec) => {
  const { bytes, meta: m } = geo38Encode(arr, size, codec, toHalf);
  const pad = (4 - (off % 4)) % 4;
  if (pad) { parts.push(Buffer.alloc(pad)); off += pad; }
  parts.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  streams.push([off, bytes.byteLength, count, size, codec, m]);
  check.push(arr);
  off += bytes.byteLength;
  return streams.length - 1;
};
const codecOf = (name, a) => {
  if (name === 'normal' || name === 'aFace' || name === 'aSun' || name === 'aClu') return 'i8';
  if (name === 'aAO' || name === 'aWind') return 'u8';
  if (name === 'color') return 'f16';
  if (name === 'position') return 'q16';
  // the leaves' atlas uvs sit in [0, 1]: a u16 grid over their box (finer than 1/2048); the bark's run over tens of tiles
  if (name === 'uv') return a.array.every((v) => v >= -1e-4 && v <= 1.0001) ? 'q16' : 'f32';
  return 'f32';
};
const enc = (g) => {
  const G = { attrs: {} };
  for (const [name, a] of Object.entries(g.attributes)) {
    const codec = codecOf(name, a);
    G.attrs[name] = [stream(a.array, a.count, a.itemSize, codec), a.count, a.itemSize, codec, codec === 'i8' || codec === 'u8'];
  }
  const ix = g.index.array, u32 = ix instanceof Uint32Array || g.attributes.position.count > 65535;
  G.index = [stream(ix, ix.length, 1, u32 ? 'x32' : 'x16'), ix.length, u32 ? 'x32' : 'x16'];
  return G;
};
const pools = {};
let trisT = 0, tris0 = 0, tris1 = 0;
const opts36 = { content: meta.content, size: meta.size, cardM: meta.cardM, cellPx: meta.size / meta.cells, swatch: meta.swatch, coverage };
for (const base of pools36) {
  const S = tv25Spec(base);
  const r = buildTree36(S.F, S.H, S.W, S.seed, { ...opts36, form: S.id });
  pools[base] = { form: S.id, trunk0: enc(r.trunk0), trunkS: enc(r.trunkS), leaves0: enc(r.leaves0), leaves1: enc(r.leaves1), leaves2: enc(r.leaves2), stats: r.stats };
  trisT += r.stats.trunkTris; tris0 += r.stats.leafTris0; tris1 += r.stats.leafTris1;
  console.log(`${base}: H ${S.H.toFixed(1)} W ${S.W.toFixed(1)}, shoots ${r.stats.shoots}, units ${r.stats.units}, cards ${r.stats.cards0} / ${r.stats.cards1}, tris bark ${r.stats.trunkTris} (shadow ${r.stats.trunkSTris}) leaves ${r.stats.leafTris0} / ${r.stats.leafTris1} / ${r.stats.leafTris2}`);
}
const rawGeo = Buffer.concat(parts);
const gzGeo = zlib.gzipSync(rawGeo, { level: 9 });
// self-check: decode what trees.js will decode and measure it against the generator's arrays
{
  const dec = geo38Decode(zlib.gunzipSync(gzGeo).buffer.slice(0), streams);
  const err = {};
  streams.forEach(([, , , , codec], s) => {
    const a = check[s], d = dec[s];
    if (d.length !== a.length) throw new Error(`geo38 self-check: stream ${s} length ${d.length} != ${a.length}`);
    let e = 0;
    for (let i = 0; i < a.length; i++) {
      const v = codec === 'f16' ? DataUtils.fromHalfFloat(d[i]) : codec === 'i8' ? d[i] / 127 : codec === 'u8' ? d[i] / 255 : d[i];
      e = Math.max(e, Math.abs(v - a[i]));
    }
    err[codec] = Math.max(err[codec] || 0, e);
  });
  if (err.x16 > 0 || err.x32 > 0) throw new Error('geo38 self-check: indices differ');
  if (!(err.q16 < 0.002)) throw new Error('geo38 self-check: q16 error ' + err.q16);
  console.log(`geo38 self-check: max |error| ${Object.entries(err).map(([k, v]) => `${k} ${v.toExponential(2)}`).join(', ')}`);
}
console.log(`geometry: ${pools36.length} pools, bark ${trisT} tris, leaves ${tris0} (LOD0) / ${tris1} (LOD1), ${streams.length} streams, raw ${(rawGeo.length / 1e6).toFixed(2)} MB, gzip ${(gzGeo.length / 1e6).toFixed(2)} MB, ${Date.now() - t0} ms`);

// ---------------------------------------------------------------- textures (files of their own)
const writeIfChanged = (name, buf) => {
  const f = path.join(out, name);
  if (fs.existsSync(f) && fs.readFileSync(f).equals(buf)) return false;
  fs.writeFileSync(f + '.tmp', buf); fs.renameSync(f + '.tmp', f);
  return true;
};
const kt = await ktx38(TEX, out, { log: (s) => console.log('  ' + s) });
// TR37: every species' bark (build36.py barkMeans: H, S, P, Z, Y, Q, M); [colour, normal + height in blue, v repeat]
const bark = {}, barkBytes = {};
let barkNew = 0;
for (const [f, b] of Object.entries(meta.barkMeans)) {
  const files = [`bark_${f}_col.jpg`, `bark_${f}_nrm.jpg`];
  for (const n of files) { const buf = fs.readFileSync(path.join(TEX, n)); barkBytes[n] = buf.length; if (writeIfChanged(n, buf)) barkNew++; }
  bark[f] = [...files, b.rep ?? 1];
}
// the geometry, then the index (a page that reads a new index with an old geometry fails its gunzip / stream check and keeps
// trees25; never garbage)
fs.writeFileSync(path.join(out, 'trees36.bin.tmp'), gzGeo); fs.renameSync(path.join(out, 'trees36.bin.tmp'), path.join(out, 'trees36.bin'));
const J = {
  version: FORMAT, key, atlasKey, alpha: ALPHA, built: new Date().toISOString(), forms: Object.keys(TR36_FORMS),
  geo: { gzBytes: gzGeo.length, rawBytes: rawGeo.length, streams },
  tex: { leafCol: 'leaf_col.ktx2', leafNrm: 'leaf_nrm.ktx2', stamps: { leaf_col: kt.leaf_col.stamp, leaf_nrm: kt.leaf_nrm.stamp } },
  bark, barkMean, swatchMean, coverage, content: meta.content, swatch: meta.swatch, size: meta.size, pools,
};
fs.writeFileSync(path.join(out, 'trees36.json.tmp'), JSON.stringify(J)); fs.renameSync(path.join(out, 'trees36.json.tmp'), path.join(out, 'trees36.json'));
fs.writeFileSync(path.join(out, 'NOTICE.md'), `# Notice: street trees (trees36)

Generated by \`tools/ar35/trees/bake36.mjs\` from \`src/city/treeGen.js\` (buildTree36 on the trees25 skeleton) and the leaf
atlas and bark maps of \`tools/ar35/trees/build36.py\` (the leaf atlases encoded to KTX2 by \`tools/ar35/trees/ktx38.mjs\`).

Leaf atlas: every leaf is cut from a CC0 scan of ambientCG (ambientcg.com/a/<id>): LeafSet022 (honeylocust and sophora
leaflets), LeafSet010 (the London plane's palmate leaves), LeafSet014 (zelkova and elm) and LeafSet016 (oak); scaled, turned and
recoloured; the rachises and twigs are drawn. Bark (all CC0, resized to 1024 px across, the scan's height map packed into the
normal map's blue channel, JPEG-encoded): Poly Haven \`bark_willow_02\` (polyhaven.com/a/bark_willow_02; the honeylocust),
ambientCG \`Bark001\` (ambientcg.com/a/Bark001; the sophora, ash, linden, pear and ginkgo), Poly Haven \`japanese_sycamore\` (the
London plane), \`japanese_zelkova_bark\` (zelkova, elm), \`sakura_bark\` (cherry, plum, ornamentals), \`jolcham_oak_bark_01\` (oak)
and \`trident_maple_bark\` (maple), all polyhaven.com/a/<name>.
`);
const files = ['trees36.json', 'trees36.bin', 'leaf_col.ktx2', 'leaf_nrm.ktx2', ...Object.keys(barkBytes)];
const total = files.reduce((s, f) => s + fs.statSync(path.join(out, f)).size, 0);
// the v2 single bundle's leftovers are gone with the split
for (const f of ['trees36.bin.tmp', 'trees36.json.tmp']) if (fs.existsSync(path.join(out, f))) fs.rmSync(path.join(out, f));
console.log(`bake v${FORMAT}: geometry ${(gzGeo.length / 1e6).toFixed(2)} MB, leaf KTX2 ${((kt.leaf_col.bytes + kt.leaf_nrm.bytes) / 1e6).toFixed(2)} MB${kt.leaf_col.kept && kt.leaf_nrm.kept ? ' (kept)' : ''}, bark JPEG ${(Object.values(barkBytes).reduce((a, b) => a + b, 0) / 1e6).toFixed(2)} MB (${barkNew} rewritten); total ${(total / 1e6).toFixed(2)} MB; coverage ${JSON.stringify(coverage)}; key ${key} (atlas ${atlasKey}); ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${path.relative(bdir, out)}`);
