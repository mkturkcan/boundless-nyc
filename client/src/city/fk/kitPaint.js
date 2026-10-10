// AR34 KIT: the kit's canvas painters (owner KIT, docs/notes/ar33-kit.md), drawn from scratch: nothing here samples a
// photograph. The graffiti painter (letter skeletons, bubble-letter pieces, marker tags, paintGraffiti) is BID3's from
// fk/custom/bid3Paint.js (2026-10-01), taken into the kit for every segment; BID3 keeps its own file for its builders.
// The kit adds: paintStucco (a weathered render or stucco: blotches, rain runs from the top, soot, grain, the ghost of a
// painted sign), paintMural (an invented mural on a side wall: colour fields, bands, a piece, faded and peeling) and
// paintWear (the ageing pass laid over any of them: sun fade, flaking to the substrate, grime run down over the paint).
//   paintGraffiti(g, W, H, seed, { density, pxm, bandTop })
//   paintStucco(g, W, H, seed, { pxm, base: [r, g, b], ghost: [x0, x1] metres, glyphs, soot })
//   paintMural(g, W, H, seed, { pxm, style: 'blocks' | 'bands' | 'piece', palette: ['#rrggbb', ...], ground })
//   paintWear(g, W, H, seed, { pxm, fade, flake, runs })
export const hash = (a, b = 0, c = 0) => { const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return x - Math.floor(x); };

// ------------------------------------------------------------------ letter skeletons (unit box, y down)
const GLY = [
  [[[.5, .08], [.82, .2], [.9, .5], [.8, .8], [.5, .92], [.2, .8], [.1, .5], [.2, .2], [.5, .08]]],                 // O
  [[[.85, .22], [.55, .08], [.22, .22], [.12, .5], [.22, .8], [.55, .92], [.85, .78]]],                              // C
  [[[.85, .18], [.5, .08], [.18, .22], [.25, .45], [.75, .55], [.85, .78], [.5, .92], [.15, .82]]],                  // S
  [[[.85, .1], [.2, .1], [.2, .9], [.85, .9]], [[.2, .5], [.7, .5]]],                                                // E
  [[[.15, .9], [.15, .1], [.85, .9], [.85, .1]]],                                                                    // N
  [[[.1, .9], [.5, .1], [.9, .9]], [[.28, .62], [.72, .62]]],                                                        // A
  [[[.1, .9], [.1, .1], [.5, .6], [.9, .1], [.9, .9]]],                                                              // M
  [[[.2, .9], [.2, .1], [.8, .1], [.85, .45], [.2, .5], [.85, .9]]],                                                 // R
  [[[.2, .1], [.2, .9]], [[.85, .1], [.2, .55], [.85, .9]]],                                                         // K
  [[[.15, .1], [.85, .1], [.15, .9], [.85, .9]]],                                                                    // Z
  [[[.2, .1], [.2, .9], [.85, .9]]],                                                                                 // L
  [[[.2, .1], [.2, .9], [.65, .9], [.9, .5], [.65, .1], [.2, .1]]],                                                  // D
  [[[.15, .1], [.15, .9]], [[.15, .1], [.8, .15], [.85, .45], [.15, .5]], [[.15, .5], [.85, .6], [.85, .9], [.15, .9]]], // B
  [[[.12, .1], [.88, .1]], [[.5, .1], [.5, .9]]],                                                                    // T
  [[[.15, .1], [.15, .8], [.4, .92], [.7, .8], [.85, .1]]],                                                          // U
  [[[.15, .1], [.5, .55], [.85, .1]], [[.5, .55], [.5, .92]]],                                                       // Y
];
const FILLS = [
  ['#121212', '#e6cf2c'],            // black piece, yellow outline
  ['#7fc13e', '#1b2b14'],            // green, dark outline
  ['#3e66db', '#101624'],            // blue, near-black outline
  ['#c9ced3', '#101010', 'chrome'],  // silver / chrome, black outline
  ['#4a7ae0', '#101010'],            // light blue, black outline
  ['#e9e9e5', '#101010'],            // white, black outline
  ['#7fc13e', '#101010'],            // green, black outline
  ['#c9ced3', '#1c2a55', 'chrome'],  // chrome, navy outline
];

