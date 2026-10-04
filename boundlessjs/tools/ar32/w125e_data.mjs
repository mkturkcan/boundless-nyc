// AR32 w125e: writes src/city/w125eData.js from an OpenStreetMap Overpass export (JSON, `out body geom`) of E 125th St
// (bbox 40.7960,-73.9460 .. 40.8120,-73.9200): the Park Avenue Viaduct's four tracks, the Harlem-125th Street
// platforms and station house, the Lexington Avenue station's street entrances, the RFK Bridge's Manhattan ramps.
// usage: node boundlessjs/tools/ar32/w125e_data.mjs <overpass.json>
import fs from 'node:fs';
const LAT0 = 40.7831, LON0 = -73.9712, M_LAT = 111132.0, M_LON = 84316.0;   // shared/geo.js project()
const P = (g) => g.map((p) => [+((p.lon - LON0) * M_LON).toFixed(2), +(-(p.lat - LAT0) * M_LAT).toFixed(2)]);
const D = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const byId = new Map(D.elements.map((e) => [e.id, e]));
// the four tracks from between 122nd and 123rd St (the north ends of ways 794487280-83) to the Harlem River lift bridge's south abutment
const TRACK_IDS = [794487279, 46693866, 794487278, 180750894];
// and on to the lift bridge's south abutment (layer 2: ways 180750897, 84454307, 180750912, 794487277)
const NORTH_IDS = [180750897, 84454307, 180750912, 794487277];
const sn = (g) => (g[0][1] < g[g.length - 1][1] ? g.reverse() : g);
const tracks = TRACK_IDS.map((id, i) => { const a = sn(P(byId.get(id).geometry)), b = sn(P(byId.get(NORTH_IDS[i]).geometry)); return a.concat(b.slice(1)); });
const platforms = [180750913, 180750914].map((id) => P(byId.get(id).geometry).slice(0, -1));
const station = P(byId.get(814296538).geometry).slice(0, -1);
const lex = D.elements.filter((e) => e.type === 'node' && e.tags && e.tags.railway === 'subway_entrance' && /Lex/.test(e.tags.description || '') && /125/.test(e.tags.description || ''))
  .map((e) => ({ id: e.id, p: P([e])[0], d: e.tags.description }));
const elev = D.elements.filter((e) => e.id === 7668123465).map((e) => P([e])[0]);
// the RFK Bridge's Manhattan ramps and the Harlem River Drive's viaduct: every highway way tagged bridge with a layer
// east of Second Avenue (x > 3100) and south of the Harlem River (z > -2300); layer and lanes kept for the deck
const ramps = D.elements.filter((e) => e.type === 'way' && e.tags && e.tags.highway && /motorway|primary/.test(e.tags.highway) && e.tags.bridge && e.geometry)
  .map((e) => ({ id: e.id, name: e.tags.name || e.tags['bridge:name'] || '', layer: +(e.tags.layer || 1), lanes: +(e.tags.lanes || 1), pts: P(e.geometry) }))
  .filter((w) => w.pts.some(([x, z]) => x > 3100 && x < 3600 && z > -2300 && z < -1900));
const out = `// AR32 w125e data, written by boundlessjs/tools/ar32/w125e_data.mjs from OpenStreetMap (Overpass export 2026-09-30,
// OSM base 2026-05-31). World metres (shared/geo.js project(): x east, z south). OpenStreetMap data (c) OpenStreetMap
// contributors, available under the Open Database Licence (ODbL 1.0).
// The Park Avenue Viaduct's four tracks, west to east, each from the south (between 122nd and 123rd St) to the Harlem River lift bridge
// (ways ${TRACK_IDS.join(', ')}, then ${NORTH_IDS.join(', ')})
export const TRACKS = ${JSON.stringify(tracks)};
// the two high-level island platforms (ways 180750913, 180750914; OSM height 4 ft over the rail)
export const PLATFORMS = ${JSON.stringify(platforms)};
// the 1897 station house under the viaduct, 125th to 126th St (way 814296538, building=train_station)
export const STATION = ${JSON.stringify(station)};
// 125th St (4/5/6) at Lexington Avenue: the four corner stairs and the elevator (railway=subway_entrance)
export const LEX = ${JSON.stringify(lex.map((e) => ({ p: e.p, d: e.d })))};
export const LEX_ELEV = ${JSON.stringify(elev)};
// the RFK Bridge's Manhattan ramps and the Harlem River Drive's viaduct round Second Avenue and 125th St
export const RAMPS = ${JSON.stringify(ramps)};
`;
fs.writeFileSync(new URL('../../src/city/w125eData.js', import.meta.url), out);
console.log('tracks', tracks.map((t) => t.length), 'platforms', platforms.length, 'lex', lex.length, 'ramps', ramps.length, ramps.map((r) => r.id + ':' + r.layer).join(' '));
