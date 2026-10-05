// STATIONS2 (2026-10-04): the ground probe for street islands and kerb outlines. Owner, on t8LenoxDive: dark rectangular
// corners at the rounded noses of Lenox Avenue's medians, "the type of bug that's unacceptable". Cause there: the ground
// grid (4 m cells, drawn 0.12 m under the sections) was lowered round the new subway wells, and the slivers between the
// median noses and the asphalt, which no section covers, opened into pits. This probe rebuilds a tile's drawn ground the
// way world/assemble.js does (the compiled sections, the grid with TL26's lowering, ST38's walk fill and openings) on a
// 0.25 m raster and reports:
//   GAP      cells no section covers, within 1.5 m of both a roadway and a raised surface (an island, a walk): the grid
//            shows there (0.12-0.3 m under the road: a sunken corner); a cluster of 0.25 m2 or more, or one whose grid
//            lies more than 0.5 m under the road (a pit) or over it, fails; smaller slivers are listed as warnings
//            (2 m from a tile's edge are left out: the neighbouring tile's sections cover them). The compiled roadway runs
//            under the walks along every kerb by design, so a walk over the road is not tested.
//   WELL     an ST38 stair opening whose cells still carry a section or the grid (the well would be capped)
// Clusters (8-connected) of 0.05 m2 or more are listed with their centre (world x, z), area and depth.
//   node tools/qa/ground_gaps.mjs [--tiles 4_-6,3_-7 | --box x0,z0,x1,z1] [--nost38] [--nogf] [--bug38] [--simple] [--nogf38]
//                                 [--json out.json]
// (--nogf: ST38 without its island-corner fill; --nost38: the compiled ground alone)
// GF38 (GROUNDFIX, docs/notes/ar34-groundfix.md): the tile's ground is now built as world/assemble.js builds it: CP32's
// cpApply, AR32's areaApply (every part's apply: the plaza, the stair cuts, the street kit's fixes, ST38), ST38's corner
// paving, then GF38's planimetric fill (public/data/gf38/, when baked against this tile file), with the neighbouring tiles'
// sections where they reach over the edge. Not gaps, counted apart: a cell under a drawn building; water (the drawn grid
// under main.js's water plane at y 0, outside Central Park); ground not at grade (banks, embankments, cuts: the terrain
// sample more than 0.6 m under the roadway beside it; a grid lowered under a terrain at grade still fails as a pit).
// --simple: STATIONS2's probe (st38Apply and the corner paving only, the tile alone, none of the above); --noedge: the
// tile alone; --nogf38: without GF38's fill; --gf38dir <dir>: another bake.
// Default box: 125th Street (city/areas.js B125). Exit 1 when any failing cluster is found. Run from the repository root.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const B = path.join(root, 'boundlessjs');
const { parseTile, buildingsOf } = await import(path.join(B, 'src/world/tiledata.js'));
const ST = await import(path.join(B, 'src/city/stations/subEnt38.js'));
const SIMPLE = process.argv.includes('--simple') || process.argv.includes('--nost38');
const AR = SIMPLE ? null : await import(path.join(B, 'src/city/areas.js'));
const CPK = SIMPLE ? null : await import(path.join(B, 'src/city/centralPark.js'));
const GFM = await import(path.join(B, 'src/city/groundFix38.js'));
if (AR) await AR.areasReady;
const GFDIR = process.argv.includes('--gf38dir') ? process.argv[process.argv.indexOf('--gf38dir') + 1] : path.join(B, 'public/data/gf38');   // --gf38dir <dir>: another bake (a test)
const GFIDX = (() => { try { return JSON.parse(fs.readFileSync(path.join(GFDIR, 'index.json'), 'utf8')); } catch { return null; } })();
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const NOST38 = args.includes('--nost38');
// --bug38: the grid lowered round each well as the first ST38 version did (the cells touching the well's box dropped below
// its floor): the check must fail on it
const BUG38 = args.includes('--bug38');
const man = JSON.parse(fs.readFileSync(path.join(B, 'public/tiles/manifest.json'), 'utf8'));
let keys;
if (opt('tiles')) keys = opt('tiles').split(',');
else {
  const [x0, z0, x1, z1] = (opt('box', '600,-4400,3750,-1450')).split(',').map(Number);
  keys = [];
  for (let tx = Math.floor(x0 / 512); tx <= Math.floor(x1 / 512); tx++) for (let tz = Math.floor(z0 / 512); tz <= Math.floor(z1 / 512); tz++) if (man.tiles[`${tx}_${tz}`]) keys.push(`${tx}_${tz}`);
}
const RAISED = ['sidewalk', 'grass', 'grassU', 'path', 'brick', 'plaza', 'gravel', 'warn', 'warnIron'];
const ROAD = ['asphalt', 'gutter', 'busred', 'paintW', 'paintY', 'paintG'];
const R = 0.25, N = Math.round(512 / R);

