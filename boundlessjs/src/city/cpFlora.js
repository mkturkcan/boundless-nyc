// CP32F — Central Park's trees, lamps, benches and litter baskets (part of city/centralPark.js; docs/notes/central-park-flora.md).
// `?cp32f=0` restores what the compiled city had here.
//
// What the compiled park had: ~430 trees scattered at random over the lawns and the lakes, 71 census street trees and
// 32 "yard" trees inside the park, and the drives dressed as city streets: 396 cobra-head lamps, 236 sign poles,
// dumpsters, news boxes and mailboxes along them. The real park has ~18,000 trees, about half of it under canopy: woods
// (the Ramble, the North Woods, the Hallett sanctuary), groves and tree-lined paths round open meadows (Sheep Meadow,
// the Great Lawn, the North and East Meadows) that have trees only at their edges.
//
// TREES. Planted where the canopy is: the USGS NAIP orthoimagery (public domain; 4 bands with near-infrared, 0.6 m)
// classified into canopy and lawn by NDVI, the green/NIR ratio and the NIR texture, the canopy split into crowns by a
// watershed of its NIR from each sunlit crown top, a trunk at each crown's centroid (moved off the water, drives, paths,
// steps, buildings, hard pitches and plazas), the crown width from the crown's area; OpenStreetMap's mapped trees take
// the place of the crowns they stand in; the Mall's four rows of American elms by rule (tools/cp/flora_*.py, baked in
// city/cpFloraData.js). Each tree is one of the kit's species forms (furnitureKit TREE_FORMS) by where it stands:
// woodland mixes (oak, maple, black locust, black cherry and the small understorey trees), London planes, elms and pin
// oaks along the drives, the Reservoir's and Cherry Hill's cherries, the Conservatory Garden's crabapples, the Pinetum.
// The records go through the city's own tree path (world/assemble.js FURN.TREE): the TV25 form pools, their LOD and far
// shadow proxies, the TC13/FD14 allometry. So this module turns (form, crown width) into the kit's species index p0 and a
// trunk diameter p1 that the allometry sizes to that crown, and nudges each trunk by at most 0.35 m to the point at which
// the kit's own position hash (treePoolFor) routes that species to the intended form.
//
// LAMPS, BENCHES, LITTER BASKETS (tools/cp/flora_furn.py): OpenStreetMap's mapped ones where they are, elsewhere along
// the paved paths and the drives, the Mall's continuous benches; built per tile as one instanced mesh per kind, on the
// tile's ground; the lamps join world/cityLamps.js at night; every bench place is a seat for the crowd (seats()).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FURN } from '../shared/geo.js';
import { ENV, applyLightTrim, applyCityAO, applySnowCap } from '../world/materials.js';
import { lampSpots } from '../world/life.js';
import { TREE_SPECIES, TREE_ARCH, TREE_FORMS, TV25, tv25Spec, treePoolFor } from './furnitureKit.js';
import { CP_FORMS, CP_TREES, CP_PARK, CP_TRANSVERSE, CP_LAMPS, CP_BENCHES, CP_BASKETS } from './cpFloraData.js';
import { cpOnRock } from './cpLand.js';

export const CP32F = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('cp32f') === '0');

