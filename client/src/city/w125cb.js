// AR32 part (city/areas.js): 125th St, Adam Clayton Powell Boulevard to Lenox Avenue, split out of w125c.js on
// 2026-09-30 (AR33: docs/notes/ar33.md): the State Office Building's plaza and 125th Street's vendors along its front and
// on the south sidewalk. Owner: the BID3 worker (docs/notes/ar33-bid3.md). The plaza (paving, the crescent band, the
// serpentine planters, benches, bollards, flagpoles, lamps and The Higher Ground) is built by w125cbKit.js off
// w125cbData.js (re-measured 2026-09-30); the vendors' tables are still drawn by w125cKit.js's vendorParts (BID2's file,
// imported unchanged). The Studio Museum is a facade-kit spec (fk/specs/bid3.js w125-144). `?ar32c=0` restores the
// compiled street here too; `?b3plaza=0` leaves out the plaza's furniture and paving (the paved ground stays).
import * as THREE from 'three';
import { STREET, PLAZA, VENDORS } from './w125cbData.js';
import { addPieces, vendorParts } from './w125cKit.js';
import { plazaMeshes } from './w125cbKit.js';
import { COLLIDERS } from './colliders.js';
import { LK } from './lk/life.js';   // the LIFE part draws 125th Street's vendors (docs/notes/ar34-req/BID3.md, LIFE 18:45); ?lk=0 brings these back

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
export const AR32C = !(Q && (Q.get('ar32c') === '0' || Q.get('ar32') === '0'));
const B3PLAZA = !(Q && Q.get('b3plaza') === '0');
const inTile = (x, z, ox, oz) => x >= ox && x < ox + 512 && z >= oz && z < oz + 512;

const SW = (t, b) => [STREET.o[0] + STREET.u[0] * t + STREET.n[0] * b, STREET.o[1] + STREET.u[1] * t + STREET.n[1] * b];

// the height of a compiled ground section under (x, z) (world), or null
function secY(tile, name, ox, oz, x, z) {
  const a = tile.S[name]; if (!a) return null;
  for (let o = 0; o + 8 < a.length; o += 9) {
    const x0 = a[o] + ox, z0 = a[o + 2] + oz, x1 = a[o + 3] + ox, z1 = a[o + 5] + oz, x2 = a[o + 6] + ox, z2 = a[o + 8] + oz;
    const d = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2); if (Math.abs(d) < 1e-9) continue;
    const l0 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / d, l1 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / d, l2 = 1 - l0 - l1;
    if (l0 >= -1e-3 && l1 >= -1e-3 && l2 >= -1e-3) return l0 * a[o + 1] + l1 * a[o + 4] + l2 * a[o + 7];
  }
  return null;
}
// the plaza's ground: quads of sidewalk from the tile that holds the plaza's front centre, 5 mm under the compiled
// sidewalk they overlap at their edges (the compiled flags win there), at the level of the north sidewalk in front of it
const P0 = PLAZA.quads[0];
const PC = SW((P0[0] + P0[1]) / 2, (P0[2] + P0[3]) / 2);
let _plazaY = null;
export function apply(tile, ox, oz) {
  if (!AR32C) return;
  if (!inTile(PC[0], PC[1], ox, oz)) return;
  const [kx, kz] = SW((P0[0] + P0[1]) / 2, 3.0);
  const y = (secY(tile, 'sidewalk', ox, oz, kx, kz) ?? 3.52) - 0.005;
  _plazaY = y + 0.005;
  const tri = (p, q, r) => {   // wound to face up (x east, z south: (q - p) x (r - p) has +y)
    const up = (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]) > 0;
    return (up ? [p, q, r] : [p, r, q]).flatMap((v) => [v[0] - ox, y, v[2] - oz]);
  };
  const v = (w) => [w[0], y, w[1]];
  const add = [];
  for (const [t0, t1, b0, b1] of PLAZA.quads) {
    const A = SW(t0, b0), B = SW(t1, b0), C = SW(t1, b1), D = SW(t0, b1);
    add.push(...tri(v(A), v(B), v(C)), ...tri(v(A), v(C), v(D)));
  }
  tile.S.sidewalk = tile.S.sidewalk && tile.S.sidewalk.length ? Float32Array.from([...tile.S.sidewalk, ...add]) : Float32Array.from(add);
}

const _vendColl = new Set();
let _plazaColl = false;
export function build(group, ctx) {
  if (!AR32C) return;
  const { ox, oz } = ctx;
  // the plaza, from the tile that holds its front centre
  if (B3PLAZA && inTile(PC[0], PC[1], ox, oz)) {
    const y0 = _plazaY ?? ctx.padYNear(...SW((P0[0] + P0[1]) / 2, 3.0));
    const g = new THREE.Group(); g.name = 'b3:plaza';
    for (const m of plazaMeshes(y0)) g.add(m);
    group.add(g);
    if (!_plazaColl) {   // the monument's drum and its stainless form and the planters are walked round
      _plazaColl = true;
      const M = PLAZA.monument, [mx, mz] = SW(M.t, M.b), ra = (90 - M.az) * Math.PI / 180;
      const ax = [Math.sin(M.az * Math.PI / 180), -Math.cos(M.az * Math.PI / 180)], az = [-ax[1], ax[0]];   // the long axis, the street side
      COLLIDERS.addBox('ar32c', { x: mx, y: y0 + 0.25, z: mz, hw: M.drum[0] * 0.9, hh: 0.25, hd: M.drum[1] * 0.85, rotY: ra });
      const [fx, fz] = M.form.at;
      COLLIDERS.addBox('ar32c', { x: mx + ax[0] * fx + az[0] * fz, y: y0 + 2.0, z: mz + ax[1] * fx + az[1] * fz, hw: M.form.half[0], hh: 2.0, hd: M.form.half[1], rotY: ra });
      const ry = Math.atan2(STREET.n[0], STREET.n[1]);
      for (const [t0, t1, b] of PLAZA.planters) { const [x, z] = SW((t0 + t1) / 2, b); COLLIDERS.addBox('ar32c', { x, y: y0 + 0.5, z, hw: (t1 - t0) / 2, hh: 0.5, hd: 1.2, rotY: ry }); }
    }
    if (typeof window !== 'undefined') window.__B3 = { ...(window.__B3 || {}), plazaY: y0, plazaMeshes: g.children.length };
  }
  const pieces = [];
  if (!LK) VENDORS.forEach(([t, b, face, kind], i) => {
    const [x, z] = SW(t, b); if (!inTile(x, z, ox, oz)) return;
    const y = ctx.padYNear(x, z), fx = STREET.n[0] * face, fz = STREET.n[1] * face, ry = Math.atan2(fx, fz);
    const place = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
    pieces.push({ parts: vendorParts(kind, i + 1), place });
    if (!_vendColl.has(i)) {   // the table and the stool behind it, walked round
      _vendColl.add(i);
      COLLIDERS.addBox('ar32c', { x: x - fx * 0.3, y: y + 0.4, z: z - fz * 0.3, hw: 1.0, hh: 0.4, hd: 0.75, rotY: ry });
    }
  });
  if (pieces.length) addPieces(group, pieces, 'ar32c:vendors');
}
