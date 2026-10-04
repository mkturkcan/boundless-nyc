// AR33 facade kit: procedural canvas textures (owner KIT, docs/notes/ar33-kit.md). Drawn from scratch at first use, cached:
// the walls of the shops behind the glass (a busy interior instead of coloured cubes), posters for the windows, venetian
// slats and folded curtains for the windows above, the streak of a drip stain under an air conditioner or an iron bracket.
// Every texture here is a small canvas (<= 512 px): the interiors are seen through glass from 8 m and more.
import * as THREE from 'three';

const CACHE = new Map();
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function make(key, w, h, draw, o = {}) {
  let t = CACHE.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = o.clampS ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.wrapT = o.clampT ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = o.aniso ?? (o.linear ? 8 : 16);   // (AR34 w2, LOOK: colour maps at 16, data maps at 8, as the city's)
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  CACHE.set(key, t);
  return t;
}
const hsl = (h, s, l, a = 1) => `hsla(${Math.round(((h % 360) + 360) % 360)},${Math.round(s)}%,${Math.round(l)}%,${a})`;
const pick = (R, arr) => arr[Math.floor(R() * arr.length) % arr.length];

// ------------------------------------------------------------------ venetian slats: one tile = one slat (2.54 cm)
export function slatsTex() {
  return make('slats', 16, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.18, '#f2f2f0'); gr.addColorStop(0.62, '#cfcfcb'); gr.addColorStop(0.86, '#a4a4a0'); gr.addColorStop(1, '#5c5c5a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, h - 5, w, 5);
  }, { aniso: 8 });
}
// ------------------------------------------------------------------ folded curtain: one tile = 0.7 m wide, vertical folds
export function curtainTex() {
  return make('curtain', 128, 32, (g, w, h) => {
    const R = rng(77);
    for (let x = 0; x < w; x++) {
      const t = x / w;
      const fold = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 5 + Math.sin(t * 9) * 0.6);
      const v = 150 + fold * 105 + (R() - 0.5) * 8;
      g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, h);
    }
    // a soft weave
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(0,0,0,${0.02 + R() * 0.03})`; g.fillRect(R() * w, 0, 1, h); }
  }, { aniso: 4 });
}
// ------------------------------------------------------------------ a drip stain: dark streaks fading downward (alpha); v = 1 at the top
export function stainTex(kind = 'drip') {
  return make('stain:' + kind, 64, 256, (g, w, h) => {
    const R = rng(kind === 'rust' ? 91 : 53);
    const C = kind === 'rust' ? '92,44,20' : '18,14,11';
    g.clearRect(0, 0, w, h);
    const cx = w / 2;
    for (let s = 0; s < 9; s++) {
      const sx = cx + (R() - 0.5) * w * 0.55, sw = 2 + R() * 9, len = h * (0.35 + R() * 0.65), a0 = 0.25 + R() * 0.5;
      const gr = g.createLinearGradient(0, 0, 0, len);
      gr.addColorStop(0, `rgba(${C},${a0})`); gr.addColorStop(0.45, `rgba(${C},${a0 * 0.55})`); gr.addColorStop(1, `rgba(${C},0)`);
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(sx - sw / 2, 0); g.lineTo(sx + sw / 2, 0); g.lineTo(sx + sw * 0.25, len); g.lineTo(sx - sw * 0.25, len); g.closePath(); g.fill();
    }
    // the soft body of the stain at its head
    const hg = g.createRadialGradient(cx, 0, 2, cx, 0, w * 0.62);
    hg.addColorStop(0, `rgba(${C},0.5)`); hg.addColorStop(1, `rgba(${C},0)`);
    g.fillStyle = hg; g.fillRect(0, 0, w, h * 0.35);
    // fade the left and right edges
    const eg = g.createLinearGradient(0, 0, w, 0);
    eg.addColorStop(0, 'rgba(0,0,0,1)'); eg.addColorStop(0.18, 'rgba(0,0,0,0)'); eg.addColorStop(0.82, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = eg; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
  }, { clampS: true, clampT: true });
}

// ------------------------------------------------------------------ posters: an atlas of 4 x 2 cells (each 128 x 192 px)
export const POSTER_COLS = 4, POSTER_ROWS = 2;
export function postersTex() {
  return make('posters', 512, 384, (g, W, H) => {
    const cw = W / POSTER_COLS, ch = H / POSTER_ROWS;
    for (let i = 0; i < POSTER_COLS * POSTER_ROWS; i++) {
      const R = rng(1000 + i * 31), x0 = (i % POSTER_COLS) * cw, y0 = Math.floor(i / POSTER_COLS) * ch;
      g.save(); g.beginPath(); g.rect(x0 + 1, y0 + 1, cw - 2, ch - 2); g.clip(); g.translate(x0, y0);
      const bars = (x, y, w, n, col, hh = 5, gap = 4) => { g.fillStyle = col; for (let k = 0; k < n; k++) g.fillRect(x, y + k * (hh + gap), w * (0.55 + R() * 0.45), hh); };
      switch (i) {
        case 0: // SALE: red field, a yellow starburst, white headline bars
          g.fillStyle = '#c4161c'; g.fillRect(0, 0, cw, ch);
          g.fillStyle = '#ffd21f'; g.beginPath();
          for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2, r = k % 2 ? 34 : 52; g.lineTo(cw / 2 + Math.cos(a) * r, 62 + Math.sin(a) * r); }
          g.closePath(); g.fill();
          g.fillStyle = '#c4161c'; g.fillRect(cw / 2 - 26, 52, 52, 8); g.fillRect(cw / 2 - 18, 66, 36, 8);
          bars(14, 128, cw - 28, 3, '#ffffff', 9, 6);
          break;
        case 1: // fashion: a gradient field, a dark figure, a headline
          { const gr = g.createLinearGradient(0, 0, cw, ch); gr.addColorStop(0, '#e9a8c3'); gr.addColorStop(1, '#6b4fa0'); g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
            g.fillStyle = '#1b1620'; g.beginPath(); g.ellipse(cw / 2, 52, 15, 19, 0, 0, Math.PI * 2); g.fill();
            g.beginPath(); g.moveTo(cw / 2 - 12, 70); g.lineTo(cw / 2 + 12, 70); g.lineTo(cw / 2 + 36, 160); g.lineTo(cw / 2 - 36, 160); g.closePath(); g.fill();
            bars(14, 164, cw - 28, 2, '#ffffff', 7, 5); }
          break;
        case 2: // tech: dark blue with a bright screen
          g.fillStyle = '#101c3a'; g.fillRect(0, 0, cw, ch);
          { const gr = g.createLinearGradient(0, 18, cw, 110); gr.addColorStop(0, '#46d1ff'); gr.addColorStop(1, '#2a5fe0'); g.fillStyle = gr; g.fillRect(14, 18, cw - 28, 96); }
          bars(14, 128, cw - 28, 3, '#dfe8ff', 6, 6);
          break;
        case 3: // food: warm field, a plate
          g.fillStyle = '#f2a31b'; g.fillRect(0, 0, cw, ch);
          g.fillStyle = '#fff6e5'; g.beginPath(); g.arc(cw / 2, 72, 46, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#9a4b1c'; g.beginPath(); g.arc(cw / 2, 72, 32, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#e8d070'; g.beginPath(); g.arc(cw / 2 + 6, 66, 14, 0, Math.PI * 2); g.fill();
          bars(14, 134, cw - 28, 3, '#3a1b0a', 8, 6);
          break;
        case 4: // night: black with neon bars
          g.fillStyle = '#0c0b10'; g.fillRect(0, 0, cw, ch);
          for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? '#ff3d9a' : '#27e0e8'; g.fillRect(12 + R() * 20, 22 + k * 24, cw - 40 - R() * 30, 7); }
          bars(14, 168, cw - 28, 1, '#ffffff', 6, 5);
          break;
        case 5: // price: white with big red blocks
          g.fillStyle = '#f6f3ea'; g.fillRect(0, 0, cw, ch);
          g.fillStyle = '#d3131a'; g.fillRect(16, 24, 26, 64); g.fillRect(50, 24, 26, 64); g.fillRect(84, 24, 26, 64);
          g.fillStyle = '#f6f3ea'; g.fillRect(24, 34, 10, 44); g.fillRect(58, 34, 10, 44); g.fillRect(92, 34, 10, 44);
          g.fillStyle = '#111'; g.fillRect(14, 104, cw - 28, 7); g.fillRect(14, 118, cw - 50, 7);
          bars(14, 142, cw - 28, 3, '#444', 5, 6);
          break;
        case 6: // green
          g.fillStyle = '#2f7d4a'; g.fillRect(0, 0, cw, ch);
          g.fillStyle = '#e8f2cf'; g.beginPath(); g.ellipse(cw / 2, 70, 38, 52, 0.4, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#2f7d4a'; g.beginPath(); g.ellipse(cw / 2 + 4, 70, 22, 40, 0.4, 0, Math.PI * 2); g.fill();
          bars(14, 138, cw - 28, 3, '#ffffff', 7, 6);
          break;
        default: // a notice: white sheet, small print
          g.fillStyle = '#efece4'; g.fillRect(0, 0, cw, ch);
          g.fillStyle = '#222'; g.fillRect(14, 14, cw - 28, 12);
          for (let k = 0; k < 14; k++) { g.fillStyle = 'rgba(40,40,40,0.8)'; g.fillRect(14, 38 + k * 10, (cw - 28) * (0.6 + R() * 0.4), 4); }
      }
      g.restore();
    }
  }, { clampS: true, clampT: true, aniso: 4 });
}

// ------------------------------------------------------------------ the walls of the shops: one tile = 4 m wide x 3.2 m high
export const SHOP_W = 4.0, SHOP_H = 3.2;
const PW = 512, PH = 410;        // 128 px / m
const ym = (y) => PH - y * 128;  // canvas y of a height above the floor (m)
const SHELF_PAL = {
  clothing: [[210, 6, 82], [20, 8, 18], [8, 70, 38], [215, 45, 30], [42, 55, 62], [150, 25, 32], [30, 40, 28], [335, 38, 55], [200, 12, 62], [48, 70, 55], [0, 0, 92], [25, 28, 45]],
  food: [[2, 80, 46], [48, 90, 55], [24, 90, 52], [210, 70, 42], [120, 50, 38], [0, 0, 94], [350, 70, 42], [195, 60, 55], [38, 80, 62], [280, 40, 40]],
  phone: [[0, 0, 12], [200, 80, 52], [330, 75, 55], [48, 90, 58], [145, 60, 42], [0, 80, 48], [270, 60, 52], [0, 0, 92], [20, 90, 55]],
  pharmacy: [[0, 0, 94], [205, 75, 45], [150, 55, 42], [28, 90, 56], [350, 70, 48], [0, 0, 82], [195, 65, 62]],
  default: [[30, 30, 60], [210, 25, 55], [0, 0, 88], [10, 45, 42], [48, 45, 60], [160, 25, 40], [260, 20, 50]],
};
function shelfRow(g, R, x0, x1, y, h, pal, wmin, wmax, hmin, hmax, label = true) {
  // a shelf board and a row of packages / folded stacks on it
  g.fillStyle = 'rgba(40,36,32,0.9)'; g.fillRect(x0, ym(y) + 0, x1 - x0, 3);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0, ym(y) + 3, x1 - x0, 5);
  let x = x0 + 1 + R() * 4;
  while (x < x1 - wmin) {
    const w = wmin + R() * (wmax - wmin), hh = Math.min(h, hmin + R() * (hmax - hmin));
    const c = pick(R, pal);
    const l = c[2] + (R() - 0.5) * 10;
    g.fillStyle = hsl(c[0] + (R() - 0.5) * 12, c[1], l);
    g.fillRect(x, ym(y) - hh, w, hh);
    // the pack's shading edge and a label band
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + w - 2, ym(y) - hh, 2, hh);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x, ym(y) - hh, w, 2);
    if (label && w > 12 && hh > 16) { g.fillStyle = hsl(c[0] + 160, 15, 92, 0.55); g.fillRect(x + 2, ym(y) - hh * 0.62, w - 4, hh * 0.28); }
    x += w + 1 + R() * 4;
  }
}
function shopPainters() {
  return {
    clothing(g, R, v) {
      // AR34 w2 b1 (BID3: every clothing shop read as a bookshelf): a sales floor's wall is garments, not shelves: a
      // double-hang of rails (shirts and jackets over, trousers and skirts under), face-outs on waterfall arms, a lit
      // campaign poster over them and one high shelf of folded stacks; light walls, a bright cove at the ceiling
      g.fillStyle = pick(R, ['#e6e2da', '#ddd8cf', '#efece6', '#d2ccc2']); g.fillRect(0, 0, PW, PH);
      const pal = SHELF_PAL.clothing;
      // the campaign poster (a figure-ish block of colour and a light field) and the cove light over the wall
      const px0 = PW * (0.08 + R() * 0.5), pw = 140 + R() * 110;
      g.fillStyle = hsl(v * 71 % 360, 18, 30); g.fillRect(px0, ym(3.05), pw, 74);
      g.fillStyle = hsl(v * 71 % 360 + 30, 25, 62); g.fillRect(px0 + pw * 0.55, ym(3.0), pw * 0.32, 64);
      g.fillStyle = 'rgba(255,250,236,0.35)'; g.fillRect(0, ym(3.2), PW, 7);
      shelfRow(g, R, 6, PW - 6, 2.42, 0.28 * 128, pal, 26, 46, 12, 22, false);
      // the rails and their garments, the hangers' hooks over each
      const hang = (ry, lenMin, lenMax, wMin, wMax) => {
        g.fillStyle = '#9a9c9e'; g.fillRect(0, ym(ry), PW, 3);
        for (let x = 6; x < PW - 10; x += wMin * 0.55 + R() * 4) {
          if (R() < 0.08) { x += 14; continue; }
          const c = pick(R, pal), len = (lenMin + R() * (lenMax - lenMin)) * 128, w = wMin + R() * (wMax - wMin);
          g.fillStyle = hsl(c[0] + (R() - 0.5) * 14, c[1], c[2] + (R() - 0.5) * 12); g.fillRect(x, ym(ry) + 4, w, len);
          g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + w - 2, ym(ry) + 4, 2, len);
          g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, ym(ry) + 4, w, 3);
          g.fillStyle = 'rgba(60,60,62,0.8)'; g.fillRect(x + w / 2 - 0.5, ym(ry) - 3, 1.5, 7);
        }
      };
      hang(2.12, 0.62, 0.85, 7, 12);
      hang(1.08, 0.55, 0.78, 6, 11);
      // a face-out on a waterfall arm every few metres: one garment seen flat, wider
      for (let k = 0; k < 2; k++) { const x = PW * (0.2 + k * 0.5 + R() * 0.15), c = pick(R, pal); g.fillStyle = hsl(c[0], c[1], c[2] + 4); g.fillRect(x, ym(1.95), 46, 0.62 * 128); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 44, ym(1.95), 2, 0.62 * 128); }
    },
    food(g, R, v) {
      g.fillStyle = pick(R, ['#e9e7df', '#dcdcd6', '#efe9d8']); g.fillRect(0, 0, PW, PH);
      const pal = SHELF_PAL.food;
      // a cooler bank on one side
      const cl = R() < 0.5 ? 0 : PW * 0.62, cw = PW * 0.38;
      for (let k = 0; k < 5; k++) shelfRow(g, R, 6, PW - 6 - (cl ? 0 : 0), 0.32 + k * 0.4, 0.38 * 128, pal, 10, 24, 22, 40, true);
      const gr = g.createLinearGradient(cl, 0, cl + cw, 0); gr.addColorStop(0, 'rgba(190,225,240,0.55)'); gr.addColorStop(1, 'rgba(210,235,245,0.4)');
      g.fillStyle = gr; g.fillRect(cl, ym(2.1), cw, 2.0 * 128);
      for (let k = 0; k < 4; k++) shelfRow(g, R, cl + 3, cl + cw - 3, 0.35 + k * 0.45, 0.4 * 128, [[120, 55, 40], [48, 90, 55], [0, 75, 45], [205, 70, 50], [0, 0, 90]], 7, 12, 26, 38, false);
      g.fillStyle = 'rgba(30,30,30,0.9)'; g.fillRect(cl, ym(2.12), cw, 4);
      // price strip and a signboard
      g.fillStyle = hsl(v * 40 % 360, 70, 45); g.fillRect(0, ym(2.9), PW, 20);
      g.fillStyle = 'rgba(255,255,255,0.8)'; for (let x = 10; x < PW - 30; x += 38) g.fillRect(x, ym(2.9) + 6, 24, 8);
    },
    phone(g, R, v) {
      g.fillStyle = pick(R, ['#1a1b1e', '#222428', '#e8e8ea']); g.fillRect(0, 0, PW, PH);
      const dark = g.fillStyle !== '#e8e8ea';
      // pegboard grids of cases
      const pal = SHELF_PAL.phone;
      for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 18; gx++) {
        if (R() < 0.12) continue;
        const c = pick(R, pal);
        g.fillStyle = hsl(c[0], c[1], c[2] + (R() - 0.5) * 10); g.fillRect(10 + gx * 27, ym(2.55) + gy * 36, 19, 30);
        g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(10 + gx * 27, ym(2.55) + gy * 36, 19, 3);
      }
      g.fillStyle = hsl(v * 90 % 360, 80, 50); g.fillRect(0, ym(3.1), PW, 14);
      g.fillStyle = dark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)'; g.fillRect(0, ym(0.95), PW, 3);
    },
    pharmacy(g, R, v) {
      g.fillStyle = '#eceae3'; g.fillRect(0, 0, PW, PH);
      const pal = SHELF_PAL.pharmacy;
      for (let k = 0; k < 6; k++) shelfRow(g, R, 6, PW - 6, 0.3 + k * 0.38, 0.34 * 128, pal, 10, 22, 18, 32, true);
      g.fillStyle = hsl(150 + v * 20 % 40, 60, 38); g.fillRect(0, ym(2.85), PW, 22);
      g.fillStyle = hsl(205, 70, 42); g.fillRect(0, ym(2.55), PW, 8);
    },
    restaurant(g, R, v) {
      if (v >= 2) {
        // AR34 w2 b1 (BID3: McDonald's 148 W, Panda Express 124 W): a counter-service wall: tiles in the house colour, a
        // row of lit menu boards over a stainless back counter with its machines, a dark kitchen pass between
        const hue = v === 2 ? 4 : 28;
        g.fillStyle = hsl(hue, 45, 30); g.fillRect(0, 0, PW, PH);
        for (let y = 0; y < PH; y += 16) for (let x = (y / 16) % 2 ? 0 : 16; x < PW; x += 32) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x, y, 30, 14); }
        g.fillStyle = '#121214'; g.fillRect(0, ym(3.0), PW, 0.95 * 128);
        for (let k = 0; k < 4; k++) {
          const x = 14 + k * 124, gr = g.createLinearGradient(0, ym(2.95), 0, ym(2.15));
          gr.addColorStop(0, '#fbf6ea'); gr.addColorStop(1, '#efe4cc');
          g.fillStyle = gr; g.fillRect(x, ym(2.95), 112, 0.78 * 128);
          for (let r = 0; r < 4; r++) { g.fillStyle = hsl(hue + (R() - 0.5) * 30, 70, 38 + R() * 15); g.fillRect(x + 8, ym(2.86) + r * 22, 30 + R() * 14, 14); g.fillStyle = 'rgba(30,30,30,0.7)'; g.fillRect(x + 50, ym(2.84) + r * 22, 44 + R() * 10, 3); g.fillRect(x + 50, ym(2.84) + r * 22 + 7, 30, 2); }
        }
        g.fillStyle = '#9ea2a6'; g.fillRect(0, ym(1.0), PW, 1.0 * 128);
        g.fillStyle = '#b9bdc1'; g.fillRect(0, ym(1.0), PW, 6);
        for (let x = 20; x < PW - 60; x += 70 + R() * 40) { g.fillStyle = pick(R, ['#2a2b2e', '#c9ccd0', '#7c8086']); g.fillRect(x, ym(1.55), 40 + R() * 20, 0.55 * 128); }
        g.fillStyle = 'rgba(10,10,12,0.85)'; g.fillRect(PW * 0.62, ym(2.05), PW * 0.22, 1.05 * 128);
        return;
      }
      // wood planks, a lit bottle shelf, menu boards
      for (let x = 0; x < PW; x += 24) { const l = 22 + R() * 10; g.fillStyle = hsl(24 + R() * 8, 45, l); g.fillRect(x, 0, 24, PH); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, 0, 1.5, PH); }
      const gr = g.createLinearGradient(0, ym(2.4), 0, ym(1.2)); gr.addColorStop(0, 'rgba(255,196,110,0.7)'); gr.addColorStop(1, 'rgba(255,150,60,0.25)');
      g.fillStyle = gr; g.fillRect(PW * 0.18, ym(2.4), PW * 0.55, 1.2 * 128);
      for (let r = 0; r < 3; r++) {
        g.fillStyle = 'rgba(30,18,10,0.9)'; g.fillRect(PW * 0.18, ym(1.5 + r * 0.38), PW * 0.55, 3);
        for (let x = PW * 0.18 + 6; x < PW * 0.73 - 8; x += 9 + R() * 6) { const hb = 26 + R() * 20; g.fillStyle = pick(R, ['#1d3a22', '#3a1d10', '#d9c46a', '#8a2a14', '#1a2b4a']); g.fillRect(x, ym(1.5 + r * 0.38) - hb, 6 + R() * 3, hb); }
      }
      g.fillStyle = '#0d0d0e'; g.fillRect(PW * 0.78, ym(2.8), 90, 120); g.fillRect(PW * 0.02, ym(2.7), 80, 100);
      g.fillStyle = 'rgba(255,255,255,0.75)';
      for (const bx of [PW * 0.78, PW * 0.02]) for (let k = 0; k < 9; k++) g.fillRect(bx + 8, ym(2.7) + 10 + k * 11, 50 + R() * 26, 3);
    },
    bank(g, R) {
      g.fillStyle = '#c9ccd0'; g.fillRect(0, 0, PW, PH);
      g.fillStyle = '#1b4f8f'; g.fillRect(0, ym(2.7), PW, 70);
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(PW * 0.1, ym(2.7) + 28, 120, 14);
      g.fillStyle = 'rgba(30,40,50,0.5)'; g.fillRect(PW * 0.5, ym(2.2), PW * 0.45, 2.2 * 128);
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(PW * 0.5, ym(2.2), PW * 0.45, 40);
    },
    empty(g, R) {
      g.fillStyle = '#77736c'; g.fillRect(0, 0, PW, PH);
      for (let k = 0; k < 240; k++) { g.fillStyle = `rgba(${R() < 0.5 ? 0 : 255},${R() < 0.5 ? 0 : 255},${R() < 0.5 ? 0 : 255},${0.02 + R() * 0.05})`; g.fillRect(R() * PW, R() * PH, 6 + R() * 50, 6 + R() * 40); }
      g.fillStyle = 'rgba(0,0,0,0.3)'; for (let x = 0; x < PW; x += 128) g.fillRect(x, 0, 2, PH);
    },
    default(g, R, v) {
      // AR34 w2 b1 (BID3): a display wall, not a bookcase: two glass shelves with a few products spaced out on them, framed
      // posters, a lit header band
      g.fillStyle = pick(R, ['#dedad1', '#d3cec4', '#e8e4dc']); g.fillRect(0, 0, PW, PH);
      const pal = SHELF_PAL.default;
      g.fillStyle = hsl(v * 53 % 360, 40, 36); g.fillRect(0, ym(2.95), PW, 22);
      for (let k = 0; k < 2; k++) {
        const y = 0.95 + k * 0.62;
        g.fillStyle = 'rgba(210,225,228,0.7)'; g.fillRect(8, ym(y), PW - 16, 3);
        g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(8, ym(y) + 3, PW - 16, 4);
        for (let x = 18 + R() * 20; x < PW - 40; x += 40 + R() * 46) {
          const c = pick(R, pal), w = 12 + R() * 16, hh = 14 + R() * 26;
          g.fillStyle = hsl(c[0] + (R() - 0.5) * 16, c[1], c[2]); g.fillRect(x, ym(y) - hh, w, hh);
          g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, ym(y) - hh, w, 2);
        }
      }
      for (let k = 0; k < 2; k++) { const x = PW * (0.12 + k * 0.48 + R() * 0.1), w = 90 + R() * 40; g.fillStyle = '#26272a'; g.fillRect(x - 3, ym(2.62) - 3, w + 6, 0.7 * 128 + 6); g.fillStyle = hsl(R() * 360, 30, 45 + R() * 20); g.fillRect(x, ym(2.62), w, 0.7 * 128); }
    },
  };
}
// the wall of a shop of this kind, variant 0..3
// AR34 w2 (draw calls): every shop wall in one atlas, the six painters x four variants as 4 x 6 tiles of 512 x 341 px (the
// painters' 512 x 410 canvases drawn scaled), so one material draws every shop wall of a cell; shopTile(kind, variant) ->
// the tile's uv offset (canvas row r is v 1 - (r + 1) / rows, flipY)
// (AR34 w2 b1, HPT: 'bank' and 'empty' have rows of their own, 8 rows of 320 px: an empty shop took the default painter's
// shelves of goods)
export const SHOP_KINDS = ['clothing', 'food', 'phone', 'pharmacy', 'restaurant', 'default', 'bank', 'empty'];
export function shopAtlasTex() {
  return make('shopAtlas', 2048, 320 * SHOP_KINDS.length, (g, w, h) => {
    const tw = w / 4, th = h / SHOP_KINDS.length;
    SHOP_KINDS.forEach((kind, r) => { for (let v = 0; v < 4; v++) { const t = shopWallTex(kind, v); if (t && t.image && typeof g.drawImage === 'function') g.drawImage(t.image, v * tw, r * th, tw, th); } });
  }, { clampS: true, clampT: true });
}
export function shopTile(kind, variant) {
  let r = SHOP_KINDS.indexOf(kind);
  if (r < 0) r = SHOP_KINDS.length - 1;
  return [(variant % 4) / 4, 1 - (r + 1) / SHOP_KINDS.length];
}
export function shopWallTex(kind = 'default', variant = 0) {
  const painters = shopPainters();
  const fn = painters[kind] || painters.default;
  const key = `shop:${kind}:${variant}`;
  return make(key, PW, PH, (g, w, h) => {
    const R = rng(7919 * (variant + 1) + kind.length * 131 + kind.charCodeAt(0));
    fn(g, R, variant);
    // the light from the ceiling: bright at the top, falling off down the wall, and the dark foot
    const lg = g.createLinearGradient(0, 0, 0, h);
    lg.addColorStop(0, 'rgba(255,248,230,0.22)'); lg.addColorStop(0.4, 'rgba(255,248,230,0)'); lg.addColorStop(0.9, 'rgba(0,0,0,0.12)'); lg.addColorStop(1, 'rgba(0,0,0,0.38)');
    g.fillStyle = lg; g.fillRect(0, 0, w, h);
  }, { clampT: true, aniso: 4 });
}
export function shopKinds() { return Object.keys(shopPainters()); }

// ------------------------------------------------------------------ a roll-down security curtain: one tile = 1 m x 1 m
// AR34 (BID1, BID3: the closed curtains read as marble in the painted-steel set). Interlocking slats every 75 mm, each a
// shallow curved strip with a dark seam and a light crown, white in the albedo (the gate's colour is the material's), a
// little dirt and rust at the seams; variant 1..3 adds spray tags (invented scrawls, no words). The normal map carries the
// slats' curve so the light rakes across them.
export const SHUTTER_PITCH = 0.075;
export function shutterTex(variant = 0) {
  return make('shutter:' + variant, 128, 512, (g, w, h) => {
    const R = rng(4217 + variant * 131);
    const n = Math.round(1 / SHUTTER_PITCH), sp = h / n;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const y0 = i * sp;
      const gr = g.createLinearGradient(0, y0, 0, y0 + sp);
      gr.addColorStop(0, 'rgb(150,150,150)'); gr.addColorStop(0.12, 'rgb(236,236,236)'); gr.addColorStop(0.45, 'rgb(255,255,255)');
      gr.addColorStop(0.85, 'rgb(214,214,214)'); gr.addColorStop(1, 'rgb(120,120,120)');
      g.fillStyle = gr; g.fillRect(0, y0, w, sp);
      // grime held in the seam, rust spots now and then
      g.fillStyle = `rgba(60,52,44,${0.18 + R() * 0.12})`; g.fillRect(0, y0 + sp - 3, w, 3);
      for (let k = 0; k < 3; k++) if (R() < 0.35) { g.fillStyle = `rgba(110,62,30,${0.15 + R() * 0.25})`; g.fillRect(R() * w, y0 + sp - 4, 2 + R() * 10, 3); }
    }
    // a faint vertical wear (hands, the bottom bar's rub)
    for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(0,0,0,${0.02 + R() * 0.03})`; g.fillRect(R() * w, 0, 1 + R() * 3, h); }
    if (variant > 0) {
      // tags: a few looping strokes in spray colours
      const cols = ['#111111', '#d01f2f', '#1f5fd0', '#f2f2f2', '#2fa84f', '#e8b51e', '#7a2fd0'];
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (let t = 0; t < 2 + variant; t++) {
        g.strokeStyle = cols[Math.floor(R() * cols.length)]; g.globalAlpha = 0.75 + R() * 0.2; g.lineWidth = 3 + R() * 5;
        g.beginPath();
        let x = R() * w, y = 60 + R() * (h - 120);
        g.moveTo(x, y);
        for (let s = 0; s < 6 + Math.floor(R() * 6); s++) { const nx = Math.max(4, Math.min(w - 4, x + (R() - 0.5) * 70)), ny = Math.max(10, Math.min(h - 10, y + (R() - 0.5) * 90)); g.quadraticCurveTo(x + (R() - 0.5) * 60, y + (R() - 0.5) * 60, nx, ny); x = nx; y = ny; }
        g.stroke();
      }
      g.globalAlpha = 1;
    }
  });
}
export function shutterNormalTex() {
  return make('shutterN', 8, 512, (g, w, h) => {
    const n = Math.round(1 / SHUTTER_PITCH), sp = h / n;
    const img = typeof g.createImageData === 'function' ? g.createImageData(w, h) : null;
    if (!img || !img.data) return;   // (no pixel access: a flat normal)
    for (let y = 0; y < h; y++) {
      const t = (y % sp) / sp;                      // 0 at a slat's top seam, 1 at its bottom seam
      // the slat's surface tilts up at its top and down at its bottom (a shallow arc); the seams are steep
      let ny = (0.5 - t) * 0.9;
      if (t < 0.08) ny = 0.85; else if (t > 0.92) ny = -0.85;
      const nz = Math.sqrt(Math.max(0.05, 1 - ny * ny));
      // (canvas row 0 is the top of the tile, v = 1 with flipY: a slat's top rows face up, +G)
      const r = 128, gg = Math.round((ny * 0.5 + 0.5) * 255), b = Math.round((nz * 0.5 + 0.5) * 255);
      for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255; }
    }
    g.putImageData(img, 0, 0);
  }, { linear: true });
}

