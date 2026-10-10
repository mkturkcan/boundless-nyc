// MTA New Flyer Xcelsior XD60 (60-ft articulated, Select Bus Service livery) -> client/public/models/fleet24/mtaxd60.glb
//   node client/tools/ar34/vehicles/bus60/build_mtaxd60.mjs [--out <dir>] [--route M60]
//
// Built from scratch to the published dimensions (New Flyer Xcelsior infobox, en.wikipedia.org "New Flyer Xcelsior":
// 60 ft 10 in over bumpers = 18.54 m, 102 in = 2.59 m wide, 10 ft 6 in = 3.20 m high (diesel), wheelbases 229 in =
// 5.82 m front and 293 in = 7.44 m rear). Overhangs, window / door stations and heights are read off the side
// photographs listed in docs/notes/ar34-veh-bus60.md (estimates, not drawings).
//
// Format (sim/fleet24.js): +Z forward, +Y up, origin at the ground centre, right (door) side at -X, metres. Three LoD
// nodes LOD0 / LOD1 / LOD2, each with three child nodes: LOD<n>_front (front body with the front and middle axles),
// LOD<n>_rear (rear body with the drive axle), LOD<n>_joint (bellows and turntable). The turntable pivot (vertical
// axis) is at x 0, z PIVOT_Z (root extras.pivot): the rear body turns about it; joint vertices carry `_ARTIC`
// 0 (front ring) .. 1 (rear ring) so a runtime can bend the bellows by w * angle about the same pivot.
// `_WHEEL`: 1 FL, 2 FR (front axle, steered), 3 ML, 4 MR (middle axle), 5 RL, 6 RR (rear drive axle, duals) - six hubs
// in extras.hubs. `_LAMP`: fleet24.js ROLE (1 head, 2/3 front blinkers L/R, 4 tail+brake, 5/6 rear blinkers, 7 reverse).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { paintAtlasSVG, detailAtlasSVG, dswUV, signUV, PX, ROWH, COLX, EPX, PSW } from './livery.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const areq = createRequire(path.join(ROOT, 'tools/assets/package.json'));
const { Document, NodeIO } = areq('@gltf-transform/core');
const { ALL_EXTENSIONS, KHRMaterialsClearcoat, KHRTextureBasisu, KHRMaterialsEmissiveStrength } = areq('@gltf-transform/extensions');
const { meshopt, prune, dedup } = areq('@gltf-transform/functions');
const { MeshoptEncoder } = areq('meshoptimizer');
const sharp = areq('sharp');
const { makeTexture } = await import(pathToFileURL(path.join(ROOT, 'tools/assets/lib/tex.mjs')).href);

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('out', path.join(ROOT, 'client/public/models/fleet24'));
const ROUTE = opt('route', 'M60');
const FLEET_NO = opt('fleet', '6127');
const TEXDIR = (process.env.ASSET_TOOLS || '/data0/projectnyc_aux/.tools') + '/liveries/bus60';

// ---------------------------------------------------------------- dimensions (m)
const LEN = 18.54, HW = 1.295, ZF = LEN / 2, ZR = -LEN / 2;
const R = 0.18;                                     // body edge radius (roof edges, plan corners)
const Y_SKIRT = 0.30, Y_BELT = 1.14, Y_WB = 1.24, Y_WT = 2.32, Y_WALL = 2.80, Y_TOP = Y_WALL + R;
const Y_FLOOR = 0.38, Y_CEIL = 2.70;
const AX = { front: ZF - 2.50, mid: ZF - 2.50 - 5.82 };   // 6.77, 0.95
AX.rear = AX.mid - 7.44;                                    // -6.49
const WR = 0.50;                                    // 305/70R22.5: 0.998 m diameter
const PIVOT_Z = AX.mid - 1.60;                      // turntable, from the side photographs (6192): bellows starts ~1 m behind the mid axle
const J0 = -0.08, J1 = -1.22;                       // front body ends / rear body starts (the bellows between)
const SEC = { front: { zA: ZF, zB: J0 }, rear: { zA: J1, zB: ZR } };
const ARCH_R = 0.56;
// door side (-X): [z0, z1] openings; windows [z0, z1] per side and body
const DOORS = { front: [[7.72, 8.92], [1.72, 2.92]], rear: [[-4.35, -3.15]] };
const WIN = {
  L: { front: [[7.62, 8.98], [6.12, 7.52], [4.62, 6.02], [3.12, 4.52], [1.62, 3.02], [0.04, 1.52]], rear: [[-2.72, -1.34], [-4.22, -2.82], [-5.72, -4.32], [-7.22, -5.82], [-8.52, -7.32]] },
  R: { front: [[6.10, 7.56], [4.62, 6.00], [3.06, 4.52], [0.04, 1.62]], rear: [[-3.05, -1.34], [-5.85, -4.45], [-7.42, -5.95], [-8.52, -7.52]] },
};
const DOOR_TOP = 2.44;

// ---------------------------------------------------------------- mesh accumulation
// buckets per LoD: key `${sec}|${mat}`
let CUR = null;
function bucket(sec, mat) {
  const k = sec + '|' + mat;
  if (!CUR.has(k)) CUR.set(k, { sec, mat, pos: [], nrm: [], uv: [], idx: [], wheel: [], lamp: [], artic: [] });
  return CUR.get(k);
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// m: { P: [Vector3], N: [Vector3], U: [[u, v]] | null, I: [i...] }; uv(p, n) overrides; wheel / lamp constants;
// artic: number or fn(p). Triangles are re-wound to agree with the supplied normals (outward).
function emit(sec, mat, m, o = {}) {
  const b = bucket(sec, mat);
  const base = b.pos.length / 3;
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), gn = new THREE.Vector3(), an = new THREE.Vector3();
  const tris = [];
  for (let k = 0; k < m.I.length; k += 3) {
    const a = m.I[k], c1 = m.I[k + 1], c2 = m.I[k + 2];
    e1.subVectors(m.P[c1], m.P[a]); e2.subVectors(m.P[c2], m.P[a]); gn.crossVectors(e1, e2);
    if (gn.lengthSq() < 1e-14) continue;
    an.copy(m.N[a]).add(m.N[c1]).add(m.N[c2]);
    if (gn.dot(an) < 0) tris.push(a, c2, c1); else tris.push(a, c1, c2);
  }
  let N = m.N;
  if (o.smooth) {
    // area-weighted vertex normals from the re-wound triangles (the bellows' folds)
    N = m.P.map(() => new THREE.Vector3());
    for (let k = 0; k < tris.length; k += 3) {
      const a = tris[k], c1 = tris[k + 1], c2 = tris[k + 2];
      e1.subVectors(m.P[c1], m.P[a]); e2.subVectors(m.P[c2], m.P[a]); gn.crossVectors(e1, e2);
      N[a].add(gn); N[c1].add(gn); N[c2].add(gn);
    }
    N.forEach((n, i) => { if (n.lengthSq() < 1e-20) n.copy(m.N[i]); n.normalize(); });
  }
  for (let i = 0; i < m.P.length; i++) {
    const p = m.P[i], n = N[i];
    b.pos.push(p.x, p.y, p.z);
    b.nrm.push(n.x, n.y, n.z);
    const uv = o.uv ? o.uv(p, n) : (m.U ? m.U[i] : [0, 0]);
    b.uv.push(uv[0], uv[1]);
    b.wheel.push(o.wheel || 0);
    b.lamp.push(o.lamp || 0);
    b.artic.push(typeof o.artic === 'function' ? o.artic(p) : (o.artic ?? (sec === 'rear' ? 1 : 0)));
  }
  for (const t of tris) b.idx.push(base + t);
}
// three geometry -> mesh-let (uv v flipped to the glTF convention)
function fromThree(geo, M = null) {
  const g = geo.index ? geo : geo;
  if (M) g.applyMatrix4(M);
  if (!g.attributes.normal) g.computeVertexNormals();
  const P = [], N = [], U = [], I = [];
  const pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv;
  for (let i = 0; i < pa.count; i++) {
    P.push(V(pa.getX(i), pa.getY(i), pa.getZ(i)));
    N.push(V(na.getX(i), na.getY(i), na.getZ(i)).normalize());
    U.push(ua ? [ua.getX(i), 1 - ua.getY(i)] : [0, 0]);
  }
  if (g.index) for (let i = 0; i < g.index.count; i++) I.push(g.index.getX(i));
  else for (let i = 0; i < pa.count; i++) I.push(i);
  return { P, N, U, I };
}
const M4 = () => new THREE.Matrix4();
const box = (sx, sy, sz, x, y, z, M = null) => {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  if (M) g.applyMatrix4(M);
  g.translate(x, y, z);
  return fromThree(g);
};
// rounded box (ExtrudeGeometry of a rounded rectangle, bevelled): plan w x d, height h, sitting on y0
function roundBox(w, d, h, r, bev, x, y0, z, seg = 4) {
  const s = new THREE.Shape();
  const hw = w / 2 - bev, hd = d / 2 - bev, rr = Math.min(r, hw, hd);
  s.moveTo(-hw + rr, -hd); s.lineTo(hw - rr, -hd); s.quadraticCurveTo(hw, -hd, hw, -hd + rr);
  s.lineTo(hw, hd - rr); s.quadraticCurveTo(hw, hd, hw - rr, hd); s.lineTo(-hw + rr, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - rr); s.lineTo(-hw, -hd + rr); s.quadraticCurveTo(-hw, -hd, -hw + rr, -hd);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, h - 2 * bev), bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: seg, curveSegments: seg });
  // shape plane XY, extrusion +Z -> plan XZ, height Y
  g.rotateX(-Math.PI / 2);
  g.translate(x, y0 + bev, z);
  return fromThree(g);
}
const cyl = (r, h, seg, M, open = false) => fromThree(new THREE.CylinderGeometry(r, r, h, seg, 1, open), M);
const sw = (name) => { const uv = dswUV(name); return () => uv; };

