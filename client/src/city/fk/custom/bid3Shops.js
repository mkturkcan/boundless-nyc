// AR34 BID3: the small street-front builders of the segment (docs/notes/ar33-bid3.md): the billboard tower at 2089 Adam Clayton
// Powell Jr. Blvd ('bid3:boards'), the fenced vacant lot beside 158 W 125th ('bid3:lot158') and the closed roll-down
// shutters of the vacant stores at 124 and 120 W 125th ('bid3:shut124', 'bid3:shut120'). Measured on the 2026-08 / 2024-08
// every board carries an
// invented brand (billboards and ad panels never name real advertisers). u from the face's left end as seen from the street,
// y over the sidewalk, w out of the wall.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { applyLightTrim } from '../../../world/materials.js';
import { wallMat, hash, quadMesh, towerGlass, curtain, paleMullion, selfLit, panelMat } from './bid3Util.js';
import { graffitiShutter, stuccoWall, corrugatedMetal, woodSlats, textDecal, muralTall, scriptF } from './bid3Paint.js';

// the hoarding of the vacant lot: 2.4 m, beige plywood sheets under a 0.45 m green top
// rail, the first 3.2 m (the corner nearest Apollo Beauty) painted green and papered with posters and tags, laundry hung on it
let _F = null;
const FENCE_L = 15.2;
function fenceMat() {
  if (_F) return _F;
  let map = null;
  if (typeof document !== 'undefined') {
    const pxm = 120, W = Math.round(FENCE_L * pxm), H = Math.round(2.44 * pxm), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    if (g && g.fillRect) {
      const sw = 1.22 * pxm;
      for (let i = 0; i * sw < W; i++) {
        const k = 0.94 + 0.1 * hash(i, 1, 1);
        g.fillStyle = `rgb(${208 * k | 0},${198 * k | 0},${172 * k | 0})`; g.fillRect(i * sw, 0, sw, H);
        for (let l = 0; l < 18; l++) { g.fillStyle = `rgba(110,90,60,${0.04 + 0.07 * hash(i, l, 2)})`; g.fillRect(i * sw + hash(i, l, 3) * sw, 0, 1 + hash(i, l, 4) * 2, H); }
        g.fillStyle = 'rgba(70,60,45,0.55)'; g.fillRect(i * sw - 1, 0, 2, H);
      }
      // the green top rail and the painted west end
      g.fillStyle = '#1f6b58'; g.fillRect(0, 0, W, H * 0.19);
      g.fillStyle = '#22745f'; g.fillRect(0, 0, 3.2 * pxm, H);
      g.fillStyle = 'rgba(15,40,32,0.5)'; g.fillRect(0, H * 0.19 - 2, W, 3);
      // grime from the foot and the rail
      const gg = g.createLinearGradient(0, H * 0.7, 0, H); gg.addColorStop(0, 'rgba(60,50,40,0)'); gg.addColorStop(1, 'rgba(60,50,40,0.28)'); g.fillStyle = gg; g.fillRect(0, H * 0.7, W, H * 0.3);
      // posters on the green end (pale, orange, blue) with bars of print, one big poster with a hat
      const pcol = ['#e9e4d6', '#d9753d', '#e8c64a', '#d5dfe6', '#3a6fb0', '#c6527e'];
      for (let p = 0; p < 9; p++) {
        const x = (0.15 + 2.7 * hash(p, 5, 5)) * pxm, y = H * (0.28 + 0.4 * hash(p, 6, 5)), w = (0.22 + 0.34 * hash(p, 7, 5)) * pxm, h = (0.35 + 0.5 * hash(p, 8, 5)) * pxm;
        g.fillStyle = pcol[p % pcol.length]; g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(25,25,25,0.7)'; for (let t = 0; t < 4; t++) g.fillRect(x + 4, y + 6 + t * (h / 4.4), w * (0.4 + 0.45 * hash(p, t, 9)), 3 + 4 * hash(p, t, 10));
      }
      // tags and a couple of stickers along the plywood
      g.lineCap = 'round';
      for (let t = 0; t < 7; t++) {
        g.strokeStyle = t % 2 ? '#111' : '#2a56a8'; g.globalAlpha = 0.7; g.lineWidth = 2.5 + hash(t, 3, 11) * 3;
        const x = (3.4 + 11 * hash(t, 1, 12)) * pxm, y = H * (0.55 + 0.3 * hash(t, 2, 12));
        g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 18, y - 30, x + 36, y + 22, x + 60 * hash(t, 4, 12) + 12, y - 10); g.stroke();
      }
      g.globalAlpha = 1;
      map = new THREE.CanvasTexture(cv);
      map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    }
  }
  _F = wallMat(map ? { map, roughness: 0.85, metalness: 0 } : { color: new THREE.Color('#cdbf9f'), roughness: 0.85 });
  return _F;
}

// ragged leaf masses (young sumac, weeds): a subdivided icosahedron with its vertices pushed in and out and shaded dark inside to light
// outside through vertex colours; one shared material
let _FOL = null;
function foliageMat() {
  if (!_FOL) _FOL = applyLightTrim(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92, metalness: 0 }));
  return _FOL;
}
function leafMass(r, seed, tone) {
  // a cluster of seven small smoothly shaded clumps (560 triangles), each lumpy and leaf-toned per vertex (one displaced
  // icosahedron with face normals read as a faceted low-poly blob on the w2a plate s158)
  const parts = [];
  for (let c = 0; c < 7; c++) {
    const cr = r * (0.38 + 0.22 * hash(c, seed, 1)), a = hash(c, seed, 2) * 6.283, el = (hash(c, seed, 3) - 0.35) * 1.4, d = c ? r * (0.35 + 0.35 * hash(c, seed, 4)) : 0;
    const g = mergeVertices(new THREE.IcosahedronGeometry(cr, 1).deleteAttribute('normal').deleteAttribute('uv'));
    const p = g.getAttribute('position'), col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 0.82 + 0.3 * hash(Math.round(x * 23), Math.round(y * 23), seed + c + Math.round(z * 23));
      p.setXYZ(i, x * n + Math.cos(a) * d, y * n * 0.8 + Math.sin(el) * d * 0.6, z * n + Math.sin(a) * d);
      const v = (0.55 + 0.6 * hash(i, seed + c, 5)) * (0.7 + 0.45 * (y / cr + 1) * 0.5);
      col[i * 3] = tone[0] * v; col[i * 3 + 1] = tone[1] * v; col[i * 3 + 2] = tone[2] * v;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
  }
  const g = mergeGeometries(parts);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));   // the kit merges by material: keep the attribute set
  g.computeVertexNormals();
  return g;
}

