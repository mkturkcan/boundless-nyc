// GLASS PILL for the cut's on-screen credit (owner review 2026-09-24: text sits on
// a rounded, half-transparent black box with a glass blur, in a professional face,
// and no text may leave its box).
//
// Renders two PNGs sized to the measured text, in Inter (boundlessjs/public/fonts, SIL OFL):
//   <out>_pill.png  the translucent dark fill, hairline edge and text (straight alpha)
//   <out>_mask.png  the rounded-rect mask (white inside), for ffmpeg's alphamerge
// and prints {"w":..,"h":..}. cut.mjs blurs the video under the pill through the
// mask and lays the pill on top: a real backdrop blur, not a flat box.
//   node tools/ad/glasspill.mjs "Credit text" <out-prefix> [fontPx]
import { chromium } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [text, out, px = '17'] = process.argv.slice(2);
if (!text || !out) { console.log('usage: glasspill.mjs <text> <out-prefix> [fontPx]'); process.exit(1); }
const b64 = (await fs.readFile(path.join(here, '..', '..', 'boundlessjs', 'public', 'fonts', 'Inter-500.ttf'))).toString('base64');
const html = `<!doctype html><html><head><style>
@font-face{font-family:'InterPill';font-weight:500;src:url(data:font/ttf;base64,${b64}) format('truetype')}
html,body{margin:0;background:transparent}</style></head><body><canvas id="c"></canvas></body></html>`;
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
const r = await page.evaluate(async ([text, px]) => {
  await document.fonts.load(`500 ${px}px InterPill`);
  const cv = document.getElementById('c'), g = cv.getContext('2d');
  const font = `500 ${px}px InterPill`;
  g.font = font;
  const tw = Math.ceil(g.measureText(text).width);
  const padX = Math.round(px * 0.95), h = Math.round(px * 2.35), w = tw + 2 * padX, rad = Math.round(h * 0.3);
  cv.width = w; cv.height = h;
  const shape = () => { g.beginPath(); g.roundRect(0.5, 0.5, w - 1, h - 1, rad); };
  // the pill: dark translucent fill + hairline + text, all clipped to the shape
  g.clearRect(0, 0, w, h);
  shape(); g.fillStyle = 'rgba(7,9,12,0.58)'; g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 1; shape(); g.stroke();
  g.save(); shape(); g.clip();
  g.font = font; g.fillStyle = 'rgba(242,245,248,0.96)'; g.textBaseline = 'middle';
  g.fillText(text, padX, h / 2 + px * 0.04);
  g.restore();
  const pill = cv.toDataURL('image/png');
  // the mask: opaque white rounded rect on black
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.beginPath(); g.roundRect(0, 0, w, h, rad); g.fillStyle = '#fff'; g.fill();
  const mask = cv.toDataURL('image/png');
  return { w, h, pill, mask };
}, [text, Number(px)]);
await browser.close();
const put = (f, d) => fs.writeFile(f, Buffer.from(d.slice(d.indexOf(',') + 1), 'base64'));
await put(out + '_pill.png', r.pill);
await put(out + '_mask.png', r.mask);
console.log(JSON.stringify({ w: r.w, h: r.h }));
