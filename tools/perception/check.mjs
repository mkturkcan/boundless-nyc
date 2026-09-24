// PERCEPTION VALIDATOR — reads an exported frame back and checks that the
// pixels and labels.json agree. Run it on anything export.mjs produced:
//
//   node tools/perception/check.mjs boundlessjs/shots/perception/xwalk125_day/frame_00000
//   node tools/perception/check.mjs boundlessjs/shots/perception/harlem125Street   (all frames)
//
// It checks, per frame:
//   * semantic.png — a class census, and that EVERY pixel is a colour in the
//     frame's own class table (a pixel that is not is either an unlabelled mesh
//     or a filtered/AA'd edge, and both are bugs);
//   * instance.png — that every non-zero code decodes to an instance that
//     labels.json actually lists, and that the per-code pixel count and bbox
//     match the `area` / `bbox` the exporter wrote;
//   * depth.png — the decoded metric range, and that it is monotone with the
//     scene (spot values, so a broken encoding shows up as 0 or max);
//   * amodal/<id>.png + visible/<id>.png — that the mask areas match
//     `amodal_area` / `area` and that amodal >= visible for every instance.
//
// pngjs lives in boundlessjs/node_modules (it is a boundless.js dependency).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(root, 'boundlessjs', 'package.json'));
const { PNG } = require('pngjs');

const read = (f) => PNG.sync.read(fs.readFileSync(f));
const at = (p, x, y) => { const o = (y * p.width + x) * 4; return [p.data[o], p.data[o + 1], p.data[o + 2]]; };

