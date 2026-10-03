// SubSDJ · servidor estático de desarrollo SIN CACHÉ (Cache-Control: no-store), sin dependencias.
// Uso:  node tools/serve.mjs [puerto]      (por defecto 8000)  →  http://127.0.0.1:8000/
// Por qué: `python -m http.server` no manda Cache-Control y el navegador aplica caché HEURÍSTICA a
// los módulos ES (fresco el 10 % del tiempo transcurrido desde Last-Modified): tras editar el motor
// podías seguir oyendo el Sala.js de hace una hora aunque recargases. Pasó con el bloque 7 (cinta):
// tres versiones del wow y el oído seguía oyendo la primera. Con no-store cada recarga trae los
// ficheros de disco. Mismo servidor que usan tools/run-selftest.mjs (8001) y tools/shot.mjs (8002).
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
}).listen(PORT, '127.0.0.1', () => console.log('SubSDJ · http://127.0.0.1:' + PORT + '/  (sin caché · Ctrl+C para parar)'));
