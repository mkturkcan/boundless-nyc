// AR33 sk: materials for the street surface. The scanned sets come from mat/pbrLib.js (the MATS worker: sidewalk_concrete,
// asphalt_worn, asphalt_patch, curb_granite, curb_steel, detectable_warning, paint_thermo, bus_lane_red, mulch,
// cobble_belgian); it is loaded on its own, so a missing or broken library only drops this part back to the
// procedural fallbacks below (canvas textures drawn here, never photographs). UVs are metres (u along, v across / up).
import * as THREE from 'three';
import { applyLightTrim, applyCityAO } from '../../world/materials.js';

let PBR = null;
export const skMatsReady = import('../mat/pbrLib.js')
  .then((m) => { PBR = m; })
  .catch((e) => { console.warn('[sk] mat/pbrLib.js unavailable, procedural fallbacks', e && e.message); });

// the ground's street calibration (instancer.js STREET_CAL, docs/notes/streets-audit.md §1): anything lying ON the street
// takes it, so the flags and the curb land on the compiled walk's values
const STREET_CAL = [1.94, 1.70, 1.47];

// ---- procedural fallback textures (drawn once, shared)
const _tex = new Map();
function canvasTex(key, size, draw, srgb = true) {
  if (_tex.has(key)) return _tex.get(key);
  let tex = null;
  try {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    draw(g, size);
    tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
  } catch (e) { console.warn('[sk] canvas texture', key, e && e.message); }
  _tex.set(key, tex);
  return tex;
}
// value noise on a torus (tiles seamlessly)
function noiseField(N, cells, seed) {
  const g = new Float32Array(cells * cells);
  let s = seed >>> 0 || 7;
  for (let i = 0; i < g.length; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; g[i] = (s >>> 0) / 4294967296; }
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = (x / N) * cells, fy = (y / N) * cells, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const a = g[(j % cells) * cells + (i % cells)], b = g[(j % cells) * cells + ((i + 1) % cells)];
    const c = g[((j + 1) % cells) * cells + (i % cells)], d = g[((j + 1) % cells) * cells + ((i + 1) % cells)];
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    out[y * N + x] = (a * (1 - su) + b * su) * (1 - sv) + (c * (1 - su) + d * su) * sv;
  }
  return out;
}
function fbmField(N, seed, octaves = [[4, 0.5], [8, 0.25], [16, 0.13], [32, 0.07], [64, 0.05]]) {
  const out = new Float32Array(N * N);
  let k = 0;
  for (const [cells, w] of octaves) { const f = noiseField(N, cells, seed + 31 * (k++)); for (let i = 0; i < out.length; i++) out[i] += f[i] * w; }
  let lo = Infinity, hi = -Infinity;
  for (const v of out) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo + 1e-9);
  return out;
}
function fieldTex(key, N, fn, srgb = true) {
  return canvasTex(key, N, (g, S) => {
    const img = g.createImageData(S, S);
    fn(img.data, S);
    g.putImageData(img, 0, 0);
  }, srgb);
}
// broom-finished concrete, 2 m repeat: warm mid grey, aggregate specks, faint broom lines across
function concreteTex() {
  return fieldTex('concrete', 512, (d, S) => {
    const F = fbmField(S, 11), G = noiseField(S, 128, 5), H = noiseField(S, 256, 9);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x, broom = 0.5 + 0.5 * Math.sin((y / S) * Math.PI * 2 * 180 + G[i] * 3.0);
      let v = 0.80 + 0.14 * (F[i] - 0.5) + 0.05 * (broom - 0.5) * 0.6;
      const sp = H[i]; if (sp > 0.80) v -= (sp - 0.80) * 1.2; else if (sp < 0.10) v += (0.10 - sp) * 0.8;
      d[i * 4] = Math.max(0, Math.min(255, v * 196)); d[i * 4 + 1] = Math.max(0, Math.min(255, v * 190)); d[i * 4 + 2] = Math.max(0, Math.min(255, v * 178)); d[i * 4 + 3] = 255;
    }
  });
}
// weathered steel (the curb facing): dark grey-brown with rust blooms and polished scuffs
function steelTex() {
  return fieldTex('steel', 256, (d, S) => {
    const F = fbmField(S, 23), R = fbmField(S, 29, [[8, 0.5], [16, 0.3], [32, 0.2]]);
    for (let i = 0; i < S * S; i++) {
      const rust = Math.max(0, R[i] - 0.55) * 2.2, v = 0.34 + 0.18 * F[i];
      d[i * 4] = Math.min(255, (v + rust * 0.30) * 170); d[i * 4 + 1] = Math.min(255, (v + rust * 0.12) * 160); d[i * 4 + 2] = Math.min(255, (v - rust * 0.05) * 150); d[i * 4 + 3] = 255;
    }
  });
}
// cast iron (covers, plates): near-black with rust in the recesses
function ironTex() {
  return fieldTex('iron', 256, (d, S) => {
    const F = fbmField(S, 41);
    for (let i = 0; i < S * S; i++) { const v = 0.20 + 0.16 * F[i]; d[i * 4] = v * 190; d[i * 4 + 1] = v * 170; d[i * 4 + 2] = v * 150; d[i * 4 + 3] = 255; }
  });
}
// tree-pit soil with shredded-bark mulch
function mulchTex() {
  return fieldTex('mulch', 512, (d, S) => {
    const F = fbmField(S, 53), G = noiseField(S, 160, 3), H = noiseField(S, 90, 17);
    for (let i = 0; i < S * S; i++) {
      const chip = G[i] > 0.62 ? 1 : 0, v = 0.35 + 0.25 * F[i] + chip * 0.18 - (H[i] < 0.2 ? 0.12 : 0);
      d[i * 4] = Math.min(255, v * 150); d[i * 4 + 1] = Math.min(255, v * 104); d[i * 4 + 2] = Math.min(255, v * 70); d[i * 4 + 3] = 255;
    }
  });
}
const FALLBACK = {
  sidewalk_concrete: () => ({ map: concreteTex(), color: 0xffffff, roughness: 0.9, metalness: 0 }),
  curb_concrete: () => ({ map: concreteTex(), color: 0xe4ded2, roughness: 0.88, metalness: 0 }),
  curb_granite: () => ({ map: concreteTex(), color: 0xb8b4ac, roughness: 0.74, metalness: 0 }),
  curb_steel: () => ({ map: steelTex(), color: 0xffffff, roughness: 0.62, metalness: 0.55 }),
  detectable_warning: () => ({ map: ironTex(), color: 0xc8c6c2, roughness: 0.58, metalness: 0.35 }),
  iron: () => ({ map: ironTex(), color: 0xffffff, roughness: 0.55, metalness: 0.45 }),
  mulch: () => ({ map: mulchTex(), color: 0xffffff, roughness: 0.97, metalness: 0 }),
  paint_thermo: () => ({ color: 0xe8e6de, roughness: 0.6, metalness: 0 }),
  asphalt_worn: () => ({ color: 0x3a3a3a, roughness: 0.95, metalness: 0 }),
};
// UV metres -> texture repeat for the fallbacks (their canvases span these metres)
const FB_SPAN = { sidewalk_concrete: 2.0, curb_concrete: 2.0, curb_granite: 2.0, curb_steel: 1.0, detectable_warning: 0.5, iron: 1.0, mulch: 1.2 };

