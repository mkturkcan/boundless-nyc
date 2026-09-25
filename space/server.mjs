// Static file server for the Hugging Face Space. It serves the compiled city (the dataset's Content/ folder, mounted
// read-only at CONTENT_DIR) on PORT and has no dependencies. The client fetches /settings/graphics.json from the
// server root, so Content/ must be the web root.
//
// Compression: text types are gzipped as they stream. The binary city data (.bin: near and far tiles, animation clips,
// the sky-occlusion bake) compresses to about 0.3 of its size, so it is gzipped too, at level 1, and the compressed
// bytes are kept in a bounded in-memory LRU so each tile is compressed once however many clients load it. Models (.glb)
// and textures (.ktx2) are already compressed and are sent as they are.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(process.env.CONTENT_DIR || '/data');
const PORT = Number(process.env.PORT || 7860);
const CACHE_BYTES = Number(process.env.GZ_CACHE_MB || 1024) * 1048576;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.cube': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ktx2': 'image/ktx2',
  '.hdr': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.txt', '.cube']);
const BINARY_GZ = new Set(['.bin']);

function cacheControl(urlPath, ext) {
  if (urlPath.startsWith('/assets/')) return 'public, max-age=31536000, immutable';   // content-hashed build output
  if (ext === '.html' || ext === '.json') return 'no-cache';                          // entry point and manifests
  return 'public, max-age=86400';
}

// LRU of gzipped binaries: key = path + mtime + size, so a changed file is never served stale
const gzCache = new Map();
let gzBytes = 0;
const pending = new Map();
function gzipped(file, st) {
  const key = `${file}|${st.mtimeMs}|${st.size}`;
  const hit = gzCache.get(key);
  if (hit) { gzCache.delete(key); gzCache.set(key, hit); return Promise.resolve(hit); }
  if (pending.has(key)) return pending.get(key);
  const p = fs.promises.readFile(file)
    .then((buf) => new Promise((res, rej) => zlib.gzip(buf, { level: 1 }, (e, out) => (e ? rej(e) : res(out)))))
    .then((out) => {
      pending.delete(key);
      gzCache.set(key, out); gzBytes += out.length;
      for (const [k, v] of gzCache) { if (gzBytes <= CACHE_BYTES) break; gzCache.delete(k); gzBytes -= v.length; }
      return out;
    }, (e) => { pending.delete(key); throw e; });
  pending.set(key, p);
  return p;
}

http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { allow: 'GET, HEAD' }); res.end(); return; }
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); res.end(); return; }
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const file = path.join(ROOT, urlPath);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('not found'); return; }
    const ext = path.extname(file).toLowerCase();
    const headers = {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': cacheControl(urlPath, ext),
      'last-modified': st.mtime.toUTCString(),
      'x-content-type-options': 'nosniff',
    };
    const acceptsGz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (BINARY_GZ.has(ext) && acceptsGz && st.size > 4096) {
      headers['content-encoding'] = 'gzip'; headers.vary = 'Accept-Encoding';
      gzipped(file, st).then((out) => {
        headers['content-length'] = out.length;
        res.writeHead(200, headers);
        res.end(req.method === 'HEAD' ? undefined : out);
      }, () => { if (!res.headersSent) { res.writeHead(500); res.end(); } else res.destroy(); });
      return;
    }
    const gzip = COMPRESSIBLE.has(ext) && st.size > 1024 && acceptsGz;
    if (gzip) { headers['content-encoding'] = 'gzip'; headers.vary = 'Accept-Encoding'; } else headers['content-length'] = st.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    const src = fs.createReadStream(file);
    src.on('error', () => res.destroy());
    (gzip ? src.pipe(zlib.createGzip({ level: 6 })) : src).pipe(res);
  });
}).listen(PORT, '0.0.0.0', () => console.log(`serving ${ROOT} on :${PORT}`));
