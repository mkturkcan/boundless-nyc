// City collision & raycast against building prisms + OBB boxes (bridges, landmarks).
// Data-driven (footprints), independent of render LoD.
const CELL = 28;

export class CityColliders {
  constructor() {
    this.grid = new Map(); // "cx_cz" -> { prisms: [], boxes: [] }
    this.byTile = new Map(); // tileKey -> arrays for cleanup
  }
  _cell(x, z) { return `${Math.floor(x / CELL)}_${Math.floor(z / CELL)}`; }
  addPrism(tileKey, prism) {
    // prism: {pts: Float32Array [x,z,...] world, minX,minZ,maxX,maxZ, y0, y1}
    let reg = this.byTile.get(tileKey);
    if (!reg) this.byTile.set(tileKey, (reg = []));
    reg.push(prism);
    const c0x = Math.floor(prism.minX / CELL), c1x = Math.floor(prism.maxX / CELL);
    const c0z = Math.floor(prism.minZ / CELL), c1z = Math.floor(prism.maxZ / CELL);
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const k = `${cx}_${cz}`;
      let g = this.grid.get(k);
      if (!g) this.grid.set(k, (g = []));
      g.push(prism);
    }
    prism.cells = [c0x, c0z, c1x, c1z];
  }
  addBox(tileKey, box) {
    // box: {x,y,z center, hw,hh,hd half extents, rotY} -> convert to prism (4-pt ring)
    const c = Math.cos(box.rotY), s = Math.sin(box.rotY);
    const pts = new Float32Array(8);
    const corners = [[-box.hw, -box.hd], [box.hw, -box.hd], [box.hw, box.hd], [-box.hw, box.hd]];
    corners.forEach(([lx, lz], i) => {
      pts[i * 2] = box.x + lx * c - lz * s;
      pts[i * 2 + 1] = box.z + lx * s + lz * c;
    });
    let minX = 1e9, minZ = 1e9, maxX = -1e9, maxZ = -1e9;
    for (let i = 0; i < 4; i++) { minX = Math.min(minX, pts[i * 2]); maxX = Math.max(maxX, pts[i * 2]); minZ = Math.min(minZ, pts[i * 2 + 1]); maxZ = Math.max(maxZ, pts[i * 2 + 1]); }
    this.addPrism(tileKey, { pts, minX, minZ, maxX, maxZ, y0: box.y - box.hh, y1: box.y + box.hh, deck: box.deck });
  }
  removeTile(tileKey) {
    const reg = this.byTile.get(tileKey);
    if (!reg) return;
    for (const prism of reg) {
      const [c0x, c0z, c1x, c1z] = prism.cells;
      for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
        const g = this.grid.get(`${cx}_${cz}`);
        if (g) { const i = g.indexOf(prism); if (i >= 0) g.splice(i, 1); if (!g.length) this.grid.delete(`${cx}_${cz}`); }
      }
    }
    this.byTile.delete(tileKey);
  }
  _pointIn2D(x, z, pts) {
    let inside = false;
    const n = pts.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = pts[i * 2], zi = pts[i * 2 + 1], xj = pts[j * 2], zj = pts[j * 2 + 1];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }
  // Raycast: origin o (Vector3-like), dir d normalized, maxDist. Returns {point, normal, dist, prism} or null
  raycast(o, d, maxDist = 130) {
    let best = null;
    const step = CELL * 0.9;
    const visited = new Set();
    for (let t = 0; t <= maxDist + step; t += step) {
      const cx = Math.floor((o.x + d.x * Math.min(t, maxDist)) / CELL);
      const cz = Math.floor((o.z + d.z * Math.min(t, maxDist)) / CELL);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const k = `${cx + dx}_${cz + dz}`;
        if (visited.has(k)) continue;
        visited.add(k);
        const g = this.grid.get(k);
        if (!g) continue;
        for (const p of g) {
          const hit = this._rayPrism(o, d, p, maxDist);
          if (hit && (!best || hit.dist < best.dist)) best = hit;
        }
      }
      if (best && best.dist < t - step) break; // can't be beaten by farther cells
    }
    return best;
  }
  _rayPrism(o, d, p, maxDist) {
    let best = null;
    const n = p.pts.length / 2;
    // walls
    for (let i = 0; i < n; i++) {
      const x1 = p.pts[i * 2], z1 = p.pts[i * 2 + 1];
      const x2 = p.pts[((i + 1) % n) * 2], z2 = p.pts[((i + 1) % n) * 2 + 1];
      const ex = x2 - x1, ez = z2 - z1;
      const denom = d.x * ez - d.z * ex;
      if (Math.abs(denom) < 1e-9) continue;
      const t = ((x1 - o.x) * ez - (z1 - o.z) * ex) / denom;
      if (t < 0.3 || t > maxDist) continue;
      const hx = o.x + d.x * t, hz = o.z + d.z * t;
      const s = Math.abs(ex) > Math.abs(ez) ? (hx - x1) / ex : (hz - z1) / ez;
      if (s < 0 || s > 1) continue;
      const hy = o.y + d.y * t;
      if (hy < p.y0 || hy > p.y1) continue;
      // outward normal (ring CCW -> outward is (ez,-ex) normalized... verify sign both ways)
      let nx = ez, nz = -ex;
      const L = Math.hypot(nx, nz) || 1;
      nx /= L; nz /= L;
      if (nx * d.x + nz * d.z > 0) { nx = -nx; nz = -nz; }
      if (!best || t < best.dist) best = { dist: t, point: { x: hx, y: hy, z: hz }, normal: { x: nx, y: 0, z: nz }, prism: p };
    }
    // roof plane
    if (d.y < -1e-6 && o.y > p.y1) {
      const t = (p.y1 - o.y) / d.y;
      if (t > 0.3 && t < maxDist) {
        const hx = o.x + d.x * t, hz = o.z + d.z * t;
        if (hx >= p.minX && hx <= p.maxX && hz >= p.minZ && hz <= p.maxZ && this._pointIn2D(hx, hz, p.pts)) {
          if (!best || t < best.dist) best = { dist: t, point: { x: hx, y: p.y1, z: hz }, normal: { x: 0, y: 1, z: 0 }, prism: p, roof: true };
        }
      }
    }
    return best;
  }
  // Capsule/circle resolve at position pos {x,y,z} radius r, height h (feet at pos.y). Mutates out {push:{x,z}, ground:number|null}
  resolve(pos, r, h) {
    const res = { pushX: 0, pushZ: 0, ground: null, wall: false };
    const cx = Math.floor(pos.x / CELL), cz = Math.floor(pos.z / CELL);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const g = this.grid.get(`${cx + dx}_${cz + dz}`);
      if (!g) continue;
      for (const p of g) {
        if (pos.x < p.minX - r || pos.x > p.maxX + r || pos.z < p.minZ - r || pos.z > p.maxZ + r) continue;
        const feet = pos.y, head = pos.y + h;
        if (feet > p.y1 + 0.01 || head < p.y0) {
          // roof stand check
          if (feet >= p.y1 - 2.4 && feet <= p.y1 + 2.6 && this._pointIn2D(pos.x, pos.z, p.pts)) {
            if (res.ground === null || p.y1 > res.ground) res.ground = p.y1;
          }
          continue;
        }
        const inside = this._pointIn2D(pos.x, pos.z, p.pts);
        // nearest edge
        let bd = 1e9, bnx = 0, bnz = 0;
        const n = p.pts.length / 2;
        for (let i = 0; i < n; i++) {
          const x1 = p.pts[i * 2], z1 = p.pts[i * 2 + 1];
          const x2 = p.pts[((i + 1) % n) * 2], z2 = p.pts[((i + 1) % n) * 2 + 1];
          const ex = x2 - x1, ez = z2 - z1;
          const L2 = ex * ex + ez * ez || 1e-9;
          let t = ((pos.x - x1) * ex + (pos.z - z1) * ez) / L2;
          t = Math.max(0, Math.min(1, t));
          const px = x1 + ex * t, pz = z1 + ez * t;
          const ddx = pos.x - px, ddz = pos.z - pz;
          const dd = Math.hypot(ddx, ddz);
          if (dd < bd) { bd = dd; if (dd > 1e-6) { bnx = ddx / dd; bnz = ddz / dd; } else { const L = Math.sqrt(L2); bnx = ez / L; bnz = -ex / L; } }
        }
        if (inside) {
          // landing on roof takes priority if close under top
          if (feet > p.y1 - 2.5) { if (res.ground === null || p.y1 > res.ground) res.ground = p.y1; continue; }
          res.pushX += bnx * (bd + r + 0.02); res.pushZ += bnz * (bd + r + 0.02); res.wall = true;
        } else if (bd < r) {
          res.pushX += bnx * (r - bd + 0.01); res.pushZ += bnz * (r - bd + 0.01); res.wall = true;
        }
      }
    }
    return res;
  }
}
export const COLLIDERS = new CityColliders();