// ================================================================== 2089 Adam Clayton Powell Jr. Blvd: the billboard tower
// The 125th Street face is clad from the black Verizon fascia (5.4 m) to 21 m in a grey metal billboard frame with stacked
// panels: a pale blank panel, a red one, a white one, a red one, a black one at the top.
export function boards(group, ctx, spec, frame) {
  const K = frame.kit, L = frame.L;
  const metal = K.mat('panel_alu', { tint: '#6b7076', dirt: 0.3 });
  const pale = K.mat('panel_alu', { tint: '#b9bcbe', dirt: 0.25 });
  const y0 = 5.9, y1 = 18.3, d = 0.3;
  // the frame: a shallow metal box standing proud of the wall, panels flush with its face. Heights read off h209
  // red 6.0-8.0, white 8.1-8.9, red 9.0-11.0, pale grey 11.1-12.8, black 12.9-17.7
  K.box(metal, -0.1, L + 0.1, y0, y1, -0.02, d, { c: 0.02, skip: 4 });
  K.box(pale, 0.12, L - 0.12, 11.1, 12.8, d, d + 0.03, { c: 0.004 });
  const P = (lines, font, fg, bg, ya, yb, o = {}) => K.sign({ kind: 'painted', lines, font, fg, bg, u0: 0.12, u1: L - 0.12, y: ya, h: yb - ya, ...o }, { z: d + 0.02 });
  P(['NOBODY', 'SELLS FOR', 'LESS...NOBODY!'], 'Inter-900', '#ffffff', '#d33a2c', 6.0, 8.0);
  P(['DREAMFIELD'], 'Inter-800', '#1a1a1a', '#f1f1ee', 8.1, 8.9);
  P(['LOW PRICE', 'GUARANTEE'], 'Inter-900', '#ffffff', '#d33a2c', 9.0, 11.0);
  P(['STRIDE', 'SPORT', 'OPEN IN HARLEM'], 'Inter-900', '#f4f4f0', '#12151a', 12.9, 17.7);
  // the east wall (the party wall over the vacant lot, ring edge 0, u from its south end): a tall invented mural of stacked bubble
  // letters in blue, chrome and green high on the wall
  { const E = frame.face(0);
    const mm = E ? muralTall(3.8, 10.4, 7, { pxm: 56 }) : null;
    if (E && mm) {
      const F = E.kit.F;
      const mesh = quadMesh({ world: (u, y, w) => F.world(u, y, w), n: F.N }, mm, 22.6, 26.4, 8.6, 19.0, 0.03, { uv: [0, 1, 0, 1] });
      E.kit.add(mesh);
    } }
  // the corner (Adam Clayton Powell Jr. Blvd) face: a short return of the frame
  const C = frame.face('corner');
  if (C) C.kit.box(metal, -0.1, 1.4, y0, y1, -0.02, d, { c: 0.02, skip: 4 });
  void group; void ctx; void spec;
}

// ================================================================== the vacant lot beside 158 W 125th (south-u 206.3-221.6)
// A 2.4 m plywood hoarding on the building line, posts every 2.44 m and a top rail, posters and tags.
// The frame is the shops' (158 W: 15.6 m); the fence continues along the same line to the 2089 ACP party wall.
export function lot158(group, ctx, spec, frame) {
  const K = frame.kit, L = frame.L;
  // Apollo Beauty's board: a black cap along its top and four gooseneck lamps over it
  { const blk = K.mat('plain', { tint: '#151515', rough: 0.5 });
    K.box(blk, 0.35, 8.15, 5.38, 5.5, -0.02, 0.32, { c: 0.01 });
    for (const u of [1.6, 3.5, 5.4, 7.3]) {
      K.box(blk, u - 0.02, u + 0.02, 5.5, 5.95, 0.12, 0.16, { c: 0, near: true });
      K.box(blk, u - 0.02, u + 0.02, 5.91, 5.95, 0.16, 0.78, { c: 0, near: true });
      K.box(blk, u - 0.1, u + 0.1, 5.8, 5.92, 0.66, 0.86, { c: 0.02, near: true });
    } }
  const u0 = L + 0.1, u1 = L + 15.2, H = 2.4;
  const post = K.mat('wood_painted', { tint: '#5b4a35', dirt: 0.3 });
  const m = quadMesh(frame, fenceMat(), u0, u1, 0, H, 0.06, { uv: [0, 1, 0, 1] });
  m.castShadow = true;
  K.add(m);
  for (let u = u0; u <= u1 + 0.01; u += 2.44) K.box(post, u - 0.05, u + 0.05, 0, H + 0.12, 0.0, 0.1, { c: 0.01 });
  K.box(post, u0, u1, H, H + 0.1, 0.0, 0.1, { c: 0.01 });
  // laundry hung on the hoarding (a white gown, a blue coat, a black coat, a green and white shirt): thin cloth quads
  const cloth = (u, y0, w, h, col) => { const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), applyLightTrim(new THREE.MeshStandardMaterial({ color: col, roughness: 0.95, side: THREE.DoubleSide }))); q.applyMatrix4(frame.matrix(u, y0 + h / 2, 0.09)); q.castShadow = false; K.add(q); };
  cloth(u0 + 5.6, 0.7, 0.75, 1.5, 0xe9e8e2); cloth(u0 + 7.3, 1.0, 0.4, 1.2, 0x26397a); cloth(u0 + 8.4, 0.8, 0.55, 1.4, 0x151515); cloth(u0 + 12.6, 1.1, 0.55, 1.1, 0xdfe4dc);
  // young sumac and tree-of-heaven rising 3-6 m behind the hoarding (a ragged green screen above the fence, densest right of its
  // middle): a thin trunk and eight to ten leaf masses each
  const fol = foliageMat(), trunk = K.mat('wood_painted', { tint: '#4a3d2e' });
  const spots = [[0.3, 3.2], [0.46, 4.4], [0.58, 5.6], [0.7, 4.0], [0.8, 5.0], [0.92, 3.4]];
  if (FX36) { lotVolunteers(K, ctx, frame, u0, u1, H, spots); void group; void spec; return; }
  spots.forEach(([f, hgt], i) => {
    const u = u0 + f * (u1 - u0), wb = -1.6 - hash(i, 11, 3) * 1.4;
    K.box(trunk, u - 0.06, u + 0.06, H - 0.3, H + hgt * 0.85, wb - 0.06, wb + 0.06, { c: 0.01, near: true });
    for (let b = 0; b < 9; b++) {
      const r = 0.45 + 0.4 * hash(i, b, 12), ang = hash(i, b, 13) * 6.28, rad = (0.2 + 0.9 * hash(i, b, 16)) * (0.4 + 0.6 * (b / 8));
      const oy = H + hgt * (0.4 + 0.07 * b) + (hash(i, b, 14) - 0.5) * 0.7;
      const mm = new THREE.Mesh(leafMass(r, 100 + i * 17 + b, b % 3 ? [0.31, 0.5, 0.2] : [0.2, 0.38, 0.17]), fol);
      mm.rotation.y = hash(i, b, 18) * 6;
      mm.applyMatrix4(frame.matrix(u + Math.cos(ang) * rad, oy, wb + Math.sin(ang) * rad * 0.7));
      mm.castShadow = false; mm.receiveShadow = true;
      K.add(mm);
    }
  });
  // weeds along the top edge
  for (let i = 0; i < 18; i++) {
    const u = u0 + 0.4 + (i * (u1 - u0 - 0.8)) / 17 + (hash(i, 2, 3) - 0.5) * 0.5, hh = 0.15 + hash(i, 4, 3) * 0.55, wb = -0.5 - hash(i, 5, 3) * 0.8;
    const mm = new THREE.Mesh(leafMass(0.3 + 0.2 * hash(i, 6, 3), 300 + i, [0.33, 0.5, 0.22]), fol);
    mm.applyMatrix4(frame.matrix(u, H + hh, wb));
    mm.castShadow = false; mm.receiveShadow = true;
    K.add(mm);
  }
  void group; void ctx; void spec;
}

