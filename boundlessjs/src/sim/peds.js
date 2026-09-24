// Pedestrians: instanced walkers on sidewalk offsets of the real street graph.
// They wait at signalized corners and cross when their parallel street has green.
import * as THREE from 'three';
import { signalState, walkTimeLeft } from './signals.js';
import { applySnowCap } from '../world/materials.js';
import { buildPedMesh } from './pedmesh.js';
import { spawnGuard } from './spawnGuard.js';
import { COLLIDERS } from '../city/colliders.js';

const PED_NEAR = typeof location !== 'undefined' && new URLSearchParams(location.search).has('pednear');
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
      const sigs = (data.nodes || []).filter((n) => n.signal).map((n) => [n.x, n.z]);
      this.tileSignals.set(key, sigs);
      this.signals.push(...sigs);
    }, (key) => {
      const list = this.tileEdges.get(key) || [];
      for (const e of list) { e.dead = true; const i = this.walkEdges.indexOf(e); if (i >= 0) this.walkEdges.splice(i, 1); }
      this.tileEdges.delete(key);
      this._nearT = 0;
      const sigs = this.tileSignals.get(key) || [];
      for (const s of sigs) { const i = this.signals.indexOf(s); if (i >= 0) this.signals.splice(i, 1); }
      this.tileSignals.delete(key);
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
  // a straight corner crossing between two campus walkways must not run through a kit obstacle either (sampled every metre)
  _crossBlocked(a, b) {
    const L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (this._campusBlocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, a.y + (b.y - a.y) * t)) return true;
    }
    return false;
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
      const e = { pts, cum, len: cum[cum.length - 1], side: 1, busy: w.busy, campus: true };
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
          samples.push([x, yt, z, onRoad || (!w.promenade && this._campusBlocked(x, z, yt))]);
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
    const wOut = new Float32Array(kept.length);
    for (let i = 0; i < kept.length; i++) {
      if (kind === 'path') { wOut[i] = 0.7; continue; }
      if (!info) { wOut[i] = 2.2; continue; }
      const A = kept[Math.max(0, i - 1)], B = kept[Math.min(kept.length - 1, i + 1)];
      const dx = B[0] - A[0], dz = B[2] - A[2], L = Math.hypot(dx, dz) || 1;
      const nx = (-dz / L) * side, nz = (dx / L) * side;
      let w = 0, known = false;
      for (let k = 1; k <= 8; k++) {
        const q = info(kept[i][0] + nx * k * 0.75, kept[i][2] + nz * k * 0.75);
        if (k === 1 && q === null) break;
        known = true;
        if (!walkable(q)) break;
        w = k * 0.75;
      }
      wOut[i] = known ? w : 2.2;
    }
    const sorted = Array.from(wOut).sort((x, y) => x - y);
    const cum = [0];
    for (let i = 1; i < kept.length; i++) cum.push(cum[i - 1] + Math.hypot(kept[i][0] - kept[i - 1][0], kept[i][2] - kept[i - 1][2]));
    return {
      pts: kept, cum, len: cum[cum.length - 1], side, wOut,
      wOutMed: sorted[Math.floor(sorted.length * 0.4)],
      wIn: kind === 'path' ? 0.7 : kind === 'narrow' ? 0.05 : 0.65,
    };
  }
  // WHERE ACROSS THE PAVEMENT a walker walks: anywhere from the tree-pit line to half a metre off the buildings, biased
  // to the walker's own right (New Yorkers keep right, loosely: the two halves overlap in the middle)
  _pickLat(e, dir) {
    if (e.narrow) return -0.1 + Math.random() * 0.25;
    const lo = -(e.wIn ?? 0.6), hi = Math.max(lo + 0.3, (e.wOutMed ?? 2.2) - 0.55);
    const right = (e.side || 1) * (dir || 1) > 0;          // +lat (toward the buildings) is on the walker's right
    const u = Math.random();
    const t = right ? 0.25 + 0.75 * Math.sqrt(u) : 0.75 * (1 - Math.sqrt(1 - u));
    return lo + t * (hi - lo);
  }
  // a car on (or about to roll across) the crossing segment a -> b ([x, z] each)
  _carInPath(ax, az, bx, bz) {
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
    const c = new THREE.Color().copy(lead.color).offsetHSL((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.15);
    let mask = 0;
    const o = Math.random();
    if (o < 0.45) mask |= 1; else if (o < 0.67) mask |= 2;
    if (Math.random() < 0.25) mask |= 4;
    if (Math.random() < 0.15) mask |= 16;
    if (Math.random() < 0.35) mask |= 32;
    const ped = {
      // on a narrow sidewalk the companion walks BEHIND (0.9 m), not beside: beside is a stoop or a tree pit
      e, d: e.narrow ? Math.max(0, Math.min(e.len, d - (lead.dir || 1) * 0.9)) : d, dir: lead.dir, v: lead.v, phase: Math.random() * 10, idx: this.peds.length,
      // side by side, on whichever side of the lead has the room
      lat: e.narrow ? (lead.lat || 0) : (lead.lat || 0) + ((lead.lat || 0) > ((e.wOutMed ?? 2.2) - 0.55 - (e.wIn ?? 0.6)) / 2 ? -0.62 : 0.62),
      skin: Math.random(), build: 0.86 + Math.random() * 0.3, amp: lead.amp,
      mask, bagTone: Math.random(), umbTone: Math.random(),
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
    let i = 1;
    while (i < e.cum.length - 1 && e.cum[i] < d) i++;
    const t = (d - e.cum[i - 1]) / Math.max(0.001, e.cum[i] - e.cum[i - 1]);
    const A = e.pts[i - 1], B = e.pts[i];
    const dx = B[0] - A[0], dz = B[2] - A[2];
    const L = Math.hypot(dx, dz) || 1;
    const wo = e.wOut ? e.wOut[i - 1] + (e.wOut[i] - e.wOut[i - 1]) * t : 2.2;
    return { x: A[0] + dx * t, y: A[1] + (B[1] - A[1]) * t, z: A[2] + dz * t, dirx: dx / L, dirz: dz / L, wOut: wo };
  }
  update(dt, px, pz, playerVel) {
    if (this._campusTodo && ((this._campusF = (this._campusF || 0) + 1) % 20) === 0) this._buildCampus();
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
        const dir0 = Math.random() < 0.5 ? 1 : -1;
        const ped = {
          e, d, dir: dir0, v: 1.05 + Math.random() * 0.45, lat: this._pickLat(e, dir0),   // + = toward the buildings; the kerb side has tree pits, poles, hydrants
          late: Math.random() < 0.16,
          phase: Math.random() * 10, idx: this.peds.length, skin: Math.random(),
          build: 0.86 + Math.random() * 0.3, amp: 0.85 + Math.random() * 0.3,
          mask, bagTone: Math.random(), umbTone: Math.random(),
          ...(Math.random() < 0.12 ? { stand: 8 + Math.random() * 40, standFace: [1, 1, -1, 0][(Math.random() * 4) | 0] } : {}),
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
          const d2 = Math.max(1, Math.min(e.len - 1, d + 0.9));
          this.spawnBuddy(e, d2, ped);
        }
      }
    }
    const crossers = [];
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      if (p.manual) continue;   // an API walker under apply_control() or a route: src/api/bridge.js places it
      // ---- mid-crossing: walk the straight crossing line (visibly ON the
      // crosswalk band) instead of teleport-hopping between sidewalk edges
      if (p.cross) {
        const c = p.cross;
        // a car in the crossing right ahead: stand (checked 4 times a second); the light gone: hurry
        if (dt > 0 && ((c.chk = (c.chk || 0) - dt) <= 0)) {
          c.chk = 0.25;
          const cx0 = c.x0 + (c.x1 - c.x0) * c.t, cz0 = c.z0 + (c.z1 - c.z0) * c.t;
          const la = Math.min(1, c.t + 1.6 / c.len);
          c.blocked = this._carInPath(cx0, cz0, c.x0 + (c.x1 - c.x0) * la, c.z0 + (c.z1 - c.z0) * la);
        }
        const hurry = c.ew !== undefined && walkTimeLeft(this.traffic ? this.traffic.time : 0, c.ew) <= 0 ? 1.35 : 1;
        if (!c.blocked) c.t += (p.v * hurry * dt) / c.len;
        const cx = c.x0 + (c.x1 - c.x0) * Math.min(1, c.t);
        const cz = c.z0 + (c.z1 - c.z0) * Math.min(1, c.t);
        const cy = c.y0 + (c.y1 - c.y0) * Math.min(1, c.t);
        this.rig.setAmp(p.idx, c.blocked ? 0 : 1);
        crossers.push(cx, cz);
        this._v.set(cx, cy, cz);
        this._e.set(0, this._turn(p, Math.atan2(c.x1 - c.x0, c.z1 - c.z0), dt), 0);
        this._q.setFromEuler(this._e);
        const bw = p.build || 1;
        this._s.set(bw, 0.92 + ((p.idx * 29) % 10) / 55, bw);
        this._m.compose(this._v, this._q, this._s);
        this.mesh.setMatrixAt(p.idx, this._m);
        if (c.t >= 1) { p.e = c.e2; p.d = c.d2; p.dir = c.dir2 ?? (Math.random() < 0.5 ? 1 : -1); p.lat = p.latS = c.lat1; p.cross = null; }
        continue;
      }
      // standing walkers (PV2): count down, then walk on; a walker now and then stops for a while
      if (p.stand > 0) p.stand -= dt;
      else if (!p.waiting && Math.random() < dt * 0.003) { p.stand = 5 + Math.random() * 25; p.standFace = [1, -1, 0][(Math.random() * 3) | 0]; }
      if (!p.waiting && !(p.stand > 0)) p.d += p.v * dt * p.dir;
      if (p.e.dead || p.d <= 0 || p.d >= p.e.len || p.waiting) {
        // at a corner: if it's a signalized crossing, wait for the parallel-street green
        const end = this.sample(p.e, p.dir > 0 ? p.e.len : 0);
        let nearSignal = false;
        for (const [sx, sz] of this.signals) {
          if (Math.abs(sx - end.x) < 9 && Math.abs(sz - end.z) < 9) { nearSignal = true; break; }
        }
        let walkLeft = Infinity, servesEW;
        if (nearSignal && !p.e.dead) {
          servesEW = Math.abs(end.dirx) > Math.abs(end.dirz);
          walkLeft = walkTimeLeft(this.traffic ? this.traffic.time : 0, servesEW);
          if (walkLeft <= 0) { p.waiting = true; p.d = Math.max(0.4, Math.min(p.e.len - 0.4, p.d)); }
          else p.waiting = false;
        }
        if (!p.waiting) {
          // where next from this corner: across the street or around it (the end of another sidewalk edge 5-34 m away),
          // drawn from ALL such ends near the camera. The old 14 random picks out of the whole streamed graph (thousands
          // of edges) usually found none and TELEPORTED the walker to a random edge — a vanishing person in a film take.
          // No candidate (or 1 in 5): turn back along the same sidewalk. Never teleport.
          const here = this.sample(p.e, Math.max(0.4, Math.min(p.e.len - 0.4, p.d)));
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
                if (dist2 > 25 && dist2 < 34 * 34 && !((p.e.campus || e2.campus) && this._crossBlocked(here, q))) cands.push({ e2, d2: dd, q, dist2 });
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
            const lat0 = p.latS ?? p.lat ?? 0, lat1 = this._pickLat(best.e2, dir2);
            const x0 = here.x - here.dirz * (p.e.side || 1) * lat0, z0 = here.z + here.dirx * (p.e.side || 1) * lat0;
            const x1 = best.q.x - best.q.dirz * (best.e2.side || 1) * lat1, z1 = best.q.z + best.q.dirx * (best.e2.side || 1) * lat1;
            const len = Math.max(0.5, Math.hypot(x1 - x0, z1 - z0));
            const roadway = len > 9;           // over the street, not round the corner
            // no stepping off into a crossing that cannot be finished before the cross traffic gets its green (the
            // amber and all-red add 5 s; a late starter goes on less and hurries), nor in front of a car
            let hold = roadway && walkLeft !== Infinity && walkLeft + 5 < (p.late ? 0.45 : 1) * (len / p.v);
            if (!hold && roadway && this._carInPath(x0, z0, x1, z1)) hold = true;
            if (hold) { p.waiting = true; p.pick = best; p.d = Math.max(0.4, Math.min(p.e.len - 0.4, p.d)); }
            else {
              p.pick = null;
              p.cross = {
                x0, y0: here.y, z0, x1, y1: best.q.y, z1, lat1, ew: roadway ? servesEW : undefined,
                len, t: 0, e2: best.e2, d2: best.d2,
                // after the crossing, walk INTO the new block (a random direction sent half of them straight back to the corner)
                dir2,
              };
            }
          } else { p.dir = -p.dir; p.d = Math.max(0.5, Math.min(p.e.len - 0.5, p.d)); p.lat = this._pickLat(p.e, p.dir); }
        }
      }
      const s = this.sample(p.e, p.d);
      const dist = Math.hypot(s.x - px, s.z - pz);
      if (dist > DESPAWN_R && !p.api) { this._remove(i); continue; }
      this.rig.setAmp(p.idx, p.waiting || p.stand > 0 ? 0 : 1);
      // the line across the pavement eases in (a walker drifts over, never jumps) and is held inside the free width
      // measured here, so a narrowing (a stoop run, a shed, a newsstand) squeezes them toward the kerb side
      const ob = (p.e.side || 1);
      const latT = Math.min(p.lat || 0, Math.max(-(p.e.wIn ?? 0.6), s.wOut - 0.5));
      p.latS = p.latS === undefined ? latT : p.latS + (latT - p.latS) * Math.min(1, dt * 0.9);
      const lat = p.latS;
      this._v.set(s.x - s.dirz * ob * lat, s.y, s.z + s.dirx * ob * lat);
      const face = p.stand > 0 ? p.standFace || 0 : 0;
      this._e.set(0, this._turn(p, face ? Math.atan2(-s.dirz * ob * face, s.dirx * ob * face) : Math.atan2(s.dirx * p.dir, s.dirz * p.dir), dt), 0);
      this._q.setFromEuler(this._e);
      const bw = p.build || 1;
      this._s.set(bw, 0.92 + ((p.idx * 29) % 10) / 55, bw);
      this._m.compose(this._v, this._q, this._s);
      this.mesh.setMatrixAt(p.idx, this._m);
    }
    if (this.traffic) this.traffic._crossers = crossers;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.rig.update?.(dt);
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
  // Every walker gone; the next updates repopulate around the camera from the walk graph as it is NOW. The recorder
  // and the perception exporter call it (window.__PEDS_RESET) once the world has settled, before their warm-up.
  reset() {
    while (this.peds.length) this._remove(this.peds.length - 1);
    this._near = null; this._nearT = 0;
    if (this.traffic) this.traffic._crossers = [];
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
