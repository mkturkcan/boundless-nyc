// AR33 BID3 kit for the w125cb part: the State Office Building's plaza (163 W 125th St) as meshes in world coordinates.
// Owner: the BID3 worker (docs/notes/ar33-bid3.md). Data in w125cbData.js (PLAZA, STREET). The paving is a field of buff
// granite squares with a dark-grey crescent band, both on canvas textures drawn from scratch (per-paver tone, joints,
// speckle); the planters, benches, bollards, flagpoles, lamps and The Higher Ground monument are simple solids with the
// shared PBR sets (mat/pbrLib.js) projected in world metres.
import * as THREE from 'three';
import { ENV, applyLightTrim } from '../world/materials.js';
import { pbrMaterial, applyCityRefl } from './mat/pbrLib.js';
import { STREET, PLAZA } from './w125cbData.js';
import { VG37, vg37Form, vg37LeafMat } from '../world/vg37.js';
import { lodSet } from './cpFloraKit.js';
// BF36 (BIDFIX 2026-10-02, teaser 8's plaza frames): the planters' hedges read as smooth draped green mounds.
// show a loose planting over mulch, shrubs and grasses ~0.5-0.9 m over the granite walls: GROUND's VG37
// scanned-leaf plants (world/vg37.js forms: privet, spreading yew, fountain grass, liriope at the ends) on a mulch top in each lobe.
// `?bf36=0` (or `?vg37=0`) keeps the hedge masses
const BF36 = VG37 && !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('bf36') === '0');

const W = (t, b) => [STREET.o[0] + STREET.u[0] * t + STREET.n[0] * b, STREET.o[1] + STREET.u[1] * t + STREET.n[1] * b];
const hash = (a, b = 0, c = 0) => { const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return x - Math.floor(x); };
const PM = (name, o = {}) => pbrMaterial(name, { mapping: 'world', ...o });

