// AR33 HPT: Gantry Plaza State Park's pier edges, railings, lamps and benches as real sections (docs/notes/ar33-hpt.md).
//   * the piers: the deck's edge beam (a chamfered 0.9 m fascia), square piles every 4.5 m with a cap beam, the railing on every
//     edge over the water (posts every 1.8 m, a 48 mm top rail and four 16 mm rods: 1.07 m, the 42 in guard height);
//   * the Central Park pattern pedestrian lamps (cast-iron, fluted base, tapered shaft, a glass lantern with a cap and finial),
//     the park's white disc lamps on thin poles;
//   * the benches: seven wooden slats on two cast-iron ends with armrests;
//   * the silver bar railings with granite posts round the gantries' bases.
// Pure geometry first (node tests), scene assembly at the end.
import * as THREE from 'three';
import { Builder, rect, circle, angle } from './hptSignSteel.js';
import { PIER, PIER_COAST, PIER_PARTS_AT } from './hptSignData.js';
import { hmat } from './hptSignMats.js';
import { nightPatch, frameM } from './hptSignBuild.js';
import { ENV, applyLightTrim as LT } from '../world/materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const NEON_ON = 'clamp((kNight - 0.12) / 0.38, 0.0, 1.0)';
const inPoly = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { if ((P[i][1] > z) !== (P[j][1] > z) && x < ((P[j][0] - P[i][0]) * (z - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; } return c; };

// ---------------------------------------------------------------- pier edges
export function pierGeo(yTop) {
  const conc = new Builder(), rail = new Builder(), piles = new Builder();
  const EDGE = [[0, 0], [0.34, 0], [0.34, -0.78], [0.3, -0.9], [-0.04, -0.9], [-0.04, -0.06]];    // the fascia: x inward from the edge line, y down from the deck
  for (let i = 0; i < PIER.length; i++) {
    const [x0, z0] = PIER[i], [x1, z1] = PIER[(i + 1) % PIER.length], dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
    if (L < 0.05) continue;
    const ux = dx / L, uz = dz / L;
    // the section's x axis for an up-vector of (0,1,0) is (uz, 0, -ux); the inward side is the one inside the deck polygon
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const inw = inPoly(mx + uz * 0.6, mz - ux * 0.6, PIER) ? 1 : -1;
    const nx = uz * inw, nz = -ux * inw;       // unit vector pointing into the deck
    const sec = EDGE.map(([a, b]) => [a * inw, b]);
    conc.member(sec, [x0, yTop - 0.006, z0], [x1, yTop - 0.006, z1], [0, 1, 0]);
    // piles every 4.5 m under the edge: round timber piles with a diagonal brace each way between neighbours
    let prev = null;
    for (let d = 1.0; d < L - 0.5; d += 4.5) {
      const px = x0 + ux * d + nx * 0.5, pz = z0 + uz * d + nz * 0.5;
      piles.member(circle(0.17, 8), [px, -1.6, pz], [px, yTop - 0.9, pz], null, { smooth: true, caps: true });
      if (prev) {
        piles.member(rect(0.07, 0.22), [prev[0], yTop - 1.15, prev[1]], [px, 0.45, pz], [nx, 0, nz]);
        piles.member(rect(0.07, 0.22), [prev[0], 0.45, prev[1]], [px, yTop - 1.15, pz], [nx, 0, nz]);
      }
      prev = [px, pz];
    }
    if (PIER_COAST.includes(i)) continue;
    // the railing 0.22 m inside the edge: posts (flat bars), top rail, four rods
    const ox = nx * 0.22, oz = nz * 0.22, h = 1.07;
    const a = [x0 + ox, yTop, z0 + oz], b = [x1 + ox, yTop, z1 + oz];
    rail.member(circle(0.024, 8), [a[0], yTop + h, a[2]], [b[0], yTop + h, b[2]], [0, 1, 0], { smooth: true, caps: false });
    for (const f of [0.2, 0.4, 0.6, 0.8]) rail.member(circle(0.008, 6), [a[0], yTop + h * f, a[2]], [b[0], yTop + h * f, b[2]], [0, 1, 0], { smooth: true, caps: false });
    const n = Math.max(1, Math.round(L / 1.8));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      rail.member(rect(0.05, 0.014), [a[0] + (b[0] - a[0]) * t, yTop, a[2] + (b[2] - a[2]) * t], [a[0] + (b[0] - a[0]) * t, yTop + h, a[2] + (b[2] - a[2]) * t], [ux, 0, uz]);
    }
  }
  return { conc, rail, piles };
}

// ---------------------------------------------------------------- lamps
// a Central Park pattern pedestrian lamp at (x, y, z): iron parts and lantern glass as Builders
export function centralParkLamp(iron, glass, x, y, z) {
  const P = (yy) => [x, y + yy, z];
  iron.member(circle(0.23, 14), P(0), P(0.16), null, { smooth: true, caps: true });
  iron.member(circle(0.17, 14), P(0.16), P(0.85), null, { smooth: true, caps: true });                 // the fluted base
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; iron.member(circle(0.018, 5), [x + Math.cos(a) * 0.165, y + 0.2, z + Math.sin(a) * 0.165], [x + Math.cos(a) * 0.165, y + 0.8, z + Math.sin(a) * 0.165], null, { smooth: true, caps: true }); }
  iron.member(circle(0.2, 14), P(0.85), P(0.93), null, { smooth: true, caps: true });
  iron.member(circle(0.085, 12), P(0.93), P(3.3), null, { smooth: true, caps: true });                   // the shaft
  iron.member(circle(0.075, 12), P(3.3), P(3.75), null, { smooth: true, caps: true });
  for (const yy of [1.45, 3.3]) iron.member(circle(0.115, 12), P(yy), P(yy + 0.06), null, { smooth: true, caps: true });
  iron.member(circle(0.19, 12), P(3.75), P(3.82), null, { smooth: true, caps: true });                    // the lantern's base
  glass.member(circle(0.17, 8), P(3.82), P(4.3), null, { caps: false, smooth: true });                   // the glass
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; iron.member(circle(0.012, 4), [x + Math.cos(a) * 0.17, y + 3.82, z + Math.sin(a) * 0.17], [x + Math.cos(a) * 0.17, y + 4.3, z + Math.sin(a) * 0.17], null, { caps: true }); }
  iron.member(circle(0.06, 10), [x, y + 3.82, z], [x, y + 4.3, z], null, { smooth: true, caps: true });  // the lamp post inside
  iron.member(circle(0.23, 12), P(4.3), P(4.36), null, { smooth: true, caps: true });                    // the cap: a shallow cone
  iron.member(circle(0.13, 12), P(4.36), P(4.52), null, { smooth: true, caps: true });
  iron.member(circle(0.05, 8), P(4.52), P(4.68), null, { smooth: true, caps: true });                    // the finial
}
// the park's disc lamp: a thin tapered pole 8.4 m, the white disc (2.2 m) on top, dished
export function discLamp(pole, disc, x, y, z) {
  pole.member(circle(0.13, 12), [x, y, z], [x, y + 0.5, z], null, { smooth: true, caps: true });
  pole.member(circle(0.085, 12), [x, y + 0.5, z], [x, y + 8.2, z], null, { smooth: true, caps: true });
  pole.member(circle(0.14, 12), [x, y + 8.0, z], [x, y + 8.3, z], null, { smooth: true, caps: true });
  // the disc: a shallow cone (radius 1.1) with a rim
  const R = 1.1, N = 28, top = y + 8.55, rim = y + 8.42;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
    const c = V(x, top, z), p0 = V(x + Math.cos(a0) * R, rim, z + Math.sin(a0) * R), p1 = V(x + Math.cos(a1) * R, rim, z + Math.sin(a1) * R);
    const nn = V(0, 1, 0);
    disc.tri(c, p1, p0, nn, nn, nn, [0, 0], [1, 0], [0, 1]);
    const d = V(0, -1, 0), b = V(x, rim - 0.06, z), q0 = V(x + Math.cos(a0) * R, rim - 0.03, z + Math.sin(a0) * R), q1 = V(x + Math.cos(a1) * R, rim - 0.03, z + Math.sin(a1) * R);
    disc.tri(b, q0, q1, d, d, d, [0, 0], [1, 0], [0, 1]);
    const s0 = V(Math.cos(a0), 0.2, Math.sin(a0)).normalize(), s1 = V(Math.cos(a1), 0.2, Math.sin(a1)).normalize();
    disc.tri(p0, p1, q1, s0, s1, s1, [0, 0], [1, 0], [1, 1]); disc.tri(p0, q1, q0, s0, s1, s0, [0, 0], [1, 1], [0, 1]);
  }
}

