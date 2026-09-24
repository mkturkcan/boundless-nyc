#!/usr/bin/env node
// -----------------------------------------------------------------------------
// server/build.mjs — the BoundlessNYC RELEASE, laid out like a CARLA release:
//
//   BoundlessNYC_<version>_<platform>/
//     BoundlessNYC(.exe)          the simulation server (Electron: Chromium + the boundless.js page, TCP API on :2000)
//     Content/                    the built app and the streamed city (tools/package.mjs --content-only; no raw data)
//     PythonAPI/                  the `boundless` package (source + wheel), examples, README
//     Docs/                       getting started, Python API reference, wire protocol
//     StartServer.bat / .sh       launchers (window / headless)
//     README.md LICENSE LICENSING.md ACKNOWLEDGEMENTS.md CITATION.cff
//
//   node server/build.mjs                          Windows x64 release in release/ (content copied)
//   node server/build.mjs --link                   hardlink the content instead of copying (same volume, instant)
//   node server/build.mjs --skip-content           reuse release/<name>/Content from the last build
//   node server/build.mjs --platform linux         a Linux x64 server (downloads that Electron runtime once)
//   node server/build.mjs --zip                    ... and zip the release folder, Content/ included, into
//                                                  BoundlessNYC-<version>-<platform>.zip (the GitHub release asset)
//   node server/build.mjs --out D:/releases        output directory
//
// Nothing here pushes, uploads or publishes: the release is a folder (and optionally a zip) on disk.
// -----------------------------------------------------------------------------
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const require = createRequire(import.meta.url);
const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const opt = (n, d = null) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };

const pkg = JSON.parse(await fs.readFile(path.join(here, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const platform = opt('platform', process.platform === 'win32' ? 'win32' : process.platform);
const arch = opt('arch', 'x64');
const tag = platform === 'win32' ? 'win64' : `${platform}-${arch}`;
const NAME = `BoundlessNYC_${VERSION}_${tag}`;
const outRoot = path.resolve(root, opt('out', 'release'));
const rel = path.join(outRoot, NAME);
const log = (...a) => console.log(...a);
const MB = (b) => (b / 1048576).toFixed(1);

async function copyDir(src, dst, filter = () => true) {
  await fs.mkdir(dst, { recursive: true });
  for (const e of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (!filter(s, e)) continue;
    if (e.isDirectory()) await copyDir(s, d, filter);
    else if (e.isFile()) await fs.copyFile(s, d);
  }
}
async function treeSize(dir) {
  let files = 0, bytes = 0;
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const t = await treeSize(p); files += t.files; bytes += t.bytes; }
    else if (e.isFile()) { files++; bytes += (await fs.stat(p)).size; }
  }
  return { files, bytes };
}
const run = (cmd, args, o = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, ...o });
  if (r.error || r.status !== 0) throw new Error(`${path.basename(cmd)} ${args.join(' ')} failed (${r.error?.code || 'exit ' + r.status})`);
};

log(`BoundlessNYC release builder\n  version  ${VERSION}\n  target   ${platform}-${arch}\n  output   ${rel}\n`);
await fs.mkdir(outRoot, { recursive: true });