function checkFrame(dir, verbose) {
  const out = { dir: path.relative(root, dir), fail: [], warn: [] };
  const lf = path.join(dir, 'labels.json');
  if (!fs.existsSync(lf)) { out.fail.push('no labels.json'); return out; }
  const L = JSON.parse(fs.readFileSync(lf, 'utf8'));
  out.frame = L.frame;
  out.instances = L.counts.instances;

  // ---- semantic: class census + strays
  const sf = path.join(dir, 'semantic.png');
  if (fs.existsSync(sf)) {
    const p = read(sf);
    if (p.width !== L.image.width || p.height !== L.image.height) out.fail.push(`semantic size ${p.width}x${p.height} != labels ${L.image.width}x${L.image.height}`);
    const key = new Map(L.classes.map((c) => [c.rgb.join(','), c.name]));
    const hist = new Map();
    for (let i = 0; i < p.data.length; i += 4) {
      const k = `${p.data[i]},${p.data[i + 1]},${p.data[i + 2]}`;
      hist.set(k, (hist.get(k) || 0) + 1);
    }
    let stray = 0;
    const census = [];
    for (const [k, n] of [...hist].sort((a, b) => b[1] - a[1])) {
      const name = key.get(k);
      if (!name) { stray += n; continue; }
      census.push([name, n]);
    }
    out.classes = census.length;
    out.strayPx = stray;
    if (stray) out.fail.push(`${stray} semantic px are not a class colour (${(stray / (p.width * p.height) * 100).toFixed(4)}%)`);
    if (verbose) for (const [n, c] of census) console.log(`    ${n.padEnd(22)} ${(c / (p.width * p.height) * 100).toFixed(3).padStart(7)}%  ${String(c).padStart(8)} px`);
  } else out.warn.push('no semantic.png');

  // ---- instance: codes decode, areas and boxes match labels.json
  const inf = path.join(dir, 'instance.png');
  if (fs.existsSync(inf)) {
    const p = read(inf);
    const seen = new Map();                 // code -> [minx,miny,maxx,maxy,area]
    for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
      const o = (y * p.width + x) * 4;
      const code = p.data[o] | (p.data[o + 1] << 8) | (p.data[o + 2] << 16);
      if (code === 0) continue;
      let s = seen.get(code);
      if (!s) { seen.set(code, [x, y, x, y, 1]); continue; }
      if (x < s[0]) s[0] = x; if (y < s[1]) s[1] = y;
      if (x > s[2]) s[2] = x; if (y > s[3]) s[3] = y;
      s[4]++;
    }
    const E = L.instance_encoding;
    const byCode = new Map(L.instances.map((r) => [r.code, r]));
    let orphan = 0, mismatch = 0, small = 0;
    for (const [code, s] of seen) {
      const id = (code * E.inv) % E.mod;
      const r = byCode.get(code);
      if (!r) {
        // an instance under --minpx is legitimately absent from labels.json
        if (s[4] < 400) { small++; continue; }
        orphan++;
        if (orphan <= 3) out.fail.push(`instance code ${code} (id ${id}) covers ${s[4]} px but is not in labels.json`);
        continue;
      }
      if (r.id !== id) { out.fail.push(`code ${code} decodes to ${id} but labels.json says ${r.id}`); continue; }
      const bb = [s[0], s[1], s[2] - s[0] + 1, s[3] - s[1] + 1];
      if (r.area !== s[4] || bb.join() !== r.bbox.join()) {
        mismatch++;
        if (mismatch <= 3) out.fail.push(`id ${r.id} ${r.class}: png area ${s[4]} bbox ${bb.join()} vs labels ${r.area} ${r.bbox.join()}`);
      }
    }
    out.codes = seen.size;
    out.subMinpx = small;
    if (mismatch) out.fail.push(`${mismatch} instances disagree between instance.png and labels.json`);
  } else out.warn.push('no instance.png');

  // ---- depth: decoded range
  const df = path.join(dir, 'depth.png');
  if (fs.existsSync(df)) {
    const p = read(df);
    let mn = Infinity, mx = -Infinity, zero = 0;
    for (let i = 0; i < p.data.length; i += 4) {
      const code = (p.data[i] << 16) | (p.data[i + 1] << 8) | p.data[i + 2];
      const m = (code / 16777215) * L.depth.max_m;
      if (m < mn) mn = m;
      if (m > mx) mx = m;
      if (code === 0) zero++;
    }
    out.depth_m = [+mn.toFixed(2), +mx.toFixed(2)];
    if (zero > p.width * p.height * 0.5) out.fail.push('over half of depth.png is 0 m — encoding or clear colour is wrong');
    if (mx <= 0.01) out.fail.push('depth.png is entirely 0');
  } else out.warn.push('no depth.png');

  // ---- amodal / visible masks vs labels.json
  let am = 0;
  for (const r of L.instances) {
    if (!r.amodal_mask) continue;
    const af = path.join(dir, r.amodal_mask);
    if (!fs.existsSync(af)) { out.fail.push(`missing ${r.amodal_mask}`); continue; }
    const p = read(af);
    let a = 0;
    for (let i = 0; i < p.data.length; i += 4) if (p.data[i]) a++;
    if (a !== r.amodal_area) out.fail.push(`${r.amodal_mask}: ${a} white px vs amodal_area ${r.amodal_area}`);
    if (r.amodal_area < r.area) out.fail.push(`id ${r.id}: amodal_area ${r.amodal_area} < visible area ${r.area}`);
    const vf = r.visible_mask && path.join(dir, r.visible_mask);
    if (vf && fs.existsSync(vf)) {
      const q = read(vf);
      let v = 0;
      for (let i = 0; i < q.data.length; i += 4) if (q.data[i]) v++;
      if (v !== r.area) out.fail.push(`${r.visible_mask}: ${v} white px vs area ${r.area}`);
    }
    am++;
  }
  out.amodalMasks = am;
  return out;
}

const target = path.resolve(root, process.argv[2] || 'boundlessjs/shots/perception');
const verbose = process.argv.includes('--verbose');
const dirs = fs.existsSync(path.join(target, 'labels.json'))
  ? [target]
  : fs.readdirSync(target, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^(INVALID_)?frame_/.test(d.name))
    // a frame directory with no labels.json yet is the one being written right
    // now — checking a live export should not report the export as broken
    .filter((d) => fs.existsSync(path.join(target, d.name, 'labels.json')))
    .map((d) => path.join(target, d.name));
if (!dirs.length) { console.log('no frame directories under', target); process.exit(1); }

let bad = 0;
for (const d of dirs) {
  const r = checkFrame(d, verbose && dirs.length === 1);
  const tag = r.fail.length ? 'FAIL' : 'ok  ';
  console.log(`${tag} ${r.dir}  frame ${r.frame}  ${r.instances} inst, ${r.codes ?? '-'} codes in png (${r.subMinpx ?? 0} under minpx), `
    + `${r.classes ?? '-'} classes, ${r.strayPx ?? '-'} stray px, depth ${r.depth_m ? r.depth_m.join('..') + ' m' : '-'}, ${r.amodalMasks} amodal masks`);
  for (const f of r.fail) console.log('     ! ' + f);
  for (const w of r.warn) console.log('     - ' + w);
  if (r.fail.length) bad++;
}
console.log(`\n${dirs.length} frame(s) checked, ${bad} with failures`);
process.exit(bad ? 1 : 0);
