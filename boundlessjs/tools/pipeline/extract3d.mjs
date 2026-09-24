// NYC 3D Building Model (DoITT 2014 CityGML) → landmark massing meshes.
// 1) find BINs for target landmarks from the footprints cache
// 2) find the Delivery Area containing Columbia from DeliveryArea.shp
// 3) (after the DA gml is extracted) stream-scan it for those BINs, convert
//    EPSG:2263 ftUS → lon/lat → world, write public/data/landmark_meshes.json
// Usage: node tools/pipeline/extract3d.mjs [--scan data/raw/3dmodel/DAxx.gml]
import fs from 'node:fs';
import readline from 'node:readline';
import { project } from '../../src/shared/geo.js';
import { LANDMARKS } from '../../src/shared/landmarkSpec.js';

// ---- EPSG:2263 (NAD83 / New York Long Island ftUS) Lambert Conformal Conic 2SP
const D2R = Math.PI / 180;
const a = 6378137.0, f = 1 / 298.257222101, e2 = 2 * f - f * f, e = Math.sqrt(e2);
const phi1 = 41.03333333333333 * D2R, phi2 = 40.66666666666666 * D2R;
const phi0 = 40.16666666666666 * D2R, lam0 = -74.0 * D2R;
const FE = 300000.0, FN = 0.0; // meters (grid is defined in meters, coords served in ftUS)
const FT = 0.30480060960121924; // US survey foot
const mFn = (p) => Math.cos(p) / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
const tFn = (p) => Math.tan(Math.PI / 4 - p / 2) / Math.pow((1 - e * Math.sin(p)) / (1 + e * Math.sin(p)), e / 2);
const m1 = mFn(phi1), m2 = mFn(phi2), t1 = tFn(phi1), t2 = tFn(phi2), t0 = tFn(phi0);
const nL = (Math.log(m1) - Math.log(m2)) / (Math.log(t1) - Math.log(t2));
const F = m1 / (nL * Math.pow(t1, nL));
const rho0 = a * F * Math.pow(t0, nL);
export function sp2263ToLonLat(xFt, yFt) {
  const x = xFt * FT - FE, y = yFt * FT - FN;
  const rho = Math.sign(nL) * Math.hypot(x, rho0 - y);
  const t = Math.pow(rho / (a * F), 1 / nL);
  const theta = Math.atan2(x, rho0 - y);
  let phi = Math.PI / 2 - 2 * Math.atan(t);
  for (let i = 0; i < 6; i++) phi = Math.PI / 2 - 2 * Math.atan(t * Math.pow((1 - e * Math.sin(phi)) / (1 + e * Math.sin(phi)), e / 2));
  return [(theta / nL + lam0) / D2R, phi / D2R];
}
function lonLatToSp2263(lon, lat) { // forward (for DA lookup)
  const p = lat * D2R, l = lon * D2R;
  const t = tFn(p), rho = a * F * Math.pow(t, nL), th = nL * (l - lam0);
  return [(FE + rho * Math.sin(th)) / FT, (FN + rho0 - rho * Math.cos(th)) / FT];
}

// ---- targets: campus landmarks -> BIN via footprints nearest-centroid
const TARGETS = ['lowLibrary', 'butlerLibrary', 'stPaulsChapel'];
function findBins() {
  const raw = JSON.parse(fs.readFileSync('data/raw/buildings_1.geojson', 'utf8'));
  const specs = LANDMARKS.filter((l) => TARGETS.includes(l.key));
  const found = {};
  for (const feat of raw.features) {
    const g = feat.geometry;
    if (!g) continue;
    const ring = g.type === 'MultiPolygon' ? g.coordinates[0][0] : g.coordinates[0];
    let cx = 0, cy = 0;
    for (const [lo, la] of ring) { cx += lo; cy += la; }
    cx /= ring.length; cy /= ring.length;
    for (const s of specs) {
      const d = Math.hypot((cx - s.lon) * 85000, (cy - s.lat) * 111000);
      if (d < 45 && (!found[s.key] || d < found[s.key].d)) found[s.key] = { bin: String(feat.properties.bin), d: +d.toFixed(1) };
    }
  }
  return found;
}

