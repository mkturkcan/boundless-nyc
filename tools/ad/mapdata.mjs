// DATA SCENE — step 1: cut the SOURCE data out of client/data/raw for the
// `fStreetGeom` nadir framing (125th & Lenox, 120 m).
//
// The scene that opens the film claims the city is built from public records
// and is accurate to the lot line. The only honest way to show that is to draw
// the records themselves, in the same projection as the render, and dissolve
// one into the other — so this pulls the ACTUAL rows out of the ACTUAL cached
// downloads (`client/data/raw/*`, the files `tools/pipeline/compile.mjs`
// reads), not a redrawing of them.
//
//   node tools/ad/mapdata.mjs                 # -> client/shots/ad/mapdata.json
//   node tools/ad/mapdata.mjs --half 320      # a wider window
//
// The raw geojson dumps are 50-530 MB each and the four "boro" files are not in
// borough order, so every one is scanned with a streaming splitter: features are
// cut apart on the `{"type":"Feature"` literal (which cannot appear inside a
// geometry or a property value) and only the ones whose TEXT already contains
// the window's coordinate prefix are ever handed to JSON.parse.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = path.join(root, 'client', 'data', 'raw');
const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };

// ---- projection: the mirror of client/src/shared/geo.js
const LAT0 = 40.7831, LON0 = -73.9712;
const M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
const project = (lon, lat) => [(lon - LON0) * M_LON, -(lat - LAT0) * M_LAT];
const unproject = (x, z) => [x / M_LON + LON0, -z / M_LAT + LAT0];

// ---- the framing: shot `fStreetGeom`, key 0 (the still the fade lands on)
const shots = JSON.parse(fs.readFileSync(path.join(root, 'tools/ad/shots.json'), 'utf8'));
const SHOT = shots.shots[opt('shot', 'fStreetGeom')];
const K0 = SHOT.keys[0];
const [camX, camZ] = project(K0.p[0], K0.p[1]);
const [lookX, lookZ] = project(K0.look[0], K0.look[1]);
const HALF = Number(opt('half', 300));           // metres of data around the look point
const box = { x0: lookX - HALF, x1: lookX + HALF, z0: lookZ - HALF, z1: lookZ + HALF };
const [lonA, latA] = unproject(box.x0, box.z0);  // NW-ish
const [lonB, latB] = unproject(box.x1, box.z1);
const LON = [Math.min(lonA, lonB), Math.max(lonA, lonB)];
const LAT = [Math.min(latA, latB), Math.max(latA, latB)];
const inBox = (lon, lat) => lon >= LON[0] && lon <= LON[1] && lat >= LAT[0] && lat <= LAT[1];
// a cheap text prefilter for the streaming scan: every coordinate inside the
// window starts with these, so a feature string without one cannot be in it
const PRE_LON = LON.map((v) => v.toFixed(3).slice(0, 6));    // "-73.94"
const PRE_LAT = LAT.map((v) => v.toFixed(3).slice(0, 5));    // "40.80"
const lonPrefixes = [...new Set([PRE_LON[0], PRE_LON[1], LON[0].toFixed(2), LON[1].toFixed(2)])];
const latPrefixes = [...new Set([PRE_LAT[0], PRE_LAT[1]])];
const maybeHere = (s) => lonPrefixes.some((p) => s.includes(p)) && latPrefixes.some((p) => s.includes(p));

console.log(`window: ${HALF * 2} x ${HALF * 2} m around ${K0.look[0].toFixed(6)},${K0.look[1].toFixed(6)}`);
console.log(`        lon ${LON[0].toFixed(5)}..${LON[1].toFixed(5)}  lat ${LAT[0].toFixed(5)}..${LAT[1].toFixed(5)}`);

// ------------------------------------------------------------ streaming scan
// Split a FeatureCollection on the `{"type":"Feature"` literal without ever
// holding the whole file: geometry coordinates and Socrata property values are
// numbers and short strings, so the literal only ever starts a feature.
const MARK = '{"type":"Feature"';
async function scanFeatures(file, onFeature) {
  if (!fs.existsSync(file)) { console.log(`  (missing ${path.basename(file)})`); return 0; }
  const rs = fs.createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 22 });
  let buf = '', n = 0, kept = 0;
  const emit = (s) => {
    n++;
    if (!maybeHere(s)) return;
    let t = s.trim();
    while (t.endsWith(',') || t.endsWith(']') || t.endsWith('}')) {
      try { const f = JSON.parse(t); if (onFeature(f)) kept++; return; } catch { t = t.slice(0, -1); }
    }
  };
  for await (const chunk of rs) {
    buf += chunk;
    for (;;) {
      const a = buf.indexOf(MARK);
      if (a < 0) { if (buf.length > 1 << 24) buf = buf.slice(-MARK.length); break; }
      const b = buf.indexOf(MARK, a + MARK.length);
      if (b < 0) { buf = buf.slice(a); break; }
      emit(buf.slice(a, b));
      buf = buf.slice(b);
    }
  }
  if (buf.includes(MARK)) emit(buf.slice(buf.indexOf(MARK)));
  console.log(`  ${path.basename(file)}: ${n} features scanned, ${kept} in window`);
  return kept;
}

