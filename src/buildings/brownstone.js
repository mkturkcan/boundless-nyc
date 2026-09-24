// Harlem brownstone rowhouse (Strivers' Row / Mount Morris Park / W 130s-140s).
// Raised basement + high stoop over a sunken areaway, tall parlor floor with a
// molded entrance enframement, full architrave surrounds on every window,
// diminishing floor heights, deep bracketed sheet-metal cornice.
//
// LOCAL SPACE NOTE: the lot frame's z=0 is the PROPERTY LINE (sidewalk edge).
// A brownstone facade sits 2.4-3.0m behind it, so everything is built in the
// sub-frame `F` whose z=0 is the FACADE plane and +z runs out to the street;
// the areaway occupies F-space z in [0, AW].
import * as THREE from 'three';
import { at, punchedWall, shellWalls, flatRoof, roofGear, bayCenters } from './lib.js';
import {
  box, boxUV, quad, cylinder, lathe, compose, profileAlongX, ensureColor, shadeYRange, tmat,
} from '../geo.js';
import { brownstoneTexture, stoneTexture } from '../textures.js';

export const TYPE = 'brownstone';

const q05 = (v) => Math.round(v * 20) / 20;
const WALK_Y = 0.14;              // sidewalk top (matches city.js CURB_H)
const AREA_Y = 0.06;              // areaway paving top (a step below the walk)
const RECESS = 0.16;              // sash plane recess from the facade

// ---------------------------------------------------------------------------
// private materials (registered once, type-prefixed)
// ---------------------------------------------------------------------------
function ensureMaterials(B) {
  if (!B.M.has('brownstone:iron')) {
    // painted cast/wrought iron: low metalness satin — instance tint = color
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true, color: 0xffffff, roughness: 0.44, metalness: 0.16, envMapIntensity: 0.9,
    });
    m.userData.tileMeters = 1; m.name = 'brownstone:iron';
    B.M.set('brownstone:iron', m);
  }
  if (!B.M.has('brownstone:parge')) {
    // restored / parged brownstone — warm light sandstone (#8A7566 range)
    const t = brownstoneTexture({ hue: 21, sat: 17, light: 45, seed: 71 });
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true, map: t.map, roughness: 0.88, envMapIntensity: 0.5,
    });
    m.userData.tileMeters = t.tileMeters; m.name = 'brownstone:parge';
    B.M.set('brownstone:parge', m);
  }
  if (!B.M.has('brownstone:rustic')) {
    // rock-faced / rusticated coursed base
    const t = stoneTexture({ base: '#6b4a3a', blockW: 1.05, blockH: 0.40, jointDark: 0.5, weather: 0.3, seed: 72 });
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true, map: t.map, roughness: 0.94, envMapIntensity: 0.42,
    });
    m.userData.tileMeters = t.tileMeters; m.name = 'brownstone:rustic';
    B.M.set('brownstone:rustic', m);
  }
}

// Split a full-width horizontal band around a set of x-holes -> [[cx, w], ...]
function bandSegs(width, holes) {
  const hs = [...holes].sort((a, b) => a.x0 - b.x0);
  const out = [];
  let px = -width / 2;
  for (const h of hs) {
    if (h.x0 > px + 0.02) out.push([(px + h.x0) / 2, h.x0 - px]);
    px = Math.max(px, h.x1);
  }
  if (px < width / 2 - 0.02) out.push([(px + width / 2) / 2, width / 2 - px]);
  return out;
}

// ---------------------------------------------------------------------------
// WINDOW ARCHITRAVE — molded enframement round the opening. THE brownstone
// signature. Anchor: x centered, y = opening bottom, z = wall face.
// ---------------------------------------------------------------------------
function architravePart(B, w, h, mat) {
  w = q05(w); h = q05(h);
  const id = `brownstone:arch:${mat}:${w}x${h}`;
  if (!B.hasPart(id)) {
    const jw = 0.17, pj = 0.065;
    const items = [];
    for (const s of [-1, 1]) {
      const g = box(jw, h + 0.14, pj); boxUV(g, jw, h + 0.14, pj, 2);
      items.push({ geom: g, x: s * (w / 2 + jw / 2), y: -0.05, z: pj / 2 });
      const b = box(0.05, h + 0.05, pj + 0.035);
      boxUV(b, 0.05, h + 0.05, pj + 0.035, 2);
      items.push({ geom: b, x: s * (w / 2 + 0.025), y: -0.03, z: (pj + 0.035) / 2 });
    }
    const hb = box(w + jw * 2, 0.155, pj); boxUV(hb, w + jw * 2, 0.155, pj, 2);
    items.push({ geom: hb, x: 0, y: h, z: pj / 2 });
    const hbead = box(w + 0.10, 0.05, pj + 0.035);
    boxUV(hbead, w + 0.10, 0.05, pj + 0.035, 2);
    items.push({ geom: hbead, x: 0, y: h - 0.03, z: (pj + 0.035) / 2 });
    for (const s of [-1, 1]) {                    // crossette "ears"
      const e = box(jw + 0.07, 0.13, pj + 0.02);
      boxUV(e, jw + 0.07, 0.13, pj + 0.02, 2);
      items.push({ geom: e, x: s * (w / 2 + jw / 2 - 0.01), y: h + 0.02, z: (pj + 0.02) / 2 });
    }
    B.definePart(id, compose(items), mat);
  }
  return id;
}

// ---------------------------------------------------------------------------
// LINTEL / WINDOW HEAD. Anchor: x centered, y = top of opening (the architrave
// head band occupies the first 0.155m; the lintel stacks above it).
// ---------------------------------------------------------------------------
function lintelPart(B, w, style, mat, big) {
  w = q05(w);
  const id = `brownstone:lin:${mat}:${style}:${big ? 'B' : 'S'}:${w}`;
  if (B.hasPart(id)) return id;
  const jw = 0.17;
  const ow = w + jw * 2;
  const items = [];
  const y0 = 0.155;
  const S = big ? 1 : 0.7;
  const push = (bw, bh, bd, yy) => {
    const g = box(bw, bh, bd); boxUV(g, bw, bh, bd, 2);
    items.push({ geom: g, x: 0, y: yy, z: bd / 2 });
  };

  if (style === 'bracketed') {
    const bh = 0.30 * S + 0.08;
    for (const s of [-1, 1]) {
      const g = box(0.155, bh, 0.27); boxUV(g, 0.155, bh, 0.27, 2);
      items.push({ geom: g, x: s * (ow / 2 - 0.075), y: y0, z: 0.135 });
      const n = box(0.185, 0.075, 0.32); boxUV(n, 0.185, 0.075, 0.32, 2);
      items.push({ geom: n, x: s * (ow / 2 - 0.075), y: y0 + bh - 0.075, z: 0.16 });
      const v = cylinder(0.05, 0.05, 0.16, 8); v.rotateZ(Math.PI / 2);
      items.push({ geom: v, x: s * (ow / 2 - 0.075), y: y0 + 0.05, z: 0.235 });
    }
    push(ow - 0.32, bh - 0.09, 0.09, y0 + 0.02);
    push(ow + 0.10, 0.075, 0.29, y0 + bh);
    push(ow + 0.24, 0.11, 0.39, y0 + bh + 0.075);
    push(ow + 0.30, 0.06, 0.44, y0 + bh + 0.185);
  } else if (style === 'palmette') {
    push(ow + 0.06, 0.10, 0.19, y0);
    push(ow + 0.16, 0.07, 0.26, y0 + 0.10);
    const fw = ow * 0.60;
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      push(fw * (1 - t * 0.55), 0.075 * S + 0.03, 0.19 - t * 0.03, y0 + 0.17 + i * (0.075 * S + 0.03));
    }
    for (const s of [-1, 1]) {
      const g = box(0.19, 0.10, 0.16); boxUV(g, 0.19, 0.10, 0.16, 2);
      items.push({ geom: g, x: s * (fw / 2 + 0.10), y: y0 + 0.185, z: 0.08 });
    }
  } else if (style === 'segArch') {
    const rise = ow * (big ? 0.17 : 0.12);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      const bw = ow / n;
      const g = box(bw * 0.97, 0.21, 0.15); boxUV(g, bw, 0.21, 0.15, 2);
      items.push({ geom: g, x: t * ow, y: y0 + rise * (1 - 4 * t * t) * 0.9, z: 0.075 });
    }
    const k = box(0.20, 0.28, 0.19); boxUV(k, 0.20, 0.28, 0.19, 2);
    items.push({ geom: k, x: 0, y: y0 + rise * 0.85, z: 0.095 });
    push(ow + 0.14, 0.07, 0.25, y0 + rise + 0.20);
  } else {                                          // 'flat' molded slab
    push(ow + 0.04, 0.11, 0.15, y0);
    push(ow + 0.16, 0.085, 0.25, y0 + 0.11);
    push(ow + 0.22, 0.055, 0.30, y0 + 0.195);
    if (big) push(ow + 0.26, 0.05, 0.34, y0 + 0.25);
  }
  B.definePart(id, compose(items), mat);
  return id;
}

