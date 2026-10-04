// CP32F: fetch the OpenStreetMap features the park's flora part needs (trees, tree rows, benches, lamps, waste baskets,
// the path network, playgrounds, pitches, buildings, the park polygon) for Central Park's bbox from Overpass into the
// scratchpad. Raw data only: it stays in the scratchpad, and what is baked from it (city/cpFloraData.js) carries the ODbL
// note.
//
//   node tools/cp/flora_osm.mjs <out.json>
//
// A bbox query (area queries time out), a generic User-Agent, servers rotated on 429/504.
import fs from 'node:fs';

const out = process.argv[2];
if (!out) { console.error('usage: node tools/cp/flora_osm.mjs <out.json>'); process.exit(2); }
const BB = '40.7630,-73.9830,40.8015,-73.9480';   // south, west, north, east (the park with ~100 m of margin)
const Q = `[out:json][timeout:170][bbox:${BB}];
(
  node["natural"="tree"];
  way["natural"="tree_row"];
  node["amenity"="bench"];
  way["amenity"="bench"];
  node["leisure"="picnic_table"];
  node["highway"="street_lamp"];
  node["amenity"="waste_basket"];
  node["amenity"="drinking_water"];
  way["highway"];
  way["area:highway"];
  way["leisure"="playground"];
  way["leisure"="pitch"];
  way["leisure"="park"];
  relation["leisure"="park"];
  way["building"];
  way["man_made"="bridge"];
  way["leisure"="garden"];
  way["natural"="water"];
  relation["natural"="water"];
  way["natural"="wood"];
  relation["natural"="wood"];
  way["landuse"="grass"];
  way["natural"="bare_rock"];
  way["landuse"="flowerbed"];
  way["amenity"="parking"];
  way["leisure"="track"];
  way["place"="square"];
);
out geom;`;
const HOSTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const H = { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'boundless-nyc-research/0.1 (project contact: github.com/boundless-nyc)', Accept: 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let attempt = 0; attempt < 6; attempt++) {
  const host = HOSTS[attempt % HOSTS.length], t0 = Date.now();
  try {
    const r = await fetch(host, { method: 'POST', headers: H, body: 'data=' + encodeURIComponent(Q) });
    const txt = await r.text();
    if (r.status === 200 && txt.length > 1000 && !/"remark": "runtime error/.test(txt)) {
      fs.writeFileSync(out, txt);
      const j = JSON.parse(txt);
      console.log(`${host.split('/')[2]}: ${j.elements.length} elements, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      process.exit(0);
    }
    console.log(`${host.split('/')[2]}: status ${r.status} ${txt.slice(0, 200).replace(/\s+/g, ' ')}`);
  } catch (e) { console.log(`${host.split('/')[2]}: ${e.message}`); }
  await sleep(8000);
}
process.exit(1);
