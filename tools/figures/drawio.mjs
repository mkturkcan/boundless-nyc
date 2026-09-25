// Render a draw.io diagram to SVG and PNG with the draw.io viewer in headless Chromium (Playwright).
//
//   node tools/figures/drawio.mjs <in.drawio> [--svg out.svg] [--png out.png] [--scale 3] [--border 16]
//
// The viewer is draw.io's own renderer (pinned below), so the output matches the desktop application. Labels should
// be plain text (html=0) so the SVG carries native <text> elements; the PNG is a rasterisation of that SVG.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const VIEWER = 'https://cdn.jsdelivr.net/gh/jgraph/drawio@v24.8.6/src/main/webapp/js/viewer-static.min.js';
const [, , inp, ...rest] = process.argv;
const opt = (n, d) => { const i = rest.indexOf('--' + n); return i >= 0 ? rest[i + 1] : d; };
if (!inp) { console.error('usage: node tools/figures/drawio.mjs <in.drawio> [--svg out.svg] [--png out.png] [--scale 3] [--border 16]'); process.exit(1); }
const svgOut = opt('svg', inp.replace(/\.drawio$/, '.svg'));
const pngOut = opt('png', null);
const scale = +opt('scale', 3), border = +opt('border', 16);

const xml = fs.readFileSync(inp, 'utf8');
const tmp = path.join(path.dirname(path.resolve(svgOut)), `.drawio_${process.pid}.html`);
fs.writeFileSync(tmp, `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff">
<div id="host"></div><script>window.DRAWIO_XML = ${JSON.stringify(xml)};</script><script src="${VIEWER}"></script></body></html>`);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' });
  const svg = await page.evaluate((border) => new Promise((resolve) => {
    const div = document.createElement('div');
    div.className = 'mxgraph';
    div.setAttribute('data-mxgraph', JSON.stringify({ xml: window.DRAWIO_XML, border: 0, toolbar: null, lightbox: false, nav: false }));
    document.getElementById('host').appendChild(div);
    // getSvg(background, scale, border, nocrop, crisp, ignoreSelection)
    GraphViewer.createViewerForElement(div, (v) => resolve(new XMLSerializer().serializeToString(v.graph.getSvg('#ffffff', 1, border, false, null, true))));
  }), border);
  fs.writeFileSync(svgOut, '<?xml version="1.0" encoding="UTF-8"?>\n' + svg + '\n');
  const [w, h] = svg.match(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/).slice(1).map(Number);
  console.log(`wrote ${svgOut} (${Math.round(w)} x ${Math.round(h)})`);
  if (pngOut) {
    fs.writeFileSync(tmp, `<!doctype html><html><body style="margin:0;background:#fff"><img id="d" src="${pathToFileURL(path.resolve(svgOut)).href}" style="display:block;width:${w}px;height:${h}px"></body></html>`);
    const p2 = await browser.newPage({ viewport: { width: Math.ceil(w), height: Math.ceil(h) }, deviceScaleFactor: scale });
    await p2.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' });
    await p2.locator('#d').screenshot({ path: pngOut });
    console.log(`wrote ${pngOut} (${Math.round(w * scale)} x ${Math.round(h * scale)})`);
  }
} finally {
  await browser.close();
  fs.rmSync(tmp, { force: true });
}
