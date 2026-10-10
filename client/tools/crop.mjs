// usage: node crop.mjs in.png out.png x y w h scale
import fs from 'node:fs'; import { PNG } from 'pngjs';
const [,, inp, outp, xs, ys, ws, hs, ss] = process.argv; const X = +xs, Y = +ys, W = +ws, H = +hs, S = +(ss || 3);
const src = PNG.sync.read(fs.readFileSync(inp));
const dst = new PNG({ width: W * S, height: H * S });
for (let y = 0; y < H * S; y++) for (let x = 0; x < W * S; x++) {
  const sx = Math.min(src.width - 1, X + Math.floor(x / S)), sy = Math.min(src.height - 1, Y + Math.floor(y / S));
  const si = (sy * src.width + sx) * 4, di = (y * W * S + x) * 4;
  dst.data[di] = src.data[si]; dst.data[di + 1] = src.data[si + 1]; dst.data[di + 2] = src.data[si + 2]; dst.data[di + 3] = 255;
}
fs.writeFileSync(outp, PNG.sync.write(dst)); console.log('wrote', outp, W * S, 'x', H * S);
