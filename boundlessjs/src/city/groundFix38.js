// GF38 (GROUNDFIX, docs/notes/ar34-groundfix.md): the ground the compiled tiles leave bare on the 125th Street tiles. The
// compiled sidewalk is a strip of fixed width along each kerb; between it and the building line, at corners whose kerb
// radius it does not follow, round islands, in the lots and under the viaducts no section was laid and the terrain grid
// (drawn 0.12 m under its samples, 0.26 m under the road) showed: brown at night, slate by day (the owner, on t8LenoxDive:
// "a brown dirt empty area right next to the Starbucks"). tools/qa/ground_gaps.mjs counted 1,570 such clusters on the 49
// tiles after ST38.
// The surfaces come from the NYC Planimetric Database (Sidewalk, Roadbed, Median, Parking Lot, Public Plazas; the copies in
// boundlessjs/data/raw/planimetric/): each class minus the sections already there and the building footprints, as
// sidewalk (walks, curbed medians and islands, plazas) or roadway (roadbed, painted medians, lots), at the height of the
// compiled surface of that class beside it (3-4 mm under it, run a few cm under it), with a kerb face wherever a filled
// walk meets roadway, or a filled roadway meets a walk, and no compiled kerb stands. The ground beside the viaducts and
// under them takes its planimetric class at grade (roadway, walk or lot). What the city's polygons leave out and the probe
// still calls a gap takes the surface it borders most. Baked per tile by boundlessjs/tools/ar34/ground/gf38_bake.py (from
// the ground as world/assemble.js has it at this point: gf38_dump.mjs) into public/data/gf38/<tile>.bin; a tile whose
// compiled file differs from the one baked against (its byte length) is left as it is. `?gf38=0` restores the bare ground.
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
export const GF38 = !(Q && Q.get('gf38') === '0');

let _idx = null;
function index() {
  if (!_idx) _idx = !GF38 || typeof fetch === 'undefined' ? Promise.resolve(null)
    : fetch('data/gf38/index.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return _idx;
}
// the baked triangles of a tile: { kinds: { section: Float32Array (tile-local, 9 per triangle) } } or null
export function gf38Parse(buf) {
  const dv = new DataView(buf), n = dv.getUint32(0, true);
  const h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n)));
  const f = new Float32Array(buf.slice(4 + n));
  const kinds = {};
  for (const [k, [o, c]] of Object.entries(h.kinds)) kinds[k] = f.subarray(o, o + c);
  return { key: h.key, kinds };
}
export async function gf38Load(key, byteLength) {
  if (!GF38) return null;
  const idx = await index();
  const e = idx && idx.tiles && idx.tiles[key];
  if (!e || e.bytes !== byteLength) return null;
  try {
    const r = await fetch(`data/gf38/${key}.bin`);
    return r.ok ? gf38Parse(await r.arrayBuffer()) : null;
  } catch { return null; }
}
// append the baked surfaces to the tile's sections (world/assemble.js, after ST38's corner paving, before anything samples
// or draws the ground)
export function gf38Apply(tile, data) {
  if (!GF38 || !data || !tile || !tile.S || tile.groundFix38Done) return 0;
  tile.groundFix38Done = true;   // (ST38's corner paving keeps tile.gf38Done for itself)
  let n = 0;
  for (const [k, add] of Object.entries(data.kinds)) {
    if (!add.length) continue;
    const a = tile.S[k] && tile.S[k].length ? tile.S[k] : new Float32Array(0), m = new Float32Array(a.length + add.length);
    m.set(a, 0); m.set(add, a.length);
    tile.S[k] = m; n += add.length / 9;
  }
  if (typeof window !== 'undefined') { const W = (window.__gf38fill = window.__gf38fill || { tiles: 0, tris: 0 }); W.tiles++; W.tris += n; }
  return n;
}
