// AR33 facade kit: the builder (owner KIT, docs/notes/ar33-kit.md; schema docs/notes/ar33-spec.md). A spec'd building
// is rebuilt on its compiled footprint: every edge of the ring is a face in its own frame (fk/kitGeom.js), the street
// faces from the spec (a base of piers, storefront systems, entrances and a signband; upper floors of punched windows
// with reveals, frames, sashes, sills and lintels; belt courses, pilasters, rustication, the cornice), the others from
// the compiled record (the wall with plain punched windows at the compiled floor height, a party wall blind). The roof
// slab, the parapet and its coping, the roof plant. Geometry merges per material into 64 m cells; the fine parts (frames,
// sashes, sills, lintels, brackets, rooms, storefront metal) go into a near level shown within ?fklod= metres (120).
import * as THREE from 'three';
import { Sink, Frame, SK, box, extrude, poly, quadW, quadU, quadY, quadWT, quadUT, paneW, paneT, wallWithHoles, reveal, flatRing, edgeFrame, edgeMitres, normRing, cleanRingMap, hash } from './kitGeom.js';
import { kitMat, matsReady, kitShopWallMat, kitPosterMat, kitStainMat, kitShutterMat, kitGraffitiMat, kitRoofStainMat, VISION_KEYS } from './kitMats.js';
import { POSTER_COLS, POSTER_ROWS, SHOP_W, SHOP_H, graffitiTex, paintTex, paintReady } from './kitTex.js';
import { buildingsOf } from '../../world/tiledata.js';

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
// FL36 (owner 2026-10-02, teaser 7 at 0:04: "The building on the right gets a different lighting suddenly"): the near level's
// detail (mullions, frames, sills) appeared at 120 m as the lens closed in; the film (`filmlod=1`, offline) keeps it to 1 km
const LOD_D = Q && Q.get('fklod') ? +Q.get('fklod') : (Q && Q.get('filmlod') === '1' ? 1000 : 120);
const FKGRAF = !!(Q && Q.get('fkgraf') === '1');   // AR34: graffiti on every closed curtain (a test of the painter)
const FKCLUTTER = Q && Q.get('fkclutter') ? Math.max(0, Math.min(3, +Q.get('fkclutter') || 0)) : 0;   // AR34 w2: roof.clutter for every kit roof without it (a test)
const DBG = !!(Q && Q.get('fkdbg') === '1');   // AR34 w2 b1: the kit's own debug lines (as fk/facades.js)
const FKSHEER = Q && Q.get('fksheer') ? Math.max(0, Math.min(1, +Q.get('fksheer') || 0)) : 0;   // AR34 w2: sheers in that share of every window type without `sheer` (a test)
const CELL = 64;
// AR34 w2 s5 (draw calls): the far level's meshes are merged over a coarser grid of FCELL m (one mesh per material per
// FCELL square instead of per 64 m cell; the near level keeps its 64 m cells and their LOD distance); `?fkmerge=0` = per
// cell as before (the A/B), `?fkmerge=<m>` another size; `?fkshare=0` / `?fkmerget=0` below
const FCELL = Q && Q.get('fkmerge') !== null && Q.get('fkmerge') !== undefined ? Math.max(0, +Q.get('fkmerge') || 0) : 256;
const FKSHARE = !(Q && Q.get('fkshare') === '0');
// (the far level's transparent meshes too: window and shop glass over their opaque rooms, roof and wall decals: they never
// overlap one another across buildings, so the sort per 64 m cell bought nothing; `?fkmerget=0` keeps them per cell)
const FKMERGET = !(Q && Q.get('fkmerget') === '0');

// SIGN's kit (fk/signKit.js), when it is in: buildSign(sign, { logo, seed }) -> Object3D in wall-local coordinates
let SIGNK = null;
const signsIn = import('./signKit.js').then(async (m) => {
  SIGNK = m;
  if (m.signsReady) { try { await Promise.race([m.signsReady, new Promise((r) => setTimeout(r, 20000))]); } catch (e) { /* fonts late */ } }
  console.log('[fk] signs: fk/signKit.js');
}).catch(() => { console.log('[fk] signs: fk/signKit.js not in yet, signs left out'); });
export const ready = Promise.all([matsReady, signsIn, paintReady]);

// the custom modules (fk/custom/<seg>.js), handed over by facades.js
let CUSTOM = {};
export function setCustom(c) { CUSTOM = c || {}; }
export function resolveFn(name) {
  if (typeof name === 'function') return name;
  if (!name || typeof name !== 'string') return null;
  const [seg, fn] = name.split(':');
  const m = CUSTOM[seg];
  return m && typeof m[fn] === 'function' ? m[fn] : null;
}

// 125th Street's centreline (docs/notes/ar33-corridor.json `line`): the face of a lot that fronts it is 'front'
const C125 = [[852.63, -3961.22], [875.29, -3930.42], [913.82, -3874.88], [986.65, -3769.12], [1079.23, -3634.59], [1095.7, -3610.53],
  [1127, -3563.37], [1190.38, -3467.66], [1259.28, -3367.04], [1323.07, -3267.38], [1379.33, -3182.1], [1448.76, -3142.6], [1568.42, -3075.42],
  [1688.6, -3009.58], [1805.25, -2944.55], [1935.74, -2871.79], [2047.62, -2809.59], [2174.76, -2738.9], [2306.01, -2665.95], [2438.99, -2592.04],
  [2575.31, -2516.58], [2722.99, -2434.2], [2847.34, -2365.22], [2982.4, -2290.23], [3193.31, -2172.97], [3371.37, -2074.03]];
function nearC125(x, z) {
  let best = null, bd = 1e9;
  for (let i = 0; i + 1 < C125.length; i++) {
    const [ax, az] = C125[i], [bx, bz] = C125[i + 1], ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2));
    const px = ax + ex * t, pz = az + ez * t, d = Math.hypot(x - px, z - pz);
    if (d < bd) { bd = d; best = [px, pz]; }
  }
  return [best, bd];
}

// ------------------------------------------------------------------ buckets: per cell, per level, per material
class Cell {
  // T: the far-merge square this cell lies in ({ org, far: Map }), or null (per cell)
  constructor(org, T = null) { this.org = org; this.lv = [new Map(), new Map()]; this.objs = []; this.T = T; }
  sink(mat, near, shadow) {
    // AR34: a tint variant of a shared set material writes into its base material's sink (the tint goes per vertex)
    const base = (mat.userData && mat.userData.fkBase) || mat;
    const m = !near && this.T && (FKMERGET || !base.transparent) ? this.T.far : this.lv[near ? 1 : 0];
    let e = m.get(base);
    if (!e) m.set(base, (e = { mat: base, S: new Sink(), shadow: !!shadow }));
    else if (shadow) e.shadow = true;
    return e.S;
  }
  // the offset from this cell's origin to the origin of the sink sink() hands out (the merge square's when merged)
  merged(mat, near) { const base = (mat.userData && mat.userData.fkBase) || mat; return !near && !!this.T && (FKMERGET || !base.transparent); }
}
// the cell at (cx, cz) in a tile's cell map (and its far-merge square, kept on the map as cells.T)
function cellAt(cells, cx, cz) {
  const ck = `${Math.floor(cx / CELL)}_${Math.floor(cz / CELL)}`;
  let cell = cells.get(ck);
  if (cell) return cell;
  const org = [(Math.floor(cx / CELL) + 0.5) * CELL, (Math.floor(cz / CELL) + 0.5) * CELL];
  let T = null;
  if (FCELL > CELL) {
    if (!cells.T) cells.T = new Map();
    const tk = `${Math.floor(org[0] / FCELL)}_${Math.floor(org[1] / FCELL)}`;
    T = cells.T.get(tk);
    if (!T) cells.T.set(tk, (T = { org: [(Math.floor(org[0] / FCELL) + 0.5) * FCELL, (Math.floor(org[1] / FCELL) + 0.5) * FCELL], far: new Map() }));
  }
  cells.set(ck, (cell = new Cell(org, T)));
  return cell;
}

// ------------------------------------------------------------------ the building context
// B: { spec, ring, y0, h, cell, F (front frame), mats, seed, b (compiled record) } and the emit helpers bound to it
function makeB(rec, ctx, cells) {
  const spec = rec.spec;
  const prim = rec.rings.find((r) => r.primary) || rec.rings[0];
  const b = prim.b;
  let ring0 = spec.ring && spec.ring.length >= 3 ? normRing(spec.ring.map((p) => [+p[0], +p[1]])) : prim.ring.slice();
  // drop a closing duplicate, merge collinear edges (a face is one straight wall); edge indices map through emap
  if (ring0.length > 3 && Math.hypot(ring0[0][0] - ring0[ring0.length - 1][0], ring0[0][1] - ring0[ring0.length - 1][1]) < 0.01) ring0.pop();
  const cm = cleanRingMap(ring0);
  const ring = cm.ring, emap = cm.map;
  // a cleaned edge is blind when every original edge in it is
  let blind = 0;
  if (!spec.ring) {
    const bm = b.blind >>> 0, all = new Array(ring.length).fill(true);
    for (let e = 0; e < ring0.length; e++) if (!(e < 32 && ((bm >>> e) & 1))) all[emap[e]] = false;
    all.forEach((v, i) => { if (v && i < 32) blind |= 1 << i; });
  }
  let cx = 0, cz = 0;
  for (const [x, z] of ring) { cx += x; cz += z; }
  cx /= ring.length; cz /= ring.length;
  const cell = cellAt(cells, cx, cz);
  // the front: the edge facing 125th Street (nearest, facing it), else the compiled front, else the longest
  const n = ring.length;
  let front = -1;
  const [, dC] = nearC125(cx, cz);
  if (dC < 90) {
    let bd = 1e9;
    for (let i = 0; i < n; i++) {
      const a = ring[i], c = ring[(i + 1) % n], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < 2) continue;
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2, nx = (c[1] - a[1]) / L, nz = -(c[0] - a[0]) / L;
      const [p, d] = nearC125(mx, mz);
      const fac = ((p[0] - mx) * nx + (p[1] - mz) * nz) / Math.max(d, 1e-3);
      if (fac < 0.6) continue;
      if (d < bd) { bd = d; front = i; }
    }
  }
  if (front < 0 && !spec.ring && b.frontIdx >= 0 && b.frontIdx < ring0.length) front = emap[b.frontIdx];
  if (front < 0) { let bl = 0; for (let i = 0; i < n; i++) { const a = ring[i], c = ring[(i + 1) % n], L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L > bl) { bl = L; front = i; } } }
  // the sidewalk in front
  const fa = ring[front], fb = ring[(front + 1) % n], fL = Math.hypot(fb[0] - fa[0], fb[1] - fa[1]);
  const fnx = (fb[1] - fa[1]) / fL, fnz = -(fb[0] - fa[0]) / fL;
  const y0 = ctx.padYNear((fa[0] + fb[0]) / 2 + fnx * 1.2, (fa[1] + fb[1]) / 2 + fnz * 1.2);
  const h = +(spec.h ?? b.height);
  const seed = Math.floor(hash(spec.id || `${cx},${cz}`) * 997);
  const roof = spec.roof || {};
  const parH = roof.parapet ? +(roof.parapet.h ?? 0.9) : (roof.kind && roof.kind !== 'flat' ? 0 : 0.85);
  const B = { spec, rec, ring, n, emap, cx, cz, cell, front, y0, h, parH, seed, b, ctx, org: cell.org, blind, tris: 0, objs: [], we: [seed, +y0.toFixed(2), +(y0 + h).toFixed(1)] };
  // the compiled wall colour as a default
  const hex = (r, g, bb) => '#' + [r, g, bb].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  B.compiledTint = hex(b.r, b.g, b.b);
  B.wallDef = spec.wall || { mat: styleMat(b.style), tint: B.compiledTint, dirt: 0.35 };
  return B;
}
function styleMat(style) {
  switch (style) {
    case 3: case 11: return 'panel_grey';
    case 8: case 9: return 'stone_lime';
    case 10: case 13: return 'stucco';
    case 2: case 12: return 'brick_tan';
    default: return 'brick_red';
  }
}
// a material for this building (the grime layer measured from its sidewalk and roof line)
function M(B, m, extra = {}) {
  if (!m) m = {};
  if (typeof m === 'string') m = { mat: m };
  const name = m.mat || m.name || 'brick_red';
  const wallish = /^(brick|stone|brownstone|granite|terracotta|concrete|stucco|cast|limestone|precast|marble)/.test(name);
  // AR34: a set's surface options go through to MATS's pbrMaterial (chips, rough, nrm, scale, opacity, mapping; metal for
  // 'plain'): { mat: 'metal_painted', tint, chips: 0 } is a smooth painted sheet
  const xo = {};
  for (const k of ['chips', 'rough', 'nrm', 'scale', 'opacity', 'mapping', 'metal', 'pitch', 'dir', 'env', 'body']) { const v = m[k] ?? extra[k]; if (v !== undefined && v !== null) xo[k] = v; }
  // (AR34 w2, MATS 03:19: a vision glass's own grid and room through `kit.mat('glass_vision', { storey, bay, bayAt, ... })`)
  if (/^glass_vision/.test(name)) for (const k of [...VISION_KEYS, 'seed']) { const v = m[k] ?? extra[k]; if (v !== undefined && v !== null) xo[k] = v; }
  // the kit's own sinks carry aWeather (seed, baseY, topY) per vertex, so a set and tint is one material for every
  // building that uses it; a custom builder's own meshes take the per-building options (extra.noWeather)
  if (wallish && !extra.noWeather) return kitMat(name, { tint: m.tint || extra.tint, dirt: m.dirt ?? extra.dirt, bond: m.bond, grime: !!extra.grime, weather: true, ...xo });
  // (a custom builder's material, noWeather, may go on a mesh of its own: never a shared handle)
  const mm = kitMat(name, {
    tint: m.tint || extra.tint, dirt: m.dirt ?? extra.dirt, bond: m.bond,
    seed: wallish ? B.seed : undefined, baseY: wallish ? +B.y0.toFixed(2) : undefined, topY: wallish ? +(B.y0 + B.h).toFixed(1) : undefined,
    grime: wallish && extra.grime, ...xo, ...(extra.noWeather ? { share: false } : {}),
  });
  // AR34 w2 s5 (draw calls): what a custom builder draws with it through the kit's sinks (kit.box / extrude / poly) goes into
  // the set's shared material instead (the building's weather and the tint per vertex, as the kit's own pieces): one mesh per
  // set and square instead of one per building (wall sets) or per tint (metals, 'plain'); see the frame API's resolveMat
  if (extra.noWeather && FKSHARE && mm && mm.userData && !mm.userData.fkSinkAs && !mm.transparent) mm.userData.fkSinkAs = { m: { ...m }, extra: { ...extra, noWeather: false } };
  return mm;
}
// S(B, mat): the sink for mat in B's cell, as a view that stamps every vertex it writes with the writer's own per-vertex
// data (aWeather: the building's seed / base / top; aFkTr: a shared set material's tint ratio), so two writers of one sink
// (two tints of brick_red on one building) never pick up each other's; gfn (the grime function) stays the sink's own
const ONE3 = [1, 1, 1];
// (dx, dz: the writer's cell origin from the sink's origin, when the sink is a far-merge square's)
class SV {
  constructor(s, we, tr, dx = 0, dz = 0, bo = null) { this.s = s; this.we = we; this.tr = tr; this.dx = dx; this.dz = dz; this.bo = bo; }
  v(x, y, z, nx, ny, nz, tu, tv, g) { const s = this.s; s.we = this.we; s.tr = this.tr; s.bo = this.bo; return s.v(x + this.dx, y, z + this.dz, nx, ny, nz, tu, tv, g); }
  tri(a, b, c) { this.s.tri(a, b, c); }
  color(n0, r, g, b) { this.s.color(n0, r, g, b); }
  get n() { return this.s.n; }
  tiltN(i, ax, ay, az) { this.s.tiltN(i, ax, ay, az); }
  get tris() { return this.s.tris; }
  get gfn() { return this.s.gfn; }
  set gfn(f) { this.s.gfn = f; }
}
// (AR34 w2 s6, MATS 06:16: a writer's dirt rides in aWeather.w (weD: the building's weather with it, cached on B); an opaque glass
// writer's body and dirt in aPgBody)
const NEG4 = [-1, -1, -1, -1];
function weD(B, d) {
  if (d === undefined || !B.we) return B.we;
  const m = B._weD || (B._weD = new Map());
  let w = m.get(d);
  if (!w) { w = [B.we[0], B.we[1], B.we[2], d]; m.set(d, w); }
  return w;
}
const S = (B, mat, near = false, shadow = !near) => {
  const u = mat.userData || {};
  const c = B.cell, mg = c.merged(mat, near);
  return new SV(c.sink(mat, near, shadow), u.pbr && u.pbr.opts && u.pbr.opts.weatherAttr ? weD(B, u.fkDirt) : null, u.fkTr || (u.fkShared ? ONE3 : null),
    mg ? c.org[0] - c.T.org[0] : 0, mg ? c.org[1] - c.T.org[1] : 0, u.fkBo || (u.fkGlassShared ? NEG4 : null));
};

