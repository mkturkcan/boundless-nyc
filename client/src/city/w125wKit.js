// AR32 W125W kit: the pieces of W 125th Street's west end (docs/notes/area-w125w.md), built from boxes placed in each
// structure's own frame (u along, l across, y up) and merged into one mesh per material per structure.
//   dinoBuild: Dinosaur Bar-B-Que's two-storey brick building, its loading-dock canopy on W 125th St, the steel-sash
//     windows lit after dark, and the red neon roof signs over W 125th St and Twelfth Avenue (lettering drawn here);
//   rsdBuild: the Riverside Drive Viaduct (1900): arched steel ribs between steel bents, the long arch over W 125th St
//     springing from granite piers, the deck with its fascia girders and railings;
//   mvvBuild: the Manhattan Valley Viaduct's parabolic arch over W 125th St (51.36 m span) under the IRT deck that
//     city/elevatedKit.js draws, and the 125th Street station's platforms, canopies and station house.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ENV, applyLightTrim, applySkyGlass } from '../world/materials.js';
import { DINO, RSD, MVV, COLUMBIA, COTTON, FENCE23, SETTS } from './w125wData.js';
import { COLLIDERS } from './colliders.js';
import { pbrMaterial } from './mat/pbrLib.js';

// ---------------------------------------------------------------- materials
const NIGHT_GLSL = (d, n) => `#include <emissivemap_fragment>\n  totalEmissiveRadiance *= mix(${d.toFixed(3)}, ${n.toFixed(3)}, kNightW);`;
function nightLit(m, dayK, nightK, tag) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.kNightW = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float kNightW;')
      .replace('#include <emissivemap_fragment>', NIGHT_GLSL(dayK, nightK));
  };
  m.customProgramCacheKey = () => tag;
  return applyLightTrim(m);
}
function canvas(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// neon capitals on a black board with a double neon border, lettering drawn here (no logo artwork is copied)
function neonTex(txt, tube = '#ff2412', core = '#ffb49a') {
  return canvas(2048, 320, (g, w, h) => {
    g.fillStyle = '#0d0c0c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = tube; g.lineWidth = 7; g.shadowColor = tube; g.shadowBlur = 20;
    g.strokeRect(16, 16, w - 32, h - 32); g.lineWidth = 3; g.strokeRect(34, 34, w - 68, h - 68);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 205px "Arial Black", Impact, sans-serif';
    const tw = g.measureText(txt).width, sx = Math.min(1, (w - 150) / tw);
    g.save(); g.translate(w / 2, h / 2 + 8); g.scale(sx, 1);
    g.shadowBlur = 34; g.fillStyle = tube; g.fillText(txt, 0, 0);
    g.shadowBlur = 8; g.lineWidth = 5; g.strokeStyle = core; g.strokeText(txt, 0, 0);
    g.restore();
  });
}
// lit signs: unlit, 0.9x by day and 1.55x after dark, the brightest channel eased over 1.0 at night with the hue kept
// (city/tsqKit.js signMat's knee: a saturated red tube over the night bloom threshold blooms pink-white)
function neonMat(map, tag) {
  const m = new THREE.MeshBasicMaterial({ map });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.kNightW = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float kNightW;')
      .replace('#include <fog_fragment>', `gl_FragColor.rgb *= mix(0.9, 1.55, kNightW);
        { float kmx = max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b)), kex = max(kmx - 1.0, 0.0);
          gl_FragColor.rgb *= mix(1.0, min(1.0, (1.0 + kex / (1.0 + kex * 1.5)) / max(kmx, 1e-4)), kNightW); }
        #include <fog_fragment>`);
  };
  m.customProgramCacheKey = () => tag;
  return m;
}
let _M = null;
export function mats() {
  if (_M) return _M;
  const std = (hex, rough = 0.8, metal = 0) => applyLightTrim(new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal }));
  // common red-brown brick, running bond, 8 x 2 5/8 in courses (0.203 x 0.067 m; the texture repeats every 1.2 m)
  const brickT = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#8a8076'; g.fillRect(0, 0, w, h);
    const cw = w / 6, ch = h / 18;
    for (let r = 0; r < 18; r++) for (let c = -1; c < 7; c++) {
      const x = c * cw + (r % 2 ? cw / 2 : 0), k = Math.sin(r * 12.9898 + c * 78.233) * 43758.5453, f = k - Math.floor(k);
      g.fillStyle = `rgb(${148 + f * 40 | 0},${60 + f * 22 | 0},${44 + f * 14 | 0})`;
      g.fillRect(x + 1.5, r * ch + 1.5, cw - 3, ch - 3);
    }
  });
  brickT.wrapS = brickT.wrapT = THREE.RepeatWrapping;
  const brick = applyLightTrim(new THREE.MeshStandardMaterial({ map: brickT, roughness: 0.92 }));
  // steel sash: 4 x 4 lights in dark steel muntins; the panes warm after dark (the emissive map is the panes only)
  const sashT = canvas(128, 128, (g, w, h) => {
    g.fillStyle = '#1b1d1e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const k = Math.sin(i * 7.1 + j * 3.3) * 999, f = k - Math.floor(k);
      g.fillStyle = `rgb(${150 + f * 60 | 0},${120 + f * 50 | 0},${78 + f * 30 | 0})`;
      g.fillRect(4 + i * 30.5, 4 + j * 30.5, 26, 26);
    }
  });
  const sash = nightLit(new THREE.MeshStandardMaterial({ color: 0x59636a, roughness: 0.25, metalness: 0.3, map: sashT, emissive: 0xffb866, emissiveMap: sashT, emissiveIntensity: 1.0 }), 0.0, 0.95, 'w125wSash');
  // the storefront glass: a warm dining room behind it, bright after dark
  const shopT = canvas(256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#7a4a26'); gr.addColorStop(0.55, '#d59a52'); gr.addColorStop(1, '#5a3218');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) { g.fillStyle = 'rgba(255,214,150,0.85)'; g.beginPath(); g.arc(14 + i * 29, 14, 5, 0, 7); g.fill(); }
    g.fillStyle = '#1a1512'; for (let i = 0; i <= 4; i++) g.fillRect(i * (w - 8) / 4, 0, 8, h); g.fillRect(0, h - 10, w, 10); g.fillRect(0, 0, w, 6);
  });
  const shop = nightLit(new THREE.MeshStandardMaterial({ color: 0x4d5256, roughness: 0.15, metalness: 0.2, map: shopT, emissive: 0xffffff, emissiveMap: shopT, emissiveIntensity: 1.0 }), 0.10, 1.25, 'w125wShop');
  // the roof signs and the Cotton Club's board (neonTex, neonMat below)
  const sign = neonMat(neonTex('DINOSAUR BAR-B-QUE'), 'w125wSign');
  const cotton = neonMat(neonTex('COTTON CLUB', '#ff3a6a', '#ffd0e0'), 'w125wSign');
  const glass = applyLightTrim(applySkyGlass(new THREE.MeshStandardMaterial({ color: 0x7d8f99, roughness: 0.08, metalness: 0.2 }), { f0: 0.16, rough: 0.045, tint: [0.94, 0.99, 1.03], aureole: 1.7 }));
  // the station house's windows: lit fare control behind wired glass
  const houseT = canvas(128, 64, (g, w, h) => { g.fillStyle = '#2a2c2c'; g.fillRect(0, 0, w, h); g.fillStyle = '#d8d2b8'; for (let i = 0; i < 4; i++) g.fillRect(6 + i * 31, 10, 24, 40); });
  const house = nightLit(new THREE.MeshStandardMaterial({ color: 0x7c8a86, roughness: 0.5, map: houseT, emissive: 0xfff2d0, emissiveMap: houseT, emissiveIntensity: 1.0 }), 0.0, 0.8, 'w125wHouse');
  _M = {
    brick, sash, shop, sign, cotton, house, glass, fin: std(0xe9e8e2, 0.45, 0.25),
    // enamel pendant shades under the loading-dock canopy, their bulbs lit after dark
    shade: std(0xd9d6cc, 0.5, 0.2),
    bulb: nightLit(new THREE.MeshStandardMaterial({ color: 0xfff4dc, roughness: 0.4, emissive: 0xffd9a0, emissiveIntensity: 1.0 }), 0.15, 3.2, 'w125wBulb'),
    // the restaurant's own painted wall sign on the brick by the door (white hand lettering, drawn here)
    paint: (() => { const t = canvas(512, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(236,232,222,0.88)'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.font = 'italic bold 118px Georgia, serif'; g.fillText('Cold Beer', 18, 140);
      g.font = 'bold 86px Georgia, serif'; g.fillText('& COCKTAILS', 18, 250);
      g.font = 'bold 70px Arial, sans-serif'; g.fillText('ALL  LEGAL', 40, 360); g.fillText('BEVERAGES', 40, 450);
    }); return applyLightTrim(new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.35, roughness: 0.9, depthWrite: false })); })(),
    trim: std(0x3b3632, 0.7),          // coping, sills, lintels (dark cast stone / painted steel)
    roof: std(0x2d2b29, 0.95),
    awning: std(0x7d1714, 0.85),       // red canvas awning
    frame: std(0x1f2021, 0.5, 0.6),    // sign frames, storefront mullions
    rsSteel: std(0xa7a8a1, 0.6, 0.3),     // the Riverside Drive Viaduct's pale grey paint (the Commons photograph)
    irtSteel: std(0x34383b, 0.7, 0.3),    // the IRT viaduct's near-black green (city/elevatedKit.js STEEL)
    granite: std(0x8e887d, 0.9),
    concrete: std(0x908c85, 0.9),
    canopy: std(0x4f5d57, 0.6, 0.3),
    rail: std(0x2a2c2d, 0.5, 0.5),
  };
  return _M;
}

