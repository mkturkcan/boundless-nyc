// Scene batching. Two paths:
//  - MERGED: unique per-building geometry (walls, trims) merged into one mesh
//    per material, with world-space UVs + vertex-color tint/AO. Few draw calls.
//  - INSTANCED: repeated detail parts (window units, brackets, fire escapes,
//    water towers…) as one InstancedMesh per part, with per-instance tint.
import * as THREE from 'three';
import { ensureColor, mergeGeoms } from './geo.js';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

export class Batcher {
  constructor(materials) {
    this.M = materials;                 // Map name -> material
    this.mergeBins = new Map();         // matName -> geom[]
    this.parts = new Map();             // partId -> {geom, matName, opts}
    this.instances = new Map();         // partId -> {matrices:[], colors:[]}
    this.stats = { merged: 0, instanced: 0 };
  }

  material(name) {
    const m = this.M.get(name);
    if (!m) throw new Error(`unknown material: ${name}`);
    return m;
  }

  // ---- merged path ---------------------------------------------------------
  // Adds a geometry transformed by matrix. worldUV remaps UVs from world pos
  // so masonry coursing is continuous across boxes. grime darkens near ground.
  addMerged(matName, geometry, matrix, { tint = null, worldUV = true, grime = 0, aoTop = 0 } = {}) {
    const mat = this.material(matName);
    const g = geometry.clone();
    g.applyMatrix4(matrix);
    ensureColor(g, tint);
    if (worldUV && mat.map) {
      const tile = mat.userData.tileMeters || 2;
      // per-placement UV offset (from the matrix translation) so neighbouring
      // facades never share a tile seam; whole-course multiples keep coursing
      const tx = matrix.elements[12], tz = matrix.elements[14];
      const hsh = ((Math.floor(tx * 7.13 + tz * 3.71 + 1e5) * 2654435761) >>> 0) / 4294967296;
      const uOff = Math.floor(hsh * 17) * 0.213;        // whole brick+joint units
      const vOff = Math.floor(hsh * 37 % 9) * 0.067 * 3;// whole course multiples
      const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        _v.fromBufferAttribute(pos, i);
        _n.fromBufferAttribute(nor, i);
        const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
        let u, v;
        if (ay >= ax && ay >= az) { u = _v.x; v = _v.z; }
        else if (ax >= az) { u = _v.z * Math.sign(_n.x); v = _v.y; }
        else { u = _v.x * -Math.sign(_n.z); v = _v.y; }
        uv.setXY(i, (u + uOff) / tile, (v + vOff) / tile);
      }
    }
    if (grime > 0) {
      // soot/darkening from ground up to ~2.4m
      const pos = g.attributes.position, col = g.attributes.color;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const t = Math.min(1, Math.max(0, y / 2.4));
        const f = (1 - grime) + grime * (t * t * (3 - 2 * t));
        col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
      }
    }
    if (aoTop > 0) {
      // darkening near a given height (under-cornice shadow), aoTop = y of ceiling
      const pos = g.attributes.position, col = g.attributes.color;
      for (let i = 0; i < pos.count; i++) {
        const d = aoTop - pos.getY(i);
        if (d >= 0 && d < 1.2) {
          const f = 0.78 + 0.22 * (d / 1.2);
          col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
        }
      }
    }
    if (!this.mergeBins.has(matName)) this.mergeBins.set(matName, []);
    this.mergeBins.get(matName).push(g);
    this.stats.merged++;
  }

  // ---- instanced path --------------------------------------------------------
  definePart(id, geometry, matName, opts = {}) {
    if (this.parts.has(id)) return;
    ensureColor(geometry);
    this.parts.set(id, { geom: geometry, matName, opts });
  }

  hasPart(id) { return this.parts.has(id); }

  addInstance(id, matrix, tint = null) {
    if (!this.parts.has(id)) throw new Error(`unknown part: ${id}`);
    if (!this.instances.has(id)) this.instances.set(id, { matrices: [], colors: [] });
    const bin = this.instances.get(id);
    bin.matrices.push(matrix.clone ? matrix.clone() : matrix);
    bin.colors.push(tint ? tint.clone() : null);
    this.stats.instanced++;
  }

  // ---- build ------------------------------------------------------------------
  build() {
    const group = new THREE.Group();
    group.name = 'city';
    let drawCalls = 0, tris = 0;

    // fold rarely-instanced parts (≤3 uses) into the merged bins — hundreds of
    // one-off quantized parts otherwise cost a draw call each
    for (const [id, bin] of [...this.instances]) {
      const part = this.parts.get(id);
      if (!part || part.opts.visible === false) continue;
      if (bin.matrices.length > 12) continue;
      for (let i = 0; i < bin.matrices.length; i++) {
        const g = part.geom.clone();
        g.applyMatrix4(bin.matrices[i]);
        ensureColor(g, bin.colors[i] || null);
        if (!this.mergeBins.has(part.matName)) this.mergeBins.set(part.matName, []);
        this.mergeBins.get(part.matName).push(g);
      }
      this.instances.delete(id);
    }

    for (const [matName, geoms] of this.mergeBins) {
      const merged = mergeGeoms(geoms);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, this.material(matName));
      mesh.name = `merge:${matName}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      drawCalls++;
      tris += merged.index.count / 3;
      for (const g of geoms) g.dispose();
    }
    this.mergeBins.clear();

    for (const [id, bin] of this.instances) {
      const part = this.parts.get(id);
      const n = bin.matrices.length;
      const im = new THREE.InstancedMesh(part.geom, this.material(part.matName), n);
      im.name = `part:${id}`;
      for (let i = 0; i < n; i++) {
        im.setMatrixAt(i, bin.matrices[i]);
        if (bin.colors[i]) im.setColorAt(i, bin.colors[i]);
      }
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = part.opts.castShadow !== false;
      im.receiveShadow = part.opts.receiveShadow !== false;
      im.matrixAutoUpdate = false;
      im.frustumCulled = false; // static city, whole-scene visibility
      if (part.opts.visible === false) im.visible = false;
      group.add(im);
      drawCalls++;
      tris += (part.geom.index ? part.geom.index.count / 3 : part.geom.attributes.position.count / 3) * n;
    }

    group.userData.stats = { drawCalls, tris: Math.round(tris), ...this.stats };
    return group;
  }
}
