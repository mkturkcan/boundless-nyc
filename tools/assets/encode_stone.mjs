// Encode the campus stone detail sets (Poly Haven CC0, 2K JPG: *_col / *_nrm (OpenGL) / *_rgh) into the runtime KTX2 bank
// and print each colour map's linear mean, which the triplanar stone shader divides by so a material keeps its calibrated
// colour on average and takes only the texture's variation.
//   node tools/assets/encode_stone.mjs <srcDir> [outDir=boundlessjs/public/textures]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { BASISU } from './lib/tex.mjs';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
sharp.cache(false);

const here = path.dirname(fileURLToPath(import.meta.url));
const [,, src, outArg] = process.argv;
if (!src) { console.error('usage: node tools/assets/encode_stone.mjs <srcDir> [outDir]'); process.exit(2); }
const out = path.resolve(outArg || path.join(here, '..', '..', 'boundlessjs', 'public', 'textures'));
const SIZE = 2048;
const sets = [...new Set(fs.readdirSync(src).filter((f) => /_(col|nrm|rgh)\.jpg$/.test(f)).map((f) => f.replace(/_(col|nrm|rgh)\.jpg$/, '')))];
const means = {};
for (const s of sets) {
  for (const [suf, kind] of [['col', 'color'], ['nrm', 'normal'], ['rgh', 'data']]) {
    const f = path.join(src, `${s}_${suf}.jpg`);
    if (!fs.existsSync(f)) continue;
    const png = path.join(src, `${s}_${suf}.png`);
    await sharp(fs.readFileSync(f)).resize(SIZE, SIZE).removeAlpha().png().toFile(png);
    const dst = path.join(out, `${s}_${suf}.ktx2`);
    const args = ['-ktx2', '-mipmap', '-no_alpha', '-file', png, '-output_file', dst];
    if (kind === 'normal') args.push('-normal_map', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', '0.5');
    else if (kind === 'data') args.push('-linear', '-q', '255', '-comp_level', '2');
    else args.push('-q', '255', '-comp_level', '2');
    execFileSync(BASISU, args, { stdio: 'pipe' });
    fs.copyFileSync(f, path.join(out, `${s}_${suf}.jpg`));   // the runtime's JPG fallback
    fs.rmSync(png, { force: true });
    if (kind === 'color') {
      const { data } = await sharp(fs.readFileSync(f)).resize(256, 256).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < data.length; i += 3) { r += lin(data[i]); g += lin(data[i + 1]); b += lin(data[i + 2]); }
      const n = data.length / 3;
      means[s] = [r / n, g / n, b / n].map((v) => +v.toFixed(4));
    }
    console.log(`${s}_${suf}.ktx2  ${(fs.statSync(dst).size / 1048576).toFixed(2)} MB`);
  }
}
console.log('linear means:', JSON.stringify(means));
