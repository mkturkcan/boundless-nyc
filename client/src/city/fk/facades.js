// AR33 part (city/areas.js) fk: the facade kit. Buildings along 125th Street and in Hunters Point rebuilt from
// per-building specs (fk/specs/*.js, one file per segment, schema in docs/notes/ar33-spec.md) authored off recent Street
// depth (reveals, frames, sills, lintels, cornices, piers, storefront systems, signs, awnings, fire escapes, roof plant)
// and photogrammetry-grade materials. `?fk=0` restores the compiled buildings. Owner: the KIT worker (docs/notes/ar33-kit.md).
// Hooks, all optional (the contracts are in city/centralPark.js): apply, skipBuilding, dropFurniture, furniture, build,
// promenades, seats; `ready` (a promise) holds tile assembly until the specs are in.
// Flags: `?fk=0` off; `?fk=bid2,bid3` only those segments (A/Bs); `?fktest=1` adds the kit's own test specs
// (fk/specs/_kit.js); `?fklod=<m>` the near-detail distance (default 120); `?fkdbg=1` logs every match.
// How a spec finds its building: each spec names a point `at` (and `also` points) inside the compiled footprint it
// replaces. skipBuilding(cx, cz, h, area) is only handed the centroid, so the match runs in apply(tile, ox, oz), which
// world/assemble.js calls before the tile's building loop: every compiled ring of the tile that holds a spec point is
// recorded with its centroid computed exactly as assemble.js does (the mean of the ring's world vertices), and
// skipBuilding answers from those centroids; build(group, ctx) then builds each recorded spec on its ring.
import { buildingsOf } from '../../world/tiledata.js';
import { COLLIDERS } from '../colliders.js';

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const FKQ = Q ? Q.get('fk') : null;
export const FK = FKQ !== '0';
const ONLY = FKQ && FKQ !== '1' && FKQ !== '0' ? new Set(FKQ.split(',').map((s) => s.trim()).filter(Boolean)) : null;
const FKTEST = !!(Q && Q.get('fktest') === '1');
const DBG = !!(Q && Q.get('fkdbg') === '1');
const SEGS = ['west', 'bid1', 'bid2', 'bid3', 'bid4', 'east', 'hpt'];
// explicit loaders (a template import would also pull in every file of the folder)
const SPEC_L = {
  west: () => import('./specs/west.js'), bid1: () => import('./specs/bid1.js'), bid2: () => import('./specs/bid2.js'),
  bid3: () => import('./specs/bid3.js'), bid4: () => import('./specs/bid4.js'), east: () => import('./specs/east.js'),
  hpt: () => import('./specs/hpt.js'), _kit: () => import('./specs/_kit.js'),
};
const CUSTOM_L = {
  west: () => import('./custom/west.js'), bid1: () => import('./custom/bid1.js'), bid2: () => import('./custom/bid2.js'),
  bid3: () => import('./custom/bid3.js'), bid4: () => import('./custom/bid4.js'), east: () => import('./custom/east.js'),
  hpt: () => import('./custom/hpt.js'),
};

// ------------------------------------------------------------------ state
let KIT = null;                  // fk/facadeKit.js once loaded (null: the part skips nothing)
const SPECS = [];                // { spec, seg, pts: [[x, z], ...] }
const CUSTOM = {};               // seg -> the custom module's namespace
const TILES = new Map();         // 'ox,oz' -> [{ spec, seg, rings: [{ b, ring, cx, cz }] }]
const SKIP = new Map();          // 'cx,cz' (mm) -> { cx, cz }: centroids of compiled buildings the kit replaces
const RINGS = [];                // { ring, box, key } of every replaced footprint (dropFurniture)
export const STATS = { tiles: {}, errors: [] };
if (typeof window !== 'undefined') window.__FK = { STATS, SPECS, TILES, CUSTOM };

const segOn = (s) => (s === '_kit' ? FKTEST : !ONLY || ONLY.has(s));

