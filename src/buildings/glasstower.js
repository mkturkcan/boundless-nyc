// Williamsburg / Greenpoint / LIC waterfront glass condo tower (2005-2025).
// The Edge, Northside Piers, 420 Kent, Greenpoint Landing idiom: window-wall-clad
// concrete flat-plate tower on a materially-distinct podium, raised flood base,
// balcony grids, ACM/precast accents, mechanical penthouse.
// Source of truth: docs/typology/06-glass-condo.md
import * as THREE from 'three';
import { box, boxUV, quad, cylinder, compose, tmat, ensureColor } from '../geo.js';
import { at, punchedWall, shellWalls, flatRoof } from './lib.js';
import { stoneTexture, makeCanvas } from '../textures.js';

export const TYPE = 'glasstower';

// ---------------------------------------------------------------------------
// constants (all metres, straight from the typology doc)
// ---------------------------------------------------------------------------
const FTF = 3.05;          // residential floor-to-floor (modal)
const SPAND = 0.72;        // spandrel band = slab + ceiling void + finish + upstand
const RAIL = 0.055;        // head / sill rail
const MULL_F = 0.075;      // captured mullion sightline
const MULL_D = 0.115;      // window-wall frame depth
const CAP = 0.02;          // mullion cap projection outboard of the datum plane
const GSET = 0.095;        // glass plane setback from the datum plane
const GUARD_H = 1.07;      // NYC BC 1015.3 minimum
const BAL_D = 1.80;        // projecting balcony depth (modal 1.83)
const q05 = (v) => Math.round(v * 20) / 20;
const q50 = (v) => Math.round(v * 2) / 2;
const DARKI = new THREE.Color(0.055, 0.06, 0.065);   // unlit interior / reveals

// Distance strategy. A 0.075 m mullion cap on a 1.55 m pitch is 0.2 px wide at
// 400 m: the per-pane geometry aliases into moire stripes on the skyline. Tower
// floors at or above this index drop the module geometry and get ONE merged
// panel per face per floor carrying the BAKED curtain-wall texture instead —
// mip-filtered, so the grid averages to a clean grey line at any distance.
// Below it the real 3-D mullions / rails / gaskets stay (street + closeups).
// 4 rather than 6: at 1-2 km even four storeys of 0.075 m mullion still dithers
// into the old mosaic, and four floors is everything a street camera resolves.
const LOD_F = 4;

// ---------------------------------------------------------------------------
// BAKED CURTAIN WALL — 'glasstower:cwtex'
// One cell = one facade module x one floor, so a panel of n modules just maps
// u over n cells. 4 x 4 cells of pane variation (blinds / blackout / fogged /
// clear + per-cell luminance) tile without an obvious beat once the per-face
// cell offset is jittered. Everything is near-neutral: the per-panel vertex
// tint carries the building's glass family colour.
// Line widths are held >= 13 px (mullion) / 9 px (rails) so the mip chain
// still resolves them as lines instead of dropping them.
// ---------------------------------------------------------------------------
const CW_NU = 4, CW_NV = 4;            // cells across / down
const CW_CW = 256, CW_CH = 512;        // px per cell (module x floor)
const CW_MUL = 7;                      // mullion half-width, px

