// AR32 part (city/areas.js): 125th St, the middle: Amsterdam Avenue to Lenox Avenue (the Apollo, Hotel Theresa, the
// State Office Building, the Studio Museum). Hooks, all optional (the contracts are in city/centralPark.js):
// apply(tile, ox, oz), skipBuilding(cx, cz, h, area), dropFurniture(wx, wz, f), furniture(), build(group, ctx),
// promenades(), seats(). Notes, measurements and sources: docs/notes/area-w125c.md. `?ar32c=0` restores the compiled
// street (and the Apollo's old decorate builder, see the AR32C block in shared/landmarkSpec.js).
//
// The Apollo Theater (253 W 125th St): its terracotta front, the marquee with the reader boards, the crest and the blue
// tubes, the blade sign and the rooftop sign frame (city/w125cKit.js), built from the one tile that holds the frontage's
// west end, in the frame of the compiled frontage (w125cData.js APOLLO) on the pavement the tile samples there.
// The State Office Building's plaza is paved (apply: the compile left it bare terrain) and 125th Street's vendors' tables
// stand along its front and on the south sidewalk (w125cData.js SOB_PLAZA, VENDORS; walked round, COLLIDERS 'ar32c').
// The Studio Museum in Harlem's 2025 building replaces its compiled footprint (skipBuilding; w125cData.js STUDIO).
// Hotel Theresa and the State Office Building keep their compiled massing; the landmark placements that put their
// decorate builders on the right footprints are read-time overrides in shared/landmarkSpec.js (AR32C block 2).
import * as THREE from 'three';
import { APOLLO, STREET, SOB_PLAZA, VENDORS, STUDIO } from './w125cData.js';
import { addApollo, addPieces, vendorParts, addStudio } from './w125cKit.js';
import { COLLIDERS } from './colliders.js';

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
export const AR32C = !(Q && (Q.get('ar32c') === '0' || Q.get('ar32') === '0'));
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
// the plaza: one quad of sidewalk from the tile that holds its centre, 5 mm under the compiled sidewalk it overlaps at its
// edges (the compiled flags win there), at the level of the north sidewalk in front of it
export function apply(tile, ox, oz) {
  if (!AR32C) return;
  const P = SOB_PLAZA, [cx, cz] = SW((P.t0 + P.t1) / 2, (P.b0 + P.b1) / 2);
  if (!inTile(cx, cz, ox, oz)) return;
  const [kx, kz] = SW((P.t0 + P.t1) / 2, 3.0);
  const y = (secY(tile, 'sidewalk', ox, oz, kx, kz) ?? 3.52) - 0.005;
  const A = SW(P.t0, P.b0), B = SW(P.t1, P.b0), C = SW(P.t1, P.b1), D = SW(P.t0, P.b1);
  const tri = (p, q, r) => {   // wound to face up (x east, z south: (q - p) x (r - p) has +y)
    const up = (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]) > 0;
    return (up ? [p, q, r] : [p, r, q]).flatMap((v) => [v[0] - ox, y, v[2] - oz]);
  };
  const v = (w) => [w[0], y, w[1]];
  const add = [...tri(v(A), v(B), v(C)), ...tri(v(A), v(C), v(D))];
  tile.S.sidewalk = tile.S.sidewalk && tile.S.sidewalk.length ? Float32Array.from([...tile.S.sidewalk, ...add]) : Float32Array.from(add);
}

// the compiled awnings on the Apollo's frontage (kind 16, mounted at 6.8-7.2 m): their skirts hung below the marquee's
// soffit in the r2 stills
export function dropFurniture(wx, wz, f) {
  if (!AR32C || f.k !== 16) return false;
  const dx = wx - STREET.o[0], dz = wz - STREET.o[1];
  const t = dx * STREET.u[0] + dz * STREET.u[1], b = dx * STREET.n[0] + dz * STREET.n[1];
  return t > -7.6 && t < 7.6 && b > -1.5 && b < 5.5;
}
// the Studio Museum's compiled footprint (#378): the part builds the building itself
export function skipBuilding(cx, cz, h, area) {
  if (!AR32C) return false;
  const K = STUDIO.skip;
  return Math.abs(cx - K.cx) < 2 && Math.abs(cz - K.cz) < 2 && Math.abs(area - K.area) < 60;
}
let _studioColl = false;
function buildStudio(group, ctx) {
  const [wx, wz] = STUDIO.w, [ex, ez] = STUDIO.e;
  const W = Math.hypot(wx - ex, wz - ez), ux = (wx - ex) / W, uz = (wz - ez) / W;   // east end -> west end
  const nx = uz, nz = -ux;                                   // out onto 125th Street (29 deg): +x = (nz, -nx) = u
  const y0 = ctx.padYNear((wx + ex) / 2 + nx * 0.8, (wz + ez) / 2 + nz * 0.8);
  const ry = Math.atan2(nx, nz);
  const place = new THREE.Matrix4().compose(new THREE.Vector3(ex, y0, ez), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
  const tris = addStudio(group, W, STUDIO.D, STUDIO.H, STUDIO, place);
  if (!_studioColl) {
    _studioColl = true;
    const c = new THREE.Vector3(W / 2, STUDIO.H / 2, -STUDIO.D / 2).applyMatrix4(place);
    COLLIDERS.addBox('ar32c', { x: c.x, y: c.y, z: c.z, hw: W / 2, hh: STUDIO.H / 2, hd: STUDIO.D / 2, rotY: ry });
  }
  if (typeof window !== 'undefined') window.__AR32C = { ...(window.__AR32C || {}), studio: { tris, W, y0 } };
}

const _vendColl = new Set();
export function build(group, ctx) {
  if (!AR32C) return;
  const { ox, oz } = ctx;
  if (inTile(APOLLO.w[0], APOLLO.w[1], ox, oz)) buildApollo(group, ctx);
  if (inTile(STUDIO.e[0], STUDIO.e[1], ox, oz)) buildStudio(group, ctx);
  const pieces = [];
  VENDORS.forEach(([t, b, face, kind], i) => {
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

function buildApollo(group, ctx) {
  const [wx, wz] = APOLLO.w, [ex, ez] = APOLLO.e;
  const W = Math.hypot(ex - wx, ez - wz), ux = (ex - wx) / W, uz = (ez - wz) / W;
  const nx = -uz, nz = ux;                                   // out over the sidewalk (209 deg)
  const mx = (wx + ex) / 2 + nx * 0.8, mz = (wz + ez) / 2 + nz * 0.8;
  const y0 = ctx.padYNear(mx, mz);                           // the pavement in front (3.52 in the compile)
  const place = new THREE.Matrix4().compose(new THREE.Vector3(wx, y0, wz),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(nx, nz)), new THREE.Vector3(1, 1, 1));
  const r = addApollo(group, W, place, y0);
  if (typeof window !== 'undefined') window.__AR32C = { ...(window.__AR32C || {}), apollo: { ...r, y0, W } };
}