async function load() {
  const segs = SEGS.filter(segOn);
  if (FKTEST) segs.push('_kit');
  const [kitR, ...rs] = await Promise.allSettled([
    import('./facadeKit.js'),
    ...segs.map((s) => SPEC_L[s]()),
    ...segs.filter((s) => CUSTOM_L[s]).map((s) => CUSTOM_L[s]()),
  ]);
  if (kitR.status === 'fulfilled') KIT = kitR.value;
  else { console.warn('[fk] facadeKit.js unavailable: the compiled buildings stay', kitR.reason); STATS.errors.push('kit: ' + kitR.reason); }
  const specRs = rs.slice(0, segs.length), custRs = rs.slice(segs.length);
  segs.filter((s) => CUSTOM_L[s]).forEach((s, i) => {
    const r = custRs[i];
    if (r.status === 'fulfilled') CUSTOM[s] = r.value;
    else { console.warn(`[fk] custom/${s}.js unavailable (its custom builders and sign marks are left out)`, r.reason); STATS.errors.push(`custom ${s}: ${r.reason}`); }
  });
  let n = 0;
  segs.forEach((s, i) => {
    const r = specRs[i];
    if (r.status !== 'fulfilled') { console.warn(`[fk] specs/${s}.js unavailable: segment ${s} left out`, r.reason); STATS.errors.push(`specs ${s}: ${r.reason}`); return; }
    const list = r.value && r.value.default;
    if (!Array.isArray(list)) { console.warn(`[fk] specs/${s}.js: default export is not an array`); return; }
    for (const spec of list) {
      if (!spec || !Array.isArray(spec.at) || spec.at.length < 2) { console.warn(`[fk] ${s}: a spec without an 'at' point`, spec && spec.id); continue; }
      if (spec.skip === true) continue;
      const pts = [[+spec.at[0], +spec.at[1]]];
      for (const p of spec.also || []) if (Array.isArray(p) && p.length >= 2) pts.push([+p[0], +p[1]]);
      SPECS.push({ spec, seg: s, pts });
      n++;
    }
  });
  if (KIT && KIT.setCustom) KIT.setCustom(CUSTOM);
  if (KIT && KIT.ready) { try { await KIT.ready; } catch (e) { console.warn('[fk] kit ready', e); } }
  console.log(`[fk] ${n} specs from ${segs.join(', ')}${KIT ? '' : ' (no kit: nothing replaced)'}`);
}
export const ready = FK ? load().catch((e) => { console.warn('[fk] load', e); }) : Promise.resolve();

// ------------------------------------------------------------------ geometry helpers
function inRing(ring, x, z) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function segDist(px, pz, ax, az, bx, bz) {
  const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / L2)) : 0;
  return Math.hypot(px - ax - ex * t, pz - az - ez * t);
}
function ringDist(ring, x, z) {
  let d = 1e9;
  for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; d = Math.min(d, segDist(x, z, a[0], a[1], b[0], b[1])); }
  return d;
}
const ckey = (cx, cz) => `${Math.round(cx * 1000)},${Math.round(cz * 1000)}`;

