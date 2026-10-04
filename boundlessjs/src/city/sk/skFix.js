// AR34 sk: compiled ground details that read wrong in the pairs, corrected in the tile's sections before anything samples or
// draws them (streetscape.js apply; `?skfix=0` keeps them as compiled). Pure (no three, no DOM).
// 1. Warning pads on the roadway. The compiled `warn` / `warnIron` pads are flat rectangles at the walk's height (y 3.53-3.54);
// ten of the 111 within 30 m of the 125th Street line lie over asphalt (node probe of the tiles 2026-10-02): the four ends
// of St Clair Place's skewed crossing inside 125th, one at 12th Avenue, five under the Broadway viaduct where the twin has
// no median island. They float 0.155 m over the road.
// 2. St Clair Place: a skewed crossing (bars 4.58 x 0.61 m at 27 deg to 125th) and two skewed stop lines are laid over
// 125th's own zebras at stations 222-243, which drew a hatch of crossed bars (QA Q45); the 2023-08
// shows plain zebras across 125th there. The skewed pieces inside 125th's carriageway go.
// 4. The Riverside Drive viaduct's tower and column feet at 12th Avenue on the walk, the crossings ending at their kerbs, and
// `?skfeet=0` alone keeps them as compiled).
import { Field } from './skField.js';
import { corridorSB, LINE } from './skGeom.js';
import { inZone } from './skBuild.js';
import { fixFeet } from './skFeet.js';

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
export const SK_FIX_ON = !(Q && (Q.get('sk') === '0' || Q.get('skfix') === '0'));

// out (m; the lines that run through a window are long strips, a legend's glyphs short triangles)]
const DROP_LEGENDS = [
  // the westbound travel lane east of St Nicholas: an ONLY, an arrow and a letter group at s 1184-1199 (compiled); the
  [1183.0, 1200.0, -1, 0.1, 3.05, ''],
  // QA Q28: the eastbound BUS ONLY at s 1444.3-1450.8 (compiled |b| 5.55-8.5 in the kerbside red, moved 2.00 m in by skBus);
  // The red's inner line (|b| 5.30-5.40) and the parking line (6.70-6.80) cross the window as
  // 11.6 m strips: kept (edges over 3 m)
  [1443.9, 1451.2, 1, 5.45, 8.6, '', 3.0],
];

// St Clair Place's junction on the corridor (stations, |b| m): the compiled pieces measured there 2026-10-02
const STCLAIR = { s0: 218, s1: 250, b: 10, box: [940, -3810, 1040, -3720] };

function dropPads(tile, ox, oz, st) {
  let F = null, W = null;
  for (const name of ['warn', 'warnIron']) {
    const a = tile.S[name]; if (!a || a.length < 18) continue;
    const out = [];
    let dropped = 0;
    // a pad is two triangles (18 floats, skBuild.padCentres reads them so): decided whole, by its centre, inside the dressed
    // zone only (the rest of the tile is other parts' ground)
    for (let o = 0; o + 17 < a.length; o += 18) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let v = 0; v < 6; v++) { const x = a[o + v * 3] + ox, z = a[o + v * 3 + 2] + oz; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (x1 - x0 < 4 && z1 - z0 < 4 && inZone(cx, cz)) {
        F = F || new Field(tile, ox, oz, ['asphalt', 'busred', 'gutter']);
        // over the road and not over any walk (a walk laid over the asphalt keeps its pad)
        if (F.kindAt(cx, cz) && !(W = W || new Field(tile, ox, oz, ['sidewalk', 'plaza', 'path', 'brick', 'gravel'])).kindAt(cx, cz)) { dropped++; continue; }
      }
      for (let i = 0; i < 18; i++) out.push(a[o + i]);
    }
    for (let o = Math.floor(a.length / 18) * 18; o < a.length; o++) out.push(a[o]);   // an odd triangle at the end stays
    if (dropped) { tile.S[name] = Float32Array.from(out); st.pads += dropped; }
  }
}