// ---------------------------------------------------------------- the paver textures (drawn from scratch)
const PAVE = 0.9, NP = 8, REP = PAVE * NP;   // 0.9 m squares, 8 x 8 per repeat (7.2 m)
function paverTex(base, jitter, joint, seed) {
  if (typeof document === 'undefined') return null;
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), p = S / NP;
  const [r0, g0, b0] = base;
  for (let i = 0; i < NP; i++) for (let j = 0; j < NP; j++) {
    const k = 1 + (hash(i, j, seed) - 0.5) * 2 * jitter, w = (hash(j, i, seed + 3) - 0.5) * 0.03;
    g.fillStyle = `rgb(${Math.round(r0 * (k + w))},${Math.round(g0 * k)},${Math.round(b0 * (k - w))})`;
    g.fillRect(i * p, j * p, p, p);
  }
  // granite speckle and a few stains
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let q = 0; q < S * S; q++) {
    const n = hash(q % S, Math.floor(q / S), seed + 7), v = n < 0.06 ? -38 : n > 0.97 ? 22 : (n - 0.5) * 16;
    d[q * 4] += v; d[q * 4 + 1] += v; d[q * 4 + 2] += v;
  }
  g.putImageData(img, 0, 0);
  for (let s = 0; s < 14; s++) {
    const x = hash(s, 1, seed) * S, y = hash(s, 2, seed) * S, r = 20 + hash(s, 3, seed) * 70;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(40,36,30,0.10)'); gr.addColorStop(1, 'rgba(40,36,30,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // joints
  g.fillStyle = joint;
  for (let i = 0; i <= NP; i++) { g.fillRect(i * p - 2, 0, 4, S); g.fillRect(0, i * p - 2, S, 4); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
let _M = null;
function mats() {
  if (_M) return _M;
  const LT = (m) => applyLightTrim(m);
  const CR = (m) => applyCityRefl(m);
  // the monument's metals mirror a hazy grey street, not three's saturated sky: their reflected light desaturated by 65 %, and
  // halved where the reflection looks down at the plaza (b4b: the form's lower half read as bright as its top)
  const MR = (m) => {
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#if defined( RE_IndirectSpecular )
        {
          vec3 mrR = inverseTransformDirection(normalize(reflect(-geometryViewDir, geometryNormal)), viewMatrix);
          radiance = mix(vec3(dot(radiance, vec3(0.2126, 0.7152, 0.0722))), radiance, 0.35) * (1.0 - 0.6 * (1.0 - smoothstep(-0.35, 0.02, mrR.y)));
        }
        #endif
        #include <lights_fragment_end>`);
    };
    m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|b3mr';
    return m;
  };
  const lit = (m) => {   // emission only after dark
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      sh.uniforms.b3P = ENV.night;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float b3P;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= b3P;');
    };
    m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|b3plit';
    return m;
  };
  _M = {
    field: LT(new THREE.MeshStandardMaterial({ map: paverTex([162, 146, 128], 0.07, 'rgba(98,90,80,0.9)', 11), roughness: 0.82, metalness: 0 })),
    band: LT(new THREE.MeshStandardMaterial({ map: paverTex([96, 96, 98], 0.08, 'rgba(58,58,60,0.9)', 23), roughness: 0.7, metalness: 0 })),
    granite: PM('granite_grey', { tint: '#3d3e40', dirt: 0.2 }),
    hedge: LT(new THREE.MeshStandardMaterial({ color: 0x2e4d21, roughness: 0.95, metalness: 0, vertexColors: true })),
    soil: PM('mulch', { tint: '#3a2c20' }),
    steel: PM('stainless', {}),
    // The Higher Ground (AR34 batch 4): polished stainless sheets (a mirror, the city in its reflection, not the sky alone: the
    // plain metal read a dark blue cone in PROPS's acpE pair), the drum's polished black granite with gold capitals, the plaque,
    // the patinated bronze (vertex colours carry the patina)
    monSteel: MR(CR(LT(new THREE.MeshStandardMaterial({ color: 0xffffff, map: monTex('sheet'), roughnessMap: monTex('sheetR'), roughness: 1.0, metalness: 0.76 })))),
    monDrum: CR(LT(new THREE.MeshStandardMaterial({ color: 0xffffff, map: monTex('drum'), roughnessMap: monTex('drumR'), metalnessMap: monTex('drumR'), roughness: 1.0, metalness: 1.0 }))),
    monTop: CR(LT(new THREE.MeshStandardMaterial({ color: 0x0e0f11, roughness: 0.1, metalness: 0.0 }))),
    monPlaque: CR(LT(new THREE.MeshStandardMaterial({ color: 0xffffff, map: monTex('plaque'), roughness: 0.28, metalness: 0.0 }))),
    bronze: MR(CR(LT(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0.5 })))),
    gold: LT(new THREE.MeshStandardMaterial({ color: 0xc9a44a, roughness: 0.3, metalness: 0.9 })),
    bollard: PM('metal_painted', { tint: '#7d8083', dirt: 0.25 }),
    pole: PM('steel_galvanized', {}),
    black: PM('steel_black', {}),
    slat: PM('metal_painted', { tint: '#5d6164', dirt: 0.15 }),
    lamp: lit(LT(new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.4, metalness: 0, emissive: 0xffdca8, emissiveIntensity: 1.6 }))),
    flagUS: LT(new THREE.MeshStandardMaterial({ map: flagTex('us'), roughness: 0.85, side: THREE.DoubleSide })),
    flagNY: LT(new THREE.MeshStandardMaterial({ map: flagTex('ny'), roughness: 0.85, side: THREE.DoubleSide })),
  };
  return _M;
}
// the two flags, drawn from scratch: the Stars and Stripes, and New York State's (the arms as a simplified gold shield
// on the blue field)
function flagTex(kind) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 380; c.height = 200;
  const g = c.getContext('2d');
  if (kind === 'us') {
    for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#f4f4f0' : '#b22234'; g.fillRect(0, (i * 200) / 13, 380, 200 / 13 + 1); }
    g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, 152, (7 * 200) / 13);
    g.fillStyle = '#f4f4f0';
    for (let r = 0; r < 9; r++) for (let q = 0; q < (r % 2 ? 5 : 6); q++) { g.beginPath(); g.arc(12.6 + q * 25.3 + (r % 2 ? 12.6 : 0), 10 + r * 10.8, 2.6, 0, Math.PI * 2); g.fill(); }
  } else {
    g.fillStyle = '#1c2f6e'; g.fillRect(0, 0, 380, 200);
    g.fillStyle = '#c9a44a'; g.beginPath(); g.ellipse(190, 100, 42, 52, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7fa8d8'; g.beginPath(); g.ellipse(190, 100, 32, 42, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8e2d0'; g.fillRect(130, 90, 20, 70); g.fillRect(230, 90, 20, 70);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// The Higher Ground's textures, drawn from scratch: 'sheet' / 'sheetR' the stainless skin, 'drum' / 'drumR'
// the drum's side (polished black granite, ADAM CLAYTON POWELL JR. and a star in gilt capitals twice round its 21.9 m; 'drumR'
// carries roughness in G and metalness in B for the gilding), 'plaque' the oval plaque's inscription (white on black granite)
const _MT = {};
function monTex(kind) {
  if (typeof document === 'undefined') return null;
  if (_MT[kind]) return _MT[kind];
  const c = document.createElement('canvas'), g = c.getContext('2d');
  let srgb = true;
  if (kind === 'sheet' || kind === 'sheetR') {
    srgb = kind === 'sheet';
    c.width = 1024; c.height = 512;
    const rowH = 64, jw = 256;   // 0.15 m rows, 0.6 m sheets
    for (let r = 0; r < 8; r++) for (let s = -1; s < 5; s++) {
      const x0 = s * jw + (r % 2 ? jw / 2 : 0), k = hash(r, s, 41);
      if (srgb) { const v = Math.round(222 + (k - 0.5) * 2); g.fillStyle = `rgb(${v},${v + 2},${v + 3})`; }
      else { const v = Math.round(255 * (0.12 + k * 0.05)); g.fillStyle = `rgb(0,${v},0)`; }
      g.fillRect(x0, r * rowH, jw, rowH);
    }
    // the polish grain: faint horizontal streaks
    for (let i = 0; i < 700; i++) {
      const y = hash(i, 3, 43) * 512, x = hash(i, 4, 43) * 1024, w = 30 + hash(i, 5, 43) * 220, a = 0.02 + hash(i, 6, 43) * 0.04;
      g.fillStyle = srgb ? `rgba(${hash(i, 7, 43) < 0.5 ? '255,255,255' : '120,122,126'},${a})` : `rgba(0,${hash(i, 7, 43) < 0.5 ? 50 : 110},0,${a})`;
      g.fillRect(x, y, w, 1);
    }
    // the seams: hairlines
    g.fillStyle = srgb ? 'rgba(112,114,116,0.24)' : 'rgb(0,100,0)';
    for (let r = 0; r <= 8; r++) g.fillRect(0, r * rowH - 1, 1024, 2);
    for (let r = 0; r < 8; r++) for (let s = -1; s < 6; s++) g.fillRect(s * jw + (r % 2 ? jw / 2 : 0) - 1, r * rowH, 2, rowH);
  } else if (kind === 'drum' || kind === 'drumR') {
    srgb = kind === 'drum';
    c.width = 4096; c.height = 96;   // 21.9 m x 0.45 m
    g.fillStyle = srgb ? '#111214' : 'rgb(0,36,0)'; g.fillRect(0, 0, 4096, 96);
    if (srgb) for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${hash(i, 1, 51) < 0.5 ? '120,120,124' : '0,0,0'},${0.05 + hash(i, 2, 51) * 0.1})`; g.fillRect(hash(i, 3, 51) * 4096, hash(i, 4, 51) * 96, 2, 2); }
    const pxm = 4096 / 21.9, word = 'ADAM CLAYTON POWELL JR.';
    g.textBaseline = 'middle';
    for (const u0 of [0.012, 0.512]) {
      let x = u0 * 4096;
      for (const ch of word + ' ★') {
        if (ch !== ' ') {
          g.save(); g.translate(x, 50); g.scale(1.15, 1.18);
          g.font = `700 ${ch === '★' ? 40 : 50}px "Times New Roman", Georgia, serif`;
          if (srgb) {
            const gr = g.createLinearGradient(0, -20, 0, 20); gr.addColorStop(0, '#e8c978'); gr.addColorStop(1, '#a8823a');
            g.fillStyle = gr;
          } else g.fillStyle = 'rgb(0,90,255)';
          g.fillText(ch, 0, 0); g.restore();
        }
        x += pxm * 0.46;
      }
    }
  } else if (kind === 'plaque') {
    c.width = 1024; c.height = 384;
    g.fillStyle = '#131416'; g.fillRect(0, 0, 1024, 384);
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(${hash(i, 1, 53) < 0.5 ? '140,140,146' : '0,0,0'},${0.04 + hash(i, 2, 53) * 0.08})`; g.fillRect(hash(i, 3, 53) * 1024, hash(i, 4, 53) * 384, 2, 2); }
    g.fillStyle = '#e9e6dc'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 30px "Times New Roman", Georgia, serif';
    ['PRESS FORWARD AT ALL TIMES,', 'CLIMBING TOWARD THAT HIGHER GROUND', 'OF THE HARMONIOUS SOCIETY', 'THAT SHAPES THE LAWS OF MAN', 'TO THE LAWS OF GOD.']
      .forEach((l, i) => g.fillText(l, 512, 112 + i * 38));
    g.font = 'italic 20px "Times New Roman", Georgia, serif'; g.fillText('ADAM CLAYTON POWELL JR.', 700, 312);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return (_MT[kind] = t);
}

// ---------------------------------------------------------------- geometry helpers
// a flat mesh from (t, b) triangles at height y, UVs along t and b in paver repeats
function flatGeo(tris, y) {
  const pos = [], uv = [], nor = [];
  for (const [t, b] of tris) { const [x, z] = W(t, b); pos.push(x, y, z); uv.push(t / REP, -b / REP); nor.push(0, 1, 0); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // face up: x east, z south; (q - p) x (r - p) must have +y
  const P = g.getAttribute('position');
  for (let i = 0; i < P.count; i += 3) {
    const ax = P.getX(i), az = P.getZ(i), bx = P.getX(i + 1), bz = P.getZ(i + 1), cx = P.getX(i + 2), cz = P.getZ(i + 2);
    const up = (bz - az) * (cx - ax) - (bx - ax) * (cz - az) > 0;
    if (!up) {
      for (const [A, k] of [[P, 3], [g.getAttribute('uv'), 2]]) for (let e = 0; e < k; e++) { const v1 = A.array[(i + 1) * k + e]; A.array[(i + 1) * k + e] = A.array[(i + 2) * k + e]; A.array[(i + 2) * k + e] = v1; }
    }
  }
  return g;
}
const rectTris = ([t0, t1, b0, b1]) => [[t0, b0], [t1, b0], [t1, b1], [t0, b0], [t1, b1], [t0, b1]];
// a Catmull-Rom resample of a polyline of (t, b) points
function spline(pts, n) {
  const out = [];
  for (let s = 0; s < n; s++) {
    const f = (s / (n - 1)) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), u = f - i;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
    out.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
  }
  return out;
}
// place a geometry built in a local frame (x along t, z along b, y up) at (t, b, y), turned by a (radians about y)
const rotY = Math.atan2(STREET.u[1], STREET.u[0]);   // the angle of +t from world +x (clockwise seen from above in x/z)
function placed(geo, t, b, y, a = 0) {
  const [x, z] = W(t, b);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -rotY - a), new THREE.Vector3(1, 1, 1));
  return geo.applyMatrix4(m);
}
function mergeGeos(list) {
  const pos = [], nor = [], uv = [], col = [];
  const hasCol = list.length && list.every((g0) => g0.getAttribute('color'));
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...g.getAttribute('position').array); nor.push(...g.getAttribute('normal').array);
    const u = g.getAttribute('uv'); if (u) uv.push(...u.array); else for (let i = 0; i < g.getAttribute('position').count; i++) uv.push(0, 0);
    if (hasCol) col.push(...g.getAttribute('color').array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (hasCol) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
// an elliptical planter lobe: a dark granite wall ring (0.3 m thick, h high), lengths along t (a) and b (c); returns [wall ring, a
// clipped boxwood hedge: a polar-grid mass 0.42 m over the wall with a rounded shoulder, its top lumpy with noise and its vertex
// colours leafy]
function hedgeMass(a, c, y0, hh, k, sq = 2) {
  const NR = 8, NA = 40, pos = [], col = [], idx = [];
  const se = (v) => Math.sign(v) * Math.pow(Math.abs(v), 2 / sq);   // sq > 2: a superellipse (the clipped hedge of a straight-walled box)
  pos.push(0, y0 + hh, 0); col.push(1, 1, 1);
  for (let i = 1; i <= NR; i++) {
    const r = i / NR;
    for (let j = 0; j < NA; j++) {
      const th = (j / NA) * Math.PI * 2, x = se(Math.cos(th)) * a * r, z = se(Math.sin(th)) * c * r;
      const prof = sq > 2 ? Math.pow(Math.max(0, 1 - Math.pow(r, 14)), 0.35) : Math.pow(Math.max(0, 1 - Math.pow(r, 6)), 0.5);
      const n = ((hash(x * 7.3, z * 7.3, k) - 0.5) * 0.07 + (hash(x * 2.3, z * 2.3, k + 5) - 0.5) * 0.1) * Math.min(1, prof * 3) * (sq > 2 ? 0.45 : 1);
      pos.push(x, y0 + hh * prof + n, z);
      const v = 0.62 + 0.7 * hash(x * 13.0, z * 13.0, k + 9) * (0.6 + 0.4 * prof);
      col.push(v, v, v * 0.92);
    }
  }
  for (let j = 0; j < NA; j++) idx.push(0, 1 + j, 1 + ((j + 1) % NA));
  for (let i = 1; i < NR; i++) for (let j = 0; j < NA; j++) {
    const a0 = 1 + (i - 1) * NA + j, a1 = 1 + (i - 1) * NA + ((j + 1) % NA), b0 = 1 + i * NA + j, b1 = 1 + i * NA + ((j + 1) % NA);
    idx.push(a0, b0, b1, a0, b1, a1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // the top must face up: flip the winding where the first triangle faces down
  const nA = g.getAttribute('normal'); if (nA.getY(0) < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}
// (AR34 wave 2) the lobes are straight-walled: (2024-08) show flat granite walls meeting at corners and a
// at 0.35 of the half-width) round a superellipse hedge
function lobe(a, c, h, k = 0) {
  const oct = (sh, A, C) => { const ch = Math.min(0.45, C * 0.35); const P = [[-A + ch, -C], [A - ch, -C], [A, -C + ch], [A, C - ch], [A - ch, C], [-A + ch, C], [-A, C - ch], [-A, -C + ch]]; sh.moveTo(P[0][0], P[0][1]); for (let i = 1; i < 8; i++) sh.lineTo(P[i][0], P[i][1]); sh.closePath(); };
  const wall = new THREE.Shape(); oct(wall, a, c);
  const hole = new THREE.Path(); oct(hole, a - 0.3, c - 0.3); wall.holes.push(hole);
  const gw = new THREE.ExtrudeGeometry(wall, { depth: h, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 4 });
  gw.rotateX(-Math.PI / 2);
  return [gw, null, [hedgeMass(a - 0.3, c - 0.3, h - 0.12, 0.5, k, 8)]];
}

// (BF36) one lobe's planting: the mulch top (the inner octagon, 0.1 m under the wall's top) and the plants in two staggered rows along
// the lobe's long axis, liriope tufts at its ends; `out` gets [form, instance] pairs in world metres
function octPts(A, C) { const ch = Math.min(0.45, C * 0.35); return [[-A + ch, -C], [A - ch, -C], [A, -C + ch], [A, C - ch], [A - ch, C], [-A + ch, C], [-A, C - ch], [-A, -C + ch]]; }
function lobePlanting(A, C, tc, bc, y0, h, a, seed, soil, out) {
  const sh = new THREE.Shape(); octPts(A, C).forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y))); sh.closePath();
  const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2);
  const ys = y0 + h - 0.1;
  soil.push(placed(g, tc, bc, ys, a));
  const [x, z] = W(tc, bc);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -rotY - a), new THREE.Vector3(1, 1, 1));
  const v = new THREE.Vector3(), long = A >= C, LA = long ? A : C, LC = long ? C : A;
  const put = (s0, o0, form, S, k) => {
    const h1 = hash(s0 * 1.7 + seed, o0 * 2.3, k), h2 = hash(o0 * 3.1 + k, s0 * 0.9, seed + 7);
    v.set(long ? s0 : o0, 0, long ? o0 : s0).applyMatrix4(m);
    out.push([form, { x: v.x, y: ys - 0.04, z: v.z, yaw: h2 * 6.2832, sx: S * (0.92 + 0.16 * h1), sy: S * (0.85 + 0.3 * h2), c: [0.86 + 0.18 * h2, 0.9 + 0.14 * h1, 0.84 + 0.12 * h2] }]);
  };
  let k = 0;
  for (let s0 = -LA + 0.55; s0 <= LA - 0.55 + 1e-6; s0 += 0.6, k++) {
    for (const r of [-1, 1]) {
      const hh = hash(tc + s0 * 1.3, bc + r * 0.7, seed + k), jit = (hash(s0, r, seed + 3) - 0.5) * 0.18;
      const o0 = r * LC * 0.45 + (hh - 0.5) * 0.12, s1 = s0 + (r > 0 ? 0.3 : 0) + jit;
      if (Math.abs(s1) > LA - 0.4) continue;
      const form = hh < 0.4 ? 'privet' : hh < 0.72 ? 'fountain' : 'yew';
      put(s1, o0, form, form === 'privet' ? 0.44 : form === 'fountain' ? 0.74 : 0.5, k * 2 + (r > 0));
    }
  }
  for (const e of [-1, 1]) for (const r of [-0.4, 0.4]) put(e * (LA - 0.32), r * LC, 'liriope', 1.0, 90 + e + r);
}