// ---------------------------------------------------------------- 1. the server executable
// @electron/packager: server/ (main.js, preload.js, package.json) into resources/app.asar next to the Electron runtime,
// renamed BoundlessNYC. The runtime zip comes from Electron's own download cache (npm install put the host platform's
// there); another platform is fetched once by @electron/get.
{
  const { packager } = await import('@electron/packager').catch(() => ({ packager: null }))
    .then((m) => (m.packager ? m : { packager: m.default }));
  if (!packager) throw new Error('@electron/packager is not installed (cd server && npm install)');
  const stage = path.join(outRoot, '.stage');
  await fs.rm(stage, { recursive: true, force: true });
  log('· packaging the Electron server');
  const outs = await packager({
    dir: here, name: 'BoundlessNYC', executableName: 'BoundlessNYC', platform, arch,
    electronVersion: require('electron/package.json').version,
    out: stage, overwrite: true, asar: true, prune: true, quiet: true,
    ignore: [/^\/build\.mjs$/, /^\/node_modules($|\/)/, /^\/\.stage($|\/)/],
    appVersion: VERSION, appCopyright: 'Copyright (c) 2026 Mehmet Kerem Turkcan (MIT)',
    win32metadata: { CompanyName: 'boundless.js', FileDescription: 'BoundlessNYC simulation server', ProductName: 'BoundlessNYC', InternalName: 'BoundlessNYC' },
  });
  const built = outs[0];
  // keep Content/ across rebuilds (it is the slow part); replace everything else
  const keepContent = flag('skip-content') && existsSync(path.join(rel, 'Content', 'index.html'));
  if (keepContent) await fs.rename(path.join(rel, 'Content'), path.join(outRoot, '.content-keep'));
  await fs.rm(rel, { recursive: true, force: true });
  await fs.rename(built, rel);
  if (keepContent) await fs.rename(path.join(outRoot, '.content-keep'), path.join(rel, 'Content'));
  await fs.rm(stage, { recursive: true, force: true });
  log(`  ${path.relative(root, rel)}  (${platform === 'win32' ? 'BoundlessNYC.exe' : 'BoundlessNYC'})`);
}

// ---------------------------------------------------------------- 2. Content/
if (!flag('skip-content') || !existsSync(path.join(rel, 'Content', 'index.html'))) {
  log('· building Content/ (tools/package.mjs --content-only)');
  run(process.execPath, [path.join(root, 'tools', 'package.mjs'), '--content-only', '--out', path.join(rel, 'Content'), ...(flag('link') ? ['--link'] : [])]);
} else log('· Content/ kept from the last build (--skip-content)');

// ---------------------------------------------------------------- 3. PythonAPI/
{
  log('· PythonAPI/');
  const src = path.join(root, 'PythonAPI'), dst = path.join(rel, 'PythonAPI');
  await fs.rm(dst, { recursive: true, force: true });
  const skip = /(__pycache__|\.egg-info|^build$|_out|\.pyc$)/;
  await copyDir(src, dst, (p, e) => !skip.test(e.name) && !(e.isDirectory() && e.name === 'dist'));
  // the wheel: built fresh when uv is around, else the last one in PythonAPI/dist
  await fs.mkdir(path.join(dst, 'dist'), { recursive: true });
  const uv = [process.env.UV, path.join(process.env.USERPROFILE || process.env.HOME || '', '.local', 'uv', process.platform === 'win32' ? 'uv.exe' : 'uv'), 'uv'].filter(Boolean)
    .find((c) => c === 'uv' || existsSync(c));
  let wheelOk = false;
  if (uv) {
    const r = spawnSync(uv, ['build', '--wheel', '--out-dir', path.join(dst, 'dist'), src], { stdio: 'inherit', cwd: src });
    wheelOk = !r.error && r.status === 0;
  }
  if (!wheelOk && existsSync(path.join(src, 'dist'))) {
    for (const f of await fs.readdir(path.join(src, 'dist'))) if (f.endsWith('.whl')) { await fs.copyFile(path.join(src, 'dist', f), path.join(dst, 'dist', f)); wheelOk = true; }
  }
  for (const d of ['build', 'boundless.egg-info']) await fs.rm(path.join(src, d), { recursive: true, force: true });
  log(wheelOk ? '  wheel in PythonAPI/dist' : '  ! no wheel (install uv, or `pip install -e PythonAPI` works from the source)');
}

