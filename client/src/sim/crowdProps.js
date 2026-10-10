// SIT32 PROPS: what seated walkers hold, or have on the table in front of them. A paper coffee cup, a wrap, an open book
// or a folded newspaper, a laptop with a lit screen.
// Placement: sim/crowdSit.js sitProps works it out per body and pose from each body's own solved arms, and
// tools/assets/crowd_sitqa.mjs --write bakes it into models/peds24/sit31_arms.json ("props").
// Geometry: built here from primitives with vertex colours, a few hundred triangles each, sizes in world metres.
// Drawing: one instanced mesh per kind. Each instance is carried either by one bone of its walker's pose row (a hand:
// skinning matrix x the bone's bind x the grip) or by the walker's own model frame (an item on the top). So no body
// mesh had to be re-encoded to hold them; the bags and phone are baked into all 74 body files.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// one coloured part: a primitive, placed, its uv dropped, a flat vertex colour (sRGB hex)
function part(g, hex, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
  g.deleteAttribute('uv');
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g.index ? g.toNonIndexed() : g;
}
const merge = (parts) => { const g = mergeGeometries(parts, false); g.computeBoundingSphere(); return g; };
// a laptop lid part: built lying closed toward the user from the hinge (z 0 back to -0.215), opened 110 deg (the free edge
// up and 20 deg past vertical, away from the user), hinged at the base's back edge
function lid(g, hex, o = {}) {
  const p = part(g, hex, o);
  p.applyMatrix4(new THREE.Matrix4().makeRotationX((110 * Math.PI) / 180));
  p.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.017, 0.1075));
  return p;
}
// the frames (sitProps): cup and wrap at the grip (the cup's middle, its axis +Y; the wrap held a third of the way up),
// book, paper and laptop at the centre of their underside on the top, the user toward -Z
function geometries() {
  const G = {};
  // a 12 oz paper cup: white, a kraft sleeve, a white lid with a raised sipping rim
  G.cup = merge([
    part(new THREE.CylinderGeometry(0.043, 0.03, 0.115, 20), '#f2efe8'),
    part(new THREE.CylinderGeometry(0.0412, 0.0352, 0.046, 20, 1, true), '#9b6b3f', { y: -0.004 }),
    part(new THREE.CylinderGeometry(0.0455, 0.0455, 0.009, 20), '#f7f5f0', { y: 0.062 }),
    part(new THREE.CylinderGeometry(0.036, 0.041, 0.008, 20), '#e3e0da', { y: 0.07 }),
  ]);
  // a wrap in paper: the tortilla's top third out of the paper, the cut end green and red
  G.wrap = merge([
    part(new THREE.CylinderGeometry(0.029, 0.027, 0.17, 14), '#d8b884', { y: 0.025 }),
    part(new THREE.CylinderGeometry(0.0312, 0.0295, 0.095, 14, 1, true), '#eeebe4', { y: -0.018 }),
    part(new THREE.CylinderGeometry(0.0255, 0.0255, 0.004, 14), '#5f7a36', { y: 0.111 }),
    part(new THREE.CylinderGeometry(0.009, 0.009, 0.005, 8), '#a8392c', { x: 0.008, y: 0.112 }),
    part(new THREE.CylinderGeometry(0.007, 0.007, 0.005, 8), '#e2c35a', { x: -0.009, y: 0.112, z: 0.006 }),
  ]);
  // an open book: two page blocks rising 4 deg toward the spine, lines of text, the cover in one of three colours
  const book = (cover) => {
    const p = [part(new THREE.BoxGeometry(0.31, 0.004, 0.218), cover, { y: 0.002 })];
    for (const sx of [-1, 1]) {
      p.push(part(new THREE.BoxGeometry(0.145, 0.016, 0.21), '#ece6d6', { x: sx * 0.074, y: 0.011, rz: sx * 0.07 }));
      for (let l = 0; l < 13; l++) p.push(part(new THREE.BoxGeometry(0.11, 0.0008, 0.0045), '#948e82', { x: sx * 0.074, y: 0.0194 + (0.074 - Math.abs(sx * 0.074)) * 0.07, z: -0.08 + l * 0.0135, rz: sx * 0.07 }));
    }
    return merge(p);
  };
  G.book0 = book('#7a2430'); G.book1 = book('#22385f'); G.book2 = book('#2f5a3c');
  // a newspaper folded in half: grey paper, a masthead, a headline, four columns of text blocks and a photo
  const pp = [part(new THREE.BoxGeometry(0.29, 0.008, 0.36), '#dcdad2', { y: 0.004 })];
  pp.push(part(new THREE.BoxGeometry(0.25, 0.001, 0.028), '#2c2c2c', { y: 0.0085, z: 0.155 }));
  pp.push(part(new THREE.BoxGeometry(0.25, 0.001, 0.014), '#4a4a4a', { y: 0.0085, z: 0.125 }));
  pp.push(part(new THREE.BoxGeometry(0.115, 0.001, 0.085), '#6b6f73', { x: -0.065, y: 0.0086, z: 0.06 }));
  for (let c = 0; c < 4; c++) for (let r = 0; r < 11; r++) {
    if (c < 2 && r < 4) continue;   // the photo's place
    pp.push(part(new THREE.BoxGeometry(0.055, 0.0006, 0.0085), '#8f8d86', { x: -0.0975 + c * 0.065, y: 0.0085, z: 0.1 - r * 0.021 }));
  }
  G.paper = merge(pp);
  // a laptop: a silver base with a dark keyboard and a trackpad, the lid open; the screen is its own unlit part
  G.laptop = merge([
    part(new THREE.BoxGeometry(0.31, 0.017, 0.215), '#a9adb3', { y: 0.0085 }),
    part(new THREE.BoxGeometry(0.27, 0.001, 0.1), '#26282c', { y: 0.0175, z: 0.025 }),
    part(new THREE.BoxGeometry(0.1, 0.001, 0.062), '#8f949a', { y: 0.0175, z: -0.062 }),
    lid(new THREE.BoxGeometry(0.31, 0.007, 0.215), '#a9adb3', { y: 0.0035, z: -0.1075 }),
  ]);
  G.screen = merge([lid(new THREE.BoxGeometry(0.28, 0.001, 0.182), '#d9e6f4', { y: -0.0006, z: -0.1075 })]);
  return G;
}

