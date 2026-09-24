// ===========================================================================
// VICTORIAN — Brooklyn QUEEN ANNE / ROMANESQUE REVIVAL rowhouse, c.1885-1900.
// Stuyvesant Heights (Hancock / Macon / MacDonough / Decatur Sts), Crown
// Heights North (Dean St, Chappell row), Park Slope (8th Ave, Montgomery Pl).
//
// The flamboyant Brooklyn cousin of src/buildings/brownstone.js. What makes it
// read as a DIFFERENT building at 30 m:
//   * a FULL-HEIGHT projecting bay — 3-sided canted, 5-sided bowed or square —
//     running from the areaway to a heavy stone bay cap, often carrying a gable
//   * MIXED masonry on one facade: rock-faced brownstone/Euclid-stone base and
//     parlor, iron-spot or orange brick shaft, terracotta bands, smooth ashlar
//     piers and trim (rough-vs-smooth contrast is the Romanesque signature)
//   * ROMANESQUE round arches with real voussoir rings, imposts and colonettes
//   * a deep CARVED FOLIATE BAND under the bay + sunburst/paneled cornice frieze
//   * roofline drama: steep gables (triangular / curved / stepped) breaking the
//     parapet, fish-scale slate, iron cresting, finials, corbelled chimneys,
//     and a conical corner turret on corner lots
//   * high stoop w/ heavy newels, double doors, STAINED-GLASS transoms
// Refs: refs/boroughs/parkslope-8th-ave-row-01.jpg (gable + carved band + bow),
//       refs/boroughs/crownheights-dean-st-row-01.jpg (bow bay + fish scale),
//       refs/boroughs/bedstuy-macdonough-st-01.jpg (row rhythm, arched entries),
//       docs/typology/01-brownstone.md
//
// NOTE: no vehicles or pedestrians anywhere in this project, by owner decree.
// LOCAL SPACE: lot frame z=0 is the PROPERTY LINE. The facade sits AW behind
// it, so everything is built in sub-frame `F` (z=0 = facade plane, +z = street).
// ===========================================================================
import * as THREE from 'three';
import { at, punchedWall, shellWalls, flatRoof, roofGear } from './lib.js';
import {
  box, boxUV, quad, cylinder, cone, lathe, compose, profileAlongX,
  ensureColor, shadeYRange, tmat,
} from '../geo.js';
import { makeCanvas, brickTexture, stoneTexture } from '../textures.js';

export const TYPE = 'victorian';

const q05 = (v) => Math.round(v * 20) / 20;
const q25 = (v) => Math.round(v * 4) / 4;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// like `at`, but with per-instance scale (lets one part serve several sizes)
const atS = (fr, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) =>
  fr.clone().multiply(tmat(x, y, z, ry, sx, sy, sz));
const WALK_Y = 0.14;          // sidewalk top (matches city.js CURB_H)
const AREA_Y = 0.05;          // areaway paving top
const RISER = 0.178;          // 7 in — fixed so stoop rails cache by step count
const TREAD = 0.30;
const LAND_D = 0.98;
const CHEEK = 0.32;
const RECESS = 0.19;          // sash plane recess — Romanesque reveals are deep

// ---------------------------------------------------------------------------
// canvas textures (local — these looks do not exist in textures.js)
// ---------------------------------------------------------------------------
function mkTex(canvas, srgb, tileMeters) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.userData.tileMeters = tileMeters;
  return t;
}

