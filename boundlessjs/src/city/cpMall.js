// CP33 LANDSCAPE: the Mall's promenade surface (teaser 4 review: "the Mall's promenade is a flat, dark slate plane with no
// aggregate, patching or litter ... use a light-grey park asphalt with aggregate detail, patch repairs, leaf litter"). The
// compiled carriageway is re-kinded to the park path by centralPark.js mallApply, which the ground shader draws as a flat
// tone. The ground shader is not this part's, so the surface is its own mesh laid 1.5 cm over that path: a strip along the
// walk's axis (the row's width from where the path section actually is), a texture of 16 m (worn light-grey asphalt: a
// binder with light chips, four patch repairs with sealed seams, hairline cracks, oil and gum, leaf litter) and a 1.6 m
// tiling normal map of the aggregate (chips 3-12 mm), a tone per vertex (worn centre, darker and littered edges). The
// textures are canvas-baked on first use (~0.4 s). `?cp33m=0` leaves the ground's own surface.
import * as THREE from 'three';
import { applyLightTrim, applyCityAO } from '../world/materials.js';

export const CP33M = typeof document !== 'undefined' && !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('cp33m') === '0');
const MALL_O = [-110, 1455], MALL_U = [0.2756, -0.9613], MALL_R = [0.9613, 0.2756];
const S0 = -10, S1 = 432;
const STREET_CAL = [1.94, 1.70, 1.47];
// applyLightTrim multiplies the albedo by 0.30 x STREET_CAL by day (0.58, 0.51, 0.44): a texture meant to DISPLAY as worn
// light-grey asphalt (an effective albedo about 0.30, neutral: the Mall's old path tone is 0.2 with no trim) is stored
// bluer and about 2.4 x lighter. TEX scales the sRGB-space working tone t (0.5 mean); disp() converts a colour authored as
// it should look (sRGB-space) to what is stored.
const TRIM = [0.30 * STREET_CAL[0], 0.30 * STREET_CAL[1], 0.30 * STREET_CAL[2]];
const TEX = [1.48, 1.57, 1.69];
const disp = (c) => c.map((v, i) => Math.min(1, Math.pow(Math.pow(v, 2.2) / TRIM[i], 1 / 2.2)));

const h2 = (i, j) => { const t = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return t - Math.floor(t); };
// periodic value noise on an n x n lattice over the unit square
function pnoise(u, v, n, seed) {
  const x = u * n, y = v * n, i = Math.floor(x), j = Math.floor(y), a = x - i, b = y - j, sa = a * a * (3 - 2 * a), sb = b * b * (3 - 2 * b);
  const H = (p, q) => h2(((p % n) + n) % n + seed, ((q % n) + n) % n + seed * 1.7);
  return (H(i, j) * (1 - sa) + H(i + 1, j) * sa) * (1 - sb) + (H(i, j + 1) * (1 - sa) + H(i + 1, j + 1) * sa) * sb;
}
// a small seeded generator (the texture is the same every run)
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

