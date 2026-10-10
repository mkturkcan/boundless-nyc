// AD VIDEO — final cut.
//
// Two stages, on purpose:
//
//  1. every segment is built on its own (overlay wipe + caption + the one lower
//     third) into client/shots/ad/seg/NN_<name>.mp4 at CRF 12, so a
//     segment can be inspected, re-run or replaced without rebuilding the film;
//  2. the segments are concatenated with the music, the black head/tail and the
//     body fades in ONE pass at CRF 19 -> client/shots/ad/nyc_twin_ad.mp4.
//
// Style follows the owner's DART media pipeline: each demo clip opens with an
// overlay wipe carrying a bright hairline, every clip has one caption that
// fades in over 0.7 s with ease(x) = x*x*(3-2x) and out over 0.6 s, the lower
// third appears on the FIRST clip only, and the music sits at 0.35 with a 2 s
// fade-in and a 4 s fade-out.
//
//   node tools/ad/cut.mjs                       # build everything
//   node tools/ad/cut.mjs --only fTraffic,fWeather   # rebuild these segments only
//   node tools/ad/cut.mjs --skipseg             # segments exist: just assemble
//   node tools/ad/cut.mjs --name "Jane Doe" --affil "Columbia University"
//   node tools/ad/cut.mjs --nomusic
//
// Text is passed to ffmpeg through `textfile=` with the process cwd set to the
// text directory, so no caption ever has to survive filter-string escaping.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const has = (n) => args.includes('--' + n);
// --notext (owner 2026-09-16: "Render the whole trailer without text first ... I want to be able to fix the text
// independently"): no captions, no accent rules, no lower third, no slide cards, and the data scene's labelled
// diagram is replaced by the plain render of the same view. Transitions and music stay. Output defaults to
// nyc_twin_ad_notext.mp4 so the captioned cut is never overwritten.
const NOTEXT = has('notext');
const bin = (await import('ffmpeg-static')).default;

const FPS = 30, W = 1920, H = 1080;
const adRoot = path.resolve(root, 'client/shots/ad');
const clipRoot = path.join(adRoot, 'clips');
const segRoot = path.join(adRoot, NOTEXT ? 'seg_notext' : 'seg');   // the two cuts keep separate segment sets
const txtRoot = path.join(segRoot, '_txt');
const OUT = path.resolve(root, opt('out', NOTEXT ? 'client/shots/ad/nyc_twin_ad_notext.mp4' : 'client/shots/ad/nyc_twin_ad.mp4'));
const MUSIC = path.resolve(root, opt('music', 'admusic/music/lofi.mp3'));
const LOWER1 = opt('name', '[ name ]');
const LOWER2 = opt('affil', '[ affiliation ]');
// --only takes a comma list, so the segments whose clips have finished
// recording can be built while the rest are still capturing
const only = opt('only') ? opt('only').split(',').map((s) => s.trim()) : null;
const HEAD = 1.0, TAIL = 1.6, BODYFADE = 0.9;

// DART palette
const PAL = { WHITE: '0xECECEC', BLUE: '0x58C4DD', YELLOW: '0xF7D662', GREEN: '0x83C167',
  RED: '0xFC6255', TEAL: '0x5ED2BC', ORANGE: '0xF5A050', GREY: '0x969696' };
const FONT_SB = 'lato-sb.ttf', FONT_RG = 'lato-rg.ttf', FONT_BD = 'lato-bd.ttf';
const FONT_SRC = {
  [FONT_SB]: 'C:/Windows/Fonts/LatoWeb-Semibold.ttf',
  [FONT_RG]: 'C:/Users/mehme/AppData/Local/Microsoft/Windows/Fonts/Lato-Regular.ttf',
  [FONT_BD]: 'C:/Users/mehme/AppData/Local/Microsoft/Windows/Fonts/Lato-Bold.ttf',
};

