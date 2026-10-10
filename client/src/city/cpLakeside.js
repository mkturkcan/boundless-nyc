// CP33 LAKESIDE (docs/notes/central-park-photoreal.md, "Lake structures and boats"): the Lake's rowboats and the people in them,
// the Loeb Boathouse and its dock, Cleopatra's Needle, rebuilt for the near field (the owner, 2026-09-30 22:15: "stones, parts
// of bridges, and the castle area look really low poly ... nothing flat-shaded"). Called from city/cpLandmarks.js (its old
// builders in cpLandmarksKit.js stay as the `?cp33l=0` fallback). Everything here is built in code or baked from the project's
// own assets; the textures are CC0 (Poly Haven, ambientCG), packed by tools/assets/lakeside_tex.mjs.
//
// THE BOATS. A 4.3 m (14 ft) rowboat of 1.32 m beam: a smooth hull (a lofted shell, 40 stations x 36 points, normals from the
// surface) in weathered dark green-grey paint on planking (Poly Haven green_rough_planks), an inner shell, ribs, floorboards,
// the gunwale cap and rub rails, three thwarts with knees, the transom, a stem band with its painter ring, bronze oarlock
// horns on pads, and 2.2 m spruce oars with leather collars and spoon blades. One instanced mesh per material for the whole
// fleet; the matrices are written once per sim step (ENV.time) with no allocation.
//
// THE PEOPLE. Seated photoreal people baked from the crowd's own bodies (tools/assets/lakeside_people.mjs: the CARLA 0.10
// walkers, CC BY 4.0, in the crowd's seated clips with each body's solved arms), static geometry in three LODs with the
// crowd's texture layers resolved per vertex; the page draws them with a copy of the crowd's PV2 skin / cloth / hair
// shading on the crowd's own texture arrays (window.__CROWD). A rower's upper body (the spine up, the arms and head, by skin
// weight) is leaned about the hip joint in the vertex shader for the stroke; the oars follow the hands. The boats stay empty
// until the crowd's arrays are in (and without the crowd, `?crowd=0`).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ENV, applyLightTrim, applyCityAO, applySkyGlass } from '../world/materials.js';
import { LBin, K, BOATHOUSE, NEEDLE, STATUES, statueYaw } from './cpLandmarksKit.js';
import { fbm } from './cpBridgesKit.js';

export const CP33L = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('cp33l') === '0');
const BASE_TEX = 'textures/cp33/lakeside/', BASE_PEOPLE = 'models/cp33/lakeside/people/';
const own = (m, k) => { const f = m.customProgramCacheKey.bind(m); m.customProgramCacheKey = () => f() + '|cp33l' + k; return m; };

// ---- textures -----------------------------------------------------------------------------------------------------
const _tx = new Map();
const TL = typeof document !== 'undefined' ? new THREE.TextureLoader() : null;
function lsTex(name, srgb) {
  let t = _tx.get(name);
  if (t || !TL) return t || null;
  t = TL.load(BASE_TEX + name + '.jpg');
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = srgb ? 16 : 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  _tx.set(name, t);
  return t;
}
// a PBR set (<set>_alb / _nrm / _orm: R occlusion, G roughness, B metalness) as a standard material, through the city's light
// trim and AO. o: { n normal strength, ao, metal, vc vertex colours, color, trim, side, rough (a multiplier) }
function pbrMat(set, o = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: lsTex(set + '_alb', true), normalMap: lsTex(set + '_nrm', false), normalScale: new THREE.Vector2(o.n ?? 1, o.n ?? 1),
    roughnessMap: lsTex(set + '_orm', false), roughness: o.rough ?? 1, aoMap: lsTex(set + '_orm', false), aoMapIntensity: o.ao ?? 1,
    metalness: o.metal ?? 0, vertexColors: !!o.vc, color: o.color ?? 0xffffff, side: o.side ?? THREE.FrontSide,
  });
  return own(applyLightTrim(applyCityAO(m), o.trim ?? 1), 'pbr' + set + (o.key || ''));
}

// ---- geometry helpers ---------------------------------------------------------------------------------------------
const WHITE = new THREE.Color(1, 1, 1);
class Parts {
  constructor() { this.list = []; }
  // geo: an indexed geometry with position, normal, uv; m: a THREE.Matrix4 (in the structure's frame); col: THREE.Color or hex;
  // planar: assign UVs from the transformed positions by the dominant normal axis (tiles of `planar` m)
  add(geo, m, col = WHITE, planar = 0, shade = null) {
    const g = geo.clone();
    if (m) g.applyMatrix4(m);
    const c = col instanceof THREE.Color ? col : new THREE.Color(col), n = g.attributes.position.count, ca = new Float32Array(n * 3), P = g.attributes.position;
    for (let i = 0; i < n; i++) { let r = c.r, gg = c.g, b = c.b; if (shade) { const k = shade(P.getX(i), P.getY(i), P.getZ(i)); r *= k[0]; gg *= k[1]; b *= k[2]; } ca[i * 3] = r; ca[i * 3 + 1] = gg; ca[i * 3 + 2] = b; }
    g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    if (planar) planarUV(g, planar);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    this.list.push(g);
    return this;
  }
  merged() {
    if (!this.list.length) return null;
    for (const g of this.list) { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k); if (!g.index) { const n = g.attributes.position.count, ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); } }
    const g = mergeGeometries(this.list, false);
    g.computeBoundingSphere();
    return g;
  }
}
function planarUV(g, s) {
  const p = g.attributes.position, nn = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(nn.getX(i)), ay = Math.abs(nn.getY(i)), az = Math.abs(nn.getZ(i));
    if (ay >= ax && ay >= az) { uv[i * 2] = x / s; uv[i * 2 + 1] = z / s; } else if (ax >= az) { uv[i * 2] = z / s; uv[i * 2 + 1] = y / s; } else { uv[i * 2] = x / s; uv[i * 2 + 1] = y / s; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
const mx = (x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, order = 'XYZ') => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, order)), new THREE.Vector3(sx, sy, sz));
const BOXG = new THREE.BoxGeometry(1, 1, 1);
const box = (P, x, y, z, sx, sy, sz, col, planar = 0.9, rx = 0, ry = 0, rz = 0) => P.add(BOXG, mx(x, y, z, sx, sy, sz, rx, ry, rz), col, planar);
// a tube (round or elliptical section) along a polyline: pts [[x, y, z]...], radius r (a number or (i) => r), ry/rz scale the section
function tubeGeo(pts, r, seg = 8, ry = 1, rz = 1, close = false) {
  const n = pts.length, P = [], N = [], U = [], I = [];
  const T = pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; const t = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]); return t.length() > 1e-9 ? t.normalize() : new THREE.Vector3(1, 0, 0); });
  let up = new THREE.Vector3(0, 1, 0), len = 0;
  for (let i = 0; i < n; i++) {
    const t = T[i];
    if (Math.abs(t.dot(up)) > 0.95) up = new THREE.Vector3(0, 0, 1);
    const e1 = new THREE.Vector3().crossVectors(up, t).normalize(), e2 = new THREE.Vector3().crossVectors(t, e1).normalize();
    if (i) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    const rr = typeof r === 'function' ? r(i) : r;
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const nx = e1.x * c * rz + e2.x * s * ry, ny = e1.y * c * rz + e2.y * s * ry, nz = e1.z * c * rz + e2.z * s * ry;
      P.push(pts[i][0] + (e1.x * c * rz + e2.x * s * ry) * rr, pts[i][1] + (e1.y * c * rz + e2.y * s * ry) * rr, pts[i][2] + (e1.z * c * rz + e2.z * s * ry) * rr);
      const nl = Math.hypot(nx, ny, nz) || 1; N.push(nx / nl, ny / nl, nz / nl);
      U.push(len / 0.9, k / seg * 0.2);
    }
  }
  for (let i = 0; i + 1 < n; i++) for (let k = 0; k < seg; k++) { const a = i * (seg + 1) + k, b = a + 1, c = a + seg + 1, d = c + 1; I.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
  return g;
}

