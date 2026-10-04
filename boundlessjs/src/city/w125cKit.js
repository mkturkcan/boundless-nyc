// AR32C kit: the Apollo Theater's front (253 W 125th St) as pieces in the facade's frame, merged per material.
// Frame: origin at the 125th Street frontage's west end on the pavement, +x along the frontage to its east end, +z out
// over the sidewalk, y up; the compiled wall is the plane z = 0 (w125cData.js APOLLO, FACADE).
// References (docs/notes/area-w125c.md, Wikimedia Commons, look-only): a1 "Apollo Theatre from west.jpg" (day: the pale
// grey terracotta front, four bays between fluted Ionic pilasters, the cornice and balustrade, the cream blade sign with
// red letters, the rooftop sign frame, the steel marquee with its crest), a2 "The Apollo at Night 07.jpg" (night: the
// blade's yellow neon letters on a maroon field inside a red tube border, the crest's letters, the marquee's two blue
// tube lines top and bottom, the soffit's down-lights), a3 "Apollo Theater Harlem NYC 2010.JPG" (the front at night from
// across the street: the red glow the blade throws on the terracotta).
// Signs: two 2048 x 1024 canvases drawn from scratch, the day face (lit by the scene) and the night light (emissive,
// scaled by ENV.night): only 'APOLLO' and 'AMATEUR NIGHT' are lettered.
import * as THREE from 'three';
import { ENV, applyLightTrim as LT, applyStoneDetail } from '../world/materials.js';
import { loadAdFonts } from './adArt.js';
import { buildSign } from './fk/signKit.js';
import { neonContours } from './fk/signNeon.js';
import { parseFont, fontCSS, fontReady } from './fk/signPaint.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { APOLLO, FACADE } from './w125cData.js';

// ---------------------------------------------------------------- the sign atlas
const AW = 2048, AH = 1024;
export const CELLS = {
  blade: [0, 0, 176, 1024],        // a blade face, 2.5 x 14.2 m
  bladeEdge: [184, 0, 40, 1024],   // its street edge, 0.55 m
  crest: [232, 0, 760, 200],       // the marquee's APOLLO crest, 5.2 x 1.35 m
  crestE: [232, 208, 420, 128],    // the small crest at the east end, 2.8 x 0.85 m
  board: [232, 420, 1600, 180],    // the front reader boards (13.9 x 1.6 m incl. the mullion)
  boardEnd: [1000, 0, 450, 200],   // an end's board (3.6 x 1.6 m)
  soffit: [1000, 208, 640, 200],   // the underside with its down-lights (13.4 x 4.0 m)
  steelC: [1600, 0, 16, 16],       // flat colours for tube and frame pieces
  smBlade: [240, 610, 70, 414],    // the Studio Museum's vertical sign (1.1 x 6.5 m)
  smFascia: [330, 610, 900, 60],   // its name over the entrance (7.5 x 0.5 m)
  // AR33 (buildApollo33): the 2024 marquee's LED boards, the APOLLO outline letters over the east shop
  shopBand: [330, 690, 1000, 150], // 6.4 x 1.15 m (u 7.4-13.8, y 2.75-3.9)
  ledFront: [1340, 690, 700, 150], // the front board, 7.0 x 1.5 m
  ledEnd: [1340, 850, 440, 150],   // an end board, 4.4 x 1.5 m
};
const FONT = (w, px, fam) => `${w} ${px}px ${fam}`;
const SANS = '"Montserrat", "Arial Black", Arial, sans-serif';
const COND = '"Anton", "Bebas Neue", Impact, "Arial Narrow", sans-serif';
// text fitted into a box (centre cx, cy; max width mw, cap height px)
function fitText(c, s, cx, cy, mw, px, fam, weight = 700, stroke = 0) {
  c.font = FONT(weight, px, fam);
  const w = c.measureText(s).width;
  const k = w > mw ? mw / w : 1;
  c.save(); c.translate(cx, cy); c.scale(k, 1);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  if (stroke) c.strokeText(s, 0, 0); else c.fillText(s, 0, 0);
  c.restore();
}
function rrect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h);
  c.lineTo(x, y + h); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
// neon: a letter drawn as a wide soft glow, then the tube (two strokes: colour and a hot core)
function neonText(c, s, cx, cy, mw, px, fam, col, core, width) {
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  c.shadowColor = col; c.shadowBlur = width * 3;
  c.strokeStyle = col; c.lineWidth = width * 1.6; fitText(c, s, cx, cy, mw, px, fam, 700, 1);
  c.shadowBlur = 0; c.strokeStyle = core; c.lineWidth = width * 0.55; fitText(c, s, cx, cy, mw, px, fam, 700, 1);
  c.restore();
}
function paint(c, night) {
  // the day atlas is transparent outside its cells (the crests' rounded corners are cut by alphaTest)
  if (night) { c.fillStyle = '#000'; c.fillRect(0, 0, AW, AH); } else c.clearRect(0, 0, AW, AH);
  // -- the blade: day a cream field, red channel letters, a silver rim; night a maroon field, yellow tubes, red border
  {
    const [x, y, w, h] = CELLS.blade;
    c.fillStyle = night ? '#2a0504' : '#dcc58a'; c.fillRect(x, y, w, h);
    if (!night) { c.strokeStyle = '#c9ccd0'; c.lineWidth = 8; c.strokeRect(x + 4, y + 4, w - 8, h - 8); }
    else {
      c.save(); c.shadowColor = '#ff2010'; c.shadowBlur = 14; c.strokeStyle = '#ff3420'; c.lineWidth = 6;
      c.strokeRect(x + 12, y + 12, w - 24, h - 24); c.restore();
    }
    const L = 'APOLLO', step = (h - 80) / 6;
    for (let i = 0; i < 6; i++) {
      const cy = y + 40 + step * (i + 0.5);
      if (night) neonText(c, L[i], x + w / 2, cy, w * 0.78, step * 0.86, SANS, '#ff7a18', '#fff2a0', 7);
      else { c.fillStyle = '#c11d24'; fitText(c, L[i], x + w / 2, cy, w * 0.78, step * 0.86, SANS, 800); c.strokeStyle = '#7d0f14'; c.lineWidth = 3; fitText(c, L[i], x + w / 2, cy, w * 0.78, step * 0.86, SANS, 800, 1); }
    }
  }
  {
    const [x, y, w, h] = CELLS.bladeEdge;
    c.fillStyle = night ? '#1a0302' : '#c7cacd'; c.fillRect(x, y, w, h);
    if (night) { c.save(); c.shadowColor = '#ff2010'; c.shadowBlur = 10; c.fillStyle = '#ff3a22'; c.fillRect(x + w / 2 - 3, y + 8, 6, h - 16); c.restore(); }
  }
  // -- the crest: a cream field with rounded top corners; day red letters, night orange tubes in a red outline
  {
    const [x, y, w, h] = CELLS.crest;
    rrect(c, x + 2, y + 2, w - 4, h - 4, 46); c.fillStyle = night ? '#2c0605' : '#e2cc92'; c.fill();
    if (night) {
      c.save(); rrect(c, x + 10, y + 10, w - 20, h - 20, 40); c.shadowColor = '#ff2a12'; c.shadowBlur = 10; c.strokeStyle = '#ff4020'; c.lineWidth = 4; c.stroke(); c.restore();
      c.save(); c.shadowColor = '#ff1a10'; c.shadowBlur = 12; c.strokeStyle = '#ff2a14'; c.lineWidth = 16; c.lineJoin = 'round';
      fitText(c, 'APOLLO', x + w / 2, y + h * 0.56, w * 0.86, h * 0.78, SANS, 800, 1); c.restore();
      neonText(c, 'APOLLO', x + w / 2, y + h * 0.56, w * 0.86, h * 0.78, SANS, '#ff9a20', '#fff4b0', 5);
    } else {
      c.fillStyle = '#c41e25'; fitText(c, 'APOLLO', x + w / 2, y + h * 0.56, w * 0.86, h * 0.78, SANS, 800);
    }
  }
  {
    const [x, y, w, h] = CELLS.crestE;
    rrect(c, x + 2, y + 2, w - 4, h - 4, 30); c.fillStyle = night ? '#1c0504' : '#e2cc92'; c.fill();
  }
  // -- the reader boards: day pale panels with black letters, night white light behind them
  const board = (x, y, w, h, lines) => {
    c.fillStyle = night ? '#dfe8ff' : '#d4d8d6'; c.fillRect(x, y, w, h);
    c.fillStyle = night ? '#05070a' : '#16181b';
    for (const [s, fy, fh, fam] of lines) fitText(c, s, x + w / 2, y + h * fy, w * 0.9, h * fh, fam, 400);
  };
  {
    const [x, y, w, h] = CELLS.board;
    c.fillStyle = night ? '#000' : '#9aa0a5'; c.fillRect(x, y, w, h);
    const split = Math.round(w * 0.34);
    board(x + 6, y + 8, split - 16, h - 16, [['AMATEUR NIGHT', 0.36, 0.34, COND], ['WEDNESDAYS', 0.72, 0.24, COND]]);
    board(x + split + 10, y + 8, w - split - 16, h - 16, [['AMATEUR NIGHT', 0.4, 0.46, COND], ['EVERY WEDNESDAY 7:30 PM', 0.78, 0.2, COND]]);
  }
  {
    const [x, y, w, h] = CELLS.boardEnd;
    c.fillStyle = night ? '#000' : '#9aa0a5'; c.fillRect(x, y, w, h);
    board(x + 8, y + 8, w - 16, h - 16, [['APOLLO', 0.34, 0.36, COND], ['AMATEUR NIGHT', 0.72, 0.28, COND]]);
  }
  // -- the soffit: a dark coffered underside, rows of round down-lights, the ornamental edge
  {
    const [x, y, w, h] = CELLS.soffit;
    c.fillStyle = night ? '#140f08' : '#3b3a37'; c.fillRect(x, y, w, h);
    c.fillStyle = night ? '#2a1e10' : '#58564f'; c.fillRect(x, y, w, 14); c.fillRect(x, y + h - 14, w, 14); c.fillRect(x, y, 14, h); c.fillRect(x + w - 14, y, 14, h);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 18; k++) {
      const bx = x + 28 + (k * (w - 56)) / 17, by = y + 34 + (r * (h - 68)) / 3;
      if (night) { c.save(); c.shadowColor = '#ffd890'; c.shadowBlur = 10; c.fillStyle = '#fff3d0'; c.beginPath(); c.arc(bx, by, 6, 0, Math.PI * 2); c.fill(); c.restore(); }
      else { c.fillStyle = '#e8e2d2'; c.beginPath(); c.arc(bx, by, 5, 0, Math.PI * 2); c.fill(); }
    }
  }
  { const [x, y, w, h] = CELLS.steelC; c.fillStyle = night ? '#000' : '#b9bdc1'; c.fillRect(x, y, w, h); }
  // -- the Studio Museum's own signs (s1): white letters on the charcoal, lit from behind after dark
  {
    const [x, y, w, h] = CELLS.smBlade;
    c.fillStyle = night ? '#060606' : '#2c2d2f'; c.fillRect(x, y, w, h);
    c.save(); c.translate(x + w / 2, y + h / 2); c.rotate(Math.PI / 2); c.fillStyle = night ? '#f2f1ec' : '#e9e8e4';
    fitText(c, 'STUDIO MUSEUM', 0, 0, h * 0.9, w * 0.62, SANS, 600); c.restore();
  }
  {
    const [x, y, w, h] = CELLS.smFascia;
    c.fillStyle = night ? '#060606' : '#2c2d2f'; c.fillRect(x, y, w, h);
    c.fillStyle = night ? '#f2f1ec' : '#e9e8e4'; fitText(c, 'STUDIO MUSEUM IN HARLEM', x + w / 2, y + h * 0.54, w * 0.92, h * 0.62, SANS, 600);
  }
  // -- AR33: the APOLLO outline letters on the cream band over the east shop (2024-08: thin red-orange outlines of wide
  // round capitals on a warm cream field, the letters filling the band's height)
  {
    const [x, y, w, h] = CELLS.shopBand;
    c.fillStyle = night ? '#1a0f08' : '#efe2cf'; c.fillRect(x, y, w, h);
    c.save(); c.lineJoin = 'round';
    if (night) { c.shadowColor = '#ff5a1e'; c.shadowBlur = 6; }
    c.strokeStyle = night ? '#ff7a3a' : '#d9542e'; c.lineWidth = night ? 3.2 : 2.6;
    fitText(c, 'APOLLO', x + w / 2, y + h * 0.53, w * 0.94, h * 0.9, SANS, 500, 1);
    c.restore();
  }
  // -- AR33: the LED boards (full-colour screens since the 2020s): drawn as lit dot-matrix content on a black field
  const led = (x, y, w, h, lines) => {
    c.fillStyle = '#050608'; c.fillRect(x, y, w, h);
    const g = c.createLinearGradient(x, y, x, y + h); g.addColorStop(0, night ? '#2a0a3a' : '#1a0826'); g.addColorStop(1, night ? '#08163a' : '#061028');
    c.fillStyle = g; c.fillRect(x + 3, y + 3, w - 6, h - 6);
    for (const [s, fy, fh, col, fam] of lines) { c.fillStyle = col; fitText(c, s, x + w / 2, y + h * fy, w * 0.9, h * fh, fam, 700); }
    // the LED pitch: a faint dark grid over everything
    c.fillStyle = 'rgba(0,0,0,0.28)';
    for (let gx = x + 3; gx < x + w - 3; gx += 3) c.fillRect(gx, y + 3, 1, h - 6);
    for (let gy = y + 3; gy < y + h - 3; gy += 3) c.fillRect(x + 3, gy, w - 6, 1);
  };
  { const [x, y, w, h] = CELLS.ledFront; led(x, y, w, h, [['AMATEUR NIGHT', 0.36, 0.34, '#ffd24a', COND], ['EVERY WEDNESDAY  7:30 PM', 0.72, 0.2, '#ffffff', COND]]); }
  { const [x, y, w, h] = CELLS.ledEnd; led(x, y, w, h, [['APOLLO', 0.38, 0.38, '#ff3b3b', COND], ['125TH STREET', 0.74, 0.2, '#ffffff', COND]]); }
}
let _texD = null, _texN = null;
function atlases() {
  if (_texD) return [_texD, _texN];
  const mk = (night) => {
    const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
    paint(cv.getContext('2d'), night);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return [t, cv];
  };
  const [d, cd] = mk(false), [n, cn] = mk(true);
  _texD = d; _texN = n;
  loadAdFonts().then(() => { paint(cd.getContext('2d'), false); paint(cn.getContext('2d'), true); d.needsUpdate = true; n.needsUpdate = true; });
  return [_texD, _texN];
}

