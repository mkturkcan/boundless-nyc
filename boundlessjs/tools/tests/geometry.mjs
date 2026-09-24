// Geometry invariants test suite — run: npm test
// Validates compiled tiles + runtime extrusion winding so regressions
// (inward walls, sunken roads, downward roofs, NaNs) fail loudly.
import fs from 'node:fs';
import earcut from 'earcut';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error('FAIL:', msg); } };

function readTile(f) {
  const buf = fs.readFileSync(f);
  const hLen = buf.readUInt32LE(4);
  const header = JSON.parse(buf.slice(8, 8 + hLen).toString());
  const base = 8 + hLen + ((4 - ((8 + hLen) % 4)) % 4);
  const S = {};
  for (const s of header.sections) {
    const C = { Float32Array, Uint8Array, Uint32Array, Int16Array }[s.type];
    S[s.name] = new C(buf.buffer, buf.byteOffset + base + s.offset, s.length);
  }
  return { header, S };
}
const shoelace = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length]; a += x1 * z2 - x2 * z1; } return a / 2; };

// ---- 1. wall winding invariant (mirrors assemble.js extrudePrism exactly)
{
  // For a shoelace-positive square ring, the wall quad (P1b,P1t,P2t,P2b) front face
  // must point away from the ring centroid.
  const ring = [[0, 0], [10, 0], [10, 10], [0, 10]];
  ok(shoelace(ring) > 0, 'test ring is shoelace-positive');
  const [x1, z1] = ring[0], [x2, z2] = ring[1];
  const a = [x1, 0, z1], b = [x1, 5, z1], c = [x2, 5, z2];
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const mid = [(x1 + x2) / 2 - 5, 0, (z1 + z2) / 2 - 5]; // centroid at (5,?,5)
  ok(n[0] * mid[0] + n[2] * mid[2] > 0, `wall front face points outward (dot=${(n[0] * mid[0] + n[2] * mid[2]).toFixed(2)})`);
}

// ---- 2. compiled tile invariants on a sample of tiles
const dir = 'public/tiles';
const manifest = JSON.parse(fs.readFileSync(`${dir}/manifest.json`, 'utf8'));
const keys = Object.keys(manifest.tiles);
const sample = keys.filter((_, i) => i % Math.ceil(keys.length / 40) === 0);
let ringsChecked = 0, roadPts = 0, sunk = 0;
for (const key of sample) {
  const t = readTile(`${dir}/${manifest.tiles[key].f}`);
  const [ox, oz] = t.header.origin;
  const res = t.header.res, n1 = res + 1;
  const terr = t.S.terrain;
  // terrain sane
  let bad = 0;
  for (const v of terr) if (!isFinite(v) || v < -10 || v > 150) bad++;
  ok(bad === 0, `${key}: terrain values sane (${bad} bad)`);
  const sampleT = (x, z) => {
    const fx = Math.min(res - 0.001, Math.max(0, ((x - ox) / 512) * res));
    const fz = Math.min(res - 0.001, Math.max(0, ((z - oz) / 512) * res));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return terr[j * n1 + i] * (1 - u) * (1 - v) + terr[j * n1 + i + 1] * u * (1 - v) + terr[(j + 1) * n1 + i] * (1 - u) * v + terr[(j + 1) * n1 + i + 1] * u * v;
  };
  // building rings: shoelace-positive, no NaN, earcut succeeds
  const dv = new DataView(t.S.bldg.buffer, t.S.bldg.byteOffset, t.S.bldg.byteLength);
  const nB = t.S.bldg.byteLength / 44;
  for (let i = 0; i < Math.min(nB, 50); i++) {
    const o = i * 44, start = dv.getUint32(o, true), len = dv.getUint16(o + 4, true);
    const ring = [];
    for (let k = 0; k < len; k++) ring.push([t.S.bldgXZ[(start + k) * 2], t.S.bldgXZ[(start + k) * 2 + 1]]);
    if (ring.some((p) => !isFinite(p[0]) || !isFinite(p[1]))) { ok(false, `${key}: NaN in ring ${i}`); continue; }
    if (shoelace(ring) <= 0) { ok(false, `${key}: ring ${i} not shoelace-positive`); continue; }
    const flat = ring.flat();
    if (earcut(flat).length === 0) { ok(false, `${key}: earcut failed ring ${i}`); continue; }
    ringsChecked++;
  }
  // roads: terrain must never rise through a roadbed. Roads follow their own
  // smoothed profile (corridor pass) and may legitimately FLOAT above the
  // heightmap where a lower overlapping corridor carved it down (stacked
  // FDR/esplanade etc.), so the check is one-sided: sunk = terrain above road.
  const dvr = new DataView(t.S.roads.buffer, t.S.roads.byteOffset, t.S.roads.byteLength);
  const nR = t.S.roads.byteLength / 24;
  for (let i = 0; i < nR; i++) {
    const o = i * 24, start = dvr.getUint32(o, true), len = dvr.getUint16(o + 4, true);
    const level = dvr.getUint8(o + 14);
    if (level > 0) continue;
    for (let k = 0; k < len; k++) {
      const x = t.S.roadVerts[(start + k) * 3] + ox;
      const y = t.S.roadVerts[(start + k) * 3 + 1];
      const z = t.S.roadVerts[(start + k) * 3 + 2] + oz;
      const g = sampleT(x, z);
      if (g < -3) continue; // water tile edge
      roadPts++;
      if (y - g < 0.0) sunk++;
    }
  }
}
ok(ringsChecked > 300, `checked ${ringsChecked} rings across ${sample.length} tiles`);
ok(sunk / Math.max(1, roadPts) < 0.02, `roads conform to terrain: ${sunk}/${roadPts} outliers (<2% allowed)`);

// ---- 3. bridges: mid-span clearance above water
{
  const bridges = JSON.parse(fs.readFileSync(`${dir}/bridges.json`, 'utf8'));
  ok(bridges.length >= 15, `bridges present (${bridges.length})`);
  for (const br of bridges) {
    const midY = br.deck[Math.floor(br.deck.length / 2)][1];
    ok(isFinite(midY) && midY > br.clearance * 0.6, `${br.key}: mid-span y=${midY} vs clearance ${br.clearance}`);
    ok(br.deck.every((p) => p.every(isFinite)), `${br.key}: deck finite`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