// FX36 (AR34 fixes, QA round 4, 2026-10-02; `?fx36=0` as before): the lot's trees stood on the hoarding's top (trunks from y 5.62
// over the lot's ground at 3.24: tools/qa/support_audit.js) under crowns of lumpy leaf blobs, and the weeds along the fence's top
// hung in the air. Each is planted on the lot's ground (ctx.sampleT) and drawn with the habit of the lot's volunteers: tree-of-
// heaven (a slender leaning stem, two or three long ascending limbs, each ending in a tuft of arching pinnate leaves 0.5-0.8 m long
// with paired lance leaflets), mulberry (a low fork, five or six spreading limbs, sprays of broad simple leaves) and the tree-of-
// heaven's root suckers along the fence (a whip with one tuft over the hoarding). One bark and one leaf mesh for the lot.
const FX36 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('fx36') === '0');
let _VBARK = null, _VLEAF = null;
const _V = (x, y, z) => new THREE.Vector3(x, y, z), _UP = _V(0, 1, 0);
function lotVolunteers(K, ctx, frame, u0, u1, H, spots) {
  if (!_VBARK) _VBARK = applyLightTrim(new THREE.MeshStandardMaterial({ color: 0x7d776c, roughness: 0.92, metalness: 0 }));
  if (!_VLEAF) _VLEAF = applyLightTrim(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.78, metalness: 0, side: THREE.DoubleSide }));
  const y0 = frame.y0 ?? 3.52;
  // the lot's ground under (u, w), in the frame's y (over the sidewalk): the compiled terrain (3.24 here) a few cm down
  const footY = (u, w) => { const [X, , Z] = frame.world(u, 0, w); const g = ctx && ctx.sampleT ? ctx.sampleT(X, Z) : y0 - 0.28; return (Number.isFinite(g) ? g : y0 - 0.28) - y0 - 0.06; };
  const bark = [], P = [], C = [], I = [];
  const stick = (a, b, r0, r1, n = 6) => {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    if (L < 1e-3) return;
    const g = new THREE.CylinderGeometry(r1, r0, L, n, 1, true).translate(0, L / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_UP, d.normalize())).translate(a.x, a.y, a.z);
    bark.push(g);
  };
  // a leaf blade: base, axis (unit), length, half width, the blade's plane normal, colour; a lance (4 vertices) or a broad ovate (6)
  const blade = (base, ax, len, hw, nrm, col, broad = false) => {
    const wv = new THREE.Vector3().crossVectors(ax, nrm).normalize(), k = P.length / 3;
    const at = (f, s) => { const p = base.clone().addScaledVector(ax, len * f).addScaledVector(wv, hw * s); P.push(p.x, p.y, p.z); C.push(...col); };
    if (broad) { at(0, 0); at(0.3, 0.9); at(0.65, 0.85); at(1, 0); at(0.65, -0.85); at(0.3, -0.9); for (let t = 1; t < 5; t++) I.push(k, k + t, k + t + 1); }
    else { at(0, 0); at(0.42, 1); at(1, 0); at(0.42, -1); I.push(k, k + 1, k + 2, k, k + 2, k + 3); }
  };
  const tone = (R, base) => { const v = 0.78 + 0.4 * R(), y = R() < 0.15 ? 1.18 : 1; return [base[0] * v * y, base[1] * v, base[2] * v]; };
  // a pinnate leaf from p along d (unit, it arches down by `droop` of its length): paired leaflets, a terminal one
  const pinnate = (R, p, d, len, droop, base) => {
    const side = new THREE.Vector3().crossVectors(d, _UP); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
    const pairs = 8 + Math.floor(R() * 4), rp = (s) => p.clone().addScaledVector(d, s * len).add(_V(0, -droop * len * s * s, 0));
    const nrm = new THREE.Vector3().crossVectors(side, d).normalize();
    for (let q = 0; q < pairs; q++) {
      const s = 0.12 + 0.84 * (q / pairs), r = rp(s), ll = len * (0.2 + 0.12 * Math.sin(Math.PI * (q + 0.5) / pairs)), col = tone(R, base);
      const tan = rp(Math.min(1, s + 0.05)).sub(r).normalize();
      for (const sg of [-1, 1]) blade(r, side.clone().multiplyScalar(sg * 0.88).addScaledVector(tan, 0.5).normalize(), ll, ll * 0.24, nrm, col);
    }
    const e = rp(1), tan = e.clone().sub(rp(0.94)).normalize();
    blade(e, tan, len * 0.17, len * 0.03, nrm, tone(R, base));
  };
  // a tuft of n pinnate leaves round t: the young ones up, the old ones spread and arching (tree-of-heaven)
  const tuft = (R, t, n, len, base) => {
    for (let j = 0; j < n; j++) {
      const az = (j / n) * 6.283 + R() * 0.5, up = 0.15 + 0.75 * R() * R() + (j % 4 === 0 ? 0.55 : 0), h = Math.sqrt(Math.max(0.05, 1 - up * up * 0.5));
      pinnate(R, t, _V(Math.cos(az) * h, up, Math.sin(az) * h).normalize(), len * (0.75 + 0.45 * R()), 0.25 + 0.3 * R(), base);
    }
  };
  // a mulberry spray: a twig from p along d with broad leaves either side
  const spray = (R, p, d, len, base) => {
    const e = p.clone().addScaledVector(d, len).add(_V(0, -0.08 * len, 0));
    stick(p, e, 0.012, 0.005, 4);
    const n = 10 + Math.floor(R() * 6);
    for (let q = 0; q < n; q++) {
      const s = 0.15 + 0.85 * (q / n), r = p.clone().lerp(e, s), az = R() * 6.283, el = -0.2 + 0.7 * R();
      const ax = _V(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
      const nrm = new THREE.Vector3().crossVectors(ax, _V(-ax.z, 0, ax.x).normalize()).normalize();
      if (nrm.y < 0) nrm.negate();
      const L = 0.17 + 0.08 * R();
      blade(r, ax, L, L * 0.4, nrm, tone(R, base), true);
    }
  };
  const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const AIL = [0.29, 0.43, 0.15], MUL = [0.2, 0.36, 0.12];
  spots.forEach(([f, hgt], i) => {
    const R = rng(4127 + i * 977), u = u0 + f * (u1 - u0), w = -1.6 - hash(i, 11, 3) * 1.4, fy = footY(u, w);
    const top = H + hgt * 0.9, Ht = top - fy, foot = _V(u, fy, w);
    const mul = i === 1 || i === 3;
    const inLot = (t) => { t.x = Math.min(u1 - 1.3, Math.max(u0 + 1.3, t.x)); return t; };   // the tips clear 158 W's and 2089's walls
    if (!mul) {
      // tree-of-heaven: the stem leans a little; two or three limbs from ~55-70 % up, each to a tuft
      const lean = _V((R() - 0.5) * 0.3, 1, (R() - 0.5) * 0.25).normalize(), fork = foot.clone().addScaledVector(lean, Ht * (0.42 + 0.1 * R()));
      const r0 = 0.05 + 0.012 * hgt;
      stick(foot, fork, r0, r0 * 0.7, 7);
      const nl = 2 + (R() < 0.6 ? 1 : 0);
      for (let b = 0; b < nl; b++) {
        const az = (b / nl) * 6.283 + R() * 0.6 + i, sp = 0.35 + 0.25 * R();
        const tip = inLot(fork.clone().add(_V(Math.cos(az) * Ht * 0.22 * sp * 2, Ht - (fork.y - fy) - 0.3 * R() - (b ? 0.5 * R() : 0), Math.sin(az) * Ht * 0.16 * sp * 2)));
        const mid = fork.clone().lerp(tip, 0.5).add(_V(Math.cos(az) * 0.15, 0, Math.sin(az) * 0.1));
        stick(fork, mid, r0 * 0.6, r0 * 0.45, 5); stick(mid, tip, r0 * 0.45, r0 * 0.25, 5);
        tuft(R, tip, 17 + Math.floor(R() * 4), 0.66 + 0.12 * hgt / 5, AIL);
        for (const f of [0.35, 0.62, 0.84]) tuft(R, mid.clone().lerp(tip, f).add(_V((R() - 0.5) * 0.4, 0, (R() - 0.5) * 0.3)), 8 + Math.floor(R() * 3), 0.55, AIL);   // side shoots along the limb
      }
    } else {
      // mulberry: a short trunk forking low into five or six spreading limbs, sprays of broad leaves over a rounded crown
      const fork = foot.clone().add(_V(0, Math.min(1.6, Ht * 0.3), 0)), r0 = 0.07 + 0.01 * hgt;
      stick(foot, fork, r0, r0 * 0.8, 7);
      const nl = 5 + (R() < 0.5 ? 1 : 0), cr = Ht * 0.32;
      for (let b = 0; b < nl; b++) {
        const az = (b / nl) * 6.283 + R() * 0.6, rise = Ht - (fork.y - fy) - 0.4 - R() * 1.2;
        const tip = inLot(fork.clone().add(_V(Math.cos(az) * cr * (0.6 + 0.4 * R()), rise, Math.sin(az) * cr * 0.7 * (0.6 + 0.4 * R()))));
        const mid = fork.clone().lerp(tip, 0.45).add(_V(Math.cos(az) * 0.25, -0.2, Math.sin(az) * 0.18));
        stick(fork, mid, r0 * 0.55, r0 * 0.4, 5); stick(mid, tip, r0 * 0.4, r0 * 0.18, 5);
        for (let s = 0; s < 12; s++) {
          const az2 = az + (R() - 0.5) * 2.4, el = -0.1 + 0.6 * R(), from = mid.clone().lerp(tip, 0.35 + 0.65 * R());
          spray(R, from, _V(Math.cos(az2) * Math.cos(el), Math.sin(el), Math.sin(az2) * Math.cos(el)).normalize(), 0.55 + 0.35 * R(), MUL);
        }
      }
    }
  });
  // the tree-of-heaven's suckers along the hoarding: a whip from the lot's ground with one tuft just over the fence top
  for (let i = 0; i < 9; i++) {
    const R = rng(9311 + i * 131), u = u0 + 0.6 + (i * (u1 - u0 - 1.2)) / 8 + (R() - 0.5) * 0.6, w = -0.6 - R() * 0.7, fy = footY(u, w);
    const tip = _V(u + (R() - 0.5) * 0.3, H + 0.3 + 0.7 * R(), w - 0.1 * R());
    stick(_V(u, fy, w), tip, 0.028, 0.012, 5);
    tuft(R, tip, 11 + Math.floor(R() * 4), 0.55 + 0.15 * R(), AIL);
  }
  const M = frame.matrix(0, 0, 0);
  const bg = mergeGeometries(bark, false);
  if (bg) { bg.applyMatrix4(M); const m = new THREE.Mesh(bg, _VBARK); m.name = 'fk_lot158_bark'; m.castShadow = true; m.receiveShadow = true; K.add(m); }
  if (I.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((P.length / 3) * 2), 2));   // the kit's attribute set
    g.setIndex(I);
    g.computeVertexNormals();
    g.applyMatrix4(M);
    const m = new THREE.Mesh(g, _VLEAF); m.name = 'fk_lot158_leaves'; m.castShadow = true; m.receiveShadow = true;
    K.add(m);
  }
}