const _mats = new Map();
// a material for sk meshes: vertex colours on (per-flag tone, joint grime), the street calibration, and an optional
// depth pull (overlays laid over the compiled ground: polygonOffset in the ground's own depth units)
export function skMat(name, opts = {}) {
  const key = name + JSON.stringify(opts);
  if (_mats.has(key)) return _mats.get(key);
  let m = null;
  if (PBR && (!PBR.pbrHas || PBR.pbrHas(name))) {
    try {
      m = PBR.pbrMaterial(name, { seed: 733 + (opts.seed || 0), ...(opts.pbr || {}) });
      if (m && m.isMaterial) { m = m; m.vertexColors = true; m.needsUpdate = true; }
    } catch (e) { console.warn('[sk] pbrMaterial', name, e && e.message); m = null; }
  }
  if (!m) {
    const f = (FALLBACK[name] || FALLBACK.sidewalk_concrete)();
    const span = FB_SPAN[name] || 2.0;
    if (f.map) { f.map = f.map.clone(); f.map.repeat.set(1 / span, 1 / span); f.map.needsUpdate = true; }
    m = applyLightTrim(applyCityAO(new THREE.MeshStandardMaterial({ ...f, vertexColors: true })), STREET_CAL);
    m.name = 'sk:' + name;
  }
  if (opts.pull) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -opts.pull; }
  _mats.set(key, m);
  return m;
}
export const skUsesPbr = () => !!PBR;

