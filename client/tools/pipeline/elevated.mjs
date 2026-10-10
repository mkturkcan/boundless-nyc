// Elevated rail structures (EL14, round 14/15): the BMT Jamaica Line (J/M/Z) over Broadway in Williamsburg and Bushwick,
// the BMT Myrtle Avenue Line, and the IRT Broadway–Seventh Avenue Line viaduct at 125th St — from OSM `railway=subway`
// ways tagged bridge=yes (data/raw/osm_rail_elevated.json, Overpass `out geom tags`, fetched 2026-09-17).
//
// Standalone: it does not need a tile compile. It reads the LIVE compiled tiles only to find the carriageway under each
// track (kerb-to-kerb), so the columns stand on the kerb lines the way the real el's bents do, and the deck spans the
// street. Output: public/data/elevated.json, built at boot by src/city/elevatedKit.js.
//
//   node tools/pipeline/elevated.mjs [tilesDir=public/tiles]
//
// Frame: x east, z south (src/shared/geo.js). The compile is FLAT (compile.mjs FLAT): the roadbed is at LOT_Y - 0.26 +
// 0.135 = 3.385 and the walk top at 3.52, so heights are absolute; if TERRAIN=real ever ships, sample the terrain here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bdir = path.resolve(here, '..', '..');
const tdir = path.resolve(bdir, process.argv[2] || 'public/tiles');
const LAT0 = 40.7831, LON0 = -73.9712, M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
const project = (lon, lat) => [(lon - LON0) * M_LON, -(lat - LAT0) * M_LAT];
const GROUND = 3.52, ROADBED = 3.385;
// rail level above the street: the BMT els are two-storey structures (~7.6 m to top of rail); the IRT viaduct at
// 125th crosses the Manhattanville valley on a much taller structure (~16 m at the avenue).
const RAIL_H = (name) => /IRT Broadway/.test(name || '') ? 16.0 : 7.6;
const DECK_UNDER = 1.35;   // rail top -> underside of the longitudinal girders

const raw = JSON.parse(fs.readFileSync(path.join(bdir, 'data/raw/osm_rail_elevated.json'), 'utf8'));
const ways = raw.elements.filter((e) => e.type === 'way' && e.geometry && e.tags && (e.tags.bridge === 'yes' || +e.tags.layer > 0));
console.log('elevated ways:', ways.length);

// ---- compiled ground sections (probe_map.mjs logic): which road section covers a point, and its y
const man = JSON.parse(fs.readFileSync(path.join(tdir, 'manifest.json'), 'utf8'));
const TILE = man.tile || man.tileSize || 512;
const tileCache = new Map();
function loadTile(tx, tz) {
  const k = `${tx}_${tz}`;
  if (tileCache.has(k)) return tileCache.get(k);
  const ent = man.tiles[k];
  let t = null;
  if (ent) {
    const buf = fs.readFileSync(path.join(tdir, ent.f)).buffer;
    const dv = new DataView(buf); const hLen = dv.getUint32(4, true);
    const h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hLen)));
    const base = 8 + hLen + ((4 - ((8 + hLen) % 4)) % 4);
    const S = {};
    for (const s of h.sections) S[s.name] = new ({ Float32Array, Uint8Array, Uint32Array, Int16Array, Uint16Array }[s.type])(buf, base + s.offset, s.length);
    t = { origin: h.origin, S };
  }
  tileCache.set(k, t);
  return t;
}
const ROAD_SECTIONS = ['asphalt', 'gutter', 'busred', 'paintW', 'paintY', 'paintG'];
// y of the road surface at (x,z), or null when no road section covers the point
function roadY(x, z) {
  const t = loadTile(Math.floor(x / TILE), Math.floor(z / TILE));
  if (!t) return null;
  const [ox, oz] = t.origin;
  const lx = x - ox, lz = z - oz;
  for (const name of ROAD_SECTIONS) {
    const a = t.S[name]; if (!a) continue;
    for (let i = 0; i + 8 < a.length; i += 9) {
      const ax = a[i], az = a[i + 2], bx = a[i + 3], bz = a[i + 5], cx = a[i + 6], cz = a[i + 8];
      const d1 = (lx - bx) * (az - bz) - (ax - bx) * (lz - bz);
      const d2 = (lx - cx) * (bz - cz) - (bx - cx) * (lz - cz);
      const d3 = (lx - ax) * (cz - az) - (cx - ax) * (lz - az);
      const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(neg && pos)) return (a[i + 1] + a[i + 4] + a[i + 7]) / 3;
    }
  }
  return null;
}

