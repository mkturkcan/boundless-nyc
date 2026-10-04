// AR33 custom builders and sign marks, segment west: 12th Avenue (Dinosaur Bar-B-Que) to Morningside Avenue. Specs name them as 'west:<fn>' (docs/notes/ar33-spec.md).
// Owner: the WEST worker (docs/notes/ar33-west.md).
// references listed in fk/specs/west.js.
// dino(group, ctx, spec, frame): Dinosaur Bar-B-Que, 700 W 125th St: the two-storey brick meatpacking building with
// its basketweave frieze, the 125th Street front (raised entrance, ramp and railing, the black canopy "700 W. 125th
// St." under a rust-red standing-seam roof, string lights, the painted "BBQ ENTRANCE" and "Cold Beer" signs), the
// red neon "BAR BQUE" blade at the corner, the SE face (the old loading dock canopy on tie rods over Floridita, the
// Dinosaur's own canopy "DINOSAUR BAR-B-QUE" over the outdoor seating), the graffiti wall toward the parkway, and
// the roof: bulkhead, plant and three billboard structures (invented brands).
import * as THREE from 'three';
import { ENV, applyLightTrim, applyCityAO } from '../../../world/materials.js';
import { graffitiTex } from '../kitTex.js';
import { kitGraffitiMat } from '../kitMats.js';
import { pbrMaterial } from '../../mat/pbrLib.js';

// ------------------------------------------------------------------ small helpers
const QW = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
// AR34 w2 s3 (2026-10-02): the 12th Avenue face as of the 2025-07 photograph of Columbia Engineering's Innovation Hub door
// (2276 12th Avenue, this building's second floor) and the Dinosaur's dining rooms as restaurant interiors; `?w33hub=0` = before
const HUB25 = !(QW && QW.get('w33hub') === '0');
const rng = (seed) => { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function ctex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true;
  return t;
}
// fonts: SIGN's families (fk/signFonts.js) once fk/signKit.js has registered them; every canvas below is drawn at once
// with fallbacks and redrawn when the fonts are in
const REDRAW = [];
let SIGNK = null;
const fontsIn = import('../signKit.js')
  .then((m) => { SIGNK = m; return m.signsReady ? Promise.race([m.signsReady, new Promise((r) => setTimeout(r, 20000))]) : null; })
  .catch(() => null)
  .then(() => (typeof document !== 'undefined' && document.fonts ? document.fonts.ready : null))
  .then(() => { for (const f of REDRAW) { try { f(); } catch (e) { /* keep the first drawing */ } } });
void fontsIn;
const FONT = { slab: '"ar33 RobotoSlab", "Rockwell", Georgia, serif', serif: '"ar33 DMSerifDisplay", Georgia, serif',
  script: '"ar33 Lobster", "Brush Script MT", cursive', sans: '"ar33 Oswald", "Arial Narrow", Arial, sans-serif',
  bold: '"ar33 Anton", Impact, "Arial Black", sans-serif', inter: '"ar33 Inter", Arial, sans-serif', mont: '"ar33 Montserrat", Arial, sans-serif' };
