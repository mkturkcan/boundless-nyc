// CP32L: bakes the OSM polygons Central Park's land part draws into src/city/cpLandData.js.
// usage: node tools/cp/land_bake.mjs <osm_land.json> [tilesDir=public/tiles] [out=src/city/cpLandData.js]
// The OSM extract is an Overpass bbox query (lat 40.7644-40.8005, lon -73.9818 to -73.9493, `out geom`) kept to the park
// polygon (way 427818536). Per water body: the ring(s) in world metres (shared/geo.js project), simplified to 0.25 m and
// resampled to <= 3 m, and per ring vertex the bank width: the distance from the shore to the nearest compiled hard
// ground (path, sidewalk, drive) outside the water, less 0.5 m, clamped per kind, so a bank never tilts a path that runs
// along the water. Streams (OSM lines) are buffered to their width and stopped where they enter another water body.
import fs from 'node:fs';
import { tileSet, osmPolys, ringArea, pip, inPoly, simplifyRing, segDist, project } from './land_lib.mjs';

const [,, osmPath, tdir = 'public/tiles', outPath = 'src/city/cpLandData.js'] = process.argv;
const osm = JSON.parse(fs.readFileSync(osmPath, 'utf8'));
const T = tileSet(tdir);
const park = osm.elements.find((e) => e.type === 'way' && e.id === 427818536);
const PR = osmPolys(park)[0].outer;
const centroid = (r) => { let x = 0, z = 0; for (const p of r) { x += p[0]; z += p[1]; } return [x / r.length, z / r.length]; };
const inPark = (r) => { const [x, z] = centroid(r); return pip(x, z, PR); };
const r1 = (v) => Math.round(v * 10) / 10;
const ccw = (r) => (ringArea(r) < 0 ? r.slice().reverse() : r);   // world x east, z south: positive shoelace area
const cw = (r) => (ringArea(r) > 0 ? r.slice().reverse() : r);
function densify(r, step) {
  const out = [];
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) out.push([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]);
  }
  return out;
}

// ---- water bodies: key, OSM id, 3DEP level (NAVD88 m: the mode of the samples > 10 m inside, tools/cp/land_levels.mjs),
// the drop under the lawn on the flat datum (used while the relief is not loaded), the kind and the bank's widest
const BODIES = [
  { k: 'lake', id: 7895705, dem: 16.6, flat: 1.0, kind: 'lake', wmax: 6.0 },
  { k: 'reservoir', id: 6678417, dem: 36.9, flat: 1.5, kind: 'reservoir', wmax: 0 },
  { k: 'turtle', id: 166150, dem: 32.0, flat: 0.55, kind: 'lake', wmax: 5.0 },
  { k: 'pond', id: 22726524, dem: 7.1, flat: 1.15, kind: 'lake', wmax: 5.0 },
  { k: 'meer', id: 2155107, dem: 5.55, flat: 0.95, kind: 'lake', wmax: 6.0 },
  { k: 'conservatory', id: 22886740, dem: 13.7, flat: 0.3, kind: 'coped', wmax: 0 },
  { k: 'pool', id: 37183391, dem: 16.6, flat: 0.9, kind: 'lake', wmax: 4.0 },
  { k: 'azalea', id: 431227167, dem: 25.4, flat: 0.5, kind: 'lake', wmax: 2.0 },
  { k: 'meerinlet', id: 1384098917, dem: 5.6, flat: 0.9, kind: 'lake', wmax: 3.0 },
  // small basins with a stone coping: the zoo's sea lion pool and its neighbours, the Met's two plaza fountains, the
  // Conservatory Garden's pools, the Maine monument's basin; their level is the local ground less 0.3 m
  { k: 'zoo1', id: 108111435, kind: 'basin' }, { k: 'zoo2', id: 108111423, kind: 'basin' }, { k: 'zoo3', id: 108111417, kind: 'basin' }, { k: 'zoo4', id: 265347600, kind: 'basin' },
  { k: 'met1', id: 552699591, kind: 'basin' }, { k: 'met2', id: 552699597, kind: 'basin' },
  { k: 'untermyer', id: 386469202, kind: 'basin' }, { k: 'cgpool1', id: 386478829, kind: 'basin' }, { k: 'cgpool2', id: 301283855, kind: 'basin' },
  { k: 'maine', id: 608965022, kind: 'basin' },
];
// streams (OSM lines): key, ids, width (m)
const STREAMS = [
  { k: 'loch', ids: [104336130], w: 3.2 }, { k: 'loch2', ids: [784188865], w: 2.0 }, { k: 'poolrun', ids: [1360706187], w: 2.0 },
  { k: 'gill', ids: [431227173], w: 2.2 }, { k: 'gill2', ids: [431227168], w: 1.5 }, { k: 'gill3', ids: [431227166], w: 1.5 },
];

