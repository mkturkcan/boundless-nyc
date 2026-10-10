// TF32: Times Square's street pieces (owner 2026-09-29: "Add more details to Times Square and add daytime shots using
// proper references"). Placed by tsqPlaza.js (tf32Build) after the Wikimedia Commons references listed in
// docs/notes/tsq-graphics.md: the recruiting station on the 43rd St island with its neon flag (r07, r13), the Father
// Duffy and George M. Cohan statues in Duffy Square (r02-r05), the red ticket signs beside the steps (r04), a theatre
// marquee on 1515 Broadway's plaza frontage (r09), the subway canopy at 42nd St (r16, r22), red kiosks, food carts and
// solar compactor bins on the plaza (r10, r14). The cylindrical screen round 4 Times Square's corner is billboards.js
// (it is a TA31 screen). Every name here is invented or generic ("Subway Station", "Theatre Tickets", the Kestrel
// Theatre's "Lantern"); no seal, emblem or route letter is drawn.
//
// Geometry: primitives placed in a piece frame (x across, y up, +z the way the piece faces), merged per material, so
// all the pieces of a tile cost one draw per material. The signs come from one 2048 x 1024 canvas painted once (and
// again when the web fonts land): lit signs (neon, marquee, fascia) unlit and brighter after dark, printed faces lit.
import * as THREE from 'three';
import { ENV, applyLightTrim as LT, applyStoneDetail, applySkyMetal } from '../world/materials.js';
import { TQ32 } from '../world/tq32.js';   // TQ32: Father Duffy as a figure in patinated bronze and polished granite (?tq32=0)
import { loadAdFonts, tdraw, fit, rrect } from './adArt.js';

// ---------------------------------------------------------------- materials
let _M = null;
export function kitMats() {
  if (_M) return _M;
  const S = (o) => LT(new THREE.MeshStandardMaterial(o));
  // metalness stays moderate: the scene's reflections come from the sky-only IBL, and a 0.9 metal read near black in
  // the shade of the Square's towers (the campus bronze is 0.55 for the same reason)
  _M = {
    bronze: S({ color: 0x4a3f2f, roughness: 0.48, metalness: 0.5 }),         // the statues' dark bronze
    granite: S({ color: 0x8d8a84, roughness: 0.72, metalness: 0.02 }),       // pale grey pedestal granite
    graniteD: S({ color: 0x6b6862, roughness: 0.76, metalness: 0.02 }),      // the cross's darker stone
    steel: S({ color: 0xa3a9ae, roughness: 0.32, metalness: 0.6 }),          // stainless (the station, the carts)
    dark: S({ color: 0x18191b, roughness: 0.45, metalness: 0.5 }),           // black-painted steel
    glass: S({ color: 0x222a31, roughness: 0.06, metalness: 0.5 }),          // dark glass
    red: S({ color: 0xa81c17, roughness: 0.45, metalness: 0.15 }),           // the kiosks' and the ticket signs' red
    bin: S({ color: 0x2d3947, roughness: 0.5, metalness: 0.35 }),            // compactor bins
    soil: S({ color: 0x3a2c20, roughness: 1.0 }),
    flower: S({ color: 0xc23a57, roughness: 0.9, flatShading: true }),
    leaf: S({ color: 0x36592a, roughness: 0.95, flatShading: true }),
  };
  if (TQ32) {
    // TQ32 (see duffyMonumentTQ32): satin brown statuary bronze with its patina, polished speckled granite
    _M.bronzeTQ = applySkyMetal(LT(tq32Bronze(new THREE.MeshStandardMaterial({ color: 0x4e3a28, roughness: 0.42, metalness: 0.5 }))), { tint: [0.40, 0.29, 0.19], rough: 0.32, brush: 0.0, gain: 0.14 });   // a2: gain 0.42 read as polished brass
    _M.graniteP = applyStoneDetail(S({ color: 0x8a8781, roughness: 0.34, metalness: 0.02 }), 'cgranite', { amt: 0.75, nrm: 0.45, rgh: 0.35, scale: 0.45 });
    _M.graniteDP = applyStoneDetail(S({ color: 0x6d6a64, roughness: 0.40, metalness: 0.02 }), 'cgranite', { amt: 0.8, nrm: 0.5, rgh: 0.35, scale: 0.45 });
    _M.steelP = applySkyMetal(tq32Panels(S({ color: 0x9aa0a6, roughness: 0.32, metalness: 0.6 })), { tint: [0.50, 0.52, 0.55], rough: 0.22, brush: 0.55, gain: 0.16 });
  }
  return _M;
}

