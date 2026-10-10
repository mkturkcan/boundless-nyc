// BUS40 / BUSES — the MTA New York City Transit buses of 125th Street for the traffic sim, built from scratch to published
// dimensions (sim/fleet24.js format: one GLB per kind, nodes LOD0..LOD2 under a root carrying size / hubs / wheelbase,
// materials in the runtime classes, per-vertex _WHEEL and _LAMP, KTX2 textures, meshopt geometry).
// node client/tools/ar34/vehicles/bus40/build_bus40.mjs [all|<kind>...] [--out <dir>]
// Frame: +Z forward, +Y up, origin at the ground centre, left side at +X (right / curb side at -X), metres.
// mtaxd40 New Flyer Xcelsior XD40 (diesel), the 2016+ MTA blue livery (deep blue body, yellow and light-blue swoosh
// behind the front door, blue speed lines over the rear arch)
// mtalfs Nova Bus LFS (diesel), the white MTA livery with the blue band under the windows and across the front
// mtaxd60 New Flyer Xcelsior XD60 articulated, Select Bus Service livery
// mtalfsa Nova Bus LFS Articulated, Select Bus Service livery
// mtalfsal Nova Bus LFS Articulated, the white local livery (the M101 / Bx15 / M125 artics of the 2019-2022 photographs)
// An articulated kind is two bodies: LOD<n> holds LOD<n>_front and LOD<n>_joint (the bellows, `_ARTIC` 0..1 from the front
// body's face to the rear body's), REAR_LOD<n> is the rear body; root extras `turntable` [0, y, z] (the rear body turns
// about its vertical axis) and `rearLength`. Rear axle hubs are ids 5 / 6.
// Dimensions (docs/notes/ar34-veh-bus40.md and ar34-veh-bus60.md "Sources"): XD40 41 ft over bumpers, 102 in wide,
// 10 ft 6 in high (diesel), wheelbase 283.75 in; LFS 40 ft, 102 in, 124 in high (diesel), wheelbase 244 in; XD60 60 ft
// 10 in, wheelbases 229 / 293 in; LFS Articulated 62 ft, wheelbases 244 / 253 in. Overhang split, window and door layout,
// lamp positions, the turntable and bellows: read off the reference photographs listed there (not survey data).
// Liveries, signs and plates are drawn here (SVG -> PNG -> KTX2);
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../../../../..');
const NM = path.join(ROOT, 'tools/assets/node_modules');
const { Document, NodeIO } = await import(NM + '/@gltf-transform/core/dist/index.js');
const { ALL_EXTENSIONS, KHRMaterialsClearcoat, KHRTextureBasisu, KHRMaterialsEmissiveStrength } = await import(NM + '/@gltf-transform/extensions/dist/index.js');
const { meshopt, prune, dedup } = await import(NM + '/@gltf-transform/functions/dist/index.js');
const { MeshoptEncoder } = await import(NM + '/meshoptimizer/index.module.js');
const sharp = (await import(NM + '/sharp/dist/index.mjs')).default;
const { makeTexture } = await import(path.join(ROOT, 'tools/assets/lib/tex.mjs'));

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const OUT = opt('out', path.join(ROOT, 'client/public/models/fleet24'));
const WORK = path.join(HERE, 'work');
fs.mkdirSync(WORK, { recursive: true });

// lamp roles (sim/fleet24.js ROLE)
const ROLE = { head: 1, fbl: 2, fbr: 3, tail: 4, rbl: 5, rbr: 6, rev: 7 };

// ---------------------------------------------------------------- the two makes
const TYRE = { R: 0.5, w: 0.305, rim: 0.286 };   // 305/70R22.5: 571.5 mm rim + 2 x 213.5 mm sidewall
const MAKES = {
  mtaxd40: {
    title: 'New Flyer Xcelsior XD40', L: 12.50, W: 2.59, H: 3.20, wb: 7.21, bumpF: 0.13, bumpR: 0.10, fo: 2.30,
    y0: 0.27, y1: 2.97, belt: 1.13, wtop: 2.40, rx: 0.16, ryT: 0.26, ryB: 0.05, rzF: 0.17, rzR: 0.14,
    ws: { x: 1.12, y0: 1.24, y1: 2.57 }, sign: { x: 1.02, y0: 2.62, y1: 2.88 }, rearSign: { x: 0.42, y0: 2.55, y1: 2.75 },
    livery: 'new', fleetNo: '7738', route: 0, front: 'xd40',
    hvac: { zr: 0.30, len: 2.85, w: 1.96, h: 0.22 }, ra: 0.6,
  },
  mtalfs: {
    title: 'Nova Bus LFS', L: 12.19, W: 2.59, H: 3.15, wb: 6.20, bumpF: 0.14, bumpR: 0.10, fo: 2.40,
    y0: 0.27, y1: 2.93, belt: 1.11, wtop: 2.36, rx: 0.22, ryT: 0.32, ryB: 0.05, rzF: 0.27, rzR: 0.2,
    ws: { x: 1.04, y0: 1.1, y1: 2.53 }, sign: { x: 0.96, y0: 2.58, y1: 2.83 }, rearSign: { x: 0.40, y0: 2.50, y1: 2.70 },
    livery: 'old', fleetNo: '5975', route: 0, front: 'lfs',
    hvac: { zr: 0.25, len: 2.5, w: 1.9, h: 0.24 }, ra: 0.6,
  },
  // the 60-ft articulated Xcelsior: the XD40's front and rear ends, the two bodies joined by a turntable under bellows.
  // L, W, H and both wheelbases: New Flyer Xcelsior infobox (docs/notes/ar34-veh-bus60.md "Sources"): 60 ft 10 in over
  // bumpers, 102 in, 10 ft 6 in (diesel), wheelbase front 229 in / rear 293 in. Turntable 1.65 m behind the middle axle
  // and 1.10 m bellows: estimated from the side photographs (not from a drawing)
  mtaxd60: {
    title: 'New Flyer Xcelsior XD60', L: 18.54, W: 2.59, H: 3.20, wb: 5.82, wbR: 7.44, bumpF: 0.13, bumpR: 0.10, fo: 2.30,
    y0: 0.27, y1: 2.97, belt: 1.13, wtop: 2.40, rx: 0.16, ryT: 0.26, ryB: 0.05, rzF: 0.17, rzR: 0.14,
    ws: { x: 1.12, y0: 1.24, y1: 2.57 }, sign: { x: 1.02, y0: 2.62, y1: 2.88 }, rearSign: { x: 0.42, y0: 2.55, y1: 2.75 },
    livery: 'sbs', fleetNo: '6158', route: 0, front: 'xd40', routes: 'sbs',
    hvac: { zr: 0.30, len: 2.85, w: 1.96, h: 0.22 }, ra: 0.6,
    art: { pivotBack: 1.65, bellows: 1.10 },
  },
  // the Nova Bus LFS Articulated in the SBS livery: the M60 SBS photographed on 125th Street. Nova Bus LFS infobox (en.wikipedia.org, fetched
  // 2026-10-01): 62 ft (18.90 m), 102 in, 124 in high (diesel; 128 in hybrid), wheelbase front-mid 244 in, mid-rear 253 in.
  // The LFS front and rear ends of mtalfs; turntable and bellows estimated as on the XD60 (not from a drawing)
  mtalfsa: {
    title: 'Nova Bus LFS Articulated', L: 18.90, W: 2.59, H: 3.15, wb: 6.20, wbR: 6.43, bumpF: 0.14, bumpR: 0.10, fo: 2.40,
    y0: 0.27, y1: 2.93, belt: 1.11, wtop: 2.36, rx: 0.22, ryT: 0.32, ryB: 0.05, rzF: 0.27, rzR: 0.2,
    ws: { x: 1.04, y0: 1.1, y1: 2.53 }, sign: { x: 0.96, y0: 2.58, y1: 2.83 }, rearSign: { x: 0.40, y0: 2.50, y1: 2.70 },
    livery: 'sbs', fleetNo: '5536', route: 0, front: 'lfs', routes: 'sbs',
    hvac: { zr: 0.25, len: 2.5, w: 1.9, h: 0.24 }, ra: 0.6,
    art: { pivotBack: 1.55, bellows: 1.10 },
  },
  // the same Nova LFS Articulated in the white local livery with the blue band: the M101 and the Bx15 / M125 on 125th
  // Street in the Commons photographs of 2019-2022 (1207 Bx15 LIMITED at 125 St / Park Av; 5821 and 5979 on the M101 at Lex
  // Av / E 92 St), local route signs
  mtalfsal: {
    title: 'Nova Bus LFS Articulated', L: 18.90, W: 2.59, H: 3.15, wb: 6.20, wbR: 6.43, bumpF: 0.14, bumpR: 0.10, fo: 2.40,
    y0: 0.27, y1: 2.93, belt: 1.11, wtop: 2.36, rx: 0.22, ryT: 0.32, ryB: 0.05, rzF: 0.27, rzR: 0.2,
    ws: { x: 1.04, y0: 1.1, y1: 2.53 }, sign: { x: 0.96, y0: 2.58, y1: 2.83 }, rearSign: { x: 0.40, y0: 2.50, y1: 2.70 },
    livery: 'old', fleetNo: '5893', route: 0, front: 'lfs',
    hvac: { zr: 0.25, len: 2.5, w: 1.9, h: 0.24 }, ra: 0.6,
    art: { pivotBack: 1.55, bellows: 1.10 },
  },
};
// LED destination signs: the routes on 125th Street with their headsigns as the MTA's GTFS feeds carry them (2026-08-24,
// docs/notes/ar34-veh-bus40.md "Routes"); one page of the sign atlas per route and direction. The M60 SBS (route M60+,
// "M60-SBS"): trip_headsign "SELECT BUS LA GUARDIA AIRPORT" (direction 0) and "SELECT BUS WEST SIDE BROADWAY-106 ST" (1)
const ROUTES_SBS = [
  { num: 'M60', dest: '+SELECT BUS', via: 'LA GUARDIA AIRPORT', side: 'LA GUARDIA AIRPORT' },
  { num: 'M60', dest: '+SELECT BUS', via: 'W SIDE BWAY-106 ST', side: 'BROADWAY-106 ST' },
  { num: 'M60', dest: 'LA GUARDIA AIRPORT', via: 'via 125 ST', side: 'LA GUARDIA AIRPORT' },
  { num: 'M60', dest: 'WEST SIDE', via: 'BROADWAY-106 ST', side: 'BROADWAY-106 ST' },
  // the SBS-livery artics also run the locals on 125th (XD60 6221 on the M125 at a 125th St stop, Commons photo of
  // 2026-05-14): the M125 and M101 pages too
  { num: 'M125', dest: 'THE HUB 3 AV/149 ST', via: 'via 125 ST', side: 'THE HUB 149 ST' },
  { num: 'M125', dest: 'MANHATTANVILLE 12 AV', via: 'via 125 ST', side: 'MANHATTANVILLE' },
  { num: 'M101', dest: 'LTD FT GEORGE', via: 'via AMSTERDAM AV', side: 'LTD FT GEORGE' },
  { num: 'M101', dest: 'LIMITED EAST VILLAGE', via: '3 AV-6 ST via LEX', side: 'LTD EAST VILLAGE' },
];
const routesOf = (kind) => (MAKES[kind].routes === 'sbs' ? ROUTES_SBS : ROUTES);
const ROUTES = [
  { num: 'M101', dest: 'LTD FT GEORGE', via: 'via AMSTERDAM AV', side: 'LTD FT GEORGE' },
  { num: 'M101', dest: 'LIMITED EAST VILLAGE', via: '3 AV-6 ST via LEX', side: 'LTD EAST VILLAGE' },
  { num: 'M125', dest: 'THE HUB 3 AV/149 ST', via: 'via 125 ST', side: 'THE HUB 149 ST' },
  { num: 'M125', dest: 'MANHATTANVILLE 12 AV', via: 'via 125 ST', side: 'MANHATTANVILLE' },
  { num: 'M100', dest: 'INWOOD 220 ST', via: 'via AMSTERDAM', side: 'INWOOD 220 ST' },
  { num: 'M100', dest: 'MANHTTNVILLE W 125', via: 'via BWAY via AMSTRDM', side: 'MANHTTNVILLE' },
  { num: 'M101', dest: 'FT GEORGE', via: 'via 3 AV via AMSTERDAM AV', side: 'FT GEORGE' },
  { num: 'M101', dest: 'EAST VILLAGE 3 AV-6 ST', via: 'via LEX AV', side: 'EAST VILLAGE' },
];

function derive(m) {
  const d = { ...m };
  d.hx = m.W / 2;
  d.zf = m.L / 2 - m.bumpF;            // body front face
  d.zr = -m.L / 2 + m.bumpR;           // body rear face
  d.zFA = d.zf - m.fo;                 // front axle
  d.yA = 0.495;                        // axle height (loaded radius ~ 0.5 m)
  // window spans (z ranges) per side, front to rear; pillars between
  const winRow = (z1, z0, n, gap = 0.09) => {
    const out = [], w = (z1 - z0 - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) out.push([z1 - i * (w + gap) - w, z1 - i * (w + gap)]);
    return out;
  };
  const zEngine = d.zr + (m.front === 'xd40' ? 1.05 : 1.20);   // the rear engine bay has no side glass
  // curb side (-X) doors: the front door ahead of the front arch, the others ahead of their axle's arch
  d.doorF = [d.zFA + m.ra + 0.08, d.zFA + m.ra + 1.20];
  if (!m.art) {
    d.zRA = d.zFA - m.wb;                // rear axle
    d.doorR = [d.zRA + m.ra + 0.12, d.zRA + m.ra + 1.10];
    d.winL = [[d.zf - 1.45, d.zf - 0.30], ...winRow(d.zf - 1.55, zEngine, 6)];
    d.winR = [...winRow(d.doorF[0] - 0.10, d.doorR[1] + 0.10, 4), ...winRow(d.doorR[0] - 0.10, zEngine, 2)];
    d.secs = [{ name: 'body', zf: d.zf, zr: d.zr, rzF: m.rzF, rzR: m.rzR, front: true, rear: true,
      axles: [{ z: d.zFA, dual: false, ids: [1, 2] }, { z: d.zRA, dual: true, ids: [3, 4] }], doors: [d.doorF, d.doorR] }];
  } else {
    // articulated: the middle (dual) axle under the front body, the turntable behind it, the rear body's dual axle
    d.zMA = d.zFA - m.wb;
    d.zRA = d.zMA - m.wbR;
    d.pivotZ = d.zMA - m.art.pivotBack;
    d.zJF = d.pivotZ + m.art.bellows / 2;   // the front body's rear face
    d.zJR = d.pivotZ - m.art.bellows / 2;   // the rear body's front face
    // three doors (curb side), as on the photographed SBS XD60s: front, ahead of the middle axle, ahead of the rear axle
    d.doorM = [d.zMA + m.ra + 0.15, d.zMA + m.ra + 1.27];
    d.doorR = [d.zRA + m.ra + 0.20, d.zRA + m.ra + 1.32];
    d.winL = [[d.zf - 1.45, d.zf - 0.30], ...winRow(d.zf - 1.55, d.zJF + 0.16, 5), ...winRow(d.zJR - 0.16, zEngine, 5)];
    d.winR = [...winRow(d.doorF[0] - 0.10, d.doorM[1] + 0.10, 3), ...winRow(d.doorM[0] - 0.10, d.zJF + 0.16, 1),
      ...winRow(d.zJR - 0.16, d.doorR[1] + 0.10, 2), ...winRow(d.doorR[0] - 0.10, zEngine, 2)];
    d.secs = [
      { name: 'front', zf: d.zf, zr: d.zJF, rzF: m.rzF, rzR: 0.05, front: true, rear: false,
        axles: [{ z: d.zFA, dual: false, ids: [1, 2] }, { z: d.zMA, dual: true, ids: [3, 4] }], doors: [d.doorF, d.doorM] },
      { name: 'rear', zf: d.zJR, zr: d.zr, rzF: 0.05, rzR: m.rzR, front: false, rear: true,
        axles: [{ z: d.zRA, dual: true, ids: [5, 6] }], doors: [d.doorR] },
    ];
  }
  d.sideSign = [d.doorF[0] - 0.12 - 1.05, d.doorF[0] - 0.12];
  return d;
}
// one body of the vehicle (a rigid bus has one; the articulated bus two): the derived record with that body's faces,
// axles, doors and windows; gzf / gzr keep the whole bus's ends for the livery mapping
function sectionD(D, si) {
  const s = D.secs[si];
  const inSec = (w) => w[1] <= s.zf + 1e-6 && w[0] >= s.zr - 1e-6;
  return { ...D, sec: s, zf: s.zf, zr: s.zr, rzF: s.rzF, rzR: s.rzR, front: s.front, rear: s.rear, axles: s.axles, doors: s.doors,
    winL: D.winL.filter(inSec), winR: D.winR.filter(inSec), arches: s.axles.map((a) => a.z), gzf: D.zf, gzr: D.zr };
}

