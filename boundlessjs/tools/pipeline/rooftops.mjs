// ============================================================================
// PROCEDURAL ROOFTOP ENGINE
// ----------------------------------------------------------------------------
// NYC rooftops are dense industrial landscapes: plumbing vent stacks on the
// structural bay module, exhaust fans over kitchens and baths, condenser banks
// on dunnage steel, cooling towers, cell-carrier sleds leased at parapet
// corners with cabinets and cable trays, water tanks, window-washing davits,
// solar arrays pitched against winter sun, sedum green roofs with gravel fire
// breaks, amenity decks. This module plans all of it per building:
//
//   1. ARCHETYPE: PLUTO BldgClass + facade style + massing pick one of twelve
//      roof archetypes (tenement, rowhouse, prewar, elevator apartment, hotel,
//      office lowrise, office tower, loft, industrial, retail, institutional,
//      public-housing slab).
//   2. TEMPLATE: each archetype carries ~10 layout variants (bulkhead
//      placement, bank arrangements, vent patterns, amenity shapes) chosen by
//      seeded hash so a whole block never repeats one layout.
//   3. CONSTRAINT SOLVER: everything lands in the footprint's OBB frame
//      through a rectangle-occupancy solver that reserves the FDNY access
//      path (clear corridor from the roof door to the front parapet) before
//      any equipment is placed, enforces per-class parapet setbacks and
//      inter-equipment clearances, and five-point-tests the real footprint
//      polygon so nothing overhangs.
//   4. REAL DATA: DOB drinking-water-tank inspections (BIN join) place tanks
//      where tanks actually exist; NYSERDA distributed-solar installations
//      (46k points, lat/lon) place arrays sized by their real module counts;
//      TNC/Treglia 2016 green-roof footprints (BIN join) turn the surface
//      into sedum with tray fields and gravel borders.
//
// Every rotation snaps to the building's principal axes; free-spinning props
// do not exist here. All physical sizing rules are annotated inline.
// ============================================================================
import fs from 'node:fs';

// ---- furniture kinds (shared/geo FURN plus the rooftop range) --------------
const K = {
  WATER_TOWER: 22, ROOF_AC: 23, BULKHEAD: 24,
  VENT: 40, DISH: 41, MAST: 42, SKYLIGHT: 43, DUCT: 44,
  CHAIR: 45, TABLE: 46, PLANTER: 47, UMBRELLA: 48, COOLTOWER: 49, SOLAR: 50,
  CELL_SLED: 51, CELL_CAB: 52, CABLE_TRAY: 53, MUSHROOM: 54, UPBLAST: 55,
  GOOSENECK: 56, CHIMNEY: 57, HATCH: 58, GUARDRAIL: 59, DAVIT: 60,
  MICROWAVE: 61, DISH_CLUSTER: 62, DUNNAGE: 63, SCREENWALL: 64,
  SEDUM_TRAY: 65, PERGOLA: 66,
};

// footprint clearance radius per kind (meters) — the solver's occupancy pad
const PAD = {
  [K.WATER_TOWER]: 2.6, [K.ROOF_AC]: 1.0, [K.BULKHEAD]: 2.2,
  [K.VENT]: 0.35, [K.DISH]: 0.6, [K.MAST]: 0.9, [K.SKYLIGHT]: 1.3, [K.DUCT]: 1.9,
  [K.CHAIR]: 0.4, [K.TABLE]: 0.7, [K.PLANTER]: 0.85, [K.UMBRELLA]: 0.4,
  [K.COOLTOWER]: 1.9, [K.SOLAR]: 1.75,
  [K.CELL_SLED]: 1.3, [K.CELL_CAB]: 0.8, [K.CABLE_TRAY]: 1.6, [K.MUSHROOM]: 0.55,
  [K.UPBLAST]: 0.7, [K.GOOSENECK]: 0.3, [K.CHIMNEY]: 0.7, [K.HATCH]: 0.9,
  [K.GUARDRAIL]: 1.25, [K.DAVIT]: 0.7, [K.MICROWAVE]: 0.7, [K.DISH_CLUSTER]: 0.6,
  [K.DUNNAGE]: 1.2, [K.SCREENWALL]: 1.3, [K.SEDUM_TRAY]: 1.05, [K.PERGOLA]: 2.2,
};
// parapet setback per kind: FDNY/DOB want mechanicals off the roof edge, but
// antennas, guardrails, davits and dish clusters live AT the parapet
const SETBACK = {
  default: 1.0,
  [K.CELL_SLED]: 0.35, [K.GUARDRAIL]: 0.18, [K.DAVIT]: 0.45, [K.DISH]: 0.5,
  [K.DISH_CLUSTER]: 0.35, [K.MAST]: 0.6, [K.PLANTER]: 0.55, [K.VENT]: 0.6,
  [K.GOOSENECK]: 0.55, [K.SEDUM_TRAY]: 0.9, [K.CHIMNEY]: 0.35,
};

