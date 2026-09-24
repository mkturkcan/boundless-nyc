import * as THREE from 'three';
import { spawnGuard } from './sim/spawnGuard.js';
import { Engine } from './core/engine.js';
import { Sky } from './world/sky.js';
import { Streamer } from './world/streamer.js';
import { makeFacadeMaterial, makeTileFacadeMaterial, makeGroundMaterial, makeFarMaterial, makeWaterMaterial, ENV, initGTEX, initCityAO } from './world/materials.js';
import { NycDresser } from './world/nycDress.js';
import { Instancer } from './city/instancer.js';
import { COLLIDERS } from './city/colliders.js';
import { initAudio } from './world/audio.js';
import { project } from './shared/geo.js';

const Q = new URLSearchParams(location.search);
const engine = new Engine(document.getElementById('app'));
initGTEX(engine.renderer); // async KTX2 texture bank (needs renderer for detectSupport)
initCityAO(); // baked city-scale sky occlusion field
const sky = new Sky(engine);

// spawn points (lon,lat)
export const SPAWNS = {
  columbia: [...project(-73.9620, 40.8067), 'Morningside Heights'],
  harlem: [...project(-73.94875, 40.80915), 'Harlem, 125th St'],
  timessq: [...project(-73.9866, 40.7575), 'Times Square'],
  esb: [...project(-73.9853, 40.7480), 'Midtown, 34th St'],
  bkbridge: [...project(-74.0040, 40.7115), 'Civic Center'],
  wallst: [...project(-74.0110, 40.7070), 'Financial District'],
};

const facadeMat = makeFacadeMaterial();
const groundMat = makeGroundMaterial();
const farMat = makeFarMaterial();
if (Q.has('nofar')) farMat.visible = false;
const instancer = new Instancer(engine.scene);
instancer.attach(engine); // shadow-pass hooks for the culled caster sets
// phase-2 prop companions (bikes at racks, trash bags, work zones): the
// claim/release hook must install BEFORE tiles start claiming furniture
import('./city/props.js').then((m) => m.placeProps(instancer)).catch((e) => console.warn('prop companions unavailable', e));

// landmarks loaded dynamically (optional module; must not break boot). A plain dynamic import, so the production build
// bundles it: the old import(new URL(...).href) form was copied as a raw, unbundled asset whose bare 'three' import no
// browser can resolve — every built package ran without its landmarks (found by the release test, 2026-09-24).
let landmarkFn = () => null;
const landmarksReady = import('./city/landmarks.js')
  .then(async (m) => {
    await m.preloadMeshes?.(); // optional NYC 3D Model massing (?lm3d=1)
    landmarkFn = (key, ctx) => m.buildLandmark(key, ctx);
  })
  .catch((e) => console.warn('landmarks unavailable', e));

const signalReg = [];
// NYC building dresser: rebuilds the buildings nearest the camera on their real
// footprints with the procedural generator's kit (subproject at ../src, alias
// @nyc) — punched brick walls, recessed windows with glass and rooms, sills,
// lintels, cornices, storefronts, doors, roofs. ?nodress=1 disables it.
const dresser = Q.has('nodress') ? null : new NycDresser(engine.scene, { night: () => ENV.night.value });
const streamer = new Streamer(engine.scene, {
  facadeMat, groundMat, farMat, instancer, signalReg,
  makeFacadeMat: dresser ? makeTileFacadeMaterial : null,
  landmarks: (key, ctx) => {
    const r = landmarkFn(key, ctx);
    if (Q.has('lmdebug')) console.warn('LM', key, r ? 'built' : 'NULL');
    return r;
  },
});

import { HeroFacades } from './world/heroFacades.js';
const heroes = new HeroFacades(engine.scene);
// ?hero=0 disables the hero trim ring entirely (attribution renders, lead r8)
if (new URLSearchParams(location.search).get('hero') === '0') heroes.skip = () => true;
else if (dresser) heroes.skip = (recKey) => dresser.owns(recKey);
streamer.onTile(
  (key, data) => { heroes.setTile(key, data.bldgs || []); dresser?.setTile(key, data); engine.invalidateFarShadow(); },
  (key) => { heroes.removeTile(key); dresser?.removeTile(key); engine.invalidateFarShadow(); },
);

// water
{
  const g = new THREE.PlaneGeometry(46000, 46000, 1, 1);
  g.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(g, makeWaterMaterial());
  water.position.y = 0.0;
  // opaque, depth-tested: draw AFTER the city so hidden water pixels are
  // rejected instead of shaded first and overwritten (was renderOrder -3)
  water.renderOrder = 1;
  engine.scene.add(water);
}

// ---------- camera control: fly (debug/shots) or player
let controller = null;
const spawnName = Q.get('spawn') || 'columbia';
const spawn = SPAWNS[spawnName] || SPAWNS.columbia;
let px = Number(Q.get('x') ?? spawn[0]);
let pz = Number(Q.get('z') ?? spawn[1]);
let py = Number(Q.get('y') ?? 80);

class FlyCam {
  constructor() {
    this.pos = new THREE.Vector3(px, py, pz);
    this.relY = Q.has('rel') ? py : null; // y relative to terrain, applied once tiles exist
    this.yaw = Number(Q.get('yaw') ?? 0);
    this.pitch = Number(Q.get('pitch') ?? -0.25);
    this.speed = 60;
    this.keys = {};
    addEventListener('keydown', (e) => (this.keys[e.code] = true));
    addEventListener('keyup', (e) => (this.keys[e.code] = false));
    // lock only on CANVAS clicks: clicks in the graphics panel (lil-gui) bubble
    // to body and were re-grabbing the cursor mid-adjustment
    engine.renderer.domElement.addEventListener('click', () => engine.renderer.domElement.requestPointerLock?.());
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) { this.yaw -= e.movementX * 0.0022; this.pitch -= e.movementY * 0.0022; this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch)); }
    });
  }
  update(dt) {
    if (this.relY !== null) {
      const g = streamer.terrainAt(this.pos.x, this.pos.z);
      if (g !== null) {
        this.pos.y = Math.max(g, 0.5) + this.relY;
        this.relY = null;
      }
    }
    // while setting up a shot, continuously rise out of any streamed-in geometry
    if (isShot && !window.__READY) {
      for (let i = 0; i < 6; i++) {
        const res = COLLIDERS.resolve({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, 0.4, 0.6);
        if (!res.wall) break;
        this.pos.y += 3.5;
      }
    }
    const d = new THREE.Vector3();
    const f = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    const r = new THREE.Vector3(-f.z, 0, f.x).normalize();
    if (this.keys.KeyW) d.add(f);
    if (this.keys.KeyS) d.sub(f);
    if (this.keys.KeyD) d.add(r);
    if (this.keys.KeyA) d.sub(r);
    if (this.keys.KeyE || this.keys.Space) d.y += 1;
    if (this.keys.KeyQ) d.y -= 1;
    const sp = this.keys.ShiftLeft ? this.speed * 4 : this.speed;
    this.pos.addScaledVector(d.normalize(), sp * dt);
    engine.camera.position.copy(this.pos);
    engine.camera.rotation.set(0, 0, 0);
    engine.camera.rotateY(this.yaw);
    engine.camera.rotateX(this.pitch);
    return { x: this.pos.x, y: this.pos.y, z: this.pos.z };
  }
}