const out = { meta: {}, footprints: [], streets: [], trees: [], buslanes: [], hydrants: [], nodes: [] };
const round = (v, d = 6) => +v.toFixed(d);
// The four cached "boro" dumps are NOT disjoint — `buildings_1` and
// `buildings_4` return the same 688 footprints for this window, and the street
// and tree files do the same. Dedupe on the geometry itself, or the junction
// graph below sees every leg twice and calls every node a four-way.
const seen = new Set();
const once = (k) => (seen.has(k) ? false : (seen.add(k), true));

// ---- 1. NYC Open Data Building Footprints (5zhs-2jue)
console.log('building footprints (5zhs-2jue)…');
for (const i of [1, 2, 3, 4]) {
  await scanFeatures(path.join(RAW, `buildings_${i}.geojson`), (f) => {
    const g = f.geometry; if (!g) return false;
    const polys = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [];
    const rings = [];
    for (const poly of polys) for (const ring of poly) {
      if (!ring.some(([lo, la]) => inBox(lo, la))) continue;
      rings.push(ring.map(([lo, la]) => [round(lo), round(la)]));
    }
    if (!rings.length) return false;
    const p = f.properties || {};
    if (!once('b:' + (p.bin || rings[0][0].join(',')))) return false;
    out.footprints.push({
      rings,
      h: p.height_roof ? +p.height_roof : null,          // feet, roof height
      yr: p.construction_year ? +p.construction_year : null,
      bbl: p.mappluto_bbl || p.base_bbl || null,
      bin: p.bin || null,
    });
    return true;
  });
}

// ---- 2. CSCL street centrelines (inkn-q76z)
console.log('CSCL street centrelines (inkn-q76z)…');
for (const i of [1, 2, 3, 4]) {
  await scanFeatures(path.join(RAW, `streets_${i}.geojson`), (f) => {
    const g = f.geometry; if (!g) return false;
    const lines = g.type === 'MultiLineString' ? g.coordinates : g.type === 'LineString' ? [g.coordinates] : [];
    const keep = lines.filter((ln) => ln.some(([lo, la]) => inBox(lo, la)));
    if (!keep.length) return false;
    const p = f.properties || {};
    if (!once('s:' + (p.physicalid || p.objectid || JSON.stringify(keep[0])))) return false;
    out.streets.push({
      lines: keep.map((ln) => ln.map(([lo, la]) => [round(lo), round(la)])),
      name: p.full_street_name || p.stname_label || null,
      w: p.streetwidth ? +p.streetwidth : null,          // feet, curb to curb
      lanes: p.number_travel_lanes ? +p.number_travel_lanes : null,
      park: p.number_park_lanes ? +p.number_park_lanes : null,
      dir: p.trafdir || null,
      bike: p.bike_lane || null,
      rw: p.rw_type ? +p.rw_type : null,
      speed: p.posted_speed ? +p.posted_speed : null,
    });
    return true;
  });
}

