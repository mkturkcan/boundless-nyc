// Pedestrian PROPS (bags, backpacks) from Objaverse / Sketchfab photogrammetry scans (CC-BY; credits in PROPS and
// boundlessjs/DATA_SOURCES.md) -> canonical prop GLBs for build_peds.mjs, which fits them onto every body.
//   node tools/assets/build_props.mjs [name ...]
// CANONICAL FRAME: metres, +Y up, +Z = the face turned AWAY from the wearer (a backpack's outer face, a hand bag's outer
// side), origin = the ATTACH POINT (backpack: the middle of the panel against the back; shoulder bag: the top of the
// strap loop; hand bag: the top of the handle). One primitive, one material (base colour + normal + ORM), simplified.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { metalRough, weld, simplifyPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { mul, fromTRS, applyPoint, applyDir } from './lib/mat4.mjs';

export const PROP_SRC = (process.env.ASSET_TOOLS || `${process.env.USERPROFILE || process.env.HOME}/.tools`) + '/objaverse/glbs';
export const PROP_OUT = (process.env.ASSET_TOOLS || `${process.env.USERPROFILE || process.env.HOME}/.tools`) + '/props';
// rot: Euler degrees (XYZ) taking the source's own axes to the canonical frame; size: [axis, metres] the prop is scaled
// to; pivot: attach point on the canonical bounds; tris: LOD0 budget
export const PROPS = {
  backpack_herschel: { uid: '3f5948f7f47343acb868072a7fe92ada', credit: 'Retreat Herschel bag — alban (Sketchfab), CC-BY 4.0', rot: [0, 180, 0], size: ['y', 0.44], pivot: 'back', tris: 3500 },
  backpack_kanken: { uid: '3c47af8b6a3e413f94c74f86d4c396ed', credit: 'Kanken backpack — Modelified (Sketchfab), CC-BY 4.0', rot: [0, 0, 0], size: ['y', 0.38], pivot: 'back', tris: 3000 },
  shoulderbag_leather: { uid: '2bb9a12882154fbfa07a11861ff7e6ee', credit: 'Sling Bag — Hydro3D Solution (Sketchfab), CC-BY 4.0', rot: [0, 0, 0], size: ['y', 0.62], pivot: 'top', tris: 3000 },
  messenger_feuerwear: { uid: 'df27288416df409891c3432a8ca23cd9', credit: 'Feuerwear Shoulder Bag Walter UK — Feuerwear (Sketchfab), CC-BY 4.0', rot: [0, 0, 0], size: ['y', 0.63], pivot: 'top', tris: 3000 },
  handbag_leather: { uid: '0732e0dfee7747e49cef95f3d179d880', credit: 'Worn leather handbag — Lassi Kaukonen (Sketchfab), CC-BY 4.0', rot: [0, 90, 0], size: ['x', 0.36], pivot: 'top', tris: 3000 },
};
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const deg = (d) => (d * Math.PI) / 180;
function eulerQuat([x, y, z]) {
  // XYZ intrinsic -> quaternion [x, y, z, w]
  const cx = Math.cos(deg(x) / 2), sx = Math.sin(deg(x) / 2), cy = Math.cos(deg(y) / 2), sy = Math.sin(deg(y) / 2), cz = Math.cos(deg(z) / 2), sz = Math.sin(deg(z) / 2);
  return [sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz, cx * cy * sz + sx * sy * cz, cx * cy * cz - sx * sy * sz];
}

async function imageOf(tex, size, kind) {
  if (!tex) return null;
  let img = sharp(Buffer.from(tex.getImage()));
  if (kind === 'color') img = img.removeAlpha();
  return img.resize(size, size, { fit: 'fill' }).png().toBuffer();
}

