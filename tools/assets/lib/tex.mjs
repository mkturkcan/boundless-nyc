// Texture stage: exported UE PNG -> resized, convention-fixed PNG -> KTX2 (Basis Universal), cached on disk.
//   kind 'color'  sRGB albedo (RGB, or RGBA when keepAlpha)       -> UASTC (quality) or ETC1S (small)
//   kind 'normal' DirectX-green tangent normal -> OpenGL (G flipped), renormalised -> UASTC, linear
//   kind 'data'   linear packed masks (ORM etc.)                   -> UASTC, linear
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

export const BASISU = (process.env.ASSET_TOOLS || `${process.env.USERPROFILE || process.env.HOME}/.tools`) + '/basisu/basis_universal-1_60/bin/basisu.exe';
export const CACHE = (process.env.ASSET_TOOLS || `${process.env.USERPROFILE || process.env.HOME}/.tools`) + '/texcache';
fs.mkdirSync(CACHE, { recursive: true });

// Build a resized raw RGBA buffer. sharp premultiplies alpha when resizing, which zeroes the RGB of
// alpha-0 texels (CARLA details basecolors carry A = 0 everywhere) — so resize RGB and A separately.
async function loadResized(file, size, keepAlpha) {
  const meta = await sharp(file).metadata();
  const w = Math.min(size, meta.width), h = Math.min(size, meta.height);
  // two passes: within ONE sharp pipeline removeAlpha() runs after the (premultiplied) resize
  const full = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgb = await sharp(full.data, { raw: { width: full.info.width, height: full.info.height, channels: full.info.channels } })
    .resize(w, h, { kernel: 'lanczos3' }).raw().toBuffer();
  let a = null;
  if (keepAlpha && meta.channels === 4) {
    const fa = await sharp(file).extractChannel(3).raw().toBuffer({ resolveWithObject: true });
    a = await sharp(fa.data, { raw: { width: fa.info.width, height: fa.info.height, channels: 1 } }).resize(w, h, { kernel: 'lanczos3' }).raw().toBuffer();
  }
  if (full.info.channels !== 3) throw new Error(`${path.basename(file)}: expected 3 channels after removeAlpha, got ${full.info.channels}`);
  return { rgb, a, w, h };
}

// ops: optional per-texel transform (r, g, b, a) -> [r, g, b, a] run on 0..255 values
export async function makeTexture(src, { kind = 'color', size = 1024, mode = 'uastc', keepAlpha = false, ops = null, tag = '' } = {}) {
  const stat = fs.statSync(src);
  const key = crypto.createHash('sha1').update([src, stat.size, stat.mtimeMs, kind, size, mode, keepAlpha, tag, ops ? String(ops) : ''].join('|')).digest('hex').slice(0, 16);
  const base = path.basename(src, '.png');
  const out = path.join(CACHE, `${base}_${size}_${kind}_${mode}_${key}.ktx2`);
  if (fs.existsSync(out)) return { file: out, bytes: fs.readFileSync(out) };
  const { rgb, a, w, h } = await loadResized(src, size, keepAlpha);
  const n = w * h;
  const px = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    let r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2], al = a ? a[i] : 255;
    if (kind === 'normal') {
      // DirectX -> OpenGL green, then renormalise (resampling shortens vectors)
      let x = r / 127.5 - 1, y = -(g / 127.5 - 1), z = b / 127.5 - 1;
      if (z < 0) z = 0;
      const l = Math.hypot(x, y, z) || 1;
      x /= l; y /= l; z /= l;
      r = Math.round((x + 1) * 127.5); g = Math.round((y + 1) * 127.5); b = Math.round((z + 1) * 127.5);
    }
    if (ops) [r, g, b, al] = ops(r, g, b, al);
    px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = al;
  }
  const png = out.replace(/\.ktx2$/, '.png');
  await sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toFile(png);
  const args = ['-ktx2', '-mipmap', '-file', png, '-output_file', out];
  if (!keepAlpha) args.push('-no_alpha');
  if (kind === 'normal') args.push('-normal_map');
  else if (kind === 'data') args.push('-linear');
  if (mode === 'uastc') args.push('-uastc', '-uastc_level', '2', '-uastc_rdo_l', kind === 'normal' ? '0.5' : '1.0');
  else args.push('-q', '255', '-comp_level', '2');
  execFileSync(BASISU, args, { stdio: 'pipe' });
  fs.rmSync(png, { force: true });
  return { file: out, bytes: fs.readFileSync(out) };
}

// sample helper for classification passes (nearest texel, 0..255 RGBA), cached per file
const _samplers = new Map();
export async function sampler(file, size = 512) {
  const k = file + '|' + size;
  if (_samplers.has(k)) return _samplers.get(k);
  // native resolution: resizing some exported PNGs trips a libvips colourspace bug ("parameter space not set")
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const f = (u, v) => {
    u = ((u % 1) + 1) % 1; v = ((v % 1) + 1) % 1;
    const x = Math.min(info.width - 1, (u * info.width) | 0), y = Math.min(info.height - 1, (v * info.height) | 0);
    const o = (y * info.width + x) * ch;
    return ch >= 3 ? [data[o], data[o + 1], data[o + 2], ch === 4 ? data[o + 3] : 255] : [data[o], data[o], data[o], ch === 2 ? data[o + 1] : 255];
  };
  _samplers.set(k, f);
  return f;
}
