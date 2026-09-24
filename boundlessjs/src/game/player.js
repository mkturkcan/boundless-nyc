// boundless.js legacy game mode (?play=1) — grapple-gun traversal character.
import * as THREE from 'three';
import { COLLIDERS } from '../city/colliders.js';
import { applySnowCap } from '../world/materials.js';
import { project } from '../shared/geo.js';

const G = 23.5;            // gravity (heavier = punchier swings)
const MAX_SPEED = 58;
const ROPE_MAX = 145;

const HOODS = [
  ['Inwood', 40.862, 40.879, -73.930, -73.910], ['Washington Heights', 40.838, 40.862, -73.945, -73.925],
  ['Hamilton Heights', 40.818, 40.838, -73.957, -73.938], ['Harlem', 40.799, 40.838, -73.958, -73.928],
  ['East Harlem', 40.785, 40.809, -73.951, -73.927], ['Morningside Heights', 40.799, 40.820, -73.972, -73.955],
  ['Upper West Side', 40.768, 40.800, -73.996, -73.958], ['Upper East Side', 40.760, 40.788, -73.973, -73.942],
  ['Central Park', 40.7644, 40.8005, -73.9818, -73.9495],
  ['Midtown', 40.740, 40.767, -74.008, -73.958], ["Hell's Kitchen", 40.755, 40.771, -74.005, -73.985],
  ['Chelsea', 40.737, 40.755, -74.012, -73.987], ['Gramercy', 40.732, 40.742, -73.994, -73.975],
  ['Greenwich Village', 40.725, 40.738, -74.008, -73.990], ['East Village', 40.720, 40.733, -73.993, -73.972],
  ['SoHo', 40.717, 40.728, -74.010, -73.995], ['Tribeca', 40.712, 40.724, -74.014, -74.002],
  ['Lower East Side', 40.708, 40.722, -73.993, -73.972], ['Chinatown', 40.710, 40.720, -74.005, -73.990],
  ['Financial District', 40.700, 40.712, -74.019, -73.999], ['Battery Park City', 40.703, 40.718, -74.020, -74.011],
].map(([n, la0, la1, lo0, lo1]) => {
  const [x0, z1] = project(lo0, la0);
  const [x1, z0] = project(lo1, la1);
  return { n, x0, x1, z0, z1 };
});

class Rope {
  constructor(scene, color = 0xd8dde2) {
    this.active = false;
    this.anchor = new THREE.Vector3();
    this.len = 0;
    this.geo = new THREE.CylinderGeometry(1, 1, 1, 5, 24, true);
    this.geo.translate(0, 0.5, 0);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color }));
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.base = this.geo.attributes.position.array.slice();
    scene.add(this.mesh);
    const spr = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0x8fd8ff }));
    this.tip = spr; this.tip.visible = false;
    scene.add(this.tip);
  }
  fire(anchor, from) {
    this.active = true;
    this.anchor.copy(anchor);
    this.len = anchor.distanceTo(from);
    this.mesh.visible = true;
    this.tip.visible = true;
    this.tip.position.copy(anchor);
  }
  release() { this.active = false; this.mesh.visible = false; this.tip.visible = false; }
  // render as sagging curve from hand to anchor
  updateVisual(hand, taut) {
    if (!this.active) return;
    const a = hand, b = this.anchor;
    const d = a.distanceTo(b);
    const sag = Math.max(0, (this.len - d)) * 0.35 + 0.15;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y -= sag;
    const pos = this.geo.attributes.position;
    const arr = pos.array, base = this.base;
    const A = new THREE.Vector3(), tmp = new THREE.Vector3();
    // build frame per ring: sample bezier
    const rings = 25;
    const r0 = taut ? 0.028 : 0.04;
    for (let ring = 0; ring < rings; ring++) {
      const t = ring / (rings - 1);
      // quadratic bezier
      A.set(0, 0, 0);
      A.addScaledVector(a, (1 - t) * (1 - t));
      A.addScaledVector(mid, 2 * (1 - t) * t);
      A.addScaledVector(b, t * t);
      // tangent
      tmp.set(0, 0, 0);
      tmp.addScaledVector(mid.clone().sub(a), 2 * (1 - t));
      tmp.addScaledVector(b.clone().sub(mid), 2 * t);
      tmp.normalize();
      const side = Math.abs(tmp.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const n1 = new THREE.Vector3().crossVectors(tmp, side).normalize();
      const n2 = new THREE.Vector3().crossVectors(tmp, n1).normalize();
      for (let s = 0; s <= 5; s++) {
        const i = (ring * 6 + s) * 3;
        const ang = (s / 5) * Math.PI * 2;
        const rx = Math.cos(ang) * r0, ry = Math.sin(ang) * r0;
        arr[i] = A.x + n1.x * rx + n2.x * ry;
        arr[i + 1] = A.y + n1.y * rx + n2.y * ry;
        arr[i + 2] = A.z + n1.z * rx + n2.z * ry;
      }
    }
    pos.needsUpdate = true;
    this.mesh.position.set(0, 0, 0);
  }
}

