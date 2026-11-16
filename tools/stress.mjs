// SubSDJ · stress test: how the instrument holds up under extreme loads (CDP, no dependencies).
// Usage:  node tools/stress.mjs [scene.json …]
// Plays a few built-in extreme cases — and the scenes given (files exported with the Library's Export,
// or a scene's JSON) — LIVE in headless Chrome and counts the audio thread's dropouts with
// AudioContext.playbackStats (underruns: what is heard as crackling or the output breaking up). The CPU
// percentage does not show them: the audio is ONE thread. Each case in a fresh page, RUNS times (default 2:
// the first run of a series can be noisier). It is a MEASURE, not a pass/fail test: the numbers depend on the
// machine and on what else is running; compare before and after a change of the engine on the same machine
// (an A/B with a git worktree of the previous commit, as in docs/DESIGN.md «Dense patterns and the voice limits»).
// Environment: RUNS=n · SECS=s (seconds measured per run, default 8) · CHROME=path. Serves on 8004.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import os from 'node:os'; import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), PORT = 8004;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const RUNS = +process.env.RUNS || 2, SECS = +process.env.SECS || 8;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The built-in cases: what a player can ask of the engine at the extremes. Each part: a factory preset and a
// player mode; `chords` builds a Pattern loop of one bar with a chord of n notes every `step` beats, `len` long.
const chords = (n, step, len) => {
  const notes = [], base = [48, 52, 55, 59, 60, 64, 67, 71, 72, 76, 79, 83];
  for (let b = 0; b < 4 - 1e-9; b += step) for (let k = 0; k < n; k++) notes.push({ b, len, m: base[k % base.length] + (Math.round(b / step) % 4), v: 0.8 });
  return { bars: 1, notes };
};
const CASES = [
  { name: 'FM chords of 8 on 16ths (DX E-Piano, 128 BPM)', bpm: 128, parts: [{ preset: 'DX E-Piano', mode: 'pattern', pat: chords(8, 0.25, 0.25) }] },
  { name: 'long pad chords of 8 on 8ths (Warm Pad, 1 beat)', bpm: 120, parts: [{ preset: 'Warm Pad', mode: 'pattern', pat: chords(8, 0.5, 1) }] },
  { name: 'four parts at once (DX 16ths · Supersaw chords · melody · pulse)', bpm: 128, parts: [
    { preset: 'DX E-Piano', mode: 'pattern', pat: chords(6, 0.25, 0.25) }, { preset: 'Supersaw Pad', mode: 'chord' },
    { preset: 'DX E-Piano', mode: 'melody' }, { preset: 'Synth Tom', mode: 'pulse' }] },
];
for (const f of process.argv.slice(2)) CASES.push({ name: 'scene ' + path.basename(f), scene: JSON.parse(fs.readFileSync(f, 'utf8')) });

// The page side: builds the case, plays it SECS seconds after a second of warm-up, and measures
const PROBE = `async (c, secs) => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  const P = await import('./js/engine/parts.js'), PC = await import('./js/ui/playerControls.js');
  const L = await import('./js/engine/library.js'), PB = await import('./js/ui/presetBank.js');
  document.getElementById('partsBtn').click();
  for (let i = 0; i < 50 && !document.body.classList.contains('parts'); i++) await w(100);
  if (c.scene) await PC.loadScene(c.scene);
  else {
    for (let i = 0; i < 4; i++) {
      document.querySelector('#partSel button[data-p="' + i + '"]').click(); await w(50);
      const d = c.parts[i], pl = P.getScene().conductor.players[i];
      if (!d) { pl.setMode('off'); continue; }
      const it = L.library.presets().find(p => p.name === d.preset);
      if (!it) return { error: 'no preset ' + d.preset };
      PB.loadPresetId(it.id); await w(150);
      pl.setMode(d.mode); if (d.pat) { pl.cfg.pat = d.pat; pl.cfg.quant = 0.25; }
    }
    P.getScene().parts[0].engine.set('bpm', c.bpm);
  }
  await w(800);
  const sc = P.getScene(), E = sc.parts.map(p => p.engine), ctx = E[0].ctx;
  if (!ctx.playbackStats) return { error: 'this Chrome has no AudioContext.playbackStats' };
  let starts = 0; E.forEach(e => { const on = e._directOn.bind(e); e._directOn = (...a) => { starts++; return on(...a); }; });
  document.querySelector('.pat-top [data-pat="play"]').click();
  await w(1000);
  const s0 = ctx.playbackStats, u0 = s0.underrunEvents, d0 = s0.underrunDuration, n0 = starts;
  const alive = []; const t0 = performance.now();
  while (performance.now() - t0 < secs * 1000) {
    await w(100);
    alive.push(E.reduce((a, e) => a + e.voices.size + e.tails.size + (e.going ? e.going.size : 0), 0));
  }
  const s1 = ctx.playbackStats;
  document.querySelector('.pat-top [data-pat="play"]').click();
  return { u: s1.underrunEvents - u0, ms: Math.round((s1.underrunDuration - d0) * 1000), notes: Math.round((starts - n0) / secs),
           avg: +(alive.reduce((a, b) => a + b, 0) / alive.length).toFixed(1), max: Math.max(...alive) };
}`;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (err, data) => { if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data); });
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));
const profile = path.join(os.tmpdir(), 'subsdj-cdp-stress-' + Date.now()); fs.mkdirSync(profile, { recursive: true });
spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--window-size=1500,1000', 'about:blank'], { detached: true, stdio: 'ignore' }).unref();
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

console.log('SubSDJ stress · ' + RUNS + ' run(s) × ' + SECS + ' s per case · underruns = audio dropouts (0 = clean)\n');
for (const c of CASES) {
  const rows = [];
  for (let r = 0; r < RUNS; r++) {
    await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/?nosplash=1' });   // a fresh page each run
    for (let i = 0; i < 50; i++) { await sleep(200); if (await ev('document.readyState') === 'complete') break; }
    await sleep(800);
    const res = await ev('(' + PROBE + ')(' + JSON.stringify(c) + ', ' + SECS + ')');
    if (!res || res.error) { rows.push('error: ' + (res ? res.error : 'no answer')); break; }
    rows.push(res.u + ' underruns (' + res.ms + ' ms) · ' + res.notes + ' notes/s · voices alive ' + res.avg + ' avg, ' + res.max + ' max');
  }
  console.log(c.name); rows.forEach(r => console.log('  ' + r));
}
if (errs.length) console.log('\njs errors:', JSON.stringify(errs));
await send('Browser.close'); ws.close(); server.close(); setTimeout(() => process.exit(0), 300);