// ============================================================================
// datasets
// ============================================================================
export function loadRoofDatasets(project, log = console.log) {
  const out = { greenBins: new Set(), tankBins: new Set(), solarCells: new Map(), counts: { green: 0, tank: 0, solar: 0 } };
  // TNC green roofs (BIN join)
  try {
    const csv = fs.readFileSync('data/raw/greenroofs_tnc.csv', 'utf8').split('\n');
    const head = csv[0].split(',');
    const binI = head.indexOf('bin'), grI = head.indexOf('prop_gr');
    for (let i = 1; i < csv.length; i++) {
      const c = csv[i].split(',');
      if (c.length < 4) continue;
      const bin = String(parseInt(c[binI]));
      if (bin && bin !== 'NaN') { out.greenBins.add(bin); out.counts.green++; }
    }
  } catch (e) { log(' rooftops: green roof csv missing (' + e.code + ')'); }
  // DOB water tank inspections (BIN join)
  try {
    const j = JSON.parse(fs.readFileSync('data/raw/watertanks_bins.json', 'utf8'));
    for (const r of j) { if (r.bin) { out.tankBins.add(String(parseInt(r.bin))); out.counts.tank++; } }
  } catch (e) { log(' rooftops: water tank json missing (' + e.code + ')'); }
  // NYSERDA solar points -> world-space 40m hash grid
  try {
    const j = JSON.parse(fs.readFileSync('data/raw/solar_nyserda.json', 'utf8'));
    for (const r of j) {
      const lat = parseFloat(r.latitude), lon = parseFloat(r.longitude);
      if (!isFinite(lat) || !isFinite(lon)) continue;
      const [x, z] = project(lon, lat);
      const kk = `${Math.floor(x / 40)}_${Math.floor(z / 40)}`;
      let a = out.solarCells.get(kk); if (!a) out.solarCells.set(kk, (a = []));
      a.push([x, z, Math.max(4, parseFloat(r.pv_module_quantity) || 0) || Math.round((parseFloat(r.totalnameplatekwdc) || 5) * 2.4)]);
      out.counts.solar++;
    }
  } catch (e) { log(' rooftops: solar json missing (' + e.code + ')'); }
  // Roofpedia (Wu & Biljecki 2021) deep-learning detections: green + solar
  // building polygons for NYC. Green polygons extend the TNC registry via a
  // spatial join (centroid grid + exact point-in-footprint test at use site);
  // solar polygons merge into the NYSERDA grid, deduped within 25m (NYSERDA
  // carries real module counts, Roofpedia entries estimate from roof area —
  // modules=0 marks "estimate at planning time").
  const centroid = (poly) => {
    const ring = poly[0];
    let sx = 0, sy = 0;
    for (const p of ring) { sx += p[0]; sy += p[1]; }
    return [sx / ring.length, sy / ring.length];
  };
  out.greenCells = new Map();
  try {
    const j = JSON.parse(fs.readFileSync('data/raw/roofpedia_NY_green.geojson', 'utf8'));
    for (const ft of j.features || []) {
      if (!ft.geometry || ft.geometry.type !== 'Polygon') continue;
      const [lon, lat] = centroid(ft.geometry.coordinates);
      const [x, z] = project(lon, lat);
      const kk = `${Math.floor(x / 30)}_${Math.floor(z / 30)}`;
      let a = out.greenCells.get(kk); if (!a) out.greenCells.set(kk, (a = []));
      a.push([x, z]);
      out.counts.green++;
    }
  } catch (e) { log(' rooftops: roofpedia green missing (' + e.code + ')'); }
  try {
    const j = JSON.parse(fs.readFileSync('data/raw/roofpedia_NY_solar.geojson', 'utf8'));
    let added = 0;
    for (const ft of j.features || []) {
      if (!ft.geometry || ft.geometry.type !== 'Polygon') continue;
      const [lon, lat] = centroid(ft.geometry.coordinates);
      const [x, z] = project(lon, lat);
      // dedupe against NYSERDA points within 25m
      let dup = false;
      const gx = Math.floor(x / 40), gz = Math.floor(z / 40);
      for (let dz = -1; dz <= 1 && !dup; dz++) for (let dx = -1; dx <= 1 && !dup; dx++) {
        const a = out.solarCells.get(`${gx + dx}_${gz + dz}`);
        if (a) for (const p of a) if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < 625) { dup = true; break; }
      }
      if (dup) continue;
      const kk = `${gx}_${gz}`;
      let a = out.solarCells.get(kk); if (!a) out.solarCells.set(kk, (a = []));
      a.push([x, z, 0]); // 0 = size from the roof at planning time
      added++;
    }
    out.counts.solar += added;
    log(` rooftops: roofpedia solar merged ${added} (deduped vs NYSERDA)`);
  } catch (e) { log(' rooftops: roofpedia solar missing (' + e.code + ')'); }
  out.greenNear = (x, z, r = 20) => {
    const gx = Math.floor(x / 30), gz = Math.floor(z / 30);
    let best = null, bd = r * r;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const a = out.greenCells.get(`${gx + dx}_${gz + dz}`);
      if (a) for (const p of a) {
        const d2 = (p[0] - x) ** 2 + (p[1] - z) ** 2;
        if (d2 < bd) { bd = d2; best = p; }
      }
    }
    return best;
  };
  out.solarNear = (x, z, r = 30) => {
    const gx = Math.floor(x / 40), gz = Math.floor(z / 40);
    let best = null, bd = r * r;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const a = out.solarCells.get(`${gx + dx}_${gz + dz}`);
      if (a) for (const p of a) {
        const d2 = (p[0] - x) ** 2 + (p[1] - z) ** 2;
        if (d2 < bd) { bd = d2; best = p; }
      }
    }
    return best;
  };
  log(` rooftops: datasets green=${out.counts.green} tanks=${out.counts.tank} solar=${out.counts.solar}`);
  return out;
}

