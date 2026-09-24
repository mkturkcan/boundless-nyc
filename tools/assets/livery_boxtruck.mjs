// Plain white box for CARLA's CarlaCola2024 box truck. Its box livery sheet (MI_CarlaCola2024_Details04, a texture named
// "Baack_Unwrap_Texture_Checker_Material_BaseColor") is a Coca-Cola parody — red panels, a Spencerian "CarlaCola" script,
// the contour bottle: trade dress a vision dataset should not carry, and NYC's box trucks are overwhelmingly plain white.
// Every livery panel (red, and the white lettering/bottle printed inside it) becomes off-white box aluminium; the frame
// rails, hinges and cab parts that share the sheet are kept. The panel texture keeps a trace of the source's luminance
// variation so the box is not a flat card.
//   node tools/assets/livery_boxtruck.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { findTexture } from './lib/ue.mjs';
import { LIVERY_DIR } from './livery_taxi.mjs';

export const BOXTRUCK_SRC = 'Baack_Unwrap_Texture_Checker_Material_BaseColor';
export const BOXTRUCK_OUT = path.join(LIVERY_DIR, 'T_CarlaCola2024_Box_White.png');

export async function buildBoxTruck() {
  const src = findTexture(BOXTRUCK_SRC);
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = 4;
  const red = (i) => data[i] > 90 && data[i] > 1.55 * data[i + 1] && data[i] > 1.55 * data[i + 2];
  // panel blocks: a 32-px block that is mostly red paint is livery panel as a whole (so the white script and bottle
  // printed inside it go too); mixed border blocks decide per pixel
  const B = 32, bw = Math.ceil(W / B), bh = Math.ceil(H / B);
  const frac = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let n = 0, r = 0;
    for (let y = by * B; y < Math.min(H, by * B + B); y += 2) for (let x = bx * B; x < Math.min(W, bx * B + B); x += 2) { n++; if (red((y * W + x) * C)) r++; }
    frac[by * bw + bx] = r / Math.max(1, n);
  }
  // a block counts as panel when it, or most of its 8 neighbours, is red: letters wider than a block stay covered
  const panelBlock = (bx, by) => {
    if (frac[by * bw + bx] > 0.45) return true;
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = bx + dx, y = by + dy;
      if ((dx || dy) && x >= 0 && y >= 0 && x < bw && y < bh) { n++; if (frac[y * bw + x] > 0.45) s++; }
    }
    return s >= 6;
  };
  // enclosed non-panel regions (the big grey contour bottle inside a red panel) are panel too: flood the non-panel
  // blocks from the sheet border; whatever the flood cannot reach is surrounded by livery
  const P = new Uint8Array(bw * bh);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) P[by * bw + bx] = panelBlock(bx, by) ? 1 : 0;
  const reach = new Uint8Array(bw * bh), stack = [];
  for (let bx = 0; bx < bw; bx++) for (const by of [0, bh - 1]) if (!P[by * bw + bx]) { reach[by * bw + bx] = 1; stack.push(by * bw + bx); }
  for (let by = 0; by < bh; by++) for (const bx of [0, bw - 1]) if (!P[by * bw + bx] && !reach[by * bw + bx]) { reach[by * bw + bx] = 1; stack.push(by * bw + bx); }
  while (stack.length) {
    const b = stack.pop(), bx = b % bw, by = (b / bw) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = bx + dx, y = by + dy;
      if (x < 0 || y < 0 || x >= bw || y >= bh) continue;
      const k = y * bw + x;
      if (!P[k] && !reach[k]) { reach[k] = 1; stack.push(k); }
    }
  }
  let changed = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C, b = Math.floor(y / B) * bw + Math.floor(x / B);
    if (!(P[b] || !reach[b] || red(i))) continue;
    // flat off-white aluminium: any modulation from the source kept ghost outlines of the script and the bottle
    data[i] = 232; data[i + 1] = 232; data[i + 2] = 228;
    changed++;
  }
  fs.mkdirSync(LIVERY_DIR, { recursive: true });
  await sharp(data, { raw: { width: W, height: H, channels: C } }).png().toFile(BOXTRUCK_OUT);
  console.log(`box panels whitened: ${((100 * changed) / (W * H)).toFixed(1)} % of ${W}x${H}`);
  return BOXTRUCK_OUT;
}

if (process.argv[1] && process.argv[1].endsWith('livery_boxtruck.mjs')) console.log('wrote', await buildBoxTruck());
