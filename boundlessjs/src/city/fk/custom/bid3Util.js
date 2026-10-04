// AR33 BID3 helpers shared by the segment's custom builders (fk/custom/bid3*.js): hashes, night-lit glass, a wall material
// calibrated to the facade value curve (mat/pbrLib.js), canvas relief textures drawn from scratch (carved stone: a height
// field painted with strokes, turned into an albedo and a normal map), and small mesh builders for panels and polygons in a
// face frame. Owner: the BID3 worker (docs/notes/ar33-bid3.md). Nothing here samples a photograph.
import * as THREE from 'three';
import earcut from 'earcut';
import { ENV, applyLightTrim, applyCityAO } from '../../../world/materials.js';
import { pbrMaterial } from '../../mat/pbrLib.js';

export const hash = (a, b = 0, c = 0) => { const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return x - Math.floor(x); };

// emission only after dark (ENV.night): lit windows, lobbies
export function nightLit(m) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.b3N = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float b3N;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= b3N;');
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|b3lit';
  return m;
}

// A wall material of our own (a stone panel with a carved relief, say) at the brightness of the library's walls: the
// albedo goes through the shader facades' value curve, albedo^1.22 * 0.88, with the light trim's day/night factor divided
// out (the same as mat/pbrLib.js does for its wall sets), so it sits beside a pbrMaterial of the same colour.
export function wallMat(opts) {
  // AR34: ground soot and rain streaks for every wall of ours (opts.soot: darkening at the foot, 0 = none; opts.streak: the
  // per-0.35 m column variation under the cornices), both read off the world position the city AO already carries (vCAOw)
  const { soot = 0.2, streak = 0.05, ...rest } = opts;
  const m = new THREE.MeshStandardMaterial(rest);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.b3cN = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float b3cN;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(1.22)) * 0.88 / mix(0.30, 0.88, b3cN);
      ${soot > 0 || streak > 0 ? `{
        float b3h = vCAOw.y - 3.5;
        float b3col = fract(sin(dot(floor(vec2(vCAOw.x + vCAOw.z, vCAOw.x - vCAOw.z) * 2.8), vec2(12.9898, 78.233))) * 43758.5453);
        float b3run = smoothstep(0.0, 1.0, b3col) * smoothstep(0.0, 6.0, b3h) * (1.0 - smoothstep(6.0, 40.0, b3h));
        diffuseColor.rgb *= (1.0 - ${soot.toFixed(3)} * (1.0 - smoothstep(0.0, 14.0, b3h))) * (1.0 - ${streak.toFixed(3)} * b3run);
      }` : ''}`);
  };
  m.customProgramCacheKey = () => 'b3wall|' + soot + '|' + streak;
  applyCityAO(m);
  applyLightTrim(m, 1);
  m.shadowSide = THREE.DoubleSide;
  return m;
}

// ------------------------------------------------------------------ relief textures
// kind 'frieze': a running vine scroll (spirals with leaves and rosettes), W x H px, three repeats across;
// kind 'spandrel': a shield (a cartouche) with leafy scrolls along its sides, the carved field of an arch spandrel;
// kind 'bell': a column capital's acanthus leaves in two ranks.
// Returns { map, normalMap } (CanvasTextures) or null where there is no canvas (node).
export function reliefTex(kind, W, H, o = {}) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  if (!g || typeof g.getImageData !== 'function') return null;
  const seed = o.seed ?? 3;
  const R = (a, b = 0) => hash(a, b, seed);
  g.fillStyle = 'rgb(58,58,58)'; g.fillRect(0, 0, W, H);
  g.lineCap = 'round'; g.lineJoin = 'round';
  // a rounded ridge along a polyline: three passes, wide and dim to narrow and bright
  const ridge = (pts, w) => {
    for (const [k, v] of [[1, 150], [0.62, 205], [0.28, 250]]) {
      g.strokeStyle = `rgb(${v},${v},${v})`;
      for (let i = 0; i + 1 < pts.length; i++) {
        const t = i / (pts.length - 1), wi = w * (1 - 0.55 * t) * k;
        g.lineWidth = Math.max(1, wi);
        g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[i + 1][0], pts[i + 1][1]); g.stroke();
      }
    }
  };
  // a leaf: an ellipse with a mid-rib, oriented by ang, lobes by two overlapping ellipses
  const leaf = (x, y, ang, len, wid, shade = 1) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    for (const [s, v] of [[1, 150], [0.78, 200], [0.5, 238]]) {
      g.fillStyle = `rgb(${Math.round(v * shade)},${Math.round(v * shade)},${Math.round(v * shade)})`;
      g.beginPath(); g.ellipse(len * 0.5, 0, len * 0.5 * s, wid * 0.5 * s, 0, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = 'rgb(95,95,95)'; g.lineWidth = Math.max(1, wid * 0.08);
    g.beginPath(); g.moveTo(len * 0.05, 0); g.lineTo(len * 0.92, 0); g.stroke();
    g.restore();
  };
  const rosette = (x, y, r, n = 8) => {
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; leaf(x, y, a, r, r * 0.62, 1); }
    g.fillStyle = 'rgb(250,250,250)'; g.beginPath(); g.arc(x, y, r * 0.22, 0, Math.PI * 2); g.fill();
  };
  const spiral = (cx, cy, r0, dir, turns, a0) => {
    const pts = [];
    const n = Math.round(14 * turns);
    for (let i = 0; i <= n; i++) {
      const t = i / n, th = a0 + dir * t * turns * Math.PI * 2, r = r0 * Math.pow(1 - t, 0.9) + r0 * 0.06;
      pts.push([cx + Math.cos(th) * r, cy + Math.sin(th) * r]);
    }
    return pts;
  };
  if (kind === 'frieze') {
    const P = W / 3;
    for (let rep = 0; rep < 3; rep++) {
      const x0 = rep * P;
      // the stem: a sine along the band, with a curl at each extremum
      const stem = [];
      for (let i = 0; i <= 40; i++) { const x = x0 + (i / 40) * P; stem.push([x, H * 0.5 + Math.sin(((x - x0) / P) * Math.PI * 2) * H * 0.2]); }
      ridge(stem, H * 0.07);
      for (const [fx, up] of [[0.25, 1], [0.75, -1]]) {
        const cx = x0 + fx * P, cy = H * 0.5 - up * H * 0.2 + up * 0.0;
        // curls on both sides of the extremum, mirrored
        for (const s of [-1, 1]) {
          const sp = spiral(cx + s * H * 0.2, cy - up * H * 0.12, H * 0.2, s * up, 1.5, up > 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
          ridge(sp, H * 0.06);
          for (let j = 2; j < sp.length - 3; j += 3) {
            const a = Math.atan2(sp[j + 1][1] - sp[j][1], sp[j + 1][0] - sp[j][0]) + (R(rep, j) > 0.5 ? 1 : -1) * 1.1;
            leaf(sp[j][0], sp[j][1], a, H * (0.15 + 0.05 * R(j)), H * 0.1);
          }
          rosette(sp[sp.length - 1][0], sp[sp.length - 1][1], H * 0.075, 7);
        }
        rosette(cx, cy, H * 0.1, 10);
      }
      for (let k = 0; k < 6; k++) leaf(x0 + P * (0.08 + k * 0.16), stem[Math.round((0.08 + k * 0.16) * 40)][1], (k % 2 ? 1 : -1) * 0.9, H * 0.16, H * 0.09);
    }
  } else if (kind === 'spandrel') {
    // a heater shield at the bottom centre, a ring of leaves round it, scrolls running up both sides
    const cx = W * 0.5, cy = H * 0.62, sw = W * 0.055, sh = H * 0.2;
    for (const [k, v] of [[1, 150], [0.82, 205], [0.6, 245]]) {
      g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath();
      g.moveTo(cx - sw * k, cy - sh * 0.7 * k); g.lineTo(cx + sw * k, cy - sh * 0.7 * k); g.lineTo(cx + sw * k, cy + sh * 0.1 * k);
      g.quadraticCurveTo(cx + sw * 0.9 * k, cy + sh * 0.7 * k, cx, cy + sh * k);
      g.quadraticCurveTo(cx - sw * 0.9 * k, cy + sh * 0.7 * k, cx - sw * k, cy + sh * 0.1 * k); g.closePath(); g.fill();
    }
    g.fillStyle = 'rgb(120,120,120)'; g.fillRect(cx - sw * 0.5, cy - sh * 0.2, sw, sh * 0.12);
    for (const s of [-1, 1]) {
      const sp = spiral(cx + s * W * 0.12, cy - sh * 0.1, H * 0.2, -s, 1.6, s > 0 ? Math.PI : 0);
      ridge(sp, H * 0.05);
      for (let j = 2; j < sp.length - 2; j += 2) {
        const a = Math.atan2(sp[j + 1][1] - sp[j][1], sp[j + 1][0] - sp[j][0]) + (j % 4 ? 1 : -1) * 1.15;
        leaf(sp[j][0], sp[j][1], a, H * 0.1, H * 0.065);
      }
      rosette(sp[sp.length - 1][0], sp[sp.length - 1][1], H * 0.05, 7);
      // a vine along the arc side
      const vine = [];
      for (let i = 0; i <= 24; i++) { const t = i / 24; vine.push([cx + s * (W * 0.17 + t * W * 0.28), cy - sh * 0.4 - t * H * 0.3 + Math.sin(t * 9) * H * 0.04]); }
      ridge(vine, H * 0.035);
      for (let j = 1; j < vine.length; j += 2) leaf(vine[j][0], vine[j][1], (j % 4 ? -1 : 1) * 1.0 + (s > 0 ? 0 : Math.PI), H * 0.08, H * 0.05);
    }
    for (let k = 0; k < 7; k++) rosette(W * (0.1 + k * 0.13), H * (0.16 + 0.1 * Math.sin(k * 1.7)), H * 0.035, 6);
  } else if (kind === 'bell') {
    // two ranks of acanthus leaves, the lower rank taller, each a fan of lobes
    for (const [rank, n, hh, y1] of [[0, 5, 0.55, 1.0], [1, 5, 0.45, 0.62]]) {
      for (let i = 0; i < n; i++) {
        const x = ((i + 0.5 + (rank ? 0.5 : 0)) / n) * W;
        for (let l = -2; l <= 2; l++) leaf(x + l * W * 0.02, H * y1, -Math.PI / 2 + l * 0.32, H * hh, W * 0.06);
      }
    }
  }
  const img = g.getImageData(0, 0, W, H);
  if (!img || !img.data || img.data.length < W * H * 4) return null;
  // heights in 0..1, two 3 x 3 blurs (round the ridges)
  let hgt = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) hgt[i] = img.data[i * 4] / 255;
  for (let pass = 0; pass < 2; pass++) {
    const nb = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += hgt[Math.min(H - 1, Math.max(0, y + dy)) * W + Math.min(W - 1, Math.max(0, x + dx))];
      nb[y * W + x] = s / 9;
    }
    hgt = nb;
  }
  const amp = o.amp ?? 5.5;
  const nd = new Uint8ClampedArray(W * H * 4), ad = new Uint8ClampedArray(W * H * 4);
  const base = o.base || [186, 176, 162];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const h = (xx, yy) => hgt[Math.min(H - 1, Math.max(0, yy)) * W + Math.min(W - 1, Math.max(0, xx))];
    const dx = (h(x + 1, y) - h(x - 1, y)) * amp, dy = (h(x, y + 1) - h(x, y - 1)) * amp;
    const nl = Math.hypot(dx, dy, 1), i4 = (y * W + x) * 4;
    nd[i4] = (-dx / nl * 0.5 + 0.5) * 255; nd[i4 + 1] = (dy / nl * 0.5 + 0.5) * 255; nd[i4 + 2] = (1 / nl * 0.5 + 0.5) * 255; nd[i4 + 3] = 255;
    const hv = hgt[y * W + x], k = 0.55 + 0.62 * Math.min(1, hv * 1.25);
    const gr = 0.94 + 0.12 * hash(x * 0.07, y * 0.07, seed);
    ad[i4] = Math.min(255, base[0] * k * gr); ad[i4 + 1] = Math.min(255, base[1] * k * gr); ad[i4 + 2] = Math.min(255, base[2] * k * gr); ad[i4 + 3] = 255;
  }
  const mk = (data, srgb) => {
    const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
    const g2 = c2.getContext('2d'); g2.putImageData(new ImageData(data, W, H), 0, 0);
    const t = new THREE.CanvasTexture(c2);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
    return t;
  };
  return { map: mk(ad, true), normalMap: mk(nd, false) };
}

// ------------------------------------------------------------------ meshes in a face frame
// A quad in the face plane: u0..u1 x y0..y1 at depth w (out of the wall), uv 0..1, facing out. frame: the builder's frame.
export function quadMesh(frame, mat, u0, u1, y0, y1, w, o = {}) {
  const P = [[u0, y0], [u1, y0], [u1, y1], [u0, y1]].map(([u, y]) => frame.world(u, y, w));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3));
  const n = [frame.n[0], 0, frame.n[1]];
  g.setAttribute('normal', new THREE.Float32BufferAttribute([...n, ...n, ...n, ...n], 3));
  const [a0, a1, b0, b1] = o.uv || [0, 1, 0, 1];
  g.setAttribute('uv', new THREE.Float32BufferAttribute([a0, b0, a1, b0, a1, b1, a0, b1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = false; m.receiveShadow = true;
  return m;
}
// A polygon (list of [u, y]) in the face plane at depth w, triangulated by earcut; uv from the box [uL, uR] x [yB, yT].
export function polyMesh(frame, mat, pts, w, box) {
  const flat = pts.flat();
  const tri = earcut(flat);
  const P = pts.map(([u, y]) => frame.world(u, y, w));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3));
  const n = [frame.n[0], 0, frame.n[1]];
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pts.flatMap(() => n), 3));
  const [uL, uR, yB, yT] = box;
  g.setAttribute('uv', new THREE.Float32BufferAttribute(pts.flatMap(([u, y]) => [(u - uL) / (uR - uL), (y - yB) / (yT - yB)]), 2));
  // earcut winds counter-clockwise in (u, y) as listed; the frame's (u, y, n) is right handed, so +n faces the viewer
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const idx = [];
  for (let i = 0; i < tri.length; i += 3) { if (area >= 0) idx.push(tri[i], tri[i + 1], tri[i + 2]); else idx.push(tri[i], tri[i + 2], tri[i + 1]); }
  g.setIndex(idx);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = false; m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------------ AR34: glass, lit rooms and shutters
// An opaque curtain-wall glass of the library (mat/pbrLib.js glass_tower*: the analytic sky reflection with the canyon term,
// Fresnel) with a body colour of our own: the library's bodies are near black, the real towers' glass reads mid grey-green or
// grey-blue by day. `key` makes the
// material distinct (the library caches by its options); `night` = [emissive hex, intensity] lights it after dark.
export function towerGlass(name, body, key = 0, night = null, tint = null) {
  const m = pbrMaterial(name, { body, dirt: 0.1 + key * 1e-4, ...(tint ? { tint } : {}) });
  // the library hands back its cached material for the same options (a builder run twice): wrap it once, or the second
  // wrap declares b3N again and the program fails to link ('b3N' : redefinition, the glass draws nothing)
  if (night && !m.userData.b3tg) {
    m.userData.b3tg = true;
    m.emissive = new THREE.Color(night[0]); m.emissiveIntensity = night[1];
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      sh.uniforms.b3N = ENV.night;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float b3N;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= b3N;');
    };
    m.customProgramCacheKey = () => 'b3tg|' + name + body + key;
  }
  return m;
}
// a surface that is lit from inside by day as well as at night (a lobby, a shop hall behind glass): its own albedo as emission
export function selfLit(color, day, night, rough = 0.8) {
  const m = applyLightTrim(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 }));
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.b3S = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float b3S;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * mix(${day.toFixed(3)}, ${night.toFixed(3)}, b3S);`);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|b3self' + day + ',' + night;
  m.shadowSide = THREE.DoubleSide;
  return m;
}
const _R = new Map();
// the room surfaces behind a glazed front; k scales the daytime emission (a lobby seen through dark glass reads dim, a shop bright)
export function roomMats(k = 1) {
  if (_R.has(k)) return _R.get(k);
  // the trim (x 0.30 by day) and the enclosed shade take most of an albedo's emission: x 3.2 reads a lit hall at ~45 % grey by day at k = 1
  const D = 3.2 * k;
  const R = {
    wall: selfLit(0xb9a98c, 0.62 * D, 1.1), wallDk: selfLit(0x7d7260, 0.5 * D, 0.9), ceil: selfLit(0xd4cbb8, 0.7 * D, 1.2),
    floor: selfLit(0x6e675c, 0.25 * D, 0.5, 0.35), light: selfLit(0xfff4dc, Math.min(3.0, 1.0 * D), 1.6, 0.5),
  };
  _R.set(k, R);
  return R;
}
// A lit hall behind a glazed front: back wall, a ceiling with light strips, a floor, side walls and a row of columns, all in
// the face frame (u0..u1 along, y0..yTop up, w from the glass plane w0 back `depth` m). Cheap (about 60 triangles per 10 m).
export function litHall(K, u0, u1, yTop, w0, depth, o = {}) {
  const R = roomMats(o.k ?? 1), ws = w0 - depth, y0 = o.y0 ?? 0;
  K.box(R.wall, u0, u1, y0, yTop, ws - 0.1, ws, { c: 0, skip: 16 | 32 | 4 | 8 });
  K.box(R.ceil, u0, u1, yTop - 0.06, yTop, ws, w0, { c: 0, skip: 8 | 16 | 32 | 1 | 2 });
  K.box(R.floor, u0, u1, y0, y0 + 0.02, ws, w0, { c: 0, skip: 4 | 16 | 32 | 1 | 2 });
  K.box(R.wallDk, u0 - 0.1, u0, y0, yTop, ws, w0, { c: 0, skip: 4 | 8 | 16 });
  K.box(R.wallDk, u1, u1 + 0.1, y0, yTop, ws, w0, { c: 0, skip: 4 | 8 | 16 });
  const step = o.lightStep ?? 3.2;
  for (let u = u0 + step / 2; u < u1 - 0.8; u += step) K.box(R.light, u - 0.6, u + 0.6, yTop - 0.09, yTop - 0.06, ws + depth * 0.2, w0 - depth * 0.1, { c: 0, skip: 8 });
  const col = o.columns ?? 0;
  if (col > 0) for (let u = u0 + col / 2; u < u1 - 0.5; u += col) K.box(R.wall, u - 0.3, u + 0.3, y0, yTop - 0.06, w0 - depth * 0.45 - 0.3, w0 - depth * 0.45 + 0.3, { c: 0.01, skip: 4 | 8 });
}

