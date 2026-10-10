// Map-data auditor: scans compiled tiles for street-level geometry defects.
//   node tools/audit.mjs                 -> full-city audit, report to shots/audit_report.json
//   node tools/audit.mjs --tile 23_1     -> single tile (fast iteration)
//   node tools/audit.mjs --svg x,z [r]   -> top-down SVG of geometry around a world point
// Checks:
//   holes      : bare-terrain samples inside the paved zone around intersections
//   paint      : crosswalk/stop-line paint not resting on asphalt (spills on sidewalk/dirt)
//   swOverRoad : sidewalk geometry overlapping the carriageway (corner arcs cutting in)
//   nearMiss   : road endpoints 2-4.5m apart that snapped to different nodes (split junctions)
//   tee        : road endpoints landing mid-span of another road without a shared node
//   doors      : buildings with a street-facing wall but no qualifying shader door on any of them
//   nan/degen  : NaN or zero-area triangles in any ground section
import fs from 'node:fs';
import { parseTile, buildingsOf, roadsOf } from '../src/world/tiledata.js';

const TILE = 512;
const args = process.argv.slice(2);
const argOf = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const oneTile = argOf('--tile');
const svgAt = argOf('--svg');
const doorsOnly = args.includes('--doors'); // skip geometry coverage checks (fast)

// ---------------------------------------------------------------- tile IO (LRU cache)
const cache = new Map();
function loadTile(tx, tz) {
  const k = `${tx}_${tz}`;
  if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
  const f = `public/tiles/t_${k}.bin`;
  let t = null;
  if (fs.existsSync(f)) {
    const buf = fs.readFileSync(f);
    t = parseTile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  cache.set(k, t);
  if (cache.size > 16) cache.delete(cache.keys().next().value);
  return t;
}

// ---------------------------------------------------------------- 2D triangle index
const GROUND = ['asphalt', 'sidewalk', 'curb', 'paintW', 'paintY', 'paintG', 'grass', 'path', 'brick'];
class TriIndex {
  constructor(cell = 4) { this.cell = cell; this.map = new Map(); this.tris = []; }
  key(x, z) { return `${Math.floor(x / this.cell)}_${Math.floor(z / this.cell)}`; }
  addSection(arr, ox, oz, sec) {
    for (let i = 0; i + 8 < arr.length; i += 9) {
      const ax = arr[i] + ox, az = arr[i + 2] + oz;
      const bx = arr[i + 3] + ox, bz = arr[i + 5] + oz;
      const cx = arr[i + 6] + ox, cz = arr[i + 8] + oz;
      const id = this.tris.length;
      this.tris.push([ax, az, bx, bz, cx, cz, sec, arr[i + 1] + arr[i + 4] + arr[i + 7]]);
      const x0 = Math.min(ax, bx, cx), x1 = Math.max(ax, bx, cx);
      const z0 = Math.min(az, bz, cz), z1 = Math.max(az, bz, cz);
      if (x1 - x0 > 200 || z1 - z0 > 200) continue; // skip degenerate-huge (indexed cost)
      for (let gx = Math.floor(x0 / this.cell); gx <= Math.floor(x1 / this.cell); gx++)
        for (let gz = Math.floor(z0 / this.cell); gz <= Math.floor(z1 / this.cell); gz++) {
          const k = `${gx}_${gz}`;
          let a = this.map.get(k); if (!a) this.map.set(k, (a = []));
          a.push(id);
        }
    }
  }
  // returns Set of section names covering point
  cover(x, z, out = new Set()) {
    const a = this.map.get(this.key(x, z));
    if (!a) return out;
    for (const id of a) {
      const t = this.tris[id];
      if (ptInTri(x, z, t)) out.add(t[6]);
    }
    return out;
  }
}
function ptInTri(px, pz, t) {
  const [ax, az, bx, bz, cx, cz] = t;
  const d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz);
  const d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz);
  const d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
function distToSeg(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz;
  const t = L2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / L2)) : 0;
  return Math.hypot(px - (x1 + dx * t), pz - (z1 + dz * t));
}

// Build an index covering a 3x3 tile neighborhood
function buildIndex(tx, tz) {
  const idx = new TriIndex();
  const rings = []; // building footprints for exclusion
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const t = loadTile(tx + dx, tz + dz);
    if (!t) continue;
    const [ox, oz] = t.header.origin;
    for (const sec of GROUND) if (t.S[sec] && t.S[sec].length) idx.addSection(t.S[sec], ox, oz, sec);
    for (const b of buildingsOf(t)) {
      const ring = [];
      for (let i = 0; i < b.len; i++) ring.push([t.S.bldgXZ[(b.start + i) * 2] + ox, t.S.bldgXZ[(b.start + i) * 2 + 1] + oz]);
      rings.push(ring);
    }
  }
  return { idx, rings };
}
function inAnyRing(x, z, rings) {
  for (const ring of rings) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], zi = ring[i][1], xj = ring[j][0], zj = ring[j][1];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