// ------------------------------------------------------------------ graffiti (AR34: the owner, "graffiti where there is graffiti")
// The painter is BID3's paintGraffiti (fk/custom/bid3Paint.js, drawn from scratch: invented letterforms, throw-ups, tags,
// buffs, stickers, drips, overspray), adopted for every segment; until it has loaded, or if that file fails, the kit's own
// tag strokes below. graffitiTex(wM, hM, seed, o) -> { map, rough }: one canvas for one zone, pxm pixels per metre (100,
// capped to 4096 px across), transparent where nothing is painted; `rough` is the paint's sheen (gloss spray enamel 0.36,
// matt marker 0.5, the substrate untouched where the alpha is 0). o: { density (0.7), style: 'tags' | 'throwups' |
// 'piece', bandTop (share of the height left clean at the top), slats (true: the curtain's seams cut through the paint) }.
let PAINT = null;
// (AR34 w2: the painter is the kit's own copy, fk/kitPaint.js; BID3 keeps custom/bid3Paint.js for its builders)
export const paintReady = import('./kitPaint.js').then((m) => { if (m && typeof m.paintGraffiti === 'function') PAINT = m; })
  .catch(() => { /* the kit's own tags */ });
function ownTags(g, W, H, R, pxm, dens) {
  const cols = ['#111111', '#111111', '#d01f2f', '#1f5fd0', '#f2f2f2', '#2fa84f', '#e8b51e', '#7a2fd0'];
  g.lineCap = 'round'; g.lineJoin = 'round';
  const n = Math.max(1, Math.round((W / pxm) * 3 * dens));
  for (let t = 0; t < n; t++) {
    g.strokeStyle = cols[Math.floor(R() * cols.length)]; g.globalAlpha = 0.8 + R() * 0.18; g.lineWidth = Math.max(2, pxm * (0.025 + R() * 0.03));
    g.beginPath();
    let x = R() * W, y = H * 0.25 + R() * H * 0.6;
    g.moveTo(x, y);
    const w = pxm * (0.5 + R() * 0.9);
    for (let s = 0; s < 6 + Math.floor(R() * 6); s++) { const nx = Math.max(4, Math.min(W - 4, x + (R() - 0.3) * w * 0.35)), ny = Math.max(6, Math.min(H - 6, y + (R() - 0.5) * pxm * 0.35)); g.quadraticCurveTo(x + (R() - 0.5) * pxm * 0.3, y + (R() - 0.5) * pxm * 0.3, nx, ny); x = nx; y = ny; }
    g.stroke();
  }
  g.globalAlpha = 1;
}
const GCACHE = new Map();
export function graffitiTex(wM, hM, seed = 1, o = {}) {
  const key = `${wM.toFixed(2)}|${hM.toFixed(2)}|${seed}|${o.density ?? ''}|${o.style || ''}|${o.bandTop ?? ''}|${o.slats ? 1 : 0}|${PAINT ? 'p' : 'o'}`;
  if (GCACHE.has(key)) return GCACHE.get(key);
  const pxm = Math.max(24, Math.min(o.pxm ?? 100, 4096 / Math.max(wM, 0.1), 2048 / Math.max(hM, 0.1)));
  const W = Math.max(32, Math.round(wM * pxm)), H = Math.max(32, Math.round(hM * pxm));
  const dens = Math.max(0, Math.min(1, o.density ?? 0.7));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const R = rng(9173 + seed * 7919);
  if (g) {
    if (o.style === 'tags' || !PAINT) ownTags(g, W, H, R, pxm, dens);
    else {
      PAINT.paintGraffiti(g, W, H, seed, { density: o.style === 'piece' ? Math.min(1, dens * 1.3) : dens, pxm, bandTop: o.bandTop ?? (o.style === 'piece' ? 0.12 : 0.3) });
      // (AR34 w2: aged, not fresh: the sun's fade, grime run down over the paint, flecks gone to the steel; gfW read new)
      if (typeof PAINT.paintWear === 'function') PAINT.paintWear(g, W, H, seed, { pxm, fade: 0.12, flake: 0.7, runs: 0.9 });
    }
    // weathering of the paint: sun-faded lighter bloom, scuffs through to the substrate, grime run down over it
    g.save(); g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 0, W, H * 0.4);
    for (let k = 0; k < Math.round(W / pxm * 6); k++) { g.fillStyle = `rgba(40,34,28,${0.06 + R() * 0.1})`; g.fillRect(R() * W, R() * H * 0.6, 1 + R() * 2.5, H * (0.15 + R() * 0.4)); }
    if (o.slats) { const sp = pxm * 0.075; for (let y = H - sp; y > 0; y -= sp) { g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(0, y, W, Math.max(1, pxm * 0.006)); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, y + Math.max(1, pxm * 0.006), W, Math.max(1, pxm * 0.005)); } }
    g.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < Math.round(W / pxm * 10); k++) { g.fillStyle = `rgba(0,0,0,${0.25 + R() * 0.5})`; g.fillRect(R() * W, R() * H, 1 + R() * pxm * 0.05, 1 + R() * pxm * 0.03); }
    g.restore();
  }
  // the sheen: spray enamel glossy where the paint is (alpha), the rest matt (the decal is transparent there anyway)
  const rc = document.createElement('canvas'); rc.width = Math.max(8, W >> 1); rc.height = Math.max(8, H >> 1);
  const rg = rc.getContext('2d');
  if (rg) {
    rg.fillStyle = 'rgb(235,235,235)'; rg.fillRect(0, 0, rc.width, rc.height);
    rg.globalCompositeOperation = 'source-over';
    rg.filter = 'grayscale(1) brightness(0) contrast(1)';
    rg.globalAlpha = 0.62; rg.drawImage(c, 0, 0, rc.width, rc.height);
    rg.filter = 'none'; rg.globalAlpha = 1;
  }
  const mk = (cv, lin) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = lin ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = lin ? 8 : 16; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; return t; };
  const out = { map: mk(c, false), rough: mk(rc, true), W, H };
  GCACHE.set(key, out);
  return out;
}

