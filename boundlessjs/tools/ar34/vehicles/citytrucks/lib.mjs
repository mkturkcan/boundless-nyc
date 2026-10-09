// CITYTRUCKS kit: procedural vehicle parts in the fleet24 runtime frame (+Z forward, +Y up, left side at +X, metres,
// origin at the ground centre), packed into the GLB layout of tools/assets/build_vehicle.mjs: a root node carrying the
// build metadata (size, hubs, wheelbase) with LOD0 / LOD1 / LOD2 children, one primitive per runtime material class
// (paint, detail, glass, lens, lamp, lampInner), per-vertex _WHEEL and _LAMP, KTX2 textures, meshopt geometry.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const ROOT = '/data0/projectnyc';
const req = createRequire(ROOT + '/tools/assets/package.json');
const imp = (m) => import(pathToFileURL(req.resolve(m)).href);
const { Document, NodeIO } = await imp('@gltf-transform/core');
const { ALL_EXTENSIONS, KHRMaterialsClearcoat, KHRTextureBasisu } = await imp('@gltf-transform/extensions');
const { weld, meshopt, prune, dedup } = await imp('@gltf-transform/functions');
const { MeshoptEncoder } = await imp('meshoptimizer');
export const sharp = (await imp('sharp')).default;
const { makeTexture } = await import(pathToFileURL(ROOT + '/tools/assets/lib/tex.mjs').href);

export { THREE };
export const ROLE = { head: 1, fbl: 2, fbr: 3, tail: 4, rbl: 5, rbr: 6, rev: 7, sirenR: 8, sirenB: 9 };

// ---------------------------------------------------------------- detail swatch atlas
// 8 x 8 swatches of 64 px: albedo (sRGB) + roughness / metalness; a detail part's UVs sit in the middle of its swatch
export const SW = {
  rubber: [[28, 28, 30], 0.86, 0], tread: [[22, 22, 23], 0.92, 0], blackPlastic: [[22, 23, 25], 0.55, 0], satinBlack: [[16, 16, 18], 0.4, 0.1],
  darkGrey: [[52, 54, 57], 0.5, 0], midGrey: [[105, 108, 112], 0.5, 0], chrome: [[232, 234, 238], 0.08, 1], steel: [[150, 152, 156], 0.35, 1],
  alu: [[196, 199, 203], 0.3, 1], galv: [[140, 142, 140], 0.55, 0.85], rust: [[70, 46, 32], 0.88, 0.15], grime: [[78, 72, 64], 0.9, 0],
  white: [[226, 226, 222], 0.38, 0], dirtyWhite: [[186, 182, 172], 0.62, 0], rimWhite: [[214, 214, 208], 0.35, 0.2], rimBlack: [[30, 31, 33], 0.45, 0.3],
  yellow: [[244, 176, 6], 0.35, 0], dsnyGreen: [[0, 104, 66], 0.4, 0], uspsBlue: [[0, 51, 160], 0.4, 0], uspsRed: [[218, 41, 28], 0.4, 0],
  amberLens: [[255, 132, 0], 0.08, 0], redLens: [[196, 12, 10], 0.08, 0], clearLens: [[230, 232, 235], 0.05, 0], mirror: [[205, 210, 215], 0.04, 1],
  seatBrown: [[96, 58, 36], 0.6, 0], seatGreen: [[46, 72, 52], 0.6, 0], seatBlack: [[34, 34, 36], 0.7, 0], vinylGrey: [[70, 72, 76], 0.65, 0],
  dash: [[34, 35, 37], 0.7, 0], floor: [[46, 46, 44], 0.9, 0], ceiling: [[200, 200, 194], 0.7, 0], interiorWall: [[150, 150, 146], 0.6, 0],
  cargoAlu: [[170, 172, 170], 0.45, 0.8], tapeRed: [[205, 20, 24], 0.3, 0], tapeWhite: [[235, 235, 232], 0.3, 0], stopRed: [[200, 16, 22], 0.4, 0],
  mudflap: [[20, 20, 21], 0.8, 0], frame: [[24, 24, 25], 0.55, 0.3], tank: [[176, 178, 180], 0.3, 1], hydraulic: [[210, 212, 215], 0.12, 1],
  orangeRefl: [[255, 110, 0], 0.15, 0], greyPlastic: [[88, 90, 92], 0.55, 0], cabWhite: [[232, 232, 228], 0.32, 0], blackRubberTrim: [[18, 18, 19], 0.7, 0],
  hopperSteel: [[168, 165, 158], 0.65, 0.35], hopperDirt: [[120, 112, 98], 0.85, 0.1], wiper: [[12, 12, 13], 0.5, 0.2], plateYellow: [[242, 193, 78], 0.4, 0],
};
const SWN = Object.keys(SW);
export const swUV = (name) => { const i = SWN.indexOf(name); if (i < 0) throw new Error('swatch ' + name); return [((i % 8) + 0.5) / 8, (Math.floor(i / 8) + 0.5) / 8]; };