function cwTexture() {
  const W = CW_NU * CW_CW, H = CW_NV * CW_CH;
  const cv = makeCanvas(W, H);
  const g = cv.getContext('2d');
  let s = 8675309 >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const PY = CW_CH / FTF;                             // px per metre, vertical
  const rail = Math.max(9, Math.round(RAIL * PY));    // head / sill rail
  const spand = Math.round(SPAND * PY);               // spandrel band

  g.fillStyle = '#8e9294'; g.fillRect(0, 0, W, H);

  for (let r = 0; r < CW_NV; r++) {
    for (let c = 0; c < CW_NU; c++) {
      const ox = c * CW_CW, oy = r * CW_CH;
      const yVis0 = oy + rail;
      const yVis1 = oy + CW_CH - spand - rail;
      const ySil0 = yVis1, ySpan0 = ySil0 + rail;

      // ---- vision glass: sky-to-street reflection ramp + occupancy ---------
      const roll = rnd();
      let L = 0.97 + (rnd() - 0.5) * 0.06;
      let mode = 'clear';
      if (roll < 0.07) { mode = 'blinds'; L = 1.0; }
      else if (roll < 0.16) { mode = 'dark'; L = 0.62 + rnd() * 0.10; }
      else if (roll < 0.20) { mode = 'fog'; L = 0.94; }
      const lum = (f) => {
        const v = Math.max(0, Math.min(255, Math.round(255 * L * f)));
        return `rgb(${v},${v},${Math.min(255, Math.round(v * 1.015))})`;
      };
      const grad = g.createLinearGradient(0, yVis0, 0, yVis1);
      if (mode === 'fog') {
        grad.addColorStop(0, lum(1.0)); grad.addColorStop(1, lum(0.95));
      } else {
        grad.addColorStop(0.00, lum(1.10));    // sky
        grad.addColorStop(0.42, lum(1.00));
        grad.addColorStop(0.54, lum(0.79));    // opposite roofline / horizon
        grad.addColorStop(0.74, lum(0.90));
        grad.addColorStop(1.00, lum(0.76));    // street, darkest
      }
      g.fillStyle = grad;
      g.fillRect(ox, yVis0, CW_CW, yVis1 - yVis0);
      if (mode === 'blinds') {
        g.fillStyle = 'rgba(255,255,255,0.5)';
        for (let y = yVis0 + 12; y < yVis1 - 10; y += 24) g.fillRect(ox + 9, y, CW_CW - 18, 12);
      }
      // glass edge darkening beside the mullions (sealant shadow)
      const eg = g.createLinearGradient(ox, 0, ox + CW_CW, 0);
      eg.addColorStop(0, 'rgba(0,0,0,0.20)'); eg.addColorStop(0.13, 'rgba(0,0,0,0)');
      eg.addColorStop(0.87, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(0,0,0,0.20)');
      g.fillStyle = eg;
      g.fillRect(ox, yVis0, CW_CW, yVis1 - yVis0);

      // ---- spandrel band ---------------------------------------------------
      const sg = g.createLinearGradient(0, ySpan0, 0, oy + CW_CH);
      sg.addColorStop(0.00, 'rgb(104,107,109)');   // lit top edge / drip
      sg.addColorStop(0.16, 'rgb(70,73,75)');
      sg.addColorStop(1.00, 'rgb(46,48,50)');      // rain wash
      g.fillStyle = sg;
      g.fillRect(ox, ySpan0, CW_CW, oy + CW_CH - ySpan0);

      // ---- head + sill rails, gasket shadow --------------------------------
      g.fillStyle = 'rgb(214,217,218)';
      g.fillRect(ox, oy, CW_CW, rail);
      g.fillRect(ox, ySil0, CW_CW, rail);
      g.fillStyle = 'rgba(18,20,22,0.72)';
      g.fillRect(ox, oy + rail, CW_CW, 5);
      g.fillStyle = 'rgba(18,20,22,0.42)';
      g.fillRect(ox, ySil0 - 4, CW_CW, 4);
    }
  }

  // soft reflection blotches so a wide panel is never a dead flat tone
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W, y = rnd() * H, rr = 80 + rnd() * 200;
    const rg = g.createRadialGradient(x, y, 0, x, y, rr);
    rg.addColorStop(0, rnd() < 0.5 ? 'rgba(255,255,255,0.085)' : 'rgba(0,0,0,0.075)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
  }

  // ---- vertical mullions on every cell boundary, full height ---------------
  for (let k = 0; k <= CW_NU; k++) {
    const cx = k * CW_CW;
    g.fillStyle = 'rgba(22,24,26,0.55)';                                  // seal
    g.fillRect(cx - CW_MUL - 3, 0, 3, H);
    g.fillRect(cx + CW_MUL, 0, 3, H);
    g.fillStyle = 'rgb(146,151,153)'; g.fillRect(cx - CW_MUL, 0, 3, H);   // shadow side
    g.fillStyle = 'rgb(238,240,240)'; g.fillRect(cx - CW_MUL + 3, 0, 6, H); // highlight
    g.fillStyle = 'rgb(184,188,190)'; g.fillRect(cx - CW_MUL + 9, 0, 5, H); // mid
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

// ---------------------------------------------------------------------------
// materials — registered without touching materials.js. Base colour is white on
// the untextured ones so every instance/vertex tint IS the final colour.
// ---------------------------------------------------------------------------
function ensureMaterials(ctx) {
  const M = ctx.batcher.M;
  const std = (name, opts, tile = 1) => {
    if (M.has(name)) return;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...opts });
    m.userData.tileMeters = tile;
    m.name = name;
    M.set(name, m);
  };
  // Dielectric vision glass: metalness stays low so the Fresnel ramp does the
  // mirror work (F0 ~0.12 = reflective coating, NOT tinted chrome).
  // Vision glass as a DIELECTRIC: metalness 0 so F0 stays 0.04 and three's
  // environment BRDF does the Fresnel ramp — weak reflection head-on (the
  // transmitted room tone in the vertex tint shows), strong sky reflection at
  // grazing. The vertex tint is an albedo of 0.10-0.32, not a surface colour:
  // at the old ~0.5 the diffuse term did all the work and every pane read as
  // an opaque painted panel that blew out in sun.
  std('glasstower:vision', { color: 0xffffff, roughness: 0.05, metalness: 0.0, envMapIntensity: 2.0 });
  // Opaque spandrel: same front-surface gloss as vision, zero emission.
  std('glasstower:spandrel', { color: 0xffffff, roughness: 0.11, metalness: 0.26, envMapIntensity: 1.0 });
  std('glasstower:mullion', { color: 0xffffff, roughness: 0.38, metalness: 0.55, envMapIntensity: 1.0 });
  std('glasstower:louver', { color: 0xffffff, roughness: 0.5, metalness: 0.5, envMapIntensity: 0.9 });
  if (!M.has('glasstower:guard')) {
    const m = new THREE.MeshStandardMaterial({
      // A balcony stack puts 15-20 of these guards along one sight line; at
      // 0.44 alpha they compounded into a white haze over the whole facade.
      color: 0xffffff, vertexColors: true, roughness: 0.08, metalness: 0.14,
      envMapIntensity: 0.8, transparent: true, opacity: 0.26, depthWrite: false,
      side: THREE.DoubleSide,
    });
    m.userData.tileMeters = 1; m.name = 'glasstower:guard';
    M.set('glasstower:guard', m);
  }
  if (!M.has('glasstower:acm')) {
    // near-white base so the map contributes only the 1.0 x 2.0 m reveal grid
    const t = stoneTexture({ base: '#eaeae8', blockW: 1.0, blockH: 2.0, jointDark: 0.62, weather: 0.02, seed: 171 });
    std('glasstower:acm', {
      map: t.map, bumpMap: t.map, bumpScale: 0.12,
      roughness: 0.34, metalness: 0.26, envMapIntensity: 1.0,
    }, t.tileMeters);
  }
  if (!M.has('glasstower:precast')) {
    // weather 0.22 put 1.5-3 m soft light/dark blobs on every precast band —
    // camouflage, not dirt. Real staining on these panels is a vertical streak
    // below the joint, so keep the map to the reveal grid and let the vertex
    // grime gradient do the soiling.
    const t = stoneTexture({ base: '#e7e3db', blockW: 1.0, blockH: 2.0, jointDark: 0.5, weather: 0.06, seed: 172 });
    std('glasstower:precast', {
      map: t.map, bumpMap: t.map, bumpScale: 0.35,
      roughness: 0.76, metalness: 0.0, envMapIntensity: 0.6,
    }, t.tileMeters);
  }
  if (!M.has('glasstower:cwtex')) {
    // Baked curtain wall for the far context (see cwTexture / LOD_F). Glossier
    // than this and the whole flat panel catches one sun glint at once and
    // blooms — the sky-reflection ramp is already baked into the map, so the
    // material only has to supply a soft, broad highlight.
    std('glasstower:cwtex', {
      map: cwTexture(), roughness: 0.11, metalness: 0.0, envMapIntensity: 1.7,
    }, 1);
  }
}

// ---------------------------------------------------------------------------
// tint helpers
// ---------------------------------------------------------------------------
const C = (hex) => new THREE.Color(hex);
const HSL = { h: 0, s: 0, l: 0 };
function jitter(rng, base, lAmp, hAmp = 0.006, sAmp = 0.03) {
  base.getHSL(HSL);
  return new THREE.Color().setHSL(
    HSL.h + rng.range(-hAmp, hAmp),
    Math.max(0, Math.min(1, HSL.s + rng.range(-sAmp, sAmp))),
    Math.max(0.004, Math.min(1, HSL.l * (1 + rng.range(-lAmp, lAmp)))),
  );
}
function scaleL(base, f) {
  base.getHSL(HSL);
  return new THREE.Color().setHSL(HSL.h, HSL.s, Math.max(0.004, Math.min(1, HSL.l * f)));
}

// ---------------------------------------------------------------------------
// ONE per-floor curtain-wall module, instanced across the whole facade.
// Part space: x centred on the module, y = 0 at the bottom of the spandrel band
// (the slab line sits inside it), z = 0 at the slab-edge datum plane.
// Split by material only (frame / spandrel / glass / lit) so the glass can carry
// per-pane instance tint — that jitter is what stops the wall reading as one mirror.
// ---------------------------------------------------------------------------
function moduleIds(mw, treat) {
  return {
    frame: `glasstower:cw:${mw}:frame`,
    span: `glasstower:cw:${mw}:span:${treat}`,
    glass: `glasstower:cw:${mw}:glass`,
    lit: `glasstower:cw:${mw}:lit`,
  };
}
const VIS_Y0 = SPAND + RAIL;          // bottom of vision glass
const VIS_Y1 = FTF - RAIL;            // top of vision glass
const VIS_H = VIS_Y1 - VIS_Y0;        // 2.22 m of vision glass per floor

function defineModule(B, mw, treat) {
  const ids = moduleIds(mw, treat);
  if (!B.hasPart(ids.frame)) {
    const it = [];
    // vertical mullion on the LEFT edge only (the next module supplies the next
    // one; corners get a real corner mullion post) — pitch = module width.
    it.push({ geom: box(MULL_F, FTF, MULL_D, { segY: 1 }), x: -mw / 2, y: 0, z: CAP - MULL_D / 2 });
    // sill + head rails frame the vision opening and give it true depth
    it.push({ geom: box(mw - MULL_F, RAIL, 0.10, { segY: 1 }), x: 0, y: SPAND, z: 0.005 - 0.05 });
    it.push({ geom: box(mw - MULL_F, RAIL, 0.10, { segY: 1 }), x: 0, y: VIS_Y1, z: 0.005 - 0.05 });
    // EPDM gasket line under the head rail (reads as the dark shadow gap)
    const gk = box(mw - MULL_F, 0.022, 0.02, { segY: 1 });
    ensureColor(gk, new THREE.Color(0.13, 0.13, 0.125));
    it.push({ geom: gk, x: 0, y: VIS_Y1 - 0.022, z: -0.055 });
    B.definePart(ids.frame, compose(it), 'glasstower:mullion');
  }
  if (!B.hasPart(ids.span)) {
    if (treat === 'acm') {
      // aluminium / ACM slab-edge cover panel, proud of the glass
      const g = box(mw, SPAND, 0.085, { segY: 1 });
      boxUV(g, mw, SPAND, 0.085, 2);
      g.translate(0, 0, 0.005 - 0.085 / 2);
      B.definePart(ids.span, g, 'glasstower:acm');
    } else if (treat === 'conc') {
      // exposed / painted concrete slab edge + shadow eyebrow
      const it = [];
      const b = box(mw, SPAND, 0.09, { segY: 1 });
      boxUV(b, mw, SPAND, 0.09, 2);
      it.push({ geom: b, x: 0, y: 0, z: 0.015 - 0.045 });
      const eb = box(mw, 0.09, 0.30, { segY: 1 });
      boxUV(eb, mw, 0.09, 0.30, 2);
      it.push({ geom: eb, x: 0, y: SPAND - 0.09, z: 0.16 });
      B.definePart(ids.span, compose(it), 'glasstower:precast');
    } else {
      // spandrel glass aligned with the vision plane (the 0.42 default)
      const g = box(mw, SPAND, 0.07, { segY: 1 });
      // grime streak: darken the bottom of the band (rain wash off the drip edge)
      ensureColor(g);
      const pos = g.attributes.position, col = g.attributes.color;
      for (let i = 0; i < pos.count; i++) {
        const t = Math.min(1, Math.max(0, pos.getY(i) / SPAND));
        const f = 0.86 + 0.14 * t;
        col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
      }
      g.translate(0, 0, -0.055 - 0.035);
      B.definePart(ids.span, g, 'glasstower:spandrel');
    }
  }
  if (!B.hasPart(ids.glass)) {
    const g = quad(mw - MULL_F - 0.012, VIS_H);
    g.translate(0, VIS_Y0, -GSET);
    B.definePart(ids.glass, g, 'glasstower:vision', { castShadow: false });
    const lg = quad(mw - MULL_F - 0.02, VIS_H - 0.02);
    lg.translate(0, VIS_Y0 + 0.01, -GSET + 0.006);
    B.definePart(ids.lit, lg, 'litWindow', { castShadow: false, receiveShadow: false, visible: false });
  }
  return ids;
}

// ---------------------------------------------------------------------------
// balcony: slab + frameless laminated glass guard in a base shoe + top cap
// ---------------------------------------------------------------------------
function defineBalcony(B, w) {
  const ids = {
    slab: `glasstower:balcony:${w}:slab`,
    glass: `glasstower:balcony:${w}:glass`,
    rail: `glasstower:balcony:${w}:rail`,
  };
  const d = BAL_D;
  if (!B.hasPart(ids.slab)) {
    const it = [];
    const s = box(w, 0.25, d, { segY: 1 });
    boxUV(s, w, 0.25, d, 2);
    it.push({ geom: s, x: 0, y: -0.25, z: d / 2 });
    // drip nosing on the three open edges
    const n1 = box(w + 0.03, 0.05, 0.03, { segY: 1 });
    it.push({ geom: n1, x: 0, y: -0.30, z: d - 0.015 });
    it.push({ geom: box(0.03, 0.05, d, { segY: 1 }), x: -w / 2 - 0.005, y: -0.30, z: d / 2 });
    it.push({ geom: box(0.03, 0.05, d, { segY: 1 }), x: w / 2 + 0.005, y: -0.30, z: d / 2 });
    // pedestal paver deck
    const pv = box(w - 0.09, 0.06, d - 0.10, { segY: 1 });
    boxUV(pv, w - 0.09, 0.06, d - 0.10, 0.61);
    it.push({ geom: pv, x: 0, y: 0, z: d / 2 - 0.02 });
    B.definePart(ids.slab, compose(it), 'glasstower:precast');
  }
  if (!B.hasPart(ids.glass)) {
    const it = [];
    const f = quad(w - 0.10, GUARD_H - 0.10);
    it.push({ geom: f, x: 0, y: 0.15, z: d - 0.06 });
    const l = quad(d - 0.14, GUARD_H - 0.10); l.rotateY(-Math.PI / 2);
    it.push({ geom: l, x: -w / 2 + 0.06, y: 0.15, z: d / 2 });
    const r = quad(d - 0.14, GUARD_H - 0.10); r.rotateY(Math.PI / 2);
    it.push({ geom: r, x: w / 2 - 0.06, y: 0.15, z: d / 2 });
    B.definePart(ids.glass, compose(it), 'glasstower:guard', { castShadow: false });
  }
  if (!B.hasPart(ids.rail)) {
    const it = [];
    const cap = 0.055, shoe = 0.12;
    const runs = [
      [w, 0.05, 0, d - 0.06],           // front
      [0.05, d, -w / 2 + 0.06, d / 2],  // left
      [0.05, d, w / 2 - 0.06, d / 2],   // right
    ];
    for (const [bw, bd, cx, cz] of runs) {
      it.push({ geom: box(bw, cap, bd + (bw > 0.1 ? 0 : 0), { segY: 1 }), x: cx, y: 0.06 + GUARD_H, z: cz });
      it.push({ geom: box(bw * 1.0, shoe, bd, { segY: 1 }), x: cx, y: 0.06, z: cz });
    }
    B.definePart(ids.rail, compose(it), 'aluminum');
  }
  return ids;
}

// free-standing glass windscreen / terrace guard, panel plane at z = 0
function defineWindscreen(B, len, h) {
  const id = `glasstower:wsc:${len}x${h}`;
  if (B.hasPart(id)) return { glass: id, rail: `${id}:rail` };
  const g = quad(len - 0.06, h - 0.16);
  g.translate(0, 0.14, 0);
  B.definePart(id, g, 'glasstower:guard', { castShadow: false });
  const it = [];
  it.push({ geom: box(len, 0.05, 0.07, { segY: 1 }), x: 0, y: h - 0.02, z: 0 });
  it.push({ geom: box(len, 0.13, 0.09, { segY: 1 }), x: 0, y: 0, z: 0 });
  for (const s of [-1, 1]) it.push({ geom: box(0.055, h, 0.055, { segY: 1 }), x: s * (len / 2 - 0.03), y: 0, z: 0 });
  B.definePart(`${id}:rail`, compose(it), 'aluminum');
  return { glass: id, rail: `${id}:rail` };
}

// juliet balcony: guard only, 0.45 m projection
function defineJuliet(B, w) {
  const ids = { glass: `glasstower:juliet:${w}:glass`, rail: `glasstower:juliet:${w}:rail` };
  const d = 0.45;
  if (!B.hasPart(ids.glass)) {
    const g = quad(w - 0.08, GUARD_H - 0.10);
    g.translate(0, 0.15, d);
    B.definePart(ids.glass, g, 'glasstower:guard', { castShadow: false });
    const it = [];
    it.push({ geom: box(w, 0.05, 0.06, { segY: 1 }), x: 0, y: 0.06 + GUARD_H, z: d });
    it.push({ geom: box(w, 0.10, 0.07, { segY: 1 }), x: 0, y: 0.06, z: d });
    for (const s of [-1, 1]) {
      it.push({ geom: box(0.05, GUARD_H, 0.05, { segY: 1 }), x: s * (w / 2 - 0.03), y: 0.06, z: d });
      it.push({ geom: box(0.05, 0.05, d, { segY: 1 }), x: s * (w / 2 - 0.03), y: 0.06 + GUARD_H, z: d / 2 });
    }
    B.definePart(ids.rail, compose(it), 'aluminum');
  }
  return ids;
}

// ---------------------------------------------------------------------------
// roof kit
// ---------------------------------------------------------------------------
function defineMech(B, w, d, h) {
  const id = `glasstower:mech:${w}x${d}x${h}`;
  if (B.hasPart(id)) return id;
  const it = [];
  const core = box(w - 0.14, h, d - 0.14, { segY: 1 });
  ensureColor(core, new THREE.Color(0.10, 0.105, 0.11));
  it.push({ geom: core, x: 0, y: 0, z: 0 });
  // 45-degree louver blades on all four faces, coarse pitch for tri budget
  const pitch = 0.34;
  for (let y = 0.22; y < h - 0.22; y += pitch) {
    it.push({ geom: box(w, 0.055, 0.11, { segY: 1 }), x: 0, y, z: d / 2 - 0.055, rx: -0.6 });
    it.push({ geom: box(w, 0.055, 0.11, { segY: 1 }), x: 0, y, z: -d / 2 + 0.055, rx: 0.6 });
    it.push({ geom: box(0.11, 0.055, d, { segY: 1 }), x: w / 2 - 0.055, y, z: 0, rz: 0.6 });
    it.push({ geom: box(0.11, 0.055, d, { segY: 1 }), x: -w / 2 + 0.055, y, z: 0, rz: -0.6 });
  }
  // frame: corner posts + head/base rails + coping
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      it.push({ geom: box(0.11, h, 0.11, { segY: 1 }), x: sx * (w / 2 - 0.05), y: 0, z: sz * (d / 2 - 0.05) });
    }
  }
  it.push({ geom: box(w + 0.10, 0.10, d + 0.10, { segY: 1 }), x: 0, y: h, z: 0 });
  it.push({ geom: box(w, 0.13, d, { segY: 1 }), x: 0, y: 0, z: 0 });
  B.definePart(id, compose(it), 'glasstower:louver');
  return id;
}

