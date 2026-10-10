// Parse the OSM campus extract (data/raw/osm_columbia.xml, fetched from the main
// OSM API) into data/columbia_campus.json: projected world-space campus features
// for the Columbia University detail pass (lawns, paths, steps, walls, trees,
// monuments, lamps, hedges, plazas).
// node tools/pipeline/columbia.mjs [--inventory]
import fs from 'node:fs';
import { project } from '../../src/shared/geo.js';

const xml = fs.readFileSync('data/raw/osm_columbia.xml', 'utf8');

// ---- parse nodes
const nodes = new Map(); // id -> {lon,lat,tags}
const nodeRe = /<node id="(\d+)"[^>]*? lat="([-\d.]+)" lon="([-\d.]+)"(?:\/>|(.*?)<\/node>)/gs;
for (const m of xml.matchAll(nodeRe)) {
  const tags = m[4] ? parseTags(m[4]) : null;
  nodes.set(m[1], { lat: +m[2], lon: +m[3], tags });
}
// ---- parse ways
const ways = new Map(); // id -> {refs:[], tags}
const wayRe = /<way id="(\d+)".*?>(.*?)<\/way>/gs;
for (const m of xml.matchAll(wayRe)) {
  const refs = [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map((r) => r[1]);
  ways.set(m[1], { refs, tags: parseTags(m[2]) });
}
// ---- relations (multipolygon lawns etc.) — outer ways only
const rels = [];
const relRe = /<relation id="(\d+)".*?>(.*?)<\/relation>/gs;
for (const m of xml.matchAll(relRe)) {
  const tags = parseTags(m[2]);
  const outers = [...m[2].matchAll(/<member type="way" ref="(\d+)" role="outer"\/>/g)].map((r) => r[1]);
  rels.push({ id: m[1], tags, outers });
}
function parseTags(s) {
  const t = {};
  for (const m of s.matchAll(/<tag k="([^"]+)" v="([^"]*)"\/>/g)) t[m[1]] = m[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return t;
}
console.log(`parsed: ${nodes.size} nodes, ${ways.size} ways, ${rels.length} relations`);

if (process.argv.includes('--inventory')) {
  const hist = {};
  const bump = (k) => (hist[k] = (hist[k] || 0) + 1);
  for (const [, n] of nodes) {
    if (!n.tags) continue;
    for (const key of ['natural', 'amenity', 'tourism', 'historic', 'highway', 'barrier', 'artwork_type', 'man_made', 'leisure', 'advertising']) {
      if (n.tags[key]) bump(`node ${key}=${n.tags[key]}`);
    }
  }
  for (const [, w] of ways) {
    for (const key of ['building', 'highway', 'barrier', 'leisure', 'landuse', 'natural', 'surface', 'amenity', 'man_made', 'tourism', 'historic']) {
      if (w.tags[key]) bump(`way ${key}=${w.tags[key]}`);
    }
    if (w.tags.highway === 'steps') bump('way STEPS');
    if (w.tags.highway === 'footway' && w.tags.surface) bump(`way footway surface=${w.tags.surface}`);
  }
  for (const r of rels) for (const key of ['leisure', 'landuse', 'natural', 'building']) if (r.tags[key]) bump(`rel ${key}=${r.tags[key]}`);
  const sorted = Object.entries(hist).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of sorted) console.log(String(v).padStart(5), k);
  // named things that could matter
  console.log('\n--- named nodes (monuments/artworks):');
  for (const [, n] of nodes) {
    if (n.tags && (n.tags.tourism === 'artwork' || n.tags.historic || n.tags.amenity === 'fountain') )
      console.log(`  ${n.tags.name || '(unnamed)'} [${n.tags.tourism || ''}${n.tags.historic || ''}${n.tags.amenity || ''}] ${n.lat.toFixed(5)},${n.lon.toFixed(5)}`);
  }
  console.log('\n--- named ways w/ names (top 40 non-building):');
  let c = 0;
  for (const [, w] of ways) {
    if (w.tags.name && !w.tags.building && c++ < 40) console.log(`  ${w.tags.name} [${Object.entries(w.tags).filter(([k]) => k !== 'name').slice(0, 3).map(([k, v]) => k + '=' + v).join(' ')}]`);
  }
  process.exit(0);
}

// ---- emit campus JSON (projected)
const P = ([lonV, latV]) => project(lonV, latV).map((v) => +v.toFixed(2));
const wayPts = (w) => w.refs.map((r) => nodes.get(r)).filter(Boolean).map((n) => P([n.lon, n.lat]));
const out = { grass: [], paths: [], steps: [], walls: [], hedges: [], fences: [], trees: [], monuments: [], fountains: [], lamps: [], plazas: [], buildings: [], benches: [], baskets: [], flagpoles: [], shrubs: [], flowerbeds: [] };

for (const [, w] of ways) {
  const t = w.tags;
  const pts = wayPts(w);
  if (pts.length < 2) continue;
  if (t.building) { if (t.name) out.buildings.push({ name: t.name, pts, levels: t['building:levels'] || null }); continue; }
  if (t.leisure === 'garden' || t.landuse === 'grass' || t.natural === 'grassland' || t.leisure === 'park' || t.landuse === 'recreation_ground' || (t.leisure === 'pitch' && t.surface === 'grass'))
    out.grass.push({ pts, name: t.name || null });
  else if (t.highway === 'steps') out.steps.push({ pts, name: t.name || null, incline: t.incline || null, width: +(t.width || 0) || null });
  else if (t.barrier === 'retaining_wall' || t.barrier === 'wall') out.walls.push({ pts, name: t.name || null });
  else if (t.barrier === 'hedge') out.hedges.push({ pts });
  else if (t.barrier === 'fence') out.fences.push({ pts });
  else if (t.highway === 'pedestrian' && (t.area === 'yes' || pts.length > 3 && w.refs[0] === w.refs[w.refs.length - 1]))
    out.plazas.push({ pts, name: t.name || null, surface: t.surface || null });
  else if (t.highway === 'footway' || t.highway === 'path' || t.highway === 'pedestrian')
    out.paths.push({ pts, name: t.name || null, surface: t.surface || null, width: +(t.width || 0) || null, ped: t.highway === 'pedestrian' ? 1 : 0 });
  else if (t.amenity === 'fountain' || t.man_made === 'water_tap') out.fountains.push({ pts, name: t.name || null, poly: true });
  else if (t.tourism === 'artwork' || t.historic === 'memorial' || t.historic === 'monument') out.monuments.push({ pts, name: t.name || null, poly: true });
  else if (t.landuse === 'flowerbed') out.flowerbeds.push({ pts });
  else if (t.natural === 'tree_row') out.trees.push(...wayPts(w).map((p) => ({ p, row: true })));
}
for (const r of rels) {
  if (r.tags.leisure === 'garden' || r.tags.landuse === 'grass') {
    for (const oid of r.outers) {
      const w = ways.get(oid);
      if (w) { const pts = wayPts(w); if (pts.length > 2) out.grass.push({ pts, name: r.tags.name || null }); }
    }
  }
}
for (const [, n] of nodes) {
  const t = n.tags;
  if (!t) continue;
  const p = P([n.lon, n.lat]);
  if (t.natural === 'tree') out.trees.push({ p, leaf: t.leaf_type || null, genus: t.genus || t.species || null });
  else if (t.natural === 'shrub') out.shrubs.push({ p });
  else if (t.highway === 'street_lamp') out.lamps.push({ p, style: t.lamp_type || null });
  else if (t.amenity === 'fountain') out.fountains.push({ p, name: t.name || null });
  else if (t.amenity === 'bench') out.benches.push({ p });
  else if (t.amenity === 'waste_basket') out.baskets.push({ p });
  else if (t.man_made === 'flagpole') out.flagpoles.push({ p });
  else if (t.tourism === 'artwork' || t.historic === 'memorial' || t.historic === 'monument') out.monuments.push({ p, name: t.name || null, type: t.artwork_type || t.historic || null });
}
for (const k of Object.keys(out)) console.log(k, out[k].length);
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/columbia_campus.json', JSON.stringify(out));
console.log('wrote data/columbia_campus.json', fs.statSync('data/columbia_campus.json').size, 'bytes');
