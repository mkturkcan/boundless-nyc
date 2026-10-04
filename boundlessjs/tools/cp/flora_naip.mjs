// CP32F: fetch USGS NAIP 4-band orthoimagery (public domain; The National Map's USGSNAIPImagery ImageServer, red, green,
// blue, near-infrared) over Central Park as a grid of GeoTIFFs in EPSG:4326, so a pixel maps to the world frame by
// shared/geo.js project() (linear in lon and lat). The imagery stays in the scratchpad; only what is measured from it
// (tree positions and crown sizes) goes into the repo. Large requests time out (504), so the grid is of small tiles,
// fetched three at a time; tiles already on disk are kept.
//
//   node tools/cp/flora_naip.mjs <outDir> [cols=5] [rows=7] [px=1200]
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/cp/flora_naip.mjs <outDir> [cols] [rows] [px]'); process.exit(2); }
const NC = +process.argv[3] || 5, NR = +process.argv[4] || 7, PX = +process.argv[5] || 1200;
const LON0 = -73.9825, LON1 = -73.9485, LAT0 = 40.7640, LAT1 = 40.8010;
const UA = 'boundless-nyc-research/0.1 (project contact: github.com/boundless-nyc)';
const SVC = 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage';
fs.mkdirSync(dir, { recursive: true });
// the park's corners (lon, lat): a tile wholly outside the park's quadrilateral (+80 m) is skipped
const PARK = [[-73.9731, 40.7644], [-73.9819, 40.7681], [-73.9582, 40.8006], [-73.9493, 40.7969]];
const inPark = (lo, la) => {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = PARK[i], [bx, by] = PARK[(i + 1) % 4];
    const cr = (bx - ax) * (la - ay) - (by - ay) * (lo - ax);
    s += cr > 0 ? 1 : -1;
  }
  return Math.abs(s) === 4;
};
const jobs = [], tiles = [];
// the server keeps pixels SQUARE IN THE OUTPUT SR (degrees here) and grows the extent to fit the requested size, so the
// size must have the bbox's aspect in degrees, not in metres (a metre-square request came back covering 32 % more
// latitude than asked, and the mosaic doubled features at the seams)
const W = PX, H = Math.round(PX * ((LAT1 - LAT0) / NR) / ((LON1 - LON0) / NC));
for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) {
  const lo0 = LON0 + (LON1 - LON0) * c / NC, lo1 = LON0 + (LON1 - LON0) * (c + 1) / NC;
  const la1 = LAT1 - (LAT1 - LAT0) * r / NR, la0 = LAT1 - (LAT1 - LAT0) * (r + 1) / NR;
  // keep the tile if any of a 5 x 5 grid of its points (padded ~80 m) is in the park
  let hit = false;
  for (let i = 0; i <= 4 && !hit; i++) for (let j = 0; j <= 4 && !hit; j++) {
    const lo = lo0 - 0.001 + (lo1 - lo0 + 0.002) * i / 4, la = la0 - 0.0007 + (la1 - la0 + 0.0014) * j / 4;
    if (inPark(lo, la)) hit = true;
  }
  if (!hit) continue;
  const f = path.join(dir, `naip_r${r}c${c}.tif`);
  tiles.push({ file: path.basename(f), lon0: lo0, lon1: lo1, lat0: la0, lat1: la1, w: W, h: H });
  if (fs.existsSync(f) && fs.statSync(f).size > W * H * 3) continue;
  const url = `${SVC}?bbox=${lo0},${la0},${lo1},${la1}&bboxSR=4326&imageSR=4326&size=${W},${H}&format=tiff&pixelType=U8`
    + `&interpolation=RSP_BilinearInterpolation&bandIds=0,1,2,3&f=image`;
  jobs.push({ f, url });
}
fs.writeFileSync(path.join(dir, 'naip_tiles.json'), JSON.stringify(tiles, null, 1));
console.log(`${tiles.length} tiles in the park, ${jobs.length} to fetch, ${W} x ${H} px each`);
async function one({ f, url }) {
  for (let a = 0; a < 5; a++) {
    try {
      const t0 = Date.now();
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      const buf = Buffer.from(await res.arrayBuffer());
      if (res.status === 200 && buf.length > W * H * 3) { fs.writeFileSync(f, buf); console.log(`${path.basename(f)}: ${(buf.length / 1e6).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s`); return; }
      console.log(`${path.basename(f)}: status ${res.status}, ${buf.length} bytes`);
    } catch (e) { console.log(`${path.basename(f)}: ${e.message}`); }
    await new Promise((r2) => setTimeout(r2, 4000));
  }
}
const Q = jobs.slice();
await Promise.all([0, 1, 2].map(async () => { while (Q.length) await one(Q.shift()); }));
console.log('done');
