// Pre-war apartment house — Harlem / Sugar Hill / Riverside Dr type, 6-12 st.
// Base-shaft-cap: granite-or-limestone base, brick shaft with paired 1/1 double
// hungs on stone sills, terra-cotta belt courses + spandrel plaques, heavy
// bracketed sheet-metal cornice (or corbelled parapet), grand stone entrance
// with iron-and-glass marquee, wood water tank + bulkheads on the roof.
// Refs: 409 & 555 Edgecombe Ave, 121 Lenox Ave.  Doc: 04-prewar-apartment.md
import * as THREE from 'three';
import { at, punchedWall, shellWalls, flatRoof, facadeTint } from './lib.js';
import { box, quad, cylinder, compose, profileAlongX, ensureColor } from '../geo.js';
import { brickTexture, stoneTexture } from '../textures.js';

export const TYPE = 'prewar';

const q05 = (v) => Math.round(v * 20) / 20;
const q10 = (v) => Math.round(v * 10) / 10;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------------------
// MATERIALS (registered once; materials.js is never touched)
// ---------------------------------------------------------------------------
function ensureMats(B) {
  if (B.M.has('prewar:brickBeige')) return;
  const mk = (name, tex, opts) => {
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true, map: tex.map, bumpMap: tex.bumpMap || null, ...opts,
    });
    m.userData.tileMeters = tex.tileMeters;
    m.name = name;
    B.M.set(name, m);
  };
  // beige brick #CDBFA6 — 555 Edgecombe / 1920s avenue houses
  mk('prewar:brickBeige', brickTexture({
    hue: 33, sat: 22, light: 71, dh: 5, ds: 7, dl: 8,
    mortar: '#c9c1b1', darkBrickChance: 0.02, seed: 71,
  }), { bumpScale: 1.0, roughness: 0.85, envMapIntensity: 0.6 });
  // dark red brick with pale lime mortar — the 409 Edgecombe horizontal striping
  mk('prewar:brickRedDeep', brickTexture({
    hue: 7, sat: 37, light: 32, dh: 6, ds: 12, dl: 9,
    mortar: '#c6bba7', mortarLight: 0.04, darkBrickChance: 0.05, seed: 72,
  }), { bumpScale: 1.3, roughness: 0.9, envMapIntensity: 0.55 });
  // pale yellow common brick — secondary / court / party / rear walls
  mk('prewar:brickYellow', brickTexture({
    hue: 44, sat: 24, light: 67, dh: 5, ds: 8, dl: 9,
    mortar: '#b7af9e', darkBrickChance: 0.03, seed: 73,
  }), { bumpScale: 1.0, roughness: 0.88, envMapIntensity: 0.5 });
  // cream GLAZED terra cotta — the only shiny thing above the ground floor
  mk('prewar:tcCream', stoneTexture({
    base: '#dcd5c4', blockW: 0.62, blockH: 0.30, jointDark: 0.16, weather: 0.05, seed: 74,
  }), { roughness: 0.44, metalness: 0.03, envMapIntensity: 0.95 });
  // soiled limestone ashlar, big courses
  mk('prewar:limeSoil', stoneTexture({
    base: '#c1b7a3', blockW: 1.05, blockH: 0.46, jointDark: 0.27, weather: 0.15, seed: 75,
  }), { roughness: 0.87, envMapIntensity: 0.55 });
}

// ---------------------------------------------------------------------------
// EXTRUDED PROFILES.  profileAlongX() throws the profile toward LOCAL -Z, so
// every placement below adds ry = PI to swing it out over the street.
// ---------------------------------------------------------------------------
const PROF = {
  // main cornice: proj 1.04, height 1.30 (doc 10-16 st: 0.91-1.83 / 1.07-2.13)
  cornice: [
    [0, 0], [0.16, 0.03], [0.18, 0.14], [0.28, 0.20], [0.30, 0.40], [0.36, 0.46],
    [0.36, 0.62], [1.00, 0.84], [1.04, 0.96], [1.02, 1.10], [0.92, 1.18],
    [0.94, 1.30], [0, 1.30],
  ],
  // crowning cornice for 6-7 story buildings: proj 0.78, h 1.00
  corniceLow: [
    [0, 0], [0.13, 0.02], [0.15, 0.12], [0.23, 0.17], [0.25, 0.32], [0.29, 0.37],
    [0.29, 0.50], [0.74, 0.66], [0.78, 0.77], [0.76, 0.88], [0.67, 0.94],
    [0.69, 1.00], [0, 1.00],
  ],
  // intermediate cornice / cap entablature: proj 0.56, h 0.86
  entab: [
    [0, 0], [0.10, 0.02], [0.12, 0.10], [0.20, 0.14], [0.22, 0.30], [0.26, 0.34],
    [0.26, 0.46], [0.54, 0.58], [0.56, 0.66], [0.54, 0.74], [0.48, 0.78],
    [0.50, 0.86], [0, 0.86],
  ],
  // belt course above the base: proj 0.26, h 0.42
  belt: [
    [0, 0], [0.10, 0.02], [0.12, 0.10], [0.20, 0.14], [0.22, 0.26], [0.26, 0.30],
    [0.24, 0.37], [0.26, 0.42], [0, 0.42],
  ],
  // minor string course: proj 0.09, h 0.20
  string: [[0, 0], [0.07, 0.01], [0.09, 0.06], [0.09, 0.14], [0.06, 0.18], [0.07, 0.20], [0, 0.20]],
  // continuous stone lintel course: proj 0.06, h 0.22
  lintelBand: [[0, 0], [0.06, 0.0], [0.06, 0.19], [0.035, 0.22], [0, 0.22]],
  // granite water table: proj 0.10, h 0.34
  waterTable: [[0, 0], [0.10, 0.0], [0.10, 0.24], [0.055, 0.32], [0.055, 0.34], [0, 0.34]],
  // corbelled brick parapet cap (cornice-removed variant): proj 0.22, h 0.54
  corbel: [
    [0, 0], [0.07, 0.0], [0.07, 0.13], [0.14, 0.13], [0.14, 0.26], [0.22, 0.26],
    [0.22, 0.40], [0.18, 0.44], [0.20, 0.54], [0, 0.54],
  ],
};

// ---------------------------------------------------------------------------
// INSTANCED PARTS
// ---------------------------------------------------------------------------
function pBracket(B, big) {
  const id = big ? 'prewar:bracket' : 'prewar:bracketS';
  if (B.hasPart(id)) return id;
  const s = big ? 1 : 0.62;
  const items = [];
  items.push({ geom: box(0.17 * s, 0.50 * s, 0.50 * s), x: 0, y: 0, z: 0.25 * s });
  items.push({ geom: box(0.23 * s, 0.09 * s, 0.60 * s), x: 0, y: 0.50 * s, z: 0.30 * s });
  items.push({ geom: box(0.21 * s, 0.15 * s, 0.19 * s), x: 0, y: 0.33 * s, z: 0.56 * s });
  items.push({ geom: box(0.13 * s, 0.20 * s, 0.14 * s), x: 0, y: 0.05 * s, z: 0.07 * s });
  items.push({ geom: box(0.15 * s, 0.10 * s, 0.30 * s), x: 0, y: 0.02 * s, z: 0.15 * s });
  B.definePart(id, compose(items), 'cornicePaint');
  return id;
}

