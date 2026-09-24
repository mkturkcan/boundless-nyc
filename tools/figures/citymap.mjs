// The whole compiled city in plan view, raster: every building footprint shaded by height, streets by class, lawns.
//
//   node tools/figures/citymap.mjs [--tiles boundlessjs/public/tiles] [--out <dir>] [--mpp 10] [--bbox x0,z0,x1,z1 --name <file>]
//
// Writes citymap.png (north up, --mpp metres per pixel) and citymap.json (extent in world metres, counts) for the
// coverage figure, which overlays the tile grid and the streaming radii in SVG.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseTile, buildingsOf, roadsOf } from '../../boundlessjs/src/world/tiledata.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const require = createRequire(path.join(repo, 'boundlessjs', 'package.json'));
const { PNG } = require('pngjs');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const TILES = path.resolve(opt('tiles', path.join(repo, 'boundlessjs', 'public', 'tiles')));
const OUT = path.resolve(opt('out', path.join(repo, 'docs', 'assets', 'figures', 'maps')));
const MPP = +opt('mpp', 10);
const BBOX = opt('bbox', null)?.split(',').map(Number);   // x0,z0,x1,z1 world metres: a local map
const NAME = opt('name', 'citymap');
fs.mkdirSync(OUT, { recursive: true });

const man = JSON.parse(fs.readFileSync(path.join(TILES, 'manifest.json'), 'utf8'));
const T = man.tile;
let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
for (const k of Object.keys(man.tiles)) { const [i, j] = k.split('_').map(Number); x0 = Math.min(x0, i * T); z0 = Math.min(z0, j * T); x1 = Math.max(x1, (i + 1) * T); z1 = Math.max(z1, (j + 1) * T); }
if (BBOX) [x0, z0, x1, z1] = BBOX;
const W = Math.ceil((x1 - x0) / MPP), H = Math.ceil((z1 - z0) / MPP);
const height = new Float32Array(W * H);           // tallest building per pixel (m); 0 = none
const road = new Uint8Array(W * H);               // 0 none, 1 street, 2 wide street / avenue
const green = new Uint8Array(W * H);
const px = (x) => (x - x0) / MPP, pz = (z) => (z - z0) / MPP;

function fillPoly(xs, zs, n, fn) {                 // even-odd scanline fill in pixel space
  let ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < n; i++) { ymin = Math.min(ymin, zs[i]); ymax = Math.max(ymax, zs[i]); }
  const ya = Math.max(0, Math.floor(ymin)), yb = Math.min(H - 1, Math.ceil(ymax));
  let hit = false;
  for (let y = ya; y <= yb; y++) {
    const yc = y + 0.5, xsx = [];
    for (let i = 0, j = n - 1; i < n; j = i++) {
      if ((zs[i] > yc) !== (zs[j] > yc)) xsx.push(xs[i] + ((yc - zs[i]) * (xs[j] - xs[i])) / (zs[j] - zs[i]));
    }
    xsx.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xsx.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xsx[k] - 0.5)), xb = Math.min(W - 1, Math.floor(xsx[k + 1] - 0.5));
      for (let x = xa; x <= xb; x++) { fn(y * W + x); hit = true; }
    }
  }
  return hit;
}
function line(ax, az, bx, bz, r, v) {             // thick segment, square brush
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) * 2));
  const rr = Math.max(0, Math.round(r));
  for (let s = 0; s <= n; s++) {
    const x = Math.round(ax + ((bx - ax) * s) / n), z = Math.round(az + ((bz - az) * s) / n);
    for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
      const X = x + dx, Z = z + dz;
      if (X >= 0 && X < W && Z >= 0 && Z < H) { const o = Z * W + X; if (road[o] < v) road[o] = v; }
    }
  }
}

