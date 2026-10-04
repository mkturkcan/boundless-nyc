// AR33 BID3: 100 W 125th St at Lenox (Whole Foods Market, H&M, Burlington, Raymour & Flanigan), custom builder 'bid3:w100'
// (with the kit: the spec in fk/specs/bid3.js w125-100 does the shops, the glass bands of floors 2-3, the windows and the
// glass tower; this adds the rain-screen of floors 4-5 and the tenants' banners on the glass). Measured on orthographic
// elevations rectified out of: u from the Lenox corner west along the front,
// y over the sidewalk, w out of the wall. Floors 4 and 5 are clad in rectangular metal panels in five greys (modules 0.6 m
// high, 0.6-1.8 m wide, a stacked-bond mosaic with no pattern the eye can pick out), with 1.85 x 2.5 m punched windows every
// 3.75 m from u 7.4; the recessed glass tower at u 40.8-46.3 carries the Raymour & Flanigan and Burlington graphics.
import * as THREE from 'three';
import { wallMat, hash, towerGlass, curtain, paleMullion } from './bid3Util.js';

// (AR34 batch 3) the library's opaque tower glass read near white at street level on the b3a plates: it lit a unit's body as a sunlit wall with no day trim. MATS fixed that in the
// library (2026-10-02 03:19: the body is lit by the sky and 0.15 of the sun); batch 4 drops the plain glass the bands and the
// grocery took meanwhile and goes back to the library's glass, each body at 0.3 of the plain hex's linear value (the plain
// material's day trim; MATS's table, ar34-req/BID3.md 03:19): '#62788a' -> '#36434e', '#25382f' -> '#111c17' and so on
const libGlass = (name, body, key) => towerGlass(name, body, key);

// the Lenox Avenue wall (the kit's 'corner' face, 61.64 m, u from its south end): measured on the elevation rectified out of
// (2026-08, 24 px/m, the plane offset 3.5 m to match the front's 29.1 m parapet): the same cladding as the
// front, 12 windows a floor on a 4.0 m pitch from u 6.2, a glazed strip at each end, the glass bands of floors 2-3 with the
// tenants' banners, the Whole Foods glass under the louvre band
export const W100L = { cols: 12, col0: 6.2, pitch: 4.0, ww: 1.9, f4y: [18.3, 21.0], f5y: [23.2, 25.9], strip: [[0.4, 4.1], [57.6, 61.2]], bands: [4.4, 57.4], top: 29.0 };
export const W100 = { cols: 11, col0: 7.4, pitch: 3.75, ww: 1.85, f4: [17.0, 22.7], f5: [22.7, 29.3], tower: [40.8, 46.3], top: 29.0 };

// the rain-screen mosaic: a 12 x 12 module grid (0.6 m) repeating every 7.2 m, panels of 1-3 x 1-2 modules in five greys
let _M = null;
function mosaicMat() {
  if (_M) return _M;
  let map = null;
  if (typeof document !== 'undefined') {
    const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d');
    if (g && g.fillRect) {
      const N = 12, c = S / N;
      g.fillStyle = '#3b3f44'; g.fillRect(0, 0, S, S);
      const used = new Uint8Array(N * N);
      const tones = [[122, 127, 131], [108, 113, 118], [94, 99, 105], [80, 85, 92], [66, 71, 79]];   // AR34: darker
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (used[y * N + x]) continue;
        let w = hash(x, y, 1) < 0.3 ? 1 : hash(x, y, 1) < 0.78 ? 2 : 3, h = hash(x, y, 2) < 0.62 ? 1 : 2;
        while (x + w > N || (h === 2 && y + 1 >= N)) { if (x + w > N) w--; else h = 1; }
        for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (used[(y + dy) * N + x + dx]) { w = 1; h = 1; }
        for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) used[(y + dy) * N + x + dx] = 1;
        const k = hash(x, y, 3), t = tones[Math.min(4, Math.floor(k * k * 5.4))];
        const j = 0.94 + 0.1 * hash(x, y, 4);
        g.fillStyle = `rgb(${t[0] * j | 0},${t[1] * j | 0},${t[2] * j | 0})`;
        g.fillRect(x * c + 1.5, y * c + 1.5, w * c - 3, h * c - 3);
        // a faint vertical brushing
        g.fillStyle = 'rgba(255,255,255,0.05)';
        for (let b = 0; b < w * 3; b++) g.fillRect(x * c + 2 + hash(x, y, 10 + b) * (w * c - 4), y * c + 2, 1, h * c - 4);
      }
      map = new THREE.CanvasTexture(cv);
      map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(1 / 7.2, 1 / 7.2); map.anisotropy = 8;
    }
  }
  _M = wallMat(map ? { map, roughness: 0.5, metalness: 0.25 } : { color: new THREE.Color('#8a8f94'), roughness: 0.5, metalness: 0.25 });
  return _M;
}