// boundless.js default controller: a flying DRONE (WASD + mouse look, Shift
// rises, Ctrl descends, momentum-smoothed). Tab drops into a first-person
// ground view and back. The graphics editor lives on G.
class Explorer {
  constructor() {
    this.mode = 'drone';
    this.pos = new THREE.Vector3(px, py, pz);
    this.vel = new THREE.Vector3();
    this.yaw = Number(Q.get('yaw') ?? 0);
    this.pitch = Number(Q.get('pitch') ?? -0.25);
    this.keys = {};
    addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Tab') { e.preventDefault(); this.toggle(); }
    });
    addEventListener('keyup', (e) => (this.keys[e.code] = false));
    // lock only on CANVAS clicks: clicks in the graphics panel (lil-gui) bubble
    // to body and were re-grabbing the cursor mid-adjustment
    engine.renderer.domElement.addEventListener('click', () => engine.renderer.domElement.requestPointerLock?.());
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) {
        this.yaw -= e.movementX * 0.0022;
        this.pitch -= e.movementY * 0.0022;
        this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
      }
    });
  }
  toggle() {
    if (this.mode === 'drone') {
      this.mode = 'walk';
      const g = streamer.terrainAt(this.pos.x, this.pos.z);
      if (g !== null && isFinite(g)) this.pos.y = Math.max(g, 0.5) + 1.7;
      this.vel.set(0, 0, 0);
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch));
      flash('FIRST PERSON (TAB FOR DRONE)');
    } else {
      this.mode = 'drone';
      this.pos.y += 14; // lift off
      flash('DRONE (SHIFT UP, CTRL DOWN)');
    }
  }
  update(dt) {
    const f = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    const r = new THREE.Vector3(-f.z, 0, f.x).normalize();
    const d = new THREE.Vector3();
    if (this.mode === 'drone') {
      if (this.keys.KeyW) d.add(f);
      if (this.keys.KeyS) d.sub(f);
      if (this.keys.KeyD) d.add(r);
      if (this.keys.KeyA) d.sub(r);
      if (this.keys.ShiftLeft || this.keys.ShiftRight) d.y += 1;
      if (this.keys.ControlLeft || this.keys.ControlRight) d.y -= 1;
      if (d.lengthSq() > 0) d.normalize();
      this.vel.lerp(d.multiplyScalar(52), Math.min(1, dt * 4.5)); // drone momentum
      this.pos.addScaledVector(this.vel, dt);
      const g = streamer.terrainAt(this.pos.x, this.pos.z);
      if (g !== null && isFinite(g)) this.pos.y = Math.max(this.pos.y, Math.max(g, 0.3) + 1.2); // never dive underground
    } else {
      // first-person: yaw-plane movement glued to the terrain, walls solid
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      if (this.keys.KeyW) { d.x += fx; d.z += fz; }
      if (this.keys.KeyS) { d.x -= fx; d.z -= fz; }
      if (this.keys.KeyD) { d.x += -fz; d.z += fx; }
      if (this.keys.KeyA) { d.x -= -fz; d.z -= fx; }
      const sp = this.keys.ShiftLeft || this.keys.ShiftRight ? 9 : 4.5;
      if (d.lengthSq() > 0) d.normalize();
      const nx = this.pos.x + d.x * sp * dt, nz = this.pos.z + d.z * sp * dt;
      const res = COLLIDERS.resolve({ x: nx, y: this.pos.y, z: nz }, 0.45, 1.65);
      if (!res.wall) { this.pos.x = nx; this.pos.z = nz; }
      const g = streamer.terrainAt(this.pos.x, this.pos.z);
      if (g !== null && isFinite(g)) {
        const eye = Math.max(g, 0.5) + 1.7;
        this.pos.y += (eye - this.pos.y) * Math.min(1, dt * 12);
      }
    }
    engine.camera.position.copy(this.pos);
    engine.camera.rotation.set(0, 0, 0);
    engine.camera.rotateY(this.yaw);
    engine.camera.rotateX(this.pitch);
    return { x: this.pos.x, y: this.pos.y, z: this.pos.z };
  }
}

// ---------------------------------------------------------------------------
// TRAILER RECORDER camera (?record=1). Plays a keyframed spline authored in
// tools/trailer/paths.json, which the recorder injects with window.__SET_PATH.
// Keys are [lon, lat, alt] so a path can be written from a map; alt is metres
// above the terrain under that point unless the path sets "abs": true.
// ---------------------------------------------------------------------------
class PathCam {
  constructor() {
    this.pos = new THREE.Vector3(px, py, pz);
    this.yaw = Number(Q.get('yaw') ?? 0);
    this.pitch = Number(Q.get('pitch') ?? -0.25);
    this.t = 0;
    this.path = null;
    this.ground = null;
    this.lookGround = null;
  }
  // path: { duration, ease, abs, keys: [{ p:[lon,lat,alt], look:[lon,lat,alt] }] }
  setPath(path) {
    this.path = path;
    this.t = 0;
    this.ground = null; this.lookGround = null;
    const pts = path.keys.map((k) => { const [x, z] = project(k.p[0], k.p[1]); return new THREE.Vector3(x, k.p[2], z); });
    const lks = path.keys.map((k) => {
      const src = k.look || k.p;
      const [x, z] = project(src[0], src[1]);
      return new THREE.Vector3(x, k.look ? k.look[2] : k.p[2], z);
    });
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', path.tension ?? 0.5);
    this.lookCurve = new THREE.CatmullRomCurve3(lks, false, 'catmullrom', path.tension ?? 0.5);
    this.hasLook = path.keys.some((k) => !!k.look);
    return { keys: path.keys.length, duration: path.duration, len: +this.curve.getLength().toFixed(1) };
  }
  // constant speed through the middle, quadratic ramps over the first/last
  // `f` of the run so the clip does not start or stop with a jolt
  static easeEnds(x, f) {
    if (f <= 0.001) return x;
    const norm = 1 - f;
    let a;
    if (x < f) a = (x * x) / (2 * f);
    else if (x > 1 - f) { const y = 1 - x; a = norm - (y * y) / (2 * f); }
    else a = x - f / 2;
    return a / norm;
  }
  groundAt(x, z, prev) {
    const g = streamer.terrainAt(x, z);
    if (g === null || !isFinite(g)) return prev;
    return prev === null ? g : prev + (g - prev) * 0.25;   // tile-seam low-pass
  }
  update(dt) {
    if (this.path) {
      this.t += dt;
      const dur = this.path.duration || 12;
      const u = PathCam.easeEnds(Math.min(1, Math.max(0, this.t / dur)), this.path.ease ?? 0.14);
      const p = this.curve.getPointAt(u);
      const l = this.lookCurve.getPointAt(Math.min(1, u + (this.path.lookAhead ?? 0)));
      if (!this.path.abs) {
        this.ground = this.groundAt(p.x, p.z, this.ground);
        this.lookGround = this.groundAt(l.x, l.z, this.lookGround);
      }
      this.pos.set(p.x, p.y + (this.path.abs ? 0 : (this.ground ?? 0)), p.z);
      const ly = l.y + (this.path.abs ? 0 : (this.lookGround ?? this.ground ?? 0));
      const dx = l.x - this.pos.x, dy = ly - this.pos.y, dz = l.z - this.pos.z;
      const hor = Math.hypot(dx, dz) || 1e-6;
      this.yaw = Math.atan2(-dx, -dz);
      this.pitch = Math.atan2(dy, hor);
    }
    engine.camera.position.copy(this.pos);
    engine.camera.rotation.set(0, 0, 0);
    engine.camera.rotateY(this.yaw);
    engine.camera.rotateX(this.pitch);
    return { x: this.pos.x, y: this.pos.y, z: this.pos.z };
  }
  speedText() { return `path ${this.t.toFixed(1)}s`; }
}

// ---------------------------------------------------------------------------
// EXTERNAL API camera (?api=1). src/api/bridge.js owns it: `center` is the spectator's position, which is where the
// world streams; `pose` is what this frame renders (the spectator's view, or the primary camera sensor's).
// ---------------------------------------------------------------------------
class ApiCam {
  constructor() {
    this.center = new THREE.Vector3(px, py, pz);
    this.pose = null;   // { p: THREE.Vector3, q: THREE.Quaternion, fov (vertical, deg), aspect (w / h) }
    this.t = 0;
  }
  apply(pose) {
    const cam = engine.camera;
    cam.position.copy(pose.p);
    cam.quaternion.copy(pose.q);
    let proj = false;
    if (pose.fov && Math.abs(cam.fov - pose.fov) > 1e-4) { cam.fov = pose.fov; proj = true; }
    // a label camera whose image_size is not the window's shape renders with its own aspect
    if (pose.aspect && Math.abs(cam.aspect - pose.aspect) > 1e-6) { cam.aspect = pose.aspect; proj = true; }
    if (proj) cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }
  update(dt) {
    this.t += dt;
    if (this.pose) this.apply(this.pose);
    return { x: this.center.x, y: this.center.y, z: this.center.z };
  }
  speedText() { return `api ${this.t.toFixed(1)}s`; }
}

const hud = {
  stats: document.getElementById('stats'),
  hood: document.getElementById('hood'),
  msg: document.getElementById('msg'),
  loading: document.getElementById('loading'),
  bar: document.querySelector('#bar div'),
};

