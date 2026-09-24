// Fetch OSM building footprints for one borough from Overpass into data/raw/osm_buildings_<boro>.json
// (the compiler's gap-fill input: buildings the DOITT footprint file lacks, e.g. 100 W 125th St).
//
//   node tools/osm_fetch.mjs <boro 1-5> [bands=8]
//
// The borough bbox is split into latitude bands so each request stays small; servers are rotated
// on 429/504 and every band is retried. Overpass requires a User-Agent (429 without one).
// Output is `out geom tags` (inline coordinates, no node lookup). Raw data only — never shipped.
import fs from 'node:fs';

const BBOX = { // south, west, north, east
  1: [40.699, -74.025, 40.882, -73.906],   // Manhattan
  2: [40.785, -73.934, 40.918, -73.748],   // Bronx
  3: [40.566, -74.045, 40.740, -73.833],   // Brooklyn
  4: [40.541, -73.963, 40.801, -73.700],   // Queens
  5: [40.496, -74.256, 40.651, -74.049],   // Staten Island
};
const boro = parseInt(process.argv[2]);
const N = parseInt(process.argv[3]) || 8;
if (!BBOX[boro]) { console.error('usage: node tools/osm_fetch.mjs <boro 1-5> [bands]'); process.exit(2); }
const [lat0, lon0, lat1, lon1] = BBOX[boro];
const HOSTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const H = { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'boundlessjs-nyc-digital-twin/0.1 (research build)', Accept: 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const all = [];
let hi = 0, failed = 0;
for (let i = 0; i < N; i++) {
  const a = lat0 + (lat1 - lat0) * i / N, b = lat0 + (lat1 - lat0) * (i + 1) / N;
  const q = `[out:json][timeout:300][maxsize:536870912];(way["building"](${a.toFixed(5)},${lon0},${b.toFixed(5)},${lon1});relation["building"]["type"="multipolygon"](${a.toFixed(5)},${lon0},${b.toFixed(5)},${lon1}););out geom tags;`;
  let ok = false;
  for (let attempt = 0; attempt < 6 && !ok; attempt++) {
    const host = HOSTS[hi % HOSTS.length], t0 = Date.now();
    try {
      const r = await fetch(host, { method: 'POST', headers: H, body: 'data=' + encodeURIComponent(q) });
      const txt = await r.text();
      if (r.status === 200 && txt.length > 1000) {
        const j = JSON.parse(txt); all.push(...j.elements); ok = true;
        console.log(`band ${i} ${host.split('/')[2]} elements ${j.elements.length} secs ${((Date.now() - t0) / 1000).toFixed(0)}`);
      } else { console.log(`band ${i} ${host.split('/')[2]} status ${r.status}`); hi++; await sleep(15000); }
    } catch (e) { console.log(`band ${i} ${host.split('/')[2]} failed ${e.message}`); hi++; await sleep(15000); }
  }
  if (!ok) failed++;
  await sleep(3000);
}
const out = `data/raw/osm_buildings_${boro}.json`;
fs.writeFileSync(out, JSON.stringify({ elements: all }));
console.log(`wrote ${out}: ${all.length} elements (${all.filter((e) => e.type === 'way').length} ways, ${all.filter((e) => e.type === 'relation').length} relations), bands failed: ${failed}`);
process.exit(failed ? 1 : 0);
