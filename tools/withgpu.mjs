#!/usr/bin/env node
// Run any command while holding the machine's GPU lock (tools/gpulock.mjs), so renders from different tools and
// sessions queue instead of sharing the GPU.
//   node tools/withgpu.mjs <label> -- <command> [args...]
import { spawn } from 'node:child_process';
import { acquireGpu } from './gpulock.mjs';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
if (sep < 1 || sep === argv.length - 1) {
  console.error('usage: node tools/withgpu.mjs <label> -- <command> [args...]');
  process.exit(2);
}
const label = argv.slice(0, sep).join(' ');
const [cmd, ...args] = argv.slice(sep + 1);
const release = await acquireGpu(label);
// no shell: arguments pass through unmangled (a .bat/.cmd needs `cmd.exe /c file.bat` as the command)
const child = spawn(cmd, args, { stdio: 'inherit', shell: false });
const done = (code) => { try { release(); } catch { /* */ } process.exit(code ?? 1); };
child.on('exit', (code) => done(code));
child.on('error', (e) => { console.error(e.message); done(1); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { child.kill(); done(130); });
