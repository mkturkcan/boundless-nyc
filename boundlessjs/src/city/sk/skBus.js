// AR34 sk: the red bus lanes of 125th Street where the compiled ground lays them at the kerb. From Morningside Avenue to
// Adam Clayton Powell Jr Boulevard and from Third to Second Avenue the compiled `busred` covers the kerb lane (|b| 5.34-8.70 m
// from the corridor centreline, gutter at 8.70-9.05), where the street really parks; from Adam Clayton Powell to Third Avenue
// it lies one parking lane out (|b| 3.34-6.70, measured on the tiles 2026-10-01, docs/notes/ar33-street.md).
// Morningside to Adam Clayton Powell parks at both kerbs with the red lane one lane out between two solid lines; from Third to Second the westbound kerb parks with no red, while the
// eastbound kerb really has its red lane at the kerb (2026-08).
// repaintBus re-kinds the tile's sections before anything samples or draws them (the same hook as city/tsqPlaza.js): the
// kerbside red becomes asphalt, the red lane and its markings (the inner solid line, the BUS ONLY legends) move one parking
// lane out (2.00 m) on an `offset` side and are dropped on a `none` side, the dashed lane line under the moved red goes;
// a 'strip' side of a block whose red is already one lane out loses it (Park-Lexington eastbound, repaved 2026), and a
// side's red can start later than the block's (S0: the St Nicholas eastbound stop).
// Everything that reads the sections afterwards (the ground mesh and its shader, surfaceInfo for the car and ped sims, this
// part's own covers, wear and repairs) sees the repainted street; there is no overlay to z-fight. `?skbus=0` keeps the
// compiled paint. Removed again once the compiler offsets these lanes itself (the lead's recompile after AR34). Pure (no
// three, no DOM): the sim and the node probes import it (SK_BUSLANES, skBusAt).
import { LINE, clipRect, subtractRect, polyArea, clipHalf } from './skGeom.js';

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
// on unless `?sk=0` (the whole part) or `?skbus=0`
export const SK_BUS_ON = !(Q && (Q.get('sk') === '0' || Q.get('skbus') === '0'));

export const SK_BUS_SHIFT = 2.0;   // m toward the centreline: the compiled red's 5.34-8.70 onto the 3.34-6.70 it has east of ACP
// the repainted blocks: corridor stations s0..s1 (the compiled red's own extent on both sides, measured), what is done on each
// side (N, S: 'offset' = the red one parking lane out, 'none' = no bus lane, 'keep' = the compiled kerbside red is right),
export const SK_BUS_BLOCKS = [
  { name: 'Morningside Av - St Nicholas Av', s0: 1040.1, s1: 1138.0, N: 'offset', S: 'offset' },
  { name: 'St Nicholas Av - Frederick Douglass Blvd', s0: 1177.3, s1: 1275.1, N: 'offset', S: 'offset', S0: 1217.0 },
  { name: 'Frederick Douglass Blvd - Adam Clayton Powell Jr Blvd', s0: 1314.4, s1: 1543.8, N: 'offset', S: 'offset' },
  { name: 'Third Av - Second Av', s0: 2796.3, s1: 2971.4, N: 'none', S: 'keep' },
  { name: 'Park Av - Lexington Av', s0: 2492.5, s1: 2604.4, N: 'keep', S: 'strip', aLayout: true },
];
// compiled cross-section on these blocks (|b|, m): kerb face ~9.05, gutter 8.70-9.05, parking line 6.60-6.80
const OLD = [5.05, 8.9], PARK_LINE = [6.45, 6.95], LANE_LINE = [3.05, 3.55];
// 'strip' on a block whose compiled red already lies one lane out (aLayout): that red (|b| 3.34-6.70) goes, the lines stay
const STRIP = [3.0, 7.0];

// the corridor frame at a world point: station s, offset b (south +) and the unit direction of the nearest segment
const SEG = [];
{
  let s = 0;
  for (let i = 1; i < LINE.length; i++) {
    const [x0, z0] = LINE[i - 1], [x1, z1] = LINE[i], L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 1e-6) continue;
    SEG.push([x0, z0, (x1 - x0) / L, (z1 - z0) / L, L, s]);
    s += L;
  }
}
function frameAt(x, z, segs = SEG) {
  let best = null, bd = 40;
  for (const [x0, z0, ux, uz, L, s0] of segs) {
    const dx = x - x0, dz = z - z0, t = dx * ux + dz * uz;
    if (t < -2 || t > L + 2) continue;
    const b = dx * -uz + dz * ux;
    if (Math.abs(b) < bd) { bd = Math.abs(b); best = { s: s0 + Math.max(0, Math.min(L, t)), b, ux, uz }; }
  }
  return best;
}
function pointAt(s) {
  for (const [x0, z0, ux, uz, L, s0] of SEG) if (s >= s0 && s <= s0 + L) return [x0 + ux * (s - s0), z0 + uz * (s - s0)];
  return null;
}
const frameAtSeg = (x, z, segs) => frameAt(x, z, segs);
const blockAt = (s) => SK_BUS_BLOCKS.find((k) => s >= k.s0 - 0.5 && s <= k.s1 + 0.5) || null;
const modeOf = (k, b) => (b > 0 ? k.S : k.N);

