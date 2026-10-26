// SubSDJ · headless PNG capture of a module or of a whole screen (CDP, no dependencies).
// Usage:  node tools/shot.mjs "<h2 text>"               out.png [width] ["<pre JS>"]   → crop of the module (×2)
//         node tools/shot.mjs "pantalla:secuenciacion" out.png [width] ["<pre JS>"]   → the whole page on that tab
// The pre JS is evaluated (with await if it returns a promise) before capturing: e.g. switching
// Parts on or loading a preset. Serves on 8002 so as not to clash with the runner or with 8000.
// Environment variable THEME=id → capture with that theme (?theme=, which isn't remembered). SPLASH=1 → with the welcome window.
// H=height → window height (default 1000): the instrument is scaled to min(width/1920, height/1000).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import os from 'node:os'; import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), PORT = 8002;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const [target, out, widthArg, pre] = process.argv.slice(2); const W = +widthArg || 1500;
const THEME = process.env.THEME || '', H = +process.env.H || 1000;
if (!target || !out) { console.error('usage: node tools/shot.mjs "<h2 | pantalla:NAME>" out.png [width] ["<pre JS>"]'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (err, data) => { if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data); });
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));
const profile = path.join(os.tmpdir(), 'subsdj-cdp-' + Date.now()); fs.mkdirSync(profile, { recursive: true });
spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--window-size=' + W + ',' + H, 'about:blank'], { detached: true, stdio: 'ignore' }).unref();
let port = 0; for (let i = 0; i < 150 && !port; i++) { await sleep(200); try { port = +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0]; } catch {} }
if (!port) { console.error('no DevToolsActivePort (Chrome path? environment variable CHROME)'); process.exit(2); }
const page = (await (await fetch('http://127.0.0.1:' + port + '/json')).json()).find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(), errs = [];
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || m.error); pend.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || '')); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
// without the welcome window (it would cover the capture) unless SPLASH=1, which captures exactly that
const qs = [THEME ? 'theme=' + encodeURIComponent(THEME) : '', process.env.SPLASH ? '' : 'nosplash=1'].filter(Boolean).join('&');
await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + (qs ? '?' + qs : '') });
for (let i = 0; i < 50; i++) { await sleep(200); if (await ev('document.readyState') === 'complete') break; }
await sleep(800);
const preSrc = pre && pre.startsWith('@') ? fs.readFileSync(pre.slice(1), 'utf8') : pre;   // "@file.js": long probes
if (preSrc) { console.log('pre:', JSON.stringify(await ev(preSrc))); await sleep(600); }
const screen = target.startsWith('pantalla:') ? target.slice(9) : null;
let clip = null;
if (screen) {
  await ev('(() => { const b = document.querySelector(\'#screenTabs button[data-screen="' + screen + '"]\'); if (b) b.click(); return !!b; })()');
  await sleep(400);
  const h = await ev('document.documentElement.scrollHeight');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: h, deviceScaleFactor: 1, mobile: false });   // the sticky keyboard stays in its natural place
  await sleep(300);
  clip = { x: 0, y: 0, width: W, height: h, scale: 1 };
} else {
  const h = await ev('document.documentElement.scrollHeight');   // viewport = whole page: the sticky header and keyboard stay in their natural place and don't cover lower modules
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: h, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  const rect = await ev('(() => { const h = [...document.querySelectorAll(".panel h2")].find(h => h.textContent.trim().includes(' + JSON.stringify(target) + ')); if (!h) return null; const r = h.closest(".panel").getBoundingClientRect(); return { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height }; })()');
  if (!rect) console.error('panel not found:', target);
  else clip = { x: rect.x - 4, y: rect.y - 4, width: rect.width + 8, height: rect.height + 8, scale: 2 };
}
if (clip) {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64')); console.log('screenshot', out, JSON.stringify(clip));
}
console.log('js errors:', JSON.stringify(errs));
await send('Browser.close'); ws.close(); server.close(); setTimeout(() => process.exit(clip ? 0 : 1), 300);
