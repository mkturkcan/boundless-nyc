// Williamsburg / Greenpoint industrial brick loft & warehouse (c.1870-1930).
// Domino Sugar / Austin Nichols / Wythe Ave cooperage vocabulary:
// heavy brick piers, recessed spandrel fields, segmental brick arches with real
// voussoir joints, steel sash with pivot vents, corbelled cornice + parapet,
// star tie plates, loading docks, water towers and ghost signs.
// See docs/typology/03-loft-warehouse.md.
import * as THREE from 'three';
import { box, boxUV, quad, cylinder, cone, compose, tmat, ensureColor } from '../geo.js';
import { at, punchedWall, flatRoof, facadeTint } from './lib.js';
import { brickTexture, makeCanvas } from '../textures.js';

export const TYPE = 'loft';

const DARK = new THREE.Color(0.115, 0.11, 0.105);
const q5 = (v) => Math.round(v * 20) / 20;
const q2 = (v) => Math.round(v * 50) / 50;
const lcg = (seed) => { let s = (seed * 2654435761 + 104729) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

function uvShift(g, du, dv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + du, uv.getY(i) + dv);
  return g;
}

// ---------------------------------------------------------------------------
// MATERIALS (registered once, prefixed 'loft:')
// ---------------------------------------------------------------------------
let GHOST = null;

function ghostAtlas() {
  if (GHOST) return GHOST;
  const W = 2048, H = 1024, CW = 1024, CH = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  const items = [
    { lines: ['DOMINO', 'SUGAR'] },
    { lines: ['AMERICAN', 'MFG. CO.'] },
    { lines: ['IRON WORKS'] },
    { lines: ['STORAGE', 'WAREHOUSE'] },
  ];
  const rnd = lcg(9173);
  items.forEach((it, i) => {
    const col = i % 2, row = (i / 2) | 0;
    g.save();
    g.beginPath(); g.rect(col * CW, row * CH, CW, CH); g.clip();
    g.translate(col * CW + CW / 2, row * CH + CH / 2);
    g.rotate((rnd() - 0.5) * 0.035);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#efe8d6';
    const n = it.lines.length;
    const fs = Math.min(250, (CH * 0.66) / n);
    it.lines.forEach((ln, j) => {
      let size = fs;
      g.font = `900 ${size}px "Arial Black", Impact, Arial`;
      while (g.measureText(ln).width > CW * 0.9 && size > 30) {
        size -= 8; g.font = `900 ${size}px "Arial Black", Impact, Arial`;
      }
      g.fillText(ln, 0, (j - (n - 1) / 2) * fs * 1.15);
    });
    g.restore();
  });
  // weathering: knock out 20-40% of the stroke area, plus rain-wash streaks
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 5000; i++) {
    g.globalAlpha = 0.2 + rnd() * 0.65;
    g.beginPath();
    g.ellipse(rnd() * W, rnd() * H, 3 + rnd() * 24, 3 + rnd() * 18, rnd() * 3, 0, 7);
    g.fill();
  }
  for (let i = 0; i < 46; i++) {
    g.globalAlpha = 0.08 + rnd() * 0.28;
    g.fillRect(rnd() * W, rnd() * H * 0.4, 3 + rnd() * 22, H);
  }
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  GHOST = {
    map: tex, count: 4,
    uvFor: (i) => {
      const col = i % 2, row = (i / 2) | 0;
      return { u0: col / 2, v0: 1 - (row + 1) / 2, u1: (col + 1) / 2, v1: 1 - row / 2 };
    },
  };
  return GHOST;
}

function ensureMaterials(ctx) {
  const M = ctx.batcher.M;
  const add = (name, opts, tile = 2) => {
    if (M.has(name)) return;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...opts });
    m.userData.tileMeters = tile;
    m.name = name;
    M.set(name, m);
  };
  if (!M.has('loft:brickDusky')) {
    const t = brickTexture({
      hue: 8, sat: 35, light: 28, dh: 10, ds: 18, dl: 15, mortar: '#8b8177',
      flemish: true, darkBrickChance: 0.11, seed: 511,
    });
    add('loft:brickDusky', { map: t.map, bumpMap: t.bumpMap, bumpScale: 1.4, roughness: 0.93, envMapIntensity: 0.48 }, t.tileMeters);
  }
  if (!M.has('loft:brickIron')) {
    const t = brickTexture({
      hue: 30, sat: 20, light: 50, dh: 10, ds: 14, dl: 14, mortar: '#a8a094',
      darkBrickChance: 0.07, seed: 513,
    });
    add('loft:brickIron', { map: t.map, bumpMap: t.bumpMap, bumpScale: 1.15, roughness: 0.8, metalness: 0.05, envMapIntensity: 0.6 }, t.tileMeters);
  }
  if (!M.has('loft:brickParty')) {
    const t = brickTexture({
      hue: 14, sat: 30, light: 39, dh: 9, ds: 16, dl: 16, mortar: '#a49a8c',
      flemish: true, darkBrickChance: 0.05, seed: 512,
    });
    add('loft:brickParty', { map: t.map, bumpMap: t.bumpMap, bumpScale: 1.6, roughness: 0.95, envMapIntensity: 0.42 }, t.tileMeters);
  }
  add('loft:sash', { color: 0xffffff, roughness: 0.52, metalness: 0.34, envMapIntensity: 0.9 }, 1);
  add('loft:glassInd', { color: 0xffffff, roughness: 0.17, metalness: 0.42, envMapIntensity: 1.15 }, 1);
  add('loft:iron', { color: 0xffffff, roughness: 0.76, metalness: 0.44, envMapIntensity: 0.9 }, 1);
  if (!M.has('loft:ghostsign')) {
    const a = ghostAtlas();
    const m = new THREE.MeshStandardMaterial({
      map: a.map, vertexColors: true, transparent: true, opacity: 0.52,
      roughness: 0.97, metalness: 0, depthWrite: false, envMapIntensity: 0.3,
    });
    m.userData.tileMeters = 1;
    m.name = 'loft:ghostsign';
    M.set('loft:ghostsign', m);
  }
}

// ---------------------------------------------------------------------------
// PARTS
// ---------------------------------------------------------------------------

// Segmental brick arch: radial voussoir ring with real joints + haunch fill.
function archPart(ctx, span, rise, ring, mat) {
  const S = q5(span), r = q2(rise), rg = q2(ring);
  const id = `loft:arch:${S}x${r}:${rg}:${mat}`;
  if (ctx.batcher.hasPart(id)) return id;
  const R = (S * S) / (8 * r) + r / 2;
  const th = Math.asin(Math.min(0.999, (S / 2) / R));
  const arc = 2 * th * R;
  const n = Math.max(9, Math.round(arc / 0.072));
  const cy = r - R;
  const vw = arc / n - 0.008;
  const proud = 0.032, deep = 0.17;
  const rnd = lcg(Math.round(S * 100) * 31 + Math.round(r * 100));
  const items = [];
  for (let i = 0; i < n; i++) {
    const phi = -th + 2 * th * ((i + 0.5) / n);
    const g = box(vw, rg, proud + deep, { segY: 1 });
    boxUV(g, vw, rg, proud + deep, 2);
    uvShift(g, rnd() * 0.8, rnd() * 0.8);
    ensureColor(g, new THREE.Color().setScalar(0.9 + rnd() * 0.18));
    items.push({ geom: g, x: R * Math.sin(phi), y: cy + R * Math.cos(phi), z: proud - (proud + deep) / 2, rz: -phi });
  }
  // haunch fill: brick courses between the ring extrados and the square opening
  const cc = 0.0667, rr = R + rg;
  for (let y = 0; y < r - 0.004; y += cc) {
    const yt = Math.min(r, y + cc);
    const dy = yt - cy;
    if (Math.abs(dy) >= rr) continue;
    const xo = Math.sqrt(rr * rr - dy * dy);
    if (xo >= S / 2 - 0.02) continue;
    const w = S / 2 + 0.03 - xo;
    for (const sg of [-1, 1]) {
      const g = box(w, yt - y, 0.44, { segY: 1 });
      boxUV(g, w, yt - y, 0.44, 2);
      uvShift(g, rnd() * 0.8, rnd() * 0.8);
      ensureColor(g, new THREE.Color().setScalar(0.72));
      items.push({ geom: g, x: sg * (xo + w / 2), y, z: -0.22 });
    }
  }
  ctx.batcher.definePart(id, compose(items), mat);
  return id;
}