export async function swatchAtlas(dir) {
  const S = 512, C = 64;
  const alb = Buffer.alloc(S * S * 3), orm = Buffer.alloc(S * S * 3);
  SWN.forEach((n, i) => {
    const [c, r, m] = SW[n], x0 = (i % 8) * C, y0 = Math.floor(i / 8) * C;
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      const o = ((y0 + y) * S + x0 + x) * 3;
      alb[o] = c[0]; alb[o + 1] = c[1]; alb[o + 2] = c[2];
      orm[o] = 255; orm[o + 1] = Math.round(r * 255); orm[o + 2] = Math.round(m * 255);
    }
  });
  const fa = path.join(dir, 'ct_swatch_albedo.png'), fo = path.join(dir, 'ct_swatch_orm.png');
  await sharp(alb, { raw: { width: S, height: S, channels: 3 } }).png().toFile(fa);
  await sharp(orm, { raw: { width: S, height: S, channels: 3 } }).png().toFile(fo);
  return { fa, fo };
}

// ---------------------------------------------------------------- parts
// a part: { cls, geo (non-indexed, position/normal/uv), sw (detail swatch), wheel, lamp }
export class Parts {
  constructor(q) { this.q = q; this.list = []; }
  add(cls, geo, { sw = null, wheel = 0, lamp = 0 } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.clearGroups();
    const n = g.attributes.position.count;
    if (sw) { const [u, v] = swUV(sw); const a = g.attributes.uv.array; for (let i = 0; i < n; i++) { a[i * 2] = u; a[i * 2 + 1] = v; } }
    g.setAttribute('_wheel', new THREE.Float32BufferAttribute(new Float32Array(n).fill(wheel), 1));
    g.setAttribute('_lamp', new THREE.Float32BufferAttribute(new Float32Array(n).fill(lamp), 1));
    this.list.push({ cls, geo: g, sw });
    return g;
  }
  // box spanning [x0,x1] x [y0,y1] x [z0,z1], edge radius r (clamped), optional transform after placing
  box(cls, X, Y, Z, r = 0, o = {}) {
    const w = Math.abs(X[1] - X[0]), h = Math.abs(Y[1] - Y[0]), d = Math.abs(Z[1] - Z[0]);
    const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
    const segs = this.q === 0 ? 3 : this.q === 1 ? 1 : 0;
    let g = rr > 0.004 && segs > 0 ? new RoundedBoxGeometry(w, h, d, segs, rr) : new THREE.BoxGeometry(w, h, d);
    g.translate((X[0] + X[1]) / 2, (Y[0] + Y[1]) / 2, (Z[0] + Z[1]) / 2);
    if (o.m) g.applyMatrix4(o.m);
    return this.add(cls, g, o);
  }
  // mirror a part builder over X (both sides): fn(sign) adds parts
  both(fn) { fn(1); fn(-1); }
  // cylinder along an axis ('x' | 'y' | 'z') centred at c
  cyl(cls, c, r, len, axis = 'x', o = {}) {
    const seg = o.seg || (this.q === 0 ? 28 : this.q === 1 ? 12 : 8);
    const g = new THREE.CylinderGeometry(o.r2 ?? r, r, len, seg, 1, !!o.open);
    if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
    g.translate(c[0], c[1], c[2]);
    if (o.m) g.applyMatrix4(o.m);
    return this.add(cls, g, o);
  }
  // a side profile [[z, y], ...] (counter-clockwise seen from +X) extruded across x in [x0, x1], with a bevel
  profile(cls, pts, x0, x1, bevel = 0, o = {}) {
    const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
    if (o.holes) for (const h of o.holes) sh.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(z, y))));
    const segs = this.q === 0 ? 3 : this.q === 1 ? 1 : 0;
    const bv = segs > 0 ? bevel : 0;
    const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, x1 - x0 - 2 * bv), bevelEnabled: bv > 0, bevelThickness: bv, bevelSize: bv, bevelOffset: -bv, bevelSegments: Math.max(1, segs), curveSegments: this.q === 0 ? 10 : 4 });
    // shape (sx, sy) + extrude sz -> X = x1 - bv - sz, Y = sy, Z = sx (a proper rotation: det +1)
    const p = g.attributes.position, nrm = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const sx = p.getX(i), sy = p.getY(i), sz = p.getZ(i);
      p.setXYZ(i, x1 - bv - sz, sy, sx);
      const nx = nrm.getX(i), ny = nrm.getY(i), nz = nrm.getZ(i);
      nrm.setXYZ(i, -nz, ny, nx);
    }
    if (o.m) g.applyMatrix4(o.m);
    return this.add(cls, g, o);
  }
  // a cross-section [[x, y], ...] extruded along z in [z0, z1], with a bevel at both ends
  section(cls, pts, z0, z1, bevel = 0, o = {}) {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const segs = this.q === 0 ? 3 : this.q === 1 ? 1 : 0;
    const bv = segs > 0 ? bevel : 0;
    const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, z1 - z0 - 2 * bv), bevelEnabled: bv > 0, bevelThickness: bv, bevelSize: bv, bevelOffset: -bv, bevelSegments: Math.max(1, segs), curveSegments: this.q === 0 ? 10 : 4 });
    g.translate(0, 0, z0 + bv);
    if (o.m) g.applyMatrix4(o.m);
    return this.add(cls, g, o);
  }
  // lathe about the X axis: profile [[radius, x], ...] at centre c
  latheX(cls, c, prof, o = {}) {
    const seg = o.seg || (this.q === 0 ? 32 : this.q === 1 ? 14 : 8);
    const g = new THREE.LatheGeometry(prof.map(([r, x]) => new THREE.Vector2(Math.max(1e-4, r), x)), seg, o.phiStart ?? 0, o.phiLength ?? Math.PI * 2);
    g.rotateZ(-Math.PI / 2);   // lathe axis +Y -> +X
    g.translate(c[0], c[1], c[2]);
    return this.add(cls, g, o);
  }
}