// A closed roll-down shutter in the face frame: ribbed (a canvas height field for the slats, tagged and streaked), `tint` the
// paint, `seed` the tags. Returns a material; use it on a quad/box at u0..u1 x y0..y1.
const _SH = new Map();
export function shutterMat(tint = '#9a9ea1', seed = 1, tags = 0.2) {
  const key = tint + seed + tags;
  if (_SH.has(key)) return _SH.get(key);
  let m;
  if (typeof document !== 'undefined') {
    const W = 256, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    if (g && typeof g.getImageData === 'function') {
      const base = new THREE.Color(tint), br = base.r * 255, bg = base.g * 255, bb = base.b * 255;
      const slats = 54;   // 0.075 m per slat over a 4.0 m shutter tile
      for (let i = 0; i < slats; i++) {
        const y0 = (i / slats) * H, hh = H / slats;
        const k = 0.9 + 0.1 * hash(i, seed, 1);
        const gr = g.createLinearGradient(0, y0, 0, y0 + hh);
        gr.addColorStop(0, `rgb(${br * k * 1.1 | 0},${bg * k * 1.1 | 0},${bb * k * 1.1 | 0})`);
        gr.addColorStop(0.55, `rgb(${br * k | 0},${bg * k | 0},${bb * k | 0})`);
        gr.addColorStop(1, `rgb(${br * k * 0.62 | 0},${bg * k * 0.62 | 0},${bb * k * 0.62 | 0})`);
        g.fillStyle = gr; g.fillRect(0, y0, W, hh + 0.5);
      }
      // dirt streaks and tags
      for (let s = 0; s < 36; s++) { g.fillStyle = `rgba(30,28,24,${0.04 + 0.08 * hash(s, seed, 2)})`; g.fillRect(hash(s, seed, 3) * W, hash(s, seed, 4) * H * 0.5, 1 + hash(s, seed, 5) * 3, H * (0.2 + 0.5 * hash(s, seed, 6))); }
      // tags: big filled bubble shapes with a black outline (blue, green, yellow, white), the way a gate reads from across the street
      const cols = ['#2f4f9a', '#3a8d4a', '#d7c42a', '#e8e8e4', '#b8352e'];
      for (let t = 0; t < Math.round(9 * tags); t++) {
        const cx = 30 + hash(t, seed, 8) * 196, cy = 190 + hash(t, seed, 9) * 270, rw = 28 + hash(t, seed, 10) * 46, rh = 20 + hash(t, seed, 11) * 34;
        g.lineWidth = 5; g.strokeStyle = '#141414'; g.fillStyle = cols[(t + seed) % cols.length]; g.globalAlpha = 0.9;
        g.beginPath(); g.ellipse(cx, cy, rw, rh, (hash(t, seed, 12) - 0.5) * 0.7, 0, Math.PI * 2); g.fill(); g.stroke();
        g.lineWidth = 3; g.strokeStyle = '#141414';
        g.beginPath(); g.moveTo(cx - rw * 0.6, cy - rh * 0.1); g.quadraticCurveTo(cx, cy - rh * 0.9, cx + rw * 0.6, cy + rh * 0.1); g.stroke();
      }
      g.globalAlpha = 1;
      const map = new THREE.CanvasTexture(cv);
      map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8;
      m = wallMat({ map, roughness: 0.5, metalness: 0.1 });
    }
  }
  if (!m) m = wallMat({ color: new THREE.Color(tint), roughness: 0.55, metalness: 0.35 });
  _SH.set(key, m);
  return m;
}
// the shutter's quad (the texture repeats once per 1.7 m wide x 4.0 m high, the slats horizontal)
export function shutterQuad(frame, mat, u0, u1, y0, y1, w) {
  const m = quadMesh(frame, mat, u0, u1, y0, y1, w, { uv: [0, (u1 - u0) / 1.7, y0 / 4.0, y1 / 4.0] });
  m.castShadow = false;
  return m;
}