// ---------------------------------------------------------------- benches
// a park bench of seven slats on two cast-iron ends with armrests, centred on (0, 0, 0) facing +z; 1.8 m long
export function benchGeo(wood, iron) {
  for (let k = 0; k < 4; k++) wood.box([0, 0.44 - k * 0.002, 0.2 - k * 0.11], 0.9, 0.018, 0.045);            // the seat slats
  for (let k = 0; k < 3; k++) wood.box([0, 0.66 + k * 0.12, -0.27 - k * 0.03], 0.9, 0.04, 0.012);            // the back slats
  for (const sx of [-0.78, 0.78]) {
    iron.member(rect(0.05, 0.022), [sx, 0, 0.27], [sx, 0.44, 0.27], [0, 0, 1]);
    iron.member(rect(0.05, 0.022), [sx, 0, -0.27], [sx, 0.44, -0.27], [0, 0, 1]);
    iron.member(rect(0.04, 0.022), [sx, 0.44, 0.3], [sx, 0.44, -0.28], [0, 1, 0]);
    iron.member(rect(0.04, 0.022), [sx, 0.44, -0.26], [sx, 0.92, -0.36], [1, 0, 0]);
    iron.member(rect(0.05, 0.03), [sx, 0.66, 0.3], [sx, 0.66, -0.3], [0, 1, 0]);                              // the armrest
    iron.member(rect(0.03, 0.022), [sx, 0.44, 0.22], [sx, 0.66, 0.26], [1, 0, 0]);
  }
}