// ---------------------------------------------------------------- geometry accumulation
class Lod {
  constructor(name) { this.name = name; this.b = new Map(); }
  bucket(mat) {
    if (!this.b.has(mat)) this.b.set(mat, { mat, pos: [], nrm: [], uv: [], idx: [], wheel: [], lamp: [], artic: [] });
    return this.b.get(mat);
  }
  // geo: THREE.BufferGeometry in the vehicle frame; uv: fn(p, n) -> [u, v] | [u, v] | 'own' (+ rect)
  add(mat, geo, { uv = [0.5, 0.5], rect = null, wheel = 0, lamp = 0, artic = 0 } = {}) {
    const b = this.bucket(mat);
    const P = geo.attributes.position, N = geo.attributes.normal || (geo.computeVertexNormals(), geo.attributes.normal), U = geo.attributes.uv;
    const base = b.pos.length / 3;
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i);
      b.pos.push(p.x, p.y, p.z); b.nrm.push(n.x, n.y, n.z);
      let t;
      if (typeof uv === 'function') t = uv(p, n, i);
      else if (uv === 'own') { const u = U ? U.getX(i) : 0, v = U ? 1 - U.getY(i) : 0; t = rect ? [rect[0] + u * (rect[2] - rect[0]), rect[1] + v * (rect[3] - rect[1])] : [u, v]; }
      else t = uv;
      b.uv.push(t[0], t[1]);
      b.wheel.push(typeof wheel === 'function' ? wheel(p) : wheel);
      b.lamp.push(typeof lamp === 'function' ? lamp(p) : lamp);
      b.artic.push(typeof artic === 'function' ? artic(p) : artic);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) b.idx.push(base + geo.index.getX(i));
    else for (let i = 0; i < P.count; i++) b.idx.push(base + i);
  }
  tris() { let n = 0; for (const b of this.b.values()) n += b.idx.length / 3; return n; }
}

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
function place(geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], order = 'XYZ' } = {}) {
  E.set(r[0], r[1], r[2], order); Q.setFromEuler(E);
  M4.compose(new THREE.Vector3(...p), Q, new THREE.Vector3(...s));
  geo.applyMatrix4(M4);
  return geo;
}
const box = (w, h, d, p, r, seg = [1, 1, 1]) => place(new THREE.BoxGeometry(w, h, d, ...seg), { p, r });
const cyl = (rt, rb, h, seg, p, r, open = false) => place(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), { p, r });
// a box with rounded edges (three's RoundedBox is uniform; this one is the same ellipsoid-corner mapping as the body)
// the same with per-axis radii [rx, ry, rz] (a bumper that wraps the body's plan corners)
function rbox3(w, h, d, rad, seg, p, r) {
  const g = new THREE.BoxGeometry(w, h, d, seg[0], seg[1], seg[2]);
  const P = g.attributes.position, N = g.attributes.normal;
  const hx = w / 2 - rad[0], hy = h / 2 - rad[1], hz = d / 2 - rad[2];
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const cx = Math.max(-hx, Math.min(hx, x)), cy = Math.max(-hy, Math.min(hy, y)), cz = Math.max(-hz, Math.min(hz, z));
    let qx = (x - cx) / rad[0], qy = (y - cy) / rad[1], qz = (z - cz) / rad[2];
    const l = Math.hypot(qx, qy, qz) || 1;
    qx /= l; qy /= l; qz /= l;
    P.setXYZ(i, cx + qx * rad[0], cy + qy * rad[1], cz + qz * rad[2]);
    const n = new THREE.Vector3(qx / rad[0], qy / rad[1], qz / rad[2]).normalize();
    N.setXYZ(i, n.x, n.y, n.z);
  }
  return place(g, { p, r });
}
function rbox(w, h, d, rad, seg, p, r) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const P = g.attributes.position, hx = w / 2 - rad, hy = h / 2 - rad, hz = d / 2 - rad;
  const N = g.attributes.normal;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const cx = Math.max(-hx, Math.min(hx, x)), cy = Math.max(-hy, Math.min(hy, y)), cz = Math.max(-hz, Math.min(hz, z));
    let dx = x - cx, dy = y - cy, dz = z - cz; const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    P.setXYZ(i, cx + dx * rad, cy + dy * rad, cz + dz * rad); N.setXYZ(i, dx, dy, dz);
  }
  return place(g, { p, r });
}

// ---------------------------------------------------------------- body skin
// The body is a box with ellipsoidal edge rounding (per-axis radii: roof edges, front / rear corners, the skirt), each
// face a grid whose lines include every window, door and sign edge, so openings are exact rectangles; wheel arches are
// cut from the side grids and their edge vertices snapped onto the arch circle.
function axisStops(a, b, fixed, step, round0, round1, nr = 7) {
  const s = new Set([a, b]);
  for (let k = 1; k < nr; k++) { s.add(a + (round0 * k) / nr); s.add(b - (round1 * k) / nr); }
  s.add(a + round0); s.add(b - round1);
  for (const f of fixed) if (f > a && f < b) s.add(f);
  const arr = [...s].sort((x, y) => x - y);
  const out = [arr[0]];
  for (let i = 1; i < arr.length; i++) {
    const a0 = out[out.length - 1], g = arr[i] - a0;
    if (g < 0.004) continue;
    const n = Math.ceil(g / step - 1e-9);
    for (let k = 1; k < n; k++) out.push(a0 + (g * k) / n);
    out.push(arr[i]);
  }
  out[out.length - 1] = b;
  return out;
}

function makeSkin(D, q) {
  const { hx, zf, zr, y0, y1, rx, ryT, ryB, rzF, rzR } = D;
  const inner = { x0: -hx + rx, x1: hx - rx, y0: y0 + ryB, y1: y1 - ryT, z0: zr + rzR, z1: zf - rzF };
  const round = (x, y, z) => {
    const cx = Math.max(inner.x0, Math.min(inner.x1, x)), cy = Math.max(inner.y0, Math.min(inner.y1, y)), cz = Math.max(inner.z0, Math.min(inner.z1, z));
    const Rx = rx, Ry = y > cy ? ryT : ryB, Rz = z > cz ? rzF : rzR;
    let qx = (x - cx) / Rx, qy = (y - cy) / Ry, qz = (z - cz) / Rz;
    const l = Math.hypot(qx, qy, qz);
    if (l < 1e-9) return { p: [x, y, z], n: null };
    qx /= l; qy /= l; qz /= l;
    const n = new THREE.Vector3(qx / Rx, qy / Ry, qz / Rz).normalize();
    return { p: [cx + qx * Rx, cy + qy * Ry, cz + qz * Rz], n: [n.x, n.y, n.z] };
  };
  // (an articulated bus's two bodies share the 10-25k LOD1 budget: a coarser LOD1 / LOD2 skin)
  const step = (D.art ? [0.12, 0.5, 1.4] : [0.12, 0.3, 0.9])[q];
  const nr = [8, 4, 2][q];
  // fixed lines
  const zLines = [...D.arches.flatMap((za) => [za - D.ra, za + D.ra]), ...D.doors.flat()];
  for (const w of [...D.winL, ...D.winR]) zLines.push(w[0], w[1]);
  const yLines = [D.belt, D.wtop, D.ws.y0, D.ws.y1, D.sign.y0, D.sign.y1, D.rearSign.y0, D.rearSign.y1, D.yA, D.yA + D.ra, 2.42, D.y0 + 0.06];
  // fine lines through the arches so the snapped arch edge is smooth (LOD0 5 cm, LOD1 12 cm)
  const fine = (D.art ? [0.05, 0.2, 0] : [0.05, 0.12, 0])[q];
  if (fine) for (const za of D.arches) for (let k = -Math.ceil(D.ra / fine); k <= Math.ceil(D.ra / fine); k++) zLines.push(za + k * fine);
  if (fine) for (let y = D.y0 + fine; y < D.yA + D.ra; y += fine) yLines.push(y);
  if (q === 2) { zLines.length = 2 * D.arches.length; yLines.length = 0; yLines.push(D.yA, D.yA + D.ra); }
  const xLines = [-D.ws.x, D.ws.x, -D.sign.x, D.sign.x, -D.rearSign.x, D.rearSign.x];
  const Z = axisStops(zr, zf, zLines, step, rzR, rzF, nr);
  const Y = axisStops(y0, y1, yLines, step, ryB, ryT, nr);
  const X = axisStops(-hx, hx, xLines, step, rx, rx, nr);
  // arch fine stops
  const arches = D.arches;
  const inArch = (z, y) => arches.some((za) => ((z - za) ** 2 + (y - D.yA) ** 2 < D.ra * D.ra) || (y <= D.yA && Math.abs(z - za) < D.ra));
  // the same, a millimetre inside the edge (a corner on the circle counts as outside)
  const inArchIn = (z, y) => arches.some((za) => ((z - za) ** 2 + (y - D.yA) ** 2 < (D.ra - 0.001) ** 2) || (y <= D.yA && Math.abs(z - za) < D.ra - 0.001));
  const snapArch = (z, y) => {
    for (const za of arches) {
      const dz = z - za, dy = y - D.yA, r = Math.hypot(dz, dy);
      if (y > D.yA && r < D.ra) return [za + (dz / r) * D.ra, D.yA + (dy / r) * D.ra];
      if (y <= D.yA && Math.abs(dz) < D.ra) return [za + Math.sign(dz || 1) * D.ra, y];
    }
    return [z, y];
  };
  const faces = [];
  // side faces: grid over (z, y); left (+X) and right (-X)
  for (const side of [1, -1]) {
    const wins = side > 0 ? D.winL : D.winR;
    const open = (z, y) => {
      if (y > D.belt && y < D.wtop && wins.some((w) => z > w[0] && z < w[1])) return 'win';
      if (side < 0 && y < 2.42 && y > D.y0 + 0.06 && D.doors.some((d) => z > d[0] && z < d[1])) return 'door';
      if (inArch(z, y)) return 'arch';
      return null;
    };
    faces.push({ kind: side > 0 ? 'L' : 'R', U: Z, V: Y, pt: (u, v) => [side * hx, v, u], open: q < 2 ? open : (z, y) => (inArch(z, y) ? 'arch' : null), snap: true, flip: side > 0 });
  }
  faces.push({ kind: 'T', U: X, V: Z, pt: (u, v) => [u, y1, v], open: () => null, flip: true });
  faces.push({ kind: 'B', U: X, V: Z, pt: (u, v) => [u, y0, v], open: () => null, flip: true, skipInner: true });
  faces.push({ kind: 'F', U: X, V: Y, pt: (u, v) => [u, v, zf], open: q === 2 || !D.front ? () => null : (x, y) => ((Math.abs(x) < D.ws.x && y > D.ws.y0 && y < D.ws.y1) ? 'ws' : (Math.abs(x) < D.sign.x && y > D.sign.y0 && y < D.sign.y1) ? 'sign' : null), flip: false });
  faces.push({ kind: 'K', U: X, V: Y, pt: (u, v) => [u, v, zr], open: q === 2 || !D.rear ? () => null : (x, y) => ((Math.abs(x) < D.rearSign.x && y > D.rearSign.y0 && y < D.rearSign.y1) ? 'rsign' : null), flip: true });
  const tris = [];   // { a, b, c } points + normals, face kind
  for (const F of faces) {
    if (F.kind === 'B') continue;   // underside: a separate dark pan
    const nu = F.U.length, nv = F.V.length;
    const grid = [];
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      let [x, y, z] = F.pt(F.U[i], F.V[j]);
      grid.push([x, y, z]);
    }
    const cellOpen = [];
    for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
      const uc = (F.U[i] + F.U[i + 1]) / 2, vc = (F.V[j] + F.V[j + 1]) / 2;
      let o = F.open(uc, vc);
      // a cell the arch circle only cuts stays (its inside corners snap onto the circle below); only cells wholly inside
      // the arch open, so the arch edge follows the circle instead of the grid's stair steps (round 1's notched arches)
      if (o === 'arch' && F.snap && q < 2) {   // (LOD2's grid has no lines through the arch: its cells must open by centre)
        const cs = [[F.U[i], F.V[j]], [F.U[i + 1], F.V[j]], [F.U[i], F.V[j + 1]], [F.U[i + 1], F.V[j + 1]]];
        if (cs.some(([z, y]) => !inArchIn(z, y))) o = null;
      }
      cellOpen.push(o);
    }
    // snap arch-adjacent vertices (side faces): a vertex used by any kept cell and lying inside the arch moves onto it
    if (F.snap) {
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const g = grid[j * nu + i];
        if (!inArch(g[2], g[1])) continue;
        let used = false;
        for (const [di, dj] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
          const ci = i + di, cj = j + dj;
          if (ci < 0 || cj < 0 || ci >= nu - 1 || cj >= nv - 1) continue;
          if (cellOpen[cj * (nu - 1) + ci] !== 'arch') used = true;
        }
        if (used) { const [z, y] = snapArch(g[2], g[1]); g[2] = z; g[1] = y; }
      }
    }
    const R = grid.map((g) => round(g[0], g[1], g[2]));
    for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
      if (cellOpen[j * (nu - 1) + i]) continue;
      const a = j * nu + i, b = a + 1, c = a + nu, d = c + 1;
      const quad = F.flip ? [[a, c, b], [b, c, d]] : [[a, b, c], [b, d, c]];
      for (const t of quad) tris.push({ F: F.kind, v: t.map((k) => R[k]) });
    }
  }
  return { tris, round, inner };
}

