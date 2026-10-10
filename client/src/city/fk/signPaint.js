// AR33 SIGN: the font side of the sign kit (no three.js here). Registers the sign fonts (public/fonts/ar33/, raw TTF
// files from github.com/google/fonts, SIL OFL / Apache, licences beside them) with FontFace + document.fonts on first
// use, loads the letter outlines (public/fonts/ar33/o/*.json, three typeface JSON made by
// tools/ar33/signs/mk_outlines.mjs), and lays text out on a canvas: cap-height fitting, tracking, stacked lines,
// synthetic slant when a family has no italic, strokes, and the logo slot.
// Owner: SIGN (docs/notes/ar33-signs.md).
import { SIGN_FONTS } from './signFonts.js';

const BASE = 'fonts/ar33/';
const BY_KEY = new Map();
for (const F of SIGN_FONTS) BY_KEY.set(F.key.toLowerCase(), F);
// common spellings in the specs
const ALIAS = { helvetica: 'Arimo', arial: 'Arimo', impact: 'Anton', din: 'Barlow', futura: 'Jost', franklin: 'LibreFranklin',
  franklingothic: 'LibreFranklin', baskerville: 'LibreBaskerville', trajan: 'Cinzel', rockwell: 'RobotoSlab', avantgarde: 'Poppins',
  bebas: 'BebasNeue', archivocondensed: 'ArchivoNarrow', spartan: 'LeagueSpartan', playfair: 'PlayfairDisplay', tilt: 'TiltNeon',
  arialrounded: 'Nunito', vagrounded: 'Nunito', rounded: 'Nunito', baloo: 'Baloo2' };
export const DEFAULT_FONT = 'Inter-700';

// 'Inter-700', 'Inter 700', 'Barlow Condensed-700', 'BarlowCondensed-700i', 'Oswald-600-Italic', 'Anton', 'Lato-900 italic'
export function parseFont(name, italicFlag = false) {
  let s = String(name || DEFAULT_FONT).trim();
  let italic = !!italicFlag;
  if (/(-|\s)?(italic|ital)$/i.test(s)) { italic = true; s = s.replace(/(-|\s)?(italic|ital)$/i, ''); }
  let weight = null;
  const m = s.match(/^(.*?)[-\s]?(\d{3})(i)?$/);
  if (m) { s = m[1]; weight = +m[2]; if (m[3]) italic = true; }
  const k = s.replace(/[\s_-]+/g, '').toLowerCase();
  let F = BY_KEY.get(k) || BY_KEY.get(String(ALIAS[k] || '').toLowerCase());
  if (!F) { F = BY_KEY.get('inter'); if (weight == null) weight = 700; }
  // the weights this family has (faces: a range for a variable file, a list for static files)
  const tags = Object.keys(F.outlines);
  const ws = [...new Set(tags.map((t) => +t.replace('i', '')))].sort((a, b) => a - b);
  if (weight == null) weight = F.faces.length === 1 && !F.faces[0].weight.includes(' ') ? +F.faces[0].weight : (ws.includes(400) ? 400 : ws[0]);
  let wRange = null;
  for (const f of F.faces) if (f.weight.includes(' ')) wRange = f.weight.split(' ').map(Number);
  // the face that will draw it: a variable range takes any weight, static faces the nearest one
  const hasItalic = F.faces.some((f) => f.style === 'italic');
  const faceW = wRange ? Math.max(wRange[0], Math.min(wRange[1], weight)) : nearest(F.faces.filter((f) => (f.style === 'italic') === (italic && hasItalic)).map((f) => +f.weight), weight);
  const style = italic && hasItalic ? 'italic' : 'normal';
  // the outline file: the nearest pre-converted weight in the same style
  const oTags = tags.filter((t) => t.endsWith('i') === (style === 'italic'));
  const oW = nearest(oTags.map((t) => +t.replace('i', '')), weight);
  const oTag = String(oW) + (style === 'italic' ? 'i' : '');
  return { key: F.key, F, css: F.css, weight: faceW, style, synthItalic: italic && !hasItalic,
    stretch: F.key === 'ArchivoNarrow' ? 'extra-condensed' : 'normal', outline: F.outlines[oTag] || F.outlines[tags[0]], id: `${F.key}-${faceW}${style === 'italic' ? 'i' : ''}` };
}
function nearest(list, w) {
  let best = list[0] ?? 400, bd = 1e9;
  for (const v of list) { const d = Math.abs(v - w) + (v < w ? 0.5 : 0); if (d < bd) { bd = d; best = v; } }
  return best;
}

