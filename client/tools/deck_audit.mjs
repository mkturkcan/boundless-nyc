// QA round 3 (2026-10-02): which cams views moved with the lens change of 969fe7a (RS34)?
// bshot (--onepage teleport) and main.js FlyCam (a fresh page's first view, rel=1) stand a cams view ALT over
//   before: max(terrainAt, 0.5)                          (the park's rectangle: terrainAt)
//   RS34:   max(terrainAt, surfaceInfoAt(x, z, 0.5).y - (road ? 0.145 : 0.28), 0.5)
//   RS35 (79d0fc3, 07:39): the section counts only when it lies within 3 m above terrainAt (decks are left to the ALT again)
// surfaceInfoAt answers the compiled ground sections (a parkway or bridge deck compiles as a section too), so a view
// whose ALT was raised by hand to reach a deck now stands that much higher. This replays both rules offline on the live
// tiles (client/public/tiles): terrainAt as world/streamer.js does it, surfaceInfoAt as world/assemble.js's
// surfaceKindAt (walk kinds first, grass over them, then the road kinds; the first containing triangle by index).
//   node client/tools/deck_audit.mjs <out.tsv> <cams.json> [more cams files ...]   (TILES_DIR=<dir> for another tile set)
// Prints the views that moved by more than 0.25 m; writes every view to <out.tsv>.
// The film recorder's PathCam (tools/ad/record.mjs paths, the teasers) still stands its keys over terrainAt only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// the live tiles beside this tool, or TILES_DIR (a staging set from tools/pipeline/compile.mjs)
const tdir = process.env.TILES_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/tiles');
const man = JSON.parse(fs.readFileSync(tdir + '/manifest.json', 'utf8'));
const TILE = man.tile || 512, CELL = 4;
const T = new Map();
const load = (key) => {
  if (T.has(key)) return T.get(key);
  const ent = man.tiles[key]; let rec = null;
  if (ent) {
    const buf = fs.readFileSync(tdir + '/' + ent.f).buffer; const dv = new DataView(buf); const hLen = dv.getUint32(4, true);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hLen)));
    const base = 8 + hLen + ((4 - ((8 + hLen) % 4)) % 4); const S = {};
    for (const s of header.sections) S[s.name] = new ({ Float32Array, Uint8Array, Uint32Array, Int16Array, Uint16Array }[s.type])(buf, base + s.offset, s.length);
    rec = { S, header, ox: header.origin[0], oz: header.origin[1] };
  }
  T.set(key, rec); return rec;
};
const keyOf = (x, z) => `${Math.floor(x / TILE)}_${Math.floor(z / TILE)}`;
const terrainAt = (x, z) => {
  const t = load(keyOf(x, z)); if (!t || !t.S.terrain) return null;
  const grid = t.S.terrain, res = t.header.res, n = res + 1;
  const fx = Math.min(res - 0.001, Math.max(0, ((x - t.ox) / TILE) * res)), fz = Math.min(res - 0.001, Math.max(0, ((z - t.oz) / TILE) * res));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const y00 = grid[j * n + i], y10 = grid[j * n + i + 1], y01 = grid[(j + 1) * n + i], y11 = grid[(j + 1) * n + i + 1];
  return u >= v ? y00 + u * (y10 - y00) + v * (y11 - y10) : y00 + v * (y01 - y00) + u * (y11 - y01);
};
const sectionY0 = (t, name, x, z, tol) => {
  const a = t.S[name]; if (!a || a.length < 9) return null;
  const ox = t.ox, oz = t.oz, ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
  let bestY = null, bestD = 1e9;
  for (let o = 0; o + 8 < a.length; o += 9) {
    const x0 = a[o] + ox, y0 = a[o + 1], z0 = a[o + 2] + oz, x1 = a[o + 3] + ox, y1 = a[o + 4], z1 = a[o + 5] + oz, x2 = a[o + 6] + ox, y2 = a[o + 7], z2 = a[o + 8] + oz;
    const i0 = Math.floor(Math.min(x0, x1, x2) / CELL), i1 = Math.floor(Math.max(x0, x1, x2) / CELL);
    const j0 = Math.floor(Math.min(z0, z1, z2) / CELL), j1 = Math.floor(Math.max(z0, z1, z2) / CELL);
    if ((i1 - i0) > 64 || (j1 - j0) > 64) continue;             // as the hash: river slivers skipped
    if (ci < i0 || ci > i1 || cj < j0 || cj > j1) continue;      // as the hash: only triangles in the point's cell
    const d = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2); if (Math.abs(d) < 1e-9) continue;
    const l0 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / d, l1 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / d, l2 = 1 - l0 - l1;
    let out = 0;
    if (l0 < 0) out = Math.max(out, -l0 * Math.abs(d) / Math.hypot(x1 - x2, z1 - z2));
    if (l1 < 0) out = Math.max(out, -l1 * Math.abs(d) / Math.hypot(x2 - x0, z2 - z0));
    if (l2 < 0) out = Math.max(out, -l2 * Math.abs(d) / Math.hypot(x0 - x1, z0 - z1));
    if (out < bestD) { bestD = out; bestY = l0 * y0 + l1 * y1 + l2 * y2; if (out > 0) bestY = Math.min(Math.max(y0, y1, y2), Math.max(Math.min(y0, y1, y2), bestY)); }
    if (bestD === 0) break;
  }
  return bestD <= tol ? bestY : null;
};
const sectionY = (t, name, x, z, tol) => { const y = sectionY0(t, name, x, z, tol); return y === null && name === 'grass' ? sectionY0(t, 'grassU', x, z, tol) : y; };
const WALK = ['sidewalk', 'path', 'brick', 'plaza', 'gravel'], ROAD = ['gutter', 'busred', 'asphalt'];
const surfaceInfoAt = (x, z, tol) => {
  const t = load(keyOf(x, z)); if (!t) return null;
  for (const k of WALK) { const y = sectionY(t, k, x, z, tol); if (y !== null) { const g = sectionY(t, 'grass', x, z, 0.02); return g !== null && g > y + 0.01 ? { kind: 'grass', y: g, road: false } : { kind: k, y, road: false }; } }
  const g = sectionY(t, 'grass', x, z, tol); if (g !== null) return { kind: 'grass', y: g, road: false };
  for (const k of ROAD) { const y = sectionY(t, k, x, z, tol); if (y !== null) return { kind: k, y, road: true }; }
  return null;
};
const LAT0 = 40.7831, LON0 = -73.9712, M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
const project = (lon, lat) => [(lon - LON0) * M_LON, -(lat - LAT0) * M_LAT];
const [outF, ...files] = process.argv.slice(2);
const rows = [];
for (const f of files) {
  let J; try { J = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.log('skip (not JSON)', f); continue; }
  if (!J || typeof J !== 'object' || Array.isArray(J)) continue;
  for (const [k, v] of Object.entries(J)) {
    if (k.startsWith('_')) continue;
    let x, z, alt;
    if (Array.isArray(v) && v.length >= 6 && v.slice(0, 3).every(Number.isFinite)) [x, z, alt] = v;
    else if (v && typeof v === 'object' && Number.isFinite(v.x) && Number.isFinite(v.z) && Number.isFinite(v.y)) ({ x, z, y: alt } = v);
    else continue;
    const qx = x - 447.2, qz = z - 82.2, park = Math.abs(qx * 0.4848 - qz * 0.8746) < 2084 && Math.abs(qx * 0.8746 + qz * 0.4848) < 451;
    const g = terrainAt(x, z);
    const si = !park && g !== null ? surfaceInfoAt(x, z, 0.5) : null;
    const sy = si && Number.isFinite(si.y) ? si.y - (si.road ? 0.145 : 0.28) : null;
    const gs = sy !== null ? Math.max(g, sy) : g, gs35 = sy !== null && sy - g <= 3 ? Math.max(g, sy) : g;
    const base = (v) => (g === null ? 0 : park ? g : Math.max(v, 0.5));
    const before = base(g) + alt, after = base(gs) + alt, after35 = base(gs35) + alt;
    rows.push({ f, k, x, z, alt, g, kind: si ? si.kind : '-', sy: si ? si.y : null, before, after, d: after - before, after35, d35: after35 - before });
  }
}
const fx = (v, n = 2) => (v === null || v === undefined ? '-' : (+v).toFixed(n));
fs.writeFileSync(outF, ['file\tview\tx\tz\talt\tterrainAt\tsurface\tsurfaceY\ty_before\ty_after\tdelta\ty_rs35\tdelta_rs35'].concat(rows.map((r) => [r.f, r.k, fx(r.x), fx(r.z), r.alt, fx(r.g), r.kind, fx(r.sy), fx(r.before), fx(r.after), fx(r.d), fx(r.after35), fx(r.d35)].join('\t'))).join('\n') + '\n');
const moved = rows.filter((r) => Math.abs(r.d) > 0.25).sort((a, b) => b.d - a.d);
console.log(`${rows.length} views in ${files.length} files; ${moved.length} moved by more than 0.25 m`);
for (const r of moved) console.log(`${fx(r.d).padStart(7)} m  ${r.k.padEnd(28)} alt ${String(r.alt).padEnd(6)} terrain ${fx(r.g)} ${r.kind} ${fx(r.sy)}  y ${fx(r.before)} -> ${fx(r.after)}  ${r.f}`);
const moved35 = rows.filter((r) => Math.abs(r.d35) > 0.25).sort((a, b) => b.d35 - a.d35);
console.log(`RS35: ${moved35.length} views stand more than 0.25 m off the old base (before 969fe7a)`);
for (const r of moved35) console.log(`${fx(r.d35).padStart(7)} m  ${r.k.padEnd(28)} alt ${String(r.alt).padEnd(6)} terrain ${fx(r.g)} ${r.kind} ${fx(r.sy)}  y ${fx(r.before)} -> ${fx(r.after35)}  ${r.f}`);