let _tex = null;
function mallTextures() {
  if (_tex) return _tex;
  const N = 1024, M = 512;
  const R = rng(33);
  // ---- the albedo (sRGB bytes), 16 m square: 1.56 cm a texel
  const A = new Float32Array(N * N * 3);   // linear-ish working tone, 0..1 (sRGB-space values; it is stored as sRGB)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    // worn light-grey asphalt: warm grey, large-scale tone drift, a finer mottle, the chips as light and dark speckle
    let t = 0.50 + 0.10 * (pnoise(u, v, 5, 1) - 0.5) * 2 + 0.07 * (pnoise(u, v, 17, 2) - 0.5) * 2 + 0.05 * (pnoise(u, v, 61, 3) - 0.5) * 2;
    const sp = h2(x * 1.0 + 11.0, y * 1.0 + 3.0);
    t *= sp > 0.93 ? 1.20 : sp < 0.07 ? 0.78 : 1.0 + (sp - 0.5) * 0.10;
    const k = (y * N + x) * 3;
    A[k] = Math.min(1, t * TEX[0]); A[k + 1] = Math.min(1, t * TEX[1]); A[k + 2] = Math.min(1, t * TEX[2]);
  }
  const px = (x, y) => (((y % N) + N) % N * N + (((x % N) + N) % N)) * 3;
  const shade = (x, y, f, tint) => { const k = px(x, y); A[k] *= f * tint[0]; A[k + 1] *= f * tint[1]; A[k + 2] *= f * tint[2]; };
  // patch repairs: four cut-outs (0.5-1.7 m x 0.4-1.1 m, the edges wandering by a few cm), a shade darker and tighter, a sealed seam round each
  for (let p = 0; p < 4; p++) {
    const cx = Math.floor(R() * N), cy = Math.floor(R() * N), w = 34 + Math.floor(R() * 70), h = 26 + Math.floor(R() * 44), rot = (R() - 0.5) * 0.4;
    const tone = 0.80 + 0.10 * R(), c = Math.cos(rot), s = Math.sin(rot);
    for (let dy = -h - 8; dy <= h + 8; dy++) for (let dx = -w - 8; dx <= w + 8; dx++) {
      const rx = dx * c - dy * s, ry = dx * s + dy * c;
      const wob = (pnoise((((cx + dx) % N) + N) % N / N, (((cy + dy) % N) + N) % N / N, 48, 9) - 0.5) * 9;
      const edge = Math.min(w - Math.abs(rx), h - Math.abs(ry)) + wob;
      if (edge < 0) continue;
      const sealed = edge < 2.2 ? 0.62 : 1.0;
      shade(cx + dx, cy + dy, tone * sealed * (0.96 + 0.08 * h2(dx + cx, dy + cy)), [1.02, 1.0, 0.97]);
    }
  }
  // hairline cracks: random walks, 1-2 px
  for (let q = 0; q < 6; q++) {
    let x = R() * N, y = R() * N, a = R() * 6.28;
    const len = 80 + R() * 200, wdt = R() < 0.25 ? 2 : 1;
    for (let s = 0; s < len; s++) {
      a += (R() - 0.5) * 0.35; x += Math.cos(a); y += Math.sin(a);
      for (let w = 0; w < wdt; w++) shade(Math.round(x) + w, Math.round(y), 0.62, [1, 1, 1]);
      if (R() < 0.01) { let bx = x, by = y, ba = a + (R() < 0.5 ? 1 : -1) * (0.6 + R() * 0.6); for (let t = 0; t < 30 + R() * 50; t++) { ba += (R() - 0.5) * 0.4; bx += Math.cos(ba); by += Math.sin(ba); shade(Math.round(bx), Math.round(by), 0.7, [1, 1, 1]); } }
    }
  }
  // oil, damp and gum: soft blotches (darker warm, a few lighter spots)
  for (let q = 0; q < 14; q++) {
    const cx = R() * N, cy = R() * N, r = 8 + R() * 34, f = q < 10 ? 0.86 + 0.08 * R() : 1.14, tint = q < 10 ? [1, 0.98, 0.94] : [1, 1, 1];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy) / r;
      if (d >= 1) continue;
      shade(Math.round(cx + dx), Math.round(cy + dy), 1 + (f - 1) * (1 - d * d) * (0.6 + 0.4 * h2(dx + cx, dy + cy)), tint);
    }
  }
  // leaf litter: elm and plane leaves (8-18 cm), dry tan and brown, a few olive, dulled by dust (the asphalt shows through), more in drifts
  for (let q = 0; q < 230; q++) {
    const cx = R() * N, cy = R() * N;
    const drift = pnoise(cx / N, cy / N, 3, 7) > 0.45 || R() < 0.2;
    if (!drift) continue;
    const L = 5 + R() * 8, wd = L * (0.4 + 0.2 * R()), a = R() * 6.28, ca = Math.cos(a), sa = Math.sin(a);
    const pick = R(), jit = 0.8 + 0.3 * R();
    const base = pick < 0.12 ? [0.40, 0.40, 0.22] : pick < 0.55 ? [0.46, 0.38, 0.25] : [0.34, 0.27, 0.19];
    const col = disp(base.map((v) => v * jit)), mix = 0.72 + 0.12 * R();
    for (let dy = -L; dy <= L; dy++) for (let dx = -wd; dx <= wd; dx++) {
      const lx = dx * ca - dy * sa, ly = dx * sa + dy * ca;
      const t = ly / L, wv = wd * (1 - t * t) * (1 - 0.25 * t);
      if (Math.abs(lx) > wv * 0.98 || Math.abs(t) > 1) continue;
      const vein = Math.abs(lx) < 0.7 ? 0.85 : 1.0;
      const k = px(Math.round(cx + dx), Math.round(cy + dy));
      A[k] = A[k] * (1 - mix) + col[0] * vein * mix; A[k + 1] = A[k + 1] * (1 - mix) + col[1] * vein * mix; A[k + 2] = A[k + 2] * (1 - mix) + col[2] * vein * mix;
    }
  }
  const aB = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    aB[i * 4] = Math.max(0, Math.min(255, Math.round(A[i * 3] * 255))); aB[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(A[i * 3 + 1] * 255)));
    aB[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(A[i * 3 + 2] * 255))); aB[i * 4 + 3] = 255;
  }
  const map = new THREE.DataTexture(aB, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter; map.generateMipmaps = true; map.anisotropy = 8;
  map.repeat.set(1 / 16, 1 / 16); map.needsUpdate = true;
  // ---- the aggregate's normal map, 1.6 m tile: 3 mm a texel. Chips (domes of 1-4 texels) over a binder with a fine grain
  const Hh = new Float32Array(M * M);
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) Hh[y * M + x] = 0.35 * pnoise(x / M, y / M, 24, 5) + 0.22 * pnoise(x / M, y / M, 96, 6) + 0.12 * h2(x + 5.0, y + 9.0);
  for (let c = 0; c < 9000; c++) {
    const cx = Math.floor(R() * M), cy = Math.floor(R() * M), r = 1 + Math.floor(R() * R() * 5), ht = 0.5 + 0.9 * R();
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy) / (r + 0.5);
      if (d >= 1) continue;
      const k = (((cy + dy) % M + M) % M) * M + (((cx + dx) % M + M) % M);
      Hh[k] = Math.max(Hh[k], 0.45 + ht * 0.5 * Math.sqrt(1 - d * d));
    }
  }
  const nB = new Uint8Array(M * M * 4);
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
    const hx = Hh[y * M + ((x + 1) % M)] - Hh[y * M + ((x + M - 1) % M)], hy = Hh[((y + 1) % M) * M + x] - Hh[((y + M - 1) % M) * M + x];
    const nx = -hx * 2.2, ny = -hy * 2.2, il = 1 / Math.hypot(nx, ny, 1);
    const k = (y * M + x) * 4;
    nB[k] = Math.round(255 * (0.5 + 0.5 * nx * il)); nB[k + 1] = Math.round(255 * (0.5 + 0.5 * ny * il)); nB[k + 2] = Math.round(255 * (0.5 + 0.5 * il)); nB[k + 3] = 255;
  }
  const nrm = new THREE.DataTexture(nB, M, M, THREE.RGBAFormat, THREE.UnsignedByteType);
  nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping; nrm.magFilter = THREE.LinearFilter; nrm.minFilter = THREE.LinearMipmapLinearFilter; nrm.generateMipmaps = true; nrm.anisotropy = 8;
  nrm.repeat.set(1 / 1.6, 1 / 1.6); nrm.needsUpdate = true;
  return (_tex = { map, nrm });
}