// ================================================================== the closed shutters of 124 and 120 W 125th
// 124 W: the vacant store (u 10.8-24.2 from the east end) behind three plain silver roll gates, 4.3 m high: u 10.8-15.3, 15.9-18.2,
// 18.8-24.2; its east end (u 0-8.6) is clad above the glass in vertical silver corrugated metal over a timber-slat fascia under a
// black canopy, the Cane's tower (grey) at u 8.6-11.0.
// 120 W: the former Fino, two roll gates covered in layered graffiti (u 0.3-6.9, 7.5-14.4), a weathered stucco fascia with the ghost
// of a painted script sign, black SHOES letters, a red MOVED notice and the sign pole at the kerb.
const front = (m) => { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; return m; };
function gates(frame, list, H, seed, o = {}) {
  const K = frame.kit;
  list.forEach(([a, b], i) => {
    const m = front(graffitiShutter(b - a, H, seed + i, { base: o.base ?? '#c8cbce', density: o.density ?? 0, bandTop: o.bandTop, rough: o.rough, metal: o.metal }));
    K.add(quadMesh(frame, m, a, b, 0.0, H, 0.03, { uv: [0, 1, 0, 1] }));
  });
}
export function shut124(group, ctx, spec, frame) {
  const K = frame.kit;
  // the roof: a ribbed metal deck, rust-brown and grey in long stripes along the depth
  { const rm = corrugatedMetal(8, 8, 17, { base: [128, 104, 86], per: 0.18, pxm: 60 }), wm = K.mat('panel_alu', { tint: '#d9d9d4', dirt: 0.35 });
    K.box(rm, 11.7, 23.3, 7.5, 7.55, -61.0, -1.2, { c: 0, skip: 1 | 2 | 4 | 16 | 32 });
    K.box(wm, 0.4, 11.7, 7.5, 7.55, -61.0, -1.2, { c: 0, skip: 1 | 2 | 4 | 16 | 32 });
    K.box(wm, 23.3, 30.3, 7.5, 7.55, -61.0, -1.2, { c: 0, skip: 1 | 2 | 4 | 16 | 32 }); }
  // (AR34 batch 3) heights re-read with the foot of the front as the datum: the gates to 3.0 m, the black box to 7.05 m, Cane's canopy 3.15-3.6, timber 3.6-4.5, corrugated
  // metal 4.5-6.95, Panda Express's oak 3.2-6.45
  gates(frame, [[10.8, 15.3], [15.9, 18.2], [18.8, 24.2]], 3.0, 1, { base: '#85868a', density: 0, rough: 0.62, metal: 0.08 });
  // Raising Cane's, the east end: silver corrugated
  // metal 5.9-8.7 and timber slats 4.8-5.9 over u 0.6-6.5, a black canopy ledge over the glass (4.3-4.8), the grey tower panel
  // u 6.5-10.6 (4.4-8.8) carrying the oval; the red double doors are the kit's (spec bay 2)
  const blk = K.mat('panel_alu', { tint: '#1e1f21', dirt: 0.2 });
  // (b3f c124east at full resolution: the cladding's top stands ~90 px (hfov 45) over the twin's, s120 ~7 px: to 7.35 m)
  const cm = front(corrugatedMetal(5.9, 2.75, 5, { base: [214, 217, 219], per: 0.1 }));
  K.add(quadMesh(frame, cm, 0.6, 6.5, 4.6, 7.35, 0.04, { uv: [0, 1, 0, 1] }));
  K.add(quadMesh(frame, woodSlats(5.9, 0.9, 3), 0.6, 6.5, 3.7, 4.6, 0.06, { uv: [0, 1, 0, 1] }));
  K.box(blk, 0.6, 6.6, 3.3, 3.7, 0.0, 0.62, { c: 0.01 });
  K.box(K.mat('panel_alu', { tint: '#e8e8e4', dirt: 0.1 }), 0.6, 6.6, 3.3, 3.34, 0.58, 0.62, { c: 0 });
  // gooseneck lamps over the timber band: a black arm out of the corrugated cladding's foot and a dish shade over the slats, five over
  // the band and two on the tower
  { const arm = K.mat('plain', { tint: '#151515', rough: 0.5 });
    for (const u of [1.3, 2.5, 3.7, 4.9, 6.1, 7.6, 9.6]) {
      const yb = u < 6.5 ? 4.62 : 4.45, wo = u < 6.5 ? 0.06 : 0.22;
      K.box(arm, u - 0.015, u + 0.015, yb, yb + 0.03, wo, wo + 0.34, { c: 0, near: true });
      K.box(arm, u - 0.015, u + 0.015, yb - 0.16, yb + 0.03, wo + 0.31, wo + 0.34, { c: 0, near: true });
      K.box(arm, u - 0.09, u + 0.09, yb - 0.22, yb - 0.15, wo + 0.24, wo + 0.42, { c: 0.02, near: true });
    } }
  // the timber-clad pier at the east end, beside 120 W's poster pier (c124east, s120)
  K.add(quadMesh(frame, woodSlats(0.5, 3.3, 6), 0.6, 1.1, 0.0, 3.3, 0.07, { uv: [0, 1, 0, 1] }));
  // the grey tower bay rises over the black box (s124: its top over the box's line from 01705, level with it from 01730): to 7.5 m
  K.box(K.mat('panel_alu', { tint: '#3e4146', dirt: 0.2 }), 6.5, 10.6, 3.3, 7.6, -0.1, 0.2, { c: 0.01 });
  for (const y of [4.9, 6.25]) K.box(blk, 6.5, 10.6, y, y + 0.02, 0.2, 0.21, { c: 0 });
  K.sign({ kind: 'painted', text: '', logo: 'bid3:canesMark', logoAt: 'fill', bg: null, u0: 6.7, u1: 10.4, y: 5.55, h: 1.75 }, { z: 0.23 });
  // the red double doors (the kit's black leaves behind): frames and a window each, 124 over them
  const red = K.mat('alu_clear', { tint: '#b5232a' }), gl = K.mat('glass_storefront');
  for (const a of [7.55, 8.45]) {
    K.box(red, a, a + 0.1, 0, 2.4, -0.1, -0.02, { c: 0.008 }); K.box(red, a + 0.8, a + 0.9, 0, 2.4, -0.1, -0.02, { c: 0.008 });
    K.box(red, a, a + 0.9, 2.3, 2.4, -0.1, -0.02, { c: 0.008 }); K.box(red, a, a + 0.9, 0, 0.28, -0.1, -0.02, { c: 0.008 }); K.box(red, a, a + 0.9, 1.0, 1.08, -0.1, -0.02, { c: 0.008 });
    K.box(gl, a + 0.1, a + 0.8, 1.08, 2.3, -0.08, -0.06, { c: 0 }); K.box(gl, a + 0.1, a + 0.8, 0.28, 1.0, -0.08, -0.06, { c: 0 });
  }
  // Panda Express: the light oak slat fascia behind the roundel and the letters (u 24.6-30.7, 4.6-6.9)
  K.add(quadMesh(frame, woodSlats(6.1, 3.25, 9, { base: [176, 170, 160], bw: 0.1, dir: 'h' }), 24.6, 30.7, 3.2, 6.45, 0.03, { uv: [0, 1, 0, 1] }));
  K.sign({ kind: 'painted', text: '', logo: 'bid3:pandaMark', logoAt: 'fill', bg: null, u0: 25.2, u1: 26.8, y: 3.7, h: 1.6 }, { z: 0.06 });
  K.sign({ kind: 'channel', text: 'EXPRESS', font: 'Oswald-600', fg: '#d52b1e', bg: null, tracking: 0.25, u0: 27.4, u1: 30.6, y: 3.95, h: 0.45, lit: 'none' }, { z: 0.06 });
  K.sign({ kind: 'numbers', text: '124', font: 'Inter-700', fg: '#f2f2ee', bg: null, u0: 7.55, u1: 8.3, y: 2.55, h: 0.22, depth: 0.02, lit: 'none' }, { z: 0.02 });
  // the PANDA EXPRESS vertical sign at the east end of Panda's front: a black panel flat on the wall, the name in white running down it
  // (s124: u 24.2-24.85, 3.3-6.4 m); the letters stacked upright
  K.box(K.mat('plain', { tint: '#121212', rough: 0.5 }), 24.2, 24.85, 3.3, 6.4, 0.0, 0.1, { c: 0.01 });
  K.sign({ kind: 'painted', lines: ['P', 'A', 'N', 'D', 'A'], font: 'Oswald-700', fg: '#f4f4f0', bg: null, u0: 24.3, u1: 24.75, y: 4.95, h: 1.35 }, { z: 0.11 });
  K.sign({ kind: 'painted', lines: ['E', 'X', 'P', 'R', 'E', 'S', 'S'], font: 'Oswald-700', fg: '#f4f4f0', bg: null, u0: 24.33, u1: 24.72, y: 3.4, h: 1.45 }, { z: 0.11 });
  void group; void ctx; void spec;
}
export function shut120(group, ctx, spec, frame) {
  const K = frame.kit;
  // every edge's u read on both agrees within 0.3 m (sbs_b3/r120b_b3reg.jpg): the east gate 0.85-8.0, a dark steel pier 8.0-8.45 with two
  // floodlights, the west gate 8.45-14.75, a dark pier 14.75-15.6 under the poster; the fascia 0.6-15.6 (it runs 0.6 m past the
  // frame's west end over 124 W's first strip). Heights with the foot of the gates as the datum: gates to 3.5 m, the fascia 3.5-6.2 m
  // (w2: 4.55 / 7.2, read with the lens 0.4-0.5 m too high). The gates' steel: dark brown-grey and matt (bare slats (32,31,27) on
  // s120 and (33,32,28) on c120; b3a read (32,25,21) with #331e0d: a little less red now)
  const GT = 3.5, FT = 6.2, F0 = 0.6, F1 = 15.6;
  gates(frame, [[0.85, 8.0], [8.45, 14.75]], GT, 4, { base: '#332c1e', density: 1.0, bandTop: 0.34, rough: 0.86, metal: 0.02 });   // b3b (31,27,21) at #332616
  // the piers and the hood angle along the fascia's foot (dark painted steel)
  const steel = K.mat('plain', { tint: '#2a2927', rough: 0.72 });
  K.box(steel, 0.6, 0.85, 0, GT, -0.02, 0.06, { c: 0.008 });
  K.box(steel, 8.0, 8.45, 0, GT, -0.02, 0.08, { c: 0.008 });
  K.box(steel, 14.75, F1, 0, GT, -0.02, 0.05, { c: 0.008 });
  K.box(steel, F0, F1, GT - 0.07, GT + 0.03, 0, 0.1, { c: 0.006 });
  // two floodlights on a bar at the middle pier's top, over the fascia's foot, angled down at the gates
  { const hous = K.mat('plain', { tint: '#8e8f8b', rough: 0.5 });
    K.box(steel, 7.7, 8.75, 3.46, 3.52, 0.04, 0.14, { c: 0.004 });
    for (const a of [7.62, 8.42]) { K.box(hous, a, a + 0.4, 3.38, 3.74, 0.12, 0.44, { c: 0.025 }); K.box(K.mat('plain', { tint: '#d8d6cc', rough: 0.3 }), a + 0.04, a + 0.36, 3.39, 3.42, 0.14, 0.42, { c: 0 }); } }
  // the stucco fascia, light warm grey;
  // the ghost of the old script name after the capital (u 7.8-10.5, partly under the MOVED sheet)
  const fm = front(stuccoWall(F1 - F0, FT - GT, 120, { base: [152, 143, 132], ghost: [7.8 - F0, 10.5 - F0], ghostA: 0.09, streaks: 0.35, topSoot: 0.07 }));
  K.add(quadMesh(frame, fm, F0, F1, GT, FT, 0.012, { uv: [0, 1, 0, 1] }));
  // the dark metal cap over the fascia's top edge
  K.box(K.mat('plain', { tint: '#6e6a63', rough: 0.6 }), F0, F1, FT - 0.02, FT + 0.05, -0.02, 0.06, { c: 0.006 });
  // black raised letters (01740 h222: MENS WEAR u 0.8-5.06 at 3.64-4.51 m, SHOES u 12.2-14.85 at 3.68-4.40 m), the script capital F
  // u 5.45-7.44 with its dot at 7.67, 3.62-6.05 m
  // (b3b: the kit's channel letters read slate grey from their glossy faces; flat black decals 5 cm out, casting their shadow)
  // (b3c: the decal's capitals stood ~0.66 of the box: the boxes are sized for the measured capitals, the letters fitted to the width)
  for (const q of [textDecal(frame, 'MENS WEAR', 0.8, 5.06, 3.47, 4.79, 0.05, { fit: true }), textDecal(frame, 'SHOES', 12.2, 14.85, 3.54, 4.63, 0.05, { fit: true })]) { q.castShadow = true; K.add(q); }
  K.add(scriptF(frame, 5.4, 7.85, 3.6, 6.08, 0.035));
  K.sign({ kind: 'painted', lines: ['We have', 'MOVED', 'Visit our new location at', '136 W. 125th Street'], font: 'Inter-700', fg: '#ffffff', bg: '#d9322a', u0: 9.65, u1: 11.35, y: 3.5, h: 1.02 }, { z: 0.035 });
  // the poster on the west pier (dark navy, white block capitals: VISIT OUR BIG & TALL DEPT ON THE ...; s120 x 945-990, c124east)
  K.sign({ kind: 'painted', lines: ['VISIT', 'OUR', 'BIG', '&', 'TALL', 'DEPT', 'ON THE'], font: 'Inter-900', fg: '#eeeee8', bg: '#1d2536', u0: 14.82, u1: 15.52, y: 1.45, h: 1.8 }, { z: 0.06 });   // (0.62-0.78 m wide on c120 / c124east)
  // the sign pole at the kerb
  regPole(frame, 12.84, 5.6, 3.3, 'NO STANDING', 'Anytime');
  void group; void ctx; void spec;
}