// ---- the rowboat's hull -----------------------------------------------------------------------------------------------
// Frame: x toward the bow, y up from the waterline, z across (the boat's starboard +z). A 4.3 m rowboat, 1.32 m over the
// gunwales, the sheer 0.46 m over the water amidships rising to 0.64 at the stem, the keel 0.30 m under it.
export const BOAT = { L: 4.3, HB: 0.66, seatC: 0.05, seatS: -1.38, seatB: 1.3, seatY: 0.27, floorY: -0.2, lockX: -0.05, lockY: 0.62, lockZ: 0.7 };
const sheerY = (t) => 0.46 + 0.17 * Math.pow(Math.max(0, t), 2.4) + 0.04 * t * t;
const halfB = (t) => (t >= 0 ? BOAT.HB * Math.pow(Math.max(0, 1 - Math.pow(t, 2.3)), 0.52) : BOAT.HB * (1 - 0.36 * t * t));
const keelY = (t) => -0.3 + 0.2 * Math.pow(Math.max(0, t), 2.6) + 0.12 * Math.max(0, -t) ** 2;
// a point of the hull's section at station t, angle a (0 port sheer, PI/2 keel, PI starboard sheer); inset moves it inward
function hullPt(t, a, inset = 0) {
  const c = Math.cos(a), s = Math.sin(a), hb = Math.max(0.0005, halfB(t) - inset), sh = sheerY(t), kl = keelY(t) + inset * 1.4;
  return [t * BOAT.L / 2, sh - (sh - kl) * Math.pow(s, 0.78), Math.sign(c) * Math.pow(Math.abs(c), 0.86) * hb];
}
function hullShell(inset, inward, NS = 44, NJ = 40) {
  const P = [], N = [], U = [], I = [];
  for (let i = 0; i <= NS; i++) {
    const t = 1 - (2 * i) / NS;
    let arc = 0, prev = null;
    for (let j = 0; j <= NJ; j++) {
      const p = hullPt(t, (j / NJ) * Math.PI, inset);
      if (prev) arc += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
      prev = p;
      P.push(p[0], p[1], p[2]); U.push((p[0] + BOAT.L / 2) / 1.1, arc / 1.1 + (inward ? 0.37 : 0));
    }
  }
  for (let i = 0; i < NS; i++) for (let j = 0; j < NJ; j++) {
    const a = i * (NJ + 1) + j, b = a + 1, c = a + NJ + 1, d = c + 1;
    if (inward) I.push(a, b, c, b, d, c); else I.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
  g.computeVertexNormals();
  return g;
}
// the transom: the stern section's ring filled flat, planks across
function transomGeo(inset, dir) {
  const P = [], U = [], I = [], NJ = 20;
  for (let j = 0; j <= NJ; j++) { const p = hullPt(-1, (j / NJ) * Math.PI, inset); P.push(p[0], p[1], p[2]); U.push(p[2] / 1.0, p[1] / 1.0); }
  const cx = -BOAT.L / 2, cy = (sheerY(-1) + keelY(-1)) / 2;
  P.push(cx, cy, 0); U.push(0, cy);
  const c = NJ + 1;
  for (let j = 0; j < NJ; j++) { if (dir > 0) I.push(c, j, j + 1); else I.push(c, j + 1, j); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
  const nn = []; for (let i = 0; i < P.length / 3; i++) nn.push(dir < 0 ? -1 : 1, 0, 0);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
  return g;
}
// the spoon blade: an elliptical section lofted from the throat (x 1.6) to the tip (x 2.2), 0.145 m wide, 1.8 cm thick, the tip rounded
function bladeGeo() {
  const P = [], N = [], U = [], I = [], bn = 28, seg = 14;
  for (let i = 0; i <= bn; i++) {
    const s = i / bn, x = 1.6 + s * 0.6;
    const rz = s < 0.15 ? 0.014 + (0.0725 - 0.014) * Math.sin((s / 0.15) * Math.PI / 2) : 0.0725 * (s > 0.9 ? Math.sqrt(Math.max(0.0004, 1 - ((s - 0.9) / 0.1) ** 2)) : 1);
    const ry = s < 0.15 ? 0.014 + (0.0075 - 0.014) * (s / 0.15) : 0.0075 * (s > 0.9 ? Math.sqrt(Math.max(0.01, 1 - ((s - 0.9) / 0.1) ** 2)) : 1);
    const dish = 0.01 * Math.sin(Math.PI * Math.min(1, Math.max(0, (s - 0.12) / 0.8)));
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), cz = c * rz, cy = sn * ry + dish * c * c * (sn > 0 ? 1 : 1) * 0.5 - dish * 0.25;
      P.push(x, cy, cz); N.push(0, sn / Math.max(ry, 1e-3), c / Math.max(rz, 1e-3)); U.push(x / 0.9, (k / seg) * 0.2);
    }
  }
  for (let i = 0; i < bn; i++) for (let k = 0; k < seg; k++) { const a = i * (seg + 1) + k, b = a + 1, c = a + seg + 1, d = c + 1; I.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
  g.computeVertexNormals();
  return g;
}
// the hull's wear as tones over the paint (the boat frame: y 0 at the waterline): wet and slimed below the line, the sheer scuffed pale
// where oars, hands and fenders rub, rust and dirt runs down from the oarlock pads, long grey water streaks, a pale scum line
function hullShade(x, y, z) {
  const az = Math.abs(z);
  let r = 1, g = 1, b = 1;
  const wet = 1 - sstepL(-0.02, 0.12, y);
  r *= 1 - 0.5 * wet; g *= 1 - 0.38 * wet; b *= 1 - 0.55 * wet;
  const scum = Math.exp(-(((y - 0.1) / 0.035) ** 2)); r *= 1 + 0.35 * scum; g *= 1 + 0.35 * scum; b *= 1 + 0.25 * scum;
  const st = fbm(x * 2.4 + az * 1.3, y * 0.5 + 3.1), streak = sstepL(0.5, 0.78, st);
  r *= 1 - 0.28 * streak; g *= 1 - 0.28 * streak; b *= 1 - 0.24 * streak;
  const scuff = sstepL(0.28, 0.46, y) * sstepL(0.62, 0.8, fbm(x * 5.0 + 7.0, y * 9.0 + az * 2.0));
  r *= 1 + 0.7 * scuff; g *= 1 + 0.62 * scuff; b *= 1 + 0.5 * scuff;
  const rn = Math.exp(-(((x - BOAT.lockX) / 0.14) ** 2)) * sstepL(0.1, 0.5, y) * sstepL(0.45, 0.7, fbm(y * 6.0, x * 4.0 + 5.0));
  r *= 1 + 0.5 * rn; g *= 1 - 0.18 * rn; b *= 1 - 0.45 * rn;
  const tone = 0.88 + 0.24 * fbm(x * 1.1, y * 1.3 + az * 0.9);
  return [r * tone, g * tone, b * tone];
}
const sstepL = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// the waterline's foam: a soft ring laid on the water round the hull (white, its alpha falling to nothing 14 cm out, wandering a
// little), so the boat has a contact line and does not sit on the water like a cut-out
function ringGeo() {
  const NS = 48, P = [], C = [], I = [];
  const wl = (t) => {                                                        // the hull's half-width where it meets the water (y 0) at station t
    let lo = 0, hi = Math.PI / 2;
    for (let k = 0; k < 16; k++) { const mid = (lo + hi) / 2; if (hullPt(t, mid, 0)[1] > 0) lo = mid; else hi = mid; }
    return Math.abs(hullPt(t, (lo + hi) / 2, 0)[2]);
  };
  const loop = [];
  for (let i = 0; i <= NS; i++) { const t = -1 + 2 * i / NS; loop.push([t * BOAT.L / 2, -wl(t)]); }
  for (let i = NS; i >= 0; i--) { const t = -1 + 2 * i / NS; loop.push([t * BOAT.L / 2, wl(t)]); }
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const a = loop[(i + n - 1) % n], b = loop[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    let nx = dz / l, nz = -dx / l;                                             // outward (away from the boat's axis)
    if (nz * loop[i][1] + nx * 0 < 0 && Math.abs(loop[i][1]) > 0.02) { nx = -nx; nz = -nz; }
    const w = 0.2 + 0.16 * fbm(loop[i][0] * 2.2 + 3.0, 5.0) + (Math.abs(loop[i][0]) > BOAT.L / 2 - 0.35 ? 0.08 : 0), al = 0.55 + 0.35 * fbm(loop[i][0] * 3.1, 9.0);
    P.push(loop[i][0] - nx * 0.012, 0.014, loop[i][1] - nz * 0.012, loop[i][0] + nx * w, 0.014, loop[i][1] + nz * w);
    C.push(0.92, 0.96, 0.92, al, 0.92, 0.96, 0.92, 0);
  }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n, a = i * 2, b = i * 2 + 1, c = j * 2 + 1, d = j * 2; I.push(a, b, c, a, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 4));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(P.length).fill(0).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(I);
  g.computeBoundingSphere();
  return g;
}
let _boatG = null;
function boatGeos() {
  if (_boatG) return _boatG;
  const B = BOAT, hullP = new THREE.Matrix4(), paint = new Parts(), wood = new Parts(), floor = new Parts(), metal = new Parts(), oar = new Parts();
  // outer shell, the transom; the inner shell (the paint's lighter inside is the instance colour times the texture: the
  // inside takes its own material slot below)
  paint.add(hullShell(0, false, 40, 34), hullP, WHITE, 0, hullShade).add(transomGeo(0, -1), hullP, WHITE, 0, hullShade);
  const inner = new Parts();
  inner.add(hullShell(0.026, true, 24, 22), hullP).add(transomGeo(0.026, +1), hullP);
  // the gunwale cap: a flat strip over the shell's edge, and the rub rails (half-round, outside, 7 cm under the sheer)
  const NS = 44;
  for (const sd of [-1, 1]) {
    const cap = [], rail = [], inw = [];
    for (let i = 0; i <= NS; i++) {
      const t = 1 - (2 * i) / NS, p = hullPt(t, sd < 0 ? 0 : Math.PI, 0), q = hullPt(t, sd < 0 ? 0 : Math.PI, 0.026), sh = sheerY(t);
      cap.push([p[0], sh + 0.012, p[2] + sd * 0.012]); inw.push([q[0], sh - 0.05, q[2] - sd * 0.016]);
      // the rail's centre: 7 cm under the sheer, outside the shell
      let lo = 0, hi = 1; for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2, pp = hullPt(t, sd < 0 ? mid * Math.PI / 2 : Math.PI - mid * Math.PI / 2, 0); if (sh - pp[1] > 0.075) hi = mid; else lo = mid; }
      const rp = hullPt(t, sd < 0 ? lo * Math.PI / 2 : Math.PI - lo * Math.PI / 2, 0); rail.push([rp[0], rp[1], rp[2] + sd * 0.02]);
    }
    // thin strips converge at the stem: keep the rail and cap to where the boat is 0.12 m wide
    const keep = (a) => a.filter((p) => Math.abs(p[2]) > 0.035 || p[0] < 1.8);
    wood.add(tubeGeo(keep(rail), 0.026, 8, 0.7, 1.0), null, 0x8a7a62, 0);
    wood.add(tubeGeo(keep(cap), 0.03, 6, 0.45, 1.4), null, 0x9a8a70, 0);
    wood.add(tubeGeo(keep(inw), 0.024, 8, 1.0, 0.8), null, 0x8a7a62, 0);
  }
  // ribs: every 0.3 m a thin curved strip hugging the inside of the shell, floor to gunwale
  for (let x = -1.85; x <= 1.9; x += 0.3) {
    const t = x / (B.L / 2), pts = [], NJ = 26;
    for (let j = 2; j <= NJ - 2; j++) { const q = hullPt(t, (j / NJ) * Math.PI, 0.03); if (q[1] > sheerY(t) - 0.06) continue; pts.push([q[0], q[1], q[2]]); }
    if (pts.length > 4) wood.add(tubeGeo(pts, 0.022, 4, 0.55, 1.5), null, 0x9a8a70, 0);
  }
  // thwarts (planks across; the grain runs across the boat) with their knees, the stern seat, the bow seat
  const thw = (x, w, hw) => { box(wood, x, B.seatY - 0.015, 0, w, 0.03, 2 * hw, 0xa89878, 0.9); for (const sd of [-1, 1]) { box(wood, x - w * 0.5 + 0.015, B.seatY - 0.13, sd * (hw - 0.03), 0.025, 0.2, 0.05, 0x8a7a62, 0.9); box(wood, x, B.seatY - 0.19, sd * (hw - 0.035), 0.06, 0.025, 0.05, 0x8a7a62, 0.9, 0, 0, sd * 0.5); } };
  thw(B.seatC, 0.27, halfB(B.seatC / (B.L / 2)) - 0.03);
  thw(B.seatB, 0.24, halfB(B.seatB / (B.L / 2)) - 0.03);
  box(wood, B.seatS - 0.12, B.seatY - 0.015, 0, 0.5, 0.03, 2 * (halfB(-0.64) - 0.03), 0xa89878, 0.9);
  box(wood, -B.L / 2 + 0.09, B.seatY - 0.17, 0, 0.12, 0.05, 2 * (halfB(-0.97) - 0.04), 0x8a7a62, 0.9);
  // floorboards on the frames: seven boards of 0.1 m with 1 cm gaps, ends cut to the shell
  for (let k = -3; k <= 3; k++) { const z = k * 0.108, hl = Math.max(0.4, 1.78 - Math.abs(z) * 1.6); box(floor, -0.1 - Math.abs(k) * 0.05, B.floorY - 0.015, z, hl * 2, 0.03, 0.1, 0xb0a08a, 0.9); }
  // stem: a band down the stem's face and the painter ring
  { const pts = []; for (let k = 0; k <= 10; k++) { const t = 0.985, y = keelY(t) + (sheerY(t) - keelY(t)) * (k / 10); pts.push([B.L / 2 - 0.004 + 0.012 * (1 - k / 10), y, 0]); }
    metal.add(tubeGeo(pts, 0.014, 6, 0.5, 1.8), null, 0x6a6e70, 0);
    metal.add(new THREE.TorusGeometry(0.036, 0.0065, 6, 14), mx(B.L / 2 + 0.01, 0.42, 0, 1, 1, 1, 0, Math.PI / 2, 0), 0x55595a, 0); }
  // the oarlock pads, sockets and horns (bronze)
  for (const sd of [-1, 1]) {
    const z = sd * B.lockZ;
    box(wood, B.lockX, B.lockY - 0.12, z, 0.11, 0.018, 0.1, 0x7a6a52, 0.9);
    metal.add(new THREE.CylinderGeometry(0.014, 0.016, 0.11, 8), mx(B.lockX, B.lockY - 0.065, z), 0x8a6a3a, 0);
    metal.add(new THREE.TorusGeometry(0.036, 0.0065, 6, 14, Math.PI), mx(B.lockX, B.lockY - 0.01, z, 1, 1, 1, 0, Math.PI / 2, 0), 0x8a6a3a, 0);
  }
  // the oar: along +x from the handle's end; the handle, the loom, the leather collar at the lock, the throat and the spoon blade
  { const n = 56, pts = [], rad = [];
    const prof = (x) => (x < 0.17 ? 0.019 : x < 0.5 ? 0.0165 + (x - 0.17) * 0.012 : x < 1.0 ? 0.0205 : 0.0205 - (x - 1.0) * 0.0115);
    for (let i = 0; i <= n; i++) { const x = (i / n) * 1.66; pts.push([x, 0, 0]); rad.push(prof(x)); }
    oar.add(tubeGeo(pts, (i) => rad[i], 8), null, 0xc9ae80, 0);
    oar.add(tubeGeo([[0.5, 0, 0], [0.62, 0, 0]], 0.03, 10), null, 0x5a3f2a, 0);       // the leather collar
    oar.add(bladeGeo(), null, 0xc4a678, 0);
  }
  const mk = (P) => { const g = P.merged(); return g; };
  _boatG = { paint: mk(paint), inner: mk(inner), wood: mk(wood), floor: mk(floor), metal: mk(metal), oar: mk(oar), ring: ringGeo() };
  return _boatG;
}
let _boatM = null;
function boatMats() {
  if (_boatM) return _boatM;
  _boatM = {
    paint: pbrMat('hull', { rough: 0.95, key: 'o', n: 1.1, vc: true }),
    ring: own(applyLightTrim(applyCityAO(new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))), 'ring'),
    inner: pbrMat('hull', { color: 0xb9b2a2, rough: 0.9, key: 'i', side: THREE.BackSide }),
    wood: pbrMat('thwart', { vc: true, rough: 0.9, key: 'w', side: THREE.DoubleSide, color: 0xe8c9a0 }),
    floor: pbrMat('deck', { vc: true, rough: 0.9, key: 'f', color: 0xe0c8a8 }),
    metal: own(applyLightTrim(applyCityAO(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.7 }))), 'metal'),
    oar: pbrMat('thwart', { vc: true, rough: 0.82, key: 'oar', side: THREE.DoubleSide, color: 0xf2e2c4 }),
  };
  return _boatM;
}
export { boatGeos as lsBoatGeos, boatMats as lsBoatMats };

