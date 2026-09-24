// PERCEPTION CLIP SCAN — does the finished panel clip have a black RGB panel
// in it? This is the authoritative answer; the in-page gate in
// `src/perception/segRender.js` only decides whether to RE-SHOOT a frame and is
// trigger-happy on purpose (a dense tree canopy sets it).
//
//   node tools/perception/scanclip.mjs
//   node tools/perception/scanclip.mjs boundlessjs/shots/perception/clip
//   node tools/perception/scanclip.mjs <dir> --w 1280 --h 720 --frames 300
//
// How it decides. When the composer runs over a region the scene never wrote,
// the colour grade lifts it to a near-constant warm black — ~(17,14,13) on this
// build, R > G >= B, every channel under ~24 — and it is dithered, not flat, so
// an exact-match test misses it. Counting the pixels of the RGB quadrant inside
// that small box separates cleanly:
//
//   the shipped 2026-09-04 clip   37 / 300 bad, 58-93 % of the quadrant
//   every other frame             under 6 %
//   the re-export after the fix    0 / 300
//
// Nothing lands between 6 % and 58 %, so the 25 % threshold has a 4x margin
// either way. A partial tear (a vertical seam with real pixels on one side)
// lands in the same band because the empty half is still a third or more of the
// frame.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const dir = path.resolve(root, args.find((a) => !a.startsWith('--')) || 'boundlessjs/shots/perception/clip');
const W = Number(opt('w', 1280)), H = Number(opt('h', 720));   // the RGB quadrant, top-left of the panel
const THRESH = Number(opt('thresh', 0.25));
const bin = (await import('ffmpeg-static')).default;

if (!existsSync(dir)) { console.log('no such directory:', dir); process.exit(1); }
const files = readdirSync(dir).filter((f) => /^frame_\d+\.png$/.test(f)).sort();
const N = Number(opt('frames', files.length));
if (!N) { console.log('no frame_%05d.png in', dir); process.exit(1); }

// sub-sample the quadrant: the artefact covers most of it, so a 1/4 grid is
// plenty and keeps a 300-frame scan under a couple of minutes
const GW = 320, GH = 165;
const bad = [];
let worst = 0, worstI = -1;
for (let i = 0; i < N; i++) {
  const f = path.join(dir, files[i]);
  const buf = execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-i', f,
    '-vf', `crop=${W}:${H - 60}:0:60,scale=${GW}:${GH}:flags=neighbor`,
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 24 });
  let hit = 0;
  const tot = GW * GH;
  for (let p = 0; p < tot; p++) {
    const r = buf[p * 3], g = buf[p * 3 + 1], b = buf[p * 3 + 2];
    if (r >= 14 && r <= 23 && g >= 11 && g <= 20 && b >= 10 && b <= 17 && r > g && g >= b) hit++;
  }
  const frac = hit / tot;
  if (frac > worst) { worst = frac; worstI = i; }
  if (frac > THRESH) bad.push([i, frac]);
}
console.log(`${path.relative(root, dir)}: ${N} frames scanned`);
if (bad.length) {
  console.log(`  BLACK / TORN RGB PANELS: ${bad.length}`);
  console.log('  ' + bad.map(([i, f]) => `${i}:${(f * 100).toFixed(0)}%`).join('  '));
} else {
  console.log('  no black or torn RGB panels');
}
console.log(`  worst frame ${worstI} at ${(worst * 100).toFixed(1)}% of the quadrant (threshold ${(THRESH * 100).toFixed(0)}%)`);
process.exit(bad.length ? 1 : 0);
