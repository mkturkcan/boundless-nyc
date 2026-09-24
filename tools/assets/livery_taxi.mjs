// NYC taxi livery: CARLA's FordCrown2024 bodywork decals are a parody of the 2007 NYC TLC livery ("CARLA (T)AXI" for
// "NYC (T)AXI"). This rewrites the two door logos (one mirrored UV island each side) with "NYC" in Bahnschrift Bold
// Condensed, the closest system face to the logo's "AXI", and writes the result where build_vehicle.mjs picks it up
// (TEX_OVERRIDE). Alpha is the paint mask: 255 = body paint, 0 = black decal.
//   node tools/assets/livery_taxi.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { EXPORT_ROOT } from './lib/ue.mjs';

export const LIVERY_DIR = (process.env.ASSET_TOOLS || `${process.env.USERPROFILE || process.env.HOME}/.tools`) + '/liveries';
const SRC = path.join(EXPORT_ROOT, 'CarlaUnreal/Content/Carla/Static/Car/4Wheeled/FordCrown2024/Materials/T_FordCrown2024_Bodywork_BaseColor.png');
export const TAXI_OUT = path.join(LIVERY_DIR, 'T_FordCrown2024_Bodywork_BaseColor_NYC.png');

// measured on the 8K source (dark-pixel bounds): the "CARLA" word to erase, the circle it sits beside, and the cap
// height of that logo's "AXI" (the new word matches it)
const LOGOS = [
  { erase: [6414, 1347, 6811, 1504], circleEdge: 6403, side: 'right', top: 1292, bottom: 1521, mirrored: true },
  { erase: [6186, 3830, 6593, 3992], circleEdge: 6598, side: 'left', top: 3765, bottom: 4000, mirrored: false },
];
const GAP = 14;

async function word(text, capH) {
  // render large, trim to the ink, scale to the cap height
  const fs0 = Math.round(capH * 1.45);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${fs0 * 3}" height="${Math.round(fs0 * 1.4)}"><rect width="100%" height="100%" fill="white"/>` +
    `<text x="${Math.round(fs0 * 0.1)}" y="${Math.round(fs0 * 1.1)}" font-family="Bahnschrift" font-weight="700" font-stretch="condensed" font-size="${fs0}" fill="black">${text}</text></svg>`;
  const trimmed = await sharp(Buffer.from(svg)).flatten({ background: '#ffffff' }).grayscale().trim({ background: "#ffffff", threshold: 40 }).toBuffer({ resolveWithObject: true });
  const w = Math.round(trimmed.info.width * (capH / trimmed.info.height));
  const { data } = await sharp(trimmed.data).resize(w, capH, { fit: 'fill' }).grayscale().raw().toBuffer({ resolveWithObject: true });
  return { w, h: capH, ink: data };   // 0 = ink, 255 = paper
}

export async function buildTaxiLivery() {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, C = info.channels;
  for (const L of LOGOS) {
    const [x0, y0, x1, y1] = L.erase;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = (y * W + x) * C; data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = 255; }
    const g = await word('NYC', L.bottom - L.top + 1);
    const left = L.side === 'left' ? L.circleEdge - GAP - g.w : L.circleEdge + GAP;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const sx = L.mirrored ? g.w - 1 - x : x;
      const a = 1 - g.ink[y * g.w + sx] / 255;   // ink coverage
      if (a <= 0) continue;
      const i = ((L.top + y) * W + left + x) * C;
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] * (1 - a) + 10 * a);
      data[i + 3] = Math.round(data[i + 3] * (1 - a));
    }
  }
  fs.mkdirSync(LIVERY_DIR, { recursive: true });
  await sharp(data, { raw: { width: W, height: info.height, channels: C } }).png({ compressionLevel: 6 }).toFile(TAXI_OUT);
  return TAXI_OUT;
}

if (process.argv[1] && process.argv[1].endsWith('livery_taxi.mjs')) console.log('wrote', await buildTaxiLivery());