// hard compiled ground near the water (the bank stops short of it)
const HARD = ['path', 'sidewalk', 'asphalt', 'gutter', 'curb', 'brick', 'paintW', 'paintY', 'paintG'];
const byId = new Map(osm.elements.map((e) => [e.type[0] + e.id, e]));
const elOf = (id) => byId.get('w' + id) || byId.get('r' + id);
const water = [];
for (const B of BODIES) {
  const e = elOf(B.id);
  if (!e) { console.warn('missing', B.k, B.id); continue; }
  const polys = osmPolys(e);
  const P = polys.sort((a, b) => Math.abs(ringArea(b.outer)) - Math.abs(ringArea(a.outer)))[0];
  const tol = B.kind === 'basin' ? 0.08 : 0.25;
  const outer = ccw(densify(simplifyRing(P.outer, tol), 3));
  const holes = P.holes.map((h) => cw(densify(simplifyRing(h, tol), 3)));
  water.push({ ...B, name: e.tags?.name || '', P: { outer, holes } });
}
// streams: clip each line to outside the water bodies, then buffer
const inWater = (x, z) => water.some((w) => w.kind !== 'basin' && inPoly(x, z, w.P));
for (const S of STREAMS) {
  for (const id of S.ids) {
    const e = elOf(id);
    if (!e) { console.warn('missing stream', S.k, id); continue; }
    let pts = e.geometry.map((g) => project(g.lon, g.lat));
    // stop where it enters a lake (keep one point inside so the buffer overlaps the lake's water a little)
    const keep = [];
    for (let i = 0; i < pts.length; i++) {
      const w = inWater(pts[i][0], pts[i][1]);
      if (!w) keep.push(pts[i]);
      else if (keep.length && (i === 0 || !inWater(pts[i - 1][0], pts[i - 1][1]))) keep.push(pts[i]);
    }
    pts = keep;
    // drop the leading run inside water too
    while (pts.length > 2 && inWater(pts[0][0], pts[0][1]) && inWater(pts[1][0], pts[1][1])) pts.shift();
    if (pts.length < 2) continue;
    // one Chaikin pass, then the buffer
    const sm = [pts[0]];
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i], q = pts[i + 1];
      sm.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
    }
    sm.push(pts[pts.length - 1]);
    const hw = S.w / 2, L = [], R = [];
    for (let i = 0; i < sm.length; i++) {
      const a = sm[Math.max(0, i - 1)], b = sm[Math.min(sm.length - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l;
      const vary = 1 + 0.25 * Math.sin(i * 0.9 + id % 7);   // pools and narrows
      L.push([sm[i][0] + nx * hw * vary, sm[i][1] + nz * hw * vary]);
      R.push([sm[i][0] - nx * hw * vary, sm[i][1] - nz * hw * vary]);
    }
    const ring = ccw(densify(L.concat(R.reverse()), 2));
    water.push({ k: S.k + (S.ids.length > 1 ? '_' + id : ''), id, name: e.tags?.name || '', kind: 'stream', wmax: 1.6, P: { outer: ring, holes: [] }, line: sm });
  }
}