export async function buildProp(name) {
  const P = PROPS[name];
  const doc = await io.read(path.join(PROP_SRC, P.uid + '.glb'));
  await doc.transform(metalRough());   // KHR_materials_pbrSpecularGlossiness scans (three dropped the extension)
  const root = doc.getRoot();
  // bake every mesh primitive into model space
  const pos = [], nrm = [], uv = [], idx = [];
  let mat = null, best = -1;
  const visit = (node, parentM) => {
    const M = mul(parentM, node.getMatrix());
    const mesh = node.getMesh();
    if (mesh) for (const prim of mesh.listPrimitives()) {
      const pa = prim.getAttribute('POSITION'), na = prim.getAttribute('NORMAL'), ta = prim.getAttribute('TEXCOORD_0');
      if (!pa || !ta) continue;
      const m = prim.getMaterial();
      const n = pa.getCount();
      if (n > best && m?.getBaseColorTexture()) { best = n; mat = m; }
      const base = pos.length / 3, v = [0, 0, 0], w = [0, 0, 0], t = [0, 0];
      for (let i = 0; i < n; i++) {
        pa.getElement(i, v); const p = applyPoint(M, v); pos.push(p[0], p[1], p[2]);
        if (na) { na.getElement(i, w); const d = applyDir(M, w); const l = Math.hypot(...d) || 1; nrm.push(d[0] / l, d[1] / l, d[2] / l); } else nrm.push(0, 1, 0);
        ta.getElement(i, t); uv.push(t[0], t[1]);
      }
      const ia = prim.getIndices();
      if (ia) for (let i = 0; i < ia.getCount(); i++) idx.push(base + ia.getScalar(i)); else for (let i = 0; i < n; i++) idx.push(base + i);
    }
    for (const c of node.listChildren()) visit(c, M);
  };
  for (const n of root.listScenes()[0].listChildren()) visit(n, fromTRS([0, 0, 0], [0, 0, 0, 1], [1, 1, 1]));
  // canonical orientation, then scale and pivot
  const R = fromTRS([0, 0, 0], eulerQuat(P.rot), [1, 1, 1]);
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < pos.length; i += 3) {
    const p = applyPoint(R, [pos[i], pos[i + 1], pos[i + 2]]); pos[i] = p[0]; pos[i + 1] = p[1]; pos[i + 2] = p[2];
    const d = applyDir(R, [nrm[i], nrm[i + 1], nrm[i + 2]]); nrm[i] = d[0]; nrm[i + 1] = d[1]; nrm[i + 2] = d[2];
    for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], p[c]); hi[c] = Math.max(hi[c], p[c]); }
  }
  const ax = { x: 0, y: 1, z: 2 }[P.size[0]];
  const k = P.size[1] / (hi[ax] - lo[ax]);
  const mid = [0, 1, 2].map((c) => (lo[c] + hi[c]) / 2);
  const piv = P.pivot === 'back' ? [mid[0], mid[1], lo[2]] : P.pivot === 'top' ? [mid[0], hi[1], mid[2]] : mid;
  for (let i = 0; i < pos.length; i += 3) for (let c = 0; c < 3; c++) pos[i + c] = (pos[i + c] - piv[c]) * k;
  // new document: one primitive, one material
  const out = new Document();
  const buf = out.createBuffer();
  const prim = out.createPrimitive()
    .setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buf))
    .setAttribute('NORMAL', out.createAccessor().setType('VEC3').setArray(new Float32Array(nrm)).setBuffer(buf))
    .setAttribute('TEXCOORD_0', out.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buf))
    .setIndices(out.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buf));
  const m = out.createMaterial(name).setMetallicFactor(0).setRoughnessFactor(0.8);
  const bc = await imageOf(mat?.getBaseColorTexture(), 1024, 'color');
  if (bc) m.setBaseColorTexture(out.createTexture('bc').setImage(bc).setMimeType('image/png'));
  const nt = await imageOf(mat?.getNormalTexture(), 512, 'data');
  if (nt) m.setNormalTexture(out.createTexture('n').setImage(nt).setMimeType('image/png'));
  const mr = await imageOf(mat?.getMetallicRoughnessTexture(), 512, 'data');
  if (mr) { m.setMetallicRoughnessTexture(out.createTexture('mr').setImage(mr).setMimeType('image/png')); m.setRoughnessFactor(1).setMetallicFactor(1); }
  prim.setMaterial(m);
  out.createScene().addChild(out.createNode(name).setMesh(out.createMesh(name).addPrimitive(prim)));
  await out.transform(weld());
  await MeshoptSimplifier.ready;
  const tris0 = prim.getIndices().getCount() / 3;
  if (tris0 > P.tris) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: Math.min(1, P.tris / tris0), error: 0.01, lockBorder: false });   // scans: hundreds of UV islands, a locked border never reaches the budget
  fs.mkdirSync(PROP_OUT, { recursive: true });
  const f = path.join(PROP_OUT, name + '.glb');
  await io.write(f, out);
  const size = [0, 1, 2].map((c) => ((hi[c] - lo[c]) * k).toFixed(3)).join(' x ');
  console.log(`${name.padEnd(22)} ${tris0} -> ${prim.getIndices().getCount() / 3} tris, ${size} m, textures ${[bc && 'bc', nt && 'n', mr && 'mr'].filter(Boolean).join('+')}`);
  return f;
}