const isShot = Q.has('shot');
// ?api=1: driven by an external client (server/ + PythonAPI/, protocol in docs/api/protocol.md). It runs the record
// mode's fixed-step simulation: the world only advances when the API ticks it (or free-runs in asynchronous mode).
const isApi = Q.has('api');
const isRecord = Q.has('record') || isApi;        // fixed-timestep trailer capture
const isFly = Q.has('fly') || (isShot && !isRecord && !Q.has('play'));
if (isShot) { hud.loading.style.display = 'none'; document.getElementById('help').style.display = 'none'; }
// clean plate for captures: ?hud=0 (implied by ?record=1) hides the whole
// overlay — crosshair, place name, stats, tether dots, help and toasts
if (isRecord || Q.get('hud') === '0') document.getElementById('hud').style.display = 'none';

async function boot() {
  await streamer.init('tiles');
  if (Q.get('time')) sky.apply(Q.get('time'));
  // bridges
  if (Q.get('bridges') !== '0') try {   // ?bridges=0: diagnostic (2026-09-22, the wbEarthBroadway void half)
    const { buildBridges } = await import('./city/bridgeKit.js');
    buildBridges(streamer.bridges, engine.scene, streamer);
  } catch (e) { console.warn('bridges unavailable', e); }
  // EL14: elevated rail (J/M/Z over Broadway, Myrtle Av el, the IRT 125th St viaduct) — data/elevated.json from
  // tools/pipeline/elevated.mjs; ?el14=0 leaves it out
  try {
    const { buildElevated } = await import('./city/elevatedKit.js');
    await buildElevated(engine.scene);
  } catch (e) { console.warn('elevated rail unavailable', e); }
  // Columbia campus detail kit (steps/walls/monuments/lamps; data from compiler)
  try {
    const { buildCampus } = await import('./city/campus.js');
    buildCampus(engine.scene);
  } catch (e) { console.warn('campus unavailable', e); }
  // never let the (dynamic, optional) landmarks module hold boot hostage:
  // under load Vite took 25 min to serve it and the sims, peds and streamer pump
  // behind this await never started (critic round 2). 30 s cap, then proceed —
  // landmarkFn stays a null builder until the module lands.
  // ?lmwait=<s> raises the cap for harness renders (bshot passes 150): a tile assembled before the module lands never gets
  // its decorate landmark, which is how Whittier Hall lost its roof in the final_v17 plates (2026-09-15).
  const lmWaitMs = Math.max(1, parseInt(Q.get('lmwait') || '30', 10) || 30) * 1000;
  // (the timer is never cleared: warn only if the module really is still out — it used to fire on every page that lived past lmwait)
  let lmIn = false; landmarksReady.then(() => { lmIn = true; });
  await Promise.race([landmarksReady, new Promise((r) => setTimeout(() => { if (!lmIn) console.warn(`[boot] landmarks module still loading after ${lmWaitMs / 1000} s — continuing without it`); r(); }, lmWaitMs))]);

  // sims
  let traffic = null, peds = null, signals = null;
  if (!Q.has('nosim')) {
    try {
      const { Traffic } = await import('./sim/traffic.js');
      let fleet = null, fleet24 = null;
      // PV2 (docs/notes/peds-veh-v2.md): the CARLA 0.10 2024 fleet — textured, three LODs, wheels, lamps.
      // ?fleet24=0 restores the 0.9.15 fleet below.
      if (Q.get('fleet24') !== '0') {
        try {
          const { loadFleet24 } = await import('./sim/fleet24.js');
          fleet24 = await loadFleet24(engine.renderer);
          if (fleet24) fleet = fleet24.trafficFleet;
        } catch (e) { console.warn('fleet24 unavailable, legacy fleet', e); fleet24 = null; }
      }
      if (!fleet) {
        try {
          const { loadCarlaFleet } = await import('./sim/vehicles.js');
          fleet = await loadCarlaFleet();
        } catch (e) { console.warn('CARLA fleet unavailable, placeholder cars', e); }
      }
      traffic = new Traffic(engine.scene, streamer, fleet);
      window.__TRAFFIC = traffic; // harness access (fleet bounds / audits via bshot --eval)
      window.__STREAMER = streamer; // harness access (surfaceInfoAt audits: is every car on asphalt?)
      traffic.camera = engine.camera;
      // culled draw sets for every vehicle pool (view frustum + near shadow box)
      if (fleet24) { try { fleet24.install(traffic, engine); } catch (e) { console.warn('fleet24 renderer failed', e); } }
      else { try { const { installVehicleCulling } = await import('./sim/vehicleCull.js'); installVehicleCulling(traffic, engine); } catch (e) { console.warn('vehicle culling unavailable', e); } }
      if (fleet && Q.has('fleet')) import('./sim/fleetShowroom.js').then((m) => m.installFleetShowroom(traffic, fleet, streamer, Q)).catch((e) => console.warn('fleet showroom unavailable', e));
      if (fleet && Q.has('fleettest')) {
        // debug lineup: every fleet model parked in a row at the camera spawn
        // (?fleettest=1 with x/z params) — deterministic door/orient checks
        const placeFleet = () => {
          const t0 = streamer.terrainAt(px, pz);
          if (t0 == null || !isFinite(t0)) { setTimeout(placeFleet, 500); return; } // tiles not in yet
          const keys = Object.keys(fleet).filter((k) => !k.startsWith('__'));
          keys.forEach((k, i) => {
            const f = fleet[k];
            const gx = px + (i % 8) * 7 - 24, gz = pz + (Math.floor(i / 8) - 0.5) * 14;
            const gy = streamer.terrainAt(gx, gz) ?? t0;
            const m1 = new THREE.Mesh(f.paint, new THREE.MeshStandardMaterial({ color: 0xb03028, roughness: 0.35, metalness: 0.6 }));
            const m2 = new THREE.Mesh(f.dark, new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.6, metalness: 0.25 }));
            for (const m of [m1, m2]) { m.position.set(gx, gy, gz); m.castShadow = m.receiveShadow = true; engine.scene.add(m); }
          });
          // a hooked-claim host too: rack + companion bike land at the spawn
          instancer.claim('bikeRack', px + 10, t0, pz, 0.5);
          instancer.claim('bikeRack', px + 11.6, t0, pz + 1.4, 0.5);
          instancer.flush();
          console.log('[fleettest] placed', keys.join(' '));
        };
        placeFleet();
      }
      // ?nopeds=1 keeps traffic and signals but no walkers (the ad video shows pedestrians as "coming soon")
      if (!Q.has('nopeds')) {
        // PV2: photoreal crowd (CARLA 0.10 walkers, GPU-skinned); ?crowd=0 keeps the procedural mannequins
        let rig = null;
        if (Q.get('crowd') !== '0') {
          try { const { createCrowd } = await import('./sim/crowd.js'); rig = await createCrowd(engine.scene, engine, 700); }
          catch (e) { console.warn('crowd unavailable, mannequins', e); rig = null; }
        }
        const { Peds } = await import('./sim/peds.js');
        peds = new Peds(engine.scene, streamer, traffic, rig);
      }
      const { SignalController } = await import('./sim/signals.js');
      signals = new SignalController(instancer, signalReg, traffic);
    } catch (e) { console.warn('sims unavailable', e); }
  }

  if (isApi) {
    controller = new ApiCam();           // src/api/bridge.js sets its pose and streaming centre
  } else if (isRecord) {
    controller = new PathCam();          // window.__SET_PATH installs the spline
  } else if (isFly) {
    controller = new FlyCam();
  } else if (Q.has('play')) {
    // legacy grapple character (the original TETHER game mode)
    try {
      const { Player } = await import('./game/player.js');   // plain import: see the landmarks note above
      controller = new Player(engine, streamer, sky, hud, new THREE.Vector3(px, py, pz));
    } catch (e) { console.warn('player unavailable, using fly cam', e); controller = new FlyCam(); }
  } else {
    controller = new Explorer(); // boundless.js default: drone (Tab = first person)
  }

  addEventListener('keydown', (e) => {
    if (e.code === 'KeyT') { const m = sky.cycle(); flash(m.toUpperCase()); }
    const spawns = Object.values(SPAWNS);
    const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(e.code);
    if (idx >= 0 && controller) {
      const s = spawns[idx];
      if (controller.pos) { controller.pos.set(s[0], 90, s[1]); controller.vel?.set(0, 0, 0); }
      flash(s[2]);
    }
    if (e.code === 'KeyH') document.getElementById('help').style.display = document.getElementById('help').style.display === 'none' ? 'block' : 'none';
  });

  // weather: ?rain=0..1 sets a fixed downpour; R key toggles a shower live;
  // G opens the live weather/post editor (Tab is the drone/first-person
  // switch). Boot settings come from public/settings/graphics.json.
  const { createWeather, GFX, applyGfx } = await import('./world/weather.js');
  const weather = createWeather(engine.scene, engine.camera, engine);
  let life = null;
  // ?life=0 (recordings, 2026-09-17): no manhole steam or roof plumes — the sprites pop in the ad
  if (new URLSearchParams(location.search).get('life') !== '0') import('./world/life.js').then((m) => { life = m.initLife(engine.scene, engine.camera); }).catch((e) => console.warn('life unavailable', e));
  try {
    const r = await fetch('/settings/graphics.json');
    if (r.ok) { applyGfx(await r.json()); sky.apply(sky.mode); console.log('[gfx] loaded settings/graphics.json'); }
  } catch { /* no saved settings — defaults */ }
  // profiling toggles: ?gfx=taa:0,motionBlur:0 sets any GFX key after the saved
  // settings; ?nopost=1 renders the scene without the composer; ?noshadow=1 /
  // ?nocascade2=1 drop the shadow cascades (tools/bshot.mjs --flags)
  if (Q.get('gfx')) {
    for (const kv of Q.get('gfx').split(',')) {
      const [k, v] = kv.split(':');
      if (k in GFX) GFX[k] = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v;
    }
  }
  if (Q.has('nopost')) engine.gtRaw = true;
  if (Q.has('noshadow')) { engine.sun.castShadow = false; engine.sun2.castShadow = false; }
  if (Q.has('nocascade2')) engine.sun2.castShadow = false;
  const rainQ = Q.get('rain');
  if (rainQ !== null) weather.set(parseFloat(rainQ) || 0.8);
  if (Q.get('snow') !== null) GFX.snow = parseFloat(Q.get('snow')) || 0.8;
  if (Q.get('cloud') !== null) GFX.cloud = parseFloat(Q.get('cloud')) || 0.7;
  if (Q.get('gi') !== null) GFX.gi = parseFloat(Q.get('gi')) || 0; // A/B: ?gi=0 kills SSGI
  if (Q.get('probe') !== null) GFX.probe = parseFloat(Q.get('probe')) || 0;
  if (Q.get('tonemap')) GFX.toneMap = Q.get('tonemap');
  if (Q.get('lut')) GFX.lut = Q.get('lut');
  if (Q.get('cityao') !== null) GFX.cityAO = parseFloat(Q.get('cityao')) || 0;
  if (Q.get('haze') !== null) GFX.hazeDensity = parseFloat(Q.get('haze')) || 0;
  if (Q.has('hdri')) sky.setHDRI(Q.get('hdri') || true); // ?hdri or ?hdri=<name>
  // ?cartest=1: glTF vehicle import feasibility probe — loads a sample GLB at
  // the spawn point (CARLA .uasset assets need offline conversion first)
  if (Q.has('cartest')) {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    new GLTFLoader().load(Q.get('carglb') || 'models/carla_tesla_static.glb', (g) => {
      const m = g.scene;
      m.position.set(px + 6, (streamer.terrainAt(px + 6, pz - 4) ?? 40) + 0.05, pz - 4);
      m.rotation.y = 0.6; // CUE4Parse glTF is already in meters
      m.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true;
        // CARLA glTF carries material slots, not baked textures — assign PBR
        // materials by slot name (the traffic integration path: per-instance paint)
        const n = (o.material?.name || '').toLowerCase();
        if (n.includes('bodywork') || n.includes('licenseplate')) {
          o.material = new THREE.MeshStandardMaterial({ color: 0x8a1f1f, metalness: 0.75, roughness: 0.32 });
        } else if (n.includes('glass')) {
          o.material = new THREE.MeshStandardMaterial({ color: 0x101418, metalness: 0.4, roughness: 0.08, transparent: true, opacity: 0.85 });
        } else if (n.includes('wheel')) {
          o.material = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, metalness: 0.3, roughness: 0.75 });
        } else if (n.includes('light')) {
          o.material = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.2, roughness: 0.25, emissive: 0x333333 });
        } else {
          o.material = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, metalness: 0.35, roughness: 0.55 });
        }
      });
      engine.scene.add(m);
      const bb = new THREE.Box3().setFromObject(m); console.log('[cartest] loaded, bbox', JSON.stringify(bb.min), JSON.stringify(bb.max));
    }, undefined, (e) => console.warn('[cartest] failed', e));
  }
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyR') weather.set(weather.wet > 0.25 ? 0 : 0.8);
  });
  import('./ui/editor.js').then((m) => m.initEditor({ engine, sky })).catch((e) => console.warn('editor unavailable', e));
  import('./city/props.js').then((m) => m.upgradeProps(instancer)).catch((e) => console.warn('props unavailable', e));
  import('./city/trees.js').then((m) => m.upgradeTrees(instancer)).catch((e) => console.warn('trees unavailable', e));

  const audio = initAudio();
  // ---- scenario config (?scenario=url): reproducible runs for data generation
  // JSON: { time, gfx: {...GFX}, seed, cars, hdri, rain }
  if (Q.has('scenario')) {
    try {
      const sc = await (await fetch(Q.get('scenario'))).json();
      if (sc.seed) { // deterministic sims: seeded PRNG replaces Math.random
        let s0 = sc.seed | 0 || 1;
        Math.random = () => {
          s0 |= 0; s0 = (s0 + 0x6d2b79f5) | 0;
          let z2 = Math.imul(s0 ^ (s0 >>> 15), 1 | s0);
          z2 = (z2 + Math.imul(z2 ^ (z2 >>> 7), 61 | z2)) ^ z2;
          return ((z2 ^ (z2 >>> 14)) >>> 0) / 4294967296;
        };
      }
      if (sc.gfx) applyGfx(sc.gfx);
      if (sc.time) sky.apply(sc.time);
      if (sc.hdri) sky.setHDRI(sc.hdri);
      if (sc.rain !== undefined) weather.set(sc.rain);
      if (sc.cars !== undefined && traffic) traffic.target = sc.cars;
      console.log('[scenario] applied', Q.get('scenario'));
    } catch (e) { console.warn('scenario failed', e); }
  }
  // ---- camera products: P photo mode, L copy deep link, O auto tour
  let tour = null;
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyP') {
      const hud2 = document.getElementById('hud');
      hud2.style.display = hud2.style.display === 'none' ? '' : 'none';
      flash(hud2.style.display === 'none' ? 'PHOTO MODE' : 'HUD ON');
    }
    if (e.code === 'KeyL' && controller && controller.pos) {
      const c2 = controller;
      const url = location.origin + location.pathname +
        '?x=' + c2.pos.x.toFixed(1) + '&y=' + c2.pos.y.toFixed(1) + '&z=' + c2.pos.z.toFixed(1) +
        '&yaw=' + (c2.yaw ?? 0).toFixed(3) + '&pitch=' + (c2.pitch ?? 0).toFixed(3) + '&time=' + sky.mode;
      navigator.clipboard?.writeText(url).then(() => flash('LINK COPIED')).catch(() => flash(url));
    }
    if (e.code === 'KeyO' && controller && controller.pos) {
      tour = tour ? null : { i: 0, t: 0 };
      flash(tour ? 'AUTO TOUR (O TO STOP)' : 'TOUR OFF');
    }
    if (tour && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) { tour = null; flash('TOUR OFF'); }
  });
  const tourStops = Object.values(SPAWNS);
  const tourStep = (dt) => {
    if (!tour || !controller || !controller.pos) return;
    const A = tourStops[tour.i % tourStops.length];
    const B = tourStops[(tour.i + 1) % tourStops.length];
    tour.t += dt / 55; // ~55s per leg
    if (tour.t >= 1) { tour.t = 0; tour.i++; return; }
    const tt = tour.t < 0.5 ? 2 * tour.t * tour.t : 1 - (2 - 2 * tour.t) ** 2 / 2; // ease
    const x = A[0] + (B[0] - A[0]) * tt, z = A[1] + (B[1] - A[1]) * tt;
    const g = streamer.terrainAt(x, z);
    controller.pos.set(x, (g !== null && isFinite(g) ? g : 30) + 95 + Math.sin(tour.t * 3.14) * 45, z);
    if (controller.vel) controller.vel.set(0, 0, 0);
    const lookT = Math.min(1, tt + 0.04);
    const lx = A[0] + (B[0] - A[0]) * lookT, lz = A[1] + (B[1] - A[1]) * lookT;
    controller.yaw = Math.atan2(-(lx - controller.pos.x), -(lz - controller.pos.z));
    controller.pitch = -0.42;
  };
  // named storefronts (src/city/namedShops.js): real shops modelled on their real frontages (W 120th & Amsterdam)
  try {
    const { initNamedShops } = await import('./city/namedShops.js');
    window.__NAMED_SHOPS = initNamedShops({ scene: engine.scene, streamer, instancer });
  } catch (e) { console.warn('named shops unavailable', e); }
  // ground-truth export (window.__GT: boxes JSON + ?gt=seg instance masks)
  try {
    const { initGT } = await import('./world/gt.js');
    const gt = initGT(engine, { traffic, peds, scene: engine.scene, facadeMat, groundMat, farMat, instancer });
    window.__gtRefs = { traffic, peds };
    if (Q.get('gt')) setTimeout(() => gt.setMode(Q.get('gt')), 4000); // after tiles stream in
  } catch (e) { console.warn('gt unavailable', e); }
  // PERCEPTION OUTPUT — semantic / instance / depth / AMODAL ground truth.
  // window.__PERC (docs/notes/perception.md); ?seg=<mode> renders it on screen.
  // Inert unless a mode is entered: normal rendering is untouched.
  try {
    const { initPerception } = await import('./perception/segRender.js');
    const perc = initPerception(engine, {
      scene: engine.scene, streamer, instancer, dresser, heroes, traffic, peds, sky,
      groundMat, farMat,
    });
    if (Q.get('seg')) {
      // the world has to be in before a label means anything — and the tile
      // UNDER the camera specifically (streamer.readyUnder), which is the same
      // gate the shot harnesses use to reject open-water frames
      const arm = () => (streamer.readyUnder() && streamer.stats.near > 4
        ? perc.enter(Q.get('seg')) : setTimeout(arm, 500));
      setTimeout(arm, 2500);
    }
  } catch (e) { console.warn('perception unavailable', e); }
  let frames = 0;
  // ?prof=1: per-subsystem CPU time per frame (ms), read with window.__PROF()
  const PROF = Q.has('prof') ? { t: {}, n: 0 } : null;
  const tick = (name, fn) => {
    if (!PROF) return fn();
    const t0 = performance.now();
    const r = fn();
    PROF.t[name] = (PROF.t[name] || 0) + performance.now() - t0;
    return r;
  };
  engine.prof = PROF;
  let apiHooks = null;   // ?api=1: src/api/bridge.js (preStep: API-driven actors + camera, postStep: sensors' poses)
  engine.onFrame = (dt) => {
    tick('sky', () => sky.update(dt));
    tick('weather', () => weather.update(dt));
    tick('life', () => life?.update(dt));
    tourStep(dt);
    if (apiHooks) tick('api', () => apiHooks.preStep(dt));
    const p = tick('controller', () => controller ? controller.update(dt) : { x: px, z: pz });
    spawnGuard.update(engine.camera);   // film takes: traffic / walkers never spawn in view (window.__SPAWNGUARD)
    tick('sun', () => engine.updateSun(sky.sunDir, p.x, p.y ?? 50, p.z));
    tick('streamer', () => streamer.update(p.x, p.z));
    if (traffic) tick('traffic', () => traffic.update(dt, p.x, p.z));
    if (peds) tick('peds', () => peds.update(dt, p.x, p.z));
    if (apiHooks) apiHooks.postStep(dt);
    if (signals) tick('signals', () => signals.update(dt));
    tick('dresser', () => dresser?.update(p.x, p.z));
    tick('heroes', () => heroes.update(p.x, p.z));
    tick('audio', () => audio.update(dt, { cars: traffic ? traffic.cars.length : 0, alt: p.y - (streamer.terrainAt(p.x, p.z) ?? p.y), night: ENV.night.value, wet: ENV.wet.value, wind: ENV.windAmp.value }));
    tick('flush', () => { instancer.flush(); instancer.cull(engine.camera); });
    if (PROF) PROF.n++;
    frames++;
    if (frames % 10 === 0) {
      hud.stats.textContent = `${engine.fps.toFixed(0)} fps · tiles ${streamer.stats.near} · lod ${streamer.stats.macro}${dresser ? ` · dressed ${dresser.active.size}` : ''} · ${controller?.speedText?.() ?? ''}`;
      const total = Object.keys(streamer.manifest.macros).length;
      hud.bar.style.width = `${(streamer.stats.macro / total) * 100}%`;
      if (hud.loading.style.opacity !== '0' && streamer.stats.near > 4 && frames > 90) {
        hud.loading.style.opacity = '0';
        setTimeout(() => (hud.loading.style.display = 'none'), 800);
      }
      if (isShot && frames > 60 && streamer.idle()) window.__READY = true;
    }
  };

  // ---- ?record=1 : fixed-timestep trailer capture --------------------------
  // The real-time loop keeps running (tiles stream, the dresser drains its
  // build queue, shaders compile) but the SIMULATION only advances when the
  // recorder asks for a step, and always by exactly the same dt. Frames can
  // take a second each without the camera or the traffic skipping.
  if (isRecord) {
    const realFrame = engine.onFrame;
    let pending = 0, threw = 0;
    // A throw anywhere in the frame body (a module mid-edit under HMR, a pool that
    // briefly has no free() ...) would otherwise skip composer.render() for the
    // rest of the run and the recorder would happily screenshot a frozen image.
    // Swallow it here so the render still happens, and count it for __RECSTAT.
    // ?api=1 asynchronous mode (src/api/bridge.js sets window.__FREERUN_ON): the sim free-runs on real time
    engine.onFrame = (rdt) => {
      const sdt = pending || (window.__FREERUN_ON ? Math.min(0.1, rdt || 0) : 0); pending = 0;
      try { realFrame(sdt); } catch (e) { if (!threw++) console.warn('[record] frame body threw:', e); }
    };
    // install a camera path (tools/trailer/paths.json, injected by the recorder)
    window.__SET_PATH = (p) => (controller instanceof PathCam ? controller.setPath(p) : 'not a PathCam');
    // advance the world by one fixed step and resolve once that frame is up
    window.__advance = (dt = 1 / 30) => new Promise((res) => {
      pending = dt;
      const wait = () => (pending === 0 ? requestAnimationFrame(() => res(true)) : requestAnimationFrame(wait));
      requestAnimationFrame(wait);
    });
    window.__ADVANCE = window.__advance;
    // the recorder turns the spawn guard ON for a take's capture and OFF for its warm-up (sim/spawnGuard.js)
    window.__SPAWNGUARD = (on = true) => { spawnGuard.on = !!on; spawnGuard.update(engine.camera); return spawnGuard.on; };
    // ...and empties the crowd once the world has settled, so the warm-up repopulates it around the lens (sim/peds.js reset)
    window.__PEDS_RESET = () => { if (!peds) return -1; peds.reset(); return peds.peds.length; };
    // ...and drops the TAA history before a re-shot frame (a void frame must not survive in the history)
    window.__TAA_RESET = () => { if (engine.taa) engine.taa._first = true; return !!engine.taa; };
    // ...and clears the kerb trees whose trunks stand within `r` m of a take's lens path (x,z points) for that take: the
    // W 122nd dollies ran through the FD14 crowns (film 7 review). Returns the number of tree parts hidden.
    window.__CLEAR_TREES = (pts, r = 5) => {
      let n = 0;
      const near = (x, z) => {
        for (let i = 1; i < pts.length; i++) {
          const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
          if (Math.hypot(x - ax - dx * t, z - az - dz * t) < r) return true;
        }
        return false;
      };
      for (const p of instancer.pools.values()) {
        if (!p.isTree || !p.alive) continue;
        for (let s = 0; s < p.top; s++) if (p.alive[s] && near(p.pos[s * 3], p.pos[s * 3 + 2])) { p.alive[s] = 0; n++; }
        p.ver = (p.ver | 0) + 1;
        p.dirty = p.sdirty = p.fdirty = true;
      }
      return n;
    };
    // tear-proof frame capture for the recorder (engine.capture: canvas read back in the render's own task);
    // resolves with a data URL of the NEXT rendered frame — the sim does not advance (pending stays 0)
    window.__capture = (type = 'image/jpeg', q = 0.95) => engine.capture(type, q);
    // everything the recorder needs to decide whether the frame is settled
    window.__RECSTAT = () => ({
      ready: !!window.__READY,
      // engine.frames only advances on a frame that reached composer.render():
      // the recorder uses it as a liveness check before every screenshot
      frames: engine.frames,
      threw,
      idle: streamer.idle(),
      near: streamer.stats.near,
      macro: streamer.stats.macro,
      outstanding: streamer.outstanding,
      dressQ: dresser ? dresser.queue.length : 0,
      dressActive: dresser ? dresser.active.size : 0,
      cars: traffic ? traffic.cars.length : 0,
      peds: peds ? peds.peds.length : 0,
      fps: +engine.fps.toFixed(1),
      t: +(controller?.t ?? 0).toFixed(3),
      pos: [+engine.camera.position.x.toFixed(1), +engine.camera.position.y.toFixed(1), +engine.camera.position.z.toFixed(1)],
    });
    console.log('[record] fixed-step capture armed');
    if (isApi) {
      try {
        const { initApi } = await import('./api/bridge.js');
        apiHooks = initApi({ engine, streamer, traffic, peds, signals, sky, weather, dresser, instancer, cam: controller, spawnGuard });
      } catch (e) { console.error('[api] bridge failed to start', e); }
    }
  }
}
// layer probe: hide scene layers cumulatively inside ONE session and sample fps
// after each step (removes the run-to-run noise of separate launches)
window.__LAYERS = async (sampleMs = 3000) => {
  const sample = () => new Promise((res) => {
    const f0 = engine.frames; const t0 = performance.now();
    setTimeout(() => res(+(((engine.frames - f0) * 1000) / (performance.now() - t0)).toFixed(1)), sampleMs);
  });
  const out = {};
  const setVis = (pred, v) => { engine.scene.traverse((o) => { if (pred(o)) o.visible = v; }); };
  out.base = await sample();
  streamer.macroGroup.visible = false; out.noMacros = await sample();
  setVis((o) => /^pool/.test(o.name || ''), false); out.noFurniture = await sample();
  setVis((o) => o.isMesh && o.material?.userData?.isFacade, false); out.noTileBuildings = await sample();
  setVis((o) => o.isMesh && o.material === groundMat, false); out.noGround = await sample();
  setVis((o) => o.userData?.nycDress, false); out.noDresser = await sample();
  setVis((o) => o.isMesh && /^tile_/.test(o.parent?.name || '') , false); out.noTileRest = await sample();
  if (window.__gtRefs?.traffic) { for (const p of Object.values(window.__gtRefs.traffic.pools)) { if (p.paint) p.paint.visible = false; if (p.dark) p.dark.visible = false; if (p.mesh) p.mesh.visible = false; } }
  out.noCars = await sample();
  engine.sun.castShadow = false; out.noShadow = await sample();
  const info = engine.renderer.info.render;
  out.callsLeft = info.calls; out.trisLeft = info.triangles;
  return out;
};
// per-pass profile: CPU submit ms, GPU ms (EXT_disjoint_timer_query_webgl2),
// draw calls and triangles per composer pass, averaged over nFrames.
// freezeShadow=true keeps the near shadow map (sun.shadow.autoUpdate=false)
// so the prepass delta isolates the shadow-caster pass cost (lossless while
// the camera is still).
window.__PASSES = (nFrames = 90, freezeShadow = false) => new Promise((resolve) => {
  const r = engine.renderer, gl = r.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const passes = engine.composer.passes;
  const names = passes.map((p, i) => p.constructor.name + (passes.findIndex((q) => q.constructor.name === p.constructor.name) !== i ? i : ''));
  const acc = names.map(() => ({ cpu: 0, gpu: 0, gpuN: 0, calls: 0, tris: 0 }));
  const pending = [];
  const info = r.info;
  const origs = passes.map((p) => p.render);
  const origCR = engine.composer.render.bind(engine.composer);
  const prevAuto = engine.sun.shadow.autoUpdate;
  if (freezeShadow) engine.sun.shadow.autoUpdate = false;
  let frames = 0, wall0 = 0, wall = 0;
  info.autoReset = false;
  const poll = () => {
    for (let k = pending.length - 1; k >= 0; k--) {
      const { q, i } = pending[k];
      if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) { acc[i].gpu += gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; acc[i].gpuN++; }
        gl.deleteQuery(q); pending.splice(k, 1);
      }
    }
  };
  const finish = () => {
    passes.forEach((p, i) => { p.render = origs[i]; });
    engine.composer.render = origCR;
    setTimeout(() => {
      poll();
      info.autoReset = true;
      engine.sun.shadow.autoUpdate = prevAuto;
      const out = { frames, ext: !!ext, freezeShadow, frameMs: +((wall - wall0) / frames).toFixed(2), passes: {} };
      let gpuSum = 0, cpuSum = 0;
      names.forEach((n, i) => {
        if (!passes[i].enabled) return;
        const a = acc[i];
        const gpu = a.gpuN ? a.gpu / a.gpuN : null;
        gpuSum += gpu || 0; cpuSum += a.cpu / frames;
        out.passes[n] = { cpu: +(a.cpu / frames).toFixed(2), gpu: gpu === null ? null : +gpu.toFixed(2), calls: Math.round(a.calls / frames), tris: Math.round(a.tris / frames) };
      });
      out.gpuSum = +gpuSum.toFixed(2); out.cpuSum = +cpuSum.toFixed(2);
      resolve(out);
    }, 400);
  };
  engine.composer.render = (dt) => {
    info.reset();
    if (frames === 0) wall0 = performance.now();
    origCR(dt);
    wall = performance.now();
    frames++;
    poll();
    if (frames >= nFrames) finish();
  };
  passes.forEach((p, i) => {
    p.render = function (...a) {
      const c0 = info.render.calls, t0 = info.render.triangles, s0 = performance.now();
      let q = null;
      if (ext) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
      origs[i].apply(this, a);
      if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push({ q, i }); }
      acc[i].cpu += performance.now() - s0;
      acc[i].calls += info.render.calls - c0;
      acc[i].tris += info.render.triangles - t0;
    };
  });
});
// deterministic triangle/draw-call breakdown per scene layer: renders one
// frame per step with the near shadow map frozen (scene pass only) and one
// with it refreshed (scene + near shadow), reading renderer.info deltas.
// Hidden layers are restored afterwards. No fps sampling, no recompiles.
window.__TRIS = async () => {
  const info = engine.renderer.info;
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const count = async (shadow) => {
    // frozen: autoUpdate=false and needsUpdate=false -> no caster pass
    engine.sun.shadow.autoUpdate = shadow; engine.sun.shadow.needsUpdate = shadow;
    const f0 = engine.frames;
    await nextFrame();
    info.autoReset = false; info.reset();
    const f1 = engine.frames;
    await nextFrame();
    const n = Math.max(1, engine.frames - f1);
    const out = { calls: Math.round(info.render.calls / n), tris: Math.round(info.render.triangles / n) };
    info.autoReset = true;
    return out;
  };
  const hidden = [];
  const hide = (pred) => { engine.scene.traverse((o) => { if (o.visible && pred(o)) { o.visible = false; hidden.push(o); } }); };
  const steps = { all: null };
  for (const L of ['macros', 'batches', 'cars', 'parked', 'peds', 'dresser', 'tileBuildings', 'ground', 'tileRest', 'heroes', 'water']) steps['no' + L[0].toUpperCase() + L.slice(1)] = () => hide(__layerPred[L]);

  const out = {};
  const prevAuto = engine.sun.shadow.autoUpdate;
  for (const [k, fn] of Object.entries(steps)) {
    if (fn) fn();
    const a = await count(false), b = await count(true);
    out[k] = { calls: a.calls, tris: a.tris, shCalls: b.calls - a.calls, shTris: b.tris - a.tris };
  }
  for (const o of hidden) o.visible = true;
  engine.sun.shadow.autoUpdate = prevAuto; engine.sun.shadow.needsUpdate = true;
  // deltas: what each layer contributed (previous step minus this step)
  const keys = Object.keys(out), d = {};
  for (let i = 1; i < keys.length; i++) {
    const p = out[keys[i - 1]], c = out[keys[i]];
    d[keys[i].replace(/^no/, '')] = { calls: p.calls - c.calls, tris: p.tris - c.tris, shCalls: p.shCalls - c.shCalls, shTris: p.shTris - c.shTris };
  }
  d.rest = out[keys[keys.length - 1]];
  return { total: out.all, layers: d };
};
// instancer pool census: triangles per instance x active instances
window.__POOLS = (top = 25) => {
  const rows = [];
  for (const [name, p] of instancer.pools) {
    const g = p.geo || p.srcGeo || p.mesh?.geometry;
    const tri = g ? Math.round((g.index ? g.index.count : g.attributes?.position?.count || 0) / 3) : 0;
    const n = p.hmap ? p.hmap.size : (p.top || 0) - (p.free?.length || 0);
    rows.push([name, tri, n, tri * n]);
  }
  rows.sort((a, b) => b[3] - a[3]);
  const total = rows.reduce((s, r) => s + r[3], 0);
  return { totalM: +(total / 1e6).toFixed(2), pools: rows.slice(0, top).map((r) => `${r[0]}: ${r[1]}tri x${r[2]} = ${(r[3] / 1e6).toFixed(2)}M`) };
};
// named scene layers for external (Node-driven) fps sampling: __LAYER(name, vis)
// toggles one layer without touching shader programs; __FRAMES() returns the
// frame counter + clock so the harness samples fps without an in-page await.
const __layerPred = {
  macros: (o) => o === streamer.macroGroup,
  batches: (o) => /^pool/.test(o.name || ''),
  dresser: (o) => !!o.userData?.nycDress,
  cars: (o) => /^vehS?:m:/.test(o.name || ''),
  parked: (o) => /^vehS?:p:/.test(o.name || ''),
  peds: (o) => o === window.__gtRefs?.peds?.mesh,
  crowd: (o) => /^pedS?:/.test(o.name || ''),   // PV2 photoreal walkers (sim/crowd.js render sets)
  tileBuildings: (o) => o.isMesh && !!o.material?.userData?.isFacade,
  ground: (o) => o.isMesh && o.material === groundMat,
  tileRest: (o) => o.isMesh && (/^tile_/.test(o.parent?.name || '') || /^signs:/.test(o.name || '')),
  heroes: (o) => o.isMesh && o.material === heroes.mat,
  water: (o) => o.isMesh && o.geometry?.attributes?.position?.count === 4 && o.material?.type === 'ShaderMaterial',
};
const __layerHidden = new Map();
window.__LAYER = (name, vis) => {
  const pred = __layerPred[name];
  if (!pred) return 'unknown layer ' + name;
  if (!vis) {
    const list = [];
    engine.scene.traverse((o) => { if (o.visible && pred(o)) { o.visible = false; list.push(o); } });
    __layerHidden.set(name, list);
    return list.length;
  }
  const list = __layerHidden.get(name) || [];
  for (const o of list) o.visible = true;
  __layerHidden.delete(name);
  return list.length;
};
window.__FRAMES = () => ({ frames: engine.frames, t: performance.now() });
window.__FREEZE_SHADOW = (on) => { engine.sun.shadow.autoUpdate = !on; engine.sun.shadow.needsUpdate = !on; engine.sun2.shadow.autoUpdate = false; if (!on) engine.sun2.shadow.needsUpdate = true; return on; };
// what is still drawn once every known layer is hidden: visible meshes grouped
// by a label (traffic pools identified by reference), with counts and tris
window.__REST = (top = 40) => {
  const t = window.__gtRefs?.traffic;
  const tag = new Map();
  if (t) {
    for (const [k, p] of Object.entries(t.pools)) { tag.set(p.mb, `car:${k}:paint`); tag.set(p.md, `car:${k}:dark`); }
    if (t.parked) for (const [k, p] of Object.entries(t.parked)) { tag.set(p.mb, `parked:${k}:paint`); tag.set(p.md, `parked:${k}:dark`); if (p.shell) tag.set(p.shell, `parked:${k}:shell`); }
  }
  if (window.__gtRefs?.peds?.mesh) tag.set(window.__gtRefs.peds.mesh, 'peds');
  const agg = {};
  engine.scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    let p = o; let anc = false; while (p) { if (!p.visible) { anc = true; break; } p = p.parent; }
    if (anc) return;
    const g = o.geometry;
    const n = g ? (g.index ? g.index.count : g.attributes?.position?.count || 0) / 3 : 0;
    const inst = o.isInstancedMesh ? o.count : 1;
    const key = tag.get(o) || (o.isBatchedMesh ? 'batch' : `${o.name || '-'}|${o.parent?.name || '-'}|${o.material?.name || o.material?.type}|${o.isInstancedMesh ? 'inst' : 'mesh'}`);
    const a = agg[key] || (agg[key] = { meshes: 0, tris: 0, inst: 0 });
    a.meshes++; a.tris += n * inst; a.inst += inst;
  });
  return Object.entries(agg).sort((a, b) => b[1].tris - a[1].tris).slice(0, top).map(([k, v]) => `${k}: ${v.meshes} mesh, ${v.inst} inst, ${(v.tris / 1e6).toFixed(2)}M tris`);
};
// who are the anonymous meshes: first n visible meshes of a material type with
// their ancestor chain, shadow flags and sizes
window.__WHO = (matType = 'MeshLambertMaterial', n = 6) => {
  const out = [];
  engine.scene.traverse((o) => {
    if (out.length >= n || !o.isMesh || !o.visible || o.material?.type !== matType) return;
    if (o.name && /^pool|^batch/.test(o.name)) return;
    const chain = []; let p = o.parent; while (p) { chain.push(p.name || p.type); p = p.parent; }
    const g = o.geometry;
    out.push({ name: o.name, chain: chain.join('<'), cast: o.castShadow, recv: o.receiveShadow, inst: o.isInstancedMesh ? o.count : 0,
      verts: g?.attributes?.position?.count ?? 0, idx: g?.index?.count ?? 0, pos: o.position.toArray().map((v) => +v.toFixed(1)), matName: o.material.name, map: !!o.material.map, order: o.renderOrder });
  });
  return out;
};
// attribution only: drop furniture/vehicle casters from the shadow passes
window.__SHADOWSETS = (on) => { Instancer.shadowSets = !!on; return Instancer.shadowSets; };
window.__INST = instancer; window.__STREAMER = streamer;
// A/B toggles for in-session measurement (bshot --ab)
window.__SORT = (on) => { engine.renderer.setOpaqueSort(on ? engine._opaqueSortBS : null); return !!on; };
window.__SKYORDER = (n) => { sky.sky.renderOrder = n; return n; };
window.__SHADOWDBG = () => [...instancer.pools.values()].filter((p) => p.n > 0 && p.shadow).slice(0, 40)
  .map((p) => p.name + ': main ' + p.mesh.count + '/' + (p.mesh2 ? p.mesh2.count : '-') + ' shadow ' + p.shadow.count + '/' + (p.shadow2 ? p.shadow2.count : '-') + ' far ' + (p.far ? p.far.count : '-') + ' n ' + p.n);