function pDentils(B) {
  const id = 'prewar:dentils';
  if (B.hasPart(id)) return id;
  const items = [];
  const n = 15, pitch = 2.0 / n;
  for (let i = 0; i < n; i++) {
    items.push({ geom: box(pitch * 0.55, 0.13, 0.13), x: -1.0 + pitch * (i + 0.5), y: 0, z: 0.065 });
  }
  items.push({ geom: box(2.0, 0.05, 0.06), x: 0, y: 0.13, z: 0.03 });
  B.definePart(id, compose(items), 'cornicePaint');
  return id;
}

// terra-cotta spandrel plaque — the 409 Edgecombe shield-and-foliage band
function pPlaque(B, mat) {
  const id = `prewar:plaque:${mat}`;
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: box(1.04, 0.40, 0.055), x: 0, y: 0, z: 0.027 });
  const shield = box(0.24, 0.30, 0.04);
  ensureColor(shield, new THREE.Color(1.05, 1.05, 1.03));
  items.push({ geom: shield, x: 0, y: 0.05, z: 0.067 });
  items.push({ geom: box(0.10, 0.11, 0.03), x: 0, y: 0.30, z: 0.062 });
  for (const s of [-1, 1]) {
    const f = box(0.26, 0.16, 0.032);
    ensureColor(f, new THREE.Color(0.93, 0.93, 0.91));
    items.push({ geom: f, x: s * 0.30, y: 0.10, z: 0.058 });
    items.push({ geom: box(0.14, 0.09, 0.028), x: s * 0.20, y: 0.27, z: 0.055 });
  }
  B.definePart(id, compose(items), mat);
  return id;
}

// alternating proud stone blocks — quoin strip / rusticated pier, ~1 story tall
function pQuoin(B, h, w, mat) {
  h = q10(h); w = q05(w);
  const id = `prewar:quoin:${mat}:${w}x${h}`;
  if (B.hasPart(id)) return id;
  const items = [];
  const ch = 0.46, pitch = ch * 2;
  for (let y = 0.02; y + ch <= h; y += pitch) {
    items.push({ geom: box(w, ch, 0.055), x: 0, y, z: 0.027 });
  }
  if (!items.length) items.push({ geom: box(w, Math.max(0.2, h - 0.04), 0.055), x: 0, y: 0.02, z: 0.027 });
  B.definePart(id, compose(items), mat);
  return id;
}

// iron window guard / balconette railing
function pGuard(B, w) {
  w = q05(w);
  const id = `prewar:guard:${w}`;
  if (B.hasPart(id)) return id;
  const items = [];
  const h = 0.76;
  items.push({ geom: box(w, 0.035, 0.035), x: 0, y: h - 0.035, z: 0.055 });
  items.push({ geom: box(w, 0.03, 0.03), x: 0, y: h * 0.46, z: 0.05 });
  items.push({ geom: box(w, 0.03, 0.03), x: 0, y: 0.02, z: 0.05 });
  const n = Math.max(4, Math.round(w / 0.125));
  for (let i = 0; i <= n; i++) {
    items.push({ geom: box(0.017, h, 0.017), x: -w / 2 + (w / n) * i, y: 0.02, z: 0.05 });
  }
  for (const s of [-1, 1]) items.push({ geom: box(0.03, h + 0.04, 0.06), x: s * w / 2, y: 0, z: 0.03 });
  B.definePart(id, compose(items), 'ironwork');
  return id;
}

// stone balconette slab on console brackets
function pBalconette(B, mat) {
  const id = `prewar:balcSlab:${mat}`;
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: box(2.05, 0.13, 0.52), x: 0, y: 0.30, z: 0.26 });
  items.push({ geom: box(1.85, 0.07, 0.44), x: 0, y: 0.43, z: 0.22 });
  for (const s of [-1, 1]) {
    items.push({ geom: box(0.17, 0.32, 0.34), x: s * 0.72, y: 0.0, z: 0.17 });
    items.push({ geom: box(0.13, 0.14, 0.20), x: s * 0.72, y: 0.30, z: 0.30 });
  }
  items.push({ geom: box(0.17, 0.30, 0.30), x: 0, y: 0.02, z: 0.15 });
  B.definePart(id, compose(items), mat);
  return id;
}

// through-wall AC sleeve + grille (the loudest modern tell)
function pAcSleeve(B) {
  const id = 'prewar:acsleeve';
  if (B.hasPart(id)) return id;
  const items = [];
  const frame = box(0.70, 0.46, 0.06);
  ensureColor(frame, new THREE.Color(0.36, 0.35, 0.33));
  items.push({ geom: frame, x: 0, y: 0, z: 0.01 });
  const face = box(0.62, 0.38, 0.03);
  ensureColor(face, new THREE.Color(0.2, 0.195, 0.19));
  items.push({ geom: face, x: 0, y: 0.04, z: -0.01 });
  for (let i = 0; i < 4; i++) {
    const l = box(0.58, 0.022, 0.022);
    ensureColor(l, new THREE.Color(0.44, 0.43, 0.41));
    items.push({ geom: l, x: 0, y: 0.09 + i * 0.075, z: 0.02 });
  }
  B.definePart(id, compose(items), 'paintFlat');
  return id;
}

function pRosette(B, mat) {
  const id = `prewar:rosette:${mat}`;
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: cylinder(0.115, 0.135, 0.07, 10), x: 0, y: 0, z: 0.035, rx: Math.PI / 2 });
  items.push({ geom: cylinder(0.05, 0.05, 0.10, 8), x: 0, y: 0, z: 0.05, rx: Math.PI / 2 });
  B.definePart(id, compose(items), mat);
  return id;
}

function pBalustrade(B, w, mat) {
  w = q05(w);
  const id = `prewar:balust:${mat}:${w}`;
  if (B.hasPart(id)) return id;
  const items = [];
  const h = 0.88;
  items.push({ geom: box(w, 0.13, 0.36), x: 0, y: h - 0.13, z: 0.18 });
  items.push({ geom: box(w, 0.11, 0.32), x: 0, y: 0, z: 0.16 });
  const inner = w - 0.5;
  const n = Math.max(3, Math.round(inner / 0.24));
  for (let i = 0; i < n; i++) {
    items.push({ geom: cylinder(0.05, 0.075, h - 0.24, 7), x: -inner / 2 + (inner / n) * (i + 0.5), y: 0.11, z: 0.17 });
  }
  for (const s of [-1, 1]) items.push({ geom: box(0.22, h, 0.36), x: s * (w / 2 - 0.11), y: 0, z: 0.18 });
  B.definePart(id, compose(items), mat);
  return id;
}