// ---------------------------------------------------------------- The Higher Ground (AR34 batch 4)
// Rebuilt (the measures and their sources: w125cbData.js PLAZA.monument, docs/notes/ar33-bid3.md). Everything
// is built in the drum's frame (x along the long axis toward its east-north-east end, y up from the plaza, z toward the street)
// and placed by one matrix. Returns [geometry, material] pairs in world coordinates.
const MON_N = 2.4;   // the stainless form's plan sections are superellipses: its ends rounded, not knife edges
// a tapered capsule from a to b (radius r0 at a, r1 at b), its sections squashed to `flat` across the bone (the bone's own x)
function bone(a, b, r0, r1, flat = 1, seg = 14) {
  const A = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(A), L = d.length(), prof = [];
  for (let k = 0; k <= 4; k++) { const t = (k / 4) * Math.PI / 2; prof.push(new THREE.Vector2(Math.max(1e-4, r0 * Math.sin(t)), -r0 * Math.cos(t))); }
  for (let k = 1; k < 4; k++) prof.push(new THREE.Vector2(r0 + (r1 - r0) * (k / 4), (L * k) / 4));
  for (let k = 0; k <= 4; k++) { const t = (k / 4) * Math.PI / 2; prof.push(new THREE.Vector2(Math.max(1e-4, r1 * Math.cos(t)), L + r1 * Math.sin(t))); }
  const g = new THREE.LatheGeometry(prof, seg);
  g.scale(flat, 1, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate(A.x, A.y, A.z);
}
// an ellipsoid (radii r) turned by rot (x, y, z radians, in that order) at c
function blob(c, r, rot = [0, 0, 0], seg = 16) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
  g.scale(r[0], r[1], r[2]); g.rotateX(rot[0]); g.rotateY(rot[1]); g.rotateZ(rot[2]);
  return g.translate(c[0], c[1], c[2]);
}
// a grid surface P(u, v) (u 0..1 over nu, v 0..1 over nv) as a closed shell th(u, v) thick: both faces and the rim
function shell(P, nu, nv, thF) {
  const pt = [], nr = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) pt.push(new THREE.Vector3(...P(i / nu, j / nv)));
  const at = (i, j) => pt[Math.min(nv, Math.max(0, j)) * (nu + 1) + Math.min(nu, Math.max(0, i))];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const du = at(i + 1, j).clone().sub(at(i - 1, j)), dv = at(i, j + 1).clone().sub(at(i, j - 1));
    nr.push(du.cross(dv).normalize());
  }
  // both faces carry the grid's smooth normal (b4b: flat normals drew the coat as a quilt of facets)
  const pos = [], nor = [], N = (i, j) => nr[j * (nu + 1) + i];
  const off = (i, j, s) => at(i, j).clone().addScaledVector(N(i, j), (s * thF(i / nu, j / nv)) / 2);
  const q = (v, n) => { pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); };
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = [i, j], b = [i + 1, j], c = [i + 1, j + 1], d = [i, j + 1];
    for (const v of [a, b, c, a, c, d]) q(off(v[0], v[1], 1), N(v[0], v[1]));
    for (const v of [a, c, b, a, d, c]) q(off(v[0], v[1], -1), N(v[0], v[1]).clone().negate());
  }
  const rim = [];
  for (let i = 0; i < nu; i++) rim.push([[i, 0], [i + 1, 0]], [[i + 1, nv], [i, nv]]);
  for (let j = 0; j < nv; j++) rim.push([[nu, j], [nu, j + 1]], [[0, j + 1], [0, j]]);
  for (const [[i0, j0], [i1, j1]] of rim) {
    const A = off(i0, j0, 1), B = off(i1, j1, 1), C = off(i1, j1, -1), D = off(i0, j0, -1);
    const n = C.clone().sub(A).cross(B.clone().sub(A)).normalize(), m = n.clone().negate();
    for (const v of [A, C, B, A, D, C]) q(v, n);
    for (const v of [A, B, C, A, C, D]) q(v, m);   // both windings: the rim faces out whichever way the grid turns
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
// the bronze: Adam Clayton Powell Jr. in a suit striding up the slope, his body leaning ~35 deg into it with the head up, his
// left arm swinging forward with a loose fist, his overcoat streaming back in the wind on his left side. Figure frame: x forward, y up, z to his right, the origin at
// the front sole's contact; the slope rises 0.46 m per metre forward. The legs were solved for thigh 0.62 / shin 0.60 between
// the planted front ankle and the back foot on its ball.
function figureGeo() {
  const hipL = [-0.538, 0.866, -0.11], hipR = [-0.538, 0.866, 0.11], kneeL = [0.064, 0.72, -0.1], ankL = [0.05, 0.12, -0.085];
  const kneeR = [-0.602, 0.249, 0.1], ankR = [-0.95, -0.24, 0.085];
  const pelvis = [-0.538, 0.926, 0], chest = [-0.194, 1.417, 0], neck = [-0.15, 1.54, 0], head = [-0.155, 1.672, 0];
  const shL = [-0.224, 1.367, -0.27], shR = [-0.224, 1.367, 0.27], elL = [-0.081, 1.059, -0.29], wrL = [0.165, 0.888, -0.275];
  const elR = [-0.326, 1.043, 0.287], wrR = [-0.371, 0.746, 0.287];
  const lean = Math.atan2(chest[0] - pelvis[0], chest[1] - pelvis[1]), g = [];
  // trousers and shoes
  g.push(bone(hipL, kneeL, 0.122, 0.088), bone(kneeL, ankL, 0.086, 0.084), bone(hipR, kneeR, 0.122, 0.088), bone(kneeR, ankR, 0.086, 0.084));
  g.push(blob([0.1, 0.075, -0.085], [0.18, 0.062, 0.066], [0, 0, 0.43]), blob([-0.87, -0.33, 0.085], [0.17, 0.06, 0.064], [0, 0, -0.5]));
  // the jacket: the body leaning into the climb, its skirt over the hips, the shoulders, the collar and lapels' mass
  g.push(bone(pelvis, chest, 0.19, 0.235, 0.72));
  g.push(bone([pelvis[0] - 0.08, pelvis[1] - 0.24, 0], [pelvis[0] + 0.04, pelvis[1] + 0.1, 0], 0.205, 0.19, 0.74));
  g.push(blob([chest[0] - 0.03, chest[1] - 0.06, 0], [0.14, 0.1, 0.285], [0, 0, -lean]));
  g.push(bone(chest, neck, 0.085, 0.072), blob([neck[0] - 0.01, neck[1] - 0.04, 0], [0.1, 0.05, 0.12], [0, 0, -lean]));
  g.push(blob(head, [0.108, 0.14, 0.1], [0, 0, 0.12]), blob([head[0] - 0.04, head[1] + 0.035, 0], [0.095, 0.1, 0.098], [0, 0, -0.05]));
  g.push(blob([head[0] - 0.01, head[1] - 0.01, -0.112], [0.025, 0.04, 0.012]), blob([head[0] - 0.01, head[1] - 0.01, 0.112], [0.025, 0.04, 0.012]));
  g.push(blob([head[0] + 0.055, head[1] - 0.075, 0], [0.075, 0.065, 0.08]), blob([head[0] + 0.115, head[1] - 0.005, 0], [0.028, 0.038, 0.022]));
  // the arms (jacket sleeves) and hands
  g.push(bone(shL, elL, 0.085, 0.075), bone(elL, wrL, 0.074, 0.06), blob([wrL[0] + 0.05, wrL[1] - 0.045, wrL[2]], [0.06, 0.072, 0.05], [0, 0, -0.6]));
  g.push(bone(shR, elR, 0.085, 0.075), bone(elR, wrR, 0.074, 0.06), blob([wrR[0] - 0.01, wrR[1] - 0.06, wrR[2]], [0.055, 0.07, 0.05]));
  // the overcoat: over the LEFT shoulder, streaming back in
  // the wind, filled out like a sail (thickest in its middle), its lower part billowing down toward the back knee
  const CT = [-0.39, 1.22, -0.2], CB = [-0.36, 0.52, -0.32];
  g.push(shell((u, v) => {
    // folds along the wind, the free end curling over (b4f: the coat read as a flat flag)
    const L = 0.85 + 0.25 * v, fold = 0.05 * Math.sin(v * Math.PI * 5 + u * 2.2) * Math.min(1, u * 3) + 0.12 * Math.max(0, u - 0.7) ** 2 / 0.09 * Math.sin(Math.PI * v);
    return [CT[0] + (CB[0] - CT[0]) * v - L * u,
      CT[1] + (CB[1] - CT[1]) * v + u * (0.05 - 0.2 * v) - 0.14 * u * u * v + 0.04 * Math.sin(7 * u + 2 * v) * u + fold * 0.5,
      CT[2] + (CB[2] - CT[2]) * v - 0.08 * u - 0.12 * Math.sin(Math.PI * u) * (0.6 - v) - 0.08 * Math.sin(5.5 * u + 2.6 * v + 0.7) * u - fold];
  }, 22, 16, (u, v) => 0.05 + 0.16 * Math.sin(Math.PI * Math.min(1, u * 1.15)) * Math.sin(Math.PI * v)));
  const fig = mergeGeos(g);
  // the patina: a warm brown bronze, lighter where the rain and the sun reach, darker and greener in the hollows and undersides
  const p = fig.getAttribute('position'), n = fig.getAttribute('normal'), col = [];
  for (let i = 0; i < p.count; i++) {
    const up = Math.max(0, n.getY(i)), dn = Math.max(0, -n.getY(i)), k = hash(p.getX(i) * 9.1, p.getY(i) * 9.1, p.getZ(i) * 9.1);
    const f = 0.92 + 0.3 * up - 0.22 * dn + (k - 0.5) * 0.16, gr = 0.45 * dn + 0.15 * (k > 0.8 ? 1 : 0);
    col.push((0.21 * (1 - gr) + 0.15 * gr) * f, (0.185 * (1 - gr) + 0.17 * gr) * f, (0.14 * (1 - gr) + 0.135 * gr) * f);
  }
  fig.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return fig;
}
function monument(Mo, y0, M) {
  const [A, B, H] = Mo.drum, F = Mo.form, out = [];
  const a = Mo.az * Math.PI / 180, [cx, cz] = W(Mo.t, Mo.b);
  const frame = new THREE.Matrix4().makeBasis(new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)), new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a), 0, Math.sin(a))).setPosition(cx, y0, cz);
  const put = (geo, mat) => { geo.applyMatrix4(frame); geo.computeBoundingSphere(); out.push([geo, mat]); };
  // the drum: an elliptical granite wall with gilt capitals round it (u along the street side first, from the west end), a 3 cm
  // bevel and the polished top
  {
    const N = 160, pos = [], nor = [], uv = [], idx = [], ring = [];
    let acc = 0;
    for (let k = 0; k <= N; k++) {
      const t = Math.PI - (2 * Math.PI * k) / N, x = A * Math.cos(t), z = B * Math.sin(t);
      if (k) acc += Math.hypot(x - ring[k - 1][0], z - ring[k - 1][1]);
      let nx = Math.cos(t) / A, nz = Math.sin(t) / B; const l = Math.hypot(nx, nz); nx /= l; nz /= l;
      ring.push([x, z, nx, nz, acc]);
    }
    const bev = 0.03;
    for (const [x, z, nx, nz, s] of ring) for (const y of [0, H - bev]) { pos.push(x, y, z); nor.push(nx, 0, nz); uv.push(s / acc, y / H); }
    for (let k = 0; k < N; k++) { const i = 2 * k, j = 2 * (k + 1); idx.push(i, j, j + 1, i, j + 1, i + 1); }
    const side = new THREE.BufferGeometry();
    side.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); side.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    side.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); side.setIndex(idx);
    put(side, M.monDrum);
    // the bevel and the top (wound to face up and out: the ring runs west - south - east - north)
    const tp = [], tn = [], s2 = Math.SQRT1_2;
    for (let k = 0; k < N; k++) {
      const [x0, z0, nx0, nz0] = ring[k], [x1, z1, nx1, nz1] = ring[k + 1];
      const i0 = [x0 - nx0 * bev, H, z0 - nz0 * bev], i1 = [x1 - nx1 * bev, H, z1 - nz1 * bev];
      const o0 = [x0, H - bev, z0], o1 = [x1, H - bev, z1];
      for (const [v, nx, nz] of [[o0, nx0, nz0], [o1, nx1, nz1], [i1, nx1, nz1], [o0, nx0, nz0], [i1, nx1, nz1], [i0, nx0, nz0]]) { tp.push(...v); tn.push(nx * s2, s2, nz * s2); }
      for (const v of [[0, H, 0], i0, i1]) { tp.push(...v); tn.push(0, 1, 0); }
    }
    const top = new THREE.BufferGeometry();
    top.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3)); top.setAttribute('normal', new THREE.Float32BufferAttribute(tn, 3));
    top.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((tp.length / 3) * 2).fill(0), 2));
    put(top, M.monTop);
  }
  // the stainless form: plan sections are superellipses of half-length a(h) (the east end plumb, the west edge leaning in by
  // `lean` per metre) and half-width c(h) (narrowing by cSlope per metre), cut by the plane through the peak and the east end's top
  const n = MON_N, [a0, c0] = F.half, kW = F.lean, [xp, hp] = F.peak, sl = (hp - F.east) / (a0 - xp), [fx, fz] = F.at;
  const cH = (h) => Math.max(0.03, c0 - F.cSlope * h + (F.cCurve || 0) * h * h);
  const X = (ce, h) => a0 * ce + ((kW * h) / 2) * (1 - ce);
  const Ht = (ce) => (hp - sl * (a0 * ce - xp)) / (1 + (sl * kW * (1 - ce)) / 2);
  const pw = (v) => Math.sign(v) * Math.pow(Math.abs(v), 2 / n);
  {
    const NI = 112, NJ = 26, pos = [], uv = [], idx = [], cols = [];
    let acc = 0;
    for (let i = 0; i <= NI; i++) {   // from the north side's middle round by the east end, the street side, the west end
      const t = -Math.PI / 2 + (2 * Math.PI * i) / NI, ce = pw(Math.cos(t)), se = pw(Math.sin(t)), p = [X(ce, 0), c0 * se];
      if (i) acc += Math.hypot(p[0] - cols[i - 1].p[0], p[1] - cols[i - 1].p[1]);
      cols.push({ ce, se, Hc: Ht(ce), p, s: acc });
    }
    for (const { ce, se, Hc, s } of cols) for (let j = 0; j <= NJ; j++) {
      const h = (Hc * j) / NJ;
      pos.push(fx + X(ce, h), H + h, fz + cH(h) * se); uv.push(s / 2.4, h / 1.2);
    }
    for (let i = 0; i < NI; i++) for (let j = 0; j < NJ; j++) {
      const p0 = i * (NJ + 1) + j, p1 = (i + 1) * (NJ + 1) + j;
      idx.push(p0, p1 + 1, p1, p0, p0 + 1, p1 + 1);
    }
    const side = new THREE.BufferGeometry();
    side.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); side.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    side.setIndex(idx); side.computeVertexNormals();
    const nA = side.getAttribute('normal');   // the seam column: one normal for both copies
    for (let j = 0; j <= NJ; j++) {
      const a1 = j, b1 = NI * (NJ + 1) + j, v = new THREE.Vector3().fromBufferAttribute(nA, a1).add(new THREE.Vector3().fromBufferAttribute(nA, b1)).normalize();
      nA.setXYZ(a1, v.x, v.y, v.z); nA.setXYZ(b1, v.x, v.y, v.z);
    }
    put(side, M.monSteel);
    // the slanted top: a fan round the rim's centroid (the rim turns clockwise seen from above: wound back), its plane's normal
    const rim = cols.slice(0, NI).map(({ ce, se, Hc }) => [fx + X(ce, Hc), H + Hc, fz + cH(Hc) * se]);
    const c = rim.reduce((s, v) => [s[0] + v[0] / NI, s[1] + v[1] / NI, s[2] + v[2] / NI], [0, 0, 0]);
    const tn = new THREE.Vector3(sl, 1, 0).normalize(), tp = [], tnr = [], tuv = [];
    for (let i = 0; i < NI; i++) for (const v of [c, rim[(i + 1) % NI], rim[i]]) { tp.push(...v); tnr.push(tn.x, tn.y, tn.z); tuv.push(v[0] / 2.4, v[2] / 1.2); }
    const top = new THREE.BufferGeometry();
    top.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3)); top.setAttribute('normal', new THREE.Float32BufferAttribute(tnr, 3));
    top.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2));
    put(top, M.monSteel);
  }
  // the plaque: an oval of black granite following the street face 12 mm proud of it
  {
    const [px, ph, pwid, phh] = Mo.plaque, NR = 6, NA = 56, pos = [], uv = [], idx = [];
    const zS = (x, h) => { const ce = Math.min(1, Math.abs((x - (kW * h) / 2) / (a0 - (kW * h) / 2))); return cH(h) * Math.pow(Math.max(0, 1 - Math.pow(ce, n)), 1 / n); };
    for (let k = 0; k <= NR; k++) for (let j = 0; j < (k ? NA : 1); j++) {
      const r = k / NR, f = (2 * Math.PI * j) / NA, x = px + (pwid / 2) * r * Math.cos(f), h = ph + (phh / 2) * r * Math.sin(f);
      pos.push(fx + x, H + h, fz + zS(x, h) + 0.012); uv.push((x - px) / pwid + 0.5, (h - ph) / phh + 0.5);
    }
    const at = (k, j) => (k ? 1 + (k - 1) * NA + (((j % NA) + NA) % NA) : 0);
    for (let j = 0; j < NA; j++) idx.push(0, at(1, j), at(1, j + 1));
    for (let k = 1; k < NR; k++) for (let j = 0; j < NA; j++) idx.push(at(k, j), at(k + 1, j), at(k + 1, j + 1), at(k, j), at(k + 1, j + 1), at(k, j + 1));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    put(g, M.monPlaque);
  }
  // the figure: its front toe just short of the peak, on the form's centre line, turned to walk toward the west end (-x)
  {
    const S = Mo.fig, x0 = xp + 0.3 * S + 0.12, gy = hp - sl * (x0 - xp);
    const fig = figureGeo();
    fig.scale(S, S, S); fig.rotateY(Math.PI); fig.translate(fx + x0, H + gy, fz);
    put(fig, M.bronze);
  }
  return out;
}