// a wheel: tyre (lathe with shoulders), rim dish, hub, nuts; side +1 = the left (+X) face points out
export function wheel(P, { x, y, z, r, w, id, side, rimSw = 'rimWhite', dual = false, nuts = 10, hubCap = false }) {
  const q = P.q, o = { wheel: id };
  const tyre = (cx, outward) => {
    const rw = r * 0.62;   // rim radius (22.5 in rims on 1.05 m tyres)
    const hw = w / 2;
    const prof = q === 2 ? [[rw, -hw], [r, -hw * 0.9], [r, hw * 0.9], [rw, hw]] : [
      [rw, -hw * 0.92], [rw + (r - rw) * 0.35, -hw * 1.0], [r - 0.035, -hw * 0.98], [r - 0.008, -hw * 0.8], [r, -hw * 0.5], [r, hw * 0.5], [r - 0.008, hw * 0.8], [r - 0.035, hw * 0.98], [rw + (r - rw) * 0.35, hw * 1.0], [rw, hw * 0.92]];
    P.latheX('detail', [cx, y, z], prof.map(([rr, xx]) => [rr, xx]), { ...o, sw: 'rubber' });
    // rim: from the outer flange in to the hub (a dish), the face toward `outward` (profile reversed on the -X side so
    // the lathe normals face out)
    const s = outward;
    const rimK = q === 2 ? [[rw, 0.85], [rw * 0.35, 0.55], [0.001, 0.55]] : [
      [rw + 0.016, 0.93], [rw, 0.86], [rw * 0.9, 0.72], [rw * 0.62, 0.58], [rw * 0.42, 0.55], [rw * 0.36, 0.5], [0.001, 0.5]];
    const rimP = rimK.map(([rr, k]) => [rr, s * hw * k]);
    P.latheX('detail', [cx, y, z], s > 0 ? rimP : rimP.slice().reverse(), { ...o, sw: rimSw });
    // the barrel behind the dish (seen past the tyre bead)
    if (q < 2) P.cyl('detail', [cx, y, z], rw * 0.97, w * 0.8, 'x', { ...o, sw: 'darkGrey', open: true });
    if (q === 0) {
      // wheel nuts on the bolt circle, a hub cap
      for (let k = 0; k < nuts; k++) {
        const a = (k / nuts) * Math.PI * 2, br = rw * 0.3;
        P.cyl('detail', [cx + s * hw * 0.52, y + Math.cos(a) * br, z + Math.sin(a) * br], 0.016, 0.03, 'x', { ...o, sw: 'chrome', seg: 6 });
      }
      P.cyl('detail', [cx + s * hw * 0.56, y, z], rw * (hubCap ? 0.42 : 0.2), 0.06, 'x', { ...o, sw: hubCap ? 'chrome' : 'darkGrey', seg: 16 });
    }
  };
  if (!dual) tyre(x, side);
  else {
    // duals: the outer tyre's rim faces out, the inner tyre sits inboard by a tyre width + gap
    tyre(x, side);
    tyre(x - side * (w + 0.03), side);
  }
  return { id, p: [+x.toFixed(4), +y.toFixed(4), +z.toFixed(4)], r: +r.toFixed(4), w: +(w / 2 + 0.02).toFixed(4) };
}

