// AR32 part (city/areas.js): 125th St, Frederick Douglass to Adam Clayton Powell Boulevard (the Apollo). The State
// Office Building's plaza, the vendors and the Studio Museum moved to w125cb.js on 2026-09-30 (AR33, docs/notes/ar33.md).
// Hooks, all optional (the contracts are in city/centralPark.js):
// apply(tile, ox, oz), skipBuilding(cx, cz, h, area), dropFurniture(wx, wz, f), furniture(), build(group, ctx),
// promenades(), seats(). Notes, measurements and sources: docs/notes/area-w125c.md. `?ar32c=0` restores the compiled
// street (and the Apollo's old decorate builder, see the AR32C block in shared/landmarkSpec.js).
//
// The Apollo Theater (253 W 125th St): its terracotta front, the marquee with the reader boards, the crest and the blue
// tubes, the blade sign and the rooftop sign frame (city/w125cKit.js), built from the one tile that holds the frontage's
// west end, in the frame of the compiled frontage (w125cData.js APOLLO) on the pavement the tile samples there.
// Hotel Theresa and the State Office Building keep their compiled massing; the landmark placements that put their
// decorate builders on the right footprints are read-time overrides in shared/landmarkSpec.js (AR32C block 2).
import * as THREE from 'three';
import { APOLLO, STREET } from './w125cData.js';
import { addApollo } from './w125cKit.js';

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
export const AR32C = !(Q && (Q.get('ar32c') === '0' || Q.get('ar32') === '0'));
// AR33 (docs/notes/ar33-bid2.md): the facade kit builds the Apollo from its spec (fk/specs/bid2.js, custom 'bid2:apollo'
// in fk/custom/bid2.js, from the measured front). This part's AR32 front only draws when the kit is off for bid2
// (?ar33=0, ?fk=0, or ?fk=<segments without bid2>), so the two never stand in the same place.
const FKQ = Q ? Q.get('fk') : null;
const FK_BID2 = !(Q && (Q.get('ar33') === '0' || FKQ === '0' || (FKQ && FKQ !== '1' && !FKQ.split(',').map((s) => s.trim()).includes('bid2'))));
const inTile = (x, z, ox, oz) => x >= ox && x < ox + 512 && z >= oz && z < oz + 512;

const SW = (t, b) => [STREET.o[0] + STREET.u[0] * t + STREET.n[0] * b, STREET.o[1] + STREET.u[1] * t + STREET.n[1] * b];

// the compiled awnings on the Apollo's frontage (kind 16, mounted at 6.8-7.2 m): their skirts hung below the marquee's
// soffit in the r2 stills
export function dropFurniture(wx, wz, f) {
  if (!AR32C || FK_BID2 || f.k !== 16) return false;
  const dx = wx - STREET.o[0], dz = wz - STREET.o[1];
  const t = dx * STREET.u[0] + dz * STREET.u[1], b = dx * STREET.n[0] + dz * STREET.n[1];
  return t > -7.6 && t < 7.6 && b > -1.5 && b < 5.5;
}
export function build(group, ctx) {
  if (!AR32C || FK_BID2) return;
  const { ox, oz } = ctx;
  if (inTile(APOLLO.w[0], APOLLO.w[1], ox, oz)) buildApollo(group, ctx);
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
