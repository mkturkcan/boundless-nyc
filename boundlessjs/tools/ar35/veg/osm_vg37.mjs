// VG37 (GROUND): fetch OpenStreetMap's hedges, planted beds, shrubberies, scrub and gardens for the areas GROUND judges
// (Central Park, Bryant Park, Columbia's campus, Gantry Plaza, 125th Street) from Overpass. Raw data stays in the scratch folder;
// what is baked from it (world/vgShrubData.js) carries the ODbL note.
//   node boundlessjs/tools/ar35/veg/osm_vg37.mjs <out.json>
import fs from 'node:fs';
const out = process.argv[2];
if (!out) { console.error('usage: node osm_vg37.mjs <out.json>'); process.exit(2); }
const UA = 'valdrada-research/0.1 (project contact: github.com/mkturkcan/valdrada)';
// south, west, north, east
const BOXES = {
  centralPark: '40.7630,-73.9830,40.8015,-73.9480',
  bryantPark: '40.7525,-73.9860,40.7550,-73.9815',
  columbia: '40.8045,-73.9650,40.8105,-73.9575',
  harlem125: '40.8030,-73.9600,40.8130,-73.9300',
  gantry: '40.7420,-73.9620,40.7500,-73.9560',
};
const sel = (bb) => `
  way["barrier"="hedge"](${bb});
  way["landuse"="flowerbed"](${bb});
  way["natural"="shrubbery"](${bb});
  way["natural"="scrub"](${bb});
  relation["natural"="scrub"](${bb});
  way["leisure"="garden"](${bb});
  node["natural"="shrub"](${bb});
  way["landuse"="grass"](${bb});
  way["barrier"="fence"](${bb});
`;
const Q = `[out:json][timeout:170];
(
${Object.values(BOXES).map(sel).join('')}
);
out tags geom;`;
const servers = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
for (let k = 0; k < 6; k++) {
  const url = servers[k % servers.length];
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(Q) });
    if (!r.ok) { console.warn(url, r.status); await new Promise((s) => setTimeout(s, 4000)); continue; }
    const txt = await r.text();
    fs.writeFileSync(out, txt);
    const j = JSON.parse(txt), n = {};
    for (const e of j.elements) { const t = e.tags || {}; const key = t.barrier || t.landuse || t.natural || t.leisure || '?'; n[key] = (n[key] || 0) + 1; }
    console.log('ok', url, j.elements.length, n);
    process.exit(0);
  } catch (e) { console.warn(url, e.message); }
}
process.exit(1);