// For the vehicle sim (sim/traffic.js imports it read-only): per repainted block and side, the red lane and the kerb lane as
// offsets from the corridor centreline (null red: no bus lane there), the block's ends on the centreline (world x, z).
// 'keep': the compiled red stays (at the kerb, 5.34-8.70 with no parking lane; or one lane out on an aLayout block);
// 'strip': no red; s0 is the side's own start (S0 / N0) where its red starts later than the block's.
export const SK_BUSLANES = SK_BUS_BLOCKS.flatMap((k) => ['N', 'S'].map((side) => ({
  name: k.name, s0: (side === 'S' ? k.S0 : k.N0) ?? k.s0, s1: k.s1, side, mode: k[side],
  red: k[side] === 'offset' || (k[side] === 'keep' && k.aLayout) ? [8.70 - 3.36 - SK_BUS_SHIFT, 8.70 - SK_BUS_SHIFT] : k[side] === 'keep' ? [5.34, 8.70] : null,   // [3.34, 6.70]
  kerbLane: k[side] === 'keep' && !k.aLayout ? null : [6.70, 9.05],
  a: pointAt(k.s0), b: pointAt(k.s1),
})));
// what the repaint made of a world point: { s, b, side, kind: 'red' | 'kerb' | 'lane', block } on a repainted block, else null
export function skBusAt(x, z) {
  if (!SK_BUS_ON) return null;
  const f = frameAt(x, z); if (!f) return null;
  const k = blockAt(f.s); if (!k) return null;
  const ab = Math.abs(f.b), side = f.b > 0 ? 'S' : 'N', md0 = k[side];
  const md = md0 === 'offset' && f.s < bandS0(k, side === 'S' ? 1 : -1) ? 'none' : md0;   // before a side's red starts
  const kind = md === 'keep' && !k.aLayout ? (ab >= 5.34 && ab <= 9.05 ? 'red' : 'lane')
    : ab >= 6.70 && ab <= 9.05 ? 'kerb' : (md === 'offset' || md === 'keep') && ab >= 3.34 && ab < 6.70 ? 'red' : 'lane';
  return { s: f.s, b: f.b, side, kind, block: k.name };
}

// world boxes of the blocks (+ margin), for the tile test
const boxOf = (s0, s1, m = 14) => {
  const p = pointAt(s0), q = pointAt(s1);
  return [Math.min(p[0], q[0]) - m, Math.min(p[1], q[1]) - m, Math.max(p[0], q[0]) + m, Math.max(p[1], q[1]) + m];
};
const BOXES = SK_BUS_BLOCKS.map((k) => boxOf(k.s0, k.s1));
// the blocks whose compiled red already lies one lane out (ACP-Lenox, Lenox-Fifth, Fifth-Third: its extent, measured): only
// their inner line and their legends' windows are touched. The red lane's inner edge line is a wide solid line on 125th (b2_mid 2024-08, ms23_n 2023-08:
// about twice the parking line's width; NYC DOT bus lanes use 8 in = 0.20 m); the compiled one is 0.10 m. Both the moved
// lines and these get the other 0.10 m on their traffic side.
const A_RANGES = [[1594.9, 1822.4], [1866.2, 2136.9], [2170.0, 2753.9]];
const ABOXES = A_RANGES.map(([a, b]) => boxOf(a, b));
const inA = (s) => A_RANGES.some(([a, b]) => s >= a - 0.5 && s <= b + 0.5);
const WIDEN = 0.10;
// moved ds metres along it (same orientation): [block name, side (+1 south), copied from s0..s1, ds, source]
const ADD_LEGENDS = [
  ['St Nicholas Av - Frederick Douglass Blvd', 1, 1247.0, 1254.0, -26.3,
    'BUS ONLY on its windows in the eastbound red at s ~1221-1229'],
];

