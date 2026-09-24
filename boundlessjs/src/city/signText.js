// Street name text: a shared canvas atlas of real street names (the tile data
// has carried them since day one) and per-tile quad meshes glued onto the
// blade faces of every street sign instance. Unlit material so blades stay
// readable day and night.
import * as THREE from 'three';

const AW = 2048, AH = 4096, CW = 512, CH = 32; // 512 slots: street names + address plaques share it
const COLS = AW / CW, ROWS = AH / CH;
let atlas = null, ctx = null, tex = null, mat = null, next = 0;
const slots = new Map(); // NAME -> {uc, v0, v1, tw}
const stats = { names: 0, quads: 0 };
if (typeof window !== 'undefined') window.__SIGNTEXT = stats;

function slotFor(name) {
  if (!name) return null;
  const key = name.toUpperCase();
  let s = slots.get(key);
  if (s) return s;
  if (!atlas) {
    atlas = document.createElement('canvas');
    atlas.width = AW; atlas.height = AH;
    ctx = atlas.getContext('2d');
    tex = new THREE.CanvasTexture(atlas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
  }
  if (next >= COLS * ROWS) return null; // atlas full: distant dupes go blank
  const i = next++;
  const cx = (i % COLS) * CW, cy = ((i / COLS) | 0) * CH;
  ctx.font = '700 25px "Arial Narrow", Arial, sans-serif';
  ctx.fillStyle = '#f0f4ee';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  let t = key;
  while (ctx.measureText(t).width > CW - 20 && t.length > 3) t = t.slice(0, -1);
  const tw = ctx.measureText(t).width + 10;
  ctx.fillText(t, cx + CW / 2, cy + CH / 2 + 1);
  tex.needsUpdate = true;
  s = { uc: (cx + CW / 2) / AW, v0: 1 - (cy + CH) / AH, v1: 1 - cy / AH, tw };
  slots.set(key, s);
  stats.names = slots.size;
  return s;
}

export function signTextMaterial() {
  if (!mat) {
    slotFor('BROADWAY'); // force atlas creation so tex exists
    mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, side: THREE.FrontSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      depthWrite: false,
    });
  }
  return mat;
}

// signs: [{x, y, z, rot, nameA, nameB}] in world space; plaques (optional):
// [{x, y, z, ax, az, text}] single-face address numerals over doors. Returns
// a mesh of text quads, or null.
export function buildSignText(signs, plaques = []) {
  if (!signs.length && !plaques.length) return null;
  signTextMaterial();
  const pos = [], uv = [];
  const quad = (cx, cy, cz, ax, az, w, h, s, flip) => {
    // ax,az = blade long axis (unit); quad centered at (cx,cy,cz)
    const hx = ax * w / 2, hz = az * w / 2;
    const u0 = s.uc - (s.tw / AW) / 2, u1 = s.uc + (s.tw / AW) / 2;
    const A = [cx - hx, cy - h / 2, cz - hz], B = [cx + hx, cy - h / 2, cz + hz];
    const C = [cx + hx, cy + h / 2, cz + hz], D = [cx - hx, cy + h / 2, cz - hz];
    const va = flip ? [B, A, D, B, D, C] : [A, B, C, A, C, D];
    const ua = flip
      ? [[u1, s.v0], [u0, s.v0], [u0, s.v1], [u1, s.v0], [u0, s.v1], [u1, s.v1]]
      : [[u0, s.v0], [u1, s.v0], [u1, s.v1], [u0, s.v0], [u1, s.v1], [u0, s.v1]];
    for (let i = 0; i < 6; i++) { pos.push(...va[i]); uv.push(...ua[i]); }
  };
  for (const g of signs) {
    const sA = slotFor(g.nameA), sB = slotFor(g.nameB);
    const ca = Math.cos(g.rot), sa = Math.sin(g.rot);
    // local -> world for the kit's blade centers (local X axis -> (sin? ...)):
    // instancer applies rotY, local +X maps to (cos r, 0, -sin r)? we match the
    // kit convention used by companions: world = base + lx*[ca,0,-sa] + lz*[sa,0,ca]
    const L = (lx, ly, lz) => [g.x + lx * ca + lz * sa, g.y + ly, g.z - lx * sa + lz * ca];
    // furnitureKit's blades are box(w, 0.26, 0.03) placed with y as the
    // BOTTOM: blade A spans y 3.05..3.31, blade B 3.32..3.58, each 0.03 thick.
    // The text quads used the blade's bottom as their CENTRE, so a 0.2 m tall
    // name hung 0.10 m below the green field — half the letters floating in
    // air under the sign. Centre them on the blade instead, and stand 3 mm off
    // its face (0.015 half-thickness + 0.003) rather than 7 mm.
    const BLADE_A_MID = 3.05, BLADE_B_MID = 3.32;
    const FACE = 0.022;
    if (sA) {
      const w = Math.min(1.9, sA.tw * 0.0072);
      const c = L(0.6, BLADE_A_MID, 0);
      const axx = ca, axz = -sa; // blade A long axis = local X
      quad(c[0] + sa * FACE, c[1], c[2] + ca * FACE, axx, axz, w, 0.2, sA, false);
      quad(c[0] - sa * FACE, c[1], c[2] - ca * FACE, axx, axz, w, 0.2, sA, true);
    }
    if (sB) {
      const w = Math.min(1.55, sB.tw * 0.0072);
      const c = L(0, BLADE_B_MID, 0.45);
      const axx = sa, axz = ca; // blade B long axis = local Z
      quad(c[0] + ca * FACE, c[1], c[2] - sa * FACE, axx, axz, w, 0.2, sB, false);
      quad(c[0] - ca * FACE, c[1], c[2] + sa * FACE, axx, axz, w, 0.2, sB, true);
    }
  }
  // address numerals: one small front-facing quad above each entrance
  // assemble.js hands these in at 0.09 m off the wall — three times the
  // standoff a painted numeral plate should have, so each read as a card
  // hovering over the entrance. Pull them back to 0.03 along the wall's
  // exterior normal, which is (p.az, -p.ax) for the tangent it supplies.
  const PLAQUE_OFF = 0;
  for (const p of plaques) {
    const s2 = slotFor(p.text);
    if (!s2) continue;
    const w = Math.min(0.5, s2.tw * 0.004);
    quad(p.x + p.az * PLAQUE_OFF, p.y, p.z - p.ax * PLAQUE_OFF, p.ax, p.az, w, 0.17, s2, false);
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  stats.quads += pos.length / 18;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}