// ------------------------------------------------------------------ the face frame of edge i, in the cell's origin
function faceFrame(B, i) { return edgeFrame(B.ring, i, B.y0, B.org); }
function edgeLen(B, i) { const a = B.ring[i], c = B.ring[(i + 1) % B.n]; return Math.hypot(c[0] - a[0], c[1] - a[1]); }
// FACE.edge -> the ring edge index: 'front', 'corner' (the other street wall of a corner lot), 'rear', an index, or a
// segment [x0, z0, x1, z1] (the ring edge nearest to it)
function resolveEdge(B, e) {
  const n = B.n;
  if (e === undefined || e === null || e === 'front') return B.front;
  if (typeof e === 'number') { const k = ((e % B.emap.length) + B.emap.length) % B.emap.length; return B.emap[k]; }
  const nrm = (i) => { const a = B.ring[i], c = B.ring[(i + 1) % n], L = edgeLen(B, i) || 1; return [(c[1] - a[1]) / L, -(c[0] - a[0]) / L]; };
  const fN = nrm(B.front);
  if (e === 'corner' || e === 'side') {
    // AR34 (BID1: on 383, 2329 and 350 the longest perpendicular edge was the party wall): the longest perpendicular edge
    // that is neither blind in the compiled record nor against another compiled building; failing that, the old rule
    let best = -1, bl = 0, best0 = -1, bl0 = 0;
    for (let i = 0; i < n; i++) {
      if (i === B.front || ((B.blind >> i) & 1)) continue;
      const [nx, nz] = nrm(i), d = nx * fN[0] + nz * fN[1], L = edgeLen(B, i);
      if (Math.abs(d) >= 0.5) continue;
      if (L > bl0) { bl0 = L; best0 = i; }
      if (L > bl && !partyWall(B, i)) { bl = L; best = i; }
    }
    return best >= 0 ? best : best0;
  }
  if (e === 'rear') {
    let best = -1, bs = 1e9;
    for (let i = 0; i < n; i++) { const [nx, nz] = nrm(i), d = nx * fN[0] + nz * fN[1]; const s = d - edgeLen(B, i) * 0.001; if (d < -0.5 && s < bs) { bs = s; best = i; } }
    return best;
  }
  if (Array.isArray(e) && e.length >= 4) {
    const mx = (e[0] + e[2]) / 2, mz = (e[1] + e[3]) / 2;
    let best = -1, bd = 1e9;
    for (let i = 0; i < n; i++) {
      const a = B.ring[i], c = B.ring[(i + 1) % n];
      const d = Math.hypot((a[0] + c[0]) / 2 - mx, (a[1] + c[1]) / 2 - mz);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  return -1;
}

// is edge i against another compiled building (a party wall)? Points 1.5 m out from the edge at a quarter, the middle and
// three quarters, tested against the tile's other compiled footprints (cached per tile); two of three inside = a party wall
const _rings = new WeakMap();
function tileRings(ctx) {
  if (!ctx || !ctx.tile || !ctx.tile.S || !ctx.tile.S.bldgXZ) return [];
  let R = _rings.get(ctx.tile);
  if (R) return R;
  R = [];
  const XZ = ctx.tile.S.bldgXZ, ox = ctx.ox, oz = ctx.oz;
  try {
    for (const b of buildingsOf(ctx.tile)) {
      const ring = [];
      let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
      for (let i = 0; i < b.len; i++) { const x = XZ[(b.start + i) * 2] + ox, z = XZ[(b.start + i) * 2 + 1] + oz; ring.push([x, z]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      R.push({ ring, box: [x0, z0, x1, z1], i: b.i });
    }
  } catch (e) { /* no footprints: nothing is a party wall */ }
  _rings.set(ctx.tile, R);
  return R;
}
function inRingXZ(ring, x, z) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; }
  return c;
}
function partyWall(B, i) {
  const R = tileRings(B.ctx);
  if (!R.length) return false;
  const a = B.ring[i], c = B.ring[(i + 1) % B.n], L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
  const nx = (c[1] - a[1]) / L, nz = -(c[0] - a[0]) / L;
  const own = new Set((B.rec && B.rec.rings ? B.rec.rings : []).map((r) => r.b && r.b.i));
  let hits = 0;
  for (const t of [0.25, 0.5, 0.75]) {
    const px = a[0] + (c[0] - a[0]) * t + nx * 1.5, pz = a[1] + (c[1] - a[1]) * t + nz * 1.5;
    if (inRingXZ(B.ring, px, pz)) continue;
    if (R.some((r) => !own.has(r.i) && px > r.box[0] && px < r.box[2] && pz > r.box[1] && pz < r.box[3] && inRingXZ(r.ring, px, pz))) hits++;
  }
  return hits >= 2;
}

// ================================================================== windows
const WIN_DEF = { w: 1.1, h: 1.7, sill: 0.8, kind: 'dh', lights: '1/1', frame: 'alu_white', reveal: 0.14,
  lintel: { kind: 'flat', mat: 'stone_lime', h: 0.22 }, sillStone: { mat: 'stone_lime', h: 0.1, proj: 0.05 }, ac: 0.12, blinds: 0.55, lit: 0.35 };
const ROOM_TONES = [[0.46, 0.42, 0.37], [0.36, 0.33, 0.3], [0.52, 0.5, 0.46], [0.3, 0.3, 0.32], [0.44, 0.38, 0.33], [0.4, 0.4, 0.38]];
// mostly white and cream roller blinds and vertical slats; now and then a coloured curtain (muted, as sun-faded cloth reads)
const BLIND_TONES = [[0.93, 0.91, 0.86], [0.88, 0.86, 0.8], [0.95, 0.95, 0.94], [0.82, 0.78, 0.7], [0.72, 0.7, 0.66], [0.93, 0.91, 0.86],
  [0.9, 0.88, 0.84], [0.86, 0.8, 0.62], [0.95, 0.94, 0.9], [0.6, 0.36, 0.3], [0.4, 0.44, 0.52], [0.8, 0.74, 0.64]];
// the vertices a closure writes into a sink get one colour (interiors, goods, blinds: vertex-coloured materials)
function withColor(S2, rgb, fn) { const n0 = S2.n; fn(); S2.color(n0, rgb[0], rgb[1], rgb[2]); }
// sinks that carry vertex colours need them for every vertex (interiors)
// the room behind an opening: a closed box wider than the opening (the look through the glass), facing inward
function room(B, F, o) {
  const { u0, u1, y0, y1, w0, depth, lit, widen = 0.8, shop = false } = o;
  const mat = kitMat(shop ? 'int_shop' : lit ? 'int_lit' : 'int_dark');
  const Sr = S(B, mat, false, false);
  // a room seen through its window from the street reads dark by day (the eye is set for the wall's sunlight); a lit one
  // keeps its colour, a share of the dark ones are lit a little by a lamp or a screen
  const rs = shop ? 1 : lit ? 1.1 : 0.4;
  const tone = [o.tone[0] * rs, o.tone[1] * rs, o.tone[2] * rs];
  const a = u0 - widen, c = u1 + widen, wb = w0 - depth;
  const ceil = [tone[0] * 1.25, tone[1] * 1.25, tone[2] * 1.25], floor = [tone[0] * 0.55, tone[1] * 0.5, tone[2] * 0.45];
  const side = [tone[0] * 0.85, tone[1] * 0.85, tone[2] * 0.85];
  withColor(Sr, tone, () => quadW(Sr, F, a, c, y0, y1, wb));                                         // back wall
  withColor(Sr, side, () => { quadU(Sr, F, a, y0, y1, wb, w0, 1); quadU(Sr, F, c, y0, y1, wb, w0, -1); });
  withColor(Sr, ceil, () => quadY(Sr, F, a, c, y1, wb, w0, -1));
  withColor(Sr, floor, () => quadY(Sr, F, a, c, y0, wb, w0, 1));
  // the inside of the wall round the opening, seen past the frame at a grazing angle
  withColor(Sr, side, () => {
    quadW(Sr, F, a, u0, y0, y1, w0, true); quadW(Sr, F, u1, c, y0, y1, w0, true);
    quadW(Sr, F, u0, u1, o.oy1, y1, w0, true); quadW(Sr, F, u0, u1, y0, o.oy0, w0, true);
  });
  if (shop || o.k === undefined) return;
  // a piece of furniture against the back wall (a wardrobe, a shelf, a sofa back), in the room's own colour darkened
  const hk = hash(B.seed, o.k, 21.1);
  if (hk < 0.7 && c - a > 1.4) {
    const fw2 = 0.8 + hash(B.seed, o.k, 22.2) * 1.2, fu = a + 0.2 + (c - a - fw2 - 0.4) * hash(B.seed, o.k, 23.3);
    const fh = hk < 0.35 ? 0.85 : 1.6 + hash(B.seed, o.k, 24.4) * 0.5;
    const ft = [tone[0] * 0.62, tone[1] * 0.58, tone[2] * 0.55];
    withColor(Sr, ft, () => box(Sr, F, fu, fu + fw2, y0, Math.min(y1 - 0.1, y0 + fh), wb + 0.02, wb + 0.5, 0, SK.NW | SK.NY));
  }
  // a lit room's ceiling light
  if (lit) {
    const Sl = S(B, kitMat('int_shopLight'), false, false);
    const lu = (u0 + u1) / 2 + (hash(B.seed, o.k, 25.5) - 0.5) * 0.6, lw = w0 - depth * (0.35 + hash(B.seed, o.k, 26.6) * 0.3);
    quadY(Sl, F, lu - 0.18, lu + 0.18, y1 - 0.01, lw - 0.18, lw + 0.18, -1);
  }
}
// (the kit's interior tones are given as display values, as the other cloth tones here)
const sheerRGB = (h) => (/^#[0-9a-f]{6}$/i.test(h || '') ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) : null);
// a vertical strip of cloth hung in folds: a zigzag in depth of amplitude amp, one segment per ~10 cm
function foldedPanel(Sb, F, ua, ub, y0, y1, w, amp) {
  const n = Math.max(2, Math.round((ub - ua) / 0.1)), dw = (ub - ua) / n;
  let wa = w;
  for (let i = 0; i < n; i++) {
    const a = ua + i * dw, c = a + dw, wc = w + ((i + 1) % 2) * amp;
    poly(Sb, F, [[a, y0, wa], [c, y0, wc], [c, y1, wc], [a, y1, wa]], -(wc - wa) / dw, 0, 1);
    wa = wc;
  }
}
// the dressing of a window as seen from the street: a roller blind, venetian slats, curtains drawn to the sides
function dressing(B, F, o) {
  const { iu0, iu1, iy0, iy1, rv, lit, k } = o;
  const wd = iu1 - iu0, ht = iy1 - iy0;
  // AR34 (BID1 6) a sheer: a full-height light curtain drawn across the whole window a hand behind the pane, softly
  // folded
  if (o.sheer) {
    // (AR34 w2: one flat panel, the folds soft in the texture; the 10 cm zigzag read as hard grey stripes, s381 w2b1)
    const Sb = S(B, kitMat(lit ? 'int_sheerLit' : 'int_sheer'), true, false);
    const c = o.sheerTone || [0.85, 0.84, 0.8];
    const j = 0.94 + hash(B.seed, k, 12.4) * 0.08;
    const jb = j * 2.4;
    withColor(Sb, [c[0] * jb, c[1] * jb, c[2] * jb], () => quadW(Sb, F, iu0 + 0.01, iu1 - 0.01, iy0 + 0.01, iy1 - 0.01, -rv - 0.11));
    return;
  }
  const hk = hash(B.seed, k, 41.3), down = 0.15 + hash(B.seed, k, 9.9) * 0.75;
  // (AR34 w2 b1: x 1.8 by day, as the sheers' x 2.4 above: a blind hangs a hand behind the glass in the window's daylight,
  // where the kit's interiors are trimmed to 0.3; the white blinds of s351 read grey-blue at 1)
  const bk = lit ? 1 : 1.8, bt0 = BLIND_TONES[Math.floor(hash(B.seed, k, 5.5) * BLIND_TONES.length)];
  const bt = [bt0[0] * bk, bt0[1] * bk, bt0[2] * bk];
  const wz = -rv - 0.13;
  if (lit || hk < 0.36) {
    // a roller: the cloth and a bottom bar
    const Sb = S(B, kitMat(lit ? 'int_blindLit' : 'int_blind'), true, false);
    const by0 = Math.max(iy0 + 0.05, iy1 - ht * down);
    withColor(Sb, bt, () => quadW(Sb, F, iu0 + 0.01, iu1 - 0.01, by0, iy1, wz));
    withColor(Sb, [bt[0] * 0.78, bt[1] * 0.78, bt[2] * 0.78], () => box(Sb, F, iu0 + 0.01, iu1 - 0.01, by0 - 0.025, by0, wz - 0.006, wz + 0.014, 0.003));
  } else if (hk < 0.63) {
    // venetian slats pulled down, a head rail and a bottom rail
    const Sb = S(B, kitMat('int_slats'), true, false);
    const by0 = Math.max(iy0 + 0.06, iy1 - ht * (0.3 + down * 0.7));
    const c = [bt[0] * 0.92, bt[1] * 0.92, bt[2] * 0.9];
    withColor(Sb, c, () => quadW(Sb, F, iu0 + 0.012, iu1 - 0.012, by0, iy1 - 0.035, wz));
    withColor(Sb, [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8], () => { box(Sb, F, iu0 + 0.01, iu1 - 0.01, iy1 - 0.04, iy1, wz - 0.012, wz + 0.016, 0.004); box(Sb, F, iu0 + 0.012, iu1 - 0.012, by0 - 0.018, by0, wz - 0.006, wz + 0.01, 0.003); });
  } else {
    // curtains drawn to the two sides (or one side), hung from a rod to the sill or a hand above it
    const Sb = S(B, kitMat('int_curtain'), true, false);
    const cols = [[0.86, 0.84, 0.78], [0.7, 0.62, 0.52], [0.52, 0.2, 0.2], [0.25, 0.32, 0.42], [0.9, 0.9, 0.88], [0.36, 0.4, 0.32], [0.58, 0.5, 0.62], [0.78, 0.7, 0.52]];
    const c0 = cols[Math.floor(hash(B.seed, k, 6.6) * cols.length)], ck = lit ? 1 : 1.5, c = [c0[0] * ck, c0[1] * ck, c0[2] * ck];
    const len = ht * (0.8 + hash(B.seed, k, 7.1) * 0.22), y0 = Math.max(iy0 + 0.02, iy1 - len - 0.03);
    const pw = Math.min(wd * 0.42, 0.18 + wd * 0.2 + hash(B.seed, k, 8.2) * 0.18);
    const oneSide = hash(B.seed, k, 3.9) < 0.22;
    withColor(Sb, c, () => {
      foldedPanel(Sb, F, iu0 + 0.012, iu0 + 0.012 + pw, y0, iy1 - 0.03, wz, 0.02);
      if (!oneSide) foldedPanel(Sb, F, iu1 - 0.012 - pw, iu1 - 0.012, y0, iy1 - 0.03, wz, 0.02);
    });
    withColor(Sb, [0.2, 0.18, 0.16], () => box(Sb, F, iu0, iu1, iy1 - 0.045, iy1 - 0.03, wz - 0.01, wz + 0.04, 0.004));
  }
}
// a drip stain on the wall (an air conditioner's condensate, rust from iron) hanging from yTop for len metres
function stain(B, F, uc, hw, yTop, len, kind = 'drip') {
  const Sx = S(B, kitStainMat(kind), true, false);
  quadWT(Sx, F, uc - hw, uc + hw, yTop - len, yTop, 0.003, 0, 0, 1, 1);
}
// the glass of a window: the kit's own (each pane carries its reflectance, dirt and clarity in its vertex colour) unless the
// spec names a glass set (a tinted or tower glass: MATS's)
function glassOf(T) { return !T.glass || T.glass === 'glass_clear' || T.glass === 'glass_window' ? 'int_winglass' : T.glass; }
function pane(B, Sg, F, u0, u1, y0, y1, w, k, sub, tilt = 0.02) {
  const hs = (n) => hash(B.seed, k, sub, n);
  withColor(Sg, [0.5 + hs(1) * 0.85, 0.35 + hs(2) * 1.15, B.sheerPane ? 1.6 + hs(4) * 0.06 : hs(3) < 0.05 ? 0.5 : 0.92 + hs(4) * 0.12],
    () => paneT(Sg, F, u0, u1, y0, y1, w, B.seed * 131 + u0 * 17 + y0 * 7 + sub, tilt));
}
// a window of type T in the opening [ua, ub] x [ya, yb] of face F; fy0 / fy1 the floor's slab levels (the room)
function windowAt(B, F, T, ua, ub, ya, yb, fy0, fy1, k, o = {}) {
  const rv = T.reveal ?? 0.14, kind = T.kind || 'dh';
  const wallM = o.wallM;
  const h0 = hash(B.seed, k, 3.1), h1 = hash(B.seed, k, 7.7), h2 = hash(B.seed, k, 11.3);
  // the reveal returns, in the wall's material
  const sillS = T.sillStone === null || T.sillStone === false ? null : { mat: 'stone_lime', h: 0.1, proj: 0.05, ...(T.sillStone || {}) };
  const JC = T.jamb ?? 0.015;
  const AR = kind === 'arch' ? archOf(T, ua, ub, yb) : null;
  reveal(S(B, wallM), F, { u0: ua, u1: ub, y0: ya, y1: AR ? AR.ys : yb }, rv, { noBottom: !!sillS, jc: JC, noTop: !!AR });
  if (AR) {
    archWall(S(B, wallM), F, AR, ua - JC, ub + JC, yb, rv);
    const L0 = T.lintel;
    if (L0 && (L0.kind === 'arch' || L0.kind === 'keystone')) {
      const lm = M(B, L0), lh = +(L0.h ?? 0.25), pr = L0.proj ?? 0.02;
      archBand(S(B, lm, false, true), F, AR, lh, pr, -0.01);
      if (L0.kind === 'keystone') { const kw = Math.min(0.24, (ub - ua) * 0.18); box(S(B, lm, false, true), F, AR.uc - kw / 2, AR.uc + kw / 2, yb - 0.02, yb + lh + 0.05, -0.02, pr + 0.03, 0.008, SK.NW); }
    }
  }
  if (JC > 0) {
    const Sj = S(B, wallM);
    poly(Sj, F, [[ua - JC, ya, 0], [ua, ya, -JC], [ua, yb, -JC], [ua - JC, yb, 0]], 0.7071, 0, 0.7071);
    poly(Sj, F, [[ub + JC, ya, 0], [ub + JC, yb, 0], [ub, yb, -JC], [ub, ya, -JC]], -0.7071, 0, 0.7071);
  }
  if (!sillS) quadY(S(B, wallM), F, ua, ub, ya, -rv, 0, 1);
  if (o.lite && (kind === 'dh' || kind === 'casement' || kind === 'fixed')) { windowLite(B, F, T, ua, ub, ya, yb, fy0, fy1, k, o, rv, sillS); return; }
  // the stone sill with its drip, the lugs into the wall
  if (sillS) {
    const sh = +sillS.h, pj = +sillS.proj, lug = sillS.lug ?? 0.07;
    const prof = [[-rv, 0], [pj, -0.018], [pj, -sh], [pj - 0.022, -sh], [pj - 0.022, -sh + 0.012], [pj - 0.036, -sh + 0.012], [pj - 0.036, -sh], [-0.01, -sh]];
    extrude(S(B, M(B, sillS), false, true), F, prof.map(([w, y]) => [w, ya + y]), ua - lug, ub + lug);
  }
  // the head
  const L = T.lintel === null || T.lintel === false || AR ? { kind: 'none' } : { kind: 'flat', mat: 'stone_lime', h: 0.22, ...(T.lintel || {}) };
  if (L.kind !== 'none') {
    // (AR34: flat heads stand 3 cm proud by default, their arrises chamfered to catch the light)
    // (AR34, BID4 4: a head never reaches past half the gap to the next window of its row)
    const lm = M(B, L), lh = +L.h, ext = Math.max(0, Math.min(+(L.ext ?? 0.1), o.maxExt ?? 9)), pr = L.proj ?? 0.03;
    const Sl = S(B, lm, false, true);
    if (L.kind === 'keystone') {
      box(Sl, F, ua - ext, ub + ext, yb, yb + lh, -0.02, pr, 0.012, SK.NW);
      const kc = (ua + ub) / 2, kw = Math.min(0.26, (ub - ua) * 0.2);
      poly(Sl, F, [[kc - kw / 2, yb - 0.04, pr + 0.035], [kc + kw / 2, yb - 0.04, pr + 0.035], [kc + kw * 0.7, yb + lh + 0.06, pr + 0.035], [kc - kw * 0.7, yb + lh + 0.06, pr + 0.035]], 0, 0, 1);
      box(Sl, F, kc - kw * 0.7, kc + kw * 0.7, yb + lh, yb + lh + 0.06, -0.02, pr + 0.035, 0.008, SK.NW);
      box(Sl, F, kc - kw / 2, kc + kw / 2, yb - 0.04, yb + lh, -0.02, pr + 0.03, 0.008, SK.NW);
    } else if (L.kind === 'jack' || L.kind === 'soldier') {
      // a flat arch of brick on end, its ends splayed
      const sp = lh * 0.35;
      poly(Sl, F, [[ua - 0.02, yb, pr], [ub + 0.02, yb, pr], [ub + 0.02 + sp, yb + lh, pr], [ua - 0.02 - sp, yb + lh, pr]], 0, 0, 1);
      quadY(Sl, F, ua - 0.02, ub + 0.02, yb, -0.02, pr, -1);
      quadY(Sl, F, ua - 0.02 - sp, ub + 0.02 + sp, yb + lh, -0.02, pr, 1);
      poly(Sl, F, [[ua - 0.02, yb, -0.02], [ua - 0.02, yb, pr], [ua - 0.02 - sp, yb + lh, pr], [ua - 0.02 - sp, yb + lh, -0.02]], -0.94, -0.33, 0);
      poly(Sl, F, [[ub + 0.02, yb, -0.02], [ub + 0.02 + sp, yb + lh, -0.02], [ub + 0.02 + sp, yb + lh, pr], [ub + 0.02, yb, pr]], 0.94, -0.33, 0);
    } else if (L.kind === 'hood' || L.kind === 'cornice') {
      // a moulded hood on the head (brownstones, Italianate tenements)
      const hp = [[-0.01, 0], [0.03, 0], [0.03, lh * 0.45], [0.075, lh * 0.62], [0.09, lh * 0.8], [0.09, lh], [-0.01, lh]];
      extrude(Sl, F, hp.map(([w, y]) => [w, yb + y]), ua - ext, ub + ext);
    } else {
      box(Sl, F, ua - ext, ub + ext, yb, yb + lh, -0.02, pr, 0.015, SK.NW);
    }
  }
  // the surround (an architrave round the opening)
  if (T.surround) {
    const sm = M(B, T.surround), sw = T.surround.w ?? 0.12, sp = T.surround.proj ?? 0.03;
    const Ss = S(B, sm, true, false);
    box(Ss, F, ua - sw, ua, ya, yb, -0.01, sp, 0.01, SK.NW);
    box(Ss, F, ub, ub + sw, ya, yb, -0.01, sp, 0.01, SK.NW);
    if (L.kind === 'none') box(Ss, F, ua - sw, ub + sw, yb, yb + sw, -0.01, sp, 0.01, SK.NW);
  }
  if (kind === 'blind') { quadW(S(B, wallM), F, ua, ub, ya, yb, -rv); return; }
  // AR34 'boarded': a plywood sheet over the opening, set just inside the reveal (weathered raw ply, or T.boardTint paint)
  if (kind === 'boarded') {
    const pm = M(B, { mat: T.board || 'wood_painted', tint: T.boardTint || (hash(B.seed, k, 31.7) < 0.6 ? '#a08560' : '#8a7a5c'), chips: 0, dirt: 0.5 });
    box(S(B, pm, false, true), F, ua + 0.01, ub - 0.01, ya + 0.01, yb - 0.01, -0.07, -0.045, 0.004, SK.NW);
    return;
  }
  if (kind === 'louvre') {
    const Sm = S(B, M(B, T.frame || 'metal_painted', { tint: '#6c6e6c' }), true, false);
    for (let y = ya + 0.03; y < yb - 0.03; y += 0.09) box(Sm, F, ua, ub, y, y + 0.012, -rv - 0.06, -rv - 0.02, 0.003);
    quadW(S(B, kitMat('int_dark')), F, ua, ub, ya, yb, -rv - 0.1);
    return;
  }
  // the frame (outer members), the sashes and their glass, the room behind
  const fm = M(B, frameMat(T.frame || 'alu_white', T.frameTint));
  const Sf = S(B, fm, true, false);
  const fw = T.frameW ?? 0.055, fd = 0.09, fz0 = -rv - fd, fz1 = -rv + 0.004;
  if (!AR) box(Sf, F, ua, ub, yb - fw, yb, fz0, fz1, 0.008, SK.NW | SK.PY);      // head (its top is under the soffit)
  box(Sf, F, ua, ua + fw, ya, AR ? AR.ys : yb - fw, fz0, fz1, 0.008, SK.NW);       // jambs
  box(Sf, F, ub - fw, ub, ya, AR ? AR.ys : yb - fw, fz0, fz1, 0.008, SK.NW);
  box(Sf, F, ua + fw, ub - fw, ya, ya + fw * 0.8, fz0, fz1 + 0.01, 0.008, SK.NW | SK.NY); // the frame sill
  const iu0 = ua + fw, iu1 = ub - fw, iy0 = ya + fw * 0.8, iy1 = yb - fw;
  const sheerW = hash(B.seed, k, 14.9) < (T.sheer ?? FKSHEER);
  B.sheerPane = sheerW;
  const glassM = kitMat(glassOf(T));
  const Sg = S(B, glassM, false, false);
  const lights = String(T.lights || '1/1').split('/').map((v) => Math.max(1, parseInt(v, 10) || 1));
  const sash = (sy0, sy1, sw0, sw1, lt, bot) => {
    const st = 0.045, tr = 0.05, br = bot ? 0.065 : 0.035;
    box(Sf, F, iu0, iu0 + st, sy0, sy1, sw0, sw1, 0, SK.NW | SK.NU);
    box(Sf, F, iu1 - st, iu1, sy0, sy1, sw0, sw1, 0, SK.NW | SK.PU);
    box(Sf, F, iu0 + st, iu1 - st, sy1 - tr, sy1, sw0, sw1, 0, SK.NW | SK.NU | SK.PU);
    box(Sf, F, iu0 + st, iu1 - st, sy0, sy0 + br, sw0, sw1, 0, SK.NW | SK.NU | SK.PU);
    const gu0 = iu0 + st, gu1 = iu1 - st, gy0 = sy0 + br, gy1 = sy1 - tr, gw = (sw0 + sw1) / 2;
    // muntins: lights '6/6' -> 3 x 2 panes in each sash
    const nl = lt;
    if (nl > 1) {
      const cols = nl % 3 === 0 ? 3 : nl % 2 === 0 ? 2 : nl, rows = Math.max(1, Math.round(nl / cols));
      for (let c = 1; c < cols; c++) { const u = gu0 + ((gu1 - gu0) * c) / cols; box(Sf, F, u - 0.011, u + 0.011, gy0, gy1, gw - 0.01, gw + 0.01, 0, SK.NW | SK.NY | SK.PY); }
      for (let r = 1; r < rows; r++) { const y = gy0 + ((gy1 - gy0) * r) / rows; box(Sf, F, gu0, gu1, y - 0.011, y + 0.011, gw - 0.01, gw + 0.01, 0, SK.NW | SK.NU | SK.PU); }
    }
    pane(B, Sg, F, gu0, gu1, gy0, gy1, gw, k, bot ? 1 : 2);
    return [gu0, gu1, gy0, gy1];
  };
  let lowTop = iy1;
  if (kind === 'dh') {
    const mid = iy0 + (iy1 - iy0) * (0.5 + (h2 - 0.5) * 0.08);
    sash(mid - 0.02, iy1, -rv - 0.042, -rv - 0.006, lights[0], false);               // the upper sash, outboard
    sash(iy0, mid + 0.02, -rv - 0.084, -rv - 0.048, lights[1] || lights[0], true);   // the lower sash
    lowTop = mid;
  } else if (kind === 'casement') {
    const um = (iu0 + iu1) / 2;
    const leaf = (a, c) => {
      const st = 0.045;
      box(Sf, F, a, a + st, iy0, iy1, -rv - 0.06, -rv - 0.012, 0, SK.NW); box(Sf, F, c - st, c, iy0, iy1, -rv - 0.06, -rv - 0.012, 0, SK.NW);
      box(Sf, F, a + st, c - st, iy1 - 0.05, iy1, -rv - 0.06, -rv - 0.012, 0, SK.NW | SK.NU | SK.PU); box(Sf, F, a + st, c - st, iy0, iy0 + 0.06, -rv - 0.06, -rv - 0.012, 0, SK.NW | SK.NU | SK.PU);
      pane(B, Sg, F, a + st, c - st, iy0 + 0.06, iy1 - 0.05, -rv - 0.036, k, 3 + Math.round(a * 10), 0.03);
    };
    if (iu1 - iu0 > 0.9) { leaf(iu0, um); leaf(um, iu1); } else leaf(iu0, iu1);
  } else if (kind === 'ribbon' || kind === 'storefront' || kind === 'fixed' || kind === 'arch' || kind === 'glassblock') {
    const nm = T.mullions ?? (kind === 'ribbon' ? Math.max(0, Math.round((iu1 - iu0) / 1.5) - 1) : 0);
    for (let m = 1; m <= nm; m++) { const u = iu0 + ((iu1 - iu0) * m) / (nm + 1); box(Sf, F, u - 0.03, u + 0.03, iy0, iy1, -rv - 0.08, -rv + 0.004, 0.006); }
    if (T.transom) { const ty = iy1 - T.transom; box(Sf, F, iu0, iu1, ty - 0.03, ty + 0.03, -rv - 0.08, -rv + 0.004, 0.006); }
    if (AR) {
      // the frame round the arc and a bar at the springing line; the rectangle below and the fan above
      archBand(Sf, F, AR, fw, -rv + 0.004, -rv - 0.08, -fw);
      box(Sf, F, iu0, iu1, AR.ys - 0.025, AR.ys + 0.025, -rv - 0.08, -rv + 0.004, 0.005, SK.NW);
      pane(B, Sg, F, iu0, iu1, iy0, AR.ys - 0.025, -rv - 0.04, k, 5);
      withColor(Sg, [0.9, 0.8, 1], () => archPane(Sg, F, AR, fw, -rv - 0.04));
    } else pane(B, Sg, F, iu0, iu1, iy0, iy1, -rv - 0.04, k, 6);
  }
  // AR34 (WEST's request) T.spandrel: { at (m over the opening's bottom), h (0.9), mat, tint }, or a list of them: an
  // opaque panel across a tall opening at a floor line (a two-storey window, a storefront's upper lights), in a frame bar
  // above and below, in front of the glass
  for (const SP of [].concat(T.spandrel || [])) {
    if (!SP) continue;
    const sy0 = ya + +(SP.at ?? (yb - ya) / 2 - 0.45), sy1 = Math.min(yb - 0.05, sy0 + +(SP.h ?? 0.9));
    if (!(sy1 - sy0 > 0.05)) continue;
    const pm = M(B, SP.mat ? { mat: SP.mat, tint: SP.tint } : { mat: 'plain', tint: SP.tint || '#4a4d50', rough: 0.5, metal: 0.2 });
    box(S(B, pm, false, true), F, iu0, iu1, sy0, sy1, -rv - 0.07, -rv - 0.03, 0.004, SK.NW);
    box(Sf, F, iu0, iu1, sy0 - 0.04, sy0, -rv - 0.09, -rv - 0.02, 0.004, SK.NW);
    box(Sf, F, iu0, iu1, sy1, sy1 + 0.04, -rv - 0.09, -rv - 0.02, 0.004, SK.NW);
  }
  // the room behind (lit after dark in a share of the windows), blinds or curtains in a share
  const lit = h0 < (T.lit ?? 0.35);
  const tone = ROOM_TONES[Math.floor(h1 * ROOM_TONES.length)];
  const widen = Math.max(0.05, Math.min(0.85, o.widen ?? 0.8));
  B.sheerPane = false;
  room(B, F, { u0: ua, u1: ub, y0: fy0 + 0.02, y1: Math.max(yb + 0.1, fy1 - 0.25), oy0: ya, oy1: yb, w0: -rv - 0.1, depth: 3.2, lit, tone, widen, k });
  if (sheerW) dressing(B, F, { iu0, iu1, iy0, iy1, rv, lit, k, sheer: true, sheerTone: sheerRGB(T.sheerTint) });
  else if (h2 < (T.blinds ?? 0.55)) dressing(B, F, { iu0, iu1, iy0, iy1, rv, lit, k });
  // window guards: two or three white bars across the lower sash (a share of the dh windows, T.guards)
  const hasAC = kind === 'dh' && hash(B.seed, k, 13.7) < (T.ac ?? 0.12) && iu1 - iu0 > 0.6;
  if (kind === 'dh' && !hasAC && hash(B.seed, k, 17.9) < (T.guards ?? 0.3)) {
    const Sgu = S(B, kitMat('alu_white'), true, false);
    const gz0 = -rv - 0.004, gz1 = -rv + 0.012;
    const nb2 = 2 + Math.floor(hash(B.seed, k, 18.8) * 2);
    for (let q = 0; q < nb2; q++) { const yy = iy0 + 0.12 + q * 0.14; box(Sgu, F, iu0 + 0.01, iu1 - 0.01, yy, yy + 0.016, gz0, gz1, 0); }
    for (const uu of [iu0 + 0.03, iu1 - 0.05]) box(Sgu, F, uu, uu + 0.02, iy0 + 0.08, iy0 + 0.16 + (nb2 - 1) * 0.14 + 0.02, gz0, gz1, 0);
  }
  // a window air conditioner in the lower sash (a share of the dh windows)
  if (hasAC) {
    const am = kitMat('plain', { tint: hash(B.seed, k, 47.1) < 0.7 ? '#d6d4cd' : '#bfc0bc', rough: 0.42, metal: 0.15 });
    const Sa = S(B, am, true, true);
    const aw = Math.min(0.66, iu1 - iu0 - 0.1), ac0 = (iu0 + iu1) / 2 - aw / 2 + (h1 - 0.5) * 0.1;
    box(Sa, F, ac0, ac0 + aw, iy0 + 0.01, iy0 + 0.39, -rv - 0.1, 0.24, 0.02);
    // its louvred grille and the control panel at one end
    const Sd = S(B, kitMat('plain', { tint: '#6f6e6a', rough: 0.55, metal: 0.2 }), true, false);
    for (let yy = iy0 + 0.07; yy < iy0 + 0.33; yy += 0.036) box(Sd, F, ac0 + 0.04, ac0 + aw * 0.72, yy, yy + 0.015, 0.236, 0.254, 0.001);
    box(Sd, F, ac0 + aw * 0.77, ac0 + aw - 0.04, iy0 + 0.07, iy0 + 0.33, 0.238, 0.247, 0.002);
    // side panels closing the sash gap
    box(Sd, F, iu0, ac0, iy0 + 0.02, iy0 + 0.38, -rv - 0.07, -rv - 0.05, 0);
    box(Sd, F, ac0 + aw, iu1, iy0 + 0.02, iy0 + 0.38, -rv - 0.07, -rv - 0.05, 0);
    // a bracket under the unit and the stain its condensate leaves on the wall below the sill
    box(Sd, F, ac0 + 0.04, ac0 + 0.06, ya - (sillS ? sillS.h : 0.04) - 0.2, iy0 + 0.01, 0.02, 0.04, 0.001);
    box(Sd, F, ac0 + aw - 0.06, ac0 + aw - 0.04, ya - (sillS ? sillS.h : 0.04) - 0.2, iy0 + 0.01, 0.02, 0.04, 0.001);
    if (hash(B.seed, k, 44.1) < 0.85) stain(B, F, ac0 + aw * (0.4 + hash(B.seed, k, 45.2) * 0.2), aw * 0.5, ya - (sillS ? sillS.h : 0.04) - 0.03,
      Math.max(0.5, Math.min(0.8 + hash(B.seed, k, 46.3) * 0.7, ya - fy0 + 0.5)), 'drip');
  }
  void lowTop;
}

// ---- arched heads. An opening [ua, ub] x [ya, yb] whose head is an arc: a semicircle (rise = half the width) or a
// segment (T.rise). The wall's rectangular hole is refilled round the arc, the soffit follows it, the head pane is a fan.
function archOf(T, ua, ub, yb) {
  const hw = (ub - ua) / 2, rise = Math.max(0.05, Math.min(hw, T.rise ?? hw));
  const R = (hw * hw + rise * rise) / (2 * rise), uc = (ua + ub) / 2, ys = yb - rise, cy = yb - R;
  const a0 = Math.asin(Math.min(1, hw / R));                    // half the arc's angle, from the vertical
  const n = Math.max(4, Math.round((a0 * 2 * R) / 0.12));       // ~12 cm segments
  const pts = [];                                               // left springing to right springing, over the crown
  for (let i = 0; i <= n; i++) { const t = -a0 + (2 * a0 * i) / n; pts.push([uc + R * Math.sin(t), cy + R * Math.cos(t)]); }
  return { uc, ys, cy, R, pts, rise };
}
// the wall round the arc (the two corners of the rectangular hole above it), and the arc's soffit back to depth d
function archWall(Sw, F, A, ua, ub, yb, d) {
  const P = A.pts, half = Math.floor(P.length / 2);
  for (let i = 0; i < half; i++) poly(Sw, F, [[ua, yb, 0], [P[i][0], P[i][1], 0], [P[i + 1][0], P[i + 1][1], 0]], 0, 0, 1);
  for (let i = half; i + 1 < P.length; i++) poly(Sw, F, [[ub, yb, 0], [P[i][0], P[i][1], 0], [P[i + 1][0], P[i + 1][1], 0]], 0, 0, 1);
  if (half < P.length - 1) poly(Sw, F, [[ua, yb, 0], [P[half][0], P[half][1], 0], [ub, yb, 0]], 0, 0, 1);
  for (let i = 0; i + 1 < P.length; i++) {
    const [u0, y0] = P[i], [u1, y1] = P[i + 1], mu = (u0 + u1) / 2, my = (y0 + y1) / 2;
    const nu = A.uc - mu, ny = A.cy - my;                        // the soffit faces the arc's centre
    poly(Sw, F, [[u0, y0, 0], [u1, y1, 0], [u1, y1, -d], [u0, y0, -d]], nu, ny, 0);
  }
}
// a flat ring band between the arc and the arc grown by t (a frame head, voussoirs), front face at w, with its edges
function archBand(Sb, F, A, t, w, wBack, inner = 0) {
  const P = A.pts;
  const grow = (p, g) => { const du = p[0] - A.uc, dy = p[1] - A.cy, L = Math.hypot(du, dy) || 1; return [p[0] + (du / L) * g, p[1] + (dy / L) * g]; };
  for (let i = 0; i + 1 < P.length; i++) {
    const a = grow(P[i], inner), b = grow(P[i + 1], inner), c = grow(P[i + 1], inner + t), d = grow(P[i], inner + t);
    poly(Sb, F, [[a[0], a[1], w], [b[0], b[1], w], [c[0], c[1], w], [d[0], d[1], w]], 0, 0, 1);
    // the outer edge (faces away from the centre) and the inner edge
    const mu = (c[0] + d[0]) / 2 - A.uc, my = (c[1] + d[1]) / 2 - A.cy;
    poly(Sb, F, [[d[0], d[1], wBack], [c[0], c[1], wBack], [c[0], c[1], w], [d[0], d[1], w]], mu, my, 0);
    poly(Sb, F, [[a[0], a[1], w], [b[0], b[1], w], [b[0], b[1], wBack], [a[0], a[1], wBack]], -mu, -my, 0);
  }
}
// the head pane: a fan from the springing line's centre to the arc shrunk by g, at depth w
function archPane(Sg, F, A, g, w) {
  const P = A.pts, pts = [[A.uc, A.ys, w]];
  for (const p of P) { const du = p[0] - A.uc, dy = p[1] - A.cy, L = Math.hypot(du, dy) || 1; pts.push([p[0] - (du / L) * g, Math.max(A.ys, p[1] - (dy / L) * g), w]); }
  poly(Sg, F, pts, 0, 0, 1);
}

// the light window: a box sill and head, a plain frame, one pane, the meeting rail, the room and the blind
function windowLite(B, F, T, ua, ub, ya, yb, fy0, fy1, k, o, rv, sillS) {
  if (sillS) {
    const sh = +sillS.h, pj = +sillS.proj, lug = sillS.lug ?? 0.07;
    box(S(B, M(B, sillS), false, true), F, ua - lug, ub + lug, ya - sh, ya, -rv, pj, 0, SK.NW);
  }
  const AR = T.kind === 'arch' ? archOf(T, ua, ub, yb) : null;
  if (AR) {
    archWall(S(B, o.wallM), F, AR, ua - (T.jamb ?? 0.015), ub + (T.jamb ?? 0.015), yb, rv);
    if (T.lintel && (T.lintel.kind === 'arch' || T.lintel.kind === 'keystone')) archBand(S(B, M(B, T.lintel), false, true), F, AR, +(T.lintel.h ?? 0.25), T.lintel.proj ?? 0.02, -0.01);
    { const Sg2 = S(B, kitMat(glassOf(T)), false, false); pane(B, Sg2, F, ua + 0.05, ub - 0.05, ya + 0.05, AR.ys, -rv - 0.05, k, 7); withColor(Sg2, [0.9, 0.8, 1], () => archPane(Sg2, F, AR, 0.05, -rv - 0.05)); }
    const h1a = hash(B.seed, k, 7.7);
    room(B, F, { u0: ua, u1: ub, y0: fy0 + 0.02, y1: Math.max(yb + 0.1, fy1 - 0.25), oy0: ya, oy1: yb, w0: -rv - 0.1, depth: 3.0, lit: hash(B.seed, k, 3.1) < (T.lit ?? 0.35), tone: ROOM_TONES[Math.floor(h1a * ROOM_TONES.length)], widen: Math.max(0.05, Math.min(0.85, o.widen ?? 0.8)) });
    return;
  }
  const L = T.lintel === null || T.lintel === false ? { kind: 'none' } : { kind: 'flat', mat: 'stone_lime', h: 0.22, ...(T.lintel || {}) };
  if (L.kind !== 'none') box(S(B, M(B, L), false, true), F, ua - (L.ext ?? 0.1), ub + (L.ext ?? 0.1), yb, yb + +L.h, -0.02, L.proj ?? 0.018, 0, SK.NW);
  const Sf = S(B, M(B, frameMat(T.frame || 'alu_white', T.frameTint)), true, false);
  const fw = T.frameW ?? 0.055, fz0 = -rv - 0.09, fz1 = -rv + 0.004;
  box(Sf, F, ua, ub, yb - fw, yb, fz0, fz1, 0, SK.NW | SK.PY);
  box(Sf, F, ua, ua + fw, ya, yb - fw, fz0, fz1, 0, SK.NW);
  box(Sf, F, ub - fw, ub, ya, yb - fw, fz0, fz1, 0, SK.NW);
  box(Sf, F, ua + fw, ub - fw, ya, ya + fw * 0.8, fz0, fz1 + 0.01, 0, SK.NW | SK.NY);
  const iu0 = ua + fw, iu1 = ub - fw, iy0 = ya + fw * 0.8, iy1 = yb - fw;
  if ((T.kind || 'dh') === 'dh') { const my = iy0 + (iy1 - iy0) * 0.5; box(Sf, F, iu0, iu1, my - 0.03, my + 0.03, -rv - 0.07, -rv - 0.02, 0, SK.NW | SK.NU | SK.PU); }
  else if (T.kind === 'casement' && iu1 - iu0 > 0.9) { const um = (iu0 + iu1) / 2; box(Sf, F, um - 0.03, um + 0.03, iy0, iy1, -rv - 0.07, -rv - 0.02, 0, SK.NW | SK.NY | SK.PY); }
  const sheerW = hash(B.seed, k, 14.9) < (T.sheer ?? FKSHEER);
  B.sheerPane = sheerW;
  pane(B, S(B, kitMat(glassOf(T)), false, false), F, iu0, iu1, iy0, iy1, -rv - 0.05, k, 8);
  B.sheerPane = false;
  const h0 = hash(B.seed, k, 3.1), h1 = hash(B.seed, k, 7.7), h2 = hash(B.seed, k, 11.3);
  const lit = h0 < (T.lit ?? 0.35);
  room(B, F, { u0: ua, u1: ub, y0: fy0 + 0.02, y1: Math.max(yb + 0.1, fy1 - 0.25), oy0: ya, oy1: yb, w0: -rv - 0.1, depth: 3.0, lit, tone: ROOM_TONES[Math.floor(h1 * ROOM_TONES.length)], widen: Math.max(0.05, Math.min(0.85, o.widen ?? 0.8)), k });
  if (sheerW) dressing(B, F, { iu0, iu1, iy0, iy1, rv, lit, k, sheer: true, sheerTone: sheerRGB(T.sheerTint) });
  else if (h2 < (T.blinds ?? 0.55)) dressing(B, F, { iu0, iu1, iy0, iy1, rv, lit, k });
}

// ---- the curtain wall: the zone [zu0, zu1] x [zy0, zy1] of a face as a glass grid: vertical mullion caps every ~C.mullion
// m, transom caps at each floor line (or every C.transom m), a spandrel band over each floor line, vision glass above it,
// an office behind every pane (lit in a share at night)
// AR34 w2 (BID4 2): `rows: [h | { h, spandrel }, ...]` from the zone's bottom up (a spandrel row is an opaque or shadow-box
// panel over its whole height, the others vision glass; the last row takes what is left), `w` the glass plane's depth
// behind the face (0.07; a block of glass set into a stone front 0.2-0.4), `tint` = glassTint; see curtain.zones
// AR34 w2 (MATS 01:11 / 03:19): a zone of MATS's vision glass (glass_vision*: the office behind the pane drawn in its shader)
// gets the zone's own grid: `storey` [floor height, a floor line] from the transom lines the kit draws here (every line but the
// zone's top carries a transom and the spandrel over it; the first row may be partial, so the spacing is the median of the
// others; `curtain.storey` wins, `false` leaves the room without floor lines), `bay` the mullion pitch, `bayAt` the zone's u0
// end in world [x, z] (a mullion), so the room's slab lines and the shade cells follow the panes; a seed per building and
// zone; the zone's blinds / sheers / glow / depth / trans / f0 / street / room go through. One material per zone (uniforms)
function visionOpts(B, F, C, zu0, pitch, lines, key) {
  const o = {};
  for (const k of VISION_KEYS) if (C[k] !== undefined && C[k] !== null && k !== 'storey' && k !== 'bay' && k !== 'bayAt') o[k] = C[k];
  if (C.storey !== undefined) { if (C.storey !== false && C.storey !== null) o.storey = C.storey; }
  else {
    const fl = lines.slice(0, -1), d = [];
    for (let j = 1; j < fl.length; j++) d.push(fl[j] - fl[j - 1]);
    const inner = (d.length > 1 ? d.slice(1) : d).slice().sort((p, q) => p - q);
    const h = inner.length ? inner[Math.floor(inner.length / 2)] : 0;
    if (h > 2.2 && h < 7) o.storey = [+h.toFixed(3), +fl[fl.length - 1].toFixed(3)];
  }
  o.bay = +(+(C.bay ?? pitch)).toFixed(4);
  const p0 = F.world(C.bayU ?? zu0, 0, 0);
  o.bayAt = [+p0[0].toFixed(3), +p0[2].toFixed(3)];
  o.seed = (B.seed * 7 + key * 13) % 997;
  return o;
}
function curtainWall(B, F, C, zu0, zu1, zy0, zy1, floors, wallM, key) {
  const Wd = zu1 - zu0, nb = Math.max(1, Math.round(Wd / (+C.mullion || 1.5))), pitch = Wd / nb;
  let lines = [];
  const spRow = [];
  if (Array.isArray(C.rows) && C.rows.length) {
    let y = zy0;
    for (const r of C.rows) { if (y >= zy1 - 0.05) break; lines.push(y); spRow.push(!!(r && typeof r === 'object' && r.spandrel)); y += Math.max(0.1, +(r && typeof r === 'object' ? r.h : r) || 1); }
  } else if (typeof C.transom === 'number') for (let y = zy0; y < zy1 - 0.4; y += C.transom) lines.push(y);
  else { lines = floors.map((f) => f.y0).filter((y) => y > zy0 + 0.3 && y < zy1 - 0.4); lines.unshift(zy0); }
  lines.push(zy1);
  const gw = -Math.max(0.02, +(C.w ?? 0.07)), md = C.mullionD ?? 0.13, mw = C.mullionW ?? 0.065;
  const fm = M(B, frameMat(C.frame, C.frameTint));
  const Sc = S(B, fm, false, true);
  // the glass set with its options (an opaque tower glass takes `body`, its colour behind the reflection)
  const vo = /^glass_vision/.test(C.glass || '') ? visionOpts(B, F, C, zu0, pitch, lines, key) : null;
  const glass = kitMat(C.glass || 'glass_blue', { tint: C.glassTint ?? C.tint, body: C.body, opacity: C.opacity, ...(vo || {}) });
  const Sg = S(B, glass, false, false);
  const spGlass = !C.spandrel || /^glass/.test(C.spandrel);
  // (a vision glass zone's glass spandrel: the spandrel's own glass set when the spec names one (`spandrel: 'glass_grey'`, its
  // `spandrelTint`) over the dark shadow box, else the zone's coated pane without the room (`room: 0`, its body behind it);
  // the vision glass's room, floor and desks had shown through the spandrel band)
  const spSet = vo && spGlass && C.spandrel && !/^glass_vision/.test(C.spandrel) ? C.spandrel : null;
  const Ssp = !(vo && spGlass) ? Sg : S(B, spSet ? kitMat(spSet, { tint: C.spandrelTint, body: C.spandrelBody })
    : kitMat(C.glass, { tint: C.glassTint ?? C.tint, body: C.spandrelBody ?? C.body, room: 0, f0: vo.f0, street: vo.street }), false, false);
  const spM = spGlass ? kitMat('int_dark') : M(B, C.spandrel);
  const spH = C.spandrelH ?? 0.95;
  // the returns round the zone
  reveal(S(B, wallM), F, { u0: zu0, u1: zu1, y0: zy0, y1: zy1 }, -gw + 0.02, {});
  for (let f = 0; f + 1 < lines.length; f++) {
    const la = lines[f], lb = lines[f + 1];
    const sp = spRow.length ? (spRow[f] ? lb - la : 0) : f === 0 && C.firstSpandrel === false ? 0 : Math.min(spH, (lb - la) * 0.45);
    // the spandrel: an opaque panel (or a dark shadow box behind glass)
    if (sp > 0) {
      if (spGlass) { withColor(S(B, spM, false, false), [0.12, 0.13, 0.15], () => quadW(S(B, spM, false, false), F, zu0, zu1, la, la + sp, gw - 0.12)); paneW(Ssp, F, zu0, zu1, la, la + sp, gw, B.seed + f * 3.1, 0.004); }
      else quadW(S(B, spM, false, true), F, zu0, zu1, la, la + sp, gw - 0.005);
    }
    for (let j = 0; j < nb; j++) {
      const a = zu0 + j * pitch, c = a + pitch;
      paneW(Sg, F, a + mw / 2, c - mw / 2, la + sp, lb, gw, B.seed * 17 + key * 3 + f * 31 + j * 7, 0.008);
      // an opaque tower glass (glass_tower*) hides what is behind it: no offices, no blinds
      if (!glass.transparent) continue;
      const kk = key * 1000 + f * 97 + j;
      // (AR34 w2, WEST: `interior: 'office_bright'` (or `dayLit`) lights the offices by day as a shop is lit, The Forum)
      room(B, F, { u0: a + mw / 2, u1: c - mw / 2, y0: la + 0.02, y1: lb - 0.02, oy0: la + sp, oy1: lb, w0: gw - 0.03, depth: 4.5,
        lit: hash(B.seed, kk, 3.1) < (C.lit ?? 0.45), tone: ROOM_TONES[Math.floor(hash(B.seed, kk, 7.7) * ROOM_TONES.length)], widen: 0,
        shop: C.interior === 'office_bright' || !!C.dayLit });
      if (hash(B.seed, kk, 11.3) < (C.blinds ?? 0.35)) {
        const Sb = S(B, kitMat('int_blind'), true, false);
        const down = 0.1 + hash(B.seed, kk, 9.9) * 0.6;
        withColor(Sb, [0.86, 0.85, 0.82], () => quadW(Sb, F, a + mw / 2 + 0.01, c - mw / 2 - 0.01, lb - (lb - la - sp) * down, lb - 0.02, gw - 0.05));
      }
    }
    // the transom caps: at the floor line and on top of the spandrel
    box(Sc, F, zu0, zu1, la - 0.035, la + 0.035, gw, gw + md * 0.85, 0.008, SK.NW);
    if (sp > 0) box(Sc, F, zu0, zu1, la + sp - 0.03, la + sp + 0.03, gw, gw + md * 0.6, 0.006, SK.NW);
  }
  box(Sc, F, zu0, zu1, zy1 - 0.04, zy1, gw, gw + md, 0.008, SK.NW);
  // the mullion caps, full height
  for (let j = 0; j <= nb; j++) {
    const u = zu0 + j * pitch;
    box(Sc, F, Math.max(zu0, u - mw / 2), Math.min(zu1, u + mw / 2), zy0, zy1, gw, gw + md, 0.008, SK.NW);
  }
}

// ================================================================== the storefront
const STORE_DEF = { glazing: { bulkhead: 0.45, transom: 0.6, mullions: 2, frame: 'alu_clear' }, door: { u: 0.5, w: 1.0, kind: 'glass', recess: 1.2 } };
// a frame set: clear anodised aluminium reads mid grey (its own tint read as white bars), the
// others keep their sets' tints; `tint` (or a { mat, tint } object) as given
// AR34 (BID4 1): dark anodised / painted frames ('alu_black', 'alu_dark', a dark tint on any alu set) are a painted finish,
// not a mirror: as a metal set they took the blue sky into every black frame ("navy" by day); a smooth dark paint instead
const DARK_ALU = /^alu_(black|dark)$/;
const lum = (hex) => { if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return 1; const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
function frameMat(f, tint) {
  const o = f && typeof f === 'object' ? f : { mat: f || 'alu_clear', tint };
  const name = o.mat || 'alu_clear';
  const t = o.tint || (name === 'alu_clear' ? '#8f9396' : undefined);
  if (DARK_ALU.test(name) || (/^(alu|stainless|steel_black)/.test(name) && t && lum(t) < 0.16)) return { mat: 'plain', tint: t || '#1d1e20', rough: o.rough ?? 0.42, metal: 0.12 };
  return { ...o, mat: name, tint: t };
}
const SHOP_TONES = { shop_clothing: [0.62, 0.6, 0.57], shop_food: [0.7, 0.68, 0.62], shop_phone: [0.72, 0.72, 0.74], bank: [0.6, 0.61, 0.64],
  restaurant: [0.46, 0.34, 0.25], fastfood: [0.62, 0.58, 0.54], pharmacy: [0.78, 0.78, 0.78], empty: [0.36, 0.35, 0.34], default: [0.6, 0.58, 0.55] };
function storeBay(B, F, bay, H, o) {
  const u0 = +bay.u0, u1 = +bay.u1, wallM = o.wallM;
  const g = { ...STORE_DEF.glazing, ...(bay.glazing || {}) };
  const sr = bay.setback ?? 0.22;                       // the storefront plane behind the pier face
  const fr = M(B, frameMat(g.frame, g.frameTint));
  const Sf = S(B, fr, true, false), Sfc = S(B, fr, false, false);
  // AR34: the kit's own storefront glass (the canyon's reflection, a dirt film) unless the spec names a set
  // (AR34 w2 b1, HPT: `glazing.frosted: true` or `glass: 'glass_frosted'`: a milky pane that hides the room, lit from
  // behind after dark; the room behind it is not drawn)
  const frosted = g.frosted === true || g.glass === 'glass_frosted';
  const glass = kitMat(frosted ? 'int_frosted' : g.glass || 'int_shopglass');
  const Sg = S(B, glass, false, false);
  const retM = o.retM || wallM;
  // the returns of the opening back to the storefront plane
  reveal(S(B, retM), F, { u0, u1, y0: 0, y1: H }, sr, { noBottom: true });
  const bh = g.bulkhead ?? 0.45, tr = g.transom ?? 0.6, fw = Math.max(0.03, Math.min(0.12, +(g.frameW ?? 0.05))), fd = 0.12;
  const zf = -sr, zb = -sr - fd;
  // the door (a recessed vestibule), when the bay has one
  const hasDoor = bay.door !== null && bay.door !== false && bay.kind !== 'window';
  const D = { ...STORE_DEF.door, ...(bay.door || {}) };
  const dw = Math.min(+D.w * (D.kind === 'double' ? 2 : 1), u1 - u0 - 0.4);
  const du = u0 + (u1 - u0) * (D.u ?? 0.5);
  const d0 = Math.max(u0 + fw, du - dw / 2 - 0.06), d1 = Math.min(u1 - fw, du + dw / 2 + 0.06);
  const rec = hasDoor ? Math.max(0, +(D.recess ?? 1.2)) : 0;
  const ty = H - tr;                                    // the transom bar
  const doorTop = Math.min(ty, 2.35);
  // the kickplate / bulkhead and the display glazing either side of the door
  const km = M(B, g.kick || 'alu_clear');
  const Sk = S(B, km, false, false);
  const spans = hasDoor ? [[u0, d0], [d1, u1]] : [[u0, u1]];
  for (const [a, c] of spans) {
    if (c - a < 0.08) continue;
    box(Sk, F, a, c, 0, bh, zb, zf, 0.006, SK.NY);
    // the raised panels of the bulkhead: a field inset from the edges, proud of the face
    if (bh > 0.22 && c - a > 0.5) {
      const pn = Math.max(1, Math.round((c - a) / 1.1)), pwid = (c - a) / pn;
      for (let q = 0; q < pn; q++) box(Sk, F, a + q * pwid + 0.07, a + (q + 1) * pwid - 0.07, 0.07, bh - 0.06, zf - 0.004, zf + 0.012, 0.004, SK.NW);
    }
    // mullions
    const nm = Math.max(0, Math.round(((c - a) / (u1 - u0)) * (g.mullions ?? 2)));
    const cuts = [a];
    for (let m = 1; m <= nm; m++) cuts.push(a + ((c - a) * m) / (nm + 1));
    cuts.push(c);
    for (const u of cuts) box(Sf, F, Math.max(a, u - fw / 2 - (u === a ? 0 : 0)), Math.min(c, u + fw / 2), bh, ty, zb, zf + 0.004, 0.006);
    // the pressure plate over each inner mullion: a narrow cap standing a little proud
    for (let m = 1; m + 1 < cuts.length; m++) box(Sf, F, cuts[m] - fw / 2 - 0.008, cuts[m] + fw / 2 + 0.008, bh + fw, ty - fw / 2, zf + 0.004, zf + 0.015, 0.003, SK.NW);
    box(Sfc, F, a, c, bh, bh + fw, zb, zf + 0.012, 0.006);           // the sill rail
    for (let m = 0; m + 1 < cuts.length; m++) paneW(Sg, F, cuts[m] + fw / 2, cuts[m + 1] - fw / 2, bh + fw, ty - fw / 2, zf - fd / 2, B.seed * 7 + cuts[m] * 13, 0.006);
  }
  // the transom: bar and glass across the bay
  box(Sfc, F, u0, u1, ty - fw / 2, ty + fw / 2, zb, zf + 0.004, 0.006);
  box(Sfc, F, u0, u1, H - fw, H, zb, zf + 0.004, 0.006);             // the head
  if (tr > 0.12) {
    const nt = Math.max(1, Math.round((u1 - u0) / 1.6));
    for (let m = 1; m < nt; m++) { const u = u0 + ((u1 - u0) * m) / nt; box(Sf, F, u - fw / 2, u + fw / 2, ty + fw / 2, H - fw, zb, zf + 0.004, 0.006); }
    quadW(Sg, F, u0 + fw, u1 - fw, ty + fw / 2, H - fw, zf - fd / 2);
  }
  // the vestibule and the door
  if (hasDoor) {
    const zd = zf - rec;
    const Sv = S(B, fr, true, false);
    // glazed sides of the recess (display returns), the soffit above, the floor
    for (const [u, sg] of [[d0, 1], [d1, -1]]) {
      box(Sv, F, u - fw / 2, u + fw / 2, 0, doorTop, zd, zf, 0.005);
      if (rec > 0.3) {
        box(Sk, F, u - fw / 2, u + fw / 2, 0, bh, zd, zf, 0.004);
        poly(Sg, F, [[u, bh, zd + 0.05], [u, bh, zf - 0.05], [u, doorTop, zf - 0.05], [u, doorTop, zd + 0.05]], sg, 0, 0);
      }
    }
    if (rec > 0.05) {
      quadY(S(B, M(B, g.soffit || 'panel_alu', { tint: '#3a3b3d' }), false, false), F, d0, d1, doorTop, zd, zf, -1);
      quadY(S(B, M(B, 'granite_grey', { tint: '#5d5c5a' }), false, false), F, d0, d1, 0.012, zd, zf, 1);
      // the wall over the door between the transom and the soffit
      if (ty - doorTop > 0.02) quadW(S(B, fr, false, false), F, d0, d1, doorTop, ty - fw / 2, zd);
    }
    // the door leaf (or pair): a glass door in a wide-stile aluminium frame, a push bar
    const leaves = D.kind === 'double' ? 2 : 1, lw = (d1 - d0 - 0.12) / leaves;
    for (let l = 0; l < leaves; l++) {
      const a = d0 + 0.06 + l * lw, c = a + lw;
      const st = 0.11;
      box(Sv, F, a, a + st, 0, doorTop - 0.05, zd - 0.05, zd, 0.006); box(Sv, F, c - st, c, 0, doorTop - 0.05, zd - 0.05, zd, 0.006);
      box(Sv, F, a + st, c - st, doorTop - 0.16, doorTop - 0.05, zd - 0.05, zd, 0.006); box(Sv, F, a + st, c - st, 0, 0.25, zd - 0.05, zd, 0.006);
      if (D.kind === 'solid') box(Sv, F, a + st, c - st, 0.25, doorTop - 0.16, zd - 0.04, zd - 0.01, 0.004);
      else quadW(Sg, F, a + st, c - st, 0.25, doorTop - 0.16, zd - 0.025);
      box(S(B, kitMat('alu_clear'), true, false), F, a + 0.12, c - 0.12, 0.98, 1.02, zd, zd + 0.06, 0.008);
      // the closer over the leaf and the vertical pull on the stile
      box(S(B, kitMat('alu_clear'), true, false), F, c - 0.5, c - 0.14, doorTop - 0.2, doorTop - 0.145, zd + 0.0, zd + 0.06, 0.006);
      box(S(B, kitMat('alu_clear'), true, false), F, c - 0.1, c - 0.075, 0.82, 1.22, zd + 0.045, zd + 0.075, 0.005);
    }
    // threshold strip, and downlights in the soffit
    if (rec > 0.3) {
      box(S(B, kitMat('alu_clear'), true, false), F, d0, d1, 0, 0.02, zd - 0.04, zd + 0.04, 0.004);
      const Sdl = S(B, kitMat('int_shopLight'), true, false);
      for (let q = 0; q < Math.max(1, Math.round((d1 - d0) / 0.9)); q++) { const uq = d0 + ((q + 0.5) * (d1 - d0)) / Math.max(1, Math.round((d1 - d0) / 0.9)); quadY(Sdl, F, uq - 0.07, uq + 0.07, doorTop - 0.004, zd + rec * 0.4 - 0.07, zd + rec * 0.4 + 0.07, -1); }
    }
    box(Sv, F, d0, d1, doorTop - 0.05, doorTop, zd - 0.06, zd, 0.005);
  }
  // the shop behind the glass
  // bay.interior: a kind, or { kind, tone: '#rrggbb', lit } (a dark shop, a dim one); bay.lit the light level (1)
  const IO = typeof bay.interior === 'object' && bay.interior ? bay.interior : { kind: bay.interior };
  const interior = IO.kind || 'default';
  const hexRgb = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
  const tone = IO.tone ? hexRgb(IO.tone) : SHOP_TONES[interior] || SHOP_TONES.default;
  const lvl = Math.max(0, Math.min(1.5, Math.round((IO.lit ?? bay.lit ?? 1) * 4) / 4));
  if (!frosted) shopRoom(B, F, { u0, u1, H, zf: zf - fd, rec, d0, d1, hasDoor, tone, toneSet: !!IO.tone, interior, k: o.k, lvl });
  // the security gate: its box over the opening, the guides at the jambs, the curtain down a share
  const gt = bay.gate || {};
  if (gt.kind !== 'none' && gt.box !== false && (bay.gate || o.gates)) {
    // a painted steel housing, smooth (BID1 a1: the chipped paint scan read as marble at 0.34 m); gate.mat for a set
    const gm = M(B, gt.mat ? { mat: gt.mat, tint: gt.color || '#8e9396', dirt: gt.dirt ?? 0.08, chips: gt.chips ?? 0, nrm: gt.nrm ?? 0.35 }
      : { mat: 'plain', tint: gt.color || '#8e9396', rough: 0.5, metal: 0.25 });
    const Sgb = S(B, gm, false, true);
    const gy0 = H - 0.34;
    if (B.proud) B.proud.push({ u0: u0 - 0.04, u1: u1 + 0.04, y0: gy0, y1: H + 0.02, w: 0.34 });
    box(Sgb, F, u0 - 0.04, u1 + 0.04, gy0, H + 0.02, -0.01, 0.34, 0.015, SK.NW);
    const Sgg = S(B, gm, true, false);
    box(Sgg, F, u0 - 0.02, u0 + 0.05, 0, gy0, -0.01, 0.07, 0.004, SK.NW);
    box(Sgg, F, u1 - 0.05, u1 + 0.02, 0, gy0, -0.01, 0.07, 0.004, SK.NW);
    const down = +(gt.down || 0);
    if (down > 0.01) {
      // the curtain: 75 mm slats (texture and normal map, fk/kitTex.js), tags on a share (gate.graffiti, 0.35), the
      // bottom bar and its handle; the curtain hangs a hand in front of the guides' slot
      const yb = gy0 - (gy0 - 0.0) * Math.min(1, down);
      const Sc = S(B, gt.mat ? gm : kitShutterMat(gt.color || '#8e9396', 0), false, true);
      quadW(Sc, F, u0 + 0.02, u1 - 0.02, yb, gy0, 0.03);
      // graffiti where the reference shows it: gate.graffiti = a density 0..1 or { density, style, seed, bandTop }
      const GF = gt.graffiti, gfo = GF && typeof GF === 'object' ? GF : { density: typeof GF === 'number' ? GF : FKGRAF ? 0.8 : 0 };
      if ((gfo.density ?? 0.7) > 0.01 && gy0 - yb > 0.4) {
        const wM = u1 - u0 - 0.04, hM = gy0 - yb;
        const tx = graffitiTex(wM, hM, gfo.seed ?? Math.floor(hash(B.seed, o.k, 63.1) * 9973), { density: gfo.density ?? 0.7, style: gfo.style, slats: !gt.mat, bandTop: gfo.bandTop ?? 0.06 });
        quadW(S(B, kitGraffitiMat(tx, wM, hM, u0 + 0.02, yb, { slats: !gt.mat }), false, false), F, u0 + 0.02, u1 - 0.02, yb, gy0, 0.034);
      }
      const Sr2 = S(B, gm, true, false);
      box(Sr2, F, u0 + 0.02, u1 - 0.02, yb, yb + 0.06, 0.02, 0.065, 0.008);
      const hu = (u0 + u1) / 2;
      box(Sr2, F, hu - 0.12, hu + 0.12, yb + 0.07, yb + 0.1, 0.06, 0.09, 0.005);
    }
  }
}
// bay.interior -> the kind of wall texture (fk/kitTex.js) and its default tone
// (AR34 w2 b1, BID3: 'fastfood' = a counter-service restaurant: the restaurant's walls in their lit menu-board variants, the
// tables and the counter; 'restaurant' keeps the wood and bottle-shelf variants)
const SHOP_KIND = { shop_clothing: 'clothing', shop_food: 'food', shop_phone: 'phone', pharmacy: 'pharmacy', restaurant: 'restaurant', fastfood: 'restaurant', bank: 'bank', empty: 'empty', default: 'default' };
function shopRoom(B, F, o) {
  const { u0, u1, H, zf, tone } = o;
  const lvl = o.lvl ?? 1;
  const mat = kitMat('int_shop@' + lvl);
  const Sr = S(B, mat, false, false);
  const depth = 6.5, zb = zf - depth, top = H + 0.25;
  const wall = tone, ceil = [Math.min(1, tone[0] * 1.08), Math.min(1, tone[1] * 1.08), Math.min(1, tone[2] * 1.08)], floor = [tone[0] * 0.45, tone[1] * 0.43, tone[2] * 0.4];
  const kind = SHOP_KIND[o.interior] || 'default';
  const variant = Math.floor(hash(B.seed, o.k, 3.3) * 4);
  const VS = o.interior === 'fastfood' ? [2, 3] : kind === 'restaurant' ? [0, 1] : [0, 1, 2, 3], vOf = (t) => VS[(variant + t) % VS.length];
  // the tint of the textured walls: white, or the spec's own tone against the kind's default grey
  const tm = o.toneSet ? [Math.min(1.4, tone[0] / 0.6), Math.min(1.4, tone[1] / 0.6), Math.min(1.4, tone[2] / 0.6)] : [1, 1, 1];
  const hh = Math.min(top, SHOP_H);
  let t = 0;
  for (let a = u0; a < u1 - 1e-3; a += SHOP_W, t++) {
    const c = Math.min(a + SHOP_W, u1), fr = (c - a) / SHOP_W, flip = t % 2 === 1;
    const St = S(B, kitShopWallMat(kind, vOf(t), lvl), false, false);
    withColor(St, tm, () => quadWT(St, F, a, c, 0, hh, zb, flip ? 1 : 0, 0, flip ? 1 - fr : fr, hh / SHOP_H));
    if (top > SHOP_H + 0.01) withColor(Sr, ceil, () => quadW(Sr, F, a, c, SHOP_H, top, zb));
  }
  // the side walls carry the same wall, laid along the depth
  const Ss = S(B, kitShopWallMat(kind, vOf(2), lvl), false, false);
  withColor(Ss, [tm[0] * 0.9, tm[1] * 0.9, tm[2] * 0.9], () => {
    quadUT(Ss, F, u0 + 0.01, 0, hh, zb, zf, 1, 0, 0, depth / SHOP_W, hh / SHOP_H);
    quadUT(Ss, F, u1 - 0.01, 0, hh, zb, zf, -1, depth / SHOP_W, 0, 0, hh / SHOP_H);
  });
  if (top > SHOP_H + 0.01) withColor(Sr, [wall[0] * 0.9, wall[1] * 0.9, wall[2] * 0.9], () => { quadU(Sr, F, u0 + 0.01, SHOP_H, top, zb, zf, 1); quadU(Sr, F, u1 - 0.01, SHOP_H, top, zb, zf, -1); });
  withColor(Sr, ceil, () => quadY(Sr, F, u0, u1, top, zb, zf, -1));
  withColor(Sr, floor, () => quadY(Sr, F, u0, u1, 0.01, zb, zf, 1));
  // ceiling light panels (bright by day too, the look of a lit shop)
  const Sl = S(B, kitMat('int_shopLight'), true, false);
  for (let zz = zf - 1.2; zz > zb + 0.6; zz -= 1.8) {
    for (let u = u0 + 1.0; u < u1 - 0.6; u += 2.2) quadY(Sl, F, u - 0.3, u + 0.3, top - 0.01, zz - 0.3, zz + 0.3, -1);
  }
  // what is in the shop, by kind (docs/notes/ar33-spec.md BASE bay.interior)
  if (o.interior !== 'empty') shopContents(B, F, { ...o, zb, zf, top });
  // the display: a backdrop behind the glass on either side of the door, posters on it and on the glass
  if (o.interior !== 'empty' && o.interior !== 'bank') windowDisplay(B, F, { ...o, zb, zf, top });
}
// the display window: many shops close the window with a backdrop panel a metre behind the glass, bare or papered with
// posters; posters are also taped to the glass itself
function windowDisplay(B, F, o) {
  const { u0, u1, zf, H, hasDoor, d0, d1, k } = o;
  const hk = hash(B.seed, k, 51.7);
  const spans = hasDoor ? [[u0 + 0.06, d0 - 0.02], [d1 + 0.02, u1 - 0.06]] : [[u0 + 0.06, u1 - 0.06]];
  const pal = [[0.88, 0.88, 0.85], [0.1, 0.1, 0.11], [0.55, 0.57, 0.6], [0.5, 0.36, 0.24], [0.78, 0.74, 0.66], [0.2, 0.26, 0.34], [0.72, 0.28, 0.26]];
  // (AR34 w2 b1: a backdrop in a third of the clothing and phone shops (was half): it hid the mannequins of CAPSULE, s381)
  const back = o.interior === 'restaurant' || o.interior === 'fastfood' ? hk < 0.12 : hk < (o.interior === 'shop_clothing' || o.interior === 'shop_phone' ? 0.33 : 0.28);
  const Sp = S(B, kitMat('int_shop@' + (o.lvl ?? 1)), false, false);
  const Sx = S(B, kitPosterMat(o.lvl ?? 1), false, false);
  const col = pal[Math.floor(hash(B.seed, k, 52.1) * pal.length)];
  const yTop = Math.min(2.5, H - 0.7), zbk = zf - 0.6 - hash(B.seed, k, 53.2) * 0.9;
  let pi = 0;
  const poster = (a, c, y0, y1, w) => {
    const idx = Math.floor(hash(B.seed, k, 60 + pi++) * POSTER_COLS * POSTER_ROWS), cx = idx % POSTER_COLS, cy = Math.floor(idx / POSTER_COLS);
    const e = 0.004, tu0 = cx / POSTER_COLS + e, tu1 = (cx + 1) / POSTER_COLS - e, tv1 = 1 - cy / POSTER_ROWS - e, tv0 = 1 - (cy + 1) / POSTER_ROWS + e;
    quadWT(Sx, F, a, c, y0, y1, w, tu0, tv0, tu1, tv1);
  };
  for (const [a, c] of spans) {
    if (c - a < 0.7) continue;
    if (back) {
      withColor(Sp, col, () => box(Sp, F, a, c, 0.02, yTop, zbk - 0.05, zbk, 0.004, SK.NW));
      // posters pasted on the backdrop
      const np = Math.min(3, Math.floor((c - a) / 0.9));
      for (let q = 0; q < np; q++) {
        if (hash(B.seed, k, 70 + q, a) < 0.35) continue;
        const pw = 0.45 + hash(B.seed, k, 71 + q, a) * 0.3, ph = pw * 1.5, uc = a + (c - a) * ((q + 0.5) / np);
        poster(uc - pw / 2, uc + pw / 2, Math.min(yTop - ph - 0.1, 0.9 + hash(B.seed, k, 72 + q, a) * 0.5), Math.min(yTop - 0.1, 0.9 + hash(B.seed, k, 72 + q, a) * 0.5 + ph), zbk + 0.003);
      }
    }
    // taped to the inside of the glass: a few, small, at the usual heights
    const ng = Math.floor(hash(B.seed, k, 80, a) * 3.2);
    for (let q = 0; q < ng; q++) {
      const pw = 0.22 + hash(B.seed, k, 81 + q, a) * 0.2, ph = pw * 1.5;
      const uc = a + 0.2 + hash(B.seed, k, 82 + q, a) * Math.max(0.1, c - a - 0.4), y0 = 1.0 + hash(B.seed, k, 83 + q, a) * 0.9;
      if (uc + pw / 2 > c || uc - pw / 2 < a) continue;
      poster(uc - pw / 2, uc + pw / 2, y0, y0 + ph, o.zf + 0.05);
    }
  }
}
const GOODS = [[0.6, 0.22, 0.2], [0.24, 0.3, 0.48], [0.72, 0.68, 0.58], [0.16, 0.16, 0.17], [0.7, 0.48, 0.24], [0.34, 0.46, 0.3], [0.8, 0.8, 0.78], [0.46, 0.16, 0.3], [0.14, 0.32, 0.36]];
const CLOTH = [[0.08, 0.08, 0.09], [0.9, 0.9, 0.88], [0.62, 0.1, 0.1], [0.15, 0.2, 0.42], [0.55, 0.52, 0.45], [0.2, 0.35, 0.22], [0.85, 0.72, 0.2], [0.42, 0.28, 0.2], [0.75, 0.45, 0.6], [0.3, 0.3, 0.32]];
const SKIN = [[0.93, 0.91, 0.87], [0.93, 0.91, 0.87], [0.12, 0.12, 0.13], [0.55, 0.4, 0.3]];
// a display mannequin at (u, w): legs, torso, arms, head, dressed in two colours
function mannequin(Sg, F, u, w, seed) {
  const top = CLOTH[Math.floor(hash(seed, 1) * CLOTH.length)], bot = CLOTH[Math.floor(hash(seed, 2) * CLOTH.length)];
  const skin = SKIN[Math.floor(hash(seed, 3) * SKIN.length)];
  const hs = 0.95 + hash(seed, 4) * 0.1;
  withColor(Sg, [0.2, 0.2, 0.21], () => box(Sg, F, u - 0.16, u + 0.16, 0, 0.03, w - 0.16, w + 0.16, 0.01));
  withColor(Sg, bot, () => { box(Sg, F, u - 0.15, u - 0.02, 0.03, 0.95 * hs, w - 0.07, w + 0.07, 0.02); box(Sg, F, u + 0.02, u + 0.15, 0.03, 0.95 * hs, w - 0.07, w + 0.07, 0.02); });
  withColor(Sg, top, () => {
    box(Sg, F, u - 0.19, u + 0.19, 0.93 * hs, 1.5 * hs, w - 0.11, w + 0.11, 0.04);
    box(Sg, F, u - 0.27, u - 0.19, 0.95 * hs, 1.46 * hs, w - 0.06, w + 0.06, 0.02); box(Sg, F, u + 0.19, u + 0.27, 0.95 * hs, 1.46 * hs, w - 0.06, w + 0.06, 0.02);
  });
  withColor(Sg, skin, () => { box(Sg, F, u - 0.05, u + 0.05, 1.5 * hs, 1.58 * hs, w - 0.05, w + 0.05, 0.015); box(Sg, F, u - 0.1, u + 0.1, 1.58 * hs, 1.82 * hs, w - 0.11, w + 0.11, 0.05); });
}
// a clothes rail from u0 to u1 at depth w with garments on hangers
function rail(Sg, F, u0, u1, w, seed, y = 1.35) {
  withColor(Sg, [0.72, 0.73, 0.75], () => {
    box(Sg, F, u0, u1, y, y + 0.03, w - 0.015, w + 0.015, 0.005);
    box(Sg, F, u0, u0 + 0.03, 0, y, w - 0.015, w + 0.015, 0.005); box(Sg, F, u1 - 0.03, u1, 0, y, w - 0.015, w + 0.015, 0.005);
  });
  let u = u0 + 0.06, k = 0;
  const band = Math.floor(hash(seed, 9) * CLOTH.length);
  while (u < u1 - 0.08) {
    const c = CLOTH[(band + Math.floor(hash(seed, k, 1) * 3)) % CLOTH.length];
    const len = 0.55 + hash(seed, k, 2) * 0.45;
    withColor(Sg, c, () => box(Sg, F, u, u + 0.035, y - len, y - 0.02, w - 0.23, w + 0.23, 0, SK.PY));
    u += 0.05 + hash(seed, k, 3) * 0.03; k++;
  }
}
// (AR34: the goods, garments and phones are plain boxes without their hidden faces: seen through glass from 3 m and more,
// their chamfers were 70 % of the shop's triangles)
function shopContents(B, F, o) {
  const { u0, u1, zb, zf, interior } = o;
  const Sg = S(B, kitMat('int_goods@' + (o.lvl ?? 1)), true, false);
  const kS = o.k * 7.13 + B.seed;
  const wid = u1 - u0, depth = zf - zb;
  const shelves = (a, c, w0, w1, rows = 4, y0 = 0.3, dy = 0.42) => {
    withColor(Sg, [0.3, 0.3, 0.32], () => box(Sg, F, a, c, 0, y0 + rows * dy, w0, w1, 0.01));
    for (let r = 0; r < rows; r++) {
      const y = y0 + r * dy;
      for (let u = a + 0.08; u < c - 0.25; u += 0.3) {
        const col = GOODS[Math.floor(hash(kS, u, r, w0) * GOODS.length)];
        const hh = 0.1 + hash(kS, u, r, 2) * 0.22;
        withColor(Sg, col, () => box(Sg, F, u, u + 0.24, y, y + hh, w1 - 0.02, w1 + 0.06 + hash(kS, u, r, 5) * 0.1, 0, SK.NW | SK.NY));
      }
    }
  };
  const table = (uc, wc, a, b2, h, col) => withColor(Sg, col, () => box(Sg, F, uc - a, uc + a, h - 0.05, h, wc - b2, wc + b2, 0.01));
  if (interior === 'shop_clothing' || interior === 'default') {
    // the window display: mannequins behind the glass; rails along the sides and down the middle; shelves at the back
    const nm = Math.max(1, Math.min(4, Math.floor(wid / 1.7)));
    for (let m = 0; m < nm; m++) {
      const u = u0 + ((m + 0.5) * wid) / nm + (hash(kS, m, 11) - 0.5) * 0.4;
      if (o.hasDoor && u > o.d0 - 0.3 && u < o.d1 + 0.3) continue;
      mannequin(Sg, F, u, zf - 0.55 - hash(kS, m, 12) * 0.3, kS + m);
    }
    rail(Sg, F, u0 + 0.3, u0 + 0.3 + Math.min(2.2, wid * 0.4), zb + 1.0 + depth * 0.2, kS + 21);
    rail(Sg, F, u1 - 0.3 - Math.min(2.2, wid * 0.4), u1 - 0.3, zb + 1.0 + depth * 0.35, kS + 22);
    if (wid > 4) rail(Sg, F, u0 + wid * 0.3, u0 + wid * 0.7, zb + depth * 0.55, kS + 23, 1.25);
  } else if (interior === 'shop_phone' || interior === 'pharmacy' || interior === 'shop_food') {
    if (interior !== 'shop_phone') {
      // gondolas running back from the front
      for (let u = u0 + 1.4; u < u1 - 1.0; u += 1.9) {
        withColor(Sg, [0.85, 0.85, 0.84], () => box(Sg, F, u - 0.35, u + 0.35, 0, 1.45, zb + 1.2, zf - 1.8, 0.01));
        for (let r = 0; r < 3; r++) for (let w = zb + 1.3; w < zf - 1.9; w += 0.32) {
          const col = GOODS[Math.floor(hash(kS, u, r, w) * GOODS.length)];
          withColor(Sg, col, () => { box(Sg, F, u - 0.45, u - 0.35, 0.3 + r * 0.42, 0.52 + r * 0.42, w, w + 0.26, 0, SK.PU | SK.NY); box(Sg, F, u + 0.35, u + 0.45, 0.3 + r * 0.42, 0.52 + r * 0.42, w, w + 0.26, 0, SK.NU | SK.NY); });
        }
      }
    } else {
      // a display counter with the phones on it
      table(u0 + wid * 0.5, zf - depth * 0.45, Math.min(1.4, wid * 0.3), 0.35, 0.95, [0.92, 0.92, 0.93]);
      for (let u = u0 + 0.6; u < u1 - 0.5; u += 0.5) withColor(Sg, [0.08, 0.08, 0.1], () => box(Sg, F, u, u + 0.08, 0.95, 1.1, zf - depth * 0.45 - 0.05, zf - depth * 0.45 + 0.05, 0, SK.NY));
    }
  } else if (interior === 'restaurant' || interior === 'fastfood') {
    // tables and chairs, a counter at the back, menu boards over it
    withColor(Sg, [0.35, 0.24, 0.16], () => box(Sg, F, u0 + 0.3, u1 - 0.3, 0, 1.05, zb + 0.6, zb + 1.2, 0.015));
    for (let u = u0 + 0.9; u < u1 - 0.7; u += 1.5) for (let w = zf - 1.0; w > zb + 2.0; w -= 1.6) {
      table(u, w, 0.35, 0.35, 0.75, [0.55, 0.4, 0.28]);
      withColor(Sg, [0.3, 0.3, 0.32], () => box(Sg, F, u - 0.03, u + 0.03, 0, 0.7, w - 0.03, w + 0.03, 0));
      for (const du of [-0.55, 0.55]) withColor(Sg, [0.18, 0.18, 0.2], () => { box(Sg, F, u + du - 0.2, u + du + 0.2, 0.42, 0.46, w - 0.2, w + 0.2, 0.006); box(Sg, F, u + du + (du > 0 ? 0.16 : -0.2), u + du + (du > 0 ? 0.2 : -0.16), 0.46, 0.9, w - 0.2, w + 0.2, 0.004); });
    }
  } else if (interior === 'bank') {
    withColor(Sg, [0.3, 0.3, 0.33], () => box(Sg, F, u0 + 0.5, u1 - 0.5, 0, 1.1, zb + 1.0, zb + 1.7, 0.015));
    for (let u = u0 + 0.6; u < u0 + Math.min(wid - 0.6, 3.2); u += 1.0) withColor(Sg, [0.2, 0.2, 0.22], () => box(Sg, F, u, u + 0.7, 0, 1.6, zf - 1.2, zf - 0.6, 0.02));
  } else {
    table(u0 + wid * 0.5, zb + depth * 0.5, Math.min(0.9, wid * 0.2), 0.4, 0.9, [0.5, 0.42, 0.34]);
  }
}
// an entrance bay: a recessed door under a transom, the returns in the wall's material
function entranceGeom(bay, H) {
  const u0 = +bay.u0, u1 = +bay.u1;
  const D = { kind: 'solid', w: 1.1, recess: 0.35, ...(bay.door || {}) };
  const dh = Math.min(H - 0.1, D.h ?? 2.4);
  const w = Math.min(u1 - u0 - 0.1, (+D.w) * (D.kind === 'double' ? 2 : 1) + 0.12);
  const a = (u0 + u1) / 2 - w / 2 + (D.du || 0), c = a + w;
  const top = Math.min(H, dh + (D.transom ?? 0.5));
  return { D, dh, a, c, top };
}
function entranceBay(B, F, bay, H, o) {
  const wallM = o.wallM;
  const { D, dh, a, c, top } = entranceGeom(bay, H);
  const rec = +D.recess;
  reveal(S(B, wallM), F, { u0: a, u1: c, y0: 0, y1: top }, rec, { noBottom: true });
  const fm = M(B, D.frame || 'alu_bronze');
  const Sf = S(B, fm, true, false);
  const zd = -rec;
  // the frame, the transom glass, the leaves
  box(Sf, F, a, a + 0.06, 0, top, zd - 0.08, zd, 0.006); box(Sf, F, c - 0.06, c, 0, top, zd - 0.08, zd, 0.006);
  box(Sf, F, a + 0.06, c - 0.06, dh, dh + 0.06, zd - 0.08, zd, 0.006); box(Sf, F, a + 0.06, c - 0.06, top - 0.06, top, zd - 0.08, zd, 0.006);
  const Sg = S(B, kitMat(D.glass || 'int_shopglass'), false, false);
  if (top - dh > 0.2) quadW(Sg, F, a + 0.06, c - 0.06, dh + 0.06, top - 0.06, zd - 0.04);
  const leaves = D.kind === 'double' ? 2 : 1, lw = (c - a - 0.12) / leaves;
  const Sd = S(B, M(B, D.mat || (D.kind === 'solid' ? 'metal_painted' : 'alu_bronze'), { tint: D.tint || '#3b3430' }), false, false);
  for (let l = 0; l < leaves; l++) {
    const x0 = a + 0.06 + l * lw, x1 = x0 + lw;
    if (D.kind === 'glass') {
      box(Sf, F, x0, x0 + 0.1, 0, dh, zd - 0.06, zd - 0.01, 0.005); box(Sf, F, x1 - 0.1, x1, 0, dh, zd - 0.06, zd - 0.01, 0.005);
      box(Sf, F, x0 + 0.1, x1 - 0.1, dh - 0.1, dh, zd - 0.06, zd - 0.01, 0.005); box(Sf, F, x0 + 0.1, x1 - 0.1, 0, 0.22, zd - 0.06, zd - 0.01, 0.005);
      quadW(Sg, F, x0 + 0.1, x1 - 0.1, 0.22, dh - 0.1, zd - 0.035);
      quadW(S(B, kitMat('int_dark'), false, false), F, x0, x1, 0, dh, zd - 1.5);
    } else {
      box(Sd, F, x0, x1, 0, dh, zd - 0.05, zd - 0.005, 0.006, SK.NW);
      // two raised panels
      const Sp = S(B, M(B, D.mat || 'metal_painted', { tint: D.tint || '#3b3430' }), true, false);
      box(Sp, F, x0 + 0.12, x1 - 0.12, 0.25, dh * 0.45, zd - 0.005, zd + 0.012, 0.008);
      box(Sp, F, x0 + 0.12, x1 - 0.12, dh * 0.5, dh - 0.15, zd - 0.005, zd + 0.012, 0.008);
      box(S(B, kitMat('alu_clear'), true, false), F, x1 - 0.14, x1 - 0.1, 0.95, 1.1, zd, zd + 0.06, 0.006);
    }
  }
  // the step up to the door
  box(S(B, M(B, 'granite_grey'), false, true), F, a - 0.05, c + 0.05, 0, 0.12, zd, 0.25, 0.012, SK.NY);
}

// ================================================================== cornices and mouldings
// ---- moulding curves, sampled: each from (w0, y0) to (w1, y1) in the section plane (w out of the wall, y up)
function curve(w0, y0, w1, y1, kind, n = 6) {
  const ov = (s) => [Math.sin((s * Math.PI) / 2), 1 - Math.cos((s * Math.PI) / 2)];   // convex: out first, then up
  const ca = (s) => [1 - Math.cos((s * Math.PI) / 2), Math.sin((s * Math.PI) / 2)];   // concave: up first, then out
  const out = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    let f;
    if (kind === 'ovolo') f = ov(t);
    else if (kind === 'cavetto') f = ca(t);
    else if (kind === 'cymaRecta') f = t <= 0.5 ? ov(t * 2).map((v) => v * 0.5) : ca(t * 2 - 1).map((v) => 0.5 + v * 0.5);    // convex below, concave above
    else if (kind === 'cymaReversa') f = t <= 0.5 ? ca(t * 2).map((v) => v * 0.5) : ov(t * 2 - 1).map((v) => 0.5 + v * 0.5);  // concave below, convex above
    else f = [t, t];
    out.push([w0 + (w1 - w0) * f[0], y0 + (y1 - y0) * f[1]]);
  }
  return out;
}
// the section of a cornice H high projecting P, bottom at 0 (from the wall out and back), per kind
function corniceProfile(kind, H, P) {
  if (kind === 'band') return [[0, 0], [P * 0.6, 0], [P * 0.6, H * 0.12], ...curve(P * 0.6, H * 0.12, P, H * 0.34, 'ovolo', 5), [P, H * 0.82], ...curve(P, H * 0.82, P * 0.86, H, 'cavetto', 4), [-0.2, H]];
  if (kind === 'parapet') return [[0, 0], [0.05, 0], [0.05, H], [-0.3, H]];
  if (kind === 'corbel') return [[0, 0], [0.02, 0], [0.02, H * 0.3], [0.045, H * 0.3], [0.045, H * 0.6], [0.07, H * 0.6], [0.07, H], [-0.3, H]];
  // bracketed / dentil / modillion: the bed fillet, the frieze, an ovolo, the bed moulding (a cavetto), the corona's
  // soffit and face, a fillet, the cyma recta crown, the top fillet and the cap back to the parapet
  const pr = [[0, 0], [0.035, 0], [0.035, H * 0.03], [0.03, H * 0.035], [0.03, H * 0.4]];
  pr.push(...curve(0.03, H * 0.4, 0.065, H * 0.445, 'ovolo', 4));
  pr.push([0.065, H * 0.455]);
  pr.push(...curve(0.065, H * 0.455, Math.max(0.16, P * 0.28), H * 0.53, 'cavetto', 5));
  pr.push([P * 0.86, H * 0.55], [P * 0.86, H * 0.535], [P * 0.875, H * 0.535]);     // the soffit and its drip
  pr.push([P * 0.875, H * 0.72], [P * 0.9, H * 0.72], [P * 0.9, H * 0.745]);
  pr.push(...curve(P * 0.9, H * 0.745, P, H * 0.95, 'cymaRecta', 8));
  pr.push([P, H], [-0.3, H]);
  return pr;
}
// a scroll bracket's side outline from the frieze (bot) to the soffit (top), reaching pTop at the top
function bracketProfile(bot, top, pTop, pBot) {
  const h = top - bot, pts = [[0.03, bot]];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // the front: a small lower volute curling out near the bottom, the neck, the big upper scroll under the soffit
    const lower = 0.55 * Math.exp(-Math.pow((t - 0.1) / 0.09, 2));
    const f = Math.pow(t, 1.9);
    const w = pBot + (pTop - pBot) * f + (pTop - pBot) * 0.16 * lower;
    pts.push([Math.max(0.05, w), bot + h * t]);
  }
  pts.push([0.03, top]);
  return pts;
}
// a disc boss (a volute's eye) on a bracket side at (u, y, w), radius r, facing sgn * u
function boss(Sn, F, u, y, w, r, sgn) {
  const n = 10, pts = [];
  for (let i = 0; i < n; i++) { const a2 = (i / n) * Math.PI * 2; pts.push([u, y + Math.cos(a2) * r, w + Math.sin(a2) * r]); }
  poly(Sn, F, pts, sgn, 0, 0);
}
function cornice(B, F, C, u0, u1, yTop, mitres, o = {}) {
  const kind = C.kind || 'bracketed';
  if (kind === 'none') return;
  const H = +(C.h ?? 0.9), P = +(C.proj ?? 0.6);
  // (AR34, BID2: with no mat, a 'parapet' cornice is the wall's own material and the others a smooth paint; the chipped
  // paint set read as rubble along the roofline)
  // (AR34 w2: painted-metal cornices chip at 0.1 by default; at 0.3 the chips read as a blotched band from the street, s351)
  // (AR34 w2: a painted pressed-metal cornice, `mat` 'metal_painted' / 'metal' / 'steel_*', with no `chips` or `nrm` given, is
  // a smooth paint: MATS's chipped set read as a blue blotched band from the street at chips 0.3 and 0.1 alike, s351 w2b1 /
  // w2b2; the profile, brackets and dentils carry the relief)
  const smoothPaint = C.mat && /^(metal_painted|metal$|steel)/.test(C.mat) && C.chips === undefined && C.nrm === undefined;
  const mat = smoothPaint ? M(B, { mat: 'plain', tint: C.tint || '#d8d0c0', rough: C.rough ?? 0.55, env: C.env })
    : C.mat ? M(B, { mat: C.mat, tint: C.tint || '#d8d0c0', dirt: C.dirt ?? 0.3, chips: C.chips ?? (/^(metal|steel)/.test(C.mat) ? 0.1 : undefined), nrm: C.nrm, rough: C.rough, env: C.env })
    : kind === 'parapet' ? M(B, C.tint ? { ...(o.wallSpec || B.wallDef), tint: C.tint } : (o.wallSpec || B.wallDef))
    : M(B, { mat: 'plain', tint: C.tint || '#d8d0c0', rough: 0.55 });
  const Sc = S(B, mat, false, true);
  const y = yTop - H;
  const prof = corniceProfile(kind, H, P).map(([w, yy]) => [w, y + yy]);
  const [m0, m1] = mitres || [0, 0];
  extrude(Sc, F, prof, u0, u1, { m0, m1, smooth: 35 });
  if (kind === 'corbel') {
    // a brick corbel table under the courses: headers every 20 cm, in the wall's brick
    const wm = C.brick ? M(B, C.brick) : M(B, B.wallDef);
    const Sb = S(B, wm, true, true);
    for (let u = u0 + 0.06; u < u1 - 0.12; u += 0.2) box(Sb, F, u, u + 0.1, y - 0.075, y - 0.005, -0.01, 0.045, 0.006, SK.NW);
    return;
  }
  if (kind !== 'bracketed' && kind !== 'modillion' && kind !== 'dentil') return;
  const Sn = S(B, mat, true, true);
  const top = y + H * 0.535, bot = y + H * 0.04;
  // dentils in the bed moulding's zone
  const dy0 = y + H * 0.44, dy1 = y + H * 0.52, dp = Math.max(0.1, P * 0.22);
  const dw = C.dentilW ?? 0.065, dg = C.dentilGap ?? 0.065;
  if (kind !== 'modillion' || C.dentils !== false) for (let u = u0 + 0.08; u < u1 - 0.08 - dw; u += dw + dg) box(Sn, F, u, u + dw, dy0, dy1, 0.02, dp, 0.004, SK.NW);
  if (kind === 'bracketed') {
    const nb = Math.max(2, +(C.brackets || Math.round((u1 - u0) / 1.6) + 1));
    const bw = C.bracketW ?? 0.16;
    const ends = C.consoles !== false;
    const us = [];
    for (let q = 0; q < nb; q++) us.push(u0 + 0.14 + ((u1 - u0 - 0.28) * q) / (nb - 1));
    const bp = bracketProfile(bot, top, P * 0.84, 0.11);
    for (let q = 0; q < us.length; q++) {
      const uc = us[q], end = ends && (q === 0 || q === us.length - 1);
      const w2 = end ? bw * 1.6 : bw;
      const prof2 = end ? bracketProfile(bot - Math.min(0.45, H * 0.5), top, P * 0.86, 0.16) : bp;
      extrude(Sn, F, prof2, uc - w2 / 2, uc + w2 / 2, { smooth: 40 });
      // the volutes' eyes on both sides
      const yv1 = top - (top - bot) * 0.2, wv1 = P * 0.62, yv0 = (end ? bot - Math.min(0.45, H * 0.5) : bot) + (top - bot) * 0.12, wv0 = 0.15;
      for (const [uu, sg] of [[uc - w2 / 2 - 0.004, -1], [uc + w2 / 2 + 0.004, 1]]) { boss(Sn, F, uu, yv1, wv1, Math.min(0.07, H * 0.08), sg); boss(Sn, F, uu, yv0, wv0, Math.min(0.045, H * 0.05), sg); }
      if (end) {
        // the drop under the end console: a block and a pendant
        const yb2 = bot - Math.min(0.45, H * 0.5);
        box(Sn, F, uc - w2 / 2 + 0.01, uc + w2 / 2 - 0.01, yb2 - 0.12, yb2, 0.02, 0.17, 0.008, SK.NW);
        box(Sn, F, uc - 0.035, uc + 0.035, yb2 - 0.22, yb2 - 0.12, 0.04, 0.11, 0.01, SK.NW);
      }
    }
    // frieze panels between the brackets: raised moulded frames
    if (C.panels !== false) {
      const py0 = y + H * 0.08, py1 = y + H * 0.36;
      for (let q = 0; q + 1 < us.length; q++) {
        const a2 = us[q] + bw * (q === 0 && ends ? 0.8 : 0.5) + 0.07, c2 = us[q + 1] - bw * (q + 1 === us.length - 1 && ends ? 0.8 : 0.5) - 0.07;
        if (c2 - a2 < 0.25 || py1 - py0 < 0.1) continue;
        const t = 0.025, z0 = 0.03, z1 = 0.045;
        box(Sn, F, a2, c2, py0, py0 + t, z0, z1, 0.004, SK.NW); box(Sn, F, a2, c2, py1 - t, py1, z0, z1, 0.004, SK.NW);
        box(Sn, F, a2, a2 + t, py0 + t, py1 - t, z0, z1, 0.004, SK.NW); box(Sn, F, c2 - t, c2, py0 + t, py1 - t, z0, z1, 0.004, SK.NW);
      }
    }
  } else if (kind === 'modillion') {
    // modillions: scrolls laid under the corona (an S in the section), every ~0.45 m
    const mh = Math.min(0.16, H * 0.16), my0 = top - mh;
    const mp = [[0.06, my0], [P * 0.55, my0], ...curve(P * 0.55, my0, P * 0.78, my0 + mh * 0.75, 'ovolo', 5), [P * 0.78, top], [0.06, top]];
    const step = C.pitch ?? 0.45;
    for (let u = u0 + 0.22; u < u1 - 0.2; u += step) extrude(Sn, F, mp, u, u + 0.13, { smooth: 40 });
  }
  void o;
}
// a brick corbel or dentil course: 'corbel' (three courses stepping out), 'dentil' (projecting headers)
function brickCourse(B, F, Bd, u0, u1, y, wallM) {
  const mat = Bd.mat ? M(B, Bd) : wallM;
  const Sb = S(B, mat, false, true), Sn = S(B, mat, true, true);
  const c = 0.0677, pr = +(Bd.proj ?? 0.03);
  if (Bd.kind === 'dentil') {
    for (let u = u0 + 0.05; u < u1 - 0.15; u += 0.2) box(Sn, F, u, u + 0.1, y, y + c * 1.0, -0.01, pr + 0.02, 0.006, SK.NW);
    box(Sb, F, u0, u1, y + c, y + c * 2, -0.01, pr * 0.6, 0.006, SK.NW);
  } else {
    for (let s = 0; s < 3; s++) box(Sb, F, u0, u1, y + s * c, y + (s + 1) * c, -0.01, pr * (s + 1) * 0.6, 0.006, SK.NW);
  }
}
// quoins: alternating long and short stone blocks up a corner of the face
function quoins(B, F, Qn, L, y0, y1) {
  const mat = M(B, { mat: Qn.mat || 'stone_lime', tint: Qn.tint || '#cfc8b8' });
  const Sq = S(B, mat, false, true);
  const hq = +(Qn.h ?? 0.36), wl = +(Qn.w ?? 0.62), ws = +(Qn.ws ?? wl * 0.62), pq = +(Qn.proj ?? 0.03), gap = 0.012;
  const sides = Qn.at === 'left' ? [0] : Qn.at === 'right' ? [1] : [0, 1];
  let q = 0;
  for (let y = y0; y + hq <= y1 + 0.01; y += hq, q++) {
    const w = q % 2 ? ws : wl;
    for (const s of sides) {
      const a = s ? L - w : 0, c = s ? L : w;
      box(Sq, F, a, c, y + gap / 2, y + hq - gap / 2, -0.01, pq, Qn.chamfer ?? 0.014, SK.NW);
    }
  }
}
// the water table: a stone course along the foot of the face, broken by the openings
function waterTable(B, F, Pl, L, holes) {
  const mat = M(B, { mat: Pl.mat || 'granite_grey', tint: Pl.tint || '#6a6967' });
  const Sp = S(B, mat, false, true);
  const h = +(Pl.h ?? 0.45), p = +(Pl.proj ?? 0.05);
  const cov = holes.filter((hh) => hh.y0 < h - 0.01).map((hh) => [hh.u0, hh.u1]).sort((x, y) => x[0] - y[0]);
  let cur = 0;
  const spans = [];
  for (const [a2, c2] of cov) { if (a2 > cur + 0.05) spans.push([cur, a2]); cur = Math.max(cur, c2); }
  if (L > cur + 0.05) spans.push([cur, L]);
  const prof = [[-0.01, -0.3], [p, -0.3], [p, h - 0.06], [p * 0.4, h], [-0.01, h]];
  for (const [a2, c2] of spans) extrude(Sp, F, prof, a2, c2, { smooth: 10 });
}
// a belt / string course: a band with a weathered top across the face
function band(B, F, Bd, u0, u1, y, wallM) {
  const hh = +(Bd.h ?? 0.3), p = +(Bd.proj ?? 0.05);
  const mat = Bd.mat ? M(B, Bd) : wallM;
  const prof = [[-0.01, 0], [p * 0.7, 0], [p, hh * 0.18], [p, hh * 0.78], [p * 0.55, hh], [-0.01, hh]];
  extrude(S(B, mat, false, true), F, prof.map(([w, yy]) => [w, y + yy]), u0, u1, { smooth: 12 });
}

// ================================================================== a face
// o: { spec (FACE or null), i (edge index), yTop (facade top), plain (compiled defaults) }
function buildFace(B, i, fs) {
  const F = faceFrame(B, i), L = F.L;
  if (L < 0.3) return;
  const wallSpec = (fs && fs.wall) || B.wallDef;
  const wallM = M(B, wallSpec, { grime: true });
  const Sw = S(B, wallM, false, true);
  const yTop = B.h + B.parH, fnd = -1.5;
  const [m0, m1] = edgeMitres(B.ring, i);
  const CC = B.spec.cornerChamfer ?? 0.025;
  const c0 = m0 > 0.25 && CC > 0 ? CC : 0, c1 = m1 > 0.25 && CC > 0 ? CC : 0;
  const blind = ((B.blind >> i) & 1) === 1 && !fs;
  const holes = [];
  const later = [];            // closures run after the wall (so a sink order is stable)
  const proud = [];            // what stands out of the face: a sign placed over it stands in front of it
  B.proud = proud;
  const signs = [];            // the base's signs, placed last
  let baseWallM = null, baseSplit = 0;   // base.wall: the base zone's own wall
  const oriels = [];           // FACE.oriels: projecting bays (their windows replace the face's own in their span)
  // AR34 w2 b1 (WEST 1) FACE.parts: [{ u0, u1, h, d }]: a lower part of the face (an annex in front of the block, h its top
  // with the parapet, d its depth, 3 m by default); see facePart
  // (d is kept 0.3 m inside the footprint's depth behind this face)
  let faceDepth = 0;
  for (const [x, z] of B.ring) faceDepth = Math.max(faceDepth, -((x - F.p0[0]) * F.N[0] + (z - F.p0[1]) * F.N[1]));
  const parts = fs && Array.isArray(fs.parts) ? fs.parts.filter((P) => P && +P.u1 > +P.u0 && +P.h > 0.8 && +P.h < B.h + B.parH - 0.3 && faceDepth > 1.0)
    .map((P) => ({ u0: Math.max(0, +P.u0), u1: Math.min(L, +P.u1), h: +P.h, d: Math.min(faceDepth - 0.3, Math.max(0.6, +(P.d ?? 3.0))) })) : [];
  // (a window of the span that does not fit under the part's roof is left out: its room would stand in the open)
  const inPart = (ua, ub, ya, yb) => parts.some((P) => ua < P.u1 && ub > P.u0 && yb > P.h - Math.min(B.parH, 0.6) - 0.15);
  // the spans of [a, b] outside the parts (the cornice, the coping and the bands above a part's top)
  const outParts = (a, b) => { let sp = [[a, b]]; for (const P of parts) sp = sp.flatMap(([x, y]) => (P.u1 <= x || P.u0 >= y ? [[x, y]] : [[x, P.u0], [P.u1, y]].filter(([p, q]) => q - p > 0.05))); return sp; };
  for (const P of parts) { holes.push({ u0: P.u0, u1: P.u1, y0: P.h, y1: yTop + 0.01 }); (B.notches || (B.notches = [])).push({ i, ...P }); }
  if (fs) {
    // ---- the base
    const base = fs.base || null;
    const baseH = base ? +(base.h ?? 4.2) : 0;
    const fasc = base && base.fascia ? base.fascia : null;
    const fasH = fasc ? +(fasc.h ?? 1.0) : 0;
    const baseTop = baseH + fasH;
    if (base && base.wall) { baseWallM = M(B, base.wall, { grime: true }); baseSplit = base.wall.to ?? baseTop; }
    for (const O of fs.oriels || []) if (O && O.u1 > O.u0) oriels.push(O);
    if (base) {
      const bays = base.bays || [];
      for (let k = 0; k < bays.length; k++) {
        const bay = bays[k];
        if (!(bay.u1 > bay.u0)) continue;
        if (bay.kind === 'wall') continue;
        const H = +(bay.h ?? baseH);
        if (bay.kind === 'entrance') { const eg = entranceGeom(bay, H); holes.push({ u0: eg.a, u1: eg.c, y0: 0, y1: eg.top }); }
        else holes.push({ u0: +bay.u0, u1: +bay.u1, y0: 0, y1: H });
        const retM = base.piers ? M(B, base.piers) : (baseWallM || null);
        if (bay.kind === 'entrance') later.push(() => entranceBay(B, F, bay, H, { wallM: baseWallM || wallM }));
        else later.push(() => storeBay(B, F, bay, H, { wallM: baseWallM || wallM, retM, k: B.seed * 31 + i * 7 + k, gates: true }));
        // signs, blades, awnings (after every bay, so all gate boxes are known)
        signs.push(() => bayExtras(B, F, bay, H, baseH, fasc, k));
      }
      // piers between the stores
      if (base.piers && base.piers.at) {
        const pm = M(B, base.piers);
        const Sp = S(B, pm, false, true);
        const pw = +(base.piers.w ?? 0.5), pp = +(base.piers.proj ?? 0.06);
        for (const e of base.piers.at) {
          const o2 = typeof e === 'object' ? e : { u: e };
          const u = +o2.u, w2 = +(o2.w ?? pw), p2 = +(o2.proj ?? pp);
          const m2 = o2.mat || o2.tint ? M(B, { mat: o2.mat || base.piers.mat, tint: o2.tint || base.piers.tint }) : pm;
          const S2 = m2 === pm ? Sp : S(B, m2, false, true);
          const a = Math.max(0, u - w2 / 2), c = Math.min(L, u + w2 / 2);
          proud.push({ u0: a - 0.02, u1: c + 0.02, y0: 0, y1: o2.h ?? baseH, w: p2 + 0.025 });
          // AR34 w2 b1 (BID4 1): `flute`, `console`, `panel` (on base.piers or one entry) make a base pier a pilaster
          // (the shaft fluted, a scroll console under the fascia; `capital: true` adds a capital), the plinth as before
          const PP = { ...base.piers, ...o2 };
          if (PP.flute || PP.console || PP.panel) pilaster(B, F, S2, m2, a, c, base.piers.plinth !== false ? 0.3 : 0, o2.h ?? baseH, p2, { flute: PP.flute, console: PP.console, consoleH: PP.consoleH, consoleW: PP.consoleW, panel: PP.panel, capital: PP.capital === true, base: false });
          else box(S2, F, a, c, 0, o2.h ?? baseH, -0.02, p2, 0.015, SK.NW | SK.NY);
          if (base.piers.plinth !== false) box(S2, F, a - 0.02, c + 0.02, 0, 0.3, -0.02, p2 + 0.025, 0.012, SK.NW | SK.NY);   // the plinth
        }
      }
      // the continuous signband / fascia
      if (fasc) {
        const fm = M(B, { mat: fasc.mat || 'panel_alu', tint: fasc.tint || '#1d1d1d' });
        const u0f = fasc.u0 ?? 0, u1f = fasc.u1 ?? L;
        const fp = +(fasc.proj ?? 0.14);
        proud.push({ u0: u0f, u1: u1f, y0: baseH, y1: baseTop, w: fp });
        box(S(B, fm, false, true), F, u0f, u1f, baseH, baseTop, -0.02, fp, 0.012, SK.NW);
        // AR34: the signband's flashing cap over its top and a drip lip under it (they catch the light and the shadow line)
        if (fasc.trim !== false && baseTop - baseH > 0.3) {
          const tm = M(B, { mat: 'plain', tint: fasc.trimTint || '#6c6e6f', rough: 0.45, metal: 0.4 });
          box(S(B, tm, true, true), F, u0f - 0.02, u1f + 0.02, baseTop - 0.005, baseTop + 0.035, -0.02, fp + 0.035, 0.006, SK.NW);
          box(S(B, tm, true, false), F, u0f, u1f, baseH - 0.025, baseH + 0.01, fp - 0.01, fp + 0.02, 0.004, SK.NW);
        }
      }
    }
    // ---- the upper floors
    const bays = layoutBays(fs.bays, L);
    const W = { ...(fs.windows || {}) };
    let y = baseTop, k = 0;
    const floors = [];
    for (const fl of fs.floors || []) for (let r = 0; r < (fl.n ?? 1); r++) { floors.push({ ...fl, y0: y, y1: y + +(fl.h ?? 3.05) }); y += +(fl.h ?? 3.05); }
    // a curtain wall: its zone is cut from the wall and no punched window is drawn inside it
    let CZ = null;
    if (fs.curtain) {
      const C = fs.curtain, fTop = floors.length ? floors[floors.length - 1].y1 : B.h;
      CZ = { u0: C.u0 ?? 0.05, u1: C.u1 ?? L - 0.05, y0: C.y0 ?? baseTop + 0.05, y1: C.y1 ?? Math.min(fTop, B.h - 0.2) };
      // AR34 w2 (BID4 2): `zones: [{ u0, u1, y0, y1, mullion, rows, w, glass, body, tint, frame, frameTint, spandrel, ... }]`:
      // each zone its own grid over the curtain's options (a pitch, rows and recess of its own); the punched windows skip
      // the curtain's whole extent (CZ) as before
      const Zs = Array.isArray(C.zones) && C.zones.length ? C.zones.map((Z) => ({ ...C, zones: undefined, ...Z })) : [C];
      let any = false;
      Zs.forEach((Z, zi) => {
        const z = Zs.length > 1 || C.zones ? { u0: Z.u0 ?? CZ.u0, u1: Z.u1 ?? CZ.u1, y0: Z.y0 ?? CZ.y0, y1: Z.y1 ?? CZ.y1 } : CZ;
        if (!(z.u1 - z.u0 > 0.3 && z.y1 - z.y0 > 0.3)) return;
        any = true;
        holes.push({ u0: z.u0, u1: z.u1, y0: z.y0, y1: z.y1 });
        later.push(() => curtainWall(B, F, Z, z.u0, z.u1, z.y0, z.y1, floors, wallM, i + 1 + zi * 7));
      });
      if (C.zones) CZ = Zs.reduce((a, Z) => ({ u0: Math.min(a.u0, Z.u0 ?? CZ.u0), u1: Math.max(a.u1, Z.u1 ?? CZ.u1), y0: Math.min(a.y0, Z.y0 ?? CZ.y0), y1: Math.max(a.y1, Z.y1 ?? CZ.y1) }), { u0: 1e9, u1: -1e9, y0: 1e9, y1: -1e9 });
      if (!any) CZ = null;
    }
    for (let f = 0; f < floors.length; f++) {
      const fl = floors[f];
      const T = { ...WIN_DEF, ...(W[fl.win] || W.A || {}) };
      if (CZ && fl.y0 >= CZ.y0 - 0.5 && fl.y1 <= CZ.y1 + 0.5 && !fl.keep) continue;
      const inOriel = (ua, ub) => oriels.some((O) => { const [oy0, oy1] = orielY(O, floors, baseTop, B.h); return ua < O.u1 && ub > O.u0 && fl.y0 >= oy0 - 0.3 && fl.y1 <= oy1 + 0.3; });
      // explicit openings on this floor: [[u0, u1, 'T'], ...] or [{ u0, u1, win, sill, h }], any width
      if (Array.isArray(fl.open)) {
        for (const op of fl.open) {
          const o2 = Array.isArray(op) ? { u0: op[0], u1: op[1], win: op[2] } : op;
          const T2 = { ...WIN_DEF, ...(W[o2.win] || (o2.win ? {} : T)), ...(o2.T || {}) };
          if (T2.kind === 'none') continue;
          const ua = +o2.u0, ub = +o2.u1;
          if (!(ub - ua > 0.2) || inOriel(ua, ub)) continue;
          const ya = fl.y0 + +(o2.sill ?? T2.sill), yb = Math.min(fl.y1 - 0.05, ya + +(o2.h ?? T2.h));
          if (inPart(ua, ub, ya, yb)) continue;
          holes.push({ u0: ua - (T2.jamb ?? 0.015), u1: ub + (T2.jamb ?? 0.015), y0: ya, y1: yb });
          const kk = k++;
          later.push(() => windowAt(B, F, { ...T2, w: ub - ua }, ua, ub, ya, yb, fl.y0, fl.y1, i * 1000 + kk, { wallM, widen: 0.5, lite: ya > (fs.liteAbove ?? 30) }));
        }
        continue;
      }
      if (fl.win === 'none' || T.kind === 'none') continue;
      for (let j = 0; j < bays.length; j++) {
        if (fl.bays && !fl.bays.includes(j)) continue;
        const [ba, bc] = bays[j];
        const bw = bc - ba, ww = Math.min(+T.w, bw - 0.2);
        if (ww < 0.3) continue;
        const uc = (ba + bc) / 2 + (T.du || 0);
        const ua = uc - ww / 2, ub = uc + ww / 2, ya = fl.y0 + +T.sill, yb = Math.min(fl.y1 - 0.2, ya + +T.h);
        if (inOriel(ua, ub) || inPart(ua, ub, ya, yb)) continue;
        holes.push({ u0: ua - (T.jamb ?? 0.015), u1: ub + (T.jamb ?? 0.015), y0: ya, y1: yb });
        const kk = k++;
        const widen = Math.min(0.8, (bw - ww) / 2 - 0.03);
        later.push(() => windowAt(B, F, T, ua, ub, ya, yb, fl.y0, fl.y1, i * 1000 + kk, { wallM, widen, maxExt: (bw - ww) / 2 - 0.03, lite: ya > (fs.liteAbove ?? 30) }));
      }
    }
    for (const O of oriels) later.push(() => oriel(B, F, O, floors, W, wallSpec, baseTop, i));
    // ---- bands, piers, rustication, cornice, items
    for (const Bd of fs.bands || []) {
      let by = null;
      if (Bd.at === 'base') by = baseTop;
      else if (typeof Bd.at === 'string' && Bd.at.startsWith('floor:')) { const q = floors[(+Bd.at.slice(6)) - 2]; by = q ? q.y0 : null; }
      else if (typeof Bd.at === 'number') by = Bd.at;
      const bfn = Bd.kind === 'corbel' || Bd.kind === 'dentil' ? brickCourse : Bd.kind === 'pressed' ? pressedFrieze : band;
      if (by !== null) for (const [ba, bb] of parts.some((P) => by > P.h - 0.3) ? outParts(Bd.u0 ?? 0, Bd.u1 ?? L) : [[Bd.u0 ?? 0, Bd.u1 ?? L]]) later.push(() => bfn(B, F, Bd, ba, bb, by, wallM));
    }
    if (fs.piers) {
      const P = fs.piers;
      const pm = P.mat ? M(B, P) : wallM;
      const pw = +(P.w ?? 0.6), pp = +(P.proj ?? 0.08);
      const from = P.from === 'base' || P.from === undefined ? baseTop : +P.from;
      const to = P.to === 'cornice' || P.to === undefined ? yTop - (fs.cornice ? +(fs.cornice.h ?? 0.9) : 0) : +P.to;
      const at = P.at === 'bays' || !P.at ? bayEdges(bays) : P.at;
      later.push(() => {
        const Sp = S(B, pm, false, true);
        for (const e of at) {
          const o2 = typeof e === 'object' ? e : { u: e };
          const u = +o2.u, w2 = +(o2.w ?? pw), p2 = +(o2.proj ?? pp);
          const m2 = o2.mat || o2.tint ? M(B, { mat: o2.mat || P.mat || wallSpec.mat, tint: o2.tint || P.tint }) : pm;
          const S2 = m2 === pm ? Sp : S(B, m2, false, true);
          const a = Math.max(0, u - w2 / 2), c = Math.min(L, u + w2 / 2);
          pilaster(B, F, S2, m2, a, c, o2.from ?? from, o2.to ?? to, p2, P);
          const cap = o2.cap ?? P.cap;
          if (cap) pierCap(B, F, S2, a, c, o2.to ?? to, yTop, p2, cap === true ? {} : cap);
        }
      });
    }
    if (fs.rustication) later.push(() => rusticate(B, F, fs.rustication, L, holes, baseTop));
    if (fs.quoins) later.push(() => quoins(B, F, fs.quoins, L, fs.quoins.from ?? baseTop, fs.quoins.to ?? B.h - (fs.cornice ? +(fs.cornice.h ?? 0.9) : 0)));
    if (fs.plinth) later.push(() => waterTable(B, F, fs.plinth, L, holes));
    const C = fs.cornice || null;
    for (const [ca, cb] of outParts(0, L)) {
      const mi = [ca < 0.01 ? m0 : 0, cb > L - 0.01 ? m1 : 0];
      if (C && C.kind !== 'none') later.push(() => cornice(B, F, C, ca, cb, yTop, mi, { wallSpec }));
      else later.push(() => coping(B, F, ca, cb, yTop, mi, wallSpec));
    }
    for (const P of parts) later.push(() => facePart(B, F, P, yTop, wallM));
    for (const it of fs.items || []) later.push(() => faceItem(B, F, it, wallM));
    for (const GZ of [].concat(fs.graffiti || [])) if (GZ) later.push(() => graffitiZone(B, F, GZ, L, holes));
    // AR34 w2 (BID3): a weathered render over zones of the face (FACE.weather) or over the whole face (wall.weather)
    for (const WZ of [].concat(fs.weather || [])) if (WZ) later.push(() => graffitiZone(B, F, { y0: 0, y1: yTop, ...WZ, kind: WZ.kind || 'stucco' }, L, holes));
    if (wallSpec && wallSpec.weather) { const WW = typeof wallSpec.weather === 'object' ? wallSpec.weather : {}; later.push(() => graffitiZone(B, F, { u0: 0, u1: L, y0: 0, y1: yTop, ...WW, kind: WW.kind || 'stucco' }, L, holes)); }
    for (const FE of Array.isArray(fs.fireEscape) ? fs.fireEscape : fs.fireEscape ? [fs.fireEscape] : []) later.push(() => fireEscape(B, F, FE, bays, floors));
    // a raised parapet over part of the top: segmental (an arc) or a gable
    if (fs.parapet && fs.parapet.kind) later.push(() => raisedParapet(B, F, fs.parapet, yTop, wallSpec, L));
  } else if (!blind && L > 2.4) {
    // ---- a plain face: punched windows at the compiled floor height and window pitch
    const fh = B.b.floorH > 2.4 ? B.b.floorH : 3.1;
    const nF = Math.max(1, Math.floor((B.h - 0.4) / fh));
    const pitch = Math.max(1.6, B.b.winW || 2.6);
    const nb = Math.max(1, Math.floor((L - 0.6) / pitch));
    const m = (L - nb * pitch) / 2;
    const T = { ...WIN_DEF, w: Math.min(1.05, pitch * 0.45), h: Math.min(1.6, fh * 0.52), sill: Math.min(0.9, fh * 0.28), lintel: { kind: 'flat', mat: 'stone_lime', h: 0.18 }, ac: 0.1 };
    let k = 0;
    for (let f = 0; f < nF; f++) {
      const fy0 = f * fh, fy1 = fy0 + fh;
      if (fy1 > B.h + 0.01) break;
      for (let j = 0; j < nb; j++) {
        const uc = m + (j + 0.5) * pitch, ua = uc - T.w / 2, ub = uc + T.w / 2, ya = fy0 + T.sill, yb = ya + T.h;
        holes.push({ u0: ua - (T.jamb ?? 0.015), u1: ub + (T.jamb ?? 0.015), y0: ya, y1: yb });
        const kk = k++;
        later.push(() => windowAt(B, F, T, ua, ub, ya, yb, fy0, fy1, i * 1000 + kk, { wallM, widen: Math.min(0.8, (pitch - T.w) / 2 - 0.03), lite: true }));
      }
    }
    later.push(() => coping(B, F, 0, L, yTop, [m0, m1], wallSpec));
  } else {
    later.push(() => coping(B, F, 0, L, yTop, [m0, m1], wallSpec));
  }
  // the wall itself, from below grade to the top of the parapet, with the openings cut; the quads under each window
  // line up with it, and aGrime (per vertex) carries the streaks under the sills and the soot under the top
  const wins = holes.filter((hh) => hh.y0 > 0.3);
  const cuts = [...new Set(wins.flatMap((hh) => [+hh.u0.toFixed(3), +hh.u1.toFixed(3)]))].sort((a, b) => a - b);
  // (AR34 w2: and dirt in the recesses: a reveal's returns, soffit and seat darken toward the frame, the grime rising from
  // 3 cm in to 0.5 at 15 cm, so every opening reads as set into the masonry)
  Sw.gfn = (u, y, w) => {
    let g = w < -0.03 ? 0.5 * Math.min(1, (-w - 0.03) / 0.12) : 0;
    for (const hh of wins) {
      if (u < hh.u0 - 0.04 || u > hh.u1 + 0.04 || y > hh.y0 + 0.01) continue;
      const d = hh.y0 - y;
      if (d < 2.4) g = Math.max(g, Math.pow(1 - d / 2.4, 1.4));
    }
    if (y > yTop - 1.4) g = Math.max(g, 0.55 * (1 - (yTop - y) / 1.4));
    return g;
  };
  if (baseWallM && baseSplit > 0) {
    const Sb = S(B, baseWallM, false, true);
    Sb.gfn = Sw.gfn;
    wallWithHoles(Sb, F, c0, L - c1, fnd, baseSplit, holes, 0, undefined, cuts);
    Sb.gfn = null;
    wallWithHoles(Sw, F, c0, L - c1, baseSplit, yTop, holes, 0, undefined, cuts);
  } else wallWithHoles(Sw, F, c0, L - c1, fnd, yTop, holes, 0, undefined, cuts);
  later.push(...signs);
  // each face draws its half of the corner chamfer, to the midpoint between its wall's end and the neighbour's
  const chamferHalf = (atEnd) => {
    const n = B.n, nb = atEnd ? (i - 1 + n) % n : (i + 1) % n;
    const Fn = faceFrame(B, nb);
    const P = atEnd ? F.p1 : F.p0;
    const A = atEnd ? [P[0] - F.U[0] * CC, P[1] - F.U[1] * CC] : [P[0] + F.U[0] * CC, P[1] + F.U[1] * CC];
    const Bn = atEnd ? [P[0] + Fn.U[0] * CC, P[1] + Fn.U[1] * CC] : [P[0] - Fn.U[0] * CC, P[1] - Fn.U[1] * CC];
    const Mx = (A[0] + Bn[0]) / 2, Mz = (A[1] + Bn[1]) / 2;
    const loc = (x, z) => [(x - F.p0[0]) * F.U[0] + (z - F.p0[1]) * F.U[1], (x - F.p0[0]) * F.N[0] + (z - F.p0[1]) * F.N[1]];
    const [ua, wa] = loc(A[0], A[1]), [um, wm] = loc(Mx, Mz);
    const nx = F.N[0] + Fn.N[0], nz = F.N[1] + Fn.N[1], nl = Math.hypot(nx, nz) || 1;
    const nu = (nx * F.U[0] + nz * F.U[1]) / nl, nw = (nx * F.N[0] + nz * F.N[1]) / nl;
    poly(Sw, F, [[ua, fnd, wa], [um, fnd, wm], [um, yTop, wm], [ua, yTop, wa]], nu, 0, nw);
  };
  if (c0) chamferHalf(false);
  if (c1) chamferHalf(true);
  for (const fn of later) fn();
  Sw.gfn = null;
}
// AR34 w2 b1 (WEST 1) a lower part of a face (FACE.parts): over [u0, u1] the face's wall stops at h (its parapet and coping
// on top), a roof d m deep behind it, and the block's front stands d m back above it (its returns, parapet and coping); the
// roof slab is notched to match (buildRoof). The face's windows, cornice and bands above h skip the span. The neighbouring
// face is not lowered: a part at a street corner needs a part on that face too.
function facePart(B, F, P, yTop, wallM) {
  const pH = Math.min(B.parH, 0.6), yR = P.h - pH, t = 0.3, { u0, u1, d } = P;
  const Sw = S(B, wallM, false, true);
  quadW(Sw, F, u0, u1, yR, yTop, -d);
  if (u0 > 0.05) quadU(Sw, F, u0, yR, yTop, -d, 0, 1);
  if (u1 < F.L - 0.05) quadU(Sw, F, u1, yR, yTop, -d, 0, -1);
  if (pH > 0.05) quadW(Sw, F, u0, u1, yR - 0.02, P.h, -t, true);          // the annex parapet's inner face
  if (B.parH > 0.05) quadW(Sw, F, u0, u1, B.h - 0.02, yTop, -d - t, true); // the block's, behind its set-back front
  const R0 = B.spec.roof || {};
  const cop = (R0.parapet && R0.parapet.coping) || 'concrete_smooth';
  const cm = M(B, { mat: cop, tint: (R0.parapet && R0.parapet.tint) || (/^metal|^alu|^steel/.test(cop) ? '#8b8d8c' : '#b9b3a6'), nrm: 0.4, chips: 0.2 });
  const prof = (w0, y) => [[w0 - t - 0.04, y - 0.04], [w0 - t - 0.04, y], [w0 - t + 0.02, y + 0.07], [w0 + 0.04, y + 0.06], [w0 + 0.05, y - 0.03], [w0, y - 0.03]];
  extrude(S(B, cm, false, true), F, prof(0, P.h), u0, u1, {});
  extrude(S(B, cm, false, true), F, prof(-d, yTop), u0, u1, {});
  const memb = R0.membrane || 'black';
  const mm = kitMat({ white: 'roof_tpo', silver: 'roof_membrane', black: 'roof_epdm', gravel: 'roof_gravel', pavers: 'concrete_board' }[memb] || 'roof_epdm', { dirt: +(R0.dirt ?? 0.45) });
  quadY(S(B, mm, false, true), F, u0, u1, yR, -d, -t, 1);
}
// the roof ring with the faces' parts cut out (FACE.parts: a notch d deep over [u0, u1] of edge i)
function notchedRing(B) {
  if (!B.notches || !B.notches.length) return B.ring;
  const out = [];
  for (let i = 0; i < B.n; i++) {
    out.push(B.ring[i]);
    // (the face frame runs from ring[i + 1] (u 0) to ring[i] (u L): along the ring the notches come in falling u)
    const ns = B.notches.filter((q) => q.i === i).sort((a, b) => b.u0 - a.u0);
    if (!ns.length) continue;
    const F = faceFrame(B, i);
    const at = (u, w) => [F.p0[0] + F.U[0] * u + F.N[0] * w, F.p0[1] + F.U[1] * u + F.N[1] * w];
    for (const q of ns) {
      const a = Math.max(0.01, q.u0), c = Math.min(F.L - 0.01, q.u1);
      out.push(at(c, 0), at(c, -q.d), at(a, -q.d), at(a, 0));
    }
  }
  return out;
}
// a pilaster from y0 to y1, proud by p: the shaft (with an optional flute or panel), a moulded base and a capital
function pilaster(B, F, Sp, pm, a, c, y0, y1, p, P) {
  if (y1 - y0 < 0.3) return;
  const hasCap = P.capital !== false, hasBase = P.base !== false;
  const capH = Math.min(0.42, (y1 - y0) * 0.12), baseH2 = Math.min(0.36, (y1 - y0) * 0.1);
  box(Sp, F, a, c, y0 + (hasBase ? baseH2 : 0), y1 - (hasCap ? capH : 0), -0.02, p, 0.015, SK.NW);
  const Sn = S(B, pm, true, true);
  if (P.panel) box(Sn, F, a + 0.08, c - 0.08, y0 + baseH2 + 0.25, y1 - capH - 0.25, p - 0.012, p + 0.004, 0.006, SK.NW);
  if (hasBase) {
    // a plinth and a torus
    const prof = [[-0.01, 0], [p + 0.05, 0], [p + 0.05, baseH2 * 0.55], [p + 0.035, baseH2 * 0.62], [p + 0.045, baseH2 * 0.72], [p + 0.035, baseH2 * 0.85], [p + 0.01, baseH2 * 0.92], [p, baseH2], [-0.01, baseH2]];
    extrude(S(B, pm, false, true), F, prof.map(([w, y]) => [w, y0 + y]), a - 0.05, c + 0.05, { smooth: 40 });
  }
  if (hasCap) {
    // an astragal, the necking, an echinus and the abacus
    const prof = [[-0.01, 0], [p, 0], [p + 0.012, capH * 0.08], [p + 0.012, capH * 0.16], [p, capH * 0.22], [p, capH * 0.5], [p + 0.03, capH * 0.62], [p + 0.06, capH * 0.74], [p + 0.07, capH * 0.78], [p + 0.07, capH], [-0.01, capH]];
    extrude(S(B, pm, false, true), F, prof.map(([w, y]) => [w, y1 - capH + y]), a - 0.07, c + 0.07, { smooth: 40 });
  }
  // AR34 (BID4 5) piers.flute: n flutes down the shaft, read as channels between raised fillets that stop short of the
  // base and the capital
  const nf = Math.max(0, Math.min(12, Math.round(+(P.flute || 0))));
  const sy0 = y0 + (hasBase ? baseH2 : 0) + 0.12, sy1 = y1 - (hasCap ? capH : 0) - 0.12;
  if (nf > 0 && c - a > 0.12 && sy1 - sy0 > 0.4) {
    const fw = (c - a - 0.04) / nf;
    for (let k = 0; k <= nf; k++) {
      const u = a + 0.02 + k * fw;
      box(Sn, F, u - 0.008, u + 0.008, sy0, sy1, p - 0.004, p + 0.011, 0.004, SK.NW | SK.NY | SK.PY);
    }
    // the flutes' rounded ends
    for (let k = 0; k < nf; k++) { const u = a + 0.02 + (k + 0.5) * fw; box(Sn, F, u - fw / 2 + 0.008, u + fw / 2 - 0.008, sy1 - 0.02, sy1, p - 0.004, p + 0.008, 0.006, SK.NW); box(Sn, F, u - fw / 2 + 0.008, u + fw / 2 - 0.008, sy0, sy0 + 0.02, p - 0.004, p + 0.008, 0.006, SK.NW); }
  }
  // piers.console: a scroll console on the pier's face under its top (a storefront pier carrying the signband cornice)
  if (P.console) {
    const ch = Math.min(0.75, Math.max(0.3, +(P.consoleH ?? 0.55))), top = y1 - (hasCap ? capH : 0), bot = top - ch;
    const cw = Math.min(c - a - 0.04, +(P.consoleW ?? 0.22)), uc = (a + c) / 2;
    extrude(Sn, F, bracketProfile(bot, top, p + Math.min(0.28, ch * 0.45), p + 0.03), uc - cw / 2, uc + cw / 2, { smooth: 40 });
    for (const [uu, sg] of [[uc - cw / 2 - 0.003, -1], [uc + cw / 2 + 0.003, 1]]) { boss(Sn, F, uu, top - ch * 0.22, p + ch * 0.28, Math.min(0.05, ch * 0.08), sg); boss(Sn, F, uu, bot + ch * 0.14, p + 0.07, Math.min(0.035, ch * 0.05), sg); }
  }
}
// AR34 w2 b1 (BID4 3) FACE.piers.cap: { over (0.32), gable (0.32), back (0.34), coping, copingTint }: the pier carried
// from its top through the parapet to `over` above it, a gable of `gable` on that (0: flat) and a coping on its slopes
// (300 Lenox, the school's parapet piers, the 1900-1930 lofts of 125th Street); `cap: true` takes the defaults
function pierCap(B, F, Sp, a, c, yFrom, yTop, p, cap) {
  const over = Math.max(0, +(cap.over ?? 0.32)), gab = Math.max(0, +(cap.gable ?? 0.32)), back = Math.max(0.05, +(cap.back ?? 0.34));
  const eave = yTop + over, peak = eave + gab, m = (a + c) / 2, y0 = Math.min(yFrom, yTop) - 0.02;
  box(Sp, F, a, c, y0, eave, -back, p, 0.01, SK.NY);
  const Sc = S(B, M(B, { mat: cap.coping || 'cast_stone', tint: cap.copingTint || '#b4ae9f', nrm: 0.4, dirt: 0.35 }), false, true);
  const t = 0.07, o = 0.04;
  if (gab > 0.02) {
    poly(Sp, F, [[a, eave, p], [c, eave, p], [m, peak, p]], 0, 0, 1);
    poly(Sp, F, [[c, eave, -back], [a, eave, -back], [m, peak, -back]], 0, 0, -1);
    for (const [ua, ya, ub, yb] of [[a - o, eave - 0.01, m, peak + 0.02], [m, peak + 0.02, c + o, eave - 0.01]]) {
      const du = ub - ua, dy = yb - ya, l = Math.hypot(du, dy) || 1, nu = -dy / l, ny = du / l;
      poly(Sc, F, [[ua, ya + t, p + o], [ub, yb + t, p + o], [ub, yb + t, -back - o], [ua, ya + t, -back - o]], nu, ny, 0);
      poly(Sc, F, [[ua, ya, p + o], [ub, yb, p + o], [ub, yb + t, p + o], [ua, ya + t, p + o]], 0, 0, 1);
      poly(Sc, F, [[ub, yb, -back - o], [ua, ya, -back - o], [ua, ya + t, -back - o], [ub, yb + t, -back - o]], 0, 0, -1);
    }
    // the coping's ends under the eaves
    for (const [u1, u2] of [[a - o, a + 0.12], [c - 0.12, c + o]]) box(Sc, F, u1, u2, eave - 0.01, eave + t * 0.6, -back - o, p + o, 0.006, 0);
  } else box(Sc, F, a - o, c + o, eave, eave + t, -back - o, p + o, 0.008, 0);
}
// AR34 (BID4 5) bands[].kind 'pressed': a pressed-metal frieze, a plate with a bead along each edge and a rosette every
// `pitch` (0.45 m) between them (the cast-iron and tin cornices of the 1890s fronts)
function pressedFrieze(B, F, Bd, u0, u1, y, wallM) {
  const hh = +(Bd.h ?? 0.4), p = +(Bd.proj ?? 0.04), pitch = Math.max(0.2, +(Bd.pitch ?? 0.45));
  const mat = Bd.mat ? M(B, Bd) : M(B, { mat: 'plain', tint: Bd.tint || '#4d5652', rough: 0.5, metal: 0.2 });
  const Sb = S(B, mat, false, true), Sn = S(B, mat, true, false);
  box(Sb, F, u0, u1, y, y + hh, -0.01, p, 0.006, SK.NW);
  box(Sn, F, u0, u1, y, y + 0.03, p, p + 0.018, 0.006, SK.NW);
  box(Sn, F, u0, u1, y + hh - 0.03, y + hh, p, p + 0.018, 0.006, SK.NW);
  const n = Math.max(1, Math.round((u1 - u0) / pitch)), step = (u1 - u0) / n, r = Math.min(hh * 0.3, step * 0.3);
  for (let k = 0; k < n; k++) {
    const uc = u0 + (k + 0.5) * step, yc = y + hh / 2;
    // the rosette: a ring of petals (a 12-gon) and a raised boss
    const ring = (rr, w) => { const pts = [[uc, yc, w]]; for (let q = 0; q <= 12; q++) { const t = (q / 12) * Math.PI * 2, rq = rr * (q % 2 ? 0.78 : 1); pts.push([uc + Math.cos(t) * rq, yc + Math.sin(t) * rq, w]); } poly(Sn, F, pts, 0, 0, 1); };
    ring(r, p + 0.006); ring(r * 0.45, p + 0.016);
    // a panel line between the rosettes
    if (k > 0) box(Sn, F, u0 + k * step - 0.006, u0 + k * step + 0.006, y + 0.05, y + hh - 0.05, p, p + 0.01, 0, SK.NW);
  }
  void wallM;
}
// FACE.parapet: { kind: 'segmental' | 'gable', u0, u1, rise, coping }: the wall raised over [u0, u1] above the top
function raisedParapet(B, F, Pp, yTop, wallSpec, L) {
  const u0 = +(Pp.u0 ?? 0), u1 = +(Pp.u1 ?? L), rise = +(Pp.rise ?? 1.0);
  if (!(u1 > u0) || rise <= 0.02) return;
  const n = Pp.kind === 'gable' ? 2 : Math.max(6, Math.round((u1 - u0) / 0.35));
  const pts = [];
  for (let q = 0; q <= n; q++) {
    const t = q / n, u = u0 + (u1 - u0) * t;
    const y = Pp.kind === 'gable' ? yTop + rise * (1 - Math.abs(2 * t - 1)) : yTop + rise * Math.sqrt(Math.max(0, 1 - (2 * t - 1) * (2 * t - 1)));
    pts.push([u, y]);
  }
  const wm = M(B, wallSpec), Sw = S(B, wm, false, true);
  const t = 0.3;
  for (let q = 0; q < n; q++) {
    const [ua, ya] = pts[q], [ub, yb] = pts[q + 1];
    poly(Sw, F, [[ua, yTop - 0.02, 0], [ub, yTop - 0.02, 0], [ub, yb, 0], [ua, ya, 0]], 0, 0, 1);         // the front
    poly(Sw, F, [[ub, yTop - 0.02, -t], [ua, yTop - 0.02, -t], [ua, ya, -t], [ub, yb, -t]], 0, 0, -1);    // the back
  }
  const cm = M(B, { mat: Pp.coping || 'stone_lime', tint: Pp.copingTint || '#c9c2b4', nrm: 0.4, chips: 0.2 });
  const Sc = S(B, cm, false, true);
  for (let q = 0; q < n; q++) {
    const [ua, ya] = pts[q], [ub, yb] = pts[q + 1];
    const du = ub - ua, dy = yb - ya, Ls = Math.hypot(du, dy) || 1, nu = -dy / Ls, ny = du / Ls;
    const e = 0.06;
    // the coping: a slab on the curve, overhanging 4 cm each side
    poly(Sc, F, [[ua, ya + e, 0.05], [ub, yb + e, 0.05], [ub, yb + e, -t - 0.04], [ua, ya + e, -t - 0.04]], nu, ny, 0);
    poly(Sc, F, [[ua, ya - 0.01, 0.05], [ub, yb - 0.01, 0.05], [ub, yb + e, 0.05], [ua, ya + e, 0.05]], 0, 0, 1);
    poly(Sc, F, [[ub, yb - 0.01, -t - 0.04], [ua, ya - 0.01, -t - 0.04], [ua, ya + e, -t - 0.04], [ub, yb + e, -t - 0.04]], 0, 0, -1);
  }
}
// an oriel's height range: from / to in metres, or floors [first, last] above the base counted from 1
function orielY(O, floors, baseTop, top) {
  const fF = Array.isArray(O.floors) ? floors[Math.max(0, O.floors[0] - 1)] : null;
  const fL = Array.isArray(O.floors) ? floors[Math.min(floors.length - 1, (O.floors[1] ?? O.floors[0]) - 1)] : null;
  return [+(O.from ?? (fF ? fF.y0 : baseTop)), +(O.to ?? (fL ? fL.y1 : top))];
}
// FACE.oriels: [{ u0, u1, from, to, depth (0.75), kind: 'canted' | 'box', win, mat, tint }]: a bay projecting from the
// face over the floors from..to, three faces with the floor's windows, a corbelled underside, a cornice and a roof
function oriel(B, F, O, floors, W, wallSpec, baseTop, fi) {
  const d = +(O.depth ?? 0.75), u0 = +O.u0, u1 = +O.u1;
  // O.floors: [first, last] counting the floors above the base from 1 (as fireEscape), instead of from / to in metres
  const [y0, y1] = orielY(O, floors, baseTop, B.h - 0.6);
  const cant = O.kind === 'box' ? 0 : Math.min(d, O.cant !== undefined ? +O.cant : (u1 - u0) * 0.3);
  // the plan: left wall point, front-left, front-right, right wall point (local u, w)
  const P = [[u0, 0], [u0 + cant, d], [u1 - cant, d], [u1, 0]];
  const wm = M(B, O.mat || O.tint ? { mat: O.mat || wallSpec.mat, tint: O.tint || wallSpec.tint } : wallSpec, { grime: true });
  const T = { ...WIN_DEF, ...(W[O.win ?? O.window] || W.A || {}) };
  const fl = floors.filter((f) => f.y0 >= y0 - 0.3 && f.y1 <= y1 + 0.3);
  for (let s = 0; s < 3; s++) {
    const [ua, wa] = P[s], [ub, wb] = P[s + 1];
    const p0 = F.world(ua, 0, wa), p1 = F.world(ub, 0, wb);
    const Fs = new Frame([p0[0], p0[2]], [p1[0], p1[2]], F.y0, F.org);
    const Ls = Fs.L;
    if (Ls < 0.3) continue;
    const holes = [];
    const ww = Math.min(+T.w * (s === 1 ? 1 : 0.7), Ls - 0.3);
    if (ww > 0.35) for (const f of fl) {
      const ya = f.y0 + +T.sill, yb = Math.min(f.y1 - 0.2, ya + +T.h), ua2 = (Ls - ww) / 2, ub2 = ua2 + ww;
      holes.push({ u0: ua2 - 0.015, u1: ub2 + 0.015, y0: ya, y1: yb });
      windowAt(B, Fs, { ...T, w: ww }, ua2, ub2, ya, yb, f.y0, f.y1, fi * 1000 + 700 + s * 31 + Math.round(f.y0), { wallM: wm, widen: 0.2, lite: false });
    }
    const Sw = S(B, wm, false, true);
    wallWithHoles(Sw, Fs, 0, Ls, y0, y1, holes, 0);
  }
  // the underside (a corbel: a sloped soffit back to the wall) and the roof
  const ring = P.map(([u, w]) => F.world(u, 0, w)).map((p) => [p[0], p[2]]);
  const Sb = S(B, wm, false, true);
  const yc = y0 - Math.min(0.9, d * 1.1);
  for (let s = 0; s < 3; s++) {
    const [ua, wa] = P[s], [ub, wb] = P[s + 1];
    const su = -(wb - wa), sw = ub - ua, sl = Math.hypot(su, sw) || 1;   // the segment's outward normal in plan
    poly(Sb, F, [[ua, y0, wa], [ub, y0, wb], [ub, yc, 0], [ua, yc, 0]], (su / sl) * 0.6, -0.8, (sw / sl) * 0.6);
  }
  const cm = M(B, { mat: O.cornice?.mat || 'metal_painted', tint: O.cornice?.tint || '#d8d0c0' });
  const Sc = S(B, cm, false, true);
  const top = y1;
  for (let s = 0; s < 3; s++) {
    const [ua, wa] = P[s], [ub, wb] = P[s + 1];
    const p0 = F.world(ua, 0, wa), p1 = F.world(ub, 0, wb);
    const Fs = new Frame([p0[0], p0[2]], [p1[0], p1[2]], F.y0, F.org);
    extrude(Sc, Fs, [[0, top - 0.32], [0.04, top - 0.32], [0.04, top - 0.18], [0.12, top - 0.1], [0.14, top - 0.04], [0.14, top], [-0.3, top]], 0, Fs.L, { m0: 0.4, m1: 0.4 });
  }
  flatRing(S(B, cm, false, true), [ring[0], ring[1], ring[2], ring[3]].reverse(), F.y0 + top + 0.001, B.org);
  void ring;
}
function layoutBays(bs, L) {
  if (!bs) { const n = Math.max(1, Math.round(L / 3.2)); return Array.from({ length: n }, (_, j) => [(L * j) / n, (L * (j + 1)) / n]); }
  if (Array.isArray(bs.widths)) {
    const out = []; let u = 0;
    for (const w of bs.widths) { out.push([u, u + +w]); u += +w; }
    return out;
  }
  const n = Math.max(1, bs.n || 1), [ml, mr] = bs.margin || [0.6, 0.6];
  const w = (L - ml - mr) / n;
  return Array.from({ length: n }, (_, j) => [ml + j * w, ml + (j + 1) * w]);
}
function bayEdges(bays) {
  const s = new Set();
  for (const [a, c] of bays) { s.add(+a.toFixed(3)); s.add(+c.toFixed(3)); }
  return [...s].sort((a, b) => a - b);
}
// the parapet's coping along the top of a face (and the parapet's inner face)
function coping(B, F, u0, u1, yTop, mitres, wallSpec) {
  const [m0, m1] = mitres;
  // (no coping named: a precast concrete coping; the jointless limestone set read as a speckled rubble band up there)
  const cop = (B.spec.roof && B.spec.roof.parapet && B.spec.roof.parapet.coping) || 'concrete_smooth';
  const cm = M(B, { mat: cop, tint: (B.spec.roof && B.spec.roof.parapet && B.spec.roof.parapet.tint) || (/^metal|^alu|^steel/.test(cop) ? '#8b8d8c' : '#b9b3a6'), nrm: 0.4, chips: 0.2 });
  if (B.parH > 0.05) {
    // the parapet's inner face and its top, back 0.3 m
    const t = 0.3;
    const Sw = S(B, M(B, wallSpec), false, true);
    extrude(Sw, F, [[-t, B.h - 0.02], [-t, yTop]], u0, u1, { m0: m0, m1: m1, cap: false });
    const prof = [[-t - 0.04, yTop - 0.04], [-t - 0.04, yTop], [-t + 0.02, yTop + 0.07], [0.04, yTop + 0.06], [0.05, yTop - 0.03], [0.0, yTop - 0.03]];
    extrude(S(B, cm, false, true), F, prof, u0, u1, { m0, m1 });
  } else {
    extrude(S(B, cm, false, true), F, [[-0.3, yTop], [0.05, yTop + 0.02], [0.05, yTop - 0.05], [0, yTop - 0.05]], u0, u1, { m0, m1 });
  }
}
// rustication: courses of chamfered blocks proud of the wall, the openings left out
function rusticate(B, F, R, L, holes, baseTop) {
  const to = R.to === 'base' || R.to === undefined ? baseTop : +R.to;
  const j = Math.max(0.05, +(R.joint ?? 0.4) || 0.4), bl = Math.max(0.1, +(R.block ?? 1.2) || 1.2);
  const mat = R.mat ? M(B, R) : M(B, B.wallDef);
  const Sr = S(B, mat, false, true);
  for (let y = 0, c = 0; y < to - 0.05; y += j, c++) {
    const ya = y, yb = Math.min(to, y + j);
    // solid spans of this course
    const cov = holes.filter((h) => h.y0 < yb - 1e-3 && h.y1 > ya + 1e-3).map((h) => [h.u0, h.u1]).sort((a, b) => a[0] - b[0]);
    let cur = 0;
    const spans = [];
    for (const [a, b2] of cov) { if (a > cur + 0.02) spans.push([cur, a]); cur = Math.max(cur, b2); }
    if (L > cur + 0.02) spans.push([cur, L]);
    for (const [a, b2] of spans) {
      const off = (c % 2) * bl * 0.5;
      let u = a;
      while (u < b2 - 0.01) {
        // the next joint strictly past u: on a joint, (u + off) / bl can round to k - 1e-15 and floor() back to the
        // joint u stands on (u = 37.2 with 1.2 m blocks), which hung the page in this loop
        const nx = Math.min(b2, (Math.floor((u + off) / bl + 1e-6) + 1) * bl - off);
        if (!(nx > u)) break;
        box(Sr, F, u, nx, ya, yb, -0.02, 0.022, R.chamfer ?? 0.018, SK.NW);
        u = nx;
      }
    }
  }
}
// AR34 FACE.graffiti: { u0, u1, y0 (0.15), y1 (3.2), density (0.7), style, seed, bandTop, overGlass, w }: a painted zone on
// the wall (fk/kitTex.js graffitiTex), drawn over its solid spans (the openings left clean unless overGlass)
// (AR34 w2) GZ.kind 'mural' (an invented mural: style 'blocks' | 'bands' | 'piece', palette, ground, fade, flake) or
// 'stucco' (a weathered render: base [r, g, b], ghost [x0, x1] metres of a painted sign's ghost, glyphs, soot), both
// fk/kitPaint.js with its ageing pass, drawn the same way (the openings left clean unless overGlass)
function graffitiZone(B, F, GZ, L, holes) {
  const u0 = Math.max(0, +(GZ.u0 ?? 0)), u1 = Math.min(L, +(GZ.u1 ?? L)), y0 = +(GZ.y0 ?? 0.15), y1 = +(GZ.y1 ?? Math.min(3.2, B.h));
  const wM = u1 - u0, hM = y1 - y0;
  if (wM < 0.3 || hM < 0.3) return;
  const sd = GZ.seed ?? Math.floor(hash(B.seed, u0, 71.3) * 9973);
  const tx = GZ.kind === 'mural' || GZ.kind === 'stucco'
    ? paintTex(GZ.kind, wM, hM, sd, { style: GZ.style, palette: GZ.palette, ground: GZ.ground, fade: GZ.fade, flake: GZ.flake, base: GZ.base, ghost: GZ.ghost, glyphs: GZ.glyphs, soot: GZ.soot })
    : graffitiTex(wM, hM, sd, { density: GZ.density ?? 0.7, style: GZ.style, bandTop: GZ.bandTop ?? 0.1 });
  const Sg = S(B, kitGraffitiMat(tx, wM, hM, u0, y0), false, false);
  const cov = GZ.overGlass ? [] : holes.filter((h) => h.y0 < y1 - 0.05 && h.y1 > y0 + 0.05 && h.u1 > u0 && h.u0 < u1).map((h) => [h.u0, h.u1]).sort((a, c) => a[0] - c[0]);
  let cur = u0;
  const w = +(GZ.w ?? 0.004);
  for (const [a, c] of cov) { if (a > cur + 0.05) quadW(Sg, F, cur, a, y0, y1, w); cur = Math.max(cur, c); }
  if (u1 > cur + 0.05) quadW(Sg, F, cur, u1, y0, y1, w);
}
// items on a face: plaques, lamps, vents, siamese connections, flagpoles
function faceItem(B, F, it, wallM) {
  const u = +(it.u ?? 1), y = +(it.y ?? 2.4), iz = it.k === 'sign' ? 0 : +(it.z ?? 0);
  const Sm = S(B, kitMat(it.mat || 'metal_painted', { tint: it.tint || '#2b2b2b' }), true, true);
  switch (it.k) {
    // (AR34 w2, BID4: `z` moves an item out from the wall, e.g. a louvre grille in front of a fascia: z 0.15)
    case 'plaque': box(Sm, F, u, u + (it.w ?? 0.45), y, y + (it.h ?? 0.3), 0 + iz, 0.02 + iz, 0.004, SK.NW); break;
    case 'vent': box(Sm, F, u, u + (it.w ?? 0.6), y, y + (it.h ?? 0.4), -0.02 + iz, 0.05 + iz, 0.006, SK.NW); break;
    case 'siamese': box(Sm, F, u - 0.2, u + 0.2, y, y + 0.14, 0, 0.12, 0.02, SK.NW); break;
    case 'lamp': box(Sm, F, u - 0.07, u + 0.07, y, y + 0.3, 0, 0.18, 0.02, SK.NW); break;
    case 'flagpole': box(Sm, F, u - 0.025, u + 0.025, y, y + 0.05, 0, 2.2, 0.01, SK.NW); break;
    case 'grille': box(Sm, F, u, u + (it.w ?? 1), y, y + (it.h ?? 1), -0.01 + iz, 0.03 + iz, 0.005, SK.NW); break;
    case 'sign': if (it.sign) placeSign(B, F, it.sign, { u0: it.sign.u0 ?? u, u1: it.sign.u1 ?? u + 2, y: it.sign.y ?? y, z: it.z ?? 0.005, k: 60 + u, auto: it.z === undefined }); break;
    case 'mural':
      // AR34 w2 (BID3): an invented mural on the face, { u0, u1, y0, y1, style, palette, ground, fade, flake, seed, w }
      graffitiZone(B, F, { ...it, kind: 'mural', overGlass: it.overGlass ?? true, w: it.w ?? 0.005 }, F.L, []);
      break;
    case 'plywood': {
      // AR34: a plywood cover / hoarding on the face: 1.22 m sheets with their joints, painted (tint) or raw, graffiti on it
      // when it.graffiti (a density or { density, style, seed })
      const a0 = +(it.u0 ?? 0), a1 = +(it.u1 ?? a0 + 2.44), y0 = +(it.y0 ?? 0), y1 = +(it.y1 ?? y0 + 2.44), w0 = +(it.w ?? 0.02);
      const pm = M(B, { mat: it.mat || 'wood_painted', tint: it.tint || '#9c8462', chips: it.chips ?? 0.2, dirt: 0.55 });
      const Sp = S(B, pm, false, true);
      for (let a = a0; a < a1 - 0.05; a += 1.22) for (let yy = y0; yy < y1 - 0.05; yy += 2.44) box(Sp, F, a + 0.003, Math.min(a1, a + 1.22) - 0.003, yy + 0.003, Math.min(y1, yy + 2.44) - 0.003, w0, w0 + 0.019, 0.003, SK.NW);
      const gf = it.graffiti;
      if (gf) graffitiZone(B, F, { ...(typeof gf === 'object' ? gf : { density: +gf }), u0: a0, u1: a1, y0, y1, overGlass: true, w: w0 + 0.023 }, F.L, []);
      break;
    }
    default: break;
  }
  void wallM;
}
// a fire escape: balconies on the given floors of the given bays, ladders between, a drop ladder over the sidewalk
function fireEscape(B, F, FE, bays, floors) {
  const iron = kitMat('int_iron');
  const Si = S(B, iron, true, false), Sc = S(B, iron, false, true);
  const bs = (FE.bays || [0]).map((j) => bays[j]).filter(Boolean);
  if (!bs.length) return;
  const u0 = Math.min(...bs.map((b) => b[0])) + 0.15, u1 = Math.max(...bs.map((b) => b[1])) - 0.15;
  const [f0, f1] = FE.floors || [1, floors.length];
  const d = FE.depth ?? 1.2;
  for (let f = Math.max(1, f0); f <= Math.min(floors.length, f1); f++) {
    const fl = floors[f - 1];
    if (!fl) continue;
    const y = fl.y0 + 0.02;
    // the platform: a grating of flat bars on edge (6 mm x 32 mm, every 40 mm; open from below, as the real ones are), the
    // angle frame round it, the rails
    for (let u = u0 + 0.06; u < u1 - 0.05; u += 0.04) box(Si, F, u, u + 0.006, y - 0.032, y, 0.05, d - 0.05, 0, SK.NW | SK.PW);
    box(Si, F, u0, u1, y - 0.05, y, 0.0, 0.05, 0.003);
    for (const uu of [u0, u1 - 0.05]) box(Si, F, uu, uu + 0.05, y - 0.05, y, 0.0, d, 0.003);
    box(Sc, F, u0, u1, y - 0.06, y, d - 0.05, d, 0.004);                 // the fascia bar
    box(Si, F, u0, u1, y + 0.95, y + 1.0, d - 0.04, d, 0.004);            // the top rail
    box(Si, F, u0, u1, y + 0.45, y + 0.47, d - 0.03, d - 0.01, 0);        // the mid rail
    for (let u = u0; u <= u1 + 1e-3; u += 0.12) box(Si, F, u - 0.008, u + 0.008, y, y + 0.95, d - 0.03, d - 0.014, 0);   // pickets
    for (const uu of [u0, u1]) {
      // the end rails: a top and a mid rail back to the wall and pickets (AR34 w2: was one 1 m x d plate, the platforms read
      // as closed grey boxes from the street, s351 w2b3)
      box(Si, F, uu - 0.02, uu + 0.02, y + 0.95, y + 1.0, 0, d, 0);
      box(Si, F, uu - 0.012, uu + 0.012, y + 0.45, y + 0.47, 0, d, 0);
      for (let w = 0.12; w < d - 0.06; w += 0.12) box(Si, F, uu - 0.008, uu + 0.008, y, y + 0.95, w - 0.008, w + 0.008, 0);
      box(Si, F, uu - 0.015, uu + 0.015, y - 0.5, y, 0.05, 0.08, 0);       // the brackets to the wall
      poly(Si, F, [[uu, y - 0.02, 0.02], [uu, y - 0.02, d - 0.1], [uu, y - 0.55, 0.02]], uu === u0 ? -1 : 1, 0, 0);
    }
    // the ladder to the floor above (a steep stair between platforms)
    if (f < Math.min(floors.length, f1)) {
      const nx = floors[f];
      const la = u0 + 0.2, lc = la + 0.5;
      const yb = y, yt = nx.y0 + 0.02, run = (u1 - u0) * 0.55;
      const steps = Math.max(6, Math.round((yt - yb) / 0.22));
      for (let s = 1; s < steps; s++) {
        const t = s / steps, uu = la + run * t;
        box(Si, F, uu, uu + 0.18, yb + (yt - yb) * t - 0.02, yb + (yt - yb) * t, d * 0.3, d * 0.3 + 0.5, 0);
      }
      poly(Si, F, [[la, yb, d * 0.3 - 0.01], [la + run, yt, d * 0.3 - 0.01], [la + run, yt + 0.06, d * 0.3 - 0.01], [la, yb + 0.06, d * 0.3 - 0.01]], 0, 0, -1);
      poly(Si, F, [[la, yb, d * 0.3 + 0.51], [la + run, yt, d * 0.3 + 0.51], [la + run, yt + 0.06, d * 0.3 + 0.51], [la, yb + 0.06, d * 0.3 + 0.51]], 0, 0, 1);
      void lc;
    }
  }
  // the drop ladder under the lowest platform
  if (FE.drop !== false) {
    const fl = floors[Math.max(0, f0 - 1)];
    if (fl) {
      const y = fl.y0, la = u1 - 0.7;
      box(Si, F, la, la + 0.03, y - 2.6, y, d - 0.3, d - 0.27, 0); box(Si, F, la + 0.42, la + 0.45, y - 2.6, y, d - 0.3, d - 0.27, 0);
      for (let yy = y - 2.5; yy < y - 0.1; yy += 0.3) box(Si, F, la, la + 0.45, yy, yy + 0.02, d - 0.3, d - 0.28, 0);
    }
  }
}
// signs, blades and awnings of a bay (signs through fk/signKit.js)
function bayExtras(B, F, bay, H, baseH, fasc, k) {
  if (bay.sign) placeSign(B, F, bay.sign, { u0: bay.u0, u1: bay.u1, y: fasc ? baseH + 0.1 : H + 0.1, z: 0.005, k, auto: true });
  // a blade: u0 is where its bracket meets the wall, u1 - u0 its projection (SIGN's contract); `blade.w` sets the projection
  if (bay.blade) {
    const bu0 = bay.blade.u0 ?? +bay.u1 - 0.15;
    placeSign(B, F, { kind: 'blade', ...bay.blade, u0: bu0, u1: bay.blade.u1 ?? bu0 + (bay.blade.w ?? 0.9) }, { y: bay.blade.y ?? baseH + 0.6, z: 0, k: k + 0.5 });
  }
  for (const v of bay.vinyl || []) placeSign(B, F, { kind: 'painted', bg: null, h: 0.3, ...v, u0: bay.u0 + (v.u ?? 0.3), u1: Math.min(bay.u1 - 0.2, bay.u0 + (v.u ?? 0.3) + (v.w ?? 1.6)) }, { y: v.y ?? 1.6, z: -0.2, k: k + 0.25 });
  if (bay.awning && bay.awning.kind !== 'none') awning(B, F, bay, H, fasc, baseH);
}
function placeSign(B, F, sg, o) {
  if (!SIGNK || !SIGNK.buildSign) return;
  const u0 = +(sg.u0 ?? o.u0), u1 = +(sg.u1 ?? o.u1), y = +(sg.y ?? o.y), h = +(sg.h ?? 0.8);
  if (!(u1 > u0)) return;
  if (o.auto && B.proud) {
    let z = o.z || 0.005;
    for (const r of B.proud) if (r.u0 < u1 && r.u1 > u0 && r.y0 < y + h && r.y1 > y) z = Math.max(z, r.w + 0.006);
    o = { ...o, z };
  }
  let obj = null;
  try {
    const logo = sg.logo ? resolveFn(sg.logo) : null;
    obj = SIGNK.buildSign({ ...sg, u0, u1, h }, { logo, seed: B.seed + (o.k || 0) });
  } catch (e) { console.warn('[fk] buildSign', B.spec.id, e); return; }
  if (!obj) return;
  // AR34 sign.fade 0..1: a ghost sign, paint worn into the wall (the wall shows through, the colours washed toward white);
  // its own copies of the materials (the sign kit shares them), the same textures; kept out of the tile's sign merge
  const fade = Math.max(0, Math.min(0.95, +(sg.fade || 0)));
  if (fade > 0) {
    const W = new THREE.Color(1, 1, 1);
    obj.traverse((q) => {
      if (!q.isMesh || !q.material) return;
      // (AR34 w2 s6, SIGNS 06:14: three's clone does not copy the shader hooks; without them a sign kit face would draw as
      // a plain material (an R8 mask face red). No spec sets `fade` yet: not rendered)
      const fm = (mm) => { const c = mm.clone(); c.onBeforeCompile = mm.onBeforeCompile; c.customProgramCacheKey = mm.customProgramCacheKey; c.transparent = true; c.opacity = (mm.opacity ?? 1) * (1 - fade * 0.75); c.depthWrite = false; if (c.color) c.color.lerp(W, fade * 0.35); if (c.emissive) c.emissiveIntensity = (mm.emissiveIntensity ?? 1) * (1 - fade); return c; };
      q.material = Array.isArray(q.material) ? q.material.map(fm) : fm(q.material);
    });
  }
  // Frame.matrix is absolute: the sign's wall-local object goes into a holder placed in world space
  const g = new THREE.Group();
  g.name = fade > 0 ? 'fk_ghost' : 'fk_sign';
  g.matrixAutoUpdate = false;
  g.matrix.copy(F.matrix(u0, y, o.z || 0));
  g.add(obj);
  g.updateMatrixWorld(true);
  B.objs.push(g);
}
// an awning: a sloped fabric top on a frame, the side panels (fixed), the valance at the front
// the awning's lettering as a painted sign on the valance (SIGNS 00:51: the sign fields go through, so `fill`, `sub`,
// `tracking`, `stroke`, `align`, `caps`, `lines`, `runs`, `lead` reach the sign kit; a field not given keeps its default)
const AWN_SIGN = ['fill', 'sub', 'tracking', 'stroke', 'align', 'caps', 'lines', 'runs', 'lead'];
function awningSign(A, a, c, drop) {
  const sg = { kind: 'painted', text: A.text, font: A.font || 'Oswald-600', fg: A.fg || '#ffffff', bg: null, u0: a + 0.1, u1: c - 0.1, h: drop * 0.9, italic: !!A.italic };
  for (const k of AWN_SIGN) if (A[k] !== undefined && A[k] !== null) sg[k] = A[k];
  return sg;
}
function awning(B, F, bay, H, fasc, baseH) {
  const A = bay.awning;
  const proj = +(A.proj ?? 1.1), drop = +(A.drop ?? 0.35), a = +bay.u0 + 0.05, c = +bay.u1 - 0.05;
  // (AR34 w2 b1, BID3: `awning.top` sets the hanging height over the sidewalk, for a tall base whose own sign sits under
  // the fascia: 148 W's letters at 4.3-5.0 m, the canopy at 117 W 124th at 3.75-3.95 m)
  const top = A.top !== undefined ? +A.top : fasc ? baseH - 0.02 : H + 0.35, low = top - Math.max(0.5, proj * 0.55);
  const mat = kitMat('fab_awning', { tint: A.color || '#8a1c1c', side: THREE.DoubleSide });
  const Sa = S(B, mat, false, true);
  if (A.kind === 'dome') {
    const R = proj, cyy = top - R, prof = [];
    for (let t = 0; t <= 8; t++) { const th = (t / 8) * Math.PI / 2; prof.push([R * Math.sin(th), cyy + R * Math.cos(th)]); }
    prof.push([R, cyy - drop], [0.01, cyy - drop]);
    extrude(Sa, F, prof.map(([w, yy]) => [Math.max(0.01, w), yy]), a, c, { smooth: 30 });
    if (A.text || A.lines || A.runs) placeSign(B, F, awningSign(A, a, c, drop), { y: cyy - drop * 0.95, z: R + 0.006, k: 91 });
    return;
  }
  // the sloped cloth in panels about 0.7 m wide, each pillowed a little so the seams show as creases
  {
    const np = Math.max(1, Math.round((c - a) / 0.7)), pw = (c - a) / np;
    const sl = Math.hypot(proj - 0.02, top - low), sny = (proj - 0.02) / sl, snw = (top - low) / sl;
    for (let q = 0; q < np; q++) {
      const ua = a + q * pw, ub = ua + pw, lift = 0.022 + 0.01 * hash(B.seed, q, 91.1);
      const A0 = [ua, top, 0.02], B0 = [ub, top, 0.02], C0 = [ub, low, proj], D0 = [ua, low, proj];
      const P = [(ua + ub) / 2, (top + low) / 2 + sny * lift, (0.02 + proj) / 2 + snw * lift];
      for (const [p, q2] of [[A0, B0], [B0, C0], [C0, D0], [D0, A0]]) {
        const e1 = [q2[0] - p[0], q2[1] - p[1], q2[2] - p[2]], e2 = [P[0] - p[0], P[1] - p[1], P[2] - p[2]];
        let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        if (n[1] * sny + n[2] * snw < 0) n = [-n[0], -n[1], -n[2]];
        poly(Sa, F, [p, q2, P], n[0], n[1], n[2]);
      }
    }
  }
  quadW(Sa, F, a, c, low - drop, low, proj);
  if (A.kind !== 'retractable') {
    poly(Sa, F, [[a, top, 0.02], [a, low, proj], [a, low - drop, proj], [a, low - drop, 0.02]], -1, 0, 0);
    poly(Sa, F, [[c, top, 0.02], [c, low - drop, 0.02], [c, low - drop, proj], [c, low, proj]], 1, 0, 0);
  } else {
    // the arms
    const Si = S(B, kitMat('alu_clear'), true, false);
    for (const u of [a + 0.1, c - 0.1]) box(Si, F, u - 0.02, u + 0.02, low - 0.02, low + 0.02, 0.02, proj, 0.005);
  }
  quadW(S(B, mat, false, false), F, a, c, low - drop, low, proj - 0.004, true);
  if (A.text || A.lines || A.runs) placeSign(B, F, awningSign(A, a, c, drop), { y: low - drop * 0.95, z: proj + 0.006, k: 92 });
}

// ================================================================== the roof
function buildRoof(B) {
  const roof = B.spec.roof || {};
  const topY = B.y0 + B.h;
  const memb = roof.membrane || 'black';
  // (AR34, BID2 3: roof.dirt 0..1, default 0.45: the membrane's weathering, and a decal of ponding marks, patches and lap
  // seams over it; 0 = a clean new roof)
  const rdirt = Math.max(0, Math.min(1, +(roof.dirt ?? 0.45)));
  const mm = kitMat({ white: 'roof_tpo', silver: 'roof_membrane', black: 'roof_epdm', gravel: 'roof_gravel', pavers: 'concrete_board', green: 'mulch' }[memb] || 'roof_epdm',
    memb === 'green' ? { tint: '#4f6a36', dirt: rdirt } : { dirt: rdirt });
  const Sr = S(B, mm, false, true);
  const rring = notchedRing(B);
  flatRing(Sr, rring, topY, B.org);
  if (rdirt > 0.05 && memb !== 'green' && memb !== 'pavers') flatRing(S(B, kitRoofStainMat(), false, false), rring, topY + 0.004, B.org);
  // roof.clutter: small plant per 100 m2 (vent pipes, mushroom vents, condensers, duct runs, exhaust fans), scattered
  // inside the parapet by the building's seed
  const nClutter = Math.round(Math.max(0, +(roof.clutter ?? FKCLUTTER)) * ringArea(B.ring) / 100);
  if (nClutter > 0) roofClutter(B, nClutter, topY);
  // items
  const F = faceFrame(B, B.front);
  const depth = roofDepth(B);
  // AR34 (BID4 3, 6) roof.levels: [{ u0, u1 (along the front), d0, d1 (metres behind the front wall), h, mat, tint,
  // membrane, coping }]: a part of the building that rises over the main roof (a raised third, a back bulkhead block),
  // in the wall's material (or its own), with its membrane and coping
  for (const Lv of roof.levels || []) {
    const u0 = +(Lv.u0 ?? 0), u1 = +(Lv.u1 ?? F.L), d0 = +(Lv.d0 ?? 0), d1 = +(Lv.d1 ?? depth), h = +(Lv.h ?? 3.0);
    if (!(u1 - u0 > 0.3 && d1 - d0 > 0.3 && h > 0.2)) continue;
    const Fr = new Frame(F.p0, F.p1, B.y0 + B.h, B.org);
    const wm = M(B, Lv.mat ? { mat: Lv.mat, tint: Lv.tint, dirt: Lv.dirt } : Lv.tint ? { ...B.wallDef, tint: Lv.tint } : B.wallDef, { grime: true });
    box(S(B, wm, false, true), Fr, u0, u1, -0.15, h, -d1, -d0, 0.02, SK.NY | SK.PY);
    const lm = kitMat({ white: 'roof_tpo', black: 'roof_epdm', gravel: 'roof_gravel' }[Lv.membrane || roof.membrane || 'black'] || 'roof_epdm');
    quadY(S(B, lm, false, true), Fr, u0, u1, h - 0.05, -d1, -d0, 1);
    const cm = M(B, { mat: Lv.coping || 'concrete_smooth', tint: '#b9b3a6', nrm: 0.4, chips: 0.2 });
    const Sc = S(B, cm, false, true);
    box(Sc, Fr, u0 - 0.04, u1 + 0.04, h - 0.05, h + 0.06, -d0 - 0.3, -d0 + 0.04, 0.012, SK.NY);
    box(Sc, Fr, u0 - 0.04, u1 + 0.04, h - 0.05, h + 0.06, -d1 - 0.04, -d1 + 0.3, 0.012, SK.NY);
    box(Sc, Fr, u0 - 0.04, u0 + 0.3, h - 0.05, h + 0.06, -d1 + 0.3, -d0 - 0.3, 0.012, SK.NY);
    box(Sc, Fr, u1 - 0.3, u1 + 0.04, h - 0.05, h + 0.06, -d1 + 0.3, -d0 - 0.3, 0.012, SK.NY);
  }
  // (AR34 w2 b1, QA Q07: an item placed by shares of the front and the depth can land outside a footprint that is not a
  // rectangle, and floated in the air behind the building (q1090Ne: a bulkhead in the sky beyond the CVS); an item whose
  // centre or corners fall outside the ring moves toward the ring's centre in fifths, or is left out, with a warning)
  let rcx = 0, rcz = 0;
  for (const [x, z] of B.ring) { rcx += x; rcz += z; }
  rcx /= B.n; rcz /= B.n;
  const rcu = (rcx - F.p0[0]) * F.U[0] + (rcz - F.p0[1]) * F.U[1], rcw = (rcx - F.p0[0]) * F.N[0] + (rcz - F.p0[1]) * F.N[1];
  const fits = (u, w, hw, hd) => [[0, 0], [-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].every(([a, b]) => inRingXZ(B.ring, F.p0[0] + F.U[0] * (u + a) + F.N[0] * (w + b), F.p0[1] + F.U[1] * (u + a) + F.N[1] * (w + b)));
  for (const it of roof.items || []) {
    const at = it.at || [0.5, 0.5];
    let u = F.L * at[0], w = -depth * at[1];
    {
      const hw = it.k === 'tank' ? +(it.r ?? 1.6) : it.k === 'antenna' || it.k === 'sign' ? 0.05 : +(it.w ?? 1.6) / 2, hd = it.k === 'tank' ? +(it.r ?? 1.6) : it.k === 'antenna' || it.k === 'sign' ? 0.05 : +(it.d ?? 1.6) / 2;
      let ok = fits(u, w, hw, hd);
      for (let q = 1; q <= 5 && !ok; q++) { const t = q / 5, u2 = u + (rcu - u) * t, w2 = w + (rcw - w) * t; if (fits(u2, w2, hw, hd)) { u = u2; w = w2; ok = true; } }
      // (an item larger than a narrow roof: its centre inside is enough, as before)
      for (let q = 0; q <= 5 && !ok; q++) { const t = q / 5, u2 = u + (rcu - u) * t, w2 = w + (rcw - w) * t; if (fits(u2, w2, 0, 0)) { u = u2; w = w2; ok = true; } }
      if (!ok) { console.warn(`[fk] ${B.spec.id}: roof item ${it.k} at [${at}] does not fit inside the footprint, left out`); continue; }
      if (u !== F.L * at[0]) console.warn(`[fk] ${B.spec.id}: roof item ${it.k} at [${at}] moved inside the footprint`);
    }
    if (it.k === 'bulkhead') {
      const bw = +(it.w ?? 3.2), bd = +(it.d ?? 2.6), bh = +(it.h ?? 2.8);
      const wm = M(B, it.mat ? it : B.wallDef);
      const Fr = new Frame(F.p0, F.p1, B.y0 + B.h, B.org);
      box(S(B, wm, false, true), Fr, u - bw / 2, u + bw / 2, 0, bh, w - bd / 2, w + bd / 2, 0.02, SK.NY);
      box(S(B, M(B, 'metal_painted', { tint: '#5a5b58' }), false, true), Fr, u - bw / 2 - 0.1, u + bw / 2 + 0.1, bh, bh + 0.12, w - bd / 2 - 0.1, w + bd / 2 + 0.1, 0.02);
      box(S(B, M(B, 'metal_painted', { tint: '#3d3a36' }), true, false), Fr, u - 0.45, u + 0.45, 0, 2.05, w + bd / 2, w + bd / 2 + 0.03, 0.008);
    } else if (it.k === 'tank') tank(B, F, u, w, it);
    else if (it.k === 'hvac') {
      const n = it.n ?? 2;
      const Fr = new Frame(F.p0, F.p1, B.y0 + B.h, B.org);
      const hm = M(B, 'metal_painted', { tint: '#b9bab5' });
      for (let q = 0; q < n; q++) {
        const uu = u + (q - (n - 1) / 2) * 1.6;
        box(S(B, hm, false, true), Fr, uu - 0.6, uu + 0.6, 0.15, 1.1, w - 0.5, w + 0.5, 0.02);
        box(S(B, M(B, 'metal_painted', { tint: '#3a3b3a' }), true, false), Fr, uu - 0.35, uu + 0.35, 1.1, 1.14, w - 0.35, w + 0.35, 0);
        box(S(B, M(B, 'steel_black'), true, false), Fr, uu - 0.65, uu + 0.65, 0, 0.15, w - 0.55, w + 0.55, 0.01);
      }
    } else if (it.k === 'skylight') {
      const Fr = new Frame(F.p0, F.p1, B.y0 + B.h, B.org);
      box(S(B, M(B, 'alu_clear'), false, true), Fr, u - (it.w ?? 1.2) / 2, u + (it.w ?? 1.2) / 2, 0, 0.35, w - (it.d ?? 1.2) / 2, w + (it.d ?? 1.2) / 2, 0.02);
    } else if (it.k === 'antenna') {
      const Fr = new Frame(F.p0, F.p1, B.y0 + B.h, B.org);
      box(S(B, M(B, 'steel_black'), true, false), Fr, u - 0.03, u + 0.03, 0, it.h ?? 4, w - 0.03, w + 0.03, 0);
    } else if (it.k === 'sign' && it.sign) {
      placeSign(B, new Frame(F.p0, F.p1, B.y0 + B.h, B.org), it.sign, { u0: it.sign.u0 ?? u - 3, u1: it.sign.u1 ?? u + 3, y: it.sign.y ?? 0.5, z: w, k: 77 });
    }
  }
}
function ringArea(ring) { let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]); return Math.abs(a / 2); }
function roofClutter(B, n, topY) {
  const ring = B.ring;
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const edgeD = (x, z) => { let d = 1e9; for (let i = 0; i < ring.length; i++) { const a = ring[i], c = ring[(i + 1) % ring.length]; const ex = c[0] - a[0], ez = c[1] - a[1], L2 = ex * ex + ez * ez || 1; const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / L2)); d = Math.min(d, Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t)); } return d; };
  const galv = M(B, { mat: 'plain', tint: '#a7aaa8', rough: 0.45, metal: 0.55 }), white = M(B, { mat: 'plain', tint: '#d4d3cc', rough: 0.5, metal: 0.1 }), dark = M(B, { mat: 'plain', tint: '#3b3d3c', rough: 0.6, metal: 0.2 });
  const Sg = S(B, galv, false, false), Sw = S(B, white, false, true), Sd = S(B, dark, true, false);
  let placed = 0;
  for (let k = 0; k < n * 6 && placed < n; k++) {
    const x = x0 + (x1 - x0) * hash(B.seed, k, 81.1), z = z0 + (z1 - z0) * hash(B.seed, k, 82.2);
    if (!inRingXZ(ring, x, z) || edgeD(x, z) < 1.3) continue;
    // a little frame of its own, turned to the front's direction or across it
    const F = faceFrame(B, B.front), ux = F.U[0], uz = F.U[1], rot = hash(B.seed, k, 83.3) < 0.5;
    const ex = rot ? -uz : ux, ez = rot ? ux : uz;
    const Fr = new Frame([x, z], [x + ex, z + ez], topY, B.org);
    const kind = Math.floor(hash(B.seed, k, 84.4) * 5);
    if (kind === 0) { box(Sg, Fr, -0.07, 0.07, 0, 0.45 + hash(B.seed, k, 85.5) * 0.5, -0.07, 0.07, 0.01, SK.NY); }
    else if (kind === 1) { box(Sg, Fr, -0.18, 0.18, 0, 0.32, -0.18, 0.18, 0.01, SK.NY); box(Sg, Fr, -0.26, 0.26, 0.32, 0.4, -0.26, 0.26, 0.012, 0); }
    else if (kind === 2) { const w2 = 0.45 + hash(B.seed, k, 86.6) * 0.25; box(Sw, Fr, -w2, w2, 0.06, 0.82, -0.32, 0.32, 0.015, SK.NY); box(Sd, Fr, -w2 + 0.06, w2 - 0.06, 0.82, 0.84, -0.26, 0.26, 0, 0); box(Sd, Fr, -w2 - 0.03, w2 + 0.03, 0, 0.06, -0.35, 0.35, 0.004, SK.NY); }
    else if (kind === 3) { const L = 1.5 + hash(B.seed, k, 87.7) * 3.5; if (edgeD(x + ex * L, z + ez * L) < 1.0 || !inRingXZ(ring, x + ex * L, z + ez * L)) continue; box(Sg, Fr, 0, L, 0.3, 0.72, -0.21, 0.21, 0.01, 0); for (const u of [0.3, L - 0.3]) box(Sd, Fr, u - 0.03, u + 0.03, 0, 0.3, -0.18, 0.18, 0, SK.NY); }
    else { box(Sg, Fr, -0.35, 0.35, 0, 0.55, -0.35, 0.35, 0.012, SK.NY); box(Sg, Fr, -0.42, 0.42, 0.55, 0.62, -0.42, 0.42, 0.012, 0); box(Sd, Fr, -0.2, 0.2, 0.62, 0.7, -0.2, 0.2, 0.006, SK.NY); }
    placed++;
  }
}
// how deep the footprint runs behind the front (along -N)
function roofDepth(B) {
  const F = faceFrame(B, B.front);
  let d = 0;
  for (const [x, z] of B.ring) d = Math.max(d, -((x - F.p0[0]) * F.N[0] + (z - F.p0[1]) * F.N[1]));
  return d;
}
// a wooden water tank: staves, steel hoops, a conical roof, on a steel frame
function tank(B, F, u, w, it) {
  const r = +(it.r ?? 2.0), h = +(it.h ?? 3.8), legs = +(it.legs ?? 3.0);
  const [X, , Z] = F.world(u, 0, w);
  const y0 = B.y0 + B.h;
  const wood = M(B, 'wood_painted', { tint: it.tint || '#6e5a44' });
  const g = new THREE.Group();
  const Sw = S(B, wood, false, true), Sh = S(B, M(B, 'steel_black'), true, false), Ss = S(B, M(B, 'steel_black'), false, true);
  const seg = 28;
  const Fc = new Frame([X, Z], [X + 1, Z], y0, B.org);   // a frame at the tank's axis, u = x, w = -z... use raw pushes
  // the barrel: staves as flat facets (each its own normal) from the platform to the top
  const yb = legs, yt = legs + h;
  for (let s = 0; s < seg; s++) {
    const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
    const p = (a) => [Math.cos(a) * r, Math.sin(a) * r];
    const [x0, z0] = p(a0), [x1, z1] = p(a1);
    poly(Sw, Fc, [[x0, yb, -z0], [x1, yb, -z1], [x1, yt, -z1], [x0, yt, -z0]], Math.cos(am), 0, -Math.sin(am));
    // the conical roof
    poly(Sw, Fc, [[x0 * 1.04, yt, -z0 * 1.04], [x1 * 1.04, yt, -z1 * 1.04], [0, yt + r * 0.5, 0]], Math.cos(am) * 0.45, 0.9, -Math.sin(am) * 0.45);
  }
  // the hoops
  for (let q = 0; q < 6; q++) {
    const yy = yb + 0.25 + (h - 0.5) * (q / 5);
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2, rr = r + 0.015;
      poly(Sh, Fc, [[Math.cos(a0) * rr, yy, -Math.sin(a0) * rr], [Math.cos(a1) * rr, yy, -Math.sin(a1) * rr], [Math.cos(a1) * rr, yy + 0.035, -Math.sin(a1) * rr], [Math.cos(a0) * rr, yy + 0.035, -Math.sin(a0) * rr]], Math.cos(am), 0, -Math.sin(am));
    }
  }
  // the platform and the legs
  box(Ss, Fc, -r - 0.2, r + 0.2, yb - 0.25, yb, -r - 0.2, r + 0.2, 0.01);
  for (const [lx, lz] of [[-r * 0.8, -r * 0.8], [r * 0.8, -r * 0.8], [-r * 0.8, r * 0.8], [r * 0.8, r * 0.8]]) box(Ss, Fc, lx - 0.1, lx + 0.1, 0, yb - 0.25, lz - 0.1, lz + 0.1, 0.006);
  for (const lz of [-r * 0.8, r * 0.8]) box(Sh, Fc, -r * 0.8, r * 0.8, yb * 0.45, yb * 0.45 + 0.08, lz - 0.02, lz + 0.02, 0);
  void g;
}