// ---------------------------------------------------------------- livery atlas mapping (2048 x 2048)
// rows: left side 0-640 (front at the image left), right side 640-1280 (front at the image right), front 1280-1920
// (x 0-1024, the bus's left at the image right), rear 1280-1920 (x 1024-2048), roof 1920-2048
const HB = 3.3;
function liveryUV(D) {
  const Ls = D.zf - D.zr;
  return {
    L: (x, y, z) => [(D.zf - z) / Ls, (1 - y / HB) * 0.3125],
    R: (x, y, z) => [(z - D.zr) / Ls, 0.3125 + (1 - y / HB) * 0.3125],
    J: () => [0.25, 1905 / 2048],   // a body's face at the articulation (behind the bellows): the black strip under the front face
    F: (x, y, z) => [((x + D.hx) / D.W) * 0.5, 0.625 + (1 - y / HB) * 0.3125],
    K: (x, y, z) => [0.5 + ((D.hx - x) / D.W) * 0.5, 0.625 + (1 - y / HB) * 0.3125],
    T: (x, y, z) => [(D.zf - z) / Ls, 0.9375 + ((x + D.hx) / D.W) * 0.0625],
  };
}

// ---------------------------------------------------------------- detail atlas (1024 x 1024) swatches
// each swatch: [u0, v0, u1, v1] in UV (v down); solid swatches are 64 px cells in the first rows
const SW = {};
const SOLID = {
  black: '#0d0e10', rubber: '#141414', tyre: '#1b1b1c', trim: '#1a1c1f', grey: '#5c6066', seat: '#3a3d42', seatDark: '#26282c',
  floor: '#24262a', wall: '#8e9296', ceiling: '#a3a6a9', yellow: '#f2c200', chrome: '#c9ccd0', alu: '#b4b8bd', steel: '#8d9196',
  red: '#b3121b', white: '#eeeeea', amber: '#f59a12', dash: '#202226', wiper: '#101112', underbody: '#0b0b0c', mirror: '#9fb3c4',
  bumper: '#16171a', grille: '#0e0f11', bellows: '#4a4743',
};
{
  let k = 0;
  for (const [name] of Object.entries(SOLID)) { const cx = k % 16, cy = Math.floor(k / 16); SW[name] = [(cx * 64 + 16) / 1024, (cy * 64 + 16) / 1024, (cx * 64 + 48) / 1024, (cy * 64 + 48) / 1024]; k++; }
}
SW.stripes = [0 / 1024, 256 / 1024, 256 / 1024, 512 / 1024];      // red / white diagonal mirror stripes
SW.plateNY = [256 / 1024, 256 / 1024, 512 / 1024, 384 / 1024];    // NY plate 12 x 6 in
SW.floorTex = [512 / 1024, 256 / 1024, 1024 / 1024, 512 / 1024];  // floor with the yellow edge line
SW.grilleTex = [0, 512 / 1024, 512 / 1024, 768 / 1024];            // louvre slats
SW.seatTex = [512 / 1024, 512 / 1024, 768 / 1024, 768 / 1024];    // seat shell with the cushion
const C = (n) => [(SW[n][0] + SW[n][2]) / 2, (SW[n][1] + SW[n][3]) / 2];

// ---------------------------------------------------------------- glow atlas (1024 x 1024): LED signs and lights
// rows of 128 px: 0-3 front signs (one per route), 4 side signs (two routes per row), 5 rear route numbers, 6 lights
const PAGE = 256 / 2048;   // v height of one route page
const GL = {
  front: (r) => [0, r * PAGE, 1, r * PAGE + 128 / 2048],
  side: (r) => [0, r * PAGE + 128 / 2048, 0.5, r * PAGE + 192 / 2048],
  rear: (r) => [0.5, r * PAGE + 128 / 2048, 0.75, r * PAGE + 192 / 2048],
  strip: [0.02, 200 / 2048, 0.48, 216 / 2048],
  amber: [0.55, 200 / 2048, 0.65, 216 / 2048],
  dark: [0.75, 200 / 2048, 0.85, 216 / 2048],
};
const GC = (r) => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];

// planar uv into a rect: s = 0..1 across, t = 0..1 down
const rectUV = (rect, s, t) => [rect[0] + Math.max(0, Math.min(1, s)) * (rect[2] - rect[0]), rect[1] + Math.max(0, Math.min(1, t)) * (rect[3] - rect[1])];

// ---------------------------------------------------------------- parts
function wheelGeo(q, rear, outer) {
  const seg = [72, 20, 10][q];
  // tyre profile (r, axial), outside face at +axial
  const R = TYRE.R, w = TYRE.w / 2, rr = TYRE.rim + 0.004;
  const prof = [];
  const sh = 0.035;   // shoulder rounding
  prof.push([rr, -w + 0.02], [rr + 0.02, -w - 0.002], [rr + 0.08, -w - 0.006], [R - 0.11, -w - 0.004], [R - 0.06, -w + 0.004], [R - sh * 0.4, -w + sh * 0.35], [R - 0.004, -w + sh]);
  if (q === 0) {
    // four circumferential grooves across the tread
    const gx = [-0.09, -0.03, 0.03, 0.09];
    let x = -w + sh;
    for (const g of gx) { prof.push([R - 0.002, g - 0.009], [R - 0.016, g - 0.007], [R - 0.016, g + 0.007], [R - 0.002, g + 0.009]); x = g; }
  }
  prof.push([R - 0.004, w - sh], [R - sh * 0.4, w - sh * 0.35], [R - 0.06, w - 0.004], [R - 0.11, w + 0.004], [rr + 0.08, w + 0.006], [rr + 0.02, w + 0.002], [rr, w - 0.02]);
  const tyre = new THREE.LatheGeometry(prof.map(([r, a]) => new THREE.Vector2(r, a)), seg);
  tyre.rotateZ(-Math.PI / 2);   // lathe axis Y -> X (axial +Y -> +X)
  // rim: outer face at +axial; the outer rear dual's disc sits deep (its hub stands proud)
  const dish = rear && outer ? -0.11 : rear ? 0.05 : -0.02;
  const rp = [
    [rr - 0.004, -w + 0.01], [rr - 0.012, -w + 0.012], [rr - 0.016, w - 0.03], [rr + 0.012, w - 0.012], [rr + 0.014, w + 0.004], [rr - 0.01, w + 0.006],
    [rr - 0.03, w - 0.03], [0.205, dish + 0.02], [0.17, dish + 0.025], [0.11, dish + 0.03], [0.105, dish + 0.06], [0.085, dish + 0.075],
    [0.06, dish + 0.11 + (rear && outer ? 0.07 : 0)], [0.035, dish + 0.12 + (rear && outer ? 0.07 : 0)], [0.0, dish + 0.122 + (rear && outer ? 0.07 : 0)],
  ];
  const rim = new THREE.LatheGeometry(rp.map(([r, a]) => new THREE.Vector2(r, a)), seg);
  rim.rotateZ(-Math.PI / 2);
  // ten lug nuts on the 285.75 mm bolt circle, ten hand holes between
  const nuts = [], holes = [];
  if (q < 2) for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    nuts.push(place(new THREE.CylinderGeometry(0.014, 0.016, 0.04, q === 0 ? 6 : 4), { p: [dish + 0.045, Math.cos(a) * 0.143, Math.sin(a) * 0.143], r: [0, 0, Math.PI / 2] }));
    const b = a + Math.PI / 10;
    if (q === 0) holes.push(place(new THREE.CircleGeometry(0.028, 12), { p: [dish + 0.0305, Math.cos(b) * 0.2, Math.sin(b) * 0.2], r: [0, Math.PI / 2, 0] }));
  }
  return { tyre, rim, nuts, holes };
}

// the articulation bellows: a pleated tube of rubberised fabric between the two bodies' faces, a rounded-rectangle
// section open underneath (over the turntable plate), the fold crests 3 cm proud of the valleys every 5 cm
function bellowsGeo(G, q) {
  const z0 = G.zJR - 0.02, z1 = G.zJF + 0.02, hxB = G.hx - 0.06, yb = 0.40, yt = G.y1 - 0.05, rc = 0.24;
  const segs = [];
  const line = (a, b, n) => segs.push({ t: 'l', a, b, n, len: Math.hypot(b[0] - a[0], b[1] - a[1]) });
  const arc = (c, a0, a1) => segs.push({ t: 'a', c, a0, a1, len: Math.abs(a1 - a0) * rc });
  line([-hxB, yb], [-hxB, yt - rc], [-1, 0]);
  arc([-hxB + rc, yt - rc], Math.PI, Math.PI / 2);
  line([-hxB + rc, yt], [hxB - rc, yt], [0, 1]);
  arc([hxB - rc, yt - rc], Math.PI / 2, 0);
  line([hxB, yt - rc], [hxB, yb], [1, 0]);
  const total = segs.reduce((a, g) => a + g.len, 0);
  const np = [72, 28, 10][q];
  const ring = [];
  for (let i = 0; i <= np; i++) {
    let d = (i / np) * total;
    for (const g of segs) {
      if (d > g.len + 1e-9 && g !== segs[segs.length - 1]) { d -= g.len; continue; }
      const t = Math.min(1, d / g.len);
      if (g.t === 'l') ring.push({ p: [g.a[0] + (g.b[0] - g.a[0]) * t, g.a[1] + (g.b[1] - g.a[1]) * t], n: g.n });
      else { const a = g.a0 + (g.a1 - g.a0) * t; ring.push({ p: [g.c[0] + Math.cos(a) * rc, g.c[1] + Math.sin(a) * rc], n: [Math.cos(a), Math.sin(a)] }); }
      break;
    }
  }
  const nz = q === 2 ? 1 : Math.round((z1 - z0) / [0.025, 0.055][q]);
  const pos = [], idx = [], W = ring.length;
  for (let j = 0; j <= nz; j++) {
    const z = z0 + ((z1 - z0) * j) / nz, amp = q === 2 || j === 0 || j === nz ? 0 : j % 2 ? 0.045 : 0;
    for (const r of ring) pos.push(r.p[0] + r.n[0] * amp, r.p[1] + r.n[1] * amp, z);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < W - 1; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // wind outward (the roof's middle faces up), then flat-shade so every fold reads as a lit and a shaded face
  const top = Math.floor(W / 2), a0 = new THREE.Vector3(), a1 = new THREE.Vector3(), a2 = new THREE.Vector3();
  a0.fromArray(pos, top * 3); a1.fromArray(pos, (top + W) * 3); a2.fromArray(pos, (top + 1) * 3);
  if (new THREE.Vector3().crossVectors(a1.clone().sub(a0), a2.clone().sub(a0)).y < 0)
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 1]; idx[i + 1] = t; }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g = q < 2 ? g.toNonIndexed() : g;
  g.computeVertexNormals();
  return g;
}

