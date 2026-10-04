// TV25 LEAF ATLAS + PLANE BARK PAINTER (trees agent, 2026-09-25). Canvas 2D only, no imports: the same code paints the
// atlas in the offline bake (tools/bake_trees.mjs, headless Chromium, no GPU) and in trees.js's runtime fallback
// (?tv25gen=1, or when the baked files are missing).
//
// 5 x 5 cells of 512 px (4 x 4 until TR35), v up (cell row 0 is the canvas BOTTOM, matching alphaMipTexture's CanvasTexture orientation):
// painted species sprays at the right LEAF scale for their card (a 0.55-1.15 m shoot), ez-tree's photographic oak and
// ash sprays (doubled: one copy covers only 16-26 % of a square), its aspen sheet recoloured to a summer linden green,
// and a solid bark swatch for the far-LOD trunk proxy. HSL ranges are ALBEDO (a leaf reflects 0.10-0.20).
// VERSION: bump when a change here alters the painted atlas (part of the bake key, see treeGen.js bakeKey25)
// TR35 (AR34 wave 2 round 2): 5 x 5 cells (2560 px). Cells 16-21 are STREET copies of cells 5, 13, 1, 0, 2 and 6
// (STREET_CELLS): the crown shader (trees.js TR35) samples them instead for every crown standing in the 125th Street and
// Hunters Point boxes. Central Park draws the same forms (its honeylocusts, oaks, lindens, pears from the census and cpFlora's
// canopy) and cpFloraKit's willows, ferns, shrubs and ground cover use 5/13, 1, 0, 2 and 6 as well, so the geometry keeps the
// old cells and the park keeps its look; the 125th Street and Hunters Point trees get the colours below.
export const ATLAS = { NC: 5, CS: 512, VERSION: 7 };   // 3: TR34 honeylocust / pear hues; 4: honeylocust half of that; 5: honeylocust back; 6: TR35 street cells; 7: sophora lighter
export const LEAF_CELLS = { oak: 0, ash: 1, linden: 2, plane: 3, maple: 4, hlocust: 5, pear: 6, ginkgo: 7, zelkova: 8, cherry: 9, plum: 10, planeB: 11, mapleB: 12, hlocustB: 13, pearB: 14, bark: 15,
  hlocustS: 16, hlocustSB: 17, sophoraS: 18, oakS: 19, lindenS: 20, pearS: 21 };
