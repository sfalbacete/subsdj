// SubSDJ · renders preset candidates to WAV, headless (CDP, no dependencies): the tool of the
// ear sessions — several variants of a sound, rendered the same way, listened A/B.
// Usage:  node tools/render.mjs candidates.json outdir
//   candidates.json = { "secs": 3.2, "notes": [{ "m": 60, "t": 0, "d": 0.5, "v": 1 }, …],
//                       "candidates": { "name": { …preset (v2, over the preset base)… }, … } }
//   notes: MIDI number, start, duration, velocity; one WAV per candidate, named after it.
// Each WAV is normalised to a −3 dBFS peak (the ear compares timbres, not levels); the peak
// before normalising is printed. The render goes through the real engine (AudioEngine +
// applyPreset over PRESET_BASE), stereo 16 bit at 44.1 kHz, like the selftest's renders.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import os from 'node:os'; import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), PORT = 8003;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const [candFile, outDir] = process.argv.slice(2);
if (!candFile || !outDir) { console.error('usage: node tools/render.mjs candidates.json outdir'); process.exit(2); }
const spec = JSON.parse(fs.readFileSync(candFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
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
  '--autoplay-policy=no-user-gesture-required', 'about:blank'], { detached: true, stdio: 'ignore' }).unref();
let port = 0; for (let i = 0; i < 150 && !port; i++) { await sleep(200); try { port = +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0]; } catch {} }
if (!port) { console.error('no DevToolsActivePort (Chrome path? environment variable CHROME)'); process.exit(2); }
const page = (await (await fetch('http://127.0.0.1:' + port + '/json')).json()).find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(), errs = [];
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || m.error); pend.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || '')); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '')); return r.result?.value; };
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/?nosplash=1' });
for (let i = 0; i < 50; i++) { await sleep(200); if (await ev('document.readyState') === 'complete') break; }
await sleep(800);

// page side: render one candidate and hand the WAV back as base64
const RENDER = `(async (cand, notes, secs) => {
  const [{ AudioEngine }, { makeDefaultState, applyPreset }, { encodeWav }] =
    await Promise.all([import('./js/engine/AudioEngine.js'), import('./js/engine/state.js'), import('./js/ui/recorder.js')]);
  const SR = 44100, ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
  const eng = new AudioEngine(); eng.S = applyPreset(makeDefaultState(), cand); await eng.init(ctx);
  const f = m => 440 * Math.pow(2, (m - 69) / 12), ev = [];
  notes.forEach((n, i) => { const t0 = n.t || 0; ev.push([t0, () => eng.noteOn('n' + i, f(n.m), n.v == null ? 1 : n.v)]); ev.push([t0 + (n.d == null ? 0.5 : n.d), () => eng.noteOff('n' + i)]); });
  ev.sort((a, b) => a[0] - b[0]);
  const byT = new Map(); for (const [t, fn] of ev) { if (!byT.has(t)) byT.set(t, []); byT.get(t).push(fn); }
  for (const [t, fns] of byT) { if (t <= 0) fns.forEach(fn => fn()); else ctx.suspend(t).then(() => { fns.forEach(fn => fn()); ctx.resume(); }); }
  const b = await ctx.startRendering(), L = b.getChannelData(0), R = b.getChannelData(1);
  let peak = 0; for (let i = 0; i < L.length; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a; }
  const u8 = new Uint8Array(await encodeWav([L], [R], SR).arrayBuffer()); let s = '';   // encodeWav gives a Blob
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { peak, wav: btoa(s) };
})`;

const notes = spec.notes || [{ m: 60, t: 0, d: 0.5 }], secs = spec.secs || 3;
for (const [name, cand] of Object.entries(spec.candidates || {})) {
  try {
    const r = await ev(RENDER + '(' + JSON.stringify(cand) + ', ' + JSON.stringify(notes) + ', ' + secs + ')');
    const buf = Buffer.from(r.wav, 'base64');
    // normalise to −3 dBFS on the 16-bit samples (the header stays as it is)
    const target = Math.pow(10, -3 / 20), g = r.peak > 1e-6 ? target / r.peak : 1;
    for (let o = 44; o + 1 < buf.length; o += 2) { const v = Math.max(-32768, Math.min(32767, Math.round(buf.readInt16LE(o) * g))); buf.writeInt16LE(v, o); }
    const file = path.join(outDir, name.replace(/[^\w.-]+/g, '_') + '.wav');
    fs.writeFileSync(file, buf);
    console.log(name.padEnd(28), 'peak', (20 * Math.log10(Math.max(1e-9, r.peak))).toFixed(1) + ' dBFS', '→', file);
  } catch (e) { console.log(name.padEnd(28), 'ERROR', String(e.message || e).split('\n')[0]); }
}
if (errs.length) console.log('js errors:', JSON.stringify(errs.slice(0, 3)));
await Promise.race([send('Browser.close'), sleep(3000)]); ws.close(); server.close();
setTimeout(() => process.exit(0), 200);
