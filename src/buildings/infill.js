// Modern rainscreen INFILL condo / rental, 4-8 storeys — the 2013-2024 gap
// filler of Bushwick, Bed-Stuy, East Williamsburg and Ridgewood.
//
// The type is cheapness executed crisply:
//   * 2-3 vertical FIELDS of cladding per facade, each a different colour and
//     each on a different plane, with an aluminium reveal trim in the joint.
//     Fiber-cement panels are 1.22 x 2.44 m with a 12 mm open joint — the panel
//     grid is ALWAYS legible and is the single biggest tell.
//   * one field is often a fake-wood-grain composite plank, or ribbed metal.
//   * big asymmetric window groups: a wide fixed pane + a narrow operable slot
//     separated by a 0.10 m mullion, black anodised aluminium, head tight under
//     the slab, sill low. PTAC louvre grilles punched under many of them.
//   * Juliet rails on floor-length units, shallow bolt-on steel balconies.
//   * the top floor set back 1.7-2.6 m behind a terrace.
//   * ground floor: near-black base, glass entry with a flat steel canopy, a
//     rolling parking gate, retail on commercial lots.
//   * roof: thin metal-capped parapet, a safety rail, condensers, a bulkhead.
//
// LOCAL SPACE: facade along X centred on 0, front wall plane z=0, -z into the
// building, y=0 sidewalk.
import * as THREE from 'three';
import { at, punchedWall, shellWalls, roofGear } from './lib.js';
import { box, boxUV, quad, cylinder, compose, ensureColor, tmat } from '../geo.js';
import { makeCanvas, corrugatedTexture } from '../textures.js';

export const TYPE = 'infill';

const q05 = (v) => Math.round(v * 20) / 20;
// quantised opening sizes — the kit caches window parts by size
const WINW = [0.55, 0.80, 1.30, 1.80, 2.30, 2.80];
const WINH = [1.55, 1.90, 2.20, 2.45];
const snap = (list, v) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
const lum = (c) => c.r * 0.3 + c.g * 0.59 + c.b * 0.11;

// ---------------------------------------------------------------------------
// canvas textures — drawn at a known physical tile so the panel joints stay at
// their true 1.22 x 2.44 m module wherever they land on the facade.
// ---------------------------------------------------------------------------
function rnd32(seed) {
  let s = (seed * 2654435761) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function finish(canvas, tileMeters, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.userData.tileMeters = tileMeters;
  return t;
}

// Fiber-cement rainscreen: 1.22 x 2.44 m panels, 12 mm open joint showing the
// black membrane behind, exposed fastener dots near the panel corners.
function panelTexture({ base = '#c6c8c9', seed = 1, size = 1024, tileMeters = 2.44, jointM = 0.013 } = {}) {
  const px = size / tileMeters;
  const r = rnd32(seed);
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const b = makeCanvas(size, size), bg = b.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  bg.fillStyle = '#c8c8c8'; bg.fillRect(0, 0, size, size);
  const cols = 2, rows = 1;
  const cw = size / cols, ch = size / rows;
  const j = Math.max(4, jointM * px);
  for (let ry = 0; ry < rows; ry++) {
    for (let cx = 0; cx < cols; cx++) {
      const x = cx * cw, y = ry * ch;
      // per-panel batch variation — fiber cement never matches board to board
      const v = (r() - 0.5) * 0.13;
      g.fillStyle = `rgba(${v > 0 ? '255,255,255' : '0,0,0'},${Math.abs(v).toFixed(3)})`;
      g.fillRect(x, y, cw, ch);
      // faint vertical trowel / orange-peel streaks
      g.globalAlpha = 0.05;
      for (let i = 0; i < 30; i++) {
        g.fillStyle = r() < 0.5 ? '#000' : '#fff';
        g.fillRect(x + r() * cw, y, 1 + r() * 2.5, ch);
      }
      g.globalAlpha = 1;
      // a soft gradient across each panel so the grid reads even in flat light
      const grad = g.createLinearGradient(x, y, x + cw, y + ch);
      grad.addColorStop(0, 'rgba(255,255,255,0.05)');
      grad.addColorStop(1, 'rgba(0,0,0,0.06)');
      g.fillStyle = grad; g.fillRect(x, y, cw, ch);
    }
  }
  // fine aggregate speckle
  for (let i = 0; i < 6000; i++) {
    const v = 140 + Math.floor(r() * 100);
    g.fillStyle = `rgba(${v},${v},${v},${0.05 + r() * 0.10})`;
    g.fillRect(r() * size, r() * size, 1.2, 1.2);
  }
  // open joints: near-black slot, light catch on the panel edge under it
  const joint = (x, y, w, h) => {
    g.fillStyle = 'rgba(9,10,11,0.92)'; g.fillRect(x, y, w, h);
    bg.fillStyle = '#1e1e1e'; bg.fillRect(x, y, w, h);
  };
  for (let cx = 0; cx <= cols; cx++) {
    const x = cx * cw - j / 2;
    joint(x, 0, j, size);
    g.fillStyle = 'rgba(255,255,255,0.20)'; g.fillRect(x + j, 0, 2.0, size);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x - 2.4, 0, 2.4, size);
  }
  for (let ry = 0; ry <= rows; ry++) {
    const y = ry * ch - j / 2;
    joint(0, y, size, j);
    g.fillStyle = 'rgba(255,255,255,0.24)'; g.fillRect(0, y + j, size, 2.2);
    g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(0, y - 3, size, 3);
  }
  // exposed fasteners, 0.09 m in from every panel corner
  const inset = 0.09 * px;
  for (let ry = 0; ry < rows; ry++) {
    for (let cx = 0; cx < cols; cx++) {
      for (const dx of [inset, cw - inset]) {
        for (const dy of [inset, ch - inset]) {
          g.fillStyle = 'rgba(50,52,54,0.6)';
          g.beginPath(); g.arc(cx * cw + dx, ry * ch + dy, 2.6, 0, 7); g.fill();
        }
      }
    }
  }
  return { map: finish(c, tileMeters), bump: finish(b, tileMeters, false), tileMeters };
}

// Composite "wood" plank rainscreen: 0.20 m horizontal boards with a shadow
// gap, printed grain, staggered butt joints.
function plankTexture({ base = '#9a7048', seed = 2, size = 1024, tileMeters = 2.44 } = {}) {
  const px = size / tileMeters;
  const r = rnd32(seed);
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const b = makeCanvas(size, size), bg = b.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  bg.fillStyle = '#c8c8c8'; bg.fillRect(0, 0, size, size);
  const rows = 12, bh = size / rows;
  const gap = Math.max(3, 0.009 * px);
  for (let i = 0; i < rows; i++) {
    const y = i * bh;
    const v = (r() - 0.5) * 0.14;
    g.fillStyle = `rgba(${v > 0 ? '255,235,205' : '20,10,4'},${Math.abs(v).toFixed(3)})`;
    g.fillRect(0, y, size, bh);
    g.globalAlpha = 0.13;
    for (let k = 0; k < 34; k++) {
      g.fillStyle = r() < 0.55 ? '#3a2413' : '#dcb98c';
      g.fillRect(0, y + r() * bh, size, 0.8 + r() * 1.8);
    }
    g.globalAlpha = 1;
    if (r() < 0.55) {
      g.fillStyle = 'rgba(48,30,16,0.34)';
      g.beginPath();
      g.ellipse(r() * size, y + bh * (0.3 + r() * 0.4), 5 + r() * 8, 3 + r() * 4, 0, 0, 7);
      g.fill();
    }
    g.fillStyle = 'rgba(10,7,4,0.72)'; g.fillRect(0, y, size, gap);
    g.fillStyle = 'rgba(255,240,220,0.16)'; g.fillRect(0, y + gap, size, 1.6);
    bg.fillStyle = '#242424'; bg.fillRect(0, y, size, gap);
  }
  for (let i = 0; i < rows; i++) {
    const x = (i % 2) * size / 2;
    g.fillStyle = 'rgba(10,7,4,0.55)'; g.fillRect(x, i * bh, 2.6, bh);
    bg.fillStyle = '#3a3a3a'; bg.fillRect(x, i * bh, 2.6, bh);
  }
  return { map: finish(c, tileMeters), bump: finish(b, tileMeters, false), tileMeters };
}

