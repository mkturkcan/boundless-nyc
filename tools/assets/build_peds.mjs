// CARLA 0.10 walkers -> the NYC twin's crowd assets (boundlessjs/public/models/peds24/).
//   node tools/assets/build_peds.mjs [--notex] [--only SK_name,...]
//
// BODIES (25 skeletal meshes): one GLB each with LOD0/LOD1/LOD2 nodes, and per LOD TWO primitives — `opaque` (skin,
// clothes, eyes merged) and `hair` (alpha-tested cards). Attributes: POSITION, NORMAL, TEXCOORD_0 (UDIM u kept in [0, 2)),
// JOINTS_0 (CANONICAL bone order = the clip tracks' order), WEIGHTS_0 (4, renormalised), _SLOT (material slot), _CLS (0 skin,
// 1 cloth, 2 eye, 3 hair), _PART (tint group: 1 top, 2 bottom, 3 shoes, 0 other). No skin object and no images: the
// runtime (src/sim/crowd.js) skins on the GPU from a pose texture.
// TEXTURES: every material's maps are deduplicated into TEXTURE SETS and packed as layers of four 2D ARRAY textures —
// albedo (1024, sRGB), normal (512, OpenGL), orm (512: R occlusion, G roughness, B metal) in parallel, and hair (1024 RGBA,
// colour baked from the root/tip/diffuse parameters, alpha = strand mask). A UDIM skin (two 4K tiles) takes two consecutive
// layers. A VARIANT (walker blueprint) is then just a slot -> layer table, so all 37 outfits of 25 bodies draw in two
// calls per body per LOD.
// Sources: CARLA 0.10.0 content, CC-BY 4.0 (boundlessjs/DATA_SOURCES.md; provenance note in docs/notes/peds-veh-v2.md).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { weld, simplifyPrimitive, reorder, quantize, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import { readMaterial, findTexture, pkgOf, EXPORT_ROOT, JSON_ROOT } from './lib/ue.mjs';
import { BASISU } from './lib/tex.mjs';
import { FITS, loadProps, fitProps, propGeometry } from './lib/propfit.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const OUT = path.join(ROOT, 'boundlessjs/public/models/peds24');
const TMP = (process.env.ASSET_TOOLS || `${process.env.USERPROFILE || process.env.HOME}/.tools`) + '/pedtex';
const args = process.argv.slice(2);
const NOTEX = args.includes('--notex');
const ARRAYS = (() => { const i = args.indexOf('--arrays'); return i >= 0 ? args[i + 1].split(',') : null; })();
const ONLY = (() => { const i = args.indexOf('--only'); return i >= 0 ? args[i + 1].split(',') : null; })();
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const d of [path.join(OUT, 'tex'), path.join(OUT, 'bodies'), TMP]) fs.mkdirSync(d, { recursive: true });

// ---------------- skeletons: canonical bone order = the clip tracks' order ----------------
const ANIM = (process.env.ASSET_TOOLS || `${process.env.USERPROFILE || process.env.HOME}/.tools`) + '/carla_anim';
const trackNames = (f) => JSON.parse(fs.readFileSync(path.join(ANIM, f), 'utf8')).tracks.map((t) => t.bone);
const SKEL = { gen2: { bones: trackNames('AS_male2_WalkCicle0E.anim.json') }, gen3: { bones: trackNames('AS_ShortWalkingG3.anim.json') } };
for (const s of Object.values(SKEL)) s.index = new Map(s.bones.map((b, i) => [b, i]));

// ---------------- material classes ----------------
const DROP = /eyeocclusion|eyeocc_|lacrimal|elelid|m_elelid/i;
const CLS = { skin: 0, cloth: 1, eye: 2, hair: 3 };
function classOf(miName, mi) {
  if (!mi || DROP.test(miName)) return null;
  const sh = mi.shading || '';
  // eyes by name, or by their iris parameters (MI_AfroM__DARK_MH is an eye material named like a skin set: it rendered
  // as cloth — blank white eyes)
  if (/eyerefractive|eye_v|eyeball/i.test(miName) || mi.textures?.IrisBaseColor || mi.scalars?.IrisUVRadius != null) return 'eye';
  if (/MSM_Hair/.test(sh) || /hair|dread|eyebrow|brow|redhead_rgr|slashes|_eyes$/i.test(miName)) return 'hair';
  if (/Subsurface/.test(sh) || /skin|head_|hand|nails|body_/i.test(miName)) return 'skin';
  return 'cloth';
}
function partOf(miName, slotName) {
  const s = (miName + ' ' + (slotName || '')).toLowerCase();
  if (/shoe|boot|sneaker|feet|foot/.test(s)) return 3;
  if (/pant|jean|trouser|short|skirt|legging|vaquero/.test(s)) return 2;
  if (/badge|belt|hat|cap_|glass|watch|bag/.test(s)) return 0;
  return 1;
}
const isFlat = (n) => !n || /^(T_Flat_|DefaultTexture|T_DefaultTexture|Black$|T_black|T_EV_BlankWhite|T_FlatNormal)/i.test(n);

