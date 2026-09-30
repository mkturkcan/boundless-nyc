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