// ---------------------------------------------------------------- materials
let _M = null;
// the red light the blade throws on the terracotta and the marquee's warm spill on the storey above it, after dark
// (a3): added as emission from a vertical segment (the blade's axis), world uniforms set from the placed frame
const GLOW = { blade: { value: new THREE.Vector3() }, span: { value: new THREE.Vector2() }, base: { value: 0 } };
function glowSkin(mat) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.a32Night = ENV.night; sh.uniforms.a32Blade = GLOW.blade; sh.uniforms.a32Span = GLOW.span; sh.uniforms.a32Base = GLOW.base;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vA32w;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvA32w = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vA32w; uniform float a32Night; uniform vec3 a32Blade; uniform vec2 a32Span; uniform float a32Base;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec3 q = vec3(a32Blade.x, clamp(vA32w.y, a32Span.x, a32Span.y), a32Blade.z);
        vec3 dd = vA32w - q; float r2 = dot(dd, dd);
        float up = vA32w.y - a32Base;
        totalEmissiveRadiance += a32Night * (vec3(1.0, 0.12, 0.05) * 0.5 / (1.0 + r2 * 0.22)
          + vec3(1.0, 0.86, 0.66) * 0.09 * smoothstep(12.5, 6.5, up) * step(6.9, up) + vec3(0.9, 0.78, 0.66) * 0.008);
      }`);
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey.call(mat) : '') + '|a32glow';
  mat.needsUpdate = true;
  return mat;
}
// the lit signs: the day face lit by the scene, the night light as emission scaled by ENV.night
function signMat() {
  const [d, n] = atlases();
  const m = LT(new THREE.MeshStandardMaterial({ map: d, emissiveMap: n, emissive: 0xffffff, roughness: 0.5, metalness: 0.05, alphaTest: 0.5 }));
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.a32N = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float a32N;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= a32N * 1.1;');
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|a32sign';
  return m;
}
// neon tubes (the marquee's blue lines): pale glass by day, lit after dark
function tubeMat(day, nightCol) {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.a32N = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float a32N;')
      .replace('#include <fog_fragment>', `gl_FragColor.rgb = mix(vec3(${day.join(', ')}), vec3(${nightCol.join(', ')}), a32N);\n#include <fog_fragment>`);
  };
  m.customProgramCacheKey = () => 'a32tube' + day.join(',') + nightCol.join(',');
  return m;
}
// emission only after dark (ENV.night), for glass lit from inside
function nightLit(m) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.a32L = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float a32L;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= a32L;');
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|a32lit';
  return m;
}
export function kitMats() {
  if (_M) return _M;
  const S = (o) => LT(new THREE.MeshStandardMaterial(o));
  _M = {
    // glazed terracotta, pale warm grey (a1), the stone grain mean-preserving
    tc: glowSkin(applyStoneDetail(S({ color: 0xd6d2c8, roughness: 0.5, metalness: 0.02 }), 'climestone', { amt: 0.35, nrm: 0.35, rgh: 0.25, scale: 0.6 })),
    tcD: glowSkin(S({ color: 0xb9b4a9, roughness: 0.6, metalness: 0.02 })),   // shadowed mouldings, the shields
    glass: S({ color: 0x2b343b, roughness: 0.1, metalness: 0.45 }),
    steel: S({ color: 0xb3b8bd, roughness: 0.3, metalness: 0.65 }),          // the marquee's stainless frame
    dark: S({ color: 0x1d1f22, roughness: 0.5, metalness: 0.5 }),            // the rooftop frame, brackets
    bronze: S({ color: 0x4a3b2c, roughness: 0.45, metalness: 0.5 }),         // the doors' frames
    sign: signMat(),
    tubeB: tubeMat([0.62, 0.68, 0.76], [0.22, 0.48, 1.35]),
    cloth: S({ color: 0xffffff, vertexColors: true, roughness: 0.92 }),
    goods: S({ color: 0xffffff, vertexColors: true, roughness: 0.75 }),
    canvas: S({ color: 0xe9e7e0, roughness: 0.85, side: THREE.DoubleSide }),
    pole: S({ color: 0x9a9ea3, roughness: 0.4, metalness: 0.6 }),
    // the Studio Museum: charcoal precast (s1), and its glass lit from inside after dark
    char: applyStoneDetail(S({ color: 0x35363a, roughness: 0.84, metalness: 0.02 }), 'cpave', { amt: 0.3, nrm: 0.4, rgh: 0.2, scale: 0.8 }),
    glassLit: nightLit(S({ color: 0x2c363d, roughness: 0.08, metalness: 0.45, emissive: 0xffe4c0, emissiveIntensity: 0.5 })),
  };
  return _M;
}

