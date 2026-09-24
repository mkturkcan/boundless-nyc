// ============================================================================
// NYCHA PUBLIC-HOUSING TOWER — "tower in the park"
// Harlem / Williamsburg: Manhattanville, Clinton, Rangel, St Nicholas, Marcy.
// See docs/typology/05-nycha-tower.md.
//
// The identity is MASSING + RHYTHM, not ornament:
//   * cross / staggered-slab / in-line slab footprints composed from
//     rectangular volumes -> deep vertical shadow slots at the notches
//   * dead-uniform floor lines grade -> parapet (NO tall lobby storey)
//   * punched grid ~3.2 m o.c., openings 1.40 x 1.30, recessed 0.16
//   * paired 1/1 aluminium double-hungs, half-drawn shades, window ACs
//   * flat roof: brick parapet + thin precast coping + pipe rail + ONE central
//     brick penthouse (no water tower, no cornice, no fire escapes)
//   * lawn strip + bent-pipe hairpin fence in front (the superblock setback)
//
// Wall construction trick (keeps merged-box count low on a 16-storey tower):
// a punched grid = full-height brick PIERS (n+1 boxes) + full-width horizontal
// SPANDREL BANDS (floors+1 boxes), the bands sitting 4 mm behind the pier face.
// The pier side faces and the band top/bottom faces form the real reveals.
// ============================================================================
import * as THREE from 'three';
import { at } from './lib.js';
import { box, boxUV, quad, cylinder, compose, ensureColor, tmat } from '../geo.js';
import { brickTexture, stoneTexture, stuccoTexture } from '../textures.js';

export const TYPE = 'nycha';

const q05 = (v) => Math.round(v * 20) / 20;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const EPS = 0.004;
const PI2 = Math.PI / 2;

// Tiny per-tag outward inset + end trim so no two wall faces are ever coplanar
// (kills corner z-fighting where perpendicular walls overlap).
const ZO = { front: 0, inner: 0.008, side: 0.008, rear: 0.016 };
const TRIM = { front: 0, inner: 0.03, side: 0.03, rear: 0.03 };

// ---------------------------------------------------------------------------
// MATERIALS (registered once, type-prefixed, materials.js untouched)
// ---------------------------------------------------------------------------
function ensureMaterials(B) {
  const M = B.M;
  const reg = (name, mat, tile) => {
    if (M.has(name)) return;
    mat.name = name;
    mat.userData.tileMeters = tile;
    M.set(name, mat);
  };
  if (!M.has('nycha:brick')) {
    const t = brickTexture({
      hue: 11, sat: 31, light: 34, dh: 5, ds: 10, dl: 9,
      mortar: '#9d9489', darkBrickChance: 0.05, seed: 2510,
    });
    reg('nycha:brick', new THREE.MeshStandardMaterial({
      vertexColors: true, map: t.map, bumpMap: t.bumpMap, bumpScale: 1.05,
      roughness: 0.93, envMapIntensity: 0.5,
    }), t.tileMeters);
  }
  if (!M.has('nycha:brickLt')) {
    const t = brickTexture({
      hue: 15, sat: 25, light: 41, dh: 6, ds: 9, dl: 8,
      mortar: '#a9a196', darkBrickChance: 0.03, seed: 2511,
    });
    reg('nycha:brickLt', new THREE.MeshStandardMaterial({
      vertexColors: true, map: t.map, bumpMap: t.bumpMap, bumpScale: 1.0,
      roughness: 0.92, envMapIntensity: 0.52,
    }), t.tileMeters);
  }
  if (!M.has('nycha:precast')) {
    const t = stuccoTexture({ base: '#bcb7ac', blotch: 0.10, seed: 2512 });
    reg('nycha:precast', new THREE.MeshStandardMaterial({
      vertexColors: true, map: t.map, roughness: 0.86, envMapIntensity: 0.55,
    }), t.tileMeters);
  }
  if (!M.has('nycha:slate')) {
    reg('nycha:slate', new THREE.MeshStandardMaterial({
      vertexColors: true, color: 0x4b5057, roughness: 0.64, metalness: 0.06,
      envMapIntensity: 0.75,
    }), 1);
  }
  if (!M.has('nycha:gblock')) {
    const t = stoneTexture({
      base: '#aebcba', blockW: 0.203, blockH: 0.203, jointDark: 0.30,
      weather: 0.04, seed: 2513,
    });
    reg('nycha:gblock', new THREE.MeshStandardMaterial({
      vertexColors: true, map: t.map, roughness: 0.24, metalness: 0.06,
      envMapIntensity: 1.05,
    }), t.tileMeters);
  }
  if (!M.has('nycha:lawn')) {
    const t = stuccoTexture({ base: '#4e6036', blotch: 0.36, seed: 2514 });
    reg('nycha:lawn', new THREE.MeshStandardMaterial({
      vertexColors: true, map: t.map, roughness: 0.95, envMapIntensity: 0.38,
    }), t.tileMeters);
  }
}

// ---------------------------------------------------------------------------
// PARTS
// ---------------------------------------------------------------------------
const BACKDARK = new THREE.Color(0.085, 0.085, 0.09);

// Aluminium 1/1 double-hung group: `lights` sashes side by side under one head.
function winPart(B, w, h, lights) {
  const wq = q05(w), hq = q05(h);
  const id = `nycha:win:${wq}x${hq}:${lights}`;
  const glassId = `nycha:winG:${wq}x${hq}`;
  if (!B.hasPart(id)) {
    const items = [];
    const back = box(wq + 0.14, hq + 0.14, 0.03, { segY: 1 });
    ensureColor(back, BACKDARK);
    items.push({ geom: back, x: 0, y: -0.07, z: -0.30 });
    const fz = -0.115, fd = 0.05, fw = 0.05;
    items.push({ geom: box(wq, fw, fd, { segY: 1 }), x: 0, y: hq - fw, z: fz });
    items.push({ geom: box(wq, fw * 1.35, fd, { segY: 1 }), x: 0, y: 0, z: fz });
    items.push({ geom: box(fw, hq, fd, { segY: 1 }), x: -wq / 2 + fw / 2, y: 0, z: fz });
    items.push({ geom: box(fw, hq, fd, { segY: 1 }), x: wq / 2 - fw / 2, y: 0, z: fz });
    for (let i = 1; i < lights; i++) {
      items.push({
        geom: box(0.09, hq, fd + 0.012, { segY: 1 }),
        x: -wq / 2 + (wq / lights) * i, y: 0, z: fz,
      });
    }
    for (let i = 0; i < lights; i++) {
      items.push({
        geom: box(wq / lights - 0.07, 0.042, fd + 0.018, { segY: 1 }),
        x: -wq / 2 + (wq / lights) * (i + 0.5), y: hq * 0.47, z: fz,
      });
    }
    B.definePart(id, compose(items), 'windowFrame');
  }
  if (!B.hasPart(glassId)) {
    const g = quad(wq - 0.085, hq - 0.085);
    g.translate(0, 0.0425, -0.145);
    B.definePart(glassId, g, 'glass', { castShadow: false });
  }
  // night: lit overlay just in front of the glass (same convention as kit.window)
  const litId = `lit:nycha:${wq}x${hq}`;
  if (!B.hasPart(litId)) {
    const lg = quad(wq - 0.1, hq - 0.1);
    lg.translate(0, 0.05, -0.132);
    B.definePart(litId, lg, 'litWindow', { castShadow: false, receiveShadow: false, visible: false });
  }
  return { id, glassId, litId };
}

