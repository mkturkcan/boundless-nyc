// AR33 custom builders and sign marks, segment bid2: Frederick Douglass to Adam Clayton Powell Jr. Boulevard. Specs name them as 'bid2:<fn>' (docs/notes/ar33-spec.md).
// Owner: the BID2 worker (docs/notes/ar33-bid2.md).
// every sign and mark drawn from scratch.
import * as THREE from 'three';
import { buildApollo33 } from '../../w125cKit.js';
import { applyLightTrim, ENV } from '../../../world/materials.js';
import { pbrMaterial } from '../../mat/pbrLib.js';
// BF36 (BIDFIX 2026-10-02, teaser 8's t8VictoriaCrane f000): the hotel entrance under the marquee drew the kit's bank interior,
// three white counters behind the doors.
// revolving door in the recess; `?bf36=0` keeps the bank interior
const BF36 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('bf36') === '0');
// a local matrix helper: translate, scale, Euler (rx, ry, rz, 'YXZ')
const mtx = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));

// ------------------------------------------------------------------ the Apollo Theater, 253 W 125th St
// the lobby building's terracotta front, the marquee, the blade, the rooftop frame and the auditorium behind: the whole
// lot, built in city/w125cKit.js (buildApollo33) in the kit's front frame
export function apollo(group, ctx, spec, frame) {
  const r = buildApollo33(group, frame);
  if (typeof window !== 'undefined') window.__BID2 = { ...(window.__BID2 || {}), apollo: r };
}