// ---------------------------------------------------------------- box bins
const UNIT = new THREE.BoxGeometry(1, 1, 1);
const _m = new THREE.Matrix4(), _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), _S = new THREE.Vector3();
class Bins {
  constructor() { this.L = new Map(); }
  put(mat, g) { let a = this.L.get(mat); if (!a) this.L.set(mat, (a = [])); a.push(g); }
  // a box from p0 to p1 (its centreline), cross-section w across (towards `side`, a horizontal unit) by h
  seg(mat, p0, p1, w, h, side) {
    _X.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const L = _X.length(); if (L < 1e-3) return;
    _X.divideScalar(L);
    _Z.set(side[0], 0, side[1]); _Z.addScaledVector(_X, -_Z.dot(_X)).normalize();
    _Y.crossVectors(_Z, _X);
    _m.makeBasis(_X.clone().multiplyScalar(L), _Y.clone().multiplyScalar(h), _Z.clone().multiplyScalar(w));
    _m.setPosition((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
    this.put(mat, UNIT.clone().applyMatrix4(_m));
  }
  // a quad (two-sided = false) with uv in metres / rep, from the bottom edge a -> b (world xz) up h from y
  quad(mat, a, b, y, h, rep = 1, out = 0.0, n = null) {
    const g = new THREE.PlaneGeometry(1, 1);
    if (n && (-(b[1] - a[1]) * n[0] + (b[0] - a[0]) * n[1]) < 0) { const t = a; a = b; b = t; }   // X x Y must be n
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    const ux = dx / L, uz = dz / L, nx = n ? n[0] : -uz, nz = n ? n[1] : ux;
    _X.set(ux * L, 0, uz * L); _Y.set(0, h, 0); _Z.set(nx, 0, nz);
    _m.makeBasis(_X, _Y, _Z); _m.setPosition((a[0] + b[0]) / 2 + nx * out, y + h / 2, (a[1] + b[1]) / 2 + nz * out);
    g.applyMatrix4(_m);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (rep ? L / rep : 1), uv.getY(i) * (rep ? h / rep : 1));
    this.put(mat, g);
  }
  flush(group, name, shadow = true) {
    let tri = 0;
    for (const [mat, list] of this.L) {
      const idx = list.filter((g) => g.index), non = list.filter((g) => !g.index);
      for (const set of [idx, non]) {
        if (!set.length) continue;
        const g = mergeGeometries(set, false);
        for (const x of set) x.dispose();
        if (!g) continue;
        const m = new THREE.Mesh(g, mat);
        // (a part with its own materials, the 2023 hoarding, may flush before mats() ever ran in the page: `_M` null)
        m.name = 'ar32w:' + name; m.castShadow = shadow && !(_M && (mat === _M.sign || mat === _M.cotton || mat === _M.shop || mat === _M.glass || mat === _M.paint || mat === _M.bulb)); m.receiveShadow = true;
        m.matrixAutoUpdate = false; m.updateMatrix();
        m.layers.enable(3);
        group.add(m);
        tri += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      }
    }
    this.L.clear();
    return tri | 0;
  }
}
// a frame: origin (x, z), unit along (ax, az), across n = (-az, ax)
const F = (o, a) => ({ o, a, n: [-a[1], a[0]], p: (u, l, y) => [o[0] + a[0] * u - a[1] * l, y, o[1] + a[1] * u + a[0] * l] });

// ---------------------------------------------------------------- Dinosaur Bar-B-Que
export function dinoBuild(group, gy) {
  const M = mats(), B = new Bins(), R = DINO.ring, n = R.length;
  const y0 = gy - 0.25, yE = gy + DINO.eave, yP = yE + DINO.parapet;
  // outward normal of edge i: (-uz, ux) or its opposite, whichever points away from the centroid
  const [gx, gz] = DINO.centroid;
  const outN = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); let nx = -dz / L, nz = dx / L; if (nx * ((a[0] + b[0]) / 2 - gx) + nz * ((a[1] + b[1]) / 2 - gz) < 0) { nx = -nx; nz = -nz; } return [nx, nz, dx / L, dz / L, L]; };
  for (let i = 0; i < n; i++) {
    const a = R[i], b = R[(i + 1) % n], [nx, nz, ux, uz, L] = outN(a, b);
    B.quad(M.brick, a, b, y0, yP - y0, 1.2, 0, [nx, nz]);
    // coping over the parapet, a sill band at the second floor, a dark base course
    B.seg(M.trim, [a[0] + nx * 0.1, yP + 0.09, a[1] + nz * 0.1], [b[0] + nx * 0.1, yP + 0.09, b[1] + nz * 0.1], 0.5, 0.18, [nx, nz]);
    B.seg(M.trim, [a[0] + nx * 0.06, gy + 4.55, a[1] + nz * 0.06], [b[0] + nx * 0.06, gy + 4.55, b[1] + nz * 0.06], 0.14, 0.22, [nx, nz]);
    B.seg(M.trim, [a[0] + nx * 0.05, gy + 0.3, a[1] + nz * 0.05], [b[0] + nx * 0.05, gy + 0.3, b[1] + nz * 0.05], 0.12, 0.6, [nx, nz]);
    if (L < 5) continue;
    // bays of about 4.6 m: steel-sash windows on the second floor (2.9 x 2.5 m), and on the storefront frontages
    // (W 125th St, Twelfth Avenue) glazed shop bays on the ground floor; blind brick with smaller sash elsewhere
    const bays = Math.max(1, Math.round((L - 1.2) / 4.6)), bw = (L - 1.2) / bays, shopEdge = i === DINO.front125 || i === DINO.front12;
    for (let k = 0; k < bays; k++) {
      const c = 0.6 + bw * (k + 0.5), ww = Math.min(2.9, bw - 1.1);
      const p = (t) => [a[0] + ux * t, a[1] + uz * t];
      B.quad(M.sash, p(c - ww / 2), p(c + ww / 2), gy + 5.1, 2.4, 0, 0.03, [nx, nz]);
      B.seg(M.trim, [p(c - ww / 2 - 0.15)[0] + nx * 0.1, gy + 5.0, p(c - ww / 2 - 0.15)[1] + nz * 0.1], [p(c + ww / 2 + 0.15)[0] + nx * 0.1, gy + 5.0, p(c + ww / 2 + 0.15)[1] + nz * 0.1], 0.25, 0.14, [nx, nz]);       // sill
      B.seg(M.trim, [p(c - ww / 2 - 0.2)[0] + nx * 0.07, gy + 7.62, p(c - ww / 2 - 0.2)[1] + nz * 0.07], [p(c + ww / 2 + 0.2)[0] + nx * 0.07, gy + 7.62, p(c + ww / 2 + 0.2)[1] + nz * 0.07], 0.16, 0.26, [nx, nz]);   // lintel
      if (shopEdge && !(i === DINO.front125 && k === bays - 1)) {   // the last bay on W 125th St is the painted brick pier
        const sw = Math.min(3.6, bw - 0.7);
        const sy = i === DINO.front125 ? 1.05 : 0.6;   // over the loading dock on W 125th St
        B.quad(M.shop, p(c - sw / 2), p(c + sw / 2), gy + sy, 3.65 - sy, 0, 0.03, [nx, nz]);
      } else if (k % 2 === 0) {
        B.quad(M.sash, p(c - 1.1), p(c + 1.1), gy + 1.4, 2.0, 0, 0.03, [nx, nz]);
      }
    }
    if (i === DINO.front125) {
      // the old meatpacking plant's loading dock on W 125th St (Commons photograph "Dinosaur Bar B Que W125 St jeh",
      // look-only): a steel canopy of riveted beams with diagonal bracing cantilevered 4.3 m over a raised concrete dock
      // (0.95 m, 2.6 m deep) with a pipe railing and steps at its south end
      const t0 = 0.6, t1 = L - 0.6, d = 4.3, yW = gy + 4.95, yO = gy + 4.55, q = (t, o, y) => [a[0] + ux * t + nx * o, y, a[1] + uz * t + nz * o];
      B.seg(M.frame, q(t0, 0.12, yW), q(t1, 0.12, yW), 0.22, 0.38, [nx, nz]);                        // wall ledger
      B.seg(M.frame, q(t0, d, yO), q(t1, d, yO), 0.2, 0.5, [nx, nz]);                                  // fascia channel
      let prevT = null;
      for (let t = t0; t <= t1 + 1e-6; t += (t1 - t0) / Math.round((t1 - t0) / 2.4)) {
        B.seg(M.frame, q(t, 0.1, yW), q(t, d, yO), 0.16, 0.34, [ux, uz]);                                // beam
        if (prevT !== null) B.seg(M.frame, q(prevT, 0.3, yW + 0.12), q(t, d - 0.2, yO + 0.12), 0.06, 0.08, [ux, uz]);   // bracing
        prevT = t;
      }
      { const mid = q((t0 + t1) / 2, d / 2, (yW + yO) / 2 + 0.2);
        _X.set(ux * (t1 - t0), 0, uz * (t1 - t0)); _Z.set(nx * d, yO - yW, nz * d); _Y.crossVectors(_Z, _X).normalize().multiplyScalar(0.05);
        _m.makeBasis(_X, _Y, _Z); _m.setPosition(mid[0], mid[1], mid[2]); B.put(M.frame, UNIT.clone().applyMatrix4(_m)); }   // roof deck
      const k0 = 1.0, k1 = L - 3.2, dd = 2.6, yd = gy + 0.95;
      { const c0 = q(k0, dd / 2, (gy + yd) / 2 - 0.1), c1 = q(k1, dd / 2, (gy + yd) / 2 - 0.1); B.seg(M.concrete, c0, c1, dd, yd - gy + 0.2, [nx, nz]); }
      for (let st = 0; st < 3; st++) { const h1 = yd - (st + 1) * 0.3; B.seg(M.concrete, q(k1 + 0.35 * st, dd / 2, (gy + h1) / 2), q(k1 + 0.35 * (st + 1) + 0.9, dd / 2, (gy + h1) / 2), dd, h1 - gy + 0.02, [nx, nz]); }
      B.seg(M.rail, q(k0, dd - 0.08, yd + 1.0), q(k1, dd - 0.08, yd + 1.0), 0.06, 0.06, [nx, nz]);
      for (let t = k0 + 0.1; t <= k1; t += 1.6) B.seg(M.rail, q(t, dd - 0.08, yd), q(t, dd - 0.08, yd + 1.0), 0.05, 0.05, [nx, nz]);
      // pendant lamps every 4.8 m under the canopy, 1.9 m out from the wall
      for (let t = t0 + 2.4; t <= t1 - 1.2; t += 4.8) {
        const yl = yW - 0.95; B.seg(M.rail, q(t, 1.9, yl + 0.3), q(t, 1.9, yW - 0.05), 0.02, 0.02, [nx, nz]);
        B.seg(M.shade, q(t - 0.22, 1.9, yl + 0.18), q(t + 0.22, 1.9, yl + 0.18), 0.44, 0.22, [nx, nz]);
        B.seg(M.bulb, q(t - 0.1, 1.9, yl), q(t + 0.1, 1.9, yl), 0.2, 0.16, [nx, nz]);
      }
      // the painted sign on the brick between the last two bays (3.2 x 3.2 m, 1.3 m up)
      { const t = 0.6 + bw * (bays - 0.5); B.quad(M.paint, [a[0] + ux * (t - 1.6), a[1] + uz * (t - 1.6)], [a[0] + ux * (t + 1.6), a[1] + uz * (t + 1.6)], gy + 1.3, 3.2, 0, 0.05, [nx, nz]); }
    }
  }
  // flat roof inside the parapet, tar
  { const sh = new THREE.Shape(R.map(([x, z]) => new THREE.Vector2(x, -z))); const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); g.translate(0, yE + 0.05, 0); B.put(M.roof, g.toNonIndexed()); }
  // the roof signs: one over the W 125th St front, one over the Twelfth Avenue front (facing the highway), on steel
  // frames standing on the roof 1.2 m behind the parapet
  for (const [ei, len, hgt] of [[DINO.front125, 17.0, 3.0], [DINO.front12, 22.0, 3.4]]) {
    const a = R[ei], b = R[(ei + 1) % n], [nx, nz, ux, uz] = outN(a, b);
    const cx = (a[0] + b[0]) / 2 - nx * 1.2, cz = (a[1] + b[1]) / 2 - nz * 1.2, yb = yP + 0.5;
    const e0 = [cx - ux * len / 2, cz - uz * len / 2], e1 = [cx + ux * len / 2, cz + uz * len / 2];
    B.quad(M.sign, e0, e1, yb, hgt, 0, 0.02, [nx, nz]);
    // board back, its frame, legs and raking struts
    B.seg(M.frame, [e0[0] - nx * 0.12, yb + hgt / 2, e0[1] - nz * 0.12], [e1[0] - nx * 0.12, yb + hgt / 2, e1[1] - nz * 0.12], 0.2, hgt + 0.2, [nx, nz]);
    for (let t = -len / 2 + 1; t <= len / 2 - 0.9; t += (len - 2) / 4) {
      const px = cx + ux * t - nx * 0.3, pz = cz + uz * t - nz * 0.3;
      B.seg(M.frame, [px, yE, pz], [px, yb + hgt, pz], 0.18, 0.18, [nx, nz]);
      B.seg(M.frame, [px - nx * 2.2, yE, pz - nz * 2.2], [px, yb + hgt * 0.7, pz], 0.12, 0.12, [nx, nz]);
    }
  }
  return B.flush(group, 'dino');
}