// Heavy projecting sill (+ apron panel on parlor windows).
function sillPart(B, w, mat, apron) {
  w = q05(w);
  const id = `brownstone:sill:${mat}:${apron ? 'a' : 'p'}:${w}`;
  if (!B.hasPart(id)) {
    const items = [];
    const sw = w + 0.44;
    const g = box(sw, 0.11, 0.155); boxUV(g, sw, 0.11, 0.155, 2);
    items.push({ geom: g, x: 0, y: -0.11, z: 0.0575 });
    const u = box(sw - 0.08, 0.055, 0.10); boxUV(u, sw - 0.08, 0.055, 0.10, 2);
    items.push({ geom: u, x: 0, y: -0.165, z: 0.03 });
    if (apron) {
      const a = box(w + 0.06, 0.22, 0.05); boxUV(a, w + 0.06, 0.22, 0.05, 2);
      items.push({ geom: a, x: 0, y: -0.40, z: 0.015 });
    }
    B.definePart(id, compose(items), mat);
  }
  return id;
}

// Iron window guard / basement grille.
function guardPart(B, w, h, kind) {
  w = q05(w); h = q05(h);
  const id = `brownstone:guard:${kind}:${w}x${h}`;
  if (!B.hasPart(id)) {
    const items = [];
    const n = Math.max(3, Math.round(w / 0.115));
    for (let i = 1; i < n; i++) {
      items.push({ geom: box(0.018, h - 0.04, 0.018), x: -w / 2 + (w / n) * i, y: 0.02, z: 0 });
    }
    for (const ry of [0.03, h / 2, h - 0.05]) {
      items.push({ geom: box(w - 0.02, 0.024, 0.024), x: 0, y: ry, z: 0 });
    }
    if (kind === 'scroll') {
      for (let i = 0; i < 3; i++) {
        const t = new THREE.TorusGeometry(0.07, 0.011, 4, 8, Math.PI * 1.4);
        items.push({ geom: t, x: -w / 3 + (w / 3) * i, y: h / 2 + 0.085, z: 0 });
      }
    }
    B.definePart(id, compose(items), 'brownstone:iron');
  }
  return id;
}

// ---------------------------------------------------------------------------
// STOOP — solid stone mass, ramping cheek walls, VOID under the top landing so
// the under-stoop service entrance reads. Instanced by (clearW, steps).
// Anchor: x centered on the door bay, y = 0, z = 0 facade plane, extends +z.
// `steps` = riser count; landing top lands at WALK_Y + steps*riser.
// ---------------------------------------------------------------------------
function stoopPart(B, clearW, steps, riser, tread, landD, cheekT, mat) {
  clearW = q05(clearW);
  const id = `brownstone:stoop:${mat}:${clearW}:${steps}`;
  const totalProj = landD + (steps - 1) * tread;
  const landY = WALK_Y + steps * riser;
  if (B.hasPart(id)) return { id, totalProj, landY };
  const items = [];
  const reveal = 0.20;
  // solid mass under the run, down to the areaway floor
  {
    const d = totalProj - landD;
    const g = box(clearW, WALK_Y + riser + 0.10, d);
    boxUV(g, clearW, WALK_Y + riser, d, 2);
    items.push({ geom: g, x: 0, y: -0.10, z: landD + d / 2 });
  }
  // treads
  for (let s = 0; s < steps - 1; s++) {
    const d = totalProj - landD - s * tread;
    const g = box(clearW, riser + 0.02, d);
    boxUV(g, clearW, riser, d, 2);
    items.push({ geom: g, x: 0, y: WALK_Y + s * riser, z: landD + d / 2 });
  }
  // top landing slab (void beneath -> under-stoop entrance)
  {
    const g = box(clearW + 0.06, 0.34, landD + 0.06);
    boxUV(g, clearW, 0.34, landD, 2);
    items.push({ geom: g, x: 0, y: landY - 0.34, z: (landD + 0.06) / 2 });
  }
  for (const side of [-1, 1]) {
    const cx = side * (clearW / 2 + cheekT / 2);
    // stepped cheek mass
    for (let s = 0; s < steps - 1; s++) {
      const top = WALK_Y + (s + 1) * riser + reveal;
      const g = box(cheekT, top + 0.10, tread);
      boxUV(g, cheekT, top, tread, 2);
      items.push({ geom: g, x: cx, y: -0.10, z: totalProj - (s + 1) * tread + tread / 2 });
    }
    // landing pedestal + cap
    const g = box(cheekT, landY + reveal + 0.10, landD);
    boxUV(g, cheekT, landY + reveal, landD, 2);
    items.push({ geom: g, x: cx, y: -0.10, z: landD / 2 });
    const cap = box(cheekT + 0.10, 0.085, landD + 0.07);
    boxUV(cap, cheekT + 0.10, 0.085, landD, 2);
    items.push({ geom: cap, x: cx, y: landY + reveal, z: landD / 2 });
    // smooth ramping coping over the stair
    const zB = totalProj, zT = landD;
    const yB = WALK_Y + riser + reveal, yT = landY + reveal;
    const L = Math.hypot(zB - zT, yT - yB);
    const ang = Math.atan2(yT - yB, zB - zT);
    const cg = box(cheekT + 0.09, 0.085, L + 0.05);
    boxUV(cg, cheekT + 0.09, 0.085, L, 2);
    items.push({ geom: cg, x: cx, y: (yB + yT) / 2 - 0.04, z: (zB + zT) / 2, rx: ang });
    // newel block at the foot
    const nh = WALK_Y + riser + reveal + 0.34;
    const nb = box(cheekT + 0.14, nh + 0.10, cheekT + 0.16);
    boxUV(nb, cheekT + 0.14, nh, cheekT + 0.16, 2);
    items.push({ geom: nb, x: cx, y: -0.10, z: totalProj + 0.03 });
    const nc = box(cheekT + 0.24, 0.09, cheekT + 0.26);
    boxUV(nc, cheekT + 0.24, 0.09, cheekT + 0.26, 2);
    items.push({ geom: nc, x: cx, y: nh, z: totalProj + 0.03 });
  }
  B.definePart(id, compose(items), mat);
  return { id, totalProj, landY };
}