// ------------------------------------------------------------------ sign marks (fn(ctx2d, w, h), transparent canvas)
// the SPA badge at the east end of Cinderella Eyebrows' backer: a yellow ellipse with navy italic letters
export function spa(c, w, h) {
  c.save();
  c.fillStyle = '#f2c500';
  c.beginPath(); c.ellipse(w / 2, h / 2, w * 0.46, h * 0.3, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#1b3486';
  c.font = `italic 800 ${Math.round(h * 0.32)}px "ar33 Poppins", sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('SPA', w / 2, h / 2 + h * 0.01);
  c.restore();
}
// Portabella's window banners (2024-08: a man in a suit on a pale field in a black frame): a suit drawn as flat shapes
export function suit(c, w, h) {
  c.save();
  c.fillStyle = '#e9e7e2'; c.fillRect(w * 0.06, h * 0.03, w * 0.88, h * 0.94);
  const cx = w / 2, top = h * 0.12;
  c.fillStyle = '#c8a488'; c.beginPath(); c.ellipse(cx, top + h * 0.05, w * 0.1, h * 0.045, 0, 0, Math.PI * 2); c.fill();        // the head
  c.fillStyle = '#2d2f36';
  c.beginPath(); c.moveTo(cx - w * 0.3, top + h * 0.13); c.lineTo(cx + w * 0.3, top + h * 0.13); c.lineTo(cx + w * 0.34, top + h * 0.55);
  c.lineTo(cx + w * 0.2, top + h * 0.56); c.lineTo(cx + w * 0.18, top + h * 0.84); c.lineTo(cx - w * 0.18, top + h * 0.84); c.lineTo(cx - w * 0.2, top + h * 0.56);
  c.lineTo(cx - w * 0.34, top + h * 0.55); c.closePath(); c.fill();                                                             // jacket and trousers
  c.fillStyle = '#f4f4f2'; c.beginPath(); c.moveTo(cx - w * 0.07, top + h * 0.13); c.lineTo(cx + w * 0.07, top + h * 0.13); c.lineTo(cx, top + h * 0.3); c.closePath(); c.fill();   // the shirt
  c.fillStyle = '#7a1c22'; c.fillRect(cx - w * 0.015, top + h * 0.14, w * 0.03, h * 0.13);                                    // the tie
  c.fillStyle = '#1a1b1f'; c.fillRect(cx - w * 0.2, top + h * 0.84, w * 0.16, h * 0.03); c.fillRect(cx + w * 0.04, top + h * 0.84, w * 0.16, h * 0.03);   // shoes
  c.restore();
}

// ------------------------------------------------------------------ Hotel Theresa, 2082-2096 Adam Clayton Powell Jr Blvd
// 1913 (George and Edward Blum): white glazed brick with terracotta lattice spandrels, 12 storeys, a two-storey base of
// shops, an arcaded top storey under pedimented gables on both street faces (docs/notes/ar33-bid2.md, elevations
// theresa_n_e1548 / e1510 and theresa_e_e1560 / e1565).
// Heights (over the sidewalk): the shops 0-4.8, the second storey 5.0-9.3 (round-arched windows), a balustraded band
// 9.3-10.3, nine storeys of 3.35 m (sills at 11.2 + 3.35 k, 1.75 m windows), the arcaded top storey 40.45-46 (round
// arches), the gables to 52.5 over the 125th Street face and at both ends of the boulevard face, a parapet at 49.5 between.
const TH = {
  // (AR34 wave 2 b3: the windows 2.05 m, sills 0.3 m lower, heads where they were: elevation theresa_n_e1548 at u ~14,
  // the dark upper sashes 0.92-1.16 m long under heads at 13.0, 16.3... 29.6 m; theresa_crown_1535 read the windows
  // ~1.3 x the twin's 1.75 m).
  // three storeys within -0.07..+0.35 m of the twin's and the heads 0.43 / 0.54 / 0.92 m higher (rows read at 1:1 and
  // turned into heights on the front plane), the oriel's window head 0.82 m higher; cmp_theresa_ne (01548) reads the
  // windows 1.2-1.4 x the twin's in pixels: the heads up 0.45 m, the sills kept (wh 2.05 -> 2.5)
  base: 4.8, second: [5.0, 9.3], band: [9.3, 10.3], floor0: 10.3, fh: 3.35, nf: 9, sill: 0.6, wh: 2.5,
  top: [40.45, 46.0], parapet: 49.5, apex: 52.5,
  // the 125th Street face, u from the boulevard corner: window columns [u0, u1, kind] (n narrow, w wide / paired, c single)
  front: {
    cols: [[2.75, 3.25, 'n'], [3.85, 5.15, 'w'], [5.7, 6.1, 'n'], [7.0, 8.0, 'c'], [9.7, 10.95, 'c'], [12.5, 13.6, 'c'], [15.0, 15.45, 'n'], [16.35, 17.75, 'w'], [18.12, 18.45, 'n']],
    lattice: [[0.2, 2.55], [2.55, 6.35], [14.75, 18.61]],
    arcade: [[3.3, 5.5], [7.0, 8.3], [9.5, 11.3], [12.3, 13.3], [15.8, 18.0]],
    gables: [[0.0, 18.61, 52.5]],
    shops: [[0.4, 5.2, 'Fabulous Optical'], [5.6, 12.6, 'MAC'], [13.0, 18.2, 'Gold City']],
    mid: { a: 9.25, b: 11.4, c: 0.45, d: 0.8, wc: 10.325, ww: 1.05, nw: 0.4, k0: 7 },   // b3: two storeys on a corbel over a balcony (elevation theresa_n_e1548 at full size; was four)
  },
};
// the boulevard face (60.4 m, u from the 124th Street end): pavilions at both ends under gables, a regular centre
function acpFace(L) {
  const cols = [], lat = [], arc = [];
  const pav = (a, dir) => {   // a pavilion 15.5 m wide from u = a (dir +1) or ending at a (dir -1), as the 125th face's pattern
    const pat = [[0.9, 1.35, 'n'], [1.95, 3.35, 'w'], [3.9, 4.3, 'n'], [5.4, 6.4, 'c'], [7.5, 8.6, 'c'], [9.7, 10.7, 'c'], [11.8, 12.2, 'n'], [12.75, 14.15, 'w'], [14.7, 15.1, 'n']];
    for (const [p0, p1, k] of pat) cols.push(dir > 0 ? [a + p0, a + p1, k] : [a - p1, a - p0, k]);
    lat.push(dir > 0 ? [a + 0.5, a + 4.5] : [a - 4.5, a - 0.5], dir > 0 ? [a + 11.4, a + 15.4] : [a - 15.4, a - 11.4]);
    for (const [p0, p1] of [[1.9, 3.4], [5.3, 6.5], [7.4, 8.7], [9.6, 10.8], [12.7, 14.2]]) arc.push(dir > 0 ? [a + p0, a + p1] : [a - p1, a - p0]);
  };
  pav(0, 1); pav(L, -1);
  const c0 = 16.2, c1 = L - 16.2, n = Math.round((c1 - c0) / 2.25);
  for (let k = 0; k < n; k++) { const uc = c0 + ((k + 0.5) * (c1 - c0)) / n; cols.push([uc - 0.43, uc + 0.43, 'c']); arc.push([uc - 0.55, uc + 0.55]); }
  return { cols, lattice: lat, arcade: arc, gables: [[0.0, 15.8, 52.0], [L - 15.8, L, 52.5]], shops: [[L - 12, L - 0.4, 'Fabulous Optical'], [L - 24, L - 12.4, null], [2, 14, null], [14.4, 26, null]] };
}
// the terracotta lattice (a diamond trellis in relief, the Theresa's spandrel panels): a tileable canvas map and a
// normal map drawn from scratch, 1.0 x 0.5 m per repeat
let _lat = null;
function latticeMat() {
  if (_lat) return _lat;
  // AR34 wave 2: the bars and the ground were two flat paints (cream on grey-beige),
  // read as a print. Now a height field first (raised diamond bars with soft shoulders, a knob at every crossing, a boss
  // in every diamond), then the colour from it: the bars the wall's cream, the ground a warm shadow grey, darkened by a
  // cavity term (the ground near the bars), and the normal map from the same heights, steeper
  const W = 256, H = 128, hc = document.createElement('canvas'); hc.width = W; hc.height = H;
  const h = hc.getContext('2d');
  h.fillStyle = '#000'; h.fillRect(0, 0, W, H);
  h.strokeStyle = '#fff'; h.lineWidth = 16; h.lineCap = 'square';
  for (let k = -2; k <= 4; k++) { h.beginPath(); h.moveTo(k * 64 - 64, 0); h.lineTo(k * 64 + 64, H); h.stroke(); h.beginPath(); h.moveTo(k * 64 + 64, 0); h.lineTo(k * 64 - 64, H); h.stroke(); }
  h.fillStyle = '#fff';
  for (let m = -1; m <= 4; m++) for (const [x, y] of [[64 * m, 0], [64 * m + 32, 32], [64 * m, 64], [64 * m + 32, 96], [64 * m, 128]]) { h.beginPath(); h.arc(x, y, 12, 0, Math.PI * 2); h.fill(); }
  // in every diamond a small raised diamond of four square bosses (the real panels' inner motif; b3: the cross of bars
  // read as a stencilled x at plate scale)
  h.fillStyle = '#bcbcbc';
  for (let m = -1; m <= 4; m++) for (const [x, y] of [[64 * m, 32], [64 * m + 32, 64], [64 * m, 96], [64 * m + 32, 0], [64 * m + 32, 128]]) {
    for (const [dx, dy] of [[-5.5, 0], [5.5, 0], [0, -5.5], [0, 5.5]]) { h.save(); h.translate(x + dx, y + dy); h.rotate(Math.PI / 4); h.fillRect(-3.4, -3.4, 6.8, 6.8); h.restore(); }
  }
  const raw = h.getImageData(0, 0, W, H).data, hg = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) hg[i] = raw[i * 4] / 255;
  // soften the shoulders (two box passes, wrapping) and a wide blur for the cavity term
  const blur = (src, r) => { const t = new Float32Array(W * H), o = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let sm = 0; for (let d = -r; d <= r; d++) sm += src[y * W + ((x + d + W) % W)]; t[y * W + x] = sm / (2 * r + 1); }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let sm = 0; for (let d = -r; d <= r; d++) sm += t[(((y + d + H) % H)) * W + x]; o[y * W + x] = sm / (2 * r + 1); }
    return o; };
  const ht = blur(blur(hg, 1), 1), wide = blur(ht, 6);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d'), col = (c.createImageData && c.createImageData(W, H)) || { data: new Uint8ClampedArray(W * H * 4) };   // (node benches stub the canvas)
  const BAR = [236, 228, 210], GROUND = [178, 168, 149];   // the relief reads by its shading, the ground only a little darker (w2b's grey ground read as a mesh)
  // AR34 wave 2 b3 (the lead: "the lattice panels read stencilled"; the north face is in the sky's light): the shadow the
  // sky leaves under every bar and boss baked in (the ground just below a raised part darkened), so the relief reads
  const sky = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let o = 0; for (let d = 1; d <= 7; d++) o = Math.max(o, ht[((y - d + H) % H) * W + x] - ht[y * W + x] - 0.06 * d);
    sky[y * W + x] = Math.min(1, o * 1.7);
  }
  let sd = 11; const rnd = () => ((sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < W * H; i++) {
    const t = Math.min(1, Math.max(0, (ht[i] - 0.15) / 0.6)), cav = (1 - 0.42 * Math.max(0, wide[i] - ht[i])) * (1 - 0.42 * sky[i]), grit = 0.96 + rnd() * 0.06;
    for (let k = 0; k < 3; k++) col.data[i * 4 + k] = Math.min(255, (GROUND[k] + (BAR[k] - GROUND[k]) * t) * cav * grit);
    col.data[i * 4 + 3] = 255;
  }
  c.putImageData(col, 0, 0);
  // the normals: the height's slope, steep (the bars stand ~4 cm proud of the ground)
  const nc = document.createElement('canvas'); nc.width = W; nc.height = H;
  const nctx = nc.getContext('2d'), out = (nctx.createImageData && nctx.createImageData(W, H)) || { data: new Uint8ClampedArray(W * H * 4) }, hgt = (x, y) => ht[((y + H) % H) * W + ((x + W) % W)];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (hgt(x + 1, y) - hgt(x - 1, y)) * 4.0, dy = (hgt(x, y + 1) - hgt(x, y - 1)) * 4.0, l = Math.hypot(dx, dy, 1), o = (y * W + x) * 4;
    out.data[o] = (-dx / l * 0.5 + 0.5) * 255; out.data[o + 1] = (dy / l * 0.5 + 0.5) * 255; out.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[o + 3] = 255;
  }
  nctx.putImageData(out, 0, 0);
  const map = new THREE.CanvasTexture(cv), nrm = new THREE.CanvasTexture(nc);
  map.colorSpace = THREE.SRGBColorSpace;
  // wave 2: the real diamonds are ~0.4 m across, so one tile
  // covers 1.6 x 0.8 m (the panels' UVs run in metres across and half-metres up)
  for (const t of [map, nrm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.repeat.set(1 / 1.6, 1 / 1.6); }
  // AR34: rougher (a glossy panel mirrored the blue sky: cmp_theresa_ne_r7), and a day-only fill through the map (this
  // plain material misses the city's ambient terms the MATS walls get, so in shade it read blue-grey beside the brick)
  _lat = applyLightTrim(new THREE.MeshStandardMaterial({ map, normalMap: nrm, normalScale: new THREE.Vector2(1.5, 1.5), roughness: 0.74, metalness: 0.0, emissive: new THREE.Color('#7a756b'), emissiveMap: map }));   // the day fill kept (wave 2 tried #5a554c: the panels went grey against the MATS wall, w2c)
  const prevL = _lat.onBeforeCompile, prevLK = _lat.customProgramCacheKey;
  _lat.onBeforeCompile = (sh, r) => { prevL?.call(_lat, sh, r); sh.uniforms.b2N = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float b2N;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= mix(1.0, 0.0, b2N);'); };
  _lat.customProgramCacheKey = () => (prevLK ? prevLK.call(_lat) : '') + '|b2lat';
  return _lat;
}
// a quad in a face frame (u0..u1 x y0..y1 at w), UVs in repeats of the lattice tile, into a plain geometry list
function latQuad(list, u0, u1, y0, y1, w) {
  const p = [[u0, y0, w], [u1, y0, w], [u1, y1, w], [u0, y1, w]], t = [[u0, y0 * 2], [u1, y0 * 2], [u1, y1 * 2], [u0, y1 * 2]];
  for (const k of [0, 1, 2, 0, 2, 3]) { list.pos.push(...p[k]); list.uv.push(...t[k]); }
}
// AR34 wave 2 b3 (the lead: "the lattice panels read stencilled"): the diamond bars in relief over the painted lattice, on
// the texture's own lines (u + y and u - y on multiples of 0.4 m, latQuad's UVs), 0.09 m wide and 0.03 m proud, into the
// face's terracotta (kit.poly); kept hw inside the panel so the ends stay on it
function latBars(K, M, u0, u1, y0, y1, w) {
  const hw = 0.045, d = 0.03, r = Math.SQRT1_2, a0 = u0 + hw, a1 = u1 - hw, b0 = y0 + hw, b1 = y1 - hw;
  if (a1 - a0 < 0.1 || b1 - b0 < 0.1) return;
  for (const sg of [1, -1]) {
    const cMin = sg > 0 ? a0 - b1 : a0 + b0, cMax = sg > 0 ? a1 - b0 : a1 + b1, pu = r, py = -sg * r;
    for (let k = Math.ceil(cMin / 0.4); k * 0.4 <= cMax; k++) {
      const c = k * 0.4;
      // y where the line u = c + sg * y stays inside [a0, a1] x [b0, b1]
      const ya = Math.max(b0, sg > 0 ? a0 - c : c - a1), yb = Math.min(b1, sg > 0 ? a1 - c : c - a0);
      if (yb - ya < 0.03) continue;
      const A = [c + sg * ya, ya], B = [c + sg * yb, yb];
      const P = (q, s, z) => [q[0] + s * pu * hw, q[1] + s * py * hw, z];
      K.poly(M, [P(A, -1, w + d), P(B, -1, w + d), P(B, 1, w + d), P(A, 1, w + d)], [0, 0, 1]);
      K.poly(M, [P(A, 1, w), P(B, 1, w), P(B, 1, w + d), P(A, 1, w + d)], [pu, py, 0]);
      K.poly(M, [P(A, -1, w), P(A, -1, w + d), P(B, -1, w + d), P(B, -1, w)], [-pu, -py, 0]);
    }
  }
}
// a quad (4 face-frame points, wound to the normal n) into a plain geometry list with its UVs
function pushQuad(L, P, n, uv) {
  const [a, b, c] = P;
  const cx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), cy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), cz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const idx = cx * n[0] + cy * n[1] + cz * n[2] >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
  for (const k of idx) { L.pos.push(...P[k]); L.nor.push(...n); L.uv.push(...uv[k]); }
}
// a box in a slanted face frame G = { o: [u, w], d: [du, dw] } of the face kit: s along G from its origin, y up, t out of
// it (t < 0 into the wall); the faces listed in `sides` ('f' front, 'l' / 'r' the s ends, 't' top, 'b' bottom); metre UVs
function sBox(L, G, s0, s1, y0, y1, t0, t1, sides = 'flrtb') {
  const [du, dw] = G.d, nu = -dw, nw = du;
  const P = (s, y, t) => [G.o[0] + s * du + t * nu, y, G.o[1] + s * dw + t * nw];
  if (sides.includes('f')) pushQuad(L, [P(s0, y0, t1), P(s1, y0, t1), P(s1, y1, t1), P(s0, y1, t1)], [nu, 0, nw], [[s0, y0], [s1, y0], [s1, y1], [s0, y1]]);
  if (sides.includes('l')) pushQuad(L, [P(s0, y0, t0), P(s0, y0, t1), P(s0, y1, t1), P(s0, y1, t0)], [-du, 0, -dw], [[t0, y0], [t1, y0], [t1, y1], [t0, y1]]);
  if (sides.includes('r')) pushQuad(L, [P(s1, y0, t0), P(s1, y0, t1), P(s1, y1, t1), P(s1, y1, t0)], [du, 0, dw], [[t0, y0], [t1, y0], [t1, y1], [t0, y1]]);
  if (sides.includes('t')) pushQuad(L, [P(s0, y1, t0), P(s1, y1, t0), P(s1, y1, t1), P(s0, y1, t1)], [0, 1, 0], [[s0, t0], [s1, t0], [s1, t1], [s0, t1]]);
  if (sides.includes('b')) pushQuad(L, [P(s0, y0, t0), P(s1, y0, t0), P(s1, y0, t1), P(s0, y0, t1)], [0, -1, 0], [[s0, t0], [s1, t0], [s1, t1], [s0, t1]]);
}
// a ghost sign painted on brick: serif capitals on a transparent canvas, the paint worn through in places
let _ghost = null;
function ghostSign(lines, col) {
  if (_ghost) return _ghost;
  if (typeof document === 'undefined') return null;
  const W = 1024, H = 488, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, W, H); c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle';
  const fam = '"ar33 DMSerifDisplay", "DM Serif Display", Georgia, serif';
  lines.forEach((t, i) => {
    let px = 210; c.font = `400 ${px}px ${fam}`;
    const w = c.measureText(t).width; if (w > W * 0.94) { px *= (W * 0.94) / w; c.font = `400 ${px}px ${fam}`; }
    c.fillText(t, W / 2, H * (0.27 + i * 0.5));
  });
  // wear: the paint gone in flecks and along the mortar lines
  c.globalCompositeOperation = 'destination-out';
  let sd = 31; const rnd = () => ((sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(0,0,0,${(0.25 + rnd() * 0.6).toFixed(2)})`; c.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 9, 1 + rnd() * 5); }
  for (let y = 0; y < H; y += 9) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, y, W, 2); }
  c.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  _ghost = applyLightTrim(new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 }));
  return _ghost;
}
// the canted bays of the street faces: the window columns in threes (narrow, wide, narrow) are one three-sided bay
// 0.6 m deep, its cants at 45 degrees
function bayRuns(cols) {
  const bays = [], rest = [];
  for (let i = 0; i < cols.length; i++) {
    const [a, b, k] = cols[i];
    if (k === 'n' && cols[i + 1] && cols[i + 1][2] === 'w' && cols[i + 2] && cols[i + 2][2] === 'n') {
      const c1 = (a + b) / 2, c2 = (cols[i + 2][0] + cols[i + 2][1]) / 2, wide = cols[i + 1];
      bays.push({ a: Math.min(c1, c2) - 0.3, b: Math.max(c1, c2) + 0.3, c: 0.75, d: 0.95, wc: (wide[0] + wide[1]) / 2, ww: wide[1] - wide[0], nw: Math.max(b - a, cols[i + 2][1] - cols[i + 2][0]) });
      i += 2;
    } else rest.push(cols[i]);
  }
  return { bays, rest };
}
export function theresa(group, ctx, spec, frame) {
  const kit0 = frame.kit;
  // AR34 wave 2 b3 (MATS 01:11 / 01:18): the unit-varied cream glazed brick (each unit its own tone, sooted and replaced
  // units, grey joints), in the tint MATS computed wall (median 159/161/160, a neutral grey in shade) and
  // soiled (the lead: textured and soiled)
  const WB = kit0.mat('brick_glazed_cream', { tint: '#cbc9c0', dirt: 0.5 });
  const BUFF = kit0.mat('brick_tan', { tint: '#c9b48c', dirt: 0.45 });
  const SOOT = kit0.mat('brick_glazed_cream', { tint: '#a6a39b', dirt: 0.8 });   // b3: the soot in the corners beside the bays
  // (b3: the trims read off-white like the wall in theresa_crown_1535 (levelled), the twin's '#eadfc6' a yellow cream: the
  // set's cream base is in the render, so a near-neutral tint, as the Apollo's)
  const TCm = kit0.mat('terracotta_cream', { tint: '#dcdad3', dirt: 0.45 });
  const IRON = kit0.mat('steel_black', { tint: '#232426' });
  // (b3R: still a white crackle with `street: 0`: the bays take the kit's own window pane, as the flat windows (a vertex
  // colour per pane: reflectance, dirt, clarity; (1, 1, 1) the default))
  const GL = kit0.mat('int_winglass', {}), SASH = kit0.mat('alu_black', { tint: '#1f1f20' });
  const ROOM = kit0.mat('plain', { tint: '#4a4540', rough: 0.9 });   // b3: the stucco set read as a white speckle through the bays' panes (b3Q at 2x)
  const H = frame.h || 51.52;
  // the faces: the 125th Street front, the boulevard ('corner'), the two plain walls
  const faces = [];
  for (let i = 0; i < frame.ring.length; i++) {
    const f = frame.face(i); if (!f) continue;
    faces.push({ ...f, role: f.i === frame.front ? 'front' : null });
  }
  // the boulevard face by its orientation (outward normal pointing east), not the kit's 'corner' pick: the party wall
  // on the west is as long, and the kit takes the first of two equal edges unless the compile marked it blind; the
  // west wall (over 208's roof) is buff common brick with HOTEL THERESA painted at its north end
  for (const f of faces) if (f.role !== 'front' && f.kit.F && f.kit.F.N[0] > 0.7) f.role = 'acp';
  for (const f of faces) if (!f.role && f.kit.F && f.kit.F.N[0] < -0.7) f.role = 'west';
  // the sashes: black-painted 1/1 double hung (theresa_n_e1548 shows dark frames on every window)
  const T = { kind: 'dh', lights: '6/1', frame: { mat: 'wood_painted', tint: '#1e1d1c' }, reveal: 0.2, lintel: null, sillStone: { mat: 'terracotta_cream', tint: '#e6e1d4', h: 0.09, proj: 0.04 }, ac: 0.08, blinds: 0.5, lit: 0.4 };
  for (const f of faces) {
    const K = f.kit, L = f.L, lat = { pos: [], uv: [] };
    const P = f.role === 'front' ? TH.front : f.role === 'acp' ? acpFace(L) : null;
    const rows = []; for (let k = 0; k < TH.nf; k++) rows.push(TH.floor0 + TH.fh * k + TH.sill);
    if (!P) {
      // a plain wall of hotel windows over the neighbours (from the third floor up), wide and narrow sashes in turn
      // on the west wall, the parapet; the west wall's north pavilion rises into a gable like the street faces'
      const west = f.role === 'west', Wm = west ? BUFF : WB;
      const n = Math.max(1, Math.floor((L - 1.2) / (west ? 3.2 : 2.3))), holes = [], wins = [];
      for (let k = 0; k < n; k++) {
        const uc = 0.6 + ((k + 0.5) * (L - 1.2)) / n;
        const ops = west ? [[uc - 0.95, uc - 0.0], [uc + 0.42, uc + 0.95]] : [[uc - 0.48, uc + 0.48]];
        for (const [a, b] of ops) for (const ys of rows) { holes.push({ u0: a, u1: b, y0: ys, y1: ys + TH.wh }); wins.push([a, b, ys]); }
      }
      K.wall({ u0: 0, u1: L, y0: -0.4, y1: TH.parapet, holes, mat: Wm });
      for (const [a, b, ys] of wins) K.window({ ...T, blinds: 0.6, ac: west ? 0.05 : T.ac, sillStone: west ? { mat: 'stone_lime', tint: '#cfc6b2', h: 0.08, proj: 0.03 } : T.sillStone }, a, b, ys, ys + TH.wh, { wallMat: Wm });
      K.box(west ? BUFF : TCm, -0.05, L + 0.05, TH.parapet - 0.3, TH.parapet, -0.3, 0.08);
      if (west && L > 30) {
        const g0 = 0, g1 = 15.8, m = (g0 + g1) / 2, yb = TH.parapet, apex = 52.0;
        K.poly(BUFF, [[g0, yb, 0], [g1, yb, 0], [m, apex, 0]], [0, 0, 1]);
        K.poly(BUFF, [[g1, yb, -0.3], [g0, yb, -0.3], [m, apex, -0.3]], [0, 0, -1]);
        // HOTEL THERESA painted on the brick (a ghost sign in red-brown serif capitals), drawn from scratch on a canvas
        const gs = ghostSign(['HOTEL', 'THERESA'], '#bd4e2d');
        if (gs) { const g = new THREE.PlaneGeometry(8.4, 4.0); g.applyMatrix4(K.matrix(m, 46.6, 0.02)); const mesh = new THREE.Mesh(g, gs); mesh.name = 'bid2:theresa:ghostSign'; mesh.renderOrder = 2; group.add(mesh); }
        // two fire escapes down the middle of the wall: platforms with rails at every floor, the
        // ladders between them, a drop ladder over the neighbour's roof
        for (const fu of [L * 0.34, L * 0.44]) {
          for (let k = 0; k < TH.nf; k++) {
            const yf = TH.floor0 + TH.fh * k + 0.05;
            K.box(IRON, fu - 1.5, fu + 1.5, yf - 0.06, yf, 0.02, 1.2, { near: true });
            K.box(IRON, fu - 1.5, fu + 1.5, yf + 0.95, yf + 1.0, 1.15, 1.2, { near: true });
            K.box(IRON, fu - 1.5, fu + 1.5, yf + 0.45, yf + 0.48, 1.16, 1.19, { near: true });
            for (const e of [-1.5, 1.5]) K.box(IRON, fu + e - 0.025, fu + e + 0.025, yf, yf + 1.0, 0.02, 1.2, { near: true });
            if (k + 1 < TH.nf) for (const lx of [fu + 0.75, fu + 1.15]) K.box(IRON, lx - 0.02, lx + 0.02, yf, yf + TH.fh, 0.55 + (lx - fu - 0.75), 0.6 + (lx - fu - 0.75), { near: true });
          }
        }
      }
      continue;
    }
    const { bays, rest } = bayRuns(P.cols);
    // AR34: on 125th Street the centre column turns into a smaller canted oriel over the top
    // four storeys, on a stepped corbel
    if (P.mid) bays.push({ ...P.mid, k0: P.mid.k0 });
    const inBay = (u0, u1) => bays.some((B) => B.k0 === undefined && u1 > B.a - 0.05 && u0 < B.b + 0.05);
    const inMid = (a, b, k) => P.mid && k >= P.mid.k0 && b > P.mid.a && a < P.mid.b;
    // ---- the street faces: every flat opening as a hole in the white brick
    const holes = [], wins = [];
    for (const [a, b, k] of rest) for (const [ri, ys] of rows.entries()) {
      if (inMid(a, b, ri)) continue;
      if (k === 'w') { const m = (a + b) / 2; holes.push({ u0: a, u1: m - 0.06, y0: ys, y1: ys + TH.wh }, { u0: m + 0.06, u1: b, y0: ys, y1: ys + TH.wh }); wins.push([a, m - 0.06, ys], [m + 0.06, b, ys]); }
      else { holes.push({ u0: a, u1: b, y0: ys, y1: ys + TH.wh }); wins.push([a, b, ys]); }
    }
    // the arcade: tall openings (the round heads drawn as a stack of shrinking steps above)
    const arcY0 = TH.top[0] + 0.9, arcY1 = TH.top[1] - 0.7;
    for (const [a, b] of P.arcade) holes.push({ u0: a, u1: b, y0: arcY0, y1: arcY1 });
    // the second storey's round-arched windows at the shop bays (above the storefronts)
    const sec = [];
    for (let u = 1.2; u + 1.4 < L - 0.6; u += 2.6) sec.push([u, u + 1.6]);
    for (const [a, b] of sec) holes.push({ u0: a, u1: b, y0: TH.second[0] + 0.7, y1: TH.second[1] - 0.9 });
    // the shops: storefront holes 0..4.1
    for (const [a, b] of P.shops) holes.push({ u0: a, u1: b, y0: 0, y1: 4.1 });
    // the gable walls are separate polygons; the wall runs to the parapet
    K.wall({ u0: 0, u1: L, y0: -0.4, y1: TH.parapet, holes, mat: WB });
    for (const [a, b, ys] of wins) K.window(T, a, b, ys, ys + TH.wh, { wallMat: WB });
    // AR34: an ornamental terracotta panel under every flat window, between its sill and the
    // head of the window below
    for (const [a, b, ys] of wins) if (ys > TH.floor0 + 1) { latQuad(lat, a - 0.04, b + 0.04, ys - 0.72, ys - 0.15, 0.012); latBars(K, TCm, a - 0.04, b + 0.04, ys - 0.72, ys - 0.15, 0.012); }
    // ---- the canted bays: three faces a storey, glazed brick piers, lattice spandrels, 1/1 sashes in black frames, a
    // corbelled foot on the balcony band and a slab on top carrying the top storey's iron balcony
    const bl = { pos: [], nor: [], uv: [] }, gl = { pos: [], nor: [], uv: [] }, sl = { pos: [], nor: [], uv: [] }, rl = { pos: [], nor: [], uv: [] }, il = { pos: [], nor: [], uv: [] }, tl = { pos: [], nor: [], uv: [] };
    const latB = { pos: [], nor: [], uv: [] };
    for (const B of bays) {
      const k0 = B.k0 ?? 0, lc = Math.hypot(B.c, B.d), yA = TH.floor0 + TH.fh * k0, yB = TH.top[0];
      const G = [
        // (b3: the cants' room 0.05 m behind the glass: at -0.4 lc it fell behind the main wall's plane and the glazed brick
        // showed through the panes as a white crackle, theresa_crown_1535 b3P-b3S at 2x)
        { o: [B.a, 0], d: [B.c / lc, B.d / lc], L: lc, wc: lc / 2, ww: Math.min(B.nw + 0.1, lc - 0.3), room: -0.22, cant: true },
        // (b3: the bays' front windows are one wide sash, four lights across the upper sash: theresa_crown_1535 at full size)
        { o: [B.a + B.c, B.d], d: [1, 0], L: B.b - B.a - 2 * B.c, wc: B.wc - (B.a + B.c), ww: Math.min(B.ww, B.b - B.a - 2 * B.c - 0.5), pair: false, lights: B.k0 === undefined ? 4 : 3, room: -(B.d - 0.1) },
        { o: [B.b - B.c, B.d], d: [B.c / lc, -B.d / lc], L: lc, wc: lc / 2, ww: Math.min(B.nw + 0.1, lc - 0.3), room: -0.22, cant: true },
      ];
      for (const g of G) {
        const s0 = g.wc - g.ww / 2, s1 = g.wc + g.ww / 2, tw = -0.24;
        for (let k = k0; k < TH.nf; k++) {
          const yf = TH.floor0 + TH.fh * k, yn = yf + TH.fh, ys = rows[k], yh = ys + TH.wh;
          sBox(bl, g, -0.02, s0, yf, yn, tw, 0, 'fr');           // the piers (their window sides are the reveals)
          sBox(bl, g, s1, g.L + 0.02, yf, yn, tw, 0, 'fl');
          sBox(bl, g, s0, s1, yf, ys, tw, 0, 'ft');               // the spandrel under the sash, its top the sill's seat
          sBox(bl, g, s0, s1, yh, yn, tw, 0, 'fb');               // over the head
          sBox(tl, g, s0 - 0.05, s1 + 0.05, ys - 0.07, ys, tw, 0.045, 'ftb');   // the terracotta sill
          // the lattice panel from this head to the next sill (to the arcade's sill line over the top storey)
          const ly0 = yh + 0.12, ly1 = k + 1 < TH.nf ? rows[k + 1] - 0.14 : yB - 0.12;
          if (ly1 - ly0 > 0.3) sBox(latB, g, s0 - 0.12, s1 + 0.12, ly0, ly1, 0, 0.01, 'f');
          // the sash: glass, a black frame, the meeting rail, a centre mullion on the paired front window
          sBox(gl, g, s0, s1, ys, yh, -0.17, -0.165, 'f');
          sBox(rl, g, s0, s1, ys, yh, g.room - 0.02, g.room, 'f');   // the room behind (in front of the main wall)
          for (const [a0, a1, b0, b1] of [[s0, s0 + 0.06, ys, yh], [s1 - 0.06, s1, ys, yh], [s0, s1, ys, ys + 0.07], [s0, s1, yh - 0.06, yh], [s0, s1, ys + TH.wh * 0.5 - 0.03, ys + TH.wh * 0.5 + 0.03]]) sBox(sl, g, a0, a1, b0, b1, -0.19, -0.13, 'flrtb');
          if (g.pair) { const m = (s0 + s1) / 2; sBox(sl, g, m - 0.05, m + 0.05, ys, yh, -0.19, -0.12, 'flr'); }
          // the muntins: three lights across, two high
          const panes = g.pair ? [[s0, (s0 + s1) / 2 - 0.05], [(s0 + s1) / 2 + 0.05, s1]] : [[s0, s1]];
          for (const [p0, p1] of panes) {
            // (AR34 wave 2 b3: 6/1, the lights in the upper sash only: theresa_crown_1535 at full size)
            const nl = g.lights || 2;
            for (let q = 1; q < nl; q++) { const x = p0 + ((p1 - p0) * q) / nl; sBox(sl, g, x - 0.012, x + 0.012, ys + TH.wh * 0.5 + 0.03, yh - 0.06, -0.18, -0.15, 'f'); }
            for (const f of [0.75]) { const y = ys + TH.wh * f; sBox(sl, g, p0 + 0.06, p1 - 0.06, y - 0.012, y + 0.012, -0.18, -0.15, 'f'); }
          }
        }
      }
      if (B.k0 !== undefined) {
        // the oriel's stepped corbel under its first storey
        for (let j = 0; j < 3; j++) { const sh = j * 0.12; K.box(TCm, B.a + sh, B.b - sh, yA - 0.3 * (j + 1), yA - 0.3 * j, 0, B.d + 0.1 - j * 0.3, { near: j > 0 }); }   // b3: deeper, three steps back to the wall
        // b3 (elevation theresa_n_e1548 at full size: the oriel's soffit 32.6-33.6 m, under it the storey's window behind a
        // balcony, its slab 30.0-30.3 m and a solid front up to that window's sill, as wide as the oriel)
        const yS0 = TH.floor0 + TH.fh * (k0 - 1) - 0.4, yS1 = yS0 + 0.3, yP = yS1 + 0.75, dB = 0.55;
        K.box(TCm, B.a - 0.12, B.b + 0.12, yS0, yS1, 0, dB + 0.08);
        K.box(TCm, B.a - 0.06, B.b + 0.06, yS1, yP, dB - 0.12, dB);
        for (const e of [B.a - 0.06, B.b - 0.06]) K.box(TCm, e, e + 0.12, yS1, yP, 0, dB);
        K.box(TCm, B.a - 0.1, B.b + 0.1, yP, yP + 0.08, 0, dB + 0.05);
        for (const e of [B.a + 0.15, B.b - 0.45]) K.box(TCm, e, e + 0.3, yS0 - 0.55, yS0, 0, dB - 0.1, { near: true });   // its brackets
        latQuad(lat, B.a + 0.12, B.b - 0.12, yS1 + 0.1, yP - 0.1, dB + 0.004);
      }
      // b3: a band of sooted brick on the wall each side of a bay's root
      if (B.k0 === undefined) for (const [e0, e1] of [[B.a - 0.26, B.a + 0.01], [B.b - 0.01, B.b + 0.26]]) K.box(SOOT, e0, e1, yA, yB, -0.01, 0.004);
      // b3 (theresa_crown_1535 levelled at full size): a strip of the lattice ornament up the wall just outside each bay's
      if (B.k0 === undefined) for (const [e0, e1] of [[B.a - 0.62, B.a - 0.3], [B.b + 0.3, B.b + 0.62]]) {
        K.box(WB, e0, e1, yA, yB, 0, 0.06);
        latQuad(lat, e0 + 0.03, e1 - 0.03, yA + 0.2, yB - 0.2, 0.064); latBars(K, TCm, e0 + 0.03, e1 - 0.03, yA + 0.2, yB - 0.2, 0.064);
      }
      // the foot (a corbel band over the balcony band) and the slab on top, the balcony's iron rail on the slab's edge
      const plan = [[B.a, 0], [B.a + B.c, B.d], [B.b - B.c, B.d], [B.b, 0]];
      K.poly(TCm, plan.map(([u, w]) => [u, yA - 0.02, w]).reverse(), [0, -1, 0]);
      K.poly(TCm, plan.map(([u, w]) => [u, yB + 0.18, w + (w > 0 ? 0.12 : 0)]), [0, 1, 0]);
      for (const g of G) {
        sBox(tl, g, -0.08, g.L + 0.08, yA - 0.45, yA, -0.3, 0.12, 'fb');
        sBox(tl, g, -0.08, g.L + 0.08, yB, yB + 0.18, -0.3, 0.12, 'fb');
        sBox(il, g, -0.05, g.L + 0.05, yB + 1.12, yB + 1.16, 0.0, 0.05, 'ftb');
        for (let s = 0.0; s <= g.L + 0.01; s += 0.13) sBox(il, g, s - 0.012, s + 0.012, yB + 0.18, yB + 1.12, 0.01, 0.035, 'flr');
      }
    }
    const meshOf = (Ls, mat, name, shadow) => {
      if (!Ls.pos.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(Ls.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Ls.nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(Ls.uv, 2));
      if (mat.vertexColors) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(Ls.pos.length).fill(1), 3));
      g.applyMatrix4(K.matrix(0, 0, 0)); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat); m.name = `bid2:theresa:${name}`; m.castShadow = shadow; m.receiveShadow = true; group.add(m);
    };
    meshOf(bl, WB, 'bays', true); meshOf(tl, TCm, 'bayTrim', true); meshOf(gl, GL, 'bayGlass', false); meshOf(sl, SASH, 'baySash', false);
    meshOf(rl, ROOM, 'bayRooms', false); meshOf(il, IRON, 'bayRails', false);
    if (latB.pos.length) { for (let i = 1; i < latB.uv.length; i += 2) latB.uv[i] *= 2; meshOf(latB, latticeMat(), 'bayLattice', false); }
    for (const [a, b] of P.arcade) {
      K.window({ ...T, kind: 'fixed', mullions: 1, transom: 0.8, lights: '1/1', blinds: 0.3 }, a, b, arcY0, arcY1, { wallMat: WB });
      const m = (a + b) / 2, r = (b - a) / 2;
      for (let s = 0; s < 6; s++) {   // the round head: terracotta voussoir steps
        const t0 = (s / 6) * Math.PI / 2, t1 = ((s + 1) / 6) * Math.PI / 2, h0 = arcY1 + Math.sin(t0) * r * 0.9, h1 = arcY1 + Math.sin(t1) * r * 0.9;
        const du = Math.cos(t1) * r;
        K.box(TCm, m - du - 0.12, m + du + 0.12, h0, h1 + 0.05, 0, 0.1, { near: true });
      }
      if (inBay(a, b)) continue;   // the bays' slabs carry their own rails
      // the iron railing across the arcade's base
      K.box(IRON, a - 0.3, b + 0.3, TH.top[0] + 0.25, TH.top[0] + 0.3, 0.02, 1.1, { near: true });
      K.box(IRON, a - 0.3, b + 0.3, TH.top[0] + 1.25, TH.top[0] + 1.3, 1.02, 1.1, { near: true });
      for (let u = a - 0.3; u <= b + 0.3; u += 0.12) K.box(IRON, u - 0.012, u + 0.012, TH.top[0] + 0.3, TH.top[0] + 1.25, 1.04, 1.07, { near: true });
    }
    for (const [a, b] of sec) {
      K.window({ ...T, kind: 'arch', lights: '1/1' }, a, b, TH.second[0] + 0.7, TH.second[1] - 0.9, { wallMat: WB });
    }
    // the storefronts
    for (const [a, b, name] of P.shops) {
      K.storefront({ u0: a, u1: b, kind: 'store', h: 4.1, glazing: { bulkhead: 0.3, transom: 0.4, mullions: Math.max(1, Math.round((b - a) / 2.2)), frame: 'alu_black' },
        door: { u: 0.5, w: 1.1, kind: 'glass', recess: 0.8 }, gate: { kind: 'rolldown', box: true, color: '#8e9396' }, interior: name === 'MAC' ? 'pharmacy' : 'shop_phone', lit: 1.0 }, 4.1);
      if (name) K.sign({ kind: 'panel', text: name === 'MAC' ? 'M·A·C' : name.toUpperCase(), font: name === 'MAC' ? 'Montserrat-600' : 'Oswald-600',
        fg: name === 'Gold City' ? '#d4121c' : '#ffffff', bg: name === 'Gold City' ? '#f4efe4' : '#141414', u0: a + 0.3, u1: b - 0.3, y: 4.15, h: 0.7, lit: 'face', tracking: name === 'MAC' ? 0.3 : 0.04 });
    }
    // ---- bands: the shop cornice, the balustraded band at the third floor, the sill line under the arcade
    K.box(TCm, -0.05, L + 0.05, TH.base, TH.second[0], 0, 0.22);
    K.box(TCm, -0.08, L + 0.08, TH.band[0], TH.band[0] + 0.3, 0, 0.38);
    for (let u = 0.25; u < L - 0.2; u += 0.3) K.box(TCm, u - 0.05, u + 0.05, TH.band[0] + 0.3, TH.band[1] - 0.12, 0.12, 0.24, { near: true });
    K.box(TCm, -0.08, L + 0.08, TH.band[1] - 0.12, TH.band[1], 0.04, 0.34);
    K.box(TCm, -0.06, L + 0.06, TH.top[0] - 0.05, TH.top[0] + 0.25, 0, 0.28);
    K.box(TCm, -0.06, L + 0.06, TH.top[1], TH.top[1] + 0.3, 0, 0.3);
    // ---- the lattice spandrels on the flat wall: between the storeys in the pavilions, outside the bays
    for (const [a, b] of P.lattice) {
      for (const [la, lb] of [[a, b]].flatMap(([x0, x1]) => { let segs = [[x0, x1]]; for (const B of bays) segs = segs.flatMap(([p, q]) => (q <= B.a || p >= B.b ? [[p, q]] : [[p, B.a - 0.05], [B.b + 0.05, q]].filter(([m0, m1]) => m1 - m0 > 0.3))); return segs; })) {
        for (let k = 0; k < TH.nf; k++) {
          const y0 = rows[k] + TH.wh + 0.18, y1 = (k + 1 < TH.nf ? rows[k + 1] : TH.top[0]) - 0.12;
          // wave 2: the panel framed on all four sides
          if (y1 - y0 > 0.3) { latQuad(lat, la, lb, y0, y1, 0.012); latBars(K, TCm, la, lb, y0, y1, 0.012); K.box(TCm, la - 0.04, lb + 0.04, y0 - 0.06, y0, 0, 0.05, { near: true }); K.box(TCm, la - 0.04, lb + 0.04, y1, y1 + 0.06, 0, 0.05, { near: true });
            K.box(TCm, la - 0.04, la + 0.02, y0, y1, 0, 0.05, { near: true }); K.box(TCm, lb - 0.02, lb + 0.04, y0, y1, 0, 0.05, { near: true }); }
        }
        latQuad(lat, la, lb, TH.band[1] + 0.1, rows[0] - 0.12, 0.012); latBars(K, TCm, la, lb, TH.band[1] + 0.1, rows[0] - 0.12, 0.012);
      }
    }
    // ---- the gables: a pedimented wall with a coping, a big round arch and a rosette in the tympanum, finials
    for (const [g0, g1, apex] of P.gables) {
      const m = (g0 + g1) / 2, yb = TH.parapet;
      K.poly(WB, [[g0, yb, 0], [g1, yb, 0], [m, apex, 0]], [0, 0, 1]);
      K.poly(WB, [[g1, yb, -0.3], [g0, yb, -0.3], [m, apex, -0.3]], [0, 0, -1]);
      const slope = (apex - yb) / ((g1 - g0) / 2), cL = Math.hypot(1, slope);
      for (const [a, b, s] of [[g0, m, 1], [m, g1, -1]]) {   // the copings along the two slopes
        const ya = s > 0 ? yb : apex, ybb = s > 0 ? apex : yb, nU = -slope * s / cL, nY = 1 / cL;
        K.poly(TCm, [[a, ya + 0.02, 0.18], [b, ybb + 0.02, 0.18], [b, ybb + 0.02 - 0.32, 0.18], [a, ya + 0.02 - 0.32, 0.18]], [0, 0, 1]);
        K.poly(TCm, [[a, ya + 0.02, -0.34], [b, ybb + 0.02, -0.34], [b, ybb + 0.02, 0.18], [a, ya + 0.02, 0.18]], [nU, nY, 0]);
      }
      // AR34 wave 2, the lunettes: over the top storey's openings, a wide arch over the
      // middle three and a small one over each outer opening, each a moulded terracotta band on the sill line of the
      // pediment with a relief tympanum and a keystone (was one big arch over the whole gable)
      const ops = P.arcade.filter(([a, b]) => a >= g0 - 0.1 && b <= g1 + 0.1).sort((x, y) => x[0] - y[0]);
      const groups = ops.length >= 3 ? [ops[0], [ops[1][0], ops[ops.length - 2][1]], ops[ops.length - 1]] : ops;
      const ys = TH.top[1] + 0.3;
      for (const [ga, gb] of groups) {
        const c = (ga + gb) / 2, R = (gb - ga) / 2 + 0.3, nS = R > 2 ? 18 : 10;
        if (ys + R > yb + (apex - yb) * Math.max(0, 1 - Math.abs(c - m) / ((g1 - g0) / 2)) - 0.2) continue;   // keep under the raking coping
        for (let s = 0; s < nS; s++) {
          const t0 = (s / nS) * Math.PI, t1 = ((s + 1) / nS) * Math.PI;
          const u0 = c + Math.cos(t0) * R, u1 = c + Math.cos(t1) * R, y0 = ys + Math.sin(t0) * R, y1 = ys + Math.sin(t1) * R;
          K.box(TCm, Math.min(u0, u1) - 0.1, Math.max(u0, u1) + 0.1, Math.min(y0, y1) - 0.12, Math.max(y0, y1) + 0.12, 0, 0.16, { near: true });
          K.box(TCm, Math.min(u0, u1) - 0.05, Math.max(u0, u1) + 0.05, Math.min(y0, y1) - 0.05, Math.max(y0, y1) + 0.05, 0.16, 0.24, { near: true });   // the outer roll
        }
        latQuad(lat, c - R * 0.72, c + R * 0.72, ys + 0.05, ys + R * 0.66, 0.012);
        K.box(TCm, c - 0.22, c + 0.22, ys + R - 0.35, ys + R + 0.3, 0, 0.3, { near: true });   // the keystone
      }
      K.box(TCm, m - 0.35, m + 0.35, apex - 1.7, apex - 0.9, 0, 0.14);   // the cartouche under the apex
      for (const fu of [g0 + 0.35, g1 - 0.35]) { K.box(TCm, fu - 0.35, fu + 0.35, yb, yb + 1.1, -0.1, 0.25); K.box(TCm, fu - 0.2, fu + 0.2, yb + 1.1, yb + 1.9, -0.05, 0.15); }
    }
    // the parapet coping between the gables
    K.box(TCm, -0.08, L + 0.08, TH.parapet - 0.25, TH.parapet + 0.05, -0.3, 0.2);
    // ---- piers at the pavilion edges: slightly proud strips of glazed brick up the height (not inside a bay)
    // (b3, theresa_crown_1535 levelled at full size: these strips carry a narrow band of the lattice ornament up their
    // whole height, a zigzag at the pavilion edges)
    for (const [a, b] of P.lattice) for (const e of [a, b]) if (!inBay(e - 0.16, e + 0.16)) {
      K.box(WB, e - 0.16, e + 0.16, TH.band[1], TH.top[0], 0, 0.1);
      latQuad(lat, e - 0.12, e + 0.12, TH.band[1] + 0.2, TH.top[0] - 0.2, 0.104); latBars(K, TCm, e - 0.12, e + 0.12, TH.band[1] + 0.2, TH.top[0] - 0.2, 0.104);
    }
    // the lattice mesh of this face
    if (lat.pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(lat.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(lat.uv, 2));
      const nn = []; for (let q = 0; q < lat.pos.length / 3; q++) nn.push(0, 0, 1);
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
      g.applyMatrix4(K.matrix(0, 0, 0));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, latticeMat()); mesh.name = 'bid2:theresa:lattice'; mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  // the roof: a slab at the parapet line, the water tank and the bulkheads
  {
    const pts = frame.ring, y = frame.y0 + TH.parapet - 0.3;
    const sh = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], -p[1])));
    const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); g.translate(0, y, 0);   // shape (x, -z) -> world (x, y, z), facing up
    const mesh = new THREE.Mesh(g, kit0.mat('roof_membrane', { tint: '#5a5a5c' })); mesh.name = 'bid2:theresa:roof'; mesh.receiveShadow = true;
    group.add(mesh);
  }
  // two thirds of the way south, near the boulevard side; stair and elevator bulkheads (u from the boulevard corner)
  {
    const K = kit0, yR = TH.parapet - 0.3, BUFF2 = K.mat('brick_tan', { tint: '#c4ae86', dirt: 0.5 });
    K.box(BUFF2, 8.0, 12.0, yR, yR + 3.2, -10.0, -5.0);
    K.box(BUFF2, 12.5, 15.5, yR, yR + 2.8, -30.0, -26.0);
    const r = 2.3, h = 4.2, legs = 3.2, u = 6.0, w = -42.0;
    for (const [du, dw] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) K.box(IRON, u + du - 0.09, u + du + 0.09, yR, yR + legs, w + dw - 0.09, w + dw + 0.09);
    K.box(IRON, u - 2.4, u + 2.4, yR + legs - 0.16, yR + legs, w - 2.4, w + 2.4);
    const wood = K.mat('wood_painted', { tint: '#80583a', chips: 0 });
    const cyl = new THREE.CylinderGeometry(r, r, h, 24, 1, true); cyl.translate(0, yR + legs + h / 2, 0);
    const cone = new THREE.ConeGeometry(r * 1.05, r * 0.55, 24); cone.translate(0, yR + legs + h + r * 0.275, 0);
    for (const g of [cyl, cone]) { g.applyMatrix4(K.matrix(u, 0, w)); g.computeBoundingSphere(); const m = new THREE.Mesh(g, wood); m.name = 'bid2:theresa:tank'; m.castShadow = true; m.receiveShadow = true; group.add(m); }
  }
  void H; void ctx; void spec;
}

