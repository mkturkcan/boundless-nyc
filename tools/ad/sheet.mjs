// AD VIDEO — contact sheet of the final cut: one labelled frame per scene.
//
// Reads client/shots/ad/timeline.json (written by tools/ad/cut.mjs), pulls
// one frame from the middle of every scene out of the finished mp4, burns the
// scene name and its in-point on it, and tiles the lot into one PNG. That is
// the artefact to look at when deciding whether the cut holds up, because a
// bad framing is obvious in a grid and invisible in a 3-minute play-through.
//
//   node tools/ad/sheet.mjs
//   node tools/ad/sheet.mjs --cols 4 --cell 620 --at 0.3
//
// Output: client/shots/ad/nyc_twin_ad_sheet.png
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const bin = (await import('ffmpeg-static')).default;

const adRoot = path.resolve(root, 'client/shots/ad');
const mp4 = path.resolve(root, opt('in', 'client/shots/ad/nyc_twin_ad.mp4'));
const tl = path.join(adRoot, 'timeline.json');
const out = path.resolve(root, opt('out', 'client/shots/ad/nyc_twin_ad_sheet.png'));
const cellW = Number(opt('cell', '620'));
const at = Number(opt('at', '0.45'));      // fraction into each scene
const tmp = path.join(adRoot, '_sheet');

if (!existsSync(mp4)) { console.log('no cut yet:', path.relative(root, mp4)); process.exit(1); }
if (!existsSync(tl)) { console.log('no timeline.json — run tools/ad/cut.mjs first'); process.exit(1); }
const T = JSON.parse(await fs.readFile(tl, 'utf8'));
const scenes = T.scenes || [];
if (!scenes.length) { console.log('timeline has no scenes'); process.exit(1); }

await fs.rm(tmp, { recursive: true, force: true });
await fs.mkdir(tmp, { recursive: true });
const font = path.join(tmp, 'lato-sb.ttf');
await fs.copyFile('C:/Windows/Fonts/LatoWeb-Semibold.ttf', font).catch(() => {});
const cellH = Math.round((cellW * 9) / 16) + 34;   // 34 px label strip under each frame

// One cell per scene, plus any extra sample points the timeline asks for: a
// scene built as a DISSOLVE between two sources (`dataCity` is the data drawing
// cross-faded into the render of the same camera) shows only one of its halves
// at a single sample, and the sheet is what the framings are reviewed on.
const shots = [];
scenes.forEach((s, i) => {
  const label = `${String(i + 1).padStart(2, '0')}  ${s.n.replace(/^\d+_/, '')}`;
  shots.push({ t: s.start + s.dur * at, label: `${label}   ${s.start.toFixed(1)}s / ${s.dur.toFixed(1)}s` });
  for (const e of s.sheetExtra || []) shots.push({ t: s.start + s.dur * e.at, label: `${label} · ${e.tag}` });
});

const tiles = [];
for (let i = 0; i < shots.length; i++) {
  const f = path.join(tmp, `t${String(i).padStart(2, '0')}.png`);
  await fs.writeFile(path.join(tmp, `l${i}.txt`), shots[i].label);
  const r = spawnSync(bin, ['-y', '-ss', shots[i].t.toFixed(3), '-i', mp4, '-frames:v', '1',
    '-vf', `scale=${cellW}:-2,pad=${cellW}:${cellH}:0:0:color=0x0E0F11,` +
      `drawtext=fontfile=lato-sb.ttf:textfile=l${i}.txt:x=12:y=${cellH - 26}:fontsize=17:fontcolor=0xECECEC`,
    f], { encoding: 'utf8', cwd: tmp });
  if (r.status !== 0) { console.log(`frame ${shots[i].label} failed:\n` + (r.stderr || '').split('\n').slice(-6).join('\n')); continue; }
  tiles.push(f);
}
if (!tiles.length) { console.log('no tiles'); process.exit(1); }

const n = tiles.length;
// xstack refuses inputs=1, and a one-scene sheet is just the frame itself
if (n === 1) {
  await fs.copyFile(tiles[0], out);
  await fs.rm(tmp, { recursive: true, force: true });
  console.log(`sheet ${path.relative(root, out)}  1 scene (single frame, no grid)`);
  process.exit(0);
}
const cols = Number(opt('cols', String(Math.min(n, Math.ceil(Math.sqrt(n * 1.6))))));
const rows = Math.ceil(n / cols);
// xstack needs a full grid: pad the tail with dark cells
while (tiles.length < cols * rows) {
  const f = path.join(tmp, `pad${tiles.length}.png`);
  spawnSync(bin, ['-y', '-f', 'lavfi', '-i', `color=c=0x0E0F11:s=${cellW}x${cellH}`, '-frames:v', '1', f], { encoding: 'utf8' });
  tiles.push(f);
}
const layout = tiles.map((_, i) => {
  const cx = i % cols, cy = Math.floor(i / cols);
  return `${cx === 0 ? '0' : Array.from({ length: cx }, (_, k) => `w${k}`).join('+')}_` +
         `${cy === 0 ? '0' : Array.from({ length: cy }, (_, k) => `h${k * cols}`).join('+')}`;
}).join('|');

const inputs = [];
for (const f of tiles) inputs.push('-i', f);
const r = spawnSync(bin, [...inputs, '-filter_complex',
  `xstack=inputs=${tiles.length}:layout=${layout}[v]`, '-map', '[v]', '-frames:v', '1', '-y', out],
  { encoding: 'utf8', maxBuffer: 1 << 26 });
if (r.status !== 0) { console.log('xstack failed:\n' + (r.stderr || '').split('\n').slice(-14).join('\n')); process.exit(1); }
await fs.rm(tmp, { recursive: true, force: true });
console.log(`sheet ${path.relative(root, out)}  ${cols}x${rows}  ${n} cells (${scenes.length} scenes)  ${(statSync(out).size / 1e6).toFixed(1)} MB`);
