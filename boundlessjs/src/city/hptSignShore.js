// AR34 HPT: Gantry Plaza State Park's seawalls where the compiled city has none or a broken one (docs/notes/ar33-hpt.md; the
// lines and their sources in hptSignData.js SHORE_EDGES): in front of the Pepsi-Cola sign (QA Q31) and along the curved walkway
// south of the gantries' slip (QA Q39, LOOK 00:02).
//   * apply side (hptSign.js apply, before anything samples the ground): the tile's terrain grid refined to 4 m cells, exactly
//     (each new node on the drawn 16 m surface, the cells split on the same diagonal), then along each line the river side
//     pushed under the water (-9) and the land side lifted to the park's ground, so the water's edge is the line itself and
//     not the 16 m grid's stairs; the compiled bulkhead pieces near the lines and round the piers dropped (they stood loose in
//     the water); the piers' outline made river under its deck, away from the bulkhead (the piers stand on piles); the
//     boardwalks laid as the tile's paving, so the walkers, the furniture and the camera's ground stand on them.
//   * build side: the seawall (a concrete face from under the water to the deck, a timber fascia board, the dark wet band at
//     the water line), the boardwalk's timber deck and its railing (steel posts every 1.8 m, five rods, a timber cap rail).
import * as THREE from 'three';
import { Builder, rect, circle } from './hptSignSteel.js';
import { SHORE_EDGES, SHORE_PLATFORMS, PIER, PIER_COAST } from './hptSignData.js';
import { hmat } from './hptSignMats.js';
import { deckMaterial } from './hptSignPark.js';

const RES = 128;            // the refined grid: 4 m cells (the Central Park tiles' resolution)
const OUT = 0.6;            // the wall's face, this far out from the line (the grid's land->water crossing stays behind it)
// each line's segments: start, unit direction u, the land-side normal n = (-uz, ux)
const segsOf = (P) => {
  const out = [];
  for (let i = 0; i + 1 < P.length; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1], L = Math.hypot(bx - ax, bz - az);
    if (L < 0.05) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    out.push({ ax, az, bx, bz, L, ux, uz, nx: -uz, nz: ux });
  }
  return out;
};
const EDGES = SHORE_EDGES.map((E) => {
  const S = segsOf(E.line);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [x, z] of E.line) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { out: OUT, band: true, deck: true, lift: 23, rail2: false, ...E, S, box: [x0 - 26, z0 - 26, x1 + 26, z1 + 26] };
});
// the signed distance (land side positive) to the nearest segment whose span (with `margin` past its ends) holds the point
function sdist(S, x, z, margin) {
  let best = null;
  for (const s of S) {
    const dx = x - s.ax, dz = z - s.az, t = dx * s.ux + dz * s.uz;
    if (t < -margin || t > s.L + margin) continue;
    const tc = Math.max(0, Math.min(s.L, t)), dd = Math.hypot(x - (s.ax + s.ux * tc), z - (s.az + s.uz * tc));
    if (!best || dd < best.dd) best = { d: dx * s.nx + dz * s.nz, dd, t, s };
  }
  return best;
}
const inPoly = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { if ((P[i][1] > z) !== (P[j][1] > z) && x < ((P[j][0] - P[i][0]) * (z - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; } return c; };
const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
const pierEdgeDist = (x, z, coastOnly) => {
  let d = 1e9;
  for (let i = 0; i < PIER.length; i++) { if (coastOnly && !PIER_COAST.includes(i)) continue; d = Math.min(d, segDist(x, z, PIER[i], PIER[(i + 1) % PIER.length])); }
  return d;
};
let PBOX = null;
const pierBox = () => PBOX || (PBOX = PIER.reduce((b, [x, z]) => [Math.min(b[0], x), Math.min(b[1], z), Math.max(b[2], x), Math.max(b[3], z)], [1e9, 1e9, -1e9, -1e9]));
const hitBox = (b, ox, oz, m = 0) => ox < b[2] + m && ox + 512 > b[0] - m && oz < b[3] + m && oz + 512 > b[1] - m;
export const shoreTileHit = (ox, oz) => EDGES.some((E) => hitBox(E.box, ox, oz)) || hitBox(pierBox(), ox, oz, 8);

// the polygon of a line's boardwalk: the wall's face (OUT outside the line) to W inside, mitred at the joints
function stripPoly(E) {
  const P = E.line, S = E.S;
  const off = (dist) => P.map((p, i) => {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i)];
    let mx = a.nx + b.nx, mz = a.nz + b.nz; const m = Math.hypot(mx, mz) || 1; mx /= m; mz /= m;
    const c = Math.max(0.5, mx * b.nx + mz * b.nz);
    return [p[0] + (mx * dist) / c, p[1] + (mz * dist) / c];
  });
  return [...off(-E.out), ...off(E.W).reverse()];
}
const trisOf = (poly) => THREE.ShapeUtils.triangulateShape(poly.map(([x, z]) => new THREE.Vector2(x, z)), []).map(([a, b, c]) => [poly[a], poly[b], poly[c]]);
let _deckTris = null;
export function shoreDeckTris() {
  if (_deckTris) return _deckTris;
  _deckTris = [];
  for (const E of EDGES) { try { _deckTris.push(...trisOf(stripPoly(E))); } catch (e) { /* a degenerate strip is skipped */ } }
  for (const P of SHORE_PLATFORMS) { try { _deckTris.push(...trisOf(P)); } catch (e) { /* skipped */ } }
  return _deckTris;
}

