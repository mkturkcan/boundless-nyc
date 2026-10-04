// Shared GPU lock for the screenshot/record harnesses: only one headless Chromium
// renders at a time. acquire() spins on an exclusive lock file (stale after 20 min).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { installGuard } from './harness_guard.mjs';
// GPU_LANE=2 (2026-09-30): independent FIFO lanes (gpu2.lock + gpu2.queue/, gpu3...)
// so two or three renders can share the GPU when many workers render at once; lane 1 (unset or '1') is the old lock and
// queue, unchanged. Read when acquireGpu is called, so a harness can pick its lane after its imports.
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const laneOf = () => (process.env.GPU_LANE && process.env.GPU_LANE !== '1' ? String(process.env.GPU_LANE).replace(/[^0-9a-z]/gi, '') : '');
// FIFO (2026-09-17 18:35): the lock was a free-for-all — every waiter polled every 3 s and whoever polled first after a
// release won, so a plate queued at 18:18 was still waiting at 18:35 while three later arrivals rendered. Each waiter now
// registers a ticket file in gpu.queue/ (<ms>-<pid>) and only tries the lock while its ticket is the OLDEST live one;
// tickets of dead PIDs are swept by everyone. The lock file itself is unchanged, so old and new harnesses interoperate
// (an old one simply ignores the queue and may still jump it).
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; } };
// 2026-10-01 (cs3gpu, 3 GPUs): off Windows each lane renders on its own GPU. Chromium's ANGLE Vulkan takes the first device
// the Mesa device-select layer lists, and that layer puts the device named by DRI_PRIME=pci-DDDD_BB_DD_F first (tested:
// without it every page lands on GPU 2). Lane n -> GPU (n - 1) mod count (lane 1 = GPU 0, 2 = GPU 1, 3 = GPU 2, 4 = GPU 0,
// ...); GPU_INDEX overrides, a DRI_PRIME already set is kept. Playwright hands process.env to the browser,
// so setting it here, before any harness launches Chromium, pins the whole render.
function pinGpu() {
  if (process.platform === 'win32' || process.env.DRI_PRIME) return;
  let rows;
  try { rows = execFileSync('nvidia-smi', ['--query-gpu=index,pci.bus_id', '--format=csv,noheader'], { encoding: 'utf8' }).trim().split('\n').map((l) => l.split(',').map((s) => s.trim())); } catch { return; }
  if (!rows.length) return;
  const lane = laneOf(), n = /^\d+$/.test(lane) ? Number(lane) : 1;
  const idx = process.env.GPU_INDEX !== undefined ? Number(process.env.GPU_INDEX) : (n - 1) % rows.length;
  const row = rows.find((r) => Number(r[0]) === idx);
  const m = row && /([0-9a-f]+):([0-9a-f]+):([0-9a-f]+)\.([0-9a-f]+)/i.exec(row[1]);
  if (!m) return;
  process.env.DRI_PRIME = `pci-${m[1].slice(-4)}_${m[2]}_${m[3]}_${m[4]}`.toLowerCase();
  console.log(`[gpulock] lane ${lane || '1'} -> GPU ${idx} (DRI_PRIME=${process.env.DRI_PRIME})`);
}
// 2026-10-01: the NVIDIA driver's shader disk cache, one folder per lane. The driver's pipeline compiles are ~105 s of a
// 125th Street boot when cold (LOOK: READY 51-55 s warm, ~160 s cold), and the default cache (~/.cache/nvidia/GLCache on the
// nearly full home drive) sat at its ~1 GB cap with every track's shader variants evicting each other. One folder shared
// by all lanes and seeded by a copy rendered SLOWER (two runs of one view both cold, the folder shrinking 987 -> 427 MB);
// a private folder used by one process at a time: 141 s cold, then 77 s with READY on time. A lane renders one job at a
// time, so a folder per lane never has two writers. An explicit __GL_SHADER_DISK_CACHE_PATH is kept.
function laneShaderCache() {
  if (process.platform === 'win32' || process.env.__GL_SHADER_DISK_CACHE_PATH) return;
  const aux = process.env.PNYC_AUX || '/data0/projectnyc_aux';
  const dir = path.join(aux, 'cache', 'nvgl', 'lane' + (laneOf() || '1'));
  try { fs.mkdirSync(dir, { recursive: true }); } catch { return; }
  process.env.__GL_SHADER_DISK_CACHE = '1';
  process.env.__GL_SHADER_DISK_CACHE_PATH = dir;
  process.env.__GL_SHADER_DISK_CACHE_SIZE = String(4 * 1024 * 1024 * 1024);
  process.env.__GL_SHADER_DISK_CACHE_SKIP_CLEANUP = '1';
}
export async function acquireGpu(label = 'render', maxWaitMs = Number(process.env.GPU_WAIT_MS) || 40 * 60 * 1000) {   // GPU_WAIT_MS: a longer wait for a queued job behind a long queue
  const t0 = Date.now();
  // 2026-10-01: every harness that takes a lane is guarded (tools/harness_guard.mjs: its children killed on any way out,
  // a deadline, the dead harnesses' orphans swept); the wait for the lane counts toward the deadline
  try { installGuard({ name: String(label).slice(0, 40), maxMin: Math.ceil(maxWaitMs / 60000) + 60 }); } catch (e) { console.log('[gpulock] guard not installed:', e?.message || e); }
  pinGpu();
  laneShaderCache();
  const LANE = laneOf(), LOCK = path.resolve(HERE, `gpu${LANE}.lock`), QDIR = path.join(HERE, `gpu${LANE}.queue`);
  let ticket = null;
  const enqueue = () => { try { fs.mkdirSync(QDIR, { recursive: true }); ticket = path.join(QDIR, `${String(Date.now()).padStart(14, '0')}-${process.pid}`); fs.writeFileSync(ticket, label); } catch { ticket = null; } };
  const dequeue = () => { if (ticket) { try { fs.unlinkSync(ticket); } catch {} ticket = null; } };
  const myTurn = () => {
    if (!ticket) return true;
    let names; try { names = fs.readdirSync(QDIR).sort(); } catch { return true; }
    for (const n of names) {
      const pid = parseInt(n.split('-')[1]);
      if (pid !== process.pid && !alive(pid)) { try { fs.unlinkSync(path.join(QDIR, n)); } catch {} continue; }
      return path.join(QDIR, n) === ticket;   // the oldest live ticket decides
    }
    return true;
  };
  process.on('exit', dequeue);
  // 2026-09-25: take the ticket BEFORE the first try. A newcomer used to try the lock at once and only queue after a miss,
  // so one arriving just after a release (inside the oldest waiter's 3 s poll) jumped the whole queue — a chained second
  // job of the same caller always did. With an empty queue the ticket is the oldest and the first try goes ahead.
  enqueue();
  for (;;) {
    if (ticket && !myTurn()) { if (Date.now() - t0 > maxWaitMs) { dequeue(); throw new Error('gpu lock wait timed out'); } await new Promise((r) => setTimeout(r, 3000)); continue; }
    try {
      const fd = fs.openSync(LOCK, 'wx');
      dequeue();
      fs.writeSync(fd, `${process.pid} ${label} ${new Date().toISOString()}`);
      fs.closeSync(fd);
      // ---- 2026-09-11 (docs/notes/materials-r9.md §8): THE LOCK RELEASED TWICE AND
      // DELETED SOMEONE ELSE'S LOCK. `release` unlinked unconditionally and was ALSO
      // registered on `process.on('exit')`, so every harness that calls it in a `finally`
      // (bshot, tflick, record) unlinks once there and once more on exit. The gap between
      // the two is not small: bshot's finally does `await browser.close(); releaseGpu();
      // server.kill()` and then Node tears down Chromium and Vite, which takes seconds —
      // and a waiter polls every 3 s. So the waiter acquires, the departing process's exit
      // handler deletes the waiter's lock file, a THIRD process acquires, and two
      // renderers share the GPU. That is a ready-made explanation for the project's
      // long-standing "fps here is only ever valid as a same-second A/B" (two independent
      // samples of one configuration disagreeing by 7x in facades-r8.md §11.10), and it
      // was observed directly: two bshot runs rendering `lenoxRef` concurrently at
      // 08:46-08:53, fps 1.2, the dresser stuck at 16 of 48 builds.
      // Fix: release once, and only if the lock file is still OURS.
      let released = false;
      // heartbeat: a holder keeps the lock file fresh, so the 20-min stale rule below only ever frees a lock whose holder
      // stopped updating it (a long legitimate render was being taken over mid-run)
      const beat = setInterval(() => { try { if (fs.readFileSync(LOCK, 'utf8').startsWith(`${process.pid} `)) fs.utimesSync(LOCK, new Date(), new Date()); } catch {} }, 60000);
      beat.unref?.();
      const release = () => {
        if (released) return;
        released = true;
        clearInterval(beat);
        try {
          const own = fs.readFileSync(LOCK, 'utf8').startsWith(`${process.pid} `);
          if (own) fs.unlinkSync(LOCK);
        } catch {}
      };
      process.on('exit', release);
      return release;
    } catch (e) {
      if (e.code !== 'EEXIST') { dequeue(); throw e; }
      if (!ticket) enqueue();   // first miss: take a place in the queue
      // stale: older than 20 min, OR its holder is gone (2026-09-17: a killed render left its lock behind and every
      // waiter — three render chains — sat on a dead PID for the full 20 min). process.kill(pid, 0) only
      // tests existence; it throws ESRCH when the PID is not running. A lock we cannot parse is left to the age rule.
      try {
        const st = fs.statSync(LOCK);
        let dead = false;
        try { const pid = parseInt(fs.readFileSync(LOCK, 'utf8').split(' ')[0]); if (pid > 0 && pid !== process.pid) { try { process.kill(pid, 0); } catch (e2) { dead = e2.code === 'ESRCH'; } } } catch {}
        // 2026-10-01: a holder stuck on a hung page kept heartbeating; past GPU_MAX_HOLD_MIN (default 240) since it took the
        // lock (the ISO time it wrote) the lock is stale anyway (its own guard deadline normally ends it long before)
        let held = 0;
        try { const iso = fs.readFileSync(LOCK, 'utf8').trim().split(' ').pop(); const t = Date.parse(iso); if (t > 0) held = Date.now() - t; } catch {}
        const maxHold = (Number(process.env.GPU_MAX_HOLD_MIN) || 240) * 60 * 1000;
        if (held > maxHold) console.log(`[gpulock] the lock ${path.basename(LOCK)} was held for ${(held / 60000).toFixed(0)} min (GPU_MAX_HOLD_MIN): taking it over`);
        if (dead || Date.now() - st.mtimeMs > 20 * 60 * 1000 || held > maxHold) { fs.unlinkSync(LOCK); continue; }
      } catch {}
      if (Date.now() - t0 > maxWaitMs) { dequeue(); throw new Error('gpu lock wait timed out'); }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