// ---- 3. 2015 Street Tree Census (uvpi-gqnh)
console.log('street tree census (uvpi-gqnh)…');
for (const i of [1, 2, 3, 4]) {
  const file = path.join(RAW, `trees_${i}.csv`);
  if (!fs.existsSync(file)) continue;
  let hdr = null, n = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!hdr) { hdr = line.split(',').map((s) => s.replace(/"/g, '')); continue; }
    const c = line.split('","').map((s) => s.replace(/"/g, ''));
    const lat = +c[hdr.indexOf('latitude')], lon = +c[hdr.indexOf('longitude')];
    if (!inBox(lon, lat)) continue;
    if (c[hdr.indexOf('status')] && c[hdr.indexOf('status')] !== 'Alive') continue;
    if (!once('t:' + lon.toFixed(7) + ',' + lat.toFixed(7))) continue;
    out.trees.push({ p: [round(lon), round(lat)], spc: c[hdr.indexOf('spc_common')] || null, dbh: +c[hdr.indexOf('tree_dbh')] || null });
    n++;
  }
  console.log(`  trees_${i}.csv: ${n} in window`);
}

// ---- 4. DOT bus lanes (Bus Lanes - Local Streets, LION)
console.log('DOT bus lanes…');
{
  const bl = JSON.parse(fs.readFileSync(path.join(RAW, 'bus_lanes.json'), 'utf8'));
  for (const r of bl) {
    const g = r.the_geom; if (!g) continue;
    const lines = (g.type === 'MultiLineString' ? g.coordinates : [g.coordinates])
      .filter((ln) => ln.some(([lo, la]) => inBox(lo, la)));
    if (!lines.length) continue;
    out.buslanes.push({
      lines: lines.map((ln) => ln.map(([lo, la]) => [round(lo), round(la)])),
      street: r.street || null, type: r.lane_type || null, hours: r.hours || null, days: r.days || null,
    });
  }
  console.log(`  bus_lanes.json: ${bl.length} rows, ${out.buslanes.length} in window`);
}

// ---- 5. DEP hydrants (5bgh-vtsn) — a small layer, but it is the one that
// always surprises people that the city publishes
console.log('hydrants (5bgh-vtsn)…');
await scanFeatures(path.join(RAW, 'hydrants.geojson'), (f) => {
  const c = f.geometry && f.geometry.coordinates; if (!c || !inBox(c[0], c[1])) return false;
  if (!once('h:' + c[0].toFixed(7) + ',' + c[1].toFixed(7))) return false;
  out.hydrants.push([round(c[0]), round(c[1])]);
  return true;
});

// ---- 6. PLUTO (64uk-42ks): tabular, joined to the footprints on BBL. There is
// no lot POLYGON in the Socrata export the pipeline caches, so the honest
// drawing is the footprint carrying its lot's record, which is exactly what
// compile.mjs does (floors, year, class, land use -> massing and facade style).
console.log('PLUTO join (64uk-42ks)…');
{
  const wanted = new Set(out.footprints.map((f) => f.bbl && String(Math.round(+f.bbl))).filter(Boolean));
  const rows = new Map();
  let total = 0;
  for (const i of [1, 2, 3, 4]) {
    const file = path.join(RAW, `pluto_${i}.csv`);
    if (!fs.existsSync(file)) continue;
    let hdr = null;
    const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!hdr) { hdr = line.split(',').map((s) => s.replace(/"/g, '')); continue; }
      total++;
      const c = line.split('","').map((s) => s.replace(/^"|"$/g, ''));
      const bbl = String(Math.round(+c[hdr.indexOf('bbl')]));
      if (!wanted.has(bbl)) continue;
      rows.set(bbl, {
        fl: +c[hdr.indexOf('numfloors')] || null, yr: +c[hdr.indexOf('yearbuilt')] || null,
        cls: c[hdr.indexOf('bldgclass')] || null, use: c[hdr.indexOf('landuse')] || null,
        area: +c[hdr.indexOf('lotarea')] || null, addr: c[hdr.indexOf('address')] || null,
      });
    }
  }
  for (const f of out.footprints) { const k = f.bbl && String(Math.round(+f.bbl)); if (k && rows.has(k)) f.pluto = rows.get(k); }
  out.meta.plutoRows = total;
  console.log(`  ${total} PLUTO rows scanned, ${rows.size} lots joined to ${out.footprints.length} footprints`);
}

// ---- 7. junction nodes, and which of them the compiler signalises.
// compile.mjs:1318 — `n.signal = n.isX && (any stub is rclass 2 || >= 4 legs)`,
// rclass 2 being a roadway 13.5 m or wider curb-to-curb. Derived here from the
// same centrelines, so the layer is the graph the compiler builds, not a
// separate download.
{
  const FT = 0.3048, key = (lo, la) => `${lo.toFixed(5)},${la.toFixed(5)}`;
  const ends = new Map();
  for (const s of out.streets) {
    if (s.rw && ![1, 2, 9, 10, 11].includes(s.rw)) continue;
    // compile.mjs:305/341 — `streetwidth` is FEET, curb to curb, and 13.5 m is
    // the rclass-2 ("wide roadway") bar that makes a junction signalised
    const wide = ((s.w || (s.rw === 2 ? 60 : 30)) * FT) >= 13.5;
    for (const ln of s.lines) for (const e of [ln[0], ln[ln.length - 1]]) {
      const k = key(e[0], e[1]);
      if (!ends.has(k)) ends.set(k, { p: e, legs: 0, wide: false, names: new Set() });
      const n = ends.get(k); n.legs++; n.wide = n.wide || wide; if (s.name) n.names.add(s.name);
    }
  }
  for (const n of ends.values()) {
    if (n.legs < 3 || !inBox(n.p[0], n.p[1])) continue;
    out.nodes.push({ p: n.p, legs: n.legs, signal: !!(n.wide || n.legs >= 4), names: [...n.names] });
  }
  console.log(`  junction nodes: ${out.nodes.length} (${out.nodes.filter((n) => n.signal).length} signalised)`);
}

out.meta = {
  ...out.meta,
  generated: new Date().toISOString(),
  shot: opt('shot', 'fStreetGeom'),
  half: HALF,
  lon: LON, lat: LAT,
  camera: { p: K0.p, look: K0.look, fovY: 66, aspect: 16 / 9 },
  counts: {
    footprints: out.footprints.length, streets: out.streets.length, trees: out.trees.length,
    buslanes: out.buslanes.length, hydrants: out.hydrants.length, nodes: out.nodes.length,
    signals: out.nodes.filter((n) => n.signal).length,
  },
};
const dst = path.join(root, 'client', 'shots', 'ad', 'mapdata.json');
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.writeFileSync(dst, JSON.stringify(out));
console.log('\n' + JSON.stringify(out.meta.counts));
console.log('-> ' + path.relative(root, dst) + `  (${(fs.statSync(dst).size / 1024).toFixed(0)} KB)`);
