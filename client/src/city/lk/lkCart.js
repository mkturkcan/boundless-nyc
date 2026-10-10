// AR34 LIFE vendor carts (part lk, docs/notes/ar34-life.md), built in code to the size NYC's mobile food vending rules allow
// (a pushcart at most 10 x 5 ft) and: the halal / hot-food pushcart (a brushed stainless body
// on two wheels with a jack stand and a tow bar, door seams, hinges and handles, louvres, a fold-down shelf, the grill top
// with steam pans, bottles and foil trays behind a sneeze glass, a menu board on posts, picture menus on the body, propane
// bottles on the tongue), the snack cart of the St Nicholas corner (a steel box cart in a printed wrap, crisp bags, sweets
// and cans heaped on its tray) and the coolers beside them. The umbrella is added by lkKit.js's foodCart.
// Model space as lkKit.js: y up from the sidewalk, +z the customers' side, x along the cart.
import { Model, rbox, box, cyl, rod, lathe } from './lkGeo.js';
import { FAB, DECAL, toCell } from './lkArt.js';
import { magWheel, decal } from './lkTwo.js';

const PI = Math.PI;
const fcell = (g, cell) => toCell(g, cell);
function rng(seed) { let s = (seed * 9301 + 49297) % 233280 || 1; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }
// a decal plane at (x, y, z) facing yaw (0 = +z)
function card(M, w, h, cell, x, y, z, yaw = 0) { const g = decal(w, h, cell); if (yaw) g.rotateY(yaw); g.translate(x, y, z); M.add('decal', g); }