// a canvas texture whose drawing is repeated once the sign fonts are in
function drawnTex(w, h, draw, srgb = true) {
  const c = cnv(w, h), t = ctex(c, srgb);
  const run = () => { const g = c.getContext('2d'); g.clearRect(0, 0, w, h); draw(g, w, h); t.needsUpdate = true; };
  run(); REDRAW.push(run);
  return t;
}
// emissive x mix(day, night, ENV.night), then the city's light trim and AO
function nightMat(m, day, night, tag) {
  const prev = m.onBeforeCompile, pk = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.kW33N = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float kW33N;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n  totalEmissiveRadiance *= mix(${day.toFixed(3)}, ${night.toFixed(3)}, kW33N);`);
  };
  m.customProgramCacheKey = () => (pk ? pk.call(m) : '') + '|w33n' + tag;
  return m;
}
// the shader facades' value curve, as MATS applies it to its wall sets (mat/pbrLib.js): net diffuse = 0.88 * albedo^1.22 by
// day (applyLightTrim then multiplies by mix(0.30, 0.88, night), divided out here), so a painted board, a timber panel or a
// decal sits at the brightness of the PBR brick beside it for the same measured colour
function calib(m) {
  const prev = m.onBeforeCompile, pk = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.kW33C = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float kW33C;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(1.22)) * 0.88 / mix(0.30, 0.88, kW33C);');
  };
  m.customProgramCacheKey = () => (pk ? pk.call(m) : '') + '|w33cal';
  return m;
}
const lit = (m) => { calib(m); applyLightTrim(m); applyCityAO(m); m.shadowSide = THREE.DoubleSide; return m; };

// ------------------------------------------------------------------ painted metal, weathered timber (own sets)
const _own = new Map();
function paintMat(hex, rough = 0.5, metal = 0.25) {
  const k = 'p' + hex + rough + metal; if (_own.has(k)) return _own.get(k);
  const m = lit(new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: rough, metalness: metal })); _own.set(k, m); return m;
}
function timberMat(hex = '#7a6450', seed = 3) {
  const k = 't' + hex + seed; if (_own.has(k)) return _own.get(k);
  // vertical reclaimed boards 0.14 m wide, grain, nail rows, weathering; one repeat 1.12 x 2.4 m
  const t = drawnTex(448, 960, (g, w, h) => {
    const R = rng(seed * 97 + 5), base = new THREE.Color(hex);
    for (let b = 0; b < 8; b++) {
      const x0 = (b * w) / 8, k2 = 0.78 + R() * 0.4;
      g.fillStyle = '#' + base.clone().multiplyScalar(k2).getHexString(); g.fillRect(x0, 0, w / 8, h);
      for (let i = 0; i < 26; i++) { g.strokeStyle = 'rgba(' + (R() < 0.5 ? '30,22,14' : '220,205,180') + ',' + (0.05 + R() * 0.12) + ')'; g.lineWidth = 1 + R() * 2; g.beginPath(); const xx = x0 + R() * w / 8; g.moveTo(xx, 0); g.bezierCurveTo(xx + (R() - 0.5) * 8, h * 0.3, xx + (R() - 0.5) * 8, h * 0.7, xx + (R() - 0.5) * 6, h); g.stroke(); }
      g.fillStyle = 'rgba(15,10,6,0.55)'; g.fillRect(x0, 0, 2, h);
      g.fillStyle = 'rgba(40,40,40,0.7)'; for (const y of [0.08, 0.5, 0.92]) { g.fillRect(x0 + w / 32, y * h, 3, 3); g.fillRect(x0 + w / 16 + w / 48, y * h, 3, 3); }
    }
  });
  t.repeat.set(1 / 1.12, 1 / 2.4);
  const m = lit(new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 })); _own.set(k, m); return m;
}

// ------------------------------------------------------------------ the basketweave frieze (stack bond, white mortar)
// US modular brick: 203 x 68 mm module (3 courses = 1 brick length). One repeat: 1.2192 m (6 squares) across, 1.6256 m
// up: a soldier course, then 7 rows of basketweave squares (3 stretchers / 3 soldiers). v = 0 at the band's foot, which
// the caller gives (the NE front's band starts at 7.97 over the sidewalk, the SE wing's right over its low windows).
// the band
// averages (130,103,102) in the photo.
const SQ = 0.2032, BW = 6 * SQ, BH = 8 * SQ;
let _basketTex = null;
const _basketMats = new Map();
function basketTex() {
  if (_basketTex) return _basketTex;
  const PX = 640, W = Math.round(BW * PX), H = Math.round(BH * PX), R = rng(4471);
  const alb = new Uint8ClampedArray(W * H * 4), hgt = new Float32Array(W * H);
  // w2r1: mortar and bricks darkened to the measured band (ref (115,94,91) vs the twin (167,134,130) at b0, (141,113,108) at r1;
  // sRGB means over the same patch of dino_ne23 / elev/dino_ne_ShDN22)
  for (let i = 0; i < W * H; i++) { const n = (R() - 0.5) * 18; alb[i * 4] = 152 + n; alb[i * 4 + 1] = 146 + n; alb[i * 4 + 2] = 139 + n; alb[i * 4 + 3] = 255; }
  const J = (0.011 * PX) / 2;
  const brick = (u0, v0, u1, v1) => {
    const x0 = Math.round(u0 * PX + J), x1 = Math.round(u1 * PX - J), y0 = Math.round(H - v1 * PX + J), y1 = Math.round(H - v0 * PX - J);
    const t = R(), k = t < 0.1 ? 0.62 : t > 0.93 ? 1.18 : 0.92 + R() * 0.16;
    const r = (92 + (R() - 0.5) * 24) * k, g = (50 + (R() - 0.5) * 12) * k, b = (45 + (R() - 0.5) * 10) * k;
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
      const i = y * W + x, n = (R() - 0.5) * 26, e = Math.min(x - x0, x1 - 1 - x, y - y0, y1 - 1 - y);
      alb[i * 4] = r + n; alb[i * 4 + 1] = g + n * 0.45; alb[i * 4 + 2] = b + n * 0.35;
      hgt[i] = e < 2 ? 0.5 + e * 0.25 : 1;
    }
  };
  const C = SQ / 3;
  for (let i = 0; i < 18; i++) brick(i * C, 0, (i + 1) * C, SQ);                  // the soldier course over the window heads
  for (let k = 0; k < 7; k++) for (let i = 0; i < 6; i++) {
    const u0 = i * SQ, v0 = SQ + k * SQ;
    if ((i + k) % 2 === 0) for (let j = 0; j < 3; j++) brick(u0, v0 + j * C, u0 + SQ, v0 + (j + 1) * C);
    else for (let j = 0; j < 3; j++) brick(u0 + j * C, v0, u0 + (j + 1) * C, v0 + SQ);
  }
  const nrm = new Uint8ClampedArray(W * H * 4), s = 2.4;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const nx = -(hgt[y * W + ((x + 1) % W)] - hgt[y * W + ((x - 1 + W) % W)]) * s, ny = (hgt[((y + 1) % H) * W + x] - hgt[((y - 1 + H) % H) * W + x]) * s;
    const L = Math.hypot(nx, ny, 1);
    nrm[i * 4] = (nx / L * 0.5 + 0.5) * 255; nrm[i * 4 + 1] = (ny / L * 0.5 + 0.5) * 255; nrm[i * 4 + 2] = (1 / L * 0.5 + 0.5) * 255; nrm[i * 4 + 3] = 255;
  }
  const put = (arr) => { const c = cnv(W, H); const g = c.getContext('2d'); const im = g.createImageData(W, H); if (im && im.data) { im.data.set(arr); g.putImageData(im, 0, 0); } return c; };
  _basketTex = [ctex(put(alb)), ctex(put(nrm), false)];
  return _basketTex;
}
// the band's material for a foot at height y0 (one material per foot, the textures shared through clones)
function basketMat(y0) {
  const key = y0.toFixed(2);
  if (_basketMats.has(key)) return _basketMats.get(key);
  const [tA0, tN0] = basketTex();
  const tA = tA0.clone(), tN = tN0.clone();
  for (const t of [tA, tN]) { t.needsUpdate = true; t.repeat.set(1 / BW, 1 / BH); t.offset.set(0, -y0 / BH); }
  const m = lit(new THREE.MeshStandardMaterial({ map: tA, normalMap: tN, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.9 }));
  _basketMats.set(key, m);
  return m;
}

// ------------------------------------------------------------------ corrugated steel (the loading dock canopy roof)
let _corr = null;
function corrMat() {
  if (_corr) return _corr;
  const W = 64, H = 8, c = cnv(W, H), g = c.getContext('2d'), im0 = g.createImageData(W, H), im = im0 && im0.data ? im0 : { data: new Uint8ClampedArray(W * H * 4) };
  for (let x = 0; x < W; x++) {
    const d = Math.cos((x / W) * Math.PI * 2) * 0.85;   // the slope of the sine along u
    for (let y = 0; y < H; y++) { const i = (y * W + x) * 4; im.data[i] = (d * 0.5 + 0.5) * 255; im.data[i + 1] = 128; im.data[i + 2] = 230; im.data[i + 3] = 255; }
  }
  g.putImageData(im, 0, 0);
  const tN = ctex(c, false); tN.repeat.set(1 / 0.0677, 1);
  // rust and grime in the albedo, streaked along the corrugations
  const tA = drawnTex(512, 512, (q, w, h) => {
    q.fillStyle = HUB25 ? '#45494d' : '#6d6a62'; q.fillRect(0, 0, w, h);
    const R = rng(77);
    // (AR34 w2 s3: the 2025-07 photograph shows the soffit repainted a clean dark charcoal: a few rust runs only)
    for (let i = 0; i < (HUB25 ? 90 : 900); i++) { q.fillStyle = `rgba(${110 + R() * 60 | 0},${58 + R() * 30 | 0},${30 + R() * 16 | 0},${(0.05 + R() * 0.25) * (HUB25 ? 0.5 : 1)})`; q.fillRect(R() * w, R() * h, 2 + R() * 6, 10 + R() * 90); }
    for (let i = 0; i < 300; i++) { q.fillStyle = `rgba(30,28,26,${R() * 0.25})`; q.fillRect(R() * w, R() * h, 1 + R() * 3, 20 + R() * 120); }
  });
  tA.repeat.set(1 / 4, 1 / 4);
  _corr = lit(new THREE.MeshStandardMaterial({ map: tA, normalMap: tN, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.62, metalness: 0.35, side: THREE.DoubleSide }));
  return _corr;
}

// ------------------------------------------------------------------ decals: painted wall signs, graffiti, posters, ads
// a transparent painted layer mapped onto the face rectangle u0..u0+w x y0..y0+h (the kit's UVs are metres: [u, y])
function decal(w, h, u0, y0, ppm, draw, o = {}) {
  const W = Math.min(4096, Math.max(64, Math.round(w * ppm))), H = Math.min(4096, Math.max(64, Math.round(h * ppm)));
  // o.opacity: a ghost sign worn into the brick. The decals draw as cut-outs (r1 and r2: neither a material opacity nor a
  // scaled canvas alpha faded them), so the paint is washed toward the brick's colour in RGB and worn through in holes
  const paint = o.opacity == null ? draw : (g, w2, h2) => {
    draw(g, w2, h2); g.save();
    g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 1 - o.opacity; g.fillStyle = o.wash || '#74503f'; g.fillRect(0, 0, w2, h2);
    g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 1;
    const R = rng(w2 * 7 + h2);
    for (let i = 0; i < w2 * h2 * 0.002; i++) { const sz = 1 + R() * 4; g.fillRect(R() * w2, R() * h2, sz * (1 + R() * 3), sz); }
    g.restore();
  };
  const t = drawnTex(W, H, paint);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  if (o.flip) { t.repeat.set(-1 / w, 1 / h); t.offset.set((u0 + w) / w, -y0 / h); } else { t.repeat.set(1 / w, 1 / h); t.offset.set(-u0 / w, -y0 / h); }
  const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.03, depthWrite: false, roughness: o.rough ?? 0.92,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  if (o.glow) { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = t; nightMat(m, o.glow[0], o.glow[1], 'dc' + o.glow.join('_')); }
  return lit(m);
}
// the parkway wall's paint is mostly chrome and white throw-ups with black outlines (dino_nwdeck26): the painter's fills
// pulled toward grey by k (0..1), keeping their outlines and the canvas alpha; once per canvas
function chromeWash(tx, k) {
  const c = tx && tx.map && tx.map.image;
  if (!c || tx.w33wash || typeof document === 'undefined' || !c.getContext) return;
  tx.w33wash = true;
  try {
    const t = cnv(c.width, c.height), q = t.getContext('2d'), g = c.getContext('2d');
    q.drawImage(c, 0, 0);
    q.globalCompositeOperation = 'saturation'; q.globalAlpha = k; q.fillStyle = '#808080'; q.fillRect(0, 0, t.width, t.height);
    q.globalCompositeOperation = 'source-over'; q.globalAlpha = 0.18 * k; q.fillStyle = '#ffffff'; q.fillRect(0, 0, t.width, t.height);
    q.globalAlpha = 1; q.globalCompositeOperation = 'destination-in'; q.drawImage(c, 0, 0);
    g.clearRect(0, 0, c.width, c.height); g.drawImage(t, 0, 0);
    tx.map.needsUpdate = true;
  } catch (e) { /* keep the painter's colours */ }
}
// weathered white paint on brick: the mortar joints and a random loss show through
function weather(g, w, h, seed, amt = 0.35) {
  const R = rng(seed);
  g.save(); g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < w * h * 0.0009; i++) { g.fillStyle = `rgba(0,0,0,${R() * amt})`; const s = 1 + R() * 5; g.fillRect(R() * w, R() * h, s * (1 + R() * 3), s); }
  const cy = h / 30; for (let y = 0; y < h; y += cy) { g.fillStyle = `rgba(0,0,0,${0.35 * amt})`; g.fillRect(0, y, w, Math.max(1, cy * 0.12)); }
  g.restore();
}
function drawBBQEntrance(g, w, h) {
  // "BBQ" in tall outlined serif capitals over an arrow to the door carrying "ENTRANCE", white paint, much faded
  g.strokeStyle = 'rgba(238,234,224,0.92)'; g.fillStyle = 'rgba(238,234,224,0.18)'; g.lineJoin = 'round';
  g.lineWidth = h * 0.018;
  g.font = `700 ${h * 0.36}px ${FONT.slab}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.strokeText('BBQ', w * 0.44, h * 0.46); g.fillText('BBQ', w * 0.44, h * 0.46);
  const ay = h * 0.56, ah = h * 0.26, ax0 = w * 0.03, ax1 = w * 0.97;
  g.beginPath(); g.moveTo(ax0, ay); g.lineTo(ax1 - ah * 0.8, ay); g.lineTo(ax1 - ah * 0.8, ay - ah * 0.22); g.lineTo(ax1, ay + ah / 2);
  g.lineTo(ax1 - ah * 0.8, ay + ah * 1.22); g.lineTo(ax1 - ah * 0.8, ay + ah); g.lineTo(ax0, ay + ah); g.closePath(); g.stroke();
  g.fillStyle = 'rgba(238,234,224,0.9)'; g.font = `700 ${ah * 0.62}px ${FONT.slab}`; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText('ENTRANCE', ax0 + w * 0.04, ay + ah / 2 + 2, (ax1 - ax0) * 0.74);
  g.font = `400 ${h * 0.07}px ${FONT.script}`; g.fillText('Good Smoke', w * 0.6, h * 0.88, w * 0.36);
  weather(g, w, h, 11, 0.45);
}
function drawColdBeer(g, w, h) {
  // the restaurant's painted wall sign: "Cold Beer" (script), a beer mug, "& COCKTAILS", "ALL LEGAL / BEVERAGES"
  g.fillStyle = 'rgba(240,236,226,0.94)'; g.textBaseline = 'alphabetic';
  g.font = `400 ${h * 0.2}px ${FONT.script}`; g.textAlign = 'left'; g.fillText('Cold Beer', w * 0.03, h * 0.24, w * 0.94);
  // the mug
  const mx = w * 0.05, my = h * 0.33, mw = w * 0.15, mh = h * 0.2;
  g.strokeStyle = 'rgba(240,236,226,0.94)'; g.lineWidth = h * 0.014;
  g.strokeRect(mx, my, mw, mh); g.beginPath(); g.arc(mx + mw, my + mh * 0.5, mh * 0.28, -Math.PI / 2, Math.PI / 2); g.stroke();
  g.beginPath(); for (let i = 0; i < 4; i++) g.arc(mx + mw * (0.12 + i * 0.26), my, mw * 0.14, Math.PI, 0); g.fill();
  g.font = `700 ${h * 0.13}px ${FONT.serif}`; g.fillText('& COCKTAILS', w * 0.24, h * 0.49, w * 0.74);
  g.font = `500 ${h * 0.1}px ${FONT.sans}`; g.textAlign = 'center';
  g.fillText('A  L  L     L  E  G  A  L', w * 0.52, h * 0.68, w * 0.86); g.fillText('B E V E R A G E S', w * 0.52, h * 0.86, w * 0.86);
  weather(g, w, h, 23, 0.3);
}
function drawWelcome(g, w, h) {
  g.fillStyle = 'rgba(236,226,204,0.95)'; g.font = `400 ${h * 0.72}px ${FONT.script}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('Welcome Everyone', w / 2, h * 0.55, w * 0.96);
}
// graffiti tags over the wall toward the parkway (abstract bubble and wildstyle letter shapes; no real writer's tag)
function drawGraffiti(g, w, h) {
  const R = rng(9091), PAL = [['#f4f1ea', '#1b1b1d'], ['#c9ccd2', '#20222a'], ['#e4468a', '#fff4f8'], ['#3aa0e0', '#f7f7f7'], ['#2a2a2e', '#e6e6e6'],
    ['#f1c21b', '#221a10'], ['#8fd14f', '#162012'], ['#e75b2a', '#fbe9d8'], ['#7b5cd6', '#f2f0ff']];
  const glyph = (x, y, s, fill, line) => {
    g.save(); g.translate(x, y); g.rotate((R() - 0.5) * 0.35);
    const n = 3 + (R() * 4 | 0);
    for (let k = 0; k < n; k++) {
      const gx = k * s * 0.72, gw = s * (0.5 + R() * 0.35), gh = s * (0.8 + R() * 0.5);
      g.beginPath();
      const pts = 7 + (R() * 5 | 0);
      for (let p = 0; p <= pts; p++) {
        const a = (p / pts) * Math.PI * 2, rr = 0.55 + R() * 0.45;
        const px = gx + Math.cos(a) * gw * 0.5 * rr, py = -gh * 0.5 + Math.sin(a) * gh * 0.5 * rr;
        if (p === 0) g.moveTo(px, py); else g.quadraticCurveTo(gx + Math.cos(a - 0.3) * gw * 0.62, -gh * 0.5 + Math.sin(a - 0.3) * gh * 0.62, px, py);
      }
      g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = Math.max(2, s * 0.07); g.strokeStyle = line; g.stroke();
    }
    g.restore();
  };
  for (let i = 0; i < 70; i++) {
    const [f, l] = PAL[(R() * PAL.length) | 0], s = h * (0.12 + R() * 0.28);
    glyph(R() * w, h * (0.3 + R() * 0.62), s, f, l);
  }
  // thin tags and drips
  g.lineCap = 'round';
  for (let i = 0; i < 160; i++) {
    const [f] = PAL[(R() * PAL.length) | 0]; g.strokeStyle = f; g.lineWidth = 2 + R() * 4;
    let x = R() * w, y = h * (0.2 + R() * 0.75); g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += 8 + R() * 30; y += (R() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
    if (R() < 0.4) { g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 10 + R() * 50); g.stroke(); }
  }
  weather(g, w, h, 5, 0.25);
}
// the black sign panels of Floridita (Harlem's Original Floridita, Cuban restaurant; lettering drawn here)
function drawFloridita(g, w, h) {
  g.fillStyle = '#121212'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#c8b27a'; g.lineWidth = h * 0.03; g.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1);
  // the crest: a small shield with the flag's stripes and triangle
  const cx = w * 0.12, cy = h * 0.5, r = h * 0.3;
  g.fillStyle = '#1f3f8f'; g.fillRect(cx - r * 0.7, cy - r, r * 1.4, r * 1.6);
  g.fillStyle = '#f2f2f2'; for (let i = 0; i < 2; i++) g.fillRect(cx - r * 0.7, cy - r + r * 0.32 * (2 * i + 1), r * 1.4, r * 0.32);
  g.fillStyle = '#c8262c'; g.beginPath(); g.moveTo(cx - r * 0.7, cy - r); g.lineTo(cx + r * 0.1, cy - r * 0.2); g.lineTo(cx - r * 0.7, cy + r * 0.6); g.fill();
  g.fillStyle = '#f2ead8'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `400 ${h * 0.16}px ${FONT.serif}`; g.fillText("HARLEM'S ORIGINAL", w * 0.58, h * 0.24, w * 0.7);
  g.font = `700 ${h * 0.42}px ${FONT.serif}`; g.fillText('FLORIDITA', w * 0.58, h * 0.57, w * 0.72);
  g.font = `400 ${h * 0.12}px ${FONT.sans}`; g.fillText('BAR  •  RESTAURANT  •  COCINA CUBANA', w * 0.58, h * 0.85, w * 0.72);
}
// the Dinosaur's round medallion (a yellow dinosaur silhouette on black, "HARLEM" under it; drawn here)
function drawMedallion(g, w, h) {
  const r = Math.min(w, h) * 0.48; g.fillStyle = '#141414'; g.beginPath(); g.arc(w / 2, h / 2, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#e8c23a'; g.lineWidth = r * 0.05; g.beginPath(); g.arc(w / 2, h / 2, r * 0.92, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#e8c23a'; g.save(); g.translate(w / 2, h * 0.46); const s = r * 0.5;
  g.beginPath(); g.moveTo(-s * 1.1, s * 0.45); g.quadraticCurveTo(-s * 0.6, -s * 0.2, -s * 0.1, -s * 0.1); g.quadraticCurveTo(s * 0.3, -s * 0.9, s * 0.75, -s * 0.8);
  g.quadraticCurveTo(s * 0.95, -s * 0.7, s * 0.7, -s * 0.5); g.quadraticCurveTo(s * 0.45, -s * 0.35, s * 0.4, 0); g.lineTo(s * 0.5, s * 0.55); g.lineTo(s * 0.3, s * 0.55);
  g.lineTo(s * 0.18, s * 0.2); g.lineTo(-s * 0.3, s * 0.25); g.lineTo(-s * 0.35, s * 0.55); g.lineTo(-s * 0.55, s * 0.55); g.lineTo(-s * 0.55, s * 0.3); g.closePath(); g.fill(); g.restore();
  g.font = `700 ${r * 0.24}px ${FONT.slab}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HARLEM', w / 2, h / 2 + r * 0.55);
}
// ------------------------------------------------------------------ Columbia Engineering Innovation Hub (2276 12th Avenue)
// the door's surround as the 2025-07 photograph shows it (white metal panels, the name in blue capitals with a small crown
// mark at its start, two poster cases): the lettering, the mark and the posters are drawn here from scratch (no logo file)
const HUB_BLUE = '#3478e6';   // (s3r1: '#2a63c8' read navy on the channel letters against the photograph's mid blue)
function drawCrown(g, w, h) {
  // a plain three-point crown over a band, in the name's blue (a generic mark, drawn)
  g.fillStyle = HUB_BLUE; g.strokeStyle = HUB_BLUE; g.lineJoin = 'round';
  const x0 = w * 0.12, x1 = w * 0.88, yb = h * 0.78, yt = h * 0.3;
  g.fillRect(x0, yb - h * 0.12, x1 - x0, h * 0.12);
  g.beginPath(); g.moveTo(x0, yb - h * 0.12); g.lineTo(x0, yt + h * 0.12); g.lineTo(w * 0.3, h * 0.5); g.lineTo(w * 0.5, yt); g.lineTo(w * 0.7, h * 0.5);
  g.lineTo(x1, yt + h * 0.12); g.lineTo(x1, yb - h * 0.12); g.closePath(); g.fill();
  for (const [x, y] of [[x0, yt + h * 0.06], [w * 0.5, yt - h * 0.07], [x1, yt + h * 0.06]]) { g.beginPath(); g.arc(x, y, h * 0.07, 0, Math.PI * 2); g.fill(); }
  g.fillRect(w * 0.47, yb, w * 0.06, h * 0.16); g.fillRect(w * 0.3, yb + h * 0.1, w * 0.4, h * 0.05);
}
function drawDoorNo(g, w, h) {
  g.fillStyle = HUB_BLUE; g.font = `700 ${h * 0.8}px ${FONT.mont}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('2276', w / 2, h * 0.54, w * 0.94);
}
// two research-centre posters in white cases (layouts drawn here: a title block, an illustration of shapes, a caption band)
function drawPoster(kind) {
  return (g, w, h) => {
    g.fillStyle = '#f7f7f5'; g.fillRect(0, 0, w, h);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    if (kind === 'earth') {
      g.fillStyle = '#4b5966'; g.font = `600 ${h * 0.05}px ${FONT.mont}`; g.fillText('L E A P', w * 0.3, h * 0.08);
      g.font = `500 ${h * 0.022}px ${FONT.inter}`; g.fillText('LEARNING THE EARTH', w * 0.3, h * 0.115); g.fillText('WITH DATA & PHYSICS', w * 0.3, h * 0.14);
      g.fillStyle = '#1f3550'; g.fillRect(w * 0.06, h * 0.2, w * 0.88, h * 0.035);
      // the illustration: sky, a leaf, cloud and ice shapes over sea
      const gr = g.createLinearGradient(0, h * 0.25, 0, h * 0.66); gr.addColorStop(0, '#cfdde8'); gr.addColorStop(0.55, '#7f9db8'); gr.addColorStop(1, '#2f5f7c');
      g.fillStyle = gr; g.fillRect(w * 0.06, h * 0.25, w * 0.88, h * 0.41);
      g.fillStyle = '#e8eef2'; g.beginPath(); g.moveTo(w * 0.3, h * 0.27); g.lineTo(w * 0.7, h * 0.27); g.lineTo(w * 0.5, h * 0.52); g.closePath(); g.fill();
      g.fillStyle = '#4f8a3a'; g.beginPath(); g.ellipse(w * 0.25, h * 0.4, w * 0.09, h * 0.06, -0.7, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#a9d1df'; g.beginPath(); g.moveTo(w * 0.1, h * 0.66); g.lineTo(w * 0.35, h * 0.55); g.lineTo(w * 0.6, h * 0.62); g.lineTo(w * 0.9, h * 0.56); g.lineTo(w * 0.94, h * 0.66); g.closePath(); g.fill();
      g.fillStyle = '#26323d'; g.font = `600 ${h * 0.024}px ${FONT.inter}`; g.fillText('HARNESSING DATA', w * 0.3, h * 0.72); g.fillText('TO REVOLUTIONIZE CLIMATE PROJECTIONS', w * 0.18, h * 0.75);
      g.fillStyle = '#8a9299'; for (let i = 0; i < 6; i++) g.fillRect(w * (0.1 + i * 0.14), h * 0.88, w * 0.1, h * 0.02);
    } else {
      g.fillStyle = '#3a4b5a'; g.font = `700 ${h * 0.03}px ${FONT.mont}`; g.fillText('STREETSCAPES', w * 0.4, h * 0.07);
      g.fillStyle = '#c0392b'; g.font = `500 ${h * 0.018}px ${FONT.inter}`; g.fillText('An NSF Engineering Research Center', w * 0.08, h * 0.12, w * 0.84);
      // the illustration: a street of buildings, a crosswalk, people
      g.fillStyle = '#b9c3cc'; g.fillRect(w * 0.06, h * 0.15, w * 0.88, h * 0.29);
      const B = [['#8d8f93', 0.06, 0.16], ['#a7a39b', 0.2, 0.18], ['#6f7680', 0.35, 0.15], ['#c9c3b6', 0.52, 0.17], ['#7b6f66', 0.7, 0.24]];
      for (const [c, x, ww] of B) { g.fillStyle = c; g.fillRect(w * x, h * 0.16, w * ww, h * 0.22); }
      g.fillStyle = '#55595e'; g.fillRect(w * 0.06, h * 0.38, w * 0.88, h * 0.06);
      g.fillStyle = '#eeeeea'; for (let i = 0; i < 9; i++) g.fillRect(w * (0.1 + i * 0.09), h * 0.39, w * 0.05, h * 0.04);
      for (let i = 0; i < 7; i++) { g.fillStyle = ['#d35400', '#2e86c1', '#f4d03f', '#7d3c98', '#1e8449'][i % 5]; g.fillRect(w * (0.14 + i * 0.11), h * 0.33, w * 0.025, h * 0.06); }
      g.fillStyle = '#1b2631'; g.font = `800 ${h * 0.034}px ${FONT.mont}`;
      ['INNOVATION', 'THROUGH PARTNERSHIPS', 'TO IMPROVE LIFE ON', 'THE STREETSCAPE'].forEach((t, i) => g.fillText(t, w * 0.08, h * (0.52 + i * 0.045), w * 0.84));
      g.fillStyle = '#c0392b'; g.font = `600 ${h * 0.028}px ${FONT.inter}`; g.fillText('Center For Smart Streetscapes', w * 0.08, h * 0.73, w * 0.84);
      g.fillStyle = '#8a9299'; for (let i = 0; i < 5; i++) g.fillRect(w * (0.12 + i * 0.16), h * 0.88, w * 0.12, h * 0.02);
    }
  };
}
// the lobby's back wall seen through the glass doors: pale wood, an etched glass panel with the university's name, a plant
function drawLobby(g, w, h) {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#d9cdb8'); gr.addColorStop(1, '#bfae93'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(90,70,50,0.12)'; for (let x = 0; x < w; x += w / 14) g.fillRect(x, 0, 2, h);
  g.fillStyle = 'rgba(235,240,240,0.75)'; g.fillRect(w * 0.12, h * 0.22, w * 0.76, h * 0.32);
  g.fillStyle = 'rgba(120,130,135,0.55)'; g.font = `600 ${h * 0.07}px ${FONT.serif}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('COLUMBIA', w * 0.5, h * 0.34, w * 0.7); g.font = `400 ${h * 0.035}px ${FONT.inter}`; g.fillText('ENGINEERING', w * 0.5, h * 0.44, w * 0.6);
  g.fillStyle = '#2f5d2a'; g.beginPath(); g.ellipse(w * 0.9, h * 0.6, w * 0.06, h * 0.14, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#6e5a46'; g.fillRect(w * 0.86, h * 0.72, w * 0.08, h * 0.16);
  g.fillStyle = '#3c3f44'; g.fillRect(w * 0.02, h * 0.55, w * 0.1, h * 0.33);
}

// invented billboard ads (no real brand): [bg0, bg1, headline, sub, accent, vendor]
const ADS = {
  sofa: { bg: ['#f3efe6', '#e2d9c8'], head: 'Sofas that fit your walk-up.', sub: 'Free assembly on every order', brand: 'HOLLOWAY HOME', acc: '#2f5d50', art: 'sofa' },
  tip: { bg: ['#ffffff', '#eeeeee'], head: 'SEE SOMETHING? SAY IT.', sub: 'Community tip line  1-800-555-0142', brand: 'SAFE BLOCKS NYC', acc: '#b3202a', art: 'bars' },
  coffee: { bg: ['#1d2c3a', '#0f1822'], head: 'Fresh roast on the West Side', sub: 'Open 6 am, every day', brand: 'NORTHWIND COFFEE', acc: '#e0a64a', art: 'cup', dark: true },
  radio: { bg: ['#2b1b4a', '#150d26'], head: 'Harlem sounds, all night.', sub: '98.3 FM  •  stream anywhere', brand: 'WAVE 98', acc: '#f25c9a', art: 'wave', dark: true },
  glass: { bg: ['#e6f0f5', '#c9dbe4'], head: 'Winter-ready glass, same day.', sub: 'Mobile service across Manhattan', brand: 'CROSSTOWN AUTO GLASS', acc: '#1f6fb2', art: 'bars' },
  rent: { bg: ['#f7f4ea', '#ebe4d0'], head: 'Your next office is uptown.', sub: 'Studios from 400 sq ft  •  555-0199', brand: 'MANHATTANVILLE WORKS', acc: '#c2562f', art: 'sofa' },
};
function drawAd(key) {
  const A = ADS[key];
  return (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, A.bg[0]); gr.addColorStop(1, A.bg[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const fg = A.dark ? '#f6f3ec' : '#1c1d20';
    g.fillStyle = A.acc; g.fillRect(0, h * 0.86, w, h * 0.14);
    g.fillStyle = A.dark ? '#0b0f14' : '#ffffff'; g.font = `700 ${h * 0.085}px ${FONT.inter}`; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(A.brand, w * 0.04, h * 0.93, w * 0.5);
    g.fillStyle = fg; g.font = `800 ${h * 0.14}px ${FONT.inter}`; g.fillText(A.head, w * 0.04, h * 0.3, w * 0.6);
    g.font = `500 ${h * 0.075}px ${FONT.inter}`; g.fillText(A.sub, w * 0.04, h * 0.52, w * 0.58);
    // the art on the right
    g.save(); g.translate(w * 0.8, h * 0.45); const s = h * 0.32;
    if (A.art === 'sofa') { g.fillStyle = A.acc; g.fillRect(-s * 1.1, -s * 0.2, s * 2.2, s * 0.55); g.fillRect(-s * 1.2, -s * 0.55, s * 0.3, s * 0.9); g.fillRect(s * 0.9, -s * 0.55, s * 0.3, s * 0.9); g.fillStyle = '#e9c46a'; g.fillRect(-s * 0.9, -s * 0.5, s * 0.8, s * 0.35); g.fillRect(s * 0.1, -s * 0.5, s * 0.8, s * 0.35); g.fillStyle = '#333'; g.fillRect(-s * 1.1, s * 0.35, s * 0.12, s * 0.18); g.fillRect(s * 0.98, s * 0.35, s * 0.12, s * 0.18); }
    else if (A.art === 'cup') { g.fillStyle = A.acc; g.beginPath(); g.moveTo(-s * 0.6, -s * 0.5); g.lineTo(s * 0.6, -s * 0.5); g.lineTo(s * 0.45, s * 0.6); g.lineTo(-s * 0.45, s * 0.6); g.fill(); g.strokeStyle = A.acc; g.lineWidth = s * 0.12; g.beginPath(); g.arc(s * 0.62, 0, s * 0.25, -1.2, 1.2); g.stroke(); g.strokeStyle = '#f6f3ec'; g.lineWidth = s * 0.05; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * s * 0.25, -s * 0.65); g.bezierCurveTo(i * s * 0.25 + s * 0.15, -s * 0.85, i * s * 0.25 - s * 0.15, -s * 1.0, i * s * 0.25, -s * 1.2); g.stroke(); } }
    else if (A.art === 'wave') { g.strokeStyle = A.acc; g.lineWidth = s * 0.1; for (let k = 0; k < 3; k++) { g.beginPath(); for (let x = -s * 1.2; x <= s * 1.2; x += 4) g.lineTo(x, Math.sin(x / s * 4 + k) * s * 0.3 + (k - 1) * s * 0.35); g.stroke(); } }
    else { g.fillStyle = A.acc; for (let i = 0; i < 5; i++) g.fillRect(-s + i * s * 0.45, s * 0.6 - s * (0.4 + i * 0.25), s * 0.3, s * (0.4 + i * 0.25)); }
    g.restore();
  };
}
// a floodlit billboard face: the ad by day, lit by its floodlights after dark
function adMat(key, w, h, u0, y0, flip) {
  const m = decal(w, h, u0, y0, 90, drawAd(key), { flip, rough: 0.7 });
  m.transparent = false; m.alphaTest = 0; m.depthWrite = true; m.polygonOffset = false;
  m.emissive = new THREE.Color(0xfff2dc); m.emissiveMap = m.map; nightMat(m, 0.0, 0.55, 'ad');
  return m;
}