// ---- bank widths from the compiled hard ground
const hardTris = [];
{
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const w of water) for (const [x, z] of w.P.outer) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const TILE = T.TILE;
  for (let tz = Math.floor((z0 - 20) / TILE); tz <= Math.floor((z1 + 20) / TILE); tz++) for (let tx = Math.floor((x0 - 20) / TILE); tx <= Math.floor((x1 + 20) / TILE); tx++) {
    const t = T.load(tx, tz);
    if (!t) continue;
    for (const name of HARD) {
      const a = t.S[name];
      if (!a) continue;
      for (let i = 0; i + 8 < a.length; i += 9) {
        const tri = [[a[i] + t.ox, a[i + 2] + t.oz], [a[i + 3] + t.ox, a[i + 5] + t.oz], [a[i + 6] + t.ox, a[i + 8] + t.oz]];
        const [cx, cz] = centroid(tri);
        if (inWater(cx, cz)) continue;   // a path over the water (a bridge line): cut, not a bank limit
        hardTris.push(tri);
      }
    }
  }
}
const CELL = 8, grid = new Map();
for (const tri of hardTris) {
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const [x, z] of tri) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
    const k = i + ',' + j;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(tri);
  }
}
function hardDist(x, z, R) {
  let best = R;
  const i0 = Math.floor((x - R) / CELL), i1 = Math.floor((x + R) / CELL), j0 = Math.floor((z - R) / CELL), j1 = Math.floor((z + R) / CELL);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const L = grid.get(i + ',' + j);
    if (!L) continue;
    for (const t of L) {
      if (pip(x, z, t)) return 0;
      for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3]; best = Math.min(best, segDist(x, z, a[0], a[1], b[0], b[1])); }
    }
  }
  return best;
}
const bankW = (r, wmax) => r.map(([x, z]) => (wmax > 0 ? r1(Math.max(0.5, Math.min(wmax, hardDist(x, z, wmax + 1) - 0.5))) : 0));

// ---- other cover (for the ground mask and the outcrops)
const polysOf = (pred, tol) => {
  const out = [];
  for (const e of osm.elements) {
    if (!pred(e.tags || {}) || (e.type !== 'way' && e.type !== 'relation')) continue;
    if (e.type === 'way' && (!e.geometry || e.nodes[0] !== e.nodes[e.nodes.length - 1])) continue;
    for (const P of osmPolys(e)) {
      if (P.outer.length < 3 || !inPark(P.outer)) continue;
      out.push({ id: e.id, tags: e.tags, outer: ccw(simplifyRing(P.outer, tol)), holes: P.holes.map((h) => cw(simplifyRing(h, tol))) });
    }
  }
  return out;
};
const woods = polysOf((t) => t.natural === 'wood' || t.landuse === 'forest', 0.8);
const scrub = polysOf((t) => t.natural === 'scrub', 0.8);
const rocks = polysOf((t) => t.natural === 'bare_rock', 0.3);
const pitches = polysOf((t) => t.leisure === 'pitch', 0.3);
const lawns = polysOf((t) => (t.landuse === 'grass' || t.landuse === 'meadow' || t.natural === 'grassland') && t.name, 1.0);
const beds = polysOf((t) => t.landuse === 'flowerbed' || (t.leisure === 'garden' && /Garden|Bed|Walk/.test(t.name || '')), 0.5);