// snap the shot camera to the nearest traffic junction: offset (dx, dz) metres
// from the node, dy above the sidewalk, looking at the node with the given pitch
window.__GOTO_NODE = (dx = 14, dz = 10, dy = 1.7, pitch = -0.12) => {
  if (Number.isNaN(dx)) dx = 'corner';
  const t = window.__gtRefs?.traffic;
  if (!controller) return 'no controller';
  const cx = controller.pos.x, cz = controller.pos.z;
  let best = null, bd = 1e9;
  if (t && t._nkGrid) {
    // node positions live in the canonical-key grid; keep real junctions (3+ legs)
    for (const arr of t._nkGrid.values()) {
      for (const p of arr) {
        const n = t.nodes.get(p.k);
        if (!n || !n.out || n.out.length < 3) continue;
        const d = Math.hypot(p.x - cx, p.z - cz);
        if (d < bd) { bd = d; best = p; }
      }
    }
  }
  if (!best) {
    // traffic not up yet (slow loads): fall back to the tiles' signalized junction nodes
    for (const rec of streamer.tiles.values()) {
      for (const n of (rec.data && rec.data.nodes) || []) {
        if (!n.signal) continue;
        const d = Math.hypot(n.x - cx, n.z - cz);
        if (d < bd) { bd = d; best = { x: n.x, z: n.z }; }
      }
    }
  }
  if (!best) return 'no node';
  let gx = best.x + dx, gz = best.z + dz;
  if (dx === 'corner' || dx === 0 && dz === 'corner') {
    // stand on a corner sidewalk: of 48 points on a ring around the node, take
    // the one farthest from every roadway (distance to edge centreline - half width)
    const R = typeof dy === 'number' && dy > 3 ? dy : 15;
    const edges = [...t.edges.values()].filter((e) => Math.hypot(e.pts[0][0] - best.x, e.pts[0][2] - best.z) < 80 || Math.hypot(e.pts[e.pts.length - 1][0] - best.x, e.pts[e.pts.length - 1][2] - best.z) < 80);
    const clear = (x, z) => {
      let m = 1e9;
      for (const e of edges) {
        const P = e.pts;
        for (let i = 1; i < P.length; i++) {
          const ax = P[i - 1][0], az = P[i - 1][2], bx = P[i][0], bz = P[i][2];
          const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1e-9;
          const tt = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
          const d = Math.hypot(x - (ax + vx * tt), z - (az + vz * tt)) - e.width / 2;
          if (d < m) m = d;
        }
      }
      return m;
    };
    let bestA = 0, bestC = -1e9;
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      const c = clear(best.x + Math.cos(a) * R, best.z + Math.sin(a) * R);
      if (c > bestC) { bestC = c; bestA = a; }
    }
    gx = best.x + Math.cos(bestA) * R; gz = best.z + Math.sin(bestA) * R;
    dy = 1.7;
  }
  const g = streamer.terrainAt(gx, gz);
  controller.pos.set(gx, (g ?? controller.pos.y) + 0.3 + dy, gz);
  controller.yaw = Math.atan2(-(best.x - gx), -(best.z - gz));
  controller.pitch = pitch;
  if (controller.vel) controller.vel.set(0, 0, 0);
  return { node: [Math.round(best.x), Math.round(best.z)], dist: Math.round(bd), cam: [Math.round(gx), +controller.pos.y.toFixed(1), Math.round(gz)] };
};
// frame profile: average ms per frame per subsystem (needs ?prof=1)
window.__PROF_RESET = () => { const P = engine.prof; if (P) { P.n = 0; P.t = {}; } engine.profRender = null; };
window.__PROF = () => {
  const P = engine.prof;
  if (!P || !P.n) return 'no profile (?prof=1)';
  const out = { frames: P.n };
  for (const [k, v] of Object.entries(P.t)) out[k] = +(v / P.n).toFixed(2);
  if (engine.profRender) { out.render = +(engine.profRender.t / Math.max(1, engine.profRender.n)).toFixed(2); out.frame = +(engine.profRender.f / Math.max(1, engine.profRender.n)).toFixed(2); }
  out.batches = instancer.subCount ? instancer.subCount() : null;
  if (instancer.stats) { out.inst = instancer.stats.mainInst; out.shInst = instancer.stats.shadowInst; out.cullMs = +instancer.stats.cullMs.toFixed(2); }
  return out;
};
// NYC dresser diagnostics: active/queued counts, build time, pool draw calls
window.__DRESS = () => dresser ? {
  active: dresser.active.size, queued: dresser.queue.length, built: dresser.stats.built,
  skipped: dresser.stats.skipped, msPerBuild: dresser.stats.built ? +(dresser.stats.ms / dresser.stats.built).toFixed(1) : 0,
  drawCalls: dresser.drawCalls(), tiles: dresser.tiles.size,
  recs: [...dresser.tiles.values()].reduce((a, t) => a + t.recs.length, 0),
  night: dresser._nightOn,
  buckets: dresser.pools.buckets ? [...dresser.pools.buckets.entries()].map(([k, b]) => k + ' live=' + b.live + ' vis=' + b.mesh.visible) : null,
} : 'no dresser';
// perf snapshot: fps + renderer counters accumulated over one full frame
// (info auto-resets per render pass, so a sync read only sees the last pass)
window.__PERF = () => new Promise((res) => {
  const info = engine.renderer.info;
  info.autoReset = false;
  info.reset();
  const f0 = engine.frames;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const n = Math.max(1, engine.frames - f0);
    const out = {
      fps: +engine.fps.toFixed(1),
      frames: n,
      calls: Math.round(info.render.calls / n),
      tris: Math.round(info.render.triangles / n),
      geoms: info.memory.geometries,
      texs: info.memory.textures,
      progs: info.programs.length,
    };
    info.autoReset = true;
    res(out);
  }));
});
// triangle census by object/pool name (visible meshes; instances multiplied)
window.__SCENE = (top = 24) => {
  const agg = {};
  engine.scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const g = o.geometry;
    const n = (g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0) / 3;
    if (o.isBatchedMesh) {
      let tri = 0;
      const gi = o._geometryInfo || [], ii = o._instanceInfo || [];
      for (const it of ii) { if (it.active && it.visible && gi[it.geometryIndex]) tri += (gi[it.geometryIndex].indexCount || gi[it.geometryIndex].vertexCount) / 3; }
      const key = 'batch:' + (o.material?.name || o.material?.type);
      agg[key] = (agg[key] || 0) + tri;
      return;
    }
    const inst = o.isInstancedMesh ? o.count : 1;
    const key = o.isInstancedMesh
      ? (o.name || `inst[${Math.round(n)}tri x${inst}]`)
      : (o.name || o.material?.name || o.parent?.name || 'anon');
    agg[key] = (agg[key] || 0) + n * inst;
  });
  return Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, top)
    .map(([k, v]) => `${k}=${(v / 1e6).toFixed(2)}M`);
};
// motion-shimmer meter: mean |Δ| between two frames half-a-pixel of yaw apart
window.__SHIMMER = (dyaw = 0.0005) => {
  const gl = engine.renderer.domElement;
  const cv = document.createElement('canvas');
  cv.width = 600; cv.height = 400;
  const c2 = cv.getContext('2d');
  const grab = () => {
    engine.composer.render();
    c2.drawImage(gl, gl.width / 2 - 300, gl.height / 2 - 200, 600, 400, 0, 0, 600, 400);
    return c2.getImageData(0, 0, 600, 400).data.slice();
  };
  const a = grab();
  engine.camera.rotateY(dyaw);
  const b = grab();
  engine.camera.rotateY(-dyaw);
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  return sum / (a.length / 4) / 3;
};
window.__PICK = async (nx, ny) => {
  const { Raycaster, Vector2 } = await import('three');
  const rc = new Raycaster();
  rc.setFromCamera(new Vector2(nx * 2 - 1, -(ny * 2 - 1)), engine.camera);
  const hits = rc.intersectObjects(engine.scene.children, true).slice(0, 3);
  return hits.map((h) => ({
    d: +h.distance.toFixed(1),
    name: h.object.name || h.object.parent?.name || h.object.type,
    mat: h.object.material?.type,
    geoV: h.object.geometry?.attributes?.position?.count,
    inst: h.instanceId ?? null,
    mid: h.face && h.object.geometry?.attributes?.matId ? h.object.geometry.attributes.matId.getX(h.face.a) : null,
    x: +h.point.x.toFixed(1),
    y: +h.point.y.toFixed(2),
    z: +h.point.z.toFixed(1),
  }));
};
window.__TRAFFIC = () => {
  if (!window.__gtRefs?.traffic) return 'no traffic ref';
  const t = window.__gtRefs.traffic;
  const edges = [...t.edges.values()];
  return {
    edges: t.edges.size, cars: t.cars.length, target: t.target,
    minor: edges.filter((e) => e.minor).length,
    len25: edges.filter((e) => e.len >= 25).length,
    pools: Object.entries(t.pools).map(([k, p]) => `${k}:${p.n}/${p.cap}`).join(' '),
  };
};
window.__HIDE = (name, idx, vis = false) => {
  const o = name === 'macro' ? streamer.macroGroup
    : name === 'water' ? engine.scene.children.find((c) => c.geometry?.attributes?.position?.count === 4 && c.material?.type === 'ShaderMaterial')
    : engine.scene.getObjectByName(name);
  if (!o) return 'no ' + name;
  const c = idx === -1 ? o : o.children[idx];
  if (!c) return 'no child ' + idx;
  c.visible = vis;
  return (c.material?.type ?? c.type) + ' geoV=' + (c.geometry?.attributes?.position?.count ?? 0);
};
window.__TILE = (name) => {
  const g = engine.scene.getObjectByName(name);
  if (!g) return 'no group ' + name;
  return g.children.map((c) => ({
    name: c.name, type: c.type, mat: c.material?.type,
    geoV: c.geometry?.attributes?.position?.count ?? null,
    hasMatId: !!c.geometry?.attributes?.matId, kids: c.children?.length ?? 0,
  }));
};
window.__PROBE = (x, z) => {
  const key = `${Math.floor(x / 512)}_${Math.floor(z / 512)}`;
  const rec = streamer.tiles.get(key);
  return {
    key, state: rec?.state ?? 'absent', inManifest: !!streamer.manifest?.tiles[key],
    terrain: streamer.terrainAt(x, z), outstanding: streamer.outstanding,
    tiles: streamer.tiles.size, camY: engine.camera.position.y,
  };
};
function flash(text) {
  hud.msg.textContent = text;
  hud.msg.style.opacity = 0.95;
  clearTimeout(flash.t);
  flash.t = setTimeout(() => (hud.msg.style.opacity = 0), 1600);
}
boot();