// Projecting brick hood on corbels over an arch (the DUMBO signature).
function hoodPart(ctx, span, rise, mat) {
  const S = q5(span), r = q2(rise);
  const id = `loft:hood:${S}x${r}:${mat}`;
  if (ctx.batcher.hasPart(id)) return id;
  const items = [];
  const w = S + 0.30, cc = 0.0667;
  for (let i = 0; i < 2; i++) {
    const g = box(w, cc, 0.20 + i * 0.02);
    boxUV(g, w, cc, 0.20, 2);
    items.push({ geom: g, x: 0, y: r + 0.02 + i * cc, z: (0.038 + i * 0.008) - (0.20 + i * 0.02) / 2 });
  }
  for (const sg of [-1, 1]) {
    const g = box(0.15, cc * 2, 0.16);
    boxUV(g, 0.15, cc * 2, 0.16, 2);
    ensureColor(g, new THREE.Color().setScalar(0.86));
    items.push({ geom: g, x: sg * (S / 2 + 0.075), y: r - cc * 2 + 0.02, z: 0.030 - 0.08 });
  }
  ctx.batcher.definePart(id, compose(items), mat);
  return id;
}

// Industrial steel sash: outer frame, vertical-proportion muntin grid,
// heavier centre-pivot vent, and (optionally) an arched top row.
function sashPart(ctx, o) {
  const { w, h, px, py, recess, arched, rise, ventRows, open } = o;
  const id = `loft:sash:${q5(w)}x${q5(h)}:${px}x${py}:${arched ? 'a' : 'f'}${open ? 'o' : 'c'}:${Math.round(recess * 100)}`;
  if (ctx.batcher.hasPart(id)) return id;
  const fw = 0.037, mw = 0.014, mz = 0.033, fd = 0.052, fz = -recess;
  const items = [];
  const totH = h + (arched ? rise : 0);
  const back = box(w + 0.14, totH + 0.12, 0.03, { segY: 1 });
  ensureColor(back, DARK);
  items.push({ geom: back, x: 0, y: -0.06, z: fz - 0.10 });
  items.push({ geom: box(w, fw, fd, { segY: 1 }), x: 0, y: h - fw, z: fz });
  items.push({ geom: box(w, fw * 1.35, fd, { segY: 1 }), x: 0, y: 0, z: fz });
  items.push({ geom: box(fw, h, fd, { segY: 1 }), x: -w / 2 + fw / 2, y: 0, z: fz });
  items.push({ geom: box(fw, h, fd, { segY: 1 }), x: w / 2 - fw / 2, y: 0, z: fz });
  const gy0 = fw * 1.35, gy1 = h - fw, gw = w - fw * 2;
  for (let i = 1; i < px; i++) {
    items.push({ geom: box(mw, gy1 - gy0, mz, { segY: 1 }), x: -gw / 2 + (gw / px) * i, y: gy0, z: fz });
  }
  for (let j = 1; j < py; j++) {
    items.push({ geom: box(gw, mw, mz, { segY: 1 }), x: 0, y: gy0 + ((gy1 - gy0) / py) * j - mw / 2, z: fz });
  }
  // centre horizontal pivot vent: 2 cols x ventRows rows, heavier section
  const c0 = Math.max(0, Math.min(px - 2, Math.floor(px / 2) - 1));
  const r0 = Math.max(0, Math.min(py - ventRows, Math.floor((py - ventRows) / 2)));
  const vx0 = -gw / 2 + (gw / px) * c0, vx1 = -gw / 2 + (gw / px) * (c0 + 2);
  const vy0 = gy0 + ((gy1 - gy0) / py) * r0, vy1 = gy0 + ((gy1 - gy0) / py) * (r0 + ventRows);
  const vt = 0.025;
  items.push({ geom: box(vx1 - vx0 + vt, vt, mz + 0.02, { segY: 1 }), x: (vx0 + vx1) / 2, y: vy0 - vt / 2, z: fz + 0.006 });
  items.push({ geom: box(vx1 - vx0 + vt, vt, mz + 0.02, { segY: 1 }), x: (vx0 + vx1) / 2, y: vy1 - vt / 2, z: fz + 0.006 });
  items.push({ geom: box(vt, vy1 - vy0, mz + 0.02, { segY: 1 }), x: vx0, y: vy0, z: fz + 0.006 });
  items.push({ geom: box(vt, vy1 - vy0, mz + 0.02, { segY: 1 }), x: vx1, y: vy0, z: fz + 0.006 });
  if (open) {
    const pw = vx1 - vx0 - 0.03, ph = vy1 - vy0 - 0.03;
    const g = box(pw, ph, 0.018, { segY: 1 });
    ensureColor(g, new THREE.Color(0.30, 0.32, 0.30));
    g.translate(0, -ph / 2, 0);
    g.rotateX(-0.55);
    items.push({ geom: g, x: (vx0 + vx1) / 2, y: (vy0 + vy1) / 2, z: fz - 0.03 });
  }
  if (arched) {
    const R = (w * w) / (8 * rise) + rise / 2;
    const th = Math.asin(Math.min(0.999, (w / 2) / R));
    const cy = h + rise - R;
    items.push({ geom: box(w, mw * 1.5, mz, { segY: 1 }), x: 0, y: h - mw, z: fz });
    const nb = 4;
    for (let i = 1; i < nb; i++) {
      const phi = -th + 2 * th * (i / nb);
      const t0 = (R - rise) / Math.max(0.4, Math.cos(phi));
      const len = Math.max(0.02, R - 0.015 - t0);
      const g = box(mw, len, mz, { segY: 1 });
      g.translate(0, t0, 0);
      items.push({ geom: g, x: 0, y: cy, z: fz, rz: -phi });
    }
  }
  ctx.batcher.definePart(id, compose(items), 'loft:sash');
  return id;
}

// Glazing: per-pane colour jitter, painted-out / boarded / missing panes.
function glassPart(ctx, o) {
  const { w, h, px, py, recess, arched, rise, variant } = o;
  const id = `loft:glass:${q5(w)}x${q5(h)}:${px}x${py}:${arched ? 'a' : 'f'}:v${variant}`;
  if (ctx.batcher.hasPart(id)) return id;
  const rnd = lcg(variant * 7919 + px * 131 + py * 17);
  const fw = 0.037;
  const gy0 = fw * 1.35, gy1 = h - fw, gw = w - fw * 2;
  const pw = gw / px, ph = (gy1 - gy0) / py;
  const items = [];
  for (let i = 0; i < px; i++) {
    for (let j = 0; j < py; j++) {
      const r = rnd();
      if (r < 0.03) continue;                                   // pane missing
      let col;
      if (r < 0.15) col = new THREE.Color(0.80, 0.79, 0.74);    // whitewashed
      else if (r < 0.19) col = new THREE.Color(0.42, 0.36, 0.25); // boarded
      else {
        const v = 0.20 + rnd() * 0.26;
        col = new THREE.Color(v * 0.82, v * 1.0, v * 0.97);
      }
      const g = quad(pw - 0.013, ph - 0.013);
      ensureColor(g, col);
      items.push({ geom: g, x: -gw / 2 + pw * (i + 0.5), y: gy0 + ph * j + 0.0065, z: -recess + 0.017 });
    }
  }
  if (arched) {
    const R = (w * w) / (8 * rise) + rise / 2;
    const cy = h + rise - R;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const cx = -gw / 2 + (gw / n) * (i + 0.5);
      const top = cy + Math.sqrt(Math.max(0.0001, R * R - cx * cx));
      const hh = Math.max(0.03, top - h - 0.02);
      const v = 0.18 + rnd() * 0.18;
      const g = quad(gw / n - 0.014, hh);
      ensureColor(g, new THREE.Color(v * 0.82, v, v * 0.97));
      items.push({ geom: g, x: cx, y: h, z: -recess + 0.017 });
    }
  }
  ctx.batcher.definePart(id, compose(items), 'loft:glassInd', { castShadow: false });
  return id;
}

