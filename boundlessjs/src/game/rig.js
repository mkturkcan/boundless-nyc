// rig.js — procedural skinned humanoid for boundless.js (hero + crowd pedestrians).
// Single-file, three.js only. Feet at y=0, faces +Z, ~1.78m tall.
import * as THREE from 'three';
import { applySnowCap } from '../world/materials.js';

export const POSES = ['idle', 'run', 'swing', 'fall', 'zip', 'land'];

const { clamp, lerp } = THREE.MathUtils;
const BLEND_ZONE = 0.08; // meters, 2-bone joint blend width
const HIPS_Y = 0.95;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- skeleton
const BONE_NAMES = [
  'root', 'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'armL', 'forearmL', 'handL',
  'shoulderR', 'armR', 'forearmR', 'handR',
  'thighL', 'shinL', 'footL',
  'thighR', 'shinR', 'footR',
];
const BONE_INDEX = {};
BONE_NAMES.forEach((n, i) => (BONE_INDEX[n] = i));

function buildSkeleton() {
  const B = {};
  const mk = (name, parent, x, y, z) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    if (parent) parent.add(b);
    B[name] = b;
    return b;
  };
  mk('root', null, 0, 0, 0);
  mk('hips', B.root, 0, HIPS_Y, 0);
  mk('spine', B.hips, 0, 0.12, 0);
  mk('chest', B.spine, 0, 0.23, 0);
  mk('neck', B.chest, 0, 0.22, 0);
  mk('head', B.neck, 0, 0.10, 0);
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    mk('shoulder' + S, B.chest, 0.11 * s, 0.17, 0);
    mk('arm' + S, B['shoulder' + S], 0.08 * s, 0, 0);
    mk('forearm' + S, B['arm' + S], 0, -0.28, 0);
    mk('hand' + S, B['forearm' + S], 0, -0.26, 0);
    mk('thigh' + S, B.hips, 0.10 * s, -0.02, 0);
    mk('shin' + S, B['thigh' + S], 0, -0.42, 0);
    mk('foot' + S, B['shin' + S], 0, -0.42, 0);
  }
  return B;
}

// Bone segments in rest-world space, used for distance-based skin weighting.
function boneSegments() {
  const seg = {
    root: [V(0, 0, 0), V(0, 0.4, 0)],
    hips: [V(0, 0.88, 0), V(0, 1.06, 0)],
    spine: [V(0, 1.07, 0), V(0, 1.30, 0)],
    chest: [V(0, 1.30, 0), V(0, 1.52, 0)],
    neck: [V(0, 1.52, 0), V(0, 1.62, 0)],
    head: [V(0, 1.62, 0), V(0, 1.78, 0)],
  };
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    seg['shoulder' + S] = [V(0.11 * s, 1.47, 0), V(0.19 * s, 1.47, 0)];
    seg['arm' + S] = [V(0.19 * s, 1.47, 0), V(0.19 * s, 1.19, 0)];
    seg['forearm' + S] = [V(0.19 * s, 1.19, 0), V(0.19 * s, 0.93, 0)];
    seg['hand' + S] = [V(0.19 * s, 0.93, 0), V(0.19 * s, 0.82, 0)];
    seg['thigh' + S] = [V(0.10 * s, 0.93, 0), V(0.10 * s, 0.51, 0)];
    seg['shin' + S] = [V(0.10 * s, 0.51, 0), V(0.10 * s, 0.09, 0)];
    seg['foot' + S] = [V(0.10 * s, 0.09, 0), V(0.10 * s, 0.05, 0.17)];
  }
  return seg;
}

const _pa = new THREE.Vector3(), _pb = new THREE.Vector3();
function distToSeg(p, seg) {
  _pa.subVectors(seg[1], seg[0]);
  _pb.subVectors(p, seg[0]);
  const t = clamp(_pb.dot(_pa) / Math.max(_pa.lengthSq(), 1e-9), 0, 1);
  return _pb.addScaledVector(_pa, -t).length();
}

