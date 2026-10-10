// AR33 procedural texture sets (made here from nothing, so CC0 by construction): returns
// { W, H, alb, nrm, orm, roughMean } raw buffers (RGB sRGB, RGB OpenGL normal, RGBA linear: occlusion, roughness,
// metalness, height). Image row 0 is the TOP of the surface (the runtime samples t upward from the bottom row).
//   terracotta  glazed architectural terracotta ashlar: 610 x 305 mm units in running bond (2 x 2 units a repeat),
//               5 mm joints, pillowed faces, fine crazing, unit-to-unit glaze tone, iron speckle
//   tactile     a detectable warning surface: truncated domes (23 mm base, 11.5 mm top, 5 mm high) on a 61 mm square grid
const enc = (v) => { v = Math.min(1, Math.max(0, v)); return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); };
const dec = (h) => [1, 3, 5].map((i) => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
// deterministic hash / value noise (tileable over the period p)
const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; h ^= h >>> 16; return (h >>> 0) / 4294967296; };
function vnoise(x, y, px, py, s) {   // periodic in x over px cells, y over py
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const m = (a, n) => ((a % n) + n) % n;
  const h = (a, b) => hash(m(a, px), m(b, py), s);
  return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
}
function fbm(x, y, px, py, s, oct = 4) { let a = 0, w = 0.5, f = 1, t = 0; for (let o = 0; o < oct; o++) { a += w * vnoise(x * f, y * f, px * f, py * f, s + o * 17); t += w; w *= 0.5; f *= 2; } return a / t; }
// periodic Worley distance-to-edge (F2 - F1) for crazing, cells per period n
function worleyEdge(x, y, n, s) {
  const xi = Math.floor(x), yi = Math.floor(y); let d1 = 9, d2 = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j, wx = ((cx % n) + n) % n, wy = ((cy % n) + n) % n;
    const px = cx + hash(wx, wy, s), py = cy + hash(wx, wy, s + 9);
    const d = Math.hypot(px - x, py - y);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return d2 - d1;
}
function toNormal(h, W, H, k) {   // h: Float32 heights in metres; k: 1 / texel size in metres; OpenGL (+Y = up the image)
  const nrm = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const at = (a, b) => h[(((b % H) + H) % H) * W + (((a % W) + W) % W)];
    const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * k, dy = (at(x, y - 1) - at(x, y + 1)) * 0.5 * k;   // row 0 = top: up = y - 1
    const l = Math.hypot(dx, dy, 1), i = (y * W + x) * 3;
    nrm[i] = Math.round((-dx / l + 1) * 127.5); nrm[i + 1] = Math.round((-dy / l + 1) * 127.5); nrm[i + 2] = Math.round((1 / l + 1) * 127.5);
  }
  return nrm;
}

function terracotta(T) {
  const W = 1024, H = 512, n = W * H;
  const [sw, sh] = T.size;                 // 1.22 x 0.61 m: 2 units x 2 courses
  const tx = sw / W;                       // metres per texel (square: 1.19 mm)
  const uw = 0.610, uh = 0.305, joint = 0.005, round = 0.007;
  const base = dec(T.mean);
  const hgt = new Float32Array(n), alb = Buffer.alloc(n * 3), orm = Buffer.alloc(n * 4);
  let mR = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const u = (x + 0.5) * tx, v = (H - 1 - y + 0.5) * tx;          // metres, v up from the bottom row
    const course = Math.floor(v / uh), off = (course % 2) * uw / 2;
    const uu = ((u + off) % sw + sw) % sw, unit = Math.floor(uu / uw) % 2;
    const lu = uu - Math.floor(uu / uw) * uw, lv = v - course * uh;  // position inside the unit
    const de = Math.min(lu, uw - lu, lv, uh - lv);                     // distance to the unit's edge
    const inJoint = de < joint / 2;
    // face: pillowed toward the edges, a faint glaze wave
    const e = Math.min(1, Math.max(0, (de - joint / 2) / round));
    const pillow = Math.sqrt(e * (2 - e));
    const wave = (fbm(u / sw * 6, v / sh * 3, 6, 3, 11) - 0.5) * 0.0006;
    const craze = worleyEdge(u / sw * 44, v / sh * 22, 44, 5);         // ~28 mm cells
    const crack = Math.max(0, 1 - craze / 0.06);                        // thin lines at the cell edges
    let h = inJoint ? -0.003 : pillow * 0.0015 + wave - crack * 0.00012;
    hgt[i] = h;
    // colour: per-unit glaze tone, mottle, crazing picked out by dirt, iron speckle, darker grey-cream joints
    const uid = hash(course & 1, unit, 3), tone = 1 + (uid - 0.5) * 0.09, hueW = (hash(course & 1, unit, 8) - 0.5) * 0.05;
    const mot = 1 + (fbm(u / sw * 10, v / sh * 5, 10, 5, 21) - 0.5) * 0.08;
    const speck = hash(x, y, 77) > 0.9975 ? 0.55 : 1;
    let c = [base[0] * tone * mot * (1 + hueW), base[1] * tone * mot, base[2] * tone * mot * (1 - hueW)];
    const cz = 1 - crack * 0.1;
    c = c.map((q) => q * cz * speck);
    if (inJoint) c = base.map((q) => q * 0.52);
    else if (e < 1) c = c.map((q) => q * (0.88 + 0.12 * e));           // the arris catches dirt
    for (let q = 0; q < 3; q++) alb[i * 3 + q] = enc(c[q]);
    // roughness: glaze 0.26-0.36, worn patches duller, crazing and joints rough
    const worn = Math.max(0, fbm(u / sw * 4, v / sh * 2, 4, 2, 31) - 0.62) * 2.2;
    const r = inJoint ? 0.88 : Math.min(0.95, 0.27 + (hash(course & 1, unit, 13)) * 0.08 + worn * 0.25 + crack * 0.2 + (1 - e) * 0.2);
    mR += r;
    orm[i * 4] = Math.round(255 * (inJoint ? 0.55 : 0.85 + 0.15 * e));
    orm[i * 4 + 1] = Math.round(r * 255);
    orm[i * 4 + 2] = 0;
    orm[i * 4 + 3] = Math.round(255 * Math.min(1, Math.max(0, (h + 0.003) / 0.0045)));
  }
  return { W, H, alb, nrm: toNormal(hgt, W, H, 1 / tx), orm, roughMean: +(mR / n).toFixed(3) };
}

