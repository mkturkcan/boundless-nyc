// New York licence plate for CARLA's shared plate sheet (T_LicensePlate_d, a weathered "California / CARLA" plate on 5
// kinds). Draws the 2010-2020 "Empire Gold" design — the plate most NYC cars still carry: gold ground, navy "NEW YORK"
// header, navy DIN-style characters "ABC-1234", "THE EMPIRE STATE" footer — into the same 2:1 plate rectangle, keeps
// the source's grime (its luminance variation) and its alpha (the plate outline).
//   node tools/assets/livery_plate.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { findTexture } from './lib/ue.mjs';
import { LIVERY_DIR } from './livery_taxi.mjs';

export const PLATE_OUT = path.join(LIVERY_DIR, 'T_LicensePlate_d_NY.png');

export async function buildPlate(text = 'HJT-4827') {
  const src = findTexture('T_LicensePlate_d');
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  // the plate rectangle (alpha > 128)
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 128) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const pw = x1 - x0 + 1, ph = y1 - y0 + 1;
  const NAVY = '#10295e', GOLD = '#f2c14e';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}">
    <rect width="${pw}" height="${ph}" fill="${GOLD}"/>
    <rect x="3" y="3" width="${pw - 6}" height="${ph - 6}" fill="none" stroke="${NAVY}" stroke-width="3" rx="6"/>
    <text x="${pw / 2}" y="${ph * 0.2}" text-anchor="middle" font-family="Bahnschrift" font-weight="700" font-size="${ph * 0.15}" fill="${NAVY}" letter-spacing="${ph * 0.02}">NEW YORK</text>
    <text x="${pw / 2}" y="${ph * 0.72}" text-anchor="middle" font-family="Bahnschrift" font-weight="600" font-stretch="condensed" font-size="${ph * 0.5}" fill="${NAVY}">${text}</text>
    <text x="${pw / 2}" y="${ph * 0.92}" text-anchor="middle" font-family="Bahnschrift" font-weight="400" font-size="${ph * 0.1}" fill="${NAVY}" letter-spacing="${ph * 0.015}">THE EMPIRE STATE</text>
  </svg>`;
  const art = await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer();
  // grime: the source plate's luminance around its own (bright) mean, applied as a gentle multiplier
  let sum = 0, n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = (y * W + x) * 4; sum += data[i] + data[i + 1] + data[i + 2]; n++; }
  const mean = sum / n;
  // the source's own printing (the black "CARLA", the pink "California", the bolt slots) must not print through: pixels
  // darker than the plate stock, dilated 3 px, are left out of the grime map
  const gr = new Float32Array(pw * ph), ink = new Uint8Array(pw * ph);
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    const i = ((y + y0) * W + (x + x0)) * 4;
    gr[y * pw + x] = (data[i] + data[i + 1] + data[i + 2]) / Math.max(1, mean);
    const sat = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
    if (gr[y * pw + x] < 0.82 || sat > 60) ink[y * pw + x] = 1;
  }
  const R = 3;
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    let dark = false;
    for (let dy = -R; dy <= R && !dark; dy++) for (let dx = -R; dx <= R; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy >= 0 && yy < ph && xx >= 0 && xx < pw && ink[yy * pw + xx]) { dark = true; break; }
    }
    const i = ((y + y0) * W + (x + x0)) * 4, j = (y * pw + x) * 3;
    const k = dark ? 1 : Math.min(1.05, Math.max(0.82, 0.55 + 0.45 * Math.min(gr[y * pw + x], 1.2)));
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(Math.min(255, art[j + c] * k));
  }
  fs.mkdirSync(LIVERY_DIR, { recursive: true });
  await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toFile(PLATE_OUT);
  return PLATE_OUT;
}

if (process.argv[1] && process.argv[1].endsWith('livery_plate.mjs')) console.log('wrote', await buildPlate());