// ---------------------------------------------------------------- font loading (FontFace + document.fonts)
const _faceP = new Map();      // file|family -> Promise<boolean>
const _ready = new Set();      // font ids ('Inter-700') whose face has loaded
const HAS_DOM = typeof document !== 'undefined' && typeof FontFace !== 'undefined' && !!document.fonts;
function faceFile(file) { return BASE + file.replace(/\[/g, '%5B').replace(/\]/g, '%5D').replace(/,/g, '%2C'); }
function loadFace(F, face) {
  const k = F.css + '|' + face.file + '|' + face.style;
  if (_faceP.has(k)) return _faceP.get(k);
  let p;
  if (!HAS_DOM) p = Promise.resolve(false);
  else {
    try {
      const desc = { weight: face.weight, style: face.style };
      if (F.key === 'Archivo' || F.key === 'ArchivoNarrow') desc.stretch = '62% 125%';
      const ff = new FontFace(F.css, `url("${faceFile(face.file)}")`, desc);
      document.fonts.add(ff);
      p = ff.load().then(() => true, (e) => { console.warn('[ar33 signs] font failed', face.file, e && e.message); return false; });
    } catch (e) { p = Promise.resolve(false); }
  }
  _faceP.set(k, p);
  return p;
}
// load the face(s) a font name needs; resolves true once canvas text in it will not fall back
export function loadFont(name, italic = false) {
  const fi = typeof name === 'object' && name && name.F ? name : parseFont(name, italic);
  const faces = fi.F.faces.filter((f) => f.style === fi.style && (f.weight.includes(' ') || +f.weight === fi.weight));
  const list = faces.length ? faces : fi.F.faces.slice(0, 1);
  return Promise.all(list.map((f) => loadFace(fi.F, f))).then(async (ok) => {
    if (HAS_DOM) { try { await document.fonts.load(`${fi.style} ${fi.weight} 40px "${fi.css}"`); } catch { /* no-op */ } }
    if (ok.every(Boolean)) _ready.add(fi.id);
    return ok.every(Boolean);
  });
}
export function fontReady(fi) { return _ready.has(fi.id); }

// ---------------------------------------------------------------- outlines (three typeface JSON)
const _olP = new Map(), _ol = new Map();
export function loadOutline(fi) {
  const f = fi.outline;
  if (_olP.has(f)) return _olP.get(f);
  // off the page (node tools) there is nothing to fetch from: no outlines, quietly
  if (!HAS_DOM) { const p0 = Promise.resolve(null); _olP.set(f, p0); return p0; }
  const p = (typeof fetch === 'undefined' ? Promise.reject(new Error('no fetch')) : fetch(BASE + 'o/' + f).then((r) => { if (!r.ok) throw new Error(r.status + ' ' + f); return r.json(); }))
    .then((j) => { _ol.set(f, j); return j; }, (e) => { console.warn('[ar33 signs] outline failed', f, e && e.message); return null; });
  _olP.set(f, p);
  return p;
}
export function outlineOf(fi) { return _ol.get(fi.outline) || null; }

