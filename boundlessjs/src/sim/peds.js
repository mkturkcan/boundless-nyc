// Pedestrians: instanced walkers on sidewalk offsets of the real street graph.
// They wait at signalized corners and cross when their parallel street has green.
import * as THREE from 'three';
import { signalState, walkTimeLeft } from './signals.js';
import { applySnowCap } from '../world/materials.js';
import { buildPedMesh } from './pedmesh.js';
import { spawnGuard } from './spawnGuard.js';
import { COLLIDERS } from '../city/colliders.js';

const PED_NEAR = typeof location !== 'undefined' && new URLSearchParams(location.search).has('pednear');
// PY25 (owner 2026-09-25: "pedestrians should never clip into vehicles etc."): path-aware car checks, crossers published
// with their velocities, walker spacing and obstacle clearance. `?py25=0` restores the previous behaviour.
const PY25 = typeof location === 'undefined' || new URLSearchParams(location.search).get('py25') !== '0';
// LN25 (owner 2026-09-25): "humans like to always have two separate lanes, always to their right for those going forward
// ... think of the sidewalk as a lane with width that walkers will share", and "humans are crowding over the grass and
// not using the sidewalk properly". Sidewalks become two-lane bands (_band / _laneLine), walk lines never run on lawn or
// along a median (_mkEdges), footways keep their walkers within the path's own width. `?lanes=0`: the old single line.
const LN25 = PY25 && (typeof location === 'undefined' || new URLSearchParams(location.search).get('lanes') !== '0');
const PED_TARGET = Math.min(700, Number(typeof location !== 'undefined' && new URLSearchParams(location.search).get('pedtarget')) || 520); // reference-photo sidewalk density; ?pedtarget=N (film)
// SPAWN_R0 was 40 m: an eye-level camera at 2.4 m stands in the middle of a 40 m
// hole, which is exactly the part of the frame the photographs fill with people
// (fifteen on one Harlem block, thirty-five at 5th & 42nd). Walkers do drift in
// from 40 m, but at 1.4 m/s that is half a minute and no screenshot waits.
// 8 m keeps the spawn out of the immediate foreground so the pop-in is not the
// first thing you look at. `?pednear=1` now shrinks only the INNER radius — it
// used to drop the outer one from 260 m to 60 m as well, which shrank the
// annulus twentyfold and made the near pavement emptier, and two critic rounds
// mis-diagnosed the spawner through it (round 3, cross-cutting finding 1).
const SPAWN_R0 = PED_NEAR ? 2 : 8, SPAWN_R1 = 260, DESPAWN_R = 330;
// shortest walk edge a ped may use. Was 12 m; the junction-mouth clip (_clip)
// takes 10-20 m off every block, which pushed 72 of 270 edges in the probe
// tiles under the old bar and emptied the short Harlem side streets.
const MIN_EDGE = 8;
// campus walkway pieces (cut at kit obstacles) are short: they spawn and take walkers from 4 m
const minLen = (e) => (e.campus ? 4 : MIN_EDGE);
// PY25 walker spacing (see _avoid): walker hash cell, street-furniture cell and range, and the instancer pools a walker
// can walk into (tree trunks and guards, poles, hydrants, bins, boxes, benches, racks, shelters, stoops, kiosks ...)
const WH = 2, OBS_C = 4, OBS_R = 340;
const OBS_POOL = /^(tree[A-Z]\d*Trunk|treeFence|lampCobra|lampCrook|hydrant|signalMast|signalPed|signPole|signPoleOneWay|streetSign|litter|mailbox|busShelter|subway|linknyc|newsstand|bench|bikeRack|phone|planter|stoop|standpipe|parkingMeter|bollard|newsbox|dumpster|foodcart|viaductPier|cone|bike|trashbag|cbox|barrier|warnsign)$/;
// a pool's footprint below head height (local bounds of the vertices under 1.9 m): a lamp's arm, a shelter's roof or a
// crown is overhead and does not block the pavement
function baseFootprint(geo, ymax = 1.9) {
  const pa = geo && geo.attributes && geo.attributes.position;
  if (!pa) return null;
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9, n = 0;
  for (let i = 0; i < pa.count; i++) {
    const y = pa.getY(i);
    if (y < -0.2 || y > ymax) continue;
    const x = pa.getX(i), z = pa.getZ(i);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; if (y < y0) y0 = y; if (y > y1) y1 = y;
    n++;
  }
  if (n < 3 || x1 - x0 < 0.01 || z1 - z0 < 0.01) return null;
  return { x0, x1, z0, z1, y0, y1 };
}
// ...and as a few boxes for the big kit (a stoop is its flight and the areaway rails either side, not one 4.8 x 4.1 m
// block; a subway stair is its walls): the triangles below head height, projected to plan and rasterised at 0.2 m (edges
// drawn, interiors filled), merged into row runs. Trunks count to 1.0 m: the bole and flare, not the low limbs.
const FOOT_MULTI = /^(stoop|subway|busShelter|newsstand|bench|foodcart|dumpster)$/;
// an obstacle box's four world corners (k: bit 0 = +u side, bit 1 = +v side), as [x0, z0, x1, z1, ...]
function boxCorners(b) {
  const C = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let k = 0; k < 4; k++) {
    const su = k & 1 ? 1 : -1, sv = k & 2 ? 1 : -1;
    C[k * 2] = b.x + b.ux * b.hx * su + b.vx * b.hz * sv; C[k * 2 + 1] = b.z + b.uz * b.hx * su + b.vz * b.hz * sv;
  }
  return C;
}
function footBoxes(geo, name) {
  const ymax = /Trunk$/.test(name) ? 1.0 : 1.9;
  const f = baseFootprint(geo, ymax);
  if (!f || !FOOT_MULTI.test(name)) return f ? [f] : null;
  const pa = geo.attributes.position, ix = geo.index, C = 0.2;
  const nx = Math.ceil((f.x1 - f.x0) / C) + 1, nz = Math.ceil((f.z1 - f.z0) / C) + 1;
  if (nx * nz > 60000) return [f];
  const occ = new Uint8Array(nx * nz);
  const mark = (x, z) => {
    const i = Math.floor((x - f.x0) / C), j = Math.floor((z - f.z0) / C);
    if (i >= 0 && j >= 0 && i < nx && j < nz) occ[j * nx + i] = 1;
  };
  const nt = (ix ? ix.count : pa.count) / 3;
  const V = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let t = 0; t < nt; t++) {
    let ylo = 1e9, yhi = -1e9;
    for (let k = 0; k < 3; k++) {
      const v = ix ? ix.getX(t * 3 + k) : t * 3 + k;
      V[k * 3] = pa.getX(v); V[k * 3 + 1] = pa.getY(v); V[k * 3 + 2] = pa.getZ(v);
      ylo = Math.min(ylo, V[k * 3 + 1]); yhi = Math.max(yhi, V[k * 3 + 1]);
    }
    if (ylo > ymax || yhi < -0.2) continue;
    for (let k = 0; k < 3; k++) {
      const ax = V[k * 3], az = V[k * 3 + 2], bx = V[((k + 1) % 3) * 3], bz = V[((k + 1) % 3) * 3 + 2];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.08));
      for (let q = 0; q <= n; q++) mark(ax + ((bx - ax) * q) / n, az + ((bz - az) * q) / n);
    }
    const ax = V[0], az = V[2], bx = V[3], bz = V[5], cx = V[6], cz = V[8];
    const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(den) < 1e-6) continue;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - f.x0) / C)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - f.x0) / C));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - f.z0) / C)), j1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - f.z0) / C));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = f.x0 + (i + 0.5) * C, pz = f.z0 + (j + 0.5) * C;
      const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / den, l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / den;
      if (l1 >= -0.02 && l2 >= -0.02 && l1 + l2 <= 1.02) occ[j * nx + i] = 1;
    }
  }
  // row runs, merged down the rows while they keep the same extent
  const out = [], open = new Map();
  for (let j = 0; j <= nz; j++) {
    const runs = new Set();
    if (j < nz) for (let i = 0; i < nx; i++) {
      if (!occ[j * nx + i]) continue;
      let e = i;
      while (e + 1 < nx && occ[j * nx + e + 1]) e++;
      runs.add(i * 65536 + e);
      i = e;
    }
    for (const [key, j0] of open) if (!runs.has(key)) { const i0 = Math.floor(key / 65536), i1 = key % 65536; out.push({ x0: f.x0 + i0 * C, x1: f.x0 + (i1 + 1) * C, z0: f.z0 + j0 * C, z1: f.z0 + j * C, y0: f.y0, y1: f.y1 }); open.delete(key); }
    for (const key of runs) if (!open.has(key)) open.set(key, j);
  }
  return out.length && out.length <= 24 ? out : [f];
}

