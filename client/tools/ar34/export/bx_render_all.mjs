// BX-FIN (AR34 BX, 2026-10-03): the unattended Cycles batch. For every shot of a list, in order: the all-hooks harvest
// (the teaser 7 / 8 take flags, path regions; WIN, LIGHT and PEDS hooks), the USD (usd_write.py with every writer hook),
// the Cycles take (blender_take.py with every Blender hook) into client/shots/ad/clips_cyc/<shot>/; then the Cycles
// cuts of the teasers (tools/ad/teaser_area_cut.mjs --clips). docs/notes/ar34-bx-fin.md.
//
//   source /data0/projectnyc_aux/env.sh; cd /data0/projectnyc
//   nohup node client/tools/ar34/export/bx_render_all.mjs > /data0/projectnyc_aux/tmp/bx/batch/batch.log 2>&1 &
//
//   --shots a,b,...    the shots (default: the 20 of tools/ad/teaser7_seq.json and teaser8_seq.json, in that order)
//   --seq f1,f2        take the shot list from these seq files instead
//   --gpus 1,2         GPUs to use (page lanes: GPU 1 -> 32, GPU 2 -> 33, GPU 0 -> 34); --gpu0 adds GPU 0
//   --rpg 1            Blender processes per GPU (2 overlaps one take's scene sync with another's sampling)
//   --work <dir>       scratch: <dir>/<shot>/{h (harvest), u (USD), harvest.log, usd.log, render.log, status.json}
//                      (default /data0/projectnyc_aux/tmp/bx/batch)
//   --clips <dir>      the takes' root (default client/shots/ad/clips_cyc)
//   --frames a-b       render only these frames (a test); --res WxH (2560x1440), --samples n (24)
//   --minfree 20000    MiB a GPU must have free before a take starts on it; a take that runs out of GPU memory waits
//                      and goes again (not counted as one of its two attempts, six times at most)
//   --hflags "..."     extra harvest.mjs flags; --take "..." extra blender_take.py flags
//   --nocut | --cutonly   skip the cuts | only cut;  --cutpartial  cut even when a teaser's takes are incomplete
//   --cutsuffix _cyc   cut names: <teaser><suffix> (nyc_teaser7_cyc.mp4 ...); the web cuts are never touched
//   --prune            delete a shot's harvest and USD (scratch) once its take is complete
//   --nocheck          skip the take check (cyc_vs_web.py against the web take; BX-FIX: tools/ad/temporal_scan.py --fine on
//                      the take, flicker / z-fighting / shimmer at 80 and 40 px cells and alternation; the USD's coplanar
//                      audit, bx_fix.json: unresolved pairs in view; BX-LEAF: bx_leafcheck.py, the crowns' flicker against
//                      the take's own depth, the lamp-lit crowns that the per-frame denoiser left blotchy); a failing take
//                      is marked in its status.json and the summary; --checkonly: only (re-)check every complete take
//   --nightspp 32      samples of the night and dusk takes (BX-FIX); --notemporal: no bx_temporal.py after a take
//   --shotspp a=48     samples per shot over --samples and --nightspp (PIPEFIX; none by default)
//   --uflags "..."     extra usd_write.py flags (e.g. "--coplanar warn": the writer reports unresolved pairs, no exit 4)
//   --dry              print the plan only
//   --nocoverage       no frontend coverage lines after the summary (DOCS30: frontend_coverage.py per shot's USD)
//   PIPEFIX (2026-10-05): fail fast. A shot is stopped at the first check that can see its fault, before the hours go:
//     1. geometry, right after its USD (bx_fix.json): more than --coplanartol coplanar pairs in view, a USD written
//        without the coplanar pass, a missing walker file; the shot is not rendered (status.json stage usd-check). The
//        writer runs with --coplanar warn (the batch decides by the tolerance, a write is not repeated for it).
//     2. a preview, before the take: frames 0, mid and last at --previewspp (8) into <work>/<shot>/preview/, checked by
//        cyc_vs_web.py against the web take; a failing preview stops the shot (stage preview-check). The temporal and leaf
//        tests need consecutive frames at the take's samples, so they stay on the full take (step 4 of check()).
//        --nopreview skips it; a take that already has frames (a resume) skips it.
//     3. the full take, the temporal filter and the take check as before.
//   --preps n          prep workers (harvest + USD; default one per GPU). The USD is CPU work (15-19 min, up to 17 GB): with
//                      the harvests done, --preps 8 writes eight USDs at once. A harvest takes the lane of GPU (worker mod GPUs).
//   --ahead n          prepared shots that may wait for a GPU (default: the larger of 2 and --preps)
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
const UE = opt('target', 'cycles') === 'ue';   // UE (2026-10-06): --target ue, the UE block below
const WORK = path.resolve(opt('work', UE ? '/data0/projectnyc_aux/tmp/ue/batch' : '/data0/projectnyc_aux/tmp/bx/batch'));
const CLIPS = path.resolve(ROOT, opt('clips', UE ? 'client/shots/ad/clips_ue' : 'client/shots/ad/clips_cyc'));
const FRAMES = opt('frames');
const RES = opt('res', '2560x1440'), SPP = opt('samples', '24');
// BX-FIX (2026-10-04): night and dusk takes at --nightspp samples; every take then goes through bx_temporal.py (the
// denoiser's blotches, the street lamps' at night and the glass reflections' by day, averaged over the neighbouring frames
// by exact reprojection; --notemporal off)
const NIGHTSPP = opt('nightspp', '32');
// PIPEFIX: samples per shot over --samples / --nightspp (--shotspp a=48,b=64; none by default). t7ParkCrane's windows'
// glass fails the fine z-fight test at 24 spp (BX-FIX: passed at 48 on 2026-10-04); on 2026-10-05 it failed at 24 (11
// frames) and at 48 (10 frames) alike, so more samples are not the cure there (docs/notes/ar34-pipefix.md)
const SHOTSPP = Object.fromEntries(opt('shotspp', '').split(',').filter(Boolean).map((x) => x.split('=')).map(([k, v]) => [k, v]));
const sppOf = (s) => SHOTSPP[s] ?? (isDark(s) ? NIGHTSPP : SPP);
const modeOf = (s) => { try { return JSON.parse(fs.readFileSync(W(s, 'h', 'light_static.json'), 'utf8')).mode || 'golden'; } catch { return 'golden'; } };
const isDark = (s) => ['night', 'dusk'].includes(modeOf(s));
const MINFREE = Number(opt('minfree', '20000'));   // MiB a GPU must have free before a take starts on it (a Cycles take of a shot: ~16-20 GB)
const COPLANAR_TOL = Number(opt('coplanartol', '100'));   // BX-FIX: coplanar pairs in view (a pixel or more) a take's USD may keep (of 0.2-0.5 M resolved; each listed in bx_fix.json)
const PREPS = Math.max(1, Number(opt('preps', String(GPUS.length))));
const AHEAD = Math.max(1, Number(opt('ahead', String(Math.max(2, PREPS)))));
const PREVIEW = !has('nopreview'), PSPP = opt('previewspp', '8');
// the teaser 7 / 8 take flags (tools/ad's teaser scripts: META, the high-detail fleet, bullshot); the shot's own time of
// day and flags come from tools/ad/shots.json inside harvest.mjs
const META = 'hud=0&lmwait=150&life=0&clean=1&f24lod=60,180&crowdlod=20,60&pedtarget=640&filmlod=1&accum=63';
const HQ = 'taxi2,taxi,lincoln,suv,charger,mercedes,mini,van,boxtruck,police,ambulance,minibus,firetruck,mtaxd60,mtalfsa,mtalfsal,mtaxd40,mtalfs,taxinv200,boxtruck26,cargovan,stepvan,nypd';
const FL = opt('flags', `${META}&f24only=${HQ}&bullshot=1`);
const split = (s) => (s ? s.match(/(?:[^\s"]+|"[^"]*")+/g).map((x) => x.replace(/^"|"$/g, '')) : []);
const HFLAGS = split(opt('hflags', ''));
const TFLAGS = split(opt('take', ''));
const raw = (k) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : ''; };   // a value that may start with '--'
const UFLAGS = split(raw('uflags'));   // extra usd_write.py flags (BX-FIX: e.g. --uflags "--coplanar warn")
if (!UFLAGS.includes('--coplanar')) UFLAGS.push('--coplanar', 'warn');   // PIPEFIX: the geometry gate decides by --coplanartol

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
let stopping = false;   // PIPEFIX: after SIGINT / SIGTERM no stage starts a new child (a take's retry spawned one in the 2 s before exit, left running)
function run(cmd, args, { env = {}, cwd = ROOT, logf, timeout = 0 } = {}) {
  return new Promise((res) => {
    if (stopping) { res(1); return; }
    const out = fs.openSync(logf, 'a');
    fs.writeSync(out, `\n### ${new Date().toString()}\n### ${cmd} ${args.join(' ')}\n`);
    const p = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', out, out] });
    kids.add(p);
    let timer = null;
    if (timeout) timer = setTimeout(() => { fs.writeSync(out, `\n### timeout after ${timeout} s: SIGTERM ${p.pid}\n`); p.kill('SIGTERM'); setTimeout(() => p.exitCode === null && p.kill('SIGKILL'), 30000); }, timeout * 1000);
    p.on('exit', (code, sig) => { clearTimeout(timer); kids.delete(p); fs.writeSync(out, `\n### exit ${code} ${sig || ''} ${new Date().toString()}\n`); fs.closeSync(out); res(code === null ? 1 : code); });
  });
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopping = true; log(`${sig}: stopping ${kids.size} child process(es) by PID`); for (const p of kids) { try { p.kill('SIGTERM'); } catch {} } setTimeout(() => process.exit(1), 2000); });

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
  fs.rmSync(W(s, 'preview.ok'), { force: true });       // PIPEFIX: and its preview is made again
  for (let a = 0; a < 2; a++) {
    freshDir(s, 'u', a > 0);
    status(s, { stage: 'usd', attempt: a + 1 });
    log(`${s}: USD, attempt ${a + 1}`);
    const t0 = Date.now();
    const code = await run('uv', ['run', '--no-project', '--with', 'usd-core', '--with', 'numpy', '--with', 'pillow', '--with', 'scipy', 'python', path.join(here, 'usd_write.py'), '--in', W(s, 'h'), '--out', W(s, 'u'), ...UFLAGS],
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
  // PIPEFIX: only the last run in the log (run() appends: a take run again in the same work folder kept the first run's
  // sync times, and the split of a re-take mixed the two runs)
  const lines = fs.readFileSync(logf, 'utf8').split('\n');
  let from = 0; lines.forEach((l, i) => { if (l.startsWith('### ') && l.includes('blender_take.py')) from = i; });
  for (const line of lines.slice(from)) {
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

// PIPEFIX (2026-10-05): the geometry gate, right after the USD: what the writer knows before any frame is rendered (the
// coplanar pairs in view left in the USD, a USD written without the pass, the walkers' file). A failing shot is not rendered.
function geoGate(s) {
  const why = [];
  let cop = null; try { cop = JSON.parse(fs.readFileSync(W(s, 'u', 'bx_fix.json'), 'utf8')).coplanar; } catch {}
  const unres = cop ? Object.values(cop).reduce((a, v) => a + (v.unresolved || 0), 0) : null;
  const top = cop ? Object.values(cop).flatMap((v) => v.unresolved_pairs || []).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => `${x[0]} ${x[1]}`).join(', ') : '';
  if (!cop) why.push('USD written without the coplanar pass (bx_fix.json)');
  else if (unres > COPLANAR_TOL) why.push(`${unres} coplanar pairs in view left in the USD (more than ${COPLANAR_TOL}; ${top})`);
  if (exists(W(s, 'h', 'peds', 'assets.json')) && !exists(W(s, 'u', `peds_${s}.npz`))) why.push(`the harvest has walkers but the USD has no peds_${s}.npz`);
  const g = { pass: !why.length, coplanar: unres, top, why, at: new Date().toString() };
  status(s, why.length ? { geo: g, stage: 'usd-check', error: `geometry check: ${why.join(' | ')}` } : { geo: g });
  log(`${s}: geometry check ${g.pass ? 'pass' : 'FAIL, not rendered'} (coplanar pairs in view ${unres ?? '?'}, limit ${COPLANAR_TOL})${why.length ? ': ' + why.join(' | ') : ''}`);
  return g.pass;
}

// PIPEFIX: the preview before the take: frames 0, mid and last at --previewspp into <work>/<shot>/preview/, cyc_vs_web.py
// against the web take. -> false: the shot stops here (its older take stays where it is)
const takeArgs = (s, outdir) => ['-b', '--factory-startup', '--python', path.join(here, 'blender_take.py'), '--', '--usd', W(s, 'u', `${s}.usda`), '--harvest', W(s, 'h'),
  '--outdir', outdir, '--res', RES, '--leaves', '0.45', '--leafgain', '1.8'];
// ---- UE (2026-10-06): --target ue renders the takes with Unreal Engine 5 (ue_take.py: ue_prep.py's layer, the import in
// UnrealEditor-Cmd, Movie Render Queue in -game with Lumen) into client/shots/ad/clips_ue/<shot>/ (and --work defaults
// to /data0/projectnyc_aux/tmp/ue/batch), through the same gates as the Cycles takes: the geometry gate on the USD, the
// three-frame preview against the web take (cyc_vs_web.py), the take check (cyc_vs_web, temporal_scan, coplanar, leaf; the
// leaf test needs the take's depth, which UE does not write: "not tested"). No temporal filter after a UE take (TSR and
// Lumen accumulate over frames). The preview's import is reused by the take (ue_take.py --noprep --noimport).
//   --usdfrom <dir>    seed a shot's h/ and u/ as links to a Cycles batch's (<dir>/<shot>/, with its harvest.ok / usd.ok), so
//                      the UE takes render the very USDs of the Cycles takes; --uetake "..." extra ue_take.py flags
const UEFLAGS = split(opt('uetake', ''));
const ueArgs = (s, outdir, gpu, frames, reuse) => [path.join(here, 'ue_take.py'), '--usd', W(s, 'u', `${s}.usda`), '--outdir', outdir, '--res', RES, '--gpu', String(gpu),
  '--work', W(s, 'ue'), ...(frames ? ['--frames', frames] : []), ...(reuse ? ['--noprep', '--noimport'] : []), ...UEFLAGS];
function ueSplit(logf) {   // per frame from ue_take.py's TAKE_FRAME lines (seconds between the frames' files); the stages from TAKE_STATS
  const lines = fs.readFileSync(logf, 'utf8').split('\n');
  let from = 0; lines.forEach((l, i) => { if (l.startsWith('### ') && l.includes('ue_take.py')) from = i; });
  const tf = {}; let st = null;
  for (const line of lines.slice(from)) {
    if (line.startsWith('TAKE_FRAME ')) { try { const d = JSON.parse(line.slice(11)); tf[d.frame] = d; } catch {} }
    if (line.startsWith('TAKE_STATS ')) { try { st = JSON.parse(line.slice(11)); } catch {} }
  }
  const fr = Object.keys(tf).map(Number).sort((a, b) => a - b);
  const v = fr.slice(1).map((f) => tf[f].secs).sort((a, b) => a - b);
  return { frames: fr.length, first_s: fr.length ? tf[fr[0]].secs : null, total_s: v.length ? v[Math.floor(v.length / 2)] : null,
    prep_s: st?.prep_s ?? null, import_s: st?.import_s ?? null, render_s: st?.render_s ?? null };
}
// R3-PHYS: --cycref <dir> (the physical Cycles takes' root): ue_check.py against that take alone (--noweb), like with like
const CYCREF = opt('cycref', '');
async function ueCheck(s, take, jf, sheet, logf, frames) {   // UE: ue_check.py (regions against the web and the Cycles take)
  fs.rmSync(jf, { force: true });
  const code = await run('uv', ['run', '--no-project', '--with', 'numpy', '--with', 'pillow', '--with', 'scipy', 'python', path.join(here, 'ue_check.py'), take,
    '--web', path.join(ROOT, 'client', 'shots', 'ad', 'clips', s), '--cyc', CYCREF ? path.join(path.resolve(ROOT, CYCREF), s) : path.join(ROOT, 'client', 'shots', 'ad', 'clips_cyc', s),
    ...(CYCREF ? ['--noweb'] : []),
    ...(frames ? ['--frames', frames] : []), '--json', jf, '--sheet', sheet], { cwd: here, logf, timeout: 900 });
  let j = null; try { j = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch {}
  return j ? { pass: j.pass, why: j.why || [], regions: j.regions, sheet: j.sheet ?? null, at: new Date().toString() } : { pass: null, why: [`exit ${code}`] };
}
function ueSeed(s) {   // --usdfrom: h/ and u/ as links to a Cycles batch's, with its markers (R3-PHYS: Cycles takes too)
  const from = opt('usdfrom'); if (!from) return;
  for (const [d, ok] of [['h', 'harvest.ok'], ['u', 'usd.ok']]) {
    const src = path.join(path.resolve(from), s, d);
    if (exists(W(s, ok)) || !exists(path.join(path.resolve(from), s, ok)) || !exists(src)) continue;
    fs.rmSync(W(s, d), { recursive: true, force: true }); fs.symlinkSync(src, W(s, d));
    fs.writeFileSync(W(s, ok), `seeded from ${src} ${new Date().toString()}`);
    log(`${s}: ${d}/ linked to ${src} (--usdfrom)`);
  }
}

async function preview(s, gpu) {
  if (!PREVIEW || exists(W(s, 'preview.ok'))) return true;
  const fr = takeFrames(s) || [];
  if (fr.length < 3) return true;
  const pf = [...new Set([fr[0], fr[Math.floor(fr.length / 2)], fr[fr.length - 1]])];
  const dir = W(s, 'preview');
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  await waitFree(s, gpu);
  status(s, { stage: 'preview', gpu });
  log(`${s}: preview (frames ${pf.join(', ')}, ${PSPP} spp) on GPU ${gpu}`);
  const t0 = Date.now();
  const code = UE ? await run('python3', ueArgs(s, dir, gpu, pf.join(',')), { cwd: here, logf: W(s, 'preview.log'), timeout: 3600 })   // UE
    : await run(BLENDER, [...takeArgs(s, dir), '--samples', PSPP, '--frames', pf.join(','), '--nodepthout', ...TFLAGS],
    { cwd: here, env: { CUDA_VISIBLE_DEVICES: String(gpu), CUDA_DEVICE_ORDER: 'PCI_BUS_ID' }, logf: W(s, 'preview.log'), timeout: 1800 });
  const got = pf.filter((f) => exists(path.join(dir, `frame_${String(f).padStart(5, '0')}.jpg`)));
  const rmin = +((Date.now() - t0) / 60000).toFixed(1);
  if (got.length < pf.length) {   // not a verdict on the shot (out of memory, a crash the take would retry): the take goes on
    log(`${s}: preview not rendered (exit ${code}, ${got.length}/${pf.length} frames, preview.log); going on to the take`);
    status(s, { preview: { frames: pf, error: `exit ${code}`, min: rmin } });
    return true;
  }
  const jf = W(s, 'preview_cyc_vs_web.json'), sheet = W(s, 'preview_cyc_vs_web.jpg');
  fs.rmSync(jf, { force: true });
  const c2 = await run('uv', ['run', '--no-project', '--with', 'numpy', '--with', 'pillow', '--with', 'scipy', 'python', path.join(here, 'cyc_vs_web.py'), dir, '--web', path.join(ROOT, 'client', 'shots', 'ad', 'clips', s), '--json', jf, '--sheet', sheet],
    { cwd: here, logf: W(s, 'preview.log'), timeout: 600 });
  let j = null; try { j = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch {}
  const pct = (v) => (v == null ? '?' : (v * 100).toFixed(2) + ' %');
  const what = j ? `off colour ${pct(j.score)} (limit ${pct(j.area_max)}), off lightness ${pct(j.lscore)} (limit ${pct(j.larea_max)})` : `exit ${c2}, no verdict`;
  status(s, { preview: { frames: pf, spp: PSPP, min: rmin, cyc_vs_web: j ? { pass: j.pass, score: j.score, lscore: j.lscore, sheet: j.sheet ?? null } : { pass: null, error: `exit ${c2}` }, at: new Date().toString() } });
  log(`${s}: preview ${rmin} min, cyc_vs_web ${j ? (j.pass ? 'pass' : 'FAIL') : '?'}: ${what}`);
  if (j && j.pass === false) { status(s, { stage: 'preview-check', error: `preview check: cyc_vs_web FAIL, ${what}; sheet ${sheet}` }); return false; }
  if (UE) {   // UE: the region check against the web and the Cycles take (ue_check.py; no exposure normalisation)
    const u = await ueCheck(s, dir, W(s, 'preview_ue_check.json'), W(s, 'preview_ue_check.jpg'), W(s, 'preview.log'), pf.join(','));
    status(s, { preview_ue: u });
    log(`${s}: preview ue_check ${u.pass === false ? 'FAIL: ' + u.why.join(' | ') : u.pass ? 'pass' : '?'}`);
    if (u.pass === false) { status(s, { stage: 'preview-check', error: `preview check: ue_check FAIL, ${u.why.join(' | ')}; sheet ${u.sheet}` }); return false; }
  }
  fs.writeFileSync(W(s, 'preview.ok'), new Date().toString());
  return true;
}

async function render(s, gpu) {
  if (exists(W(s, 'render.ok'))) return true;
  const dir = path.join(CLIPS, s);
  if (!exists(W(s, 'render.started')) && !(await preview(s, gpu))) return false;   // PIPEFIX: a take not started yet is previewed first
  if (!exists(W(s, 'render.started')) && exists(dir) && fs.readdirSync(dir).length) {   // an older take: aside, never deleted
    const aside = path.join(CLIPS, `_${s}_${tag()}`);
    fs.renameSync(dir, aside);
    log(`${s}: older take moved aside to ${path.relative(ROOT, aside)}`);
  }
  fs.writeFileSync(W(s, 'render.started'), new Date().toString());
  for (let a = 0, oom = 0, n = 0; a < 2; n++) {
    await waitFree(s, gpu);
    status(s, { stage: 'render', gpu, attempt: a + 1 });
    log(`${s}: ${UE ? 'UE' : 'Cycles'} take on GPU ${gpu}, attempt ${a + 1}${oom ? ` (after ${oom} out-of-memory retries)` : ''}`);
    const t0 = Date.now();
    const nf = (takeFrames(s) || []).length || 108;
    const logf = W(s, `render_${n + 1}.log`);
    const code = UE ? await run('python3', ueArgs(s, dir, gpu, FRAMES, exists(W(s, 'preview.ok')) && a === 0), { cwd: here, logf, timeout: 3600 + nf * 30 })   // UE
      : await run(BLENDER, [...takeArgs(s, dir), '--samples', sppOf(s), ...(FRAMES ? ['--frames', FRAMES] : []), ...TFLAGS],
      { cwd: here, env: { CUDA_VISIBLE_DEVICES: String(gpu), CUDA_DEVICE_ORDER: 'PCI_BUS_ID' }, logf, timeout: 900 + nf * 90 });
    const miss = missingFrames(s);
    let sp = null; try { sp = UE ? ueSplit(logf) : frameSplit(logf); } catch {}   // UE: ue_take.py's own lines
    log(`${s}: take exit ${code}, ${miss ? miss.length : '?'} frames missing, ${((Date.now() - t0) / 60000).toFixed(1)} min; per frame ${JSON.stringify(sp)}`);
    if (miss && !miss.length) {
      if (!UE && !has('notemporal') && !(await temporal(s))) { a++; continue; }   // UE: no temporal filter
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

// BX-FIX: the temporal filter of a night or dusk take (bx_temporal.py; the raw frames kept in <take>/_raw/)
async function temporal(s) {
  const t0 = Date.now();
  const code = await run('uv', ['run', '--no-project', '--with', 'numpy', '--with', 'pillow', '--with', 'scipy', 'python', path.join(here, 'bx_temporal.py'), path.join(CLIPS, s), '--jobs', '24'],
    { cwd: here, logf: W(s, 'temporal.log'), timeout: 3600 });
  let j = null; try { j = JSON.parse(fs.readFileSync(path.join(CLIPS, s, '_temporal.json'), 'utf8')); } catch {}
  log(`${s}: temporal filter ${code === 0 && j ? 'done' : 'FAILED (exit ' + code + ', temporal.log)'} in ${((Date.now() - t0) / 60000).toFixed(1)} min${j ? ', mean weight ' + j.mean_weight : ''}`);
  status(s, { temporal: j ? { ...j, at: new Date().toString() } : { error: `exit ${code}` } });
  return code === 0 && !!j;
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
  // BX-FIX: the take's temporal QA (tools/ad/temporal_scan.py: flicker / z-fighting / shimmer of slow surfaces, frame-by-
  // frame alternation; the night takes' lamp flicker failed it) and its USD's coplanar audit (bx_fix.json: the writer's
  // unresolved coplanar pairs; a USD written without the pass fails too)
  const tj = W(s, 'temporal_scan.json');
  fs.rmSync(tj, { force: true });
  const tcode = await run('uv', ['run', '--no-project', '--with', 'numpy', '--with', 'pillow', '--with', 'scipy', 'python', path.join(ROOT, 'tools', 'ad', 'temporal_scan.py'), CLIPS, s, '--fine', '--json', tj, '--out', W(s, 'temporal_scan')],
    { cwd: here, logf: W(s, 'check.log'), timeout: 1800 });
  let tr = null; try { tr = JSON.parse(fs.readFileSync(tj, 'utf8'))[s]; } catch {}
  c.temporal = tr ? { pass: !tr.fail, why: tr.why || [], zfight_frames: (tr.zfight || {}).frames?.length ?? null, max_cells: (tr.zfight || {}).max_cells ?? null,
    fine_frames: (tr.fine_zfight || {}).count ?? null, alternation: tr.alternation?.max ?? null } : { pass: null, why: [`exit ${tcode}`] };
  let cop = null; try { cop = JSON.parse(fs.readFileSync(W(s, 'u', 'bx_fix.json'), 'utf8')).coplanar; } catch {}
  // (in view and a pixel or more; the writer's last rounds leave a few on instanced props, the lamp heads' lenses and roof
  // clutter: up to COPLANAR_TOL pass with a warning, every one is listed in bx_fix.json with where it is)
  const unres = cop ? Object.values(cop).reduce((a, v) => a + (v.unresolved || 0), 0) : null;
  const sub = cop ? Object.values(cop).reduce((a, v) => a + (v.unresolved_subpixel || 0), 0) : null;
  c.coplanar = { pass: cop ? unres <= COPLANAR_TOL : false, unresolved: unres, subpixel: sub, warn: !!(cop && unres > 0 && unres <= COPLANAR_TOL),
    why: cop ? (unres > COPLANAR_TOL ? [`${unres} coplanar pairs in view left in the USD (more than ${COPLANAR_TOL})`] : []) : ['USD written without the coplanar pass (bx_fix.json)'] };
  // BX-LEAF (2026-10-04): the foliage-and-light flicker test (bx_leafcheck.py: the crowns, half resolution, exact motion from
  // the take's depth and cameras, the temporal extremum of the low-passed luma per 32 px cell; the owner saw teaser 8's lamp-
  // lit crowns flicker in takes that passed every test above). Exit 2 (no depth): not tested.
  const lj = W(s, 'leafcheck.json');
  fs.rmSync(lj, { force: true });
  const lcode = await run('uv', ['run', '--no-project', '--with', 'numpy', '--with', 'pillow', '--with', 'scipy', 'python', path.join(here, 'bx_leafcheck.py'), path.join(CLIPS, s), '--json', lj, '--map', W(s, 'leafcheck.jpg'), '--jobs', '24'],
    { cwd: here, logf: W(s, 'check.log'), timeout: 1800 });
  let lr = null; try { lr = JSON.parse(fs.readFileSync(lj, 'utf8')); } catch {}
  c.leaf = lr ? { pass: !lr.fail, why: lr.why || [], frames_over: lr.frames_over, max_cells: lr.max_cells, mean_cells: lr.mean_cells, worst: (lr.worst || []).map((w) => w.frame) } : { pass: null, why: [`exit ${lcode} (not tested)`] };
  if (UE) c.ue = await ueCheck(s, path.join(CLIPS, s), W(s, 'ue_check.json'), W(s, 'ue_check.jpg'), W(s, 'check.log'));   // UE
  c.web_pass = c.pass;
  if (c.pass !== null || c.temporal.pass !== null) c.pass = c.pass !== false && c.temporal.pass !== false && c.coplanar.pass !== false && c.leaf.pass !== false && !(c.ue && c.ue.pass === false);
  const st = status(s, { check: c });
  const pct = (v) => (v == null ? '?' : (v * 100).toFixed(2) + ' %');
  const what = (c.score != null ? `median off-colour area ${pct(c.score)} (limit ${pct(c.limit)}), off-lightness ${pct(c.lscore)} (limit ${pct(c.llimit)})` : '') +
    `; temporal ${c.temporal.pass === false ? 'FAIL ' + c.temporal.why.join(' | ') : c.temporal.pass ? 'pass' : '?'}; coplanar ${c.coplanar.pass ? 'pass' : 'FAIL ' + c.coplanar.why.join(' | ')}` +
    `; leaf ${c.leaf.pass === false ? 'FAIL ' + c.leaf.why.join(' | ') : c.leaf.pass ? 'pass (' + c.leaf.frames_over + ' frames over)' : '?'}` +
    (c.ue ? `; ue_check ${c.ue.pass === false ? 'FAIL ' + c.ue.why.join(' | ') : c.ue.pass ? 'pass' : '?'}` : '');
  if (c.pass === false) status(s, { error: `take check: ${what}; sheet ${sheet}` });
  else if (st.error && /^(cyc_vs_web|take check)/.test(String(st.error))) status(s, { error: null });
  log(`${s}: take check ${c.pass === true ? 'pass' : c.pass === false ? 'FAIL' : 'not run: ' + c.reason}, cyc_vs_web ${c.web_pass === false ? 'FAIL' : c.web_pass ? 'pass' : '?'}${what ? ', ' + what : ''}`);
  return c.pass !== false;
}
const checkOf = (s) => { try { return JSON.parse(fs.readFileSync(W(s, 'status.json'), 'utf8')).check || null; } catch { return null; } };
const failing = (s) => {
  const c = checkOf(s);
  if (!c || c.pass !== false) return null;
  const w = [];
  if (c.web_pass === false) w.push('cyc_vs_web');
  if (c.temporal?.pass === false) w.push('temporal');
  if (c.coplanar?.pass === false) w.push(`coplanar ${c.coplanar.unresolved ?? '?'} pairs`);
  if (c.leaf?.pass === false) w.push('leaf');
  return `${s} (${w.join(', ') || 'see status.json'})`;
};
// PIPEFIX: a shot stopped by the geometry gate or its preview in this batch (its older take, if any, is not cut)
const stopped = (s) => { try { const j = JSON.parse(fs.readFileSync(W(s, 'status.json'), 'utf8')); return ['usd-check', 'preview-check'].includes(j.stage) && !!j.error; } catch { return false; } };

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
    const need = shots.filter((s) => base.has(s)), miss = need.filter((s) => !exists(path.join(CLIPS, s, 'frame_00000.jpg')) || (exists(W(s, 'render.started')) && !exists(W(s, 'render.ok'))) || stopped(s));
    if (miss.length && !has('cutpartial')) { log(`cut ${c.name}: skipped, ${miss.length} take(s) missing or incomplete (${miss.join(', ')})`); continue; }
    if (miss.length === need.length) { log(`cut ${c.name}: skipped, none of its shots has a take`); continue; }
    // PIPEFIX: name the part of the take check that fails (the warning said cyc_vs_web for every part)
    const bad = need.map(failing).filter(Boolean);
    if (bad.length) log(`cut ${c.name}: WARNING, take(s) failing the take check: ${bad.join(', ')} (status.json)`);
    const out = path.join(ROOT, 'client', 'shots', 'ad', `nyc_${c.name}.mp4`);
    for (const f of [out, out.replace(/\.mp4$/, '_web.mp4')]) if (exists(f)) { const a = f.replace(/\.mp4$/, `_prev${tag()}.mp4`); fs.renameSync(f, a); log(`older cut renamed: ${path.basename(a)}`); }
    const code = await run('node', [path.join(ROOT, 'tools', 'ad', 'teaser_area_cut.mjs'), '--name', c.name, '--seq', c.seq, '--clips', CLIPS, ...(c.fallback ? ['--fallback', path.join(ROOT, 'client', 'shots', 'ad', 'clips'), '--fallback-match', 'swipe'] : [])],
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
log(`shots ${SHOTS.length}: ${SHOTS.join(', ')}; GPUs ${GPUS.join(', ')} (lanes ${GPUS.map((g) => LANE[g]).join(', ')}), ${RPG} take process(es) per GPU, ${PREPS} prep worker(s), preview ${PREVIEW ? PSPP + ' spp' : 'off'}; work ${WORK}; takes ${CLIPS}${FRAMES ? '; frames ' + FRAMES : ''}; ${RES} ${SPP} spp`);
for (const s of SHOTS) fs.mkdirSync(W(s), { recursive: true });
const todo = SHOTS.filter((s) => !exists(W(s, 'render.ok')));
log(`${SHOTS.length - todo.length} shot(s) already rendered; ${todo.length} to do`);
if (has('dry')) { for (const s of todo) log(`  ${s}: ${['harvest.ok', 'usd.ok', 'render.started'].map((m) => m + (exists(W(s, m)) ? ' yes' : ' no')).join(', ')}`); process.exit(0); }
const t0 = Date.now();
if (!has('cutonly') && !has('checkonly')) {
  const prepQ = [...todo], ready = [], failed = [];
  let prepLive = PREPS;
  const wake = []; const notify = () => { while (wake.length) wake.shift()(); };
  const waitEvent = () => new Promise((r) => { wake.push(r); setTimeout(r, 30000); });
  const prep = async (i) => {
    const gpu = GPUS[i % GPUS.length];   // the harvest's page lane
    while (prepQ.length) {
      while (ready.length >= AHEAD) await waitEvent();
      const s = prepQ.shift();
      ueSeed(s);   // UE: --usdfrom
      const ok = (await harvest(s, gpu)) && (await usd(s)) && geoGate(s);   // PIPEFIX: stopped before the GPU when the USD fails its geometry check
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
  await Promise.all([...Array.from({ length: PREPS }, (_, i) => prep(i)), ...GPUS.flatMap((g) => Array.from({ length: RPG }, () => take(g)))]);
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
const sum = SHOTS.map((s) => { let j = {}; try { j = JSON.parse(fs.readFileSync(W(s, 'status.json'), 'utf8')); } catch {} return { shot: s, stage: j.stage, error: j.error || null, check: j.check ? j.check.pass : null, check_score: j.check ? j.check.score : null, check_lscore: j.check ? j.check.lscore ?? null : null,
  temporal: j.check?.temporal ? { pass: j.check.temporal.pass, zfight_frames: j.check.temporal.zfight_frames, fine_frames: j.check.temporal.fine_frames } : null, coplanar: j.check?.coplanar ?? null,
  leaf: j.check?.leaf ? { pass: j.check.leaf.pass, frames_over: j.check.leaf.frames_over, max_cells: j.check.leaf.max_cells } : null,
  harvest_min: j.harvest_min, usd_min: j.usd_min, render_min: j.render_min, per_frame: j.per_frame }; });
fs.writeFileSync(path.join(WORK, 'summary.json'), JSON.stringify(sum, null, 1));
log(`summary: ${path.join(WORK, 'summary.json')}; ${sum.filter((x) => x.stage === 'done').length}/${SHOTS.length} shots done; take check (cyc_vs_web, temporal_scan, coplanar, leaf) failing: ${sum.filter((x) => x.check === false).map((x) => x.shot).join(', ') || 'none'}`);
// DOCS30 (2026-10-08): the frontend coverage of every shot's USD (frontend_coverage.py: per material family and pbrLib set,
// whether Blender and Unreal draw it with their own builder or master, with an HQ set, or on the preview surface); the
// table goes to <work>/<shot>/coverage.txt, one line per shot to the log. Never fails the batch.
if (!has('dry') && !has('nocoverage')) {
  for (const s of SHOTS) {
    const u = W(s, 'u', `${s}.usda`);
    if (!exists(u)) continue;
    try {
      const out = execFileSync('uv', ['run', '--no-project', '--with', 'usd-core', 'python', path.join(here, 'frontend_coverage.py'), u, '--brief', '--out', W(s, 'coverage.txt')],
        { encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'] });
      log(`${out.trim()} (table: ${W(s, 'coverage.txt')})`);
    } catch (e) { log(`${s}: coverage report failed: ${String(e.message || e).split('\n')[0]}`); }
  }
}
