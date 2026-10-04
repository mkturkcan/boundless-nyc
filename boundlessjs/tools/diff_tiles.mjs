// Compare two compiled tile sets tile by tile before a swap (2026-10-02, AR34 recompile): which tiles changed, in which
// sections, by how much; buildings, furniture per kind, census street-tree classes; tiles only in one set. A recompile
// meant to carry a few changes (tree classes, shoreline walls) shows here whether anything else moved with it.
//   node tools/diff_tiles.mjs <setA dir> <setB dir> [--top 25] [--json out.json]
//   e.g. node tools/diff_tiles.mjs public/tiles data/tiles_flat_ar34
import fs from 'node:fs';
import path from 'node:path';
import { parseTile, buildingsOf, furnitureOf } from '../src/world/tiledata.js';
import { FURN } from '../src/shared/geo.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const [A, B] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!A || !B) { console.error('usage: node tools/diff_tiles.mjs <setA> <setB> [--top 25] [--json out.json]'); process.exit(2); }
const TOP = Number(opt('top', '25'));
const KIND = Object.fromEntries(Object.entries(FURN).map(([k, v]) => [v, k]));

const list = (d) => new Set(fs.readdirSync(d).filter((f) => /^t_-?\d+_-?\d+\.bin$/.test(f)));
const la = list(A), lb = list(B);
const onlyA = [...la].filter((f) => !lb.has(f)), onlyB = [...lb].filter((f) => !la.has(f));
const read = (d, f) => { const b = fs.readFileSync(path.join(d, f)); return parseTile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const secLen = (t) => Object.fromEntries(Object.entries(t.S).map(([k, v]) => [k, v ? v.byteLength : 0]));
function stats(t) {
  let nb = 0, hsum = 0;
  for (const b of buildingsOf(t)) { nb++; hsum += b.height || 0; }
  const furn = {}, trees = {};
  for (const f of furnitureOf(t)) {
    furn[f.k] = (furn[f.k] || 0) + 1;
    if (f.k === FURN.TREE && (f.p2 & 1)) trees[f.p0] = (trees[f.p0] || 0) + 1;
  }
  return { nb, hsum, furn, trees, res: t.header.res };
}

const tot = { same: 0, changed: 0, sec: {}, trees: {}, furn: {}, bld: 0, resChanged: 0 };
const rows = [];
const common = [...la].filter((f) => lb.has(f)).sort();
for (const f of common) {
  const ba = fs.readFileSync(path.join(A, f)), bb = fs.readFileSync(path.join(B, f));
  if (ba.equals(bb)) { tot.same++; continue; }
  tot.changed++;
  const ta = read(A, f), tb = read(B, f);
  const sa = secLen(ta), sb = secLen(tb);
  const secDiff = {};
  for (const k of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
    const d = (sb[k] || 0) - (sa[k] || 0);
    if (d) { secDiff[k] = d; tot.sec[k] = (tot.sec[k] || 0) + d; }
  }
  const xa = stats(ta), xb = stats(tb);
  const furnDiff = {};
  for (const k of new Set([...Object.keys(xa.furn), ...Object.keys(xb.furn)])) {
    const d = (xb.furn[k] || 0) - (xa.furn[k] || 0);
    if (d) { furnDiff[KIND[k] || k] = d; tot.furn[KIND[k] || k] = (tot.furn[KIND[k] || k] || 0) + d; }
  }
  for (const k of new Set([...Object.keys(xa.trees), ...Object.keys(xb.trees)])) {
    const d = (xb.trees[k] || 0) - (xa.trees[k] || 0);
    if (d) tot.trees[k] = (tot.trees[k] || 0) + d;
  }
  const dBld = xb.nb - xa.nb;
  tot.bld += dBld;
  if (xa.res !== xb.res) tot.resChanged++;
  // "other" = changed sections beyond the furniture block and the curb / wall geometry the candidate meant to change
  const other = Object.keys(secDiff).filter((k) => k !== 'furn' && k !== 'curb');
  rows.push({ f, bytes: bb.length - ba.length, dBld, dH: +(xb.hsum - xa.hsum).toFixed(1), secDiff, furnDiff, other: other.length, res: xa.res === xb.res ? xa.res : `${xa.res}->${xb.res}` });
}
console.log(`${A} vs ${B}: ${common.length} common tiles, ${tot.same} identical, ${tot.changed} changed; only in A ${onlyA.length}, only in B ${onlyB.length}`);
if (onlyA.length) console.log('  only in A:', onlyA.slice(0, 20).join(' '));
if (onlyB.length) console.log('  only in B:', onlyB.slice(0, 20).join(' '));
console.log('section byte totals (B - A):', JSON.stringify(tot.sec));
console.log('buildings (B - A):', tot.bld, '| terrain res changed in', tot.resChanged, 'tiles');
console.log('furniture (B - A):', JSON.stringify(tot.furn));
console.log('census street-tree classes (B - A):', JSON.stringify(tot.trees));
const withOther = rows.filter((r) => r.other || r.dBld || r.dH);
console.log(`tiles with changes beyond furniture / curb: ${withOther.length}`);
for (const r of withOther.sort((a, b) => Math.abs(b.dH) + Math.abs(b.dBld) * 100 - (Math.abs(a.dH) + Math.abs(a.dBld) * 100)).slice(0, TOP)) {
  console.log(`  ${r.f}: bytes ${r.bytes >= 0 ? '+' : ''}${r.bytes}, buildings ${r.dBld >= 0 ? '+' : ''}${r.dBld}, height sum ${r.dH >= 0 ? '+' : ''}${r.dH} m, sections ${JSON.stringify(r.secDiff)}${r.res !== undefined && typeof r.res === 'string' ? ', res ' + r.res : ''}`);
}
const curbOnly = rows.filter((r) => !r.other && !r.dBld && !r.dH && r.secDiff.curb);
console.log(`tiles whose only geometry change is the curb / wall section: ${curbOnly.length}${curbOnly.length ? ' (e.g. ' + curbOnly.slice(0, 12).map((r) => `${r.f.slice(2, -4)} ${r.secDiff.curb > 0 ? '+' : ''}${r.secDiff.curb} B`).join(', ') + ')' : ''}`);
const jo = opt('json', null);
if (jo) fs.writeFileSync(jo, JSON.stringify({ A, B, tot, onlyA, onlyB, rows }, null, 1));