// ------------------------------------------------------------------ AR34: cladding panels with joints (canvas, drawn from scratch)
// A repeat of cols x rows panels (pw x ph metres each), each its own tone, joints recessed in the normal map, a fine grain and a
// few vertical water stains. base: [r, g, b] 0..255 (the albedo before wallMat's value curve). Returns a wallMat (the texture
// repeats every cols * pw by rows * ph metres; box UVs are metres).
const _PM = new Map();
export function panelMat(base, pw, ph, o = {}) {
  const key = [base.join(','), pw, ph, o.cols ?? 2, o.rows ?? 2, o.seed ?? 1, o.joint ?? 0.012, o.tone ?? 0.05].join('|');
  if (_PM.has(key)) return _PM.get(key);
  const cols = o.cols ?? 2, rows = o.rows ?? 2, seed = o.seed ?? 1, jw = o.joint ?? 0.012;
  const sx = o.px ?? 150;                                   // pixels per metre
  const W = Math.round(cols * pw * sx), H = Math.round(rows * ph * sx);
  let m = null;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    if (g && typeof g.getImageData === 'function') {
      const img = g.getImageData(0, 0, W, H);
      if (img && img.data && img.data.length >= W * H * 4) {
        const d = img.data, hgt = new Float32Array(W * H);
        const pxw = pw * sx, pxh = ph * sx, jp = Math.max(1.5, jw * sx);
        for (let y = 0; y < H; y++) {
          const rr = Math.floor(y / pxh), fy = y - rr * pxh;
          for (let x = 0; x < W; x++) {
            const cc = Math.floor(x / pxw), fx = x - cc * pxw;
            const k = 1 + ((hash(cc, rr, seed) - 0.5) * 2) * (o.tone ?? 0.05);
            const grain = 1 + (hash(x * 0.37, y * 0.41, seed + 3) - 0.5) * 0.09 + (hash(x * 0.05, y * 0.05, seed + 5) - 0.5) * 0.05;
            // a faint vertical streak per panel (water run)
            const st = 1 - 0.07 * Math.max(0, hash(cc, rr, seed + 9) - 0.55) * (0.5 + 0.5 * Math.sin(fx * 0.12 + cc));
            const edge = Math.min(fx, pxw - fx, fy, pxh - fy);
            const jt = edge < jp ? 1 - edge / jp : 0;                // 1 in the joint
            const v = k * grain * st * (1 - 0.34 * jt);
            const i4 = (y * W + x) * 4;
            d[i4] = Math.min(255, base[0] * v); d[i4 + 1] = Math.min(255, base[1] * v); d[i4 + 2] = Math.min(255, base[2] * v); d[i4 + 3] = 255;
            hgt[y * W + x] = (1 - jt) * 0.8 + 0.2 * (grain - 0.9) * 5;
          }
        }
        g.putImageData(img, 0, 0);
        const map = new THREE.CanvasTexture(cv);
        map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8;
        map.repeat.set(1 / (cols * pw), 1 / (rows * ph));
        // the normal map from the heights
        const nd = new Uint8ClampedArray(W * H * 4), amp = o.amp ?? 3.2;
        const hh = (xx, yy) => hgt[((yy + H) % H) * W + ((xx + W) % W)];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const dx = (hh(x + 1, y) - hh(x - 1, y)) * amp, dy = (hh(x, y + 1) - hh(x, y - 1)) * amp, nl = Math.hypot(dx, dy, 1), i4 = (y * W + x) * 4;
          nd[i4] = (-dx / nl * 0.5 + 0.5) * 255; nd[i4 + 1] = (dy / nl * 0.5 + 0.5) * 255; nd[i4 + 2] = (1 / nl * 0.5 + 0.5) * 255; nd[i4 + 3] = 255;
        }
        const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
        c2.getContext('2d').putImageData(new ImageData(nd, W, H), 0, 0);
        const nmap = new THREE.CanvasTexture(c2);
        nmap.colorSpace = THREE.NoColorSpace; nmap.wrapS = nmap.wrapT = THREE.RepeatWrapping; nmap.anisotropy = 8;
        nmap.repeat.copy(map.repeat);
        m = wallMat({ map, normalMap: nmap, normalScale: new THREE.Vector2(1, 1), roughness: o.rough ?? 0.78, metalness: 0 });
      }
    }
  }
  if (!m) m = wallMat({ color: new THREE.Color(`rgb(${base[0]},${base[1]},${base[2]})`), roughness: o.rough ?? 0.78 });
  _PM.set(key, m);
  return m;
}