// Half-drawn interior shade / curtain, just in front of the glass.
function shadePart(B, w, h) {
  const wq = q05(w), hq = q05(h);
  const id = `nycha:shade:${wq}x${hq}`;
  if (!B.hasPart(id)) {
    const g = quad(wq - 0.13, (hq - 0.13) * 0.58);
    g.translate(0, (hq - 0.13) * 0.42 + 0.065, -0.128);
    B.definePart(id, g, 'paintFlat', { castShadow: false, receiveShadow: false });
  }
  return id;
}

// Slate / precast sill: thin slab, projects 0.035, tucks into the reveal.
function sillPart(B, w, mat) {
  const wq = q05(w + 0.14);
  const id = `nycha:sill:${mat}:${wq}`;
  if (!B.hasPart(id)) {
    const g = box(wq, 0.05, 0.235, { segY: 1 });
    boxUV(g, wq, 0.05, 0.235, 2);
    g.translate(0, -0.04, 0.035 - 0.235 / 2);
    B.definePart(id, g, mat);
  }
  return id;
}

// Window air conditioner — matte case, dark grille, drip bracket below.
function acPart(B) {
  const id = 'nycha:ac';
  if (!B.hasPart(id)) {
    const items = [];
    items.push({ geom: box(0.60, 0.37, 0.50, { segY: 1 }), x: 0, y: 0, z: -0.18 });
    const gr = box(0.54, 0.27, 0.02, { segY: 1 });
    ensureColor(gr, new THREE.Color(0.19, 0.20, 0.21));
    items.push({ geom: gr, x: 0, y: 0.05, z: 0.325 });
    const lip = box(0.62, 0.03, 0.07, { segY: 1 });
    ensureColor(lip, new THREE.Color(0.50, 0.50, 0.48));
    items.push({ geom: lip, x: 0, y: -0.03, z: 0.30 });
    for (const s of [-1, 1]) {
      const br = box(0.035, 0.22, 0.035, { segY: 1 });
      ensureColor(br, new THREE.Color(0.26, 0.26, 0.27));
      items.push({ geom: br, x: s * 0.25, y: -0.20, z: 0.20, rx: 0.6 });
    }
    const g = compose(items);
    g.rotateX(-0.03);
    B.definePart(id, g, 'paintFlat');
  }
  return id;
}

// Ground-floor security grille (bar screen in front of the opening).
function grillePart(B, w, h) {
  const wq = q05(w), hq = q05(h);
  const id = `nycha:grille:${wq}x${hq}`;
  if (!B.hasPart(id)) {
    const items = [];
    const n = Math.max(3, Math.round(wq / 0.17));
    for (let i = 0; i <= n; i++) {
      items.push({ geom: box(0.022, hq - 0.05, 0.022, { segY: 1 }), x: -wq / 2 + (wq / n) * i, y: 0.025, z: 0 });
    }
    for (const fy of [hq * 0.30, hq * 0.72]) {
      items.push({ geom: box(wq, 0.026, 0.026, { segY: 1 }), x: 0, y: fy, z: 0 });
    }
    items.push({ geom: box(wq, 0.03, 0.03, { segY: 1 }), x: 0, y: 0.01, z: 0 });
    items.push({ geom: box(wq, 0.03, 0.03, { segY: 1 }), x: 0, y: hq - 0.045, z: 0 });
    B.definePart(id, compose(items), 'ironwork');
  }
  return id;
}

// Glass-and-steel lobby entry: aluminium storefront + painted hollow-metal pair.
function lobbyPart(B, w, h, doorCol) {
  const wq = q05(w), hq = q05(h);
  const id = `nycha:lobby:${wq}x${hq}`;
  const glassId = `nycha:lobbyG:${wq}x${hq}`;
  if (!B.hasPart(id)) {
    const items = [];
    const AL = new THREE.Color(0.62, 0.63, 0.64);
    const DK = new THREE.Color(0.06, 0.07, 0.08);
    const mull = (gw, gh, x, y) => {
      const g = box(gw, gh, 0.055, { segY: 1 });
      ensureColor(g, AL);
      items.push({ geom: g, x, y, z: -0.02 });
    };
    const doorW = Math.min(1.86, wq - 0.7);
    mull(wq, 0.075, 0, hq - 0.075);
    mull(wq, 0.07, 0, 0);
    mull(0.07, hq, -wq / 2 + 0.035, 0);
    mull(0.07, hq, wq / 2 - 0.035, 0);
    mull(wq, 0.065, 0, hq - 0.72);
    mull(0.075, hq - 0.72, -doorW / 2, 0);
    mull(0.075, hq - 0.72, doorW / 2, 0);
    const back = box(wq + 0.1, hq + 0.1, 0.03, { segY: 1 });
    ensureColor(back, DK);
    items.push({ geom: back, x: 0, y: -0.05, z: -0.26 });
    for (const s of [-1, 1]) {
      const lw = doorW / 2 - 0.03;
      const leaf = box(lw, hq - 0.79, 0.05, { segY: 1 });
      ensureColor(leaf, doorCol);
      items.push({ geom: leaf, x: s * doorW / 4, y: 0.03, z: -0.05 });
      const lite = box(lw * 0.28, (hq - 0.79) * 0.5, 0.02, { segY: 1 });
      ensureColor(lite, DK);
      items.push({ geom: lite, x: s * doorW / 4, y: 0.03 + (hq - 0.79) * 0.36, z: -0.024 });
      const kick = box(lw, 0.24, 0.02, { segY: 1 });
      ensureColor(kick, new THREE.Color(0.60, 0.61, 0.61));
      items.push({ geom: kick, x: s * doorW / 4, y: 0.05, z: -0.024 });
      const bar = box(lw * 0.66, 0.045, 0.05, { segY: 1 });
      ensureColor(bar, new THREE.Color(0.55, 0.56, 0.56));
      items.push({ geom: bar, x: s * doorW / 4, y: 1.02, z: -0.02 });
    }
    B.definePart(id, compose(items), 'paintFlat');
  }
  if (!B.hasPart(glassId)) {
    const g = quad(wq - 0.13, hq - 0.13);
    g.translate(0, 0.065, -0.075);
    B.definePart(glassId, g, 'glass', { castShadow: false });
  }
  return { id, glassId };
}