// ---------------------------------------------------------------- livery UVs (paint)
// box projection into the livery sheet: left side rows 0-640, right side 640-1280, front 1280-1920 (u < 0.5),
// rear 1280-1920 (u > 0.5), top 1920-2048; see liveryMap() for the same layout in pixels
export function liveryLayout(L, W, H) {
  const zF = L / 2;
  return {
    L, W, H, zF,
    side: (sgn, z, y) => [sgn > 0 ? (zF - z) / L : 1 - (zF - z) / L, (sgn > 0 ? 0 : 640) / 2048 + (1 - y / H) * (640 / 2048)],
    front: (x, y) => [((x + W / 2) / W) * 0.5, 1280 / 2048 + (1 - y / H) * (640 / 2048)],
    rear: (x, y) => [0.5 + ((W / 2 - x) / W) * 0.5, 1280 / 2048 + (1 - y / H) * (640 / 2048)],
    top: (x, z) => [(zF - z) / L, 1920 / 2048 + ((x + W / 2) / W) * (127 / 2048)],
  };
}
function paintUV(g, lay) {
  const p = g.attributes.position, uv = g.attributes.uv.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const v = [a, b, c][k];
      let t;
      if (ax >= ay && ax >= az) t = lay.side(n.x > 0 ? 1 : -1, v.z, v.y);
      else if (az >= ay) t = n.z > 0 ? lay.front(v.x, v.y) : lay.rear(v.x, v.y);
      else t = lay.top(v.x, v.z);
      uv[(i + k) * 2] = Math.min(0.9995, Math.max(0.0005, t[0])); uv[(i + k) * 2 + 1] = Math.min(0.9995, Math.max(0.0005, t[1]));
    }
  }
}

