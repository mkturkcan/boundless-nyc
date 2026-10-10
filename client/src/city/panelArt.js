// Procedural artwork for the street-furniture PANELS — the blank rectangles the
// blind critic kept finding in frame (round 5 defect 19 / §7.8: "blank grey
// kiosk panels, a bus shelter with a blank ad panel, a blank white sign panel
// on a post"). Every one of them was a single flat vertex colour on a quad.
//
// ONE shared 1024 canvas holds every panel face, so a pool that carries a panel
// costs the same ONE draw call it always did: the panel quads' UVs point at
// their slot, and `blankUV()` points every other triangle of the same pool at a
// pure-white block in the corner, where map * vertexColor is just the vertex
// colour the kit already authored. Nothing else in the pool changes.
//
// STOREFRONT AND BILLBOARD TEXT IS NOT HERE — `src/city/signText.js` (street
// name blades) and the facade pass own those. This file is street furniture:
// kiosk faces, the shelter ad case, regulatory sign faces, the newsstand board.
//
// Brands are fictional. Legends are sized so the biggest line is ~1/6 of the
// panel height, which is the smallest that survives 20 m at 1760x990.
import * as THREE from 'three';

const S = 1024;
// slots in CANVAS pixels [x, y, w, h]; v is flipped at UV time (CanvasTexture
// uploads flipY, exactly as signText.js does it)
// Every slot's pixel aspect MATCHES its panel's metre aspect, so nothing is
// stretched, and no two slots overlap (checked by hand — see the ranges).
const SLOTS = {
  kioskAd:    [4, 4, 288, 512],       // LinkNYC face,   0.686 x 1.22  (0.5625 vs 0.562)
  kioskInfo:  [300, 4, 288, 512],     // LinkNYC face B: wayfinding
  shelterAd:  [596, 4, 356, 512],     // junior poster,  1.219 x 1.753 (0.695 vs 0.695)
  oneWay:     [4, 524, 384, 128],     // MUTCD R6-1,     0.75 x 0.25   (3.0 vs 3.0)
  parkReg:    [600, 524, 172, 264],   // parking regs,   0.30 x 0.46   (0.6515 vs 0.652)
  newsBoard:  [4, 660, 480, 100],     // headline band,  2.4 x 0.5     (4.8 vs 4.8)
  blank:      [984, 984, 36, 36],     // pure white: the "no panel here" slot
};

let tex = null;

function px(name) { return SLOTS[name]; }

