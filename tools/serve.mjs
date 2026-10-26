// SubSDJ · NO-CACHE static dev server (Cache-Control: no-store), no dependencies.
// Usage:  node tools/serve.mjs [port]      (default 8000)  →  http://127.0.0.1:8000/
// Why: `python -m http.server` sends no Cache-Control and the browser applies HEURISTIC caching to
// ES modules (fresh for 10 % of the time elapsed since Last-Modified): after editing the engine
// you could keep hearing the Sala.js from an hour ago even after reloading. It happened with block 7 (tape):
// three versions of the wow and the ear kept hearing the first one. With no-store every reload fetches the
// files from disk. Same server as the one used by tools/run-selftest.mjs (8001) and tools/shot.mjs (8002).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), PORT = +(process.argv[2] || 8000);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
               '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
               '.wav': 'audio/wav', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => console.log('SubSDJ · http://127.0.0.1:' + PORT + '/  (no cache · Ctrl+C to stop)'));