function defineCoolingTower(B) {
  const id = 'glasstower:ctower';
  if (B.hasPart(id)) return id;
  const it = [];
  const w = 4.2, d = 2.44, h = 2.9;
  const core = box(w - 0.1, h, d - 0.1, { segY: 1 });
  ensureColor(core, new THREE.Color(0.12, 0.125, 0.13));
  it.push({ geom: core, x: 0, y: 0, z: 0 });
  for (let y = 0.3; y < h - 0.3; y += 0.4) {
    it.push({ geom: box(w, 0.07, 0.10, { segY: 1 }), x: 0, y, z: d / 2 - 0.05, rx: -0.5 });
    it.push({ geom: box(w, 0.07, 0.10, { segY: 1 }), x: 0, y, z: -d / 2 + 0.05, rx: 0.5 });
  }
  it.push({ geom: box(w, 0.12, d, { segY: 1 }), x: 0, y: 0, z: 0 });
  it.push({ geom: box(w + 0.08, 0.12, d + 0.08, { segY: 1 }), x: 0, y: h, z: 0 });
  for (const sx of [-1, 1]) {
    it.push({ geom: cylinder(0.62, 0.66, 0.42, 12), x: sx * w * 0.24, y: h + 0.1, z: 0 });
    const grate = cylinder(0.58, 0.58, 0.04, 12);
    ensureColor(grate, new THREE.Color(0.14, 0.145, 0.15));
    it.push({ geom: grate, x: sx * w * 0.24, y: h + 0.5, z: 0 });
  }
  B.definePart(id, compose(it), 'glasstower:louver');
  return id;
}

function defineScreen(B, len) {
  const id = `glasstower:screen:${len}`;
  if (B.hasPart(id)) return id;
  const it = [];
  const h = 2.9;
  for (let y = 0.18; y < h - 0.1; y += 0.28) {
    it.push({ geom: box(len, 0.07, 0.06, { segY: 1 }), x: 0, y, z: 0, rx: -0.55 });
  }
  const n = Math.max(2, Math.round(len / 1.83));
  for (let i = 0; i <= n; i++) {
    it.push({ geom: box(0.10, h, 0.10, { segY: 1 }), x: -len / 2 + (len / n) * i, y: 0, z: 0 });
  }
  it.push({ geom: box(len, 0.08, 0.13, { segY: 1 }), x: 0, y: h, z: 0 });
  B.definePart(id, compose(it), 'glasstower:louver');
  return id;
}

function defineDavit(B) {
  const id = 'glasstower:davit';
  if (B.hasPart(id)) return id;
  const it = [];
  it.push({ geom: box(0.5, 0.10, 0.5, { segY: 1 }), x: 0, y: 0, z: 0 });
  it.push({ geom: cylinder(0.06, 0.07, 1.35, 8), x: 0, y: 0.1, z: 0 });
  it.push({ geom: cylinder(0.05, 0.05, 2.3, 8), x: 0, y: 1.4, z: 1.1, rx: Math.PI / 2 });
  it.push({ geom: cylinder(0.05, 0.05, 1.0, 8), x: 0, y: 0.95, z: 0.55, rx: Math.PI / 4 });
  it.push({ geom: cylinder(0.09, 0.09, 0.06, 8), x: 0, y: 1.3, z: 2.2 });
  B.definePart(id, compose(it), 'aluminum');
  return id;
}

function definePlanter(B) {
  const id = 'glasstower:planter';
  if (B.hasPart(id)) return id;
  const it = [];
  const b = box(1.05, 0.72, 1.05, { segY: 1 });
  boxUV(b, 1.05, 0.72, 1.05, 2);
  it.push({ geom: b, x: 0, y: 0, z: 0 });
  const soil = box(0.92, 0.06, 0.92, { segY: 1 });
  ensureColor(soil, new THREE.Color(0.10, 0.09, 0.07));
  it.push({ geom: soil, x: 0, y: 0.7, z: 0 });
  B.definePart(id, compose(it), 'glasstower:precast');
  return id;
}

function defineShrub(B) {
  const id = 'glasstower:shrub';
  if (B.hasPart(id)) return id;
  const a = quad(1.5, 1.3), b = quad(1.5, 1.3);
  b.rotateY(Math.PI / 2);
  const c = quad(1.2, 1.0); c.rotateY(Math.PI / 4);
  B.definePart(id, compose([
    { geom: a, x: 0, y: 0, z: 0 }, { geom: b, x: 0, y: 0, z: 0 }, { geom: c, x: 0, y: 0.15, z: 0 },
  ]), 'canopy', { castShadow: false });
  return id;
}