function build(kind, q, si = 0) {
  const M = MAKES[kind], G = derive(M), D = sectionD(G, si);
  const lod = new Lod((G.secs[si].name === 'rear' ? 'REAR_LOD' : 'LOD') + q);
  const LUV = liveryUV(G);
  const roofUV = (p) => [(G.zf - p.z) / (G.zf - G.zr), 0.9375 + ((p.x + G.hx) / G.W) * 0.0625];
  // ---- skin (paint)
  const skin = makeSkin(D, q);
  {
    const pos = [], nrm = [], uv = [];
    const tmp = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (const t of skin.tris) {
      e1.set(t.v[1].p[0] - t.v[0].p[0], t.v[1].p[1] - t.v[0].p[1], t.v[1].p[2] - t.v[0].p[2]);
      e2.set(t.v[2].p[0] - t.v[0].p[0], t.v[2].p[1] - t.v[0].p[1], t.v[2].p[2] - t.v[0].p[2]);
      tmp.crossVectors(e1, e2).normalize();
      for (const v of t.v) {
        pos.push(...v.p);
        nrm.push(...(v.n || [tmp.x, tmp.y, tmp.z]));
        uv.push(...LUV[(t.F === 'F' && !D.front) || (t.F === 'K' && !D.rear) ? 'J' : t.F](...v.p));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    lod.add('paint', g, { uv: 'own' });
    // 'own' flips v (three's convention); undo: the livery uv is already glTF-down
    const b = lod.bucket('paint');
    for (let i = b.uv.length - uv.length + 1; i < b.uv.length; i += 2) b.uv[i] = 1 - b.uv[i];
  }
  const dark = (g, sw = 'black') => lod.add('dark', g, { uv: C(sw) });
  const metal = (g, sw = 'alu') => lod.add('metal', g, { uv: C(sw) });
  const { hx, zf, zr, y0, y1 } = D;
  const T = 0.03;   // reveal depth of the openings

  // ---- openings: reveals (black gaskets) and glass
  // the inner wall of an opening: each edge of the rectangle (pts, on the skin's parameter box) sampled, mapped onto the
  // rounded skin, and joined to its inner copy (toInner); one-sided, facing the opening's middle
  const reveal = (pts, inward, toInner = null) => {
    const ctr = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / 4);
    const n = q === 0 ? 8 : 2;
    const pos = [], nrm = [];
    for (let k = 0; k < 4; k++) {
      const a = pts[k], b = pts[(k + 1) % 4];
      const ring = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, s = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        const o = skin.round(...s).p;
        const inn = toInner ? toInner(o) : [o[0] + inward[0], o[1] + inward[1], o[2] + inward[2]];
        ring.push([o, inn]);
      }
      for (let i = 0; i < n; i++) {
        const [o0, i0] = ring[i], [o1, i1] = ring[i + 1];
        const e1 = new THREE.Vector3(o1[0] - o0[0], o1[1] - o0[1], o1[2] - o0[2]), e2 = new THREE.Vector3(i0[0] - o0[0], i0[1] - o0[1], i0[2] - o0[2]);
        const nn = new THREE.Vector3().crossVectors(e1, e2).normalize();
        const mid = [(o0[0] + o1[0]) / 2, (o0[1] + o1[1]) / 2, (o0[2] + o1[2]) / 2];
        const toC = new THREE.Vector3(ctr[0] - mid[0], ctr[1] - mid[1], ctr[2] - mid[2]);
        const tri = nn.dot(toC) >= 0 ? [o0, o1, i1, o0, i1, i0] : [o0, i1, o1, o0, i0, i1];
        if (nn.dot(toC) < 0) nn.negate();
        if (!Number.isFinite(nn.x) || nn.lengthSq() < 0.5) continue;
        for (const v of tri) { pos.push(...v); nrm.push(nn.x, nn.y, nn.z); }
      }
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    dark(g, 'rubber');
  };
  const pane = (pts, mat = 'glass') => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return g;
  };
  if (q < 2) {
  // side windows
  for (const side of [1, -1]) {
    const x = side * hx, xi = side * (hx - 0.022);
    for (const w of side > 0 ? D.winL : D.winR) {
      const rect = [[x, D.belt, w[0]], [x, D.belt, w[1]], [x, D.wtop, w[1]], [x, D.wtop, w[0]]];
      reveal(rect, [-side * T, 0, 0]);
      const P = [[xi, D.belt, w[0]], [xi, D.belt, w[1]], [xi, D.wtop, w[1]], [xi, D.wtop, w[0]]];
      lod.add('glass', pane(side > 0 ? [P[0], P[3], P[2], P[1]] : P), { uv: [0.5, 0.5] });
      // a black rubber gasket frame just inside the opening (reads as the bonded-glass border)
      if (q === 0) {
        const fw = 0.028;
        for (const [a, b, c2, d2] of [[w[0], w[1], D.belt, D.belt + fw], [w[0], w[1], D.wtop - fw, D.wtop], [w[0], w[0] + fw, D.belt, D.wtop], [w[1] - fw, w[1], D.belt, D.wtop]])
          dark(box(0.012, d2 - c2, b - a, [side * (hx - 0.018), (c2 + d2) / 2, (a + b) / 2]), 'rubber');
      }
    }
    // pillars between windows are skin (painted black in the livery window band)
  }
  // windshield + destination sign (front), rear sign
  if (D.front) {
    const z = zf, zi = zf - 0.02;
    const W0 = D.ws;
    reveal([[-W0.x, W0.y0, z], [W0.x, W0.y0, z], [W0.x, W0.y1, z], [-W0.x, W0.y1, z]], [0, 0, -0.04]);
    // the windshield bulges forward a little at its middle (both makes have a curved one-piece screen)
    const nx = [32, 8, 2][q], ny = [10, 3, 1][q];
    const g = new THREE.PlaneGeometry(2 * W0.x, W0.y1 - W0.y0, nx, ny);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i) + (W0.y0 + W0.y1) / 2;
      const s = x / W0.x;
      const bulge = (M.front === 'lfs' ? 0.06 : 0.035) * s * s;   // the edges sit back, the middle at the skin
      const rake = (y - W0.y0) / (W0.y1 - W0.y0) * (M.front === 'lfs' ? -0.07 : -0.05);
      P.setXYZ(i, x, y, zi - bulge + rake);
    }
    g.computeVertexNormals();
    lod.add('glass', g, { uv: [0.5, 0.5] });
    // the Xcelsior's windscreen is two panes with a black centre post (6143, 6186, 7629), leaning back with the rake
    if (M.front === 'xd40' && q < 2) dark(box(0.06, W0.y1 - W0.y0, 0.03, [0, (W0.y0 + W0.y1) / 2, zi - 0.025 + 0.012], [-0.0376, 0, 0]), 'black');
    // sign box: the LED board behind its own glass
    const S0 = D.sign;
    const zS = Math.min(skin.round(0, S0.y1, zf).p[2], skin.round(0, S0.y0, zf).p[2]) - 0.045;   // the board's plane, behind the curved cap
    reveal([[-S0.x, S0.y0, z], [S0.x, S0.y0, z], [S0.x, S0.y1, z], [-S0.x, S0.y1, z]], null, (o) => [o[0], o[1], zS]);
    const sg = new THREE.PlaneGeometry(2 * S0.x - 0.02, S0.y1 - S0.y0 - 0.02).translate(0, (S0.y0 + S0.y1) / 2, zS + 0.004);
    const fr = GL.front(M.route);
    lod.add('glow', sg, { uv: (p) => rectUV(fr, (p.x + S0.x) / (2 * S0.x), 1 - (p.y - S0.y0) / (S0.y1 - S0.y0)) });
    lod.add('glass', new THREE.PlaneGeometry(2 * S0.x, S0.y1 - S0.y0).translate(0, (S0.y0 + S0.y1) / 2, zS + 0.03), { uv: [0.5, 0.5] });
  }
  if (D.rear) {
    // rear route number
    const R0 = D.rearSign;
    const zK = Math.max(skin.round(0, R0.y1, zr).p[2], skin.round(0, R0.y0, zr).p[2]) + 0.045;
    reveal([[-R0.x, R0.y0, zr], [R0.x, R0.y0, zr], [R0.x, R0.y1, zr], [-R0.x, R0.y1, zr]], null, (o) => [o[0], o[1], zK]);
    const rg = new THREE.PlaneGeometry(2 * R0.x, R0.y1 - R0.y0).rotateY(Math.PI).translate(0, (R0.y0 + R0.y1) / 2, zK - 0.004);
    const rr = GL.rear(M.route);
    lod.add('glow', rg, { uv: (p) => rectUV(rr, (R0.x - p.x) / (2 * R0.x), 1 - (p.y - R0.y0) / (R0.y1 - R0.y0)) });
    lod.add('glass', new THREE.PlaneGeometry(2 * R0.x, R0.y1 - R0.y0).rotateY(Math.PI).translate(0, (R0.y0 + R0.y1) / 2, zK - 0.03), { uv: [0.5, 0.5] });
  }
  if (D.front) {
    // curb-side LED sign at the top of the window behind the front door
    const ss = D.winR[0];
    const sw = GL.side(M.route);
    const sz0 = ss[1] - 0.05 - 1.0, sz1 = ss[1] - 0.05;
    const sgeo = new THREE.PlaneGeometry(sz1 - sz0, 0.2).rotateY(-Math.PI / 2).translate(-(hx - 0.06), D.wtop - 0.16, (sz0 + sz1) / 2);
    lod.add('glow', sgeo, { uv: (p) => rectUV(sw, (p.z - sz0) / (sz1 - sz0), 1 - (p.y - (D.wtop - 0.26)) / 0.2) });
  }
  // ---- doors (curb side, -X): two glazed leaves each, black frames, set 4 cm in
  for (const [d0, d1] of D.doors) {
    const xo = -(hx - 0.04), top = 2.42, bot = y0 + 0.06;
    reveal([[-hx, bot, d0], [-hx, bot, d1], [-hx, top, d1], [-hx, top, d0]], [T + 0.02, 0, 0]);
    const mid = (d0 + d1) / 2;
    for (const [a, b] of [[d0 + 0.01, mid - 0.006], [mid + 0.006, d1 - 0.01]]) {
      const fw = 0.055;
      // frame
      dark(box(0.04, top - bot - 0.02, fw, [xo, (top + bot) / 2, a + fw / 2]), 'trim');
      dark(box(0.04, top - bot - 0.02, fw, [xo, (top + bot) / 2, b - fw / 2]), 'trim');
      dark(box(0.04, fw, b - a, [xo, top - 0.01 - fw / 2, (a + b) / 2]), 'trim');
      dark(box(0.04, fw * 1.6, b - a, [xo, bot + fw * 0.8, (a + b) / 2]), 'trim');
      dark(box(0.04, 0.05, b - a, [xo, 1.05, (a + b) / 2]), 'trim');   // the mid rail
      // glass upper and lower
      for (const [ga, gb] of [[bot + fw * 1.6, 1.025], [1.075, top - 0.01 - fw]])
        lod.add('glass', new THREE.PlaneGeometry(b - a - 2 * fw, gb - ga).rotateY(-Math.PI / 2).translate(xo - 0.005, (ga + gb) / 2, (a + b) / 2), { uv: [0.5, 0.5] });
      // the rubber edge seal where the leaves meet
      if (q === 0) dark(box(0.05, top - bot - 0.06, 0.018, [xo - 0.005, (top + bot) / 2, a < mid ? b - 0.004 : a + 0.004]), 'rubber');
    }
    // door threshold plate, the step edge in yellow
    if (q < 2) dark(box(0.12, 0.012, d1 - d0, [-(hx - 0.07), bot + 0.006, mid]), 'yellow');
  }
  } else if (D.front) {
    // far: the signs on the skin (the livery paints the glazing black)
    const S0 = D.sign, fr = GL.front(M.route);
    lod.add('glow', new THREE.PlaneGeometry(2 * S0.x, S0.y1 - S0.y0).translate(0, (S0.y0 + S0.y1) / 2, skin.round(0, S0.y1, zf).p[2] + 0.004), { uv: (p) => rectUV(fr, (p.x + S0.x) / (2 * S0.x), 1 - (p.y - S0.y0) / (S0.y1 - S0.y0)) });
  }
  // ---- underbody pan and wheel wells
  {
    const segs = [];
    let zc0 = zr + 0.05;
    for (const za of [...D.arches].sort((a, b) => a - b)) { segs.push([zc0, za - D.ra]); zc0 = za + D.ra; }
    segs.push([zc0, zf - 0.05]);
    for (const [a, b] of segs.filter(([a, b]) => b - a > 0.05)) dark(box(2 * hx - 0.06, 0.02, b - a, [0, y0 + 0.01, (a + b) / 2]), 'underbody');
    for (const [za, depth] of D.axles.map((a) => [a.z, a.dual ? 0.78 : 0.5])) {
      for (const side of [1, -1]) {
        // arch liner: half cylinder over the wheel, open at the side
        const segs2 = [24, 10, 6][q], r = D.ra - 0.005, xa = side * (hx - 0.005), xb = side * (hx - depth - 0.01);
        const lp = [], ln = [];
        for (let i = 0; i < segs2; i++) {
          const a0 = (i / segs2) * Math.PI, a1 = ((i + 1) / segs2) * Math.PI;
          const P0 = [Math.cos(a0) * r, Math.sin(a0) * r], P1 = [Math.cos(a1) * r, Math.sin(a1) * r];
          const v = (x, P) => [x, D.yA + P[1], za + P[0]];
          const quad = [v(xa, P0), v(xb, P0), v(xb, P1), v(xa, P0), v(xb, P1), v(xa, P1)];
          // facing the wheel (toward the arch centre): order so the winding agrees with that normal
          const am = (a0 + a1) / 2, nn = [0, -Math.sin(am), -Math.cos(am)];
          const e1 = new THREE.Vector3(...quad[1]).sub(new THREE.Vector3(...quad[0])), e2 = new THREE.Vector3(...quad[2]).sub(new THREE.Vector3(...quad[0]));
          const c = new THREE.Vector3().crossVectors(e1, e2);
          const tri = c.dot(new THREE.Vector3(...nn)) >= 0 ? quad : [quad[0], quad[2], quad[1], quad[3], quad[5], quad[4]];
          for (const p of tri) { lp.push(...p); ln.push(...nn); }
        }
        const liner = new THREE.BufferGeometry();
        liner.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
        liner.setAttribute('normal', new THREE.Float32BufferAttribute(ln, 3));
        dark(liner, 'underbody');
        // the well's inner wall and its vertical sides below the axle
        dark(box(0.02, D.ra + D.yA - y0, 2 * D.ra, [side * (hx - depth - 0.01), (D.ra + D.yA + y0) / 2, za]), 'underbody');
        for (const s2 of [-1, 1]) dark(box(depth, D.yA - y0, 0.02, [side * (hx - depth / 2 - 0.01), (D.yA + y0) / 2, za + s2 * (D.ra - 0.005)]), 'underbody');
      }
    }
  }
  // ---- wheels
  const hubs = [];
  {
    const front = wheelGeo(q, false, true), rearO = wheelGeo(q, true, true), rearI = wheelGeo(q, true, false);
    const put = (W, x, z, mirror, id) => {
      for (const [part, mat, sw] of [['tyre', 'dark', 'tyre'], ['rim', 'metal', 'alu']]) {
        const g = W[part].clone();
        if (mirror) { g.scale(-1, 1, 1); const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 1]; ix[i + 1] = t; } g.computeVertexNormals(); }
        g.translate(x, D.yA, z);
        lod.add(mat, g, { uv: C(sw), wheel: id });
      }
      for (const n0 of W.nuts) { const g = n0.clone(); if (mirror) { g.scale(-1, 1, 1); const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 1]; ix[i + 1] = t; } g.computeVertexNormals(); } g.translate(x, D.yA, z); lod.add('metal', g, { uv: C('chrome'), wheel: id }); }
      for (const h0 of W.holes) { const g = h0.clone(); if (mirror) { g.scale(-1, 1, 1); const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 1]; ix[i + 1] = t; } g.computeVertexNormals(); } g.translate(x, D.yA, z); lod.add('dark', g, { uv: C('black'), wheel: id }); }
    };
    const xF = hx - 0.17, xRO = hx - 0.19, xRI = xRO - 0.33;
    for (const a of D.axles) {
      const [iL, iR] = a.ids;
      if (!a.dual) {
        put(front, xF, a.z, false, iL); put(front, -xF, a.z, true, iR);
        hubs.push({ id: iL, p: [+xF.toFixed(4), D.yA, +a.z.toFixed(4)], r: TYRE.R, w: TYRE.w });
        hubs.push({ id: iR, p: [-xF.toFixed(4), D.yA, +a.z.toFixed(4)], r: TYRE.R, w: TYRE.w });
      } else {
        put(rearO, xRO, a.z, false, iL); put(rearO, -xRO, a.z, true, iR);
        if (q < 2) { put(rearI, xRI, a.z, false, iL); put(rearI, -xRI, a.z, true, iR); }
        hubs.push({ id: iL, p: [+((xRO + xRI) / 2).toFixed(4), D.yA, +a.z.toFixed(4)], r: TYRE.R, w: +(TYRE.w + 0.33).toFixed(3) });
        hubs.push({ id: iR, p: [-((xRO + xRI) / 2).toFixed(4), D.yA, +a.z.toFixed(4)], r: TYRE.R, w: +(TYRE.w + 0.33).toFixed(3) });
      }
    }
  }
  // ---- bumpers
  {
    const bs = [10, 3, 1][q];
    // front: a black energy-absorbing bumper the width of the body, rounded ends
    // front: a black energy-absorbing bumper wrapping the body's plan corners and running ~0.4 m back along the sides
    const bseg = [[24, 6, 12], [8, 2, 4], [4, 1, 2]][q];
    const dF = 0.55 + M.bumpF, dR = 0.5 + M.bumpR;
    if (D.front) lod.add('dark', rbox3(2 * hx + 0.03, 0.34, dF, [D.rzF + 0.1, 0.05, D.rzF + 0.1], bseg, [0, 0.47, zf + M.bumpF - dF / 2]), { uv: C('bumper') });
    if (D.rear) lod.add('dark', rbox3(2 * hx + 0.03, 0.3, dR, [D.rzR + 0.08, 0.05, D.rzR + 0.08], bseg, [0, 0.44, zr - M.bumpR + dR / 2]), { uv: C('bumper') });
    if (q === 0) {
      // the rubber rub strip along both sides at the skirt
      // broken at the arches and (curb side) at the doors; a body's end at the articulation runs it to 6 cm from the face
      for (const side of [1, -1]) {
        const cuts = D.arches.map((za) => [za - D.ra - 0.03, za + D.ra + 0.03]);
        if (side < 0) for (const d of D.doors) cuts.push([d[0] - 0.02, d[1] + 0.02]);
        let segs = [[zr + (D.rear ? 0.2 : 0.06), zf - (D.front ? 0.2 : 0.06)]];
        for (const [a, b] of cuts) segs = segs.flatMap(([u, v]) => (b <= u || a >= v ? [[u, v]] : [[u, a], [b, v]].filter(([s0, s1]) => s1 - s0 > 0.05)));
        for (const [a, b] of segs) dark(box(0.03, 0.09, b - a, [side * (hx + 0.012), 0.36, (a + b) / 2]), 'rubber');
      }
    }
  }
  // ---- lamps: front
  const lampAdd = (g, role) => lod.add('lamp', g, { uv: [0.5, 0.5], lamp: role });
  const lensAdd = (g) => lod.add('lens', g, { uv: [0.5, 0.5] });
  const housing = (g) => lod.add('lampInner', g, { uv: [0.5, 0.5] });
  if (D.front) {
    const zF = zf + 0.005;
    const ls = [24, 12, 6][q];
    for (const side of [1, -1]) {
      if (M.front === 'xd40') {
        // Xcelsior (XD40 / XD60 6186, 7629): a long black housing low on each corner, its outer end swept up, two LED
        // headlamp units along it, the amber turn lamp at the outer upper end
        const xc = side * (hx - 0.4), yc = 0.8, a = side * 0.17, ca = Math.cos(a), sa = Math.sin(a);
        housing(place(rbox3(0.6, 0.15, 0.06, [0.06, 0.06, 0.02], [q === 0 ? 8 : 2, q === 0 ? 4 : 1, 1], [0, 0, 0]), { p: [xc, yc, zF - 0.008], r: [0, 0, a] }));
        for (const t of [-0.13, 0.07]) {
          const tt = side * t, x = xc + tt * ca, y = yc + tt * sa;
          lampAdd(place(rbox3(0.17, 0.08, 0.03, [0.035, 0.035, 0.01], [q === 0 ? 6 : 1, q === 0 ? 4 : 1, 1], [0, 0, 0]), { p: [x, y, zF + 0.018], r: [0, 0, a] }), ROLE.head);
          if (q < 2) lensAdd(place(rbox3(0.18, 0.09, 0.025, [0.04, 0.04, 0.012], [q === 0 ? 6 : 1, q === 0 ? 4 : 1, 1], [0, 0, 0]), { p: [x, y, zF + 0.03], r: [0, 0, a] }));
        }
        { const tt = side * 0.25; lampAdd(place(rbox(0.1, 0.05, 0.03, 0.012, 2, [0, 0, 0]), { p: [xc + tt * ca, yc + tt * sa + 0.07, zF + 0.012], r: [0, 0, a] }), side > 0 ? ROLE.fbl : ROLE.fbr); }
      } else {
        // LFS: one large round headlamp in a black pod below each end of the blue band, the round amber turn lamp above it in
        // the band (1200, 5886, 5975, 5520)
        const xc = side * (hx - 0.3), yc = 0.63;
        housing(cyl(0.11, 0.11, 0.03, ls, [xc, yc, zF - 0.005], [Math.PI / 2, 0, 0]));
        lampAdd(cyl(0.09, 0.09, 0.03, ls, [xc, yc, zF + 0.012], [Math.PI / 2, 0, 0]), ROLE.head);
        if (q < 2) lensAdd(place(new THREE.SphereGeometry(0.094, ls, q === 0 ? 6 : 2, 0, Math.PI * 2, 0, Math.PI / 2), { p: [xc, yc, zF + 0.025], r: [Math.PI / 2, 0, 0], s: [1, 0.4, 1] }));
        housing(cyl(0.05, 0.05, 0.02, ls, [xc + side * 0.06, yc + 0.27, zF], [Math.PI / 2, 0, 0]));
        lampAdd(cyl(0.04, 0.04, 0.03, ls, [xc + side * 0.06, yc + 0.27, zF + 0.012], [Math.PI / 2, 0, 0]), side > 0 ? ROLE.fbl : ROLE.fbr);
      }
    }
    // five amber clearance / ID lamps across the front roof cap, three across the rear (always lit: glow class)
    const yId = D.sign.y1 + 0.035;
    for (const x of [-0.9, -0.12, 0, 0.12, 0.9]) {
      const zc = skin.round(x, yId, zf).p[2];
      lod.add('glow', rbox(0.07, 0.035, 0.03, 0.01, 1, [x, yId, zc + 0.005]), { uv: GC(GL.amber) });
    }
  }
  if (D.rear) {
    for (const x of [-0.12, 0, 0.12]) {
      const zc = skin.round(x, D.rearSign.y1 + 0.035, zr).p[2];
      lod.add('glow', rbox(0.07, 0.035, 0.03, 0.01, 1, [x, D.rearSign.y1 + 0.035, zc - 0.005]), { uv: GC(GL.amber) });
    }
  }
  // ---- lamps: rear corners, a vertical row of round lamps: turn (amber) top, two tail / brake, reverse low
  if (D.rear) {
    const zR = zr - 0.005, ls = [24, 12, 6][q];
    for (const side of [1, -1]) {
      const xc = side * (hx - 0.2);
      housing(rbox(0.22, 0.86, 0.04, 0.03, q === 0 ? 3 : 1, [xc, 1.12, zR + 0.012]));
      const rows = [[1.45, side > 0 ? ROLE.rbl : ROLE.rbr], [1.24, ROLE.tail], [1.03, ROLE.tail], [0.82, ROLE.rev]];
      for (const [y, role] of rows) {
        lampAdd(cyl(0.085, 0.085, 0.02, ls, [xc, y, zR - 0.004], [Math.PI / 2, 0, 0]), role);
        if (q < 2) lensAdd(place(new THREE.SphereGeometry(0.088, ls, q === 0 ? 5 : 2, 0, Math.PI * 2, 0, Math.PI / 2), { p: [xc, y, zR - 0.01], r: [-Math.PI / 2, 0, 0], s: [1, 0.25, 1] }));
      }
    }
  }
  // ---- mirrors: NYC transit mirrors on long arms, heads in red / white diagonal stripes
  if (q < 2 && D.front) {
    const head = (x, y, z) => {
      const hw = 0.2, hh = 0.36, hd = 0.09;
      lod.add('dark', rbox(hw, hh, hd, 0.03, q === 0 ? 3 : 1, [x, y, z]), {
        uv: (p, n) => (Math.abs(n.z) > 0.7 && n.z < 0 ? C('mirror') : rectUV(SW.stripes, (p.x - x) / hw + 0.5 + (p.z - z) * 2, 0.5 - (p.y - y) / hh)),
      });
      // the glass faces rearward
      lod.add('glass', new THREE.PlaneGeometry(hw - 0.03, hh - 0.03).rotateY(Math.PI).translate(x, y, z - hd / 2 - 0.004), { uv: [0.5, 0.5] });
    };
    const arm = (a, b) => {
      const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), l = d.length();
      const g = new THREE.CylinderGeometry(0.018, 0.018, l, q === 0 ? 10 : 5);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
      g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      dark(g, 'trim');
    };
    // curb side (-X): high, from the roof corner forward
    const cA = [-(hx - 0.05), y1 - 0.25, zf - 0.12], cH = [-(hx + 0.2), y1 - 0.62, zf + 0.42];
    arm(cA, [cH[0], cA[1] + 0.02, cH[2] - 0.05]); arm([cH[0], cA[1] + 0.02, cH[2] - 0.05], [cH[0], cH[1] + 0.18, cH[2]]);
    head(...cH);
    // street side (+X): lower, on an arm from the corner pillar
    const sA = [hx - 0.04, 2.12, zf - 0.1], sH = [hx + 0.24, 1.98, zf + 0.34];
    arm(sA, [sH[0], sA[1], sH[2] - 0.04]); arm([sH[0], sA[1], sH[2] - 0.04], [sH[0], sH[1] + 0.18, sH[2]]);
    head(...sH);
    // wipers: two long blades parked along the bottom of the windshield, arms angled up
    for (const [x0, ang] of [[-0.55, 0.55], [0.35, 0.62]]) {
      const len = 0.95;
      dark(place(new THREE.BoxGeometry(len, 0.022, 0.018), { p: [x0 + Math.cos(ang) * len / 2, D.ws.y0 + 0.05 + Math.sin(ang) * len / 2, zf + 0.04], r: [0, 0, ang] }), 'wiper');
      dark(place(new THREE.BoxGeometry(0.75, 0.012, 0.03), { p: [x0 + Math.cos(ang) * 0.5, D.ws.y0 + 0.05 + Math.sin(ang) * 0.5, zf + 0.055], r: [0, 0, ang] }), 'wiper');
    }
  }
  // ---- front plate (NY, invented number) above the bumper on the street-side half; rear plate low on the engine door
  if (q < 2) {
    const cell = [0.016, 0.289, 0.984, 0.758];
    if (D.front) lod.add('plate', new THREE.PlaneGeometry(0.305, 0.152).translate(0.62, 0.86, zf + 0.012), { uv: (p) => rectUV(cell, (p.x - 0.62) / 0.305 + 0.5, 0.5 - (p.y - 0.86) / 0.152) });
    if (D.rear) lod.add('plate', new THREE.PlaneGeometry(0.305, 0.152).rotateY(Math.PI).translate(-0.55, 0.78, zr - 0.012), { uv: (p) => rectUV(cell, (-0.55 - p.x) / 0.305 + 0.5, 0.5 - (p.y - 0.78) / 0.152) });
    if (D.front) dark(box(0.34, 0.18, 0.01, [0.62, 0.86, zf + 0.005]), 'black');
    if (D.rear) dark(box(0.34, 0.18, 0.01, [-0.55, 0.78, zr - 0.005]), 'black');
  }
  // ---- rear engine door louvres and the street-side engine-bay grille
  if (q < 2 && D.rear) {
    const g = new THREE.PlaneGeometry(1.2, 0.5).rotateY(Math.PI).translate(0, 1.0, zr - 0.006);
    if (M.livery !== 'sbs') lod.add('dark', g, { uv: (p) => rectUV(SW.grilleTex, (0.6 - p.x) / 1.2, 0.5 - (p.y - 1.0) / 0.5) });
    const g2 = new THREE.PlaneGeometry(0.9, 0.62).rotateY(Math.PI / 2).translate(hx + 0.004, 1.55, zr + 0.75);
    lod.add('dark', g2, { uv: (p) => rectUV(SW.grilleTex, (p.z - (zr + 0.3)) / 0.9, 0.5 - (p.y - 1.55) / 0.62) });
  }
  // ---- roof: the HVAC pod (over the rear of a rigid bus; on the articulated bus over the rear body's front end, behind
  // the bellows, as in the side photographs), escape hatches, the Xcelsior's front roof cowl, the diesel exhaust stack
  {
    const H0 = M.hvac, rs = [6, 2, 1][q];
    if (!M.art || !D.front) {
      const zc = M.art ? zf - 0.25 - H0.len / 2 : zr + H0.zr + H0.len / 2;
      lod.add('paint', rbox(H0.w, H0.h + 0.06, H0.len, 0.08, rs, [0, y1 - 0.03 + H0.h / 2, zc]), { uv: roofUV });
      // condenser grilles on the pod's flanks
      if (q < 2) for (const side of [1, -1]) lod.add('dark', new THREE.PlaneGeometry(H0.len * 0.7, H0.h * 0.6).rotateY(side * Math.PI / 2).translate(side * (H0.w / 2 + 0.003), y1 - 0.03 + H0.h * 0.55, zc), { uv: (p) => rectUV(SW.grilleTex, (p.z - zc) / (H0.len * 0.7) + 0.5, 0.5 - (p.y - (y1 + H0.h * 0.5)) / (H0.h * 0.6)) });
    }
    if (q < 2) {
      const hatches = !M.art ? [D.zFA - 1.2, D.zRA + 1.3] : D.front ? [D.zFA - 1.2, D.zMA + 1.9] : [zr + 2.6];
      for (const zh of hatches) lod.add('paint', rbox(0.62, 0.05, 0.62, 0.02, q === 0 ? 2 : 1, [0, y1 + 0.01, zh]), { uv: roofUV });
    }
    // the XD60's front body carries a long low roof fairing from the front cap back over ~5.5 m (6192's roof line steps
    // down above the third window; length and height read off that photograph, not measured)
    if (M.front === 'xd40' && D.front && M.art) {
      lod.add('paint', rbox3(2.0, 0.2, 5.5, [0.12, 0.1, 0.5], [rs * 2, rs, rs * 3], [0, y1 + 0.03, zf - 0.55 - 2.75]), { uv: roofUV });
      // on it the HVAC unit (6221 from above: a tall box over the front doors' half with dark grilles on its top)
      const zc = zf - 1.5 - 1.5;
      lod.add('paint', rbox3(1.9, 0.26, 3.0, [0.1, 0.08, 0.25], [rs * 2, rs, rs * 2], [0, y1 + 0.24, zc]), { uv: roofUV });
      if (q < 2) for (const dz of [-0.75, 0.75]) lod.add('dark', new THREE.PlaneGeometry(1.4, 1.0).rotateX(-Math.PI / 2).translate(0, y1 + 0.372, zc + dz), { uv: (p) => rectUV(SW.grilleTex, (p.x + 0.7) / 1.4, (p.z - (zc + dz) + 0.5) / 1.0) });
    }
    else if (M.front === 'xd40' && D.front) lod.add('paint', rbox(1.8, 0.12, 1.4, 0.06, rs, [0, y1 + 0.01, zf - 0.95]), { uv: roofUV });
    if (M.art && D.rear && q < 2) metal(cyl(0.055, 0.06, 0.34, q === 0 ? 14 : 6, [hx - 0.34, y1 + 0.12, zr + 0.4]), 'steel');
  }
  // ---- the articulation bellows and the turntable plate under them
  let joint = null;
  if (M.art && !D.front) {
    // their own node (LOD<n>_joint): the sim bends them about the turntable by `_ARTIC` (0 at the front body's face, 1 at
    // the rear body's) times the articulation angle
    const artic = (p) => Math.max(0, Math.min(1, (G.zJF - p.z) / (G.zJF - G.zJR)));
    joint = new Lod('LOD' + q + '_joint');
    joint.add('dark', bellowsGeo(G, q), { uv: C('bellows'), artic });
    if (q < 2) joint.add('dark', box(2 * hx - 0.3, 0.05, G.zJF - G.zJR + 0.3, [0, 0.36, G.pivotZ]), { uv: C('underbody'), artic: 0.5 });
  }
  // ---- interior (LOD0 full, LOD1 the big shapes; LOD2 has no openings)
  if (q < 2) {
    const xi = hx - 0.045, floorY = 0.38, ceilY = y1 - 0.16;
    // the raised rear floor over the rear axle, behind the last door (in the body with the engine only)
    const zA = zr + (D.rear ? 0.15 : 0.05), zB = zf - (D.front ? 0.12 : 0.05), zRise = D.rear ? D.axles[D.axles.length - 1].z + D.ra + 0.05 : zA;
    // walls and ceiling (inward facing), floor
    const inward = (g) => { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 1]; ix[i + 1] = t; } g.computeVertexNormals(); return g; };
    lod.add('dark', new THREE.PlaneGeometry(2 * xi, zB - zA).rotateX(Math.PI / 2).translate(0, ceilY, (zA + zB) / 2), { uv: C('ceiling') });
    // floors in strips: over a wheel well only the aisle between the wells (the well housings rise through the floor; a
    // full-width floor ran through the wheels and showed its yellow edge across the tyres in the arches)
    const floorStrips = (z0, z1, y, uvf) => {
      const cuts = D.axles.map((a) => [a.z - D.ra - 0.03, a.z + D.ra + 0.03, hx - (a.dual ? 0.78 : 0.5) - 0.04]);
      const stops = [z0, z1, ...cuts.flatMap((c) => [c[0], c[1]])].filter((z) => z >= z0 && z <= z1).sort((a, b) => a - b);
      for (let k = 0; k < stops.length - 1; k++) {
        const a = stops[k], b = stops[k + 1];
        if (b - a < 0.01) continue;
        const m = (a + b) / 2, c = cuts.find((c2) => m > c2[0] && m < c2[1]);
        const half = c ? Math.min(xi, c[2]) : xi;
        lod.add('dark', new THREE.PlaneGeometry(2 * half, b - a).rotateX(-Math.PI / 2).translate(0, y, m), { uv: uvf });
      }
    };
    if (zRise > zA + 0.01) floorStrips(zA, zRise, floorY + 0.3, C('floor'));
    floorStrips(zRise, zB, floorY, (p) => rectUV(SW.floorTex, (p.x + xi) / (2 * xi), 0.5));
    if (zRise > zA + 0.01) lod.add('dark', box(2 * xi, 0.3, 0.03, [0, floorY + 0.15, zRise]), { uv: C('yellow') });
    for (const side of [1, -1]) {
      // lower lining (floor to sill) and the upper lining (window head to ceiling), facing in
      lod.add('dark', new THREE.PlaneGeometry(zB - zA, D.belt - floorY).rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2).translate(side * xi, (D.belt + floorY) / 2, (zA + zB) / 2), { uv: C('wall') });
      lod.add('dark', new THREE.PlaneGeometry(zB - zA, ceilY - D.wtop).rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2).translate(side * xi, (ceilY + D.wtop) / 2, (zA + zB) / 2), { uv: C('wall') });
      // the window sill ledge
      lod.add('dark', box(0.1, 0.02, zB - zA, [side * (xi - 0.05), D.belt - 0.01, (zA + zB) / 2]), { uv: C('grey') });
      // advertising card rack above the windows
      if (q === 0) lod.add('dark', place(new THREE.BoxGeometry(0.02, 0.28, zB - zA - 1.5), { p: [side * (xi - 0.12), ceilY - 0.2, (zA + zB) / 2 - 0.4], r: [0, 0, side * 0.6] }), { uv: C('white') });
      // ceiling light strips (glow): LED lines along both sides of the ceiling
      lod.add('glow', new THREE.PlaneGeometry(0.11, zB - zA - 1.2).rotateX(Math.PI / 2).translate(side * (xi - 0.33), ceilY - 0.012, (zA + zB) / 2 - 0.3), { uv: GC(GL.strip) });
    }
    lod.add('dark', new THREE.PlaneGeometry(2 * xi, ceilY - floorY).translate(0, (ceilY + floorY) / 2, zA), { uv: C(D.rear ? 'wall' : 'seatDark') });
    // the articulated rear body's front end: the dark gangway into the bellows
    if (!D.front) lod.add('dark', new THREE.PlaneGeometry(2 * xi, ceilY - floorY).rotateY(Math.PI).translate(0, (ceilY + floorY) / 2, zB), { uv: C('seatDark') });
    if (q < 2) {
      // seats: forward-facing pairs both sides from behind the front wheels to the rear bench
      const seatAt = (x, z, y = floorY, dir = 1) => {
        const sw2 = 0.43;
        lod.add('dark', rbox(sw2, 0.07, 0.42, 0.025, q === 0 ? 2 : 1, [x, y + 0.42, z]), { uv: C('seat') });
        lod.add('dark', place(rbox(sw2, 0.6, 0.06, 0.025, q === 0 ? 2 : 1, [0, 0, 0]), { p: [x, y + 0.74, z - dir * 0.22], r: [dir * -0.18, 0, 0] }), { uv: C('seatDark') });
        if (q === 0) lod.add('metal', cyl(0.02, 0.02, 0.4, 6, [x, y + 0.2, z], [0, 0, 0]), { uv: C('steel') });
      };
      const rows = [];
      for (let z = D.front ? D.zFA - D.ra - 0.45 : zB - 0.45; z > Math.max(zRise + 0.2, zA + 0.3); z -= 0.78) if (!D.arches.some((za) => Math.abs(z - za) < D.ra + 0.3)) rows.push([z, floorY]);
      for (let z = zRise - 0.45; z > zA + 0.6; z -= 0.78) rows.push([z, floorY + 0.3]);
      for (const [z, y] of rows) for (const side of [1, -1]) {
        if (side < 0 && D.doors.some((d) => z < d[1] + 0.25 && z > d[0] - 0.35)) continue;   // the door wells
        for (const k of [0, 1]) seatAt(side * (xi - 0.27 - k * 0.45), z, y);
      }
      // rear bench across the back
      if (D.rear) for (let k = -2; k <= 2; k++) seatAt(k * 0.46, zA + 0.45, floorY + 0.3);
      // over the front wheels: side-facing seats on raised plinths
      if (D.front) for (const side of [1, -1]) {
        lod.add('dark', box(0.5, 0.32, 1.2, [side * (xi - 0.3), floorY + 0.16, D.zFA]), { uv: C('grey') });
        if (side > 0) for (const dz of [-0.3, 0.3]) {
          lod.add('dark', rbox(0.42, 0.07, 0.43, 0.025, 1, [side * (xi - 0.3), floorY + 0.65, D.zFA + dz]), { uv: C('seat') });
          lod.add('dark', rbox(0.06, 0.55, 0.43, 0.025, 1, [side * (xi - 0.05), floorY + 0.95, D.zFA + dz]), { uv: C('seatDark') });
        }
      }
      // stanchions (yellow): floor-to-ceiling poles at the aisle every other row, ceiling grab rails both sides
      if (q === 0) {
        const pr = 0.019;
        rows.forEach(([z, y], i) => {
          if (i % 2) return;
          for (const side of [1, -1]) lod.add('dark', cyl(pr, pr, ceilY - y - 0.62, 10, [side * 0.52, y + 0.62 + (ceilY - y - 0.62) / 2, z - 0.25]), { uv: C('yellow') });
        });
        for (const side of [1, -1]) lod.add('dark', cyl(pr, pr, zB - zA - 1.4, 10, [side * 0.55, ceilY - 0.12, (zA + zB) / 2 - 0.2], [Math.PI / 2, 0, 0]), { uv: C('yellow') });
        // door stanchions
        for (const z of D.doors.flatMap((d) => [d[0] - 0.05, d[1] + 0.05]))
          lod.add('dark', cyl(pr, pr, ceilY - floorY, 10, [-(xi - 0.22), (ceilY + floorY) / 2, z]), { uv: C('yellow') });
      }
      // the driver's area: seat, wheel, dash, the fare box by the front door, the cab's safety partition
      if (D.front) {
      const zd = zf - 0.95;
      lod.add('dark', rbox(0.5, 0.1, 0.5, 0.03, 1, [0.6, floorY + 0.5, zd]), { uv: C('seatDark') });
      lod.add('dark', place(rbox(0.5, 0.7, 0.1, 0.03, 1, [0, 0, 0]), { p: [0.6, floorY + 0.9, zd - 0.27], r: [-0.15, 0, 0] }), { uv: C('seatDark') });
      lod.add('dark', box(2 * xi - 0.1, 0.45, 0.5, [0, D.ws.y0 - 0.2, zf - 0.32]), { uv: C('dash') });
      lod.add('dark', place(new THREE.TorusGeometry(0.24, 0.022, 6, q === 0 ? 24 : 10), { p: [0.6, D.ws.y0 + 0.05, zf - 0.62], r: [-1.1, 0, 0] }), { uv: C('black') });
      lod.add('dark', box(0.3, 1.0, 0.3, [-0.05, floorY + 0.5, zf - 1.05]), { uv: C('grey') });
      lod.add('dark', box(0.04, 1.3, 0.75, [0.25, floorY + 1.05, zd - 0.1]), { uv: C('grey') });
      }
    } else {
      // far: a dark core so the glazing does not read hollow
      lod.add('dark', box(2 * xi - 0.1, 1.2, zB - zA - 0.4, [0, D.belt + 0.55, (zA + zB) / 2]), { uv: C('seatDark') });
    }
  }
  return { lod, D, hubs, joint };
}