// ---------------------------------------------------------------- livery raster helpers
// pixel mapping of the same layout (for drawing): side(sgn) -> (z, y) -> px; front / rear -> (x, y) -> px
export function liveryPx(lay) {
  const S = 2048;
  return {
    side: (sgn, z, y) => { const [u, v] = lay.side(sgn, z, y); return [u * S, v * S]; },
    front: (x, y) => { const [u, v] = lay.front(x, y); return [u * S, v * S]; },
    rear: (x, y) => { const [u, v] = lay.rear(x, y); return [u * S, v * S]; },
    mx: S / lay.L, my: (640) / lay.H, fx: 1024 / lay.W,
  };
}
// SVG -> raw RGB -> weathering pass (road film rising to the sills, vertical rain streaks, edge grime) -> PNG
export async function rasterLivery(svg, file, { grime = 0.4, streaks = 0.3, seed = 1, H = 3 } = {}) {
  const { data, info } = await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const S = info.width;
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vnoise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const s = (t) => t * t * (3 - 2 * t);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
  };
  const fbm = (x, y) => 0.5 * vnoise(x, y) + 0.25 * vnoise(x * 2.1, y * 2.1) + 0.125 * vnoise(x * 4.3, y * 4.3) + 0.0625 * vnoise(x * 8.7, y * 8.7);
  for (let y = 0; y < S; y++) {
    const band = y < 1280 ? (y % 640) / 640 : y < 1920 ? (y - 1280) / 640 : 0.2;   // 0 top .. 1 ground within a view
    for (let x = 0; x < S; x++) {
      const o = (y * S + x) * 3;
      const f = fbm(x / 90, y / 70);
      // vertical rain streaks: sparse (thresholded), soft across, long down the panel
      const st = Math.max(0, vnoise(x / 7, y / 300) - 0.62) * 2.6 * vnoise(x / 23, y / 700);
      let d = grime * Math.pow(Math.max(0, band - 0.45) / 0.55, 1.5) * (0.55 + 0.9 * f) + streaks * st * (0.25 + band) * 0.45 + 0.04 * grime * f;
      d = Math.min(0.75, Math.max(0, d));
      const lum = (data[o] + data[o + 1] + data[o + 2]) / 765;
      const gr = [92 + 40 * lum, 84 + 36 * lum, 70 + 30 * lum];
      for (let k = 0; k < 3; k++) data[o + k] = Math.round(data[o + k] * (1 - d) + gr[k] * d);
    }
  }
  await sharp(data, { raw: { width: S, height: S, channels: 3 } }).png().toFile(file);
  return file;
}

// ---------------------------------------------------------------- GLB
function mergeCls(list) {
  const gs = list.map((p) => p.geo);
  if (!gs.length) return null;
  return mergeGeometries(gs, false);
}