// ---------------------------------------------------------------- paint UV mapping (livery.mjs layout)
const SWUV = (k) => [PSW[k][0] / 2048, PSW[k][1] / 2048];
function sideUV(x, y, z) {
  const sec = z > (J0 + J1) / 2 ? 'front' : 'rear';
  const right = x < 0;
  const row = (right ? 2 : 0) + (sec === 'rear' ? 1 : 0);
  const s = SEC[sec];
  const u = (right ? z - s.zB : s.zA - z) * PX;
  const v = row * ROWH + (3.0 - Math.min(3.0, Math.max(0.16, y))) * PX;
  return [Math.max(1, Math.min(1686, u)) / 2048, Math.min(row * ROWH + 510, v) / 2048];
}
function frontUV(x, y) { return [(COLX + (Math.max(-1.295, Math.min(1.295, x)) + 1.295) * EPX) / 2048, ((3.0 - Math.max(0.3, Math.min(3, y))) * EPX) / 2048]; }
function rearUV(x, y) { return [(COLX + (1.295 - Math.max(-1.295, Math.min(1.295, x))) * EPX) / 2048, (400 + (3.0 - Math.max(0.3, Math.min(3, y))) * EPX) / 2048]; }
function paintUV(p, n) {
  if (n.y > 0.8 && Math.abs(p.x) < HW - R + 0.02) return SWUV('blue');
  if (Math.abs(n.z) > Math.abs(n.x) && Math.abs(n.z) > 0.3) {
    if (p.z > 8) return n.y > 0.75 ? SWUV('blue') : frontUV(p.x, p.y);
    if (p.z < -8) return n.y > 0.75 ? SWUV('blue') : rearUV(p.x, p.y);
  }
  return sideUV(p.x, p.y, p.z);
}
const blueUV = () => SWUV('blue');