// ---------------------------------------------------------------- the sign atlas
const AW = 2048, AH = 1024;
// cells [x, y, w, h] in canvas pixels, each at its panel's aspect
export const CELLS = {
  flag: [0, 0, 1024, 256],        // the station's neon flag (a 12 m x 3 m face)
  kiosk: [1024, 0, 256, 256],     // the red kiosk's front
  screen: [1280, 0, 128, 256],    // a street kiosk's screen
  totem: [1408, 0, 128, 512],     // THEATRE TICKETS, vertical
  station: [1536, 0, 512, 128],   // the station's end faces: its name in steel
  bulbs: [1536, 128, 256, 96],    // the marquee's underside
  mqend: [1792, 128, 192, 136],   // the marquee's ends
  marquee: [0, 256, 1408, 136],   // the Kestrel Theatre's marquee front (16 m x 1.5 m)
  subway: [0, 392, 512, 150],     // the canopy's front fascia (3.1 m x 0.9 m)
  subwayS: [512, 392, 704, 150],  // its side fascia (4.6 m x 0.9 m)
  cart: [768, 560, 256, 96],      // the cart's menu board
  umbrella: [768, 664, 256, 128],
  poster0: [0, 560, 256, 384],    // the poster cubes' three invented shows (r10: black cubes of show posters on the plaza)
  poster1: [256, 560, 256, 384],
  poster2: [512, 560, 256, 384],
};
// the shows on the poster cubes: title, its face, the colours, a line
const SHOWS = [
  { t: 'Lantern', f: ['Limelight', 400, 'normal', 0.02], bg: ['#5a0508', '#12020a'], ink: '#f4c96a', line: 'THE NEW MUSICAL' },
  { t: 'Harbor Lights', f: ['Playfair Display', 900, 'italic', 0], bg: ['#0c3a6b', '#04111f'], ink: '#f2f5ff', line: 'A LOVE STORY IN SONG' },
  { t: 'The Clockmaker', f: ['Abril Fatface', 400, 'normal', 0.01], bg: ['#1f4a2c', '#07140b'], ink: '#e9c77a', line: 'NOW PLAYING' },
];
let _tex = null, _sign = null, _print = null;
function paintAtlas(c) {
  c.fillStyle = '#101214'; c.fillRect(0, 0, AW, AH);
  c.textBaseline = 'middle';
  // -- the neon flag (r07): dark glass behind a stainless grid of four panels, thirteen rows of tube, red and warm
  //    white, the canton a quarter of the width over the top seven rows, white points in it
  {
    const [x, y, w, h] = CELLS.flag;
    const g = c.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#1c2127'); g.addColorStop(0.45, '#0c0f13'); g.addColorStop(1, '#171b20');
    c.fillStyle = g; c.fillRect(x, y, w, h);
    const x0 = x + w * 0.02, x1 = x + w * 0.98, top = y + h * 0.05, bot = y + h * 0.95, rows = 13, rh = (bot - top) / rows;
    const cw = (x1 - x0) * 0.25, ch = rh * 7;
    c.fillStyle = '#0a1438'; c.fillRect(x0, top, cw, ch);
    c.fillStyle = '#ffffff'; c.shadowColor = '#ffffff'; c.shadowBlur = 6;
    for (let r = 0; r < 5; r++) for (let k = 0; k < 7; k++) {
      const sx = x0 + cw * (0.08 + k * 0.14), sy = top + ch * (0.12 + r * 0.19);
      c.beginPath();
      for (let p = 0; p < 10; p++) { const a = -Math.PI / 2 + (p * Math.PI) / 5, rr = p % 2 ? 2.6 : 6.2; c.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); }
      c.closePath(); c.fill();
    }
    for (let r = 0; r < rows; r++) {
      // a red tube stays red to its core (a pale core read pink once the mips mixed it with the white tube beside it)
      const red = r % 2 === 0, cy = top + (r + 0.5) * rh, xa = r < 7 ? x0 + cw + 6 : x0 + 4;
      c.shadowColor = red ? '#e01206' : '#f3e6c8'; c.shadowBlur = 8;
      c.fillStyle = red ? '#f0200f' : '#fff1d6';
      rrect(c, xa, cy - rh * 0.1, x1 - 4 - xa, rh * 0.2, rh * 0.1); c.fill();
      c.shadowBlur = 0; c.fillStyle = red ? '#ff5a3c' : '#ffffff';       // the hot core of the tube
      c.fillRect(xa + 3, cy - 1, x1 - 10 - xa, 2);
    }
    c.shadowBlur = 0;
    c.fillStyle = '#8b9197';                                              // the stainless mullions and frame
    for (const f of [0.25, 0.5, 0.75]) c.fillRect(x0 + (x1 - x0) * f - 3, y, 6, h);
    c.fillRect(x, y, w, 7); c.fillRect(x, y + h - 7, w, 7); c.fillRect(x, y, 7, h); c.fillRect(x + w - 7, y, 7, h);
  }
  // -- the station's end faces: brushed steel, its name, four plain rings where the real one has the service seals
  {
    const [x, y, w, h] = CELLS.station;
    const g = c.createLinearGradient(x, y, x, y + h); g.addColorStop(0, '#b3b8bd'); g.addColorStop(1, '#858a90');
    c.fillStyle = g; c.fillRect(x, y, w, h);
    c.fillStyle = '#2a2d31';
    const z = fit(c, 'RECRUITING STATION', ['Montserrat', 800, 'normal', 0.08], h * 0.3, w * 0.9); tdraw(c, 'RECRUITING STATION', x + w / 2, y + h * 0.27, z, 0.08, 'c');
    c.strokeStyle = '#2a2d31'; c.lineWidth = 3;
    for (let k = 0; k < 4; k++) { const cx = x + w * (0.2 + k * 0.2), cy = y + h * 0.68; c.beginPath(); c.arc(cx, cy, h * 0.2, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(cx, cy, h * 0.12, 0, Math.PI * 2); c.stroke(); }
  }
  // -- the red kiosk (r10): coffee and sweets, a darker band with the name, white line drawings of cups on the red
  {
    const [x, y, w, h] = CELLS.kiosk;
    c.fillStyle = '#b3241c'; c.fillRect(x, y, w, h);
    c.fillStyle = '#8c150f'; c.fillRect(x, y, w, h * 0.2);
    c.fillStyle = '#ffffff';
    let z = fit(c, 'COFFEE & SWEETS', ['Oswald', 600, 'normal', 0.06], h * 0.13, w * 0.86); tdraw(c, 'COFFEE & SWEETS', x + w / 2, y + h * 0.1, z, 0.06, 'c');
    c.strokeStyle = 'rgba(255,240,230,0.55)'; c.lineWidth = 2;
    for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) {       // cups: a tapered body, a lid, a steam curl
      const cx = x + w * (0.14 + k * 0.24), cy = y + h * (0.33 + r * 0.2);
      c.beginPath(); c.moveTo(cx - 9, cy - 8); c.lineTo(cx - 6, cy + 10); c.lineTo(cx + 6, cy + 10); c.lineTo(cx + 9, cy - 8); c.closePath(); c.stroke();
      c.beginPath(); c.moveTo(cx - 11, cy - 11); c.lineTo(cx + 11, cy - 11); c.stroke();
      c.beginPath(); c.moveTo(cx, cy - 15); c.quadraticCurveTo(cx + 5, cy - 20, cx, cy - 25); c.stroke();
    }
    c.fillStyle = '#ffffff'; rrect(c, x + w * 0.16, y + h * 0.8, w * 0.68, h * 0.13, 8); c.fill();
    c.fillStyle = '#b3241c';
    z = fit(c, 'COFFEE & TEA', ['Montserrat', 800, 'normal', 0.1], h * 0.08, w * 0.6); tdraw(c, 'COFFEE & TEA', x + w / 2, y + h * 0.865, z, 0.1, 'c');
  }
  // -- a street kiosk's screen: public-service pages, generic
  {
    const [x, y, w, h] = CELLS.screen;
    const g = c.createLinearGradient(x, y, x, y + h); g.addColorStop(0, '#0f4c8a'); g.addColorStop(1, '#0a2447');
    c.fillStyle = g; c.fillRect(x, y, w, h);
    c.fillStyle = '#ffffff';
    let z = fit(c, 'FREE', ['Montserrat', 900, 'normal', 0.04], h * 0.12, w * 0.8); tdraw(c, 'FREE', x + w / 2, y + h * 0.3, z, 0.04, 'c');
    z = fit(c, 'WI-FI', ['Montserrat', 900, 'normal', 0.04], h * 0.12, w * 0.8); tdraw(c, 'WI-FI', x + w / 2, y + h * 0.43, z, 0.04, 'c');
    z = fit(c, 'MAPS  CALLS', ['Montserrat', 700, 'normal', 0.08], h * 0.05, w * 0.84); tdraw(c, 'MAPS  CALLS', x + w / 2, y + h * 0.58, z, 0.08, 'c');
    c.fillStyle = '#f2b21c'; c.fillRect(x + w * 0.2, y + h * 0.7, w * 0.6, 3);
  }
  // -- the red ticket signs beside the steps: THEATRE TICKETS reading top to bottom, a white star over it
  {
    const [x, y, w, h] = CELLS.totem;
    c.fillStyle = '#c1121c'; c.fillRect(x, y, w, h);
    c.fillStyle = '#ffffff';
    c.beginPath();
    for (let p = 0; p < 10; p++) { const a = -Math.PI / 2 + (p * Math.PI) / 5, rr = p % 2 ? w * 0.13 : w * 0.3; c.lineTo(x + w / 2 + Math.cos(a) * rr, y + w * 0.45 + Math.sin(a) * rr); }
    c.closePath(); c.fill();
    c.save(); c.translate(x + w / 2, y + h * 0.56); c.rotate(Math.PI / 2);
    const z = fit(c, 'THEATRE TICKETS', ['Montserrat', 800, 'normal', 0.12], w * 0.46, h * 0.76); tdraw(c, 'THEATRE TICKETS', 0, 0, z, 0.12, 'c');
    c.restore();
  }
  // -- the marquee: a red field, gold display type, bulbs round the edge; the show is invented
  {
    const [x, y, w, h] = CELLS.marquee;
    c.fillStyle = '#7a0d10'; c.fillRect(x, y, w, h);
    c.fillStyle = '#1a0405'; c.fillRect(x + 12, y + 12, w - 24, h - 24);
    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#fff2c0'); g.addColorStop(0.55, '#e0a83c'); g.addColorStop(1, '#f7d588');
    c.fillStyle = g;
    let z = fit(c, 'Lantern', ['Limelight', 400, 'normal', 0.02], h * 0.62, w * 0.4); tdraw(c, 'Lantern', x + w * 0.3, y + h * 0.53, z, 0.02, 'c');
    c.fillStyle = '#f5dca0';
    z = fit(c, 'THE NEW MUSICAL', ['Montserrat', 700, 'normal', 0.3], h * 0.17, w * 0.34); tdraw(c, 'THE NEW MUSICAL', x + w * 0.74, y + h * 0.36, z, 0.3, 'c');
    z = fit(c, 'KESTREL THEATRE', ['Limelight', 400, 'normal', 0.12], h * 0.24, w * 0.36); tdraw(c, 'KESTREL THEATRE', x + w * 0.74, y + h * 0.66, z, 0.12, 'c');
    c.fillStyle = '#fff4d0';
    for (let k = 0; k < 88; k++) { const bx = x + 8 + (k * (w - 16)) / 87; c.beginPath(); c.arc(bx, y + 6, 3.2, 0, Math.PI * 2); c.arc(bx, y + h - 6, 3.2, 0, Math.PI * 2); c.fill(); }
  }
  {
    const [x, y, w, h] = CELLS.mqend;
    c.fillStyle = '#7a0d10'; c.fillRect(x, y, w, h);
    c.fillStyle = '#1a0405'; c.fillRect(x + 10, y + 10, w - 20, h - 20);
    c.fillStyle = '#f0c568';
    const z = fit(c, 'Lantern', ['Limelight', 400, 'normal', 0.02], h * 0.42, w * 0.8); tdraw(c, 'Lantern', x + w / 2, y + h * 0.52, z, 0.02, 'c');
    c.fillStyle = '#fff4d0';
    for (let k = 0; k < 12; k++) { const bx = x + 6 + (k * (w - 12)) / 11; c.beginPath(); c.arc(bx, y + 5, 3, 0, Math.PI * 2); c.arc(bx, y + h - 5, 3, 0, Math.PI * 2); c.fill(); }
  }
  {
    const [x, y, w, h] = CELLS.bulbs;
    c.fillStyle = '#2a2014'; c.fillRect(x, y, w, h);
    c.fillStyle = '#fff1c4';
    for (let r = 0; r < 4; r++) for (let k = 0; k < 24; k++) { c.beginPath(); c.arc(x + 6 + (k * (w - 12)) / 23, y + 12 + (r * (h - 24)) / 3, 3.2, 0, Math.PI * 2); c.fill(); }
  }
  // -- the subway canopy's fascia (r22): black, a lit strip along the top edge, the station in white bold sans on two
  //    lines, plain coloured discs (no route letters)
  const fascia = (cell) => {
    const [x, y, w, h] = CELLS[cell];
    c.fillStyle = '#0b0c0e'; c.fillRect(x, y, w, h);
    c.fillStyle = '#f4f1e8'; c.fillRect(x, y + 4, w, 4);
    c.fillStyle = '#ffffff';
    const tw = w * 0.6;
    let z = fit(c, 'Times Sq-42 St', ['Montserrat', 700, 'normal', 0], h * 0.3, tw); tdraw(c, 'Times Sq-42 St', x + w * 0.05, y + h * 0.36, z, 0, 'l');
    z = fit(c, 'Subway Station', ['Montserrat', 700, 'normal', 0], h * 0.3, tw); tdraw(c, 'Subway Station', x + w * 0.05, y + h * 0.7, z, 0, 'l');
    const cols = ['#f2b21c', '#f2b21c', '#e8322a', '#e8322a', '#8a8d91', '#a63c9c'];
    const dr = Math.min(h * 0.075, (w * 0.3) / 13);
    cols.forEach((col, k) => { c.fillStyle = col; c.beginPath(); c.arc(x + w * 0.69 + dr + k * dr * 2.3, y + h * 0.6, dr, 0, Math.PI * 2); c.fill(); });
  };
  fascia('subway'); fascia('subwayS');
  // -- the show posters: a dark gradient, a glow behind the title, the title in its own face, the line, five stars
  SHOWS.forEach((S, i) => {
    const [x, y, w, h] = CELLS['poster' + i];
    const g = c.createLinearGradient(x, y, x, y + h); g.addColorStop(0, S.bg[0]); g.addColorStop(1, S.bg[1]);
    c.fillStyle = g; c.fillRect(x, y, w, h);
    const rg = c.createRadialGradient(x + w / 2, y + h * 0.42, 4, x + w / 2, y + h * 0.42, w * 0.6);
    rg.addColorStop(0, 'rgba(255,230,180,0.35)'); rg.addColorStop(1, 'rgba(255,230,180,0)');
    c.fillStyle = rg; c.fillRect(x, y, w, h);
    c.fillStyle = S.ink;
    const words = S.t.split(' ');
    words.forEach((wd, k) => { const z = fit(c, wd, S.f, h * 0.15, w * 0.86); tdraw(c, wd, x + w / 2, y + h * (0.36 + (k - (words.length - 1) / 2) * 0.15), z, S.f[3], 'c'); });
    c.fillStyle = '#ffffff';
    let z = fit(c, S.line, ['Montserrat', 700, 'normal', 0.16], h * 0.035, w * 0.8); tdraw(c, S.line, x + w / 2, y + h * 0.62, z, 0.16, 'c');
    c.fillStyle = S.ink;
    for (let k = 0; k < 5; k++) {
      const sx = x + w / 2 + (k - 2) * w * 0.1, sy = y + h * 0.72;
      c.beginPath();
      for (let p = 0; p < 10; p++) { const a = -Math.PI / 2 + (p * Math.PI) / 5, rr = p % 2 ? w * 0.016 : w * 0.038; c.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); }
      c.closePath(); c.fill();
    }
    c.fillStyle = 'rgba(255,255,255,0.85)';
    z = fit(c, 'KESTREL THEATRE  47 ST', ['Oswald', 600, 'normal', 0.1], h * 0.03, w * 0.8); tdraw(c, 'KESTREL THEATRE  47 ST', x + w / 2, y + h * 0.9, z, 0.1, 'c');
  });
  // -- a cart umbrella's stripes and its menu board
  {
    const [x, y, w, h] = CELLS.umbrella;
    for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? '#f2c230' : '#1f5fb4'; c.fillRect(x + (k * w) / 8, y, w / 8, h); }
    const [x2, y2, w2, h2] = CELLS.cart;
    c.fillStyle = '#f5f1e6'; c.fillRect(x2, y2, w2, h2);
    c.fillStyle = '#b3201c';
    let z = fit(c, 'HOT DOGS', ['Bungee', 400, 'normal', 0.02], h2 * 0.36, w2 * 0.9); tdraw(c, 'HOT DOGS', x2 + w2 / 2, y2 + h2 * 0.32, z, 0.02, 'c');
    c.fillStyle = '#1f3f8f'; z = fit(c, 'PRETZELS  SODA  WATER', ['Montserrat', 700, 'normal', 0.06], h2 * 0.2, w2 * 0.9); tdraw(c, 'PRETZELS  SODA  WATER', x2 + w2 / 2, y2 + h2 * 0.72, z, 0.06, 'c');
  }
}
function atlas() {
  if (_tex) return _tex;
  const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
  paintAtlas(cv.getContext('2d'));
  _tex = new THREE.CanvasTexture(cv);
  _tex.colorSpace = THREE.SRGBColorSpace; _tex.anisotropy = 8;
  loadAdFonts().then(() => { paintAtlas(cv.getContext('2d')); _tex.needsUpdate = true; });
  return _tex;
}
// lit signs (neon, marquee, fascias): unlit, 0.95x by day and 1.6x after dark (the TA31 boards' curve, a notch lower:
// these are small and close to the camera), and at night the brightest channel eased above 1.0 with the hue kept (the
// TA31 boards' KN31 knee: over the night bloom threshold of 0.85 a saturated red tube bloomed to a pink-white blur);
// printed faces are lit by the scene
export function signMat() {
  if (_sign) return _sign;
  _sign = new THREE.MeshBasicMaterial({ map: atlas(), side: THREE.DoubleSide });
  _sign.onBeforeCompile = (sh) => {
    sh.uniforms.kNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float kNight;')
      .replace('#include <fog_fragment>', `gl_FragColor.rgb *= mix(0.95, 1.6, kNight);
        { float kmx = max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b)), kex = max(kmx - 1.0, 0.0);
          gl_FragColor.rgb *= mix(1.0, min(1.0, (1.0 + kex / (1.0 + kex * 1.5)) / max(kmx, 1e-4)), kNight); }
        #include <fog_fragment>`);
  };
  _sign.customProgramCacheKey = () => 'tf32sign';
  return _sign;
}
export function printMat() {
  if (_print) return _print;
  _print = LT(new THREE.MeshStandardMaterial({ map: atlas(), roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide }));
  return _print;
}