export async function writeGLB({ kind, lods, size, hubs, livery, out, extras = {}, texDir }) {
  const doc = new Document();
  const buf = doc.createBuffer();
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  const scene = doc.createScene(kind);
  const rootNode = doc.createNode(kind);
  scene.addChild(rootNode);
  const { fa, fo } = await swatchAtlas(texDir);
  const tAlb = await makeTexture(fa, { kind: 'color', size: 512, mode: 'uastc', tag: 'ct1' });
  const tOrm = await makeTexture(fo, { kind: 'data', size: 512, mode: 'uastc', tag: 'ct1' });
  const tLiv = await makeTexture(livery, { kind: 'color', size: 2048, mode: 'uastc', tag: kind });
  const texA = doc.createTexture('ct_swatch_albedo').setImage(tAlb.bytes).setMimeType('image/ktx2').setURI('ct_swatch_albedo.ktx2');
  const texO = doc.createTexture('ct_swatch_orm').setImage(tOrm.bytes).setMimeType('image/ktx2').setURI('ct_swatch_orm.ktx2');
  const texL = doc.createTexture(kind + '_livery').setImage(tLiv.bytes).setMimeType('image/ktx2').setURI(kind + '_livery.ktx2');
  const mats = {};
  const mat = (cls) => {
    if (mats[cls]) return mats[cls];
    const m = doc.createMaterial(`${kind}_${cls}`);
    if (cls === 'paint') {
      m.setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(texL).setMetallicFactor(0).setRoughnessFactor(0.35);
      m.setExtension('KHR_materials_clearcoat', doc.createExtension(KHRMaterialsClearcoat).createClearcoat().setClearcoatFactor(1).setClearcoatRoughnessFactor(0.05));
    } else if (cls === 'detail') {
      m.setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(texA).setMetallicRoughnessTexture(texO).setMetallicFactor(1).setRoughnessFactor(1);
    } else if (cls === 'glass') m.setBaseColorFactor([0.02, 0.025, 0.03, 0.35]).setAlphaMode('BLEND').setMetallicFactor(0).setRoughnessFactor(0.03);
    else if (cls === 'lens') m.setBaseColorFactor([0.9, 0.9, 0.9, 0.12]).setAlphaMode('BLEND').setMetallicFactor(0).setRoughnessFactor(0.02);
    else if (cls === 'lampInner') m.setBaseColorFactor([0.02, 0.02, 0.02, 1]).setMetallicFactor(0.2).setRoughnessFactor(0.25);
    else if (cls === 'lamp') m.setBaseColorFactor([0.85, 0.85, 0.85, 1]).setMetallicFactor(0.6).setRoughnessFactor(0.2);
    m.setExtras({ cls });
    return (mats[cls] = m);
  };
  const counts = [];
  for (let li = 0; li < lods.length; li++) {
    const parts = lods[li];
    const mesh = doc.createMesh('LOD' + li);
    let tris = 0;
    const perCls = {};
    for (const cls of ['paint', 'detail', 'lampInner', 'lamp', 'lens', 'glass']) {
      const list = parts.list.filter((p) => p.cls === cls);
      if (!list.length) continue;
      const g = mergeCls(list);
      if (cls === 'paint') paintUV(g, extras.layout);
      const prim = doc.createPrimitive().setMaterial(mat(cls));
      const acc = (arr, type) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
      prim.setAttribute('POSITION', acc(new Float32Array(g.attributes.position.array), 'VEC3'));
      prim.setAttribute('NORMAL', acc(new Float32Array(g.attributes.normal.array), 'VEC3'));
      prim.setAttribute('TEXCOORD_0', acc(new Float32Array(g.attributes.uv.array), 'VEC2'));
      const wh = g.attributes._wheel.array, la = g.attributes._lamp.array;
      if (wh.some((v) => v)) prim.setAttribute('_WHEEL', acc(new Float32Array(wh), 'SCALAR'));
      if (la.some((v) => v)) prim.setAttribute('_LAMP', acc(new Float32Array(la), 'SCALAR'));
      const n = g.attributes.position.count;
      const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      prim.setIndices(acc(idx, 'SCALAR'));
      mesh.addPrimitive(prim);
      tris += n / 3; perCls[cls] = n / 3;
    }
    rootNode.addChild(doc.createNode('LOD' + li).setMesh(mesh));
    counts.push({ tris, perCls });
  }
  rootNode.setExtras({
    kind, size: size.map((v) => +v.toFixed(3)), hubs, lights: [],
    wheelbase: hubs.length >= 4 ? +Math.abs(hubs[0].p[2] - hubs[2].p[2]).toFixed(3) : null,
    source: 'Valdrada CITYTRUCKS procedural build (boundlessjs/tools/ar34/vehicles/citytrucks)', built: new Date().toISOString(),
    ...Object.fromEntries(Object.entries(extras).filter(([k]) => k !== 'layout')),
  });
  await doc.transform(weld({ tolerance: 0.0001 }));
  await doc.transform(prune(), dedup());
  await MeshoptEncoder.ready;
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, await io.writeBinary(doc));
  return counts;
}