// ============================================================================
// the OBB-frame constraint solver
// ============================================================================
class RoofPlan {
  constructor(env) {
    const { b, obb, rnd, roofY, pointInPoly } = env;
    this.env = env;
    this.b = b; this.rnd = rnd; this.roofY = roofY;
    this.ang = obb.ang;
    this.ca = Math.cos(obb.ang); this.sa = Math.sin(obb.ang);
    this.hw = obb.w * 0.5; this.hh = obb.h * 0.5;
    this.cx = b.cx; this.cz = b.cz;
    this.pip = pointInPoly;
    this.occ = [];      // occupied rects [x0,z0,x1,z1] in OBB-local meters
    this.reserved = []; // keep-clear rects (FDNY paths) — equipment avoids, paths overlap paths
    this.items = 0;
  }
  world(lx, lz) { return [this.cx + lx * this.ca - lz * this.sa, this.cz + lx * this.sa + lz * this.ca]; }
  // point strictly inside the real footprint with radius r (5-point test)
  inside(lx, lz, r) {
    const [px, pz] = this.world(lx, lz);
    const p = this.pip, ring = this.b.ring;
    if (!p(px, pz, ring)) return false;
    if (r <= 0) return true;
    const [ax, az] = this.world(lx + r, lz), [bx, bz] = this.world(lx - r, lz);
    const [cx2, cz2] = this.world(lx, lz + r), [dx, dz] = this.world(lx, lz - r);
    return p(ax, az, ring) && p(bx, bz, ring) && p(cx2, cz2, ring) && p(dx, dz, ring);
  }
  hits(list, x0, z0, x1, z1) {
    for (const r of list) if (x0 < r[2] && x1 > r[0] && z0 < r[3] && z1 > r[1]) return true;
    return false;
  }
  free(lx, lz, r, ignoreReserve = false) {
    if (this.hits(this.occ, lx - r, lz - r, lx + r, lz + r)) return false;
    if (!ignoreReserve && this.hits(this.reserved, lx - r, lz - r, lx + r, lz + r)) return false;
    return true;
  }
  reserve(x0, z0, x1, z1) { this.reserved.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]); }
  occupy(lx, lz, r) { this.occ.push([lx - r, lz - r, lx + r, lz + r]); }
  // rotK: 0..3 quarter turns off the principal axis; null = seeded pick
  rot(rotK = null) {
    const k = rotK === null ? (this.rnd() * 4) | 0 : rotK;
    return this.ang + k * (Math.PI / 2) + (this.rnd() - 0.5) * 0.04;
  }
  // the core placement call: k kind, OBB-local position, quarter-turn rot
  place(k, lx, lz, rotK = 0, p0 = 0, p1 = 0, opts = {}) {
    const r = opts.pad ?? PAD[k] ?? 0.8;
    const sb = SETBACK[k] ?? SETBACK.default;
    // parapet setback in OBB frame (approximates the footprint edge)
    if (Math.abs(lx) > this.hw - sb - r * 0.4 || Math.abs(lz) > this.hh - sb - r * 0.4) {
      if (!opts.atParapet) return false;
    }
    if (!this.inside(lx, lz, r * 0.8 + 0.1)) return false;
    if (!this.free(lx, lz, r, opts.ignoreReserve)) return false;
    const [wx, wz] = this.world(lx, lz);
    this.env.put(k, wx, wz, typeof rotK === 'number' && rotK > 6 ? rotK : this.rot(rotK), p0, p1);
    this.occupy(lx, lz, r);
    this.items++;
    return true;
  }
  // place with an explicit world rotation (already snapped by the caller)
  placeRot(k, lx, lz, rotW, p0 = 0, p1 = 0, opts = {}) {
    const r = opts.pad ?? PAD[k] ?? 0.8;
    const sb = SETBACK[k] ?? SETBACK.default;
    if (Math.abs(lx) > this.hw - sb - r * 0.4 || Math.abs(lz) > this.hh - sb - r * 0.4) {
      if (!opts.atParapet) return false;
    }
    if (!this.inside(lx, lz, r * 0.8 + 0.1)) return false;
    if (!this.free(lx, lz, r, opts.ignoreReserve)) return false;
    const [wx, wz] = this.world(lx, lz);
    this.env.put(k, wx, wz, rotW, p0, p1);
    this.occupy(lx, lz, r);
    this.items++;
    return true;
  }
  // run of instances along a local line (guardrails, trays, planter rows)
  run(k, x0, z0, x1, z1, step, rotK, opts = {}) {
    const dx = x1 - x0, dz = z1 - z0;
    const L = Math.hypot(dx, dz);
    if (L < step * 0.5) return 0;
    const n = Math.max(1, Math.floor(L / step));
    const rotW = this.ang + Math.atan2(dz, dx) * 0 + rotK * (Math.PI / 2);
    let placed = 0;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      if (this.placeRot(k, x0 + dx * t, z0 + dz * t, rotW, opts.p0 ?? 0, opts.p1 ?? 0, opts)) placed++;
    }
    return placed;
  }
}

// ============================================================================
// physical subsystems — each encodes a real constraint or trade practice
// ============================================================================

