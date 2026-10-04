// Harness guardrails (owner 2026-10-01: "too many processes seem to get hung this is dangerous properly add guardrails to
// avoid process hangs"). Every tool that starts a Vite server and a headless Chromium (tools/bshot.mjs, tools/ad/record.mjs,
// and through tools/gpulock.mjs acquireGpu() every harness that takes a GPU lane) gets:
//   1. a mark: NYC_HARNESS=<its pid> in its environment, inherited by every child it starts (the Vite server, the browser
//      and its processes, ffmpeg), so its children can be found by that mark and nothing else, never by a name pattern;
//   2. its children killed on every way out: a normal exit, SIGINT / SIGTERM / SIGHUP, an uncaught exception or rejection
//      (the Vite server outlived a killed harness twice on 2026-10-01);
//   3. a deadline for the whole run (HARNESS_MAX_MIN, else the tool's own estimate): past it the run is ended, its children
//      killed and the process exits 124 (a page stuck in an endless loop held a lane for 6 minutes until the Bash timeout);
//   4. a page watchdog (watchPage): the page's main thread must answer within PAGE_STALL_S (default 240 s; the 125th Street
//      kit's tile builds blocked it for up to 60 s), else the page is hung: its browser is killed so the pending calls fail,
//      and the run ends;
//   5. a sweep at start: the children of harnesses that are gone (their mark names a dead pid) are killed.
// Linux only (the marks are read from /proc); elsewhere the hooks and the deadline still work, the sweep does nothing.
import fs from 'node:fs';

const LINUX = process.platform === 'linux';
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let G = null;   // the installed guard

// the harness pid a process carries in its environment (null: none, or not readable: another user's)
function markOf(pid) {
  try {
    const m = /(?:^|\0)NYC_HARNESS=(\d+)(?:\0|$)/.exec(fs.readFileSync(`/proc/${pid}/environ`, 'latin1'));
    return m ? Number(m[1]) : null;
  } catch { return null; }
}
function cmdOf(pid) { try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'latin1').replace(/\0/g, ' ').trim(); } catch { return ''; } }
function pids() { if (!LINUX) return []; try { return fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d)).map(Number); } catch { return []; } }

// the processes carrying the mark of harness h (not h itself)
export function childrenOf(h) {
  const out = [];
  for (const pid of pids()) if (pid !== h && pid !== process.pid && markOf(pid) === h) out.push(pid);
  return out;
}
// kill the processes carrying this harness's mark (sync: usable in an 'exit' handler); `only` filters by command line
export function killMine(sig = 'SIGTERM', only = null) {
  let n = 0;
  for (const pid of childrenOf(process.pid)) {
    if (only && !only.test(cmdOf(pid))) continue;
    try { process.kill(pid, sig); n++; } catch {}
  }
  return n;
}
// the children of dead harnesses: Vite servers, browsers, encoders whose harness is gone
export function sweepOrphans(log = console.log) {
  let n = 0;
  for (const pid of pids()) {
    if (pid === process.pid) continue;
    const h = markOf(pid);
    if (!h || h === process.pid || alive(h)) continue;
    const cmd = cmdOf(pid);
    if (!cmd) continue;
    try { process.kill(pid, 'SIGTERM'); n++; log(`[guard] orphan of the dead harness ${h} killed: ${pid} ${cmd.slice(0, 120)}`); } catch {}
  }
  return n;
}

// install the guard once per process: name (for the logs), maxMin (the run's deadline; HARNESS_MAX_MIN overrides)
export function installGuard({ name = 'harness', maxMin = 60 } = {}) {
  if (G) { if (maxMin && maxMin > G.maxMin) extendDeadline(maxMin); return G; }
  process.env.NYC_HARNESS = String(process.pid);
  G = { name, maxMin: Number(process.env.HARNESS_MAX_MIN) || maxMin, t0: Date.now(), timer: null, ending: false };
  try { sweepOrphans(); } catch {}
  const end = (code, why) => {
    if (G.ending) return;
    G.ending = true;
    // the code holds even when the run's own loop drains first (every later view fails at once on the closed browser and
    // the script ends before the timer below): a stopped run must never exit 0
    process.exitCode = code;
    if (why) console.log(`[guard] ${G.name}: ${why}`);
    try { killMine('SIGTERM'); } catch {}
    // a last SIGKILL for whatever ignored the TERM, then out
    setTimeout(() => { try { killMine('SIGKILL'); } catch {} process.exit(code); }, 3000).unref();
  };
  process.on('exit', () => { try { killMine('SIGTERM'); } catch {} });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => end(sig === 'SIGINT' ? 130 : 143, `${sig}: ending the run and its children`));
  process.on('uncaughtException', (e) => { console.error(e); end(1, 'uncaught exception: ending the run and its children'); });
  process.on('unhandledRejection', (e) => { console.error(e); end(1, 'unhandled rejection: ending the run and its children'); });
  G.end = end;
  armDeadline();
  return G;
}
function armDeadline() {
  if (G.timer) clearTimeout(G.timer);
  const left = G.t0 + G.maxMin * 60000 - Date.now();
  G.timer = setTimeout(() => G.end(124, `the run passed its deadline of ${G.maxMin} min (HARNESS_MAX_MIN): killed`), Math.max(1000, left));
  G.timer.unref();
}
// a long job (a recording) can extend its own deadline once it knows its length
export function extendDeadline(maxMin) {
  if (!G || Number(process.env.HARNESS_MAX_MIN)) return;
  G.maxMin = Math.max(G.maxMin, maxMin);
  armDeadline();
}

// watch a Playwright page: the page's main thread must answer an evaluate within stallS seconds; a page that does not is
// hung (an endless loop in page code), its browser is killed so every pending call fails, and the run ends with exit 3.
// Returns { stop() }; stop() before closing the page on purpose.
export function watchPage(page, { label = '', stallS = Number(process.env.PAGE_STALL_S) || 240 } = {}) {
  let stop = false, last = Date.now();
  (async () => {
    while (!stop) {
      await sleep(10000);
      if (stop) return;
      let closed = false;
      try { closed = page.isClosed(); } catch { closed = true; }
      if (closed) return;
      const ok = await Promise.race([page.evaluate('1').then(() => true, () => true), sleep(8000).then(() => false)]);
      if (stop) return;
      if (ok) { last = Date.now(); continue; }
      const s = (Date.now() - last) / 1000;
      if (s < stallS) { if (s > 60) console.log(`[guard] ${label}: the page has not answered for ${s.toFixed(0)} s`); continue; }
      console.log(`[guard] ${label}: the page has not answered for ${s.toFixed(0)} s (PAGE_STALL_S ${stallS}): hung; killing its browser`);
      killMine('SIGKILL', /chrome|chromium|headless/i);
      if (G) setTimeout(() => G.end(3, 'a hung page ended the run'), 20000).unref();
      return;
    }
  })();
  return { stop: () => { stop = true; } };
}