// ---------------------------------------------------------------- canvas text
// Arabic script (shop signs in Arabic): the canvas falls back to the kit's Naskh face for the glyphs a Latin family lacks
export const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
export const ARABIC_FONT = 'NotoNaskhArabic-700';
export function fontCSS(fi, px) { return `${fi.style} ${fi.weight} ${Math.max(1, Math.round(px * 10) / 10)}px "${fi.css}", "ar33 NotoNaskhArabic"`; }
export function setFont(c, fi, px, trackEm = 0) {
  c.font = fontCSS(fi, px);
  try { c.fontStretch = fi.stretch; } catch { /* older canvas */ }
  try { c.letterSpacing = `${(trackEm * px).toFixed(2)}px`; } catch { /* no letterSpacing */ }
  try { c.fontKerning = 'normal'; } catch { /* no-op */ }
}
// the ink box of a string at a size: [width, ascent above the baseline, descent below]
export function inkBox(c, s, fi, px, trackEm = 0) {
  setFont(c, fi, px, trackEm);
  const m = c.measureText(s);
  const w = Math.abs(m.actualBoundingBoxLeft) + Math.abs(m.actualBoundingBoxRight);
  return { w: Math.max(m.width, w), adv: m.width, asc: m.actualBoundingBoxAscent, desc: m.actualBoundingBoxDescent, left: m.actualBoundingBoxLeft };
}
// the cap height of a font as a share of its em (from the outlines when loaded, else measured)
const _capK = new Map();
export function capK(c, fi) {
  if (_capK.has(fi.id)) return _capK.get(fi.id);
  const o = outlineOf(fi);
  let k = o && o.capHeight ? o.capHeight / o.resolution : null;
  if (!k) { setFont(c, fi, 200); const m = c.measureText('H'); k = (m.actualBoundingBoxAscent || 140) / 200; }
  if (fontReady(fi)) _capK.set(fi.id, k);
  return k;
}

// Lay a block of text into a box and draw it. box = [x, y, w, h] (px). o = { lines, fi, fill (cap height / box h for one
// line), lead (line pitch / cap height), tracking (em), align, italic (synthetic slant), color, stroke {color, w(em)},
// maxPx, valign 'middle'|'top'|'bottom', shadow }. Returns the px size used and the ink extent.
export function drawText(c, box, o) {
  const [bx, by, bw, bh] = box;
  const L = o.lines.filter((s) => s != null && String(s).length).map(String);
  if (!L.length || bw <= 1 || bh <= 1) return { px: 0, w: 0 };
  const fi = o.fi, tr = o.tracking || 0, n = L.length;
  const lead = o.lead || 1.45;
  const ck = capK(c, fi);
  // cap height from the height share: n lines of cap height ch with (n - 1) gaps of (lead - 1) ch
  let ch = (bh * (o.fill ?? 0.62)) / (n + (n - 1) * (lead - 1));
  if (n > 1 && o.fill == null) ch = bh * 0.8 / (n + (n - 1) * (lead - 1));
  let px = ch / ck;
  if (o.maxPx) px = Math.min(px, o.maxPx);
  // shrink to the width (every line at one size)
  for (let it = 0; it < 3; it++) {
    let wMax = 0;
    for (const s of L) wMax = Math.max(wMax, inkBox(c, s, fi, px, tr).w);
    const slantW = o.italic ? ch * 0.21 : 0;
    if (wMax + slantW > bw) px *= (bw - slantW) / (wMax + slantW) * 0.995; else break;
  }
  ch = px * ck;
  const pitch = ch * lead;
  const blockH = ch + (n - 1) * pitch;
  let y0 = by + (bh - blockH) / 2 + ch;     // the first baseline (optical centring on the cap height)
  if (o.valign === 'top') y0 = by + ch; else if (o.valign === 'bottom') y0 = by + bh - (n - 1) * pitch;
  let wMax = 0;
  c.save();
  c.textBaseline = 'alphabetic';
  for (let i = 0; i < n; i++) {
    const s = L[i];
    const ib = inkBox(c, s, fi, px, tr);
    const yb = y0 + i * pitch;
    // align on the ink, not the advance (letterSpacing adds a trailing space the eye does not see)
    let x = o.align === 'left' ? bx + ib.left : o.align === 'right' ? bx + bw - ib.w + ib.left : bx + (bw - ib.w) / 2 + ib.left;
    c.save();
    if (o.italic) { c.translate(x, yb); c.transform(1, 0, -0.21, 1, 0, 0); c.translate(-x, -yb); x += ch * 0.1; }
    if (o.shadow) { c.shadowColor = o.shadow.color; c.shadowBlur = o.shadow.blur; c.shadowOffsetX = o.shadow.dx || 0; c.shadowOffsetY = o.shadow.dy || 0; }
    if (o.stroke) {
      c.lineJoin = 'round'; c.miterLimit = 2;
      c.strokeStyle = o.stroke.color; c.lineWidth = Math.max(1, (o.stroke.w || 0.06) * px * 2);
      c.strokeText(s, x, yb);
      c.shadowColor = 'transparent';
    }
    c.fillStyle = o.color || '#fff';
    c.fillText(s, x, yb);
    c.restore();
    wMax = Math.max(wMax, ib.w);
  }
  c.restore();
  return { px, w: wMax, ch, blockH };
}