// FDNY roof access: a clear corridor from the roof door to the street parapet
// and a crossing corridor, reserved before ANY equipment lands. Real rule:
// FC 504.4 wants clear paths and 6ft clearances around bulkhead doors.
function reserveAccessPaths(P, bx, bz, variant) {
  const cw = 0.95; // corridor half-width
  P.reserve(bx - cw, Math.min(bz, -P.hh), bx + cw, Math.max(bz, P.hh)); // door -> both parapets
  if (variant % 3 !== 2) P.reserve(Math.min(bx, -P.hw), bz - cw, Math.max(bx, P.hw), bz + cw);
}

// bulkhead (stair/elevator housing). Templates vary its anchor: center,
// rear-center, corner, offset. Elevator buildings get the bigger housing.
function placeBulkhead(P, c, variant) {
  const spots = [
    [0, 0], [0, -P.hh * 0.45], [P.hw * 0.35, -P.hh * 0.4], [-P.hw * 0.35, -P.hh * 0.4],
    [0, P.hh * 0.35], [P.hw * 0.3, 0], [-P.hw * 0.3, 0.2 * P.hh],
  ];
  const [bx, bz] = spots[variant % spots.length];
  if (P.place(K.BULKHEAD, bx, bz, (variant % 2) * 2)) return [bx, bz];
  if (P.place(K.BULKHEAD, 0, 0, 0)) return [0, 0];
  return null;
}

// roof hatch for buildings too small for a full bulkhead
function placeHatch(P) {
  for (const [lx, lz] of [[0, -P.hh * 0.3], [P.hw * 0.25, 0], [0, 0]]) {
    if (P.place(K.HATCH, lx, lz, 0)) return [lx, lz];
  }
  return null;
}

// plumbing vent stacks ride the structural bay module: one riser per stack of
// wet rooms, so they land on winW multiples measured from the front wall, in
// one or two interior rows. Count scales with served floor area.
function ventStacks(P, b, c, density = 1) {
  const bay = Math.max(1.8, c.winW || 2.7);
  const n = Math.min(14, Math.max(2, Math.round((b.area * Math.min(c.floors, 8)) / 480 * density)));
  const rows = P.hh > 6 ? 2 : 1;
  let placed = 0;
  for (let i = 0; i < n * 2 && placed < n; i++) {
    const col = ((P.rnd() * (P.hw * 2 / bay)) | 0) * bay - P.hw + bay * 0.5;
    const rowZ = rows === 2 ? (i % 2 === 0 ? -P.hh * 0.38 : P.hh * 0.3) : (P.rnd() - 0.5) * P.hh;
    if (P.place(K.VENT, col, rowZ + (P.rnd() - 0.5) * 0.8, 0, (P.rnd() * 255) | 0)) placed++;
  }
  return placed;
}

// bath/kitchen exhaust: goosenecks scattered near the rear, mushroom fans on
// larger residential, upblast (kitchen) fans behind restaurants (storefronts)
function exhaustFans(P, b, c, hasStore) {
  const nG = Math.min(8, Math.max(1, Math.round(b.area / 210)));
  for (let i = 0; i < nG; i++) {
    P.place(K.GOOSENECK, (P.rnd() - 0.5) * 2 * P.hw * 0.8, P.hh * (0.15 + P.rnd() * 0.55), 0, (P.rnd() * 255) | 0);
  }
  if (b.area > 190) {
    const nM = Math.min(4, Math.max(1, Math.round(b.area / 420)));
    for (let i = 0; i < nM; i++) {
      P.place(K.MUSHROOM, (P.rnd() - 0.5) * 2 * P.hw * 0.7, (P.rnd() - 0.5) * 2 * P.hh * 0.6, 0);
    }
  }
  if (hasStore && P.rnd() < 0.75) {
    // restaurant duct rises the rear wall and terminates in an upblast fan
    P.place(K.UPBLAST, (P.rnd() - 0.5) * P.hw, P.hh * 0.62, 0);
  }
}

// condenser banks on dunnage rails. Sizing: one condenser per ~850m² served.
// Banks form aligned rows near the core with a service aisle (the solver's
// pad keeps the aisle). Variants: single row / double row / L / split pads.
function hvacBanks(P, b, c, variant, scale = 1) {
  const served = b.area * Math.min(c.floors, 12);
  let n = Math.min(14, Math.max(1, Math.round(served / 850 * scale)));
  const arr = variant % 4;
  const step = 2.15;
  const rowLen = Math.min(n, Math.max(2, ((P.hw * 2 - 3) / step) | 0));
  const rows = arr === 1 ? 2 : 1;
  const placeRow = (z0, count, xoff = 0) => {
    let placed = 0;
    // dunnage rail pair under the row (one prop per 2 units)
    for (let i = 0; i < count; i++) {
      const lx = xoff - ((count - 1) / 2) * step + i * step;
      if (i % 2 === 0) P.placeRot(K.DUNNAGE, lx + step / 2, z0, P.ang, 0, 0, { pad: 0.2, ignoreReserve: false });
      if (P.placeRot(K.ROOF_AC, lx, z0, P.ang + (arr === 3 ? Math.PI / 2 : 0))) placed++;
    }
    return placed;
  };
  if (arr === 2 && n >= 4) { // L-shape
    const half = (n / 2) | 0;
    placeRow(-P.hh * 0.3, Math.min(half, rowLen));
    let placed = 0;
    for (let i = 0; i < n - half; i++) {
      if (P.placeRot(K.ROOF_AC, P.hw * 0.34, -P.hh * 0.3 + (i + 1) * step, P.ang + Math.PI / 2)) placed++;
    }
  } else if (arr === 3 && n >= 4) { // split pads
    placeRow(-P.hh * 0.34, (n / 2) | 0, -P.hw * 0.2);
    placeRow(P.hh * 0.3, n - ((n / 2) | 0), P.hw * 0.2);
  } else {
    for (let rI = 0; rI < rows && n > 0; rI++) {
      const cnt = Math.min(n, rowLen);
      placeRow(-P.hh * 0.28 + rI * 2.7, cnt);
      n -= cnt;
    }
  }
}