// Reconstruct road stubs at a node from the tile's road polylines
function stubsAt(nx, nz, roadsArr) {
  const stubs = [];
  for (const r of roadsArr) {
    for (const end of [0, 1]) {
      const p = end === 0 ? r.pts[0] : r.pts[r.pts.length - 1];
      const q = end === 0 ? r.pts[1] : r.pts[r.pts.length - 2];
      if (!q) continue;
      if (Math.hypot(p[0] - nx, p[1] - nz) > 2.2) continue;
      const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1;
      stubs.push({ dirx: dx / L, dirz: dz / L, width: r.width, rclass: r.rclass });
    }
  }
  return stubs;
}
// Collect world-space road polylines from 3x3 neighborhood
function roadsAround(tx, tz) {
  const out = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const t = loadTile(tx + dx, tz + dz);
    if (!t || !t.S.roadVerts) continue;
    const [ox, oz] = t.header.origin;
    for (const r of roadsOf(t)) {
      const pts = [];
      for (let i = 0; i < r.len; i++) pts.push([t.S.roadVerts[(r.start + i) * 3] + ox, t.S.roadVerts[(r.start + i) * 3 + 2] + oz, t.S.roadVerts[(r.start + i) * 3 + 1]]);
      out.push({ pts, width: r.width, rclass: r.rclass, level: r.level, segId: r.segId });
    }
  }
  return out;
}

// ---------------------------------------------------------------- SVG debug renderer
if (svgAt) {
  const [wx, wz] = svgAt.split(',').map(Number);
  const R = Number(args[args.indexOf('--svg') + 2]) || 40;
  const tx = Math.floor(wx / TILE), tz = Math.floor(wz / TILE);
  const { idx } = buildIndex(tx, tz);
  const COL = { asphalt: '#3a3a3f', sidewalk: '#9b968c', curb: '#c8c2b4', paintW: '#eeeeee', paintY: '#e6c435', paintG: '#3f9d4e', grass: '#5c8a44', path: '#8b8578', brick: '#a05f45' };
  const ORDER = ['grass', 'path', 'brick', 'asphalt', 'sidewalk', 'curb', 'paintG', 'paintY', 'paintW'];
  const S = 1000 / (2 * R);
  const X = (x) => ((x - wx + R) * S).toFixed(1), Z = (z) => ((z - wz + R) * S).toFixed(1);
  let body = '';
  for (const sec of ORDER) {
    for (const t of idx.tris) {
      if (t[6] !== sec) continue;
      if (Math.max(Math.abs(t[0] - wx), Math.abs(t[2] - wx), Math.abs(t[4] - wx)) > R + 20) continue;
      if (Math.max(Math.abs(t[1] - wz), Math.abs(t[3] - wz), Math.abs(t[5] - wz)) > R + 20) continue;
      body += `<polygon points="${X(t[0])},${Z(t[1])} ${X(t[2])},${Z(t[3])} ${X(t[4])},${Z(t[5])}" fill="${COL[sec]}" fill-opacity="0.85" stroke="${COL[sec]}" stroke-width="0.3"/>\n`;
    }
  }
  for (const r of roadsAround(tx, tz)) {
    const pts = r.pts.filter((p) => Math.abs(p[0] - wx) < R + 30 && Math.abs(p[1] - wz) < R + 30);
    if (pts.length > 1) body += `<polyline points="${pts.map((p) => `${X(p[0])},${Z(p[1])}`).join(' ')}" fill="none" stroke="#ff5555" stroke-width="1.5" stroke-dasharray="6 4"/>\n`;
  }
  body += `<circle cx="500" cy="500" r="4" fill="#ff2222"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000"><rect width="1000" height="1000" fill="#6b5d4f"/>\n${body}</svg>`;
  const out = `shots/audit_${Math.round(wx)}_${Math.round(wz)}.svg`;
  fs.writeFileSync(out, svg);
  console.log('wrote', out, `(${R}m radius; dirt-brown background = bare terrain)`);
  process.exit(0);
}

// ---------------------------------------------------------------- full audit
const manifest = JSON.parse(fs.readFileSync('public/tiles/manifest.json', 'utf8'));
let tileKeys = (manifest.tiles || manifest).map ? (manifest.tiles || manifest).map((t) => (typeof t === 'string' ? t : `${t.tx}_${t.tz}`)) : Object.keys(manifest.tiles || manifest);
tileKeys = tileKeys.filter((k) => /^-?\d+_-?\d+$/.test(k));
if (oneTile) tileKeys = [oneTile];