// Bluestone / granite sill with 2 corbel blocks under it.
function sillPart(ctx, w, corbels) {
  const ww = q5(w + 0.24);
  const id = `loft:sill:${ww}:${corbels ? 'c' : 'p'}`;
  if (ctx.batcher.hasPart(id)) return id;
  const items = [];
  const g = box(ww, 0.135, 0.21, { segY: 1 });
  boxUV(g, ww, 0.135, 0.21, 2);
  items.push({ geom: g, x: 0, y: -0.135, z: 0.056 - 0.105 });
  const lip = box(ww, 0.03, 0.05, { segY: 1 });
  boxUV(lip, ww, 0.03, 0.05, 2);
  items.push({ geom: lip, x: 0, y: -0.045, z: 0.068 - 0.025 });
  if (corbels) {
    for (const sg of [-1, 1]) {
      const c = box(0.13, 0.12, 0.13, { segY: 1 });
      boxUV(c, 0.13, 0.12, 0.13, 2);
      ensureColor(c, new THREE.Color().setScalar(0.9));
      items.push({ geom: c, x: sg * (ww / 2 - 0.14), y: -0.255, z: 0.035 - 0.065 });
    }
  }
  ctx.batcher.definePart(id, compose(items), 'limestone');
  return id;
}

// Cast-iron tie-rod anchor plate + nut + rust bleed.
function tiePart(ctx, kind) {
  const id = `loft:tie:${kind}`;
  if (ctx.batcher.hasPart(id)) return id;
  const items = [];
  if (kind === 'star') {
    for (let i = 0; i < 6; i++) {
      const g = box(0.058, 0.128, 0.03, { segY: 1 });
      items.push({ geom: g, x: 0, y: 0, z: 0.015, rz: -(i / 6) * Math.PI * 2 });
    }
  } else if (kind === 'diamond') {
    const g = box(0.17, 0.17, 0.028, { segY: 1 });
    g.translate(0, -0.085, 0);
    g.rotateZ(Math.PI / 4);
    items.push({ geom: g, x: 0, y: 0, z: 0.014 });
  } else {
    items.push({ geom: cylinder(0.11, 0.115, 0.028, 12), x: 0, y: 0, z: 0, rx: Math.PI / 2 });
  }
  items.push({ geom: cylinder(0.042, 0.05, 0.048, 8), x: 0, y: 0, z: 0.026, rx: Math.PI / 2 });
  items.push({ geom: box(0.052, 0.052, 0.032, { segY: 1 }), x: 0, y: -0.026, z: 0.06 });
  const bleed = box(0.055, 0.30, 0.004, { segY: 1 });
  ensureColor(bleed, new THREE.Color(0.34, 0.19, 0.11));
  items.push({ geom: bleed, x: 0, y: -0.34, z: 0.006 });
  ctx.batcher.definePart(id, compose(items), 'loft:iron');
  return id;
}

// Corbelled cornice bracket (7 courses, each stepping out ~12mm).
function corbelPart(ctx, mat) {
  const id = `loft:corbel:${mat}`;
  if (ctx.batcher.hasPart(id)) return id;
  const items = [];
  const cw = 0.205, cc = 0.0667;
  for (let i = 0; i < 6; i++) {
    const proj = 0.015 + i * 0.0165;
    const g = box(cw, cc + 0.002, proj + 0.10);
    boxUV(g, cw, cc, proj + 0.10, 2);
    items.push({ geom: g, x: 0, y: i * cc, z: proj - (proj + 0.10) / 2 });
  }
  ctx.batcher.definePart(id, compose(items), mat);
  return id;
}

// Dentil / dogtooth run: 10 header units at 0.19m pitch.
function dentilPart(ctx, mat, dogtooth) {
  const id = `loft:dentil:${dogtooth ? 'dt' : 'sq'}:${mat}`;
  if (ctx.batcher.hasPart(id)) return id;
  const items = [];
  for (let i = 0; i < 10; i++) {
    const g = box(0.098, 0.0667, 0.19);
    boxUV(g, 0.098, 0.0667, 0.19, 2);
    items.push({ geom: g, x: -0.855 + i * 0.19, y: 0, z: 0.052 - 0.095, ry: dogtooth ? Math.PI / 4 : 0 });
  }
  ctx.batcher.definePart(id, compose(items), mat);
  return id;
}

// Roll-up steel door: coil hood, guides, bottom bar (slats are a merged quad).
function gateHwPart(ctx, w, h) {
  const ww = q5(w), hh = q5(h);
  const id = `loft:gatehw:${ww}x${hh}`;
  if (ctx.batcher.hasPart(id)) return id;
  const items = [];
  items.push({ geom: cylinder(0.20, 0.20, ww + 0.16, 12), x: 0, y: hh + 0.16, z: 0, rz: Math.PI / 2 });
  items.push({ geom: box(ww + 0.30, 0.10, 0.40, { segY: 1 }), x: 0, y: hh + 0.36, z: -0.16 });
  for (const sg of [-1, 1]) {
    items.push({ geom: box(0.092, hh, 0.11, { segY: 1 }), x: sg * (ww / 2 + 0.046), y: 0, z: -0.055 });
  }
  items.push({ geom: box(ww, 0.075, 0.055, { segY: 1 }), x: 0, y: 0, z: 0 });
  ctx.batcher.definePart(id, compose(items), 'loft:iron');
  return id;
}

function bollardPart(ctx) {
  const id = 'loft:bollard';
  if (ctx.batcher.hasPart(id)) return id;
  const items = [
    { geom: cylinder(0.093, 0.10, 0.98, 10), x: 0, y: 0, z: 0 },
    { geom: new THREE.SphereGeometry(0.093, 10, 6), x: 0, y: 0.98, z: 0 },
  ];
  ctx.batcher.definePart(id, compose(items), 'loft:iron');
  return id;
}

function bumperPart(ctx) {
  const id = 'loft:bumper';
  if (ctx.batcher.hasPart(id)) return id;
  const items = [];
  for (let i = 0; i < 4; i++) {
    const g = box(0.25, 0.055, 0.10, { segY: 1 });
    ensureColor(g, new THREE.Color().setScalar(0.55 + (i % 2) * 0.18));
    items.push({ geom: g, x: 0, y: i * 0.06, z: 0.05 });
  }
  ctx.batcher.definePart(id, compose(items), 'loft:iron');
  return id;
}

// Steel-and-glass infill inside an original dock arch (adaptive reuse).
function infillPart(ctx, w, h) {
  const ww = q5(w), hh = q5(h);
  const id = `loft:infill:${ww}x${hh}`;
  if (ctx.batcher.hasPart(id)) return id;
  const items = [];
  const rz = -0.20;
  const cols = Math.max(2, Math.round(ww / 1.15));
  items.push({ geom: box(ww, 0.10, 0.10, { segY: 1 }), x: 0, y: hh - 0.10, z: rz });
  items.push({ geom: box(ww, 0.12, 0.12, { segY: 1 }), x: 0, y: 0, z: rz });
  for (let i = 0; i <= cols; i++) {
    items.push({ geom: box(0.085, hh, 0.13, { segY: 1 }), x: -ww / 2 + (ww / cols) * i, y: 0, z: rz });
  }
  items.push({ geom: box(ww, 0.075, 0.11, { segY: 1 }), x: 0, y: hh * 0.62, z: rz });
  const back = box(ww, hh, 0.02, { segY: 1 });
  ensureColor(back, DARK);
  items.push({ geom: back, x: 0, y: 0, z: rz - 0.09 });
  ctx.batcher.definePart(id, compose(items), 'loft:sash');
  const gid = id + ':g';
  const gitems = [];
  const rnd = lcg(Math.round(ww * 20) + 3);
  for (let i = 0; i < cols; i++) {
    for (const [y0, y1] of [[0.12, hh * 0.62], [hh * 0.62 + 0.075, hh - 0.10]]) {
      const g = quad(ww / cols - 0.10, y1 - y0);
      const v = 0.16 + rnd() * 0.16;
      ensureColor(g, new THREE.Color(v * 0.85, v, v * 1.05));
      gitems.push({ geom: g, x: -ww / 2 + (ww / cols) * (i + 0.5), y: y0, z: rz + 0.03 });
    }
  }
  ctx.batcher.definePart(gid, compose(gitems), 'loft:glassInd', { castShadow: false });
  return id;
}