// duct spine: runs from the bulkhead toward the mechanical zone
function ductSpine(P, from, variant) {
  if (!from) return;
  const [bx, bz] = from;
  const n = 1 + (variant % 2);
  for (let i = 0; i < n; i++) {
    P.place(K.DUCT, bx + (i + 1) * 3.1 * (variant % 2 ? -1 : 1), bz + (P.rnd() - 0.5), (variant % 2) ? 1 : 0, 0, 0, { ignoreReserve: false });
  }
}

// cell carrier site: leased parapet corner. Sector sleds face outward along
// both street edges, an equipment cabinet sits behind, a cable tray runs
// toward the core. Carriers prefer mid-rise roofs with clear sight lines.
function cellSite(P, b, c, corners = 1) {
  const cs = [[1, 1], [-1, 1], [1, -1], [-1, -1]].sort(() => P.rnd() - 0.5);
  let done = 0;
  for (const [qx, qz] of cs) {
    if (done >= corners) break;
    const lx = qx * (P.hw - 1.0), lz = qz * (P.hh - 1.0);
    // two sector sleds at the corner, one facing each street
    const okA = P.placeRot(K.CELL_SLED, lx, lz - qz * 1.3, P.ang + (qx > 0 ? 0 : Math.PI), 0, 0, { atParapet: true });
    const okB = P.placeRot(K.CELL_SLED, lx - qx * 1.6, lz, P.ang + (qz > 0 ? Math.PI / 2 : -Math.PI / 2), 0, 0, { atParapet: true });
    if (okA || okB) {
      P.placeRot(K.CELL_CAB, lx - qx * 2.6, lz - qz * 2.4, P.ang, 0, 0, { pad: 0.7 });
      P.run(K.CABLE_TRAY, lx - qx * 3.6, lz - qz * 3.1, lx * 0.15, lz * 0.15, 3.0, 0, { pad: 0.35, ignoreReserve: true });
      done++;
    }
  }
  return done;
}

// solar field pitched against winter sun. Row pitch keeps rows out of each
// other's shadow at the winter design elevation (~26° in NYC):
//   pitch = L·cos(tilt) + L·sin(tilt)/tan(26°)  with L=1.7m panels at 20°
// All rows share ONE orientation (installers don't mix azimuths on a roof).
function solarField(P, b, modules, rnd) {
  const tilt = 0.35; // ~20°
  const Lp = 1.7;
  const pitch = Lp * Math.cos(tilt) + (Lp * Math.sin(tilt)) / Math.tan(0.454); // ≈ 2.8m
  const perRow = Math.max(1, Math.min(5, ((P.hw * 2 - 3) / 3.6) | 0));
  const rowsWanted = Math.max(1, Math.min(5, Math.ceil(modules / 10 / perRow)));
  const rotS = P.ang + ((rnd() * 2) | 0) * Math.PI;
  let placed = 0;
  for (let rI = 0; rI < rowsWanted; rI++) {
    for (let pI = 0; pI < perRow; pI++) {
      const lx = -((perRow - 1) / 2) * 3.6 + pI * 3.6;
      const lz = -((rowsWanted - 1) / 2) * pitch + rI * pitch + P.hh * 0.12;
      if (P.placeRot(K.SOLAR, lx, lz, rotS)) placed++;
    }
  }
  return placed;
}

// sedum green roof: tray field with gravel fire-break border (FDNY wants
// vegetation held back from parapets and access paths) + a guardrail run
function greenRoofField(P, b) {
  const gx = P.hw - 1.6, gz = P.hh - 1.6;
  let placed = 0;
  for (let lz = -gz; lz <= gz; lz += 1.15) {
    for (let lx = -gx; lx <= gx; lx += 2.1) {
      if (P.rnd() < 0.12) continue; // maintenance gaps read as paths
      if (P.placeRot(K.SEDUM_TRAY, lx, lz, P.ang, (P.rnd() * 255) | 0, 0, { pad: 0.35 })) placed++;
    }
  }
  return placed;
}