function ensureMaterials(B) {
  if (B.M.has('infill:panel')) return;
  const p = panelTexture({ base: '#c4c6c7', seed: 8101 });
  const mp = new THREE.MeshStandardMaterial({
    vertexColors: true, map: p.map, bumpMap: p.bump, bumpScale: 0.9,
    roughness: 0.88, metalness: 0.0, envMapIntensity: 0.34,
  });
  mp.userData.tileMeters = p.tileMeters; mp.name = 'infill:panel';
  B.M.set('infill:panel', mp);

  const w = plankTexture({ base: '#9a7048', seed: 8102 });
  const mw = new THREE.MeshStandardMaterial({
    vertexColors: true, map: w.map, bumpMap: w.bump, bumpScale: 0.8,
    roughness: 0.80, metalness: 0.0, envMapIntensity: 0.34,
  });
  mw.userData.tileMeters = w.tileMeters; mw.name = 'infill:wood';
  B.M.set('infill:wood', mw);

  const cg = corrugatedTexture({ base: '#9aa0a4', seed: 8103 });
  const mm = new THREE.MeshStandardMaterial({
    vertexColors: true, map: cg.map, roughness: 0.56, metalness: 0.5, envMapIntensity: 0.6,
  });
  mm.userData.tileMeters = cg.tileMeters; mm.name = 'infill:metal';
  B.M.set('infill:metal', mm);

  // black anodised aluminium — reveals, copings, canopies, rails (tint = colour)
  const ms = new THREE.MeshStandardMaterial({
    vertexColors: true, color: 0xffffff, roughness: 0.56, metalness: 0.38, envMapIntensity: 0.55,
  });
  ms.userData.tileMeters = 1; ms.name = 'infill:sash';
  B.M.set('infill:sash', ms);
}

// ---------------------------------------------------------------------------
// palette — tints multiply the neutral #c4c6c7 panel base
// ---------------------------------------------------------------------------
const TONES = {
  white: [0.79, 0.79, 0.77],
  offwhite: [0.70, 0.68, 0.64],
  lgray: [0.54, 0.56, 0.57],
  mgray: [0.39, 0.41, 0.43],
  greige: [0.46, 0.43, 0.38],
  dgray: [0.24, 0.26, 0.28],
  charcoal: [0.135, 0.145, 0.155],
  black: [0.075, 0.08, 0.085],
};
const WOODS = { oak: [0.74, 0.70, 0.64], walnut: [0.44, 0.40, 0.37], ipe: [0.58, 0.50, 0.42] };

// Half of these buildings clad a field in thin BRICK VENEER — pale grey, buff
// or charcoal — rather than fiber cement. Reuse the shared brick materials so
// the coursing stays at true 0.194 x 0.057 m scale.
const BRICKS = {
  brickWhite: ['brickPaintedCream', [0.95, 0.95, 0.93]],
  brickBuff: ['brickTan', [0.92, 0.93, 0.94]],
  brickGrey: ['brickPaintedGray', [1.05, 1.07, 1.08]],
  brickChar: ['brickBrown', [0.42, 0.44, 0.46]],
};

const COMBOS2 = [
  ['charcoal', 'lgray'], ['charcoal', 'white'], ['dgray', 'offwhite'],
  ['black', 'lgray'], ['charcoal', 'greige'], ['lgray', 'wood'],
  ['charcoal', 'wood'], ['white', 'mgray'], ['black', 'white'],
  ['charcoal', 'brickGrey'], ['black', 'brickWhite'], ['brickBuff', 'charcoal'],
  ['brickGrey', 'wood'], ['brickWhite', 'dgray'], ['brickChar', 'white'],
];
const COMBOS3 = [
  ['lgray', 'charcoal', 'wood'], ['white', 'mgray', 'wood'],
  ['charcoal', 'white', 'wood'], ['dgray', 'lgray', 'metal'],
  ['white', 'charcoal', 'metal'], ['mgray', 'offwhite', 'charcoal'],
  ['charcoal', 'lgray', 'white'], ['greige', 'charcoal', 'wood'],
  ['black', 'lgray', 'wood'],
  ['brickGrey', 'charcoal', 'wood'], ['brickWhite', 'charcoal', 'lgray'],
  ['brickBuff', 'dgray', 'white'], ['charcoal', 'brickWhite', 'metal'],
  ['brickChar', 'white', 'wood'],
];

function fieldSpec(name, rng) {
  if (name === 'wood') {
    const k = rng.pick(['oak', 'walnut', 'ipe']);
    return { mat: 'infill:wood', tint: new THREE.Color(...WOODS[k]) };
  }
  if (name === 'metal') {
    return { mat: 'infill:metal', tint: new THREE.Color(0.62, 0.65, 0.68) };
  }
  if (BRICKS[name]) {
    const [m, t] = BRICKS[name];
    return { mat: m, tint: new THREE.Color(...t) };
  }
  return { mat: 'infill:panel', tint: new THREE.Color(...TONES[name]) };
}

// ---------------------------------------------------------------------------
// private instanced parts
// ---------------------------------------------------------------------------
// Projecting metal "picture frame" around a window group.
function pictureFrame(B, w, h) {
  w = q05(w); h = q05(h);
  const id = `infill:pf:${w}x${h}`;
  if (!B.hasPart(id)) {
    const t = 0.12, d = 0.16;
    const items = [
      { geom: box(w + t * 2, t, d), x: 0, y: h, z: d / 2 },
      { geom: box(w + t * 2, t, d), x: 0, y: -t, z: d / 2 },
      { geom: box(t, h + t, d), x: -(w + t) / 2, y: 0, z: d / 2 },
      { geom: box(t, h + t, d), x: (w + t) / 2, y: 0, z: d / 2 },
    ];
    B.definePart(id, compose(items), 'infill:sash');
  }
  return id;
}

// Juliet guard: flat bar top rail + slim pickets, 1.07 m, held off the glass.
function julietPart(B, w) {
  w = q05(w + 0.26);
  const id = `infill:jul:${w}`;
  if (!B.hasPart(id)) {
    const H = 1.07, z = 0.11;
    const items = [
      { geom: box(w, 0.055, 0.04), x: 0, y: H - 0.055, z },
      { geom: box(w, 0.03, 0.028), x: 0, y: 0.07, z },
    ];
    for (const s of [-1, 1]) {
      items.push({ geom: box(0.055, H, 0.055), x: s * (w / 2 - 0.028), y: 0, z });
      items.push({ geom: box(0.05, 0.05, z), x: s * (w / 2 - 0.028), y: H - 0.11, z: z / 2 });
      items.push({ geom: box(0.05, 0.05, z), x: s * (w / 2 - 0.028), y: 0.07, z: z / 2 });
    }
    const n = Math.max(3, Math.round((w - 0.16) / 0.115));
    for (let i = 1; i < n; i++) {
      items.push({ geom: box(0.02, H - 0.10, 0.02), x: -w / 2 + (w / n) * i, y: 0.07, z });
    }
    B.definePart(id, compose(items), 'infill:sash');
  }
  return id;
}

