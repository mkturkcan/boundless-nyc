// Last resort for a recorded take (film 7, 2026-09-23): replace frames that are STILL bad after the recorder's retries
// and a range re-shoot with their nearest good neighbour (a one-frame hold, invisible at 30 fps), keeping the
// originals in <take>/_torn/ (film 6.1 did the same for 68 frames). "Bad" is tools/ad/scanclips.mjs's rule.
//   node tools/ad/patchholds.mjs <take> <frame,frame,...>
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const [take, list] = process.argv.slice(2);
if (!take || !list) { console.log('usage: node tools/ad/patchholds.mjs <take> <frame,frame,...>'); process.exit(1); }
const dir = path.join(root, 'boundlessjs/shots/ad/clips', take);
const bad = new Set(list.split(',').map(Number));
const n = (await fs.readdir(dir)).filter((f) => /^frame_\d{5}\.jpg$/.test(f)).length;
const name = (i) => path.join(dir, `frame_${String(i).padStart(5, '0')}.jpg`);
await fs.mkdir(path.join(dir, '_torn'), { recursive: true });
for (const i of [...bad].sort((a, b) => a - b)) {
  let src = -1;
  for (let d = 1; d < n && src < 0; d++) {
    if (i - d >= 0 && !bad.has(i - d)) src = i - d;          // the previous good frame first: a hold, never a jump ahead
    else if (i + d < n && !bad.has(i + d)) src = i + d;
  }
  if (src < 0) { console.log(`frame ${i}: no good neighbour`); continue; }
  await fs.copyFile(name(i), path.join(dir, '_torn', path.basename(name(i))));
  await fs.copyFile(name(src), name(i));
  console.log(`${take} frame ${i} <- ${src}`);
}
