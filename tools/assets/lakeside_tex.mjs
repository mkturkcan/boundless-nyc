// CP33 lakeside: download CC0 PBR sets (Poly Haven / ambientCG), pack each to <name>_alb.jpg (sRGB), <name>_nrm.jpg (GL
// normal) and <name>_orm.jpg (R ao, G roughness, B metalness) at the given size under public/textures/cp33/lakeside/, and
// delete the downloads. node tools/assets/lakeside_tex.mjs <name>=<ph|acg>:<id>[@res] ...   (res default 1024)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
sharp.cache(false);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'boundlessjs/public/textures/cp33/lakeside');
const HOME = process.env.USERPROFILE || process.env.HOME;
const TMP = path.join(HOME, '.tools/texcache/cp33lakeside');
const UA = 'valdrada-research/0.1 (project contact: github.com/mkturkcan/valdrada)';
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
async function dl(url, file) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' }); if (!r.ok) throw new Error(r.status + ' ' + url); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); return; }
    catch (e) { if (a === 2) throw e; await new Promise((s) => setTimeout(s, 1500)); }
  }
}
async function fetchPh(id, dir, tag) {
  const j = await (await fetch(`https://api.polyhaven.com/files/${id}`, { headers: { 'User-Agent': UA } })).json();
  const keys = { Diffuse: 'col', nor_gl: 'nrm', Rough: 'rgh', AO: 'ao', Displacement: 'disp', Metal: 'met' };
  await Promise.all(Object.entries(keys).map(async ([k, mine]) => {
    const f = j[k]?.[tag]?.jpg?.url || j[k]?.[tag]?.png?.url; if (f) await dl(f, path.join(dir, mine + '.jpg'));
  }));
}
async function fetchAcg(id, dir, tag) {
  const zip = path.join(dir, 'z.zip');
  await dl(`https://ambientcg.com/get?file=${id}_${tag.toUpperCase()}-JPG.zip`, zip);
  try { execFileSync('unzip', ['-o', '-q', zip, '*.jpg', '-d', dir], { stdio: 'pipe' }); } catch { /* exit 11 when a pattern is unmatched */ }
  fs.rmSync(zip, { force: true });
  const K = { col: /_Color\.jpg$/i, nrm: /_NormalGL\.jpg$/i, rgh: /_Roughness\.jpg$/i, ao: /_AmbientOcclusion\.jpg$/i, disp: /_Displacement\.jpg$/i, met: /_Metalness\.jpg$/i };
  for (const f of fs.readdirSync(dir)) { const k = Object.keys(K).find((q) => K[q].test(f)); if (k) fs.renameSync(path.join(dir, f), path.join(dir, k + '.jpg')); else if (f.endsWith('.jpg')) fs.rmSync(path.join(dir, f)); }
}
const grey = async (f, N) => (f && fs.existsSync(f) ? (await sharp(f).resize(N, N, { fit: 'fill' }).removeAlpha().extractChannel(0).raw().toBuffer()) : null);
const rec = [];
for (const spec of process.argv.slice(2)) {
  const m = /^([\w-]+)=(ph|acg):([\w]+)(?:@(\d+))?$/.exec(spec); if (!m) { console.log('bad spec', spec); continue; }
  const [, name, src, id, rs] = m, N = Number(rs || 1024), tag = N > 1024 ? '2k' : '1k', dir = path.join(TMP, `${id}_${tag}`);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(path.join(dir, 'col.jpg'))) { if (src === 'ph') await fetchPh(id, dir, N > 1024 ? '2k' : '2k'); else await fetchAcg(id, dir, N > 1024 ? '2K' : '2K'); }
  const p = (k) => path.join(dir, k + '.jpg');
  await sharp(p('col')).resize(N, N, { fit: 'fill' }).removeAlpha().jpeg({ quality: 90, mozjpeg: true }).toFile(path.join(OUT, `${name}_alb.jpg`));
  await sharp(p('nrm')).resize(N, N, { fit: 'fill' }).removeAlpha().jpeg({ quality: 92, mozjpeg: true }).toFile(path.join(OUT, `${name}_nrm.jpg`));
  const ao = await grey(p('ao'), N), rg = await grey(p('rgh'), N), mt = await grey(p('met'), N);
  const orm = Buffer.alloc(N * N * 3);
  for (let i = 0; i < N * N; i++) { orm[i * 3] = ao ? ao[i] : 255; orm[i * 3 + 1] = rg ? rg[i] : 200; orm[i * 3 + 2] = mt ? mt[i] : 0; }
  await sharp(orm, { raw: { width: N, height: N, channels: 3 } }).jpeg({ quality: 90, mozjpeg: true }).toFile(path.join(OUT, `${name}_orm.jpg`));
  const meta = await sharp(p('col')).resize(8, 8).raw().toBuffer(); let mr = 0, mg = 0, mb = 0; for (let i = 0; i < 64; i++) { mr += meta[i * 3]; mg += meta[i * 3 + 1]; mb += meta[i * 3 + 2]; }
  rec.push({ name, source: src === 'ph' ? `https://polyhaven.com/a/${id}` : `https://ambientcg.com/a/${id}`, licence: 'CC0 1.0', res: N, mean: [mr / 64 | 0, mg / 64 | 0, mb / 64 | 0] });
  console.log('packed', name, N, rec[rec.length - 1].mean.join(','));
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(JSON.stringify(rec));
