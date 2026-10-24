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
import { AudioEngine, engine, loadWorklets, VOICE_BUDGET } from './engine/AudioEngine.js';
import { Voice } from './engine/Voice.js';
import { Sala, SALA_KEYS, plateDecay, reverbEnergyGain, HEADROOM_DB, LIM_LOOKAHEAD, LIM_CEIL_DB, LIM_MAKEUP_DB } from './engine/Sala.js';
const HR = Math.pow(10, HEADROOM_DB / 20);   // margen fijo del máster (1.1.0): los umbrales ABSOLUTOS de nivel lo llevan dentro
import { Arp } from './engine/Arp.js';
import { Clock, clockOf } from './engine/Clock.js';
import { Steps, cycleBars } from './engine/Steps.js';
import { Seq, parsePattern, stepFreq } from './engine/Seq.js';
import { parseWsPattern } from './engine/WaveSeq.js';
import { SEQ_PATTERNS } from './ui/seqControls.js';
import { FACTORY, migrateV1 } from './engine/presets.js';
import { espectroDe, puntosDeEspectro, saveUserFrames, defaultUserFrames, WT_LS, invalidateUserSet, getWtSet,
         encodeUserFrames, decodeUserFrames } from './engine/wavetable.js';
import { PARAMS, PRESET_BASE, valToPos, posToVal } from './engine/params.js';
import { makeDefaultState, applyPreset, toControls, migrateMix, withPresetBase } from './engine/state.js';
import { createScene, sceneToJSON, applySceneJSON, NoteRouter, part } from './engine/parts.js';
import { velFromY } from './ui/keyboard.js';
import { lfoBuffers, makeIR, mkLFO, setLfoShape, seedRender, ctxRandom } from './engine/nodes.js';
import { Arrangement } from './engine/Arrangement.js';
import { Harmony } from './engine/Harmony.js';
import { euclid } from './engine/Player.js';
import { Conductor } from './engine/Conductor.js';
import { CONTROLS, loadState, snapshot } from './ui/registry.js';
import { encodeWav } from './ui/recorder.js';
import { makeSfzKit, makeZip, velocityLayers } from './ui/sfzExport.js';
import { ccToVal, zoneOf, applyCC, armLearn, learnCapture, setDevice, getDevice, getMap } from './ui/midimap.js';
import { loadPresetIndex, loadPresetId, navOptions, presetBankReady } from './ui/presetBank.js';
import { undo, redo, historyDepth, isModified, enterCompare, exitCompare, isComparing } from './ui/history.js';
import { handleMidi } from './ui/midi.js';
import { resRatios, resQ, resGains } from './engine/reson.js';
import { library, Library, SEC_MIOS, SEC_ESCENAS, SEC_IMPORT, ESCENAS_REPO } from './engine/library.js';
import { SCREENS, showScreen, currentScreen } from './ui/screens.js';
import { RULES, depTargets, refreshDeps } from './ui/deps.js';
import { listThemes, setTheme, currentTheme, token } from './ui/theme.js';
import { VERSION, RELEASE } from './version.js';
import { splashDate, SplashFx } from './ui/splash.js';
import { FM4_ALGS, layout as fm4Layout, svgFor as fm4Svg } from './ui/fm4Graph.js';

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