// ---------------------------------------------------------------- the Riverside Drive Viaduct
// Bents (steel columns on granite footings) at about 21.3 m (70 ft) spacing along the 466.8 m line, the W 125th St bay
// widened to 44 m between granite piers; between bents each rib line carries an arched plate girder rising 3.4 m to the
// deck; over W 125th St the ribs spring from the pier tops 5.2 m over the street and rise 12.3 m to the crown.
export function rsdStations() {
  const s0 = RSD.x125 - RSD.span125 / 2, s1 = RSD.x125 + RSD.span125 / 2, out = [];
  const nS = Math.max(1, Math.round((s0 - 6) / 21.3)), nN = Math.max(1, Math.round((RSD.L - 6 - s1) / 21.3));
  for (let i = 0; i <= nS; i++) out.push(6 + (s0 - 6) * i / nS);
  for (let i = 0; i <= nN; i++) out.push(s1 + (RSD.L - 6 - s1) * i / nN);
  return { st: out, s0, s1 };
}
export function rsdBuild(group, gy) {
  const M = mats(), B = new Bins(), fr = F(RSD.A, RSD.dir), side = fr.n;
  const yTop = gy + RSD.deckAbove, yU = yTop - 1.05, hw = RSD.W / 2, lc = RSD.lc;
  const { st, s0, s1 } = rsdStations();
  const P = (u, l, y) => fr.p(u, l + lc, y);
  // deck slab, fascia girders, railings with posts, lamp standards every other bent
  B.seg(M.concrete, P(6 - 3, 0, yTop - 0.45), P(RSD.L - 6 + 3, 0, yTop - 0.45), RSD.W, 0.9, side);
  for (const s of [-1, 1]) {
    B.seg(M.rsSteel, P(3, s * (hw - 0.2), yTop - 1.15), P(RSD.L - 3, s * (hw - 0.2), yTop - 1.15), 0.5, 1.7, side);
    B.seg(M.rsSteel, P(3, s * (hw - 0.05), yTop - 0.35), P(RSD.L - 3, s * (hw - 0.05), yTop - 0.35), 0.3, 0.3, side);   // cornice
    B.seg(M.rail, P(3, s * (hw - 0.25), yTop + 1.02), P(RSD.L - 3, s * (hw - 0.25), yTop + 1.02), 0.12, 0.1, side);
    B.seg(M.rail, P(3, s * (hw - 0.25), yTop + 0.35), P(RSD.L - 3, s * (hw - 0.25), yTop + 0.35), 0.06, 0.06, side);
    for (let u = 3; u <= RSD.L - 3; u += 2.4) B.seg(M.rail, P(u, s * (hw - 0.25), yTop), P(u, s * (hw - 0.25), yTop + 1.05), 0.07, 0.07, side);
  }
  st.forEach((u, i) => {
    if (i % 2) return;
    for (const s of [-1, 1]) {
      const b = P(u, s * (hw - 0.3), yTop), e = P(u, s * (hw - 1.3), yTop + 5.3);
      B.seg(M.rail, b, [b[0], yTop + 5.2, b[2]], 0.2, 0.2, side); B.seg(M.rail, [b[0], yTop + 5.2, b[2]], e, 0.1, 0.1, side);
      B.seg(M.bulb, [e[0], e[1] - 0.45, e[2]], [e[0], e[1] - 0.1, e[2]], 0.34, 0.34, side);   // the lantern, lit after dark
    }
  });
  // abutments at both ends (granite), down to the street
  for (const u of [3, RSD.L - 3]) B.seg(M.granite, P(u, 0, gy - 0.3), P(u, 0, yTop - 0.9), RSD.W + 1.0, 6.0, side);
  const all = st.slice().sort((a, b) => a - b);
  // bents: two columns at the deck's edges (the compiled Riverside Drive runs at grade along the line under the deck,
  // so nothing stands in its roadway), a cross girder at the springing carrying the five rib lines, a strut at mid
  // height and X-bracing in the two panels; the W 125th St bay's bents are granite piers at the same two lines with a
  // steel cross girder 4.85 m clear over the roadway
  const COLS = RSD.cols;
  for (const u of all) {
    const big = Math.abs(u - s0) < 0.5 || Math.abs(u - s1) < 0.5;
    const ySp = big ? gy + 5.55 : yU - 3.4;
    for (const l of COLS) {
      const pc = P(u, l, gy - 0.3);
      if (big) {
        B.seg(M.granite, pc, [pc[0], gy + 5.2, pc[2]], 2.6, 3.2, side);                                            // pier
        B.seg(M.granite, [pc[0], gy + 5.2, pc[2]], [pc[0], gy + 5.75, pc[2]], 2.9, 3.5, side);                     // cap
        const pt = P(u, l, gy + 5.75); B.seg(M.rsSteel, pt, [pt[0], yU, pt[2]], 0.7, 0.9, side);                   // post to deck
      } else {
        B.seg(M.granite, pc, [pc[0], gy + 0.55, pc[2]], 1.7, 1.7, side);                                           // footing
        B.seg(M.rsSteel, [pc[0], gy + 0.5, pc[2]], [pc[0], ySp, pc[2]], 0.85, 0.85, side);                         // column
        B.seg(M.rsSteel, [pc[0], ySp - 0.3, pc[2]], [pc[0], ySp + 0.2, pc[2]], 1.3, 1.3, side);                    // capital
        B.seg(M.rsSteel, [pc[0], ySp + 0.2, pc[2]], [pc[0], yU, pc[2]], 0.6, 0.6, side);                          // post over it
      }
    }
    B.seg(M.rsSteel, P(u, COLS[0] - 0.4, ySp - 0.3), P(u, COLS[1] + 0.4, ySp - 0.3), 0.5, 0.9, [fr.a[0], fr.a[1]]);   // cross girder
    B.seg(M.rsSteel, P(u, COLS[0], yU - 0.4), P(u, COLS[1], yU - 0.4), 0.35, 0.8, [fr.a[0], fr.a[1]]);                // top strut
    if (!big) {
      const yM = gy + (ySp - gy) * 0.5;
      B.seg(M.rsSteel, P(u, COLS[0], yM), P(u, COLS[1], yM), 0.3, 0.45, [fr.a[0], fr.a[1]]);
      const lm = (COLS[0] + COLS[1]) / 2;
      for (const [la, lb] of [[COLS[0], lm], [lm, COLS[1]]]) {
        B.seg(M.rsSteel, P(u, la, yM), P(u, lb, ySp - 0.75), 0.16, 0.22, [fr.a[0], fr.a[1]]);
        B.seg(M.rsSteel, P(u, lb, yM), P(u, la, ySp - 0.75), 0.16, 0.22, [fr.a[0], fr.a[1]]);
      }
    }
  }
  // arched ribs between successive bents, spandrel posts over them, a stringer under the deck on each rib line
  for (let i = 0; i < all.length - 1; i++) {
    const ua = all[i], ub = all[i + 1], span = ub - ua, big = Math.abs(ua - s0) < 0.5 && Math.abs(ub - s1) < 0.5;
    const ySp = big ? gy + 5.55 : yU - 3.4, rise = yU - 0.5 - ySp, dep = big ? 1.5 : 0.95, N = big ? 20 : 10;
    const yr = (t) => ySp + rise * (1 - (2 * t - 1) ** 2);       // parabola through the springings and the crown
    for (const l of RSD.ribs) {
      for (let k = 0; k < N; k++) {
        const t0 = k / N, t1 = (k + 1) / N;
        B.seg(M.rsSteel, P(ua + span * t0, l, yr(t0)), P(ua + span * t1, l, yr(t1)), 0.55, dep, side);
      }
      B.seg(M.rsSteel, P(ua, l, yU - 0.35), P(ub, l, yU - 0.35), 0.4, 0.7, side);
      const posts = big ? 12 : 4;
      for (let k = 1; k < posts; k++) {
        const t = k / posts, y = yr(t) + dep / 2; if (yU - 0.7 - y < 0.3) continue;
        B.seg(M.rsSteel, P(ua + span * t, l, y), P(ua + span * t, l, yU - 0.7), big ? 0.35 : 0.25, big ? 0.35 : 0.25, side);
      }
      // over W 125th St the outer ribs' spandrels are an arcade: a round arch between each pair of posts under the
      // stringer (the row of arched openings over the big arch in the Commons photograph)
      if (big && Math.abs(l) === 10) {
        const pw = span / posts, r = pw / 2 - 0.12, yc = yU - 0.7 - r;
        for (let k = 1; k < posts - 1; k++) {
          const c = ua + pw * (k + 0.5);
          if (yc - r * 0.2 < yr((c - ua) / span) + dep / 2) continue;   // no room over the rib near the springings
          for (let j = 0; j < 7; j++) {
            const a0 = Math.PI * j / 7, a1 = Math.PI * (j + 1) / 7;
            B.seg(M.rsSteel, P(c + r * Math.cos(a0), l, yc + r * Math.sin(a0)), P(c + r * Math.cos(a1), l, yc + r * Math.sin(a1)), 0.3, 0.22, side);
          }
        }
      }
    }
    // lateral struts between the ribs at the quarter points
    for (const t of big ? [0.18, 0.34, 0.5, 0.66, 0.82] : [0.3, 0.7]) {
      const y = yr(t); B.seg(M.rsSteel, P(ua + span * t, RSD.ribs[0], y), P(ua + span * t, RSD.ribs[RSD.ribs.length - 1], y), 0.25, 0.35, [fr.a[0], fr.a[1]]);
    }
  }
  return B.flush(group, 'rsd');
}

