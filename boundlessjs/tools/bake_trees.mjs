// TV25 tree bake: every species-form pool (furnitureKit TV25_POOLS) generated OFFLINE, so the client boot does not
// run the generator, paint the leaf atlas or build its mip chain on the main thread (it took ~1 s of CPU on an idle
// machine and 49 s of wall time inside a loaded city boot).
//
//   node tools/bake_trees.mjs            (from boundlessjs/; ~15 s; no GPU: the atlas is painted in a --disable-gpu
//                                         headless Chromium with Canvas 2D, the rest is plain Node)
//
// Writes public/models/trees25/:
//   trees25.json   key (forms + generator + atlas versions), per-pool geometry layout, stats, texture list
//   trees25.bin    ONE bundle: LOD0 bark, LOD0 leaves, LOD1 leaves (+ trunk proxy) per pool (f32 positions/uvs/colours,
//                  i8 normals / card facings, u8 crown AO, u16/u32 indices, 4-byte aligned), then the leaf-atlas mip
//                  chain as gzip-compressed raw RGBA (coverage-preserving, furnitureKit alphaMipLevels, GL row order;
//                  no image decode on the client) and the bark JPGs (ez-tree's, MIT; plane camo ours)
// trees.js checks the key and falls back to runtime generation (with a console warning) when the forms or the
// generator changed after the bake: re-run this after editing TREE_FORMS, treeGen.js or treeAtlas.js.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bdir = path.resolve(here, '..');
const src = (p) => pathToFileURL(path.join(bdir, 'src', p)).href;
const { buildTree, bakeKey25 } = await import(src('city/treeGen.js'));
const { TREE_FORMS, TV25_POOLS, tv25Spec, alphaMipLevels } = await import(src('city/furnitureKit.js'));
const { ATLAS, LEAF_CELLS, cellUV25 } = await import(src('city/treeAtlas.js'));
const out = path.join(bdir, 'public', 'models', 'trees25');
fs.mkdirSync(out, { recursive: true });
const t0 = Date.now();
const ALPHA = 0.42;   // trees.js T25.ALPHA: the cut the crown material uses and the mip chain is built for
const key = bakeKey25(TREE_FORMS, TV25_POOLS, 'a' + ATLAS.VERSION + '|t' + ALPHA);

// ---------------------------------------------------------------- geometry
const chunks = [];
let off = 0;
const push = (ta) => {
  const pad = (4 - (off % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; }
  const b = Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength);
  chunks.push(Buffer.from(b));
  const o = off; off += b.length;
  return o;
};
const enc = (g) => {
  const G = { attrs: {} };
  for (const [name, a] of Object.entries(g.attributes)) {
    let arr, type = 'f32', norm = false;
    if (name === 'normal' || name === 'aFace' || name === 'aSun' || name === 'aClu') { arr = Int8Array.from(a.array, (v) => Math.max(-127, Math.min(127, Math.round(v * 127)))); type = 'i8'; norm = true; }
    else if (name === 'aAO') { arr = Uint8Array.from(a.array, (v) => Math.max(0, Math.min(255, Math.round(v * 255)))); type = 'u8'; norm = true; }
    else arr = Float32Array.from(a.array);
    G.attrs[name] = [push(arr), a.count, a.itemSize, type, norm];
  }
  const ix = g.index.array, u32 = ix instanceof Uint32Array || g.attributes.position.count > 65535;
  G.index = [push(u32 ? Uint32Array.from(ix) : Uint16Array.from(ix)), ix.length, u32 ? 'u32' : 'u16'];
  return G;
};
const pools = {};
let trisT = 0, tris0 = 0, tris1 = 0;
for (const base of TV25_POOLS) {
  const S = tv25Spec(base);
  const r = buildTree(S.F, S.H, S.W, S.seed, { cellUV: cellUV25, barkCell: LEAF_CELLS.bark });
  pools[base] = { bark: S.F.bark || 'oak', trunk0: enc(r.trunk0), leaves0: enc(r.leaves0), leaves1: enc(r.leaves1), stats: r.stats };
  trisT += r.stats.trunkTris; tris0 += r.stats.leafTris0; tris1 += r.stats.leafTris1;
}
const bin = Buffer.concat(chunks);
console.log(`geometry: ${TV25_POOLS.length} pools, bark ${trisT} tris, leaves ${tris0} (LOD0) / ${tris1} (LOD1), ${(bin.length / 1e6).toFixed(2)} MB, ${Date.now() - t0} ms`);