// blocks only): a copy of a compiled word of the same block and side, moved ds metres along the corridor, laid after the
// source].
// eastbound red; the compiled words copied are the block's pair at 2056.1-2058.7 (BUS) and 2060.1-2062.6 (ONLY), same tile.
const ADD_WORDS = [
  [1, 2055.9, 2058.9, 3.3, 6.75, -46.9, 'BUS'],
  [1, 2059.8, 2062.9, 3.3, 6.75, -44.7, 'ONLY'],
];
export function addWords(tile, ox, oz) {
  const st = { words: 0, tris: 0 };
  if (!SK_BUS_ON || !tile || !tile.S || !tile.S.paintW) return st;
  const a = tile.S.paintW, n = Math.floor(a.length / 9), add = [];
  for (const [sg, s0, s1, b0, b1, ds] of ADD_WORDS) {
    const p = pointAt((s0 + s1) / 2), q = pointAt((s0 + s1) / 2 + ds);
    if (!p || !q || p[0] < ox || p[0] >= ox + 512 || p[1] < oz || p[1] >= oz + 512) continue;
    const dx = q[0] - p[0], dz = q[1] - p[1];
    let k = 0;
    for (let t = 0; t < n; t++) {
      const x = (a[t * 9] + a[t * 9 + 3] + a[t * 9 + 6]) / 3 + ox, z = (a[t * 9 + 2] + a[t * 9 + 5] + a[t * 9 + 8]) / 3 + oz;
      if (Math.abs(x - p[0]) > 8 || Math.abs(z - p[1]) > 8) continue;
      const f = frameAt(x, z); if (!f || f.s < s0 || f.s > s1 || Math.sign(f.b) !== sg || Math.abs(f.b) < b0 || Math.abs(f.b) > b1) continue;
      let L = 0; for (let v = 0; v < 3; v++) { const w = (v + 1) % 3; L = Math.max(L, Math.hypot(a[t * 9 + v * 3] - a[t * 9 + w * 3], a[t * 9 + v * 3 + 2] - a[t * 9 + w * 3 + 2])); }
      if (L > 3) continue;   // the lines through the window are long strips; a word's glyphs are short triangles
      for (let v = 0; v < 3; v++) add.push(a[t * 9 + v * 3] + dx, a[t * 9 + v * 3 + 1], a[t * 9 + v * 3 + 2] + dz);
      k++;
    }
    if (k) { st.words++; st.tris += k; }
  }
  if (add.length) { const out = new Float32Array(a.length + add.length); out.set(a); out.set(add, a.length); tile.S.paintW = out; }
  return st;
}