// AR34 w2 (BID3: `wall.weather`, a mural item): a weathered render ('stucco') or an invented mural ('mural') for one zone,
// fk/kitPaint.js paintStucco / paintMural with paintWear over it; { map, rough } as graffitiTex. Opaque but for the flecks
// where the paint has flaked to the wall (the mural) and its soft edges. o: the painter's options (base, ghost, glyphs,
// style, palette, ground, fade, flake).
export function paintTex(kind, wM, hM, seed = 1, o = {}) {
  const key = `${kind}|${wM.toFixed(2)}|${hM.toFixed(2)}|${seed}|${JSON.stringify(o)}|${PAINT ? 'p' : 'o'}`;
  if (GCACHE.has(key)) return GCACHE.get(key);
  const pxm = Math.max(16, Math.min(o.pxm ?? (kind === 'mural' ? 60 : 50), 2048 / Math.max(wM, 0.1), 1024 / Math.max(hM, 0.1)));
  const W = Math.max(32, Math.round(wM * pxm)), H = Math.max(32, Math.round(hM * pxm));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (g) {
    if (!PAINT) { g.fillStyle = kind === 'mural' ? '#8a6d5a' : '#b2a892'; g.fillRect(0, 0, W, H); }
    else if (kind === 'mural') { PAINT.paintMural(g, W, H, seed, { ...o, pxm }); PAINT.paintWear(g, W, H, seed, { pxm, fade: o.fade ?? 0.18, flake: o.flake ?? 1, runs: 1 }); }
    else { PAINT.paintStucco(g, W, H, seed, { ...o, pxm }); PAINT.paintWear(g, W, H, seed, { pxm, fade: 0.04, flake: o.flake ?? 0.25, runs: 0.6 }); }
  }
  const rc = document.createElement('canvas'); rc.width = Math.max(8, W >> 1); rc.height = Math.max(8, H >> 1);
  const rg = rc.getContext('2d');
  if (rg) { rg.fillStyle = kind === 'mural' ? 'rgb(190,190,190)' : 'rgb(238,238,238)'; rg.fillRect(0, 0, rc.width, rc.height); }
  const mk = (cv, lin) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = lin ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = lin ? 8 : 16; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; return t; };
  const out = { map: mk(c, false), rough: mk(rc, true), W, H };
  GCACHE.set(key, out);
  return out;
}