// ---------------------------------------------------------------- geometry helpers
const _B = new THREE.BoxGeometry(1, 1, 1);
function mtx(x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
}
// a box w x h x d standing on y (its base), a cylinder from y up, a sphere centred at y
const box = (w, h, d, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => [_B, mtx(x, y + h / 2, z, w, h, d, ry, rx, rz)];
const cyl = (r0, r1, h, x = 0, y = 0, z = 0, n = 14, rx = 0, rz = 0) => [new THREE.CylinderGeometry(r0, r1, h, n), mtx(x, y + h / 2, z, 1, 1, 1, 0, rx, rz)];
const sph = (r, x, y, z, sx = 1, sy = 1, sz = 1) => [new THREE.SphereGeometry(r, 14, 10), mtx(x, y, z, sx, sy, sz)];
function cellUv(g, cell) {
  const [cx, cy, cw, ch] = CELLS[cell], uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i) * cw) / AW, 1 - (cy + (1 - uv.getY(i)) * ch) / AH);
  return g;
}
// a quad showing an atlas cell, centred at (x, y, z), facing +z turned by ry
const panel = (cell, w, h, x, y, z, ry = 0) => [cellUv(new THREE.PlaneGeometry(w, h), cell), mtx(x, y, z, 1, 1, 1, ry)];
// merge [geometry, matrix] parts (position, normal, uv), the whole placed by `place` (a Matrix4, or none)
function merge(parts, place) {
  const pos = [], nor = [], uvs = [];
  for (const [g0, m] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0.clone();
    g.applyMatrix4(place ? place.clone().multiply(m) : m);
    const p = g.getAttribute('position'), u = g.getAttribute('uv');
    pos.push(...p.array);
    nor.push(...g.getAttribute('normal').array);
    if (u) uvs.push(...u.array); else for (let i = 0; i < p.count; i++) uvs.push(0, 0);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.computeBoundingSphere();
  return out;
}
const I4 = new THREE.Matrix4();
// the piece frame in the world: origin (x, y, z), its +z along (fx, fz), its +x along (fz, -fx)
export function frameAt(x, y, z, fx, fz) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(fx, fz)), new THREE.Vector3(1, 1, 1));
}

