// Plan-view maps for the README figures and the documentation site (SVG).
//
//   node tools/figures/maps.mjs [--raw boundlessjs/data/raw] [--tiles boundlessjs/public/tiles] [--out <dir>]
//
//   records.svg   the public records around W 125th St & Lenox Ave as the compiler receives them: DoITT footprints
//                 coloured by PLUTO land use, CSCL street centrelines, 2015 street-tree census, hydrants, subway
//                 entrances (needs the raw downloads: `npm run fetch` in boundlessjs/)
//   compiled.svg  the same area from the compiled tiles: carriageway, kerbs, sidewalks, lane paint, lawns, and every
//                 building coloured by its facade typology
//   coverage.svg  every near tile of the manifest, shaded by building count, with the far-field tiles behind
//   legend.json   the colours and counts the figure templates print next to the maps
//
// Plan views of the Lenox area are rotated 29.1 degrees so the Manhattan grid is axis-aligned and "up" is the
// heading of the lenox_oblique render in capture.py.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { project, STYLE } from '../../boundlessjs/src/shared/geo.js';
import { parseTile, buildingsOf } from '../../boundlessjs/src/world/tiledata.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const RAW = path.resolve(opt('raw', path.join(repo, 'boundlessjs', 'data', 'raw')));
const TILES = path.resolve(opt('tiles', path.join(repo, 'boundlessjs', 'public', 'tiles')));
const OUT = path.resolve(opt('out', path.join(repo, 'docs', 'assets', 'figures', 'maps')));
fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- frame: 125th St & Lenox Ave, grid-aligned
const C = [2167, -2740];
const TH = Math.atan2(2167 - 2094, 2740 - 2609);          // heading of the oblique camera, east of north
const F = [Math.sin(TH), -Math.cos(TH)], R = [Math.cos(TH), Math.sin(TH)];
const VIEW = { u0: -250, u1: 250, v0: -150, v1: 215 };     // metres right / forward of C
const toUV = (x, z) => { const dx = x - C[0], dz = z - C[1]; return [dx * R[0] + dz * R[1], -(dx * F[0] + dz * F[1])]; };
const inView = ([u, v], m = 30) => u > VIEW.u0 - m && u < VIEW.u1 + m && -v > VIEW.v0 - m && -v < VIEW.v1 + m;
const vb = `${VIEW.u0} ${-VIEW.v1} ${VIEW.u1 - VIEW.u0} ${VIEW.v1 - VIEW.v0}`;
const f1 = (n) => (Math.round(n * 10) / 10).toString();
const svg = (w, body, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${Math.round(w * (VIEW.v1 - VIEW.v0) / (VIEW.u1 - VIEW.u0))}">` +
  `<rect x="${VIEW.u0}" y="${-VIEW.v1}" width="${VIEW.u1 - VIEW.u0}" height="${VIEW.v1 - VIEW.v0}" fill="${bg}"/>${body}</svg>\n`;
const ringPath = (pts) => pts.length > 2 ? 'M' + pts.map(([u, v]) => f1(u) + ' ' + f1(v)).join('L') + 'Z' : '';
const legend = {};

// ---------------------------------------------------------------- records.svg (raw inputs)
if (fs.existsSync(path.join(RAW, 'buildings_1.geojson'))) {
  const LANDUSE = {
    1: ['One- and two-family', '#f6d36b'], 2: ['Multi-family walk-up', '#f0a458'], 3: ['Multi-family elevator', '#c9784a'],
    4: ['Mixed residential / commercial', '#e8739a'], 5: ['Commercial and office', '#e0525a'], 6: ['Industrial', '#a17fd6'],
    7: ['Transportation and utility', '#8a96a3'], 8: ['Public facilities and institutions', '#5aa5e6'], 9: ['Open space', '#62b66f'],
    10: ['Parking', '#5f6770'], 11: ['Vacant', '#a8b0b8'],
  };
  const pluto = new Map();
  const csv = fs.readFileSync(path.join(RAW, 'pluto_1.csv'), 'utf8').split('\n');
  const head = csv[0].replace(/"/g, '').split(',');
  const iB = head.indexOf('bbl'), iL = head.indexOf('landuse');
  for (let k = 1; k < csv.length; k++) {
    const c = csv[k].match(/("([^"]*)"|[^,]*)(,|$)/g)?.map((s) => s.replace(/,$/, '').replace(/^"|"$/g, ''));
    if (c && c[iB]) pluto.set(String(Math.round(parseFloat(c[iB]))), parseInt(c[iL], 10));
  }
  const counts = { footprints: 0, centrelines: 0, trees: 0, hydrants: 0, subway: 0 };
  const byUse = {};
  const geo = JSON.parse(fs.readFileSync(path.join(RAW, 'buildings_1.geojson'), 'utf8'));
  for (const ft of geo.features) {
    const g = ft.geometry; if (!g) continue;
    const polys = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [];
    for (const poly of polys) {
      const ring = poly[0].map(([lon, lat]) => toUV(...project(lon, lat)));
      if (!ring.some((p) => inView(p, 0))) continue;
      const bbl = String(Math.round(parseFloat(ft.properties?.mappluto_bbl ?? ft.properties?.base_bbl ?? '0')));
      const use = pluto.get(bbl) || 0;
      (byUse[use] ||= []).push(ringPath(ring));
      counts.footprints++;
    }
  }
  let body = '';
  for (const [use, paths] of Object.entries(byUse)) {
    body += `<path d="${paths.join('')}" fill="${LANDUSE[use]?.[1] || '#6b7580'}" fill-opacity="0.9" stroke="#0b1017" stroke-width="0.6"/>`;
  }
  const streets = JSON.parse(fs.readFileSync(path.join(RAW, 'streets_1.geojson'), 'utf8'));
  let sl = '';
  for (const ft of streets.features) {
    const g = ft.geometry; if (!g) continue;
    const lines = g.type === 'MultiLineString' ? g.coordinates : g.type === 'LineString' ? [g.coordinates] : [];
    for (const ln of lines) {
      const pts = ln.map(([lon, lat]) => toUV(...project(lon, lat)));
      if (pts.length < 2 || !pts.some((p) => inView(p))) continue;
      sl += 'M' + pts.map(([u, v]) => f1(u) + ' ' + f1(v)).join('L');
      counts.centrelines++;
    }
  }
  body += `<path d="${sl}" fill="none" stroke="#dfe7f0" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.95"/>`;
  const trees = fs.readFileSync(path.join(RAW, 'trees_1.csv'), 'utf8').split('\n');
  const th = trees[0].replace(/"/g, '').split(',');
  const iD = th.indexOf('tree_dbh'), iLa = th.indexOf('latitude'), iLo = th.indexOf('longitude');
  let tr = '';
  for (let k = 1; k < trees.length; k++) {
    const c = trees[k].replace(/"/g, '').split(',');
    if (c.length < th.length) continue;
    const p = toUV(...project(parseFloat(c[iLo]), parseFloat(c[iLa])));
    if (!inView(p, 0)) continue;
    const r = Math.max(1.6, Math.min(4.5, 1.2 + parseFloat(c[iD] || '6') * 0.12));
    tr += `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${f1(r)}"/>`;
    counts.trees++;
  }
  body += `<g fill="#6fd08c" fill-opacity="0.92" stroke="#0b1017" stroke-width="0.4">${tr}</g>`;
  const hyd = JSON.parse(fs.readFileSync(path.join(RAW, 'hydrants.geojson'), 'utf8'));
  let hy = '';
  for (const ft of hyd.features) {
    const [lon, lat] = ft.geometry?.coordinates || [];
    if (lon == null) continue;
    const p = toUV(...project(lon, lat));
    if (!inView(p, 0)) continue;
    hy += `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="1.7"/>`;
    counts.hydrants++;
  }
  body += `<g fill="#ff5d5d" stroke="#0b1017" stroke-width="0.4">${hy}</g>`;
  const sub = fs.readFileSync(path.join(RAW, 'subway.csv'), 'utf8').split('\n');
  const sh = sub[0].replace(/"/g, '').split(',');
  const sLa = sh.indexOf('entrance_latitude'), sLo = sh.indexOf('entrance_longitude');
  let su = '';
  for (let k = 1; k < sub.length; k++) {
    const c = sub[k].match(/("([^"]*)"|[^,]*)(,|$)/g)?.map((s) => s.replace(/,$/, '').replace(/^"|"$/g, ''));
    if (!c || !c[sLa]) continue;
    const p = toUV(...project(parseFloat(c[sLo]), parseFloat(c[sLa])));
    if (!inView(p, 0)) continue;
    su += `<rect x="${f1(p[0] - 2.4)}" y="${f1(p[1] - 2.4)}" width="4.8" height="4.8" rx="0.8"/>`;
    counts.subway++;
  }
  body += `<g fill="#ffd166" stroke="#0b1017" stroke-width="0.5">${su}</g>`;
  fs.writeFileSync(path.join(OUT, 'records.svg'), svg(1400, body, '#0d131b'));
  legend.records = { counts, landuse: Object.keys(byUse).filter((k) => LANDUSE[k]).map((k) => ({ use: +k, name: LANDUSE[k][0], color: LANDUSE[k][1], n: byUse[k].length })) };
  console.log('records.svg', JSON.stringify(counts));
} else console.log(`records.svg skipped: no raw data in ${RAW}`);

// ---------------------------------------------------------------- compiled.svg (tile content)
{
  const TYPO = {
    TENEMENT: '#c65a4a', PREWAR_APT: '#d98f5c', POSTWAR_BRICK: '#e3c27d', MODERN_GLASS: '#63b3e0', DECO_MASONRY: '#b49ddb',
    ROWHOUSE: '#9b6f5b', LOFT_CASTIRON: '#a7adb3', INDUSTRIAL: '#7c8a93', CIVIC_STONE: '#eadbbd', CHURCH: '#d39ad8',
    RETAIL_STRIP: '#f4ae4f', GLASS_TOWER_BLUE: '#48c6f0', PROJECT_BRICK: '#b0735f', RETAIL_MODERN: '#ffd35c',
    FRAME_HOUSE: '#a9d27a', CONDO_NEW: '#7fd0c4',
  };
  const NAME = Object.fromEntries(Object.entries(STYLE).map(([k, v]) => [v, k]));
  const SURF = [['grass', '#4f7a45'], ['asphalt', '#3a3f46'], ['gutter', '#33373d'], ['busred', '#a4453d'], ['sidewalk', '#a3a9b0'],
    ['curb', '#d1d5d9'], ['path', '#b9aa8e'], ['brick', '#a26a53'], ['warn', '#d9a441'], ['warnIron', '#5d6166'],
    ['paintW', '#f4f4f2'], ['paintY', '#f0c84a'], ['paintG', '#56b35a']];
  const man = JSON.parse(fs.readFileSync(path.join(TILES, 'manifest.json'), 'utf8'));
  const surf = Object.fromEntries(SURF.map(([n]) => [n, []]));
  const bldg = {};
  let nB = 0;
  for (const key of Object.keys(man.tiles)) {
    const [ti, tj] = key.split('_').map(Number);
    const cx = (ti + 0.5) * man.tile, cz = (tj + 0.5) * man.tile;
    if (!inView(toUV(cx, cz), 380)) continue;
    const buf = fs.readFileSync(path.join(TILES, man.tiles[key].f));
    const tile = parseTile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const [ox, oz] = tile.header.origin;
    for (const [name] of SURF) {
      const a = tile.S[name]; if (!a) continue;
      for (let i = 0; i + 8 < a.length; i += 9) {
        const t = [toUV(a[i] + ox, a[i + 2] + oz), toUV(a[i + 3] + ox, a[i + 5] + oz), toUV(a[i + 6] + ox, a[i + 8] + oz)];
        if (!t.some((p) => inView(p, 4))) continue;
        surf[name].push('M' + t.map(([u, v]) => f1(u) + ' ' + f1(v)).join('L') + 'Z');
      }
    }
    for (const b of buildingsOf(tile)) {
      const ring = [];
      for (let i = 0; i < b.len; i++) ring.push(toUV(tile.S.bldgXZ[(b.start + i) * 2] + ox, tile.S.bldgXZ[(b.start + i) * 2 + 1] + oz));
      if (!ring.some((p) => inView(p, 0))) continue;
      const s = NAME[b.style] || 'TENEMENT';
      (bldg[s] ||= []).push(ringPath(ring));
      nB++;
    }
  }
  let body = '';
  for (const [name, col] of SURF) if (surf[name].length) body += `<path d="${surf[name].join('')}" fill="${col}" stroke="${col}" stroke-width="0.12"/>`;
  for (const [s, paths] of Object.entries(bldg)) body += `<path d="${paths.join('')}" fill="${TYPO[s] || '#999'}" stroke="#15191e" stroke-width="0.7"/>`;
  fs.writeFileSync(path.join(OUT, 'compiled.svg'), svg(1400, body, '#2a2e33'));
  legend.compiled = { buildings: nB, typology: Object.entries(bldg).map(([s, p]) => ({ style: s, color: TYPO[s], n: p.length })).sort((a, b) => b.n - a.n) };
  console.log('compiled.svg', nB, 'buildings,', Object.values(surf).reduce((s, a) => s + a.length, 0), 'surface triangles');
}

// ---------------------------------------------------------------- coverage.svg (all tiles)
{
  const man = JSON.parse(fs.readFileSync(path.join(TILES, 'manifest.json'), 'utf8'));
  const T = man.tile, M = man.macro;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const k of Object.keys(man.tiles)) { const [i, j] = k.split('_').map(Number); x0 = Math.min(x0, i * T); z0 = Math.min(z0, j * T); x1 = Math.max(x1, (i + 1) * T); z1 = Math.max(z1, (j + 1) * T); }
  const pad = 1500;
  x0 -= pad; z0 -= pad; x1 += pad; z1 += pad;
  const ramp = ['#16324f', '#1f5f7a', '#23899a', '#3fb2a0', '#8fd18a', '#e2e36f', '#ffd166'];
  const colorOf = (t) => { const f = Math.max(0, Math.min(0.999, t)) * (ramp.length - 1); const k = Math.floor(f), w = f - k;
    const a = parseInt(ramp[k].slice(1), 16), b = parseInt(ramp[k + 1].slice(1), 16);
    const mix = (s) => Math.round(((a >> s) & 255) * (1 - w) + ((b >> s) & 255) * w);
    return '#' + ((mix(16) << 16) | (mix(8) << 8) | mix(0)).toString(16).padStart(6, '0'); };
  const maxB = Math.max(...Object.values(man.tiles).map((t) => t.b));
  let body = '';
  for (const k of Object.keys(man.macros)) { const [i, j] = k.split('_').map(Number);
    body += `<rect x="${i * M}" y="${j * M}" width="${M}" height="${M}" fill="#101c28" stroke="#0a1119" stroke-width="24"/>`; }
  let total = 0;
  for (const [k, t] of Object.entries(man.tiles)) { const [i, j] = k.split('_').map(Number); total += t.b;
    body += `<rect x="${i * T + 14}" y="${j * T + 14}" width="${T - 28}" height="${T - 28}" rx="36" fill="${colorOf(Math.log1p(t.b) / Math.log1p(maxB))}"/>`; }
  const labels = [['Manhattan', -73.975, 40.772], ['The Bronx', -73.872, 40.852], ['Brooklyn', -73.944, 40.648], ['Queens', -73.82, 40.705]];
  for (const [name, lon, lat] of labels) { const [x, z] = project(lon, lat);
    body += `<text x="${x}" y="${z}" font-family="Inter, sans-serif" font-size="900" font-weight="600" fill="#ffffff" fill-opacity="0.92" text-anchor="middle" letter-spacing="40">${name.toUpperCase()}</text>`; }
  const W = 1400, H = Math.round(W * (z1 - z0) / (x1 - x0));
  fs.writeFileSync(path.join(OUT, 'coverage.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${z0} ${x1 - x0} ${z1 - z0}" width="${W}" height="${H}"><rect x="${x0}" y="${z0}" width="${x1 - x0}" height="${z1 - z0}" fill="#070b10"/>${body}</svg>\n`);
  legend.coverage = { tiles: Object.keys(man.tiles).length, macros: Object.keys(man.macros).length, buildingRecords: total, maxPerTile: maxB, ramp, extentKm: [+((x1 - x0 - 2 * pad) / 1000).toFixed(1), +((z1 - z0 - 2 * pad) / 1000).toFixed(1)] };
  console.log('coverage.svg', Object.keys(man.tiles).length, 'tiles,', total, 'building records, max', maxB, 'per tile');
}
fs.writeFileSync(path.join(OUT, 'legend.json'), JSON.stringify(legend, null, 1));
