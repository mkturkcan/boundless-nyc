// Convert the AR33 sign fonts (public/fonts/ar33/*.ttf, raw files from github.com/google/fonts) into three.js typeface
// JSON outlines for the channel letters, and write the browser font table src/city/fk/signFonts.js.
//   node tools/ar33/signs/mk_outlines.mjs [key ...]
// Each weight listed in fonts.mjs becomes public/fonts/ar33/o/<key>-<weight>[i].json: the glyph outlines (three's
// 'o' command strings: m x y / l x y / q x y cpx cpy / b x y c1x c1y c2x c2y, font units), the advance ('ha') and the
// pair kerning the font's GPOS/kern tables give (`kern`: { 'AV': -74, ... }, font units), cap and x heights.
// Variable faces are instanced with fontkit (getVariation); static faces are read as they are. The outlines are a
// format conversion of the font (a Modified Version under the OFL): they stay under the font's licence, and a face
// whose licence reserves its name is presented under a neutral name ('AR33 outline <n>').
import fs from 'node:fs';
import path from 'node:path';
import * as fontkit from 'fontkit';
import { FAMILIES } from './fonts.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const FD = path.resolve(HERE, '../../../public/fonts/ar33');
const OD = path.join(FD, 'o');
const JS = path.resolve(HERE, '../../../src/city/fk/signFonts.js');
fs.mkdirSync(OD, { recursive: true });

const CHARS = [];
for (let c = 32; c < 127; c++) CHARS.push(String.fromCharCode(c));
CHARS.push(...'’‘“”–—•éÉèáàñÑüö®©™°¢€½'.split(''));
const KERNSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,-&\'’'.split('');

