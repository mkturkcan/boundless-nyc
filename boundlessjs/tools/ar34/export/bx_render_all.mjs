// BX-FIN (AR34 BX, 2026-10-03): the unattended Cycles batch. For every shot of a list, in order: the all-hooks harvest
// (the teaser 7 / 8 take flags, path regions; WIN, LIGHT and PEDS hooks), the USD (usd_write.py with every writer hook),
// the Cycles take (blender_take.py with every Blender hook) into boundlessjs/shots/ad/clips_cyc/<shot>/; then the Cycles
// cuts of the teasers (tools/ad/teaser_area_cut.mjs --clips). docs/notes/ar34-bx-fin.md.
//
//   source /data0/projectnyc_aux/env.sh; cd /data0/projectnyc
//   nohup node boundlessjs/tools/ar34/export/bx_render_all.mjs > /data0/projectnyc_aux/tmp/bx/batch/batch.log 2>&1 &
//
//   --shots a,b,...    the shots (default: the 20 of tools/ad/teaser7_seq.json and teaser8_seq.json, in that order)
//   --seq f1,f2        take the shot list from these seq files instead
//   --gpus 1,2         GPUs to use (page lanes: GPU 1 -> 32, GPU 2 -> 33, GPU 0 -> 34); --gpu0 adds GPU 0
//   --rpg 1            Blender processes per GPU (2 overlaps one take's scene sync with another's sampling)
//   --work <dir>       scratch: <dir>/<shot>/{h (harvest), u (USD), harvest.log, usd.log, render.log, status.json}
//                      (default /data0/projectnyc_aux/tmp/bx/batch)
//   --clips <dir>      the takes' root (default boundlessjs/shots/ad/clips_cyc)
//   --frames a-b       render only these frames (a test); --res WxH (2560x1440), --samples n (24)
//   --minfree 20000    MiB a GPU must have free before a take starts on it; a take that runs out of GPU memory waits
//                      and goes again (not counted as one of its two attempts, six times at most)
//   --hflags "..."     extra harvest.mjs flags; --take "..." extra blender_take.py flags
//   --nocut | --cutonly   skip the cuts | only cut;  --cutpartial  cut even when a teaser's takes are incomplete
//   --cutsuffix _cyc   cut names: <teaser><suffix> (nyc_teaser7_cyc.mp4 ...); the web cuts are never touched
//   --prune            delete a shot's harvest and USD (scratch) once its take is complete
//   --nocheck          skip cyc_vs_web.py (each complete take against the web take; a failing take is marked in its
//                      status.json and the summary); --checkonly: only (re-)check every complete take, no takes, no cuts
//   --dry              print the plan only
// Resumable: a shot with render.ok in its work folder is skipped; a finished harvest (harvest.ok) or USD (usd.ok) is kept;
// a take resumes at its first missing frame (blender_take.py keeps existing frames). A take folder this batch did not start
// (an older version) is moved aside to <clips>/_<shot>_<stamp>/, never deleted; an older cut is renamed the same way.
// A harvest that runs again invalidates the shot's USD; a USD that runs again writes a fresh u/ (a linked u/ or h/ is
// unlinked, never written through) and starts the take afresh. After each take, cyc_vs_web.py compares it with the web take.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..', '..', '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const has = (k) => argv.includes('--' + k);
const BLENDER = process.env.BLENDER || '/data0/projectnyc_aux/.tools/blender/blender';
const SEQS = (opt('seq', 'tools/ad/teaser7_seq.json,tools/ad/teaser8_seq.json')).split(',').filter(Boolean);
const readSeq = (f) => JSON.parse(fs.readFileSync(path.resolve(ROOT, f), 'utf8')).shots.map((s) => s.name);
const SHOTS = opt('shots') ? opt('shots').split(',').filter(Boolean) : SEQS.flatMap(readSeq);
const GPUS = [...new Set([...opt('gpus', '1,2').split(',').map(Number), ...(has('gpu0') ? [0] : [])])].filter((g) => g >= 0);
const LANE = { 0: 34, 1: 32, 2: 33 };
const RPG = Math.max(1, Number(opt('rpg', '1')));
const WORK = path.resolve(opt('work', '/data0/projectnyc_aux/tmp/bx/batch'));
const CLIPS = path.resolve(ROOT, opt('clips', 'boundlessjs/shots/ad/clips_cyc'));
const FRAMES = opt('frames');
const RES = opt('res', '2560x1440'), SPP = opt('samples', '24');
const MINFREE = Number(opt('minfree', '20000'));   // MiB a GPU must have free before a take starts on it (a Cycles take of a shot: ~16-20 GB)
// the teaser 7 / 8 take flags (tools/ad's teaser scripts: META, the high-detail fleet, bullshot); the shot's own time of
// day and flags come from tools/ad/shots.json inside harvest.mjs
const META = 'hud=0&lmwait=150&life=0&clean=1&f24lod=60,180&crowdlod=20,60&pedtarget=640&filmlod=1&accum=63';
const HQ = 'taxi2,taxi,lincoln,suv,charger,mercedes,mini,van,boxtruck,police,ambulance,minibus,firetruck,mtaxd60,mtalfsa,mtalfsal,mtaxd40,mtalfs,taxinv200,boxtruck26,cargovan,stepvan,nypd';
const FL = opt('flags', `${META}&f24only=${HQ}&bullshot=1`);
const split = (s) => (s ? s.match(/(?:[^\s"]+|"[^"]*")+/g).map((x) => x.replace(/^"|"$/g, '')) : []);
const HFLAGS = split(opt('hflags', ''));
const TFLAGS = split(opt('take', ''));

const stamp = () => new Date().toTimeString().slice(0, 8);
const tag = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
const log = (...a) => console.log(`[bx-batch ${stamp()}]`, ...a);
const W = (s, ...p) => path.join(WORK, s, ...p);
const exists = (p) => fs.existsSync(p);
const status = (s, patch) => {
  const f = W(s, 'status.json');
  let j = {}; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
  Object.assign(j, patch, { updated: new Date().toString() });
  fs.writeFileSync(f, JSON.stringify(j, null, 1));
  return j;
};
const kids = new Set();
function run(cmd, args, { env = {}, cwd = ROOT, logf, timeout = 0 } = {}) {
  return new Promise((res) => {
    const out = fs.openSync(logf, 'a');
    fs.writeSync(out, `\n### ${new Date().toString()}\n### ${cmd} ${args.join(' ')}\n`);
    const p = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', out, out] });
    kids.add(p);
    let timer = null;
    if (timeout) timer = setTimeout(() => { fs.writeSync(out, `\n### timeout after ${timeout} s: SIGTERM ${p.pid}\n`); p.kill('SIGTERM'); setTimeout(() => p.exitCode === null && p.kill('SIGKILL'), 30000); }, timeout * 1000);
    p.on('exit', (code, sig) => { clearTimeout(timer); kids.delete(p); fs.writeSync(out, `\n### exit ${code} ${sig || ''} ${new Date().toString()}\n`); fs.closeSync(out); res(code === null ? 1 : code); });
  });
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { log(`${sig}: stopping ${kids.size} child process(es) by PID`); for (const p of kids) { try { p.kill('SIGTERM'); } catch {} } setTimeout(() => process.exit(1), 2000); });

// ---- the stages
const takeFrames = (s) => {   // the take's frame list (the harvest's camera track; 108 for the teaser shots)
  if (FRAMES) { const [a, b] = FRAMES.split('-').map(Number); return Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i); }
  try { return Array.from({ length: JSON.parse(fs.readFileSync(W(s, 'h', `cam_${s}.json`), 'utf8')).length }, (_, i) => i); } catch { return null; }
};
const missingFrames = (s) => { const fr = takeFrames(s); return fr ? fr.filter((f) => !exists(path.join(CLIPS, s, `frame_${String(f).padStart(5, '0')}.jpg`))) : null; };

async function harvest(s, gpu) {
  if (exists(W(s, 'harvest.ok'))) return true;
  fs.rmSync(W(s, 'usd.ok'), { force: true });   // a new harvest: the USD of an older one is written again
  for (let a = 0; a < 2; a++) {
    let hl = null; try { hl = fs.lstatSync(W(s, 'h')); } catch {}
    if (hl && hl.isSymbolicLink()) { log(`${s}: h/ was a link to ${fs.readlinkSync(W(s, 'h'))}; unlinked (the target is kept)`); fs.unlinkSync(W(s, 'h')); }
    else if (hl) { fs.rmSync(W(s, 'h.failed'), { recursive: true, force: true }); fs.renameSync(W(s, 'h'), W(s, 'h.failed')); }   // scratch
    status(s, { stage: 'harvest', gpu, attempt: a + 1, harvest_start: new Date().toString() });
    log(`${s}: harvest on lane ${LANE[gpu]} (GPU ${gpu}), attempt ${a + 1}`);
    const t0 = Date.now();
    const code = await run('node', [path.join(here, 'harvest.mjs'), '--shots', s, '--flags', FL, '--region', '350', '--far', '800', '--ring', '4000', '--out', W(s, 'h'), ...HFLAGS],
      { env: { GPU_LANE: String(LANE[gpu]), GPU_WAIT_MS: String(6 * 3600 * 1000) }, logf: W(s, 'harvest.log'), timeout: 5400 });
    const ok = code === 0 && ['manifest.json', `cam_${s}.json`, `mov_${s}.json`, `static_${s}.json`].every((f) => exists(W(s, 'h', f)));
    log(`${s}: harvest ${ok ? 'done' : 'FAILED (exit ' + code + ')'} in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
    if (ok) { fs.writeFileSync(W(s, 'harvest.ok'), new Date().toString()); fs.rmSync(W(s, 'h.failed'), { recursive: true, force: true }); status(s, { harvest_min: +((Date.now() - t0) / 60000).toFixed(1) }); return true; }
  }
  status(s, { stage: 'harvest', error: 'harvest failed twice (harvest.log)' });
  return false;
}

// a stage's output folder starts empty: a link (a folder seeded from elsewhere) is unlinked, never written through, and a
// folder of an earlier write moves to <name>.prev until the stage succeeds (BX-QA: the re-harvested takes' USDs were written
// through links into BX-FIN's proof folders and kept those harvests' index-named textures: wrong texture per surface)
function freshDir(s, d, retry = false) {
  const p = W(s, d), prev = W(s, d + '.prev');
  let st = null; try { st = fs.lstatSync(p); } catch {}
  if (st && st.isSymbolicLink()) { log(`${s}: ${d}/ was a link to ${fs.readlinkSync(p)}; unlinked (the target is kept), writing a fresh folder`); fs.unlinkSync(p); }
  else if (st && retry) fs.rmSync(p, { recursive: true, force: true });   // the failed attempt's partial folder
  else if (st) { fs.rmSync(prev, { recursive: true, force: true }); fs.renameSync(p, prev); }
}

async function usd(s) {
  if (exists(W(s, 'usd.ok'))) return true;
  fs.rmSync(W(s, 'render.started'), { force: true });   // a new USD: frames of an older one are not resumed (the take moves aside)
  for (let a = 0; a < 2; a++) {
    freshDir(s, 'u', a > 0);
    status(s, { stage: 'usd', attempt: a + 1 });
    log(`${s}: USD, attempt ${a + 1}`);
    const t0 = Date.now();
    const code = await run('uv', ['run', '--no-project', '--with', 'usd-core', '--with', 'numpy', '--with', 'pillow', 'python', path.join(here, 'usd_write.py'), '--in', W(s, 'h'), '--out', W(s, 'u')],
      { cwd: here, logf: W(s, 'usd.log'), timeout: 3600 });
    const ok = code === 0 && exists(W(s, 'u', `${s}.usda`));
    log(`${s}: USD ${ok ? 'done' : 'FAILED (exit ' + code + ')'} in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
    if (ok) { fs.writeFileSync(W(s, 'usd.ok'), new Date().toString()); fs.rmSync(W(s, 'u.prev'), { recursive: true, force: true }); status(s, { usd_min: +((Date.now() - t0) / 60000).toFixed(1) }); return true; }
  }
  status(s, { stage: 'usd', error: 'usd_write failed twice (usd.log)' });
  return false;
}

// per-frame split from a take's Blender log: frame change + hooks, Cycles' scene sync (to its first sample), sampling +
// denoise + write (medians over the frames after the first)
function frameSplit(logf) {
  const tf = {}, sync = {};
  for (const line of fs.readFileSync(logf, 'utf8').split('\n')) {
    if (line.startsWith('TAKE_FRAME ')) { try { const d = JSON.parse(line.slice(11)); if (d.secs !== undefined) tf[d.frame] = d; } catch {} continue; }
    const m = /^Fra:(\d+) .*?Time:(\d+):(\d+\.\d+) \|.*\| Sample 1\//.exec(line);
    if (m && sync[+m[1]] === undefined) sync[+m[1]] = +m[2] * 60 + +m[3];
  }
  const fr = Object.keys(tf).map(Number).sort((a, b) => a - b), rest = fr.slice(1);
  const med = (v) => { v = v.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return v.length ? +v[Math.floor(v.length / 2)].toFixed(2) : null; };
  return { frames: fr.length, first_s: fr.length ? tf[fr[0]].secs : null, update_s: med(rest.map((f) => tf[f].secs - tf[f].render)),
    sync_s: med(rest.map((f) => sync[f])), sample_s: med(rest.map((f) => (sync[f] !== undefined ? tf[f].render - sync[f] : NaN))), total_s: med(rest.map((f) => tf[f].secs)) };
}

// a GPU's free memory (nvidia-smi, PCI order: the takes run with CUDA_DEVICE_ORDER=PCI_BUS_ID so the indices agree)
const gpuFree = (g) => { try { const r = execFileSync('nvidia-smi', ['--query-gpu=index,memory.free', '--format=csv,noheader,nounits'], { encoding: 'utf8' }); const row = r.trim().split('\n').map((l) => l.split(',').map((x) => Number(x.trim()))).find((x) => x[0] === g); return row ? row[1] : Infinity; } catch { return Infinity; } };
async function waitFree(s, gpu) {
  const t0 = Date.now();
  let said = false;
  while (gpuFree(gpu) < MINFREE && Date.now() - t0 < 4 * 3600 * 1000) {
    if (!said) { log(`${s}: waiting for ${MINFREE} MiB free on GPU ${gpu} (${gpuFree(gpu)} MiB now)`); said = true; }
    await new Promise((r) => setTimeout(r, 30000));
  }
}

async function render(s, gpu) {
  if (exists(W(s, 'render.ok'))) return true;
  const dir = path.join(CLIPS, s);
  if (!exists(W(s, 'render.started')) && exists(dir) && fs.readdirSync(dir).length) {   // an older take: aside, never deleted
    const aside = path.join(CLIPS, `_${s}_${tag()}`);
    fs.renameSync(dir, aside);
    log(`${s}: older take moved aside to ${path.relative(ROOT, aside)}`);
  }
  fs.writeFileSync(W(s, 'render.started'), new Date().toString());
  for (let a = 0, oom = 0, n = 0; a < 2; n++) {
    await waitFree(s, gpu);
    status(s, { stage: 'render', gpu, attempt: a + 1 });
    log(`${s}: Cycles take on GPU ${gpu}, attempt ${a + 1}${oom ? ` (after ${oom} out-of-memory retries)` : ''}`);
    const t0 = Date.now();
    const nf = (takeFrames(s) || []).length || 108;
    const logf = W(s, `render_${n + 1}.log`);
    const code = await run(BLENDER, ['-b', '--factory-startup', '--python', path.join(here, 'blender_take.py'), '--', '--usd', W(s, 'u', `${s}.usda`), '--harvest', W(s, 'h'),
      '--outdir', dir, '--res', RES, '--samples', SPP, '--leaves', '0.45', '--leafgain', '1.8', ...(FRAMES ? ['--frames', FRAMES] : []), ...TFLAGS],
      { cwd: here, env: { CUDA_VISIBLE_DEVICES: String(gpu), CUDA_DEVICE_ORDER: 'PCI_BUS_ID' }, logf, timeout: 900 + nf * 90 });
    const miss = missingFrames(s);
    let sp = null; try { sp = frameSplit(logf); } catch {}
    log(`${s}: take exit ${code}, ${miss ? miss.length : '?'} frames missing, ${((Date.now() - t0) / 60000).toFixed(1)} min; per frame ${JSON.stringify(sp)}`);
    if (miss && !miss.length) {
      fs.writeFileSync(W(s, 'render.ok'), new Date().toString());
      status(s, { stage: 'done', render_min: +((Date.now() - t0) / 60000).toFixed(1), per_frame: sp, error: null });
      if (!has('nocheck')) await check(s);
      if (has('prune')) { for (const d of ['h', 'u']) fs.rmSync(W(s, d), { recursive: true, force: true }); log(`${s}: harvest and USD pruned`); }
      return true;
    }
    // out of GPU memory (another process on the GPU): not counted as an attempt, waits for memory and goes again (6 times at most)
    let isOom = false; try { isOom = /out of GPU memory|CUDA_ERROR_OUT_OF_MEMORY|out of memory/i.test(fs.readFileSync(logf, 'utf8').slice(-200000)); } catch {}
    if (isOom && oom < 6) { oom++; log(`${s}: out of GPU memory on GPU ${gpu}; waiting to retry`); await new Promise((r) => setTimeout(r, 60000)); continue; }
    a++;
  }
  status(s, { stage: 'render', error: 'take incomplete after two attempts (render_*.log)' });
  return false;
}

// ---- BX-QA: each complete take against the web take of its shot (cyc_vs_web.py: surfaces whose hue or saturation is off
// far beyond the two renderers' lighting, e.g. another harvest's texture on a surface). A failing take keeps its render.ok
// and is marked in status.json (check.pass false, error with the sheet of its worst frames), the log and the summary.
async function check(s) {
  const jf = W(s, 'cyc_vs_web.json'), sheet = W(s, 'cyc_vs_web.jpg');
  fs.rmSync(jf, { force: true }); fs.rmSync(sheet, { force: true });
  const code = await run('uv', ['run', '--no-project', '--with', 'numpy', '--with', 'pillow', '--with', 'scipy', 'python', path.join(here, 'cyc_vs_web.py'), path.join(CLIPS, s), '--json', jf, '--sheet', sheet],
    { cwd: here, logf: W(s, 'check.log'), timeout: 900 });
  let j = null; try { j = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch {}
  const c = { tool: 'cyc_vs_web', pass: j ? j.pass : null, score: j?.score ?? null, limit: j?.area_max ?? null, lscore: j?.lscore ?? null, llimit: j?.larea_max ?? null, worst: j?.worst?.map((w) => w.frame) ?? null,
    sheet: j?.sheet ?? null, reason: j?.reason ?? (j ? null : `exit ${code} (check.log)`), at: new Date().toString() };
  const st = status(s, { check: c });
  const pct = (v) => (v == null ? '?' : (v * 100).toFixed(2) + ' %');
  const what = c.score != null ? `median off-colour area ${pct(c.score)} (limit ${pct(c.limit)}), off-lightness ${pct(c.lscore)} (limit ${pct(c.llimit)})` : '';
  if (c.pass === false) status(s, { error: `cyc_vs_web: surfaces off the web take, ${what}; sheet ${sheet}` });
  else if (st.error && String(st.error).startsWith('cyc_vs_web')) status(s, { error: null });
  log(`${s}: cyc_vs_web ${c.pass === true ? 'pass' : c.pass === false ? 'FAIL' : 'not run: ' + c.reason}${what ? ', ' + what : ''}`);
  return c.pass !== false;
}
const checkOf = (s) => { try { return JSON.parse(fs.readFileSync(W(s, 'status.json'), 'utf8')).check || null; } catch { return null; } };

// ---- the cuts: each teaser's Cycles cut once all its shots have takes; the variants that take web clips (composites that
// exist only as web clips) read them from the web clip root
async function cuts() {
  const SUF = opt('cutsuffix', '_cyc');
  const list = [];
  for (const f of SEQS) {
    const base = path.basename(f).replace(/_seq\.json$/, '');
    list.push({ seq: f, name: base + SUF });
    for (const v of ['s', 'sc']) { const sf = f.replace(/_seq\.json$/, `${v}_seq.json`); if (exists(path.resolve(ROOT, sf))) list.push({ seq: sf, name: base + v + SUF, fallback: true }); }
  }
  const done = [];
  for (const c of list) {
    const shots = readSeq(c.seq), base = new Set(SEQS.flatMap(readSeq));
    const need = shots.filter((s) => base.has(s)), miss = need.filter((s) => !exists(path.join(CLIPS, s, 'frame_00000.jpg')) || (exists(W(s, 'render.started')) && !exists(W(s, 'render.ok'))));
    if (miss.length && !has('cutpartial')) { log(`cut ${c.name}: skipped, ${miss.length} take(s) missing or incomplete (${miss.join(', ')})`); continue; }
    if (miss.length === need.length) { log(`cut ${c.name}: skipped, none of its shots has a take`); continue; }
    const bad = need.filter((s) => checkOf(s)?.pass === false);
    if (bad.length) log(`cut ${c.name}: WARNING, take(s) failing cyc_vs_web: ${bad.join(', ')} (status.json, cyc_vs_web.jpg)`);
    const out = path.join(ROOT, 'boundlessjs', 'shots', 'ad', `nyc_${c.name}.mp4`);
    for (const f of [out, out.replace(/\.mp4$/, '_web.mp4')]) if (exists(f)) { const a = f.replace(/\.mp4$/, `_prev${tag()}.mp4`); fs.renameSync(f, a); log(`older cut renamed: ${path.basename(a)}`); }
    const code = await run('node', [path.join(ROOT, 'tools', 'ad', 'teaser_area_cut.mjs'), '--name', c.name, '--seq', c.seq, '--clips', CLIPS, ...(c.fallback ? ['--fallback', path.join(ROOT, 'boundlessjs', 'shots', 'ad', 'clips'), '--fallback-match', 'swipe'] : [])],
      { logf: path.join(WORK, `cut_${c.name}.log`), timeout: 3600 });
    log(`cut ${c.name}: ${code === 0 && exists(out) ? 'wrote ' + path.relative(ROOT, out) : 'FAILED (cut_' + c.name + '.log)'}`);
    if (code === 0) done.push(out);
  }
  return done;
}

// ---- the schedule: per GPU one prep worker (harvest on its lane, then the USD) and RPG take workers; any GPU renders any
// prepared shot, in list order; a prep worker stays at most two shots ahead of the takes
fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(CLIPS, { recursive: true });
log(`shots ${SHOTS.length}: ${SHOTS.join(', ')}; GPUs ${GPUS.join(', ')} (lanes ${GPUS.map((g) => LANE[g]).join(', ')}), ${RPG} take process(es) per GPU; work ${WORK}; takes ${CLIPS}${FRAMES ? '; frames ' + FRAMES : ''}; ${RES} ${SPP} spp`);
for (const s of SHOTS) fs.mkdirSync(W(s), { recursive: true });
const todo = SHOTS.filter((s) => !exists(W(s, 'render.ok')));
log(`${SHOTS.length - todo.length} shot(s) already rendered; ${todo.length} to do`);
if (has('dry')) { for (const s of todo) log(`  ${s}: ${['harvest.ok', 'usd.ok', 'render.started'].map((m) => m + (exists(W(s, m)) ? ' yes' : ' no')).join(', ')}`); process.exit(0); }
const t0 = Date.now();
if (!has('cutonly') && !has('checkonly')) {
  const prepQ = [...todo], ready = [], failed = [];
  let prepLive = GPUS.length;
  const wake = []; const notify = () => { while (wake.length) wake.shift()(); };
  const waitEvent = () => new Promise((r) => { wake.push(r); setTimeout(r, 30000); });
  const prep = async (gpu) => {
    while (prepQ.length) {
      while (ready.length >= 2) await waitEvent();
      const s = prepQ.shift();
      const ok = (await harvest(s, gpu)) && (await usd(s));
      if (ok) ready.push(s); else failed.push(s);
      ready.sort((a, b) => SHOTS.indexOf(a) - SHOTS.indexOf(b));
      notify();
    }
    prepLive--; notify();
  };
  const take = async (gpu) => {
    for (;;) {
      if (ready.length) { const s = ready.shift(); notify(); if (!(await render(s, gpu))) failed.push(s); continue; }
      if (!prepLive) break;
      await waitEvent();
    }
  };
  await Promise.all([...GPUS.map(prep), ...GPUS.flatMap((g) => Array.from({ length: RPG }, () => take(g)))]);
  log(`takes finished in ${((Date.now() - t0) / 60000).toFixed(1)} min; failed: ${failed.length ? failed.join(', ') : 'none'}`);
}
if (!has('nocheck')) {
  for (const s of SHOTS) {
    if (!exists(W(s, 'render.ok'))) continue;
    const c = checkOf(s);
    if (has('checkonly') || !c || c.pass === null || new Date(c.at) < fs.statSync(W(s, 'render.ok')).mtime) await check(s);
  }
}
if (!has('nocut') && !has('checkonly')) await cuts();
const sum = SHOTS.map((s) => { let j = {}; try { j = JSON.parse(fs.readFileSync(W(s, 'status.json'), 'utf8')); } catch {} return { shot: s, stage: j.stage, error: j.error || null, check: j.check ? j.check.pass : null, check_score: j.check ? j.check.score : null, check_lscore: j.check ? j.check.lscore ?? null : null, harvest_min: j.harvest_min, usd_min: j.usd_min, render_min: j.render_min, per_frame: j.per_frame }; });
fs.writeFileSync(path.join(WORK, 'summary.json'), JSON.stringify(sum, null, 1));
log(`summary: ${path.join(WORK, 'summary.json')}; ${sum.filter((x) => x.stage === 'done').length}/${SHOTS.length} shots done; cyc_vs_web failing: ${sum.filter((x) => x.check === false).map((x) => x.shot).join(', ') || 'none'}`);
