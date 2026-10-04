// SHADOW / POP-IN STEP SCAN (promoted 2026-10-03 from the lead's film scratch stepscan2.cjs, which found the SC31 near-cascade edge
// in t3Crane 2026-09-29; tools/ad/temporal_scan.py runs the same test in Python inside qa_scan.py). Pop-in finder for a recorded take:
// frame-to-frame mean absolute difference on a 320x180 greyscale copy, per region (a 16 x 6 grid, the top four rows), and the
// frames where a region's difference jumps above 1.8x its local median (the 3 frames either side) + 2.0.
// Smooth camera motion changes every frame by a similar amount; a building, a LOD or a shadow popping in is a one-frame jump.
//   node tools/ad/stepscan.cjs <clipdir> [tag]     (exit 3 when it finds a jump)
const { createRequire } = require('module');
const sharp = createRequire('/data0/projectnyc/tools/assets/package.json')('sharp');
const fs = require('fs');
sharp.cache(false);
const fix = (p) => p.replace(/^\/([a-zA-Z])\//, '$1:/');
const [, , dir, tag] = process.argv;
const W = 320, H = 180, GX = 16, GY = 6;
(async () => {
  const files = fs.readdirSync(fix(dir)).filter((f) => /^frame_\d+\.jpg$/.test(f)).sort();
  const imgs = [];
  for (const f of files) imgs.push(Float32Array.from((await sharp(fix(dir) + '/' + f).resize(W, H, { fit: 'fill' }).greyscale().raw().toBuffer())));
  const n = imgs.length, D = Array.from({ length: GX * GY }, () => new Float32Array(n));
  for (let k = 1; k < n; k++) {
    const a = imgs[k - 1], b = imgs[k];
    const sums = new Float32Array(GX * GY), cnt = new Float32Array(GX * GY);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const g = Math.min(GY - 1, Math.floor((y / H) * GY)) * GX + Math.min(GX - 1, Math.floor((x / W) * GX));
      sums[g] += Math.abs(a[y * W + x] - b[y * W + x]); cnt[g]++;
    }
    for (let g = 0; g < GX * GY; g++) D[g][k] = sums[g] / cnt[g];
  }
  const hits = [];
  for (let g = 0; g < GX * GY; g++) for (let k = 2; k < n - 1; k++) {
    const win = []; for (let j = Math.max(1, k - 3); j <= Math.min(n - 1, k + 3); j++) if (j !== k) win.push(D[g][j]);
    win.sort((p, q) => p - q);
    const med = win[win.length >> 1];
    if (D[g][k] > 1.8 * med + 2.0 && Math.floor(g / GX) < 4) hits.push({ k, cell: `${g % GX},${Math.floor(g / GX)}`, d: +D[g][k].toFixed(1), med: +med.toFixed(1) });
  }
  hits.sort((p, q) => p.k - q.k);
  console.log(`${tag || dir}: ${n} frames, ${hits.length} jumps` + (hits.length ? '' : ' (clean)'));
  for (const h of hits.slice(0, 30)) console.log(`  frame ${h.k} cell ${h.cell} (col,row of 16x6)  diff ${h.d} vs local ${h.med}`);
  if (hits.length) process.exitCode = 3;
})().catch((e) => { console.error(e.message); process.exit(1); });