// Frameless-glass Juliet guard — a slim aluminium cap and shoe with a glass
// panel between. The default on every new Brooklyn condo since ~2015.
function julietGlassParts(B, w) {
  w = q05(w + 0.26);
  const fid = `infill:julg:${w}`;
  const gid = `infill:julp:${w}`;
  if (!B.hasPart(fid)) {
    const H = 1.07, z = 0.12;
    const items = [
      { geom: box(w, 0.06, 0.08), x: 0, y: H - 0.06, z },
      { geom: box(w, 0.11, 0.09), x: 0, y: 0.0, z },
    ];
    for (const s of [-1, 1]) {
      items.push({ geom: box(0.06, 0.06, z), x: s * (w / 2 - 0.03), y: H - 0.12, z: z / 2 });
      items.push({ geom: box(0.06, 0.06, z), x: s * (w / 2 - 0.03), y: 0.03, z: z / 2 });
    }
    B.definePart(fid, compose(items), 'infill:sash');
    const g = quad(w - 0.07, H - 0.18);
    g.translate(0, 0.11, z);
    B.definePart(gid, g, 'glass', { castShadow: false });
  }
  return [fid, gid];
}

// Bolt-on steel balcony: thin slab, perimeter bar rail, two tie rods.
function balconyPart(B, w) {
  w = q05(w + 0.6);
  const id = `infill:balc:${w}`;
  if (!B.hasPart(id)) {
    const d = 1.25, H = 1.07, t = 0.11;
    const items = [{ geom: box(w, t, d), x: 0, y: -t, z: d / 2 }];
    items.push({ geom: box(w + 0.05, 0.18, 0.05), x: 0, y: -t - 0.035, z: d });
    items.push({ geom: box(w, 0.055, 0.045), x: 0, y: H - 0.055, z: d - 0.025 });
    items.push({ geom: box(0.045, 0.055, d), x: -w / 2 + 0.023, y: H - 0.055, z: d / 2 });
    items.push({ geom: box(0.045, 0.055, d), x: w / 2 - 0.023, y: H - 0.055, z: d / 2 });
    for (const s of [-1, 1]) {
      items.push({ geom: box(0.055, H, 0.055), x: s * (w / 2 - 0.028), y: 0, z: d - 0.03 });
      items.push({ geom: box(0.055, H, 0.055), x: s * (w / 2 - 0.028), y: 0, z: 0.03 });
    }
    const n = Math.max(4, Math.round((w - 0.1) / 0.115));
    for (let i = 1; i < n; i++) {
      items.push({ geom: box(0.018, H - 0.09, 0.018), x: -w / 2 + (w / n) * i, y: 0.05, z: d - 0.03 });
    }
    for (let i = 1; i < 10; i++) {
      const z = (d / 10) * i;
      for (const s of [-1, 1]) items.push({ geom: box(0.018, H - 0.09, 0.018), x: s * (w / 2 - 0.028), y: 0.05, z });
    }
    for (const s of [-1, 1]) {
      const L = Math.hypot(d, 0.8);
      const g = cylinder(0.018, 0.018, L, 6);
      g.rotateX(-Math.atan2(d, 0.8));
      items.push({ geom: g, x: s * (w / 2 - 0.09), y: -t, z: 0.02 });
    }
    B.definePart(id, compose(items), 'infill:sash');
  }
  return id;
}

// Roof / terrace safety rail: posts at 1.5 m with three horizontal bars.
function railPart(B, len) {
  len = Math.max(1.5, Math.round(len * 2) / 2);
  const id = `infill:rail:${len}`;
  if (!B.hasPart(id)) {
    const H = 1.07;
    const items = [];
    for (const y of [H - 0.04, H * 0.66, H * 0.33]) {
      items.push({ geom: box(len, 0.04, 0.04), x: 0, y, z: 0 });
    }
    const n = Math.max(2, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) {
      items.push({ geom: box(0.055, H, 0.055), x: -len / 2 + (len / n) * i, y: 0, z: 0 });
    }
    B.definePart(id, compose(items), 'infill:sash');
  }
  return id;
}

// Flat steel entry canopy on two tie rods, with a recessed downlight slot.
function canopyPart(B, w) {
  w = q05(w + 0.7);
  const id = `infill:canopy:${w}`;
  if (!B.hasPart(id)) {
    const d = 1.25;
    const items = [
      { geom: box(w, 0.09, d), x: 0, y: 0, z: d / 2 },
      { geom: box(w + 0.04, 0.15, 0.05), x: 0, y: -0.03, z: d },
    ];
    for (const s of [-1, 1]) {
      const L = Math.hypot(d - 0.15, 1.0);
      const g = cylinder(0.02, 0.02, L, 6);
      g.rotateX(-Math.atan2(d - 0.15, 1.0));
      items.push({ geom: g, x: s * (w / 2 - 0.15), y: 0.09, z: 0.02 });
    }
    B.definePart(id, compose(items), 'infill:sash');
  }
  return id;
}

// Through-wall PTAC louvre grille — the giveaway of a cheap NYC condo.
function ptacPart(B) {
  const id = 'infill:ptac';
  if (!B.hasPart(id)) {
    const w = 0.95, h = 0.38;
    const items = [{ geom: box(w, h, 0.05), x: 0, y: 0, z: -0.025 }];
    for (let i = 0; i < 5; i++) {
      const l = box(w - 0.09, 0.030, 0.035);
      items.push({ geom: l, x: 0, y: 0.05 + i * 0.058, z: 0.012 });
    }
    items.push({ geom: box(w + 0.05, 0.045, 0.06), x: 0, y: h - 0.02, z: 0.02 });
    items.push({ geom: box(w + 0.05, 0.04, 0.07), x: 0, y: -0.03, z: 0.025 });
    B.definePart(id, compose(items), 'infill:sash');
  }
  return id;
}

const RECESS = 0.15;

// A big single pane of glass reads as a blank panel. Real units of this size
// are split by a slim aluminium mullion and (when tall) a transom bar; drop
// them into the sash plane of a kit window.
function glazingBars(B, F, x, y, w, h, zf, tint) {
  const fz = zf - RECESS + 0.045;
  if (w >= 1.25) {
    B.addMerged('infill:sash', box(0.05, h - 0.17, 0.058), at(F, x, y + 0.09, fz),
      { tint, worldUV: false });
  }
  if (h >= 2.25) {
    B.addMerged('infill:sash', box(w - 0.15, 0.05, 0.058), at(F, x, y + h * 0.79, fz),
      { tint, worldUV: false });
  }
}

// The kit gives every window a randomly-toned interior back panel, which on a
// modern facade reads as beige/taupe/grey noise across one plane of identical
// glass. Park an opaque near-black room box in front of it so the whole
// facade shares one glass value; the kit's roller blind still shows through.
function roomPart(B, w, h) {
  w = q05(w); h = q05(h);
  const id = `infill:room:${w}x${h}`;
  if (!B.hasPart(id)) {
    const back = box(w + 0.10, h + 0.10, 0.03);
    const ceil = box(w + 0.08, 0.05, 0.50);
    ensureColor(ceil, new THREE.Color(2.6, 2.5, 2.3));      // catches the room light
    const items = [
      { geom: back, x: 0, y: -0.05, z: -0.01 },
      { geom: ceil, x: 0, y: h * 0.86, z: -0.28 },
    ];
    B.definePart(id, compose(items), 'paintFlat', { castShadow: false });
  }
  return id;
}