function tactile(T) {
  const W = 1024, H = 1024, n = W * H;
  const sw = T.size[0], tx = sw / W;      // 0.61 m, 0.6 mm a texel
  const pitch = sw / 10, rb = 0.0115, rt = 0.00575, dh = 0.005;
  const base = dec('#d9c9a0');            // a neutral light base: the runtime tint sets yellow / dark
  const hgt = new Float32Array(n), alb = Buffer.alloc(n * 3), orm = Buffer.alloc(n * 4);
  let mR = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const u = (x + 0.5) * tx, v = (H - 1 - y + 0.5) * tx;
    const cu = (u % pitch) - pitch / 2, cv = (v % pitch) - pitch / 2, d = Math.hypot(cu, cv);
    // truncated dome: flat top to rt, a rounded shoulder down to the base radius
    let h = 0;
    if (d <= rt) h = dh; else if (d < rb) { const t = (d - rt) / (rb - rt); h = dh * Math.cos(t * Math.PI / 2) ** 1.2; }
    const grain = (fbm(u / sw * 60, v / sw * 60, 60, 60, 41) - 0.5) * 0.00015;
    hgt[i] = h + grain;
    const top = h / dh;                                                 // 0 field .. 1 dome top
    const dirt = (1 - top) * (0.5 + 0.5 * fbm(u / sw * 8, v / sw * 8, 8, 8, 43));
    const scuff = top > 0.8 ? 0.9 + 0.1 * hash(x, y, 5) : 1;
    const mot = 1 + (fbm(u / sw * 5, v / sw * 5, 5, 5, 47) - 0.5) * 0.12;
    const c = base.map((q) => q * mot * scuff * (1 - dirt * 0.28));
    for (let q = 0; q < 3; q++) alb[i * 3 + q] = enc(c[q]);
    const r = Math.min(0.95, 0.6 - top * 0.18 + dirt * 0.2);
    mR += r;
    orm[i * 4] = Math.round(255 * (1 - (1 - top) * (d < rb * 1.25 ? 0.25 : 0.08)));
    orm[i * 4 + 1] = Math.round(r * 255);
    orm[i * 4 + 2] = 0;
    orm[i * 4 + 3] = Math.round(255 * top);
  }
  return { W, H, alb, nrm: toNormal(hgt, W, H, 1 / tx), orm, roughMean: +(mR / n).toFixed(3) };
}