// ---------------------------------------------------------------- body
// side wall of one body: a ShapeGeometry in (z, y) with the wheel arches and door openings notched from the skirt and
// the windows as holes, placed at x = side * HW
function sideWall(secName, side, lod) {
  const s = SEC[secName];
  const z0 = secName === 'rear' ? ZR + R : s.zB, z1 = secName === 'front' ? ZF - R : s.zA;
  const notches = [];
  for (const [k, zc] of Object.entries(AX)) {
    const inSec = k === 'rear' ? secName === 'rear' : secName === 'front';
    if (inSec) notches.push({ t: 'arch', zc });
  }
  if (side < 0) for (const d of DOORS[secName]) notches.push({ t: 'door', z0: d[0], z1: d[1] });
  notches.sort((a, b) => (a.zc ?? a.z0) - (b.zc ?? b.z0));
  const sh = new THREE.Shape();
  sh.moveTo(z0, Y_SKIRT);
  const aseg = lod === 0 ? 20 : lod === 1 ? 10 : 6;
  for (const n of notches) {
    if (n.t === 'arch') {
      const dy = Y_SKIRT - WR, dz = Math.sqrt(ARCH_R * ARCH_R - dy * dy);
      // from the rear foot (angle pi + b) over the top (pi / 2) to the front foot (-b)
      const beta = Math.atan2(-dy, dz);
      for (let i = 1; i <= aseg; i++) {
        const ang = Math.PI + beta - ((Math.PI + 2 * beta) * i) / aseg;
        sh.lineTo(n.zc + ARCH_R * Math.cos(ang), WR + ARCH_R * Math.sin(ang));
      }
    } else {
      sh.lineTo(n.z0, Y_SKIRT); sh.lineTo(n.z0, DOOR_TOP); sh.lineTo(n.z1, DOOR_TOP); sh.lineTo(n.z1, Y_SKIRT);
    }
  }
  sh.lineTo(z1, Y_SKIRT); sh.lineTo(z1, Y_WALL); sh.lineTo(z0, Y_WALL); sh.lineTo(z0, Y_SKIRT);
  const wins = WIN[side > 0 ? 'L' : 'R'][secName];
  const cr = 0.07;
  for (const [a, b] of wins) {
    const h = new THREE.Path();
    const za = Math.max(a, z0 + 0.03), zb = Math.min(b, z1 - 0.03);
    h.moveTo(za + cr, Y_WB); h.lineTo(zb - cr, Y_WB); h.quadraticCurveTo(zb, Y_WB, zb, Y_WB + cr);
    h.lineTo(zb, Y_WT - cr); h.quadraticCurveTo(zb, Y_WT, zb - cr, Y_WT); h.lineTo(za + cr, Y_WT);
    h.quadraticCurveTo(za, Y_WT, za, Y_WT - cr); h.lineTo(za, Y_WB + cr); h.quadraticCurveTo(za, Y_WB, za + cr, Y_WB);
    sh.holes.push(h);
  }
  const g = new THREE.ShapeGeometry(sh, 3);
  const pa = g.attributes.position;
  const P = [], N = [], I = [];
  for (let i = 0; i < pa.count; i++) { P.push(V(side * HW, pa.getY(i), pa.getX(i))); N.push(V(side, 0, 0)); }
  for (let i = 0; i < g.index.count; i++) I.push(g.index.getX(i));
  emit(secName, 'paint', { P, N, I }, { uv: paintUV });
  return wins;
}
// window frames (black rubber rings), glass panes, transom bars
function windows(secName, side, wins, lod) {
  const s = SEC[secName];
  const z0 = secName === 'rear' ? ZR + R : s.zB, z1 = secName === 'front' ? ZF - R : s.zA;
  const x = side * HW;
  for (const [a, b] of wins) {
    const za = Math.max(a, z0 + 0.03), zb = Math.min(b, z1 - 0.03), zc = (za + zb) / 2, L = zb - za, H = Y_WT - Y_WB;
    // glass, 1.5 cm in from the skin
    const gx = x - side * 0.015;
    emit(secName, 'glass', { P: [V(gx, Y_WB, za), V(gx, Y_WB, zb), V(gx, Y_WT, zb), V(gx, Y_WT, za)], N: Array(4).fill(V(side, 0, 0)), I: [0, 1, 2, 0, 2, 3] });
    if (lod === 2) continue;
    // frame: four bars around the opening, 4 cm wide, 2.5 cm deep (proud of the glass, flush with the skin)
    const fw = 0.04, fd = 0.03, fx = x - side * fd / 2;
    for (const m of [box(fd, fw, L + fw, fx, Y_WB + fw / 2 - 0.005, zc), box(fd, fw, L + fw, fx, Y_WT - fw / 2 + 0.005, zc),
      box(fd, H, fw, fx, (Y_WB + Y_WT) / 2, za + fw / 2 - 0.005), box(fd, H, fw, fx, (Y_WB + Y_WT) / 2, zb - fw / 2 + 0.005)]) emit(secName, 'detail', m, { uv: sw('frame') });
    // the hopper (upper sash) bar a third of the way down, and a slim vertical split on the long panes
    emit(secName, 'detail', box(0.025, 0.035, L - 0.02, x - side * 0.02, Y_WT - H * 0.32, zc), { uv: sw('frame') });
    if (lod === 0 && L > 1.3) emit(secName, 'detail', box(0.02, H * 0.32, 0.03, x - side * 0.02, Y_WT - H * 0.16, zc), { uv: sw('frame') });
  }
}
// roof of one body: the edge arcs and the flat top as one grid along z
function roof(secName, lod) {
  const s = SEC[secName];
  const z0 = secName === 'rear' ? ZR + R : s.zB, z1 = secName === 'front' ? ZF - R : s.zA;
  const n = lod === 0 ? 8 : lod === 1 ? 4 : 2;
  const prof = [];
  for (let i = 0; i <= n; i++) { const a = (Math.PI / 2) * (i / n); prof.push([HW - R + R * Math.cos(a), Y_WALL + R * Math.sin(a), Math.cos(a), Math.sin(a)]); }
  for (let i = 0; i <= n; i++) { const a = Math.PI / 2 + (Math.PI / 2) * (i / n); prof.push([-(HW - R) + R * Math.cos(a), Y_WALL + R * Math.sin(a), Math.cos(a), Math.sin(a)]); }
  const segZ = Math.max(2, Math.round((z1 - z0) / 1.5));
  const P = [], N = [], I = [];
  for (let j = 0; j <= segZ; j++) {
    const z = z0 + ((z1 - z0) * j) / segZ;
    for (const [x, y, nx, ny] of prof) { P.push(V(x, y, z)); N.push(V(nx, ny, 0)); }
  }
  const w = prof.length;
  for (let j = 0; j < segZ; j++) for (let i = 0; i < w - 1; i++) {
    const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
    I.push(a, b, d, a, d, c);
  }
  emit(secName, 'paint', { P, N, I }, { uv: paintUV });
}
// one rounded end of a body (front: dir +1 at ZF, rear: dir -1 at ZR): the face with an optional opening, the top edge
// strip, the two plan corners and the two corner octants
function endCap(secName, dir, lod) {
  const zFace = dir > 0 ? ZF : ZR, zc = zFace - dir * R;
  const n = lod === 0 ? 8 : lod === 1 ? 4 : 2;
  const xi = HW - R;
  const uvf = paintUV;
  // face
  const sh = new THREE.Shape();
  sh.moveTo(-xi, Y_SKIRT); sh.lineTo(xi, Y_SKIRT); sh.lineTo(xi, Y_WALL); sh.lineTo(-xi, Y_WALL); sh.lineTo(-xi, Y_SKIRT);
  if (dir > 0) {
    // the windshield opening (glass, sign box and frame are separate)
    const h = new THREE.Path(); const ox = 1.03, y0 = 1.18, y1 = 2.74, cr = 0.06;
    h.moveTo(-ox + cr, y0); h.lineTo(ox - cr, y0); h.quadraticCurveTo(ox, y0, ox, y0 + cr); h.lineTo(ox, y1 - cr); h.quadraticCurveTo(ox, y1, ox - cr, y1);
    h.lineTo(-ox + cr, y1); h.quadraticCurveTo(-ox, y1, -ox, y1 - cr); h.lineTo(-ox, y0 + cr); h.quadraticCurveTo(-ox, y0, -ox + cr, y0);
    sh.holes.push(h);
  }
  const g = new THREE.ShapeGeometry(sh, 3);
  const pa = g.attributes.position;
  const P = [], N = [], I = [];
  for (let i = 0; i < pa.count; i++) { P.push(V(pa.getX(i), pa.getY(i), zFace)); N.push(V(0, 0, dir)); }
  for (let i = 0; i < g.index.count; i++) I.push(g.index.getX(i));
  emit(secName, 'paint', { P, N, I }, { uv: uvf });
  // top edge strip (axis X)
  {
    const P = [], N = [], I = [];
    for (let i = 0; i <= n; i++) {
      const a = (Math.PI / 2) * (i / n);
      const ny = Math.sin(a), nz = Math.cos(a) * dir;
      P.push(V(-xi, Y_WALL + R * ny, zc + R * nz), V(xi, Y_WALL + R * ny, zc + R * nz)); N.push(V(0, ny, nz), V(0, ny, nz));
      if (i < n) { const k = i * 2; I.push(k, k + 1, k + 3, k, k + 3, k + 2); }
    }
    emit(secName, 'paint', { P, N, I }, { uv: uvf });
  }
  // plan corners (axis Y) and octants
  for (const sx of [-1, 1]) {
    const P = [], N = [], I = [];
    for (let i = 0; i <= n; i++) {
      const a = (Math.PI / 2) * (i / n);
      const nx = Math.sin(a) * sx, nz = Math.cos(a) * dir;
      P.push(V(sx * xi + R * nx, Y_SKIRT, zc + R * nz), V(sx * xi + R * nx, Y_WALL, zc + R * nz)); N.push(V(nx, 0, nz), V(nx, 0, nz));
      if (i < n) { const k = i * 2; I.push(k, k + 1, k + 3, k, k + 3, k + 2); }
    }
    emit(secName, 'paint', { P, N, I }, { uv: uvf });
    const sg = new THREE.SphereGeometry(R, n * 2, n, 0, Math.PI * 2, 0, Math.PI / 2);
    const m = fromThree(sg);
    // keep the octant on the outside corner
    const keepP = [], keepN = [], map = new Map(), keepI = [];
    for (let i = 0; i < m.I.length; i += 3) {
      const t = [m.I[i], m.I[i + 1], m.I[i + 2]];
      const cx = (m.P[t[0]].x + m.P[t[1]].x + m.P[t[2]].x) / 3, cz = (m.P[t[0]].z + m.P[t[1]].z + m.P[t[2]].z) / 3;
      if (cx * sx < 0 || cz * dir < 0) continue;
      for (const vi of t) {
        if (!map.has(vi)) {
          map.set(vi, keepP.length);
          const p = m.P[vi];
          keepP.push(V(sx * xi + p.x, Y_WALL + p.y, zc + p.z)); keepN.push(m.N[vi].clone());
        }
        keepI.push(map.get(vi));
      }
    }
    emit(secName, 'paint', { P: keepP, N: keepN, I: keepI }, { uv: uvf });
  }
}
// flat black end wall of a body at the joint
function jointEnd(secName, z, dir) {
  const sh = new THREE.Shape();
  const xi = HW - R;
  sh.moveTo(-HW, Y_SKIRT); sh.lineTo(HW, Y_SKIRT); sh.lineTo(HW, Y_WALL); sh.quadraticCurveTo(HW, Y_TOP, xi, Y_TOP); sh.lineTo(-xi, Y_TOP); sh.quadraticCurveTo(-HW, Y_TOP, -HW, Y_WALL); sh.lineTo(-HW, Y_SKIRT);
  const g = new THREE.ShapeGeometry(sh, 4);
  const pa = g.attributes.position;
  const P = [], N = [], I = [];
  for (let i = 0; i < pa.count; i++) { P.push(V(pa.getX(i), pa.getY(i), z)); N.push(V(0, 0, dir)); }
  for (let i = 0; i < g.index.count; i++) I.push(g.index.getX(i));
  emit(secName, 'detail', { P, N, I }, { uv: sw('frame') });
}
// bellows: an accordion tube of the body section, inset 4 cm, folds every 4.5 cm; _ARTIC 0..1 front to rear
function bellows(lod) {
  const nCross = lod === 0 ? 14 : lod === 1 ? 6 : 2;
  const xo = HW - 0.05, yb = Y_FLOOR - 0.02, yt = Y_TOP - 0.06, rr = 0.16;
  // closed cross-section loop (counter-clockwise seen from +Z): bottom, right side up, top arcs, left side down
  const loop = [];
  loop.push([-xo, yb, 0, -1], [xo, yb, 0, -1]);
  loop.push([xo, yb, 1, 0], [xo, yt - rr, 1, 0]);
  for (let i = 0; i <= nCross; i++) { const a = (Math.PI / 2) * (i / nCross); loop.push([xo - rr + rr * Math.cos(a), yt - rr + rr * Math.sin(a), Math.cos(a), Math.sin(a)]); }
  for (let i = 0; i <= nCross; i++) { const a = Math.PI / 2 + (Math.PI / 2) * (i / nCross); loop.push([-xo + rr + rr * Math.cos(a), yt - rr + rr * Math.sin(a), Math.cos(a), Math.sin(a)]); }
  loop.push([-xo, yt - rr, -1, 0], [-xo, yb, -1, 0]);
  const folds = lod === 0 ? 25 : lod === 1 ? 10 : 1;
  const rings = lod === 2 ? 1 : folds * 2;
  const P = [], N = [], I = [];
  for (let k = 0; k <= rings; k++) {
    const t = k / rings, z = J0 + (J1 - J0) * t;
    const d = lod === 2 ? 0.02 : (k % 2 === 0 ? 0.0 : 0.045);
    for (const [x, y, nx, ny] of loop) { P.push(V(x - nx * d, y - ny * d, z)); N.push(V(nx, ny, 0)); }
  }
  const w = loop.length;
  for (let k = 0; k < rings; k++) for (let i = 0; i < w - 1; i++) { const a = k * w + i, b = a + 1, c = a + w, d2 = c + 1; I.push(a, b, d2, a, d2, c); }
  // smooth normals over the folds, after winding is fixed (emit re-winds to the outward N)
  emit('joint', 'detail', { P, N, I }, { smooth: true, uv: sw('bellows'), artic: (p) => Math.max(0, Math.min(1, (J0 - p.z) / (J0 - J1))) });
  // turntable disc under the floor and the joint's side covers (black skirts over the bellows foot)
  emit('joint', 'detail', cyl(0.95, 0.06, lod === 0 ? 32 : 12, M4().makeTranslation(0, Y_SKIRT + 0.04, PIVOT_Z)), { uv: sw('turntable'), artic: 0.5 });
  if (lod < 2) for (const sx of [-1, 1]) emit('joint', 'detail', box(0.04, 0.16, J0 - J1 + 0.06, sx * (HW - 0.04), Y_SKIRT + 0.10, (J0 + J1) / 2), { uv: sw('rubber'), artic: (p) => Math.max(0, Math.min(1, (J0 - p.z) / (J0 - J1))) });
}