// TR35: the cell a street crown samples in place of a baked one (honeylocust, ash/sophora, oak, linden, pear)
export const STREET_CELLS = { 5: 16, 13: 17, 1: 18, 0: 19, 2: 20, 6: 21 };
export function cellUV25(cell, flip) {
  const n = ATLAS.NC, e = 1.5 / (n * ATLAS.CS);
  const cx = cell % n, cy = (cell / n) | 0;
  const u0 = cx / n + e, u1 = (cx + 1) / n - e, v0 = cy / n + e, v1 = (cy + 1) / n - e;
  return flip ? [u1, v0, u0, v1] : [u0, v0, u1, v1];
}
// painted spray specs: leaf length in px of a 512 px cell (~ one card = one shoot, 0.55-1.15 m); HSL ranges are
// ALBEDO (a leaf reflects 0.10-0.20: sRGB ~60-125), per-leaf jitter, 10-15 % leaves showing the paler underside
const SPRAYS = {
  // (densities MEASURED in the lab at the 0.42 cut: the first paint covered 7-15 % of a cell, a crown of sticks; a real
  // shoot covers 30-45 % of the square it sits in, so these are ~2.5x the leaves at ~1.15x the size)
  plane:    { shape: 'palmate', lobes: 5, sinus: 0.58, width: 1.12, len: [96, 132], n: [26, 32], twigs: 4, ang: [38, 72], h: [72, 88], s: [30, 44], l: [24, 34], under: 0.14, petiole: 0.3, seed: 11 },
  planeB:   { shape: 'palmate', lobes: 3, sinus: 0.62, width: 1.08, len: [90, 124], n: [22, 28], twigs: 4, ang: [35, 75], h: [74, 90], s: [30, 42], l: [26, 36], under: 0.18, petiole: 0.3, seed: 12 },
  maple:    { shape: 'palmate', lobes: 5, sinus: 0.44, width: 1.2, teeth: 1, len: [64, 86], n: [40, 50], twigs: 5, ang: [40, 70], h: [88, 102], s: [30, 44], l: [17, 26], under: 0.1, petiole: 0.45, opposite: 1, seed: 13 },
  mapleB:   { shape: 'palmate', lobes: 5, sinus: 0.5, width: 1.18, teeth: 1, len: [60, 80], n: [44, 54], twigs: 5, ang: [40, 75], h: [86, 100], s: [28, 42], l: [19, 28], under: 0.12, petiole: 0.45, opposite: 1, seed: 14 },
  // TR34 (2026-10-01): honeylocust and pear rendered too yellow (foliage hue s313 76 vs 85 deg,
  // N2330fdb_sq 76 vs 81, fdb280_S pears 97 vs 132; the painted albedo means were 71 and 104 deg): +12 / +10 deg, and the
  // honeylocust a little less saturated (its foliage saturation 0.556-0.652 against 0.468-0.503). Cells 5/13 are also
  // Central Park's willows (cpFloraKit WILLOW).
  // two of three views (hue 90 vs 85, 89 vs 81, 86 vs 77) and turned the park's yellow-green willows plain green (t4Lake).
  // VERSION 5: the honeylocust back to its TV25 colours (the park's willows share these cells and kept losing their
  // yellow-green at +6: cp_after4); a honeylocust-only cell is the way to move it. The pears keep +10.
  hlocust:  { shape: 'bipinnate', len: [110, 146], n: [22, 28], twigs: 4, ang: [30, 65], h: [64, 76], s: [44, 58], l: [30, 40], under: 0.08, leaflet: 1.0, seed: 15 },
  hlocustB: { shape: 'bipinnate', len: [100, 136], n: [22, 28], twigs: 5, ang: [30, 70], h: [66, 78], s: [42, 56], l: [31, 41], under: 0.08, leaflet: 1.0, seed: 16 },
  pear:     { shape: 'elliptic', width: 0.64, len: [46, 62], n: [72, 88], twigs: 6, ang: [30, 70], h: [106, 120], s: [34, 48], l: [15, 23], under: 0.1, gloss: 1, cluster: 3, seed: 17 },
  pearB:    { shape: 'elliptic', width: 0.6, len: [44, 58], n: [74, 90], twigs: 6, ang: [30, 70], h: [108, 122], s: [34, 46], l: [16, 24], under: 0.12, gloss: 1, cluster: 3, seed: 18 },
  ginkgo:   { shape: 'fan', len: [40, 50], n: [110, 130], twigs: 7, ang: [25, 70], h: [70, 82], s: [40, 54], l: [30, 40], under: 0.06, cluster: 4, seed: 19 },
  zelkova:  { shape: 'ovate', width: 0.5, teeth: 1, len: [40, 52], n: [110, 130], twigs: 7, ang: [45, 75], h: [86, 98], s: [28, 40], l: [21, 29], under: 0.12, seed: 20 },
  cherry:   { shape: 'ovate', width: 0.46, teeth: 1, len: [58, 76], n: [56, 68], twigs: 5, ang: [35, 70], h: [84, 96], s: [28, 40], l: [21, 29], under: 0.14, droop: 0.35, seed: 21 },
  plum:     { shape: 'ovate', width: 0.56, teeth: 1, len: [40, 50], n: [90, 106], twigs: 7, ang: [35, 70], h: [335, 352], s: [32, 46], l: [20, 30], under: 0.1, seed: 22 },
  // TR35 street honeylocust. Measured (foliage.py, green-dominant pixels): crops s313 / s317 / N219w_sq mean (59,70,43) (57,69,41)
  // (64,74,41), L50 57-64, saturation 0.48-0.52; the twin (shots/ar34/trees/w2r2a, 00:30, this engine) (86,96,29)
  // (84,93,27) (95,107,41), L50 85-98, saturation 0.67-0.76. The twin/albedo ratio of the old cells (linear 0.65 / 0.61 /
  // HSV saturation 0.33 (the old cells 0.65), luma 84 (116). The leaf: once-pinnate
  // (street cultivars), 8-12 pairs of 2-3 cm leaflets spaced a leaflet's width apart on a 15-20 cm rachis, two to a spur;
  // the bipinnate fern blades of `hlocust` (a solid jagged mat, the cell's coverage 0.41) read as the big flat clumps.
  // Five leaves to a spur (`cluster`): tufts with gaps between them, the grain that survives the mips (spread evenly, the
  // first paint, w2r2b, read as a smudge at 10-15 m and too thin: coverage 0.27).
  hlocustS:  { shape: 'pinnate', len: [96, 132], n: [78, 92], twigs: 6, ang: [35, 80], h: [86, 96], s: [17, 25], l: [24, 36], under: 0.06, cluster: 5, pairs: [9, 13], lfLen: [0.13, 0.16], lfW: 0.38, lfAng: [55, 75], droop: 0.3, seed: 31 },
  hlocustSB: { shape: 'pinnate', len: [92, 126], n: [80, 94], twigs: 7, ang: [35, 80], h: [85, 95], s: [18, 26], l: [23, 35], under: 0.06, cluster: 5, pairs: [9, 13], lfLen: [0.13, 0.16], lfW: 0.38, lfAng: [55, 75], droop: 0.35, seed: 32 },
};
// TR35 street-only recolours (HSV: hue shift in degrees, saturation and value factors) of a painted cell, copied into its own
// cell (`from`) or recoloured in place (no `from`: a cell only the street forms use). `k` < 1 draws the source smaller and
// tiles it (`k` 0.5: four copies), i.e. smaller leaves at the same coverage.
// sophora (S): the ash photo spray; crop cotton23 (sophoras in bloom, 2023-08) foliage mean (56,65,40), L50 56, saturation
// 0.435 against the twin's (62,87,29), L50 75, 0.728 (w2r2a): value x0.74, saturation x0.55, a little bluer; and its
// leaflets were 5-10 cm on a 0.75-1 m card where a sophora's are 2.5-5: half size, four copies. Value x0.84 since w2r2c:
// pin oak / linden / ginkgo: the same direction, less (no street crop of these in this round's sheets: not measured).
// pear: crop fdb280_S (Callery pears) (58,79,59), L50 66, saturation 0.37 against the twin's (47,63,39), L50 49, 0.47
// (w2r2a): lighter, less saturated, bluer.
const RECOLOUR = {
  sophoraS: { from: 'ash', dh: 4, ks: 0.58, kv: 0.84, k: 0.5 },
  oakS: { from: 'oak', dh: 4, ks: 0.6, kv: 0.8 },
  lindenS: { from: 'linden', dh: 4, ks: 0.6, kv: 0.84 },
  pearS: { from: 'pear', dh: 10, ks: 0.7, kv: 1.22 },
  pearB: { dh: 10, ks: 0.7, kv: 1.22 },
  ginkgo: { dh: 4, ks: 0.7, kv: 0.9 },
};
function hsvCell25(ctx, x0, y0, S, t) {
  const d = ctx.getImageData(x0, y0, S, S), px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 2) continue;
    const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
    let h = 0;
    if (c > 1e-6) h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
    h = (h * 60 + (t.dh || 0) + 360) % 360;
    const v = Math.min(1, mx * (t.kv ?? 1)), s = Math.min(1, (mx > 0 ? c / mx : 0) * (t.ks ?? 1));
    const C = v * s, X = C * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - C;
    const [r1, g1, b1] = h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X];
    px[i] = Math.round((r1 + m) * 255); px[i + 1] = Math.round((g1 + m) * 255); px[i + 2] = Math.round((b1 + m) * 255);
  }
  ctx.putImageData(d, x0, y0);
}
function rng25(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const hsl25 = (h, s, l, a = 1) => `hsla(${(((h % 360) + 360) % 360).toFixed(1)},${Math.max(0, Math.min(100, s)).toFixed(1)}%,${Math.max(0, Math.min(100, l)).toFixed(1)}%,${a})`;
const rr25 = (r, a) => a[0] + (a[1] - a[0]) * r();

// leaf outlines, local frame: petiole insertion at (0,0), tip at (0,-L)
function pathSimple(ctx, L, W, kind, teeth, bend) {
  const n = 26, P = [];
  const hw = (s) => (kind === 'elliptic' ? Math.pow(Math.sin(Math.PI * s), 0.8) : Math.pow(Math.sin(Math.PI * Math.pow(s, 0.72)), 0.9));
  for (let i = 0; i <= n; i++) {
    const s = i / n, t = teeth && s > 0.12 && s < 0.94 ? 1 + 0.07 * (i % 2 ? 1 : -1) : 1;
    P.push([bend * L * s * s + (W / 2) * hw(s) * t, -L * s]);
  }
  for (let i = n; i >= 0; i--) {
    const s = i / n, t = teeth && s > 0.12 && s < 0.94 ? 1 + 0.07 * (i % 2 ? -1 : 1) : 1;
    P.push([bend * L * s * s - (W / 2) * hw(s) * t, -L * s]);
  }
  ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (const p of P) ctx.lineTo(p[0], p[1]); ctx.closePath();
}
function pathPalmate(ctx, L, sp, r) {
  const cy = -0.47 * L, R = 0.53 * L * (sp.width ?? 1.1) * 0.92;
  const lobeA = sp.lobes === 3 ? [0, 1.0] : [0, 0.92, 1.8];
  const lobeL = sp.lobes === 3 ? [1.0, 0.86] : [1.0, 0.9, 0.58];
  const half = [[0, lobeL[0] * (0.95 + 0.1 * r())]];
  for (let k = 1; k < lobeA.length; k++) {
    half.push([(lobeA[k - 1] + lobeA[k]) / 2, sp.sinus * (lobeL[k - 1] + lobeL[k]) / 2 * (0.9 + 0.2 * r())]);
    half.push([lobeA[k], lobeL[k] * (0.9 + 0.2 * r())]);
  }
  half.push([(lobeA[lobeA.length - 1] + Math.PI) / 2 + 0.2, 0.46]);
  half.push([Math.PI, 0.86]);
  const radAt = (a) => {
    const x = Math.abs(a);
    for (let i = 1; i < half.length; i++) if (x <= half[i][0]) {
      const [a0, r0] = half[i - 1], [a1, r1] = half[i];
      let t = (x - a0) / Math.max(1e-6, a1 - a0);
      // rounded sinuses, pointed tips: ease toward the lower of the two radii
      t = r1 < r0 ? Math.pow(t, 0.7) : 1 - Math.pow(1 - t, 0.7);
      return r0 + (r1 - r0) * t;
    }
    return half[half.length - 1][1];
  };
  ctx.beginPath();
  for (let i = 0; i <= 96; i++) {
    const a = -Math.PI + (i / 96) * Math.PI * 2;
    let rf = radAt(a);
    if (sp.teeth) rf *= 1 + 0.035 * Math.sin(i * 2.9);
    const x = Math.sin(a) * R * rf, y = cy - Math.cos(a) * R * rf;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  return { cy, R, lobeA };
}
function pathFan(ctx, L) {
  const cy = -0.4 * L, R = 0.62 * L;
  ctx.beginPath(); ctx.moveTo(0, cy + 0.02 * L);
  for (let i = 0; i <= 26; i++) {
    const a = -1.0 + (2.0 * i) / 26;
    const f = (1 - 0.2 * Math.exp(-((a / 0.1) ** 2))) * (1 + 0.035 * Math.sin(i * 1.9));
    ctx.lineTo(Math.sin(a) * R * f, cy - Math.cos(a) * R * f);
  }
  ctx.closePath();
}
function drawBipinnate(ctx, L, h, s, l, r) {
  ctx.strokeStyle = hsl25(h - 12, s * 0.55, l - 2, 0.95); ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -L); ctx.stroke();
  const np = 4 + ((r() * 3) | 0);
  for (let i = 0; i < np; i++) {
    const t0 = 0.22 + (0.74 * (i + 0.5)) / np, y0 = -L * t0;
    const pl = L * (0.32 + 0.12 * Math.sin(Math.PI * t0));
    for (const side of [-1, 1]) {
      const a = side * (1.05 + (r() - 0.5) * 0.35), dx = Math.sin(a), dy = -Math.cos(a);
      ctx.strokeStyle = hsl25(h - 10, s * 0.6, l, 0.9); ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(dx * pl, y0 + dy * pl); ctx.stroke();
      const nl = 8 + ((r() * 5) | 0), lf = L * (0.07 + r() * 0.015) * (drawBipinnate.k || 1);
      for (let j = 0; j < nl; j++) {
        const t = (j + 0.7) / (nl + 0.3), px = dx * pl * t, py = y0 + dy * pl * t;
        for (const s2 of [-1, 1]) {
          const la = a + s2 * 1.25;
          const cx = px + Math.sin(la) * lf * 0.5, cyy = py - Math.cos(la) * lf * 0.5;
          ctx.fillStyle = hsl25(h + (r() - 0.5) * 6, s + (r() - 0.5) * 6, l + (r() - 0.5) * 7);
          ctx.beginPath(); ctx.ellipse(cx, cyy, lf * 0.2, lf * 0.5, la, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }
}
// TR35: a once-pinnate leaf (the street honeylocust): an arching rachis, `pairs` of small elliptic leaflets a leaflet's
// width apart (the sky between them), smaller toward both ends, now and then one missing
function drawPinnate(ctx, L, h, s, l, r, sp) {
  const bend = (sp.droop ?? 0.25) * (0.4 + 0.9 * r()) * (r() < 0.5 ? -1 : 1);
  const pt = (t) => [bend * L * 0.4 * t * t, -L * t];
  ctx.strokeStyle = hsl25(h - 10, s * 0.7, l - 4, 0.9); ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(0, 0);
  for (let i = 1; i <= 8; i++) { const p = pt(i / 8); ctx.lineTo(p[0], p[1]); }
  ctx.stroke();
  const np = Math.round(rr25(r, sp.pairs)), lfL = L * rr25(r, sp.lfLen), lfW = lfL * (sp.lfW ?? 0.36);
  const leaflet = (cx, cy, a, ll, ww) => {
    ctx.fillStyle = hsl25(h + (r() - 0.5) * 8, s + (r() - 0.5) * 8, l + (r() - 0.5) * 10);
    ctx.beginPath(); ctx.ellipse(cx, cy, ll * 0.5, ww * 0.5, a, 0, Math.PI * 2); ctx.fill();
  };
  for (let i = 0; i < np; i++) {
    const t = 0.1 + (0.86 * (i + 0.5)) / np;
    const p = pt(t), q = pt(Math.min(1, t + 0.02));
    const dir = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const k = 0.72 + 0.28 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95));
    for (const side of [-1, 1]) {
      if (r() < 0.07) continue;
      const a = dir + side * ((rr25(r, sp.lfAng) * Math.PI) / 180);
      const ll = lfL * k * (0.85 + 0.3 * r()), ww = lfW * k * (0.85 + 0.3 * r());
      leaflet(p[0] + Math.cos(a) * ll * 0.55, p[1] + Math.sin(a) * ll * 0.55, a, ll, ww);
    }
  }
  const tp = pt(1), tq = pt(0.97), ta = Math.atan2(tp[1] - tq[1], tp[0] - tq[0]);
  leaflet(tp[0] + Math.cos(ta) * lfL * 0.4, tp[1] + Math.sin(ta) * lfL * 0.4, ta, lfL * 0.8, lfW * 0.8);
}
function drawLeaf(ctx, sp, x, y, ang, L, r, depth) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  const fore = 0.6 + 0.4 * r();                  // the leaf is tilted: foreshortened across its width
  const under = r() < (sp.under ?? 0.1);
  let h = rr25(r, sp.h), s = rr25(r, sp.s), l = rr25(r, sp.l) - depth * 5;
  if (under) { h += 6; s -= 8; l += 5; }   // the paler underside (a stronger lift read cream in direct sun)
  if (sp.shape === 'bipinnate') { drawBipinnate.k = sp.leaflet || 1; drawBipinnate(ctx, L, h, s, l, r); ctx.restore(); return; }
  if (sp.shape === 'pinnate') { ctx.scale(0.75 + 0.25 * fore, 1); drawPinnate(ctx, L, h, s, l, r, sp); ctx.restore(); return; }
  // petiole
  const pet = sp.shape === 'fan' ? 0.4 : (sp.petiole ?? 0.18);
  ctx.strokeStyle = hsl25(h - 20, s * 0.6, l + 2, 0.95); ctx.lineWidth = sp.shape === 'palmate' ? 2.2 : 1.4;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -L * pet * 0.95); ctx.stroke();
  ctx.translate(0, sp.shape === 'fan' ? 0 : -L * pet * 0.8);
  ctx.scale(fore, 1);
  const g = ctx.createLinearGradient(0, 0, 0, -L);
  g.addColorStop(0, hsl25(h - 3, s, l - 5)); g.addColorStop(0.55, hsl25(h, s, l)); g.addColorStop(1, hsl25(h + 4, s + 2, l + 4));
  let info = null;
  if (sp.shape === 'palmate') info = pathPalmate(ctx, L, sp, r);
  else if (sp.shape === 'fan') pathFan(ctx, L);
  else pathSimple(ctx, L, L * (sp.width ?? 0.5), sp.shape, sp.teeth, (r() - 0.5) * 0.18);
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  // one half of the blade turned a little away from the light (the fold at the midrib)
  ctx.fillStyle = 'rgba(0,0,0,0.13)'; ctx.fillRect(r() < 0.5 ? 0 : -L * 1.5, -L * 1.3, L * 1.5, L * 1.6);
  // veins
  ctx.strokeStyle = hsl25(h + 8, s - 10, l + 13, 0.55); ctx.lineWidth = 1;
  ctx.beginPath();
  if (info) {
    for (const a of info.lobeA) for (const sg of a ? [-1, 1] : [1]) { ctx.moveTo(0, 0); ctx.lineTo(Math.sin(a * sg) * info.R * 0.9, info.cy - Math.cos(a * sg) * info.R * 0.9); }
  } else if (sp.shape === 'fan') {
    for (let i = 0; i < 9; i++) { const a = -0.9 + (1.8 * i) / 8; ctx.moveTo(0, -0.38 * L); ctx.lineTo(Math.sin(a) * L * 0.58, -0.38 * L - Math.cos(a) * L * 0.58); }
  } else {
    ctx.moveTo(0, 0); ctx.lineTo(0, -L * 0.95);
    for (let i = 1; i < 6; i++) { const yy = -L * (0.12 + i * 0.14); for (const sg of [-1, 1]) { ctx.moveTo(0, yy); ctx.lineTo(sg * L * (sp.width ?? 0.5) * 0.42, yy - L * 0.12); } }
  }
  ctx.stroke();
  if (sp.gloss) { ctx.fillStyle = 'rgba(255,255,240,0.09)'; ctx.beginPath(); ctx.ellipse(L * 0.06, -L * 0.55, L * 0.08, L * 0.26, 0.2, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  ctx.strokeStyle = hsl25(h, s, l - 10, 0.6); ctx.lineWidth = 0.9; ctx.stroke();
  ctx.restore();
}
function paintSpray(ctx, sp, cellSeed) {
  const r = rng25(sp.seed * 977 + cellSeed);
  const S = ATLAS.CS;
  // stems: the main shoot from the card's base (bottom centre) toward the top, and a few side twigs off it
  const quad = (a, b, c, t) => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]];
  const b0 = [S / 2 + (r() - 0.5) * 24, S - 5], tip = [S / 2 + (r() - 0.5) * S * 0.28, S * (0.08 + r() * 0.05)];
  const mid = [(b0[0] + tip[0]) / 2 + (r() - 0.5) * S * 0.22, (b0[1] + tip[1]) / 2];
  const stems = [{ a: b0, b: mid, c: tip, w0: 4.2, w1: 1.4, len: 1 }];
  for (let k = 0; k < sp.twigs; k++) {
    const t = 0.16 + (0.66 * (k + r())) / sp.twigs;
    const p = quad(b0, mid, tip, t), p2 = quad(b0, mid, tip, t + 0.02);
    const base = Math.atan2(p2[1] - p[1], p2[0] - p[0]);
    const side = k % 2 ? 1 : -1, ang = base + side * (0.55 + r() * 0.45);
    const L = S * (0.28 + r() * 0.2) * (1 - 0.35 * t);
    const e = [p[0] + Math.cos(ang) * L, p[1] + Math.sin(ang) * L];
    const m = [(p[0] + e[0]) / 2 + (r() - 0.5) * 30, (p[1] + e[1]) / 2 - 10];
    stems.push({ a: p, b: m, c: e, w0: 2.4, w1: 1.0, len: 0.55 });
  }
  for (const st of stems) {
    ctx.strokeStyle = hsl25(45, 22, 26, 1); ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const p = quad(st.a, st.b, st.c, i / 8), q = quad(st.a, st.b, st.c, (i + 1) / 8);
      ctx.lineWidth = st.w0 + (st.w1 - st.w0) * (i / 8);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    }
  }
  // leaf slots along the stems, proportional to their length
  const nLeaf = Math.round(rr25(r, sp.n));
  const tot = stems.reduce((a, s) => a + s.len, 0);
  const leaves = [];
  let side = 1;
  for (const st of stems) {
    const n = Math.max(1, Math.round((nLeaf * st.len) / tot));
    const cl = sp.cluster || 1;
    for (let i = 0; i < n; i += cl) {
      const t = st === stems[0] ? 0.14 + 0.86 * ((i + 0.5 + (r() - 0.5) * 0.4) / n) : 0.18 + 0.82 * ((i + 0.5) / n);
      const tc = Math.min(1, t);
      const p = quad(st.a, st.b, st.c, tc), p2 = quad(st.a, st.b, st.c, Math.min(1, tc + 0.01));
      const dir = Math.atan2(p2[1] - p[1], p2[0] - p[0]);
      for (let c = 0; c < cl && i + c < n; c++) {
        side = sp.opposite ? (c % 2 ? -side : side) : -side;
        const spread = cl > 1 ? (c - (cl - 1) / 2) * 0.55 : 0;
        const last = t > 0.97 && c === 0;
        let a = last ? dir : dir + side * (rr25(r, sp.ang) * Math.PI / 180) + spread;
        if (sp.droop) a += sp.droop * (Math.cos(a) > 0 ? 0.6 : -0.6) * r();
        const L = rr25(r, sp.len) * (0.8 + 0.35 * Math.sin(Math.PI * tc));
        leaves.push({ x: p[0], y: p[1], a: a + Math.PI / 2, L, depth: r() });
      }
    }
  }
  // keep every leaf inside the cell (shrink the ones that would poke out)
  for (const lf of leaves) {
    const tx = lf.x + Math.sin(lf.a) * lf.L * 1.05, ty = lf.y - Math.cos(lf.a) * lf.L * 1.05;
    const over = Math.max(0, 10 - tx, tx - (S - 10), 10 - ty, ty - (S - 10));
    if (over > 0) lf.L = Math.max(lf.L * 0.45, lf.L - over);
  }
  leaves.sort((p, q) => p.depth - q.depth);
  for (const lf of leaves) drawLeaf(ctx, sp, lf.x, lf.y, lf.a, lf.L, r, 1 - lf.depth);
}
// ez-tree's photographic sprays scaled into a cell; the aspen sheet is an autumn card, recoloured to a summer
// linden green by luminance (its heart-shaped, finely toothed leaves are the linden's)
function drawEzSpray(ctx, img, recolour) {
  if (!img) return;
  const S = ATLAS.CS;
  if (!recolour) {
    ctx.save(); ctx.translate(S * 0.52, S * 0.5); ctx.rotate(0.35); ctx.scale(-0.88, 0.88); ctx.drawImage(img, -S / 2, -S / 2, S, S); ctx.restore();
    ctx.drawImage(img, 0, 0, S, S);
    return;
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c2 = cv.getContext('2d', { willReadFrequently: true });
  c2.drawImage(img, 0, 0, S, S);
  const d = c2.getImageData(0, 0, S, S), px = d.data;
  const dark = [34, 58, 22], light = [118, 146, 58];
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const L = (0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]) / 255;
    const t = Math.min(1, Math.max(0, (L - 0.3) / 0.55));
    px[i] = dark[0] + (light[0] - dark[0]) * t; px[i + 1] = dark[1] + (light[1] - dark[1]) * t; px[i + 2] = dark[2] + (light[2] - dark[2]) * t;
  }
  c2.putImageData(d, 0, 0);
  ctx.save(); ctx.translate(S * 0.5, S * 0.5); ctx.rotate(-0.3); ctx.scale(-0.9, 0.9); ctx.drawImage(cv, -S / 2, -S / 2); ctx.restore();
  ctx.drawImage(cv, 0, 0);
}
export function paintLeafAtlas25(ez) {
  const n = ATLAS.NC, S = ATLAS.CS;
  const cv = document.createElement('canvas'); cv.width = cv.height = n * S;
  const ctx = cv.getContext('2d');
  const origin = (cell) => [(cell % n) * S, (n - 1 - ((cell / n) | 0)) * S];   // v up: cell row 0 is the canvas BOTTOM
  for (const [name, cell] of Object.entries(LEAF_CELLS)) {
    const [x0, y0] = origin(cell);
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, S, S); ctx.clip(); ctx.translate(x0, y0);
    if (name === 'oak') drawEzSpray(ctx, ez.oak, false);
    else if (name === 'ash') drawEzSpray(ctx, ez.ash, false);
    else if (name === 'linden') drawEzSpray(ctx, ez.aspen, true);
    else if (name === 'bark') {
      ctx.fillStyle = 'rgb(74,66,58)'; ctx.fillRect(0, 0, S, S);
      const r = rng25(99);
      for (let i = 0; i < 900; i++) { ctx.fillStyle = `rgba(${r() < 0.5 ? '40,34,30' : '110,100,88'},0.25)`; ctx.fillRect(r() * S, r() * S, 2 + r() * 8, 6 + r() * 30); }
    } else if (SPRAYS[name]) paintSpray(ctx, SPRAYS[name], cell);
    else if (RECOLOUR[name] && RECOLOUR[name].from != null) {
      // TR35: a street copy of a painted cell; k < 1: the source drawn smaller, a jittered k^-2 copies (smaller leaves)
      const t = RECOLOUR[name], [sx, sy] = origin(LEAF_CELLS[t.from]), k = t.k ?? 1;
      if (k >= 1) ctx.drawImage(cv, sx, sy, S, S, 0, 0, S, S);
      else {
        const n = Math.max(1, Math.round(1 / k)), r = rng25(cell * 131 + 7);
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
          const cx = ((i + 0.5) / n + (r() - 0.5) * 0.12) * S, cy = ((j + 0.5) / n + (r() - 0.5) * 0.12) * S, w = S * k * (1.05 + 0.15 * r());
          ctx.save(); ctx.translate(cx, cy); ctx.rotate((r() - 0.5) * 0.7); if (r() < 0.5) ctx.scale(-1, 1);
          ctx.drawImage(cv, sx, sy, S, S, -w / 2, -w / 2, w, w);
          ctx.restore();
        }
      }
    }
    ctx.restore();
    if (RECOLOUR[name]) hsvCell25(ctx, x0, y0, S, RECOLOUR[name]);
  }
  // FD14's leaf-albedo shoulder, applied to the whole atlas: L <= 118 untouched, [118, 255] -> [118, 150] at constant
  // chromaticity (a leaf reflects 0.10-0.20; the ez-tree sprays carry baked highlights up to L 207, which is the
  // "lit crown tops go near-white" the owner flagged on 2026-09-17)
  {
    const d = ctx.getImageData(0, 0, cv.width, cv.height), px = d.data, KNEE = 118, CAP = 150;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 8) continue;
      const L = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      if (L <= KNEE) continue;
      const k = (KNEE + (CAP - KNEE) * Math.min(1, (L - KNEE) / (255 - KNEE))) / L;
      px[i] *= k; px[i + 1] *= k; px[i + 2] *= k;
    }
    ctx.putImageData(d, 0, 0);
  }
  return cv;
}
// London plane bark: exfoliating camouflage plates (cream, olive, grey-brown) — tileable, drawn at the 9 offsets
export function planeCamoCanvas25() {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const r = rng25(4242);
  ctx.fillStyle = 'rgb(150,142,118)'; ctx.fillRect(0, 0, S, S);
  const layers = [[[104, 102, 78], 34, [26, 80]], [[178, 170, 138], 30, [18, 60]], [[122, 106, 86], 26, [14, 46]], [[84, 86, 66], 22, [8, 26]]];
  for (const [col, cnt, sz] of layers) {
    for (let i = 0; i < cnt; i++) {
      const cx = r() * S, cy = r() * S, R = sz[0] + r() * (sz[1] - sz[0]), el = 1.3 + r() * 0.8;
      const pts = [];
      const nv = 9 + ((r() * 5) | 0);
      for (let k = 0; k < nv; k++) { const a = (k / nv) * Math.PI * 2; const rr = R * (0.65 + 0.5 * r()); pts.push([Math.cos(a) * rr, Math.sin(a) * rr * el]); }
      const jc = (v) => Math.max(0, Math.min(255, v + (r() - 0.5) * 18)) | 0;
      ctx.fillStyle = `rgb(${jc(col[0])},${jc(col[1])},${jc(col[2])})`;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        ctx.beginPath(); ctx.moveTo(cx + ox + pts[0][0], cy + oy + pts[0][1]);
        for (const p of pts) ctx.lineTo(cx + ox + p[0], cy + oy + p[1]);
        ctx.closePath(); ctx.fill();
      }
    }
  }
  // fine speckle so the plates are not flat paint at a metre
  const d = ctx.getImageData(0, 0, S, S), px = d.data;
  for (let i = 0; i < px.length; i += 4) { const k = 1 + (r() - 0.5) * 0.16; px[i] *= k; px[i + 1] *= k; px[i + 2] *= k; }
  ctx.putImageData(d, 0, 0);
  return cv;
}