// one bubble-letter piece: n invented letters along a slanted baseline: a drop shadow, a thick outline, the fill (flat, or a
// chrome gradient for 'silver'), a highlight line and drips. fillSet: [fill, outline, kind] (kind 'chrome' = a metallic gradient)
function piece(g, x, y, w, h, seed, k, fillSet) {
  const R = (a, b = 0) => hash(a, b, seed * 7 + k);
  const n = 3 + Math.floor(R(1) * 2), [fill, line, kind] = fillSet;
  const lw = (w / n) * 0.96, sw = Math.max(9, lw * 0.4), ow = Math.max(6, lw * 0.15), slant = -0.14 + (R(2) - 0.5) * 0.1;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  let fillStyle = fill;
  if (kind === 'chrome') { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#f4f7fa'); gr.addColorStop(0.42, '#aeb6be'); gr.addColorStop(0.58, '#59626b'); gr.addColorStop(0.78, '#c7ced5'); gr.addColorStop(1, '#8e979f'); fillStyle = gr; }
  const drips = [];
  for (let i = 0; i < n; i++) {
    const t = GLY[Math.floor(R(10 + i) * GLY.length)];
    const ox = x + i * (w / n) * 0.98 + (R(20 + i) - 0.5) * lw * 0.1, oy = y + (R(30 + i) - 0.5) * h * 0.08;
    const lh = h * (0.9 + 0.12 * R(40 + i));
    const P = (p) => [ox + (p[0] + (R(50 + i, p[0] * 9) - 0.5) * 0.08) * lw + (1 - p[1]) * lw * slant * 1.4, oy + (p[1] + (R(60 + i, p[1] * 9) - 0.5) * 0.08) * lh];
    const stroke = (wd, col, dx = 0, dy = 0, a = 1) => {
      g.lineWidth = wd; g.strokeStyle = col; g.globalAlpha = a;
      // the skeleton's corners rounded into bubble forms: quadratic curves through the segment midpoints
      for (const poly of t) {
        const Q = poly.map((p) => { const q = P(p); return [q[0] + dx, q[1] + dy]; });
        g.beginPath(); g.moveTo(Q[0][0], Q[0][1]);
        if (Q.length === 2) g.lineTo(Q[1][0], Q[1][1]);
        else {
          for (let j = 1; j + 1 < Q.length; j++) g.quadraticCurveTo(Q[j][0], Q[j][1], (Q[j][0] + Q[j + 1][0]) / 2, (Q[j][1] + Q[j + 1][1]) / 2);
          g.lineTo(Q[Q.length - 1][0], Q[Q.length - 1][1]);
        }
        g.stroke();
      }
    };
    stroke(sw + ow * 2, 'rgba(0,0,0,0.5)', ow * 0.9, ow * 1.1, 0.55);        // the drop shadow
    stroke(sw + ow * 2, line);                                                // the thick outline
    stroke(sw, fillStyle);                                                    // the fill
    stroke(sw * 0.2, 'rgba(255,255,255,0.6)', -sw * 0.18, -sw * 0.22, 0.85); // the highlight
    if (R(70 + i) < 0.55) drips.push([ox + (0.2 + 0.6 * R(80 + i)) * lw, oy + lh * 0.97, 10 + R(90 + i) * h * 0.55, kind === 'chrome' ? '#8e979f' : fill]);
  }
  g.globalAlpha = 1;
  for (const [dx, dy, len, col] of drips) { g.strokeStyle = col; g.lineWidth = 3.4; g.beginPath(); g.moveTo(dx, dy); g.lineTo(dx, dy + len); g.stroke(); g.fillStyle = col; g.beginPath(); g.arc(dx, dy + len, 3.2, 0, Math.PI * 2); g.fill(); }
  g.restore();
}
// a marker tag: 3-5 invented letters as one thin fast stroke, single dark colour (a white one gets a dark halo), an underline swash
function tag(g, x, y, w, h, seed, k) {
  const R = (a, b = 0) => hash(a, b, seed * 11 + k);
  const cols = ['#0e0e0e', '#0e0e0e', '#0e0e0e', '#1b2a5a', '#0e0e0e', '#e8e8e4'];
  const col = cols[Math.floor(R(1) * cols.length)], light = col === '#e8e8e4';
  const n = 3 + Math.floor(R(2) * 3), lw = w / n, lh = h;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  const pass = (wd, c, dx, dy, a) => {
    g.lineWidth = wd; g.strokeStyle = c; g.globalAlpha = a;
    for (let i = 0; i < n; i++) {
      const t = GLY[Math.floor(R(10 + i) * GLY.length)];
      const ox = x + i * lw + dx, oy = y + dy + (R(30 + i) - 0.5) * lh * 0.15;
      for (const poly of t) {
        g.beginPath();
        poly.forEach((p, j) => { const px = ox + (p[0] + (R(50 + i, p[0] * 9) - 0.5) * 0.34) * lw * 1.1 + (1 - p[1]) * lw * 0.45, py = oy + (p[1] + (R(60 + i, p[1] * 9) - 0.5) * 0.34) * lh; if (j) g.lineTo(px, py); else g.moveTo(px, py); });
        g.stroke();
      }
    }
    g.beginPath(); g.moveTo(x - w * 0.04 + dx, y + lh * 1.08 + dy); g.quadraticCurveTo(x + w * 0.5 + dx, y + lh * 1.38 + dy, x + w * 1.04 + dx, y + lh * 0.98 + dy); g.stroke();
  };
  if (light) pass(8, '#111111', 1.2, 1.4, 0.85);
  pass(light ? 4.6 : 4.2, col, 0, 0, 0.92);
  g.restore();
}
// layered graffiti over what the canvas already holds: roller buffs, throw-ups, tags, black paint-outs, stickers, drips, overspray.
// o: { density 0..1, pxm pixels per metre, bandTop share of the height where it starts (0.35), pal indices }
export function paintGraffiti(g, W, H, seed, o = {}) {
  const dens = o.density ?? 0.8, pxm = o.pxm ?? 130, top = (o.bandTop ?? 0.4) * H;
  const R = (a, b = 0) => hash(a, b, seed);
  g.save();
  // (KIT, AR34 w2) an older layer first: pieces gone pale and half buffed, so the newer work lies over the ghosts of the
  // old as on the 125th Street gates (the copy from BID3 drew one clean generation)
  const nOld = Math.round((W / pxm) * 0.3 * dens);
  for (let i = 0; i < nOld; i++) {
    const pw = (1.8 + 0.9 * R(600 + i, 1)) * pxm, ph = (1.0 + 0.5 * R(600 + i, 2)) * pxm;
    const x = R(600 + i, 3) * Math.max(1, W - pw * 0.6) - pw * 0.2, y = Math.min(H - ph * 0.95, top * 0.6 + R(600 + i, 4) * (H - top * 0.6 - ph * 0.5));
    g.globalAlpha = 0.38 + 0.2 * R(600 + i, 5);
    piece(g, x, y, pw, ph, seed + 77, 50 + i, FILLS[Math.floor(R(600 + i, 6) * FILLS.length)]);
  }
  g.globalAlpha = 1;
  // roller buffs: a few patches of mismatched grey paint over older work (faint)
  for (let i = 0; i < 1 + Math.round(2 * dens); i++) {
    const w = (1.2 + 2.0 * R(i, 1)) * pxm, h = (0.8 + 0.9 * R(i, 2)) * pxm, x = R(i, 3) * (W - w), y = top + R(i, 4) * (H - top - h * 0.6);
    g.globalAlpha = 0.22 + 0.14 * R(i, 5); g.fillStyle = ['#4f5256', '#6a6d70', '#3f4246'][i % 3]; g.fillRect(x, y, w, h);
  }
  g.globalAlpha = 1;
  // the big pieces
  const nBig = Math.max(2, Math.round((W / pxm) * (0.4 + 0.35 * dens)));
  const cell = W / nBig, band = H - top;
  const order = [...Array(nBig).keys()].sort((a, b) => R(900 + a, 1) - R(900 + b, 1));
  order.forEach((i, rank) => {
    const pw = (2.3 + 0.8 * R(100 + i, 1)) * pxm, ph = (1.3 + 0.5 * R(100 + i, 2)) * pxm;
    const row = i % 2;
    const x = i * cell + cell * 0.5 - pw * 0.5 + (R(100 + i, 3) - 0.5) * cell * 0.5;
    const y = Math.min(H - ph * 0.98, top + row * band * 0.36 + R(100 + i, 4) * band * 0.14);
    if (R(100 + i, 6) < 0.3) { g.globalAlpha = 0.9; g.fillStyle = '#101010'; g.fillRect(x - pw * 0.02, y - ph * 0.1, pw * 1.0, ph * 1.2); g.globalAlpha = 1; }
    piece(g, x, y, pw, ph, seed, i + rank * 3, FILLS[Math.floor(R(100 + i, 5 + rank) * FILLS.length)]);
  });
  // small dark marker tags between and above the pieces
  for (let i = 0; i < Math.round((W / pxm) * 1.3 * dens); i++) tag(g, R(200 + i, 1) * (W - pxm * 0.9), top * 0.75 + R(200 + i, 2) * (H - top * 0.75) * 0.8, (0.55 + 0.45 * R(200 + i, 3)) * pxm, (0.28 + 0.16 * R(200 + i, 4)) * pxm, seed, i);
  // a few old faded tags higher up
  for (let i = 0; i < Math.round((W / pxm) * 0.7 * dens); i++) { g.globalAlpha = 0.45; tag(g, R(250 + i, 1) * (W - pxm), H * (0.1 + 0.25 * R(250 + i, 2)), (0.5 + 0.4 * R(250 + i, 3)) * pxm, (0.2 + 0.12 * R(250 + i, 4)) * pxm, seed + 3, 40 + i); }
  g.globalAlpha = 1;
  // stickers: a few small pale rectangles
  for (let i = 0; i < Math.round((W / pxm) * 0.6 * dens); i++) {
    const w = (0.16 + 0.16 * R(300 + i, 1)) * pxm, h = (0.1 + 0.1 * R(300 + i, 2)) * pxm, x = R(300 + i, 3) * (W - w), y = top * 0.5 + R(300 + i, 4) * (H - top * 0.5 - h);
    g.fillStyle = ['#d8d6cc', '#cfc15a', '#b9473f', '#b9c2c9'][i % 4]; g.globalAlpha = 0.9; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(20,20,20,0.7)'; g.fillRect(x + w * 0.1, y + h * 0.25, w * 0.8, Math.max(1.5, h * 0.18)); g.fillRect(x + w * 0.1, y + h * 0.6, w * 0.5, Math.max(1.5, h * 0.18));
  }
  g.globalAlpha = 1;
  // (KIT, AR34 w2) a last round of tags over the pieces: the gates are tagged over their throw-ups
  for (let i = 0; i < Math.round((W / pxm) * 0.9 * dens); i++) tag(g, R(700 + i, 1) * (W - pxm * 0.8), top * 0.8 + R(700 + i, 2) * (H - top * 0.8) * 0.85, (0.45 + 0.4 * R(700 + i, 3)) * pxm, (0.22 + 0.14 * R(700 + i, 4)) * pxm, seed + 9, 80 + i);
  // overspray round the pieces
  for (let i = 0; i < Math.round(6 * dens); i++) {
    const x = R(400 + i, 1) * W, y = top + R(400 + i, 2) * (H - top), r = (0.3 + 0.4 * R(400 + i, 3)) * pxm;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); const c = ['150,156,162', '50,90,190', '20,20,20'][i % 3];
    gr.addColorStop(0, `rgba(${c},0.18)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  g.restore();
}


// ------------------------------------------------------------------ a weathered render (stucco, EIFS, a parged party wall)
export function paintStucco(g, W, H, seed, o = {}) {
  const pxm = o.pxm ?? 90, base = o.base ?? [178, 168, 146];
  const R = (a, b = 0) => hash(a, b, seed);
  g.save();
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; g.fillRect(0, 0, W, H);
  // large soft blotches (uneven fading and old patching)
  const nb = Math.max(8, Math.round((W * H) / (pxm * pxm) * 0.9));
  for (let i = 0; i < nb; i++) {
    const x = R(i, 1) * W, y = R(i, 2) * H, r = (0.4 + 1.6 * R(i, 3)) * pxm, dk = R(i, 4) < 0.6;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, dk ? 'rgba(70,58,42,0.16)' : 'rgba(255,248,230,0.11)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // patched rectangles of newer render, slightly off in colour
  for (let i = 0; i < Math.round(W / pxm * 0.25); i++) {
    const w = (0.6 + 1.6 * R(i, 31)) * pxm, h = (0.4 + 1.2 * R(i, 32)) * pxm;
    g.fillStyle = R(i, 33) < 0.5 ? 'rgba(255,250,238,0.10)' : 'rgba(90,80,64,0.09)'; g.fillRect(R(i, 34) * (W - w), R(i, 35) * (H - h), w, h);
  }
  // the ghost of a painted sign: script strokes, mostly washed out
  if (o.ghost) {
    const [a, b] = o.ghost; g.lineCap = 'round'; g.lineJoin = 'round';
    for (let s = 0; s < 14; s++) {
      const x0 = (a + R(s, 11) * (b - a)) * pxm, y0 = H * (0.2 + 0.6 * R(s, 12)), len = (0.4 + 0.9 * R(s, 13)) * pxm;
      g.strokeStyle = `rgba(55,45,35,${0.10 + 0.14 * R(s, 14)})`; g.lineWidth = Math.max(2, pxm * (0.06 + 0.1 * R(s, 15)));
      g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(x0 + len * 0.4, y0 - len * 0.6, x0 + len * 0.7, y0 + len * 0.2, x0 + len, y0 - len * 0.3); g.stroke();
    }
  }
  if (o.glyphs) {
    g.lineCap = 'round'; g.strokeStyle = 'rgba(14,12,10,0.93)';
    for (const [x, y, r, a0, a1, lw] of o.glyphs) { g.lineWidth = lw * pxm; g.beginPath(); g.arc(x * pxm, y * pxm, r * pxm, a0, a1); g.stroke(); }
  }
  // rain runs from the top edge and soot under it
  for (let i = 0; i < Math.round((W / pxm) * 7); i++) {
    const x = R(i, 21) * W, w = 1 + R(i, 22) * pxm * 0.05, len = H * (0.3 + 0.7 * R(i, 23));
    const gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, `rgba(60,48,36,${0.1 + 0.09 * R(i, 24)})`); gr.addColorStop(1, 'rgba(60,48,36,0)');
    g.fillStyle = gr; g.fillRect(x, 0, w, len);
  }
  { const sg = g.createLinearGradient(0, 0, 0, H * 0.22); sg.addColorStop(0, `rgba(50,40,30,${o.soot ?? 0.22})`); sg.addColorStop(1, 'rgba(50,40,30,0)'); g.fillStyle = sg; g.fillRect(0, 0, W, H * 0.22); }
  // the splash zone at the foot
  { const sg = g.createLinearGradient(0, H, 0, H - pxm * 0.7); sg.addColorStop(0, 'rgba(40,34,28,0.28)'); sg.addColorStop(1, 'rgba(40,34,28,0)'); g.fillStyle = sg; g.fillRect(0, H - pxm * 0.7, W, pxm * 0.7); }
  // grain
  if (typeof g.getImageData === 'function') {
    const img = g.getImageData(0, 0, W, H);
    if (img && img.data && img.data.length >= W * H * 4) {
      const d = img.data;
      for (let q = 0; q < W * H; q++) { const n = (hash((q % W) * 0.7, Math.floor(q / W) * 0.7, seed + 5) - 0.5) * 22; d[q * 4] += n; d[q * 4 + 1] += n; d[q * 4 + 2] += n * 0.9; }
      g.putImageData(img, 0, 0);
    }
  }
  g.restore();
}

// ------------------------------------------------------------------ an invented mural on a side wall
// Styles: 'blocks' (overlapping colour fields and discs), 'bands' (woven stripes and lozenges, the patterned murals of the
// avenue walls), 'piece' (a big lettered piece over a sprayed ground). The palette is the mural's own (default a warm set).
const MURAL_PAL = [['#d9482b', '#f2b134', '#1f6f8b', '#2a2a2a', '#efe6d2'], ['#3b8b5a', '#f0c419', '#c7362f', '#1d3557', '#f1ede4'], ['#7a3b8f', '#e86a33', '#2e86ab', '#f5d547', '#222222']];
export function paintMural(g, W, H, seed, o = {}) {
  const pxm = o.pxm ?? 60, R = (a, b = 0) => hash(a, b, seed);
  const pal = o.palette || MURAL_PAL[Math.floor(R(1, 1) * MURAL_PAL.length)];
  const style = o.style || ['blocks', 'bands', 'piece'][Math.floor(R(2, 2) * 3)];
  g.save();
  g.fillStyle = o.ground || pal[pal.length - 1]; g.fillRect(0, 0, W, H);
  if (style === 'bands') {
    const bh = Math.max(8, (0.35 + 0.3 * R(3, 3)) * pxm);
    for (let y = 0, i = 0; y < H; y += bh, i++) {
      g.fillStyle = pal[i % (pal.length - 1)]; g.fillRect(0, y, W, bh * 0.82);
      // lozenges along the band
      const lw = bh * 1.4;
      g.fillStyle = pal[(i + 2) % (pal.length - 1)];
      for (let x = (i % 2) * lw * 0.5; x < W; x += lw) { g.beginPath(); g.moveTo(x, y + bh * 0.41); g.lineTo(x + lw * 0.3, y + bh * 0.08); g.lineTo(x + lw * 0.6, y + bh * 0.41); g.lineTo(x + lw * 0.3, y + bh * 0.74); g.closePath(); g.fill(); }
    }
  } else {
    // colour fields and discs
    for (let i = 0; i < 9; i++) {
      g.fillStyle = pal[i % (pal.length - 1)]; g.globalAlpha = 0.92;
      const w = (0.25 + 0.5 * R(i, 10)) * W, h = (0.25 + 0.6 * R(i, 11)) * H, x = R(i, 12) * (W - w * 0.5) - w * 0.25, y = R(i, 13) * (H - h * 0.5) - h * 0.25;
      if (R(i, 14) < 0.4) { g.beginPath(); g.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); g.fill(); }
      else { g.beginPath(); g.moveTo(x, y + h * R(i, 15) * 0.3); g.lineTo(x + w, y); g.lineTo(x + w * (0.85 + 0.15 * R(i, 16)), y + h); g.lineTo(x + w * 0.1 * R(i, 17), y + h * 0.9); g.closePath(); g.fill(); }
    }
    g.globalAlpha = 1;
    if (style === 'piece') {
      const pw = Math.min(W * 0.86, H * 2.6), ph = Math.min(H * 0.5, pw / 2.4);
      piece(g, (W - pw) / 2, (H - ph) / 2, pw, ph, seed, 3, FILLS[Math.floor(R(20, 20) * FILLS.length)]);
    }
  }
  // a painted border and a small invented signature at a lower corner
  g.strokeStyle = 'rgba(20,20,20,0.6)'; g.lineWidth = Math.max(2, pxm * 0.05); g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth);
  tag(g, W - pxm * 1.3, H - pxm * 0.55, pxm * 0.9, pxm * 0.28, seed, 9);
  g.restore();
}

// ------------------------------------------------------------------ the ageing pass over painted work
export function paintWear(g, W, H, seed, o = {}) {
  const pxm = o.pxm ?? 80, R = (a, b = 0) => hash(a, b, seed + 17);
  g.save();
  g.globalCompositeOperation = 'source-atop';
  // sun fade: a pale veil, stronger at the top
  { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, `rgba(255,250,240,${o.fade ?? 0.16})`); gr.addColorStop(1, `rgba(255,250,240,${(o.fade ?? 0.16) * 0.4})`); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  // grime run down over the paint
  for (let i = 0; i < Math.round((W / pxm) * 5 * (o.runs ?? 1)); i++) {
    const x = R(i, 1) * W, w = 1 + R(i, 2) * pxm * 0.04, y = R(i, 3) * H * 0.5, len = H * (0.2 + 0.5 * R(i, 4));
    const gr = g.createLinearGradient(0, y, 0, y + len); gr.addColorStop(0, `rgba(45,38,30,${0.08 + 0.1 * R(i, 5)})`); gr.addColorStop(1, 'rgba(45,38,30,0)');
    g.fillStyle = gr; g.fillRect(x, y, w, len);
  }
  // flaking: the paint gone to the substrate in small irregular flecks, more near the foot
  g.globalCompositeOperation = 'destination-out';
  const nf = Math.round((W / pxm) * (H / pxm) * 6 * (o.flake ?? 1));
  for (let i = 0; i < nf; i++) {
    const y = H * Math.pow(R(i, 11), 0.6), x = R(i, 12) * W, r = pxm * (0.01 + 0.05 * R(i, 13));
    g.fillStyle = `rgba(0,0,0,${0.35 + 0.5 * R(i, 14)})`; g.beginPath(); g.ellipse(x, y, r * (1 + R(i, 15)), r, R(i, 16) * 3.1, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}