function stoopRailPart(B, clearW, steps, riser, tread, landD, cheekT, kind) {
  clearW = q05(clearW);
  const id = `brownstone:rail:${kind}:${clearW}:${steps}`;
  if (B.hasPart(id)) return id;
  const totalProj = landD + (steps - 1) * tread;
  const landY = WALK_Y + steps * riser;
  const reveal = 0.20, railH = 0.86;
  const items = [];
  for (const side of [-1, 1]) {
    const cx = side * (clearW / 2 + cheekT / 2);
    const zB = totalProj, zT = landD;
    const yB = WALK_Y + riser + reveal, yT = landY + reveal;
    const L = Math.hypot(zB - zT, yT - yB);
    const ang = Math.atan2(yT - yB, zB - zT);
    for (const [hy, sec] of [[railH, 0.055], [railH * 0.30, 0.028]]) {
      items.push({
        geom: box(sec + 0.02, sec, L), x: cx,
        y: (yB + yT) / 2 + hy, z: (zB + zT) / 2, rx: ang,
      });
    }
    const n = Math.max(4, Math.round(L / 0.125));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      items.push({
        geom: box(0.021, railH, 0.021), x: cx,
        y: yB + (yT - yB) * t, z: zB + (zT - zB) * t,
      });
    }
    if (kind === 'cast') {
      const m = Math.max(2, Math.floor(n / 3));
      for (let i = 1; i <= m; i++) {
        const t = i / (m + 1);
        const z = zB + (zT - zB) * t, y = yB + (yT - yB) * t;
        const tor = new THREE.TorusGeometry(0.10, 0.013, 4, 9, Math.PI * 1.55);
        items.push({ geom: tor, x: cx, y: y + railH * 0.54, z, ry: Math.PI / 2, rz: t * 1.2 });
        const tor2 = new THREE.TorusGeometry(0.072, 0.012, 4, 8, Math.PI * 1.3);
        items.push({ geom: tor2, x: cx, y: y + railH * 0.24, z: z - 0.085, ry: Math.PI / 2, rz: -t });
      }
    }
    // landing rail
    items.push({ geom: box(0.075, 0.055, landD), x: cx, y: yT + railH, z: landD / 2 });
    const nn = Math.max(2, Math.round(landD / 0.13));
    for (let i = 0; i <= nn; i++) {
      items.push({ geom: box(0.021, railH, 0.021), x: cx, y: yT, z: (landD / nn) * i });
    }
    const post = lathe([
      [0.055, 0], [0.085, 0.05], [0.062, 0.12], [0.05, 0.70],
      [0.085, 0.77], [0.062, 0.84], [0.075, 0.90], [0.035, 0.98], [0, 1.01],
    ], 8);
    items.push({ geom: post, x: cx, y: WALK_Y + riser + reveal + 0.30, z: totalProj + 0.03 });
    items.push({ geom: post, x: cx, y: yT + 0.04, z: 0.07 });
  }
  B.definePart(id, compose(items), 'brownstone:iron');
  return id;
}

// ---------------------------------------------------------------------------
// AREAWAY IRONWORK
// ---------------------------------------------------------------------------
function fencePart(B, len) {
  len = Math.max(0.5, Math.round(len * 4) / 4);
  const id = `brownstone:fence:${len}`;
  if (!B.hasPart(id)) {
    const items = [];
    const h = 0.98;
    items.push({ geom: box(len, 0.042, 0.042), x: 0, y: h - 0.042, z: 0 });
    items.push({ geom: box(len, 0.03, 0.03), x: 0, y: 0.10, z: 0 });
    const n = Math.max(2, Math.round(len / 0.125));
    for (let i = 0; i <= n; i++) {
      const x = -len / 2 + (len / n) * i;
      items.push({ geom: box(0.019, h + 0.07, 0.019), x, y: 0.02, z: 0 });
      const tip = new THREE.ConeGeometry(0.019, 0.055, 4);
      tip.translate(0, 0.0275, 0);
      items.push({ geom: tip, x, y: h + 0.09, z: 0 });
    }
    B.definePart(id, compose(items), 'brownstone:iron');
  }
  return id;
}

function fencePostPart(B) {
  const id = 'brownstone:fpost';
  if (!B.hasPart(id)) {
    const items = [];
    items.push({ geom: box(0.10, 1.16, 0.10), x: 0, y: 0, z: 0 });
    items.push({ geom: box(0.145, 0.055, 0.145), x: 0, y: 1.12, z: 0 });
    items.push({ geom: box(0.115, 0.075, 0.115), x: 0, y: 1.17, z: 0 });
    items.push({ geom: new THREE.SphereGeometry(0.058, 7, 5), x: 0, y: 1.29, z: 0 });
    items.push({ geom: new THREE.TorusGeometry(0.032, 0.011, 4, 8), x: 0, y: 0.72, z: 0.052 });
    B.definePart(id, compose(items), 'brownstone:iron');
  }
  return id;
}

function gatePart(B, w) {
  w = q05(w);
  const id = `brownstone:gate:${w}`;
  if (!B.hasPart(id)) {
    const items = [];
    const h = 1.02;
    items.push({ geom: box(w, 0.04, 0.04), x: 0, y: h - 0.04, z: 0 });
    items.push({ geom: box(w, 0.032, 0.032), x: 0, y: 0.42, z: 0 });
    items.push({ geom: box(w, 0.03, 0.03), x: 0, y: 0.07, z: 0 });
    for (const s of [-1, 1]) items.push({ geom: box(0.032, h, 0.032), x: s * w / 2, y: 0, z: 0 });
    const n = Math.max(3, Math.round(w / 0.12));
    for (let i = 1; i < n; i++) {
      items.push({ geom: box(0.017, h - 0.05, 0.017), x: -w / 2 + (w / n) * i, y: 0.03, z: 0 });
    }
    for (let i = 0; i < 2; i++) {
      const t = new THREE.TorusGeometry(0.085, 0.012, 4, 9, Math.PI * 1.5);
      items.push({ geom: t, x: -w / 4 + (w / 2) * i, y: 0.60, z: 0, rz: i * 2.0 });
    }
    B.definePart(id, compose(items), 'brownstone:iron');
  }
  return id;
}

function serviceGatePart(B, w, h) {
  w = q05(w); h = q05(h);
  const id = `brownstone:sgate:${w}x${h}`;
  if (!B.hasPart(id)) {
    const items = [];
    for (const s of [-1, 1]) items.push({ geom: box(0.035, h, 0.035), x: s * (w / 2 - 0.02), y: 0, z: 0 });
    for (const yy of [0.02, h * 0.45, h * 0.72, h - 0.03]) {
      items.push({ geom: box(w - 0.02, 0.028, 0.028), x: 0, y: yy, z: 0 });
    }
    const n = Math.max(4, Math.round(w / 0.11));
    for (let i = 1; i < n; i++) {
      items.push({ geom: box(0.017, h - 0.04, 0.017), x: -w / 2 + (w / n) * i, y: 0.02, z: 0 });
    }
    B.definePart(id, compose(items), 'brownstone:iron');
  }
  return id;
}

// Paired cornice console brackets.
function bracketPart(B, mat) {
  const id = `brownstone:cbracket:${mat}`;
  if (!B.hasPart(id)) {
    const items = [];
    for (const s of [-1, 1]) {
      const x = s * 0.105;
      const g = box(0.115, 0.34, 0.30); boxUV(g, 0.115, 0.34, 0.30, 2);
      items.push({ geom: g, x, y: 0.10, z: 0.155 });
      const t = box(0.155, 0.07, 0.36); boxUV(t, 0.155, 0.07, 0.36, 2);
      items.push({ geom: t, x, y: 0.42, z: 0.18 });
      const b = box(0.135, 0.085, 0.155); boxUV(b, 0.135, 0.085, 0.155, 2);
      items.push({ geom: b, x, y: 0.035, z: 0.085 });
      const v = cylinder(0.05, 0.05, 0.125, 8); v.rotateZ(Math.PI / 2);
      items.push({ geom: v, x, y: 0.15, z: 0.28 });
    }
    B.definePart(id, compose(items), mat);
  }
  return id;
}