// ---------------- image helpers (two-pass: never let sharp premultiply by a zero alpha) ----------------
const imgCache = new Map();
// TEXTURE PATCHES applied on load: CARLA branding printed on garments (a bomber reads "CARLA" across the back — a tell in
// any NYC frame) is covered with the same fabric copied from next to it. rect / from in fractions of the image.
const BOMRED = [
  { rect: [155 / 2048, 1403 / 2048, 466 / 2048, 1470 / 2048], from: [0, -72 / 2048] },    // "CARLA" across the back
  { rect: [328 / 2048, 44 / 2048, 486 / 2048, 190 / 2048], from: [-165 / 2048, 0] },      // the CARLA roundel on the chest
];
const PATCHES = { T_BomRed_d: BOMRED, T_BomRedWR_n: BOMRED, T_BomRed_ORM: BOMRED };   // the letters are embossed in the normal map too
function applyPatches(name, r) {
  for (const P of PATCHES[name] || []) {
    const [x0, y0, x1, y1] = [P.rect[0] * r.w, P.rect[1] * r.h, P.rect[2] * r.w, P.rect[3] * r.h].map(Math.round);
    const dx = Math.round(P.from[0] * r.w), dy = Math.round(P.from[1] * r.h);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const o = (y * r.w + x) * r.ch, s = ((y + dy) * r.w + (x + dx)) * r.ch;
      for (let c = 0; c < r.ch; c++) r.data[o + c] = r.data[s + c];
    }
  }
}
async function rawOf(name) {
  if (imgCache.has(name)) return imgCache.get(name);
  const f = findTexture(name);
  if (!f) { imgCache.set(name, null); return null; }
  const full = await sharp(f).raw().toBuffer({ resolveWithObject: true });
  const r = { data: full.data, w: full.info.width, h: full.info.height, ch: full.info.channels };
  applyPatches(name, r);
  if (imgCache.size > 12) imgCache.delete(imgCache.keys().next().value);
  imgCache.set(name, r);
  return r;
}
// crop tile `tile` of `tiles` (horizontal UDIM row), take 3 channels, resize to S x S
async function planeRGB(name, S, tile = 0, tiles = 1) {
  const r = await rawOf(name);
  if (!r) return null;
  const tw = Math.floor(r.w / tiles), x0 = tile * tw;
  const out = Buffer.alloc(tw * r.h * 3);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < tw; x++) {
    const i = (y * r.w + x0 + x) * r.ch, o = (y * tw + x) * 3;
    out[o] = r.data[i]; out[o + 1] = r.data[i + Math.min(1, r.ch - 1)]; out[o + 2] = r.data[i + Math.min(2, r.ch - 1)];
  }
  return sharp(out, { raw: { width: tw, height: r.h, channels: 3 } }).resize(S, S, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
}
async function planeA(name, S) {
  const r = await rawOf(name);
  if (!r) return null;
  const out = Buffer.alloc(r.w * r.h);
  // CARLA hair masks carry the strands in RGB with a constant alpha: take R, unless R is flat and alpha is not
  let rv = 0, av = 0;
  for (let i = 0; i < r.w * r.h; i += 97) { rv += r.data[i * r.ch] > 8 && r.data[i * r.ch] < 247 ? 1 : 0; if (r.ch === 4) av += r.data[i * r.ch + 3] > 8 && r.data[i * r.ch + 3] < 247 ? 1 : 0; }
  const ch = r.ch === 4 && av > rv ? 3 : 0;
  for (let i = 0; i < r.w * r.h; i++) out[i] = r.data[i * r.ch + ch];
  // sharp hands a 1-channel raw input back as 3 channels after resize: extract one explicitly
  return sharp(out, { raw: { width: r.w, height: r.h, channels: 1 } }).resize(S, S, { kernel: 'lanczos3', fit: 'fill' }).extractChannel(0).raw().toBuffer();
}
// mean LINEAR colour of a texture over its skin-like pixels (ignores empty black/white atlas space)
const meanCache = new Map();
async function meanColor(name) {
  if (meanCache.has(name)) return meanCache.get(name);
  const p = await planeRGB(name, 64);
  let n = 0; const m = [0, 0, 0];
  if (p) for (let i = 0; i < p.length; i += 3) {
    const l = (p[i] + p[i + 1] + p[i + 2]) / 765;
    if (l < 0.06 || l > 0.96) continue;
    m[0] += toL(p[i]); m[1] += toL(p[i + 1]); m[2] += toL(p[i + 2]); n++;
  }
  const r = n ? m.map((v) => v / n) : null;
  meanCache.set(name, r);
  return r;
}
// robust skin tone of a skin texture: per-channel MEDIAN (linear) over skin-like texels, so hair, brows, lips and UV padding
// do not drag it. UDIM skins are measured on the face tile (tile 1), whose lower half carries the neck and hands.
// face = true: a head texture — only the central face window (cheeks, nose, mouth; hair and padding surround it in every
// CARLA head layout) counts; else the whole texture (hands / body sheets are all skin)
async function skinMedian(name, udim, face = true) {
  const S = 128;
  const p = udim ? await planeRGB(name, S, 1, 2) : await planeRGB(name, S);
  if (!p) return null;
  const ch = [[], [], []];
  for (let i = 0; i < p.length; i += 3) {
    const x = ((i / 3) % S) / S, y = Math.floor(i / 3 / S) / S;
    if (face && (x < 0.36 || x > 0.64 || y < 0.3 || y > 0.56)) continue;
    const r = p[i], g = p[i + 1], b = p[i + 2];
    if (r < 28 || r > 252 || g > r || b > g * 1.05 || (r - b) / r < 0.1 || (r - b) / r > 0.82) continue;
    ch[0].push(r); ch[1].push(g); ch[2].push(b);
  }
  if (ch[0].length < 60) return null;
  return ch.map((a) => { a.sort((x, y) => x - y); return toL(a[a.length >> 1]); });
}
const toL = (b) => { const v = b / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
// per-variant face tone targets (sRGB median over the face window): II light 206,164,142 / III 196,152,126 / IV 178,132,104
// / V 126,88,66 / VI 94,65,51 — chosen per character from the blueprint's ethnicity label and CARLA's DARK / light naming
const SKIN_TONE = [
  [/MaleAfro_v\d/, [100, 68, 54]], [/Male_Afro02/, [92, 64, 50]], [/FemaleAfro(_v2)?$/, [126, 88, 66]],
  [/FemaleAfro02/, [94, 65, 51]], [/FemaleAfro03/, [104, 72, 56]], [/MaleAmer_Cop/, [190, 144, 118]], [/MaleAmer_v/, [178, 132, 104]],
  [/MaleAsia_v/, [196, 152, 124]], [/Male_Asia02/, [190, 146, 118]], [/FemaleAsia/, [200, 156, 130]],
  [/FemaleEuro(_v2)?$/, [208, 164, 142]], [/Female_Euro_Owv/, [204, 160, 138]], [/MaleEuro(_v2)?$/, [202, 158, 136]],
  [/Male_EuroW_Owv/, [198, 154, 130]], [/EuBoy02/, [206, 164, 144]], [/EuGirl02/, [212, 168, 146]], [/A[BG]001_G3/, [108, 74, 56]],
];
const toS = (v) => Math.round(255 * Math.min(1, Math.max(0, v >= 0.0031308 ? 1.055 * v ** (1 / 2.4) - 0.055 : 12.92 * v)));

// ---------------- texture sets -> array layers ----------------
const AL = 1024, NL = 512, HL = 1024;
const layers = [];          // opaque layers: { key, albedo: fn -> Buffer, normal, orm }
const setBase = new Map();  // set key -> base layer
const hairLayers = [];      // { key, build }
const hairBase = new Map();

function flatNormal(S) { const b = Buffer.alloc(S * S * 3); for (let i = 0; i < S * S; i++) { b[i * 3] = 128; b[i * 3 + 1] = 128; b[i * 3 + 2] = 255; } return b; }
function constRGB(S, r, g, b) { const o = Buffer.alloc(S * S * 3); for (let i = 0; i < S * S; i++) { o[i * 3] = r; o[i * 3 + 1] = g; o[i * 3 + 2] = b; } return o; }
// DirectX -> OpenGL green + renormalise
function fixNormal(buf) { for (let i = 0; i < buf.length; i += 3) { let x = buf[i] / 127.5 - 1, y = -(buf[i + 1] / 127.5 - 1), z = Math.max(0, buf[i + 2] / 127.5 - 1); const l = Math.hypot(x, y, z) || 1; buf[i] = Math.round((x / l + 1) * 127.5); buf[i + 1] = Math.round((y / l + 1) * 127.5); buf[i + 2] = Math.round((z / l + 1) * 127.5); } return buf; }

function opaqueSet(cls, mi, mult = null) {
  const t = mi.textures, s = mi.scalars;
  if (cls === 'skin') {
    const udim = !isFlat(t.Color_MAIN_UDIM);
    const col = udim ? t.Color_MAIN_UDIM : t.Diffuse, nrm = udim ? t.Normal_MAIN_UDIM : t.Normal, orc = udim ? null : t.ORC;
    const key = `skin|${col}|${nrm}|${orc}|${mult ? (mult.tone ? 'tone:' + mult.tone.map((v) => v.toFixed(4)).join(',') : mult.map((v) => v.toFixed(2)).join(',')) : ''}`;
    if (setBase.has(key)) return setBase.get(key);
    const base = layers.length;
    const tiles = udim ? 2 : 1;
    for (let k = 0; k < tiles; k++) layers.push({
      key: key + '#' + k,
      albedo: async () => {
        let p = isFlat(col) ? constRGB(AL, 180, 140, 120) : await planeRGB(col, AL, k, tiles);
        // one exported UDIM (T_EuroW_c) has a mis-decoded BODY tile (a repeating multicolour micro-pattern that reads as
        // lavender hands): real skin tiles have neighbour differences under 5 at 1024 px, that one ~50. It gets the
        // sibling tile's mean skin tone, sampled from the tile's lower half (neck / hands; the top half is the face + hair)
        const hf = (q, S) => { let s = 0, n = 0; for (let y = 0; y < S; y += 3) for (let x = 0; x < S - 1; x += 3) { const i = (y * S + x) * 3; s += Math.abs(q[i] - q[i + 3]) + Math.abs(q[i + 1] - q[i + 4]); n++; } return s / n / 2; };
        if (tiles === 2 && p && hf(p, AL) > 20) {
          const o = await planeRGB(col, 256, 1 - k, tiles);
          if (o && hf(o, 256) < 20) {
            const m = [0, 0, 0]; let n = 0;
            for (let i = 256 * 140 * 3; i < o.length; i += 3) if (o[i] > o[i + 1] && o[i + 1] >= o[i + 2] * 0.95 && o[i] > 40) { for (let c = 0; c < 3; c++) m[c] += toL(o[i + c]); n++; }
            if (n) { const cs = m.map((v) => toS(v / n)); p = constRGB(AL, cs[0], cs[1], cs[2]); console.log('  UDIM tile', k, 'of', col, 'replaced with skin tone', cs.join(',')); }
          }
        }
        if (p && mult && mult.tone) {
          // a GENERIC hand / body sheet (some carry almost no blue, so per-channel gains turned dark hands orange): keep its
          // luminance detail only and take the colour from the variant's calibrated face tone
          const Y = (i) => 0.2126 * toL(p[i]) + 0.7152 * toL(p[i + 1]) + 0.0722 * toL(p[i + 2]);
          let s = 0, n = 0;
          for (let i = 0; i < p.length; i += 3 * 5) { const y = Y(i); if (y > 0.004 && y < 0.9) { s += y; n++; } }
          const mY = n ? s / n : 0.2;
          for (let i = 0; i < p.length; i += 3) { const k = Math.min(1.7, Math.max(0.35, Y(i) / mY)); for (let c = 0; c < 3; c++) p[i + c] = toS(mult.tone[c] * k); }
        } else if (p && mult) for (let i = 0; i < p.length; i += 3) for (let c = 0; c < 3; c++) p[i + c] = toS(toL(p[i + c]) * mult[c]);
        return p;
      },
      normal: async () => (isFlat(nrm) ? flatNormal(NL) : fixNormal(await planeRGB(nrm, NL, k, tiles) || flatNormal(NL))),
      orm: async () => {
        if (orc && !isFlat(orc)) { const p = await planeRGB(orc, NL); if (p) { for (let i = 0; i < p.length; i += 3) p[i + 2] = 0; return p; } }
        return constRGB(NL, 255, Math.round(255 * Math.min(0.9, Math.max(0.35, (s.MinRoughness ?? 0.35) + 0.2))), 0);
      },
    });
    setBase.set(key, base);
    return base;
  }
  if (cls === 'cloth') {
    const col = t['Diffuse Texture'] || t.Diffuse, nrm = t.Normalmap || t.Normal, orm = t.ORM_MatC || t.ORM;
    const key = `cloth|${col}|${nrm}|${orm}`;
    if (setBase.has(key)) return setBase.get(key);
    const base = layers.length;
    layers.push({
      key,
      albedo: () => (isFlat(col) ? constRGB(AL, 90, 90, 95) : planeRGB(col, AL)),
      normal: async () => (isFlat(nrm) ? flatNormal(NL) : fixNormal(await planeRGB(nrm, NL) || flatNormal(NL))),
      orm: async () => (isFlat(orm) ? constRGB(NL, 255, 200, 0) : (await planeRGB(orm, NL)) || constRGB(NL, 255, 200, 0)),
    });
    setBase.set(key, base);
    return base;
  }
  // eye: sclera (veins) + iris disk composited around uv (0.5, 0.5). The MetaHuman-style iris sheets are GREYSCALE (UE tints
  // them in the eye shader) and the sclera sheet's periphery is pink (hidden by lids and the occlusion shell in UE, which
  // we drop): the iris takes a colour from the material's naming (BLUE / DARK / default brown), the periphery is calmed to
  // a shadowed off-white
  const iris = t.IrisBaseColor, scl = t.ScleraBaseColor || t.PM_Diffuse, R = s.IrisUVRadius ?? 0.17;
  const tintOf = /blue/i.test(mi?.name || '') ? [0.42, 0.62, 0.85] : /dark/i.test(mi?.name || '') ? [0.55, 0.36, 0.24] : [0.75, 0.52, 0.3];
  const key = `eye|${iris}|${scl}|${tintOf.join(',')}`;
  if (setBase.has(key)) return setBase.get(key);
  const base = layers.length;
  layers.push({
    key,
    albedo: async () => {
      const S = AL, sc = await planeRGB(scl, S), ir = await planeRGB(iris, S);
      const px = Buffer.alloc(S * S * 3);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = (x + 0.5) / S, v = (y + 0.5) / S, d = Math.hypot(u - 0.5, v - 0.5), i = (y * S + x) * 3;
        let c = sc ? [sc[i], sc[i + 1], sc[i + 2]] : [215, 205, 200];
        // sclera: real albedo ~0.7 off-white; beyond the visible white the sheet turns pink — fade to a shadowed grey-white
        const off = [196, 188, 180].map((w) => w * (d > 0.3 ? 0.78 : 1));
        const kp = Math.min(1, Math.max(0, (d - 0.26) / 0.08));
        c = c.map((cv, j) => Math.min(cv * 0.9, 230) * (1 - kp) + off[j] * kp);
        if (ir && d < R) {
          const iu = Math.min(S - 1, Math.max(0, Math.floor(((u - 0.5) / (2 * R) + 0.5) * S))), iv = Math.min(S - 1, Math.max(0, Math.floor(((v - 0.5) / (2 * R) + 0.5) * S)));
          const k = (iv * S + iu) * 3, lim = Math.min(1, (R - d) / 0.012);
          // tint the greyscale iris (luminance x colour, lifted so a brown iris is not black)
          const lum = (ir[k] + ir[k + 1] + ir[k + 2]) / 3;
          const tint = tintOf.map((tc) => Math.min(255, lum * tc * 2.2 + 6));
          c = c.map((cv, j) => cv * (1 - lim) + tint[j] * lim);
          if (d < R * 0.33) c = c.map((cv) => cv * 0.12);
        }
        px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
      }
      return px;
    },
    normal: async () => flatNormal(NL),
    orm: async () => constRGB(NL, 255, 38, 0),
  });
  setBase.set(key, base);
  return base;
}

