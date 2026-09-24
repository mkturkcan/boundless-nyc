// One-off capture at an arbitrary URL query (debug layers, custom viewpoints).
// node tools/cap.mjs <out.png> "<query>"   e.g. node tools/cap.mjs shots/dbg6.png "x=996&y=2.5&z=-2752&yaw=2.05&pitch=0.18&time=day&facdebug=6"
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const EXES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const exe = EXES.find((p) => fs.existsSync(p));
if (!exe) { console.error('No Chrome/Edge found'); process.exit(1); }

const out = process.argv[2];
const query = process.argv[3] || '';
if (!out) { console.error('usage: node tools/cap.mjs <out.png> "<query>"'); process.exit(1); }
fs.mkdirSync(path.dirname(out), { recursive: true });

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  userDataDir: path.join(process.env.TEMP || 'data', 'pptr-' + Date.now() + '-' + Math.floor(Math.random() * 1e6)),
  args: ['--window-size=1380,820', '--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 700 });
  const errors = [];
  const verbose = process.argv.includes('--verbose');
  page.on('console', (m) => { if (verbose || m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 400)));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 160)}`); });
  const url = `http://127.0.0.1:5219/?shot=1&rel=1&${query}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  try {
    await page.waitForFunction('window.__READY === true', { timeout: 90000 });
  } catch { console.log('READY timeout — capturing anyway'); }
  const wIdx = process.argv.indexOf('--wait');
  await new Promise((s) => setTimeout(s, wIdx > 0 ? parseInt(process.argv[wIdx + 1]) : 700));
  const preIdx = process.argv.indexOf('--pre'); // eval BEFORE the shot (hide meshes, tweak state)
  if (preIdx > 0 && process.argv[preIdx + 1]) {
    const r = await page.evaluate(process.argv[preIdx + 1]);
    console.log('pre:', JSON.stringify(r));
    await new Promise((s) => setTimeout(s, 350)); // a couple frames to re-render
  }
  await page.screenshot({ path: out });
  if (process.argv.includes('--shimmer')) {
    const s = await page.evaluate('window.__SHIMMER ? window.__SHIMMER() : -1');
    console.log('shimmer:', typeof s === 'number' ? s.toFixed(3) : s);
  }
  const evalIdx = process.argv.indexOf('--eval');
  if (evalIdx > 0 && process.argv[evalIdx + 1]) {
    const r = await page.evaluate(process.argv[evalIdx + 1]);
    console.log('eval:', JSON.stringify(r));
  }
  const uniq = [...new Set(errors)];
  console.log(`captured ${out}${uniq.length ? ' | msgs:\n  ' + uniq.slice(0, verbose ? 40 : 8).join('\n  ') : ''}`);
} finally { await browser.close(); }