function balusterPart(B, mat) {
  const id = `brownstone:baluster:${mat}`;
  if (!B.hasPart(id)) {
    B.definePart(id, lathe([
      [0.05, 0], [0.075, 0.03], [0.055, 0.09], [0.085, 0.17], [0.10, 0.26],
      [0.075, 0.35], [0.05, 0.42], [0.062, 0.47], [0.05, 0.52],
    ], 8), mat);
  }
  return id;
}

// ---------------------------------------------------------------------------
// generate
// ---------------------------------------------------------------------------
export function generate(ctx, lot, rng) {
  const { kit: K, batcher: B } = ctx;
  ensureMaterials(B);

  const W = lot.width;
  const commercial = !!lot.commercial;
  const floors = lot.stories || rng.weighted([[3, 40], [4, 38], [5, 12], [2, 10]]);
  const side = lot.mirror ? -1 : 1;            // stoops alternate down the row

  const AW = commercial ? 0.45 : q05(rng.range(2.55, 2.95));
  const F = at(lot.frame, 0, 0, -AW);
  const D = Math.max(11, (lot.depth || 16) - AW);

  // ---- row identity: material / trim / ironwork ---------------------------
  const variant = commercial
    ? rng.weighted([['stoneAll', 3], ['brickTrim', 3], ['stoneBaseBrick', 2]])
    : rng.weighted([['stoneAll', 38], ['stoneBaseBrick', 27], ['brickTrim', 25], ['limeAll', 10]]);
  const stoneMat = rng.weighted([['brownstone', 6], ['brownstone:parge', 2], ['brownstoneDark', 1.5]]);
  const brickMat = rng.weighted([['brickTan', 4], ['brickOrange', 3], ['brickRed', 3], ['brickBrown', 2]]);
  let upperMat, baseMat, trimMat;
  if (variant === 'stoneAll') { upperMat = stoneMat; baseMat = 'brownstone:rustic'; trimMat = stoneMat; }
  else if (variant === 'stoneBaseBrick') { upperMat = brickMat; baseMat = 'brownstone:rustic'; trimMat = stoneMat; }
  else if (variant === 'brickTrim') { upperMat = brickMat; baseMat = 'limestone'; trimMat = 'limestone'; }
  else { upperMat = 'limestone'; baseMat = 'limestone'; trimMat = 'limestone'; }
  const stoneBase = variant === 'stoneAll' || variant === 'stoneBaseBrick';

  // small per-house weathering step (rows were built identical, weathered apart)
  const soil = rng.range(0.90, 1.05);
  const tint = new THREE.Color(soil, soil * rng.range(0.985, 1.012), soil * rng.range(0.965, 1.01));
  const baseTint = tint.clone().multiplyScalar(0.94);
  const trimTint = tint.clone().multiplyScalar(rng.range(0.97, 1.08));
  const stoopTint = tint.clone().multiplyScalar(rng.range(0.95, 1.12));
  const cornColor = new THREE.Color(rng.weighted([
    [0x6e5040, 4], [0x211f1d, 3], [0x26382a, 1.5], [0xd8cfbc, 1.5], [0x8a8b86, 1],
  ]));
  const ironColor = new THREE.Color(rng.weighted([
    [0x1c1a18, 72], [0x1f2e22, 14], [0x33322f, 8], [0x4a2622, 6],
  ]));
  const doorColor = new THREE.Color(rng.weighted([
    [0x4a2e1e, 5], [0x1c1a18, 3], [0x1e3226, 2], [0x5e2320, 2], [0x6b4a30, 2],
  ]));
  const sashColor = new THREE.Color(rng.weighted([[0xe4e0d6, 4], [0x2a2724, 3], [0x1e3226, 1]]));

  const linStyle = rng.weighted([['bracketed', 34], ['flat', 26], ['palmette', 22], ['segArch', 18]]);
  const doorStyle = variant === 'brickTrim'
    ? rng.weighted([['roundArch', 6], ['hood', 3]])
    : rng.weighted([['hood', 6], ['roundArch', 2]]);
  const sashStyle = rng.weighted([['dh1', 62], ['dh2', 24], ['dh6', 14]]);
  const railKind = rng.weighted([['cast', 70], ['plain', 30]]);
  const hasBalcony = variant !== 'stoneAll' && rng.bool(0.42);
  const hasBalustrade = variant === 'brickTrim' && rng.bool(0.5);
  let bayKind = commercial ? 'none' : rng.weighted([['none', 62], ['parlor', 20], ['parlor2', 18]]);
  if (bayKind === 'parlor2' && floors < 3) bayKind = 'parlor';

  // ---- vertical stack: DIMINISHING floor heights --------------------------
  const parlorY = commercial ? 0.16 : 1.80;
  const groundH = commercial ? 3.9 : 0;
  const fh = [];
  let h0 = rng.range(3.62, 3.88);
  for (let f = 0; f < floors; f++) {
    fh.push(h0);
    h0 = Math.max(2.62, h0 * rng.range(0.875, 0.915));
  }
  const floorY = [];
  let yc = parlorY + groundH;
  for (let f = 0; f < floors; f++) { floorY.push(yc); yc += fh[f]; }
  const H = yc;                                  // wall top / cornice base
  const CORN_H = 0.95;

  // ---- window schedule (parlor nearly floor-length, diminishing upward) ---
  const WSPEC = [
    { w: 1.00, h: 2.35, sill: 0.32 },
    { w: 0.95, h: 1.90, sill: 0.78 },
    { w: 0.95, h: 1.75, sill: 0.75 },
    { w: 0.95, h: 1.60, sill: 0.72 },
    { w: 0.95, h: 1.50, sill: 0.70 },
  ];
  const spec = (f) => WSPEC[Math.min(f, WSPEC.length - 1)];
  const bWinW = 0.85, bWinH = 1.00, bWinY = 0.38;
  const wtY = parlorY - 0.26;                    // water table bottom

  const nUp = W >= 5.55 ? 3 : 2;
  const upXs = bayCenters(nUp, W, 0.46 + spec(1).w / 2);

  // parlor: entrance bay to one side, 1-2 windows beside it
  const doorW = W >= 5.3 ? 1.48 : 1.05;
  const doorH = 2.82;
  const doorTop = parlorY + doorH;
  const surW = doorW + 0.72;
  const doorX = side * (W / 2 - surW / 2 - 0.34);
  const strip = side > 0
    ? [-W / 2 + 0.42, doorX - surW / 2 - 0.34]
    : [doorX + surW / 2 + 0.34, W / 2 - 0.42];
  const pW = spec(0).w;
  const avail = strip[1] - strip[0];
  let parXs;
  if (bayKind !== 'none' || avail < pW * 2 + 0.95) parXs = [(strip[0] + strip[1]) / 2];
  else parXs = [strip[0] + pW / 2 + 0.08, strip[1] - pW / 2 - 0.08];
  const basXs = parXs;

  // ---- facade rows (real punched openings) --------------------------------
  const rows = [];
  const usDoorW = 0.92;
  const usDoorH = Math.max(1.25, wtY - 0.16);     // head tucked under the water table
  if (!commercial) {
    const ops = [{ x: doorX, w: usDoorW, y0: 0.08, y1: 0.08 + usDoorH }];
    for (const x of basXs) ops.push({ x, w: bWinW, y0: bWinY, y1: bWinY + bWinH });
    ops.sort((a, b) => a.x - b.x);
    rows.push({ y0: 0.06, y1: 0.08 + usDoorH + 0.02, openings: ops });
  }
  {
    const ops = [];
    if (commercial) {
      ops.push({ x: 0, w: W - 1.2, y0: 0.10, y1: groundH - 0.55 });
      rows.push({ y0: 0.08, y1: groundH - 0.5, openings: ops });
    } else {
      ops.push({
        x: doorX, w: doorW + 0.04, y0: parlorY,
        y1: doorTop + (doorStyle === 'roundArch' ? doorW / 2 : 0),
      });
      if (bayKind === 'none') {
        for (const x of parXs) {
          ops.push({
            x, w: pW, y0: floorY[0] + spec(0).sill,
            y1: floorY[0] + spec(0).sill + spec(0).h,
          });
        }
      }
      const top = Math.max(...ops.map((o) => o.y1)) + 0.02;
      ops.sort((a, b) => a.x - b.x);
      rows.push({ y0: parlorY - 0.02, y1: top, openings: ops });
    }
  }
  const upRows = [];
  for (let f = 1; f < floors; f++) {
    const s = spec(f);
    const yy = floorY[f] + s.sill;
    let xs = upXs;
    if (bayKind === 'parlor2' && f === 1) {
      const cx = parXs[0];
      const keep = upXs.filter((x) => Math.abs(x - cx) > 0.95);
      if (keep.length) xs = keep;
    }
    rows.push({ y0: yy, y1: yy + s.h, openings: xs.map((x) => ({ x, w: s.w })) });
    upRows.push({ f, y: yy, xs, s });
  }
  if (commercial) {
    const s0 = spec(0);
    const yy = floorY[0] + s0.sill;
    rows.push({ y0: yy, y1: yy + s0.h, openings: upXs.map((x) => ({ x, w: s0.w })) });
    upRows.unshift({ f: 0, y: yy, xs: upXs, s: s0 });
  }
  rows.sort((a, b) => a.y0 - b.y0);

  punchedWall(ctx, F, {
    width: W, height: H, depth: 0.36, mat: upperMat, tint,
    rows, grime: 0.20, aoTop: H,
  });

  // ---- rusticated base + water table + belt courses ----------------------
  if (!commercial) {
    const holes = [{ x0: doorX - usDoorW / 2 - 0.10, x1: doorX + usDoorW / 2 + 0.10 }];
    for (const x of basXs) holes.push({ x0: x - bWinW / 2 - 0.22, x1: x + bWinW / 2 + 0.22 });
    const nC = 4;
    const cH = (wtY - 0.02) / nC;
    for (let c = 0; c < nC; c++) {
      const yy = 0.02 + c * cH;
      const pr = c % 2 === 0 ? 0.075 : 0.048;
      for (const [cx, cw] of bandSegs(W, holes)) {
        B.addMerged(baseMat, box(cw, cH - 0.022, pr), at(F, cx, yy, pr / 2), { tint: baseTint, grime: 0.32 });
      }
    }
  }
  {
    const yy = commercial ? groundH - 0.12 : wtY;
    B.addMerged(trimMat, box(W, 0.10, 0.135), at(F, 0, yy, 0.0675), { tint: trimTint });
    B.addMerged(trimMat, box(W, 0.13, 0.105), at(F, 0, yy + 0.10, 0.0525), { tint: trimTint });
    B.addMerged(trimMat, box(W, 0.05, 0.145), at(F, 0, yy + 0.23, 0.0725), { tint: trimTint });
  }
  if ((variant === 'stoneBaseBrick' || variant === 'brickTrim') && floors >= 2) {
    const yy = floorY[1] - 0.28;
    B.addMerged(trimMat, box(W, 0.20, 0.09), at(F, 0, yy, 0.045), { tint: trimTint });
    B.addMerged(trimMat, box(W, 0.05, 0.125), at(F, 0, yy + 0.20, 0.0625), { tint: trimTint });
    if (variant === 'stoneBaseBrick' && !commercial) {
      // scored / channelled brownstone parlor level (photo: W 138th south side)
      const holes = [{ x0: doorX - surW / 2 - 0.06, x1: doorX + surW / 2 + 0.06 }];
      for (const x of parXs) holes.push({ x0: x - pW / 2 - 0.86, x1: x + pW / 2 + 0.86 });
      if (bayKind !== 'none') holes.push({ x0: strip[0] - 0.3, x1: strip[1] + 0.3 });
      for (let yy2 = parlorY + 0.10; yy2 < floorY[1] - 0.50; yy2 += 0.42) {
        for (const [cx, cw] of bandSegs(W, holes)) {
          B.addMerged(baseMat, box(cw, 0.38, 0.045), at(F, cx, yy2, 0.0225), { tint: baseTint });
        }
      }
    }
  }
  if (variant === 'brickTrim') {                 // limestone quoins (Strivers' Row)
    for (const s of [-1, 1]) {
      let yy = commercial ? groundH : parlorY - 0.05;
      let i = 0;
      while (yy < H - 0.55) {
        const bw = i % 2 === 0 ? 0.52 : 0.30;
        B.addMerged('limestone', box(bw, 0.36, 0.055), at(F, s * (W / 2 - bw / 2), yy, 0.0275), { tint: trimTint });
        yy += 0.415; i++;
      }
    }
  }

  // ---- windows -----------------------------------------------------------
  const glassTint = new THREE.Color().setHSL(0.57, 0.10, rng.range(0.32, 0.46));
  const litP = 0.42;
  const sootQuad = (w, yTop, x) => {
    const g = quad(w, 0.46);
    ensureColor(g);
    shadeYRange(g, 0, 0.46, 1.0, 0.52);
    B.addMerged(upperMat, g, at(F, x, yTop - 0.46, 0.016), { tint });
  };

  if (!commercial) {
    const aId = architravePart(B, bWinW, bWinH, trimMat);
    const sId = sillPart(B, bWinW, trimMat, false);
    const gId = guardPart(B, bWinW, bWinH, 'bar');
    for (const x of basXs) {
      const m = at(F, x, bWinY, 0);
      K.window({ w: bWinW, h: bWinH, style: 'dh1', recess: RECESS }, m, {
        tint: sashColor, glassTint, lit: rng.bool(0.36),
      });
      B.addInstance(aId, m, trimTint);
      B.addInstance(sId, m, trimTint);
      B.addInstance(gId, at(F, x, bWinY - 0.02, 0.075), ironColor);
    }
  }

  const placeWin = (x, yy, s, f) => {
    const m = at(F, x, yy, 0);
    K.window({ w: s.w, h: s.h, style: sashStyle, recess: RECESS }, m, {
      tint: sashColor, glassTint, lit: rng.bool(litP),
    });
    B.addInstance(architravePart(B, s.w, s.h, trimMat), m, trimTint);
    B.addInstance(sillPart(B, s.w, trimMat, f === 0), m, trimTint);
    B.addInstance(lintelPart(B, s.w, linStyle, trimMat, f === 0), at(F, x, yy + s.h, 0), trimTint);
    sootQuad(s.w + 0.34, yy - 0.20, x);
    if (f >= 1 && rng.bool(0.12)) K.acUnit(at(F, x, yy + 0.03, 0.06));
  };

  if (bayKind === 'none' && !commercial) {
    for (const x of parXs) placeWin(x, floorY[0] + spec(0).sill, spec(0), 0);
    if (rng.bool(0.45)) {                        // parlor-level iron window guards
      const gId = guardPart(B, pW, 1.0, 'scroll');
      for (const x of parXs) {
        B.addInstance(gId, at(F, x, floorY[0] + spec(0).sill - 0.02, 0.085), ironColor);
      }
    }
  }
  for (const r of upRows) for (const x of r.xs) placeWin(x, r.y, r.s, r.f);

  // ---- juliet balconies (cast iron, 2nd floor) ---------------------------
  if (hasBalcony && upRows.length) {
    const r = upRows.find((q) => q.f === 1) || upRows[0];
    const bid = 'brownstone:balcony';
    if (!B.hasPart(bid)) {
      const items = [];
      const bw = 1.45, bd = 0.42;
      items.push({ geom: box(bw, 0.055, bd), x: 0, y: -0.055, z: bd / 2 });
      items.push({ geom: box(bw, 0.04, 0.04), x: 0, y: 0.88, z: bd - 0.02 });
      for (const s of [-1, 1]) {
        items.push({ geom: box(0.04, 0.04, bd), x: s * (bw / 2 - 0.02), y: 0.88, z: bd / 2 });
      }
      const n = Math.round(bw / 0.125);
      for (let i = 0; i <= n; i++) {
        items.push({ geom: box(0.019, 0.9, 0.019), x: -bw / 2 + (bw / n) * i, y: 0, z: bd - 0.02 });
      }
      for (const s of [-1, 1]) {
        for (let i = 0; i <= 3; i++) {
          items.push({ geom: box(0.019, 0.9, 0.019), x: s * (bw / 2 - 0.02), y: 0, z: (bd / 3) * i });
        }
      }
      for (let i = 0; i < 4; i++) {
        const t = new THREE.TorusGeometry(0.10, 0.013, 4, 9, Math.PI * 1.5);
        items.push({ geom: t, x: -bw / 2 + 0.24 + i * (bw - 0.48) / 3, y: 0.32, z: bd - 0.02 });
      }
      for (const s of [-1, 1]) {                 // corbel scrolls under the floor
        const t = new THREE.TorusGeometry(0.13, 0.018, 4, 8, Math.PI);
        items.push({ geom: t, x: s * (bw / 2 - 0.10), y: -0.20, z: bd * 0.45, ry: Math.PI / 2 });
      }
      B.definePart(bid, compose(items), 'brownstone:iron');
    }
    for (const x of r.xs) if (rng.bool(0.7)) B.addInstance(bid, at(F, x, r.y, 0.02), ironColor);
  }

  // terracotta roundels on brick spandrels (W 138th/139th signature)
  if ((variant === 'stoneBaseBrick' || variant === 'brickTrim') && floors >= 3 && rng.bool(0.55)) {
    for (let f = 2; f < floors; f++) {
      const g = cylinder(0.17, 0.17, 0.06, 12);
      g.rotateX(Math.PI / 2);
      B.addMerged(trimMat, g, at(F, 0, floorY[f] - 0.62, 0.03), { tint: trimTint });
    }
  }

  // ---- canted bay / oriel over the parlor bay ----------------------------
  if (bayKind !== 'none') {
    const cx = parXs[0];
    const proj = 0.52, faceW = 1.42;
    const y0 = parlorY + 0.18;
    const y1 = bayKind === 'parlor2' ? floorY[2] - 0.34 : floorY[1] - 0.36;
    const winList = bayKind === 'parlor2' ? [0, 1] : [0];
    const frows = [];
    for (const f of winList) {
      const s = spec(f);
      const yy = floorY[f] + s.sill - y0;
      frows.push({ y0: yy, y1: yy + s.h, openings: [{ x: 0, w: s.w }] });
    }
    punchedWall(ctx, at(F, cx, y0, proj), {
      width: faceW, height: y1 - y0, depth: 0.24, mat: upperMat, tint, rows: frows, grime: 0.1,
    });
    for (const f of winList) {
      const s = spec(f);
      const yy = floorY[f] + s.sill;
      const m = at(F, cx, yy, proj);
      K.window({ w: s.w, h: s.h, style: sashStyle, recess: RECESS }, m, {
        tint: sashColor, glassTint, lit: rng.bool(litP),
      });
      B.addInstance(architravePart(B, s.w, s.h, trimMat), m, trimTint);
      B.addInstance(sillPart(B, s.w, trimMat, false), m, trimTint);
      B.addInstance(lintelPart(B, s.w, 'flat', trimMat, false), at(F, cx, yy + s.h, proj), trimTint);
    }
    const rl = proj * Math.SQRT2;
    for (const s of [-1, 1]) {
      punchedWall(ctx, at(F, cx + s * (faceW / 2 + proj / 2), y0, proj / 2, s * Math.PI / 4), {
        width: rl, height: y1 - y0, depth: 0.24, mat: upperMat, tint, rows: [], grime: 0.1,
      });
    }
    const bw = faceW + proj * 2 + 0.12;
    B.addMerged(trimMat, box(bw, 0.22, proj + 0.10), at(F, cx, y0 - 0.22, (proj + 0.10) / 2), { tint: trimTint });
    for (let i = -1; i <= 1; i++) {
      B.addMerged(trimMat, box(0.16, 0.36, proj * 0.8), at(F, cx + i * (faceW / 2 - 0.08), y0 - 0.58, proj * 0.4), { tint: trimTint });
    }
    B.addMerged(trimMat, box(bw + 0.10, 0.14, proj + 0.20), at(F, cx, y1, (proj + 0.20) / 2), { tint: trimTint });
    B.addMerged(trimMat, box(bw + 0.18, 0.07, proj + 0.28), at(F, cx, y1 + 0.14, (proj + 0.28) / 2), { tint: trimTint });
  }

  // ---- ENTRANCE ----------------------------------------------------------
  if (commercial) {
    K.storefront({
      width: W - 1.2, signIndex: rng.int(0, 31),
      awningIndex: rng.bool(0.4) ? rng.int(0, 7) : -1,
      gate: rng.bool(0.2) ? 1 : 0,
    }, at(F, 0, 0.12, 0));
    B.addMerged('sidewalk', box(W, 0.16, AW + 0.1), at(F, 0, -0.02, (AW + 0.1) / 2), {
      tint: new THREE.Color(0.92, 0.92, 0.9),
    });
  } else {
    {                                            // dark interior behind the door
      const g = box(doorW + 0.34, doorH + 1.0, 0.05);
      ensureColor(g, new THREE.Color(0.075, 0.07, 0.066));
      B.addMerged('paintFlat', g, at(F, doorX, parlorY, -0.40), { worldUV: false });
    }
    K.door({ w: doorW, h: doorH, transom: true }, at(F, doorX, parlorY, 0), { tint: doorColor });
    doorSurround(ctx, F, {
      doorX, doorW, doorH, parlorY, style: doorStyle, mat: trimMat, tint: trimTint,
      wallMat: upperMat, wallTint: tint,
    });
    const lid = 'brownstone:lantern';
    if (!B.hasPart(lid)) {
      const items = [];
      items.push({ geom: box(0.06, 0.13, 0.10), x: 0, y: 0, z: 0.05 });
      items.push({ geom: cylinder(0.018, 0.018, 0.14, 6), x: 0, y: 0.02, z: 0.13 });
      items.push({ geom: lathe([[0.0, 0], [0.075, 0.05], [0.065, 0.20], [0.03, 0.235], [0, 0.24]], 6), x: 0, y: -0.22, z: 0.16 });
      B.definePart(lid, compose(items), 'brownstone:iron');
    }
    for (const s of [-1, 1]) {
      B.addInstance(lid, at(F, doorX + s * (surW / 2 - 0.06), parlorY + 2.10, 0.045), ironColor);
    }
  }

  // ---- STOOP + AREAWAY ---------------------------------------------------
  if (!commercial) {
    const tread = 0.295, landD = 0.92, cheekT = 0.28;
    const rise = parlorY - WALK_Y;
    const steps = Math.max(7, Math.min(10, Math.round(rise / 0.181)));
    const riser = rise / steps;
    const clearW = Math.min(1.60, Math.max(1.26, W * 0.26));
    const stoopMat = stoneBase ? 'brownstone' : 'limestone';
    const { id: sid, totalProj } = stoopPart(B, clearW, steps, riser, tread, landD, cheekT, stoopMat);
    B.addInstance(sid, at(F, doorX, 0, 0), stoopTint);
    B.addInstance(stoopRailPart(B, clearW, steps, riser, tread, landD, cheekT, railKind),
      at(F, doorX, 0, 0), ironColor);
    const stoopSpan = [
      doorX - q05(clearW) / 2 - cheekT - 0.12,
      doorX + q05(clearW) / 2 + cheekT + 0.12,
    ];

    // under-stoop service entrance
    B.addInstance(serviceGatePart(B, usDoorW - 0.06, usDoorH - 0.06), at(F, doorX, 0.10, 0.055), ironColor);
    {
      const g = box(usDoorW + 0.12, usDoorH + 0.1, 0.05);
      ensureColor(g, new THREE.Color(0.05, 0.046, 0.044));
      B.addMerged('paintFlat', g, at(F, doorX, 0.06, -0.30), { worldUV: false });
    }

    // areaway paving (bluestone flags, a step below the sidewalk)
    B.addMerged('sidewalk', box(W - 0.06, 0.12, AW + 0.06), at(F, 0, AREA_Y - 0.12, (AW + 0.06) / 2), {
      tint: new THREE.Color(0.58, 0.60, 0.63),
    });
    {
      const vc = cylinder(0.20, 0.20, 0.03, 12);
      B.addMerged('brownstone:iron', vc, at(F, -side * (W * 0.22), AREA_Y - 0.005, AW * 0.45), {
        tint: new THREE.Color(0.20, 0.19, 0.18), worldUV: false,
      });
    }
    // areaway divider walls at the party lines
    for (const s of [-1, 1]) {
      B.addMerged(stoneBase ? baseMat : 'limestone', box(0.22, 0.94, AW - 0.06),
        at(F, s * (W / 2 - 0.11), AREA_Y - 0.08, (AW - 0.06) / 2 + 0.03), { tint: baseTint, grime: 0.25 });
      B.addMerged(trimMat, box(0.30, 0.065, AW - 0.06),
        at(F, s * (W / 2 - 0.11), AREA_Y + 0.86, (AW - 0.06) / 2 + 0.03), { tint: trimTint });
    }
    // low masonry wall + iron fence + gate at the property line
    const wallH = rng.range(0.30, 0.50);
    const gateW = 0.92;
    const gateX = -side * (W / 2 - gateW / 2 - 0.40);
    const holes = [
      { x0: stoopSpan[0], x1: stoopSpan[1] },
      { x0: gateX - gateW / 2 - 0.10, x1: gateX + gateW / 2 + 0.10 },
    ].sort((a, b) => a.x0 - b.x0);
    for (const [cx, cw] of bandSegs(W - 0.08, holes)) {
      B.addMerged(stoneBase ? baseMat : 'limestone', box(cw, wallH + 0.22, 0.24),
        at(F, cx, AREA_Y - 0.14, AW), { tint: baseTint, grime: 0.32 });
      B.addMerged(trimMat, box(cw, 0.07, 0.32), at(F, cx, AREA_Y + wallH + 0.08, AW), { tint: trimTint });
      if (cw > 0.4) B.addInstance(fencePart(B, cw - 0.16), at(F, cx, AREA_Y + wallH + 0.15, AW), ironColor);
    }
    const fp = fencePostPart(B);
    for (const h of holes) {
      for (const px of [h.x0, h.x1]) {
        if (px > -W / 2 + 0.06 && px < W / 2 - 0.06) {
          B.addInstance(fp, at(F, px, AREA_Y + wallH + 0.10, AW), ironColor);
        }
      }
    }
    B.addInstance(gatePart(B, gateW), at(F, gateX, AREA_Y + wallH + 0.15, AW), ironColor);
    for (let i = 0; i < 2; i++) {                // steps down into the areaway
      B.addMerged('limestone', box(gateW, 0.07, 0.30),
        at(F, gateX, AREA_Y - 0.07 + i * 0.05, AW - 0.20 - i * 0.30), { tint: trimTint });
    }
    if (rng.bool(0.7)) {
      for (let i = 0; i < rng.int(1, 2); i++) {
        K.trashCan(at(F, gateX + (i - 0.5) * 0.74, AREA_Y, AW * 0.40), {
          tint: new THREE.Color(rng.weighted([[0x1f2b22, 3], [0x24262a, 2], [0x2b2320, 1]])),
        });
      }
    }
  }

  // ---- CORNICE -----------------------------------------------------------
  {
    const prof = [
      [0.00, 0.00], [0.085, 0.02], [0.115, 0.075], [0.075, 0.115],
      [0.075, 0.44], [0.125, 0.475], [0.145, 0.55], [0.26, 0.585],
      [0.40, 0.665], [0.50, 0.755], [0.50, 0.835], [0.425, 0.875],
      [0.425, CORN_H], [0.00, CORN_H],
    ];
    // profileAlongX projects along -Z; ry=PI turns the profile out to the street
    B.addMerged('cornicePaint', profileAlongX(prof, W + 0.02), at(F, 0, H, 0, Math.PI), {
      tint: cornColor, worldUV: false,
    });
    const bId = bracketPart(B, 'cornicePaint');
    const span = W - 0.24;
    const n = Math.max(4, Math.round(span / 0.86));
    for (let i = 0; i <= n; i++) {
      B.addInstance(bId, at(F, -span / 2 + (span / n) * i, H + 0.08, 0.06), cornColor);
    }
    for (let dx = -W / 2 + 0.09; dx < W / 2 - 0.05; dx += 0.155) {
      B.addMerged('cornicePaint', box(0.078, 0.075, 0.11), at(F, dx, H + 0.475, 0.145), {
        tint: cornColor, worldUV: false,
      });
    }
    const wpan = span / n - 0.40;
    if (wpan > 0.16) {
      for (let i = 0; i < n; i++) {
        B.addMerged('cornicePaint', box(wpan, 0.22, 0.03),
          at(F, -span / 2 + (span / n) * (i + 0.5), H + 0.17, 0.09), { tint: cornColor, worldUV: false });
      }
    }
  }

  // ---- SHELL / ROOF ------------------------------------------------------
  const rearMat = upperMat.startsWith('brick') ? upperMat : 'brickBrown';
  const rearRows = [];
  const rearXs = bayCenters(2, W, W * 0.26);
  for (let f = 0; f < floors; f++) {
    const s = spec(f);
    const yy = floorY[f] + s.sill;
    rearRows.push({ y0: yy, y1: yy + s.h, openings: rearXs.map((x) => ({ x, w: 0.88 })) });
    for (const x of rearXs) {
      K.window({ w: 0.88, h: s.h, style: 'dh1' }, at(F, -x, yy, -D, Math.PI), {
        lit: rng.bool(0.40), tint: sashColor,
      });
    }
  }
  const sideRows = { left: null, right: null };
  if (lot.corner) {
    const sr = [];
    const sub = at(F, lot.corner * (W / 2), 0, -D / 2, lot.corner < 0 ? -Math.PI / 2 : Math.PI / 2);
    const xs = bayCenters(3, D, D * 0.22);
    for (let f = 0; f < floors; f++) {
      const s = spec(f);
      const yy = floorY[f] + s.sill;
      sr.push({ y0: yy, y1: yy + s.h, openings: xs.map((x) => ({ x, w: 0.88 })) });
      for (const x of xs) {
        K.window({ w: 0.88, h: s.h, style: sashStyle }, sub.clone().multiply(tmat(x, yy, 0)), {
          lit: rng.bool(0.36), tint: sashColor,
        });
      }
    }
    if (lot.corner < 0) sideRows.left = sr; else sideRows.right = sr;
  }
  shellWalls(ctx, F, { width: W, depth: D, height: H, mat: rearMat, tint, rearRows, sideRows });
  flatRoof(ctx, F, {
    width: W, depth: D, height: H, parapet: 0.42,
    mat: rearMat, tint, roofMat: rng.pick(['roofBlack', 'roofSilver']), copingMat: 'limestone',
  });

  if (hasBalustrade) {
    const bp = balusterPart(B, 'cornicePaint');
    B.addMerged('cornicePaint', box(W, 0.10, 0.30), at(F, 0, H + CORN_H, 0.10), { tint: cornColor, worldUV: false });
    for (let x = -W / 2 + 0.22; x < W / 2 - 0.12; x += 0.30) {
      B.addInstance(bp, at(F, x, H + CORN_H + 0.10, 0.22), cornColor);
    }
    B.addMerged('cornicePaint', box(W, 0.085, 0.34), at(F, 0, H + CORN_H + 0.62, 0.12), { tint: cornColor, worldUV: false });
    for (const s of [-1, 1]) {
      B.addMerged('cornicePaint', box(0.30, 0.72, 0.34), at(F, s * (W / 2 - 0.15), H + CORN_H + 0.05, 0.12), {
        tint: cornColor, worldUV: false,
      });
    }
  }

  // roof gear: chimneys on the party lines, NO water tower on a rowhouse
  roofGear(ctx, F, rng, {
    width: W * 0.7, depth: D, height: H,
    bulkhead: rng.bool(0.75), vents: rng.int(1, 2), chimney: false, antenna: false,
    mat: 'stucco',
  });
  for (let i = 0, nCh = rng.int(1, 3); i < nCh; i++) {
    K.chimney(at(F, (i % 2 === 0 ? -1 : 1) * (W / 2 - 0.42), H - 0.4, -D * rng.range(0.35, 0.85)), {
      w: rng.range(0.55, 0.72), h: rng.range(1.1, 2.0), mat: rng.pick(['brickRed', 'brickBrown']),
    });
  }
  B.addMerged('glass', box(1.25, 0.28, 1.75),
    at(F, rng.range(-W * 0.15, W * 0.15), H - 0.12, -D * rng.range(0.25, 0.4)), { worldUV: false });

  return { height: H + CORN_H };
}