// ================================================================== a NYC regulation sign on its pole (a small prop; props part: later)
// a 14 x 12 in (0.35 x 0.305 m) aluminium blank with rounded corners, a thin white border, white legend and the arrow, bolted to a
// 0.07 m steel post (two clamp bands, two bolt heads);
// plate standing to the right of the post at its top (centre 0.19 m off the axis), facing the street (+w). u, w: the post's place.
let _RS = null;
function regTex(l1, l2) {
  if (typeof document === 'undefined') return null;
  const W = 420, H = 400, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  if (!g || !g.fillRect) return null;
  g.fillStyle = '#c4232c'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#f2f0ea'; g.lineWidth = 9; g.strokeRect(14, 14, W - 28, H - 28);
  g.fillStyle = '#f6f4ee'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  // the legend fitted inside the border (PROPS 19:03: the 74 px line overflowed the plate as "NO STANDIN")
  const fit = (txt, px, y, maxW) => { let f = px; g.font = `bold ${f}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`; const w = g.measureText(txt).width; if (w > maxW) { f = Math.floor(px * maxW / w); g.font = `bold ${f}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`; } g.fillText(txt, 36, y); };
  fit(l1, 74, 140, W - 72); fit(l2, 62, 228, W - 72);
  // the arrow
  g.fillRect(36, 300, 270, 22); g.beginPath(); g.moveTo(306, 272); g.lineTo(386, 311); g.lineTo(306, 350); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function roundedRect(w, h, r) {
  const x = -w / 2, y = -h / 2, s = new THREE.Shape();
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function regPole(frame, u, w, yTop, l1, l2) {
  const K = frame.kit;
  if (!_RS) {
    const tex = regTex(l1, l2);
    _RS = {
      face: applyLightTrim(new THREE.MeshStandardMaterial(tex ? { map: tex, roughness: 0.4, metalness: 0.2 } : { color: 0xc4232c, roughness: 0.4, metalness: 0.2 })),
      back: applyLightTrim(new THREE.MeshStandardMaterial({ color: 0xb4b8bb, roughness: 0.45, metalness: 0.6 })),
      steel: applyLightTrim(new THREE.MeshStandardMaterial({ color: 0x8c9194, roughness: 0.5, metalness: 0.55 })),   // galvanised grey
      bolt: applyLightTrim(new THREE.MeshStandardMaterial({ color: 0x9a9fa3, roughness: 0.35, metalness: 0.8 })),
    };
  }
  const M = _RS, PW = 0.35, PH = 0.305, T = 0.003, cy = yTop - 0.17;
  // the post
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, yTop, 10).translate(0, yTop / 2, 0), M.steel);
  post.applyMatrix4(frame.matrix(u, 0, w)); post.castShadow = true; K.add(post);
  // the plate: its face (textured) and back (aluminium), standing right of the post (+u), clamped by two bands
  const sh = roundedRect(PW, PH, 0.03);
  const face = new THREE.Mesh(new THREE.ShapeGeometry(sh), M.face);
  { const uv = face.geometry.getAttribute('uv'), pos = face.geometry.getAttribute('position'); for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / PW + 0.5, pos.getY(i) / PH + 0.5); }
  face.position.set(PW / 2 + 0.02, 0, T / 2 + 0.001);
  const back = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: T, bevelEnabled: false }), M.back);
  back.position.set(PW / 2 + 0.02, 0, -T / 2);
  const grp = new THREE.Group(); grp.add(face, back);
  for (const dy of [0.085, -0.085]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.012), M.steel); band.position.set(0.0, dy, -0.012); grp.add(band);
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.008, 8).rotateX(Math.PI / 2), M.bolt); bolt.position.set(0.06, dy, T + 0.004); grp.add(bolt);
  }
  grp.applyMatrix4(frame.matrix(u, cy, w + 0.05));
  grp.rotateY(-0.12);
  grp.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  K.add(grp);
}