// ---- the running order ----------------------------------------------------
// src kinds:  frames <dir>            (frame_%05d.<ext> sequence)
//             mp4 <file>[:in:dur]
//             xfade { a, b, d }       (two sequences dissolved into ONE segment)
//
// 2026-09-04 evening, owner's re-cut. Two explainers move to the FRONT, because
// a viewer who does not yet know what the thing is or why it exists reads the
// montage as a game demo:
//
//   * the DATA SCENE goes second, right after the opening shot — the source
//     layers drawn in the `fStreetGeom` camera's own projection, dissolving
//     into the rendered clip of that exact view. It has to be followed
//     IMMEDIATELY by that render or the dissolve has nothing to land on, so
//     `fStreetGeom` comes up out of act 3 and the two are built as one segment
//     (`dataCity`) with an xfade in the middle. That pairing is the argument:
//     the drawing and the render have the kerbs, the lot lines and the bus
//     lanes in the same pixels.
//   * the PERCEPTION panel goes fourth, after the montage's first two shots and
//     well before the swipe — "so people understand why the project is done".
//     It now carries a caption saying what it emits; the panel's own header is
//     the only other text and sits at the top, so the caption's bottom-left
//     slot is clear.
//
// Captions still sit on only 4 of the 6 montage shots: at 5.4 s a shot, six
// captions is one to read every five seconds and the montage stops reading as a
// montage.
const SEQ = [
  // ACT 1 — open, then the two explainers
  { name: 'mCollegeWalk', accent: 'BLUE', caption: 'A procedural digital twin of New York — in a browser tab', lower: true },
  { name: 'dataCity', accent: 'BLUE', wipe: 0.5,
    caption: 'The same view, rendered: the public record compiled into 512 m tiles and streamed to a browser tab',
    // the caption belongs on the RENDER half, after the dissolve has completed
    capAt: 13.6,
    src: { kind: 'xfade', a: 'client/shots/ad/data', aext: 'jpg',
      b: 'client/shots/ad/clips/fStreetGeom', bext: 'jpg', d: 1.2 } },
  { name: 'mLowAerial', accent: 'BLUE', caption: null },
  // The perception panel carries its own header, class legend and a live
  // labels.json table across the bottom third, so the caption sits HIGH (the
  // usual bottom-left slot is the table) and says what the clip is.
  { name: 'fPerception', accent: 'ORANGE', wipe: 0.5, capTop: true, capWrap: 62,
    caption: 'Every frame emits its own ground truth: 2D boxes, semantic and instance masks, depth — and amodal masks for what is occluded. For free.',
    // 2026-09-16 owner: the camera now follows the CENTRE of 125th St (tools/trailer/paths.json harlem125Center,
    // exported by tools/perception/export.mjs --path harlem125Center --clip client/shots/perception/clip_center)
    // film 8 (owner review 2026-09-24): the panel's glass-card redesign and plain headings; film 7's is clip_center/
    src: { kind: 'frames', dir: 'client/shots/perception/clip_center_v15', ext: 'png' }, dur: 12.0 },   // film 11: re-exported (Rocketbox walkers in the crowd, the fixed walk styles)
  // ACT 1b — the rest of the montage
  { name: 'mLenoxTop', accent: 'YELLOW', caption: '125th & Lenox — every lane, crossing and signal from public data' },
  // film 13: a box truck ahead in the inner lane is overtaken at the lens from frame 144 (LENS-INSIDE): the take ends at 4.5 s
  { name: 'mLenoxEye', accent: 'YELLOW', caption: null, dur: 4.5 },
  { name: 'mBrownstone', accent: 'ORANGE', caption: 'Harlem brownstone rows, stoop by stoop' },
  { name: 'mMidtownSky', accent: 'TEAL', caption: '930,787 buildings, streamed as 512 m tiles' },
  // ACT 2 — the day/night swipe
  { name: 'swipe', accent: 'WHITE', caption: 'One path, one instant, two skies — the same simulation stepped identically', wipe: 0.5 },
  // ACT 3 — feature clips (fStreetGeom now lives in `dataCity`)
  { name: 'fMarkings', accent: 'YELLOW', caption: 'NYC DOT markings: ladder crosswalks, stop bars, gutters, red bus lanes, BUS ONLY legends' },
  { name: 'fBrownstone', accent: 'ORANGE', caption: 'Brownstone rows: per-lot massing, stoops and railings, fire escapes, tree pits' },
  // film 9 (2026-09-26): the same row after dark (street lamps as real lights) and the Low Plaza fountain water
  { name: 'fBrownstoneNight', accent: 'ORANGE', caption: 'After dark: every street lamp is a real light, the rows light up window by window' },
  { name: 'fColumbia', accent: 'GREEN', caption: "Procedural landmarks: Low Library's colonnade, the grand staircase, Alma Mater" },
  { name: 'fFountain', accent: 'GREEN', caption: 'The Low Plaza fountains: water veils, the jet and its crown, foam on the pool' },
  { name: 'fMorph', accent: 'GREEN', caption: 'One building, regenerated every frame: the template re-flows floors, bays and storefronts live',
    src: { kind: 'mp4', file: 'shots/trailer/morph.mp4', in: 4.0, dur: 10.0 } },
  // film 7 (2026-09-23): the photoreal crowd and the NYC fleet, framed for the walkers — straight into the junction shot
  { name: 'fStreetLife', accent: 'RED', dur: 8.1, caption: 'People and vehicles: photoreal walkers with bags and phones, NYC vehicle kinds with NY plates and TLC cabs' },
  { name: 'fTraffic', accent: 'RED', caption: 'Traffic simulation on the compiled lane graph — signals, queues, turns' },
  { name: 'fWeather', accent: 'TEAL', caption: 'Weather and time of day: wet asphalt, headlights, lit storefronts, skyglow' },
  { name: 'fSkyline', accent: 'TEAL', caption: '2,882 street tiles near the camera, 209 far-LoD macros carrying the skyline behind them' },
  // ACT 4 — the closing presentation (already carries its own DART fades)
  { name: 'slides', accent: null, caption: null, wipe: 0.6, nocap: true,
    src: { kind: 'frames', dir: 'client/shots/ad/slides', ext: 'jpg' } },
];

