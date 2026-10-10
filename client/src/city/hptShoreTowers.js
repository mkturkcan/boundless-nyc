// AR33 HPT: real balconies on the compiled towers round Gantry Plaza State Park (docs/notes/ar33-hpt.md). The compiled towers are
// extruded footprints with a shader facade;
// staggered cantilevered concrete balcony slabs with frameless glass guards over a window wall on a tan brick podium. This adds
// those slabs to the park-facing edges of the compiled towers: per floor above the podium, 2.6 x 1.5 m slabs (0.22 m thick)
// every ~7 m along each edge, staggered floor to floor, each with a glass guard across its front and a dark edge strip.
// Pure geometry (Builders, node tests import towerDressGeo); the scene assembly is at the end.
import * as THREE from 'three';
import { Builder, X1, Y1 } from './hptSignSteel.js';
import { hmat } from './hptSignMats.js';
import { nightDim } from './hptSignBuild.js';
import { ENV } from '../world/materials.js';
import { TOWER_RINGS } from './hptShoreTowersData.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RIVER = [-0.936, -0.352];
const inPoly = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { if ((P[i][1] > z) !== (P[j][1] > z) && x < ((P[j][0] - P[i][0]) * (z - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; } return c; };
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// podium: floors left plain (the brick base); face: the minimum dot of an edge's outward normal with the river direction
export function towerDressGeo(T, { podium = 3, face = 0.2, pitch = 7.0, slabW = 2.6, slabD = 1.5 } = {}) {
  const slab = new Builder(), glass = new Builder(), edge = new Builder();
  const ring = T.ring, n = ring.length, fh = T.h / T.floors;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 6) continue;
    const ux = dx / L, uz = dz / L;
    let nx = uz, nz = -ux;                                     // a normal; outward is the side outside the ring
    if (inPoly((a[0] + b[0]) / 2 + nx * 0.6, (a[1] + b[1]) / 2 + nz * 0.6, ring)) { nx = -nx; nz = -nz; }
    if (nx * RIVER[0] + nz * RIVER[1] < face) continue;       // only the park-facing edges
    const U = V(ux, 0, uz), N = V(nx, 0, nz);
    const nb = Math.max(1, Math.floor((L - 3.2) / pitch));
    for (let k = podium; k < T.floors; k++) {
      const y = T.base + k * fh;
      const shift = ((k * 7) % 3) * (pitch / 3);
      for (let j = 0; j < nb; j++) {
        const s = 1.6 + slabW / 2 + j * pitch + shift;
        if (s + slabW / 2 > L - 1.4) continue;
        if (hash(k * 131 + i, j + 7) < 0.12) continue;           // a few floors without one
        const cx = a[0] + ux * s + nx * (slabD / 2 + 0.03), cz = a[1] + uz * s + nz * (slabD / 2 + 0.03);
        slab.box([cx, y - 0.11, cz], slabW / 2, 0.11, slabD / 2, U, Y1, N);
        // the guard: frameless glass 1.05 m across the front, 0.8 m returns at the sides; a dark edge strip under the slab lip
        const fx = cx + nx * (slabD / 2 - 0.05), fz = cz + nz * (slabD / 2 - 0.05);
        glass.box([fx, y + 0.52, fz], slabW / 2 - 0.04, 0.52, 0.012, U, Y1, N);
        for (const sgn of [-1, 1]) glass.box([cx + ux * sgn * (slabW / 2 - 0.05), y + 0.52, cz + uz * sgn * (slabW / 2 - 0.05)], 0.012, 0.52, slabD / 2 - 0.05, U, Y1, N);
        edge.box([fx, y + 1.07, fz], slabW / 2 - 0.02, 0.022, 0.03, U, Y1, N);
        count++;
      }
    }
  }
  return { slab, glass, edge, count };
}

// materials
// the fragment's final colour scaled after dusk (k at full night; the sign's neon ramp, kNight 0.12 -> 0.5)
function nightOut(mat, key, k) {
  const prev = mat.onBeforeCompile, pk = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.kNight = ENV.night;
    if (!/uniform float kNight;/.test(sh.fragmentShader)) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float kNight;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', `gl_FragColor.rgb *= mix(1.0, ${k.toFixed(3)}, clamp((kNight - 0.12) / 0.38, 0.0, 1.0));\n#include <fog_fragment>`);
  };
  mat.customProgramCacheKey = () => (pk ? pk() : '') + '|' + key;
  mat.needsUpdate = true;
  return mat;
}
let _M = null;
function tMats() {
  if (_M) return _M;
  // AR34 b5: the slabs and their edge strips dimmed after dusk to 0.3 of their albedo (night photograph 46 at 1:1: the balconies
  // are not seen at night, the twin's read as pale grey boxes (130, 126, 104) over the dark glass; client/shots/ar34/hpt/b5_n0)
  // (b5_n1: the albedo's dim alone left the guards as pale boxes, their sheen is the environment's: the guards' and the slabs'
  // final colour is scaled too, to 0.3 at full night)
  const slab = nightOut(nightDim(hmat('towerSlab'), 'tsD5', 0.3), 'tsO5', 0.3), rail = nightOut(nightDim(hmat('railPale'), 'trD5', 0.3), 'trO5', 0.3);
  const glass = nightOut(new THREE.MeshStandardMaterial({ color: 0xb4cdd2, roughness: 0.06, metalness: 0.0, transparent: true, opacity: 0.32, depthWrite: false }), 'tgO5', 0.25);
  return (_M = { slab, rail, glass });
}
const inTile = (ox, oz, x, z) => x >= ox && x < ox + 512 && z >= oz && z < oz + 512;
// dress the towers whose centroid lies in the tile
export function buildTowerDress(group, ox, oz) {
  const M = tMats(), slab = new Builder(), glass = new Builder(), edge = new Builder();
  let towers = 0, count = 0;
  for (const T of TOWER_RINGS) {
    if (!inTile(ox, oz, T.cx, T.cz)) continue;
    const g = towerDressGeo(T, { podium: T.podium ?? 3, face: T.face ?? 0.2 });
    slab.append(g.slab, new THREE.Matrix4()); glass.append(g.glass, new THREE.Matrix4()); edge.append(g.edge, new THREE.Matrix4());
    towers++; count += g.count;
  }
  if (!towers) return null;
  const out = new THREE.Group(); out.name = 'ar33h:towerDress';
  const mk = (B, mat, name, cast) => { const m = new THREE.Mesh(B.geometry(), mat); m.name = 'ar33h:towers:' + name; m.castShadow = cast; m.receiveShadow = true; if (mat === M.glass) m.renderOrder = 2; out.add(m); };
  mk(slab, M.slab, 'slabs', false); mk(glass, M.glass, 'guards', false); mk(edge, M.rail, 'rails', false);
  group.add(out);
  return { towers, balconies: count, tris: slab.tris + glass.tris + edge.tris };
}
