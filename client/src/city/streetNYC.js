// NYC street-level dressing computed at runtime from the tile's road graph
// (compiler output: road polylines with per-end junction mouths, junction
// nodes). Today: pedestrian curb ramps with detectable-warning plates at both
// ends of every crosswalk — the compiler paints the crosswalk at each stub's
// mouth (`mouth + 0.35 .. + 2.85` along the stub), so a ramp sits on each
// corner sidewalk in line with the crosswalk, facing the roadway.
const NODE_R = 4.0;      // road end ↔ node match radius (m): compiler snaps ends within a few metres of merged nodes (the traffic sim clusters at 12 m); 1.6 dropped the avenue legs at 125th/Lenox
// crosswalk centre along the stub from the mouth: the compiler paints the bars from
// mouth+0.35 over XW_DEPTH(rclass, width) — NYC DOT crosswalk widths measured on ref_lenox.png:
// 25 ft on a 55 ft+ roadway (125th St), 15 ft everywhere else.
// XW11: keep this in step with XW_DEPTH in tools/pipeline/compile.mjs.
const XW_DEPTH = (rclass, width) => (rclass === 2 && width >= 16.5 ? 7.62 : 4.57);   // 25 ft / 15 ft
const RAMP_IN = (rclass, width) => 0.35 + XW_DEPTH(rclass, width) / 2;   // rclass 2 = wide roadway
const RAMP_OUT = 0.05;   // ramp origin sits at the curb line
const RAMP_IN_SAMPLE = RAMP_OUT;   // sidewalk-height sample point, inboard of the curb line
// Detectable-warning variant, picked per JUNCTION — every ramp in one
// intersection was built in the same capital project, so they match.
// See docs/notes/streets-audit.md G5 (round 3): brick-red composite is the
// common NYC look, bare grey cast iron is what a recent capital job leaves
// (Broadway & Chambers, 2024-11), and plenty of older Harlem ramps have no
// plate at all (W 125th & Lenox, 2022-06 is plain concrete to the gutter).
const RAMP_POOL = (n) => {
  const h = Math.abs(Math.sin(n.x * 12.9898 + n.z * 78.233) * 43758.5453) % 1;
  return h < 0.24 ? 'curbRampBare' : h < 0.68 ? 'curbRamp' : 'curbRampIron';
};

export function placeCurbRamps(data, claim, sidewalkY) {
  const nodes = data.nodes || [];
  if (!nodes.length || !data.roads) return 0;
  // spatial index of nodes
  const grid = new Map();
  const key = (x, z) => `${Math.floor(x / 8)}_${Math.floor(z / 8)}`;
  for (const n of nodes) {
    const k = key(n.x, n.z);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push({ ...n, ends: [] });
  }
  const nodeAt = (x, z) => {
    const gx = Math.floor(x / 8), gz = Math.floor(z / 8);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const a = grid.get(`${gx + dx}_${gz + dz}`);
      if (!a) continue;
      for (const n of a) if (Math.hypot(n.x - x, n.z - z) < NODE_R) return n;
    }
    return null;
  };
  // attach road ends (with outward direction and mouth) to their nodes
  for (const r of data.roads) {
    if (r.rclass > 2 || !r.pts || r.pts.length < 2) continue;
    const P = r.pts;
    // twin-node link (a cross street's short piece between a divided avenue's two
    // carriageway nodes): no ramps in the median gap — the compiler paints no
    // crossing there either
    let rl = 0; for (let i = 1; i < P.length; i++) rl += Math.hypot(P[i][0] - P[i - 1][0], P[i][2] - P[i - 1][2]);
    if (rl < 20 && r.mouthA > 0 && r.mouthB > 0) continue;
    const ends = [
      { p: P[0], q: P[1], mouth: r.mouthA },
      { p: P[P.length - 1], q: P[P.length - 2], mouth: r.mouthB },
    ];
    for (const e of ends) {
      const n = nodeAt(e.p[0], e.p[2]);
      if (!n) continue;
      const dx = e.q[0] - e.p[0], dz = e.q[2] - e.p[2];
      const L = Math.hypot(dx, dz) || 1;
      n.ends.push({ dirx: dx / L, dirz: dz / L, mouth: e.mouth || 0, width: r.width, oneway: r.oneway, rclass: r.rclass ?? 2 });
    }
  }
  let placed = 0;
  for (const a of grid.values()) {
    for (const n of a) {
      if (n.ends.length < 3 && !(n.signal && n.ends.length >= 2)) continue;   // ramps live at intersections
      // tiles that carry the compiled dome-plate sections (matId 13/14) get only the
      // depressed curb nose here; older tiles keep the per-junction plate variants
      const pool = data.hasWarn ? 'curbRampBare' : RAMP_POOL(n);
      for (const e of n.ends) {
        if (e.width < 5) continue;
        const along = e.mouth + RAMP_IN(e.rclass, e.width);   // XW11
        const cx = n.x + e.dirx * along, cz = n.z + e.dirz * along;
        const nx = -e.dirz, nz = e.dirx;                  // lateral (left of the stub direction)
        for (const side of [-1, 1]) {
          const lat = side * (e.width / 2 + RAMP_OUT);
          const x = cx + nx * lat, z = cz + nz * lat;
          // Sample the flag height WELL INSIDE the pavement, not at the ramp
          // origin. The origin sits on the curb line, which is on (or just
          // outside) the edge of the sidewalk polygon, so assemble's
          // point-in-triangle sampler was reaching its 0.35 m tolerance and
          // falling through to `terrain + 0.305` — 2.5 cm above the real flags
          // (measured 3.545 vs 3.520), which floated the whole ramp and gave
          // the detectable-warning plate its own AO shadow. 0.85 m inboard is
          // still under the ramp footprint but comfortably inside the flags.
          const latIn = side * (e.width / 2 + RAMP_IN_SAMPLE);
          const y = sidewalkY(cx + nx * latIn, cz + nz * latIn);
          if (y === null || !isFinite(y)) continue;
          // +z of the ramp geometry must face the roadway (toward the stub axis)
          const rot = Math.atan2(-side * nx, -side * nz);
          claim(pool, x, y, z, rot);
          placed++;
        }
      }
    }
  }
  return placed;
}