// ---- write
const flat = (r) => r.map(([x, z]) => r1(x) + ',' + r1(z)).join(',');
let out = `// CP32L data (generated by tools/cp/land_bake.mjs; do not edit by hand). World metres (x east, z south; shared/geo.js
// project). Polygons from OpenStreetMap (Overpass bbox extract of Central Park, ${osm.osm3s?.timestamp_osm_base || ''}):
// (c) OpenStreetMap contributors, available under the Open Database Licence (ODbL 1.0, opendatacommons.org/licenses/odbl).
// Water levels: USGS 3DEP (public domain), the mode of the park elevation samples more than 10 m inside each body.
// Bank widths (bw, per outer-ring vertex, m): the distance to the compiled paths and drives, less 0.5 m.
// WATER: { k, id, name, kind (lake | reservoir | coped | basin | stream), dem (NAVD88 m), flat (drop under the lawn on the
// flat datum), outer: [x, z, ...] (counter-clockwise in x-z), holes: [[x, z, ...]] (clockwise), bw: [...] }
export const WATER = [\n`;
for (const w of water) {
  const bw = bankW(w.P.outer, w.wmax || 0);
  const hb = w.P.holes.map((h) => bankW(h, w.wmax || 0));
  out += `  { k: '${w.k}', id: ${w.id}, name: ${JSON.stringify(w.name)}, kind: '${w.kind}', dem: ${w.dem ?? 'null'}, flat: ${w.flat ?? 0.3},\n    outer: [${flat(w.P.outer)}],\n    holes: [${w.P.holes.map((h) => '[' + flat(h) + ']').join(', ')}],\n    bw: [${bw.join(',')}], hbw: [${hb.map((h) => '[' + h.join(',') + ']').join(', ')}] },\n`;
}
out += '];\n';
const polyOut = (name, list, extra) => {
  let s = `export const ${name} = [\n`;
  for (const p of list) s += `  { id: ${p.id}, ${extra ? extra(p) : ''}outer: [${flat(p.outer)}], holes: [${p.holes.map((h) => '[' + flat(h) + ']').join(', ')}] },\n`;
  return s + '];\n';
};
out += '// natural=wood (the Ramble, the North Woods, Hallett Nature Sanctuary ...), natural=scrub\n';
out += polyOut('WOODS', woods, (p) => (p.tags.name ? `name: ${JSON.stringify(p.tags.name)}, ` : ''));
out += polyOut('SCRUB', scrub);
out += '// natural=bare_rock: the schist outcrops\n';
out += polyOut('ROCKS', rocks, (p) => (p.tags.name ? `name: ${JSON.stringify(p.tags.name)}, ` : ''));
out += '// leisure=pitch: sport, surface\n';
out += polyOut('PITCHES', pitches, (p) => `sport: ${JSON.stringify(p.tags.sport || '')}, surface: ${JSON.stringify(p.tags.surface || '')}, `);
out += '// named lawns and meadows (landuse=grass / meadow, natural=grassland)\n';
out += polyOut('LAWNS', lawns, (p) => `name: ${JSON.stringify(p.tags.name)}, `);
out += '// gardens and flower beds\n';
out += polyOut('BEDS', beds, (p) => (p.tags.name ? `name: ${JSON.stringify(p.tags.name)}, ` : ''));
out += `// the park's boundary (NYC Parks / OSM way 427818536), counter-clockwise\nexport const PARK = [${flat(ccw(simplifyRing(PR, 0.3)))}];\n`;
fs.writeFileSync(outPath, out);
console.log('wrote', outPath, (out.length / 1024).toFixed(0), 'KB;', water.length, 'water,', woods.length, 'woods,', scrub.length, 'scrub,', rocks.length, 'rocks,', pitches.length, 'pitches,', lawns.length, 'lawns,', beds.length, 'beds; hard tris', hardTris.length);
for (const w of water) {
  const bw = bankW(w.P.outer, w.wmax || 0);
  const m = bw.length ? bw.reduce((a, b) => a + b, 0) / bw.length : 0;
  console.log(' ', w.k, w.kind, 'verts', w.P.outer.length, '+', w.P.holes.map((h) => h.length).join('/'), 'area', Math.abs(ringArea(w.P.outer)).toFixed(0), 'bank mean', m.toFixed(1), 'min', Math.min(...bw).toFixed(1));
}