async function renderBuf(state, vel = 1) {
  const dur = Math.min(6, 1.0 + (state.r || 0.3) + 0.3);   // 1 s de nota + cola de release
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
  const eng = new AudioEngine();
  eng.S = state;
  await eng.init(ctx);
  eng.noteOn('t1', NOTE1, vel);
  ctx.suspend(0.5).then(() => { eng.noteOn('t2', NOTE2, vel); ctx.resume(); });
  ctx.suspend(1.0).then(() => { eng.noteOff('t1'); eng.noteOff('t2'); ctx.resume(); });
  return ctx.startRendering();
}
async function renderState(state) { return analyze(await renderBuf(state)); }
// Render de UNA sola nota (C3, velocity `vel`) de `secs` segundos con noteOff
// en `offAt`: para checks que miden ventanas temporales sin que la 2ª nota
// del render estándar las contamine (delay de cinta, FM en la matriz).
async function renderOne(state, { secs = 2.2, offAt = 0.3, vel = 1 } = {}) {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
  const eng = new AudioEngine(); eng.S = state;
  await eng.init(ctx);
  eng.noteOn('t1', NOTE1, vel);
  ctx.suspend(offAt).then(() => { eng.noteOff('t1'); ctx.resume(); });
  return ctx.startRendering();
}
// Tilt espectral de una ventana [t0,t1): energía de la 1ª diferencia / energía
// (∝ centroide; independiente del nivel). Sube con el brillo.
function tiltW(buf, t0, t1) {
  const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
  let hf = 0, en = 0;
  for (let i = i0 + 1; i < i1; i++) { const e = d[i] - d[i - 1]; hf += e * e; en += d[i] * d[i]; }
  return hf / Math.max(1e-12, en);
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
  await presetBankReady();   // la siembra de los bancos del repo es asíncrona: el selector, completo antes de contar

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
    // mezclador (1.2.0): Mix A↔B y Ring en crossfade → niveles independientes,
    // con los MISMOS coeficientes: (1−ring)(1−mix), (1−ring)·mix y ring
    const probs = [], eq = (o, a, b) => o.levelA === a && o.levelB === b && !('mix' in o);
    const cases = [
      [migrateMix({ mix: 0.35 }), 0.65, 0.35, 'solo Mix'],
      [migrateMix({ mix: 0.5, ring: 0.3 }), 0.35, 0.35, 'Mix + Ring'],
      [migrateMix({ ring: 0.8 }), 0.12, 0.08, 'Ring sin Mix (el Mix 0,4 de la base de antes)'],
      [withPresetBase({ mix: 0 }), 1, 0, 'Mix 0 sobre la base'],
    ];
    for (const [o, a, b, what] of cases) if (!eq(o, a, b)) probs.push(what + ': ' + JSON.stringify(o));
    const nuevo = { levelB: 0.3, ring: 0.5 };
    if (migrateMix(nuevo) !== nuevo) probs.push('un preset con niveles no se toca');
    if (!('levelA' in withPresetBase({ cutoff: 1000 })) || withPresetBase({ cutoff: 1000 }).levelA !== PRESET_BASE.levelA) probs.push('sin Mix ni Ring: los niveles de la base');
    if (Object.keys(withPresetBase({})).length) probs.push('{} ya no es Reset');
    for (const cat in FACTORY) for (const n in FACTORY[cat]) {
      const p = FACTORY[cat][n];
      if ('mix' in p) probs.push(n + ': fábrica con Mix');
      if (p.ring > 0 && !('levelA' in p && 'levelB' in p)) probs.push(n + ': Ring sin niveles (se leería como de antes)');
    }
    push({ name: 'migración del mezclador (Mix/Ring → niveles A, B, Ring)', peak: 0, ok: !probs.length, problems: probs.slice(0, 4) });
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
    // Reloj común (Roadmap 7.0 · 0.4). (1) Las cuentas: rejilla exacta, un BPM nuevo
    // no mueve el pulso de ahora, el primero que se une fija el origen y los demás
    // van a la rejilla. (2) En tiempo real (el Arp y el Seq van por temporizador: no
    // corren offline), dos motores en un contexto con el _directOn interceptado:
    // tocando a mano, el arpegio suena a +30 ms de la tecla (sin retraso añadido) y
    // un Seq que entra 130 ms después cae en SU rejilla (|Δ| < 1 muestra); con el
    // origen anclado como lo ancla el director, una tecla con instante (la de un
    // jugador) empieza EXACTAMENTE ahí, no donde caiga un temporizador; y tras
    // pasar de 120 a 90 BPM los pasos siguen en la rejilla, sin hueco ni salto.
    const probs = [];
    const fake = { currentTime: 10 }, c = new Clock(fake);
    c.anchor('d', 10, 120);
    if (Math.abs(c.nextGrid(10.2, 0.25) - 10.25) > 1e-9 || Math.abs(c.nextGrid(10.25, 0.25) - 10.25) > 1e-9) probs.push('nextGrid: ' + c.nextGrid(10.2, 0.25) + ' / ' + c.nextGrid(10.25, 0.25));
    if (c.stepAt(10.37, 0.25) !== 2) probs.push('stepAt: ' + c.stepAt(10.37, 0.25));
    const b0 = c.beatAt(11.3); c.setBpm(90, 11.3);
    if (Math.abs(c.beatAt(11.3) - b0) > 1e-9 || Math.abs(c.beatLen() - 60 / 90) > 1e-12) probs.push('setBpm: el pulso de ahora salta ' + (c.beatAt(11.3) - b0));
    const c2 = new Clock(fake), t1 = c2.join('a', 5.03, 0.25, 120), t2 = c2.join('b', 5.17, 0.5, 120);
    if (t1 !== 5.03 || Math.abs(t2 - 5.28) > 1e-9) probs.push('join: ' + t1 + ' / ' + t2);
    // Partes: el knob BPM solo llega al S de la parte elegida; el tempo de todas es el de la sala
    try {
      const scB = await createScene(new OfflineAudioContext(2, 128, SR), []);
      scB.parts[0].engine.set('bpm', 97);
      const bpms = scB.parts.map(p => p.engine.bpm);
      if (!bpms.every(b => b === 97)) probs.push('Partes: el BPM de la sala no llega a todas (' + bpms.join(', ') + ')');
    } catch (e2) { probs.push('Partes: ' + ((e2 && e2.message) || e2)); }
    let live = null;
    try {
      live = new AudioContext(); await live.resume();
      const mk = (S) => { const e = new AudioEngine(); e.ctx = live; e.ready = true; Object.assign(e.S, S); e.log = [];
        e._directOn = (id, f, v, when) => e.log.push(when); e._directOff = () => {}; e.allNotesOff = () => {}; return e; };
      const eA = mk({ arpMode: 'up', arpDiv: '1/16', bpm: 120 }), eB = mk({ seqOn: 'on', seqPat: '0 3 7 12', seqDiv: '1/8', bpm: 120 });
      const clk = clockOf(live), wait = ms => new Promise(r => setTimeout(r, ms));
      const tHold = live.currentTime; eA.noteOn('k', 220, 1);
      await wait(130); eB.noteOn('k', 110, 1);
      await wait(420);
      const off = (t, div) => { const x = (t - clk.origin) / (div * clk.beatLen()); return Math.abs(x - Math.round(x)) * div * clk.beatLen(); };
      if (!(Math.abs(eA.log[0] - (tHold + 0.03)) < 0.002)) probs.push('a mano: el arpegio arranca ' + ((eA.log[0] - tHold) * 1000).toFixed(1) + ' ms tras la tecla (esperado 30)');
      const dA = Math.max(...eA.log.map(t => off(t, 0.25))), dB = Math.max(...eB.log.map(t => off(t, 0.5)));
      if (!(eA.log.length >= 4 && eB.log.length >= 2)) probs.push('pocos pasos: Arp ' + eA.log.length + ' · Seq ' + eB.log.length);
      if (!(dA < 0.5 / SR && dB < 0.5 / SR)) probs.push('fuera de la rejilla: Arp ' + (dA * SR).toFixed(2) + ' · Seq ' + (dB * SR).toFixed(2) + ' muestras');
      eA.noteOff('k'); eB.noteOff('k');
      // el director ancla; una tecla con instante (pulso 2) empieza ahí exacto
      clk.anchor('director', live.currentTime + 0.05, 120);
      const eC = mk({ arpMode: 'up', arpDiv: '1/16', bpm: 120 }), when = clk.timeAt(2);
      eC.noteOn('j', 330, 1, when);
      await wait(1150);
      if (!(eC.log.length && Math.abs(eC.log[0] - when) < 0.5 / SR)) probs.push('jugador: la tecla con instante empieza a ' + (eC.log.length ? ((eC.log[0] - when) * 1000).toFixed(2) + ' ms' : 'nunca') + ' de su pulso');
      // cambio de tempo en marcha
      const nBefore = eC.log.length; clk.setBpm(90, live.currentTime); eC.S.bpm = 90;
      await wait(500);
      const after = eC.log.slice(nBefore), gaps = after.slice(1).map((t, i) => t - after[i]);
      const dC = Math.max(...after.map(t => off(t, 0.25)));
      if (!(after.length >= 3 && dC < 0.5 / SR && gaps.every(g => Math.abs(g - 0.25 * 60 / 90) < 1e-6))) probs.push('tras 120 → 90 BPM: ' + after.length + ' pasos, fuera de rejilla ' + (dC * SR).toFixed(2) + ' muestras, huecos ' + gaps.map(g => (g * 1000).toFixed(1)).join(' ') + ' ms');
      eC.noteOff('j'); clk.leave('director');
      console.log('reloj común: a mano +' + ((eA.log[0] - tHold) * 1000).toFixed(1) + ' ms · Arp/Seq fuera de rejilla ' + (dA * SR).toFixed(3) + ' / ' + (dB * SR).toFixed(3) + ' muestras · jugador Δ ' + ((eC.log[0] - when) * SR).toFixed(3) + ' muestras · tras 90 BPM ' + (dC * SR).toFixed(3));
    } catch (e2) { probs.push('excepción: ' + ((e2 && e2.message) || e2)); }
    finally { if (live) live.close(); }
    push({ name: 'reloj común (rejilla · BPM sin saltos · Arp y Seq juntos · la tecla del jugador en su pulso)', peak: 0, ok: !probs.length, problems: probs });
  }
  {
    // secuenciador: parser del patrón (silencios, inválidos, clamp ±, sufijos fase 2, tope 16)
    const p1 = parsePattern('0 3 7 12 . 7 3 .').map(s => s ? s.off : '.').join(',');
    const p2 = parsePattern('x 1.5 40 -40 7! 5~');
    const okP = p1 === '0,3,7,12,.,7,3,.'
      && p2[0] === null && p2[1] === null && p2[2].off === 24 && p2[3].off === -12
      && p2[4].off === 7 && p2[4].accent && p2[5].off === 5 && p2[5].tie
      && parsePattern('').length === 0
      && parsePattern(Array(20).fill('0').join(' ')).length === 16;
    push({ name: 'secuenciador (parser del patrón)', peak: 0, ok: okP, problems: okP ? [] : ['p1: ' + p1 + ' p2: ' + JSON.stringify(p2)] });
  }
  {
    // secuenciador: transposición cromática (raíz × 2^(semis/12))
    const okT = Math.abs(stepFreq(110, 12) - 220) < 1e-9 && stepFreq(110, 0) === 110
      && Math.abs(stepFreq(220, -12) - 110) < 1e-9 && Math.abs(stepFreq(261.63, 7) - 391.995) < 0.02;
    push({ name: 'secuenciador (transposición)', peak: 0, ok: okT, problems: okT ? [] : ['stepFreq'] });
  }
  {
    // secuenciador: raíz last-note, latch y retrig (sin ctx, como el test del arp)
    const probs = [];
    const q = new Seq({ S: { seqLatch: 'on', seqRetrig: 'on' }, ctx: null });
    q.held = [{ id: 1, freq: 100, vel: 1 }, { id: 2, freq: 200, vel: 0.8 }];
    if (q._root().freq !== 200) probs.push('last-note priority');
    q.unhold(2);
    if (q._root().freq !== 100) probs.push('vuelta a la nota anterior');
    q.unhold(1);
    if (!q._root() || q._root().freq !== 100 || q._root().vel !== 1) probs.push('latch no captura la última');
    q.timer = 1; q.idx = 5; q.hold(3, 300, 1);   // rama con timer vivo: no toca ctx
    if (q.idx !== 0 || q._root().freq !== 300) probs.push('retrig no reinicia la frase');
    const q2 = new Seq({ S: { seqLatch: 'off', seqRetrig: 'off' }, ctx: null });
    q2.held = [{ id: 1, freq: 100, vel: 1 }];
    q2.unhold(1);
    if (q2._root() !== null) probs.push('sin latch debería quedar sin raíz');
    push({ name: 'secuenciador (raíz/latch/retrig)', peak: 0, ok: !probs.length, problems: probs });
  }
  {
    // marcador de paso: selección por reloj de audio y poda de pasos vencidos
    const q = new Seq({ S: {}, ctx: { currentTime: 1.0 } });
    q.timer = 1;
    q.playQ = [{ i: 2, t0: 0.5, t1: 0.9 }, { i: 3, t0: 0.9, t1: 1.3 }, { i: 4, t0: 1.3, t1: 1.7 }];
    const a = q.playingStep();                               // t=1.0: poda i=2, suena i=3
    const q2 = new Seq({ S: {}, ctx: { currentTime: 0 } });  // parado (sin timer) → -1
    const okM = a === 3 && q.playQ.length === 2 && q2.playingStep() === -1;
    push({ name: 'secuenciador (marcador de paso)', peak: 0, ok: okM,
           problems: okM ? [] : ['playingStep: ' + a + ' len ' + q.playQ.length] });
  }
  {
    // banco de frases: tokens válidos, ≤16 pasos, alguna nota, offsets en rango, nombres únicos
    const bad = [], names = new Set();
    for (const p of SEQ_PATTERNS) {
      const toks = p.pat.trim().split(/\s+/), st = parsePattern(p.pat);
      if (!toks.length || toks.length > 16) bad.push(p.name + ': longitud ' + toks.length);
      if (!toks.every(t => t === '.' || /^-?\d+[!~]?$/.test(t))) bad.push(p.name + ': token inválido');
      if (!st.some(Boolean)) bad.push(p.name + ': sin notas');
      if (st.some((s, i) => s && s.off !== parseInt(toks[i], 10))) bad.push(p.name + ': offset fuera de rango');
      if (!['1/4', '1/8', '1/16'].includes(p.div)) bad.push(p.name + ': div ' + p.div);
      if (p.bpm != null && !(p.bpm >= 40 && p.bpm <= 220)) bad.push(p.name + ': bpm ' + p.bpm);
      if (names.has(p.name)) bad.push(p.name + ': nombre duplicado'); names.add(p.name);
    }
    push({ name: 'secuenciador (banco de frases)', peak: 0, ok: !bad.length, problems: bad });
  }
  {
    // codificador WAV: cabecera y tamaño (44 bytes + n·4 en 16-bit estéreo)
    const blob = encodeWav([new Float32Array(128)], [new Float32Array(128)], 44100);
    const okW = blob.size === 44 + 128 * 4 && blob.type === 'audio/wav';
    push({ name: 'codificador WAV', peak: 0, ok: okW, problems: okW ? [] : ['blob: ' + blob.size + ' ' + blob.type] });
  }
  {
    // exportador SFZ: kit mínimo por el camino real (2 renders offline →
    // recorte + normalización → WAVs + texto .sfz → zip). Estado por defecto:
    // filterEnvAmt=0 ⇒ 1 capa; rejilla A3..A4 ⇒ 2 samples.
    let r;
    try {
      loadState({});
      const kit = await makeSfzKit(structuredClone(engine.S), 'Selftest',
        { lo: 57, hi: 69, step: 12, hold: 0.3, maxDur: 1.2 });
      const regions = (kit.sfz.match(/<region>/g) || []).length;
      const okN = kit.samples.length === 2 && regions === 2 && kit.layers === 1;
      const okWav = kit.samples.every(s => s.bytes.length > 44 + 2000 &&
        s.bytes[0] === 0x52 && s.bytes[1] === 0x49 && s.bytes[2] === 0x46 && s.bytes[3] === 0x46);
      const okRef = kit.samples.every(s => kit.sfz.includes('sample=' + s.fname));
      const okRange = kit.sfz.includes('lokey=0') && kit.sfz.includes('hikey=127');
      const zip = new Uint8Array(await makeZip([
        { name: kit.slug + '.sfz', data: new TextEncoder().encode(kit.sfz) },
        ...kit.samples.map(s => ({ name: 'samples/' + s.fname, data: s.bytes })),
      ]).arrayBuffer());
      const okZip = zip[0] === 0x50 && zip[1] === 0x4b && zip[2] === 3 && zip[3] === 4;
      // pico del PCM del primer sample: ni silencio ni saturado (normaliza a −1 dB)
      const dvS = new DataView(kit.samples[0].bytes.buffer, kit.samples[0].bytes.byteOffset + 44);
      let pk = 0;
      for (let i = 0; i < (kit.samples[0].bytes.length - 44) / 2; i++) {
        const v = Math.abs(dvS.getInt16(i * 2, true)); if (v > pk) pk = v;
      }
      const okPk = pk > 327 && pk <= 32767;
      // capas de velocity MEDIDAS: un preset cuya velocity mueve la FM por la matriz (antes
      // salía con UNA capa: solo se miraba la env de filtro) da ≥ 2, con la suave subida a nivel
      const find = n => { for (const ps of Object.values(FACTORY)) if (ps[n]) return ps[n]; };
      loadState(find('E-piano DX (vel→FM)'));
      const vl = await velocityLayers(structuredClone(engine.S), 1.2);
      const okVel = vl.layers.length >= 2 && vl.layers[0].gain > 1;
      console.log('sfz capas: Reset Δ ' + kit.timbre.toFixed(1) + ' dB →', kit.layers, '· E-piano DX Δ ' + vl.timbre.toFixed(1), 'dB →', vl.layers.length, '(ganancia suave ×' + vl.layers[0].gain.toFixed(2) + ')');
      loadState({});
      const okS = okN && okWav && okRef && okRange && okZip && okPk && okVel;
      r = { name: 'exportador SFZ (render → sfz + zip · capas de velocity medidas)', peak: pk / 32767, ok: okS,
            problems: okS ? [] : ['n:' + okN + ' wav:' + okWav + ' ref:' + okRef +
                                  ' rango:' + okRange + ' zip:' + okZip + ' pico:' + okPk + ' capas vel:' + okVel + ' (' + vl.layers.length + ')'] };
    } catch (e) {
      r = { name: 'exportador SFZ (render → sfz + zip)', peak: 0, ok: false,
            problems: ['excepción: ' + ((e && e.message) || e)] };
    }
    push(r);
  }
  {
    // mapeo MIDI: conversión CC→valor (lineal y log) y zonas discretas
    const okM =
      Math.abs(ccToVal(PARAMS.cutoff, 1) - 20000) < 0.5 &&      // log: extremo alto
      Math.abs(ccToVal(PARAMS.cutoff, 0) - 20) < 0.01 &&        // log: extremo bajo
      Math.abs(ccToVal(PARAMS.detuneA, 0.5)) < 1e-9 &&          // lineal: centro de ±50
      zoneOf(['a', 'b', 'c'], 0) === 'a' && zoneOf(['a', 'b', 'c'], 0.34) === 'b' &&
      zoneOf(['a', 'b', 'c'], 1) === 'c';
    push({ name: 'mapeo MIDI (CC→valor y zonas)', peak: 0, ok: okM,
           problems: okM ? [] : ['ccToVal/zoneOf devuelven valores inesperados'] });
  }
  {
    // MIDI learn de punta a punta: ligar CC, mover control real (continuo y
    // por zonas), persistencia por aparato en localStorage y modo pickup
    const prevDev = getDevice();
    const K = 'subsdj.midimap.v1:selftest';
    localStorage.removeItem(K);
    setDevice('selftest');                        // mapa limpio (fábrica) para el aparato fake
    armLearn('reso'); learnCapture(33);
    applyCC(33, 1);
    const okBind = Math.abs(CONTROLS.reso.get() - 24) < 0.11;   // tope del rango (step 0.1)
    armLearn('waveA'); learnCapture(34);
    applyCC(34, 0.36);                            // zona 3 de 7 → 'sine' (7 ondas desde FM4: 0,36·7 = 2,5 → índice 2)
    const okZone = CONTROLS.waveA.get() === 'sine';
    const okFree = applyCC(99, 1) === false;      // CC sin ligar no se consume
    setDevice('selftest');                        // relee de localStorage: el binding sobrevive
    const okPersist = !!getMap().ccs[33] && getMap().ccs[33].id === 'reso' && !getMap().ccs[71];
    getMap().pickup = true;                       // pickup: lejos y sin cruzar NO salta…
    CONTROLS.levelB.set(0.5);
    armLearn('levelB'); learnCapture(35);
    applyCC(35, 0.9);
    const okHold = Math.abs(CONTROLS.levelB.get() - 0.5) < 1e-9;
    applyCC(35, 0.4);                             // …pero al cruzar 0.5 engancha
    const okCross = Math.abs(CONTROLS.levelB.get() - 0.4) < 1e-9;
    // un mapa guardado antes del mezclador (CC → 'mix') sigue moviendo su sucesor
    localStorage.setItem(K, JSON.stringify({ pickup: false, ccs: { 36: { id: 'mix', lo: 0, hi: 1 } } }));
    setDevice('selftest');
    const okRen = !!getMap().ccs[36] && getMap().ccs[36].id === 'levelB';
    localStorage.removeItem(K);
    setDevice(prevDev);                           // restaura el mapa real del usuario
    const okL = okBind && okZone && okFree && okPersist && okHold && okCross && okRen;
    push({ name: 'MIDI learn (ligar · zonas · persistencia · pickup · claves renombradas)', peak: 0, ok: okL,
           problems: okL ? [] : ['bind:' + okBind + ' zona:' + okZone + ' libre:' + okFree +
                                 ' persist:' + okPersist + ' pickup:' + okHold + '/' + okCross + ' mix→levelB:' + okRen] });
  }
  {
    // acciones MIDI sobre el banco: ‹ › por flanco de subida y program change
    const prevDev = getDevice();
    const K = 'subsdj.midimap.v1:selftest2';
    localStorage.removeItem(K);
    setDevice('selftest2');
    const sel = document.getElementById('presetSelect');
    const nav = navOptions(), n = nav.length;     // ‹ › y program change recorren la biblioteca sin el grupo ★ (duplica)
    const i0 = Math.max(0, nav.findIndex(o => o.value === sel.value));
    const at = i => nav[((i % n) + n) % n].value;
    armLearn('presetNext'); learnCapture(36);
    applyCC(36, 1);                               // pulsar (127) → siguiente preset
    const okStep = sel.value === at(i0 + 1);
    applyCC(36, 1);                               // mantenido: NO repite
    const okOnce = sel.value === at(i0 + 1);
    applyCC(36, 0); applyCC(36, 1);               // soltar y pulsar → avanza otra vez
    const okEdge = sel.value === at(i0 + 2);
    loadPresetIndex(i0 + 130);                    // program change: módulo del tamaño de la biblioteca
    const okPC = sel.value === at(i0 + 130);
    localStorage.removeItem(K);
    setDevice(prevDev);
    const okA = okStep && okOnce && okEdge && okPC;
    push({ name: 'MIDI acciones (banco: ‹ › y program change)', peak: 0, ok: okA,
           problems: okA ? [] : ['paso:' + okStep + ' única:' + okOnce + ' flanco:' + okEdge + ' pc:' + okPC] });
  }
  {
    // pantallas (panel fijo): cada pestaña es un .screen propio, en el orden de
    // SCREENS, y todo .panel vive dentro de uno. Cambiar de pestaña enseña
    // EXACTAMENTE su cuerpo (estilo computado), marca la pestaña y se recuerda;
    // los módulos compartidos (data-slot) pasan al hueco de la pantalla que lo
    // declara y se ven; la cabecera con los presets está en todas. NADA
    // RECORTADO: el instrumento mide lo que mide (1920 × 1000) y las bandas
    // ocultan lo que desborda, así que un mando de más quedaría escondido en
    // silencio — ni el instrumento ni ninguna banda pueden desbordar. La lista
    // de la pantalla Presets refleja el banco y un clic carga por el mismo
    // camino que el selector y queda marcado como actual.
    body.appendChild(el('st-cat', 'Pantallas'));
    const bodies = [...document.querySelectorAll('.screen')];
    const title = p => ([...(p.querySelector('h2')?.childNodes || [])].filter(n => n.nodeType === 3).map(n => n.textContent).join('') || p.id || '?').trim();   // sin LED ni «?»
    const probs = [];
    if (bodies.map(b => b.dataset.screenBody).join() !== SCREENS.join()) probs.push('cuerpos: ' + bodies.map(b => b.dataset.screenBody).join() + ' ≠ ' + SCREENS.join());
    const orphans = [...document.querySelectorAll('.panel')].filter(p => !p.closest('.screen')).map(title);
    if (orphans.length) probs.push('fuera de pantalla: ' + orphans.join(', '));
    const bar = document.getElementById('presetBar'), inst = document.getElementById('inst');
    const over = (e, tol = 1) => e.scrollWidth > e.clientWidth + tol || e.scrollHeight > e.clientHeight + tol;
    const before = currentScreen();
    for (const s of SCREENS) {
      showScreen(s);
      const shown = bodies.filter(b => getComputedStyle(b).display !== 'none').map(b => b.dataset.screenBody);
      if (shown.join() !== s) probs.push(s + ': se ven ' + (shown.join(', ') || 'ninguna'));
      if (localStorage.getItem('subsdj.screen.v1') !== s) probs.push(s + ': no se recuerda');
      if (!document.querySelector('#screenTabs button.active[data-screen="' + s + '"]')) probs.push(s + ': pestaña sin marcar');
      for (const m of document.querySelectorAll('[data-slot]')) {
        const host = document.querySelector('.screen[data-screen-body="' + s + '"] [data-slot-host="' + m.dataset.slot + '"]');
        if (host && (m.parentElement !== host || !m.offsetParent)) probs.push(s + ': «' + m.dataset.slot + '» no está en su hueco');
      }
      if (getComputedStyle(bar).display === 'none') probs.push(s + ': sin barra de presets');
      if (inst && over(inst)) probs.push(s + ': el instrumento desborda (' + inst.scrollWidth + '×' + inst.scrollHeight + ')');
      for (const b of document.querySelectorAll('.screen[data-screen-body="' + s + '"] .band'))
        if (over(b)) probs.push(s + ': banda ' + (b.id || '?') + ' recorta (' + b.scrollWidth + '×' + b.scrollHeight + ' en ' + b.clientWidth + '×' + b.clientHeight + ')');
    }
    showScreen('presets');
    const sel = document.getElementById('presetSelect');
    const items = [...document.querySelectorAll('#presetList .pl-item')];
    if (!items.length || items.length !== library.items().length) probs.push('lista: ' + items.length + ' ítems vs ' + library.items().length + ' en la biblioteca');
    const target = items.find(b => !b.classList.contains('esc') && b.dataset.id !== sel.value);   // un preset (las escenas cargan otra cosa)
    if (target) {
      target.click();
      const curs = document.querySelectorAll('#presetList .pl-item.cur');
      if (sel.value !== target.dataset.id || curs.length !== 1 || curs[0] !== target) probs.push('clic no carga/marca (' + sel.value + ')');
    }
    showScreen(before);
    push({ name: 'pantallas (panel fijo · huecos · memoria · nada recortado · lista de presets)', peak: 0, ok: !probs.length, problems: probs });
  }
  {
    // canvas: el tamaño en pantalla lo pone SOLO el CSS. fitCanvas pone el
    // backing store a tamaño × dpr × zoom; si la caja de un canvas tomara ese
    // backing store como ancho natural, cada redibujado lo agrandaría otro
    // ×dpr×zoom hasta reventar (pasó en una 4K al 150 %: zoom 1,3 × dpr 1,5;
    // aquí, con dpr 1 y zoom ≤ 1, no crece, por eso se prueba la REGLA y no el
    // síntoma): se triplica el backing store de cada canvas visible, en cada
    // pantalla, y su caja no puede moverse.
    const probs = [];
    const before = currentScreen();
    for (const s of SCREENS) {
      showScreen(s);
      for (const c of document.querySelectorAll('#inst canvas')) {
        if (!c.offsetParent) continue;
        const w0 = c.clientWidth, h0 = c.clientHeight, bw = c.width, bh = c.height;
        c.width = bw * 3 + 7; c.height = bh * 3 + 7;
        if (c.clientWidth !== w0 || c.clientHeight !== h0) probs.push(s + ': #' + c.id + ' ' + w0 + '×' + h0 + ' → ' + c.clientWidth + '×' + c.clientHeight);
        c.width = bw; c.height = bh;
      }
    }
    showScreen(before);   // dispara resize: los canvas se redibujan
    push({ name: 'canvas: el tamaño lo pone el CSS, no el backing store (sin bucle con dpr × zoom)', peak: 0, ok: !probs.length, problems: probs });
  }
  {
    // dependencias (ui/deps.js): lo que NO hace nada con la configuración
    // actual se apaga en su sitio, con su motivo. Cada regla apunta a algo que
    // existe (renombrar un h2 o un control la dejaría muda sin avisar; las de
    // la escena apuntan a knobs que nacen con las Partes) y unos casos de
    // muestra por el camino de los controles: cada uno parte de Reset, toca
    // lo suyo y mira el motivo (un trozo) o que esté vivo (null). Apagado no
    // es bloqueado: el control sigue tocable.
    const probs = [];
    for (const [what] of RULES) if (!/data-key/.test(what) && !depTargets(what).length) probs.push('regla sin destino: ' + what);
    const keep = snapshot(), C = CONTROLS;
    const off = what => { const t = depTargets(what)[0]; return t ? (t.dataset.off || null) : 'SIN DESTINO'; };
    const caso = (label, setup, checks) => {
      loadState({}); setup(); refreshDeps();
      for (const [what, want] of checks) {
        const got = off(what), ok = want === null ? got === null : !!(got && got.includes(want));
        if (!ok) probs.push(label + ': ' + what + ' → ' + (got || 'vivo') + ' (esperado ' + (want || 'vivo') + ')');
      }
    };
    caso('Reset', () => {}, [['sec:Osc A', null], ['sec:Osc B', 'nivel B'], ['pulseWidth', 'Cuadrada'], ['spread', 'Súper'],
      ['sec:FM', 'Seno'], ['sec:FM4', 'FM4'], ['sec:Tabla de ondas', 'Tabla'], ['sec:Editor de ondas', 'Tabla'],
      ['noiseColor', 'Ruido'], ['vocVowel', 'Mix a 0'], ['resMat', 'Mezcla a 0'], ['fa', 'Amount'], ['fenvMode', 'Amount'],
      ['hitGap', 'golpe'], ['pitchEnvDec', 'Amt'], ['monoTrig', 'Mono'], ['uniDetune', '1 voz'], ['cutLfoSpd', 'Level'], ['lfoFade', 'vibrato'],
      ['mx1dst', 'libre'], ['mx1amt', 'libre'], ['flSpd', 'Fl.Amount'], ['chSpd', 'Amount'], ['dlyTime', 'Amount'],
      ['bpm', 'tempo'], ['reverbSize', 'Mix'], ['shimInt', 'Mix'], ['arpGate', 'Off'], ['seqGate', 'Off'],
      ['#seqCanvas', 'Off'], ['sec:Tabla · secuencia', 'Tabla'], ['sec:Unison', null], ['levelB', null], ['cutoff', null]]);
    caso('Osc B a medias: suena el B (cuadrada)', () => C.levelB.set(0.5), [['sec:Osc B', null], ['pulseWidth', null], ['pwmLfoLvl', null], ['pwmLfoSpd', 'Level']]);
    caso('Solo B: el A se apaga', () => { C.levelA.set(0); C.levelB.set(1); }, [['sec:Osc A', 'nivel A'], ['sec:Osc B', null]]);
    caso('Solo Ring: suenan los dos (A×B)', () => { C.levelA.set(0); C.ring.set(1); }, [['sec:Osc A', null], ['sec:Osc B', null]]);
    caso('Seno sin índice', () => C.waveA.set('sine'), [['sec:FM', null], ['fmIndex', null], ['fmRatio', 'Index'], ['fmFb', 'Index']]);
    caso('Seno con índice', () => { C.waveA.set('sine'); C.fmIndex.set(2); }, [['fmRatio', null], ['fmFb', null]]);
    caso('Seno + env → FM índice', () => { C.waveA.set('sine'); C.mx1src.set('env'); C.mx1dst.set('fm'); C.mx1amt.set(0.5); },
      [['fmRatio', null], ['mx1dst', null], ['fenvMode', null], ['fa', 'Env amp']]);
    caso('Solo FM4: el Feedback sí', () => C.waveA.set('fm4'), [['sec:FM', null], ['fmRatio', 'Seno'], ['fmIndex', 'Seno'], ['fmFb', null], ['sec:FM4', null], ['fm4R2', null]]);
    caso('FM4 con el op 3 mudo', () => { C.waveA.set('fm4'); C.fm4L3.set(0); }, [['fm4R3', 'nivel 0'], ['fm4D3', 'nivel 0'], ['fm4V3', 'nivel 0'], ['fm4R2', null], ['fm4V2', null]]);
    caso('Mono', () => C.mode.set('mono'), [['monoTrig', null]]);
    caso('Tabla sin «usuario»', () => C.waveA.set('tabla'), [['sec:Tabla de ondas', null], ['sec:Editor de ondas', 'usuario'], ['sec:Tabla · secuencia', null], ['wsDiv', 'Off']]);
    caso('Tabla «usuario»', () => { C.waveA.set('tabla'); C.wtSet.set('usuario'); }, [['sec:Editor de ondas', null]]);
    caso('Súper', () => C.waveA.set('supersaw'), [['phaseA', 'Súper'], ['spread', null], ['sec:Unison', 'Súper']]);
    caso('Unison', () => C.uniVoices.set('3'), [['uniDetune', null]]);
    caso('Notch', () => C.filterType.set('notch'), [['morph', 'LP↔HP'], ['filterSlope', 'Notch']]);
    caso('BP', () => C.filterType.set('bp'), [['morph', 'LP↔HP'], ['filterSlope', null]]);
    caso('Env de filtro enlazada', () => C.filterEnvAmt.set(2000), [['fenvMode', null], ['fa', 'Env amp']]);
    caso('Env de filtro propia', () => { C.filterEnvAmt.set(2000); C.fenvMode.set('own'); }, [['fa', null], ['fr', null]]);
    caso('Vocal y resonador', () => { C.vocAmt.set(0.5); C.resAmt.set(0.5); }, [['vocVowel', null], ['vocAtk', null], ['resDecay', null]]);
    caso('Matriz a Wavetable sin tabla', () => { C.mx2src.set('lfoCut'); C.mx2dst.set('wt'); C.mx2amt.set(0.5); },
      [['mx2dst', 'Tabla'], ['mx2amt', 'Tabla'], ['cutLfoSpd', 'Level'], ['lfoPhase', 'ningún']]);
    caso('LFO crudo en la matriz', () => { C.mx2src.set('lfoCut'); C.mx2dst.set('pan'); C.mx2amt.set(0.5); },
      [['cutLfoSpd', null], ['cutLfoShape', null], ['lfoPhase', null], ['mx2dst', null]]);
    caso('Slot con fuente y cantidad 0', () => C.mx3src.set('vel'), [['mx3dst', 'cantidad 0'], ['mx3amt', null]]);
    caso('Deriva (voz)', () => { C.mx1src.set('drift'); C.mx1amt.set(0.3); }, [['mxDriftSpd', null]]);
    caso('Vibrato con fade', () => C.freqLfoLvl.set(20), [['freqLfoSpd', null], ['lfoFade', null], ['lfoPhase', null]]);
    caso('Delay libre', () => C.dlyAmt.set(0.3), [['dlyTime', null], ['dlyDamp', null], ['bpm', 'tempo']]);
    caso('Delay sincronizado', () => { C.dlyAmt.set(0.3); C.dlySync.set('1/4'); }, [['dlyTime', 'sincronizado'], ['bpm', null]]);
    caso('Arpegiador', () => C.arpMode.set('up'), [['arpGate', null], ['bpm', null]]);
    caso('Reverb con shimmer', () => { C.reverbMix.set(0.3); C.shimAmt.set(0.4); }, [['reverbSize', null], ['shimInt', null], ['#freezeBtn', null]]);
    caso('Flam', () => C.hits.set(3), [['hitGap', null]]);
    caso('Drive a 0', () => {}, [['driveAsym', 'Drive a 0'], ['driveChar', 'Drive a 0']]);
    caso('Drive plegado', () => { C.filterDrive.set(0.5); C.driveChar.set('plegado'); }, [['driveAsym', null], ['driveChar', null]]);
    caso('Matriz → Drive sin Drive', () => { C.mx1src.set('vel'); C.mx1dst.set('drive'); C.mx1amt.set(0.5); }, [['mx1dst', 'knob Drive'], ['mx1amt', 'knob Drive']]);
    caso('Matriz → Nivel B enciende el B', () => { C.mx1src.set('lfoCut'); C.mx1dst.set('lvlB'); C.mx1amt.set(0.5); }, [['sec:Osc B', null], ['mx1amt', null]]);
    caso('Matriz → Material sin Resonador', () => { C.mx1src.set('vel'); C.mx1dst.set('resMat'); C.mx1amt.set(0.5); }, [['mx1amt', 'Mezcla a 0']]);
    loadState({}); refreshDeps();
    const fr = depTargets('fmRatio')[0];
    if (!fr.closest('.dep-off')) probs.push('Reset: FM no aparece atenuado (.dep-off)');
    if (getComputedStyle(fr).pointerEvents === 'none' || getComputedStyle(fr.querySelector('.knob')).pointerEvents === 'none') probs.push('un control apagado no se puede tocar');
    loadState(keep); refreshDeps();
    push({ name: 'dependencias: lo que no hace nada se apaga en su sitio, con su motivo (' + RULES.length + ' reglas)', peak: 0, ok: !probs.length, problems: probs.slice(0, 14) });
  }
  {
    // grafo del algoritmo FM4 (ui/fm4Graph.js): su tabla es COPIA de la del
    // worklet (no se puede importar un worklet desde la página) — si se
    // separan, el dibujo mentiría sobre el sonido. Y la colocación se lee como
    // en los Yamaha: cada operador en su sitio, portadoras en la fila de abajo,
    // cada modulador por encima de a quién modula. En la página, el grafo
    // sigue al selector (alg 5 = un modulador para tres portadoras).
    const probs = [];
    try {
      const src = await (await fetch('js/engine/worklets/pulse-processor.js', { cache: 'no-store' })).text();
      const m = /const FM4_ALGS = (\[[\s\S]*?\n\]);/.exec(src);
      const wk = m ? new Function('return ' + m[1])() : null;
      if (!wk) probs.push('no encuentro FM4_ALGS en el worklet');
      else if (JSON.stringify(wk) !== JSON.stringify(FM4_ALGS)) probs.push('la tabla del grafo y la del worklet difieren');
    } catch (e2) { probs.push('worklet: ' + ((e2 && e2.message) || e2)); }
    FM4_ALGS.forEach((alg, i) => {
      const pos = fm4Layout(alg), n = 'alg ' + (i + 1) + ': ';
      if (new Set(pos.map(p => p.col + ',' + p.row)).size !== 4) probs.push(n + 'operadores uno encima de otro');
      alg.car.forEach(c => { if (pos[c].row !== 0) probs.push(n + 'la portadora ' + (c + 1) + ' no está abajo'); });
      alg.mods.forEach((ms, t) => ms.forEach(mm => { if (!(pos[mm].row > pos[t].row)) probs.push(n + 'el ' + (mm + 1) + ' no está encima del ' + (t + 1)); }));
      if (/NaN|Infinity/.test(fm4Svg(i))) probs.push(n + 'coordenadas no finitas');
    });
    const keep = snapshot();
    loadState({ waveA: 'fm4', fm4Alg: '4' });
    const g = document.querySelector('#fm4Graph svg');
    if (!g || g.querySelectorAll('g.op.car').length !== 3) probs.push('el grafo de la página no sigue al selector (alg 5 → 3 portadoras)');
    loadState({ waveA: 'fm4', fmFb: 0.5 });
    if (!document.querySelector('#fm4Graph path.fb.on')) probs.push('el lazo de feedback no se enciende con Feedback > 0');
    loadState(keep);
    push({ name: 'grafo FM4 a la Yamaha: misma tabla que el worklet, portadoras abajo, moduladores encima', peak: 0, ok: !probs.length, problems: probs });
  }
  {
    // pantalla Salida (ui/display.js): lo que no cabe encoge la letra hasta su
    // mínimo y, si ni así, se desplaza; el nombre del parámetro no desaparece
    // nunca (antes el title entero de un botón se comía la caja). Un seg enseña
    // su valor CORTO y lo que significa va en la línea de arriba.
    const probs = [], keep = snapshot(), scr = currentScreen();
    showScreen('diseno');
    const v = document.getElementById('dispVal'), who = document.getElementById('dispWho'), side = document.getElementById('dispWhy');
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    document.dispatchEvent(new CustomEvent('preset-loaded', { detail: { name: 'Pad de ejecución (rueda, aftertouch, pedal) — un nombre que no cabe ni encogido' } }));
    await frame();
    if (!v.clientWidth) probs.push('la pantalla Salida no se ve en Diseño');
    else {
      if (!v.classList.contains('scroll')) probs.push('un valor que no cabe ni a la letra mínima no se desplaza');
      if (!(who.clientWidth > 20)) probs.push('el nombre del parámetro desaparece con un valor largo');
    }
    const b = document.querySelector('#fm4AlgSel button[data-alg="2"]');
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    await frame();
    if (v.textContent !== '3 · 2·3·4→1') probs.push('algoritmo FM4: valor «' + v.textContent + '» (esperado el corto «3 · 2·3·4→1»)');
    if (v.clientWidth && v.classList.contains('scroll')) probs.push('el valor corto del algoritmo no cabe');
    if (!side.textContent) probs.push('la línea de arriba no dice nada (ni qué significa ni por qué no hace nada)');
    loadState(keep); showScreen(scr);
    push({ name: 'pantalla Salida: lo largo encoge o se desplaza, el parámetro siempre se ve', peak: 0, ok: !probs.length, problems: probs });
  }
  {
    // presupuesto de CPU de voces (AudioEngine.VOICE_BUDGET): COMÚN a los motores
    // de un mismo contexto — las 4 partes de una escena comparten hilo de audio.
    // Offline no actúa (no hay plazos), así que se simula el directo sin
    // renderizar: escena de 4 partes con offline = false. La parte 1 MANTIENE 8
    // notas; la 2 toca 10 y las suelta (colas); la 3 toca de más. Nunca se pasa
    // del tope; antes que nada caen las colas, la más vieja primero, de cualquier
    // parte; luego, la voz pulsada más vieja de la parte que pide la nota — nunca
    // una nota sostenida de otra parte. Y offline no hay tope.
    const probs = [];
    try {
      const ctx = new OfflineAudioContext(2, SR, SR);
      const st = { waveA: 'sawtooth', waveB: 'sawtooth', levelA: 0.5, levelB: 0.5, vocAmt: 0.6 };
      const sc = await createScene(ctx, [st, st, st, st]);
      const E = sc.parts.map(p => p.engine);
      E.forEach(e => { e.offline = false; });
      const cost = Voice.cost(E[0].S);
      const live = v => !v.disposed && !v._going;
      const used = () => E.reduce((a, e) => a + e.engineCost() + [...e.voices.values(), ...e.tails].filter(live).reduce((b, v) => b + v.cost, 0), 0);   // como el motor: coste fijo de cada parte + sus voces
      let maxUsed = 0;
      const on = (e, id) => { e.noteOn(id, 220, 0.8); maxUsed = Math.max(maxUsed, used()); };
      for (let i = 0; i < 8; i++) on(E[0], 'a' + i);                        // parte 1: mantiene 8
      const held0 = [...E[0].voices.values()];
      for (let i = 0; i < 10; i++) on(E[1], 'b' + i);                       // parte 2: toca 10…
      for (let i = 0; i < 10; i++) E[1].noteOff('b' + i);                   // …y las suelta: 10 colas
      const tails1 = [...E[1].tails];
      const nRoom = Math.floor((VOICE_BUDGET - used()) / cost + 1e-9);      // lo que cabe sin tocar nada
      for (let i = 0; i < nRoom + 3; i++) on(E[2], 'c' + i);                // parte 3: tres de más → caen 3 colas
      const gone1 = tails1.filter(v => v._going).length;
      if (gone1 !== 3) probs.push('al pasarse 3 voces caen ' + gone1 + ' colas (esperado 3)');
      if (!tails1.slice(0, gone1).every(v => v._going)) probs.push('no cayeron primero las colas más viejas');
      if (held0.some(v => v._going || v.disposed) || E[0].voices.size !== 8) probs.push('colas: se tocó una nota sostenida de otra parte');
      for (const e of E) { e.offline = true; e.allNotesOff(); }
      // sin colas que fundir: roba a la parte que PIDE la nota, nunca a otra
      const ctxB = new OfflineAudioContext(2, SR, SR);
      const caro = { waveA: 'fm4', waveB: 'fm4', levelA: 0.5, levelB: 0.5, vocAmt: 0.6 };
      const scB = await createScene(ctxB, [st, st, caro, st]), EB = scB.parts.map(p => p.engine);
      EB.forEach(e => { e.offline = false; });
      const usedB = () => EB.reduce((a, e) => a + e.engineCost() + [...e.voices.values(), ...e.tails].filter(live).reduce((b, v) => b + v.cost, 0), 0);
      for (let i = 0; i < 8; i++) EB[0].noteOn('a' + i, 220, 0.8);
      const heldB = [...EB[0].voices.values()];
      for (let i = 0; i < 10; i++) { EB[2].noteOn('c' + i, 220, 0.8); maxUsed = Math.max(maxUsed, usedB()); }
      const robadas3 = [...EB[2].tails].filter(v => v._going).length;
      if (!(robadas3 > 0)) probs.push('sin colas, la parte que pide no cedió su voz más vieja (coste ' + Voice.cost(EB[2].S).toFixed(2) + ')');
      if (heldB.some(v => v._going || v.disposed) || EB[0].voices.size !== 8) probs.push('sin colas: se robó una nota sostenida de OTRA parte');
      if (maxUsed > VOICE_BUDGET + 1e-9) probs.push('el uso llegó a ' + maxUsed.toFixed(2) + ' > ' + VOICE_BUDGET);
      for (const e of EB) { e.offline = true; e.allNotesOff(); }
      // offline: sin tope
      const ctx2 = new OfflineAudioContext(2, SR, SR), e2 = new AudioEngine(); e2.S = structuredClone(E[0].S); await e2.init(ctx2);
      const n = Math.ceil(VOICE_BUDGET / cost) + 5;
      for (let i = 0; i < Math.min(n, 10); i++) e2.noteOn('o' + i, 220, 0.8);
      for (let i = 0; i < 10; i++) e2.noteOff('o' + i);
      for (let i = 0; i < 10; i++) e2.noteOn('p' + i, 220, 0.8);
      if ([...e2.tails].some(v => v._going)) probs.push('offline también recorta colas');
      console.log('presupuesto: voz ' + cost.toFixed(2) + ' · tope ' + VOICE_BUDGET + ' · uso máx ' + maxUsed.toFixed(2) + ' · colas fundidas ' + tails1.filter(v => v._going).length + '/10 · robadas a la parte que pide ' + robadas3);
    } catch (e) { probs.push('excepción: ' + (e.message || e)); }
    push({ name: 'presupuesto de voces común a las partes (colas primero; nunca la nota sostenida de otra parte; offline sin tope)', peak: 0, ok: !probs.length, problems: probs });
  }

  {
    // piel (10): la ÚNICA fuente de color es el bloque de tokens de style.css
    // (:root y [data-theme]). Fuera de él, en los canvas de js/ui (que leen
    // los tokens por theme.js) y en index.html no puede haber hex/rgb/hsl
    // literales, salvo negro/blanco con alfa (sombra y brillo: relieve, no
    // color). Así un tema nuevo se hace redefiniendo tokens y nada queda a
    // fuego. Los ficheros se leen por HTTP tal como los sirve el runner; los
    // js son los que importa main.js de ui/ (menos theme.js, que los sirve).
    body.appendChild(el('st-cat', 'Piel'));
    const probs = [];
    const LIT = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(\s*\d[^)]*\)/gi;   // literal: hex, o rgb()/hsl() que empieza por dígito
    const shade = s => /^rgba?\(\s*(?:0\s*,\s*0\s*,\s*0|255\s*,\s*255\s*,\s*255)\s*[,/]/.test(s);   // negro/blanco con alfa
    const lineOf = (txt, i) => txt.slice(0, i).split('\n').length;
    const blank = m => m.replace(/[^\n]/g, ' ');                       // borra texto sin mover las líneas
    const tokenBlock = sel => sel.split(',').every(s => /^\s*(:root|html)?(\[data-theme[^\]]*\])?\s*$/.test(s) && s.trim());
    const found = (label, txt, from, off) => { let h; LIT.lastIndex = 0;
      while ((h = LIT.exec(from))) if (!shade(h[0])) probs.push(label + ':' + lineOf(txt, off + h.index) + ' ' + h[0]); };
    try {
      const get = async f => (await fetch(f + '?t=' + Date.now())).text();
      const css = (await get('css/style.css')).replace(/\/\*[\s\S]*?\*\//g, blank);
      const re = /([^{}]+)\{([^{}]*)\}/g; let m;                        // bloque = selector { declaraciones }
      while ((m = re.exec(css))) if (!tokenBlock(m[1].trim())) found('style.css', css, m[2], m.index + m[1].length + 1);
      const main = await get('js/main.js');
      const files = [...main.matchAll(/from '\.\/ui\/(\w+)\.js'/g)].map(x => x[1]).filter(n => n !== 'theme');
      if (!files.length) probs.push('main.js sin imports de ui/');
      for (const n of files) {
        const js = (await get('js/ui/' + n + '.js')).replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);
        found(n + '.js', js, js, 0);
      }
      const html = (await get('index.html')).replace(/<!--[\s\S]*?-->/g, blank);
      found('index.html', html, html, 0);
    } catch (e) { probs.push('lectura: ' + e.message); }
    push({ name: 'piel: tokens (color solo en :root/[data-theme]; canvas por theme.js)', peak: 0, ok: !probs.length, problems: probs.slice(0, 12) });
  }
  {
    // piel (10): el knob no dibuja, PUBLICA. knobs.js pone --pos (0..1) en el
    // .knob y el CSS gira el portador .ind con él (−135° + pos·270°); los knobs
    // log publican la posición, no el valor; los de cantidad (act) a 0 llevan
    // .off y su indicador pasa a --edge-hi. Sobre knobs reales visibles; se restauran.
    const probs = [];
    const byCfg = f => [...document.querySelectorAll('.knob[data-knob]')].find(k => k.offsetParent && PARAMS[k.dataset.knob] && CONTROLS[k.dataset.knob] && f(PARAMS[k.dataset.knob]));
    const lin = byCfg(c => !c.log && !c.act), lg = byCfg(c => c.log), act = byCfg(c => c.act);
    const pos = k => +k.style.getPropertyValue('--pos');
    const angle = k => { const m = getComputedStyle(k.querySelector('.ind')).transform.match(/matrix\(([^)]+)\)/); if (!m) return NaN;
      const [a, b] = m[1].split(',').map(Number); return Math.atan2(b, a) * 180 / Math.PI; };
    const near = (x, y, tol) => Math.abs(x - y) <= tol;
    if (!lin || !lg || !act) probs.push('faltan knobs de muestra (lineal/log/act visibles)');
    else {
      const test = (k, label, v, want) => { CONTROLS[k.dataset.knob].set(v); if (!near(pos(k), want, 1e-3)) probs.push(label + ': --pos ' + pos(k) + ' ≠ ' + want.toFixed(3)); return angle(k); };
      for (const [k, label] of [[lin, 'lineal ' + lin.dataset.knob], [lg, 'log ' + lg.dataset.knob]]) {
        const cfg = PARAMS[k.dataset.knob], keep = CONTROLS[k.dataset.knob].get();
        const a0 = test(k, label + ' min', cfg.min, 0), a1 = test(k, label + ' max', cfg.max, 1);
        if (!near(a0, -135, 0.5) || !near(a1, 135, 0.5)) probs.push(label + ': giro ' + a0.toFixed(1) + '° / ' + a1.toFixed(1) + '° (esperado −135 / 135)');
        test(k, label + ' def', cfg.def, cfg.log ? valToPos(cfg, cfg.def) : (cfg.def - cfg.min) / (cfg.max - cfg.min));
        CONTROLS[k.dataset.knob].set(keep);
      }
      const name = act.dataset.knob, keep = CONTROLS[name].get(), edgeHi = getComputedStyle(document.documentElement).getPropertyValue('--edge-hi').trim();
      CONTROLS[name].set(0);
      const ind0 = getComputedStyle(act).getPropertyValue('--knob-ind').trim();
      if (!act.classList.contains('off')) probs.push('act ' + name + ' a 0 sin .off');
      if (ind0 !== edgeHi) probs.push('act ' + name + ' a 0: indicador ' + ind0 + ' ≠ ' + edgeHi);
      CONTROLS[name].set(PARAMS[name].max);
      if (act.classList.contains('off')) probs.push('act ' + name + ' al máximo sigue .off');
      CONTROLS[name].set(keep);
    }
    const sl = document.getElementById('s_a');                        // el slider publica igual (sliders.js)
    if (!sl || !CONTROLS.a) probs.push('sin slider de muestra (s_a)');
    else {
      const keep = CONTROLS.a.get(), sp = () => +sl.style.getPropertyValue('--pos');
      CONTROLS.a.set(PARAMS.a.min); if (!near(sp(), 0, 1e-3)) probs.push('slider a min: --pos ' + sp());
      CONTROLS.a.set(PARAMS.a.max); if (!near(sp(), 1, 1e-3)) probs.push('slider a max: --pos ' + sp());
      CONTROLS.a.set(keep);
    }
    push({ name: 'piel: knob y slider publican --pos; el CSS gira y apaga el indicador', peak: 0, ok: !probs.length, problems: probs });
  }
  {
    // piel (10): selector de tema. Un tema es un bloque `:root[data-theme="id"]`
    // con --theme-name; el :root base es el tema por defecto (--theme-id).
    // theme.js lee las hojas para llenar el <select>: añadir un tema es añadir
    // CSS. Se inyecta un tema de prueba, se elige (por API y por el <select>),
    // se mira que cambie el token computado y el que theme.js sirve a los
    // canvas, que se recuerde y que avise (theme-changed); se restaura todo.
    const probs = [];
    const html = document.documentElement, before = currentTheme(), sel = document.getElementById('themeSel');
    let savedLS = null; try { savedLS = localStorage.getItem('subsdj.theme.v1'); } catch { /* sin persistencia */ }
    const st = document.createElement('style');
    st.textContent = ':root[data-theme="st-prueba"]{--theme-name:"Prueba";--accent:rgb(18 52 86);}';
    document.head.appendChild(st);
    try {
      const themes = listThemes(), base = themes.find(t => t.base), test = themes.find(t => t.id === 'st-prueba');
      if (!base || !base.name) probs.push('sin tema base (:root con --theme-id / --theme-name)');
      if (!test || test.name !== 'Prueba') probs.push('el tema inyectado no aparece en listThemes()');
      if (!sel) probs.push('sin <select id="themeSel">');
      else if (sel.options.length < themes.length - 1) probs.push('el <select> tiene ' + sel.options.length + ' opciones para ' + (themes.length - 1) + ' temas');
      let fired = 0; const onT = e => { if (e.detail.theme === 'st-prueba') fired++; };
      document.addEventListener('theme-changed', onT);
      const accent0 = getComputedStyle(html).getPropertyValue('--accent').trim();
      setTheme('st-prueba');
      const accent1 = getComputedStyle(html).getPropertyValue('--accent').trim();
      if (html.dataset.theme !== 'st-prueba') probs.push('data-theme no puesto');
      if (accent1 === accent0 || !/18/.test(accent1)) probs.push('--accent computado no cambió: ' + accent1);
      if (token('--accent') !== '#123456') probs.push('theme.js sirve ' + token('--accent') + ' ≠ #123456 (caché sin vaciar)');
      if (!fired) probs.push('sin evento theme-changed');
      if (localStorage.getItem('subsdj.theme.v1') !== 'st-prueba') probs.push('no se recuerda');
      document.removeEventListener('theme-changed', onT);
      if (sel && base) {                                  // por el camino del usuario: elegir en el <select>
        if (sel.value !== 'st-prueba') probs.push('el <select> no refleja el tema (' + sel.value + ')');
        sel.value = base.id; sel.dispatchEvent(new Event('change'));
        if (html.dataset.theme) probs.push('elegir el base en el <select> deja data-theme=' + html.dataset.theme);
        if (getComputedStyle(html).getPropertyValue('--accent').trim() !== accent0) probs.push('el base no devuelve --accent');
        if (localStorage.getItem('subsdj.theme.v1') !== base.id) probs.push('el <select> no recuerda el base');
      }
      setTheme('no-existe');
      if (html.dataset.theme) probs.push('un id desconocido no cae al base');
    } catch (e) { probs.push('error: ' + e.message); }
    st.remove();
    setTheme(before, { remember: false });
    try { if (savedLS === null) localStorage.removeItem('subsdj.theme.v1'); else localStorage.setItem('subsdj.theme.v1', savedLS); } catch { /* sin persistencia */ }
    push({ name: 'piel: selector de tema (hojas → <select>, token computado y servido, memoria, evento)', peak: 0, ok: !probs.length, problems: probs });
  }

  {
    // biblioteca (13b), con un almacenamiento falso (la del usuario no se toca):
    // siembra de fábrica + usuario v1 migrado; resembrar no duplica; borrar de
    // fábrica y «traer» lo repone en SU sección; renombrado/retocado no vuelve
    // a entrar; secciones (crear, renombrar, mover con orden, reordenar,
    // borrar); favoritos; búsqueda sin acentos; exportar → importar en otra
    // biblioteca (ida y vuelta exacta, repetir no duplica); banco v2 y escena
    // sueltos; persistencia; y los ficheros del repo por fetch (dos veces).
    body.appendChild(el('st-cat', 'Biblioteca'));
    const probs = [];
    const mkStore = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; };
    const store = mkStore();
    const L = new Library({ key: 'subsdj.biblioteca.selftest', storage: store });
    const nueva = L.load({ usuario: { 'Mío 1': { cutoff: 0.5, reso: 3 } } });
    const nFab = Object.values(FACTORY).reduce((a, c) => a + Object.keys(c).length, 0);
    if (!nueva) probs.push('load no la vio nueva');
    if (L.presets().length !== nFab + 1) probs.push('siembra: ' + L.presets().length + ' ≠ ' + (nFab + 1));
    if (L.secciones().map(s => s.nombre).join('|') !== Object.keys(FACTORY).join('|') + '|' + SEC_MIOS) probs.push('secciones: ' + L.secciones().map(s => s.nombre).join('|'));
    const mio = L.presets().find(p => p.nombre === 'Mío 1');
    if (!mio || !(mio.datos.cutoff > 1) || mio.datos.reso !== 3) probs.push('usuario v1 no migrado');
    if (L.sembrarFabrica() !== 0) probs.push('resembrar fábrica duplica');
    const acid = L.presets().find(p => p.nombre === 'Ácido 303'), secAcid = acid && acid.seccion;
    L.borrar(acid.id);
    if (L.presets().some(p => p.nombre === 'Ácido 303')) probs.push('borrar no borra');
    if (L.sembrarFabrica() !== 1) probs.push('traer de fábrica no repone exactamente 1');
    const acid2 = L.presets().find(p => p.nombre === 'Ácido 303');
    if (!acid2 || acid2.seccion !== secAcid) probs.push('repuesto fuera de su sección');
    L.renombrar(acid2.id, 'Ácido mío'); L.actualizar(mio.id, { cutoff: 999 });
    if (L.sembrarFabrica() !== 0) probs.push('renombrado o retocado se duplica al traer');
    const sT = L.crearSeccion('Prueba'); L.renombrarSeccion(sT, 'Prueba 2');
    if (!L.seccion(sT) || L.seccion(sT).nombre !== 'Prueba 2') probs.push('renombrar sección');
    const [a, b, c] = L.presets().slice(0, 3);
    L.mover(a.id, sT); L.mover(b.id, sT); L.mover(c.id, sT, a.id);          // c antes de a → c, a, b
    if (L.items(sT).map(i => i.id).join() !== [c.id, a.id, b.id].join()) probs.push('mover/orden: ' + L.items(sT).map(i => i.nombre).join(','));
    L.moverSeccion(sT, -1);
    const secs = L.secciones(); if (secs[secs.length - 2].id !== sT) probs.push('reordenar sección');
    L.fav(a.id); if (L.favoritos().length !== 1 || !L.item(a.id).fav) probs.push('favorito');
    L.fav(a.id); if (L.favoritos().length !== 0) probs.push('quitar favorito');
    if (!L.buscar('acido').some(i => i.id === acid2.id) || L.buscar('ACIDO MIO').length !== 1) probs.push('búsqueda sin acentos');
    const huella = X => X.secciones().map(s => s.nombre + ':' + X.items(s.id).map(i => i.nombre + (i.fav ? '*' : '') + '/' + i.tipo).join(',')).join('|');
    const json = JSON.parse(JSON.stringify(L.exportar()));
    const M = new Library({ key: 'x', storage: mkStore() }); M.load({ semilla: false });
    const r1 = M.importar(json), r2 = M.importar(json);
    if (r1.tipo !== 'biblioteca' || r1.n !== L.items().length || r2.n !== 0) probs.push('import ida y vuelta: ' + r1.n + '/' + L.items().length + ', repetido ' + r2.n);
    if (huella(M) !== huella(L)) probs.push('contenido tras importar');
    const rb = M.importar({ formato: 'subsdj-presets-v2', presets: { 'Nuevo': { cutoff: 500 }, 'Mío 1': { cutoff: 999 } } });   // «Mío 1» ya está igual
    if (rb.tipo !== 'banco' || rb.n !== 1 || !M.seccionPorNombre(SEC_IMPORT)) probs.push('importar banco v2: ' + rb.n);
    const re = M.importar({ formato: 'subsdj-escena-v1', nombre: 'Esc', partes: [] });
    const secE = M.seccionPorNombre(SEC_ESCENAS);
    if (re.tipo !== 'escena' || re.n !== 1 || !secE || M.items(secE.id)[0].tipo !== 'escena') probs.push('importar escena');
    const sP = M.seccionPorNombre('Prueba 2');
    if (M.borrarSeccion(sP.id) !== 3 || M.seccionPorNombre('Prueba 2')) probs.push('borrar sección con contenido');
    const L2 = new Library({ key: 'subsdj.biblioteca.selftest', storage: store }); L2.load();
    if (huella(L2) !== huella(L)) probs.push('no persiste');
    const f1 = await L.sembrarFicheros(), f2 = await L.sembrarFicheros();
    const sEsc = L.seccionPorNombre(SEC_ESCENAS), esc = sEsc ? L.items(sEsc.id) : [];
    if (!(f1.n > 100) || f2.n !== 0 || f1.errores.length || esc.length !== ESCENAS_REPO.length || esc.some(i => i.tipo !== 'escena'))
      probs.push('ficheros: ' + f1.n + '/' + f2.n + ' errores ' + f1.errores.join(',') + ' escenas ' + esc.length);
    console.log('biblioteca: fábrica ' + nFab + ' · repo ' + f1.n + ' · secciones ' + L.secciones().length + ' · ítems ' + L.items().length);
    push({ name: 'biblioteca (siembra · borrar/traer · secciones · mover · ★ · buscar · export/import · ficheros)', peak: 0, ok: !probs.length, problems: probs });
  }

  {
    // matriz de modulación: dos renders A/B por el camino real.
    // B1: env→amp a −1 debe ATENUAR claramente frente al render base (la ruta
    //     suena de verdad). B2: cutoff modulado a tope negativo NUNCA silencia
    //     (va por el detune del filtro, exponencial: el 0 Hz es inalcanzable).
    body.appendChild(el('st-cat', 'Matriz'));
    let r;
    try {
      loadState({});
      const rA = await renderState(structuredClone(engine.S));
      loadState({ mx1src: 'env', mx1dst: 'amp', mx1amt: -1 });
      const rB1 = await renderState(structuredClone(engine.S));
      loadState({ mx1src: 'lfoCut', mx1dst: 'cutoff', mx1amt: -1, cutLfoSpd: 3 });
      const rB2 = await renderState(structuredClone(engine.S));
      const probs = [];
      if (rB1.bad || rB2.bad) probs.push('NaN/Inf en renders con matriz');
      if (!(rB1.peak > SILENCE * 0.2 && rB1.peak < rA.peak * 0.75))
        probs.push('env→amp −1 no atenúa (base ' + dB(rA.peak) + ' vs ' + dB(rB1.peak) + ')');
      if (!(rB2.peak > SILENCE))
        probs.push('cutoff a −1 silenció el render (imposible por diseño: ' + dB(rB2.peak) + ')');
      r = { name: 'matriz (env→amp atenúa · cutoff nunca llega a 0 Hz)', peak: rB2.peak, ok: !probs.length, problems: probs };
    } catch (e) {
      r = { name: 'matriz (env→amp atenúa · cutoff nunca llega a 0 Hz)', peak: 0, ok: false,
            problems: ['excepción: ' + ((e && e.message) || e)] };
    }
    push(r);
  }

  {
    // tabla de ondas: morph 0 (frame seno) y morph 1 (frame pulso) deben dar
    // renders CLARAMENTE distintos y limpios. Determinista: la copia 0 del
    // unison conserva la fase configurada y el estado base no lleva random.
    body.appendChild(el('st-cat', 'Tabla de ondas'));
    let r;
    try {
      loadState({ waveA: 'tabla', levelA: 1, levelB: 0, wtPos: 0 });
      const bA = await renderBuf(structuredClone(engine.S));
      loadState({ waveA: 'tabla', levelA: 1, levelB: 0, wtPos: 1 });
      const bB = await renderBuf(structuredClone(engine.S));
      const aA = analyze(bA), aB = analyze(bB);
      const cA = bA.getChannelData(0), cB = bB.getChannelData(0);
      let d = 0, en = 0;
      for (let i = 0; i < cA.length; i += 16) { const x = cA[i] - cB[i]; d += x * x; en += cA[i] * cA[i]; }
      const diff = Math.sqrt(d / Math.max(1e-12, en));
      const probs = [];
      if (aA.bad || aB.bad) probs.push('NaN/Inf');
      if (aA.peak <= SILENCE || aB.peak <= SILENCE) probs.push('silencio (' + dB(aA.peak) + ' / ' + dB(aB.peak) + ')');
      if (aA.peak > 1 || aB.peak > 1) probs.push('clipping');
      if (!(diff > 0.3)) probs.push('morph 0 vs 1 apenas difiere (diff ' + diff.toFixed(3) + ')');
      r = { name: 'tabla de ondas (morph 0 ≠ 1, render limpio)', peak: aB.peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'tabla de ondas (morph 0 ≠ 1, render limpio)', peak: 0, ok: false,
            problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // tabla limpia (Roadmap 7.0 · 0.3): el oscilador «Tabla» solo, en un frame de
    // banda completa (el 4 de 'analógica': sierra + cuadrada, 512 armónicos), a
    // f0 = k·SR/N: cada armónico cae EXACTO en un bin múltiplo de k (sin ventana
    // ni fugas) y todo lo demás es error de la lectura (interpolación, aliasing).
    // Energía fuera de los armónicos bajo la fundamental: con lineal y tablas 4×
    // era −49 dB en Do2 y −43 en Do4; con Hermite y tablas 8×, −76 o menos.
    body.appendChild(el('st-cat', 'Tabla limpia'));
    const NAME = 'tabla limpia (energía entre armónicos < −65 dB en Do2, Do4 y Do6)';
    let r;
    try {
      const N = 32768, probs = [], suelos = [];
      const fft = (re, im) => {
        const n = re.length;
        for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
        for (let len = 2; len <= n; len <<= 1) {
          const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
          for (let i = 0; i < n; i += len) { let cr = 1, ci = 0;
            for (let q = 0; q < len / 2; q++) { const p = i + q, s = p + len / 2, tr = re[s] * cr - im[s] * ci, ti = re[s] * ci + im[s] * cr;
              re[s] = re[p] - tr; im[s] = im[p] - ti; re[p] += tr; im[p] += ti; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
        }
      };
      for (const [nota, k] of [['Do2', 49], ['Do4', 194], ['Do6', 778]]) {
        const ctx = new OfflineAudioContext(1, 4096 + N, SR);
        await loadWorklets(ctx);
        const node = new AudioWorkletNode(ctx, 'pulse-processor', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
          processorOptions: { type: 'tabla', octaves: 1, wt: getWtSet('analógica') } });
        node.parameters.get('frequency').value = k * SR / N;
        node.parameters.get('wtPos').value = 4 / 7;
        node.connect(ctx.destination);
        const d = (await ctx.startRendering()).getChannelData(0);
        const re = Float64Array.from(d.subarray(4096, 4096 + N)), im = new Float64Array(N);
        fft(re, im);
        const P = b => re[b] * re[b] + im[b] * im[b];
        let inh = 0; for (let b = 1; b <= Math.floor(20000 * N / SR); b++) if (b % k) inh += P(b);
        const suelo = 10 * Math.log10(inh / P(k) + 1e-30);
        suelos.push(nota + ' ' + suelo.toFixed(1) + ' dB');
        if (!(suelo < -65)) probs.push(nota + ': ' + suelo.toFixed(1) + ' dB entre armónicos');
      }
      console.log('tabla limpia: ' + suelos.join(' · '));
      r = { name: NAME, peak: 0, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  // Render de una nota a f0 = SR/336 (131,25 Hz: un periodo = 336 muestras) y su
  // espectro EXACTO en una ventana de 60 periodos (de 0,4 s en adelante): cada
  // armónico cae en su bin y la media de la ventana es la continua de verdad.
  const F336 = SR / 336, WIN336 = 336 * 60;
  const renderF336 = async (state, vel = 1, mult = 1) => {
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * 1.2), SR);
    const eng = new AudioEngine(); eng.S = structuredClone(state);
    await eng.init(ctx);
    eng.noteOn('t', F336 * mult, vel);
    ctx.suspend(1.0).then(() => { eng.noteOff('t'); ctx.resume(); });
    return (await ctx.startRendering()).getChannelData(0).slice(Math.round(0.4 * SR), Math.round(0.4 * SR) + WIN336);
  };
  const harm336 = (d, k) => { let re = 0, im = 0; for (let i = 0; i < d.length; i++) { const a = 2 * Math.PI * k * 60 * i / d.length; re += d[i] * Math.cos(a); im += d[i] * Math.sin(a); } return 2 * Math.hypot(re, im) / d.length; };
  const mean336 = d => d.reduce((a, x) => a + x, 0) / d.length;
  const centroid336 = d => { let w = 0, s = 0; for (let k = 1; k <= 30; k++) { const a = harm336(d, k); w += a * a * k; s += a * a; } return w / Math.max(1e-30, s); };

  {
    // Drive con carácter (Roadmap 7.0 · 3.1): (1) suave + Asimetría da armónicos
    // PARES (2.º > −30 dB bajo el 1.º) sin continua (< −80 dB: el bloqueo de 5 Hz) y
    // sin Asimetría no hay pares; (2) en silencio, silencio exacto (el sesgo se
    // compensa: f(g·x + b) − f(b)); (3) plegado con el Drive barrido por la matriz
    // (velocity → Drive, a Drive 1 = todo saturado): el brillo SUBE en conjunto pero
    // no de forma monótona — los armónicos aparecen y vuelven a bajar; el
    // suave, en cambio, solo sube; (4) plegado con simetría a tope: solo pares (la
    // fundamental cae más de 30 dB bajo el 2.º).
    body.appendChild(el('st-cat', 'Drive con carácter'));
    const NAME = 'drive con carácter (asimetría = pares sin continua · silencio exacto · plegado no monótono · simetría = octava)';
    let r;
    try {
      const probs = [], base = { waveA: 'sine', levelA: 0.6, levelB: 0, cutoff: 20000, reso: 0, a: 0.005, d: 0.05, s: 1, r: 0.05, width: 0 };
      const st = o => { loadState({ ...base, ...o }); return structuredClone(engine.S); };
      const asym = await renderF336(st({ filterDrive: 0.5, driveAsym: 1 })), sym = await renderF336(st({ filterDrive: 0.5 }));
      const h2a = harm336(asym, 2) / harm336(asym, 1), dca = Math.abs(mean336(asym)) / harm336(asym, 1), h2s = harm336(sym, 2) / harm336(sym, 1);
      if (!(h2a > 0.0316)) probs.push('asimétrico: 2.º armónico ' + dB(h2a) + ' (esperado > −30 dB)');
      if (!(dca < 1e-4)) probs.push('asimétrico: continua ' + dB(dca) + ' (esperado < −80 dB)');
      if (!(h2s < 1e-3)) probs.push('simétrico con pares: ' + dB(h2s));
      // (2) silencio: sin fuente (niveles a 0) y todo el sesgo, en los dos caracteres
      let sil = 0;
      for (const driveChar of ['suave', 'plegado']) { const d = await renderF336(st({ levelA: 0, filterDrive: 1, driveAsym: 1, driveChar })); for (const x of d) sil = Math.max(sil, Math.abs(x)); }
      if (!(sil < 1e-6)) probs.push('silencio con sesgo: pico ' + dB(sil));
      // (3) brillo frente a la ganancia de entrada: vel 1 → ganancia 1 … vel 0,1 → 9,1
      const sweep = async driveChar => { const S = st({ filterDrive: 1, driveChar, mx1src: 'vel', mx1dst: 'drive', mx1amt: -1 }), c = [];
        for (let v = 10; v >= 1; v--) c.push(centroid336(await renderF336(S, v / 10))); return c; };
      const cF = await sweep('plegado'), cS = await sweep('suave');
      const drops = cF.filter((x, i) => i > 0 && x < cF[i - 1] - 0.05).length, sDrops = cS.filter((x, i) => i > 0 && x < cS[i - 1] - 0.05).length;
      if (!(cF[cF.length - 1] > 2 * cF[0])) probs.push('plegado: el brillo no sube con el Drive (' + cF[0].toFixed(2) + ' → ' + cF[cF.length - 1].toFixed(2) + ')');
      if (!(drops >= 1)) probs.push('plegado: el brillo sube de forma monótona (sin pliegues)');
      if (sDrops) probs.push('suave: el brillo baja al subir el Drive (' + sDrops + ' veces)');
      // (4) simetría a tope en el plegado = curva par: la fundamental desaparece
      const oct = await renderF336(st({ filterDrive: 1, driveChar: 'plegado', driveAsym: 1 }));
      const h1o = harm336(oct, 1) / harm336(oct, 2);
      if (!(h1o < 0.0316)) probs.push('plegado simétrico a tope: fundamental ' + dB(h1o) + ' bajo el 2.º (esperado < −30 dB)');
      loadState({});
      console.log('drive: asimétrico H2 ' + dB(h2a) + ' continua ' + dB(dca) + ' · simétrico H2 ' + dB(h2s) + ' · silencio ' + dB(sil) +
        ' · brillo plegado ' + cF.map(x => x.toFixed(2)).join(' ') + ' · suave ' + cS.map(x => x.toFixed(2)).join(' ') + ' · simetría H1/H2 ' + dB(h1o));
      r = { name: NAME, peak: 0, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // LFO a tempo (Roadmap 7.0 · 2.2). (1) Un LFO global con sync 1/8 a 120 BPM va a
    // 4 Hz y su ciclo (seno: cruce hacia arriba = fase 0) cae en la rejilla de un
    // origen anclado como lo ancla el director (±1 ms); tras pasar a 90 BPM, a 3 Hz y
    // en la rejilla NUEVA. (2) «reinicio»: dos notas que empiezan en instantes
    // distintos se mueven igual desde su arranque (en «global», no). (3) «una vez»:
    // el LFO recorre un ciclo y se queda quieto.
    body.appendChild(el('st-cat', 'LFO a tempo'));
    const NAME = 'LFO a tempo (sync en la rejilla · cambio de BPM · reinicio por nota · una vez)';
    let r;
    try {
      const probs = [];
      // (1)
      const ctxS = new OfflineAudioContext(1, SR * 2, SR), clkS = clockOf(ctxS);
      clkS.anchor('director', 0.137, 120);
      loadState({ cutLfoSync: '1/8' });
      const eS = new AudioEngine(); eS.S = structuredClone(engine.S); await eS.init(ctxS);
      // se engancha a la salida a los 0,6 s, como cuando una voz lo usa: si el LFO no corriera sin nadie
      // escuchando (Chrome no procesa lo que no llega al destino), saldría fuera de la rejilla
      ctxS.suspend(0.6).then(() => { eS.cutLFO.out.connect(ctxS.destination); ctxS.resume(); });
      ctxS.suspend(1.0).then(() => { eS.set('bpm', 90); ctxS.resume(); });
      const dS = (await ctxS.startRendering()).getChannelData(0), ups = [];
      for (let i = 1; i < dS.length; i++) if (dS[i - 1] < 0 && dS[i] >= 0) ups.push((i - 1 + dS[i - 1] / (dS[i - 1] - dS[i])) / SR);
      const pre = ups.filter(t => t > 0.62 && t < 0.99), post = ups.filter(t => t > 1.1);
      const offGrid = (ts, timeAtBeat, div) => Math.max(...ts.map(t => { const k = Math.round((t - timeAtBeat(0)) / (timeAtBeat(div) - timeAtBeat(0))); return Math.abs(t - timeAtBeat(k * div)); }));
      const e1 = offGrid(pre, b => 0.137 + b * 0.5, 0.5), e2 = offGrid(post, b => clkS.timeAt(b), 0.5);
      const hz1 = (pre.length - 1) / (pre[pre.length - 1] - pre[0]), hz2 = (post.length - 1) / (post[post.length - 1] - post[0]);
      if (!(Math.abs(hz1 - 4) < 0.01 && e1 < 0.001)) probs.push('120 BPM · 1/8: ' + hz1.toFixed(3) + ' Hz, a ' + (e1 * 1000).toFixed(2) + ' ms de la rejilla');
      if (!(Math.abs(hz2 - 3) < 0.01 && e2 < 0.001)) probs.push('tras pasar a 90 BPM: ' + hz2.toFixed(3) + ' Hz, a ' + (e2 * 1000).toFixed(2) + ' ms de la rejilla nueva');
      // (2) y (3): LFO de cutoff crudo → Amplitud por la matriz, envolvente por periodos de la nota
      const st = o => { loadState({ waveA: 'sine', levelA: 0.6, levelB: 0, cutoff: 20000, reso: 0, a: 0.002, d: 0.05, s: 1, r: 0.05, width: 0,
        cutLfoSpd: 2, mx1src: 'lfoCut', mx1dst: 'amp', mx1amt: 0.5, ...o }); return structuredClone(engine.S); };
      const envFrom = async (S, at) => {
        const ctx = new OfflineAudioContext(1, Math.ceil(SR * (at + 1.3)), SR), eng = new AudioEngine(); eng.S = S; await eng.init(ctx);
        ctx.suspend(Math.round(at * SR / 128) * 128 / SR).then(() => { eng.noteOn('t', F336, 1); ctx.resume(); });
        const d = (await ctx.startRendering()).getChannelData(0);
        let i0 = 0; while (i0 < d.length && Math.abs(d[i0]) < 1e-4) i0++;
        const env = []; for (let i = i0 + 336 * 4; i + 336 <= Math.min(d.length, i0 + SR * 1.2); i += 336) { let e = 0; for (let k = i; k < i + 336; k++) e += d[k] * d[k]; env.push(Math.sqrt(e / 336)); }
        return env;
      };
      const rel = (a, b) => { let d = 0, e = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) { d += (a[i] - b[i]) ** 2; e += a[i] ** 2; } return Math.sqrt(d / e); };
      const SR2 = st({ lfoPhase: 'reinicio' }), SG = st({ lfoPhase: 'global' });
      const dRe = rel(await envFrom(SR2, 0), await envFrom(structuredClone(SR2), 0.37)), dGl = rel(await envFrom(SG, 0), await envFrom(structuredClone(SG), 0.37));
      if (!(dRe < 0.01 && dGl > 0.1)) probs.push('reinicio: dos notas difieren ' + dRe.toFixed(4) + ' (global: ' + dGl.toFixed(3) + ')');
      const eU = await envFrom(st({ lfoPhase: 'una' }), 0);
      const nU = Math.round((0.5 - 4 * 336 / SR) / (336 / SR)), during = eU.slice(0, nU), after = eU.slice(nU + 6);
      const swing = Math.max(...during) / Math.min(...during), still = Math.max(...after) / Math.min(...after);
      if (!(swing > 1.5 && still < 1.01)) probs.push('una vez: oscila ×' + swing.toFixed(2) + ' en su ciclo y ×' + still.toFixed(3) + ' después (esperado quieto)');
      loadState({});
      console.log('lfo a tempo: 120 BPM 1/8 ' + hz1.toFixed(3) + ' Hz a ' + (e1 * 1000).toFixed(3) + ' ms · 90 BPM ' + hz2.toFixed(3) + ' Hz a ' + (e2 * 1000).toFixed(3) +
        ' ms · reinicio ' + dRe.toFixed(4) + ' (global ' + dGl.toFixed(3) + ') · una vez ciclo ×' + swing.toFixed(2) + ' después ×' + still.toFixed(4));
      r = { name: NAME, peak: 0, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Env mod (Roadmap 7.0 · 2.1), su salida cruda en un canal aparte: (1) bucle con
    // A 10 ms + D 90 ms = periódica a 0,1 s EXACTOS (la señal desplazada 4410 muestras
    // coincide), de 0 a 1; al soltar, sigue desde donde estaba (sin salto) y llega a 0
    // en R; (2) disparo con una nota de 20 ms: la curva entera (en t0 + A + D vale el
    // sostenido, en t0 + A + D + R vale 0), y en normal la misma nota la corta antes;
    // (3) normal: sostiene en S mientras se pulsa.
    body.appendChild(el('st-cat', 'Env mod'));
    const NAME = 'Env mod (bucle exacto · release desde su punto · disparo entero · sostenido)';
    let r;
    try {
      const probs = [];
      const run = async (o, offAt, secs = 1.6) => {
        loadState({ waveA: 'sine', levelA: 0.5, levelB: 0, a: 0.002, s: 1, r: 0.6, mx1src: 'envm', mx1dst: 'pan', mx1amt: 0.5, ...o });
        const ctx = new OfflineAudioContext(3, Math.ceil(SR * secs), SR), eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctx);
        const m = ctx.createChannelMerger(3); m.connect(ctx.destination);
        eng.noteOn('t', NOTE1, 1);
        const v = eng.voices.get('t'); v.envm.out.connect(m, 0, 2);
        ctx.suspend(Math.round(offAt * SR / 128) * 128 / SR).then(() => { eng.noteOff('t'); ctx.resume(); });
        return { d: (await ctx.startRendering()).getChannelData(2), t0: v.t0, tOff: Math.round(offAt * SR / 128) * 128 / SR };
      };
      const at = (x, t) => x.d[Math.round(t * SR)];
      // (1) bucle
      const B = await run({ envmMode: 'bucle', envmA: 0.01, envmD: 0.09, envmR: 0.2 }, 0.8);
      let per = 0, mx = 0, mn = 1;
      for (let i = Math.round((B.t0 + 0.05) * SR); i < Math.round((B.t0 + 0.6) * SR); i++) { per = Math.max(per, Math.abs(B.d[i] - B.d[i + 4410])); mx = Math.max(mx, B.d[i]); mn = Math.min(mn, B.d[i]); }
      const iOff = Math.round(B.tOff * SR), jump = Math.abs(B.d[iOff] - B.d[iOff - 1]), endB = Math.abs(at(B, B.tOff + 0.2 + 0.02));
      if (!(per < 2e-3 && mx > 0.99 && mn < 0.01)) probs.push('bucle: periodo 0,1 s con error ' + per.toExponential(1) + ', rango ' + mn.toFixed(3) + '…' + mx.toFixed(3));
      if (!(jump < 0.02 && endB < 1e-3)) probs.push('bucle al soltar: salto ' + jump.toFixed(3) + ', tras R ' + endB.toFixed(4));
      // (2) disparo frente a normal con una nota de 20 ms
      const env = { envmA: 0.01, envmD: 0.2, envmS: 0.5, envmR: 0.3 };
      const P = await run({ envmMode: 'disparo', ...env }, 0.02), N = await run({ envmMode: 'normal', ...env }, 0.02);
      const pS = at(P, P.t0 + 0.21), pEnd = at(P, P.t0 + 0.52), nMid = at(N, N.t0 + 0.21);
      if (!(Math.abs(pS - 0.5) < 0.02 && Math.abs(pEnd) < 0.01)) probs.push('disparo: en A + D vale ' + pS.toFixed(3) + ' (esperado 0,5) y tras R ' + pEnd.toFixed(3));
      if (!(nMid < 0.4)) probs.push('normal con 20 ms: no suelta (' + nMid.toFixed(3) + ' en A + D)');
      // (3) normal sostenido
      const H = await run({ envmMode: 'normal', ...env }, 1.2);
      const hS = at(H, H.t0 + 0.8);
      if (!(Math.abs(hS - 0.5) < 0.005)) probs.push('normal: sostiene en ' + hS.toFixed(3) + ' (esperado 0,5)');
      loadState({});
      console.log('env mod: bucle error ' + per.toExponential(1) + ' rango ' + mn.toFixed(3) + '…' + mx.toFixed(3) + ' salto al soltar ' + jump.toFixed(4) +
        ' · disparo A+D ' + pS.toFixed(3) + ' tras R ' + pEnd.toFixed(4) + ' · normal 20 ms ' + nMid.toFixed(3) + ' · sostenido ' + hS.toFixed(3));
      r = { name: NAME, peak: 0, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Pasos (Roadmap 7.0 · 2.3): (1) la escalera del sabor continuo en el tiempo —
    // valores exactos a mitad de cada paso y pasos en la rejilla —, suavizado 0 sin
    // clic (el salto máximo entre muestras de −1 a +1 es el de una rampa de 4 ms) y
    // suavizado 1 = rampa del paso entero; (2) cuentas: rotación + deriva, el ciclo
    // de 16 · 12 · 5 = 15 compases (y con deriva); (3) «· nota» toma el paso en que
    // empieza la nota; (4) reinicio «al tocar»: tras el silencio la frase vuelve al
    // paso 0 (con «nunca», sigue donde iba).
    body.appendChild(el('st-cat', 'Pasos'));
    const NAME = 'Pasos (escalera exacta · sin clic · suavizado · rotación y deriva · ciclo · por nota · reinicio)';
    let r;
    try {
      const probs = [], step = 0.125;   // 1/16 a 120 BPM
      const base = { waveA: 'sine', levelA: 0.5, levelB: 0, a: 0.002, s: 1, r: 0.05, bpm: 120, st1Pat: '1 -1 0.5 0', st1Div: '1/16' };
      // (1)
      const raw = async o => {
        loadState({ ...base, mx1src: 'st1', mx1dst: 'pan', mx1amt: 0.5, ...o });
        const ctx = new OfflineAudioContext(3, Math.ceil(SR * 2.2), SR), eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctx);
        const m = ctx.createChannelMerger(3); m.connect(ctx.destination);
        eng.noteOn('t', NOTE1, 1); eng.steps.src[1].connect(m, 0, 2);
        return (await ctx.startRendering()).getChannelData(2);
      };
      const d0 = await raw({ st1Smooth: 0 }), want = [1, -1, 0.5, 0];
      let errV = 0, jump = 0;
      for (let k = 0; k < 16; k++) errV = Math.max(errV, Math.abs(d0[Math.round((k + 0.5) * step * SR)] - want[k % 4]));
      for (let i = 1; i < Math.round(2 * SR); i++) jump = Math.max(jump, Math.abs(d0[i] - d0[i - 1]));
      const edge = d0[Math.round((step + 0.002) * SR)];   // a mitad de la rampa de 4 ms del paso 1 (de 1 a −1)
      if (!(errV < 1e-6)) probs.push('escalera: error ' + errV.toExponential(1) + ' a mitad de paso');
      if (!(jump < 0.02 && Math.abs(edge) < 0.15)) probs.push('escalón: salto máximo ' + jump.toFixed(4) + ' por muestra, a 2 ms del paso ' + edge.toFixed(3));
      const d1 = await raw({ st1Smooth: 1 });
      const mid1 = d1[Math.round(1.5 * step * SR)];        // paso 1 a mitad: de 1 hacia −1 = 0
      if (!(Math.abs(mid1) < 0.01)) probs.push('suavizado 1: a mitad del paso vale ' + mid1.toFixed(3) + ' (esperado 0)');
      // (2) cuentas sobre un motor de mentira (sin audio)
      const fakeCtx = { currentTime: 0 }, clk = clockOf(fakeCtx); clk.anchor('d', 0, 120);
      const fe = { ctx: fakeCtx, bpm: 120, S: { ...structuredClone(engine.S), stReset: 'nunca', st2Pat: '0 0.25 0.5 0.75 1', st2Div: '1/16', st2Rot: 2, st2Drift: '1 c' } };
      const sp = new Steps(fe);
      const r0 = sp.valueAt(2, 0.01), r16 = sp.valueAt(2, 2.01);   // paso 0: índice 2 · paso 16 (compás 1): 16 + 2 + 1 = 19 → 4
      if (!(r0 === 0.5 && r16 === 1)) probs.push('rotación y deriva: ' + r0 + ' / ' + r16 + ' (esperado 0,5 / 1)');
      const cyc = cycleBars({ st1Pat: Array(16).fill(0).join(' '), st2Pat: Array(12).fill(0).join(' '), st3Pat: '0 0 0 0 0', st1Div: '1/16', st2Div: '1/16', st3Div: '1/16', stReset: 'tocar' }, [1, 2, 3]);
      const cycD = cycleBars({ st1Pat: Array(16).fill(0).join(' '), st3Pat: '0 0 0 0 0', st1Div: '1/16', st3Div: '1/16', st3Drift: '2 c', stReset: 'tocar' }, [1, 3]);
      if (!(cyc === 15 && cycD === 10)) probs.push('ciclo: 16 · 12 · 5 = ' + cyc + ' compases (esperado 15); 16 · 5 con deriva de 2 c = ' + cycD + ' (esperado 10)');
      // (3) y (4): por nota y reinicio, leyendo el valor fijo de cada voz
      const perNote = async (reset, idleBetween) => {
        loadState({ ...base, mx1src: 'st1n', mx1dst: 'pan', mx1amt: 0.5, stReset: reset });
        const ctx = new OfflineAudioContext(2, Math.ceil(SR * 2), SR), eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctx);
        const vals = [];
        eng.noteOn('a', NOTE1, 1); vals.push(eng.voices.get('a')._mxConsts.st1n.offset.value);
        ctx.suspend(Math.round(0.3 * SR / 128) * 128 / SR).then(() => { eng.noteOn('b', NOTE2, 1); vals.push(eng.voices.get('b')._mxConsts.st1n.offset.value); eng.noteOff('a'); eng.noteOff('b'); ctx.resume(); });
        ctx.suspend(Math.round(1.37 * SR / 128) * 128 / SR).then(() => { if (idleBetween) eng.steps.idle(); eng.noteOn('c', NOTE1, 1); vals.push(eng.voices.get('c')._mxConsts.st1n.offset.value); vals.t0c = eng.voices.get('c').t0; ctx.resume(); });
        await ctx.startRendering();
        return vals;
      };
      const pT = await perNote('tocar', true), pN = await perNote('nunca', true);
      // a: paso 0 (1) · b a 0,30 s: paso 2 (0,5) · c a 1,37 s tras el silencio: «al tocar» = paso 0 (1);
      // «nunca» = el paso en que cae su arranque (t0 = tecla + look-ahead: el 11 → 0), que no es el 0
      const wantN = want[Math.floor(pN.t0c / step + 1e-9) % 4];
      if (!(pT[0] === 1 && pT[1] === 0.5)) probs.push('por nota: ' + pT.slice(0, 2).join(' / ') + ' (esperado 1 / 0,5)');
      if (!(pT[2] === 1 && pN[2] === wantN && wantN !== 1)) probs.push('reinicio: tras el silencio «al tocar» ' + pT[2] + ' (esperado 1), «nunca» ' + pN[2] + ' (esperado ' + wantN + ')');
      loadState({});
      console.log('pasos: escalera error ' + errV.toExponential(1) + ' · salto máx ' + jump.toFixed(4) + ' · suavizado 1 a mitad ' + mid1.toFixed(4) + ' · rotación/deriva ' + r0 + ' ' + r16 +
        ' · ciclo ' + cyc + ' y ' + cycD + ' compases · por nota ' + pT.join(' ') + ' · nunca ' + pN.join(' '));
      r = { name: NAME, peak: 0, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Destinos nuevos de la matriz (Roadmap 7.0 · 2.4), cada uno mueve lo que dice
    // (velocity 1 como fuente constante): Nivel A y B a 0 callan su oscilador; Nivel
    // ruido y Nivel Ring hacen sonar lo que estaba a 0; Pitch A sube una octava el
    // A y no el B. (Material por la matriz: en el check del resonador, que mide la
    // afinación de los modos en su cola libre.)
    body.appendChild(el('st-cat', 'Matriz · destinos nuevos'));
    const NAME = 'matriz · destinos nuevos (niveles A/B/Ring/ruido · Pitch A)';
    let r;
    try {
      const probs = [], base = { waveA: 'sine', waveB: 'sine', levelA: 0, levelB: 0, cutoff: 20000, reso: 0, a: 0.005, d: 0.05, s: 1, r: 0.05, width: 0 };
      const st = o => { loadState({ ...base, ...o }); return structuredClone(engine.S); };
      const rms = d => Math.sqrt(d.reduce((a, x) => a + x * x, 0) / d.length);
      const mx = (dst, amt) => ({ mx1src: 'vel', mx1dst: dst, mx1amt: amt });
      const lA = rms(await renderF336(st({ levelA: 0.5, ...mx('lvlA', -0.5) }))), lA0 = rms(await renderF336(st({ levelA: 0.5 })));
      const lB = rms(await renderF336(st({ levelB: 0.5, ...mx('lvlB', -0.5) })));
      const lN = rms(await renderF336(st({ ...mx('lvlNoise', 0.5) })));
      const lR = rms(await renderF336(st({ ...mx('lvlRing', 1) })));
      if (!(lA < 1e-5 && lA0 > 0.01)) probs.push('Nivel A: con −0,5 sobre 0,5 suena ' + dB(lA) + ' (sin matriz ' + dB(lA0) + ')');
      if (!(lB < 1e-5)) probs.push('Nivel B: con −0,5 sobre 0,5 suena ' + dB(lB));
      if (!(lN > 0.01)) probs.push('Nivel ruido: no aparece el ruido (' + dB(lN) + ')');
      if (!(lR > 0.01)) probs.push('Nivel Ring: no aparece el anillo (' + dB(lR) + ')');
      const pA = await renderF336(st({ levelA: 1, ...mx('pitchA', 1) })), pB = await renderF336(st({ levelB: 1, ...mx('pitchA', 1) }));
      const qA = harm336(pA, 2) / Math.max(1e-12, harm336(pA, 1)), qB = harm336(pB, 1) / Math.max(1e-12, harm336(pB, 2));
      if (!(qA > 100)) probs.push('Pitch A: el A no sube una octava (2f/f ' + qA.toFixed(1) + ')');
      if (!(qB > 100)) probs.push('Pitch A: mueve también el B (f/2f ' + qB.toFixed(1) + ')');
      loadState({});
      console.log('matriz destinos: nivel A ' + dB(lA) + ' (sin matriz ' + dB(lA0) + ') · B ' + dB(lB) + ' · ruido ' + dB(lN) + ' · ring ' + dB(lR) +
        ' · pitch A 2f/f ' + qA.toFixed(0) + ' · B f/2f ' + qB.toFixed(0) + ' (Material: en el check del resonador)');
      r = { name: NAME, peak: 0, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // editor de ondas: (1) la DFT corta recupera un espectro conocido
    // (seno h1 + coseno h3), (2) puntos→espectro→puntos reproduce el dibujo
    // (entrada band-limited por construcción), (3) la tabla 'usuario' (frames
    // por defecto seno/sierra en un perfil limpio) da morph 0 ≠ 1.
    body.appendChild(el('st-cat', 'Editor de ondas'));
    let r;
    try {
      const P = 256, pts = new Array(P);
      for (let i = 0; i < P; i++) pts[i] = Math.sin(2 * Math.PI * i / P) + 0.5 * Math.cos(2 * Math.PI * 3 * i / P);
      const sp = espectroDe(pts);
      const okDft = Math.abs(sp.sin[0] - 1) < 0.01 && Math.abs(sp.cos[2] - 0.5) < 0.01 &&
                    Math.abs(sp.sin[2]) < 0.01 && Math.abs(sp.cos[0]) < 0.01;
      const back = puntosDeEspectro(sp, P);
      let err = 0; for (let i = 0; i < P; i++) err = Math.max(err, Math.abs(back[i] - pts[i]));
      const okRt = err < 0.02;
      // frames por defecto DURANTE el test (el usuario puede tener A≈B dibujado); se restaura al salir
      const prevWt = localStorage.getItem(WT_LS);
      saveUserFrames(defaultUserFrames());
      loadState({ waveA: 'tabla', wtSet: 'usuario', levelA: 1, levelB: 0, wtPos: 0 });
      const bA = await renderBuf(structuredClone(engine.S));
      loadState({ waveA: 'tabla', wtSet: 'usuario', levelA: 1, levelB: 0, wtPos: 1 });
      const bB = await renderBuf(structuredClone(engine.S));
      if (prevWt === null) localStorage.removeItem(WT_LS); else localStorage.setItem(WT_LS, prevWt);
      invalidateUserSet();
      const aA = analyze(bA), aB = analyze(bB);
      const cA = bA.getChannelData(0), cB = bB.getChannelData(0);
      let d = 0, en = 0;
      for (let i = 0; i < cA.length; i += 16) { const x = cA[i] - cB[i]; d += x * x; en += cA[i] * cA[i]; }
      const diff = Math.sqrt(d / Math.max(1e-12, en));
      // receta wtUser: encode/decode reproduce los frames (viaja en el preset)
      const fr0 = defaultUserFrames(), fr1 = decodeUserFrames(encodeUserFrames(fr0));
      let errEnc = fr1 && fr1.length === fr0.length ? 0 : 1;
      if (!errEnc) for (let i = 0; i < fr0.length; i++)
        for (let k = 0; k < fr0[i].length; k++) errEnc = Math.max(errEnc, Math.abs(fr1[i][k] - fr0[i][k]));
      const okEnc = errEnc < 0.001 && decodeUserFrames('') === null && decodeUserFrames('1,2;3') === null;
      const probs = [];
      if (!okDft) probs.push('DFT no recupera el espectro (h1s ' + sp.sin[0].toFixed(3) + ' h3c ' + sp.cos[2].toFixed(3) + ')');
      if (!okRt) probs.push('ida-y-vuelta con error ' + err.toFixed(4));
      if (!okEnc) probs.push('receta wtUser no reproduce los frames (err ' + errEnc + ')');
      if (aA.bad || aB.bad) probs.push('NaN/Inf');
      if (aA.peak <= SILENCE || aB.peak <= SILENCE) probs.push('silencio (' + dB(aA.peak) + ' / ' + dB(aB.peak) + ')');
      if (!(diff > 0.3)) probs.push('usuario: morph 0 vs 1 apenas difiere (diff ' + diff.toFixed(3) + ')');
      r = { name: 'editor de ondas (DFT · ida-y-vuelta · usuario A≠B)', peak: aB.peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'editor de ondas (DFT · ida-y-vuelta · usuario A≠B)', peak: 0, ok: false,
            problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // vocal (banco de formantes): (1) activar el banco cambia CLARAMENTE el
    // render frente al seco (la etapa suena y el makeup no lo silencia ni lo
    // revienta), (2) vocal /u/ ≠ /i/ (la identidad vocálica es espectral y
    // el morph por WaveShaper→detune la mueve de verdad). Deterministas:
    // saw base sin random y vocVida a 0.
    body.appendChild(el('st-cat', 'Vocal'));
    let r;
    try {
      loadState({});
      const bDry = await renderBuf(structuredClone(engine.S));
      loadState({ vocAmt: 1, vocVowel: 0.5 });
      const bA = await renderBuf(structuredClone(engine.S));
      loadState({ vocAmt: 1, vocVowel: 0 });
      const bU = await renderBuf(structuredClone(engine.S));
      loadState({ vocAmt: 1, vocVowel: 1 });
      const bI = await renderBuf(structuredClone(engine.S));
      const diff = (x, y) => {
        const cX = x.getChannelData(0), cY = y.getChannelData(0);
        let d = 0, en = 0;
        for (let i = 0; i < cX.length; i += 16) { const e = cX[i] - cY[i]; d += e * e; en += cX[i] * cX[i]; }
        return Math.sqrt(d / Math.max(1e-12, en));
      };
      const aDry = analyze(bDry), aA = analyze(bA), aU = analyze(bU), aI = analyze(bI);
      const probs = [];
      if (aA.bad || aU.bad || aI.bad) probs.push('NaN/Inf');
      for (const [n, a] of [['a', aA], ['u', aU], ['i', aI]]) {
        if (a.peak <= SILENCE) probs.push('vocal /' + n + '/ en silencio (' + dB(a.peak) + ')');
        if (a.peak > 1) probs.push('vocal /' + n + '/ con clipping (' + dB(a.peak) + ')');
      }
      const dWet = diff(bDry, bA), dVow = diff(bU, bI);
      if (!(dWet > 0.3)) probs.push('activar el banco apenas cambia el render (diff ' + dWet.toFixed(3) + ')');
      if (!(dVow > 0.3)) probs.push('/u/ vs /i/ apenas difieren (diff ' + dVow.toFixed(3) + ')');
      r = { name: 'vocal (banco suena · /u/ ≠ /i/)', peak: aA.peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'vocal (banco suena · /u/ ≠ /i/)', peak: 0, ok: false,
            problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // vocal 2.0: (1) la fuente glotal morfa de verdad (relajada ≠ prensada:
    // el esfuerzo cambia el espectro), (2) Brillo mueve F4-F5 (audible),
    // (3) el Golpe consonántico mete energía extra en el ARRANQUE (RMS de
    // los primeros 50 ms claramente mayor que sin él), y (4) su TRANSICIÓN
    // de formantes existe: el arranque es «u-esco» (boca cerrada, F1 abajo)
    // frente al sostenido «a-esco» — medido con Goertzel en los armónicos
    // 2 y 5 de C3 (262/654 Hz ≈ F1 de /u/ y de /a/), normalizado contra el
    // render sin Golpe para cancelar el color propio del ataque.
    // El burst arranca en un punto AL AZAR del ruido (cada consonante es
    // distinta) y se suma encima: con UN golpe, cada bin de Goertzel es un
    // sorteo y el cociente de dos sorteos daba de 6 a 238 (umbral 5: fallaba
    // ~1 de cada 10; medido con 20 repeticiones, oct-2026). Con K golpes en un
    // render y las potencias SUMADAS antes de dividir (2K grados de libertad),
    // 15-38 en 20 repeticiones. Sin la transición, el burst solo (centrado en
    // F2) bajaría el cociente por debajo de 1.
    body.appendChild(el('st-cat', 'Vocal 2.0'));
    let r;
    try {
      const diff = (x, y) => {
        const cX = x.getChannelData(0), cY = y.getChannelData(0);
        let d = 0, en = 0;
        for (let i = 0; i < cX.length; i += 16) { const e = cX[i] - cY[i]; d += e * e; en += cX[i] * cX[i]; }
        return Math.sqrt(d / Math.max(1e-12, en));
      };
      // K notas de C3 en un render, una cada P (frontera de bloque), soltadas a los 0,5 s con release corto
      const K = 8, P = 206 * 128 / SR;
      const renderK = async st => {
        loadState(st);
        const ctx = new OfflineAudioContext(2, Math.ceil(SR * K * P), SR);
        const eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctx);
        eng.noteOn('n0', NOTE1);
        for (let i = 0; i < K; i++) {
          if (i) ctx.suspend(i * P).then(() => { eng.noteOn('n' + i, NOTE1); ctx.resume(); });
          ctx.suspend(i * P + 0.5).then(() => { eng.noteOff('n' + i); ctx.resume(); });
        }
        return ctx.startRendering();
      };
      loadState({ waveA: 'tabla', wtSet: 'glotal', levelA: 1, levelB: 0, wtPos: 0 });
      const bG0 = await renderBuf(structuredClone(engine.S));
      loadState({ waveA: 'tabla', wtSet: 'glotal', levelA: 1, levelB: 0, wtPos: 1 });
      const bG1 = await renderBuf(structuredClone(engine.S));
      loadState({ vocAmt: 1, vocBrillo: 0 });
      const bB0 = await renderBuf(structuredClone(engine.S));
      loadState({ vocAmt: 1, vocBrillo: 1 });
      const bB1 = await renderBuf(structuredClone(engine.S));
      const bK0 = await renderK({ vocAmt: 1, vocAtk: 0, a: 0.005, r: 0.02 });
      const bK1 = await renderK({ vocAmt: 1, vocAtk: 1, a: 0.005, r: 0.02 });
      const probs = [];
      const aG0 = analyze(bG0), aG1 = analyze(bG1), aB1 = analyze(bB1), aK1 = analyze(bK1);
      if (aG0.bad || aG1.bad || aB1.bad || aK1.bad) probs.push('NaN/Inf');
      if (aG0.peak <= SILENCE || aG1.peak <= SILENCE) probs.push('glotal en silencio (' + dB(aG0.peak) + ' / ' + dB(aG1.peak) + ')');
      if (aG1.peak > 1 || aK1.peak > 1) probs.push('clipping (glotal ' + dB(aG1.peak) + ' · golpe ' + dB(aK1.peak) + ')');
      const dG = diff(bG0, bG1), dB_ = diff(bB0, bB1);
      const sumK = (b, fn, t0, t1) => { const d = b.getChannelData(0); let s = 0; for (let i = 0; i < K; i++) s += fn(d, i * P + t0, i * P + t1); return s; };
      const en = (d, t0, t1) => { let s = 0; for (let i = Math.floor(t0 * SR); i < Math.floor(t1 * SR); i++) s += d[i] * d[i]; return s; };
      const kRatio = Math.sqrt(sumK(bK1, en, 0, 0.05) / Math.max(1e-12, sumK(bK0, en, 0, 0.05)));   // RMS de los primeros 50 ms
      const goe = f => (d, t0, t1) => {         // energía de Goertzel de un tono en una ventana
        const i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        const cw = 2 * Math.cos(2 * Math.PI * f / SR);
        let s1 = 0, s2 = 0;
        for (let i = i0; i < i1; i++) { const s0 = d[i] + cw * s1 - s2; s2 = s1; s1 = s0; }
        return s1 * s1 + s2 * s2 - cw * s1 * s2;
      };
      const uVsA = (b, t0, t1) => sumK(b, goe(261.62), t0, t1) / Math.max(1e-12, sumK(b, goe(654.06), t0, t1));
      const rr = b => uVsA(b, 0.008, 0.045) / Math.max(1e-12, uVsA(b, 0.3, 0.5));
      const trans = rr(bK1) / Math.max(1e-6, rr(bK0));   // medido 15-38 (mediana 24) en 20 repeticiones
      if (!(dG > 0.3)) probs.push('glotal: esfuerzo 0 vs 1 apenas difiere (diff ' + dG.toFixed(3) + ')');
      if (!(dB_ > 0.05)) probs.push('Brillo 0 vs 1 apenas difiere (diff ' + dB_.toFixed(3) + ')');
      if (!(kRatio > 1.2)) probs.push('el Golpe no añade energía al arranque (ratio ' + kRatio.toFixed(2) + ')');
      if (!(trans > 5)) probs.push('el Golpe no arranca con la boca cerrada (transición ' + trans.toFixed(1) + ')');
      console.log('vocal 2: glotal diff', dG.toFixed(3), '· brillo diff', dB_.toFixed(3), '· golpe arranque ×' + kRatio.toFixed(2), '· transición', trans.toFixed(1), '(' + K + ' golpes)');
      r = { name: 'vocal 2.0 (glotal morfa · brillo · golpe + transición)', peak: aK1.peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'vocal 2.0 (glotal morfa · brillo · golpe + transición)', peak: 0, ok: false,
            problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // secuencia de tabla (wave sequencing): (1) el parser lee frames/mantener
    // y recorta a 0..7, (2) secuenciar cambia CLARAMENTE el render frente al
    // morph estático, (3) en '1shot' la frase converge: con '0 7' el tramo
    // FINAL debe sonar idéntico a wtPos=1 estático (la automatización acaba
    // clavada en el último frame) mientras el ARRANQUE difiere (empieza en 0).
    // Determinista: la planificación offline va entera en el noteOn, sin timers.
    body.appendChild(el('st-cat', 'Secuencia de tabla'));
    let r;
    try {
      const p = parseWsPattern('0 7 . 3 9 -2');
      const okParse = p.length === 6 && p[0] === 0 && p[1] === 7 && p[2] === null &&
                      p[3] === 3 && p[4] === 7 && p[5] === 0 && parseWsPattern('').length === 0;
      const base = { waveA: 'tabla', levelA: 1, levelB: 0, wtPos: 0, bpm: 120 };
      loadState(base);
      const bOff = await renderBuf(structuredClone(engine.S));
      loadState({ ...base, wsOn: 'on', wsPat: '0 7', wsDiv: '1/16', wsXf: 0.1 });
      const bLoop = await renderBuf(structuredClone(engine.S));
      loadState({ ...base, wsOn: 'on', wsPat: '0 7', wsDiv: '1/16', wsXf: 0.1, wsMode: '1shot' });
      const b1s = await renderBuf(structuredClone(engine.S));
      loadState({ ...base, wtPos: 1 });
      const bTop = await renderBuf(structuredClone(engine.S));
      // diff relativo en una VENTANA [t0,t1) — la convergencia del 1shot se
      // mide donde ambas voces ya se asentaron, el arranque donde aún no
      const diffW = (x, y, t0, t1) => {
        const cX = x.getChannelData(0), cY = y.getChannelData(0);
        const i0 = Math.floor(t0 * SR), i1 = Math.min(cX.length, Math.floor(t1 * SR));
        let d = 0, en = 0;
        for (let i = i0; i < i1; i += 4) { const e = cX[i] - cY[i]; d += e * e; en += cX[i] * cX[i]; }
        return Math.sqrt(d / Math.max(1e-12, en));
      };
      const aLoop = analyze(bLoop), a1s = analyze(b1s);
      const probs = [];
      if (aLoop.bad || a1s.bad) probs.push('NaN/Inf');
      if (aLoop.peak <= SILENCE || a1s.peak <= SILENCE) probs.push('silencio (' + dB(aLoop.peak) + ' / ' + dB(a1s.peak) + ')');
      if (aLoop.peak > 1 || a1s.peak > 1) probs.push('clipping');
      if (!okParse) probs.push('parser: ' + JSON.stringify(p));
      const dOn = diffW(bOff, bLoop, 0.05, 1.0);
      if (!(dOn > 0.2)) probs.push('secuenciar apenas cambia el render (diff ' + dOn.toFixed(3) + ')');
      const dEarly = diffW(bTop, b1s, 0.02, 0.12), dLate = diffW(bTop, b1s, 0.8, 1.0);
      if (!(dEarly > 0.2)) probs.push('1shot: el arranque no difiere del frame final (diff ' + dEarly.toFixed(3) + ')');
      if (!(dLate < 0.05)) probs.push('1shot: no converge al último frame (diff final ' + dLate.toFixed(3) + ')');
      r = { name: 'secuencia de tabla (parser · secuencia audible · 1shot converge)', peak: aLoop.peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'secuencia de tabla (parser · secuencia audible · 1shot converge)', peak: 0, ok: false,
            problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // delay de cinta: render PROPIO de una sola nota (C3, pluck con s=0: se
    // apaga en ~60 ms) para que los ecos sean copias limpias de la nota.
    // (1) a Damp 0 el bucle es TRANSPARENTE: los ecos tienen el mismo tilt
    // espectral (energía de la 1ª diferencia / energía ∝ centroide) que la
    // nota directa — identidad del biquad en Nyquist / 0 Hz, y 0.25 s son
    // 11025 muestras exactas a 44.1 kHz (sin pérdida por interpolación);
    // (2) Damp 1 OSCURECE los ecos (tilt a menos de la mitad) sin apagarlos;
    // (3) el wow cambia los ecos (los desafina) sin NaN. Ventanas: directo
    // [0, 0.2) (la nota muere en ~0.13 s); solo ecos, canal L, [0.22, fin)
    // (0.25, 0.75, 1.25, 1.75 s; Amount 0.9 ⇒ realimentación 0.77, así los
    // ecos tardíos aún tienen energía para medir).
    body.appendChild(el('st-cat', 'Delay de cinta'));
    let r;
    try {
      const base = { waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 12000, reso: 0.7, a: 0.002, d: 0.12, s: 0, r: 0.1,
                     dlyAmt: 0.9, dlyTime: 0.25, dlySync: 'libre', width: 0 };
      loadState(base);
      const b0 = await renderOne(structuredClone(engine.S));
      loadState({ ...base, dlyDamp: 1 });
      const b1 = await renderOne(structuredClone(engine.S));
      loadState({ ...base, dlyWow: 1 });
      const bW = await renderOne(structuredClone(engine.S));
      const win = (buf, t0, t1) => { const d = buf.getChannelData(0); return [d, Math.floor(t0 * SR), Math.min(d.length, Math.floor(t1 * SR))]; };
      const tilt = tiltW;
      const rms = (buf, t0, t1) => { const [d, i0, i1] = win(buf, t0, t1); let s = 0;
        for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
      const diffW = (x, y, t0, t1) => { const cX = x.getChannelData(0), cY = y.getChannelData(0);
        const i0 = Math.floor(t0 * SR), i1 = Math.min(cX.length, Math.floor(t1 * SR)); let d = 0, en = 0;
        for (let i = i0; i < i1; i += 4) { const e = cX[i] - cY[i]; d += e * e; en += cX[i] * cX[i]; }
        return Math.sqrt(d / Math.max(1e-12, en)); };
      const end = b0.length / SR;
      const a0 = analyze(b0), a1 = analyze(b1), aW = analyze(bW);
      const probs = [];
      if (a0.bad || a1.bad || aW.bad) probs.push('NaN/Inf');
      if (a0.peak > 1 || a1.peak > 1 || aW.peak > 1) probs.push('clipping');
      const T_ECO = 0.22;
      const tDir = tilt(b0, 0, 0.2), tEco0 = tilt(b0, T_ECO, end), tEco1 = tilt(b1, T_ECO, end);
      const rEco0 = rms(b0, T_ECO, end), rEco1 = rms(b1, T_ECO, end);
      if (!(rEco0 > 1e-3 * HR)) probs.push('sin ecos en la ventana de cola (rms ' + dB(rEco0) + ')');
      const transp = tEco0 / Math.max(1e-12, tDir);
      if (!(transp > 0.8 && transp < 1.25)) probs.push('a Damp 0 los ecos no son copias (tilt ecos/directo ' + transp.toFixed(3) + ')');
      if (!(tEco1 < 0.5 * tEco0)) probs.push('Damp 1 no oscurece los ecos (tilt ' + tEco1.toExponential(2) + ' vs ' + tEco0.toExponential(2) + ')');
      if (!(rEco1 > 0.25 * rEco0)) probs.push('Damp 1 apaga los ecos (rms ' + dB(rEco1) + ' vs ' + dB(rEco0) + ')');
      const dW = diffW(b0, bW, T_ECO, end);
      if (!(dW > 0.2)) probs.push('el wow apenas cambia los ecos (diff ' + dW.toFixed(3) + ')');
      console.log('delay de cinta: tilt directo', tDir.toExponential(3), 'ecos@0', tEco0.toExponential(3), 'ecos@1', tEco1.toExponential(3),
                  'rms ecos', rEco0.toFixed(4), rEco1.toFixed(4), 'wow diff', dW.toFixed(3));
      r = { name: 'delay de cinta (transparente a 0 · damp oscurece · wow desafina)', peak: a1.peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'delay de cinta (transparente a 0 · damp oscurece · wow desafina)', peak: 0, ok: false,
            problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // FM en la matriz + feedback: (1) env→«FM índice»: el índice cabalga la
    // envolvente ⇒ el tilt espectral del ARRANQUE es claramente mayor que el
    // del SOSTENIDO (control: con índice fijo ese cociente se queda ≈ 1 — la
    // amplitud no entra en el tilt); (2) velocity→índice: pegar fuerte (vel
    // 1) da más brillo que pegar flojo (vel 0.3); (3) el feedback del
    // modulador añade armónicos (tilt sube) — se mide a feedback MÁXIMO
    // (bucle caótico, espectro ancho): con feedback medio la ganancia
    // depende de la fase aleatoria del modulador (1,3-2,4×) y el check
    // bailaba — y a tope + índice máximo no produce NaN ni clipping (el
    // portador es un seno: ≤ 1 por construcción).
    body.appendChild(el('st-cat', 'FM en la matriz'));
    let r;
    try {
      const base = { waveA: 'sine', waveB: 'sine', levelA: 0.5, levelB: 0.5, fmRatio: 2, fmIndex: 0.5, cutoff: 20000,
                     a: 0.002, d: 0.4, s: 0.1, r: 0.1, width: 0 };
      const opt = { secs: 1.2, offAt: 1.0 };
      loadState(base);
      const bFix = await renderOne(structuredClone(engine.S), opt);
      loadState({ ...base, mx1src: 'env', mx1dst: 'fm', mx1amt: 0.8 });
      const bEnv = await renderOne(structuredClone(engine.S), opt);
      loadState({ ...base, mx1src: 'vel', mx1dst: 'fm', mx1amt: 0.8 });
      const bVelHi = await renderOne(structuredClone(engine.S), { ...opt, vel: 1 });
      const bVelLo = await renderOne(structuredClone(engine.S), { ...opt, vel: 0.3 });
      loadState({ ...base, fmIndex: 2, fmFb: 0 });
      const bFb0 = await renderOne(structuredClone(engine.S), opt);
      loadState({ ...base, fmIndex: 2, fmFb: 1 });
      const bFb1 = await renderOne(structuredClone(engine.S), opt);
      loadState({ ...base, fmIndex: 12, fmFb: 1 });
      const bFbMax = await renderOne(structuredClone(engine.S), opt);
      const probs = [];
      const aEnv = analyze(bEnv), aFb1 = analyze(bFb1), aMax = analyze(bFbMax);
      if (aEnv.bad || aFb1.bad || aMax.bad) probs.push('NaN/Inf');
      if (aEnv.peak > 1 || aFb1.peak > 1 || aMax.peak > 1) probs.push('clipping');
      if (aMax.peak <= SILENCE) probs.push('feedback a tope en silencio (' + dB(aMax.peak) + ')');
      // arranque [0.01, 0.06) vs sostenido [0.6, 0.95): el decay (0.4 s) ya acabó
      const ratioEnv = tiltW(bEnv, 0.01, 0.06) / Math.max(1e-12, tiltW(bEnv, 0.6, 0.95));
      const ratioFix = tiltW(bFix, 0.01, 0.06) / Math.max(1e-12, tiltW(bFix, 0.6, 0.95));
      if (!(ratioEnv > 2.5)) probs.push('env→FM no abrillanta el arranque (tilt arranque/sostenido ' + ratioEnv.toFixed(2) + ')');
      if (!(ratioFix < 1.5)) probs.push('control: con índice fijo el arranque ya difiere (' + ratioFix.toFixed(2) + ')');
      const tHi = tiltW(bVelHi, 0.2, 0.95), tLo = tiltW(bVelLo, 0.2, 0.95);
      if (!(tHi > 1.3 * tLo)) probs.push('vel→FM: pegar fuerte no abrillanta (tilt ' + tHi.toExponential(2) + ' vs ' + tLo.toExponential(2) + ')');
      const tF0 = tiltW(bFb0, 0.2, 0.95), tF1 = tiltW(bFb1, 0.2, 0.95);
      if (!(tF1 > 1.3 * tF0)) probs.push('el feedback no añade armónicos (tilt ' + tF1.toExponential(2) + ' vs ' + tF0.toExponential(2) + ')');
      console.log('fm matriz: env arranque/sostenido', ratioEnv.toFixed(2), 'control', ratioFix.toFixed(2),
                  'vel hi/lo', (tHi / Math.max(1e-12, tLo)).toFixed(2), 'fb 1/0', (tF1 / Math.max(1e-12, tF0)).toFixed(2), 'pico fb max', dB(aMax.peak));
      r = { name: 'FM en la matriz (env→índice · vel→índice · feedback)', peak: aMax.peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'FM en la matriz (env→índice · vel→índice · feedback)', peak: 0, ok: false,
            problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Partes (Roadmap 4.0 · C1): (1) estado↔controles: applyPreset y toControls
    // son inversas y respetan los defaults; (2) escena offline con 4 partes
    // sobre UNA Sala: cada parte suena en su ventana, la silenciada no, sin
    // NaN ni clipping; (3) la sala es compartida: un cambio de BPM desde una
    // parte y de predelay desde la sala llegan al S de todas; (4) el envío a
    // reverb de la parte 4 deja cola en la sala cuando su VCA ya cerró.
    body.appendChild(el('st-cat', 'Partes'));
    let r;
    try {
      const probs = [];
      const def = toControls(makeDefaultState());
      for (const k in PARAMS) if (def[k] !== PARAMS[k].def) { probs.push('toControls: ' + k + ' ≠ default'); break; }
      const pr = FACTORY['Pads']['Pad catedral'], back = toControls(applyPreset(makeDefaultState(), pr));
      for (const k in pr) if (back[k] !== pr[k]) { probs.push('applyPreset/toControls no es ida y vuelta en ' + k); break; }
      const secs = 3.2, ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
      // la parte 4 (la última en sonar) lleva ataque corto y envío a reverb a
      // tope: su cola es lo único que queda al final del render
      const presets = [FACTORY['Bajos']['Bajo pluck'], FACTORY['Leads']['Lead cuadrado'], FACTORY['Percusión']['Bombo 808'],
                       { ...FACTORY['Pads']['Pad de cristal'], a: 0.01, r: 0.15, reverbMix: 0.6 }];
      // reverbSize va en la creación: regenerar la IR en vivo lleva debounce (timer real: no determinista offline)
      const sc = await createScene(ctx, presets, { salaS: { reverbSize: 2.6 } });
      sc.parts[1].engine.setMute(true);
      sc.parts[0].engine.set('bpm', 99);                       // desde una parte…
      sc.sala.set('reverbPre', 0.02);                          // …y desde la sala
      if (!(sc.parts.every(p => p.engine.S.bpm === 99 && p.engine.S.reverbPre === 0.02 && p.engine.S.reverbSize === 2.6) && sc.S.bpm === 99))
        probs.push('la sala no se comparte (bpm / reverbPre / reverbSize no llegan a todas las partes)');
      const T = i => 0.1 + 0.6 * i;                            // cada parte toca C3 en su ventana
      sc.parts.forEach((p, i) => {
        ctx.suspend(T(i)).then(() => { p.engine.noteOn('n', NOTE1); ctx.resume(); });
        ctx.suspend(T(i) + 0.25).then(() => { p.engine.noteOff('n'); ctx.resume(); });
      });
      const buf = await ctx.startRendering();
      const a = analyze(buf);
      if (a.bad) probs.push('NaN/Inf');
      if (a.peak > 1) probs.push('clipping (' + dB(a.peak) + ')');
      const rmsW = (t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        let s = 0; for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
      const lv = sc.parts.map((p, i) => rmsW(T(i) + 0.02, T(i) + 0.25));
      [0, 2, 3].forEach(i => { if (!(lv[i] > SILENCE)) probs.push('la parte ' + (i + 1) + ' no suena (' + dB(lv[i]) + ')'); });
      if (!(lv[1] < SILENCE * 0.3)) probs.push('la parte 2 silenciada suena (' + dB(lv[1]) + ')');
      const tail = rmsW(2.75, 3.2);  // parte 4: nota 1.9-2.15 s, VCA cerrado en ~2.4 s (r 0.15) → solo queda la cola de la reverb compartida
      if (!(tail > 1e-3 * HR)) probs.push('sin cola de reverb de la parte 4 en la sala (' + dB(tail) + ')');
      console.log('partes: niveles', lv.map(v => dB(v)).join(' · '), '· cola', dB(tail), '· pico', dB(a.peak));
      r = { name: 'partes (estado↔controles · escena de 4 · sala compartida · mute · cola)', peak: a.peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'partes (estado↔controles · escena de 4 · sala compartida · mute · cola)', peak: 0, ok: false,
            problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Velocity del teclado de pantalla (ratón): la ALTURA de la pulsación. (1) La
    // curva: arriba 0,2, recta hasta el 85 % del largo de la tecla, de ahí a 1.
    // (2) Por el camino real: un pointerdown al 10 % de una tecla blanca → la voz
    // nace con esa velocity, la tecla publica --vel (su brillo) y la pantalla
    // Salida la enseña; abajo del todo → 1, lo de antes de haber velocity.
    const NAME = 'teclado de pantalla: velocity por la altura de la pulsación (curva · voz · tecla · pantalla)';
    let r;
    try {
      const probs = [], near = (a, b) => Math.abs(a - b) < 1e-9;
      if (!(near(velFromY(0), 0.2) && near(velFromY(0.425), 0.6) && near(velFromY(0.85), 1) && near(velFromY(1), 1) && near(velFromY(-0.1), 0.2)))
        probs.push('curva: ' + [0, 0.425, 0.85, 1].map(velFromY).map(v => v.toFixed(3)).join(' '));
      const keep = snapshot();
      loadState({});
      const key = document.querySelector('#keyboard .wkey'), midi = +key.dataset.midi, rc = key.getBoundingClientRect();
      const tap = f => {
        const opt = { bubbles: true, pointerId: 77, clientX: rc.left + rc.width / 2, clientY: rc.top + f * rc.height, buttons: 1 };
        key.dispatchEvent(new PointerEvent('pointerdown', opt));
        const v = part().voices.get('m' + midi), res = { vel: v ? v.vel : null, css: key.style.getPropertyValue('--vel'),
          disp: (document.getElementById('dispVal')?.textContent || '').trim() };
        key.dispatchEvent(new PointerEvent('pointerup', { ...opt, buttons: 0 }));
        return res;
      };
      const lo = tap(0.1), hi = tap(0.97), eLo = velFromY(0.1);
      if (!(rc.height > 20)) probs.push('teclado sin altura (' + rc.height + ' px)');
      if (!(lo.vel !== null && Math.abs(lo.vel - eLo) < 0.02)) probs.push('arriba: la voz nace con vel ' + lo.vel + ' (esperado ' + eLo.toFixed(2) + ')');
      if (!(hi.vel !== null && Math.abs(hi.vel - 1) < 1e-9)) probs.push('abajo: vel ' + hi.vel + ' (esperado 1)');
      if (lo.css !== eLo.toFixed(2)) probs.push('la tecla no publica --vel («' + lo.css + '»)');
      if (!lo.disp.includes(eLo.toFixed(2))) probs.push('la pantalla Salida no enseña la velocity («' + lo.disp + '»)');
      part().allNotesOff();
      loadState(keep);
      r = { name: NAME, peak: 0, ok: !probs.length, problems: probs };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  {
    // Deshacer / rehacer / comparar (Roadmap 7.0 · 1.1 y 1.2), por el camino real:
    // (1) un GESTO (pulsar dentro de la pantalla → cambio → soltar → silencio) es un
    // paso; (2) un cambio del código sin gesto (la deriva) NO lo es; (3) deshacer y
    // rehacer devuelven el valor y no cortan la nota que suena; (4) cargar un preset
    // es un paso; (5) ● y Comparar: alternar guardado ↔ edición, y tocar algo mientras
    // compara vuelve a la edición; (6) Ctrl+Z deshace y no toca un Do.
    const NAME = 'deshacer · rehacer · comparar (gestos sí, deriva no; notas que siguen; preset como paso; ● y Comparar; Ctrl+Z)';
    let r;
    try {
      const probs = [], keep = snapshot(), wait = ms => new Promise(res => setTimeout(res, ms));
      const lab = CONTROLS.cutoff.el.querySelector('.lab'), lo = PARAMS.cutoff.def;
      const gesture = async fn => {
        lab.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 91, buttons: 1 }));
        fn();
        lab.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 91 }));
        await wait(600);                                               // QUIET_MS cierra el gesto
      };
      document.getElementById('resetBtn').click();                     // Reset como acción: guardado = neutro
      const d0 = historyDepth().undo;
      await gesture(() => CONTROLS.cutoff.set(1234));
      if (historyDepth().undo !== d0 + 1) probs.push('un gesto no deja un paso (' + (historyDepth().undo - d0) + ')');
      if (!isModified()) probs.push('● no se enciende tras cambiar el cutoff');
      CONTROLS.reso.set(5); await wait(600);                           // como la deriva: sin gesto
      if (historyDepth().undo !== d0 + 1) probs.push('un cambio sin gesto (la deriva) entra en el historial');
      CONTROLS.reso.set(PARAMS.reso.def);
      const e = part(); e.noteOn('hst', 220, 1);
      undo();
      if (Math.abs(CONTROLS.cutoff.get() - lo) > 1e-6) probs.push('deshacer no devuelve el cutoff (' + CONTROLS.cutoff.get() + ')');
      if (!e.voices.has('hst')) probs.push('deshacer corta la nota que suena');
      redo();
      if (Math.abs(CONTROLS.cutoff.get() - 1234) > 1e-6) probs.push('rehacer no vuelve a 1234');
      e.noteOff('hst');
      const ids = library.presets().map(it => it.id), d1 = historyDepth().undo;
      loadPresetId(ids.find(id => library.item(id).nombre !== 'Init (default)'));
      if (historyDepth().undo !== d1 + 1) probs.push('cargar un preset no es un paso');
      undo();
      if (Math.abs(CONTROLS.cutoff.get() - 1234) > 1e-6) probs.push('deshacer la carga no devuelve el sonido de antes');
      document.getElementById('resetBtn').click();
      await gesture(() => CONTROLS.cutoff.set(1234));
      enterCompare();
      if (!isComparing() || Math.abs(CONTROLS.cutoff.get() - lo) > 1e-6) probs.push('Comparar no hace sonar el guardado');
      exitCompare();
      if (Math.abs(CONTROLS.cutoff.get() - 1234) > 1e-6) probs.push('salir de Comparar no devuelve la edición');
      enterCompare();
      await gesture(() => {});                                         // tocar algo mientras compara
      if (isComparing() || Math.abs(CONTROLS.cutoff.get() - 1234) > 1e-6) probs.push('tocar mientras compara no vuelve a la edición');
      await gesture(() => CONTROLS.cutoff.set(lo));
      if (isModified()) probs.push('● sigue encendido con todo como el guardado');
      const before = CONTROLS.cutoff.get();
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
      if (Math.abs(CONTROLS.cutoff.get() - before) < 1e-6) probs.push('Ctrl+Z no deshace');
      if ([...e.voices.keys()].some(k => /^m\d+$/.test(k))) probs.push('Ctrl+Z toca una nota');
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ', key: 'z', ctrlKey: true, bubbles: true }));
      e.allNotesOff();
      loadState(keep);
      r = { name: NAME, peak: 0, ok: !probs.length, problems: probs };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  {
    // Teclado sin notas colgadas (Roadmap 7.0 · 0.1), por el camino real (eventos de
    // teclado y de puntero sobre el teclado de verdad): (1) Shift entre pulsar y soltar
    // — con la nota archivada por e.key, Shift+2 llegaba como «"» y la nota colgaba —;
    // (2) Ctrl+Z es un atajo, no un Do; (3) un toque CANCELADO por el sistema suelta;
    // (4) dos dedos en la misma tecla: suena hasta que se levanta el último.
    const NAME = 'teclado sin notas colgadas (Shift entre pulsar y soltar · Ctrl+tecla no toca · toque cancelado · dos dedos)';
    let r;
    try {
      const probs = [], keep = snapshot();
      loadState({});
      const mv = () => [...part().voices.keys()].filter(k => /^m\d+$/.test(k)).length;
      const key = (type, code, k, mods = {}) => window.dispatchEvent(new KeyboardEvent(type, { code, key: k, bubbles: true, cancelable: true, ...mods }));
      key('keydown', 'Digit2', '2');
      if (mv() !== 1) probs.push('Digit2 no toca (voces ' + mv() + ')');
      key('keyup', 'Digit2', '"', { shiftKey: true });                 // Shift pulsado entre medias: otra «letra», la misma tecla
      if (mv()) probs.push('Shift entre pulsar y soltar deja la nota colgada');
      key('keydown', 'KeyZ', 'z', { ctrlKey: true });
      if (mv()) probs.push('Ctrl+Z toca una nota');
      key('keyup', 'KeyZ', 'z', { ctrlKey: true });
      const el = document.querySelector('#keyboard .wkey'), rc = el.getBoundingClientRect();
      const ptr = (type, id) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, clientX: rc.left + rc.width / 2, clientY: rc.bottom - 4, buttons: type === 'pointerdown' ? 1 : 0 }));
      ptr('pointerdown', 81);
      if (mv() !== 1) probs.push('el puntero no toca');
      ptr('pointercancel', 81);
      if (mv()) probs.push('un toque cancelado deja la nota colgada');
      ptr('pointerdown', 82); ptr('pointerdown', 83);
      ptr('pointerup', 82);
      if (mv() !== 1) probs.push('dos dedos: al levantar el primero se corta la nota del segundo');
      ptr('pointerup', 83);
      if (mv()) probs.push('dos dedos: al levantar los dos sigue sonando');
      part().allNotesOff();
      loadState(keep);
      r = { name: NAME, peak: 0, ok: !probs.length, problems: probs };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  {
    // Teclado ↔ partes (cazado por el usuario, 2026-10-01: «cambio de parte
    // mientras toco y el audio se corrompe»): el note-off del teclado iba a la
    // parte ACTUAL, no a la que recibió el note-on → nota colgada en la otra
    // parte (una voz ocupada para siempre; en mono, el jugador resbalaba en
    // legato sobre ella). (1) NoteRouter: el off llega al motor que sonó aunque
    // la «actual» sea otra; (2) Capa: on en varias, off en las mismas; (3) un id
    // ajeno no para el Seq con latch; (4) ni re-desliza la voz mono de otro.
    // Sin render: se inspeccionan las voces de cada motor (offline, sin timers de cola).
    const NAME = 'teclado ↔ partes (note-off a la parte que sonó · Capa · ids ajenos: Seq con latch sigue, mono no resbala)';
    let r;
    try {
      const probs = [];
      const ctx = new OfflineAudioContext(2, SR, SR);
      const sc = await createScene(ctx, [{}, {}, { seqOn: 'on', seqLatch: 'on' }, { mode: 'mono', glide: 0.3 }]);
      const [A, B, C, D] = sc.parts.map(p => p.engine);
      const router = new NoteRouter();
      // (1) note-on en A, «cambio de parte» a B, note-off: A suelta, B ni se entera
      router.on('m60', [A], NOTE1);
      if (!A.voices.has('m60')) probs.push('la nota no entra en la parte A');
      router.off('m60', [B]);
      if (A.voices.has('m60') || A.tails.size !== 1) probs.push('el note-off no llega a la parte que sonó (A sigue pulsada)');
      if (B.voices.size || B.tails.size) probs.push('el note-off toca la parte actual en vez de la que sonó');
      // (2) Capa: on en A y B, off en las mismas aunque la «actual» sea C
      router.on('m62', [A, B], NOTE1);
      router.off('m62', [C]);
      if (A.voices.has('m62') || B.voices.has('m62') || C.voices.size) probs.push('Capa: el note-off no vuelve a las mismas partes');
      // (3) Seq con latch: la raíz suelta deja la frase enganchada; un id ajeno no la para
      C.noteOn('k', NOTE1); C.noteOff('k');
      if (!C.seq.latched) probs.push('Seq: el latch no retiene la frase al soltar la raíz');
      C.noteOff('ajeno');
      if (!C.seq.latched || !C.seq.timer) probs.push('Seq: un note-off ajeno para la frase enganchada');
      C.allNotesOff();
      if (C.seq.latched || C.seq.timer) probs.push('Seq: allNotesOff no limpia el latch');
      // (4) mono: un id ajeno no re-desliza la voz (glideTo) ni la suelta
      D.noteOn('p', NOTE1); D.noteOn('q', NOTE2);
      let glides = 0; const v = D.monoVoice; const g0 = v.glideTo.bind(v); v.glideTo = (...a) => { glides++; g0(...a); };
      D.noteOff('ajeno');
      if (glides || D.monoVoice !== v || D.heldStack.length !== 2) probs.push('mono: un note-off ajeno re-desliza o suelta la voz');
      D.noteOff('q');
      if (glides !== 1 || D.heldStack.length !== 1) probs.push('mono: soltar la de arriba no vuelve a la de abajo');
      D.allNotesOff();
      r = { name: NAME, peak: 0, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Armonía + jugadores (Roadmap 4.0 · C2): (1) armonía — cuantización a la
    // escala (empate hacia abajo), acordes por terceras sobre la escala, paseo
    // de funciones determinista con la semilla (y distinto con otra); (2)
    // euclídeo — E(3,8) es el tresillo y E(k,n) tiene k golpes en cualquier
    // rotación; (3) escena offline con 4 jugadores (pulso, melodía, acorde,
    // raíz) sobre 4 partes, 2 compases a 120: TODAS las notas emitidas están
    // en la escala, el pulso emite k por compás, el acorde `notas` por cambio,
    // la raíz 2 por compás (con quinta), sin NaN ni clipping y audible; (4)
    // determinismo — dos directores con la misma semilla emiten exactamente
    // los mismos eventos; con otra semilla, distintos.
    body.appendChild(el('st-cat', 'Armonía y jugadores'));
    let r;
    try {
      const probs = [];
      const h = new Harmony({ root: 0, scale: 'mayor', prog: [1, 6, 4, 5], bars: 1, seed: 3 });
      const q = [h.quantize(61), h.quantize(66), h.quantize(62)];
      if (q.join() !== '60,65,62') probs.push('cuantización: ' + q.join());
      const tri = b => h.chordAt(b).tones.slice(0, 3).join('.');
      if (tri(0) !== '0.4.7' || tri(1) !== '9.0.4' || tri(3) !== '7.11.2') probs.push('acordes: ' + [tri(0), tri(1), tri(3)].join(' | '));
      const walk = seed => { const hf = new Harmony({ modo: 'funciones', seed }); return [...Array(16)].map((_, i) => hf.degreeAt(i)); };
      const w = walk(5), w2 = walk(5), w3 = walk(6);
      if (w.join() !== w2.join()) probs.push('paseo de funciones no determinista');
      if (w.join() === w3.join()) probs.push('paseo de funciones igual con otra semilla');
      if (!w.every(d => d >= 1 && d <= 7)) probs.push('grado fuera de 1..7');
      const e38 = euclid(3, 8).join('');
      if (e38 !== '10010010') probs.push('E(3,8) = ' + e38);
      for (const [k, n] of [[5, 8], [7, 16], [4, 16], [9, 12]]) for (let rot = 0; rot < n; rot += 3) {
        const s = euclid(k, n, rot).reduce((a, b) => a + b, 0);
        if (s !== k) { probs.push('E(' + k + ',' + n + ') rot ' + rot + ': ' + s + ' golpes'); break; }
      }
      const secs = 4.0, ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
      const presets = [FACTORY['Percusión']['Bombo 808'], FACTORY['Leads']['Lead cuadrado'],
                       { ...FACTORY['Pads']['Pad de cristal'], a: 0.01, r: 0.2 }, FACTORY['Bajos']['Bajo pluck']];
      const sc = await createScene(ctx, presets, { salaS: { bpm: 120 } });
      const setup = cd => {
        Object.assign(cd.harmony, { root: 2, scale: 'menor', prog: [1, 6, 4, 5], bars: 1, modo: 'lista' });
        const [p1, p2, p3, p4] = cd.players;
        p1.setMode('pulso');   Object.assign(p1.cfg, { k: 4, n: 16, prob: 1 });
        p2.setMode('melodia'); Object.assign(p2.cfg, { densidad: 0.7, silencio: 0.1 });
        p3.setMode('acorde');  Object.assign(p3.cfg, { notas: 3 });
        p4.setMode('raiz');    Object.assign(p4.cfg, { cada: 1, quinta: 1 });
        Object.assign(cd.arr.cfg, { energia: 1, vaiven: 0, sorpresa: 0, apertura: 0 });   // arreglo neutro: aquí se prueban los jugadores
        cd.players.forEach(p => { p.log = []; });
      };
      const logs = cd => JSON.stringify(cd.players.map(p => p.log));
      const cdA = new Conductor(sc, { seed: 11 }), cdB = new Conductor(sc, { seed: 11 }), cdC = new Conductor(sc, { seed: 12 });
      for (const cd of [cdA, cdB, cdC]) { cd.dry = true; setup(cd); cd.scheduleAll(secs); }
      if (logs(cdA) !== logs(cdB)) probs.push('jugadores no deterministas con la misma semilla');
      if (logs(cdA) === logs(cdC)) probs.push('jugadores iguales con otra semilla');
      const cd = sc.conductor; cd.setSeed(11); setup(cd); cd.scheduleAll(secs);
      const buf = await ctx.startRendering();
      const a = analyze(buf);
      if (a.bad) probs.push('NaN/Inf');
      if (a.peak > 1) probs.push('clipping (' + dB(a.peak) + ')');
      if (a.peak <= SILENCE) probs.push('silencio');
      const scale = cd.harmony.scaleSet();
      const ons = cd.players.map(p => p.log.filter(e => e[1] === 'on'));
      const fuera = ons.flat().filter(e => !scale.has(((e[2] % 12) + 12) % 12)).length;
      if (fuera) probs.push(fuera + ' notas fuera de la escala');
      if (ons[0].length !== 8) probs.push('pulso: ' + ons[0].length + ' golpes (esperados 4 × 2 compases)');
      if (ons[2].length !== 6) probs.push('acorde: ' + ons[2].length + ' notas (esperadas 3 × 2 acordes)');
      if (ons[3].length !== 4) probs.push('raíz: ' + ons[3].length + ' notas (esperadas 2 × 2 compases)');
      if (!(ons[1].length >= 4)) probs.push('melodía: solo ' + ons[1].length + ' notas');
      const grid = ons[0].every(e => Math.abs(e[0] / 0.125 - Math.round(e[0] / 0.125)) < 1e-3);
      if (!grid) probs.push('pulso fuera de la rejilla de semicorcheas');
      console.log('jugadores: notas', ons.map(o => o.length).join('/'), '· fuera de escala', fuera, '· pico', dB(a.peak), '· paseo', w.join(' '));
      r = { name: 'armonía y jugadores (escala · acordes · euclídeo · escena offline · determinismo)', peak: a.peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'armonía y jugadores (escala · acordes · euclídeo · escena offline · determinismo)', peak: 0, ok: false,
            problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Arreglo y escenas (Roadmap 4.0 · C3): (1) energía: acotada, arranca en
    // energía − vaivén/2 y culmina a mitad de ciclo; una parte con umbral
    // alto calla al principio y entra en la cumbre; la sorpresa es
    // determinista; (2) escena JSON: exportar → alterar → importar devuelve
    // exactamente lo exportado (sala, director, partes); (3) misma semilla
    // ⇒ mismas MUESTRAS: dos renders offline de la misma escena (el azar del
    // motor offline lleva semilla, Roadmap 7.0 · 7.1) coinciden
    // hasta el ÚLTIMO BIT (WebAudio suma las entradas de un nodo en un orden
    // que depende de direcciones de memoria: diferencias ~1e-7, −140 dB), y
    // con otra semilla difieren de verdad; (4) la escena de demo del repo
    // carga y suena.
    body.appendChild(el('st-cat', 'Arreglo y escenas'));
    let r;
    try {
      const probs = [];
      const fake = { seed: 3 }, arr = new Arrangement(fake);
      Object.assign(arr.cfg, { energia: 0.6, vaiven: 0.6, ciclo: 16, sorpresa: 0 });
      const E0 = arr.energyAt(0), E8 = arr.energyAt(8), Emax = Math.max(...[...Array(64)].map((_, b) => arr.energyAt(b))), Emin = Math.min(...[...Array(64)].map((_, b) => arr.energyAt(b)));
      if (!(Math.abs(E0 - 0.3) < 1e-9 && Math.abs(E8 - 0.9) < 1e-9)) probs.push('energía: E(0)=' + E0.toFixed(3) + ' E(8)=' + E8.toFixed(3));
      if (Emin < 0 || Emax > 1) probs.push('energía fuera de [0,1]');
      const pc = { umbral: 0.85 };
      if (arr.stateAt(0, 0, pc).active || !arr.stateAt(8, 0, pc).active) probs.push('umbral: la parte no calla/entra donde toca');
      arr.cfg.sorpresa = 1;
      const rests = [...Array(40)].map((_, b) => arr.rest(b, 1)), rests2 = [...Array(40)].map((_, b) => arr.rest(b, 1));
      const nRest = rests.filter(Boolean).length;
      if (rests.join() !== rests2.join()) probs.push('sorpresa no determinista');
      if (!(nRest >= 3 && nRest <= 20)) probs.push('sorpresa: ' + nRest + ' silencios de 40 (esperados ~10)');
      // (2)-(4): escena offline
      const presets = [FACTORY['Percusión']['Bombo 808'], FACTORY['Leads']['Lead cuadrado'],
                       { ...FACTORY['Pads']['Pad de cristal'], a: 0.01, r: 0.2 }, FACTORY['Bajos']['Bajo pluck']];
      const conf = cd => {
        Object.assign(cd.harmony, { root: 4, scale: 'dórica', prog: [1, 4], bars: 1, modo: 'lista' });
        Object.assign(cd.arr.cfg, { energia: 0.6, vaiven: 0.6, ciclo: 2, apertura: 1, sorpresa: 0.3 });
        const [p1, p2, p3, p4] = cd.players;
        p1.setMode('pulso');   Object.assign(p1.cfg, { k: 4, n: 16, umbral: 0.4 });
        p2.setMode('melodia'); Object.assign(p2.cfg, { densidad: 0.7, silencio: 0.1 });
        p3.setMode('acorde');  Object.assign(p3.cfg, { notas: 3, umbral: 0.2 });
        p4.setMode('raiz');    Object.assign(p4.cfg, { cada: 1, quinta: 1 });
      };
      const secs = 4.0;
      const render = async seed => {
        const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
        const sc = await createScene(ctx, presets, { salaS: { bpm: 120 } });
        conf(sc.conductor); sc.conductor.setSeed(seed); sc.conductor.scheduleAll(secs);
        return { sc, buf: await ctx.startRendering() };
      };
      const A = await render(11), B = await render(11), C = await render(12);
      const aA = analyze(A.buf);
      if (aA.bad) probs.push('NaN/Inf'); if (aA.peak > 1) probs.push('clipping'); if (aA.peak <= SILENCE) probs.push('silencio');
      const cmp = (x, y) => { const a = x.getChannelData(0), b = y.getChannelData(0); let n = 0, mx = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > 0) { n++; if (d > mx) mx = d; } } return { n, mx }; };
      const dAB = cmp(A.buf, B.buf), dAC = cmp(A.buf, C.buf);
      if (!(dAB.mx < 1e-5)) probs.push('misma semilla, renders distintos (' + dAB.n + ' muestras, máx ' + dAB.mx.toExponential(2) + ')');
      if (!(dAC.mx > 1e-3)) probs.push('otra semilla, render igual (máx ' + dAC.mx.toExponential(2) + ')');
      // macro: con apertura 1 la energía mueve el detune de los filtros
      const cents0 = A.sc.conductor.arr.macroCents(0), cents1 = A.sc.conductor.arr.macroCents(1);
      if (!(cents0 < -400 && cents1 > 500)) probs.push('macro de apertura: ' + cents0.toFixed(0) + ' / ' + cents1.toFixed(0) + ' ct');   // E 0.3 → −480 · E 0.9 → +960
      // JSON ida y vuelta sobre la escena A
      const sc = A.sc, strip = j => { const o = JSON.parse(JSON.stringify(j)); delete o.fecha; return JSON.stringify(o); };
      sc.parts[1].pan = -0.4; sc.parts[3].mute = true; sc.salaCfg.fb = 0.61;
      const J1 = sceneToJSON(sc);
      sc.conductor.setSeed(1); Object.assign(sc.conductor.harmony, { root: 0, scale: 'mayor', prog: [1], bars: 2 });
      Object.assign(sc.conductor.arr.cfg, { energia: 0.1, ciclo: 8 }); sc.conductor.players.forEach(p => { p.cfg.mode = 'off'; p.cfg.umbral = 0; });
      sc.parts[1].pan = 0; sc.parts[3].mute = false; sc.salaCfg.fb = 0.2; sc.S.reverbSize = 1.0;
      sc.parts[0].engine.set('cutoff', 555);
      const J2 = sceneToJSON(sc);
      if (strip(J1) === strip(J2)) probs.push('alterar la escena no cambia su JSON');
      applySceneJSON(sc, JSON.parse(JSON.stringify(J1)));
      const J3 = sceneToJSON(sc);
      if (strip(J3) !== strip(J1)) probs.push('escena JSON: ida y vuelta no es exacta');
      if (sc.parts[0].engine.S.cutoff !== J1.partes[0].estado.cutoff) probs.push('importar no restaura el estado de la parte');
      // (4) las escenas del repo (escenas/*.json): cargan, sus presets se
      // aplican, suenan sin NaN ni clipping y todo lo emitido está en su escala
      const ESCENAS = ['ambient-nocturno', 'amanecer-dorico', 'techno-hipnotico', 'coro-robotico'];
      const picos = [];
      for (const nombre of ESCENAS) {
        const j = await (await fetch('escenas/' + nombre + '.json', { cache: 'no-store' })).json();
        const ctxD = new OfflineAudioContext(2, Math.ceil(SR * 4), SR);
        const scD = await createScene(ctxD, []);
        applySceneJSON(scD, j);
        scD.conductor.players.forEach(p => { p.log = []; });
        scD.conductor.scheduleAll(4);
        const aD = analyze(await ctxD.startRendering());
        picos.push(nombre + ' ' + dB(aD.peak));
        if (aD.bad) probs.push(nombre + ': NaN/Inf'); if (aD.peak > 1) probs.push(nombre + ': clipping'); if (aD.peak <= SILENCE) probs.push(nombre + ' en silencio (' + dB(aD.peak) + ')');
        if (scD.parts.map(p => p.presetName).join('|') !== j.partes.map(p => p.preset).join('|')) probs.push(nombre + ': nombres de preset no aplicados');
        const esc = scD.conductor.harmony.scaleSet(), ons = scD.conductor.players.flatMap(p => p.log.filter(x => x[1] === 'on'));
        if (!ons.length) probs.push(nombre + ': ningún jugador emite');
        if (ons.some(x => !esc.has(((x[2] % 12) + 12) % 12))) probs.push(nombre + ': notas fuera de la escala');
      }
      console.log('escenas: E(0)', E0.toFixed(2), 'E(8)', E8.toFixed(2), '· sorpresas', nRest + '/40', '· A=B máx', dAB.mx.toExponential(1), '· A≠C máx', dAC.mx.toExponential(1), '· macro', cents0.toFixed(0) + '/' + cents1.toFixed(0), 'ct · picos', picos.join(' · '));
      r = { name: 'arreglo y escenas (energía · umbral · sorpresa · JSON ida y vuelta · misma semilla = mismas muestras · demo)', peak: aA.peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'arreglo y escenas (energía · umbral · sorpresa · JSON ida y vuelta · misma semilla = mismas muestras · demo)', peak: 0, ok: false,
            problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Azar con semilla en los renders offline (Roadmap 7.0 · 7.1): un estado
    // con TODO el azar del motor — fases libres del modulador FM y del unison,
    // supersaw, deriva del worklet, ruido, IR de la reverb, Vida y Golpe del
    // Vocal, S&H por nota — renderizado dos veces da las mismas muestras (salvo
    // el orden de suma de WebAudio, ~1e-7); con otra semilla (seedRender)
    // suena distinto; y fuera de un render offline el azar es Math.random.
    body.appendChild(el('st-cat', 'Azar con semilla'));
    const NAME = 'azar con semilla offline (dos renders = mismas muestras · otra semilla ≠ · en directo Math.random)';
    let r;
    try {
      const probs = [];
      loadState({ waveA: 'sine', fmIndex: 3, fmRatio: 2, uniVoices: '3', drift: 8, waveB: 'supersaw', levelB: 0.5,
                  noise: 0.3, reverbMix: 0.3, vocAmt: 0.6, vocVida: 0.5, vocAtk: 0.8, mx1src: 'rnd', mx1dst: 'cutoff', mx1amt: 0.5 });
      const S = structuredClone(engine.S);
      const render = async seed => {
        const ctx = new OfflineAudioContext(2, Math.ceil(SR * 1.2), SR);
        if (seed !== undefined) seedRender(ctx, seed);
        const eng = new AudioEngine(); eng.S = structuredClone(S);
        await eng.init(ctx);
        eng.noteOn('t1', NOTE1, 1); eng.noteOn('t2', NOTE2, 0.8);
        ctx.suspend(0.6).then(() => { eng.noteOff('t1'); eng.noteOff('t2'); ctx.resume(); });
        return ctx.startRendering();
      };
      const A = await render(), B = await render(), C = await render(12345);
      const cmp = (x, y) => { let mx = 0; for (let ch = 0; ch < 2; ch++) { const a = x.getChannelData(ch), b = y.getChannelData(ch); for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > mx) mx = d; } } return mx; };
      const aA = analyze(A), dAB = cmp(A, B), dAC = cmp(A, C);
      if (aA.bad) probs.push('NaN/Inf'); if (aA.peak <= SILENCE) probs.push('silencio');
      if (!(dAB < 1e-5)) probs.push('misma semilla, renders distintos (máx ' + dAB.toExponential(2) + ')');
      if (!(dAC > 1e-2)) probs.push('otra semilla, render igual (máx ' + dAC.toExponential(2) + ')');
      if (ctxRandom({}) !== Math.random) probs.push('fuera de un render offline el azar no es Math.random');
      console.log('azar con semilla: A=B máx', dAB.toExponential(1), '· A≠C máx', dAC.toExponential(1));
      r = { name: NAME, peak: aA.peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Reverb de placa (Roadmap 4.0 · A2): respuesta al impulso de una Sala en
    // modo «placa»: (1) sin NaN, pico acotado; (2) la cola DECAE de forma
    // monótona (RMS por ventanas de 250 ms) y sigue viva a 1,5 s con Size 3;
    // (3) Size 0,5 deja mucha menos cola que Size 3 (el RT60 sigue al knob);
    // (4) L y R descorrelados (|corr| < 0,6 entre 0,2 y 1,2 s: dos juegos de
    // grifos de un mismo tanque); (5) la DENSIDAD crece — entre 100 y 120 ms
    // hay más muestras «vivas» que en los primeros 20 ms (los allpass
    // multiplican las reflexiones: lo que una IR de ruido no hace); (6) un
    // preset en «placa» suena distinto que en «sala» (la conmutación existe).
    body.appendChild(el('st-cat', 'Reverb de placa'));
    let r;
    try {
      const probs = [];
      const ir = async (size, damp = 0.3) => {
        const ctx = new OfflineAudioContext(2, Math.ceil(SR * 2.5), SR);
        await loadWorklets(ctx);
        const S = makeDefaultState(); Object.assign(S, { reverbType: 'placa', reverbSize: size, reverbDamp: damp, reverbPre: 0 });
        const sala = new Sala(ctx, S, { master: 1 });
        const b = ctx.createBuffer(1, 8, SR); b.getChannelData(0)[0] = 1;
        const src = ctx.createBufferSource(); src.buffer = b; src.connect(sala.revIn); src.start(0);
        return ctx.startRendering();
      };
      const big = await ir(3), small = await ir(0.5);
      const a = analyze(big);
      if (a.bad) probs.push('NaN/Inf');
      if (a.peak > 1.5) probs.push('pico excesivo (' + dB(a.peak) + ')');
      if (a.peak <= SILENCE) probs.push('la placa no responde al impulso');
      const rmsW = (buf, ch, t0, t1) => { const d = buf.getChannelData(ch), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        let s = 0; for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
      const env = [...Array(9)].map((_, i) => rmsW(big, 0, 0.25 * i + 0.25, 0.25 * i + 0.5));   // 0,25 … 2,5 s
      for (let i = 1; i < env.length; i++) if (env[i] > env[i - 1] * 1.1) { probs.push('la cola no decae (ventana ' + i + ': ' + dB(env[i]) + ' tras ' + dB(env[i - 1]) + ')'); break; }
      if (!(env[3] > 1e-4 * HR)) probs.push('Size 3: cola muerta a 1 s (' + dB(env[3]) + ')');
      const tailS = rmsW(small, 0, 1.0, 1.25);
      if (!(env[3] > 5 * tailS)) probs.push('el Size no gobierna el RT (' + dB(env[3]) + ' vs ' + dB(tailS) + ')');
      let corr = 0;
      { const L = big.getChannelData(0), R = big.getChannelData(1), i0 = Math.floor(0.2 * SR), i1 = Math.floor(1.2 * SR);
        let sl = 0, sr = 0, sx = 0; for (let i = i0; i < i1; i++) { sl += L[i] * L[i]; sr += R[i] * R[i]; sx += L[i] * R[i]; }
        corr = sx / Math.max(1e-12, Math.sqrt(sl * sr));
        if (!(Math.abs(corr) < 0.6)) probs.push('L/R demasiado parecidos (corr ' + corr.toFixed(2) + ')'); }
      let early = 0, late = 0;
      { const d = big.getChannelData(0), thr = a.peak * 0.01;
        const alive = (t0, t1) => { let n = 0; for (let i = Math.floor(t0 * SR); i < Math.floor(t1 * SR); i++) if (Math.abs(d[i]) > thr) n++; return n; };
        early = alive(0.001, 0.021); late = alive(0.1, 0.12);
        if (!(late > early)) probs.push('la densidad no crece (' + early + ' → ' + late + ' muestras vivas)'); }
      loadState({ ...FACTORY['Pads']['Pad de placa'], reverbType: 'sala' });
      const bS = await renderBuf(structuredClone(engine.S));
      loadState(FACTORY['Pads']['Pad de placa']);
      const bP = await renderBuf(structuredClone(engine.S));
      const diff = (x, y) => { const cX = x.getChannelData(0), cY = y.getChannelData(0); let d = 0, en = 0;
        for (let i = 0; i < cX.length; i += 16) { const e = cX[i] - cY[i]; d += e * e; en += cX[i] * cX[i]; } return Math.sqrt(d / Math.max(1e-12, en)); };
      const dd = diff(bS, bP);
      if (!(dd > 0.2)) probs.push('sala vs placa apenas difieren (' + dd.toFixed(3) + ')');
      console.log('placa: cola', env.map(v => dB(v)).join(' '), '· size 0,5 @1 s', dB(tailS), '· corr L/R', corr.toFixed(2), '· densidad', early + '→' + late, '· diff sala/placa', dd.toFixed(3), '· pico', dB(a.peak));
      r = { name: 'reverb de placa (impulso decae · RT sigue al Size · L/R descorrelados · densidad crece · sala ≠ placa)', peak: a.peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'reverb de placa (impulso decae · RT sigue al Size · L/R descorrelados · densidad crece · sala ≠ placa)', peak: 0, ok: false,
            problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // FM4 (Roadmap 4.0 · B2): (1) los 8 algoritmos suenan sin NaN ni clipping
    // y cada uno difiere del anterior (mismos operadores, otro grafo ⇒ otro
    // espectro); (2) el decay por operador funciona: con el modulador 2 en
    // decay corto el tilt del arranque supera con claridad al del sostenido,
    // y con decay plano no; (3) FM4 ≠ el seno con FM de 2 operadores.
    body.appendChild(el('st-cat', 'FM4'));
    let r;
    try {
      const probs = [];
      const base = { waveA: 'fm4', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.002, d: 0.3, s: 0.8, r: 0.1, width: 0,
                     fm4R1: 1, fm4L1: 1, fm4D1: 4, fm4R2: 2, fm4L2: 0.6, fm4D2: 4, fm4R3: 1, fm4L3: 0.5, fm4D3: 4, fm4R4: 3, fm4L4: 0.4, fm4D4: 4 };
      const opt = { secs: 1.0, offAt: 0.9 };
      const diffW = (x, y, t0, t1) => { const cX = x.getChannelData(0), cY = y.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(cX.length, Math.floor(t1 * SR));
        let d = 0, en = 0; for (let i = i0; i < i1; i += 4) { const e = cX[i] - cY[i]; d += e * e; en += cX[i] * cX[i]; } return Math.sqrt(d / Math.max(1e-12, en)); };
      const bufs = [];
      for (let alg = 0; alg < 8; alg++) {
        loadState({ ...base, fm4Alg: String(alg) });
        const b = await renderOne(structuredClone(engine.S), opt), a = analyze(b);
        if (a.bad) probs.push('alg ' + alg + ': NaN/Inf');
        if (a.peak > 1) probs.push('alg ' + alg + ': clipping');
        if (a.peak <= SILENCE) probs.push('alg ' + alg + ' en silencio');
        bufs.push(b);
      }
      const dAlg = bufs.map((b, i) => i ? diffW(bufs[i - 1], b, 0.3, 0.85) : 1);
      dAlg.forEach((d, i) => { if (i && !(d > 0.15)) probs.push('alg ' + (i - 1) + ' y ' + i + ' apenas difieren (' + d.toFixed(3) + ')'); });
      loadState({ ...base, fm4Alg: '0', fm4D2: 0.06 });
      const bDec = await renderOne(structuredClone(engine.S), opt);
      const rDec = tiltW(bDec, 0.005, 0.05) / Math.max(1e-12, tiltW(bDec, 0.5, 0.85));
      const rFlat = tiltW(bufs[0], 0.005, 0.05) / Math.max(1e-12, tiltW(bufs[0], 0.5, 0.85));
      if (!(rDec > 2)) probs.push('decay del op 2: el arranque no es más brillante (' + rDec.toFixed(2) + ')');
      if (!(rFlat < 1.4)) probs.push('control: con decays planos el arranque ya difiere (' + rFlat.toFixed(2) + ')');
      loadState({ ...base, waveA: 'sine', fmRatio: 2, fmIndex: 2 });
      const b2op = await renderOne(structuredClone(engine.S), opt);
      const d2 = diffW(bufs[0], b2op, 0.3, 0.85);
      if (!(d2 > 0.2)) probs.push('FM4 pila ≈ seno 2-op (' + d2.toFixed(3) + ')');
      console.log('fm4: diffs entre algoritmos', dAlg.slice(1).map(d => d.toFixed(2)).join(' '), '· decay op2 arranque/sostenido', rDec.toFixed(2), 'control', rFlat.toFixed(2), '· vs 2-op', d2.toFixed(2));
      r = { name: 'FM4 (8 algoritmos distintos · decay por operador · ≠ 2-op)', peak: analyze(bufs[0]).peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'FM4 (8 algoritmos distintos · decay por operador · ≠ 2-op)', peak: 0, ok: false,
            problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // FM4 · reloj de las envolventes de operador: deben contar desde el ARRANQUE
    // de la nota, no desde que nace el worklet (bug cazado por el usuario con el
    // Bombo 808: «el golpe solo entra a veces»). Un operador con decay de 30 ms es
    // un clic brillante; si la nota se programa 250 ms en el futuro (como hacen
    // el arp y los jugadores, y como pasa en directo con el jitter del hilo
    // principal), el clic debe seguir ahí al abrir el VCA: el tilt espectral de
    // los primeros 25 ms de la nota programada ≈ el de la nota inmediata, y
    // ambos ≫ el del cuerpo (seno) a los 200 ms.
    body.appendChild(el('st-cat', 'FM4 · reloj de operadores'));
    let r;
    try {
      const probs = [];
      const st = { waveA: 'fm4', levelA: 1, levelB: 0, fm4Alg: '0', fm4R1: 1, fm4L1: 1, fm4D1: 4, fm4R2: 1, fm4L2: 0.9, fm4D2: 0.03,
                   fm4R3: 1, fm4L3: 0, fm4D3: 4, fm4R4: 1, fm4L4: 0, fm4D4: 4, cutoff: 20000, reso: 0.7,
                   envCurve: 1, a: 0.001, d: 0.5, s: 0, r: 0.1, width: 0 };
      const render = async (S, when) => {
        const c = new OfflineAudioContext(2, Math.ceil(SR * 1.0), SR);
        const eng = new AudioEngine(); eng.S = S; await eng.init(c);
        if (when) eng._directOn('k1', NOTE1, 1, when); else eng.noteOn('k1', NOTE1, 1);
        c.suspend(0.9).then(() => { eng.noteOff('k1'); c.resume(); });
        return c.startRendering();
      };
      const onset = buf => { const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 1e-3) return i / SR; return 0; };
      loadState(st);
      const bNow = await render(structuredClone(engine.S), 0);
      const bLater = await render(structuredClone(engine.S), 0.25);
      const aN = analyze(bNow), aL = analyze(bLater);
      if (aN.bad || aL.bad) probs.push('NaN/Inf');
      const oN = onset(bNow), oL = onset(bLater);
      if (!(oL > 0.2)) probs.push('la nota programada no arranca en el futuro (' + (oL * 1000).toFixed(0) + ' ms)');
      const atkN = tiltW(bNow, oN, oN + 0.025), atkL = tiltW(bLater, oL, oL + 0.025), body_ = tiltW(bNow, oN + 0.2, oN + 0.3);
      if (!(atkN > 2 * body_)) probs.push('el operador de 30 ms no da un ataque más brillante que el cuerpo (' + atkN.toExponential(2) + ' vs ' + body_.toExponential(2) + ')');
      if (!(atkL / Math.max(1e-12, atkN) > 0.7)) probs.push('la nota programada pierde el clic (tilt ×' + (atkL / Math.max(1e-12, atkN)).toFixed(2) + ' respecto a la inmediata)');
      console.log('fm4 reloj: tilt ataque inmediata', atkN.toExponential(2), '· programada', atkL.toExponential(2), '· cuerpo', body_.toExponential(2), '· arranque programada', (oL * 1000).toFixed(1), 'ms');
      r = { name: 'FM4 reloj de operadores (el clic de 30 ms sobrevive a una nota programada 250 ms en el futuro)', peak: aL.peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'FM4 reloj de operadores (el clic de 30 ms sobrevive a una nota programada 250 ms en el futuro)', peak: 0, ok: false,
            problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Arranque determinista (percusión): con ataque 0 el VCA abre de ESCALÓN en t0
    // (el primer cuarto de milisegundo ya está a nivel) y el worklet, que calla y
    // congela sus fases hasta t0 (cuantizado a frontera de bloque), arranca la onda
    // en su fase configurada: dos notas programadas en el futuro (200 y 300 ms,
    // como las del directo: el look-ahead adaptativo deja siempre t0 por delante
    // del nacimiento del worklet) dan, alineadas en su arranque, las MISMAS
    // muestras. Sin la puerta, el oscilador corría libre desde que nacía y la fase
    // en t0 era azar (el golpe del bombo cambiaba de una nota a otra). La nota
    // inmediata offline (look-ahead 5 ms < nacimiento del worklet) no pasa por la
    // puerta: solo se usa para el escalón.
    body.appendChild(el('st-cat', 'Arranque determinista'));
    let r;
    try {
      const probs = [];
      const st = { waveA: 'sine', phaseA: 90, levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, envCurve: 1, a: 0, d: 0.2, s: 0, r: 0.05, width: 0 };
      const render = async (S, when) => {
        const c = new OfflineAudioContext(2, Math.ceil(SR * 0.6), SR);
        const eng = new AudioEngine(); eng.S = S; await eng.init(c);
        if (when) eng._directOn('d1', NOTE1, 1, when); else eng.noteOn('d1', NOTE1, 1);
        c.suspend(0.5).then(() => { eng.noteOff('d1'); c.resume(); });
        return c.startRendering();
      };
      const onsetI = buf => { const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 1e-3) return i; return -1; };
      loadState(st);
      const bNow = await render(structuredClone(engine.S), 0);
      const bL1 = await render(structuredClone(engine.S), 0.2);
      const bL2 = await render(structuredClone(engine.S), 0.3);
      const aN = analyze(bNow), aL = analyze(bL1);
      if (aN.bad || aL.bad || analyze(bL2).bad) probs.push('NaN/Inf');
      const iN = onsetI(bNow), i1 = onsetI(bL1), i2 = onsetI(bL2);
      if (iN < 0 || i1 < 0 || i2 < 0) probs.push('silencio');
      else {
        const dN = bNow.getChannelData(0), d1 = bL1.getChannelData(0), d2 = bL2.getChannelData(0);
        const rmsI = (d, i0, n) => { let s = 0; for (let i = i0; i < i0 + n; i++) s += d[i] * d[i]; return Math.sqrt(s / n); };
        const q = Math.round(SR * 0.00025);
        const stepN = rmsI(dN, iN, q) / Math.max(1e-9, rmsI(dN, iN + 20 * q, q));   // primer ¼ ms vs 5 ms después
        const step1 = rmsI(d1, i1, q) / Math.max(1e-9, rmsI(d1, i1 + 20 * q, q));
        if (!(stepN > 0.8 && step1 > 0.8)) probs.push('con ataque 0 el VCA no abre de escalón (¼ ms inicial / 5 ms = ' + stepN.toFixed(2) + ' · ' + step1.toFixed(2) + ')');
        // alineadas por arranque con tolerancia de ±1 muestra: el instante del escalón
        // del VCA se redondea a muestra a partir de t0 en segundos y puede caer una
        // muestra antes o después entre renders (medido: 264 vs 265 muestras tras t0,
        // todo lo demás idéntico); una fase azarosa daría decenas de dB a cualquier desfase
        const n = Math.floor(SR * 0.05);
        const diffAt = sh => { let m = 0; for (let i = 2; i < n && i1 + i < d1.length && i2 + i + sh < d2.length; i++) m = Math.max(m, Math.abs(d1[i1 + i] - d2[i2 + i + sh])); return m; };
        const maxDiff = Math.min(diffAt(-1), diffAt(0), diffAt(1));
        if (!(maxDiff < 1e-3)) probs.push('dos notas programadas no arrancan igual (máx |Δ| ' + maxDiff.toExponential(2) + ' en los primeros 50 ms, mejor desfase ±1 muestra)');
        console.log('arranque: escalón ¼ ms/5 ms', stepN.toFixed(3), '/', step1.toFixed(3), '· programadas 200 vs 300 ms máx |Δ|', maxDiff.toExponential(2), '· arranques', (iN / SR * 1000).toFixed(1), '/', (i1 / SR * 1000).toFixed(1), '/', (i2 / SR * 1000).toFixed(1), 'ms');
      }
      r = { name: 'arranque determinista (ataque 0 = escalón · misma fase en dos notas programadas)', peak: aN.peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'arranque determinista (ataque 0 = escalón · misma fase en dos notas programadas)', peak: 0, ok: false,
            problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Curva de envolvente (Roadmap 4.0 · A3): con Curva 1 el ataque sube deprisa
    // (RMS a mitad del ataque ≫ que con rampas lineales) y el decay se posa
    // pronto (RMS a mitad del decay ≪); el sostenido es el mismo. Con Curva 0 el
    // camino es el de siempre (rampas lineales: lo cubre el golden).
    body.appendChild(el('st-cat', 'Curva de envolvente'));
    let r;
    try {
      const probs = [];
      const base = { waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.3, d: 0.5, s: 0.3, r: 0.1, width: 0 };
      const opt = { secs: 1.4, offAt: 1.3 };
      loadState({ ...base, envCurve: 0 });
      const b0 = await renderOne(structuredClone(engine.S), opt);
      loadState({ ...base, envCurve: 1 });
      const b1 = await renderOne(structuredClone(engine.S), opt);
      const a0 = analyze(b0), a1 = analyze(b1);
      if (a0.bad || a1.bad) probs.push('NaN/Inf');
      if (a0.peak > 1 || a1.peak > 1) probs.push('clipping');
      const rmsW = (buf, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        let s = 0; for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
      const atk = rmsW(b1, 0.14, 0.18) / Math.max(1e-9, rmsW(b0, 0.14, 0.18));     // mitad del ataque (0,3 s)
      const dec = rmsW(b1, 0.53, 0.58) / Math.max(1e-9, rmsW(b0, 0.53, 0.58));     // mitad del decay (0,3 + 0,5/2)
      const sus = rmsW(b1, 1.0, 1.25) / Math.max(1e-9, rmsW(b0, 1.0, 1.25));       // sostenido: igual
      if (!(atk > 1.5)) probs.push('la curva no acelera el ataque (' + atk.toFixed(2) + ')');
      if (!(dec < 0.6)) probs.push('la curva no posa el decay (' + dec.toFixed(2) + ')');
      if (!(Math.abs(sus - 1) < 0.1)) probs.push('el sostenido cambia con la curva (' + sus.toFixed(3) + ')');
      // release con la curva del knob: r = 0,5 s soltando en el sostenido (1,0 s). Curva 0 → recta
      // (a mitad del release, la mitad de amplitud); Curva 1 → RC (se posa: mucho menos); ambos a 0 en r
      const baseR = { ...base, r: 0.5 }, optR = { secs: 1.6, offAt: 1.0 };
      loadState({ ...baseR, envCurve: 0 });
      const r0 = await renderOne(structuredClone(engine.S), optR);
      loadState({ ...baseR, envCurve: 1 });
      const r1 = await renderOne(structuredClone(engine.S), optR);
      const lin = rmsW(r0, 1.23, 1.27) / Math.max(1e-9, rmsW(r0, 0.9, 1.0));
      const relRC = rmsW(r1, 1.23, 1.27) / Math.max(1e-9, rmsW(r0, 1.23, 1.27));
      const relEnd = Math.max(rmsW(r0, 1.55, 1.6), rmsW(r1, 1.55, 1.6));
      if (!(Math.abs(lin - 0.5) < 0.12)) probs.push('el release recto no va por la mitad a mitad de camino (' + lin.toFixed(2) + ')');
      if (!(relRC < 0.6)) probs.push('la curva no posa el release (' + relRC.toFixed(2) + ')');
      if (!(relEnd < 1e-4)) probs.push('el release no llega a 0 en r (' + dB(relEnd) + ')');
      // soltar DURANTE el ataque (bug cazado por el usuario: con setValueCurveAtTime
      // el release lanzaba excepción y la voz se quedaba colgada) → la nota debe morir
      loadState({ ...base, envCurve: 1 });
      const bCut = await renderOne(structuredClone(engine.S), { secs: 1.2, offAt: 0.15 });
      const tail = rmsW(bCut, 0.9, 1.2), aCut = analyze(bCut);
      if (aCut.bad) probs.push('soltar en el ataque: NaN/Inf');
      if (!(tail < 1e-4)) probs.push('soltar durante el ataque no apaga la nota (' + dB(tail) + ' a 0,9-1,2 s)');
      console.log('curva env: ataque ×', atk.toFixed(2), '· decay ×', dec.toFixed(2), '· sostenido ×', sus.toFixed(3), '· release recto a mitad', lin.toFixed(2), '· release RC ×', relRC.toFixed(2), '· cola tras soltar en el ataque', dB(tail));
      r = { name: 'curva de envolvente (ataque RC más rápido · decay se posa · sostenido igual · release sigue al knob)', peak: a1.peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'curva de envolvente (ataque RC más rápido · decay se posa · sostenido igual)', peak: 0, ok: false,
            problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Flam de palmada (percusión): con Golpes 3 y Hueco 12 ms, antes del ADSR
    // suenan dos ráfagas que caen a 0 antes de la siguiente — el final de cada
    // hueco es un VALLE (RMS ≪ que a mitad de la ráfaga); con Golpes 1 esas
    // mismas ventanas están en el sostenido (sin valles) y el camino es el de
    // siempre (bit-idéntico: lo cubre el golden). El último golpe es el ADSR
    // completo (el sostenido llega igual) y soltar DURANTE el flam apaga la
    // nota. Seno a 880 Hz (periodo 1,1 ms: las ventanas de 2-3 ms promedian).
    // Las ventanas se miden desde el ARRANQUE real del sonido (primera muestra
    // audible), no desde 0: el noteOn lleva look-ahead y el worklet tarda en nacer.
    body.appendChild(el('st-cat', 'Flam de palmada'));
    let r;
    try {
      const probs = [];
      const F = 880, GAP = 0.012;
      const onset = buf => { const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 1e-3) return i / SR; return 0; };
      const base = { waveA: 'sine', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.001, d: 0.1, s: 0.8, r: 0.05, width: 0, hitGap: GAP };
      const render = async (st, { secs = 0.6, offAt = 0.4 } = {}) => {
        const c = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
        const eng = new AudioEngine(); eng.S = st; await eng.init(c);
        eng.noteOn('f1', F, 1);
        c.suspend(offAt).then(() => { eng.noteOff('f1'); c.resume(); });
        return c.startRendering();
      };
      const rmsW = (buf, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        let s = 0; for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
      loadState({ ...base, hits: 1 });
      const b1 = await render(structuredClone(engine.S));
      loadState({ ...base, hits: 3 });
      const b3 = await render(structuredClone(engine.S));
      const a1 = analyze(b1), a3 = analyze(b3);
      if (a1.bad || a3.bad) probs.push('NaN/Inf');
      if (a1.peak > 1 || a3.peak > 1) probs.push('clipping');
      const T1 = onset(b1), T3 = onset(b3);
      if (Math.abs(T1 - T3) > 0.002) probs.push('el flam mueve el arranque de la nota (' + (T1 * 1000).toFixed(1) + ' / ' + (T3 * 1000).toFixed(1) + ' ms)');
      const mid = (buf, i) => { const T0 = onset(buf); return rmsW(buf, T0 + i * GAP + 0.002, T0 + i * GAP + 0.005); };          // mitad de la ráfaga i
      const valley = (buf, i) => { const T0 = onset(buf); return rmsW(buf, T0 + (i + 1) * GAP - 0.002, T0 + (i + 1) * GAP); };   // final del hueco i
      const v3 = Math.max(valley(b3, 0), valley(b3, 1)) / Math.max(1e-9, Math.min(mid(b3, 0), mid(b3, 1)));
      const v1 = Math.min(valley(b1, 0), valley(b1, 1)) / Math.max(1e-9, mid(b1, 0));
      if (!(v3 < 0.5)) probs.push('las ráfagas no caen a 0 antes de la siguiente (valle/ráfaga ' + v3.toFixed(2) + ')');
      if (!(v1 > 0.7)) probs.push('sin flam hay valles (' + v1.toFixed(2) + ')');
      const sus = rmsW(b3, 0.25, 0.35) / Math.max(1e-9, rmsW(b1, 0.25, 0.35));
      if (!(Math.abs(sus - 1) < 0.05)) probs.push('el sostenido cambia con el flam (' + sus.toFixed(3) + ')');
      const tail = rmsW(b3, 0.5, 0.6);
      if (!(tail < 1e-4)) probs.push('la nota con flam no muere tras soltar (' + dB(tail) + ')');
      // soltar DURANTE el flam (a 12 ms, entre la 1ª y la 2ª ráfaga de cuatro): debe morir
      loadState({ ...base, hits: 4 });
      const bCut = await render(structuredClone(engine.S), { secs: 0.4, offAt: 0.012 });
      const tailCut = rmsW(bCut, 0.2, 0.4);
      if (analyze(bCut).bad) probs.push('soltar en el flam: NaN/Inf');
      if (!(tailCut < 1e-4)) probs.push('soltar durante el flam no apaga la nota (' + dB(tailCut) + ')');
      console.log('flam: arranque', (T3 * 1000).toFixed(1), 'ms · valle/ráfaga con 3 golpes', v3.toFixed(3), '· sin flam', v1.toFixed(3), '· sostenido ×', sus.toFixed(3), '· cola tras soltar', dB(tail), '· soltar en el flam', dB(tailCut));
      r = { name: 'flam de palmada (ráfagas con valles · sin flam no hay valles · sostenido igual · soltar en el flam apaga)', peak: a3.peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'flam de palmada (ráfagas con valles · sin flam no hay valles · sostenido igual · soltar en el flam apaga)', peak: 0, ok: false,
            problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // A4 · tipo de filtro. Sierra en C3 con el corte en su 4º armónico (C5,
    // 523,25 Hz): Goertzel mide la energía de ese armónico frente a la del
    // fundamental (2 octavas por debajo). Notch: el armónico del corte
    // desaparece (> 20 dB menos que en LP). BP: el fundamental cae y el del
    // corte pasa (> 10 dB más que en LP); a 24 dB, más aún. Y la demostración
    // del cookbook: el morph al 50 % ES el notch a −6 dB → RMS exactamente la mitad.
    body.appendChild(el('st-cat', 'Filtro BP / notch'));
    let r;
    try {
      const base = { waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 523.25, reso: 2, a: 0.001, d: 0.01, s: 1, r: 0.05, master: 0.7 };
      const rend = async extra => { loadState({ ...base, ...extra }); return renderOne(structuredClone(engine.S), { secs: 0.8, offAt: 0.6 }); };
      const bLP = await rend({ morph: 0 }), bM50 = await rend({ morph: 0.5 }), bN = await rend({ filterType: 'notch' });
      const bBP = await rend({ filterType: 'bp' }), bBP24 = await rend({ filterType: 'bp', filterSlope: '24' });
      const goe = (buf, f, t0, t1) => {         // energía de Goertzel de un tono en una ventana
        const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        const cw = 2 * Math.cos(2 * Math.PI * f / SR);
        let s1 = 0, s2 = 0;
        for (let i = i0; i < i1; i++) { const s0 = d[i] + cw * s1 - s2; s2 = s1; s1 = s0; }
        return s1 * s1 + s2 * s2 - cw * s1 * s2;
      };
      const ratio = b => goe(b, 523.25, 0.15, 0.55) / Math.max(1e-12, goe(b, 130.81, 0.15, 0.55));   // armónico del corte / fundamental
      const rms = b => { const d = b.getChannelData(0), i0 = Math.floor(0.15 * SR), i1 = Math.floor(0.55 * SR); let e = 0; for (let i = i0; i < i1; i++) e += d[i] * d[i]; return Math.sqrt(e / (i1 - i0)); };
      const probs = [];
      for (const [n, b] of [['LP', bLP], ['morph 50', bM50], ['notch', bN], ['BP', bBP], ['BP 24', bBP24]]) {
        const a = analyze(b);
        if (a.bad) probs.push(n + ': NaN/Inf'); if (a.peak <= SILENCE) probs.push(n + ': silencio'); if (a.peak > 1) probs.push(n + ': clipping ' + dB(a.peak));
      }
      const rLP = ratio(bLP), rN = ratio(bN), rBP = ratio(bBP), rBP24 = ratio(bBP24), half = rms(bM50) / Math.max(1e-12, rms(bN));
      const dBr = (x, y) => (10 * Math.log10(x / Math.max(1e-30, y))).toFixed(1);
      if (!(rN < rLP * 0.01)) probs.push('notch: el armónico del corte no cae 20 dB (' + dBr(rN, rLP) + ' dB frente a LP)');
      if (!(rBP > rLP * 10)) probs.push('BP: el corte no domina al fundamental (' + dBr(rBP, rLP) + ' dB frente a LP)');
      if (!(rBP24 > rBP * 3)) probs.push('BP 24 dB no estrecha más que 12 (' + dBr(rBP24, rBP) + ' dB)');
      if (!(Math.abs(half - 0.5) < 0.03)) probs.push('morph 50 % ≠ notch a −6 dB (RMS ×' + half.toFixed(3) + ')');
      console.log('filtro BP notch: notch', dBr(rN, rLP), 'dB · BP', dBr(rBP, rLP), 'dB · BP24 vs BP', dBr(rBP24, rBP), 'dB · morph 50 / notch RMS ×', half.toFixed(3));
      r = { name: 'filtro BP / notch (Goertzel en el corte · morph 50 % = notch a −6 dB)', peak: analyze(bN).peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'filtro BP / notch (Goertzel en el corte · morph 50 % = notch a −6 dB)', peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // 9 · LFO S&H y deriva. (1) Los buffers: S&H = escalones (constante dentro
    // de cada unidad, salta entre unidades), deriva = continua (salto por
    // muestra ínfimo), pico 1 y loop sin costura. (2) En el motor: cutoff con
    // 'sh' y 'drift' suena, difiere del seno y entre sí; el tilt espectral por
    // ventanas de 4 periodos es una ESCALERA con S&H (la mayoría de ventanas no
    // cambian) y no da saltos grandes con la deriva. (3) La matriz lee la
    // fuente nueva (lfoCut→cutoff con Level del LFO a 0: S&H ≠ seno).
    body.appendChild(el('st-cat', 'LFO S&H / deriva'));
    let r;
    try {
      const probs = [];
      const bufs = lfoBuffers(new OfflineAudioContext(1, 8, SR));
      const sh = bufs.sh.getChannelData(0), dr = bufs.drift.getChannelData(0), uLen = Math.round(8000 * bufs.unit), steps = sh.length / uLen;
      let flat = true, jumps = 0;
      for (let k = 0; k < steps; k++) { const v = sh[k * uLen]; for (let i = 1; i < uLen; i += 97) if (sh[k * uLen + i] !== v) flat = false; if (k && Math.abs(v - sh[(k - 1) * uLen]) > 0.05) jumps++; }
      if (!flat) probs.push('S&H: no es constante dentro del escalón');
      if (jumps < steps * 0.8) probs.push('S&H: solo ' + jumps + ' saltos de ' + (steps - 1));
      let maxD = 0, pk = 0; for (let i = 1; i < dr.length; i++) { maxD = Math.max(maxD, Math.abs(dr[i] - dr[i - 1])); pk = Math.max(pk, Math.abs(dr[i])); }
      if (!(maxD < 0.01)) probs.push('deriva: salto por muestra ' + maxD.toFixed(4));
      if (!(pk > 0.99 && pk <= 1.0001)) probs.push('deriva: pico ' + pk.toFixed(3) + ' ≠ 1');
      if (!(Math.abs(dr[0] - dr[dr.length - 1]) < 0.01)) probs.push('deriva: costura en el loop ' + Math.abs(dr[0] - dr[dr.length - 1]).toFixed(3));
      const base = { waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 2500, reso: 3, cutLfoLvl: 1800, cutLfoSpd: 6, a: 0.005, d: 0.05, s: 1, r: 0.05, master: 0.7 };
      const rend = async extra => { loadState({ ...base, ...extra }); return renderOne(structuredClone(engine.S), { secs: 1.3, offAt: 1.1 }); };
      const diffB = (x, y) => { const cX = x.getChannelData(0), cY = y.getChannelData(0), len = Math.min(cX.length, cY.length); let d = 0, en = 0;
        for (let k = 0; k < len; k += 4) { const e = cX[k] - cY[k]; d += e * e; en += cX[k] * cX[k]; } return Math.sqrt(d / Math.max(1e-12, en)); };
      const bSin = await rend({ cutLfoShape: 'sine' }), bSH = await rend({ cutLfoShape: 'sh' }), bDr = await rend({ cutLfoShape: 'drift', cutLfoSpd: 1.5 });
      for (const [n, b] of [['seno', bSin], ['S&H', bSH], ['deriva', bDr]]) { const a = analyze(b); if (a.bad) probs.push(n + ': NaN/Inf'); if (a.peak <= SILENCE) probs.push(n + ': silencio'); if (a.peak > 1) probs.push(n + ': clipping ' + dB(a.peak)); }
      const dSH = diffB(bSin, bSH), dDr = diffB(bSin, bDr), dX = diffB(bSH, bDr);
      if (!(dSH > 0.1 && dDr > 0.1 && dX > 0.1)) probs.push('las formas no se distinguen (diffs ' + dSH.toFixed(2) + ' / ' + dDr.toFixed(2) + ' / ' + dX.toFixed(2) + ')');
      const W = 4 / NOTE1;   // ventanas de 4 periodos exactos de C3 (30,6 ms): dentro de un escalón la señal es periódica y el tilt no oscila
      const tilts = b => { const out = []; for (let t = 0.2; t < 1.0; t += W) out.push(tiltW(b, t, t + W)); return out; };
      const stair = ts => { const d = ts.slice(1).map((v, i) => Math.abs(v - ts[i])), range = Math.max(...ts) - Math.min(...ts);
        return { still: d.filter(x => x < range * 0.03).length / d.length, maxJump: Math.max(...d) / range }; };
      const sSH = stair(tilts(bSH)), sDr = stair(tilts(bDr));
      if (!(sSH.still > 0.6)) probs.push('S&H no es escalera (solo ' + (sSH.still * 100).toFixed(0) + ' % de ventanas quietas)');
      if (!(sDr.maxJump < 0.35)) probs.push('la deriva da saltos (máximo ' + (sDr.maxJump * 100).toFixed(0) + ' % del rango por ventana)');
      const bMx1 = await rend({ cutLfoLvl: 0, cutLfoShape: 'sine', mx1src: 'lfoCut', mx1dst: 'cutoff', mx1amt: 0.8 });
      const bMx2 = await rend({ cutLfoLvl: 0, cutLfoShape: 'sh', mx1src: 'lfoCut', mx1dst: 'cutoff', mx1amt: 0.8 });
      const dMx = diffB(bMx1, bMx2);
      if (!(dMx > 0.1)) probs.push('la matriz no ve la forma S&H (diff ' + dMx.toFixed(2) + ')');
      console.log('lfo sh deriva: diffs vs seno', dSH.toFixed(2), dDr.toFixed(2), '· S&H ventanas quietas', (sSH.still * 100).toFixed(0) + '%', '· deriva salto máx', (sDr.maxJump * 100).toFixed(0) + '%', '· matriz', dMx.toFixed(2));
      r = { name: 'LFO S&H / deriva (buffers · formas distintas · escalera vs continuo · matriz)', peak: analyze(bSH).peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'LFO S&H / deriva (buffers · formas distintas · escalera vs continuo · matriz)', peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  // ---------- Roadmap 5.0 · bloque 1: tiempo ×10 + octava por oscilador ----------
  {
    body.appendChild(el('st-cat', 'Tiempo ×10 y octava'));
    const rmsW = (buf, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
      let s = 0; for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
    // Octava por oscilador: frecuencia fundamental por cruces por cero de un seno
    // limpio (C3 = 130,81 Hz: a −1 deben salir ~65,4 Hz, a +1 ~261,6) y el glide
    // en mono conserva la octava (glideTo multiplica por el ratio del oscilador).
    {
      const NAME = 'octava por oscilador (−1 = sub · +1 · el glide conserva la octava)';
      let r;
      try {
        const probs = [];
        const base = { waveA: 'sine', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.005, d: 0.05, s: 1, r: 0.05, width: 0 };
        const hzOf = (buf, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
          let n = 0; for (let i = i0 + 1; i < i1; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) n++; return n / 2 / ((i1 - i0) / SR); };
        const one = async st => { loadState(st); return renderOne(structuredClone(engine.S), { secs: 1.6, offAt: 1.5 }); };
        const b0 = await one({ ...base, octA: 0 }), bSub = await one({ ...base, octA: -1 }), bUp = await one({ ...base, octA: 1 });
        const f0 = hzOf(b0, 0.5, 1.5), fSub = hzOf(bSub, 0.5, 1.5), fUp = hzOf(bUp, 0.5, 1.5);
        if (!(Math.abs(f0 - NOTE1) < 2)) probs.push('octava 0 no da C3 (' + f0.toFixed(1) + ' Hz)');
        if (!(Math.abs(fSub - NOTE1 / 2) < 1.5)) probs.push('octava −1 no da C2 (' + fSub.toFixed(1) + ' Hz)');
        if (!(Math.abs(fUp - NOTE1 * 2) < 3)) probs.push('octava +1 no da C4 (' + fUp.toFixed(1) + ' Hz)');
        // glide mono: C3 → G3 con octava −1 debe acabar en G2 (98 Hz)
        loadState({ ...base, octA: -1, mode: 'mono', glide: 0.2 });
        const ctxG = new OfflineAudioContext(2, Math.ceil(SR * 1.6), SR);
        const eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctxG);
        eng.noteOn('g1', NOTE1);
        ctxG.suspend(0.5).then(() => { eng.noteOn('g2', NOTE2); ctxG.resume(); });
        const bG = await ctxG.startRendering();
        const fG = hzOf(bG, 1.0, 1.5);
        if (!(Math.abs(fG - NOTE2 / 2) < 1.5)) probs.push('el glide no conserva la octava (' + fG.toFixed(1) + ' Hz, esperado ' + (NOTE2 / 2).toFixed(1) + ')');
        console.log('octava: 0 / −1 / +1', f0.toFixed(1), fSub.toFixed(1), fUp.toFixed(1), 'Hz · glide a −1 acaba en', fG.toFixed(1), 'Hz');
        r = { name: NAME, peak: analyze(bSub).peak, ok: !probs.length, problems: probs };
      } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] }; }
      push(r);
    }
    // Tiempos ×10: ataque de 10 s (rampa lineal: el nivel a 1 s es la mitad que a
    // 2 s), release de 20 s (a 2 s de soltar queda ~90 %), la tabla PARAMS es
    // coherente (todo log tiene suelo; con min 0, la posición 0 es 0 exacto) y los
    // controles devuelven EXACTO lo que se les pone (los sliders ya no cuantizan).
    {
      const NAME = 'tiempos ×10 (ataque 10 s · release 20 s · PARAMS log con 0 exacto · controles exactos)';
      let r;
      try {
        const probs = [];
        const base = { waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, d: 0.1, s: 1, width: 0, envCurve: 0 };
        loadState({ ...base, a: 10, r: 0.1 });
        const bA = await renderOne(structuredClone(engine.S), { secs: 2.2, offAt: 2.1 });
        const qA = rmsW(bA, 0.9, 1.0) / Math.max(1e-9, rmsW(bA, 1.9, 2.0));
        if (!(qA > 0.4 && qA < 0.6)) probs.push('ataque de 10 s: nivel a 1 s / a 2 s = ' + qA.toFixed(3) + ' (esperado ≈0,49)');
        loadState({ ...base, a: 0.005, r: 20 });
        const bR = await renderOne(structuredClone(engine.S), { secs: 2.5, offAt: 0.3 });
        const qR = rmsW(bR, 2.2, 2.4) / Math.max(1e-9, rmsW(bR, 0.1, 0.3));
        if (!(qR > 0.8 && qR < 0.97)) probs.push('release de 20 s: nivel a 2 s de soltar / sostenido = ' + qR.toFixed(3) + ' (esperado ≈0,90)');
        for (const k in PARAMS) {
          const p = PARAMS[k]; if (!p.log) continue;
          const lo = p.min > 0 ? p.min : p.lmin;
          if (!(lo > 0 && lo < p.max)) { probs.push(k + ': log sin suelo'); continue; }
          for (const v of [p.def, lo * 3, p.max]) if (!(Math.abs(posToVal(p, valToPos(p, v)) - v) <= 1e-9 * Math.max(1, v))) probs.push(k + ': ida y vuelta de ' + v + ' → ' + posToVal(p, valToPos(p, v)));
          if (p.min === 0 && (valToPos(p, 0) !== 0 || posToVal(p, 0) !== 0)) probs.push(k + ': el 0 no es la posición 0');
        }
        const ex = (name, v) => { CONTROLS[name].set(v); const g = CONTROLS[name].get(); if (g !== v) probs.push(name + ': set ' + v + ' → get ' + g); };
        ex('a', 12.345); ex('a', 0); ex('d', 0.001); ex('r', 30); ex('cutoff', 1180); ex('cutLfoSpd', 0.005); ex('glide', 0); ex('reverbSize', 20);
        loadState({});
        console.log('tiempos largos: ataque 10 s nivel 1 s/2 s', qA.toFixed(3), '· release 20 s a 2 s', qR.toFixed(3));   // (prefijo sin «×» ni comas: el runner filtra los logs de medida por /^[a-z0-9 ]+:/)
        r = { name: NAME, peak: analyze(bR).peak, ok: !probs.length, problems: probs };
      } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] }; }
      push(r);
    }
    // LFO a 0,005 Hz de verdad: el seno nativo recorre sin(2π·0,005·1 s) = 0,031
    // en un segundo (ni recortado a 0,05 ni parado) y el S&H (buffer a
    // playbackRate 0,0005) mantiene su escalón durante todo el render.
    {
      const NAME = 'LFO a 0,005 Hz (seno nativo y S&H por buffer)';
      let r;
      try {
        const probs = [];
        const ctxL = new OfflineAudioContext(2, SR, SR);
        const merge = ctxL.createChannelMerger(2); merge.connect(ctxL.destination);
        const l1 = mkLFO(ctxL, 0.005, 1); l1.out.connect(merge, 0, 0);
        const l2 = mkLFO(ctxL, 0.005, 1); setLfoShape(ctxL, l2, 'sh'); l2.out.connect(merge, 0, 1);
        const b = await ctxL.startRendering();
        const s = b.getChannelData(0), h = b.getChannelData(1);
        let sMax = -2, sMin = 2, hMax = -2, hMin = 2;
        for (let i = 0; i < s.length; i++) { if (s[i] > sMax) sMax = s[i]; if (s[i] < sMin) sMin = s[i]; if (h[i] > hMax) hMax = h[i]; if (h[i] < hMin) hMin = h[i]; }
        const esperado = Math.sin(2 * Math.PI * 0.005);
        if (!(Math.abs(sMax - esperado) < 0.004 && sMin > -1e-4)) probs.push('seno a 0,005 Hz: máx ' + sMax.toFixed(4) + ' mín ' + sMin.toFixed(4) + ' (esperado sube hasta ' + esperado.toFixed(4) + ')');
        if (!(hMax - hMin < 1e-4)) probs.push('S&H a 0,005 Hz cambia de escalón en 1 s (rango ' + (hMax - hMin).toExponential(2) + ')');
        console.log('lfo lento: seno a 0,005 Hz máx', sMax.toFixed(4), 'esperado', esperado.toFixed(4), '· S&H rango', (hMax - hMin).toExponential(2));
        r = { name: NAME, peak: Math.abs(sMax), ok: !probs.length, problems: probs };
      } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] }; }
      push(r);
    }
    // Sala y delay largos: la IR de 20 s mide 20 s y a los 10 s conserva
    // (1/2)^2,5 ≈ 18 % de su nivel inicial; plateDecay es monótona hasta 20 s y
    // queda bajo el tope del worklet (0,98); con un pluck, la cola de Size 20 a
    // los 3,5 s es ≫ que la de Size 4 (IR y placa); el delay a 3,5 s devuelve el
    // eco donde toca (antes la línea medía 2 s y el tiempo se recortaba).
    {
      const NAME = 'sala y delay largos (IR 20 s · placa hasta 20 s · eco a 3,5 s)';
      let r;
      try {
        const probs = [];
        const ctxI = new OfflineAudioContext(2, SR, SR);
        const tIR = performance.now(), ir = makeIR(ctxI, 20, 2.5, 0), msIR = performance.now() - tIR;
        if (ir.length !== 20 * SR) probs.push('la IR de 20 s mide ' + ir.length + ' muestras');
        const qIR = rmsW(ir, 9.9, 10.1) / Math.max(1e-9, rmsW(ir, 0.05, 0.25));
        if (!(qIR > 0.12 && qIR < 0.26)) probs.push('IR a los 10 s / inicio = ' + qIR.toFixed(3) + ' (esperado ≈0,18)');
        const pd = [4, 8.25, 12, 16.2, 20].map(plateDecay);
        if (!pd.every((v, i) => i === 0 || v > pd[i - 1]) || !(pd[4] > 0.93 && pd[4] < 0.98)) probs.push('plateDecay no es monótona/acotada: ' + pd.map(x => x.toFixed(3)).join(' '));
        const pl = { waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 8000, reso: 0.7, a: 0.002, d: 0.08, s: 0, r: 0.05, width: 0, reverbMix: 0.6, reverbPre: 0 };
        const colas = {};
        for (const type of ['sala', 'placa']) {
          loadState({ ...pl, reverbType: type, reverbSize: 4 });
          const b4 = await renderOne(structuredClone(engine.S), { secs: 4, offAt: 0.1 });
          loadState({ ...pl, reverbType: type, reverbSize: 20 });
          const b20 = await renderOne(structuredClone(engine.S), { secs: 4, offAt: 0.1 });
          const c20 = rmsW(b20, 3.5, 4), c4 = rmsW(b4, 3.5, 4);
          colas[type] = [c20, c4];
          if (!(c20 > 1e-3 * HR)) probs.push(type + ': Size 20 sin cola audible a los 3,5 s (' + dB(c20) + ')');
          if (!(c20 > 3 * c4)) probs.push(type + ': la cola de Size 20 a los 3,5 s no es ≫ que la de Size 4 (' + dB(c20) + ' vs ' + dB(c4) + ')');
          if (analyze(b20).bad) probs.push(type + ': NaN/Inf con Size 20');
        }
        const dl = { waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 8000, reso: 0.7, a: 0.002, d: 0.05, s: 0, r: 0.05, width: 0,
                     dlyAmt: 0.6, dlyTime: 3.5, dlySync: 'libre', dlyDamp: 0, reverbMix: 0 };
        loadState(dl);
        const bD = await renderOne(structuredClone(engine.S), { secs: 4.2, offAt: 0.1 });
        const eco = rmsW(bD, 3.5, 3.8), hueco = rmsW(bD, 2.0, 3.4);
        if (!(eco > 1e-3 && eco > 10 * hueco)) probs.push('eco de 3,5 s: ' + dB(eco) + ' frente a ' + dB(hueco) + ' en el hueco anterior');
        loadState({});
        console.log('sala larga: IR 20 s en', msIR.toFixed(0), 'ms · nivel a 10 s', qIR.toFixed(3), '· plateDecay 4/8,25/12/16,2/20 =', pd.map(x => x.toFixed(3)).join(' '),
                    '· cola 3,5 s IR 20/4', dB(colas.sala[0]), dB(colas.sala[1]), '· placa 20/4', dB(colas.placa[0]), dB(colas.placa[1]), '· eco 3,5 s', dB(eco), 'hueco', dB(hueco));
        r = { name: NAME, peak: analyze(bD).peak, ok: !probs.length, problems: probs };
      } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] }; }
      push(r);
    }
  }

  // ---------- Roadmap 5.0 · bloque 2: deriva por voz + fase por voz ----------
  {
    body.appendChild(el('st-cat', 'Deriva y fase por voz'));
    // Pista de amplitud de UNA nota dentro del acorde: Goertzel con ventana Hann
    // por saltos de 50 ms a la frecuencia de la nota (la otra nota cae a más de
    // tres bins y la Hann la deja por debajo de −31 dB). Amplitud por ventana.
    const track = (buf, f, t0, t1, hop = 0.05) => {
      const d = buf.getChannelData(0), N = Math.floor(hop * SR), w = 2 * Math.PI * f / SR, c = 2 * Math.cos(w), out = [];
      for (let t = t0; t + hop <= t1 + 1e-9; t += hop) {
        const i0 = Math.floor(t * SR); let s1 = 0, s2 = 0;
        for (let i = 0; i < N; i++) { const x = d[i0 + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); const s0 = x + c * s1 - s2; s2 = s1; s1 = s0; }
        out.push(Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / N);
      }
      return out;
    };
    const corr = (a, b) => { const n = Math.min(a.length, b.length); let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
      let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
      return sab / Math.sqrt(Math.max(1e-18, saa * sbb)); };
    const swing = a => Math.max(...a) / Math.max(1e-9, Math.min(...a));
    // acorde C3 + G3 pulsado a la vez y sostenido todo el render
    const chord = async (st, secs = 2.5) => { loadState(st); const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
      const eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctx);
      eng.noteOn('c1', NOTE1); eng.noteOn('c2', NOTE2); return ctx.startRendering(); };
    // Nivel bajo a propósito: dos senos con la amplitud modulada hasta ×2 sumarían
    // ~2,0 y el LIMITADOR de la Sala (umbral −3 dB) los comprimiría juntos,
    // acoplando las dos pistas (corr falsa). Así el pico del acorde queda en ~0,4.
    const base = { waveA: 'sine', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.005, d: 0.05, s: 1, r: 0.05, width: 0, amplitude: 0.25, master: 0.4 };
    // Fase por voz: con el LFO de cutoff (crudo, vía matriz → amplitud) las dos
    // notas suben y bajan juntas en 'global' (corr ≈ 1) y desfasadas 0,618 de
    // ciclo en 'voz' (corr ≈ cos(2π·0,618) = −0,74). La primera voz en 'voz'
    // suena como en 'global' (fase 0: el buffer seno ≡ el oscilador nativo).
    {
      const NAME = 'fase por voz de los LFO (global: a la vez · por voz: desfasadas 0,618 de ciclo · voz 0 = el global · buffers de forma)';
      let r;
      try {
        const probs = [];
        const st = { ...base, cutLfoLvl: 0, cutLfoSpd: 1, cutLfoShape: 'sine', mx1src: 'lfoCut', mx1dst: 'amp', mx1amt: 0.8 };
        const bG = await chord({ ...st, lfoPhase: 'global' }), bV = await chord({ ...st, lfoPhase: 'voz' });
        const g1 = track(bG, NOTE1, 0.3, 2.3), g2 = track(bG, NOTE2, 0.3, 2.3), v1 = track(bV, NOTE1, 0.3, 2.3), v2 = track(bV, NOTE2, 0.3, 2.3);
        const cG = corr(g1, g2), cV = corr(v1, v2), c11 = corr(g1, v1);
        if (!(swing(g1) > 2 && swing(v1) > 2 && swing(v2) > 2)) probs.push('el LFO no mueve la amplitud (vaivén ' + [swing(g1), swing(v1), swing(v2)].map(x => x.toFixed(2)).join(' / ') + ')');
        if (!(cG > 0.95)) probs.push('fase global: las dos notas no van a la vez (corr ' + cG.toFixed(3) + ')');
        if (!(cV < -0.4)) probs.push('fase por voz: las dos notas no van desfasadas (corr ' + cV.toFixed(3) + ', esperado ≈ −0,74)');
        if (!(c11 > 0.98)) probs.push('la primera voz en «por voz» no suena como en «global» (corr ' + c11.toFixed(3) + ')');
        // buffers de las formas nativas: las fases del oscilador nativo (sin/tri/saw arrancan en 0 subiendo, sqr en +1)
        const bf = lfoBuffers(new OfflineAudioContext(1, 8, SR)), q = n => bf[n].getChannelData(0), L = bf.sine.length;
        const okB = Math.abs(q('sine')[L / 4] - 1) < 1e-3 && q('square')[0] === 1 && q('square')[L / 2] === -1
          && Math.abs(q('triangle')[L / 4] - 1) < 1e-3 && Math.abs(q('sawtooth')[L / 4] - 0.5) < 1e-3 && Math.abs(q('sawtooth')[L / 2] + 1) < 1e-3;
        if (!okB) probs.push('los buffers de forma no reproducen las fases del oscilador nativo');
        console.log('fase por voz: corr global', cG.toFixed(3), '· por voz', cV.toFixed(3), '· voz 0 vs global', c11.toFixed(3), '· vaivén', swing(v1).toFixed(2));
        r = { name: NAME, peak: analyze(bV).peak, ok: !probs.length, problems: probs };
      } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] }; }
      push(r);
    }
    // Deriva por voz: fuente 'drift' → amplitud a 3 Hz (rápida para que se vea en
    // 2 s): cada nota vaga por su cuenta (las dos se mueven y no van a la par), el
    // render es REPRODUCIBLE (secuencia de Weyl: dos renders iguales bit a bit) y
    // a 0,005 Hz la deriva apenas se mueve en 2 s.
    {
      const NAME = 'deriva por voz (fuente «Deriva (voz)» · voces descorreladas · render reproducible · a 0,005 Hz quieta)';
      let r;
      try {
        const probs = [];
        const st = { ...base, mx1src: 'drift', mx1dst: 'amp', mx1amt: 1, mxDriftSpd: 3 };
        const bA = await chord(st), bB = await chord(st);
        const a1 = track(bA, NOTE1, 0.3, 2.3), a2 = track(bA, NOTE2, 0.3, 2.3);
        const cD = corr(a1, a2);
        if (!(swing(a1) > 1.5 && swing(a2) > 1.5)) probs.push('la deriva no mueve la amplitud (vaivén ' + swing(a1).toFixed(2) + ' / ' + swing(a2).toFixed(2) + ')');
        if (!(Math.abs(cD) < 0.85)) probs.push('las dos voces derivan igual (corr ' + cD.toFixed(3) + ')');
        const dA = bA.getChannelData(0), dB = bB.getChannelData(0); let md = 0;
        for (let i = 0; i < dA.length; i++) { const e = Math.abs(dA[i] - dB[i]); if (e > md) md = e; }
        if (!(md < 1e-6)) probs.push('dos renders iguales difieren (máx |Δ| ' + md.toExponential(2) + '): la deriva no es determinista');
        const bS = await chord({ ...st, mxDriftSpd: 0.005 });
        const s1 = track(bS, NOTE1, 0.3, 2.3);
        if (!(swing(s1) < 1.3)) probs.push('a 0,005 Hz la deriva se mueve demasiado en 2 s (vaivén ' + swing(s1).toFixed(3) + ')');
        console.log('deriva por voz: corr entre notas', cD.toFixed(3), '· vaivén', swing(a1).toFixed(2), swing(a2).toFixed(2), '· renders máx |Δ|', md.toExponential(2), '· a 0,005 Hz vaivén', swing(s1).toFixed(3));
        r = { name: NAME, peak: analyze(bA).peak, ok: !probs.length, problems: probs };
      } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] }; }
      push(r);
    }
  }

  // ---------- Roadmap 5.0 · bloque 3: shimmer + freeze ----------
  {
    body.appendChild(el('st-cat', 'Shimmer y freeze'));
    const rmsW = (buf, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
      let s = 0; for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
    const goertzel = (buf, f, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR)), N = i1 - i0;
      const c = 2 * Math.cos(2 * Math.PI * f / SR); let s1 = 0, s2 = 0;
      for (let i = i0; i < i1; i++) { const s0 = d[i] + c * s1 - s2; s2 = s1; s1 = s0; }
      return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / N; };
    // El desplazador a solas: un seno de 440 Hz entra y sale a 880 (+12) o a
    // 659,3 (+7), con el fundamental original ≫ por debajo y la energía conservada
    // (sen² + cos² = 1 entre las dos cabezas).
    {
      const NAME = 'desplazador de tono (440 Hz → 880 a +12 · → 659 a +7 · energía conservada)';
      let r;
      try {
        const probs = [];
        const shift = async semis => {
          const ctx = new OfflineAudioContext(1, Math.ceil(SR * 2), SR); await loadWorklets(ctx);
          const osc = ctx.createOscillator(); osc.frequency.value = 440;
          const sh = new AudioWorkletNode(ctx, 'shift-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
          sh.parameters.get('semitones').value = semis;
          osc.connect(sh); sh.connect(ctx.destination); osc.start();
          return ctx.startRendering();
        };
        const b12 = await shift(12), b7 = await shift(7);
        const q12 = goertzel(b12, 880, 0.5, 2) / Math.max(1e-9, goertzel(b12, 440, 0.5, 2));
        const q7 = goertzel(b7, 440 * Math.pow(2, 7 / 12), 0.5, 2) / Math.max(1e-9, goertzel(b7, 440, 0.5, 2));
        const e12 = rmsW(b12, 0.5, 2) / Math.SQRT1_2;   // RMS de un seno de amplitud 1 = 0,707
        if (!(q12 > 10)) probs.push('+12: 880 Hz / 440 Hz = ' + q12.toFixed(1) + ' (esperado ≫ 1)');
        if (!(q7 > 10)) probs.push('+7: 659 Hz / 440 Hz = ' + q7.toFixed(1) + ' (esperado ≫ 1)');
        if (!(e12 > 0.5 && e12 < 1.4)) probs.push('+12: la energía no se conserva (RMS relativo ' + e12.toFixed(2) + ')');
        if (analyze(b12).bad) probs.push('NaN/Inf');
        console.log('desplazador: +12 880/440', q12.toFixed(1), '· +7 659/440', q7.toFixed(1), '· energía', e12.toFixed(2));
        r = { name: NAME, peak: analyze(b12).peak, ok: !probs.length, problems: probs };
      } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] }; }
      push(r);
    }
    // Shimmer en la Sala: un pluck (Size 4) con y sin bucle, en la placa y en la
    // IR. Con shimmer a tope la cola a los 3-4 s es más brillante (tilt) y MUCHO
    // más densa (RMS) que sin él, y no crece (energía por vuelta 0,8 < 1): a los
    // 7-8 s pesa menos que a los 2-3 s. La ganancia del bucle sale de la energía
    // de la reverb (reverbEnergyGain): se comprueba que el valor calculado para
    // la placa a Size 4 reproduce la medida de Node (0,19).
    {
      const NAME = 'shimmer en la Sala (placa e IR: la cola se aclara y se llena · estable con el bucle a tope · ganancia calibrada)';
      let r;
      try {
        const probs = [], med = {};
        const pl = { waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 6000, reso: 0.7, a: 0.002, d: 0.1, s: 0, r: 0.05, width: 0,
                     reverbMix: 0.6, reverbSize: 4, reverbDamp: 0, reverbPre: 0, shimInt: '+12' };
        let peak = 0;
        for (const type of ['placa', 'sala']) {
          loadState({ ...pl, reverbType: type, shimAmt: 0 });
          const b0 = await renderOne(structuredClone(engine.S), { secs: 8, offAt: 0.1 });
          loadState({ ...pl, reverbType: type, shimAmt: 1 });
          const b1 = await renderOne(structuredClone(engine.S), { secs: 8, offAt: 0.1 });
          const t0 = tiltW(b0, 3, 4), t1 = tiltW(b1, 3, 4), e0 = rmsW(b0, 3, 4), e1 = rmsW(b1, 3, 4);
          const crece = rmsW(b1, 7, 8) / Math.max(1e-9, rmsW(b1, 2, 3));
          med[type] = { t0, t1, e0, e1, crece };
          if (!(e1 > 1e-3 * HR)) probs.push(type + ': sin cola con shimmer (' + dB(e1) + ')');
          if (!(t1 > 1.5 * t0)) probs.push(type + ': el shimmer no aclara la cola (tilt ' + t1.toExponential(2) + ' vs ' + t0.toExponential(2) + ')');
          if (!(e1 > 3 * e0)) probs.push(type + ': el shimmer no llena la cola (rms ' + dB(e1) + ' vs ' + dB(e0) + ')');
          if (!(crece < 1)) probs.push(type + ': la cola CRECE con el bucle a tope (×' + crece.toFixed(2) + ' entre 2 s y 7 s)');
          const a1 = analyze(b1); peak = Math.max(peak, a1.peak);
          if (a1.bad || a1.peak > 1) probs.push(type + ': NaN/Inf o clipping con shimmer');
        }
        const gP = reverbEnergyGain('placa', 4), gI = reverbEnergyGain('sala', 4);
        if (!(Math.abs(gP - 0.189) < 0.01 && Math.abs(gI - 0.28) < 0.01)) probs.push('reverbEnergyGain a Size 4: placa ' + gP.toFixed(3) + ' (medido 0,189) · IR ' + gI.toFixed(3) + ' (0,280)');
        console.log('shimmer: placa tilt con/sin', med.placa.t1.toExponential(2), med.placa.t0.toExponential(2), 'rms', dB(med.placa.e1), dB(med.placa.e0), '7 s/2 s', med.placa.crece.toFixed(3),
                    '· IR tilt', med.sala.t1.toExponential(2), med.sala.t0.toExponential(2), 'rms', dB(med.sala.e1), dB(med.sala.e0), '7 s/2 s', med.sala.crece.toFixed(3), '· G placa/IR', gP.toFixed(3), gI.toFixed(3));
        r = { name: NAME, peak, ok: !probs.length, problems: probs };
      } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] }; }
      push(r);
    }
    // Freeze: pluck en una placa CORTA (Size 2); congelar a 0,5 s mantiene la cola
    // (a 5 s pesa como a 1 s) mientras que sin congelar se ha extinguido; soltar
    // a 3 s la deja caer; con la IR, setFreeze no hace nada (no hay estado).
    {
      const NAME = 'freeze (la cola se queda · suelta y cae · solo placa)';
      let r;
      try {
        const probs = [];
        const pl = { waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 6000, reso: 0.7, a: 0.002, d: 0.1, s: 0, r: 0.05, width: 0,
                     reverbType: 'placa', reverbMix: 0.6, reverbSize: 2, reverbDamp: 0, reverbPre: 0 };
        const rend = async (st, acciones) => { loadState(st); const ctx = new OfflineAudioContext(2, Math.ceil(SR * 6), SR);
          const eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctx);
          eng.noteOn('f', NOTE1); ctx.suspend(0.1).then(() => { eng.noteOff('f'); ctx.resume(); });
          for (const [t, fn] of acciones) ctx.suspend(t).then(() => { fn(eng); ctx.resume(); });
          return ctx.startRendering(); };
        const bLibre = await rend(pl, []);
        const bFrz = await rend(pl, [[0.5, e => { if (!e.sala.setFreeze(true)) probs.push('setFreeze(true) no actuó con la placa'); }]]);
        const bSuelta = await rend(pl, [[0.5, e => e.sala.setFreeze(true)], [3.0, e => e.sala.setFreeze(false)]]);
        let irOk = true;
        await rend({ ...pl, reverbType: 'sala' }, [[0.5, e => { irOk = e.sala.setFreeze(true) === false && !e.sala.frozen; }]]);
        const hold = rmsW(bFrz, 5, 5.5) / Math.max(1e-9, rmsW(bFrz, 1, 1.5)), libre = rmsW(bLibre, 5, 5.5) / Math.max(1e-9, rmsW(bLibre, 1, 1.5));
        const caida = rmsW(bSuelta, 5.5, 6) / Math.max(1e-9, rmsW(bSuelta, 2.5, 3));
        if (!(rmsW(bFrz, 5, 5.5) > 1e-3)) probs.push('congelada, la cola se apaga (' + dB(rmsW(bFrz, 5, 5.5)) + ' a los 5 s)');
        if (!(hold > 0.6 && hold < 1.5)) probs.push('congelada, la cola no se mantiene (5 s / 1 s = ' + hold.toFixed(3) + ')');
        if (!(libre < 0.05)) probs.push('sin congelar, la cola de Size 2 debería haberse extinguido (5 s / 1 s = ' + libre.toFixed(3) + ')');
        if (!(caida < 0.2)) probs.push('al soltar no cae (6 s / 3 s = ' + caida.toFixed(3) + ')');
        if (!irOk) probs.push('con la IR, setFreeze debería no hacer nada');
        if (analyze(bFrz).bad || analyze(bFrz).peak > 1) probs.push('NaN/Inf o clipping congelada');
        console.log('freeze: 5 s / 1 s congelada', hold.toFixed(3), '· libre', libre.toExponential(2), '· tras soltar 6 s / 3 s', caida.toExponential(2));
        r = { name: NAME, peak: analyze(bFrz).peak, ok: !probs.length, problems: probs };
      } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] }; }
      push(r);
    }
  }

  // ---------- Roadmap 5.0 · bloque 4: fuentes de ejecución ----------
  // Rueda, aftertouch y expresión como fuentes de la matriz (0..1 por motor). Se
  // fija el valor con la API (setPerf) antes de la nota y se mide el efecto por el
  // camino real: rueda → cutoff abre (tilt), aftertouch → pitch sube 600 ct (cruces
  // por cero), expresión → amplitud a −0,8 deja el 20 %. Y el MIDI sintético (CC1,
  // presión de canal, CC11) llega a las fuentes del motor en vivo; la rueda en
  // pantalla sigue al CC1.
  {
    body.appendChild(el('st-cat', 'Fuentes de ejecución'));
    const NAME = 'fuentes de ejecución (rueda → cutoff · aftertouch → pitch 600 ct · expresión → amplitud · MIDI CC1/presión/CC11 · la rueda sigue al CC1)';
    let r;
    try {
      const probs = [];
      const rmsW = (buf, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        let s = 0; for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
      const hzOf = (buf, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        let n = 0; for (let i = i0 + 1; i < i1; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) n++; return n / 2 / ((i1 - i0) / SR); };
      const perfRender = async (st, id, v, secs = 1.2) => { loadState(st); const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
        const eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctx); eng.setPerf(id, v);
        eng.noteOn('p', NOTE1); return ctx.startRendering(); };
      const saw = { waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 400, reso: 0.7, filterSlope: '24', a: 0.005, d: 0.05, s: 1, r: 0.05, width: 0, amplitude: 0.3, master: 0.4 };
      const w0 = await perfRender({ ...saw, mx1src: 'wheel', mx1dst: 'cutoff', mx1amt: 0.6 }, 'wheel', 0);
      const w1 = await perfRender({ ...saw, mx1src: 'wheel', mx1dst: 'cutoff', mx1amt: 0.6 }, 'wheel', 1);
      const tw = tiltW(w1, 0.3, 1.1) / Math.max(1e-12, tiltW(w0, 0.3, 1.1));
      if (!(tw > 3)) probs.push('la rueda no abre el filtro (tilt ×' + tw.toFixed(2) + ')');
      const sine = { waveA: 'sine', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.005, d: 0.05, s: 1, r: 0.05, width: 0, amplitude: 0.3, master: 0.4 };
      const atB = await perfRender({ ...sine, mx1src: 'at', mx1dst: 'pitch', mx1amt: 0.5 }, 'at', 1);
      const fAt = hzOf(atB, 0.3, 1.1), fEsp = NOTE1 * Math.pow(2, 0.5);
      if (!(Math.abs(fAt - fEsp) < 2.5)) probs.push('el aftertouch no sube el pitch 600 ct (' + fAt.toFixed(1) + ' Hz, esperado ' + fEsp.toFixed(1) + ')');
      const e0 = await perfRender({ ...sine, mx1src: 'expr', mx1dst: 'amp', mx1amt: -0.8 }, 'expr', 0);
      const e1 = await perfRender({ ...sine, mx1src: 'expr', mx1dst: 'amp', mx1amt: -0.8 }, 'expr', 1);
      const qe = rmsW(e1, 0.3, 1.1) / Math.max(1e-9, rmsW(e0, 0.3, 1.1));
      if (!(qe > 0.15 && qe < 0.25)) probs.push('la expresión no atenúa (×' + qe.toFixed(3) + ', esperado 0,20)');
      // MIDI sintético sobre el motor en vivo (sin dispositivo): CC1 a tope, presión 64, CC11 a 0
      handleMidi([0xb0, 1, 127]); handleMidi([0xd0, 64]); handleMidi([0xb0, 11, 0]);
      const pv = { ...engine.perfVal }, wheelEl = document.getElementById('kbWheel');
      if (!(pv.wheel === 1 && Math.abs(pv.at - 64 / 127) < 1e-9 && pv.expr === 0)) probs.push('MIDI → fuentes: ' + JSON.stringify(pv));
      if (wheelEl && +wheelEl.value !== 1) probs.push('la rueda en pantalla no sigue al CC1 (' + wheelEl.value + ')');
      handleMidi([0xb0, 1, 0]); handleMidi([0xd0, 0]);   // reposo
      loadState({});
      console.log('ejecucion: rueda tilt x', tw.toFixed(2), '· aftertouch', fAt.toFixed(1), 'Hz (esperado', fEsp.toFixed(1) + ')', '· expresion x', qe.toFixed(3), '· MIDI', JSON.stringify(pv));
      r = { name: NAME, peak: analyze(w1).peak, ok: !probs.length, problems: probs };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  // ---------- Roadmap 5.0 · bloque 7: cinta en el máster ----------
  // Saturación: un seno de C3 gana 3er armónico (392 Hz) a tope y no lo tiene a 0,
  // sin saltar de nivel; y a 0,3 (la zona «un poco» del knob, que entra al
  // cuadrado) sigue siendo color, no recorte: 3er armónico < 2 %. Wow: un seno
  // de 440 Hz vaga más de 5 Hz (frecuencia instantánea por cruces por cero
  // interpolados, suavizada sobre 20 periodos) y sin wow se queda quieto. Y las
  // dos son claves de la Sala.
  {
    body.appendChild(el('st-cat', 'Cinta en el máster'));
    const NAME = 'cinta en el máster (saturación: armónicos sin saltar de nivel, suave a 0,3 · wow: el tono vaga · claves de la Sala)';
    let r;
    try {
      const probs = [];
      const rmsW = (buf, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        let s = 0; for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
      const goertzel = (buf, f, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR)), N = i1 - i0;
        const c = 2 * Math.cos(2 * Math.PI * f / SR); let s1 = 0, s2 = 0;
        for (let i = i0; i < i1; i++) { const s0 = d[i] + c * s1 - s2; s2 = s1; s1 = s0; }
        return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / N; };
      const instFreq = (buf, t0, t1, avg = 20) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR)), cross = [];
        for (let i = i0 + 1; i < i1; i++) if (d[i - 1] < 0 && d[i] >= 0) cross.push(i - 1 + (-d[i - 1]) / (d[i] - d[i - 1]));
        const f = []; for (let k = avg; k < cross.length; k++) f.push(SR * avg / (cross[k] - cross[k - avg])); return f; };
      const spread = f => f.length ? Math.max(...f) - Math.min(...f) : NaN;
      const one = async (st, freq, secs) => { loadState(st); const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
        const eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctx); if (freq) eng.noteOn('c', freq); return ctx.startRendering(); };
      const sine = { waveA: 'sine', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.005, d: 0.05, s: 1, r: 0.05, width: 0 };
      const h3 = buf => goertzel(buf, 3 * NOTE1, 0.3, 1.1) / Math.max(1e-9, goertzel(buf, NOTE1, 0.3, 1.1));
      const s0 = await one({ ...sine, tapeSat: 0 }, NOTE1, 1.2), s1 = await one({ ...sine, tapeSat: 1 }, NOTE1, 1.2), sM = await one({ ...sine, tapeSat: 0.3 }, NOTE1, 1.2);
      const h0 = h3(s0), h1 = h3(s1), hM = h3(sM);
      const lvl = rmsW(s1, 0.3, 1.1) / Math.max(1e-9, rmsW(s0, 0.3, 1.1));
      if (!(h0 < 0.003)) probs.push('a saturación 0 hay 3er armónico (' + h0.toFixed(4) + '): no es transparente');
      if (!(h1 > 0.03)) probs.push('a saturación 1 no aparece el 3er armónico (' + h1.toFixed(4) + ')');
      if (!(hM < 0.02)) probs.push('a saturación 0,3 ya recorta (3er armónico ' + hM.toFixed(4) + ', debe ser color: < 2 %)');
      if (!(lvl > 0.6 && lvl < 1.5)) probs.push('la saturación cambia el nivel (×' + lvl.toFixed(2) + ')');
      const w0 = await one({ ...sine, tapeWow: 0 }, 440, 3), w1 = await one({ ...sine, tapeWow: 1 }, 440, 3);
      const sp0 = spread(instFreq(w0, 0.5, 3)), sp1 = spread(instFreq(w1, 0.5, 3));
      if (!(sp0 < 0.05)) probs.push('sin wow el tono vaga (' + sp0.toFixed(3) + ' Hz)');
      if (!(sp1 > 8)) probs.push('con wow el tono no vaga lo bastante (' + sp1.toFixed(2) + ' Hz, esperado > 8 ≈ ±15 ct)');
      // el camino del KNOB: la Sala nace con wow 0 y se sube a 1 en vivo (set → smooth); a partir de 0,6 s debe vagar igual
      loadState({ ...sine, tapeWow: 0 });
      const ctxK = new OfflineAudioContext(2, Math.ceil(SR * 3), SR), engK = new AudioEngine(); engK.S = structuredClone(engine.S); await engK.init(ctxK);
      engK.noteOn('k', 440); ctxK.suspend(0.2).then(() => { engK.set('tapeWow', 1); ctxK.resume(); });
      const wK = await ctxK.startRendering(), spK = spread(instFreq(wK, 0.8, 3));
      if (!(spK > 8)) probs.push('subiendo el wow EN VIVO (set) el tono no vaga (' + spK.toFixed(2) + ' Hz)');
      if (!(['tapeSat', 'tapeWow'].every(k => SALA_KEYS.has(k)))) probs.push('las claves de cinta no son de la Sala');
      loadState({});
      console.log('cinta: 3er armonico a 0 / 0,3 / 1', h0.toFixed(4), hM.toFixed(4), h1.toFixed(4), '· nivel x', lvl.toFixed(2), '· wow Hz sin/con/en vivo', sp0.toFixed(3), sp1.toFixed(2), spK.toFixed(2));
      r = { name: NAME, peak: analyze(s1).peak, ok: !probs.length, problems: probs };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  // ---------- Roadmap 5.0 · bloque 5: resonador modal ----------
  // Tablas (razones de cuerda y barra, Q, ganancias normalizadas); después ruido +
  // seno en C3 por el banco (wet 1) y, con la nota aún pulsada (el VCA va detrás del
  // banco: soltarla mediría el release), se CORTA EL RUIDO: lo que sigue sonando son
  // los modos, y se mide esa cola libre. Medir el ruido mismo no vale: un Goertzel
  // sobre ruido es un sorteo de Rayleigh (2 grados de libertad, alargar la ventana no
  // lo promedia) y el cociente de dos sorteos fallaba ~7 % de las pasadas (medido con
  // 30 repeticiones, oct-2026). La cola es determinista en su RITMO, τ = Q/(π·f): el
  // ruido decide con cuánto empieza cada modo, no cómo se apaga.
  // Material 0 → tras el corte canta 2·f0 y no 2,756·f0; 1 → al revés. Decay 1 (Q 600)
  // → τ medido = teórico en los dos; Decay 0 (Q 10) → muerto a los 0,15 s. El cuenco
  // con ruido SUENA (refuerzo ∝ √Q); y en mono el banco sigue el glide (tras C3 → G3
  // la cola canta en 2·G3 y no en 2·C3).
  {
    body.appendChild(el('st-cat', 'Resonador'));
    const NAME = 'resonador modal (tablas · material cuerda↔barra, también por la matriz · Decay = τ de la cola · el cuenco con ruido suena · sigue el glide)';
    let r;
    try {
      const probs = [];
      const CUT = 1, RING = [CUT + 0.15, CUT + 0.55];   // s: corte del ruido y ventana de la cola (0,4 s: bins de 2,5 Hz, la fuga de 3·f0 no llega a 2,756·f0)
      const rmsW = (buf, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        let s = 0; for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
      // Goertzel con ventana de Hann: la fuga del seno en f0 hacia 2·f0 cae a ~−75 dB
      const hannG = (buf, f, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), N = Math.min(d.length, Math.floor(t1 * SR)) - i0;
        const c = 2 * Math.cos(2 * Math.PI * f / SR); let s1 = 0, s2 = 0;
        for (let i = 0; i < N; i++) { const s0 = d[i0 + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1))) + c * s1 - s2; s2 = s1; s1 = s0; }
        return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / N; };
      const ring = (buf, fa, fb, [t0, t1] = RING) => 20 * Math.log10(hannG(buf, fa, t0, t1) / (hannG(buf, fb, t0, t1) + 1e-12));   // dB: fa canta y fb no
      const tauAt = (buf, f) => {                        // regresión de ln|A| en ventanas de 0,1 s tras el corte: pendiente = −1/τ
        const xs = [], ys = [];
        for (let t = CUT + 0.15; t + 0.1 <= CUT + 1.45; t += 0.05) { xs.push(t + 0.05); ys.push(Math.log(hannG(buf, f, t, t + 0.1) + 1e-12)); }
        const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
        let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
        return -sxx / sxy; };
      const rh = resRatios(0), rb = resRatios(1), gg = resGains(rb, 0.5), e2 = gg.reduce((a, x) => a + x * x, 0);
      if (!(rh.every((x, i) => Math.abs(x - (i + 1)) < 1e-9) && Math.abs(rb[1] - 2.756) < 1e-9 && Math.abs(rb[5] - 18.638) < 1e-9)) probs.push('razones: ' + rh.map(x => x.toFixed(2)).join(',') + ' / ' + rb.map(x => x.toFixed(2)).join(','));
      if (!(Math.abs(resQ(0) - 10) < 1e-9 && Math.abs(resQ(1) - 600) < 1e-6)) probs.push('resQ: ' + resQ(0) + ' ' + resQ(1));
      if (!(Math.abs(e2 - 2) < 1e-9)) probs.push('ganancias no normalizadas (Σg² = ' + e2.toFixed(3) + ')');
      const ex = { waveA: 'sine', levelA: 1, levelB: 0, noise: 1, cutoff: 20000, reso: 0.7, a: 0.005, d: 0.05, s: 1, r: 0.05, width: 0, resAmt: 1, resDecay: 1, resBrillo: 0.6 };
      const rendCut = async (st, { cut = CUT, legato = 0 } = {}) => {   // ruido + seno; en `cut` se corta el ruido con la nota pulsada
        loadState(st);
        const ctx = new OfflineAudioContext(2, Math.ceil(SR * (CUT + 1.6)), SR), eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctx);
        eng.noteOn('t1', NOTE1);
        if (legato) ctx.suspend(0.5).then(() => { eng.noteOn('t2', legato); ctx.resume(); });
        ctx.suspend(cut).then(() => { eng.set('noise', 0); ctx.resume(); });
        return ctx.startRendering();
      };
      const bH = await rendCut({ ...ex, resMat: 0 }), bB = await rendCut({ ...ex, resMat: 1 });
      const rH = ring(bH, 2 * NOTE1, 2.756 * NOTE1), rB = ring(bB, 2.756 * NOTE1, 2 * NOTE1);
      if (!(rH > 30)) probs.push('cuerda: la cola no canta en 2·f0 (2f0 sobre 2,76f0 = ' + rH.toFixed(1) + ' dB, esperado > 30)');
      if (!(rB > 30)) probs.push('barra: la cola no canta en 2,76·f0 (2,76f0 sobre 2f0 = ' + rB.toFixed(1) + ' dB, esperado > 30)');
      // Material por la matriz (Roadmap 7.0 · 2.4): knob a 0 y +1 por la matriz = afinación de barra
      // (los pesos de los modos siguen los del knob: la matriz solo los reafina)
      const bM = await rendCut({ ...ex, resMat: 0, mx1src: 'vel', mx1dst: 'resMat', mx1amt: 1 }), rM = ring(bM, 2.756 * NOTE1, 2 * NOTE1);
      if (!(rM > 30)) probs.push('Material por la matriz: la cola no canta en 2,76·f0 (sobre 2f0 = ' + rM.toFixed(1) + ' dB, esperado > 30)');
      const tH = tauAt(bH, 2 * NOTE1), tB = tauAt(bB, 2.756 * NOTE1);
      const eH = resQ(1) / (Math.PI * 2 * NOTE1), eB = resQ(1) / (Math.PI * 2.756 * NOTE1);
      if (!(Math.abs(tH / eH - 1) < 0.05 && Math.abs(tB / eB - 1) < 0.05))
        probs.push('Decay 1 (Q 600): τ de la cola ' + tH.toFixed(3) + ' / ' + tB.toFixed(3) + ' s, esperado Q/(π·f) = ' + eH.toFixed(3) + ' / ' + eB.toFixed(3));
      const bQ0 = await rendCut({ ...ex, resMat: 0, resDecay: 0 });
      const drop0 = 20 * Math.log10(hannG(bQ0, 2 * NOTE1, CUT + 0.15, CUT + 0.25) / (hannG(bQ0, 2 * NOTE1, CUT - 0.15, CUT - 0.05) + 1e-12));
      if (!(drop0 < -30)) probs.push('Decay 0 (Q 10): el modo sigue sonando tras cortar el ruido (' + drop0.toFixed(1) + ' dB a los 0,15 s, esperado < −30)');
      // nivel SIN el margen del máster (HR, 1.1.0): con él dentro la mediana caía en −28 dB y el ruido
      // a Q 600 (banda de 0,4 Hz: casi un sorteo) bajaba alguna pasada de −30 (medido: −30,0…−27,1 en 20)
      const lvl = rmsW(bH, 0.5, CUT) / HR;
      if (!(lvl > 0.03 && lvl < 0.7)) probs.push('nivel del cuenco con ruido fuera de rango (' + dB(lvl) + ' sin el margen, esperado −30…−3 dB)');
      if (analyze(bH).bad || analyze(bH).peak > 1) probs.push('NaN/Inf o clipping a Q 600');
      const bG = await rendCut({ ...ex, resMat: 0, mode: 'mono', glide: 0.2 }, { cut: 1.2, legato: NOTE2 });
      const rG = ring(bG, 2 * NOTE2, 2 * NOTE1, [1.35, 1.75]);   // 2·G3 es modo tras el glide; 2·C3 ya no (y no es modo de G3)
      if (!(rG > 30)) probs.push('el banco no sigue el glide (la cola en 2·G3 sobre 2·C3 = ' + rG.toFixed(1) + ' dB, esperado > 30)');
      loadState({});
      console.log('resonador: cola 2f0/2,76f0 cuerda', rH.toFixed(1), 'dB · 2,76f0/2f0 barra', rB.toFixed(1), 'dB · por la matriz', rM.toFixed(1), 'dB · τ Q600', tH.toFixed(3), tB.toFixed(3),
        's (Q/πf', eH.toFixed(3), eB.toFixed(3) + ') · Q10 a 0,15 s', drop0.toFixed(1), 'dB · nivel cuenco', dB(lvl), '· glide', rG.toFixed(1), 'dB');
      r = { name: NAME, peak: analyze(bB).peak, ok: !probs.length, problems: probs };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  {
    // Disparo en mono (monoTrig) y note-off PROGRAMADOS del arp/Seq. Se simula
    // el planificador real sobre el reloj de audio: el render se suspende cada
    // 25 ms y llama a _tick() (el setInterval del directo), con su look-ahead
    // de 120 ms. Un pluck (sustain 0) hace audible cada redisparo: se cuentan
    // los ataques. Antes, a 1/16 los note-off (por temporizador) llegaban
    // DESPUÉS del on siguiente: el motor lo tomaba por legato y solo sonaba el
    // primer paso — que el solape dependiera del tempo y no del gate era el bug.
    // Además: el teclado en «Cada nota» redispara sin hueco (relevo en el
    // mismo instante), y un gate más corto que el look-ahead SUENA (antes el
    // note-off caía antes que el arranque: el golpe mudo de los jugadores).
    body.appendChild(el('st-cat', 'Disparo mono'));
    let r;
    try {
      const probs = [], log = [], keep = snapshot();
      // RMS en ventanas de 8 ms cada 2 ms: la ventana tiene que abarcar un periodo
      // entero de C3 (7,6 ms); con 2 ms el RMS de la sierra oscila ×5 dentro de la nota
      const HOP = 0.002, env = buf => {
        const d = buf.getChannelData(0), W = Math.round(SR * 0.008), H = Math.round(SR * HOP), out = [];
        for (let i = 0; i + W <= d.length; i += H) { let s = 0; for (let k = i; k < i + W; k++) s += d[k] * d[k]; out.push(Math.sqrt(s / W)); }
        return out;
      };
      const attacks = buf => {                   // cruces hacia arriba de −20 dB del pico (histéresis a −26 dB)
        const e = env(buf), top = Math.max(...e), t = [];
        let up = false;
        e.forEach((v, i) => { if (!up && v > top * 0.1) { up = true; t.push(i * HOP); } else if (up && v < top * 0.05) up = false; });
        return t;
      };
      const pluck = { mode: 'mono', waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.001, d: 0.04, s: 0, r: 0.03, width: 0, bpm: 120 };
      loadState(pluck);
      const P = structuredClone(engine.S);
      // arp o Seq con una tecla; 1/16 a 120 BPM = pasos de 125 ms → 8 pasos de 0,03 s a 0,905 s
      const sched = async (over, kind) => {
        const S = { ...structuredClone(P), ...over };
        const c = new OfflineAudioContext(2, Math.ceil(SR * 1.4), SR);
        const eng = new AudioEngine(); eng.S = S; await eng.init(c);
        const q = kind === 'seq' ? eng.seq : eng.arp;
        q.held = [{ id: 'k', freq: NOTE1, vel: 1 }]; q._begin(0.03); q.timer = 'sim';   // como una tecla a 0,03 s (une al reloj común)
        for (let i = 1; i * 0.025 < 0.9; i++) c.suspend(i * 0.025).then(() => { q._tick(); c.resume(); });
        c.suspend(0.95).then(() => { q.held = []; q._maybeStop(); c.resume(); });
        return c.startRendering();
      };
      const cases = [
        ['arp · legato · gate 0,5', { arpMode: 'up', arpDiv: '1/16', arpGate: 0.5, monoTrig: 'legato' }, 'arp', 8],
        ['arp · legato · gate 1 (liga)', { arpMode: 'up', arpDiv: '1/16', arpGate: 1, monoTrig: 'legato' }, 'arp', 1],
        ['arp · cada nota · gate 1', { arpMode: 'up', arpDiv: '1/16', arpGate: 1, monoTrig: 'retrig' }, 'arp', 8],
        ['Seq · legato · gate 0,6', { seqOn: 'on', seqPat: '0 3 7 12', seqDiv: '1/16', seqGate: 0.6, monoTrig: 'legato' }, 'seq', 8],
        ['Seq · legato · gate 1 (liga)', { seqOn: 'on', seqPat: '0 3 7 12', seqDiv: '1/16', seqGate: 1, monoTrig: 'legato' }, 'seq', 1],
      ];
      let gaps = [];
      for (const [label, over, kind, want] of cases) {
        const b = await sched(over, kind), at = attacks(b);
        log.push(label + ' ' + at.length);
        if (at.length !== want) probs.push(label + ': ' + at.length + ' ataques (esperados ' + want + ')');
        if (want === 8 && at.length === 8 && !gaps.length) gaps = at.slice(1).map((t, i) => t - at[i]);
      }
      if (gaps.some(g => Math.abs(g - 0.125) > 0.003)) probs.push('pasos fuera de rejilla: ' + gaps.map(g => (g * 1000).toFixed(1)).join(' ') + ' ms');
      // teclado: k2 llega con k1 pulsada
      const keys = async (over, look = 0) => {
        const S = { ...structuredClone(P), ...over };
        const c = new OfflineAudioContext(2, Math.ceil(SR * 1.0), SR);
        const eng = new AudioEngine(); eng.S = S; await eng.init(c);
        if (look) eng.mod.lookahead = look;     // el del directo: un relevo desalineado dejaría ~40 ms de hueco
        eng.noteOn('k1', NOTE1);
        c.suspend(0.3).then(() => { eng.noteOn('k2', NOTE1 * 1.5); c.resume(); });
        c.suspend(0.6).then(() => { eng.noteOff('k1'); eng.noteOff('k2'); c.resume(); });
        return c.startRendering();
      };
      const kL = attacks(await keys({ monoTrig: 'legato' })).length, kR = attacks(await keys({ monoTrig: 'retrig' })).length;
      if (kL !== 1) probs.push('teclado legato: ' + kL + ' ataques (esperado 1)');
      if (kR !== 2) probs.push('teclado cada nota: ' + kR + ' ataques (esperados 2)');
      const eS = env(await keys({ monoTrig: 'retrig', s: 1 }, 0.045)), w = t => eS[Math.round(t / HOP)];
      let hole = Infinity; for (let t = 0.28; t < 0.4; t += HOP) hole = Math.min(hole, w(t));
      const holeR = hole / Math.max(1e-9, w(0.25));
      if (!(holeR > 0.6)) probs.push('cada nota con sustain: hueco en el relevo (' + holeR.toFixed(2) + ' del nivel)');
      // gate (30 ms) más corto que el look-ahead (45 ms): tiene que sonar
      const c = new OfflineAudioContext(2, Math.ceil(SR * 0.5), SR);
      const eng = new AudioEngine(); eng.S = { ...structuredClone(P), mode: 'poly', s: 1 }; await eng.init(c);
      eng.mod.lookahead = 0.045;
      eng._directOn('x', NOTE1, 1, 0.1); eng._directOff('x', 0.13);
      const short = analyze(await c.startRendering());
      if (!(short.peak > 0.03)) probs.push('gate 30 ms con look-ahead 45 ms: mudo (' + dB(short.peak) + ')');
      // note-off programado con la envolvente ya en el sostenido: el sostenido
      // aguanta hasta el off (cancelAndHold no ancla si ninguna rampa cruza t;
      // sin el ancla explícita la ganancia caía en recta desde el fin del decay)
      const c2 = new OfflineAudioContext(2, Math.ceil(SR * 1.0), SR);
      const e2 = new AudioEngine(); e2.S = { ...structuredClone(P), mode: 'poly', s: 1 }; await e2.init(c2);
      e2._directOn('y', NOTE1, 1, 0.05); e2._directOff('y', 0.7);
      const eY = env(await c2.startRendering()), sus = eY[Math.round(0.6 / HOP)] / Math.max(1e-9, eY[Math.round(0.15 / HOP)]);
      if (!(sus > 0.9 && sus < 1.1)) probs.push('note-off programado: el sostenido no aguanta hasta el off (×' + sus.toFixed(2) + ' a 0,6 s)');
      console.log('disparo: ataques', log.join(' · '), '· teclado legato/cada nota', kL, kR, '· relevo', holeR.toFixed(2), '· gate corto', dB(short.peak), '· sostenido hasta el off ×' + sus.toFixed(2));
      loadState(keep);
      r = { name: 'Disparo mono (legato / cada nota) · arp y Seq redisparan por el gate · gate < look-ahead suena', peak: short.peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'Disparo mono (legato / cada nota) · arp y Seq redisparan por el gate · gate < look-ahead suena', peak: 0, ok: false,
            problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Velocity en FM4 (fm4V, la «key velocity sensitivity» del DX7): con
    // sensibilidad en el MODULADOR, pegar flojo da menos índice → menos
    // armónicos (tilt espectral, que no depende del nivel). Sin sensibilidad,
    // flojo y fuerte tienen el mismo timbre (el VCA ya escala el volumen). Con
    // sensibilidad en la PORTADORA, cambia el nivel y no el timbre.
    body.appendChild(el('st-cat', 'Velocity en FM4'));
    let r;
    try {
      const probs = [], keep = snapshot();
      loadState({ waveA: 'fm4', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.002, d: 0.3, s: 0.8, r: 0.1, width: 0, fm4Alg: '0',
                  fm4R1: 1, fm4L1: 1, fm4D1: 4, fm4R2: 2, fm4L2: 0.6, fm4D2: 4, fm4L3: 0, fm4L4: 0 });
      const P = structuredClone(engine.S);
      const one = async (over, vel) => renderOne({ ...structuredClone(P), ...over }, { secs: 0.6, offAt: 0.5, vel });
      const rms = (b, t0, t1) => { const d = b.getChannelData(0); let s = 0, n = 0; for (let i = Math.floor(t0 * SR); i < Math.floor(t1 * SR); i++) { s += d[i] * d[i]; n++; } return Math.sqrt(s / n); };
      const pair = async over => { const hi = await one(over, 1), lo = await one(over, 0.3);
        return { tilt: tiltW(hi, 0.1, 0.4) / Math.max(1e-12, tiltW(lo, 0.1, 0.4)), lvl: rms(hi, 0.1, 0.4) / Math.max(1e-12, rms(lo, 0.1, 0.4)), peak: analyze(hi).peak }; };
      const mod = await pair({ fm4V2: 1 }), ctl = await pair({}), car = await pair({ fm4V1: 1 });
      if (!(mod.tilt > 2)) probs.push('modulador con vel: fuerte/flojo apenas cambia el brillo (×' + mod.tilt.toFixed(2) + ')');
      if (!(ctl.tilt > 0.8 && ctl.tilt < 1.25)) probs.push('control sin vel: el brillo cambia con la velocity (×' + ctl.tilt.toFixed(2) + ')');
      if (!(car.tilt > 0.8 && car.tilt < 1.25)) probs.push('portadora con vel: cambia el brillo (×' + car.tilt.toFixed(2) + '), debería solo el nivel');
      if (!(car.lvl > ctl.lvl * 2)) probs.push('portadora con vel: el nivel no escala (×' + car.lvl.toFixed(2) + ' vs ×' + ctl.lvl.toFixed(2) + ' sin vel)');
      if (mod.peak > 1) probs.push('clipping');
      console.log('fm4 vel: brillo fuerte/flojo modulador', mod.tilt.toFixed(2), 'control', ctl.tilt.toFixed(2), 'portadora', car.tilt.toFixed(2), '· nivel portadora', car.lvl.toFixed(2), 'control', ctl.lvl.toFixed(2));
      loadState(keep);
      r = { name: 'Velocity en FM4: en el modulador cambia el timbre, en la portadora el nivel', peak: mod.peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'Velocity en FM4: en el modulador cambia el timbre, en la portadora el nivel', peak: 0, ok: false,
            problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Mezclador a la Minimoog (1.2.0): cada fuente suma con SU nivel.
    // (1) Superposición: con todo lineal (filtro abierto y plano, sin drive, nivel
    // bajo para que el limitador no actúe) la mezcla a 0,3 · 0,5 · 0,2 ES
    // 0,3·A + 0,5·B + 0,2·A×B renderizados por separado: subir uno no baja otro.
    // (2) Sumas: A y B a tope, +6,02 dB sobre A solo si son la misma onda en fase
    // (suman amplitudes) y ≈ +3 dB desafinados (suman potencias: sin correlación).
    // (3) Un preset de antes (Mix + Ring) suena igual que su traducción.
    // Y una MEDIDA (sin umbral): cuánto trabaja el limitador con un acorde de pad
    // de fábrica si se suben los dos osciladores a tope — el precio de sumar.
    body.appendChild(el('st-cat', 'Mezclador'));
    let r;
    try {
      const probs = [], keep = snapshot();
      const lin = { waveA: 'sawtooth', waveB: 'square', detuneB: 7, cutoff: 20000, reso: -3, a: 0.005, d: 0.05, s: 1, r: 0.05, width: 0, amplitude: 0.25, master: 0.4 };
      const one = async (st, secs = 0.8) => { loadState(st); return (await renderOne(structuredClone(engine.S), { secs, offAt: secs - 0.1 })).getChannelData(0); };
      const rmsW = (d, t0, t1) => { let s = 0, n = 0; for (let i = Math.floor(t0 * SR); i < Math.floor(t1 * SR); i++) { s += d[i] * d[i]; n++; } return Math.sqrt(s / n); };
      const a = await one({ ...lin, levelA: 1, levelB: 0, ring: 0 }), b = await one({ ...lin, levelA: 0, levelB: 1, ring: 0 });
      const c = await one({ ...lin, levelA: 0, levelB: 0, ring: 1 }), m = await one({ ...lin, levelA: 0.3, levelB: 0.5, ring: 0.2 });
      let e = 0, s = 0;
      for (let i = Math.floor(0.05 * SR); i < Math.floor(0.65 * SR); i++) { const x = 0.3 * a[i] + 0.5 * b[i] + 0.2 * c[i]; e += (m[i] - x) ** 2; s += m[i] * m[i]; }
      const sup = 10 * Math.log10(e / s + 1e-30);
      if (!(sup < -80)) probs.push('la mezcla no es la suma de sus fuentes (error ' + sup.toFixed(0) + ' dB)');
      const saw = { ...lin, waveB: 'sawtooth' };
      const a1 = rmsW(await one({ ...saw, detuneB: 0, levelA: 1, levelB: 0 }), 0.1, 0.6);
      const gIn = 20 * Math.log10(rmsW(await one({ ...saw, detuneB: 0, levelA: 1, levelB: 1 }), 0.1, 0.6) / a1);
      // 50 ct: la fundamental bate a ~3,9 Hz → 5 batidos en la ventana (con 7 ct, uno cada 2 s: la media no saldría)
      const a1d = rmsW(await one({ ...saw, detuneB: 50, levelA: 1, levelB: 0 }, 1.6), 0.1, 1.5);
      const gDet = 20 * Math.log10(rmsW(await one({ ...saw, detuneB: 50, levelA: 1, levelB: 1 }, 1.6), 0.1, 1.5) / a1d);
      if (!(Math.abs(gIn - 6.02) < 0.1)) probs.push('A+B en fase: +' + gIn.toFixed(2) + ' dB (esperado +6,02)');
      if (!(gDet > 2.5 && gDet < 3.5)) probs.push('A+B desafinados: +' + gDet.toFixed(2) + ' dB (esperado ≈ +3)');
      const viejo = { waveA: 'sine', waveB: 'sine', detuneB: 12, octavesB: 2, mix: 0.5, ring: 0.3, cutoff: 20000, amplitude: 0.25, master: 0.4 };
      const { mix, ...nuevo } = viejo;
      // no bit a bit: dos renders del MISMO estado ya difieren ~1e-8 (medido: −126 dB del pico, igual que viejo/nuevo)
      const v0 = await one(viejo), v1 = await one({ ...nuevo, levelA: 0.35, levelB: 0.35 });
      const pk = v1.reduce((mx, x) => Math.max(mx, Math.abs(x)), 0), dv = v0.reduce((mx, x, i) => Math.max(mx, Math.abs(x - v1[i])), 0);
      const gap = 20 * Math.log10(dv / pk + 1e-30);
      if (!(gap < -100)) probs.push('un preset de antes (Mix 0,5 · Ring 0,3) no suena igual que su traducción (Δ ' + gap.toFixed(0) + ' dB)');
      // la medida: Pad cálido (niveles 0,5/0,5 = el Mix al centro de antes) con un acorde de cuatro
      const CH4 = [130.81, 196.0, 261.63, 329.63], TOP = Math.pow(10, -1.3 / 20), W = Math.round(0.01 * SR);
      const hot = async st => {
        loadState(st);
        const cx = new OfflineAudioContext(2, Math.ceil(SR * 2.4), SR);
        const eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(cx);
        CH4.forEach((f, i) => eng.noteOn('n' + i, f, 1));
        cx.suspend(1.8).then(() => { CH4.forEach((f, i) => eng.noteOff('n' + i)); cx.resume(); });
        const bf = await cx.startRendering(), l = bf.getChannelData(0), rr = bf.getChannelData(1);
        let n = 0, h = 0;
        for (let i = 0; i + W <= Math.floor(1.8 * SR); i += W, n++) { let p = 0; for (let k = i; k < i + W; k++) p = Math.max(p, Math.abs(l[k]), Math.abs(rr[k])); if (p > TOP) h++; }
        return (100 * h / n).toFixed(0) + ' %';
      };
      const pad = FACTORY['Pads']['Pad cálido'];
      console.log('mezclador: superposición', sup.toFixed(0), 'dB · antes/traducido', gap.toFixed(0), 'dB · A+B en fase +' + gIn.toFixed(2), 'dB · desafinados +' + gDet.toFixed(2),
        'dB · Pad cálido, acorde de 4: limitador ' + await hot(pad) + ' (niveles 0,5/0,5) → ' + await hot({ ...pad, levelA: 1, levelB: 1 }) + ' (1/1)');
      loadState(keep);
      r = { name: 'mezclador: cada fuente suma con su nivel (en fase +6 dB, desafinadas +3 dB); los presets de antes suenan igual', peak: 0, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'mezclador: cada fuente suma con su nivel (en fase +6 dB, desafinadas +3 dB); los presets de antes suenan igual', peak: 0, ok: false,
            problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Margen del máster (1.1.0): un acorde abierto de cuatro notas con los pads de
    // fábrica no hace TRABAJAR al limitador. Lo que se oye no es que un pico roce el
    // techo un instante (con fases y derivas aleatorias el pico de un acorde varía
    // ±1 dB de una pasada a otra), sino que recorte todo el rato: antes los pads
    // entraban 4-8 dB por encima con TRES notas y el 100 % de los bloques de 10 ms
    // del sostenido iban recortados, con la ganancia subiendo y bajando con el batido
    // (el acorde «sucio, con altibajos»). Bloque recortado = su pico pasa de −1,3 dBFS
    // (el limitador lo clava en −1). Y el Master, ahora DELANTE del limitador, a tope
    // con 16 notas no pasa del techo.
    body.appendChild(el('st-cat', 'Margen del máster'));
    let r;
    try {
      const probs = [], keep = snapshot(), CH4 = [130.81, 196.0, 261.63, 329.63];
      const find = n => { for (const ps of Object.values(FACTORY)) if (ps[n]) return ps[n]; };
      const peaks = [];
      for (const n of ['Supersaw pad', 'Strings ensemble', 'Pad cálido', 'Solina strings', 'Pad de placa', 'Coro humano']) {
        loadState(find(n));
        const c = new OfflineAudioContext(2, Math.ceil(SR * 2.4), SR);
        const eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(c);
        CH4.forEach((f, i) => eng.noteOn('n' + i, f, 1));
        c.suspend(1.8).then(() => { CH4.forEach((f, i) => eng.noteOff('n' + i)); c.resume(); });
        const b = await c.startRendering(), a = analyze(b), l = b.getChannelData(0), rr = b.getChannelData(1), W = Math.round(0.01 * SR), TOP = Math.pow(10, -1.3 / 20);
        let hot = 0, n10 = 0;
        for (let i = 0; i + W <= Math.floor(1.8 * SR); i += W, n10++) { let p = 0; for (let k = i; k < i + W; k++) p = Math.max(p, Math.abs(l[k]), Math.abs(rr[k])); if (p > TOP) hot++; }
        const pct = 100 * hot / n10;
        peaks.push(n + ' ' + dB(a.peak) + ' (' + pct.toFixed(1) + ' %)');
        if (!(pct < 3)) probs.push(n + ': el limitador trabaja el ' + pct.toFixed(0) + ' % del acorde (pico ' + dB(a.peak) + ')');
        if (a.peak <= SILENCE) probs.push(n + ': en silencio');
      }
      loadState({ master: 1 });
      const st = await renderStress(structuredClone(engine.S));   // (ya devuelve el análisis)
      if (st.peak <= SILENCE) probs.push('16 notas con Master a tope: silencio');
      if (st.peak > Math.pow(10, -0.9 / 20)) probs.push('16 notas con Master a tope pasan del techo (' + dB(st.peak) + ')');
      console.log('margen: picos con 4 notas', peaks.join(' · '), '· 16 notas Master 1', dB(st.peak));
      loadState(keep);
      r = { name: 'margen: con un acorde de pad el limitador no trabaja; el Master a tope no pasa del techo', peak: st.peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'margen: con un acorde de pad el limitador no trabaja; el Master a tope no pasa del techo', peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Sonoridad de fábrica (1.1.0): cada preset trae un Master medido para sonar a
    // unos −14 LUFS a la salida en su USO PREVISTO (una nota en bajos y leads, un acorde de tres en
    // pads y teclas) sin que ese uso llegue al limitador. Sonoridad percibida =
    // K-weighting de BS.1770, máximo de bloques de 400 ms. Antes del ajuste, con el
    // margen del máster, los bajos sonaban 8-9 dB por debajo de los pads.
    body.appendChild(el('st-cat', 'Sonoridad de fábrica'));
    let r;
    try {
      const probs = [], keep = snapshot(), meds = [];
      const biq = (b0, b1, b2, a1, a2) => x => { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
      const kShelf = (() => { const A = Math.pow(10, 4 / 40), w = 2 * Math.PI * 1681.97 / SR, c = Math.cos(w), al = Math.sin(w) / (2 * 0.7072), sA = 2 * Math.sqrt(A) * al, a0 = (A + 1) - (A - 1) * c + sA;
        return biq(A * ((A + 1) + (A - 1) * c + sA) / a0, -2 * A * ((A - 1) + (A + 1) * c) / a0, A * ((A + 1) + (A - 1) * c - sA) / a0, 2 * ((A - 1) - (A + 1) * c) / a0, ((A + 1) - (A - 1) * c - sA) / a0); })();
      const kHp = (() => { const w = 2 * Math.PI * 38.135 / SR, c = Math.cos(w), al = Math.sin(w) / (2 * 0.5003), a0 = 1 + al; return biq((1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, -2 * c / a0, (1 - al) / a0); })();
      const lufs = b => { const l = kHp(kShelf(b.getChannelData(0))), rr = kHp(kShelf(b.getChannelData(1))), B = Math.round(0.4 * SR), H = Math.round(0.1 * SR);
        let best = 0; for (let i = 0; i + B <= l.length; i += H) { let s = 0; for (let k = i; k < i + B; k++) s += l[k] * l[k] + rr[k] * rr[k]; best = Math.max(best, s / B); }
        return best > 0 ? -0.691 + 10 * Math.log10(best) : -99; };
      const find = n => { for (const ps of Object.values(FACTORY)) if (ps[n]) return ps[n]; };
      for (const [n, notes] of [['Slide bass', [130.81]], ['Lead brillante', [130.81]], ['Supersaw pad', [130.81, 164.81, 196.0]], ['DX e-piano', [130.81, 164.81, 196.0]], ['Strings ensemble', [130.81, 164.81, 196.0]]]) {
        loadState(find(n));
        const c = new OfflineAudioContext(2, Math.ceil(SR * 2.4), SR);
        const eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(c);
        notes.forEach((f, i) => eng.noteOn('n' + i, f, 1));
        c.suspend(2.0).then(() => { notes.forEach((f, i) => eng.noteOff('n' + i)); c.resume(); });
        const L = lufs(await c.startRendering());
        meds.push([n, L]);
        if (!(L > -17 && L < -11)) probs.push(n + ' (' + (notes.length > 1 ? 'acorde' : 'una nota') + '): ' + L.toFixed(1) + ' LUFS, fuera de −14 ± 3');
      }
      const Ls = meds.map(m => m[1]), spread = Math.max(...Ls) - Math.min(...Ls);
      if (!(spread < 3.5)) probs.push('de la nota suelta al acorde hay ' + spread.toFixed(1) + ' dB de diferencia');
      console.log('sonoridad en su uso:', meds.map(([n, L]) => n + ' ' + L.toFixed(1)).join(' · '), '· diferencia', spread.toFixed(1), 'dB');
      loadState(keep);
      r = { name: 'sonoridad de fábrica: una nota de bajo o lead suena como un acorde de pad (−14 LUFS ± 3)', peak: 0, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'sonoridad de fábrica: una nota de bajo o lead suena como un acorde de pad (−14 LUFS ± 3)', peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Limitador del máster con señales de prueba (worklets/limiter-processor.js):
    // (1) por debajo del techo es TRANSPARENTE: la salida es la entrada retrasada el
    // lookahead y con el makeup, muestra a muestra; (2) una ráfaga a +12 dB — y otra
    // solo en el canal derecho — no deja NINGUNA muestra por encima del techo, sin
    // NaN, y tras el silencio la ganancia vuelve (el seno final sale como el del
    // principio); (3) pico REAL entre muestras (dBTP, sobremuestreo ×4 con sinc
    // enventanado): el techo es de muestra (−1 dBFS) y deja 1 dB para lo que el
    // conversor reconstruye entre muestras; se mide en el peor caso musical (16
    // notas brillantes con el Master a +12 dB, el limitador apretando a fondo).
    body.appendChild(el('st-cat', 'Limitador'));
    let r;
    try {
      const probs = [], CEIL = Math.pow(10, LIM_CEIL_DB / 20), MK = Math.pow(10, LIM_MAKEUP_DB / 20), L = Math.round(LIM_LOOKAHEAD * SR);
      const N = Math.ceil(SR * 1.6), ctx = new OfflineAudioContext(2, N, SR);
      await loadWorklets(ctx);
      const sala = new Sala(ctx, makeDefaultState(), { master: 1 });
      const buf = ctx.createBuffer(2, N, SR), xl = buf.getChannelData(0), xr = buf.getChannelData(1);
      const lo = Math.pow(10, -12 / 20), seg = (t0, t1, f) => { for (let i = Math.floor(t0 * SR); i < Math.floor(t1 * SR); i++) f(i, i / SR); };
      seg(0.0, 0.3, (i, t) => { xl[i] = xr[i] = lo * Math.sin(2 * Math.PI * 440 * t); });                        // (1) seno a −12 dBFS
      seg(0.4, 0.6, (i, t) => { const v = 4 * ((t * 220) % 1 * 2 - 1); xl[i] = v; xr[i] = -v; });                // (2) sierra a +12 dB
      seg(0.7, 0.8, (i, t) => { xr[i] = 4 * Math.sin(2 * Math.PI * 3000 * t); });                                // (2) solo en R
      seg(1.3, 1.6, (i, t) => { xl[i] = xr[i] = lo * Math.sin(2 * Math.PI * 440 * t); });                        // (2) seno tras el silencio
      const src = ctx.createBufferSource(); src.buffer = buf; src.connect(sala.comp); src.start(0);
      const out = await ctx.startRendering(), yl = out.getChannelData(0), yr = out.getChannelData(1);
      let dT = 0; for (let i = L + 100; i < Math.floor(0.3 * SR); i++) dT = Math.max(dT, Math.abs(yl[i] - xl[i - L] * MK), Math.abs(yr[i] - xr[i - L] * MK));
      if (!(dT < 1e-5)) probs.push('por debajo del techo no es transparente (|Δ| máx ' + dT.toExponential(2) + ')');
      let pk = 0, bad = 0; for (let i = 0; i < N; i++) { if (!Number.isFinite(yl[i]) || !Number.isFinite(yr[i])) bad++; else pk = Math.max(pk, Math.abs(yl[i]), Math.abs(yr[i])); }
      if (bad) probs.push(bad + ' muestras NaN/Inf');
      if (pk > CEIL * 1.0001) probs.push('una muestra pasa del techo (' + dB(pk) + ')');
      let dR = 0; for (let i = Math.floor(1.45 * SR); i < Math.floor(1.55 * SR); i++) dR = Math.max(dR, Math.abs(yl[i] - xl[i - L] * MK));
      if (!(dR < 1e-3)) probs.push('tras el silencio la ganancia no vuelve (|Δ| ' + dR.toExponential(2) + ')');
      // pico real: interpolación ×4 con sinc enventanado (Hann, 16 muestras a cada lado)
      const truePeak = (a, b) => { let p = 0; const H = 16, ph = [0.25, 0.5, 0.75].map(f => { const w = []; for (let k = -H + 1; k <= H; k++) { const x = k - f; w.push(Math.sin(Math.PI * x) / (Math.PI * x) * (0.5 + 0.5 * Math.cos(Math.PI * x / H))); } return w; });
        for (const d of [a, b]) for (let i = H; i < d.length - H; i++) { p = Math.max(p, Math.abs(d[i])); for (const w of ph) { let s = 0; for (let k = 0; k < w.length; k++) s += w[k] * d[i - H + 1 + k]; p = Math.max(p, Math.abs(s)); } }
        return p; };
      const keep = snapshot();
      loadState({ waveA: 'supersaw', waveB: 'square', levelA: 0.5, levelB: 0.5, cutoff: 20000, reso: 0.7, master: 4 });
      const c2 = new OfflineAudioContext(2, Math.ceil(SR * 1.0), SR);
      const e2 = new AudioEngine(); e2.S = structuredClone(engine.S); await e2.init(c2);
      for (let i = 0; i < 16; i++) e2.noteOn('s' + i, 220 * Math.pow(2, i / 12));
      const m2 = await c2.startRendering(), tp = truePeak(m2.getChannelData(0), m2.getChannelData(1)), sp = analyze(m2).peak;
      if (!(tp < 1)) probs.push('pico real por encima de 0 dBTP (' + dB(tp) + '; de muestra ' + dB(sp) + ')');
      loadState(keep);
      console.log('limitador: transparente |Δ| ' + dT.toExponential(1) + ' · pico de muestra con +12 dB ' + dB(pk) + ' · recuperación |Δ| ' + dR.toExponential(1) + ' · peor caso musical: muestra ' + dB(sp) + ', real ' + dB(tp));
      r = { name: 'limitador: transparente bajo el techo, ninguna muestra lo pasa, se recupera; pico real < 0 dBTP', peak: pk, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'limitador: transparente bajo el techo, ninguna muestra lo pasa, se recupera; pico real < 0 dBTP', peak: 0, ok: false, problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  // Reset neutro (oct-2026): {} deja el oscilador A a solas y ningún módulo
  // toca la señal (todo param `act` a 0, filtro abierto y plano, puerta); un
  // preset NO vacío va sobre PRESET_BASE (los defaults de antes) y suena como siempre
  {
    body.appendChild(el('st-cat', 'Reset neutro'));
    const probs = [];
    loadState({});
    const z = snapshot();
    for (const k in PARAMS) if (PARAMS[k].act && k !== 'levelA' && z[k] !== 0) probs.push('Reset: ' + k + ' = ' + z[k]);   // el nivel A a 1: el A a solas
    if (!(z.levelA === 1 && z.levelB === 0 && z.detuneB === 0 && z.cutoff === PARAMS.cutoff.max && z.reso === -3 && z.s === 1))
      probs.push('Reset no neutro: niveles ' + z.levelA + '/' + z.levelB + ' · detuneB ' + z.detuneB + ' · cutoff ' + z.cutoff + ' · reso ' + z.reso + ' · s ' + z.s);
    let n = 0;
    for (const cat in FACTORY) for (const name in FACTORY[cat]) {
      const p = FACTORY[cat][name]; if (!Object.keys(p).length) continue;
      loadState(p); const q = snapshot(); n++;
      const k = Object.keys(PRESET_BASE).find(k => !(k in p) && q[k] !== PRESET_BASE[k]);
      if (k) probs.push(name + ': ' + k + ' = ' + q[k] + ' (base ' + PRESET_BASE[k] + ')');
    }
    if (toControls(applyPreset(makeDefaultState(), { master: 0.5 })).cutoff !== PRESET_BASE.cutoff) probs.push('applyPreset (Partes) no va sobre la base de los presets');
    loadState({});
    push({ name: 'Reset neutro · ' + n + ' presets de fábrica sobre la base de siempre', peak: 0, ok: !probs.length, problems: probs.slice(0, 4) });
  }

  // Versión: X.Y.Z, la primera entrada del CHANGELOG es ella (no se publica una
  // versión sin anotar) y la cabecera la enseña
  {
    body.appendChild(el('st-cat', 'Publicación'));
    const probs = [];
    let top = null;
    try {
      const md = await (await fetch('CHANGELOG.md', { cache: 'no-store' })).text();
      const m = /^## \[(\d+\.\d+\.\d+)\](?: — (\d{4}-\d{2}-\d{2}))?/m.exec(md) || [];
      top = m[1] || null;
      if (m[2] !== RELEASE) probs.push('la fecha del CHANGELOG (' + m[2] + ') no es RELEASE (' + RELEASE + ')');
    } catch (e) { probs.push('no se pudo leer CHANGELOG.md'); }
    if (!/^\d+\.\d+\.\d+$/.test(VERSION)) probs.push('VERSION no es X.Y.Z: ' + VERSION);
    if (top !== VERSION) probs.push('el CHANGELOG empieza por ' + top + ' y VERSION es ' + VERSION);
    const badge = document.getElementById('verBadge');
    if (!badge || badge.textContent !== 'v' + VERSION) probs.push('la cabecera no enseña v' + VERSION);
    push({ name: 'versión ' + VERSION + ' del ' + RELEASE + ' (= primera entrada del CHANGELOG, visible en la cabecera)', peak: 0, ok: !probs.length, problems: probs });
  }
  {
    // Ventana de entrada: un fotograma del efecto pinta algo (no un color plano),
    // el nombre ya ha entrado entero a los 3 s y la fecha que enseña es la de RELEASE.
    const probs = [];
    const cv = document.createElement('canvas'), fx = new SplashFx(cv);
    fx.frame(3.0);
    const d = fx.px, seen = new Set(); for (let i = 0; i < d.length; i += 7) seen.add(d[i]);
    if (!(seen.size > 40)) probs.push('el fotograma tiene ' + seen.size + ' colores (¿plano?)');
    const full = fx.tmask.reduce((a, v) => a + v, 0);
    if (!(full > 300 && fx.stats.title === full)) probs.push('el nombre: ' + fx.stats.title + ' de ' + full + ' píxeles');
    const want = new Date(RELEASE + 'T12:00:00').getFullYear() + '';
    if (!splashDate(RELEASE).includes(want)) probs.push('fecha: «' + splashDate(RELEASE) + '»');
    // «Acerca de»: el título de la cabecera la reabre (aquí, con ?selftest, empezó cerrada),
    // con VOLVER; mientras está, una tecla no toca; Escape la cierra
    const sp = document.getElementById('splash');
    if (!sp || !sp.hidden) probs.push('con ?selftest la ventana debería empezar cerrada');
    else {
      document.getElementById('aboutBtn').click();
      const lab = document.querySelector('#spEnter span').textContent;
      if (sp.hidden || lab !== 'VOLVER') probs.push('«Acerca de»: ' + (sp.hidden ? 'no se abre' : 'el botón dice ' + lab));
      const before = engine.voices.size;
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', bubbles: true }));
      const during = engine.voices.size;
      document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'z', code: 'KeyZ', bubbles: true }));
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      await new Promise(res => setTimeout(res, 600));
      if (during !== before) probs.push('con la ventana abierta el teclado toca');
      if (!sp.hidden) probs.push('Escape no cierra el «Acerca de»');
    }
    push({ name: 'ventana de entrada (el fotograma pinta · el nombre entero · versión y fecha · «Acerca de»)', peak: 0, ok: !probs.length, problems: probs });
  }

  // Tarjeta para redes (Open Graph): título, descripción, URL e imagen presentes; la
  // imagen con URL ABSOLUTA bajo og:url (las redes no resuelven rutas relativas), su
  // fichero existe en el repo y mide lo que declaran og:image:width/height
  {
    const probs = [];
    const og = p => document.querySelector(`meta[property="og:${p}"]`)?.content || '';
    for (const p of ['title', 'description', 'url', 'image']) if (!og(p)) probs.push('falta og:' + p);
    const url = og('url'), img = og('image');
    let w = 0, h = 0;
    if (!(url.startsWith('https://') && img.startsWith(url))) probs.push('og:image no es absoluta bajo og:url (' + img + ')');
    else {
      const im = new Image(); im.src = img.slice(url.length);   // el MISMO fichero, servido desde aquí
      try { await im.decode(); w = im.naturalWidth; h = im.naturalHeight; } catch (e) { probs.push('no está ' + img.slice(url.length)); }
    }
    if (w && !(w === +og('image:width') && h === +og('image:height')))
      probs.push('la imagen mide ' + w + '×' + h + ' y og:image:width/height dicen ' + og('image:width') + '×' + og('image:height'));
    push({ name: 'tarjeta para redes (Open Graph, imagen ' + (w ? w + '×' + h : '—') + ')', peak: 0, ok: !probs.length, problems: probs });
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

  // Sonda de pares A/B del banco de demos (?selftest=1&demos=PREFIJO):
  // renderiza los presets del banco cuyo nombre empieza por el prefijo y
  // pinga el diff relativo de cada par consecutivo — la evidencia
  // CUANTITATIVA de que el parámetro nuevo cambia el sonido (regla del
  // banco: cada mejora entra con su par). Corre en headless igual que el
  // resto: los pings quedan en el log del http.server.
  const demosPrefix = new URLSearchParams(location.search).get('demos');
  if (demosPrefix) {
    try {
      const bank = await (await fetch('subsdj-demos.json', { cache: 'no-store' })).json();
      const names = Object.keys(bank.presets).filter(n => n.startsWith(demosPrefix));
      // «velocidad»: {prefijo: v} — pares que solo se distinguen tocando flojo (sensibilidad a la velocity)
      const velOf = n => { for (const [p, v] of Object.entries(bank.velocidad || {})) if (n.startsWith(p)) return v; return 1; };
      const bufs = {};
      for (const n of names) {
        loadState(bank.presets[n]);
        bufs[n] = await renderBuf(structuredClone(engine.S), velOf(n));
      }
      for (let i = 0; i + 1 < names.length; i += 2) {
        const A = names[i], B = names[i + 1];
        const cA = bufs[A].getChannelData(0), cB = bufs[B].getChannelData(0);
        let d = 0, en = 0;
        const len = Math.min(cA.length, cB.length);
        for (let k = 0; k < len; k += 16) { const e = cA[k] - cB[k]; d += e * e; en += cA[k] * cA[k]; }
        const diff = Math.sqrt(d / Math.max(1e-12, en));
        const pA = analyze(bufs[A]), pB = analyze(bufs[B]);
        console.log('demo par', A, '||', B, 'diff', diff.toFixed(3));
        ping('demo=' + encodeURIComponent(A + ' || ' + B) + '&diff=' + diff.toFixed(3) +
             '&peakA=' + pA.peak.toFixed(3) + '&peakB=' + pB.peak.toFixed(3) +
             ((pA.bad || pB.bad) ? '&bad=1' : ''));
      }
    } catch (e) { ping('demo_error=' + encodeURIComponent((e && e.message) || e)); }
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
