// The census species the compiled tiles lose (2026-10-01, AR34 TREES request): compile.mjs treeMode keeps nine classes
// (0 other, 1 plane ... 8 cherry), so the city's sophoras (18,383 census trees), Japanese zelkovas (26,880), ashes
// (16,862) and elms (13,579) are class 0 and draw a form picked by a position hash (BID3's c120 sophora drew a Norway
// maple). Until the next tile recompile carries the classes, this writes them as an overlay the page applies to class-0
// census trees: public/data/tree_species_extra.json = { "<tx>_<tz>": [x, z, sp, ...] }, x / z in decimetres inside the
// 512 m tile, sp 9 sophora, 10 zelkova, 11 ash, 12 elm (furnitureKit TREE_SPECIES / TREE_FORM_MIX rows of the same index).
//   node client/tools/pipeline/tree_species_extra.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { project, TILE } from '../../src/shared/geo.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.resolve(HERE, '../../data/raw');
const OUT = path.resolve(HERE, '../../public/data/tree_species_extra.json');
const TILES = path.resolve(HERE, '../../public/tiles');

// the same test order as compile.mjs treeMode, extended: a species the compiler already classes keeps its class
const KNOWN = ['planetree', 'honeylocust', 'pear', 'ginkgo', 'oak', 'linden', 'maple', 'cherry'];
const classOf = (s) => {
  if (KNOWN.some((k) => s.includes(k))) return 0;
  if (s.includes('sophora')) return 9;
  if (s.includes('zelkova')) return 10;
  if (/\bash\b/.test(s)) return 11;   // a word: "washington hawthorn" contains "ash"
  if (/\belm\b/.test(s)) return 12;
  return 0;
};
// a minimal CSV reader for the census exports (quoted fields, no embedded newlines)
function rows(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const split = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  const head = split(lines[0]);
  return lines.slice(1).map((l) => { const v = split(l), o = {}; head.forEach((h, i) => (o[h] = v[i])); return o; });
}
const have = new Set(fs.readdirSync(TILES).filter((f) => /^t_-?\d+_-?\d+\.bin$/.test(f)).map((f) => f.slice(2, -4)));
const byTile = {};
let n = 0, outside = 0;
const count = { 9: 0, 10: 0, 11: 0, 12: 0 };
for (const f of fs.readdirSync(RAW).filter((f) => /^trees_\d+\.csv$/.test(f)).sort()) {
  for (const r of rows(path.join(RAW, f))) {
    const sp = classOf((r.spc_common || '').toLowerCase());
    if (!sp) continue;
    const lat = parseFloat(r.latitude), lon = parseFloat(r.longitude);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    const [x, z] = project(lon, lat);
    const tx = Math.floor(x / TILE), tz = Math.floor(z / TILE), key = `${tx}_${tz}`;
    if (!have.has(key)) { outside++; continue; }
    (byTile[key] ||= []).push(Math.round((x - tx * TILE) * 10), Math.round((z - tz * TILE) * 10), sp);
    n++; count[sp]++;
  }
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(byTile));
console.log(`${n} trees in ${Object.keys(byTile).length} tiles (${outside} outside the compiled tiles):`, JSON.stringify(count), `-> ${path.relative(process.cwd(), OUT)} ${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB`);