// the tile's terrain grid on 4 m cells, the same surface: a new node on an old cell's edge or diagonal lies on it exactly
function refine(tile) {
  const R = tile.header.res;
  if (!(R > 0) || R >= RES || RES % R) return false;
  const n = R + 1, n2 = RES + 1, g = tile.S.terrain, k = RES / R, out = new Float32Array(n2 * n2);
  for (let j = 0; j < n2; j++) for (let i = 0; i < n2; i++) {
    const fx = i / k, fz = j / k, ci = Math.min(R - 1, Math.floor(fx)), cj = Math.min(R - 1, Math.floor(fz)), u = fx - ci, v = fz - cj;
    const y00 = g[cj * n + ci], y10 = g[cj * n + ci + 1], y01 = g[(cj + 1) * n + ci], y11 = g[(cj + 1) * n + ci + 1];
    out[j * n2 + i] = u >= v ? y00 + u * (y10 - y00) + v * (y11 - y10) : y00 + v * (y01 - y00) + u * (y11 - y01);
  }
  tile.S.terrain = out; tile.header.res = RES;
  return true;
}

// apply: returns a summary for the log, or null when the tile has none of it
export function shoreApply(tile, ox, oz) {
  if (!tile.S.terrain || !shoreTileHit(ox, oz)) return null;
  const edges = EDGES.filter((E) => hitBox(E.box, ox, oz));
  const pierHit = hitBox(pierBox(), ox, oz, 8);
  // the park's ground: the median of the land nodes (over 1.5 m) near the lines, as compiled
  const R0 = tile.header.res, n0 = R0 + 1, cw0 = 512 / R0, land = [];
  for (let j = 0; j <= R0; j++) for (let i = 0; i <= R0; i++) {
    const y = tile.S.terrain[j * n0 + i]; if (!(y > 1.5)) continue;
    const x = ox + i * cw0, z = oz + j * cw0;
    for (const E of edges) { const r = sdist(E.S, x, z, 2); if (r && r.dd < 30 && r.d > 0) { land.push(y); break; } }
  }
  land.sort((a, b) => a - b);
  const Yl = land.length ? land[land.length >> 1] : 3.2;
  // a tile the lines' boxes touch but none of whose compiled nodes is within reach of a line keeps its grid
  let near = pierHit;
  for (let j = 0; j <= R0 && !near; j++) for (let i = 0; i <= R0 && !near; i++) {
    for (const E of edges) { const r = sdist(E.S, ox + i * cw0, oz + j * cw0, 2); if (r && r.dd < 24 + cw0) { near = true; break; } }
  }
  if (!near) return null;
  const g0 = tile.S.terrain, res0 = tile.header.res;
  const refined = refine(tile);
  const R = tile.header.res, n = R + 1, cw = 512 / R, g = tile.S.terrain;
  let wet = 0, lifted = 0, sunk = 0;
  for (let j = 0; j <= R; j++) for (let i = 0; i <= R; i++) {
    const x = ox + i * cw, z = oz + j * cw, k = j * n + i;
    for (const E of edges) {
      const r = sdist(E.S, x, z, 2);
      if (!r || r.dd > 24) continue;
      if (r.d < 0) { if (r.d > -14 && g[k] > -9) { g[k] = -9; wet++; } }
      else if (E.band && r.d < 1.0) { if (g[k] > 0.4) { g[k] = 0.4; wet++; } }
      else if (r.d <= E.lift) { if (g[k] < Yl) { g[k] = Yl; lifted++; } }
      break;
    }
    // under the piers' deck the river, away from the bulkhead (the deck covers the slope)
    if (pierHit && g[k] > -9 && (inPoly(x, z, PIER) || pierEdgeDist(x, z, false) < 4.5) && pierEdgeDist(x, z, true) > 4.5) { g[k] = -9; sunk++; }
  }
  // nothing changed on the grid (1_7: its nodes near the north line are all river already): the compiled grid back
  if (refined && !wet && !lifted && !sunk) { tile.S.terrain = g0; tile.header.res = res0; }
  // the compiled bulkhead's pieces near the lines and round the piers
  let dropped = 0;
  const cb = tile.S.curb;
  if (cb && cb.length) {
    const keep = [];
    for (let o = 0; o + 8 < cb.length; o += 9) {
      const cx = (cb[o] + cb[o + 3] + cb[o + 6]) / 3 + ox, cz = (cb[o + 2] + cb[o + 5] + cb[o + 8]) / 3 + oz;
      let drop = false;
      for (const E of edges) { const r = sdist(E.S, cx, cz, 3); if (r && r.dd < 7 && r.d > -6 && r.d < 3) { drop = true; break; } }
      if (!drop && pierHit && Math.min(cb[o + 1], cb[o + 4], cb[o + 7]) < 1.0 && (inPoly(cx, cz, PIER) || pierEdgeDist(cx, cz, false) < 6)) drop = true;
      if (drop) { dropped++; continue; }
      for (let q = 0; q < 9; q++) keep.push(cb[o + q]);
    }
    if (dropped) tile.S.curb = Float32Array.from(keep);
  }
  if (!wet && !lifted && !sunk && !dropped) return null;
  return { refined: tile.header.res !== res0, Yl: +Yl.toFixed(2), wet, lifted, sunk, dropped };
}