// ---------------------------------------------------------------- textures (SVG -> PNG)
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
// lettering and the roundel at true proportions: the atlas runs kx px per metre across and ky down
const FONT = 'Liberation Sans, DejaVu Sans, sans-serif';
function txt(x, y, str, capM, kx, ky, fill, { weight = 'bold', anchor = 'middle', italic = false } = {}) {
  return `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${(kx / ky).toFixed(4)},1)"><text x="0" y="0" font-family="${FONT}" font-weight="${weight}" ${italic ? 'font-style="italic"' : ''} font-size="${((capM * ky) / 0.72).toFixed(1)}" fill="${fill}" text-anchor="${anchor}">${esc(str)}</text></g>`;
}
function mtaRoundel(cx, cy, rM, kx, ky, fg, bg = '#ffffff') {
  // the MTA roundel drawn from scratch: a disc, the three letters bold, slanted, set tight across it
  return `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(rM * kx).toFixed(1)}" ry="${(rM * ky).toFixed(1)}" fill="${bg}"/>` +
    txt(cx, cy + rM * 0.3 * ky, 'MTA', rM * 0.62, kx, ky, fg, { italic: true });
}
function liverySVG(kind) {
  const M = MAKES[kind], D = derive(M);
  const S = 2048, Ls = D.zf - D.zr;
  const kS = S / Ls, kY = 640 / HB, kF = 1024 / D.W;
  const sx = (z, side) => (side === 'L' ? (D.zf - z) / Ls : (z - D.zr) / Ls) * S;   // side band x for body z
  const sy = (y, band) => (band + (1 - y / HB)) * 640;                                // band 0 left, 1 right
  const fx = (x) => ((x + D.hx) / D.W) * 1024, fy = (y) => 1280 + (1 - y / HB) * 640;
  const kx = (x) => 1024 + ((D.hx - x) / D.W) * 1024;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">`];
  const rect = (x0, y0, x1, y1, fill, extra = '') => out.push(`<rect x="${Math.min(x0, x1).toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${Math.abs(x1 - x0).toFixed(1)}" height="${Math.abs(y1 - y0).toFixed(1)}" fill="${fill}" ${extra}/>`);
  const NEW = M.livery === 'new', SBS = M.livery === 'sbs';
  // measured in the reference photographs (shade, sRGB): band blue 22-27 / 46-47 / 72-81, blue body 25 / 41 / 90; the
  // paint values below are those lifted to full daylight albedo by eye (not a colour-managed measurement)
  const BODY = SBS ? '#5fbfe0' : NEW ? '#1d3b98' : '#f1f0ea', BAND = '#1c3f8f', LIGHT = '#3fa0d6', YEL = '#f3b61f', WINDOW = '#0b0c0e';
  // Select Bus Service (photographed XD60s 6143, 6186, 6192, 6206, 6221, 6229 and XD40 7629; median sRGB in shade on
  // 6192: body 112 / 156 / 166, swoosh blue 47 / 129 / 177, yellow 217 / 164 / 73, roof blue 60-69 / 72-83 / 105-126;
  // the values here are those lifted to daylight albedo by eye, not a colour-managed measurement)
  const DARKB = '#213f96', MIDB = '#2f86c8', YELR = '#f2b928';
  rect(0, 0, S, S, BODY);
  // the strip under the front face (no skin reaches it): a body's face at the articulation maps here (liveryUV J)
  rect(0, 1876, 1024, 1920, WINDOW);
  // +selectbusservice: '+selectbus' bold, 'service' regular, white
  const sbsMark = (x, y, capM, kx, ky, anchor = 'middle') => `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${(kx / ky).toFixed(4)},1)"><text x="0" y="0" font-family="${FONT}" font-size="${((capM * ky) / 0.72).toFixed(1)}" fill="#ffffff" text-anchor="${anchor}"><tspan font-weight="bold">+selectbus</tspan><tspan font-weight="normal">service</tspan></text></g>`;
  for (const [band, side] of [[0, 'L'], [1, 'R']]) {
    const wins = side === 'L' ? D.winL : D.winR;
    const zs = wins.map((w) => w[0]).concat(wins.map((w) => w[1]));
    const zmin = Math.min(...zs), zmax = Math.max(...zs);
    // window band black from sill to head over the whole glazed length (the pillars read black), the corner pillar too
    rect(sx(zmin - 0.04, side), sy(D.wtop + 0.05, band), sx(zmax + 0.04, side), sy(D.belt - 0.04, band), WINDOW);
    rect(sx(D.zf - 0.32, side), sy(D.wtop + 0.05, band), sx(D.zf + 0.3, side), sy(D.belt - 0.04, band), WINDOW);
    if (side === 'R') for (const [a, b] of D.secs.flatMap((s2) => s2.doors)) rect(sx(a - 0.03, side), sy(2.47, band), sx(b + 0.03, side), sy(D.y0 + 0.04, band), WINDOW);
    // panel seams under the window pillars, the skirt seam, the engine-bay and battery access doors (thin dark lines)
    const seam = (x0, y0, x1, y1) => out.push(`<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="#000" stroke-opacity="0.38" stroke-width="2"/>`);
    for (let i = 1; i < wins.length; i++) { const zp = (wins[i - 1][0] + wins[i][1]) / 2; seam(sx(zp, side), sy(D.belt - 0.06, band), sx(zp, side), sy(D.y0 + 0.1, band)); }
    seam(sx(D.zr, side), sy(D.y0 + 0.16, band), sx(D.zf, side), sy(D.y0 + 0.16, band));
    const box2 = (z0, z1, y0, y1) => { seam(sx(z0, side), sy(y0, band), sx(z1, side), sy(y0, band)); seam(sx(z0, side), sy(y1, band), sx(z1, side), sy(y1, band)); seam(sx(z0, side), sy(y0, band), sx(z0, side), sy(y1, band)); seam(sx(z1, side), sy(y0, band), sx(z1, side), sy(y1, band)); };
    box2(D.zr + 0.12, D.zr + 1.0, D.y0 + 0.2, D.belt + 0.55);
    box2(D.zRA - D.ra - 1.1, D.zRA - D.ra - 0.15, D.y0 + 0.2, D.belt - 0.12);
    if (SBS) {
      // dark blue over the window head and the roof; the mid-blue wedge with the yellow line on its upper edge falling
      // from the front roof corner to the window head ~6 m back; a blue wave low over the middle axle to the joint and
      // along the rear body's skirt
      rect(sx(D.zr - 1, side), sy(HB, band), sx(D.zf + 1, side), sy(D.wtop + 0.05, band), DARKB);
      const dir = side === 'L' ? 1 : -1;
      const Xf = sx(D.zf + 0.05, side), Xe = sx(D.zf - 6.2, side), Yh = sy(D.wtop + 0.05, band), Yt = sy(D.y1 - 0.08, band);
      out.push(`<path d="M ${Xf} ${Yh} L ${Xf} ${Yt} C ${Xf + dir * 300} ${Yt}, ${Xe - dir * 320} ${Yh}, ${Xe} ${Yh} Z" fill="${MIDB}"/>`);
      out.push(`<path d="M ${Xf} ${Yt} C ${Xf + dir * 300} ${Yt}, ${Xe - dir * 320} ${Yh}, ${Xe} ${Yh + 3}" fill="none" stroke="${YEL}" stroke-width="17"/>`);
      if (D.zMA != null) {
        const Wa = sx(D.zMA + 2.6, side), Wb = sx(D.zJF + 0.05, side), Ya = sy(D.belt - 0.04, band), Yb = sy(0.78, band);
        out.push(`<path d="M ${Wa} ${Ya} C ${Wa + dir * 140} ${Ya}, ${Wb - dir * 160} ${Yb}, ${Wb} ${Yb} L ${Wb} ${Ya} Z" fill="${MIDB}"/>`);
        out.push(`<path d="M ${Wa} ${Ya + 2} C ${Wa + dir * 140} ${Ya + 2}, ${Wb - dir * 160} ${Yb + 2}, ${Wb} ${Yb + 2}" fill="none" stroke="${DARKB}" stroke-width="16"/>`);
        out.push(`<path d="M ${Wa} ${Ya - 9} C ${Wa + dir * 140} ${Ya - 9}, ${Wb - dir * 160} ${Yb - 12}, ${Wb} ${Yb - 12}" fill="none" stroke="${YEL}" stroke-width="5"/>`);
        // the rear body: the wave runs out low along the skirt
        const Ra = sx(D.zJR - 0.05, side), Rb = sx(D.zr + 0.2, side), Yc = sy(0.78, band), Yd = sy(0.5, band);
        out.push(`<path d="M ${Ra} ${Yc} C ${Ra + dir * 200} ${Yc}, ${Rb - dir * 500} ${Yd}, ${Rb} ${Yd}" fill="none" stroke="${DARKB}" stroke-width="16"/>`);
        out.push(`<path d="M ${Ra} ${Yc - 14} C ${Ra + dir * 200} ${Yc - 14}, ${Rb - dir * 500} ${Yd - 14}, ${Rb} ${Yd - 14}" fill="none" stroke="${MIDB}" stroke-width="9"/>`);
        out.push(sbsMark(sx(D.zJR - 1.9, side), sy(0.98, band), 0.085, kS, kY));
      }
      out.push(sbsMark(sx(D.zFA - 2.3, side), sy(0.86, band), 0.085, kS, kY));
      out.push(txt(sx(D.zf - 0.75, side), sy(D.wtop + 0.13, band), M.fleetNo, 0.1, kS, kY, '#ffffff'));
      if (side === 'L') {
        out.push(mtaRoundel(sx(D.zFA + 1.75, side), sy(0.93, band), 0.065, kS, kY, MIDB));
        out.push(txt(sx(D.zFA + 1.1, side), sy(0.905, band), 'New York City Bus', 0.05, kS, kY, '#ffffff'));
      }
      rect(sx(D.zr - 1, side), sy(0.33, band), sx(D.zf + 1, side), sy(0.25, band), '#16213f');
    } else if (!NEW) {
      // white livery: the blue band under the windows, a thin dark pin line under it
      rect(sx(D.zr - 1, side), sy(D.belt - 0.04, band), sx(D.zf + 1, side), sy(D.belt - 0.34, band), BAND);
      rect(sx(D.zr - 1, side), sy(D.belt - 0.355, band), sx(D.zf + 1, side), sy(D.belt - 0.37, band), '#2a3140');
      const zN = side === 'L' ? D.zf - 1.0 : D.doorF[0] - 0.55;
      out.push(txt(sx(zN, side), sy(D.belt - 0.27, band), M.fleetNo, 0.12, kS, kY, '#ffffff'));
      out.push(mtaRoundel(sx(D.zFA - 1.6, side), sy(D.belt - 0.19, band), 0.11, kS, kY, BAND));
      rect(sx(D.zr - 1, side), sy(0.33, band), sx(D.zf + 1, side), sy(0.25, band), '#2b2d31');
    } else {
      // blue livery: the yellow and light-blue swoosh rising from the window head behind the front door over the roof edge
      const z0 = side === 'L' ? D.zf - 1.7 : D.doorF[0] - 0.2;
      const z1 = z0 - 2.4;
      const X0 = sx(z0, side), X1 = sx(z1, side), Yt = sy(D.y1 + 0.2, band), Yw = sy(D.wtop + 0.05, band);
      const dir = side === 'L' ? 1 : -1;   // + = toward the rear on the image
      out.push(`<path d="M ${X0} ${Yw} C ${X0 + dir * 120} ${Yw - 60}, ${X1 - dir * 160} ${Yt + 40}, ${X1} ${Yt} L ${X1 + dir * 260} ${Yt} C ${X1 + dir * 40} ${Yt + 50}, ${X0 + dir * 200} ${Yw - 40}, ${X0 + dir * 330} ${Yw} Z" fill="${LIGHT}"/>`);
      out.push(`<path d="M ${X0 - dir * 6} ${Yw} C ${X0 + dir * 114} ${Yw - 66}, ${X1 - dir * 166} ${Yt + 34}, ${X1 - dir * 6} ${Yt} L ${X1 + dir * 26} ${Yt} C ${X1 - dir * 120} ${Yt + 40}, ${X0 + dir * 140} ${Yw - 50}, ${X0 + dir * 28} ${Yw} Z" fill="${YEL}"/>`);
      // speed lines over the rear arch: light-blue streaks, tapering
      for (let k = 0; k < 7; k++) {
        const y = sy(0.5 + k * 0.085, band), za = D.zRA + 1.6 - k * 0.12, zb = D.zr + 0.3;
        out.push(`<path d="M ${sx(za, side)} ${y} L ${sx(zb, side)} ${y - 6} L ${sx(zb, side)} ${y + 8} L ${sx(za, side)} ${y + 3} Z" fill="${LIGHT}" opacity="${0.85 - k * 0.07}"/>`);
      }
      out.push(txt(sx(D.zf - 0.9, side), sy(D.wtop + 0.12, band), M.fleetNo, 0.09, kS, kY, '#ffffff'));
      out.push(mtaRoundel(sx(D.zFA - 2.0, side), sy(D.wtop + 0.22, band), 0.1, kS, kY, BODY));
      rect(sx(D.zr - 1, side), sy(0.33, band), sx(D.zf + 1, side), sy(0.25, band), '#16213f');
    }
  }
  // front
  {
    rect(0, 1280, 1024, 1920, BODY);
    rect(fx(-D.hx), fy(D.ws.y1 + 0.04), fx(D.hx), fy(D.ws.y0 - 0.04), WINDOW);   // around the windshield
    // the Xcelsior's black windscreen surround dips in a curve at the middle of its lower edge (6143, 6186, 7629)
    if (M.front === 'xd40') out.push(`<path d="M ${fx(-D.ws.x - 0.06)} ${fy(D.ws.y0 - 0.03)} Q ${fx(0)} ${fy(D.ws.y0 - 0.3)} ${fx(D.ws.x + 0.06)} ${fy(D.ws.y0 - 0.03)} Z" fill="${WINDOW}"/>`);
    rect(fx(-D.hx), fy(D.y1 + 0.3), fx(D.hx), fy(D.sign.y0 - 0.03), WINDOW);       // sign band
    if (SBS) {
      // the dark blue cap over the sign; the wordmark between the headlamps, the roundel over it, the fleet number left
      rect(fx(-D.hx), fy(HB), fx(D.hx), fy(D.sign.y1 + 0.035), DARKB);
      out.push(sbsMark(fx(0), fy(0.9), 0.085, kF, kY));
      out.push(mtaRoundel(fx(0.18), fy(1.1), 0.07, kF, kY, MIDB));
      out.push(txt(fx(-0.78), fy(1.08), M.fleetNo, 0.085, kF, kY, '#ffffff'));
    } else if (!NEW) {
      rect(fx(-D.hx), fy(D.ws.y0 - 0.06), fx(D.hx), fy(D.ws.y0 - 0.36), BAND);
      out.push(txt(fx(-0.5), fy(D.ws.y0 - 0.27), M.fleetNo, 0.12, kF, kY, '#ffffff'));
      out.push(mtaRoundel(fx(0.22), fy(D.ws.y0 - 0.21), 0.1, kF, kY, BAND));
    } else {
      out.push(txt(fx(-0.62), fy(D.ws.y0 - 0.14), M.fleetNo, 0.09, kF, kY, '#ffffff'));
      out.push(mtaRoundel(fx(0), fy(0.9), 0.11, kF, kY, BODY));
    }
    rect(fx(-D.hx), fy(0.32), fx(D.hx), fy(0.25), '#1b1c1f');
  }
  // rear
  {
    rect(1024, 1280, 2048, 1920, BODY);
    // SBS: the yellow cap down to the lamp tops, light blue under it with the wordmark (6206, 6229)
    if (SBS) {
      rect(kx(D.hx), fy(HB), kx(-D.hx), fy(1.45), YELR);
      // the engine-air louvres across the top of the cap, painted over (6206): darker slat lines either side of the sign
      for (let y = 2.66; y < 2.93; y += 0.035) for (const [xa, xb] of [[0.98, D.rearSign.x + 0.06], [-D.rearSign.x - 0.06, -0.98]])
        rect(kx(xa), fy(y + 0.012), kx(xb), fy(y), '#b8861a');
      out.push(mtaRoundel(kx(0.98), fy(2.47), 0.06, kF, kY, '#1b2a5c'));
      out.push(txt(kx(0.62), fy(2.445), 'New York City Bus', 0.045, kF, kY, '#1b2a5c'));
      out.push(txt(kx(-0.82), fy(2.42), M.fleetNo, 0.1, kF, kY, '#1b2a5c'));
      out.push(sbsMark(kx(0), fy(1.02), 0.09, kF, kY));
    }
    // the tail advertising frame (an invented advertiser) over the engine door
    // (the SBS rear carries a smaller one, as on 6206)
    const ax0 = kx(SBS ? 0.6 : 0.95), ax1 = kx(SBS ? -0.6 : -0.95), ay0 = fy(SBS ? 2.22 : 2.3), ay1 = fy(SBS ? 1.8 : 1.55);
    rect(ax0, ay0, ax1, ay1, '#202326');
    rect(ax0 + 6, ay0 + 6, ax1 - 6, ay1 - 6, '#f4f1e8');
    out.push(txt((ax0 + ax1) / 2, fy(SBS ? 2.05 : 2.0), 'HARLEM FRESH', SBS ? 0.09 : 0.13, kF, kY, '#c8202c'));
    out.push(txt((ax0 + ax1) / 2, fy(SBS ? 1.89 : 1.75), 'groceries to your door', SBS ? 0.045 : 0.06, kF, kY, '#222222', { weight: 'normal' }));
    if (!NEW && !SBS) rect(kx(D.hx), fy(1.42), kx(-D.hx), fy(1.18), BAND);
    if (!SBS) out.push(txt(kx(0), fy(1.3), M.fleetNo, 0.08, kF, kY, NEW ? '#ffffff' : '#ffffff'));
    rect(kx(D.hx), fy(0.32), kx(-D.hx), fy(0.25), '#1b1c1f');
  }
  // roof
  rect(0, 1920, 2048, 2048, SBS ? DARKB : NEW ? BODY : '#e8e7e1');
  out.push('</svg>');
  return out.join('\n');
}