// ---- helpers ---------------------------------------------------------------
const dur = (file) => {
  const r = spawnSync(bin, ['-i', file], { encoding: 'utf8' });
  const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec((r.stderr || '') + (r.stdout || ''));
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : null;
};
const frameCount = async (dir, ext) => {
  try {
    const fs2 = await fs.readdir(dir);
    const re = new RegExp(`^frame_\\d+\\.${ext}$`);
    return fs2.filter((f) => re.test(f)).length;
  } catch { return 0; }
};
/** DART easing as an ffmpeg expression over a clipped normalized time */
const easeE = (p) => `((${p})*(${p})*(3-2*(${p})))`;
const rampIn = (t0, d) => easeE(`clip((t-${t0.toFixed(3)})/${d.toFixed(3)},0,1)`);
const rampOut = (t0, d) => `(1-${easeE(`clip((t-${t0.toFixed(3)})/${d.toFixed(3)},0,1)`)})`;
/** wrap a caption to at most `n` chars per line, max 2 lines */
const wrap = (s, n = 78) => {
  const words = s.split(' '); const out = []; let line = '';
  for (const w of words) {
    if (!line) line = w;
    else if ((line + ' ' + w).length <= n) line += ' ' + w;
    else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out.slice(0, 3);
};

await fs.mkdir(segRoot, { recursive: true });
await fs.mkdir(txtRoot, { recursive: true });
for (const [dst, src] of Object.entries(FONT_SRC)) {
  const to = path.join(txtRoot, dst);
  if (!existsSync(to)) { try { await fs.copyFile(src, to); } catch (e) { console.log('FONT MISSING', src); } }
}

// ---- stage 1: one segment at a time ---------------------------------------
const built = [];
let idx = 0;
for (const S0 of SEQ) {
  let S = S0;
  if (NOTEXT) {
    if (S.name === 'slides') continue;                                        // pure text cards
    // dataCity keeps its diagram: its legend was fixed on 2026-09-17 (no dataset ids, dots or dashes; box sized to the text)
  }
  idx++;
  const tag = `${String(idx).padStart(2, '0')}_${S.name}`;
  const segFile = path.join(segRoot, tag + '.mp4');

  // resolve the source
  let input = null, srcDur = null, trim = null, xf = null;
  const fdirJpg = path.join(clipRoot, S.name);
  if (S.src?.kind === 'xfade') {
    // two frame sequences dissolved into one segment: the data drawing and the
    // render of the same camera. Both must exist or the pairing means nothing,
    // so this one does NOT degrade to a single input.
    const da = path.resolve(root, S.src.a), db = path.resolve(root, S.src.b);
    const na = await frameCount(da, S.src.aext), nb = await frameCount(db, S.src.bext);
    if (na > 0 && nb > 0) {
      const dA = na / FPS, dB = nb / FPS, dX = S.src.d ?? 1.2;
      input = ['-framerate', String(FPS), '-i', path.join(da, `frame_%05d.${S.src.aext}`),
        '-framerate', String(FPS), '-i', path.join(db, `frame_%05d.${S.src.bext}`)];
      xf = { dA, dB, dX, off: dA - dX };
      srcDur = dA + dB - dX;
    } else console.log(`SKIP ${tag}: xfade needs both sequences (a=${na} b=${nb})`);
  } else if (S.src?.kind === 'mp4') {
    const f = path.resolve(root, S.src.file);
    if (existsSync(f)) { input = ['-i', f]; srcDur = Math.min(S.src.dur ?? 1e9, (dur(f) ?? 0) - (S.src.in ?? 0)); trim = { in: S.src.in ?? 0, d: srcDur }; }
  } else if (S.src?.kind === 'frames') {
    const d = path.resolve(root, S.src.dir);
    const n = await frameCount(d, S.src.ext);
    if (n > 0) {
      const use = S.dur ? Math.min(n, Math.round(S.dur * FPS)) : n;
      input = ['-framerate', String(FPS), '-i', path.join(d, `frame_%05d.${S.src.ext}`)];
      srcDur = use / FPS; trim = { in: 0, d: srcDur };
    }
  } else {
    const n = await frameCount(fdirJpg, 'jpg');
    if (n > 0) {
      // `dur` ends a take early (a walker brushing the lens in its last frames)
      const use = S.dur ? Math.min(n, Math.round(S.dur * FPS)) : n;
      input = ['-framerate', String(FPS), '-i', path.join(fdirJpg, 'frame_%05d.jpg')]; srcDur = use / FPS;
      if (use < n) trim = { in: 0, d: srcDur };
    }
    else {
      const mp4 = path.join(clipRoot, S.name + '.mp4');
      if (existsSync(mp4)) { input = ['-i', mp4]; srcDur = dur(mp4); }
    }
  }
  if (!input) { console.log(`SKIP ${tag}: no source yet`); continue; }
  // a dissolve segment shows only one of its two sources at a single sample:
  // tell sheet.mjs to take a second frame from the middle of the far side
  const extra = xf ? { sheetExtra: [{ at: +((xf.off + xf.dX + (xf.dB - xf.dX) * 0.5) / srcDur).toFixed(4), tag: 'render' }] } : {};
  if (only && !only.includes(S.name)) {
    if (existsSync(segFile)) { built.push({ tag, segFile, dur: dur(segFile), ...extra }); continue; }
    console.log(`SKIP ${tag}: not in --only`); continue;
  }
  if (has('skipseg') && existsSync(segFile)) { built.push({ tag, segFile, dur: dur(segFile), ...extra }); console.log(`keep ${tag}`); continue; }

  const D = srcDur;
  const WIPE = S.wipe ?? (S.name.startsWith('m') ? 0.34 : 0.44);
  const vf = [`fps=${FPS}`, `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos`,   // film 7: takes are 2560x1440, Lanczos keeps the supersampled detail
    `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x0E0F11`, 'setsar=1'];
  if (trim) vf.unshift(`trim=start=${trim.in}:duration=${trim.d}`, 'setpts=PTS-STARTPTS');

  // --- the overlay wipe: an opaque DART-dark panel whose LEFT edge travels
  //     right over WIPE seconds, uncovering the clip from the left, with a 3 px
  //     hairline riding that edge.
  //
  //     This has to be `overlay`, not `drawbox`. drawbox clamps a negative x to
  //     0 (so x = W*E - W just covers the whole frame for the whole wipe) and
  //     it does not re-evaluate an expression in `w` per frame (so x = W*E with
  //     w = W - x drew nothing at all). Both were tried. overlay takes real
  //     per-frame offsets, including ones that push the panel off the canvas.
  const E = easeE(`clip(t/${WIPE.toFixed(3)},0,1)`);
  const wx = `(${W}*${E})`;
  const wipeDur = (WIPE + 0.2).toFixed(3);
  const pre = [
    xf
      ? `[0:v]${vf.join(',')}[xa];[1:v]${vf.join(',')}[xb];`
        + `[xa][xb]xfade=transition=fade:duration=${xf.dX.toFixed(3)}:offset=${xf.off.toFixed(3)}[base]`
      : `[0:v]${vf.join(',')}[base]`,
    `color=c=0x0E0F11:s=${W}x${H}:r=${FPS}:d=${wipeDur}[pan]`,
    `color=c=${PAL.WHITE}:s=4x${H}:r=${FPS}:d=${wipeDur}[hl]`,
    `[base][pan]overlay=x='${wx}':y=0:eof_action=pass:enable='lt(t,${WIPE.toFixed(3)})'[w1]`,
    `[w1][hl]overlay=x='${wx}':y=0:eof_action=pass:enable='lt(t,${WIPE.toFixed(3)})'[w2]`,
  ];
  const post = [];

  // --- caption
  if (S.caption && !S.nocap && !NOTEXT) {
    // capWrap: a narrower measure, for a caption that must stay inside part of
    // the frame — the perception panel's RGB quadrant is only the left 1280 px
    // and a full-width line runs into the semantic panel beside it
    const lines = wrap(S.caption, S.capWrap ?? 78);
    // capAt: hold the caption back to a moment inside the segment (the render
    // half of a dissolve). capTop: the bottom-left slot is already occupied by
    // the source frame's own furniture (the perception panel's labels table).
    const tIn = S.capAt != null ? S.capAt : WIPE + 0.16;
    const tOut = Math.max(tIn + 1.6, D - 0.2);
    const a = `'${rampIn(tIn, 0.7)}*${rampOut(tOut - 0.6, 0.6)}'`;
    const baseY = S.capTop ? 92 : H - 96 - (lines.length - 1) * 46 - (S.lower ? 100 : 0);
    // an accent rule of em-dashes, then the caption indented past it. It is
    // drawtext rather than drawbox because only drawtext takes an `alpha`
    // expression, and the rule has to fade on the same DART ramp as the words.
    await fs.writeFile(path.join(txtRoot, `${tag}_dash.txt`), '\u2014\u2014\u2014');
    post.push(`drawtext=fontfile=${FONT_BD}:textfile=${tag}_dash.txt:x=120:y=${baseY - 1}:fontsize=34:fontcolor=${PAL[S.accent] || PAL.WHITE}:alpha=${a}:shadowcolor=black@0.6:shadowx=0:shadowy=2`);
    for (let i = 0; i < lines.length; i++) {
      await fs.writeFile(path.join(txtRoot, `${tag}_c${i}.txt`), lines[i]);
      post.push(`drawtext=fontfile=${FONT_SB}:textfile=${tag}_c${i}.txt:x=214:y=${baseY + i * 46}:fontsize=34:fontcolor=${PAL.WHITE}:alpha=${a}:shadowcolor=black@0.75:shadowx=0:shadowy=3`);
    }
  }

  // --- credit pill (small, bottom-right): the only text --notext keeps, when a segment sets `credit`.
  //     A GLASS PILL (owner review 2026-09-24): tools/ad/glasspill.mjs renders the pill (dark translucent
  //     fill, hairline, Inter text, sized to the text) and its rounded mask; the graph below blurs the
  //     video under the pill through the mask and lays the pill on top.
  let pillG = null;
  if (NOTEXT && S.credit) {
    const pre0 = path.join(txtRoot, `${tag}_credit`);
    const pr = spawnSync(process.execPath, [path.join(here, 'glasspill.mjs'), S.credit, pre0, '17'], { encoding: 'utf8' });
    const dim = pr.status === 0 ? JSON.parse(pr.stdout.trim().split('\n').pop()) : null;
    if (!dim) { console.log(`FAILED ${tag}: glasspill\n${pr.stderr}`); continue; }
    pillG = { ...dim, x: W - 40 - dim.w, y: H - 40 - dim.h, pill: pre0 + '_pill.png', mask: pre0 + '_mask.png' };
  }
  // --- lower third, FIRST clip only
  if (S.lower && !NOTEXT) {
    const tIn = WIPE + 0.9, tOut = Math.max(tIn + 1.8, D - 0.25);
    const a = `'${rampIn(tIn, 0.7)}*${rampOut(tOut - 0.6, 0.6)}'`;
    await fs.writeFile(path.join(txtRoot, `${tag}_l1.txt`), LOWER1);
    await fs.writeFile(path.join(txtRoot, `${tag}_l2.txt`), LOWER2);
    post.push(`drawbox=x=120:y=${H - 106}:w=3:h=66:color=${PAL.BLUE}@1:t=fill:enable='gt(t,${(tIn + 0.35).toFixed(3)})*lt(t,${(tOut - 0.3).toFixed(3)})'`);
    post.push(`drawtext=fontfile=${FONT_BD}:textfile=${tag}_l1.txt:x=146:y=${H - 106}:fontsize=32:fontcolor=${PAL.WHITE}:alpha=${a}:shadowcolor=black@0.75:shadowx=0:shadowy=3`);
    post.push(`drawtext=fontfile=${FONT_RG}:textfile=${tag}_l2.txt:x=146:y=${H - 66}:fontsize=26:fontcolor=${PAL.GREY}:alpha=${a}:shadowcolor=black@0.75:shadowx=0:shadowy=3`);
  }
  let fc, inputs = input;
  if (pillG) {
    const nIn = input.filter((a) => a === '-i').length;          // the pill and its mask follow the clip input(s)
    const { w, h, x, y } = pillG;
    inputs = [...input, '-loop', '1', '-framerate', String(FPS), '-i', pillG.pill, '-loop', '1', '-framerate', String(FPS), '-i', pillG.mask];
    fc = [...pre,
      `[w2]${post.length ? post.join(',') + ',' : ''}split=2[pm0][pm1]`,
      // blur a margin wider than the pill, then cut the pill out of it: the edge of the blur sees the
      // picture around the pill, as a real backdrop blur does
      `[pm1]crop=${w + 48}:${h + 48}:${x - 24}:${y - 24},gblur=sigma=10,crop=${w}:${h}:24:24,format=rgba[pb]`,
      `[${nIn + 1}:v]format=gray,setsar=1[pk]`,
      '[pb][pk]alphamerge[pbm]',
      `[pm0][pbm]overlay=x=${x}:y=${y}:format=auto[pg]`,
      `[${nIn}:v]format=rgba,setsar=1[pp]`,
      `[pg][pp]overlay=x=${x}:y=${y}:format=auto,format=yuv420p[v]`,
    ].join(';');
  } else {
    post.push('format=yuv420p');
    fc = [...pre, `[w2]${post.join(',')}[v]`].join(';');
  }

  const ff = [...inputs, '-filter_complex', fc, '-map', '[v]', '-frames:v', String(Math.round(D * FPS)),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-pix_fmt', 'yuv420p', '-y', segFile];
  const r = spawnSync(bin, ff, { encoding: 'utf8', cwd: txtRoot, maxBuffer: 1 << 26 });
  if (r.status !== 0) { console.log(`FAILED ${tag}:\n` + (r.stderr || '').split('\n').slice(-18).join('\n')); continue; }
  console.log(`${tag.padEnd(20)} ${D.toFixed(2)}s  wipe ${WIPE}s  ${(statSync(segFile).size / 1e6).toFixed(0)} MB${S.lower && !NOTEXT ? '  + lower third' : ''}${S.caption && !S.nocap && !NOTEXT ? '  + caption' : ''}${NOTEXT && S.credit ? '  + credit' : ''}`);
  built.push({ tag, segFile, dur: D, ...extra });
}

if (!built.length) { console.log('nothing built'); process.exit(1); }

// ---- stage 2: concat + music + black head/tail ----------------------------
const list = path.join(segRoot, '_concat.txt');
await fs.writeFile(list, built.map((b) => `file '${b.segFile.replace(/\\/g, '/')}'`).join('\n'));
const body = built.reduce((a, b) => a + b.dur, 0);
const total = HEAD + body + TAIL;

const timeline = built.map((b, i) => ({
  n: b.tag, start: +(HEAD + built.slice(0, i).reduce((a, x) => a + x.dur, 0)).toFixed(2), dur: +b.dur.toFixed(2),
  // a dissolve segment shows only one of its two sources at a single sample, so
  // tell sheet.mjs to take a second frame from the far side of the xfade
  ...(b.sheetExtra ? { sheetExtra: b.sheetExtra } : {}),
}));
await fs.writeFile(path.join(adRoot, 'timeline.json'), JSON.stringify({ fps: FPS, head: HEAD, tail: TAIL, body: +body.toFixed(2), total: +total.toFixed(2), scenes: timeline }, null, 2));

const useMusic = !has('nomusic') && existsSync(MUSIC);
if (!useMusic && !has('nomusic')) console.log('NOTE: music not found at', MUSIC);
const vfin = [
  `fps=${FPS}`,
  `tpad=start_duration=${HEAD}:start_mode=add:color=black:stop_duration=${TAIL}:stop_mode=add:color=black`,
  `fade=t=in:st=${HEAD}:d=${BODYFADE}`,
  `fade=t=out:st=${(HEAD + body - BODYFADE).toFixed(3)}:d=${BODYFADE}`,
  'format=yuv420p',
].join(',');

const ff2 = ['-f', 'concat', '-safe', '0', '-i', list];
if (useMusic) ff2.push('-stream_loop', '-1', '-i', MUSIC);
ff2.push('-filter_complex',
  useMusic
    ? `[0:v]${vfin}[v];[1:a]atrim=0:${total.toFixed(3)},asetpts=PTS-STARTPTS,volume=0.35,` +
      `afade=t=in:st=0:d=2,afade=t=out:st=${(total - 4).toFixed(3)}:d=4[a]`
    : `[0:v]${vfin}[v]`);
ff2.push('-map', '[v]');
if (useMusic) ff2.push('-map', '[a]', '-c:a', 'aac', '-b:a', '192k');
ff2.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', '-t', total.toFixed(3), '-y', OUT);

console.log(`\nassembling ${built.length} segments: ${HEAD}s black + ${body.toFixed(1)}s body + ${TAIL}s black = ${total.toFixed(1)}s${useMusic ? '  + lofi @0.35 (2 s in, 4 s out)' : '  (silent)'}`);
const r2 = spawnSync(bin, ff2, { encoding: 'utf8', maxBuffer: 1 << 26 });
if (r2.status !== 0) { console.log('ffmpeg failed:\n' + (r2.stderr || '').split('\n').slice(-25).join('\n')); process.exit(1); }
console.log('\nWROTE', path.relative(root, OUT), (statSync(OUT).size / 1e6).toFixed(1) + ' MB', dur(OUT)?.toFixed(2) + 's');
console.log('timeline ->', path.relative(root, path.join(adRoot, 'timeline.json')));
for (const t of timeline) console.log(`  ${String(t.start).padStart(6)}s  ${String(t.dur).padStart(5)}s  ${t.n}`);

// ---- stage 3: the upload encode -------------------------------------------
// The CRF 19 master is ~600 MB, which no site will take as-is. This is the same
// picture at CRF 23 with a hard 10 Mb/s ceiling so a platform's own transcoder
// has a sane input, faststart so it plays before it finishes downloading, and
// AAC 160k. --noweb skips it.
if (!has('noweb')) {
  const WEB = OUT.replace(/\.mp4$/, '_web.mp4');
  const r3 = spawnSync(bin, ['-i', OUT,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '23',
    '-maxrate', '10M', '-bufsize', '20M', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-y', WEB], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r3.status !== 0) console.log('web encode failed:\n' + (r3.stderr || '').split('\n').slice(-12).join('\n'));
  else console.log('WROTE', path.relative(root, WEB), (statSync(WEB).size / 1e6).toFixed(1) + ' MB');
}
