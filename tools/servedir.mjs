// tiny static file server with CORS for serving a dev tile set to the app:
//   node tools/servedir.mjs boundlessjs/data/tiles_dev 5310   -> http://127.0.0.1:5310/
// then open the app with ?tiles=http://127.0.0.1:5310
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || 5310);
http.createServer((req, res) => {
  const p = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(dir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }); res.end(); return; }
  res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': p.endsWith('.json') ? 'application/json' : 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(p).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`serving ${dir} on http://127.0.0.1:${port}`));