function railPart(ctx) {
  const id = 'loft:roofrail';
  if (ctx.batcher.hasPart(id)) return id;
  const items = [];
  const L = 4.8;
  items.push({ geom: box(L, 0.038, 0.038, { segY: 1 }), x: 0, y: 1.05, z: 0 });
  items.push({ geom: box(L, 0.032, 0.032, { segY: 1 }), x: 0, y: 0.55, z: 0 });
  for (let i = 0; i <= 2; i++) {
    items.push({ geom: box(0.045, 1.07, 0.045, { segY: 1 }), x: -L / 2 + (L / 2) * i, y: 0, z: 0 });
  }
  ctx.batcher.definePart(id, compose(items), 'loft:iron');
  return id;
}

function hoistPart(ctx) {
  const id = 'loft:hoist';
  if (ctx.batcher.hasPart(id)) return id;
  const items = [
    { geom: box(0.16, 0.30, 1.15, { segY: 1 }), x: 0, y: 0, z: 0.55 },
    { geom: box(0.26, 0.26, 0.20, { segY: 1 }), x: 0, y: -0.24, z: 0.98 },
    { geom: cylinder(0.02, 0.02, 0.9, 6), x: 0, y: -1.1, z: 0.98 },
  ];
  ctx.batcher.definePart(id, compose(items), 'loft:iron');
  return id;
}

function standpipePart(ctx) {
  const id = 'loft:standpipe';
  if (ctx.batcher.hasPart(id)) return id;
  const items = [
    { geom: cylinder(0.055, 0.055, 1.05, 8), x: 0, y: 0, z: 0.11 },
    { geom: cylinder(0.075, 0.075, 0.16, 8), x: -0.13, y: 0.95, z: 0.11, rz: Math.PI / 2 },
    { geom: cylinder(0.075, 0.075, 0.16, 8), x: 0.13, y: 0.95, z: 0.11, rz: Math.PI / 2 },
    { geom: cylinder(0.06, 0.06, 0.14, 8), x: -0.13, y: 0.95, z: 0.20, rx: Math.PI / 2 },
    { geom: cylinder(0.06, 0.06, 0.14, 8), x: 0.13, y: 0.95, z: 0.20, rx: Math.PI / 2 },
  ];
  ctx.batcher.definePart(id, compose(items), 'loft:iron');
  return id;
}

function skylightPart(ctx) {
  const id = 'loft:skylight';
  if (ctx.batcher.hasPart(id)) return id;
  const items = [];
  items.push({ geom: box(1.35, 0.22, 1.9, { segY: 1 }), x: 0, y: 0, z: 0 });
  const g = box(1.30, 0.06, 1.85, { segY: 1 });
  ensureColor(g, new THREE.Color(0.32, 0.36, 0.35));
  items.push({ geom: g, x: 0, y: 0.22, z: 0, rx: 0.28 });
  ctx.batcher.definePart(id, compose(items), 'loft:iron');
  return id;
}

function ghostPart(ctx, cell) {
  const id = `loft:ghostsign:${cell}`;
  if (ctx.batcher.hasPart(id)) return id;
  const g = quad(1, 1, ghostAtlas().uvFor(cell));
  g.translate(0, -0.5, 0);
  ctx.batcher.definePart(id, g, 'loft:ghostsign', { castShadow: false, receiveShadow: false });
  return id;
}

// ---------------------------------------------------------------------------
// FACADE
// ---------------------------------------------------------------------------
function planBays(W, S, rng) {
  let endW = Math.min(W * 0.14, S.endPierW);
  let pierW = Math.min(S.pierW, W * 0.09);
  const bayFor = (k) => k * S.winW + (k - 1) * S.winGap + 2 * S.bayMargin;
  const kAt = (i, n) => {
    const d = Math.min(i, n - 1 - i);
    if (S.rhythm === 'wideNarrow') return (i % 2 === 0) ? S.pat[0] : 1;
    return S.pat[Math.min(d, S.pat.length - 1)];
  };
  let ks = [];
  for (let n = 1; n <= 16; n++) {
    const cand = [];
    for (let i = 0; i < n; i++) cand.push(kAt(i, n));
    let wsum = (n - 1) * pierW + 2 * endW;
    for (const k of cand) wsum += bayFor(k);
    if (wsum > W + 0.25) break;
    ks = cand;
  }
  if (!ks.length) ks = [1];
  let used = (ks.length - 1) * pierW + 2 * endW;
  for (const k of ks) used += bayFor(k);
  let slack = Math.max(0, W - used);
  const nP = ks.length + 1;
  const perPier = Math.min(slack / nP, 0.55);
  endW += perPier; pierW += perPier;
  slack -= perPier * nP;
  const extraBay = ks.length ? slack / ks.length : 0;
  const bays = [];
  const piers = [];
  let x = -W / 2;
  piers.push({ x: x + endW / 2, w: endW });
  x += endW;
  for (let i = 0; i < ks.length; i++) {
    const bw = bayFor(ks[i]) + extraBay;
    const k = ks[i];
    const total = k * S.winW + (k - 1) * S.winGap;
    const xs = [];
    for (let j = 0; j < k; j++) xs.push(x + bw / 2 - total / 2 + S.winW / 2 + j * (S.winW + S.winGap));
    bays.push({ x0: x, x1: x + bw, cx: x + bw / 2, w: bw, k, xs });
    x += bw;
    if (i < ks.length - 1) { piers.push({ x: x + pierW / 2, w: pierW }); x += pierW; }
  }
  piers.push({ x: x + endW / 2, w: endW });
  return { bays, piers };
}