export { mallTextures as _mallTextures };   // (tools/cp/mall_probe.mjs bakes it in node)
let _mat = null;
function mallMat() {
  if (_mat) return _mat;
  const T = mallTextures();
  const m = new THREE.MeshStandardMaterial({ map: T.map, normalMap: T.nrm, vertexColors: true, roughness: 0.94, metalness: 0 });
  m.normalScale.set(0.9, 0.9);
  m.polygonOffset = true; m.polygonOffsetFactor = -3; m.polygonOffsetUnits = -3;
  m.name = 'cp33:mallAsphalt';
  _mat = applyLightTrim(applyCityAO(m), STREET_CAL);
  return _mat;
}

// the strip's rows are 2 m apart along the walk; the row's extent across is where the path section is. A row belongs to the
// tile holding its middle. ctx: cpFlora.js's (sectionY(kind, x, z, tol)); gy(x, z) its ground answer
export function mallSurface(group, ctx, gy) {
  if (!CP33M || !ctx.sectionY) return;
  const { ox, oz } = ctx;
  if (ox > 60 || ox + 512 < -140 || oz > 1470 || oz + 512 < 1030) return;
  const at = (s, off) => [MALL_O[0] + MALL_U[0] * s + MALL_R[0] * off, MALL_O[1] + MALL_U[1] * s + MALL_R[1] * off];
  const rows = [];
  for (let s = S0; s < S1; s += 2) {
    const [mx, mz] = at(s + 1, 0);
    if (mx < ox || mx >= ox + 512 || mz < oz || mz >= oz + 512) continue;
    // the path section's extent across at the row's middle (0.25 m steps): the outermost covered offsets of the run through 0
    let lo = null, hi = null;
    for (let o = 0; o >= -10.6; o -= 0.25) { const [x, z] = at(s + 1, o); const y = ctx.sectionY('path', x, z, 0); if (y === null || !isFinite(y)) break; lo = o; }
    for (let o = 0; o <= 10.6; o += 0.25) { const [x, z] = at(s + 1, o); const y = ctx.sectionY('path', x, z, 0); if (y === null || !isFinite(y)) break; hi = o; }
    if (lo === null || hi === null || hi - lo < 4) continue;
    rows.push({ s, lo: lo + 0.04, hi: hi - 0.04 });
  }
  if (!rows.length) return;
  const NA = 8;
  const pos = [], col = [], uv = [], idx = [];
  const C = 'cp33m';
  rows.forEach((r, k) => {
    // two edges per row (this row at s and s + 2 share the row's extent: the next row's own is used for its own vertices)
    for (const s of [r.s, r.s + 2]) {
      for (let a = 0; a <= NA; a++) {
        const off = r.lo + ((r.hi - r.lo) * a) / NA, [x, z] = at(s, off);
        const y = ctx.sectionY('path', x, z, 0);
        const yy = y !== null && isFinite(y) ? y : gy(x, z);
        pos.push(x, (yy === null || yy === undefined ? 0 : yy) + 0.015, z);
        // the worn centre lighter, the edges darker and littered; a tone per 3 m of the walk
        const e = Math.min(off - r.lo, r.hi - off), edge = Math.max(0, 1 - e / 1.6);
        const drift = 0.94 + 0.12 * h2(Math.floor(s / 3) * 1.3 + Math.floor(off / 3) * 7.1, 3.3);
        const tone = drift * (1 - 0.20 * edge) * (1.04 - 0.10 * Math.min(1, Math.abs(off) / 8));
        col.push(tone * (1 + 0.04 * edge), tone, tone * (1 - 0.07 * edge));
        uv.push(off, s);
      }
    }
    const b = k * 2 * (NA + 1);
    for (let a = 0; a < NA; a++) { const v00 = b + a, v10 = b + a + 1, v01 = b + (NA + 1) + a, v11 = b + (NA + 1) + a + 1; idx.push(v00, v01, v10, v10, v01, v11); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // (the winding is made to face up whatever the row order is)
  const nrm = g.getAttribute('normal');
  if (nrm.count && nrm.getY(0) < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, mallMat());
  mesh.name = C + ':promenade'; mesh.castShadow = false; mesh.receiveShadow = true;
  group.add(mesh);
  if (typeof window !== 'undefined') { const P = (window.__CP33M = window.__CP33M || { tiles: {} }); P.tiles[ctx.key] = { rows: rows.length, tris: idx.length / 3 }; }
}