// ---------------------------------------------------------------- wheels
const HUBS = [];
function tyreProfile(w, r, rIn) {
  // (radius, axial) from the inner bead round the tread to the outer bead
  const h = w / 2;
  // four circumferential tread grooves (1.2 cm deep) across the crown
  const crown = [];
  const gs = [-0.62, -0.22, 0.22, 0.62];
  crown.push([r, -h * 0.78]);
  for (const g of gs) { crown.push([r, h * (g - 0.06)], [r - 0.012, h * (g - 0.035)], [r - 0.012, h * (g + 0.035)], [r, h * (g + 0.06)]); }
  crown.push([r, h * 0.78]);
  return [[rIn, -h * 0.82], [r - 0.09, -h], [r - 0.03, -h * 0.97], [r - 0.008, -h * 0.88], ...crown, [r - 0.008, h * 0.88], [r - 0.03, h * 0.97], [r - 0.09, h], [rIn, h * 0.82]];
}
function lathe(profile, seg, M) {
  const pts = profile.map(([r, a]) => new THREE.Vector2(r, a));
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateZ(-Math.PI / 2);             // lathe axis Y -> X
  return fromThree(g, M);
}
function wheel(secName, id, zc, side, dual, lod) {
  const seg = lod === 0 ? 64 : lod === 1 ? 20 : 10;
  const W1 = 0.305, rIn = 0.29;
  const xo = side * (HW - 0.055 - W1 / 2);         // outer tyre centre, outer sidewall ~5 cm inside the skin
  const xs = dual ? [xo, xo - side * (W1 + 0.035)] : [xo];
  HUBS.push({ id, p: [+xo.toFixed(4), WR, +zc.toFixed(4)], r: WR, w: +(W1 / 2 + (dual ? W1 + 0.035 : 0) + 0.02).toFixed(4) });
  for (const x of xs) {
    const M = M4().makeTranslation(x, WR, zc);
    // the lathe sweeps +X as the outer side when side > 0: mirror for the right side
    if (side < 0) M.multiply(M4().makeScale(-1, 1, 1));
    if (lod === 2) { emit(secName, 'detail', cyl(WR, W1, seg, M4().makeTranslation(x, WR, zc).multiply(M4().makeRotationZ(Math.PI / 2))), { uv: sw('rubber'), wheel: id }); continue; }
    const t = lathe(lod === 0 ? tyreProfile(W1, WR, rIn) : tyreProfile(W1, WR, rIn).filter((q, i, a) => i < 4 || i >= a.length - 4 || Math.abs(q[0] - WR) < 1e-6 && (i === 4 || i === a.length - 5)), seg, M);
    // flip normals for the mirrored copy (a negative scale reverses them)
    emit(secName, 'detail', t, { uv: sw('rubber'), wheel: id });
  }
  if (lod === 2) return;
  // rim on the outer tyre: a dished disc with a raised hub, ten nuts, the hub cap; inner dual shows its own dish
  const xr = xo + side * (W1 / 2 - 0.035);
  const rimProf = [[0.0, -0.002], [0.08, -0.002], [0.10, -0.03], [0.17, -0.045], [0.215, -0.05], [0.235, -0.03], [0.285, -0.02], [0.292, -0.06]];
  const Mr = M4().makeTranslation(xr, WR, zc);
  if (side < 0) Mr.multiply(M4().makeScale(-1, 1, 1));
  // rimProf axial is measured inward from the rim face: lathe gives +X outward after the rotation, so negate
  emit(secName, 'detail', lathe(rimProf, seg, Mr), { uv: sw(dual ? 'steel' : 'rim'), wheel: id });
  // hub boss and cap
  const capM = M4().makeTranslation(xr + side * 0.02, WR, zc).multiply(M4().makeRotationZ(Math.PI / 2));
  emit(secName, 'detail', cyl(0.085, 0.05, lod === 0 ? 24 : 10, capM), { uv: sw('hub'), wheel: id });
  if (lod === 0) {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const nm = M4().makeTranslation(xr + side * 0.012, WR + 0.143 * Math.sin(a), zc + 0.143 * Math.cos(a)).multiply(M4().makeRotationZ(Math.PI / 2));
      emit(secName, 'detail', cyl(0.017, 0.035, 6, nm), { uv: sw('chrome'), wheel: id });
    }
    // hand holes in the dish (dark ovals)
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      const hm = M4().makeTranslation(xr - side * 0.004, WR + 0.20 * Math.sin(a), zc + 0.20 * Math.cos(a)).multiply(M4().makeRotationZ(Math.PI / 2));
      emit(secName, 'detail', cyl(0.028, 0.012, 10, hm), { uv: sw('under'), wheel: id });
    }
  }
}
// wheel-house liner: a half cylinder over each wheel and its inner wall
function wheelHouse(secName, zc, lod) {
  for (const sx of [-1, 1]) {
    const g = new THREE.CylinderGeometry(ARCH_R + 0.02, ARCH_R + 0.02, 0.62, lod === 0 ? 20 : 8, 1, true, 0, Math.PI);
    // open half cylinder: axis Y, theta 0..pi spans +Z.. -Z via +X; rotate so the axis is X and the half is up
    g.rotateZ(Math.PI / 2);
    g.translate(sx * (HW - 0.31), WR, zc);
    emit(secName, 'detail', fromThree(g), { uv: sw('under') });
    emit(secName, 'detail', box(0.02, ARCH_R + 0.1, 2 * ARCH_R + 0.04, sx * (HW - 0.62), WR + (ARCH_R + 0.1) / 2 - 0.05, zc), { uv: sw('under') });
  }
}