// ---------------------------------------------------------------------------
// DOOR ENFRAMEMENT — projecting molded surround: pilasters, console brackets,
// entablature + cornice hood; or a molded round arch (Strivers' Row).
// ---------------------------------------------------------------------------
function doorSurround(ctx, F, {
  doorX, doorW, doorH, parlorY, style, mat, tint, wallMat, wallTint,
}) {
  const B = ctx.batcher;
  const add = (g, x, y, z) => B.addMerged(mat, g, at(F, x, y, z), { tint });

  if (style === 'roundArch') {
    const Ri = doorW / 2;
    const springY = parlorY + doorH;
    // step the rectangular punch down to the arch curve
    const nS = 5;
    for (let i = 0; i < nS; i++) {
      const t0 = (i / nS) * Ri, t1 = ((i + 1) / nS) * Ri;
      const fillW = Ri - Math.sqrt(Math.max(0, Ri * Ri - t0 * t0));
      if (fillW > 0.02) {
        for (const s of [-1, 1]) {
          B.addMerged(wallMat, box(fillW, t1 - t0, 0.36),
            at(F, doorX + s * (Ri - fillW / 2), springY + t0, -0.18), { tint: wallTint });
        }
      }
    }
    {                                            // dark tympanum + fanlight
      const g = box(doorW, Ri, 0.05);
      ensureColor(g, new THREE.Color(0.07, 0.065, 0.062));
      B.addMerged('paintFlat', g, at(F, doorX, springY - 0.02, -0.30), { worldUV: false });
      const fan = new THREE.CircleGeometry(Ri - 0.07, 12, 0, Math.PI);
      B.addMerged('glass', fan, at(F, doorX, springY - 0.04, -0.26), { worldUV: false });
    }
    const nA = 13, band = 0.24;
    for (let i = 0; i < nA; i++) {
      const a = Math.PI * ((i + 0.5) / nA);
      const r = Ri + band / 2;
      const seg = box(band, (Math.PI * r) / nA + 0.035, 0.15);
      seg.rotateZ(Math.PI / 2 - a);
      add(seg, doorX - Math.cos(a) * r, springY + Math.sin(a) * r, 0.075);
      const r2 = r + band / 2 + 0.035;
      const seg2 = box(0.09, (Math.PI * r2) / nA + 0.035, 0.20);
      seg2.rotateZ(Math.PI / 2 - a);
      add(seg2, doorX - Math.cos(a) * r2, springY + Math.sin(a) * r2, 0.10);
    }
    add(box(0.26, 0.32, 0.24), doorX, springY + Ri + band - 0.06, 0.12);
    add(box(0.44, 0.11, 0.28), doorX, springY + Ri + band + 0.26, 0.14);
    for (const s of [-1, 1]) {
      add(box(0.34, 0.20, 0.22), doorX + s * (Ri + 0.11), springY - 0.10, 0.11);
      add(box(0.40, 0.07, 0.26), doorX + s * (Ri + 0.11), springY + 0.10, 0.13);
      add(box(0.24, doorH - 0.10, 0.10), doorX + s * (doorW / 2 + 0.12), parlorY, 0.05);
      add(box(0.30, 0.14, 0.14), doorX + s * (doorW / 2 + 0.12), parlorY, 0.07);
    }
    return;
  }

  // ---- bracketed hood (Italianate / Neo-Grec) ---------------------------
  const pw = 0.31, pj = 0.115;
  const px = doorW / 2 + pw / 2 + 0.05;
  for (const s of [-1, 1]) {
    const cx = doorX + s * px;
    add(box(pw + 0.07, 0.30, pj + 0.035), cx, parlorY, (pj + 0.035) / 2);
    add(box(pw, doorH - 0.52, pj), cx, parlorY + 0.30, pj / 2);
    for (let i = -1; i <= 1; i++) {              // incised reeding
      add(box(0.045, doorH - 1.00, pj + 0.022), cx + i * 0.085, parlorY + 0.44, (pj + 0.022) / 2);
    }
    add(box(pw + 0.09, 0.10, pj + 0.045), cx, parlorY + doorH - 0.22, (pj + 0.045) / 2);
    add(box(pw + 0.14, 0.085, pj + 0.075), cx, parlorY + doorH - 0.12, (pj + 0.075) / 2);
    const bY = parlorY + doorH - 0.03;           // console bracket
    add(box(pw - 0.03, 0.46, 0.30), cx, bY, 0.15);
    add(box(pw + 0.04, 0.085, 0.36), cx, bY + 0.42, 0.18);
    for (let i = -1; i <= 1; i++) {
      add(box(0.05, 0.30, 0.335), cx + i * 0.085, bY + 0.06, 0.1675);
    }
    const v = cylinder(0.055, 0.055, 0.26, 8); v.rotateZ(Math.PI / 2);
    add(v, cx, bY + 0.075, 0.29);
  }
  const fY = parlorY + doorH + 0.02;             // reeded frieze
  add(box(doorW + 0.30, 0.34, 0.135), doorX, fY, 0.0675);
  for (let i = 0; i < 7; i++) {
    add(box(0.055, 0.20, 0.165), doorX - 0.42 + i * 0.14, fY + 0.07, 0.0825);
  }
  const hY = parlorY + doorH + 0.50;             // cornice hood
  add(box(doorW + 1.02, 0.09, 0.40), doorX, hY, 0.20);
  add(box(doorW + 1.12, 0.15, 0.49), doorX, hY + 0.09, 0.245);
  add(box(doorW + 1.20, 0.07, 0.55), doorX, hY + 0.24, 0.275);
  add(box(doorW + 1.12, 0.055, 0.46), doorX, hY + 0.31, 0.23);
  add(box(doorW + 0.12, 0.09, 0.08), doorX, parlorY + doorH - 0.02, 0.04);
}