// PHONE (procedural — at street distances a phone is a dark glossy slab; no scan needed): 71.5 x 146.7 x 7.8 mm rounded
// slab. Canonical frame: +Y the long axis (top of the phone), +Z the SCREEN normal, origin at the centre. UV: screen in
// the left half, back in the right half (camera block top-left of the back), rim on a metal strip in the middle.
export async function buildPhone() {
  const W = 0.0715, H = 0.1467, T = 0.0078, R = 0.009, SEG = 6;
  const prof = [];
  const corners = [[W / 2 - R, H / 2 - R, 0], [-W / 2 + R, H / 2 - R, Math.PI / 2], [-W / 2 + R, -H / 2 + R, Math.PI], [W / 2 - R, -H / 2 + R, 1.5 * Math.PI]];
  for (const [cx, cy, a0] of corners) for (let k = 0; k <= SEG; k++) { const a = a0 + (k / SEG) * (Math.PI / 2); prof.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
  const pos = [], nrm = [], uv = [], idx = [];
  const v = (p, n, t) => { pos.push(...p); nrm.push(...n); uv.push(...t); return pos.length / 3 - 1; };
  for (const side of [1, -1]) {   // +1 screen (z +T/2), -1 back
    const c = v([0, 0, side * T / 2], [0, 0, side], [side > 0 ? 0.25 : 0.75, 0.5]);
    const ring = prof.map(([x, y]) => v([x, y, side * T / 2], [0, 0, side], [side > 0 ? 0.02 + 0.46 * (x / W + 0.5) : 0.52 + 0.46 * (0.5 - x / W), 0.02 + 0.96 * (y / H + 0.5)]));
    for (let k = 0; k < ring.length; k++) { const a = ring[k], b = ring[(k + 1) % ring.length]; if (side > 0) idx.push(c, a, b); else idx.push(c, b, a); }
  }
  // rim: quads between the two outlines, normals outward in the profile plane
  const n = prof.length;
  const rim = [];
  for (let k = 0; k < n; k++) {
    const [x, y] = prof[k], [xp, yp] = prof[(k + n - 1) % n], [xn, yn] = prof[(k + 1) % n];
    const tx = xn - xp, ty = yn - yp, l = Math.hypot(tx, ty) || 1;
    const nn = [ty / l, -tx / l, 0];
    const u = 0.49 + 0.02 * (k / n);
    rim.push([v([x, y, T / 2], nn, [u, 0.3]), v([x, y, -T / 2], nn, [u, 0.7])]);
  }
  for (let k = 0; k < n; k++) { const [a0, a1] = rim[k], [b0, b1] = rim[(k + 1) % n]; idx.push(a0, a1, b1, a0, b1, b0); }
  // textures: 512 albedo, 512 metallic-roughness (glTF: G rough, B metal)
  const S = 512, bc = Buffer.alloc(S * S * 3), mr = Buffer.alloc(S * S * 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, vv = 1 - y / S, i = (y * S + x) * 3;
    let col = [8, 9, 11], rough = 38, metal = 0;                                   // screen off: black glass
    if (u > 0.485 && u < 0.515) { col = [96, 98, 104]; rough = 90; metal = 200; }  // rim
    else if (u >= 0.515) {
      col = [38, 40, 45]; rough = 70;                                               // graphite back
      const cu = (u - 0.52) / 0.46, cv = (vv - 0.02) / 0.96;                        // back-face coords (mirrored x)
      if (cu > 0.55 && cu < 0.93 && cv > 0.8 && cv < 0.97) { col = [24, 25, 28]; rough = 45; }   // camera block
    }
    bc[i] = col[0]; bc[i + 1] = col[1]; bc[i + 2] = col[2];
    mr[i] = 0; mr[i + 1] = rough; mr[i + 2] = metal;
  }
  const out = new Document();
  const buf = out.createBuffer();
  const prim = out.createPrimitive()
    .setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buf))
    .setAttribute('NORMAL', out.createAccessor().setType('VEC3').setArray(new Float32Array(nrm)).setBuffer(buf))
    .setAttribute('TEXCOORD_0', out.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buf))
    .setIndices(out.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buf));
  const m = out.createMaterial('phone').setMetallicFactor(1).setRoughnessFactor(1)
    .setBaseColorTexture(out.createTexture('bc').setImage(await sharp(bc, { raw: { width: S, height: S, channels: 3 } }).png().toBuffer()).setMimeType('image/png'))
    .setMetallicRoughnessTexture(out.createTexture('mr').setImage(await sharp(mr, { raw: { width: S, height: S, channels: 3 } }).png().toBuffer()).setMimeType('image/png'));
  prim.setMaterial(m);
  out.createScene().addChild(out.createNode('phone').setMesh(out.createMesh('phone').addPrimitive(prim)));
  fs.mkdirSync(PROP_OUT, { recursive: true });
  const f = path.join(PROP_OUT, 'phone.glb');
  await io.write(f, out);
  console.log(`phone                  ${idx.length / 3} tris, ${W} x ${H} x ${T} m (procedural)`);
  return f;
}
PROPS.phone = { uid: null, credit: 'procedural (tools/assets/build_props.mjs buildPhone)', procedural: true };

if (process.argv[1] && process.argv[1].endsWith('build_props.mjs')) {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PROPS);
  for (const n of names) await (PROPS[n].procedural ? buildPhone() : buildProp(n));
}