// Cast-concrete entrance canopy slab (with soffit downlights) + pipe column.
function canopyPart(B, w, proj, th) {
  const wq = q05(w), pq = q05(proj), tq = q05(th);
  const id = `nycha:canopy:${wq}x${pq}x${tq}`;
  if (!B.hasPart(id)) {
    const items = [];
    const slab = box(wq, tq, pq, { segY: 1 });
    boxUV(slab, wq, tq, pq, 2);
    items.push({ geom: slab, x: 0, y: 0, z: pq / 2 });
    const nL = Math.max(2, Math.round(wq / 1.2));
    for (let i = 0; i < nL; i++) {
      const g = cylinder(0.085, 0.085, 0.03, 8);
      ensureColor(g, new THREE.Color(0.28, 0.27, 0.26));
      items.push({ geom: g, x: -wq / 2 + (wq / nL) * (i + 0.5), y: -0.03, z: pq * 0.55 });
    }
    B.definePart(id, compose(items), 'nycha:precast');
  }
  return id;
}

function postPart(B, h) {
  const hq = q05(h);
  const id = `nycha:post:${hq}`;
  if (!B.hasPart(id)) {
    B.definePart(id, compose([
      { geom: cylinder(0.058, 0.062, hq, 10), x: 0, y: 0, z: 0 },
      { geom: cylinder(0.10, 0.11, 0.06, 10), x: 0, y: 0, z: 0 },
    ]), 'steelDark');
  }
  return id;
}

// Big central brick penthouse (elevator machine room + tank room + stair head).
function bulkheadPart(B, w, d, h, mat) {
  const wq = q05(w), dq = q05(d), hq = q05(h);
  const id = `nycha:bulkhead:${mat}:${wq}x${dq}x${hq}`;
  const capId = `${id}:cap`;
  const gearId = `${id}:gear`;
  if (!B.hasPart(id)) {
    const wall = box(wq, hq, dq, { segY: 2 });
    boxUV(wall, wq, hq, dq, 2);
    B.definePart(id, wall, mat);
  }
  if (!B.hasPart(capId)) {
    const t = [];
    const cap = box(wq + 0.20, 0.09, dq + 0.20, { segY: 1 });
    boxUV(cap, wq + 0.20, 0.09, dq + 0.20, 2);
    t.push({ geom: cap, x: 0, y: hq, z: 0 });
    B.definePart(capId, compose(t), 'nycha:precast');
  }
  if (!B.hasPart(gearId)) {
    const g = [];
    const lv = box(Math.min(2.1, wq * 0.44), 1.15, 0.10, { segY: 1 });
    ensureColor(lv, new THREE.Color(0.26, 0.27, 0.28));
    g.push({ geom: lv, x: -wq * 0.21, y: hq * 0.40, z: dq / 2 + 0.02 });
    const dr = box(0.95, 2.05, 0.09, { segY: 1 });
    ensureColor(dr, new THREE.Color(0.14, 0.24, 0.32));
    g.push({ geom: dr, x: wq * 0.26, y: 0, z: dq / 2 + 0.02 });
    B.definePart(gearId, compose(g), 'paintFlat');
  }
  return { id, capId, gearId };
}

// 2 m module of galvanised pipe rail for the parapet top.
function railPart(B) {
  const id = 'nycha:rail';
  if (!B.hasPart(id)) {
    const items = [];
    for (const y of [1.03, 0.60]) {
      items.push({ geom: cylinder(0.022, 0.022, 2.0, 7), x: 1.0, y, z: 0, rz: PI2 });
    }
    for (const x of [-1.0, 1.0]) {
      items.push({ geom: cylinder(0.024, 0.024, 1.06, 7), x, y: 0, z: 0 });
    }
    B.definePart(id, compose(items), 'aluminum');
  }
  return id;
}

// NYCHA bent-pipe hairpin lawn fence, 2 m module.
function fencePart(B, mat) {
  const id = `nycha:fence:${mat}`;
  if (!B.hasPart(id)) {
    const items = [];
    const h = 0.97;
    for (const y of [h, 0.50]) {
      items.push({ geom: cylinder(0.021, 0.021, 1.64, 6), x: 0.82, y, z: 0, rz: PI2 });
    }
    for (const s of [-1, 1]) {
      // hairpin: short bend from the top rail down to a leg
      items.push({ geom: cylinder(0.021, 0.021, 0.28, 6), x: s * 0.82, y: h, z: 0, rz: -s * 2.55 });
      items.push({ geom: cylinder(0.023, 0.023, h - 0.22, 6), x: s * 0.95, y: 0, z: 0 });
    }
    B.definePart(id, compose(items), mat);
  }
  return id;
}

function dishPart(B) {
  const id = 'nycha:dish';
  if (!B.hasPart(id)) {
    B.definePart(id, compose([
      { geom: cylinder(0.05, 0.05, 0.85, 6), x: 0, y: 0, z: 0 },
      { geom: box(0.36, 0.36, 0.05, { segY: 1 }), x: 0, y: 0.70, z: 0.12, rx: -0.5 },
      { geom: cylinder(0.02, 0.02, 0.22, 5), x: 0, y: 0.80, z: 0.26 },
    ]), 'aluminum');
  }
  return id;
}

function cellPart(B) {
  const id = 'nycha:cell';
  if (!B.hasPart(id)) {
    const items = [];
    const p = box(0.30, 1.75, 0.12, { segY: 1 });
    ensureColor(p, new THREE.Color(0.80, 0.80, 0.78));
    items.push({ geom: p, x: 0, y: 0.6, z: 0 });
    items.push({ geom: cylinder(0.05, 0.05, 2.5, 6), x: 0, y: 0, z: -0.12 });
    B.definePart(id, compose(items), 'paintFlat');
  }
  return id;
}

// Cantilevered wall light beside every entrance.
function wallLightPart(B) {
  const id = 'nycha:wallLight';
  if (!B.hasPart(id)) {
    const items = [];
    items.push({ geom: box(0.10, 0.10, 0.46, { segY: 1 }), x: 0, y: 0, z: 0.23 });
    const head = box(0.30, 0.12, 0.34, { segY: 1 });
    ensureColor(head, new THREE.Color(0.32, 0.32, 0.31));
    items.push({ geom: head, x: 0, y: -0.11, z: 0.44 });
    const lens = box(0.24, 0.025, 0.26, { segY: 1 });
    ensureColor(lens, new THREE.Color(0.88, 0.86, 0.78));
    items.push({ geom: lens, x: 0, y: -0.125, z: 0.44 });
    B.definePart(id, compose(items), 'paintFlat');
  }
  return id;
}

// Pin-mounted building number plaque.
function plaquePart(B) {
  const id = 'nycha:plaque';
  if (!B.hasPart(id)) {
    const items = [];
    const p = box(0.54, 0.40, 0.03, { segY: 1 });
    ensureColor(p, new THREE.Color(0.70, 0.69, 0.65));
    items.push({ geom: p, x: 0, y: 0, z: 0.02 });
    const t = box(0.32, 0.19, 0.015, { segY: 1 });
    ensureColor(t, new THREE.Color(0.12, 0.13, 0.15));
    items.push({ geom: t, x: 0, y: 0.11, z: 0.04 });
    B.definePart(id, compose(items), 'paintFlat');
  }
  return id;
}