// ---------------------------------------------------------------- assembly
let _M = null;
function pMats() {
  if (_M) return _M;
  // AR34 b4: the piers' fascia and piles in timber
  const iron = hmat('iron'), wood = hmat('wood'), conc = hmat('timber'), rail = hmat('railSteel'), piles = hmat('timber');
  const lantern = new THREE.MeshStandardMaterial({ color: 0xd8d4c4, roughness: 0.15, metalness: 0.0, emissive: 0xffc77a, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  nightPatch(lantern, 'pkN1', `totalEmissiveRadiance *= 1.3 * ${NEON_ON};`);
  LT(lantern);
  const discMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.4, metalness: 0.0, emissive: 0xfff6e4, side: THREE.DoubleSide });
  nightPatch(discMat, 'pkN2', `totalEmissiveRadiance *= 0.25 + 1.6 * ${NEON_ON};`);
  LT(discMat);
  return (_M = { iron, wood, conc, rail, piles, lantern, disc: discMat });
}
const mk = (geo, mat, name, cast = true) => { const m = new THREE.Mesh(geo, mat); m.name = 'ar33h:park:' + name; m.castShadow = cast; m.receiveShadow = true; return m; };

// the piers' edges, railings and piles; yTop = the deck's level
export function buildPierEdges(group, yTop) {
  const M = pMats(), g = pierGeo(yTop);
  const out = new THREE.Group(); out.name = 'ar33h:pierEdges';
  out.add(mk(g.conc.geometry(), M.conc, 'pierFascia', false));
  out.add(mk(g.piles.geometry(), M.piles, 'piles', false));
  out.add(mk(g.rail.geometry(), M.rail, 'pierRailing'));
  group.add(out);
  return { tris: g.conc.tris + g.piles.tris + g.rail.tris };
}
// lamps along the walks: [x0, z0, x1, z1, half width] lines, a Central Park lamp every 15 m alternating sides
export function buildLamps(group, yTop, walks, discs = []) {
  const M = pMats(), iron = new Builder(), glass = new Builder(), pole = new Builder(), disc = new Builder();
  for (const [x0, z0, x1, z1, hw] of walks) {
    const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
    let k = 0;
    for (let d = 6; d < L - 3; d += 15, k++) {
      const off = (k % 2 ? 1 : -1) * Math.min(hw - 0.5, 2.0);
      centralParkLamp(iron, glass, x0 + ux * d - uz * off, yTop, z0 + uz * d + ux * off);
    }
  }
  for (const [x, y, z] of discs) discLamp(pole, disc, x, y, z);
  const out = new THREE.Group(); out.name = 'ar33h:lamps';
  if (iron.tris) { out.add(mk(iron.geometry(), M.iron, 'lampIron')); out.add(mk(glass.geometry(), M.lantern, 'lampGlass', false)); }
  if (pole.tris) { out.add(mk(pole.geometry(), M.iron, 'discPoles')); out.add(mk(disc.geometry(), M.disc, 'discs', false)); }
  group.add(out);
  return { tris: iron.tris + glass.tris + pole.tris + disc.tris };
}
// benches at [x, y, z, yaw] (facing yaw, as hptSign.js benchList)
export function buildBenchesAr33(group, list) {
  const M = pMats(), wood = new Builder(), iron = new Builder();
  const one = new Builder(), oneI = new Builder(); benchGeo(one, oneI);
  for (const [x, y, z, yaw] of list) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    // local +z = facing; local +x = along the bench
    const F = frameM(x, y, z, fz, -fx);
    wood.append(one, F); iron.append(oneI, F);
  }
  if (!wood.tris) return { tris: 0 };
  const out = new THREE.Group(); out.name = 'ar33h:benches';
  out.add(mk(wood.geometry(), M.wood, 'benchWood')); out.add(mk(iron.geometry(), M.iron, 'benchIron'));
  group.add(out);
  return { tris: wood.tris + iron.tris };
}

