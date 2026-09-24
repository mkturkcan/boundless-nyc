// ===========================================================================
// OLD-LAW / NEW-LAW TENEMENT WALK-UP  (LES · East Village · East Harlem ·
// south Williamsburg).  4–7 stories on a 25 ft (or merged) lot.
//
// Identity, per docs/typology/02-tenement.md:
//   · front-facade Z fire escape: open bar-grating floors, visible outriggers +
//     knee braces, 50° switchback stairs, STOWED 0.381 m drop ladder
//   · deep bracketed galvanized-iron cornice (0.46–0.62 m out, ~0.95 m tall),
//     recessed frieze between brackets, dentil bed, end returns at party walls
//   · near-uniform upper floor heights; only the ground floor differs
//   · projecting stone / pressed-metal / segmental-brick heads + sills, each
//     carrying a soot streak; rust wash under every fire-escape anchor
//   · retrofit clutter: AC in the raised lower sash, through-wall sleeves,
//     conduit, standpipe, satellite dish, roll-gate hood, bricked-up window
//   · roofline: party-wall step piers, chimney row, bulkhead, water tower
//
// IMPORTANT: geo.js `profileAlongX` rotates the extrusion so the profile's
// "out" axis lands on -Z (into the building).  Every moulding here is placed
// with ry = PI so it actually projects toward the street.
// ===========================================================================
import * as THREE from 'three';
import { at, punchedWall, shellWalls, flatRoof, roofGear, facadeTint } from './lib.js';
import {
  box, boxUV, quad, cylinder, cone, compose, profileAlongX,
  ensureColor, tmat, shadeYRange,
} from '../geo.js';

export const TYPE = 'tenement';

const PI = Math.PI;
const SW = 0.14;                     // sidewalk slab top
const NW = 1.00, NH = 1.75;          // nominal window size for unit parts
const REVEAL = 0.135;                // window reveal depth (doc: 0.10–0.20)
const TRIM = 'limestone';            // one trim part material; tint does the work

const q05 = (v) => Math.round(v * 20) / 20;
const C = (h) => new THREE.Color(h);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// matrix with scale — unit parts get stretched to the real opening size
const sm = (frame, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) =>
  frame.clone().multiply(tmat(x, y, z, ry, sx, sy, sz));

// ---------------------------------------------------------------------------
// MATERIALS (registered once, all prefixed `tenement:`)
// ---------------------------------------------------------------------------
function ensureMaterials(B) {
  const add = (name, opts) => {
    if (B.M.has(name)) return;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...opts });
    m.userData.tileMeters = 1;
    m.name = name;
    B.M.set(name, m);
  };
  // painted wrought/cast iron — far less mirror-like than shared `ironwork`
  add('tenement:iron', { color: 0xffffff, roughness: 0.66, metalness: 0.22, envMapIntensity: 0.7 });
  add('tenement:cornice', { color: 0xffffff, roughness: 0.54, metalness: 0.10, envMapIntensity: 0.72 });
  add('tenement:sash', { color: 0xffffff, roughness: 0.46, metalness: 0.03, envMapIntensity: 0.8 });
  add('tenement:glass', { color: 0xffffff, roughness: 0.17, metalness: 0.5, envMapIntensity: 1.0 });
  add('tenement:shade', { color: 0xffffff, roughness: 0.88, metalness: 0.0, envMapIntensity: 0.4 });
  add('tenement:void', { color: 0xffffff, roughness: 0.94, metalness: 0.0, envMapIntensity: 0.08 });
  add('tenement:steel', { color: 0xffffff, roughness: 0.5, metalness: 0.5, envMapIntensity: 0.85 });
}

// ===========================================================================
// PARTS
// ===========================================================================

// --- window sash: unit 1x1, instance-scaled to (openingW, openingH). Every
//     member is an axis-aligned box so non-uniform scale keeps normals exact.
function sashPart(B, style) {
  const id = `tenement:sash:${style}`;
  if (B.hasPart(id)) return id;
  const fw = style === 'v1' ? 0.062 : 0.036;   // real frame member width
  const items = [];
  const ux = (v) => v / NW, uy = (v) => v / NH;
  const bx = (w, h, d) => box(ux(w), uy(h), d);
  const meet = 0.50;
  // outer casing / brickmould, proud of the sash plane
  items.push({ geom: bx(NW + 0.06, 0.05, 0.055), x: 0, y: uy(NH - 0.05), z: 0.032 });
  items.push({ geom: bx(0.055, NH, 0.055), x: ux(-NW / 2 - 0.005), y: 0, z: 0.032 });
  items.push({ geom: bx(0.055, NH, 0.055), x: ux(NW / 2 + 0.005), y: 0, z: 0.032 });
  // sash frame
  items.push({ geom: bx(NW, fw, 0.05), x: 0, y: uy(NH - fw), z: 0 });
  items.push({ geom: bx(NW, fw * 1.4, 0.055), x: 0, y: 0, z: 0 });
  items.push({ geom: bx(fw, NH, 0.05), x: ux(-NW / 2 + fw / 2), y: 0, z: 0 });
  items.push({ geom: bx(fw, NH, 0.05), x: ux(NW / 2 - fw / 2), y: 0, z: 0 });
  // meeting rail — proud, catches a hard highlight line
  items.push({ geom: bx(NW - fw, fw * 1.3, 0.08), x: 0, y: uy(NH * meet), z: 0.014 });
  if (style === 'h2') {
    const mw = 0.026;
    items.push({ geom: bx(mw, NH * meet - fw * 1.4, 0.035), x: 0, y: uy(fw * 1.4), z: 0 });
    items.push({ geom: bx(mw, NH * (1 - meet) - fw * 2.3, 0.035), x: 0, y: uy(NH * meet + fw * 1.3), z: 0 });
  }
  B.definePart(id, compose(items), 'tenement:sash');
  return id;
}

function unitQuad(B, id, mat, opts = {}) {
  if (!B.hasPart(id)) B.definePart(id, quad(1, 1), mat, opts);
  return id;
}

// shade / curtain hanging DOWN from y=0 so instance sy = drop length
function shadePart(B) {
  const id = 'tenement:shade';
  if (!B.hasPart(id)) {
    const g = quad(1, 1);
    g.translate(0, -1, 0);
    B.definePart(id, g, 'tenement:shade', { castShadow: false });
  }
  return id;
}

// --- sill / heads: unit width in X (instance sx = opening width + overhang) --
function sillPart(B) {
  const id = 'tenement:sill';
  if (B.hasPart(id)) return id;
  const items = [
    { geom: box(1, 0.055, 0.16), x: 0, y: -0.055, z: 0.06 },
    { geom: box(0.985, 0.05, 0.125), x: 0, y: -0.105, z: 0.042 },
    { geom: box(0.94, 0.035, 0.07), x: 0, y: -0.14, z: 0.02 },
  ];
  const g = compose(items);
  boxUV(g, 1, 0.15, 0.16, 2);
  B.definePart(id, g, TRIM);
  return id;
}

function headPart(B, style) {
  const id = `tenement:head:${style}`;
  if (B.hasPart(id)) return id;
  let items;
  if (style === 'mold') {
    // projecting moulded lintel: fascia + cyma cap + end blocks (metal / stone)
    items = [
      { geom: box(0.96, 0.20, 0.095), x: 0, y: 0, z: 0.04 },
      { geom: box(1.0, 0.05, 0.16), x: 0, y: 0.20, z: 0.07 },
      { geom: box(1.04, 0.075, 0.215), x: 0, y: 0.25, z: 0.098 },
      { geom: box(1.0, 0.03, 0.17), x: 0, y: 0.325, z: 0.075 },
      { geom: box(0.075, 0.20, 0.15), x: -0.452, y: 0, z: 0.062 },
      { geom: box(0.075, 0.20, 0.15), x: 0.452, y: 0, z: 0.062 },
    ];
  } else if (style === 'ped') {
    items = [
      { geom: box(0.98, 0.225, 0.085), x: 0, y: 0, z: 0.038 },
      { geom: box(1.0, 0.05, 0.14), x: 0, y: 0.225, z: 0.062 },
      { geom: box(0.5, 0.115, 0.165), x: 0, y: 0.275, z: 0.075 },
      { geom: box(0.4, 0.05, 0.185), x: 0, y: 0.39, z: 0.085 },
    ];
  } else {
    // flat stone lintel w/ incised Neo-Grec panel
    items = [
      { geom: box(1.0, 0.26, 0.07), x: 0, y: 0, z: 0.03 },
      { geom: box(0.86, 0.12, 0.095), x: 0, y: 0.07, z: 0.042 },
    ];
  }
  const g = compose(items);
  boxUV(g, 1, 0.4, 0.2, 2);
  B.definePart(id, g, TRIM);
  return id;
}