const want = process.argv.slice(2);
const table = [];
let rfnN = 0;
for (const F of FAMILIES) {
  const lic = fs.readFileSync(path.join(FD, `LICENSE-${F.dir}.txt`), 'utf8');
  const rfn = /with Reserved Font Names?\s/i.test(lic);
  const entries = [];   // [tag, file, axes]
  if (F.files) for (const [tag, file] of Object.entries(F.files)) entries.push([tag, file, null]);
  else for (const w of F.w) entries.push([String(w), F.file, F.v ? { ...F.v, ...(F.v.wght ? { wght: w } : {}) } : null]);
  if (F.italic) for (const w of F.w) entries.push([w + 'i', F.italic, { wght: w }]);
  const outlines = {};
  for (const [tag, file, axes] of entries) {
    const out = `${F.key}-${tag}.json`;
    outlines[tag] = out;
    if (want.length && !want.includes(F.key)) continue;
    let font = fontkit.openSync(path.join(FD, file));
    if (axes) {
      const va = {};
      for (const [k, v] of Object.entries(axes)) if (!Array.isArray(v)) va[k] = v;
      if (Object.keys(va).length) font = font.getVariation(va);
    }
    const upm = font.unitsPerEm;
    const glyphs = {};
    let xMin = 1e9, xMax = -1e9, yMin = 1e9, yMax = -1e9;
    for (const ch of CHARS) {
      const gid = font.glyphForCodePoint(ch.codePointAt(0));
      if (!gid || (gid.id === 0 && ch !== ' ')) continue;
      const g = font.getGlyph(gid.id);
      const cmds = g.path.commands;
      const o = [];
      const R = (v) => Math.round(v * 10) / 10;
      for (const c of cmds) {
        const a = c.args;
        if (c.command === 'moveTo') o.push('m', R(a[0]), R(a[1]));
        else if (c.command === 'lineTo') o.push('l', R(a[0]), R(a[1]));
        else if (c.command === 'quadraticCurveTo') o.push('q', R(a[2]), R(a[3]), R(a[0]), R(a[1]));
        else if (c.command === 'bezierCurveTo') o.push('b', R(a[4]), R(a[5]), R(a[0]), R(a[1]), R(a[2]), R(a[3]));
      }
      const bb = g.bbox;
      if (cmds.length) { xMin = Math.min(xMin, bb.minX); xMax = Math.max(xMax, bb.maxX); yMin = Math.min(yMin, bb.minY); yMax = Math.max(yMax, bb.maxY); }
      glyphs[ch] = { ha: Math.round(g.advanceWidth), x_min: Math.round(bb.minX || 0), x_max: Math.round(bb.maxX || 0), o: o.join(' ') };
    }
    // pair kerning from the font's own layout (GPOS 'kern' feature or the legacy kern table)
    const kern = {};
    for (const a of KERNSET) {
      if (!glyphs[a]) continue;
      for (const b of KERNSET) {
        if (!glyphs[b]) continue;
        const run = font.layout(a + b, ['kern']);
        if (run.glyphs.length !== 2) continue;
        const d = run.positions[0].xAdvance - run.glyphs[0].advanceWidth;
        if (Math.abs(d) >= 1) kern[a + b] = Math.round(d);
      }
    }
    const name = rfn ? `AR33 outline ${++rfnN}` : `${font.familyName}`;
    const json = {
      glyphs, familyName: name, resolution: upm,
      ascender: font.ascent, descender: font.descent, capHeight: font.capHeight, xHeight: font.xHeight,
      underlinePosition: font.underlinePosition, underlineThickness: font.underlineThickness,
      boundingBox: { xMin: Math.round(xMin), xMax: Math.round(xMax), yMin: Math.round(yMin), yMax: Math.round(yMax) },
      cssFontWeight: tag.replace('i', ''), cssFontStyle: tag.endsWith('i') ? 'italic' : 'normal',
      kern,
      original_font_information: { copyright: font.copyright, licence: `LICENSE-${F.dir}.txt`, source: `github.com/google/fonts ${F.dir}/${file}`, axes: axes || null },
    };
    fs.writeFileSync(path.join(OD, out), JSON.stringify(json));
    console.log(out, Object.keys(glyphs).length, 'glyphs', Object.keys(kern).length, 'kern pairs', (fs.statSync(path.join(OD, out)).size / 1024).toFixed(0), 'KB');
  }
  // browser faces: a variable file is one FontFace with a weight range; static files one FontFace each
  const faces = [];
  if (F.files) for (const [tag, file] of Object.entries(F.files)) faces.push({ file, weight: tag.replace('i', ''), style: tag.endsWith('i') ? 'italic' : 'normal' });
  else if (F.v && F.v.wght) {
    faces.push({ file: F.file, weight: `${F.v.wght[0]} ${F.v.wght[1]}`, style: 'normal', ...(F.v.wdth ? { stretch: `${F.v.wdth}%` } : {}) });
    if (F.italic) faces.push({ file: F.italic, weight: `${F.v.wght[0]} ${F.v.wght[1]}`, style: 'italic' });
  } else faces.push({ file: F.file, weight: '400', style: 'normal' });
  table.push({ key: F.key, css: `ar33 ${F.key}`, faces, outlines, licence: `LICENSE-${F.dir}.txt`, axes: F.v || null });
}
if (!want.length) {
  const src = `// AR33 sign fonts: generated by boundlessjs/tools/ar33/signs/mk_outlines.mjs from tools/ar33/signs/fonts.mjs (do not edit).
// Raw TTF files from github.com/google/fonts in public/fonts/ar33/ (licence beside each family: LICENSE-<dir>.txt);
// outlines (three.js typeface JSON, for the channel letters) in public/fonts/ar33/o/.
// key: the name a spec uses ('Inter-700' = key 'Inter', weight 700); css: the family the canvas uses; faces: the
// FontFace descriptors; outlines: weight tag -> outline file ('700i' = italic).
export const SIGN_FONTS = ${JSON.stringify(table, null, 0).replace(/\},\{"key"/g, '},\n  {"key"')};
`;
  fs.writeFileSync(JS, src);
  console.log('wrote', JS);
}