// ---------------------------------------------------------------------------
// COLUMN LAYOUT — the punched grid for one wall face
// ---------------------------------------------------------------------------
function layoutCols(rng, L, module, opt = {}) {
  let n = Math.max(1, Math.round(L / module));
  while (n > 1 && L / n < 2.45) n--;
  const pitch = L / n;
  const cols = [];
  let blankAt = -1;
  if (L > 10.5 && opt.blank !== false && rng.bool(0.5)) blankAt = rng.int(0, n - 1);
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + pitch * (i + 0.5);
    if (i === blankAt) continue;
    const kind = rng.weighted([['paired', 60], ['single', 26], ['triple', 9], ['narrow', 5]]);
    const w = kind === 'paired' ? 1.40 : kind === 'triple' ? 1.75 : kind === 'narrow' ? 0.65 : 0.95;
    const lights = kind === 'paired' ? 2 : kind === 'triple' ? 3 : 1;
    cols.push({ x, w, lights, kind });
  }
  if (!cols.length) cols.push({ x: 0, w: 1.40, lights: 2, kind: 'paired' });
  return { cols, pitch, n };
}

// ---------------------------------------------------------------------------
// WALL SHELL — piers + bands (see header note)
// ---------------------------------------------------------------------------
function wallShell(B, wf, s) {
  const addBox = (w, h, cx, cy, dz, segY) => {
    if (w <= 0.02 || h <= 0.02) return;
    const g = box(w, h, s.wallT, { segY: segY || 0 });
    B.addMerged(s.mat, g, wf.clone().multiply(tmat(cx, cy, dz - s.zo - s.wallT / 2)), {
      tint: s.tint, grime: s.grime,
    });
  };
  const half = s.L / 2 - s.trim / 2;
  // --- full-height piers between openings + stacks
  const iv = [];
  for (const c of s.cols) iv.push([c.x - c.w / 2, c.x + c.w / 2]);
  for (const st of s.stacks) iv.push([st.x - st.w / 2, st.x + st.w / 2]);
  iv.sort((a, b) => a[0] - b[0]);
  const un = [];
  for (const r of iv) {
    const last = un[un.length - 1];
    if (last && r[0] <= last[1] + EPS) last[1] = Math.max(last[1], r[1]);
    else un.push([r[0], r[1]]);
  }
  const pierSeg = clamp(Math.round(s.H / 1.3), 4, 30);
  let px = -half;
  for (const [a, b] of un) {
    if (a > px + EPS) addBox(a - px, s.H, (px + a) / 2, 0, 0, pierSeg);
    px = Math.max(px, b);
  }
  if (px < half - EPS) addBox(half - px, s.H, (px + half) / 2, 0, 0, pierSeg);

  // --- full-width spandrel bands, 4 mm behind the pier face
  const bands = [[0, s.sillH]];
  for (let i = 0; i < s.floors - 1; i++) {
    bands.push([i * s.fh + s.sillH + s.winH, (i + 1) * s.fh + s.sillH]);
  }
  bands.push([(s.floors - 1) * s.fh + s.sillH + s.winH, s.H]);
  const holes = s.stacks.map((st) => [st.x - st.w / 2, st.x + st.w / 2]).sort((a, b) => a[0] - b[0]);
  for (const [b0, b1] of bands) {
    const bh = b1 - b0;
    if (bh <= 0.02) continue;
    const segY = b0 < 3.2 ? Math.max(2, Math.ceil(bh / 0.4)) : 0;
    let qx = -half;
    for (const [a, b] of holes) {
      if (a > qx + EPS) addBox(a - qx, bh, (qx + a) / 2, b0, -0.004, segY);
      qx = Math.max(qx, b);
    }
    if (qx < half - EPS) addBox(half - qx, bh, (qx + half) / 2, b0, -0.004, segY);
  }
}

// Plain (never-seen) wall: one box.
function plainWall(B, wf, s) {
  const g = box(s.L - s.trim, s.H, s.wallT, { segY: clamp(Math.round(s.H / 2.4), 3, 12) });
  B.addMerged(s.mat, g, wf.clone().multiply(tmat(0, 0, -s.zo - s.wallT / 2)), {
    tint: s.tint, grime: s.grime,
  });
}

