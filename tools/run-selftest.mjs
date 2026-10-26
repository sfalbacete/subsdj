// SubSDJ · selftest in headless Chrome via CDP, no dependencies (only Node ≥ 22 and Chrome).
// Usage:  node tools/run-selftest.mjs ["selftest=1&demos=DLY"] ["<extra JS expression to evaluate at the end>"]
// Starts its own static server (8001; 8000 is usually the dev one) that also
// collects the selftest pings (selftest.ping?done=1…), launches Chrome with a temporary profile,
// reads DevToolsActivePort, navigates to ?selftest=1 and waits for the «done» ping. Prints title,
// summary, demo pairs (diff/peaks), failed rows with their reason, measurement logs and
// JS errors. Chrome is closed via CDP (Browser.close). Exits with 1 if anything failed.
// BATCHES: hundreds of OfflineAudioContexts in a single page hang it (see js/selftest.js),
// so the selftest runs in two batches — ?batch=checks and ?batch=factory —, each in a
// fresh Chrome, and they are added up here. With «batch=…» in the query, only that one. If a page stops
// responding, that is reported (and counts as a failure) instead of waiting forever.
// BASE=https://sfalbacete.github.io/subsdj/ → the selftest of the PUBLISHED version: the pings are
// lost on the foreign server, so it waits for the final title (✓/✗ SELFTEST n/m).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import os from 'node:os'; import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), PORT = 8001;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const q = process.argv[2] || 'selftest=1';
const BASE = process.env.BASE || null;
const BATCHES = /(^|&)batch=/.test(q) ? [null] : ['checks', 'factory'];
const BATCH_MAX_MS = 300000;   // how long a batch may take
const EV_MAX_MS = 15000;       // how long the page may take to answer a question
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
               '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
let pings = [];
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

// One batch in a fresh Chrome: returns what gets printed at the end
async function runBatch(qs) {
  pings = [];
  const profile = path.join(os.tmpdir(), 'subsdj-cdp-' + Date.now());
  fs.mkdirSync(profile, { recursive: true });
  spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { detached: true, stdio: 'ignore' }).unref();
  let port = 0;
  for (let i = 0; i < 150 && !port; i++) { await sleep(200); try { port = +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0]; } catch {} }
  if (!port) { console.error('no DevToolsActivePort (Chrome path? environment variable CHROME)'); process.exit(2); }
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
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'log') {   // measurement logs from the checks («plate: tail …»)
      const s = m.params.args.map(a => a.value ?? a.description).join(' ');
      if (/^[a-záéíóúñ0-9 ]+:/i.test(s) && !/^demo par/.test(s)) logs.push(s);
    }
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  // a question to the page, with a time limit: a hung page doesn't answer (null)
  const ev = async expr => (await Promise.race([send('Runtime.evaluate', { expression: expr, returnByValue: true }), sleep(EV_MAX_MS).then(() => null)]))?.result?.value ?? null;
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: (BASE || `http://127.0.0.1:${PORT}/`) + '?' + qs });
  const t0 = Date.now();
  let hung = false;
  while (Date.now() - t0 < BATCH_MAX_MS) {
    if (pings.find(p => p.done)) break;
    const title = await ev('document.title');
    if (title === null) { hung = true; break; }
    if (BASE && /SELFTEST \d+\/\d+/.test(title)) break;
    await sleep(500);
  }
  const out = { qs, errs, logs, hung, secs: (Date.now() - t0) / 1000 };
  out.done = pings.find(p => p.done) || null;
  out.demos = pings.filter(p => p.demo || p.demo_error);
  out.title = hung ? null : await ev('document.title');
  out.fails = hung ? null : await ev(`[...document.querySelectorAll('#stBody .st-row.fail')].map(r => r.querySelector('.st-name').textContent + ' :: ' + (r.nextElementSibling && r.nextElementSibling.classList.contains('st-err') ? r.nextElementSibling.textContent : ''))`);
  if (hung) out.lastNote = 'the page stopped responding after ' + out.secs.toFixed(0) + ' s';
  if (process.argv[3] && !hung) out.extra = await ev(process.argv[3]);
  await Promise.race([send('Browser.close'), sleep(3000)]); ws.close();
  return out;
}

const res = [];
for (const t of BATCHES) res.push(await runBatch(t ? q + '&batch=' + t : q));
// sum of the batches
let ok = 0, total = 0, allOk = true;
const batchName = r => (r.qs.match(/batch=(\w+)/) || [, 'all'])[1];
const parts = res.map(r => {
  const m = /([✓✗]) SELFTEST (\d+)\/(\d+)/.exec(r.title || '');
  if (!m) { allOk = false; return batchName(r) + ' ' + (r.hung ? 'HUNG' : 'no title'); }
  ok += +m[2]; total += +m[3]; if (m[1] !== '✓') allOk = false;
  return batchName(r) + ' ' + m[2] + '/' + m[3];
});
console.log('title:', (allOk ? '✓' : '✗') + ' SELFTEST ' + ok + '/' + total + ' · SubSDJ' + (res.length > 1 ? ' (' + parts.join(' · ') + ')' : ''));
for (const r of res) console.log('done:', JSON.stringify(r.done), 'in', r.secs.toFixed(1), 's', r.lastNote ? '· ' + r.lastNote : '');
for (const r of res) for (const p of r.demos)
  console.log('demo:', p.demo || ('ERROR ' + p.demo_error), '| diff', p.diff, '| peaks', p.peakA, p.peakB, p.bad ? '| BAD' : '');
const fails = res.flatMap(r => r.fails || (r.hung ? ['(batch ' + batchName(r) + ') :: ' + r.lastNote] : []));
console.log('fails:', JSON.stringify(fails));
for (const r of res) if ('extra' in r) console.log('extra:', JSON.stringify(r.extra));
for (const r of res) for (const l of r.logs) console.log('log:', l);
console.log('js errors:', JSON.stringify(res.flatMap(r => r.errs)));
server.close();
setTimeout(() => process.exit(fails.length || !allOk ? 1 : 0), 300);