// ---- the people ---------------------------------------------------------------------------------------------------------
// Types baked by tools/assets/lakeside_people.mjs into models/cp33/lakeside/people/<name>.bin (a body in an outfit in a seated
// pose, three LODs, the pivot of its hips at the origin): the rowers' hands rest together at the chest (the crowd's phone pose,
// each walker's own solved arms), the passengers sit upright or relaxed with their hands in their laps.
export const LS_ROWERS = ['rowM1', 'rowM2', 'rowM3', 'rowF1'];
export const LS_PAX = ['paxM1', 'paxF1', 'paxF2', 'paxM2', 'paxF3'];
const PV_PARS = `
attribute vec4 aMeta; attribute float aLean; attribute vec4 aTT; attribute vec4 aTB;
varying float vLayer; varying float vCls; varying vec4 vTint; varying vec2 vUvA;
`;
const PF_PARS = /* glsl */ `
precision highp sampler2DArray;
float crowdSkinK = 0.0;
uniform sampler2DArray uAlbedo, uNormalA, uOrm, uHairA;
uniform float uCrowdNight;
varying float vLayer; varying float vCls; varying vec4 vTint; varying vec2 vUvA;
vec3 crowdUV() { float tile = floor(vUvA.x); return vec3(vUvA.x - tile, vUvA.y, vLayer + tile); }
vec3 crowdPerturb(vec3 surf_pos, vec3 surf_norm, vec3 mapN, vec2 uvv) {
  vec3 q0 = dFdx(surf_pos), q1 = dFdy(surf_pos);
  vec2 st0 = dFdx(uvv), st1 = dFdy(uvv);
  vec3 N = surf_norm;
  vec3 q1perp = cross(q1, N), q0perp = cross(N, q0);
  vec3 T = q1perp * st0.x + q0perp * st1.x, B = q1perp * st0.y + q0perp * st1.y;
  float det = max(dot(T, T), dot(B, B));
  float scale = det == 0.0 ? 0.0 : inversesqrt(det);
  return normalize(T * (mapN.x * scale) + B * (mapN.y * scale) + N * mapN.z);
}
`;
// the crowd's PV2 look (sim/crowd.js crowdMaterial: skin with a wrapped, red-shifted diffuse, cloth recoloured by the part's
// tint, eyes, alpha-tested hair on its own array), on the baked geometry: the layer per vertex (aMeta.x), the upper body
// (aMeta.w, 0..255) leaned about the origin by the instance's aLean
function personMat(kind, arrays) {
  const hair = kind === 'hair';
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: hair ? 0.5 : 0.6, metalness: 0, side: hair ? THREE.DoubleSide : THREE.FrontSide, alphaTest: hair ? 0.35 : 0, envMapIntensity: 0.6 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uAlbedo = { value: arrays.albedo || null }; sh.uniforms.uNormalA = { value: arrays.normal || null };
    sh.uniforms.uOrm = { value: arrays.orm || null }; sh.uniforms.uHairA = { value: arrays.hair || null };
    sh.uniforms.uCrowdNight = ENV.night;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + PV_PARS)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        { float la = aLean * aMeta.w / 255.0, lc = cos( la ), ls = sin( la );
          objectNormal = vec3( objectNormal.x, lc * objectNormal.y - ls * objectNormal.z, ls * objectNormal.y + lc * objectNormal.z ); }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float la = aLean * aMeta.w / 255.0, lc = cos( la ), ls = sin( la );
          transformed = vec3( transformed.x, lc * transformed.y - ls * transformed.z, ls * transformed.y + lc * transformed.z );
          vLayer = aMeta.x; vCls = aMeta.y;
          int pp = int( aMeta.z + 0.5 );
          vTint = pp == 1 ? aTT : ( pp == 2 ? aTB : vec4( 0.0 ) );
          vUvA = uv; }`);
    let fs = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + PF_PARS);
    if (!hair) {
      fs = fs.replace('#include <lights_physical_pars_fragment>', THREE.ShaderChunk.lights_physical_pars_fragment.replace(
        'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );',
        `{
          float nlr = dot( geometryNormal, directLight.direction );
          vec3 wrapD = vec3( saturate( ( nlr + 0.42 ) / 1.42 ), saturate( ( nlr + 0.22 ) / 1.22 ), saturate( ( nlr + 0.16 ) / 1.16 ) );
          vec3 irrD = mix( irradiance, wrapD * directLight.color, crowdSkinK );
          reflectedLight.directDiffuse += irrD * BRDF_Lambert( material.diffuseContribution );
        }`));
    }
    if (hair) {
      fs = fs.replace('#include <map_fragment>', `
        vec4 crowdH = texture(uHairA, vec3(vUvA, vLayer));
        diffuseColor.rgb *= crowdH.rgb;
        vec2 crowdDx = dFdx(vUvA * 1024.0), crowdDy = dFdy(vUvA * 1024.0);
        float crowdLod = max(0.0, 0.5 * log2(max(dot(crowdDx, crowdDx), dot(crowdDy, crowdDy))));
        diffuseColor.a *= crowdH.a * (1.0 + crowdLod * 0.55);`)
        .replace('#include <alphatest_fragment>', `if (diffuseColor.a < ${m.alphaTest.toFixed(2)}) discard;`);
    } else {
      fs = fs.replace('#include <map_fragment>', `
        vec3 crowdT = crowdUV();
        crowdSkinK = vCls < 0.5 ? 1.0 : 0.0;
        vec3 crowdAlb = texture(uAlbedo, crowdT).rgb;
        if (vTint.a > 0.0) {
          const vec3 crowdY = vec3(0.2126, 0.7152, 0.0722);
          float lum = dot(crowdAlb, crowdY);
          float mlum = max(dot(textureLod(uAlbedo, crowdT, 6.0).rgb, crowdY), 0.02);
          vec3 rec = min(vTint.rgb * clamp(lum / mlum, 0.25, 2.2), vec3(0.85));
          crowdAlb = mix(crowdAlb, rec, vTint.a);
        }
        diffuseColor.rgb *= crowdAlb;
        diffuseColor.rgb *= mix(0.9, 1.0, uCrowdNight);`)
        .replace('#include <roughnessmap_fragment>', `
        vec3 crowdOrm = texture(uOrm, crowdT).rgb;
        float roughnessFactor = vCls < 0.5 ? mix(0.42, 0.62, crowdOrm.g) : vCls > 1.5 ? 0.08 : clamp(crowdOrm.g, 0.35, 1.0);`)
        .replace('#include <metalnessmap_fragment>', `
        float metalnessFactor = vCls > 0.5 && vCls < 1.5 ? crowdOrm.b * 0.8 : 0.0;`)
        .replace('#include <normal_fragment_maps>', `
        {
          vec3 mapN = texture(uNormalA, crowdT).xyz * 2.0 - 1.0;
          mapN.xy *= vCls < 0.5 ? 0.9 : 1.0;
          normal = crowdPerturb(-vViewPosition, normal, mapN, crowdT.xy);
        }`)
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        {
          float crowdAo = mix(1.0, crowdOrm.r, 0.8);
          reflectedLight.indirectDiffuse *= crowdAo;
          reflectedLight.indirectSpecular *= crowdAo;
          if (vCls > 1.5 && vCls < 2.5) { reflectedLight.indirectSpecular *= 0.18; reflectedLight.indirectDiffuse *= 0.7; }
        }`);
    }
    sh.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => 'cp33lperson|' + kind;
  return m;
}
async function loadPerson(name) {
  const r = await fetch(BASE_PEOPLE + name + '.bin');
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  const buf = await r.arrayBuffer(), dv = new DataView(buf), jl = dv.getUint32(0, true);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, jl))), base = 4 + jl, pv = meta.pivot;
  const lods = meta.lods.map((L) => {
    const out = {};
    for (const [k, p] of Object.entries(L.prims)) {
      const pos = new Float32Array(buf.slice(base + p.pos, base + p.pos + p.n * 12));
      for (let i = 0; i < p.n; i++) { pos[i * 3] -= pv[0]; pos[i * 3 + 1] -= pv[1]; pos[i * 3 + 2] -= pv[2]; }
      const nb = new Int8Array(buf, base + p.nrm, p.n * 4), nrm = new Float32Array(p.n * 3);
      for (let i = 0; i < p.n; i++) { nrm[i * 3] = nb[i * 4] / 127; nrm[i * 3 + 1] = nb[i * 4 + 1] / 127; nrm[i * 3 + 2] = nb[i * 4 + 2] / 127; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(buf.slice(base + p.uv, base + p.uv + p.n * 8)), 2));
      g.setAttribute('aMeta', new THREE.BufferAttribute(new Uint8Array(buf.slice(base + p.meta, base + p.meta + p.n * 4)), 4));
      g.setIndex(new THREE.BufferAttribute(p.idx32 ? new Uint32Array(buf.slice(base + p.idx, base + p.idx + p.tris * 12)) : new Uint16Array(buf.slice(base + p.idx, base + p.idx + p.tris * 6)), 1));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.3, 0), 1.2);
      out[k] = g;
    }
    return out;
  });
  const seat = meta.seat;
  // hand: the two hands relative to the hip joints; off: the hip joints relative to the seat point (model frame, x / up / forward)
  return { name, meta, lods, hand: meta.hand.map((h) => [h[0] - pv[0], h[1] - pv[1], h[2] - pv[2]]), off: [pv[0], pv[1] - seat[0], pv[2] + seat[1]] };
}
class PeopleLayer {
  constructor(group, persons, arrays, cap = 64) {
    this.persons = persons; this.cap = cap;
    const mats = { opaque: personMat('opaque', arrays), hair: personMat('hair', arrays) };
    this.meshes = persons.map((P) => P.lods.map((L, li) => {
      const o = {};
      for (const [k, g] of Object.entries(L)) {
        g.setAttribute('aLean', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('aTT', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('aTB', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage));
        const mesh = new THREE.InstancedMesh(g, mats[k], cap);
        mesh.name = `cp33l:person:${P.name}:${li}:${k}`; mesh.frustumCulled = false; mesh.count = 0; mesh.castShadow = false; mesh.receiveShadow = true;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        group.add(mesh); o[k] = mesh;
      }
      return o;
    }));
    this.n = persons.map(() => [0, 0, 0]);
  }
  begin() { for (const a of this.n) a[0] = a[1] = a[2] = 0; }
  add(ti, lod, M, lean, tt, tb) {
    const i = this.n[ti][lod];
    if (i >= this.cap) return;
    for (const mesh of Object.values(this.meshes[ti][lod])) {
      mesh.instanceMatrix.array.set(M.elements, i * 16);
      const g = mesh.geometry;
      g.attributes.aLean.array[i] = lean; g.attributes.aTT.array.set(tt, i * 4); g.attributes.aTB.array.set(tb, i * 4);
    }
    this.n[ti][lod] = i + 1;
  }
  end() {
    this.meshes.forEach((lods, ti) => lods.forEach((o, li) => { for (const mesh of Object.values(o)) { mesh.count = this.n[ti][li]; mesh.instanceMatrix.needsUpdate = true; const g = mesh.geometry; g.attributes.aLean.needsUpdate = true; g.attributes.aTT.needsUpdate = true; g.attributes.aTB.needsUpdate = true; } }));
  }
}
const TOPS = [[0.92, 0.9, 0.86], [0.18, 0.3, 0.55], [0.62, 0.12, 0.1], [0.9, 0.72, 0.2], [0.2, 0.45, 0.3], [0.12, 0.12, 0.13], [0.55, 0.62, 0.78], [0.85, 0.45, 0.35], [0.72, 0.68, 0.6], [0.35, 0.5, 0.62]];
const BOTS = [[0.12, 0.17, 0.3], [0.2, 0.2, 0.22], [0.5, 0.44, 0.34], [0.08, 0.1, 0.16], [0.28, 0.34, 0.42], [0.55, 0.52, 0.46]];

// ---- the fleet -----------------------------------------------------------------------------------------------------------
const hash1 = (a, b = 0) => { const s = Math.sin(a * 91.7 + b * 13.13) * 43758.5453; return s - Math.floor(s); };
// a set of n boats: instanced hull / inner shell / wood / floor / metal sharing one matrix buffer, and 2 oars each
function boatSet(group, n, name, shadow = true) {
  const G = boatGeos(), M = boatMats();
  const mk = (geo, mat, cnt, nm, cast) => { const m = new THREE.InstancedMesh(geo, mat, cnt); m.name = `cp33l:${name}:${nm}`; m.frustumCulled = false; m.castShadow = cast; m.receiveShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(m); return m; };
  const hull = mk(G.paint, M.paint, n, 'hull', shadow), inner = mk(G.inner, M.inner, n, 'inner', false), wood = mk(G.wood, M.wood, n, 'wood', false), floor = mk(G.floor, M.floor, n, 'floor', false), metal = mk(G.metal, M.metal, n, 'metal', false);
  const ring = RING_ON ? mk(G.ring, M.ring, n, 'ring', false) : null;
  if (ring) { ring.receiveShadow = false; ring.renderOrder = 2; }
  for (const o of [inner, wood, floor, metal, ring]) if (o) o.instanceMatrix = hull.instanceMatrix;
  const oars = mk(G.oar, M.oar, 2 * n, 'oar', false);
  return { hull, inner, wood, floor, metal, ring, oars, n };
}
const RING_ON = typeof location !== 'undefined' && /[?&]lsring=1/.test(location.search);   // the waterline foam ring: off until it has been seen in a render
const PAINT = [0x9aa89c, 0x8c9c92, 0xa4aea4, 0x86948a, 0x9aa49a, 0x7e8e88, 0xa8b0a6, 0x90a096].map((h) => new THREE.Color(h).multiplyScalar(1.5));   // (the in-engine hulls read black under the day trim: a third more paint)
const _people = { started: false, loaded: false, persons: null, layer: null };
function startPeople() {
  if (_people.started) return;
  _people.started = true;
  Promise.all([...LS_ROWERS, ...LS_PAX].map((n) => loadPerson(n).catch((e) => { console.warn('[cp33l] person', n, e?.message || e); return null; }))).then((ps) => { _people.persons = ps; _people.loaded = true; });
}
function crowdArrays() { const a = typeof window !== 'undefined' && window.__CROWD && window.__CROWD.A && window.__CROWD.A.arrays; return a && a.albedo && a.normal && a.orm ? a : null; }
// courses: [[cx, cz, a, b, psi, dir, v, phase], ...] (a 0: drifting); waterAt(x, z): the surface y
export function lsBuildFleet(group, courses, waterAt, o = {}) {
  const nb = courses.length, S = boatSet(group, nb, 'fleet');
  const boats = courses.map((c, i) => ({ c, i, y: waterAt(c[0], c[1]), rowing: c[2] > 0, pax: c[2] > 0 ? (hash1(i + 1, 1) < 0.45 ? 1 : hash1(i + 1, 1) < 0.8 ? 2 : 0) : (hash1(i + 1, 1) < 0.5 ? 1 : 2) }));
  boats.forEach((b, i) => S.hull.setColorAt(i, PAINT[(hash1(i + 1, 2) * PAINT.length) | 0]));
  S.hull.instanceColor.needsUpdate = true;
  // the people: a rower on the centre thwart facing the stern, the stern seat's passenger facing the bow, the bow seat's facing the stern
  const people = [];
  boats.forEach((b) => {
    const h = (k) => hash1(b.i + 1, 10 + k);
    people.push({ boat: b.i, rower: true, x: BOAT.seatC + 0.02, face: -1, ti: (h(1) * LS_ROWERS.length) | 0, tt: TOPS[(h(2) * TOPS.length) | 0], tb: BOTS[(h(3) * BOTS.length) | 0] });
    if (b.pax >= 1) people.push({ boat: b.i, rower: false, x: BOAT.seatS - 0.1, face: 1, ti: LS_ROWERS.length + ((h(4) * LS_PAX.length) | 0), tt: TOPS[(h(5) * TOPS.length) | 0], tb: BOTS[(h(6) * BOTS.length) | 0] });
    if (b.pax >= 2) people.push({ boat: b.i, rower: false, x: BOAT.seatB + 0.02, face: -1, ti: LS_ROWERS.length + ((h(7) * LS_PAX.length) | 0), tt: TOPS[(h(8) * TOPS.length) | 0], tb: BOTS[(h(9) * BOTS.length) | 0] });
  });
  const Mb = new THREE.Matrix4(), Mo = new THREE.Matrix4(), Mp = new THREE.Matrix4(), Lp = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1);
  const MbA = Array.from({ length: nb }, () => new THREE.Matrix4());
  const hv = new THREE.Vector3(), lk = new THREE.Vector3(), dv = new THREE.Vector3(), ex = new THREE.Vector3(), ey = new THREE.Vector3(), ez = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), tA = new THREE.Vector3(), tB = new THREE.Vector3();
  const st = new Float32Array(nb * 4);              // per boat: stroke s, blade in the water, lean, rowing
  const handB = new Float32Array(nb * 6);           // the rower's two hands in the boat frame (+ a written flag)
  const TWO = Math.PI * 2, camP = new THREE.Vector3(1e6, 0, 1e6);
  let lastT = -1;
  const boatKin = (t) => {
    for (let i = 0; i < nb; i++) {
      const b = boats[i], [cx, cz, a, bb, psi, dir, v, ph] = b.c;
      let x, z, hd;
      if (b.rowing) {
        const rm = Math.sqrt((a * a + bb * bb) / 2), phi = ph + dir * (v / rm) * t, ca = Math.cos(psi), sa = Math.sin(psi), co = Math.cos(phi), si = Math.sin(phi);
        x = cx + ca * a * co - sa * bb * si; z = cz + sa * a * co + ca * bb * si;
        hd = Math.atan2(dir * (-sa * a * si + ca * bb * co), dir * (-ca * a * si - sa * bb * co));
      } else { x = cx + 0.8 * Math.cos(0.01 * t + ph); z = cz + 0.8 * Math.sin(0.013 * t + ph); hd = psi + 0.35 * Math.sin(0.04 * t + ph); }
      const y = b.y + 0.012 * Math.sin(1.3 * t + ph);
      e.set(0.022 * Math.sin(0.9 * t + 2 * ph), -hd, 0.012 * Math.sin(1.1 * t + ph), 'YXZ'); q.setFromEuler(e); p.set(x, y, z);
      Mb.compose(p, q, s1); MbA[i].copy(Mb); S.hull.setMatrixAt(i, Mb);
      // the stroke: the drive (40 % of a 3.4 s cycle) and the recovery
      let sv = 0.35, dp = 0;
      if (b.rowing) { const f = (((t / 3.4 + ph / TWO) % 1) + 1) % 1; if (f < 0.4) { const u = f / 0.4; sv = u * u * (3 - 2 * u); dp = Math.min(1, Math.min(f, 0.4 - f) / 0.05); } else { const u = (f - 0.4) / 0.6; sv = 1 - u * u * (3 - 2 * u); dp = 0; } }
      st[i * 4] = sv; st[i * 4 + 1] = dp; st[i * 4 + 2] = b.rowing ? 0.3 - 0.52 * sv : 0.06; st[i * 4 + 3] = b.rowing ? 1 : 0;
    }
    S.hull.instanceMatrix.needsUpdate = true;
  };
  // an oar's matrix from its handle point H (boat frame) through the lock L, rolled about its axis (a squared blade at roll 0)
  const oarAt = (k, i, H, L, roll) => {
    dv.subVectors(L, H); dv.multiplyScalar(1 / (dv.length() || 1));
    ex.copy(dv); ey.crossVectors(UP, ex).normalize(); ez.crossVectors(ex, ey);
    if (roll) { const c = Math.cos(roll), s = Math.sin(roll); tA.copy(ey); tB.copy(ez); ey.copy(tA).multiplyScalar(c).addScaledVector(tB, s); ez.copy(tB).multiplyScalar(c).addScaledVector(tA, -s); }
    Mo.makeBasis(ex, ey, ez); Mo.setPosition(H.x - dv.x * 0.1, H.y - dv.y * 0.1, H.z - dv.z * 0.1);
    Mp.multiplyMatrices(MbA[i], Mo); S.oars.setMatrixAt(k, Mp);
  };
  const update = (camera) => {
    const t = ENV.time.value;
    if (camera && camera.isPerspectiveCamera) camP.setFromMatrixPosition(camera.matrixWorld);
    if (t !== lastT) { lastT = t; boatKin(t); }
    // the people layer once the crowd's arrays and the baked people are in
    startPeople();
    if (_people.loaded && !_people.layer) { const ar = crowdArrays(); if (ar && _people.persons.every(Boolean)) _people.layer = new PeopleLayer(group, _people.persons, ar); }
    const L = _people.layer;
    if (L) L.begin();
    handB.fill(0);
    for (const pr of people) {
      if (!L) break;
      const i = pr.boat, P = _people.persons[pr.ti], rowing = st[i * 4 + 3] > 0;
      const lean = pr.rower ? (rowing ? st[i * 4 + 2] : 0.1) : 0.04;
      // the person's frame in the boat: the seat point (pr.x, seatY, 0), facing the bow or the stern; the model's origin is its hip joints
      const yaw = pr.face > 0 ? Math.PI / 2 : -Math.PI / 2, cy = Math.cos(yaw), sy = Math.sin(yaw), [dx, dy, dz] = P.off;
      Lp.makeRotationY(yaw);
      Lp.setPosition(pr.x + cy * dx + sy * dz, BOAT.seatY + dy, -sy * dx + cy * dz);
      Mp.multiplyMatrices(MbA[i], Lp);
      p.setFromMatrixPosition(Mp);
      // FP37 (core/engine.js): while recording, each rower holds the level of the take's nearest approach, set once per take
      const fp = typeof window !== 'undefined' && window.__FP37 && window.__FP37.pts ? window.__FP37 : null;
      let lod;
      if (fp) {
        if (pr.fpV !== fp.v) {
          let m = Infinity;
          for (let j = 0; j < fp.pts.length; j += 3) { const ax = p.x - fp.pts[j], ay = p.y - fp.pts[j + 1], az = p.z - fp.pts[j + 2]; m = Math.min(m, ax * ax + ay * ay + az * az); }
          pr.fpV = fp.v; pr.fpLod = m < 16 * 16 ? 0 : m < 55 * 55 ? 1 : m < 190 * 190 ? 2 : -1;
        }
        lod = pr.fpLod;
      } else { const d2 = camP.distanceToSquared(p); lod = d2 < 16 * 16 ? 0 : d2 < 55 * 55 ? 1 : d2 < 190 * 190 ? 2 : -1; }
      if (lod >= 0) { tA.set(pr.tt[0], pr.tt[1], pr.tt[2]); L.add(pr.ti, lod, Mp, lean, [pr.tt[0], pr.tt[1], pr.tt[2], 0.9], [pr.tb[0], pr.tb[1], pr.tb[2], 0.8]); }
      if (pr.rower && rowing) {
        // the hands (relative to the hip joints) turned with the lean about the lateral axis, into the boat frame
        const c = Math.cos(lean), s = Math.sin(lean);
        for (let sd = 0; sd < 2; sd++) { const h = P.hand[sd]; hv.set(h[0], h[1] * c - h[2] * s, h[1] * s + h[2] * c).applyMatrix4(Lp); handB[i * 6 + sd * 3] = hv.x; handB[i * 6 + sd * 3 + 1] = hv.y; handB[i * 6 + sd * 3 + 2] = hv.z; }
        handB[i * 6 + 5] = 1;
      }
    }
    if (L) L.end();
    // the oars: a rowing boat's through its rower's hands (the left hand is on the +z side facing the stern), a drifting boat's shipped
    for (let i = 0; i < nb; i++) {
      const b = boats[i], dp = st[i * 4 + 1];
      for (let sd = 0; sd < 2; sd++) {
        const sz = sd ? -1 : 1, k = 2 * i + sd;
        lk.set(BOAT.lockX, BOAT.lockY, sz * BOAT.lockZ);
        if (b.rowing && handB[i * 6 + 5] > 0) {
          hv.set(handB[i * 6 + sd * 3], handB[i * 6 + sd * 3 + 1] + (sd ? 0.035 : -0.035), handB[i * 6 + sd * 3 + 2]);
          oarAt(k, i, hv, lk, (Math.PI / 2) * (1 - dp));
        } else if (b.rowing) {
          hv.set(BOAT.lockX - 0.1, BOAT.lockY - 0.25, sz * 0.25); oarAt(k, i, hv, lk, 0);
        } else {
          hv.set(-0.75, 0.3, sz * 0.5); lk.set(0.35, 0.34, sz * 0.52); oarAt(k, i, hv, lk, Math.PI / 2);
        }
      }
    }
    S.oars.instanceMatrix.needsUpdate = true;
  };
  update(null);
  S.hull.onBeforeRender = (r, sc, cam) => update(cam);
  S.hull.onBeforeShadow = () => { if (ENV.time.value !== lastT) update(null); };
  return { boats: nb, people: people.length, update, set: S };
}
export { loadPerson as lsLoadPerson, PeopleLayer as LsPeopleLayer };