// the legend words' windows over the red, found by legendWindows on every corridor tile with the code above (2026-10-02, the
// compiled tiles of the wave): { sg (+1 south), s0, s1 (stations), b0, b1 (|b| of the letters), lo, hi (the red band) }
// (2026-10-02 04:29: the eastbound pair at s 1444.32-1446.85 / 1448.26-1450.79 taken out with its legend, skFix DROP_LEGENDS)
const LEGEND_WINDOWS = [
  { sg: -1, s0: 1061.57, s1: 1064.09, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1065.51, s1: 1068.03, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1121.57, s1: 1124.09, b0: 3.55, b1: 6.5, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1125.51, s1: 1128.03, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1198.65, s1: 1201.17, b0: 3.55, b1: 6.5, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1202.59, s1: 1205.11, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1258.65, s1: 1261.17, b0: 3.55, b1: 6.5, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1262.59, s1: 1265.11, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1347.38, s1: 1349.91, b0: 3.54, b1: 6.5, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1351.32, s1: 1353.85, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1407.38, s1: 1409.91, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1411.32, s1: 1413.85, b0: 3.95, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1467.38, s1: 1469.91, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1471.32, s1: 1473.85, b0: 3.95, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1527.38, s1: 1529.91, b0: 3.54, b1: 6.5, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1531.32, s1: 1533.85, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1625.93, s1: 1628.46, b0: 3.54, b1: 6.5, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1629.87, s1: 1632.4, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1685.93, s1: 1688.46, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1689.87, s1: 1692.4, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1745.93, s1: 1748.46, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1749.87, s1: 1752.4, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1805.93, s1: 1808.46, b0: 3.54, b1: 6.5, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1809.87, s1: 1812.4, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1880.45, s1: 1882.98, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1884.39, s1: 1886.92, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1940.45, s1: 1942.98, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 1944.39, s1: 1946.92, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 2000.45, s1: 2002.98, b0: 3.54, b1: 6.5, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 2004.39, s1: 2006.92, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 2060.45, s1: 2062.98, b0: 3.54, b1: 6.5, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 2064.39, s1: 2066.92, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 2120.45, s1: 2122.98, b0: 3.54, b1: 6.5, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 2124.39, s1: 2126.92, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 2213.92, s1: 2216.44, b0: 3.54, b1: 6.5, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 2217.86, s1: 2220.38, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 2273.92, s1: 2276.44, b0: 3.54, b1: 6.5, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 2277.86, s1: 2280.38, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 2358.39, s1: 2360.92, b0: 3.54, b1: 6.5, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 2362.33, s1: 2364.86, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 2418.39, s1: 2420.92, b0: 3.54, b1: 6.5, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 2422.33, s1: 2424.86, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 2527.88, s1: 2530.4, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 2531.82, s1: 2534.35, b0: 3.95, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 2587.88, s1: 2590.4, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 2591.82, s1: 2594.34, b0: 3.95, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 2677.51, s1: 2680.03, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 2681.45, s1: 2683.97, b0: 3.95, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 2737.51, s1: 2740.03, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: -1, s0: 2741.45, s1: 2743.97, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1050.07, s1: 1052.59, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1054.01, s1: 1056.53, b0: 3.55, b1: 6.5, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1110.07, s1: 1112.59, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1114.01, s1: 1116.53, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1220.97, s1: 1223.49, b0: 3.95, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1224.91, s1: 1227.43, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1247.27, s1: 1249.79, b0: 3.95, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1251.21, s1: 1253.73, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1324.32, s1: 1326.85, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1328.26, s1: 1330.79, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1384.32, s1: 1386.85, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1388.26, s1: 1390.79, b0: 3.55, b1: 6.5, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1504.32, s1: 1506.85, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1508.26, s1: 1510.79, b0: 3.54, b1: 6.5, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1604.88, s1: 1607.41, b0: 3.95, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1608.82, s1: 1611.35, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1664.88, s1: 1667.41, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1668.82, s1: 1671.35, b0: 3.54, b1: 6.5, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1724.88, s1: 1727.41, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1728.82, s1: 1731.35, b0: 3.54, b1: 6.5, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1784.88, s1: 1787.41, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1788.82, s1: 1791.35, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1876.13, s1: 1878.66, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1880.07, s1: 1882.6, b0: 3.54, b1: 6.5, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1936.13, s1: 1938.66, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1940.07, s1: 1942.6, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 1996.13, s1: 1998.66, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 2056.13, s1: 2058.66, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 2060.07, s1: 2062.6, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 2116.13, s1: 2118.66, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 2120.07, s1: 2122.6, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 2179.98, s1: 2182.5, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 2183.92, s1: 2186.44, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 2239.98, s1: 2242.5, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 2243.92, s1: 2246.44, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 2337.73, s1: 2340.25, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 2341.67, s1: 2344.19, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 2397.73, s1: 2400.25, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 2401.67, s1: 2404.19, b0: 3.54, b1: 6.49, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 2646.79, s1: 2649.31, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 2650.73, s1: 2653.25, b0: 3.55, b1: 6.5, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 2706.79, s1: 2709.31, b0: 3.96, b1: 6.08, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 2710.73, s1: 2713.25, b0: 3.55, b1: 6.5, lo: 3.34, hi: 6.7 },
  { sg: 1, s0: 2806.21, s1: 2808.74, b0: 5.96, b1: 8.08, lo: 5.34, hi: 8.7 },
  { sg: 1, s0: 2810.15, s1: 2812.68, b0: 5.54, b1: 8.5, lo: 5.34, hi: 8.7 },
  { sg: 1, s0: 2866.21, s1: 2868.74, b0: 5.96, b1: 8.08, lo: 5.34, hi: 8.7 },
  { sg: 1, s0: 2870.15, s1: 2872.68, b0: 5.54, b1: 8.5, lo: 5.34, hi: 8.7 },
  { sg: 1, s0: 2926.21, s1: 2928.74, b0: 5.96, b1: 8.08, lo: 5.34, hi: 8.7 },
  { sg: 1, s0: 2930.15, s1: 2932.68, b0: 5.54, b1: 8.49, lo: 5.34, hi: 8.7 },
];

