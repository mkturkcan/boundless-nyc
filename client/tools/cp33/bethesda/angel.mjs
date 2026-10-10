// CP33 BETHESDA: the Angel of the Waters' figure from a photogrammetry scan.
// Source: "Engel" by noe-3d.at (Sketchfab 15edd1e0e422482586dd4dd4aebe8d55, one of the two angels at the entrance
// of the Grafenberg cemetery; CC BY 4.0), via the Objaverse 1.0 index (tools/refs/objaverse_search.mjs get <uid>).
// The scan is cut at the top of its plinth (the stone pedestal goes), moved into the fountain's frame (y 0 at her feet,
// +z her front, x = z = 0 under her centre), scaled to the Stebbins bronze's 8 ft from the feet to the crown, and
// simplified to three LODs; the capture's photo texture becomes a 2K cavity map (its shading darkens the recesses), which
// the bronze material reads for the patina (city/cpBethesdaKit.js).
//   node angel.mjs <scan.glb> [out.glb]
import fs from 'node:fs';
import { readScan, cutTris, keepBig, mapPos, simplifyTo, smoothNormals, writeGLB, sharp } from './scanlib.mjs';

const [src, outArg] = process.argv.slice(2);
const out = outArg || 'C:/Users/mehme/projectnyc/client/public/models/cp33/bethesda/angel.glb';
const CUT = -27.522;           // the plinth's top (the band where the up-facing normals crowd, -27.55..-27.53), 1-2 cm up
const HEAD = -26.0163;         // the crown (the highest point within 0.12 m of the axis)
const H8 = 2.44;               // 8 ft
const S0 = await readScan(src);
console.log('scan', S0.pos.length / 3, 'verts', S0.idx.length / 3, 'tris');
// the figure's centre over its feet: the mean of the robe's hem band
let cx = 0, cz = 0, n = 0;
for (let i = 0; i < S0.pos.length; i += 3) { const y = S0.pos[i + 1]; if (y > CUT + 0.01 && y < CUT + 0.2) { cx += S0.pos[i]; cz += S0.pos[i + 2]; n++; } }
cx /= n; cz /= n;
const s = H8 / (HEAD - CUT);
console.log('centre', cx.toFixed(3), cz.toFixed(3), 'scale', s.toFixed(4));
let S = cutTris(S0, (x, y) => y > CUT);
const kb = keepBig(S, 2000); S = kb.S;
console.log('after cut', S.idx.length / 3, 'tris; components', kb.comps.join(' '));
S = mapPos(S, (x, y, z) => [(x - cx) * s, (y - CUT) * s, (z - cz) * s]);
// normals: rotation-free transform (uniform scale), the scan's own smooth normals stay valid
const L0 = smoothNormals(await simplifyTo(S, 220000, 0.002));
const L1 = smoothNormals(await simplifyTo(S, 50000, 0.01));
const L2 = smoothNormals(await simplifyTo(S, 12000, 0.05));
for (const [k, L] of [['LOD0', L0], ['LOD1', L1], ['LOD2', L2]]) {
  let y1 = -1e9, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < L.pos.length; i += 3) { y1 = Math.max(y1, L.pos[i + 1]); x0 = Math.min(x0, L.pos[i]); x1 = Math.max(x1, L.pos[i]); z0 = Math.min(z0, L.pos[i + 2]); z1 = Math.max(z1, L.pos[i + 2]); }
  console.log(k, L.idx.length / 3, 'tris', 'top', y1.toFixed(3), 'x', x0.toFixed(2), x1.toFixed(2), 'z', z0.toFixed(2), z1.toFixed(2));
}
// the photo texture -> a 2K greyscale cavity map (JPEG)
const meta = await sharp(S0.image).metadata();
console.log('texture', meta.width, 'x', meta.height, meta.channels);
const raw = await sharp(S0.image).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
const jpg = await sharp(raw.data, { raw: { width: raw.info.width, height: raw.info.height, channels: 1 } }).resize(Math.min(2048, raw.info.width), Math.min(2048, raw.info.height)).jpeg({ quality: 88 }).toBuffer();
await writeGLB(out, [{ name: 'LOD0', S: L0 }, { name: 'LOD1', S: L1 }, { name: 'LOD2', S: L2 }], jpg, 'angelBronze');
console.log('wrote', out, (fs.statSync(out).size / 1048576).toFixed(1), 'MB');
