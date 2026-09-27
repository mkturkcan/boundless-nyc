// FLEET27 branding pass: CARLA marks on the older CARLA cars' atlases, painted out into ~/.tools/liveries (build_vehicle.mjs
// picks the results up through TEX_OVERRIDE; a missing file = the CARLA original).
//   node tools/assets/livery_fleet27.mjs
// - Mustang details atlas: the CARLA roundel, the small triangle-C badge and the pentagon CARLA badge (albedo filled with
//   the panel grey next to each; the same rectangles flattened in the normal map).
// - Tesla Model 3 parked atlas: the "California CARLA" plate -> a NY Empire Gold plate.
// - Mercedes C coupe parked atlas (existing kind, rebuilt with localMats): the same plate, turned 90 degrees in the sheet.
// Pixel rectangles are in the 2048 x 2048 source sheets (measured on the exports, 2026-09-26).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { findTexture } from './lib/ue.mjs';

const DIR = (process.env.ASSET_TOOLS || `${process.env.USERPROFILE || process.env.HOME}/.tools`) + '/liveries';
const out = (name) => path.join(DIR, name + '_nyc.png');
// [x0, y0, x1, y1, bgX, bgY]: fill the rectangle with the colour at (bgX, bgY), or with its border median
const PATCHES = {
  T_Mustang_details_d: { rects: [[145, 540, 305, 705, 330, 600], [455, 580, 540, 675, 420, 630], [1495, 1235, 1585, 1320, 1450, 1200]] },
  // the normal map embosses the roundel inside a raised ring larger than the printed logo
  T_Mustang_Details_n: { rects: [[110, 510, 345, 765], [458, 598, 537, 668, 430, 630], [1495, 1235, 1585, 1320]] },
  T_TeslaM3_Interior_d: { plate: [855, 1600, 1075, 1710] },
  // rot 90: the plate lies turned clockwise in the sheet (its top edge faces +x)
  T_MercedesCCC_parked_interior_d: { plate: [1343, 370, 1411, 512], rot: 90 },
};
export const FLEET27_TEX = Object.fromEntries(Object.keys(PATCHES).map((k) => [k, out(k)]));

async function patch(name, spec) {
  const src = findTexture(name);
  if (!src) { console.warn('not exported:', name); return; }
  // raw RGB(A) first: sharp premultiplies by alpha inside one pipeline
  const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, W = info.width;
  const px = Buffer.from(data);
  for (const [x0, y0, x1, y1, bx, by] of spec.rects || []) {
    // no sample point: the per-channel median of the rectangle's border ring (a normal map's local tilt is kept)
    const ring = [];
    if (bx == null) for (let x = x0 - 1; x <= x1; x++) for (const y of [y0 - 1, y1]) ring.push((y * W + x) * ch);
    if (bx == null) for (let y = y0; y < y1; y++) for (const x of [x0 - 1, x1]) ring.push((y * W + x) * ch);
    const med = (c) => ring.map((o) => data[o + c]).sort((a, b) => a - b)[ring.length >> 1];
    const bg = bx == null ? [0, 1, 2].map(med) : [0, 1, 2].map((c) => data[(by * W + bx) * ch + c]);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) for (let c = 0; c < 3; c++) px[(y * W + x) * ch + c] = bg[c];
  }
  let img = sharp(px, { raw: { width: W, height: info.height, channels: ch } });
  if (spec.plate) {
    const [x0, y0, x1, y1] = spec.plate, W0 = x1 - x0, H0 = y1 - y0;
    const rot = spec.rot === 90, w = rot ? H0 : W0, h = rot ? W0 : H0;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W0}" height="${H0}"><g transform="${rot ? `translate(${W0},0) rotate(90)` : ''}">
      <rect width="${w}" height="${h}" fill="#f2c14e"/><rect x="3" y="3" width="${w - 6}" height="${h - 6}" fill="none" stroke="#10295e" stroke-width="3"/>
      <text x="${w / 2}" y="${h * 0.24}" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="${h * 0.16}" fill="#10295e" text-anchor="middle">NEW YORK</text>
      <text x="${w / 2}" y="${h * 0.72}" font-family="Arial Narrow, Arial, Helvetica, sans-serif" font-weight="bold" font-size="${h * 0.46}" fill="#10295e" text-anchor="middle" textLength="${w * 0.8}" lengthAdjust="spacingAndGlyphs">KXT-4861</text>
      <text x="${w / 2}" y="${h * 0.92}" font-family="Arial, Helvetica, sans-serif" font-size="${h * 0.11}" fill="#10295e" text-anchor="middle">THE EMPIRE STATE</text></g></svg>`;
    const flat = await img.png().toBuffer();
    img = sharp(flat).composite([{ input: Buffer.from(svg), left: x0, top: y0 }]);
  }
  fs.mkdirSync(DIR, { recursive: true });
  await img.png().toFile(out(name));
  console.log(name, '->', out(name));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  for (const [k, s] of Object.entries(PATCHES)) await patch(k, s);
}
