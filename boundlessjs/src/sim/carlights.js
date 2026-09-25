// Night vehicle lighting: camera-facing head/tail light sprites, brake-light
// boost from the IDM deceleration, and (HL24) real headlamp beams on the nearest
// cars. One additive InstancedMesh, rebuilt per frame from the car poses traffic
// already computes (240 cars x 7 quads is nothing).
import * as THREE from 'three';
// HL24: the low-beam pattern every SpotLight evaluates (patches three's spot chunk at import, before any compile)
import { HL24, AIM_RAD } from './headlamps.js';
// CL24: street lamps are real lights now (world/cityLamps.js); the pools, halos and point lights below are ?cl24=0 only
import { CL24 } from '../world/cityLamps.js';
import { ENV } from '../world/materials.js';
import { lampSpots } from '../world/life.js';
// N11 — night ambient (docs/notes/night-r11.md 1.4): colour temperature per
// fixture type. `?n11=0` puts every lamp back on the single 0xffc27a luminaire.
import { N11, fixtureOf, fixtureColor } from '../world/night11.js';

const PER_CAR = 7; // 2 head sprites, 2 tail sprites, 2 head glows, 1 ground pool

// VH13 (docs/notes/vehicles-r13.md) — lamp anchors for the PLACEHOLDER fleet
// (no CARLA GLBs) and for `?vh13=0`: the round-12 constants, written in the same
// [x, y, z, coreW, coreH] model-space form the real per-kind anchors use
// (+Z forward, +X the car's right, origin at the contact patch).
const FALLBACK_LAMPS = {
  front: [[-0.62, 0.62, 2.05, 0.16, 0.13], [0.62, 0.62, 2.05, 0.16, 0.13]],
  rear: [[-0.60, 0.68, -2.15, 0.14, 0.11], [0.60, 0.68, -2.15, 0.14, 0.11]],
};