// the corner blade's lettering: seven red capitals (B A R, B, Q U E) in a bold geometric sans inside a pale border tube,
// drawn on a transparent face (the lightbox paints the black field and lights the coverage after dark)
function barbque(g, w, h) {
  const pad = w * 0.09;
  g.lineJoin = 'round'; g.strokeStyle = 'rgba(214,226,232,0.95)'; g.lineWidth = Math.max(2, w * 0.035);
  g.beginPath(); const r = w * 0.14, x0 = pad, y0 = pad, x1 = w - pad, y1 = h - pad;
  g.moveTo(x0 + r, y0); g.lineTo(x1 - r, y0); g.quadraticCurveTo(x1, y0, x1, y0 + r); g.lineTo(x1, y1 - r); g.quadraticCurveTo(x1, y1, x1 - r, y1);
  g.lineTo(x0 + r, y1); g.quadraticCurveTo(x0, y1, x0, y1 - r); g.lineTo(x0, y0 + r); g.quadraticCurveTo(x0, y0, x0 + r, y0); g.closePath(); g.stroke();
  // w2r1: letter centres and size read off dino_corner23 (the blade 405 px tall there: letters at 0.10 .. 0.88 of it, each
  // about 0.1 of the height and 0.8 of the face's width; the b0 plate drew them at half that)
  const slots = [0.10, 0.205, 0.315, 0.48, 0.625, 0.745, 0.875];
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 ${w * 0.8}px ${FONT.mont}`;
  [...'BARBQUE'].forEach((ch, i) => {
    const y = h * slots[i];
    // w2b3: b3r2 read dark red letters in pale outlines; dino_corner23 shows the tubes lit by day, bright pink-red
    g.shadowColor = 'rgba(255,60,80,0.95)'; g.shadowBlur = w * 0.09; g.fillStyle = '#ff4d63'; g.fillText(ch, w / 2, y);
    g.shadowBlur = 0; g.lineWidth = Math.max(1, w * 0.008); g.strokeStyle = 'rgba(255,200,208,0.55)'; g.strokeText(ch, w / 2, y);
  });
}
barbque.fonts = ['Montserrat-800'];

// ------------------------------------------------------------------ neon: red tubes on a black blade (drawn here)
function neonTex(letters, w, h) {
  return drawnTex(Math.round(w * 400), Math.round(h * 400), (g, W, H) => {
    g.clearRect(0, 0, W, H);
    // the border tube (white-silver) round the blade face
    g.strokeStyle = 'rgba(230,236,240,0.95)'; g.lineWidth = W * 0.035; g.strokeRect(W * 0.07, W * 0.07, W - W * 0.14, H - W * 0.14);
    const n = letters.length, cell = (H - W * 0.3) / n;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 ${Math.min(cell * 0.92, W * 0.75)}px ${FONT.slab}`;
    letters.forEach((ch, i) => {
      if (ch === ' ') return;
      const y = W * 0.15 + cell * (i + 0.5);
      g.shadowColor = 'rgba(255,40,24,0.9)'; g.shadowBlur = W * 0.08;
      g.fillStyle = '#ff3524'; g.fillText(ch, W / 2, y);
      g.shadowBlur = 0; g.lineWidth = W * 0.018; g.strokeStyle = 'rgba(255,196,180,0.85)'; g.strokeText(ch, W / 2, y);
    });
  });
}
function neonMat(t, w, h, u0, y0, flip) {
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  if (flip) { t.repeat.set(-1 / w, 1 / h); t.offset.set((u0 + w) / w, -y0 / h); } else { t.repeat.set(1 / w, 1 / h); t.offset.set(-u0 / w, -y0 / h); }
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.kW33N = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float kW33N;')
      .replace('#include <fog_fragment>', `gl_FragColor.rgb *= mix(0.95, 1.6, kW33N);
        { float kmx = max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b)), kex = max(kmx - 1.0, 0.0);
          gl_FragColor.rgb *= mix(1.0, min(1.0, (1.0 + kex / (1.0 + kex * 1.5)) / max(kmx, 1e-4)), kW33N); }
        #include <fog_fragment>`);
  };
  m.customProgramCacheKey = () => 'w33neon';
  return m;
}

// ------------------------------------------------------------------ geometry helpers on a face kit K (u, y, w)
// a square bar of side s between two local points (the tie rods, sloped rails, bracing)
function bar(K, mat, a, b, s, o = {}) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]);
  if (L < 1e-4) return;
  const t = [d[0] / L, d[1] / L, d[2] / L];
  let r = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let p = [t[1] * r[2] - t[2] * r[1], t[2] * r[0] - t[0] * r[2], t[0] * r[1] - t[1] * r[0]];
  let pl = Math.hypot(p[0], p[1], p[2]); p = p.map((v) => (v / pl) * s * 0.5);
  let q = [t[1] * p[2] - t[2] * p[1], t[2] * p[0] - t[0] * p[2], t[0] * p[1] - t[1] * p[0]];
  const ql = Math.hypot(q[0], q[1], q[2]); q = q.map((v) => (v / ql) * s * 0.5);
  const c = (P, sp, sq) => [P[0] + p[0] * sp + q[0] * sq, P[1] + p[1] * sp + q[1] * sq, P[2] + p[2] * sp + q[2] * sq];
  const sides = [[1, 1, 1, -1], [1, -1, -1, -1], [-1, -1, -1, 1], [-1, 1, 1, 1]];
  for (const [s0, t0, s1, t1] of sides) {
    const n = [p[0] * (s0 + s1) + q[0] * (t0 + t1), p[1] * (s0 + s1) + q[1] * (t0 + t1), p[2] * (s0 + s1) + q[2] * (t0 + t1)];
    K.poly(mat, [c(a, s0, t0), c(b, s0, t0), c(b, s1, t1), c(a, s1, t1)], n, o);
  }
}
// the turn at each end of face i of the ring (the kit's edgeMitres): [m0 at u = 0, m1 at u = L]
function mitres(ring, i) {
  const n = ring.length;
  const turn = (a, b, c) => { const e1 = [b[0] - a[0], b[1] - a[1]], e2 = [c[0] - b[0], c[1] - b[1]]; return Math.atan2(e1[0] * e2[1] - e1[1] * e2[0], e1[0] * e2[0] + e1[1] * e2[1]); };
  const cl = (a) => Math.max(-3, Math.min(3, Math.tan(a / 2)));
  return [cl(turn(ring[i], ring[(i + 1) % n], ring[(i + 2) % n])), cl(turn(ring[(i - 1 + n) % n], ring[i], ring[(i + 1) % n]))];
}
// every face of the (cleaned) ring: { i, L, K, hdg (outward compass heading) }
function facesOf(frame) {
  const R = frame.ring, out = [];
  for (let i = 0; i < R.length; i++) {
    const a = R[i], b = R[(i + 1) % R.length];
    const f = frame.face([a[0], a[1], b[0], b[1]]);
    if (!f || out.some((q) => q.i === f.i)) continue;
    const N = f.kit.F.N;
    out.push({ i: f.i, L: f.L, K: f.kit, hdg: ((Math.atan2(N[0], -N[1]) * 180) / Math.PI + 360) % 360 });
  }
  return out;
}
const hdgNear = (h, t, tol = 35) => Math.abs(((h - t + 540) % 360) - 180) < tol;

