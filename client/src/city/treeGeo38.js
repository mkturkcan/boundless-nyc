// TR38: the trees36 bake's geometry codec. tools/ar35/trees/bake36.mjs encodes with geo38Encode; trees.js decodes with
// geo38Decode in a worker (its source is shipped to the worker as text, so it uses no import and no outer name). The bake
// (public/models/trees36/trees36.bin) is ONE gzip member holding these streams, each 4-byte aligned:
//   'q16'  positions and the leaf atlas uvs: u16 over the stream's per-component [lo, hi] (meta = lo..., hi...), delta-coded
//          along the vertex order per component, the two bytes in planes -> Float32Array (0.2 mm on a 12 m tree)
//   'f32'  the bark uvs (they run over tens of tiles, no 16-bit grid fits): raw floats, the four bytes in planes -> Float32Array
//   'f16'  the colours: half floats, the two bytes in planes -> Uint16Array (THREE.Float16BufferAttribute)
//   'i8' / 'u8'  normals, facings, sun, clump, AO, wind: normalized bytes as stored -> Int8Array / Uint8Array
//   'x16' / 'x32'  indices: delta-coded (mod 2^16 / 2^32), bytes in planes -> Uint16Array / Uint32Array
// Delta + byte planes let gzip find the structure: the TR37 v2 geometry (21.3 MB raw) is 8.3 MB this way, 11.8 MB as plain gzip.
export function geo38Decode(buf, streams) {
  const u8 = new Uint8Array(buf), out = new Array(streams.length);
  for (let s = 0; s < streams.length; s++) {
    const [off, len, , size, codec, meta] = streams[s];
    const src = u8.subarray(off, off + len);
    if (codec === 'i8') { out[s] = new Int8Array(src.slice().buffer); continue; }
    if (codec === 'u8') { out[s] = src.slice(); continue; }
    const bpc = codec === 'f32' || codec === 'x32' ? 4 : 2, cnt = len / bpc, raw = new Uint8Array(len);
    for (let b = 0; b < bpc; b++) for (let i = 0, p = b * cnt; i < cnt; i++) raw[i * bpc + b] = src[p + i];
    if (codec === 'f32') { out[s] = new Float32Array(raw.buffer); continue; }
    if (codec === 'f16') { out[s] = new Uint16Array(raw.buffer); continue; }
    if (codec === 'x16') { const a = new Uint16Array(raw.buffer); for (let i = 1; i < a.length; i++) a[i] = (a[i] + a[i - 1]) & 0xffff; out[s] = a; continue; }
    if (codec === 'x32') { const a = new Uint32Array(raw.buffer); for (let i = 1; i < a.length; i++) a[i] = (a[i] + a[i - 1]) >>> 0; out[s] = a; continue; }
    if (codec !== 'q16') throw new Error('geo38: codec ' + codec);
    const q = new Uint16Array(raw.buffer), f = new Float32Array(q.length);
    for (let i = size; i < q.length; i++) q[i] = (q[i] + q[i - size]) & 0xffff;
    for (let c = 0; c < size; c++) {
      const lo = meta[c], k = (meta[size + c] - lo) / 65535;
      for (let i = c; i < q.length; i += size) f[i] = lo + q[i] * k;
    }
    out[s] = f;
  }
  return out;
}

// (bake side) one stream's bytes and meta: `arr` the values as the generator made them (floats, or ints for 'x16' / 'x32')
export function geo38Encode(arr, size, codec, toHalf) {
  const planes = (bytes, bpc) => {
    const cnt = bytes.length / bpc, o = new Uint8Array(bytes.length);
    for (let b = 0; b < bpc; b++) for (let i = 0, p = b * cnt; i < cnt; i++) o[p + i] = bytes[i * bpc + b];
    return o;
  };
  if (codec === 'i8') return { bytes: new Uint8Array(Int8Array.from(arr, (v) => Math.max(-127, Math.min(127, Math.round(v * 127)))).buffer), meta: null };
  if (codec === 'u8') return { bytes: Uint8Array.from(arr, (v) => Math.max(0, Math.min(255, Math.round(v * 255)))), meta: null };
  if (codec === 'f32') { const f = Float32Array.from(arr); return { bytes: planes(new Uint8Array(f.buffer), 4), meta: null }; }
  if (codec === 'f16') { const h = Uint16Array.from(arr, toHalf); return { bytes: planes(new Uint8Array(h.buffer), 2), meta: null }; }
  if (codec === 'x16' || codec === 'x32') {
    const A = codec === 'x16' ? new Uint16Array(arr.length) : new Uint32Array(arr.length);
    for (let i = 0; i < arr.length; i++) A[i] = codec === 'x16' ? (arr[i] - (i ? arr[i - 1] : 0)) & 0xffff : (arr[i] - (i ? arr[i - 1] : 0)) >>> 0;
    return { bytes: planes(new Uint8Array(A.buffer), codec === 'x16' ? 2 : 4), meta: null };
  }
  if (codec !== 'q16') throw new Error('geo38: codec ' + codec);
  const lo = new Array(size).fill(Infinity), hi = new Array(size).fill(-Infinity);
  for (let i = 0; i < arr.length; i++) { const c = i % size; if (arr[i] < lo[c]) lo[c] = arr[i]; if (arr[i] > hi[c]) hi[c] = arr[i]; }
  for (let c = 0; c < size; c++) if (!(hi[c] >= lo[c])) { lo[c] = 0; hi[c] = 0; }
  const q = new Uint16Array(arr.length), d = new Uint16Array(arr.length);
  for (let i = 0; i < arr.length; i++) { const c = i % size, r = hi[c] - lo[c]; q[i] = r > 0 ? Math.round((arr[i] - lo[c]) / r * 65535) : 0; }
  for (let i = 0; i < q.length; i++) d[i] = (q[i] - (i >= size ? q[i - size] : 0)) & 0xffff;
  return { bytes: planes(new Uint8Array(d.buffer), 2), meta: [...lo, ...hi] };
}