// single-ply roof membrane (TPO / EPDM): 3.05 m sheets (one lap seam a repeat, a 40 mm welded lap), fastener plates
// along the lap every 0.3 m, soft wrinkles, dust, ponding rings; a light neutral base the runtime tint sets
function membrane(T) {
  const W = 1024, H = 1024, n = W * H;
  const sw = T.size[0], tx = sw / W;
  const base = dec('#d4d4cf');
  const hgt = new Float32Array(n), alb = Buffer.alloc(n * 3), orm = Buffer.alloc(n * 4);
  let mR = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const u = (x + 0.5) * tx, v = (H - 1 - y + 0.5) * tx;
    const lap = u / sw * W < 14;                                     // the 40 mm lap at the sheet edge
    const du = Math.min(u, sw - u);
    const fast = Math.abs(du - 0.07) < 0.03 && Math.abs(((v % 0.3) + 0.3) % 0.3 - 0.15) < 0.03;   // 60 mm plates under the lap
    const wr = (fbm(u / sw * 3, v / sw * 3, 3, 3, 51) - 0.5) * 0.004 + (fbm(u / sw * 12, v / sw * 5, 12, 5, 53) - 0.5) * 0.0012;
    let h = wr + (lap ? 0.0015 : 0) + (fast ? 0.0008 : 0);
    hgt[i] = h;
    const dust = fbm(u / sw * 6, v / sw * 6, 6, 6, 57);
    const pond = fbm(u / sw * 2, v / sw * 2, 2, 2, 59);
    const ring = Math.max(0, 1 - Math.abs(pond - 0.62) / 0.035) * 0.5 + (pond > 0.62 ? 0.25 : 0);
    const k = 1 - dust * 0.12 - ring * 0.2 - (lap ? 0.04 : 0) + (hash(x, y, 61) - 0.5) * 0.04;
    const c = base.map((q, j) => q * k * (j === 2 ? 1 - ring * 0.05 : 1));
    for (let q = 0; q < 3; q++) alb[i * 3 + q] = enc(c[q]);
    const r = Math.min(0.95, 0.62 + dust * 0.15 + ring * 0.1);
    mR += r;
    orm[i * 4] = 255; orm[i * 4 + 1] = Math.round(r * 255); orm[i * 4 + 2] = 0;
    orm[i * 4 + 3] = Math.round(255 * Math.min(1, Math.max(0, (h + 0.003) / 0.007)));
  }
  return { W, H, alb, nrm: toNormal(hgt, W, H, 1 / tx), orm, roughMean: +(mR / n).toFixed(3) };
}

// basketweave brick (the Dinosaur Bar-B-Que frieze): squares of three stacked bricks, laid alternately flat and on end, a
// 203 mm module (US modular: 194 x 57 mm faces, 10 mm joints), white mortar; a repeat is 4 x 4 squares (0.813 m)
function basketweave(T) {
  const W = 1024, H = 1024, n = W * H;
  const sw = T.size[0], tx = sw / W, mod = 0.2032, jt = 0.010;
  const brick = dec('#8a4a36'), mortar = dec('#d8d4ca');
  const hgt = new Float32Array(n), alb = Buffer.alloc(n * 3), orm = Buffer.alloc(n * 4);
  let mR = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const u = (x + 0.5) * tx, v = (H - 1 - y + 0.5) * tx;
    const sq = [Math.floor(u / mod), Math.floor(v / mod)], lu = u - sq[0] * mod, lv = v - sq[1] * mod;
    const flat = (sq[0] + sq[1]) % 2 === 0;                            // flat: three courses; on end: three soldiers
    const a = flat ? lv : lu, b2 = flat ? lu : lv;                      // across the bricks / along them
    const k = Math.min(2, Math.floor(a / (mod / 3))), la = a - k * mod / 3;
    const dJ = Math.min(la, mod / 3 - la, b2, mod - b2);                // distance to the brick's joints
    const inJ = dJ < jt / 2;
    const id = hash(sq[0] * 3 + k, sq[1] * 7 + (flat ? 1 : 2), 71);
    const tone = 0.82 + id * 0.36, e = Math.min(1, Math.max(0, (dJ - jt / 2) / 0.004));
    const grain = 1 + (fbm(u / sw * 90, v / sw * 90, 90, 90, 73) - 0.5) * 0.18;
    const fire = hash(sq[0] * 3 + k, sq[1] * 7 + (flat ? 1 : 2), 79) > 0.85 ? 0.72 : 1;   // a few dark-fired bricks
    const c = inJ ? mortar.map((q) => q * (0.9 + 0.1 * hash(x, y, 83))) : brick.map((q, j) => q * tone * grain * fire * (j === 0 ? 1.02 : 1) * (0.9 + 0.1 * e));
    for (let q = 0; q < 3; q++) alb[i * 3 + q] = enc(c[q]);
    const h = inJ ? -0.006 : Math.sqrt(e * (2 - e)) * 0.001 + (grain - 1) * 0.002;
    hgt[i] = h;
    const r = inJ ? 0.92 : 0.78 + (grain - 1) * 0.5;
    mR += r;
    orm[i * 4] = Math.round(255 * (inJ ? 0.6 : 0.9 + 0.1 * e)); orm[i * 4 + 1] = Math.round(r * 255); orm[i * 4 + 2] = 0;
    orm[i * 4 + 3] = Math.round(255 * Math.min(1, Math.max(0, (h + 0.006) / 0.0075)));
  }
  return { W, H, alb, nrm: toNormal(hgt, W, H, 1 / tx), orm, roughMean: +(mR / n).toFixed(3) };
}

const GEN = { terracotta, tactile, roof_tpo: membrane, brick_basket: basketweave };
export async function procSet(name, T) {
  const f = GEN[name];
  if (!f) throw new Error(`${name}: no procedural generator`);
  return f(T);
}
