// SubSDJ · selftest en Chrome headless vía CDP, sin dependencias (solo Node ≥ 22 y Chrome).
// Uso:  node tools/run-selftest.mjs ["selftest=1&demos=DLY"] ["<expresión JS extra a evaluar al final>"]
// Levanta un servidor estático propio (8001; el 8000 suele ser el de desarrollo) que además
// recoge los pings del selftest (selftest.ping?done=1…), lanza Chrome con un perfil temporal,
// lee DevToolsActivePort, navega a ?selftest=1 y espera el ping «done». Imprime título,
// resumen, pares de demos (diff/picos), filas fallidas con su motivo, logs de medida y
// errores JS. Chrome se cierra por CDP (Browser.close). Sale con 1 si hay fallos.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import os from 'node:os'; import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), PORT = 8001;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const q = process.argv[2] || 'selftest=1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
               '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const pings = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.endsWith('selftest.ping')) { pings.push(Object.fromEntries(u.searchParams)); res.writeHead(204); return res.end(); }
  let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));
const profile = path.join(os.tmpdir(), 'subsdj-cdp-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + profile,
  '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { detached: true, stdio: 'ignore' }).unref();
let port = 0;
for (let i = 0; i < 150 && !port; i++) { await sleep(200); try { port = +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0]; } catch {} }
if (!port) { console.error('sin DevToolsActivePort (¿ruta de Chrome? variable de entorno CHROME)'); process.exit(2); }
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(), errs = [], logs = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || m.error); pend.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errs.push((d.text || '') + ' ' + (d.exception?.description || '') + ' @' + (d.url || '') + ':' + d.lineNumber); }
  else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) errs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' '));
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'log') {   // logs de medida de los checks («placa: cola …»)
    const s = m.params.args.map(a => a.value ?? a.description).join(' ');
    if (/^[a-záéíóúñ0-9 ]+:/i.test(s) && !/^demo par/.test(s)) logs.push(s);
  }
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?${q}` });
const t0 = Date.now();
while (!pings.find(p => p.done) && Date.now() - t0 < 300000) await sleep(500);
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.value;
console.log('title:', await ev('document.title'));
console.log('done:', JSON.stringify(pings.find(p => p.done) || null), 'en', ((Date.now() - t0) / 1000).toFixed(1), 's');
for (const p of pings.filter(p => p.demo || p.demo_error))
  console.log('demo:', p.demo || ('ERROR ' + p.demo_error), '| diff', p.diff, '| peaks', p.peakA, p.peakB, p.bad ? '| BAD' : '');
const fails = await ev(`[...document.querySelectorAll('#stBody .st-row.fail')].map(r => r.querySelector('.st-name').textContent + ' :: ' + (r.nextElementSibling && r.nextElementSibling.classList.contains('st-err') ? r.nextElementSibling.textContent : ''))`);
console.log('fails:', JSON.stringify(fails));
if (process.argv[3]) console.log('extra:', JSON.stringify(await ev(process.argv[3])));
for (const l of logs) console.log('log:', l);
console.log('js errors:', JSON.stringify(errs));
await send('Browser.close'); ws.close(); server.close();
setTimeout(() => process.exit(fails && fails.length ? 1 : 0), 300);
