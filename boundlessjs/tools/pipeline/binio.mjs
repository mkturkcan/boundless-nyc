// Tiny binary tile writer. Layout: magic 'CTL1' u32 | headerLen u32 | header JSON | sections.
import fs from 'node:fs';

export function writeTile(file, headerObj, sections) {
  // sections: [{name, array (TypedArray)}]
  const secMeta = [];
  let offset = 0;
  const bufs = [];
  for (const s of sections) {
    const bytes = s.array.byteLength;
    secMeta.push({ name: s.name, type: s.array.constructor.name, offset, bytes, length: s.array.length });
    bufs.push(Buffer.from(s.array.buffer, s.array.byteOffset, bytes));
    offset += bytes;
    if (offset % 4 !== 0) { const pad = 4 - (offset % 4); bufs.push(Buffer.alloc(pad)); offset += pad; }
  }
  const header = Buffer.from(JSON.stringify({ ...headerObj, sections: secMeta }), 'utf8');
  const pre = Buffer.alloc(8);
  pre.writeUInt32LE(0x43544c31, 0); // 'CTL1'
  pre.writeUInt32LE(header.length, 4);
  const padLen = (4 - ((8 + header.length) % 4)) % 4;
  fs.writeFileSync(file, Buffer.concat([pre, header, Buffer.alloc(padLen), ...bufs]));
}

// Growable typed array builders
export class F32 {
  constructor(cap = 1024) { this.a = new Float32Array(cap); this.n = 0; }
  push(...vals) {
    if (this.n + vals.length > this.a.length) {
      const b = new Float32Array(Math.max(this.a.length * 2, this.n + vals.length));
      b.set(this.a.subarray(0, this.n)); this.a = b;
    }
    for (const v of vals) this.a[this.n++] = v;
  }
  get array() { return this.a.slice(0, this.n); }
}
export class U32 {
  constructor(cap = 256) { this.a = new Uint32Array(cap); this.n = 0; }
  push(...vals) {
    if (this.n + vals.length > this.a.length) {
      const b = new Uint32Array(Math.max(this.a.length * 2, this.n + vals.length));
      b.set(this.a.subarray(0, this.n)); this.a = b;
    }
    for (const v of vals) this.a[this.n++] = v;
  }
  get array() { return this.a.slice(0, this.n); }
}
export class U8 {
  constructor(cap = 256) { this.a = new Uint8Array(cap); this.n = 0; }
  push(...vals) {
    if (this.n + vals.length > this.a.length) {
      const b = new Uint8Array(Math.max(this.a.length * 2, this.n + vals.length));
      b.set(this.a.subarray(0, this.n)); this.a = b;
    }
    for (const v of vals) this.a[this.n++] = v;
  }
  get array() { return this.a.slice(0, this.n); }
}
export class I16 {
  constructor(cap = 256) { this.a = new Int16Array(cap); this.n = 0; }
  push(...vals) {
    if (this.n + vals.length > this.a.length) {
      const b = new Int16Array(Math.max(this.a.length * 2, this.n + vals.length));
      b.set(this.a.subarray(0, this.n)); this.a = b;
    }
    for (const v of vals) this.a[this.n++] = v;
  }
  get array() { return this.a.slice(0, this.n); }
}