// ================================================================== 148 W 125th: the blue glass curtain wall
// 1972, four storeys (5.4-18.1 m): blue glass in a 1.67 m grid, narrow dark spandrels at each floor line, thin pale mullions
// The kit's spec draws the base, the shops and the cornice.
export function w148(group, ctx, spec, frame) {
  const K = frame.kit, L = frame.L;
  // McDonald's red awning band over its glass; the kit hangs its awnings from the fascia's top, over the letters, so it is drawn here (spec awning 'none')
  { const red = K.mat('panel_alu', { tint: '#b3162c', dirt: 0.2 }), dk = K.mat('panel_alu', { tint: '#3a1418', dirt: 0.2 });
    K.box(red, 8.4, 14.9, 3.4, 3.85, 0.0, 0.7, { c: 0.01 });
    K.box(dk, 8.45, 14.85, 3.37, 3.4, 0.05, 0.68, { c: 0 }); }
  const set = [['#1c3446', '#223d52', '#182e3e'], ['#203a4e', '#28445a', '#1c3446']].map((c, k) => ({
    vision: towerGlass('glass_tower_blue', c[0], 81 + k * 10), visionB: towerGlass('glass_tower_blue', c[1], 82 + k * 10), visionC: towerGlass('glass_tower_blue', c[2], 83 + k * 10),
    lit: towerGlass('glass_tower_blue', c[1], 84 + k * 10, [0xfff0dd, 0.5]),
  }));
  const M = { set, vision: set[0].vision, lit: set[0].lit, spandrel: towerGlass('glass_tower_blue', '#2a3d52', 89), mullion: paleMullion() };
  // (AR34 batch 3: the glass from 5.0 m, b3d s148; four floors of 3.275 m to 18.1)
  curtain(K, { axis: 'u', a0: 0.15, a1: L - 0.15, plane: 0.12, dir: 1, y0: 5.0, y1: 18.1, floor: 3.275, y1st: 5.0 + 3.275, pane: 1.67, span: [0.2, 0.36], mull: [0.05, 0.11], seed: 148, M, lit: 0.22 });
  // the dark head over the glass and the edge posts (grey metal returns)
  K.box(K.mat('panel_alu', { tint: '#aab0b4', dirt: 0.25 }), 0, 0.15, 5.0, 18.1, -0.02, 0.2, { c: 0.01 });
  K.box(K.mat('panel_alu', { tint: '#aab0b4', dirt: 0.25 }), L - 0.15, L, 5.0, 18.1, -0.02, 0.2, { c: 0.01 });
  void group; void ctx; void spec;
}