// ---- DeliveryArea.shp: polygons + DBF area names
function daFor(lon, lat) {
  const [qx, qy] = lonLatToSp2263(lon, lat);
  const shp = fs.readFileSync('data/raw/3dmodel/DeliveryArea.shp');
  const dbf = fs.readFileSync('data/raw/3dmodel/DeliveryArea.dbf');
  // DBF: header 32 + fields*32 +1; records fixed length
  const nRec = dbf.readInt32LE(4), hdrLen = dbf.readInt16LE(8), recLen = dbf.readInt16LE(10);
  const fields = [];
  for (let o = 32; dbf[o] !== 0x0d; o += 32) {
    fields.push({ name: dbf.toString('ascii', o, o + 11).replace(/\0.*$/, ''), len: dbf[o + 16] });
  }
  const recs = [];
  for (let i = 0; i < nRec; i++) {
    let o = hdrLen + i * recLen + 1;
    const rec = {};
    for (const fd of fields) { rec[fd.name] = dbf.toString('ascii', o, o + fd.len).trim(); o += fd.len; }
    recs.push(rec);
  }
  // SHP: header 100 bytes, then records: [idx(4) len(4)] shapeType(4)... polygon type 5
  let off = 100, shapeI = 0;
  while (off < shp.length) {
    const contentLen = shp.readInt32BE(off + 4) * 2;
    const sType = shp.readInt32LE(off + 8);
    if (sType === 5) {
      const numParts = shp.readInt32LE(off + 44), numPts = shp.readInt32LE(off + 48);
      const partsOff = off + 52, ptsOff = partsOff + numParts * 4;
      const parts = [];
      for (let p = 0; p < numParts; p++) parts.push(shp.readInt32LE(partsOff + p * 4));
      parts.push(numPts);
      for (let p = 0; p < numParts; p++) {
        let inside = false;
        for (let i2 = parts[p], j = parts[p + 1] - 1; i2 < parts[p + 1]; j = i2++) {
          const xi = shp.readDoubleLE(ptsOff + i2 * 16), yi = shp.readDoubleLE(ptsOff + i2 * 16 + 8);
          const xj = shp.readDoubleLE(ptsOff + j * 16), yj = shp.readDoubleLE(ptsOff + j * 16 + 8);
          if ((yi > qy) !== (yj > qy) && qx < ((xj - xi) * (qy - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) return { rec: recs[shapeI], shapeI, qx: qx.toFixed(0), qy: qy.toFixed(0) };
      }
    }
    off += 8 + contentLen;
    shapeI++;
  }
  return { rec: null, qx: qx.toFixed(0), qy: qy.toFixed(0) };
}

const scanArg = process.argv.indexOf('--scan');
if (scanArg < 0) {
  console.log('BINs:', JSON.stringify(findBins()));
  console.log('DA at Columbia:', JSON.stringify(daFor(-73.9619, 40.808)));
  process.exit(0);
}

// ---- stream-scan a DA gml for target BIN buildings, emit meshes
const gmlPath = process.argv[scanArg + 1];
const bins = findBins();
const wanted = new Map(Object.entries(bins).map(([k, v]) => [v.bin, k]));
console.log('scanning', gmlPath, 'for', [...wanted.entries()].map(([b, k]) => `${k}=${b}`).join(', '));
const rl = readline.createInterface({ input: fs.createReadStream(gmlPath, { encoding: 'utf8' }) });
let cur = null, curKey = null, buf = [];
const out = {};
rl.on('line', (line) => {
  if (cur === null) {
    if (line.includes('<bldg:Building ')) { cur = [line]; }
  } else {
    cur.push(line);
    if (line.includes('</bldg:Building>')) {
      const block = cur.join('\n');
      const bm = block.match(/BIN[\s\S]{0,80}?<gen:value>(\d+)<\/gen:value>/);
      const bin = bm ? bm[1] : null;
      if (bin && wanted.has(bin)) {
        const key = wanted.get(bin);
        const tris = [];
        for (const pm of block.matchAll(/<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/g)) {
          const nums = pm[1].trim().split(/\s+/).map(Number);
          // polygon ring x y z ... — fan-triangulate (surfaces are planar)
          const pts = [];
          for (let i = 0; i < nums.length - 2; i += 3) {
            const [lon, lat] = sp2263ToLonLat(nums[i], nums[i + 1]);
            const [wx, wz] = project(lon, lat);
            pts.push([+wx.toFixed(2), +(nums[i + 2] * FT).toFixed(2), +wz.toFixed(2)]);
          }
          for (let i = 1; i < pts.length - 2; i++) tris.push(pts[0], pts[i], pts[i + 1]);
        }
        out[key] = { bin, tris };
        console.log('captured', key, 'bin', bin, 'tris', tris.length / 3);
        if (Object.keys(out).length === wanted.size) rl.close();
      }
      cur = null;
    }
  }
});
rl.on('close', () => {
  fs.mkdirSync('public/data', { recursive: true });
  fs.writeFileSync('public/data/landmark_meshes.json', JSON.stringify(out));
  console.log('wrote public/data/landmark_meshes.json', Object.keys(out).join(','));
  process.exit(0);
});
