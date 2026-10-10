// Street trees as they stand today on 125th Street and in Hunters Point (2026-10-01, AR34 TREES request): the tiles carry
// the 2015 census, and the corridor has changed since (pits emptied, saplings grown, new plantings; TREES' pairs
// N2330fdb_sq, s568_26, s313). NYC Parks' inventory, Forestry Tree Points (NYC Open Data hn5i-inap, updated daily), is
// fetched for the two area boxes into data/raw/forestry/forestry_<box>.json (look below) and written for the page as
// public/data/tree_forestry.json: { v, src, boxes: [[x0, z0, x1, z1]], t: { "<tx>_<tz>": [x, z, sp, dbh, ...] } } with
// world x / z in decimetres, sp the furnitureKit TREE_SPECIES class (0-12), dbh in inches. Only live trees (structure
// 'Full', condition not 'Dead'); each tile's list also holds the trees within 8 m outside it, for matching across edges.
// world/assemble.js (TFO) matches the compiled street trees to them.
//   curl the boxes (UA valdrada-research/0.1), then: node client/tools/pipeline/tree_forestry.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { project, TILE } from '../../src/shared/geo.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.resolve(HERE, '../../data/raw/forestry');
const OUT = path.resolve(HERE, '../../public/data/tree_forestry.json');
// city/areas.js B125 and BHPT ([x0, z0, x1, z1] world metres); the fetch boxes are these, unprojected
const BOXES = { b125: [600, -4400, 3750, -1450], bhpt: [350, 3250, 1850, 5350] };
const MARGIN = 8;
// the genus decides the class (Latin names: the common names vary between records)
const GENUS = { Platanus: 1, Gleditsia: 2, Pyrus: 3, Ginkgo: 4, Quercus: 5, Tilia: 6, Acer: 7, Prunus: 8, Styphnolobium: 9, Sophora: 9, Zelkova: 10, Fraxinus: 11, Ulmus: 12,
  // TREES 2026-10-02: the compound-leaved genera with round or open crowns draw the sophora form (S), hackberry the elm
  // form (Z); class 0 had drawn them as a position-hashed mix (the Dinosaur's and the Cotton Club's Kentucky coffeetrees
  // as a purple plum among others). Counts of live trees in the boxes: Gymnocladus 294, Celtis 225, Koelreuteria 160,
  // Robinia 159, Ailanthus 70, Maackia 63, Cladrastis 26, Phellodendron 11.
  Gymnocladus: 9, Robinia: 9, Koelreuteria: 9, Ailanthus: 9, Maackia: 9, Phellodendron: 9, Cladrastis: 9, Celtis: 12 };

const t = {};
const count = { live: 0, notLive: 0, outside: 0, byClass: {} };
let newest = '';
for (const [name, box] of Object.entries(BOXES)) {
  const f = path.join(RAW, `forestry_${name}.json`);
  if (!fs.existsSync(f)) { console.log('missing', f); continue; }
  for (const r of JSON.parse(fs.readFileSync(f, 'utf8'))) {
    if (r.tpstructure !== 'Full' || r.tpcondition === 'Dead') { count.notLive++; continue; }
    const c = r.location && r.location.coordinates;
    if (!c) continue;
    const [x, z] = project(+c[0], +c[1]);
    if (x < box[0] || x > box[2] || z < box[1] || z > box[3]) { count.outside++; continue; }
    const genus = String(r.genusspecies || '').split(/\s+/)[0];
    const sp = GENUS[genus] || 0;
    const dbh = Math.max(1, Math.min(255, Math.round(+r.dbh || 8)));
    if ((r.updateddate || '') > newest) newest = r.updateddate;
    const tx0 = Math.floor((x - MARGIN) / TILE), tx1 = Math.floor((x + MARGIN) / TILE);
    const tz0 = Math.floor((z - MARGIN) / TILE), tz1 = Math.floor((z + MARGIN) / TILE);
    for (let tx = tx0; tx <= tx1; tx++) for (let tz = tz0; tz <= tz1; tz++) (t[`${tx}_${tz}`] ||= []).push(Math.round(x * 10), Math.round(z * 10), sp, dbh);
    count.live++; count.byClass[sp] = (count.byClass[sp] || 0) + 1;
  }
}
const out = { v: 1, src: 'NYC Parks Forestry Tree Points (NYC Open Data hn5i-inap), fetched 2026-10-01, newest record ' + newest, boxes: Object.values(BOXES), t };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`${count.live} live trees (${count.notLive} retired / stumps / dead, ${count.outside} outside the boxes) in ${Object.keys(t).length} tiles; by class ${JSON.stringify(count.byClass)}; newest ${newest} -> ${path.relative(process.cwd(), OUT)} ${(fs.statSync(OUT).size / 1e3).toFixed(0)} kB`);