// ---------------------------------------------------------------- front, rear, roof gear, lamps, signs
function frontEnd(lod) {
  const z = ZF;
  // windshield (clear: the lens class) with its black surround and the sign box behind its head
  emit('front', 'lens', { P: [V(-1.03, 1.18, z - 0.012), V(1.03, 1.18, z - 0.012), V(1.03, 2.74, z - 0.012), V(-1.03, 2.74, z - 0.012)], N: Array(4).fill(V(0, 0, 1)), I: [0, 1, 2, 0, 2, 3] });
  if (lod < 2) {
    for (const m of [box(2.12, 0.05, 0.03, 0, 1.18, z - 0.01), box(2.12, 0.05, 0.03, 0, 2.74, z - 0.01), box(0.05, 1.6, 0.03, -1.05, 1.96, z - 0.01), box(0.05, 1.6, 0.03, 1.05, 1.96, z - 0.01)]) emit('front', 'detail', m, { uv: sw('frame') });
    // centre post of the split windshield
    emit('front', 'detail', box(0.035, 1.22, 0.02, 0.0, 1.81, z - 0.02), { uv: sw('frame') });
  }
  emit('front', 'detail', box(2.06, 0.32, 0.02, 0, 2.58, z - 0.05), { uv: sw('frame') });
  // the head sign (LEDs) inside the box
  {
    const x0 = -0.93, x1 = 0.93, y0 = 2.47, y1 = 2.70, zz = z - 0.035;
    emit('front', 'detail', { P: [V(x0, y0, zz), V(x1, y0, zz), V(x1, y1, zz), V(x0, y1, zz)], N: Array(4).fill(V(0, 0, 1)), I: [0, 1, 2, 0, 2, 3] },
      { uv: (p) => signUV('front', (p.x - x0) / (x1 - x0), (y1 - p.y) / (y1 - y0)) });
    const r0 = -0.99, r1 = -0.79, ry0 = 1.25, ry1 = 1.33;
    emit('front', 'detail', { P: [V(r0, ry0, zz), V(r1, ry0, zz), V(r1, ry1, zz), V(r0, ry1, zz)], N: Array(4).fill(V(0, 0, 1)), I: [0, 1, 2, 0, 2, 3] },
      { uv: (p) => signUV('run', (p.x - r0) / (r1 - r0), (ry1 - p.y) / (ry1 - ry0)) });
  }
  // bumper: a wrapped black bar with a lower lip
  emit('front', 'detail', roundBox(2.56, 0.20, 0.32, 0.12, 0.03, 0, 0.30, z - 0.02, lod === 0 ? 4 : 2), { uv: sw('bumper') });
  if (lod < 2) emit('front', 'detail', box(2.30, 0.05, 0.12, 0, 0.31, z + 0.05), { uv: sw('bumper') });
  // head lamps: a black housing per side, two projector discs + an LED bar (role head), the blinker at the outer end,
  // a clear cover
  for (const sx of [-1, 1]) {
    const cx = sx * 0.80, cy = 0.78, zf = z + 0.005;
    emit('front', 'lampInner', box(0.46, 0.17, 0.05, cx, cy, z - 0.015), {});
    if (lod < 2) {
      for (const dx of [-0.09, 0.09]) emit('front', 'lamp', cyl(0.05, 0.02, lod === 0 ? 20 : 8, M4().makeTranslation(cx + dx, cy + 0.015, zf).multiply(M4().makeRotationX(Math.PI / 2))), { lamp: 1 });
      emit('front', 'lamp', box(0.30, 0.016, 0.01, cx, cy - 0.06, zf), { lamp: 1 });
      emit('front', 'lamp', box(0.07, 0.10, 0.012, cx + sx * 0.19, cy, zf), { lamp: sx > 0 ? 2 : 3 });
      emit('front', 'lens', box(0.47, 0.18, 0.012, cx, cy, z + 0.02), {});
    } else {
      emit('front', 'lamp', box(0.40, 0.12, 0.01, cx, cy, zf + 0.01), { lamp: 1 });
    }
    // corner side marker (amber)
    emit('front', 'detail', box(0.012, 0.05, 0.10, sx * (HW + 0.002), 0.80, z - 0.35), { uv: sw('amberlamp') });
  }
  // clearance lamps on the cap: three in the middle, one per corner
  for (const x of [-0.16, 0, 0.16, -1.0, 1.0]) emit('front', 'detail', box(0.09, 0.035, 0.025, x, Y_WALL + 0.07, z - 0.02), { uv: sw('amberlamp') });
  // plate (NY, invented) on the nose under the windshield, right of centre
  if (lod < 2) emit('front', 'detail', box(0.31, 0.155, 0.01, 0.55, 1.07, z + 0.006), { uv: sw('chevW') });
  // wipers: two long arms parked up the glass
  if (lod === 0) for (const [px, ang] of [[-0.55, 1.15], [0.35, 1.15]]) {
    const Mw = M4().makeTranslation(px, 1.24, z + 0.012).multiply(M4().makeRotationZ(ang)).multiply(M4().makeTranslation(0.45, 0, 0));
    emit('front', 'detail', box(0.90, 0.018, 0.018, 0, 0, 0, Mw), { uv: sw('wiper') });
    emit('front', 'detail', box(0.80, 0.03, 0.008, 0, -0.012, 0.012, Mw), { uv: sw('wiper') });
  }
  // mirrors: an arm from the cap corner forward and out, the head hanging at the glass's upper third
  if (lod < 2) for (const sx of [-1, 1]) {
    const ax = sx * (HW + 0.02), ay = Y_WALL - 0.05, az = z - 0.25;
    const hx = sx * (HW + 0.28), hy = 2.18, hz = z + 0.30;
    const pts = [V(ax, ay, az), V(sx * (HW + 0.18), ay + 0.04, z + 0.15), V(hx, ay - 0.05, hz), V(hx, hy + 0.22, hz)];
    const curve = new THREE.CatmullRomCurve3(pts);
    emit('front', 'detail', fromThree(new THREE.TubeGeometry(curve, lod === 0 ? 16 : 6, 0.022, lod === 0 ? 8 : 4, false)), { uv: sw('black') });
    emit('front', 'detail', roundBox(0.24, 0.10, 0.40, 0.04, 0.02, hx, hy - 0.2, hz, 2), { uv: sw('black') });
    emit('front', 'detail', box(0.20, 0.34, 0.005, hx, hy, hz - 0.052), { uv: sw('mirror') });
    if (sx < 0 && lod === 0) {
      // the door-side mirror's red / white back panel (M15 6107)
      emit('front', 'detail', box(0.16, 0.16, 0.005, hx, hy + 0.05, hz + 0.052), { uv: sw('chevW') });
      for (let k = 0; k < 3; k++) emit('front', 'detail', box(0.035, 0.17, 0.006, hx - 0.06 + k * 0.06, hy + 0.05, hz + 0.056, M4().makeRotationZ(0.6)), { uv: sw('chevR') });
    }
  }
}
function rearEnd(lod) {
  const z = ZR;
  emit('rear', 'detail', roundBox(2.56, 0.20, 0.30, 0.12, 0.03, 0, 0.30, z + 0.02, lod === 0 ? 4 : 2), { uv: sw('bumper') });
  // tail lamp columns at both corners: amber (blinker), red, red (tail + brake), white (reverse), top to bottom
  for (const sx of [-1, 1]) {
    const cx = sx * 1.06;
    const roles = [sx > 0 ? 5 : 6, 4, 4, 7];
    roles.forEach((role, k) => {
      const cy = 1.36 - k * 0.19;
      emit('rear', 'lampInner', cyl(0.085, 0.03, lod === 0 ? 20 : 8, M4().makeTranslation(cx, cy, z - 0.005).multiply(M4().makeRotationX(Math.PI / 2))), {});
      emit('rear', 'lamp', cyl(0.068, 0.02, lod === 0 ? 20 : 8, M4().makeTranslation(cx, cy, z - 0.018).multiply(M4().makeRotationX(Math.PI / 2))), { lamp: role });
      if (lod === 0) emit('rear', 'lens', fromThree(new THREE.SphereGeometry(0.07, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2.6), M4().makeTranslation(cx, cy, z - 0.012).multiply(M4().makeRotationX(-Math.PI / 2))), {});
    });
    emit('rear', 'detail', box(0.012, 0.05, 0.10, sx * (HW + 0.002), 0.80, z + 0.35), { uv: sw('redlamp') });
  }
  // identification lamps (red) on the cap
  for (const x of [-0.16, 0, 0.16, -1.0, 1.0]) emit('rear', 'detail', box(0.09, 0.035, 0.025, x, Y_WALL + 0.07, z + 0.02), { uv: sw('redlamp') });
  // route number box at the top and the plate
  emit('rear', 'detail', box(0.70, 0.27, 0.03, 0, 2.62, z - 0.005), { uv: sw('frame') });
  {
    const x0 = 0.30, x1 = -0.30, y0 = 2.53, y1 = 2.72, zz = z - 0.022;
    emit('rear', 'detail', { P: [V(x0, y0, zz), V(x1, y0, zz), V(x1, y1, zz), V(x0, y1, zz)], N: Array(4).fill(V(0, 0, -1)), I: [0, 1, 2, 0, 2, 3] },
      { uv: (p) => signUV('rear', (x0 - p.x) / (x0 - x1), (y1 - p.y) / (y1 - y0)) });
  }
  if (lod < 2) {
    emit('rear', 'detail', box(0.31, 0.155, 0.01, 0, 0.72, z - 0.006), { uv: sw('chevW') });
    // engine-bay grille on the door side of the rear body, behind the rear axle
    emit('rear', 'detail', box(0.012, 0.55, 1.2, -(HW + 0.004), 1.65, ZR + 1.1), { uv: sw('grille') });
  }
}
function roofGear(lod) {
  const seg = lod === 0 ? 4 : lod === 1 ? 2 : 1;
  const bev = lod === 2 ? 0 : 0.07;
  // front body: the long HVAC fairing (M15 6107, 6192); rear body: a short pod behind the joint and the rear HVAC
  emit('front', 'paint', roundBox(2.04, 4.4, 0.22, 0.45, bev, 0, Y_TOP - 0.02, ZF - 3.0, seg), { uv: blueUV });
  emit('rear', 'paint', roundBox(1.62, 1.10, 0.20, 0.30, bev, 0, Y_TOP - 0.02, J1 - 0.85, seg), { uv: blueUV });
  emit('rear', 'paint', roundBox(2.10, 3.9, 0.22, 0.45, bev, 0, Y_TOP - 0.02, ZR + 2.55, seg), { uv: blueUV });
  if (lod < 2) {
    // roof hatches and the exhaust stack
    for (const z of [ZF - 7.2, J1 - 2.6]) emit(z > 0 ? 'front' : 'rear', 'detail', box(0.62, 0.05, 0.62, 0, Y_TOP + 0.02, z), { uv: sw('steel') });
    emit('rear', 'detail', cyl(0.06, 0.32, 10, M4().makeTranslation(-0.75, Y_TOP + 0.30, ZR + 0.55)), { uv: sw('black') });
    // HVAC grilles on the pods' flanks
    if (lod === 0) for (const [z, len, sec] of [[ZF - 3.0, 3.0, 'front'], [ZR + 2.55, 2.8, 'rear']]) for (const sx of [-1, 1]) emit(sec, 'detail', box(0.01, 0.10, len, sx * 1.03, Y_TOP + 0.10, z), { uv: sw('grille') });
  }
}
// doors on the door side (-X): two leaves per opening, glass in black frames, recessed 4 cm
function doors(lod) {
  for (const [sec, list] of Object.entries(DOORS)) for (const [z0, z1] of list) {
    const x = -(HW - 0.04), zm = (z0 + z1) / 2, hw = (z1 - z0) / 2;
    for (const [a, b] of [[z0, zm], [zm, z1]]) {
      const zc = (a + b) / 2, L = b - a;
      emit(sec, 'glass', { P: [V(x - 0.01, Y_SKIRT + 0.12, a + 0.05), V(x - 0.01, Y_SKIRT + 0.12, b - 0.05), V(x - 0.01, DOOR_TOP - 0.06, b - 0.05), V(x - 0.01, DOOR_TOP - 0.06, a + 0.05)], N: Array(4).fill(V(-1, 0, 0)), I: [0, 1, 2, 0, 2, 3] });
      if (lod === 2) continue;
      const H = DOOR_TOP - Y_SKIRT;
      for (const m of [box(0.04, 0.06, L, x, DOOR_TOP - 0.03, zc), box(0.04, 0.10, L, x, Y_SKIRT + 0.07, zc), box(0.04, H, 0.06, x, Y_SKIRT + H / 2, a + 0.03), box(0.04, H, 0.06, x, Y_SKIRT + H / 2, b - 0.03), box(0.03, 0.05, L, x, 1.28, zc)]) emit(sec, 'detail', m, { uv: sw('frame') });
    }
    // the rubber nose seal down the middle and the door-top canopy
    if (lod < 2) {
      emit(sec, 'detail', box(0.05, DOOR_TOP - Y_SKIRT, 0.03, x - 0.005, (DOOR_TOP + Y_SKIRT) / 2, zm), { uv: sw('rubber') });
      emit(sec, 'detail', box(0.08, 0.06, 2 * hw + 0.08, -(HW + 0.01), DOOR_TOP + 0.02, zm), { uv: sw('frame') });
    }
    // door stanchions just inside (yellow), both sides of the opening
    if (lod === 0) for (const zz of [z0 - 0.05, z1 + 0.05]) emit(sec, 'detail', cyl(0.017, Y_CEIL - Y_FLOOR, 8, M4().makeTranslation(-(HW - 0.22), (Y_CEIL + Y_FLOOR) / 2, zz)), { uv: sw('stanchion') });
  }
}
// the door-side LED sign inside the first window behind the front door
function sideSign() {
  const x = -(HW - 0.05), z0 = 6.25, z1 = 7.40, y0 = 2.06, y1 = 2.27;
  emit('front', 'detail', box(0.02, y1 - y0 + 0.05, z1 - z0 + 0.05, x + 0.012, (y0 + y1) / 2, (z0 + z1) / 2), { uv: sw('frame') });
  emit('front', 'detail', { P: [V(x, y0, z0), V(x, y0, z1), V(x, y1, z1), V(x, y1, z0)], N: Array(4).fill(V(-1, 0, 0)), I: [0, 1, 2, 0, 2, 3] },
    { uv: (p) => signUV('side', (p.z - z0) / (z1 - z0), (y1 - p.y) / (y1 - y0)) });
}
// side marker lamps and reflectors along the skirts
function markers() {
  for (const z of [4.6, 2.2, -2.2, -4.9]) for (const sx of [-1, 1]) emit(z > 0 ? 'front' : 'rear', 'detail', box(0.012, 0.04, 0.08, sx * (HW + 0.003), 1.02, z), { uv: sw(z > -6 ? 'amberlamp' : 'redlamp') });
}
// ---------------------------------------------------------------- interior
function interior(lod) {
  for (const sec of ['front', 'rear']) {
    const s = SEC[sec];
    const z0 = sec === 'rear' ? ZR + 0.25 : s.zB, z1 = sec === 'front' ? ZF - 0.25 : s.zA;
    const L = z1 - z0, zc = (z0 + z1) / 2, wi = 2 * (HW - 0.05);
    emit(sec, 'detail', box(wi, 0.02, L, 0, Y_FLOOR - 0.01, zc), { uv: sw('floor') });
    emit(sec, 'detail', box(wi, 0.02, L, 0, Y_CEIL + 0.01, zc), { uv: sw('ceiling') });
    for (const sx of [-1, 1]) {
      emit(sec, 'detail', box(0.12, 0.012, L - 0.3, sx * 0.72, Y_CEIL - 0.005, zc), { uv: sw('ledstrip') });
      if (lod === 0) {
        emit(sec, 'detail', box(0.02, Y_WB - Y_FLOOR, L, sx * (HW - 0.045), (Y_WB + Y_FLOOR) / 2, zc), { uv: sw('wall') });
        emit(sec, 'detail', box(0.02, Y_CEIL - Y_WT, L, sx * (HW - 0.045), (Y_CEIL + Y_WT) / 2, zc), { uv: sw('wall') });
        // horizontal grab rails along the aisle
        emit(sec, 'detail', cyl(0.016, L - 0.6, 8, M4().makeTranslation(sx * 0.36, 1.92, zc).multiply(M4().makeRotationX(Math.PI / 2))), { uv: sw('stanchion') });
      }
    }
    if (lod === 0) {
      // inner wheel housings
      for (const [k, zc2] of Object.entries(AX)) if ((k === 'rear') === (sec === 'rear')) for (const sx of [-1, 1]) emit(sec, 'detail', box(0.5, 0.62, 1.3, sx * (HW - 0.3), Y_FLOOR + 0.31, zc2), { uv: sw('wall') });
    }
  }
  // seats: forward-facing pairs, a stanchion at every second row on the aisle
  const busy = (z, sx) => {
    for (const [k, zc] of Object.entries(AX)) if (Math.abs(z - zc) < 0.75) return true;
    if (z > 7.3 || (z < J0 + 0.1 && z > J1 - 0.35)) return true;
    if (sx < 0) for (const list of Object.values(DOORS)) for (const [a, b] of list) if (z > a - 0.45 && z < b + 0.35) return true;
    return false;
  };
  let row = 0;
  for (let z = 6.9; z > ZR + 1.3; z -= 0.80) {
    for (const sx of [-1, 1]) {
      if (busy(z, sx)) continue;
      const sec = z > (J0 + J1) / 2 ? 'front' : 'rear';
      const cx = sx * 0.80;
      if (lod === 0) {
        emit(sec, 'detail', box(0.86, 0.09, 0.44, cx, 0.80, z - 0.02), { uv: sw('seat') });
        emit(sec, 'detail', box(0.86, 0.58, 0.07, cx, 1.10, z - 0.25, M4().makeRotationX(-0.12)), { uv: sw('seat') });
        emit(sec, 'detail', box(0.06, 0.42, 0.06, cx - sx * 0.38, 0.59, z), { uv: sw('steel') });
        emit(sec, 'detail', box(0.82, 0.03, 0.03, cx, 1.42, z - 0.30), { uv: sw('stanchion') });
        if (row % 2 === 0) emit(sec, 'detail', cyl(0.017, Y_CEIL - Y_FLOOR, 8, M4().makeTranslation(sx * 0.36, (Y_CEIL + Y_FLOOR) / 2, z + 0.25)), { uv: sw('stanchion') });
      } else {
        emit(sec, 'detail', box(0.86, 0.70, 0.45, cx, 0.95, z - 0.1), { uv: sw('seat') });
      }
    }
    row++;
  }
  // the driver's area (left, +X): seat, dash, wheel, barrier; the fare box at the door
  if (lod === 0) {
    emit('front', 'detail', box(0.50, 0.12, 0.50, 0.70, 0.85, 8.35), { uv: sw('dash') });
    emit('front', 'detail', box(0.50, 0.75, 0.10, 0.70, 1.28, 8.08, M4().makeRotationX(-0.15)), { uv: sw('dash') });
    emit('front', 'detail', box(1.10, 0.38, 0.40, 0.68, 0.98, 8.96), { uv: sw('dash') });
    emit('front', 'detail', box(0.22, 0.14, 0.02, 0.48, 1.24, 8.85, M4().makeRotationX(-0.5)), { uv: sw('screen') });
    emit('front', 'detail', fromThree(new THREE.TorusGeometry(0.235, 0.02, 8, 28), M4().makeTranslation(0.70, 1.22, 8.70).multiply(M4().makeRotationX(-1.05))), { uv: sw('dash') });
    emit('front', 'detail', box(0.04, 1.45, 0.65, 0.30, 1.10, 8.30), { uv: sw('driverbarrier') });
    emit('front', 'detail', box(0.30, 1.05, 0.30, 0.0, Y_FLOOR + 0.52, 8.62), { uv: sw('farebox') });
  }
}
// underbody: a dark tray between the skirts so nothing reads through under the floor
function underbody() {
  emit('front', 'detail', box(2 * HW - 0.04, 0.02, J0 - (-0.0) + ZF - 0.2 - 0.0, 0, Y_SKIRT + 0.02, (ZF - 0.1 + J0) / 2), { uv: sw('under') });
  emit('rear', 'detail', box(2 * HW - 0.04, 0.02, J1 - ZR - 0.2, 0, Y_SKIRT + 0.02, (J1 + ZR + 0.1) / 2), { uv: sw('under') });
}