function buildDummy() {
  const g = new THREE.Group();
  const suit = applySnowCap(new THREE.MeshLambertMaterial({ color: 0x1d2740 }), 0.7);
  const accent = new THREE.MeshLambertMaterial({ color: 0x37c4e8 });
  const skin = new THREE.MeshLambertMaterial({ color: 0x8a6a52 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.5, 4, 8), suit);
  torso.position.y = 1.15;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.16), accent);
  chest.position.set(0, 1.28, 0.1);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), skin);
  head.position.y = 1.66;
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), suit);
  hood.position.y = 1.67;
  g.add(torso, chest, head, hood);
  const mkLimb = (upperL, lowerL, r) => {
    const root = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(r, upperL, 3, 6), suit);
    upper.position.y = -upperL / 2;
    const joint = new THREE.Group();
    joint.position.y = -upperL;
    const lower = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.85, lowerL, 3, 6), suit);
    lower.position.y = -lowerL / 2;
    joint.add(lower);
    root.add(upper, joint);
    return { root, joint };
  };
  const armL = mkLimb(0.28, 0.26, 0.07), armR = mkLimb(0.28, 0.26, 0.07);
  armL.root.position.set(-0.29, 1.42, 0); armR.root.position.set(0.29, 1.42, 0);
  const legL = mkLimb(0.36, 0.34, 0.09), legR = mkLimb(0.36, 0.34, 0.09);
  legL.root.position.set(-0.12, 0.78, 0); legR.root.position.set(0.12, 0.78, 0);
  // grapple gauntlets
  const gauntL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.16), accent);
  gauntL.position.y = -0.26;
  armL.joint.add(gauntL);
  const gauntR = gauntL.clone();
  armR.joint.add(gauntR);
  g.add(armL.root, armR.root, legL.root, legR.root);
  return { g, armL, armR, legL, legR, head };
}

