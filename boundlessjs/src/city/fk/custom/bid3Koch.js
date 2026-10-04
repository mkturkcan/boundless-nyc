// AR33 BID3: the Koch & Co. building, 132-140 W 125th St (1893). Custom builder 'bid3:koch' (with the kit: the spec in
// fk/specs/bid3.js w125-132 does the shops, the brick piers, every window and the parapet; this adds what the kit has no
// field for: the bands on the piers and their Corinthian capitals, the carved frieze panels and roundels, the belt and
// main cornices with dentils and modillions, the stone string course and balustrade, the arcade's posts, the carved arch
// spandrels, the attic's pier caps). Measured on orthographic elevations rectified out of: u from the east end of the front (the left end as
// seen from the street), y over the sidewalk, w out of the wall. Six piers 5.69 m apart carry five bays; the building
// stands 28.1 m to the top of the coping.
import * as THREE from 'three';
import { wallMat, reliefTex, quadMesh, polyMesh } from './bid3Util.js';

export const KC = [1.25, 6.94, 12.63, 18.32, 24.01, 29.70];           // pier centres
export const KB = [0, 1, 2, 3, 4].map((k) => (KC[k] + KC[k + 1]) / 2);   // bay centres
const Y = { sh: 6.5, f3: 10.0, fr1: 11.07, cap0: 13.55, cap1: 14.5, belt0: 15.0, belt1: 15.93, str0: 18.4, str1: 18.7, bal1: 19.4, spr: 20.05, cor0: 23.0, cor1: 23.7, atc0: 24.95, atc1: 25.35 };
const RO = 2.75;                                                          // the giant arches' outer radius (inner 2.13)

let _R = null;
function reliefMats() {
  if (_R) return _R;
  const mk = (kind, W, H, base) => {
    const t = reliefTex(kind, W, H, { base, seed: 5 });
    return wallMat(t ? { map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(1, 1), roughness: 0.86, metalness: 0 } : { color: new THREE.Color(`rgb(${base[0]},${base[1]},${base[2]})`), roughness: 0.86 });
  };
  _R = { frieze: mk('frieze', 1152, 224, [182, 172, 158]), spandrel: mk('spandrel', 1024, 520, [176, 167, 154]), bell: mk('bell', 256, 256, [186, 177, 163]) };
  return _R;
}