// ---------------------------------------------------------------- the pieces: each returns { material: [parts] }
// a standing figure in bronze, `k` = 1 for 2.5 m, facing +z: shoes, trouser legs, a long coat (skirt and chest),
// shoulders, head, arms; Duffy holds a book at his chest (r03), Cohan a cane and his hat (r02)
function figure(k = 1, cohan = false) {
  const P = [], s = (v) => v * k;
  P.push(box(s(0.16), s(0.09), s(0.3), s(-0.13), 0, s(0.04)), box(s(0.16), s(0.09), s(0.3), s(0.13), 0, s(0.04)));
  P.push(cyl(s(0.09), s(0.1), s(0.62), s(-0.12), s(0.08)), cyl(s(0.09), s(0.1), s(0.62), s(0.12), s(0.08)));
  P.push(cyl(s(0.25), cohan ? s(0.29) : s(0.36), cohan ? s(0.5) : s(0.78), 0, cohan ? s(0.9) : s(0.62)));
  P.push(cyl(s(0.24), s(0.25), s(0.52), 0, s(1.38)));
  P.push(box(s(0.62), s(0.2), s(0.34), 0, s(1.78)));
  P.push(cyl(s(0.07), s(0.08), s(0.12), 0, s(1.96)));
  P.push(sph(s(0.13), 0, s(2.18), s(0.01), 1, 1.12, 1));
  P.push(cyl(s(0.065), s(0.075), s(0.72), s(-0.36), s(1.18), 0, 10, 0, 0.08), cyl(s(0.065), s(0.075), s(0.72), s(0.36), s(1.18), 0, 10, 0, -0.08));
  if (cohan) {
    P.push(cyl(s(0.1), s(0.1), s(0.8), s(-0.12), s(0.2)), cyl(s(0.1), s(0.1), s(0.8), s(0.12), s(0.2)));   // trousers to the coat
    P.push(cyl(s(0.02), s(0.02), s(1.05), s(0.47), 0, s(0.12), 8));                                        // the cane
    P.push(cyl(s(0.11), s(0.14), s(0.07), s(-0.44), s(1.1), s(0.06)), cyl(s(0.08), s(0.09), s(0.1), s(-0.44), s(1.17), s(0.06)));   // the hat in his hand
  } else P.push(box(s(0.2), s(0.26), s(0.06), s(0.2), s(1.3), s(0.24), 0, -0.4));
  return P;
}
// TQ32 (owner 2026-09-29: "the materials need to be PBR and more detailed with weathering"): the recruiting station's
// stainless skin (r07, r13): 1.22 m x 1.53 m brushed panels with dark seams, each panel a
// slightly different tone, the foot grimed from the plaza, a brushed sky reflection (applySkyMetal) over it. TQP carries
// the station's ground height, set when it is built. The TF32 station was one flat grey box.
const TQP = { value: 0 };
function tq32Panels(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.tqP0 = TQP;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTqPW; varying vec3 vTqPN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vTqPW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTqPN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float tqP0; varying vec3 vTqPW; varying vec3 vTqPN; float tqSeam = 0.0;
        float tqPH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 n = normalize(vTqPN);
          float wallF = 1.0 - smoothstep(0.5, 0.8, abs(n.y));
          vec2 t2 = normalize(vec2(-n.z, n.x) + vec2(1e-5, 0.0));
          float yl = vTqPW.y - tqP0;
          vec2 q = vec2(dot(vTqPW.xz, t2) / 1.22, (yl - 0.02) / 1.53);
          vec2 fq = fract(q), aq = max(fwidth(q), vec2(1e-4));
          float seam = max(1.0 - smoothstep(0.0, aq.x * 1.5 + 0.005, min(fq.x, 1.0 - fq.x)),
                           1.0 - smoothstep(0.0, aq.y * 1.5 + 0.004, min(fq.y, 1.0 - fq.y)));
          seam *= wallF * smoothstep(0.09, 0.03, max(aq.x, aq.y));
          tqSeam = seam;
          float pt = tqPH(floor(q)) - 0.5;
          float grime = smoothstep(0.75, 0.0, yl) * wallF;
          diffuseColor.rgb *= (1.0 + pt * 0.10) * (1.0 - seam * 0.6) * (1.0 - grime * 0.45);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.62, tqSeam);`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key ? key() : '') + '|tq32panels';
  mat.needsUpdate = true;
  return mat;
}
// ---------------------------------------------------------------- TQ32: Father Duffy as a figure, in bronze and granite
// Owner 2026-09-29 on teaser 3 ("building primitives need a lot more detail, the materials need to be PBR and more
// detailed with weathering"): t3DayDuffy is an arc round this statue at 13 m, where the TF32 figure (boxes and plain
// cylinders, ~2.3 m tall, 280 px high in the 2560 x 1440 frame) read as grey blocks. After r03 / r04 (Commons): a bareheaded
// figure in a belted, knee-length trench coat flaring to the hem, puttees and boots, both hands holding a book at the
// waist, a helmet at his feet on an uneven bronze ground; dark brown bronze with a satin sheen and green-brown patina where
// rain sits; the pedestal and the Celtic cross in speckled grey granite, polished. `?tq32=0` keeps the TF32 pieces.
// patinated statuary bronze: a satin brown metal, verdigris crust on the up-facing folds and in blotches, worn lighter on
// the raised grain; the crust is rough and near-dielectric
function tq32Bronze(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTqBW; varying vec3 vTqBN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vTqBW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTqBN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTqBW; varying vec3 vTqBN;
        float tqPat = 0.0;
        float tqH3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float tqN3(vec3 x) {
          vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(tqH3(i), tqH3(i + vec3(1, 0, 0)), f.x), mix(tqH3(i + vec3(0, 1, 0)), tqH3(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(tqH3(i + vec3(0, 0, 1)), tqH3(i + vec3(1, 0, 1)), f.x), mix(tqH3(i + vec3(0, 1, 1)), tqH3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 wn = normalize(vTqBN);
          float n1 = tqN3(vTqBW * 7.0), n2 = tqN3(vTqBW * 23.0 + 3.1);
          float up = clamp(wn.y, 0.0, 1.0);
          float fw = length(fwidth(vTqBW));
          float nv = smoothstep(0.06, 0.012, fw);              // the fine grain only while it is over a few pixels
          tqPat = smoothstep(0.58, 0.9, n1 * 0.75 + mix(0.5, n2, nv) * 0.25) * (0.15 + 0.65 * up * up);
          // run-off: the crust also streaks down the verticals under the ledges
          tqPat = max(tqPat, smoothstep(0.62, 0.9, tqN3(vec3(vTqBW.x * 14.0, vTqBW.y * 1.6, vTqBW.z * 14.0))) * (1.0 - abs(wn.y)) * 0.55);
          diffuseColor.rgb *= 0.86 + 0.28 * mix(0.5, n2, nv);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.105, 0.150, 0.118), tqPat * 0.45);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.78, tqPat);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.12, tqPat);`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key ? key() : '') + '|tq32bronze';
  mat.needsUpdate = true;
  return mat;
}
// a capsule of radius r from a to b (world-free piece frame)
function capAB(r, a, b, seg = 12) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = new THREE.Vector3().subVectors(B, A), L = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return [new THREE.CapsuleGeometry(r, Math.max(L, 1e-3), 4, seg), new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1))];
}
// the figure at 1:1 x k, facing +z, standing on its bronze ground (0 .. 0.12): 2.13 m to the crown of the head
function duffyFigure(k = 1) {
  const P = [];
  // the sculpted ground, uneven: a ten-sided slab, a low mound under the feet
  P.push([new THREE.CylinderGeometry(0.52, 0.57, 0.12, 10), mtx(0, 0.06, 0.02, 1, 1, 0.82)]);
  P.push([new THREE.SphereGeometry(0.34, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mtx(-0.05, 0.1, 0.05, 1.1, 0.16, 0.9)]);
  // boots and puttee-wrapped shins
  for (const s of [-1, 1]) {
    P.push(capAB(0.068, [s * 0.12, 0.19, -0.05], [s * 0.125, 0.18, 0.13], 10));
    P.push([new THREE.CylinderGeometry(0.084, 0.072, 0.5, 12), mtx(s * 0.12, 0.44, 0.0)]);
    for (let b = 0; b < 4; b++) P.push([new THREE.TorusGeometry(0.078 + b * 0.002, 0.008, 4, 14), mtx(s * 0.12, 0.28 + b * 0.09, 0.0, 1, 1, 1, 0, Math.PI / 2 + 0.18 * s, 0)]);
  }
  // the trench coat: hem flared at 0.60 m, belted at 1.10-1.18, chest, sloping shoulders, collar; an elliptical section
  const coat = [[0.001, 0.585], [0.385, 0.59], [0.40, 0.63], [0.36, 0.78], [0.31, 0.95], [0.262, 1.08], [0.276, 1.10], [0.278, 1.175],
    [0.262, 1.19], [0.279, 1.34], [0.296, 1.49], [0.302, 1.585], [0.278, 1.665], [0.212, 1.725], [0.128, 1.765], [0.094, 1.80],
    [0.084, 1.845], [0.001, 1.85]].map(([r, y]) => new THREE.Vector2(r, y));
  P.push([new THREE.LatheGeometry(coat, 30), mtx(0, 0, 0, 1, 1, 0.64)]);
  P.push(box(0.075, 0.07, 0.03, 0, 1.105, 0.172));                                   // the belt buckle
  // arms: shoulder -> elbow -> the hands together at the book, sleeves slightly bent out
  for (const s of [-1, 1]) {
    P.push(capAB(0.08, [s * 0.278, 1.6, 0.0], [s * 0.305, 1.30, 0.05]));
    P.push(capAB(0.07, [s * 0.305, 1.30, 0.05], [s * 0.10, 1.17, 0.205]));
    P.push([new THREE.SphereGeometry(0.052, 12, 8), mtx(s * 0.078, 1.16, 0.228, 1, 0.82, 1.25)]);   // the hand
  }
  P.push(box(0.17, 0.23, 0.048, 0, 1.05, 0.245, 0, -0.22));                          // the book, held at the waist
  // neck and bare head: skull, jaw, nose, ears
  P.push([new THREE.CylinderGeometry(0.054, 0.06, 0.12, 12), mtx(0, 1.885, 0.0)]);
  P.push([new THREE.SphereGeometry(0.118, 18, 14), mtx(0, 2.0, -0.005, 0.9, 1.1, 1.0)]);
  P.push([new THREE.SphereGeometry(0.086, 14, 10), mtx(0, 1.93, 0.035, 0.95, 0.85, 1.0)]);
  P.push([new THREE.CylinderGeometry(0.0, 0.021, 0.055, 6), mtx(0, 1.975, 0.118, 1, 1, 1, 0, Math.PI / 2, 0)]);
  for (const s of [-1, 1]) P.push([new THREE.SphereGeometry(0.03, 8, 6), mtx(s * 0.106, 1.99, 0.0, 0.45, 1.0, 0.75)]);
  // the helmet at his feet
  P.push([new THREE.SphereGeometry(0.13, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), mtx(0.33, 0.115, -0.03, 1, 0.62, 1)]);
  P.push([new THREE.CylinderGeometry(0.18, 0.18, 0.014, 16), mtx(0.33, 0.12, -0.03)]);
  return P.map(([g, m]) => [g, new THREE.Matrix4().makeScale(k, k, k).multiply(m)]);
}
function duffyMonumentTQ32() {
  // the Celtic cross (r03, r04): the shaft about as wide as the block, arms at 4.35 m, the ring behind the arms with its
  // four bosses in the angles, a plinth under the shaft; chamfered with thin edge boxes so the arrises catch the light
  const cross = [box(1.15, 6.3, 0.5, 0, 0, -1.0), box(2.5, 0.85, 0.5, 0, 4.35, -1.0), box(1.35, 0.35, 0.62, 0, 0, -1.0)];
  cross.push([new THREE.TorusGeometry(1.0, 0.17, 10, 40), mtx(0, 4.78, -1.0, 1, 1, 1.25)]);
  for (const [bx, by] of [[-0.71, 4.07], [0.71, 4.07], [-0.71, 5.49], [0.71, 5.49]]) cross.push([new THREE.SphereGeometry(0.13, 14, 10), mtx(bx, by, -0.72, 1, 1, 0.55)]);
  const ped = [box(2.6, 0.3, 2.9, 0, 0, -0.35), box(2.0, 0.25, 2.3, 0, 0.3, -0.35), box(1.45, 1.85, 1.45, 0, 0.55), box(1.6, 0.2, 1.6, 0, 2.4),
    box(1.52, 0.08, 1.52, 0, 0.55)];
  const fig = duffyFigure(1.04).map(([g, m]) => [g, mtx(0, 2.6, 0.05).multiply(m)]);
  return { graniteDP: cross, graniteP: ped, bronzeTQ: fig };
}
export function duffyMonument() {
  if (TQ32) return duffyMonumentTQ32();
  // r04 (front, 2011): a stepped granite plinth 2.6 m wide, a 1.45 m block to 2.6 m with the figure on it in a belted
  // greatcoat, and right behind him the Celtic cross, its shaft about as wide as the block, the arms and the ring round
  // his head, its top 0.5-1 m over it (6.3 m)
  const cross = [box(1.15, 6.3, 0.5, 0, 0, -1.0), box(2.5, 0.85, 0.5, 0, 4.35, -1.0)];
  cross.push([new THREE.TorusGeometry(1.0, 0.16, 8, 28), mtx(0, 4.78, -1.0)]);
  for (const [bx, by] of [[-0.71, 4.07], [0.71, 4.07], [-0.71, 5.49], [0.71, 5.49]]) cross.push(sph(0.13, bx, by, -0.72, 1, 1, 0.6));   // the bosses
  const ped = [box(2.6, 0.3, 2.9, 0, 0, -0.35), box(2.0, 0.25, 2.3, 0, 0.3, -0.35), box(1.45, 1.85, 1.45, 0, 0.55), box(1.6, 0.2, 1.6, 0, 2.4)];
  const fig = figure(1.04).map(([g, m]) => [g, mtx(0, 2.6, 0.05).multiply(m)]);
  return { graniteD: cross, granite: ped, bronze: fig };
}
export function cohanMonument() {
  const ped = [box(1.9, 0.3, 1.9), box(1.4, 1.9, 1.4, 0, 0.3), box(1.6, 0.2, 1.6, 0, 2.2)];
  const fig = figure(1.0, true).map(([g, m]) => [g, mtx(0, 2.4, 0).multiply(m)]);
  // the low planters round it (r05)
  const pl = [], soil = [], fl = [];
  for (const [px, pz] of [[-2.3, 0], [2.3, 0], [0, -2.4]]) {
    pl.push(box(1.3, 0.55, 1.3, px, 0, pz));
    soil.push(box(1.18, 0.05, 1.18, px, 0.52, pz));
    for (let k = 0; k < 5; k++) fl.push([new THREE.IcosahedronGeometry(0.26, 0), mtx(px + (((k * 7) % 5) - 2) * 0.2, 0.7, pz + (((k * 3) % 5) - 2) * 0.2, 1, 0.7, 1)]);
  }
  return { granite: ped.concat(pl), bronze: fig, soil, flower: fl };
}
// the red ticket sign (r04: either end of the steps' foot, about 0.9 m x 3.2 m against the 2.5 m figure), both broad
// faces printed
export function ticketTotem() {
  return { red: [box(0.95, 3.2, 0.3)], sign: [panel('totem', 0.9, 3.05, 0, 1.6, 0.156), panel('totem', 0.9, 3.05, 0, 1.6, -0.156, Math.PI)] };
}
// the recruiting station on its own footprint (`ring` world [x, z], ground y), in world coordinates: stainless walls
// 4.6 m high, a roof slab, the neon flag on both long faces (the edges over 10 m) and the name over dark glass on the
// ends (r13: the flag faces Broadway and Seventh Avenue, the name the cross streets)
export function station(ring, y) {
  const n = ring.length, cx = ring.reduce((a, p) => a + p[0], 0) / n, cz = ring.reduce((a, p) => a + p[1], 0) / n;
  const steel = [], glass = [], sign = [];
  const H = 4.6;
  TQP.value = y;   // TQ32: the panels' ground line
  for (let i = 0; i < n; i++) {
    const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % n], L = Math.hypot(x2 - x1, z2 - z1);
    let nx = -(z2 - z1) / L, nz = (x2 - x1) / L;
    if (nx * ((x1 + x2) / 2 - cx) + nz * ((z1 + z2) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
    const F = frameAt((x1 + x2) / 2, y, (z1 + z2) / 2, nx, nz);   // +z outward, x along the wall
    steel.push([merge([box(L + 0.04, H, 0.2, 0, 0, -0.1)], F), I4]);
    if (L > 10) sign.push([merge([panel('flag', L - 0.7, H - 1.1, 0, 0.55 + (H - 1.1) / 2, 0.03)], F), I4]);
    else {
      glass.push([merge([box(L - 0.8, 2.7, 0.06, 0, 0.1, 0.01)], F), I4]);
      sign.push([merge([panel('station', L - 0.5, (L - 0.5) / 4, 0, 3.05 + (L - 0.5) / 8, 0.03)], F), I4]);
    }
  }
  const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(cx + (x - cx) * 1.05, -(cz + (z - cz) * 1.05))));
  const roof = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
  roof.rotateX(-Math.PI / 2); roof.translate(0, y + H, 0);
  steel.push([roof, I4]);
  return TQ32 ? { steelP: steel, glass, sign } : { steel, glass, sign };
}
// a theatre marquee: w x 1.6 m, its back on the wall, projecting d (+z out); front and ends lit, bulbs underneath
export function marquee(w = 16, d = 2.2) {
  const under = new THREE.PlaneGeometry(w - 0.3, d - 0.3).rotateX(Math.PI / 2);
  return {
    dark: [box(w, 1.6, d, 0, 0, d / 2)],
    sign: [panel('marquee', w - 0.1, 1.5, 0, 0.8, d + 0.012), panel('mqend', d - 0.1, 1.5, w / 2 + 0.012, 0.8, d / 2, Math.PI / 2),
      panel('mqend', d - 0.1, 1.5, -w / 2 - 0.012, 0.8, d / 2, -Math.PI / 2), [cellUv(under, 'bulbs'), mtx(0, -0.012, d / 2)]],
  };
}
// the subway entrance (r22): a black canopy on four posts over the stair, a deep fascia with the station's name round
// its front and sides, glass side screens and back, open at its +z end; W across, L along
export function subwayEntrance(W = 2.6, L = 4.6, H = 2.9) {
  const dark = [box(0.14, H, 0.14, -W / 2, 0, -L / 2), box(0.14, H, 0.14, W / 2, 0, -L / 2), box(0.14, H, 0.14, -W / 2, 0, L / 2), box(0.14, H, 0.14, W / 2, 0, L / 2),
    box(W + 0.5, 0.9, L + 0.5, 0, H, 0), box(W - 0.4, 0.03, L - 0.3, 0, 0.01, 0)];
  const glass = [box(0.04, H - 0.2, L, -W / 2, 0.1, 0), box(0.04, H - 0.2, L, W / 2, 0.1, 0), box(W, H - 0.2, 0.04, 0, 0.1, -L / 2)];
  const steel = [box(0.06, 1.0, L - 0.3, -W / 2 + 0.3, 0, 0), box(0.06, 1.0, L - 0.3, W / 2 - 0.3, 0, 0)];   // the stair's handrails
  const sign = [panel('subway', W + 0.46, 0.86, 0, H + 0.45, L / 2 + 0.26), panel('subwayS', L + 0.46, 0.86, W / 2 + 0.26, H + 0.45, 0, Math.PI / 2),
    panel('subwayS', L + 0.46, 0.86, -W / 2 - 0.26, H + 0.45, 0, -Math.PI / 2)];
  return { dark, glass, steel, sign };
}
// the red kiosk (r10): 2.6 x 1.8 m, 2.6 m to its roof, a service window and an awning on its front (+z), printed
export function redKiosk() {
  return {
    red: [box(2.6, 2.6, 1.8), box(2.9, 0.16, 2.1, 0, 2.6), box(2.3, 0.12, 1.5, 0, 2.76), box(1.5, 0.06, 0.7, 0.35, 2.05, 1.2, 0, 0.28)],
    dark: [box(1.3, 0.95, 0.04, 0.35, 1.05, 0.91)],
    print: [panel('kiosk', 0.95, 0.95, -0.72, 1.45, 0.905), panel('kiosk', 2.4, 2.4, 0, 1.3, -0.905, Math.PI)],
  };
}
// the food cart: a stainless box on two wheels with its menu board, a striped umbrella on a pole
export function foodCart() {
  const um = cellUv(new THREE.ConeGeometry(1.35, 0.5, 8, 1, true), 'umbrella');
  return {
    steel: [box(1.9, 0.95, 0.85, 0, 0.35), box(0.06, 0.06, 0.9, -1.0, 1.05), cyl(0.025, 0.025, 1.4, 0.55, 1.3, 0, 6), box(1.7, 0.3, 0.6, 0, 1.3)],
    dark: [cyl(0.2, 0.2, 0.08, -0.6, 0.2, 0.45, 12, Math.PI / 2), cyl(0.2, 0.2, 0.08, -0.6, 0.2, -0.45, 12, Math.PI / 2), box(0.06, 0.35, 0.06, 0.8)],
    print: [panel('cart', 1.7, 0.55, 0, 0.9, 0.43), [um, mtx(0.55, 2.95, 0)]],
  };
}
// the poster cube (r10): a black box 1.3 m square and 2.0 m high on a plinth, a lit show poster on each face (`i` picks
// which show faces front; the others go round)
export function posterCube(i = 0) {
  const P = [];
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2, s = Math.sin(a), co = Math.cos(a);
    P.push([cellUv(new THREE.PlaneGeometry(1.14, 1.72), 'poster' + ((i + k) % 3)), mtx(s * 0.652, 1.1, co * 0.652, 1, 1, 1, a)]);
  }
  return { dark: [box(1.3, 0.1, 1.3), box(1.3, 1.95, 1.3, 0, 0.1), box(1.36, 0.06, 1.36, 0, 2.05)], sign: P };
}
// the solar compactor bin: 0.64 x 0.64 x 1.28 m with its panel on top
export function compactor() {
  return { bin: [box(0.64, 1.2, 0.64)], dark: [box(0.6, 0.06, 0.6, 0, 1.2, 0, 0, -0.2)], glass: [box(0.5, 0.02, 0.5, 0, 1.27, 0, 0, -0.2)] };
}
// the street kiosk: a 2.9 m pillar with a lit screen on each broad face
export function streetKiosk() {
  return { dark: [box(0.95, 2.85, 0.3), box(1.0, 0.08, 0.34, 0, 2.85)], sign: [panel('screen', 0.72, 1.44, 0, 1.55, 0.155), panel('screen', 0.72, 1.44, 0, 1.55, -0.155, Math.PI)] };
}
// build `pieces` ({ parts, place }) into one mesh per material, added to `group`; returns the mesh count
export function addPieces(group, pieces, name) {
  const M = kitMats(), bucket = {};
  for (const { parts, place } of pieces) for (const [k, P] of Object.entries(parts)) (bucket[k] = bucket[k] || []).push(merge(P, place));
  let n = 0;
  for (const [k, geos] of Object.entries(bucket)) {
    const mat = k === 'sign' ? signMat() : k === 'print' ? printMat() : M[k];
    if (!mat) continue;
    const mesh = new THREE.Mesh(merge(geos.map((g) => [g, I4])), mat);
    mesh.name = `${name}:${k}`;
    mesh.castShadow = k !== 'sign'; mesh.receiveShadow = true;
    group.add(mesh); n++;
  }
  return n;
}
