// lmMet.js: the Metropolitan Museum's roofscape (CP33 landmarks round, 2026-10-01). Review of teaser 4 (t4Out): "the Met is a flat
// box with a flat green roof". The compiled record is one 63-sided ring of 45,000 m2 at 26.8 m whose whole roof was tagged a
// green roof, so from the air it is a single olive slab. The real roof is a patchwork: glazed ridge skylights over the galleries,
// pitched copper hips over the older wings, flat gravel between them with plant boxes. This decorate builder lays that patchwork
// on the ring on the avenue grid: a deck over the green slab, then per 32 x 46 m cell a skylight, a copper hip or plant.
import * as THREE from 'three';
import { KIT } from './landmarkKit.js';
import { Acc, box, capRing, loft, addMeshes, triCount, offsetRing, rng, ringOutSign } from './lmFacadeKit.js';
import { lotFrame } from './lmSteinway.js';
import { insideRing, insetRing, collapseShort, plazaMats } from './lmPlaza.js';

const { mat } = KIT;

let _MM = null;
function metMats() {
  if (_MM) return _MM;
  const P = plazaMats();
  _MM = {
    copper: P.copper,
    deck: mat(0x77746c, { rough: 0.96, flat: false }),
    plant: mat(0x8b8b86, { rough: 0.8, metal: 0.2, flat: true }),
    frame: mat(0x41454a, { rough: 0.5, metal: 0.6, flat: false }),
    glass: mat(0x5d788c, { rough: 0.25, metal: 0.3, flat: true, skyGlass: { f0: 0.16, rough: 0.05, tint: [0.94, 0.99, 1.03], aureole: 1.7, mullion: 1 } }),
    stone: P.stone,
  };
  return _MM;
}

// a roof body over a rectangle (base half-extents hu x hv, top half-extents tu x tv), turned by rot; plane faces + a flat top
function roofBody(acc, cx, cz, y0, hu, hv, h, rot, tu, tv, uvK = 0.5) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const Pp = (u, v, y) => [cx + u * c + v * s, y, cz - u * s + v * c];
  const base = [[-hu, -hv], [hu, -hv], [hu, hv], [-hu, hv]], top = [[-tu, -tv], [tu, -tv], [tu, tv], [-tu, tv]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const a = Pp(base[i][0], base[i][1], y0), b = Pp(base[j][0], base[j][1], y0), cc = Pp(top[j][0], top[j][1], y0 + h), d = Pp(top[i][0], top[i][1], y0 + h);
    const mu = (base[i][0] + base[j][0]) / 2, mv = (base[i][1] + base[j][1]) / 2, m = Math.hypot(mu, mv) || 1;
    const dir = Pp(mu / m, mv / m, 0), dx = dir[0] - cx, dz = dir[2] - cz;
    // run of this face: how far the top edge sits inboard of the base edge, along its outward direction
    const run = Math.abs(i % 2 === 0 ? hv - tv : hu - tu);
    const nrm = [dx * h, Math.max(run, 0.05), dz * h], nl = Math.hypot(...nrm);
    const Lb = Math.hypot(b[0] - a[0], b[2] - a[2]), Ls = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
    acc.quad(a, b, cc, d, [nrm[0] / nl, nrm[1] / nl, nrm[2] / nl], [0, 0], [Lb * uvK, 0], [Lb * uvK * 0.6, Ls * uvK], [Lb * uvK * 0.4, Ls * uvK]);
  }
  if (tu > 0.05 && tv > 0.05) acc.quad(Pp(top[0][0], top[0][1], y0 + h), Pp(top[1][0], top[1][1], y0 + h), Pp(top[2][0], top[2][1], y0 + h), Pp(top[3][0], top[3][1], y0 + h), [0, 1, 0]);
}

