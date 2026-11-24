// SubSDJ · the PNG icons of the manifest, rendered from icons/icon.svg in headless Chrome (CDP, no dependencies).
// Usage:  node tools/icons.mjs
// Run it again whenever icons/icon.svg changes: the tab reads the SVG itself, but an installed app
// (manifest.webmanifest) wants PNGs — 192 and 512 px, and a «maskable» 512 that launchers crop to
// their own shape (a circle, a squircle…): there the plate (#bg in the SVG) is extended to the whole
// square and the drawing shrunk into the inner 80 %, the zone every crop keeps. That is done by
// widening the viewBox from 64 to 80 units around the same center, not with a second drawing.
// The SVG is inlined in a page as wide as the icon, so its «small size» media query sees ≥ 192 px:
// the PNGs always carry the full drawing.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = [                                   // what the manifest lists
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
];
const SAFE = 0.8;                               // the part of a maskable icon no launcher crops
const sleep = ms => new Promise(r => setTimeout(r, ms));
const svg = fs.readFileSync(path.join(ROOT, 'icons/icon.svg'), 'utf8');
const profile = path.join(os.tmpdir(), 'subsdj-cdp-' + Date.now()); fs.mkdirSync(profile, { recursive: true });
spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', 'about:blank'],
  { detached: true, stdio: 'ignore' }).unref();
let port = 0; for (let i = 0; i < 150 && !port; i++) { await sleep(200); try { port = +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0]; } catch {} }
if (!port) { console.error('no DevToolsActivePort (Chrome path? environment variable CHROME)'); process.exit(2); }
const page = (await (await fetch('http://127.0.0.1:' + port + '/json')).json()).find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || m.error); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value;
await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });   // transparent outside the plate's round corners
let bad = 0;
for (const o of OUT) {
  await send('Emulation.setDeviceMetricsOverride', { width: o.size, height: o.size, deviceScaleFactor: 1, mobile: false });
  const pad = 64 * (1 / SAFE - 1) / 2;          // 8 units on each side: 64 of 80 is the inner 80 %
  const ok = await ev('(() => { document.documentElement.innerHTML = "<body style=\\"margin:0;overflow:hidden\\">" + ' + JSON.stringify(svg) + ';' +
    'const s = document.querySelector("svg"), bg = s.querySelector("#bg"); if (!s || !bg) return false;' +
    's.setAttribute("width", ' + o.size + '); s.setAttribute("height", ' + o.size + '); s.style.display = "block";' +
    (o.maskable ? 'for (const [k, v] of Object.entries({ x: ' + -pad + ', y: ' + -pad + ', width: ' + (64 + 2 * pad) + ', height: ' + (64 + 2 * pad) + ', rx: 0, stroke: "none" })) bg.setAttribute(k, v);' +
                  's.setAttribute("viewBox", "' + [-pad, -pad, 64 + 2 * pad, 64 + 2 * pad].join(' ') + '");' : '') +
    'return true; })()');
  if (!ok) { console.error(o.file + ': icons/icon.svg has no <svg> with an element id="bg" (the plate)'); bad++; continue; }
  await sleep(150);
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: o.size, height: o.size, scale: 1 } });
  fs.writeFileSync(path.join(ROOT, 'icons', o.file), Buffer.from(shot.data, 'base64'));
  console.log('icons/' + o.file, o.size + '×' + o.size, o.maskable ? '(maskable)' : '');
}
await send('Browser.close'); ws.close(); setTimeout(() => process.exit(bad ? 1 : 0), 300);