function buildLod(lod) {
  CUR = new Map();
  HUBS.length = 0;
  for (const sec of ['front', 'rear']) {
    for (const side of [1, -1]) {
      const wins = sideWall(sec, side, lod);
      windows(sec, side, wins, lod);
    }
    roof(sec, lod);
  }
  endCap('front', 1, lod);
  endCap('rear', -1, lod);
  jointEnd('front', J0, -1);
  jointEnd('rear', J1, 1);
  bellows(lod);
  wheel('front', 1, AX.front, 1, false, lod); wheel('front', 2, AX.front, -1, false, lod);
  wheel('front', 3, AX.mid, 1, false, lod); wheel('front', 4, AX.mid, -1, false, lod);
  wheel('rear', 5, AX.rear, 1, true, lod); wheel('rear', 6, AX.rear, -1, true, lod);
  if (lod < 2) { wheelHouse('front', AX.front, lod); wheelHouse('front', AX.mid, lod); wheelHouse('rear', AX.rear, lod); }
  frontEnd(lod);
  rearEnd(lod);
  roofGear(lod);
  doors(lod);
  sideSign();
  if (lod < 2) { markers(); interior(lod); }
  underbody();
  return CUR;
}

// ---------------------------------------------------------------- textures
async function svgPng(svg, file, size) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(Buffer.from(svg), { density: 72 }).resize(size, size).png().toFile(file);
  return file;
}