// ------------------------------------------------------------------ Dinosaur Bar-B-Que
export function dino(group, ctx, spec, frame) {
  const FACES = facesOf(frame);
  const byHdg = (t) => FACES.filter((f) => hdgNear(f.hdg, t)).sort((a, b) => b.L - a.L)[0] || null;
  const NE = FACES.find((f) => f.i === frame.front) || byHdg(55), SE = byHdg(131), NW = byHdg(311), SW = byHdg(209);
  const K0 = frame.kit;
  const M = (name, tint, dirt) => K0.mat(name, { tint, dirt });
  const MAT = {
    // w2r1: the b0 plates read 1.35x too bright against the 2022-03 wall patches: the tint scaled by (0.75, 0.69, 0.66)
    brick: M('brick_red', '#5f4137', 0.6), brickIn: M('brick_red', '#53392f', 0.6),
    coping: paintMat('#232426', 0.45, 0.35), black: paintMat('#18191a', 0.5, 0.2), sill: M('concrete_precast', '#aaa498', 0.35),
    green: paintMat('#2c4a3a', 0.45, 0.2), conc: M('concrete_precast', '#9d988e', 0.45), rail: paintMat('#1b1c1d', 0.45, 0.4),
    wood: timberMat('#8a7358', 3), woodDk: timberMat('#5a4634', 7), redDoor: paintMat('#8c2a20', 0.5, 0.2),
    seam: paintMat('#7a3a25', 0.55, 0.3), rust: paintMat('#6b3a24', 0.8, 0.35), steel: paintMat('#3b3c3b', 0.55, 0.45),
    roof: M('concrete_precast', '#4a4a48', 0.5), hvac: paintMat('#b9bbb8', 0.45, 0.35), galv: M('alu_clear', '#b4b7b6', 0.3),
    timber: timberMat('#a0703f', 11), glassSF: K0.mat('glass_storefront'),
    hedge: lit(new THREE.MeshStandardMaterial({ color: 0x4d6b2f, roughness: 0.95 })),
  };
  const bulb = nightMat(lit(new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.35, emissive: 0xffc98a, emissiveIntensity: 1.0 })), 0.35, 3.2, 'bulb');
  const shade = paintMat('#e6e2d6', 0.4, 0.1);
  const FR_NE = 7.97, FR_SE = 6.95, FR_H = BH;           // the band's foot over the NE front (just over the window heads at 7.85) and over the SE wing's low windows
  const BAS_NE = basketMat(FR_NE), BAS_SE = basketMat(FR_SE);
  const Y_CT = 9.7, Y_TOP = 9.92, Y_ROOF = 9.0;
  const WIN_DH = { kind: 'dh', lights: '1/1', frame: { mat: 'alu_black', tint: '#3d6050', dirt: 0.15 }, frameW: 0.06, reveal: 0.12, lintel: null,
    sillStone: { mat: 'concrete_precast', tint: '#aaa498', h: 0.1, proj: 0.05 }, blinds: 0.3, lit: 0.6, ac: 0 };
  const WIN_SM = { ...WIN_DH, lights: '1/1', blinds: 0.15, lit: 0.4 };
  const WIN_SF = { kind: 'storefront', mullions: 2, frame: 'alu_black', frameW: 0.07, reveal: 0.1, lintel: null, sillStone: null, glass: 'glass_storefront', lit: 1.0, blinds: 0 };
  const F2 = { fy0: 5.35, fy1: Y_ROOF, wallMat: MAT.brick };
  const F1 = { fy0: 1.0, fy1: 5.2, wallMat: MAT.brick, widen: 0.2 };

  // one face: brick below the frieze with its openings, the frieze, the parapet's inside and its coping
  // spans: [{ u0, u1, fr0, BAS }]: stretches of the face with their own frieze foot (the SE face steps up at the corner block)
  const shell = (f, holes, wins, yBase = -1.6, fr0 = FR_NE, BAS = BAS_NE, spans = null) => {
    const { K, L } = f;
    for (const sp of spans || [{ u0: 0, u1: L, fr0, BAS }]) {
      const fr1 = Math.min(sp.fr0 + FR_H, Y_CT);
      K.wall({ u0: sp.u0, u1: sp.u1, y0: yBase, y1: sp.fr0, holes: holes.filter((h) => h.u0 >= sp.u0 - 1e-6 && h.u1 <= sp.u1 + 1e-6), mat: MAT.brick });
      K.poly(sp.BAS, [[sp.u0, sp.fr0, 0], [sp.u1, sp.fr0, 0], [sp.u1, fr1, 0], [sp.u0, fr1, 0]], [0, 0, 1]);
      if (Y_CT - fr1 > 0.02) K.wall({ u0: sp.u0, u1: sp.u1, y0: fr1, y1: Y_CT, holes: [], mat: MAT.brick });
    }
    const [m0, m1] = mitres(frame.ring, f.i);
    K.poly(MAT.brickIn, [[0.42 * Math.max(0, m0), Y_ROOF, -0.4], [L - 0.42 * Math.max(0, m1), Y_ROOF, -0.4], [L - 0.42 * Math.max(0, m1), Y_CT, -0.4], [0.42 * Math.max(0, m0), Y_CT, -0.4]], [0, 0, -1]);
    K.extrude(MAT.coping, [[-0.4, Y_CT - 0.05], [-0.44, Y_CT - 0.05], [-0.44, Y_TOP - 0.03], [0.055, Y_TOP], [0.055, Y_CT - 0.2], [0.0, Y_CT - 0.2]], 0, L, { m0, m1 });
    for (const w of wins) K.window(w.T, w.u0, w.u1, w.y0, w.y1, w.o);
  };
  // a pair of 1/1 double-hung sash in one opening
  const pair = (list, holes, u0, y0, y1, T = WIN_DH, o = F2, uw = 1.06) => {
    holes.push({ u0, u1: u0 + 2 * uw, y0, y1 });
    list.push({ T, u0, u1: u0 + uw, y0, y1, o }, { T, u0: u0 + uw, u1: u0 + 2 * uw, y0, y1, o });
  };
  // string lights along a canopy fascia: bulbs every 0.5 m hanging in shallow loops, 5 cm under the fascia
  const festoon = (K, u0, u1, y, w) => {
    const n = Math.max(2, Math.round((u1 - u0) / 0.5));
    for (let k = 0; k <= n; k++) {
      const u = u0 + ((u1 - u0) * k) / n, sag = 0.1 * Math.sin(((k % 3) / 3) * Math.PI);
      K.box(bulb, u - 0.03, u + 0.03, y - 0.1 - sag, y - 0.04 - sag, w - 0.03, w + 0.03, { near: true, shadow: false });
      if (k < n) K.box(MAT.black, u, u + (u1 - u0) / n, y - 0.045 - sag, y - 0.035 - sag, w - 0.006, w + 0.006, { near: true, shadow: false, c: 0 });
    }
  };
  // the Dinosaur's canopy: rust-red standing-seam roof from the wall down to a black fascia, flat soffit, string lights
  const canopy = (K, u0, u1, text, textU, m0 = 0, m1 = 0) => {
    const P = 1.65, yF0 = 4.47, yF1 = 5.0, yW = 5.7;
    // the black box (soffit, fascia) and the rust-red standing-seam slope on it, mitred at a corner end (m0 / m1)
    K.extrude(MAT.black, [[0.02, yF0], [P, yF0], [P, yF1], [0.02, yF1]], u0, u1, { m0, m1 });
    K.extrude(MAT.seam, [[0.02, yF1], [P, yF1], [P - 0.02, yF1 + 0.03], [0.02, yW]], u0, u1, { m0, m1 });
    const s0 = u0 + 0.2 + Math.max(0, -m0) * P, s1 = u1 - 0.1 - Math.max(0, -m1) * P;
    for (let u = s0; u < s1; u += 0.45) bar(K, MAT.seam, [u, yW + 0.02, 0.05], [u, yF1 + 0.045, P - 0.03], 0.035, { near: true, shadow: false });
    festoon(K, u0 + 0.2 - m0 * P * 0.9, u1 - 0.2 + m1 * P * 0.9, yF0, P - 0.05);
    if (text) K.sign({ kind: 'painted', text, font: 'RobotoSlab-700', fg: '#efe0bf', bg: null, u0: textU[0], u1: textU[1], y: yF0 + 0.1, h: 0.3, fill: 0.78 }, { z: P + 0.004 });
  };

  // the Innovation Hub's door surround on the 12th Avenue face (the 2025-07 photograph, 149 px a metre on the door's plane):
  // panels 0.1 m proud of the brick to the canopy's wall beam (3.55), joints at the photograph's columns, the name band
  // 2.72-3.69 with the letters' caps 2.99-3.25, the door 28.67-30.62 x 2.72 (two leaves, white frames, '2276' on each),
  // poster cases 1.27 x 1.88 (sill 0.75), a dark granite base 0.25 m, the card reader and the intercom; a lit lobby behind
  const hubFront = (K) => {
    const h0 = 27.4, h1 = 35.8, PZ = 0.1, yT = 3.55, d0 = 28.67, d1 = 30.62, dT = 2.72;
    const PAN = paintMat('#e6e8e7', 0.3, 0.12), JNT = paintMat('#8f9396', 0.5, 0.2), FRW = paintMat('#eef0ef', 0.35, 0.3);
    const GRAN = K0.mat('granite_black', { tint: '#2b2c2e', dirt: 0.2 });
    // the panels: the field round the door, the band over it; 12 mm joints proud of nothing (dark grooves)
    const field = [[h0, d0 - 0.06, 0.25, yT], [d1 + 0.06, h1, 0.25, yT], [d0 - 0.06, d1 + 0.06, dT + 0.06, yT]];
    for (const [a, b, y0, y1] of field) K.box(PAN, a, b, y0, y1, 0.0, PZ, { c: 0.004 });
    for (const u of [h0 + 0.9, d1 + 1.0, 32.92 + 0.26, 34.74 + 0.48]) K.box(JNT, u - 0.006, u + 0.006, 0.25, 2.72, PZ - 0.002, PZ + 0.003, { near: true, c: 0 });
    for (const u of [h0 + 1.3, 30.0, 32.4, 34.4]) K.box(JNT, u - 0.006, u + 0.006, 2.72, yT, PZ - 0.002, PZ + 0.003, { near: true, c: 0 });
    for (const y of [2.72, 3.49]) K.box(JNT, h0, h1, y - 0.006, y + 0.006, PZ - 0.002, PZ + 0.003, { near: true, c: 0 });
    K.box(GRAN, h0 - 0.02, d0, 0.0, 0.25, 0.0, PZ + 0.03, { c: 0.006 }); K.box(GRAN, d1, h1 + 0.02, 0.0, 0.25, 0.0, PZ + 0.03, { c: 0.006 });
    // the name: blue flat-cut capitals and the drawn crown mark at its start
    K.sign({ kind: 'channel', text: 'COLUMBIA ENGINEERING INNOVATION HUB', font: 'Montserrat-700', fg: HUB_BLUE, bg: null, u0: h0 + 0.62, u1: h1 - 0.1, y: 2.99, h: 0.27, lit: 'none', depth: 0.02 }, { z: PZ + 0.004 });
    K.poly(decal(0.42, 0.42, h0 + 0.12, 2.92, 400, drawCrown, { rough: 0.4 }), [[h0 + 0.12, 2.92, PZ + 0.006], [h0 + 0.54, 2.92, PZ + 0.006], [h0 + 0.54, 3.34, PZ + 0.006], [h0 + 0.12, 3.34, PZ + 0.006]], [0, 0, 1]);
    // the door: a white frame, two leaves with full glass, pull handles, the numbers on the glass
    const RD = -0.05, mid = (d0 + d1) / 2;
    for (const [a, b] of [[d0 - 0.06, d0], [d1, d1 + 0.06], [mid - 0.03, mid + 0.03]]) K.box(FRW, a, b, 0.0, dT, RD - 0.05, PZ, { c: 0.004 });
    K.box(FRW, d0 - 0.06, d1 + 0.06, dT - 0.07, dT, RD - 0.05, PZ, { c: 0.004 });
    for (const [a, b] of [[d0, mid - 0.03], [mid + 0.03, d1]]) {
      for (const [p, q, r, t] of [[a, b, 0.0, 0.16], [a, b, dT - 0.17, dT - 0.07], [a, a + 0.09, 0.0, dT - 0.07], [b - 0.09, b, 0.0, dT - 0.07]]) K.box(FRW, p, q, r, t, RD - 0.02, RD + 0.03, { c: 0.003 });
      K.box(MAT.glassSF, a + 0.09, b - 0.09, 0.16, dT - 0.17, RD - 0.004, RD + 0.002, { c: 0 });
      K.poly(decal(0.62, 0.2, a + 0.16, 1.68, 500, drawDoorNo, { rough: 0.3 }), [[a + 0.16, 1.68, RD + 0.006], [a + 0.78, 1.68, RD + 0.006], [a + 0.78, 1.88, RD + 0.006], [a + 0.16, 1.88, RD + 0.006]], [0, 0, 1]);
    }
    for (const u of [mid - 0.12, mid + 0.12]) K.box(MAT.galv, u - 0.015, u + 0.015, 0.95, 1.35, RD + 0.03, RD + 0.09, { near: true, c: 0.004 });
    // the lobby behind: a pale floor, side walls, the lit back wall with the etched panel, a ceiling light
    const LB = -2.9;
    const lt = drawnTex(512, 384, drawLobby);
    lt.wrapS = lt.wrapT = THREE.ClampToEdgeWrapping; lt.repeat.set(1 / (d1 - d0 + 0.8), 1 / 3.0); lt.offset.set(-(d0 - 0.4) / (d1 - d0 + 0.8), 0);
    const lobby = nightMat(lit(new THREE.MeshStandardMaterial({ map: lt, emissive: 0xffe2b8, roughness: 0.6 })), 0.18, 0.75, 'hubl');
    lobby.emissiveMap = lobby.map;
    K.poly(lobby, [[d0 - 0.4, 0.0, LB], [d1 + 0.4, 0.0, LB], [d1 + 0.4, 3.0, LB], [d0 - 0.4, 3.0, LB]], [0, 0, 1]);
    K.box(paintMat('#cfc9bf', 0.45, 0.05), d0 - 0.4, d1 + 0.4, -0.02, 0.0, LB, RD - 0.05, { c: 0 });
    K.box(paintMat('#eae7e1', 0.7, 0.0), d0 - 0.5, d0 - 0.4, 0.0, 3.0, LB, RD - 0.05, { c: 0 }); K.box(paintMat('#eae7e1', 0.7, 0.0), d1 + 0.4, d1 + 0.5, 0.0, 3.0, LB, RD - 0.05, { c: 0 });
    K.box(paintMat('#f2f0ec', 0.8, 0.0), d0 - 0.4, d1 + 0.4, 3.0, 3.05, LB, RD - 0.05, { c: 0 });
    K.box(bulb, mid - 0.45, mid + 0.45, 2.96, 3.0, LB + 0.6, LB + 1.4, { near: true, shadow: false });
    // the poster cases: white frames, the posters behind glass
    for (const [a, kind] of [[31.64, 'earth'], [33.44, 'streets']]) {
      const b = a + 1.27, y0 = 0.75, y1 = 2.63;
      K.box(FRW, a, b, y0, y1, PZ, PZ + 0.045, { c: 0.006 });
      K.poly(decal(b - a - 0.08, y1 - y0 - 0.08, a + 0.04, y0 + 0.04, 300, drawPoster(kind), { rough: 0.25 }), [[a + 0.04, y0 + 0.04, PZ + 0.047], [b - 0.04, y0 + 0.04, PZ + 0.047], [b - 0.04, y1 - 0.04, PZ + 0.047], [a + 0.04, y1 - 0.04, PZ + 0.047]], [0, 0, 1]);
    }
    // the card reader by the door, the intercom by the service door
    K.box(MAT.black, 30.86, 30.98, 1.17, 1.31, PZ, PZ + 0.03, { near: true, c: 0.004 });
    K.box(MAT.galv, 35.33, 35.5, 1.31, 1.61, PZ, PZ + 0.035, { near: true, c: 0.006 });
    K.box(MAT.black, 35.38, 35.45, 1.2, 1.28, PZ, PZ + 0.03, { near: true, c: 0.003 });
    // the canopy's round LED downlights over the door and the cases (the photograph: a round fixture on a beam)
    // (under the cantilever beams at u 29.42 / 32.61: a beam's centre line runs from 3.57 m at 0.1 m out to 4.65 m at 4.18 m out,
    // 0.13 m deep, so its underside is ~3.85 m up 1.4 m out)
    for (const u of [29.42, 32.61]) { K.box(MAT.steel, u - 0.17, u + 0.17, 3.78, 3.85, 1.23, 1.57, { near: true, c: 0.03 }); K.box(bulb, u - 0.13, u + 0.13, 3.765, 3.78, 1.27, 1.53, { near: true, shadow: false }); }
  };

  // ============ the 125th Street front (u from the E corner)
  if (NE) {
    const { K, L } = NE, holes = [], wins = [];
    for (let k = 0; k < 6; k++) pair(wins, holes, 2.15 + 3.87 * k, 5.8, 7.85, WIN_DH, F2, 1.1);
    // ground floor: storefront windows W1, W2 (+ its reclaimed-wood transom), the entrance recess, W3 between two grilles
    const gf = [[2.0, 5.0, 1.3, 3.3], [9.35, 12.24, 1.3, 3.4], [19.3, 22.9, 1.75, 3.5]];   // measured on dino_front10 (pitch 10)
    // AR34 w2 s3: the dining room behind (the kit's restaurant interior) instead of a pale window room (corner23 2023-09: a dark
    // wood room, lamps, a neon sign in the corner window)
    for (const [a, b, y0, y1] of gf) { holes.push({ u0: a, u1: b, y0, y1 }); if (!HUB25) wins.push({ T: WIN_SF, u0: a, u1: b, y0, y1, o: F1 }); }
    holes.push({ u0: 12.75, u1: 16.2, y0: 1.0, y1: 4.15 });
    shell(NE, holes, wins);
    if (HUB25) {
      for (const [a, b, y0, y1] of gf) K.storefront({ u0: a, u1: b, kind: 'store', glazing: { bulkhead: y0, transom: 0.55, mullions: b - a > 3 ? 3 : 2, frame: 'alu_black', frameW: 0.07 },
        door: null, interior: 'restaurant', gate: null, lit: 1 }, y1, { wallMat: MAT.brick });   // (the reveals in the building's measured brick: the spec's wall tint read orange in s3r3's ne23)
      // white glazed tile under the corner window over a black base line (corner23: x 1100-1330, y 730-780)
      K.box(K0.mat('tile_white_glazed', { tint: '#ecebe6', dirt: 0.25 }), 2.0, 5.0, 0.35, 1.3, -0.01, 0.025, { c: 0.004 });
      K.box(MAT.black, 2.0, 5.0, 0.2, 0.35, -0.01, 0.03, { c: 0.004 });
    }
    // the wood transom boards over W2 and W3
    K.box(MAT.wood, 9.25, 12.34, 3.4, 4.25, -0.02, 0.04);
    K.box(MAT.wood, 19.2, 23.0, 3.5, 4.25, -0.02, 0.04);
    K.box(MAT.black, 19.1, 23.1, 1.0, 1.75, -0.01, 0.04, { c: 0.008 });          // the black-painted riser under W3
    // the iron grilles either side of W3
    for (const [a, b] of [[18.25, 19.2], [22.95, 23.95]]) {
      // an open iron grid in its frame over the brick (dino_ne23 / elev/dino_ne_ShDN22: the brick shows through its
      // squares; the b0-r2 plates drew a solid black panel that read as a shutter)
      for (const [p, q, r, t] of [[a, b, 1.55, 1.62], [a, b, 3.53, 3.6], [a, a + 0.07, 1.55, 3.6], [b - 0.07, b, 1.55, 3.6]]) K.box(MAT.rail, p, q, r, t, 0.0, 0.06, { c: 0.004 });
      for (let y = 1.78; y < 3.5; y += 0.16) K.box(MAT.rail, a + 0.05, b - 0.05, y, y + 0.022, 0.02, 0.05, { near: true, c: 0 });
      for (let u = a + 0.16; u < b - 0.1; u += 0.16) K.box(MAT.rail, u - 0.011, u + 0.011, 1.6, 3.55, 0.02, 0.05, { near: true, c: 0 });
    }
    // the entrance recess: wood-clad jambs, soffit and back wall, the double doors, a glass side door, the red transom
    const RD = -1.2;
    K.box(MAT.wood, 12.75, 12.81, 1.0, 4.15, RD, 0, { c: 0 }); K.box(MAT.wood, 16.14, 16.2, 1.0, 4.15, RD, 0, { c: 0 });
    K.box(MAT.wood, 12.75, 16.2, 4.09, 4.15, RD, 0, { c: 0 });
    K.wall({ u0: 12.75, u1: 16.2, y0: 1.0, y1: 4.15, w: RD, mat: MAT.wood, holes: [{ u0: 12.72, u1: 13.62, y0: 1.0, y1: 3.4 }, { u0: 13.85, u1: 15.95, y0: 1.0, y1: 4.05 }] });
    K.window({ ...WIN_SF, mullions: 0, reveal: 0.04 }, 12.72, 13.62, 1.0, 3.4, { fy0: 1.0, fy1: 4.4, wallMat: MAT.wood, widen: 0.1 });
    for (const [a, b] of [[13.85, 14.9], [14.9, 15.95]]) {
      K.box(MAT.woodDk, a + 0.01, b - 0.01, 1.0, 3.55, RD - 0.06, RD - 0.01);
      K.box(MAT.glassSF, a + 0.16, b - 0.16, 2.05, 3.3, RD - 0.005, RD + 0.0, { c: 0 });
      K.box(MAT.galv, a + 0.12, b - 0.12, 1.95, 2.0, RD, RD + 0.06, { near: true, c: 0.004 });
    }
    K.window({ kind: 'fixed', mullions: 5, frame: { mat: 'alu_black', tint: '#7a2419' }, frameW: 0.05, reveal: 0.03, lintel: null, sillStone: null, glass: 'glass_storefront', lit: 1 }, 13.85, 15.95, 3.58, 4.05, { fy0: 1.0, fy1: 4.4, wallMat: MAT.wood, widen: 0.1 });
    K.poly(decal(2.6, 0.32, 13.5, 4.08, 300, drawWelcome), [[13.5, 4.08, RD + 0.006], [16.1, 4.08, RD + 0.006], [16.1, 4.4, RD + 0.006], [13.5, 4.4, RD + 0.006]], [0, 0, 1]);
    for (const u of [13.3, 15.5]) {
      K.box(MAT.black, u - 0.01, u + 0.01, 3.95, 4.39, -0.61, -0.59, { near: true, c: 0 });
      K.box(shade, u - 0.2, u + 0.2, 3.82, 3.95, -0.8, -0.4, { near: true, c: 0.02 });
      K.box(bulb, u - 0.06, u + 0.06, 3.76, 3.82, -0.66, -0.54, { near: true, shadow: false });
    }
    // the raised floor: ramp from the corner end up to the landing, the landing, the steps, the railing
    const rise = 1.0, rw = 1.75, r0 = 0.9, r1 = 12.45, lz1 = 17.25;
    K.poly(MAT.conc, [[r0, 0.02, 0], [r1, rise, 0], [r1, rise, rw], [r0, 0.02, rw]], [0, 1, 0]);
    K.poly(MAT.conc, [[r0, -0.2, rw], [r1, -0.2, rw], [r1, rise, rw], [r0, 0.02, rw]], [0, 0, 1]);
    K.box(MAT.conc, r1, lz1, -0.2, rise, RD, rw, { c: 0.015 });
    for (let j = 0; j < 3; j++) K.box(MAT.conc, 13.05, 17.1, -0.2, rise - 0.25 * (j + 1), rw + 0.3 * j, rw + 0.3 * (j + 1), { c: 0.012 });
    const ry = (u) => 0.02 + ((Math.min(Math.max(u, r0), r1) - r0) / (r1 - r0)) * (rise - 0.02);
    const rwR = rw - 0.07;
    bar(K, MAT.rail, [r0 + 0.05, ry(r0) + 1.0, rwR], [13.05, rise + 1.0, rwR], 0.045);
    bar(K, MAT.rail, [r0 + 0.05, ry(r0) + 0.12, rwR], [13.05, rise + 0.12, rwR], 0.03);
    bar(K, MAT.rail, [r0 + 0.05, ry(r0) + 0.42, rwR], [13.05, rise + 0.42, rwR], 0.02);
    for (let u = r0 + 0.05; u <= 13.06; u += 1.45) K.box(MAT.rail, u - 0.025, u + 0.025, ry(u), ry(u) + 1.0, rwR - 0.025, rwR + 0.025, { c: 0.004 });
    for (let u = r0 + 0.17; u < 13.0; u += 0.13) K.box(MAT.rail, u - 0.008, u + 0.008, ry(u) + 0.42, ry(u) + 1.0, rwR - 0.008, rwR + 0.008, { near: true, c: 0 });
    for (let u = r0 + 0.2; u < 13.0; u += 0.26) bar(K, MAT.rail, [u, ry(u) + 0.14, rwR], [u + 0.13, ry(u + 0.13) + 0.4, rwR], 0.012, { near: true });
    for (const u of [13.0, 17.15]) bar(K, MAT.rail, [u, rise + 0.95, rw - 0.05], [u, 0.95, rw + 0.95], 0.04);
    for (const u of [13.0, 17.15]) K.box(MAT.rail, u - 0.025, u + 0.025, 0, 0.95, rw + 0.92, rw + 0.97, { c: 0.004 });
    K.box(MAT.rail, 17.2, 17.25, rise, rise + 1.0, 0.1, rw, { c: 0.004 });
    bar(K, MAT.rail, [17.22, rise + 1.0, 0.05], [17.22, rise + 1.0, rw], 0.045);
    // the painted wall signs
    // ghost signs: the b0 plate drew them crisp white; in dino_ne23 / elev/dino_ne_ShDN22 they are worn to a pale wash
    // w2b3: b3r3 (dino_ne23, levelled) still read the two ghost signs as bold cream lettering: washed further
    K.poly(decal(3.1, 2.7, 5.9, 1.3, 260, drawBBQEntrance, { opacity: 0.24 }), [[5.9, 1.3, 0.004], [9.0, 1.3, 0.004], [9.0, 4.0, 0.004], [5.9, 4.0, 0.004]], [0, 0, 1]);
    K.poly(decal(2.6, 2.45, 16.5, 1.4, 260, drawColdBeer, { opacity: 0.3 }), [[16.5, 1.4, 0.004], [19.1, 1.4, 0.004], [19.1, 3.85, 0.004], [16.5, 3.85, 0.004]], [0, 0, 1]);
    // the canopy over the corner two-thirds, "700 W. 125th St." over the entrance; tie rods to the anchor plates
    canopy(K, 0.0, 17.95, '700 W. 125th St.', [11.9, 16.6], mitres(frame.ring, NE.i)[0], 0);
    // AR34 w2 s3: corner23 (6v5n2jSZ 2023-09) reads 'DINOSAUR BAR-B-QUE' with rule marks over the corner bay on this side
    if (HUB25) K.sign({ kind: 'painted', text: '\u2014 DINOSAUR BAR-B-QUE \u2014', font: 'RobotoSlab-700', fg: '#efe0bf', bg: null, u0: 0.7, u1: 5.4, y: 4.57, h: 0.3, fill: 0.86 }, { z: 1.65 + 0.004 });
    for (const u of [1.1, 5.19, 9.06, 12.93, 16.8]) {       // tie rods from the fascia to bolted plates on the wall between the window pairs
      bar(K, MAT.steel, [u, 5.0, 1.6], [u, 6.9, 0.02], 0.028, { near: true });
      K.box(MAT.steel, u - 0.11, u + 0.11, 6.8, 7.0, 0.0, 0.025, { near: true, c: 0.004 });
    }
    // fire department connection and a standpipe sign by the right pier
    K.box(MAT.galv, 19.15, 19.45, 0.75, 0.95, 0, 0.18, { near: true, c: 0.02 });
  }

  // ============ the SE face (u from its SW end to the E corner)
  if (SE) {
    const { K, L } = SE, holes = [], wins = [];
    // the dock wing's second-floor windows (dino_se10, 2022-03): low wide lights, sill 6.0, head 6.83 over the plaza, then
    // the corner block's tall windows (sill 5.8, head 7.85 as on the NE front) from u 39.5
    const swin = (c, w, y0, y1, mull) => {
      const a = c - w / 2, b = c + w / 2;
      holes.push({ u0: a, u1: b, y0, y1 });
      wins.push({ T: { ...WIN_SM, kind: 'fixed', mullions: mull, lit: 0.35 }, u0: a, u1: b, y0, y1, o: F2 });
    };
    // (AR34 w2 s3: the second floor here is the Innovation Hub (Columbia Engineering, rooms 202 / 206 and offices): the low
    // lights as offices, most lit after dark, roller shades half down in a share)
    const swinH = (c, w, y0, y1, mull) => {
      const a = c - w / 2, b = c + w / 2;
      holes.push({ u0: a, u1: b, y0, y1 });
      wins.push({ T: { ...WIN_SM, kind: 'fixed', mullions: mull, lit: 0.8, blinds: 0.55 }, u0: a, u1: b, y0, y1, o: F2 });
    };
    const sw2 = HUB25 ? swinH : swin;
    for (const c of [8.0, 12.7, 17.6, 22.3, 27.2]) sw2(c, 2.05, 6.0, 6.83, 1);
    for (const [c, w] of [[31.5, 1.3], [36.0, 1.25], [38.1, 1.2]]) sw2(c, w, 6.0, 6.83, 0);
    pair(wins, holes, 40.7, 5.8, 7.85, WIN_DH, F2, 1.0);
    holes.push({ u0: 44.95, u1: 46.2, y0: 5.8, y1: 7.85 }); wins.push({ T: WIN_DH, u0: 44.95, u1: 46.2, y0: 5.8, y1: 7.85, o: F2 });
    // ground floor openings: doors and the Floridita fronts under the dock canopy, the Dinosaur's windows under its own
    // AR34 w2 s3: the 2025-07 photograph of the Innovation Hub's door (Columbia Engineering, 2276 12th Avenue: this building's
    // second floor) shows white metal panels from about u 27.4 to 35.8 under the dock canopy, in place of a12_22b's (2022-03)
    // red doors, glass door and posters on the brick: a glass double door (u 28.67-30.62, the head at 2.72), two poster cases,
    // a card reader and an intercom, a recessed grey service door at the right (35.85-36.9); `?w33hub=0` = the 2022 face
    const doors = HUB25 ? [[0.9, 2.0, '#232323'], [24.4, 25.7, '#8c2a20'], [35.85, 36.9, '#62666a']]
      : [[0.9, 2.0, '#232323'], [24.4, 25.7, '#8c2a20'], [32.6, 33.7, '#8c2a20'], [33.9, 35.0, '#8c2a20'], [35.4, 36.5, '#2a211b']];
    for (const [a, b] of doors) holes.push({ u0: a, u1: b, y0: -0.05, y1: 2.3 });
    if (HUB25) holes.push({ u0: 28.67, u1: 30.62, y0: -0.05, y1: 2.72 });
    const sf = HUB25 ? [[11.6, 14.8, 0.35, 2.45], [16.5, 18.4, -0.05, 2.45]] : [[11.6, 14.8, 0.35, 2.45], [16.5, 18.4, -0.05, 2.45], [27.2, 28.6, -0.05, 2.5]];
    // the Dinosaur's dining room windows at the corner end: storefront bays with the kit's restaurant interior (the b3 plates'
    // window rooms read as pale lit boxes after dark: FILM's t7DinoGlide f107)
    const dine = [[L - 9.2, L - 5.4, 0.9, 3.6], [L - 5.0, L - 1.2, 0.9, 3.6]];
    if (!HUB25) sf.push(...dine);
    for (const [a, b, y0, y1] of sf) { holes.push({ u0: a, u1: b, y0, y1 }); wins.push({ T: { ...WIN_SF, mullions: b - a > 2 ? 2 : 1 }, u0: a, u1: b, y0, y1, o: F1 }); }
    if (HUB25) for (const [a, b, y0, y1] of dine) holes.push({ u0: a, u1: b, y0, y1 });
    shell(SE, holes, wins, -1.6, FR_SE, BAS_SE, [{ u0: 0, u1: 39.3, fr0: FR_SE, BAS: BAS_SE }, { u0: 39.3, u1: L, fr0: FR_NE, BAS: BAS_NE }]);
    if (HUB25) {
      for (const [a, b, y0, y1] of dine) K.storefront({ u0: a, u1: b, kind: 'store', glazing: { bulkhead: y0, transom: 0.62, mullions: 2, frame: 'alu_black', frameW: 0.07 },
        door: null, interior: 'restaurant', gate: null, lit: 1 }, y1, { wallMat: MAT.brick });   // (the reveals in the building's measured brick: the spec's wall tint read orange in s3r3's ne23)
      hubFront(K);
    }
    for (const [a, b, col] of doors) {
      const dm = paintMat(col, 0.5, 0.25);
      K.box(dm, a, b, -0.05, 2.3, -0.12, -0.07);
      K.box(MAT.steel, a - 0.05, b + 0.05, 2.3, 2.38, -0.08, 0.0, { c: 0.004 });
      K.box(MAT.galv, b - 0.2, b - 0.12, 1.0, 1.08, -0.07, -0.02, { near: true, c: 0.003 });
    }
    if (HUB25) {
      // soot and grime on the brick under the dock canopy (hub22 2022-03: the wall under the canopy reads darker, streaked
      // down from the canopy's wall beam, a dark splash band at the foot)
      const soot = (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(18,14,12,0.55)'); gr.addColorStop(0.35, 'rgba(18,14,12,0.22)'); gr.addColorStop(0.8, 'rgba(18,14,12,0.12)'); gr.addColorStop(1, 'rgba(10,8,6,0.4)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        const R = rng(613);
        for (let i = 0; i < w * 0.05; i++) { const x = R() * w, l = h * (0.1 + R() * 0.5); g.fillStyle = `rgba(12,10,8,${0.08 + R() * 0.18})`; g.fillRect(x, 0, 1 + R() * 3, l); }
      };
      // (one material over the whole span, drawn only on the wall between the openings: no film in front of a door or a window)
      const sm = decal(35.3, 3.6, 0.6, 0.0, 40, soot, { rough: 0.95 });
      const cuts = holes.filter((h) => h.y0 < 3.6 && h.u1 > 0.6 && h.u0 < 35.9).sort((a, b) => a.u0 - b.u0);
      const sq = (a, b, y0, y1) => { if (b - a > 0.02 && y1 - y0 > 0.02) K.poly(sm, [[a, y0, 0.005], [b, y0, 0.005], [b, y1, 0.005], [a, y1, 0.005]], [0, 0, 1]); };
      let cu = 0.6;
      for (const h of cuts) { sq(cu, Math.min(h.u0, 35.9), 0.0, 3.6); sq(Math.max(h.u0, cu), Math.min(h.u1, 35.9), 0.0, Math.max(0, h.y0)); sq(Math.max(h.u0, cu), Math.min(h.u1, 35.9), Math.min(3.6, h.y1), 3.6); cu = Math.max(cu, h.u1); }
      sq(cu, 35.9, 0.0, 3.6);
      // the restaurant's grey waste carts left of the red door under the canopy (hub22: four carts, lids down)
      const CART = paintMat('#7d8183', 0.6, 0.05), LID = paintMat('#5d6164', 0.5, 0.05), WH = paintMat('#1c1c1c', 0.8, 0.0);
      for (const u of [19.2, 20.75, 22.3]) {
        K.box(CART, u, u + 1.35, 0.18, 1.25, 0.35, 1.55, { near: true, c: 0.04 });
        K.box(LID, u - 0.03, u + 1.38, 1.25, 1.32, 0.3, 1.6, { near: true, c: 0.02 });
        for (const du of [0.12, 1.15]) for (const w of [0.45, 1.45]) K.box(WH, u + du, u + du + 0.08, 0.0, 0.18, w - 0.08, w + 0.08, { near: true, c: 0.02 });
      }
    }
    // Floridita's sign panels over its two fronts, the Dinosaur's medallion by its side door
    K.poly(decal(3.2, 0.68, 11.6, 2.62, 200, drawFloridita, { rough: 0.5 }), [[11.6, 2.62, 0.03], [14.8, 2.62, 0.03], [14.8, 3.3, 0.03], [11.6, 3.3, 0.03]], [0, 0, 1]);
    K.box(MAT.black, 11.55, 14.85, 2.59, 3.33, 0.0, 0.025);
    K.poly(decal(1.9, 0.5, 16.5, 2.6, 200, drawFloridita, { rough: 0.5 }), [[16.5, 2.6, 0.03], [18.4, 2.6, 0.03], [18.4, 3.1, 0.03], [16.5, 3.1, 0.03]], [0, 0, 1]);
    K.box(MAT.black, 16.45, 18.45, 2.57, 3.13, 0.0, 0.025);
    K.poly(decal(0.9, 0.9, 37.0, 1.4, 300, drawMedallion, { rough: 0.5 }), [[37.0, 1.4, 0.035], [37.9, 1.4, 0.035], [37.9, 2.3, 0.035], [37.0, 2.3, 0.035]], [0, 0, 1]);
    K.box(MAT.black, 37.02, 37.88, 1.42, 2.28, 0, 0.03, { c: 0.02 });
    // the loading dock canopy: cantilevered riveted steel beams on tie rods, corrugated roof, rusted fascia channel
    // (AR34 w2 s3: hub22 (xHR4YEJ7 2022-03, levelled, the lens at the index position and ALT 2.9) has the fascia's middle at
    // 17.4 deg up at the centre column (rows 300-335 of 900) where the 4.35 m edge rendered at ~12.5 deg (s3r1): the outer edge
    // ~4.7 m; the wall line stays 3.65 (the 2025-07 photograph: the panel wall's top 3.69 m under the wall beam). s3r3 tried
    // 5.3 m (an eyeballed row): 25.7 deg, too high)
    const d0 = 0.6, d1 = 35.9, P = 4.3, yW = 3.65, yO = HUB25 ? 4.7 : 4.35;
    const CM = corrMat();
    K.poly(CM, [[d0, yW + 0.12, 0.0], [d1, yW + 0.12, 0.0], [d1, yO + 0.12, P], [d0, yO + 0.12, P]], [0, P, -(yO - yW)]);
    K.poly(CM, [[d0, yW + 0.1, 0.0], [d1, yW + 0.1, 0.0], [d1, yO + 0.1, P], [d0, yO + 0.1, P]], [0, -P, yO - yW]);
    // the fascia channel: old pale paint gone to rust in patches (dino_se22; the r3 plate's rust-red read orange in the sun)
    // (AR34 w2 s3: pale grey-green paint with rust in patches in hub22 / stc23: '#8a8273' read khaki in s3r1)
    // (s3r4 at 1:1: the flat paint read clean; hub22's channel is chipped to rust in patches: the kit's painted steel with chips)
    K.box(HUB25 ? K0.mat('metal_painted', { tint: '#98a09b', dirt: 0.7 }) : paintMat('#8a8273', 0.75, 0.3), d0, d1, yO - 0.2, yO + 0.16, P - 0.14, P, { c: 0.006 });
    K.box(MAT.steel, d0, d1, yW - 0.2, yW + 0.1, 0.0, 0.16, { c: 0.006 });
    const nb = Math.round((d1 - d0) / 3.25);
    for (let k = 0; k <= nb; k++) {
      const u = d0 + 0.1 + ((d1 - d0 - 0.2) * k) / nb;
      bar(K, MAT.steel, [u, yW - 0.08, 0.1], [u, yO - 0.05, P - 0.12], 0.13);
      bar(K, MAT.steel, [u, yW - 0.2, 0.1], [u, yO - 0.17, P - 0.12], 0.06, { near: true });
      bar(K, MAT.steel, [u, yO + 0.14, P - 0.2], [u, 7.55, 0.02], 0.03);
      K.box(MAT.steel, u - 0.1, u + 0.1, 7.45, 7.65, 0, 0.025, { near: true, c: 0.004 });
    }
    for (let w = 1.1; w < P - 0.2; w += 1.05) { const y = yW + ((yO - yW) * w) / P; K.box(MAT.steel, d0, d1, y - 0.1, y + 0.02, w - 0.04, w + 0.04, { near: true, c: 0.004 }); }
    for (let u = d0 + 3.2; u < d1 - 1; u += 6.4) {
      K.box(shade, u - 0.18, u + 0.18, 3.25, 3.35, 1.7, 2.06, { near: true, c: 0.02 });
      K.box(bulb, u - 0.06, u + 0.06, 3.2, 3.25, 1.82, 1.94, { near: true, shadow: false });
      K.box(MAT.black, u - 0.008, u + 0.008, 3.35, yW + 0.1 + ((yO - yW) * 1.88) / P, 1.87, 1.89, { near: true, c: 0 });   // the cord up to the soffit
    }
    // the Dinosaur's own canopy "DINOSAUR BAR-B-QUE" to the corner, and the outdoor seating's timber rail
    // (AR34 w2 s3: on this side the fascia next to the corner reads '700 W. 125th St.' (corner23 2023-09 h230 / h250))
    canopy(K, 36.2, L, HUB25 ? '700 W. 125th St.' : 'DINOSAUR BAR-B-QUE', HUB25 ? [L - 4.2, L - 0.9] : [38.9, 46.1], 0, mitres(frame.ring, SE.i)[1]);
    // the restaurant's timber dining shed at the curb (2022-03; a pergola in 2023-09): posts, low boarded walls, glazing, a clear roof
    // w2b3: dino_corner23 (2023-09) shows the shed's timber a weathered brown and a white roof, no glass in the upper part
    { const a = 36.6, b = 43.2, w0 = 6.9, w1 = 9.2, T = timberMat('#86593a', 12), RW = paintMat('#e3e1da', 0.6, 0.05);
      K.box(T, a, b, 0, 0.95, w1 - 0.08, w1, { c: 0.01 }); K.box(T, a, a + 0.08, 0, 0.95, w0, w1, { c: 0.01 }); K.box(T, b - 0.08, b, 0, 0.95, w0, w1, { c: 0.01 });
      for (let u = a; u <= b + 0.01; u += (b - a) / 6) for (const w of [w0 + 0.05, w1 - 0.05]) K.box(T, u - 0.06, u + 0.06, 0, 2.55, w - 0.06, w + 0.06, { c: 0.008 });
      K.box(T, a - 0.1, b + 0.1, 2.5, 2.62, w0 - 0.1, w1 + 0.1, { c: 0.01 });
      K.poly(RW, [[a - 0.15, 2.62, w1 + 0.15], [b + 0.15, 2.62, w1 + 0.15], [b + 0.15, 2.95, w0 - 0.15], [a - 0.15, 2.95, w0 - 0.15]], [0, 1, 0.14]);
      K.poly(RW, [[a - 0.15, 2.6, w1 + 0.15], [b + 0.15, 2.6, w1 + 0.15], [b + 0.15, 2.93, w0 - 0.15], [a - 0.15, 2.93, w0 - 0.15]], [0, -1, -0.14]); }
    const tw = 2.5;
    for (let u = 37.4; u <= L - 0.4; u += 1.8) K.box(MAT.timber, u - 0.05, u + 0.05, 0, 1.05, tw - 0.05, tw + 0.05, { c: 0.008 });
    for (const [y0, y1] of [[0.25, 0.4], [0.55, 0.7], [0.85, 1.0]]) K.box(MAT.timber, 37.3, L - 0.3, y0, y1, tw - 0.03, tw + 0.03, { c: 0.006 });
    K.box(MAT.timber, 37.3, L - 0.3, 1.0, 1.22, tw - 0.18, tw + 0.18, { c: 0.01 });
    K.box(MAT.hedge, 37.4, L - 0.4, 1.22, 1.42, tw - 0.14, tw + 0.14, { c: 0.05 });
    if (HUB25) {
      // corner23 (2023-09): picnic tables with plum tops between the wall and the rail, petunias in the rail's boxes, a menu
      // board on an A-frame by the rail's end
      const PT = paintMat('#4b2b4d', 0.55, 0.05), TW = timberMat('#8a6a4a', 21), R = rng(4401);
      for (const u of [38.6, 40.9, 43.2]) {
        K.box(PT, u - 0.9, u + 0.9, 0.72, 0.76, 0.75, 1.55, { near: true, c: 0.01 });
        for (const w of [0.42, 1.88]) K.box(PT, u - 0.9, u + 0.9, 0.43, 0.47, w - 0.14, w + 0.14, { near: true, c: 0.008 });
        for (const du of [-0.7, 0.7]) for (const w of [0.6, 1.7]) K.box(TW, u + du - 0.04, u + du + 0.04, 0.0, 0.72, w - 0.04, w + 0.04, { near: true, c: 0.004 });
      }
      for (let u = 37.6; u < L - 0.6; u += 0.32) {
        const c = ['#d23a6e', '#e85d8a', '#b31f4a', '#f2f0f0', '#8c3fb0'][Math.floor(R() * 5)];
        K.box(paintMat(c, 0.7, 0.0), u - 0.12, u + 0.12, 1.4, 1.52 + R() * 0.08, tw - 0.12, tw + 0.12, { near: true, shadow: false, c: 0.03 });
      }
      const ab = paintMat('#1d1d1e', 0.6, 0.05);
      K.poly(ab, [[L - 0.2, 0.0, tw + 0.6], [L - 0.2, 1.05, tw + 0.85], [L - 0.85, 1.05, tw + 0.85], [L - 0.85, 0.0, tw + 0.6]], [0, 0.24, 1]);
      K.poly(ab, [[L - 0.85, 0.0, tw + 1.1], [L - 0.85, 1.05, tw + 0.85], [L - 0.2, 1.05, tw + 0.85], [L - 0.2, 0.0, tw + 1.1]], [0, 0.24, -1]);
    }
    // the red neon blade at the E corner (dino_blade_23, dino_corner10): a black cabinet 0.3 m thick, 0.68 m wide, flush with the
    // parapet top, 'B A R   B   Q U E' in red neon capitals on both faces inside a pale tube border. SIGN's lightbox with
    // the mark drawn by barbque(); the old canvas neon stays as the fallback until fk/signKit.js is in.
    const bu0 = L - 0.36, bu1 = L - 0.06, bw0 = 0.12, bw1 = 0.8, by0 = 5.9, by1 = 9.62;
    if (SIGNK && SIGNK.buildSign) {
      const W = bw1 - bw0, H = by1 - by0, dd = (bu1 - bu0) / 2;
      // w2b3: SIGNS' matte face (the black field read teal in the sky's reflection) and a stronger day glow (dino_corner23:
      // the tubes are on by day, the letters read bright red-pink)
      const sg = { kind: 'lightbox', logoAt: 'fill', logo: barbque, bg: '#0b0b0c', frame: '#141516', u0: 0, u1: W, h: H, depth: dd, lit: 'face', blockout: true, temp: 4200, dayGlow: 0.85, matte: true };
      // each face a proper turn (w2r1: both were reflections, so the b0 plates read the letters mirrored): the face toward
      // +u runs its text from the blade's outer edge (bw1) to the wall, the face toward -u from the wall out
      const face = (flip) => {
        const o = SIGNK.buildSign(sg, { logo: barbque, seed: flip ? 7 : 3 });
        const P = new THREE.Matrix4();
        if (!flip) P.set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1); else P.set(0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
        const M0 = flip ? K.matrix(bu0 + dd, by0, bw0) : K.matrix(bu1 - dd, by0, bw1);
        o.applyMatrix4(M0.multiply(P));
        K.add(o);
      };
      face(false); face(true);
      K.box(MAT.steel, bu0 + 0.08, bu1 - 0.08, by0 + 0.3, by0 + 0.4, 0.0, bw0, { c: 0.004 });
      K.box(MAT.steel, bu0 + 0.08, bu1 - 0.08, by1 - 0.4, by1 - 0.3, 0.0, bw0, { c: 0.004 });
    } else {
      K.box(MAT.black, bu0, bu1, by0, by1, bw0, bw1, { c: 0.01 });
      K.box(MAT.steel, bu0 + 0.08, bu1 - 0.08, by0 + 0.3, by0 + 0.4, 0.0, bw0, { c: 0.004 });
      K.box(MAT.steel, bu0 + 0.08, bu1 - 0.08, by1 - 0.4, by1 - 0.3, 0.0, bw0, { c: 0.004 });
      const nt = neonTex(['B', 'A', 'R', ' ', 'B', 'Q', 'U', 'E'], bw1 - bw0, by1 - by0);
      const nm = neonMat(nt, bw1 - bw0, by1 - by0, -bw1, by0, false);
      K.poly(nm, [[bu1 + 0.004, by0, bw1], [bu1 + 0.004, by0, bw0], [bu1 + 0.004, by1, bw0], [bu1 + 0.004, by1, bw1]], [1, 0, 0]);
      const nt2 = neonTex(['B', 'A', 'R', ' ', 'B', 'Q', 'U', 'E'], bw1 - bw0, by1 - by0);
      const nm2 = neonMat(nt2, bw1 - bw0, by1 - by0, bw0, by0, false);
      K.poly(nm2, [[bu0 - 0.004, by0, bw0], [bu0 - 0.004, by0, bw1], [bu0 - 0.004, by1, bw1], [bu0 - 0.004, by1, bw0]], [-1, 0, 0]);
    }
    // the stair and elevator bulkhead behind the parapet near the E end (brick, a louvre, a flat top)
    const q0 = L - 12.5, q1 = L - 7.2;
    K.box(MAT.brick, q0, q1, Y_ROOF - 0.1, 12.6, -5.4, -1.2, { c: 0.01 });
    K.box(MAT.coping, q0 - 0.05, q1 + 0.05, 12.6, 12.72, -5.45, -1.15, { c: 0.01 });
    K.box(MAT.galv, q0 + 1.6, q0 + 2.6, 10.9, 11.8, -1.2, -1.14, { c: 0.004 });
    for (let y = 10.95; y < 11.78; y += 0.09) K.box(MAT.steel, q0 + 1.62, q0 + 2.58, y, y + 0.02, -1.14, -1.1, { near: true, c: 0 });
  }

  // ============ the NW face toward the rail cut and the parkway: small barred windows, graffiti
  if (NW) {
    // w2r1, from dino_nwdeck26 (6mviAemy 2026-08, 27.4 m out on the parkway deck): the windows are the second floor's (about
    // 1.0 m wide, heads ~2 m under the coping, as tall as the front's), a pitch of ~3.1 m, dark behind vertical bars; the
    // whole wall is painted: silver and white throw-ups with black outlines, a few pink, yellow and turquoise ones, tags,
    // from the bars up to the coping
    const { K, L } = NW, holes = [], wins = [];
    // (AR34 w2 s3: deck26a / deck26c (2026-08) show the openings dark behind their bars, no glass catching the sky: the
    // s3r1 plate's glazed windows read as pale panels; now a dark recess behind the bars)
    for (let k = 0; k < 19; k++) { const u0 = 1.6 + 3.1 * k; if (u0 + 1.0 > L - 0.8) break; holes.push({ u0, u1: u0 + 1.0, y0: 6.0, y1: 7.85 }); if (!HUB25) wins.push({ T: { ...WIN_SM, kind: 'fixed', mullions: 0, lit: 0.15, blinds: 0 }, u0, u1: u0 + 1.0, y0: 6.0, y1: 7.85, o: F2 }); }
    shell(NW, holes, wins, -4.0);
    if (HUB25) {
      const dk = paintMat('#141414', 0.9, 0.0), rv = MAT.brickIn;
      for (const h of holes) {
        K.box(dk, h.u0, h.u1, h.y0, h.y1, -0.34, -0.3, { c: 0 });
        K.box(rv, h.u0 - 0.02, h.u0, h.y0, h.y1, -0.32, 0.0, { c: 0 }); K.box(rv, h.u1, h.u1 + 0.02, h.y0, h.y1, -0.32, 0.0, { c: 0 });
        K.box(rv, h.u0, h.u1, h.y1, h.y1 + 0.02, -0.32, 0.0, { c: 0 }); K.box(MAT.sill, h.u0 - 0.05, h.u1 + 0.05, h.y0 - 0.08, h.y0, -0.32, 0.05, { c: 0.004 });
      }
    }
    for (const h of holes) for (let u = h.u0 + 0.1; u < h.u1 - 0.05; u += 0.12) K.box(MAT.rail, u - 0.011, u + 0.011, h.y0 + 0.02, h.y1 - 0.02, 0.01, 0.035, { near: true, c: 0 });
    // the paint: the kit's painter (fk/kitTex.js graffitiTex, invented letterforms), one canvas per ~20 m stretch and band
    // so it keeps ~100 px a metre; the window band is painted round the openings, the band over them runs through
    const nS = Math.max(1, Math.round(L / 20));
    for (let s = 0; s < nS; s++) {
      const a = (L * s) / nS, b = (L * (s + 1)) / nS;
      // (AR34 w2 s3: deck26a / deck26c (2026-08) show fewer, bigger pieces, most of them chrome or white with black
      // outlines, one teal, brick between them: 1.7x the painter's size, sparser, washed further toward chrome)
      const GS = HUB25 ? 1.7 : 1.3;
      for (const [y0, y1, seed, dens] of (HUB25 ? [[2.4, 6.0, 31 + s, 0.38], [6.0, 9.64, 57 + s, 0.5]] : [[2.4, 6.0, 31 + s, 0.8], [6.0, 9.64, 57 + s, 0.95]])) {
        // painted 1.3x the painter's size
        const tx = graffitiTex((b - a) / GS, (y1 - y0) / GS, seed, { density: dens, style: 'throwups', bandTop: 0.03 });
        chromeWash(tx, HUB25 ? 0.85 : 0.5);
        const gm = kitGraffitiMat(tx, b - a, y1 - y0, a, y0);
        const quad = (p, q, ya, yb) => { if (q - p > 0.05 && yb - ya > 0.05) K.poly(gm, [[p, ya, 0.006], [q, ya, 0.006], [q, yb, 0.006], [p, yb, 0.006]], [0, 0, 1]); };
        const yw = Math.min(y1, 7.85);
        if (yw > y0 + 0.05) {
          let cur = a;
          for (const h of holes) { if (h.u1 <= a || h.u0 >= b || h.y1 <= y0 || h.y0 >= yw - 0.05) continue; quad(cur, Math.min(h.u0, b), y0, yw); cur = Math.max(cur, h.u1); }
          quad(cur, b, y0, yw);
        }
        quad(a, b, Math.max(y0, yw), y1);
      }
    }
  }
  // ============ the SW end: plain brick, three small windows, a steel door (AR34 w2 s3: the St Clair Place block below
  // draws this face with the HUB25 flag on)
  if (SW && !HUB25) {
    const { K, L } = SW, holes = [], wins = [];
    for (const u0 of [2.8, 8.0, 13.2]) if (u0 + 1.85 < L) { holes.push({ u0, u1: u0 + 1.85, y0: 7.05, y1: FR_NE }); wins.push({ T: WIN_SM, u0, u1: u0 + 1.85, y0: 7.05, y1: FR_NE, o: F2 }); }
    holes.push({ u0: 8.4, u1: 9.6, y0: -0.05, y1: 2.3 });
    shell(SW, holes, wins);
    K.box(paintMat('#2b2b2b'), 8.4, 9.6, -0.05, 2.3, -0.12, -0.07);
  }
  // ============ the St Clair Place corner (the shorter of the two collinear SW edges, at the 12th Avenue corner): stc23a
  // the lower wall painted red to the canopy's line (~3.6 m), Floridita's two
  // red-framed windows with curtains and the name on the glass (5.1-7.2 and 2.4-3.4 m from the corner), two big green
  // second-floor windows over them, a wall-pack lamp; the brick and the frieze above as on every face (the AR33 build drew
  // this face plain)
  // (the kit's cleaned ring merges the two collinear SW edges into one 18.7 m face: s3r1's stc23 plate drew it plain)
  const SWc = HUB25 ? (FACES.find((f) => f !== SW && f !== SE && hdgNear(f.hdg, 209)) || SW) : null;
  if (SWc && SE) {
    const { K, L } = SWc;
    const W0 = (v) => (Array.isArray(v) ? [v[0], v[2]] : [v.x, v.z]);
    const pc = W0(SE.K.world(0, 0, 0)), a0 = W0(K.world(0, 0, 0)), a1 = W0(K.world(L, 0, 0));
    const atL = Math.hypot(a1[0] - pc[0], a1[1] - pc[1]) < Math.hypot(a0[0] - pc[0], a0[1] - pc[1]);
    const U = (d) => (atL ? L - d : d);                    // u of a point d metres from the 12th Avenue corner
    const span = (d0, d1) => [Math.min(U(d0), U(d1)), Math.max(U(d0), U(d1))];
    const RED = K0.mat('brick_painted', { tint: '#b04a4c', dirt: 0.6 });
    const lowH = [], upH = [], upW = [];
    const lw = [[...span(5.12, 7.18), 2], [...span(2.41, 3.42), 1]];
    for (const [a, b] of lw) lowH.push({ u0: a, u1: b, y0: 1.0, y1: 3.1 });
    for (const [a, b] of [span(5.0, 7.3), span(2.2, 3.6)]) { upH.push({ u0: a, u1: b, y0: 5.5, y1: 7.85 }); }
    for (const h of upH) {
      const mid = (h.u0 + h.u1) / 2, two = h.u1 - h.u0 > 1.6;
      if (two) upW.push({ T: WIN_DH, u0: h.u0, u1: mid, y0: h.y0, y1: h.y1, o: F2 }, { T: WIN_DH, u0: mid, u1: h.u1, y0: h.y0, y1: h.y1, o: F2 });
      else upW.push({ T: WIN_DH, u0: h.u0, u1: h.u1, y0: h.y0, y1: h.y1, o: F2 });
    }
    // the far part of the face: the AR33 build's small windows and steel door, past the corner part
    const farH = [];
    for (const d of [10.0, 15.2]) if (d + 1.85 < L - 0.3) { const [a, b] = span(d, d + 1.85); upH.push({ u0: a, u1: b, y0: 7.05, y1: FR_NE }); upW.push({ T: WIN_SM, u0: a, u1: b, y0: 7.05, y1: FR_NE, o: F2 }); }
    if (L > 13) { const [a, b] = span(11.6, 12.8); farH.push([a, b]); lowH.push({ u0: a, u1: b, y0: -0.05, y1: 2.3 }); }
    shell(SWc, upH, upW, 3.6);
    for (const [a, b] of farH) K.box(paintMat('#2b2b2b'), a, b, -0.05, 2.3, -0.12, -0.07);
    K.wall({ u0: 0, u1: L, y0: -1.6, y1: 3.6, holes: lowH, mat: RED });
    K.box(RED, 0, L, 3.58, 3.64, -0.005, 0.012, { c: 0 });
    for (const [a, b, n] of lw) {
      K.window({ kind: 'fixed', mullions: n - 1, frame: { mat: 'alu_black', tint: '#8e2427' }, frameW: 0.07, reveal: 0.1, lintel: null, sillStone: { mat: 'concrete_precast', tint: '#a3282b', h: 0.08, proj: 0.04 }, glass: 'glass_storefront', lit: 0.8, blinds: 0, sheer: 0.9, sheerTint: '#c9bc9a' },
        a, b, 1.0, 3.1, { fy0: 0.0, fy1: 3.6, wallMat: RED, widen: 0.3 });
      K.poly(decal(b - a - 0.1, 0.22, a + 0.05, 2.72, 300, (g, w, h) => { g.fillStyle = '#f1e6c8'; g.font = `700 ${h * 0.62}px ${FONT.serif}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FLORIDITA', w / 2, h * 0.42, w * 0.92); g.font = `400 ${h * 0.26}px ${FONT.sans}`; g.fillText('CUBAN RESTAURANT', w / 2, h * 0.86, w * 0.9); }, { rough: 0.3 }),
        [[a + 0.05, 2.72, -0.06], [b - 0.05, 2.72, -0.06], [b - 0.05, 2.94, -0.06], [a + 0.05, 2.94, -0.06]], [0, 0, 1]);
    }
    const wp = U(6.9);
    K.box(MAT.steel, wp - 0.16, wp + 0.16, 4.3, 4.55, 0, 0.22, { near: true, c: 0.02 });
    K.box(bulb, wp - 0.12, wp + 0.12, 4.28, 4.3, 0.03, 0.2, { near: true, shadow: false });
    for (const d of [3.0, 4.3, 6.2]) { const u = U(d); K.box(MAT.steel, u - 0.07, u + 0.07, 5.0, 5.14, 0, 0.02, { near: true, c: 0.003 }); }
  }
  // any other face (a data sliver): plain brick with the frieze
  for (const f of FACES) if (![NE, SE, NW, SW, SWc].includes(f) && f.L > 0.3) shell(f, [], []);

  // ============ the roof: membrane, plant, exhaust stacks, the billboard structures
  {
    const K = K0, F = K.F;
    const loc = ([x, z]) => { const dx = x - F.p0[0], dz = z - F.p0[1]; return [dx * F.U[0] + dz * F.U[1], dx * F.N[0] + dz * F.N[1]]; };
    const pts = frame.ring.map((p) => { const [u, w] = loc(p); return [u, Y_ROOF, w]; });
    K.poly(MAT.roof, pts, [0, 1, 0]);
    // plant: condensers and rooftop units on the NE half, the kitchen's exhaust fans and stacks over the smokers
    const R = rng(311);
    for (const [u, w, a, b, h] of [[5, -6, 2.2, 1.3, 1.4], [9, -9, 2.6, 1.6, 1.6], [13, -6.5, 2.0, 1.2, 1.2], [16, -12, 3.2, 1.9, 1.8], [7, -14, 1.4, 1.4, 1.1], [18, -20, 2.4, 1.5, 1.4], [11, -22, 1.2, 1.2, 1.0]]) {
      K.box(MAT.hvac, u, u + a, Y_ROOF, Y_ROOF + h, w - b, w, { c: 0.02 });
      K.box(MAT.steel, u + 0.2, u + a - 0.2, Y_ROOF + h, Y_ROOF + h + 0.05, w - b + 0.2, w - 0.2, { near: true, c: 0.004 });
      if (R() < 0.6) K.box(MAT.galv, u + a * 0.3, u + a * 0.7, Y_ROOF + h * 0.3, Y_ROOF + h * 0.75, w + 0.001, w + 0.02, { near: true, c: 0 });
    }
    for (const [u, w] of [[4.2, -3.0], [6.0, -3.2], [20.5, -8.5]]) {
      K.box(MAT.galv, u - 0.3, u + 0.3, Y_ROOF, Y_ROOF + 2.8, w - 0.3, w + 0.3, { c: 0.03 });
      K.box(MAT.galv, u - 0.45, u + 0.45, Y_ROOF + 2.8, Y_ROOF + 3.0, w - 0.45, w + 0.45, { c: 0.02 });
      K.box(MAT.steel, u - 0.02, u + 0.02, Y_ROOF + 2.8, Y_ROOF + 3.05, w - 0.02, w + 0.02, { near: true, c: 0 });
    }
    for (const [u0, u1, w] of [[2.0, 12.0, -2.2], [12.0, 12.4, -2.2]]) K.box(MAT.galv, u0, u1, Y_ROOF + 0.3, Y_ROOF + 0.6, w - 0.3, w, { c: 0.02 });
  }
  if (NW) {
    // three double-faced billboard structures facing the parkway (and the backs toward 12th Avenue): steel posts,
    // a catwalk with its rail and floodlight arms, the frame round each face. Invented brands.
    const { K } = NW;
    const board = (u0, W, H, yb, wf, front, back) => {
      const u1 = u0 + W, wb = wf - 0.6, yt = yb + H;
      if (front) {
        K.poly(adMat(front, W, H, u0, yb, false), [[u0, yb, wf], [u1, yb, wf], [u1, yt, wf], [u0, yt, wf]], [0, 0, 1]);
        K.box(MAT.black, u0, u1, yb - 0.75, yb - 0.12, wf - 0.08, wf + 0.03, { c: 0.004 });   // the operator's dark sill band under the face
      } else {
        // a board turned away from the parkway shows it its steel back: posts every ~1.5 m, three rails, diagonal bracing
        const nv = Math.max(2, Math.round(W / (back ? 1.5 : 0.9)));   // w2b3: an empty frame (no face either side) braced closer
        for (let k = 0; k <= nv; k++) { const u = u0 + (W * k) / nv; K.box(MAT.steel, u - 0.06, u + 0.06, yb, yt, wb + 0.04, wf, { c: 0.004 }); }
        for (const y of [yb + 0.3, yb + H / 2, yt - 0.3]) K.box(MAT.steel, u0, u1, y - 0.07, y + 0.07, wf - 0.14, wf, { c: 0.004 });
        for (let k = 0; k < nv; k++) {
          const a = u0 + (W * k) / nv, c = u0 + (W * (k + 1)) / nv, up = k % 2 === 0;
          bar(K, MAT.steel, [a, up ? yb + 0.3 : yb + H / 2, wf - 0.07], [c, up ? yb + H / 2 : yb + 0.3, wf - 0.07], 0.07, { near: true });
          bar(K, MAT.steel, [a, up ? yb + H / 2 : yt - 0.3, wf - 0.07], [c, up ? yt - 0.3 : yb + H / 2, wf - 0.07], 0.07, { near: true });
        }
      }
      if (back) K.poly(adMat(back, W, H, u0, yb, true), [[u0, yb, wb], [u1, yb, wb], [u1, yt, wb], [u0, yt, wb]], [0, 0, -1]);
      for (const [a, b] of [[u0 - 0.12, u0], [u1, u1 + 0.12]]) K.box(MAT.steel, a, b, yb - 0.12, yt + 0.12, wb - 0.05, wf + 0.05, { c: 0.004 });
      K.box(MAT.steel, u0, u1, yt, yt + 0.12, wb - 0.05, wf + 0.05, { c: 0.004 });
      K.box(MAT.steel, u0, u1, yb - 0.12, yb, wb - 0.05, wf + 0.05, { c: 0.004 });
      if (!back && front) K.box(MAT.steel, u0, u1, yb, yt, wb, wb + 0.04, { c: 0 });
      // AR34 w2 s3 (FILM's t7DinoGlide review: the board read as floating over the parapet and the stair bulkhead): the open
      // steel frame under the face down to the roof in both faces' planes, posts every ~3 m on base plates, a strut at mid
      // height and X bracing (deck26a / deck26c, 2026-08: each board stands on an open frame over the roof)
      if (HUB25 && yb - Y_ROOF > 0.8) {
        const nq = Math.max(2, Math.round(W / 3)), ys = yb - 0.12, ym = (Y_ROOF + ys) / 2;
        for (const wq of [wf - 0.06, wb + 0.06]) {
          for (let k = 0; k <= nq; k++) {
            const u = u0 + 0.15 + ((W - 0.3) * k) / nq;
            K.box(MAT.steel, u - 0.07, u + 0.07, Y_ROOF, ys, wq - 0.07, wq + 0.07, { c: 0.004 });
            K.box(MAT.steel, u - 0.2, u + 0.2, Y_ROOF, Y_ROOF + 0.03, wq - 0.2, wq + 0.2, { near: true, c: 0.004 });
          }
          K.box(MAT.steel, u0, u1, ym - 0.05, ym + 0.05, wq - 0.05, wq + 0.05, { c: 0.003 });
          for (let k = 0; k < nq; k++) {
            const a = u0 + 0.15 + ((W - 0.3) * k) / nq, c = u0 + 0.15 + ((W - 0.3) * (k + 1)) / nq;
            bar(K, MAT.steel, [a, Y_ROOF + 0.1, wq], [c, ys - 0.08, wq], 0.06, { near: true });
            bar(K, MAT.steel, [c, Y_ROOF + 0.1, wq], [a, ys - 0.08, wq], 0.06, { near: true });
          }
        }
      }
      const np = Math.max(2, Math.round(W / 6) + 1);
      for (let k = 0; k < np; k++) {
        const u = u0 + 0.6 + ((W - 1.2) * k) / (np - 1), wc = (wf + wb) / 2;
        K.box(MAT.steel, u - 0.16, u + 0.16, Y_ROOF, yt - 0.2, wc - 0.16, wc + 0.16, { c: 0.01 });
        bar(K, MAT.steel, [u, Y_ROOF + 0.2, wc - 2.4], [u, yb - 0.4, wc - 0.1], 0.12);
        K.box(MAT.steel, u - 0.25, u + 0.25, Y_ROOF, Y_ROOF + 0.25, wc - 2.6, wc + 0.3, { c: 0.01 });
      }
      for (const [side, w0, w1] of [[1, wf, wf + 1.1], back ? [-1, wb - 1.1, wb] : null].filter(Boolean)) {
        K.box(MAT.steel, u0, u1, yb - 0.35, yb - 0.3, Math.min(w0, w1), Math.max(w0, w1), { c: 0 });
        const wr = side > 0 ? w1 - 0.04 : w0 + 0.04;
        bar(K, MAT.steel, [u0, yb + 0.7, wr], [u1, yb + 0.7, wr], 0.035, { near: true });
        for (let u = u0 + 0.3; u < u1; u += 2.4) {
          K.box(MAT.steel, u - 0.02, u + 0.02, yb - 0.3, yb + 0.7, wr - 0.02, wr + 0.02, { near: true, c: 0 });
          bar(K, MAT.steel, [u, yb - 0.3, side > 0 ? wf : wb], [u, yb - 0.1, side > 0 ? wf + 1.4 : wb - 1.4], 0.04, { near: true });
          K.box(MAT.galv, u - 0.18, u + 0.18, yb - 0.25, yb, side > 0 ? wf + 1.3 : wb - 1.6, side > 0 ? wf + 1.6 : wb - 1.3, { near: true, c: 0.01 });
        }
      }
    };
    // w2r1: spans and heights read off dino_nwdeck26 (u from the 125th Street end; the parapet 0.67 m over the lens):
    // a landscape board on a high frame over the 125th end (u 4.4-14.1, foot ~13 m), the big bulletin beside the brick
    // stack (u 21.5-37.0, foot ~11.2 m, 15 x 5 m), and at the SW end a tall board turned away from the parkway, its
    // steel back to it (u 44.6-55)
    // within ~10 px): board 1 spans u 5.7-17.7, board 2 u 25.2-41.1, the
    // brick stack between them u 17.9-21.2, top ~14.6 m, a flue over it; heights from s3r2's rows (face
    // edges at x 650 / 1150 / 1300 of 1600): both faces' feet at one row, ~0.9 m under s3r2's -> 11.05 m; board 1's face
    // 5.6 m tall, board 2's 5.0 m
    if (HUB25) { board(5.7, 12.0, 5.6, 11.05, -3.2, 'sofa', 'glass'); board(25.2, 15.6, 5.0, 11.05, -3.6, 'tip', 'radio'); }
    else { board(4.4, 9.7, 4.1, 13.0, -3.2, 'sofa', 'glass'); board(21.5, 15.2, 5.0, 11.2, -3.6, 'tip', 'radio'); }
    // w2b3: the SW structure is an empty frame from both sides (dino_corner23 2023-09 sees its lattice from the SE, the
    // 2026-08 deck view from the NW): no ad face, no back plate
    board(44.6, 10.5, 6.2, 12.0, -2.8, null, null);
    // the brick stack between the first two (u 14.5-16.5 in the deck view, top ~15 m), painted like the wall below
    if (HUB25) {
      K.box(MAT.brick, 17.9, 21.2, Y_ROOF - 0.1, 14.6, -3.9, -2.0, { c: 0.01 });
      K.box(MAT.coping, 17.8, 21.3, 14.6, 14.72, -4.0, -1.9, { c: 0.01 });
      K.box(MAT.galv, 19.0, 19.5, 14.72, 17.6, -3.2, -2.7, { c: 0.02 });
      K.box(MAT.galv, 18.9, 19.6, 17.6, 17.75, -3.3, -2.6, { c: 0.01 });
      K.box(MAT.steel, 20.2, 20.9, 14.72, 15.6, -3.5, -2.6, { c: 0.01 });
    } else {
      K.box(MAT.brick, 14.6, 16.6, Y_ROOF - 0.1, 15.0, -3.6, -2.0, { c: 0.01 });
      K.box(MAT.coping, 14.5, 16.7, 15.0, 15.12, -3.7, -1.9, { c: 0.01 });
    }
  }
  void group; void ctx; void spec;
}

// ------------------------------------------------------------------ The Forum (Columbia, 605 W 125th St at Broadway)
// Renzo Piano Building Workshop, 2018; renamed The Bollinger Forum. On 125th (u from the NW end, 71.7 m): a tall glazed ground floor set back
// behind slender white round columns at 6.5 m, a pale concrete band (5.1-7.0 m) carrying "THE BOLLINGER FORUM" in blue
// letters; above it the NW half is a clear glass curtain wall on two floors (floor lines 7.4 and 11.8 m, mullions at
// 1.5 m) under a roof terrace rail, the SE half (from u 35.4, toward Broadway) the auditorium's concrete box with two
// groups of four narrow slot windows. Measured on forum_26: column centres u 21.2, 27.7, 34.4, 40.6, 47.4; slots 8.4-11.0 m.
function roundCol(K, mat, u, w, y0, y1, r, n = 12) {
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
    K.poly(mat, [[u + Math.cos(a0) * r, y0, w + Math.sin(a0) * r], [u + Math.cos(a1) * r, y0, w + Math.sin(a1) * r], [u + Math.cos(a1) * r, y1, w + Math.sin(a1) * r], [u + Math.cos(a0) * r, y1, w + Math.sin(a0) * r]], [Math.cos(am), 0, Math.sin(am)]);
  }
}
export function forum(group, ctx, spec, frame) {
  const FACES = facesOf(frame);
  const K0 = frame.kit, M = (name, tint, dirt) => K0.mat(name, { tint, dirt });
  const MAT = { conc: M('concrete_smooth', '#bdbcb5', 0.12), white: paintMat('#eceae4', 0.35, 0.15), alu: M('alu_clear', '#c9ccce', 0.05),
    soffit: M('concrete_smooth', '#c8c7c0', 0.05), roof: M('concrete_precast', '#9a9a96', 0.2), rail: M('glass_clear'),
    dark: lit(new THREE.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.8 })) };
  const H = spec.h || 18.3, YB = 5.1, YC = 7.0, YT = 16.4;
  // w2r1: the b0 plate drew the upper glass as dark slabs; forum26 (2026-08) shows it reading the sky and the street, light
  // over a lit interior: the reflective tower set (BID2's 'glass_tower_grey' reads light and reflective from the street)
  const CW = { kind: 'fixed', frame: { mat: 'alu_clear', tint: '#c9ccce' }, frameW: 0.05, reveal: 0.03, lintel: null, sillStone: null, glass: 'glass_tower_grey', lit: 0.8, blinds: 0 };
  const VG = {
    // the twin mirrored a
    upper: pbrMaterial('glass_vision', { tint: '#b6cde6', storey: [4.4, 7.4], bay: 1.5, blinds: 0.05, trans: 0.6, depth: 9, street: 70, seed: 605 }),
    lobby: pbrMaterial('glass_vision_grey', { storey: [5.1, 0], bay: 1.6, blinds: 0.0, trans: 0.45, depth: 11, seed: 606 }),
  };
  MAT.mull = K0.mat('alu_clear', { tint: '#4b5156' });
  const SF = { kind: 'storefront', frame: { mat: 'alu_clear', tint: '#c9ccce' }, frameW: 0.06, reveal: 0.02, lintel: null, sillStone: null, glass: 'glass_storefront', lit: 1, blinds: 0 };
  for (const f of FACES) {
    const { K, L } = f, front = f.i === frame.front;
    const boxU0 = front ? 35.4 : L + 1;                 // the concrete box from here to the face's right end
    // the recessed glazed ground floor behind the colonnade (set back 1.8 m), its soffit
    const SB = front ? -1.8 : -0.6;
    K.wall({ u0: 0, u1: L, y0: -1.5, y1: YB, w: SB, mat: MAT.conc, holes: [{ u0: 0.3, u1: L - 0.3, y0: 0.0, y1: YB - 0.05 }] });
    // w2b3: the lobby glass as vision glass over a bright lobby (forum26: the cafe and the lobby read light through the glass
    // by day; the kit's storefront type drew dark panes between thick white frames), thin dark mullions every ~1.6 m, a
    // transom at 3.2 m
    K.poly(VG.lobby, [[0.3, 0.0, SB], [L - 0.3, 0.0, SB], [L - 0.3, YB - 0.05, SB], [0.3, YB - 0.05, SB]], [0, 0, 1]);
    { const nm = Math.max(1, Math.round((L - 0.6) / 1.6)); for (let k = 0; k <= nm; k++) { const u = 0.3 + ((L - 0.6) * k) / nm; K.box(MAT.mull, u - 0.03, u + 0.03, 0, YB - 0.05, SB, SB + 0.09, { near: true, c: 0 }); } }
    K.box(MAT.mull, 0.3, L - 0.3, 3.15, 3.23, SB, SB + 0.08, { near: true, c: 0 });
    if (SB < -0.1) { K.box(MAT.soffit, 0, L, YB - 0.02, YB + 0.02, SB, 0, { c: 0 }); for (let u = 1.7; u < L - 0.5; u += 6.5) roundCol(K, MAT.white, u, -0.35, 0, YB, 0.19); }
    // the band, with the letters on 125th
    K.box(MAT.conc, 0, L, YB, YC, -0.25, 0.0, { c: 0.01 });
    // above: glass floors and the concrete box
    const g0 = 0, g1 = Math.min(L, boxU0);
    if (g1 - g0 > 1) {
      for (const [y0, y1] of [[YC, 11.6], [11.95, YT]]) {
        const n = Math.max(1, Math.round((g1 - g0) / 1.5));
        // w2b3: MATS's vision glass (the lead's review: the glass read as dark slabs; forum26 shows light blue-grey glass, the
        // sky in its upper rows and the lit lounges behind it)
        K.poly(VG.upper, [[g0 + 0.05, y0, -0.06], [g1 - 0.05, y0, -0.06], [g1 - 0.05, y1, -0.06], [g0 + 0.05, y1, -0.06]], [0, 0, 1]);
        // the mullion caps (forum26: slim caps, 0.12 m proud)
        for (let k = 1; k < n; k++) { const u = g0 + ((g1 - g0) * k) / n; K.box(MAT.alu, u - 0.028, u + 0.028, y0, y1, -0.06, 0.12, { c: 0.004 }); }
        K.box(MAT.alu, g0, g1, y1 - 0.03, y1 + 0.35, -0.05, 0.06, { c: 0.004 });
      }
      K.box(MAT.alu, g0, g1, YT + 0.35, YT + 0.45, -0.3, 0.02, { c: 0.004 });
      K.box(MAT.rail, g0 + 0.1, g1 - 0.1, YT + 0.45, YT + 1.55, -0.32, -0.3, { c: 0 });
      K.box(MAT.alu, g0 + 0.1, g1 - 0.1, YT + 1.55, YT + 1.6, -0.34, -0.28, { c: 0 });
      // the set-back top floor behind the terrace
      const t0 = g0 + 3, t1 = g1 - 5, tw = -4.0;
      if (t1 - t0 > 2) {
        K.box(MAT.rail, t0, t1, YT + 0.45, H + 0.6, tw - 0.02, tw, { c: 0 });
        K.box(MAT.dark, t0, t1, YT + 0.45, H + 0.6, tw - 3.0, tw - 2.98, { c: 0 });
        for (let u = t0; u <= t1 + 0.01; u += (t1 - t0) / Math.max(1, Math.round((t1 - t0) / 1.5))) K.box(MAT.alu, u - 0.03, u + 0.03, YT + 0.45, H + 0.6, tw - 0.05, tw + 0.06, { c: 0.004 });
        K.box(MAT.conc, t0 - 0.3, t1 + 0.3, H + 0.6, H + 1.2, tw - 3.2, tw + 0.4, { c: 0.01 });
      }
    }
    if (L - boxU0 > 1) {
      const holes = [];
      if (front) for (const u of [36.8, 37.7, 38.5, 39.4, 41.1, 42.0, 42.9, 43.8]) holes.push({ u0: u - 0.22, u1: u + 0.22, y0: 8.4, y1: 11.0 });
      K.wall({ u0: boxU0, u1: L, y0: YC, y1: H, holes, mat: MAT.conc });
      for (const h of holes) K.window({ ...CW, reveal: 0.25 }, h.u0, h.u1, h.y0, h.y1, { fy0: 7.4, fy1: 12, wallMat: MAT.conc, widen: 0.1 });
      // the formwork panel joints: shallow reveals every 1.2 m up, 2.4 m across
      for (let y = YC + 1.2; y < H - 0.3; y += 1.2) K.box(MAT.soffit, boxU0, L, y - 0.012, y + 0.012, -0.01, 0.004, { near: true, c: 0 });
      for (let u = boxU0 + 2.4; u < L - 0.3; u += 2.4) K.box(MAT.soffit, u - 0.012, u + 0.012, YC, H, -0.01, 0.004, { near: true, c: 0 });
      K.box(MAT.alu, boxU0, L, H - 0.05, H + 0.1, -0.3, 0.03, { c: 0.004 });
    }
    if (front) K.sign({ kind: 'channel', text: 'THE BOLLINGER FORUM', font: 'Archivo-700', fg: '#2e6fb8', bg: null, u0: 34.9, u1: 41.2, y: 5.72, h: 0.55, depth: 0.05, lit: 'halo' }, { z: 0.005 });
  }
  // the roof slab
  const F = K0.F;
  const loc = ([x, z]) => { const dx = x - F.p0[0], dz = z - F.p0[1]; return [dx * F.U[0] + dz * F.U[1], dx * F.N[0] + dz * F.N[1]]; };
  K0.poly(MAT.roof, frame.ring.map((p) => { const [u, w] = loc(p); return [u, H, w]; }), [0, 1, 0]);
  void group; void ctx;
}

// ------------------------------------------------------------------ the Cotton Club (656 W 125th St): its roof board
const CC36 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('cc36') === '0');
// The kit builds the low white building from the spec; this adds the tall billboard structure on its roof (cotton_23:
// a board over the NW half, its face toward the parkway and the river, the back and catwalk toward 125th). Invented ad.
export function cottonTop(group, ctx, spec, frame) {
  const K = frame.kit, L = frame.L, st = paintMat('#3a3b3a', 0.6, 0.45), gv = paintMat('#9a9d9c', 0.5, 0.4);
  // w2r1: the board stands end-on to 125th Street over the NW end, its face toward the viaduct: cotton23 (BCVJZZk0 2023-08)
  // shows its edge, the catwalk and the floodlight arms from below; b0-r4 had it parallel to the front. A 14.63 x 4.27 m
  // bulletin (invented ad) on three posts with raking braces. Placed by bearing (r7 had it at the NW end): in cotton23 the
  // underside's middle is ~6.8 deg left of the lens axis and ~19.4 deg up; with the foot at 13 m that is ~29.6 m out, i.e.
  // u ~9.4, w ~-9.3 on this face (+-3 m: the foot height is assumed, not measured)
  const W = 14.63, H = 4.27, ub = Math.min(L - 1.2, 9.4), w0 = -0.5, w1 = w0 - W, wc = (w0 + w1) / 2, yb = 13.0, yt = yb + H, y0 = (spec.h || 4.3) - 0.05;
  const t = drawnTex(Math.round(W * 90), Math.round(H * 90), drawAd('coffee'));
  const fm = lit(new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, emissive: new THREE.Color(0xfff2dc), emissiveMap: t }));
  nightMat(fm, 0.0, 0.55, 'ad');
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), fm);
  face.applyMatrix4(K.matrix(ub + 0.02, yb + H / 2, wc).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)));
  K.add(face);
  K.box(st, ub - 0.6, ub, yb, yt, w1, w0, { c: 0 });
  for (let w = w1 + 0.8; w < w0 - 0.5; w += 1.9) K.box(st, ub - 0.72, ub - 0.6, yb, yt, w - 0.05, w + 0.05, { near: true, c: 0 });
  for (const y of [yb - 0.12, yt]) K.box(st, ub - 0.6, ub + 0.06, y, y + 0.12, w1 - 0.1, w0 + 0.1, { c: 0.004 });
  // CC36 (owner 2026-10-02: "The sign near cotton club seems to be floating"): the board runs 15.1 m back from the front
  // and the footprint's back wall runs diagonally, ~10.3 m back under the posts, so the rear post and its brace started at
  // roof height in the air behind the building. A foot past the back wall goes down to the ground on a base plate, with a
  // brace back to the roof; `?cc36=0` as it was
  const F = K.F, ring = (frame.ring || []).map(([x, z]) => { const dx = x - F.p0[0], dz = z - F.p0[1]; return [dx * F.U[0] + dz * F.U[1], dx * F.N[0] + dz * F.N[1]]; });
  const backAt = (u) => {   // the deepest w of the footprint at u (inside is w < 0)
    let m = 0;
    for (let i = 0; i < ring.length; i++) {
      const [ua, wa] = ring[i], [ue, we] = ring[(i + 1) % ring.length];
      if (ua !== ue && (ua - u) * (ue - u) <= 0) m = Math.min(m, wa + ((u - ua) / (ue - ua)) * (we - wa));
    }
    return m;
  };
  const onRoof = (u, w) => !CC36 || !ring.length || w > backAt(u) + 0.4;
  for (const w of [w1 + 2.0, wc, w0 - 2.0]) {
    const pf = onRoof(ub - 0.75, w) ? y0 : 0;
    K.box(st, ub - 0.95, ub - 0.55, pf, yt - 0.3, w - 0.2, w + 0.2, { c: 0.01 });
    if (pf === 0) {
      K.box(st, ub - 1.2, ub - 0.3, 0, 0.05, w - 0.45, w + 0.45, { c: 0.01 });   // the base plate on its footing
      const wr = Math.min(w0 - 0.5, backAt(ub - 0.75) + 1.0);                      // a brace from the roof's back edge
      bar(K, st, [ub - 0.75, y0 + 0.3, wr], [ub - 0.75, yb - 0.6, w + 0.25], 0.12);
    }
    const bu = ub - 3.6, bf = onRoof(bu, w) ? y0 : 0;
    bar(K, st, [bu, bf + 0.3, w], [ub - 0.8, yb - 0.5, w], 0.14);
  }
  // the catwalk along the face with its rail and the floodlight arms
  K.box(gv, ub, ub + 1.1, yb - 0.4, yb - 0.34, w1, w0, { c: 0 });
  bar(K, gv, [ub + 1.05, yb + 0.7, w1], [ub + 1.05, yb + 0.7, w0], 0.035, { near: true });
  for (let w = w1 + 0.4; w < w0; w += 2.4) {
    bar(K, st, [ub, yb - 0.35, w], [ub + 1.4, yb - 0.15, w], 0.04, { near: true });
    K.box(gv, ub + 1.3, ub + 1.6, yb - 0.3, yb - 0.05, w - 0.18, w + 0.18, { near: true, c: 0.01 });
  }
  // w2b3: the marquee (cotton23 at full size: a black barrel canopy from the door out toward the curb on two posts, not a
  // dome on the wall): '656' in white on the front valance, 'Cotton Club' in script along the side valance, the round
  // mark standing on the front of the barrel. Width and heights by eye against the door (2.7 m wide, valance 2.72-3.0 m,
  // rise 0.55 m); its reach (4.2 m) is not measured
  {
    const U0 = 1.05, U1 = 3.75, UC = (U0 + U1) / 2, R = (U1 - U0) / 2, WF = 4.2, YS = 3.0, RISE = 0.55, YV = 2.72, NA = 10;
    const fab = paintMat('#121212', 0.62, 0.0), fin = paintMat('#1c1b1a', 0.85, 0.0), post = paintMat('#151617', 0.45, 0.4);
    const rr = (R * R + RISE * RISE) / (2 * RISE), yc = YS + RISE - rr, a0 = Math.asin(R / rr), arc = [];
    for (let k = 0; k <= NA; k++) { const t = -a0 + (2 * a0 * k) / NA; arc.push([UC + rr * Math.sin(t), yc + rr * Math.cos(t), Math.sin(t), Math.cos(t)]); }
    for (let k = 0; k < NA; k++) {
      const p = arc[k], q = arc[k + 1], nu = (p[2] + q[2]) / 2, ny = (p[3] + q[3]) / 2;
      K.poly(fab, [[p[0], p[1], 0], [q[0], q[1], 0], [q[0], q[1], WF], [p[0], p[1], WF]], [nu, ny, 0]);
      K.poly(fin, [[p[0], p[1] - 0.01, 0], [q[0], q[1] - 0.01, 0], [q[0], q[1] - 0.01, WF], [p[0], p[1] - 0.01, WF]], [-nu, -ny, 0]);
      K.poly(fab, [[UC, YS, WF], [p[0], p[1], WF], [q[0], q[1], WF]], [0, 0, 1]);
    }
    for (const [u, nu] of [[U0, -1], [U1, 1]]) K.poly(fab, [[u, YV, 0], [u, YV, WF], [u, YS, WF], [u, YS, 0]], [nu, 0, 0]);
    K.poly(fab, [[U0, YV, WF], [U1, YV, WF], [U1, YS, WF], [U0, YS, WF]], [0, 0, 1]);
    const d656 = decal(U1 - U0, YS - YV, U0, YV, 300, (g, w, h) => {
      g.fillStyle = '#ede8da'; g.font = `700 ${h * 0.66}px ${FONT.serif}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('656', w / 2, h * 0.54);
    }, { rough: 0.6 });
    K.poly(d656, [[U0, YV, WF + 0.006], [U1, YV, WF + 0.006], [U1, YS, WF + 0.006], [U0, YS, WF + 0.006]], [0, 0, 1]);
    const dside = decal(WF, YS - YV, -WF, YV, 260, (g, w, h) => {
      g.fillStyle = '#ede8da'; g.font = `${h * 0.72}px ${FONT.script}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Cotton Club', w * 0.3, h * 0.55);
    }, { rough: 0.6 });
    K.poly(dside, [[U1 + 0.006, YV, 0], [U1 + 0.006, YV, WF], [U1 + 0.006, YS, WF], [U1 + 0.006, YS, 0]], [1, 0, 0]);
    const RL = 0.36, LY = YS + RISE - 0.08;
    const dlog = decal(2 * RL, 2 * RL, UC - RL, LY, 420, (g, w, h) => {
      const r = Math.min(w, h) * 0.48, cx = w / 2, cy = h / 2;
      g.fillStyle = '#141414'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#e9e4d6'; g.lineWidth = r * 0.07; g.beginPath(); g.arc(cx, cy, r * 0.88, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#e9e4d6'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `${r * 0.5}px ${FONT.script}`;
      g.fillText('Cotton', cx, cy - r * 0.2); g.fillText('Club', cx + r * 0.1, cy + r * 0.3);
    }, { rough: 0.55 });
    K.poly(dlog, [[UC - RL, LY, WF - 0.06], [UC + RL, LY, WF - 0.06], [UC + RL, LY + 2 * RL, WF - 0.06], [UC - RL, LY + 2 * RL, WF - 0.06]], [0, 0, 1]);
    for (const u of [U0 + 0.06, U1 - 0.06]) K.box(post, u - 0.04, u + 0.04, 0, YV, WF - 0.14, WF - 0.06, { c: 0 });
  }
  void group; void ctx;
}
// the club's round mark on its canopy: "CC" in a ring (drawn here)
export function ccLogo(g, w, h) {
  const r = Math.min(w, h) * 0.46, cx = w / 2, cy = h / 2;
  g.strokeStyle = '#e9e4d6'; g.lineWidth = r * 0.08; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#e9e4d6'; g.font = `700 ${r * 1.0}px ${FONT.serif}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CC', cx, cy + r * 0.05);
}

// ------------------------------------------------------------------ storefront marks (drawn from scratch)
// Chase: the octagon of four blue wedges round a white square
export function chase(g, w, h) {
  const s = Math.min(w, h) * 0.46, cx = w / 2, cy = h / 2, t = s * 0.42;
  g.fillStyle = '#ffffff';
  const wedge = (rot) => { g.save(); g.translate(cx, cy); g.rotate(rot); g.beginPath(); g.moveTo(-t, -s); g.lineTo(s * 0.45, -s); g.lineTo(s, -s * 0.45); g.lineTo(s, -t * 0.2); g.lineTo(t, -t); g.lineTo(-t, -t); g.closePath(); g.fill(); g.restore(); };
  for (let k = 0; k < 4; k++) wedge((k * Math.PI) / 2);
}
// City Prime Health: a round flower-like mark of six petals
export function cityPrime(g, w, h) {
  const r = Math.min(w, h) * 0.42, cx = w / 2, cy = h / 2;
  g.strokeStyle = '#ffffff'; g.lineWidth = r * 0.12;
  for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; g.beginPath(); g.ellipse(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45, r * 0.5, r * 0.22, a, 0, Math.PI * 2); g.stroke(); }
}

// ------------------------------------------------------------------ Henry R. Kravis Hall (Columbia Business School)
// Diller Scofidio + Renfro, 2022, seen across the 2023 construction lot on the north side of 125th. w2b3 rebuild (the lead's review: "a stack of glass floors with offset, curving fritted
// glass bands and deep slab edges"): a double-height glass lobby set back under a deep soffit, then two-storey cycles,
// each a projecting tray (fritted glass between a white slab edge and a white cap, the cap kinked up or down along each
// face, prows at some corners) over a recessed strip of dark vision glass whose corners curve back, and a fritted screen
// round the roof plant. at the ring's distance: tray soffits 9.0 / 18.5 / 28.7 / 38.5 m,
// tray tops 16.4 / 26.3 / 36.3 m at the W end and 14.6 / 24.7 / 34.7 m east of a slanted step at u 11-14 m on the S face,
// the W face's trays 2.3 m proud of the ring at 20.7 m. Above 38.5 m: b3r5's n12av_26 pair puts the real top at ~51 m: four cycles and the screen (roof 48.2 m, screen top 52.2 m); b3r1-b3r5 drew five
// The compiled 38.4 m is the construction-time height.
// Colours (refs/kravis23.jpg sRGB means): fritted glass (127-145, 132-151, 132-154), dark strips (43, 50, 49), lobby glass
// (49, 50, 43), soffits (147, 147, 146).
export function kravis(group, ctx, spec, frame) {
  const FACES = facesOf(frame), K0 = frame.kit, Y0 = frame.y0;
  const LOB = 9.0, CYC = 9.8, NC = 4, ROOF = LOB + NC * CYC, SCR = 4.0;
  // the slab edge under each tray
  const SE = 0.85;
  const GW = -0.45, LG = -1.7, RC = 2.4;   // the vision glass and the lobby glass behind the ring line; their corners' radius
  const MAT = {
    // mid grey; now the body (the frit read as a matt grey under the coating) with the street and sky in the reflection. The
    // strips: b3r1's read light (the sky in them);
    frit: pbrMaterial('glass_vision', { tint: '#c3cacc', body: '#62676a', room: 0, f0: 0.05, street: 60, glow: 0.08, storey: [CYC / 2, LOB], seed: 401 }),
    dark: pbrMaterial('glass_vision_grey', { tint: '#5d6668', storey: [CYC / 2, LOB], bay: 1.5, blinds: 0.12, trans: 0.1, f0: 0.07, seed: 402 }),
    // the E face's wall behind the trays
    eWall: pbrMaterial('glass_vision', { tint: '#8a8584', body: '#3d3838', room: 0, f0: 0.05, street: 60, glow: 0.05, storey: [CYC / 2, LOB], seed: 404 }),   // s2r1: '#463e3b' read brown in the sun
    lobby: pbrMaterial('glass_vision_grey', { storey: [6.1, 0], bay: 1.5, blinds: 0.05, depth: 14, seed: 403 }),
    // the trays' rims: thin and grey, little lighter than the frit; the twin's read as white
    // bands, (188-231) in QA's w2r2: '#cfd2d1' -> '#8e9191'
    edge: K0.mat('alu_white', { tint: '#8e9191', dirt: 0.1 }), soffit: K0.mat('alu_white', { tint: '#b2b5b4', dirt: 0.06 }),
    mull: K0.mat('alu_clear', { tint: '#a9aeb0' }), roof: K0.mat('roof_membrane', { tint: '#b4b2ac', dirt: 0.45 }),
    pent: K0.mat('panel_grey', { tint: '#c4c7c7', dirt: 0.2 }), louvre: paintMat('#7d8284', 0.55, 0.3),
  };
  // the faces by their outward heading: S (toward 125th, ~208 deg), E, N, W; corner k = the start of face k in this order
  const byH = (h) => FACES.filter((f) => hdgNear(f.hdg, h, 40)).sort((a, b) => b.L - a.L)[0];
  const SEQ = [byH(208), byH(118), byH(28), byH(298)];
  if (SEQ.some((f) => !f)) { console.warn(`[fk] ${spec.id}: kravis expects four faces`); return; }
  // per cycle: the tray's projection beyond the ring and its height over the soffit at the corners SW, SE, NE, NW; a step
  // between two corners of different height at [p, p + 3 m] along the face (S face: u 11-14 m, measured)
  const CY = [
    { o: 1.3, hc: [7.4, 5.6, 7.0, 5.8], p: [0.27, 0.55, 0.4, 0.62] },
    { o: 0.9, hc: [7.8, 6.2, 5.8, 7.2], p: [0.27, 0.3, 0.58, 0.45] },
    { o: 1.8, hc: [7.6, 6.0, 7.3, 6.0], p: [0.28, 0.66, 0.35, 0.5] },
    { o: 1.1, hc: [7.2, 5.8, 6.3, 7.4], p: [0.3, 0.42, 0.6, 0.3] },
    { o: 1.5, hc: [7.5, 6.2, 7.0, 5.8], p: [0.25, 0.6, 0.45, 0.55] },
  ];
  // prows: a tray's end carried past the corner as a wedge; face index in SEQ, the end (1 = the face's right end), wedge length and reach
  const PROW = [{ c: 0, f: 0, end: 1, len: 15, ext: 3.4 }, { c: 2, f: 3, end: 1, len: 10, ext: 2.4 }, { c: 3, f: 1, end: 1, len: 12, ext: 2.8 }, { c: 1, f: 2, end: 0, len: 9, ext: 2.0 }];
  const prof = (fi, c, L, o) => {
    const C = CY[c], a = C.hc[fi], b = C.hc[(fi + 1) % 4], u0 = -o, u1 = L + o;
    if (Math.abs(a - b) < 0.05) return [[u0, a], [u1, a]];
    const s0 = Math.max(u0 + 0.5, Math.min(u1 - 4.5, C.p[fi] * L)), out = [[u0, a]];
    // the step as an S-curve over 4 m
    for (let k = 0; k <= 6; k++) { const t = k / 6, e = t * t * (3 - 2 * t); out.push([s0 + 4.0 * t, a + (b - a) * e]); }
    out.push([u1, b]);
    return out;
  };
  const topAt = (P, u) => { for (let k = 1; k < P.length; k++) if (u <= P[k][0]) { const [ua, ya] = P[k - 1], [ub, yb] = P[k]; return ya + ((yb - ya) * (u - ua)) / Math.max(1e-3, ub - ua); } return P[P.length - 1][1]; };
  // a band of the tray's front between yLo(u) and yHi(u) at w over the profile's breakpoints (and extra cuts)
  const strip = (K, mat, P, w, lo, hi, cuts = [], nrm = [0, 0, 1]) => {
    const us = [...new Set([...P.map((q) => q[0]), ...cuts])].sort((x, y) => x - y);
    for (let k = 1; k < us.length; k++) {
      const ua = us[k - 1], ub = us[k], ta = topAt(P, ua), tb = topAt(P, ub);
      const a0 = lo(ua, ta), a1 = hi(ua, ta), b0 = lo(ub, tb), b1 = hi(ub, tb);
      if (a1 - a0 < 0.01 && b1 - b0 < 0.01) continue;
      K.poly(mat, [[ua, a0, w], [ub, b0, w], [ub, b1, w], [ua, a1, w]], typeof nrm === 'function' ? nrm(ua, ub) : nrm);
    }
  };
  // a pane's normal tilted up
  // to ~1.1 deg either way (seeded per pane), the panes cut at the mullions
  const jit = (seed) => (ua, ub) => { const h = (q) => { const x = Math.sin(seed * 12.9898 + (ua + ub) * 7.233 + q * 78.233) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; }; return [h(1) * 0.02, h(2) * 0.02, 1]; };
  // AR34 w2 s2: on the E face
  // the trays of cycles 1-3 break in two with the dark wall between: u of each gap.
  // s2r1 (k_sv_e): the right-hand tray's end, 1-2 m proud of the wall and seen from the south, hid most of each gap: the gaps
  // run on 1.6 m past the measured edge
  const GAPS = { 1: [11.6, 17.6], 2: [21.8, 28.4], 3: [9.5, 15.4] };
  const clipP = (P, a, b) => { const out = [[a, topAt(P, a)]]; for (const q of P) if (q[0] > a + 1e-3 && q[0] < b - 1e-3) out.push(q); out.push([b, topAt(P, b)]); return out; };
  for (let c = 0; c <= NC; c++) {
    const scr = c === NC, yb = LOB + c * CYC, C = scr ? { o: 0.9 } : CY[c], o = C.o;
    SEQ.forEach((f, fi) => {
      const { K, L } = f;
      const P0 = scr ? [[-o, SCR], [L + o, SCR]] : prof(fi, c, L, o).map(([u, h]) => [u, yb + h]);
      if (scr) P0.forEach((q) => { q[1] = yb + SCR; });
      const wIn = c === 0 ? LG : GW;
      const nmc = Math.max(1, Math.round((L + 2 * o) / 1.25)), mall = [];
      for (let k = 1; k < nmc; k++) mall.push(-o + ((L + 2 * o) * k) / nmc);
      const gap = !scr && fi === 1 ? GAPS[c] : null;
      for (const [ra, rb] of gap ? [[-o, gap[0]], [gap[1], L + o]] : [[-o, L + o]]) {
        const P = clipP(P0, ra, rb), mcuts = mall.filter((u) => u > ra + 0.3 && u < rb - 0.3), s0 = ra <= -o + 1e-3, s1 = rb >= L + o - 1e-3;
        // the slab edge (SE), the fritted glass with its mullions every 1.25 m and a transom at the inner floor line, the cap
        K.box(MAT.edge, ra, rb, yb, yb + SE, o - 0.3, o, { c: 0.02, skip: 0 });
        strip(K, MAT.frit, P, o - 0.06, () => yb + SE, (u, t) => t - 0.32, mcuts, jit(fi * 17 + c * 5 + 1));
        strip(K, MAT.edge, P, o, (u, t) => t - 0.32, (u, t) => t);
        // the cap's top: a ledge from the front back to the glass, following the kinks
        for (let k = 1; k < P.length; k++) {
          const [ua, ya] = P[k - 1], [ub, yb2] = P[k];
          const ia = Math.max(-GW, Math.min(L + GW, ua)), ib = Math.max(-GW, Math.min(L + GW, ub)), e = (fi % 2) * 0.004;
          K.poly(MAT.edge, [[ia, topAt(P, ia) + e, GW], [ib, topAt(P, ib) + e, GW], [ub, yb2 + e, o], [ua, ya + e, o]], [0, 1, 0]);
        }
        for (const u of mcuts) K.box(MAT.mull, u - 0.025, u + 0.025, yb + SE, topAt(P, u) - 0.32, o - 0.06, o - 0.01, { near: true, c: 0 });
        if (!scr) strip(K, MAT.mull, P, o - 0.04, () => yb + CYC / 2 - 0.05, (u, t) => Math.min(t - 0.4, yb + CYC / 2 + 0.03));
        // the soffit (mitred at the corners) and the tray's inner face down to the glass
        K.poly(MAT.soffit, [[s0 ? 0.3 - o : ra, yb, o - 0.3], [s0 ? -wIn : ra, yb, wIn], [s1 ? L + wIn : rb, yb, wIn], [s1 ? L + o - 0.3 : rb, yb, o - 0.3]], [0, -1, 0]);
        // a tray's end at a gap: rim, frit and cap closed back to the wall
        for (const [ue, sg] of [[ra, -1], [rb, 1]]) {
          if ((sg < 0 && s0) || (sg > 0 && s1)) continue;
          const t = topAt(P, ue), n = [sg, 0, 0];
          K.poly(MAT.edge, [[ue, yb, wIn], [ue, yb, o], [ue, yb + SE, o], [ue, yb + SE, wIn]], n);
          K.poly(MAT.frit, [[ue, yb + SE, wIn], [ue, yb + SE, o], [ue, t - 0.32, o], [ue, t - 0.32, wIn]], n);
          K.poly(MAT.edge, [[ue, t - 0.32, wIn], [ue, t - 0.32, o], [ue, t, o], [ue, t, wIn]], n);
        }
      }
    });
    // prows of this cycle
    for (const pr of PROW) {
      if (pr.c !== c || scr) continue;
      const f = SEQ[pr.f], { K, L } = f, P = prof(pr.f, c, L, o).map(([u, h]) => [u, yb + h]);
      const uc = pr.end ? L + o : -o, ua = pr.end ? uc - pr.len : uc + pr.len, ht = topAt(P, uc), hb = yb;
      const A = [ua, o], B = [uc, o + pr.ext], Cc = [uc, o];
      const du = B[0] - A[0], dw = B[1] - A[1], dl = Math.hypot(du, dw), nS = pr.end ? [-dw / dl, 0, du / dl] : [dw / dl, 0, -du / dl];
      const side = (p, q, n) => {
        K.poly(MAT.edge, [[p[0], hb, p[1]], [q[0], hb, q[1]], [q[0], hb + SE, q[1]], [p[0], hb + SE, p[1]]], n);
        K.poly(MAT.frit, [[p[0], hb + SE, p[1]], [q[0], hb + SE, q[1]], [q[0], ht - 0.32, q[1]], [p[0], topAt(P, p[0]) - 0.32, p[1]]], n);
        K.poly(MAT.edge, [[p[0], topAt(P, p[0]) - 0.32, p[1]], [q[0], ht - 0.32, q[1]], [q[0], ht, q[1]], [p[0], topAt(P, p[0]), p[1]]], n);
      };
      side(A, B, nS);
      side(B, Cc, pr.end ? [1, 0, 0] : [-1, 0, 0]);
      K.poly(MAT.soffit, [[A[0], hb, A[1]], [B[0], hb, B[1]], [Cc[0], hb, Cc[1]]], [0, -1, 0]);
      K.poly(MAT.edge, [[A[0], topAt(P, A[0]), A[1]], [B[0], ht, B[1]], [Cc[0], ht, Cc[1]]], [0, 1, 0]);
      for (let k = 1; k < Math.round(dl / 1.25); k++) {
        const t = k / Math.round(dl / 1.25), u = A[0] + du * t, w = A[1] + dw * t;
        K.box(MAT.mull, u - 0.025, u + 0.025, hb + SE, topAt(P, u) - 0.32, w - 0.03, w + 0.02, { near: true, c: 0 });
      }
    }
  }
  // the curved glass walls (world coordinates, smooth normals round the corners): the lobby (two storeys, a white line at
  // 6.1 m) and the dark vision strips behind the trays
  const EN = SEQ.map((f) => f.K.F.N), EU = SEQ.map((f) => f.K.F.U), EL = SEQ.map((f) => f.L);
  // the corners as the meeting points of the faces' lines (corner k starts face k); a face that does not start where the one
  // before it ends (an extra ring edge) is reported
  const EP = SEQ.map((f, k) => {
    const A = SEQ[(k + 3) % 4].K.F, B = f.K.F, d = A.U[0] * B.U[1] - A.U[1] * B.U[0];
    if (Math.abs(d) < 1e-3) return B.p0;
    const t = ((B.p0[0] - A.p0[0]) * B.U[1] - (B.p0[1] - A.p0[1]) * B.U[0]) / d;
    const P = [A.p0[0] + A.U[0] * t, A.p0[1] + A.U[1] * t];
    if (Math.hypot(P[0] - B.p0[0], P[1] - B.p0[1]) > 1.5) console.warn(`[fk] ${spec.id}: kravis face ${k} starts ${Math.hypot(P[0] - B.p0[0], P[1] - B.p0[1]).toFixed(1)} m from its corner`);
    return P;
  });
  const outline = (w, r) => {
    const pts = [];
    for (let k = 0; k < 4; k++) {
      const nI = EN[(k + 3) % 4], nO = EN[k], P = EP[k];
      const cx = P[0] + (w - r) * (nI[0] + nO[0]), cz = P[1] + (w - r) * (nI[1] + nO[1]);
      for (let j = 0; j <= 6; j++) {
        const t = (j / 6) * (Math.PI / 2), nx = Math.cos(t) * nI[0] + Math.sin(t) * nO[0], nz = Math.cos(t) * nI[1] + Math.sin(t) * nO[1];
        pts.push([cx + r * nx, cz + r * nz, nx, nz]);
      }
    }
    return pts;
  };
  const glassWall = (mat, w, r, ya, yb2, name, sel = () => true) => {
    const O = outline(w, r), pos = [], nor = [], uv = [];
    for (let k = 0; k < O.length; k++) {
      if (!sel(k)) continue;
      const p = O[k], q = O[(k + 1) % O.length];
      const V = [[p[0], Y0 + ya, p[1], p[2], p[3]], [q[0], Y0 + ya, q[1], q[2], q[3]], [q[0], Y0 + yb2, q[1], q[2], q[3]], [p[0], Y0 + yb2, p[1], p[2], p[3]]];
      for (const i of [0, 2, 1, 0, 3, 2]) { pos.push(V[i][0], V[i][1], V[i][2]); nor.push(V[i][3], 0, V[i][4]); uv.push(0, 0); }
    }
    // the winding: a triangle's geometric normal must agree with the outward normal
    const ax = pos[3] - pos[0], ay = pos[4] - pos[1], az = pos[5] - pos[2], bx = pos[6] - pos[0], by = pos[7] - pos[1], bz = pos[8] - pos[2];
    if ((ay * bz - az * by) * nor[0] + (ax * by - ay * bx) * nor[2] < 0) for (let i = 0; i < pos.length; i += 9) for (let j = 0; j < 3; j++) { const t = pos[i + 3 + j]; pos[i + 3 + j] = pos[i + 6 + j]; pos[i + 6 + j] = t; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.Mesh(g, mat); m.name = 'west:kravis:' + name; m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  };
  glassWall(MAT.lobby, LG, RC - 0.6, -0.3, LOB, 'lobby');
  // the strips: blue-grey vision glass round the S, N and W faces; the E face's dark warm wall from the middle of the SE
  // corner's curve to the middle of the NE one (outline segments 10-16: corner k's curve is points 7k..7k+6)
  glassWall(MAT.dark, GW, RC, LOB, ROOF, 'strips', (k) => k < 10 || k > 16);
  glassWall(MAT.eWall, GW, RC, LOB, ROOF, 'eastwall', (k) => k >= 10 && k <= 16);
  // mullions on the straight runs of both walls, the lobby's white line and its sill
  SEQ.forEach((f) => {
    const { K, L } = f;
    for (const [w, r, ya, yb2, pitch, m] of [[LG, RC - 0.6, 0, LOB, 1.5, MAT.mull], [GW, RC, LOB, ROOF, 1.5, MAT.mull]]) {
      const a = -w + r, b = L + w - r, n = Math.max(1, Math.round((b - a) / pitch));
      for (let k = 0; k <= n; k++) { const u = a + ((b - a) * k) / n; K.box(m, u - 0.03, u + 0.03, ya, yb2, w, w + 0.1, { near: true, c: 0 }); }
    }
    K.box(MAT.edge, -LG + RC - 0.6, L + LG - RC + 0.6, 6.0, 6.3, LG, LG + 0.08, { c: 0.01 });
    K.box(MAT.edge, -LG + RC - 0.6, L + LG - RC + 0.6, -0.3, 0.12, LG - 0.05, LG + 0.12, { c: 0.01 });
  });
  // the roof inside the screen and the plant penthouse
  const F = K0.F;
  const loc = ([x, z]) => { const dx = x - F.p0[0], dz = z - F.p0[1]; return [dx * F.U[0] + dz * F.U[1], dx * F.N[0] + dz * F.N[1]]; };
  K0.poly(MAT.roof, frame.ring.map((p) => { const [u, w] = loc(p); return [u, ROOF + 0.02, w]; }), [0, 1, 0]);
  {
    const S = SEQ[0], D = EL[1], u0 = 7.5, u1 = S.L - 7.5, w0 = -(D - 9.0), w1 = -9.0;
    S.K.box(MAT.pent, u0, u1, ROOF, ROOF + 7.2, w0, w1, { c: 0.03 });
    S.K.box(MAT.louvre, u0 + 1.0, u1 - 1.0, ROOF + 3.4, ROOF + 6.2, w1, w1 + 0.06, { c: 0 });
    for (let y = ROOF + 3.55; y < ROOF + 6.1; y += 0.22) S.K.box(MAT.edge, u0 + 1.0, u1 - 1.0, y, y + 0.05, w1 + 0.04, w1 + 0.12, { near: true, c: 0 });
    S.K.box(MAT.edge, u0 - 0.1, u1 + 0.1, ROOF + 7.2, ROOF + 7.5, w0 - 0.1, w1 + 0.1, { c: 0.02 });
  }
  void EU; void ctx;
}

// ------------------------------------------------------------------ St. Joseph of the Holy Family (140 Morningside Ave)
// The kit builds the nave from the spec; this adds the corner bell tower at the Morningside Avenue end of the 125th
// front (morn_n, 2024-08): red brick, round-arched belfry openings, a brick cornice, a copper pyramid and the cross.
export function stjoseph(group, ctx, spec, frame) {
  const K = frame.kit, br = K.mat('brick_red', { tint: '#8f4c38', dirt: 0.45 }), st = K.mat('stone_lime', { tint: '#cfc6b2' });
  const cu = paintMat('#5f8c78', 0.55, 0.35), dk = paintMat('#1f1c1a', 0.9, 0), wd = paintMat('#2a2320', 0.7, 0.1);
  const a = 0.0, b = 4.6, w0 = -4.6, w1 = 0.15, top = 19.5;
  K.box(br, a, b, -1.0, top, w0, w1, { c: 0.02 });
  for (const y of [5.2, 13.6]) K.box(st, a - 0.05, b + 0.05, y, y + 0.3, w0 - 0.05, w1 + 0.05, { c: 0.01 });
  K.box(br, a - 0.15, b + 0.15, top, top + 0.55, w0 - 0.15, w1 + 0.15, { c: 0.02 });
  // the belfry: two round-headed openings on the 125th face and on the avenue face (dark louvres behind)
  for (const u of [1.05, 2.75]) { K.box(dk, u, u + 0.8, 14.3, 17.4, w1 - 0.02, w1 + 0.005, { c: 0 }); K.box(st, u - 0.05, u + 0.85, 17.4, 17.55, w1, w1 + 0.06, { c: 0.005 }); }
  for (const w of [-3.55, -1.85]) { K.box(dk, a - 0.005, a + 0.02, 14.3, 17.4, w, w + 0.8, { c: 0 }); K.box(st, a - 0.06, a, 17.4, 17.55, w - 0.05, w + 0.85, { c: 0.005 }); }
  K.box(wd, 1.5, 3.1, 0, 3.4, w1, w1 + 0.08, { c: 0.01 });
  // the pyramid and the cross
  const cx = (a + b) / 2, cw = (w0 + w1) / 2, r = 2.55, yb = top + 0.55, yt = yb + 5.0;
  const P = [[cx - r, yb, cw - r], [cx + r, yb, cw - r], [cx + r, yb, cw + r], [cx - r, yb, cw + r]];
  for (let k = 0; k < 4; k++) { const p = P[k], q = P[(k + 1) % 4], mx = (p[0] + q[0]) / 2 - cx, mz = (p[2] + q[2]) / 2 - cw; K.poly(cu, [p, q, [cx, yt, cw]], [mx, r * 0.9, mz]); }
  K.box(cu, cx - 0.06, cx + 0.06, yt - 0.2, yt + 1.6, cw - 0.06, cw + 0.06, { c: 0 });
  K.box(cu, cx - 0.4, cx + 0.4, yt + 0.95, yt + 1.07, cw - 0.06, cw + 0.06, { c: 0 });
  void group; void ctx; void spec;
}