// ================================================================== the building
function buildRec(rec, ctx, cells, opt) {
  const B = makeB(rec, ctx, cells);
  const spec = B.spec;
  const cust = spec.custom ? (typeof spec.custom === 'string' ? { fn: spec.custom, with: null } : spec.custom) : null;
  const fn = cust ? resolveFn(cust.fn) : null;
  if (cust && !fn) console.warn(`[fk] ${spec.id}: custom builder ${cust.fn} not found (the kit builds it)`);
  const kitToo = !fn || cust.with === 'kit';
  if (kitToo) {
    // the faces: spec'd ones by edge, every other edge plain
    const byEdge = new Map();
    for (const fs of spec.faces || []) {
      const e = resolveEdge(B, fs.edge);
      if (e >= 0 && !byEdge.has(e)) byEdge.set(e, fs);
      else if (e < 0) console.warn(`[fk] ${spec.id}: face edge ${JSON.stringify(fs.edge)} not found`);
      if (e >= 0 && fs.edge !== 'rear' && (((B.blind >> e) & 1) || partyWall(B, e))) console.warn(`[fk] ${spec.id}: face ${JSON.stringify(fs.edge)} lands on edge ${e}, a ${((B.blind >> e) & 1) ? 'blind wall' : 'party wall'}`);
    }
    for (let i = 0; i < B.n; i++) buildFace(B, i, byEdge.get(i) || null);
    buildRoof(B);
    // the other footprints the spec replaces (a building split in the data), as plain massing
    if (!spec.ring) for (const r of rec.rings) if (r !== rec.rings.find((q) => q.primary)) {
      const cm2 = cleanRingMap(r.ring);
      const B2 = { ...B, ring: cm2.ring, n: cm2.ring.length, emap: cm2.map, blind: 0, b: r.b, h: spec.h ?? r.b.height, front: 0 };
      for (let i = 0; i < B2.n; i++) buildFace(B2, i, null);
      buildRoof({ ...B2, spec: { ...spec, roof: { ...(spec.roof || {}), items: [] } } });
    }
  }
  if (fn) {
    const frame = makeFrameAPI(B);
    const g = new THREE.Group();
    g.name = 'fk_custom';
    try { fn(g, ctx, spec, frame); } catch (e) { console.warn(`[fk] ${spec.id}: custom ${cust.fn}`, e); }
    if (g.children.length) B.objs.push(g);
  }
  // the collider (the compiled prism went with the skipped building)
  if (opt.colliders) {
    const pts = new Float32Array(B.ring.length * 2);
    let minX = 1e9, minZ = 1e9, maxX = -1e9, maxZ = -1e9;
    B.ring.forEach(([x, z], k) => { pts[k * 2] = x; pts[k * 2 + 1] = z; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); });
    try { opt.colliders.addPrism(ctx.key, { pts, minX, minZ, maxX, maxZ, y0: B.y0 - 2, y1: B.y0 + B.h }); } catch (e) { /* the collider is optional */ }
  }
  B.cell.objs.push(...B.objs);
  return B;
}

