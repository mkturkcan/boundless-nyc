// AR32 part hptSign: the Pepsi-Cola sign, the two LONG ISLAND gantries and the park's benches (facts in
// hptSignData.js, sources in docs/notes/area-hptSign.md). The script letters are drawn here from scratch after the
// photographs (no logo artwork file): each stroke is a chain of cubic curves traced on the Commons photograph "Pepsi-Cola
// sign SWW.jpg" (its pixel frame, SX/SY metres a pixel), drawn with its width changing along it. The channel letters are
// one alpha-tested face (red enamel, the cream aluminium edge) with its depth as six layers behind it; the neon is the
// ring along the union's outline (drawn as a wide stroke less a narrower one), lit after dusk with a blurred halo.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ENV, applyLightTrim as LT } from '../world/materials.js';
import { SIGN, GANTRY, PIER, PIER_COAST } from './hptSignData.js';

// ---------------------------------------------------------------- the sign's art
// the photograph's frame: x 20 -> 955 px is the letters' 39 m, y 22 -> 310 px their 13.5 m (u right, v up from the swash)
const SX = 39 / 935, SY = 13.5 / 288;
const U0 = -0.6, V0 = -1.7, PXM = 60, AW = 3072, AH = 1024, VT = V0 + AH / PXM;   // the canvas: u -0.6..50.6, v -1.7..15.37
const toU = (x) => (x - 20) * SX, toV = (y) => (310 - y) * SY;
// strokes: [points (cubic chain p0 c c p1 c c p2 ...), widths at p0, p1, ... (photo px)]
const STROKES = [
  // the swash along the bottom, from the C's foot under "epsi" to the P's curl at the far left
  [[[612, 282], [470, 306], [260, 314], [112, 300], [60, 296], [22, 274], [34, 244], [44, 222], [82, 214], [98, 236], [104, 246], [96, 258], [86, 252]], [32, 26, 16, 9, 7]],
  // the P's stem into the swash
  [[[228, 108], [214, 170], [178, 246], [118, 298]], [34, 28]],
  // the P's bowl: a flattened loop over the top-left, its start curled
  [[[150, 98], [134, 64], [196, 34], [252, 36], [302, 38], [338, 58], [322, 86], [306, 110], [262, 120], [214, 112]], [16, 32, 26, 14]],
  [[[150, 98], [160, 110], [178, 104], [172, 92]], [16, 10]],
  // the C's spine
  [[[656, 44], [622, 92], [600, 182], [606, 266]], [30, 36]],
  // the C's bottom loop
  [[[606, 266], [612, 304], [764, 302], [816, 270], [846, 250], [832, 212], [782, 206], [722, 200], [652, 214], [626, 242]], [34, 26, 18, 12]],
  // the C's top and its curl at the right
  [[[656, 44], [700, 18], [772, 14], [796, 40], [808, 60], [782, 78], [766, 60]], [30, 18, 10]],
  // the C's flourish over "epsi", tapering to its hooked tip at the left, and its barb
  [[[652, 50], [600, 76], [480, 82], [402, 78], [376, 76], [360, 62], [356, 46]], [32, 20, 6]],
  [[[404, 80], [396, 90], [390, 96], [384, 100]], [12, 3]],
  // E: the upper bowl, the notch, the lower bowl
  [[[284, 158], [256, 138], [204, 150], [216, 180], [222, 196], [250, 196], [258, 196]], [10, 22, 12]],
  [[[258, 196], [200, 194], [184, 240], [232, 246], [262, 248], [282, 232], [286, 220]], [14, 24, 10]],
  // P: the stem, the bowl, the foot
  [[[334, 164], [328, 200], [318, 230], [302, 248]], [26, 22]],
  [[[318, 156], [346, 134], [398, 140], [392, 172], [386, 196], [352, 206], [326, 200]], [14, 26, 12]],
  [[[288, 250], [298, 248], [310, 248], [320, 248]], [12, 12]],
  // S
  [[[462, 142], [432, 124], [394, 140], [410, 170], [420, 190], [456, 196], [452, 222], [446, 252], [396, 252], [386, 230]], [12, 26, 26, 12]],
  // I: the stem, the head serif, the foot
  [[[506, 136], [500, 172], [490, 210], [478, 243]], [26, 22]],
  [[[484, 133], [498, 131], [516, 129], [532, 127]], [14, 12]],
  [[[464, 244], [474, 244], [486, 244], [496, 244]], [12, 12]],
  // the hyphen
  [[[546, 166], [549, 176], [552, 186], [555, 196]], [18, 16]],
  // O
  [[[712, 106], [668, 106], [668, 190], [712, 190], [756, 190], [756, 106], [712, 106]], [16, 26, 16]],
  // L: the stem, its head curl, the foot
  [[[796, 106], [792, 140], [782, 170], [770, 190]], [24, 22]],
  [[[796, 106], [810, 94], [834, 104], [820, 120]], [16, 10]],
  [[[770, 190], [758, 204], [792, 202], [832, 188]], [18, 10]],
  // A: the left leg with its foot curl, the right leg to its tail, the bar
  [[[852, 190], [870, 160], [894, 122], [906, 104]], [14, 22]],
  [[[852, 190], [838, 202], [832, 186], [842, 180]], [12, 8]],
  [[[906, 104], [912, 160], [926, 222], [952, 262]], [26, 8]],
  [[[866, 170], [882, 169], [898, 167], [916, 165]], [12, 12]],
];
const WK = 1.18;   // the traced widths read thin against the photograph's bold strokes (the overlay check)
const cub = (a, b, c, d, t) => { const s = 1 - t; return s * s * s * a + 3 * s * s * t * b + 3 * s * t * t * c + t * t * t * d; };
// every stroke as a polyline [[u, v, w (m)], ...]
function strokeLines() {
  const out = [];
  for (const [P, W] of STROKES) {
    const pts = [];
    const nseg = (P.length - 1) / 3;
    for (let s = 0; s < nseg; s++) {
      const [a, b, c, d] = [P[s * 3], P[s * 3 + 1], P[s * 3 + 2], P[s * 3 + 3]];
      const w0 = W[Math.min(s, W.length - 1)], w1 = W[Math.min(s + 1, W.length - 1)];
      for (let k = s === 0 ? 0 : 1; k <= 28; k++) {
        const t = k / 28;
        pts.push([toU(cub(a[0], b[0], c[0], d[0], t)), toV(cub(a[1], b[1], c[1], d[1], t)), (w0 + (w1 - w0) * t) * SX * WK]);
      }
    }
    out.push(pts);
  }
  return out;
}
// draw every stroke at (its width + extra) m on a canvas at `px` px a metre, colour `col`
function drawStrokes(g, lines, extra, col, px) {
  g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
  const X = (u) => (u - U0) * px, Y = (v) => (VT - v) * px;
  for (const L of lines) {
    for (let i = 1; i < L.length; i++) {
      g.lineWidth = Math.max(1, (L[i][2] + extra) * px);
      g.beginPath(); g.moveTo(X(L[i - 1][0]), Y(L[i - 1][1])); g.lineTo(X(L[i][0]), Y(L[i][1])); g.stroke();
    }
  }
}
// the bottle: 15.2 m tall, 4.2 m wide, leaning 8 degrees to the right (the photographs), its foot at v -0.1, u 45.9
const BOT = { u: 45.9, v: -0.1, H: 15.2, R: 2.1, lean: -0.14 };
const BPROF = [[0, 0.92], [0.03, 1], [0.34, 1], [0.44, 0.9], [0.54, 0.95], [0.62, 0.86], [0.72, 0.52], [0.82, 0.33], [0.92, 0.29], [0.94, 0.35], [0.965, 0.35], [0.975, 0.3], [1, 0.3]];
function bottlePath(g, px, grow = 0) {
  const X = (u) => (u - U0) * px, Y = (v) => (VT - v) * px, c = Math.cos(BOT.lean), s = Math.sin(BOT.lean);
  const P = (h, r) => { const lu = r * BOT.R + Math.sign(r) * grow, lv = h * BOT.H; return [X(BOT.u + lu * c + lv * -s), Y(BOT.v + lu * s + lv * c)]; };
  g.beginPath();
  BPROF.forEach(([h, r], i) => { const [x, y] = P(h, r); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
  for (let i = BPROF.length - 1; i >= 0; i--) { const [x, y] = P(BPROF[i][0], -BPROF[i][1]); g.lineTo(x, y); }
  g.closePath();
  return P;
}
let _art = null;
export function signArt() {
  if (_art) return _art;
  const lines = strokeLines();
  const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
  const g = cv.getContext('2d');
  // the face: the cream aluminium edge (0.26 m round the union of the strokes), then the red enamel
  drawStrokes(g, lines, 0.52, '#e9e1d2', PXM);
  drawStrokes(g, lines, 0, '#b8401f', PXM);
  // a faint weathering: the enamel a shade darker toward the bottom of each stroke band
  g.globalCompositeOperation = 'source-atop';
  const gr = g.createLinearGradient(0, 0, 0, AH); gr.addColorStop(0, 'rgba(255,240,220,0.06)'); gr.addColorStop(1, 'rgba(40,10,0,0.14)');
  g.fillStyle = gr; g.fillRect(0, 0, AW, AH);
  g.globalCompositeOperation = 'source-over';
  // the bottle: the cream edge, the cola-brown glass with its swirl, the clear neck, the crown, the round label
  g.fillStyle = '#e9e1d2'; bottlePath(g, PXM, 0.16); g.fill();
  const P = bottlePath(g, PXM, 0); g.save(); g.clip();
  g.fillStyle = '#4a2716'; g.fillRect(0, 0, AW, AH);
  g.strokeStyle = 'rgba(214,170,128,0.5)'; g.lineWidth = 0.34 * PXM;
  for (let k = -8; k <= 12; k++) { const [x0, y0] = P(k * 0.06, -1.2), [x1, y1] = P(k * 0.06 + 0.26, 1.2); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  { const [x0, y0] = P(0.66, -1.5), [x1, y1] = P(0.66, 1.5), [x2, y2] = P(1.02, 1.5), [x3, y3] = P(1.02, -1.5);
    g.fillStyle = '#b9c4c0'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.closePath(); g.fill(); }
  { const [x0, y0] = P(0.955, -1.5), [x1, y1] = P(0.955, 1.5), [x2, y2] = P(1.02, 1.5), [x3, y3] = P(1.02, -1.5);
    g.fillStyle = '#e8e8e4'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.closePath(); g.fill(); }
  g.restore();
  { // the label: a white disc, red over blue with the white band and the name across it
    const [cx, cy] = P(0.6, 0), r = 1.55 * PXM;
    g.save(); g.translate(cx, cy); g.rotate(-BOT.lean);
    g.fillStyle = '#f2efe8'; g.beginPath(); g.ellipse(0, 0, r, r * 0.8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c8202c'; g.beginPath(); g.ellipse(0, 0, r * 0.88, r * 0.68, 0, Math.PI, Math.PI * 2); g.fill();
    g.fillStyle = '#1f4f9b'; g.beginPath(); g.ellipse(0, 0, r * 0.88, r * 0.68, 0, 0, Math.PI); g.fill();
    g.fillStyle = '#f2efe8'; g.fillRect(-r * 0.9, -r * 0.2, r * 1.8, r * 0.4);
    g.fillStyle = '#1f4f9b'; g.font = `900 ${Math.round(r * 0.36)}px Arial, Helvetica, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('PEPSI', 0, r * 0.02);
    g.restore();
  }
  { // "TRADE MARK / REG. U. S. PAT. OFF." on its black plate under the swash
    const X = (u) => (u - U0) * PXM, Y = (v) => (VT - v) * PXM;
    g.fillStyle = '#121314'; g.fillRect(X(20.2), Y(0.2), (25.4 - 20.2) * PXM, (0.2 + 1.62) * PXM);
    g.fillStyle = '#eeeeea'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${Math.round(0.62 * PXM)}px Arial, Helvetica, sans-serif`;
    g.fillText('TRADE MARK', X(22.8), Y(-0.28));
    g.fillText('REG. U. S. PAT. OFF.', X(22.8), Y(-1.05));
  }
  const color = new THREE.CanvasTexture(cv);
  color.colorSpace = THREE.SRGBColorSpace; color.anisotropy = 8;
  // the neon: the tube as a ring along the union's outline (the edge's middle), the red faces lit by it; half size
  const NP = PXM / 2, nv = document.createElement('canvas'); nv.width = AW / 2; nv.height = AH / 2;
  const n = nv.getContext('2d');
  n.fillStyle = '#000'; n.fillRect(0, 0, nv.width, nv.height);
  drawStrokes(n, lines, 0.52, '#5e1208', NP);
  drawStrokes(n, lines, 0.36, '#ff2612', NP);
  drawStrokes(n, lines, 0.18, '#58110a', NP);
  n.fillStyle = '#1a1210'; bottlePath(n, NP, 0.16); n.fill();
  n.lineWidth = 0.1 * NP; n.strokeStyle = '#d8e6ff'; bottlePath(n, NP, 0.08); n.stroke();
  const neon = new THREE.CanvasTexture(nv);
  neon.colorSpace = THREE.SRGBColorSpace;
  // the halo: the ring blurred over ~0.6 m, faint (r1: a stronger, wider halo blurred the letters at dusk)
  const GP = 10, gv = document.createElement('canvas'); gv.width = 512; gv.height = 171;
  const h = gv.getContext('2d');
  h.fillStyle = '#000'; h.fillRect(0, 0, gv.width, gv.height);
  h.filter = 'blur(6px)';
  drawStrokes(h, lines, 0.5, '#ff3018', GP);
  h.filter = 'none';
  const glow = new THREE.CanvasTexture(gv);
  glow.colorSpace = THREE.SRGBColorSpace;
  _art = { color, neon, glow, W: AW / PXM, H: AH / PXM, uc: U0 + AW / PXM / 2, vc: V0 + AH / PXM / 2 };
  return _art;
}

// ---------------------------------------------------------------- materials
// the neon is off by day and on from dusk (ENV.night 0.12 -> 0.5); after dark the brightest channel is eased above 1
// (as tsqKit.js signMat: a saturated red over the bloom threshold otherwise blooms pink-white)
const NEON_ON = 'clamp((kNight - 0.12) / 0.38, 0.0, 1.0)';
let _M = null;
export function hpMats() {
  if (_M) return _M;
  const A = signArt();
  const S = (o) => LT(new THREE.MeshStandardMaterial(o));
  const face = new THREE.MeshStandardMaterial({ map: A.color, alphaTest: 0.5, roughness: 0.5, metalness: 0.12, emissive: 0xffffff, emissiveMap: A.neon, side: THREE.FrontSide });
  face.onBeforeCompile = (sh) => {
    sh.uniforms.kNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float kNight;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= 3.2 * ${NEON_ON};`)
      .replace('#include <fog_fragment>', `{ float kmx = max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b)), kex = max(kmx - 1.0, 0.0);
          gl_FragColor.rgb *= mix(1.0, min(1.0, (1.0 + kex / (1.0 + kex * 1.5)) / max(kmx, 1e-4)), ${NEON_ON}); }
        #include <fog_fragment>`);
  };
  face.customProgramCacheKey = () => 'ar32s-face';
  LT(face);   // the scene's light trim, as every lit prop (by day the untrimmed red read 3x too bright)
  const glow = new THREE.MeshBasicMaterial({ map: A.glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true });
  glow.onBeforeCompile = (sh) => {
    sh.uniforms.kNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float kNight;')
      .replace('#include <fog_fragment>', `gl_FragColor.rgb *= 0.32 * ${NEON_ON};\n#include <fog_fragment>`);
  };
  glow.customProgramCacheKey = () => 'ar32s-glow';
  // the spill on the ground: v across the quad (1 at the sign's side), u along it; a soft falloff both ways
  const spill = new THREE.MeshBasicMaterial({ color: 0xff3a22, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  spill.onBeforeCompile = (sh) => {
    sh.uniforms.kNight = ENV.night;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
varying vec2 vSp;`).replace('#include <uv_vertex>', `#include <uv_vertex>
vSp = uv;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float kNight;
varying vec2 vSp;`)
      .replace('#include <fog_fragment>', `{ float a = pow(clamp(vSp.y, 0.0, 1.0), 2.2) * smoothstep(0.0, 0.12, vSp.x) * smoothstep(1.0, 0.8, vSp.x);
          gl_FragColor.rgb *= 0.22 * a * ${NEON_ON}; }
        #include <fog_fragment>`);
  };
  spill.customProgramCacheKey = () => 'ar32s-spill';
  const lettersL = gantryLetters();
  const gl = new THREE.MeshStandardMaterial({ map: lettersL, roughness: 0.6, metalness: 0.2, emissive: 0xffffff, emissiveMap: lettersL });
  gl.onBeforeCompile = (sh) => {
    sh.uniforms.kNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float kNight;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= 0.55 * ${NEON_ON} * step(0.25, emissiveColor.r - emissiveColor.b);`);
  };
  gl.customProgramCacheKey = () => 'ar32s-gletters';
  LT(gl);   // the scene's light trim, as every lit prop (by day the untrimmed red read 3x too bright)
  const win = new THREE.MeshStandardMaterial({ color: 0x20262b, roughness: 0.15, metalness: 0.5, emissive: 0xffc27a });
  win.onBeforeCompile = (sh) => {
    sh.uniforms.kNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float kNight;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= 0.9 * ${NEON_ON};`);
  };
  win.customProgramCacheKey = () => 'ar32s-win';
  LT(win);   // the scene's light trim, as every lit prop (by day the untrimmed red read 3x too bright)
  _M = {
    face,
    spill,
    back: S({ map: A.color, alphaTest: 0.5, color: 0xcfc6ba, roughness: 0.6, metalness: 0.15, side: THREE.DoubleSide }),
    glow,
    steel: S({ color: 0x17191c, roughness: 0.55, metalness: 0.45 }),        // the grid's black-painted steel
    column: S({ color: 0x141a26, roughness: 0.5, metalness: 0.45 }),       // the columns' dark navy
    grate: S({ color: 0x3a3d40, roughness: 0.7, metalness: 0.4 }),
    concrete: S({ color: 0x9a968d, roughness: 0.9, metalness: 0.0 }),
    gsteel: S({ color: 0x1c1d1f, roughness: 0.62, metalness: 0.4 }),       // the gantries' black steel
    rust: S({ color: 0x4a3a30, roughness: 0.8, metalness: 0.3 }),
    rail: S({ color: 0x6d6862, roughness: 0.45, metalness: 0.7 }),
    fence: S({ color: 0xb7bbbd, roughness: 0.45, metalness: 0.6 }),
    deck: S({ color: 0x55504a, roughness: 0.85, metalness: 0.2 }),
    wood: S({ color: 0x8a6a4a, roughness: 0.8, metalness: 0.0 }),
    iron: S({ color: 0x2a2c2e, roughness: 0.5, metalness: 0.5 }),
    gletters: gl,
    win,
    pdeck: S({ color: 0x8e8a82, roughness: 0.88, metalness: 0.0 }),        // the piers' concrete deck
    pwall: S({ color: 0x6f6b64, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide }),
    lamp: win,
  };
  // after dusk the neon lights the sign's grid and columns red, and the gantries' floodlights their steel: a faint
  // emissive term on those lit materials, chained after their own light-trim patch
  const glowAfterDusk = (m, rgb, key) => {
    const prev = m.onBeforeCompile, pk = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : null;
    m.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      sh.uniforms.kNightS = ENV.night;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float kNightS;`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(${rgb.join(', ')}) * clamp((kNightS - 0.12) / 0.38, 0.0, 1.0);`);
    };
    m.customProgramCacheKey = () => (pk ? pk() : '') + '|' + key;
  };
  glowAfterDusk(_M.steel, [0.07, 0.012, 0.006], 'ar32sN1');
  glowAfterDusk(_M.column, [0.05, 0.009, 0.005], 'ar32sN2');
  glowAfterDusk(_M.gsteel, [0.045, 0.038, 0.03], 'ar32sN3');
  return _M;
}
// the gantries' lettering: orange-red capitals with a thin cream edge on the black top boxes (the September 2018
// photograph), one 1024 x 512 canvas: "LONG" on the upper half, "ISLAND" on the lower
let _gl = null;
function gantryLetters() {
  if (_gl) return _gl;
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
  const g = cv.getContext('2d');
  g.fillStyle = '#161718'; g.fillRect(0, 0, 1024, 512);
  // the capitals fill ~78 % of the box's height and ~85 % of its width, spaced out, condensed where they must be (the
  // 2018 photograph); drawn one by one with the gap between them
  const row = (txt, y0) => {
    g.save();
    g.font = `900 280px "Arial Black", Arial, Helvetica, sans-serif`;
    g.textAlign = 'left'; g.textBaseline = 'middle';
    const ws = [...txt].map((c) => g.measureText(c).width), gap = txt.length > 4 ? 26 : 70;
    const tot = ws.reduce((a, b) => a + b, 0) + gap * (txt.length - 1), sx = Math.min(1, 900 / tot);
    g.translate(512 - (tot * sx) / 2, y0 + 138); g.scale(sx, 1.0);
    let x = 0;
    for (let i = 0; i < txt.length; i++) {
      g.lineWidth = 10 / sx; g.strokeStyle = '#e9e2d4'; g.strokeText(txt[i], x, 0);
      g.fillStyle = '#e2653d'; g.fillText(txt[i], x, 0);
      x += ws[i] + gap;
    }
    g.restore();
  };
  row('LONG', 0); row('ISLAND', 256);
  _gl = new THREE.CanvasTexture(cv);
  _gl.colorSpace = THREE.SRGBColorSpace; _gl.anisotropy = 8;
  return _gl;
}

// ---------------------------------------------------------------- geometry helpers
const _B = new THREE.BoxGeometry(1, 1, 1);
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
// a box between two local points a, b (its long axis), cross-section t x t (or tw x th)
function beam(parts, a, b, tw, th = tw) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length();
  if (L < 1e-4) return;
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  parts.push(new THREE.Matrix4().compose(_v.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q.clone(), _s.set(tw, L, th)));
}
function boxAt(parts, x, y, z, w, h, d, ry = 0) {
  _e.set(0, ry, 0); _q.setFromEuler(_e);
  parts.push(new THREE.Matrix4().compose(_v.set(x, y, z), _q.clone(), _s.set(w, h, d)));
}
// merge box matrices into one geometry placed by the frame F
function boxesGeo(mats, F) {
  const g0 = _B.toNonIndexed(), P = g0.getAttribute('position'), N = g0.getAttribute('normal'), n = P.count;
  const pos = new Float32Array(mats.length * n * 3), nor = new Float32Array(mats.length * n * 3);
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3(), p = new THREE.Vector3();
  mats.forEach((M0, k) => {
    m.multiplyMatrices(F, M0); nm.getNormalMatrix(m);
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(P, i).applyMatrix4(m); pos.set([p.x, p.y, p.z], (k * n + i) * 3);
      p.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.set([p.x, p.y, p.z], (k * n + i) * 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(mats.length * n * 2), 2));
  g.computeBoundingSphere();
  return g;
}
function addMesh(group, geo, mat, name, cast = true) {
  const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = cast; m.receiveShadow = true; group.add(m); return m;
}
// the frame: origin o (world), X along (ux, uz), Y up, Z = X x Y
export function frame(ox, oy, oz, ux, uz) {
  const X = new THREE.Vector3(ux, 0, uz).normalize(), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3().crossVectors(X, Y);
  return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(ox, oy, oz);
}

// ---------------------------------------------------------------- the sign
// local frame: u along the sign from its north end (x), height over the ground (y), toward the river (z)
export function buildSign(group, y0) {
  const M = hpMats(), A = signArt();
  const [nx, nz] = SIGN.N, [sx, sz] = SIGN.S, L = Math.hypot(sx - nx, sz - nz);
  const F = frame(nx, y0, nz, (sx - nx) / L, (sz - nz) / L);
  const [f0, f1] = SIGN.FRAME, D = SIGN.DEPTH, [g0, g1] = SIGN.GIRDER, TOP = SIGN.TOP;
  const col = [], steel = [], grate = [], conc = [];
  // the columns (front and back of each line) on their concrete caps, the girders and the cross beams
  for (const u of SIGN.COLS) {
    for (const w of [-0.45, -D + 0.4]) { boxAt(col, u, g0 / 2, w, 0.72, g0, 0.72); boxAt(conc, u, 0.12, w, 1.3, 0.24, 1.3); }
    boxAt(steel, u, (g0 + g1) / 2, -D / 2, 0.5, g1 - g0 - 0.1, D);
  }
  boxAt(steel, (f0 + f1) / 2, (g0 + g1) / 2, -0.45, f1 - f0, g1 - g0, 0.8);
  boxAt(steel, (f0 + f1) / 2, (g0 + g1) / 2, -D + 0.4, f1 - f0, g1 - g0, 0.8);
  // the catwalk's grating between the girders and its back rail
  boxAt(grate, (f0 + f1) / 2, g1 + 0.03, -D / 2, f1 - f0, 0.06, D - 1.2);
  boxAt(steel, (f0 + f1) / 2, g1 + 1.1, -D + 0.05, f1 - f0, 0.06, 0.06);
  // the grid: the front plane's posts every 2.875 m and tiers, its X bracing; the back plane every other post
  const NB = 16, st = (f1 - f0) / NB, T = SIGN.TIERS;
  for (let k = 0; k <= NB; k++) {
    const u = f0 + k * st;
    beam(steel, [u, g1, 0], [u, TOP, 0], 0.24, 0.24);
    if (k % 2 === 0) {
      beam(steel, [u, g1, -D], [u, TOP, -D], 0.24, 0.24);
      for (const y of [T[1], T[3], TOP]) beam(steel, [u, y, 0], [u, y, -D], 0.14, 0.14);
      beam(steel, [u, g1, -D], [u, T[2], 0], 0.1, 0.1);
    }
    if (k < NB) for (let t = 0; t + 1 < T.length; t++) {
      beam(steel, [u, T[t], 0.02], [u + st, T[t + 1], 0.02], 0.1, 0.06);
      beam(steel, [u + st, T[t], -0.02], [u, T[t + 1], -0.02], 0.1, 0.06);
    }
  }
  for (const y of T) { beam(steel, [f0, y, 0], [f1, y, 0], y === TOP ? 0.34 : 0.22, y === TOP ? 0.34 : 0.22); }
  for (const y of [T[0], T[2], TOP]) beam(steel, [f0, y, -D], [f1, y, -D], 0.22, 0.22);
  // the letters' standoffs to the grid
  for (let k = 0; k <= NB; k++) for (const y of [T[1] + 0.4, T[3] - 0.4]) beam(steel, [f0 + k * st, y, 0], [f0 + k * st, y, SIGN.LETTER_W - SIGN.LETTER_D], 0.1, 0.1);
  addMesh(group, boxesGeo(col, F), M.column, 'ar32s:sign:columns');
  addMesh(group, boxesGeo(steel, F), M.steel, 'ar32s:sign:steel');
  addMesh(group, boxesGeo(grate, F), M.grate, 'ar32s:sign:grate');
  addMesh(group, boxesGeo(conc, F), M.concrete, 'ar32s:sign:caps', false);
  // the letters: the face, its depth as six layers behind, a back plate; the halo in front
  const pg = (z) => { const g = new THREE.PlaneGeometry(A.W, A.H); g.translate(A.uc, SIGN.LETTER_V0 + A.vc, z); g.applyMatrix4(F); return g; };
  const plane = (z, mat, name, cast) => addMesh(group, pg(z), mat, name, cast);
  const zf = SIGN.LETTER_W;
  plane(zf, M.face, 'ar32s:sign:face', true);
  // the returns (six layers) and the back plate as one draw
  const rl = [];
  for (let k = 1; k <= 7; k++) rl.push(pg(zf - (Math.min(k, 6.5) * SIGN.LETTER_D) / 6.5));
  addMesh(group, mergeGeometries(rl), M.back, 'ar32s:sign:returns', false);
  const gm = plane(zf + 0.35, M.glow, 'ar32s:sign:glow', false);
  gm.renderOrder = 3; gm.receiveShadow = false;
  // the neon's red light on the lawn in front (after dusk): an additive quad 12 cm over the ground (over the paths too),
  // brightest under the letters and gone 16 m out
  const lg = new THREE.PlaneGeometry(56, 18);
  lg.rotateX(-Math.PI / 2); lg.translate(22.5, 0.12, 9 + SIGN.LETTER_W - 1.5); lg.applyMatrix4(F);
  const lm = addMesh(group, lg, M.spill, 'ar32s:sign:spill', false);
  lm.renderOrder = 3; lm.receiveShadow = false;
  return F;
}

// ---------------------------------------------------------------- the gantries
// local frame: x across the tracks (to the SSW, so the words read from the river), y up from the water, z toward the river
function buildGantry(group, G, which, acc) {
  const M = hpMats();
  const [tx, tz] = GANTRY.T, ax = -tz, az = tx;   // across: (-0.253, 0.965)
  const F = frame(G.C[0], 0, G.C[1], ax, az);
  const W = G.W, HB = G.HB, HT = G.HT, hw = W / 2, s = [], rust = [], conc = [], rail = [], fence = [], deck = [], wood = [];
  const legX = [-hw + 0.9, hw - 0.9], legZ = [1.5, -1.5], TW = 1.7;
  // two lattice towers: four corner angles each, ties every 1.7 m, X bracing on the front and the sides
  for (const lx of legX) {
    boxAt(conc, lx, 0.7, 0, TW + 1.4, 1.4, 4.6);
    for (const lz of legZ) for (const dx of [-TW / 2, TW / 2]) for (const dz of [-0.5, 0.5]) beam(s, [lx + dx, 1.4, lz + dz], [lx + dx, HB, lz + dz], 0.2, 0.2);
    for (let y = 1.4; y < HB - 0.5; y += 1.7) {
      for (const lz of legZ) {
        beam(s, [lx - TW / 2, y, lz + 0.5], [lx + TW / 2, y + 1.7, lz + 0.5], 0.08, 0.06);
        beam(s, [lx + TW / 2, y, lz + 0.5], [lx - TW / 2, y + 1.7, lz + 0.5], 0.08, 0.06);
        beam(s, [lx - TW / 2, y, lz + 0.5], [lx + TW / 2, y, lz + 0.5], 0.1, 0.1);
      }
      beam(s, [lx, y, legZ[0]], [lx, y + 1.7, legZ[1]], 0.12, 0.12);
    }
  }
  // the lower lattice girder across between the towers (the apron's hoist), front and back, Warren webbing
  const yg0 = HB - 3.4, yg1 = HB - 1.2;
  for (const lz of [1.6, -1.6]) {
    beam(s, [-hw + 0.9, yg0, lz], [hw - 0.9, yg0, lz], 0.3, 0.3);
    beam(s, [-hw + 0.9, yg1, lz], [hw - 0.9, yg1, lz], 0.3, 0.3);
    const nb = Math.round((W - 1.8) / 1.6);
    for (let k = 0; k < nb; k++) { const x0 = -hw + 0.9 + ((W - 1.8) * k) / nb, x1 = -hw + 0.9 + ((W - 1.8) * (k + 1)) / nb; beam(s, [x0, k % 2 ? yg1 : yg0, lz], [x1, k % 2 ? yg0 : yg1, lz], 0.12, 0.1); }
  }
  // the top box with its lettering on the river face, a roof edge and two vents
  boxAt(s, 0, (HB + HT) / 2, 0, W, HT - HB, 3.4);
  boxAt(s, 0, HT + 0.12, 0, W + 0.3, 0.24, 3.7);
  boxAt(rust, -hw * 0.45, HT + 0.9, -0.4, 0.5, 1.3, 0.5); boxAt(rust, hw * 0.35, HT + 0.7, 0.3, 0.4, 0.9, 0.4);
  // the diagonal struts from the towers up to the box
  for (const lx of legX) { const sgn = Math.sign(lx); beam(s, [lx - sgn * TW / 2, HB - 4.5, 1.6], [lx - sgn * (TW / 2 + 2.6), HB, 1.6], 0.22, 0.22); beam(s, [lx - sgn * TW / 2, HB - 4.5, -1.6], [lx - sgn * (TW / 2 + 2.6), HB, -1.6], 0.22, 0.22); }
  // the apron: its deck from under the frame out over the river, the pair of rails, the railings, the hoist rods
  const aw = W - 5.0, AL = GANTRY.APRON, dy = GANTRY.DECK_Y;
  boxAt(deck, 0, dy - 0.35, AL / 2 - 3, aw, 0.7, AL + 6);
  for (const x of [-0.72, 0.72]) boxAt(rail, x, dy + 0.08, AL / 2 - 3, 0.08, 0.16, AL + 6);
  for (let z = -5; z < AL + 3; z += 0.62) boxAt(wood, 0, dy + 0.02, z, 2.2, 0.07, 0.24);
  for (const x of [-aw / 2 + 0.1, aw / 2 - 0.1]) {
    boxAt(fence, x, dy + 1.07, AL / 2 - 3, 0.06, 0.06, AL + 6);
    boxAt(fence, x, dy + 0.55, AL / 2 - 3, 0.02, 0.9, AL + 6);
    for (let z = -6; z <= AL + 3; z += 2.4) boxAt(fence, x, dy + 0.55, z, 0.07, 1.1, 0.07);
  }
  for (const x of [-aw / 2 + 0.6, aw / 2 - 0.6]) beam(s, [x, yg0, 1.6], [x, dy + 0.3, 3.0], 0.07, 0.07);
  // gathered in world terms per material (buildGantries draws both frames and the house as one mesh a material)
  for (const [k, L] of [['gsteel', s], ['rust', rust], ['concrete', conc], ['rail', rail], ['fence', fence], ['deck', deck], ['wood', wood]]) {
    const A = acc[k] || (acc[k] = []);
    for (const m of L) A.push(new THREE.Matrix4().multiplyMatrices(F, m));
  }
  // the lettering: a plane on the box's river face (and the back), its half of the letters canvas
  const lg = new THREE.PlaneGeometry(W - 0.3, HT - HB - 0.3), uv = lg.getAttribute('uv'), half = which === 'LONG' ? 0.5 : 0;
  for (let i = 0; i < uv.count; i++) uv.setY(i, half + uv.getY(i) * 0.5);
  const front = lg.clone(); front.translate(0, (HB + HT) / 2, 1.72); front.applyMatrix4(F);
  addMesh(group, front, M.gletters, `ar32s:gantry:${which}:letters`, false);
  return F;
}
// the operator's house between the two frames: a black box with its row of windows, on its own struts
function buildHouse(group, acc) {
  const M = hpMats();
  const A = GANTRY.LONG.C, B = GANTRY.ISLAND.C, [tx, tz] = GANTRY.T;
  const cx = (A[0] + B[0]) / 2 + tx * 0.8, cz = (A[1] + B[1]) / 2 + tz * 0.8;
  const F = frame(cx, 0, cz, -tz, tx), s = [], w = [];
  boxAt(s, 0, 8.4, 0, 9.0, 4.0, 4.2);
  boxAt(s, 0, 10.5, 0, 9.4, 0.2, 4.6);
  for (const x of [-3.8, 3.8]) for (const z of [-1.8, 1.8]) beam(s, [x, 1.4, z], [x, 6.4, z], 0.22, 0.22);
  boxAt(s, 0, 6.35, 0, 9.4, 0.3, 4.6);
  for (let k = 0; k < 6; k++) boxAt(w, -3.3 + k * 1.3, 8.9, 2.12, 0.8, 1.2, 0.04);
  for (const m of s) acc.gsteel.push(new THREE.Matrix4().multiplyMatrices(F, m));
  addMesh(group, boxesGeo(w, F), M.win, 'ar32s:gantry:house:windows', false);
}
export function buildGantries(group) {
  const M = hpMats(), acc = {}, I = new THREE.Matrix4();
  buildGantry(group, GANTRY.LONG, 'LONG', acc);
  buildGantry(group, GANTRY.ISLAND, 'ISLAND', acc);
  buildHouse(group, acc);
  for (const [k, L] of Object.entries(acc)) if (L.length) addMesh(group, boxesGeo(L, I), M[k], `ar32s:gantries:${k}`, k !== 'concrete');
}

// ---------------------------------------------------------------- benches
// the park's benches: a 1.8 m bench of wooden slats on two cast-iron frames, facing `yaw`; list [[x, y, z, yaw]]
export function buildBenches(group, list) {
  const M = hpMats(), wood = [], iron = [];
  for (const [x, y, z, yaw] of list) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const F = frame(x, y, z, fz, -fx);   // local x along the bench, z the way it faces
    const w = [], ir = [];
    for (let k = 0; k < 4; k++) boxAt(w, 0, 0.44, 0.2 - k * 0.12, 1.8, 0.035, 0.09);
    for (let k = 0; k < 3; k++) boxAt(w, 0, 0.62 + k * 0.13, -0.25 - k * 0.02, 1.8, 0.09, 0.03);
    for (const lx of [-0.75, 0.75]) { boxAt(ir, lx, 0.22, 0, 0.06, 0.44, 0.5); boxAt(ir, lx, 0.6, -0.26, 0.05, 0.4, 0.05); }
    for (const m of w) wood.push(new THREE.Matrix4().multiplyMatrices(F, m));
    for (const m of ir) iron.push(new THREE.Matrix4().multiplyMatrices(F, m));
  }
  if (!wood.length) return;
  const I = new THREE.Matrix4();
  addMesh(group, boxesGeo(wood, I), M.wood, 'ar32s:benches:wood');
  addMesh(group, boxesGeo(iron, I), M.iron, 'ar32s:benches:iron');
}