// ------------------------------------------------------------------ a curtain wall on one face
// A face of glass along the frame's u (at w = wPlane, facing +w when dir = 1, -w when dir = -1) or along w (at u = uPlane,
// facing +u / -u): mullions every `pane` m, a spandrel band at each floor line, vision glass between, `lit` share lit.
// o: { axis: 'u' | 'w', a0, a1 (the extent along the axis), plane, dir, y0, y1, floor (floor-to-floor), y1st (the first
//      floor line), pane, span: [below, above] the floor line, mull: [width, projection], seed, M: { vision, lit, spandrel, mullion } }
export function curtain(K, o) {
  const M = o.M, dir = o.dir, P = o.plane, t = 0.05;
  const back = o.axis === 'u' ? (dir > 0 ? 16 : 32) : (dir > 0 ? 1 : 2);   // the face turned to the wall (never seen)
  const box = (a0, a1, y0, y1, d0, d1, m, opt) => {
    if (opt && opt.skip === 16) opt = { ...opt, skip: back };
    else if (opt && opt.skip === (16 | 4 | 8)) opt = { ...opt, skip: back | (o.axis === 'u' ? 4 | 8 : 4 | 8) };
    // d: the depth measured outward from the plane (d0 < d1)
    const lo = dir > 0 ? P + d0 : P - d1, hi = dir > 0 ? P + d1 : P - d0;
    if (o.axis === 'u') K.box(m, a0, a1, y0, y1, lo, hi, opt);
    else K.box(m, lo, hi, y0, y1, a0, a1, opt);
  };
  const n = Math.max(1, Math.round((o.a1 - o.a0) / o.pane)), pw = (o.a1 - o.a0) / n;
  // floor lines
  const lines = [];
  for (let y = o.y1st; y <= o.y1 + 1e-3; y += o.floor) if (y >= o.y0 - 1e-3) lines.push(y);
  const [sb, sa] = o.span || [0.3, 0.65];
  // spandrels (one long box per floor line, the full width) and vision panes (per pane, some lit)
  const cuts = [o.y0];
  for (const yl of lines) { cuts.push(Math.max(o.y0, yl - sb), Math.min(o.y1, yl + sa)); }
  cuts.push(o.y1);
  for (const yl of lines) {
    const a = Math.max(o.y0, yl - sb), b = Math.min(o.y1, yl + sa);
    if (b - a > 0.02) box(o.a0, o.a1, a, b, -t, 0, M.spandrel, { c: 0, skip: 16 });
  }
  // the vision bands between the spandrels
  const bands = [];
  let yPrev = o.y0;
  for (const yl of lines) {
    const a = Math.max(o.y0, yl - sb);
    if (a - yPrev > 0.1) bands.push([yPrev, a]);
    yPrev = Math.min(o.y1, yl + sa);
  }
  if (o.y1 - yPrev > 0.1) bands.push([yPrev, o.y1]);
  bands.forEach(([a, b], fi) => {
    for (let i = 0; i < n; i++) {
      const h1 = hash(o.seed || 0, fi, i), h2 = hash((o.seed || 0) + 7, fi, i);
      const T = M.set ? M.set[(a + b) / 2 < 30 ? 0 : (a + b) / 2 < 58 ? 1 : 2] : M;
      let vm = h1 < (o.lit ?? 0.3) ? T.lit : h2 < 0.2 && T.visionB ? T.visionB : h2 < 0.42 && T.visionC ? T.visionC : T.vision;
      // o.patch [panes, bands]: low-frequency reflection patches (a lit cloud, a dark building) over the per-pane scatter
      if (o.patch && vm !== T.lit && h2 < 0.8) {
        const pr = hash(Math.floor(i / o.patch[0]), Math.floor(fi / o.patch[1]), (o.seed || 0) + 3);
        vm = pr < 0.3 ? (T.visionC || T.vision) : pr > 0.68 ? (T.visionB || T.vision) : T.vision;
      }
      box(o.a0 + i * pw, o.a0 + (i + 1) * pw, a, b, -t - 0.02, -0.02, vm, { c: 0, skip: 16 });
    }
  });
  // mullions (full height) and a transom cap at each floor line
  const [mw, mp] = o.mull || [0.06, 0.12];
  for (let i = 0; i <= n; i++) {
    const a = o.a0 + i * pw;
    box(a - mw / 2, a + mw / 2, o.y0, o.y1, -0.02, mp, M.mullion, { c: 0.008, skip: 16 | 4 | 8 });
  }
  for (const yl of lines) if (yl > o.y0 + 0.05 && yl < o.y1 - 0.05) box(o.a0, o.a1, yl - 0.035, yl + 0.035, -0.02, mp * 0.6, M.mullion, { c: 0, skip: 16 });
}


// thin pale anodised aluminium
let _PMULL = null;
export function paleMullion() {
  // through wallMat's value curve
  if (!_PMULL) _PMULL = wallMat({ color: 0xdfe1de, roughness: 0.4, metalness: 0.2, soot: 0, streak: 0 });
  return _PMULL;
}