// the glass bands of floors 2-3 (both faces): opaque pale-teal panes 1.1 m wide between thin pale mullions, a white louvre strip
// at the head of each band
function glassBands(K, u0, u1, plane) {
  // (b3d lenoxW: the plain dark bodies read dark green where the sunlit Lenox face's bands read a light teal: lighter bodies)
  const M = { vision: libGlass('glass_tower_blue', '#36434e', 201), lit: libGlass('glass_tower_blue', '#3d4a55', 202), spandrel: libGlass('glass_tower_blue', '#1a2422', 203), mullion: paleMullion() };
  M.set = [{ vision: M.vision, visionB: libGlass('glass_tower_blue', '#3d4a55', 204), visionC: libGlass('glass_tower_blue', '#2d3a44', 205), lit: M.lit }];
  M.set = [M.set[0], M.set[0], M.set[0]];
  for (const [y0, y1, seed] of [[6.1, 10.5, 1], [11.55, 16.45, 2]]) {
    curtain(K, { axis: 'u', a0: u0, a1: u1, plane, dir: 1, y0, y1, floor: 99, y1st: 99, pane: 1.1, span: [0, 0], mull: [0.05, 0.1], seed: 200 + seed, M, lit: 0.12 });
  }
  const louvre = K.mat('alu_white', { tint: '#e9ebea', dirt: 0.15 });
  for (const [y0, y1] of [[10.5, 11.0], [16.45, 16.55]]) {
    K.box(louvre, u0, u1, y0, y1, plane - 0.02, plane + 0.1, { c: 0.004 });
    for (let y = y0 + 0.07; y < y1 - 0.02; y += 0.1) K.box(louvre, u0, u1, y, y + 0.025, plane + 0.1, plane + 0.18, { c: 0, near: true });
  }
}