// ---------------------------------------------------------------- the plaza
// y0: the plaza's level (the sidewalk section at its front). Returns meshes in world coordinates.
export function plazaMeshes(y0) {
  const M = mats(), P = PLAZA, out = [];
  const mesh = (geo, mat, shadow = false) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; out.push(m); return m; };
  // the paving: the light field, the crescent band over it
  mesh(flatGeo(P.field.flatMap(rectTris), y0 + 0.012), M.field);
  {
    const n = 90, A = spline(P.crescentOuter, n), B = spline(P.crescentInner, n), tris = [];
    for (let i = 0; i + 1 < n; i++) tris.push(A[i], A[i + 1], B[i + 1], A[i], B[i + 1], B[i]);
    mesh(flatGeo(tris, y0 + 0.02), M.band);
  }
  // the serpentine planters (lobes alternating either side of the chain's line) and the one along the boulevard
  const walls = [], hedges = [], beds = [], plants = [], plantSets = [];
  let lk = 0;
  for (const [t0, t1, b] of P.planters) {
    const k = Math.max(2, Math.round((t1 - t0) / 4.6)), L = (t1 - t0) / k;
    for (let i = 0; i < k; i++) {
      const [gw, gb, balls] = lobe(L * 0.62, 1.05, 0.62, lk++);
      const tc = t0 + (i + 0.5) * L, bc = b + (i % 2 ? 0.45 : -0.45), a = (i % 2 ? 1 : -1) * 0.22;
      walls.push(placed(gw, tc, bc, y0, a)); if (gb) beds.push(placed(gb, tc, bc, y0, a));
      if (BF36) lobePlanting(L * 0.62 - 0.3, 0.75, tc, bc, y0, 0.62, a, lk, beds, plants);
      else for (const g of balls) hedges.push(placed(g, tc, bc, y0, a));
    }
  }
  {
    const [t, b0, b1] = P.westPlanter, k = 3, L = (b1 - b0) / k;
    for (let i = 0; i < k; i++) {
      const [gw, gb, balls] = lobe(1.05, L * 0.62, 0.62, lk++);
      const bc = b0 + (i + 0.5) * L, tc = t + (i % 2 ? 0.45 : -0.45), a = (i % 2 ? 1 : -1) * 0.22;
      walls.push(placed(gw, tc, bc, y0, a)); if (gb) beds.push(placed(gb, tc, bc, y0, a));
      if (BF36) lobePlanting(0.75, L * 0.62 - 0.3, tc, bc, y0, 0.62, a, lk, beds, plants);
      else for (const g of balls) hedges.push(placed(g, tc, bc, y0, a));
    }
  }
  if (beds.length) mesh(mergeGeos(beds), M.soil);
  mesh(mergeGeos(walls), M.granite, true);
  if (hedges.length) mesh(mergeGeos(hedges), M.hedge, true);
  if (plants.length) {
    const by = new Map();
    for (const [f, t] of plants) { let l = by.get(f); if (!l) by.set(f, (l = [])); l.push(t); }
    const leaf = vg37LeafMat();
    for (const [f, L] of by) {
      const F = vg37Form(f);
      plantSets.push(lodSet('bf36:plaza:' + f, L, [{ near: F.lod0, mid: F.lod1, mat: leaf, cast: false, castMid: false }], f === 'liriope' ? 45 : 70, 300));
    }
    if (typeof window !== 'undefined') window.__BF36 = { ...(window.__BF36 || {}), plazaPlants: plants.length };
  }
  // benches: steel slat seats on two legs, facing the street (south)
  {
    const slats = [], legs = [];
    for (const [t0, t1, b] of P.benches) {
      for (let s = 0; s < 4; s++) slats.push(placed(new THREE.BoxGeometry(t1 - t0, 0.04, 0.09), (t0 + t1) / 2, b + 0.1 - s * 0.12, y0 + 0.44));
      for (const tl of [t0 + 0.4, (t0 + t1) / 2, t1 - 0.4]) legs.push(placed(new THREE.BoxGeometry(0.07, 0.42, 0.45), tl, b - 0.08, y0 + 0.21));
    }
    mesh(mergeGeos(slats), M.slat); mesh(mergeGeos(legs), M.black);
  }
  // bollards: instanced
  {
    const pts = [];
    const [f0, f1, fb, fs] = P.bollards.front;
    for (let t = f0; t <= f1; t += fs) if (!P.planters.some(([a, c]) => t > a + 1 && t < c - 1)) pts.push([t, fb]);
    const [wt, w0, w1, ws] = P.bollards.west;
    for (let b = w0; b < w1 - 0.5; b += ws) pts.push([wt, b]);
    const g = mergeGeos([new THREE.CylinderGeometry(0.13, 0.14, 0.86, 14).translate(0, 0.43, 0), new THREE.SphereGeometry(0.13, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.86, 0), new THREE.CylinderGeometry(0.145, 0.145, 0.05, 14).translate(0, 0.62, 0)]);
    const im = new THREE.InstancedMesh(g, M.bollard, pts.length);
    const m4 = new THREE.Matrix4();
    pts.forEach(([t, b], i) => { const [x, z] = W(t, b); m4.makeTranslation(x, y0, z); im.setMatrixAt(i, m4); });
    im.castShadow = false; im.receiveShadow = true; out.push(im);
  }
  // The Higher Ground: the granite drum, the stainless form, the plaque, the bronze figure (monument() below)
  for (const [geo, mat] of monument(P.monument, y0, M)) mesh(geo, mat, mat !== M.monPlaque);
  // the flagpoles (12 m, a gilt ball) with the two flags, hanging in a light breeze
  P.flagpoles.forEach(([t, b], k) => {
    mesh(placed(new THREE.CylinderGeometry(0.055, 0.1, 12.0, 12).translate(0, 6.0, 0), t, b, y0), M.pole, true);
    mesh(placed(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 12).translate(0, 0.15, 0), t, b, y0), M.black);
    mesh(placed(new THREE.SphereGeometry(0.1, 12, 8).translate(0, 12.1, 0), t, b, y0), M.gold);
    const f = new THREE.PlaneGeometry(2.1, 1.1, 12, 2);
    const q = f.getAttribute('position');
    for (let i = 0; i < q.count; i++) { const x = q.getX(i) + 1.05; q.setZ(i, Math.sin(x * 2.4 + k) * 0.09 * x); q.setX(i, x * 0.97); q.setY(i, q.getY(i) - x * 0.12); }
    f.computeVertexNormals(); f.translate(0.07, 11.2, 0);
    mesh(placed(f, t, b, y0, 0.6), k ? M.flagNY : M.flagUS, true);
  });
  // lamps: black poles with a crossarm and two lantern heads
  for (const [t, b] of P.lamps) {
    mesh(placed(new THREE.CylinderGeometry(0.07, 0.11, 5.6, 10).translate(0, 2.8, 0), t, b, y0), M.black, true);
    mesh(placed(new THREE.BoxGeometry(1.3, 0.08, 0.08).translate(0, 5.5, 0), t, b, y0), M.black);
    for (const s of [-0.6, 0.6]) {
      mesh(placed(new THREE.BoxGeometry(0.3, 0.42, 0.3).translate(s, 5.25, 0), t, b, y0), M.lamp);
      mesh(placed(new THREE.BoxGeometry(0.36, 0.06, 0.36).translate(s, 5.49, 0), t, b, y0), M.black);
    }
  }
  // one mesh per material (and shadow flag); the bollards stay instanced
  const groups = new Map(), final = [];
  for (const m of out) {
    if (m.isInstancedMesh) { final.push(m); continue; }
    const k = m.material.uuid + (m.castShadow ? 's' : '');
    if (!groups.has(k)) groups.set(k, { mat: m.material, shadow: m.castShadow, geos: [] });
    groups.get(k).geos.push(m.geometry);
  }
  for (const { mat, shadow, geos } of groups.values()) {
    const m = new THREE.Mesh(geos.length > 1 ? mergeGeos(geos) : geos[0], mat);
    m.castShadow = shadow; m.receiveShadow = true;
    final.push(m);
  }
  for (const g of plantSets) final.push(g);   // (BF36) the planting's instanced sets, after the merge by material
  return final;
}