// amenity deck: pergola or umbrella court in one quadrant, tables with chairs
// oriented to them, planter rows, guardrails along the occupied edges
function amenityDeck(P, b, variant) {
  const qx = variant % 2 ? 1 : -1, qz = variant % 4 < 2 ? 1 : -1;
  const cxD = qx * P.hw * 0.42, czD = qz * P.hh * 0.36;
  if (variant % 3 === 0) P.place(K.PERGOLA, cxD, czD, variant % 2, 0, 0, { pad: 2.0 });
  const nT = 1 + ((P.rnd() * 3) | 0);
  for (let ti = 0; ti < nT; ti++) {
    const tx = cxD - qx * ti * 3.0, tz = czD - qz * (ti % 2) * 2.6;
    if (!P.place(K.TABLE, tx, tz, 0)) continue;
    if (P.rnd() < 0.6) P.place(K.UMBRELLA, tx + (P.rnd() - 0.5) * 0.4, tz + (P.rnd() - 0.5) * 0.4, 0, 0, 0, { pad: 0.25 });
    for (let ci = 0; ci < 3; ci++) {
      const a = P.ang + ci * (Math.PI / 2) + (P.rnd() - 0.5) * 0.2;
      P.placeRot(K.CHAIR, tx + Math.cos(a - P.ang) * 0.95, tz + Math.sin(a - P.ang) * 0.95, a + Math.PI, 0, 0, { pad: 0.35 });
    }
  }
  // planter row along the deck-side parapet + guardrail over it
  P.run(K.PLANTER, -qx * P.hw * 0.2, qz * (P.hh - 0.9), qx * (P.hw - 1.2), qz * (P.hh - 0.9), 2.3, 0, { atParapet: true });
  P.run(K.GUARDRAIL, qx * (P.hw - 0.45), qz * (P.hh - 0.45) - qz * P.hh * 0.7, qx * (P.hw - 0.45), qz * (P.hh - 0.45), 2.5, 1, { atParapet: true, pad: 0.2 });
}

// window-washing davits every ~11m along the parapet of tall towers
function davits(P, b) {
  const n = Math.min(6, ((P.hw * 2) / 11) | 0);
  for (let i = 0; i < n; i++) {
    const lx = -P.hw + 3 + i * 11;
    P.placeRot(K.DAVIT, lx, P.hh - 0.8, P.ang, 0, 0, { atParapet: true, pad: 0.4 });
    P.placeRot(K.DAVIT, -lx, -P.hh + 0.8, P.ang + Math.PI, 0, 0, { atParapet: true, pad: 0.4 });
  }
}

// masonry chimneys on pre-war party walls (rear third, one per ~250m²)
function chimneys(P, b, c) {
  const n = Math.min(3, Math.max(1, Math.round(b.area / 250)));
  for (let i = 0; i < n; i++) {
    const lx = (i - (n - 1) / 2) * (P.hw * 0.9);
    P.placeRot(K.CHIMNEY, lx, P.hh - 0.75, P.ang, Math.min(255, (8 + P.rnd() * 20) | 0), 0, { atParapet: true, pad: 0.5 });
  }
}

// walk-up DIY antenna era: dish clusters + old TV masts at the front parapet
function walkupAntennas(P, b, c) {
  if (P.rnd() < 0.6) P.placeRot(K.DISH_CLUSTER, (P.rnd() - 0.5) * P.hw, -(P.hh - 0.7), P.ang + Math.PI, 0, 0, { atParapet: true });
  if (P.rnd() < 0.4) P.place(K.DISH, (P.rnd() - 0.5) * P.hw * 0.8, -P.hh * 0.5, 0);
  if (P.rnd() < 0.3) P.place(K.MAST, (P.rnd() - 0.5) * P.hw * 0.6, (P.rnd() - 0.5) * P.hh * 0.5, 0);
}

// mechanical screen walls hide big plant from the street on newer buildings
function screenWalls(P, len, lz) {
  P.run(K.SCREENWALL, -len / 2, lz, len / 2, lz, 2.45, 0, { pad: 0.3, ignoreReserve: true });
}

// skylight rows (industrial sawtooth reading; institutional lantern rows)
function skylightRows(P, rows, perRow) {
  for (let rI = 0; rI < rows; rI++) {
    for (let kI = 0; kI < perRow; kI++) {
      const lx = -((perRow - 1) / 2) * 3.2 + kI * 3.2;
      const lz = (rI - (rows - 1) / 2) * 3.6;
      P.placeRot(K.SKYLIGHT, lx, lz, P.ang);
    }
  }
}

// tall-tower comms farm: masts + microwave drums on the mechanical penthouse
function commsFarm(P, b, n) {
  for (let i = 0; i < n; i++) {
    const lx = (P.rnd() - 0.5) * P.hw * 0.7, lz = (P.rnd() - 0.5) * P.hh * 0.7;
    if (i % 3 === 2) P.placeRot(K.MICROWAVE, lx, lz, P.rot(null));
    else P.place(K.MAST, lx, lz, 0);
  }
}