export function w100(group, ctx, spec, frame) {
  const K = frame.kit, L = frame.L, Wd = W100;
  const holes = [];
  for (let j = 0; j < Wd.cols; j++) {
    const u0 = Wd.col0 + j * Wd.pitch, u1 = u0 + Wd.ww;
    holes.push({ u0: u0 - 0.015, u1: u1 + 0.015, y0: Wd.f5[0] + 1.1, y1: Wd.f5[0] + 3.6 });
    if (j < 9) holes.push({ u0: u0 - 0.015, u1: u1 + 0.015, y0: Wd.f4[0] + 1.2, y1: Wd.f4[0] + 4.0 });
  }
  holes.push({ u0: Wd.tower[0], u1: Wd.tower[1], y0: 5.6, y1: Wd.f4[1] });
  // the mosaic over the kit's wall (12 mm proud, the same openings cut)
  K.wall({ u0: 4.3, u1: L - 0.02, y0: Wd.f4[0], y1: Wd.top, holes, mat: mosaicMat(), w: 0.012 });
  K.wall({ u0: Wd.tower[0] - 0.7, u1: L - 0.02, y0: Wd.f4[1], y1: Wd.top, holes: [], mat: mosaicMat(), w: 0.012 });
  glassBands(K, 6.3, 39.7, 0.05);
  // the silver louvre band over the store glass
  { const lv = K.mat('alu_white', { tint: '#dfe2e3', dirt: 0.2 });
    for (const [a, b] of [[4.8, 30.2], [30.5, 34.6], [34.9, 40.5]]) {
      K.box(lv, a, b, 5.0, 5.6, 0.0, 0.08, { c: 0.004 });
      for (let y = 5.04; y < 5.58; y += 0.09) K.box(lv, a, b, y, y + 0.022, 0.08, 0.16, { c: 0, near: true });
    } }
  // the dark spandrel bands over floors 3 and 5 (a joint line each floor)
  const dk = K.mat('panel_grey', { tint: '#4b5057', dirt: 0.2 });
  K.box(dk, 4.3, L - 0.02, 16.55, 17.0, -0.02, 0.05);
  K.box(dk, 4.3, L - 0.02, 22.55, 22.8, -0.02, 0.035);
  // the tenants' banners on the glass of floor 3 (11.5-16.0): drawn from scratch, in front of the glass
  K.sign({ kind: 'painted', text: 'FURNITURE DELIVERY IN 3 DAYS OR LESS', font: 'BarlowCondensed-800', fg: '#fff5ec', bg: '#e9a47c', onGlass: false, u0: 6.5, u1: 30.6, y: 12.5, h: 3.2 }, { z: 0.15 });
  K.sign({ kind: 'painted', lines: ['Raymour & Flanigan', 'FURNITURE | MATTRESSES'], font: 'LibreBaskerville-400', fg: '#ffffff', bg: '#26346f', u0: 30.8, u1: 39.6, y: 12.5, h: 3.2 }, { z: 0.15 });
  // the glass tower: two tall banners and the Burlington letters
  K.sign({ kind: 'painted', lines: ['Raymour', '& Flanigan', 'FURNITURE', 'MATTRESSES'], font: 'LibreBaskerville-400', fg: '#ffffff', bg: '#26346f', u0: 41.0, u1: 46.1, y: 9.0, h: 5.2 }, { z: -1.5 });
  K.sign({ kind: 'painted', text: 'Burlington', font: 'PlayfairDisplay-700', fg: '#ffffff', bg: '#c8102e', u0: 41.0, u1: 46.1, y: 14.4, h: 1.5 }, { z: -1.5 });
  K.sign({ kind: 'painted', lines: ['Raymour', '& Flanigan'], font: 'LibreBaskerville-400', fg: '#ffffff', bg: '#26346f', u0: 41.0, u1: 46.1, y: 16.2, h: 3.0 }, { z: -1.5 });
  // ---------------------------------------------------------------- the Lenox Avenue wall
  const C = frame.face('corner');
  if (C) {
    const KC = C.kit, L2 = C.L, Z = W100L, f4 = Wd.f4;
    const holes2 = [];
    for (let j = 0; j < Z.cols; j++) {
      const u0 = Z.col0 + j * Z.pitch, u1 = u0 + Z.ww;
      holes2.push({ u0: u0 - 0.015, u1: u1 + 0.015, y0: Z.f5y[0], y1: Z.f5y[1] }, { u0: u0 - 0.015, u1: u1 + 0.015, y0: Z.f4y[0], y1: Z.f4y[1] });
    }
    for (const [a, b] of Z.strip) holes2.push({ u0: a, u1: b, y0: 5.6, y1: Z.top - 0.6 });
    KC.wall({ u0: 4.3, u1: L2 - 0.02, y0: f4[0], y1: Z.top, holes: holes2.filter((h) => h.u0 > 4.3 && h.u1 < L2 - 0.02), mat: mosaicMat(), w: 0.012 });
    KC.box(dk, 4.3, L2 - 0.02, 16.55, 17.0, -0.02, 0.05);
    KC.box(dk, 4.3, L2 - 0.02, 22.55, 22.8, -0.02, 0.035);
    glassBands(KC, 5.4, 57.4, 0.05);
    // the grocery's glass wall (u 16.9-57.3, 0-5.5 m): pale teal panes 1.5 m wide in two rows under a white louvre band, pale mullions,
    // a lit hall seen through the lower row's clear lights is not drawn
    { const M2 = { vision: libGlass('glass_tower_green', '#0e1c1b', 206), lit: libGlass('glass_tower_green', '#142221', 207), spandrel: libGlass('glass_tower_green', '#0b1413', 208), mullion: paleMullion() };
      M2.set = [{ vision: M2.vision, visionB: libGlass('glass_tower_green', '#152423', 209), visionC: libGlass('glass_tower_green', '#0a1514', 210), lit: M2.lit }];
      M2.set = [M2.set[0], M2.set[0], M2.set[0]];
      curtain(KC, { axis: 'u', a0: 16.9, a1: 57.3, plane: 0.05, dir: 1, y0: 0.2, y1: 4.7, floor: 2.3, y1st: 2.5, pane: 1.5, span: [0.05, 0.05], mull: [0.06, 0.1], seed: 331, M: M2, lit: 0.2 });
      const lv = KC.mat('alu_white', { tint: '#e9ebea', dirt: 0.15 });
      KC.box(lv, 16.9, 57.3, 4.7, 5.5, 0.0, 0.1, { c: 0.004 });
      for (let y = 4.77; y < 5.45; y += 0.1) KC.box(lv, 16.9, 57.3, y, y + 0.025, 0.1, 0.18, { c: 0, near: true });
      KC.box(KC.mat('panel_grey', { tint: '#4a5058', dirt: 0.2 }), 16.9, 57.3, 0.0, 0.2, 0.0, 0.08, { c: 0 }); }
    // the banners: floor 3 orange and purple, the navy strip between the floors, floor 2 orange and navy
    KC.sign({ kind: 'painted', text: 'FINANCING FOR EVERY BUDGET', font: 'BarlowCondensed-800', fg: '#7a4a86', bg: '#e9a47c', u0: 5.8, u1: 27.7, y: 12.3, h: 1.9 }, { z: 0.15 });
    KC.sign({ kind: 'painted', text: 'FURNITURE DELIVERY IN 3 DAYS OR LESS', font: 'BarlowCondensed-800', fg: '#f6f0f2', bg: '#7c3f86', u0: 28.0, u1: 57.0, y: 12.3, h: 1.9 }, { z: 0.15 });
    KC.sign({ kind: 'painted', text: 'RAYMOUR & FLANIGAN    FURNITURE    RAYMOUR & FLANIGAN    MATTRESSES', font: 'LibreBaskerville-400', fg: '#ffffff', bg: '#1f3070', u0: 13.3, u1: 55.0, y: 10.45, h: 0.95 }, { z: 0.15 });
    KC.sign({ kind: 'painted', text: 'FREE NEXT-DAY MATTRESS DELIVERY 7 DAYS A WEEK', font: 'BarlowCondensed-800', fg: '#7a4a86', bg: '#e9a47c', u0: 11.0, u1: 47.0, y: 7.0, h: 3.0 }, { z: 0.15 });
    KC.sign({ kind: 'painted', lines: ['Raymour & Flanigan', 'FURNITURE | MATTRESSES'], font: 'LibreBaskerville-400', fg: '#ffffff', bg: '#26346f', u0: 47.0, u1: 57.4, y: 7.0, h: 3.0 }, { z: 0.15 });
    KC.sign({ kind: 'channel', text: 'WHOLE FOODS MARKET', font: 'LibreBaskerville-700', fg: '#0b5d3b', bg: null, u0: 30.6, u1: 43.3, y: 5.55, h: 0.95, lit: 'face' }, { z: 0.08 });
  }
  void group; void ctx; void spec;
}
