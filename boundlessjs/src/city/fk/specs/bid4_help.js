// AR33 BID4 spec helpers (shared by specs/bid4.js, bid4_north.js, bid4_south.js). Owner: the BID4 worker (docs/notes/ar33-bid4.md).

// a shop bay: glazing, a recessed door, a roll-down gate box; `o` overrides any field
export const shop = (u0, u1, o = {}) => ({
  kind: 'store', u0, u1, h: 3.3,
  glazing: { bulkhead: 0.45, transom: 0.5, mullions: 2, frame: 'alu_bronze', ...(o.glazing || {}) },
  door: o.door === null ? null : { u: 0.5, w: 1.0, kind: 'glass', recess: 0.9, ...(o.door || {}) },
  gate: { kind: 'rolldown', box: true, color: '#8e9396', ...(o.gate || {}) },
  interior: 'shop_clothing', ...Object.fromEntries(Object.entries(o).filter(([k]) => !['glazing', 'door', 'gate'].includes(k))),
});
// a fascia sign filling a bay's signband: panel, bg and fg colours
export const fascia = (u0, u1, y, h, text, o = {}) => ({ kind: 'panel', text, font: 'Inter-700', fg: '#ffffff', bg: '#1d1d1f', u0, u1, y, h, depth: 0.1, ...o });
// a window type (double-hung unless `kind`)
export const win = (w, h, sill, o = {}) => ({ w, h, sill, kind: 'dh', lights: '1/1', frame: 'alu_black', reveal: 0.14,
  lintel: { kind: 'flat', mat: 'cast_stone', tint: '#cfc6b4', h: 0.2 }, sillStone: { mat: 'cast_stone', tint: '#cfc6b4', h: 0.1, proj: 0.05 },
  ac: 0.12, blinds: 0.5, lit: 0.3, ...o });
// bay widths from a nested list: [1.6, [2.2, 2.2], 1.5] -> [1.6, 2.2, 2.2, 1.5]
export const widths = (list) => list.flat();
// n windows at the centres `cs` (width w): `open` entries of a floor for window type `win`, glass `sill` above the floor line and `h` high
export const cols = (cs, w, win, sill, h) => cs.map((c) => ({ u0: +(c - w / 2).toFixed(3), u1: +(c + w / 2).toFixed(3), win, sill, h }));
// a storefront-less upper face run: n floors of h, all with window `w`
export const floorsOf = (n, h, w, extra = {}) => [{ n, h, win: w, ...extra }];

import RINGS from './bid4_rings.js';
// refit(id, u0, u1, front): the compiled footprint of lot `id` with its street wall moved to span [u0, u1] along the wall (u from the lot's b end, the kit's origin), the rear following:
// every vertex is moved along the wall by the same linear map (a shift and a stretch), so the side walls stay square to the street; `front` (m) moves the street wall that far
// towards the street (the rear stays where it is, the depth is stretched linearly): 20 W's compiled wall stands 2 m behind its neighbours', its elevation shows it flush
export function refit(id, u0, u1, front = 0) {
  const R = RINGS[id];
  if (!R) return null;
  const [ax, az] = R.a, [bx, bz] = R.b, L = Math.hypot(ax - bx, az - bz), ux = (ax - bx) / L, uz = (az - bz) / L;
  // the street is on the side the ring is not: the normal pointing away from the ring's centre
  let cx = 0, cz = 0; for (const [x, z] of R.ring) { cx += x; cz += z; } cx /= R.ring.length; cz /= R.ring.length;
  let nx = -uz, nz = ux; if ((cx - bx) * nx + (cz - bz) * nz > 0) { nx = -nx; nz = -nz; }
  const dd = (x, z) => -((x - bx) * nx + (z - bz) * nz);   // distance behind the wall line
  const dmax = Math.max(...R.ring.map(([x, z]) => dd(x, z)), 1);
  return R.ring.map(([x, z]) => {
    const u = (x - bx) * ux + (z - bz) * uz, d = u0 + ((u1 - u0) * u) / L - u, f = front * (1 - Math.max(0, dd(x, z)) / dmax);
    return [+(x + d * ux + f * nx).toFixed(2), +(z + d * uz + f * nz).toFixed(2)];
  });
}