// The kit drops a half-drawn shade on a fixed 2-in-5 cycle, which lines the
// blinds up in bands down a facade. Mask every one of them with a dark panel
// and re-issue our own at varied drops, so no two in a column match.
const BLIND_DROPS = [0.30, 0.0, 0.52, 0.0, 0.0, 0.40, 0.18, 0.0, 0.0, 0.58, 0.0, 0.34];
function blindPart(B, w) {
  w = q05(w);
  const id = `infill:blind:${w}`;
  if (!B.hasPart(id)) {
    B.definePart(id, box(w - 0.09, 1.0, 0.012), 'paintFlat', { castShadow: false });
  }
  return id;
}
function blinds(B, F, x, y, w, h, zf, roomTint, blindTint, k) {
  const id = blindPart(B, w);
  const zz = zf - RECESS + 0.014;                       // between shade and glass
  const top = h - 0.075;
  const cy = 0.55 * top - 0.02, ch = top - cy + 0.03;
  B.addInstance(id, at(F, x, y + cy, zz).multiply(tmat(0, 0, 0, 0, 1, ch, 1)), roomTint);
  const d = BLIND_DROPS[k % BLIND_DROPS.length] * top;
  if (d > 0.05) {
    B.addInstance(id, at(F, x, y + top - d, zz + 0.002).multiply(tmat(0, 0, 0, 0, 1, d, 1)), blindTint);
  }
}

// Rooftop packaged unit with a louvred face and a fan cowl.
function mechPart(B) {
  const id = 'infill:mech';
  if (!B.hasPart(id)) {
    const items = [];
    const g = box(2.3, 1.5, 1.4); boxUV(g, 2.3, 1.5, 1.4, 1);
    items.push({ geom: g, x: 0, y: 0.12, z: 0 });
    for (const s of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const l = box(2.0, 0.06, 0.05);
        ensureColor(l, new THREE.Color(0.42, 0.44, 0.46));
        items.push({ geom: l, x: 0, y: 0.32 + i * 0.16, z: s * 0.72 });
      }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const f = box(0.12, 0.14, 0.12);
      ensureColor(f, new THREE.Color(0.3, 0.3, 0.31));
      items.push({ geom: f, x: sx * 0.95, y: 0, z: sz * 0.55 });
    }
    const cowl = cylinder(0.42, 0.42, 0.22, 12);
    ensureColor(cowl, new THREE.Color(0.55, 0.57, 0.58));
    items.push({ geom: cowl, x: 0.5, y: 1.62, z: 0 });
    B.definePart(id, compose(items), 'infill:metal');
  }
  return id;
}

