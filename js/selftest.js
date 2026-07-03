/* =====================================================================
   SubSDJ · self-test (?selftest=1)
   Red de regresión sin herramientas externas: renderiza cada preset de
   fábrica en un OfflineAudioContext (C3 en t=0, +G3 en t=0.5, suelta
   ambas en t=1.0, cola = release del preset) y comprueba:
     1) que todas las claves del preset existen en CONTROLS (caza typos),
     2) que el render no contiene NaN/Infinity,
     3) que no es silencio (pico > -40 dBFS),
     4) que no hay clipping (pico <= 0 dBFS).
   Además: check estático de la migración de presets v1->v2 y un estrés de
   16 notas simultáneas que ejercita MAX_POLY (robo de voz) y MAX_TAILS.
   Recorre el MISMO camino que al cargar un preset de verdad:
   loadState() sobre los controles -> engine.S (espacio-motor) -> clon
   -> motor nuevo sobre el contexto offline. Así valida también el mapeo
   control->motor (logCut, rangos), no sólo el DSP.
   Resultados: panel en pantalla + console.table + título de la pestaña.
   ===================================================================== */
import { AudioEngine, engine } from './engine/AudioEngine.js';
import { Arp } from './engine/Arp.js';
import { FACTORY, migrateV1 } from './engine/presets.js';
import { CONTROLS, loadState } from './ui/registry.js';
import { encodeWav } from './ui/recorder.js';

const SR = 44100;
const NOTE1 = 130.81, NOTE2 = 196.0;   // C3 + G3: acorde en poli, legato en mono
const SILENCE = 0.01;                  // -40 dBFS

const dB = v => v > 1e-6 ? (20 * Math.log10(v)).toFixed(1) + ' dB' : '−∞';

function analyze(buf) {
  let peak = 0, bad = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (!Number.isFinite(v)) { bad++; continue; }
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
    }
  }
  return { peak, bad };
}

async function renderState(state) {
  const dur = Math.min(6, 1.0 + (state.r || 0.3) + 0.3);   // 1 s de nota + cola de release
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
  const eng = new AudioEngine();
  eng.S = state;
  await eng.init(ctx);
  eng.noteOn('t1', NOTE1);
  ctx.suspend(0.5).then(() => { eng.noteOn('t2', NOTE2); ctx.resume(); });
  ctx.suspend(1.0).then(() => { eng.noteOff('t1'); eng.noteOff('t2'); ctx.resume(); });
  return analyze(await ctx.startRendering());
}

// Telemetría para ejecución headless: cada GET queda en el log del http.server
// (aunque responda 404), así que un runner externo puede leer los resultados.
const ping = q => { try { fetch('selftest.ping?' + q, { cache: 'no-store' }).catch(() => {}); } catch (e) {} };

async function renderStress(state) {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * 2), SR);
  const eng = new AudioEngine();
  eng.S = state;
  await eng.init(ctx);
  for (let i = 0; i < 16; i++) eng.noteOn('s' + i, 110 * Math.pow(2, i / 12));
  ctx.suspend(0.5).then(() => { for (let i = 0; i < 16; i++) eng.noteOff('s' + i); ctx.resume(); });
  return analyze(await ctx.startRendering());
}

async function testPreset(name, data) {
  const problems = [];
  const badKeys = Object.keys(data).filter(k => !(k in CONTROLS));
  if (badKeys.length) problems.push('claves desconocidas: ' + badKeys.join(', '));
  let peak = 0;
  try {
    loadState(data);                        // aplica el preset por el camino real (UI -> S)
    const r = await renderState(structuredClone(engine.S));
    peak = r.peak;
    if (r.bad) problems.push(r.bad + ' muestras NaN/Inf');
    else if (peak <= SILENCE) problems.push('silencio (pico ' + dB(peak) + ')');
    else if (peak > 1.0) problems.push('clipping (pico ' + dB(peak) + ')');
  } catch (e) {
    problems.push('excepción: ' + ((e && e.message) || e));
  }
  return { name, peak, problems, ok: problems.length === 0 };
}

// ---------- panel de resultados ----------
function el(cls, text) {
  const d = document.createElement('div');
  d.className = cls;
  if (text) d.textContent = text;
  return d;
}
function makePanel() {
  const p = document.createElement('div');
  p.id = 'selftestPanel';
  p.innerHTML =
    '<div class="st-head"><b>Self-test</b><span id="stSummary">preparando…</span>' +
    '<button id="stClose" title="Cerrar">✕</button></div><div id="stBody"></div>';
  document.body.appendChild(p);
  p.querySelector('#stClose').addEventListener('click', () => p.remove());
  return p;
}
function addRow(body, r) {
  const row = el('st-row ' + (r.ok ? 'ok' : 'fail'));
  row.appendChild(el('st-mark', r.ok ? '✓' : '✗'));
  row.appendChild(el('st-name', r.name));
  row.appendChild(el('st-peak', dB(r.peak)));
  body.appendChild(row);
  if (!r.ok) body.appendChild(el('st-err', r.problems.join(' · ')));
  body.scrollTop = body.scrollHeight;
}