// ---------------------------------------------------------------------------
// WALL DRESSING — windows, shades, sills, ACs, ground grilles
// ---------------------------------------------------------------------------
function dressWall(ctx, wf, s, rng, o) {
  const B = ctx.batcher;
  const acId = acPart(B);
  for (const c of s.cols) {
    const wi = winPart(B, c.w, s.winH, c.lights);
    const shId = shadePart(B, c.w, s.winH);
    const siId = o.sillMat ? sillPart(B, c.w, o.sillMat) : null;
    for (let f = 0; f < s.floors; f++) {
      const y = f * s.fh + s.sillH;
      const m = wf.clone().multiply(tmat(c.x, y, -s.zo));
      B.addInstance(wi.id, m, o.frameTint);
      B.addInstance(wi.glassId, m, o.glassTints[rng.int(0, o.glassTints.length - 1)]);
      if (rng.bool(0.36)) B.addInstance(wi.litId, m, new THREE.Color(1.0, 0.86, 0.62).multiplyScalar(0.75 + rng.range(0, 0.55)));
      if (siId) B.addInstance(siId, m, o.sillTint);
      if (rng.bool(0.56)) {
        B.addInstance(shId, m, rng.weighted([
          [o.shadeCols[0], 34], [o.shadeCols[1], 20], [o.shadeCols[2], 12],
          [o.shadeCols[3], 10], [o.shadeCols[4], 8],
        ]));
      }
      if (f >= 1 && c.kind !== 'narrow' && rng.bool(o.acP)) {
        B.addInstance(acId, wf.clone().multiply(tmat(
          c.x + (c.lights > 1 ? (rng.bool() ? 1 : -1) * c.w * 0.21 : 0),
          y + 0.03, 0.04 - s.zo,
        )), o.acTints[rng.int(0, o.acTints.length - 1)]);
      }
      if (f === 0 && rng.bool(o.grilleP)) {
        B.addInstance(grillePart(B, c.w, s.winH),
          wf.clone().multiply(tmat(c.x, y + 0.02, 0.03 - s.zo)), o.grilleTint);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// PLANS — footprints assembled from rectangular volumes
// ---------------------------------------------------------------------------
function makePlan(rng, W, D) {
  const kind = (W >= 21 && D >= 14.5)
    ? rng.weighted([['cross', 32], ['stagger', 28], ['slab', 22], ['slabRecess', 18]])
    : rng.weighted([['slab', 6], ['slabRecess', 3]]);

  // --- CROSS / T: a centre arm to the street, cross-bar behind, rear arm ----
  if (kind === 'cross') {
    const Db = clamp(rng.range(8.2, 9.8), 7.4, D - 7.2);
    const Ls = clamp(rng.range(4.3, 5.9), 3.2, (D - Db) * 0.66);
    const Lr = D - Db - Ls;
    const Ws = clamp(rng.range(0.49, 0.57) * W, 10.5, W - 8.4);
    const wg = (W - Ws) / 2;
    const zb = -Ls - Db;
    return {
      kind,
      vols: [
        { x: 0, z: -Ls / 2, w: Ws, d: Ls, ry: 0 },
        { x: 0, z: -Ls - Db / 2, w: W, d: Db, ry: 0 },
        { x: 0, z: zb - Lr / 2, w: Ws, d: Lr, ry: 0 },
      ],
      coreVol: { x: 0, z: -Ls - Db / 2, w: W, d: Db },
      walls: [
        { x: 0, z: 0, ry: 0, L: Ws, tag: 'front', entry: 1 },
        { x: -Ws / 2, z: -Ls / 2, ry: -PI2, L: Ls, tag: 'side' },
        { x: Ws / 2, z: -Ls / 2, ry: PI2, L: Ls, tag: 'side' },
        { x: -(Ws + wg) / 2, z: -Ls, ry: 0, L: wg, tag: 'front' },
        { x: (Ws + wg) / 2, z: -Ls, ry: 0, L: wg, tag: 'front' },
        { x: -W / 2, z: -Ls - Db / 2, ry: -PI2, L: Db, tag: 'side' },
        { x: W / 2, z: -Ls - Db / 2, ry: PI2, L: Db, tag: 'side' },
        { x: -(Ws + wg) / 2, z: zb, ry: Math.PI, L: wg, tag: 'rear' },
        { x: (Ws + wg) / 2, z: zb, ry: Math.PI, L: wg, tag: 'rear' },
        { x: -Ws / 2, z: zb - Lr / 2, ry: -PI2, L: Lr, tag: 'side' },
        { x: Ws / 2, z: zb - Lr / 2, ry: PI2, L: Lr, tag: 'side' },
        { x: 0, z: -D, ry: Math.PI, L: Ws, tag: 'rear' },
      ],
      center: { x: 0, z: -Ls - Db * 0.5 },
      courts: [
        { x: -(Ws + wg) / 2, w: wg - 1.2, z0: -Ls + 0.7, z1: -0.4 },
        { x: (Ws + wg) / 2, w: wg - 1.2, z0: -Ls + 0.7, z1: -0.4 },
      ],
    };
  }

  // --- STAGGERED SLAB: two end pavilions forward, recessed centre, rear core
  if (kind === 'stagger') {
    const Rc = clamp(rng.range(2.7, 4.0), 2.0, D * 0.24);
    const Db = clamp(rng.range(8.4, 9.8), 7.4, D - Rc - 3.0);
    const Lr = D - Rc - Db;
    const We = clamp(rng.range(0.26, 0.33) * W, 6.4, (W - 6.0) / 2);
    const Wm = W - 2 * We;                                    // recessed centre
    const Wr = clamp(rng.range(0.40, 0.52) * W, 8.0, W - 4.0);
    const wg = (W - Wr) / 2;
    const zb = -Rc - Db;
    return {
      kind,
      vols: [
        { x: -(W - We) / 2, z: -Rc / 2, w: We, d: Rc, ry: 0 },
        { x: (W - We) / 2, z: -Rc / 2, w: We, d: Rc, ry: 0 },
        { x: 0, z: -Rc - Db / 2, w: W, d: Db, ry: 0 },
        { x: 0, z: zb - Lr / 2, w: Wr, d: Lr, ry: 0 },
      ],
      coreVol: { x: 0, z: -Rc - Db / 2, w: W, d: Db },
      walls: [
        { x: -(W - We) / 2, z: 0, ry: 0, L: We, tag: 'front' },
        { x: (W - We) / 2, z: 0, ry: 0, L: We, tag: 'front' },
        { x: 0, z: -Rc, ry: 0, L: Wm, tag: 'front', entry: 1 },
        { x: -Wm / 2, z: -Rc / 2, ry: PI2, L: Rc, tag: 'inner' },
        { x: Wm / 2, z: -Rc / 2, ry: -PI2, L: Rc, tag: 'inner' },
        { x: -W / 2, z: -(Rc + Db) / 2, ry: -PI2, L: Rc + Db, tag: 'side' },
        { x: W / 2, z: -(Rc + Db) / 2, ry: PI2, L: Rc + Db, tag: 'side' },
        { x: -(Wr + wg) / 2, z: zb, ry: Math.PI, L: wg, tag: 'rear' },
        { x: (Wr + wg) / 2, z: zb, ry: Math.PI, L: wg, tag: 'rear' },
        { x: -Wr / 2, z: zb - Lr / 2, ry: -PI2, L: Lr, tag: 'side' },
        { x: Wr / 2, z: zb - Lr / 2, ry: PI2, L: Lr, tag: 'side' },
        { x: 0, z: -D, ry: Math.PI, L: Wr, tag: 'rear' },
      ],
      center: { x: 0, z: -Rc - Db * 0.5 },
      courts: [{ x: 0, w: Wm - 1.0, z0: -Rc + 0.6, z1: -0.4 }],
    };
  }

  // --- IN-LINE SLAB (optionally with a recessed centre bay) ----------------
  const Db = clamp(rng.range(12.8, 14.6), 10.5, D);
  const recess = kind === 'slabRecess';
  const Wc = clamp(rng.range(7.6, 9.6), 6, W * 0.4);
  const Rc = rng.range(2.1, 3.0);
  const wg = (W - Wc) / 2;
  const vols = recess
    ? [
      { x: -(W - wg) / 2, z: -Db / 2, w: wg, d: Db, ry: 0 },
      { x: (W - wg) / 2, z: -Db / 2, w: wg, d: Db, ry: 0 },
      { x: 0, z: -Rc - (Db - Rc) / 2, w: Wc, d: Db - Rc, ry: 0 },
    ]
    : [{ x: 0, z: -Db / 2, w: W, d: Db, ry: 0 }];
  const walls = [];
  if (recess) {
    walls.push({ x: -(W - wg) / 2, z: 0, ry: 0, L: wg, tag: 'front' });
    walls.push({ x: (W - wg) / 2, z: 0, ry: 0, L: wg, tag: 'front' });
    walls.push({ x: 0, z: -Rc, ry: 0, L: Wc, tag: 'front', entry: 1 });
    walls.push({ x: -Wc / 2, z: -Rc / 2, ry: PI2, L: Rc, tag: 'inner' });
    walls.push({ x: Wc / 2, z: -Rc / 2, ry: -PI2, L: Rc, tag: 'inner' });
  } else {
    walls.push({ x: 0, z: 0, ry: 0, L: W, tag: 'front', entry: 1 });
  }
  walls.push({ x: -W / 2, z: -Db / 2, ry: -PI2, L: Db, tag: 'side' });
  walls.push({ x: W / 2, z: -Db / 2, ry: PI2, L: Db, tag: 'side' });
  walls.push({ x: 0, z: -Db, ry: Math.PI, L: W, tag: 'rear' });
  return {
    kind, vols, walls,
    coreVol: { x: 0, z: -Db / 2, w: W, d: Db },
    center: { x: 0, z: -Db * 0.5 },
    courts: recess ? [{ x: 0, w: Wc - 1.0, z0: -Rc + 0.5, z1: -0.4 }] : [],
  };
}

// ---------------------------------------------------------------------------
// GENERATE
// ---------------------------------------------------------------------------
export function generate(ctx, lot, rng) {
  const B = ctx.batcher, K = ctx.kit;
  ensureMaterials(B);

  const W = Math.max(11, lot.width);
  const D = Math.max(11, lot.depth);
  const stories = clamp(Math.round(lot.stories || rng.weighted([
    [6, 5], [8, 9], [11, 11], [13, 17], [14, 23], [16, 13],
  ])), 4, 22);
  const post59 = rng.bool(0.45);
  const fh = post59 ? rng.range(2.75, 2.83) : rng.range(2.66, 2.76);
  const sillH = 0.81, winH = 1.30;
  const H = stories * fh;
  const parapetH = rng.range(0.44, 0.62);
  const wallT = 0.36;
  const module = rng.range(3.05, 3.35);

  // --- palette: ONE brick order per development, only tone jitter per seed --
  const brickMat = rng.weighted([['nycha:brick', 6], ['nycha:brickLt', 4]]);
  const tint = (() => {
    const c = new THREE.Color(1, 1, 1).multiplyScalar(rng.range(0.93, 1.05));
    const h = { h: 0, s: 0, l: 0 };
    c.getHSL(h);
    c.setHSL(h.h + rng.range(-0.006, 0.006), Math.min(1, h.s + rng.range(0, 0.03)), h.l);
    return c;
  })();
  const sillMat = rng.weighted([['nycha:slate', 4], ['nycha:precast', 4], [null, 2]]);
  const sillTint = new THREE.Color(1, 1, 1).multiplyScalar(
    sillMat === 'nycha:slate' ? rng.range(0.85, 1.1) : rng.range(0.82, 0.98));
  const frameTint = rng.weighted([
    [new THREE.Color(0.78, 0.79, 0.79), 5],      // 1980s mill-finish aluminium
    [new THREE.Color(0.90, 0.90, 0.88), 3],      // PACT-era white
    [new THREE.Color(0.30, 0.25, 0.20), 2],      // bronze anodised
  ]);
  const glassTints = [];
  for (let i = 0; i < 6; i++) {
    glassTints.push(new THREE.Color().setHSL(
      0.55 + rng.range(-0.03, 0.03), rng.range(0.05, 0.16), rng.range(0.28, 0.60)));
  }
  const shadeCols = [
    new THREE.Color(0.86, 0.85, 0.81),           // white blinds
    new THREE.Color(0.74, 0.66, 0.52),           // beige shade
    new THREE.Color(0.20, 0.20, 0.22),           // dark / empty
    new THREE.Color(0.46, 0.16, 0.15),           // coloured curtain
    new THREE.Color(0.58, 0.59, 0.60),           // foil / cardboard
  ];
  const acTints = [
    new THREE.Color(0.80, 0.79, 0.75), new THREE.Color(0.72, 0.71, 0.67),
    new THREE.Color(0.62, 0.61, 0.58), new THREE.Color(0.84, 0.83, 0.79),
  ];
  const grilleTint = new THREE.Color(1, 1, 1).multiplyScalar(rng.range(0.9, 1.5));
  const railTint = new THREE.Color(1, 1, 1).multiplyScalar(rng.range(0.42, 0.60));
  const fenceMat = rng.weighted([['ironwork', 5], ['aluminum', 2]]);
  const fenceTint = fenceMat === 'ironwork'
    ? rng.weighted([[new THREE.Color(1, 1, 1), 3], [new THREE.Color(0.7, 1.6, 1.1), 2]])
    : new THREE.Color(0.42, 0.44, 0.43);
  const doorCol = rng.weighted([
    [new THREE.Color(0.11, 0.24, 0.38), 26],
    [new THREE.Color(0.12, 0.32, 0.26), 22],
    [new THREE.Color(0.08, 0.20, 0.14), 16],
    [new THREE.Color(0.34, 0.34, 0.33), 14],
    [new THREE.Color(0.28, 0.11, 0.11), 10],
  ]);

  const plan = makePlan(rng, W, D);
  const mirror = lot.mirror ? -1 : 1;

  const entryW = 3.4, entryTop = 2.92, recessD = rng.range(0.65, 0.95);
  const hasGBlock = rng.bool(0.48);
  const gbW = 1.15;
  const waterTable = rng.bool(0.6);
  const wtH = rng.range(0.30, 0.44);

  // -------------------------------------------------------------------------
  // WALLS
  // -------------------------------------------------------------------------
  const frames = [];
  for (const wl of plan.walls) {
    const wf = at(lot.frame, wl.x, 0, wl.z, wl.ry);
    frames.push(wf);
    wl._zo = ZO[wl.tag] || 0;
    wl._trim = TRIM[wl.tag] || 0;
    const nz = Math.cos(wl.ry);
    const spec = {
      L: wl.L, H, wallT, mat: brickMat, tint, grime: 0.16, zo: wl._zo, trim: wl._trim,
      floors: stories, fh, sillH, winH, cols: [], stacks: [],
    };
    if (wl.tag === 'rear' || wl.L < 2.0) {
      plainWall(B, wf, spec);
      wl._ex = null;
      continue;
    }
    const isSide = wl.tag === 'side' || wl.tag === 'inner';
    const lay = layoutCols(rng, wl.L - wl._trim, isSide ? module * 1.03 : module,
      { blank: !isSide || wl.L > 9 });
    let cols = lay.cols;
    let ex = null;
    if (wl.entry && wl.L > entryW + 1.6) {
      const cand = cols.map((c) => c.x)
        .filter((x) => Math.abs(x) <= wl.L / 2 - entryW / 2 - 0.4);
      if (cand.length) {
        const mid = (cand.length - 1) / 2;
        const off = rng.weighted([[0, 5], [1, 3], [2, 1]]) * mirror;
        ex = cand[clamp(Math.round(mid + off), 0, cand.length - 1)];
      } else ex = 0;
      ex = clamp(ex, -wl.L / 2 + entryW / 2 + 0.35, wl.L / 2 - entryW / 2 - 0.35);
      cols = cols.filter((c) => Math.abs(c.x - ex) > (entryW + c.w) / 2 - 0.02);
      spec.stacks.push({ x: ex, w: entryW });
    }
    spec.cols = cols;
    wl._ex = ex;
    wallShell(B, wf, spec);
    dressWall(ctx, wf, spec, rng, {
      frameTint, glassTints, shadeCols, acTints, sillMat, sillTint, grilleTint,
      acP: (nz > 0.4 || Math.abs(Math.sin(wl.ry)) > 0.7)
        ? rng.range(0.40, 0.56) : rng.range(0.20, 0.34),
      grilleP: wl.tag === 'front' ? 0.55 : 0.3,
    });

    // ---- entrance stack contents ------------------------------------------
    if (ex !== null) {
      const put = (mat, w, h, d, x, y, z, opts = {}) => {
        const g = box(w, h, d, { segY: opts.segY || 0 });
        B.addMerged(mat, g, wf.clone().multiply(tmat(x, y, z - wl._zo)), {
          tint: opts.tint || null, grime: opts.grime === undefined ? 0.14 : opts.grime,
        });
      };
      for (const s of [-1, 1]) {
        put(brickMat, 0.20, entryTop, recessD, ex + s * (entryW / 2 - 0.10), 0, -recessD / 2, { tint });
      }
      put('nycha:precast', entryW, 0.22, recessD + 0.04, ex, entryTop - 0.22, -recessD / 2, { grime: 0.1 });
      put('nycha:precast', entryW - 0.34, 0.10, recessD, ex, 0, -recessD / 2, { grime: 0.25 });
      put(brickMat, entryW, entryTop, 0.28, ex, 0, -recessD - 0.14, { tint, grime: 0.2 });
      // brick above the entry stack, with or without a glass-block corridor column
      if (hasGBlock) {
        const gbTop = H - rng.range(0.4, 0.9);
        const side = (entryW - gbW) / 2;
        for (const s of [-1, 1]) {
          put(brickMat, side, H - entryTop, wallT, ex + s * (entryW + gbW) / 4, entryTop, -wallT / 2, { tint });
        }
        put(brickMat, gbW, H - gbTop, wallT, ex, gbTop, -wallT / 2, { tint });
        put('nycha:gblock', gbW - 0.06, gbTop - entryTop - 0.14, 0.14, ex, entryTop + 0.14, -0.10, { grime: 0.08 });
        put('nycha:precast', gbW + 0.16, 0.12, wallT + 0.04, ex, entryTop, -wallT / 2, { grime: 0.12 });
      } else {
        put(brickMat, entryW, H - entryTop, wallT, ex, entryTop, -wallT / 2, { tint });
      }
      // lobby storefront
      const lb = lobbyPart(B, entryW - 0.42, entryTop - 0.34, doorCol);
      const lm = wf.clone().multiply(tmat(ex, 0.10, -recessD - wl._zo));
      B.addInstance(lb.glassId, lm);
      B.addInstance(lb.id, lm);
      // canopy + pipe columns
      const canT = rng.weighted([['conc', 34], ['steel', 32], ['none', 18]]);
      if (canT !== 'none') {
        const proj = rng.range(1.5, 2.2), cw = entryW + rng.range(0.6, 1.4);
        const cy = rng.range(2.64, 2.90);
        B.addInstance(canopyPart(B, cw, proj, canT === 'conc' ? 0.24 : 0.14),
          wf.clone().multiply(tmat(ex, cy, -wl._zo)),
          canT === 'conc' ? null : new THREE.Color(0.76, 0.76, 0.74));
        const pid = postPart(B, cy);
        for (const s of [-1, 1]) {
          B.addInstance(pid, wf.clone().multiply(tmat(ex + s * (cw / 2 - 0.34), 0, proj - 0.30 - wl._zo)));
        }
      }
      // wall lights, plaque, step
      const wlid = wallLightPart(B);
      for (const s of [-1, 1]) {
        B.addInstance(wlid, wf.clone().multiply(tmat(ex + s * (entryW / 2 + 0.55), 3.10, 0.02 - wl._zo)));
      }
      B.addInstance(plaquePart(B),
        wf.clone().multiply(tmat(ex + entryW / 2 + 0.55, 1.95, 0.02 - wl._zo)));
      if (rng.bool(0.55)) {
        put('nycha:precast', entryW + 0.7, 0.16, 1.05, ex, 0, 0.52, { grime: 0.32 });
      }
    }
  }

  // -------------------------------------------------------------------------
  // WATER TABLE, PARAPET, COPING, ROOF RAIL
  // -------------------------------------------------------------------------
  const railId = railPart(B);
  plan.walls.forEach((wl, i) => {
    const wf = frames[i];
    const zo = wl._zo, trim = wl._trim;
    const yo = zo * 0.25;                        // keeps horizontal caps non-coplanar
    const half = wl.L / 2 - trim / 2;
    if (waterTable) {
      const segs = [];
      if (wl._ex != null) {
        const a = wl._ex - entryW / 2, b = wl._ex + entryW / 2;
        if (a > -half + 0.02) segs.push([-half, a]);
        if (b < half - 0.02) segs.push([b, half]);
      } else segs.push([-half, half]);
      for (const [a, b] of segs) {
        if (b - a < 0.05) continue;
        const g = box(b - a, wtH, wallT + 0.05, { segY: 2 });
        B.addMerged('nycha:precast', g,
          wf.clone().multiply(tmat((a + b) / 2, yo, 0.05 - zo - (wallT + 0.05) / 2)), { grime: 0.3 });
      }
    }
    const pg = box(wl.L - trim, parapetH, wallT, { segY: 1 });
    B.addMerged(brickMat, pg, wf.clone().multiply(tmat(0, H, -zo - wallT / 2)), { tint });
    const cg = box(wl.L - trim + 0.10, 0.075, wallT + 0.10, { segY: 1 });
    B.addMerged('nycha:precast', cg,
      wf.clone().multiply(tmat(0, H + parapetH + yo, -zo - wallT / 2)), {});
    if (wl.tag !== 'rear' && rng.bool(0.9)) {
      const n = Math.max(1, Math.floor((wl.L - trim) / 2.0));
      const span = n * 2.0;
      for (let k = 0; k < n; k++) {
        B.addInstance(railId, wf.clone().multiply(
          tmat(-span / 2 + 1.0 + k * 2.0, H + parapetH + 0.075 + yo, -wallT * 0.55 - zo)), railTint);
      }
    }
  });

  // -------------------------------------------------------------------------
  // ROOF
  // -------------------------------------------------------------------------
  const coolRoof = rng.bool(0.3);
  plan.vols.forEach((v, i) => {
    const g = box(v.w - 0.14, 0.12, v.d - 0.14, { segY: 1 });
    B.addMerged(coolRoof ? 'nycha:precast' : 'roofBlack', g,
      at(lot.frame, v.x, H - 0.12 + i * 0.005, v.z, v.ry), {
        tint: coolRoof ? new THREE.Color(0.95, 0.94, 0.92) : new THREE.Color(0.60, 0.58, 0.55),
      });
  });

  const cv = plan.coreVol;
  const phW = clamp(rng.range(7.0, 9.6), 4.6, cv.w - 2.4);
  const phD = clamp(rng.range(6.0, 7.8), 4.2, cv.d - 1.6);
  const phH = rng.range(3.5, 4.5);
  const ph = bulkheadPart(B, phW, phD, phH, brickMat);
  const phM = at(lot.frame, plan.center.x + rng.range(-0.6, 0.6), H, plan.center.z + rng.range(-0.5, 0.5));
  B.addInstance(ph.id, phM, tint);
  B.addInstance(ph.capId, phM);
  B.addInstance(ph.gearId, phM);
  if (rng.bool(0.4)) {
    const b2 = bulkheadPart(B, rng.range(3.0, 4.2), rng.range(2.8, 3.6), rng.range(2.5, 3.2), brickMat);
    const m2 = at(lot.frame,
      plan.center.x + (rng.bool() ? 1 : -1) * rng.range(0.26, 0.36) * cv.w, H,
      plan.center.z - rng.range(0.1, 0.3) * cv.d);
    B.addInstance(b2.id, m2, tint);
    B.addInstance(b2.capId, m2);
  }
  // tall brick boiler flue — the Clinton Houses skyline signature
  if (rng.bool(0.45)) {
    const fw = rng.range(1.05, 1.45), fH = rng.range(5.0, 9.0);
    const fx = plan.center.x + (rng.bool() ? 1 : -1) * (phW / 2 + rng.range(0.8, 1.6));
    const fz = plan.center.z + rng.range(-0.6, 0.6);
    B.addMerged(brickMat, box(fw, phH + fH, fw, { segY: 4 }), at(lot.frame, fx, H, fz), { tint });
    B.addMerged('nycha:precast', box(fw + 0.16, 0.10, fw + 0.16, { segY: 1 }),
      at(lot.frame, fx, H + phH + fH, fz), {});
  }
  // roof hatch
  B.addMerged('nycha:precast', box(0.9, 0.26, 1.05, { segY: 1 }),
    at(lot.frame, plan.center.x + rng.range(2.6, 4.4), H, plan.center.z + rng.range(2.4, 4.0)),
    { tint: new THREE.Color(0.60, 0.61, 0.60) });
  // vent stacks + gooseneck / mushroom vents
  for (let i = 0, nv = rng.int(9, 16); i < nv; i++) {
    const vv = plan.vols[rng.int(0, plan.vols.length - 1)];
    K.vent(at(lot.frame,
      vv.x + rng.range(-0.36, 0.36) * vv.w, H, vv.z + rng.range(-0.36, 0.36) * vv.d),
      { kind: rng.weighted([['pipe', 6], ['goose', 3], ['whirly', 2]]) });
  }
  // satellite dishes clustered at the parapet
  {
    const did = dishPart(B);
    const vv = plan.vols[0];
    for (let i = 0, nd = rng.int(3, 9); i < nd; i++) {
      B.addInstance(did, at(lot.frame,
        vv.x + rng.range(-0.40, 0.40) * vv.w, H,
        vv.z + rng.range(0.24, 0.42) * vv.d, rng.range(-1.2, 1.2)),
        new THREE.Color(0.85, 0.84, 0.82));
    }
  }
  if (rng.bool(0.45)) {
    const cid = cellPart(B);
    for (let i = 0, nc = rng.int(3, 6); i < nc; i++) {
      const a = (i / nc) * Math.PI * 2;
      B.addInstance(cid, at(lot.frame,
        plan.center.x + Math.sin(a) * phW * 0.40, H + phH,
        plan.center.z + Math.cos(a) * phD * 0.40, a));
    }
  }
  if (rng.bool(0.4)) {
    K.antenna(at(lot.frame, plan.center.x + rng.range(-1, 1) * phW * 0.3, H + phH, plan.center.z));
  }
  if (rng.bool(0.5)) {
    K.hvac(at(lot.frame, plan.center.x + rng.range(-1, 1) * cv.w * 0.28, H,
      plan.center.z + rng.range(0.16, 0.34) * cv.d, rng.range(0, 3)));
  }

  // -------------------------------------------------------------------------
  // SITE: paved court, courts of lawn in the notches, front lawn strip +
  // bent-pipe hairpin fence (the superblock setback), walk to the door.
  // -------------------------------------------------------------------------
  {
    const lawnZ0 = 0.62, lawnZ1 = 2.62, walkW = 2.5;
    const entryWall = plan.walls.find((w) => w._ex != null);
    const walkX = entryWall
      ? entryWall.x + (entryWall._ex || 0) * Math.cos(entryWall.ry) : 0;
    // site paving over the whole footprint + notches (so the notch floor is
    // never the street asphalt)
    B.addMerged('sidewalk', box(W, 0.145, D + lawnZ0, { segY: 1 }),
      at(lot.frame, 0, 0, (lawnZ0 - D) / 2), { tint: new THREE.Color(0.80, 0.79, 0.77) });
    // lawn courts inside the notches
    for (const c of plan.courts || []) {
      const d = c.z1 - c.z0;
      if (d < 0.6 || c.w < 0.6) continue;
      B.addMerged('nycha:lawn', box(c.w, 0.10, d, { segY: 1 }),
        at(lot.frame, c.x, 0.145, (c.z0 + c.z1) / 2),
        { tint: new THREE.Color(1, 1, 1).multiplyScalar(rng.range(0.86, 1.04)) });
    }
    // walk from the sidewalk to the door
    const walkZ0 = Math.min(0, entryWall ? entryWall.z : 0);
    B.addMerged('sidewalk', box(walkW, 0.06, lawnZ1 + 0.5 - walkZ0, { segY: 1 }),
      at(lot.frame, walkX, 0.145, (walkZ0 + lawnZ1 + 0.5) / 2),
      { tint: new THREE.Color(0.91, 0.90, 0.88) });
    // front lawn strip either side of the walk + hairpin fence along its edge
    const fid = fencePart(B, fenceMat);
    for (const [a, b] of [[-W / 2, walkX - walkW / 2], [walkX + walkW / 2, W / 2]]) {
      if (b - a < 0.5) continue;
      B.addMerged('nycha:lawn', box(b - a, 0.10, lawnZ1 - lawnZ0, { segY: 1 }),
        at(lot.frame, (a + b) / 2, 0.145, (lawnZ0 + lawnZ1) / 2),
        { tint: new THREE.Color(1, 1, 1).multiplyScalar(rng.range(0.85, 1.05)) });
      const n = Math.floor((b - a) / 2.0);
      for (let k = 0; k < n; k++) {
        B.addInstance(fid, at(lot.frame, a + (b - a - n * 2) / 2 + 1.0 + k * 2.0, 0.245, lawnZ1 - 0.08), fenceTint);
      }
      // short return along the walk
      B.addInstance(fid, at(lot.frame, b > walkX ? b - 0.06 : a + 0.06, 0.245, lawnZ1 - 1.07, PI2), fenceTint);
    }
  }

  return { height: H + parapetH + phH };
}