export class Peds {
  // `rig` (PV2): the photoreal crowd renderer (sim/crowd.js) — same setAnim/setAmp/setStyle/timeRef/mesh contract as
  // pedmesh.js, plus update(dt). null = the procedural mannequins.
  constructor(scene, streamer, traffic, rig = null) {
    this.streamer = streamer;
    this.traffic = traffic;
    this.walkEdges = [];       // {pts,cum,len,width}
    this.tileEdges = new Map();
    this.tileSignals = new Map();
    this.signals = [];         // [x,z] of signalized nodes near loaded tiles
    this.peds = [];
    this.target = PED_TARGET;   // ambient walkers; the external API (src/api/bridge.js) sets it, its own walkers are extra
    const cap = 700;
    this.rig = rig || buildPedMesh(cap, applySnowCap(new THREE.MeshLambertMaterial(), 0.8));
    this.mesh = this.rig.mesh;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.castShadow = !rig;
    this.cap = rig ? rig.cap : cap;
    scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
    this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
    streamer.onTile((key, data) => {
      const list = [];
      for (const r of data.roads) {
        if (r.rclass > 2 || r.level > 0 || r.pts.length < 2) continue;
        // clip the centreline back to the junction MOUTHS before offsetting:
        // inside a junction cap the perpendicular offset points down the cross
        // street's roadbed, not at a kerb (see _mkEdge)
        const trimmed = this._clip(r.pts, (r.mouthA || 0) + 1.5, (r.mouthB || 0) + 1.5);
        // footfall: avenues and the wide cross streets (125th, 116th) carry several times a side street's walkers,
        // pedestrianised streets the most (PV2 side-by-sides: 125th & Lenox read empty at a uniform density)
        const busy = r.noTraffic ? 5 : r.rclass === 2 ? 4 : 1;
        // NARROW local streets (the brownstone blocks: a 9.1 m roadway, 4.6 m sidewalks) carry stoops reaching 2.7-3.6 m
        // off the facades (src/buildings/brownstone.js stoopPart), so the free walk is the strip between the tree pits
        // and the stoop ends: 1.25 m off the kerb, not 1.9 (film 7 review: walkers were walking through the stoops)
        const narrow = r.rclass <= 1 && !r.noTraffic && r.width < 11;
        for (const side of [-1, 1]) {
          for (const e of this._mkEdges(trimmed, r.width / 2 + (narrow ? 1.25 : 1.9), side, narrow ? 'narrow' : 'street')) {
            e.busy = busy; e.narrow = narrow; list.push(e);
          }
        }
      }
      // park paths walkable too
      // PATHS (rclass 5) are the OSM footways, and some of them ARE the crossings (footway=crossing) or run through a
      // junction: a walker on one walked across the carriageway in the middle of an edge, where neither the signal nor
      // the car check ever runs — three in four of the walker/car overlaps measured at W 120th & Amsterdam (owner
      // 2026-09-24: "pedestrians clipping into vehicles"). The carriageway parts are cut out (resampled every metre,
      // tested against the street centrelines' half widths); crossing a street is the kerb-to-kerb logic's job.
      const streets = [];
      for (const r of data.roads) {
        if (r.rclass > 4 || r.noTraffic || r.level > 0 || r.pts.length < 2) continue;
        let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
        for (const q of r.pts) { x0 = Math.min(x0, q[0]); z0 = Math.min(z0, q[2]); x1 = Math.max(x1, q[0]); z1 = Math.max(z1, q[2]); }
        const hw = r.width / 2 + 0.4;
        streets.push({ P: r.pts, hw, x0: x0 - hw, z0: z0 - hw, x1: x1 + hw, z1: z1 + hw });
      }
      const onStreet = (x, z) => {
        for (const st of streets) {
          if (x < st.x0 || x > st.x1 || z < st.z0 || z > st.z1) continue;
          const P = st.P;
          for (let i = 1; i < P.length; i++) {
            const ax = P[i - 1][0], az = P[i - 1][2], dx = P[i][0] - ax, dz = P[i][2] - az, L2 = dx * dx + dz * dz || 1e-9;
            const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
            const ex = x - ax - dx * t, ez = z - az - dz * t;
            if (ex * ex + ez * ez < st.hw * st.hw) return true;
          }
        }
        return false;
      };
      for (const r of data.roads) {
        if (r.rclass !== 5 || r.pts.length < 2) continue;
        const runs = [];
        let cur = [];
        for (let i = 1; i < r.pts.length; i++) {
          const A = r.pts[i - 1], B = r.pts[i], n = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[2] - A[2])));
          for (let k = i === 1 ? 0 : 1; k <= n; k++) {
            const t = k / n, p = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
            if (onStreet(p[0], p[2])) { if (cur.length >= 2) runs.push(cur); cur = []; } else cur.push(p);
          }
        }
        if (cur.length >= 2) runs.push(cur);
        for (const run of runs) {
          if (run.length < 7) continue;                 // shorter than ~6 m: a stub at a kerb, not a walk
          for (const e of this._mkEdges(run, 0, 1, 'path')) { e.busy = 0.6; list.push(e); }
        }
      }
      this.tileEdges.set(key, list);
      for (const e of list) this.walkEdges.push(e);
      this._nearT = 0;   // the walk graph changed: rebuild the near list next update (see update())
      this._obsDirty = true;   // PY25: new street furniture
      const sigs = (data.nodes || []).filter((n) => n.signal).map((n) => [n.x, n.z]);
      this.tileSignals.set(key, sigs);
      this.signals.push(...sigs);
      this._sigVer = (this._sigVer || 0) + 1;
    }, (key) => {
      const list = this.tileEdges.get(key) || [];
      for (const e of list) { e.dead = true; const i = this.walkEdges.indexOf(e); if (i >= 0) this.walkEdges.splice(i, 1); }
      this.tileEdges.delete(key);
      this._nearT = 0;
      this._obsDirty = true;
      const sigs = this.tileSignals.get(key) || [];
      for (const s of sigs) { const i = this.signals.indexOf(s); if (i >= 0) this.signals.splice(i, 1); }
      this.tileSignals.delete(key);
      this._sigVer = (this._sigVer || 0) + 1;
    });
    // COLUMBIA (film 7, 2026-09-23): the campus walkways are not in the road graph, so College Walk — the film's
    // opening shot — had no walkers at all. The campus kit's own data (OSM footways + College Walk's centre line,
    // public/data/columbia_campus.json) becomes walk edges once the ground under each one has streamed in.
    this._campusTodo = null;
    if (typeof fetch !== 'undefined') fetch('data/columbia_campus.json').then((r) => (r.ok ? r.json() : null)).then((C) => {
      if (!C) return;
      const todo = [];
      // College Walk is ~20 m of brick between the lawns: three walking lines across it, promenade footfall
      const wl = (C.walkLine || []).map((p) => [p[0], p[2] ?? 0, p[1]]);
      if (wl.length >= 2) for (const off of [-4.5, 0, 4.5]) todo.push({ pts: this._offsetLine(wl, off), busy: 5, y0: wl[0][1], promenade: true });
      for (const p of C.paths || []) if (p.pts && p.pts.length >= 2) todo.push({ pts: p.pts.map((q) => [q[0], 0, q[1]]), busy: 3, y0: null });
      this._campusTodo = todo;
    }).catch(() => {});
  }
  _offsetLine(pts, off) {
    return pts.map((p, i) => {
      const A = pts[Math.max(0, i - 1)], B = pts[Math.min(pts.length - 1, i + 1)];
      const dx = B[0] - A[0], dz = B[2] - A[2], L = Math.hypot(dx, dz) || 1;
      return [p[0] - (dz / L) * off, p[1], p[2] + (dx / L) * off];
    });
  }
  // Campus kit treads and granite decks stand up to 1.9 m over the compiled ground (city/campus.js) — a walker taking
  // surfaceAt() there walks sunk to the waist. Each flight tread and granite deck registers a collider prism flagged
  // `deck` (city/campus.js); the walker stands on the highest one under it. Fountain rims, walls, lamps: not decks.
  _campusTop(x, z, y) {
    const reg = COLLIDERS.byTile.get('campus');
    if (!reg || !reg.length) return y;
    const own = this._campusSet && this._campusSet.size === reg.length ? this._campusSet : (this._campusSet = new Set(reg));
    const g = COLLIDERS.grid.get(COLLIDERS._cell(x, z));
    if (!g) return y;
    let top = y;
    for (const p of g) {
      if (!p.deck || !own.has(p) || p.y1 <= top || p.y1 < y - 0.3 || p.y1 > y + 2.2) continue;
      if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ || !COLLIDERS._pointIn2D(x, z, p.pts)) continue;
      top = p.y1;
    }
    return top;
  }
  // a kit obstacle standing on the walk (fountain basin, wall, monument, lamp, bench): the walkway is cut there, never walked through
  _campusBlocked(x, z, y) {
    const reg = COLLIDERS.byTile.get('campus');
    const g = reg && reg.length ? COLLIDERS.grid.get(COLLIDERS._cell(x, z)) : null;
    if (!g) return false;
    const own = this._campusSet && this._campusSet.size === reg.length ? this._campusSet : (this._campusSet = new Set(reg));
    for (const p of g) {
      if (p.deck || !own.has(p) || p.y1 < y + 0.25 || p.y0 > y + 1.8) continue;
      if (p._area === undefined) {   // footprint (shoelace), once per prism
        let a = 0; const q = p.pts, n = q.length / 2;
        for (let i = 0, j = n - 1; i < n; j = i++) a += q[j * 2] * q[i * 2 + 1] - q[i * 2] * q[j * 2 + 1];
        p._area = Math.abs(a) / 2;
      }
      if (p._area < 4) continue;   // lamps, benches, bins: walked past, not cut at
      if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ && COLLIDERS._pointIn2D(x, z, p.pts)) return true;
    }
    return false;
  }
  // PY25: inside a BUILDING footprint (a tile's collider prism, not the campus kit's) at walker height? The campus footway
  // data runs through buildings in places, and a corner hop between two walkways went through Butler-size footprints:
  // walkers stood inside a 56 m building for a whole minute (amst120 audit)
  _inBuilding(x, z, y) {
    const g = COLLIDERS.grid.get(COLLIDERS._cell(x, z));
    if (!g) return false;
    const reg = COLLIDERS.byTile.get('campus');
    const own = reg && reg.length ? (this._campusSet && this._campusSet.size === reg.length ? this._campusSet : (this._campusSet = new Set(reg))) : null;
    for (const p of g) {
      if (p.deck || (own && own.has(p)) || p.y1 < y + 0.25 || p.y0 > y + 1.8) continue;
      if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ && COLLIDERS._pointIn2D(x, z, p.pts)) return true;
    }
    return false;
  }
  // a straight corner crossing between two campus walkways must not run through a kit obstacle either (sampled every metre)
  _crossBlocked(a, b) {
    const L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L));
    for (let k = 1; k < n; k++) {
      const t = k / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t;
      if (this._campusBlocked(x, z, y) || (PY25 && this._inBuilding(x, z, y))) return true;
    }
    return false;
  }
  // PY25: how far the walkable ground runs from (x, z) along (nx, nz), probed every 0.3 m to `max`: paved kinds only (no
  // lawn, no carriageway), outside buildings and campus solids. The campus footways had no width at all, so their walkers
  // spread +-1.6 m off the line: into the parking lane of 120th St and Amsterdam, into lawns and building walls.
  _freeRun(x, z, y, nx, nz, max) {
    const S = this.streamer;
    let w = 0;
    for (let d = 0.3; d <= max + 1e-6; d += 0.3) {
      const X = x + nx * d, Z = z + nz * d;
      const q = S && S.surfaceInfoAt ? S.surfaceInfoAt(X, Z, 0.3) : null;
      if (!q || q.road || q.kind === 'grass') break;
      if (S.roadAt && S.roadAt(X, Z, 0.2) === true) break;
      if (this._inBuilding(X, Z, y) || this._campusBlocked(X, Z, y)) break;
      w = d;
    }
    return w;
  }
  // a campus walkway becomes an edge when the ground under all of it is in: resampled every <= 1.5 m so walkers follow
  // the terraces and step runs (the compiled ground's height, lifted onto any campus tread / deck, _campusTop)
  _buildCampus() {
    const S = this.streamer;
    if (!S || !S.surfaceAt) return;
    const left = [];
    const push = (pts, w) => {
      if (pts.length < 2) return;
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
      const e = { pts, cum, len: cum[cum.length - 1], side: 1, busy: w.busy, campus: true, kind: 'campus' };
      if (PY25) {
        // the free width either side of the line (+lat = the left normal, as _pickLat / update read it); the promenade
        // lines of College Walk are 4.5 m apart on 20 m of brick and keep their +-1.6 m spread
        const n = pts.length, wo = new Float32Array(n), wi = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const A = pts[Math.max(0, i - 1)], B = pts[Math.min(n - 1, i + 1)];
          const dx = B[0] - A[0], dz = B[2] - A[2], L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
          const cap = w.promenade ? 2.2 : 2.4;
          wo[i] = this._freeRun(pts[i][0], pts[i][2], pts[i][1], nx, nz, cap) + 0.15;
          wi[i] = Math.max(0, this._freeRun(pts[i][0], pts[i][2], pts[i][1], -nx, -nz, cap) + 0.15 - 0.5);
        }
        const so = Array.from(wo).sort((a, b) => a - b), si = Array.from(wi).sort((a, b) => a - b);
        e.wOut = wo; e.wInA = wi;
        e.wOutMed = so[Math.floor(n * 0.4)];
        e.wIn = si[Math.floor(n * 0.4)];
      }
      if (e.len >= 3) { this.walkEdges.push(e); this._nearT = 0; }
    };
    for (const w of this._campusTodo) {
      // resolve every sample first: a walkway is built only when ALL of its ground is in
      const samples = [];
      let ok = true;
      for (let i = 0; i < w.pts.length && ok; i++) {
        const A = w.pts[i], B = w.pts[i + 1];
        const n = B ? Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[2] - A[2]) / 1.5)) : 1;
        for (let k = 0; k < n; k++) {
          const t = k / n, x = B ? A[0] + (B[0] - A[0]) * t : A[0], z = B ? A[2] + (B[2] - A[2]) * t : A[2];
          const y = S.surfaceAt(x, z);
          if (y === null || !isFinite(y)) { ok = false; break; }
          const yt = this._campusTop(x, z, y);
          // the campus footway data carries the CROSSWALKS too (OSM footway=crossing over Amsterdam and 120th): a walker
          // on one walked through the traffic with no signal or car check (the overlaps measured on 2026-09-24) — the
          // carriageway cuts the walkway like a kit obstacle; streets are crossed by the kerb-to-kerb logic
          const onRoad = S.roadAt ? S.roadAt(x, z, 0.2) === true : false;
          // LN25 (R1): nor over a lawn (an OSM footway line the ground does not pave): cut there, like a kit obstacle
          const onLawn = LN25 && !w.promenade && yt <= y + 0.01 && (() => { const q = S.surfaceInfoAt ? S.surfaceInfoAt(x, z, 0.3) : null; return !!q && q.kind === 'grass'; })();
          samples.push([x, yt, z, onRoad || onLawn || (PY25 && this._inBuilding(x, z, yt)) || (!w.promenade && this._campusBlocked(x, z, yt))]);
        }
      }
      if (!ok) { left.push(w); continue; }
      // a kit obstacle on the walk (fountain basin, wall, lamp, monument) CUTS the walkway there: the pieces either side
      // stay walkable (dropping the whole footway emptied Low Plaza, whose paths all pass a lamp or a fountain)
      let run = [];
      for (const q of samples) {
        if (q[3]) { push(run, w); run = []; continue; }
        run.push([q[0], q[1], q[2]]);
      }
      push(run, w);
    }
    this._campusTodo = left.length ? left : null;
  }

  // Cut `dA` metres off the head of a polyline and `dB` off the tail, keeping a
  // minimum usable length. This is where the pedestrian graph stops being wrong
  // at junctions: a walk edge is the road centreline pushed sideways by
  // `width / 2 + 1.9`, and a vertex that lies INSIDE the junction cap is pushed
  // into the cross street's roadbed instead of onto a kerb — 637 of the 700
  // walk-edge vertices that sampled asphalt in the four probe tiles were within
  // `mouth + 2 m` of an edge end, and 526 of those had no pavement within 20 m
  // in the offset direction, so no amount of sideways nudging could rescue
  // them. Clipped to the mouths, the roadway share of the graph falls from
  // 26.8 % to 9.5 % and the ends land on the corner pavement, which is also
  // where a pedestrian should stand to cross.
  _clip(pts, dA, dB) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
    const L = cum[cum.length - 1];
    if (!(L > 0)) return pts;
    if (L - dA - dB < 8) { const room = Math.max(0, (L - 8) / 2); dA = Math.min(dA, room); dB = Math.min(dB, room); }
    const a = Math.max(0, Math.min(dA, L)), b = Math.max(a + 0.1, Math.min(L - dB, L));
    const at = (d) => {
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i++;
      const A = pts[i - 1], B = pts[i];
      const t = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
      return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
    };
    const out = [at(a)];
    for (let i = 0; i < pts.length; i++) if (cum[i] > a + 0.05 && cum[i] < b - 0.05) out.push(pts[i]);
    out.push(at(b));
    return out;
  }
  _mkEdges(pts, off, side, kind = 'street') {
    const out = [];
    const onRoad = [];
    const S = this.streamer;
    const info = S && S.surfaceInfoAt ? (x, z) => S.surfaceInfoAt(x, z, 0.3) : null;
    // carriageway under a point whatever is drawn over it (a crossing footway's 'path' polygon reads as pavement to info)
    const road = S && S.roadAt ? (x, z) => S.roadAt(x, z, 0.2) === true : (x, z) => { const q = info && info(x, z); return !!(q && q.road); };
    for (let i = 0; i < pts.length; i++) {
      const A = pts[Math.max(0, i - 1)], B = pts[Math.min(pts.length - 1, i + 1)];
      const dx = B[0] - A[0], dz = B[2] - A[2];
      const L = Math.hypot(dx, dz) || 1;
      const nx = -dz / L, nz = dx / L;
      let wx = pts[i][0] + nx * off * side, wz = pts[i][2] + nz * off * side;
      // OFF THE CARRIAGEWAY. `width / 2 + 1.9` is measured from the road
      // CENTRELINE, so anywhere the compiled roadbed is wider than the segment's
      // own `width` — junction caps, divided avenues, the flared approaches —
      // the walk edge lands in a traffic lane. Measured over the four probe
      // tiles: 612 of 2574 walk-edge vertices on asphalt and 77 more in the
      // gutter, 26.8 % of the whole pedestrian graph, which is why walkers
      // stroll down the middle of 125th Street. Ask the ground and step
      // outboard (0.6 m at a time, never more than 4.8 m) until the pavement
      // starts. Vertices that never find one keep their place and their height,
      // so a park path or an unpaved lot still works.
      let stranded = false;
      if (info) {
        const s0 = info(wx, wz);
        if (!s0 || s0.road) {
          let found = false;
          for (let m = 1; m <= 8; m++) {
            const o2 = off + m * 0.6;
            const px = pts[i][0] + nx * o2 * side, pz = pts[i][2] + nz * o2 * side;
            const s2 = info(px, pz);
            if (s2 && !s2.road) { wx = px; wz = pz; found = true; break; }
          }
          stranded = !found && !!s0 && s0.road;    // still on the carriageway (no data at all is not "road")
        } else if (road(wx, wz)) {
          // "pavement" that is a footway strip laid over the junction asphalt: out, like the rest of the carriageway
          let found = false;
          for (let m = 1; m <= 8 && !found; m++) {
            const o2 = off + m * 0.6;
            const px = pts[i][0] + nx * o2 * side, pz = pts[i][2] + nz * o2 * side;
            if (!road(px, pz)) { const s2 = info(px, pz); if (s2 && !s2.road) { wx = px; wz = pz; found = true; } }
          }
          stranded = !found;
        }
      }
      // LN25 (R1): a walk line on LAWN or bare ground is not a sidewalk. A park-side walk narrower than the 1.9 m offset
      // has its paving toward the kerb: step back in, 0.3 m at a time to 1.5 m, never onto the carriageway; none there:
      // the vertex is cut like a stranded one. A MEDIAN (the Lenox and Broadway malls, a traffic island) is cut too:
      // soft ground within 2 m outboard, carriageway again within 14 m with no building between, and less than 2.6 m of
      // paving across the line (owner 2026-09-25: eight walkers strolling along the Lenox planting).
      if (LN25 && info && !stranded) {
        const loaded = (x, z) => !!(S.surfaceAt && S.surfaceAt(x, z) !== null);
        const okW = (q) => !!q && !q.road && q.kind !== 'grass';
        const ox = nx * side, oz = nz * side;
        const infoT = (x, z) => S.surfaceInfoAt(x, z, 0.05);
        if (!okW(infoT(wx, wz)) && loaded(wx, wz)) {
          let found = false;
          for (let m = 1; m <= 5 && !found; m++) {
            const px = wx - ox * m * 0.3, pz = wz - oz * m * 0.3;
            if (road(px, pz)) break;
            if (okW(infoT(px, pz))) { wx = px; wz = pz; found = true; }
          }
          if (!found) stranded = true;
        }
        if (!stranded && kind !== 'path') {
          for (let k = 1; k <= 20; k++) {
            const X = wx + ox * k * 0.5, Z = wz + oz * k * 0.5;
            if (this._inBuilding(X, Z, pts[i][1])) break;
            if (road(X, Z)) { stranded = true; break; }
          }
        }
        if (!stranded && kind !== 'path') {
          let soft = -1;
          for (let k = 1; k <= 4; k++) {
            const X = wx + ox * k * 0.5, Z = wz + oz * k * 0.5, q = info(X, Z);
            if (q && (q.road || q.kind !== 'grass')) continue;
            if (q || loaded(X, Z)) { soft = k * 0.5; break; }
          }
          if (soft > 0) {
            let dIn = 0;
            for (let m = 1; m <= 9; m++) { const X = wx - ox * m * 0.3, Z = wz - oz * m * 0.3; if (road(X, Z) || !okW(info(X, Z))) break; dIn = m * 0.3; }
            if (dIn + soft < 2.6) {
              for (let k = Math.ceil(soft / 0.5) + 1; k <= 28; k++) {
                const X = wx + ox * k * 0.5, Z = wz + oz * k * 0.5;
                if (this._inBuilding(X, Z, pts[i][1])) break;
                if (road(X, Z)) { stranded = true; break; }
              }
            }
          }
        }
      }
      onRoad.push(stranded);
      // `+ 0.16` was a guess at the curb height above the road centreline: it put
      // every pedestrian 2.5 cm over the flags (3.545 vs 3.520) and 13 cm over a
      // park path, with the AO pass drawing a dark disc under each pair of feet.
      // The fallback matters: an edge is built when ITS tile arrives, and the
      // neighbouring tile's sampler may not exist yet, so ~5 % of vertices take
      // it. 0.135 is the real curb reveal (sidewalk 3.520 - road 3.385 on the
      // flat set, CURB = 0.14 under real terrain) rather than the old 0.16.
      const sy = this.streamer && this.streamer.surfaceAt ? this.streamer.surfaceAt(wx, wz) : null;
      out.push([wx, sy !== null ? sy : pts[i][1] + 0.135, wz]);
    }
    // STRANDED ENDS. A vertex the outboard search could not get off the asphalt is a walker strolling through the
    // parked cars and the traffic lane (owner 2026-09-24: "pedestrians clipping into vehicles"). They sit at the
    // junction ends: trim them; an edge that is still on the carriageway in the middle is not a sidewalk at all.
    // An edge that crosses the carriageway in the middle (a block edge that runs on through a junction) is split there.
    const edges = [];
    let i0 = 0;
    for (let i = 0; i <= out.length; i++) {
      if (i < out.length && !onRoad[i]) continue;
      if (i - i0 >= 2) { const e = this._edgeOf(out.slice(i0, i), side, kind, info); if (e && e.len >= 3) edges.push(e); }
      i0 = i + 1;
    }
    return edges;
  }
  _edgeOf(kept, side, kind, info) {
    // FREE WIDTH. Walkers used to share one line 1.9 m in from the kerb (lat -0.3..0.8), which on a 5-6 m avenue
    // pavement is a single file ("they are all on the same narrow line"). Per vertex: how far the pavement runs on
    // toward the buildings (probed in 0.75 m steps to 6 m; no ground data yet: a typical 2.2 m). The kerb side keeps
    // 1.25 m for the tree pits, poles and hydrants (wIn below).
    const walkable = (q) => !!q && !q.road && q.kind !== 'grass';
    // LN25: the width probes at a tight tolerance (the shared `info` answers pavement up to 0.3 m past its edge)
    const infoS = (x, z, t) => (this.streamer && this.streamer.surfaceInfoAt ? this.streamer.surfaceInfoAt(x, z, t) : info && info(x, z));
    // PY25: probed every 0.5 m (was 0.75) and stopped by building footprints as well as by the end of the paving: a
    // facade standing over the sidewalk polygon had walkers brushing the wall (0.1-0.25 m off it, 125th & Lenox audit)
    const STEP = PY25 ? 0.5 : 0.75, NS = PY25 ? 12 : 8;
    const normal = (pts, i) => {
      const A = pts[Math.max(0, i - 1)], B = pts[Math.min(pts.length - 1, i + 1)];
      const dx = B[0] - A[0], dz = B[2] - A[2], L = Math.hypot(dx, dz) || 1;
      return [(-dz / L) * side, (dx / L) * side];      // +lat, toward the buildings
    };
    const probeOut = (pts, i) => {
      if (kind === 'path' && !(LN25 && info)) return 0.7;
      if (!info) return 2.2;
      const [nx, nz] = normal(pts, i);
      if (kind === 'path') {
        // LN25: a footway through grass keeps its walkers within its own paving (0.25 m in from each edge)
        let w = 0;
        for (let k = 1; k <= 8; k++) { const X = pts[i][0] + nx * k * 0.3, Z = pts[i][2] + nz * k * 0.3; if (!walkable(infoS(X, Z, 0.05)) || this._inBuilding(X, Z, pts[i][1])) break; w = k * 0.3; }
        return w + 0.15 + 0.25;
      }
      let w = 0, known = false;
      for (let k = 1; k <= NS; k++) {
        const X = pts[i][0] + nx * k * STEP, Z = pts[i][2] + nz * k * STEP;
        const q = LN25 ? infoS(X, Z, 0.1) : info(X, Z);
        if (k === 1 && q === null && !(LN25 && this.streamer.surfaceAt && this.streamer.surfaceAt(X, Z) !== null)) break;
        known = true;
        if (!walkable(q) || (PY25 && this._inBuilding(X, Z, pts[i][1]))) break;
        w = k * STEP;
      }
      return known ? w : 2.2;
    };
    // PY25: ...and toward the KERB. Where _mkEdges had to push a vertex outboard to the first pavement sample, the kerb is
    // 0-0.6 m away, not 1.9 m, and a walker taking the usual 0.65 m kerb-side margin stood in the gutter, next to (or in)
    // the parked cars. Per vertex: the paving toward the road, probed every 0.3 m to 1.5 m; the kerb side keeps 0.45 m.
    const base = kind === 'narrow' ? 0.05 : 0.65;
    const probeIn = (pts, i) => {
      const [nx, nz] = normal(pts, i);
      let w = 0, known = false;
      if (LN25 && kind === 'path') {
        for (let k = 1; k <= 8; k++) { const X = pts[i][0] - nx * k * 0.3, Z = pts[i][2] - nz * k * 0.3; if (!walkable(infoS(X, Z, 0.05)) || this._inBuilding(X, Z, pts[i][1])) break; w = k * 0.3; }
        return Math.max(0, w + 0.15 - 0.25);
      }
      for (let k = 1; k <= (LN25 ? 11 : 5); k++) {
        const X = pts[i][0] - nx * k * 0.3, Z = pts[i][2] - nz * k * 0.3;
        const q = info(X, Z);
        if (k === 1 && q === null) break;
        known = true;
        if (!walkable(q) || (this.streamer.roadAt && this.streamer.roadAt(X, Z, 0.15) === true)) break;
        w = k * 0.3;
      }
      // LN25: the paving itself (to 0.5 m off the kerb); the furniture zone (base) is applied in sample()
      if (LN25) return known ? Math.max(0, w + 0.15 - 0.5) : base + 0.75;
      return known ? Math.min(base, Math.max(0, w + 0.15 - 0.45)) : base;
    };
    let wo = kept.map((_, i) => probeOut(kept, i));
    const doIn = PY25 && info && (kind !== 'path' || LN25);
    let wi = doIn ? kept.map((_, i) => probeIn(kept, i)) : null;
    // PY25: a walk edge's vertices are the road centreline's, up to 50 m apart on a straight block, so a building corner
    // or a narrowing between two of them never reached the profile. Between vertices, every 4 m, one look at the line the
    // walkers may use on each side (the building side at the interpolated width, the kerb side at the kerb margin); where
    // it is blocked a vertex is inserted there and probed properly (a vertex every 2.5 m cost ~17 probes each: seconds per
    // tile).
    if (PY25 && info && kind !== 'path' && kept.length >= 2) {
      const P2 = [kept[0]], O2 = [wo[0]], I2 = wi ? [wi[0]] : null;
      // the narrowed width is held from one look BEFORE the first blocked one to one look after the last (a building corner
      // lies somewhere in between: interpolating from the free vertex would put the walkers on the corner)
      const vAt = (A, B, t) => {
        const x = A[0] + (B[0] - A[0]) * t, z = A[2] + (B[2] - A[2]) * t, y = A[1] + (B[1] - A[1]) * t;
        const sy = this.streamer && this.streamer.surfaceAt ? this.streamer.surfaceAt(x, z) : null;
        return [x, sy !== null && isFinite(sy) && Math.abs(sy - y) < 0.6 ? sy : y, z];
      };
      for (let i = 1; i < kept.length; i++) {
        const A = kept[i - 1], B = kept[i], L = Math.hypot(B[0] - A[0], B[2] - A[2]);
        const nx = (-(B[2] - A[2]) / (L || 1)) * side, nz = ((B[0] - A[0]) / (L || 1)) * side;
        let prevBad = false, lastO = 0, lastI = 0, lastD = 0;
        for (let d = 4; d < L - 1.5; d += 4) {
          const t = d / L, x = A[0] + (B[0] - A[0]) * t, z = A[2] + (B[2] - A[2]) * t, y = A[1] + (B[1] - A[1]) * t;
          const w = wo[i - 1] + (wo[i] - wo[i - 1]) * t, wIn = wi ? wi[i - 1] + (wi[i] - wi[i - 1]) * t : 0;
          const ox = x + nx * Math.max(0.3, w - 0.2), oz = z + nz * Math.max(0.3, w - 0.2);
          const qo = info(ox, oz);
          let bad = qo !== null && (!walkable(qo) || this._inBuilding(ox, oz, y));
          const wInL = LN25 ? Math.min(base, wIn) : wIn;
          if (!bad && wi && wInL > 0.05) {
            const ix = x - nx * (wInL + 0.25), iz = z - nz * (wInL + 0.25), qi = info(ix, iz);
            bad = qi !== null && (!walkable(qi) || (this.streamer.roadAt && this.streamer.roadAt(ix, iz, 0.15) === true));
          }
          if (!bad) {
            // just past a narrowing: one more vertex that still carries the narrow width
            if (prevBad) { P2.push(vAt(A, B, t)); O2.push(Math.min(lastO, w)); if (I2) I2.push(Math.min(lastI, wIn)); }
            prevBad = false;
            continue;
          }
          // entering a narrowing: a vertex one look back, already at the narrow width (filled in once it is known)
          let back = -1;
          if (!prevBad && d - 4 > 0.5 && d - 4 > lastD + 0.5) { P2.push(vAt(A, B, (d - 4) / L)); O2.push(0); if (I2) I2.push(0); back = P2.length - 1; }
          P2.push(vAt(A, B, t));
          const k = P2.length - 1;
          // probe the new vertex on the segment's own normal (its neighbours in P2 are on this segment)
          P2.push(B);
          const oN = probeOut(P2, k), iN = I2 ? probeIn(P2, k) : 0;
          P2.pop();
          O2.push(oN); if (I2) I2.push(iN);
          if (back >= 0) { O2[back] = Math.min(oN, wo[i - 1] + (wo[i] - wo[i - 1]) * ((d - 4) / L)); if (I2) I2[back] = Math.min(iN, wi[i - 1] + (wi[i] - wi[i - 1]) * ((d - 4) / L)); }
          prevBad = true; lastO = oN; lastI = iN; lastD = d;
        }
        if (prevBad && L - lastD > 1.5) {
          // the narrowing reaches the segment's end: hold it to the end vertex's own probe
          O2.push(Math.min(lastO, wo[i])); if (I2) I2.push(Math.min(lastI, wi[i])); P2.push(vAt(A, B, Math.min(1, (lastD + 1) / L)));
        }
        P2.push(B); O2.push(wo[i]); if (I2) I2.push(wi[i]);
      }
      kept = P2; wo = O2; wi = I2;
    }
    const wOut = Float32Array.from(wo), wInA = wi ? Float32Array.from(wi) : null;
    const sorted = Array.from(wOut).sort((x, y) => x - y);
    const cum = [0];
    for (let i = 1; i < kept.length; i++) cum.push(cum[i - 1] + Math.hypot(kept[i][0] - kept[i - 1][0], kept[i][2] - kept[i - 1][2]));
    return {
      pts: kept, cum, len: cum[cum.length - 1], side, wOut, kind, ...(wInA ? { wInA } : {}),
      wOutMed: sorted[Math.floor(sorted.length * 0.4)],
      wIn: kind === 'path' ? 0.7 : kind === 'narrow' ? 0.05 : 0.65,
      ...(LN25 && kind !== 'path' && wInA ? { wInCap: base } : {}),
    };
  }
  // LN25 THE SIDEWALK AS A BAND WITH TWO LANES. At (e, d) the band runs from the furniture zone (at least 1.25 m off the
  // kerb, further where the tree guards, poles and hydrants along it reach further) to 0.5 m off the buildings or the end
  // of the paving, and stops short of the frontage kit standing on it (stoops, areaway rails: _zones, measured from the
  // street furniture itself). Each walker keeps to the half on its own right and to its own place across that half (p.lu,
  // 0..1, drawn per edge): two lanes of people spread over their width, not one biased line. _avoid spaces them inside it
  // and may use all the paving (pLo..pHi) to get round someone; where the band has no room the walk is what is left.
  _zones(e) {
    e.zGen = this._obsGen;
    e.zK = e.zF = null;
    const G = this._obsG, L = this._obsL;
    if (!G || !L || !L.length || e.campus || e.kind === 'path' || !(e.len > 0)) return;
    const n = Math.floor(e.len / 2) + 1, zK = new Float32Array(n).fill(-99), zF = new Float32Array(n).fill(99);
    let any = false;
    for (let j = 0; j < n; j++) {
      const s = this.sample(e, Math.min(e.len, j * 2)), ob = e.side || 1;
      const nx = -s.dirz * ob, nz = s.dirx * ob, fx = s.dirx, fz = s.dirz;
      const pLo = -(s.wInP ?? s.wIn ?? e.wIn ?? 0.6), bl = s.wOut;
      const lat0 = pLo - 0.5, lat1 = bl + 0.5, cm = (lat0 + lat1) / 2;
      const cx = s.x + nx * cm, cz = s.z + nz * cm, R = 4.6 + (lat1 - lat0) / 2;
      let K = -99, F = 99;
      for (let gx = Math.floor((cx - R) / OBS_C); gx <= Math.floor((cx + R) / OBS_C); gx++)
        for (let gz = Math.floor((cz - R) / OBS_C); gz <= Math.floor((cz + R) / OBS_C); gz++) {
          const A = G.get((gx + 32768) * 65536 + (gz + 32768));
          if (!A) continue;
          for (const i of A) {
            const b = L[i];
            if (b.y1 < s.y + 0.05 || b.y0 > s.y + 1.75) continue;
            let amin = 1e9, amax = -1e9, bmin = 1e9, bmax = -1e9;
            for (let k = 0; k < 4; k++) {
              const su = k & 1 ? 1 : -1, sv = k & 2 ? 1 : -1;
              const C = b._c || (b._c = boxCorners(b)), X = C[k * 2] - s.x, Z = C[k * 2 + 1] - s.z;
              const a = X * fx + Z * fz, bb = X * nx + Z * nz;
              if (a < amin) amin = a; if (a > amax) amax = a; if (bb < bmin) bmin = bb; if (bb > bmax) bmax = bb;
            }
            if (bmax < lat0 || bmin > lat1) continue;
            let kerbSide = bmin < pLo + 1.2, bldgSide = bmax > bl - 1.2;
            // reaching over most of the width (a deep stoop, a shelter): it belongs to the side it stands against
            if (kerbSide && bldgSide) { if (bl - bmax <= bmin - pLo) kerbSide = false; else bldgSide = false; }
            if (!kerbSide && !bldgSide) continue;             // mid-pavement: the look-ahead goes round it
            // tree pits 8-9 m apart keep one furniture line (+-4.5 m); a stoop run keeps one frontage line (+-3 m)
            if (kerbSide) { if (amax >= -4.5 && amin <= 4.5 && bmax + 0.3 > K) K = bmax + 0.3; }
            else if (amax >= -3 && amin <= 3 && bmin - 0.3 < F) F = bmin - 0.3;
          }
        }
      zK[j] = K; zF[j] = F;
      if (K > -99 || F < 99) any = true;
    }
    if (any) { e.zK = zK; e.zF = zF; }
  }
  _band(e, s, d) {
    const B = this._bnd || (this._bnd = { lo: 0, hi: 0, pLo: 0, pHi: 0 });
    const pLo = -(s.wInP ?? s.wIn ?? e.wIn ?? 0.6), pHi = Math.max(pLo, s.wOut - 0.5);
    let lo = Math.min(pHi, Math.max(pLo, -(s.wIn ?? e.wIn ?? 0.6))), hi = pHi;
    // the zones are measured again after each new obstacle grid, a few edges per update
    if (e.zGen !== this._obsGen && this._obsGen !== undefined && (this._zBud = (this._zBud ?? 3) - 1) >= 0) this._zones(e);
    if (e.zK) {
      const j = Math.max(0, Math.min(e.zK.length - 1, Math.round(d / 2)));
      if (e.zK[j] > lo) lo = Math.min(pHi, e.zK[j]);
      if (e.zF[j] < hi) hi = Math.max(pLo, e.zF[j]);
    }
    if (hi - lo < 0.3) {
      // no room between the kerb furniture and the frontage (a stoop run): the walk is the paving that is left
      lo = Math.max(pLo, Math.min(lo, hi - 0.3));
      if (hi < lo) hi = lo;
    }
    B.lo = lo; B.hi = hi; B.pLo = pLo; B.pHi = pHi;
    return B;
  }
  // the line of a walker at place u (0 = the middle of the band, 1 = the outer edge of its half) in the half on its right
  _laneLine(B, e, dir, u) {
    const h = (B.hi - B.lo) / 2, inset = Math.min(0.15, h * 0.25), span = Math.max(0, h - 2 * inset);
    const right = (e.side || 1) * (dir || 1) > 0;          // +lat (toward the buildings) is on the walker's right
    return right ? B.lo + h + inset + u * span : B.hi - h - inset - u * span;
  }
  // the crossing offsets (along the crossing's left normal) that land the walker on the arrival sidewalk's paving
  _crossOffRange(e2, d2, lat1, dx, dz, len) {
    const q = this.sample(e2, d2), B = this._band(e2, q, d2), ob2 = e2.side || 1;
    const nx = -dz / len, nz = dx / len, proj = nx * -q.dirz * ob2 + nz * q.dirx * ob2;
    if (Math.abs(proj) < 0.2) return {};
    const a = (B.pLo - lat1) / proj, b = (B.pHi - lat1) / proj;
    return { oLo: Math.max(-0.9, Math.min(a, b)), oHi: Math.min(0.9, Math.max(a, b)) };
  }
  _laneAt(e, d, dir, u) {
    d = Math.max(0, Math.min(e.len, d));
    return this._laneLine(this._band(e, this.sample(e, d), d), e, dir, u);
  }
  // WHERE ACROSS THE PAVEMENT a walker walks: anywhere from the tree-pit line to half a metre off the buildings, biased
  // to the walker's own right (New Yorkers keep right, loosely: the two halves overlap in the middle). LN25: a new place
  // in the half on its right (p.lu), at its position.
  _pickLat(e, dir, p) {
    if (LN25 && p) { p.lu = Math.random(); return this._laneAt(e, p.d ?? e.len / 2, dir, p.lu); }
    if (e.narrow) return -0.1 + Math.random() * 0.25;
    const lo = -(e.wIn ?? 0.6), hi = Math.max(lo + 0.3, (e.wOutMed ?? 2.2) - 0.55);
    const right = (e.side || 1) * (dir || 1) > 0;          // +lat (toward the buildings) is on the walker's right
    const u = Math.random();
    const t = right ? 0.25 + 0.75 * Math.sqrt(u) : 0.75 * (1 - Math.sqrt(1 - u));
    return lo + t * (hi - lo);
  }
  // IS IT UNSAFE TO WALK FROM a TO b NOW? (PY25; also src/api/bridge.js's walker routes). Cars come from traffic.js's
  // 10 m buckets, never a loop over the fleet. A car is a threat when (1) its BODY is on the route and the route runs
  // into it (a walker never steps into a car, moving or standing), or (2) it is moving and will cross the route while
  // the walker is on it AND can no longer stop short of it (3.2 m/s2) — a car that can stop yields (traffic.js
  // _walkerGap), so NYC walkers with the WALK go. `mid`: a walker already crossing tests only its next 1.2 m.
  _carInPath(ax, az, bx, bz, mid = false, vw = 1.3) {
    const T = this.traffic;
    if (!T || !T.cars) return false;
    if (!PY25 || !T.carsNear || !T.carPath) return this._carInPathBox(ax, az, bx, bz);
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 1e-3) return false;
    const R = this._route || (this._route = { x: new Float32Array(96), z: new Float32Array(96), n: 0 });
    const lim = mid ? Math.min(L, 1.2) : L, n = Math.min(95, Math.max(2, Math.ceil(lim / 0.5)));
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (let i = 0; i <= n; i++) {
      const x = ax + (dx / L) * lim * (i / n), z = az + (dz / L) * lim * (i / n);
      R.x[i] = x; R.z[i] = z;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    R.n = n + 1; R.step = lim / n; R.x0 = x0; R.z0 = z0; R.x1 = x1; R.z1 = z1;
    let threat = false;
    T.carsNear((x0 + x1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, z1 - z0) / 2 + (mid ? 24 : 40), (c) => {
      if (!threat && this._carThreat(c, R, mid, Math.max(0.5, vw))) threat = true;
    });
    return threat;
  }
  _carThreat(c, R, mid, vw) {
    const q = c._pose;
    if (!q) return false;
    const T = this.traffic, [hw, hl] = T.carHalf(c), v = c.v || 0;
    const cy = Math.cos(q[3]), sy = Math.sin(q[3]);
    // (1) the car's body: the walker's centre may not come within 0.4 m of it (0.25 m of body + 0.15) while closing in
    const body = (x, z) => {
      const rx = x - q[0], rz = z - q[2], lx = rx * cy - rz * sy, lz = rx * sy + rz * cy;
      return Math.hypot(Math.max(Math.abs(lx) - hw, 0), Math.max(Math.abs(lz) - hl, 0));
    };
    const reach = hl + hw + (v > 0.3 ? v * 1.2 : 0) + 1;
    if (Math.abs(q[0] - (R.x0 + R.x1) / 2) - (R.x1 - R.x0) / 2 < reach && Math.abs(q[2] - (R.z0 + R.z1) / 2) - (R.z1 - R.z0) / 2 < reach) {
      const d0 = body(R.x[0], R.z[0]);
      for (let i = 1; i < R.n; i++) {
        const d = body(R.x[i], R.z[i]);
        if (d < 0.4 && d < d0 - 0.02) return true;
        // a car rolling across the route within the next second (its body 1.2 s ahead)
        if (v > 0.3 && i * R.step < 2.5) {
          const fx = sy * v * 1.0, fz = cy * v * 1.0;   // where the car is in 1 s
          const rx = R.x[i] - q[0] - fx, rz = R.z[i] - q[2] - fz, lx = rx * cy - rz * sy, lz = rx * sy + rz * cy;
          if (Math.hypot(Math.max(Math.abs(lx) - hw, 0), Math.max(Math.abs(lz) - hl, 0)) < 0.4 && (i * R.step) / vw < 1.6) return true;
        }
      }
    }
    if (v < 0.3) return false;   // standing, its body clear of the route: it yields once the walker is on the crossing
    // (2) a moving car that will sweep the route: its corridor along its REAL path (traffic.js carPath)
    const P = T.carPath(c);
    if (P.n < 2) return false;
    if (P.bx === undefined || P.bf !== c._cpF) {
      let a = 1e9, b = 1e9, e = -1e9, f = -1e9;
      for (let i = 0; i < P.n; i++) { if (P.x[i] < a) a = P.x[i]; if (P.x[i] > e) e = P.x[i]; if (P.z[i] < b) b = P.z[i]; if (P.z[i] > f) f = P.z[i]; }
      P.bx = a; P.bz = b; P.ex = e; P.ez = f; P.bf = c._cpF;
    }
    const W = hw + 0.5;
    if (P.bx > R.x1 + W || P.ex < R.x0 - W || P.bz > R.z1 + W || P.ez < R.z0 - W) return false;
    let tIn = -1, tOut = -1, sC = 0;
    for (let i = 0; i < R.n; i++) {
      const x = R.x[i], z = R.z[i];
      let bd = 1e18, bs = 0;
      for (let j = 1; j < P.n; j++) {
        const px = P.x[j - 1], pz = P.z[j - 1], ex = P.x[j] - px, ez = P.z[j] - pz, L2 = ex * ex + ez * ez || 1e-9;
        const t = Math.max(0, Math.min(1, ((x - px) * ex + (z - pz) * ez) / L2));
        const ddx = x - px - ex * t, ddz = z - pz - ez * t, d2 = ddx * ddx + ddz * ddz;
        if (d2 < bd) { bd = d2; bs = P.s[j - 1] + (P.s[j] - P.s[j - 1]) * t; }
      }
      if (bs >= hl - 0.3 && bd < W * W) { if (tIn < 0) { tIn = (i * R.step) / vw; sC = bs; } tOut = ((i + 1) * R.step) / vw; }
    }
    if (tIn < 0) return false;
    // a car that can still stop comfortably short of the walker will (traffic.js _walkerGap): walk on
    if (sC - hl - 1.5 > (v * v) / (2 * 3.2)) return false;
    const tF = Math.max(0, sC - hl) / v, tB = tF + (2 * hl + 0.6) / v;
    return tIn < tB + 0.5 && tOut > tF - 0.6;
  }
  // the pre-PY25 test (?py25=0): a car's front, middle and back now and in 1.8 s near the segment
  _carInPathBox(ax, az, bx, bz) {
    const T = this.traffic;
    if (!T || !T.cars) return false;
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const minX = Math.min(ax, bx) - 16, maxX = Math.max(ax, bx) + 16, minZ = Math.min(az, bz) - 16, maxZ = Math.max(az, bz) + 16;
    for (const c of T.cars) {
      const q = c._pose;
      if (!q || q[0] < minX || q[0] > maxX || q[2] < minZ || q[2] > maxZ) continue;
      const v = c.v || 0, fx = Math.sin(q[3]), fz = Math.cos(q[3]);
      const dm = T.vehDims && T.vehDims[c.kind], half = dm ? dm[2] / 2 : 2.4, wide = dm ? dm[0] / 2 : 1.0;
      // the car's front, middle and back, now and where it will be in 1.8 s: a truck's nose overhangs the crossing
      for (const k of [0, 1.8]) {
        for (const a of [-half * 0.8, 0, half * 0.8]) {
          const px = q[0] + fx * (v * k + a), pz = q[2] + fz * (v * k + a);
          const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
          if (Math.hypot(px - (ax + dx * t), pz - (az + dz * t)) < wide + 0.9) return true;
        }
      }
    }
    return false;
  }
  spawnBuddy(e, d, lead) {
    let pyD = d, pyLat = 0, pyLu;
    if (PY25) {
      // beside the lead where the free width there holds two abreast, else 0.9 m behind (else no companion this time):
      // a companion put beside its lead on a walkway with room for one was held on the lead's own line, inside it
      const s0 = this.sample(e, d);
      let lo = -(s0.wIn ?? e.wIn ?? 0.6), hi = Math.max(lo, s0.wOut - 0.5), lL = Math.max(lo, Math.min(hi, lead.lat || 0)), a0 = 0, b0 = 0;
      if (LN25) {
        // LN25: abreast inside the lead's own half (the pair keeps right together), else behind
        const B = this._band(e, s0, d);
        lo = B.pLo; hi = B.pHi;
        a0 = this._laneLine(B, e, lead.dir, 0); b0 = this._laneLine(B, e, lead.dir, 1);
        lL = this._laneLine(B, e, lead.dir, lead.lu ?? 0.5);
      }
      const out = (l) => l < lo - 0.02 || l > hi + 0.02 || (LN25 && (l < Math.min(a0, b0) - 0.1 || l > Math.max(a0, b0) + 0.1));
      let side = LN25 ? (lL > (a0 + b0) / 2 ? -0.62 : 0.62) : (lead.lat || 0) > ((e.wOutMed ?? 2.2) - 0.55 - (e.wIn ?? 0.6)) / 2 ? -0.62 : 0.62;
      let behind = !LN25 && !!e.narrow;
      if (!behind && out(lL + side)) { if (!out(lL - side)) side = -side; else behind = true; }
      pyD = Math.max(0, Math.min(e.len, behind ? d - (lead.dir || 1) * 0.9 : d + (Math.random() - 0.5) * 0.3));
      if (behind && Math.abs(pyD - d) < 0.6) return;   // the lead at the end of its edge: no room behind
      pyLat = behind ? lL : lL + side;
      if (LN25) pyLu = behind ? (lead.lu ?? 0.5) : b0 !== a0 ? Math.max(0, Math.min(1, (pyLat - a0) / (b0 - a0))) : 0.5;
      const q = this.sample(e, pyD), ob = e.side || 1;
      if (!this._clearAt(q.x - q.dirz * ob * pyLat, q.z + q.dirx * ob * pyLat, q.y, 0.4, false)) return;
    }
    const c = new THREE.Color().copy(lead.color).offsetHSL((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.15);
    let mask = 0;
    const o = Math.random();
    if (o < 0.45) mask |= 1; else if (o < 0.67) mask |= 2;
    if (Math.random() < 0.25) mask |= 4;
    if (Math.random() < 0.15) mask |= 16;
    if (Math.random() < 0.35) mask |= 32;
    // PY25: `d` is the LEAD's position. The caller used to pass lead.d + 0.9, so on a narrow sidewalk a companion of a
    // walker heading +d spawned at exactly the lead's d and lat (0.9 - 0.9) and walked inside them at the same pace.
    const dB = PY25 ? (e.narrow ? d - (lead.dir || 1) * 0.9 : d + (Math.random() - 0.5) * 0.3) : (e.narrow ? d - (lead.dir || 1) * 0.9 : d);
    const ped = {
      // on a narrow sidewalk the companion walks BEHIND (0.9 m), not beside: beside is a stoop or a tree pit
      e, d: PY25 ? pyD : Math.max(0, Math.min(e.len, dB)), dir: lead.dir, v: lead.v, phase: Math.random() * 10, idx: this.peds.length, buddy: lead,
      // side by side, on whichever side of the lead has the room
      lat: PY25 ? pyLat : e.narrow ? (lead.lat || 0) : (lead.lat || 0) + ((lead.lat || 0) > ((e.wOutMed ?? 2.2) - 0.55 - (e.wIn ?? 0.6)) / 2 ? -0.62 : 0.62),
      ...(LN25 ? { lu: pyLu ?? 0.5 } : {}),
      skin: Math.random(), build: 0.86 + Math.random() * 0.3, amp: lead.amp,
      mask, bagTone: Math.random(), umbTone: Math.random(),
      late: undefined, stand: undefined, standFace: undefined,
      latS: undefined, yaw: undefined, waiting: undefined, cross: undefined, pick: undefined, vf: undefined,
          _x: undefined, _y: undefined, _z: undefined, _vx: undefined, _vz: undefined, _latA: undefined, _latV: undefined,
          _vT: undefined, _vTh: undefined, _vBy: undefined, _sq: undefined, _avT: undefined, _bkT: undefined, _kerb: undefined,
          _obsGen: undefined, _pgT: undefined, blockT: undefined, carHold: undefined, carHoldT: undefined, carT: undefined,
          goT: undefined, pkT: undefined, redWait: undefined, waitT: undefined, color: undefined,
    };
    this.peds.push(ped);
    this.mesh.setColorAt(ped.idx, c);
    ped.color = c.clone();
    this.mesh.instanceColor.needsUpdate = true;
    this.rig.setAnim(ped.idx, ped.phase, ped.v * 4.4, ped.amp, ped.skin);
    this.rig.setStyle(ped.idx, ped.mask, ped.bagTone, ped.umbTone);
    this.mesh.count = this.peds.length;
  }
  sample(e, d) {
    d = Math.max(0, Math.min(e.len, d));
    // first vertex with cum >= d (binary search: PY25 edges carry a vertex every 2.5 m)
    let lo = 1, hi = e.cum.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (e.cum[m] < d) lo = m + 1; else hi = m; }
    const i = lo;
    const t = (d - e.cum[i - 1]) / Math.max(0.001, e.cum[i] - e.cum[i - 1]);
    const A = e.pts[i - 1], B = e.pts[i];
    const dx = B[0] - A[0], dz = B[2] - A[2];
    const L = Math.hypot(dx, dz) || 1;
    const wo = e.wOut ? e.wOut[i - 1] + (e.wOut[i] - e.wOut[i - 1]) * t : 2.2;
    const wr = e.wInA ? Math.min(e.wInA[i - 1], e.wInA[i]) : undefined;
    // LN25: the kerb-side paving runs to wr (0.5 m off the kerb); the furniture zone ends 1.25 m off it (wr - 0.75)
    const wi = wr !== undefined && e.wInCap !== undefined ? wr - 0.75 : wr;
    return { x: A[0] + dx * t, y: A[1] + (B[1] - A[1]) * t, z: A[2] + dz * t, dirx: dx / L, dirz: dz / L, wOut: wo, wIn: wi, wInP: wr };
  }
  update(dt, px, pz, playerVel) {
    if (this._campusTodo && ((this._campusF = (this._campusF || 0) + 1) % 20) === 0) this._buildCampus();
    this._zBud = 3;
    // PY25: the walker hash and the obstacle grids first, so this frame's spawns already test against them
    if (PY25) {
      this._hashWalkers();
      // the furniture boxes: when tiles changed (at most every 45 updates) or the camera went 80 m from their centre
      this._obsF = (this._obsF || 0) + 1;
      const oa = this._obsAt;
      // ...or when the obstacle pools changed (bikes, bags, work-zone kit are claimed when their models load, after the tile)
      if (this._obsF % 30 === 29) {
        const I = this.streamer && this.streamer.ctx && this.streamer.ctx.instancer;
        let ver = 0;
        if (I && I.pools) for (const [n, q] of I.pools) if (OBS_POOL.test(n)) ver = (ver * 31 + (q.ver | 0) + q.top) % 1e9;
        if (ver !== this._obsVer) { this._obsVer = ver; this._obsDirty = true; }
      }
      if (!oa || (this._obsDirty && this._obsF > 45) || (px - oa[0]) ** 2 + (pz - oa[1]) ** 2 > 6400) { this._obsDirty = false; this._obsF = 0; this._obsBuild(px, pz); this._obsGen = (this._obsGen || 0) + 1; }
      if (this.traffic && this.traffic.parkedRecs && ((this._pkF = (this._pkF || 0) + 1) % 30 === 1)) {
        let sig = this.traffic.parkedRecs.size;
        for (const r of this.traffic.parkedRecs.values()) sig = (sig * 31 + r.length) % 1e9;
        if (sig !== this._pkSig) { this._pkSig = sig; this._parkBuild(); }
      }
    }

    this.rig.timeRef.value += dt; // drives the shader walk cycle
    // maintain
    if (this.peds.length - (this.apiCount || 0) < this.target && this.walkEdges.length > 20) {
      // sample edges NEAR the player (refreshed every 0.5 s): drawing from the whole
      // streamed world gave 2.6 % acceptance and 13 peds at t+30 s against a target
      // of 520, degrading as tiles streamed in (critic round 3)
      // FILM 7 (2026-09-23): the refresh used to run on SIM time only. Record mode settles on dt = 0 frames, so the list
      // was built once, at the first update, from whatever tiles had streamed in by then — on the RTX run a handful of
      // far ones — and all 640 walkers spawned there: none within 45 m of the lens (the Intel iGPU's slower frames let
      // the near tiles land first, which is why the probes looked fine). Tile add / remove now zero the timer.
      this._nearT = (this._nearT || 0) - dt;
      if (!this._near || this._nearT <= 0) {
        this._nearT = 0.5;
        this._near = [];
        this._nearClose = 0;
        // weighted by length x footfall x a distance falloff (half weight at 70 m): the walkers go where a camera
        // at street level sees them instead of evenly over 200 000 m2 of mostly hidden pavement
        this._nearW = [];
        let acc = 0;
        for (const e of this.walkEdges) {
          if (e.dead || e.len < minLen(e) || !e.pts || !e.pts.length) continue;
          const mp = e.pts[e.pts.length >> 1];
          const dm = Math.hypot(mp[0] - px, mp[2] - pz);
          if (dm < SPAWN_R1 + e.len / 2 && dm > SPAWN_R0 - e.len / 2) {
            this._near.push(e);
            if (dm < 80 + e.len / 2) this._nearClose++;
            acc += e.len * (e.busy || 1) / (1 + (dm / 70) ** 2);
            this._nearW.push(acc);
          }
        }
      }
      const pool = this._near.length ? this._near : this.walkEdges;
      const pickW = () => {
        const W = this._nearW, r = Math.random() * W[W.length - 1];
        let lo = 0, hi = W.length - 1;
        while (lo < hi) { const m = (lo + hi) >> 1; if (W[m] < r) lo = m + 1; else hi = m; }
        return this._near[lo];
      };
      // ...and nobody spawns until the camera has loaded pavement of its own within 80 m: a population filled from the
      // first far tiles to arrive never drifts back (no despawn inside 330 m, and the target is already met)
      for (let k = 0; k < (this._nearClose ? 16 : 0); k++) {
        const e = this._near.length ? pickW() : pool[(Math.random() * pool.length) | 0];
        if (!e || e.len < minLen(e) || e.dead) continue;
        const d = e.len * Math.random();
        const s = this.sample(e, d);
        const dist = Math.hypot(s.x - px, s.z - pz);
        if (dist < SPAWN_R0 || dist > SPAWN_R1) continue;
        if (spawnGuard.on && spawnGuard.inView(s.x, s.y + 0.9, s.z, 1.2)) continue;   // recording: never pop into the frame
        if (this.peds.length >= this.cap) break;
        const dir0 = Math.random() < 0.5 ? 1 : -1, lu0 = Math.random(), lat0 = LN25 ? this._laneAt(e, d, dir0, lu0) : this._pickLat(e, dir0);
        if (PY25) {
          const ob0 = e.side || 1, l0 = LN25 ? lat0 : Math.max(-(s.wIn ?? e.wIn ?? 0.6), Math.min(lat0, s.wOut - 0.5));
          if (!this._clearAt(s.x - s.dirz * ob0 * l0, s.z + s.dirx * ob0 * l0, s.y, 0.4)) continue;   // PY25: never born inside a tree guard, a stoop or a person
          if (LN25 && this._inBuilding(s.x - s.dirz * ob0 * l0, s.z + s.dirx * ob0 * l0, s.y)) continue;
        }
        // NYC outerwear palette: mostly dark neutrals, occasional color pop
        const pr = Math.random();
        const c = new THREE.Color();
        if (pr < 0.4) c.setHSL(Math.random(), 0.04 + Math.random() * 0.08, 0.06 + Math.random() * 0.1);       // black/charcoal
        else if (pr < 0.58) c.setHSL(0.6 + Math.random() * 0.08, 0.2 + Math.random() * 0.25, 0.13 + Math.random() * 0.12); // navy
        else if (pr < 0.72) c.setHSL(0.07 + Math.random() * 0.06, 0.25 + Math.random() * 0.2, 0.2 + Math.random() * 0.15); // earth/olive
        else if (pr < 0.86) c.setHSL(Math.random(), 0.03 + Math.random() * 0.05, 0.45 + Math.random() * 0.3);  // gray/white
        else c.setHSL(Math.random(), 0.55 + Math.random() * 0.3, 0.3 + Math.random() * 0.25);                  // color pop
        // outfit bits: coat 45% / hoodie 22% (exclusive-ish), backpack 22%,
        // handbag 16%, phone-walker 15%, umbrella-carrier 35% (opens in rain)
        let mask = 0;
        const o = Math.random();
        if (o < 0.45) mask |= 1; else if (o < 0.67) mask |= 2;
        if (Math.random() < 0.27) mask |= 4;   // PV2: bags and backpacks are fitted scans now; the reference photos carry more of them
        if (Math.random() < 0.34 && !(mask & 4)) mask |= 8;
        if (Math.random() < 0.15) mask |= 16;
        if (Math.random() < 0.35) mask |= 32;
        const ped = {
          e, d, dir: dir0, v: 1.05 + Math.random() * 0.45, lat: lat0,   // + = toward the buildings; the kerb side has tree pits, poles, hydrants
          ...(LN25 ? { lu: lu0 } : {}),
          late: Math.random() < 0.16,
          phase: Math.random() * 10, idx: this.peds.length, skin: Math.random(),
          build: 0.86 + Math.random() * 0.3, amp: 0.85 + Math.random() * 0.3,
          mask, bagTone: Math.random(), umbTone: Math.random(),
          stand: undefined, standFace: undefined, buddy: undefined,
          ...(Math.random() < 0.12 ? { stand: 8 + Math.random() * 40, standFace: [1, 1, -1, 0][(Math.random() * 4) | 0] } : {}),
          latS: undefined, yaw: undefined, waiting: undefined, cross: undefined, pick: undefined, vf: undefined,
          _x: undefined, _y: undefined, _z: undefined, _vx: undefined, _vz: undefined, _latA: undefined, _latV: undefined,
          _vT: undefined, _vTh: undefined, _vBy: undefined, _sq: undefined, _avT: undefined, _bkT: undefined, _kerb: undefined,
          _obsGen: undefined, _pgT: undefined, blockT: undefined, carHold: undefined, carHoldT: undefined, carT: undefined,
          goT: undefined, pkT: undefined, redWait: undefined, waitT: undefined, color: undefined,
        };
        this.peds.push(ped);
        this.mesh.setColorAt(ped.idx, c);
        ped.color = c.clone();
        this.mesh.instanceColor.needsUpdate = true;
        // walk cycle runs in the vertex shader: phase = t*rate + offset
        this.rig.setAnim(ped.idx, ped.phase, ped.v * 4.4, ped.amp, ped.skin);
        this.rig.setStyle(ped.idx, ped.mask, ped.bagTone, ped.umbTone);
        this.mesh.count = this.peds.length;
        // walking pairs: a fifth of spawns bring a companion at matched pace
        if (Math.random() < 0.2 && this.peds.length < this.cap && e.len > 16) {
          const d2 = PY25 ? Math.max(1, Math.min(e.len - 1, d)) : Math.max(1, Math.min(e.len - 1, d + 0.9));
          this.spawnBuddy(e, d2, ped);
        }
      }
    }
    const crossers = [], crossV = [];
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      if (p.manual) continue;   // an API walker under apply_control() or a route: src/api/bridge.js places it
      // ---- mid-crossing: walk the straight crossing line (visibly ON the
      // crosswalk band) instead of teleport-hopping between sidewalk edges
      if (p.cross) {
        const c = p.cross;
        // PY25: a walker on the crossing keeps its spacing too, by a lateral offset (<= 0.9 m) off its crossing line
        const ux = (c.x1 - c.x0) / c.len, uz = (c.z1 - c.z0) / c.len, nx = -uz, nz = ux;
        const off = PY25 ? c.off || 0 : 0;
        // a car in the crossing right ahead: stand (checked 4 times a second); the light gone: hurry
        if (dt > 0 && ((c.chk = (c.chk || 0) - dt) <= 0)) {
          c.chk = PY25 ? 0.2 : 0.25;
          const cx0 = c.x0 + (c.x1 - c.x0) * c.t + nx * off, cz0 = c.z0 + (c.z1 - c.z0) * c.t + nz * off;
          const la = Math.min(1, c.t + 1.6 / c.len);
          c.blocked = c.t < 1 && this._carInPath(cx0, cz0, c.x0 + (c.x1 - c.x0) * la + nx * off, c.z0 + (c.z1 - c.z0) * la + nz * off, true, p.v);
        }
        const hurry = c.ew !== undefined && walkTimeLeft(this.traffic ? this.traffic.time : 0, c.ew) <= 0 ? 1.35 : 1;
        if (PY25) {
          const tt = Math.min(1, c.t);
          if (dt > 0 && ((p._avT = (p._avT ?? 0) - dt) <= 0)) {
            p._avT = 0.1;
            const oR = LN25 && !c.road ? 0.3 : 0.9;
            this._avoid(p, c.x0 + (c.x1 - c.x0) * tt + nx * off, c.y0 + (c.y1 - c.y0) * tt, c.z0 + (c.z1 - c.z0) * tt + nz * off, ux, uz, nx, nz, -oR, oR, 0, off, p.v * hurry * (c.vf ?? 1), 1);
          }
          const oR2 = LN25 && !c.road ? 0.3 : 0.9;
          let offT = Math.max(-oR2, Math.min(oR2, p._latA ?? 0));
          if (LN25 && c.t > 0.7 && c.oLo !== undefined) offT = Math.max(c.oLo, Math.min(c.oHi, offT));
          c.off = off + Math.max(-0.8 * dt, Math.min(0.8 * dt, (offT - off) * Math.min(1, dt * 2.5)));
          // out in the roadway a walker only slows for other walkers (it dodges sideways): standing in a lane for a
          // pedestrian queue at the far kerb would hold the traffic that is waiting for it
          const pv = p._vT ?? 1, vT = c.blocked ? 0 : c.road && c.t > 0.12 && c.t < 0.88 ? Math.min(p._vTh ?? 1, Math.max(0.35, pv)) : pv, vf = c.vf ?? (p.vf ?? 1);
          c.vf = vf + Math.max(-2.5 * dt, Math.min(1.2 * dt, vT - vf));
          c.t += (p.v * hurry * c.vf * dt) / c.len;
        } else if (!c.blocked) c.t += (p.v * hurry * dt) / c.len;
        const offN = PY25 ? c.off : 0;
        const cx = c.x0 + (c.x1 - c.x0) * Math.min(1, c.t) + nx * offN;
        const cz = c.z0 + (c.z1 - c.z0) * Math.min(1, c.t) + nz * offN;
        const cy = c.y0 + (c.y1 - c.y0) * Math.min(1, c.t);
        const walkingC = PY25 ? c.vf > 0.22 : !c.blocked;
        this.rig.setAmp(p.idx, walkingC ? 1 : 0);
        if (PY25 && this.rig.setPace) this.rig.setPace(p.idx, walkingC ? Math.max(0.35, c.vf) : 1);
        crossers.push(cx, cz);
        { const sp = (PY25 ? c.t >= 1 : c.blocked || c.t >= 1) ? 0 : ((p.v * hurry) / c.len) * (PY25 ? c.vf : 1); crossV.push((c.x1 - c.x0) * sp, (c.z1 - c.z0) * sp); }
        this._v.set(cx, cy, cz);
        this._e.set(0, this._turn(p, Math.atan2(c.x1 - c.x0, c.z1 - c.z0), dt), 0);
        this._q.setFromEuler(this._e);
        const bw = p.build || 1;
        this._s.set(bw, 0.92 + ((p.idx * 29) % 10) / 55, bw);
        this._m.compose(this._v, this._q, this._s);
        this.mesh.setMatrixAt(p.idx, this._m);
        if (PY25) this._track(p, cx, cy, cz, dt);
        if (c.t >= 1) {
          p.e = c.e2; p.d = c.d2; p.dir = c.dir2 ?? (Math.random() < 0.5 ? 1 : -1); p.lat = p.latS = c.lat1; p.cross = null;
          if (LN25) p.lu = c.lu ?? Math.random();
          if (PY25) {
            // the lateral offset carries over onto the new sidewalk line (no jump at the kerb)
            const q = this.sample(p.e, p.d), ob2 = p.e.side || 1;
            p.latS = c.lat1 + offN * (nx * -q.dirz * ob2 + nz * q.dirx * ob2);
            p.vf = c.vf; p._latA = undefined;
          }
        }
        continue;
      }
      // standing walkers (PV2): count down, then walk on; a walker now and then stops for a while
      if (p.stand > 0) {
        p.stand -= dt;
        if (PY25 && p._obsGen !== this._obsGen) { p._obsGen = this._obsGen; if (!this._clearAt(p._x, p._z, p._y, 0.25, false)) p.stand = 0; }
      } else if (!p.waiting && Math.random() < dt * 0.003 && (!PY25 || this._clearAt(p._x, p._z, p._y, 0.75, false))) { p.stand = 5 + Math.random() * 25; p.standFace = [1, -1, 0][(Math.random() * 3) | 0]; }
      if (!p.waiting && !(p.stand > 0)) p.d += p.v * (PY25 ? (p.vf ?? 1) : 1) * dt * p.dir;
      // PY25: nobody waits at a kerb for ever (a car that never leaves, a crossing that never opens): after 48 s, the
      // length of a signal cycle and then some, the walker gives up and walks back along its sidewalk
      let gaveUp = false;
      if (PY25 && p.waiting) {
        p.waitT = (p.waitT || 0) + dt;
        if (p.waitT > 48) { p.waitT = 0; p.waiting = false; p.pick = null; p.carHold = false; p.pkT = 0; p.dir = -p.dir; p.lat = this._pickLat(p.e, p.dir, p); gaveUp = true; }
      }
      if (!gaveUp && (p.e.dead || p.d <= 0 || p.d >= p.e.len || p.waiting)) {
        // at a corner: if it's a signalized crossing, wait for the parallel-street green
        const end = this.sample(p.e, p.dir > 0 ? p.e.len : 0);
        let nearSignal = false;
        if (PY25) {
          // cached per edge end (the scan over every signal ran for every waiting walker every frame)
          const sk = p.dir > 0 ? '_sigB' : '_sigA';
          let ns = p.e[sk];
          if (!ns || ns.v !== this._sigVer) {
            // 15 m, not 9: a corner of a divided avenue (Broadway, Lenox, Amsterdam's wide mouths) sits ~13 m from its node,
            // and its walkers crossed against the light (College Walk audit: a walker crossing Broadway into a taxi)
            ns = { v: this._sigVer, near: false };
            for (const [sx, sz] of this.signals) if (Math.abs(sx - end.x) < 15 && Math.abs(sz - end.z) < 15) { ns.near = true; break; }
            p.e[sk] = ns;
          }
          nearSignal = ns.near;
        } else for (const [sx, sz] of this.signals) {
          if (Math.abs(sx - end.x) < 9 && Math.abs(sz - end.z) < 9) { nearSignal = true; break; }
        }
        let walkLeft = Infinity, servesEW;
        if (nearSignal && !p.e.dead) {
          servesEW = Math.abs(end.dirx) > Math.abs(end.dirz);
          walkLeft = walkTimeLeft(this.traffic ? this.traffic.time : 0, servesEW);
          if (walkLeft <= 0) { p.waiting = true; p.d = PY25 ? Math.max(0.05, Math.min(p.e.len - 0.05, p.d)) : Math.max(0.4, Math.min(p.e.len - 0.4, p.d)); if (PY25) { p.redWait = true; p.goT = undefined; } }
          else p.waiting = false;
        }
        if (!p.waiting) {
          // where next from this corner: across the street or around it (the end of another sidewalk edge 5-34 m away),
          // drawn from ALL such ends near the camera. The old 14 random picks out of the whole streamed graph (thousands
          // of edges) usually found none and TELEPORTED the walker to a random edge — a vanishing person in a film take.
          // No candidate (or 1 in 5): turn back along the same sidewalk. Never teleport.
          const here = PY25 ? this.sample(p.e, Math.max(0.05, Math.min(p.e.len - 0.05, p.d))) : this.sample(p.e, Math.max(0.4, Math.min(p.e.len - 0.4, p.d)));
          // a walker held at the kerb (the light, a car) keeps the crossing it chose instead of re-rolling every frame
          let best = p.pick && !p.pick.e2.dead && !p.e.dead ? p.pick : null;
          if (!best && !p.e.dead && Math.random() >= 0.2) {
            const cands = [];
            const list = this._near && this._near.length ? this._near : this.walkEdges;
            for (const e2 of list) {
              if (e2 === p.e || e2.dead || e2.len < minLen(e2) || !e2.pts || e2.pts.length < 2) continue;
              const A = e2.pts[0], Bq = e2.pts[e2.pts.length - 1];
              if ((A[0] - here.x) ** 2 + (A[2] - here.z) ** 2 > 1400 && (Bq[0] - here.x) ** 2 + (Bq[2] - here.z) ** 2 > 1400) continue;
              for (const dd of [1.5, e2.len - 1.5]) {
                const q = this.sample(e2, dd);
                const dist2 = (q.x - here.x) ** 2 + (q.z - here.z) ** 2;
                if (dist2 > 25 && dist2 < 34 * 34 && !((PY25 || p.e.campus || e2.campus) && this._crossBlocked(here, q))) cands.push({ e2, d2: dd, q, dist2 });
              }
            }
            // the NEAREST ends only (2 of them: around the corner, or straight over the crosswalk): a random pick among all
            // ends within 34 m sent walkers diagonally through the junction box, across the traffic (film 7 fTraffic)
            if (cands.length) { cands.sort((x, y) => x.dist2 - y.dist2); best = cands[cands.length > 1 && Math.random() < 0.35 ? 1 : 0]; }
          }
          if (best) {
            // the crossing keeps the walker's line across the pavement at both ends, so a crowd uses the width of the
            // crosswalk rather than one stripe of it
            const dir2 = best.d2 < best.e2.len / 2 ? 1 : -1;
            const lat0 = p.latS ?? p.lat ?? 0;
            const lu1 = Math.random();
            let lat1 = LN25 ? this._laneAt(best.e2, best.e2.len > 12 ? Math.max(6, Math.min(best.e2.len - 6, best.d2)) : best.d2, dir2, lu1) : this._pickLat(best.e2, dir2);
            const at1 = (l) => [best.q.x - best.q.dirz * (best.e2.side || 1) * l, best.q.z + best.q.dirx * (best.e2.side || 1) * l];
            const x0 = here.x - here.dirz * (p.e.side || 1) * lat0, z0 = here.z + here.dirx * (p.e.side || 1) * lat0;
            let [x1, z1] = at1(lat1);
            let len = Math.max(0.5, Math.hypot(x1 - x0, z1 - z0));
            let roadway = len > 9;           // over the street, not round the corner
            if (PY25) {
              // ...or a short hop that is carriageway in the middle (a slip lane, a narrow street): a crossing all the same
              if (!roadway && this.streamer && this.streamer.roadAt && this.streamer.roadAt((x0 + x1) / 2, (z0 + z1) / 2, 0.2) === true) roadway = true;
              // A crossing ALONG the sidewalk line (over the cross street) lands in the painted crosswalk only while its line
              // stays within ~2.3 m of the kerb-side walk line: the first parked car of the cross street stands just past
              // the crosswalk's far edge, and a walker crossing on the building line walked through its bumper.
              if (roadway && Math.abs(((x1 - x0) * best.q.dirx + (z1 - z0) * best.q.dirz) / len) > 0.7) {
                const cap = best.e2.narrow ? 2.9 : 2.3;
                if (lat1 > cap) { lat1 = cap; [x1, z1] = at1(lat1); len = Math.max(0.5, Math.hypot(x1 - x0, z1 - z0)); }
              }
              // and never through a parked car: a nearer line at the far end, else wait here and edge toward the kerb
              if (roadway && this._lineHitsParked(x0, z0, x1, z1, 0.45)) {
                let ok = false;
                for (const l of [Math.min(lat1, 1.2), 0.3, -0.3]) {
                  const [xa, za] = at1(l);
                  if (!this._lineHitsParked(x0, z0, xa, za, 0.45)) { lat1 = l; x1 = xa; z1 = za; len = Math.max(0.5, Math.hypot(x1 - x0, z1 - z0)); ok = true; break; }
                }
                if (!ok) {
                  p.pkT = (p.pkT || 0) + dt;
                  p.lat = Math.min(p.lat ?? 0, 0.2);
                  // it cannot get a clear line from here: walk back along this sidewalk instead
                  if (p.pkT > 4) { p.pkT = 0; p.pick = null; best = null; }
                  else { p.waiting = true; p.pick = best; }
                }
              }
            }
            // no stepping off into a crossing that cannot be finished before the cross traffic gets its green (the
            // amber and all-red add 5 s; a late starter goes on less and hurries), nor in front of a car
            if (best) {
            // PY25: a crossing longer than one WALK can cover (the Lenox and Broadway double carriageways at 1.05 m/s) is
            // started while the WALK is fresh, then hurried: the old rule held those walkers at the kerb for ever
            const need = PY25 ? Math.min(len / p.v, 14) : len / p.v;
            let hold = (PY25 && p.waiting && p.pick === best && p.pkT > 0) || (roadway && walkLeft !== Infinity && walkLeft + 5 < (p.late ? 0.45 : 1) * need);
            // PY25: a walker who stood through the red reacts to the WALK after its own 0.2-1.5 s (dt = 0 frames hold)
            if (PY25 && !hold && roadway && p.redWait && walkLeft !== Infinity) {
              if (p.goT === undefined) p.goT = 0.2 + Math.random() * 1.3;
              p.goT -= dt;
              if (p.goT > 0) hold = true;
            }
            if (!hold && roadway) {
              // the cars (PY25: asked 5 times a second while the walker waits, not every frame)
              if (!PY25 || p.pick !== best || (p.carT = (p.carT || 0) - dt) <= 0) { p.carT = 0.2; p.carHold = this._carInPath(x0, z0, x1, z1, false, p.v); }
              if (p.carHold) hold = true;
              // PY25: held by a car for 6 s (a car standing across the crossing may be waiting for this walker, who stands
              // in its corridor on the corner): walk back along the sidewalk instead of freezing the pair
              if (PY25) { p.carHoldT = p.carHold ? (p.carHoldT || 0) + dt : 0; if (p.carHoldT > 6) { p.carHoldT = 0; p.carHold = false; hold = false; best = null; } }
            }
            if (!best) { /* gave up on this crossing (PY25 car hold) */ }
            else if (hold) { p.waiting = true; p.pick = best; p.d = PY25 ? Math.max(0.05, Math.min(p.e.len - 0.05, p.d)) : Math.max(0.4, Math.min(p.e.len - 0.4, p.d)); }
            else {
              p.pick = null;
              p.cross = {
                x0, y0: here.y, z0, x1, y1: best.q.y, z1, lat1, ew: roadway ? servesEW : undefined, road: roadway,
                len, t: 0, e2: best.e2, d2: best.d2, lu: lu1, oLo: undefined, oHi: undefined, off: undefined, vf: undefined, chk: undefined, blocked: undefined, ...(LN25 ? this._crossOffRange(best.e2, best.e2.len > 12 ? Math.max(6, Math.min(best.e2.len - 6, best.d2)) : best.d2, lat1, x1 - x0, z1 - z0, len) : {}),
                // after the crossing, walk INTO the new block (a random direction sent half of them straight back to the corner)
                dir2,
              };
              p.pkT = 0; p.waitT = 0; p.redWait = false; p.goT = undefined;
            }
            }
          }
          if (!best) { if (PY25) { p.waiting = false; p.pick = null; p.waitT = 0; p.redWait = false; p.goT = undefined; } p.dir = -p.dir; p.d = PY25 ? Math.max(0.05, Math.min(p.e.len - 0.05, p.d)) : Math.max(0.5, Math.min(p.e.len - 0.5, p.d)); p.lat = this._pickLat(p.e, p.dir, p); }
        }
      }
      const s = this.sample(p.e, p.d);
      const dist = Math.hypot(s.x - px, s.z - pz);
      if (dist > DESPAWN_R && !p.api) { this._remove(i); continue; }
      // the line across the pavement eases in (a walker drifts over, never jumps) and is held inside the free width
      // measured here, so a narrowing (a stoop run, a shed, a newsstand) squeezes them toward the kerb side
      const ob = (p.e.side || 1);
      let latT = Math.min(p.lat || 0, Math.max(-(p.e.wIn ?? 0.6), s.wOut - 0.5));
      let moving = !(p.waiting || p.stand > 0);
      if (LN25 && dt > 0 && moving && ((p._bkT = (p._bkT ?? (p.idx % 7) * 0.06) - dt) <= 0)) {
        p._bkT = 0.4;
        const la = p.latS ?? 0, dA = p.d + p.dir * 1.2;
        if (dA > 0 && dA < p.e.len) {
          const q = this.sample(p.e, dA);
          if (this._inBuilding(q.x - q.dirz * ob * la, q.z + q.dirx * ob * la, q.y)) { p.dir = -p.dir; p.lat = this._pickLat(p.e, p.dir, p); p._latA = undefined; }
        }
      }
      if (PY25) {
        // PY25: ... and around the people and the street furniture ahead (_avoid, 10 times a second)
        let lo, hi, want;
        if (LN25) {
          const B = this._band(p.e, s, p.d);
          lo = B.pLo; hi = B.pHi;
          if (p.lu === undefined) p.lu = Math.random();
          if ((p.d < 6 || p.e.len - p.d < 6) && p.e.len > 12) {
            const sR = this.sample(p.e, p.d < 6 ? 6 : p.e.len - 6), hR = Math.max(lo, sR.wOut - 0.5);
            if (hi > hR) { hi = hR; if (B.hi > hR) B.hi = Math.max(B.lo, hR); }
          }
          want = Math.max(lo, Math.min(hi, this._laneLine(B, p.e, p.dir, p.lu)));
          // held at the corner for a line clear of the parked cars: edge toward the kerb (as p.lat did)
          if (p.pkT > 0) want = Math.max(lo, Math.min(want, 0.2));
          // for traffic.js's car-side pass: only a walker near the kerb (or at a corner, waiting, on a campus walkway or a
          // footway) can be in a car's corridor
          p._kerb = !!p.waiting || (p.dir > 0 ? p.e.len - p.d : p.d) < 4 || (p.latS ?? want) < B.pLo + 1.0 || !!p.e.campus || p.e.kind === 'path';
        } else {
          lo = -(s.wIn ?? p.e.wIn ?? 0.6); hi = Math.max(lo, s.wOut - 0.5);
          want = Math.max(lo, Math.min(hi, p.lat || 0));
        }
        // THE FUNNEL: over the last 7 m to a corner the wanted line eases in toward the crosswalk band (a crossing starts
        // where the walker is, and one started on the building line walks past the crosswalk into the first parked car)
        if (!p.e.campus && p.e.kind !== 'path') {
          const toEnd = p.dir > 0 ? p.e.len - p.d : p.d;
          if (toEnd < 7) want = Math.max(lo, Math.min(want, (p.e.narrow ? 2.9 : 2.3) + Math.max(0, toEnd - 2) * 0.9));
        }
        const cur = p.latS ?? want;
        if (dt > 0 && ((p._avT = (p._avT ?? (p.idx % 5) * 0.02) - dt) <= 0)) {
          p._avT = 0.1;
          const fx = s.dirx * p.dir, fz = s.dirz * p.dir, nx = -s.dirz * ob, nz = s.dirx * ob;
          this._avoid(p, s.x + nx * cur, s.y, s.z + nz * cur, fx, fz, nx, nz, lo, hi, want, cur, p.v * (p.vf ?? 1), ob * p.dir > 0 ? 1 : -1, moving);
          // waiting at the kerb or standing: shuffle aside for someone (onto a free line within 0.5 m), never wander off
          if (!moving && (p._latA === undefined || Math.abs(p._latA - want) > 0.5 || p._sq)) p._latA = cur;
        }
        latT = p._latA !== undefined ? Math.max(lo, Math.min(hi, p._latA)) : want;
        p.latS = p.latS === undefined ? latT : cur + Math.max(-0.8 * dt, Math.min(0.8 * dt, (latT - cur) * Math.min(1, dt * 2.5)));
        p._latV = dt > 0 ? (p.latS - cur) / dt : p._latV || 0;   // sidestep speed, for the facing below
        const vT = moving ? (p._vT ?? 1) : 0, vf = p.vf ?? 1;
        p.vf = vf + Math.max(-2.5 * dt, Math.min(1.2 * dt, vT - vf));
        // stuck on a pavement too tight to pass (face to face, or someone in the only gap): after 3-5 s the walker gives
        // way and turns back. Not behind a standing row (a kerb queue waits for the light) nor for a car.
        if (!moving || !(p.vf < 0.1) || p._vBy === 4 || p._vBy === 3 || p._vBy < 0) p.blockT = 0;
        else if ((p.blockT = (p.blockT || 0) + dt) > (p._vBy === 5 ? 6 : 3) + (p.idx % 4) * 0.7) { p.blockT = 0; p.dir = -p.dir; p.lat = this._pickLat(p.e, p.dir, p); p._latA = undefined; }
        moving = moving && p.vf > 0.22;
        if (this.rig.setPace) this.rig.setPace(p.idx, moving ? Math.max(0.35, p.vf) : 1);
      } else p.latS = p.latS === undefined ? latT : p.latS + (latT - p.latS) * Math.min(1, dt * 0.9);
      this.rig.setAmp(p.idx, moving ? 1 : 0);
      const lat = p.latS;
      this._v.set(s.x - s.dirz * ob * lat, s.y, s.z + s.dirx * ob * lat);
      const face = p.stand > 0 ? p.standFace || 0 : 0;
      // PY25: a walker sidestepping round someone turns into the step (the lateral speed blended into the heading while it walks)
      const fwd = PY25 && moving ? p.v * (p.vf ?? 1) : 1, side = PY25 && moving ? p._latV || 0 : 0;
      this._e.set(0, this._turn(p, face ? Math.atan2(-s.dirz * ob * face, s.dirx * ob * face) : Math.atan2(s.dirx * p.dir * fwd - s.dirz * ob * side, s.dirz * p.dir * fwd + s.dirx * ob * side), dt), 0);
      this._q.setFromEuler(this._e);
      const bw = p.build || 1;
      this._s.set(bw, 0.92 + ((p.idx * 29) % 10) / 55, bw);
      this._m.compose(this._v, this._q, this._s);
      this.mesh.setMatrixAt(p.idx, this._m);
      if (PY25) this._track(p, this._v.x, this._v.y, this._v.z, dt);
    }
    if (this.traffic) { this.traffic._crossers = crossers; this.traffic._crossV = crossV; if (PY25) this.traffic._walkerHash = this._wh; this.traffic._walkerKerb = LN25; }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.rig.update?.(dt);
  }
  // ---- PY25 WALKER SPACING. Every walker used to walk its own line as if alone in the city: people passed through each
  // other, stood inside each other at the kerb and walked through tree guards, hydrants, poles and stoops. Now each one
  // looks ahead along its way (the other walkers from a 2 m hash of last frame's positions; the street furniture from
  // the instancer as oriented footprint boxes in 4 m cells) and takes the free line across the pavement nearest the one
  // it wants, passing oncoming people on its right; with no free line it slows behind the one ahead or waits (a queue
  // at the kerb). Lines change at <= 0.8 m/s, speed eases: nobody jumps.
  _hashWalkers() {
    const H = this._wh || (this._wh = new Map());
    if (((this._whN = (this._whN || 0) + 1) & 255) === 0) H.clear();   // drop the cells nobody walks any more
    else for (const L of H.values()) L.length = 0;
    for (const p of this.peds) {
      if (p._x === undefined) continue;
      const k = (Math.floor(p._x / WH) + 32768) * 65536 + (Math.floor(p._z / WH) + 32768);
      let L = H.get(k);
      if (!L) H.set(k, (L = []));
      L.push(p);
    }
  }
  // the kerb-side kit a walker can walk into, as oriented boxes of its footprint below head height
  _obsBuild(px, pz) {
    const I = this.streamer && this.streamer.ctx && this.streamer.ctx.instancer;
    const G = this._obsG || (this._obsG = new Map());
    G.clear();
    const L = (this._obsL = []);
    this._obsAt = [px, pz];
    this._obsAddCampus(G, L, px, pz);
    if (!I || !I.pools) return;
    const foot = this._obsFoot || (this._obsFoot = new Map());
    for (const [name, pool] of I.pools) {
      if (!OBS_POOL.test(name) || !pool.top || !pool.alive || !pool.mats || !pool.geo) continue;
      let F = foot.get(pool.geo);
      if (F === undefined) { F = footBoxes(pool.geo, name); foot.set(pool.geo, F); }
      if (!F) continue;
      const m = pool.mats;
      for (let s = 0; s < pool.top; s++) {
        if (!pool.alive[s]) continue;
        const o = s * 16;
        const X = m[o + 12], Z = m[o + 14];
        if ((X - px) * (X - px) + (Z - pz) * (Z - pz) > OBS_R * OBS_R) continue;
        const sx = Math.hypot(m[o], m[o + 1], m[o + 2]), sy = Math.hypot(m[o + 4], m[o + 5], m[o + 6]), sz = Math.hypot(m[o + 8], m[o + 9], m[o + 10]);
        if (sx < 0.02 || sy < 0.02 || sz < 0.02) continue;
        for (const f of F) {
          const lcx = (f.x0 + f.x1) / 2, lcz = (f.z0 + f.z1) / 2;
          const b = {
            x: m[o] * lcx + m[o + 8] * lcz + X, z: m[o + 2] * lcx + m[o + 10] * lcz + Z,
            ux: m[o] / sx, uz: m[o + 2] / sx, vx: m[o + 8] / sz, vz: m[o + 10] / sz,
            hx: ((f.x1 - f.x0) / 2) * sx, hz: ((f.z1 - f.z0) / 2) * sz, y0: m[o + 13] + f.y0 * sy, y1: m[o + 13] + f.y1 * sy, n: name,
          };
          const r = Math.hypot(b.hx, b.hz);
          const i = L.length;
          L.push(b);
          for (let gx = Math.floor((b.x - r) / OBS_C); gx <= Math.floor((b.x + r) / OBS_C); gx++)
            for (let gz = Math.floor((b.z - r) / OBS_C); gz <= Math.floor((b.z + r) / OBS_C); gz++) {
              const k = (gx + 32768) * 65536 + (gz + 32768);
              let A = G.get(k);
              if (!A) G.set(k, (A = []));
              A.push(i);
            }
        }
      }
    }
  }
  // the parked fleet as the LOD rebucket renders it (traffic.js _rebucketParked: record order, <= cap per kind), as boxes
  // in 4 m cells: no walker brushes a parked car and no crossing is laid through one
  _parkBuild() {
    const T = this.traffic;
    const G = this._pkG || (this._pkG = new Map());
    G.clear();
    const L = (this._pkL = []);
    if (!T || !T.parkedRecs || !T.parked) return;
    const tot = {};
    for (const recs of T.parkedRecs.values()) for (const rec of recs) {
      const P = T.parked[rec.kind];
      if (!P) continue;
      tot[rec.kind] = (tot[rec.kind] || 0) + 1;
      if (tot[rec.kind] > P.cap) continue;
      const dm = T.vehDims && T.vehDims[rec.kind], m = rec.m;
      const b = { x: m[12], z: m[14], ux: m[0], uz: m[2], vx: m[8], vz: m[10], hx: dm ? dm[0] / 2 : 0.97, hz: dm ? dm[2] / 2 : 2.35, y0: m[13], y1: m[13] + 1.4 };
      const r = Math.hypot(b.hx, b.hz) + 0.6, i = L.length;
      L.push(b);
      for (let gx = Math.floor((b.x - r) / OBS_C); gx <= Math.floor((b.x + r) / OBS_C); gx++)
        for (let gz = Math.floor((b.z - r) / OBS_C); gz <= Math.floor((b.z + r) / OBS_C); gz++) {
          const k = (gx + 32768) * 65536 + (gz + 32768);
          let A = G.get(k);
          if (!A) G.set(k, (A = []));
          A.push(i);
        }
    }
  }
  // PY25: is there room for a body at (x, z)? No furniture box or parked car within r, and (walkers) nobody within 0.7 m.
  // Spawns and the random stops use it: a walker used to be born inside a tree guard or stop to stand in a stoop.
  _clearAt(x, z, y, r, walkers = true) {
    if (x === undefined || !isFinite(x)) return true;
    for (let src = 0; src < 2; src++) {
      const G = src ? this._pkG : this._obsG, OL = src ? this._pkL : this._obsL;
      if (!G || !OL || !OL.length) continue;
      for (let gx = Math.floor((x - r) / OBS_C); gx <= Math.floor((x + r) / OBS_C); gx++)
        for (let gz = Math.floor((z - r) / OBS_C); gz <= Math.floor((z + r) / OBS_C); gz++) {
          const A = G.get((gx + 32768) * 65536 + (gz + 32768));
          if (!A) continue;
          for (const i of A) {
            const b = OL[i];
            if (b.y1 < y + 0.05 || b.y0 > y + 1.75) continue;
            const dx = x - b.x, dz = z - b.z, a = dx * b.ux + dz * b.uz, c = dx * b.vx + dz * b.vz;
            if (Math.hypot(Math.max(Math.abs(a) - b.hx, 0), Math.max(Math.abs(c) - b.hz, 0)) < r) return false;
          }
        }
    }
    if (walkers && this._wh) {
      for (let gx = Math.floor((x - 0.7) / WH); gx <= Math.floor((x + 0.7) / WH); gx++)
        for (let gz = Math.floor((z - 0.7) / WH); gz <= Math.floor((z + 0.7) / WH); gz++) {
          const A = this._wh.get((gx + 32768) * 65536 + (gz + 32768));
          if (A) for (const q of A) if (q._x !== undefined && (q._x - x) ** 2 + (q._z - z) ** 2 < 0.49) return false;
        }
    }
    return true;
  }
  // distance from (x, z) to the nearest parked car body within reach (1e9: none)
  _parkedDist(x, z) {
    const G = this._pkG, L = this._pkL;
    if (!G || !L || !L.length) return 1e9;
    const A = G.get((Math.floor(x / OBS_C) + 32768) * 65536 + (Math.floor(z / OBS_C) + 32768));
    if (!A) return 1e9;
    let best = 1e9;
    for (const i of A) {
      const b = L[i], dx = x - b.x, dz = z - b.z;
      const a = dx * b.ux + dz * b.uz, c = dx * b.vx + dz * b.vz;
      const d = Math.hypot(Math.max(Math.abs(a) - b.hx, 0), Math.max(Math.abs(c) - b.hz, 0));
      if (d < best) best = d;
    }
    return best;
  }
  // does the straight walk a -> b pass within `clr` of a parked car?
  _lineHitsParked(ax, az, bx, bz, clr) {
    if (!this._pkL || !this._pkL.length) return false;
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 0.4));
    for (let i = 0; i <= n; i++) if (this._parkedDist(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n) < clr) return true;
    return false;
  }
  // the campus kit's solids (lamps, benches, bins, low walls, plinths: collider prisms, not instancer pools) as oriented
  // boxes in the same grid: box-like prisms only (OBB area < 2.5 x the polygon's), the big irregular ones cut the walkways
  _obsAddCampus(G, L, px, pz) {
    const reg = COLLIDERS.byTile.get('campus');
    if (!reg) return;
    for (const pr of reg) {
      if (pr.deck || !pr.pts || pr.pts.length < 6) continue;
      const q = pr.pts, n = q.length / 2;
      const cx0 = (pr.minX + pr.maxX) / 2, cz0 = (pr.minZ + pr.maxZ) / 2;
      if ((cx0 - px) * (cx0 - px) + (cz0 - pz) * (cz0 - pz) > OBS_R * OBS_R) continue;
      let area = 0, bl = 0, ux = 1, uz = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        area += q[j * 2] * q[i * 2 + 1] - q[i * 2] * q[j * 2 + 1];
        const ex = q[i * 2] - q[j * 2], ez = q[i * 2 + 1] - q[j * 2 + 1], el = Math.hypot(ex, ez);
        if (el > bl) { bl = el; ux = ex / el; uz = ez / el; }
      }
      area = Math.abs(area) / 2;
      let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
      for (let i = 0; i < n; i++) {
        const a = q[i * 2] * ux + q[i * 2 + 1] * uz, b = -q[i * 2] * uz + q[i * 2 + 1] * ux;
        if (a < a0) a0 = a; if (a > a1) a1 = a; if (b < b0) b0 = b; if (b > b1) b1 = b;
      }
      const hx = (a1 - a0) / 2, hz = (b1 - b0) / 2;
      if (hx * hz * 4 > Math.max(area, 0.05) * 2.5) continue;   // not box-like
      const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2;
      const b = { x: ca * ux - cb * uz, z: ca * uz + cb * ux, ux, uz, vx: -uz, vz: ux, hx, hz, y0: pr.y0, y1: pr.y1, n: 'campus' };
      const r = Math.hypot(hx, hz), i = L.length;
      L.push(b);
      for (let gx = Math.floor((b.x - r) / OBS_C); gx <= Math.floor((b.x + r) / OBS_C); gx++)
        for (let gz = Math.floor((b.z - r) / OBS_C); gz <= Math.floor((b.z + r) / OBS_C); gz++) {
          const k = (gx + 32768) * 65536 + (gz + 32768);
          let A = G.get(k);
          if (!A) G.set(k, (A = []));
          A.push(i);
        }
    }
  }
  // Pick the line across the way (lat, in the walker's own frame: + = toward nx, nz) and the speed factor for walker
  // p at (x, z) heading (fx, fz). `lo`..`hi` is the free width, `want` the line it would like, `cur` the line it is on.
  // Blocked intervals come from the walkers ahead (their line +-0.62 m: two bodies and a hand's breadth) and the
  // furniture ahead (its footprint +-0.3 m); each counts only if it is reached within ~2.5 s. Result in p._latA, p._vT.
  _avoid(p, x, y, z, fx, fz, nx, nz, lo, hi, want, cur, speed, rs, sticky = false) {
    const iv = this._iv || (this._iv = []);
    iv.length = 0;
    // an interval wholly outside the lateral range cannot block any line the walker may take (nor the one it is on)
    const Lmin = Math.min(lo, cur) - 0.05, Lmax = Math.max(hi, cur) + 0.05;
    // rs: +1 when +lat is this walker's right
    const LA = 3.2;
    // walkers ahead
    const H = this._wh;
    if (H) {
      const c0 = Math.floor((x - LA) / WH), c1 = Math.floor((x + LA) / WH), r0 = Math.floor((z - LA) / WH), r1 = Math.floor((z + LA) / WH);
      for (let gx = c0; gx <= c1; gx++) for (let gz = r0; gz <= r1; gz++) {
        const A = H.get((gx + 32768) * 65536 + (gz + 32768));
        if (!A) continue;
        for (const q of A) {
          if (q === p || q._x === undefined) continue;
          const rx = q._x - x, rz = q._z - z;
          const a0 = rx * fx + rz * fz, b = rx * nx + rz * nz;
          // exactly level (a companion spawned on its lead): the lower index counts as ahead, so exactly one of them waits
          const a = a0 !== 0 ? a0 : (q.idx ?? 0) < (p.idx ?? 0) ? -1e-4 : 1e-4;
          if (a < -0.35 || a > LA || b > 1.9 || b < -1.9 || Math.abs((q._y ?? y) - y) > 1.2) continue;
          if (cur + b + 0.62 < Lmin || cur + b - 0.62 > Lmax) continue;
          const qa = (q._vx || 0) * fx + (q._vz || 0) * fz;          // its speed along my way
          const close = speed - qa;                                    // closing speed
          // someone ahead WALKING my way no slower than me: not in my way (unless I am on top of them). Two people standing
          // still close at 0 too, and are in each other's way (the old test skipped them: stop-go jitter in a queue)
          if (a > 0.5 && qa > 0.2 && close < 0.1) continue;
          const t = a <= 0.45 ? 0 : (a - 0.45) / Math.max(0.15, close);
          if (t > 2.6) continue;
          // 1 oncoming: walking at me, or standing facing me (two people stopped face to face are still oncoming);
          // 4 standing (a kerb row, someone stopped): queued behind, never squeezed past; 0 going my way
          const still = Math.abs(qa) < 0.2 && (q._vx || 0) ** 2 + (q._vz || 0) ** 2 < 0.04;
          const facing = still && q.yaw !== undefined && Math.sin(q.yaw) * fx + Math.cos(q.yaw) * fz < -0.5;
          // (5: someone stopped for a while, not at a kerb: queued behind too, but given way to after 6 s)
          iv.push(cur + b - 0.62, cur + b + 0.62, a, qa, qa < -0.25 || facing ? 1 : still ? (q.stand > 0 && !q.waiting ? 5 : 4) : 0);
        }
      }
    }
    // furniture and parked cars ahead
    for (let src = 0; src < 2; src++) {
      const G = src ? this._pkG : this._obsG, OL = src ? this._pkL : this._obsL;
      if (!G || !OL || !OL.length) continue;
      const c0 = Math.floor((x - LA) / OBS_C), c1 = Math.floor((x + LA) / OBS_C), r0 = Math.floor((z - LA) / OBS_C), r1 = Math.floor((z + LA) / OBS_C);
      let ST = src ? this._pkSt : this._obSt;
      if (!ST || ST.length < OL.length) { ST = new Uint32Array(OL.length + 256); if (src) this._pkSt = ST; else this._obSt = ST; }
      const tg = (this._stTag = ((this._stTag || 0) + 1) >>> 0) || (this._stTag = 1);
      for (let gx = c0; gx <= c1; gx++) for (let gz = r0; gz <= r1; gz++) {
        const A = G.get((gx + 32768) * 65536 + (gz + 32768));
        if (!A) continue;
        for (const i of A) {
          if (ST[i] === tg) continue;
          ST[i] = tg;
          const b = OL[i];
          if (b.y1 < y + 0.05 || b.y0 > y + 1.75) continue;
          // the box's corners in the walker's frame (world corners cached per box)
          let amin = 1e9, amax = -1e9, bmin = 1e9, bmax = -1e9;
          const C = b._c || (b._c = boxCorners(b));
          for (let k = 0; k < 4; k++) {
            const X = C[k * 2] - x, Z = C[k * 2 + 1] - z;
            const a = X * fx + Z * fz, bb = X * nx + Z * nz;
            if (a < amin) amin = a; if (a > amax) amax = a; if (bb < bmin) bmin = bb; if (bb > bmax) bmax = bb;
          }
          if (amax < -0.3 || amin > LA || cur + bmax + 0.3 < Lmin || cur + bmin - 0.3 > Lmax) continue;
          iv.push(cur + bmin - 0.3, cur + bmax + 0.3, Math.max(0, amin), 0, 2);
        }
      }
    }
    // standing cars (a queue over the crosswalk, a car pinned at the junction mouth): hard obstacles, gone round or
    // waited for, never squeezed past
    const T = this.traffic;
    if (T && T.carsNear && T.carHalf) T.carsNear(x, z, LA + 3, (c) => {
      const q = c._pose;
      if (!q || (c.v || 0) > 0.5 || Math.abs(q[1] - y) > 1.5) return;
      const [hw, hl] = T.carHalf(c), cy = Math.cos(q[3]), sy = Math.sin(q[3]);
      let amin = 1e9, amax = -1e9, bmin = 1e9, bmax = -1e9;
      for (let k = 0; k < 4; k++) {
        const lx = k & 1 ? hw : -hw, lz = k & 2 ? hl : -hl;
        const X = q[0] + lx * cy + lz * sy - x, Z = q[2] - lx * sy + lz * cy - z;
        const a = X * fx + Z * fz, bb = X * nx + Z * nz;
        if (a < amin) amin = a; if (a > amax) amax = a; if (bb < bmin) bmin = bb; if (bb > bmax) bmax = bb;
      }
      if (amax < -0.3 || amin > LA || cur + bmax + 0.35 < Lmin || cur + bmin - 0.35 > Lmax) return;
      iv.push(cur + bmin - 0.35, cur + bmax + 0.35, Math.max(0, amin), 0, 3);
    });
    // nobody and nothing near: look again in 0.2 s instead of 0.1 (most of the crowd, most of the time)
    if (!iv.length) { p._latA = want; p._vT = 1; p._vTh = 1; p._sq = false; p._avT = Math.max(p._avT || 0, 0.2); return; }
    // the free line nearest the wanted one (oncoming people passed on my right)
    const blockedAt = (l) => {
      for (let k = 0; k < iv.length; k += 5) if (l > iv[k] && l < iv[k + 1]) return true;
      return false;
    };
    let best = null, bc = 1e9;
    const tryL = (l) => {
      if (l < lo - 1e-6 || l > hi + 1e-6 || blockedAt(l)) return;
      let c = Math.abs(l - want) * 0.6 + Math.abs(l - cur);
      for (let k = 0; k < iv.length; k += 5) if (iv[k + 4] === 1) { const mid = (iv[k] + iv[k + 1]) / 2; if ((l - mid) * rs < 0) c += 0.5; }
      if (c < bc) { bc = c; best = l; }
    };
    tryL(want); tryL(cur); tryL(lo); tryL(hi);
    for (let k = 0; k < iv.length; k += 5) { tryL(iv[k] - 0.01); tryL(iv[k + 1] + 0.01); }
    if (best === null) {
      // a tight pavement (tree guards facing a stoop run): people WALKING pass each other shoulder to shoulder, 0.5 m
      // apart centre to centre, rather than one of them walking into the ironwork (a standing row is queued behind)
      for (let k = 0; k < iv.length; k += 5) if (iv[k + 4] <= 1) { const m = (iv[k] + iv[k + 1]) / 2; iv[k] = m - 0.5; iv[k + 1] = m + 0.5; }
      tryL(want); tryL(cur); tryL(lo); tryL(hi);
      for (let k = 0; k < iv.length; k += 5) { tryL(iv[k] - 0.01); tryL(iv[k + 1] + 0.01); }
    }
    if (best === null) {
      // ...and between two fixed things (a tree guard facing a stoop rail) a walker threads the gap with just its body's
      // clearance (0.26 m either side instead of 0.3): half a metre of free paving is room for one person
      for (let k = 0; k < iv.length; k += 5) if (iv[k + 4] === 2) { iv[k] += 0.04; iv[k + 1] -= 0.04; }
      tryL(want); tryL(cur); tryL(lo); tryL(hi);
      for (let k = 0; k < iv.length; k += 5) { tryL(iv[k] - 0.005); tryL(iv[k + 1] + 0.005); if (iv[k + 4] === 2) for (let q = k + 5; q < iv.length; q += 5) if (iv[q + 4] === 2) tryL((iv[k + 1] + iv[q]) / 2), tryL((iv[q + 1] + iv[k]) / 2); }
    }
    let squeeze = false;
    if (best === null) {
      // no free line. Fixed things (a stoop run facing the tree guards) leave the least-bad line, walked at pace; people
      // in the way are still waited for (below)
      const pen = (l) => { let o = 0; for (let k = 0; k < iv.length; k += 5) if (l > iv[k] && l < iv[k + 1]) o += Math.min(l - iv[k], iv[k + 1] - l) * (iv[k + 4] === 2 ? 1 : iv[k + 4] === 3 ? 8 : 4); return o; };
      let bo = 1e9;
      const cand = [want, cur, lo, hi];
      for (let k = 0; k < iv.length; k += 5) cand.push(iv[k] - 0.01, iv[k + 1] + 0.01);
      for (const l of cand) { if (l < lo - 1e-6 || l > hi + 1e-6) continue; const o = pen(l) + Math.abs(l - cur) * 0.05; if (o < bo) { bo = o; best = l; } }
      if (best === null) best = cur;
      squeeze = true;
    }
    // speed: what is in the way of the line I am on NOW (the line eases over, the feet must wait for it); vTh = the part
    // of it that is fixed things and cars (a walker mid-road never slows below 0.35 for PEOPLE, it does stop for a car)
    let vT = 1, vTh = 1, vBy = -1;
    for (let k = 0; k < iv.length; k += 5) {
      if (cur <= iv[k] || cur >= iv[k + 1]) continue;
      if (squeeze && iv[k + 4] === 2) continue;   // no way round a fixed thing: do not stand in front of it for ever
      const a = iv[k + 2], qa = iv[k + 3];
      // a fixed thing or a standing car already ALONGSIDE (not ahead): stopping does not help, the sidestep does
      if (a < 0.35 && (iv[k + 4] === 2 || iv[k + 4] === 3)) continue;
      // someone level with me or behind: walking on is what separates us, the one behind waits (two walkers on top of
      // each other used to both stop for the other, for good)
      if (a <= 0 && iv[k + 4] !== 2 && iv[k + 4] !== 3) continue;
      // how long the move out of this interval takes at 0.8 m/s (toward the chosen line, if that lies outside it; a squeeze
      // that stays inside never gets out), against how long until I reach it
      const edgeL = best >= iv[k + 1] ? iv[k + 1] : best <= iv[k] ? iv[k] : null;
      const out = edgeL === null ? 9 : Math.abs(edgeL - cur) / 0.8;
      const reach = Math.max(0, a - 0.5) / Math.max(0.3, speed);
      if (out <= reach) continue;
      // follow a walker going my way; stop for one coming at me, standing, or a fixed thing, 0.5-0.6 m short
      const f = qa > 0.2
        ? (a < 0.6 ? 0 : a < 1.2 ? Math.min(1, qa / Math.max(0.3, p.v)) : 1)
        : Math.max(0, Math.min(1, (a - 0.6) / 1.2));
      if (f < vT || (f === vT && f < 1 && iv[k + 4] !== 2)) { vT = f; vBy = iv[k + 4]; }
      if (iv[k + 4] >= 2 && f < vTh) vTh = f;
    }
    p._latA = best;
    p._vT = vT; p._vTh = vTh; p._vBy = vBy; p._sq = squeeze;
    // a fixed thing on the wanted line: the new line becomes the wanted one (no drifting back into the next stoop)
    if (sticky && !LN25 && best !== want) for (let k = 0; k < iv.length; k += 5) if (iv[k + 4] === 2 && want > iv[k] && want < iv[k + 1] && iv[k + 2] < 2.2) { p.lat = best; break; }
  }
  // yaw toward the wanted heading at <= 300 deg/s (film 7 review: turn-backs, stops and crossing starts snapped 90-180 deg
  // in one frame). A new walker takes its heading at once; dt = 0 frames hold.
  _turn(p, want, dt) {
    if (p.yaw === undefined) return (p.yaw = want);
    let d = want - p.yaw;
    d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
    const m = 5.2 * dt;
    p.yaw += Math.abs(d) <= m ? d : Math.sign(d) * m;
    return p.yaw;
  }
  // PY25: where a walker is and how it moves, for the next update's neighbour hash (dt = 0 frames keep the velocity)
  _track(p, x, y, z, dt) {
    if (p._x !== undefined && dt > 0) {
      const k = Math.min(1, dt * 8);
      p._vx = (p._vx || 0) + ((x - p._x) / dt - (p._vx || 0)) * k;
      p._vz = (p._vz || 0) + ((z - p._z) / dt - (p._vz || 0)) * k;
    } else if (p._x === undefined) { p._vx = 0; p._vz = 0; }
    p._x = x; p._y = y; p._z = z;
  }
  // Every walker gone; the next updates repopulate around the camera from the walk graph as it is NOW. The recorder
  // and the perception exporter call it (window.__PEDS_RESET) once the world has settled, before their warm-up.
  reset() {
    while (this.peds.length) this._remove(this.peds.length - 1);
    this._near = null; this._nearT = 0;
    if (this.traffic) { this.traffic._crossers = []; this.traffic._crossV = []; }
    if (this._wh) this._wh.clear();
  }
  _remove(i) {
    const last = this.peds.length - 1;
    const p = this.peds[i];
    if (i !== last) {
      const lp = this.peds[last];
      lp.idx = p.idx;
      this.peds[i] = lp;
      this.mesh.setColorAt(lp.idx, lp.color);
      this.mesh.instanceColor.needsUpdate = true;
      this.rig.setAnim(lp.idx, lp.phase, lp.v * 4.4, lp.amp || 1, lp.skin);
      this.rig.setStyle(lp.idx, lp.mask || 0, lp.bagTone || 0, lp.umbTone || 0);
    }
    this.peds.pop();
    this.mesh.count = this.peds.length;
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    this.mesh.setMatrixAt(this.peds.length, m);
  }
}