// ---------------------------------------------------------------- the piers
// the deck (the OSM outline, 0.9 m thick, its top at yTop), the piles under its edges every 4.5 m, the railings on
// every edge over the water (1.07 m top rail, a mid rail, posts every 2 m), the lamps along the walks (6.1 m poles, the
// heads lit after dusk) and the wooden lounge chairs of the north pier facing the river; returns the chairs' seats
export function buildPier(group, yTop, walks, drawTop) {
  const M = hpMats();
  if (drawTop) {   // only when hptSign.js apply() could not lay the deck as the tile's own paving
    const sh = new THREE.Shape(PIER.map(([x, z]) => new THREE.Vector2(x, -z)));
    const top = new THREE.ShapeGeometry(sh);
    top.rotateX(-Math.PI / 2); top.translate(0, yTop, 0);
    addMesh(group, top, M.pdeck, 'ar32s:pier:deck', false);
  }
  const wall = [], piles = [], rail = [], I = new THREE.Matrix4();
  const pos = [];
  for (let i = 0; i < PIER.length; i++) {
    const [x0, z0] = PIER[i], [x1, z1] = PIER[(i + 1) % PIER.length], L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 0.05) continue;
    pos.push(x0, yTop, z0, x1, yTop, z1, x1, yTop - 0.9, z1, x0, yTop, z0, x1, yTop - 0.9, z1, x0, yTop - 0.9, z0);
    for (let d = 1.0; d < L - 0.5; d += 4.5) { const t = d / L; boxAt(piles, x0 + (x1 - x0) * t, (yTop - 0.9 - 1.5) / 2, z0 + (z1 - z0) * t, 0.45, yTop - 0.9 + 1.5, 0.45); }
    if (PIER_COAST.includes(i)) continue;
    const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
    // the railing a little inside the edge (the inward side found from the deck's winding is not needed: 0.15 m either
    // way is inside the 0.45 m piles)
    beam(rail, [x0, yTop + 1.07, z0], [x1, yTop + 1.07, z1], 0.07, 0.07);
    beam(rail, [x0, yTop + 0.55, z0], [x1, yTop + 0.55, z1], 0.035, 0.035);
    beam(rail, [x0, yTop + 0.12, z0], [x1, yTop + 0.12, z1], 0.035, 0.035);
    for (let d = 0; d < L; d += 2.0) boxAt(rail, x0 + ux * d, yTop + 0.55, z0 + uz * d, 0.05, 1.1, 0.05);
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wg.computeVertexNormals();
  addMesh(group, wg, M.pwall, 'ar32s:pier:edge', false);
  addMesh(group, boxesGeo(piles, I), M.concrete, 'ar32s:pier:piles', false);
  addMesh(group, boxesGeo(rail, I), M.fence, 'ar32s:pier:railing');
  // lamps along each walk, every 14 m, 1.8 m off its line on alternate sides
  const pole = [], head = [];
  for (const [x0, z0, x1, z1, hw] of walks) {
    const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
    let k = 0;
    for (let d = 5; d < L - 3; d += 14, k++) {
      const off = (k % 2 ? 1 : -1) * Math.min(hw - 0.4, 2.2), x = x0 + ux * d - uz * off, z = z0 + uz * d + ux * off;
      boxAt(pole, x, yTop + 3.05, z, 0.14, 6.1, 0.14);
      boxAt(pole, x, yTop + 0.3, z, 0.34, 0.6, 0.34);
      boxAt(head, x, yTop + 6.2, z, 0.62, 0.22, 0.62);
    }
  }
  addMesh(group, boxesGeo(pole, I), M.iron, 'ar32s:pier:lamps');
  addMesh(group, boxesGeo(head, I), M.lamp, 'ar32s:pier:lampheads', false);
  // the lounge chairs: pairs across the north pier's middle every 9 m, facing out along it to the west (Manhattan)
  const [ax0, az0, ax1, az1] = walks[0], L = Math.hypot(ax1 - ax0, az1 - az0), ux = (ax1 - ax0) / L, uz = (az1 - az0) / L;
  const wood = [], iron = [], seats = [];
  const fx = uz, fz = -ux;   // across the pier
  for (let d = 12; d < L - 8; d += 9) {
    for (const s of [-0.5, 0.5]) {
      const x = ax0 + ux * d + fx * s * 1.7, z = az0 + uz * d + fz * s * 1.7;
      const F = frame(x, yTop, z, uz, -ux);
      const w = [], ir = [];
      boxAt(w, 0, 0.36, 0.2, 0.68, 0.06, 1.3);
      _e.set(-0.75, 0, 0); _q.setFromEuler(_e);
      w.push(new THREE.Matrix4().compose(_v.set(0, 0.62, -0.62), _q.clone(), _s.set(0.68, 0.06, 0.75)));
      for (const lx of [-0.3, 0.3]) for (const lz of [0.75, -0.5]) boxAt(ir, lx, 0.17, lz, 0.05, 0.34, 0.05);
      for (const m of w) wood.push(new THREE.Matrix4().multiplyMatrices(F, m));
      for (const m of ir) iron.push(new THREE.Matrix4().multiplyMatrices(F, m));
      seats.push({ x: x + ux * 0.1, z: z + uz * 0.1, yaw: Math.atan2(ux, uz) });
    }
  }
  addMesh(group, boxesGeo(wood, I), M.wood, 'ar32s:pier:chairs');
  addMesh(group, boxesGeo(iron, I), M.iron, 'ar32s:pier:chairlegs');
  return seats;
}
