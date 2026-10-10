// Download the AR33 sign fonts as raw files from github.com/google/fonts (OFL / Apache), each family's licence beside
// its files. Usage: node tools/ar33/signs/fetch_fonts.mjs [family-dir ...]   (default: the FAMILIES list)
// Writes public/fonts/ar33/<file>.ttf and public/fonts/ar33/LICENSE-<dir>.txt, and prints what it fetched.
import fs from 'node:fs';
import path from 'node:path';
const UA = 'valdrada-research/0.1 (project contact: github.com/mkturkcan/valdrada)';
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '../../../public/fonts/ar33');
// [licence dir, family dir, file filter (regexp on the file name), note]
export const FAMILIES = [
  ['ofl', 'inter', /^Inter\[/, 'neutral grotesque (Helvetica role)'],
  ['ofl', 'arimo', /^Arimo\[/, 'Arial / Helvetica metrics'],
  ['ofl', 'oswald', /./, 'condensed gothic'],
  ['ofl', 'anton', /./, 'heavy condensed (Impact role)'],
  ['ofl', 'bebasneue', /./, 'caps condensed'],
  ['ofl', 'barlow', /^Barlow-(Regular|Medium|SemiBold|Bold|ExtraBold|Black|BoldItalic|BlackItalic)\.ttf$/, 'DIN / highway grotesque'],
  ['ofl', 'barlowcondensed', /^BarlowCondensed-(Medium|SemiBold|Bold|ExtraBold|Black|BoldItalic|ExtraBoldItalic|BlackItalic)\.ttf$/, 'condensed DIN'],
  ['ofl', 'montserrat', /^Montserrat\[/, 'geometric'],
  ['ofl', 'poppins', /^Poppins-(Regular|Medium|SemiBold|Bold|ExtraBold|Black|BoldItalic)\.ttf$/, 'geometric (Avant Garde role)'],
  ['ofl', 'librefranklin', /^LibreFranklin\[/, 'Franklin Gothic'],
  ['ofl', 'archivo', /^Archivo\[/, 'grotesque with a width axis'],
  ['ofl', 'archivoblack', /./, 'black grotesque'],
  ['ofl', 'jost', /^Jost\[/, 'Futura role'],
  ['ofl', 'worksans', /^WorkSans\[/, 'grotesque'],
  ['ofl', 'lato', /^Lato-(Regular|Bold|Black|BoldItalic)\.ttf$/, 'humanist sans'],
  ['ofl', 'playfairdisplay', /^PlayfairDisplay\[/, 'high-contrast serif'],
  ['ofl', 'librebaskerville', /./, 'Baskerville'],
  ['ofl', 'cinzel', /^Cinzel\[/, 'Trajan-like capitals'],
  ['ofl', 'dmserifdisplay', /^DMSerifDisplay-Regular/, 'display serif'],
  ['ofl', 'alfaslabone', /./, 'heavy slab'],
  ['ofl', 'robotoslab', /^RobotoSlab\[/, 'slab (Rockwell role)'],
  ['ofl', 'rye', /./, 'western display'],
  ['ofl', 'pacifico', /./, 'brush script'],
  ['ofl', 'lobster', /./, 'bold script'],
  ['ofl', 'kaushanscript', /./, 'brush script'],
  ['ofl', 'greatvibes', /./, 'formal script'],
  ['ofl', 'dancingscript', /^DancingScript\[/, 'casual script'],
  ['ofl', 'sacramento', /./, 'monoline script (neon)'],
  ['apache', 'yellowtail', /./, 'retro script'],
  ['ofl', 'tiltneon', /^TiltNeon\[/, 'tube lettering (neon)'],
  ['ofl', 'monoton', /./, 'multi-line neon display'],
  ['ofl', 'bungee', /^Bungee-Regular/, 'signage display'],
  ['ofl', 'righteous', /./, 'rounded display'],
  ['ofl', 'fjallaone', /./, 'condensed display'],
  ['ofl', 'leaguespartan', /^LeagueSpartan\[/, 'Futura Bold role'],
  ['ofl', 'baloo2', /^Baloo2\[/, 'heavy rounded (fast-food wordmark role)'],
  ['ofl', 'nunito', /^Nunito\[/, 'rounded sans (Arial Rounded role)'],
  ['ofl', 'notonaskharabic', /^NotoNaskhArabic\[/, 'Arabic (Naskh)'],
  ['ofl', 'notokufiarabic', /^NotoKufiArabic\[/, 'Arabic (Kufi)'],
];
async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r;
}
const want = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
for (const [lic, dir, re, note] of FAMILIES) {
  if (want.length && !want.includes(dir)) continue;
  let list;
  try { list = await (await get(`https://api.github.com/repos/google/fonts/contents/${lic}/${dir}`)).json(); }
  catch (e) {
    // the licence directory moved (apache -> ofl) for some families
    const alt = lic === 'ofl' ? 'apache' : 'ofl';
    try { list = await (await get(`https://api.github.com/repos/google/fonts/contents/${alt}/${dir}`)).json(); }
    catch (e2) { console.log('MISS', dir, e.message); continue; }
  }
  const files = list.filter((f) => f.type === 'file');
  const fonts = files.filter((f) => /\.ttf$/i.test(f.name) && re.test(f.name));
  const licF = files.find((f) => /^(OFL|LICENSE)\.txt$/i.test(f.name));
  for (const f of fonts) {
    const safe = f.name.replace('[', '-').replace(']', '').replace(/,/g, '-');   // 'Inter[opsz,wght].ttf' -> 'Inter-opsz-wght.ttf'
    const out = path.join(OUT, safe);
    if (fs.existsSync(out) && fs.statSync(out).size === f.size) { console.log('have', f.name); continue; }
    const b = Buffer.from(await (await get(f.download_url)).arrayBuffer());
    fs.writeFileSync(out, b);
    console.log('got', f.name, '->', safe, b.length, note);
  }
  if (licF) {
    const b = Buffer.from(await (await get(licF.download_url)).arrayBuffer());
    fs.writeFileSync(path.join(OUT, `LICENSE-${dir}.txt`), b);
    console.log('licence', dir, licF.name, licF.download_url);
  } else console.log('NO LICENCE FILE', dir);
}
