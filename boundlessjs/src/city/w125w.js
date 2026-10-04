// AR32 part (city/areas.js): W 125th St, the west: Dinosaur Bar-B-Que at 12th Avenue, the Riverside Drive viaduct, Manhattanville,
// the 1 train's viaduct at Broadway, to Amsterdam Avenue. Hooks, all optional (the contracts are in city/centralPark.js):
// apply(tile, ox, oz), skipBuilding(cx, cz, h, area), dropFurniture(wx, wz, f), furniture(), build(group, ctx),
// promenades(), seats().
// Built here (docs/notes/area-w125w.md; positions from OpenStreetMap, city/w125wData.js; pieces in city/w125wKit.js):
//   * Dinosaur Bar-B-Que (700 W 125th St): the compiled box is replaced by the brick building with its storefront bays,
//     red awning, steel-sash windows lit after dark and the red neon roof signs over W 125th St and Twelfth Avenue;
//   * the Riverside Drive Viaduct (1900) over W 125th St: steel bents and arched ribs, the long arch on granite piers;
//   * the Manhattan Valley Viaduct's parabolic arch over W 125th St at Broadway (city/elevatedKit.js leaves out its four
//     plain bents in the arch's span, AR32W block there) and the 125th Street station's platforms, canopies, station
//     house and stairs.
// Each structure is built whole by the one tile that holds its anchor, one mesh per material. `?ar32w=0` leaves it out.
import { AR32W, DINO, RSD, MVV, COLUMBIA, COTTON, FENCE23, SETTS } from './w125wData.js';
import { dinoBuild, rsdBuild, mvvBuild, glassBuild, cottonBuild, w125wColliders, fenceBuild, settsBuild } from './w125wKit.js';

const owns = (ox, oz, x, z) => x >= ox && x < ox + 512 && z >= oz && z < oz + 512;
// AR33: a structure the viaduct part (vk/viaducts.js) has taken over ('rsd', 'mvv') is left to it
const vkHas = (k) => !!(globalThis.__AR33VK && globalThis.__AR33VK.has(k));
// AR33: a building the facade kit rebuilds from a spec (fk/specs/west.js: the Dinosaur 'w125-700', the Forum 'w125-forum')
// is left to it, unless the kit itself failed to load (then the AR32 build stays)
const fkHas = (id) => { const F = globalThis.__FK; if (!F || !F.SPECS) return false; if ((F.STATS && F.STATS.errors || []).some((e) => /^kit/.test(String(e)))) return false; return F.SPECS.some((S) => S.spec && S.spec.id === id && !S.spec.skip); };
const COL_FK = { 'The Forum': 'w125-forum', 'Henry R. Kravis Hall': 'w125-kravis', 'David Geffen Hall': 'w125-geffen' };
const COL_H = new Map();
const _coll = new Set();   // walker obstacles are added once per structure
const once = (k, f) => { if (_coll.has(k)) return; _coll.add(k); try { f(); } catch (e) { console.warn('[ar32w] colliders', e); } };
const RSD_ANCHOR = [RSD.A[0] + RSD.dir[0] * RSD.x125, RSD.A[1] + RSD.dir[1] * RSD.x125];

export function skipBuilding(cx, cz, h, area) {
  if (!AR32W) return false;
  // the compiled Dinosaur Bar-B-Que box (centroid (862.5, -3877.2), 1,135 m2, 8.1 m)
  if (Math.hypot(cx - DINO.centroid[0], cz - DINO.centroid[1]) < 6 && Math.abs(area - DINO.area) < 150) return !fkHas('w125-700');
  // Columbia's stone boxes, rebuilt as curtain walls at the compiled height (kept here for build())
  for (const b of COLUMBIA) if (Math.hypot(cx - b.c[0], cz - b.c[1]) < 6 && Math.abs(area - b.area) < 0.2 * b.area) { if (fkHas(COL_FK[b.name])) return false; COL_H.set(b.name, h); return true; }
  return false;
}