// ---- the structures' shared pieces ------------------------------------------------------------------------------------------
// a quad with planar UVs: the dominant normal axis of the quad (in the structure's frame) picks the texture plane, `s` metres to
// a repeat; swap turns the texture's rows across (planks that run across a deck)
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
function uvOf(n, p, s, swap) {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  let a, b;
  if (ay >= ax && ay >= az) { a = p[0]; b = p[2]; } else if (ax >= az) { a = p[2]; b = p[1]; } else { a = p[0]; b = p[1]; }
  return swap ? [b / s, a / s] : [a / s, b / s];
}
function pq(B, p, q, r, t, col, s = 2, swap = false) {
  const e1 = sub3(q, p), e2 = sub3(t, p), n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  B.quad(p, q, r, t, col, uvOf(n, p, s, swap), uvOf(n, q, s, swap), uvOf(n, r, s, swap), uvOf(n, t, s, swap));
}
// an axis-aligned box in the frame (u, y, w ranges) with planar UVs, no underside
function abox(B, u0, u1, y0, y1, w0, w1, col, s = 2, swap = false) {
  pq(B, [u0, y1, w0], [u1, y1, w0], [u1, y1, w1], [u0, y1, w1], col, s, swap);
  pq(B, [u0, y0, w0], [u1, y0, w0], [u1, y1, w0], [u0, y1, w0], col, s, swap);
  pq(B, [u1, y0, w1], [u0, y0, w1], [u0, y1, w1], [u1, y1, w1], col, s, swap);
  pq(B, [u0, y0, w1], [u0, y0, w0], [u0, y1, w0], [u0, y1, w1], col, s, swap);
  pq(B, [u1, y0, w0], [u1, y0, w1], [u1, y1, w1], [u1, y1, w0], col, s, swap);
}
// a rib on a sloped face: from A to B (3D, frame), the face's outward normal n, w wide and h high
function rib(B, A, Bp, n, w, h, col, s = 1.4) {
  const d = [Bp[0] - A[0], Bp[1] - A[1], Bp[2] - A[2]], L = Math.hypot(...d) || 1; d[0] /= L; d[1] /= L; d[2] /= L;
  let sd = [d[1] * n[2] - d[2] * n[1], d[2] * n[0] - d[0] * n[2], d[0] * n[1] - d[1] * n[0]]; const sl = Math.hypot(...sd) || 1; sd = sd.map((v) => v / sl);
  const pt = (P, k, up) => [P[0] + sd[0] * k * w / 2 + n[0] * up * h, P[1] + sd[1] * k * w / 2 + n[1] * up * h, P[2] + sd[2] * k * w / 2 + n[2] * up * h];
  const uv = (P) => [(P[0] * d[0] + P[1] * d[1] + P[2] * d[2]) / s, (P[0] * sd[0] + P[1] * sd[1] + P[2] * sd[2]) / s];
  const q4 = (a, b, c, e) => B.quad(a, b, c, e, col, uv(a), uv(b), uv(c), uv(e));
  q4(pt(A, -1, 1), pt(A, 1, 1), pt(Bp, 1, 1), pt(Bp, -1, 1));
  q4(pt(A, 1, 0), pt(Bp, 1, 0), pt(Bp, 1, 1), pt(A, 1, 1));
  q4(pt(A, -1, 1), pt(Bp, -1, 1), pt(Bp, -1, 0), pt(A, -1, 0));
}
// a hip roof in standing-seam copper: the four faces as planes and a seam up every 0.55 m, each running up the fall line and
// stopping at the hip (distance from the eave min(s, L - s, r) for a hip of equal pitch), the ridge capped
function hipCopper(RF, u0, u1, w0, w1, yE, o, t, col, colSeam) {
  const a0 = u0 - o, a1 = u1 + o, b0 = w0 - o, b1 = w1 + o, lu = a1 - a0, lw = b1 - b0, r = Math.min(lu, lw) / 2, yR = yE + r * t;
  const alongU = lu >= lw, wm = (b0 + b1) / 2, um = (a0 + a1) / 2;
  const r0 = alongU ? [a0 + r, yR, wm] : [um, yR, b0 + r], r1 = alongU ? [a1 - r, yR, wm] : [um, yR, b1 - r];
  const c00 = [a0, yE, b0], c10 = [a1, yE, b0], c11 = [a1, yE, b1], c01 = [a0, yE, b1];
  if (alongU) { pq(RF, c00, c10, r1, r0, col, 1.2); pq(RF, c11, c01, r0, r1, col, 1.2); RF.tri(c01, c00, r0, col, [c01[2] / 1.2, c01[0] / 1.2], [c00[2] / 1.2, c00[0] / 1.2], [r0[2] / 1.2, r0[0] / 1.2]); RF.tri(c10, c11, r1, col, [c10[2] / 1.2, c10[0] / 1.2], [c11[2] / 1.2, c11[0] / 1.2], [r1[2] / 1.2, r1[0] / 1.2]); }
  else { pq(RF, c10, c11, r1, r0, col, 1.2); pq(RF, c01, c00, r0, r1, col, 1.2); RF.tri(c00, c10, r0, col, [c00[0] / 1.2, c00[2] / 1.2], [c10[0] / 1.2, c10[2] / 1.2], [r0[0] / 1.2, r0[2] / 1.2]); RF.tri(c11, c01, r1, col, [c11[0] / 1.2, c11[2] / 1.2], [c01[0] / 1.2, c01[2] / 1.2], [r1[0] / 1.2, r1[2] / 1.2]); }
  // the seams: per face, the eave edge E0 -> E1 and the inward plan direction I
  const faces = [[c00, c10, [0, 1]], [c11, c01, [0, -1]], [c01, c00, [1, 0]], [c10, c11, [-1, 0]]];
  const tt = Math.sqrt(1 + t * t);
  for (const [E0, E1, I] of faces) {
    const Le = Math.hypot(E1[0] - E0[0], E1[2] - E0[2]), e = [(E1[0] - E0[0]) / Le, 0, (E1[2] - E0[2]) / Le];
    const up = [I[0] / tt, t / tt, I[1] / tt];
    let n = [e[1] * up[2] - e[2] * up[1], e[2] * up[0] - e[0] * up[2], e[0] * up[1] - e[1] * up[0]]; if (n[1] < 0) n = n.map((v) => -v);
    const nl = Math.hypot(...n); n = n.map((v) => v / nl);
    const nS = Math.max(1, Math.floor(Le / 0.55));
    for (let k = 0; k < nS; k++) {
      const s = (k + 0.5) * Le / nS, Lp = Math.min(s, Le - s, r);
      if (Lp < 0.25) continue;
      const A = [E0[0] + e[0] * s, yE + 0.02, E0[2] + e[2] * s], T = [A[0] + I[0] * Lp, yE + 0.02 + t * Lp, A[2] + I[1] * Lp];
      rib(RF, A, T, n, 0.035, 0.032, colSeam);
    }
  }
  // the ridge cap
  rib(RF, [r0[0], r0[1] + 0.01, r0[2]], [r1[0], r1[1] + 0.01, r1[2]], [0, 1, 0], 0.16, 0.07, colSeam);
  return yR;
}
const BH = {};
function structMats() {
  if (BH.brick) return BH;
  const D = THREE.DoubleSide;
  BH.brick = pbrMat('brick', { vc: true, side: D, n: 1.0, key: 'bh' });
  BH.stone = pbrMat('wallstone', { vc: true, side: D, n: 1.3, key: 'bh' });
  BH.granite = pbrMat('granite', { vc: true, side: D, n: 1.0, key: 'bh' });
  BH.copper = pbrMat('copper', { vc: true, side: D, n: 0.9, metal: 0.2, rough: 0.9, key: 'bh' });
  BH.deck = pbrMat('deck', { vc: true, side: D, n: 1.1, key: 'bh' });
  BH.timber = pbrMat('thwart', { vc: true, side: D, n: 1.1, key: 'bh' });
  BH.wood = own(applyLightTrim(applyCityAO(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.0, side: D }))), 'wood');
  BH.syenite = pbrMat('syenite', { vc: true, side: D, n: 1.3, key: 'ns' });
  BH.paint = own(applyLightTrim(applyCityAO(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.0, side: D }))), 'paint');
  BH.canvas = own(applyLightTrim(applyCityAO(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0, side: D }))), 'canvas');
  BH.iron = own(applyLightTrim(applyCityAO(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.75, side: D }))), 'iron');
  BH.bronze = own(applyLightTrim(applyCityAO(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.8, side: D }))), 'bronze');
  const gl = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x20282c, roughness: 0.08, metalness: 0.1, side: D });
  gl.onBeforeCompile = (sh) => {
    sh.uniforms.lmNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float lmNight;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(1.0, 0.74, 0.46) * smoothstep(0.2, 0.8, lmNight) * 0.6;');
  };
  gl.customProgramCacheKey = () => 'cp33lglass';
  BH.glass = own(applyLightTrim(applySkyGlass(gl, { f0: 0.09, rough: 0.05, tint: [0.95, 0.97, 1.0] })), 'glassL');
  return BH;
}
const hashN = (a, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
// the finished bins of a structure into the group as named meshes (cp33l: stays clear of cpLandmarks' mergeByMaterial)
function emitBins(group, name, list) {
  const out = [];
  for (const [b, m, nm, cast] of list) { const mesh = b.mesh(m, `cp33l:${name}:${nm}`, { cast: cast !== false }); if (mesh) { group.add(mesh); out.push([nm, b.tris]); } }
  return out;
}

// ---- the Loeb Boathouse ---------------------------------------------------------------------------------------------------
// The same building as the CP32 kit (docs/notes/central-park-landmarks.md: OSM relation 3698871, frame O (184.28, 837.65), u along
// (0.2037, 0.979), e east, w = -e), rebuilt for the near field: red brick (Poly Haven brick_wall_09, CC0) over a stone plinth with
// recessed windows (jambs, stone sills and lintels, painted frames and muntins), pale green standing-seam copper hips (ambientCG
// Metal058C, CC0) with a seam every 0.55 m, a colonnade of turned columns (base, torus, entasis, necking, capital) under a stepped
// entablature with dentils and glazed bays with awnings, a rock-faced water wall (Poly Haven rock_wall_08, CC0), and the boat
// landing on pilings with plank decking, bollards, cleats, fenders and a ladder, the rowboats tied up off it.
const COLUMN = [[0.3, 0], [0.3, 0.06], [0.255, 0.085], [0.25, 0.14], [0.215, 0.19], [0.2, 0.3], [0.197, 0.9], [0.19, 1.8], [0.18, 2.6], [0.17, 2.88], [0.158, 2.94], [0.178, 2.99], [0.2, 3.02], [0.235, 3.08], [0.27, 3.14], [0.29, 3.2]];
export function lsBuildBoathouse(group, W, gE) {
  const M = structMats();
  const [ox, oz] = BOATHOUSE.O, [ax, az] = BOATHOUSE.A;
  const mk = (uv) => new LBin(uv).frame(ox, 0, oz, ax, az);
  const BR = mk(true), SW = mk(true), PV = mk(true), RF = mk(true), WH = mk(), GS = mk(), TB = mk(true), WO = mk(), IR = mk(), CV = mk();
  const F = W + 1.05, EAVE = F + 4.0, low = Math.min(W - 0.6, gE - 0.6), plinth = F + 0.45;
  const cBr = K(0xe3c4b8), cBrD = K(0xd0aea2), cW = K(0xf0ede4), cWS = K(0xd4d0c4), cCu = K(0xe4f0ea), cCuR = K(0x8fa49b), cSt = K(0xcfcac0), cGr = K(0xdcd7cc), cDk = K(0x2a2622);
  const E = (e) => -e;
  const R = [[0, 19.9, 0, 32.0, EAVE + 0.4, 0.3], [19.9, 60.8, 0, 7.7, EAVE, 0.34], [19.9, 28.7, 14.6, 32.2, EAVE - 0.4, 0.3], [28.7, 57.5, 7.7, 24.6, EAVE - 0.4, 0.3]];
  // -- a brick wall run with its recessed windows: a, b = [u, w] ends; the wall's outward side is away from `ctr`
  const wallRun = (a, b, y0, y1, ctr, o = {}) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), du = (b[0] - a[0]) / L, dw = (b[1] - a[1]) / L;
    let nu = dw, nw = -du;
    if (((a[0] + b[0]) / 2 - ctr[0]) * nu + ((a[1] + b[1]) / 2 - ctr[1]) * nw < 0) { nu = -nu; nw = -nw; }
    const P = (s, y, off = 0) => [a[0] + du * s + nu * off, y, a[1] + dw * s + nw * off];
    const box = (B, s0, s1, ya, yb, o0, o1, col, sc = 2) => { const p = P(s0, ya, o0), q = P(s1, yb, o1); abox(B, Math.min(p[0], q[0]), Math.max(p[0], q[0]), ya, yb, Math.min(p[2], q[2]), Math.max(p[2], q[2]), col, sc); };
    pq(SW, P(0, low), P(L, low), P(L, plinth), P(0, plinth), cSt, 1.6);                                               // the stone plinth
    box(SW, -0.04, L + 0.04, plinth - 0.12, plinth + 0.06, 0, 0.07, cGr, 1.6);                                          // its water table
    const bay = o.bay || 3.4, n = Math.max(1, Math.round(L / bay)), step = L / n, ww = o.win ?? 1.3, sill = F + 1.0, head = F + 2.7, rev = 0.2;
    let s0 = 0;
    for (let i = 0; i < n; i++) {
      const c = (i + 0.5) * step, wl = c - ww / 2, wr = c + ww / 2, hb = hashN(i, L) < 0.5 ? cBr : cBrD;
      pq(BR, P(s0, plinth), P(wl, plinth), P(wl, y1), P(s0, y1), hb, 2.0);
      pq(BR, P(wl, plinth), P(wr, plinth), P(wr, sill), P(wl, sill), hb, 2.0);
      pq(BR, P(wl, head), P(wr, head), P(wr, y1), P(wl, y1), hb, 2.0);
      pq(BR, P(wl, sill, 0), P(wl, sill, -rev), P(wl, head, -rev), P(wl, head, 0), cBrD, 2.0);                          // the jambs
      pq(BR, P(wr, sill, -rev), P(wr, sill, 0), P(wr, head, 0), P(wr, head, -rev), cBrD, 2.0);
      pq(BR, P(wl, head, 0), P(wl, head, -rev), P(wr, head, -rev), P(wr, head, 0), cBrD, 2.0);                          // the soffit of the head
      box(SW, wl - 0.1, wr + 0.1, sill - 0.09, sill, -rev, 0.08, cGr, 1.4);                                              // the stone sill
      box(SW, wl - 0.12, wr + 0.12, head, head + 0.2, -0.02, 0.07, cGr, 1.4);                                            // the lintel
      // the sash: a painted frame set back, two lights over a transom bar and muntins, the glass behind
      const g = -rev - 0.05, fw = 0.05;
      box(WH, wl, wl + fw, sill, head, g, g + 0.07, cW); box(WH, wr - fw, wr, sill, head, g, g + 0.07, cW);
      box(WH, wl, wr, sill, sill + fw, g, g + 0.07, cW); box(WH, wl, wr, head - fw, head, g, g + 0.07, cW);
      box(WH, c - 0.025, c + 0.025, sill, head, g, g + 0.07, cW); box(WH, wl, wr, sill + (head - sill) * 0.62 - 0.025, sill + (head - sill) * 0.62 + 0.025, g, g + 0.07, cW);
      for (const f of [0.25, 0.75]) { const mm = wl + (wr - wl) * f; box(WH, mm - 0.012, mm + 0.012, sill + (head - sill) * 0.62, head, g + 0.02, g + 0.05, cW); }
      GS.quad(P(wl, sill, g + 0.035), P(wr, sill, g + 0.035), P(wr, head, g + 0.035), P(wl, head, g + 0.035), K(0xffffff));
      s0 = wr;
    }
    pq(BR, P(s0, plinth), P(L, plinth), P(L, y1), P(s0, y1), cBr, 2.0);
    // the string course and the frieze under the eaves
    box(WH, -0.06, L + 0.06, y1 - 0.34, y1 - 0.14, 0, 0.12, cW);
    box(WH, -0.1, L + 0.1, y1 - 0.14, y1 + 0.04, 0, 0.2, cWS);
  };
  const tops = [];
  for (const [u0, u1, e0, e1, yE, pt] of R) {
    const ctr = [(u0 + u1) / 2, E((e0 + e1) / 2)];
    const faces = [[[u0, E(e1)], [u1, E(e1)]], [[u1, E(e1)], [u1, E(e0)]], [[u0, E(e0)], [u0, E(e1)]]];
    if (e0 > 0.1) faces.push([[u1, E(e0)], [u0, E(e0)]]);
    for (const [a, b] of faces) wallRun(a, b, plinth, yE - 0.2, ctr);
    const o = 0.55, yR = hipCopper(RF, u0, u1, E(e1), E(e0), yE, o, pt, cCu, cCuR);
    tops.push([u0, u1, E(e1), E(e0), yE, yR]);
    // the soffit and the fascia boards round the eaves
    pq(WH, [u0 - o, yE - 0.02, E(e1) - o], [u1 + o, yE - 0.02, E(e1) - o], [u1 + o, yE - 0.02, E(e0) + o], [u0 - o, yE - 0.02, E(e0) + o], cWS, 2);
    abox(WH, u0 - o, u1 + o, yE - 0.16, yE + 0.08, E(e1) - o - 0.04, E(e1) - o, cW); abox(WH, u0 - o, u1 + o, yE - 0.16, yE + 0.08, E(e0) + o, E(e0) + o + 0.04, cW);
    abox(WH, u0 - o - 0.04, u0 - o, yE - 0.16, yE + 0.08, E(e1) - o, E(e0) + o, cW); abox(WH, u1 + o, u1 + o + 0.04, yE - 0.16, yE + 0.08, E(e1) - o, E(e0) + o, cW);
  }
  // the court: paved, open to the sky
  pq(PV, [19.9, F + 0.02, E(7.7)], [28.7, F + 0.02, E(7.7)], [28.7, F + 0.02, E(14.6)], [19.9, F + 0.02, E(14.6)], cGr, 1.8);
  // two brick chimneys on the great hip (stack, corbelled cap, flue)
  for (const [cu, cw, cy] of [[6.5, E(21), tops[0][5] - 0.6], [13.4, E(11), tops[0][5] - 0.9]]) {
    abox(BR, cu - 0.45, cu + 0.45, cy, cy + 2.6, cw - 0.45, cw + 0.45, cBrD, 2.0);
    abox(SW, cu - 0.56, cu + 0.56, cy + 2.6, cy + 2.78, cw - 0.56, cw + 0.56, cGr, 1.4); abox(SW, cu - 0.5, cu + 0.5, cy + 2.78, cy + 2.86, cw - 0.5, cw + 0.5, cGr, 1.4);
    abox(WO, cu - 0.22, cu + 0.22, cy + 2.86, cy + 2.94, cw - 0.22, cw + 0.22, cDk);
  }

  // -- the lakeside colonnade: the rock-faced water wall and its coping, 19 turned columns, the stepped entablature with dentils,
  // glazed bays (dado, three lights and muntined fanlights) with striped awnings
  const U0 = 0, U1 = 60.8, nB = 18, stp = (U1 - U0) / nB;
  abox(SW, U0 - 0.3, U1 + 0.3, W - 0.8, F - 0.14, -0.7, 0.2, cSt, 1.6);
  abox(PV, U0 - 0.3, U1 + 0.3, F - 0.14, F, -0.7, 0.3, cGr, 1.8);
  pq(PV, [U0 - 0.3, F + 0.002, -0.7], [U1 + 0.3, F + 0.002, -0.7], [U1 + 0.3, F + 0.002, -0.2], [U0 - 0.3, F + 0.002, -0.2], cGr, 1.8);
  for (let i = 0; i <= nB; i++) {
    const u = U0 + i * stp;
    WH.lathe('lsCol', COLUMN, cW, u, F, 0.1, 1, 16);
    abox(WH, u - 0.33, u + 0.33, F + 3.2, F + 3.3, -0.23, 0.43, cW);                                               // the abacus
  }
  abox(WH, U0 - 0.45, U1 + 0.45, F + 3.3, F + 3.62, -0.28, 0.46, cW);                                                  // the architrave
  abox(WH, U0 - 0.45, U1 + 0.45, F + 3.62, F + 3.88, -0.24, 0.42, cWS);                                                // the frieze
  abox(WH, U0 - 0.55, U1 + 0.55, F + 3.88, F + 4.0, -0.28, 0.62, cW);                                                 // the cornice
  for (let u = U0 - 0.4; u < U1 + 0.45; u += 0.24) abox(WH, u, u + 0.12, F + 3.78, F + 3.88, 0.42, 0.48, cWS);          // dentils
  for (let i = 0; i < nB; i++) {
    const ua = U0 + i * stp + 0.3, ub = U0 + (i + 1) * stp - 0.3, w = -0.16, d = 0.1;
    abox(WH, ua, ub, F, F + 0.42, w - 0.04, w + 0.06, cW);                                                           // the dado
    abox(WH, ua, ub, F + 0.42, F + 0.5, w - 0.05, w + 0.07, cWS);
    abox(WH, ua, ub, F + 2.5, F + 2.6, w - 0.04, w + 0.06, cW);                                                      // the transom bar
    abox(WH, ua, ub, F + 3.12, F + 3.2, w - 0.04, w + 0.06, cW);
    abox(WH, ua, ua + 0.06, F + 0.42, F + 3.2, w - 0.04, w + 0.06, cW); abox(WH, ub - 0.06, ub, F + 0.42, F + 3.2, w - 0.04, w + 0.06, cW);
    for (const f of [1 / 3, 2 / 3]) { const um = ua + (ub - ua) * f; abox(WH, um - 0.03, um + 0.03, F + 0.5, F + 2.5, w - 0.03, w + 0.05, cW); }
    for (let k = 1; k < 6; k++) { const um = ua + (ub - ua) * k / 6; abox(WH, um - 0.012, um + 0.012, F + 2.6, F + 3.12, w - 0.02, w + 0.03, cW); }
    GS.quad([ua, F + 0.5, w + 0.005], [ub, F + 0.5, w + 0.005], [ub, F + 2.5, w + 0.005], [ua, F + 2.5, w + 0.005], K(0xffffff));
    GS.quad([ua, F + 2.6, w + 0.005], [ub, F + 2.6, w + 0.005], [ub, F + 3.12, w + 0.005], [ua, F + 3.12, w + 0.005], K(0xffffff));
    // the awning: a striped slope from under the entablature out over the walk, a scalloped valance
    const ye = F + 2.62, we = 1.5, ns = 7;
    for (let k = 0; k < ns; k++) {
      const a = ua + (ub - ua) * k / ns, b = ua + (ub - ua) * (k + 1) / ns, col = k % 2 ? K(0xd9cdb0) : K(0x7f8a6c);
      CV.quad([a, F + 3.22, 0.5], [b, F + 3.22, 0.5], [b, ye, we], [a, ye, we], col);
      CV.quad([a, ye, we], [b, ye, we], [b, ye - 0.2, we + 0.01], [a, ye - 0.2, we + 0.01], col);
      CV.tri([a, ye - 0.2, we + 0.01], [b, ye - 0.2, we + 0.01], [(a + b) / 2, ye - 0.3, we + 0.02], col);
    }
    for (const u of [ua + 0.05, ub - 0.05]) IR.tube([u, F + 3.0, 0.45], [u, ye - 0.02, we - 0.02], 0.012, K(0x3a3a3a), 5);
  }
  // -- the mast over the great hip's ridge: a turned pole with its truck, yard and gaff, the flag in thirteen stripes
  { const mu = 26.5, me = E(3.8), mB = EAVE + 1.35;
    WH.lathe('lsMast', [[0.14, 0], [0.13, 0.4], [0.115, 3], [0.095, 8], [0.075, 12], [0.06, 12.3], [0.09, 12.38], [0.1, 12.5], [0.07, 12.68], [0.0, 12.78]], cW, mu, mB, me, 1, 12);
    WH.tube([mu - 2.2, mB + 8.6, me], [mu + 2.2, mB + 8.6, me], 0.045, cW, 6);
    WH.tube([mu, mB + 7.7, me], [mu, mB + 9.4, me + 1.8], 0.035, cW, 6);
    IR.tube([mu - 0.1, mB + 5.0, me], [mu - 0.1, mB + 5.0, me + 0.24], 0.01, K(0x333333), 4);
    // the flag: 13 stripes of 8 cells, a wave down its length, the union in the canton
    const fx = mu, fy = mB + 11.45, fz0 = me + 0.06, FL = 1.9, FH = 1.0, nc = 10;
    const wv = (s, k) => 0.07 * Math.sin(s * 5.5 + 0.6) * Math.min(1, s * 1.2) + 0.015 * Math.sin(k * 3.1);
    for (let k = 0; k < 13; k++) for (let c = 0; c < nc; c++) {
      const s0 = c / nc, s1 = (c + 1) / nc, y0 = fy - (k + 1) * FH / 13, y1 = fy - k * FH / 13, canton = k < 7 && s1 <= 0.4 + 1e-6;
      const col = canton ? K(0x2b3a6e) : (k % 2 ? K(0xe9e6de) : K(0xa6262d));
      CV.quad([fx + wv(s0, k), y0, fz0 + s0 * FL], [fx + wv(s1, k), y0, fz0 + s1 * FL], [fx + wv(s1, k), y1, fz0 + s1 * FL], [fx + wv(s0, k), y1, fz0 + s0 * FL], col);
    }
  }

  // -- the boat landing: a timber deck on pilings along the south end's lakeside, edge beams, bollards, cleats, fenders, a ladder
  const du0 = 40, du1 = 66, w0 = 1.2, w1 = 4.2, dy = W + 0.38;
  const cTim = K(0xd8d0c4), cTimD = K(0x6e6254);
  { const nU = Math.round((du1 - du0) / 1.3), sU = (du1 - du0) / nU;
    for (let i = 0; i < nU; i++) pq(TB, [du0 + i * sU, dy, w0], [du0 + (i + 1) * sU, dy, w0], [du0 + (i + 1) * sU, dy, w1], [du0 + i * sU, dy, w1], hashN(i, 4) < 0.5 ? cTim : K(0xc4bbad), 1.4);
    abox(TB, du0 - 0.1, du1 + 0.1, dy - 0.36, dy - 0.02, w1 - 0.02, w1 + 0.12, cTim, 1.4); abox(TB, du0 - 0.1, du1 + 0.1, dy - 0.36, dy - 0.02, w0 - 0.12, w0 + 0.02, cTim, 1.4);   // edge beams
    abox(TB, du1 - 0.02, du1 + 0.12, dy - 0.36, dy - 0.02, w0 - 0.12, w1 + 0.12, cTim, 1.4);
    for (let u = du0 + 0.8; u < du1; u += 2.6) { abox(WO, u - 0.07, u + 0.07, dy - 0.3, dy - 0.06, w0, w1, cTimD); }                                    // the joists seen under the deck's lip
    for (let u = du0 + 0.5; u <= du1 + 0.01; u += 2.6) for (const w of [w0 - 0.04, w1 + 0.08]) {
      WO.cyl(0.13, 0.15, dy + 0.62 - (W - 1.4), cTimD, u, W - 1.4, w, 10);                                                        // the piling
      WO.cyl(0.155, 0.155, 0.05, K(0x3a342c), u, dy + 0.62, w, 10);
      IR.lathe('lsRope', [[0.152, 0], [0.152, 0.09]], K(0xb4a07c), u, dy + 0.12, w, 1, 8);                                        // a rope wrap
    }
    for (let u = du0 + 1.3; u < du1; u += 5.2) {                                                                                  // bollards and cleats
      IR.lathe('lsBoll', [[0.0, 0], [0.1, 0], [0.1, 0.04], [0.075, 0.1], [0.07, 0.3], [0.12, 0.34], [0.13, 0.4], [0.0, 0.42]], K(0x23262a), u, dy, w1 - 0.18, 1, 12);
      IR.box(0.34, 0.035, 0.07, K(0x2c2f33), u + 2.0, dy + 0.05, w1 - 0.2); IR.box(0.06, 0.05, 0.06, K(0x2c2f33), u + 2.0 - 0.1, dy, w1 - 0.2); IR.box(0.06, 0.05, 0.06, K(0x2c2f33), u + 2.0 + 0.1, dy, w1 - 0.2);
    }
    for (let u = du0 + 0.5; u < du1; u += 1.3) IR.tube([u, dy - 0.2, w1 + 0.15], [u + 0.65, dy - 0.2, w1 + 0.15], 0.045, K(0x17181a), 6);             // the half-round rubber fender
    // a ladder at the end: two rails and rungs down into the water
    for (const dz of [-0.2, 0.2]) IR.tube([du1 - 0.4 + dz, dy + 0.55, w1 + 0.15], [du1 - 0.4 + dz, W - 1.2, w1 + 0.15], 0.022, K(0x6a6e70), 6);
    for (let y = dy - 0.1; y > W - 1.1; y -= 0.3) IR.tube([du1 - 0.6, y, w1 + 0.15], [du1 - 0.2, y, w1 + 0.15], 0.016, K(0x6a6e70), 5);
    // the steps from the landing to the colonnade's floor, and a lifebuoy on its post
    for (let k = 0; k < 3; k++) abox(TB, du0 - 1.0 - k * 0.3, du0 - 0.7 - k * 0.3, dy - 0.2, dy + (k + 1) * 0.22, w0 + 0.4, w0 + 2.4, cTim, 1.4);
    WO.cyl(0.05, 0.05, 1.5, cTimD, du0 + 1.0, dy, w0 + 0.12, 8);
    WH.lathe('lsBuoy', [[0.2, 0], [0.26, 0.04], [0.28, 0.1], [0.26, 0.16], [0.2, 0.2], [0.15, 0.1], [0.2, 0]], K(0xe8e4dc), du0 + 1.0, dy + 1.0, w0 + 0.2, 1, 14);
  }
  const out = emitBins(group, 'boathouse', [[BR, M.brick, 'brick'], [SW, M.stone, 'stone'], [PV, M.granite, 'paving'], [RF, M.copper, 'copper'], [WH, M.paint, 'white'], [GS, M.glass, 'glass', false], [TB, M.timber, 'deck'], [WO, M.wood || M.paint, 'timber'], [IR, M.iron, 'iron', false], [CV, M.canvas, 'canvas']]);
  // the rowboats tied up off the landing, bows in, painters to the cleats
  const moor = [];
  for (let u = du0 + 1.0, k = 0; u < du1 - 0.5; u += 1.55, k++) {
    const w = w1 + 2.25 + 0.12 * Math.sin(k * 2.1);
    moor.push([ox + ax * u - az * w, oz + az * u + ax * w, Math.atan2(-ax, az) + 0.045 * Math.sin(k * 2.1 + 0.4)]);
  }
  out.push(['moored', lsBuildMoored(group, moor, W)]);
  return out;
}
// the tied-up fleet: list [[x, z, heading], ...] (the bow toward the heading's direction), empty, oars shipped, rocking a little on
// the sim clock (ENV.time), one instanced set for all of them
export function lsBuildMoored(group, list, W) {
  const n = list.length, S = boatSet(group, n, 'moored', true);
  list.forEach((_, i) => S.hull.setColorAt(i, PAINT[(hashN(i + 3, 5) * PAINT.length) | 0]));
  S.hull.instanceColor.needsUpdate = true;
  const q = new THREE.Quaternion(), qo = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), po = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1), Mb = new THREE.Matrix4(), Ml = new THREE.Matrix4(), Mo = new THREE.Matrix4();
  let lastT = -1;
  const upd = () => {
    const t = ENV.time.value;
    if (t === lastT) return;
    lastT = t;
    list.forEach(([x, z, h], i) => {
      e.set(0.02 * Math.sin(0.8 * t + i * 1.7), -h, 0.008 * Math.sin(1.1 * t + i), 'YXZ'); q.setFromEuler(e);
      p.set(x, W + 0.012 * Math.sin(1.2 * t + i), z); Mb.compose(p, q, s1); S.hull.setMatrixAt(i, Mb);
      for (let sd = 0; sd < 2; sd++) {                      // the oars laid fore-and-aft on the thwarts, blades forward
        e.set(0, 0.04 * (sd ? 1 : -1), 0.03, 'YXZ'); qo.setFromEuler(e); po.set(-1.0, BOAT.seatY + 0.07, (sd ? 1 : -1) * 0.3);
        Ml.compose(po, qo, s1); Mo.multiplyMatrices(Mb, Ml); S.oars.setMatrixAt(2 * i + sd, Mo);
      }
    });
    S.hull.instanceMatrix.needsUpdate = true; S.oars.instanceMatrix.needsUpdate = true;
  };
  upd();
  S.hull.onBeforeRender = upd; S.hull.onBeforeShadow = upd;
  return n;
}