// ================================================================== the frame API for custom builders (fk/custom/<seg>.js)
// frame: the front edge's frame (u along it from its left end, n out to the street, y0 the sidewalk) and frame.kit, the
// kit's own pieces writing into the building's merged meshes. Stable from 2026-09-30 (docs/notes/ar33-spec.md).
function makeFrameAPI(B) {
  const mk = (F) => {
    const kit = {
      F,
      mat: (name, o = {}) => M(B, typeof name === 'string' ? { mat: name, ...o } : name, { noWeather: true }),
      // box(mat, u0, u1, y0, y1, w0, w1, { c: chamfer, skip, near, shadow })
      box: (mat, u0, u1, y0, y1, w0, w1, o = {}) => box(S(B, resolveMat(mat), !!o.near, o.shadow ?? !o.near), F, u0, u1, y0, y1, w0, w1, o.c ?? 0.012, o.skip || 0),
      // extrude(mat, [[w, y], ...], u0, u1, { m0, m1, cap, smooth, near })
      extrude: (mat, prof, u0, u1, o = {}) => extrude(S(B, resolveMat(mat), !!o.near, o.shadow ?? !o.near), F, prof, u0, u1, o),
      // poly(mat, [[u, y, w], ...], [nu, ny, nw])
      poly: (mat, pts, n, o = {}) => poly(S(B, resolveMat(mat), !!o.near, o.shadow ?? !o.near), F, pts, n[0], n[1], n[2]),
      // wall({ u0, u1, y0, y1, holes: [{ u0, u1, y0, y1 }], mat, reveal }): a wall panel with openings (and their returns)
      wall: (o = {}) => {
        const m = resolveMat(o.mat || B.wallDef);
        wallWithHoles(S(B, m, false, true), F, o.u0 ?? 0, o.u1 ?? F.L, o.y0 ?? -1.5, o.y1 ?? B.h, o.holes || [], o.w ?? 0);
        if (o.reveal) for (const h of o.holes || []) reveal(S(B, m, false, true), F, h, o.reveal, { w1: o.w ?? 0 });
      },
      // window(T, ua, ub, ya, yb, { fy0, fy1, wallMat }): a window of type T (the spec's window type) in that opening
      window: (T, ua, ub, ya, yb, o = {}) => windowAt(B, F, { ...WIN_DEF, ...T }, ua, ub, ya, yb, o.fy0 ?? ya - (T.sill ?? 0.8), o.fy1 ?? yb + 0.6, Math.floor((ua + ya) * 100), { wallM: resolveMat(o.wallMat || B.wallDef), widen: o.widen ?? 0.6 }),
      // cornice(C, u0, u1, yTop, { m0, m1 }): the spec's cornice kinds
      cornice: (C, u0, u1, yTop, o = {}) => cornice(B, F, C, u0, u1, yTop, [o.m0 || 0, o.m1 || 0]),
      band: (Bd, u0, u1, y) => band(B, F, Bd, u0, u1, y, resolveMat(B.wallDef)),
      // storefront(bay, H): a BASE bay (store or entrance) of height H
      storefront: (bay, H, o = {}) => (bay.kind === 'entrance' ? entranceBay(B, F, bay, H, { wallM: resolveMat(o.wallMat || B.wallDef) })
        : storeBay(B, F, bay, H, { wallM: resolveMat(o.wallMat || B.wallDef), k: Math.floor(bay.u0 * 10), gates: !!bay.gate })),
      // sign(SIGN, { z }): through fk/signKit.js, placed at (sign.u0, sign.y) on the face
      sign: (sg, o = {}) => placeSign(B, F, sg, { u0: sg.u0, u1: sg.u1, y: sg.y, z: o.z ?? 0.005, k: o.k ?? 0 }),
      fireEscape: (FE, bays, floors) => fireEscape(B, F, FE, bays, floors),
      tank: (u, w, it) => tank(B, F, u, w, it || {}),
      // add(object3D): a hand-built object in WORLD coordinates (use frame.matrix() to place wall-local pieces)
      add: (obj) => { if (obj) B.objs.push(obj); },
      matrix: (u = 0, y = 0, w = 0) => F.matrix(u, y, w),
      world: (u, y, w) => F.world(u, y, w),
    };
    return kit;
  };
  // (a custom builder's kit.mat material drawn through the sinks: its set's shared material, see M(); `?fkshare=0` the A/B)
  const resolveMat = (m) => {
    if (!(m && m.isMaterial)) return M(B, m);
    const sa = FKSHARE && m.userData && m.userData.fkSinkAs;
    return sa ? M(B, sa.m, sa.extra) : m;
  };
  const F = faceFrame(B, B.front);
  const api = {
    p0: F.p0, p1: F.p1, L: F.L, u: F.U, n: F.N, y0: B.y0, h: B.h, ring: B.ring, front: B.front, spec: B.spec,
    kit: mk(F),
    // face(edge): the same API on another edge ('corner', 'rear', an index, [x0, z0, x1, z1])
    face: (e) => { const i = resolveEdge(B, e); return i >= 0 ? { i, L: faceFrame(B, i).L, kit: mk(faceFrame(B, i)) } : null; },
    matrix: (u = 0, y = 0, w = 0) => F.matrix(u, y, w),
    world: (u, y, w) => F.world(u, y, w),
  };
  return api;
}

