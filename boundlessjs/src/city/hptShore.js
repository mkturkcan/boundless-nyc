// AR32 part (city/areas.js): Hunters Point's waterfront: the Center Boulevard towers, Hunters Point South Park, the piers
// and the ferry landing, and life on the East River. Hooks, all optional (the contracts are in city/centralPark.js):
// apply(tile, ox, oz), skipBuilding(cx, cz, h, area), dropFurniture(wx, wz, f), furniture(), build(group, ctx),
// promenades(), seats(). Sub-flag `?ar32h=0`. Notes: docs/notes/area-hptShore.md.
import { buildFleet, buildSeawallRail, buildLanding } from './hptShoreKit.js';
import { HPT_COURSES, HPT_FLEET, HPT_SEAWALL, HPT_LANDING } from './hptShoreData.js';
import { buildTowerDress } from './hptShoreTowers.js';
import { hpMatsReady } from './hptSignMats.js';

// AR33: the PBR library's module is in before the first tile builds; `?hptTow=0` leaves the towers as compiled
export const ready = hpMatsReady;
const TOWERS = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('hptTow') === '0');

const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
export const AR32H = !(QS && QS.get('ar32h') === '0');
// the fleet's clock: `?hptT=<s>` at the moment its tile is built (130 s by default: a take with the recorder's default
// 300-step warm-up then opens at 140 s, two ferries crossing off Gantry Plaza, a tug off the Pepsi-Cola sign)
const T_OFF = QS && QS.get('hptT') !== null && isFinite(+QS.get('hptT')) ? +QS.get('hptT') : 130;
// `?hptAt=<s>` holds the fleet at that clock (stills)
const T_AT = QS && QS.get('hptAt') !== null && isFinite(+QS.get('hptAt')) ? +QS.get('hptAt') : null;
const RAIL = !!(QS && QS.get('hptRail') === '1');

// the fleet is built with the tile that holds Gantry Plaza's piers (1000, 4200): tile 1_8
const FLEET_AT = [1000, 4200];
const owns = (ox, oz, x, z) => x >= ox && x < ox + 512 && z >= oz && z < oz + 512;

export function build(group, ctx) {
  if (!AR32H) return;
  if (TOWERS) {
    try { const r = buildTowerDress(group, ctx.ox, ctx.oz); if (r) console.log(`[ar33h] tower balconies tile ${ctx.key}: ${r.towers} towers, ${r.balconies} balconies, ${r.tris} triangles`); } catch (e) { console.warn('[ar33h] tower dress', e); }
  }
  if (owns(ctx.ox, ctx.oz, FLEET_AT[0], FLEET_AT[1])) {
    try {
      const r = buildFleet(group, HPT_FLEET, HPT_COURSES, T_OFF, T_AT);
      console.log(`[ar32h] East River fleet: ${r.boats} boats, ${r.tris} triangles, ${r.lights} lights`);
      if (typeof window !== 'undefined') window.__HPT_FLEET = r;
    } catch (e) { console.warn('[ar32h] fleet', e); }
  }
  // the seawall's guardrail (the gangway's foot left open), on the compiled esplanade (its paved or planted sections, else
  // the tile's pad sampler). Off unless `?hptRail=1`: the compiled ground slopes to the water over its last terrain cell
  // (y 2.0-3.5 within 8 m of the OSM edge, none at all along 38 of the 68 edge segments; boundlessjs/tools/ar32 probe),
  // so the rail came out in pieces on a slope; it wants the esplanade re-kinded flat to the edge first (an apply hook).
  if (RAIL) {
    const ground = (x, z) => {
      for (const n of ['sidewalk', 'path', 'plaza', 'brick', 'grass']) { const y = ctx.sectionY?.(n, x, z, 0.2); if (y !== null && y !== undefined && isFinite(y)) return y; }
      const y = ctx.padYNear(x, z);
      return y !== null && isFinite(y) && y > 2 ? y : null;
    };
    try {
      const n = buildSeawallRail(group, HPT_SEAWALL, ctx.ox, ctx.oz, ground, [848.5, 4590.5, 2.6]);
      if (n) console.log(`[ar32h] seawall guardrail: ${n} posts in tile ${ctx.key}`);
    } catch (e) { console.warn('[ar32h] guardrail', e); }
  }
  // the ferry landing, from the tile that holds its shore end
  if (owns(ctx.ox, ctx.oz, HPT_LANDING.shore[0], HPT_LANDING.shore[1])) {
    try {
      const L = buildLanding(group, HPT_LANDING, ctx.padYNear(HPT_LANDING.shore[0] + 1.5, HPT_LANDING.shore[1] + 0.4));
      console.log(`[ar32h] Hunters Point South ferry landing: ${L.tris} triangles, the float's deck at ${L.yF}`);
    } catch (e) { console.warn('[ar32h] landing', e); }
  }
}