// a cooler: a coloured tub with a white lid, moulded handles, the hinge line, latches (w x d x h)
export function cooler(q, p = {}) {
  const M = new Model(), w = p.w || 0.62, d = p.d || 0.4, h = p.h || 0.42, bk = p.body || 'plasBlue', lk = p.lid || 'plasWhite';
  M.add(bk, rbox(w, h - 0.075, d, q ? 0.035 : 0, 0, (h - 0.075) / 2, 0));
  M.add(lk, rbox(w + 0.012, 0.075, d + 0.012, q ? 0.028 : 0, 0, h - 0.0375, 0, 1));
  if (q) {
    M.add(lk, rbox(w * 0.78, 0.014, d * 0.66, 0, 0, h + 0.004, 0));
    for (const s of [-1, 1]) M.add(lk, rbox(0.035, 0.05, 0.17, 0.012, s * (w / 2 + 0.014), h - 0.14, 0, 1));
    M.add('plasGrey', rbox(w - 0.12, 0.014, 0.012, 0, 0, h - 0.08, -d / 2 - 0.006));
    for (const s of [-1, 1]) M.add(lk, rbox(0.055, 0.06, 0.018, 0, s * w * 0.3, h - 0.085, d / 2 + 0.01));
    M.add('plasGrey', cyl(0.012, 0.012, 0.012, 8, 0).rotateX(PI / 2).translate(w * 0.35, 0.05, d / 2 + 0.006));
  }
  return M;
}
// the halal / hot-food pushcart (W x D), +x the wheel end, -x the tongue
export function halalCart(q, p = {}) {
  const M = new Model(), W = p.w || 1.6, D = p.d || 0.8, y0 = 0.3, H = 0.8, top = y0 + H, st = 'steelCart';
  M.add(st, rbox(W, H, D, q ? 0.014 : 0, 0, y0 + H / 2, 0));
  M.add(st, rbox(W + 0.05, 0.035, D + 0.05, q ? 0.008 : 0, 0, top + 0.017, 0));
  // picture menus on the customers' side and on the wheel end; the menu board on posts at the back of the top
  card(M, 1.2, 0.6, DECAL.menuPics, 0, y0 + H * 0.56, D / 2 + 0.003);
  card(M, 0.68, 0.34, DECAL.menuPics, W / 2 + 0.003, y0 + H * 0.6, 0, PI / 2);
  for (const s of [-1, 1]) M.add(st, rod([s * 0.48, top, -D / 2 + 0.05], [s * 0.48, top + 0.92, -D / 2 + 0.05], 0.014, q ? 8 : 4));
  M.add(st, rbox(1.06, 0.5, 0.035, q ? 0.008 : 0, 0, top + 0.68, -D / 2 + 0.05));
  card(M, 1.0, 0.45, DECAL.menuHead, 0, top + 0.68, -D / 2 + 0.07);
  card(M, 1.0, 0.45, DECAL.menuHead, 0, top + 0.68, -D / 2 + 0.03, PI);
  // two wheels on an axle across the wheel end, the jack stand and tow bar at the other
  const Wm = new Model();
  magWheel(Wm, q, { R: 0.26, w: 0.08, z: 0, n: 5, rim: 'galvDull', hub: 'galvDull', bw0: 0.04, bw1: 0.028, bt: 0.02, hubR: 0.05, rimDepth: 0.02 });
  for (const s of [-1, 1]) M.put(Wm, W * 0.28, 0, s * (D / 2 + 0.06), PI / 2);
  M.add('galvDull', rod([W * 0.28, 0.26, -D / 2 - 0.06], [W * 0.28, 0.26, D / 2 + 0.06], 0.02, q ? 8 : 4));
  M.add('galvDull', rbox(0.05, y0 - 0.02, 0.05, 0, -W / 2 + 0.12, (y0 - 0.02) / 2, 0));
  if (q) {
    // the tow bar (an A of tubes to the coupler) and its jack
    for (const s of [-1, 1]) M.add('galvDull', rod([-W / 2 + 0.02, y0 + 0.04, s * D * 0.35], [-W / 2 - 0.5, 0.42, 0], 0.02, 6));
    M.add('black', rbox(0.12, 0.07, 0.08, 0, -W / 2 - 0.55, 0.42, 0));
    M.add('galvDull', rod([-W / 2 - 0.4, 0.5, 0.05], [-W / 2 - 0.4, 0.04, 0.05], 0.022, 8));
    M.add('black', rbox(0.1, 0.02, 0.1, 0, -W / 2 - 0.4, 0.01, 0.05));
    // propane bottles on a plate over the tongue
    M.add('galvDull', rbox(0.4, 0.02, 0.36, 0, -W / 2 - 0.25, 0.46, 0));
    for (const [dz, k] of [[-0.09, 'plasWhite'], [0.1, 'galvDull']]) {
      M.add(k, lathe([[0.001, 0], [0.13, 0], [0.15, 0.03], [0.15, 0.36], [0.12, 0.42], [0.04, 0.45], [0.001, 0.45]], 14).translate(-W / 2 - 0.25, 0.47, dz));
      M.add('galvDull', cyl(0.06, 0.06, 0.08, 10, 0.92, true).translate(-W / 2 - 0.25, 0, dz));
      M.add('black', cyl(0.018, 0.018, 0.05, 6, 0.92).translate(-W / 2 - 0.25, 0, dz));
    }
    // door seams, hinges and handles on the vendor's side (-z), louvres on the tongue end
    for (const s of [-1, 1]) {
      const cx = s * W * 0.24, dw = W * 0.4, dh = H - 0.2, yc = y0 + H / 2 - 0.02;
      for (const [w, h, dx, dy] of [[dw, 0.006, 0, dh / 2], [dw, 0.006, 0, -dh / 2], [0.006, dh, dw / 2, 0], [0.006, dh, -dw / 2, 0]]) M.add('black', box(w, h, 0.004, cx + dx, yc + dy, -D / 2 - 0.002));
      M.add('chrome', rod([cx + s * (dw / 2 - 0.06), yc - 0.08, -D / 2 - 0.02], [cx + s * (dw / 2 - 0.06), yc + 0.08, -D / 2 - 0.02], 0.007, 6));
      for (const hy of [yc - dh / 2 + 0.08, yc + dh / 2 - 0.08]) M.add('galvDull', cyl(0.008, 0.008, 0.07, 6, hy - 0.035).translate(cx - s * dw / 2, 0, -D / 2 - 0.006));
    }
    for (let i = 0; i < 6; i++) M.add('black', box(0.004, 0.014, 0.3, -W / 2 - 0.002, y0 + 0.2 + i * 0.045, 0));
    // the fold-down shelf on the customers' side and its brackets
    M.add(st, rbox(W * 0.86, 0.025, 0.2, 0, 0, top - 0.05, D / 2 + 0.1));
    for (const s of [-1, 1]) M.add('galvDull', rod([s * W * 0.38, top - 0.06, D / 2 + 0.19], [s * W * 0.38, top - 0.3, D / 2 + 0.01], 0.006, 4));
    // the top: a griddle with its splash rail, steam pans with lids, squeeze bottles, foil trays, the napkins
    M.add('black', rbox(0.66, 0.03, D - 0.16, 0, -W * 0.2, top + 0.05, -0.02));
    M.add(st, box(0.66, 0.08, 0.012, -W * 0.2, top + 0.09, -D / 2 + 0.1), box(0.012, 0.08, D - 0.16, -W * 0.2 - 0.33, top + 0.09, -0.02));
    const R = rng(p.seed || 17);
    for (let i = 0; i < 6; i++) M.add(['plasWhite', 'woodDark', 'plasYellow', 'glossRed'][i % 4], rbox(0.07 + R() * 0.05, 0.012, 0.06 + R() * 0.04, 0, -W * 0.2 - 0.2 + i * 0.08, top + 0.072, -0.05 + (R() - 0.5) * 0.2));
    for (let i = 0; i < 3; i++) {
      M.add('galvDull', rbox(0.26, 0.09, 0.3, 0.006, W * 0.12 + i * 0.27, top + 0.06, -0.02, 1));
      M.add(i === 1 ? 'galvDull' : 'black', rbox(0.27, 0.012, 0.31, 0, W * 0.12 + i * 0.27, top + 0.11, -0.02));
    }
    for (let i = 0; i < 4; i++) M.add(['glossRed', 'plasYellow', 'plasWhite', 'glossOrange'][i], cyl(0.028, 0.026, 0.2, 10, top + 0.04).translate(-W / 2 + 0.1 + i * 0.065, 0, D / 2 - 0.1));
    M.add('galvDull', rbox(0.22, 0.12, 0.16, 0, W / 2 - 0.16, top + 0.1, D / 2 - 0.14));
    M.add('plasWhite', rbox(0.18, 0.08, 0.12, 0, W / 2 - 0.16, top + 0.2, D / 2 - 0.14));
    // the sneeze glass on the customers' side
    M.add('lensClear', rbox(W * 0.62, 0.3, 0.008, 0, -0.05, top + 0.2, D / 2 - 0.03));
    for (const s of [-1, 1]) M.add(st, rod([s * W * 0.31 - 0.05, top, D / 2 - 0.03], [s * W * 0.31 - 0.05, top + 0.36, D / 2 - 0.03], 0.008, 6));
  }
  return M;
}
// the snack cart (St Nicholas, 2026-08): a steel box cart wrapped in a printed sheet, a raised tray rim, crisp bags, sweets
// and cans heaped on it, a white bag hung on the umbrella pole, two small wheels at one end, a handle at the other
export function snackCart(q, p = {}) {
  const M = new Model(), W = p.w || 1.15, D = p.d || 0.62, y0 = 0.2, H = 0.78, top = y0 + H, st = 'steelCart';
  M.add(st, rbox(W, H, D, q ? 0.012 : 0, 0, y0 + H / 2, 0));
  card(M, W - 0.06, H - 0.1, DECAL.wrapSnack, 0, y0 + H / 2, D / 2 + 0.003);
  card(M, W - 0.06, H - 0.1, DECAL.wrapSnack, 0, y0 + H / 2, -D / 2 - 0.003, PI);
  for (const s of [-1, 1]) card(M, D - 0.06, (D - 0.06) / 2, DECAL.wrapSnack, s * (W / 2 + 0.003), y0 + H * 0.62, 0, s * PI / 2);
  M.add(st, rbox(W + 0.03, 0.06, D + 0.03, q ? 0.006 : 0, 0, top + 0.03, 0));
  const Wm = new Model();
  magWheel(Wm, q, { R: 0.13, w: 0.05, z: 0, n: 5, rim: 'galvDull', hub: 'galvDull', bw0: 0.025, bw1: 0.02, bt: 0.012, hubR: 0.03, rimDepth: 0.012 });
  for (const s of [-1, 1]) M.put(Wm, W / 2 - 0.14, 0, s * (D / 2 + 0.04), PI / 2);
  M.add('galvDull', rbox(0.04, y0, 0.04, 0, -W / 2 + 0.08, y0 / 2, -D / 2 + 0.08), rbox(0.04, y0, 0.04, 0, -W / 2 + 0.08, y0 / 2, D / 2 - 0.08));
  M.add('galvDull', rod([-W / 2, top - 0.05, -D / 2 + 0.06], [-W / 2 - 0.2, top + 0.05, -D / 2 + 0.06], 0.014, q ? 6 : 4), rod([-W / 2, top - 0.05, D / 2 - 0.06], [-W / 2 - 0.2, top + 0.05, D / 2 - 0.06], 0.014, q ? 6 : 4), rod([-W / 2 - 0.2, top + 0.05, -D / 2 + 0.06], [-W / 2 - 0.2, top + 0.05, D / 2 - 0.06], 0.016, q ? 6 : 4));
  if (!q) { M.add('fab', fcell(rbox(W - 0.1, 0.22, D - 0.1, 0, 0, top + 0.17, 0), FAB.red)); return M; }
  // the heap: crisp bags packed upright in rows and heaped over the back, boxes of sweets,
  // a tray of cans at the front, bags clipped on a line under the umbrella; muted, mixed colours
  const R = rng(p.seed || 29), bagCols = [FAB.red, FAB.maroon, FAB.yellow, FAB.orange, FAB.navy, FAB.brown, FAB.green, FAB.black, FAB.white, FAB.sky];
  const pick = () => bagCols[Math.floor(R() * bagCols.length)];
  for (let row = 0; row < 4; row++) for (let i = 0; i < 8; i++) {
    const g = rbox(0.11, 0.16, 0.035, 0.014, 0, 0.08, 0, 1);
    g.rotateX(-0.25 - R() * 0.35 - row * 0.05); g.rotateZ((R() - 0.5) * 0.35);
    g.translate(-W / 2 + 0.1 + i * 0.13 + (R() - 0.5) * 0.03, top + 0.06 + row * 0.055 + R() * 0.03, D / 2 - 0.2 - row * 0.1);
    M.add('fab', fcell(g, pick()));
  }
  for (let i = 0; i < 7; i++) M.add('fab', fcell(rbox(0.12 + R() * 0.08, 0.06 + R() * 0.06, 0.1, 0, 0, 0, 0).rotateY((R() - 0.5) * 0.5).translate(-W / 2 + 0.12 + i * 0.15, top + 0.3 + R() * 0.08, -D / 2 + 0.14), pick()));
  M.add('galvDull', rbox(0.42, 0.05, 0.16, 0, W / 2 - 0.3, top + 0.085, D / 2 - 0.1));
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) M.add('fab', fcell(cyl(0.033, 0.033, 0.122, 10, top + 0.06).translate(W / 2 - 0.47 + i * 0.068, 0, D / 2 - 0.135 + j * 0.07), [FAB.red, FAB.green, FAB.sky, FAB.orange, FAB.white][(i + 2 * j) % 5]));
  M.add('black', rod([-W / 2 + 0.05, top + 0.95, 0.05], [W / 2 - 0.05, top + 0.95, 0.05], 0.003, 3));
  for (let i = 0; i < 6; i++) { const g = rbox(0.12, 0.17, 0.03, 0.012, 0, -0.085, 0, 1); g.rotateY((R() - 0.5) * 0.6); g.translate(-W / 2 + 0.15 + i * 0.17, top + 0.94, 0.05); M.add('fab', fcell(g, pick())); }
  // a white bag of stock hung off the pole
  M.add('bagWhite', lathe([[0.001, 0], [0.12, 0.03], [0.15, 0.12], [0.12, 0.22], [0.03, 0.27], [0.001, 0.28]], 10).translate(0.12, top + 0.06, -0.05));
  return M;
}