function lcg(seed) {
  let s = (seed * 2654435761) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ROCK-FACED ASHLAR — quarry-split brownstone/Euclid stone. Big drafted-margin
// blocks with a chiselled pillow face. docs: #71503C, roughness 0.94.
function rockFaceTex({ hue = 15, sat = 24, light = 28, seed = 91 } = {}) {
  // 3 m tile / 9 courses = 0.333 m course height, so courses divide the tile
  // exactly and the vertical repeat cannot be read off the wall.
  const size = 1152, tileMeters = 3.0, px = size / tileMeters;
  const rnd = lcg(seed);
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const bm = makeCanvas(size, size), bx = bm.getContext('2d');
  ctx.fillStyle = `hsl(${hue},${sat}%,${light * 0.55}%)`; ctx.fillRect(0, 0, size, size);
  bx.fillStyle = '#2a2a2a'; bx.fillRect(0, 0, size, size);
  const ch = size / 10, j = 0.026 * px;
  for (let r = 0; r < 10; r++) {
    const y = r * ch;
    let x = -rnd() * 0.7 * px;
    while (x < size) {
      const bw = (0.46 + rnd() * 0.68) * px;
      const h0 = hue + (rnd() - 0.5) * 6, s0 = sat + (rnd() - 0.5) * 9;
      const l0 = light + (rnd() - 0.5) * 13;
      const X = x + j, Y = y + j, Wd = bw - j * 2, Hd = ch - j * 2;
      ctx.fillStyle = `hsl(${h0.toFixed(1)},${s0.toFixed(1)}%,${l0.toFixed(1)}%)`;
      ctx.fillRect(X, Y, Wd, Hd);
      bx.fillStyle = `hsl(0,0%,${(56 + rnd() * 12).toFixed(0)}%)`;
      bx.fillRect(X, Y, Wd, Hd);
      // chiselled facets — the rough quarry face
      for (let i = 0; i < 34; i++) {
        const fw = Wd * (0.09 + rnd() * 0.26), fh = Hd * (0.10 + rnd() * 0.30);
        const fx = X + rnd() * (Wd - fw), fy = Y + rnd() * (Hd - fh);
        const up = rnd() < 0.5;
        ctx.fillStyle = up
          ? `rgba(226,206,182,${(0.025 + rnd() * 0.055).toFixed(3)})`
          : `rgba(18,9,4,${(0.06 + rnd() * 0.15).toFixed(3)})`;
        ctx.fillRect(fx, fy, fw, fh);
        bx.fillStyle = up
          ? `rgba(255,255,255,${(0.09 + rnd() * 0.17).toFixed(3)})`
          : `rgba(0,0,0,${(0.09 + rnd() * 0.17).toFixed(3)})`;
        bx.fillRect(fx, fy, fw, fh);
      }
      // drafted margin: tooled flat border catching light on top, shade below
      ctx.fillStyle = 'rgba(232,214,190,0.11)'; ctx.fillRect(X, Y, Wd, 4);
      ctx.fillStyle = 'rgba(14,7,3,0.50)'; ctx.fillRect(X, Y + Hd - 6, Wd, 6);
      ctx.fillStyle = 'rgba(14,7,3,0.40)'; ctx.fillRect(X + Wd - 5, Y, 5, Hd);
      // deep raked joint all round the block
      ctx.fillStyle = 'rgba(10,5,2,0.55)';
      ctx.fillRect(x, y + ch - j * 1.2, bw, j * 1.2);
      ctx.fillRect(x + bw - j * 1.2, y, j * 1.2, ch);
      bx.fillStyle = 'rgba(255,255,255,0.26)'; bx.fillRect(X, Y, Wd, 4);
      bx.fillStyle = 'rgba(0,0,0,0.34)'; bx.fillRect(X, Y + Hd - 5, Wd, 5);
      x += bw;
    }
  }
  // 130 years of soot and rain: overall knock-down + blotchy staining
  ctx.fillStyle = 'rgba(38,28,20,0.20)'; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(26,20,14,${(0.04 + rnd() * 0.14).toFixed(3)})`;
    ctx.fillRect(rnd() * size, rnd() * size, 20 + rnd() * 150, 12 + rnd() * 95);
  }
  return { map: mkTex(c, true, tileMeters), bumpMap: mkTex(bm, false, tileMeters), tileMeters };
}

// CARVED FOLIATE PANEL — low-relief acanthus scrollwork with a central rosette,
// faked with offset light/dark copies. Park Slope 8th Ave band under the bay.
function carvedTex({ base = '#6d5947', seed = 92 } = {}) {
  const size = 512, tileMeters = 1.0;
  const rnd = lcg(seed);
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const bm = makeCanvas(size, size), bx = bm.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  bx.fillStyle = '#3c3c3c'; bx.fillRect(0, 0, size, size);
  const leaf = (cx, cy, rx, ry, rot) => {
    for (const [dx, dy, col, bcol] of [
      [3.5, 4.5, 'rgba(14,8,4,0.58)', 'rgba(0,0,0,0.55)'],
      [0, 0, 'rgba(140,118,94,0.28)', 'rgba(150,150,150,0.4)'],
      [-2.5, -3.0, 'rgba(214,196,168,0.20)', 'rgba(255,255,255,0.6)'],
    ]) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(cx + dx, cy + dy, rx, ry, rot, 0, 7); ctx.fill();
      bx.fillStyle = bcol;
      bx.beginPath(); bx.ellipse(cx + dx, cy + dy, rx, ry, rot, 0, 7); bx.fill();
    }
  };
  // symmetric scrolling stems sweeping out from the centre
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const cx = size / 2 + s * (0.08 + t * 0.44) * size;
      const cy = size * (0.5 + Math.sin(t * 3.1) * 0.20);
      leaf(cx, cy, size * (0.085 - t * 0.035), size * (0.042 + t * 0.012), s * (0.5 + t * 1.7));
      leaf(cx + s * size * 0.03, cy - size * 0.09, size * 0.05, size * 0.024, s * (2.2 - t));
      leaf(cx - s * size * 0.02, cy + size * 0.10, size * 0.045, size * 0.022, -s * (1.1 + t));
    }
  }
  // central rosette
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    leaf(size / 2 + Math.cos(a) * size * 0.075, size / 2 + Math.sin(a) * size * 0.075,
      size * 0.048, size * 0.022, a);
  }
  leaf(size / 2, size / 2, size * 0.05, size * 0.05, 0);
  // grime settling in the undercuts
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = `rgba(38,30,22,${(0.03 + rnd() * 0.07).toFixed(3)})`;
    ctx.fillRect(rnd() * size, rnd() * size, 4 + rnd() * 22, 3 + rnd() * 9);
  }
  return { map: mkTex(c, true, tileMeters), bumpMap: mkTex(bm, false, tileMeters), tileMeters };
}

// LEADED / STAINED GLASS — diamond quarries, coloured border, centre medallion.
function stainedTex({ seed = 93 } = {}) {
  const size = 256, tileMeters = 1.0;
  const rnd = lcg(seed);
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  // real leaded work is low-chroma: amber, olive, rose, pale blue
  const cols = ['#a8874e', '#c9a24e', '#7e8b5c', '#9aa7b0', '#b08a7a', '#cdc6b4', '#8d7f92'];
  ctx.fillStyle = '#cfc7ae'; ctx.fillRect(0, 0, size, size);
  const n = 5, cell = size / n;
  const diamond = (i, jj) => {
    const cx = i * cell + (jj % 2) * cell * 0.5, cy = jj * cell * 0.62;
    ctx.beginPath();
    ctx.moveTo(cx, cy - cell * 0.36); ctx.lineTo(cx + cell * 0.52, cy);
    ctx.lineTo(cx, cy + cell * 0.36); ctx.lineTo(cx - cell * 0.52, cy);
    ctx.closePath();
  };
  for (let i = -1; i <= n + 1; i++) {
    for (let jj = -1; jj <= n + 2; jj++) {
      ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
      ctx.globalAlpha = 0.62 + rnd() * 0.38;
      diamond(i, jj); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(26,22,18,0.9)'; ctx.lineWidth = 2.6;
      diamond(i, jj); ctx.stroke();
    }
  }
  ctx.fillStyle = '#8f5a4c';
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.17, 0, 7); ctx.fill();
  ctx.fillStyle = '#c9a24e';
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.095, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(26,22,18,0.95)'; ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.17, 0, 7); ctx.stroke();
  ctx.strokeStyle = '#6f7a84'; ctx.lineWidth = size * 0.055;
  ctx.strokeRect(size * 0.028, size * 0.028, size * 0.944, size * 0.944);
  ctx.strokeStyle = 'rgba(26,22,18,0.85)'; ctx.lineWidth = 2.4;
  ctx.strokeRect(size * 0.056, size * 0.056, size * 0.888, size * 0.888);
  return mkTex(c, true, tileMeters);
}

// FISH-SCALE SLATE SHINGLES — Queen Anne gables, bay roofs, turret cones.
function slateTex({ base = 74, seed = 94 } = {}) {
  const size = 512, tileMeters = 1.0, px = size / tileMeters;
  const rnd = lcg(seed);
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const bm = makeCanvas(size, size), bx = bm.getContext('2d');
  ctx.fillStyle = `hsl(${base},6%,20%)`; ctx.fillRect(0, 0, size, size);
  bx.fillStyle = '#404040'; bx.fillRect(0, 0, size, size);
  const sw = 0.155 * px, rowH = sw * 0.72;
  for (let r = -1; r * rowH < size + rowH; r++) {
    const y = r * rowH;
    const off = (r % 2) * sw * 0.5;
    for (let i = -1; i * sw < size + sw; i++) {
      const x = i * sw + off;
      const l = 26 + rnd() * 16;
      ctx.fillStyle = `hsl(${base + (rnd() - 0.5) * 22},${(5 + rnd() * 9).toFixed(0)}%,${l.toFixed(0)}%)`;
      ctx.beginPath();
      ctx.moveTo(x - sw * 0.47, y);
      ctx.lineTo(x - sw * 0.47, y + rowH * 0.72);
      ctx.arc(x, y + rowH * 0.72, sw * 0.47, Math.PI, 0, true);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2; ctx.stroke();
      bx.fillStyle = `hsl(0,0%,${(52 + rnd() * 22).toFixed(0)}%)`;
      bx.beginPath();
      bx.moveTo(x - sw * 0.47, y);
      bx.lineTo(x - sw * 0.47, y + rowH * 0.72);
      bx.arc(x, y + rowH * 0.72, sw * 0.47, Math.PI, 0, true);
      bx.closePath(); bx.fill();
      bx.strokeStyle = 'rgba(0,0,0,0.85)'; bx.lineWidth = 3; bx.stroke();
      // light catching the butt of each scale
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      ctx.fillRect(x - sw * 0.44, y + 1, sw * 0.88, 2.5);
    }
  }
  return { map: mkTex(c, true, tileMeters), bumpMap: mkTex(bm, false, tileMeters), tileMeters };
}

// ---------------------------------------------------------------------------
// private materials (registered once, type-prefixed)
// ---------------------------------------------------------------------------
function ensureMaterials(B) {
  const add = (name, opts, tileMeters) => {
    if (B.M.has(name)) return;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...opts });
    m.userData.tileMeters = tileMeters;
    m.name = name;
    B.M.set(name, m);
  };
  if (!B.M.has('victorian:rock')) {
    // weathered Brooklyn brownstone ~#6F5747, chroma stays LOW
    const t = rockFaceTex({ hue: 18, sat: 19, light: 22, seed: 91 });
    add('victorian:rock', {
      map: t.map, bumpMap: t.bumpMap, bumpScale: 2.6, roughness: 0.96, envMapIntensity: 0.34,
    }, t.tileMeters);
  }
  if (!B.M.has('victorian:rockBuff')) {
    // Euclid / buff sandstone ~#A2937A — Park Slope 8th Ave, Montgomery Place
    const t = rockFaceTex({ hue: 34, sat: 12, light: 31, seed: 96 });
    add('victorian:rockBuff', {
      map: t.map, bumpMap: t.bumpMap, bumpScale: 2.6, roughness: 0.94, envMapIntensity: 0.4,
    }, t.tileMeters);
  }
  if (!B.M.has('victorian:ironspot')) {
    // orange iron-spot brick ~#8E5240 with dark clinker specks; mortar #A89C8E
    const t = brickTexture({
      hue: 14, sat: 33, light: 28, dh: 6, ds: 12, dl: 9, mortar: '#8e857a',
      darkBrickChance: 0.13, darkBrickColor: 'hsl(16,18%,15%)', seed: 97,
    });
    add('victorian:ironspot', {
      map: t.map, bumpMap: t.bumpMap, bumpScale: 1.25, roughness: 0.9, envMapIntensity: 0.55,
    }, t.tileMeters);
  }
  if (!B.M.has('victorian:terra')) {
    const t = stoneTexture({ base: '#8d7360', blockW: 0.6, blockH: 0.3, jointDark: 0.2, weather: 0.16, seed: 98 });
    add('victorian:terra', { map: t.map, roughness: 0.76, envMapIntensity: 0.55 }, t.tileMeters);
  }
  if (!B.M.has('victorian:carved')) {
    const t = carvedTex({ seed: 92 });
    add('victorian:carved', {
      map: t.map, bumpMap: t.bumpMap, bumpScale: 1.6, roughness: 0.86, envMapIntensity: 0.55,
    }, t.tileMeters);
  }
  if (!B.M.has('victorian:slate')) {
    const t = slateTex({ base: 210, seed: 94 });
    add('victorian:slate', {
      map: t.map, bumpMap: t.bumpMap, bumpScale: 1.5, roughness: 0.78, metalness: 0.05, envMapIntensity: 0.6,
    }, t.tileMeters);
  }
  if (!B.M.has('victorian:stained')) {
    const map = stainedTex({ seed: 93 });
    add('victorian:stained', {
      map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.05,
      roughness: 0.28, metalness: 0.0, envMapIntensity: 0.5,
    }, 1);
  }
  if (!B.M.has('victorian:iron')) {
    add('victorian:iron', {
      color: 0x3a3835, roughness: 0.46, metalness: 0.18, envMapIntensity: 0.75,
    }, 1);
  }
}

// ---------------------------------------------------------------------------
// PARTS (instanced). All ids prefixed 'victorian:'.
// ---------------------------------------------------------------------------

// ROMANESQUE VOUSSOIR RING — semicircular arch of rock-faced wedges + keystone
// + impost blocks + a thin outer archivolt. Anchor: x centred on the opening,
// y = springing line, z = wall face.
function voussoirPart(B, w, mat) {
  w = q05(w);
  const id = `victorian:vous:${mat}:${w}`;
  if (B.hasPart(id)) return id;
  const Ri = w / 2, band = clamp(Ri * 0.40, 0.20, 0.30), dep = 0.17;
  const nA = Math.max(9, Math.round((Math.PI * Ri) / 0.24) | 1);
  const items = [];
  for (let i = 0; i < nA; i++) {
    const a = Math.PI * ((i + 0.5) / nA);
    const arc = (Math.PI * (Ri + band / 2)) / nA + 0.014;
    const key = Math.abs(a - Math.PI / 2) < Math.PI / (nA * 2) + 1e-4;
    const g = box(arc, band * (key ? 1.34 : 1), dep * (key ? 1.3 : 1));
    boxUV(g, arc, band, dep, 2);
    g.rotateZ(Math.PI / 2 - a);
    items.push({ geom: g, x: -Math.cos(a) * Ri, y: Math.sin(a) * Ri, z: dep * (key ? 0.65 : 0.5) });
    // outer archivolt ring — thinner, less proud
    const g2 = box(arc * 1.05, 0.075, dep * 0.55);
    boxUV(g2, arc, 0.075, dep * 0.55, 2);
    g2.rotateZ(Math.PI / 2 - a);
    items.push({ geom: g2, x: -Math.cos(a) * (Ri + band), y: Math.sin(a) * (Ri + band), z: dep * 0.275 });
  }
  // impost blocks at the springing
  for (const s of [-1, 1]) {
    const g = box(0.30, 0.15, dep + 0.06); boxUV(g, 0.30, 0.15, dep + 0.06, 2);
    items.push({ geom: g, x: s * (Ri + band * 0.4), y: -0.15, z: (dep + 0.06) / 2 });
    const g2 = box(0.22, 0.07, dep + 0.10); boxUV(g2, 0.22, 0.07, dep + 0.10, 2);
    items.push({ geom: g2, x: s * (Ri + band * 0.4), y: -0.06, z: (dep + 0.10) / 2 });
  }
  B.definePart(id, compose(items), mat);
  return id;
}

// Cornice console bracket — Queen Anne: scrolled, deep, with a leaf pendant.
function bracketPart(B) {
  const id = 'victorian:bracket';
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: box(0.135, 0.46, 0.36), x: 0, y: 0.07, z: 0.18 });
  items.push({ geom: box(0.185, 0.075, 0.44), x: 0, y: 0.50, z: 0.22 });
  items.push({ geom: box(0.165, 0.09, 0.19), x: 0, y: 0.0, z: 0.095 });
  const v = cylinder(0.062, 0.062, 0.15, 8); v.rotateZ(Math.PI / 2);
  items.push({ geom: v, x: 0, y: 0.20, z: 0.335 });
  const v2 = cylinder(0.042, 0.042, 0.15, 8); v2.rotateZ(Math.PI / 2);
  items.push({ geom: v2, x: 0, y: 0.075, z: 0.25 });
  for (let i = 0; i < 3; i++) {
    items.push({ geom: box(0.16, 0.055, 0.055), x: 0, y: 0.16 + i * 0.09, z: 0.365 - i * 0.02 });
  }
  B.definePart(id, compose(items), 'cornicePaint');
  return id;
}

// Dentil / modillion strip run under the cornice bed mould.
function dentilPart(B, len) {
  len = q25(len);
  const id = `victorian:dentil:${len}`;
  if (B.hasPart(id)) return id;
  const items = [];
  const n = Math.max(2, Math.round(len / 0.155));
  for (let i = 0; i < n; i++) {
    items.push({ geom: box(0.082, 0.10, 0.12), x: -len / 2 + (len / n) * (i + 0.5), y: 0, z: 0.06 });
  }
  items.push({ geom: box(len, 0.045, 0.15), x: 0, y: 0.10, z: 0.075 });
  B.definePart(id, compose(items), 'cornicePaint');
  return id;
}

// SUNBURST frieze panel (Queen Anne) — a fan of radial ribs in a sunk panel.
function sunburstPart(B) {
  const id = 'victorian:sunburst';
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: box(1.0, 0.5, 0.035), x: 0, y: 0, z: 0.0175 });
  items.push({ geom: box(0.86, 0.38, 0.02), x: 0, y: 0.06, z: 0.008 });
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.08 + 0.84 * (i / 8));
    const L = 0.30;
    const g = box(0.035, L, 0.045);
    g.rotateZ(Math.PI / 2 - a);
    items.push({ geom: g, x: 0, y: 0.075, z: 0.045 });
  }
  items.push({ geom: cylinder(0.055, 0.055, 0.05, 10), x: 0, y: 0.06, z: 0.05, rx: Math.PI / 2 });
  B.definePart(id, compose(items), 'cornicePaint');
  return id;
}

// Carved foliate panel — sunk field + proud boss, textured with victorian:carved.
function foliatePart(B, mat) {
  const id = `victorian:foliate:${mat}`;
  if (B.hasPart(id)) return id;
  const items = [];
  const g = box(1.0, 0.5, 0.06); boxUV(g, 1.0, 0.5, 0.06, 1.0);
  items.push({ geom: g, x: 0, y: 0, z: 0.03 });
  const f = box(0.90, 0.40, 0.135); boxUV(f, 0.90, 0.40, 0.135, 0.9);
  items.push({ geom: f, x: 0, y: 0.05, z: 0.0675 });
  for (const s of [-1, 1]) {
    items.push({ geom: box(0.05, 0.5, 0.15), x: s * 0.475, y: 0, z: 0.075 });
  }
  B.definePart(id, compose(items), mat);
  return id;
}

// Engaged colonette with cushion capital + moulded base (arched openings).
function colonettePart(B, mat) {
  const id = `victorian:colonette:${mat}`;
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: cylinder(0.062, 0.070, 1.0, 10), x: 0, y: 0.10, z: 0 });
  items.push({ geom: lathe([[0.075, 0], [0.105, 0.035], [0.09, 0.075], [0.072, 0.10]], 10), x: 0, y: 0, z: 0 });
  items.push({ geom: lathe([
    [0.062, 0], [0.075, 0.03], [0.115, 0.10], [0.128, 0.155], [0.115, 0.175],
  ], 10), x: 0, y: 1.10, z: 0 });
  items.push({ geom: box(0.27, 0.06, 0.27), x: 0, y: 1.275, z: 0 });
  B.definePart(id, compose(items), mat);
  return id;
}

// Heavy stone corbel carrying an oriel / bay over a storefront.
function corbelPart(B, mat) {
  const id = `victorian:corbel:${mat}`;
  if (B.hasPart(id)) return id;
  const items = [];
  for (let i = 0; i < 4; i++) {
    const w = 0.24 + i * 0.10, d = 0.16 + i * 0.15;
    const g = box(w, 0.16, d); boxUV(g, w, 0.16, d, 1.4);
    items.push({ geom: g, x: 0, y: i * 0.16, z: d / 2 });
  }
  const cap = box(0.68, 0.09, 0.78); boxUV(cap, 0.68, 0.09, 0.78, 1.4);
  items.push({ geom: cap, x: 0, y: 0.64, z: 0.39 });
  B.definePart(id, compose(items), mat);
  return id;
}

// Iron stoop railing (cached by riser count — RISER/TREAD/LAND_D are constants).
function stoopRailPart(B, steps, clearW) {
  const cw = q05(clearW);
  const id = `victorian:srail:${steps}:${cw}`;
  if (B.hasPart(id)) return id;
  const totalProj = LAND_D + (steps - 1) * TREAD;
  const landY = WALK_Y + steps * RISER;
  const reveal = 0.20, railH = 0.88;
  const items = [];
  for (const side of [-1, 1]) {
    const cx = side * (cw / 2 + CHEEK / 2);
    const zB = totalProj, zT = LAND_D;
    const yB = WALK_Y + RISER + reveal, yT = landY + reveal;
    const L = Math.hypot(zB - zT, yT - yB);
    const ang = Math.atan2(yT - yB, zB - zT);
    for (const [hy, sec] of [[railH, 0.052], [railH * 0.34, 0.026]]) {
      items.push({ geom: box(sec + 0.02, sec, L), x: cx, y: (yB + yT) / 2 + hy, z: (zB + zT) / 2, rx: ang });
    }
    const n = Math.max(4, Math.round(L / 0.125));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      items.push({ geom: box(0.02, railH, 0.02), x: cx, y: yB + (yT - yB) * t, z: zB + (zT - zB) * t });
    }
    // wrought scrollwork — Queen Anne rails run to curls, not cast panels
    const m = Math.max(2, Math.floor(n / 3));
    for (let i = 1; i <= m; i++) {
      const t = i / (m + 1);
      const z = zB + (zT - zB) * t, y = yB + (yT - yB) * t;
      const tor = new THREE.TorusGeometry(0.105, 0.012, 4, 9, Math.PI * 1.6);
      items.push({ geom: tor, x: cx, y: y + railH * 0.56, z, ry: Math.PI / 2, rz: t * 1.3 });
      const tor2 = new THREE.TorusGeometry(0.07, 0.011, 4, 8, Math.PI * 1.35);
      items.push({ geom: tor2, x: cx, y: y + railH * 0.26, z: z - 0.08, ry: Math.PI / 2, rz: -t * 1.6 });
    }
    items.push({ geom: box(0.072, 0.052, LAND_D), x: cx, y: yT + railH, z: LAND_D / 2 });
    const nn = Math.max(2, Math.round(LAND_D / 0.13));
    for (let i = 0; i <= nn; i++) {
      items.push({ geom: box(0.02, railH, 0.02), x: cx, y: yT, z: (LAND_D / nn) * i });
    }
  }
  B.definePart(id, compose(items), 'victorian:iron');
  return id;
}

// Massive stoop newel — carved block, moulded cap, ball/urn finial.
function newelPart(B, mat) {
  const id = `victorian:newel:${mat}`;
  if (B.hasPart(id)) return id;
  const items = [];
  const w = CHEEK + 0.18;
  const g = box(w, 0.98, w + 0.04); boxUV(g, w, 0.98, w + 0.04, 2);
  items.push({ geom: g, x: 0, y: 0, z: 0 });
  for (const [pw, ph, py] of [[w + 0.09, 0.075, 0.98], [w + 0.04, 0.06, 1.055], [w - 0.05, 0.10, 1.115]]) {
    const b = box(pw, ph, pw + 0.04); boxUV(b, pw, ph, pw + 0.04, 2);
    items.push({ geom: b, x: 0, y: py, z: 0 });
  }
  // sunk panel on each visible face
  for (const [dx, dz, ry] of [[0, (w + 0.04) / 2, 0], [-w / 2, 0, Math.PI / 2], [w / 2, 0, Math.PI / 2]]) {
    const p = box(w - 0.16, 0.56, 0.035); boxUV(p, w - 0.16, 0.56, 0.035, 1.2);
    items.push({ geom: p, x: dx, y: 0.20, z: dz, ry });
  }
  items.push({ geom: lathe([
    [0.0, 0], [0.085, 0.02], [0.115, 0.075], [0.10, 0.15], [0.05, 0.20], [0, 0.215],
  ], 10), x: 0, y: 1.215, z: 0 });
  B.definePart(id, compose(items), mat);
  return id;
}

// Areaway gate + under-stoop service gate (wrought iron).
function gatePart(B, w, h, kind) {
  w = q05(w); h = q05(h);
  const id = `victorian:${kind}:${w}x${h}`;
  if (B.hasPart(id)) return id;
  const items = [];
  for (const s of [-1, 1]) items.push({ geom: box(0.034, h, 0.034), x: s * (w / 2 - 0.017), y: 0, z: 0 });
  const rails = kind === 'sgate' ? [0.02, h * 0.44, h * 0.72, h - 0.03] : [0.06, h * 0.42, h - 0.04];
  for (const yy of rails) items.push({ geom: box(w, 0.028, 0.028), x: 0, y: yy, z: 0 });
  const n = Math.max(4, Math.round(w / 0.115));
  for (let i = 1; i < n; i++) {
    const x = -w / 2 + (w / n) * i;
    items.push({ geom: box(0.017, h - 0.04, 0.017), x, y: 0.02, z: 0 });
    if (kind === 'gate') {
      const tip = new THREE.ConeGeometry(0.019, 0.06, 4); tip.translate(0, 0.03, 0);
      items.push({ geom: tip, x, y: h - 0.02, z: 0 });
    }
  }
  for (let i = 0; i < 2; i++) {
    const t = new THREE.TorusGeometry(0.082, 0.012, 4, 9, Math.PI * 1.5);
    items.push({ geom: t, x: -w / 4 + (w / 2) * i, y: h * 0.55, z: 0, rz: i * 2.1 });
  }
  B.definePart(id, compose(items), 'victorian:iron');
  return id;
}

// Basement window guard.
function guardPart(B, w, h) {
  w = q05(w); h = q05(h);
  const id = `victorian:guard:${w}x${h}`;
  if (B.hasPart(id)) return id;
  const items = [];
  const n = Math.max(3, Math.round(w / 0.115));
  for (let i = 1; i < n; i++) {
    items.push({ geom: box(0.018, h - 0.04, 0.018), x: -w / 2 + (w / n) * i, y: 0.02, z: 0 });
  }
  for (const ry of [0.03, h / 2, h - 0.05]) {
    items.push({ geom: box(w - 0.02, 0.024, 0.024), x: 0, y: ry, z: 0 });
  }
  for (let i = 0; i < 3; i++) {
    const t = new THREE.TorusGeometry(0.062, 0.011, 4, 8, Math.PI * 1.45);
    items.push({ geom: t, x: -w / 3 + (w / 3) * i, y: h * 0.62, z: 0, rz: i * 1.7 });
  }
  B.definePart(id, compose(items), 'victorian:iron');
  return id;
}

// Corbelled-cap chimney — tall Queen Anne stack with clay pots.
function chimneyPart(B, h, mat) {
  h = q05(h);
  const id = `victorian:chimney:${mat}:${h}`;
  if (B.hasPart(id)) return id;
  const items = [];
  const w = 0.62;
  const g = box(w, h, w * 0.78); boxUV(g, w, h, w * 0.78, 2);
  items.push({ geom: g, x: 0, y: 0, z: 0 });
  // corbelled cap: three stepped courses
  for (let i = 0; i < 3; i++) {
    const cw = w + 0.07 + i * 0.055;
    const b = box(cw, 0.09, cw * 0.80); boxUV(b, cw, 0.09, cw * 0.8, 2);
    items.push({ geom: b, x: 0, y: h - 0.30 + i * 0.09, z: 0 });
  }
  const cap = box(w + 0.28, 0.06, w * 0.78 + 0.28);
  ensureColor(cap, new THREE.Color(0.56, 0.54, 0.5));
  items.push({ geom: cap, x: 0, y: h - 0.03, z: 0 });
  for (const s of [-1, 1]) {
    const pot = cylinder(0.082, 0.095, 0.30, 9);
    ensureColor(pot, new THREE.Color(0.52, 0.30, 0.22));
    items.push({ geom: pot, x: s * w * 0.24, y: h + 0.03, z: 0 });
  }
  B.definePart(id, compose(items), mat);
  return id;
}

// Roof / gable finial and small pinnacle spike.
function finialPart(B) {
  const id = 'victorian:finial';
  if (B.hasPart(id)) return id;
  const g = compose([
    { geom: lathe([[0.10, 0], [0.13, 0.05], [0.09, 0.12], [0.07, 0.20], [0.10, 0.26],
      [0.07, 0.33], [0.045, 0.42], [0.02, 0.56], [0, 0.62]], 9), x: 0, y: 0, z: 0 },
    { geom: box(0.19, 0.055, 0.19), x: 0, y: 0, z: 0 },
  ]);
  B.definePart(id, g, 'victorian:iron');
  return id;
}

// Iron roof cresting along the cornice top.
function crestingPart(B, len) {
  len = q25(len);
  const id = `victorian:cresting:${len}`;
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: box(len, 0.024, 0.024), x: 0, y: 0.19, z: 0 });
  items.push({ geom: box(len, 0.022, 0.022), x: 0, y: 0.02, z: 0 });
  const n = Math.max(3, Math.round(len / 0.21));
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (len / n) * i;
    items.push({ geom: box(0.015, 0.21, 0.015), x, y: 0, z: 0 });
    const tip = new THREE.ConeGeometry(0.018, 0.055, 4); tip.translate(0, 0.027, 0);
    items.push({ geom: tip, x, y: 0.21, z: 0 });
    if (i < n) {
      const t = new THREE.TorusGeometry(0.055, 0.009, 4, 8, Math.PI);
      items.push({ geom: t, x: x + len / (n * 2), y: 0.09, z: 0, ry: Math.PI / 2 });
    }
  }
  B.definePart(id, compose(items), 'victorian:iron');
  return id;
}

// Terracotta band ornament block (repeated along belt courses).
function terraBlockPart(B, mat) {
  const id = `victorian:terrablock:${mat}`;
  if (B.hasPart(id)) return id;
  const items = [];
  const g = box(0.44, 0.24, 0.075); boxUV(g, 0.44, 0.24, 0.075, 1.0);
  items.push({ geom: g, x: 0, y: 0, z: 0.0375 });
  const f = box(0.34, 0.15, 0.115); boxUV(f, 0.34, 0.15, 0.115, 0.5);
  items.push({ geom: f, x: 0, y: 0.045, z: 0.0575 });
  items.push({ geom: cylinder(0.048, 0.048, 0.145, 9), x: 0, y: 0.12, z: 0.0725, rx: Math.PI / 2 });
  B.definePart(id, compose(items), mat);
  return id;
}

// Terracotta / stone rosette roundel.
function rosettePart(B, mat) {
  const id = `victorian:rosette:${mat}`;
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: cylinder(0.20, 0.20, 0.055, 14), x: 0, y: 0, z: 0.0275, rx: Math.PI / 2 });
  items.push({ geom: cylinder(0.145, 0.145, 0.10, 12), x: 0, y: 0, z: 0.05, rx: Math.PI / 2 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    items.push({
      geom: box(0.062, 0.10, 0.11), x: Math.cos(a) * 0.10, y: Math.sin(a) * 0.10, z: 0.055, rz: a,
    });
  }
  items.push({ geom: cylinder(0.052, 0.052, 0.13, 8), x: 0, y: 0, z: 0.065, rx: Math.PI / 2 });
  B.definePart(id, compose(items), mat);
  return id;
}

// Entry lantern.
function lanternPart(B) {
  const id = 'victorian:lantern';
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: box(0.055, 0.14, 0.09), x: 0, y: 0, z: 0.045 });
  items.push({ geom: cylinder(0.016, 0.016, 0.15, 6), x: 0, y: 0.03, z: 0.135 });
  items.push({ geom: lathe([[0, 0], [0.07, 0.045], [0.062, 0.19], [0.028, 0.225], [0, 0.235]], 6), x: 0, y: -0.21, z: 0.16 });
  B.definePart(id, compose(items), 'victorian:iron');
  return id;
}

// Conical turret roof (fish-scale slate) + finial spike.
function turretRoofPart(B, r) {
  r = q05(r);
  const id = `victorian:turretroof:${r}`;
  if (B.hasPart(id)) return id;
  const g = cone(r * 1.12, r * 2.05, 14);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (2 * Math.PI * r), uv.getY(i) * r * 2.05);
  B.definePart(id, g, 'victorian:slate');
  return id;
}

// ---------------------------------------------------------------------------
// bay geometry: facet list. Each facet gives its centre offset from the bay
// centre-line (cx along the wall, cz out from the wall), its outward rotation
// and its width. `win` marks which facets carry sash.
// ---------------------------------------------------------------------------
function bayFacets(kind, bayW, proj) {
  if (kind === 'square') {
    return {
      proj,
      facets: [
        { cx: -bayW / 2, cz: proj / 2, ry: -Math.PI / 2, w: proj, win: 3 },
        { cx: 0, cz: proj, ry: 0, w: bayW, win: 1 },
        { cx: bayW / 2, cz: proj / 2, ry: Math.PI / 2, w: proj, win: 3 },
      ],
    };
  }
  if (kind === 'bow') {
    const angs = [-0.90, -0.45, 0, 0.45, 0.90];
    const wts = [0.42, 0.95, 1.10, 0.95, 0.42];
    let rawX = 0;
    for (let i = 0; i < 5; i++) rawX += wts[i] * Math.cos(angs[i]);
    const k = bayW / rawX;
    let x = -bayW / 2, z = 0, maxZ = 0;
    const facets = [];
    for (let i = 0; i < 5; i++) {
      const w = wts[i] * k;
      const dx = w * Math.cos(angs[i]), dz = -w * Math.sin(angs[i]);
      facets.push({
        cx: x + dx / 2, cz: z + dz / 2, ry: angs[i], w,
        win: i === 2 ? 1 : (i === 1 || i === 3 ? 2 : 0),
      });
      x += dx; z += dz;
      maxZ = Math.max(maxZ, z);
    }
    return { proj: maxZ, facets };
  }
  const faceW = Math.max(0.95, bayW - 2 * proj);
  const rl = proj * Math.SQRT2;
  return {
    proj,
    facets: [
      { cx: -(faceW / 2 + proj / 2), cz: proj / 2, ry: -Math.PI / 4, w: rl, win: 3 },
      { cx: 0, cz: proj, ry: 0, w: faceW, win: 1 },
      { cx: faceW / 2 + proj / 2, cz: proj / 2, ry: Math.PI / 4, w: rl, win: 3 },
    ],
  };
}

// Regular polygon drum (corner turret).
function drumFacets(n, r) {
  const ap = r * Math.cos(Math.PI / n), fw = 2 * r * Math.sin(Math.PI / n);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ cx: Math.sin(a) * ap, cz: Math.cos(a) * ap, ry: a, w: fw });
  }
  return out;
}

// Split a horizontal band around x-holes -> [[cx, w], ...]
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

// Floor hierarchy: the parlor window is MUCH taller than the top floor. Getting
// this wrong flattens the whole vertical read (docs/typology/01-brownstone.md).
const WSPEC = [
  { w: 1.02, h: 2.46, sill: 0.38 },
  { w: 0.96, h: 1.95, sill: 0.80 },
  { w: 0.94, h: 1.74, sill: 0.76 },
  { w: 0.92, h: 1.58, sill: 0.74 },
  { w: 0.90, h: 1.48, sill: 0.72 },
];

export function generate(ctx, lot, rng) {
  const { kit: K, batcher: B } = ctx;
  ensureMaterials(B);

  // ---- lot, handedness -----------------------------------------------------
  const showcase = lot.district === 'showcase';
  const W = Math.max(4.6, lot.width || 6.1);
  const commercial = !!lot.commercial;
  let corner = lot.corner | 0;
  // SHOWCASE CORNER TEST: tools/shot.mjs cannot set lot.corner, so in showcase
  // every 3rd seed is promoted to a left-exposed corner lot — that is the only
  // way the turret + wrapped side elevation ever get rendered. In the real city
  // lot.corner passes through untouched.
  if (!corner && showcase && rng.seed % 3 === 0) corner = -1;
  let mirror = !!lot.mirror;
  if (showcase && rng.seed % 2 === 0) mirror = true;
  // side = +1 -> bay on the RIGHT, stoop/entrance on the LEFT. On a corner lot
  // the bay always sits away from the exposed corner (the turret takes it).
  const side = corner ? -Math.sign(corner) : (mirror ? -1 : 1);

  const AW = commercial ? 0.5 : q05(rng.range(2.85, 3.15));
  const F = at(lot.frame, 0, 0, -AW);
  const D = Math.max(11, (lot.depth || 17) - AW);

  // ---- vertical stack ------------------------------------------------------
  const floors = lot.stories || rng.weighted([[3, 40], [4, 44], [2, 8], [5, 8]]);
  const steps = commercial ? 0 : rng.int(9, 11);
  const parlorY = commercial ? 0.16 : WALK_Y + steps * RISER;   // 1.56 – 1.92 m
  const groundH = commercial ? 3.95 : 0;
  const fh = [];
  let h0 = rng.range(3.48, 3.94);                                // parlor tallest
  for (let f = 0; f < floors; f++) {
    fh.push(h0);
    h0 = Math.max(2.74, h0 * rng.range(0.885, 0.925));
  }
  const floorY = [];
  let yc = parlorY + groundH;
  for (let f = 0; f < floors; f++) { floorY.push(yc); yc += fh[f]; }
  const H = yc;                                                  // cornice bed line
  const CORN_H = rng.range(0.92, 1.28);
  const wtY = commercial ? groundH - 0.34 : parlorY - 0.34;      // water table
  const spec = (f) => WSPEC[Math.min(f, WSPEC.length - 1)];

  // ---- masonry palette -----------------------------------------------------
  const rockMat = rng.weighted([['victorian:rock', 66], ['victorian:rockBuff', 34]]);
  const brickMat = rng.weighted([
    ['victorian:ironspot', 34], ['brickOrange', 20], ['brickRed', 16],
    ['brickTan', 15], ['brickBrown', 15],
  ]);
  const shaftMat = rng.weighted([[brickMat, 62], ['brownstone', 16], [rockMat, 14], ['brownstoneDark', 8]]);
  const shaftIsStone = shaftMat === 'brownstone' || shaftMat === 'brownstoneDark' || shaftMat === rockMat;
  // rock-faced parlor storey (Bed-Stuy / Park Slope Romanesque signature)
  const rockParlor = !commercial && !shaftIsStone && rng.bool(0.55);
  const trimMat = rng.weighted([
    ['brownstone', 30], ['limestone', 26], [rockMat, 24], ['victorian:terra', 20],
  ]);
  const bandMat = rng.weighted([['victorian:terra', 46], [trimMat, 34], ['limestone', 20]]);
  const carveMat = rng.bool(0.72) ? 'victorian:carved' : trimMat;

  const soil = rng.range(0.78, 0.94);
  const tint = new THREE.Color(soil, soil * rng.range(0.985, 1.014), soil * rng.range(0.955, 1.01));
  const baseTint = tint.clone().multiplyScalar(0.93);
  const trimTint = tint.clone().multiplyScalar(rng.range(0.88, 1.00));
  const bandTint = tint.clone().multiplyScalar(rng.range(0.86, 0.99));
  const stoopTint = tint.clone().multiplyScalar(rng.range(0.94, 1.10));
  const cornColor = new THREE.Color(rng.weighted([
    [0x6e5040, 4], [0x211f1d, 3], [0x26382a, 2.5], [0x4a2622, 1.6],
    [0xb3a893, 1.6], [0x7a6a58, 1.4],
  ]));
  const ironColor = new THREE.Color(rng.weighted([
    [0x1c1a18, 68], [0x1f2e22, 16], [0x33322f, 9], [0x4a2622, 7],
  ]));
  const doorColor = new THREE.Color(rng.weighted([
    [0x3a2416, 5], [0x24150e, 3], [0x18281e, 2], [0x4a1c1a, 2], [0x53381f, 2],
  ]));
  const sashColor = new THREE.Color(rng.weighted([[0xd8d3c6, 3], [0x2a2724, 3], [0x1e3226, 2]]));
  const slateTint = new THREE.Color(rng.weighted([[0x8a8f96, 4], [0x9a8a80, 2], [0x7f8a86, 2]]));
  const glassTint = new THREE.Color().setHSL(rng.range(0.06, 0.60), rng.range(0.03, 0.10), rng.range(0.17, 0.30));
  const sashStyle = rng.weighted([['dh1', 82], ['dh2', 18]]);
  const litP = 0.34;

  // ---- signature-move dice -------------------------------------------------
  let bayKind = commercial
    ? rng.weighted([['canted', 5], ['bow', 4], ['square', 3]])
    : rng.weighted([['canted', 40], ['bow', 27], ['square', 20], ['none', 13]]);
  if (W < 5.0) bayKind = rng.bool(0.5) ? 'canted' : 'none';
  const hasBay = bayKind !== 'none';
  const bayTop = !hasBay ? 'none' : rng.weighted([['through', 34], ['capped', 30], ['gable', 36]]);
  const gableKind = rng.weighted([['tri', 46], ['curved', 30], ['stepped', 24]]);
  const gableFull = rng.bool(0.42);
  const headStyle = rng.weighted([['band', 40], ['individual', 34], ['segArch', 26]]);
  const archDoor = rng.bool(0.62);
  const archParlor = rng.bool(0.55);
  const archTop = rng.bool(0.40);
  const carvedBand = rng.bool(0.62);         // deep foliate band under the bay
  const shingleUpper = !shaftIsStone && rng.bool(0.30);  // fish-scale top storey
  const cresting = rng.bool(0.16);
  const bayReturnWin = rng.bool(0.55);
  const solidStoop = rng.bool(0.22);         // stone parapet instead of iron rail

  // ---- bay footprint -------------------------------------------------------
  const bayW = hasBay ? clamp(W * (bayKind === 'square' ? 0.45 : 0.50), 2.35, 3.45) : 0;
  const projIn = bayKind === 'square' ? rng.range(0.62, 0.82) : rng.range(0.86, 1.06);
  const bayGeom = hasBay ? bayFacets(bayKind, bayW, projIn) : { proj: 0, facets: [] };
  const bayProj = bayGeom.proj;
  const bayX = hasBay ? side * (W / 2 - bayW / 2 - rng.range(0.10, 0.26)) : 0;

  // window widths per facet role
  const facetWin = (fc) => {
    if (fc.win === 0) return { xs: [], w: 0 };
    if (fc.win === 1) {
      if (bayKind === 'square' && fc.w > 2.5) {
        const ww = clamp((fc.w - 1.05) / 2, 0.60, 0.92);
        return { xs: [-(ww + 0.32) / 2, (ww + 0.32) / 2], w: ww };
      }
      return { xs: [0], w: clamp(fc.w - 0.42, 0.62, 1.10) };
    }
    if (fc.win === 2) return { xs: [0], w: clamp(fc.w - 0.34, 0.46, 0.68) };
    return bayReturnWin && fc.w > 0.92 ? { xs: [0], w: clamp(fc.w - 0.56, 0.42, 0.56) } : { xs: [], w: 0 };
  };
  for (const fc of bayGeom.facets) {
    const fw = facetWin(fc);
    fc.wx = fw.xs; fc.ww = fw.w;
    fc.frame = at(F, bayX + fc.cx, 0, fc.cz, fc.ry);
  }

  // bay vertical extent
  const bayY0 = commercial ? groundH - 0.10 : 0.02;
  const bayTopFloor = bayTop === 'capped' ? Math.max(1, floors - 1) : floors;
  const bayY1 = bayTop === 'capped'
    ? floorY[bayTopFloor] + spec(bayTopFloor).sill - 0.36
    : H;

  // ---- entrance strip ------------------------------------------------------
  const stripLo = side > 0 ? -W / 2 + 0.14 : bayX + bayW / 2 + 0.14;
  const stripHi = side > 0 ? bayX - bayW / 2 - 0.14 : W / 2 - 0.14;
  const stripW = hasBay ? stripHi - stripLo : W - 0.28;
  const stripC = hasBay ? (stripLo + stripHi) / 2 : 0;
  const doorW = q05(clamp(stripW - (hasBay ? 1.30 : 2.60), 1.02, 1.55));
  const doorH = 2.76;
  const surW = doorW + 0.78;
  const doorX = hasBay ? stripC : side * (W / 2 - surW / 2 - 0.36);
  const doorArchR = doorW / 2 + 0.02;
  const doorTop = parlorY + doorH + (archDoor ? doorArchR : 0);

  // upper-floor windows in the entrance strip
  const upW = spec(1).w;
  let stripXs;
  if (hasBay) {
    stripXs = stripW > 3.55 ? [stripC - (upW + 0.44) / 2, stripC + (upW + 0.44) / 2] : [stripC];
  } else {
    const n = W >= 5.6 ? 3 : 2;
    const usable = W - 2 * (0.46 + upW / 2);
    stripXs = [];
    for (let i = 0; i < n; i++) stripXs.push(-usable / 2 + (usable / (n - 1)) * i);
  }
  // parlor windows when there is no bay (wide Romanesque arcade beside the door)
  let parlorXs = [];
  if (!hasBay) {
    const lo = side > 0 ? -W / 2 + 0.44 : doorX + surW / 2 + 0.34;
    const hi = side > 0 ? doorX - surW / 2 - 0.34 : W / 2 - 0.44;
    const pw0 = spec(0).w, avail = hi - lo;
    if (avail > pw0 * 2 + 0.95) parlorXs = [lo + pw0 / 2 + 0.08, hi - pw0 / 2 - 0.08];
    else if (avail > pw0 + 0.28) parlorXs = [(lo + hi) / 2];
  }
  const basXs = hasBay ? [stripC] : (parlorXs.length ? parlorXs : [stripC]);
  const basW = 0.86, basH = 0.98, basY = 0.42;

  // =========================================================================
  // local helpers
  // =========================================================================
  const shiftRows = (rows, y0, y1) => rows
    .filter((r) => r.y1 > y0 + 0.008 && r.y0 < y1 - 0.008)
    .map((r) => ({
      y0: Math.max(0, r.y0 - y0),
      y1: Math.min(y1 - y0, r.y1 - y0),
      openings: r.openings.map((o) => {
        const oo = { x: o.x, w: o.w };
        if (o.y0 != null) oo.y0 = Math.max(0, o.y0 - y0);
        if (o.y1 != null) oo.y1 = Math.min(y1 - y0, o.y1 - y0);
        return oo;
      }),
    }));

  const section = (fr, width, y0, y1, mat, rows, o = {}) => {
    if (y1 - y0 < 0.02) return;
    punchedWall(ctx, at(fr, 0, y0, o.zFace || 0), {
      width, height: y1 - y0, depth: o.depth ?? 0.38, mat, tint: o.tint ?? tint,
      rows: shiftRows(rows, y0, y1), grime: o.grime ?? 0.2,
      aoTop: o.aoTop ? o.aoTop - y0 : 0,
    });
  };

  // widest trim that still lands inside the wall it belongs to
  const fitTrim = (x, w, extra, hostW) =>
    Math.max(w + 0.04, Math.min(w + extra, 2 * (hostW / 2 - Math.abs(x) - 0.03)));
  const addSill = (fr, x, y, w, mat = trimMat, tc = trimTint, hostW = 1e9) => {
    const sw = fitTrim(x, w, 0.40, hostW);
    B.addMerged(mat, box(sw, 0.115, 0.17), at(fr, x, y - 0.115, 0.02), { tint: tc });
    B.addMerged(mat, box(sw - 0.10, 0.055, 0.11), at(fr, x, y - 0.17, -0.005), { tint: tc });
  };

  const soot = (fr, x, yTop, w, mat) => {
    const g = quad(w, 0.78); ensureColor(g); shadeYRange(g, 0, 0.78, 1.0, 0.62);
    B.addMerged(mat, g, at(fr, x, yTop - 0.78, 0.013), { tint });
  };

  // stepped masonry infill turning a rectangular punch into a round arch
  const archFill = (fr, x, springY, R, mat, dep = 0.38) => {
    const nS = 6;
    for (let i = 0; i < nS; i++) {
      const t0 = (i / nS) * R, t1 = ((i + 1) / nS) * R;
      const fw = R - Math.sqrt(Math.max(0, R * R - t0 * t0));
      if (fw > 0.02) {
        for (const s of [-1, 1]) {
          B.addMerged(mat, box(fw, t1 - t0, dep), at(fr, x + s * (R - fw / 2), springY + t0, -dep / 2), { tint });
        }
      }
    }
  };

  // full round-arched head: infill + dark backing + glazed tympanum + voussoirs
  const archHead = (fr, x, springY, R, mat, stained) => {
    archFill(fr, x, springY, R, mat);
    const bk = box(R * 2.2, R + 0.4, 0.05);
    ensureColor(bk, new THREE.Color(0.06, 0.055, 0.052));
    B.addMerged('paintFlat', bk, at(fr, x, springY - 0.3, -0.34), { worldUV: false });
    const disc = new THREE.CircleGeometry(R - 0.055, 14, 0, Math.PI);
    ensureColor(disc, new THREE.Color(0.62, 0.60, 0.56));
    B.addMerged(stained ? 'victorian:stained' : 'glass', disc, at(fr, x, springY - 0.01, -0.17), { worldUV: false });
    for (let i = 1; i < 4; i++) {                       // radiating leading
      const a = (i / 4) * Math.PI;
      const g = box(0.022, R - 0.07, 0.022); g.rotateZ(Math.PI / 2 - a);
      ensureColor(g, new THREE.Color(0.16, 0.15, 0.14));
      B.addMerged('paintFlat', g, at(fr, x, springY, -0.15), { worldUV: false });
    }
    B.addInstance(voussoirPart(B, R * 2, rockMat), at(fr, x, springY, 0), baseTint);
  };

  // DARK REVEAL LINING — the shadow slot that makes an opening read as a HOLE
  // rather than a decal. Sits inside the punched opening, hugging jambs + head.
  const revealLiner = (fr, x, y, w, h, deep = RECESS) => {
    const rd = deep + 0.03;
    const mk = (g) => { ensureColor(g, new THREE.Color(0.115, 0.108, 0.10)); return g; };
    B.addMerged('paintFlat', mk(box(w - 0.01, 0.055, rd)), at(fr, x, y + h - 0.055, -rd / 2), { worldUV: false });
    for (const s of [-1, 1]) {
      B.addMerged('paintFlat', mk(box(0.055, h - 0.05, rd)),
        at(fr, x + s * (w / 2 - 0.028), y, -rd / 2), { worldUV: false });
    }
  };

  const placeWin = (fr, x, y, w, h, f, opts = {}) => {
    const m = at(fr, x, y, 0);
    revealLiner(fr, x, y, w, h);
    K.window({ w, h, style: sashStyle, recess: RECESS, frameW: 0.055 }, m, {
      tint: sashColor,
      glassTint: glassTint.clone().offsetHSL(rng.range(-0.10, 0.10), rng.range(-0.03, 0.05), rng.range(-0.06, 0.09)),
      lit: rng.bool(litP),
    });
    const hostW = opts.hostW || 1e9;
    addSill(fr, x, y, w, opts.sillMat || trimMat, trimTint, hostW);
    soot(fr, x, y - 0.20, fitTrim(x, w, 0.34, hostW), opts.wallMat || shaftMat);
    if (opts.arched) {
      archHead(fr, x, y + h, w / 2 + 0.02, opts.wallMat || shaftMat, opts.stained);
    } else if (headStyle === 'individual') {
      const lw = fitTrim(x, w, 0.46, hostW);
      B.addMerged(trimMat, box(lw, 0.24, 0.13), at(fr, x, y + h, 0.02), { tint: trimTint });
      B.addMerged(trimMat, box(lw + 0.12, 0.07, 0.19), at(fr, x, y + h + 0.24, 0.045), { tint: trimTint });
      for (const s of [-1, 1]) {
        B.addMerged(trimMat, box(0.11, 0.30, 0.17), at(fr, x + s * (lw / 2 - 0.055), y + h - 0.03, 0.04), { tint: trimTint });
      }
    } else if (headStyle === 'segArch') {
      const n = 7, rise = w * 0.16, ow = fitTrim(x, w, 0.36, hostW);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5;
        B.addMerged(trimMat, box((ow / n) * 0.97, 0.24, 0.11),
          at(fr, x + t * ow, y + h + rise * (1 - 4 * t * t) * 0.9, 0.005), { tint: trimTint });
      }
      B.addMerged(trimMat, box(0.19, 0.32, 0.15), at(fr, x, y + h + rise * 0.85, 0.02), { tint: trimTint });
    }
    if (f >= 1 && !opts.noAC && rng.bool(0.20)) K.acUnit(at(fr, x, y + 0.03, 0.05));
  };

  // continuous belt / band-lintel course across a run
  const beltRun = (fr, cx, w, y, mat, tc, hgt = 0.22, prj = 0.10, cap = true) => {
    B.addMerged(mat, box(w, hgt, prj + 0.06), at(fr, cx, y, (prj + 0.06) / 2 - 0.06), { tint: tc });
    if (cap) {
      B.addMerged(mat, box(w, 0.055, prj + 0.13), at(fr, cx, y + hgt - 0.014, (prj + 0.13) / 2 - 0.06), { tint: tc });
    }
  };

  // ---- collect every wall run (main wall + each bay facet) -----------------
  const mainRows = [];
  for (const fc of bayGeom.facets) { fc.rows = []; fc.wins = []; }

  // ---- basement / under-stoop row -----------------------------------------
  const usDoorW = 0.94;
  const usDoorH = Math.max(1.25, wtY - 0.20);
  if (!commercial) {
    const ops = [{ x: doorX, w: usDoorW, y0: 0.08, y1: 0.08 + usDoorH }];
    for (const x of basXs) ops.push({ x, w: basW, y0: basY, y1: basY + basH });
    ops.sort((a, b) => a.x - b.x);
    mainRows.push({ y0: 0.06, y1: 0.08 + usDoorH + 0.02, openings: ops });
    // bay basement light
    for (const fc of bayGeom.facets) {
      if (fc.win === 1 && fc.wx.length) {
        const bw2 = clamp(fc.ww, 0.5, 0.95);
        fc.rows.push({ y0: basY, y1: basY + basH, openings: fc.wx.map((x) => ({ x, w: bw2 })) });
        for (const x of fc.wx) fc.wins.push({ x, y: basY, w: bw2, h: basH, f: 0, basement: true });
      }
    }
  }

  // ---- parlor row ----------------------------------------------------------
  if (commercial) {
    mainRows.push({ y0: 0.08, y1: groundH - 0.52, openings: [{ x: 0, w: W - 1.25, y0: 0.10, y1: groundH - 0.56 }] });
  } else {
    const ops = [{ x: doorX, w: doorW + 0.05, y0: parlorY, y1: doorTop }];
    const s0 = spec(0);
    const pH = archParlor ? s0.h * 0.80 : s0.h;
    for (const x of parlorXs) {
      const R = s0.w / 2 + 0.02;
      ops.push({
        x, w: s0.w, y0: floorY[0] + s0.sill,
        y1: floorY[0] + s0.sill + pH + (archParlor ? R : 0),
      });
    }
    ops.sort((a, b) => a.x - b.x);
    mainRows.push({ y0: parlorY - 0.02, y1: Math.max(...ops.map((o) => o.y1)) + 0.02, openings: ops });
  }

  // ---- every floor of windows (main wall strip + bay facets) --------------
  // main-wall window centres over a bay that stops short of the cornice
  const aboveBayXs = [];
  if (hasBay && bayTop === 'capped') {
    if (bayW > 2.8) aboveBayXs.push(bayX - (spec(2).w + 0.52) / 2, bayX + (spec(2).w + 0.52) / 2);
    else aboveBayXs.push(bayX);
  }
  const mainWins = [];
  for (let f = commercial ? 0 : 1; f < floors; f++) {
    const sp = spec(f);
    const arched = archTop && f === floors - 1;
    const hh = arched ? sp.h * 0.80 : sp.h;
    const R = sp.w / 2 + 0.02;
    const y = floorY[f] + sp.sill;
    const xs = [...stripXs];
    if (aboveBayXs.length && y > bayY1 + 0.52) xs.push(...aboveBayXs);
    xs.sort((a, b) => a - b);
    mainRows.push({
      y0: y, y1: y + hh + (arched ? R : 0) + 0.02,
      openings: xs.map((x) => ({ x, w: sp.w, y0: y, y1: y + hh + (arched ? R : 0) })),
    });
    for (const x of xs) mainWins.push({ x, y, w: sp.w, h: hh, f, arched });
  }
  // bay windows — INCLUDING the parlor floor (the tall ones that make the bay)
  for (let f = 0; f < floors; f++) {
    const sp = spec(f);
    const arched = (f === 0 && archParlor) || (archTop && f === floors - 1 && bayTop !== 'capped');
    const y = floorY[f] + sp.sill;
    for (const fc of bayGeom.facets) {
      if (!fc.wx.length) continue;
      const bR = fc.ww / 2 + 0.02;
      // bay sash stay TALL — bow-front lights are narrow but full height
      const bh = arched ? sp.h * 0.80 : clamp(sp.h, 1.35, Math.max(1.35, fc.ww * 3.4));
      if (y + bh + (arched ? bR : 0) + 0.28 > bayY1) continue;
      fc.rows.push({
        y0: y, y1: y + bh + (arched ? bR : 0) + 0.02,
        openings: fc.wx.map((x) => ({ x, w: fc.ww, y0: y, y1: y + bh + (arched ? bR : 0) })),
      });
      for (const x of fc.wx) fc.wins.push({ x, y, w: fc.ww, h: bh, f, arched });
    }
  }
  if (commercial) {
    for (const fc of bayGeom.facets) fc.rows = fc.rows.filter((r) => r.y0 >= groundH - 0.5);
  }

  // =========================================================================
  // BUILD: walls in material sections (mixed masonry on ONE facade)
  // =========================================================================
  mainRows.sort((a, b) => a.y0 - b.y0);
  const pTopY = floors > 1 ? floorY[1] - 0.40 : H;
  const shaftTopY = shingleUpper && floors > 2 ? floorY[floors - 1] - 0.34 : H;

  const buildRuns = (fr, width, rows, y0, y1, zf) => {
    if (commercial && y1 <= groundH) return;
    const a0 = Math.max(y0, commercial ? groundH - 0.6 : 0);
    if (y1 - a0 < 0.03) return;
    if (a0 < wtY) {
      section(fr, width, a0, Math.min(wtY, y1), rockMat, rows,
        { zFace: zf + 0.055, depth: 0.42, tint: baseTint, grime: 0.34 });
    }
    if (y1 > wtY) {
      const s1 = Math.max(a0, wtY);
      if (rockParlor && s1 < pTopY) {
        section(fr, width, s1, Math.min(pTopY, y1), rockMat, rows,
          { zFace: zf + 0.028, depth: 0.40, tint: baseTint, grime: 0.24 });
      }
      const s2 = rockParlor ? Math.max(s1, pTopY) : s1;
      if (y1 > s2) {
        section(fr, width, s2, Math.min(shaftTopY, y1), shaftMat, rows,
          { zFace: zf, depth: 0.38, aoTop: H, grime: rockParlor ? 0.1 : 0.2 });
        if (y1 > shaftTopY) {
          section(fr, width, shaftTopY, y1, 'victorian:slate', rows,
            { zFace: zf + 0.02, depth: 0.34, tint: slateTint, aoTop: H, grime: 0.06 });
        }
      }
    }
  };

  buildRuns(F, W, mainRows, 0, H, 0);
  {   // splash-and-salt band where the pavement throws water at the stone
    const g = quad(W - 0.06, 0.85); ensureColor(g); shadeYRange(g, 0, 0.85, 0.72, 1.0);
    B.addMerged(rockMat, g, at(F, 0, 0.02, 0.075), { tint: baseTint });
  }
  {   // soot wash in the sheltered band under the cornice
    const g = quad(W - 0.06, 1.5); ensureColor(g); shadeYRange(g, 0, 1.5, 0.60, 1.0);
    B.addMerged(shaftMat, g, at(F, 0, H - 1.5, 0.012), { tint });
  }
  for (const fc of bayGeom.facets) {
    buildRuns(fc.frame, fc.w + 0.03, fc.rows, bayY0, bayY1, 0);
  }

  // ---- rusticated base coursing on the areaway wall -----------------------
  if (!commercial) {
    const holes = [{ x0: doorX - usDoorW / 2 - 0.12, x1: doorX + usDoorW / 2 + 0.12 }];
    for (const x of basXs) holes.push({ x0: x - basW / 2 - 0.24, x1: x + basW / 2 + 0.24 });
    if (hasBay) holes.push({ x0: bayX - bayW / 2 - 0.05, x1: bayX + bayW / 2 + 0.05 });
    for (const [cx, cw] of bandSegs(W, holes)) {
      B.addMerged(rockMat, box(cw, wtY - 0.04, 0.055), at(F, cx, 0.02, 0.083), { tint: baseTint, grime: 0.36 });
    }
  }

  // ---- water table ---------------------------------------------------------
  {
    const wtHoles = hasBay ? [{ x0: bayX - bayW / 2 - 0.02, x1: bayX + bayW / 2 + 0.02 }] : [];
    for (const [cx, cw] of bandSegs(W, wtHoles)) {
      beltRun(F, cx, cw, wtY, trimMat, trimTint, 0.20, 0.16);
    }
    for (const fc of bayGeom.facets) {
      if (bayY0 < wtY) beltRun(fc.frame, 0, fc.w, wtY, trimMat, trimTint, 0.20, 0.16);
    }
  }

  // ---- belt courses at sill lines + band lintels at head lines ------------
  for (let f = 1; f < floors; f++) {
    const sp = spec(f);
    const y = floorY[f] + sp.sill;
    const bandY = y - 0.26;
    const holes = hasBay ? [{ x0: bayX - bayW / 2 - 0.02, x1: bayX + bayW / 2 + 0.02 }] : [];
    // `bayLive`  — the bay body is still there, so the course wraps its facets.
    // `bayBlock` — the bay OR its cap occupies this height, so the main-wall
    // course must keep a hole rather than run through solid stone in mid-air.
    const bayLive = hasBay && bayY1 > y + 0.30;
    const bayBlockB = hasBay && bayY1 + 0.46 > bandY;
    for (const [cx, cw] of bandSegs(W, bayBlockB ? holes : [])) {
      beltRun(F, cx, cw, bandY, bandMat, bandTint, 0.20, 0.085);
    }
    if (bayLive) {
      for (const fc of bayGeom.facets) beltRun(fc.frame, 0, fc.w, bandY, bandMat, bandTint, 0.20, 0.085);
    }
    if (headStyle === 'band' && !(archTop && f === floors - 1)) {
      const hy = y + sp.h;
      const bayBlockH = hasBay && bayY1 + 0.46 > hy;
      for (const [cx, cw] of bandSegs(W, bayBlockH ? holes : [])) {
        beltRun(F, cx, cw, hy, trimMat, trimTint, 0.26, 0.11);
      }
      if (bayLive) {
        for (const fc of bayGeom.facets) beltRun(fc.frame, 0, fc.w, hy, trimMat, trimTint, 0.26, 0.11);
      }
    }
    // terracotta ornament blocks marching along the belt course
    if (bandMat === 'victorian:terra' && rng.bool(0.7)) {
      const tb = terraBlockPart(B, bandMat);
      for (const [cx, cw] of bandSegs(W, bayBlockB ? holes : [])) {
        const n = Math.floor(cw / 0.50);
        for (let i = 0; i < n; i++) {
          B.addInstance(tb, at(F, cx - cw / 2 + (cw / n) * (i + 0.5), bandY, 0.03), bandTint);
        }
      }
    }
  }

  // ---- windows -------------------------------------------------------------
  if (!commercial) {
    const gId = guardPart(B, basW, basH);
    for (const x of basXs) {
      const m = at(F, x, basY, 0);
      K.window({ w: basW, h: basH, style: 'dh1', recess: RECESS }, m, { tint: sashColor, glassTint });
      addSill(F, x, basY, basW, trimMat);
      B.addMerged(trimMat, box(basW + 0.42, 0.16, 0.13), at(F, x, basY + basH, 0.005), { tint: trimTint });
      B.addInstance(gId, at(F, x, basY - 0.02, 0.09), ironColor);
    }
    const s0 = spec(0);
    const pH = archParlor ? s0.h * 0.80 : s0.h;
    for (const x of parlorXs) {
      placeWin(F, x, floorY[0] + s0.sill, s0.w, pH, 0, {
        arched: archParlor, stained: true, wallMat: rockParlor ? rockMat : shaftMat, hostW: W,
      });
    }
  }
  for (const wn of mainWins) {
    placeWin(F, wn.x, wn.y, wn.w, wn.h, wn.f, {
      arched: wn.arched, stained: wn.arched, hostW: W,
    });
  }
  for (const fc of bayGeom.facets) {
    for (const wn of fc.wins) {
      if (wn.basement) {
        K.window({ w: wn.w, h: wn.h, style: 'dh1', recess: RECESS }, at(fc.frame, wn.x, wn.y, 0), {
          tint: sashColor, glassTint,
        });
        addSill(fc.frame, wn.x, wn.y, wn.w, trimMat);
        B.addInstance(guardPart(B, wn.w, wn.h), at(fc.frame, wn.x, wn.y - 0.02, 0.09), ironColor);
        continue;
      }
      placeWin(fc.frame, wn.x, wn.y, wn.w, wn.h, wn.f, {
        arched: wn.arched, stained: true, hostW: fc.w, noAC: true,
        wallMat: wn.y < pTopY && rockParlor ? rockMat : shaftMat,
      });
    }
  }

  // ---- CARVED FOLIATE BAND under the bay (Park Slope 8th Ave signature) ----
  if (hasBay && carvedBand && floors > 1) {
    const y = floorY[1] - 0.72;
    const fp = foliatePart(B, carveMat);
    for (const fc of bayGeom.facets) {
      const n = Math.max(1, Math.round(fc.w / 0.9));
      const pw = fc.w / n;
      for (let i = 0; i < n; i++) {
        B.addInstance(fp, atS(fc.frame, -fc.w / 2 + pw * (i + 0.5), y, 0.02, 0, pw, 1, 1), bandTint);
      }
      B.addMerged(trimMat, box(fc.w, 0.075, 0.20), at(fc.frame, 0, y + 0.50, 0.03), { tint: trimTint });
      B.addMerged(trimMat, box(fc.w, 0.075, 0.20), at(fc.frame, 0, y - 0.075, 0.03), { tint: trimTint });
    }
  }
  // rosettes in the upper spandrels
  if (rng.bool(0.5) && floors >= 3) {
    const rp = rosettePart(B, trimMat);
    for (const x of stripXs) {
      B.addInstance(rp, at(F, x, floorY[floors - 1] - 0.44, 0.02), trimTint);
    }
  }

  // =========================================================================
  // ENTRANCE
  // =========================================================================
  if (commercial) {
    K.storefront({
      width: W - 1.25, signIndex: rng.int(0, 31),
      awningIndex: rng.bool(0.45) ? rng.int(0, 7) : -1,
      gate: rng.bool(0.2) ? 1 : 0,
    }, at(F, 0, 0.12, 0));
    B.addMerged('sidewalk', box(W, 0.16, AW + 0.1), at(F, 0, -0.02, (AW + 0.1) / 2), {
      tint: new THREE.Color(0.92, 0.92, 0.9),
    });
    if (hasBay) {                                   // bay carried on stone corbels
      const cp = corbelPart(B, trimMat);
      for (const fc of bayGeom.facets) {
        if (fc.w < 0.7) continue;
        for (const s of [-1, 1]) {
          B.addInstance(cp, at(fc.frame, s * (fc.w / 2 - 0.24), bayY0 - 0.74, 0.0), trimTint);
        }
      }
    }
  } else {
    // dark hall behind the door
    const dk = box(doorW + 0.36, doorH + 1.1, 0.05);
    ensureColor(dk, new THREE.Color(0.072, 0.067, 0.063));
    B.addMerged('paintFlat', dk, at(F, doorX, parlorY, -0.42), { worldUV: false });
    K.door({ w: doorW, h: doorH, transom: true }, at(F, doorX, parlorY, 0), { tint: doorColor });
    // DOOR DRESSING — bolection panel mouldings, glazed upper lights behind an
    // iron grille, bronze knob plate. Without these a double door reads as a slab.
    {
      const leaves = doorW > 1.15 ? 2 : 1;
      const lw = (doorW - 0.06) / leaves;
      const dH = doorH - 0.55;                       // kit.door reserves 0.55 for the transom
      const zc = -0.247;
      const bronze = new THREE.Color(0.42, 0.33, 0.19);
      for (let l = 0; l < leaves; l++) {
        const cx = doorX - doorW / 2 + 0.03 + lw * (l + 0.5);
        const leaf = box(lw - 0.02, dH, 0.035);
        ensureColor(leaf, doorColor);
        B.addMerged('doorPaint', leaf, at(F, cx, parlorY, zc), { worldUV: false });
        const gw = lw * 0.60, gh = dH * 0.30, gy = parlorY + dH * 0.58;
        const gq = quad(gw, gh);
        ensureColor(gq, new THREE.Color(0.085, 0.085, 0.095));
        B.addMerged('glass', gq, at(F, cx, gy, zc + 0.012), { worldUV: false });
        for (let i = 1; i <= 3; i++) {
          B.addMerged('victorian:iron', box(0.02, gh, 0.02),
            at(F, cx - gw / 2 + (gw / 4) * i, gy, zc + 0.032), { worldUV: false, tint: ironColor });
        }
        for (const [py, ph, pw] of [[gy - 0.035, gh + 0.07, gw + 0.11], [parlorY + dH * 0.09, dH * 0.36, lw * 0.64]]) {
          for (const [ox, oy, ow2, oh2] of [
            [0, ph - 0.032, pw, 0.032], [0, 0, pw, 0.032],
            [-(pw - 0.032) / 2, 0, 0.032, ph], [(pw - 0.032) / 2, 0, 0.032, ph],
          ]) {
            const mg = box(ow2, oh2, 0.032);
            ensureColor(mg, doorColor.clone().multiplyScalar(1.35));
            B.addMerged('doorPaint', mg, at(F, cx + ox, py + oy, zc + 0.018), { worldUV: false });
          }
        }
      }
      B.addMerged('victorian:iron', box(0.065, 0.26, 0.035),
        at(F, doorX + (leaves > 1 ? 0.11 : doorW / 2 - 0.15), parlorY + 1.00, zc + 0.02),
        { worldUV: false, tint: bronze });
    }
    if (archDoor) {
      archHead(F, doorX, parlorY + doorH, doorArchR, rockParlor ? rockMat : shaftMat, true);
      // engaged colonettes carrying the arch
      const cp = colonettePart(B, trimMat);
      const csc = clamp((doorH - 0.32) / 1.34, 0.85, 2.2);
      for (const s of [-1, 1]) {
        B.addInstance(cp, atS(F, doorX + s * (doorArchR + 0.155), parlorY + 0.14, 0.14, 0, 1, csc, 1),
          trimTint);
        B.addMerged(trimMat, box(0.34, 0.16, 0.30), at(F, doorX + s * (doorArchR + 0.155), parlorY, 0.15), { tint: trimTint });
      }
      // outer order: chunky rock-faced jambs
      for (const s of [-1, 1]) {
        B.addMerged(rockMat, box(0.30, doorH + 0.05, 0.14),
          at(F, doorX + s * (doorW / 2 + 0.30), parlorY, 0.07), { tint: baseTint });
      }
    } else {
      // heavy bracketed hood on carved consoles
      const pw = 0.32, pj = 0.13;
      for (const s of [-1, 1]) {
        const cx = doorX + s * (doorW / 2 + pw / 2 + 0.06);
        B.addMerged(trimMat, box(pw + 0.08, 0.30, pj + 0.04), at(F, cx, parlorY, (pj + 0.04) / 2), { tint: trimTint });
        B.addMerged(trimMat, box(pw, doorH - 0.50, pj), at(F, cx, parlorY + 0.30, pj / 2), { tint: trimTint });
        B.addMerged(trimMat, box(pw + 0.10, 0.10, pj + 0.05), at(F, cx, parlorY + doorH - 0.22, (pj + 0.05) / 2), { tint: trimTint });
        B.addMerged(trimMat, box(pw - 0.02, 0.48, 0.34), at(F, cx, parlorY + doorH - 0.06, 0.17), { tint: trimTint });
        B.addMerged(trimMat, box(pw + 0.05, 0.085, 0.40), at(F, cx, parlorY + doorH + 0.42, 0.20), { tint: trimTint });
      }
      const hY = parlorY + doorH + 0.50;
      B.addMerged(trimMat, box(doorW + 1.10, 0.10, 0.44), at(F, doorX, hY, 0.22), { tint: trimTint });
      B.addMerged(trimMat, box(doorW + 1.20, 0.16, 0.53), at(F, doorX, hY + 0.10, 0.265), { tint: trimTint });
      B.addMerged(trimMat, box(doorW + 1.28, 0.07, 0.59), at(F, doorX, hY + 0.26, 0.295), { tint: trimTint });
      B.addInstance(foliatePart(B, carveMat),
        atS(F, doorX, parlorY + doorH + 0.05, 0.015, 0, doorW + 0.2, 0.62, 1), bandTint);
    }
    for (const s of [-1, 1]) {
      B.addMerged(trimMat, box(0.16, 0.30, 0.07), at(F, doorX + s * (doorW / 2 + 0.40), parlorY + 1.94, 0.035), { tint: trimTint });
      B.addInstance(lanternPart(B), at(F, doorX + s * (doorW / 2 + 0.40), parlorY + 2.06, 0.06), ironColor);
    }
  }

  // =========================================================================
  // STOOP + AREAWAY
  // =========================================================================
  let stoopSpan = [0, 0];
  if (!commercial) {
    const clearW = q05(clamp(W * 0.25, 1.26, 1.58));
    const totalProj = LAND_D + (steps - 1) * TREAD;
    const landY = WALK_Y + steps * RISER;
    const reveal = 0.20;
    const smat = rockMat;
    const add = (g, x, y, z, rx) => {
      if (rx) { g.translate(0, -0.0, 0); g.rotateX(rx); }
      B.addMerged(smat, g, at(F, doorX + x, y, z), { tint: stoopTint, grime: 0.10 });
    };
    // solid mass + treads
    {
      const d = totalProj - LAND_D;
      const g = box(clearW, WALK_Y + RISER + 0.16, d); boxUV(g, clearW, WALK_Y + RISER, d, 2);
      add(g, 0, -0.16, LAND_D + d / 2);
    }
    for (let s = 0; s < steps - 1; s++) {
      const d = totalProj - LAND_D - s * TREAD;
      const g = box(clearW, RISER + 0.09, d); boxUV(g, clearW, RISER, d, 2);
      add(g, 0, WALK_Y + s * RISER - 0.07, LAND_D + d / 2);
    }
    {
      const g = box(clearW + 0.06, 0.36, LAND_D + 0.06); boxUV(g, clearW, 0.36, LAND_D, 2);
      add(g, 0, landY - 0.36, (LAND_D + 0.06) / 2);
    }
    for (const sd of [-1, 1]) {
      const cx = sd * (clearW / 2 + CHEEK / 2);
      for (let s = 0; s < steps - 1; s++) {
        const top = WALK_Y + (s + 1) * RISER + reveal;
        const g = box(CHEEK, top + 0.16, TREAD + 0.01); boxUV(g, CHEEK, top, TREAD, 2);
        add(g, cx, -0.16, totalProj - (s + 1) * TREAD + TREAD / 2);
      }
      const g = box(CHEEK, landY + reveal + 0.16, LAND_D); boxUV(g, CHEEK, landY + reveal, LAND_D, 2);
      add(g, cx, -0.16, LAND_D / 2);
      const cap = box(CHEEK + 0.11, 0.09, LAND_D + 0.08); boxUV(cap, CHEEK + 0.11, 0.09, LAND_D, 2);
      add(cap, cx, landY + reveal, LAND_D / 2);
      // ramping coping over the run
      const zB = totalProj, zT = LAND_D;
      const yB = WALK_Y + RISER + reveal, yT = landY + reveal;
      const L = Math.hypot(zB - zT, yT - yB);
      const ang = Math.atan2(yT - yB, zB - zT);
      const cg = box(CHEEK + 0.10, 0.09, L + 0.30); boxUV(cg, CHEEK + 0.10, 0.09, L, 2);
      add(cg, cx, (yB + yT) / 2 - 0.045, (zB + zT) / 2, ang);
      if (solidStoop) {                          // solid stone parapet — Romanesque
        const pg = box(CHEEK + 0.02, 0.62, L + 0.04); boxUV(pg, CHEEK, 0.62, L, 2);
        add(pg, cx, (yB + yT) / 2 + 0.02, (zB + zT) / 2, ang);
        const pc = box(CHEEK + 0.13, 0.09, L + 0.06); boxUV(pc, CHEEK + 0.13, 0.09, L, 2);
        add(pc, cx, (yB + yT) / 2 + 0.63, (zB + zT) / 2, ang);
        const lg = box(CHEEK + 0.02, 0.62, LAND_D); boxUV(lg, CHEEK, 0.62, LAND_D, 2);
        add(lg, cx, landY + reveal + 0.09, LAND_D / 2);
        const lc = box(CHEEK + 0.13, 0.09, LAND_D + 0.06); boxUV(lc, CHEEK + 0.13, 0.09, LAND_D, 2);
        add(lc, cx, landY + reveal + 0.71, LAND_D / 2);
      }
      B.addInstance(newelPart(B, smat), at(F, doorX + cx, WALK_Y + RISER + reveal - 0.06, totalProj + 0.02), stoopTint);
    }
    if (!solidStoop) {
      B.addInstance(stoopRailPart(B, steps, clearW), at(F, doorX, 0, 0), ironColor);
    }
    stoopSpan = [doorX - clearW / 2 - CHEEK - 0.14, doorX + clearW / 2 + CHEEK + 0.14];

    // under-stoop service entrance
    B.addInstance(gatePart(B, usDoorW - 0.08, usDoorH - 0.06, 'sgate'), at(F, doorX, 0.10, 0.06), ironColor);
    const usdk = box(usDoorW + 0.12, usDoorH + 0.1, 0.05);
    ensureColor(usdk, new THREE.Color(0.05, 0.046, 0.044));
    B.addMerged('paintFlat', usdk, at(F, doorX, 0.06, -0.32), { worldUV: false });

    // areaway paving + divider walls + fence
    B.addMerged('sidewalk', box(W - 0.06, 0.12, AW + 0.06), at(F, 0, AREA_Y - 0.12, (AW + 0.06) / 2), {
      tint: new THREE.Color(0.58, 0.60, 0.63),
    });
    for (const s of [-1, 1]) {
      B.addMerged(rockMat, box(0.22, 0.96, AW - 0.06),
        at(F, s * (W / 2 - 0.11), AREA_Y - 0.08, (AW - 0.06) / 2 + 0.03), { tint: baseTint, grime: 0.28 });
      B.addMerged(trimMat, box(0.30, 0.07, AW - 0.06),
        at(F, s * (W / 2 - 0.11), AREA_Y + 0.88, (AW - 0.06) / 2 + 0.03), { tint: trimTint });
    }
    const wallH = rng.range(0.26, 0.40);
    const gateW = 0.92;
    const gateX = -side * (W / 2 - gateW / 2 - 0.42);
    const holes = [
      { x0: stoopSpan[0], x1: stoopSpan[1] },
      { x0: gateX - gateW / 2 - 0.10, x1: gateX + gateW / 2 + 0.10 },
    ].sort((a, b) => a.x0 - b.x0);
    for (const [cx, cw] of bandSegs(W - 0.08, holes)) {
      B.addMerged(rockMat, box(cw, wallH + 0.24, 0.26), at(F, cx, AREA_Y - 0.14, AW), { tint: baseTint, grime: 0.34 });
      B.addMerged(trimMat, box(cw, 0.075, 0.34), at(F, cx, AREA_Y + wallH + 0.10, AW), { tint: trimTint });
      if (cw > 0.5) K.fence(cw - 0.14, at(F, cx, AREA_Y + wallH + 0.17, AW), { tint: ironColor });
    }
    B.addInstance(gatePart(B, gateW, 1.04, 'gate'), at(F, gateX, AREA_Y + wallH + 0.17, AW), ironColor);
    for (let i = 0; i < 2; i++) {
      B.addMerged(trimMat, box(gateW, 0.07, 0.30), at(F, gateX, AREA_Y - 0.07 + i * 0.05, AW - 0.20 - i * 0.30), { tint: trimTint });
    }
    if (rng.bool(0.65)) {
      for (let i = 0, n = rng.int(1, 2); i < n; i++) {
        K.trashCan(at(F, gateX + (i - 0.5) * 0.74, AREA_Y, AW * 0.40), {
          tint: new THREE.Color(rng.weighted([[0x1f2b22, 3], [0x24262a, 2], [0x2b2320, 1]])),
        });
      }
    }
  }

  // =========================================================================
  // BAY CAP (when the bay stops short of the cornice)
  // =========================================================================
  if (hasBay && bayTop === 'capped') {
    for (const fc of bayGeom.facets) {
      const w = fc.w;
      B.addMerged(trimMat, box(w, 0.13, 0.22), at(fc.frame, 0, bayY1, 0.04), { tint: trimTint });
      B.addMerged(trimMat, box(w, 0.08, 0.33), at(fc.frame, 0, bayY1 + 0.13, 0.09), { tint: trimTint });
      B.addMerged(trimMat, box(w, 0.06, 0.39), at(fc.frame, 0, bayY1 + 0.21, 0.12), { tint: trimTint });
    }
    // deck over the bay so you cannot see into it from above
    B.addMerged(trimMat, box(bayW + 0.1, 0.10, bayProj + 0.14),
      at(F, bayX, bayY1 + 0.16, (bayProj + 0.14) / 2 - 0.06), { tint: trimTint });
  }

  // =========================================================================
  // CORNICE — heavy Queen Anne crown, running over the bay when it goes full height
  // =========================================================================
  const CPROF = [
    [0.00, 0.00], [0.09, 0.025], [0.135, 0.085], [0.085, 0.13],
    [0.085, 0.50], [0.145, 0.545], [0.17, 0.625], [0.31, 0.665],
    [0.47, 0.75], [0.575, 0.845], [0.575, 0.935], [0.485, 0.975],
    [0.485, CORN_H], [0.00, CORN_H],
  ];
  const bId = bracketPart(B);
  const sbId = sunburstPart(B);
  const corniceRun = (fr, len, cx = 0) => {
    B.addMerged('cornicePaint', profileAlongX(CPROF, len), at(fr, cx, H, 0, Math.PI), {
      tint: cornColor, worldUV: false,
    });
    B.addInstance(dentilPart(B, len - 0.1), at(fr, cx, H + 0.50, 0.145), cornColor);
    const n = Math.max(2, Math.round((len - 0.2) / 0.88));
    const span = len - 0.24;
    for (let i = 0; i <= n; i++) {
      B.addInstance(bId, at(fr, cx - span / 2 + (span / n) * i, H + 0.07, 0.055), cornColor);
    }
    const pw = span / n - 0.44;
    if (pw > 0.24) {
      for (let i = 0; i < n; i++) {
        const px = cx - span / 2 + (span / n) * (i + 0.5);
        B.addInstance(sbId, atS(fr, px, H + 0.13, 0.085, 0, Math.min(1.05, pw), 0.66, 1), cornColor);
      }
    }
    if (cresting) {
      B.addInstance(crestingPart(B, len - 0.2), at(fr, cx, H + CORN_H, 0.30), ironColor);
    }
  };
  const bayThrough = hasBay && bayTop !== 'capped';
  if (bayThrough) {
    const holes = [{ x0: bayX - bayW / 2, x1: bayX + bayW / 2 }];
    for (const [cx, cw] of bandSegs(W + 0.02, holes)) if (cw > 0.30) corniceRun(F, cw + 0.03, cx);
    for (const fc of bayGeom.facets) if (fc.w > 0.45) corniceRun(fc.frame, fc.w + 0.03, 0);
  } else {
    corniceRun(F, W + 0.02, 0);
  }

  // =========================================================================
  // GABLE breaking the roofline
  // =========================================================================
  let topY = H + CORN_H;
  if (corner && !commercial && floors >= 3) {
    // stop the cornice run cutting off in mid-air where the turret takes over
    B.addMerged(trimMat, box(0.46, CORN_H + 0.34, 0.66),
      at(F, corner * (W / 2 - 0.23), H - 0.14, 0.14), { tint: trimTint });
  }
  if (bayTop === 'gable') {
    const gW = gableFull ? W - 0.26 : Math.min(W - 0.26, bayW + 1.05);
    const gX = gableFull ? 0 : bayX;
    const gH = rng.range(1.95, 2.75);
    const gY = H + CORN_H - 0.10;
    const gZ = bayThrough ? Math.min(bayProj * 0.55, 0.42) : 0.06;
    const gMat = shingleUpper ? 'victorian:slate' : (shaftIsStone ? shaftMat : rockMat);
    const gTint = shingleUpper ? slateTint : baseTint;
    const gF = at(F, 0, 0, gZ);          // gable wall plane
    const dep = 0.46;
    const nS = 16;
    const widthAt = (t) => {
      if (gableKind === 'curved') return gW * Math.pow(Math.max(0, 1 - t * t), 0.42);
      if (gableKind === 'stepped') return gW * (1 - Math.floor(t * 3.999) * 0.235);
      return gW * (1 - t);
    };
    // attic window opening
    const awW = clamp(gW * 0.34, 0.55, 1.05), awH = 0.92, awY = gY + 0.30;
    for (let i = 0; i < nS; i++) {
      const t0 = i / nS, t1 = (i + 1) / nS;
      const w0 = widthAt(t0), w1 = widthAt(t1);
      const ww = Math.min(w0, w1);
      if (ww < 0.12) continue;
      const y0 = gY + t0 * gH, y1 = gY + t1 * gH;
      const cut = y1 > awY && y0 < awY + awH + awW / 2;
      if (cut) {
        const yy = (y0 + y1) / 2 - awY;
        const half = yy < awH ? awW / 2 : Math.sqrt(Math.max(0, (awW / 2) ** 2 - (yy - awH) ** 2));
        for (const s of [-1, 1]) {
          const inner = s * half, outer = s * ww / 2;
          const seg = Math.abs(outer - inner);
          if (seg > 0.04) {
            B.addMerged(gMat, box(seg, y1 - y0, dep), at(gF, gX + (inner + outer) / 2, y0, -dep / 2), { tint: gTint });
          }
        }
      } else {
        B.addMerged(gMat, box(ww, y1 - y0, dep), at(gF, gX, y0, -dep / 2), { tint: gTint });
      }
    }
    // attic window
    {
      const bk = box(awW + 0.3, awH + awW, 0.05);
      ensureColor(bk, new THREE.Color(0.06, 0.055, 0.05));
      B.addMerged('paintFlat', bk, at(gF, gX, awY, -0.42), { worldUV: false });
      K.window({ w: awW, h: awH, style: sashStyle, recess: 0.14 }, at(gF, gX, awY, 0), {
        tint: sashColor, glassTint, lit: rng.bool(0.36),
      });
      archFill(gF, gX, awY + awH, awW / 2 + 0.02, gMat, dep);
      const disc = new THREE.CircleGeometry(awW / 2 - 0.04, 12, 0, Math.PI);
      B.addMerged('victorian:stained', disc, at(gF, gX, awY + awH, -0.12), { worldUV: false });
      B.addInstance(voussoirPart(B, awW + 0.04, rockMat), at(gF, gX, awY + awH, 0), baseTint);
      addSill(gF, gX, awY, awW, trimMat);
    }
    // raking cornice along the gable slopes (stepped gables get step copings)
    if (gableKind === 'stepped') {
      for (let k = 0; k < 4; k++) {
        const wStep = widthAt(k / 4 + 0.001);
        const yTop = gY + Math.min(1, (k + 1) / 4) * gH;
        B.addMerged(trimMat, box(wStep + 0.14, 0.11, 0.30), at(gF, gX, yTop - 0.11, 0.04), { tint: trimTint });
        B.addMerged(trimMat, box(wStep + 0.22, 0.06, 0.38), at(gF, gX, yTop, 0.08), { tint: trimTint });
      }
    } else {
      const rake = (t0, t1) => {
        const y0 = gY + t0 * gH, y1 = gY + t1 * gH;
        const x0 = widthAt(t0) / 2, x1 = widthAt(t1) / 2;
        const dx = x0 - x1, dy = y1 - y0;
        const L = Math.hypot(dx, dy);
        if (L < 0.06 || dx < 0.005) return;
        const ang = Math.atan2(dy, dx);
        for (const s of [-1, 1]) {
          for (const [th, prj, dOut] of [[0.17, 0.24, 0.0], [0.08, 0.34, 0.055]]) {
            const g = box(L + 0.05, th, prj);
            g.translate(0, -th / 2, 0);
            g.rotateZ(-s * ang);          // slope runs UP toward the apex
            B.addMerged('cornicePaint', g,
              at(gF, gX + s * ((x0 + x1) / 2 + 0.05), (y0 + y1) / 2 + dOut, prj / 2 - 0.02),
              { tint: cornColor, worldUV: false });
          }
        }
      };
      for (let i = 0; i < 10; i++) rake(i / 10, (i + 1) / 10);
    }
    // apex medallion + finials (Park Slope 8th Ave has a big carved roundel)
    B.addInstance(rosettePart(B, carveMat), atS(gF, gX, gY + gH * 0.78, 0.02, 0, 1.35, 1.35, 1.2), bandTint);
    B.addInstance(finialPart(B), at(gF, gX, gY + gH + 0.02, -0.12), ironColor);
    for (const s of [-1, 1]) {
      B.addMerged(trimMat, box(0.26, 0.42, 0.34), at(gF, gX + s * (gW / 2 - 0.05), gY - 0.10, 0.03), { tint: trimTint });
      B.addInstance(finialPart(B), atS(gF, gX + s * (gW / 2 - 0.05), gY + 0.32, 0.03, 0, 0.75, 0.8, 0.75), ironColor);
    }
    // slate roof slope running back from the gable apex
    {
      const rl = Math.hypot(gH, 3.4);
      const g = box(gW - 0.1, 0.16, rl);
      g.translate(0, -0.08, 0);
      g.rotateX(Math.atan2(gH, 3.4));
      B.addMerged('victorian:slate', g, at(gF, gX, gY + gH * 0.5 + 0.12, -1.7), { tint: slateTint });
    }
    topY = gY + gH + 0.6;
  }

  // =========================================================================
  // CORNER TURRET
  // =========================================================================
  if (corner && !commercial && floors >= 3) {
    const r = clamp(W * 0.21, 0.95, 1.30);
    const tx = corner * (W / 2 - r * 0.86);
    const tz = r * 0.42;
    const tY0 = floorY[1] - 0.30;
    const tY1 = H + 1.15;
    const tf = drumFacets(8, r);
    for (const fc of tf) {
      const fr = at(F, tx + fc.cx, 0, tz + fc.cz, fc.ry);
      const outward = Math.cos(fc.ry) > 0.1 || Math.sin(fc.ry) * corner > 0.1;
      const rows = [];
      const wins = [];
      if (outward) {
        for (let f = 1; f < floors; f++) {
          const sp = spec(f);
          const y = floorY[f] + sp.sill;
          const ww = clamp(fc.w - 0.30, 0.38, 0.60);
          if (y + sp.h * 0.9 > tY1 - 0.4) continue;
          rows.push({ y0: y, y1: y + sp.h * 0.86, openings: [{ x: 0, w: ww }] });
          wins.push({ y, w: ww, h: sp.h * 0.86 });
        }
      }
      punchedWall(ctx, at(fr, 0, tY0, 0), {
        width: fc.w + 0.02, height: tY1 - tY0, depth: 0.32, mat: shaftMat, tint,
        rows: shiftRows(rows, tY0, tY1), grime: 0.12, aoTop: tY1 - tY0,
      });
      for (const wn of wins) {
        K.window({ w: wn.w, h: wn.h, style: sashStyle, recess: 0.15 }, at(fr, 0, wn.y, 0), {
          tint: sashColor, glassTint, lit: rng.bool(litP),
        });
        addSill(fr, 0, wn.y, wn.w, trimMat);
      }
    }
    // corbelled base rings
    for (let i = 0; i < 4; i++) {
      const rr = r * (0.52 + i * 0.14);
      B.addMerged(trimMat, cylinder(rr, rr * 0.9, 0.17, 12), at(F, tx, tY0 - 0.70 + i * 0.17, tz), { tint: trimTint });
    }
    // cap band + conical slate roof + finial
    B.addMerged(trimMat, cylinder(r * 1.10, r * 1.10, 0.16, 14), at(F, tx, tY1, tz), { tint: trimTint });
    B.addInstance(turretRoofPart(B, r), at(F, tx, tY1 + 0.16, tz), slateTint);
    B.addInstance(finialPart(B), atS(F, tx, tY1 + 0.10 + r * 2.05, tz, 0, 1.3, 1.7, 1.3), ironColor);
    topY = Math.max(topY, tY1 + 0.16 + r * 2.05 + 0.9);
  }

  // =========================================================================
  // SHELL / ROOF / ROOF GEAR
  // =========================================================================
  const rearMat = shaftMat.startsWith('brick') || shaftMat === 'victorian:ironspot' ? shaftMat : 'brickBrown';
  const rearRows = [];
  const rearXs = [-W * 0.24, W * 0.24];
  for (let f = 0; f < floors; f++) {
    const sp = spec(f);
    const y = floorY[f] + sp.sill;
    rearRows.push({ y0: y, y1: y + sp.h, openings: rearXs.map((x) => ({ x, w: 0.88 })) });
    for (const x of rearXs) {
      K.window({ w: 0.88, h: sp.h, style: 'dh1' }, at(F, -x, y, -D, Math.PI), {
        lit: rng.bool(0.40), tint: sashColor,
      });
    }
  }
  const sideRows = { left: null, right: null };
  if (corner) {
    const sr = [];
    const sub = at(F, corner * (W / 2), 0, -D / 2, corner < 0 ? -Math.PI / 2 : Math.PI / 2);
    const xs = [-D * 0.26, 0, D * 0.26];
    for (let f = 0; f < floors; f++) {
      const sp = spec(f);
      const y = floorY[f] + sp.sill;
      sr.push({ y0: y, y1: y + sp.h, openings: xs.map((x) => ({ x, w: 0.9 })) });
      for (const x of xs) {
        K.window({ w: 0.9, h: sp.h, style: sashStyle, recess: 0.15 }, sub.clone().multiply(tmat(x, y, 0)), {
          lit: rng.bool(0.36), tint: sashColor, glassTint,
        });
        addSill(sub, x, y, 0.9, trimMat);
      }
    }
    if (corner < 0) sideRows.left = sr; else sideRows.right = sr;
  }
  shellWalls(ctx, F, { width: W, depth: D, height: H, mat: rearMat, tint, rearRows, sideRows });
  flatRoof(ctx, F, {
    width: W, depth: D, height: H, parapet: 0.85, mat: rearMat, tint,
    roofMat: rng.weighted([['roofSilver', 3], ['roofBlack', 1]]), copingMat: 'graniteBase',
  });

  roofGear(ctx, F, rng, {
    width: W * 0.66, depth: D, height: H,
    bulkhead: rng.bool(0.72), vents: rng.int(2, 3), chimney: false, antenna: false, mat: rearMat,
  });
  const chMat = rearMat.startsWith('brick') || rearMat === 'victorian:ironspot' ? rearMat : 'brickBrown';
  for (let i = 0, n = rng.int(1, 3); i < n; i++) {
    B.addInstance(chimneyPart(B, q05(rng.range(1.5, 2.4)), chMat),
      at(F, (i % 2 === 0 ? -1 : 1) * (W / 2 - 0.44), H - 0.35, -D * rng.range(0.30, 0.85)), tint);
  }
  B.addMerged('glass', box(1.2, 0.28, 1.7),
    at(F, rng.range(-W * 0.14, W * 0.14), H - 0.12, -D * rng.range(0.25, 0.42)), { worldUV: false });

  return { height: Math.max(topY, H + CORN_H) };
}
