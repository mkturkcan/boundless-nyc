// Headless screenshot harness (Edge via puppeteer-core).
// node tools/shot.mjs <preset|all> [--time day|golden|dusk|night]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const exe = EDGE_PATHS.find((p) => fs.existsSync(p));
if (!exe) { console.error('No Edge/Chrome found'); process.exit(1); }

import { project } from '../src/shared/geo.js';
// presets from real lon/lat + camera offset
const P = (lon, lat, y, yaw, pitch, dx = 0, dz = 0) => {
  const [x, z] = project(lon, lat);
  return { x: x + dx, y, z: z + dz, yaw, pitch };
};
const PRESETS = {
  columbia:   P(-73.96225, 40.80753, 3, -2.1, 0.12),          // College Walk center looking NE at Low
  lowplaza:   P(-73.96190, 40.80800, 26, 2.9, -0.05),         // above Low steps looking S down campus
  harlem125:  P(-73.94510, 40.80770, 4, 2.15, 0.10),          // 125th & Lenox intersection looking W
  stjohn:     P(-73.96140, 40.80410, 22, 0.9, 0.02),          // Amsterdam Ave over Morningside Park
  riverside:  P(-73.96120, 40.81120, 70, -2.5, -0.02),        // air near Riverside Church
  midtown:    P(-73.97730, 40.75200, 60, 0.35, 0.18),         // Park Ave S air looking N
  esbAir:     P(-73.98000, 40.74400, 380, 0.35, -0.3),        // air SE of ESB looking NW
  skylineS:   P(-73.97200, 40.72800, 260, 0.15, -0.05),       // East Village air looking N at Midtown
  downtown:   P(-73.99800, 40.70000, 300, -0.75, -0.18),      // over East River looking NW at FiDi
  bkbridge:   P(-73.99920, 40.70780, 40, -0.9, 0.0),          // near Brooklyn Bridge anchorage
  streetlevel:P(-73.98565, 40.74980, 3, -0.6, 0.2),           // Herald Sq street level
  canyon5th:  P(-73.98110, 40.75390, 3, 2.95, 0.22),          // 5th Ave & 42nd looking S
  fardowntown:P(-74.03000, 40.74000, 150, -2.4, -0.02),       // Hudson looking SE at downtown
  timessq:    P(-73.98590, 40.75730, 3, -0.35, 0.2),          // bowtie south end looking N at billboards
  esbNight:   P(-73.99000, 40.74100, 320, 0.6, -0.12),        // air SW of ESB looking NE over Midtown
};
const args = process.argv.slice(2);
const which = args[0] && !args[0].startsWith('--') ? args[0] : 'all';
const time = args.includes('--time') ? args[args.indexOf('--time') + 1] : 'day';
const names = which === 'all' ? Object.keys(PRESETS) : which.split(',');

fs.mkdirSync('shots', { recursive: true });
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  userDataDir: path.join(process.env.TEMP || 'data', 'pptr-' + Date.now()),
  args: ['--window-size=1380,820', '--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
});
try {
  for (const name of names) {
    const p = PRESETS[name];
    if (!p) { console.log('unknown preset', name); continue; }
    const page = await browser.newPage();
    await page.setViewport({ width: 1380, height: 820 });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 400)));
    const url = `http://127.0.0.1:5219/?shot=1&rel=1&x=${p.x}&y=${p.y}&z=${p.z}&yaw=${p.yaw}&pitch=${p.pitch}&time=${time}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    try {
      await page.waitForFunction('window.__READY === true', { timeout: 90000 });
      await new Promise((s) => setTimeout(s, 700));
    } catch { console.log(name, ': READY timeout — capturing anyway'); }
    await page.screenshot({ path: `shots/${name}_${time}.png` });
    const uniq = [...new Set(errors)];
    console.log(`shot ${name}_${time}.png ${uniq.length ? '| errs:\n  ' + uniq.slice(0, 12).join('\n  ') : ''}`);
    await page.close();
  }
} finally { await browser.close(); }