// ---------------------------------------------------------------------------
export function generate(ctx, lot, rng) {
  const { kit: K, batcher: B } = ctx;
  ensureMaterials(B);

  const W = lot.width;
  const D = Math.max(10, lot.depth || 16);
  const F = lot.frame;
  const commercial = !!lot.commercial;
  const side = lot.mirror ? -1 : 1;

  const floors = Math.max(4, Math.min(8,
    lot.stories || rng.weighted([[4, 16], [5, 26], [6, 26], [7, 20], [8, 12]])));
  const gH = q05(commercial ? rng.range(4.3, 4.8) : rng.range(3.55, 4.05));
  const uH = q05(rng.range(3.02, 3.24));
  const setback = floors >= 5 ? rng.bool(0.85) : rng.bool(0.4);
  const nBody = floors - (setback ? 1 : 0);
  const Hbody = gH + uH * (nBody - 1);
  const SB = setback ? q05(rng.range(1.7, 2.6)) : 0;
  const Htop = setback ? Hbody + uH : Hbody;
  const PAR = q05(rng.range(0.95, 1.25));

  // ---- cladding fields --------------------------------------------------
  const nF = W < 6.5 ? 1 : W < 11 ? (rng.bool(0.62) ? 2 : 3) : rng.weighted([[2, 32], [3, 68]]);
  let names = nF === 1 ? [rng.pick(['lgray', 'charcoal', 'white', 'greige'])]
    : nF === 2 ? rng.pick(COMBOS2) : rng.pick(COMBOS3);
  names = names.slice(0, nF);
  const cuts = [-W / 2];
  if (nF === 2) cuts.push(q05(-W / 2 + W * rng.range(0.34, 0.62)));
  if (nF === 3) {
    cuts.push(q05(-W / 2 + W * rng.range(0.22, 0.38)));
    cuts.push(q05(-W / 2 + W * rng.range(0.58, 0.78)));
  }
  cuts.push(W / 2);
  const fields = [];
  for (let i = 0; i < nF; i++) {
    const s = fieldSpec(names[i], rng);
    fields.push({
      ...s, x0: cuts[i], x1: cuts[i + 1], w: cuts[i + 1] - cuts[i],
      cx: (cuts[i] + cuts[i + 1]) / 2,
      z: i === 0 ? 0 : q05(rng.pick([-0.20, -0.28, 0.16, -0.24])),
    });
  }
  if (nF > 1) {
    if (fields.every((f) => f.z === fields[0].z)) fields[nF - 1].z = -0.24;
    // guarantee real value contrast — a flat mid-gray building reads as CG
    const ls = fields.map((f) => lum(f.tint));
    if (Math.max(...ls) - Math.min(...ls) < 0.34) {
      const i = ls.indexOf(Math.min(...ls));
      Object.assign(fields[i], fieldSpec('charcoal', rng));
    }
  }

  const trimTint = new THREE.Color(0.085, 0.09, 0.095);           // black aluminium
  const copeTint = rng.bool(0.62) ? new THREE.Color(0.10, 0.105, 0.11)
    : new THREE.Color(0.26, 0.275, 0.285);
  const sashTint = new THREE.Color(0.085, 0.09, 0.095);
  const roomTint = new THREE.Color(0.055, 0.058, 0.062);
  const blindTint = new THREE.Color(rng.range(0.42, 0.58), rng.range(0.40, 0.55), rng.range(0.37, 0.50));
  let winK = 0;
  const glassTint = new THREE.Color(rng.range(0.34, 0.52), rng.range(0.42, 0.58), rng.range(0.50, 0.66));
  const baseSpec = fieldSpec(rng.weighted([['black', 40], ['charcoal', 34], ['dgray', 26]]), rng);
  const shellTint = new THREE.Color(0.88, 0.88, 0.86);
  const julGlass = rng.bool(0.58);
  const railGlassTint = new THREE.Color(0.62, 0.72, 0.78);
  const placeJuliet = (x, y, w, z) => {
    if (julGlass) {
      const [fid, gid] = julietGlassParts(B, w);
      B.addInstance(fid, at(F, x, y, z), trimTint);
      B.addInstance(gid, at(F, x, y, z), railGlassTint);
    } else {
      B.addInstance(julietPart(B, w), at(F, x, y, z), trimTint);
    }
  };

  // ---- window schedule per field ----------------------------------------
  const patterns = fields.map((f) => {
    const bays = Math.max(1, Math.min(3, Math.round(f.w / 3.4)));
    const bw = f.w / bays;
    const opts = [['single', 16]];
    if (bw >= 2.5) opts.push(['strip', 20]);
    if (bw >= 2.9) opts.push(['pair', 46]);
    if (bw >= 3.9) opts.push(['twin', 18]);
    opts.push(['tall', bw >= 2.5 ? 30 : 16]);
    return {
      bays, bw, kind: rng.weighted(opts),
      asym: rng.range(-0.65, 0.65),
      flip: rng.bool(0.5),
      alt: rng.bool(0.35),
      balc: false,
      frame: rng.bool(0.40),
      ptac: rng.bool(0.55),
    };
  });
  // guarantee the building has at least one balcony / Juliet feature
  if (!patterns.some((p) => p.kind === 'tall')) {
    const i = rng.int(0, patterns.length - 1);
    if (patterns[i].bw >= 2.4) patterns[i].kind = 'tall'; else patterns[i].balc = true;
  }
  if (rng.bool(0.45)) patterns[rng.int(0, patterns.length - 1)].balc = true;

  // Returns [{x, w, h, y0, juliet}] in FIELD-local x for one bay of one floor.
  function groupFor(p, bayCx, floorIdx) {
    const flip = p.flip !== (p.alt && floorIdx % 2 === 1);
    const s = flip ? 1 : -1;
    const bw = p.bw;
    const out = [];
    const head = 0.46;                       // head-to-slab dimension
    const push = (x, w, h, sill) => out.push({ x: bayCx + x, w: snap(WINW, w), h: snap(WINH, h), y0: sill });
    if (p.kind === 'tall') {
      const w = snap(WINW, Math.min(1.80, bw - 1.15));
      const h = 2.45;
      push(((bw - w) / 2 - 0.28) * p.asym, w, h, Math.max(0.10, uH - head - h));
      out[0].juliet = true;
    } else if (p.kind === 'pair') {
      const w1 = snap(WINW, Math.min(1.80, bw * 0.48));
      const w2 = 0.55, gap = 0.10;
      const tot = w1 + gap + w2;
      const ox = ((bw - tot) / 2 - 0.36) * p.asym;
      const h = rng.bool(0.62) ? 2.20 : 1.90;
      const sill = Math.max(0.30, uH - head - h);
      push(ox - s * (tot / 2 - w1 / 2), w1, h, sill);
      push(ox + s * (tot / 2 - w2 / 2), w2, h, sill);
    } else if (p.kind === 'twin') {
      const w = snap(WINW, Math.min(1.30, (bw - 1.25) / 2));
      const gap = 0.75;
      const ox = ((bw - (w * 2 + gap)) / 2 - 0.30) * p.asym;
      const h = 1.90;
      const sill = Math.max(0.30, uH - head - h);
      push(ox - (w + gap) / 2, w, h, sill);
      push(ox + (w + gap) / 2, w, h, sill);
    } else if (p.kind === 'strip') {
      const w = snap(WINW, Math.min(2.30, bw - 0.95));
      const h = 1.55;
      push(((bw - w) / 2 - 0.26) * p.asym, w, h, Math.max(0.85, uH - head - h));
    } else {
      const w = snap(WINW, Math.min(1.30, bw - 0.95));
      const h = 1.90;
      push(((bw - w) / 2 - 0.30) * p.asym, w, h, Math.max(0.40, uH - head - h));
    }
    return out;
  }

  // ---- ground floor layout ----------------------------------------------
  const entryW = q05(rng.range(2.20, 2.80));
  const hasGate = !commercial && W >= 9.5 && rng.bool(0.6);
  const gateW = hasGate ? q05(rng.range(2.9, 3.5)) : 0;
  const restW = W - entryW - gateW;
  let entryX, gateX, restX;
  if (side > 0) {
    restX = -W / 2 + restW / 2;
    gateX = -W / 2 + restW + gateW / 2;
    entryX = W / 2 - entryW / 2;
  } else {
    entryX = -W / 2 + entryW / 2;
    gateX = -W / 2 + entryW + gateW / 2;
    restX = W / 2 - restW / 2;
  }
  const entryH = 2.95, entryRec = 0.60;
  const gateH = 2.60;

  // ======================================================================
  // GROUND FLOOR — near-black base
  // ======================================================================
  {
    const ops = [{ x: entryX, w: entryW, y0: 0.0, y1: entryH }];
    if (hasGate) ops.push({ x: gateX, w: gateW, y0: 0.0, y1: gateH });
    let restOps = [];
    if (commercial) {
      const sw = Math.max(2.4, restW - 0.9);
      restOps = [{ x: restX, w: sw, y0: 0.10, y1: 3.35 }];
    } else if (restW > 2.4) {
      const n = Math.max(1, Math.round(restW / 4.6));
      const w = snap(WINW, Math.min(2.80, (restW - 0.85 * (n + 1)) / n));
      for (let i = 0; i < n; i++) {
        const x = restX - restW / 2 + (restW / n) * (i + 0.5);
        restOps.push({ x, w, y0: 0.62, y1: 0.62 + 2.35 });
      }
    }
    const all = [...ops, ...restOps].sort((a, b) => a.x - b.x);
    punchedWall(ctx, F, {
      width: W, height: gH, depth: 0.46, mat: baseSpec.mat, tint: baseSpec.tint,
      rows: [{ y0: 0, y1: gH - 0.22, openings: all }], grime: 0.30, zFace: -0.06,
    });

    // ---- entry: deep reveal, full-glass door + sidelight + transom -------
    {
      const EF = at(F, entryX, 0, -0.06);
      const rev = new THREE.Color(0.075, 0.075, 0.08);
      B.addMerged('infill:sash', box(entryW + 0.06, 0.06, entryRec),
        EF.clone().multiply(tmat(0, entryH - 0.06, -entryRec)), { tint: rev, worldUV: false });
      for (const s of [-1, 1]) {
        B.addMerged('infill:sash', box(0.06, entryH, entryRec),
          EF.clone().multiply(tmat(s * (entryW / 2 - 0.03), 0, -entryRec)), { tint: rev, worldUV: false });
      }
      B.addMerged('paintFlat', box(entryW - 0.1, 0.04, entryRec),
        EF.clone().multiply(tmat(0, 0, -entryRec)), { tint: new THREE.Color(0.16, 0.16, 0.17), worldUV: false });
      const gw = entryW - 0.14, gh = entryH - 0.14;
      // lobby interior: back wall, warm ceiling wash — then the glass over it
      B.addMerged('paintFlat', box(gw + 0.3, gh, 0.05),
        EF.clone().multiply(tmat(0, 0.04, -entryRec - 2.0)), { tint: new THREE.Color(0.34, 0.29, 0.23), worldUV: false });
      B.addMerged('paintFlat', box(gw + 0.3, 0.05, 2.0),
        EF.clone().multiply(tmat(0, 0.02, -entryRec - 1.0)), { tint: new THREE.Color(0.22, 0.20, 0.18), worldUV: false });
      B.addMerged('litWindow', box(gw * 0.85, 0.06, 0.3),
        EF.clone().multiply(tmat(0, gh - 0.22, -entryRec - 0.8)), { tint: new THREE.Color(1, 0.9, 0.74), worldUV: false });
      B.addMerged('glass', quad(gw, gh), EF.clone().multiply(tmat(0, 0.04, -entryRec + 0.06)),
        { tint: glassTint, worldUV: false });
      const dW = Math.min(1.05, gw * 0.55);
      for (const mx of [-gw / 2, -dW / 2, dW / 2, gw / 2]) {
        B.addMerged('infill:sash', box(0.065, gh, 0.08),
          EF.clone().multiply(tmat(mx, 0.04, -entryRec + 0.09)), { tint: trimTint, worldUV: false });
      }
      for (const my of [0.04, gh * 0.72, gh]) {
        B.addMerged('infill:sash', box(gw, 0.065, 0.08),
          EF.clone().multiply(tmat(0, my - 0.033, -entryRec + 0.09)), { tint: trimTint, worldUV: false });
      }
      B.addMerged('infill:sash', box(0.05, 1.0, 0.05),
        EF.clone().multiply(tmat(dW / 2 - 0.16, 0.95, -entryRec + 0.17)), { tint: trimTint, worldUV: false });
      B.addInstance(canopyPart(B, entryW), at(F, entryX, entryH + 0.16, -0.06), trimTint);
      // brushed-steel address / intercom plate
      B.addMerged('infill:sash', box(0.50, 0.30, 0.03),
        at(F, entryX + side * (entryW / 2 + 0.40), 2.35, -0.03),
        { tint: new THREE.Color(0.55, 0.56, 0.57), worldUV: false });
    }

    // ---- parking gate ----------------------------------------------------
    if (hasGate) {
      const GF = at(F, gateX, 0, -0.06);
      B.addMerged('paintFlat', box(gateW + 0.1, gateH + 0.3, 0.30),
        GF.clone().multiply(tmat(0, 0, -0.34)), { tint: new THREE.Color(0.05, 0.05, 0.055), worldUV: false });
      const gq = quad(gateW - 0.06, gateH - 0.24);
      const gu = gq.attributes.uv;
      for (let i = 0; i < gu.count; i++) gu.setXY(i, gu.getX(i) * (gateW - 0.06), gu.getY(i) * (gateH - 0.24));
      B.addMerged('infill:metal', gq, GF.clone().multiply(tmat(0, 0.06, -0.11)),
        { tint: new THREE.Color(0.30, 0.32, 0.33), worldUV: false });
      B.addMerged('infill:sash', box(gateW + 0.14, 0.32, 0.18),
        GF.clone().multiply(tmat(0, gateH - 0.28, -0.06)), { tint: trimTint, worldUV: false });
      B.addMerged('paintFlat', box(gateW + 0.2, 0.03, 0.55),
        GF.clone().multiply(tmat(0, 0.001, 0.22)), { tint: new THREE.Color(0.10, 0.10, 0.10), worldUV: false });
    }

    // ---- retail / ground-floor units --------------------------------------
    if (commercial && restW > 3.0) {
      K.storefront({
        width: restW - 0.2, signIndex: rng.int(0, 31),
        awningIndex: rng.bool(0.35) ? rng.int(0, 7) : -1,
        gate: rng.bool(0.15) ? 1 : 0, entrySide: side,
      }, at(F, restX, 0, -0.06), { frameTint: trimTint });
    } else if (!commercial) {
      for (const o of restOps) {
        K.window({ w: o.w, h: o.y1 - o.y0, style: 'fixed', recess: RECESS },
          at(F, o.x, o.y0, -0.06), { tint: sashTint, glassTint });
        B.addInstance(roomPart(B, o.w, o.y1 - o.y0), at(F, o.x, o.y0, -0.23), roomTint);
        blinds(B, F, o.x, o.y0, o.w, o.y1 - o.y0, -0.06, roomTint, blindTint, winK++);
        glazingBars(B, F, o.x, o.y0, o.w, o.y1 - o.y0, -0.06, sashTint);
        B.addMerged('infill:sash', box(o.w + 0.14, 0.055, 0.09),
          at(F, o.x, o.y0 - 0.055, -0.03), { tint: trimTint, worldUV: false });
      }
    }

    // horizontal reveal band capping the base
    B.addMerged('infill:sash', box(W, 0.14, 0.12), at(F, 0, gH - 0.22, 0.05),
      { tint: copeTint, worldUV: false });
    B.addMerged('paintFlat', box(W, 0.08, 0.05), at(F, 0, gH - 0.08, -0.03),
      { tint: new THREE.Color(0.07, 0.07, 0.07), worldUV: false });

    // ---- service kit: FDNY siamese, gas meter cabinet, splashback ---------
    const svcX = -side * (W / 2 - 0.75);
    K.siamese(at(F, svcX, 0.14, 0.30), { tint: new THREE.Color(0.52, 0.13, 0.11) });
    B.addMerged('paintFlat', box(0.90, 0.62, 0.26), at(F, svcX - side * 1.25, 0.55, 0.07),
      { tint: new THREE.Color(0.42, 0.43, 0.44), worldUV: false });
    for (let i = 0; i < 3; i++) {
      B.addMerged('paintFlat', box(0.16, 0.16, 0.06), at(F, svcX - side * 1.25 - 0.28 + i * 0.28, 0.85, 0.19),
        { tint: new THREE.Color(0.62, 0.63, 0.64), worldUV: false });
    }
    // precast plinth: every one of these has a 0.5-0.7 m dark base course,
    // broken around the doorways and the gate
    {
      const holes = all.filter((o) => o.y0 < 0.55)
        .map((o) => [o.x - o.w / 2 - 0.02, o.x + o.w / 2 + 0.02])
        .sort((a, b) => a[0] - b[0]);
      let px = -W / 2;
      const segs = [];
      for (const [h0, h1] of holes) {
        if (h0 > px + 0.05) segs.push([px, h0]);
        px = Math.max(px, h1);
      }
      if (px < W / 2 - 0.05) segs.push([px, W / 2]);
      for (const [a, b2] of segs) {
        const sw2 = b2 - a, cx = (a + b2) / 2;
        B.addMerged('graniteBase', box(sw2, 0.58, 0.10), at(F, cx, 0, 0.03),
          { tint: new THREE.Color(0.46, 0.46, 0.45), grime: 0.35 });
        B.addMerged('paintFlat', box(sw2, 0.035, 0.035), at(F, cx, 0.58, 0.025),
          { tint: new THREE.Color(0.09, 0.09, 0.09), worldUV: false });
        B.addMerged('paintFlat', box(sw2 - 0.06, 0.30, 0.010), at(F, cx, 0.02, 0.086),
          { tint: new THREE.Color(0.30, 0.29, 0.27), worldUV: false });
      }
    }
  }

  // ======================================================================
  // UPPER FIELDS
  // ======================================================================
  const nUp = nBody - 1;
  const ptacId = ptacPart(B);
  for (let fi = 0; fi < fields.length; fi++) {
    const f = fields[fi], p = patterns[fi];
    const rows = [];
    const placed = [];
    for (let u = 0; u < nUp; u++) {
      const yLocal = u * uH;
      const all = [];
      for (let b = 0; b < p.bays; b++) {
        const bayCx = -f.w / 2 + p.bw * (b + 0.5);
        all.push(...groupFor(p, bayCx, u + b));
      }
      const ops = all.map((o) => ({ x: o.x, w: o.w, y0: yLocal + o.y0, y1: yLocal + o.y0 + o.h }))
        .sort((a, b) => a.x - b.x);
      const lo = Math.min(...ops.map((o) => o.y0)) - 0.02;
      const hi = Math.max(...ops.map((o) => o.y1)) + 0.02;
      rows.push({ y0: lo, y1: hi, openings: ops });
      placed.push({ u, grp: all, yAbs: gH + yLocal });
    }
    punchedWall(ctx, at(F, f.cx, gH, 0), {
      width: f.w, height: nUp * uH, depth: 0.42, mat: f.mat, tint: f.tint,
      rows, grime: 0.0, zFace: f.z,
    });

    for (const { u, grp, yAbs } of placed) {
      // group the openings by bay so frames/rails wrap the right set
      for (let b = 0; b < p.bays; b++) {
        const bayCx = -f.w / 2 + p.bw * (b + 0.5);
        const g2 = grp.filter((o) => Math.abs(o.x - bayCx) < p.bw / 2 + 0.01);
        if (!g2.length) continue;
        let gx0 = Infinity, gx1 = -Infinity, gy1 = -Infinity, gy0 = Infinity;
        for (const o of g2) {
          const x = f.cx + o.x;
          K.window({ w: o.w, h: o.h, style: 'fixed', recess: RECESS },
            at(F, x, yAbs + o.y0, f.z), { tint: sashTint, glassTint });
          B.addInstance(roomPart(B, o.w, o.h), at(F, x, yAbs + o.y0, f.z - 0.17), roomTint);
          blinds(B, F, x, yAbs + o.y0, o.w, o.h, f.z, roomTint, blindTint, winK++);
          glazingBars(B, F, x, yAbs + o.y0, o.w, o.h, f.z, sashTint);
          gx0 = Math.min(gx0, x - o.w / 2); gx1 = Math.max(gx1, x + o.w / 2);
          gy0 = Math.min(gy0, yAbs + o.y0); gy1 = Math.max(gy1, yAbs + o.y0 + o.h);
          if (o.juliet) placeJuliet(x, yAbs + o.y0 + 0.06, o.w, f.z);
          // sill runoff — the grey streak every one of these grows in a year
          if ((u + b) % 3 !== 2 && o.w >= 1.0) {
            B.addMerged('paintFlat', box(o.w * 0.86, 0.42, 0.008),
              at(F, x, yAbs + o.y0 - 0.44, f.z + 0.006),
              { tint: new THREE.Color(0.26, 0.25, 0.23), worldUV: false });
          }
        }
        // slim aluminium mullion over the pier between paired sashes
        if (g2.length === 2) {
          const a = g2[0], c = g2[1];
          const gap = Math.abs(c.x - a.x) - (a.w + c.w) / 2;
          if (gap < 0.22) {
            B.addMerged('infill:sash', box(gap + 0.03, a.h, 0.055),
              at(F, f.cx + (a.x + c.x) / 2, yAbs + a.y0, f.z + 0.02), { tint: trimTint, worldUV: false });
          }
        }
        if (p.frame) {
          B.addInstance(pictureFrame(B, gx1 - gx0, gy1 - gy0), at(F, (gx0 + gx1) / 2, gy0, f.z), copeTint);
        } else {
          B.addMerged('infill:sash', box(gx1 - gx0 + 0.20, 0.055, 0.09),
            at(F, (gx0 + gx1) / 2, gy0 - 0.055, f.z + 0.005), { tint: trimTint, worldUV: false });
        }
        if (p.balc && b === 0 && u > 0 && !g2[0].juliet) {
          B.addInstance(balconyPart(B, g2[0].w), at(F, f.cx + g2[0].x, yAbs + g2[0].y0 + 0.03, f.z), trimTint);
        }
        // PTAC sleeve under some sashes — never a perfect matrix
        const pk = (u * 5 + b * 3 + fi * 7) % 8;
        if (p.ptac && pk < 4 && !g2[0].juliet && g2[0].y0 > 0.62) {
          const drop = 0.40;
          B.addInstance(ptacId, at(F, f.cx + g2[0].x, yAbs + g2[0].y0 - drop, f.z + 0.01),
            new THREE.Color(0.21, 0.215, 0.22));
          B.addMerged('paintFlat', box(1.10, 0.50, 0.03),
            at(F, f.cx + g2[0].x, yAbs + g2[0].y0 - drop - 0.06, f.z + 0.004),
            { tint: new THREE.Color(0.07, 0.07, 0.075), worldUV: false });
          B.addMerged('paintFlat', box(0.62, 0.30, 0.008),
            at(F, f.cx + g2[0].x, yAbs + g2[0].y0 - drop - 0.32, f.z + 0.006),
            { tint: new THREE.Color(0.24, 0.23, 0.21), worldUV: false });
        }
      }
    }

    // reveal trim in the joint between fields + a full-height leader pipe
    if (fi > 0) {
      const prev = fields[fi - 1];
      const zf = Math.max(prev.z, f.z);
      const dz = Math.abs(prev.z - f.z) + 0.12;
      B.addMerged('infill:sash', box(0.06, nUp * uH + 0.24, dz),
        at(F, f.x0, gH - 0.12, zf + 0.03), { tint: copeTint, worldUV: false });
      if (fi === 1) {
        B.addMerged('infill:sash', box(0.13, Hbody - gH + 0.1, 0.10),
          at(F, f.x0 + 0.12, gH - 0.05, zf + 0.09), { tint: new THREE.Color(0.30, 0.31, 0.32), worldUV: false });
      }
    }
    // metal cap over the top of each field
    B.addMerged('infill:sash', box(f.w + 0.02, 0.12, 0.18),
      at(F, f.cx, Hbody - 0.12, f.z + 0.07), { tint: copeTint, worldUV: false });

    // ---- surface history: nothing in Bushwick stays factory-clean ----------
    // soot shadow under the cap, rain wash at the foot of the field, and a few
    // long drip streaks on the panel-joint pitch
    B.addMerged('paintFlat', box(f.w, 0.55, 0.008), at(F, f.cx, Hbody - 0.68, f.z + 0.008),
      { tint: new THREE.Color(0.30, 0.29, 0.27), worldUV: false });
    B.addMerged('paintFlat', box(f.w, 0.85, 0.008), at(F, f.cx, gH - 0.10, f.z + 0.008),
      { tint: new THREE.Color(0.34, 0.33, 0.31), worldUV: false });
    const nStreak = Math.max(2, Math.round(f.w / 2.4));
    for (let i = 0; i < nStreak; i++) {
      const sx = f.x0 + 0.35 + (f.w - 0.7) * ((i + 0.35 + 0.3 * ((i * 5) % 3)) / nStreak);
      const sh = 1.6 + 1.9 * (((i * 7) % 4) / 3);
      const sy = gH + (nUp * uH) - 0.35 - sh - 1.1 * ((i * 3) % 3);
      B.addMerged('paintFlat', box(0.11 + 0.05 * (i % 2), sh, 0.007),
        at(F, sx, Math.max(gH + 0.2, sy), f.z + 0.007),
        { tint: new THREE.Color(0.36, 0.35, 0.33), worldUV: false });
    }
    // corner trim closing the cladding at the party walls
    if (fi === 0 || fi === fields.length - 1) {
      const cx = fi === 0 ? -W / 2 + 0.035 : W / 2 - 0.035;
      B.addMerged('infill:sash', box(0.07, nUp * uH + 0.24, 0.16),
        at(F, cx, gH - 0.12, f.z + 0.05), { tint: copeTint, worldUV: false });
    }
  }

  // ======================================================================
  // SET-BACK TOP FLOOR + TERRACE
  // ======================================================================
  if (setback) {
    const TF = at(F, 0, Hbody, -SB);
    const deck = box(W - 0.06, 0.10, SB); boxUV(deck, W - 0.06, 0.10, SB, 3);
    B.addMerged('sidewalk', deck, at(F, 0, Hbody, -SB / 2), { tint: new THREE.Color(0.66, 0.66, 0.65) });
    const topSpec = fieldSpec(rng.bool(0.6) ? 'charcoal' : 'lgray', rng);
    const nT = Math.max(1, Math.round(W / 3.4));
    const tw = snap(WINW, Math.min(2.80, (W - 0.7 * (nT + 1)) / nT));
    const th = 2.45;
    const ops = [];
    for (let i = 0; i < nT; i++) {
      ops.push({ x: -W / 2 + (W / nT) * (i + 0.5), w: tw, y0: 0.12, y1: 0.12 + th });
    }
    punchedWall(ctx, TF, {
      width: W, height: uH, depth: 0.40, mat: topSpec.mat, tint: topSpec.tint,
      rows: [{ y0: 0, y1: uH - 0.16, openings: ops }], grime: 0,
    });
    for (const o of ops) {
      K.window({ w: o.w, h: th, style: 'fixed', recess: RECESS },
        at(F, o.x, Hbody + o.y0, -SB), { tint: sashTint, glassTint });
      B.addInstance(roomPart(B, o.w, th), at(F, o.x, Hbody + o.y0, -SB - 0.17), roomTint);
      blinds(B, F, o.x, Hbody + o.y0, o.w, th, -SB, roomTint, blindTint, winK++);
      glazingBars(B, F, o.x, Hbody + o.y0, o.w, th, -SB, sashTint);
      placeJuliet(o.x, Hbody + o.y0 + 0.06, o.w, -SB);
    }
    // terrace edge: low parapet, bar rail, or a frameless glass guard
    const edge = rng.weighted([['parapet', 34], ['glass', 40], ['bar', 26]]);
    if (edge === 'parapet') {
      const ph = 1.08;
      B.addMerged(fields[0].mat, box(W, ph, 0.24), at(F, 0, Hbody, -0.12), { tint: fields[0].tint });
      B.addMerged('infill:sash', box(W + 0.08, 0.08, 0.34), at(F, 0, Hbody + ph, -0.12), { tint: copeTint, worldUV: false });
    } else if (edge === 'glass') {
      B.addMerged('infill:sash', box(W, 0.42, 0.20), at(F, 0, Hbody, -0.10), { tint: copeTint, worldUV: false });
      B.addMerged('infill:sash', box(W - 0.16, 0.12, 0.11), at(F, 0, Hbody + 0.42, -0.10), { tint: trimTint, worldUV: false });
      B.addMerged('glass', quad(W - 0.22, 0.92), at(F, 0, Hbody + 0.52, -0.04),
        { tint: railGlassTint, worldUV: false });
      B.addMerged('infill:sash', box(W - 0.16, 0.06, 0.09), at(F, 0, Hbody + 1.44, -0.04), { tint: trimTint, worldUV: false });
    } else {
      B.addMerged('infill:sash', box(W, 0.34, 0.18), at(F, 0, Hbody, -0.09), { tint: copeTint, worldUV: false });
      B.addInstance(railPart(B, W - 0.2), at(F, 0, Hbody + 0.34, -0.09), trimTint);
    }
    // planters on the terrace
    for (let i = 0; i < 3; i++) {
      const px = -W / 2 + 0.9 + (W - 1.8) * (i / 2);
      B.addMerged('paintFlat', box(0.85, 0.48, 0.5), at(F, px, Hbody + 0.10, -SB * 0.45),
        { tint: new THREE.Color(0.16, 0.16, 0.16), worldUV: false });
      B.addMerged('paintFlat', box(0.78, 0.30, 0.44), at(F, px, Hbody + 0.55, -SB * 0.45),
        { tint: new THREE.Color(0.20, 0.30, 0.14), worldUV: false });
    }
    // terrace side parapets — 1.15 m, capped, NOT full-storey "ears"
    for (const s of [-1, 1]) {
      B.addMerged(fields[0].mat, box(0.28, 1.15, SB + 0.12),
        at(F, s * (W / 2 - 0.14), Hbody, -SB / 2), { tint: fields[0].tint });
      B.addMerged('infill:sash', box(0.36, 0.07, SB + 0.20),
        at(F, s * (W / 2 - 0.14), Hbody + 1.15, -SB / 2), { tint: copeTint, worldUV: false });
    }
  }

  // ======================================================================
  // SHELL + ROOF
  // ======================================================================
  const cornerSide = lot.corner;
  const sideRows = { left: null, right: null };
  const nSideFloors = nUp + (setback ? 1 : 0);
  if (cornerSide) {
    const rws = [];
    for (let u = 0; u < nSideFloors; u++) {
      const y = gH + u * uH;
      const ops = [];
      const n = Math.max(2, Math.round(D / 4.6));
      for (let i = 0; i < n; i++) {
        ops.push({ x: -D / 2 + (D / n) * (i + 0.5), w: 1.30, y0: y + 0.75, y1: y + 0.75 + 2.00 });
      }
      rws.push({ y0: y + 0.7, y1: y + 2.8, openings: ops });
    }
    if (cornerSide < 0) sideRows.left = rws; else sideRows.right = rws;
  }
  shellWalls(ctx, F, {
    width: W, depth: D, height: Htop, mat: 'brickPaintedGray', tint: shellTint, wallT: 0.3, sideRows,
  });
  if (cornerSide) {
    const sub = at(F, cornerSide * (W / 2), 0, -D / 2, cornerSide < 0 ? -Math.PI / 2 : Math.PI / 2);
    for (let u = 0; u < nSideFloors; u++) {
      const y = gH + u * uH;
      const n = Math.max(2, Math.round(D / 4.6));
      for (let i = 0; i < n; i++) {
        K.window({ w: 1.30, h: 2.00, style: 'fixed', recess: RECESS },
          sub.clone().multiply(tmat(-D / 2 + (D / n) * (i + 0.5), y + 0.75, 0)),
          { tint: sashTint, glassTint });
      }
    }
  }

  const roofW = W, roofD = setback ? D - SB : D, roofZ = setback ? -SB : 0;
  {
    B.addMerged('roofSilver', box(roofW - 0.1, 0.12, roofD - 0.1),
      at(F, 0, Htop - 0.12, roofZ - roofD / 2));
    const T = 0.26;
    const walls = [
      [0, roofZ - T / 2, roofW, T],
      [0, roofZ - roofD + T / 2, roofW, T],
      [-roofW / 2 + T / 2, roofZ - roofD / 2, T, roofD],
      [roofW / 2 - T / 2, roofZ - roofD / 2, T, roofD],
    ];
    const parSpec = setback ? fieldSpec('charcoal', rng) : fields[0];
    for (const [cx, cz, w, d] of walls) {
      B.addMerged(parSpec.mat, box(w, PAR, d), at(F, cx, Htop, cz), { tint: parSpec.tint });
      B.addMerged('infill:sash', box(w + 0.08, 0.08, d + 0.08), at(F, cx, Htop + PAR, cz),
        { tint: copeTint, worldUV: false });
    }
    B.addInstance(railPart(B, roofW - 1.4), at(F, 0, Htop + 0.02, roofZ - 1.3), trimTint);
  }

  {
    const RY = Htop;
    B.addInstance(mechPart(B), at(F, rng.range(-W / 5, W / 5), RY, roofZ - roofD * rng.range(0.35, 0.6),
      rng.bool() ? 0 : Math.PI / 2), new THREE.Color(0.80, 0.82, 0.84));
    K.bulkhead(at(F, rng.range(-W / 4, W / 4), RY, roofZ - roofD * rng.range(0.58, 0.82)), {
      w: q05(rng.range(2.4, 3.2)), d: q05(rng.range(2.2, 2.8)), h: q05(rng.range(2.5, 3.0)),
      mat: 'concrete', tint: new THREE.Color(0.76, 0.77, 0.77),
    });
    const nHv = rng.int(2, 4);
    for (let i = 0; i < nHv; i++) {
      const hx = -W / 2 + 1.2 + (W - 2.4) * ((i + 0.5) / nHv) + rng.range(-0.3, 0.3);
      const hz = roofZ - roofD * rng.range(0.14, 0.52);
      // equipment curb + sleepers — nothing on a NYC roof sits on the membrane
      B.addMerged('paintFlat', box(1.75, 0.22, 1.15), at(F, hx, RY - 0.02, hz),
        { tint: new THREE.Color(0.30, 0.30, 0.31), worldUV: false });
      K.hvac(at(F, hx, RY + 0.20, hz, rng.range(0, Math.PI / 2)),
        { tint: new THREE.Color(0.68, 0.70, 0.71) });
    }
    // roof drain + a conduit run so the deck isn't bare
    B.addMerged('paintFlat', box(0.42, 0.06, 0.42), at(F, rng.range(-W / 4, W / 4), RY - 0.03, roofZ - roofD * 0.5),
      { tint: new THREE.Color(0.18, 0.18, 0.19), worldUV: false });
    roofGear(ctx, at(F, 0, 0, roofZ), rng, {
      width: roofW, depth: roofD, height: RY, bulkhead: false, vents: 2, mat: 'concrete',
    });
  }

  return { height: Htop + PAR + 0.1 };
}