// ---------------------------------------------------------------- 4. docs, launchers, legal
{
  log('· Docs/, README, launchers, LICENSE');
  const docsSrc = path.join(root, 'docs', 'api');
  await fs.rm(path.join(rel, 'Docs'), { recursive: true, force: true });
  await fs.mkdir(path.join(rel, 'Docs'), { recursive: true });
  for (const f of ['getting_started.md', 'python_api.md', 'protocol.md']) {
    if (existsSync(path.join(docsSrc, f))) await fs.copyFile(path.join(docsSrc, f), path.join(rel, 'Docs', f));
  }
  if (existsSync(path.join(docsSrc, 'RELEASE_README.md'))) {
    const t = (await fs.readFile(path.join(docsSrc, 'RELEASE_README.md'), 'utf8')).replaceAll('{{VERSION}}', VERSION);
    await fs.writeFile(path.join(rel, 'README.md'), t);
  }
  // the packager leaves Electron's own MIT licence at the root; keep it under its own name next to ours
  if (existsSync(path.join(rel, 'LICENSE')) && !existsSync(path.join(rel, 'LICENSE.electron.txt'))) {
    await fs.rename(path.join(rel, 'LICENSE'), path.join(rel, 'LICENSE.electron.txt'));
  }
  for (const f of ['LICENSE', 'LICENSING.md', 'ACKNOWLEDGEMENTS.md', 'CITATION.cff']) {
    if (existsSync(path.join(root, f))) await fs.copyFile(path.join(root, f), path.join(rel, f));
  }
  // the launchers clear ELECTRON_RUN_AS_NODE: inherited from an Electron-based parent (an editor's tool host), it makes
  // the runtime start as plain Node, which rejects the server's options and exits
  if (platform === 'win32') {
    const bat = (extra) => `@echo off\r\nrem BoundlessNYC simulation server. Options: --port 2000 --res 1280x720 --quality high^|medium --time day --headless\r\ncd /d "%~dp0"\r\nset ELECTRON_RUN_AS_NODE=\r\nstart "" "%~dp0BoundlessNYC.exe" ${extra}%*\r\n`;
    await fs.writeFile(path.join(rel, 'StartServer.bat'), bat(''));
    await fs.writeFile(path.join(rel, 'StartServer_Headless.bat'), bat('--headless '));
  } else {
    const sh = (extra) => `#!/bin/sh\n# BoundlessNYC simulation server. Options: --port 2000 --res 1280x720 --quality high|medium --time day --headless\ncd "$(dirname "$0")"\nunset ELECTRON_RUN_AS_NODE\nexec ./BoundlessNYC ${extra}"$@"\n`;
    await fs.writeFile(path.join(rel, 'StartServer.sh'), sh(''), { mode: 0o755 });
    await fs.writeFile(path.join(rel, 'StartServer_Headless.sh'), sh('--headless '), { mode: 0o755 });
  }
  // what is in the box (sizes), for the release notes
  const parts = [];
  for (const d of ['Content', 'PythonAPI', 'Docs', 'resources']) if (existsSync(path.join(rel, d))) parts.push([d, await treeSize(path.join(rel, d))]);
  const total = await treeSize(rel);
  await fs.writeFile(path.join(rel, 'RELEASE.json'), JSON.stringify({
    name: NAME, version: VERSION, platform, arch, built: new Date().toISOString(),
    electron: require('electron/package.json').version,
    parts: Object.fromEntries(parts.map(([d, t]) => [d, { files: t.files, mb: +MB(t.bytes) }])),
    total: { files: total.files, mb: +MB(total.bytes) },
  }, null, 2) + '\n');
  log(`  ${total.files.toLocaleString('en-US')} files, ${MB(total.bytes)} MB`);
}

// ---------------------------------------------------------------- 5. zip
// the GitHub release asset: the whole folder, Content/ included. GitHub caps one release asset at 2 GiB; deflate
// shrinks the tiles to about a quarter, so the Windows archive stays well under the cap.
if (flag('zip')) {
  const zip = path.join(outRoot, `BoundlessNYC-${VERSION}-${tag}.zip`);
  await fs.rm(zip, { force: true });
  log(`· zipping ${path.basename(zip)} (GB-scale: a few minutes)`);
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'zip';
  if (process.platform === 'win32') run(tar, ['-a', '-c', '-f', zip, '-C', outRoot, NAME]);
  else run(tar, ['-r', '-q', zip, NAME], { cwd: outRoot });
  const bytes = (await fs.stat(zip)).size;
  log(`  ${path.relative(root, zip)}  ${MB(bytes)} MB`);
  if (bytes >= 2 ** 31) log('  ! 2 GiB or more: too large for one GitHub release asset');
}
log(`\ndone: ${path.relative(root, rel)}\nrun:  ${platform === 'win32' ? 'StartServer.bat' : './StartServer.sh'}   then   python PythonAPI/examples/quickstart.py`);