// one straight frame per block (its corridor segment at mid-block; the Frederick Douglass - ACP kink turns 0.008 deg, 1 mm
// over the lane band), so every cut in a block lies on the same lines
const RED_NEW = [8.70 - 3.36 - SK_BUS_SHIFT, 8.70 - SK_BUS_SHIFT];   // [3.34, 6.70]
for (const k of SK_BUS_BLOCKS) {
  const sm = (k.s0 + k.s1) / 2, P = pointAt(sm), seg = SEG.find(([, , , , L, s0]) => sm >= s0 && sm <= s0 + L);
  k.F = { x: P[0], z: P[1], ux: seg[2], uz: seg[3], sm };
}
const fS = (F, p) => F.sm + (p[0] - F.x) * F.ux + (p[2] - F.z) * F.uz;
const fB = (F, p) => (p[0] - F.x) * -F.uz + (p[2] - F.z) * F.ux;
const triW = (a, o, ox, oz) => [[a[o] + ox, a[o + 1], a[o + 2] + oz], [a[o + 3] + ox, a[o + 4], a[o + 5] + oz], [a[o + 6] + ox, a[o + 7], a[o + 8] + oz]];
// a convex world polygon fanned into tile-local triangles in its own winding (the clips keep the source's order)
function emit(P, out, ox, oz) {
  for (let i = 1; i + 1 < P.length; i++) {
    const A = P[0], B = P[i], C = P[i + 1];
    if (Math.abs((B[0] - A[0]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[0] - A[0])) < 2e-6) continue;
    out.push(A[0] - ox, A[1], A[2] - oz, B[0] - ox, B[1], B[2] - oz, C[0] - ox, C[1], C[2] - oz);
  }
}
// a side's band can start later than the block's red (S0 / N0: the red there goes, as at a bus stop)
const bandS0 = (k, sg) => (sg > 0 ? k.S0 : k.N0) ?? k.s0;
const overlapsBand = (T, k, sg) => {
  let s0 = 1e9, s1 = -1e9, b0 = 1e9, b1 = -1e9;
  for (const p of T) { const s = fS(k.F, p), b = sg * fB(k.F, p); s0 = Math.min(s0, s); s1 = Math.max(s1, s); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
  return s1 > bandS0(k, sg) && s0 < k.s1 && b1 > RED_NEW[0] && b0 < RED_NEW[1];
};
function splitBand(T, k, sg, inside, outside, ox, oz) {
  const fa = (p) => fS(k.F, p), fb = (p) => sg * fB(k.F, p);
  const a0 = bandS0(k, sg), inn = clipRect(T, fa, fb, a0, k.s1, RED_NEW[0], RED_NEW[1]);
  if (inn.length > 2) emit(inn, inside, ox, oz);
  for (const P of subtractRect(T, fa, fb, a0, k.s1, RED_NEW[0], RED_NEW[1])) emit(P, outside, ox, oz);
}

// Re-kinds the tile's busred / asphalt / paintW (tile-local triangle lists) on the repainted blocks; returns counts
export function repaintBus(tile, ox, oz) {
  const st = { red: 0, moved: 0, asphCut: 0, paintMoved: 0, paintDropped: 0 };
  if (!SK_BUS_ON || !tile || !tile.S) return st;
  const hitT = (B) => ox < B[2] && ox + 512 > B[0] && oz < B[3] && oz + 512 > B[1];
  if (!BOXES.some(hitT) && !ABOXES.some(hitT)) return st;
  // only the corridor segments near this tile (sections run a little past its square): the frame of every paint vertex costs
  // 2-4 segment tests instead of 44
  const segs = SEG.filter(([x0, z0, ux, uz, L]) => Math.max(x0, x0 + ux * L) > ox - 60 && Math.min(x0, x0 + ux * L) < ox + 572 && Math.max(z0, z0 + uz * L) > oz - 60 && Math.min(z0, z0 + uz * L) < oz + 572);
  const frameAt = (x, z) => frameAtSeg(x, z, segs);
  // The roadway. No two road triangles may overlap: world/gpKerbWorker.js (GP32) strips the kerb frame from every coplanar
  // overlap of asphalt / gutter / bus lane, and a lane without its frame draws in the block-mask fallback, where the red
  // read grey (b1_a/sn26_n: the first version translated the red over the asphalt). So the red is re-kinded in place: inside
  // the new lane's band (|b| 3.34-6.70 over the block's red extent) asphalt and old red become busred, outside it the old
  // red becomes asphalt, every triangle cut at the band's edges (the compiled asphalt has holes under the red, measured).
  const red = tile.S.busred;
  if (red && red.length >= 9) {
    const keepRed = [], toAsph = [], toRed = [], bands = [];
    for (let o = 0; o + 8 < red.length; o += 9) {
      const T = triW(red, o, ox, oz), cx = (T[0][0] + T[1][0] + T[2][0]) / 3, cz = (T[0][2] + T[1][2] + T[2][2]) / 3;
      const f = frameAt(cx, cz), k = f && blockAt(f.s);
      const b = k ? fB(k.F, [cx, 0, cz]) : 0;
      const md = k ? modeOf(k, b) : 'keep', band = md === 'strip' ? STRIP : OLD;
      if (!k || md === 'keep' || Math.abs(b) < band[0] || Math.abs(b) > band[1]) { for (let i = 0; i < 9; i++) keepRed.push(red[o + i]); continue; }
      st.red++;
      if (md !== 'offset') { emit(T, toAsph, ox, oz); continue; }
      const sg = b > 0 ? 1 : -1;
      if (!bands.some((q) => q.k === k && q.sg === sg)) bands.push({ k, sg });
      splitBand(T, k, sg, toRed, toAsph, ox, oz);
    }
    if (st.red) {
      // the asphalt inside the new bands (the old travel lane's outer 2 m) goes red too
      const asp = tile.S.asphalt, keepA = [];
      if (asp) for (let o = 0; o + 8 < asp.length; o += 9) {
        const T = triW(asp, o, ox, oz);
        const hit = bands.filter(({ k, sg }) => overlapsBand(T, k, sg));
        if (!hit.length) { for (let i = 0; i < 9; i++) keepA.push(asp[o + i]); continue; }
        let pieces = [T];
        for (const { k, sg } of hit) {
          const next = [];
          for (const P of pieces) {
            const fa = (p) => fS(k.F, p), fb = (p) => sg * fB(k.F, p);
            const a0 = bandS0(k, sg), inn = clipRect(P, fa, fb, a0, k.s1, RED_NEW[0], RED_NEW[1]);
            if (inn.length > 2 && Math.abs(polyArea(inn, 0, 2)) > 1e-4) { emit(inn, toRed, ox, oz); next.push(...subtractRect(P, fa, fb, a0, k.s1, RED_NEW[0], RED_NEW[1])); }
            else next.push(P);
          }
          pieces = next;
        }
        for (const P of pieces) emit(P, keepA, ox, oz);
        st.asphCut++;
      }
      tile.S.busred = Float32Array.from(keepRed.concat(toRed));
      tile.S.asphalt = Float32Array.from(keepA.concat(toAsph));
      st.moved = toRed.length / 9;
    }
  }
  // the white markings: grouped into pieces (shared corners) so a legend moves whole
  const wins = [];   // the legends' dark windows: { sg, s0, s1, b0, b1, lo, hi } (|b| after any move; lo-hi: the red band)
  const pw = tile.S.paintW;
  if (pw && pw.length >= 9) {
    const n = Math.floor(pw.length / 9), par = new Int32Array(n);
    for (let i = 0; i < n; i++) par[i] = i;
    const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    // only the paint over the blocks (a legend lies well inside its block's box): the tile's other 90 % is left alone
    const near = new Uint8Array(n);
    for (let t = 0; t < n; t++) {
      const x = (pw[t * 9] + pw[t * 9 + 3] + pw[t * 9 + 6]) / 3 + ox, z = (pw[t * 9 + 2] + pw[t * 9 + 5] + pw[t * 9 + 8]) / 3 + oz;
      near[t] = BOXES.some((B) => x > B[0] && x < B[2] && z > B[1] && z < B[3]) || ABOXES.some((B) => x > B[0] && x < B[2] && z > B[1] && z < B[3]) ? 1 : 0;
    }
    const vmap = new Map();
    for (let t = 0; t < n; t++) if (near[t]) for (let v = 0; v < 3; v++) {
      const o = t * 9 + v * 3, key = Math.round(pw[o] * 100) + ',' + Math.round(pw[o + 2] * 100);
      const u = vmap.get(key);
      if (u === undefined) vmap.set(key, t); else { const a = find(t), b = find(u); if (a !== b) par[a] = b; }
    }
    const groups = new Map();
    for (let t = 0; t < n; t++) if (near[t]) { const r = find(t); let g = groups.get(r); if (!g) groups.set(r, (g = [])); g.push(t); }
    const verdict = new Int8Array(n);   // 0 keep, 1 move, 2 drop
    const shift = new Map(), widen = new Map();   // widen: triangle -> { mid |b|, inward step [dx, dz] }
    const copies = [];   // [triangles, [dx, dz]]: ADD_LEGENDS
    const cutFrom = new Map();   // triangle -> station: the part before it is dropped (after the move)
    let changed = false;
    for (const g of groups.values()) {
      let s = 0, bmin = 1e9, bmax = -1e9, smin = 1e9, smax = -1e9, sides = 0, cnt = 0, f0 = null, bad = false;
      for (const t of g) for (let v = 0; v < 3; v++) {
        const o = t * 9 + v * 3, f = frameAt(pw[o] + ox, pw[o + 2] + oz);
        if (!f) { bad = true; break; }
        s += f.s; cnt++; f0 = f0 || f; smin = Math.min(smin, f.s); smax = Math.max(smax, f.s);
        const ab = Math.abs(f.b); bmin = Math.min(bmin, ab); bmax = Math.max(bmax, ab); sides |= f.b > 0 ? 1 : 2;
      }
      if (bad || !cnt || sides === 3) continue;
      // a legend letter: 0.8-3.5 m along the lane (the compiled ones about 2.9 m), wider than a line (an L or a Y can be a few
      // triangles, so the triangle count does not tell)
      const letter = smax - smin >= 0.8 && smax - smin <= 3.5 && bmax - bmin >= 0.12, sgw = f0.b > 0 ? 1 : -1;
      const k0 = blockAt(s / cnt), thinInner = (lo, hi) => bmin >= lo && bmax <= hi && bmax - bmin < 0.25;
      // a kept side of a block whose compiled red is already one lane out is handled like the other such blocks
      const k = k0 && !(k0.aLayout && modeOf(k0, f0.b) === 'keep') ? k0 : null;
      const inward = [(f0.b > 0 ? 1 : -1) * f0.uz * WIDEN, (f0.b > 0 ? -1 : 1) * f0.ux * WIDEN];   // toward the centreline
      if (!k) {
        // an offset block of the compiled ground: its inner solid line widened in place, its legends windowed
        if (inA(s / cnt) && thinInner(3.1, 3.45)) { changed = true; for (const t of g) widen.set(t, { mid: (bmin + bmax) / 2, d: inward }); st.widened = (st.widened || 0) + 1; }
        if (inA(s / cnt) && letter && bmin >= 3.3 && bmax <= 6.75) wins.push({ sg: sgw, s0: smin, s1: smax, b0: bmin, b1: bmax, lo: 3.34, hi: 6.70 });
        continue;
      }
      const md = modeOf(k, f0.b);
      if (md === 'strip') {
        // the lines stay (the inner one widened), the legends go with the red
        if (thinInner(3.1, 3.45)) { changed = true; for (const t of g) widen.set(t, { mid: (bmin + bmax) / 2, d: inward }); st.widened = (st.widened || 0) + 1; }
        else if (letter && bmin >= 3.3 && bmax <= 6.75) { changed = true; for (const t of g) verdict[t] = 2; st.paintDropped += g.length; }
        continue;
      }
      if (md === 'keep') {
        if (letter && bmin >= 5.3 && bmax <= 8.75) wins.push({ sg: sgw, s0: smin, s1: smax, b0: bmin, b1: bmax, lo: 5.34, hi: 8.70 });
        if (bmin >= PARK_LINE[0] && bmax <= PARK_LINE[1] && bmax - bmin < 0.3) { changed = true; for (const t of g) verdict[t] = 2; st.paintDropped += g.length; }
        continue;
      }
      let vd = 0;
      if (bmin >= PARK_LINE[0] && bmax <= PARK_LINE[1] && bmax - bmin < 0.3) vd = 0;            // the parking line stays
      else if (bmin >= OLD[0] && bmax <= OLD[1]) vd = md === 'offset' ? 1 : 2;                   // the red's inner line, legends
      else if (bmin >= LANE_LINE[0] && bmax <= LANE_LINE[1] && bmax - bmin < 0.3) vd = md === 'offset' && smax > bandS0(k, sgw) + 0.5 ? 2 : 0;   // dashes under the moved red
      if (vd === 1 && letter && smax <= bandS0(k, sgw) + 0.5) vd = 2;   // a legend where that side's red is gone
      if (!vd) continue;
      changed = true;
      const sg = f0.b > 0 ? -1 : 1, F = k.F;   // toward the centreline: -sign(b) along the block's south normal (-uz, ux)
      for (const t of g) { verdict[t] = vd; if (vd === 1) shift.set(t, [sg * -F.uz * SK_BUS_SHIFT, sg * F.ux * SK_BUS_SHIFT]); }
      if (vd === 1 && letter) wins.push({ sg: sgw, s0: smin, s1: smax, b0: bmin - SK_BUS_SHIFT, b1: bmax - SK_BUS_SHIFT, lo: 3.34, hi: 6.70 });
      if (vd === 1 && letter) for (const [name, side, c0, c1, ds] of ADD_LEGENDS) {
        if (name !== k.name || side !== sgw || smin < c0 || smax > c1) continue;
        const d = [sg * -F.uz * SK_BUS_SHIFT + F.ux * ds, sg * F.ux * SK_BUS_SHIFT + F.uz * ds];
        copies.push([g, d]);
        wins.push({ sg: sgw, s0: smin + ds, s1: smax + ds, b0: bmin - SK_BUS_SHIFT, b1: bmax - SK_BUS_SHIFT, lo: 3.34, hi: 6.70 });
        st.added = (st.added || 0) + 1;
      }
      // the moved inner line (5.2-5.34 before the move) is widened like the compiled ones, and stops where its side's red
      // starts later than the block's (the St Nicholas stop: no red, no line along it)
      if (vd === 1 && thinInner(5.1, 5.45)) {
        for (const t of g) widen.set(t, { mid: (bmin + bmax) / 2, d: inward });
        st.widened = (st.widened || 0) + 1;
        const a0 = bandS0(k, sgw);
        if (a0 > k.s0 + 0.5) for (const t of g) cutFrom.set(t, a0);
      }
      if (vd === 1) st.paintMoved += g.length; else st.paintDropped += g.length;
    }
    if (changed) {
      const out = [];
      for (let t = 0; t < n; t++) {
        if (verdict[t] === 2) continue;
        const d = verdict[t] === 1 ? shift.get(t) : null, w = widen.get(t), tri = [];
        for (let v = 0; v < 3; v++) {
          const o = t * 9 + v * 3;
          let x = pw[o] + (d ? d[0] : 0), z = pw[o + 2] + (d ? d[1] : 0);
          // the vertices on the line's traffic side (|b| under its middle, measured before any move) step 0.10 m further in
          if (w) { const f = frameAt(pw[o] + ox, pw[o + 2] + oz); if (f && Math.abs(f.b) < w.mid) { x += w.d[0]; z += w.d[1]; } }
          tri.push([x + ox, pw[o + 1], z + oz]);
        }
        const a0 = cutFrom.get(t);
        if (a0 !== undefined) {
          const blk = blockAt(a0), q = clipHalf(tri, (p) => a0 - fS(blk.F, p));
          if (q.length > 2) emit(q, out, ox, oz);
          continue;
        }
        for (const p of tri) out.push(p[0] - ox, p[1], p[2] - oz);
      }
      for (const [g, d] of copies) for (const t of g) for (let v = 0; v < 3; v++) { const o = t * 9 + v * 3; out.push(pw[o] + d[0], pw[o + 1], pw[o + 2] + d[1]); }
      tile.S.paintW = Float32Array.from(out);
    }
  }
  // a legend near a tile's edge has its red partly in the next tile: the windows found in all the tiles (LEGEND_WINDOWS,
  // below) are cut from every tile's red, with the ones found here
  const all = wins.concat(LEGEND_WINDOWS.filter((w) => { const p = pointAt((w.s0 + w.s1) / 2); return p && p[0] > ox - 40 && p[0] < ox + 552 && p[1] > oz - 40 && p[1] < oz + 552; }));
  if (all.length && tile.S.busred) legendWindows(tile, ox, oz, all, st);
  return st;
}
// the word boxes found by legendWindows on every tile (for tools that regenerate LEGEND_WINDOWS)
export const _skBusWords = [];

// NYC DOT lays the BUS ONLY legends of a red lane on unpainted asphalt: a dark window round each word inside the red
// Letters of a word (side by side across the lane) are merged;
// the window is the word's box and 0.30 m along / 0.25 m across, kept 0.15 m inside the red band; the red inside it is
// re-kinded to asphalt (no overlap: the GP32 rule above).
function legendWindows(tile, ox, oz, wins, st) {
  wins.sort((p, q) => p.sg - q.sg || p.s0 - q.s0);
  const words = [];
  for (const w of wins) {
    const last = words[words.length - 1];
    if (last && last.sg === w.sg && w.s0 <= last.s1 + 0.4 && w.b0 <= last.b1 + 0.6 && w.b1 >= last.b0 - 0.6) {
      last.s1 = Math.max(last.s1, w.s1); last.b0 = Math.min(last.b0, w.b0); last.b1 = Math.max(last.b1, w.b1);
    } else words.push({ ...w });
  }
  for (const w of words) {
    const q = _skBusWords.find((u) => u.sg === w.sg && w.s0 <= u.s1 + 0.4 && w.s1 >= u.s0 - 0.4);
    if (q) { q.s0 = Math.min(q.s0, w.s0); q.s1 = Math.max(q.s1, w.s1); q.b0 = Math.min(q.b0, w.b0); q.b1 = Math.max(q.b1, w.b1); }   // a word split by a tile edge
    else _skBusWords.push({ ...w });
  }
  const red = tile.S.busred, keep = [], asph = [];
  const rects = words.map((w) => {
    const sm = (w.s0 + w.s1) / 2, P = pointAt(sm), seg = SEG.find(([, , , , L, s0]) => sm >= s0 && sm <= s0 + L);
    if (!P || !seg) return null;
    return { F: { x: P[0], z: P[1], ux: seg[2], uz: seg[3], sm }, sg: w.sg, s0: w.s0 - 0.30, s1: w.s1 + 0.30,
      b0: Math.max(w.lo + 0.15, w.b0 - 0.25), b1: Math.min(w.hi - 0.15, w.b1 + 0.25) };
  }).filter((r) => r && r.b1 > r.b0 + 0.3 && r.s1 - r.s0 < 8);
  if (!rects.length) return;
  for (let o = 0; o + 8 < red.length; o += 9) {
    const T = triW(red, o, ox, oz);
    let pieces = [T], cut = false;
    for (const r of rects) {
      const fa = (p) => fS(r.F, p), fb = (p) => r.sg * fB(r.F, p);
      const next = [];
      for (const P of pieces) {
        let a0 = 1e9, a1 = -1e9, c0 = 1e9, c1 = -1e9;
        for (const p of P) { const a = fa(p), c = fb(p); a0 = Math.min(a0, a); a1 = Math.max(a1, a); c0 = Math.min(c0, c); c1 = Math.max(c1, c); }
        if (a1 <= r.s0 || a0 >= r.s1 || c1 <= r.b0 || c0 >= r.b1) { next.push(P); continue; }
        const inn = clipRect(P, fa, fb, r.s0, r.s1, r.b0, r.b1);
        if (inn.length > 2 && Math.abs(polyArea(inn, 0, 2)) > 1e-4) { emit(inn, asph, ox, oz); next.push(...subtractRect(P, fa, fb, r.s0, r.s1, r.b0, r.b1)); cut = true; }
        else next.push(P);
      }
      pieces = next;
    }
    if (!cut) { for (let i = 0; i < 9; i++) keep.push(red[o + i]); continue; }
    for (const P of pieces) emit(P, keep, ox, oz);
  }
  tile.S.busred = Float32Array.from(keep);
  tile.S.asphalt = Float32Array.from(Array.from(tile.S.asphalt || []).concat(asph));
  st.windows = (st.windows || 0) + rects.length;
}