// ---------------------------------------------------------------- geometry helpers (as city/tsqKit.js)
const _B = new THREE.BoxGeometry(1, 1, 1);
function mtx(x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
}
// a box spanning x0..x1, y0..y1, z0..z1 (frame metres)
const bx = (x0, x1, y0, y1, z0, z1) => [_B, mtx((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0)];
function cellUv(g, cell) {
  const [cx, cy, cw, ch] = CELLS[cell], uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i) * cw) / AW, 1 - (cy + (1 - uv.getY(i)) * ch) / AH);
  return g;
}
// a quad showing an atlas cell, centred at (x, y, z), facing +z turned by ry (and rx)
const panel = (cell, w, h, x, y, z, ry = 0, rx = 0) => [cellUv(new THREE.PlaneGeometry(w, h), cell), mtx(x, y, z, 1, 1, 1, ry, rx)];
// merge [geometry, matrix, colour?] parts (position, normal, uv, and a colour when any part carries one)
function merge(parts, place) {
  const pos = [], nor = [], uvs = [], cols = [], anyC = parts.some((p) => p[2]);
  for (const [g0, m, c] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0.clone();
    g.applyMatrix4(place ? place.clone().multiply(m) : m);
    const p = g.getAttribute('position'), u = g.getAttribute('uv');
    for (let i = 0; i < p.array.length; i++) pos.push(p.array[i]);
    const na = g.getAttribute('normal').array; for (let i = 0; i < na.length; i++) nor.push(na[i]);
    if (u) for (let i = 0; i < u.array.length; i++) uvs.push(u.array[i]); else for (let i = 0; i < p.count; i++) uvs.push(0, 0);
    if (anyC) { const cc = c || new THREE.Color(1, 1, 1); for (let i = 0; i < p.count; i++) cols.push(cc.r, cc.g, cc.b); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (anyC) out.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  out.computeBoundingSphere();
  return out;
}

// ---------------------------------------------------------------- vendors' tables
// a folding table 1.8 x 0.76 m at 0.76 m under a cloth to the ground, goods on top, a stool behind; kind 0 a 3 x 3 m pop-up
// tent (white canopy, four legs), 1 a 2.2 m beach umbrella on a pole, 2 bare. Frame: +z the side the buyers stand on.
const CLOTHS = [0x1d2b4f, 0x7a1c1c, 0x1f4a2a, 0x2a2a2e, 0x5a2a5e, 0x8a6a1e];
const GOODS = [0xd8c8a0, 0x9e2b25, 0x2d5d8a, 0xe2a33a, 0x3b3b3b, 0xf0f0ea, 0x6b8e3a, 0xb84a8a];
export function vendorParts(kind, seed) {
  const R = (k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  const P = { cloth: [], goods: [], canvas: [], pole: [], dark: [] };
  const col = (hex) => new THREE.Color(hex);
  P.cloth.push([...bx(-0.92, 0.92, 0.02, 0.78, -0.4, 0.4), col(CLOTHS[Math.floor(R(1) * CLOTHS.length)])]);
  for (let i = 0; i < 7; i++) {   // stacks of goods: caps, folded shirts, boxes of oils and incense, books
    const gx = -0.78 + i * 0.26 + (R(i + 3) - 0.5) * 0.05, h = 0.04 + R(i + 11) * 0.16, w = 0.16 + R(i + 17) * 0.06;
    P.goods.push([...bx(gx - w / 2, gx + w / 2, 0.78, 0.78 + h, -0.3 + R(i + 23) * 0.12, 0.05 + R(i + 29) * 0.25), col(GOODS[Math.floor(R(i + 31) * GOODS.length)])]);
  }
  P.dark.push(bx(-0.2, 0.2, 0, 0.45, -1.0, -0.62));   // the vendor's stool behind the table
  if (kind === 0) {
    for (const sx of [-1.45, 1.45]) for (const sz of [-1.45, 1.45]) P.pole.push(bx(sx - 0.025, sx + 0.025, 0, 2.3, sz - 0.3 - 0.025, sz - 0.3 + 0.025));
    P.canvas.push(bx(-1.5, 1.5, 2.3, 2.52, -1.8, 1.2));
    P.canvas.push([new THREE.ConeGeometry(2.12, 0.55, 4, 1).rotateY(Math.PI / 4), mtx(0, 2.52 + 0.275, -0.3)]);
  } else if (kind === 1) {
    P.pole.push(bx(-0.02, 0.02, 0, 2.3, -0.55, -0.51));
    P.canvas.push([new THREE.ConeGeometry(1.1, 0.42, 10, 1, true), mtx(0, 2.3, -0.53)]);
  }
  return P;
}

// ---------------------------------------------------------------- the Apollo's front
// every part, keyed by material; W the frontage's length
export function apolloParts(W) {
  const F = FACADE, P = { tc: [], tcD: [], glass: [], steel: [], dark: [], bronze: [], sign: [], tubeB: [] };
  const bay = (W - 2 * F.pier - 3 * F.pil) / 4;
  const bx0 = (i) => F.pier + i * (bay + F.pil);             // bay i's west jamb
  // piers (rusticated: a joint every 0.62 m as shallow recessed bands) and the ground-floor frame
  for (const [x0, x1] of [[0, F.pier], [W - F.pier, W]]) {
    P.tc.push(bx(x0, x1, 0, F.frieze[0], 0, 0.34));
    for (let y = 0.62; y < F.frieze[0] - 0.3; y += 0.62) P.tcD.push(bx(x0 + 0.04, x1 - 0.04, y - 0.025, y + 0.025, 0.34, 0.352));
  }
  // the sill course over the marquee and the transom band under it
  P.tc.push(bx(0, W, F.mq.y1 - 0.25, F.win2[0], 0, 0.3), bx(F.pier, W - F.pier, 3.25, F.mq.y0, 0, 0.26));
  // the three fluted pilasters with Ionic capitals, standing on the sill course
  for (let i = 1; i <= 3; i++) {
    const x0 = bx0(i) - F.pil, x1 = bx0(i);
    P.tc.push(bx(x0, x1, F.win2[0], F.frieze[0], 0, 0.28), bx(x0 - 0.06, x1 + 0.06, F.win2[0], F.win2[0] + 0.35, 0, 0.34));
    P.tc.push(bx(x0 - 0.1, x1 + 0.1, F.frieze[0] - 0.42, F.frieze[0], 0, 0.4));                   // the capital's abacus
    for (let k = 0; k < 2; k++) P.tcD.push([new THREE.CylinderGeometry(0.11, 0.11, 0.1, 10).rotateX(Math.PI / 2), mtx(k ? x1 - 0.02 : x0 + 0.02, F.frieze[0] - 0.55, 0.36)]);   // volutes
    for (let f = 0; f < 5; f++) { const fx = x0 + 0.12 + f * ((F.pil - 0.24) / 4); P.tcD.push(bx(fx - 0.035, fx + 0.035, F.win2[0] + 0.45, F.frieze[0] - 0.7, 0.28, 0.3)); }
  }
  // the bays: second- and third-storey windows (a transom a third down), the spandrel with its shield between them
  for (let i = 0; i < 4; i++) {
    const x0 = bx0(i), x1 = x0 + bay;
    for (const [y0, y1] of [F.win2, F.win3]) {
      P.glass.push(bx(x0, x1, y0, y1, 0.02, 0.05));
      if (y0 === F.win2[0]) { P.tcD.push(bx(x0 + bay / 2 - 0.04, x0 + bay / 2 + 0.04, y0, y1 - (y1 - y0) * 0.3, 0.05, 0.1)); P.tcD.push(bx(x0, x1, y1 - (y1 - y0) * 0.3 - 0.05, y1 - (y1 - y0) * 0.3 + 0.05, 0.05, 0.12)); continue; }   // the sill course is its sill
      P.tcD.push(bx(x0, x1, y1 - (y1 - y0) * 0.3 - 0.05, y1 - (y1 - y0) * 0.3 + 0.05, 0.05, 0.12));   // transom
      P.tcD.push(bx(x0 + bay / 2 - 0.04, x0 + bay / 2 + 0.04, y0, y1 - (y1 - y0) * 0.3, 0.05, 0.1));  // mullion
      P.tc.push(bx(x0 - 0.05, x1 + 0.05, y0 - 0.12, y0, 0, 0.2));                                   // sill
    }
    P.tc.push(bx(x0, x1, F.span[0], F.span[1], 0, 0.2), bx(x0, x1, F.span[1] - 0.14, F.span[1], 0, 0.26));
    P.tcD.push(bx(x0 + bay / 2 - 0.3, x0 + bay / 2 + 0.3, F.span[0] + 0.2, F.span[1] - 0.2, 0.2, 0.3));     // the shield
    P.tc.push(bx(x0, x1, F.win3[1], F.frieze[0], 0, 0.22));                                         // the lintel
  }
  // frieze, modillion cornice, balustrade
  P.tc.push(bx(-0.05, W + 0.05, F.frieze[0], F.frieze[1], 0, 0.42), bx(-0.08, W + 0.08, F.cornice[0], F.cornice[0] + 0.3, 0, 0.55));
  for (let x = 0.25; x < W - 0.1; x += 0.52) P.tcD.push(bx(x - 0.09, x + 0.09, F.cornice[0] + 0.3, F.cornice[0] + 0.58, 0.2, 0.82));
  P.tc.push(bx(-0.12, W + 0.12, F.cornice[0] + 0.58, F.cornice[1], 0, 0.98));
  P.tc.push(bx(0, W, F.bal[0], F.bal[0] + 0.34, 0, 0.5), bx(-0.02, W + 0.02, F.bal[1] - 0.3, F.bal[1], 0, 0.52));
  const dies = [F.pier / 2, W - F.pier / 2, ...[1, 2, 3].map((i) => bx0(i) - F.pil / 2)];
  for (const dx of dies) P.tc.push(bx(dx - 0.36, dx + 0.36, F.bal[0] + 0.34, F.bal[1] - 0.3, 0, 0.48));
  for (let x = 0.2; x < W - 0.1; x += 0.3) {
    if (dies.some((d) => Math.abs(x - d) < 0.5)) continue;
    P.tc.push([new THREE.CylinderGeometry(0.075, 0.075, F.bal[1] - F.bal[0] - 0.64, 8), mtx(x, (F.bal[0] + F.bal[1] + 0.04) / 2, 0.3)]);
  }
  // the ground floor under the marquee: the lobby's bronze and glass doors between stone jambs
  P.glass.push(bx(F.pier, W - F.pier, 0.05, 3.25, 0.02, 0.06));
  for (let x = F.pier; x <= W - F.pier + 1e-6; x += (W - 2 * F.pier) / 8) P.bronze.push(bx(x - 0.06, x + 0.06, 0.05, 3.25, 0.02, 0.12));
  P.bronze.push(bx(F.pier, W - F.pier, 2.3, 2.42, 0.02, 0.12), bx(F.pier, W - F.pier, 0, 0.12, 0.02, 0.14));
  // -- the marquee: a stainless box on the wall, reader boards front and ends, the crests, two blue tubes top and bottom
  const M = F.mq, x0 = 0.25, x1 = W - 0.25, d = M.d, yc = (M.y0 + M.y1) / 2, bh = 1.6;
  P.steel.push(bx(x0, x1, M.y0, M.y1, 0.02, d), bx(x0 + 0.1, x1 - 0.1, M.y1, M.y1 + 0.08, 0.3, d - 0.1));
  P.sign.push(panel('board', x1 - x0 - 0.3, bh, (x0 + x1) / 2, yc, d + 0.012));
  P.sign.push(panel('boardEnd', d - 0.6, bh, x1 + 0.012, yc, 0.3 + (d - 0.3) / 2, Math.PI / 2), panel('boardEnd', d - 0.6, bh, x0 - 0.012, yc, 0.3 + (d - 0.3) / 2, -Math.PI / 2));
  P.sign.push(panel('soffit', x1 - x0 - 0.2, d - 0.4, (x0 + x1) / 2, M.y0 - 0.012, 0.3 + (d - 0.3) / 2, 0, Math.PI / 2));
  for (const ty of [M.y1 - 0.12, M.y1 - 0.24, M.y0 + 0.12, M.y0 + 0.24]) {
    P.tubeB.push([new THREE.CylinderGeometry(0.03, 0.03, x1 - x0 - 0.1, 6).rotateZ(Math.PI / 2), mtx((x0 + x1) / 2, ty, d + 0.06)]);
    for (const ex of [x0 - 0.06, x1 + 0.06]) P.tubeB.push([new THREE.CylinderGeometry(0.03, 0.03, d - 0.4, 6).rotateX(Math.PI / 2), mtx(ex, ty, 0.3 + (d - 0.3) / 2)]);
  }
  // the crest over the west part of the front (a1, a2) and the small one at the east end
  const cz = d - 0.45, cw = 5.2, cxw = x0 + 0.7 + cw / 2;
  P.steel.push(bx(cxw - cw / 2, cxw + cw / 2, M.y1, M.y1 + M.crest - 0.36, cz - 0.3, cz - 0.02));
  P.sign.push(panel('crest', cw, M.crest, cxw, M.y1 + M.crest / 2, cz), panel('crest', cw, M.crest, cxw, M.y1 + M.crest / 2, cz - 0.32, Math.PI));
  const cwe = 2.8, cxe = x1 - 0.3 - cwe / 2;
  P.steel.push(bx(cxe - cwe / 2, cxe + cwe / 2, M.y1, M.y1 + 0.6, cz - 0.3, cz - 0.02));
  P.sign.push(panel('crestE', cwe, 0.85, cxe, M.y1 + 0.425, cz), panel('crestE', cwe, 0.85, cxe, M.y1 + 0.425, cz - 0.32, Math.PI));
  // -- the blade: on the pilaster between the first and second bays, standing off the wall on steel arms
  const B = F.blade, bxc = bx0(1) - F.pil / 2, bz0 = B.off, bz1 = B.off + B.w, bzc = (bz0 + bz1) / 2, byc = (B.y0 + B.y1) / 2;
  P.steel.push(bx(bxc - B.t / 2, bxc + B.t / 2, B.y0, B.y1, bz0, bz1));
  P.sign.push(panel('blade', B.w, B.y1 - B.y0, bxc - B.t / 2 - 0.012, byc, bzc, -Math.PI / 2), panel('blade', B.w, B.y1 - B.y0, bxc + B.t / 2 + 0.012, byc, bzc, Math.PI / 2));
  P.sign.push(panel('bladeEdge', B.t, B.y1 - B.y0, bxc, byc, bz1 + 0.012));
  for (const ay of [B.y0 + 0.8, byc, Math.min(B.y1 - 1.0, F.bal[0] - 0.2)]) P.dark.push(bx(bxc - 0.07, bxc + 0.07, ay - 0.07, ay + 0.07, 0.0, bz0 + 0.05));
  {   // the stay rod from the pilaster up to the blade's foot (a1)
    const ya = F.win2[1] + 0.2, za = 0.3, yb = B.y0 + 0.2, zb = bz1 - 0.3, L = Math.hypot(yb - ya, zb - za);
    P.dark.push([new THREE.CylinderGeometry(0.035, 0.035, L, 6), mtx(bxc, (ya + yb) / 2, (za + zb) / 2, 1, 1, 1, 0, Math.atan2(zb - za, yb - ya))]);
  }
  // -- the old rooftop sign frame behind the balustrade over the west bays (a1): a steel lattice 4.6 x 4.2 m, 6.6 m tall
  {
    const lx0 = 0.9, lx1 = 5.5, lz0 = -5.0, lz1 = -0.8, ly0 = APOLLO.h, ly1 = APOLLO.h + 6.6, s = 0.09;
    for (const lx of [lx0, lx1]) for (const lz of [lz0, lz1]) P.dark.push(bx(lx - s, lx + s, ly0, ly1, lz - s, lz + s));
    for (const ly of [ly0 + 0.3, ly0 + 2.4, ly0 + 4.5, ly1 - 0.1]) {
      P.dark.push(bx(lx0, lx1, ly - s, ly + s, lz0 - s, lz0 + s), bx(lx0, lx1, ly - s, ly + s, lz1 - s, lz1 + s));
      P.dark.push(bx(lx0 - s, lx0 + s, ly - s, ly + s, lz0, lz1), bx(lx1 - s, lx1 + s, ly - s, ly + s, lz0, lz1));
    }
    const diag = (ax, ay, az, bx2, by, bz) => { const dx = bx2 - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz);
      const g = new THREE.CylinderGeometry(0.045, 0.045, L, 5); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L));
      P.dark.push([g, new THREE.Matrix4().compose(new THREE.Vector3((ax + bx2) / 2, (ay + by) / 2, (az + bz) / 2), q, new THREE.Vector3(1, 1, 1))]); };
    const lv = [ly0 + 0.3, ly0 + 2.4, ly0 + 4.5, ly1 - 0.1];
    for (let k = 0; k < 3; k++) {
      diag(lx0, lv[k], lz1, lx1, lv[k + 1], lz1); diag(lx1, lv[k], lz1, lx0, lv[k + 1], lz1);
      diag(lx0, lv[k], lz0, lx0, lv[k + 1], lz1); diag(lx1, lv[k], lz1, lx1, lv[k + 1], lz0);
    }
    diag(lx1, ly1 - 0.4, lz1, bxc + B.t / 2, B.y1 - 0.6, bz0 + 0.2);   // the brace to the blade's head
  }
  return P;
}
// ---------------------------------------------------------------- the Studio Museum (w125cData.js STUDIO)
// frame: origin the frontage's EAST end on the pavement, +x along the frontage to the west (s1 read left to right from
// across the street), +z out onto 125th Street; the volume runs back to z = -D
export function studioParts(W, D, H, S) {
  const P = { char: [], glass: [], glassLit: [], dark: [], sign: [] }, ZF = -0.8;
  P.char.push(bx(0, W, 0, H, -D, ZF), bx(-0.05, W + 0.05, H, H + 0.35, -D, 0.02));        // the volume and its coping
  const O = S.open.map(([f0, f1, y0, y1, k]) => [f0 * W, f1 * W, y0, y1, k]);
  // the front zone (z ZF..0): charcoal wherever no opening is, in bands between the openings' edges
  const ys = [...new Set([0, H, ...O.flatMap((o) => [o[2], o[3]])])].filter((y) => y >= 0 && y <= H).sort((a, b) => a - b);
  for (let i = 0; i + 1 < ys.length; i++) {
    const y0 = ys[i], y1 = ys[i + 1], ym = (y0 + y1) / 2;
    const holes = O.filter((o) => o[2] < ym && o[3] > ym).map((o) => [o[0], o[1]]).sort((a, b) => a[0] - b[0]);
    let x = 0;
    for (const [h0, h1] of holes) { if (h0 > x + 0.01) P.char.push(bx(x, h0, y0, y1, ZF, 0)); x = Math.max(x, h1); }
    if (x < W - 0.01) P.char.push(bx(x, W, y0, y1, ZF, 0));
  }
  for (const [x0, x1, y0, y1, k] of O) {
    (k === 1 ? P.glassLit : k === 2 ? P.dark : P.glass).push(bx(x0, x1, y0, y1, ZF - 0.02, ZF + 0.02));
    if (k === 2) { P.char.push(bx(x0, x1, y0, y0 + 0.12, ZF - 2.2, ZF)); continue; }    // a loggia's floor, 2.2 m deep
    const n = Math.max(1, Math.round((x1 - x0) / 1.55));
    for (let j = 1; j < n; j++) { const mx = x0 + (j * (x1 - x0)) / n; P.dark.push(bx(mx - 0.04, mx + 0.04, y0, y1, ZF + 0.02, ZF + 0.08)); }
  }
  // the stacked boxes' projecting slabs and edges
  for (const [b, f0, f1] of S.bands) P.char.push(bx(f0 * W - (f0 ? 0 : 0.1), f1 * W + (f1 < 1 ? 0 : 0.1), b - 0.28, b + 0.28, 0, 0.42));
  const top = S.bands[S.bands.length - 1][0] + 0.28;
  for (const f of S.fins) P.char.push(bx(f * W - 0.28, f * W + 0.28, 0, top, 0, 0.42));
  P.char.push(bx(-0.1, 0.35, 0, H, 0, 0.42), bx(W - 0.35, W + 0.1, 0, H, 0, 0.42));      // the end frames
  // the vertical sign at the east end and the name over the doors
  P.char.push(bx(0.2, 1.4, 12.7, 19.3, 0.42, 0.62));
  P.sign.push(panel('smBlade', 1.1, 6.5, 0.8, 16.0, 0.632), panel('smFascia', 0.2 * W, 0.5, 0.55 * W, 2.9, 0.05));
  P.char.push(bx(0.43 * W, 0.67 * W, 2.6, 3.2, ZF, 0.03));
  return P;
}
export function addStudio(group, W, D, H, S, place) {
  const M = kitMats(), P = studioParts(W, D, H, S);
  let tris = 0;
  for (const [k, parts] of Object.entries(P)) {
    if (!parts.length || !M[k]) continue;
    const g = merge(parts, place), mesh = new THREE.Mesh(g, M[k]);
    mesh.name = `ar32c:studio:${k}`; mesh.castShadow = k !== 'sign'; mesh.receiveShadow = true;
    group.add(mesh); tris += g.getAttribute('position').count / 3;
  }
  return tris;
}

