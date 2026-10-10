// StaticPool — many small static geometries sharing one material, drawn as ONE
// mesh. Each alloc() copies a (transformed, tinted) geometry into a range of a
// big preallocated vertex buffer and uploads just that range; free() turns the
// range into degenerate triangles (zero positions) and recycles it. No
// multi-draw (WEBGL_multi_draw is emulated per-draw on ANGLE/D3D11), no
// per-object matrices: a plain indexed-less mesh with one draw call.
//
// Used for the NYC dresser's window/sill/lintel/cornice parts (~150 draws →
// ~10), hero facade trims (110 → 1) and the far-tile terrain skirts (274 → 1).
import * as THREE from 'three';

const _n = new THREE.Matrix3();
const _v = new THREE.Vector3();

export class StaticPool {
  constructor(scene, material, opts = {}) {
    this.scene = scene;
    this.material = material;
    this.attrs = opts.attrs || { position: 3, normal: 3, uv: 2, color: 3 };
    this.cap = opts.capVerts || 65536;
    this.used = 0;                 // high-water mark (verts)
    this.freeList = [];                // [start, count] ranges below the high-water mark
    this.live = 0;                 // live vertices
    this.name = opts.name || 'staticPool';
    this.geometry = new THREE.BufferGeometry();
    this._alloc(this.cap);
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.name = this.name;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.castShadow = !!opts.castShadow;
    this.mesh.receiveShadow = opts.receiveShadow !== false;
    // three's depth pass renders a FrontSide material's BACK faces, so a closed
    // dresser part (stoop, cornice, sill, awning, door surround) writes its own
    // far/under surface and casts nothing (docs/notes/lighting-r6.md 1d).
    // shadowSide is read only by the shadow pass — no main-draw change.
    if (this.mesh.castShadow && material && !Array.isArray(material)) material.shadowSide = THREE.DoubleSide;
    if (opts.renderOrder !== undefined) this.mesh.renderOrder = opts.renderOrder;
    if (opts.layer !== undefined) this.mesh.layers.enable(opts.layer);
    if (opts.userData) Object.assign(this.mesh.userData, opts.userData);
    this.enabled = opts.enabled !== false;   // e.g. night-only buckets start disabled
    this.mesh.visible = false;     // until something is allocated
    scene.add(this.mesh);
  }
  setEnabled(on) { this.enabled = !!on; this.mesh.visible = this.enabled && this.live > 0; }
  _alloc(cap) {
    for (const [name, size] of Object.entries(this.attrs)) {
      const old = this.geometry.getAttribute(name);
      const arr = new Float32Array(cap * size);
      if (old) arr.set(old.array.subarray(0, Math.min(old.array.length, arr.length)));
      else if (name === 'color') arr.fill(1);
      const a = new THREE.BufferAttribute(arr, size);
      a.setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute(name, a);
    }
    this.cap = cap;
    this.geometry.setDrawRange(0, this.used);
    // bounds: the pool is never frustum culled, keep a huge sphere for safety
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  }
  // vertex count a geometry will occupy (non-indexed expansion)
  static vertsOf(geo) { return geo.index ? geo.index.count : geo.getAttribute('position').count; }
  _range(count) {
    // first fit in the free list, else at the high-water mark (grow if needed)
    for (let i = 0; i < this.freeList.length; i++) {
      const [s, c] = this.freeList[i];
      if (c >= count) {
        if (c === count) this.freeList.splice(i, 1); else this.freeList[i] = [s + count, c - count];
        return s;
      }
    }
    if (this.used + count > this.cap) {
      let cap = this.cap;
      while (this.used + count > cap) cap *= 2;
      this._alloc(cap);
    }
    const s = this.used;
    this.used += count;
    return s;
  }
  // copy `geo` (optionally transformed by `matrix`, colour multiplied by `tint`)
  // into the pool; returns a handle for free()
  alloc(geo, matrix = null, tint = null) {
    const count = StaticPool.vertsOf(geo);
    if (count === 0) return null;
    const start = this._range(count);
    const idx = geo.index ? geo.index.array : null;
    const P = geo.getAttribute('position');
    const N = geo.getAttribute('normal');
    const U = geo.getAttribute('uv');
    const C = geo.getAttribute('color');
    if (matrix) _n.getNormalMatrix(matrix);
    const tr = tint ? tint.r : 1, tg = tint ? tint.g : 1, tb = tint ? tint.b : 1;
    for (const [name, size] of Object.entries(this.attrs)) {
      const dst = this.geometry.getAttribute(name).array;
      const o0 = start * size;
      for (let k = 0; k < count; k++) {
        const i = idx ? idx[k] : k;
        const o = o0 + k * size;
        if (name === 'position') {
          _v.fromBufferAttribute(P, i);
          if (matrix) _v.applyMatrix4(matrix);
          dst[o] = _v.x; dst[o + 1] = _v.y; dst[o + 2] = _v.z;
        } else if (name === 'normal') {
          if (N) { _v.fromBufferAttribute(N, i); if (matrix) _v.applyMatrix3(_n).normalize(); dst[o] = _v.x; dst[o + 1] = _v.y; dst[o + 2] = _v.z; }
          else { dst[o] = 0; dst[o + 1] = 1; dst[o + 2] = 0; }
        } else if (name === 'uv') {
          if (U) { dst[o] = U.getX(i); dst[o + 1] = U.getY(i); } else { dst[o] = 0; dst[o + 1] = 0; }
        } else if (name === 'color') {
          if (C) { dst[o] = C.getX(i) * tr; dst[o + 1] = C.getY(i) * tg; dst[o + 2] = C.getZ(i) * tb; }
          else { dst[o] = tr; dst[o + 1] = tg; dst[o + 2] = tb; }
        } else {
          // any other attribute (matId, aux...) is copied component-wise, zero if absent
          const A = geo.getAttribute(name);
          for (let c = 0; c < size; c++) dst[o + c] = A ? A.array[i * A.itemSize + c] : 0;
        }
      }
      const a = this.geometry.getAttribute(name);
      a.addUpdateRange(o0, count * size);
      a.needsUpdate = true;
    }
    this.live += count;
    this.geometry.setDrawRange(0, this.used);
    this.mesh.visible = this.enabled;
    return { start, count };
  }
  free(h) {
    if (!h) return;
    const { start, count } = h;
    const pa = this.geometry.getAttribute('position');
    pa.array.fill(0, start * 3, (start + count) * 3);   // degenerate triangles
    pa.addUpdateRange(start * 3, count * 3);
    pa.needsUpdate = true;
    this.live -= count;
    // recycle: trim the high-water mark when freeing the tail, else free-list
    if (start + count === this.used) {
      this.used = start;
      // absorb free ranges that now end at the high-water mark
      let again = true;
      while (again) {
        again = false;
        for (let i = 0; i < this.freeList.length; i++) {
          const [s, c] = this.freeList[i];
          if (s + c === this.used) { this.used = s; this.freeList.splice(i, 1); again = true; break; }
        }
      }
    } else {
      this.freeList.push([start, count]);
    }
    this.geometry.setDrawRange(0, this.used);
    if (this.live === 0) this.mesh.visible = false;
  }
  dispose() {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
  }
}