// ---- the park's outline and its transverse roads (world metres)
const PARK = [];
for (let i = 0; i < CP_PARK.length; i += 2) PARK.push([CP_PARK[i] / 10, CP_PARK[i + 1] / 10]);
const PB = PARK.reduce((b, [x, z]) => [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)], [1e9, -1e9, 1e9, -1e9]);
export function cpInPark(x, z) {
  if (x < PB[0] || x > PB[1] || z < PB[2] || z > PB[3]) return false;
  let c = false;
  for (let i = 0, j = PARK.length - 1; i < PARK.length; j = i++) {
    const [xi, zi] = PARK[i], [xj, zj] = PARK[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const segDist = (L, x, z) => {
  let best = 1e9;
  for (let i = 0; i + 1 < L.length; i++) {
    const [ax, az] = L[i], [bx, bz] = L[i + 1], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return best;
};
const TRANSV = CP_TRANSVERSE.map((a) => { const p = []; for (let i = 0; i < a.length; i += 2) p.push([a[i] / 10, a[i + 1] / 10]); return p; });
const nearTransverse = (x, z, r) => TRANSV.some((L) => segDist(L, x, z) < r);
const edgeDist = (x, z) => segDist([...PARK, PARK[0]], x, z);

// ---- compiled furniture this part replaces. Trees: the compiler's scatter (and its yard trees) inside the park, and the
// census points more than 6 m inside the park wall (the perimeter sidewalks' street trees stay); the canopy above plants
// the park's own. The drives were compiled as city streets: their cobra-head lamps, sign poles, street signs, litter
// bins, news boxes, mailboxes, dumpsters and the like go (the park's own lamps and baskets replace them), except on the
// four transverse roads, which are city streets. Signals, hydrants and subway entrances stay.
const DROP_KINDS = new Set([FURN.LAMP_COBRA, FURN.LAMP_CROOK, FURN.STREET_SIGN, FURN.LITTER, FURN.MAILBOX, FURN.NEWSSTAND,
  FURN.BENCH, FURN.AWNING, FURN.PHONE, FURN.PLANTER, FURN.PARKING_METER, FURN.CONE, 34, 35, 36, 37, 38]);
export function dropFurniture(wx, wz, f) {
  if (!CP32F || !cpInPark(wx, wz)) return false;
  if (f.k === FURN.TREE) return !(f.p2 & 1) || edgeDist(wx, wz) > 6;
  return DROP_KINDS.has(f.k) && !nearTransverse(wx, wz, 14);
}

// ---- the trees
// form -> the census species index (TREE_SPECIES) that furnitureKit TREE_FORM_MIX routes to it (0 = "other": elm/zelkova,
// sophora/ash-round, small ornamental, purple plum, by the kit's position hash)
const P0 = { P: 1, H: 2, R: 3, G: 4, Q: 5, L: 6, M: 7, Y: 8, Z: 0, S: 0, W: 0, X: 0 };
// world/assemble.js tree sizing (TC13 allometry with the FD14 envelope, the defaults): height and spread factors for a
// trunk of `dbh` inches of species `sp`
function allometry(sp, dbh) {
  const sH = Math.max(0.55, Math.min(1.52, (0.46 + 0.80 * Math.sqrt(dbh / 24)) * sp.s));
  const sW = Math.max(0.45, Math.min(1.42, sH * (sp.w ?? 1) * (0.80 + 0.40 * Math.min(1, dbh / 26))));
  return [sH, sW];
}
// the trunk diameter whose crown is `cw` metres across on a pool built `baseW` wide (clamped to the kit's range)
function dbhFor(sp, baseW, cw) {
  let lo = 4, hi = 60;
  if (baseW * allometry(sp, lo)[1] >= cw) return lo;
  if (baseW * allometry(sp, hi)[1] <= cw) return hi;
  for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (baseW * allometry(sp, m)[1] < cw) lo = m; else hi = m; }
  return Math.round(((lo + hi) / 2) * 10) / 10;
}
// cpFurniture hands each record tile-local and assemble.js adds the tile origin back: the kit hashes THAT position
const rt = (x) => { const o = Math.floor(x / 512) * 512; return (x - o) + o; };
const formOf = (pool) => pool.slice(4).replace(/\d+$/, '');
const frac = (v) => v - Math.floor(v);

let _recs = null;
export const CP32F_STATS = { trees: 0, byForm: {}, bySource: [0, 0, 0], nudgeMiss: 0, tiles: {} };
export function furniture() {
  if (!CP32F || DIRECT) return [];   // (DIRECT: the trees are claimed in build(), below)
  if (_recs) return _recs;
  const out = [];
  const S = CP32F_STATS;
  for (let i = 0; i < CP_TREES.length; i += 4) {
    const x0 = CP_TREES[i] / 10, z0 = CP_TREES[i + 1] / 10, cw = CP_TREES[i + 2] / 10, code = CP_TREES[i + 3];
    const F = CP_FORMS[code & 15], src = (code >> 4) & 3;
    const p0 = P0[F] ?? 0;
    const sp = TREE_SPECIES[p0] || TREE_SPECIES[0];
    let x = x0, z = z0, pool = null;
    if (TV25) {
      // the trunk nudge (golden-angle spiral, 5 cm steps, <= 0.35 m) at which the kit's hash picks this form
      for (let k = 0; k < 48; k++) {
        const a = k * 2.39996, r = 0.05 * Math.sqrt(k);
        const xx = x0 + Math.cos(a) * r, zz = z0 + Math.sin(a) * r;
        const pl = treePoolFor(p0, rt(xx), rt(zz), 20, 0);
        if (formOf(pl) === F) { x = xx; z = zz; pool = pl; break; }
      }
      if (!pool) { S.nudgeMiss++; pool = treePoolFor(p0, rt(x), rt(z), 20, 0); }
    }
    const spec = pool ? tv25Spec(pool) : null;
    const baseW = spec ? spec.W : (TREE_ARCH[sp.arch] || TREE_ARCH.A).w;
    const dbh = dbhFor(sp, baseW, cw);
    out.push({ k: FURN.TREE, x, z, rot: frac(Math.sin(i * 0.731 + 1.7) * 43758.5453) * 6.2832, p0, p1: dbh, p2: 0 });
    const f2 = pool ? formOf(pool) : F;
    S.byForm[f2] = (S.byForm[f2] || 0) + 1;
    S.bySource[src] = (S.bySource[src] || 0) + 1;
    const tk = `${Math.floor(x / 512)}_${Math.floor(z / 512)}`;
    S.tiles[tk] = (S.tiles[tk] || 0) + 1;
  }
  S.trees = out.length;
  if (typeof window !== 'undefined') window.__CP32F = S;
  return (_recs = out);
}

// ---- DIRECT CLAIMS (07:25, after the first renders). Through furniture records the kit's allometry caps a crown at
// 15.3 m across (the FD14 envelope), and seen from above a kit crown covers ~0.6 of its nominal width (a round crown,
// the gaps between its clumps, the sparser far LOD): the park's measured canopy (45.8 % of the park) rendered as
// scattered trees on a lawn (shots/cp32/flora/r1 fTopLake, cpBethesdaHigh). So in the browser the park's trees are
// claimed straight into the kit's TV25 pools (the same pools, 90 m LOD, far-shadow proxies and draw calls as the census
// trees; the instancer adds its own yaw, lean, crown stretch and tint) at the measured crown width x CW_K and a height
// from the crown width, and handed back when the tile goes. furniture() keeps the record path for ?tv25=0 and node.
const DIRECT = TV25 && typeof window !== 'undefined';
// tuning without a code change: `?cp32fk=<crown width factor>` (default 1.3), `?cp32fn=<share of the trees kept>`
// (default 1: a thinner park drops trees by hash, the small understorey ones first)
const QF = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const CW_K = Math.max(0.5, Math.min(2, Number(QF?.get('cp32fk')) || 1.3));
const KEEP = Math.max(0, Math.min(1, QF?.has('cp32fn') ? Number(QF.get('cp32fn')) : 1));
// height from the drawn crown width (m): 4 m of clear trunk and a crown about as tall as it is wide, by form (a
// cherry is wide and low, a ginkgo or a pin oak tall and narrow); park trees are 12-25 m (the Mall's elms ~26 m)
const HK = { P: 1.05, H: 1.0, R: 0.9, Q: 1.12, M: 0.95, L: 1.0, G: 1.15, Y: 0.72, Z: 1.1, S: 1.0, X: 0.8, W: 0.8 };
const heightOf = (F, cw) => Math.min(28, 4.0 + Math.min(cw, 20) + 0.3 * Math.max(0, cw - 20)) * (HK[F] || 1);
// an open-grown tree (a lawn's or a path's, not the woods'): lower and broader for its crown, its limbs low (the kit's
// forms are street trees, limbed up a quarter of their height, so a lower tree of the same spread drops its crown)
const heightOpen = (F, cw) => Math.min(26, 2.5 + 0.92 * Math.min(cw, 20) + 0.3 * Math.max(0, cw - 20)) * (HK[F] || 1);
const _spec = new Map();
const specOf = (pool) => { let s = _spec.get(pool); if (s === undefined) _spec.set(pool, (s = tv25Spec(pool))); return s; };
let _tbins = null;
function treeBins() {
  if (_tbins) return _tbins;
  const B = new Map();
  for (let i = 0; i < CP_TREES.length; i += 4) {
    const x = CP_TREES[i] / 10, z = CP_TREES[i + 1] / 10, cw = CP_TREES[i + 2] / 10, code = CP_TREES[i + 3];
    const k = `${Math.floor(x / 512)}_${Math.floor(z / 512)}`;
    let b = B.get(k); if (!b) B.set(k, (b = []));
    b.push([x, z, cw, CP_FORMS[code & 15], (code >> 4) & 3, (code >> 6) & 1, (code >> 7) & 1]);
  }
  return (_tbins = B);
}
export const CP32F_CLAIMS = { tiles: {}, trees: 0, miss: 0 };
// the schist outcrops (cpLand.js: rounded humps 0.5-4 m): no trunk, lamp or bench on one
const onRock = (x, z) => { try { return cpOnRock(x, z); } catch (e) { return false; } };
const ROCK_STEP = [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5], [1.8, 1.8], [-1.8, 1.8], [1.8, -1.8], [-1.8, -1.8], [4, 0], [-4, 0], [0, 4], [0, -4]];
// live claim sets and meshes, for the in-page A/B (window.__CP32F_SET / __CP32F_AB)
const _sets = new Set(), _meshes = new Set();
let _on = true;
const claimSet = (inst, S) => { S.ids = S.spec.map(([p, x, y, z, rot, sW, sH, col]) => inst.claim(p, x, y, z, rot, sW, sH, sW, col)); };
const releaseSet = (inst, S) => { if (S.ids) S.spec.forEach(([p], i) => { if (S.ids[i] >= 0) inst.release(p, S.ids[i]); }); S.ids = null; };
function claimTrees(group, ctx) {
  const inst = window.__INST || window.__INSTANCER;
  const L = treeBins().get(`${Math.floor(ctx.ox / 512)}_${Math.floor(ctx.oz / 512)}`);
  if (!inst || !L) return;
  const S = { spec: [], ids: null, inst };
  let miss = 0, rock = 0;
  for (const [x0, z0, cw, F, src, con, wood] of L) {
    // (thinning: a tree's keep threshold rises with its crown, so the understorey goes first)
    if (KEEP < 1 && src !== 2 && frac(Math.sin(x0 * 3.7 + z0 * 9.1) * 43758.5453) * Math.min(1, 6 / Math.max(cw, 1)) > KEEP * 0.75) continue;
    let x = x0, z = z0;
    if (onRock(x, z)) {
      const st = ROCK_STEP.find(([dx, dz]) => !onRock(x0 + dx, z0 + dz));
      if (!st) { rock++; continue; }
      x = x0 + st[0]; z = z0 + st[1];
    }
    const h1 = frac(Math.sin(x0 * 12.9898 + z0 * 78.233) * 43758.5453), h2 = frac(h1 * 91.3 + 0.17);
    const nv = (TREE_FORMS[F] && TREE_FORMS[F].variants) || 1;
    const pool = 'tree' + F + (nv > 1 && h2 < 0.5 ? '2' : '');
    const P = specOf(pool);
    if (!P) { miss++; continue; }
    const cwD = Math.min(26, cw * CW_K);
    const hD = (wood || src === 2 ? heightOf(F, cwD) : heightOpen(F, cwD)) * (0.92 + 0.16 * h1);
    const sW = cwD / P.W, sH = hD / P.H;
    const y = ctx.padYNear(x, z), rot = h2 * 6.2832;
    S.spec.push([pool + 'Trunk', x, y, z, rot, sW, sH, null]);
    // (a conifer drawn by the pin oak's pyramid: its crown darker and cooler, as a pine's needles read against the oaks)
    S.spec.push([pool + 'Crown', x, y, z, rot, sW, sH, con ? 0x8fa996 : 0xffffff]);
  }
  if (_on) claimSet(inst, S);
  if (S.ids) miss += S.ids.filter((id) => id < 0).length;
  _sets.add(S);
  // the tile's dispose() disposes every geometry in its group: this one's 'dispose' hands the claims back
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  const sentinel = new THREE.Mesh(sg, new THREE.MeshBasicMaterial());
  sentinel.visible = false; sentinel.name = 'cp32f:treeClaims';
  sentinel.geometry.addEventListener('dispose', () => {
    releaseSet(inst, S); _sets.delete(S);
    group.traverse((o) => { if (_meshes.has(o)) _meshes.delete(o); });
  });
  group.add(sentinel);
  CP32F_CLAIMS.tiles[ctx.key] = S.spec.length / 2;
  CP32F_CLAIMS.trees = Object.values(CP32F_CLAIMS.tiles).reduce((a, b) => a + b, 0);
  CP32F_CLAIMS.miss += miss; CP32F_CLAIMS.rock = (CP32F_CLAIMS.rock || 0) + rock;
  window.__CP32F_CLAIMS = CP32F_CLAIMS;
}
// in-page A/B (bshot --evalfile): __CP32F_SET(false) hands every tree claim of the part back and hides its lamps,
// benches and baskets; (true) restores them. __CP32F_AB(ms) samples the frame rate on, off, on again.
if (typeof window !== 'undefined') {
  window.__CP32F_SET = (on) => {
    on = !!on;
    if (on === _on) return _on;
    _on = on;
    for (const S of _sets) { if (on) claimSet(S.inst, S); else releaseSet(S.inst, S); }
    for (const m of _meshes) m.visible = on;
    return _on;
  };
  window.__CP32F_AB = async (ms = 3000) => {
    const wait = (t) => new Promise((r) => setTimeout(r, t));
    const fps = async () => { await wait(900); const a = window.__FRAMES(); await wait(ms); const b = window.__FRAMES(); return +(((b.frames - a.frames) * 1000) / (b.t - a.t)).toFixed(1); };
    const perf = async () => (window.__PERF ? window.__PERF() : null);
    const on1 = await fps(), p1 = await perf();
    window.__CP32F_SET(false);
    const off = await fps(), p0 = await perf();
    window.__CP32F_SET(true);
    const on2 = await fps();
    return { on: on1, off, on2, msOn: +(1000 / ((on1 + on2) / 2)).toFixed(2), msOff: +(1000 / off).toFixed(2), trisOn: p1 && p1.tris, trisOff: p0 && p0.tris, callsOn: p1 && p1.calls, callsOff: p0 && p0.calls, trees: CP32F_CLAIMS.trees, sets: _sets.size };
  };
}

// ---- lamps, benches, litter baskets, built per tile: one instanced mesh per kind (the lamp's iron, its glass, the bench,
// the basket), standing on the tile's ground (padYNear, which the lead's relief re-heights)
const STREET_CAL = [1.94, 1.70, 1.47];   // the street furniture's light trim (city/instancer.js baseMat)
const colorize = (g, hex) => {
  const c = new THREE.Color(hex), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
// a box by its centre (w along x, h up, d along z), tilted rx about x
const cbox = (w, h, d, hex, x, y, z, rx = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return colorize(g, hex);
};
const lathe = (pts, seg, hex) => colorize(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), hex);
const IRON = '#1b231f', GLASS = '#ece6d6', WOOD = '#7b6447', WOOD2 = '#6c563c', PLATE = '#a9aaa2', BASKET = '#243629';

// THE LAMPPOST: Henry Bacon's B pole (1907-10) under Kent Bloomer's luminaire (1980-83). The pole: a flaring base 17 in
// (0.43 m) across, "circumferential chains of seeds and leaves defining the segmented stages" (here the beaded rings at
// the base, the knee and the capital), a fluted shaft, ~11.5 ft (3.5 m) to the luminaire's collar. The luminaire: "an
// upside down glass urn cum lantern secured with metal ribs", a flange girdling it "like the cupped sepals of a calyx",
// an acorn finial (elizabethbarlowrogers.com, "Designing the Central Park Luminaire"). The numbered plate (the nearest
// cross street; odd west, even east) on the shaft.
let _lampGeo = null;
function lampGeos() {
  if (_lampGeo) return _lampGeo;
  const post = lathe([[0.001, 0], [0.215, 0], [0.215, 0.055], [0.19, 0.08], [0.2, 0.115], [0.15, 0.22], [0.108, 0.5],
    [0.12, 0.585], [0.12, 0.63], [0.08, 0.67], [0.078, 1.25], [0.093, 1.29], [0.074, 1.35], [0.064, 2.77], [0.1, 2.9],
    [0.1, 2.96], [0.062, 2.99]], 10, IRON);
  // five flutes on the shaft (between the knee ring and the capital): the radius swings 8 % round the post
  {
    const p = post.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if ((y > 0.69 && y < 1.23) || (y > 1.37 && y < 2.75)) {
        const x = p.getX(i), z = p.getZ(i), k = 1 + 0.08 * Math.cos(5 * Math.atan2(z, x));
        p.setX(i, x * k); p.setZ(i, z * k);
      }
    }
    post.computeVertexNormals();
  }
  const calyx = lathe([[0.06, 2.985], [0.17, 3.01], [0.2, 3.055], [0.12, 3.075]], 10, IRON);
  const cap = lathe([[0.19, 3.655], [0.2, 3.69], [0.12, 3.8], [0.048, 3.875], [0.058, 3.91], [0.045, 3.975], [0.001, 4.03]], 10, IRON);
  // the ribs: four iron straps over the glass, following its belly
  const ribs = [];
  const RIB = [[0.105, 3.07], [0.218, 3.33], [0.2, 3.59], [0.18, 3.66]];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.3;
    for (let j = 0; j + 1 < RIB.length; j++) {
      const [r0, y0] = RIB[j], [r1, y1] = RIB[j + 1], len = Math.hypot(r1 - r0, y1 - y0);
      const g = new THREE.BoxGeometry(0.018, len, 0.014);
      g.rotateZ(-Math.atan2(r1 - r0, y1 - y0));
      g.translate((r0 + r1) / 2 + 0.008, (y0 + y1) / 2, 0);
      g.rotateY(a);
      ribs.push(colorize(g, IRON));
    }
  }
  const plate = cbox(0.078, 0.05, 0.008, PLATE, 0, 1.12, 0.083);
  const iron = mergeGeometries([post, calyx, cap, ...ribs, plate], false);
  const glass = lathe([[0.001, 3.05], [0.1, 3.055], [0.2, 3.26], [0.218, 3.42], [0.19, 3.59], [0.172, 3.66], [0.001, 3.665]], 10, GLASS);
  // past LOD_R: a six-sided post, collar, cap and lantern (~90 triangles)
  const ironFar = lathe([[0.001, 0], [0.2, 0], [0.19, 0.12], [0.1, 0.55], [0.12, 0.62], [0.07, 0.7], [0.065, 2.8], [0.1, 2.93],
    [0.2, 3.05], [0.13, 3.075], [0.001, 3.08]], 6, IRON);
  const capFar = lathe([[0.19, 3.655], [0.2, 3.69], [0.05, 3.87], [0.001, 4.03]], 6, IRON);
  const ironF = mergeGeometries([ironFar, capFar], false);
  const glassF = lathe([[0.001, 3.05], [0.2, 3.26], [0.21, 3.45], [0.17, 3.66], [0.001, 3.665]], 6, GLASS);
  for (const g of [iron, glass, ironF, glassF]) { g.computeBoundingSphere(); g.computeBoundingBox(); }
  return (_lampGeo = { iron, glass, ironF, glassF });
}
// THE BENCH: the 1939 World's Fair settee, the park's standard: cast-iron ends and a middle standard, wooden slats, 8 ft
// (2.44 m): five seat slats, three back slats raked 15 deg, arms on the ends. The seat's top 0.45 m up, its front edge at
// local z +0.28 (a seated person faces +z).
let _benchGeo = null;
function benchGeo() {
  if (_benchGeo) return _benchGeo;
  const P = [];
  for (const x of [-1.16, 0, 1.16]) {
    P.push(cbox(0.05, 0.43, 0.05, IRON, x, 0.215, 0.235));              // front leg
    P.push(cbox(0.05, 0.92, 0.05, IRON, x, 0.46, -0.275, -0.14));       // rear leg rising into the back standard
    P.push(cbox(0.045, 0.05, 0.53, IRON, x, 0.385, 0.0));               // seat bracket
    if (x !== 0) {
      P.push(cbox(0.05, 0.035, 0.44, IRON, x, 0.645, 0.04));            // arm
      P.push(cbox(0.04, 0.2, 0.04, IRON, x, 0.53, 0.235));              // arm post
    }
  }
  for (let j = 0; j < 5; j++) P.push(cbox(2.44, 0.028, 0.072, j % 2 ? WOOD2 : WOOD, 0, 0.435, -0.15 + j * 0.092));
  for (let j = 0; j < 3; j++) P.push(cbox(2.44, 0.075, 0.026, j % 2 ? WOOD : WOOD2, 0, 0.57 + j * 0.11, -0.2 - j * 0.03, -0.26));
  const g = mergeGeometries(P, false);
  // past LOD_R: the seat and the back as two slabs on two end frames (60 triangles)
  const F = mergeGeometries([cbox(2.44, 0.03, 0.44, WOOD, 0, 0.435, 0.05), cbox(2.44, 0.3, 0.03, WOOD2, 0, 0.68, -0.23, -0.26),
    cbox(0.05, 0.43, 0.5, IRON, -1.16, 0.215, 0.0), cbox(0.05, 0.43, 0.5, IRON, 1.16, 0.215, 0.0), cbox(2.3, 0.05, 0.05, IRON, 0, 0.38, 0.23)], false);
  for (const q of [g, F]) { q.computeBoundingSphere(); q.computeBoundingBox(); }
  return (_benchGeo = { near: g, far: F });
}
// THE LITTER BASKET: the city's wire basket, dark green, ~0.8 m, tapered
let _basketGeo = null;
function basketGeo() {
  if (_basketGeo) return _basketGeo;
  const side = colorize(new THREE.CylinderGeometry(0.29, 0.235, 0.78, 9, 1, true).translate(0, 0.41, 0), BASKET);
  const rim = colorize(new THREE.TorusGeometry(0.29, 0.012, 3, 9).rotateX(Math.PI / 2).translate(0, 0.8, 0), BASKET);
  const foot = colorize(new THREE.CylinderGeometry(0.235, 0.22, 0.03, 9).translate(0, 0.015, 0), BASKET);
  for (const g of [side, rim, foot]) g.deleteAttribute('uv');
  for (const g of [side, rim, foot]) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  const g = mergeGeometries([side, rim, foot], false);
  g.computeBoundingSphere(); g.computeBoundingBox();
  return (_basketGeo = g);
}
let _mats = null;
function mats() {
  if (_mats) return _mats;
  const iron = applyLightTrim(applyCityAO(applySnowCap(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.08 }))), STREET_CAL);
  iron.side = THREE.DoubleSide;   // the basket is open-topped
  const glass = applyLightTrim(applyCityAO(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.0, emissive: 0xffd49a, emissiveIntensity: 0 })), STREET_CAL);
  return (_mats = { iron, glass });
}
// the baked lists binned by 512 m tile (world metres)
let _bins = null;
function bins() {
  if (_bins) return _bins;
  const B = new Map();
  const bin = (x, z) => { const k = `${Math.floor(x / 512)}_${Math.floor(z / 512)}`; let b = B.get(k); if (!b) B.set(k, (b = { lamps: [], benches: [], baskets: [] })); return b; };
  for (let i = 0; i < CP_LAMPS.length; i += 3) { const x = CP_LAMPS[i] / 10, z = CP_LAMPS[i + 1] / 10; bin(x, z).lamps.push([x, z, CP_LAMPS[i + 2]]); }
  for (let i = 0; i < CP_BENCHES.length; i += 4) { const x = CP_BENCHES[i] / 10, z = CP_BENCHES[i + 1] / 10; bin(x, z).benches.push([x, z, CP_BENCHES[i + 2] / 1000, CP_BENCHES[i + 3]]); }
  for (let i = 0; i < CP_BASKETS.length; i += 2) { const x = CP_BASKETS[i] / 10, z = CP_BASKETS[i + 1] / 10; bin(x, z).baskets.push([x, z]); }
  return (_bins = B);
}
const _seatByTile = new Map();
let _seatList = [];
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _Y = new THREE.Vector3(0, 1, 0);
// LOD: a tile's whole set switches to the light geometry while the camera is more than LOD_R from the set's box (read
// in the main pass: the choice holds for the next frame, and for the shadow passes, which do not call onBeforeRender)
const LOD_R = 140;
function instanced(geo, mat, list, name, cast, far = null, onDraw = null) {
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach(([x, y, z, yaw], i) => { _m4.compose(_p.set(x, y, z), _q.setFromAxisAngle(_Y, yaw), _one); m.setMatrixAt(i, _m4); });
  m.instanceMatrix.needsUpdate = true;
  m.computeBoundingSphere();
  m.castShadow = cast; m.receiveShadow = true; m.name = name;
  _meshes.add(m); m.visible = _on;
  if (far) {
    const bb = new THREE.Box3();
    for (const [x, y, z] of list) bb.expandByPoint(_p.set(x, y, z));
    bb.max.y += 4;
    m.onBeforeRender = (r, s, cam) => {
      if (onDraw) onDraw();
      if (!cam.isPerspectiveCamera) return;
      const want = bb.distanceToPoint(cam.position) > LOD_R ? far : geo;
      if (m.geometry !== want) m.geometry = want;
    };
  } else if (onDraw) m.onBeforeRender = onDraw;
  return m;
}
export function build(group, ctx) {
  if (!CP32F) return;
  if (DIRECT) claimTrees(group, ctx);
  const b = bins().get(`${Math.floor(ctx.ox / 512)}_${Math.floor(ctx.oz / 512)}`);
  if (!b) return;
  const gy = (x, z) => ctx.padYNear(x, z);
  const M = mats();
  if (b.lamps.length) {
    const L = b.lamps.filter(([x, z]) => !onRock(x, z)).map(([x, z]) => [x, gy(x, z), z, frac(Math.sin(x * 3.1 + z * 1.7) * 43758.5) * 6.2832]);
    const G = lampGeos();
    group.add(instanced(G.iron, M.iron, L, 'cp32f:lampIron', true, G.ironF));
    // the lantern glows once the city's lamps are on (world/cityLamps.js LAMPS_ON 0.06), full by night 0.3
    group.add(instanced(G.glass, M.glass, L, 'cp32f:lampGlass', false, G.glassF,
      () => { const n = ENV.night.value, t = Math.min(1, Math.max(0, (n - 0.06) / 0.24)); M.glass.emissiveIntensity = 2.6 * t * t * (3 - 2 * t); }));
    // the night light: a symmetric post top, warm 3000 K LED (world/night11.js FIXTURES[0]), the head 3.4 m up
    for (const [x, y, z] of L) lampSpots.push([x, y, z, 0, 3.4, null]);
  }
  if (b.benches.length) {
    const L = b.benches.filter(([x, z]) => !onRock(x, z)).map(([x, z, yaw]) => [x, gy(x, z), z, yaw]);
    const BG = benchGeo();
    group.add(instanced(BG.near, M.iron, L, 'cp32f:bench', true, BG.far));
    if (!_seatByTile.has(ctx.key)) {
      const S = [];
      for (const [x, y, z, yaw] of L) {
        const c = Math.cos(yaw), s = Math.sin(yaw);
        for (const j of [-0.78, 0, 0.78]) S.push({ x: +(x + j * c + 0.08 * s).toFixed(3), y: +y.toFixed(3), z: +(z - j * s + 0.08 * c).toFixed(3), yaw: +yaw.toFixed(4), seat: 0.45, kind: 'bench', group: -1 });
      }
      _seatByTile.set(ctx.key, S);
      _seatList = [..._seatByTile.values()].flat();
    }
  }
  if (b.baskets.length) {
    const L = b.baskets.filter(([x, z]) => !onRock(x, z)).map(([x, z]) => [x, gy(x, z), z, frac(Math.sin(x * 7.1 + z * 3.3) * 43758.5) * 6.2832]);
    group.add(instanced(basketGeo(), M.iron, L, 'cp32f:basket', true));
  }
}
// every bench place of the tiles built so far (sim/peds.js SW31 seats; the bryantPark.js bpSeats records)
export function seats() { return CP32F ? _seatList : []; }