function raster(tri, cb) {
  // cells whose centre lies in the triangle (tile-local x, z), with the plane's y there
  const [ax, ay, az, bx, by, bz, cx, cy, cz] = tri;
  const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(d) < 1e-9) return;
  const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) / R)), i1 = Math.min(N - 1, Math.floor(Math.max(ax, bx, cx) / R));
  const j0 = Math.max(0, Math.floor(Math.min(az, bz, cz) / R)), j1 = Math.min(N - 1, Math.floor(Math.max(az, bz, cz) / R));
  for (let j = j0; j <= j1; j++) {
    const z = (j + 0.5) * R;
    for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) * R;
      const w1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, w2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, w3 = 1 - w1 - w2;
      if (w1 < -1e-6 || w2 < -1e-6 || w3 < -1e-6) continue;
      cb(j * N + i, w1 * ay + w2 * by + w3 * cy);
    }
  }
}
function clusters(mask, val) {
  const seen = new Uint8Array(N * N), out = [];
  for (let k = 0; k < N * N; k++) {
    if (!mask[k] || seen[k]) continue;
    const st = [k]; seen[k] = 1; let n = 0, sx = 0, sz = 0, vmax = -Infinity;
    while (st.length) {
      const c = st.pop(); n++; const i = c % N, j = (c / N) | 0; sx += i; sz += j; if (val) vmax = Math.max(vmax, val[c]);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        const q = jj * N + ii; if (mask[q] && !seen[q]) { seen[q] = 1; st.push(q); }
      }
    }
    out.push({ n, area: n * R * R, ci: sx / n, cj: sz / n, vmax });
  }
  return out;
}