export async function runSelfTest() {
  const t0 = performance.now();
  const panel = makePanel();
  const body = panel.querySelector('#stBody');
  const summary = panel.querySelector('#stSummary');

  // nombres duplicados en el banco (el lookup de presets es plano, por nombre)
  const seen = new Set(), dups = [];
  for (const cat in FACTORY) for (const name in FACTORY[cat]) {
    if (seen.has(name)) dups.push(name); else seen.add(name);
  }
  if (dups.length) body.appendChild(el('st-err', 'Nombres duplicados en FACTORY: ' + dups.join(', ')));

  const results = [];
  let ok = 0;
  const push = r => { results.push(r); if (r.ok) ok++; addRow(body, r); };

  // check estático: migración de presets de usuario v1 (cutoff 0..1) -> v2 (Hz)
  {
    body.appendChild(el('st-cat', 'Estático'));
    const m = migrateV1({ cutoff: 0.5, reso: 3 }), keep = migrateV1({ cutoff: 6000 });
    const okM = m.reso === 3 && Math.abs(m.cutoff - 632.5) < 2 && keep.cutoff === 6000;
    push({ name: 'migración presets v1→v2', peak: 0, ok: okM,
           problems: okM ? [] : ['migrateV1: ' + JSON.stringify([m, keep])] });
  }
  {
    // arpegiador: secuencia 'up' con 2 octavas ordenada por altura
    const a = new Arp({ S: { arpOct: '2' }, ctx: null });
    a.held = [{ id: 1, freq: 200, vel: 1 }, { id: 2, freq: 100, vel: 1 }];
    const seq = a._seq().map(n => n.freq).join(',');
    const okA = seq === '100,200,200,400';
    push({ name: 'arpegiador (secuencia ×2 oct)', peak: 0, ok: okA, problems: okA ? [] : ['seq: ' + seq] });
  }
  {
    // codificador WAV: cabecera y tamaño (44 bytes + n·4 en 16-bit estéreo)
    const blob = encodeWav([new Float32Array(128)], [new Float32Array(128)], 44100);
    const okW = blob.size === 44 + 128 * 4 && blob.type === 'audio/wav';
    push({ name: 'codificador WAV', peak: 0, ok: okW, problems: okW ? [] : ['blob: ' + blob.size + ' ' + blob.type] });
  }

  // el estado {} equivale al botón Reset; después, todo el banco de fábrica
  const jobs = [['Base', 'Reset ({})', {}]];
  for (const cat in FACTORY) for (const name in FACTORY[cat]) jobs.push([cat, name, FACTORY[cat][name]]);

  let lastCat = null;
  for (const [cat, name, data] of jobs) {
    if (cat !== lastCat) { body.appendChild(el('st-cat', cat)); lastCat = cat; }
    const r = await testPreset(name, data);
    push(r);
    summary.textContent = ok + '/' + results.length;
    ping('i=' + results.length + '&ok=' + (r.ok ? 1 : 0) + '&peak=' + r.peak.toFixed(3) +
         '&name=' + encodeURIComponent(r.name) +
         (r.ok ? '' : '&why=' + encodeURIComponent(r.problems.join(' | '))));
  }

  // estrés: 16 noteOn simultáneas (dispara robo de voz con MAX_POLY=10) y
  // suelta todas a la vez (dispara el recorte de colas con MAX_TAILS=12)
  {
    body.appendChild(el('st-cat', 'Estrés'));
    let r;
    try {
      loadState({});
      const a = await renderStress(structuredClone(engine.S));
      const problems = [];
      if (a.bad) problems.push(a.bad + ' muestras NaN/Inf');
      else if (a.peak <= SILENCE) problems.push('silencio (pico ' + dB(a.peak) + ')');
      else if (a.peak > 1.0) problems.push('clipping (pico ' + dB(a.peak) + ')');
      r = { name: '16 notas + robo de voz', peak: a.peak, problems, ok: problems.length === 0 };
    } catch (e) {
      r = { name: '16 notas + robo de voz', peak: 0, problems: ['excepción: ' + ((e && e.message) || e)], ok: false };
    }
    push(r);
    ping('i=' + results.length + '&ok=' + (r.ok ? 1 : 0) + '&peak=' + r.peak.toFixed(3) + '&name=stress' +
         (r.ok ? '' : '&why=' + encodeURIComponent(r.problems.join(' | '))));
  }

  loadState({});                             // deja el synth en valores por defecto
  const fails = results.length - ok;
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  summary.textContent = ok + '/' + results.length + ' ok · ' + secs + ' s';
  document.title = (fails || dups.length ? '✗' : '✓') + ' SELFTEST ' + ok + '/' + results.length + ' · SubSDJ';
  console.table(results.map(r => ({ preset: r.name, ok: r.ok, pico: dB(r.peak), problemas: r.problems.join(' · ') || '—' })));
  ping('done=1&ok=' + ok + '&total=' + results.length + '&dups=' + dups.length + '&secs=' + secs);
  return { ok, total: results.length, fails, dups, results };
}