// ---- the covers' atlas: Con Edison and DEP round covers, the catch-basin grate, a valve cap and diamond plate, drawn from
// scratch on one 1024 x 1024 sheet (colour + a height field turned into a normal map). Rects: skCovers.ATLAS.
let _cover = null;
export function skCoverMat() {
  if (_cover) return _cover;
  const N = 1024;
  const mk = () => { const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(N, N) : document.createElement('canvas'); c.width = N; c.height = N; return c; };
  let map = null, nrm = null;
  try {
    const Hc = mk(), hg = Hc.getContext('2d');
    hg.fillStyle = 'rgb(120,120,120)'; hg.fillRect(0, 0, N, N);
    const text = (g, str, cx, cy, r, a0, a1, font, fill) => {   // along an arc
      g.save(); g.translate(cx, cy); g.font = font; g.fillStyle = fill; g.textAlign = 'center'; g.textBaseline = 'middle';
      const n = str.length;
      for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (n === 1 ? 0.5 : i / (n - 1)); g.save(); g.rotate(a); g.translate(0, -r); g.fillText(str[i], 0, 0); g.restore(); }
      g.restore();
    };
    const ring = (g, cx, cy, r0, r1, fill) => { g.beginPath(); g.arc(cx, cy, r1, 0, Math.PI * 2); g.arc(cx, cy, r0, 0, Math.PI * 2, true); g.fillStyle = fill; g.fill('evenodd'); };
    // ---- Con Edison (0,0)-(512,512)
    {
      const cx = 256, cy = 256;
      hg.fillStyle = 'rgb(150,150,150)'; hg.beginPath(); hg.arc(cx, cy, 252, 0, 7); hg.fill();
      ring(hg, cx, cy, 228, 250, 'rgb(215,215,215)');
      ring(hg, cx, cy, 210, 222, 'rgb(70,70,70)');
      // a 45 degree diamond grid in the field
      hg.save(); hg.beginPath(); hg.arc(cx, cy, 160, 0, 7); hg.clip(); hg.fillStyle = 'rgb(205,205,205)';
      for (let k = -600; k < 600; k += 26) { hg.save(); hg.translate(cx, cy); hg.rotate(Math.PI / 4); hg.fillRect(k, -400, 9, 800); hg.rotate(Math.PI / 2); hg.fillRect(k, -400, 9, 800); hg.restore(); }
      hg.restore();
      text(hg, 'CON EDISON', cx, cy, 186, -0.95, 0.95, 'bold 50px Arial', 'rgb(230,230,230)');
      hg.save(); hg.translate(cx, cy); hg.rotate(Math.PI); text(hg, 'ELECTRIC', 0, 0, 186, -0.6, 0.6, 'bold 40px Arial', 'rgb(230,230,230)'); hg.restore();
      hg.fillStyle = 'rgb(20,20,20)'; hg.fillRect(cx - 28, cy - 120 - 6, 56, 12); hg.fillRect(cx - 28, cy + 120 - 6, 56, 12);   // pick slots
    }
    // ---- DEP (512,0)-(1024,512)
    {
      const cx = 768, cy = 256;
      hg.fillStyle = 'rgb(150,150,150)'; hg.beginPath(); hg.arc(cx, cy, 252, 0, 7); hg.fill();
      ring(hg, cx, cy, 232, 250, 'rgb(215,215,215)');
      hg.save(); hg.beginPath(); hg.arc(cx, cy, 214, 0, 7); hg.clip();
      hg.fillStyle = 'rgb(205,205,205)'; for (let y = cy - 230; y < cy + 230; y += 34) hg.fillRect(cx - 240, y, 480, 13);
      hg.fillStyle = 'rgb(110,110,110)'; hg.fillRect(cx - 240, cy - 52, 480, 104);
      hg.restore();
      hg.fillStyle = 'rgb(235,235,235)'; hg.font = 'bold 56px Arial'; hg.textAlign = 'center'; hg.textBaseline = 'middle';
      hg.fillText('NYC DEP', cx, cy - 18); hg.font = 'bold 40px Arial'; hg.fillText('SEWER', cx, cy + 26);
    }
    // ---- catch-basin grate (0,512)-(512,768): bars across the short axis over a black void
    {
      const x0 = 0, y0 = 512, w = 512, h = 256;
      hg.fillStyle = 'rgb(30,30,30)'; hg.fillRect(x0, y0, w, h);
      hg.fillStyle = 'rgb(215,215,215)'; hg.fillRect(x0 + 6, y0 + 6, w - 12, 20); hg.fillRect(x0 + 6, y0 + h - 26, w - 12, 20); hg.fillRect(x0 + 6, y0 + 6, 20, h - 12); hg.fillRect(x0 + w - 26, y0 + 6, 20, h - 12);
      for (let x = x0 + 40; x < x0 + w - 36; x += 33) hg.fillRect(x, y0 + 20, 15, h - 40);
      hg.fillRect(x0 + 20, y0 + h / 2 - 7, w - 40, 14);
    }
    // ---- valve cap (0,768)-(256,1024)
    {
      const cx = 128, cy = 896;
      hg.fillStyle = 'rgb(150,150,150)'; hg.beginPath(); hg.arc(cx, cy, 124, 0, 7); hg.fill();
      ring(hg, cx, cy, 104, 120, 'rgb(215,215,215)');
      hg.fillStyle = 'rgb(225,225,225)'; hg.font = 'bold 54px Arial'; hg.textAlign = 'center'; hg.textBaseline = 'middle'; hg.fillText('WATER', cx, cy);
      hg.fillStyle = 'rgb(60,60,60)'; hg.fillRect(cx - 12, cy + 34, 24, 10);
    }
    // ---- diamond plate (512,512)-(1024,1024): alternating lozenges
    {
      hg.fillStyle = 'rgb(105,105,105)'; hg.fillRect(512, 512, 512, 512);
      hg.fillStyle = 'rgb(200,200,200)';
      for (let j = 0; j < 14; j++) for (let i = 0; i < 14; i++) {
        hg.save(); hg.translate(512 + 18 + i * 36 + (j % 2) * 0, 512 + 18 + j * 36); hg.rotate(((i + j) % 2) ? Math.PI / 4 : -Math.PI / 4);
        hg.beginPath(); hg.ellipse(0, 0, 15, 4.5, 0, 0, 7); hg.fill(); hg.restore();
      }
    }
    // ---- road plate (256,901)-(512,1024): a worn steel sheet, a groove round the edge, four lifting holes, weld beads
    {
      hg.fillStyle = 'rgb(118,118,118)'; hg.fillRect(256, 901, 256, 123);
      hg.fillStyle = 'rgb(70,70,70)'; hg.fillRect(262, 907, 244, 4); hg.fillRect(262, 1013, 244, 4); hg.fillRect(262, 907, 4, 110); hg.fillRect(502, 907, 4, 110);
      hg.fillStyle = 'rgb(20,20,20)'; for (const [px, py] of [[276, 921], [492, 921], [276, 1003], [492, 1003]]) { hg.beginPath(); hg.arc(px, py, 7, 0, 7); hg.fill(); }
      hg.fillStyle = 'rgb(165,165,165)'; hg.fillRect(300, 960, 168, 5); hg.fillRect(380, 925, 5, 80);
    }
    // the plain collar colour
    hg.fillStyle = 'rgb(128,128,128)'; hg.fillRect(300, 819, 40, 20);
    const hd = hg.getImageData(0, 0, N, N).data;
    const Hh = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) Hh[i] = hd[i * 4] / 255;
    // colour from height: dark cast iron, the raised parts worn lighter, speckled
    const cimg = new ImageData(N, N), nimg = new ImageData(N, N);
    let s = 12345;
    const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, h = Hh[i];
      const xr = x < 512 ? 0 : 1, yr = y < 512 ? 0 : (y < 768 ? 1 : 2);
      let r, g, b;
      if (x >= 512 && y >= 512) { const t = 0.30 + 0.45 * h; r = 70 * t * 2.0; g = 72 * t * 2.0; b = 75 * t * 2.0; }        // diamond plate: galvanised grey
      else if (x >= 300 && x < 340 && y >= 819 && y < 839) { r = 54; g = 48; b = 42; }                                       // collar
      else if (x >= 256 && x < 512 && y >= 901) { const t = 0.35 + 0.55 * h; r = 96 * t * 1.35; g = 88 * t * 1.35; b = 80 * t * 1.3; if (h < 0.2) { r = 12; g = 12; b = 12; } }   // road plate: rusty steel
      else { const t = 0.25 + 0.75 * h * h; r = 30 + 62 * t; g = 28 + 56 * t; b = 26 + 50 * t; if (h < 0.3) { r *= 0.45; g *= 0.45; b *= 0.45; } }
      const n = 0.88 + 0.24 * rnd();
      cimg.data[i * 4] = Math.min(255, r * n); cimg.data[i * 4 + 1] = Math.min(255, g * n); cimg.data[i * 4 + 2] = Math.min(255, b * n); cimg.data[i * 4 + 3] = 255;
      const xm = Hh[y * N + Math.max(0, x - 1)], xp = Hh[y * N + Math.min(N - 1, x + 1)], ym = Hh[Math.max(0, y - 1) * N + x], yp = Hh[Math.min(N - 1, y + 1) * N + x];
      // v runs down the sheet (flipY off, below): the bitangent points to the next row, so the slope there is -(dh/drow)
      let nx = -(xp - xm) * 5.0, ny = -(yp - ym) * 5.0, nz = 1; const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
      nimg.data[i * 4] = (nx * 0.5 + 0.5) * 255; nimg.data[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; nimg.data[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; nimg.data[i * 4 + 3] = 255;
    }
    const Cc = mk(), Nc = mk();
    Cc.getContext('2d').putImageData(cimg, 0, 0); Nc.getContext('2d').putImageData(nimg, 0, 0);
    // ATLAS rects are sheet fractions from the TOP-left corner: no flip (a flipped sheet put the grate and the diamond plate
    // inside the manhole discs and a cover's lettering, stretched, on every road plate; plates sbs_w2r1/a_b4_lenox.jpg)
    map = new THREE.CanvasTexture(Cc); map.flipY = false; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8; map.generateMipmaps = true; map.needsUpdate = true;
    nrm = new THREE.CanvasTexture(Nc); nrm.flipY = false; nrm.anisotropy = 8; nrm.needsUpdate = true;
  } catch (e) { console.warn('[sk] cover atlas', e && e.message); }
  const m = new THREE.MeshStandardMaterial({ map, normalMap: nrm, normalScale: new THREE.Vector2(1.4, 1.4), color: 0xffffff, roughness: 0.58, metalness: 0.32, vertexColors: true });
  _cover = applyLightTrim(applyCityAO(m), STREET_CAL);
  _cover.name = 'sk:cover';
  _cover.polygonOffset = true; _cover.polygonOffsetFactor = -1; _cover.polygonOffsetUnits = -9;
  return _cover;
}