export class Player {
  constructor(engine, streamer, sky, hud, spawnPos) {
    this.engine = engine;
    this.streamer = streamer;
    this.hud = hud;
    this.scene = engine.scene;
    this.pos = spawnPos.clone(); // feet
    this.vel = new THREE.Vector3();
    this.onGround = false;
    this.relSpawn = true;
    this.yaw = Math.PI; this.pitch = -0.12;
    this.keys = {};
    this.ropeL = new Rope(this.scene);
    this.ropeR = new Rope(this.scene);
    this.dummy = buildDummy();
    this.dummy.g.traverse((n) => { if (n.isMesh) n.castShadow = true; });
    this.scene.add(this.dummy.g);
    this.rig = null;
    import('./rig.js')   // a plain dynamic import, so the production build bundles it (main.js landmarks note)
      .then((m) => {
        const rig = m.createHumanoid({ hero: true });
        rig.group.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.frustumCulled = false; } });
        this.scene.add(rig.group);
        this.dummy.g.visible = false;
        this.rig = rig;
      })
      .catch(() => {});
    this.runPhase = 0;
    this.fov = 62;
    this.lastGround = spawnPos.clone();
    this.camPos = spawnPos.clone().add(new THREE.Vector3(0, 3, 6));
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);
    this.zipping = false;

    addEventListener('keydown', (e) => { this.keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); });
    addEventListener('keyup', (e) => (this.keys[e.code] = false));
    const el = engine.renderer.domElement;
    el.addEventListener('mousedown', (e) => {
      if (!document.pointerLockElement) { el.requestPointerLock(); return; }
      if (e.button === 0) this.tryFire(this.ropeL);
      if (e.button === 2) this.tryFire(this.ropeR);
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.ropeL.release();
      if (e.button === 2) this.ropeR.release();
      this.updateHud();
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!document.pointerLockElement) return;
      this.yaw -= e.movementX * 0.0021;
      this.pitch -= e.movementY * 0.0021;
      this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));
    });
  }
  aimDir() {
    return new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    ).normalize();
  }
  tryFire(rope) {
    const origin = this.engine.camera.position.clone();
    const dir = this.aimDir();
    const hit = COLLIDERS.raycast(origin, dir, ROPE_MAX);
    if (hit) {
      rope.fire(new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z), this.pos.clone().add(new THREE.Vector3(0, 1.4, 0)));
      this.updateHud();
    }
  }
  updateHud() {
    document.getElementById('tL').classList.toggle('on', this.ropeL.active);
    document.getElementById('tR').classList.toggle('on', this.ropeR.active);
  }
  speedText() {
    return `${(this.vel.length() * 3.6 / 1.609).toFixed(0)} mph`;
  }
  groundHeight() {
    // Stand on the paved surface, not the carved terrain beneath it. There IS a
    // surface query now (streamer.surfaceAt -> the tile's own ground triangles),
    // so the old "+0.15 splits the difference" constant is gone: it left the
    // player 13 cm inside the sidewalk and 1 cm over the roadway, and the
    // shadow blob under him at neither height.
    const s = this.streamer.surfaceAt(this.pos.x, this.pos.z);
    if (s !== null) return s;
    const t = this.streamer.terrainAt(this.pos.x, this.pos.z);
    if (t === null) return null;
    return Math.max(t, 0.0) + 0.15;
  }
  update(dt) {
    dt = Math.min(dt, 1 / 30);
    const S = this.streamer;
    if (this.relSpawn) {
      const g = S.terrainAt(this.pos.x, this.pos.z);
      if (g !== null) { this.pos.y = Math.max(g, 0.5) + 25; this.relSpawn = false; }
      else return { x: this.pos.x, z: this.pos.z };
    }
    const cam = this.engine.camera;
    // ---------- input forces
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const move = new THREE.Vector3();
    if (this.keys.KeyW) move.add(fwd);
    if (this.keys.KeyS) move.sub(fwd);
    if (this.keys.KeyD) move.add(right);
    if (this.keys.KeyA) move.sub(right);
    move.normalize();
    const anyRope = this.ropeL.active || this.ropeR.active;

    if (this.onGround) {
      const target = move.clone().multiplyScalar(this.keys.ShiftLeft ? 13.5 : 8.2);
      this.vel.x += (target.x - this.vel.x) * Math.min(1, dt * 9);
      this.vel.z += (target.z - this.vel.z) * Math.min(1, dt * 9);
      if (this.keys.Space) { this.vel.y = 9.4; this.onGround = false; }
    } else {
      // air control
      this.vel.addScaledVector(move, 10.5 * dt);
      // rope reel controls
      for (const rope of [this.ropeL, this.ropeR]) {
        if (!rope.active) continue;
        if (this.keys.KeyW) rope.len = Math.max(2.5, rope.len - (this.keys.ShiftLeft ? 24 : 10) * dt);
        if (this.keys.KeyS) rope.len = Math.min(ROPE_MAX, rope.len + 9 * dt);
      }
      if (this.keys.Space && anyRope) {
        // release both with boost
        const boost = this.vel.clone().normalize().multiplyScalar(4.5);
        boost.y += 5.5;
        this.vel.add(boost);
        this.ropeL.release(); this.ropeR.release();
        this.updateHud();
      }
    }
    // zip (F): hard pull toward anchor(s)
    this.zipping = this.keys.KeyF && anyRope;
    // ---------- physics
    this.vel.y -= G * dt;
    if (this.zipping) {
      for (const rope of [this.ropeL, this.ropeR]) {
        if (!rope.active) continue;
        const to = rope.anchor.clone().sub(this.pos).sub(new THREE.Vector3(0, 1.2, 0));
        const d = to.length();
        to.normalize();
        this.vel.addScaledVector(to, 42 * dt);
        rope.len = Math.min(rope.len, d);
        if (d < 4.5) { rope.release(); this.updateHud(); }
      }
      this.vel.multiplyScalar(1 - 0.35 * dt);
    }
    // rope constraints (pendulum)
    const chest = this.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
    for (const rope of [this.ropeL, this.ropeR]) {
      if (!rope.active) continue;
      const toA = chest.clone().sub(rope.anchor);
      const d = toA.length();
      if (d > rope.len) {
        const n = toA.normalize();
        // project position back to sphere
        const corr = d - rope.len;
        this.pos.addScaledVector(n, -corr * 0.9);
        chest.copy(this.pos).add(new THREE.Vector3(0, 1.2, 0));
        // remove outward radial velocity
        const vr = this.vel.dot(n);
        if (vr > 0) this.vel.addScaledVector(n, -vr * 1.02);
        // swing pump: slight tangential boost when reeling at arc bottom
        if (this.keys.KeyW && this.vel.length() > 6) this.vel.multiplyScalar(1 + 0.12 * dt);
      }
    }
    // drag & clamp
    const sp = this.vel.length();
    if (sp > MAX_SPEED) this.vel.multiplyScalar(MAX_SPEED / sp);
    this.vel.multiplyScalar(1 - (this.onGround ? 0 : 0.015) * dt * 60 * 0.016);

    this.pos.addScaledVector(this.vel, dt);

    // ---------- collision
    const res = COLLIDERS.resolve(this.pos, 0.45, 1.75);
    if (res.wall) {
      this.pos.x += res.pushX; this.pos.z += res.pushZ;
      // slide: kill velocity into the push direction
      const pn = new THREE.Vector3(res.pushX, 0, res.pushZ);
      if (pn.lengthSq() > 1e-6) {
        pn.normalize();
        const vn = this.vel.dot(pn);
        if (vn < 0) this.vel.addScaledVector(pn, -vn * 1.05);
      }
    }
    const terr = this.groundHeight();
    let groundY = terr === null ? -100 : terr;
    if (res.ground !== null) groundY = Math.max(groundY, res.ground);
    const wasAir = !this.onGround;
    if (this.pos.y <= groundY + 0.02) {
      if (wasAir && this.vel.y < -16) this.landImpact = 0.35; // camera dip
      this.pos.y = groundY;
      if (this.vel.y < 0) this.vel.y = 0;
      this.onGround = true;
      this.lastGround.copy(this.pos);
    } else if (this.pos.y > groundY + 0.35) {
      this.onGround = false;
    }
    // water reset
    if (terr !== null && terr <= 0.01 && this.pos.y < 0.6) {
      this.pos.copy(this.lastGround).add(new THREE.Vector3(0, 2, 0));
      this.vel.set(0, 0, 0);
    }
    // ---------- visuals: skinned rig (fallback: simple dummy)
    const hv0 = Math.hypot(this.vel.x, this.vel.z);
    if (this.rig) {
      const r = this.rig;
      r.group.position.copy(this.pos);
      if (hv0 > 0.6) {
        const face = Math.atan2(this.vel.x, this.vel.z);
        r.group.rotation.y += ((face - r.group.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 9);
      }
      const now = performance.now() / 1000;
      if (this.landImpact > 0.05) r.setPose('land', now, { amount: Math.min(1, this.landImpact * 3), blend: 0.5 });
      else if (this.onGround) r.setPose(hv0 > 0.6 ? 'run' : 'idle', now, { speed: hv0, blend: 0.25 });
      else if (this.zipping) r.setPose('zip', now, { target: (this.ropeL.active ? this.ropeL : this.ropeR).anchor, blend: 0.3 });
      else if (anyRope) r.setPose('swing', now, {
        dir: this.vel.clone().normalize(), ropeL: this.ropeL.active, ropeR: this.ropeR.active,
        anchorL: this.ropeL.active ? this.ropeL.anchor : undefined,
        anchorR: this.ropeR.active ? this.ropeR.anchor : undefined, blend: 0.3,
      });
      else r.setPose('fall', now, { blend: 0.2 });
    }
    const d2 = this.dummy;
    d2.g.position.copy(this.pos);
    const hv = hv0;
    if (hv > 0.5 || !this.onGround) {
      const face = anyRope || !this.onGround ? Math.atan2(this.vel.x, this.vel.z) : Math.atan2(this.vel.x, this.vel.z);
      if (isFinite(face) && hv > 0.5) d2.g.rotation.y += ((face - d2.g.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 10);
    }
    if (this.onGround) {
      this.runPhase += hv * dt * 1.7;
      const sw = Math.sin(this.runPhase * 2) * Math.min(1, hv / 8) * 0.75;
      d2.legL.root.rotation.x = sw; d2.legR.root.rotation.x = -sw;
      d2.legL.joint.rotation.x = Math.max(0, -sw) * 1.2; d2.legR.joint.rotation.x = Math.max(0, sw) * 1.2;
      d2.armL.root.rotation.x = -sw * 0.8; d2.armR.root.rotation.x = sw * 0.8;
      d2.armL.root.rotation.z = 0.12; d2.armR.root.rotation.z = -0.12;
      d2.g.rotation.x = 0; d2.g.rotation.z = 0;
    } else {
      // aerial pose: arms toward active ropes, legs trail
      const aim = (rope, arm, side) => {
        if (rope.active) {
          const to = rope.anchor.clone().sub(this.pos.clone().add(new THREE.Vector3(0, 1.45, 0)));
          const local = to.clone(); // world-space approx: rotate into dummy space
          const ry = d2.g.rotation.y;
          const lx = local.x * Math.cos(-ry) - local.z * Math.sin(-ry);
          const lz = local.x * Math.sin(-ry) + local.z * Math.cos(-ry);
          arm.root.rotation.x = Math.atan2(-lz, local.y) - Math.PI * 0.0;
          arm.root.rotation.z = Math.atan2(lx, Math.max(0.2, local.y)) * -0.8 + side * 0.1;
          arm.joint.rotation.x = 0;
        } else {
          arm.root.rotation.x = -0.4; arm.root.rotation.z = side * 0.35;
          arm.joint.rotation.x = -0.5;
        }
      };
      aim(this.ropeL, d2.armL, -1); aim(this.ropeR, d2.armR, 1);
      const lean = Math.min(0.7, hv / 40);
      d2.g.rotation.x = lean * (this.vel.y < -4 ? 0.35 : 0.6);
      d2.legL.root.rotation.x = -0.35 + Math.sin(performance.now() * 0.003) * 0.1;
      d2.legR.root.rotation.x = -0.55 + Math.cos(performance.now() * 0.0033) * 0.1;
      d2.legL.joint.rotation.x = 0.7; d2.legR.joint.rotation.x = 0.85;
    }
    // ropes visual
    const handL = this.pos.clone().add(new THREE.Vector3(0, 1.45, 0));
    this.ropeL.updateVisual(handL, this.ropeL.active && chest.distanceTo(this.ropeL.anchor) > this.ropeL.len - 0.5);
    this.ropeR.updateVisual(handL, this.ropeR.active && chest.distanceTo(this.ropeR.anchor) > this.ropeR.len - 0.5);
    // blob shadow
    const shY = groundY > -50 ? groundY : 0;
    this.shadow.position.set(this.pos.x, shY + 0.06, this.pos.z);
    const shD = Math.min(1, Math.max(0.25, 1 - (this.pos.y - shY) / 60));
    this.shadow.material.opacity = 0.4 * shD;
    this.shadow.scale.setScalar(0.8 + (this.pos.y - shY) * 0.02);

    // ---------- camera
    const speed = this.vel.length();
    const targetFov = 62 + Math.min(20, speed * 0.32);
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 4);
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
    const dist = 4.6 + Math.min(2.6, speed * 0.045);
    const camOff = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch) + 0.18, Math.cos(this.yaw) * Math.cos(this.pitch),
    ).multiplyScalar(dist);
    const desired = this.pos.clone().add(new THREE.Vector3(0, 1.75, 0)).add(camOff);
    // camera collision: keep above terrain and out of buildings (cheap: raycast from head to cam)
    const head = this.pos.clone().add(new THREE.Vector3(0, 1.7, 0));
    const toCam = desired.clone().sub(head);
    const cd = toCam.length();
    toCam.normalize();
    const camHit = COLLIDERS.raycast(head, toCam, cd + 0.4);
    if (camHit && camHit.dist < cd) desired.copy(head).addScaledVector(toCam, Math.max(0.5, camHit.dist - 0.4));
    const ct = this.streamer.terrainAt(desired.x, desired.z);
    if (ct !== null) desired.y = Math.max(desired.y, ct + 0.4);
    this.camPos.lerp(desired, Math.min(1, dt * 10));
    cam.position.copy(this.camPos);
    if (this.landImpact) { cam.position.y -= this.landImpact; this.landImpact = Math.max(0, this.landImpact - dt * 1.2); }
    const look = this.pos.clone().add(new THREE.Vector3(0, 1.55, 0)).addScaledVector(this.vel, 0.06);
    cam.lookAt(look);
    // subtle roll with lateral swing
    const latV = this.vel.dot(right);
    cam.rotation.z += THREE.MathUtils.clamp(-latV * 0.0035, -0.09, 0.09) * (anyRope ? 1 : 0.3);

    // hud
    if (!this._hoodT || performance.now() - this._hoodT > 800) {
      this._hoodT = performance.now();
      let name = 'Manhattan';
      for (const h of HOODS) if (this.pos.x >= h.x0 && this.pos.x <= h.x1 && this.pos.z >= h.z0 && this.pos.z <= h.z1) { name = h.n; break; }
      this.hud.hood.textContent = name;
    }
    return { x: this.pos.x, y: this.pos.y, z: this.pos.z };
  }
}