// ================================================================== 117 W 124th St, the 125th Street front: the drapes
// Floors 2-3 of the glass front carry pink and magenta pleated drapes behind the glass; the kit's curtain wall draws the glass, the shops and the canopy.
let _D = null;
function drapeMat() {
  if (_D) return _D;
  let map = null;
  if (typeof document !== 'undefined') {
    const W = 512, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    if (g && g.fillRect) {
      const pleats = 24, pw = W / pleats;
      for (let i = 0; i < pleats; i++) {
        const k = 0.8 + 0.2 * hash(i, 1, 5), r = 240 * k, gg = 74 * k, b = 130 * k;
        const gr = g.createLinearGradient(i * pw, 0, (i + 1) * pw, 0);
        gr.addColorStop(0, `rgb(${r * 0.82 | 0},${gg * 0.74 | 0},${b * 0.82 | 0})`);
        gr.addColorStop(0.5, `rgb(${Math.min(255, r * 1.1) | 0},${gg * 1.15 | 0},${Math.min(255, b * 1.1) | 0})`);
        gr.addColorStop(1, `rgb(${r * 0.78 | 0},${gg * 0.7 | 0},${b * 0.8 | 0})`);
        g.fillStyle = gr; g.fillRect(i * pw, 0, pw + 0.5, H);
      }
      const vg = g.createLinearGradient(0, 0, 0, H); vg.addColorStop(0, 'rgba(255,200,230,0.12)'); vg.addColorStop(1, 'rgba(40,0,20,0.18)');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
      map = new THREE.CanvasTexture(cv);
      map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4;
    }
  }
  _D = selfLit(0xffffff, 1.1, 0.9, 0.9);   // lit from inside by day too (the shop window dressing reads bright pink through the glass)
  if (map) { _D.map = map; _D.needsUpdate = true; } else _D.color.set('#c8346c');
  return _D;
}
export function w117(group, ctx, spec, frame) {
  const K = frame.kit, L = frame.L;
  const u0 = 12.1, u1 = Math.min(L - 0.8, 29.6), y0 = 3.7, y1 = 11.0;
  K.add(quadMesh(frame, drapeMat(), u0, u1, y0, y1, -0.3, { uv: [0, (u1 - u0) / 6.0, 0, 1] }));
  // Victoria's Secret's entrance canopy: a flat thin canopy over the revolving doors at about 3.75-3.95 m,
  // 1.3 m deep, a pale metal soffit and a fascia edge (the kit's awnings are sloped cloth; the spec's awning is 'none')
  { const cm = K.mat('panel_alu', { tint: '#d9dcdf', dirt: 0.15 });
    K.box(cm, 16.4, 22.6, 3.75, 3.95, 0.0, 1.3, { c: 0.01 });
    K.box(K.mat('panel_alu', { tint: '#9aa0a6', dirt: 0.2 }), 16.4, 22.6, 3.72, 3.75, 0.05, 1.25, { c: 0 }); }
  // the glass above (floors 4-7, 11.0-27.9): pale blue-grey tower glass in a 1.95 m grid with pale mullions
  const set = [['#7d93a6', '#899fb1', '#70869a']].map((c, k) => ({
    vision: towerGlass('glass_tower_blue', c[0], 91 + k * 10), visionB: towerGlass('glass_tower_blue', c[1], 92 + k * 10), visionC: towerGlass('glass_tower_blue', c[2], 93 + k * 10),
    lit: towerGlass('glass_tower_blue', c[1], 94 + k * 10, [0xfff0dd, 0.5]),
  }));
  const M = { set: [set[0], set[0], set[0]], vision: set[0].vision, lit: set[0].lit, spandrel: towerGlass('glass_tower_grey', '#4a5866', 99), mullion: paleMullion() };
  curtain(K, { axis: 'u', a0: 0.2, a1: L - 0.2, plane: 0.12, dir: 1, y0: 11.0, y1: 27.9, floor: 4.2, y1st: 15.2, pane: 1.95, span: [0.3, 0.7], mull: [0.05, 0.11], seed: 117, M, lit: 0.18 });
  void group; void ctx; void spec;
}