// ---------------------------------------------------------------- the piers' timber deck (AR34)
// The piers and the gantry platform are decked in weathered hardwood boards; the deck the tile carries under it (hptSign.js apply)
// stays for the walkers' ground. Boards 0.14 m with 8 mm gaps, across the north pier's axis, butt joints and screw lines on the
// joists every 0.6 m; one canvas of 2.96 x 2.96 m repeated.
const DECK_AX = [0.967, 0.255], DECK_T = 2.96;
let _deckTex = null;
function deckTexture() {
  if (_deckTex) return _deckTex;
  const N = 1024, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), px = N / DECK_T;
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.fillStyle = '#1f1a17'; g.fillRect(0, 0, N, N);                      // the gaps
  const nb = 20, pitch = N / nb, gap = Math.max(2, Math.round(0.008 * px));
  for (let b = 0; b < nb; b++) {
    const x0 = Math.round(b * pitch), x1 = Math.round((b + 1) * pitch) - gap;
    let y = -rnd() * 400;
    while (y < N) {
      const len = (1.1 + rnd() * 1.9) * px, warm = rnd(), grey = rnd();
      const r = 116 + warm * 30 - grey * 10, gg = 104 + warm * 16 - grey * 4, bb = 92 + grey * 14 - warm * 10;
      g.fillStyle = `rgb(${Math.round(r)},${Math.round(gg)},${Math.round(bb)})`;
      g.fillRect(x0, Math.round(y), x1 - x0, Math.round(len) - 2);
      for (let k = 0; k < 7; k++) {                                       // grain along the board
        const gx = x0 + 2 + rnd() * (x1 - x0 - 4);
        g.strokeStyle = `rgba(${rnd() < 0.5 ? '60,48,40' : '170,160,148'},${(0.08 + rnd() * 0.12).toFixed(2)})`; g.lineWidth = 1 + rnd() * 1.5;
        g.beginPath(); g.moveTo(gx, y); g.bezierCurveTo(gx + (rnd() - 0.5) * 6, y + len * 0.3, gx + (rnd() - 0.5) * 6, y + len * 0.7, gx + (rnd() - 0.5) * 4, y + len); g.stroke();
      }
      g.fillStyle = 'rgba(30,24,20,0.5)'; g.fillRect(x0, Math.round(y + len) - 3, x1 - x0, 2);   // the butt joint
      y += len;
    }
  }
  g.fillStyle = 'rgba(40,34,30,0.55)';                                    // screw heads over the joists
  for (let j = 0; j < Math.round(DECK_T / 0.6); j++) {
    const yy = (j + 0.5) * (N / Math.round(DECK_T / 0.6));
    for (let b = 0; b < nb; b++) { const xc = b * pitch + pitch / 2; g.fillRect(xc - pitch * 0.28, yy, 3, 3); g.fillRect(xc + pitch * 0.22, yy, 3, 3); }
  }
  for (let i = 0; i < 60; i++) {                                         // weathering: darker damp patches and pale salt bloom
    const x = rnd() * N, y = rnd() * N, r = 30 + rnd() * 120;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rnd() < 0.6 ? 'rgba(40,32,26,0.10)' : 'rgba(200,196,186,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return (_deckTex = t);
}
// the timber deck's material, shared with the seawalls' boardwalks (hptSignShore.js)
let _deckMat = null;
export function deckMaterial() {
  if (_deckMat) return _deckMat;
  // weathered to grey-brown
  const m = new THREE.MeshStandardMaterial({ map: deckTexture(), color: new THREE.Color(0.62, 0.7, 0.9), roughness: 0.86, metalness: 0 });
  LT(m);
  return (_deckMat = m);
}
// AR34 b4: the boards on the two piers only (hptSignData.js PIER_PARTS_AT); the gantries' platform between them is paved
// the tile's paving under it
const PIER_PARTS = PIER_PARTS_AT.map(([a, b]) => PIER.slice(a, b + 1));
export function pierDeckGeo(y) {
  const pos = [], uv = [], nor = [];
  const [ax, az] = DECK_AX;
  for (const POLY of PIER_PARTS) {
  const T = THREE.ShapeUtils.triangulateShape(POLY.map(([x, z]) => new THREE.Vector2(x, z)), []);
  for (const [a, b, c] of T) {
    const A = POLY[a], B0 = POLY[b], C0 = POLY[c];
    const ny = (B0[1] - A[1]) * (C0[0] - A[0]) - (B0[0] - A[0]) * (C0[1] - A[1]);
    const [B, C] = ny >= 0 ? [B0, C0] : [C0, B0];
    for (const [x, z] of [A, B, C]) {
      pos.push(x, y, z); nor.push(0, 1, 0);
      uv.push((x * ax + z * az) / DECK_T, (-x * az + z * ax) / DECK_T);
    }
  }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
export function buildPierDeck(group, yTop) {
  const m = deckMaterial();
  const mesh = new THREE.Mesh(pierDeckGeo(yTop + 0.02), m);
  mesh.name = 'ar33h:pierDeck'; mesh.receiveShadow = true; mesh.castShadow = false;
  group.add(mesh);
  return { tris: mesh.geometry.getAttribute('position').count / 3 };
}