// merged brick voussoir arch (material follows the building's brick)
function brickArch(span, kind) {
  const rise = kind === 'round' ? span * 0.5 : span * 0.15;
  const n = kind === 'round' ? 9 : 7;
  const R = (rise * rise + (span / 2) * (span / 2)) / (2 * rise);
  const half = Math.asin(clamp((span / 2) / R, -1, 1));
  const ring = kind === 'round' ? 0.19 : 0.155;
  const items = [];
  for (let i = 0; i < n; i++) {
    const a = -half + (2 * half) * ((i + 0.5) / n);
    items.push({
      geom: box((2 * half * R) / n * 1.08, ring, 0.055), rz: a,
      x: R * Math.sin(a), y: R * Math.cos(a) - (R - rise) - ring / 2, z: 0.028,
    });
  }
  return compose(items);
}

// --- cornice ---------------------------------------------------------------
function mono(pts) {
  let y = -1e9;
  return pts.map(([x, yy]) => { y = Math.max(y, yy); return [x, y]; });
}

function cornicePts(proj, total) {
  const bed = total * 0.24, frz = total * 0.40;
  const crn = total - bed - frz;
  return mono([
    [0, 0],
    [0.10, 0.035], [0.14, 0.095], [0.09, 0.14],           // bed-mould ogee
    [0.15, bed],
    [0.105, bed + 0.025],                                  // frieze (recessed)
    [0.105, bed + frz],
    [0.18, bed + frz + 0.025], [0.22, bed + frz + 0.075], [0.18, bed + frz + 0.115],
    [proj, bed + frz + 0.135],                             // corona soffit
    [proj, Math.min(bed + frz + 0.135 + crn * 0.45, total - 0.13)],
    [proj * 0.86, total - 0.085],                          // cyma recta
    [proj * 0.60, total - 0.025],
    [proj * 0.40, total],
    [0, total],
  ]);
}

function bracketPart(B, style) {
  const id = `tenement:brk:${style}`;
  if (B.hasPart(id)) return id;
  const items = [];
  if (style === 'b') {
    items.push({ geom: box(0.165, 0.55, 0.115), x: 0, y: 0, z: 0.055 });
    items.push({ geom: box(0.18, 0.115, 0.47), x: 0, y: 0.435, z: 0.235 });
    items.push({ geom: box(0.165, 0.15, 0.34), x: 0, y: 0.285, z: 0.17 });
    items.push({ geom: box(0.15, 0.14, 0.225), x: 0, y: 0.145, z: 0.112 });
    items.push({ geom: box(0.125, 0.09, 0.125), x: 0, y: 0.03, z: 0.062 });
    const boss = cylinder(0.058, 0.058, 0.185, 10);
    boss.rotateZ(PI / 2);
    items.push({ geom: boss, x: -0.09, y: 0.395, z: 0.40 });
  } else {
    items.push({ geom: box(0.135, 0.55, 0.10), x: 0, y: 0, z: 0.05 });
    items.push({ geom: box(0.155, 0.10, 0.42), x: 0, y: 0.45, z: 0.21 });
    items.push({ geom: box(0.14, 0.16, 0.30), x: 0, y: 0.29, z: 0.15 });
    items.push({ geom: box(0.13, 0.14, 0.19), x: 0, y: 0.15, z: 0.095 });
    items.push({ geom: box(0.10, 0.10, 0.105), x: 0, y: 0.03, z: 0.052 });
  }
  B.definePart(id, compose(items), 'tenement:cornice');
  return id;
}

function dentilPart(B) {
  const id = 'tenement:dentil';
  if (!B.hasPart(id)) B.definePart(id, box(0.085, 0.085, 0.085), 'tenement:cornice');
  return id;
}

// --- fire escape ----------------------------------------------------------
const FE_DEEP = 1.05;                 // clear projection (code min 0.91)

function fePlatform(B, w) {
  const id = `tenement:fe:plat:${w}`;
  if (B.hasPart(id)) return id;
  const d = FE_DEEP;
  const items = [];
  const rh = 0.95;
  // bar-grating floor: individual flat bars, daylight passes between them
  const pitch = 0.062, barW = 0.033, barH = 0.026;
  for (let z = 0.055; z <= d - 0.05 + 1e-6; z += pitch) {
    items.push({ geom: box(w - 0.06, barH, barW), x: 0, y: -barH, z });
  }
  for (let x = -w / 2 + 0.22; x < w / 2 - 0.1; x += 0.36) {
    items.push({ geom: box(0.017, 0.013, d - 0.08), x, y: -barH - 0.012, z: d / 2 });
  }
  // perimeter angle frame
  items.push({ geom: box(w, 0.07, 0.05), x: 0, y: -0.072, z: d - 0.026 });
  items.push({ geom: box(w, 0.06, 0.045), x: 0, y: -0.066, z: 0.028 });
  items.push({ geom: box(0.048, 0.07, d), x: -w / 2 + 0.024, y: -0.072, z: d / 2 });
  items.push({ geom: box(0.048, 0.07, d), x: w / 2 - 0.024, y: -0.072, z: d / 2 });
  // outriggers: beam into the wall + knee brace + anchor plates
  const oxs = w > 2.7 ? [-w / 2 + 0.30, 0, w / 2 - 0.30] : [-w / 2 + 0.28, w / 2 - 0.28];
  const dz = d - 0.14, dy = 0.60, blen = Math.hypot(dz, dy);
  for (const ox of oxs) {
    items.push({ geom: box(0.05, 0.055, d + 0.04), x: ox, y: -0.128, z: d / 2 - 0.02 });
    items.push({
      geom: box(0.045, blen, 0.045), rx: PI / 2 - Math.atan2(dy, dz),
      x: ox, y: -0.128 - dy, z: 0.065,
    });
    items.push({ geom: box(0.14, 0.165, 0.03), x: ox, y: -0.80, z: 0.013 });
    items.push({ geom: box(0.12, 0.135, 0.03), x: ox, y: -0.14, z: 0.013 });
  }
  // railing: posts w/ spear finials, top + mid rail, pickets @0.125 o.c.
  const post = (x, z) => {
    items.push({ geom: box(0.034, rh, 0.034), x, y: 0, z });
    items.push({ geom: box(0.05, 0.045, 0.05), x, y: rh - 0.005, z });
    items.push({ geom: box(0.024, 0.10, 0.024), x, y: rh + 0.04, z });
  };
  post(-w / 2 + 0.032, d - 0.032); post(w / 2 - 0.032, d - 0.032);
  post(-w / 2 + 0.032, 0.05); post(w / 2 - 0.032, 0.05);
  const nMid = Math.max(0, Math.round(w / 1.25) - 1);
  for (let i = 1; i <= nMid; i++) post(-w / 2 + (w / (nMid + 1)) * i, d - 0.032);
  const rail = (len, x, y, z, ry) => {
    items.push({ geom: box(len, 0.042, 0.042), x, y, z, ry });
    items.push({ geom: box(len, 0.026, 0.026), x, y: y - rh * 0.47, z, ry });
  };
  rail(w, 0, rh - 0.045, d - 0.032, 0);
  rail(d, -w / 2 + 0.032, rh - 0.045, d / 2, PI / 2);
  rail(d, w / 2 - 0.032, rh - 0.045, d / 2, PI / 2);
  for (let x = -w / 2 + 0.115; x < w / 2 - 0.07; x += 0.125) {
    items.push({ geom: box(0.017, rh - 0.05, 0.017), x, y: 0, z: d - 0.032 });
  }
  for (let z = 0.16; z < d - 0.10; z += 0.125) {
    items.push({ geom: box(0.017, rh - 0.05, 0.017), x: -w / 2 + 0.032, y: 0, z });
    items.push({ geom: box(0.017, rh - 0.05, 0.017), x: w / 2 - 0.032, y: 0, z });
  }
  B.definePart(id, compose(items), 'tenement:iron');
  return id;
}