// ---------------------------------------------------------------- the Manhattan Valley Viaduct at 125th St
export function mvvBuild(group, gy) {
  const M = mats(), B = new Bins(), fr = F(MVV.C, MVV.dir), side = fr.n, alng = [fr.a[0], fr.a[1]];
  const S = MVV.span, h = S / 2, ySp = gy + 1.9, yCr = MVV.girderUnder - 0.05, dep = 1.35, yc = (u) => ySp + (yCr - dep / 2 - ySp) * (1 - (u / h) ** 2);
  const N = 28;
  // skewback piers (granite-faced concrete) at the four springings
  for (const su of [-1, 1]) for (const sl of [-1, 1]) {
    const p = fr.p(su * (h + 0.6), sl * MVV.rib, gy - 0.3);
    B.seg(M.granite, p, [p[0], ySp + 0.2, p[2]], 2.6, 3.6, alng);
  }
  for (const sl of [-1, 1]) {
    const l = sl * MVV.rib;
    for (let k = 0; k < N; k++) {
      const u0 = -h + S * k / N, u1 = -h + S * (k + 1) / N;
      B.seg(M.irtSteel, fr.p(u0, l, yc(u0)), fr.p(u1, l, yc(u1)), 0.8, dep, side);                 // the rib's web
      B.seg(M.irtSteel, fr.p(u0, l, yc(u0) + dep / 2), fr.p(u1, l, yc(u1) + dep / 2), 1.05, 0.1, side);   // flanges
      B.seg(M.irtSteel, fr.p(u0, l, yc(u0) - dep / 2), fr.p(u1, l, yc(u1) - dep / 2), 1.05, 0.1, side);
    }
    // spandrel posts every 3.2 m, a diagonal in each panel
    let prev = null;
    for (let u = -h + 3.2; u < h - 1.5; u += 3.2) {
      const y = yc(u) + dep / 2;
      if (MVV.girderUnder - y > 0.4) B.seg(M.irtSteel, fr.p(u, l, y), fr.p(u, l, MVV.girderUnder), 0.4, 0.4, side);
      if (prev && MVV.girderUnder - Math.min(prev[1], y) > 1.2) B.seg(M.irtSteel, fr.p(prev[0], l, prev[1]), fr.p(u, l, MVV.girderUnder - 0.1), 0.16, 0.22, side);
      prev = [u, y];
    }
  }
  // lateral bracing between the two ribs
  for (let u = -h + 2.2; u < h - 1; u += 4.3) {
    const y = yc(u);
    B.seg(M.irtSteel, fr.p(u, -MVV.rib, y), fr.p(u, MVV.rib, y), 0.3, 0.5, alng);
  }
  // the 125th Street station: side platforms (concrete on steel brackets), windscreen railings, canopies on columns
  const { u0, u1, l0, l1 } = MVV.plat, yPl = MVV.topRail + 1.05;
  for (const sl of [-1, 1]) {
    const lm = sl * (l0 + l1) / 2, w = l1 - l0;
    B.seg(M.concrete, fr.p(u0, lm, yPl - 0.2), fr.p(u1, lm, yPl - 0.2), w, 0.4, side);
    B.seg(M.irtSteel, fr.p(u0, sl * (l1 - 0.1), yPl - 0.9), fr.p(u1, sl * (l1 - 0.1), yPl - 0.9), 0.25, 1.1, side);     // fascia
    B.seg(M.rail, fr.p(u0, sl * (l1 - 0.08), yPl + 1.0), fr.p(u1, sl * (l1 - 0.08), yPl + 1.0), 0.1, 0.1, side);
    B.seg(M.canopy, fr.p(u0, sl * (l1 - 0.06), yPl + 0.5), fr.p(u1, sl * (l1 - 0.06), yPl + 0.5), 0.04, 1.0, side);  // windscreen
    for (let u = u0 + 1; u <= u1 - 1; u += 3.0) B.seg(M.rail, fr.p(u, sl * (l1 - 0.08), yPl), fr.p(u, sl * (l1 - 0.08), yPl + 1.05), 0.06, 0.06, side);
    // canopy over the middle 120 m: columns at 7.5 m, a roof sloping outward from 3.5 m, its fascia
    const cu0 = -78, cu1 = 44;
    for (let u = cu0 + 1.5; u <= cu1 - 1.5; u += 7.5) {
      B.seg(M.canopy, fr.p(u, sl * (l0 + 1.2), yPl), fr.p(u, sl * (l0 + 1.2), yPl + 3.4), 0.22, 0.22, side);
      B.seg(M.canopy, fr.p(u, sl * (l0 - 0.3), yPl + 3.5), fr.p(u, sl * (l1 + 0.2), yPl + 3.3), 0.14, 0.3, alng);
      B.seg(M.bulb, fr.p(u + 3.75 - 0.6, sl * (l0 + 1.2), yPl + 3.28), fr.p(u + 3.75 + 0.6, sl * (l0 + 1.2), yPl + 3.28), 0.16, 0.06, side);   // platform lamp
    }
    B.seg(M.canopy, fr.p(cu0, sl * (l0 + (l1 - l0) / 2 - 0.05), yPl + 3.52), fr.p(cu1, sl * (l0 + (l1 - l0) / 2 - 0.05), yPl + 3.52), w + 0.6, 0.1, side);
    B.seg(M.canopy, fr.p(cu0, sl * (l1 + 0.25), yPl + 3.35), fr.p(cu1, sl * (l1 + 0.25), yPl + 3.35), 0.06, 0.45, side);
    B.seg(M.canopy, fr.p(cu0, sl * (l0 - 0.35), yPl + 3.55), fr.p(cu1, sl * (l0 - 0.35), yPl + 3.55), 0.06, 0.35, side);
  }
  // the station house hung under the tracks south of the arch (fare control; its windows lit after dark)
  { const ua = -h - 34, ub = -h - 4, yb = MVV.girderUnder - 4.4, yt = MVV.girderUnder - 0.1, hl = 7.6;
    B.seg(M.irtSteel, fr.p(ua, 0, yb - 0.2), fr.p(ub, 0, yb - 0.2), 2 * hl + 0.4, 0.45, side);      // floor
    B.seg(M.irtSteel, fr.p(ua, 0, yt - 0.15), fr.p(ub, 0, yt - 0.15), 2 * hl + 0.4, 0.3, side);    // roof band
    for (const sl of [-1, 1]) {
      const a = fr.p(ua, sl * hl, 0), b = fr.p(ub, sl * hl, 0);
      B.quad(M.house, [a[0], a[2]], [b[0], b[2]], yb, yt - yb - 0.3, 3.2, 0.02, [side[0] * sl, side[1] * sl]);
    }
    for (const u of [ua, ub]) B.seg(M.house, fr.p(u, -hl, (yb + yt) / 2 - 0.15), fr.p(u, hl, (yb + yt) / 2 - 0.15), 0.2, yt - yb - 0.3, alng);
    // stairs down to Broadway's median from the house's south end, one each side
    for (const sl of [-1, 1]) {
      const top = fr.p(ua - 0.2, sl * 5.8, yb), bot = fr.p(ua - 20.2, sl * 5.8, gy + 0.1);   // on Broadway's median
      B.seg(M.irtSteel, top, bot, 2.0, 0.35, side);
      B.seg(M.rail, [top[0], top[1] + 1.0, top[2]], [bot[0], bot[1] + 1.0, bot[2]], 0.08, 0.08, side);
      B.seg(M.irtSteel, [bot[0], gy - 0.2, bot[2]], [bot[0], gy + 0.3, bot[2]], 2.2, 0.8, side);
    }
  }
  return B.flush(group, 'mvv');
}