// the vertex side: the prop's frame from its walker's pose row (bone >= 0) or its model frame (bone < 0)
const PARS = /* glsl */ `
uniform sampler2D uPose0, uPose1, uPose2;
attribute float aRow;
attribute float aBone;
attribute vec4 aL0;
attribute vec4 aL1;
attribute vec4 aL2;
mat4 crowdPropM() {
  mat4 L = mat4(vec4(aL0.x, aL1.x, aL2.x, 0.0), vec4(aL0.y, aL1.y, aL2.y, 0.0), vec4(aL0.z, aL1.z, aL2.z, 0.0), vec4(aL0.w, aL1.w, aL2.w, 1.0));
  if (aBone < -0.5) return L;
  int r = int(aRow + 0.5), b = int(aBone + 0.5);
  vec4 a = texelFetch(uPose0, ivec2(b, r), 0), c = texelFetch(uPose1, ivec2(b, r), 0), d = texelFetch(uPose2, ivec2(b, r), 0);
  return mat4(vec4(a.x, c.x, d.x, 0.0), vec4(a.y, c.y, d.y, 0.0), vec4(a.z, c.z, d.z, 0.0), vec4(a.w, c.w, d.w, 1.0)) * L;
}
`;
function propMaterial(pose, unlit) {
  const m = unlit ? new THREE.MeshBasicMaterial({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPose0 = pose[0]; sh.uniforms.uPose1 = pose[1]; sh.uniforms.uPose2 = pose[2];
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + PARS)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(mat3(crowdPropM()) * normal);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3( tangent.xyz );\n#endif')
      .replace('#include <begin_vertex>', 'vec3 transformed = (crowdPropM() * vec4(position, 1.0)).xyz;');
  };
  m.customProgramCacheKey = () => 'crowdprop' + (unlit ? 'u' : '');
  return m;
}

// one kind: an instanced mesh whose per-instance data (the walker's world matrix, pose row, bone, local frame) grows as needed
class PropSet {
  constructor(scene, geo, mat, name) {
    this.k = 0; this.cap = 0; this.geo = new THREE.BufferGeometry();
    for (const [n, a] of Object.entries(geo.attributes)) this.geo.setAttribute(n, a);
    this.geo.boundingSphere = geo.boundingSphere;
    this.mesh = new THREE.InstancedMesh(this.geo, mat, 1);
    this.mesh.name = 'crowdProp:' + name; this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.receiveShadow = true;
    this.mesh.count = 0; this.mesh.visible = false; this.mesh.matrixAutoUpdate = false;
    this._alloc(32);
    scene.add(this.mesh);
  }
  _alloc(cap) {
    const grow = (old, size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size); a.setUsage(THREE.DynamicDrawUsage); if (old) a.array.set(old.array.subarray(0, Math.min(old.array.length, a.array.length))); return a; };
    this.im = grow(this.im, 16); this.row = grow(this.row, 1); this.bone = grow(this.bone, 1);
    this.l0 = grow(this.l0, 4); this.l1 = grow(this.l1, 4); this.l2 = grow(this.l2, 4);
    this.cap = cap;
    this.mesh.instanceMatrix = this.im;
    this.geo.setAttribute('aRow', this.row); this.geo.setAttribute('aBone', this.bone);
    this.geo.setAttribute('aL0', this.l0); this.geo.setAttribute('aL1', this.l1); this.geo.setAttribute('aL2', this.l2);
  }
  // M: the walker's instance matrix; L: the prop's local frame, column-major 4x4
  push(M, row, bone, L) {
    if (this.k >= this.cap) this._alloc(this.cap * 2);
    const k = this.k++;
    this.im.array.set(M, k * 16);
    this.row.array[k] = row; this.bone.array[k] = bone;
    for (let r = 0; r < 3; r++) { const a = [this.l0, this.l1, this.l2][r].array; a[k * 4] = L[r]; a[k * 4 + 1] = L[4 + r]; a[k * 4 + 2] = L[8 + r]; a[k * 4 + 3] = L[12 + r]; }
  }
  finish() {
    for (const a of [this.im, this.row, this.bone, this.l0, this.l1, this.l2]) { a.clearUpdateRanges(); a.addUpdateRange(0, this.k * a.itemSize); a.needsUpdate = true; }
    this.mesh.count = this.k; this.mesh.visible = this.k > 0;
  }
}

// all kinds; pose: the GEN2 pass's pose-target uniforms
export function makeCrowdProps(scene, pose) {
  const G = geometries(), lit = propMaterial(pose, false), unlit = propMaterial(pose, true), sets = {};
  for (const [k, g] of Object.entries(G)) sets[k] = new PropSet(scene, g, k === 'screen' ? unlit : lit, k);
  return {
    sets,
    begin() { for (const s of Object.values(sets)) s.k = 0; },
    push(kind, M, row, bone, L) { const s = sets[kind]; if (s) s.push(M, row, bone, L); },
    finish() { for (const s of Object.values(sets)) s.finish(); },
    count() { let n = 0; for (const s of Object.values(sets)) n += s.k; return n; },
  };
}