// ================================================================== the tile
export function buildTile(group, ctx, list, opt = {}) {
  const cells = new Map();
  let built = 0;
  const errors = [];
  for (const rec of list) {
    try { buildRec(rec, ctx, cells, opt); built++; } catch (e) { errors.push(`${rec.spec.id}: ${e.message}`); console.warn(`[fk] ${rec.spec.id}`, e); }
  }
  return finishTile(group, cells, built, errors);
}
function mergeTileSigns(group) {
  if (!SIGNK || !SIGNK.mergeSigns || !SIGNK.signsSettled || !group.addEventListener) return;
  const holders = group.children.filter((o) => o.name === 'fk_sign');
  if (holders.length < 2) return;
  let gone = false;
  const onGone = () => { gone = true; };
  group.addEventListener('removed', onGone);
  SIGNK.signsSettled().then(() => {
    group.removeEventListener('removed', onGone);
    if (gone) return;
    const live = holders.filter((o) => o.parent === group);
    if (live.length < 2) return;
    let merged = null;
    try { merged = SIGNK.mergeSigns(live); } catch (e) { console.warn('[fk] mergeSigns', e); return; }
    if (!merged || !merged.children.length) return;
    for (const o of live) { group.remove(o); o.traverse((q) => { if (q.isMesh && q.geometry) q.geometry.dispose(); }); }
    merged.name = 'fk_signs';
    group.add(merged);
  }).catch(() => {});
}
// the same in slices of opt.slice ms (8), yielding to the page between buildings; stops when the tile's group is removed
// (the tile unloaded before the build was done)
export async function buildTileAsync(group, ctx, list, opt = {}) {
  const cells = new Map();
  let built = 0, gone = false, busy = 0, longest = 0;
  const errors = [];
  const onGone = () => { gone = true; };
  group.addEventListener('removed', onGone);
  let t0 = performance.now();
  for (const rec of list) {
    if (gone) break;
    const tb = performance.now();
    try { buildRec(rec, ctx, cells, opt); built++; } catch (e) { errors.push(`${rec.spec.id}: ${e.message}`); console.warn(`[fk] ${rec.spec.id}`, e); }
    longest = Math.max(longest, performance.now() - tb);
    if (performance.now() - t0 > (opt.slice ?? 8)) { busy += performance.now() - t0; await new Promise((r) => setTimeout(r, 0)); t0 = performance.now(); }
  }
  group.removeEventListener('removed', onGone);
  if (gone) return { built: 0, tris: 0, errors: ['tile unloaded mid-build'], gone: true };
  const tf = performance.now();
  const out = finishTile(group, cells, built, errors);
  // busy: the main-thread time the tile took (the build's wall time also holds the other work between its slices);
  // longest: the longest single building (a slice is never shorter than one building)
  out.busy = Math.round(busy + performance.now() - t0);
  out.longest = Math.round(Math.max(longest, performance.now() - tf));
  return out;
}
function finishTile(group, cells, built, errors) {
  let tris = 0;
  queueMicrotask(() => mergeTileSigns(group));
  for (const cell of cells.values()) {
    const root = new THREE.Group();
    root.name = 'fk_cell';
    root.position.set(cell.org[0], 0, cell.org[1]);
    const near = new THREE.Group();
    for (const lv of [0, 1]) {
      for (const e of cell.lv[lv].values()) {
        const geo = e.S.build();
        if (!geo) continue;
        tris += e.S.tris;
        const m = new THREE.Mesh(geo, e.mat);
        m.castShadow = e.shadow && !e.mat.transparent;
        m.receiveShadow = !e.mat.transparent;
        if (e.mat.transparent) m.renderOrder = 2;
        if (lv === 0) { m.layers.enable(3); root.add(m); } else near.add(m);
      }
    }
    if (near.children.length) {
      const lod = new THREE.LOD();
      lod.addLevel(near, 0);
      lod.addLevel(new THREE.Object3D(), LOD_D);
      root.add(lod);
    }
    if (root.children.length) group.add(root);
    for (const o of cell.objs) {
      group.add(o);
      o.traverse((q) => { if (q.isMesh && q.geometry) { const ix = q.geometry.index; tris += (ix ? ix.count : q.geometry.getAttribute('position').count) / 3; } });
    }
  }
  // the far-merge squares (FCELL): one mesh per opaque far material each, at the square's centre
  if (cells.T) for (const T of cells.T.values()) {
    const root = new THREE.Group();
    root.name = 'fk_cell';
    root.position.set(T.org[0], 0, T.org[1]);
    for (const e of T.far.values()) {
      const geo = e.S.build();
      if (!geo) continue;
      tris += e.S.tris;
      const m = new THREE.Mesh(geo, e.mat);
      m.castShadow = e.shadow && !e.mat.transparent;
      m.receiveShadow = !e.mat.transparent;
      if (e.mat.transparent) m.renderOrder = 2;
      m.layers.enable(3);
      root.add(m);
    }
    if (root.children.length) group.add(root);
  }
  return { built, tris: Math.round(tris), errors };
}