function detailSVG() {
  const out = ['<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">', '<rect width="1024" height="1024" fill="#101113"/>'];
  let k = 0;
  for (const [, col] of Object.entries(SOLID)) { const cx = k % 16, cy = Math.floor(k / 16); out.push(`<rect x="${cx * 64}" y="${cy * 64}" width="64" height="64" fill="${col}"/>`); k++; }
  // mirror stripes: red / white diagonals
  out.push('<clipPath id="cs"><rect x="0" y="256" width="256" height="256"/></clipPath><g clip-path="url(#cs)"><rect x="0" y="256" width="256" height="256" fill="#f2f2ee"/>');
  for (let i = -6; i < 8; i++) out.push(`<path d="M ${i * 48} 512 L ${i * 48 + 24} 512 L ${i * 48 + 280} 256 L ${i * 48 + 256} 256 Z" fill="#c4161c"/>`);
  out.push('</g>');
  // NY plate (invented number): gold-yellow field, dark blue legend
  out.push('<rect x="256" y="256" width="256" height="128" rx="10" fill="#f0b323"/><rect x="262" y="262" width="244" height="116" rx="8" fill="none" stroke="#1d2a5c" stroke-width="3"/>');
  out.push('<text x="384" y="282" font-family="Liberation Sans, sans-serif" font-weight="bold" font-size="16" fill="#1d2a5c" text-anchor="middle">NEW YORK</text>');
  out.push('<text x="384" y="345" font-family="Liberation Sans, sans-serif" font-weight="bold" font-size="58" fill="#1d2a5c" text-anchor="middle">4817 BC</text>');
  out.push('<text x="384" y="372" font-family="Liberation Sans, sans-serif" font-size="13" fill="#1d2a5c" text-anchor="middle">OMNIBUS</text>');
  // floor: black rubber with the yellow edge line
  out.push('<rect x="512" y="256" width="512" height="256" fill="#25272b"/><rect x="512" y="256" width="40" height="256" fill="#e8b800"/><rect x="984" y="256" width="40" height="256" fill="#e8b800"/>');
  // louvre slats
  out.push('<rect x="0" y="512" width="512" height="256" fill="#151618"/>');
  for (let y = 512; y < 768; y += 16) out.push(`<rect x="0" y="${y}" width="512" height="7" fill="#3a3d42"/>`);
  out.push('</svg>');
  return out.join('\n');
}

