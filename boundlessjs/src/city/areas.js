// AR32 — detailed areas beyond Central Park (owner 2026-09-30: "125th street from Dinosaur BBQ all the way to the east,
// and the pepsi-cola sign area in Hunter's point; these two will have their own teaser"). Each area part is its own
// module with its own notes (docs/notes/area-<part>.md), gathered here for world/assemble.js and sim/peds.js on the same
// hook contract as city/centralPark.js (read its comments for each hook):
//   w125w.js   W 125th St, the west: Dinosaur Bar-B-Que at 12th Avenue, the Riverside Drive viaduct, Manhattanville,
//              the 1 train's Manhattan Valley viaduct at Broadway, to Amsterdam Avenue
//   w125c.js   125th St, the middle: Amsterdam Avenue to Lenox Avenue (the Apollo, Hotel Theresa, the State Office
//              Building, the Studio Museum, Frederick Douglass and Adam Clayton Powell Boulevards)
//   w125e.js   E 125th St, the east: Lenox Avenue to the East River (Fifth, Madison, the Park Avenue viaduct and the
//              Metro-North station, Lexington, Third, Second, the RFK Bridge's approaches, First Avenue)
//   hptSign.js Hunters Point, Queens: the Pepsi-Cola sign, the gantries and Gantry Plaza State Park
//   hptShore.js Hunters Point's waterfront: the Center Boulevard towers, Hunters Point South Park, the piers and the ferry
// Every hook is optional in a part; a part that throws is logged (`[ar32] part.hook`) and skipped. `?ar32=0` restores
// the compiled city in all of them; each part has its own sub-flag.
import * as w125w from './w125w.js';
import * as w125c from './w125c.js';
import * as w125e from './w125e.js';
import * as hptSign from './hptSign.js';
import * as hptShore from './hptShore.js';

export const AR32 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('ar32') === '0');
// [name, module, world box x0, z0, x1, z1]: a tile outside a part's box never asks that part
const PARTS = [
  ['w125w', w125w, 600, -4400, 1900, -2800],
  ['w125c', w125c, 1450, -3650, 2500, -2350],
  ['w125e', w125e, 2050, -3050, 3750, -1450],
  ['hptShore', hptShore, 350, 3250, 1850, 5350],
  ['hptSign', hptSign, 350, 3250, 1850, 5350],
];
const warn = (part, hook, e) => console.warn(`[ar32] ${part}.${hook}`, e);
const hitTile = (P, ox, oz) => ox < P[4] && ox + 512 > P[2] && oz < P[5] && oz + 512 > P[3];
const hitPt = (P, x, z) => x > P[2] && x < P[4] && z > P[3] && z < P[5];
export const areaTileHit = (ox, oz) => AR32 && PARTS.some((P) => hitTile(P, ox, oz));

export function areaApply(tile, ox, oz) {
  if (!AR32) return;
  for (const P of PARTS) { if (P[1].apply && hitTile(P, ox, oz)) try { P[1].apply(tile, ox, oz); } catch (e) { warn(P[0], 'apply', e); } }
}
export function areaSkipBuilding(cx, cz, h, area) {
  if (!AR32) return false;
  for (const P of PARTS) { if (P[1].skipBuilding && hitPt(P, cx, cz)) try { if (P[1].skipBuilding(cx, cz, h, area)) return true; } catch (e) { warn(P[0], 'skipBuilding', e); } }
  return false;
}
export function areaDropFurniture(wx, wz, f) {
  if (!AR32) return false;
  for (const P of PARTS) { if (P[1].dropFurniture && hitPt(P, wx, wz)) try { if (P[1].dropFurniture(wx, wz, f)) return true; } catch (e) { warn(P[0], 'dropFurniture', e); } }
  return false;
}
// world records { k, x, z, y?, rot, p0, p1, p2 } from each part (cached by the part); those in this tile come back
// tile-local, y from the ground when left out
export function areaFurniture(ox, oz) {
  if (!AR32) return [];
  const out = [];
  for (const P of PARTS) {
    if (!P[1].furniture || !hitTile(P, ox, oz)) continue;
    let recs;
    try { recs = P[1].furniture() || []; } catch (e) { warn(P[0], 'furniture', e); continue; }
    for (const r of recs) {
      if (r.x < ox || r.x >= ox + 512 || r.z < oz || r.z >= oz + 512) continue;
      out.push({ k: r.k, x: r.x - ox, y: r.y ?? null, z: r.z - oz, rot: r.rot || 0, p0: r.p0 || 0, p1: r.p1 || 0, p2: r.p2 || 0, ar: true });
    }
  }
  return out;
}
export function areaBuild(group, ctx) {
  if (!AR32) return;
  for (const P of PARTS) { if (P[1].build && hitTile(P, ctx.ox, ctx.oz)) try { P[1].build(group, ctx); } catch (e) { warn(P[0], 'build', e); } }
}
export function areaPromenades() {
  if (!AR32) return [];
  const out = [];
  for (const P of PARTS) { if (P[1].promenades) try { out.push(...(P[1].promenades() || [])); } catch (e) { warn(P[0], 'promenades', e); } }
  return out;
}
export function areaSeats() {
  if (!AR32) return [];
  const out = [];
  for (const P of PARTS) { if (P[1].seats) try { out.push(...(P[1].seats() || [])); } catch (e) { warn(P[0], 'seats', e); } }
  return out;
}