function hairSet(mi) {
  const t = mi.textures, c = mi.colors, s = mi.scalars;
  const key = `hair|${t.Alpha}|${t.Diffuse}|${t.Root}|${(c.RootColor || []).map((v) => v.toFixed(3))}|${(c.TipColor || []).map((v) => v.toFixed(3))}|${s.Brightness}`;
  if (hairBase.has(key)) return hairBase.get(key);
  if (isFlat(t.Alpha) || !findTexture(t.Alpha)) return -1;
  const base = hairLayers.length;
  hairLayers.push({
    key,
    build: async () => {
      const S = HL;
      const A = await planeA(t.Alpha, S);
      const D = mi.switches?.UseDiffuseBaseColor !== false && !isFlat(t.Diffuse) ? await planeRGB(t.Diffuse, S) : null;
      const Rt = !isFlat(t.Root) ? await planeRGB(t.Root, S) : null;
      const root = c.RootColor || [0.02, 0.015, 0.01], tip = c.TipColor || [0.05, 0.035, 0.02];
      const bright = s.Brightness ?? 1;
      const px = Buffer.alloc(S * S * 4);
      for (let i = 0; i < S * S; i++) {
        const g = Rt ? Rt[i * 3] / 255 : 0.5;
        let r = root[0] + (tip[0] - root[0]) * g, gg = root[1] + (tip[1] - root[1]) * g, b = root[2] + (tip[2] - root[2]) * g;
        // with a diffuse map, CARLA's hair master still multiplies the root->tip tint in (grey strands -> ash blonde, brown...)
        if (D) { r = Math.min(1, toL(D[i * 3]) * r * 2.2 * bright); gg = Math.min(1, toL(D[i * 3 + 1]) * gg * 2.2 * bright); b = Math.min(1, toL(D[i * 3 + 2]) * b * 2.2 * bright); }
        px[i * 4] = toS(r); px[i * 4 + 1] = toS(gg); px[i * 4 + 2] = toS(b); px[i * 4 + 3] = A ? A[i] : 255;
      }
      return px;
    },
  });
  hairBase.set(key, base);
  return base;
}

