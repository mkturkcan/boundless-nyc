// Render an HTML or SVG file to PNG/JPEG with headless Chromium (Playwright).
//
//   node tools/figures/render.mjs <in.html|in.svg> <out.png|out.jpg> [--width 2400] [--height 1200] [--scale 1] [--quality 90]
//
// HTML templates size themselves: the page is shot at --width x --height CSS pixels (times --scale).
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const [, , inp, out, ...rest] = process.argv;
const opt = (n, d) => { const i = rest.indexOf('--' + n); return i >= 0 ? rest[i + 1] : d; };
const width = +opt('width', 2400), height = +opt('height', 1200), scale = +opt('scale', 1), quality = +opt('quality', 90);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
await page.goto(pathToFileURL(path.resolve(inp)).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts && document.fonts.ready);
await page.waitForTimeout(150);
const jpeg = /\.jpe?g$/i.test(out);
await page.screenshot({ path: out, type: jpeg ? 'jpeg' : 'png', quality: jpeg ? quality : undefined, fullPage: false });
await browser.close();
console.log('wrote', out);