// ---------------------------------------------------------------- Columbia's curtain walls, the Cotton Club's sign
export function glassBuild(group, b, gy, h) {
  const M = mats(), B = new Bins(), R = b.ring, n = R.length, H = b.hReal || h || b.h, fl = H / b.floors;
  // AR34 w2b3: the curtain glass as MATS's vision glass (offices and shades behind it, the street and the sky in it): the old
  // sky glass read as dark slabs from 125th (forum26nw: David Geffen Hall light blue-grey glass between white bands)
  const VG = pbrMaterial('glass_vision', { tint: '#b9cbd8', storey: [fl, 0], bay: 1.5, blinds: b.blinds ?? 0.3, trans: 0.55, seed: 77 });
  let gx = 0, gz = 0; for (const p of R) { gx += p[0] / n; gz += p[1] / n; }
  for (let i = 0; i < n; i++) {
    const a = R[i], c = R[(i + 1) % n], dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 0.5) continue;
    const ux = dx / L, uz = dz / L; let nx = -uz, nz = ux;
    if (nx * ((a[0] + c[0]) / 2 - gx) + nz * ((a[1] + c[1]) / 2 - gz) < 0) { nx = -nx; nz = -nz; }
    B.quad(VG, a, c, gy - 0.2, H + 0.2, 0, 0, [nx, nz]);
    // white floor bands (the slab edges), a deeper band at the roof, white fins or mullions
    for (let k = 1; k <= b.floors; k++) {
      const y = gy + fl * k - 0.2, d = k === b.floors ? 0.5 : (b.bandD ?? 0.28), t = k === b.floors ? 0.9 : (b.band ?? 0.42);
      B.seg(M.fin, [a[0] + nx * d / 2, y, a[1] + nz * d / 2], [c[0] + nx * d / 2, y, c[1] + nz * d / 2], d, t, [nx, nz]);
    }
    if (b.mullion) {
      // fine mullions (a thin cap on the glass) in place of fins
      const nm = Math.max(1, Math.round(L / b.mullion));
      for (let k = 1; k < nm; k++) { const t = L * k / nm, x = a[0] + ux * t + nx * 0.03, z = a[1] + uz * t + nz * 0.03; B.seg(M.fin, [x, gy, z], [x, gy + H, z], 0.05, 0.06, [nx, nz]); }
    } else {
      const nf = Math.max(1, Math.round(L / b.fins)), deep = b.fins < 2 ? 0.55 : 0.12;
      for (let k = 0; k <= nf; k++) {
        const t = L * k / nf, x = a[0] + ux * t + nx * deep / 2, z = a[1] + uz * t + nz * deep / 2;
        B.seg(M.fin, [x, gy + (b.fins < 2 ? 4.0 : 0), z], [x, gy + H, z], b.fins < 2 ? 0.1 : 0.08, deep, [nx, nz]);
      }
    }
  }
  { const sh = new THREE.Shape(R.map(([x, z]) => new THREE.Vector2(x, -z))); const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); g.translate(0, gy + H - 0.05, 0); B.put(M.roof, g.toNonIndexed()); }
  return B.flush(group, 'col');
}
export function cottonBuild(group, gy) {
  const M = mats(), B = new Bins(), { a, b, c } = COTTON;
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
  let nx = -uz, nz = ux; if (nx * ((a[0] + b[0]) / 2 - c[0]) + nz * ((a[1] + b[1]) / 2 - c[1]) < 0) { nx = -nx; nz = -nz; }
  const w = 12.0, hh = 1.9, y = gy + 3.7, mx = (a[0] + b[0]) / 2 + nx * 0.35, mz = (a[1] + b[1]) / 2 + nz * 0.35;
  B.quad(M.cotton, [mx - ux * w / 2, mz - uz * w / 2], [mx + ux * w / 2, mz + uz * w / 2], y, hh, 0, 0.02, [nx, nz]);
  B.seg(M.frame, [mx - ux * w / 2 - nx * 0.12, y + hh / 2, mz - uz * w / 2 - nz * 0.12], [mx + ux * w / 2 - nx * 0.12, y + hh / 2, mz + uz * w / 2 - nz * 0.12], 0.22, hh + 0.16, [nx, nz]);
  // the red canopy over the door, 2.4 m out, on two posts
  const e0 = [mx - ux * 2.2, mz - uz * 2.2], e1 = [mx + ux * 2.2, mz + uz * 2.2];
  B.seg(M.awning, [e0[0] + nx * 1.2, gy + 3.25, e0[1] + nz * 1.2], [e1[0] + nx * 1.2, gy + 3.25, e1[1] + nz * 1.2], 2.4, 0.3, [nx, nz]);
  for (const e of [e0, e1]) B.seg(M.frame, [e[0] + nx * 2.3, gy, e[1] + nz * 2.3], [e[0] + nx * 2.3, gy + 3.1, e[1] + nz * 2.3], 0.08, 0.08, [nx, nz]);
  return B.flush(group, 'cotton');
}