function facade(ctx, rng, S, o) {
  const B = ctx.batcher, K = ctx.kit;
  const F = o.frame, W = o.width, primary = o.primary;
  const mat = S.brickMat, tint = S.tint;
  const mb = (m, w, h, d, x, y, zf, opts = {}) => {
    if (w <= 0.005 || h <= 0.005 || d <= 0.005) return;
    B.addMerged(m, box(w, h, d), F.clone().multiply(tmat(x, y, zf - d / 2)), opts);
  };
  const P = planBays(W, S, rng);
  const rows = [];
  const deck = S.deck, floorH = S.floorH, groundH = S.groundH;
  const floorY = (f) => (f === 0 ? 0 : groundH + (f - 1) * floorH);
  const wallT = 0.44;

  // ---- ground story ---------------------------------------------------------
  const gTop = Math.min(groundH - 0.95, 3.72);
  const gOps = [];         // {x, w, top, kind}
  const docks = [];
  const nDock = primary ? Math.max(1, Math.min(P.bays.length, Math.round(W / 15))) : (W > 22 ? 1 : 0);
  const dockBays = [];
  if (nDock > 0) {
    const order = P.bays.map((b, i) => i).sort((a, c) => P.bays[c].w - P.bays[a].w);
    for (let i = 0; i < nDock && i < order.length; i++) dockBays.push(order[i]);
  }
  P.bays.forEach((bay, bi) => {
    if (dockBays.includes(bi) && bay.w > 2.9) {
      const dw = q5(Math.min(bay.w - 0.55, 4.3));
      gOps.push({ x: bay.cx, w: dw, top: gTop, kind: S.commercial ? 'shop' : S.dockKind });
      docks.push({ x: bay.cx, w: dw });
    } else if (bay.w > 2.4 && bay.k >= 2) {
      const dw = q5(Math.min(bay.w - 0.7, 2.3));
      const which = rng.weighted([['freight', 2], ['gwin', 4], ['brick', 1.4], ['shop', S.commercial ? 4 : 0.4]]);
      gOps.push({ x: bay.cx, w: dw, top: which === 'gwin' ? gTop - 0.55 : gTop, kind: which });
    } else {
      const dw = q5(Math.min(bay.w - 0.5, 1.6));
      gOps.push({ x: bay.cx, w: dw, top: gTop - 0.7, kind: rng.bool(0.72) ? 'gwin' : 'brick' });
    }
  });
  gOps.sort((a, b) => a.x - b.x);
  const gRise = (w) => q2(Math.max(0.14, w / 8.5));
  {
    const y0 = 0.06;
    const ops = gOps.map((g) => ({ x: g.x, w: g.w, y0, y1: g.top + gRise(g.w) }));
    rows.push({ y0, y1: gTop + gRise(4.3) + 0.02, openings: ops });
  }

  // ---- upper stories --------------------------------------------------------
  const winRows = [];
  for (let f = 1; f <= S.stories - 1; f++) {
    const top = f === S.stories - 1;
    const sill = floorY(f) + S.sillH;
    const wh = S.winH;
    const rise = top && S.topArch ? S.topRise : S.winRise;
    const crown = sill + wh + rise;
    const ops = [];
    P.bays.forEach((bay) => { for (const x of bay.xs) ops.push({ x, w: S.winW }); });
    rows.push({ y0: sill, y1: crown, openings: ops.map((op) => ({ ...op })) });
    winRows.push({ f, sill, crown, rise, top });
    // recessed spandrel panel per bay between this crown and the sill above
    const nextSill = top ? deck - S.corniceH - 0.28 : floorY(f + 1) + S.sillH;
    const sy0 = crown + 0.11, sy1 = nextSill - 0.22;
    if (sy1 - sy0 > 0.18) {
      rows.push({
        y0: sy0, y1: sy1,
        openings: P.bays.map((bay) => ({ x: bay.cx, w: Math.max(0.4, bay.w - 0.30) })),
      });
    }
  }

  // ---- the wall (recessed field plane) --------------------------------------
  punchedWall(ctx, F, {
    width: W, height: deck, depth: wallT, mat, tint, rows,
    grime: primary ? 0.32 : 0.26, aoTop: deck - S.corniceH,
  });

  // recessed spandrel infill panels (set back 0.04 behind the field)
  const spTint = tint.clone().multiplyScalar(0.9);
  for (const r of rows) {
    if (r.y1 - r.y0 > 1.6 || r.y0 < groundH) continue;
    for (const op of r.openings) {
      if (op.w < 0.5) continue;
      mb(mat, op.w, r.y1 - r.y0, 0.24, op.x, r.y0, -0.045, { tint: spTint, aoTop: r.y1 });
    }
  }

  // ---- piers (proud) --------------------------------------------------------
  const pierTop = deck - S.corniceH;
  for (const p of P.piers) {
    mb(mat, p.w, pierTop - 0.02, S.pierProj + 0.06, p.x, 0.02, S.pierProj, { tint, grime: 0.3, aoTop: pierTop });
    if (S.pierSplit && S.stories >= 6) {
      // vertical shadow slot dividing the pier above the 5th floor
      const y = floorY(5);
      mb(mat, 0.05, pierTop - y - 0.3, S.pierProj + 0.01, p.x, y, S.pierProj - 0.05, { tint: spTint });
    }
    // pilaster cap: 2 corbelled courses dying into the cornice
    mb(mat, p.w + 0.06, 0.0667, S.pierProj + 0.10, p.x, pierTop - 0.135, S.pierProj + 0.035, { tint });
    mb(mat, p.w + 0.10, 0.0667, S.pierProj + 0.13, p.x, pierTop - 0.0667, S.pierProj + 0.06, { tint });
  }

  // ---- water table + belt courses ------------------------------------------
  const wtH = S.waterTableH;
  {
    let px = -W / 2;
    const segs = [];
    for (const g of gOps) {
      const l = g.x - g.w / 2 - 0.06;
      if (l > px + 0.05) segs.push([px, l]);
      px = g.x + g.w / 2 + 0.06;
    }
    if (px < W / 2 - 0.05) segs.push([px, W / 2]);
    for (const [a, b] of segs) {
      mb('graniteBase', b - a, wtH, S.pierProj + 0.11, (a + b) / 2, 0.04, S.pierProj + 0.05, { grime: 0.42 });
    }
  }
  for (const bY of S.beltYs) {
    mb(mat, W, 0.134, S.pierProj + 0.12, 0, bY, S.pierProj + 0.038, { tint });
    mb('limestone', W, 0.055, S.pierProj + 0.14, 0, bY + 0.134, S.pierProj + 0.048, { tint: S.trimTint });
  }

  // ---- windows: sash, glass, sill, arch ------------------------------------
  const sashTint = S.sashTint;
  for (const wr of winRows) {
    const recess = wr.top ? S.recessTop : S.recess;
    const arch = archPart(ctx, S.winW, wr.rise, wr.rise > 0.24 ? 0.19 : S.ringDepth, mat);
    const hood = S.hood ? hoodPart(ctx, S.winW, wr.rise, mat) : null;
    const sid = sashPart(ctx, {
      w: S.winW, h: S.winH, px: S.px, py: S.py, recess,
      arched: true, rise: wr.rise, ventRows: S.ventRows, open: false,
    });
    const sidO = sashPart(ctx, {
      w: S.winW, h: S.winH, px: S.px, py: S.py, recess,
      arched: true, rise: wr.rise, ventRows: S.ventRows, open: true,
    });
    const sil = sillPart(ctx, S.winW, S.sillCorbels);
    P.bays.forEach((bay) => {
      for (const x of bay.xs) {
        const m = at(F, x, wr.sill, 0);
        const roll = rng.next();
        if (roll < S.blockedP) {
          // bricked-up / cinderblock infill opening
          mb(mat, S.winW - 0.03, S.winH + wr.rise * 0.55, 0.2, x, wr.sill, -0.085,
            { tint: tint.clone().multiplyScalar(rng.range(0.86, 1.0)), aoTop: wr.crown });
        } else {
          B.addInstance(sil, at(F, x, wr.sill, 0), S.trimTint);
          B.addInstance(roll < S.blockedP + 0.18 ? sidO : sid, m, sashTint);
          B.addInstance(glassPart(ctx, {
            w: S.winW, h: S.winH, px: S.px, py: S.py, recess,
            arched: true, rise: wr.rise, variant: rng.int(0, S.glassVars - 1),
          }), m, null);
          if (rng.bool(S.acP)) K.acUnit(at(F, x, wr.sill + 0.02, 0.02), { tint: new THREE.Color(0.7, 0.7, 0.68) });
        }
        B.addInstance(arch, at(F, x, wr.sill + S.winH, 0), tint);
        if (hood) B.addInstance(hood, at(F, x, wr.sill + S.winH, 0), tint);
      }
    });
  }

  // ---- tie rods / star bolts ----------------------------------------------
  if (S.ties) {
    const tie = tiePart(ctx, S.tieKind);
    const rustT = new THREE.Color(S.tieColor);
    for (let f = 2; f <= S.stories - 1; f++) {
      const y = floorY(f) - 0.30;
      const dens = f <= Math.ceil(S.stories / 3) ? 0.4 : 1.0;
      P.piers.forEach((p, i) => {
        if (i % S.tieStep !== S.tiePhase) return;
        if (!rng.bool(dens * (primary ? 1 : 0.45))) return;
        B.addInstance(tie, at(F, p.x, y, S.pierProj + 0.03), rustT);
      });
    }
  }

  // ---- cornice + parapet ---------------------------------------------------
  const cBase = deck - S.corniceH;
  {
    const offs = S.corniceOffsets;
    let y = cBase;
    if (S.dentil) {
      const d = dentilPart(ctx, mat, S.dogtooth);
      const n = Math.ceil(W / 1.9);
      for (let i = 0; i < n; i++) {
        const cx = -W / 2 + 0.95 + i * 1.9;
        if (cx > W / 2 - 0.5) break;
        B.addInstance(d, at(F, cx, y, 0.045), tint);
      }
      y += 0.0667;
    }
    for (let i = S.dentil ? 1 : 0; i < offs.length; i++) {
      const off = offs[i];
      mb(mat, W, 0.0667 + 0.002, off + 0.16, 0, y, off, { tint, aoTop: i === 0 ? cBase + 0.2 : 0 });
      y += 0.0667;
    }
    if (S.brackets) {
      const cb = corbelPart(ctx, mat);
      for (const p of P.piers) {
        const n = p.w > 1.15 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const cx = p.x + (n === 2 ? (i - 0.5) * 0.5 : 0);
          B.addInstance(cb, at(F, cx, cBase - 0.40, S.pierProj + 0.005), tint);
        }
      }
    }
  }
  // parapet above the cornice crown
  const crownY = cBase + S.corniceOffsets.length * 0.0667;
  const crownP = S.corniceOffsets[S.corniceOffsets.length - 1];
  const paraSegs = [];
  if (S.paraStyle === 'pediment') {
    const pw = Math.min(W * 0.42, rng.range(3.0, 5.6));
    paraSegs.push([-W / 2, -pw / 2, S.paraH]);
    paraSegs.push([pw / 2, W / 2, S.paraH]);
    const steps = 5, rise = S.pedRise;
    for (let i = 0; i < steps; i++) {
      const t = i / steps, t2 = (i + 1) / steps;
      const w0 = pw * (1 - t * 0.86), w1 = pw * (1 - t2 * 0.86);
      mb(mat, w0, (rise / steps) + 0.01, 0.34, 0, crownY + S.paraH + t * rise, 0.0, { tint });
      mb('limestone', w0 + 0.06, 0.07, 0.40, 0, crownY + S.paraH + t2 * rise, 0.03, { tint: S.trimTint });
      if (i === 0) {
        // recessed date-stone panel
        mb('limestone', Math.min(1.3, pw * 0.34), 0.72, 0.10, 0, crownY + S.paraH + 0.12, -0.035, { tint: S.trimTint });
      }
      void w1;
    }
    paraSegs.push([-pw / 2, pw / 2, S.paraH]);
  } else if (S.paraStyle === 'stepped') {
    const cw = W * rng.range(0.34, 0.5);
    paraSegs.push([-W / 2, -cw / 2, S.paraH]);
    paraSegs.push([-cw / 2, cw / 2, S.paraH + rng.range(0.28, 0.55)]);
    paraSegs.push([cw / 2, W / 2, S.paraH]);
  } else {
    paraSegs.push([-W / 2, W / 2, S.paraH]);
  }
  for (const [a, b, h] of paraSegs) {
    mb(mat, b - a, h, 0.34, (a + b) / 2, crownY, 0.0, { tint });
    mb('limestone', b - a + 0.06, 0.075, 0.40, (a + b) / 2, crownY + h, 0.03, { tint: S.trimTint });
  }
  void crownP;

  // ---- ground-floor fittings ----------------------------------------------
  for (const g of gOps) {
    const rise = gRise(g.w);
    const ring = g.w > 2.4 ? 0.19 : S.ringDepth;
    B.addInstance(archPart(ctx, g.w, rise, ring, mat), at(F, g.x, g.top, 0), tint);
    if (g.kind === 'brick') {
      mb(mat, g.w - 0.03, g.top + rise * 0.6, 0.22, g.x, 0.06, -0.11,
        { tint: tint.clone().multiplyScalar(0.94), grime: 0.4 });
      continue;
    }
    if (g.kind === 'gwin') {
      const h = q5(g.top - 1.0);
      const w = q5(g.w - 0.14);
      const py = Math.max(3, Math.round(h / 0.42));
      const px = Math.max(2, Math.round(w / 0.38));
      const m = at(F, g.x, 0.95, 0);
      B.addInstance(sillPart(ctx, w, false), m, S.trimTint);
      B.addInstance(sashPart(ctx, { w, h, px, py, recess: S.recessBase, arched: false, rise: 0, ventRows: 2, open: false }), m, S.sashTint);
      B.addInstance(glassPart(ctx, { w, h, px, py, recess: S.recessBase, arched: false, rise: 0, variant: rng.int(0, S.glassVars - 1) }), m, null);
      // security grille bars
      for (let i = 1; i < 4; i++) {
        mb('loft:iron', 0.026, h, 0.03, g.x - w / 2 + (w / 4) * i, 0.95, -0.07, { tint: new THREE.Color(0.22, 0.2, 0.19) });
      }
      continue;
    }
    if (g.kind === 'shop') {
      const h = q5(Math.min(g.top - 0.1, 3.4));
      const w = q5(g.w - 0.14);
      const inf = infillPart(ctx, w, h);
      B.addInstance(inf, at(F, g.x, 0.08, 0), S.sashTint);
      B.addInstance(inf + ':g', at(F, g.x, 0.08, 0), null);
      continue;
    }
    // dock / freight door
    const dockH = g.kind === 'dockPlat' ? 1.22 : 0.0;
    const gw = q5(g.w - 0.20), gh = q5(g.top - dockH - 0.30);
    if (dockH > 0) {
      mb('concrete', g.w, dockH, 2.1, g.x, 0.02, -0.18, { grime: 0.5 });
      mb('loft:iron', g.w + 0.05, 0.10, 0.12, g.x, dockH - 0.10, -0.13, { tint: new THREE.Color(0.42, 0.36, 0.3) });
      const bp = bumperPart(ctx);
      for (const sg of [-1, 1]) {
        B.addInstance(bp, at(F, g.x + sg * (g.w / 2 - 0.55), dockH - 0.44, -0.16), new THREE.Color(0.2, 0.19, 0.18));
      }
    }
    // roll-up slats
    const gq = quad(gw, gh);
    const gu = gq.attributes.uv;
    for (let i = 0; i < gu.count; i++) gu.setXY(i, gu.getX(i) * gw, gu.getY(i) * gh);
    B.addMerged(rng.bool(0.55) ? 'rollGateTagged' : 'rollGate', gq,
      at(F, g.x, dockH, -0.30), { worldUV: false, tint: S.gateTint });
    B.addInstance(gateHwPart(ctx, gw, gh), at(F, g.x, dockH, -0.28), new THREE.Color(0.34, 0.32, 0.30));
    // bollards on the sidewalk
    if (primary) {
      const bl = bollardPart(ctx);
      const nb = Math.max(2, Math.round(g.w / 1.6));
      for (let i = 0; i < nb; i++) {
        const bx = g.x - g.w / 2 + 0.35 + (g.w - 0.7) * (i / Math.max(1, nb - 1));
        B.addInstance(bl, at(F, bx, 0.14, 1.05), rng.bool(0.7) ? new THREE.Color(0.72, 0.55, 0.14) : new THREE.Color(0.34, 0.2, 0.13));
      }
    }
  }

  // standpipe / siamese connection on the primary facade
  if (primary && S.standpipe) {
    B.addInstance(standpipePart(ctx), at(F, P.piers[1] ? P.piers[1].x + 0.5 : W / 2 - 1.0, 0.5, S.pierProj),
      new THREE.Color(0.52, 0.12, 0.10));
  }

  return P;
}