function stClair(tile, ox, oz, st) {
  const [bx0, bz0, bx1, bz1] = STCLAIR.box;
  if (ox > bx1 || ox + 512 < bx0 || oz > bz1 || oz + 512 < bz0) return;
  const a = tile.S.paintW; if (!a || a.length < 9) return;
  const n = Math.floor(a.length / 9), par = new Int32Array(n);
  for (let i = 0; i < n; i++) par[i] = i;
  const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  const inBox = new Uint8Array(n), vm = new Map();
  for (let t = 0; t < n; t++) {
    const x = (a[t * 9] + a[t * 9 + 3] + a[t * 9 + 6]) / 3 + ox, z = (a[t * 9 + 2] + a[t * 9 + 5] + a[t * 9 + 8]) / 3 + oz;
    if (x < bx0 || x > bx1 || z < bz0 || z > bz1) continue;
    inBox[t] = 1;
    for (let v = 0; v < 3; v++) {
      const key = Math.round(a[t * 9 + v * 3] * 100) + ',' + Math.round(a[t * 9 + v * 3 + 2] * 100), u = vm.get(key);
      if (u === undefined) vm.set(key, t); else { const p = find(t), q = find(u); if (p !== q) par[p] = q; }
    }
  }
  const G = new Map();
  for (let t = 0; t < n; t++) if (inBox[t]) { const r = find(t); let g = G.get(r); if (!g) G.set(r, (g = [])); g.push(t); }
  // the corridor's direction there (LINE segments 7-8 run at the same bearing to 0.02 deg)
  const ux = LINE[8][0] - LINE[7][0], uz = LINE[8][1] - LINE[7][1], uL = Math.hypot(ux, uz);
  const drop = new Uint8Array(n);
  let any = 0;
  for (const g of G.values()) {
    if (g.length > 4) continue;                       // legends and arrows stay
    const pts = [];
    for (const t of g) for (let v = 0; v < 3; v++) pts.push([a[t * 9 + v * 3] + ox, a[t * 9 + v * 3 + 2] + oz]);
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, mz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const c = corridorSB(mx, mz);
    if (!c || c[0] < STCLAIR.s0 || c[0] > STCLAIR.s1 || Math.abs(c[1]) > STCLAIR.b) continue;
    let sxx = 0, szz = 0, sxz = 0;
    for (const p of pts) { sxx += (p[0] - mx) ** 2; szz += (p[1] - mz) ** 2; sxz += (p[0] - mx) * (p[1] - mz); }
    const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    const cosA = Math.abs(Math.cos(ang) * ux / uL + Math.sin(ang) * uz / uL);
    const deg = Math.acos(Math.min(1, cosA)) * 180 / Math.PI;   // 0 = along 125th, 90 = across it
    if (deg < 15 || deg > 75) continue;               // the zebras' bars and the square stop lines stay
    for (const t of g) drop[t] = 1;
    any++;
  }
  if (!any) return;
  const out = [];
  for (let t = 0; t < n; t++) if (!drop[t]) for (let i = 0; i < 9; i++) out.push(a[t * 9 + i]);
  tile.S.paintW = Float32Array.from(out);
  st.skewed += any;
}

function dropLegends(tile, ox, oz, st) {
  const a = tile.S.paintW; if (!a || a.length < 9) return;
  const n = Math.floor(a.length / 9), drop = new Uint8Array(n);
  let any = 0;
  for (let t = 0; t < n; t++) {
    const x = (a[t * 9] + a[t * 9 + 3] + a[t * 9 + 6]) / 3 + ox, z = (a[t * 9 + 2] + a[t * 9 + 5] + a[t * 9 + 8]) / 3 + oz;
    if (x < 1500 || x > 1850 || z < -3100 || z > -2900) continue;   // the box of the list's entries
    const c = corridorSB(x, z); if (!c) continue;
    for (const [s0, s1, sg, b0, b1, , maxE] of DROP_LEGENDS) {
      if (!(c[0] >= s0 && c[0] <= s1 && Math.sign(c[1]) === sg && Math.abs(c[1]) >= b0 && Math.abs(c[1]) <= b1)) continue;
      if (maxE) { let L = 0; for (let v = 0; v < 3; v++) { const w = (v + 1) % 3; L = Math.max(L, Math.hypot(a[t * 9 + v * 3] - a[t * 9 + w * 3], a[t * 9 + v * 3 + 2] - a[t * 9 + w * 3 + 2])); } if (L > maxE) continue; }
      drop[t] = 1; any++; break;
    }
  }
  if (!any) return;
  const out = [];
  for (let t = 0; t < n; t++) if (!drop[t]) for (let i = 0; i < 9; i++) out.push(a[t * 9 + i]);
  tile.S.paintW = Float32Array.from(out);
  st.legends += any;
}

export function fixCompiled(tile, ox, oz) {
  const st = { pads: 0, skewed: 0, legends: 0 };
  if (!SK_FIX_ON || !tile || !tile.S) return st;
  stClair(tile, ox, oz, st);
  fixFeet(tile, ox, oz, st);
  dropPads(tile, ox, oz, st);
  dropLegends(tile, ox, oz, st);
  return st;
}