export function build(group, ctx) {
  if (!AR32W) return;
  const gyAt = (x, z) => { const y = ctx.sampleT(x, z); return Number.isFinite(y) ? Math.max(y, 3.24) : 3.24; };
  const walkY = (x, z) => { let y = null; try { y = ctx.padYNear ? ctx.padYNear(x, z) : null; } catch { y = null; } return Number.isFinite(y) ? y : gyAt(x, z) + 0.28; };
  if (!fkHas('w125-700') && owns(ctx.ox, ctx.oz, DINO.centroid[0], DINO.centroid[1])) {
    try { const t = dinoBuild(group, walkY(DINO.centroid[0], DINO.centroid[1])); console.log(`[ar32w] Dinosaur Bar-B-Que: ${t} triangles`); once('dino', () => w125wColliders('dino', walkY(DINO.centroid[0], DINO.centroid[1]))); } catch (e) { console.warn('[ar32w] Dinosaur Bar-B-Que', e); }
  }
  if (!vkHas('rsd') && owns(ctx.ox, ctx.oz, RSD_ANCHOR[0], RSD_ANCHOR[1])) {
    try { const t = rsdBuild(group, gyAt(RSD_ANCHOR[0], RSD_ANCHOR[1]) + 0.14); console.log(`[ar32w] Riverside Drive Viaduct: ${t} triangles`); once('rsd', () => w125wColliders('rsd', gyAt(RSD_ANCHOR[0], RSD_ANCHOR[1]) + 0.14)); } catch (e) { console.warn('[ar32w] Riverside Drive Viaduct', e); }
  }
  for (const b of COLUMBIA) {
    if (!owns(ctx.ox, ctx.oz, b.c[0], b.c[1]) || !COL_H.has(b.name)) continue;
    try { const t = glassBuild(group, b, walkY(b.c[0], b.c[1]) - 0.1, COL_H.get(b.name)); console.log(`[ar32w] ${b.name}: ${t} triangles`); } catch (e) { console.warn('[ar32w] ' + b.name, e); }
  }
  if (!fkHas('w125-656') && owns(ctx.ox, ctx.oz, COTTON.c[0], COTTON.c[1])) {
    try { cottonBuild(group, walkY(COTTON.c[0], COTTON.c[1])); } catch (e) { console.warn('[ar32w] Cotton Club', e); }
  }
  // AR34 w2b3: the 2023 construction hoarding in front of Kravis Hall (kravis23); `?w33fence=0` leaves it out
  if (FENCE23.on && owns(ctx.ox, ctx.oz, FENCE23.o[0], FENCE23.o[1])) {
    try { const t = fenceBuild(group, walkY); console.log(`[ar32w] 2023 hoarding: ${t} triangles`); once('fence23', () => w125wColliders('fence23', walkY(FENCE23.o[0], FENCE23.o[1]))); } catch (e) { console.warn('[ar32w] hoarding', e); }
  }
  // AR34 w2 s3: the granite setts band across the Twelfth Avenue plaza (the compiled tile's sunken strip); `?w33setts=0` off
  if (SETTS.on && owns(ctx.ox, ctx.oz, SETTS.rows[0][1], SETTS.rows[0][0])) {
    try { const t = settsBuild(group); console.log(`[ar32w] plaza setts: ${t} triangles`); } catch (e) { console.warn('[ar32w] plaza setts', e); }
  }
  if (!vkHas('mvv') && owns(ctx.ox, ctx.oz, MVV.C[0], MVV.C[1])) {
    try { const t = mvvBuild(group, gyAt(MVV.C[0], MVV.C[1]) + 0.14); console.log(`[ar32w] Manhattan Valley arch and station: ${t} triangles`); once('mvv', () => w125wColliders('mvv', gyAt(MVV.C[0], MVV.C[1]) + 0.14)); } catch (e) { console.warn('[ar32w] Manhattan Valley arch', e); }
  }
}
