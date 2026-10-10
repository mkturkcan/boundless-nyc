// NYC Open Data fetcher with disk cache and pagination.
// Usage: node tools/pipeline/fetch.mjs --boro 1        (1=MN 2=BX 3=BK 4=QN)
//        node tools/pipeline/fetch.mjs --boro 1,2,3,4
import fs from 'node:fs';
import path from 'node:path';

const RAW = path.resolve('data/raw');
fs.mkdirSync(RAW, { recursive: true });

const BOROS = {
  1: { pluto: 'MN', name: 'Manhattan', parks: 'M', cscl: '1', trees: 'Manhattan' },
  2: { pluto: 'BX', name: 'Bronx', parks: 'X', cscl: '2', trees: 'Bronx' },
  3: { pluto: 'BK', name: 'Brooklyn', parks: 'B', cscl: '3', trees: 'Brooklyn' },
  4: { pluto: 'QN', name: 'Queens', parks: 'Q', cscl: '4', trees: 'Queens' },
};
// Generous per-borough bboxes (lat1,lon1,lat2,lon2) for datasets without a borough column.
const BBOX = {
  1: [40.678, -74.05, 40.888, -73.9], // Manhattan (incl. Marble Hill fringe)
  2: [40.783, -73.94, 40.92, -73.746],
  3: [40.55, -74.045, 40.741, -73.83],
  4: [40.535, -73.97, 40.812, -73.695],
};

async function fetchJSON(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'X-App-Token': '' } });
      if (r.status === 429 || r.status >= 500) throw new Error('HTTP ' + r.status);
      if (!r.ok) throw new Error('HTTP ' + r.status + ' fatal');
      return await r.text();
    } catch (e) {
      if (String(e).includes('fatal') || i === tries - 1) throw e;
      const wait = 2000 * (i + 1);
      console.log(`  retry in ${wait}ms: ${e.message ?? e}`);
      await new Promise((s) => setTimeout(s, wait));
    }
  }
}

// Paginated GeoJSON fetch -> single FeatureCollection on disk.
async function geoPaged(outFile, base, where, pageSize = 40000) {
  const out = path.join(RAW, outFile);
  if (fs.existsSync(out)) { console.log(`cache hit ${outFile}`); return; }
  const feats = [];
  for (let offset = 0; ; offset += pageSize) {
    const url = `${base}?$limit=${pageSize}&$offset=${offset}${where ? `&$where=${encodeURIComponent(where)}` : ''}&$order=:id`;
    process.stdout.write(`  ${outFile} offset ${offset} ... `);
    const txt = await fetchJSON(url);
    const fc = JSON.parse(txt);
    const n = fc.features?.length ?? 0;
    console.log(`${n} rows`);
    feats.push(...(fc.features ?? []));
    if (n < pageSize) break;
  }
  fs.writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', features: feats }));
  console.log(`wrote ${outFile}: ${feats.length} features`);
}

async function csvPaged(outFile, base, params, pageSize = 50000) {
  const out = path.join(RAW, outFile);
  if (fs.existsSync(out)) { console.log(`cache hit ${outFile}`); return; }
  let all = '';
  for (let offset = 0; ; offset += pageSize) {
    const url = `${base}?$limit=${pageSize}&$offset=${offset}&${params}&$order=:id`;
    process.stdout.write(`  ${outFile} offset ${offset} ... `);
    const txt = await fetchJSON(url);
    const lines = txt.trim().split('\n');
    const n = lines.length - 1;
    console.log(`${n} rows`);
    if (offset === 0) all = txt.trim();
    else all += '\n' + lines.slice(1).join('\n');
    if (n < pageSize) break;
  }
  fs.writeFileSync(out, all);
  console.log(`wrote ${outFile}`);
}

const NYC = (id) => `https://data.cityofnewyork.us/resource/${id}.geojson`;
const NYCCSV = (id) => `https://data.cityofnewyork.us/resource/${id}.csv`;