// ---------------------------------------------------------------- geometry helpers
function prepGeo(g) {
  g.deleteAttribute('uv');
  g.clearGroups();
  return g;
}

// Tapered capsule spanning world points a->b (caps overshoot the joints => joint overlap).
function capsuleBetween(ax, ay, az, bx, by, bz, r0, r1, o = {}) {
  const a = V(ax, ay, az), b = V(bx, by, bz);
  const len = Math.max(a.distanceTo(b), 1e-4);
  const rm = (r0 + r1) / 2;
  const g = new THREE.CapsuleGeometry(rm, len, o.caps ?? 3, o.radial ?? 10);
  const pos = g.attributes.position;
  const sz = o.sz ?? 1, sx0 = o.sx0 ?? 1, sx1 = o.sx1 ?? 1;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = clamp((y + len / 2) / len, 0, 1); // t=1 at "a" end (top), t=0 at "b" end
    const r = lerp(r1, r0, t) / rm;
    pos.setX(i, pos.getX(i) * r * lerp(sx1, sx0, t));
    pos.setZ(i, pos.getZ(i) * r * sz);
  }
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), a.clone().sub(b).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1)));
  return prepGeo(g);
}

function boxAt(w, h, d, cx, cy, cz, sx = 1, sy = 1, szg = 1) {
  const g = new THREE.BoxGeometry(w, h, d, sx, sy, szg);
  g.translate(cx, cy, cz);
  return prepGeo(g);
}

function assignSkin(g, cands, segs) {
  const pos = g.attributes.position, n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    let b1 = null, b2 = null, d1 = 1e9, d2 = 1e9;
    for (const name of cands) {
      const d = distToSeg(p, segs[name]);
      if (d < d1) { d2 = d1; b2 = b1; d1 = d; b1 = name; }
      else if (d < d2) { d2 = d; b2 = name; }
    }
    let w1 = 1;
    if (b2 !== null) {
      const u = clamp((d2 - d1) / BLEND_ZONE, 0, 1);
      const smooth = u * u * (3 - 2 * u);
      w1 = 0.5 + 0.5 * smooth;
    }
    si[i * 4] = BONE_INDEX[b1];
    sw[i * 4] = w1;
    if (b2 !== null && w1 < 0.999) { si[i * 4 + 1] = BONE_INDEX[b2]; sw[i * 4 + 1] = 1 - w1; }
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
}

function paint(g, base, override) {
  const pos = g.attributes.position, n = pos.count;
  const arr = new Float32Array(n * 3);
  const c = new THREE.Color(), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    c.copy(base);
    if (override) { p.fromBufferAttribute(pos, i); override(p, c); }
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
}