// iron-and-glass marquee over the entrance
function pCanopy(B) {
  const id = 'prewar:canopy';
  if (B.hasPart(id)) return id;
  const w = 3.5, pr = 1.85;
  const items = [];
  items.push({ geom: box(w, 0.22, 0.10), x: 0, y: 0, z: pr - 0.05 });
  items.push({ geom: box(0.10, 0.22, pr), x: -w / 2 + 0.05, y: 0, z: pr / 2 });
  items.push({ geom: box(0.10, 0.22, pr), x: w / 2 - 0.05, y: 0, z: pr / 2 });
  items.push({ geom: box(w, 0.18, 0.12), x: 0, y: 0, z: 0.06 });
  for (let i = 1; i < 4; i++) {
    items.push({ geom: box(0.055, 0.13, pr - 0.12), x: -w / 2 + (w / 4) * i, y: 0.09, z: pr / 2 });
  }
  items.push({ geom: box(w - 0.22, 0.05, 0.05), x: 0, y: 0.15, z: pr * 0.52 });
  const dy = 1.45, dz = pr - 0.3, len = Math.hypot(dy, dz);
  for (const s of [-1, 1]) {
    items.push({
      geom: cylinder(0.019, 0.019, len, 6), x: s * (w / 2 - 0.09), y: 0.18, z: pr - 0.25,
      rx: -Math.atan2(dz, dy),
    });
  }
  B.definePart(id, compose(items), 'ironwork');
  const g = quad(w - 0.34, pr - 0.28);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0.14, 0.16);
  B.definePart('prewar:canopy:glass', g, 'glass', { castShadow: false });
  return id;
}

function pLamp(B) {
  const id = 'prewar:lamp';
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: box(0.10, 0.24, 0.09), x: 0, y: 0, z: 0.045 });
  items.push({ geom: cylinder(0.022, 0.022, 0.26, 6), x: 0, y: 0.20, z: 0.13, rx: -0.5 });
  const gl = box(0.15, 0.30, 0.15);
  ensureColor(gl, new THREE.Color(1.7, 1.5, 1.1));
  items.push({ geom: gl, x: 0, y: 0.28, z: 0.24 });
  items.push({ geom: box(0.18, 0.05, 0.18), x: 0, y: 0.58, z: 0.24 });
  B.definePart(id, compose(items), 'ironwork');
  return id;
}

// intercom / meters / conduit clutter beside the door
function pEntryClutter(B) {
  const id = 'prewar:clutter';
  if (B.hasPart(id)) return id;
  const items = [];
  const p = box(0.20, 0.34, 0.06);
  ensureColor(p, new THREE.Color(0.6, 0.6, 0.62));
  items.push({ geom: p, x: 0, y: 1.05, z: 0.03 });
  const m = box(0.26, 0.30, 0.13);
  ensureColor(m, new THREE.Color(0.42, 0.43, 0.42));
  items.push({ geom: m, x: 0.42, y: 1.35, z: 0.065 });
  items.push({ geom: cylinder(0.024, 0.024, 1.7, 6), x: 0.60, y: 0.1, z: 0.03 });
  items.push({ geom: box(0.14, 0.18, 0.09), x: -0.3, y: 0.55, z: 0.045 });
  B.definePart(id, compose(items), 'paintFlat');
  return id;
}

function pPipeRail(B) {
  const id = 'prewar:piperail';
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: box(2.0, 0.045, 0.045), x: 0, y: 1.05, z: 0 });
  items.push({ geom: box(2.0, 0.04, 0.04), x: 0, y: 0.55, z: 0 });
  items.push({ geom: cylinder(0.025, 0.025, 1.07, 6), x: -1.0, y: 0, z: 0 });
  items.push({ geom: cylinder(0.025, 0.025, 1.07, 6), x: 1.0, y: 0, z: 0 });
  B.definePart(id, compose(items), 'steelDark');
  return id;
}

function pDish(B) {
  const id = 'prewar:dish';
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: cylinder(0.05, 0.05, 0.8, 6), x: 0, y: 0, z: 0 });
  items.push({ geom: box(0.30, 0.06, 0.30), x: 0, y: 0.78, z: 0 });
  items.push({ geom: cylinder(0.33, 0.30, 0.07, 12), x: 0, y: 0.85, z: 0.16, rx: 1.05 });
  items.push({ geom: cylinder(0.02, 0.02, 0.34, 6), x: 0, y: 0.9, z: 0.36, rx: 1.4 });
  B.definePart(id, compose(items), 'aluminum');
  return id;
}

// diaperwork diamond (cap-story brick patterning)
function pDiamond(B, mat) {
  const id = `prewar:diamond:${mat}`;
  if (B.hasPart(id)) return id;
  const g = box(0.40, 0.40, 0.045);
  g.rotateZ(Math.PI / 4);
  g.translate(0, 0, 0.022);
  B.definePart(id, g, mat);
  return id;
}

