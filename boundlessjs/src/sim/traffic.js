// Traffic: cars on the real street graph. IDM following, signal phases with amber,
// turn-ratio routing, U-turns at dead ends, jam-aware intersection entry.
import { spawnGuard } from './spawnGuard.js';
import * as THREE from 'three';
import { buildVehicleGeos, fleetColor, VH13 } from './vehicles.js';
import { signalState } from './signals.js';
import { CarLights } from './carlights.js';
import { applySnowCap, ENV } from '../world/materials.js';
// see world/assemble.js: `?nodatum=1` restores the pre-seam-pass datums for A/B plates
const NO_DATUM = typeof location !== 'undefined' && new URLSearchParams(location.search).get('nodatum') === '1';

// ---- VH13 (docs/notes/vehicles-r13.md; `?vh13=0` restores the round-12 fleet) ----
// `?vh13k=<x>` scales the paint albedo trim so a value can be A/B'd in one render
// session without an edit.
const VH13K = (() => {
  if (typeof location === 'undefined') return 1;
  const v = parseFloat(new URLSearchParams(location.search).get('vh13k'));
  return Number.isFinite(v) && v > 0 ? v : 1;
})();
// ALBEDO TRIM FOR THE FLEET. materials.js/applyLightTrim's own docstring is the
// argument: the sun and sky in this scene are hot by design, every custom shader
// trims its albedo to match (the ground by mix(0.30, 0.88, night), the facades by
// their value calibration), and a plain Standard/Physical material takes the raw
// light and clips. NOTHING in the vehicle path did one. Same shape as
// applyLightTrim — a diffuseColor multiply at <color_fragment> — but with its own
// day/night pair, because the fleet must NOT be brightened after dark the way the
// street-prop calibration (0.88 x 1.94) brightens a bollard: a parked car at night
// is lit by street lamps and belongs at its own albedo.
function vhTrim(mat, day, night = 1.0) {
  const prev = mat.onBeforeCompile;
  const d = (day * VH13K).toFixed(3), n = (night * VH13K).toFixed(3);
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.vhNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float vhNight;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= mix(${d}, ${n}, vhNight);`);
  };
  mat.customProgramCacheKey = () => (prev ? String(prev) : '') + '|vhtrim' + d + ',' + n;
  mat.needsUpdate = true;
  return mat;
}
// Deliberately MILD. Measured on the round-13 street plate (a parked Prius on
// 125th, docs/notes/vehicles-r13.md D15): bonnet L 113 against asphalt L 71, i.e.
// the fleet was not actually CLIPPING — what made it read as "pale blue-white
// clay" was the hue (roof B/R 2.64 on a neutral silver car) and the flatness, and
// both of those are the metalness-0.35 mirror, which is fixed directly. Dropping
// that mirror already takes ~25 % out of a shaded body's value, so the trim here
// only has to stop a high-albedo white in FULL SUN from clipping. 1.0 at night.
const PAINT_DAY = 0.82;   // bodywork / body2 / far shells
const TRIM_DAY = 0.88;    // interior, tyres, plates — already dark, barely trimmed

// VH13 — NEW YORK PLATE. The plate bucket carried a flat 0xe6dfc6 and no uv at
// all (vehicles.js strips uvs on load), so every car in the city wore a blank
// pale rectangle — called out by name in the owner's 2026-09-16 day frames.
// vehicles.js/uvPlanarPlate now projects a planar uv per plate, front and rear,
// so a texture is bindable; this is the current Excelsior issue, drawn once and
// shared by every pool. Deliberately NOT a specific real registration: a generic
// three-letter/four-digit serial in the NY format.
let _plateTex = null;
function plateTexture() {
  if (_plateTex || typeof document === 'undefined') return _plateTex;
  const W = 512, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#dde6f1'); gr.addColorStop(0.40, '#f3f4f1'); gr.addColorStop(1, '#e9ebe6');
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#1b3f7a'; x.lineWidth = 8;
  x.strokeRect(13, 13, W - 26, H - 26);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#1b3f7a';
  x.font = 'bold 42px Georgia, "Times New Roman", serif';
  x.fillText('NEW YORK', W / 2, 52);
  x.fillStyle = '#16294c';
  x.font = 'bold 100px "Arial Narrow", Impact, "Arial Bold", sans-serif';
  x.fillText('KLM 4207', W / 2, 143);
  x.fillStyle = '#2c528d';
  x.font = 'bold 24px Georgia, "Times New Roman", serif';
  x.fillText('EXCELSIOR', W / 2, 216);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  _plateTex = t;
  return t;
}

// XW11: NYC DOT crosswalk depth, in step with XW_DEPTH in tools/pipeline/compile.mjs — the stop
// line sits 4 ft behind the crossing, so the queue position has to follow the painted depth
const XW_DEPTH = (rclass, width) => (rclass === 2 && width >= 16.5 ? 7.62 : 4.57);
const CAR_TARGET = 620; // reference streets run near-saturated (fleet caps sum 854)
const SPAWN_NEAR = typeof location !== 'undefined' && new URLSearchParams(location.search).has('spawnnear');
const SPAWN_R0 = SPAWN_NEAR ? 15 : 240, SPAWN_R1 = 720, DESPAWN_R = 950, DEAD_DESPAWN = 260;
const IDM = { a: 1.9, b: 2.6, T: 1.15, s0: 2.2, delta: 4 };
// body lengths for following gaps: a fixed 4.6 m had followers parked inside the back half of a
// bus (audit 2026-09-10: "micra d128 x bus d135", 10 same-lane pairs per 30 s)
const VLEN = { bus: 11.6, boxtruck: 7.2, sprinter: 5.9, vwvan: 4.9, van: 5.2, cybertruck: 5.7, suburban: 5.7, ambulance: 6.4, jeep: 4.7 };
const vlen = (c) => VLEN[c.kind] || 4.6;
const followGap = (a, b) => (vlen(a) + vlen(b)) / 2 + 0.4;   // centre-to-centre distance at which bumpers touch (+0.4 m)

const nk = (x, z) => `${Math.round(x)}_${Math.round(z)}`;
// PY25 pedestrian yield (see _pedGap); `?py25=0` restores the straight-ahead box and the unbucketed walker check
const PY25 = typeof location === 'undefined' || new URLSearchParams(location.search).get('py25') !== '0';
const CG = 10;   // car grid cell (m)

export class Traffic {
  constructor(scene, streamer, fleet = null) {
    this.scene = scene;
    this.streamer = streamer;
    this.edges = new Map();
    this.nodes = new Map();
    this.signals = new Map();
    this._nkGrid = new Map(); // canonical junction clustering (see _canon)
    this.cars = [];
    this.target = CAR_TARGET; // scenario-configurable
    this.time = 0;
    this.edgeIdSeq = 1;
    const geos = buildVehicleGeos();
    // vehicle material classes (vehicles.js splits the CARLA GLBs by material name):
    // clear-coated paint (per-instance colour), dark trim, and the extras below. One
    // InstancedMesh per class, all riding the same instance matrices (pool.mx).
    const PART_MATS = {
      // glass: a DIELECTRIC, not black chrome. metalness 0.92 made the windows
      // mirrored black holes with no fresnel falloff; a dark tint with clearcoat
      // gives the sky reflection on top and a dark cabin under it.
      glass: () => new THREE.MeshPhysicalMaterial({ color: 0x0b0f14, roughness: 0.045, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.03, reflectivity: 0.85, envMapIntensity: 1.9 }),
      chrome: () => new THREE.MeshStandardMaterial({ color: 0xe4e8ea, roughness: 0.16, metalness: 1.0 }),   // brightwork + hub caps
      trim: () => new THREE.MeshStandardMaterial({ color: 0x6f767c, roughness: 0.44, metalness: 0.85 }),    // structural metal (bike frames, bed rails)
      // VH13: body2 is PAINT — same trim and the same metalness-0 treatment as the
      // main body, or a VW T2's white roof blew out while its lower half did not
      body2: () => (VH13
        ? vhTrim(new THREE.MeshPhysicalMaterial({ color: 0xe7e8e3, roughness: 0.38, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.05 }), PAINT_DAY)
        : new THREE.MeshPhysicalMaterial({ color: 0xe7e8e3, roughness: 0.34, metalness: 0.2, clearcoat: 1.0, clearcoatRoughness: 0.08 })),
      // VH13 LENSES. roughness 0.07 under a clearcoat made a headlamp a MIRROR, and
      // what a headlamp on a parked car mirrors is the asphalt: the Tesla's lamps
      // read as two black-green pods in the owner's frames. A real lens is a rough
      // optic over a bright reflector — it stays pale from every angle. `emissive`
      // is the lamp itself and is driven from ENV.night per pool in update(), so it
      // is OFF by day and OFF on parked cars at any hour (brief: no glow on parked
      // cars), where before both classes carried a constant emissive all day long.
      light: () => (VH13
        ? new THREE.MeshPhysicalMaterial({ color: 0xe8edf1, roughness: 0.26, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.055, emissive: 0xfff0d6, emissiveIntensity: 0 })
        : new THREE.MeshPhysicalMaterial({ color: 0xf1f4f6, roughness: 0.07, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.04, emissive: 0x202226 })),
      tail: () => (VH13
        ? new THREE.MeshPhysicalMaterial({ color: 0x7e0f0f, roughness: 0.22, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.06, emissive: 0xff2008, emissiveIntensity: 0 })
        : new THREE.MeshPhysicalMaterial({ color: 0x8f1111, roughness: 0.1, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.05, emissive: 0x350505 })),
      tire: () => (VH13
        ? vhTrim(new THREE.MeshStandardMaterial({ color: 0x18191a, roughness: 0.88, metalness: 0.0 }), TRIM_DAY)
        : new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95, metalness: 0.0 })),
      plate: () => (VH13
        ? vhTrim(new THREE.MeshStandardMaterial({ color: 0xffffff, map: plateTexture(), roughness: 0.42, metalness: 0.0 }), TRIM_DAY)
        : new THREE.MeshStandardMaterial({ color: 0xe6dfc6, roughness: 0.55, metalness: 0.05 })),
    };
    const mkPool = (body, dark, cap, parts = null) => {
      // VH13 PAINT. `metalness: 0.35` put a 37 % mirror over every body panel
      // (F0 = mix(0.04, base, 0.35)) on top of an already-full clearcoat, so the
      // sky won the surface and a neutral white car measured 109,141,174 —
      // B/R 1.6, the critic's "pale blue-white clay ... environment reflection
      // beating the base albedo" (critic-r13 runners-up). Solid car paint is a
      // DIELECTRIC: the flake lives in the base coat's roughness, the gloss in
      // the clear coat, and neither is metalness. Plus the albedo trim above.
      const mb = new THREE.InstancedMesh(body, VH13
        ? vhTrim(applySnowCap(new THREE.MeshPhysicalMaterial({ roughness: 0.38, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.048, envMapIntensity: 0.9 })), PAINT_DAY)
        : applySnowCap(new THREE.MeshPhysicalMaterial({ roughness: 0.30, metalness: 0.35, clearcoat: 1.0, clearcoatRoughness: 0.06 })), cap);
      const md = new THREE.InstancedMesh(dark, VH13
        ? vhTrim(applySnowCap(new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.62, metalness: 0.08 })), TRIM_DAY)
        : applySnowCap(new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.62, metalness: 0.08 })), cap);
      mb.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      const mx = [];
      let lampL = null, lampT = null;   // VH13: driven from ENV.night, moving pools only
      for (const [k, g] of Object.entries(parts || {})) {
        if (!g || !PART_MATS[k]) continue;
        const mat = applySnowCap(PART_MATS[k]());
        if (k === 'light') lampL = mat; else if (k === 'tail') lampT = mat;
        const m = new THREE.InstancedMesh(g, mat, cap);
        m.name = `vehpart:${k}`;
        mx.push(m);
      }
      for (const m of [mb, md, ...mx]) { m.frustumCulled = false; m.count = 0; m.castShadow = true; scene.add(m); }
      return { mb, md, mx, cap, n: 0, lampL, lampT };
    };
    if (fleet) {
      // CARLA fleet: one pool per model; spawn picks from a weighted bag
      this.pools = {};
      this.kindBag = [];
      // VH13 — MEASURE THE FOLLOWING LENGTHS OFF THE MODELS. VLEN was hand-written
      // and then drifted from the fleet: it still said 11.6 m for a bus that has
      // been a 6.6 m Fuso Rosa since the 0.645 scale correction, and 7.2 m for a
      // 5.2 m CarlaCola. followGap() is the distance at which two bumpers touch,
      // so every bus drove with a five-metre hole in front of and behind it.
      if (VH13) {
        const bb = new THREE.Box3(), sz = new THREE.Vector3();
        for (const [k, f] of Object.entries(fleet)) {
          if (k.startsWith('__') || !f?.paint) continue;
          bb.makeEmpty();
          for (const g of [f.paint, f.dark]) {
            const pa = g?.getAttribute('position');
            if (pa && pa.count > 24) bb.union(new THREE.Box3().setFromBufferAttribute(pa));
          }
          if (bb.isEmpty()) continue;
          bb.getSize(sz);
          if (sz.z > 1.5 && sz.z < 14) VLEN[k] = +sz.z.toFixed(2);
        }
      }
      for (const [k, f] of Object.entries(fleet)) {
        if (k.startsWith('__')) continue;
        this.pools[k] = mkPool(f.paint, f.dark, f.cap, f.parts);
        // two-wheelers stay out of the moving bag until they carry riders: an upright rider-less
        // motorcycle in a travel lane reads as broken (fleet-qa.md open item 2)
        if (k !== 'bus' && !/^(harley|vespa|yamaha)$/.test(k)) for (let i = 0; i < f.w; i++) this.kindBag.push(k);
      }
    } else {
      this.pools = { sedan: mkPool(geos.sedanBody, geos.sedanDark, 270), van: mkPool(geos.vanBody, geos.vanDark, 70), bus: mkPool(geos.busBody, geos.busDark, 24) };
      this.kindBag = null;
    }
    // static parked fleet along curbs — full CARLA models inside 120m, ~2k-tri
    // CARLA collision shells beyond (measured: the six full-res parked pools at
    // cap were the frame's single largest triangle sink, ~36M tris per pass)
    this.parkedRecs = new Map(); // tileKey -> [{kind, x, z, m, color}]
    this._parkDirty = true;
    this._pbX = 1e9; this._pbZ = 1e9;
    const mkShell = (geo, cap) => {
      // VH13: the shell is the SAME CAR seen past 120 m, so it has to answer the
      // light the same way the near model does or the swap reads as a brightness
      // pop. roughness 0.55 / metalness 0.35 against the near paint's 0.38 / 0.0
      // + clearcoat made the far half of every street duller and bluer; it takes
      // the paint trim too. (The 0.82 instance-colour darkening stays: it stands
      // in for the glass and wheels the collision hull does not have.)
      const m = new THREE.InstancedMesh(geo, VH13
        ? vhTrim(applySnowCap(new THREE.MeshStandardMaterial({ roughness: 0.36, metalness: 0.0 })), PAINT_DAY)
        : applySnowCap(new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.35 })), cap);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0; m.frustumCulled = false; m.castShadow = true;
      scene.add(m);
      return m;
    };
    if (fleet) {
      this.parked = {};
      this.parkedKinds = [];
      // PV2 (sim/fleet24.js): a fleet may carry its own WEIGHTED parked list (a kind repeats = its weight); one pool
      // per distinct kind either way
      for (const k of fleet.__parkedKinds || ['tesla', 'crown', 'prius', 'micra', 'jeep', 'vwvan']) {
        if (!fleet[k]) continue;
        if (!this.parked[k]) this.parked[k] = { ...mkPool(fleet[k].paint, fleet[k].dark, 320, fleet[k].parts), shell: fleet[k].shell ? mkShell(fleet[k].shell, 320) : null };
        this.parkedKinds.push(k);
      }
    } else {
      this.parked = { sedan: { ...mkPool(geos.sedanBody, geos.sedanDark, 5200), shell: null }, van: { ...mkPool(geos.vanBody, geos.vanDark, 800), shell: null } };
      this.parkedKinds = null;
    }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
    this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._c = new THREE.Color();
    // VH13 — per-model lamp anchors (vehicles.js/lampAnchors) so the night sprites
    // land on each kind's own lenses instead of one offset shared by a 3.6 m Micra
    // and a 7.2 m box truck. `?vh13=0` hands carlights null and it falls back.
    this.lampAnchors = {};
    if (VH13 && fleet) for (const [k, f] of Object.entries(fleet)) if (f && f.lamps) this.lampAnchors[k] = f.lamps;
    // 640 covers CAR_TARGET: the 320-car sprite pool left ~300 of the 620 moving
    // cars with no night lights at all (carlights.js, VH13 note on `list`).
    this.lights = new CarLights(scene, VH13 ? 640 : 320, VH13 ? this.lampAnchors : null);
    this.tileEdges = new Map();
    this._bridgesAdded = false;
    // LAST: onTile replays the tiles already in (streamer.js), and addTile needs every field above
    streamer.onTile((key, data) => this.addTile(key, data), (key) => this.removeTile(key));
  }
  addTile(key, data) {
    const ids = [];
    for (const r of data.roads) {
      if (r.rclass >= 5 || r.noTraffic || r.pts.length < 2) continue;   // paths and pedestrianised streets carry no cars
      ids.push(this._addEdge(r.pts, r, key));
    }
    for (const n of data.nodes) if (n.signal) this.signals.set(this._canon(n.x, n.z), true);
    this.tileEdges.set(key, ids);
    this._compDirty = true;
    // parked cars along curb parking lanes — stored as RECORDS; the LOD
    // rebucketer writes them into full-res or shell pools by camera distance
    const recs = [];
    for (const r of data.roads) {
      if (r.rclass > 2 || r.level > 0 || !r.park || r.pts.length < 2) continue;
      const e = { pts: r.pts, cum: [0] };
      for (let i = 1; i < r.pts.length; i++) e.cum.push(e.cum[i - 1] + Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][2] - r.pts[i - 1][2]));
      e.len = e.cum[e.cum.length - 1];
      const sides = r.park >= 2 ? [1, -1] : [((r.segId || 0) % 2) ? 1 : -1];
      for (const side of sides) {
        // no standing past the junction mouth (crosswalk + stop bar + hydrant zone): with
        // 3.4-4.6 m curb-return fillets a car parked at d=9 stood on the corner pavement.
        // XW11: the zone now clears the painted crossing AND its stop bar (mouth + 0.35 + XW + 1.81),
        // which the old fixed 7 m did not once the crossing became 25 ft deep.
        const nsz = XW_DEPTH(r.rclass, r.width) + 2.4;
        const d0 = Math.max(9, (r.mouthA || 0) + nsz), d1 = e.len - Math.max(9, (r.mouthB || 0) + nsz);
        for (let d = d0; d < d1; d += 7.4) {
          const h = Math.abs(Math.sin(d * 12.9898 + (r.segId || 1) * 78.233 + side * 3.7)) % 1;
          if (h > 0.74) continue; // ~74% occupancy
          const s = this.sampleEdge(e, d);
          const kind = this.parkedKinds
            ? this.parkedKinds[((h * 917.3) | 0) % this.parkedKinds.length]
            : (h > 0.62 ? 'van' : 'sedan');
          // 1.30 m from the kerb line: at 1.08 a 1.9 m car left its kerb-side tyres on the pavement wherever the
          // compiled kerb stands a few cm inside the CSCL width (blind critic, W 120th & Amsterdam, 2026-09-15)
          const off = (r.width / 2 - 1.30) * side;
          // NO PARKING ON THE GRASS. The slot is laid out from the road
          // centreline, so wherever the compiled ground under the parking lane
          // is NOT roadway the car ends up standing on something else — and,
          // because it is placed at the road datum, sunk into it. Measured over
          // four probe tiles: 12 of 1811 slots (0.66 %) land on a lawn or a
          // flag, among them (-844.8, 3293.3) — the gold sedan parked in the
          // Bryant Park turf on Fifth Avenue, 12.7 cm under the grass, which is
          // the object the critic has led with at 5th & 42nd since round 1.
          // The lawn itself is the compiler's (the park polygon swallows the
          // library parcel); refusing to park on it is mine.
          const cxp = s.x - s.dirz * off, czp = s.z + s.dirx * off;
          const si = this.streamer.surfaceInfoAt ? this.streamer.surfaceInfoAt(cxp, czp, 0.4) : null;
          if (si && !si.road) continue;
          if (si && si.kind === 'busred') continue;   // no standing in a red bus lane (critic round 5)
          // TYRES ON THE ROAD. The wheel cylinders bottom out at local y = 0
          // (radius 0.33 centred at 0.33), so the instance origin IS the contact
          // patch and `+ 0.03` parked every car 3 cm above the asphalt: four
          // little gaps under the tyres, a shadow that misses the car and an AO
          // ring under the body. 2 mm is enough to keep the tread out of the
          // road's own z-fight.
          this._v.set(cxp, s.y + (NO_DATUM ? 0.03 : 0.002), czp);
          // parked cars face the travel direction of their curb: on a one-way street BOTH curbs face
          // the one-way direction (the left-curb cars used to face oncoming — Wall St, r7 check)
          const back = (r.oneway | 0) !== 0 ? (r.oneway | 0) < 0 : side < 0;
          this._e.set(0, Math.atan2(s.dirx, s.dirz) + (back ? Math.PI : 0) + (h - 0.35) * 0.04, 0);
          this._q.setFromEuler(this._e);
          this._m.compose(this._v, this._q, this._s);
          recs.push({ kind, x: this._v.x, z: this._v.z, m: Float32Array.from(this._m.elements), color: fleetColor(() => (h * 7.13) % 1) });
        }
      }
    }
    this.parkedRecs.set(key, recs);
    this._parkDirty = true;
    if (!this._bridgesAdded && this.streamer.bridgeRoads) {
      this._bridgesAdded = true;
      for (const br of this.streamer.bridgeRoads) {
        // decks that carry no cars: the E 103 St footbridge and the Hell Gate rail arch were
        // traffic edges, so cars climbed 18-43 m into the air over the East River (2026-09-04)
        if (br.type === 'archRail' || /FOOT ?BRIDGE|PEDESTRIAN|RAIL/i.test(br.name || '')) continue;
        this._addEdge(br.pts.map((p) => [...p]), br, '__bridges');
      }
    }
  }
  // canonical junction key: CSCL arm endpoints scatter 2-16m at real
  // intersections (digitization noise, roadbed-edge endpoints, twin
  // carriageways), so exact endpoint keys shatter the graph into per-street
  // fragments (measured citywide: 45k components, largest 0.1%). Cluster
  // endpoints in a 6m hash: the first endpoint in a neighborhood becomes the
  // canonical node; later endpoints within 12m alias onto it. Cars blend
  // across the residual geometric gap at edge transitions (see update()).
  _canon(x, z) {
    const C = 6;
    const ci = Math.floor(x / C), cj = Math.floor(z / C);
    let best = null, bestD = 12;
    for (let j = cj - 2; j <= cj + 2; j++) for (let i = ci - 2; i <= ci + 2; i++) {
      const arr = this._nkGrid.get(`${i}_${j}`);
      if (!arr) continue;
      for (const p of arr) {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bestD) { bestD = d; best = p; }
      }
    }
    if (best) return best.k;
    const k = nk(x, z);
    const key = `${ci}_${cj}`;
    let arr = this._nkGrid.get(key);
    if (!arr) this._nkGrid.set(key, (arr = []));
    arr.push({ x, z, k });
    return k;
  }
  _addEdge(pts, r, tile) {
    const id = this.edgeIdSeq++;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
    const e = {
      // lanes capped by what the roadway can hold: CSCL's number_travel_lanes put 3 lanes on a
      // 9 m one-way street, so lane centres sat 2.1 m apart and side-by-side cars overlapped
      // (traffic-law audit 2026-09-10: 128 collision pairs in 30 s, many "d12 l0 x d12 l1 dist 1.2")
      id, pts, cum, len: cum[cum.length - 1], width: r.width,
      lanes: Math.max(1, Math.min(r.lanes || 1, Math.floor((r.width - ((r.park | 0) >= 2 ? 4.6 : (r.park | 0) ? 2.3 : 0) - 0.6) / 2.9))),
      oneway: r.oneway | 0, speed: Math.max(6, (r.speed || 25) * 0.44704), rclass: r.rclass, tile,
      a: this._canon(pts[0][0], pts[0][2]), b: this._canon(pts[pts.length - 1][0], pts[pts.length - 1][2]),
      park: r.park | 0, segId: r.segId | 0,
      mouthA: r.mouthA || 0, mouthB: r.mouthB || 0, // junction boundary per end (0 = plain edge end)
      cars: new Set(),
    };
    if (e.len < 4) return id;
    if (e.a === e.b && e.len < 14) return id; // degenerate junction-interior loop
    this.edges.set(id, e);
    for (const [dir, node] of [[1, e.a], [-1, e.b]]) {
      let n = this.nodes.get(node);
      if (!n) this.nodes.set(node, (n = { out: [] }));
      n.out.push({ id, dir });
    }
    return id;
  }
  removeTile(key) {
    // parked cars: drop this tile's records; next rebucket rebuilds buffers
    this.parkedRecs.delete(key);
    this._parkDirty = true;
    const ids = this.tileEdges.get(key) || [];
    for (const id of ids) {
      const e = this.edges.get(id);
      if (!e) continue;
      for (const car of e.cars) car.dead = true;
      for (const node of [e.a, e.b]) {
        const n = this.nodes.get(node);
        if (n) { n.out = n.out.filter((o) => o.id !== id); if (!n.out.length) this.nodes.delete(node); }
      }
      this.edges.delete(id);
    }
    this.tileEdges.delete(key);
    this._compDirty = true;
  }
  sampleEdge(e, d) {
    d = Math.max(0, Math.min(e.len, d));
    let i = 1;
    while (i < e.cum.length - 1 && e.cum[i] < d) i++;
    const t = (d - e.cum[i - 1]) / Math.max(0.001, e.cum[i] - e.cum[i - 1]);
    const A = e.pts[i - 1], B = e.pts[i];
    const dx = B[0] - A[0], dz = B[2] - A[2];
    const L = Math.hypot(dx, dz) || 1;
    return { x: A[0] + dx * t, y: A[1] + (B[1] - A[1]) * t, z: A[2] + dz * t, dirx: dx / L, dirz: dz / L };
  }
  stateFor(nodeKey, dirx, dirz) {
    if (!this.signals.has(nodeKey)) return 'G';
    return signalState(this.time, Math.abs(dirx) > Math.abs(dirz));
  }
  dirAt(e, d, dir) {
    const s = this.sampleEdge(e, d);
    return [s.dirx * dir, s.dirz * dir];
  }
  // label connected components over the loaded edge graph and flag every edge
  // outside the largest one as minor. Fragments (endpoints that never joined
  // the street network) otherwise collect cars that can only circle their own
  // segment — spawns are restricted to the giant component so vehicles always
  // have the whole city to route through.
  _relabelComponents() {
    this._compDirty = false;
    // TWO union-finds, deliberately. One structure used to serve both the 22 m junction
    // clustering and the connected-component labelling below; `uni(e.a, e.b)` for every edge
    // then merged every node of the street network into ONE "junction", `_pickNext` offered a
    // car leaving any junction every edge in the loaded city, and the turn connector drove it
    // there along a 200-1700 m Bezier — across blocks, sidewalks and buildings. That was the
    // "vehicles going through buildings" of the 2026-09-04 review (audit: every off-street car
    // was mid-TURN with len 255-1731 m).
    const mkUF = () => {
      const parent = new Map();
      const find = (k) => {
        let r = k;
        while (parent.get(r) !== r) r = parent.get(r);
        let c = k;
        while (parent.get(c) !== c) { const n = parent.get(c); parent.set(c, r); c = n; }
        return r;
      };
      const uni = (a, b) => {
        if (!parent.has(a)) parent.set(a, a);
        if (!parent.has(b)) parent.set(b, b);
        parent.set(find(a), find(b));
      };
      return { find, uni, has: (k) => parent.has(k) };
    };
    const J = mkUF();      // junction clusters (endpoints within 22 m)
    const Cc = mkUF();     // connected components (edge endpoints)
    const uni = J.uni;
    // junction clustering: canonical endpoints within 15m are arms of the
    // same physical intersection (first-come 12m aliasing in _canon still
    // splits wide-avenue junctions whose arm scatter exceeds one seed) —
    // union them AND merge their out-lists so cars route across
    const live = [];
    for (const arr of this._nkGrid.values()) for (const p of arr) if (this.nodes.has(p.k)) live.push(p);
    const C = 6;
    const cellOf = new Map();
    for (const p of live) {
      const key = `${Math.floor(p.x / C)}_${Math.floor(p.z / C)}`;
      let a = cellOf.get(key); if (!a) cellOf.set(key, (a = []));
      a.push(p);
    }
    for (const p of live) {
      const ci = Math.floor(p.x / C), cj = Math.floor(p.z / C);
      for (let j = cj - 4; j <= cj + 4; j++) for (let i = ci - 4; i <= ci + 4; i++) {
        const arr = cellOf.get(`${i}_${j}`);
        if (!arr) continue;
        // 22m: a side street ends at the far curb line of a 4-lane avenue —
        // still under NYC's shortest block spacing, so distinct junctions
        // never chain
        for (const q of arr) if (q !== p && Math.hypot(q.x - p.x, q.z - p.z) < 22) uni(p.k, q.k);
      }
    }
    // merged routing nodes per junction cluster (cars exiting ANY arm see the
    // whole cluster's continuations; oneway direction filters still apply).
    // Built from the 22 m clustering ONLY — never from edge connectivity.
    this.junction = new Map();
    const groups = new Map();
    for (const p of live) {
      const r = J.has(p.k) ? J.find(p.k) : p.k;
      let g = groups.get(r); if (!g) groups.set(r, (g = { out: [], keys: [] }));
      const n = this.nodes.get(p.k);
      if (n) g.out.push(...n.out);
      g.keys.push(p.k);
    }
    for (const g of groups.values()) {
      if (g.keys.length < 2) continue; // solo nodes route through this.nodes as before
      for (const k of g.keys) this.junction.set(k, g);
    }
    // connected components over edge endpoints (+ the junction clusters, so arms that only
    // touch through a cluster count as connected): everything outside the giant one is minor
    for (const e of this.edges.values()) Cc.uni(e.a, e.b);
    for (const g of groups.values()) for (let i = 1; i < g.keys.length; i++) Cc.uni(g.keys[0], g.keys[i]);
    const lenOf = new Map();
    for (const e of this.edges.values()) {
      const r = Cc.find(e.a);
      lenOf.set(r, (lenOf.get(r) || 0) + e.len);
    }
    let giant = null, giantLen = -1;
    for (const [r, L] of lenOf) if (L > giantLen) { giantLen = L; giant = r; }
    for (const e of this.edges.values()) e.minor = Cc.find(e.a) !== giant;
  }
  spawnCar(px, pz) {
    if (this._compDirty) this._relabelComponents();
    const keys = [...this.edges.keys()];
    for (let tries = 0; tries < 14; tries++) {
      const e = this.edges.get(keys[(Math.random() * keys.length) | 0]);
      if (!e || e.len < 25 || e.minor) continue;
      const d = e.len * Math.random();
      const s = this.sampleEdge(e, d);
      const dist = Math.hypot(s.x - px, s.z - pz);
      // INITIAL FILL (PV2): spawning only 240-720 m out left the camera's own blocks nearly empty for the first minutes
      // (the first frames are the ones a capture takes); for the first 20 s, while under 75 % of the target, cars may
      // appear from 25 m, after which the out-of-sight ring takes over again
      const filling = !spawnGuard.on && this.time < 20 && this.cars.length < this.target * 0.75;
      const r0 = filling ? Math.min(SPAWN_R0, 25) : SPAWN_R0;
      if (dist < r0 || dist > SPAWN_R1) continue;
      // ...weighted toward the camera (half acceptance at 150 m), so the first frames look like a street, not a ring road
      if (filling && Math.random() > 1 / (1 + (dist / 150) ** 2)) continue;
      // recording (spawnGuard): a car may not appear inside the frame, however far (a 4.5 m car is ~50 px at 240 m in 1440p)
      if (spawnGuard.on && spawnGuard.inView(s.x, s.y + 1, s.z, 3)) continue;
      // PY25: nor on top of a walker on the carriageway (the crossers peds.js publishes)
      if (PY25 && this._crossers && this._crossers.length) {
        let near = false;
        for (let k = 0; k + 1 < this._crossers.length && !near; k += 2) near = (this._crossers[k] - s.x) ** 2 + (this._crossers[k + 1] - s.z) ** 2 < 64;
        if (near) continue;
      }
      const dir = e.oneway !== 0 ? e.oneway : Math.random() < 0.5 ? 1 : -1;
      const r = Math.random();
      const kind = this.kindBag
        ? (this.pools.bus && ((e.rclass === 3 && r < 0.1) || r < 0.03) ? 'bus' : this.kindBag[(Math.random() * this.kindBag.length) | 0])
        : (e.rclass === 3 && r < 0.1 ? 'bus' : r < 0.13 ? 'van' : r < 0.155 ? 'bus' : 'sedan');
      const pool = this.pools[kind];
      if (pool.n >= pool.cap) continue;
      let clash = false;
      for (const o of e.cars) if (o.dir === dir && Math.abs(o.d - d) < 10) { clash = true; break; }
      if (clash) continue;
      const lanesDir = e.oneway !== 0 ? e.lanes : Math.max(1, Math.floor(e.lanes / 2));
      // taxi yellow only on taxi-type bodies (crown / prius / tesla / the placeholder sedan):
      // yellow Cybertrucks and Harleys were in the film (fleet-qa.md open item 3)
      let color = fleetColor(Math.random);
      if (color === 0xf7b500 && !/^(crown|prius|tesla|sedan)$/.test(kind)) color = fleetColor(() => 0.17 + Math.random() * 0.83);
      const car = { e, d, dir, lane: (Math.random() * lanesDir) | 0, v: 4, kind, color, idx: pool.n++,
        laneF: undefined, _cp: undefined, _cpF: undefined, _hsx: undefined, _hcz: undefined, _pg: undefined, _pgS: undefined, _pk: undefined, _pkF: undefined, _pyHold: undefined };
      car.laneF = car.lane;
      // lane 0 is the LEFT lane of travel (next to the centreline on a two-way street); the curb
      // lane is lanesDir - 1 — double-parked vans used to sit in the middle of two-way streets
      // ...and never within 18 m of a junction, where the curb lane is the turning cars' entry
      if ((kind === 'vwvan' || kind === 'sprinter' || kind === 'van') && Math.random() < 0.06 && d > 18 && d < e.len - 18) { car._parkT = 25 + Math.random() * 35; car.lane = lanesDir - 1; car.laneF = car.lane; }
      e.cars.add(car);
      this.cars.push(car);
      this._c.set(car.color);
      pool.mb.setColorAt(car.idx, this._c);
      pool.mb.instanceColor.needsUpdate = true;
      pool.mb.count = pool.md.count = Math.max(pool.mb.count, pool.n);
      for (const m of pool.mx) m.count = pool.mb.count;
      return;
    }
  }
  _pickNext(car, nodeKey, exitDirx, exitDirz, straightOnly = false) {
    // merged junction cluster when one exists (scattered CSCL arms), else the
    // plain canonical node
    const n = this.junction?.get(nodeKey) ?? this.nodes.get(nodeKey);
    if (!n) return null;
    // where this car leaves its edge: the junction mouth at its end of travel
    const ce = car.e, cm = car.dir > 0 ? (ce.mouthB || 0) : (ce.mouthA || 0);
    const exitPos = this.sampleEdge(ce, car.dir > 0 ? Math.max(0.2, ce.len - cm) : Math.min(ce.len - 0.2, cm));
    const opts = [];
    for (const o of n.out) {
      const ne = this.edges.get(o.id);
      if (!ne || ne === car.e) continue;
      if (ne.oneway !== 0 && o.dir !== ne.oneway) continue;
      // a merged junction cluster spans a divided avenue (arms up to 22 m apart, entries up to
      // 60 m from the exit): only continue onto arms whose entry is within one junction's reach,
      // so the crossing goes exit -> short link piece -> far carriageway instead of one arc over
      // the median and its planting (audit 2026-09-09: cars "on grass / sidewalk" mid-turn)
      { const en = this.sampleEdge(ne, o.dir > 0 ? Math.min((ne.mouthA || 0) + 1, ne.len * 0.5) : Math.max(ne.len - (ne.mouthB || 0) - 1, ne.len * 0.5)); if (Math.hypot(en.x - exitPos.x, en.z - exitPos.z) > 32) continue; }
      // entry blocked? (car within 8m of the entry)
      let blocked = false;
      const entryD = o.dir > 0 ? 0 : ne.len;
      for (const oc of ne.cars) if (oc.dir === o.dir && Math.abs(oc.d - entryD) < 8) { blocked = true; break; }
      const [ndx, ndz] = this.dirAt(ne, o.dir > 0 ? 1 : ne.len - 1, o.dir);
      const dot = ndx * exitDirx + ndz * exitDirz;
      const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (straightOnly && ang >= 0.5) continue;   // a car stuck in the wrong lane for its turn goes straight instead
      const w = (ang < 0.5 ? 0.62 : ang < 2.0 ? 0.33 : 0.05) * (blocked ? 0.05 : 1);
      const turn = ang < 0.5 ? 'straight' : ang >= 2.0 ? 'uturn' : (exitDirx * ndz - exitDirz * ndx > 0 ? 'right' : 'left');
      opts.push({ o, ne, w, turn });
    }
    if (!opts.length) return null;
    // external API route plan (vehicle.set_autopilot(route=[...])): take the planned turn when this junction has it
    if (car.routePlan && car.routePlan.length) {
      const want = car.routePlan[0];
      const hit = opts.filter((q) => q.turn === want).sort((a, b) => b.w - a.w)[0];
      if (hit) { car.routePlan.shift(); return hit; }
      // the planned turn is not offered here: straight on (the plan waits for the next junction), else the random choice
      const st = opts.filter((q) => q.turn === 'straight').sort((a, b) => b.w - a.w)[0];
      if (st) return st;
    }
    let sum = 0;
    for (const o of opts) sum += o.w;
    let r = Math.random() * sum;
    for (const o of opts) { r -= o.w; if (r <= 0) return o; }
    return opts[opts.length - 1];
  }
  // ---- PEDESTRIAN YIELD (PY25, owner 2026-09-25: "pedestrians should never clip into vehicles"). The walkers on the
  // carriageway are published by peds.js as this._crossers = [x, z, ...] with their velocities in this._crossV (the API
  // bridge appends its own walkers to _crossers, without velocities). A car yields to a walker who is in, or will step
  // into, the corridor its body sweeps along its REAL path ahead (lane, turn connector, next edge), not a box straight
  // ahead of its current heading: a turning car used to see the walker on the crosswalk of the street it turned into only
  // once its nose pointed at them, too late to stop, and drove through them. Both sides are bucketed (no walker x car
  // loop): cars in 10 m cells (this._carGrid, also what peds.js asks "which cars could reach me here?"), and each
  // walker tests only the cars near it. `?py25=0` restores the straight-ahead box.
  // distance a car may still travel before it must stop for a pedestrian (1e9: none in its way)
  _pedGap(car) {
    if (!PY25) return this._pedGapBox(car);
    return car._pgS === this._pgStamp ? car._pg : 1e9;
  }
  _pedGapBox(car) {
    const X = this._crossers;
    if (!X || !X.length || !car._pose) return 1e9;
    const cx = car._pose[0], cz = car._pose[2], yaw = car._pose[3];
    const fx = Math.sin(yaw), fz = Math.cos(yaw), half = vlen(car) / 2;
    let best = 1e9;
    for (let k = 0; k < X.length; k += 2) {
      const rx = X[k] - cx, rz = X[k + 1] - cz;
      const along = rx * fx + rz * fz;
      if (along < half - 0.8 || along > half + 14) continue;
      if (Math.abs(rx * fz - rz * fx) > 1.75) continue;
      best = Math.min(best, along - half - 1.6);
    }
    return best;
  }
  // cars by position, rebuilt at the end of every update (so the walkers, who update after the cars, see this frame's)
  _buildCarGrid() {
    const G = this._carGrid || (this._carGrid = new Map());
    if (((this._cgN = (this._cgN || 0) + 1) & 511) === 0) G.clear();   // drop the cells no car drives any more
    else for (const L of G.values()) L.length = 0;
    for (const c of this.cars) {
      const q = c._pose;
      if (!q) continue;
      const k = (Math.floor(q[0] / CG) + 32768) * 65536 + (Math.floor(q[2] / CG) + 32768);
      let L = G.get(k);
      if (!L) G.set(k, (L = []));
      L.push(c);
      c._hsx = Math.sin(q[3]); c._hcz = Math.cos(q[3]);   // heading, for the next update's _pedPass (the pose holds till then)
    }
  }
  // every car whose position is within the square of half-size r around (x, z)
  carsNear(x, z, r, fn) {
    const G = this._carGrid;
    if (!G) return;
    const a = Math.floor((x - r) / CG), b = Math.floor((x + r) / CG), c0 = Math.floor((z - r) / CG), c1 = Math.floor((z + r) / CG);
    for (let gx = a; gx <= b; gx++) for (let gz = c0; gz <= c1; gz++) {
      const L = G.get((gx + 32768) * 65536 + (gz + 32768));
      if (L) for (let i = 0; i < L.length; i++) fn(L[i]);
    }
  }
  // half width (x) and half length (z) of a car's body: the model's plan bounds, mirrors and all (fleet24 LOD0), never
  // less than the nominal dims (a box truck's mirrors stand 0.14 m outside its vehDims box: walkers stopped short of the
  // box stood in the mirror)
  carHalf(car) {
    const cache = this._halfK || (this._halfK = {});
    let h = cache[car.kind];
    if (!h) {
      const K = this.fleet24 && this.fleet24.kinds && this.fleet24.kinds[car.kind];
      let x = 0, z = 0;
      if (K && K.lods && K.lods[0]) for (const part of K.lods[0]) {
        const g = part.geometry;
        if (!g || !g.attributes || !g.attributes.position) continue;
        if (!g.boundingBox) g.computeBoundingBox();
        const b = g.boundingBox;
        x = Math.max(x, -b.min.x, b.max.x); z = Math.max(z, -b.min.z, b.max.z);
      }
      const dm = this.vehDims && this.vehDims[car.kind];
      h = [Math.max(x, dm ? dm[0] / 2 : 0.97), Math.max(z, dm ? dm[2] / 2 : vlen(car) / 2)];
      if (this.fleet24 || !dm) cache[car.kind] = h;   // before fleet24 is installed, do not cache the fallback
    }
    return h;
  }
  // THE PATH A CAR WILL DRIVE: points from its centre forward (s = distance along the path) over the braking horizon,
  // through its lane, the turn connector it is on or will take (car.next is chosen 34 m out), and the next edge.
  // Cached per frame; the connector of a turn not yet begun is the same k = 0.36 cubic update() builds.
  carPath(car) {
    if (car._cpF === this._frame && car._cp) return car._cp;
    const P = car._cp || (car._cp = { n: 0, x: new Float32Array(64), z: new Float32Array(64), s: new Float32Array(64) });
    car._cpF = this._frame;
    P.n = 0;
    const q = car._pose;
    if (!q || !car.e) return P;
    const v = car.v || 0, half = this.carHalf(car)[1];
    const Lmax = half + Math.min(44, 8 + v * 1.1 + (v * v) / (2 * 2.4));
    const push = (x, z) => {
      if (P.n >= 64) return false;
      if (P.n) {
        const dx = x - P.x[P.n - 1], dz = z - P.z[P.n - 1], d = Math.hypot(dx, dz);
        if (d < 0.5) return P.s[P.n - 1] < Lmax;
        P.s[P.n] = P.s[P.n - 1] + d;
      } else P.s[0] = 0;
      P.x[P.n] = x; P.z[P.n] = z; P.n++;
      return P.s[P.n - 1] < Lmax;
    };
    const bez = (T, s) => {
      const t = Math.max(0, Math.min(1, s / T.len)), u = 1 - t, a0 = u * u * u, a1 = 3 * u * u * t, a2 = 3 * u * t * t, a3 = t * t * t;
      return push(a0 * T.p0[0] + a1 * T.c1[0] + a2 * T.c2[0] + a3 * T.p2[0], a0 * T.p0[2] + a1 * T.c1[2] + a2 * T.c2[2] + a3 * T.p2[2]);
    };
    // along edge e from d in direction dir (lane of `car`, travelling `dir`), up to dStop (the exit mouth) or Lmax
    const edge = (e, d, dir, dStop) => {
      if (dir > 0 ? d > dStop : d < dStop) return true;   // already past this stretch (at the mouth)
      const lp = { dir, lane: car.lane };
      const off = this._laneOffsetAt(e, lp, Math.min(car.lane, Math.max(0, (e.oneway !== 0 ? e.lanes : Math.max(1, Math.floor(e.lanes / 2))) - 1)));
      for (let dd = d; dir > 0 ? dd <= dStop : dd >= dStop; dd += dir * 3) {   // lanes: a point every 3 m (connectors: 1.5 m)
        const s = this.sampleEdge(e, dd), hx = s.dirx * dir, hz = s.dirz * dir;
        if (!push(s.x - hz * off, s.z + hx * off)) return false;
      }
      const s = this.sampleEdge(e, dStop), hx = s.dirx * dir, hz = s.dirz * dir;
      return push(s.x - hz * off, s.z + hx * off);
    };
    push(q[0], q[2]);
    if (car.turn) {
      const T = car.turn;
      let ok = true;
      for (let s = T.s + 1.5; s < T.len && ok; s += 1.5) ok = bez(T, s);
      if (ok && bez(T, T.len)) edge(car.e, car.d + car.dir * 1.5, car.dir, car.dir > 0 ? car.e.len - (car.e.mouthB || 0) : (car.e.mouthA || 0));
      return P;
    }
    const e = car.e, dir = car.dir, mEnd = dir > 0 ? e.mouthB : e.mouthA;
    const exitD = Math.max(0.2, Math.min(e.len - 0.2, dir > 0 ? e.len - (mEnd || 0) : (mEnd || 0)));
    if (!edge(e, car.d + dir * 3, dir, exitD)) return P;
    const nx = car.next;
    if (!nx || !this.edges.has(nx.ne.id)) return P;
    // the connector this car will build at the mouth (update(): mk(0.36 chord)), then the next edge
    const ne = nx.ne, nd = nx.o.dir, mN = nd > 0 ? ne.mouthA : ne.mouthB;
    const entryD = nd > 0 ? Math.min(mN + 1.0, ne.len * 0.5) : Math.max(ne.len - mN - 1.0, ne.len * 0.5);
    const ex = this.sampleEdge(e, exitD), en = this.sampleEdge(ne, entryD);
    const lanesN = ne.oneway !== 0 ? ne.lanes : Math.max(1, Math.floor(ne.lanes / 2));
    const offA = this._laneOffsetAt(e, { dir, lane: car.lane }, car.lane), offB = this._laneOffsetAt(ne, { dir: nd }, Math.min(car.lane, lanesN - 1));
    const hA = [ex.dirx * dir, ex.dirz * dir], hB = [en.dirx * nd, en.dirz * nd];
    const p0 = [ex.x - hA[1] * offA, 0, ex.z + hA[0] * offA], p2 = [en.x - hB[1] * offB, 0, en.z + hB[0] * offB];
    const chord = Math.hypot(p2[0] - p0[0], p2[2] - p0[2]);
    if (chord > 60) return P;
    const k = 0.36 * chord;
    const T = { p0, c1: [p0[0] + hA[0] * k, 0, p0[2] + hA[1] * k], c2: [p2[0] - hB[0] * k, 0, p2[2] - hB[1] * k], p2, len: Math.max(1, chord * 1.1) };
    let ok = true;
    for (let s = 1.5; s < T.len && ok; s += 1.5) ok = bez(T, s);
    if (ok && bez(T, T.len)) edge(ne, entryD + nd * 1.5, nd, nd > 0 ? ne.len - (ne.mouthB || 0) : (ne.mouthA || 0));
    return P;
  }
  // Where must `car` stop for the walker at (wx, wz) moving at (vx, vz)? Returns the gap from its front bumper to that
  // stop point, 1e9 if the walker is not and will not be in its way. The walker's lateral offset from the car's path and
  // its speed across it give the time window it spends inside the corridor (car half width + 0.25 m body + 0.35 m); the
  // car's front and back give the window the car spends at that point. Overlapping windows = yield, stopping 1.25 m short
  // of the walker (IDM keeps its own 2.2 m on top). A walker beside or behind the front bumper is not in front of the
  // car: stepping into a car's flank is the walker's to avoid (peds.js), a stop there would not help.
  _walkerGap(car, wx, wz, vx, vz, margin = 0.35) {
    const P = this.carPath(car);
    if (P.n < 2) return 1e9;
    const [hw, half] = this.carHalf(car);
    // quick out: nowhere near the path's box (grown by the corridor and 7 m of walking)
    if (P.bbF !== car._cpF) {
      let a = 1e9, b = 1e9, e = -1e9, f = -1e9;
      for (let i = 0; i < P.n; i++) { if (P.x[i] < a) a = P.x[i]; if (P.x[i] > e) e = P.x[i]; if (P.z[i] < b) b = P.z[i]; if (P.z[i] > f) f = P.z[i]; }
      P.bx0 = a; P.bz0 = b; P.bx1 = e; P.bz1 = f; P.bbF = car._cpF;
    }
    const grow = hw + 0.25 + margin + 7;
    if (wx < P.bx0 - grow || wx > P.bx1 + grow || wz < P.bz0 - grow || wz > P.bz1 + grow) return 1e9;
    let bd = 1e18, bs = 0, bl = 0, bnx = 0, bnz = 0;
    for (let i = 1; i < P.n; i++) {
      const ax = P.x[i - 1], az = P.z[i - 1], ex = P.x[i] - ax, ez = P.z[i] - az, L2 = ex * ex + ez * ez || 1e-9;
      const t = Math.max(0, Math.min(1, ((wx - ax) * ex + (wz - az) * ez) / L2));
      const dx = wx - ax - ex * t, dz = wz - az - ez * t, d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; bs = P.s[i - 1] + (P.s[i] - P.s[i - 1]) * t; const L = Math.sqrt(L2); bnx = -ez / L; bnz = ex / L; bl = dx * bnx + dz * bnz; }
    }
    if (bs < half - 0.4 || bs >= P.s[P.n - 1] - 0.05 && Math.sqrt(bd) > hw + 0.25 + margin) return 1e9;
    const W = hw + 0.25 + margin, lat = Math.abs(bl);
    if (lat > W + 7) return 1e9;
    const uLat = -(vx * bnx + vz * bnz) * Math.sign(bl || 1);   // > 0: walking toward the car's path
    const v = Math.max(car.v || 0, 0.8);
    const tF = Math.max(0, bs - half) / v, tB = tF + (2 * half + 0.6) / v;
    let hit;
    if (lat < W) {
      // in the corridor now: yield, unless walking out of it well before the car gets there
      hit = !(uLat < -0.15 && (W - lat) / -uLat + 0.7 < tF);
    } else if (uLat > 0.15) {
      const tIn = (lat - W) / uLat, tOut = (lat + W) / uLat;
      hit = tIn < 6 && tIn < tB + 0.6 && tOut > tF - 0.7;
    } else hit = false;
    return hit ? Math.max(0, bs - half - 1.25) : 1e9;
  }
  // once per update, BEFORE the cars move: every published walker marks the cars that must stop for it (car._pg)
  _pedPass(dt = 1 / 60) {
    this._pgStamp = (this._pgStamp || 0) + 1;
    const stamp = this._pgStamp;
    // Every car also looks for ANY walker along its path in peds.js's 2 m walker hash, not only the crossers: a turning
    // car's body sweeps the corner pavement on a tight curb return (W 122nd audit: turning cars through people walking and
    // waiting on the corner), and where a lane lies over the paving a car drove down the sidewalk into walkers (5th Ave
    // audit). Body margin 0.1 m for people on the pavement: they are not stepping into the lane. A 16 m occupancy grid of
    // the walkers skips every car with nobody near its path (most of the fleet: walkers live within 330 m of the camera).
    const H = this._walkerHash;
    if (H && this._carGrid) {
      // walkers in 8 m cells (from peds.js's 2 m hash) and a 64 m occupancy for the per-car cut
      const W8 = this._pgW8 || (this._pgW8 = new Map()), occ = this._pgOcc || (this._pgOcc = new Set());
      if (((this._pgN = (this._pgN || 0) + 1) & 255) === 0) W8.clear(); else for (const L of W8.values()) L.length = 0;
      occ.clear();
      for (const A of H.values()) for (const w of A) {
        if (w._x === undefined || w.cross) continue;   // crossers come from _crossers below
        if (this._walkerKerb && !w._kerb) continue;    // (peds.js LN25) well in from the kerb: never in a car's corridor
        const k = (Math.floor(w._x / 8) + 32768) * 65536 + (Math.floor(w._z / 8) + 32768);
        let L = W8.get(k);
        if (!L) W8.set(k, (L = []));
        L.push(w);
        occ.add((Math.floor(w._x / 64) + 4096) * 8192 + (Math.floor(w._z / 64) + 4096));
      }
      const par = this._frame & 1;
      for (let ci = 0; ci < this.cars.length; ci++) {
        const c = this.cars[ci];
        if (c.manual || !c._pose || !occ.size) continue;
        // half the fleet per frame: the other half carries last frame's gap, less what it drove since
        if ((ci & 1) !== par) {
          if (c._pkF === this._frame - 1 && c._pk < 1e8) { const g = c._pk - (c.v || 0) * dt; c._pk = g; c._pkF = this._frame; c._pgS = stamp; c._pg = Math.min(1e9, g); }
          continue;
        }
        c._pkF = this._frame; c._pk = 1e9;
        const q = c._pose, gx0 = Math.floor(q[0] / 64), gz0 = Math.floor(q[2] / 64);
        let any = false;
        for (let gx = gx0 - 1; gx <= gx0 + 1 && !any; gx++) for (let gz = gz0 - 1; gz <= gz0 + 1 && !any; gz++) any = occ.has((gx + 4096) * 8192 + (gz + 4096));
        if (!any) continue;
        const [hw, hl] = this.carHalf(c), rr = hw + (c.turn ? 0.35 : 0.1) + 0.25 + 1.8;   // corridor + 1.8 m of walking
        // a car going straight, not near its junction: its path is its lane ahead, so a walker nowhere near the ray ahead
        // of it (within rr + 1.5 of that ray) cannot be in its corridor: skip building the path at all
        const e = c.e, endD = e ? (c.dir > 0 ? e.len - c.d : c.d) : 0;
        if (!c.turn && endD > 40) {
          const fx = Math.sin(q[3]), fz = Math.cos(q[3]), v = c.v || 0, H = hl + Math.min(44, 8 + v * 1.1 + (v * v) / 4.8);
          const R = rr + 1.5, r2 = R * R, ax = q[0] + fx * (hl - 1), az = q[2] + fz * (hl - 1), L = H - hl + 1;
          const bx = ax + fx * L, bz = az + fz * L;
          let near = false;
          for (let gx = Math.floor((Math.min(ax, bx) - R) / 8); gx <= Math.floor((Math.max(ax, bx) + R) / 8) && !near; gx++)
            for (let gz = Math.floor((Math.min(az, bz) - R) / 8); gz <= Math.floor((Math.max(az, bz) + R) / 8) && !near; gz++) {
              const A = W8.get((gx + 32768) * 65536 + (gz + 32768));
              if (A) for (const w of A) {
                const t = Math.max(0, Math.min(L, (w._x - ax) * fx + (w._z - az) * fz));
                const ex = w._x - ax - fx * t, ez = w._z - az - fz * t;
                if (ex * ex + ez * ez < r2) { near = true; break; }
              }
            }
          if (!near) continue;
        }
        const P = this.carPath(c);
        if (P.n < 2) continue;
        const ctag = (this._pgTag = (this._pgTag || 0) + 1);   // one tag per car per frame: each walker is tested once per car
        // every other path point (3 m) and the last; each with the 8 m cells within rr of it
        const SX = this._psx || (this._psx = new Float64Array(72)), SZ = this._psz || (this._psz = new Float64Array(72)), SG = this._psg || (this._psg = new Int32Array(288));
        let ns = 0, gxA = 1e9, gxB = -1e9, gzA = 1e9, gzB = -1e9;
        for (let i = 0; i < P.n; i = i + 2 < P.n || i === P.n - 1 ? i + 2 : P.n - 1) {
          const x = P.x[i], z = P.z[i], a = Math.floor((x - rr) / 8), b = Math.floor((x + rr) / 8), c0 = Math.floor((z - rr) / 8), c1 = Math.floor((z + rr) / 8);
          SX[ns] = x; SZ[ns] = z; SG[ns * 4] = a; SG[ns * 4 + 1] = b; SG[ns * 4 + 2] = c0; SG[ns * 4 + 3] = c1; ns++;
          if (a < gxA) gxA = a; if (b > gxB) gxB = b; if (c0 < gzA) gzA = c0; if (c1 > gzB) gzB = c1;
        }
        const r15 = (rr + 1.5) * (rr + 1.5);
        for (let gx = gxA; gx <= gxB; gx++)
          for (let gz = gzA; gz <= gzB; gz++) {
              const A = W8.get((gx + 32768) * 65536 + (gz + 32768));
              if (!A) continue;
              for (const w of A) {
                if (w._pgT === ctag) continue;
                // within the corridor + 1.8 m of walking of a scanned point whose cells hold this one (3 m apart, +1.5)
                let near = false;
                for (let j = 0; j < ns && !near; j++) {
                  if (gx < SG[j * 4] || gx > SG[j * 4 + 1] || gz < SG[j * 4 + 2] || gz > SG[j * 4 + 3]) continue;
                  const x = SX[j], z = SZ[j];
                  near = (w._x - x) * (w._x - x) + (w._z - z) * (w._z - z) <= r15;
                }
                if (!near) continue;
                w._pgT = ctag;
                // 0.1 m for a car going straight; a TURNING car's inner rear corner tracks up to ~0.4 m inside the path of its centre
                const g = this._walkerGap(c, w._x, w._z, w._vx || 0, w._vz || 0, c.turn ? 0.35 : 0.1);
                if (c._pgS !== stamp) { c._pgS = stamp; c._pg = 1e9; }
                if (g < c._pg) c._pg = g;
                if (g < c._pk) c._pk = g;
              }
            }
      }
    }
    const X = this._crossers, V = this._crossV;
    if (!X || !X.length || !this._carGrid) return;
    const G = this._carGrid;
    for (let k = 0; k + 1 < X.length; k += 2) {
      const wx = X[k], wz = X[k + 1];
      const vx = V && k + 1 < V.length ? V[k] : 0, vz = V && k + 1 < V.length ? V[k + 1] : 0;
      // the cars within 46 m (the car grid's cells, as carsNear)
      const ga = Math.floor((wx - 46) / CG), gb = Math.floor((wx + 46) / CG), gc = Math.floor((wz - 46) / CG), gd = Math.floor((wz + 46) / CG);
      for (let gx = ga; gx <= gb; gx++) for (let gz = gc; gz <= gd; gz++) {
        const L = G.get((gx + 32768) * 65536 + (gz + 32768));
        if (!L) continue;
        for (let i = 0; i < L.length; i++) {
          const c = L[i];
          if (c.manual || !c._pose) continue;
          // only cars heading this way can reach the walker: a quick cut before the path test
          const q = c._pose, dx = wx - q[0], dz = wz - q[2];
          if (dx * c._hsx + dz * c._hcz < -3 && !c.turn) continue;
          // beyond all the path the car could have (arc <= Lmax + 6) plus its corridor and 10.5 m: no yield (see above)
          const hh = this.carHalf(c), v = c.v || 0, R = hh[1] + Math.min(44, 8 + v * 1.1 + (v * v) / (2 * 2.4)) + 6 + hh[0] + 0.6 + 10.5;
          if (dx * dx + dz * dz > R * R) continue;
          const g = this._walkerGap(c, wx, wz, vx, vz, 0.35);
          if (c._pgS !== stamp) { c._pgS = stamp; c._pg = 1e9; }
          if (g < c._pg) c._pg = g;
        }
      }
    }
  }
  update(dt, px, pz) {
    this.time += dt;
    dt = Math.min(dt, 0.05);
    this._frame = (this._frame || 0) + 1;
    if (PY25) this._pedPass(dt);
    if (this._compDirty) this._relabelComponents();
    { // parked LOD: rebucket when tiles changed or the camera moved 24m
      const mx = px - this._pbX, mz = pz - this._pbZ;
      if (this._parkDirty || mx * mx + mz * mz > 576) this._rebucketParked(px, pz);
    }
    // cars spawned through the external API (src/api/bridge.js, car.api) are extra, never part of the ambient target
    if (this.cars.length - (this.apiCount || 0) < this.target && this.edges.size > 30) for (let i = 0; i < 8; i++) this.spawnCar(px, pz);
    for (let ci = this.cars.length - 1; ci >= 0; ci--) {
      const car = this.cars[ci];
      if (car.manual) continue;   // an API car under apply_control(): src/api/bridge.js moves and places it
      const e = car.e;
      if (e.minor) car.dead = true; // stranded on a fragment: recycle onto the network
      // ---- curved intersection turn in progress
      if (car.turn) {
        const T = car.turn;
        // follow through the box: the nearest car ahead on the entry lane (or further along the
        // same connector) sets the speed — turning cars used to run at >= 3.5 m/s into a queue
        let gapT = 1e9;
        const ne = car.e, entryD = car.d;
        for (const oc of ne.cars) {
          if (oc === car || oc.dir !== car.dir || oc.lane !== car.lane) continue;
          if (oc.turn) { if (oc.turnNode === car.turnNode && oc.turn.s > T.s) gapT = Math.min(gapT, oc.turn.s - T.s - followGap(oc, car)); continue; }
          const ahead = (oc.d - entryD) * car.dir;
          if (ahead > -1) gapT = Math.min(gapT, (T.len - T.s) + ahead - followGap(oc, car));
        }
        // with a leader: comfortable stop within the gap (no speed floor — the old 3.5 m/s floor
        // drove followers into the car ahead on 10 m connectors); without: the old behaviour
        const pgT = this._pedGap(car);
        if (pgT < gapT) { gapT = pgT; car._pyHold = true; }
        if (gapT < 1e8) car.v = gapT < 0.6 ? 0 : Math.min(car.v + IDM.a * dt, T.vCap, Math.sqrt(Math.max(0, gapT - 0.6) * IDM.b));
        // PY25: a car that slowed in the box for a walker pulls away (IDM a), it does not jump back to 3.5 m/s in one frame
        else if (car._pyHold && car.v < 3.5) car.v = Math.min(T.vCap, car.v + IDM.a * dt);
        else { car._pyHold = false; car.v = Math.max(3.5, Math.min(car.v, T.vCap)); }
        T.s = Math.min(T.len, T.s + car.v * dt);
        const t = T.s / T.len;
        const omt = 1 - t;
        // cubic Bezier p0 -> c1 -> c2 -> p2 (see the connector construction below)
        const a0 = omt * omt * omt, a1 = 3 * omt * omt * t, a2 = 3 * omt * t * t, a3 = t * t * t;
        const bx = a0 * T.p0[0] + a1 * T.c1[0] + a2 * T.c2[0] + a3 * T.p2[0];
        const by = a0 * T.p0[1] + a1 * T.c1[1] + a2 * T.c2[1] + a3 * T.p2[1];
        const bz = a0 * T.p0[2] + a1 * T.c1[2] + a2 * T.c2[2] + a3 * T.p2[2];
        const d0 = 3 * omt * omt, d1 = 6 * omt * t, d2 = 3 * t * t;
        let tx2 = d0 * (T.c1[0] - T.p0[0]) + d1 * (T.c2[0] - T.c1[0]) + d2 * (T.p2[0] - T.c2[0]);
        let tz2 = d0 * (T.c1[2] - T.p0[2]) + d1 * (T.c2[2] - T.c1[2]) + d2 * (T.p2[2] - T.c2[2]);
        if (Math.abs(tx2) + Math.abs(tz2) < 1e-6) { tx2 = T.p2[0] - T.p0[0]; tz2 = T.p2[2] - T.p0[2]; } // degenerate (straight chord, k = 0) endpoints
        const yaw = Math.atan2(tx2, tz2);
        this._placeCar(car, bx, by, bz, yaw, dt);
        if (T.s >= T.len) { car.turn = null; }
        continue;
      }
      const s = this.sampleEdge(e, car.d);
      const dist = Math.hypot(s.x - px, s.z - pz);
      if (!car.api && (dist > DESPAWN_R || (car.dead && dist > DEAD_DESPAWN))) { this._remove(ci); continue; }
      const endD = car.dir > 0 ? e.len - car.d : car.d;         // distance to node center
      const nodeKey = car.dir > 0 ? e.b : e.a;
      const mEnd = car.dir > 0 ? e.mouthB : e.mouthA;           // junction boundary
      // stop point: car center such that the bumper sits on the painted stop bar. XW11: the bar is
      // at mouth + 0.35 + XW_DEPTH + 1.2, so the old fixed mouth+5.3 (tuned for a 4.6 m crossing)
      // would have parked the queue ON the deeper NYC crossing.
      const stopD = mEnd > 0 ? Math.min(mEnd + XW_DEPTH(e.rclass, e.width) + 0.7, Math.max(2, e.len * 0.45)) : 5.5;
      // ---- route early so we can see queues, signal phase and yield conflicts
      if (car.next && !this.edges.has(car.next.ne.id)) car.next = null;
      if (endD < 34 && !car.next) {
        const ex = this.dirAt(e, car.dir > 0 ? e.len - 0.5 : 0.5, car.dir);
        car.next = this._pickNext(car, nodeKey, ex[0], ex[1]) || null;
        car.nextNone = !car.next;
        // turn-lane discipline: a right turn is made from the curb lane, a left turn from the
        // inner lane (lane 0 is the leftmost lane of travel). Cars used to turn from any lane,
        // cutting across the neighbours - the main source of the side collisions in the audit.
        car.turnLaneWant = -1;
        if (car.next) {
          const ne2 = car.next.ne, nd = car.next.o.dir;
          const mN = nd > 0 ? ne2.mouthA : ne2.mouthB;
          const hB2 = this.dirAt(ne2, nd > 0 ? Math.min(mN + 1, ne2.len * 0.5) : Math.max(ne2.len - mN - 1, ne2.len * 0.5), nd);
          const cr = ex[0] * hB2[1] - ex[1] * hB2[0];
          const lanesHere = e.oneway !== 0 ? e.lanes : Math.max(1, Math.floor(e.lanes / 2));
          if (cr > 0.4) car.turnLaneWant = lanesHere - 1; else if (cr < -0.4) car.turnLaneWant = 0;
        }
      }
      // PY25: the wish is bounded by THIS edge's lanes (it was computed on the previous one, which may have had four)
      if (PY25 && car.turnLaneWant >= 0) car.turnLaneWant = Math.min(car.turnLaneWant, Math.max(0, (e.oneway !== 0 ? e.lanes : Math.max(1, Math.floor(e.lanes / 2))) - 1));
      if (PY25 && car.lane > Math.max(0, (e.oneway !== 0 ? e.lanes : Math.max(1, Math.floor(e.lanes / 2))) - 1)) car.lane = Math.max(0, (e.oneway !== 0 ? e.lanes : Math.max(1, Math.floor(e.lanes / 2))) - 1);
      if (car.turnLaneWant >= 0 && car.lane !== car.turnLaneWant && !car._lcT && endD > 6 && !car._dwell) {
        const nl = car.lane + (car.turnLaneWant > car.lane ? 1 : -1);
        let clear = true;
        for (const o of e.cars) {
          if (o === car || o.dir !== car.dir || o.lane !== nl) continue;
          if (Math.abs(o.d - car.d) < 11) { clear = false; break; }
        }
        if (clear) { car.lane = nl; car._lcT = 1.2; }
        else if (endD < 16) car.v = Math.min(car.v, 2.5);   // could not get over: creep and wait for a gap
      }
      // ---- IDM longitudinal control: leader on my edge/lane
      const v0 = e.speed * (0.85 + ((car.idx * 37) % 10) / 40);
      let gap = 1e9, leadV = v0;
      for (const o of e.cars) {
        if (o === car || o.dir !== car.dir || o.lane !== car.lane) continue;
        const g = (o.d - car.d) * car.dir - followGap(o, car);
        if (g > -2 && g < gap) { gap = Math.max(0.05, g); leadV = o.v; }
      }
      // the car that just left my lane through the mouth is still my leader while it is on its
      // connector (audit: followers bumped the tail of a car 1 m into its turn)
      if (endD < 40) {
        for (const oc of this.cars) {
          if (!oc.turn || oc.turnFrom !== e || oc.turnFromDir !== car.dir || oc.turnFromLane !== car.lane) continue;
          const g = (endD - mEnd) + oc.turn.s - followGap(oc, car);
          if (g > -2 && g < gap) { gap = Math.max(0.05, g); leadV = oc.v; }
        }
      }
      // queue look-ahead across the junction: nearest car on the chosen next edge
      if (car.next && endD < 30) {
        const ne = car.next.ne, ndir = car.next.o.dir;
        const entry0 = ndir > 0 ? 0 : ne.len;
        for (const oc of ne.cars) {
          if (oc.dir !== ndir) continue;
          const g2 = (oc.d - entry0) * ndir;
          if (g2 < -1) continue;
          const g = endD + g2 - followGap(oc, car);
          if (g > -2 && g < gap) { gap = Math.max(0.05, g); leadV = oc.v; }
        }
      }
      // ---- lane change: a blocked car slides to a clear adjacent lane
      const lanesDirNow = e.oneway !== 0 ? e.lanes : Math.max(1, Math.floor(e.lanes / 2));
      if (lanesDirNow > 1 && gap < 14 && leadV < car.v * 0.65 && car.v > 2 && !car._lcT) {
        for (const dl of [1, -1]) {
          const nl = car.lane + dl;
          if (nl < 0 || nl >= lanesDirNow) continue;
          let clear = true;
          for (const o of e.cars) {
            if (o === car || o.dir !== car.dir || o.lane !== nl) continue;
            if (Math.abs(o.d - car.d) < 13) { clear = false; break; }
          }
          if (clear) { car.lane = nl; car._lcT = 1.2; break; }
        }
      }
      if (car._lcT) { car._lcT -= dt; if (car._lcT <= 0) car._lcT = 0; }
      // ---- bus stops: buses pull over at the curb lane periodically
      if (car.kind === 'bus') {
        car._busT = (car._busT ?? (12 + Math.random() * 25)) - dt;
        if (car._busT <= 0 && !car._dwell && endD > 25 && car.lane === lanesDirNow - 1) {   // curb lane (lane 0 is the left lane)
          car._dwell = 7 + Math.random() * 4;
          car._busT = 28 + Math.random() * 30;
        }
        if (car._dwell) {
          car._dwell -= dt;
          if (car._dwell <= 0) car._dwell = 0;
          else { gap = Math.min(gap, 0.1); leadV = 0; } // doors open, hold
        }
      }
      // ---- double-parked delivery: a few vans stop in the curb lane and sit
      if (car._parkT) {
        car._parkT -= dt;
        if (car._parkT <= 0) car._parkT = 0;
        else { gap = Math.min(gap, 0.1); leadV = 0; }
      }
      // ---- signal / yield: virtual standing leader at the stop bar
      const st = this.stateFor(nodeKey, s.dirx * car.dir, s.dirz * car.dir);
      const brakeDist = (car.v * car.v) / (2 * IDM.b);
      let hold = st === 'R' || (st === 'A' && endD - stopD > brakeDist * 0.7);
      if (!hold && mEnd > 0 && endD < stopD + Math.max(7, brakeDist)) {
        hold = this._mustYield(car, nodeKey, s, st);
      }
      // divided avenues: the 14 m link between the twin nodes is junction INTERIOR. A car never
      // stops on it (its stop point would be inside the box: audit "tesla d7 v0 x turning charger"),
      // and instead waits at THIS stop line while the far node shows red for the continuation
      if (e.len < 26 && mEnd > 0) hold = false;
      // junction-box occupancy decided AT THE STOP BAR: a car that waited at the mouth instead had
      // its nose 2 m inside the box, where the other arms' connectors sweep (audit: "tesla d6 v0
      // end6 m5" x turning car, 25 pairs per 30 s)
      if (!hold && car.next && mEnd > 0 && endD < stopD + 8 && endD > mEnd + 0.7 && this._boxBlocked(car, e, nodeKey, car.next)) {
        hold = true;
        if (endD < stopD) car.v = 0;   // already past the stop bar when the box filled: stop where it is, short of the mouth
      }
      if (!hold && car.next && car.next.ne.len < 26) {
        const ne2 = car.next.ne, nd2 = car.next.o.dir;
        const hd = this.dirAt(ne2, nd2 > 0 ? ne2.len - 0.5 : 0.5, nd2);
        if (this.stateFor(nd2 > 0 ? ne2.b : ne2.a, hd[0], hd[1]) === 'R') hold = true;
      }
      if (hold && endD - stopD < gap) { gap = Math.max(0.1, endD - stopD); leadV = 0; }
      { const pg = this._pedGap(car); if (pg < gap) { gap = Math.max(0.05, pg); leadV = 0; } }
      const dv = car.v - leadV;
      const sStar = IDM.s0 + Math.max(0, car.v * IDM.T + (car.v * dv) / (2 * Math.sqrt(IDM.a * IDM.b)));
      const acc = IDM.a * (1 - Math.pow(car.v / Math.max(1, v0), IDM.delta) - (gap < 1e8 ? (sStar / Math.max(0.5, gap)) ** 2 : 0));
      car.v = Math.max(0, car.v + acc * dt);
      car.d += car.v * dt * car.dir;
      // ---- transition at the junction boundary (mouth), not the node center
      if (endD <= (mEnd > 0 ? mEnd + 0.6 : 0.12) || car.d >= e.len - 0.05 || car.d <= 0.05) {
        let pick = car.next && this.edges.has(car.next.ne.id) ? car.next : (() => {
          const ex = this.dirAt(e, car.dir > 0 ? e.len - 0.5 : 0.5, car.dir);
          return this._pickNext(car, nodeKey, ex[0], ex[1]);
        })();
        // could not reach the turn lane in time (traffic beside it): do not cut across the
        // neighbours — take the straight continuation when there is one
        if (pick && car.turnLaneWant >= 0 && car.lane !== car.turnLaneWant && Math.abs(this._turnCross(car, e, pick)) > 0.4) {
          const exH = this.dirAt(e, car.dir > 0 ? e.len - 0.5 : 0.5, car.dir);
          const alt = this._pickNext(car, nodeKey, exH[0], exH[1], true);
          if (alt) pick = alt;
        }
        // ---- junction box occupancy (traffic-law audit 2026-09-10: 128 collision pairs in 30 s,
        // most of them two cars mid-turn into the same lane, or crossing arms entering together).
        // Wait at the mouth while (a) another car is turning into the SAME entry lane and has not
        // cleared the box, or (b) a car from a NON-PARALLEL arm is still in the first 60 % of its
        // connector (crossing paths). Same-arm followers queue through IDM as before.
        // the same test also ran at the stop bar (IDM hold below); this is the fallback for a car
        // that had already crept past it when the box filled. Interior links (< 26 m) never wait.
        const myCr = pick ? this._turnCross(car, e, pick) : 0;
        if (pick && mEnd > 0) {
          const blocked = this._boxBlocked(car, e, nodeKey, pick);
          if (blocked) {
            // hold at the mouth: pin the car ON the trigger (re-evaluated every frame, no back-jump) with zero speed
            car.d = car.dir > 0 ? Math.max(0.1, e.len - mEnd - 0.58) : Math.min(e.len - 0.1, mEnd + 0.58);
            car.v = 0;
            const sH = this.sampleEdge(e, car.d); const offH = this._laneOffset(e, car);
            this._placeCar(car, sH.x - sH.dirz * car.dir * offH, sH.y + (NO_DATUM ? 0.03 : 0.002), sH.z + sH.dirx * car.dir * offH, Math.atan2(sH.dirx * car.dir, sH.dirz * car.dir), dt);
            continue;
          }
        }
        car.next = null;
        if (PY25) car.turnLaneWant = -1;   // the next edge picks its own turn lane 34 m before ITS junction
        e.cars.delete(car);
        if (!pick) {
          if (e.oneway === 0) this._uTurn(car, e, mEnd);
          else { car.dead = true; car.v = 0; e.cars.add(car); car.d = Math.max(0.1, Math.min(e.len - 0.1, car.d)); }
          continue;
        }
        // curved connector: junction-boundary exit -> next edge's mouth entry
        const exitD = Math.max(0.2, Math.min(e.len - 0.2, car.dir > 0 ? e.len - mEnd : mEnd));
        const exitPos = this.sampleEdge(e, exitD);
        const hA = [exitPos.dirx * car.dir, exitPos.dirz * car.dir];
        const exOff = this._laneOffset(e, car);
        const exLane = car.lane;   // lane on the edge being left (car.lane is re-clamped to the next edge below)
        const dir0 = car.dir;   // heading on the edge being left (car.dir flips to the next edge's below)
        const p0 = [exitPos.x - exitPos.dirz * car.dir * exOff, exitPos.y, exitPos.z + exitPos.dirx * car.dir * exOff];
        const ne = pick.ne;
        const mNext = pick.o.dir > 0 ? ne.mouthA : ne.mouthB;
        const entryD = pick.o.dir > 0 ? Math.min(mNext + 1.0, ne.len * 0.5) : Math.max(ne.len - mNext - 1.0, ne.len * 0.5);
        const en = this.sampleEdge(ne, entryD);
        car.e = ne;
        car.dir = pick.o.dir;
        const lanesDir = ne.oneway !== 0 ? ne.lanes : Math.max(1, Math.floor(ne.lanes / 2));
        car.lane = Math.min(car.lane, Math.max(0, lanesDir - 1));
        car.d = entryD;
        ne.cars.add(car);
        const enOff = this._laneOffset(ne, car);
        const p2 = [en.x - en.dirz * car.dir * enOff, en.y, en.z + en.dirx * car.dir * enOff];
        const hB = [en.dirx * car.dir, en.dirz * car.dir];
        const chord = Math.hypot(p2[0] - p0[0], p2[2] - p0[2]);
        const bend = Math.abs(hA[0] * hB[1] - hA[1] * hB[0]); // |sin| of turn angle
        // a junction connector is 5-40 m; anything longer means the continuation is not at this
        // junction (a routing fault) — recycle the car rather than fly it across the city
        if (chord > 60) { ne.cars.delete(car); car.dead = true; car.v = 0; e.cars.add(car); car.e = e; car.d = Math.max(0.1, Math.min(e.len - 0.1, exitD)); continue; }
        if (chord > 2) {
          // cubic arc with tangent-aligned controls (k = 0.36 chord approximates a circular arc).
          // The old quadratic put its control point at the lane-line intersection, which sits
          // INSIDE the corner, so every right turn bowed over the curb return and the audit
          // caught cars "on sidewalk" mid-turn. Each candidate arc is checked against the
          // rendered ground at five points; if one lands off the roadway the arc tightens,
          // then straightens to the chord.
          const mk = (k, q0 = p0, q2 = p2) => ({ p0: q0, c1: [q0[0] + hA[0] * k, q0[1], q0[2] + hA[1] * k], c2: [q2[0] - hB[0] * k, q2[1], q2[2] - hB[1] * k], p2: q2 });
          // wide swing for tight corners: exit and entry 1.2 m nearer the road centre (drivers do)
          const sw = (o) => o - Math.sign(o) * Math.min(1.2, Math.abs(o));
          const p0w = [exitPos.x - exitPos.dirz * dir0 * sw(exOff), exitPos.y, exitPos.z + exitPos.dirx * dir0 * sw(exOff)];
          const p2w = [en.x - en.dirz * car.dir * sw(enOff), en.y, en.z + en.dirx * car.dir * sw(enOff)];
          // the chord between two mouths passes ~0.3 m from the corner point, INSIDE the curb
          // return: straighter is worse here. Longer controls bow the arc toward the junction
          // centre, away from the corner. Test the car's INNER edge (0.9 m toward the inside of
          // the turn), not its centre, so the body clears the fillet too.
          const inner = hA[0] * hB[1] - hA[1] * hB[0] > 0 ? 1 : -1;
          const offRoad = (T) => {
            const S = this.streamer; if (!S || !S.surfaceInfoAt) return false;
            for (const t of [0.12, 0.28, 0.42, 0.56, 0.7, 0.86]) {
              const u = 1 - t, a0 = u * u * u, a1 = 3 * u * u * t, a2 = 3 * u * t * t, a3 = t * t * t;
              const x = a0 * T.p0[0] + a1 * T.c1[0] + a2 * T.c2[0] + a3 * T.p2[0];
              const z = a0 * T.p0[2] + a1 * T.c1[2] + a2 * T.c2[2] + a3 * T.p2[2];
              let tx = 3 * u * u * (T.c1[0] - T.p0[0]) + 6 * u * t * (T.c2[0] - T.c1[0]) + 3 * t * t * (T.p2[0] - T.c2[0]);
              let tz = 3 * u * u * (T.c1[2] - T.p0[2]) + 6 * u * t * (T.c2[2] - T.c1[2]) + 3 * t * t * (T.p2[2] - T.c2[2]);
              const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
              const info = S.surfaceInfoAt(x + inner * -tz * 1.1, z + inner * tx * 1.1, 0.6);
              if (info && !info.road) return true;
            }
            return false;
          };
          let T = mk(0.36 * chord);
          if (offRoad(T)) {
            let best = null;
            for (const kf of [0.5, 0.64, 0.8]) { const Tk = mk(kf * chord); if (!offRoad(Tk)) { best = Tk; break; } }
            if (!best) for (const kf of [0.36, 0.5, 0.64]) { const Tk = mk(kf * chord, p0w, p2w); if (!offRoad(Tk)) { best = Tk; break; } }
            T = best || mk(0.5 * chord, p0w, p2w);
          }
          car.turn = { ...T, len: chord * (1 + bend * 0.3), s: 0, vCap: bend > 0.4 ? 6.0 : 12 };
          car.turnNode = this.junction?.get(nodeKey) || nodeKey; car.turnLane = car.lane; car.turnHead = hA; car.turnCr = myCr;   // for the junction-box occupancy test
          car.turnFrom = e; car.turnFromDir = dir0; car.turnFromLane = exLane;                                                  // for the followers left behind
        }
        continue;
      }
      // ---- place instance: heading from a short chord (smooths polyline kinks),
      // lane offset from the smoothed right vector
      const sA = this.sampleEdge(e, car.d - 1.7);
      const sB = this.sampleEdge(e, car.d + 1.7);
      let hx = (sB.x - sA.x) * car.dir, hz = (sB.z - sA.z) * car.dir;
      const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
      const off = this._laneOffset(e, car);
      this._placeCar(car, s.x - hz * off, s.y + (NO_DATUM ? 0.03 : 0.002), s.z + hx * off, Math.atan2(hx, hz), dt);   // see the parked-car note: origin = contact patch
    }
    if (PY25) this._buildCarGrid();
    if (this.camera) this.lights.update(this.cars, this.camera);
    // VH13 — LAMP LENSES ON AFTER DUSK, AND ONLY ON MOVING CARS. The light/tail
    // materials used to carry a constant emissive (0x202226 / 0x350505) at every
    // hour, on every pool, so the lenses were faintly lit at noon and no brighter
    // at midnight — the only thing glowing after dark was the billboard sprite,
    // which is why headlamps read as sprites pasted near a car rather than as the
    // car's own lamps. The PARKED pools are never driven, so a standing car stays
    // dark (brief: no glow on parked cars).
    if (VH13) {
      const nv = ENV.night.value ?? 0;
      if (nv !== this._lampNight) {
        this._lampNight = nv;
        for (const p of Object.values(this.pools)) {
          if (p.lampL) p.lampL.emissiveIntensity = nv * 1.8;
          if (p.lampT) p.lampT.emissiveIntensity = nv * 0.85;
        }
      }
    }
    for (const p of Object.values(this.pools)) {
      p.mb.instanceMatrix.needsUpdate = true;
      p.md.instanceMatrix.needsUpdate = true;
      for (const m of p.mx) m.instanceMatrix.needsUpdate = true;
    }
  }
  // Parked-car LOD: full CARLA model inside 120m, collision-shell impostor
  // beyond. Rewrites all parked instance buffers from records — cheap, and
  // preserves the old 320-per-kind population cap (first-streamed tiles win).
  _rebucketParked(px, pz) {
    this._parkDirty = false;
    this._pbX = px; this._pbZ = pz;
    const R2 = 120 * 120;
    for (const k of Object.keys(this.parked)) { const P = this.parked[k]; P._n = 0; P._f = 0; P._t = 0; }
    for (const recs of this.parkedRecs.values()) {
      for (const rec of recs) {
        const P = this.parked[rec.kind];
        if (!P || P._t >= P.cap) continue; // same population cap as the old claim path
        const dx = rec.x - px, dz = rec.z - pz;
        if (!P.shell || dx * dx + dz * dz < R2) {
          const i = P._n++;
          P.mb.instanceMatrix.array.set(rec.m, i * 16);
          P.md.instanceMatrix.array.set(rec.m, i * 16);
          for (const m of P.mx) m.instanceMatrix.array.set(rec.m, i * 16);
          this._c.set(rec.color);
          P.mb.setColorAt(i, this._c);
        } else {
          const i = P._f++;
          P.shell.instanceMatrix.array.set(rec.m, i * 16);
          this._c.set(rec.color).multiplyScalar(0.82); // fake glass/wheel darkening
          P.shell.setColorAt(i, this._c);
        }
        P._t++;
      }
    }
    for (const k of Object.keys(this.parked)) {
      const P = this.parked[k];
      P.n = P._n;
      P.mb.count = P.md.count = P._n;
      P.mb.instanceMatrix.needsUpdate = P.md.instanceMatrix.needsUpdate = true;
      for (const m of P.mx) { m.count = P._n; m.instanceMatrix.needsUpdate = true; }
      if (P.mb.instanceColor) P.mb.instanceColor.needsUpdate = true;
      if (P.shell) {
        P.shell.count = P._f;
        P.shell.instanceMatrix.needsUpdate = true;
        P.shell.instanceColor.needsUpdate = true;
      }
    }
  }

  // Should this car wait at the stop bar? Covers: next-edge entry occupied
  // (hard gate — no more teleporting into a jammed entry), unprotected-left
  // yield to oncoming, and unsignalized minor-road priority (wider road wins,
  // equal widths yield to the right).
  // signed turn measure of the chosen continuation: > 0 right turn, < 0 left turn, ~0 straight
  _turnCross(car, e, pick) {
    const hx0 = this.dirAt(e, car.dir > 0 ? e.len - 0.5 : 0.5, car.dir);
    const neP = pick.ne, ndP = pick.o.dir, mNP = ndP > 0 ? neP.mouthA : neP.mouthB;
    const hBP = this.dirAt(neP, ndP > 0 ? Math.min(mNP + 1, neP.len * 0.5) : Math.max(neP.len - mNP - 1, neP.len * 0.5), ndP);
    return hx0[0] * hBP[1] - hx0[1] * hBP[0];
  }
  // junction-box occupancy + yields for the continuation `pick` (traffic-law audit 2026-09-10).
  // true = wait at the stop bar: (a) a car is turning into my target lane and is still on its
  // connector; (b) a crossing arm's car is in the first 60 % of its connector, or merges onto my
  // target edge; (c) I turn left and an oncoming car is in the box or approaching within 28 m on
  // any arm of this box (divided avenues' twin one-ways included); (d) an oncoming car is mid-left
  // turn across my path; (e) a through car on my target lane is about to pass the entry point.
  _boxBlocked(car, e, nodeKey, pick) {
    const hx0 = this.dirAt(e, car.dir > 0 ? e.len - 0.5 : 0.5, car.dir);
    const neP = pick.ne, ndP = pick.o.dir, mNP = ndP > 0 ? neP.mouthA : neP.mouthB;
    const hBP = this.dirAt(neP, ndP > 0 ? Math.min(mNP + 1, neP.len * 0.5) : Math.max(neP.len - mNP - 1, neP.len * 0.5), ndP);
    const myCr = hx0[0] * hBP[1] - hx0[1] * hBP[0];
    const laneP = Math.min(car.lane, Math.max(0, (neP.oneway !== 0 ? neP.lanes : Math.max(1, Math.floor(neP.lanes / 2))) - 1));
    const jg = this.junction?.get(nodeKey) || nodeKey;   // cluster identity: divided-avenue twin nodes share one box
    for (const oc of this.cars) {
      if (oc === car || !oc.turn || oc.turnNode !== jg) continue;
      if (oc.e === neP && oc.turnLane === laneP) return true;                       // (a)
      if (oc.turn.s >= oc.turn.len - 4) continue;                                  // cleared the box
      const cross = Math.abs(hx0[0] * oc.turnHead[1] - hx0[1] * oc.turnHead[0]);
      const dot = hx0[0] * oc.turnHead[0] + hx0[1] * oc.turnHead[1];
      if (cross > 0.5 && (oc.turn.s < oc.turn.len * 0.6 || oc.e === neP)) return true;   // (b)
      if (myCr < -0.4 && dot < -0.5) return true;                                  // (c) oncoming in the box
      if (dot < -0.5 && (oc.turnCr || 0) < -0.4 && myCr > -0.4) return true;       // (d)
    }
    if (myCr < -0.4) {                                                             // (c) oncoming approaching
      for (const oc of this.cars) {
        if (oc === car || oc.turn || !oc.e) continue;
        const oe = oc.e;
        const oKey = oc.dir > 0 ? oe.b : oe.a;
        if (oKey !== nodeKey && (this.junction?.get(oKey) || oKey) !== jg) continue;
        const endO = oc.dir > 0 ? oe.len - oc.d : oc.d;
        if (endO > 28 || oc.v <= 1.0) continue;
        const ho = this.dirAt(oe, oc.dir > 0 ? oe.len - 0.5 : 0.5, oc.dir);
        if (hx0[0] * ho[0] + hx0[1] * ho[1] < -0.5) return true;
      }
    }
    const entry0 = ndP > 0 ? Math.min(mNP + 1.0, neP.len * 0.5) : Math.max(neP.len - mNP - 1.0, neP.len * 0.5);
    for (const oc of neP.cars) {                                                   // (e)
      if (oc === car || oc.turn || oc.dir !== ndP || oc.lane !== laneP) continue;
      const behind = (entry0 - oc.d) * ndP;     // > 0: has not reached the entry point yet
      if (behind > -2 && behind < 6 + oc.v * 2.0) return true;
    }
    return false;
  }
  _mustYield(car, nodeKey, s, st) {
    const n = this.nodes.get(nodeKey);
    if (!n || !car.next) return false;
    const e = car.e;
    const ne = car.next.ne, ndir = car.next.o.dir;
    // entry gate: someone standing in the next edge's mouth zone
    const entry0 = ndir > 0 ? 0 : ne.len;
    const mNext = ndir > 0 ? ne.mouthA : ne.mouthB;
    for (const oc of ne.cars) {
      if (oc.dir !== ndir) continue;
      const g2 = (oc.d - entry0) * ndir;
      if (g2 > -0.5 && g2 < mNext + 6.5 && oc.v < 2) return true;
    }
    const hx = s.dirx * car.dir, hz = s.dirz * car.dir;
    const en = this.dirAt(ne, ndir > 0 ? Math.min(2, ne.len - 0.5) : Math.max(ne.len - 2, 0.5), ndir);
    const dot = hx * en[0] + hz * en[1];
    const crossT = hx * en[1] - hz * en[0]; // right vector is (-hz,hx): >0 right turn, <0 left turn
    const leftTurn = dot < 0.87 && crossT < -0.15;
    const signalized = this.signals.has(nodeKey);
    if (signalized && !leftTurn) return false; // green + straight/right: go
    for (const o of n.out) {
      if (o.id === e.id || o.id === ne.id) continue;
      const oe = this.edges.get(o.id);
      if (!oe) continue;
      for (const oc of oe.cars) {
        if (oc.dir !== -o.dir || oc.v < 0.8 || oc.turn) continue;
        const dToNode = o.dir > 0 ? oc.d : oe.len - oc.d;
        if (dToNode > Math.max(15, oc.v * 2.6)) continue;
        const oh = this.dirAt(oe, o.dir > 0 ? Math.min(1, oe.len - 0.1) : Math.max(oe.len - 1, 0.1), -o.dir);
        const oncoming = hx * oh[0] + hz * oh[1] < -0.7;
        if (leftTurn && oncoming) return true; // unprotected left yields
        if (!signalized && !oncoming) {
          if (oe.width > e.width + 1.5) return true; // minor road yields to the avenue
          if (Math.abs(oe.width - e.width) <= 1.5 && (oh[0] * hz - oh[1] * hx) > 0.5) return true; // yield to the right
        }
      }
    }
    return false;
  }
  // smooth 3-point-ish turnabout at dead ends instead of an instant flip
  _uTurn(car, e, mEnd) {
    const exitD = Math.max(0.3, Math.min(e.len - 0.3, car.dir > 0 ? e.len - Math.max(mEnd, 1.5) : Math.max(mEnd, 1.5)));
    const sP = this.sampleEdge(e, exitD);
    const oldHx = sP.dirx * car.dir, oldHz = sP.dirz * car.dir;
    const off0 = this._laneOffset(e, car);
    const p0 = [sP.x - sP.dirz * car.dir * off0, sP.y, sP.z + sP.dirx * car.dir * off0];
    car.dir = -car.dir;
    car.d = exitD;
    const off2 = this._laneOffset(e, car);
    const p2 = [sP.x - sP.dirz * car.dir * off2, sP.y, sP.z + sP.dirx * car.dir * off2];
    const p1 = [(p0[0] + p2[0]) / 2 + oldHx * 4.5, (p0[1] + p2[1]) / 2, (p0[2] + p2[2]) / 2 + oldHz * 4.5];
    e.cars.add(car);
    const len = Math.hypot(p2[0] - p0[0], p2[2] - p0[2]) + 7;
    // the turn integrator is cubic now: degree-elevate the quadratic control point
    const c1 = [p0[0] + (2 / 3) * (p1[0] - p0[0]), p0[1], p0[2] + (2 / 3) * (p1[2] - p0[2])];
    const c2 = [p2[0] + (2 / 3) * (p1[0] - p2[0]), p2[1], p2[2] + (2 / 3) * (p1[2] - p2[2])];
    car.turn = { p0, c1, c2, p2, len, s: 0, vCap: 3.2 };
  }
  _laneOffset(e, car) {
    if (car && car.laneF !== undefined) { car.laneF += (car.lane - car.laneF) * 0.04; return this._laneOffsetAt(e, car, car.laneF); }
    return this._laneOffsetAt(e, car, car ? car.lane : 0);
  }
  _laneOffsetAt(e, car, lane) {
    const usable = Math.max(3, e.width - (e.park >= 2 ? 4.6 : e.park ? 2.3 : 0) - 0.6);
    const laneW = Math.min(3.4, usable / Math.max(1, e.lanes));
    let off = e.oneway !== 0 ? (lane - (e.lanes - 1) / 2) * laneW : (0.5 + lane) * laneW;
    if ((e.park | 0) === 1) {
      // single-side parking: shift the driving band away from the parked curb
      const side = ((e.segId || 0) % 2) ? 1 : -1; // world side, matches parked placement
      off -= side * (car.dir ?? 1) * 1.15;
    }
    return off;
  }
  _placeCar(car, x, y, z, yaw, dt) {
    // GTA-style body dynamics: pitch under accel/brake, roll in corners
    const dv = (car.v - (car._pv ?? car.v)) / Math.max(dt, 1e-3);
    // VH13 — BRAKE LIGHTS. carlights.js tested `(car._pv ?? car.v) - car.v > 0.02`,
    // but this function has always written `car._pv = car.v` a few lines down and
    // it runs BEFORE CarLights.update in the same frame, so that term was
    // identically zero and brake lamps only ever lit on a fully stopped car.
    // Publish a brake flag off the acceleration this function already computes,
    // LATCHED for 0.35 s. IDM's acceleration is noisy frame to frame, so a
    // bare `acc < -0.9` test would chatter the brake lamps on and off at frame
    // rate on any car hovering near the threshold — a flicker source in exactly
    // the kind of moving night shot tflick exists to catch.
    if (dv < -0.9) car._brakeT = 0.35;
    else if (car._brakeT > 0) car._brakeT = Math.max(0, car._brakeT - dt);
    let dy = yaw - (car._py ?? yaw);
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const yawRate = dy / Math.max(dt, 1e-3);
    const pitchT = THREE.MathUtils.clamp(-dv * 0.006, -0.05, 0.065);
    const rollT = THREE.MathUtils.clamp(-yawRate * car.v * 0.0032, -0.09, 0.09);
    car._pitch = (car._pitch ?? 0) + (pitchT - (car._pitch ?? 0)) * Math.min(1, dt * 7);
    car._roll = (car._roll ?? 0) + (rollT - (car._roll ?? 0)) * Math.min(1, dt * 7);
    car._pv = car.v; car._py = yaw;
    car._pose = [x, y, z, yaw];
    const pool = this.pools[car.kind];
    this._e.set(car._pitch, yaw, car._roll, 'YXZ');
    this._q.setFromEuler(this._e);
    this._m.compose(this._v.set(x, y, z), this._q, this._s);
    pool.mb.setMatrixAt(car.idx, this._m);
    pool.md.setMatrixAt(car.idx, this._m);
    for (const m of pool.mx) m.setMatrixAt(car.idx, this._m);
  }
  _remove(ci) {
    const car = this.cars[ci];
    car.e.cars.delete(car);
    const pool = this.pools[car.kind];
    const lastIdx = --pool.n;
    pool.mb.count = pool.md.count = Math.max(0, pool.n);
    for (const m of pool.mx) m.count = pool.mb.count;
    if (car.idx !== lastIdx) {
      const swapped = this.cars.find((c) => c.kind === car.kind && c.idx === lastIdx);
      if (swapped) {
        swapped.idx = car.idx;
        this._c.set(swapped.color);
        pool.mb.setColorAt(swapped.idx, this._c);
        pool.mb.instanceColor.needsUpdate = true;
      }
    }
    this.cars.splice(ci, 1);
  }
}