function mergeGeos(list) {
  let vT = 0, iT = 0;
  for (const g of list) { vT += g.attributes.position.count; iT += g.index.count; }
  const P = new Float32Array(vT * 3), N = new Float32Array(vT * 3), C = new Float32Array(vT * 3);
  const SI = new Uint16Array(vT * 4), SW = new Float32Array(vT * 4);
  const IDX = vT > 65535 ? new Uint32Array(iT) : new Uint16Array(iT);
  let vo = 0, io = 0;
  for (const g of list) {
    P.set(g.attributes.position.array, vo * 3);
    N.set(g.attributes.normal.array, vo * 3);
    C.set(g.attributes.color.array, vo * 3);
    SI.set(g.attributes.skinIndex.array, vo * 4);
    SW.set(g.attributes.skinWeight.array, vo * 4);
    const idx = g.index.array;
    for (let k = 0; k < idx.length; k++) IDX[io + k] = idx[k] + vo;
    io += idx.length;
    vo += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
  out.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
  out.setIndex(new THREE.BufferAttribute(IDX, 1));
  return out;
}

// ---------------------------------------------------------------- body construction
function buildBody(opts, segs) {
  const hero = !!opts.hero;
  const suit = new THREE.Color(opts.suit ?? 0x1d2740);
  const accent = new THREE.Color(opts.accent ?? 0x37c4e8);
  const skin = new THREE.Color(opts.skin ?? 0x8a6a52);
  const pants = new THREE.Color(opts.pants ?? 0x3a3f4a);
  const shoes = new THREE.Color(hero ? 0x141c2e : 0x23262e);
  const hair = new THREE.Color(0x2b2118);
  const legCol = hero ? suit : pants;
  const armCol = hero ? suit : suit; // pedestrian jacket sleeves = body color
  const handCol = hero ? suit : skin;

  const parts = []; // { geo, cands }
  const add = (geo, cands, col, override) => { paint(geo, col, override); assignSkin(geo, cands, segs); parts.push(geo); };

  // pelvis
  add(capsuleBetween(0, 1.03, 0, 0, 0.90, 0, 0.118, 0.128, { radial: 12, caps: 3, sz: 0.82, sx0: 1.05, sx1: 1.12 }),
    ['hips', 'spine', 'thighL', 'thighR'], legCol);
  // torso: waist -> chest, shoulders wider than waist
  add(capsuleBetween(0, 1.42, 0, 0, 1.03, 0, 0.150, 0.108, { radial: 14, caps: 5, sz: 0.78, sx0: 1.22, sx1: 1.02 }),
    ['hips', 'spine', 'chest'], hero ? suit : suit,
    hero
      ? (p, c) => { // subtle accent chest V
        if (p.y > 1.30 && p.y < 1.47 && p.z > 0.06 && Math.abs(p.x) < 0.075 - (1.47 - p.y) * 0.25) c.copy(accent).multiplyScalar(0.55);
      }
      : null);
  // neck
  add(capsuleBetween(0, 1.60, 0, 0, 1.50, 0, 0.048, 0.056, { radial: 9, caps: 2 }),
    ['chest', 'neck', 'head'], hero ? suit : skin);
  // head (hero: hood via color, slightly bulkier)
  {
    const r = hero ? 0.097 : 0.093;
    const geo = capsuleBetween(0, 1.686 + (hero ? 0.006 : 0), 0.012, 0, 1.644, 0.012, r * 0.98, r, { radial: 13, caps: 4, sz: 1.06 });
    const override = hero
      ? (p, c) => { if (p.z > 0.055 && p.y > 1.585 && p.y < 1.730 && Math.abs(p.x) < 0.065) c.copy(skin); }
      : (p, c) => { if (p.y > 1.700 || (p.z < -0.040 && p.y > 1.625)) c.copy(hair); };
    paint(geo, hero ? suit : skin, override);
    assignSkin(geo, ['neck', 'head'], segs);
    parts.push(geo);
  }

  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    // deltoid — keeps armpit sealed
    add(capsuleBetween(0.095 * s, 1.435, 0, 0.20 * s, 1.465, 0, 0.070, 0.062, { radial: 9, caps: 2 }),
      ['chest', 'shoulder' + S, 'arm' + S], armCol);
    // upper arm
    add(capsuleBetween(0.19 * s, 1.47, 0, 0.19 * s, 1.19, 0, 0.052, 0.041, { radial: 12, caps: 3 }),
      ['shoulder' + S, 'arm' + S, 'forearm' + S], armCol);
    // forearm (calf-like taper)
    add(capsuleBetween(0.19 * s, 1.19, 0, 0.19 * s, 0.93, 0, 0.045, 0.031, { radial: 12, caps: 3 }),
      ['arm' + S, 'forearm' + S, 'hand' + S], armCol);
    // hand
    add(boxAt(0.062, 0.115, 0.088, 0.19 * s, 0.878, 0.012, 2, 2, 2),
      ['forearm' + S, 'hand' + S], handCol);
    // thigh
    add(capsuleBetween(0.10 * s, 0.93, 0, 0.10 * s, 0.51, 0, 0.085, 0.060, { radial: 12, caps: 3, sz: 0.96 }),
      ['hips', 'thigh' + S, 'shin' + S], legCol);
    // shin with calf taper
    add(capsuleBetween(0.10 * s, 0.51, 0, 0.10 * s, 0.09, 0, 0.058, 0.036, { radial: 12, caps: 3 }),
      ['thigh' + S, 'shin' + S, 'foot' + S], legCol);
    // foot with toe wedge
    {
      const g = boxAt(0.094, 0.076, 0.245, 0.10 * s, 0.040, 0.052, 2, 2, 3);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i);
        if (z > 0.11) { // squash toe down + narrow
          const f = clamp((z - 0.11) / 0.09, 0, 1);
          pos.setY(i, lerp(pos.getY(i), 0.004 + (pos.getY(i) - 0.002) * 0.35, f));
          pos.setX(i, 0.10 * s + (pos.getX(i) - 0.10 * s) * (1 - 0.18 * f));
        }
      }
      add(g, ['shin' + S, 'foot' + S], shoes);
    }
  }

  if (hero) { // chest emblem plates (accent chevron), skinned to chest
    for (const s of [1, -1]) {
      const g = boxAt(0.085, 0.040, 0.018, 0, 0, 0);
      g.rotateZ(-0.55 * s);
      g.translate(0.048 * s, 1.352, 0.128);
      add(g, ['chest'], accent);
    }
  }
  return mergeGeos(parts);
}

