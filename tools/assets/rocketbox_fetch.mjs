// Fetch the Microsoft Rocketbox avatars used by build_rocketbox.mjs (github.com/microsoft/Microsoft-Rocketbox, MIT) into
// ~/.tools/rocketbox/dl/<Group>/<Name>/{Export,Textures}, then convert each FBX to GLB with FBX2glTF.
//   node tools/assets/rocketbox_fetch.mjs [--only Name,...] [--noconvert]
// Only the files the builder reads are fetched: Export/<Name>.fbx and the *_color / *_normal / *_specular TGAs.
import fs from 'node:fs';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { RB_AVATARS, RB_ROOT, FBX2GLTF } from './lib/rocketbox.mjs';

const run = promisify(execFile);
const args = process.argv.slice(2);
const ONLY = (() => { const i = args.indexOf('--only'); return i >= 0 ? args[i + 1].split(',') : null; })();
const RAW = 'https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/';
const treeFile = path.join(RB_ROOT, 'tree.json');
if (!fs.existsSync(treeFile)) {
  fs.mkdirSync(RB_ROOT, { recursive: true });
  execFileSync('curl', ['-s', '-L', '-m', '120', '-o', treeFile, 'https://api.github.com/repos/microsoft/Microsoft-Rocketbox/git/trees/master?recursive=1']);
}
const tree = JSON.parse(fs.readFileSync(treeFile, 'utf8')).tree.filter((e) => e.type === 'blob');
const jobs = [];
for (const A of RB_AVATARS) {
  if (ONLY && !ONLY.includes(A.name)) continue;
  const pre = `Assets/Avatars/${A.group}/${A.name}/`;
  for (const e of tree) {
    if (!e.path.startsWith(pre)) continue;
    const rel = e.path.slice(pre.length);
    if (!(rel === `Export/${A.name}.fbx` || /^Textures\/.*_(color|normal|specular)\.tga$/i.test(rel))) continue;
    const out = path.join(RB_ROOT, 'dl', A.group, A.name, rel);
    if (fs.existsSync(out) && fs.statSync(out).size === e.size) continue;
    jobs.push({ url: RAW + e.path, out, size: e.size });
  }
}
console.log(`${jobs.length} files, ${(jobs.reduce((s, j) => s + j.size, 0) / 1e6).toFixed(0)} MB to fetch`);
const t0 = Date.now();
let next = 0, done = 0;
async function worker() {
  while (next < jobs.length) {
    const j = jobs[next++];
    fs.mkdirSync(path.dirname(j.out), { recursive: true });
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await run('curl', ['-s', '-L', '-f', '-m', '300', '-o', j.out, j.url]); if (fs.statSync(j.out).size === j.size) break; } catch (e) { if (attempt === 2) console.warn('failed', j.url, e.message); }
    }
    if (++done % 20 === 0) console.log(`  ${done}/${jobs.length} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}
await Promise.all(Array.from({ length: 12 }, worker));
console.log(`fetched in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (!args.includes('--noconvert')) {
  fs.mkdirSync(path.join(RB_ROOT, 'gltf'), { recursive: true });
  for (const A of RB_AVATARS) {
    if (ONLY && !ONLY.includes(A.name)) continue;
    const fbx = path.join(RB_ROOT, 'dl', A.group, A.name, 'Export', A.name + '.fbx');
    const out = path.join(RB_ROOT, 'gltf', A.name);
    if (!fs.existsSync(fbx)) { console.warn('missing', fbx); continue; }
    execFileSync(FBX2GLTF, ['-b', '--skinning-weights', '4', '-o', out, fbx], { stdio: 'pipe' });
  }
  console.log('converted');
}