// Stair run: descends +X while dropping 2.90 m (instance sy = floorH/2.90).
// Geometry is mirror-symmetric about z = 0.52, so the alternate direction is
// simply ry = PI placed at z = 1.04.
const FE_RUN = 2.32, FE_RISE = 2.90;
function feStairPart(B) {
  const id = 'tenement:fe:stair';
  if (B.hasPart(id)) return id;
  const steps = 13;
  const ang = Math.atan2(FE_RISE, FE_RUN);
  const L = Math.hypot(FE_RISE, FE_RUN);
  const zA = 0.24, zB = 0.80, zC = (zA + zB) / 2;
  const items = [];
  for (const z of [zA, zB]) {
    items.push({ geom: box(L, 0.055, 0.18), rz: -ang, x: FE_RUN / 2, y: -FE_RISE / 2 - 0.10, z });
    items.push({ geom: box(L * 0.98, 0.04, 0.04), rz: -ang, x: FE_RUN / 2, y: -FE_RISE / 2 + 0.86, z });
    items.push({ geom: box(L * 0.98, 0.026, 0.026), rz: -ang, x: FE_RUN / 2, y: -FE_RISE / 2 + 0.44, z });
  }
  for (let s = 0; s < steps; s++) {
    const t = (s + 0.5) / steps;
    const x = FE_RUN * t, y = -FE_RISE * t;
    items.push({ geom: box(0.082, 0.024, zB - zA + 0.05), x: x - 0.05, y, z: zC });
    items.push({ geom: box(0.082, 0.024, zB - zA + 0.05), x: x + 0.05, y, z: zC });
  }
  for (let s = 0; s <= steps; s += 2) {
    const t = s / steps;
    for (const z of [zA, zB]) {
      items.push({ geom: box(0.018, 0.88, 0.018), x: FE_RUN * t, y: -FE_RISE * t, z });
    }
  }
  B.definePart(id, compose(items), 'tenement:iron');
  return id;
}

function feLadderPart(B) {
  const id = 'tenement:fe:ladder';
  if (B.hasPart(id)) return id;
  const lw = 0.381, lh = 2.45;
  const items = [
    { geom: box(0.036, lh, 0.036), x: -lw / 2, y: 0, z: 0 },
    { geom: box(0.036, lh, 0.036), x: lw / 2, y: 0, z: 0 },
    { geom: box(0.05, lh + 0.60, 0.075), x: -lw / 2 - 0.05, y: 0.05, z: 0 },
    { geom: box(0.05, lh + 0.60, 0.075), x: lw / 2 + 0.05, y: 0.05, z: 0 },
    { geom: cylinder(0.07, 0.07, 0.28, 10), x: lw / 2 + 0.17, y: lh * 0.5, z: 0 },
  ];
  for (let r = 0; r < 8; r++) items.push({ geom: box(lw, 0.022, 0.022), x: 0, y: 0.16 + r * 0.30, z: 0 });
  B.definePart(id, compose(items), 'tenement:iron');
  return id;
}

function feGoosePart(B) {
  const id = 'tenement:fe:goose';
  if (B.hasPart(id)) return id;
  const lw = 0.381, lh = 2.40, R = 0.46;
  const items = [];
  for (const s of [-1, 1]) {
    items.push({ geom: box(0.032, lh, 0.032), x: s * lw / 2, y: 0, z: 0 });
    for (let i = 0; i < 5; i++) {
      const a = ((i + 0.5) / 5) * (PI / 2);
      items.push({
        geom: box(0.032, 0.30, 0.032), rx: -a,
        x: s * lw / 2, y: lh + Math.sin(a) * R - 0.06, z: Math.cos(a) * R - R,
      });
    }
  }
  for (let r = 0; r < 7; r++) items.push({ geom: box(lw, 0.022, 0.022), x: 0, y: 0.2 + r * 0.32, z: 0 });
  B.definePart(id, compose(items), 'tenement:iron');
  return id;
}

// --- retrofits / street ---------------------------------------------------
function acPart(B) {
  const id = 'tenement:ac';
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: box(0.66, 0.40, 0.60), x: 0, y: 0.015, z: 0.02 });
  const grille = box(0.60, 0.30, 0.02);
  ensureColor(grille, new THREE.Color(0.42, 0.43, 0.44));
  items.push({ geom: grille, x: 0, y: 0.06, z: 0.325 });
  items.push({ geom: box(0.69, 0.035, 0.05), x: 0, y: -0.03, z: 0.30 });
  const g = compose(items);
  g.rotateX(-0.045);
  B.definePart(id, g, 'tenement:steel');
  return id;
}

function acSleevePart(B) {
  const id = 'tenement:acsleeve';
  if (B.hasPart(id)) return id;
  const items = [{ geom: box(0.68, 0.44, 0.115), x: 0, y: 0, z: 0.03 }];
  const gr = box(0.60, 0.34, 0.02);
  ensureColor(gr, new THREE.Color(0.36, 0.37, 0.38));
  items.push({ geom: gr, x: 0, y: 0.05, z: 0.14 });
  B.definePart(id, compose(items), 'tenement:steel');
  return id;
}

function dishPart(B) {
  const id = 'tenement:dish';
  if (B.hasPart(id)) return id;
  const d = cone(0.27, 0.11, 14);
  d.rotateX(-PI / 2 + 0.5);
  const items = [
    { geom: d, x: 0, y: 0.34, z: 0.20 },
    { geom: box(0.05, 0.05, 0.24), x: 0, y: 0.30, z: 0.08 },
    { geom: box(0.07, 0.36, 0.07), x: 0, y: 0, z: 0.04 },
    { geom: cylinder(0.028, 0.028, 0.20, 8), x: 0, y: 0.22, z: 0.33 },
  ];
  B.definePart(id, compose(items), 'tenement:steel');
  return id;
}

function cellarDoorPart(B) {
  const id = 'tenement:cellardoor';
  if (B.hasPart(id)) return id;
  const items = [
    { geom: box(1.55, 0.045, 1.20), x: 0, y: 0, z: 0 },
    { geom: box(1.64, 0.03, 1.29), x: 0, y: 0, z: 0 },
    { geom: box(0.035, 0.058, 1.16), x: 0, y: 0, z: 0 },
    { geom: box(0.13, 0.058, 0.13), x: -0.48, y: 0, z: 0.40 },
    { geom: box(0.13, 0.058, 0.13), x: 0.48, y: 0, z: -0.40 },
  ];
  B.definePart(id, compose(items), 'tenement:steel');
  return id;
}

function standpipePart(B) {
  const id = 'tenement:standpipe';
  if (B.hasPart(id)) return id;
  const items = [{ geom: box(0.13, 0.60, 0.13), x: 0, y: 0, z: 0.075 }];
  for (const s of [-1, 1]) {
    const c = cylinder(0.072, 0.082, 0.20, 10);
    c.rotateX(PI / 2);
    items.push({ geom: c, x: s * 0.115, y: 0.58, z: 0.13 });
    items.push({ geom: box(0.05, 0.05, 0.13), x: s * 0.185, y: 0.58, z: 0.17 });
  }
  items.push({ geom: box(0.30, 0.10, 0.11), x: 0, y: 0.46, z: 0.09 });
  B.definePart(id, compose(items), 'tenement:steel');
  return id;
}

// window / basement security bars — unit box, scaled in X and Y
function barGrillePart(B) {
  const id = 'tenement:bargrille';
  if (B.hasPart(id)) return id;
  const items = [
    { geom: box(1.0, 0.03, 0.03), x: 0, y: 0, z: 0 },
    { geom: box(1.0, 0.03, 0.03), x: 0, y: 0.97, z: 0 },
  ];
  for (let i = 0; i <= 7; i++) items.push({ geom: box(0.024, 1.0, 0.024), x: -0.5 + i / 7, y: 0, z: 0 });
  for (const t of [0.33, 0.66]) items.push({ geom: box(1.0, 0.024, 0.024), x: 0, y: t, z: 0 });
  B.definePart(id, compose(items), 'tenement:iron');
  return id;
}

// short stoop-ette (nominal 0.55 m rise, instance sy = raise/0.55) + pipe rail
const STOOP_H = 0.55, STOOP_RUN = 0.90;
function stoopPart(B) {
  const id = 'tenement:stoop';
  if (!B.hasPart(id)) {
    const items = [];
    const steps = 3, sh = STOOP_H / steps;
    for (let s = 0; s < steps; s++) {
      const d = STOOP_RUN - s * 0.30;
      const g = box(1.66, sh + 0.02, d);
      boxUV(g, 1.66, sh, d, 2);
      items.push({ geom: g, x: 0, y: s * sh, z: d / 2 });
    }
    B.definePart(id, compose(items), TRIM);
  }
  const rid = 'tenement:stooprail';
  if (!B.hasPart(rid)) {
    const ang = Math.atan2(STOOP_H, STOOP_RUN);
    const L = Math.hypot(STOOP_H, STOOP_RUN);
    const r = [
      { geom: box(L, 0.04, 0.04), rz: -ang, x: STOOP_RUN / 2, y: STOOP_H / 2 + 0.88, z: 0 },
      { geom: box(0.045, STOOP_H + 0.92, 0.045), x: 0.02, y: 0, z: 0 },
      { geom: box(0.045, 0.94, 0.045), x: STOOP_RUN, y: 0, z: 0 },
    ];
    const n = 4;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      r.push({ geom: box(0.019, 0.90, 0.019), x: STOOP_RUN * t, y: STOOP_H * (1 - t), z: 0 });
    }
    B.definePart(rid, compose(r), 'tenement:iron');
  }
  return { id, rid };
}