// ---------------------------------------------------------------- GLB
async function main() {
  const t0 = Date.now();
  const cfg = { secF: SEC.front, secR: SEC.rear, axles: AX, doors: DOORS, fleetNo: FLEET_NO };
  const paintPng = await svgPng(paintAtlasSVG(cfg), path.join(TEXDIR, 'mtaxd60_paint.png'), 2048);
  const dCol = await svgPng(detailAtlasSVG('color', ROUTE), path.join(TEXDIR, 'mtaxd60_detail_c.png'), 1024);
  const dMr = await svgPng(detailAtlasSVG('mr', ROUTE), path.join(TEXDIR, 'mtaxd60_detail_mr.png'), 1024);
  const dEm = await svgPng(detailAtlasSVG('emit', ROUTE), path.join(TEXDIR, 'mtaxd60_detail_e.png'), 1024);
  console.log('textures drawn', ((Date.now() - t0) / 1000).toFixed(1), 's');

  const doc = new Document();
  const buf = doc.createBuffer();
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  const ccExt = doc.createExtension(KHRMaterialsClearcoat);
  const esExt = doc.createExtension(KHRMaterialsEmissiveStrength);
  const tex = async (file, kind, size, name) => {
    const r = await makeTexture(file, { kind, size, mode: 'uastc' });
    return doc.createTexture(name).setImage(r.bytes).setMimeType('image/ktx2').setURI(name + '.ktx2');
  };
  const tPaint = await tex(paintPng, 'color', 2048, 'mtaxd60_paint');
  const tDc = await tex(dCol, 'color', 1024, 'mtaxd60_detail_c');
  const tDmr = await tex(dMr, 'data', 1024, 'mtaxd60_detail_mr');
  const tDe = await tex(dEm, 'color', 1024, 'mtaxd60_detail_e');
  console.log('textures encoded', ((Date.now() - t0) / 1000).toFixed(1), 's');
  const MATS = {
    paint: doc.createMaterial('mtaxd60_paint').setBaseColorTexture(tPaint).setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(0.35)
      .setExtension('KHR_materials_clearcoat', ccExt.createClearcoat().setClearcoatFactor(1).setClearcoatRoughnessFactor(0.04)).setExtras({ cls: 'paint' }),
    detail: doc.createMaterial('mtaxd60_detail').setBaseColorTexture(tDc).setMetallicRoughnessTexture(tDmr).setMetallicFactor(1).setRoughnessFactor(1)
      .setEmissiveTexture(tDe).setEmissiveFactor([1, 1, 1]).setExtension('KHR_materials_emissive_strength', esExt.createEmissiveStrength().setEmissiveStrength(2.5))
      .setDoubleSided(true).setExtras({ cls: 'detail' }),
    glass: doc.createMaterial('mtaxd60_glass').setBaseColorFactor([0.02, 0.025, 0.03, 0.35]).setAlphaMode('BLEND').setMetallicFactor(0).setRoughnessFactor(0.03).setExtras({ cls: 'glass' }),
    lens: doc.createMaterial('mtaxd60_lens').setBaseColorFactor([0.9, 0.9, 0.9, 0.12]).setAlphaMode('BLEND').setMetallicFactor(0).setRoughnessFactor(0.02).setExtras({ cls: 'lens' }),
    lamp: doc.createMaterial('mtaxd60_lamp').setBaseColorFactor([0.85, 0.85, 0.85, 1]).setMetallicFactor(0.6).setRoughnessFactor(0.2).setExtras({ cls: 'lamp' }),
    lampInner: doc.createMaterial('mtaxd60_lampInner').setBaseColorFactor([0.02, 0.02, 0.02, 1]).setMetallicFactor(0.2).setRoughnessFactor(0.25).setExtras({ cls: 'lampInner' }),
  };
  const scene = doc.createScene('mtaxd60');
  const rootNode = doc.createNode('mtaxd60');
  scene.addChild(rootNode);
  const acc = (arr, type, Ctor = Float32Array) => doc.createAccessor().setType(type).setArray(new Ctor(arr)).setBuffer(buf);
  const report = [];
  let hubs = null;
  for (let lod = 0; lod < 3; lod++) {
    const B = buildLod(lod);
    if (lod === 0) hubs = HUBS.map((h) => ({ ...h }));
    const lodNode = doc.createNode('LOD' + lod);
    rootNode.addChild(lodNode);
    let total = 0;
    const per = {};
    for (const sec of ['front', 'rear', 'joint']) {
      const mesh = doc.createMesh(`LOD${lod}_${sec}`);
      for (const mat of ['paint', 'detail', 'lampInner', 'lamp', 'lens', 'glass']) {
        const b = B.get(sec + '|' + mat);
        if (!b || !b.idx.length) continue;
        const p = doc.createPrimitive().setMaterial(MATS[mat]);
        p.setAttribute('POSITION', acc(b.pos, 'VEC3'));
        p.setAttribute('NORMAL', acc(b.nrm, 'VEC3'));
        p.setAttribute('TEXCOORD_0', acc(b.uv, 'VEC2'));
        if (b.wheel.some((w) => w)) p.setAttribute('_WHEEL', acc(b.wheel, 'SCALAR'));
        if (b.lamp.some((w) => w)) p.setAttribute('_LAMP', acc(b.lamp, 'SCALAR'));
        if (sec === 'joint') p.setAttribute('_ARTIC', acc(b.artic, 'SCALAR'));
        p.setIndices(acc(b.idx, 'SCALAR', b.pos.length / 3 > 65535 ? Uint32Array : Uint16Array));
        mesh.addPrimitive(p);
        const n = b.idx.length / 3;
        total += n;
        per[`${sec}.${mat}`] = n;
      }
      lodNode.addChild(doc.createNode(`LOD${lod}_${sec}`).setMesh(mesh));
    }
    report.push(`LOD${lod} ${total} tris ` + Object.entries(per).map(([k, v]) => `${k}=${v}`).join(' '));
  }
  rootNode.setExtras({
    kind: 'mtaxd60', size: [+(2 * HW).toFixed(3), 3.20, LEN], hubs, lights: [],
    wheelbase: +(AX.front - AX.mid).toFixed(3), wheelbaseRear: +(AX.mid - AX.rear).toFixed(3),
    axles: { front: AX.front, mid: +AX.mid.toFixed(3), rear: +AX.rear.toFixed(3) },
    pivot: [0, Y_FLOOR, +PIVOT_Z.toFixed(3)], joint: [J0, J1],
    articulated: { bodies: ['front', 'rear'], node: 'LOD<n>_<front|rear|joint>', pivotAxis: 'y', jointWeight: '_ARTIC' },
    route: ROUTE, source: 'procedural, drawn from scratch (BUS60, docs/notes/ar34-veh-bus60.md)', built: new Date().toISOString(),
  });
  await doc.transform(prune(), dedup());
  await MeshoptEncoder.ready;
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  fs.mkdirSync(OUT, { recursive: true });
  const outFile = path.join(OUT, 'mtaxd60.glb');
  fs.writeFileSync(outFile, await io.writeBinary(doc));
  for (const r of report) console.log('  ' + r);
  console.log(`  hubs ${hubs.map((h) => `${h.id}:${h.p.join(',')}`).join(' | ')}`);
  console.log(`  -> ${path.relative(ROOT, outFile)} ${(fs.statSync(outFile).size / 1048576).toFixed(2)} MB in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
await main();