// ---------------------------------------------------------------- build
let _M = null;
function mats() {
  if (_M) return _M;
  const wet = new THREE.MeshStandardMaterial({ color: 0x23271d, roughness: 0.55, metalness: 0.0 });
  return (_M = { wall: hmat('concreteDark'), timber: hmat('timber'), rail: hmat('railSteel'), wood: hmat('wood'), wet });
}
const mk = (geo, mat, name, cast = true) => { const m = new THREE.Mesh(geo, mat); m.name = 'ar34h:shore:' + name; m.castShadow = cast; m.receiveShadow = true; return m; };
// a section in the line's frame: [inland distance, height over the deck]; the Builder's section x points to the river
const sec = (pts) => pts.map(([d, y]) => [-d, y]);
export function shoreGeo(E, yTop) {
  const wall = new Builder(), fascia = new Builder(), wetB = new Builder(), rail = new Builder(), cap = new Builder(), OUT = E.out;
  const WALL = sec([[-OUT, -0.36], [-OUT, -(yTop + 2.6)], [0.5, -(yTop + 2.6)], [0.5, -0.36]]);
  const BOARD = sec([[-OUT - 0.07, 0.03], [-OUT - 0.07, -0.38], [-OUT + 0.02, -0.38], [-OUT + 0.02, 0.03]]);
  const WET = sec([[-OUT - 0.01, -(yTop + 0.35)], [-OUT - 0.01, -(yTop - 0.55)], [-OUT + 0.05, -(yTop - 0.55)], [-OUT + 0.05, -(yTop + 0.35)]]);
  const RD = -OUT + 0.28, H = 1.07;                       // the railing's line, 0.28 m in from the face; the 42 in guard height
  // a strip with water on both sides (rail2): a fascia board and a railing along its inner edge too
  const BOARD2 = sec([[E.W - 0.02, 0.03], [E.W - 0.02, -0.38], [E.W + 0.07, -0.38], [E.W + 0.07, 0.03]]);
  const lines = E.rail2 ? [RD, E.W - 0.28] : [RD];
  for (const s of E.S) {
    // each segment run 0.35 m past its ends so the joints close
    const e = 0.35, A = [s.ax - s.ux * e, yTop, s.az - s.uz * e], B = [s.bx + s.ux * e, yTop, s.bz + s.uz * e];
    wall.member(WALL, A, B, [0, 1, 0]);
    fascia.member(BOARD, A, B, [0, 1, 0]);
    wetB.member(WET, A, B, [0, 1, 0]);
    if (E.rail2) fascia.member(BOARD2, A, B, [0, 1, 0]);
    for (const rd of lines) {
    const ra = [s.ax + s.nx * rd, yTop, s.az + s.nz * rd], rb = [s.bx + s.nx * rd, yTop, s.bz + s.nz * rd];
    cap.member(rect(0.14, 0.05), [ra[0], yTop + H + 0.025, ra[2]], [rb[0], yTop + H + 0.025, rb[2]], [0, 1, 0]);
    for (const f of [0.12, 0.3, 0.48, 0.66, 0.84]) rail.member(circle(0.007, 5), [ra[0], yTop + H * f, ra[2]], [rb[0], yTop + H * f, rb[2]], [0, 1, 0], { smooth: true, caps: false });
    rail.member(rect(0.06, 0.012), [ra[0], yTop + H - 0.01, ra[2]], [rb[0], yTop + H - 0.01, rb[2]], [0, 1, 0]);
    const nPost = Math.max(1, Math.round(s.L / 1.8));
    for (let k = 0; k <= nPost; k++) {
      const t = k / nPost, px = ra[0] + (rb[0] - ra[0]) * t, pz = ra[2] + (rb[2] - ra[2]) * t;
      rail.member(rect(0.05, 0.014), [px, yTop, pz], [px, yTop + H, pz], [s.ux, 0, s.uz]);
    }
    }
  }
  return { wall, fascia, wetB, rail, cap };
}
// a line's timber deck (2 cm over the paving apply() lays; the riverwalk with its platforms), boards across the line
function deckGeo(E, yTop, platforms) {
  const pos = [], nor = [], uv = [], T = 2.96;
  let best = E.S[0]; for (const s of E.S) if (s.L > best.L) best = s;
  const ax = best.ux, az = best.uz;
  const put = (tri) => {
    const [A, B0, C0] = tri;
    const ny = (B0[1] - A[1]) * (C0[0] - A[0]) - (B0[0] - A[0]) * (C0[1] - A[1]);
    const [B, C] = ny >= 0 ? [B0, C0] : [C0, B0];
    for (const [x, z] of [A, B, C]) { pos.push(x, yTop + 0.02, z); nor.push(0, 1, 0); uv.push((-x * az + z * ax) / T, (x * ax + z * az) / T); }
  };
  try { for (const t of trisOf(stripPoly(E))) put(t); } catch (e) { /* skipped */ }
  for (const P of platforms) { try { for (const t of trisOf(P)) put(t); } catch (e) { /* skipped */ } }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
// each line is built with the tile that holds its first point (world coordinates; one group per line)
export function buildShore(group, ctx, yTop) {
  const M = mats();
  let tris = 0;
  const own = (x, z) => x >= ctx.ox && x < ctx.ox + 512 && z >= ctx.oz && z < ctx.oz + 512;
  EDGES.forEach((E, ei) => {
    if (!own(E.line[0][0], E.line[0][1])) return;
    const g = shoreGeo(E, yTop), out = new THREE.Group(); out.name = 'ar34h:shore:' + E.name;
    out.add(mk(g.wall.geometry(), M.wall, 'wall', false));
    out.add(mk(g.fascia.geometry(), M.timber, 'fascia', false));
    out.add(mk(g.wetB.geometry(), M.wet, 'wet', false));
    out.add(mk(g.rail.geometry(), M.rail, 'rail'));
    out.add(mk(g.cap.geometry(), M.wood, 'cap'));
    tris += g.wall.tris + g.fascia.tris + g.wetB.tris + g.rail.tris + g.cap.tris;
    if (E.deck) {
      const d = new THREE.Mesh(deckGeo(E, yTop, ei === 0 ? SHORE_PLATFORMS : []), deckMaterial());
      d.name = 'ar34h:shore:deck'; d.receiveShadow = true; d.castShadow = false;
      out.add(d);
      tris += d.geometry.getAttribute('position').count / 3;
    }
    group.add(out);
  });
  return tris;
}
// walks for the walkers along each boardwalk, down its middle (the coping-only edge has none: the walkers keep off the lawns)
export function shorePromenades(y) {
  const out = [];
  for (const E of EDGES) {
    if (!E.deck) continue;
    const pts = [], m = E.W / 2;
    for (const s of E.S) for (let t = 0; t < s.L; t += 8) pts.push([s.ax + s.ux * t + s.nx * m, y, s.az + s.uz * t + s.nz * m]);
    const s = E.S[E.S.length - 1]; pts.push([s.bx + s.nx * m, y, s.bz + s.nz * m]);
    // AR34 b5: footfall 0.35 (was 3): the 150 m boardwalks drew most of the park's walkers (sim/peds.js weighs length x busy), where
    if (pts.length > 1) out.push({ pts, busy: 0.35 });
  }
  return out;
}