function draw() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  // the whole sheet starts white so any UV that misses a slot is a no-op tint
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, S, S);

  const line = (text, cx, cy, size, weight, fill, family = '"Helvetica Neue", Arial, sans-serif', wMax = 1e9) => {
    let s = size;
    c.font = `${weight} ${s}px ${family}`;
    while (c.measureText(text).width > wMax && s > 6) { s -= 1; c.font = `${weight} ${s}px ${family}`; }
    c.fillStyle = fill;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, cx, cy);
    return s;
  };

  // ---------------------------------------------------------------- kiosk ad
  // A backlit 55" portrait display. Big brand word, one line of copy, a colour
  // field: the three things that read at 20 m. (Fictional: "HAVEMEYER".)
  {
    const [x, y, w, h] = px('kioskAd');
    const g = c.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#0f2f5e'); g.addColorStop(0.55, '#1d5fa8'); g.addColorStop(1, '#0b2547');
    c.fillStyle = g; c.fillRect(x, y, w, h);
    // a bold diagonal so the panel is never a flat field even at 60 m
    c.save();
    c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.fillStyle = 'rgba(255,255,255,0.10)';
    c.beginPath(); c.moveTo(x - 40, y + h * 0.72); c.lineTo(x + w + 40, y + h * 0.30);
    c.lineTo(x + w + 40, y + h * 0.62); c.lineTo(x - 40, y + h); c.closePath(); c.fill();
    c.restore();
    line('HAVEMEYER', x + w / 2, y + h * 0.30, 62, 800, '#ffffff', '"Helvetica Neue", Arial, sans-serif', w - 22);
    c.fillStyle = '#f2c53d'; c.fillRect(x + w * 0.22, y + h * 0.375, w * 0.56, 7);
    line('COLD  BREW', x + w / 2, y + h * 0.455, 34, 600, '#dce8f6', '"Helvetica Neue", Arial, sans-serif', w - 30);
    line('BREWED IN', x + w / 2, y + h * 0.79, 22, 500, '#9dc0e4', '"Helvetica Neue", Arial, sans-serif', w - 40);
    line('BROOKLYN', x + w / 2, y + h * 0.855, 40, 800, '#ffffff', '"Helvetica Neue", Arial, sans-serif', w - 30);
  }

  // -------------------------------------------------------------- kiosk info
  // The wayfinding face: a transit panel. Dark ground, route bullets, a
  // schematic line, a "you are here" band. No agency marks.
  {
    const [x, y, w, h] = px('kioskInfo');
    c.fillStyle = '#101318'; c.fillRect(x, y, w, h);
    c.fillStyle = '#1c2027'; c.fillRect(x, y, w, 66);
    line('NEARBY TRANSIT', x + w / 2, y + 34, 30, 700, '#ffffff', '"Helvetica Neue", Arial, sans-serif', w - 22);
    // route bullets
    const bullets = [['2', '#ee352e'], ['3', '#ee352e'], ['4', '#00933c'], ['5', '#00933c'], ['6', '#00933c']];
    const r = 26, gap = (w - 24) / bullets.length;
    bullets.forEach(([t, col], i) => {
      const bx = x + 12 + gap * (i + 0.5), by = y + 118;
      c.fillStyle = col; c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fill();
      line(t, bx, by + 2, 34, 800, '#ffffff');
    });
    // schematic line with stops
    c.strokeStyle = '#5a6472'; c.lineWidth = 8;
    c.beginPath(); c.moveTo(x + 26, y + 210); c.lineTo(x + w - 26, y + 210); c.stroke();
    for (let i = 0; i < 5; i++) {
      const sx = x + 26 + ((w - 52) / 4) * i;
      c.fillStyle = i === 2 ? '#f2c53d' : '#e6ecf3';
      c.beginPath(); c.arc(sx, y + 210, i === 2 ? 12 : 8, 0, Math.PI * 2); c.fill();
    }
    line('125 ST', x + w / 2, y + 262, 34, 800, '#f2c53d', '"Helvetica Neue", Arial, sans-serif', w - 30);
    line('YOU ARE HERE', x + w / 2, y + 298, 20, 600, '#9aa6b4', '"Helvetica Neue", Arial, sans-serif', w - 30);
    // a block plan under it: streets as bars
    c.fillStyle = '#1a1e25'; c.fillRect(x + 16, y + 330, w - 32, h - 356);
    c.strokeStyle = '#2e3540'; c.lineWidth = 6;
    for (let i = 1; i < 4; i++) {
      const gy = y + 330 + ((h - 356) / 4) * i;
      c.beginPath(); c.moveTo(x + 16, gy); c.lineTo(x + w - 16, gy); c.stroke();
    }
    for (let i = 1; i < 3; i++) {
      const gx = x + 16 + ((w - 32) / 3) * i;
      c.beginPath(); c.moveTo(gx, y + 330); c.lineTo(gx, y + h - 26); c.stroke();
    }
    c.fillStyle = '#f2c53d';
    c.beginPath(); c.arc(x + 16 + (w - 32) / 3, y + 330 + (h - 356) / 2, 11, 0, Math.PI * 2); c.fill();
  }

  // ------------------------------------------------------------- shelter ad
  // The junior poster in the shelter's end case. A poster is a photograph plus
  // a headline; with no photograph to hand, a strong colour field, a silhouette
  // band and a two-line headline is what reads. (Fictional: "MERIDIAN".)
  {
    const [x, y, w, h] = px('shelterAd');
    c.fillStyle = '#f4f1ea'; c.fillRect(x, y, w, h);
    // image area
    const g = c.createLinearGradient(x, y, x + w, y + h * 0.62);
    g.addColorStop(0, '#b4472f'); g.addColorStop(1, '#e0864a');
    c.fillStyle = g; c.fillRect(x, y, w, h * 0.62);
    // a skyline silhouette so the top half is not a flat wash
    c.fillStyle = 'rgba(20,16,14,0.55)';
    let bx = x;
    let sd = 7;
    const rr = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return (sd >>> 8 & 0xffff) / 0xffff; };
    while (bx < x + w) {
      const bw = 18 + rr() * 34, bh = 40 + rr() * 130;
      c.fillRect(bx, y + h * 0.62 - bh, Math.min(bw, x + w - bx), bh);
      bx += bw + 3;
    }
    line('MERIDIAN', x + w / 2, y + h * 0.20, 74, 800, '#ffffff', '"Helvetica Neue", Arial, sans-serif', w - 26);
    line('COFFEE  CO.', x + w / 2, y + h * 0.295, 36, 500, '#ffe6cf', '"Helvetica Neue", Arial, sans-serif', w - 40);
    // headline block on the cream half
    line('OPEN', x + w / 2, y + h * 0.735, 78, 800, '#1a1c1f', '"Helvetica Neue", Arial, sans-serif', w - 26);
    line('ALL NIGHT', x + w / 2, y + h * 0.835, 52, 800, '#b4472f', '"Helvetica Neue", Arial, sans-serif', w - 26);
    c.fillStyle = '#1a1c1f'; c.fillRect(x + w * 0.30, y + h * 0.885, w * 0.40, 5);
    line('125 ST  &  LENOX', x + w / 2, y + h * 0.94, 24, 600, '#4a4e55', '"Helvetica Neue", Arial, sans-serif', w - 30);
  }

  // ------------------------------------------------------------- ONE WAY (R6-1)
  {
    const [x, y, w, h] = px('oneWay');
    c.fillStyle = '#17191c'; c.fillRect(x, y, w, h);
    c.strokeStyle = '#e9ebec'; c.lineWidth = 5;
    c.strokeRect(x + 6, y + 6, w - 12, h - 12);
    // arrow: shaft + head, pointing left (the blade is flipped per instance by
    // its own rotation, so one face is enough)
    const ay = y + h / 2;
    c.fillStyle = '#e9ebec';
    c.fillRect(x + 0.30 * w, ay - 7, 0.26 * w, 14);
    c.beginPath();
    c.moveTo(x + 0.22 * w, ay); c.lineTo(x + 0.32 * w, ay - 24); c.lineTo(x + 0.32 * w, ay + 24);
    c.closePath(); c.fill();
    line('ONE WAY', x + 0.74 * w, ay + 1, 54, 800, '#e9ebec', '"Helvetica Neue", Arial, sans-serif', w * 0.40);
  }

  // --------------------------------------------- NYC parking regulation sign
  {
    const [x, y, w, h] = px('parkReg');
    c.fillStyle = '#ffffff'; c.fillRect(x, y, w, h);
    c.strokeStyle = '#b0141d'; c.lineWidth = 6;
    c.strokeRect(x + 4, y + 4, w - 8, h - 8);
    line('NO', x + w / 2, y + 40, 46, 800, '#b0141d', '"Helvetica Neue", Arial, sans-serif', w - 22);
    line('PARKING', x + w / 2, y + 84, 34, 800, '#b0141d', '"Helvetica Neue", Arial, sans-serif', w - 18);
    // arrow band
    c.fillStyle = '#b0141d';
    c.fillRect(x + 0.30 * w, y + 112, 0.44 * w, 9);
    c.beginPath();
    c.moveTo(x + 0.86 * w, y + 116.5); c.lineTo(x + 0.70 * w, y + 100); c.lineTo(x + 0.70 * w, y + 133);
    c.closePath(); c.fill();
    line('8 AM - 6 PM', x + w / 2, y + 158, 26, 700, '#17191c', '"Helvetica Neue", Arial, sans-serif', w - 18);
    line('MON THRU FRI', x + w / 2, y + 190, 22, 700, '#17191c', '"Helvetica Neue", Arial, sans-serif', w - 34);
    c.fillStyle = '#17191c'; c.fillRect(x + 0.18 * w, y + 208, 0.64 * w, 3);
    line('SANITATION', x + w / 2, y + 232, 20, 600, '#4a4e55', '"Helvetica Neue", Arial, sans-serif', w - 20);
  }

  // ---------------------------------------------------- newsstand headline board
  {
    const [x, y, w, h] = px('newsBoard');
    c.fillStyle = '#14301f'; c.fillRect(x, y, w, h);
    c.fillStyle = '#f2c53d'; c.fillRect(x, y, w, 9);
    c.fillStyle = '#f2c53d'; c.fillRect(x, y + h - 9, w, 9);
    line('NEWS · LOTTO · COFFEE', x + w / 2, y + h / 2 + 2, 60, 800, '#f6f4ec', '"Helvetica Neue", Arial, sans-serif', w - 28);
  }

  // the blank slot must be exactly white with a margin of white around it
  {
    const [x, y, w, h] = px('blank');
    c.fillStyle = '#ffffff'; c.fillRect(x - 4, y - 4, w + 8, h + 8);
  }

  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function panelTexture() {
  if (!tex && typeof document !== 'undefined') tex = draw();
  return tex;
}

// UV rect for a slot, inset one texel so mip levels never bleed a neighbour in
function rect(name) {
  const [x, y, w, h] = SLOTS[name] || SLOTS.blank;
  const e = 1;
  return [(x + e) / S, 1 - (y + h - e) / S, (x + w - e) / S, 1 - (y + e) / S];
}

// remap a geometry's existing 0..1 uv into `slot`. PlaneGeometry/BoxGeometry
// both give every face a 0..1 uv, so a box shows the same art on all six sides
// — fine for a 20 mm sign blade, which is why panels are built as planes.
export function atlasUV(geo, slot) {
  const uv = geo.getAttribute('uv');
  if (!uv) return geo;
  const [u0, v0, u1, v1] = rect(slot);
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;
  return geo;
}

// point every uv at the white block: `map` becomes 1.0 and the pool's own
// vertex colours render exactly as they did before the pool gained a texture
export function blankUV(geo) {
  const uv = geo.getAttribute('uv');
  if (!uv) return geo;
  const [u0, v0, u1, v1] = rect('blank');
  const u = (u0 + u1) / 2, v = (v0 + v1) / 2;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v);
  uv.needsUpdate = true;
  return geo;
}