const report = { tiles: {}, failing: 0 };
// GF38: each tile's ground is prepared once; a tile is probed with its neighbours' sections where they reach over its edge (a
// compiled triangle belongs to one tile; --noedge: the tile alone, as STATIONS2's probe)
const NOEDGE = SIMPLE || args.includes('--noedge');
const prepared = new Map();
function prepare(key) {
  if (prepared.has(key)) return prepared.get(key);
  if (!man.tiles[key]) { prepared.set(key, null); return null; }
  const buf = fs.readFileSync(path.join(B, 'public/tiles', man.tiles[key].f));
  const tile = parseTile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const [ox, oz] = tile.header.origin;
  let gfNote = '';
  if (SIMPLE) { if (!NOST38) { ST.st38Apply(tile, ox, oz); if (!args.includes('--nogf')) ST.st38GapFill(tile); } }
  else {
    if (CPK.cpTileHit(ox, oz)) CPK.cpApply(tile, ox, oz);
    if (AR.areaTileHit(ox, oz)) AR.areaApply(tile, ox, oz);
    if (!args.includes('--nogf')) ST.st38GapFill(tile);
  }
  if (!args.includes('--nogf38') && !NOST38) {
    const e = GFIDX && GFIDX.tiles[key];
    if (e && e.bytes === buf.byteLength) { const b2 = fs.readFileSync(path.join(GFDIR, key + '.bin')); GFM.gf38Apply(tile, GFM.gf38Parse(b2.buffer.slice(b2.byteOffset, b2.byteOffset + b2.byteLength))); gfNote = ' (gf38)'; }
    else gfNote = e ? ' (gf38 baked against another tile file: not applied)' : ' (no gf38 bake)';
  }
  const P = { tile, buf, gfNote };
  prepared.set(key, P);
  return P;
}
for (const key of keys) {
  const { tile, buf, gfNote } = prepare(key);
  const [ox, oz] = tile.header.origin;
  const raised = new Float32Array(N * N).fill(-Infinity), road = new Float32Array(N * N).fill(Infinity), any = new Uint8Array(N * N);
  const [tx, tz] = key.split('_').map(Number), T9 = new Float32Array(9);
  for (const [dx, dz] of [[0, 0], [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
    if ((dx || dz) && NOEDGE) continue;
    const NB = dx || dz ? prepare(`${tx + dx}_${tz + dz}`) : { tile };
    if (!NB) continue;
    const sx = dx * 512, sz = dz * 512, S = NB.tile.S;
    const each = (a, cb) => { for (let i = 0; i + 8 < a.length; i += 9) {
      if (dx || dz) {
        const x0 = Math.min(a[i], a[i + 3], a[i + 6]) + sx, x1 = Math.max(a[i], a[i + 3], a[i + 6]) + sx, z0 = Math.min(a[i + 2], a[i + 5], a[i + 8]) + sz, z1 = Math.max(a[i + 2], a[i + 5], a[i + 8]) + sz;
        if (x1 < 0 || x0 > 512 || z1 < 0 || z0 > 512) continue;
        for (let q = 0; q < 9; q += 3) { T9[q] = a[i + q] + sx; T9[q + 1] = a[i + q + 1]; T9[q + 2] = a[i + q + 2] + sz; }
        raster(T9, cb);
      } else raster(a.subarray(i, i + 9), cb);
    } };
    for (const k of RAISED) { const a = S[k]; if (a) each(a, (c, y) => { any[c] = 1; if (y > raised[c]) raised[c] = y; }); }
    for (const k of ROAD) { const a = S[k]; if (a) each(a, (c, y) => { any[c] = 1; if (y < road[c]) road[c] = y; }); }
    { const a = S.curb; if (a) each(a, (c) => { any[c] = 1; }); }
  }
  // the drawn grid (assemble.js: 0.12 m under its samples, under every section triangle touching its cells, TL26)
  const res = tile.header.res, n = res + 1, cw = 512 / res, terr = tile.S.terrain, tD = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) tD[k] = terr[k] - 0.12;
  for (const name of [...RAISED, ...ROAD, 'curb']) {
    const src = tile.S[name]; if (!src) continue;
    for (let i = 0; i + 8 < src.length; i += 9) {
      const x0 = Math.min(src[i], src[i + 3], src[i + 6]), x1 = Math.max(src[i], src[i + 3], src[i + 6]);
      const z0 = Math.min(src[i + 2], src[i + 5], src[i + 8]), z1 = Math.max(src[i + 2], src[i + 5], src[i + 8]);
      const y = Math.min(src[i + 1], src[i + 4], src[i + 7]) - 0.12;
      for (let j = Math.max(0, Math.floor(z0 / cw)); j <= Math.min(res, Math.ceil(z1 / cw)); j++) for (let ii = Math.max(0, Math.floor(x0 / cw)); ii <= Math.min(res, Math.ceil(x1 / cw)); ii++) {
        const k = j * n + ii; if (y < tD[k]) tD[k] = Math.max(y, terr[k] - 1.62);
      }
    }
  }
  if (BUG38 && tile.st38Holes) for (const h of tile.st38Holes) {
    const L = 5.54, W = 2.45, zE = -L / 2 - (24 * 0.279 - (L - 0.35 - 0.25)) - 1.6 - 0.4, c = Math.cos(h.yaw), s = Math.sin(h.yaw);
    const pts = [[-W / 2, zE], [W / 2, zE], [-W / 2, L / 2], [W / 2, L / 2]].map(([lx, lz]) => [h.x + lx * c + lz * s - ox, h.z - lx * s + lz * c - oz]);
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
    for (let j = Math.max(0, Math.floor(Math.min(...zs) / cw)); j <= Math.min(res, Math.ceil(Math.max(...zs) / cw)); j++)
      for (let ii = Math.max(0, Math.floor(Math.min(...xs) / cw)); ii <= Math.min(res, Math.ceil(Math.max(...xs) / cw)); ii++) tD[j * n + ii] = Math.min(tD[j * n + ii], 3.52 - 24 * 0.178 - 1.0);
  }
  const grid = (x, z) => {   // the drawn grid's height at a tile-local point (the cell's two triangles, as assemble.js)
    const fi = Math.min(res - 1e-6, Math.max(0, x / cw)), fj = Math.min(res - 1e-6, Math.max(0, z / cw)), i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const y00 = tD[j * n + i], y10 = tD[j * n + i + 1], y01 = tD[(j + 1) * n + i], y11 = tD[(j + 1) * n + i + 1];
    return u >= v ? y00 + u * (y10 - y00) + v * (y11 - y10) : y00 + v * (y01 - y00) + u * (y11 - y01);
  };
  const terrS = (x, z) => {   // the terrain samples on the drawn grid's two triangles a cell, without TL26's lowering
    const fi = Math.min(res - 1e-6, Math.max(0, x / cw)), fj = Math.min(res - 1e-6, Math.max(0, z / cw)), i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const y00 = terr[j * n + i], y10 = terr[j * n + i + 1], y01 = terr[(j + 1) * n + i], y11 = terr[(j + 1) * n + i + 1];
    return u >= v ? y00 + u * (y10 - y00) + v * (y11 - y10) : y00 + v * (y01 - y00) + u * (y11 - y01);
  };
  let waterC = 0, slopeC = 0;
  // Central Park's rectangle, where world/materials.js masks the water plane (CP_PARK_IN)
  const inPark = (x, z) => Math.abs((x - 447.2) * 0.4848 + (z - 82.2) * -0.8746) < 2084 && Math.abs((x - 447.2) * 0.8746 + (z - 82.2) * 0.4848) < 451;
  // neighbourhoods: within 1.5 m of a road cell / a raised cell (box dilation)
  const near = (src) => { const D = Math.round(1.5 / R), out = new Uint8Array(N * N), row = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) { let last = -1e9; for (let i = 0; i < N; i++) { if (src(j * N + i)) last = i; if (i - last <= D) row[j * N + i] = 1; } last = 1e9; for (let i = N - 1; i >= 0; i--) { if (src(j * N + i)) last = i; if (last - i <= D) row[j * N + i] = 1; } }
    for (let i = 0; i < N; i++) { let last = -1e9; for (let j = 0; j < N; j++) { if (row[j * N + i]) last = j; if (j - last <= D) out[j * N + i] = 1; } last = 1e9; for (let j = N - 1; j >= 0; j--) { if (row[j * N + i]) last = j; if (last - j <= D) out[j * N + i] = 1; } }
    return out; };
  const nRoad = near((c) => road[c] < Infinity), nRaised = near((c) => raised[c] > -Infinity);
  // the road level beside a gap: the nearest road cell's y within 1.5 m (scanned on the raster)
  const roadNear = (c) => { const i = c % N, j = (c / N) | 0, D = 6; let best = Infinity, bd = 1e9;
    for (let dj = -D; dj <= D; dj++) for (let di = -D; di <= D; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue; const q = jj * N + ii, d = di * di + dj * dj; if (road[q] < Infinity && d < bd) { bd = d; best = road[q]; } }
    return best; };
  const gap = new Uint8Array(N * N), depth = new Float32Array(N * N), over = new Uint8Array(N * N), lift = new Float32Array(N * N);
  // ST38 openings: cells inside them are expected empty
  const inWell = new Uint8Array(N * N);
  if (!NOST38 && tile.st38Holes) for (const h of tile.st38Holes) {
    const c = Math.cos(h.yaw), s = Math.sin(h.yaw);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * R + ox - h.x, z = (j + 0.5) * R + oz - h.z, u = x * c - z * s, v = x * s + z * c;
      if (u > h.x0 && u < h.x1 && v > h.z0 && v < h.z1) inWell[j * N + i] = 1;
    }
  }
  // GF38: ground under a drawn building is no gap (the building stands on it): a cell whose centre lies in the footprint of a
  // compiled building the page draws (the area parts' and the park's skips left out, as assemble.js) is not tested
  const inBld = new Uint8Array(N * N);
  if (!SIMPLE && tile.S.bldgXZ) for (const b of buildingsOf(tile)) {
    const XZ = tile.S.bldgXZ, ring = [];
    for (let k = 0; k < b.len; k++) ring.push([XZ[(b.start + k) * 2], XZ[(b.start + k) * 2 + 1]]);
    if (ring.length < 3) continue;
    let cx = 0, cz = 0; for (const [x, z] of ring) { cx += x + ox; cz += z + oz; } cx /= ring.length; cz /= ring.length;
    if ((CPK.cpTileHit(ox, oz) && CPK.cpSkipBuilding(cx, cz, b.height, b.area)) || (AR.areaTileHit(ox, oz) && AR.areaSkipBuilding(cx, cz, b.height, b.area))) continue;
    const zs = ring.map((p) => p[1]), j0 = Math.max(0, Math.floor(Math.min(...zs) / R)), j1 = Math.min(N - 1, Math.floor(Math.max(...zs) / R));
    for (let j = j0; j <= j1; j++) {
      const z = (j + 0.5) * R, xs = [];
      for (let k = 0; k < ring.length; k++) { const [ax, az] = ring[k], [bx, bz] = ring[(k + 1) % ring.length]; if ((az <= z) !== (bz <= z)) xs.push(ax + ((z - az) / (bz - az)) * (bx - ax)); }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) for (let i = Math.max(0, Math.ceil(xs[q] / R - 0.5)); i <= Math.min(N - 1, Math.floor(xs[q + 1] / R - 0.5)); i++) inBld[j * N + i] = 1;
    }
  }
  let underBld = 0;
  let wellCapped = 0;
  for (let c = 0; c < N * N; c++) {
    if (inWell[c]) { if (any[c]) wellCapped++; continue; }
    { const ci = c % N, cj = (c / N) | 0; if (ci < 8 || cj < 8 || ci >= N - 8 || cj >= N - 8) continue; }   // 2 m from the tile's edge: the neighbour's sections
    if (!any[c] && nRoad[c] && nRaised[c] && inBld[c]) { underBld++; continue; }
    if (!any[c] && nRoad[c] && nRaised[c]) {
      const ry = roadNear(c); if (ry === Infinity) continue;
      const gy = grid((c % N + 0.5) * R, (((c / N) | 0) + 0.5) * R);
      // GF38: ground not at grade is terrain, not a missing surface: the river (the drawn grid under main.js's water plane at
      // y 0, outside Central Park, whose relief masks that plane) and banks, embankments and cuts whose terrain sample lies
      // more than 0.6 m under the roadway beside them. Counted apart; a grid lowered under a terrain at grade (a pit) still fails
      if (!SIMPLE) {
        const lx = (c % N + 0.5) * R, lz = (((c / N) | 0) + 0.5) * R, ts = terrS(lx, lz);
        if (gy < 0 && !inPark(lx + ox, lz + oz)) { waterC++; continue; }
        if (ts - 0.12 < ry - 0.6) { slopeC++; continue; }
      }
      gap[c] = 1; depth[c] = ry - gy;
    }
  }
  const W = (cl) => ({ x: +(ox + (cl.ci + 0.5) * R).toFixed(2), z: +(oz + (cl.cj + 0.5) * R).toFixed(2), area: +cl.area.toFixed(2) });
  const gaps = clusters(gap, depth).filter((c) => c.area >= 0.05).map((c) => ({ ...W(c), depth: +c.vmax.toFixed(2), fail: c.area >= 0.25 || c.vmax > 0.5 || c.vmax < -0.02 }));
  const overs = [];
  const fails = gaps.filter((g) => g.fail).length + overs.length + (wellCapped ? 1 : 0);
  report.tiles[key] = { underBuildingCells: underBld, waterCells: waterC, notAtGradeCells: slopeC, gaps: gaps.length, gapsFailing: gaps.filter((g) => g.fail).length, overhangs: overs.length, wellCappedCells: wellCapped, gapList: gaps, overhangList: overs };
  report.failing += fails;
  console.log(`${key}${gfNote}: gaps ${gaps.length} (failing ${gaps.filter((g) => g.fail).length}, deepest ${gaps.length ? Math.max(...gaps.map((g) => g.depth)).toFixed(2) : '-'} m), overhangs ${overs.length}, capped well cells ${wellCapped}${underBld ? `, ${underBld} cells under buildings left out` : ''}${waterC || slopeC ? `, water ${waterC} / not at grade ${slopeC} cells apart` : ''}`);
  for (const g of gaps.filter((g) => g.fail).slice(0, 8)) console.log(`   GAP x ${g.x} z ${g.z} ${g.area} m2 grid ${g.depth} m under the road`);
  for (const o of overs.slice(0, 8)) console.log(`   OVERHANG x ${o.x} z ${o.z} ${o.area} m2 ${o.lift} m over the road`);
}
if (opt('json')) fs.writeFileSync(opt('json'), JSON.stringify(report, null, 1));
console.log(`tiles ${keys.length}, failing clusters ${report.failing}`);
process.exit(report.failing ? 1 : 0);