// write a list of layer buffers as PNGs and encode ONE KTX2 2D array
async function encodeArray(name, bufs, S, ch, kind) {
  const files = [];
  for (let i = 0; i < bufs.length; i++) {
    const f = path.join(TMP, `${name}_${String(i).padStart(3, '0')}.png`);
    await sharp(bufs[i], { raw: { width: S, height: S, channels: ch } }).png().toFile(f);
    files.push(f);
  }
  const out = path.join(OUT, 'tex', `${name}.ktx2`);
  const a = ['-ktx2', '-tex_type', '2darray', '-mipmap', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', kind === 'normal' ? '0.5' : '1.0', '-output_file', out];
  if (kind === 'normal') a.push('-normal_map'); else if (kind === 'data') a.push('-linear');
  if (ch === 3) a.push('-no_alpha'); else a.push('-force_alpha');
  for (const f of files) a.push('-file', f);
  const t0 = Date.now();
  execFileSync(BASISU, a, { stdio: 'pipe', maxBuffer: 1 << 26 });
  for (const f of files) fs.rmSync(f, { force: true });
  console.log(`  ${name}.ktx2: ${bufs.length} layers ${S}x${S}, ${(fs.statSync(out).size / 1048576).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return `tex/${name}.ktx2`;
}

// ---------------- bodies ----------------
function walk(d, out = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); } return out; }
const PED_ROOT = path.join(EXPORT_ROOT, 'CarlaUnreal/Content/Carla/Static/Pedestrian');
const bodyFiles = new Map(walk(PED_ROOT).filter((f) => /[\\/]SK_[^\\/]*\.glb$/.test(f)).map((f) => [path.basename(f, '.glb'), f]));

async function buildBody(name) {
  const src = await io.read(bodyFiles.get(name));
  const root = src.getRoot();
  const skin = root.listSkins()[0];
  const joints = skin.listJoints();
  const jn = joints.map((j) => j.getName());
  const skelName = jn.length <= 30 ? 'gen3' : 'gen2';
  const SK = SKEL[skelName];
  const remap = jn.map((n) => SK.index.get(n) ?? -1);
  const missing = jn.filter((n, i) => remap[i] < 0);
  if (missing.length) console.warn(`  ${name}: ${missing.length} joints not in ${skelName}: ${missing.slice(0, 6).join(',')}`);
  const parentOf = new Map();
  for (const n of root.listNodes()) for (const ch of n.listChildren()) parentOf.set(ch, n);
  const nb = SK.bones.length;
  const refT = new Array(nb * 3).fill(0), refR = new Array(nb * 4).fill(0), parents = new Array(nb).fill(-1);
  for (let k = 0; k < nb; k++) refR[k * 4 + 3] = 1;
  const ibmArr = skin.getInverseBindMatrices().getArray();
  const ibm = new Array(nb * 16).fill(0);
  joints.forEach((j, i) => {
    const c = remap[i];
    if (c < 0) return;
    refT.splice(c * 3, 3, ...j.getTranslation());
    refR.splice(c * 4, 4, ...j.getRotation());
    for (let k = 0; k < 16; k++) ibm[c * 16 + k] = ibmArr[i * 16 + k];
    const p = parentOf.get(j);
    parents[c] = p && jn.includes(p.getName()) ? SK.index.get(p.getName()) : -1;
  });
  if (!SK.parents) SK.parents = parents;
  else if (SK.parents.some((p, i) => p !== parents[i])) console.warn(`  ${name}: bone hierarchy differs from ${skelName} reference`);
  const skj = JSON.parse(fs.readFileSync(path.join(JSON_ROOT, 'pedmesh', name + '.json'), 'utf8'));
  const skExp = skj.find((e) => e.Type === 'SkeletalMesh');
  const slots = (skExp.SkeletalMaterials || []).map((m) => ({ slot: m.MaterialSlotName, mi: String(m.Material?.ObjectName || '').replace(/^.*'(.*)'$/, '$1') }));
  const prims = [];
  const used = new Set();
  for (const p of root.listMeshes()[0].listPrimitives()) {
    const mn = p.getMaterial()?.getName() || '';
    let si = slots.findIndex((s, i) => s.mi === mn && !used.has(i));
    if (si < 0) si = slots.findIndex((s) => s.mi === mn);
    used.add(si);
    prims.push({ p, slot: si });
  }
  let ymax = 0; for (const { p } of prims) ymax = Math.max(ymax, p.getAttribute('POSITION').getMax([])[1]);
  const slotClass = slots.map((s) => classOf(s.mi, readMaterial(s.mi)));
  const slotPart = slots.map((s, i) => (slotClass[i] === 'cloth' ? partOf(s.mi, s.slot) : 0));
  return { name, skelName, remap, refT, refR, ibm, slots, prims, slotClass, slotPart, height: +ymax.toFixed(3) };
}

function bodyVerts(B) {
  const out = [];
  for (const { p, slot } of B.prims) {
    const cls = slot >= 0 ? B.slotClass[slot] : null;
    if (cls !== 'skin' && cls !== 'cloth') continue;
    const a = p.getAttribute('POSITION').getArray();
    for (let i = 0; i < a.length; i++) out.push(a[i]);
  }
  return out;
}

async function writeBody(B, lodCfg) {
  const doc = new Document();
  const buf = doc.createBuffer();
  const rootN = doc.createNode(B.name);
  doc.createScene(B.name).addChild(rootN);
  const matO = doc.createMaterial('opaque').setExtras({ cls: 'opaque' }), matH = doc.createMaterial('hair').setExtras({ cls: 'hair' });
  const acc = (arr, type) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const lods = [];
  for (let li = 0; li < 3; li++) {
    const mesh = doc.createMesh('LOD' + li);
    for (const group of ['opaque', 'hair']) {
      const P = [], N = [], T = [], J = [], W = [], S = [], C = [], R = [], I = [];
      for (const { p, slot } of B.prims) {
        const cls = slot >= 0 ? B.slotClass[slot] : null;
        if (!cls || (group === 'hair') !== (cls === 'hair')) continue;
        if (li > 0 && cls === 'eye') continue;
        if (li === 2 && cls === 'hair' && /brow|_eyes$/i.test(B.slots[slot].mi)) continue;
        const pa = p.getAttribute('POSITION'), na = p.getAttribute('NORMAL'), ta = p.getAttribute('TEXCOORD_0'), ja = p.getAttribute('JOINTS_0'), wa = p.getAttribute('WEIGHTS_0');
        const base = P.length / 3, v3 = [0, 0, 0], v2 = [0, 0], jv = [], wv = [];
        for (let i = 0; i < pa.getCount(); i++) {
          // separate scratch arrays: a shared one kept the normal's 3rd component and every UV pushed 3 values
          P.push(...pa.getElement(i, v3)); N.push(...na.getElement(i, v3)); T.push(...ta.getElement(i, v2));
          ja.getElement(i, jv); wa.getElement(i, wv);
          let s = 0; const jj = [0, 0, 0, 0], ww = [0, 0, 0, 0];
          for (let k = 0; k < 4; k++) { const c = B.remap[jv[k]]; jj[k] = c < 0 ? 0 : c; ww[k] = c < 0 ? 0 : wv[k]; s += ww[k]; }
          for (let k = 0; k < 4; k++) ww[k] = s > 0 ? ww[k] / s : (k === 0 ? 1 : 0);
          J.push(...jj); W.push(...ww); S.push(slot); C.push(CLS[cls]); R.push(B.slotPart[slot]);
        }
        const ia = p.getIndices().getArray();
        for (let k = 0; k < ia.length; k++) I.push(base + ia[k]);
      }
      if (!I.length) continue;
      const n = P.length / 3;
      mesh.addPrimitive(doc.createPrimitive().setMaterial(group === 'hair' ? matH : matO)
        .setAttribute('POSITION', acc(new Float32Array(P), 'VEC3')).setAttribute('NORMAL', acc(new Float32Array(N), 'VEC3'))
        .setAttribute('TEXCOORD_0', acc(new Float32Array(T), 'VEC2')).setAttribute('JOINTS_0', acc(new Uint8Array(J), 'VEC4'))
        .setAttribute('WEIGHTS_0', acc(new Float32Array(W), 'VEC4')).setAttribute('_SLOT', acc(new Float32Array(S), 'SCALAR'))
        .setAttribute('_CLS', acc(new Float32Array(C), 'SCALAR')).setAttribute('_PART', acc(new Float32Array(R), 'SCALAR'))
        .setIndices(acc(n > 65535 ? new Uint32Array(I) : new Uint16Array(I), 'SCALAR')));
    }
    rootN.addChild(doc.createNode('LOD' + li).setMesh(mesh));
    lods.push(mesh);
  }
  await doc.transform(weld({ tolerance: 0.00005 }));
  await MeshoptSimplifier.ready;
  const tris = (m) => m.listPrimitives().reduce((s, p) => s + p.getIndices().getCount() / 3, 0);
  const raw = tris(lods[0]);
  for (let li = 0; li < 3; li++) {
    const ratio = Math.min(1, lodCfg[li] / raw);
    if (ratio >= 0.999) continue;
    for (const p of lods[li].listPrimitives()) {
      const hair = p.getMaterial() === matH;
      const err = li === 0 ? 0.0015 : li === 1 ? 0.006 : (hair ? 0.05 : 0.02);
      simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: Math.min(1, ratio * (hair ? 1.5 : 1)), error: err, lockBorder: li === 0 });
    }
  }
  // PROPS (lib/propfit.mjs): fitted in the bind pose, rigid on one bone, appended after simplification so they keep their
  // own LOD budget. Vertices carry _SLOT = 100 + texture layer (a fixed layer, not a variant slot) and _PART = 10 + fit id;
  // the runtime collapses the fits a walker does not carry.
  const fits = PROPSET ? fitProps(B, SKEL[B.skelName].index, bodyVerts(B), PROPSET) : [];
  for (let li = 0; li < 3 && fits.length; li++) {
    const prim = lods[li].listPrimitives().find((p) => p.getMaterial() === matO);
    if (!prim) continue;
    const get = (n) => Array.from(prim.getAttribute(n).getArray());
    const P = get('POSITION'), N = get('NORMAL'), T = get('TEXCOORD_0'), J = get('JOINTS_0'), W = get('WEIGHTS_0'), S = get('_SLOT'), C = get('_CLS'), R = get('_PART');
    const I = Array.from(prim.getIndices().getArray());
    for (const F of fits) {
      const g = propGeometry(PROPSET[F.prop], F, li);
      const base = P.length / 3;
      P.push(...g.P); N.push(...g.N); T.push(...g.U);
      for (let k = 0; k < g.P.length / 3; k++) { J.push(F.bone, F.bone2 ?? 0, 0, 0); W.push(g.Wt[k], 1 - g.Wt[k], 0, 0); S.push(100 + F.layer); C.push(1); R.push(10 + F.id); }
      for (const v of g.I) I.push(base + v);
    }
    prim.setAttribute('POSITION', acc(new Float32Array(P), 'VEC3')).setAttribute('NORMAL', acc(new Float32Array(N), 'VEC3'))
      .setAttribute('TEXCOORD_0', acc(new Float32Array(T), 'VEC2')).setAttribute('JOINTS_0', acc(new Uint8Array(J), 'VEC4'))
      .setAttribute('WEIGHTS_0', acc(new Float32Array(W), 'VEC4')).setAttribute('_SLOT', acc(new Float32Array(S), 'SCALAR'))
      .setAttribute('_CLS', acc(new Float32Array(C), 'SCALAR')).setAttribute('_PART', acc(new Float32Array(R), 'SCALAR'))
      .setIndices(acc(P.length / 3 > 65535 ? new Uint32Array(I) : new Uint16Array(I), 'SCALAR'));
  }
  // GUARD: one runaway vertex (a failed surface probe once put a strap at 1e9 m) stretches the quantisation box and
  // collapses the whole body to a point — refuse to write a body that does not fit in a 3 m box around the origin
  for (const m of lods) for (const p of m.listPrimitives()) {
    const a = p.getAttribute('POSITION').getArray();
    for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i]) || Math.abs(a[i]) > 3) throw new Error(`${B.name}: vertex out of range (${a[i]}) in ${m.getName()}`);
  }
  const counts = lods.map(tris);
  rootN.setExtras({ body: B.name, skeleton: B.skelName, height: B.height, source: 'CARLA 0.10.0 (CC-BY 4.0)', props: fits.map((F) => F.id) });
  // keepAttributes: these materials carry no textures, and a plain prune() drops every TEXCOORD a texture does not reference
  await doc.transform(prune({ keepAttributes: true }));
  await MeshoptEncoder.ready;
  // quantize positions/normals/skin only: a quantized TEXCOORD is stored remapped and needs a KHR_texture_transform on
  // the material's textures to undo it, and these materials have no textures (UDIM u spans [0, 2)) — every body came out
  // with scrambled UVs. Then meshopt-compress the buffers without further quantization.
  await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize({ pattern: /^(POSITION|NORMAL|JOINTS_0|WEIGHTS_0)$/ }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  io.registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const out = path.join(OUT, 'bodies', B.name + '.glb');
  fs.writeFileSync(out, await io.writeBinary(doc));
  return { counts, bytes: fs.statSync(out).size, props: fits.map((F) => F.id) };
}

// ---------------- variants from the walker blueprints ----------------
function readVariants() {
  const dir = path.join(JSON_ROOT, 'walkers');
  const out = [];
  let baseMesh = null;
  for (const f of fs.readdirSync(dir).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const cm = j.find((e) => e.Type === 'SkeletalMeshComponent' && e.Name === 'CharacterMesh0');
    if (!cm) continue;
    const p = cm.Properties || {};
    const bp = f.replace('.json', '');
    const mesh = pkgOf(p.SkeletalMesh || p.SkinnedAsset);
    if (bp === 'BP_Walker') { baseMesh = mesh; continue; }
    out.push({ bp, mesh, scale: p.RelativeScale3D ? +(p.RelativeScale3D.Z ?? 1).toFixed(4) : 1, overrides: (p.OverrideMaterials || []).map((m) => (m ? String(m.ObjectName).replace(/^.*'(.*)'$/, '$1') : null)) });
  }
  for (const v of out) if (!v.mesh) v.mesh = baseMesh;   // the Owv_v* walkers inherit BP_Walker's mesh
  return out;
}
const tagOf = (bp, body) => {
  const s = bp.toLowerCase();
  const child = /kid|boy|girl|ab001|ag001/.test(s);
  const female = /female|girl|ag001/.test(s);
  return { gender: female ? 'f' : 'm', age: child ? 'child' : 'adult', uniform: /cop/.test(s) ? 'police' : null, build: /owv|ovw/.test(s) ? 'heavy' : 'regular' };
};

// ---------------- main ----------------
const t00 = Date.now();
const PROPSET = args.includes('--noprops') ? null : await loadProps();
const propLayer = new Map();   // one texture layer per (prop, recolour): both phone fits share one
if (PROPSET) for (const F of FITS) {
  const pr = PROPSET[F.prop];
  const lk = F.prop + '|' + (F.recolor || []).join(',');
  if (propLayer.has(lk)) { F.layer = propLayer.get(lk); continue; }
  F.layer = layers.length;
  propLayer.set(lk, F.layer);
  layers.push({
    key: 'prop|' + lk,
    albedo: async () => {
      if (!pr.images.bc) return constRGB(AL, 60, 60, 64);
      const p = await sharp(pr.images.bc).removeAlpha().resize(AL, AL, { fit: 'fill' }).raw().toBuffer();
      if (F.recolor) {
        // luminance-preserving recolour (a red patterned scan -> the dark backpacks NYC actually carries)
        const Y = (i) => 0.2126 * toL(p[i]) + 0.7152 * toL(p[i + 1]) + 0.0722 * toL(p[i + 2]);
        let sY = 0, n = 0; for (let i = 0; i < p.length; i += 3 * 7) { sY += Y(i); n++; }
        const mY = sY / Math.max(1, n);
        for (let i = 0; i < p.length; i += 3) { const k = Math.min(2.2, Math.max(0.3, Y(i) / mY)); for (let c = 0; c < 3; c++) p[i + c] = toS(F.recolor[c] * k); }
      }
      return p;
    },
    normal: async () => (pr.images.n ? sharp(pr.images.n).removeAlpha().resize(NL, NL, { fit: 'fill' }).raw().toBuffer() : flatNormal(NL)),
    orm: async () => {
      if (!pr.images.mr) return constRGB(NL, 255, 205, 0);
      const p = await sharp(pr.images.mr).removeAlpha().resize(NL, NL, { fit: 'fill' }).raw().toBuffer();
      for (let i = 0; i < p.length; i += 3) { p[i] = 255; p[i + 2] = Math.min(p[i + 2], 40); }   // glTF MR (G rough, B metal) -> ORM
      return p;
    },
  });
}
const variants = readVariants();
const bodies = {};
const manifest = { version: 2, built: new Date().toISOString(), source: 'CARLA 0.10.0 walkers (CC-BY 4.0)', skeletons: {}, bodies: {}, variants: [], arrays: {} };
const bodyNames = [...new Set(variants.map((v) => v.mesh.split('/').pop()))].filter((n) => !ONLY || ONLY.includes(n));
for (const name of bodyNames) {
  const t0 = Date.now();
  if (!bodyFiles.has(name)) { console.warn('missing body glb', name); continue; }
  const B = await buildBody(name);
  const w = await writeBody(B, B.height < 1.4 ? [26000, 7000, 1800] : [32000, 8000, 2000]);
  bodies[name] = B;
  manifest.bodies[name] = {
    file: `bodies/${name}.glb`, skeleton: B.skelName, height: B.height, lodTris: w.counts, props: w.props,
    slots: B.slots.map((s, i) => ({ name: s.slot, mi: s.mi, cls: B.slotClass[i], part: B.slotPart[i] })),
    refT: B.refT.map((v) => +v.toFixed(5)), refR: B.refR.map((v) => +v.toFixed(6)), ibm: B.ibm.map((v) => +v.toFixed(6)),
  };
  console.log(`${name.padEnd(30)} ${B.skelName} h ${B.height} slots ${B.slots.length} LOD ${w.counts.join('/')} ${(w.bytes / 1048576).toFixed(1)} MB ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
for (const [k, S] of Object.entries(SKEL)) manifest.skeletons[k] = { bones: S.bones, parents: S.parents || null };
for (const v of variants) {
  const name = v.mesh.split('/').pop();
  const B = bodies[name];
  if (!B) continue;
  // SKIN TONE MATCHING. CARLA's MetaHuman-style skins reuse a few GENERIC hand/body textures across every ethnicity and
  // darken or lighten them with master-material parameters we cannot evaluate (Brightness 0.16-2.8), and one face texture
  // is a 'cMultip' multiplier. Every non-UDIM skin slot is therefore scaled to the variant's REFERENCE tone: its largest
  // skin slot with its own (non-generic, non-multiplier) texture, else its largest generic one.
  const GENERIC = /ovwBody_d|StrOvw_dv2|cMultip/i;
  const skinSlots = [];
  for (let i = 0; i < B.slots.length; i++) {
    if (B.slotClass[i] !== 'skin') continue;
    const mi = readMaterial(v.overrides[i] || B.slots[i].mi) || readMaterial(B.slots[i].mi);
    const col = mi && (!isFlat(mi.textures.Color_MAIN_UDIM) ? mi.textures.Color_MAIN_UDIM : mi.textures.Diffuse);
    const tris = B.prims.filter((p) => p.slot === i).reduce((a, p) => a + p.p.getIndices().getCount() / 3, 0);
    skinSlots.push({ i, col, udim: mi && !isFlat(mi.textures.Color_MAIN_UDIM), generic: GENERIC.test(col || ''), mult: /cMultip/i.test(col || ''), tris });
  }
  const ref = skinSlots.filter((x) => !x.generic && !x.udim).sort((a, b) => b.tris - a.tris)[0] || skinSlots.filter((x) => !x.mult && !x.udim).sort((a, b) => b.tris - a.tris)[0];
  // SKIN CALIBRATION (PV2 side-by-sides vs NYC street photos): the raw heads read too light (AfroM "DARK"), orange (AfroW,
  // AsM02) or grey-pink (the EuroM multiplier sheet) under a physical sun, because CARLA darkens / desaturates them in the
  // master with Brightness / Vibrance. Each variant's reference skin is scaled per channel so its face median lands on a
  // measured skin albedo for the character (Fitzpatrick II-VI, physicallybased.info; texture detail kept); generic hands
  // and bodies then follow the calibrated face.
  const tone = SKIN_TONE.find(([re]) => re.test(v.bp))?.[1] || null;
  const gainTo = (med) => (tone && med ? [0, 1, 2].map((c) => Math.min(2.6, Math.max(0.3, toL(tone[c]) / Math.max(1e-4, med[c])))) : null);
  const refMed = ref ? await skinMedian(ref.col, false, !ref.generic) : null;
  const refGain = gainTo(refMed);
  const multOf = new Map();
  if (ref && refGain) multOf.set(ref.i, refGain);
  const faceTone = refMed ? refMed.map((v, c) => v * (refGain ? refGain[c] : 1)) : tone ? tone.map(toL) : null;
  for (const x of skinSlots) {
    if (!x.col || x === ref) continue;
    if (x.udim) { const g = gainTo(await skinMedian(x.col, true)); if (g) multOf.set(x.i, g); continue; }
    if (x.generic && !x.mult && faceTone) { multOf.set(x.i, { tone: faceTone }); continue; }
    if (!refMed) continue;
    const m = await skinMedian(x.col, false, !x.generic || x.mult) || await meanColor(x.col);
    if (!m) continue;
    multOf.set(x.i, [0, 1, 2].map((c) => Math.min(3, Math.max(0.15, (refMed[c] * (refGain ? refGain[c] : 1)) / Math.max(1e-3, m[c])))));
  }
  if (tone) console.log(`  skin ${v.bp.padEnd(34)} ref ${ref ? ref.col : '-'} ${refMed ? refMed.map(toS).join(',') : ''} -> ${tone.join(',')}` + (skinSlots.some((x) => x.udim) ? ' (udim)' : ''));
  const layersOf = [];
  for (let i = 0; i < B.slots.length; i++) {
    const cls = B.slotClass[i];
    if (!cls) { layersOf.push(-1); continue; }
    const miName = v.overrides[i] || B.slots[i].mi;
    const mi = readMaterial(miName) || readMaterial(B.slots[i].mi);
    layersOf.push(cls === 'hair' ? hairSet(mi) : opaqueSet(cls, mi, multOf.get(i) || null));
  }
  manifest.variants.push({ name: v.bp, body: name, scale: v.scale, ...tagOf(v.bp, name), layers: layersOf });
}
manifest.props = PROPSET ? FITS.map((F) => ({ id: F.id, prop: F.prop, fit: F.fit, side: F.side || null, layer: F.layer, credit: PROPSET[F.prop].credit })) : [];
manifest.arrays = { albedo: { size: AL, layers: layers.length }, normal: { size: NL, layers: layers.length }, orm: { size: NL, layers: layers.length }, hair: { size: HL, layers: hairLayers.length } };
console.log(`${layers.length} opaque layers, ${hairLayers.length} hair layers`);
if (!NOTEX) {
  const want = (k) => !ARRAYS || ARRAYS.includes(k);
  const keep = (k) => { const f = path.join(OUT, 'tex', k + '.ktx2'); if (fs.existsSync(f)) manifest.arrays[k].file = 'tex/' + k + '.ktx2'; };
  const alb = [], nrm = [], orm = [], hair = [];
  if (want('albedo') || want('normal') || want('orm')) for (const L of layers) { if (want('albedo')) alb.push(await L.albedo()); if (want('normal')) nrm.push(await L.normal()); if (want('orm')) orm.push(await L.orm()); }
  if (want('hair')) for (const H of hairLayers) hair.push(await H.build());
  if (want('albedo')) manifest.arrays.albedo.file = await encodeArray('albedo', alb, AL, 3, 'color'); else keep('albedo');
  if (want('normal')) manifest.arrays.normal.file = await encodeArray('normal', nrm, NL, 3, 'normal'); else keep('normal');
  if (want('orm')) manifest.arrays.orm.file = await encodeArray('orm', orm, NL, 3, 'data'); else keep('orm');
  if (want('hair')) manifest.arrays.hair.file = await encodeArray('hair', hair, HL, 4, 'color'); else keep('hair');
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
console.log(`manifest: ${manifest.variants.length} variants, ${Object.keys(manifest.bodies).length} bodies in ${((Date.now() - t00) / 1000).toFixed(0)} s`);