const rep = {
  holes: [], paint: [], swOverRoad: [], nearMiss: [], tee: [], doors: [],
  counts: { nodes: 0, holeSamples: 0, samples: 0, paintTris: 0, paintBad: 0, buildings: 0, doorless: 0, frontless: 0, nan: 0, degen: 0 },
};
const t0 = Date.now();
let done = 0;
for (const key of tileKeys) {
  const [tx, tz] = key.split('_').map(Number);
  const tile = loadTile(tx, tz);
  if (!tile) continue;
  const [ox, oz] = tile.header.origin;

  // --- NaN / degenerate scan (this tile only)
  for (const sec of GROUND) {
    const a = tile.S[sec];
    if (!a) continue;
    const vertical = sec === 'curb'; // curb faces are vertical: zero XZ area is correct there
    for (let i = 0; i + 8 < a.length; i += 9) {
      let bad = false;
      for (let j = 0; j < 9; j++) if (!Number.isFinite(a[i + j])) { bad = true; break; }
      if (bad) { rep.counts.nan++; continue; }
      if (vertical) continue;
      const area = Math.abs((a[i + 3] - a[i]) * (a[i + 8] - a[i + 2]) - (a[i + 6] - a[i]) * (a[i + 5] - a[i + 2]));
      if (area < 1e-8) rep.counts.degen++;
    }
  }

  const nodes = doorsOnly ? [] : (tile.header.nodes || []);
  const needsGeo = nodes.length > 0;
  const geo = needsGeo ? buildIndex(tx, tz) : null;
  const roadsN = needsGeo ? roadsAround(tx, tz) : null;

  // --- intersection hole + paint + sidewalk-over-road checks
  for (const [lx, lz, sig] of nodes) {
    const nx = ox + lx, nz = oz + lz;
    const stubs = stubsAt(nx, nz, roadsN);
    if (!stubs.length) continue;
    rep.counts.nodes++;
    const R = Math.max(...stubs.map((s) => s.width / 2), 4) + 0.4;
    // paved zone samples: polar grid out to R+6.5
    let holes = 0, samples = 0, holePts = [];
    for (let rr = 1.5; rr <= R + 6.5; rr += 0.9) {
      const na = Math.max(10, Math.round((2 * Math.PI * rr) / 1.1));
      for (let ai = 0; ai < na; ai++) {
        const a = (ai / na) * Math.PI * 2;
        const px = nx + Math.cos(a) * rr, pz = nz + Math.sin(a) * rr;
        // inside paved intent? within a stub ribbon+sidewalk OR within R+5.6 ring (corner band zone)
        let intent = rr <= R + 5.6;
        if (!intent) continue;
        if (inAnyRing(px, pz, geo.rings)) continue; // building owns this ground
        samples++;
        const cov = geo.idx.cover(px, pz);
        if (cov.size === 0) { holes++; if (holePts.length < 4) holePts.push([+px.toFixed(1), +pz.toFixed(1)]); }
      }
    }
    rep.counts.samples += samples;
    rep.counts.holeSamples += holes;
    const holeArea = holes * 0.9 * 1.1; // ~sample cell area
    if (holeArea > 8) rep.holes.push({ x: +nx.toFixed(1), z: +nz.toFixed(1), m2: +holeArea.toFixed(1), sig, at: holePts });

    // paint containment near this node (crosswalk zone)
    let pBad = 0, pTot = 0, pBadPt = null;
    const near = geo.idx.map.get ? null : null;
    for (const t of geo.idx.tris) {
      if (t[6] !== 'paintW') continue;
      const cx3 = (t[0] + t[2] + t[4]) / 3, cz3 = (t[1] + t[3] + t[5]) / 3;
      if (Math.hypot(cx3 - nx, cz3 - nz) > R + 6) continue;
      pTot++;
      const cov = geo.idx.cover(cx3, cz3);
      if (!cov.has('asphalt')) { pBad++; if (!pBadPt) pBadPt = [+cx3.toFixed(1), +cz3.toFixed(1)]; }
    }
    rep.counts.paintTris += pTot; rep.counts.paintBad += pBad;
    if (pBad > 4) rep.paint.push({ x: +nx.toFixed(1), z: +nz.toFixed(1), bad: pBad, of: pTot, at: pBadPt });

  }

  // RULE: pavement never overlaps a carriageway — whole-tile scan, not just
  // near nodes (dead-end wraps and gore bands violated it mid-block too)
  if (needsGeo) {
    let sBad = 0, sPt = null;
    for (const t of geo.idx.tris) {
      if (t[6] !== 'sidewalk') continue;
      const cx3 = (t[0] + t[2] + t[4]) / 3, cz3 = (t[1] + t[3] + t[5]) / 3;
      if (cx3 < ox || cx3 >= ox + TILE || cz3 < oz || cz3 >= oz + TILE) continue; // this tile only
      const triY = t[7] / 3;
      for (const r of roadsN) {
        if (r.rclass >= 5 || r.level > 0) continue;
        let hit = false;
        for (let i = 1; i < r.pts.length; i++) {
          const dd = distToSeg(cx3, cz3, r.pts[i - 1][0], r.pts[i - 1][1], r.pts[i][0], r.pts[i][1]);
          // threshold: the compiler's write filter guarantees nothing >=0.55m
          // inside the TRUE carriageway; roadVerts here are 8-20m chords that
          // cut curves by up to ~1.5m, so only deeper hits are real defects
          if (dd < r.width / 2 - 2.2) {
            // height gate: sidewalks passing UNDER a lifted ramp span are fine
            const segY = ((r.pts[i - 1][2] ?? 0) + (r.pts[i][2] ?? 0)) / 2;
            if (Math.abs(triY - segY) < 1.6) { hit = true; break; }
          }
        }
        if (hit) { sBad++; if (!sPt) sPt = [+cx3.toFixed(1), +cz3.toFixed(1)]; break; }
      }
    }
    rep.counts.swBadTris = (rep.counts.swBadTris || 0) + sBad;
    if (sBad > 3) rep.swOverRoad.push({ tile: `${tx}_${tz}`, tris: sBad, x: sPt ? sPt[0] : 0, z: sPt ? sPt[1] : 0 });
  }

  // --- near-miss + T-junction endpoint checks (this tile's roads vs neighborhood)
  if (needsGeo && !doorsOnly) {
    const ends = [];
    for (const r of roadsN) {
      if (r.rclass >= 5 || r.level > 0) continue;
      for (const end of [0, 1]) {
        const p = end === 0 ? r.pts[0] : r.pts[r.pts.length - 1];
        if (p[0] < ox - 2 || p[0] >= ox + TILE + 2 || p[1] < oz - 2 || p[1] >= oz + TILE + 2) continue;
        ends.push({ p, segId: r.segId, r });
      }
    }
    for (let a = 0; a < ends.length; a++) {
      for (let b = a + 1; b < ends.length; b++) {
        if (ends[a].segId === ends[b].segId) continue;
        const d = Math.hypot(ends[a].p[0] - ends[b].p[0], ends[a].p[1] - ends[b].p[1]);
        if (d > 2.0 && d < 4.5) rep.nearMiss.push({ x: +ends[a].p[0].toFixed(1), z: +ends[a].p[1].toFixed(1), d: +d.toFixed(2) });
      }
      // T: endpoint near another road's mid-span
      const e = ends[a];
      for (const r of roadsN) {
        if (r.segId === e.segId || r.rclass >= 5 || r.level > 0) continue;
        const dEnd = Math.min(Math.hypot(e.p[0] - r.pts[0][0], e.p[1] - r.pts[0][1]), Math.hypot(e.p[0] - r.pts[r.pts.length - 1][0], e.p[1] - r.pts[r.pts.length - 1][1]));
        if (dEnd < 6) continue;
        for (let i = 1; i < r.pts.length; i++) {
          const dd = distToSeg(e.p[0], e.p[1], r.pts[i - 1][0], r.pts[i - 1][1], r.pts[i][0], r.pts[i][1]);
          if (dd < r.width / 2 - 1.5) { rep.tee.push({ x: +e.p[0].toFixed(1), z: +e.p[1].toFixed(1), d: +dd.toFixed(2) }); i = 1e9; }
        }
      }
    }
  }

  // --- door audit: street-facing walls with no qualifying shader door
  {
    const roadsHere = needsGeo ? roadsN : roadsAround(tx, tz);
    for (const b of buildingsOf(tile)) {
      if (b.landmarkId > 0) continue;
      rep.counts.buildings++;
      const glass = b.style === 3 || b.style === 11;
      const store = (b.flags & 8) !== 0;
      const ring = [];
      for (let i = 0; i < b.len; i++) ring.push([tile.S.bldgXZ[(b.start + i) * 2] + ox, tile.S.bldgXZ[(b.start + i) * 2 + 1] + oz]);
      let hasFront = false, hasDoorOnFront = false;
      for (let i = 0; i < b.len; i++) {
        const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % b.len];
        const len = Math.hypot(x2 - x1, z2 - z1);
        if (len < 3.5 || ((b.blind >> i) & 1)) continue;
        const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
        // front test: near + parallel to a road
        let front = false;
        for (const r of roadsHere) {
          if (r.rclass >= 5 || r.level > 0) continue;
          for (let j = 1; j < r.pts.length; j++) {
            const dd = distToSeg(mx, mz, r.pts[j - 1][0], r.pts[j - 1][1], r.pts[j][0], r.pts[j][1]);
            if (dd < r.width / 2 + 9) {
              const rdx = r.pts[j][0] - r.pts[j - 1][0], rdz = r.pts[j][1] - r.pts[j - 1][1];
              const rl = Math.hypot(rdx, rdz) || 1;
              const par = Math.abs((rdx * (x2 - x1) + rdz * (z2 - z1)) / (rl * len));
              if (par > 0.8) { front = true; j = 1e9; }
            }
          }
          if (front) break;
        }
        if (!front) continue;
        hasFront = true;
        // shader door gates: bayN>=1 && !store && len>5.5 (glass towers now get
        // a lobby entrance; storefront glazing implies the retail entrance)
        const bayN = Math.floor((len - 0.44) / (b.winW || 3));
        if (bayN >= 1 && !store && len > 3.6) hasDoorOnFront = true;
      }
      // new-format tiles carry the compiler's chosen front edge — flag buildings
      // that have street frontage but no serialized frontIdx (door falls back
      // to the longest wall, which may face away from the street)
      if (hasFront && (b.frontIdx == null || b.frontIdx < 0)) rep.counts.noFrontIdx = (rep.counts.noFrontIdx || 0) + 1;
      if (!hasFront) rep.counts.frontless++;
      else if (!hasDoorOnFront) {
        rep.counts.doorless++;
        if (rep.doors.length < 400) {
          let cx3 = 0, cz3 = 0;
          for (const [x, z] of ring) { cx3 += x; cz3 += z; }
          rep.doors.push({ x: +(cx3 / b.len).toFixed(1), z: +(cz3 / b.len).toFixed(1), style: b.style, store: store ? 1 : 0, glass: glass ? 1 : 0, len: b.len });
        }
      }
    }
  }

  done++;
  if (done % 250 === 0) console.log(`  ${done}/${tileKeys.length} tiles, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

// rank + summarize
rep.holes.sort((a, b) => b.m2 - a.m2);
rep.paint.sort((a, b) => b.bad - a.bad);
rep.swOverRoad.sort((a, b) => b.tris - a.tris);
const c = rep.counts;
console.log('\n================ AUDIT SUMMARY ================');
console.log(`tiles: ${done}  intersections: ${c.nodes}`);
console.log(`HOLES  bare-terrain inside paved zone: ${c.holeSamples}/${c.samples} samples (${((100 * c.holeSamples) / Math.max(1, c.samples)).toFixed(1)}%), ${rep.holes.length} nodes over 8 m2`);
console.log(`PAINT  crosswalk/stripe tris not on asphalt: ${c.paintBad}/${c.paintTris} (${((100 * c.paintBad) / Math.max(1, c.paintTris)).toFixed(1)}%), ${rep.paint.length} bad nodes`);
console.log(`SIDEWALK over carriageway: ${c.swBadTris || 0} tris in ${rep.swOverRoad.length} tiles (RULE: must be ~0)`);
console.log(`ROAD near-miss endpoint pairs (2-4.5m): ${rep.nearMiss.length}   unsnapped T-junctions: ${rep.tee.length}`);
console.log(`DOORS  buildings: ${c.buildings}  street-facing but doorless: ${c.doorless} (${((100 * c.doorless) / Math.max(1, c.buildings)).toFixed(1)}%)  no street frontage: ${c.frontless}  frontage w/o frontIdx: ${c.noFrontIdx || 0}`);
console.log(`NaN tris: ${c.nan}  degenerate tris: ${c.degen}`);
console.log('\nworst holes:');
for (const h of rep.holes.slice(0, 10)) console.log(`  ${h.m2} m2 at ?x=${h.x}&z=${h.z}  (svg: node tools/audit.mjs --svg ${h.x},${h.z})`);
console.log('worst paint spills:');
for (const p of rep.paint.slice(0, 10)) console.log(`  ${p.bad}/${p.of} tris at ?x=${p.x}&z=${p.z}`);
fs.mkdirSync('shots', { recursive: true });
fs.writeFileSync('shots/audit_report.json', JSON.stringify(rep, null, 1));
console.log('\nfull report: shots/audit_report.json');