export function koch(group, ctx, spec, frame) {
  const K = frame.kit, L = frame.L;
  const stone = K.mat('terracotta_cream', { tint: '#b4aa9b', dirt: 0.5 });
  const stoneL = K.mat('terracotta_cream', { tint: '#c9c0b2', dirt: 0.45 });
  const brick = K.mat('brick_buff', { tint: '#cdb98d', dirt: 0.38 });
  const R = reliefMats();
  const N = { near: true };
  const box = (m, u0, u1, y0, y1, w0, w1, o = {}) => K.box(m, u0, u1, y0, y1, w0, w1, o);
  const add = (m) => { if (m) K.add(m); };
  const x0 = KC[0] - 0.55, x1 = KC[5] + 0.55;

  // ---------------------------------------------------------------- the piers: stone bands on the shafts, capitals
  for (const c of KC) {
    for (const y of [7.35, 8.7, 10.15, 11.6, 12.8]) box(stoneL, c - 0.49, c + 0.49, y, y + 0.32, -0.02, 0.157);
    for (const y of [16.35, 17.35]) box(stoneL, c - 0.49, c + 0.49, y, y + 0.3, -0.02, 0.157);
    // the Corinthian capital: astragal, bell, volutes, abacus
    box(stoneL, c - 0.5, c + 0.5, Y.cap0, Y.cap0 + 0.1, -0.02, 0.17);
    box(stoneL, c - 0.46, c + 0.46, Y.cap0 + 0.1, Y.cap0 + 0.36, -0.02, 0.2);
    box(stoneL, c - 0.54, c + 0.54, Y.cap0 + 0.36, Y.cap0 + 0.7, -0.02, 0.25);
    box(stoneL, c - 0.6, c + 0.6, Y.cap0 + 0.7, Y.cap0 + 0.82, -0.02, 0.29);
    box(stoneL, c - 0.7, c + 0.7, Y.cap0 + 0.82, Y.cap1, -0.02, 0.34);
    for (const s of [-1, 1]) box(stoneL, c + s * 0.6 - 0.1, c + s * 0.6 + 0.1, Y.cap0 + 0.5, Y.cap0 + 0.86, 0.1, 0.3, N);
    add(quadMesh(frame, R.bell, c - 0.4, c + 0.4, Y.cap0 + 0.12, Y.cap0 + 0.7, 0.262));
  }

  // ---------------------------------------------------------------- the frieze panels and roundels (floor 2 / 3)
  for (let k = 0; k < 5; k++) {
    const a = KC[k] + 0.47, b = KC[k + 1] - 0.47;
    box(stone, a, b, Y.f3 - 0.22, Y.f3, -0.02, 0.1);                   // the belt under the frieze
    box(stoneL, a, b, Y.f3, Y.fr1, -0.02, 0.05);                         // the frieze's frame
    add(quadMesh(frame, R.frieze, a + 0.14, b - 0.14, Y.f3 + 0.1, Y.fr1 - 0.1, 0.056, { uv: [0, 1, 0, 1] }));
    box(stone, a, b, Y.fr1, Y.fr1 + 0.15, -0.02, 0.12);                  // the sill course of floor 3
  }
  for (const c of KC) {                                                   // the roundels on the piers
    const r0 = 0.27, n = 22, y = 10.58;
    const ring = [], disc = [];
    for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; ring.push([c + Math.cos(t) * r0, y + Math.sin(t) * r0, 0.168]); disc.push([c + Math.cos(t) * r0 * 0.7, y + Math.sin(t) * r0 * 0.7, 0.178]); }
    K.poly(stoneL, ring, [0, 0, 1], N); K.poly(stone, disc, [0, 0, 1], N);
  }

  // ---------------------------------------------------------------- the belt cornice under floor 4
  {
    const e = (y) => y;
    const prof = [[-0.05, Y.belt0], [0.1, Y.belt0], [0.1, Y.belt0 + 0.13], [0.2, Y.belt0 + 0.24], [0.3, Y.belt0 + 0.36], [0.46, Y.belt0 + 0.4], [0.46, Y.belt0 + 0.74], [0.36, Y.belt0 + 0.8], [0.36, Y.belt1 - e(0)], [-0.05, Y.belt1]];
    K.extrude(stoneL, prof, x0 - 0.05, x1 + 0.05, { cap: true });
    for (let u = x0 + 0.1; u < x1 - 0.1; u += 0.3) box(stone, u, u + 0.17, Y.belt0 + 0.2, Y.belt0 + 0.4, 0.1, 0.3, { ...N, c: 0.004 });   // dentils
  }

  // ---------------------------------------------------------------- floor 4: the little piers' imposts and sill course
  for (let k = 0; k < 5; k++) {
    for (const d of [-0.775, 0.775]) {
      const u = KB[k] + d;
      box(stone, u - 0.27, u + 0.27, 17.36, 17.62, -0.02, 0.1, N);      // impost block with its capital
      box(stoneL, u - 0.22, u + 0.22, Y.belt1, Y.belt1 + 0.14, -0.02, 0.07, N);   // plinth
    }
    for (const d of [-0.775, 0.775]) box(brick, KB[k] + d - 0.17, KB[k] + d + 0.17, Y.belt1, 17.36, -0.02, 0.05);
  }

  // ---------------------------------------------------------------- the string course, the balustrade, the stone piers
  {
    const prof = [[-0.05, Y.str0], [0.14, Y.str0], [0.14, Y.str0 + 0.06], [0.1, Y.str0 + 0.1], [0.1, Y.str0 + 0.22], [0.16, Y.str0 + 0.26], [0.16, Y.str1], [-0.05, Y.str1]];
    K.extrude(stoneL, prof, x0 - 0.05, x1 + 0.05, { cap: true });
    for (const c of KC) {
      box(stoneL, c - 0.57, c + 0.57, Y.str1, Y.bal1 - 0.05, -0.02, 0.2);                    // the pedestal / impost
      box(stoneL, c - 0.62, c + 0.62, Y.bal1 - 0.05, Y.bal1 + 0.12, -0.02, 0.24);
      box(stone, c - 0.715, c + 0.715, Y.bal1 + 0.12, Y.spr, -0.02, 0.1);                    // the stone pier up to the springing
    }
    for (let k = 0; k < 5; k++) {
      const a = KC[k] + 0.62, b = KC[k + 1] - 0.62;
      box(stoneL, a, b, Y.str1, Y.str1 + 0.12, 0.0, 0.2);                                    // base rail
      box(stoneL, a, b, Y.bal1 - 0.15, Y.bal1, 0.0, 0.22);                                   // handrail
      const n = Math.max(2, Math.round((b - a) / 0.2));
      for (let i = 0; i < n; i++) {
        const u = a + ((i + 0.5) * (b - a)) / n;
        box(stoneL, u - 0.06, u + 0.06, Y.str1 + 0.12, Y.str1 + 0.27, 0.04, 0.16, { ...N, c: 0.004 });    // the belly
        box(stoneL, u - 0.035, u + 0.035, Y.str1 + 0.27, Y.bal1 - 0.15, 0.06, 0.14, { ...N, c: 0.003 });  // the neck
      }
      // the posts of the arcade, standing in front of the glass, with a lintel between them
      const cb = KB[k];
      for (const s of [-1, 1]) {
        const u = cb + s * 0.78;
        box(stone, u - 0.17, u + 0.17, Y.bal1, 21.2, -0.66, -0.3);
        box(stoneL, u - 0.22, u + 0.22, 21.2, 21.55, -0.7, -0.26);
        box(stone, u - 0.1, u + 0.1, 20.2, 20.9, -0.3, -0.24, N);          // the carved pendant on its face
      }
      box(stone, cb - 0.6, cb + 0.6, 21.28, 21.55, -0.62, -0.32);
    }
  }

  // ---------------------------------------------------------------- the arch spandrels (carved fields)
  {
    const arc = (cb, from, to, n) => { const p = []; for (let i = 0; i <= n; i++) { const t = from + ((to - from) * i) / n; p.push([cb + RO * Math.sin(t), Y.spr + RO * Math.cos(t)]); } return p; };
    const cap = Y.cor0;
    for (let k = 0; k <= 5; k++) {
      const pts = [];
      if (k > 0) { pts.push([KB[k - 1], cap]); pts.push(...arc(KB[k - 1], 0, Math.PI / 2, 14)); }
      else pts.push([x0, cap], [x0, Y.spr]);
      if (k < 5) { pts.push(...arc(KB[k], -Math.PI / 2, 0, 14)); pts.push([KB[k], cap]); }
      else pts.push([x1, Y.spr], [x1, cap]);
      // the two springing points of neighbouring arcs nearly touch at the pier; keep them as listed
      const uc = KC[k];
      add(polyMesh(frame, R.spandrel, pts, 0.045, [uc - RO - 0.095, uc + RO + 0.095, Y.spr, cap]));
    }
  }

  // ---------------------------------------------------------------- the main cornice and the attic
  {
    const t = Y.cor0;
    const prof = [[-0.05, t], [0.12, t], [0.12, t + 0.1], [0.3, t + 0.2], [0.34, t + 0.34], [0.54, t + 0.36], [0.56, t + 0.6], [0.4, t + 0.7], [-0.05, t + 0.7]];
    K.extrude(stoneL, prof, x0 - 0.1, x1 + 0.1, { cap: true });
    for (let u = x0 + 0.1; u < x1 - 0.1; u += 0.5) box(stone, u, u + 0.2, t + 0.04, t + 0.34, 0.12, 0.38, { ...N, c: 0.005 });   // modillions
    // the attic: a band over its windows, the pier caps (stepped, projecting)
    box(stone, x0, x1, Y.atc0, Y.atc1, -0.02, 0.1);
    for (const c of KC) {
      box(stoneL, c - 0.52, c + 0.52, Y.atc1, Y.atc1 + 0.18, -0.02, 0.2);
      box(stoneL, c - 0.46, c + 0.46, Y.atc1 + 0.18, Y.atc1 + 0.55, -0.02, 0.16);
      box(stoneL, c - 0.62, c + 0.62, Y.atc1 + 0.55, Y.atc1 + 0.86, -0.02, 0.26);
    }
    for (const c of KC) box(brick, c - 0.45, c + 0.45, Y.cor1 + 0.0, Y.atc0, -0.02, 0.1);   // the attic piers
  }
  void group; void ctx; void spec;
}
