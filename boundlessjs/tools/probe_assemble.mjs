// Run the real assembleTile on a compiled tile in Node with an instrumented ctx —
// answers definitively whether ctx.landmarks is invoked and with what keys.
// node tools/probe_assemble.mjs <tileKey>
import fs from 'node:fs';
import { assembleTile } from '../src/world/assemble.js';

const key = process.argv[2] || '1_-6';
const buf = fs.readFileSync(`public/tiles/t_${key}.bin`);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const calls = [];
const ctx = {
  facadeMat: null, groundMat: null, farMat: null, signalReg: [],
  instancer: { claim: () => -1, setMatrix: () => {}, release: () => {}, pools: {} },
  landmarks: (k, c) => { calls.push(k); console.log('LANDMARK CALL:', k, 'footprint pts:', c.footprint?.length, 'groundY:', c.groundY?.toFixed(2)); return null; },
};
try {
  const data = await assembleTile(key, ab, ctx);
  console.log('assembled OK — groups:', data.group?.children?.length, '| bldgs:', data.bldgs?.length);
} catch (e) {
  console.log('ASSEMBLE THREW:', e.message, '\n', e.stack?.split('\n').slice(0, 6).join('\n'));
}
console.log('landmark calls:', calls.length ? calls.join(', ') : 'NONE');
