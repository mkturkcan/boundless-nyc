// Park elevation samples: the terrain grid is IDW over BUILDING base elevations,
// so parks (no buildings) had no data at all — Morningside/Riverside rendered as
// extrapolated walls and terraces. This samples a grid over every park polygon
// (plus a 40 m margin) from the USGS 3DEP point service (1 m / 10 m DEM) and
// caches [x, z, y] world-metre samples in data/raw/park_elev_<boro>.json, which
// compile.mjs merges into terrSamples.
//   node tools/pipeline/fetch_elev.mjs --boro 1 [--step 14] [--conc 6] [--provider usgs|open]
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const BOROS = String(opt('boro', '1')).split(',').map(Number);
const STEP = Number(opt('step', '14'));
const CONC = Number(opt('conc', '6'));
const PROVIDER = opt('provider', 'usgs');
const RAW = path.resolve('data/raw');
const LAT0 = 40.7831, LON0 = -73.9712, M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
const project = (lon, lat) => [(lon - LON0) * M_LON, -(lat - LAT0) * M_LAT];
const unproject = (x, z) => [x / M_LON + LON0, -z / M_LAT + LAT0];
const inRing = (ring, x, z) => { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside; } return inside; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function elevUSGS(lon, lat) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(`https://epqs.nationalmap.gov/v1/json?x=${lon}&y=${lat}&units=Meters&wkid=4326&includeDate=false`, { signal: AbortSignal.timeout(20000) });
      if (r.ok) { const j = await r.json(); const v = Number(j.value); if (Number.isFinite(v) && v > -100) return v; return null; }
    } catch {}
    await sleep(400 * (attempt + 1));
  }
  return null;
}
// AWS Terrain Tiles (Mapzen "terrarium" PNGs, USGS NED 1/3-arc-second and finer in
// NYC): z=15 tiles decoded locally, height = R*256 + G + B/256 - 32768, bilinear.
const TZ = 15;
const tileCache = new Map();
async function terrTile(tx, ty) {
  const k = tx + '_' + ty;
  if (tileCache.has(k)) return tileCache.get(k);
  let png = null;
  for (let a = 0; a < 3 && !png; a++) {
    try {
      const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${TZ}/${tx}/${ty}.png`, { signal: AbortSignal.timeout(30000) });
      if (r.ok) png = PNG.sync.read(Buffer.from(await r.arrayBuffer()));
    } catch {}
  }
  tileCache.set(k, png);
  return png;
}
async function elevTerrarium(lon, lat) {
  const n = 2 ** TZ;
  const fx = ((lon + 180) / 360) * n;
  const latR = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const png = await terrTile(tx, ty);
  if (!png) return null;
  const px = (fx - tx) * png.width - 0.5, py = (fy - ty) * png.height - 0.5;
  const sample = (ix, iy) => {
    ix = Math.max(0, Math.min(png.width - 1, ix)); iy = Math.max(0, Math.min(png.height - 1, iy));
    const o = (iy * png.width + ix) * 4;
    return png.data[o] * 256 + png.data[o + 1] + png.data[o + 2] / 256 - 32768;
  };
  const x0 = Math.floor(px), y0 = Math.floor(py), u = px - x0, v = py - y0;
  return (sample(x0, y0) * (1 - u) + sample(x0 + 1, y0) * u) * (1 - v) + (sample(x0, y0 + 1) * (1 - u) + sample(x0 + 1, y0 + 1) * u) * v;
}
async function elevOpenBatch(pts) { // open-elevation.com (SRTM 30 m) — coarse fallback
  const r = await fetch('https://api.open-elevation.com/api/v1/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locations: pts.map(([lon, lat]) => ({ latitude: lat, longitude: lon })) }), signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error('open-elevation ' + r.status);
  const j = await r.json();
  return j.results.map((q) => q.elevation);
}
for (const b of BOROS) {
  const f = path.join(RAW, `parks_${b}.geojson`);
  if (!fs.existsSync(f)) { console.log('no', f); continue; }
  const out = path.join(RAW, `park_elev_${b}.json`);
  const have = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : [];
  const seen = new Set(have.map((s) => `${Math.round(s[0])}_${Math.round(s[2])}`));
  const fc = JSON.parse(fs.readFileSync(f, 'utf8'));
  const todo = [];
  for (const feat of fc.features) {
    const g = feat.geometry; if (!g) continue;
    const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
    for (const poly of polys) {
      const ring = poly[0].map(([lon, lat]) => project(lon, lat));
      let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
      for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      if ((x1 - x0) * (z1 - z0) < 1500) continue; // pocket parks: buildings around them carry the grade
      const M = 40;
      for (let z = Math.floor((z0 - M) / STEP) * STEP; z <= z1 + M; z += STEP) for (let x = Math.floor((x0 - M) / STEP) * STEP; x <= x1 + M; x += STEP) {
        // inside the park or within the margin band around it
        let near = inRing(ring, x, z);
        if (!near) for (const [rx, rz] of ring) { if (Math.abs(rx - x) < M && Math.abs(rz - z) < M) { near = true; break; } }
        if (!near) continue;
        const k = `${Math.round(x)}_${Math.round(z)}`;
        if (seen.has(k)) continue;
        seen.add(k); todo.push([x, z]);
      }
    }
  }
  console.log(`boro ${b}: ${have.length} cached, ${todo.length} points to fetch (${PROVIDER})`);
  let done = 0, fails = 0;
  const save = () => fs.writeFileSync(out, JSON.stringify(have));
  if (PROVIDER === 'open') {
    for (let i = 0; i < todo.length; i += 400) {
      const chunk = todo.slice(i, i + 400);
      try { const ys = await elevOpenBatch(chunk.map(([x, z]) => unproject(x, z))); chunk.forEach(([x, z], k) => { if (Number.isFinite(ys[k])) have.push([+x.toFixed(1), +z.toFixed(1), +ys[k].toFixed(2)]); }); }
      catch (e) { fails += chunk.length; console.log('batch failed', e.message); await sleep(3000); }
      done += chunk.length; if (done % 2000 < 400) { save(); console.log(`  ${done}/${todo.length}`); }
    }
  } else if (PROVIDER === 'terrarium') {
    for (const [x, z] of todo) {
      const [lon, lat] = unproject(x, z);
      const y = await elevTerrarium(lon, lat);
      if (y === null) fails++; else have.push([+x.toFixed(1), +z.toFixed(1), +y.toFixed(2)]);
      if (++done % 5000 === 0) { save(); console.log(`  ${done}/${todo.length} tiles cached ${tileCache.size}`); }
    }
  } else {
    let idx = 0;
    await Promise.all(Array.from({ length: CONC }, async () => {
      while (idx < todo.length) {
        const i = idx++; const [x, z] = todo[i]; const [lon, lat] = unproject(x, z);
        const y = await elevUSGS(lon, lat);
        if (y === null) fails++; else have.push([+x.toFixed(1), +z.toFixed(1), +y.toFixed(2)]);
        if (++done % 250 === 0) { save(); console.log(`  ${done}/${todo.length} (fails ${fails})`); }
      }
    }));
  }
  save();
  console.log(`boro ${b}: saved ${have.length} samples, ${fails} failures -> ${out}`);
}