// ============================================================================
// archetypes: selection + per-archetype template tables (10 variants each).
// A variant row = [bulkheadSpot, hvacArrangement, ventDensity, extras bitmask]
// extras bits: 1 cell site, 2 solar-capable, 4 screen wall, 8 comms,
//              16 deck, 32 skylights, 64 chimneys, 128 dish era
// ============================================================================
const T = {
  tenement: [
    [0, 0, 1.2, 64 | 128], [1, 0, 1.0, 64 | 128], [2, 3, 1.3, 64], [3, 0, 1.1, 64 | 128 | 1],
    [4, 0, 1.0, 64 | 128], [5, 3, 1.2, 64], [6, 0, 1.4, 64 | 128], [0, 3, 1.0, 64 | 1],
    [1, 0, 1.3, 64 | 128], [2, 0, 1.1, 64 | 128],
  ],
  rowhouse: [
    [0, 0, 0.7, 64], [1, 0, 0.8, 64], [2, 0, 0.6, 64 | 128], [3, 0, 0.7, 64],
    [4, 0, 0.8, 64], [5, 0, 0.7, 64 | 128], [6, 0, 0.6, 64], [0, 0, 0.9, 64],
    [1, 0, 0.7, 64 | 128], [2, 0, 0.8, 64],
  ],
  prewar: [
    [0, 0, 1.1, 64 | 1], [1, 1, 1.0, 64], [2, 0, 1.2, 64 | 1 | 2], [3, 3, 1.0, 64],
    [4, 0, 1.1, 64 | 128], [5, 1, 1.0, 64 | 1], [6, 0, 1.2, 64], [0, 3, 1.0, 64 | 2],
    [1, 0, 1.1, 64 | 1], [2, 1, 1.0, 64],
  ],
  elevator_apt: [
    [0, 1, 1.0, 16 | 2 | 1], [1, 0, 0.9, 16 | 2], [2, 1, 1.0, 16 | 1], [3, 2, 0.9, 16 | 2],
    [4, 1, 1.0, 16], [5, 0, 0.9, 16 | 2 | 1], [6, 1, 1.0, 16 | 2], [0, 2, 0.9, 16 | 1],
    [1, 1, 1.0, 16 | 2], [2, 0, 0.9, 16],
  ],
  hotel: [
    [0, 1, 0.9, 16 | 4 | 2], [1, 2, 0.9, 16 | 4], [2, 1, 0.8, 16 | 4 | 1], [3, 1, 0.9, 16 | 4],
    [4, 2, 0.9, 16 | 4 | 2], [5, 1, 0.8, 16 | 4], [6, 1, 0.9, 16 | 4 | 1], [0, 2, 0.8, 16 | 4],
    [1, 1, 0.9, 16 | 4 | 2], [2, 2, 0.8, 16 | 4],
  ],
  office_low: [
    [0, 1, 0.8, 4 | 2 | 1], [1, 2, 0.9, 4 | 2], [2, 3, 0.8, 4 | 1], [3, 1, 0.9, 4 | 2],
    [4, 2, 0.8, 4], [5, 1, 0.9, 4 | 2 | 1], [6, 3, 0.8, 4 | 2], [0, 2, 0.9, 4 | 1],
    [1, 1, 0.8, 4 | 2], [2, 3, 0.9, 4],
  ],
  office_tower: [
    [0, 1, 0.7, 4 | 8], [1, 2, 0.7, 4 | 8 | 2], [2, 1, 0.7, 4 | 8], [3, 2, 0.7, 4 | 8],
    [4, 1, 0.7, 4 | 8 | 2], [5, 2, 0.7, 4 | 8], [6, 1, 0.7, 4 | 8], [0, 2, 0.7, 4 | 8 | 2],
    [1, 1, 0.7, 4 | 8], [2, 2, 0.7, 4 | 8],
  ],
  loft: [
    [0, 3, 1.0, 32 | 1 | 2], [1, 0, 1.0, 32 | 2], [2, 3, 1.1, 32 | 1], [3, 0, 1.0, 32],
    [4, 3, 1.0, 32 | 2], [5, 0, 1.1, 32 | 1], [6, 3, 1.0, 32 | 2], [0, 0, 1.0, 32],
    [1, 3, 1.1, 32 | 1 | 2], [2, 0, 1.0, 32],
  ],
  industrial: [
    [1, 3, 0.9, 32 | 2], [4, 3, 0.9, 32 | 2 | 4], [1, 2, 1.0, 32], [4, 3, 0.9, 32 | 2],
    [1, 3, 0.9, 32 | 4], [4, 2, 1.0, 32 | 2], [1, 3, 0.9, 32], [4, 3, 0.9, 32 | 2 | 4],
    [1, 2, 1.0, 32], [4, 3, 0.9, 32 | 2],
  ],
  retail: [
    [0, 0, 1.0, 2], [1, 0, 1.1, 0], [2, 0, 1.0, 2], [3, 0, 1.0, 0], [4, 0, 1.1, 2],
    [5, 0, 1.0, 0], [6, 0, 1.0, 2], [0, 0, 1.1, 0], [1, 0, 1.0, 2], [2, 0, 1.0, 0],
  ],
  institutional: [
    [0, 1, 0.8, 32 | 2], [1, 2, 0.8, 32], [2, 1, 0.9, 32 | 2], [3, 2, 0.8, 32],
    [4, 1, 0.8, 32 | 2], [5, 2, 0.9, 32], [6, 1, 0.8, 32], [0, 2, 0.8, 32 | 2],
    [1, 1, 0.9, 32], [2, 2, 0.8, 32 | 2],
  ],
  project_slab: [
    [0, 1, 1.1, 1], [1, 1, 1.2, 0], [2, 1, 1.1, 1], [3, 1, 1.1, 0], [4, 1, 1.2, 1],
    [5, 1, 1.1, 0], [6, 1, 1.1, 1], [0, 1, 1.2, 0], [1, 1, 1.1, 1], [2, 1, 1.1, 0],
  ],
};

function pickArchetype(b, c, cls0) {
  const S = c.style;
  if (S === 12) return 'project_slab';
  if (S === 9) return 'institutional';
  if (cls0 === 'H') return 'hotel';
  if (cls0 === 'E' || cls0 === 'F' || cls0 === 'G' || S === 7) return 'industrial';
  if (S === 6 || cls0 === 'L') return 'loft';
  if (cls0 === 'O' || S === 3 || S === 11) return b.h > 60 ? 'office_tower' : 'office_low';
  if (cls0 === 'P' || cls0 === 'W' || cls0 === 'I' || S === 8) return 'institutional';
  if (cls0 === 'K' || S === 10 || (c.flags & 8 && b.h < 12)) return 'retail';
  if (S === 5 || cls0 === 'A' || cls0 === 'B') return 'rowhouse';
  if (cls0 === 'D' || cls0 === 'R' || (S === 1 && b.h > 26) || S === 2) return b.h > 26 ? 'elevator_apt' : 'prewar';
  if (S === 1 || S === 4) return 'prewar';
  return 'tenement';
}