// ------------------------------------------------------------------ hooks
// Match the tile's compiled rings against the spec points (before assemble.js's building loop)
export function apply(tile, ox, oz) {
  if (!FK || !KIT || !SPECS.length) return;
  const tk = `${ox},${oz}`;
  const cand = SPECS.filter((S) => S.pts.some(([x, z]) => x > ox - 160 && x < ox + 672 && z > oz - 160 && z < oz + 672));
  if (!cand.length) { TILES.set(tk, []); return; }
  const XZ = tile.S.bldgXZ;
  const recs = new Map();   // spec -> rec
  for (const b of buildingsOf(tile)) {
    let minX = 1e9, minZ = 1e9, maxX = -1e9, maxZ = -1e9;
    for (let i = 0; i < b.len; i++) {
      const x = XZ[(b.start + i) * 2] + ox, z = XZ[(b.start + i) * 2 + 1] + oz;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    let ring = null, claimed = false;
    for (const S of cand) {
      if (claimed) break;
      for (let k = 0; k < S.pts.length; k++) {
        const [px, pz] = S.pts[k];
        if (px < minX || px > maxX || pz < minZ || pz > maxZ) continue;
        if (!ring) { ring = []; for (let i = 0; i < b.len; i++) ring.push([XZ[(b.start + i) * 2] + ox, XZ[(b.start + i) * 2 + 1] + oz]); }
        if (!inRing(ring, px, pz)) continue;
        if (S.spec.comp && k === 0) {
          const [ct, ci] = String(S.spec.comp).split(':');
          if (ci !== undefined && +ci !== b.i && DBG) console.warn(`[fk] ${S.spec.id}: 'at' lies in ${ct}:${b.i}, the spec names ${S.spec.comp}`);
        }
        // the centroid exactly as world/assemble.js computes it
        let cx = 0, cz = 0;
        for (const [x, z] of ring) { cx += x; cz += z; }
        cx /= ring.length; cz /= ring.length;
        let rec = recs.get(S);
        if (!rec) recs.set(S, (rec = { spec: S.spec, seg: S.seg, rings: [] }));
        if (!rec.rings.some((r) => r.b.i === b.i)) rec.rings.push({ b, ring, cx, cz, primary: k === 0 });
        // one spec per compiled footprint: the first in load order (the segments, then the kit's own tests)
        claimed = true;
        break;
      }
    }
  }
  const list = [...recs.values()];
  for (const rec of list) {
    // a spec whose `at` point is not in this tile's rings but an `also` point is: its primary ring is in another tile
    rec.rings.sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
    for (const r of rec.rings) {
      if (!rec.spec.keepCompiled) SKIP.set(ckey(r.cx, r.cz), { cx: r.cx, cz: r.cz });
      let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
      for (const [x, z] of r.ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      if (!RINGS.some((q) => q.cx === r.cx && q.cz === r.cz)) RINGS.push({ ring: r.ring, box: [x0 - 2, z0 - 2, x1 + 2, z1 + 2], cx: r.cx, cz: r.cz, tk, keep: !!rec.spec.keepCompiled });
    }
    if (DBG) console.log(`[fk] ${rec.spec.id}: ${rec.rings.map((r) => `${r.b.i}${r.primary ? '*' : ''}`).join(', ')} in ${tk}`);
  }
  TILES.set(tk, list);
}

export function skipBuilding(cx, cz, h, area) {
  if (!FK || !KIT || !SKIP.size) return false;
  const e = SKIP.get(ckey(cx, cz));
  // (a spec that keeps the compiled massing, a tower seen from afar, is never in SKIP: it adds faces only)
  return !!e;
}

// Compiled furniture on a replaced building's walls and roof (fire escapes, awnings, AC units, water towers, bulkheads,
// chimney pots, scaffolds, marquees, flags, stoops): dropped inside the footprint and, for what hangs on a wall, up to
// 1.8 m outside it. Street furniture (trees, lamps, hydrants, signs, shelters) is never dropped here.
const WALL_K = new Set([14, 16, 20, 21, 28, 29]);   // SCAFFOLD, AWNING, STOOP, FIRE_ESCAPE, FLAG, MARQUEE
const ROOF_K = new Set([22, 23, 24, 25]);           // WATER_TOWER, ROOF_AC, ROOF_BULKHEAD, CHIMNEY_POT
export function dropFurniture(wx, wz, f) {
  if (!FK || !KIT || !RINGS.length) return false;
  const wall = WALL_K.has(f.k), roof = ROOF_K.has(f.k);
  if (!wall && !roof) return false;
  for (const r of RINGS) {
    if (r.keep) continue;
    const [x0, z0, x1, z1] = r.box;
    if (wx < x0 || wx > x1 || wz < z0 || wz > z1) continue;
    if (inRing(r.ring, wx, wz)) return true;
    if (wall && ringDist(r.ring, wx, wz) < 1.8) return true;
  }
  return false;
}

// Sliced: city/areas.js awaits a part's build (globalThis.__AR_BUILD_AWAITS, AR34), so the tile's buildings are built in
// 8 ms slices and build() returns the promise; a tile of 30 spec'd buildings no longer stalls the page for seconds, and the
// tile stays 'loading' until they are in. `?fkasync=0` builds each tile in one go (the A/B), `?fkasync=1` slices even
// without the await (the tile shows up first, its spec'd buildings a moment later).
const FKASYNC = !!(Q && Q.get('fkasync') === '1'), FKSYNC = !!(Q && Q.get('fkasync') === '0');
export function build(group, ctx) {
  if (!FK || !KIT) return;
  const tk = `${ctx.ox},${ctx.oz}`;
  const list = TILES.get(tk);
  if (!list || !list.length) return;
  const t0 = performance.now();
  const done = (out) => {
    const ms = performance.now() - t0;
    STATS.tiles[ctx.key] = { specs: list.length, built: out.built, tris: out.tris, ms: Math.round(ms), busy: out.busy ?? Math.round(ms), longest: out.longest ?? null, errors: out.errors || [] };
    console.log(`[fk] tile ${ctx.key}: ${list.length} specs, ${out.built} built, ${out.tris} triangles (${ms.toFixed(0)} ms${out.busy !== undefined ? `, ${out.busy} ms on the main thread in slices, the longest ${out.longest} ms` : ''})`);
    return out;
  };
  if (!FKSYNC && (FKASYNC || globalThis.__AR_BUILD_AWAITS) && KIT.buildTileAsync) {
    return KIT.buildTileAsync(group, ctx, list, { colliders: COLLIDERS }).then(done).catch((e) => { console.warn('[fk] build', ctx.key, e); });
  }
  done(KIT.buildTile(group, ctx, list, { colliders: COLLIDERS }));
}