// ------------------------------------------------------------------ The Victoria, 233 W 125th St
// The 1917 Victoria Theater's terracotta front kept in front of the 2021 tower: u from the compiled west end, y over the sidewalk. The front: end pilasters,
// two giant Ionic columns (u 4.0, 10.8), three bays of bronze windows (6.0-8.4, 9.2-11.4), the entablature 11.7-13.2, a
// balustrade 13.2-14.0 with sculpture groups over the columns; the gold bulb marquee (3.1-5.1) and the VICTORIA blade
// (u 7.0-9.3, 4.8-16.8). Behind: the podium (15 m) on the front lot, the glass tower on the rear rectangle.
const VIC = {
  u0: 0.0, u1: 14.82, pil: [[0.0, 1.35], [13.45, 14.82]], col: [4.0, 10.8], colR: 0.46,
  bays: [[1.35, 3.45], [4.55, 10.25], [11.35, 13.45]], w1: [6.0, 8.4], w2: [9.2, 11.4], cap: [11.2, 11.75],
  ent: [11.75, 12.6], corn: [12.6, 13.2], bal: [13.2, 14.0], podium: 15.0,
  mq: { u0: 0.5, u1: 14.3, y0: 3.4, y1: 5.75, d: 3.6 },
  // AR34 b3 s2: the blade's cabinet top 16.8 -> 14.5;
  // balustrade but the letters' top ~85 px too high: the real crest is the taller part (~150 px against 100): the cabinet's
  // top 13.5, the crest 2.4 m and its finial 0.8 m (top 16.7 as c3)
  blade: { u0: 7.0, u1: 9.3, y0: 5.8, y1: 13.5, t: 0.45, off: 0.5, crest: 2.4 },
  // view (2026-10-01, imagery 10/11/2024, camera 470 m straight over (1835,-2980)), the glass
  // heights (over the base) from the elevation angles
  // in 01415 / 01440 / 01465 / 01296 and the two obliques: the glass front 82-89 (median ~88), the tower behind it
  // 101.5-102, the middle 93, the rear slab
  // 88-89, the plant penthouse ~106 with its two cooling towers. Faces: s (at n0, to the street), e (u1), n (n1), w (u0).
  // f: what clads each face (glass curtain wall, white panels with grey insets, dark glass, buff brick, grey plant).
  tower: { n0: -11.4, fh: 3.2 },
  mass: [
    // the south face's west ~3.8 m is a darker, greyer glass the full height: its own blocks
    { u0: -0.8, u1: 3.0, n0: -11.4, n1: -16.5, h: 88.5, f: { s: 'dark', w: 'glass' } },
    { u0: 3.0, u1: 15.0, n0: -11.4, n1: -16.5, h: 88.5, f: { s: 'glass', e: 'white' } },
    { u0: -0.8, u1: 3.0, n0: -16.5, n1: -31.6, h: 101.5, f: { s: 'dark', w: 'glass', n: 'glass' }, b: { s: 88.5 } },
    { u0: 3.0, u1: 15.0, n0: -16.5, n1: -31.6, h: 101.5, f: { s: 'glass', e: 'white', n: 'glass' }, b: { s: 88.5 } },
    { u0: -0.8, u1: 15.0, n0: -31.6, n1: -44.8, h: 93, f: { w: 'dark', e: 'dark' }, b: { w: 15, e: 15 } },
    { u0: -15.4, u1: 30.1, n0: -44.8, n1: -60.5, h: 88.5, f: { s: 'buff', e: 'buff', n: 'buff', w: 'band' } },   // its west face blank white panels in bands (bid2_vic_w)
    { u0: -1.6, u1: 15.1, n0: -39.2, n1: -53.0, h: 103.5, f: 'grey', b: 88 },
    // low fill beside the middle (dark low roofs in bid2_vic_top; their height is not measured)
    { u0: -15.4, u1: -0.8, n0: -30.3, n1: -44.8, h: 15, f: 'buff' },
    { u0: 15.0, u1: 30.1, n0: -30.3, n1: -44.8, h: 15, f: 'buff' },
  ],
  // the cooling towers on the penthouse (bid2_vic_top: two 4 m discs)
  towers: [[6.5, -48.3], [8.8, -42.9]],
};
// the Victoria's buff wings: one storey of one bay (1.6 x 3.55 m) per repeat, drawn from scratch: buff brick with a
// running bond, a dark double-hung window with a light frame and a stone sill, blinds at random heights per tile column
let _wing = null;
function wingMat() {
  if (_wing) return _wing;
  // AR34 wave 2: the slab is a light cream brick, its windows in pairs (each
  // ~1.1 m wide, a slim pier between, a broad pier between pairs), dark glass in light frames. One tile = one pair of one
  // storey, 3.2 x 3.2 m, 40 px/m
  const W = 128, H = 128, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  c.fillStyle = '#d8ccb1'; c.fillRect(0, 0, W, H);
  let sd = 5; const rnd = () => ((sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < H; y += 2.7) { c.fillStyle = 'rgba(150,130,100,0.28)'; c.fillRect(0, Math.round(y), W, 1); }
  for (let i = 0; i < 120; i++) { c.fillStyle = `rgba(${rnd() < 0.5 ? '170,150,115' : '235,226,205'},0.22)`; c.fillRect(rnd() * W, rnd() * H, 5, 3); }
  c.fillStyle = 'rgba(240,233,216,0.55)'; c.fillRect(0, 0, 10, H); c.fillRect(W - 10, 0, 10, H);   // the broad pier's lighter face
  for (const wx of [18, 68]) {
    const ww = 44, wy = 34, wh = 64;   // a 1.1 x 1.6 m opening, its sill 0.75 m over the floor (y down from the top)
    c.fillStyle = '#ece6d8'; c.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);   // the frame
    const g = c.createLinearGradient(0, wy, 0, wy + wh); g.addColorStop(0, '#46535d'); g.addColorStop(1, '#222a30');
    c.fillStyle = g; c.fillRect(wx, wy, ww, wh);
    c.fillStyle = '#dcd5c6'; c.fillRect(wx, wy + wh * 0.62, ww, 2);   // the transom bar
    if (rnd() < 0.7) { c.fillStyle = 'rgba(228,222,206,0.85)'; c.fillRect(wx, wy, ww, 8 + rnd() * 26); }   // a blind
    c.fillStyle = '#e2dccd'; c.fillRect(wx - 4, wy + wh + 3, ww + 8, 4);   // the sill
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  t.repeat.set(1 / 3.2, 1 / 3.2);   // AR34 wave 2: the slab's storeys (88.5 m, 28 floors), one pair per 3.2 m
  _wing = applyLightTrim(new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0 }));
  return _wing;
}
let _vicAtlas = null;
function vicAtlas() {
  if (_vicAtlas) return _vicAtlas;
  const W = 1024, H = 1024, mk = (night) => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    c.fillStyle = night ? '#000' : '#00000000'; if (night) c.fillRect(0, 0, W, H); else c.clearRect(0, 0, W, H);
    // the blade face (0,0)-(200,1000): a dark bronze field, gold rim with bulbs, the letters in bulbs
    const bulb = (x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
    c.fillStyle = night ? '#120b04' : '#3a2c1c'; c.fillRect(0, 0, 200, 1000);
    c.fillStyle = night ? '#fff1c4' : '#e8d9a8';
    if (night) { c.shadowColor = '#ffcf70'; c.shadowBlur = 8; }
    for (let y = 10; y < 1000; y += 18) { bulb(10, y, 4.5); bulb(190, y, 4.5); }
    for (let x = 10; x <= 190; x += 18) { bulb(x, 10, 4.5); bulb(x, 990, 4.5); }
    const L = 'VICTORIA', step = 960 / L.length;
    c.font = `800 ${Math.round(step * 0.8)}px "ar33 Montserrat", "Arial Black", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < L.length; i++) {
      // a letter of bulbs: draw the glyph into a mask, then dots where the mask is set
      const m = document.createElement('canvas'); m.width = 160; m.height = Math.round(step); const mc = m.getContext('2d');
      mc.fillStyle = '#fff'; mc.font = c.font; mc.textAlign = 'center'; mc.textBaseline = 'middle'; mc.fillText(L[i], 80, step / 2);
      const d = mc.getImageData(0, 0, m.width, m.height).data;
      for (let yy = 4; yy < m.height; yy += 11) for (let xx = 4; xx < m.width; xx += 11) if (d[(yy * m.width + xx) * 4 + 3] > 128) bulb(20 + xx, 20 + i * step + yy, 3.8);
    }
    c.shadowBlur = 0;
    // the marquee's front board (0,1000..) -> cell 2: (220, 0)-(1020, 160): a dark field, a gold frame, bulbs top and bottom
    c.fillStyle = night ? '#0a0c16' : '#262c45'; c.fillRect(220, 0, 800, 160);
    c.fillStyle = night ? '#fff0c0' : '#e2d3a2'; if (night) { c.shadowColor = '#ffcf70'; c.shadowBlur = 6; }
    for (let x = 228; x < 1016; x += 14) { bulb(x, 8, 3.2); bulb(x, 152, 3.2); }
    c.shadowBlur = 0;
    // cell 3: the marquee's soffit with rows of bulbs (220, 180)-(1020, 420)
    c.fillStyle = night ? '#1a1206' : '#8a7040'; c.fillRect(220, 180, 800, 240);
    c.fillStyle = night ? '#fff3cc' : '#efe2b8'; if (night) { c.shadowColor = '#ffd680'; c.shadowBlur = 7; }
    for (let r = 0; r < 6; r++) for (let x = 236; x < 1010; x += 22) bulb(x, 200 + r * 40, 4.2);
    c.shadowBlur = 0;
    // cell 4: the marquee's gold fascia with bulbs (220, 440)-(1020, 500)
    c.fillStyle = night ? '#1e1406' : '#b08a3e'; c.fillRect(220, 440, 800, 60);
    c.fillStyle = night ? '#fff0c0' : '#f2e6c0'; if (night) { c.shadowColor = '#ffcf70'; c.shadowBlur = 6; }
    for (let x = 228; x < 1016; x += 12) bulb(x, 470, 3.2);
    c.shadowBlur = 0;
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  };
  const day = mk(false), night = mk(true);
  const m = applyLightTrim(new THREE.MeshStandardMaterial({ map: day, emissiveMap: night, emissive: 0xffffff, roughness: 0.45, metalness: 0.3, transparent: false }));
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => { prev?.call(m, sh, r); sh.uniforms.b2N = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float b2N;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= mix(0.12, 1.3, b2N);'); };
  m.customProgramCacheKey = () => 'b2vic';
  _vicAtlas = m;
  return m;
}
const VC = { blade: [0, 0, 200, 1000], front: [220, 0, 800, 160], soffit: [220, 180, 800, 240], fascia: [220, 440, 800, 60] };
function vicQuad(list, cell, pts) {   // pts: 4 corners (u, y, w) bottom-left, bottom-right, top-right, top-left
  const [cx, cy, cw, ch] = VC[cell], U = (a) => a / 1024, V = (a) => 1 - a / 1024;
  const t = [[U(cx), V(cy + ch)], [U(cx + cw), V(cy + ch)], [U(cx + cw), V(cy)], [U(cx), V(cy)]];
  for (const k of [0, 1, 2, 0, 2, 3]) { list.pos.push(...pts[k]); list.uv.push(...t[k]); }
}
// (BF36) the hotel's revolving door in the entrance's recess (u 7.4, the door 1.4 m back): a brass drum (canopy and floor ring), two
// curved frosted side walls in brass bands between brass posts, four glazed wings in brass rails round a brass post, set at 45 degrees
function victoriaRevolver(group, frame, brass, glass, frost) {
  const uc = 7.4, zc = -0.72, R = 0.68, top = 2.36, place = frame.matrix(0, 0, 0);
  const B = [], G = [], Fr = [];
  B.push([new THREE.CylinderGeometry(R + 0.05, R + 0.05, 0.3, 28), mtx(uc, top + 0.15, zc)]);
  B.push([new THREE.CylinderGeometry(R + 0.03, R + 0.03, 0.04, 28), mtx(uc, 0.02, zc)]);
  B.push([new THREE.CylinderGeometry(0.045, 0.045, top, 10), mtx(uc, top / 2, zc)]);
  for (const t0 of [Math.PI / 2 - 0.78, (3 * Math.PI) / 2 - 0.78]) {
    Fr.push([new THREE.CylinderGeometry(R, R, top - 0.04, 12, 1, true, t0, 1.56), mtx(uc, top / 2 + 0.02, zc)]);
    for (const y of [0.35, 1.2, 2.05]) B.push([new THREE.CylinderGeometry(R + 0.012, R + 0.012, 0.035, 12, 1, true, t0, 1.56), mtx(uc, y, zc)]);
    for (const t of [t0, t0 + 1.56]) B.push([new THREE.CylinderGeometry(0.028, 0.028, top, 8), mtx(uc + R * Math.sin(t), top / 2, zc + R * Math.cos(t))]);
  }
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, cx = uc + (R / 2) * Math.cos(a), cz = zc - (R / 2) * Math.sin(a);
    G.push([new THREE.BoxGeometry(R - 0.1, top - 0.24, 0.02), mtx(cx, top / 2, cz, 1, 1, 1, a)]);
    for (const y of [0.1, top - 0.1, 1.05]) B.push([new THREE.BoxGeometry(R - 0.06, y === 1.05 ? 0.05 : 0.09, 0.05), mtx(cx, y, cz, 1, 1, 1, a)]);
    B.push([new THREE.BoxGeometry(0.05, top - 0.12, 0.05), mtx(uc + (R - 0.04) * Math.cos(a), top / 2, zc - (R - 0.04) * Math.sin(a), 1, 1, 1, a)]);
  }
  for (const [list, mat, name] of [[B, brass, 'bid2:victoria:revolverBrass'], [G, glass, 'bid2:victoria:revolverGlass'], [Fr, frost, 'bid2:victoria:revolverFrost']]) {
    if (!list.length) continue;
    const pos = [], nor = [], uv = [];
    for (const [g0, mm] of list) {
      const g = g0.index ? g0.toNonIndexed() : g0; g.applyMatrix4(place.clone().multiply(mm));
      pos.push(...g.getAttribute('position').array); nor.push(...g.getAttribute('normal').array); uv.push(...g.getAttribute('uv').array);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.name = name; m.castShadow = list === B; m.receiveShadow = true; group.add(m);
  }
}
export function victoria(group, ctx, spec, frame) {
  const K = frame.kit, V = VIC;
  const TC = K.mat('terracotta_cream', { tint: '#dcd6c9', dirt: 0.35 });
  const TCd = K.mat('terracotta_cream', { tint: '#cfc8b9', dirt: 0.45 });
  const BRZ = K.mat('alu_bronze', { tint: '#4a3a28' });
  const GOLD = K.mat('alu_bronze', { tint: '#b08a3e' });
  const near = { near: true };
  // ---- the front wall with its openings, the storefronts and the hotel entrance
  const holes = [{ u0: 1.5, u1: 5.3, y0: 0, y1: 3.1 }, { u0: 5.7, u1: 9.1, y0: 0, y1: 3.1 }, { u0: 9.5, u1: 13.3, y0: 0, y1: 3.1 }];
  for (const [a, b] of V.bays) for (const [y0, y1] of [V.w1, V.w2]) holes.push({ u0: a + 0.25, u1: b - 0.25, y0, y1 });
  K.wall({ u0: V.u0, u1: V.u1, y0: -0.4, y1: V.bal[0], holes, mat: TC });
  K.storefront({ u0: 1.5, u1: 5.3, kind: 'store', h: 3.1, glazing: { bulkhead: 0.3, transom: 0.3, mullions: 2, frame: 'alu_bronze' }, door: { u: 0.5, w: 1.0, recess: 0.6 }, gate: { kind: 'none' }, interior: 'shop_clothing' }, 3.1);
  K.storefront({ u0: 5.7, u1: 9.1, kind: 'store', h: 3.1, glazing: { bulkhead: 0.1, transom: 0.4, mullions: 2, frame: 'alu_bronze' }, door: { u: 0.5, w: 2.0, kind: 'double', recess: 1.4 }, gate: { kind: 'none' },
    interior: BF36 ? { kind: 'empty', tone: '#4a3a2e', lit: 0.5 } : 'bank' }, 3.1);
  if (BF36) victoriaRevolver(group, frame, K.mat('alu_bronze', { tint: '#b8923f' }), K.mat('glass_grey'), K.mat('panel_grey', { tint: '#ddd6c6', dirt: 0.1 }));
  K.storefront({ u0: 9.5, u1: 13.3, kind: 'store', h: 3.1, glazing: { bulkhead: 0.3, transom: 0.3, mullions: 2, frame: 'alu_bronze' }, door: { u: 0.4, w: 1.0, recess: 0.6 }, gate: { kind: 'none' }, interior: 'shop_clothing' }, 3.1);
  // ---- the pilasters, the columns, the bays
  for (const [a, b] of V.pil) {
    K.box(TC, a, b, -0.02, V.cap[0], 0, 0.16);
    K.box(TC, a - 0.05, b + 0.05, V.cap[0], V.cap[1], 0, 0.26);
    for (let y = 0.4; y < V.cap[0]; y += 0.4) K.box(TCd, a + 0.02, b - 0.02, y - 0.01, y + 0.01, 0.16, 0.166, near);
  }
  const round = [];
  for (const c of V.col) {
    K.box(TC, c - 0.62, c + 0.62, 5.1, 5.5, 0, 0.9);                                 // the plinth
    round.push([new THREE.CylinderGeometry(V.colR * 0.86, V.colR, V.cap[0] - 5.6, 20), mtx(c, (5.6 + V.cap[0]) / 2, 0.5)]);
    round.push([new THREE.CylinderGeometry(V.colR * 1.12, V.colR * 1.12, 0.12, 20), mtx(c, 5.56, 0.5)]);
    K.box(TC, c - 0.62, c + 0.62, V.cap[1] - 0.16, V.cap[1], 0, 1.0);                 // the abacus
    K.box(TC, c - 0.48, c + 0.48, V.cap[0], V.cap[1] - 0.16, 0.05, 0.95);             // the echinus
    for (const s of [-1, 1]) round.push([new THREE.CylinderGeometry(0.17, 0.17, 0.95, 14).rotateX(Math.PI / 2), mtx(c + s * 0.52, V.cap[0] + 0.2, 0.5)]);
  }
  const Tw = { kind: 'fixed', mullions: 2, transom: 0.5, frame: 'alu_bronze', reveal: 0.3, lintel: null, sillStone: null, blinds: 0.3, lit: 0.5 };
  for (const [a, b] of V.bays) {
    K.window(Tw, a + 0.25, b - 0.25, V.w1[0], V.w1[1], { wallMat: TC });
    K.window(Tw, a + 0.25, b - 0.25, V.w2[0], V.w2[1], { wallMat: TC });
    K.box(TCd, a + 0.35, b - 0.35, V.w1[1] + 0.12, V.w2[0] - 0.12, -0.03, 0.0);        // the spandrel panel
    for (let u = a + 0.6; u < b - 0.5; u += 0.55) K.box(TCd, u - 0.14, u + 0.14, V.w1[1] + 0.3, V.w2[0] - 0.3, 0, 0.05, near);
    K.box(TC, a, b, V.w1[1], V.w1[1] + 0.12, 0, 0.06); K.box(TC, a, b, V.w2[0] - 0.12, V.w2[0], 0, 0.08);
  }
  // ---- the entablature, the cornice, the balustrade with sculpture groups over the columns
  K.box(TC, V.u0 - 0.05, V.u1 + 0.05, V.ent[0], V.ent[0] + 0.25, 0, 0.2);
  K.box(TCd, V.u0, V.u1, V.ent[0] + 0.25, V.ent[1], 0, 0.12);
  for (let u = V.u0 + 0.3; u < V.u1 - 0.2; u += 0.6) K.box(TC, u - 0.18, u + 0.18, V.ent[0] + 0.33, V.ent[1] - 0.1, 0.12, 0.16, near);   // the frieze ornament
  K.extrude(TC, [[0, V.corn[0]], [0.25, V.corn[0]], [0.35, V.corn[0] + 0.15], [0.7, V.corn[0] + 0.35], [0.75, V.corn[1] - 0.05], [0.8, V.corn[1]], [0, V.corn[1]]], V.u0 - 0.12, V.u1 + 0.12);
  for (let u = V.u0 + 0.2; u < V.u1 - 0.1; u += 0.28) K.box(TCd, u - 0.06, u + 0.06, V.corn[0] + 0.05, V.corn[0] + 0.14, 0.2, 0.32, near);   // dentils
  K.box(TC, V.u0, V.u1, V.bal[0], V.bal[0] + 0.15, 0.05, 0.6);
  K.box(TC, V.u0 - 0.02, V.u1 + 0.02, V.bal[1] - 0.14, V.bal[1], 0.03, 0.62);
  const dies = [0.67, V.col[0], 7.41, V.col[1], 14.13];
  for (const d of dies) K.box(TC, d - 0.33, d + 0.33, V.bal[0] + 0.15, V.bal[1] - 0.14, 0.06, 0.6);
  for (let u = 0.3; u < V.u1 - 0.2; u += 0.25) {
    if (dies.some((d) => Math.abs(u - d) < 0.45)) continue;
    round.push([new THREE.CylinderGeometry(0.05, 0.065, V.bal[1] - V.bal[0] - 0.29, 8), mtx(u, (V.bal[0] + 0.15 + V.bal[1] - 0.14) / 2, 0.33)]);
  }
  for (const c of V.col) {   // the sculpture groups: a pedestal, two dolphins as curved masses, a shield
    K.box(TC, c - 0.55, c + 0.55, V.bal[1], V.bal[1] + 0.45, 0.0, 0.7);
    round.push([new THREE.TorusGeometry(0.42, 0.14, 8, 14, Math.PI * 1.2), mtx(c - 0.3, V.bal[1] + 0.85, 0.35, 1, 1, 1, 0, 0, 0.3)]);
    round.push([new THREE.TorusGeometry(0.42, 0.14, 8, 14, Math.PI * 1.2), mtx(c + 0.3, V.bal[1] + 0.85, 0.35, -1, 1, 1, 0, 0, -0.3)]);
    K.box(TCd, c - 0.25, c + 0.25, V.bal[1] + 0.45, V.bal[1] + 1.2, 0.3, 0.45);
  }
  // ---- the gold bulb marquee: bowed in plan, a navy board between bulb borders over a gold valance
  // whose bottom edge bows down 0.65 m at the middle (4.05 m at the ends, 3.4 m at the centre), gold finial posts at both
  // ends, a soffit of bulb rows on gold ribs back to the wall
  const Q = V.mq, sg = { pos: [], uv: [] }, gq = { pos: [], nor: [], uv: [] };
  const yEnd = 4.05, sag = 0.75, yb0 = 4.25, bow = 1.1, um = (Q.u0 + Q.u1) / 2, hw = (Q.u1 - Q.u0) / 2;   // bow and sag fitted by eye to N233w_sq (r16)
  const cosT = (u) => Math.cos(Math.max(-1, Math.min(1, (u - um) / hw)) * Math.PI / 2);
  const yBot = (u) => yEnd - sag * cosT(u), wOf = (u) => Q.d + bow * cosT(u);
  for (const ue of [Q.u0, Q.u1]) {   // the finial posts, a cap and a knob on each
    K.box(GOLD, ue - 0.15, ue + 0.15, yEnd - 0.35, Q.y1 + 0.55, Q.d - 0.35, Q.d + 0.06);
    K.box(GOLD, ue - 0.2, ue + 0.2, Q.y1 + 0.55, Q.y1 + 0.65, Q.d - 0.4, Q.d + 0.11, near);
    K.box(GOLD, ue - 0.09, ue + 0.09, Q.y1 + 0.65, Q.y1 + 0.95, Q.d - 0.23, Q.d - 0.05, near);
  }
  {
    const N = 36, U = (a) => a / 1024, Vv = (a) => 1 - a / 1024;
    const cellT = (cell, i, n) => { const [cx, cy, cw, ch] = VC[cell], x0 = U(cx + (cw * i) / n), x1 = U(cx + (cw * (i + 1)) / n); return [[x0, Vv(cy + ch)], [x1, Vv(cy + ch)], [x1, Vv(cy)], [x0, Vv(cy)]]; };
    const quadS = (pts, t) => { for (const k of [0, 1, 2, 0, 2, 3]) { sg.pos.push(...pts[k]); sg.uv.push(...t[k]); } };
    for (let i = 0; i < N; i++) {
      const ua = Q.u0 + ((Q.u1 - Q.u0) * i) / N, ub = Q.u0 + ((Q.u1 - Q.u0) * (i + 1)) / N, ya = yBot(ua), yb = yBot(ub), wa = wOf(ua), wb = wOf(ub);
      K.box(GOLD, ua, ub, yEnd, Q.y1, 0, Math.min(wa, wb) - 0.03, { skip: 0 });                 // the body
      // the board, the gold strip over it, the top, the valance with its bulbs, the soffit
      quadS([[ua, yb0, wa + 0.012], [ub, yb0, wb + 0.012], [ub, Q.y1 - 0.08, wb + 0.012], [ua, Q.y1 - 0.08, wa + 0.012]], cellT('front', i, N));
      quadS([[ua, ya, wa + 0.012], [ub, yb, wb + 0.012], [ub, yb0, wb + 0.012], [ua, yb0, wa + 0.012]], cellT('soffit', i, N));   // rows of lamps
      quadS([[ua, yEnd - 0.012, 0.1], [ub, yEnd - 0.012, 0.1], [ub, yEnd - 0.012, wb - 0.15], [ua, yEnd - 0.012, wa - 0.15]], cellT('soffit', i, N));
      pushQuad(gq, [[ua, Q.y1 - 0.08, wa + 0.008], [ub, Q.y1 - 0.08, wb + 0.008], [ub, Q.y1, wb + 0.008], [ua, Q.y1, wa + 0.008]], [0, 0, 1], [[ua, 0], [ub, 0], [ub, 0.08], [ua, 0.08]]);
      pushQuad(gq, [[ua, Q.y1, 0], [ub, Q.y1, 0], [ub, Q.y1, wb + 0.008], [ua, Q.y1, wa + 0.008]], [0, 1, 0], [[ua, 0], [ub, 0], [ub, wb], [ua, wa]]);
      pushQuad(gq, [[ua, yb0, wa + 0.008], [ub, yb0, wb + 0.008], [ub, yb, wb + 0.008], [ua, ya, wa + 0.008]], [0, 0, 1], [[ua, yb0], [ub, yb0], [ub, yb], [ua, ya]]);
      pushQuad(gq, [[ua, ya, wa - 0.15], [ub, yb, wb - 0.15], [ub, yb, wb + 0.01], [ua, ya, wa + 0.01]], [0, -1, 0], [[ua, wa - 0.15], [ub, wb - 0.15], [ub, wb], [ua, wa]]);
      pushQuad(gq, [[ua, ya, wa - 0.15], [ub, yb, wb - 0.15], [ub, yEnd, wb - 0.15], [ua, yEnd, wa - 0.15]], [0, 0, -1], [[ua, ya], [ub, yb], [ub, yEnd], [ua, yEnd]]);
    }
    for (let u = Q.u0 + 0.9; u < Q.u1 - 0.5; u += 1.3) K.box(GOLD, u - 0.035, u + 0.035, yEnd - 0.1, yEnd, 0.15, wOf(u) - 0.2, near);   // the soffit's ribs
  }
  if (gq.pos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(gq.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(gq.nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(gq.uv, 2));
    g.applyMatrix4(frame.matrix(0, 0, 0)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, GOLD); m.name = 'bid2:victoria:valance'; m.castShadow = true; m.receiveShadow = true; group.add(m);
  }
  // ---- the VICTORIA blade: a vertical cabinet on the centre bay, both faces lettered in bulbs, a crest
  {
    const B = V.blade, uc = (B.u0 + B.u1) / 2, z0 = B.off, z1 = B.off + (B.u1 - B.u0);
    K.box(GOLD, uc - B.t / 2, uc + B.t / 2, B.y0, B.y1, z0, z1);
    const cr = B.crest || 1.4;
    K.box(GOLD, uc - B.t / 2 - 0.08, uc + B.t / 2 + 0.08, B.y1, B.y1 + cr, z0 + 0.2, z1 - 0.2);
    K.box(GOLD, uc - 0.12, uc + 0.12, B.y1 + cr, B.y1 + cr + 0.8, (z0 + z1) / 2 - 0.3, (z0 + z1) / 2 + 0.3);
    for (const s of [-1, 1]) {
      const u = uc + s * (B.t / 2 + 0.012);
      // AR34: the west face reads wall-to-street, the east face street-to-wall, both wound outward (the two lists were
      // swapped: plate r7/N219w_sq showed the east face's letters mirrored)
      vicQuad(sg, 'blade', s < 0 ? [[u, B.y0 + 0.1, z0 + 0.05], [u, B.y0 + 0.1, z1 - 0.05], [u, B.y1 - 0.1, z1 - 0.05], [u, B.y1 - 0.1, z0 + 0.05]]
        : [[u, B.y0 + 0.1, z1 - 0.05], [u, B.y0 + 0.1, z0 + 0.05], [u, B.y1 - 0.1, z0 + 0.05], [u, B.y1 - 0.1, z1 - 0.05]]);
    }
    for (const ay of [B.y0 + 1.0, B.y1 - 1.2]) K.box(K.mat('steel_black', {}), uc - 0.06, uc + 0.06, ay - 0.06, ay + 0.06, 0.1, z0 + 0.05);
  }
  const place = frame.matrix(0, 0, 0);
  if (sg.pos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(sg.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(sg.uv, 2));
    g.computeVertexNormals(); g.applyMatrix4(place); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, vicAtlas()); m.name = 'bid2:victoria:signs'; group.add(m);
  }
  if (round.length) {
    const pos = [], nor = [], uv = [];
    for (const [g0, mm] of round) {
      const g = (g0.index ? g0.toNonIndexed() : g0.clone()); g.applyMatrix4(place.clone().multiply(mm));
      pos.push(...g.getAttribute('position').array); nor.push(...g.getAttribute('normal').array); uv.push(...g.getAttribute('uv').array);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, TC); m.name = 'bid2:victoria:round'; m.castShadow = true; m.receiveShadow = true; group.add(m);
  }
  // ---- the massing: the podium over the front lot up to the glass tower's face, then the measured blocks (V.mass)
  {
    const P0 = frame.p0, U = frame.u, N = frame.n, y0 = frame.y0, W = (u, n) => [P0[0] + U[0] * u + N[0] * n, P0[1] + U[1] * u + N[1] * n];
    const T = V.tower, dn = (p) => (p[0] - P0[0]) * N[0] + (p[1] - P0[1]) * N[1];
    const pod = frame.ring.filter((p) => dn(p) > T.n0 + 0.5);
    if (pod.length >= 3) {
      // the podium polygon: the ring's vertices in front of the tower, closed along the tower's front line
      const R = frame.ring, out = [];
      for (let i = 0; i < R.length; i++) {
        const a = R[i], b = R[(i + 1) % R.length], da = dn(a) - (T.n0 + 0.01), db = dn(b) - (T.n0 + 0.01);
        if (da >= 0) out.push(a);
        if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      }
      const g = prismGeomV(out, y0 - 0.3, y0 + V.podium, [W(0, 0), W(V.u1, 0)]);
      const m = new THREE.Mesh(g, K.mat('brick_buff', { tint: '#cfc6b3', dirt: 0.35 })); m.name = 'bid2:victoria:podium'; m.castShadow = true; m.receiveShadow = true; group.add(m);
    }
    // the blocks: per face one cladding; the curtain wall gets mullions every 1.5 m, a dark spandrel and a light sill line
    // per storey; the white panel faces grey insets two storeys tall; one merged mesh per material
    const PIT = 1.5;   // the mullion pitch
    const MAT = {
      // the glass reads light grey-blue (median rgb 186/200/214 in N233w_up), white sheers behind it on most
      // floors. AR34 wave 2 b3 (MATS 01:24, the lead's review): vision glass, the rooms and their shades drawn behind it
      // (MATS's glass_vision: the storeys on the floor lines below, a shade cell per mullion bay); the darker west strip
      // and the middle in the greyer vision glass (they took the main glass since w2f: a dark-bodied tower glass rendered
      // white then; MATS made the pane's parameters uniforms at 01:11); the spandrels a reflective glass over a dark box
      // (b3e: with the street in the reflection the panes mirrored the invented masonry opposite as orange patches from the
      // lead's crane t5BladeCrane_2; an 88 m tower over its neighbours mirrors the sky: `street: 0`, as before)
      // AR34 batch 3 session 2 (MATS 03:19 / 03:33): the vision panes take one material per face (one program, uniforms
      // each) with `bayAt` on the face's first fin, so the shade cells start at the fins; white sheers in most bays;
      glassF: (at) => pbrMaterial('glass_vision', { tint: '#fbf8f2', storey: [T.fh, 4.0], bay: PIT, bayAt: at, blinds: 0.1, sheers: 0.45, f0: 0.36, trans: 0.85, seed: 233, street: 0 }),
      darkF: (at) => pbrMaterial('glass_vision_grey', { tint: '#c4cacb', storey: [T.fh, 4.0], bay: PIT, bayAt: at, blinds: 0.3, sheers: 0.3, seed: 91, street: 0 }),
      spg: pbrMaterial('glass_tower_grey', { tint: '#b9c2c7', body: '#56616a', street: 0 }),   // b3b: body #3b444b read a dark band
      white: K.mat('alu_white', { tint: '#e3e3dd', dirt: 0.3 }), grey: K.mat('panel_grey', { tint: '#8b8d8d', dirt: 0.4 }),
      band: K.mat('alu_white', { tint: '#e6e6e1', dirt: 0.25 }),
      buff: wingMat(), inset: K.mat('panel_grey', { tint: '#9a9fa2', dirt: 0.2 }),
      // the coping band dark anodised; the fins and the floor lines' caps a light silver grey
      mull: K.mat('alu_clear', { tint: '#5d656b' }), fin: K.mat('alu_clear', { tint: '#a9b0b4' }), cap: K.mat('alu_clear', { tint: '#c4c9cb' }),
      roof: K.mat('roof_membrane', { tint: '#a39f97', dirt: 0.6 }),   // light grey-beige, rust-stained (bid2_vic_top)
    };
    const lists = new Map(), LS = (k) => { if (!lists.has(k)) lists.set(k, { pos: [], nor: [], uv: [] }); return lists.get(k); };
    // a quad of four world points (bottom-left, bottom-right, top-right, top-left), wound to face n3
    const quad4 = (k, P, n3, uv) => {
      const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], e2 = [P[3][0] - P[0][0], P[3][1] - P[0][1], P[3][2] - P[0][2]];
      const cr = (e1[1] * e2[2] - e1[2] * e2[1]) * n3[0] + (e1[2] * e2[0] - e1[0] * e2[2]) * n3[1] + (e1[0] * e2[1] - e1[1] * e2[0]) * n3[2];
      const o = LS(k);
      for (const i of cr > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) { o.pos.push(...P[i]); o.nor.push(...n3); o.uv.push(...uv[i]); }
    };
    const hs = (i, j, q) => { const x = Math.sin(i * 127.1 + j * 311.7 + q * 74.7) * 43758.5453; return x - Math.floor(x); };
    // AR34 wave 2 b3: the curtain wall in its parts. Floor lines every T.fh from 4.0 m over the sidewalk on one
    // grid for every block; at each a spandrel band (0.6 m of reflective glass over a dark box) between two light transom
    // caps standing 0.05 m proud (front, top and bottom faces: the floor lines catch the sky and shade under them); a
    // vision pane per storey and mullion bay, its normal tilted up to ~1.1 deg either way; mullion fins
    // 0.07 m wide standing 0.16 m proud with their sides drawn. The fins stand where the face's own u (the vision glass's
    // shade cells) is a multiple of PIT, so a fin never cuts a shade. Fin and cap sizes, not measured.
    const FMAT = new Map();
    let faceN = 0;
    const curtain = (kind, a, b, yb, yt, nrm, L) => {
      const Aw = W(a[0], a[1]), Bw = W(b[0], b[1]);
      const t = [(Bw[0] - Aw[0]) / L, (Bw[1] - Aw[1]) / L], nW = [U[0] * nrm[0] + N[0] * nrm[1], U[1] * nrm[0] + N[1] * nrm[1]];
      const Tg = [-nW[1], nW[0]], uA = Aw[0] * Tg[0] + Aw[1] * Tg[1], sg = t[0] * Tg[0] + t[1] * Tg[1] > 0 ? 1 : -1;
      const ph = (((-sg * uA) % PIT) + PIT) % PIT, ms = [];
      for (let s = ph; s < L - 0.3; s += PIT) if (s > 0.3) ms.push(s);
      const P = (s, y, w) => [Aw[0] + t[0] * s + nW[0] * w, y0 + y, Aw[1] + t[1] * s + nW[1] * w];
      const n3 = [nW[0], 0, nW[1]], tt = [t[0], 0, t[1]], yTop = yt - 0.5;
      const lines = [];
      for (let y = 4.0 + Math.max(0, Math.ceil((yb - 4.0) / T.fh - 1e-6)) * T.fh; y < yTop - 0.3; y += T.fh) lines.push(y);
      const zones = []; let z0 = yb;
      for (const y of lines) { if (y - 0.68 - z0 > 0.25) zones.push([z0, y - 0.68]); z0 = y + 0.05; }
      if (yTop - z0 > 0.25) zones.push([z0, yTop]);
      const cuts = [0, ...ms, L];
      // this face's panes: their own material, the shade cells laid from the first fin (MATS's bayAt, world x / z)
      const fk = kind + '#' + (faceN++), f0p = P(ms.length ? ms[0] : 0, 0, 0);
      FMAT.set(fk, MAT[kind + 'F']([f0p[0], f0p[2]]));
      for (let i = 0; i + 1 < cuts.length; i++) for (const [za, zb] of zones) {
        const s0 = cuts[i], s1 = cuts[i + 1], j = Math.round(za * 10), tu = (hs(i, j, 1) - 0.5) * 0.038, ty = (hs(i, j, 2) - 0.5) * 0.03;
        const nn = [n3[0] + tt[0] * tu, ty, n3[2] + tt[2] * tu], nl = Math.hypot(nn[0], nn[1], nn[2]);
        quad4(fk, [P(s0, za, 0), P(s1, za, 0), P(s1, zb, 0), P(s0, zb, 0)], [nn[0] / nl, nn[1] / nl, nn[2] / nl], [[s0, za], [s1, za], [s1, zb], [s0, zb]]);
      }
      for (const y of lines) {
        const ya = Math.max(yb, y - 0.68);
        quad4('spg', [P(0, ya + 0.04, 0.005), P(L, ya + 0.04, 0.005), P(L, y - 0.01, 0.005), P(0, y - 0.01, 0.005)], n3, [[0, ya], [L, ya], [L, y], [0, y]]);
        for (const [c0, c1] of [[y - 0.01, y + 0.05], [ya, ya + 0.04]]) {
          quad4('cap', [P(0, c0, 0.05), P(L, c0, 0.05), P(L, c1, 0.05), P(0, c1, 0.05)], n3, [[0, c0], [L, c0], [L, c1], [0, c1]]);
          quad4('cap', [P(0, c1, 0), P(L, c1, 0), P(L, c1, 0.05), P(0, c1, 0.05)], [0, 1, 0], [[0, 0], [L, 0], [L, 0.05], [0, 0.05]]);
          quad4('cap', [P(0, c0, 0), P(L, c0, 0), P(L, c0, 0.05), P(0, c0, 0.05)], [0, -1, 0], [[0, 0], [L, 0], [L, 0.05], [0, 0.05]]);
        }
      }
      const fw = 0.035, fd = 0.16;
      for (const s of ms) {
        quad4('fin', [P(s - fw, yb, fd), P(s + fw, yb, fd), P(s + fw, yTop, fd), P(s - fw, yTop, fd)], n3, [[0, yb], [0.07, yb], [0.07, yTop], [0, yTop]]);
        quad4('fin', [P(s - fw, yb, 0), P(s - fw, yb, fd), P(s - fw, yTop, fd), P(s - fw, yTop, 0)], [-tt[0], 0, -tt[2]], [[0, yb], [fd, yb], [fd, yTop], [0, yTop]]);
        quad4('fin', [P(s + fw, yb, fd), P(s + fw, yb, 0), P(s + fw, yTop, 0), P(s + fw, yTop, fd)], tt, [[0, yb], [fd, yb], [fd, yTop], [0, yTop]]);
      }
    };
    // a quad between plan points a, b (frame u, n) from yA to yB (over the base), pushed `off` along the outward normal
    const face = (k, a, b, yA, yB, nrm, off = 0, sA = 0) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), A = W(a[0] + nrm[0] * off, a[1] + nrm[1] * off), B = W(b[0] + nrm[0] * off, b[1] + nrm[1] * off);
      const nx = U[0] * nrm[0] + N[0] * nrm[1], nz = U[1] * nrm[0] + N[1] * nrm[1];
      const P = [[A[0], y0 + yA, A[1]], [B[0], y0 + yA, B[1]], [B[0], y0 + yB, B[1]], [A[0], y0 + yB, A[1]]], uv = [[sA, yA], [sA + L, yA], [sA + L, yB], [sA, yB]];
      const cr = ((P[1][1] - P[0][1]) * (P[2][2] - P[0][2]) - (P[1][2] - P[0][2]) * (P[2][1] - P[0][1])) * nx + ((P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[1][1] - P[0][1]) * (P[2][0] - P[0][0])) * nz;
      const o = LS(k);
      for (const i of cr > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) { o.pos.push(...P[i]); o.nor.push(nx, 0, nz); o.uv.push(...uv[i]); }
    };
    const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    for (const B of V.mass) {
      const c = [[B.u0, B.n0], [B.u1, B.n0], [B.u1, B.n1], [B.u0, B.n1]];
      const sides = { s: [c[0], c[1], [0, 1]], e: [c[1], c[2], [1, 0]], n: [c[2], c[3], [0, -1]], w: [c[3], c[0], [-1, 0]] };
      for (const [sd, [a, b, nrm]] of Object.entries(sides)) {
        const kind = typeof B.f === 'string' ? B.f : B.f[sd];
        if (!kind) continue;
        const yb = typeof B.b === 'number' ? B.b : (B.b && B.b[sd]) || -0.3, yt = B.h, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (kind === 'glass' || kind === 'dark') {
          curtain(kind, a, b, yb, yt, nrm, L);
          face('mull', a, b, yt - 0.5, yt, nrm, 0.04);    // the coping band
          continue;
        }
        face(kind, a, b, yb, yt, nrm);
        if (kind === 'band') {
          // blank white panels, a grey joint every three storeys
          for (let y = Math.max(yb, 0) + 3 * T.fh; y < yt - 1.0; y += 3 * T.fh) face('inset', a, b, y - 0.12, y + 0.12, nrm, 0.02);
        } else if (kind === 'white') {
          // grey insets in columns, two storeys tall, between white strips
          const nc = Math.max(1, Math.round(L / 4.6)), cw = L / nc;
          for (let k = 0; k < nc; k++) for (let y = Math.max(yb, 6.0); y + 2 * T.fh <= yt - 1.0; y += 2 * T.fh)
            face('inset', lerp2(a, b, (k * cw + 0.55) / L), lerp2(a, b, ((k + 1) * cw - 0.55) / L), y + 0.3, y + 2 * T.fh - 0.3, nrm, 0.02);
        }
      }
      // the roof
      const r = c.map((q) => W(q[0], q[1])), o = LS('roof'), Y = y0 + B.h + 0.02;
      for (const i of [0, 2, 1, 0, 3, 2]) { o.pos.push(r[i][0], Y, r[i][1]); o.nor.push(0, 1, 0); o.uv.push(r[i][0], r[i][1]); }
    }
    for (const [k, o] of lists) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(o.nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
      // the roof triangles were pushed in one fixed order: wind each to face up
      if (k === 'roof') { const p = o.pos, q = o.uv; for (let i = 0, t = 0; i < p.length; i += 9, t += 6) { const cy = (p[i + 5] - p[i + 2]) * (p[i + 6] - p[i]) - (p[i + 3] - p[i]) * (p[i + 8] - p[i + 2]); if (cy < 0) { for (let j = 0; j < 3; j++) { const x = p[i + 3 + j]; p[i + 3 + j] = p[i + 6 + j]; p[i + 6 + j] = x; } for (let j = 0; j < 2; j++) { const x = q[t + 2 + j]; q[t + 2 + j] = q[t + 4 + j]; q[t + 4 + j] = x; } } } g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(q, 2)); }
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, FMAT.get(k) || MAT[k]); m.name = 'bid2:victoria:' + k; m.castShadow = !['mull', 'inset', 'fin', 'cap', 'spg'].includes(k); m.receiveShadow = true; group.add(m);
    }
    // the cooling towers on the plant penthouse (bid2_vic_top: two discs ~4 m across, timber-brown)
    const rust = K.mat('wood_painted', { tint: '#8b5a3a', chips: 0 }), pent = V.mass.find((q) => q.f === 'grey');
    for (const [u, n] of V.towers || []) {
      const cy = new THREE.CylinderGeometry(2.0, 2.1, 2.6, 24); cy.translate(0, pent.h + 1.3, 0); cy.applyMatrix4(K.matrix(u, 0, n)); cy.computeBoundingSphere();
      const m = new THREE.Mesh(cy, rust); m.name = 'bid2:victoria:coolingTower'; m.castShadow = true; m.receiveShadow = true; group.add(m);
    }
  }
  void ctx; void spec;
}
// a prism over a polygon (walls facing out by the winding, the flat roof); the wall along [skipA, skipB] is left out
function prismGeomV(pts, y0, y1, skipSeg) {
  const pos = [], nor = [], uv = [];
  let area = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area > 0 ? 1 : -1, on = (p, q) => Math.abs((q[0] - p[0]) * (skipSeg[1][1] - skipSeg[0][1]) - (q[1] - p[1]) * (skipSeg[1][0] - skipSeg[0][0])) < 0.5;
  let run = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dA = Math.hypot(a[0] - skipSeg[0][0], a[1] - skipSeg[0][1]) + Math.hypot(a[0] - skipSeg[1][0], a[1] - skipSeg[1][1]);
    const segL = Math.hypot(skipSeg[1][0] - skipSeg[0][0], skipSeg[1][1] - skipSeg[0][1]);
    if (L < 1e-3 || (Math.abs(dA - segL) < 0.3 && on(a, b))) { run += L; continue; }
    const nx = (sgn * (b[1] - a[1])) / L, nz = (-sgn * (b[0] - a[0])) / L;
    const P = [[a[0], y0, a[1], run, y0], [b[0], y0, b[1], run + L, y0], [b[0], y1, b[1], run + L, y1], [a[0], y1, a[1], run, y1]];
    const tri = (p, q, r) => { const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
      const ok = (uy * vz - uz * vy) * nx + (ux * vy - uy * vx) * nz > 0; for (const v of ok ? [p, q, r] : [p, r, q]) { pos.push(v[0], v[1], v[2]); nor.push(nx, 0, nz); uv.push(v[3], v[4]); } };
    tri(P[0], P[1], P[2]); tri(P[0], P[2], P[3]); run += L;
  }
  const tris = THREE.ShapeUtils.triangulateShape(pts.map((p) => new THREE.Vector2(p[0], p[1])), []);
  for (const t of tris) { const v = t.map((k) => pts[k]); const up = (v[1][1] - v[0][1]) * (v[2][0] - v[0][0]) - (v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) > 0;
    for (const p of up ? v : [v[0], v[2], v[1]]) { pos.push(p[0], y1, p[1]); nor.push(0, 1, 0); uv.push(p[0], p[1]); } }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ Blumstein's, 230 W 125th St (1922, Robert D. Kohn)
// Built after the kit's faces (custom with: 'kit'): the green cast-iron work of the three bays (elevation s230_e1465,
// u from the east end): colonettes between the windows over three storeys (8.9-21.9), ornate spandrels (12.2-13.8,
// 17.0-18.6), the sill band, the projecting canopy cornice over them (21.9-23.3) with brackets and a cresting, the
// broad piers carried up past the parapet into finials (29.6-31).
const BL = { bays: [[1.8, 7.8, 3], [9.8, 20.2, 5], [21.6, 25.8, 2]], piers: [[0.6, 1.8], [7.8, 9.8], [20.2, 21.6], [25.8, 26.45]], y0: 8.9, y1: 21.9, sp: [[12.2, 13.8], [17.0, 18.6]], can: [21.9, 23.3], par: 29.6 };
export function blumstein(group, ctx, spec, frame) {
  const K = frame.kit;
  const G = K.mat('metal_painted', { tint: '#3e7b66', dirt: 0.35, chips: 0.08 }), Gd = K.mat('metal_painted', { tint: '#2f5f4f', dirt: 0.4, chips: 0.08 });   // AR34: low chips (0.6 reads as marble)
  const ST = K.mat('stone_lime', { tint: '#b9ae98', dirt: 0.55 });
  const near = { near: true };
  for (const [a, b, n] of BL.bays) {
    const w = (b - a) / n;
    for (let k = 0; k <= n; k++) {   // the colonettes: a shaft with a base and a capital at each storey
      const u = a + k * w, hw = k === 0 || k === n ? 0.12 : 0.1;
      K.box(G, u - hw, u + hw, BL.y0, BL.y1, 0, 0.16);
      for (const [s0, s1] of [[BL.y0, BL.sp[0][0]], [BL.sp[0][1], BL.sp[1][0]], [BL.sp[1][1], BL.y1]]) {
        K.box(G, u - hw - 0.05, u + hw + 0.05, s0, s0 + 0.18, 0, 0.21, near);
        K.box(G, u - hw - 0.06, u + hw + 0.06, s1 - 0.22, s1, 0, 0.22, near);
      }
    }
    K.box(G, a - 0.05, b + 0.05, BL.y0 - 0.35, BL.y0, 0, 0.18);                          // the sill band
    for (const [s0, s1] of BL.sp) {   // the spandrels: a panel, a moulded top and bottom, rosettes and lozenges
      K.box(Gd, a, b, s0, s1, -0.02, 0.05);
      K.box(G, a, b, s0, s0 + 0.12, 0, 0.12); K.box(G, a, b, s1 - 0.12, s1, 0, 0.12);
      for (let k = 0; k < n; k++) {
        const c = a + (k + 0.5) * w, ym = (s0 + s1) / 2;
        K.box(G, c - 0.28, c + 0.28, ym - 0.28, ym + 0.28, 0.05, 0.12, near);
        K.box(G, c - 0.12, c + 0.12, ym - 0.12, ym + 0.12, 0.12, 0.18, near);
        for (const d of [-0.55, 0.55]) K.box(G, c + d - 0.08, c + d + 0.08, ym - 0.2, ym + 0.2, 0.05, 0.1, near);
      }
    }
    // the canopy cornice: a hood on brackets, a cresting on top
    K.extrude(G, [[0, BL.can[0]], [0.2, BL.can[0] + 0.05], [0.9, BL.can[0] + 0.55], [0.95, BL.can[0] + 0.62], [0.95, BL.can[1] - 0.25], [0.7, BL.can[1] - 0.1], [0, BL.can[1]]], a - 0.1, b + 0.1);
    for (let u = a + 0.3; u < b - 0.2; u += 0.9) K.box(Gd, u - 0.06, u + 0.06, BL.can[0] - 0.5, BL.can[0] + 0.5, 0, 0.75, near);
    for (let u = a + 0.15; u < b; u += 0.3) K.box(G, u - 0.04, u + 0.04, BL.can[1], BL.can[1] + 0.28, 0.25, 0.33, near);
  }
  for (const [a, b] of BL.piers) {   // the piers carried up, their finials over the parapet
    K.box(ST, a, b, 8.8, BL.par, 0, 0.1);
    if (b - a > 1) {
      K.box(ST, a + 0.1, b - 0.1, BL.par, BL.par + 0.9, -0.2, 0.12);
      K.box(ST, a + 0.3, b - 0.3, BL.par + 0.9, BL.par + 1.5, -0.1, 0.05);
      K.box(ST, a + 0.45, b - 0.45, BL.par + 1.5, BL.par + 1.8, -0.05, 0.0);
    }
  }
  void group; void ctx; void spec;
}

// ------------------------------------------------------------------ Jimmy Jazz, 239 W 125th St
// After the kit's face (custom with: 'kit'): the copper-coloured folded perforated panels: a grid of low
// pyramids 1.22 x 0.61 m over the front above the store, the glass band (u 1.5-13.6, y 6.25-8.95) left open.
export function jimmyjazz(group, ctx, spec, frame) {
  const K = frame.kit, L = frame.L;
  const CU = K.mat('alu_bronze', { tint: '#b8784f', dirt: 0.2 }), CUd = K.mat('alu_bronze', { tint: '#8a5638', dirt: 0.3 });
  const cw = 1.22, ch = 0.61, top = (frame.h || 10.1) - 0.1;
  for (let u = 0.15; u + cw <= L - 0.1; u += cw) for (let y = 4.45; y + ch <= top; y += ch) {
    if (u + cw > 1.45 && u < 13.65 && y + ch > 6.2 && y < 9.0) continue;
    const a = [u, y, 0.02], b = [u + cw, y, 0.02], c = [u + cw, y + ch, 0.02], d = [u, y + ch, 0.02], p = [u + cw * 0.5, y + ch * 0.42, 0.24];
    // four facets; the upper one in the darker (perforated, shadowed) tone
    K.poly(CU, [a, b, p], [0, -0.7, 0.7]);
    K.poly(CU, [b, c, p], [0.4, 0, 0.9]);
    K.poly(CUd, [c, d, p], [0, 0.55, 0.83]);
    K.poly(CU, [d, a, p], [-0.4, 0, 0.9]);
  }
  // the five spotlights on arms over the glass band
  const BLK = K.mat('steel_black', {});
  for (let k = 0; k < 5; k++) { const u = 2.2 + k * 2.75; K.box(BLK, u - 0.03, u + 0.03, 9.2, 9.35, 0.05, 0.75, { near: true }); K.box(BLK, u - 0.14, u + 0.14, 8.9, 9.2, 0.62, 0.9, { near: true }); }
  void group; void ctx; void spec;
}