// One line of mixed runs (two-colour names: 'Cinderella' in yellow italic + 'EYEBROWS' in white block capitals).
// runs = [{ text, fi, color, scale (cap height relative to the line, default 1), tracking (em), italic, gap (em before),
// dy (cap heights up) }]. Fitted into the box at a common cap height (fill = cap height / box h), then shrunk to width.
export function drawRuns(c, box, runs, o = {}) {
  const [bx, by, bw, bh] = box;
  const R = runs.filter((r) => r && r.text);
  if (!R.length) return { px: 0, w: 0 };
  let ch = bh * (o.fill ?? 0.62);
  const measure = (ch) => {
    let x = 0; const parts = [];
    for (const r of R) {
      const cH = ch * (r.scale || 1), px = cH / capK(c, r.fi);
      const gap = (r.gap || 0) * px;
      const ib = inkBox(c, r.text, r.fi, px, r.tracking || 0);
      x += gap;
      parts.push({ r, px, cH, x, ib, slant: r.italic ? cH * 0.21 : 0 });
      x += (parts.length === R.length ? ib.w : ib.adv) + (r.italic ? cH * 0.1 : 0);
    }
    return { W: x, parts };
  };
  let M = measure(ch);
  if (M.W > bw) { ch *= bw / M.W * 0.995; M = measure(ch); }
  let x0 = o.align === 'left' ? bx : o.align === 'right' ? bx + bw - M.W : bx + (bw - M.W) / 2;
  const yb = by + (bh - ch) / 2 + ch;
  c.save(); c.textBaseline = 'alphabetic';
  for (const p of M.parts) {
    setFont(c, p.r.fi, p.px, p.r.tracking || 0);
    let x = x0 + p.x + p.ib.left;
    const y = yb - (p.r.dy || 0) * ch;
    c.save();
    if (p.r.italic) { c.translate(x, y); c.transform(1, 0, -0.21, 1, 0, 0); c.translate(-x, -y); }
    if (o.shadow) { c.shadowColor = o.shadow.color; c.shadowBlur = o.shadow.blur; c.shadowOffsetX = o.shadow.dx || 0; c.shadowOffsetY = o.shadow.dy || 0; }
    if (p.r.stroke) { c.lineJoin = 'round'; c.strokeStyle = o.maskColor || p.r.stroke.color; c.lineWidth = Math.max(1, (p.r.stroke.w || 0.06) * p.px * 2); c.strokeText(p.r.text, x, y); c.shadowColor = 'transparent'; }
    c.fillStyle = o.maskColor || p.r.color || '#fff';
    c.fillText(p.r.text, x, y);
    c.restore();
  }
  c.restore();
  return { px: M.parts[0].px, w: M.W, ch, parts: M.parts, x0, yb };
}

// fonts a spec tree names: every `font` string in signs, awnings, vinyl and banners (walks objects and arrays)
export function fontsIn(tree, out = new Set(), depth = 0, needO = false) {
  if (!tree || depth > 12) return out;
  if (Array.isArray(tree)) { for (const v of tree) fontsIn(v, out, depth + 1, needO); return out; }
  if (typeof tree === 'object') {
    // letters that are geometry (channel, numbers, push-through on lit panels) need their outlines too, runs included
    const o = needO || tree.kind === 'channel' || tree.kind === 'numbers' || (tree.kind === 'panel' && tree.lit === 'face');
    for (const [k, v] of Object.entries(tree)) {
      if (k === 'font' && typeof v === 'string') out.add(v + (tree.italic ? '|i' : '') + (o ? '|o' : ''));
      else if ((k === 'text' && typeof v === 'string' && ARABIC.test(v)) || (k === 'lines' && Array.isArray(v) && v.some((x) => ARABIC.test(String(x))))) out.add(ARABIC_FONT);
      else if (v && typeof v === 'object') fontsIn(v, out, depth + 1, k === 'runs' ? o : false);
    }
  }
  return out;
}