// ---------------------------------------------------------------------------
// merged stain panel: thin proud slab of the wall material with a vertical
// tint ramp. Soot under sills/balconies, rust under FE anchors, efflorescence.
// ---------------------------------------------------------------------------
function stain(B, frame, mat, { x, y0, y1, w, tint, topDark = true, t = 0.012 }) {
  const h = y1 - y0;
  if (h <= 0.03 || w <= 0.03) return;
  const g = box(w, h, t, { segY: 3 });
  ensureColor(g);
  shadeYRange(g, 0, h, topDark ? 0.0 : 1.0, topDark ? 1.0 : 0.0);
  const col = g.attributes.color;
  for (let i = 0; i < col.count; i++) {
    const k = col.getX(i);
    col.setXYZ(i, 1 + (tint.r - 1) * k, 1 + (tint.g - 1) * k, 1 + (tint.b - 1) * k);
  }
  B.addMerged(mat, g, frame.clone().multiply(tmat(x, y0, t / 2)), { worldUV: true });
}

// ===========================================================================
// GENERATE
// ===========================================================================
export function generate(ctx, lot, rng) {
  const { kit: K, batcher: B } = ctx;
  ensureMaterials(B);

  const W = lot.width, D = lot.depth;
  const side = lot.mirror ? -1 : 1;
  const commercial = !!lot.commercial;
  const stories = lot.stories || rng.weighted([[5, 47], [6, 30], [7, 11], [4, 10]]);
  const newLaw = W >= 10.4;

  // ---- bay grid ------------------------------------------------------------
  let nBays = W <= 8.0
    ? rng.weighted([[3, 62], [4, 30], [2, 8]])
    : clamp(Math.round((W - 1.6) / 2.5) + 1, 3, 7);
  const endPier = W <= 8.0 ? 0.80 : 0.92;
  let spacing = (W - 2 * endPier) / Math.max(1, nBays - 1);
  while (spacing < 1.80 && nBays > 2) { nBays--; spacing = (W - 2 * endPier) / (nBays - 1); }
  const winW = q05(clamp(spacing * 0.42, 0.86, 1.06));
  const winH = q05(rng.range(1.62, 1.88));
  const sillAbove = rng.range(0.76, 0.88);
  const xs = [];
  for (let i = 0; i < nBays; i++) xs.push(-W / 2 + endPier + spacing * i);

  // ---- vertical proportions (upper floors uniform; only ground differs) ----
  const floorH = q05(rng.range(2.86, 3.02));
  const raise = commercial ? 0 : rng.pick([0.42, 0.55, 0.68]);
  const gWinH = rng.range(1.62, 1.78);
  const gWinY = raise + rng.range(0.78, 0.88);
  const gTop = gWinY + gWinH;
  const entryH = 2.62;
  const sfH = 2.95;                                   // shopfront glass top
  const groundH = commercial ? rng.range(4.06, 4.30) : gTop + rng.range(0.42, 0.62);
  const H = groundH + (stories - 1) * floorH;
  const cornH = rng.range(0.86, 1.06);
  const cornProj = rng.range(0.46, 0.62);
  const parapet = rng.range(0.5, 0.68);

  // ---- palette -------------------------------------------------------------
  const brickName = rng.weighted([
    ['brickRed', 44], ['brickTan', 18], ['brickOrange', 11], ['brickBrown', 8],
    ['brickPaintedCream', 9], ['brickPaintedRed', 5], ['brickPaintedGray', 5],
  ]);
  const isPainted = brickName.startsWith('brickPainted');
  const tint = facadeTint(rng);
  // one trim part material, six real tenement trim finishes via tint
  const trimTint = C(rng.weighted([
    [0xf2ece0, 22],   // clean limestone
    [0xd8d0be, 20],   // soiled limestone
    [0x9a7057, 16],   // brownstone
    [0xd08a62, 10],   // red terra cotta
    [0xf6efdc, 16],   // painted cream metal
    [0x4a4640, 16],   // painted dark metal / brownstone-black
  ])).multiplyScalar(rng.range(0.9, 1.08));
  const cornTint = C(rng.weighted([
    [0x2a2825, 24], [0x6b4034, 17], [0x8a8b86, 15], [0xc4b89e, 22],
    [0x33392f, 12], [0x5c564a, 10],
  ])).multiplyScalar(rng.range(0.92, 1.08));
  const feTint = C(rng.weighted([
    [0x1e1c1a, 36], [0x5a2e24, 22], [0x4a4a46, 14], [0x22321f, 12],
    [0x6b4028, 8], [0xc9c0a6, 8],
  ]));
  const rust = new THREE.Color(1.05, 0.62, 0.42);
  const sootC = (k) => new THREE.Color(0.40, 0.385, 0.375).lerp(C(0xffffff), k);

  // ---- sash generations (70% replacement; 45% of buildings mix) ------------
  const sashA = rng.weighted([['v1', 45], ['h1', 40], ['h2', 15]]);
  const mixSash = rng.bool(0.45);
  const sashB = mixSash ? rng.pick(['h1', 'v1', 'h2'].filter((s) => s !== sashA)) : sashA;
  const stFor = (s) => (s === 'v1' ? C(0xf0eee8) : rng.bool(0.26) ? C(0x2a2724) : C(0xe4e0d6));
  const sashTA = stFor(sashA), sashTB = stFor(sashB);

  // ---- window heads (LPC frequencies) -------------------------------------
  const headStyle = rng.weighted([['mold', 34], ['flat', 32], ['seg', 18], ['ped', 16]]);
  const pedFloor = headStyle === 'ped' ? Math.min(stories - 2, rng.int(2, 3)) : -1;
  const topSpecial = rng.bool(0.42);
  const topHead = rng.weighted([['round', 40], ['seg', 35], ['blind', 25]]);

  // ---- parts --------------------------------------------------------------
  const pSashA = sashPart(B, sashA), pSashB = sashPart(B, sashB);
  const pPane = unitQuad(B, 'tenement:pane', 'tenement:glass', { castShadow: false });
  const pBack = unitQuad(B, 'tenement:back', 'tenement:void', { castShadow: false });
  const pLit = unitQuad(B, 'tenement:lit', 'litWindow', { castShadow: false, receiveShadow: false, visible: false });
  const pShade = shadePart(B);
  const pSill = sillPart(B);
  const pHeadMain = headStyle === 'seg' ? null : headPart(B, headStyle === 'ped' ? 'flat' : headStyle);
  const pHeadPed = headStyle === 'ped' ? headPart(B, 'ped') : null;
  const pAC = acPart(B);
  const pGrille = barGrillePart(B);

  const glassBase = new THREE.Color().setHSL(rng.range(0.54, 0.60), rng.range(0.04, 0.14), 0.5);
  const shadeCols = [C(0xd8d2c4), C(0xb0a898), C(0x8a94a0), C(0xe8e2d2), C(0xc8bda8)];
  const litP = 0.42;

  function placeWindow(frame, x, y, w, h, opt = {}) {
    const two = opt.gen === 'b';
    const sashId = two ? pSashB : pSashA;
    const sashT = (two ? sashTB : sashTA).clone().multiplyScalar(rng.range(0.92, 1.05));
    const raised = opt.ac || rng.bool(0.09);            // lower sash pushed up
    const zR = -REVEAL;
    B.addInstance(pBack, sm(frame, x, y - 0.02, zR - 0.12, 0, w + 0.10, h + 0.06, 1),
      C(0x14120f).multiplyScalar(rng.range(0.75, 1.6)));
    const gl = glassBase.clone().multiplyScalar(rng.range(0.40, 1.55));
    gl.offsetHSL(rng.range(-0.035, 0.035), 0, 0);
    if (raised) {
      B.addInstance(pPane, sm(frame, x, y + h * 0.49, zR + 0.02, 0, w - 0.07, h * 0.49, 1), gl);
      B.addInstance(pPane, sm(frame, x, y + h * 0.40, zR + 0.06, 0, w - 0.09, h * 0.13, 1),
        gl.clone().multiplyScalar(0.75));
    } else {
      B.addInstance(pPane, sm(frame, x, y + 0.035, zR + 0.02, 0, w - 0.07, h - 0.075, 1), gl);
    }
    if (!opt.plain && rng.bool(0.55)) {
      B.addInstance(pShade, sm(frame, x, y + h - 0.05, zR - 0.04, 0, w - 0.10, h * rng.range(0.18, 0.72), 1),
        rng.pick(shadeCols).clone().multiplyScalar(rng.range(0.70, 1.06)));
    }
    B.addInstance(sashId, sm(frame, x, y, zR, 0, w, h, 1), sashT);
    if (rng.bool(litP)) {
      B.addInstance(pLit, sm(frame, x, y + 0.05, zR + 0.04, 0, w - 0.09, h - 0.10, 1), C(0xffc687));
    }
    if (opt.ac) {
      B.addInstance(pAC, sm(frame, x + rng.range(-0.04, 0.04), y + 0.015, -0.30),
        C(0xb8b6b0).multiplyScalar(rng.range(0.8, 1.0)));
    }
  }

  // =========================================================================
  // FACADE ROWS
  // =========================================================================
  const rows = [];
  const upperRows = [];
  for (let f = 1; f < stories; f++) {
    const isTop = f === stories - 1;
    const y = groundH + (f - 1) * floorH + sillAbove;
    const h = isTop && topSpecial && topHead !== 'blind' ? winH - 0.05 : winH;
    rows.push({ y0: y, y1: y + h, openings: xs.map((x) => ({ x, w: winW })) });
    upperRows.push({ y, h, f, isTop });
  }

  // --- ground floor ---------------------------------------------------------
  let entryX = 0, store = null;
  if (commercial) {
    const pier = 0.30;
    const hasEntry = W >= 7.0;
    const entryW = 1.25;
    let sX, sW;
    if (hasEntry) {
      entryX = side * (W / 2 - pier - entryW / 2);
      const inner = side * (W / 2 - pier - entryW - pier);
      const outer = -side * (W / 2 - pier);
      sX = (inner + outer) / 2; sW = Math.abs(inner - outer);
    } else { sX = 0; sW = W - 2 * pier; }
    store = { sX, sW, pier, hasEntry, entryW };
    const ops = [{ x: sX, w: sW, y0: 0.06, y1: sfH }];
    if (hasEntry) ops.push({ x: entryX, w: entryW + 0.18, y0: 0.06, y1: 0.06 + entryH });
    rows.push({ y0: 0.05, y1: Math.max(sfH, 0.06 + entryH) + 0.02, openings: ops });
  } else {
    const doorBay = rng.bool(0.28) ? Math.floor(nBays / 2) : (side > 0 ? nBays - 1 : 0);
    entryX = clamp(xs[doorBay], -W / 2 + 0.95, W / 2 - 0.95);
    const ops = [{ x: entryX, w: 1.44, y0: raise, y1: raise + entryH }];
    for (const x of xs) {
      if (Math.abs(x - entryX) < (winW + 1.44) / 2 + 0.18) continue;
      ops.push({ x, w: winW, y0: gWinY, y1: gWinY + gWinH });
    }
    rows.push({ y0: 0.04, y1: Math.max(raise + entryH, gTop) + 0.02, openings: ops });
    store = { ops };
  }

  punchedWall(ctx, lot.frame, {
    width: W, height: H, mat: brickName, tint, rows,
    grime: isPainted ? 0.15 : 0.24, aoTop: H,
  });

  // =========================================================================
  // FACADE DRESSING
  // =========================================================================
  // painted / stone base with a hard horizontal termination line
  const baseTreat = rng.weighted(commercial
    ? [['none', 46], ['paint', 26], ['stone', 28]]
    : [['paint', 40], ['stone', 30], ['none', 30]]);
  if (baseTreat !== 'none') {
    const bm = baseTreat === 'paint'
      ? rng.pick(['brickPaintedCream', 'brickPaintedGray', 'brickPaintedRed'])
      : rng.pick(['limestone', 'concrete', 'graniteBase']);
    const bt = baseTreat === 'paint'
      ? facadeTint(rng).multiplyScalar(rng.range(0.9, 1.08))
      : trimTint.clone().multiplyScalar(0.92);
    const baseRows = commercial
      ? [{
        y0: 0.05, y1: Math.max(sfH, 0.06 + entryH) + 0.02,
        openings: rows[rows.length - 1].openings.map((o) => ({
          x: o.x, w: o.w + 0.08, y0: o.y0 - 0.04, y1: o.y1 + 0.04,
        })),
      }]
      : [
        { y0: raise - 0.03, y1: gWinY - 0.06, openings: [{ x: entryX, w: 1.50 }] },
        {
          y0: gWinY - 0.05, y1: gTop + 0.06,
          openings: store.ops.map((o) => (Math.abs(o.x - entryX) < 0.05
            ? { x: entryX, w: 1.50 }
            : { x: o.x, w: winW + 0.08 })),
        },
      ];
    punchedWall(ctx, lot.frame, {
      width: W, height: commercial ? Math.max(sfH, 0.06 + entryH) + 0.32 : gTop + 0.16,
      depth: 0.055, mat: bm, tint: bt, rows: baseRows, zFace: 0.05, grime: 0.32,
    });
  }

  // quoins at the party edges (~28% of the stock)
  if (rng.bool(0.28)) {
    const qh = 0.40, qw = rng.range(0.34, 0.48);
    for (let y = groundH - 0.12; y < H - 0.25; y += qh * 2) {
      for (const s of [-1, 1]) {
        B.addMerged(brickName, box(qw, qh, 0.055),
          at(lot.frame, s * (W / 2 - qw / 2), y, 0.027),
          { tint: tint.clone().multiplyScalar(1.04) });
      }
    }
  }

  // beltcourses
  const bandPts = [[0, 0], [0.055, 0.02], [0.078, 0.06], [0.05, 0.09], [0.08, 0.135], [0.05, 0.165], [0, 0.185]];
  const band = (y, extra = 0.10) => {
    B.addMerged(TRIM, profileAlongX(bandPts, W + extra), at(lot.frame, 0, y, 0.0, PI), { tint: trimTint });
  };
  band(groundH - 0.26, 0.16);
  const nBelts = rng.weighted([[0, 28], [1, 40], [2, 24], [3, 8]]);
  for (let i = 0; i < nBelts; i++) {
    const f = 1 + Math.floor(((i + 1) / (nBelts + 1)) * (stories - 1));
    if (f >= stories - 1 || f < 1) continue;
    band(groundH + f * floorH - 0.32, 0.10);
  }
  // corbelled brick band under the top floor (Queen Anne dogtooth)
  if (rng.bool(0.30) && stories >= 5) {
    const dn = dentilPart(B);
    const yb = groundH + (stories - 2) * floorH - 0.30;
    const pitch = 0.28, n = Math.floor((W - 0.24) / pitch);
    for (let i = 0; i <= n; i++) {
      B.addInstance(dn, sm(lot.frame, -W / 2 + 0.12 + i * pitch, yb, 0.02, 0, 1.7, 2.1, 1.5),
        tint.clone().multiplyScalar(1.03));
    }
  }

  // patched brick + efflorescence in the lower wall
  if (!isPainted) {
    for (let i = 0; i < rng.int(3, 6); i++) {
      const pw = rng.range(0.5, 1.5), ph = rng.range(0.4, 1.1);
      const t = rng.bool(0.5)
        ? new THREE.Color(rng.range(1.03, 1.16), rng.range(0.94, 1.06), rng.range(0.86, 1.0))
        : new THREE.Color(rng.range(0.84, 0.94), rng.range(0.86, 0.95), rng.range(0.88, 0.98));
      B.addMerged(brickName, box(pw, ph, 0.01),
        at(lot.frame, rng.range(-W / 2 + pw / 2, W / 2 - pw / 2), rng.range(0.4, Math.min(6.5, H - 2)), 0.006),
        { tint: tint.clone().multiply(t) });
    }
    for (let i = 0; i < rng.int(2, 4); i++) {
      const y0 = rng.range(0.2, 1.6);
      stain(B, lot.frame, brickName, {
        x: rng.range(-W / 2 + 0.6, W / 2 - 0.6), y0, y1: y0 + rng.range(0.35, 0.9),
        w: rng.range(0.3, 0.8), tint: new THREE.Color(1.22, 1.19, 1.12), topDark: false,
      });
    }
  }

  // =========================================================================
  // UPPER WINDOWS + TRIM + STREAKS
  // =========================================================================
  const brickedIdx = rng.bool(0.5) ? rng.int(0, nBays * (stories - 1) - 1) : -1;
  const archCache = {};
  const archFor = (span, kind) => {
    const k = `${span.toFixed(2)}:${kind}`;
    if (!archCache[k]) archCache[k] = brickArch(span, kind);
    return archCache[k];
  };

  let wIdx = 0;
  for (const { y, h, f, isTop } of upperRows) {
    for (const x of xs) {
      const bricked = wIdx === brickedIdx;
      wIdx++;
      B.addInstance(pSill, sm(lot.frame, x, y, 0, 0, winW + 0.20, 1, 1), trimTint);
      // soot streak under every sill — the detail CG always omits
      stain(B, lot.frame, brickName, {
        x, y0: y - rng.range(0.30, 0.66), y1: y - 0.145,
        w: winW * rng.range(0.58, 0.84), tint: sootC(rng.range(0.25, 0.6)),
      });

      if (bricked) {
        B.addMerged(brickName, box(winW - 0.02, h - 0.02, 0.16),
          at(lot.frame, x, y + 0.01, -0.08),
          { tint: tint.clone().multiplyScalar(rng.range(0.88, 1.04)) });
      } else {
        const hasAC = rng.bool(0.13);
        placeWindow(lot.frame, x, y, winW, h, {
          gen: mixSash && rng.bool(0.4) ? 'b' : 'a', ac: hasAC,
        });
        if (hasAC) {
          stain(B, lot.frame, brickName, {
            x, y0: y - rng.range(0.55, 1.05), y1: y - 0.16, w: 0.22,
            tint: new THREE.Color(0.6, 0.6, 0.58),
          });
        }
        if (rng.bool(0.05)) {
          B.addInstance(pGrille, sm(lot.frame, x, y + 0.05, 0.05, 0, winW - 0.05, h * 0.5, 1), C(0x1e1c1a));
        }
      }

      // ---- head ----
      const hy = y + h + 0.02;
      const wantArch = isTop && topSpecial;
      if (wantArch && (topHead === 'round' || topHead === 'blind')) {
        B.addMerged(brickName, archFor(winW + 0.10, 'round'), at(lot.frame, x, hy, 0),
          { tint: tint.clone().multiplyScalar(1.05) });
        if (topHead === 'blind') {
          B.addMerged(brickName, box(winW * 0.86, winW * 0.34, 0.1),
            at(lot.frame, x, hy + 0.03, -0.05), { tint: tint.clone().multiplyScalar(0.92) });
        }
      } else if (headStyle === 'seg' || (wantArch && topHead === 'seg')) {
        B.addMerged(brickName, archFor(winW + 0.10, 'seg'), at(lot.frame, x, hy, 0),
          { tint: tint.clone().multiplyScalar(1.05) });
      } else {
        const hp = (f === pedFloor && pHeadPed) ? pHeadPed : pHeadMain;
        B.addInstance(hp, sm(lot.frame, x, hy, 0, 0, winW + 0.22, 1, 1), trimTint);
      }
    }
  }

  // through-wall AC / heating sleeves (a distinctive tenement retrofit)
  if (rng.bool(0.40)) {
    const sl = acSleevePart(B);
    const col = rng.int(0, nBays - 1);
    const off = rng.bool(0.5) ? winW / 2 + 0.44 : -winW / 2 - 0.44;
    for (let f = 1; f < stories; f++) {
      if (rng.bool(0.25)) continue;
      const y = groundH + (f - 1) * floorH + sillAbove - 0.68;
      const sx = clamp(xs[col] + off, -W / 2 + 0.5, W / 2 - 0.5);
      B.addInstance(sl, at(lot.frame, sx, y, 0), C(0x9a9892).multiplyScalar(rng.range(0.85, 1.05)));
      stain(B, lot.frame, brickName, { x: sx, y0: y - 0.55, y1: y - 0.02, w: 0.32, tint: sootC(0.5) });
    }
  }

  // exposed conduit run (30%)
  if (rng.bool(0.32)) {
    const cx = side * (W / 2 - rng.range(0.22, 0.42));
    const top = groundH + rng.range(0.6, Math.max(0.8, (stories - 2) * floorH));
    B.addMerged('tenement:steel', cylinder(0.028, 0.028, top - 0.3, 6),
      at(lot.frame, cx, 0.3, 0.045), { tint: C(0x8e9090) });
    const gh = cylinder(0.024, 0.024, Math.abs(cx) * 1.2, 6);
    gh.rotateZ(PI / 2);
    B.addMerged('tenement:steel', gh, at(lot.frame, cx * 0.42, groundH - 0.60, 0.045), { tint: C(0x8e9090) });
    B.addMerged('tenement:steel', box(0.24, 0.34, 0.13), at(lot.frame, cx, 1.55, 0.05), { tint: C(0x6e7274) });
  }

  // satellite dish (facade bracket or roof edge)
  if (rng.bool(0.40)) {
    const dp = dishPart(B);
    if (rng.bool(0.6)) {
      B.addInstance(dp, at(lot.frame, side * (W / 2 - 0.46),
        groundH + rng.int(1, Math.max(1, stories - 2)) * floorH + 1.35, 0.02,
        side > 0 ? -0.5 : 0.5), C(0xdedcd6));
    } else {
      B.addInstance(dp, at(lot.frame, rng.range(-W / 3, W / 3), H + parapet - 0.05, -0.85,
        rng.range(-0.6, 0.6)), C(0xdedcd6));
    }
  }

  // =========================================================================
  // GROUND FLOOR FITTINGS
  // =========================================================================
  if (commercial) {
    const { sX, sW, pier, hasEntry, entryW } = store;
    const piers = hasEntry
      ? [-side * (W / 2 - pier / 2), side * (W / 2 - pier - entryW - pier / 2), side * (W / 2 - pier / 2)]
      : [-(W / 2 - pier / 2), W / 2 - pier / 2];
    for (const px of piers) {
      B.addMerged('tenement:steel', box(pier, sfH + 0.18, 0.13),
        at(lot.frame, px, 0.02, 0.065), { tint: C(0x33322e) });
      B.addMerged('tenement:steel', box(pier + 0.09, 0.15, 0.18),
        at(lot.frame, px, sfH + 0.05, 0.09), { tint: C(0x3e3d38) });
    }
    B.addMerged('tenement:steel', box(W - 0.08, 0.30, 0.15),
      at(lot.frame, 0, sfH + 0.20, 0.075), { tint: C(0x2c2b28) });

    K.storefront({
      width: sW + 0.5, signIndex: rng.int(0, 31),
      awningIndex: rng.bool(0.30) ? rng.int(0, 7) : -1,
      gate: rng.bool(0.52) ? (rng.bool(0.45) ? 2 : 1) : 0,
      entrySide: side,
    }, at(lot.frame, sX, 0, 0));

    // roll-gate hood box — present even when the gate is up
    B.addMerged('tenement:steel', box(sW + 0.24, 0.38, 0.42),
      at(lot.frame, sX, sfH - 0.44, 0.15), { tint: C(0x6a6c68) });

    // storefront cornice over the sign band
    const scPts = [[0, 0], [0.09, 0.03], [0.13, 0.09], [0.09, 0.13], [0.27, 0.20], [0.27, 0.27], [0.14, 0.33], [0, 0.34]];
    B.addMerged('tenement:cornice', profileAlongX(scPts, W + 0.12),
      at(lot.frame, 0, 3.86, 0.0, PI), { tint: cornTint });

    if (hasEntry) {
      K.door({ w: entryW, h: entryH - 0.06, transom: true }, at(lot.frame, entryX, 0.06, 0), {
        tint: C(rng.weighted([[0x35422f, 2], [0x2f3438, 2], [0x4a3226, 2], [0x1e1c1a, 2], [0x60544a, 1]])),
      });
      B.addMerged(TRIM, box(entryW + 0.44, 0.22, 0.14),
        at(lot.frame, entryX, 0.06 + entryH, 0.07), { tint: trimTint });
    }
    // grime plume above a restaurant vent
    if (rng.bool(0.35)) {
      stain(B, lot.frame, brickName, {
        x: sX + rng.range(-sW / 3, sW / 3), y0: sfH + 0.5, y1: sfH + rng.range(2.0, 4.0),
        w: rng.range(0.5, 1.1), tint: new THREE.Color(0.6, 0.57, 0.54), topDark: false,
      });
    }
  } else {
    // basement vents: recessed dark panel + bars (applied, no wall row needed)
    for (const x of xs) {
      if (Math.abs(x - entryX) < 0.95) continue;
      const bw = winW * 0.80;
      B.addMerged('tenement:void', box(bw, 0.44, 0.13),
        at(lot.frame, x, 0.24, -0.07), { worldUV: false, tint: C(0x171512) });
      B.addInstance(pGrille, sm(lot.frame, x, 0.25, 0.02, 0, bw - 0.03, 0.42, 1), C(0x22201d));
      B.addMerged(TRIM, box(bw + 0.14, 0.07, 0.10),
        at(lot.frame, x, 0.68, 0.03), { tint: trimTint });
    }
    // ground-floor windows (tall but NOT a parlour: tenement floors read even)
    for (const op of store.ops) {
      if (Math.abs(op.x - entryX) < 0.05) continue;
      placeWindow(lot.frame, op.x, gWinY, winW, gWinH, { gen: 'a', ac: rng.bool(0.1) });
      B.addInstance(pSill, sm(lot.frame, op.x, gWinY, 0, 0, winW + 0.20, 1, 1), trimTint);
      if (pHeadMain) {
        B.addInstance(pHeadMain, sm(lot.frame, op.x, gWinY + gWinH + 0.02, 0, 0, winW + 0.22, 1, 1), trimTint);
      } else {
        B.addMerged(brickName, archFor(winW + 0.10, 'seg'),
          at(lot.frame, op.x, gWinY + gWinH + 0.02, 0), { tint: tint.clone().multiplyScalar(1.05) });
      }
      if (rng.bool(0.45)) {
        B.addInstance(pGrille, sm(lot.frame, op.x, gWinY + 0.05, 0.05, 0, winW - 0.05, gWinH * 0.55, 1), C(0x1e1c1a));
      }
      stain(B, lot.frame, brickName, {
        x: op.x, y0: gWinY - 0.52, y1: gWinY - 0.15, w: winW * 0.7, tint: sootC(0.4),
      });
    }
    // entry: stoop-ette + door + moulded hood on brackets
    const st = stoopPart(B);
    const ssy = raise / STOOP_H;
    B.addInstance(st.id, sm(lot.frame, entryX, 0.0, 0.02, 0, 1, ssy, 1), trimTint.clone().multiplyScalar(0.93));
    for (const s of [-1, 1]) {
      B.addInstance(st.rid, sm(lot.frame, entryX + s * 0.90, 0.02, 0.04, -PI / 2, 1, ssy, 1), C(0x1c1a18));
    }
    K.door({ w: 1.28, h: entryH - 0.08, transom: true }, at(lot.frame, entryX, raise + 0.02, 0), {
      tint: C(rng.weighted([[0x35422f, 2], [0x2f3438, 2], [0x4a3226, 3], [0x1e1c1a, 2], [0x60544a, 1]])),
    });
    {
      const hp = [[0, 0], [0.09, 0.03], [0.14, 0.09], [0.09, 0.13], [0.31, 0.19], [0.31, 0.26], [0.15, 0.31], [0, 0.32]];
      B.addMerged(TRIM, profileAlongX(hp, 2.05),
        at(lot.frame, entryX, raise + entryH + 0.02, 0.0, PI), { tint: trimTint });
      for (const s of [-1, 1]) {
        B.addMerged(TRIM, box(0.20, entryH + 0.02, 0.11),
          at(lot.frame, entryX + s * 0.84, raise, 0.055), { tint: trimTint });
      }
    }
    // ConEd cellar doors flat in the walk + trash cans at the building line
    B.addInstance(cellarDoorPart(B),
      at(lot.frame, -side * (W / 2 - rng.range(1.1, 2.1)), SW + 0.012, 1.30, rng.range(-0.05, 0.05)),
      C(0x5c5e5c));
    for (let i = 0; i < rng.int(1, 3); i++) {
      K.trashCan(at(lot.frame, entryX - side * (1.25 + i * 0.72), SW, 0.60 + rng.range(-0.08, 0.12)), {
        tint: C(rng.weighted([[0x24302a, 3], [0x2a2a2c, 3], [0x3a3630, 2]])),
      });
    }
  }

  // standpipe siamese (55%)
  if (rng.bool(0.55)) {
    B.addInstance(standpipePart(B),
      at(lot.frame, -side * (W / 2 - rng.range(0.55, 0.95)), SW, 0.0), C(0x8a6b3a));
  }

  // =========================================================================
  // FIRE ESCAPE (front facade, ~80% — the #1 tenement identifier)
  // =========================================================================
  if (stories >= 4 && rng.bool(0.82)) {
    const feFloors = stories - 1;                        // 2nd floor .. top
    const firstY = groundH + sillAbove - rng.range(0.16, 0.28);
    const wide = nBays >= 4 && rng.bool(0.5);
    const feW = wide ? (spacing + winW + 0.5 > 3.3 ? 3.6 : 3.0) : (spacing * 0.5 + winW + 0.6 > 2.75 ? 3.0 : 2.4);
    const plat = fePlatform(B, feW);
    const stair = feStairPart(B);
    const mode = newLaw && nBays >= 5
      ? rng.weighted([['double', 45], ['centered', 35], ['offset', 20]])
      : rng.weighted([['centered', 60], ['offset', 40]]);
    const mid = Math.floor(nBays / 2);
    const cxs = [];
    if (mode === 'double') {
      cxs.push((xs[0] + xs[1]) / 2, (xs[nBays - 1] + xs[nBays - 2]) / 2);
    } else if (mode === 'offset') {
      const b = rng.bool(0.5) ? Math.min(1, nBays - 1) : Math.max(0, nBays - 2);
      cxs.push(wide ? (xs[Math.max(0, b - 1)] + xs[b]) / 2 : xs[b]);
    } else {
      cxs.push(nBays % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2);
    }
    for (const fx0 of cxs) {
      const fx = clamp(fx0, -W / 2 + feW / 2 + 0.04, W / 2 - feW / 2 - 0.04);
      const flip0 = rng.bool(0.5) ? 1 : -1;
      const sameDir = rng.bool(0.38);
      for (let f = 0; f < feFloors; f++) {
        const y = firstY + f * floorH;
        const t = feTint.clone().multiplyScalar(rng.range(0.86, 1.12));
        if (rng.bool(0.3)) t.lerp(new THREE.Color(0.46, 0.25, 0.14), rng.range(0.08, 0.32));
        const sag = rng.bool(0.16) ? rng.range(-0.02, -0.005) : 0;
        B.addInstance(plat, at(lot.frame, fx, y + sag, 0.0), t);
        // soot wash under the balcony + rust runs below the anchors
        stain(B, lot.frame, brickName, {
          x: fx, y0: y - rng.range(0.5, 1.05), y1: y - 0.17, w: feW * 0.9, tint: sootC(0.42),
        });
        for (const ox of [-feW / 2 + 0.30, feW / 2 - 0.30]) {
          stain(B, lot.frame, brickName, {
            x: fx + ox, y0: y - 0.80 - rng.range(0.1, 0.55), y1: y - 0.74, w: 0.13, tint: rust,
          });
        }
        if (f > 0) {
          const dir = sameDir ? flip0 : (f % 2 === 0 ? flip0 : -flip0);
          const sy = floorH / FE_RISE;
          if (dir > 0) B.addInstance(stair, sm(lot.frame, fx - FE_RUN / 2, y, 0.0, 0, 1, sy, 1), t);
          else B.addInstance(stair, sm(lot.frame, fx + FE_RUN / 2, y, 1.04, PI, 1, sy, 1), t);
        }
        if (rng.bool(0.16)) {
          B.addMerged('paintFlat', box(rng.range(0.3, 0.5), rng.range(0.3, 0.55), rng.range(0.3, 0.45)),
            at(lot.frame, fx + rng.range(-feW / 3, feW / 3), y + 0.01, rng.range(0.25, FE_DEEP - 0.32)),
            { worldUV: false, tint: C(rng.pick([0x2e5b3a, 0x7a3a2a, 0x33415a, 0x6a6256])) });
        }
      }
      // stowed drop ladder: top level with the lowest balcony rail
      B.addInstance(feLadderPart(B),
        at(lot.frame, fx + rng.range(-0.25, 0.25), firstY - 1.50, FE_DEEP - 0.14), feTint);
      if (rng.bool(0.35)) {
        B.addInstance(feGoosePart(B),
          at(lot.frame, fx + rng.range(-0.3, 0.3), firstY + (feFloors - 1) * floorH, FE_DEEP - 0.30), feTint);
      }
    }
  }

  // =========================================================================
  // CORNICE
  // =========================================================================
  if (rng.bool(0.11)) {
    // stripped cornice: crude coping + a visible scar band
    B.addMerged('concrete', box(W + 0.12, 0.17, 0.34),
      at(lot.frame, 0, H - 0.02, -0.06), { tint: C(0xcdc8bd) });
    stain(B, lot.frame, brickName, {
      x: 0, y0: H - 0.66, y1: H - 0.14, w: W - 0.2,
      tint: new THREE.Color(1.14, 1.10, 1.02), topDark: false, t: 0.02,
    });
  } else {
    const cBase = H - 0.06;
    const bedH = cornH * 0.24, frzH = cornH * 0.40;
    const soffitY = cBase + bedH + frzH + 0.135;
    B.addMerged('tenement:cornice', profileAlongX(cornicePts(cornProj, cornH), W + 0.16),
      at(lot.frame, 0, cBase, 0.0, PI), { tint: cornTint });
    // brackets: 7–12 on a 25 ft facade, ending at the party walls (end returns)
    const brk = bracketPart(B, rng.bool(0.5) ? 'a' : 'b');
    const nB = Math.max(3, Math.round(W / rng.range(0.70, 1.00)));
    const brkY = cBase + bedH * 0.85;
    const bScale = (soffitY - brkY) / 0.55;
    const bZ = clamp(cornProj / 0.52, 0.8, 1.18);
    for (let i = 0; i <= nB; i++) {
      const bx = clamp(-W / 2 + (W / nB) * i, -W / 2 + 0.075, W / 2 - 0.075);
      const bt = cornTint.clone().multiplyScalar(rng.range(0.94, 1.06));
      if (rng.bool(0.22)) bt.lerp(new THREE.Color(0.44, 0.26, 0.16), rng.range(0.08, 0.3));
      B.addInstance(brk, sm(lot.frame, bx, brkY, 0.02, 0, 1, bScale, bZ), bt);
    }
    // rosette boss in alternating frieze panels
    if (rng.bool(0.5) && W / nB > 0.72) {
      const dn = dentilPart(B);
      for (let i = 0; i < nB; i += 2) {
        B.addInstance(dn, sm(lot.frame, -W / 2 + (W / nB) * (i + 0.5), cBase + bedH + frzH * 0.4, 0.10,
          0, 1.5, 1.5, 0.7), cornTint.clone().multiplyScalar(1.04));
      }
    }
    // dentil bed under the corona
    if (rng.bool(0.45)) {
      const dn = dentilPart(B);
      const pitch = rng.range(0.155, 0.20);
      const n = Math.floor((W - 0.16) / pitch);
      for (let i = 0; i <= n; i++) {
        B.addInstance(dn, sm(lot.frame, -W / 2 + 0.08 + i * pitch, soffitY - 0.095, 0.16, 0, 1, 1, 1.1),
          cornTint.clone().multiplyScalar(1.05));
      }
    }
    // rust bleed below the cornice
    for (let i = 0; i < rng.int(1, 3); i++) {
      const y1 = H - 0.2;
      stain(B, lot.frame, brickName, {
        x: rng.range(-W / 2 + 0.5, W / 2 - 0.5), y0: y1 - rng.range(0.5, 1.4), y1,
        w: rng.range(0.12, 0.30), tint: rust,
      });
    }
  }

  // =========================================================================
  // SHELL / REAR / EXPOSED SIDE
  // =========================================================================
  const rearRows = [];
  const rearXs = [];
  const nRear = clamp(Math.round(W / 2.6), 2, 4);
  for (let i = 0; i < nRear; i++) rearXs.push(-W / 2 + 1.0 + ((W - 2.0) / Math.max(1, nRear - 1)) * i);
  const rearFrame = lot.frame.clone().multiply(tmat(0, 0, -D, PI));
  for (let f = 1; f < stories; f++) {
    const y = groundH + (f - 1) * floorH + sillAbove;
    rearRows.push({ y0: y, y1: y + winH, openings: rearXs.map((x) => ({ x, w: winW })) });
    for (const x of rearXs) placeWindow(rearFrame, -x, y, winW, winH, { gen: 'a', plain: true });
  }

  const sideRows = { left: null, right: null };
  if (lot.corner) {
    const s = lot.corner > 0 ? 1 : -1;
    const nS = clamp(Math.round((D - 3) / 2.6), 3, 7);
    const sxs = [];
    for (let i = 0; i < nS; i++) sxs.push(-D / 2 + 1.6 + ((D - 3.2) / (nS - 1)) * i);
    const sr = [];
    for (let f = 1; f < stories; f++) {
      const y = groundH + (f - 1) * floorH + sillAbove;
      sr.push({ y0: y, y1: y + winH, openings: sxs.map((x) => ({ x, w: winW })) });
    }
    if (s > 0) sideRows.right = sr; else sideRows.left = sr;
    const sub = lot.frame.clone().multiply(tmat(s * (W / 2), 0, -D / 2, s < 0 ? -PI / 2 : PI / 2));
    for (let f = 1; f < stories; f++) {
      const y = groundH + (f - 1) * floorH + sillAbove;
      for (const x of sxs) {
        placeWindow(sub, x, y, winW, winH, { gen: 'a', plain: true });
        B.addInstance(pSill, sm(sub, x, y, 0, 0, winW + 0.2, 1, 1), trimTint);
        if (pHeadMain) B.addInstance(pHeadMain, sm(sub, x, y + winH + 0.02, 0, 0, winW + 0.22, 1, 1), trimTint);
      }
    }
    B.addMerged('tenement:cornice', profileAlongX(cornicePts(cornProj * 0.62, cornH * 0.72), D),
      sub.clone().multiply(tmat(0, H - 0.06, 0.0, PI)), { tint: cornTint });
  }

  shellWalls(ctx, lot.frame, { width: W, depth: D, height: H, mat: brickName, tint, rearRows, sideRows });
  flatRoof(ctx, lot.frame, {
    width: W, depth: D, height: H, parapet, mat: brickName, tint,
    roofMat: rng.weighted([['roofSilver', 5], ['roofBlack', 4]]),
  });

  // =========================================================================
  // ROOFLINE SILHOUETTE
  // =========================================================================
  const nStep = rng.weighted([[0, 24], [2, 44], [3, 20], [4, 12]]);
  if (nStep > 0) {
    const pw = rng.range(0.44, 0.62), ph = rng.range(0.32, 0.66);
    for (let i = 0; i < nStep; i++) {
      const px = nStep === 2
        ? (i === 0 ? -W / 2 + pw / 2 : W / 2 - pw / 2)
        : -W / 2 + pw / 2 + ((W - pw) / (nStep - 1)) * i;
      B.addMerged(brickName, box(pw, parapet + ph, 0.32),
        at(lot.frame, px, H, -0.17), { tint: tint.clone().multiplyScalar(0.98) });
      B.addMerged(TRIM, box(pw + 0.10, 0.09, 0.40),
        at(lot.frame, px, H + parapet + ph, -0.17), { tint: trimTint });
    }
  }
  // party-wall fire-wall ridge along the flanks
  for (const s of [-1, 1]) {
    B.addMerged(brickName, box(0.30, rng.range(0.22, 0.5), D - 0.7),
      at(lot.frame, s * (W / 2 - 0.16), H + parapet - 0.03, -D / 2), { tint });
  }

  roofGear(ctx, lot.frame, rng, {
    width: W, depth: D, height: H + 0.02,
    bulkhead: true, vents: rng.int(3, 6), chimney: false,
    antenna: rng.bool(0.25), hvacCount: rng.bool(0.22) ? 1 : 0,
    waterTower: rng.bool(stories >= 7 ? 0.80 : stories === 6 ? 0.65 : 0.15),
    mat: rng.pick(['stucco', 'brickRed', 'concrete']),
  });
  // chimney row on the party-wall lines
  for (let i = 0, nC = rng.int(2, 4); i < nC; i++) {
    const s = i % 2 === 0 ? -1 : 1;
    K.chimney(at(lot.frame, s * (W / 2 - rng.range(0.35, 0.6)), H + parapet - 0.55,
      -D * rng.range(0.25, 0.85)), {
      w: 0.6, h: rng.pick([1.1, 1.7]), mat: 'brickRed',
      tint: tint.clone().multiplyScalar(0.94),
    });
  }

  return { height: H + cornH };
}