function defineChair(B) {
  const id = 'glasstower:chair';
  if (B.hasPart(id)) return id;
  const it = [];
  it.push({ geom: box(0.52, 0.05, 0.50, { segY: 1 }), x: 0, y: 0.42, z: 0 });
  it.push({ geom: box(0.52, 0.52, 0.05, { segY: 1 }), x: 0, y: 0.45, z: -0.22 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    it.push({ geom: box(0.04, 0.42, 0.04, { segY: 1 }), x: sx * 0.22, y: 0, z: sz * 0.21 });
  }
  B.definePart(id, compose(it), 'paintFlat');
  return id;
}

function defineTable(B) {
  const id = 'glasstower:table';
  if (B.hasPart(id)) return id;
  const it = [];
  it.push({ geom: cylinder(0.32, 0.32, 0.05, 12), x: 0, y: 0.70, z: 0 });
  it.push({ geom: cylinder(0.04, 0.05, 0.70, 8), x: 0, y: 0, z: 0 });
  it.push({ geom: cylinder(0.22, 0.22, 0.03, 10), x: 0, y: 0, z: 0 });
  B.definePart(id, compose(it), 'aluminum');
  return id;
}

// flood vent / engineered louver, 0.41 x 0.20 m
function defineFloodVent(B) {
  const id = 'glasstower:floodvent';
  if (B.hasPart(id)) return id;
  const it = [];
  const back = box(0.44, 0.23, 0.03, { segY: 1 });
  ensureColor(back, DARKI);
  it.push({ geom: back, x: 0, y: 0, z: -0.03 });
  it.push({ geom: box(0.46, 0.03, 0.05, { segY: 1 }), x: 0, y: 0.22, z: 0 });
  it.push({ geom: box(0.46, 0.03, 0.05, { segY: 1 }), x: 0, y: -0.01, z: 0 });
  for (const s of [-1, 1]) it.push({ geom: box(0.03, 0.25, 0.05, { segY: 1 }), x: s * 0.215, y: -0.01, z: 0 });
  for (let i = 0; i < 3; i++) {
    it.push({ geom: box(0.40, 0.025, 0.05, { segY: 1 }), x: 0, y: 0.04 + i * 0.055, z: 0.005, rx: -0.5 });
  }
  B.definePart(id, compose(it), 'aluminum');
  return id;
}

// podium punched window: dark aluminium frame + glass, real 0.15 m reveal
function definePodWindow(B, w, h) {
  const ids = { f: `glasstower:pwin:${w}x${h}`, g: `glasstower:pwin:${w}x${h}:glass` };
  if (!B.hasPart(ids.f)) {
    const it = [];
    const rd = 0.16;
    const back = box(w + 0.04, h + 0.04, 0.03, { segY: 1 });
    ensureColor(back, DARKI);
    it.push({ geom: back, x: 0, y: -0.02, z: -rd - 0.05 });
    const fw = 0.055;
    it.push({ geom: box(w, fw, 0.07, { segY: 1 }), x: 0, y: h - fw, z: -rd + 0.035 });
    it.push({ geom: box(w, fw * 1.3, 0.09, { segY: 1 }), x: 0, y: 0, z: -rd + 0.045 });
    it.push({ geom: box(fw, h, 0.07, { segY: 1 }), x: -w / 2 + fw / 2, y: 0, z: -rd + 0.035 });
    it.push({ geom: box(fw, h, 0.07, { segY: 1 }), x: w / 2 - fw / 2, y: 0, z: -rd + 0.035 });
    const nm = Math.max(0, Math.round(w / 2.4) - 1);
    for (let i = 1; i <= nm; i++) {
      it.push({ geom: box(0.05, h - fw, 0.07, { segY: 1 }), x: -w / 2 + (w / (nm + 1)) * i, y: fw, z: -rd + 0.035 });
    }
    B.definePart(ids.f, compose(it), 'glasstower:mullion');
    const g = quad(w - fw, h - fw * 1.6);
    g.translate(0, fw * 1.3, -rd + 0.005);
    B.definePart(ids.g, g, 'glasstower:vision', { castShadow: false });
  }
  return ids;
}

// lobby / storefront mullion (full-height, slim)
function defineLobbyMullion(B, h) {
  const id = `glasstower:lmul:${h}`;
  if (B.hasPart(id)) return id;
  const it = [];
  it.push({ geom: box(0.085, h, 0.15, { segY: 1 }), x: 0, y: 0, z: 0 });
  B.definePart(id, compose(it), 'glasstower:mullion');
  return id;
}

// ---------------------------------------------------------------------------
// main generator
// ---------------------------------------------------------------------------
export function generate(ctx, lot, rng) {
  ensureMaterials(ctx);
  const B = ctx.batcher, K = ctx.kit, F = lot.frame;
  const W = lot.width, D = lot.depth;

  // ---- seed-level design decisions ---------------------------------------
  const variant = rng.weighted([['slab', 32], ['stepped', 26], ['twin', 24], ['nopodium', 18]]);
  const mw = rng.weighted([[1.40, 22], [1.55, 46], [1.80, 32]]);
  const treat = rng.weighted([['sp', 46], ['acm', 34], ['conc', 20]]);

  const totalStories = lot.stories || rng.weighted([[13, 2], [15, 3], [17, 3], [19, 4], [21, 3], [23, 2]]);
  const podStories = variant === 'nopodium' ? 2 : Math.min(5, Math.max(2, rng.int(3, 5)));
  const nTower = Math.max(5, totalStories - podStories);

  const baseH = rng.range(0.80, 1.30);                       // raised flood base
  const groundH = rng.range(4.7, 5.7);                       // double-height lobby
  const podFtf = rng.range(3.35, 3.70);
  const groundTop = baseH + groundH;
  const podiumTop = groundTop + (podStories - 1) * podFtf;

  const frontSet = variant === 'nopodium' ? rng.range(0.7, 1.1) : rng.range(1.7, 3.4);
  const sideInset = variant === 'nopodium' ? rng.range(0.5, 0.9) : rng.range(1.5, 2.6);
  const rearInset = variant === 'nopodium' ? 0.5 : rng.range(0.8, 1.6);

  // tower plan snapped to a whole number of facade modules (no half modules),
  // clamped so the tower can never break the lot line / podium parapet
  const nx = Math.max(4, Math.min(Math.floor((W - 0.8) / mw), Math.round((W - 2 * sideInset) / mw)));
  const nz = Math.max(3, Math.min(Math.floor((D - frontSet - 0.45) / mw), Math.round((D - frontSet - rearInset) / mw)));
  const towerW = nx * mw, towerD = nz * mw;
  const tz1 = -frontSet, tz0 = tz1 - towerD;
  const tx0 = -towerW / 2, tx1 = towerW / 2;

  const parapetH = rng.range(1.07, 1.32);
  const towerTop = podiumTop + nTower * FTF;
  const H = towerTop + parapetH;

  // ---- palettes ----------------------------------------------------------
  // Reweighted blue: at distance real glass towers are the BLUEST and among the
  // darkest objects in a skyline; the old warm/pale families made them the
  // palest and warmest, so they lost the typology entirely past ~400 m.
  const glassFamily = rng.weighted([
    [0x9db5b1, 34], [0x5c7d9c, 22], [0x4a6272, 16], [0x7d8386, 16],
    [0xc3d6d2, 7], [0x6b5b46, 5],
  ]);
  // NOT a surface colour — the transmitted interior/blind tone behind the glass
  const gBase = scaleL(C(glassFamily), rng.range(0.30, 0.42));
  const spanBase = C(rng.weighted([
    [0x34383b, 26], [0x1c1e20, 18], [0x7c8285, 16], [0x3f403c, 10],
    [0x4a3c2e, 10], [0x4e5b68, 8], [0x55625c, 6], [0xd8d9d5, 6],
  ]));
  const mullBase = C(rng.weighted([
    [0xa5a8aa, 30], [0x3b332b, 24], [0x232527, 22], [0xb09a72, 14], [0xcdcdc9, 10],
  ]));
  const acmBase = C(rng.weighted([
    [0x585c5e, 22], [0x7f6a4c, 16], [0x2b2d2f, 14], [0xb8a583, 12],
    [0xdcdcd8, 12], [0xa8abad, 10], [0x7d8385, 8], [0xa4643c, 6],
  ]));
  const precBase = C(rng.weighted([[0xbdb7ab, 30], [0xaba69e, 22], [0x9c988f, 18], [0xc9c4b9, 16], [0x84817b, 14]]));
  // real laminated guard glass reads mid grey-green at an angle, not near-white:
  // 15 stacked panels of a near-white guard sum to a solid white wall
  const guardBase = C(0x93a2a0);

  const podMat = rng.weighted([
    ['brickBrown', 16], ['brickTan', 8], ['brickRed', 8],
    ['glasstower:acm', 30], ['glasstower:precast', 26], ['graniteBase', 6], ['concrete', 6],
  ]);
  const podIsBrick = podMat.startsWith('brick');
  const podTint = podIsBrick
    ? C(rng.weighted([[0x8b7a70, 24], [0x6f6058, 18], [0xa89a86, 16], [0x7d6f66, 16], [0x9a8f80, 16], [0xc0b6a4, 10]]))
    : (podMat === 'glasstower:acm' ? acmBase.clone() : podMat === 'glasstower:precast' ? precBase.clone() : C(0xb2ada4));
  const baseCladMat = rng.weighted([['glasstower:precast', 34], ['graniteBase', 24], ['limestone', 16], ['concrete', 14], ['glasstower:acm', 12]]);
  const baseCladTint = baseCladMat === 'glasstower:precast' ? precBase.clone()
    : baseCladMat === 'glasstower:acm' ? acmBase.clone() : C(rng.weighted([[0x9a968f, 3], [0xb4afa6, 3], [0x807d78, 2]]));

  // ---- balcony program ---------------------------------------------------
  // 'every' de-weighted: a balcony on every unit on every floor serrates the
  // distant silhouette into a torn fringe; stacks/bands keep a clean edge.
  const balPattern = rng.weighted([
    ['every', 12], ['checker', 18], ['stacks', 24], ['bands', 18],
    ['corners', 12], ['juliet', 10], ['none', 6],
  ]);
  const bk = rng.weighted([[2, 55], [3, 45]]);                // modules per balcony
  const balW = q05(bk * mw);
  const balIds = (balPattern === 'none' || balPattern === 'juliet') ? null : defineBalcony(B, balW);
  const julIds = (balPattern === 'juliet' || rng.bool(0.35)) ? defineJuliet(B, q05(mw)) : null;
  const skipLow = rng.bool(0.65) ? 2 : 0;
  const stackSet = new Set();
  if (balPattern === 'stacks') {
    const nStacks = rng.int(1, 2);
    for (let i = 0; i < nStacks; i++) stackSet.add(rng.int(0, Math.max(0, Math.floor(nx / bk) - 1)));
  }
  const finProj = q05(rng.range(0.10, 0.16));
  const finIds = rng.bool(0.22);
  const finEvery = rng.bool(0.4) ? 1 : 2;

  const ids = defineModule(B, mw, treat);
  const cornerStyle = rng.weighted([['butt', 34], ['mullion', 34], ['spandrel', 18], ['chamfer', 14]]);

  // =======================================================================
  // curtain wall
  // =======================================================================
  const tiltE = new THREE.Euler();
  const tiltM = new THREE.Matrix4();
  const glassMatrix = (m) => {
    // +/- 0.6 deg per-pane normal tilt about the pane centre: 3-8% of panes end
    // up reflecting a visibly different patch of sky. This is the shimmer.
    tiltE.set(rng.range(-0.011, 0.011), rng.range(-0.013, 0.013), 0);
    tiltM.makeRotationFromEuler(tiltE);
    const cy = VIS_Y0 + VIS_H / 2;
    return m.clone()
      .multiply(tmat(0, cy, -GSET))
      .multiply(tiltM)
      .multiply(tmat(0, -cy, GSET));
  };

  // Blind / room tone behind one pane. Coherent per UNIT (2-4 contiguous
  // modules share a blind colour, as a real apartment does) plus a smooth
  // reflected-sky ramp with height — the old per-pane random walk read as a
  // colour chart, and its bright outliers read as holes punched in the tower.
  const unitTints = new Map();
  const paneTint = (floorFrac, face = 0, i = 0, k = 0) => {
    const key = `${face}:${Math.floor(i / 3)}:${k}`;
    let base = unitTints.get(key);
    if (!base) {
      const roll = rng.next();
      if (roll < 0.028) base = scaleL(C(0xc8cdcb), 0.40);            // fogged IGU
      else if (roll < 0.11) base = scaleL(gBase, rng.range(1.5, 1.9)); // pale blinds
      else if (roll < 0.20) base = scaleL(gBase, rng.range(0.52, 0.74)); // blackout
      else base = jitter(rng, gBase, 0.09, 0.008, 0.05);
      unitTints.set(key, base);
    }
    const c = jitter(rng, base, 0.05, 0.004, 0.02);
    const g2 = scaleL(c, 0.90 + 0.24 * floorFrac);                  // sky ramp
    if (floorFrac < 0.35) g2.lerp(C(0x8f9d9c), 0.07 * (1 - floorFrac / 0.35));
    g2.getHSL(HSL);
    if (HSL.l > 0.40) g2.setHSL(HSL.h, HSL.s, 0.40);                // no holes
    return g2;
  };

  // night lighting is sampled PER UNIT (3 contiguous modules), not per module
  const litUnits = new Map();
  const litFor = (face, i, k) => {
    const key = `${face}:${Math.floor(i / 3)}:${k}`;
    if (!litUnits.has(key)) litUnits.set(key, rng.bool(0.42));
    return litUnits.get(key) && rng.bool(0.75);
  };

  // per-building offset into the baked cell grid so two neighbours never share
  // the same pane pattern
  const cwSeed = rng.int(0, 3), cwSeed2 = rng.int(0, 3);
  // reference tone the spandrel bands are pulled toward (keeps the distant
  // light/dark step inside 5-10% instead of 25%)
  const spandrelRef = scaleL(gBase, 0.78);

  // one volume of curtain wall. faces = [front, rear, left, right]
  function cladVolume(v) {
    const {
      x0, x1, z0, z1, yBase, nf, faces = [1, 1, 1, 1], skip = null,
      balcFaces = [1, 0, 1, 1], floor0 = 0,
    } = v;
    const vnx = Math.round((x1 - x0) / mw), vnz = Math.round((z1 - z0) / mw);
    const runs = [
      { n: vnx, ry: 0, pos: (i) => [x0 + mw * (i + 0.5), z1] },
      { n: vnx, ry: Math.PI, pos: (i) => [x1 - mw * (i + 0.5), z0] },
      { n: vnz, ry: -Math.PI / 2, pos: (i) => [x0, z0 + mw * (i + 0.5)] },
      { n: vnz, ry: Math.PI / 2, pos: (i) => [x1, z1 - mw * (i + 0.5)] },
    ];
    // dark core so module joints never show daylight through the building
    const cw = x1 - x0 - 0.42, cd = z1 - z0 - 0.42;
    if (cw > 0.5 && cd > 0.5) {
      const core = box(cw, nf * FTF + 0.4, cd, { segY: 1 });
      B.addMerged('glasstower:spandrel', core, at(F, (x0 + x1) / 2, yBase - 0.2, (z0 + z1) / 2), { tint: C(0x101214) });
    }
    // corner mullion posts (swallow the module mullion that lands on the corner)
    if (cornerStyle !== 'butt') {
      // narrower + darker: a 0.29 m bright-metal post running the full height
      // clipped to white and read as a seam down the middle of the elevation
      const cwid = cornerStyle === 'mullion' ? 0.105 : 0.085;
      const cmat = cornerStyle === 'spandrel' ? 'glasstower:spandrel' : 'glasstower:mullion';
      const ctint = cornerStyle === 'spandrel' ? spanBase : scaleL(mullBase, 0.74);
      for (const cx of [x0, x1]) {
        for (const cz of [z0, z1]) {
          const g = box(cwid * 2, nf * FTF, cwid * 2, { segY: 1 });
          B.addMerged(cmat, g, at(F, cx, yBase, cz), { tint: ctint, worldUV: false });
        }
      }
    }
    // ---- ONE baked panel for a contiguous run of modules -------------------
    // Replaces n x (frame + spandrel + glass) instances with 1 quad + 1 real
    // slab-edge band. The band is what keeps a genuine per-floor shadow line
    // (0.72 m tall — far too coarse to alias) once the mullions are baked.
    const bakedRun = (fi, run, i0, i1, y, gk, ff) => {
      const n = i1 - i0 + 1;
      const pa = run.pos(i0), pb = run.pos(i1);
      const cx = (pa[0] + pb[0]) / 2, cz = (pa[1] + pb[1]) / 2;
      const wRun = n * mw;
      const col = (cwSeed + gk * 3 + fi * 5 + i0) % CW_NU;
      const row = (cwSeed2 + gk + fi * 2) % CW_NV;
      const uv = {
        u0: col / CW_NU, u1: (col + n) / CW_NU,
        v0: row / CW_NV, v1: (row + 1) / CW_NV,
      };
      // per-panel reflectivity jitter (the baked texture carries the per-pane
      // variation inside the panel; this is the panel-to-panel variation)
      B.addMerged('glasstower:cwtex', quad(wRun, FTF, uv),
        at(F, cx, y, cz, run.ry).multiply(tmat(0, 0, -0.02)),
        { tint: paneTint(ff, fi, i0, gk), worldUV: false });
      // Real slab-edge / spandrel cover band, proud of the glass plane. Its
      // tint is pulled 42% toward the glass tone and clamped darker than the
      // pane: at full material value these bands resolved at 1-2 km as a hard
      // light/dark zebra and the towers read as corrugated grain silos.
      const bm = treat === 'acm' ? 'glasstower:acm'
        : treat === 'conc' ? 'glasstower:precast' : 'glasstower:spandrel';
      const bt = jitter(rng, treat === 'acm' ? acmBase : treat === 'conc' ? precBase : spanBase,
        0.06, 0.004, 0.02).lerp(spandrelRef, 0.42);
      bt.getHSL(HSL);
      if (HSL.l > 0.30) bt.setHSL(HSL.h, HSL.s, 0.30);
      B.addMerged(bm, box(wRun, SPAND, 0.07, { segY: 1 }),
        at(F, cx, y, cz, run.ry).multiply(tmat(0, 0, 0.002)), { tint: bt });
      if (treat === 'conc') {                      // shadow eyebrow under the slab
        B.addMerged('glasstower:precast', box(wRun, 0.09, 0.18, { segY: 1 }),
          at(F, cx, y, cz, run.ry).multiply(tmat(0, SPAND - 0.09, 0.10)), { tint: bt });
      }
      // lit units, one chunky quad per 3 modules (no sub-pixel sparkle).
      // Dimmed hard: a 3-module unit is ~15x the area of one pane, so the same
      // tint that read as a warm window below reads as an orange billboard here.
      for (let u = i0; u <= i1; u += 3) {
        const u2 = Math.min(i1, u + 2);
        if (!litFor(fi, u, gk) || !rng.bool(0.5)) continue;
        const qa = run.pos(u), qb = run.pos(u2);
        const lw = (u2 - u + 1) * mw - 0.26;
        B.addMerged('litWindow', quad(lw, VIS_H - 0.10),
          at(F, (qa[0] + qb[0]) / 2, y, (qa[1] + qb[1]) / 2, run.ry)
            .multiply(tmat(0, VIS_Y0 + 0.05, -0.013)),
          // low saturation on purpose: at 3 modules wide a fully saturated warm
          // tint reads as an orange billboard, not a room with the lights on
          {
            tint: new THREE.Color().setHSL(
              0.085 + rng.range(-0.012, 0.012), rng.range(0.10, 0.22), rng.range(0.20, 0.30)),
            worldUV: false,
          });
      }
    };

    // ---- projecting fins run the FULL tower height as one merged box each ---
    // (per-floor fin instances were 0.032 m x 20 storeys of sub-pixel specks)
    if (finIds) {
      for (let fi = 0; fi < 4; fi++) {
        if (!faces[fi]) continue;
        const run = runs[fi];
        for (let i = 0; i < run.n; i += finEvery) {
          if (skip && (skip(fi, i, 0) || skip(fi, i, nf - 1))) continue;
          const [px, pz] = run.pos(i);
          // 0.07 x 0.10-0.16: at the old 0.09 x 0.26 an oblique view read the
          // fin+shadow as a 0.25-0.30 m mullion, i.e. a 1965 storefront picket
          B.addMerged('glasstower:mullion',
            box(0.07, nf * FTF, finProj, { segY: 1 }),
            at(F, px, yBase, pz, run.ry).multiply(tmat(-mw / 2, 0, finProj / 2 + CAP)),
            { tint: scaleL(jitter(rng, mullBase, 0.05, 0.004, 0.02), 0.82), worldUV: false });
        }
      }
    }

    for (let fi = 0; fi < 4; fi++) {
      if (!faces[fi]) continue;
      const run = runs[fi];
      for (let k = 0; k < nf; k++) {
        const y = yBase + k * FTF;
        const gk = floor0 + k;                    // global tower floor index
        const ff = nf > 1 ? k / (nf - 1) : 1;
        if (gk < LOD_F) {
          for (let i = 0; i < run.n; i++) {
            if (skip && skip(fi, i, k)) continue;
            const [px, pz] = run.pos(i);
            const m = at(F, px, y, pz, run.ry);
            B.addInstance(ids.frame, m, jitter(rng, mullBase, 0.05, 0.004, 0.02));
            B.addInstance(ids.span, m, jitter(rng, treat === 'acm' ? acmBase : treat === 'conc' ? precBase : spanBase, 0.07, 0.004, 0.02));
            B.addInstance(ids.glass, glassMatrix(m), paneTint(ff, fi, i, gk));
            if (litFor(fi, i, gk)) B.addInstance(ids.lit, m, new THREE.Color().setHSL(0.085 + rng.range(-0.012, 0.012), rng.range(0.14, 0.28), rng.range(0.30, 0.44)));
          }
        } else {
          let i0 = -1;
          for (let i = 0; i <= run.n; i++) {
            const on = i < run.n && !(skip && skip(fi, i, k));
            if (on && i0 < 0) i0 = i;
            if (!on && i0 >= 0) { bakedRun(fi, run, i0, i - 1, y, gk, ff); i0 = -1; }
          }
        }
        // ---- balconies -------------------------------------------------
        if (!balcFaces[fi] || balPattern === 'none') continue;
        if (k < skipLow || k >= nf - 1) continue;
        const nUnits = Math.floor(run.n / bk);
        for (let u = 0; u < nUnits; u++) {
          let on = false;
          if (balPattern === 'every') on = true;
          else if (balPattern === 'checker') on = (u + k) % 2 === 0;
          else if (balPattern === 'bands') on = k % 2 === 1;
          else if (balPattern === 'stacks') on = stackSet.has(u);
          else if (balPattern === 'corners') on = fi < 2 && (u === 0 || u === nUnits - 1);
          if (!on) continue;
          const i0 = u * bk;
          if (skip && skip(fi, i0, k)) continue;
          const [ax] = run.pos(i0), [, az] = run.pos(i0);
          const [bx2, bz2] = run.pos(i0 + bk - 1);
          const cx = (ax + bx2) / 2, cz = (az + bz2) / 2;
          const yF = y + 0.50;                       // finished floor of the unit
          const m = at(F, cx, yF, cz, run.ry);
          B.addInstance(balIds.slab, m, scaleL(jitter(rng, precBase, 0.05, 0.004, 0.02), 0.84));
          B.addInstance(balIds.glass, m, rng.bool(0.12) ? scaleL(guardBase, 0.62) : jitter(rng, guardBase, 0.06));
          B.addInstance(balIds.rail, m, mullBase);
          // clutter — the only saturated colour on the building. Above the LOD
          // line only the chunky items: thin chair/table legs up there are
          // sub-pixel specks that read as noise on the skyline.
          if (rng.bool(gk >= LOD_F ? 0.38 : 0.55)) {
            const nItems = rng.int(1, 3);
            for (let c2 = 0; c2 < nItems; c2++) {
              const ox = rng.range(-balW / 2 + 0.45, balW / 2 - 0.45);
              const oz = rng.range(0.45, BAL_D - 0.45);
              const pick = gk >= LOD_F ? 0.62 + rng.next() * 0.38 : rng.next();
              const mm = at(F, cx, yF + 0.06, cz, run.ry).clone().multiply(tmat(ox, 0, oz, rng.range(0, 6.28)));
              if (pick < 0.42) B.addInstance(defineChair(B), mm, C(rng.pick([0xb8b4ac, 0x2f3134, 0x8a5a3a, 0x39544a, 0xa83c30, 0x2f4f78])));
              else if (pick < 0.62) B.addInstance(defineTable(B), mm, C(0x8e9294));
              else if (pick < 0.86) {
                B.addInstance(definePlanter(B), mm.clone().multiply(tmat(0, 0, 0, 0, 0.45, 0.55, 0.45)), C(rng.pick([0x8f5a3c, 0x6d6a63, 0xd8d4c8])));
                B.addInstance(defineShrub(B), mm.clone().multiply(tmat(0, 0.4, 0, 0, 0.45, 0.5, 0.45)), C(rng.pick([0x86a04e, 0x6f8f4a, 0x9aa85a])));
              } else {
                const bx = box(0.42, 0.36, 0.32, { segY: 1 });
                B.addMerged('paintFlat', bx, mm, { tint: C(rng.pick([0xa88a5e, 0x8e8a80])), worldUV: false });
              }
            }
          }
        }
      }
      // juliet guards where there is no projecting balcony. Thinned out above
      // the LOD line — a 0.05 m bright aluminium post on every high floor is
      // the other half of the skyline sparkle.
      // Julietsstack in fixed module COLUMNS — one balcony door per unit,
      // repeated up the shaft. Scattering them randomly per module per floor
      // (the old behaviour) produced 40+ unstacked boxes straddling spandrel
      // bands and corner mullions, which read as taped-up paper.
      if (julIds && balcFaces[fi]) {
        const nCol = balPattern === 'juliet'
          ? Math.max(1, Math.min(4, Math.round(run.n / 4)))
          : (rng.bool(0.45) ? 1 : 0);
        const cols = [];
        for (let c3 = 0; c3 < nCol; c3++) {
          const ci = rng.int(1, Math.max(1, run.n - 2));
          if (!cols.includes(ci)) cols.push(ci);
        }
        for (const i of cols) {
          for (let k = Math.max(1, skipLow); k < nf; k++) {
            if (skip && skip(fi, i, k)) continue;
            if (!rng.bool(0.9)) continue;               // occasional gap
            const [px, pz] = run.pos(i);
            const m = at(F, px, yBase + k * FTF + 0.50, pz, run.ry);
            B.addInstance(julIds.glass, m, jitter(rng, guardBase, 0.06));
            B.addInstance(julIds.rail, m, scaleL(mullBase, 0.8));
          }
        }
      }
    }
  }

  // ---- volumes per massing variant ---------------------------------------
  const roofs = [];   // {x0,x1,z0,z1,y,main}
  if (variant === 'stepped') {
    const kStep = Math.max(3, Math.round(nTower * rng.range(0.55, 0.68)));
    const stepMods = rng.int(1, 2);
    const ux0 = tx0 + stepMods * mw, ux1 = tx1 - stepMods * mw;
    const uz1 = tz1 - stepMods * mw;
    cladVolume({ x0: tx0, x1: tx1, z0: tz0, z1: tz1, yBase: podiumTop, nf: kStep });
    cladVolume({ x0: ux0, x1: ux1, z0: tz0, z1: uz1, yBase: podiumTop + kStep * FTF, nf: nTower - kStep, floor0: kStep });
    roofs.push({ x0: tx0, x1: tx1, z0: tz0, z1: tz1, y: podiumTop + kStep * FTF, terrace: true, hole: [ux0, ux1, tz0, uz1] });
    roofs.push({ x0: ux0, x1: ux1, z0: tz0, z1: uz1, y: towerTop, main: true });
  } else if (variant === 'twin') {
    const nA = Math.max(2, Math.round(nx * rng.range(0.45, 0.6)));
    const xm = tx0 + nA * mw;
    const projMods = 1;
    const bz1 = tz1 - projMods * mw;
    const nfB = Math.max(4, nTower - rng.int(3, 6));
    // volume A (taller, forward)
    cladVolume({
      x0: tx0, x1: xm, z0: tz0, z1: tz1, yBase: podiumTop, nf: nTower,
      skip: (fi, i, k) => fi === 3 && k < nfB && mw * (i + 0.5) > projMods * mw,
      balcFaces: [1, 0, 1, 1],
    });
    // volume B (shorter, recessed) — its left face is buried in A
    cladVolume({
      x0: xm, x1: tx1, z0: tz0, z1: bz1, yBase: podiumTop, nf: nfB,
      faces: [1, 1, 0, 1], balcFaces: [1, 0, 0, 1],
    });
    roofs.push({ x0: xm, x1: tx1, z0: tz0, z1: bz1, y: podiumTop + nfB * FTF, terrace: true });
    roofs.push({ x0: tx0, x1: xm, z0: tz0, z1: tz1, y: towerTop, main: true });
  } else {
    cladVolume({ x0: tx0, x1: tx1, z0: tz0, z1: tz1, yBase: podiumTop, nf: nTower });
    roofs.push({ x0: tx0, x1: tx1, z0: tz0, z1: tz1, y: towerTop, main: true });
  }

  // =======================================================================
  // PODIUM + GROUND FLOOR
  // =======================================================================
  const wallD = 0.46;
  const rows = [];

  // -- ground floor: lobby (+ retail) glazing ------------------------------
  const gY0 = baseH + 0.06;
  const gY1 = baseH + groundH - 0.62;
  const gW = W - rng.range(1.5, 2.4);
  const nBay = Math.max(4, Math.round(gW / 1.55));
  const bayW = gW / nBay;
  const retail = !!lot.commercial;
  const dj = retail ? (rng.bool(0.5) ? 0 : nBay - 2) : Math.max(0, Math.min(nBay - 2, Math.round(nBay * rng.range(0.3, 0.7))));
  const doorX = -gW / 2 + bayW * (dj + 1);
  const doorW = 1.86, doorH = 2.52;

  rows.push({ y0: gY0, y1: gY1, openings: [{ x: 0, w: gW }] });

  // -- podium upper floors --------------------------------------------------
  const podWinStyle = rng.weighted([['ribbon', 46], ['punched', 54]]);
  const podRows = [];
  for (let p = 1; p < podStories; p++) {
    const yb = groundTop + (p - 1) * podFtf;
    const wy = yb + rng.range(0.85, 1.05);
    const wh = podWinStyle === 'ribbon' ? 1.95 : 2.15;
    const ops = [];
    if (podWinStyle === 'ribbon') {
      const n = rng.int(2, 3);
      const seg = (W - 2.4) / n;
      for (let i = 0; i < n; i++) ops.push({ x: -(W - 2.4) / 2 + seg * (i + 0.5), w: seg - 0.9 });
    } else {
      const n = Math.max(3, Math.round((W - 2.0) / 3.4));
      const seg = (W - 2.0) / n;
      for (let i = 0; i < n; i++) ops.push({ x: -(W - 2.0) / 2 + seg * (i + 0.5), w: Math.min(3.0, seg - 1.1) });
    }
    podRows.push({ y: wy, h: wh, ops });
    rows.push({ y0: wy, y1: wy + wh, openings: ops.map((o) => ({ x: o.x, w: o.w })) });
  }

  punchedWall(ctx, F, {
    width: W, height: podiumTop, depth: wallD, mat: podMat, tint: podTint,
    rows, grime: podIsBrick ? 0.30 : 0.22, aoTop: 0,
  });

  // podium windows
  for (const r of podRows) {
    for (const o of r.ops) {
      const pw = definePodWindow(B, q05(o.w), q05(r.h));
      const m = at(F, o.x, r.y, 0);
      B.addInstance(pw.f, m, scaleL(mullBase, 0.7));
      B.addInstance(pw.g, m, jitter(rng, gBase, 0.14, 0.008, 0.04));
      // PTAC / through-wall louver under the sill (central-plant buildings have
      // these, NOT window air conditioners)
      if (rng.bool(0.45)) {
        B.addInstance(defineFloodVent(B), at(F, o.x + rng.range(-o.w * 0.28, o.w * 0.28), r.y - 0.34, 0.02), scaleL(mullBase, 0.6));
      }
    }
    // precast sill band under ribbon windows
    if (podWinStyle === 'ribbon') {
      const sg = box(W - 1.4, 0.10, 0.10, { segY: 1 });
      B.addMerged(baseCladMat, sg, at(F, 0, r.y - 0.10, 0.03), { tint: baseCladTint });
    }
  }

  // -- flood-resistant base band -------------------------------------------
  {
    const g = box(W + 0.05, baseH, wallD + 0.10, { segY: 2 });
    boxUV(g, W + 0.05, baseH, wallD + 0.10, 2);
    B.addMerged(baseCladMat, g, at(F, 0, 0, 0.025 - (wallD + 0.10) / 2 + 0.025), { tint: baseCladTint, grime: 0.34 });
    // tide / flood stain line
    const st = box(W + 0.06, 0.14, 0.02, { segY: 1 });
    B.addMerged(baseCladMat, st, at(F, 0, Math.min(baseH - 0.22, 0.78), 0.045), { tint: scaleL(baseCladTint, 0.62) });
    // coping / drip at the top of the base band
    const cp = box(W + 0.13, 0.07, wallD + 0.18, { segY: 1 });
    boxUV(cp, W + 0.13, 0.07, wallD + 0.18, 2);
    B.addMerged(baseCladMat, cp, at(F, 0, baseH - 0.07, 0.06 - (wallD + 0.18) / 2 + 0.03), { tint: scaleL(baseCladTint, 1.06) });
    // engineered flood vents, bottom within 0.30 m of grade
    const fv = defineFloodVent(B);
    const vp = rng.range(2.1, 2.9);
    for (let x = -W / 2 + 1.4; x < W / 2 - 1.0; x += vp) {
      if (Math.abs(x - doorX) < 2.4) continue;
      B.addInstance(fv, at(F, x, rng.range(0.20, 0.30), 0.09), scaleL(mullBase, 0.55));
    }
  }

  // -- lobby interior (now genuinely visible: the ground-floor glazing below
  // uses the shared TRANSPARENT physical 'glass', not the opaque vision
  // material, so the room, the desk and the lit soffit read through it)
  {
    const iw = gW - 0.3, ih = gY1 - gY0;
    const bk1 = box(iw, ih + 0.5, 5.4, { segY: 1 });
    B.addMerged('glasstower:spandrel', bk1, at(F, 0, gY0 - 0.25, -5.9), { tint: C(0x0b0d0f), worldUV: false });
    for (const s of [-1, 1]) {                   // side walls close the room
      const sw = box(0.14, ih + 0.5, 5.6, { segY: 1 });
      B.addMerged('glasstower:spandrel', sw, at(F, s * (iw / 2 + 0.07), gY0 - 0.25, -2.9),
        { tint: C(0x0e1012), worldUV: false });
    }
    // warm feature wall + ceiling soffit + reception desk
    const fwx = box(iw * 0.55, ih * 0.80, 0.2, { segY: 1 });
    B.addMerged('paintFlat', fwx, at(F, -iw * 0.12, gY0 + 0.1, -5.3), { tint: C(0x4a3520), worldUV: false });
    const cel = box(iw, 0.3, 5.0, { segY: 1 });
    B.addMerged('paintFlat', cel, at(F, 0, gY1 - 0.55, -5.5), { tint: C(0x2a2724), worldUV: false });
    const desk = box(3.2, 1.05, 0.75, { segY: 1 });
    B.addMerged('paintFlat', desk, at(F, iw * 0.2, baseH + 0.02, -3.4), { tint: C(0x3b3833), worldUV: false });
    const floor = box(iw, 0.08, 5.2, { segY: 1 });
    B.addMerged('glasstower:precast', floor, at(F, 0, baseH - 0.06, -3.2), { tint: C(0x4c4a46) });
    // lit cove: the only thing inside a closed lobby that the scene can't light
    const cov = box(iw * 0.9, 0.10, 0.5, { segY: 1 });
    B.addMerged('litWindow', cov, at(F, 0, gY1 - 0.72, -1.5),
      { tint: C(0xffe6c4).multiplyScalar(0.5), worldUV: false });
    const wash = quad(iw * 0.5, ih * 0.55);
    B.addMerged('litWindow', wash, at(F, -iw * 0.12, baseH + 0.5, -5.18),
      { tint: C(0xffd9ae).multiplyScalar(0.18), worldUV: false });
  }

  // -- ground-floor glazing bays -------------------------------------------
  {
    const lm = defineLobbyMullion(B, q05(gY1 - gY0));
    const dark = scaleL(mullBase, 0.34);
    const inDoorZone = (i) => i === dj || i === dj + 1;
    for (let i = 0; i < nBay; i++) {
      const bx = -gW / 2 + bayW * (i + 0.5);
      if (inDoorZone(i)) continue;
      const isRetail = retail && (dj === 0 ? i > dj + 1 : i < dj);
      const g = quad(bayW - 0.09, gY1 - gY0 - 0.05);
      B.addMerged('glass', g, at(F, bx, gY0 + 0.03, -0.30), {
        tint: isRetail ? scaleL(gBase, 1.18) : scaleL(gBase, rng.range(0.88, 1.06)), worldUV: false,
      });
      // interior clutter silhouette behind retail glass
      if (isRetail && rng.bool(0.7)) {
        const sh = box(bayW - 0.5, rng.range(1.4, 2.2), 0.3, { segY: 1 });
        B.addMerged('paintFlat', sh, at(F, bx, baseH + 0.05, -0.95), { tint: C(rng.pick([0x3a352e, 0x53483a, 0x2f3436])), worldUV: false });
      }
    }
    // mullions at every bay line + head / transom / sill rails
    for (let i = 0; i <= nBay; i++) {
      const bx = -gW / 2 + bayW * i;
      B.addInstance(lm, at(F, bx, gY0, -0.30), dark);
    }
    const head = box(gW + 0.12, 0.14, 0.22, { segY: 1 });
    B.addMerged('glasstower:mullion', head, at(F, 0, gY1 - 0.14, -0.28), { tint: dark, worldUV: false });
    const sillr = box(gW + 0.12, 0.10, 0.24, { segY: 1 });
    B.addMerged('glasstower:mullion', sillr, at(F, 0, gY0, -0.29), { tint: dark, worldUV: false });
    const tran = box(gW, 0.09, 0.20, { segY: 1 });
    B.addMerged('glasstower:mullion', tran, at(F, 0, baseH + 3.05, -0.27), { tint: dark, worldUV: false });
    // deep soffit above the glazing (the base is taller than a residential floor)
    const sof = box(W - 0.5, groundTop - gY1, 0.5, { segY: 1 });
    B.addMerged(podMat, sof, at(F, 0, gY1, -0.25), { tint: scaleL(podTint, 0.9), aoTop: groundTop });
  }

  // -- entrance: recessed vestibule, doors, canopy, steps, ramp ------------
  {
    const dzW = bayW * 2;
    const rd = 0.75;
    // recessed reveal box (dark)
    const rv = box(dzW, gY1 - gY0, rd, { segY: 1 });
    B.addMerged('glasstower:spandrel', rv, at(F, doorX, gY0, -rd + 0.02), { tint: C(0x14171a), worldUV: false });
    // side lights + transom around the doors
    const glassTop = gY1 - 0.16;
    const dl = (dzW - doorW) / 2 - 0.1;
    for (const s of [-1, 1]) {
      if (dl > 0.25) {
        const g = quad(dl, glassTop - baseH - 0.05);
        B.addMerged('glass', g, at(F, doorX + s * (doorW / 2 + dl / 2 + 0.05), baseH + 0.03, -rd + 0.06), { tint: scaleL(gBase, 1.05), worldUV: false });
      }
    }
    const tg = quad(dzW - 0.2, glassTop - (baseH + doorH) - 0.06);
    B.addMerged('glass', tg, at(F, doorX, baseH + doorH + 0.04, -rd + 0.06), { tint: scaleL(gBase, 1.1), worldUV: false });
    // doors: two leaves, stainless stiles, full-height pulls
    for (const s of [-1, 1]) {
      const lw = doorW / 2 - 0.02;
      const gl = quad(lw - 0.14, doorH - 0.18);
      B.addMerged('glass', gl, at(F, doorX + s * doorW / 4, baseH + 0.10, -rd + 0.10), { tint: scaleL(gBase, 0.95), worldUV: false });
      for (const [ox, ow] of [[-lw / 2 + 0.035, 0.07], [lw / 2 - 0.035, 0.07]]) {
        const st = box(ow, doorH, 0.09, { segY: 1 });
        B.addMerged('aluminum', st, at(F, doorX + s * doorW / 4 + ox, baseH, -rd + 0.11), { tint: C(0xb0b4b6), worldUV: false });
      }
      const rl = box(lw, 0.08, 0.09, { segY: 1 });
      B.addMerged('aluminum', rl, at(F, doorX + s * doorW / 4, baseH + doorH - 0.08, -rd + 0.11), { tint: C(0xb0b4b6), worldUV: false });
      const pull = cylinder(0.022, 0.022, 1.25, 6);
      B.addMerged('aluminum', pull, at(F, doorX + s * 0.10, baseH + 0.85, -rd + 0.19), { tint: C(0xc2c6c8), worldUV: false });
    }
    // raised entry platform + steps down to the sidewalk
    const platW = dzW + 2.2, platD = 1.9;
    const pl = box(platW, baseH, platD, { segY: 2 });
    boxUV(pl, platW, baseH, platD, 2);
    B.addMerged(baseCladMat, pl, at(F, doorX, 0, platD / 2 + 0.02), { tint: baseCladTint, grime: 0.3 });
    const nR = Math.max(3, Math.round(baseH / 0.152));
    for (let s = 0; s < nR; s++) {
      const sd = 0.33 * (nR - s);
      const g = box(dzW + 1.3, baseH / nR, sd, { segY: 1 });
      boxUV(g, dzW + 1.3, baseH / nR, sd, 2);
      B.addMerged(baseCladMat, g, at(F, doorX, (baseH / nR) * s, platD + 0.02 + sd / 2), { tint: baseCladTint, grime: 0.4 });
    }
    // Accessible ramp running PARALLEL to the base, high end beside the entry
    // platform. It used to be extruded along Z with a centred box and a rail
    // rotated the wrong way, which put a 7.6 m deck and a 7.7 m pipe rail out
    // in the middle of the roadway with nothing under either end.
    const rSide = doorX < 0 ? 1 : -1;
    const runL = Math.min(7.6, W / 2 - Math.abs(doorX) - dzW / 2 - 0.8);
    if (runL > 3.5) {
      const ang = Math.atan2(baseH, runL);
      const rw = 1.5, L2 = runL / Math.cos(ang);
      const xHigh = doorX + rSide * (dzW / 2 + 0.35);
      const xc = xHigh + rSide * runL / 2;
      const zc = rw / 2 + 0.1;
      const tilt = -rSide * ang;
      const deck = box(L2, 0.16, rw, { segY: 1 });
      deck.translate(0, -0.08, 0);
      deck.rotateZ(tilt);
      boxUV(deck, L2, 0.16, rw, 2);
      B.addMerged(baseCladMat, deck, at(F, xc, baseH / 2 + 0.02, zc), { tint: baseCladTint, grime: 0.35 });
      // kerbs along both long edges
      for (const s of [-1, 1]) {
        const kb = box(L2, 0.26, 0.12, { segY: 1 });
        kb.translate(0, -0.13, 0);
        kb.rotateZ(tilt);
        B.addMerged(baseCladMat, kb, at(F, xc, baseH / 2 + 0.15, zc + s * (rw / 2 - 0.06)),
          { tint: scaleL(baseCladTint, 0.92) });
      }
      // pipe handrail + posts, both following the slope
      const railY = (x) => Math.max(0.06, baseH - (baseH / runL) * Math.abs(x - xHigh));
      const rail = cylinder(0.026, 0.026, L2, 6);
      rail.translate(0, -L2 / 2, 0);
      rail.rotateZ(tilt + Math.PI / 2);
      B.addMerged('aluminum', rail, at(F, xc, baseH / 2 + 0.94, zc + rw / 2 - 0.08),
        { tint: C(0x9fa3a5), worldUV: false });
      for (let t = 0; t <= 4; t++) {
        const px = xHigh + rSide * (runL / 4) * t;
        const p = cylinder(0.022, 0.022, 0.94, 6);
        B.addMerged('aluminum', p, at(F, px, railY(px), zc + rw / 2 - 0.08),
          { tint: C(0x9fa3a5), worldUV: false });
      }
    }
    // entrance canopy: 2.1 m projection at 3.9 m AFG with tension rods
    const cw = dzW + 1.8, cpr = rng.range(1.9, 2.5), cy = rng.range(3.7, 4.2);
    const cg = box(cw, 0.14, cpr, { segY: 1 });
    B.addMerged('aluminum', cg, at(F, doorX, cy, cpr / 2 + 0.02), { tint: C(0x9a9ea0), worldUV: false });
    const cf = box(cw + 0.06, 0.20, 0.09, { segY: 1 });
    B.addMerged('aluminum', cf, at(F, doorX, cy - 0.06, cpr + 0.03), { tint: C(0xb2b6b8), worldUV: false });
    const soffit = box(cw - 0.12, 0.05, cpr - 0.1, { segY: 1 });
    B.addMerged('paintFlat', soffit, at(F, doorX, cy - 0.05, cpr / 2 + 0.02), { tint: C(0xe0d8c8), worldUV: false });
    // tension rods: anchored at the canopy nose, sloping UP and BACK to the
    // wall. The old rotation sent them up and OUT — a pair of 2.4 m rods
    // floating in the middle of the street with nothing on either end.
    for (const s of [-1, 1]) {
      const rise = 1.5, reach = cpr - 0.35;
      const L = Math.hypot(reach, rise);
      const rod = cylinder(0.018, 0.018, L, 6);
      rod.rotateX(-Math.atan2(reach, rise));
      B.addMerged('aluminum', rod,
        at(F, doorX + s * (cw / 2 - 0.3), cy + 0.14, reach),
        { tint: C(0xb6babc), worldUV: false });
    }
    // address numerals plate
    const pl2 = box(0.7, 0.34, 0.03, { segY: 1 });
    B.addMerged('aluminum', pl2, at(F, doorX + dzW / 2 + 0.55, baseH + 1.55, 0.05), { tint: C(0x8e9294), worldUV: false });
  }

  // retail sign band
  if (retail) {
    const sx = dj === 0 ? gW * 0.22 : -gW * 0.22;
    const uv = ctx.extra.signUvFor(rng.int(0, ctx.extra.signCount - 1));
    const sg = quad(Math.min(4.4, gW * 0.4), 0.62, uv);
    B.addMerged('signs', sg, at(F, sx, gY1 + 0.12, 0.06), { worldUV: false });
    const sb = box(Math.min(4.6, gW * 0.42), 0.74, 0.10, { segY: 1 });
    B.addMerged('paintFlat', sb, at(F, sx, gY1 + 0.06, 0.0), { tint: C(0x1d1f20), worldUV: false });
  }

  // -- podium side + rear walls ---------------------------------------------
  {
    const sideRows = { left: null, right: null };
    if (lot.corner !== 0) {
      const side = lot.corner > 0 ? 'right' : 'left';
      const r = [];
      for (const pr of podRows) {
        const n = Math.max(2, Math.round((D - 3.0) / 4.0));
        const seg = (D - 3.0) / n;
        r.push({
          y0: pr.y, y1: pr.y + pr.h,
          openings: Array.from({ length: n }, (_, i) => ({ x: -(D - 3.0) / 2 + seg * (i + 0.5), w: Math.min(2.6, seg - 1.2) })),
        });
      }
      sideRows[side] = r;
    }
    shellWalls(ctx, F, {
      width: W, depth: D, height: podiumTop, mat: podMat, tint: podTint, wallT: 0.34, sideRows,
    });
  }

  // =======================================================================
  // ROOFS
  // =======================================================================
  const parapetMat = rng.bool(0.55) ? 'glasstower:acm' : 'glasstower:spandrel';
  const parapetTint = parapetMat === 'glasstower:acm' ? acmBase : spanBase;

  // podium roof terrace
  {
    flatRoof(ctx, at(F, 0, 0, 0), {
      width: W, depth: D, height: podiumTop, parapet: 1.06, mat: podMat, tint: podTint,
      roofMat: 'roofBlack', copingMat: 'aluminum', wallT: 0.28,
    });
    // pedestal paver terrace in front of the tower
    const tD = Math.max(0.6, frontSet - 0.5);
    if (tD > 1.0) {
      const pv = box(W - 1.2, 0.10, tD, { segY: 1 });
      boxUV(pv, W - 1.2, 0.10, tD, 0.61);
      B.addMerged('sidewalk', pv, at(F, 0, podiumTop, -0.55 - tD / 2), { tint: C(0xb0aca4) });
      const pl = definePlanter(B), sh = defineShrub(B);
      const n = Math.max(2, Math.floor((W - 3) / 2.6));
      for (let i = 0; i < n; i++) {
        const px = -(W - 3) / 2 + ((W - 3) / (n - 1 || 1)) * i + rng.range(-0.2, 0.2);
        B.addInstance(pl, at(F, px, podiumTop + 0.1, -0.9, rng.range(-0.2, 0.2)), jitter(rng, precBase, 0.07));
        B.addInstance(sh, at(F, px, podiumTop + 0.75, -0.9, rng.range(0, 6.28)), C(rng.pick([0x7f9a4c, 0x6b8c46, 0x92a656])));
      }
      if (rng.bool(0.6)) {
        const ch = defineChair(B), tb = defineTable(B);
        for (let i = 0; i < rng.int(2, 5); i++) {
          const px = rng.range(-W / 2 + 2, W / 2 - 2);
          B.addInstance(ch, at(F, px, podiumTop + 0.1, -0.55 - tD * rng.range(0.3, 0.8), rng.range(0, 6.28)), C(rng.pick([0x2f3134, 0x8a5a3a, 0xb8b4ac])));
          if (rng.bool(0.4)) B.addInstance(tb, at(F, px + 0.9, podiumTop + 0.1, -0.55 - tD * 0.5, 0), C(0x8e9294));
        }
      }
      // glass windscreen on top of the podium parapet
      if (rng.bool(0.6)) {
        const wsN = Math.max(2, Math.round((W - 1.5) / 1.52));
        const segw = (W - 1.5) / wsN;
        const jw = defineWindscreen(B, q05(segw), 1.55);
        for (let i = 0; i < wsN; i++) {
          const px = -(W - 1.5) / 2 + segw * (i + 0.5);
          B.addInstance(jw.glass, at(F, px, podiumTop + 1.06, -0.14), jitter(rng, guardBase, 0.05));
          B.addInstance(jw.rail, at(F, px, podiumTop + 1.06, -0.14), mullBase);
        }
      }
    }
  }

  // tower roofs / terraces
  for (const r of roofs) {
    const rw = r.x1 - r.x0, rd2 = r.z1 - r.z0;
    const rc = (r.x0 + r.x1) / 2;
    flatRoof(ctx, at(F, rc, 0, r.z1), {
      width: rw, depth: rd2, height: r.y, parapet: r.main ? parapetH : 1.10,
      mat: r.main ? parapetMat : podMat, tint: r.main ? parapetTint : podTint,
      roofMat: 'roofBlack', copingMat: 'aluminum', wallT: 0.26,
    });
    if (!r.main) {
      // setback terrace: pavers + planters where the massing steps
      const hole = r.hole;
      const pv = box(rw - 1.0, 0.10, rd2 - 1.0, { segY: 1 });
      boxUV(pv, rw - 1.0, 0.10, rd2 - 1.0, 0.61);
      B.addMerged('sidewalk', pv, at(F, rc, r.y, r.z1 - rd2 / 2), { tint: C(0xafaba3) });
      const pl = definePlanter(B), sh = defineShrub(B), ch = defineChair(B);
      for (let i = 0; i < rng.int(3, 6); i++) {
        let px = rng.range(r.x0 + 1, r.x1 - 1), pz = rng.range(r.z0 + 1, r.z1 - 1);
        if (hole && px > hole[0] - 0.6 && px < hole[1] + 0.6 && pz > hole[2] - 0.6 && pz < hole[3] + 0.6) pz = hole[3] + rng.range(0.9, 1.6);
        if (pz > r.z1 - 0.7) pz = r.z1 - 0.9;
        B.addInstance(pl, at(F, px, r.y + 0.1, pz, rng.range(-0.3, 0.3)), jitter(rng, precBase, 0.07));
        B.addInstance(sh, at(F, px, r.y + 0.75, pz, rng.range(0, 6.28)), C(rng.pick([0x7f9a4c, 0x6b8c46])));
        if (rng.bool(0.5)) B.addInstance(ch, at(F, px + 1.5, r.y + 0.1, pz, rng.range(0, 6.28)), C(rng.pick([0x2f3134, 0x8a5a3a])));
      }
    }
  }

  // -- main roof: mechanical penthouse, cooling towers, screens, rig -------
  {
    const main = roofs[roofs.length - 1];
    const rw = main.x1 - main.x0, rd2 = main.z1 - main.z0, rc = (main.x0 + main.x1) / 2;
    const ry = main.y;
    // roof pavers / membrane walk pads
    const pad = box(rw - 1.4, 0.06, rd2 - 1.4, { segY: 1 });
    boxUV(pad, rw - 1.4, 0.06, rd2 - 1.4, 0.61);
    B.addMerged('sidewalk', pad, at(F, rc, ry, main.z1 - rd2 / 2), { tint: C(0x9d9a94) });

    // mechanical penthouse / bulkhead, 15-35% of the roof plan
    const mW = q50(Math.max(4.5, rw * rng.range(0.38, 0.52)));
    const mD = q50(Math.max(3.5, rd2 * rng.range(0.40, 0.55)));
    const mH = q50(rng.range(4.2, 5.8));
    const mech = defineMech(B, mW, mD, mH);
    const mx = rc + rng.range(-rw * 0.1, rw * 0.1);
    const mz = main.z1 - rd2 * rng.range(0.42, 0.6);
    B.addInstance(mech, at(F, mx, ry, mz), jitter(rng, acmBase, 0.05));
    // elevator overrun: taller solid clad box on top of/next to the mech
    const eW = q50(rng.range(3.6, 5.0)), eD = q50(rng.range(3.0, 4.2)), eH = rng.range(2.2, 3.4);
    const eg = box(eW, eH, eD, { segY: 1 });
    boxUV(eg, eW, eH, eD, 2);
    const ex = mx + rng.range(-1, 1) * (mW / 2 - eW / 2);
    B.addMerged('glasstower:acm', eg, at(F, ex, ry + mH, mz), { tint: jitter(rng, acmBase, 0.05) });
    const ec = box(eW + 0.12, 0.09, eD + 0.12, { segY: 1 });
    B.addMerged('aluminum', ec, at(F, ex, ry + mH + eH, mz), { tint: C(0xa9aaa6), worldUV: false });

    // cooling tower + condensers behind a louvered screen wall
    const ct = defineCoolingTower(B);
    const cz = main.z1 - rd2 * rng.range(0.14, 0.26);
    const cx0 = rc + rng.range(-rw * 0.22, rw * 0.22);
    B.addInstance(ct, at(F, cx0, ry + 0.15, cz, rng.bool(0.5) ? 0 : Math.PI / 2), jitter(rng, C(0x9ea2a3), 0.06));
    const pad2 = box(5.0, 0.15, 3.0, { segY: 1 });
    B.addMerged('concrete', pad2, at(F, cx0, ry, cz), { tint: C(0x9a968f) });
    const nCond = rng.int(4, 9);
    for (let i = 0; i < nCond; i++) {
      const hx = rc + rng.range(-rw * 0.4, rw * 0.4);
      const hz = main.z1 - rd2 * rng.range(0.12, 0.85);
      if (Math.abs(hx - mx) < mW / 2 + 0.9 && Math.abs(hz - mz) < mD / 2 + 0.9) continue;
      const hp = box(2.0, 0.15, 1.3, { segY: 1 });
      B.addMerged('concrete', hp, at(F, hx, ry, hz), { tint: C(0x98948d) });
      K.hvac(at(F, hx, ry + 0.15, hz, rng.range(-0.35, 0.35) + (rng.bool(0.4) ? Math.PI / 2 : 0)), {
        tint: jitter(rng, C(0x9ea2a3), 0.10),
      });
    }
    const scr = defineScreen(B, q50(Math.min(rw - 2.4, 8.0)));
    B.addInstance(scr, at(F, cx0, ry, cz + 1.9), jitter(rng, acmBase, 0.05));

    // window-washing davit + tie-back sockets along the parapet
    const dv = defineDavit(B);
    B.addInstance(dv, at(F, rc + rng.range(-rw * 0.25, rw * 0.25), ry, main.z1 - 0.75, Math.PI), C(0xa8acae));
    for (let x = main.x0 + 0.9; x < main.x1 - 0.5; x += 3.66) {
      const sk = box(0.22, 0.12, 0.22, { segY: 1 });
      B.addMerged('aluminum', sk, at(F, x, ry, main.z1 - 0.61), { tint: C(0x8e9294), worldUV: false });
    }
    // suspended BMU stage parked on the facade — a real building tell
    if (rng.bool(0.35)) {
      const sy = ry - FTF * rng.int(2, Math.max(2, nTower - 3));
      const sx2 = rc + rng.range(-rw * 0.3, rw * 0.3);
      const stg = box(3.0, 0.10, 0.75, { segY: 1 });
      B.addMerged('aluminum', stg, at(F, sx2, sy, main.z1 + 0.55), { tint: C(0xc2b04a), worldUV: false });
      for (const s of [-1, 1]) {
        const rl = box(3.0, 0.05, 0.05, { segY: 1 });
        B.addMerged('aluminum', rl, at(F, sx2, sy + 1.05, main.z1 + 0.55 + s * 0.33), { tint: C(0xc2b04a), worldUV: false });
        for (const sx3 of [-1, 1]) {
          const pst = box(0.06, 1.1, 0.06, { segY: 1 });
          B.addMerged('aluminum', pst, at(F, sx2 + sx3 * 1.45, sy, main.z1 + 0.55 + s * 0.33), { tint: C(0xc2b04a), worldUV: false });
        }
        const cab = cylinder(0.012, 0.012, ry - sy - 0.1, 5);
        B.addMerged('steelDark', cab, at(F, sx2 + s * 1.3, sy + 1.05, main.z1 + 0.5), { tint: C(0x6a6d70), worldUV: false });
      }
    }

    // antenna / cell array + aviation beacon
    if (rng.bool(0.6)) K.antenna(at(F, rc + rng.range(-rw * 0.3, rw * 0.3), ry + mH + eH, mz + rng.range(-1, 1)));
    if (rng.bool(0.5)) {
      for (let s = 0; s < 3; s++) {
        const a = (s / 3) * Math.PI * 2;
        const pn = box(0.28, 1.9, 0.14, { segY: 1 });
        B.addMerged('paintFlat', pn, at(F, mx + Math.cos(a) * (mW / 2 - 0.3), ry + mH + 0.3, mz + Math.sin(a) * (mD / 2 - 0.3), a), { tint: C(0xd8d8d4), worldUV: false });
      }
    }
    if (H > 61) {
      const bc = cylinder(0.14, 0.16, 0.26, 8);
      B.addMerged('paintFlat', bc, at(F, ex, ry + mH + eH + 0.09, mz), { tint: C(0x8c2418), worldUV: false });
    }
    // roof drain scuppers through the parapet
    for (let x = main.x0 + 2.0; x < main.x1 - 1.0; x += 12.2) {
      const sc = box(0.22, 0.11, 0.4, { segY: 1 });
      ensureColor(sc, DARKI);
      B.addMerged('aluminum', sc, at(F, x, ry + 0.06, main.z1 + 0.04), { worldUV: false });
    }
    // rare vestigial wooden water tower (probability 0.05 per the doc)
    if (rng.bool(0.05)) {
      K.waterTower(at(F, rc + rng.range(-2, 2), ry, main.z1 - rd2 * 0.75), {
        tint: new THREE.Color().setHSL(0.07, 0.25, 0.34), legH: 2.4, r: 1.7, hBody: 3.0,
      });
    }
  }

  return { height: H };
}