// ---------------------------------------------------------------- walker obstacles (city/colliders.js boxes)
// the loading dock on the W 125th St sidewalk, the viaduct's piers and footings, the arch's skewbacks: walked round
export function w125wColliders(which, gy) {
  const add = (x, y, z, hw, hh, hd, ax, az) => { try { COLLIDERS.addBox('kit31', { x, y, z, hw, hh, hd, rotY: Math.atan2(az, ax) }); } catch { /* colliders not loaded */ } };
  if (which === 'dino') {
    const R = DINO.ring, a = R[DINO.front125], b = R[(DINO.front125 + 1) % R.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    let nx = -uz, nz = ux; if (nx * ((a[0] + b[0]) / 2 - DINO.centroid[0]) + nz * ((a[1] + b[1]) / 2 - DINO.centroid[1]) < 0) { nx = -nx; nz = -nz; }
    const t = L / 2; add(a[0] + ux * t + nx * 1.3, gy + 0.55, a[1] + uz * t + nz * 1.3, (L - 2) / 2, 0.6, 1.35, ux, uz);
  } else if (which === 'rsd') {
    const fr = F(RSD.A, RSD.dir), { st, s0, s1 } = rsdStations();
    for (const u of st) {
      const big = Math.abs(u - s0) < 0.5 || Math.abs(u - s1) < 0.5;
      for (const l of RSD.cols) { const p = fr.p(u, l + RSD.lc, 0); add(p[0], gy + 2.6, p[2], big ? 1.6 : 0.85, 2.9, big ? 1.3 : 0.85, fr.a[0], fr.a[1]); }
    }
  } else if (which === 'fence23') {
    // the 2023 hoarding and its barriers (FENCE23): one box from the barriers' west end to the fence's east end
    const Fz = FENCE23, tm = (Fz.b0 + Fz.t1) / 2, lm = 0.4;
    add(Fz.o[0] + Fz.d[0] * tm + Fz.n[0] * lm, gy + 1.2, Fz.o[1] + Fz.d[1] * tm + Fz.n[1] * lm, (Fz.t1 - Fz.b0) / 2, 1.3, 0.5, Fz.d[0], Fz.d[1]);
  } else if (which === 'mvv') {
    const fr = F(MVV.C, MVV.dir), h = MVV.span / 2;
    for (const su of [-1, 1]) for (const sl of [-1, 1]) { const p = fr.p(su * (h + 0.6), sl * MVV.rib, 0); add(p[0], gy + 1.2, p[2], 1.3, 1.3, 1.8, fr.a[0], fr.a[1]); }
  }
}

// ---------------------------------------------------------------- the 2023 construction hoarding (w125wData.js FENCE23)
// Painted plywood sheets (green, a vertical joint every 2.44 m, scuffs, a grime band at the foot, two diamond viewing
// panels), a timber cap, the taller gate run, and white concrete barriers with orange diagonal stripes standing in front
// (scuffed, chipped, dirty at the foot). Every texture is drawn here.
function plyTex() {
  const t = canvas(512, 512, (g, w, h) => {
    const r = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    g.fillStyle = '#48695a'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '20,40,30' : '90,120,100'},${0.03 + r() * 0.05})`; g.fillRect(r() * w, r() * h, 2 + r() * 30, 1 + r() * 4); }
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '210,215,200' : '30,32,30'},${0.08 + r() * 0.12})`; const x = r() * w, y = h * (0.5 + r() * 0.5); g.fillRect(x, y, 4 + r() * 40, 1 + r() * 3); }
    const gr = g.createLinearGradient(0, h * 0.82, 0, h); gr.addColorStop(0, 'rgba(40,34,26,0)'); gr.addColorStop(1, 'rgba(40,34,26,0.45)');
    g.fillStyle = gr; g.fillRect(0, h * 0.82, w, h * 0.18);
    g.fillStyle = 'rgba(18,26,20,0.85)'; g.fillRect(0, 0, 3, h);
    g.fillStyle = 'rgba(120,150,130,0.35)'; g.fillRect(3, 0, 2, h);
    for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(25,30,26,0.6)'; g.beginPath(); g.arc(12 + r() * 6, 30 + k * 90 + r() * 10, 3, 0, 7); g.fill(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function barrierTex() {
  return canvas(768, 208, (g, w, h) => {
    const r = (() => { let s = 11; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    g.fillStyle = '#d6d2c9'; g.fillRect(0, 0, w, h);
    g.save(); g.fillStyle = '#d9572a';
    for (let x = -h; x < w + h; x += 150) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 48, h); g.lineTo(x + 48 + h * 0.75, 0); g.lineTo(x + h * 0.75, 0); g.closePath(); g.fill(); }
    g.restore();
    for (let k = 0; k < 260; k++) { g.fillStyle = `rgba(${r() < 0.6 ? '120,112,100' : '235,232,225'},${0.08 + r() * 0.2})`; g.fillRect(r() * w, r() * h, 2 + r() * 14, 1 + r() * 5); }
    for (let k = 0; k < 30; k++) { g.fillStyle = 'rgba(150,146,138,0.7)'; g.beginPath(); g.ellipse(r() * w, r() * h, 3 + r() * 10, 2 + r() * 6, r() * 3, 0, 7); g.fill(); }
    const gr = g.createLinearGradient(0, h * 0.62, 0, h); gr.addColorStop(0, 'rgba(70,60,48,0)'); gr.addColorStop(1, 'rgba(70,60,48,0.6)');
    g.fillStyle = gr; g.fillRect(0, h * 0.62, w, h * 0.38);
  });
}
function diamondTex() {
  return canvas(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 4);
    g.fillStyle = '#d8d6cf'; g.fillRect(-40, -40, 80, 80);
    g.fillStyle = '#1d211f'; g.fillRect(-32, -32, 64, 64);
    g.strokeStyle = 'rgba(160,170,165,0.5)'; g.lineWidth = 1.5;
    for (let k = -32; k <= 32; k += 8) { g.beginPath(); g.moveTo(k, -32); g.lineTo(k, 32); g.stroke(); g.beginPath(); g.moveTo(-32, k); g.lineTo(32, k); g.stroke(); }
    g.restore();
  });
}
let _FM = null;
export function fenceBuild(group, yAt) {
  const Fz = FENCE23, d = Fz.d, n = Fz.n, B = new Bins();
  if (!_FM) {
    _FM = {
      ply: applyLightTrim(new THREE.MeshStandardMaterial({ map: plyTex(), roughness: 0.82, metalness: 0 })),
      bar: applyLightTrim(new THREE.MeshStandardMaterial({ map: barrierTex(), roughness: 0.88, metalness: 0 })),
      conc: applyLightTrim(new THREE.MeshStandardMaterial({ color: 0xc9c5bc, roughness: 0.9, metalness: 0 })),
      cap: applyLightTrim(new THREE.MeshStandardMaterial({ color: 0x2f4637, roughness: 0.8, metalness: 0 })),
      dia: applyLightTrim(new THREE.MeshStandardMaterial({ map: diamondTex(), roughness: 0.5, metalness: 0, transparent: false, alphaTest: 0.5 })),
    };
  }
  const M = _FM, P = (t, l) => [Fz.o[0] + d[0] * t + n[0] * l, Fz.o[1] + d[1] * t + n[1] * l];
  const nn = [n[0], n[1]];
  // the plywood in runs (the gate run taller), sheets 2.44 m; the cap and the posts behind
  const runs = [];
  let tc = Fz.t0;
  for (const [g0, g1] of Fz.gates) { if (g0 > tc) runs.push([tc, g0, Fz.h]); runs.push([g0, g1, Fz.hg]); tc = g1; }
  if (Fz.t1 > tc) runs.push([tc, Fz.t1, Fz.h]);
  for (const [ta, tb, H] of runs) {
    for (let t = ta; t < tb - 0.05; t += 2.44) {
      const t2 = Math.min(tb, t + 2.44), a = P(t, 0), b = P(t2, 0), y = yAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) - 0.05;
      B.quad(M.ply, a, b, y, H, 2.44, 0, nn);
      B.seg(M.cap, [a[0] - n[0] * 0.03, y + H + 0.03, a[1] - n[1] * 0.03], [b[0] - n[0] * 0.03, y + H + 0.03, b[1] - n[1] * 0.03], 0.09, 0.06, nn);
      const q = P(t + 0.02, -0.12); B.seg(M.cap, [q[0], y, q[1]], [q[0], y + H, q[1]], 0.09, 0.09, nn);
    }
  }
  for (const t of Fz.diamonds) { const a = P(t - 0.26, 0), b = P(t + 0.26, 0), y = yAt(a[0], a[1]); B.quad(M.dia, a, b, y + Fz.dy - 0.26, 0.52, 0, 0.006, nn); }
  // the barriers: 3.0 m units with 5 cm gaps, a 0.45 x 0.81 m body, the striped face to the street, a wider foot
  for (let t = Fz.b0; t < Fz.b1 - 0.5; t += 3.05) {
    const t2 = Math.min(Fz.b1, t + 3.0), a = P(t, 0.55), b = P(t2, 0.55), y = yAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    B.seg(M.conc, [a[0], y + 0.4, a[1]], [b[0], y + 0.4, b[1]], 0.36, 0.8, nn);
    B.seg(M.conc, [a[0], y + 0.11, a[1]], [b[0], y + 0.11, b[1]], 0.6, 0.22, nn);
    B.quad(M.bar, a, b, y + 0.22, 0.58, 0, 0.185, nn);
  }
  return B.flush(group, 'fence23');
}

// AR34 w2 s3: the granite setts band across the Twelfth Avenue plaza (SETTS in w125wData.js): one strip mesh over the
// compiled tile's terrain-only rows at the paving's height, UVs in metres for MATS's cobble set; the polygon offset keeps
// the compiled paving in front where the widened rows run under it
let _SM = null;
export function settsBuild(group) {
  const R = SETTS.rows, y = SETTS.y, pos = [], uv = [], idx = [];
  for (const [z, x0, x1] of R) { pos.push(x0, y, z, x1, y, z); uv.push(x0, -z, x1, -z); }
  for (let i = 0; i + 1 < R.length; i++) { const a = 2 * i, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  if (!_SM) {
    // (its own option set (tint, seed 7): the cached material is this strip's alone, so the offset is set on it)
    _SM = pbrMaterial('cobble_belgian', { tint: '#6c6b67', dirt: 0.3, seed: 7 });
    _SM.polygonOffset = true; _SM.polygonOffsetFactor = 1; _SM.polygonOffsetUnits = 2;
  }
  const m = new THREE.Mesh(g, _SM);
  m.name = 'w33 plaza setts'; m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false; m.updateMatrix();
  group.add(m);
  return idx.length / 3;
}