async function fetchBoro(b) {
  const B = BOROS[b];
  const [la1, lo1, la2, lo2] = BBOX[b];
  console.log(`\n### Fetching borough ${b} (${B.name})`);

  // Building footprints (bbox filter; deduped at compile time by bin)
  await geoPaged(`buildings_${b}.geojson`, NYC('5zhs-2jue'),
    `within_box(the_geom,${la1},${lo1},${la2},${lo2})`, 30000);

  // PLUTO attributes
  await csvPaged(`pluto_${b}.csv`, NYCCSV('64uk-42ks'),
    `$select=${encodeURIComponent('bbl,numfloors,yearbuilt,bldgclass,landuse,lotarea,bldgarea,unitsres,unitstotal,numbldgs,bldgfront,builtfar,histdist,landmark,zonedist1,address,ownername')}` +
    `&$where=${encodeURIComponent(`borough='${B.pluto}'`)}`);

  // Street centerlines — bbox fetch so bridge spans/approaches and
  // cross-river waterfront streets are included (deduped by physicalid at compile).
  await geoPaged(`streets_${b}.geojson`, NYC('inkn-q76z'),
    `within_box(the_geom,${la1},${lo1},${la2},${lo2})`, 30000);

  // Street trees (2015 census, live only)
  await csvPaged(`trees_${b}.csv`, NYCCSV('uvpi-gqnh'),
    `$select=${encodeURIComponent('spc_common,tree_dbh,status,latitude,longitude')}` +
    `&$where=${encodeURIComponent(`boroname='${B.trees}' AND status='Alive'`)}`);

  // Parks polygons
  await geoPaged(`parks_${b}.geojson`, NYC('enfh-gkve'),
    `borough='${B.parks}'`, 5000);
}

async function fetchShared() {
  console.log('\n### Fetching shared/citywide datasets');
  await geoPaged('hydrants.geojson', NYC('5bgh-vtsn'), null, 40000);
  await geoPaged('boundaries.geojson', NYC('gthc-hcne'), null, 100);
  await geoPaged('shelters.geojson', NYC('t4f2-8md7'), null, 10000);
  await geoPaged('linknyc.geojson', NYC('s4kf-3yrf'), null, 10000);
  // DOT Bicycle Parking (CityRacks program, ~47k rack points)
  await geoPaged('bikeracks.geojson', NYC('592z-n7dk'), null, 40000);
  // DOB FISP facade filings: REAL exterior wall material/type per BIN (all bldgs >6 stories)
  await csvPaged('fisp.csv', NYCCSV('xubg-57si'),
    `$select=${encodeURIComponent('bin,exterior_wall_material_s_,exterior_wall_type_s_,filing_date')}` +
    `&$where=${encodeURIComponent("exterior_wall_material_s_ IS NOT NULL")}`);
  // OSM building:colour tags (literal facade colours, ~2.2k buildings in the bbox)
  {
    const out = path.join(RAW, 'osm_colours.json');
    if (!fs.existsSync(out)) {
      const q = '[out:json][timeout:120];way["building"]["building:colour"](40.55,-74.06,40.92,-73.70);out tags center;';
      const r = await fetch('https://overpass.kumi.systems/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'tether-nyc-pipeline/1.0' },
        body: 'data=' + encodeURIComponent(q),
      });
      const j = await r.json();
      const rows = (j.elements || []).map((e) => ({
        lat: e.center?.lat, lon: e.center?.lon,
        colour: e.tags?.['building:colour'], material: e.tags?.['building:material'] || null,
      })).filter((e) => e.lat && e.colour);
      fs.writeFileSync(out, JSON.stringify(rows));
      console.log('wrote osm_colours.json:', rows.length);
    } else console.log('cache hit osm_colours.json');
  }
  // MTA subway entrances (state portal, plain JSON w/ lat/lon columns)
  const out = path.join(RAW, 'subway.csv');
  if (!fs.existsSync(out)) {
    await csvPaged('subway.csv', 'https://data.ny.gov/resource/i9wp-a4ja.csv',
      `$select=${encodeURIComponent('stop_name,daytime_routes,entrance_type,entrance_latitude,entrance_longitude')}`);
  } else console.log('cache hit subway.csv');
}

const arg = process.argv.find((a) => a.startsWith('--boro'));
const list = (arg ? (arg.split('=')[1] ?? process.argv[process.argv.indexOf(arg) + 1]) : '1').split(',').map(Number);
await fetchShared();
for (const b of list) await fetchBoro(b);
console.log('\nDone.');