// ---------------------------------------------------------------- posing
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _e = new THREE.Euler(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const DOWN = V(0, -1, 0);

function makePoser(group, B) {
  const posed = BONE_NAMES.filter((n) => n !== 'root');

  function apply(T, hipsY, blend) {
    for (const name of posed) {
      const b = B[name];
      const r = T[name];
      if (r && r.isQuaternion) _q.copy(r);
      else if (r) _q.setFromEuler(_e.set(r[0] || 0, r[1] || 0, r[2] || 0));
      else _q.identity();
      b.quaternion.slerp(_q, blend);
    }
    B.hips.position.y += (hipsY - B.hips.position.y) * blend;
  }

  function armAim(T, S, aimLocal, elbow = -0.12) {
    _v.copy(aimLocal);
    if (_v.lengthSq() < 1e-8) _v.set(0, 1, 0.2);
    _v.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(DOWN, _v);
    T['arm' + S] = q;
    T['forearm' + S] = [elbow, 0, 0];
  }

  function localDir(worldDir) {
    group.updateWorldMatrix(true, false);
    group.getWorldQuaternion(_q2).invert();
    return _v2.copy(worldDir).normalize().applyQuaternion(_q2);
  }

  return function setPose(name, t = 0, params = {}) {
    if (!POSES.includes(name)) name = 'idle';
    const blend = clamp(params.blend ?? 0.25, 0, 1);
    const T = {};
    let hipsY = HIPS_Y;

    if (name === 'idle') {
      const br = Math.sin(t * 1.7), sway = Math.sin(t * 0.8) * 0.02;
      T.hips = [0, sway * 0.6, sway];
      T.spine = [0.012 + 0.010 * br, 0, -sway * 0.7];
      T.chest = [0.024 + 0.020 * br, 0, 0];
      T.neck = [0, Math.sin(t * 0.45) * 0.07, 0];
      T.head = [-0.03 - 0.015 * br, Math.sin(t * 0.45) * 0.12, 0];
      for (const s of [1, -1]) {
        const S = s > 0 ? 'L' : 'R';
        T['arm' + S] = [0.04 + 0.02 * br, 0, s * (0.10 + 0.015 * br)];
        T['forearm' + S] = [-0.14, 0, s * 0.04];
        T['thigh' + S] = [-0.02, 0, s * 0.03];
        T['shin' + S] = [0.05, 0, 0];
        T['foot' + S] = [-0.03, 0, 0];
      }
      hipsY = HIPS_Y + 0.005 * br;
    } else if (name === 'run') {
      const sp = clamp((params.speed ?? 6) / 13, 0, 1);
      const ph = t * (4 + 9 * sp);
      const strideAmp = 0.45 + 0.55 * sp;
      const kneeAmp = 0.35 + 0.65 * sp;
      const lean = 0.10 + 0.30 * sp;
      for (const s of [1, -1]) {
        const S = s > 0 ? 'L' : 'R';
        const p = s > 0 ? ph : ph + Math.PI;
        const thighX = -Math.sin(p) * strideAmp;
        const kneeBend = Math.max(0, -Math.sin(p)) * 1.3 * kneeAmp;
        T['thigh' + S] = [thighX, 0, s * 0.04];
        T['shin' + S] = [kneeBend, 0, 0];
        T['foot' + S] = [clamp(-(thighX * 0.5 + kneeBend * 0.65), -0.7, 0.6), 0, 0];
        T['arm' + S] = [Math.sin(p) * (0.45 + 0.45 * sp), 0, s * 0.14];
        T['forearm' + S] = [-(0.45 + 0.55 * sp) - Math.max(0, Math.sin(p)) * 0.25, 0, s * 0.05];
      }
      T.hips = [0, Math.sin(ph) * 0.11 * sp, Math.sin(ph) * 0.05 * sp];
      T.spine = [lean * 0.55, -Math.sin(ph) * 0.06 * sp, 0];
      T.chest = [lean * 0.45, Math.sin(ph) * 0.14 * sp, 0];
      T.neck = [-lean * 0.35, 0, 0];
      T.head = [-lean * 0.55, -Math.sin(ph) * 0.08 * sp, 0]; // stabilized
      hipsY = HIPS_Y - 0.055 * sp + Math.abs(Math.sin(ph)) * 0.045 * sp;
    } else if (name === 'swing') {
      const dL = params.dir && params.dir.isVector3 ? localDir(params.dir).clone() : V(0, 0.35, 1).normalize();
      const ropeL = params.ropeL ?? false;
      const ropeR = params.ropeR ?? !params.ropeL;
      group.updateWorldMatrix(true, false);
      for (const s of [1, -1]) {
        const S = s > 0 ? 'L' : 'R';
        const roped = s > 0 ? ropeL : ropeR;
        if (roped) {
          const anchor = s > 0 ? params.anchorL : params.anchorR;
          let aim;
          if (anchor && anchor.isVector3) {
            aim = group.worldToLocal(anchor.clone()).sub(_v.set(0.19 * s, 1.47, 0));
          } else {
            aim = dL.clone().multiplyScalar(0.55).add(V(0.05 * s, 1, 0.15));
          }
          armAim(T, S, aim, -0.12);
        } else {
          T['arm' + S] = [0.35, 0, s * 0.95];
          T['forearm' + S] = [-0.65, 0, s * 0.1];
        }
        T['thigh' + S] = [0.38 - s * 0.05, 0, s * 0.07];
        T['shin' + S] = [0.95 + s * 0.12, 0, 0];
        T['foot' + S] = [0.38, 0, 0];
      }
      T.hips = [0.10, 0, dL.x * 0.10];
      T.spine = [-0.10, dL.x * 0.12, dL.x * 0.06];
      T.chest = [-0.15, dL.x * 0.18, dL.x * 0.08];
      T.neck = [0.05, 0, 0];
      T.head = [clamp(-0.30 - dL.y * 0.25, -0.7, 0.2), Math.atan2(dL.x, Math.max(dL.z, 0.05)) * 0.35, 0];
    } else if (name === 'fall') {
      const n1 = Math.sin(t * 11), n2 = Math.sin(t * 8.3 + 1.7), n3 = Math.sin(t * 13.7 + 0.6);
      T.hips = [0, 0.05 * n2, 0.04 * n1];
      T.spine = [-0.08 + 0.05 * n1, 0, 0];
      T.chest = [-0.10 + 0.04 * n2, 0, 0];
      T.head = [-0.20 + 0.05 * n3, 0.08 * n2, 0];
      for (const s of [1, -1]) {
        const S = s > 0 ? 'L' : 'R';
        T['arm' + S] = [-0.55 + 0.15 * n1, 0, s * (1.15 + 0.12 * n2)];
        T['forearm' + S] = [-0.40 + 0.18 * n3, 0, s * 0.05];
        T['thigh' + S] = [-0.35 + 0.10 * n2, 0, s * 0.28];
        T['shin' + S] = [0.55 + 0.15 * n1, 0, 0];
        T['foot' + S] = [0.2 + 0.1 * n3, 0, 0];
      }
    } else if (name === 'zip') {
      let aimBase;
      if (params.target && params.target.isVector3) {
        group.updateWorldMatrix(true, false);
        aimBase = group.worldToLocal(params.target.clone());
      } else aimBase = V(0, 1.75, 2.2);
      for (const s of [1, -1]) {
        const S = s > 0 ? 'L' : 'R';
        armAim(T, S, _v.copy(aimBase).sub(_v2.set(0.19 * s, 1.47, 0)).clone(), -0.06);
        T['thigh' + S] = [0.34, 0, -s * 0.05]; // legs together, trailing
        T['shin' + S] = [0.20, 0, 0];
        T['foot' + S] = [0.45, 0, 0];
      }
      T.hips = [0.12, 0, 0];
      T.spine = [0.10, 0, 0];
      T.chest = [0.12, 0, 0];
      T.neck = [-0.15, 0, 0];
      T.head = [-0.30, 0, 0];
    } else if (name === 'land') {
      const a = clamp(params.amount ?? 1, 0, 1);
      for (const s of [1, -1]) {
        const S = s > 0 ? 'L' : 'R';
        T['thigh' + S] = [-1.15 * a, 0, s * 0.14 * a];
        T['shin' + S] = [1.95 * a, 0, 0];
        T['foot' + S] = [-0.72 * a, 0, 0];
        T['arm' + S] = [-0.50 * a, 0, s * 0.55 * a];
        T['forearm' + S] = [-0.30 * a, 0, 0];
      }
      T.hips = [0.05 * a, 0, 0];
      T.spine = [0.30 * a, 0, 0];
      T.chest = [0.18 * a, 0, 0];
      T.neck = [-0.15 * a, 0, 0];
      T.head = [-0.32 * a, 0, 0];
      hipsY = HIPS_Y - 0.36 * a;
    }

    apply(T, hipsY, blend);
  };
}

// ---------------------------------------------------------------- main factory
export function createHumanoid(opts = {}) {
  const hero = !!opts.hero;
  const group = new THREE.Group();
  group.name = hero ? 'tether-hero' : 'pedestrian';

  const B = buildSkeleton();
  const segs = boneSegments();
  const geometry = buildBody(opts, segs);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = applySnowCap(new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.05,
  }), 0.7); // shoulders/head catch snow

  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'humanoid';
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  mesh.add(B.root);
  mesh.updateMatrixWorld(true); // ensure bone world matrices are valid before computing inverses
  const skeleton = new THREE.Skeleton(BONE_NAMES.map((n) => B[n]));
  mesh.bind(skeleton); // bind matrix = identity (mesh at origin), inverses from rest world matrices
  mesh.normalizeSkinWeights();

  if (hero) { // forearm gauntlets: small emissive accent boxes parented to forearm bones
    const accent = new THREE.Color(opts.accent ?? 0x37c4e8);
    const gMat = new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 0.55,
      roughness: 0.4,
      metalness: 0.2,
    });
    const gGeo = new THREE.BoxGeometry(0.082, 0.15, 0.082);
    for (const S of ['L', 'R']) {
      const gm = new THREE.Mesh(gGeo, gMat);
      gm.name = 'gauntlet' + S;
      gm.position.set(0, -0.12, 0.004);
      gm.castShadow = true;
      B['forearm' + S].add(gm);
    }
  }

  group.add(mesh);
  group.userData.animate = (dt) => {}; // no-op placeholder, game loop may override

  const bones = {};
  for (const n of BONE_NAMES) bones[n] = B[n];

  const setPose = makePoser(group, B);
  setPose('idle', 0, { blend: 1 }); // settle into idle rest

  return { group, mesh, bones, setPose };
}