// LED dot matrix: render the text small, threshold to a dot grid, draw round dots
async function ledRows(routes = ROUTES) {
  const W = 1024, H = 2048;
  const px = Buffer.alloc(W * H * 3, 0);
  // the unlit dot grid wherever a sign is (the dark board shows its dots by day)
  const dotField = (x0, y0, x1, y1, pitch) => {
    for (let y = y0 + pitch / 2; y < y1; y += pitch) for (let x = x0 + pitch / 2; x < x1; x += pitch) {
      const r = pitch * 0.32;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const X = Math.round(x + dx), Y = Math.round(y + dy);
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const i = (Y * W + X) * 3; px[i] = 26; px[i + 1] = 20; px[i + 2] = 12;
      }
    }
  };
  // text -> mask at the dot resolution, then lit dots
  const drawText = async (lines, x0, y0, x1, y1, cols, rows, color) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols}" height="${rows}"><rect width="${cols}" height="${rows}" fill="#000"/>${lines.map((l) => {
      // squeeze a long line across instead of trusting textLength (the rasteriser ignored it: 'LA GUARDIA AIRPORT' ran off
      // the board): ~0.6 em a glyph in the condensed bold face
      const k = l.len ? Math.min(1, l.len / (0.7 * l.size * l.t.length)) : 1;
      return `<text transform="translate(${l.x},${l.y}) scale(${k.toFixed(3)},1)" x="0" y="0" font-family="${l.font || 'DejaVu Sans Condensed, DejaVu Sans, sans-serif'}" font-weight="bold" font-size="${l.size}" fill="#fff" ${l.anchor ? `text-anchor="${l.anchor}"` : ''}>${esc(l.t)}</text>`;
    }).join('')}</svg>`;
    const m = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer();
    const pw = (x1 - x0) / cols, ph = (y1 - y0) / rows;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (m[j * cols + i] < 110) continue;
      const cx = x0 + (i + 0.5) * pw, cy = y0 + (j + 0.5) * ph, r = Math.min(pw, ph) * 0.42;
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r + 0.5) continue;
        const a = Math.max(0, Math.min(1, r + 0.5 - d));
        const X = Math.round(cx + dx), Y = Math.round(cy + dy);
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const k = (Y * W + X) * 3;
        px[k] = Math.max(px[k], color[0] * a); px[k + 1] = Math.max(px[k + 1], color[1] * a); px[k + 2] = Math.max(px[k + 2], color[2] * a);
      }
    }
  };
  const fill = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 3; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; } };
  const AMBER = [255, 158, 24];
  for (let r = 0; r < routes.length; r++) {
    const R = routes[r], y0 = r * 256;
    // front sign 160 x 24 dots: the route number in tall characters, the destination in two lines beside it
    dotField(0, y0, 1024, y0 + 128, 1024 / 160);
    const w2 = () => 104;
    // the SBS buses' full-colour boards: route red, '+SELECT BUS' sky blue, the destination amber
    const sbs = /SELECT/.test(R.dest + R.via);
    const C1 = sbs ? [255, 70, 40] : AMBER, C2 = sbs && /SELECT/.test(R.dest) ? [70, 190, 255] : AMBER;
    await drawText([{ t: R.num, x: 1, y: 21, size: 22, len: 50 }], 0, y0, 1024, y0 + 128, 160, 24, C1);
    await drawText([{ t: R.dest, x: 55, y: 10, size: 11, len: w2(R.dest) }], 0, y0, 1024, y0 + 128, 160, 24, C2);
    await drawText([{ t: R.via, x: 55, y: 22, size: 11, len: w2(R.via) }], 0, y0, 1024, y0 + 128, 160, 24, AMBER);
    // curb-side sign 128 x 16 dots
    dotField(0, y0 + 128, 512, y0 + 192, 512 / 128);
    await drawText([{ t: R.num, x: 1, y: 14, size: 15, len: 34 }, { t: R.side, x: 38, y: 12, size: 11, len: 88 }], 0, y0 + 128, 512, y0 + 192, 128, 16, AMBER);
    // rear: the route number alone, 48 x 12 dots
    dotField(512, y0 + 128, 768, y0 + 192, 256 / 48);
    await drawText([{ t: R.num, x: 24, y: 11, size: 12, len: 38, anchor: 'middle' }], 512, y0 + 128, 768, y0 + 192, 48, 12, AMBER);
    // light strip (cool white LED), amber clearance lamp, dark: repeated on every page (a page pick moves them too)
    fill(0, y0 + 196, 512, y0 + 220, [228, 234, 248]);   // the cabin's LED strips (lit day and night: the sign class)
    fill(560, y0 + 196, 668, y0 + 220, [255, 150, 20]);
    fill(768, y0 + 196, 870, y0 + 220, [6, 6, 6]);
  }
  return sharp(px, { raw: { width: W, height: H, channels: 3 } }).png();
}

// ---------------------------------------------------------------- GLB writer
async function writeKind(kind) {
  const t0 = Date.now();
  const M = MAKES[kind], G = derive(M), D = G;
  // one set of three LoDs per body: LOD0..LOD2 (the front body, or the whole rigid bus), REAR_LOD0..REAR_LOD2
  const sets = G.secs.map((s2, si) => [0, 1, 2].map((q) => build(kind, q, si)));
  const lods = sets.flat();
  const hubs = sets.flatMap((set) => set[0].hubs).sort((a, b) => a.id - b.id);
  // textures
  const rset = M.routes === 'sbs' ? 'sbs60' : 'bus40', routes = routesOf(kind);
  const liv = path.join(WORK, `${kind}_livery.png`), det = path.join(WORK, 'bus40_detail.png'), glo = path.join(WORK, `${rset}_glow.png`);
  await sharp(Buffer.from(liverySVG(kind))).png().toFile(liv);
  await sharp(Buffer.from(detailSVG())).png().toFile(det);
  await (await ledRows(routes)).toFile(glo);
  const doc = new Document();
  const buf = doc.createBuffer();
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  const ccExt = doc.createExtension(KHRMaterialsClearcoat);
  const esExt = doc.createExtension(KHRMaterialsEmissiveStrength);
  const tex = async (file, name, kind2, size) => {
    const r = await makeTexture(file, { kind: kind2, size, mode: 'uastc' });
    return doc.createTexture(name).setImage(r.bytes).setMimeType('image/ktx2').setURI(`${name}.ktx2`);
  };
  const tLiv = await tex(liv, `${kind}_livery`, 'color', 2048);
  const tDet = await tex(det, 'bus40_detail', 'color', 1024);
  const tGlo = await tex(glo, `${rset}_signs`, 'color', 2048);
  const mats = {};
  const mk = (key, name, cls, f) => { const m = doc.createMaterial(name); f(m); m.setExtras({ cls }); mats[key] = m; };
  mk('paint', `${kind}:paint`, 'paint', (m) => {
    m.setBaseColorTexture(tLiv).setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(0.35);
    m.setExtension('KHR_materials_clearcoat', ccExt.createClearcoat().setClearcoatFactor(1).setClearcoatRoughnessFactor(0.05));
  });
  mk('dark', 'bus40:detail', 'detail', (m) => m.setBaseColorTexture(tDet).setMetallicFactor(0).setRoughnessFactor(0.62));
  // NY plates: sim/fleet24.js draws them per instance into a material named *LicensePlate* (CARLA's plate-sheet cell UVs)
  mk('plate', 'bus40:LicensePlate', 'detail', (m) => m.setBaseColorTexture(tDet).setMetallicFactor(0).setRoughnessFactor(0.4));
  mk('metal', 'bus40:metal', 'detail', (m) => m.setBaseColorTexture(tDet).setMetallicFactor(1).setRoughnessFactor(0.3));
  mk('glow', `${rset}:sign`, 'sign', (m) => {
    m.setBaseColorTexture(tGlo).setMetallicFactor(0).setRoughnessFactor(0.4).setEmissiveTexture(tGlo).setEmissiveFactor([1, 1, 1]);
    m.setExtension('KHR_materials_emissive_strength', esExt.createEmissiveStrength().setEmissiveStrength(2.2));
  });
  mk('glass', 'bus40:glass', 'glass', (m) => m.setBaseColorFactor([0.02, 0.025, 0.03, 0.35]).setAlphaMode('BLEND').setMetallicFactor(0).setRoughnessFactor(0.03));
  mk('lens', 'bus40:lens', 'lens', (m) => m.setBaseColorFactor([0.9, 0.9, 0.9, 0.12]).setAlphaMode('BLEND').setMetallicFactor(0).setRoughnessFactor(0.02));
  mk('lamp', 'bus40:lamp', 'lamp', (m) => m.setBaseColorFactor([0.85, 0.85, 0.85, 1]).setMetallicFactor(0.6).setRoughnessFactor(0.2));
  mk('lampInner', 'bus40:lampInner', 'lampInner', (m) => m.setBaseColorFactor([0.02, 0.02, 0.02, 1]).setMetallicFactor(0.2).setRoughnessFactor(0.25));
  const scene = doc.createScene(kind);
  const root = doc.createNode(kind);
  scene.addChild(root);
  const counts = {};
  const meshOf = (lod) => {
    const mesh = doc.createMesh(lod.name);
    for (const b of lod.b.values()) {
      if (!b.idx.length) continue;
      const p = doc.createPrimitive().setMaterial(mats[b.mat]);
      const acc = (arr, type, Ctor = Float32Array) => doc.createAccessor().setType(type).setArray(new Ctor(arr)).setBuffer(buf);
      p.setAttribute('POSITION', acc(b.pos, 'VEC3'));
      p.setAttribute('NORMAL', acc(b.nrm, 'VEC3'));
      p.setAttribute('TEXCOORD_0', acc(b.uv, 'VEC2'));
      if (b.wheel.some((w) => w)) p.setAttribute('_WHEEL', acc(b.wheel, 'SCALAR'));
      if (b.lamp.some((w) => w)) p.setAttribute('_LAMP', acc(b.lamp, 'SCALAR'));
      if (b.artic.some((w) => w)) p.setAttribute('_ARTIC', acc(b.artic, 'SCALAR'));
      p.setIndices(acc(b.idx, 'SCALAR', b.pos.length / 3 > 65535 ? Uint32Array : Uint16Array));
      mesh.addPrimitive(p);
    }
    counts[lod.name] = Math.round(lod.tris());
    console.log(`  ${lod.name}: ` + [...lod.b.values()].map((b) => `${b.mat} ${b.idx.length / 3}`).join(', '));
    return mesh;
  };
  if (!M.art) for (const { lod } of lods) root.addChild(doc.createNode(lod.name).setMesh(meshOf(lod)));
  else for (let q = 0; q < 3; q++) {
    // articulated: LOD<q> holds the front body (LOD<q>_front) and the bellows (LOD<q>_joint, weighted by _ARTIC);
    // REAR_LOD<q> is the rear body (towed about the turntable)
    const F = sets[0][q], R = sets[1][q];
    const grp = doc.createNode('LOD' + q);
    F.lod.name = 'LOD' + q + '_front';
    grp.addChild(doc.createNode(F.lod.name).setMesh(meshOf(F.lod)));
    if (R.joint) grp.addChild(doc.createNode(R.joint.name).setMesh(meshOf(R.joint)));
    root.addChild(grp);
    root.addChild(doc.createNode(R.lod.name).setMesh(meshOf(R.lod)));
  }
  // overall envelope from LOD0 of every body (mirrors included)
  const bb = { mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] };
  for (const set of sets) for (const b of set[0].lod.b.values()) for (let i = 0; i < b.pos.length; i += 3) for (let k = 0; k < 3; k++) { bb.mn[k] = Math.min(bb.mn[k], b.pos[i + k]); bb.mx[k] = Math.max(bb.mx[k], b.pos[i + k]); }
  const size = [bb.mx[0] - bb.mn[0], Math.max(M.H, bb.mx[1]), M.L].map((v) => +v.toFixed(3));   // bumper to bumper (the mirrors reach ~0.3 m further)
  const allDoors = G.secs.flatMap((s2) => s2.doors).map((d) => d.map((v) => +v.toFixed(3)));
  const art = M.art ? {
    // the rear body turns about the vertical axis through `turntable` (its centre, in this frame); both bodies are
    // modelled at the straight-ahead pose; `rearLength` = turntable to the rear bumper. Not named `pivot`: three.js r185's
    // GLTFLoader reads a node's extras.pivot as GLTFExporter's pivot container (GLTFLoader.js ~4244) and moves the node
    // and its first child (the front body sank 1.5 m in the showroom)
    turntable: [0, 0.55, +G.pivotZ.toFixed(3)], rearLength: +(G.pivotZ + M.L / 2).toFixed(3), wheelbaseRear: M.wbR,
    articulated: { front: 'LOD0 LOD1 LOD2: the front body, axles 1 (steering, hubs 1-2) and 2 (middle, duals, hubs 3-4)',
      rear: 'REAR_LOD0 REAR_LOD1 REAR_LOD2: the rear body with the bellows and the turntable plate, axle 3 (duals, hubs 5-6, _wheel 5/6)',
      bellows: [+G.zJR.toFixed(3), +G.zJF.toFixed(3)], frontBody: [+G.zJF.toFixed(3), +(M.L / 2).toFixed(3)], rearBody: [+(-M.L / 2).toFixed(3), +G.zJR.toFixed(3)] },
  } : {};
  root.setExtras({
    kind, model: M.title, size, hubs, wheelbase: M.wb, lights: null,
    axles: M.art ? { front: +G.zFA.toFixed(3), mid: +G.zMA.toFixed(3), rear: +G.zRA.toFixed(3), midDual: true, rearDual: true } : { front: +G.zFA.toFixed(3), rear: +G.zRA.toFixed(3), rearDual: true },
    doors: { side: 'right (-X)', list: allDoors, front: allDoors[0], rear: allDoors[allDoors.length - 1] },
    // one cell per route and direction (E / W = the bus's direction on 125th Street, from the GTFS stop order: M101 0 = W
    // to Fort George, 1 = E to the East Village; M125 0 = E to The Hub, 1 = W; M60+ 0 = E to LaGuardia, 1 = W; the M100's
    // E / W are not verified). The sign meshes' UVs are on cell 0; cell k: v + k / rows (glTF v, from the top)
    signs: { cols: 1, rows: 8, cells: M.routes === 'sbs' ? { 'M60 E': 0, 'M60 W': 1, 'M60 E via': 2, 'M60 W via': 3, 'M125 E': 4, 'M125 W': 5, 'M101 W': 6, 'M101 E': 7 }
      : { 'M101 W': 0, 'M101 E': 1, 'M125 E': 2, 'M125 W': 3, 'M100 W': 4, 'M100 E': 5, 'M101 W local': 6, 'M101 E local': 7 },
      pages: routes.map((r) => `${r.num} ${r.dest} ${r.via}`), page: M.route, pageV: PAGE,
      atlas: `${rset}_signs 1024 x 2048: ${routes.length} pages of 256 px from v = 0 (front sign 1024 x 128 px; curb-side sign and rear number in the next 64 px row; light strip, amber lamp)` },
    ...art,
    source: 'Valdrada BUS40 / BUSES, modelled from scratch (client/tools/ar34/vehicles/bus40/build_bus40.mjs)', built: new Date().toISOString(),
  });
  await doc.transform(prune(), dedup());
  await MeshoptEncoder.ready;
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  fs.mkdirSync(OUT, { recursive: true });
  const outFile = path.join(OUT, `${kind}.glb`);
  fs.writeFileSync(outFile, await io.writeBinary(doc));
  console.log(`${kind}: ${M.title} size ${size.join(' x ')} m, axles z ${hubs.filter((h) => h.id % 2).map((h) => h.p[2].toFixed(2)).join(' / ')}, LOD tris ${Object.entries(counts).map(([k, v]) => k + ' ' + v).join(', ')}, ` +
    `materials ${[...lods[0].lod.b.keys()].join(',')} -> ${path.relative(ROOT, outFile)} ${(fs.statSync(outFile).size / 1048576).toFixed(2)} MB in ${((Date.now() - t0) / 1000).toFixed(1)} s` +
    (M.art ? `, turntable z ${G.pivotZ.toFixed(3)}, bellows ${G.zJR.toFixed(2)}..${G.zJF.toFixed(2)}` : ''));
}

const which = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] || '').startsWith('--out'));
const list = !which.length || which[0] === 'all' ? Object.keys(MAKES) : which;
for (const k of list) {
  if (!MAKES[k]) { console.error('unknown kind', k); continue; }
  await writeKind(k);
}