// ------------------------------------------------------------------ ribbed / corrugated metal cladding (AR34)
// One tile = 1 m across the ribs (texture u runs across them): a trapezoidal rib profile every `pitch` metres (0.15 box
// rib, 0.068 corrugated wave) in the normal map, a faint wear and seam pattern in the albedo (white: the tint is the
// material's colour). kind 'box' (flat crowns and pans, sloped webs) or 'wave' (a sine).
export function ribTex(pitch = 0.15, kind = 'box') {
  const n = Math.max(1, Math.round(1 / pitch));
  return make(`rib:${n}:${kind}`, 512, 8, (g, w, h) => {
    const img = typeof g.createImageData === 'function' ? g.createImageData(w, h) : null;
    if (!img || !img.data) return;
    const sp = w / n;
    for (let x = 0; x < w; x++) {
      const t = (x % sp) / sp;
      let nx;
      if (kind === 'wave') nx = Math.cos(t * Math.PI * 2) * 0.55;
      else nx = t < 0.18 ? 0 : t < 0.3 ? 0.8 : t < 0.7 ? 0 : t < 0.82 ? -0.8 : 0;   // crown, web up, pan, web down
      const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx));
      const r = Math.round((nx * 0.5 + 0.5) * 255), b = Math.round((nz * 0.5 + 0.5) * 255);
      for (let y = 0; y < h; y++) { const o = (y * w + x) * 4; img.data[o] = r; img.data[o + 1] = 128; img.data[o + 2] = b; img.data[o + 3] = 255; }
    }
    g.putImageData(img, 0, 0);
  }, { linear: true });
}
export function ribAlbedoTex(pitch = 0.15) {
  const n = Math.max(1, Math.round(1 / pitch));
  return make(`ribA:${n}`, 512, 512, (g, w, h) => {
    const R = rng(77 + n);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    const sp = w / n;
    for (let i = 0; i < n; i++) {
      // the pan of each rib holds a little dirt; the crowns are lighter (weathered paint)
      g.fillStyle = 'rgba(70,64,58,0.10)'; g.fillRect(i * sp + sp * 0.32, 0, sp * 0.36, h);
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(i * sp, 0, sp * 0.16, h);
    }
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(40,34,28,${0.03 + R() * 0.06})`; g.fillRect(R() * w, R() * h, 1 + R() * 4, 20 + R() * 160); }
  });
}

// ------------------------------------------------------------------ roof membrane weathering (AR34, BID2 3): one tile = 24 m
// (AR34 w2: ponding and patches about 1.6 x stronger; from the air the 18:15 decal hardly read, apAerial w2b2)
// Transparent: ponding marks (irregular blotches with a sediment rim), patches of newer membrane, lap seams every 3 m one
// way, drag marks; laid over the membrane as a decal in world space. A 24 m tile so a roof seldom shows a repeat.
export const ROOF_STAIN_M = 24;
export function roofStainTex() {
  return make('roofStain', 1024, 1024, (g, w, h) => {
    const R = rng(5531), pxm = w / ROOF_STAIN_M;
    g.clearRect(0, 0, w, h);
    for (let x = pxm * 3; x < w; x += pxm * 3) { g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(x, 0, 2, h); g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(x + 2, 0, 2, h); }
    // ponding: blotches built of a few overlapping ellipses each (irregular), dark centre, a faint sediment rim
    for (let k = 0; k < 16; k++) {
      const x = R() * w, y = R() * h, r = pxm * (0.5 + R() * 1.8);
      for (let q = 0; q < 3; q++) {
        const ox = x + (R() - 0.5) * r, oy = y + (R() - 0.5) * r, rr = r * (0.45 + R() * 0.5);
        const gr = g.createRadialGradient(ox, oy, rr * 0.1, ox, oy, rr);
        gr.addColorStop(0, 'rgba(24,22,19,0.2)'); gr.addColorStop(0.85, 'rgba(24,22,19,0.13)'); gr.addColorStop(0.95, 'rgba(150,145,135,0.1)'); gr.addColorStop(1, 'rgba(150,145,135,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(ox, oy, rr, rr * (0.55 + R() * 0.45), R() * Math.PI, 0, Math.PI * 2); g.fill();
      }
    }
    // patches of newer membrane: a few, faint, of varied size, darker more often than lighter
    for (let k = 0; k < 9; k++) { const pw = pxm * (0.7 + R() * 2.4), ph = pxm * (0.6 + R() * 1.8); g.fillStyle = R() < 0.3 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.15)'; g.fillRect(R() * (w - pw), R() * (h - ph), pw, ph); }
    for (let k = 0; k < 80; k++) { g.fillStyle = `rgba(0,0,0,${0.03 + R() * 0.06})`; g.fillRect(R() * w, R() * h, 1 + R() * 2, pxm * (0.3 + R() * 1.4)); }
  });
}
