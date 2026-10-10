// Offline scan of recorded takes (film 7, 2026-09-23): the recorder's black-half rule (record.mjs blackHalf) plus a
// size-vs-median check over every frame, so a take that shipped a kept-after-4-attempts frame is found before the cut.
//   node tools/ad/scanclips.mjs [take ...]        (default: every take folder under client/shots/ad/clips)
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const sharp = createRequire(path.resolve(here, '..', 'assets', 'package.json'))('sharp');
sharp.cache(false);
const clipRoot = path.join(root, 'client/shots/ad/clips');
const args = process.argv.slice(2);
const takes = args.length ? args : (await fs.readdir(clipRoot, { withFileTypes: true })).filter((d) => d.isDirectory() && !/^twin_/.test(d.name)).map((d) => d.name);

async function halves(buf) {
  const { data, info } = await sharp(buf).removeAlpha().resize(64, 36, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, s = [0, 0, 0, 0], n = [0, 0, 0, 0];
  let all = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3, l = (data[i] + data[i + 1] + data[i + 2]) / 3;
    all += l;
    for (const h of [x < W / 2 ? 0 : 1, y < H / 2 ? 2 : 3]) { s[h] += l; n[h]++; }
  }
  const h = s.map((v, k) => v / n[k]);
  all /= W * H;
  const bad = all > 20 && ((h[0] < 8 && h[1] > 30) || (h[1] < 8 && h[0] > 30) || (h[2] < 3 && h[3] > 40) || (h[3] < 3 && h[2] > 40));
  return { bad, h };
}

let total = 0, flagged = 0;
for (const t of takes) {
  const dir = path.join(clipRoot, t);
  const files = (await fs.readdir(dir)).filter((f) => /^frame_\d{5}\.jpg$/.test(f)).sort();
  if (!files.length) continue;
  const sizes = [];
  for (const f of files) sizes.push((await fs.stat(path.join(dir, f))).size);
  const med = [...sizes].sort((a, b) => a - b)[sizes.length >> 1];
  const bad = [];
  for (let i = 0; i < files.length; i++) {
    const r = await halves(await fs.readFile(path.join(dir, files[i])));
    const small = sizes[i] < med * 0.8;
    if (r.bad || small) bad.push(`${i}${r.bad ? 'B' : ''}${small ? 'S' : ''}`);
  }
  total += files.length; flagged += bad.length;
  console.log(`${t.padEnd(22)} ${String(files.length).padStart(4)} frames  median ${(med / 1024).toFixed(0)}KB  ${bad.length ? 'FLAGGED ' + bad.length + ': ' + bad.join(' ') : 'clean'}`);
}
console.log(`${total} frames, ${flagged} flagged (B = black half, S = under 80 % of the take's median size)`);