// ============================================================================
// entry point
// ============================================================================
export function planRooftop(env) {
  const { b, c, rnd, data, orientedBBox } = env;
  if (b.h <= 4 || b.area < 42 || b.ring.length < 3) return { green: false };
  const obb = orientedBBox(b.ring);
  if (obb.w < 4 || obb.h < 3) return { green: false };
  const P = new RoofPlan({ ...env, obb });
  const cls0 = (b.cls || '')[0] || '';
  const arch = pickArchetype(b, c, cls0);
  const flat = !c.roofKind && !(c.flags & 128);
  const bin = String(b.bin || '');
  const variant = (rnd() * 10) | 0;
  const [bkSpot, hvacArr, ventD, extras] = T[arch][variant];

  // ---- real-data layers decide first (they own their zones)
  const gpt = flat && b.area > 90 ? data.greenNear(b.cx, b.cz, Math.max(10, Math.sqrt(b.area) * 0.75)) : null;
  const isGreen = flat && b.area > 90 && (data.greenBins.has(bin)
    || (gpt && env.pointInPoly(gpt[0], gpt[1], b.ring)));
  const solarRec = flat && b.area > 110 ? data.solarNear(b.cx, b.cz, Math.max(14, Math.sqrt(b.area) * 0.7)) : null;
  if (solarRec && !solarRec[2]) solarRec[2] = Math.max(8, Math.min(50, Math.round(b.area / 9))); // Roofpedia: size from the roof
  const hasTank = data.tankBins.has(bin) || ((c.flags & 1) && rnd() < 0.9);

  // ---- access first (FDNY), then the big singletons, then systems
  let door = null;
  if (!flat || b.area < 95 || (arch === 'rowhouse' && b.h < 22)) {
    door = placeHatch(P);
  } else {
    door = placeBulkhead(P, c, bkSpot);
    if (door) reserveAccessPaths(P, door[0], door[1], variant);
  }

  if (hasTank && flat && b.h > 12 && obb.w > 9 && obb.h > 8) {
    // tanks stand clear of the bulkhead on their own dunnage
    for (const [tx, tz] of [[P.hw * 0.32, P.hh * 0.3], [-P.hw * 0.32, P.hh * 0.28], [P.hw * 0.3, -P.hh * 0.3], [0, P.hh * 0.35]]) {
      if (P.place(K.WATER_TOWER, tx, tz, null, Math.min(255, b.h | 0), (rnd() * 255) | 0)) break;
    }
  }

  if (isGreen) {
    greenRoofField(P, b);
    P.run(K.GUARDRAIL, -P.hw + 0.5, -P.hh + 0.45, P.hw - 0.5, -P.hh + 0.45, 2.5, 0, { atParapet: true, pad: 0.2 });
  } else if (flat) {
    // mechanical program per archetype
    if (extras & 16) amenityDeck(P, b, variant);
    const served = b.area * Math.min(c.floors || b.h / 3, 12);
    if (served > 11000 && (arch === 'office_tower' || arch === 'office_low' || arch === 'hotel')) {
      P.place(K.COOLTOWER, 0, -P.hh * 0.3, (variant % 2) * 2, 0, 0, { pad: 2.2 });
      if (served > 26000) P.place(K.COOLTOWER, 4.6, -P.hh * 0.3, (variant % 2) * 2, 0, 0, { pad: 2.2 });
    }
    if (b.h > 9 && b.area > 100) hvacBanks(P, b, c, hvacArr, arch === 'retail' ? 0.6 : 1);
    ductSpine(P, door, variant);
    if (extras & 32) {
      skylightRows(P, Math.min(3, Math.max(1, (P.hh / 3.8) | 0)), Math.min(6, Math.max(2, ((P.hw * 2 - 3) / 3.2) | 0)));
    }
    if (extras & 4 && b.area > 260) screenWalls(P, Math.min(P.hw * 1.2, 10), -P.hh * 0.32 - 2.2);
  }

  // ---- systems every roof carries
  ventStacks(P, b, c, ventD);
  exhaustFans(P, b, c, !!(c.flags & 8));
  if ((extras & 64) && (c.year || 1950) < 1946) chimneys(P, b, c);
  if (extras & 128) walkupAntennas(P, b, c);

  // ---- comms: cell sites favor clear mid-rise roofs (18-75m), corner leases
  if ((extras & 1) && flat && b.h > 16 && b.h < 78 && obb.w > 10 && rnd() < 0.55) {
    cellSite(P, b, c, 1 + (b.area > 500 && rnd() < 0.3 ? 1 : 0));
  }
  if (extras & 8) { commsFarm(P, b, 3 + ((rnd() * 4) | 0)); davits(P, b); }
  else if (b.h > 46) davits(P, b);

  // ---- solar last: fills whatever big flat zone remains
  if (solarRec && !isGreen) solarField(P, b, solarRec[2], rnd);
  else if (flat && !isGreen && (extras & 2) && b.area > 300 && rnd() < 0.06) solarField(P, b, 24, rnd);

  return { green: isGreen, items: P.items };
}