// the whole front merged per material into `group` at the frontage's frame; returns { meshes, tris }
export function addApollo(group, W, place, y0) {
  const M = kitMats(), P = apolloParts(W), F = FACADE;
  const bay = (W - 2 * F.pier - 3 * F.pil) / 4;
  GLOW.blade.value.set(F.pier + bay + F.pil / 2, 0, F.blade.off + F.blade.w / 2).applyMatrix4(place);
  GLOW.span.value.set(y0 + F.blade.y0, y0 + F.blade.y1); GLOW.base.value = y0;
  let n = 0, tris = 0;
  for (const [k, parts] of Object.entries(P)) {
    if (!parts.length || !M[k]) continue;
    const g = merge(parts, place);
    const mesh = new THREE.Mesh(g, M[k]);
    mesh.name = `ar32c:apollo:${k}`;
    mesh.castShadow = k !== 'sign' && k !== 'tubeB'; mesh.receiveShadow = k !== 'tubeB';
    group.add(mesh); n++; tris += g.getAttribute('position').count / 3;
  }
  return { meshes: n, tris };
}

// many pieces ({ parts, place }) merged per material into `group`; returns the triangle count
export function addPieces(group, pieces, name) {
  const M = kitMats(), bucket = {};
  for (const { parts, place } of pieces) for (const [k, P] of Object.entries(parts)) if (P.length) (bucket[k] = bucket[k] || []).push(...P.map((p) => [p[0], place.clone().multiply(p[1]), p[2]]));
  let tris = 0;
  for (const [k, parts] of Object.entries(bucket)) {
    if (!M[k]) continue;
    const g = merge(parts);
    const mesh = new THREE.Mesh(g, M[k]);
    mesh.name = `${name}:${k}`; mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh); tris += g.getAttribute('position').count / 3;
  }
  return tris;
}