// ---- tracks
const tracks = [];
const along = [];   // [x, z, dirx, dirz, name] samples every 15 m for the bents
for (const w of ways) {
  const name = w.tags.name || '';
  const railY = GROUND + RAIL_H(name);
  const pts = w.geometry.map((g) => { const [x, z] = project(g.lon, g.lat); return [+x.toFixed(2), +railY.toFixed(2), +z.toFixed(2)]; });
  if (pts.length < 2) continue;
  tracks.push({ name, id: w.id, svc: w.tags.service || '', pts });
  if (w.tags.service) continue;   // crossovers / spurs sit inside the structure the main tracks define
  let acc = 7.5;
  for (let i = 0; i < pts.length - 1; i++) {
    const A = pts[i], B = pts[i + 1];
    const dx = B[0] - A[0], dz = B[2] - A[2], L = Math.hypot(dx, dz);
    if (L < 1e-3) continue;
    const ux = dx / L, uz = dz / L;
    for (let d = acc; d < L; d += 15) along.push([A[0] + ux * d, A[2] + uz * d, ux, uz, name]);
    acc = ((acc - L) % 15 + 15) % 15;
  }
}
console.log('tracks:', tracks.length, 'bent samples:', along.length);

// ---- bents: two columns on the kerb lines of the carriageway under the track, else ±3.2 m; deduped per structure
const bents = [];
let onRoad = 0, offRoad = 0, skipped = 0;
let lastGood = null, lastName = null;   // carry-forward of the last clean kerb pair on the same line (junctions, kerb-riding tracks)
for (const [x, z, ux, uz, name] of along) {
  if (bents.some((b) => Math.hypot(b.x - x, b.z - z) < 8)) continue;   // the parallel track already placed this bent
  if (name !== lastName) { lastGood = null; lastName = name; }
  const nx = -uz, nz = ux;   // left normal
  const under = roadY(x, z);
  let a = 3.2, b = 3.2, ground = GROUND;
  if (under !== null) {
    // march out along the normal until the road section ends: that is the kerb. Cap 16.5 m: a 30 m avenue
    // (Broadway at 125th) still resolves both kerbs; anything wider is a junction box.
    const reach = (sgn) => { let last = 0; for (let s = 0.5; s <= 16.5; s += 0.5) { if (roadY(x + sgn * nx * s, z + sgn * nz * s) === null) break; last = s; } return last; };
    const L = reach(1), R = reach(-1);
    ground = under;
    // a clean pair: both kerbs found, span 6-26 m, the track at least 2 m inside each kerb. At a junction (both
    // marches hit the cap) or where the track rides a kerb (one side < 2 m) the columns would land in the
    // cross street or in a traffic lane — the real el SPANS the crossing, so on a line that has had a clean
    // bent no bent is placed there and the next 15 m sample lands past the junction.
    const clean = L >= 2 && R >= 2 && L + R >= 6 && L + R <= 26 && !(L > 16 && R > 16);
    if (clean) { a = Math.max(0.3, L - 0.45); b = Math.max(0.3, R - 0.45); lastGood = [a, b]; onRoad++; }
    else if (lastGood) { skipped++; continue; }
    else { offRoad++; }
  } else if (lastGood) { skipped++; continue; } else offRoad++;
  const railY = GROUND + RAIL_H(name);
  const y1 = railY - DECK_UNDER;
  bents.push({
    x: +x.toFixed(2), z: +z.toFixed(2), rot: +Math.atan2(-nz, nx).toFixed(4),   // rotY that turns +X into the normal
    a: +a.toFixed(2), b: +b.toFixed(2), y0: +ground.toFixed(2), y1: +y1.toFixed(2),
  });
}
console.log('bents:', bents.length, '| kerb-line pairs:', onRoad, '| junction / kerb-riding samples spanned (no bent):', skipped, '| off-road (±3.2 m):', offRoad);

const out = { ground: GROUND, roadbed: ROADBED, deckUnder: DECK_UNDER, tracks, bents };
const outPath = path.join(bdir, 'public/data/elevated.json');
fs.writeFileSync(outPath, JSON.stringify(out));
console.log('wrote', path.relative(bdir, outPath), (fs.statSync(outPath).size / 1024).toFixed(0), 'KB');