export class CarLights {
  constructor(scene, maxCars = 320, lampAnchors = null) {
    // VH13 — per-kind lamp anchors measured off each model's own lens geometry
    // (vehicles.js/lampAnchors). null under `?vh13=0`, which restores the single
    // hard-coded offset every kind used to share.
    this.lamps = lampAnchors;
    this.max = maxCars * PER_CAR;
    const g = new THREE.PlaneGeometry(1, 1);
    this.mat = new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      color: 0xffffff, side: THREE.DoubleSide,
    });
    // soft radial falloff via an alphaMap so quads read as glows, not cards
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const ctx = cv.getContext('2d');
    const gr = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64);
    this.mat.alphaMap = new THREE.CanvasTexture(cv);
    this.mesh = new THREE.InstancedMesh(g, this.mat, this.max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    // streetlight ground pools: DEDICATED soft falloff texture (wide tail,
    // no hard rim) so the light reads diffuse, not pasted
    const softCv = document.createElement('canvas');
    softCv.width = softCv.height = 128;
    const sctx = softCv.getContext('2d');
    const sg2 = sctx.createRadialGradient(64, 64, 2, 64, 64, 63);
    sg2.addColorStop(0, 'rgba(255,255,255,0.85)');
    sg2.addColorStop(0.14, 'rgba(255,255,255,0.42)');
    sg2.addColorStop(0.34, 'rgba(255,255,255,0.16)');
    sg2.addColorStop(0.6, 'rgba(255,255,255,0.05)');
    sg2.addColorStop(1, 'rgba(255,255,255,0)');
    sctx.fillStyle = sg2; sctx.fillRect(0, 0, 128, 128);
    this.softMat = new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      color: 0xffffff, side: THREE.DoubleSide, alphaMap: new THREE.CanvasTexture(softCv),
    });
    this.LAMPN = 80;
    this.lampMesh = new THREE.InstancedMesh(g, this.softMat, this.LAMPN);
    this.lampMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.LAMPN * 3), 3);
    this.lampMesh.count = 0;
    this.lampMesh.frustumCulled = false;
    this.lampMesh.renderOrder = 4;
    scene.add(this.lampMesh);
    this.glowMesh = new THREE.InstancedMesh(g, this.mat, this.LAMPN * 2);
    this.glowMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.LAMPN * 6), 3);
    this.glowMesh.count = 0;
    this.glowMesh.frustumCulled = false;
    this.glowMesh.renderOrder = 4;
    scene.add(this.glowMesh);
    // REAL dynamic lights (user call: decals are not realism). A pooled set of
    // shadowless PointLights covers the nearest lamps and cars — true falloff
    // and normal response on walls, asphalt and vehicles. Sprites remain for
    // the glow sources (bloom) and for everything beyond the pool.
    this.DYN_LAMPS = CL24 ? 0 : 24;
    this.DYN_CARS = 12;
    this.dynLamps = [];
    for (let i = 0; i < this.DYN_LAMPS; i++) {
      // N11: colour/intensity/range are now per FIXTURE and written per frame in
      // _updateLamps; 0xffc27a stays the ?n11=0 value (LEGACY_FIXTURE).
      const L = new THREE.PointLight(0xffc27a, 0, 44, 2);
      scene.add(L);
      this.dynLamps.push(L);
    }
    this.dynCars = [];
    // HL24 (owner 2026-09-24): the headlamps. A car's "light" used to be a PointLight 3 m ahead of its nose, lighting
    // everything round it including itself, plus an additive ellipse laid on the asphalt: the translucent circles the
    // owner called silly and basic. Now the nearest cars carry a SpotLight each at their lamps' midpoint, aimed
    // AIM_RAD below the horizon, and headlamps.js gives it a low-beam pattern: cut-off, kerb-side step, hot spot and
    // spread. No decal is drawn. `?hl24=0` restores the point light and the ellipse.
    for (let i = 0; i < this.DYN_CARS; i++) {
      let L;
      if (HL24) {
        L = new THREE.SpotLight(0xfff2e0, 0, 75, 0.72, 0.35, 2);
        L.castShadow = false;
        scene.add(L.target);
      } else L = new THREE.PointLight(0xfff4dd, 0, 28, 2);
      scene.add(L);
      this.dynCars.push(L);
    }
    this._hlCol = [new THREE.Color(0xe9efff), new THREE.Color(0xfff0d6)];   // HL24: LED and halogen whites
    this._lampAcc = 9;
  }
  _updateLamps(camera, night, dt) {
    if (CL24) { this.lampMesh.count = 0; this.glowMesh.count = 0; return; }
    this._lampAcc += dt;
    if (this._lampAcc < 2) return;
    this._lampAcc = 0;
    const p = camera.position;
    // N11: RADIUS FIRST, THEN SORT. This allocated one object per streetlight in
    // the whole loaded city and sorted all of them, every 2 s, to keep the nearest
    // 80 and then `break` at 260 m — and `lampSpots` only ever grows (props.js
    // registers on claim and nothing removes on release), so the cost climbed for
    // the length of a session. Rejecting by radius first is the same set for a
    // fraction of the work, and it matters more now that the Bishop's Crook posts
    // register pools too.
    const R2 = 260 * 260;
    const near = [];
    for (const s of lampSpots) {
      const dx = s[0] - p.x, dz = s[2] - p.z;
      const d = dx * dx + dz * dz;
      if (d <= R2) near.push({ s, d });
    }
    near.sort((a, b) => a.d - b.d);
    if (near.length > this.LAMPN) near.length = this.LAMPN;
    let n = 0, gN = 0, li = 0;
    const camQ2 = camera.quaternion;
    for (const { s } of near) {
      // N11: s = [x, y, z, fixtureKind, mountHeight]; kind -1 / undefined is the
      // legacy single fixture, which is what ?n11=0 registers.
      const F = fixtureOf(s[3] ?? -1);
      const FC = fixtureColor(s[3] ?? -1);
      // MOUNTING HEIGHT was hard-coded at 6.6 m for every lamp, against a kit
      // cobrahead whose luminaire sits at 9.1 m and a Bishop's Crook teardrop at
      // 6.6 — so every pool was too tight and too hot for the fixture throwing it.
      // props.js now supplies it (8.2 m cobra, 5.9 m crook) and the candela values
      // in night11.js are scaled with h^2, so the pool CENTRE holds its value while
      // the pool itself opens out to the width a 30 ft pole actually makes.
      const mh = N11 ? (s[4] ?? 8.2) : 6.6;
      const hasDyn = li < this.DYN_LAMPS;
      if (hasDyn) {
        const L = this.dynLamps[li++];
        L.position.set(s[0], s[1] + mh, s[2]);
        L.intensity = F.cd * night;
        L.distance = F.range;
        L.color.copy(FC);
      }
      const h = Math.abs(Math.sin(s[0] * 12.9 + s[2] * 7.7));
      this._e.set(-Math.PI / 2, h * 6.28, 0, 'YXZ');
      this._q.setFromEuler(this._e);
      const r = F.poolR + h * 1.8;
      this._m.compose(this._v.set(s[0], s[1] + 0.34, s[2]), this._q, this._s.set(r * 2, r * 1.6, 1));
      this.lampMesh.setMatrixAt(n, this._m);
      // A REAL LUMINAIRE THROWS A POOL *AND* LIGHTS THE WALL. The decal used to be
      // switched off outright for any lamp that got one of the 24 pooled point
      // lights (`dk = hasDyn ? 0 : 1`), which threw away the one thing the point
      // light cannot do: an ELLIPTICAL pool, elongated across the carriageway, off
      // the pole's own axis — that shape is most of what identifies a cobrahead in
      // a photograph. It is now reduced, not removed, and takes the fixture's
      // colour so the pool and the lamp head agree.
      const dk = (hasDyn ? (N11 ? 0.34 : 0.0) : 1.0) * night;
      this._c.setRGB(F.pool[0] * dk, F.pool[1] * dk, F.pool[2] * dk);
      this.lampMesh.setColorAt(n, this._c);
      n++;
      // lamp head: hot HDR core (feeds bloom) + wide soft halo, billboarded
      const hy = s[1] + mh + 0.5;
      this._q.copy(camQ2);
      this._m.compose(this._v.set(s[0], hy, s[2]), this._q, this._s.set(0.34, 0.2, 1));
      this.glowMesh.setMatrixAt(gN, this._m);
      this._c.setRGB(F.head[0] * night, F.head[1] * night, F.head[2] * night);
      this.glowMesh.setColorAt(gN, this._c);
      gN++;
      // HL24: the halo was a 2.6 x 1.9 m translucent disc hung round every lamp head (the other "transparent
      // circle"); the bloom pass already spreads the HDR core, so the sprite only has to carry the near haze
      const hk = HL24 ? 0.45 : 1;
      this._m.compose(this._v.set(s[0], hy, s[2]), this._q, this._s.set(HL24 ? 1.05 : 2.6, HL24 ? 0.8 : 1.9, 1));
      this.glowMesh.setMatrixAt(gN, this._m);
      this._c.setRGB(F.halo[0] * night * hk, F.halo[1] * night * hk, F.halo[2] * night * hk);
      this.glowMesh.setColorAt(gN, this._c);
      gN++;
    }
    this.lampMesh.count = n;
    this.lampMesh.instanceMatrix.needsUpdate = true;
    if (this.lampMesh.instanceColor) this.lampMesh.instanceColor.needsUpdate = true;
    for (; li < this.DYN_LAMPS; li++) this.dynLamps[li].intensity = 0;
    this.glowMesh.count = gN;
    this.glowMesh.instanceMatrix.needsUpdate = true;
    if (this.glowMesh.instanceColor) this.glowMesh.instanceColor.needsUpdate = true;
  }
  update(cars, camera, dt = 0.016) {
    const night = ENV.night.value ?? 0;
    // PF25: an invisible light is left out of every shader's light loop; one at zero intensity is not, and by day that
    // was 12 headlamp beams (two atans each) evaluated for every lit fragment of the frame. The set is switched as a
    // whole at the day/night threshold, so the light count is constant within each and three reuses both programs.
    const lightsOn = night >= 0.06;
    if (lightsOn !== this._lightsOn) {
      this._lightsOn = lightsOn;
      for (const L of this.dynLamps || []) L.visible = lightsOn;
      for (const L of this.dynCars || []) L.visible = lightsOn;
    }
    if (night < 0.06) {
      if (this.mesh.count) this.mesh.count = 0;
      if (this.lampMesh.count) this.lampMesh.count = 0;
      if (this.glowMesh) this.glowMesh.count = 0;
      for (const L of this.dynLamps || []) L.intensity = 0;
      for (const L of this.dynCars || []) L.intensity = 0;
      return;
    }
    this._updateLamps(camera, night, dt);
    let n = 0;
    const camQ = camera.quaternion;
    // HL24: a lamp is a directional source. A headlamp glares at a camera in front of the car, shows its lit lens from
    // the side, and nothing from behind; a tail lamp the other way round. `face(px, py, pz, fx, fz)` is the cosine
    // between the lamp's own axis and the direction to the camera.
    const face = (px, py, pz, fx, fz) => {
      const dx = cpx - px, dy = cpy - py, dz = cpz - pz, dl = Math.hypot(dx, dy, dz) || 1;
      return (dx * fx + dz * fz) / dl;
    };
    const put = (x, y, z, w, h, r, g2, b, billboard, yaw) => {
      if (n >= this.max) return;
      if (billboard) this._q.copy(camQ);
      else { this._e.set(-Math.PI / 2, yaw, 0, 'YXZ'); this._q.setFromEuler(this._e); }
      this._m.compose(this._v.set(x, y, z), this._q, this._s.set(w, h, 1));
      this.mesh.setMatrixAt(n, this._m);
      this._c.setRGB(r * night, g2 * night, b * night);
      this.mesh.setColorAt(n, this._c);
      n++;
    };
    // nearest moving cars get REAL headlight lights from the pool
    const cpx = camera.position.x, cpy = camera.position.y, cpz = camera.position.z;
    const byDist = [];
    for (const car of cars) {
      if (!car._pose) continue;
      const dx2 = car._pose[0] - camera.position.x, dz2 = car._pose[2] - camera.position.z;
      byDist.push([dx2 * dx2 + dz2 * dz2, car]);
    }
    byDist.sort((q, w) => q[0] - w[0]);
    for (let i = 0; i < this.DYN_CARS; i++) {
      const L = this.dynCars[i];
      const ent = byDist[i];
      if (!ent || ent[0] > 180 * 180) { L.intensity = 0; continue; }
      const [x, y, z, yaw] = ent[1]._pose;
      if (HL24) {
        // the lamp pair's midpoint on THIS model (VH13 anchors), the beam axis along the car, AIM_RAD down
        const A = this.lamps && (this.lamps[ent[1].kind] || FALLBACK_LAMPS);
        const F0 = (A && A.front) || FALLBACK_LAMPS.front;
        let ly = 0, lz = 0;
        for (const f of F0) { ly += f[1] / F0.length; lz += f[2] / F0.length; }
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        const hx = x + fx * (lz - 0.05), hy = y + ly, hz = z + fz * (lz - 0.05);
        L.position.set(hx, hy, hz);
        L.target.position.set(hx + fx * 30, hy - 30 * Math.tan(AIM_RAD), hz + fz * 30);
        L.target.updateMatrixWorld();
        // photometric scale: night11.js puts a cobrahead at 245 cd (3.6 under an 8.2 m mount), about an eighth of a
        // catalogue fixture, and the pair's hot spot here keeps that ratio to a real low beam's ~20,000 cd
        L.intensity = 3600 * night;
        if (ent[1]._hlc === undefined) ent[1]._hlc = Math.random() < 0.34 ? 1 : 0;   // a third halogen, the rest LED; stable per car
        L.color.copy(this._hlCol[ent[1]._hlc]);
      } else if (!this.lamps) {
        L.position.set(x + Math.sin(yaw) * 3.6, y + 0.9, z + Math.cos(yaw) * 3.6);
        L.intensity = 55 * night;
      } else {
        // VH13 — THE HEADLIGHT POOL WAS TEN TIMES MIDDAY SUN. intensity 55 with
        // decay 2 at 0.9 m over the asphalt delivers 55 / 0.81 = 68 directly
        // under the source, against 3.6 for a 245 cd cobrahead at its 8.2 m mount
        // (night11.js) and 7.0 for the day key light: every car in the aerial
        // night swipe sat in a blown white splash bigger than the car, with the
        // bus-lane legend erased under it (swipeLenoxAir_night f200). Raising the
        // source to 1.5 m and pushing it forward spreads the same pool at a peak
        // the tone map can hold, and the beam SHAPE is carried by the ground
        // decal below, which is no longer switched off when a real light attaches.
        const nose = (this.lamps[ent[1].kind]?.front?.[0]?.[2] ?? 2.05) + 3.2;
        L.position.set(x + Math.sin(yaw) * nose, y + 1.5, z + Math.cos(yaw) * nose);
        L.intensity = 15 * night;
        L.distance = 26;
      }
      ent[1]._dyn = true;
    }
    // VH13 — NEAREST FIRST. `put` silently drops everything past `this.max`
    // (320 cars x 7 quads) and this loop ran in SPAWN order against a
    // CAR_TARGET of 620, so roughly half the moving fleet carried no night
    // lights at all and which half was arbitrary. The pool is bigger now
    // (traffic.js asks for 640) and the order is by camera distance, so if it
    // ever does run out it is the far cars that lose their sprites.
    const list = this.lamps ? byDist.map((e) => e[1]) : cars;
    for (const car of list) {
      const p = car._pose;
      if (!p) continue;
      const [x, y, z, yaw] = p;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);      // forward (the model's +Z)
      const rx = fz, rz = -fx;                            // right   (the model's +X)
      if (!this.lamps) {                                  // ?vh13=0 / placeholder fleet: round-12 path, verbatim
        const braking0 = (car._pv ?? car.v) - car.v > 0.02 || car.v < 0.3;
        const tail0 = braking0 ? 2.2 : 0.9;
        for (const s of [-0.62, 0.62]) {
          const hx = x + fx * 2.05 + rx * s, hz = z + fz * 2.05 + rz * s;
          put(hx, y + 0.62, hz, 0.16, 0.13, 3.2, 3.0, 2.6, true);
          put(hx, y + 0.62, hz, 0.55, 0.4, 0.5, 0.47, 0.4, true);
        }
        for (const s of [-0.6, 0.6]) {
          put(x - fx * 2.15 + rx * s, y + 0.68, z - fz * 2.15 + rz * s, 0.14, 0.11, 3.0 * tail0, 0.12 * tail0, 0.08 * tail0, true);
        }
        const pk0 = car._dyn ? 0.0 : 1.0;
        car._dyn = false;
        if (!HL24) put(x + fx * 5.2, y + 0.06, z + fz * 5.2, 3.4, 6.5, 0.28 * pk0, 0.26 * pk0, 0.2 * pk0, false, yaw);
        continue;
      }
      // VH13 — sprites on the MODEL'S OWN LAMPS. `car._brakeT` is the latched
      // brake flag traffic.js/_placeCar publishes; the old test compared car._pv
      // with car.v after _placeCar had already equalised them, so it never fired
      // on a decelerating car — only on a stopped one.
      const A = this.lamps[car.kind] || FALLBACK_LAMPS;
      const F = A.front || FALLBACK_LAMPS.front, R = A.rear || FALLBACK_LAMPS.rear;
      // CL24: a fleet24 car's own lenses glow (emissive HDR) and bloom makes their halo, so near cars take no sprite at
      // all; past 40 m the lens is a pixel or two, and a small directional core keeps the stream of lights readable.
      // No glare billboard in either case: that soft disc was one of the "transparent ellipse" effects.
      const eml = CL24 && this.emissiveLamps;
      const dcx = x - cpx, dcz = z - cpz;
      if (eml && dcx * dcx + dcz * dcz < 1600) { car._dyn = false; continue; }
      const braking = (car._brakeT ?? 0) > 0 || car.v < 0.3;
      const tail = braking ? 2.3 : 0.85;
      for (const L of F) {
        const hx = x + rx * L[0] + fx * L[2], hz = z + rz * L[0] + fz * L[2], hy = y + L[1];
        const w = Math.min(0.20, Math.max(0.09, L[3] * 0.9)), h = Math.min(0.16, Math.max(0.07, L[4] * 0.9));
        if (HL24) {
          // lens: bright from the front, a dim lit lens from the side, dark from behind; the glare halo only
          // where the camera looks into the beam
          const c = face(hx, hy, hz, fx, fz);
          const lens = c > 0 ? 0.22 + 0.78 * Math.pow(c, 0.7) : Math.max(0, 0.22 + c * 0.6);
          const glare = c > 0.25 ? Math.pow((c - 0.25) / 0.75, 2.2) : 0;
          if (lens > 0.01) put(hx, hy, hz, w, h, 3.2 * lens, 3.05 * lens, 2.75 * lens, true);
          if (glare > 0.01 && !eml) put(hx, hy, hz, w * 3.0, h * 2.2, 0.22 * glare, 0.215 * glare, 0.19 * glare, true);
        } else {
          put(hx, hy, hz, w, h, 3.2, 3.0, 2.6, true);
          put(hx, hy, hz, w * 3.1, h * 3.1, 0.34, 0.32, 0.27, true);
        }
      }
      for (const L of R) {
        const hx = x + rx * L[0] + fx * L[2], hz = z + rz * L[0] + fz * L[2], hy = y + L[1];
        const w = Math.min(0.18, Math.max(0.08, L[3] * 0.85)), h = Math.min(0.15, Math.max(0.06, L[4] * 0.85));
        const k = HL24 ? (() => { const c = face(hx, hy, hz, -fx, -fz); return c > 0 ? 0.3 + 0.7 * c : Math.max(0, 0.3 + c * 0.9); })() : 1;
        if (k > 0.01) put(hx, hy, hz, w, h, 3.0 * tail * k, 0.12 * tail * k, 0.08 * tail * k, true);
      }
      // asphalt pool ahead of THIS model's nose (flat, yaw-aligned, elongated).
      // It is the only thing in the rig with a forward beam SHAPE, so it is now
      // reduced rather than switched off when a pooled point light attaches.
      const pk = car._dyn ? 0.4 : 1.0;
      car._dyn = false;
      // HL24: no decal. Beyond the headlamp pool a car lights nothing but its own lenses, which is also what a far
      // car shows in a night photograph; the ellipse drawn ahead of every car was the "transparent circle".
      if (!HL24) {
        const pd = (F[0][2] ?? 2.05) + 3.15;
        put(x + fx * pd, y + 0.06, z + fz * pd, 3.4, 6.5, 0.26 * pk, 0.24 * pk, 0.19 * pk, false, yaw);
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