// ================================================================ AR33: the Apollo rebuilt to the measured front
// Called by fk/custom/bid2.js apollo with the facade kit's frame: u from the compiled
// front's west end, y over the sidewalk, w out of the wall. The AR32 front above (apolloParts, 20 m tall) stays for the
// ?fk=0 fallback (city/w125c.js).
export const AP33 = {
  u0: -0.57, u1: 14.58,                          // the terracotta front: the 50 ft lot (the compiled west end is 0.57 m inside it)
  piers: [[-0.57, 0.6], [13.32, 14.58]],         // the end piers
  pil: [3.47, 6.95, 10.42], pilW: 0.62, capW: 0.95,   // the fluted Ionic pilasters (a 3.475 m rhythm from the west pier's centre)
  bays: [[0.6, 3.16], [3.78, 6.64], [7.26, 10.11], [10.73, 13.32]],
  sill: [4.6, 5.1], flat: [4.0, 4.6], w2: [5.25, 7.4], t2: 0.55, w3: [8.7, 11.0], t3: 0.7,
  cap: [10.9, 11.5], arch: [11.5, 11.9], frieze: [11.9, 12.55], corn: [12.55, 13.25], bal: [13.25, 13.9], roof: 13.3,
  shop: { u0: 7.45, u1: 13.2, h: 2.7, band: [2.75, 3.9] },
  lobby: { u0: 0.6, u1: 7.05, h: 3.05, d: 1.6 },   // the entrance vestibule under the marquee
  mq: { u0: -0.4, u1: 7.25, y0: 3.05, y1: 5.05, d: 5.9, r: 0.3 },   // AR34: the corner post's bearing from 1395 and 1375 gives the depth 5.8-6.0, the top 5.05
  crest: { u0: 0.3, u1: 5.3, h: 1.35, w: 3.9 }, crestE: { u0: 5.7, u1: 7.0, h: 0.62, w: 3.9 },
  blade: { u: 3.47, y0: 10.2, y1: 20.5, w: 1.7, t: 0.38, off: 0.95 },   // AR34: measured off blade_1415 (top 20.5, 1.7 m wide, 1.4 m letters every 1.65 m)
  frame: { u0: 1.8, u1: 5.0, w0: -5.2, w1: -2.0, y1: 20.2 },   // AR34: its top under the blade's (blade_1415)
  lobbyD: 14.0, audH: 20.05,
};
// ---------------------------------------------------------------- AR33: the marquee's LED boards
// A full-colour LED wall as the camera car saw it: a violet-blue field of random coloured diodes, the message in near-black
// letters (z1375: THANK YOU / THE HOWARD GILMAN FOUNDATION / PROUD SPONSOR OF THE 2023-2024 SEASON on the front, z1395: RESPECT
// BLACK WOMEN on the east end, the west end a darker board), a faint 4 px diode grid over everything.
const L33 = { W: 2048, H: 1344 };
export const LED33 = {
  front: [0, 0, 2048, 420],        // 7.0 x 1.44 m
  east: [0, 440, 1280, 420],       // 4.4 x 1.44 m
  west: [0, 880, 1280, 420],
};
function paintLed33(c) {
  c.clearRect(0, 0, L33.W, L33.H);
  const led = (cell, lines, seed, dark) => {
    const [x, y, w, h] = cell;
    let s = seed;
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    // AR34 batch 3 session 2 (QA Q13: the board read as purple TV static at 1:1): the screen as the eye sees it, not the
    // lighter at the top, the LED modules (32 diodes, 128 px) a shade
    // apart, the message in near-black, the diode pitch a faint regular grid
    const px = 4;
    const gr = c.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, dark ? '#2a2e40' : '#6c727a'); gr.addColorStop(1, dark ? '#212433' : '#60666c');
    c.fillStyle = gr; c.fillRect(x, y, w, h);
    for (let my = 0; my < h; my += 32 * px) for (let mx = 0; mx < w; mx += 32 * px) {
      c.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${0.005 + rnd() * 0.01})` : `rgba(0,0,0,${0.005 + rnd() * 0.01})`;
      c.fillRect(x + mx, y + my, Math.min(32 * px, w - mx), Math.min(32 * px, h - my));
    }
    c.fillStyle = '#0d0f15';
    for (const [s2, fy, fh, fam, mw] of lines) fitText(c, s2, x + w / 2, y + h * fy, w * (mw || 0.94), h * fh, fam, 400);
    c.fillStyle = 'rgba(0,0,0,0.22)';
    for (let gx = px - 1; gx < w; gx += px) c.fillRect(x + gx, y, 1, h);
    for (let gy = px - 1; gy < h; gy += px) c.fillRect(x, y + gy, w, 1);
  };
  led(LED33.front, [['THANK YOU', 0.22, 0.13, COND, 0.2], ['THE HOWARD GILMAN FOUNDATION', 0.5, 0.3, COND, 0.62], ['PROUD SPONSOR OF THE 2023-2024 SEASON', 0.8, 0.15, COND, 0.58]], 11, false);
  led(LED33.east, [['RESPECT BLACK WOMEN', 0.5, 0.4, COND, 0.9]], 23, false);
  led(LED33.west, [['125TH STREET', 0.5, 0.3, COND]], 37, true);
}
let _led33 = null;
function ledMat33() {
  if (_led33) return _led33;
  const cv = document.createElement('canvas'); cv.width = L33.W; cv.height = L33.H;
  paintLed33(cv.getContext('2d'));
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  loadAdFonts().then(() => { paintLed33(cv.getContext('2d')); t.needsUpdate = true; });
  // AR34: matte (an LED face is a black louvred grid: at 0.3 the west board mirrored the sky at the grazing view from 1375)
  const m = LT(new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, roughness: 0.9, metalness: 0.0 }));
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.a33N = ENV.night;
    // an LED wall is bright by day as well: half its night light by day, more after dark (AR34 b3 s2: 1.2 -> 0.8 at night:
    // with the smooth slide of Q13 the board read near white after dark, c1n/apollo_mq_z1375_night.jpg)
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float a33N;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= mix(0.5, 0.8, a33N);');
  };
  m.customProgramCacheKey = () => 'a33led2';
  return (_led33 = m);
}
// a quad showing one cell of the LED sheet
function ledPanel(cell, w, h, x, y, z, ry = 0) {
  const [cx, cy, cw, ch] = LED33[cell], g = new THREE.PlaneGeometry(w, h), uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i) * cw) / L33.W, 1 - (cy + (1 - uv.getY(i)) * ch) / L33.H);
  return [g, mtx(x, y, z, 1, 1, 1, ry, 0)];
}

function ledMat() {
  const [d, n] = atlases();
  const m = LT(new THREE.MeshStandardMaterial({ map: d, emissiveMap: n, emissive: 0xffffff, roughness: 0.35, metalness: 0.05 }));
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.a33N = ENV.night;
    // an LED screen is bright by day too: a floor of 0.55 of its night light, full after dark
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float a33N;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= mix(0.55, 1.15, a33N);');
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|a33led';
  return m;
}
let _M33 = null;
function mats33() {
  if (_M33) return _M33;
  const M = kitMats();
  _M33 = { sign: M.sign, tubeB: M.tubeB, tubeW: tubeMat([0.86, 0.88, 0.92], [0.85, 0.92, 1.4]), led: ledMat(), led33: ledMat33() };
  return _M33;
}
// a vertical prism over a world polygon (x/z): walls facing out (metre UVs) except the edges listed in `skip`, a flat roof
function prismGeom(pts, y0, y1, skip = new Set()) {
  const pos = [], nor = [], uv = [];
  // the winding decides the outward side (signed area in (x, z) taken as a plane: > 0 -> outward is (dz, -dx))
  let area = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area > 0 ? 1 : -1;
  let run = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (skip.has(i) || L < 1e-3) { run += L; continue; }
    const nx = (sgn * (b[1] - a[1])) / L, nz = (-sgn * (b[0] - a[0])) / L;
    const P = [[a[0], y0, a[1], run, y0], [b[0], y0, b[1], run + L, y0], [b[0], y1, b[1], run + L, y1], [a[0], y1, a[1], run, y1]];
    const tri = (p, q, r) => {
      const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
      const nX = uy * vz - uz * vy, nZ = ux * vy - uy * vx;
      const ok = nX * nx + nZ * nz > 0;
      for (const v of ok ? [p, q, r] : [p, r, q]) { pos.push(v[0], v[1], v[2]); nor.push(nx, 0, nz); uv.push(v[3], v[4]); }
    };
    tri(P[0], P[1], P[2]); tri(P[0], P[2], P[3]);
    run += L;
  }

  const tris = THREE.ShapeUtils.triangulateShape(pts.map((p) => new THREE.Vector2(p[0], p[1])), []);
  for (const t of tris) {
    const v = t.map((k) => pts[k]);
    // facing up (+y) with x east, z south: (b - a) x (c - a) has +y when (bz - az)(cx - ax) - (bx - ax)(cz - az) > 0
    const up = (v[1][1] - v[0][1]) * (v[2][0] - v[0][0]) - (v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) > 0;
    for (const p of up ? v : [v[0], v[2], v[1]]) { pos.push(p[0], y1, p[1]); nor.push(0, 1, 0); uv.push(p[0], p[1]); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}
// a box with its two street-side vertical corners rounded (radius r), plan u0..u1 x w 0..d, y0..y1, in the frame
function roundBox(u0, u1, d, r, y0, y1, seg = 5) {
  const s = new THREE.Shape();
  s.moveTo(u0, 0); s.lineTo(u1, 0); s.lineTo(u1, d - r); s.quadraticCurveTo(u1, d, u1 - r, d); s.lineTo(u0 + r, d); s.quadraticCurveTo(u0, d, u0, d - r); s.lineTo(u0, 0);
  // the shape lies in (x, y) = (u, -w) so the extrusion (+z) can be turned to +y by a -90 degree turn about x
  const g = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false, curveSegments: seg });
  g.rotateX(-Math.PI / 2);        // (x, y, z) -> (x, z, -y): shape y (= w) goes to -z ... flip it back below
  g.scale(1, 1, -1);              // w to +z (the mirror flips the winding)
  const idx = g.index;
  if (idx) for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); }
  else {
    const p = g.getAttribute('position').array, n = g.getAttribute('normal').array;
    for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { let t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; t = n[i + 3 + k]; n[i + 3 + k] = n[i + 6 + k]; n[i + 6 + k] = t; }
  }
  g.translate(0, y0, 0);
  g.computeVertexNormals();
  return g;
}
// ================================================================ AR34: the blade and the crests, drawn from scratch
// the six letters stacked down it as open channel letters (red returns ~0.15 m deep over a red back) with three to four
// parallel neon tubes nested in every stroke; the crests on the marquee carry the same letters in a row on a cream
// housing. The letters are a geometric face (Jost, the Futura cut; Montserrat until it has loaded) painted on a canvas,
// traced (fk/signNeon.js neonContours) and extruded; the tubes are the traced outline inset (0.045 / 0.10 / 0.155 m on the
// blade). By day the tubes read as pink-red glass, after dark they burn red and the field takes a little of their light.
let _ap34 = null;
function ap34Mats() {
  if (_ap34) return _ap34;
  const night = (m, lo, hi, key) => {
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      sh.uniforms.a34N = ENV.night;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float a34N;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance *= mix(${lo.toFixed(3)}, ${hi.toFixed(3)}, a34N);`);
    };
    m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|' + key;
    return m;
  };
  // a weathered paint film (faint vertical runs, specks), multiplied into the paint colour; metre UVs
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
  const c = cv.getContext('2d'); c.fillStyle = '#ffffff'; c.fillRect(0, 0, 64, 256);
  let sd = 7; const rnd = () => ((sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(90,70,40,${(0.03 + rnd() * 0.06).toFixed(3)})`; c.fillRect(rnd() * 64, rnd() * 128, 1 + rnd() * 3, 60 + rnd() * 196); }
  for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(60,50,30,${(rnd() * 0.06).toFixed(3)})`; c.fillRect(rnd() * 64, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2); }
  const film = new THREE.CanvasTexture(cv); film.colorSpace = THREE.SRGBColorSpace; film.wrapS = film.wrapT = THREE.RepeatWrapping; film.anisotropy = 4;
  const paint = (hex, rough, o = {}) => LT(new THREE.MeshStandardMaterial({ color: hex, map: film, roughness: rough, metalness: 0.0, ...o }));
  _ap34 = {
    field: night(paint('#d9b97c', 0.6, { emissive: new THREE.Color('#4a120a') }), 0.0, 0.7, 'a34field'),
    cream: night(paint('#e8dfc8', 0.55, { emissive: new THREE.Color('#4a120a') }), 0.0, 0.6, 'a34cream'),
    white: paint('#efefeb', 0.45),
    ret: LT(new THREE.MeshStandardMaterial({ color: '#c23826', roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide })),
    back: night(LT(new THREE.MeshStandardMaterial({ color: '#c8432f', roughness: 0.55, metalness: 0.0, emissive: new THREE.Color('#ff2a14') })), 0.0, 0.5, 'a34back'),
    tube: night(LT(new THREE.MeshStandardMaterial({ color: '#e66a55', emissive: new THREE.Color('#ff3320'), roughness: 0.2, metalness: 0.0 })), 0.04, 3.0, 'a34tube'),
  };
  return _ap34;
}
// open channel letters with nested tubes: `rows` [text, yBase, cap] (metres) in a W x H field (x right, y up, z out of
// the field, origin at its bottom left), each row centred on x = W / 2 and squeezed to maxW; { back, walls, tubes } in that
// frame. Cached by key (both faces of the blade share one set).
const _ap34L = new Map();
function chanNeon(key, rows, W, H, { ppm = 110, depth = 0.15, insets = [0.045, 0.1, 0.155], tubeR = 0.016, tubeZ = 0.08, maxW = W - 0.1, tracking = 0 } = {}) {
  if (_ap34L.has(key)) return _ap34L.get(key);
  const fi = ['Jost-600', 'Montserrat-800'].map((n) => parseFont(n)).find((f) => fontReady(f)) || parseFont('Montserrat-800');
  const Wp = Math.round(W * ppm), Hp = Math.round(H * ppm);
  const mc = document.createElement('canvas').getContext('2d');
  mc.font = fontCSS(fi, 200);
  const capK = (mc.measureText('H').actualBoundingBoxAscent || 140) / 200;
  const items = rows.map(([text, yb, cap]) => {
    const px = (cap * ppm) / capK;
    mc.font = fontCSS(fi, px);
    try { mc.letterSpacing = `${(tracking * px).toFixed(1)}px`; } catch { /* no letterSpacing */ }
    const m = mc.measureText(text), L = m.actualBoundingBoxLeft || 0, R = m.actualBoundingBoxRight || m.width;
    const sx = Math.min(1, (maxW * ppm) / Math.max(1, L + R));
    return { text, font: fontCSS(fi, px), px, sx, dx: (L - R) / 2, x: Wp / 2, y: Hp - yb * ppm };
  });
  const draw = (c) => {
    for (const it of items) {
      c.save(); c.translate(it.x, it.y); c.scale(it.sx, 1); c.font = it.font; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      try { c.letterSpacing = `${(tracking * it.px).toFixed(1)}px`; } catch { /* no letterSpacing */ }
      c.fillText(it.text, it.dx, 0); c.restore();
    }
  };
  const toM = (P) => P.map(([x, y]) => new THREE.Vector2(x / ppm, H - y / ppm));
  const outl = neonContours(draw, Wp, Hp, { inset: 1, minLen: 0.08 * ppm, eps: 0.5, smooth: 2 }).map((l) => toM(l.pts));
  const inside = (p, poly) => { let o = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) o = !o; } return o; };
  const lev = outl.map((l, i) => outl.reduce((n, q, j) => n + (j !== i && inside(l[0], q) ? 1 : 0), 0));
  const shapes = [];
  outl.forEach((l, i) => {
    if (lev[i] % 2) return;
    const sh = new THREE.Shape(l);
    outl.forEach((h, j) => { if (lev[j] === lev[i] + 1 && inside(h[0], l)) sh.holes.push(new THREE.Path(h)); });
    shapes.push(sh);
  });
  const back = new THREE.ShapeGeometry(shapes, 1); back.translate(0, 0, 0.004);
  const ex = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, steps: 1, curveSegments: 1 });
  const walls = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) {
    const a = ex.getAttribute(k), out = [];
    for (const g of ex.groups) if (g.materialIndex === 1) for (let i = g.start * a.itemSize; i < (g.start + g.count) * a.itemSize; i++) out.push(a.array[i]);
    walls.setAttribute(k, new THREE.Float32BufferAttribute(out, a.itemSize));
  }
  ex.dispose();
  const tg = [];
  for (const ins of insets) {
    for (const l of neonContours(draw, Wp, Hp, { inset: Math.max(1, Math.round(ins * ppm)), minLen: 0.1 * ppm, eps: 0.5, smooth: 2 })) {
      const pts = toM(l.pts).map((v) => new THREE.Vector3(v.x, v.y, tubeZ));
      if (pts.length < 4) continue;
      const cu = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
      tg.push(new THREE.TubeGeometry(cu, Math.max(8, Math.ceil(cu.getLength() / 0.035)), tubeR, 5, true));
    }
  }
  const tubes = tg.length ? mergeGeometries(tg.map((g) => g.toNonIndexed()), false) : null;
  for (const g of tg) g.dispose();
  const r = { back, walls, tubes, font: fi.id, shapes: shapes.length };
  _ap34L.set(key, r);
  return r;
}
// place a chanNeon set: the local frame put at frame (u, y, w) turned by ry about y, into the per-material lists
function putChan(L, M, lists) {
  for (const k of ['back', 'walls', 'tubes']) if (L[k]) lists[k].push(L[k].clone().applyMatrix4(M));
}
export function buildApollo33(group, frame) {
  const K = frame.kit, A = AP33, Mk = mats33();
  // AR34: a warmer, greyer terracotta with more grime
  // (AR34 wave 2 b3: N253w_sq / apollo_win_1395 at full size: the sunlit piers read (207-212, 204-205, 189-200), lum 205,
  // the twin's (174-199, 162-185, 141-160), lum 164-186 with '#d6cbb2': too yellow and dark; the set's cream base is in
  // the render, so the tint is a near-neutral light grey)
  const TC = K.mat('terracotta_cream', { tint: '#dcdad3', dirt: 0.45 });
  const TCd = K.mat('terracotta_cream', { tint: '#cbc7bc', dirt: 0.55 });
  const BRZ = K.mat('alu_bronze', { tint: '#3d3125' });
  const SS = K.mat('stainless', {});
  const BLK = K.mat('steel_black', { tint: '#27305a' });   // AR34: the rooftop lattice and the arms are navy-painted steel
  const box = (m, u0, u1, y0, y1, w0, w1, o) => K.box(m, u0, u1, y0, y1, w0, w1, o);
  const near = { near: true };
  // ------------------------------------------------------------ the front wall (w = 0) with its openings
  const holes = [{ u0: A.lobby.u0, u1: A.lobby.u1, y0: 0, y1: A.lobby.h }, { u0: A.shop.u0, u1: A.shop.u1, y0: 0, y1: A.shop.h }];
  for (const [b0, b1] of A.bays) for (const [y0, y1] of [A.w2, A.w3]) holes.push({ u0: b0 + 0.2, u1: b1 - 0.2, y0, y1 });
  K.wall({ u0: A.u0, u1: A.u1, y0: -0.4, y1: A.roof, holes, mat: TC });
  // the west end: the front stands 0.57 m past the compiled corner and 0.44 m proud of 261's front; close it to 261's wall
  box(TC, A.u0, 0.02, -0.4, A.bal[1], -0.5, 0.0);
  // the vestibule under the marquee: returns, a soffit, the bronze and glass doors 1.6 m back, the lobby behind
  {
    const L = A.lobby, D = L.d;
    box(TC, L.u0 - 0.02, L.u0, 0, L.h, -D, 0);
    box(TC, L.u1, L.u1 + 0.02, 0, L.h, -D, 0);
    box(TCd, L.u0, L.u1, L.h - 0.02, L.h, -D, 0);
    box(BRZ, L.u0, L.u1, 0, 0.08, -D - 0.04, -D + 0.04);
    box(BRZ, L.u0, L.u1, 2.45, 2.6, -D - 0.05, -D + 0.05);
    box(BRZ, L.u0, L.u1, L.h - 0.1, L.h, -D - 0.05, -D + 0.05);
    const n = 6;
    for (let k = 0; k <= n; k++) { const u = L.u0 + ((L.u1 - L.u0) * k) / n; box(BRZ, u - 0.06, u + 0.06, 0, L.h, -D - 0.06, -D + 0.06, near); }
    for (let k = 0; k < n; k++) { const u = L.u0 + ((L.u1 - L.u0) * (k + 0.5)) / n; box(SS, u - 0.35, u + 0.35, 1.0, 1.05, -D + 0.06, -D + 0.1, near); }
    box(K.mat('glass_storefront', {}), L.u0, L.u1, 0.08, L.h - 0.1, -D - 0.01, -D + 0.01);
    box(K.mat('granite_black', { tint: '#1a1a1b' }), L.u0, L.u1, -0.02, 0.01, -D, 0.25);
    box(K.mat('wood_painted', { tint: '#3a241a' }), L.u0, L.u1, 0, L.h, -D - 6.0, -D - 5.9);
    box(K.mat('wood_painted', { tint: '#6e1a16' }), L.u0, L.u1, -0.02, 0.0, -D - 6.0, -D);
  }
  // the Apollo's shop at 253 (the east bay): the kit's storefront in its hole
  K.storefront({ u0: A.shop.u0, u1: A.shop.u1, kind: 'store', h: A.shop.h, setback: 0.25,
    glazing: { bulkhead: 0.12, transom: 0, mullions: 3, frame: 'alu_bronze' }, door: { u: 0.47, w: 1.05, kind: 'glass', recess: 0.5, h: 2.35 },
    gate: { kind: 'none' }, interior: 'shop_clothing', lit: 1.0 }, A.shop.h);
  // the shop band (the APOLLO outline letters go on it), the flat band and the moulded sill course over it
  box(TC, A.piers[0][1], A.u1, A.shop.h, A.flat[0], -0.02, 0.04);
  box(TC, A.u0, A.u1, A.flat[0], A.flat[1], 0, 0.1);
  K.extrude(TC, [[0.1, A.sill[0]], [0.16, A.sill[0] + 0.06], [0.2, A.sill[0] + 0.22], [0.28, A.sill[0] + 0.3], [0.3, A.sill[1] - 0.06], [0.24, A.sill[1]], [0, A.sill[1]]], A.u0 - 0.02, A.u1 + 0.02);
  // ------------------------------------------------------------ piers, pilasters, capitals
  for (const [p0, p1] of A.piers) {
    box(TC, p0, p1, -0.02, A.arch[0], 0, 0.14);
    for (let y = 0.34; y < A.arch[0] - 0.2; y += 0.34) box(TCd, p0 + 0.01, p1 - 0.01, y - 0.012, y + 0.012, 0.14, 0.146, near);
    box(TC, p0 - 0.04, p1 + 0.04, A.cap[0] - 0.1, A.cap[1], 0, 0.2);
    box(TCd, (p0 + p1) / 2 - 0.2, (p0 + p1) / 2 + 0.2, A.cap[0], A.cap[1] - 0.12, 0.2, 0.26, near);
  }
  for (const c of A.pil) {
    const h = A.pilW / 2;
    box(TC, c - h - 0.08, c + h + 0.08, A.sill[1], A.sill[1] + 0.22, 0, 0.18);
    box(TC, c - h, c + h, A.sill[1] + 0.22, A.cap[0], 0, 0.07);
    for (let f = 0; f <= 5; f++) { const x = c - h + 0.03 + (f * (A.pilW - 0.06)) / 5; box(TC, x - 0.022, x + 0.022, A.sill[1] + 0.3, A.cap[0] - 0.08, 0.07, 0.12, near); }
    box(TC, c - h, c + h, A.sill[1] + 0.22, A.sill[1] + 0.3, 0.07, 0.12);
    box(TC, c - h, c + h, A.cap[0] - 0.08, A.cap[0], 0.07, 0.12);
    box(TC, c - h - 0.03, c + h + 0.03, A.cap[0], A.cap[0] + 0.06, 0, 0.14);
    box(TC, c - 0.4, c + 0.4, A.cap[0] + 0.06, A.cap[1] - 0.14, 0, 0.19);
    box(TC, c - A.capW / 2, c + A.capW / 2, A.cap[1] - 0.14, A.cap[1], 0, 0.24);
  }
  const round = [], rods = [], bal = [];
  // the Ionic volutes: a disc and its rolled rim at each top corner of the capital
  for (const c of A.pil) for (const s of [-1, 1]) {
    round.push([new THREE.CylinderGeometry(0.15, 0.15, 0.2, 14).rotateX(Math.PI / 2), mtx(c + s * 0.36, A.cap[1] - 0.2, 0.15)]);
    round.push([new THREE.TorusGeometry(0.09, 0.025, 6, 16), mtx(c + s * 0.36, A.cap[1] - 0.2, 0.26)]);
  }
  // ------------------------------------------------------------ the windows: bronze frames, a mullion, a transom light
  // AR34: the frames are a light sage-grey painted metal, not bronze
  // AR34 wave 2 b3: the kit's
  // panes read; the opaque glass_tower_grey took its default near-black body (the window passes no body colour)
  const T2 = { kind: 'fixed', mullions: 0, transom: A.t2, frame: { mat: 'plain', tint: '#a9b0a5', rough: 0.5 }, frameW: 0.08, reveal: 0.35, lintel: null, sillStone: null, sheer: 1.0, sheerTint: '#66767c', blinds: 0.35, lit: 0.45 };   // b3b: '#d3d6d5' in 0.8 read lum 182 / 102 (no sheer), b3c '#9eaaae' 166-170, b3d '#7f8f95' 157-161 135-141
  const T3 = { ...T2, transom: A.t3 };
  for (const [b0, b1] of A.bays) {
    K.window(T2, b0 + 0.2, b1 - 0.2, A.w2[0], A.w2[1], { wallMat: TC });
    K.window(T3, b0 + 0.2, b1 - 0.2, A.w3[0], A.w3[1], { wallMat: TC });
    const mid = (b0 + b1) / 2;
    box(TC, b0, b1, A.w2[1], A.w2[1] + 0.2, 0, 0.05);                                           // the lintel band
    box(TCd, b0 + 0.3, b1 - 0.3, A.w2[1] + 0.32, A.w3[0] - 0.36, -0.035, 0.0);                  // the recessed panel
    box(TCd, mid - 0.22, mid + 0.22, A.w2[1] + 0.45, A.w2[1] + 0.95, -0.01, 0.055, near);       // the shield
    K.poly(TCd, [[mid - 0.22, A.w2[1] + 0.45, 0.056], [mid, A.w2[1] + 0.3, 0.056], [mid + 0.22, A.w2[1] + 0.45, 0.056]], [0, 0, 1]);
    box(TC, b0 - 0.02, b1 + 0.02, A.w3[0] - 0.2, A.w3[0], 0, 0.09);                             // the third storey's sill band
    box(TC, b0, b1, A.w3[1], A.arch[0], 0, 0.03);
    // AR34: the Greek-key fret runs in each bay over the third-storey window, level with the
    // capitals (it was drawn in the frieze over the architrave, which is plain)
    {
      const y0 = A.w3[1] + 0.07, y1 = A.arch[0] - 0.05, hh = y1 - y0, t = 0.03, P = 0.3;
      box(TC, b0 + 0.05, b1 - 0.05, y0 - t, y0, 0.03, 0.055, near); box(TC, b0 + 0.05, b1 - 0.05, y1, y1 + t, 0.03, 0.055, near);
      for (let u = b0 + 0.08; u + P <= b1 - 0.05; u += P) {
        box(TC, u, u + t, y0, y1 - 0.08, 0.03, 0.055, near);
        box(TC, u, u + P * 0.72, y1 - 0.08 - t, y1 - 0.08, 0.03, 0.055, near);
        box(TC, u + P * 0.72 - t, u + P * 0.72, y0 + 0.08, y1 - 0.08, 0.03, 0.055, near);
        box(TC, u + P * 0.3, u + P * 0.72, y0 + 0.08, y0 + 0.08 + t, 0.03, 0.055, near);
        box(TC, u + P * 0.3, u + P * 0.3 + t, y0 + 0.08, y0 + hh * 0.55, 0.03, 0.055, near);
      }
    }
  }
  // ------------------------------------------------------------ the entablature: architrave, the Greek-key frieze, the cornice
  box(TC, A.u0 - 0.03, A.u1 + 0.03, A.arch[0], A.arch[1], 0, 0.17);
  box(TC, A.u0 - 0.03, A.u1 + 0.03, A.arch[1] - 0.06, A.arch[1], 0.17, 0.2);
  box(TC, A.u0 - 0.03, A.u1 + 0.03, A.frieze[0], A.frieze[1], 0, 0.1);   // the frieze: plain (the fret is in the bays below)
  box(TC, A.u0 - 0.03, A.u1 + 0.03, A.frieze[1] - 0.08, A.frieze[1], 0.1, 0.16, near);
  K.extrude(TC, [[0, A.corn[0]], [0.14, A.corn[0]], [0.2, A.corn[0] + 0.08], [0.3, A.corn[0] + 0.15], [0.3, A.corn[0] + 0.4], [0, A.corn[0] + 0.4]], A.u0 - 0.06, A.u1 + 0.06);
  for (let u = A.u0 + 0.2; u < A.u1 - 0.1; u += 0.52) {
    box(TCd, u - 0.07, u + 0.07, A.corn[0] + 0.16, A.corn[0] + 0.4, 0.3, 0.78, near);
    box(TCd, u - 0.07, u + 0.07, A.corn[0] + 0.1, A.corn[0] + 0.2, 0.3, 0.5, near);
  }
  K.extrude(TC, [[0, A.corn[0] + 0.4], [0.84, A.corn[0] + 0.4], [0.86, A.corn[0] + 0.44], [0.86, A.corn[1] - 0.1], [0.92, A.corn[1] - 0.04], [0.92, A.corn[1]], [0, A.corn[1]]], A.u0 - 0.1, A.u1 + 0.1);
  // the balustrade: plinth, dies over the piers and pilasters, balusters, the rail; the parapet's back
  const dies = [(A.piers[0][0] + A.piers[0][1]) / 2, ...A.pil, (A.piers[1][0] + A.piers[1][1]) / 2];
  box(TC, A.u0, A.u1, A.bal[0], A.bal[0] + 0.14, 0.06, 0.54);
  for (const d of dies) box(TC, d - 0.3, d + 0.3, A.bal[0] + 0.14, A.bal[1] - 0.12, 0.08, 0.52);
  box(TC, A.u0 - 0.02, A.u1 + 0.02, A.bal[1] - 0.14, A.bal[1], 0.04, 0.56);
  for (let u = A.u0 + 0.25; u < A.u1 - 0.2; u += 0.24) {
    if (dies.some((d) => Math.abs(u - d) < 0.42)) continue;
    const hB = A.bal[1] - A.bal[0] - 0.28, yc = A.bal[0] + 0.14 + hB / 2;
    bal.push([new THREE.CylinderGeometry(0.045, 0.06, hB * 0.5, 8), mtx(u, yc + hB * 0.25, 0.3)], [new THREE.CylinderGeometry(0.06, 0.045, hB * 0.5, 8), mtx(u, yc - hB * 0.25, 0.3)]);
  }
  box(TC, A.u0, A.u1, A.roof, A.bal[1], -0.35, 0.06);
  // ------------------------------------------------------------ the marquee
  // brushed stainless over a steel core: a soffit rim, a ribbed valance, a lower cap with two neon lines, the recessed LED
  // screens between rounded corner posts, an upper cap with two neon lines, a top slab; an APOLLO crest on each END
  const Q = A.mq, place = frame.matrix(0, 0, 0);
  const SSm = K.mat('stainless', { tint: '#8a8780', dirt: 0.3 }), SSd = K.mat('stainless', { tint: '#5a5853', dirt: 0.4 });
  const mqY = { v0: Q.y0 + 0.04, v1: Q.y0 + 0.26, c1: Q.y0 + 0.40, c2: Q.y1 - 0.37, c3: Q.y1 - 0.17 };
  {
    const slab = (ins, y0, y1, mat, name) => {
      const g = roundBox(Q.u0 + ins, Q.u1 - ins, Q.d - ins, Math.max(0.06, Q.r - ins), y0, y1);
      g.applyMatrix4(place); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat); m.name = `bid2:apollo:mq:${name}`; m.castShadow = true; m.receiveShadow = true; group.add(m);
    };
    slab(0.0, Q.y0, mqY.v0, SSd, 'soffit');
    slab(0.03, mqY.v0, mqY.v1, SSm, 'valance');
    slab(-0.05, mqY.v1, mqY.c1, SSm, 'capLow');
    slab(0.09, mqY.c1, mqY.c2, SSd, 'screens');
    slab(-0.05, mqY.c2, mqY.c3, SSm, 'capHigh');
    slab(0.0, mqY.c3, Q.y1, SSm, 'top');
    slab(0.04, Q.y1, Q.y1 + 0.03, SSd, 'lid');
  }
  const sg = [], led = [], tubes = [], tubesW = [], ribs = [];
  // the ribbed valance under the lower cap (fluting every 0.14 m, front and both ends)
  for (let u = Q.u0 + Q.r + 0.05; u < Q.u1 - Q.r; u += 0.14) ribs.push(bx(u - 0.022, u + 0.022, mqY.v0 + 0.015, mqY.v1 - 0.015, Q.d - 0.04, Q.d));
  for (let w = 0.3; w < Q.d - Q.r; w += 0.14) {
    ribs.push(bx(Q.u0, Q.u0 + 0.04, mqY.v0 + 0.015, mqY.v1 - 0.015, w - 0.022, w + 0.022), bx(Q.u1 - 0.04, Q.u1, mqY.v0 + 0.015, mqY.v1 - 0.015, w - 0.022, w + 0.022));
  }
  // neon along the caps: the marquee's plan outline (front and both ends, the rounded corners), two tubes a cap
  const mqPath = (ins) => {
    const u0 = Q.u0 + ins, u1 = Q.u1 - ins, d = Q.d - ins, r = Math.max(0.06, Q.r - ins), pts = [];
    for (let w = 0.15; w < d - r - 0.2; w += 0.6) pts.push([u0, w]);
    for (let a = 0; a <= 6; a++) { const t = (a / 6) * Math.PI / 2; pts.push([u0 + r - Math.cos(t) * r, d - r + Math.sin(t) * r]); }
    for (let u = u0 + r + 0.6; u < u1 - r - 0.2; u += 0.6) pts.push([u, d]);
    for (let a = 0; a <= 6; a++) { const t = (a / 6) * Math.PI / 2; pts.push([u1 - r + Math.sin(t) * r, d - r + Math.cos(t) * r]); }
    for (let w = d - r - 0.6; w > 0.15; w -= 0.6) pts.push([u1, w]);
    return pts;
  };
  const neonRun = (y, list) => {
    const pts = mqPath(-0.062).map((p) => new THREE.Vector3(p[0], y, p[1]));
    list.push([new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), pts.length * 3, 0.016, 6, false), new THREE.Matrix4()]);
  };
  neonRun(mqY.v1 + 0.045, tubes); neonRun(mqY.v1 + 0.10, tubesW); neonRun(mqY.c2 + 0.06, tubes); neonRun(mqY.c2 + 0.14, tubesW);
  // the LED boards in their bezel
  {
    const by = (mqY.c1 + mqY.c2) / 2, bh = mqY.c2 - mqY.c1 - 0.06, fw = Q.u1 - Q.u0 - 2 * Q.r - 0.05, ew = Q.d - Q.r - 0.3;
    led.push(ledPanel('front', fw, bh, (Q.u0 + Q.u1) / 2, by, Q.d - 0.09 + 0.006));
    led.push(ledPanel('east', ew, bh, Q.u1 - 0.09 + 0.006, by, 0.2 + ew / 2, Math.PI / 2));
    led.push(ledPanel('west', ew, bh, Q.u0 + 0.09 - 0.006, by, 0.2 + ew / 2, -Math.PI / 2));
  }
  sg.push(panel('soffit', Q.u1 - Q.u0 - 0.3, Q.d - 0.3, (Q.u0 + Q.u1) / 2, Q.y0 - 0.012, Q.d / 2, 0, Math.PI / 2));
  // channel letters into meshes (back, returns, tubes), one per material for the lot
  const addChan = (cl, name) => {
    const M4 = ap34Mats();
    for (const [k, mat, shadow] of [['back', M4.back, false], ['walls', M4.ret, true], ['tubes', M4.tube, false]]) {
      if (!cl[k].length) continue;
      const g = mergeGeometries(cl[k].map((q) => (q.index ? q.toNonIndexed() : q)), false);
      if (!g) continue;
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat); m.name = `bid2:apollo:${name}:${k}`; m.castShadow = shadow; m.receiveShadow = true; group.add(m);
    }
  };
  // the crests: cream housings 0.92 m tall on the marquee's top at both ends, their
  // street ends rounded, APOLLO in open red channels with neon on the outer faces (the west crest looks west, the east east)
  {
    const M4 = ap34Mats(), Hc = 0.86, t = 0.3, w0 = 0.95, w1 = Q.d - 0.12, R = 0.4, y = Q.y1 + 0.03;
    const prof = [[w0, y], [w1, y], [w1, y + Hc - R]];
    for (let a = 1; a <= 8; a++) { const th = (a / 8) * Math.PI / 2; prof.push([w1 - R + Math.cos(th) * R, y + Hc - R + Math.sin(th) * R]); }
    prof.push([w0, y + Hc]);
    K.extrude(M4.cream, prof, Q.u0 + 0.03, Q.u0 + 0.03 + t);
    K.extrude(M4.cream, prof, Q.u1 - 0.03 - t, Q.u1 - 0.03);
    K.box(SSm, Q.u0 + 0.01, Q.u0 + 0.05 + t, y - 0.02, y + 0.06, w0 - 0.02, w1 + 0.02, near);   // the feet
    K.box(SSm, Q.u1 - 0.05 - t, Q.u1 - 0.01, y - 0.02, y + 0.06, w0 - 0.02, w1 + 0.02, near);
    const Lc = w1 - R * 0.3 - w0 - 0.12, cap = 0.64;
    let L = null;
    try { L = chanNeon('crest', [['APOLLO', (Hc - cap) / 2 - 0.01, cap]], Lc, Hc, { ppm: 260, depth: 0.07, insets: [0.02, 0.048], tubeR: 0.009, tubeZ: 0.04, maxW: Lc - 0.06, tracking: 0.03 }); }
    catch (e) { console.warn('[bid2] crest letters', e); }
    if (L) {
      const cl = { back: [], walls: [], tubes: [] };
      putChan(L, frame.matrix(Q.u0 + 0.03, y, w0 + 0.1).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2)), cl);
      putChan(L, frame.matrix(Q.u1 - 0.03, y, w0 + 0.1 + Lc).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)), cl);
      addChan(cl, 'crest');
    }
  }
  sg.push(panel('shopBand', 6.4, A.shop.band[1] - A.shop.band[0], 10.6, (A.shop.band[0] + A.shop.band[1]) / 2, 0.047));
  // ------------------------------------------------------------ the blade on pilaster 1: three arms and a stay rod
  const rod = (a, b, r = 0.04) => { const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length();
    rods.push([new THREE.CylinderGeometry(r, r, L, 5), new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1))]); };
  {
    const B = A.blade, z0 = B.off, z1 = B.off + B.w, zc = (z0 + z1) / 2, yc = (B.y0 + B.y1) / 2, H = B.y1 - B.y0;
    // AR34: a painted sheet-metal cabinet, the ochre field on both faces, the
    // white street edge with a white strip down each face beside it, white top and foot trims; the letters 1.4 m caps every
    // 1.65 m from 0.5 m under the top (the A 18.6-20.0 m over the sidewalk off blade_1415), open red channels 0.14 m deep
    // with three nested tubes
    const M4 = ap34Mats(), ua = B.u - B.t / 2, ub = B.u + B.t / 2, strip = 0.15;
    box(M4.field, ua, ub, B.y0, B.y1, z0, z1 - 0.04);
    box(M4.white, ua - 0.006, ub + 0.006, B.y0 - 0.02, B.y1 + 0.05, z1 - 0.04, z1 + 0.03);
    box(M4.white, ua - 0.014, ua, B.y0, B.y1, z1 - strip, z1 - 0.04, near); box(M4.white, ub, ub + 0.014, B.y0, B.y1, z1 - strip, z1 - 0.04, near);
    box(M4.white, ua - 0.014, ub + 0.014, B.y1 - 0.04, B.y1 + 0.02, z0, z1 - 0.04, near);
    box(M4.white, ua - 0.014, ub + 0.014, B.y0, B.y0 + 0.04, z0, z1 - 0.04, near);
    const Wz = B.w - strip - 0.12, cap = 1.4, pitch = 1.65, rows = [];
    'APOLLO'.split('').forEach((ch, k) => rows.push([ch, H - 0.5 - cap - k * pitch, cap]));
    let L = null;
    try { L = chanNeon('blade', rows, Wz, H, { ppm: 130, depth: 0.14, insets: [0.035, 0.08, 0.125], tubeR: 0.014, tubeZ: 0.075, maxW: Wz - 0.08 }); }
    catch (e) { console.warn('[bid2] blade letters', e); }
    if (L) {
      const cl = { back: [], walls: [], tubes: [] };
      putChan(L, frame.matrix(ua, B.y0, z0 + 0.1).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2)), cl);
      putChan(L, frame.matrix(ub, B.y0, z0 + 0.1 + Wz).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)), cl);
      addChan(cl, 'blade');
    } else {
      // (the painted atlas faces stay as the fallback when the letters cannot be traced)
      sg.push(panel('blade', B.w - 0.08, H - 0.08, ua - 0.012, yc, zc, -Math.PI / 2));
      sg.push(panel('blade', B.w - 0.08, H - 0.08, ub + 0.012, yc, zc, Math.PI / 2));
    }
    for (const ay of [B.y0 + 0.7, A.corn[0] - 0.3, B.y1 - 1.6]) box(BLK, B.u - 0.07, B.u + 0.07, ay - 0.08, ay + 0.08, 0.1, z0 + 0.05);
    rod([B.u, A.w2[1] + 0.25, 0.15], [B.u, B.y0 + 0.15, z1 - 0.25], 0.03);
  }
  // ------------------------------------------------------------ the rooftop sign frame: a steel lattice braced to the blade
  {
    const Fr = A.frame, s = 0.08, y0 = A.roof, y1 = Fr.y1, lv = [y0 + 0.4, y0 + 3.3, y0 + 6.2, y1 - 0.1];
    for (const u of [Fr.u0, Fr.u1]) for (const w of [Fr.w0, Fr.w1]) box(BLK, u - s, u + s, y0, y1, w - s, w + s);
    for (const y of lv) {
      box(BLK, Fr.u0, Fr.u1, y - s, y + s, Fr.w0 - s, Fr.w0 + s); box(BLK, Fr.u0, Fr.u1, y - s, y + s, Fr.w1 - s, Fr.w1 + s);
      box(BLK, Fr.u0 - s, Fr.u0 + s, y - s, y + s, Fr.w0, Fr.w1); box(BLK, Fr.u1 - s, Fr.u1 + s, y - s, y + s, Fr.w0, Fr.w1);
    }
    for (let k = 0; k < 3; k++) {
      rod([Fr.u0, lv[k], Fr.w1], [Fr.u1, lv[k + 1], Fr.w1]); rod([Fr.u1, lv[k], Fr.w1], [Fr.u0, lv[k + 1], Fr.w1]);
      rod([Fr.u0, lv[k], Fr.w0], [Fr.u0, lv[k + 1], Fr.w1]); rod([Fr.u1, lv[k], Fr.w1], [Fr.u1, lv[k + 1], Fr.w0]);
      rod([Fr.u0, lv[k], Fr.w0], [Fr.u1, lv[k + 1], Fr.w0]);
    }
    rod([Fr.u1, y1 - 0.4, Fr.w1], [A.blade.u, A.blade.y1 - 0.5, A.blade.off + 0.2], 0.05);
  }
  // ------------------------------------------------------------ the own meshes (signs, LED boards, tubes, round pieces)
  let tris = 0;
  const addM = (parts, mat, name, shadow) => {
    if (!parts.length) return;
    const g = merge(parts, place), m = new THREE.Mesh(g, mat);
    m.name = `bid2:apollo:${name}`; m.castShadow = shadow; m.receiveShadow = true; group.add(m); tris += g.getAttribute('position').count / 3;
  };
  addM(sg, Mk.sign, 'signs', false);
  addM(led, Mk.led33, 'led', false);
  addM(tubes, Mk.tubeB, 'neon', false);
  addM(tubesW, Mk.tubeW, 'neonW', false);
  addM(ribs, SSm, 'ribs', false);
  addM(round, TC, 'round', true);
  addM(rods, BLK, 'rods', true);
  addM(bal, TC, 'balusters', true);
  // ------------------------------------------------------------ the massing: the lobby block and the auditorium behind it
  {
    const P0 = frame.p0, P1 = frame.p1, N = frame.n, U = frame.u, D = A.lobbyD, y0 = frame.y0;
    const back = (p) => [p[0] - N[0] * D, p[1] - N[1] * D];
    const BR = K.mat('brick_tan', { tint: '#8d7a64', dirt: 0.45 });
    // the lobby block: the compiled front edge, D metres deep (its front face is the terracotta wall above)
    const g1 = prismGeom([P0, P1, back(P1), back(P0)], y0 - 0.3, y0 + A.roof, new Set([0]));
    const m1 = new THREE.Mesh(g1, BR); m1.name = 'bid2:apollo:lobby'; m1.castShadow = true; m1.receiveShadow = true; group.add(m1);
    // the auditorium: the lot's ring behind the lobby's back line
    const dn = (p) => (p[0] - P0[0]) * N[0] + (p[1] - P0[1]) * N[1];
    const R = frame.ring, out = [];
    for (let i = 0; i < R.length; i++) {
      const a = R[i], b = R[(i + 1) % R.length], da = dn(a) + D, db = dn(b) + D;   // < 0: behind the line
      if (da <= 0) out.push(a);
      if ((da < 0) !== (db < 0) && Math.abs(da - db) > 1e-9) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    void U;
    if (out.length >= 3) {
      const g2 = prismGeom(out, y0 - 0.3, y0 + A.audH);
      const m2 = new THREE.Mesh(g2, BR); m2.name = 'bid2:apollo:auditorium'; m2.castShadow = true; m2.receiveShadow = true; group.add(m2);
      tris += g2.getAttribute('position').count / 3;
    }
    // AR34: the roofs a dark grey membrane, not the walls' brick
    const MEM = K.mat('roof_membrane', { tint: '#4b4b4d', dirt: 0.5 });
    for (const [poly, y] of [[[P0, P1, back(P1), back(P0)], y0 + A.roof + 0.03], [out, y0 + A.audH + 0.03]]) {
      if (poly.length < 3) continue;
      const sh = new THREE.Shape(poly.map((p) => new THREE.Vector2(p[0], -p[1])));
      const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, MEM); m.name = 'bid2:apollo:roof'; m.receiveShadow = true; group.add(m);
    }
    tris += g1.getAttribute('position').count / 3;
  }
  return { tris };
}