let nB = 0, nR = 0, t0 = Date.now();
const keys = Object.keys(man.tiles).filter((k) => { const [i, j] = k.split('_').map(Number); return (i + 1) * T > x0 && i * T < x1 && (j + 1) * T > z0 && j * T < z1; });
for (const [n, key] of keys.entries()) {
  const buf = fs.readFileSync(path.join(TILES, man.tiles[key].f));
  const tile = parseTile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const [ox, oz] = tile.header.origin;
  const g = tile.S.grass;
  if (g) for (let i = 0; i + 8 < g.length; i += 9) {
    fillPoly([px(g[i] + ox), px(g[i + 3] + ox), px(g[i + 6] + ox)], [pz(g[i + 2] + oz), pz(g[i + 5] + oz), pz(g[i + 8] + oz)], 3, (o) => { green[o] = 1; });
  }
  for (const r of roadsOf(tile)) {
    const v = r.width >= 18 || r.rclass === 2 || r.rclass === 3 ? 2 : 1;
    const rad = Math.max(0, (r.width / MPP - 1) / 2);
    for (let i = 0; i + 1 < r.len; i++) {
      const a = (r.start + i) * 3, b = a + 3;
      line(px(tile.S.roadVerts[a] + ox), pz(tile.S.roadVerts[a + 2] + oz), px(tile.S.roadVerts[b] + ox), pz(tile.S.roadVerts[b + 2] + oz), rad, v);
    }
    nR++;
  }
  for (const b of buildingsOf(tile)) {
    const xs = [], zs = [];
    for (let i = 0; i < b.len; i++) { xs.push(px(tile.S.bldgXZ[(b.start + i) * 2] + ox)); zs.push(pz(tile.S.bldgXZ[(b.start + i) * 2 + 1] + oz)); }
    const h = b.height;
    if (!fillPoly(xs, zs, b.len, (o) => { if (height[o] < h) height[o] = h; })) {
      const cx = Math.round(xs.reduce((s, v) => s + v, 0) / b.len), cz = Math.round(zs.reduce((s, v) => s + v, 0) / b.len);
      if (cx >= 0 && cx < W && cz >= 0 && cz < H && height[cz * W + cx] < h) height[cz * W + cx] = h;
    }
    nB++;
  }
  if (n % 400 === 0) console.log(`  ${n}/${keys.length} tiles, ${nB} buildings, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

// colour: water/void, lawns, streets, buildings by height (log ramp)
const ramp = [[0, [44, 72, 104]], [0.30, [48, 128, 150]], [0.55, [96, 190, 150]], [0.75, [226, 208, 104]], [0.9, [255, 170, 80]], [1, [255, 244, 214]]];
const rampAt = (t) => { for (let k = 1; k < ramp.length; k++) if (t <= ramp[k][0]) { const [ta, ca] = ramp[k - 1], [tb, cb] = ramp[k], w = (t - ta) / (tb - ta); return ca.map((c, i) => Math.round(c + (cb[i] - c) * w)); } return ramp[ramp.length - 1][1]; };
const HMAX = 400;
const png = new PNG({ width: W, height: H });
for (let o = 0; o < W * H; o++) {
  let c;
  const h = height[o];
  if (h > 0) c = rampAt(Math.min(1, Math.log1p(h) / Math.log1p(HMAX)));
  else if (road[o] === 2) c = [58, 70, 86];
  else if (road[o] === 1) c = [40, 49, 61];
  else if (green[o]) c = [22, 48, 34];
  else c = [9, 13, 19];
  png.data[o * 4] = c[0]; png.data[o * 4 + 1] = c[1]; png.data[o * 4 + 2] = c[2]; png.data[o * 4 + 3] = 255;
}
fs.writeFileSync(path.join(OUT, NAME + '.png'), PNG.sync.write(png, { colorType: 2 }));
fs.writeFileSync(path.join(OUT, NAME + '.json'), JSON.stringify({ x0, z0, x1, z1, mpp: MPP, width: W, height: H, buildings: nB, roads: nR,
  tiles: keys.length, macros: Object.keys(man.macros).length, tile: T, macro: man.macro, ramp: ramp.map(([t, c]) => [t, c]), hmax: HMAX,
  tileKeys: keys }, null, 0));
console.log(`${NAME}.png ${W}x${H} at ${MPP} m/px: ${nB} buildings, ${nR} road pieces, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