// ---------------------------------------------------------------------------
// segmental voussoir ring for the entrance arch (merged, per building)
// anchor: springing centre, +z proud
// ---------------------------------------------------------------------------
function archRing(openW, rise) {
  const Rx = openW / 2 + 0.19, Ry = rise;
  const arc = Math.PI * (0.75 * (Rx + Ry) - 0.5 * Math.sqrt(Rx * Ry));
  const n = clamp(Math.round(arc / 0.34), 7, 15);
  const items = [];
  const bw = (arc / n) * 1.12;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * ((i + 0.5) / n);
    const ang = Math.atan2(Math.sin(a) / Ry, Math.cos(a) / Rx);
    items.push({
      geom: box(bw, 0.44, 0.26), rz: ang - Math.PI / 2,
      x: Math.cos(a) * Rx, y: Math.sin(a) * Ry, z: 0.13,
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// GENERATE
// ---------------------------------------------------------------------------
export function generate(ctx, lot, rng) {
  const { kit: K, batcher: B } = ctx;
  ensureMats(B);
  const F = lot.frame;

  const W = lot.width;
  const D = Math.max(12, lot.depth);
  const stories = clamp(lot.stories
    || rng.weighted([[6, 20], [7, 11], [8, 8], [9, 7], [10, 9], [11, 9], [12, 16]]), 5, 16);
  const corner = lot.corner | 0;
  const commercial = !!lot.commercial;
  const mir = lot.mirror ? -1 : 1;

  // ---- vertical schedule ---------------------------------------------------
  const groundH = q05(rng.range(4.05, 4.45));
  const floorH = q05(rng.range(2.92, 3.10));
  const floorY = (i) => (i <= 0 ? 0 : groundH + (i - 1) * floorH);
  const wallTop = floorY(stories);
  const tall = stories >= 8;

  // ---- palette -------------------------------------------------------------
  const brickMat = rng.weighted([
    ['prewar:brickRedDeep', 6], ['prewar:brickBeige', 5], ['brickTan', 4],
    ['brickOrange', 3], ['brickRed', 3], ['brickBrown', 2],
  ]);
  const brickTint = facadeTint(rng);
  const baseMat = rng.weighted([['graniteBase', 4], ['limestone', 4], ['prewar:limeSoil', 3]]);
  const baseTint = facadeTint(rng, new THREE.Color(0.99, 0.985, 0.97));
  const trimMat = rng.weighted([['prewar:tcCream', 5], ['limestone', 3], ['prewar:limeSoil', 2]]);
  const cornTint = new THREE.Color(rng.weighted([
    [0xd2c9b6, 5], [0xc4b9a4, 3], [0xb9b2a6, 2], [0x5c5f56, 1], [0x4a4642, 1],
  ]));
  const sideMat = corner ? brickMat : 'prewar:brickYellow';
  const frameA = new THREE.Color(rng.weighted([[0xe6e5e0, 5], [0x4a423a, 3], [0x8e8b84, 1]]));
  const frameB = new THREE.Color(rng.bool(0.5) ? 0xe6e5e0 : 0x4a423a);
  const bandFloor = rng.int(1, Math.max(1, stories - 2));

  const variant = rng.weighted([['plaque', 4], ['quoin', 3], ['band', 3]]);
  const capStyle = rng.weighted([['cornice', 6], ['parapet', 4]]);
  const capStories = stories >= 9 ? rng.weighted([[1, 4], [2, 5]]) : rng.weighted([[1, 6], [2, 3]]);
  const capBase = floorY(stories - capStories);
  const baseStyle = rng.weighted([['story', 45], ['two', stories >= 8 ? 25 : 0], ['plinth', 30]]);
  const plinthH = q05(rng.range(1.50, 2.15));
  const stoneTop = baseStyle === 'two' ? floorY(2) : baseStyle === 'story' ? floorY(1) : plinthH;
  const firstBrick = baseStyle === 'two' ? 2 : 1;
  const archedCap = rng.bool(0.45);
  const fireEscape = stories <= 7 ? rng.bool(0.45) : rng.bool(0.12);

  // ---- bay layout ----------------------------------------------------------
  const endPier = q05(clamp(rng.range(1.05, 1.55), 0.85, W * 0.085));
  const usable = W - 2 * endPier;
  const pairedFacade = rng.bool(0.58);
  const oc = pairedFacade ? rng.range(3.55, 4.20) : rng.range(2.85, 3.30);
  const nBays = clamp(Math.round(usable / oc), 3, 8);
  const eMul = rng.range(1.12, 1.45);
  const unit = usable / (nBays - 1 + eMul);
  let eIdx = nBays % 2 === 1 ? (nBays - 1) / 2 : (mir < 0 ? nBays / 2 - 1 : nBays / 2);
  if (nBays >= 5 && rng.bool(0.2)) eIdx = clamp(eIdx + mir, 1, nBays - 2);

  const bays = [];
  {
    let cx = -W / 2 + endPier;
    for (let i = 0; i < nBays; i++) {
      const bw = i === eIdx ? unit * eMul : unit;
      bays.push({ x: cx + bw / 2, w: bw, i });
      cx += bw;
    }
  }
  const eBay = bays[eIdx];
  const pierXs = [];
  for (let i = 0; i < bays.length - 1; i++) pierXs.push(bays[i].x + bays[i].w / 2);

  // opening group per bay: disciplined rhythm, entrance bay emphasised
  const sashW = q05(pairedFacade ? rng.range(0.82, 0.92) : rng.range(0.95, 1.10));
  const triW = q05(sashW * 0.86);
  const mull = 0.22;
  const spanOf = (g) => (g === 'tri' ? 3 * triW + 2 * mull : g === 'pair' ? 2 * sashW + mull : sashW);
  for (const b of bays) {
    let g = pairedFacade ? 'pair' : 'single';
    if (!pairedFacade && b.i === eIdx) g = rng.bool(0.6) ? 'pair' : 'single';
    else if (!pairedFacade && nBays >= 5 && (b.i === 1 || b.i === nBays - 2) && rng.bool(0.35)) g = 'tri';
    if (spanOf(g) > b.w - 0.62) g = g === 'tri' ? 'pair' : 'single';
    if (spanOf(g) > b.w - 0.62) g = 'single';
    b.group = g;
    b.span = spanOf(g);
    b.ow = g === 'tri' ? triW : sashW;
    b.offs = g === 'tri' ? [-(triW + mull), 0, triW + mull]
      : g === 'pair' ? [-(sashW + mull) / 2, (sashW + mull) / 2] : [0];
  }

  // ---- window sizes --------------------------------------------------------
  const sillH = q05(rng.range(0.80, 0.92));
  const winH = q05(rng.range(1.58, 1.78));
  const gWinH = q05(rng.range(2.20, 2.55));
  const gSillY = q05(baseStyle === 'plinth' ? plinthH + rng.range(0.05, 0.30) : rng.range(1.00, 1.25));
  const style = rng.weighted([['dh1', 8], ['dh2', 2]]);
  const glassFor = () => {
    const r = rng.next();
    const l = r < 0.16 ? rng.range(0.88, 1.12) : r < 0.32 ? rng.range(0.16, 0.30) : rng.range(0.40, 0.72);
    return new THREE.Color().setHSL(rng.range(0.54, 0.60), rng.range(0.04, 0.16), l);
  };

  // ---- entrance schedule ---------------------------------------------------
  const entStyle = rng.weighted([['arch', 4], ['columns', 4], ['deco', 2]]);
  const nSteps = rng.int(1, 3);
  const stepTop = q05(nSteps * 0.16);
  const doorW = q05(clamp(eBay.w - rng.range(1.55, 2.15), 1.7, 2.45));
  const openW = doorW + 0.34;
  const entCapY = groundH + 0.02;                    // surround dies at the 2nd floor line
  const archRise = entStyle === 'arch' ? q05(clamp(openW * 0.44, 0.7, 1.15)) : 0;
  const springY = q05(entStyle === 'arch' ? entCapY - archRise - 0.30
    : entStyle === 'columns' ? entCapY - 0.86 : entCapY - 1.02);
  const doorTotal = q05(clamp(springY - stepTop - 0.04, 2.35, 3.9));
  const hasBalcony = entStyle !== 'deco' || rng.bool(0.4);

  // =========================================================================
  // WALLS
  // =========================================================================
  const groundOps = [];
  const sfBays = [];
  if (commercial) {
    for (const b of bays) {
      if (b.i === eIdx) continue;
      const sw = q05(Math.min(b.w - 0.6, 6.4));
      if (sw < 2.2) continue;
      sfBays.push({ x: b.x, w: sw });
      groundOps.push({ x: b.x, w: sw, y0: 0.05, y1: 3.30 });
    }
  } else {
    for (const b of bays) {
      if (b.i === eIdx) continue;
      for (const o of b.offs) groundOps.push({ x: b.x + o, w: b.ow, y0: gSillY, y1: gSillY + gWinH });
    }
  }
  // service door in an end pier
  let svcX = null;
  if (!commercial && baseStyle !== 'plinth' && endPier >= 1.25 && rng.bool(0.5)) {
    svcX = -mir * (W / 2 - endPier / 2 - 0.05);
    groundOps.push({ x: svcX, w: 1.05, y0: 0.04, y1: 2.30 });
  }

  const upperRow = (f) => {
    const y = floorY(f) + sillH;
    const ops = [];
    for (const b of bays) for (const o of b.offs) ops.push({ x: b.x + o, w: b.ow });
    return { y0: y, y1: y + winH, openings: ops };
  };

  // ---- stone base ----
  const stoneRows = [];
  if (baseStyle === 'plinth') {
    stoneRows.push({ y0: stepTop, y1: Math.min(springY, plinthH - 0.02), openings: [{ x: eBay.x, w: openW }] });
  } else {
    const row = {
      y0: 0.04, y1: Math.max(springY, gSillY + gWinH + 0.04, 2.4),
      openings: [{ x: eBay.x, w: openW, y0: stepTop, y1: springY }].concat(groundOps),
    };
    row.openings.sort((a, b2) => a.x - b2.x);
    stoneRows.push(row);
    if (baseStyle === 'two') stoneRows.push(upperRow(1));
  }
  punchedWall(ctx, F, {
    width: W, height: stoneTop, depth: 0.42, mat: baseMat, tint: baseTint,
    rows: stoneRows, grime: 0.34, aoTop: stoneTop,
  });

  // ---- brick shaft ----
  const shaftRows = [];
  if (baseStyle === 'plinth') {
    const ops = [{ x: eBay.x, w: openW, y0: 0.02, y1: springY - plinthH }];
    for (const o of groundOps) ops.push({ x: o.x, w: o.w, y0: o.y0 - plinthH, y1: o.y1 - plinthH });
    ops.sort((a, b2) => a.x - b2.x);
    shaftRows.push({ y0: 0.02, y1: Math.max(springY, gSillY + gWinH + 0.04) - plinthH, openings: ops });
  }
  for (let f = firstBrick; f < stories - capStories; f++) {
    const r = upperRow(f);
    shaftRows.push({ y0: r.y0 - stoneTop, y1: r.y1 - stoneTop, openings: r.openings });
  }
  punchedWall(ctx, at(F, 0, stoneTop, 0), {
    width: W, height: capBase - stoneTop, depth: 0.42, mat: brickMat, tint: brickTint,
    rows: shaftRows, aoTop: capBase,
  });

  // ---- cap ----
  const capRows = [];
  for (let f = stories - capStories; f < stories; f++) {
    const r = upperRow(f);
    capRows.push({ y0: r.y0 - capBase, y1: r.y1 - capBase, openings: r.openings });
  }
  const capTint = brickTint.clone().multiplyScalar(rng.range(0.95, 1.03));
  punchedWall(ctx, at(F, 0, capBase, 0), {
    width: W, height: wallTop - capBase, depth: 0.42, mat: brickMat, tint: capTint,
    rows: capRows, aoTop: wallTop,
  });

  // =========================================================================
  // WINDOW UNITS + TRIM
  // =========================================================================
  const putGroup = (b, y, h, wid, ft) => {
    for (const o of b.offs) {
      K.window({ w: wid, h, style, recess: 0.15 }, at(F, b.x + o, y, 0), {
        tint: ft, glassTint: glassFor(), lit: rng.bool(0.36),
      });
    }
  };

  // ground floor
  if (!commercial) {
    const gTrim = baseStyle === 'plinth' ? trimMat : baseMat;
    for (const b of bays) {
      if (b.i === eIdx) continue;
      putGroup(b, gSillY, gWinH, b.ow, frameA);
      K.sill(b.span, at(F, b.x, gSillY, 0), { mat: gTrim });
      K.lintel(b.span, at(F, b.x, gSillY + gWinH + 0.02, 0), { mat: gTrim, style: 'flat' });
      if (rng.bool(0.7)) {
        for (const o of b.offs) B.addInstance(pGuard(B, b.ow + 0.1), at(F, b.x + o, gSillY + 0.03, 0.04));
      }
    }
  } else {
    for (const s of sfBays) {
      K.storefront({
        width: s.w, signIndex: rng.int(0, 31),
        awningIndex: rng.bool(0.55) ? rng.int(0, 7) : -1,
        gate: rng.bool(0.18) ? (rng.bool(0.5) ? 2 : 1) : 0,
      }, at(F, s.x, 0.02, 0));
    }
  }
  if (svcX !== null) {
    K.door({ w: 0.95, h: 2.2, transom: false }, at(F, svcX, 0.06, -0.02), {
      tint: new THREE.Color(0x2a2a28),
    });
  }

  // upper floors
  const acCols = new Set();
  const nAcCols = Math.max(1, Math.round(nBays * rng.range(0.35, 0.7)));
  for (let i = 0; i < nAcCols; i++) acCols.add(rng.int(0, nBays - 1));
  const balcFloors = new Set();
  if (rng.bool(0.55)) {
    let f = 4 + rng.int(0, 1);
    while (f < stories - capStories - 1 && balcFloors.size < 3) { balcFloors.add(f); f += 2 + rng.int(0, 1); }
  }

  for (let f = 1; f < stories; f++) {
    const y = floorY(f) + sillH;
    const headY = y + winH;
    const isCap = f >= stories - capStories;
    const inStone = f < firstBrick;
    const ft = (f >= bandFloor && f < bandFloor + 3) ? frameB : frameA;
    const hTrim = inStone ? baseMat : trimMat;
    for (const b of bays) {
      putGroup(b, y, winH, b.ow, ft);
      K.sill(b.span, at(F, b.x, y, 0), { mat: hTrim });
      // heads
      if (isCap && archedCap && f === stories - 1) {
        for (const o of b.offs) K.lintel(b.ow, at(F, b.x + o, headY + 0.02, 0), { mat: trimMat, style: 'arch' });
        B.addInstance(pRosette(B, trimMat), at(F, b.x, headY + 0.58, 0.02), cornTint);
      } else if (variant !== 'quoin' || inStone) {
        K.lintel(b.span, at(F, b.x, headY + 0.02, 0), { mat: hTrim, style: 'flat' });
      }
      // spandrel enrichment
      if (variant === 'plaque' && !inStone && f < stories - 1) {
        const nextSill = floorY(f + 1) + sillH;
        B.addInstance(pPlaque(B, 'prewar:tcCream'), at(F, b.x, (headY + nextSill) / 2 - 0.20, 0.0), cornTint);
      }
      if (isCap && variant === 'band' && f === stories - 1 && b.i < nBays - 1) {
        B.addInstance(pDiamond(B, trimMat), at(F, b.x + b.w / 2, y + winH * 0.5, 0.0), cornTint);
      }
      // through-wall AC sleeves, vertically stacked
      if (acCols.has(b.i) && rng.bool(0.72)) {
        B.addInstance(pAcSleeve(B), at(F, b.x + b.offs[0], y - 0.58, 0.0));
      } else if (rng.bool(0.09)) {
        K.acUnit(at(F, b.x + b.offs[0], y + 0.02, 0.05));
      }
      // balconettes: centre + flanking bays only
      if (balcFloors.has(f) && Math.abs(b.i - eIdx) <= 1 && b.span > 1.6) {
        B.addInstance(pBalconette(B, trimMat), at(F, b.x, y - 0.42, 0.0), cornTint);
        B.addInstance(pGuard(B, 1.85), at(F, b.x, y - 0.01, 0.44));
      }
    }
    // iron railings on the piano-nobile floor
    if (f === firstBrick && !balcFloors.has(f) && rng.bool(0.5)) {
      for (const b of bays) {
        if (b.i === eIdx && hasBalcony) continue;
        for (const o of b.offs) B.addInstance(pGuard(B, b.ow + 0.1), at(F, b.x + o, y + 0.02, 0.04));
      }
    }
  }

  // =========================================================================
  // HORIZONTAL TRIM
  // =========================================================================
  const gapX = eBay.x, gapW = hasBalcony ? Math.min(eBay.w, openW + 2.2) : 0;
  const FP = (y, name, mat, tint, len = W + 0.1, gap = false) => {
    if (!gap || gapW <= 0) {
      B.addMerged(mat, profileAlongX(PROF[name], len), at(F, 0, y, 0, Math.PI), { tint });
      return;
    }
    const l0 = (gapX - gapW / 2) - (-len / 2);
    const l1 = (len / 2) - (gapX + gapW / 2);
    if (l0 > 0.3) B.addMerged(mat, profileAlongX(PROF[name], l0), at(F, -len / 2 + l0 / 2, y, 0, Math.PI), { tint });
    if (l1 > 0.3) B.addMerged(mat, profileAlongX(PROF[name], l1), at(F, len / 2 - l1 / 2, y, 0, Math.PI), { tint });
  };

  if (rng.bool(0.75)) FP(0.02, 'waterTable', baseMat, baseTint.clone().multiplyScalar(0.86));
  if (baseStyle === 'plinth') FP(plinthH - 0.04, 'string', baseMat, baseTint);
  FP(stoneTop - 0.10, 'belt', trimMat, cornTint, W + 0.1, baseStyle !== 'two');
  if (rng.bool(0.5) && stories >= 8) {
    const mf = firstBrick + Math.floor((stories - capStories - firstBrick) / 2);
    FP(floorY(mf) - 0.14, 'string', trimMat, cornTint);
  }
  if (variant === 'quoin') {
    for (let f = firstBrick; f < stories; f++) FP(floorY(f) + sillH + winH + 0.01, 'lintelBand', trimMat, cornTint);
    if (!commercial) FP(gSillY + gWinH + 0.01, 'lintelBand', baseMat, baseTint, W + 0.1, true);
  }
  // intermediate cornice under the cap
  FP(capBase - 0.28, 'entab', trimMat, cornTint);
  {
    const bid = pBracket(B, false);
    const n = Math.max(4, Math.round(W / 1.35));
    for (let i = 0; i <= n; i++) B.addInstance(bid, at(F, -W / 2 + (W / n) * i, capBase - 0.12, 0.06), cornTint);
    const did = pDentils(B);
    const m = Math.max(1, Math.round(W / 2.0));
    for (let i = 0; i < m; i++) {
      const seg = W / m;
      B.addInstance(did, new THREE.Matrix4().multiplyMatrices(
        at(F, -W / 2 + seg * (i + 0.5), capBase + 0.02, 0.20),
        new THREE.Matrix4().makeScale(seg / 2.0, 0.8, 0.8),
      ), cornTint);
    }
  }

  // =========================================================================
  // PIER ENRICHMENT
  // =========================================================================
  if (variant === 'quoin') {
    const qw = 0.56;
    for (let f = firstBrick; f < stories; f++) {
      const qid = pQuoin(B, floorH - 0.08, qw, trimMat);
      for (const px of pierXs) B.addInstance(qid, at(F, px, floorY(f) + 0.06, 0.0), cornTint);
      for (const s of [-1, 1]) B.addInstance(qid, at(F, s * (W / 2 - qw / 2 - 0.04), floorY(f) + 0.06, 0.0), cornTint);
    }
  } else if (rng.bool(0.45)) {
    const qw = 0.62;
    for (let f = firstBrick; f < stories; f++) {
      const qid = pQuoin(B, floorH - 0.08, qw, trimMat);
      for (const s of [-1, 1]) B.addInstance(qid, at(F, s * (W / 2 - qw / 2 - 0.03), floorY(f) + 0.06, 0.0), cornTint);
    }
  }
  if (baseStyle !== 'plinth' && rng.bool(0.6)) {
    const qid = pQuoin(B, Math.min(groundH - 0.35, 3.9), 0.5, baseMat);
    for (const px of pierXs) B.addInstance(qid, at(F, px, 0.24, 0.0), baseTint);
  }

  // =========================================================================
  // ENTRANCE
  // =========================================================================
  {
    const ex = eBay.x;
    const stoneE = baseStyle === 'plinth' ? trimMat : baseMat;
    const eTint = baseStyle === 'plinth' ? cornTint : baseTint;
    for (let s = 0; s < nSteps; s++) {
      const run = (nSteps - s) * 0.34;
      B.addMerged(stoneE, box(openW + 1.4 - s * 0.12, 0.17, run),
        at(F, ex, s * 0.16, run / 2 + 0.02), { tint: eTint, grime: 0.32 });
    }
    K.door({ w: doorW, h: doorTotal, transom: true }, at(F, ex, stepTop + 0.02, -0.05), {
      tint: new THREE.Color(rng.weighted([[0x2b2a28, 3], [0x33422f, 2], [0x3b2b22, 2], [0x5c4a2c, 2]])),
    });
    for (const s of [-1, 1]) {
      B.addMerged(stoneE, box(0.34, springY, 0.17), at(F, ex + s * (openW / 2 + 0.17), 0, 0.0), { tint: eTint, grime: 0.25 });
    }

    if (entStyle === 'arch') {
      B.addMerged(stoneE, compose(archRing(openW, archRise)), at(F, ex, springY - 0.04, 0.0), { tint: eTint });
      B.addMerged(stoneE, box(0.44, 0.72, 0.30), at(F, ex, springY - 0.04 + archRise - 0.10, 0.0), { tint: eTint });
      // glazed lunette behind the arch
      const lun = [];
      for (let k = 0; k < 3; k++) {
        const t = (k + 0.5) / 3;
        const lw = openW * Math.sqrt(Math.max(0.05, 1 - t * t)) * 0.94;
        lun.push({ geom: box(lw, archRise / 3 + 0.01, 0.05), x: 0, y: (archRise / 3) * k, z: 0.02 });
      }
      B.addMerged('glass', compose(lun), at(F, ex, springY - 0.02, 0.0));
      for (const s of [-1, 0.001, 1]) {
        B.addMerged(stoneE, box(0.07, archRise * 0.9, 0.09),
          at(F, ex + s * openW * 0.22, springY - 0.02, 0.03), { tint: eTint });
      }
    } else if (entStyle === 'columns') {
      const pw = 0.44, pj = 0.24;
      for (const s of [-1, 1]) {
        const px = ex + s * (openW / 2 + 0.20 + pw / 2);
        B.addMerged(stoneE, box(pw + 0.12, 0.36, pj + 0.08), at(F, px, stepTop, 0.0), { tint: eTint, grime: 0.28 });
        B.addMerged(stoneE, box(pw, springY - stepTop - 0.66, pj), at(F, px, stepTop + 0.36, 0.0), { tint: eTint });
        B.addMerged(stoneE, box(pw + 0.14, 0.30, pj + 0.10), at(F, px, springY - 0.30, 0.0), { tint: eTint });
      }
      const ew = openW + 2 * (0.20 + 0.44) + 0.3;
      B.addMerged(stoneE, box(ew - 0.16, 0.24, 0.32), at(F, ex, springY, 0.0), { tint: eTint });
      B.addMerged(stoneE, box(ew - 0.26, 0.36, 0.26), at(F, ex, springY + 0.24, 0.0), { tint: eTint });
      B.addMerged(stoneE, box(ew, 0.24, 0.52), at(F, ex, springY + 0.60, 0.0), { tint: eTint });
      for (const s of [-1, 1]) {
        B.addInstance(pBracket(B, false), at(F, ex + s * (ew / 2 - 0.42), springY + 0.28, 0.24), eTint);
      }
    } else {
      const ew = openW + 1.5;
      for (const s of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          B.addMerged(stoneE, box(0.22, springY + 0.34 - k * 0.26, 0.10 + k * 0.07),
            at(F, ex + s * (openW / 2 + 0.13 + k * 0.23), 0, 0.0), { tint: eTint, grime: 0.25 });
        }
      }
      B.addMerged(stoneE, box(ew, 0.46, 0.30), at(F, ex, springY + 0.34, 0.0), { tint: eTint });
      B.addMerged(stoneE, box(ew * 0.5, 0.44, 0.20), at(F, ex, springY + 0.80, 0.0), { tint: eTint });
      B.addInstance(pRosette(B, trimMat), at(F, ex, springY + 0.56, 0.16), cornTint);
    }

    // balustraded stone balcony at the 2nd-floor line
    if (hasBalcony) {
      const bw = q05(clamp(openW + 1.9, 2.4, eBay.w - 0.25));
      B.addMerged(stoneE, box(bw, 0.17, 0.66), at(F, ex, entCapY, 0.0), { tint: eTint });
      B.addInstance(pBalustrade(B, bw, stoneE), at(F, ex, entCapY + 0.17, 0.0), eTint);
      for (const s of [-1, 1]) {
        B.addInstance(pBracket(B, true), at(F, ex + s * (bw / 2 - 0.34), entCapY - 0.56, 0.06), eTint);
      }
    }

    if (rng.bool(0.6)) {
      const cy = q05(Math.max(springY + 0.2, 3.15));
      B.addInstance(pCanopy(B), at(F, ex, cy, 0.0));
      B.addInstance('prewar:canopy:glass', at(F, ex, cy, 0.0));
    }
    for (const s of [-1, 1]) B.addInstance(pLamp(B), at(F, ex + s * (openW / 2 + 0.66), stepTop + 1.9, 0.02));
    B.addInstance(pEntryClutter(B), at(F, ex + mir * (openW / 2 + 1.0), stepTop, 0.0));
  }

  // =========================================================================
  // FIRE ESCAPE — Harlem 6-story flats keep theirs; fireproof houses don't
  // =========================================================================
  if (fireEscape) {
    let bi = clamp(eIdx + (rng.bool() ? 1 : -1) * (1 + rng.int(0, 1)), 0, nBays - 1);
    if (bi === eIdx) bi = clamp(eIdx + 1, 0, nBays - 1);
    const fb = bays[bi];
    K.fireEscape({
      width: clamp(fb.span + 0.6, 2.4, 3.6), floors: stories - firstBrick,
      floorH, firstY: floorY(firstBrick) + sillH - 0.12,
    }, at(F, fb.x, 0, 0.02), {
      tint: new THREE.Color(rng.weighted([[0x1a1917, 4], [0x2a201b, 2], [0x8d8c88, 1]])),
    });
  }

  // =========================================================================
  // CORNICE / PARAPET
  // =========================================================================
  const corniceH = capStyle === 'cornice' ? (tall ? 1.30 : 1.00) : 0.54;
  const sideCornFrame = (y) => at(F, corner * (W / 2), y, -D / 2,
    (corner < 0 ? -Math.PI / 2 : Math.PI / 2) + Math.PI);
  if (capStyle === 'cornice') {
    const pname = tall ? 'cornice' : 'corniceLow';
    FP(wallTop - 0.02, pname, 'cornicePaint', cornTint, W + 0.24);
    const bid = pBracket(B, tall);
    const n = Math.max(4, Math.round(W / (tall ? 1.2 : 1.0)));
    for (let i = 0; i <= n; i++) {
      B.addInstance(bid, at(F, -W / 2 + (W / n) * i, wallTop + (tall ? 0.40 : 0.30), tall ? 0.30 : 0.24), cornTint);
    }
    const did = pDentils(B);
    const m = Math.max(1, Math.round(W / 2.0));
    for (let i = 0; i < m; i++) {
      const seg = W / m;
      B.addInstance(did, new THREE.Matrix4().multiplyMatrices(
        at(F, -W / 2 + seg * (i + 0.5), wallTop + (tall ? 0.22 : 0.16), tall ? 0.24 : 0.18),
        new THREE.Matrix4().makeScale(seg / 2.0, 1, 1),
      ), cornTint);
    }
    if (corner) B.addMerged('cornicePaint', profileAlongX(PROF[pname], D), sideCornFrame(wallTop - 0.02), { tint: cornTint });
  } else {
    FP(wallTop - 0.62, 'string', trimMat, cornTint);
    FP(wallTop - 0.02, 'corbel', brickMat, capTint.clone().multiplyScalar(0.94));
    if (rng.bool(0.35)) {
      const bid = pBracket(B, false);
      const n = Math.max(3, Math.round(W / 2.4));
      for (let i = 0; i <= n; i++) {
        if (rng.bool(0.45)) continue;
        B.addInstance(bid, at(F, -W / 2 + (W / n) * i, wallTop - 0.66, 0.05), cornTint);
      }
    }
    if (corner) B.addMerged(brickMat, profileAlongX(PROF.corbel, D), sideCornFrame(wallTop - 0.02), { tint: capTint });
  }

  // =========================================================================
  // SHELL / SIDE / REAR
  // =========================================================================
  const rearXs = [];
  {
    const n = clamp(Math.round(W / 4.2), 2, 5);
    for (let i = 0; i < n; i++) rearXs.push(-W / 2 + (W / (n + 1)) * (i + 1));
  }
  const rearRows = [];
  for (let f = 1; f < stories; f++) {
    const y = floorY(f) + sillH;
    rearRows.push({ y0: y, y1: y + 1.5, openings: rearXs.map((x) => ({ x, w: 0.9 })) });
  }
  let sideRows = { left: null, right: null };
  if (corner) {
    const sxs = [];
    const nS = clamp(Math.round(D / 3.4), 3, 6);
    for (let i = 0; i < nS; i++) sxs.push(-D / 2 + (D / (nS + 1)) * (i + 1));
    const sr = [{ y0: gSillY, y1: gSillY + gWinH, openings: sxs.map((x) => ({ x, w: 0.95 })) }];
    for (let f = 1; f < stories; f++) {
      const y = floorY(f) + sillH;
      sr.push({ y0: y, y1: y + winH, openings: sxs.map((x) => ({ x, w: 0.95 })) });
    }
    sideRows = corner < 0 ? { left: sr, right: null } : { left: null, right: sr };
    const sf = at(F, corner * (W / 2), 0, -D / 2, corner < 0 ? -Math.PI / 2 : Math.PI / 2);
    for (const x of sxs) {
      K.window({ w: 0.95, h: gWinH, style, recess: 0.15 }, at(sf, x, gSillY, 0), { tint: frameA, glassTint: glassFor() });
      K.sill(0.95, at(sf, x, gSillY, 0), { mat: baseMat });
    }
    for (let f = 1; f < stories; f++) {
      const y = floorY(f) + sillH;
      for (const x of sxs) {
        K.window({ w: 0.95, h: winH, style, recess: 0.15 }, at(sf, x, y, 0), {
          tint: frameA, glassTint: glassFor(), lit: rng.bool(0.18),
        });
        K.sill(0.95, at(sf, x, y, 0), { mat: trimMat });
      }
    }
    B.addMerged(trimMat, profileAlongX(PROF.belt, D), at(sf, 0, stoneTop - 0.10, 0, Math.PI), { tint: cornTint });
    B.addMerged(trimMat, profileAlongX(PROF.entab, D), at(sf, 0, capBase - 0.28, 0, Math.PI), { tint: cornTint });
  }
  shellWalls(ctx, F, {
    width: W, depth: D, height: wallTop, mat: sideMat, tint: brickTint,
    wallT: 0.32, rearRows, rearMat: 'prewar:brickYellow', sideRows,
  });
  for (let f = 1; f < stories; f++) {
    const y = floorY(f) + sillH;
    for (const x of rearXs) {
      K.window({ w: 0.9, h: 1.5, style: 'dh1', recess: 0.15 }, at(F, -x, y, -D, Math.PI), {
        tint: frameA, glassTint: glassFor(), lit: rng.bool(0.36),
      });
    }
  }

  // =========================================================================
  // ROOF
  // =========================================================================
  const parapetH = capStyle === 'cornice' ? 0.78 : 1.15;
  flatRoof(ctx, F, {
    width: W, depth: D, height: wallTop, parapet: parapetH,
    mat: brickMat, tint: capTint, roofMat: rng.pick(['roofSilver', 'roofBlack']),
    copingMat: rng.weighted([['prewar:tcCream', 3], ['limestone', 3], ['terracotta', 2]]),
    wallT: 0.3,
  });
  {
    const rT = wallTop;
    const h2 = (v) => Math.round(v * 2) / 2;
    const bx = rng.range(-W * 0.2, W * 0.2);
    K.bulkhead(at(F, bx, rT, -D * rng.range(0.4, 0.5)), {
      w: h2(rng.range(4.0, 5.4)), d: h2(rng.range(3.0, 3.8)), h: h2(rng.range(3.4, 4.6)),
      mat: 'stucco', tint: new THREE.Color(0.9, 0.88, 0.84),
    });
    K.bulkhead(at(F, bx + (rng.bool() ? 1 : -1) * rng.range(4.0, 6.0), rT, -D * rng.range(0.55, 0.72)), {
      w: h2(rng.range(2.6, 3.4)), d: h2(rng.range(2.4, 3.2)), h: h2(rng.range(2.4, 3.2)),
      mat: 'stucco', tint: new THREE.Color(0.86, 0.84, 0.8),
    });
    if (stories >= 6 && rng.bool(stories >= 7 ? 0.92 : 0.55)) {
      K.waterTower(at(F, rng.range(-W * 0.24, W * 0.24), rT, -D * rng.range(0.22, 0.42), rng.range(0, Math.PI)), {
        legH: rng.bool(0.5) ? 3.5 : 5, r: 2, hBody: 4.4,
        tint: new THREE.Color().setHSL(0.07, rng.range(0.18, 0.32), rng.range(0.26, 0.4)),
      });
    }
    if (rng.bool(0.8)) {
      K.chimney(at(F, rng.range(-W * 0.4, W * 0.4), rT - 0.3, -D * rng.range(0.6, 0.88)), {
        w: 0.9, h: h2(rng.range(1.8, 3.4)), mat: rng.pick(['brickRed', 'brickBrown']),
      });
    }
    for (let i = 0; i < rng.int(2, 4); i++) {
      K.vent(at(F, rng.range(-W * 0.42, W * 0.42), rT, -D * rng.range(0.2, 0.9)), {
        kind: rng.pick(['pipe', 'pipe', 'goose', 'whirly']),
      });
    }
    if (rng.bool(0.5)) K.hvac(at(F, rng.range(-W * 0.3, W * 0.3), rT, -D * rng.range(0.5, 0.8), rng.range(0, 1.2)));
    if (rng.bool(0.55)) K.antenna(at(F, rng.range(-W * 0.3, W * 0.3), rT, -D * rng.range(0.3, 0.6)));
    if (rng.bool(0.45)) {
      const did = pDish(B);
      for (let i = 0; i < rng.int(1, 3); i++) {
        B.addInstance(did, at(F, rng.range(-W * 0.4, W * 0.4), rT, -D * rng.range(0.15, 0.4), rng.range(-1, 1)));
      }
    }
    if (rng.bool(0.45)) {
      const rid = pPipeRail(B);
      const n = Math.max(2, Math.round(W / 2.0));
      for (let i = 0; i < n; i++) B.addInstance(rid, at(F, -W / 2 + (W / n) * (i + 0.5), rT, -D + 0.55));
    }
  }

  return { height: wallTop + Math.max(corniceH, parapetH) + 0.1 };
}