// ---------------------------------------------------------------------------
export function generate(ctx, lot, rng) {
  const B = ctx.batcher, K = ctx.kit;
  ensureMaterials(ctx);
  const W = lot.width, D = lot.depth;
  const stories = Math.max(3, Math.min(8, lot.stories || rng.weighted([[4, 24], [5, 22], [6, 29], [7, 11]])));
  const groundH = rng.range(4.35, 5.15);
  const floorH = rng.range(3.92, 4.35);
  const topBonus = rng.range(0.12, 0.5);
  const deck = groundH + (stories - 1) * floorH + topBonus;

  const painted = rng.bool(0.32);
  const brickMat = painted
    ? rng.weighted([['brickPaintedCream', 3], ['brickPaintedGray', 2.2], ['brickPaintedRed', 1]])
    : rng.weighted([['loft:brickDusky', 4], ['brickRed', 3], ['brickBrown', 2], ['brickOrange', 1.6], ['loft:brickIron', 1.1]]);
  const tint = facadeTint(rng);
  const trimTint = rng.bool(0.55)
    ? new THREE.Color(0.55, 0.63, 0.70)      // bluestone
    : new THREE.Color(0.74, 0.72, 0.68);     // granite
  const sashTint = new THREE.Color(rng.weighted([
    [0x2c3830, 4], [0x25272a, 3], [0x3c3f3b, 2], [0x5b3a26, 1.4], [0xcfccc2, 1.2],
  ]));

  const sillH = rng.range(0.82, 1.02);
  let winW = q5(rng.range(1.05, 1.5));
  const winRise = q2(Math.max(0.15, winW / 7));
  let spandrelH = rng.range(0.62, 0.98);
  let winH = q5(Math.max(1.9, Math.min(2.8, floorH - sillH - winRise - spandrelH)));
  spandrelH = floorH - sillH - winRise - winH;
  const px = Math.max(2, Math.min(6, Math.round((winW - 0.074) / 0.355)));
  const py = Math.max(3, Math.min(8, Math.round((winH - 0.087) / 0.40)));

  const S = {
    stories, groundH, floorH, topBonus, deck, brickMat, tint, trimTint, sashTint,
    sillH, winW, winH, winRise, spandrelH, px, py,
    recess: rng.range(0.17, 0.21),
    recessTop: rng.range(0.11, 0.14),
    recessBase: rng.range(0.22, 0.28),
    ringDepth: 0.095,
    pierProj: rng.range(0.095, 0.135),
    endPierW: rng.range(1.0, 1.5),
    pierW: rng.range(0.66, 0.95),
    winGap: rng.range(0.38, 0.58),
    bayMargin: rng.range(0.26, 0.40),
    pat: rng.pick([[2, 3, 2], [3, 2, 3], [2, 2, 1], [3, 3, 3], [2, 3, 3], [2, 2, 2], [3, 1, 3]]),
    rhythm: rng.weighted([['uniform', 4], ['wideNarrow', 2], ['grouped', 3]]),
    corniceH: 0,
    corniceOffsets: null,
    dentil: false, dogtooth: false, brackets: false,
    paraStyle: rng.weighted([['flat', 4], ['stepped', 3], ['pediment', 2.6]]),
    paraH: rng.range(0.85, 1.35),
    pedRise: rng.range(0.65, 1.35),
    waterTableH: rng.range(0.34, 0.56),
    beltYs: [],
    glassVars: 3,
    ventRows: rng.pick([2, 2, 3]),
    blockedP: rng.range(0.03, 0.13),
    acP: rng.range(0.0, 0.1),
    hood: rng.bool(0.36),
    sillCorbels: rng.bool(0.4),
    ties: rng.bool(0.78),
    tieKind: rng.weighted([['star', 4.2], ['round', 2.8], ['diamond', 1.8]]),
    tieColor: rng.weighted([[0x5a3320, 4], [0x2a2724, 3], [0x7a4527, 2]]),
    tieStep: rng.int(1, 2), tiePhase: 0,
    pierSplit: rng.bool(0.4),
    commercial: !!lot.commercial,
    dockKind: rng.bool(0.62) ? 'dockPlat' : 'dockGrade',
    gateTint: new THREE.Color(rng.weighted([[0x8e9094, 4], [0x5c5e60, 3], [0x8a5c3a, 1.4], [0x3a5a6a, 1]])),
    standpipe: rng.bool(0.7),
    bandSign: false, bandCell: 0,
    topArch: rng.bool(0.4),
    topRise: 0,
  };
  S.topRise = S.topArch ? q2(winW * 0.42) : winRise;
  // cornice variant
  const cv = rng.weighted([['A', 22], ['B', 34], ['C', 29], ['D', 15]]);
  if (cv === 'A') { S.corniceOffsets = [0.032, 0.032, 0.045]; S.dentil = true; }
  else if (cv === 'B') { S.corniceOffsets = [0.032, 0.064, 0.095, 0.070, 0.121]; S.dentil = rng.bool(0.4); }
  else if (cv === 'C') { S.corniceOffsets = [0.032, 0.000, 0.038, 0.076, 0.114, 0.089, 0.146]; S.dentil = true; S.dogtooth = true; S.brackets = true; }
  else { S.corniceOffsets = [0.032, 0.064, 0.100, 0.075, 0.128, 0.150]; S.dentil = true; S.brackets = true; }
  S.corniceH = S.corniceOffsets.length * 0.0667 + 0.02;
  // belt courses: 2nd-floor sill line, and below the top story
  S.beltYs.push(groundH + sillH - 0.30);
  if (stories >= 5) S.beltYs.push(groundH + (stories - 2) * floorH + sillH - 0.34);

  const frame = lot.frame;
  const hand = lot.mirror ? -1 : 1;
  void hand;

  // ---- primary facade ------------------------------------------------------
  facade(ctx, rng, S, { frame, width: W, primary: true });

  // ---- side walls ----------------------------------------------------------
  const partyMat = painted ? brickMat : 'loft:brickParty';
  const wallT = 0.44;
  for (const side of [-1, 1]) {
    const sub = at(frame, side * (W / 2), 0, -D / 2, side < 0 ? -Math.PI / 2 : Math.PI / 2);
    if (lot.corner === side) {
      facade(ctx, rng, S, { frame: sub, width: D, primary: false });
    } else {
      // party wall: flat common bond, a few late-cut openings up top, ghost sign
      const rows = [];
      const nOp = rng.int(0, 3);
      for (let i = 0; i < nOp; i++) {
        const f = rng.int(stories - 3 < 1 ? 1 : stories - 3, stories - 1);
        const y = groundH + (f - 1) * floorH + rng.range(0.9, 1.3);
        rows.push({ y0: y, y1: y + 1.5, openings: [{ x: rng.range(-D / 2 + 2, D / 2 - 2), w: 1.1 }] });
      }
      rows.sort((a, b) => a.y0 - b.y0);
      const clean = [];
      let last = -1;
      for (const r of rows) { if (r.y0 > last + 0.2) { clean.push(r); last = r.y1; } }
      punchedWall(ctx, sub, {
        width: D, height: deck, depth: wallT, mat: partyMat, tint, rows: clean, grime: 0.3,
      });
      for (const r of clean) {
        for (const op of r.openings) {
          const w = q5(op.w), h = q5(r.y1 - r.y0);
          const m = sub.clone().multiply(tmat(op.x, r.y0, 0));
          B.addInstance(sashPart(ctx, { w, h, px: 3, py: 4, recess: 0.09, arched: false, rise: 0, ventRows: 2, open: false }), m, sashTint);
          B.addInstance(glassPart(ctx, { w, h, px: 3, py: 4, recess: 0.09, arched: false, rise: 0, variant: 0 }), m, null);
        }
      }
      // ghost sign high on the party wall
      if (rng.bool(0.72)) {
        const cell = rng.int(0, 3);
        const gw = Math.min(D * 0.74, rng.range(8, 16));
        const gh = gw * 0.5;
        const gy = Math.min(deck - 1.4, groundH + (stories - 2.1) * floorH);
        B.addInstance(ghostPart(ctx, cell),
          sub.clone().multiply(tmat(rng.range(-D * 0.12, D * 0.18), gy, 0.03, 0))
            .multiply(tmat(0, 0, 0, 0, gw, gh, 1)),
          new THREE.Color(1, 0.98, 0.94));
      }
      // stepped-down party parapet
      const steps = 3;
      for (let i = 0; i < steps; i++) {
        const z0 = -D + (D / steps) * i, z1 = -D + (D / steps) * (i + 1);
        const h = 0.34 + (steps - 1 - i) * 0.28;
        B.addMerged(partyMat, box(wallT, h, z1 - z0), at(frame, side * (W / 2 - wallT / 2), deck, (z0 + z1) / 2), { tint });
        B.addMerged('limestone', box(wallT + 0.06, 0.075, z1 - z0), at(frame, side * (W / 2 - wallT / 2), deck + h, (z0 + z1) / 2), { tint: trimTint });
      }
    }
  }

  // ---- rear wall -----------------------------------------------------------
  {
    const sub = at(frame, 0, 0, -D, Math.PI);
    const rows = [];
    const nb = Math.max(2, Math.floor(W / 3.4));
    const xs = [];
    for (let i = 0; i < nb; i++) xs.push(-W / 2 + (W / nb) * (i + 0.5));
    for (let f = 1; f <= stories - 1; f++) {
      const y = groundH + (f - 1) * floorH + sillH;
      rows.push({ y0: y, y1: y + winH, openings: xs.filter(() => rng.bool(0.8)).map((x) => ({ x, w: 1.1 })) });
    }
    punchedWall(ctx, sub, { width: W, height: deck, depth: wallT, mat: partyMat, tint, rows, grime: 0.3 });
    for (const r of rows) {
      for (const op of r.openings) {
        const m = sub.clone().multiply(tmat(op.x, r.y0, 0));
        B.addInstance(sashPart(ctx, { w: 1.1, h: q5(winH), px: 3, py: 5, recess: 0.10, arched: false, rise: 0, ventRows: 2, open: false }), m, sashTint);
        B.addInstance(glassPart(ctx, { w: 1.1, h: q5(winH), px: 3, py: 5, recess: 0.10, arched: false, rise: 0, variant: rng.int(0, 2) }), m, null);
      }
    }
    B.addMerged(partyMat, box(W - 0.02, 0.45, wallT), at(frame, 0, deck, -D + wallT / 2), { tint });
  }

  // ---- roof ---------------------------------------------------------------
  flatRoof(ctx, frame, { width: W, depth: D, height: deck, parapet: 0, mat: brickMat, tint, roofMat: rng.pick(['roofSilver', 'roofBlack']) });

  // freight-elevator penthouse with corbelled cap + hoist beam
  if (rng.bool(0.66)) {
    const pw = rng.range(3.2, 4.6), pd = rng.range(4.2, 5.6), ph = rng.range(3.6, 5.2);
    const pxp = rng.range(-W * 0.22, W * 0.22), pz = -D * rng.range(0.3, 0.55);
    B.addMerged(brickMat, box(pw, ph, pd), at(frame, pxp, deck, pz), { tint, aoTop: deck + ph });
    for (let i = 0; i < 3; i++) {
      B.addMerged(brickMat, box(pw + 0.06 + i * 0.06, 0.0667, pd + 0.06 + i * 0.06), at(frame, pxp, deck + ph + i * 0.0667, pz), { tint });
    }
    B.addMerged('limestone', box(pw + 0.28, 0.08, pd + 0.28), at(frame, pxp, deck + ph + 0.22, pz), { tint: trimTint });
    const lv = box(1.25, 1.25, 0.08);
    ensureColor(lv, new THREE.Color(0.22, 0.24, 0.23));
    B.addMerged('loft:iron', lv, at(frame, pxp, deck + ph * 0.45, pz + pd / 2), { worldUV: false });
    B.addInstance(hoistPart(ctx), at(frame, pxp, deck + ph + 0.1, pz + pd / 2), new THREE.Color(0.3, 0.22, 0.16));
  }
  K.bulkhead(at(frame, rng.range(-W * 0.35, W * 0.35), deck, -D * rng.range(0.45, 0.75)), {
    w: rng.range(2.6, 3.6), d: rng.range(2.4, 3.4), h: rng.range(2.5, 3.6),
    mat: rng.bool(0.6) ? brickMat : 'stucco', tint,
  });
  if (rng.bool(0.82)) {
    K.waterTower(at(frame, rng.range(-W * 0.28, W * 0.28), deck, -D * rng.range(0.3, 0.62), rng.range(0, Math.PI)), {
      legH: rng.pick([3.5, 5.0, 6.5]), r: rng.pick([1.8, 2.2]), hBody: rng.pick([4.0, 5.0]),
      tint: new THREE.Color().setHSL(0.075, rng.range(0.16, 0.3), rng.range(0.26, 0.40)),
    });
  }
  for (let i = 0; i < rng.int(2, 4); i++) {
    K.vent(at(frame, rng.range(-W * 0.42, W * 0.42), deck, -D * rng.range(0.2, 0.85)), { kind: rng.pick(['pipe', 'pipe', 'goose', 'whirly']) });
  }
  for (let i = 0; i < rng.int(0, 2); i++) {
    K.hvac(at(frame, rng.range(-W * 0.3, W * 0.3), deck, -D * rng.range(0.3, 0.8), rng.range(0, Math.PI)));
  }
  if (rng.bool(0.45)) {
    const sk = skylightPart(ctx);
    for (let i = 0; i < rng.int(1, 3); i++) {
      B.addInstance(sk, at(frame, rng.range(-W * 0.35, W * 0.35), deck, -D * rng.range(0.35, 0.8), rng.range(0, Math.PI)), new THREE.Color(0.5, 0.5, 0.48));
    }
  }
  if (rng.bool(0.45)) {
    const rl = railPart(ctx);
    const n = Math.max(1, Math.floor(W / 4.8));
    for (let i = 0; i < n; i++) {
      B.addInstance(rl, at(frame, -W / 2 + 2.4 + i * 4.8, deck, -1.5), new THREE.Color(0.3, 0.3, 0.29));
    }
  }
  // square brick stack (Domino / Faber)
  if (rng.bool(0.24)) {
    const bw = rng.range(1.3, 2.1), ch = rng.range(9, 17);
    const cx = rng.range(-W * 0.3, W * 0.3), cz = -D * rng.range(0.55, 0.85);
    B.addMerged(brickMat, box(bw, ch, bw), at(frame, cx, deck - 0.4, cz), { tint });
    for (let i = 0; i < 4; i++) {
      B.addMerged(brickMat, box(bw + 0.08 + i * 0.06, 0.0667, bw + 0.08 + i * 0.06), at(frame, cx, deck - 0.4 + ch + i * 0.0667, cz), { tint });
    }
  }
  // setback rooftop glass addition (Wythe Hotel condition)
  if (rng.bool(0.28) && D > 12) {
    const ah = rng.range(3.1, 3.35) * rng.int(1, 2);
    const setb = rng.range(3.6, 6.5);
    const aw = W - 1.2, ad = D - setb - 1.5;
    if (ad > 4) {
      B.addMerged('spandrel', box(aw, ah, ad), at(frame, 0, deck + 0.5, -setb - ad / 2), { tint: new THREE.Color(0.7, 0.72, 0.74) });
      const gq = box(aw - 0.3, ah - 0.5, ad - 0.3);
      B.addMerged('glassCurtain', gq, at(frame, 0, deck + 0.75, -setb - ad / 2));
    }
  }
  // fire escape on the primary facade end bay for some seeds
  if (rng.bool(0.26) && stories >= 4) {
    K.fireEscape({ width: 3.6, floors: stories - 1, floorH, firstY: groundH + sillH + 0.1 },
      at(frame, (rng.bool(0.5) ? -1 : 1) * (W / 2 - 3.0), 0, 0.02),
      { tint: new THREE.Color(rng.weighted([[0x1a1917, 5], [0x2a231c, 2]])) });
  }

  return { height: deck };
}