// ---------------------------------------------------------------- atlas + plane bark (Canvas 2D in headless Chromium)
const rootReq = createRequire(path.join(bdir, '..', 'package.json'));
const { chromium } = rootReq('playwright');
const ezLeaf = (n) => 'data:image/png;base64,' + fs.readFileSync(path.join(bdir, 'node_modules/@dgreenheck/ez-tree/src/lib/assets/leaves', n + '_color.png')).toString('base64');
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
let painted;
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  painted = await page.evaluate(async ({ mod, imgs }) => {
    const M = await import(URL.createObjectURL(new Blob([mod], { type: 'text/javascript' })));
    const load = (u) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = u; });
    const ez = { oak: await load(imgs.oak), ash: await load(imgs.ash), aspen: await load(imgs.aspen) };
    const b64 = (c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let s = '';
      for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
      return btoa(s);
    };
    const atlas = M.paintLeafAtlas25(ez), camo = M.planeCamoCanvas25();
    return { atlas: b64(atlas), aw: atlas.width, ah: atlas.height, camo: b64(camo), cw: camo.width, ch: camo.height };
  }, { mod: fs.readFileSync(path.join(bdir, 'src/city/treeAtlas.js'), 'utf8'), imgs: { oak: ezLeaf('oak'), ash: ezLeaf('ash'), aspen: ezLeaf('aspen') } });
} finally { await browser.close(); }
const { PNG } = createRequire(path.join(bdir, 'package.json'))('pngjs');
const writePng = (f, data, w, h) => { const p = new PNG({ width: w, height: h }); p.data = Buffer.from(data.buffer, data.byteOffset, data.byteLength); fs.writeFileSync(path.join(out, f), PNG.sync.write(p, { colorType: 6 })); };
const raw = new Uint8Array(Buffer.from(painted.atlas, 'base64'));
const chain = alphaMipLevels(raw, painted.aw, painted.ah, ALPHA, { name: 'leafAtlas25', cells: ATLAS.NC });
if (!chain) throw new Error('atlas has no partial coverage');
// ONE file for the whole chain (a request is what a loading city queues on): level 0 on the left, levels 1.. stacked
// down a right-hand column. The client decodes it once and crops each level out (createImageBitmap rect, no copy to JS).
const W0 = chain.mips[0].width, H0 = chain.mips[0].height, MW = W0 + (chain.mips[1] ? chain.mips[1].width : 0);
const packed = new Uint8Array(MW * H0 * 4);
const levels = [];
let py = 0;
for (let i = 0; i < chain.mips.length; i++) {
  const m = chain.mips[i], x0 = i === 0 ? 0 : W0, y0 = i === 0 ? 0 : py;
  for (let y = 0; y < m.height; y++) packed.set(m.data.subarray(y * m.width * 4, (y + 1) * m.width * 4), ((y0 + y) * MW + x0) * 4);
  levels.push([x0, y0, m.width, m.height]);
  if (i > 0) py += m.height;
}
for (const f of fs.readdirSync(out)) if (/^atlas_\d+\.png$/.test(f)) fs.unlinkSync(path.join(out, f));   // the old per-level files
writePng('atlas.png', packed, MW, H0);
const atlasBytes = fs.statSync(path.join(out, 'atlas.png')).size;
// plane camo: opaque, a JPG is a tenth of the PNG
const camoRaw = new Uint8Array(Buffer.from(painted.camo, 'base64'));
let camoBuf, camoType = 'image/jpeg';
try {
  const sharp = createRequire(path.join(bdir, '..', 'tools', 'assets', 'package.json'))('sharp');
  sharp.cache(false);
  camoBuf = await sharp(Buffer.from(camoRaw), { raw: { width: painted.cw, height: painted.ch, channels: 4 } }).removeAlpha().jpeg({ quality: 92 }).toBuffer();
} catch (e) {
  console.log('sharp unavailable, camo as PNG:', e.message);
  const p = new PNG({ width: painted.cw, height: painted.ch }); p.data = Buffer.from(camoRaw.buffer, camoRaw.byteOffset, camoRaw.byteLength);
  camoBuf = PNG.sync.write(p, { colorType: 6 }); camoType = 'image/png';
}
// ONE BUNDLE: the geometry, then every image appended (4-byte aligned) with its [offset, length, type] in the JSON.
// A booting city has its connections full of tile and asset-bank downloads; two requests queue once, eleven queued
// eleven times (41-61 s to trees, measured in ab2, with 18 ms of main-thread work).
const img = (buf, type) => { const o = push(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)); return [o, buf.byteLength, type]; };
// THE ATLAS IS NOT AN IMAGE FILE in the bundle: the mip chain as raw RGBA, gzip-compressed. Measured (sweep2): the bundle
// arrived 0.5 s into the tree load but createImageBitmap on its PNG finished at 62.7 s — the browser's image decoders are
// queued behind the whole boot's texture decodes (the crowd bank alone brings ~300). The client inflates this in a
// worker (DecompressionStream) and uploads it as a DataTexture: no image decoder involved. atlas.png stays out of the
// bundle (a debugging view only, deleted below with the other loose files).
const zlib = await import('node:zlib');
const rawAll = Buffer.concat(chain.mips.map((m) => Buffer.from(m.data.buffer, m.data.byteOffset, m.data.byteLength)));
const gz = zlib.gzipSync(rawAll, { level: 9 });
const atlasRef = img(gz, 'application/gzip');
const rawLevels = [];
{ let o = 0; for (const m of chain.mips) { rawLevels.push([o, m.width, m.height]); o += m.data.byteLength; } }
const barkSrc = path.join(bdir, 'node_modules/@dgreenheck/ez-tree/src/lib/assets/bark');
const barkImg = (k, t) => img(fs.readFileSync(path.join(barkSrc, `${k}_${t}_1k.jpg`)), 'image/jpeg');
const bn = barkImg('birch', 'normal');
const bark = {
  oak: [barkImg('oak', 'color'), barkImg('oak', 'normal'), 1.0],
  willow: [barkImg('willow', 'color'), barkImg('willow', 'normal'), 1.0],
  birch: [barkImg('birch', 'color'), bn, 0.8],
  plane: [img(camoBuf, camoType), bn, 0.35],
};
const bundle = Buffer.concat(chunks);
for (const f of fs.readdirSync(out)) if (/^(atlas.*\.png|bark_.*\.(jpg|png))$/.test(f)) fs.unlinkSync(path.join(out, f));   // loose files of older bakes
fs.writeFileSync(path.join(out, 'trees25.bin'), bundle);
fs.writeFileSync(path.join(out, 'trees25.json'), JSON.stringify({
  version: 4, key, alpha: ALPHA, built: new Date().toISOString(), atlas: { gz: atlasRef, raw: rawLevels, rawBytes: rawAll.length, cov0: chain.cov0 }, bark, pools,
}));
fs.writeFileSync(path.join(out, 'NOTICE.md'), `# Notice: street trees (trees25)

Generated by \`tools/bake_trees.mjs\` from \`src/city/treeGen.js\` (geometry) and \`src/city/treeAtlas.js\` (leaf atlas).
\`trees25.bin\` holds the geometry, the leaf-atlas mip chain (PNG) and the bark maps (JPG); \`trees25.json\` the layout.
The painted leaf sprays and the London plane bark are procedural and part of this project.

Taken from the ez-tree package (github.com/dgreenheck/ez-tree, MIT licence, Copyright (c) Daniel Greenheck): the oak
and ash leaf sprays and the aspen leaf spray (recoloured) inside the atlas, and the oak, willow and birch bark maps.
ez-tree lists their original sources as Poly Haven (bark_brown_02, bark_willow_02; CC0) and TextureCan (birch).
`);
console.log(`atlas: ${levels.length} levels, cov0 ${(chain.cov0 * 100).toFixed(1)} %, raw ${(rawAll.length / 1e6).toFixed(1)} MB -> gzip ${(gz.length / 1e6).toFixed(2)} MB (png ${(atlasBytes / 1e6).toFixed(2)} MB); bundle ${(bundle.length / 1e6).toFixed(2)} MB; key ${key}; ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${path.relative(bdir, out)}`);