// ================================================================== 105 W 125th, the white two-storey block: the leasing graphics
// A magenta-to-navy wrap on the west store's glass and a poster on the white wall.
export function w105a(group, ctx, spec, frame) {
  const K = frame.kit, L = frame.L;
  // the white painted panels of the upper wall, a layer 12 mm
  // proud of the kit's wall with the clerestory's opening cut
  K.wall({ u0: 0.0, u1: L, y0: 4.7, y1: 13.2, holes: [{ u0: 0.4, u1: 18.2, y0: 5.05, y1: 8.15 }], mat: panelMat([236, 235, 230], 6.1, 3.75, { cols: 2, rows: 1, seed: 5, tone: 0.025, joint: 0.022, px: 90, amp: 4.5 }), w: 0.012 });
  // the clerestory band over the west two bays (u 0.4-18.2, 5.05-8.15 m): pale blue-grey mirror glass in 1.45 m panes between thin
  // pale mullions
  { const gl = towerGlass('glass_tower_grey', '#4a5250', 211), gl2 = towerGlass('glass_tower_grey', '#40474a', 212), mu = paleMullion();
    const a = 1.0, b = 18.0, n = Math.round((b - a) / 1.45), pw = (b - a) / n;
    for (let i = 0; i < n; i++) K.box(hash(i, 3, 5) < 0.3 ? gl2 : gl, a + i * pw + 0.03, a + (i + 1) * pw - 0.03, 5.1, 8.1, 0.02, 0.06, { c: 0, skip: 16 });
    for (let i = 0; i <= n; i++) K.box(mu, a + i * pw - 0.03, a + i * pw + 0.03, 5.05, 8.15, 0.0, 0.1, { c: 0.004 });
    K.box(mu, a, b, 6.55, 6.6, 0.0, 0.09, { c: 0 }); }
  K.sign({ kind: 'painted', text: '', logo: 'bid3:leaseWrap', logoAt: 'fill', bg: null, u0: 0.6, u1: 9.0, y: 0.35, h: 3.5 }, { z: -0.16 });
  K.sign({ kind: 'painted', text: '', logo: 'bid3:leasePoster', logoAt: 'fill', bg: null, u0: 19.9, u1: 22.7, y: 5.2, h: 2.9 }, { z: 0.03 });
  if (BF36) { const Wf = frame.face([2032.49, -2835.72, 2044.61, -2857.59]); if (Wf) w105aWest(Wf); }
  void group; void ctx; void spec;
}
// (BF36) the west wall over the State Office plaza: the white panels of the upper
// wall north of the glazed bays (as the front's), and a painted mural at the plaza's level north of them
const BF36 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('bf36') === '0');
function w105aWest(Wf) {
  // (the kit's u runs from the wall's north end: the glazed bays end at the 125th corner, u = L)
  const K = Wf.kit, L = Math.max(15.0, Wf.L || 34.64);
  K.wall({ u0: 0.0, u1: L - 9.3, y0: 4.7, y1: 13.2, mat: panelMat([236, 235, 230], 6.1, 3.75, { cols: 2, rows: 1, seed: 9, tone: 0.025, joint: 0.022, px: 90, amp: 4.5 }), w: 0.012 });
  const mm = muralPlaza(4.8, 3.9, 31);
  if (mm && K.F) K.add(quadMesh({ world: (u, y, w) => K.F.world(u, y, w), n: K.F.N }, mm, L - 14.4, L - 9.6, 0.35, 4.25, 0.02, { uv: [0, 1, 0, 1] }));
}
function muralPlaza(wM, hM, seed) {
  if (typeof document === 'undefined') return null;
  const pxm = 64, W = Math.round(wM * pxm), H = Math.round(hM * pxm);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  if (!g || !g.fillRect) return null;
  const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#3d6fa8'); sky.addColorStop(0.55, '#8fb6d6'); sky.addColorStop(1, '#e8dcc0');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  g.fillStyle = '#f2c14e'; g.beginPath(); g.arc(W * 0.78, H * 0.2, H * 0.11, 0, Math.PI * 2); g.fill();
  // brush-stroke clouds and a far skyline
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 9; i++) { const x = hash(i, seed, 1) * W, y = H * (0.08 + 0.3 * hash(i, seed, 2)); g.beginPath(); g.ellipse(x, y, W * (0.05 + 0.06 * hash(i, seed, 3)), H * 0.025, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#4a5a74';
  for (let x = 0; x < W;) { const w = W * (0.04 + 0.05 * hash(x, seed, 4)), h = H * (0.12 + 0.18 * hash(x, seed, 5)); g.fillRect(x, H * 0.62 - h, w, h); x += w + W * 0.006; }
  // figures: heads, shoulders and coats in warm browns, ochres and reds, a crowd walking left to right, larger in front
  const skin = ['#5a3826', '#7a4b31', '#8f5c3c', '#4a2e20', '#a06a45'], coat = ['#b23a2e', '#d08a2c', '#2e5d8a', '#6b3f7a', '#2f7a5a', '#e0d2b0', '#3a3a44'];
  for (let k = 0; k < 9; k++) {
    const s = 0.55 + 0.45 * (k / 8), x = W * (0.05 + 0.92 * hash(k, seed, 6)), base = H * (0.98 - 0.25 * (1 - s)), hh = H * 0.42 * s;
    g.fillStyle = coat[Math.floor(hash(k, seed, 7) * coat.length)];
    g.beginPath(); g.moveTo(x - hh * 0.22, base); g.quadraticCurveTo(x - hh * 0.26, base - hh * 0.62, x, base - hh * 0.7); g.quadraticCurveTo(x + hh * 0.26, base - hh * 0.62, x + hh * 0.22, base); g.closePath(); g.fill();
    g.fillStyle = skin[Math.floor(hash(k, seed, 8) * skin.length)];
    g.beginPath(); g.ellipse(x, base - hh * 0.8, hh * 0.1, hh * 0.12, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(20,16,14,0.55)'; g.beginPath(); g.ellipse(x, base - hh * 0.87, hh * 0.105, hh * 0.06, 0, Math.PI, Math.PI * 2); g.fill();
  }
  // leaves at the lower corners, a painted border and the wall's weathering (a few chips and a grime fade at the foot)
  for (let i = 0; i < 40; i++) {
    const left = i % 2 === 0, x = left ? W * 0.08 * hash(i, seed, 9) : W * (1 - 0.08 * hash(i, seed, 9)), y = H * (0.55 + 0.45 * hash(i, seed, 10));
    g.fillStyle = ['#2f6b3a', '#3f8a46', '#5ea35a'][i % 3]; g.beginPath(); g.ellipse(x, y, W * 0.022, H * 0.012, hash(i, seed, 11) * 3, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = '#f4efe2'; g.lineWidth = Math.max(4, W * 0.012); g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth);
  g.fillStyle = 'rgba(238,236,230,0.85)';
  for (let i = 0; i < 26; i++) g.fillRect(hash(i, seed, 12) * W, hash(i, seed, 13) * H, 2 + 5 * hash(i, seed, 14), 2 + 4 * hash(i, seed, 15));
  const fade = g.createLinearGradient(0, H * 0.85, 0, H); fade.addColorStop(0, 'rgba(60,52,44,0)'); fade.addColorStop(1, 'rgba(60,52,44,0.35)');
  g.fillStyle = fade; g.fillRect(0, H * 0.85, W, H * 0.15);
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  return applyLightTrim(new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
}