export function buildMetRoof(ctx) {
  const g = new THREE.Group();
  const src = ctx.footprint;
  if (!src || src.length < 4) return null;
  const M = metMats();
  const H = ctx.height || 26.8;
  const ring = (() => { const c = collapseShort(src, 3.5); return c.length >= 4 ? c : src; })();
  const F = lotFrame(ring);
  const DECK = new Acc(), COP = new Acc(), GLS = new Acc(), FRM = new Acc(), PLT = new Acc(), STN = new Acc();
  // the deck over the olive green-roof slab, 0.7 m up (inside the parapet; the compiled roof sits at ctx.height)
  const deckRing = insetRing(ring, 1.4) || ring;
  capRing(DECK, deckRing, H + 0.7, 0.1);
  // the grid: cells aligned with the avenue axis
  const CE = 32, CN = 46, rand = rng(44);
  let nSky = 0, nHip = 0, nPlant = 0;
  for (let e = F.e0 + CE / 2; e < F.e1; e += CE) {
    for (let n = F.n0 + CN / 2; n < F.n1; n += CN) {
      const hu = CE * 0.36, hv = CN * 0.36;
      const pts = [[0, 0], [hu, hv], [-hu, hv], [hu, -hv], [-hu, -hv], [hu, 0], [-hu, 0], [0, hv], [0, -hv]].map(([du, dv]) => F.P(e + du, n + dv));
      if (!pts.every((p) => insideRing(deckRing, p[0], p[1]))) continue;
      const [cx, cz] = F.P(e, n);
      const r = rand();
      if (r < 0.46) {                                                   // a glazed ridge skylight with its curb
        const su = 5.2 + rand() * 1.6, sv = 13 + rand() * 4;
        const yb = H + 0.7;
        box(FRM, cx, yb, cz, su * 2 + 0.6, 0.6, sv * 2 + 0.6, F.rot);
        roofBody(GLS, cx, cz, yb + 0.6, su, sv, 3.6, F.rot, 0.25, sv, 0.4);
        // glazing bars: a ridge and two rafters per side
        box(FRM, cx, yb + 0.6 + 3.5, cz, 0.35, 0.3, sv * 2, F.rot);
        for (const k of [-0.5, 0.5]) { const [bx, bz] = F.P(e + k * su * 0.9, n); box(FRM, bx, yb + 0.6 + 1.2, bz, 0.22, 0.2, sv * 2 - 0.4, F.rot); }
        nSky++;
      } else if (r < 0.64) {                                            // a pitched copper hip over an older wing
        const yb = H + 0.7;
        roofBody(COP, cx, cz, yb, hu * 1.05, hv * 1.05, 6.2, F.rot, hu * 0.22, hv * 0.55, 0.5);
        nHip++;
      } else if (r < 0.80) {                                            // plant: a pair of mechanical boxes
        const yb = H + 0.7;
        box(PLT, cx - 4, yb, cz, 7, 2.6, 6, F.rot);
        box(PLT, cx + 6, yb, cz + 3, 4, 3.4, 4.5, F.rot);
        nPlant++;
      }
    }
  }
  const list = [[DECK, M.deck, 'met-deck'], [COP, M.copper, 'met-copper'], [GLS, M.glass, 'met-skylights'], [FRM, M.frame, 'met-frames'], [PLT, M.plant, 'met-plant'], [STN, M.stone, 'met-stone']];
  addMeshes(g, list);
  g.userData.tris = triCount(list.map((m) => [m[0]]));
  g.userData.counts = { nSky, nHip, nPlant };
  return g;
}

// The Fifth Avenue front: the longest run of ring edges facing east-south-east (bearing 119 deg), as a point on the front line
// (at the centre of the run, on the median offset of its edges), the turn that puts local +z along the outward normal, and its length.
export function metFront(ring) {
  const s = ringOutSign(ring), n = ring.length;
  const NX = 0.8746, NZ = 0.4848;                       // outward normal of an avenue front facing the park side... (bearing 119: x east, z south)
  let sumL = 0, mu = 0, offs = [];
  const T = [-NZ, NX];                                   // along the front
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n], ex = b[0] - a[0], ez = b[1] - a[1], L = Math.hypot(ex, ez);
    if (L < 8) continue;
    const ox = s * ez / L, oz = -s * ex / L;             // this edge's outward normal
    if (ox * NX + oz * NZ < 0.93) continue;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    sumL += L; mu += L * (mx * T[0] + mz * T[1]);
    offs.push({ off: mx * NX + mz * NZ, L });
  }
  if (sumL < 40) return null;
  offs.sort((p, q) => p.off - q.off);
  let acc = 0, med = offs[0].off;
  for (const o of offs) { acc += o.L; if (acc >= sumL / 2) { med = o.off; break; } }
  const u = mu / sumL;
  return { x: T[0] * u + NX * med, z: T[1] * u + NZ * med, rot: Math.atan2(NX, NZ), len: sumL };
}
