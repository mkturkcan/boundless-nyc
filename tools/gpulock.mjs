// Shared GPU lock for the screenshot/record harnesses: only one headless Chromium
// renders at a time. acquire() spins on an exclusive lock file (stale after 20 min).
import fs from 'node:fs';
import path from 'node:path';
const LOCK = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'gpu.lock');
// FIFO (2026-09-17 18:35): the lock was a free-for-all — every waiter polled every 3 s and whoever polled first after a
// release won, so a plate queued at 18:18 was still waiting at 18:35 while three later arrivals rendered. Each waiter now
// registers a ticket file in gpu.queue/ (<ms>-<pid>) and only tries the lock while its ticket is the OLDEST live one;
// tickets of dead PIDs are swept by everyone. The lock file itself is unchanged, so old and new harnesses interoperate
// (an old one simply ignores the queue and may still jump it).
const QDIR = path.join(path.dirname(LOCK), 'gpu.queue');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; } };
export async function acquireGpu(label = 'render', maxWaitMs = 40 * 60 * 1000) {
  const t0 = Date.now();
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
        if (dead || Date.now() - st.mtimeMs > 20 * 60 * 1000) { fs.unlinkSync(LOCK); continue; }
      } catch {}
      if (Date.now() - t0 > maxWaitMs) { dequeue(); throw new Error('gpu lock wait timed out'); }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
