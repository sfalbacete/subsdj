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
import { AudioEngine, engine, loadWorklets } from './engine/AudioEngine.js';
import { Sala } from './engine/Sala.js';
import { Arp } from './engine/Arp.js';
import { Seq, parsePattern, stepFreq } from './engine/Seq.js';
import { parseWsPattern } from './engine/WaveSeq.js';
import { SEQ_PATTERNS } from './ui/seqControls.js';
import { FACTORY, migrateV1 } from './engine/presets.js';
import { espectroDe, puntosDeEspectro, saveUserFrames, defaultUserFrames, WT_LS, invalidateUserSet,
         encodeUserFrames, decodeUserFrames } from './engine/wavetable.js';
import { PARAMS, valToPos } from './engine/params.js';
import { makeDefaultState, applyPreset, toControls } from './engine/state.js';
import { createScene, sceneToJSON, applySceneJSON } from './engine/parts.js';
import { mulberry32 } from './engine/Harmony.js';
import { Arrangement } from './engine/Arrangement.js';
import { Harmony } from './engine/Harmony.js';
import { euclid } from './engine/Player.js';
import { Conductor } from './engine/Conductor.js';
import { CONTROLS, loadState } from './ui/registry.js';
import { encodeWav } from './ui/recorder.js';
import { makeSfzKit, makeZip } from './ui/sfzExport.js';
import { ccToVal, zoneOf, applyCC, armLearn, learnCapture, setDevice, getDevice, getMap } from './ui/midimap.js';
import { loadPresetIndex, navOptions, presetBankReady } from './ui/presetBank.js';
import { library, Library, SEC_MIOS, SEC_ESCENAS, SEC_IMPORT, ESCENAS_REPO } from './engine/library.js';
import { SCREENS, showScreen, currentScreen } from './ui/screens.js';

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

async function renderBuf(state) {
  const dur = Math.min(6, 1.0 + (state.r || 0.3) + 0.3);   // 1 s de nota + cola de release
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
  const eng = new AudioEngine();
  eng.S = state;
  await eng.init(ctx);
  eng.noteOn('t1', NOTE1);
  ctx.suspend(0.5).then(() => { eng.noteOn('t2', NOTE2); ctx.resume(); });
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
    // arpegiador: secuencia 'up' con 2 octavas ordenada por altura
    const a = new Arp({ S: { arpOct: '2' }, ctx: null });
    a.held = [{ id: 1, freq: 200, vel: 1 }, { id: 2, freq: 100, vel: 1 }];
    const seq = a._seq().map(n => n.freq).join(',');
    const okA = seq === '100,200,200,400';
    push({ name: 'arpegiador (secuencia ×2 oct)', peak: 0, ok: okA, problems: okA ? [] : ['seq: ' + seq] });
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
      const okS = okN && okWav && okRef && okRange && okZip && okPk;
      r = { name: 'exportador SFZ (render → sfz + zip)', peak: pk / 32767, ok: okS,
            problems: okS ? [] : ['n:' + okN + ' wav:' + okWav + ' ref:' + okRef +
                                  ' rango:' + okRange + ' zip:' + okZip + ' pico:' + okPk] };
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
    CONTROLS.mix.set(0.5);
    armLearn('mix'); learnCapture(35);
    applyCC(35, 0.9);
    const okHold = Math.abs(CONTROLS.mix.get() - 0.5) < 1e-9;
    applyCC(35, 0.4);                             // …pero al cruzar 0.5 engancha
    const okCross = Math.abs(CONTROLS.mix.get() - 0.4) < 1e-9;
    localStorage.removeItem(K);
    setDevice(prevDev);                           // restaura el mapa real del usuario
    const okL = okBind && okZone && okFree && okPersist && okHold && okCross;
    push({ name: 'MIDI learn (ligar · zonas · persistencia · pickup)', peak: 0, ok: okL,
           problems: okL ? [] : ['bind:' + okBind + ' zona:' + okZone + ' libre:' + okFree +
                                 ' persist:' + okPersist + ' pickup:' + okHold + '/' + okCross] });
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
    // pantallas (13a): ningún módulo huérfano (todos en al menos una pestaña
    // conocida) y ninguna pestaña vacía; cambiar de pestaña muestra EXACTAMENTE
    // los módulos que la declaran (estilo computado), marca la pestaña y se
    // recuerda; la barra rápida vive en Diseño y Presets; la lista de la
    // pantalla Presets refleja el banco y un clic carga por el mismo camino
    // que el selector y queda marcado como actual.
    body.appendChild(el('st-cat', 'Pantallas'));
    const panels = [...document.querySelectorAll('.rack .panel')];
    const tags = p => (p.dataset.screens || '').split(' ').filter(Boolean);
    const title = p => ([...(p.querySelector('h2')?.childNodes || [])].filter(n => n.nodeType === 3).map(n => n.textContent).join('') || p.id || '?').trim();   // sin LED ni «?»
    const probs = [];
    const orphans = panels.filter(p => !tags(p).some(t => SCREENS.includes(t))).map(title);
    const unknown = panels.flatMap(p => tags(p).filter(t => !SCREENS.includes(t)));
    const empty = SCREENS.filter(s => !panels.some(p => tags(p).includes(s)));
    if (orphans.length) probs.push('huérfanos: ' + orphans.join(', '));
    if (unknown.length) probs.push('pantallas desconocidas: ' + unknown.join(', '));
    if (empty.length) probs.push('pantallas vacías: ' + empty.join(', '));
    const before = currentScreen();
    for (const s of SCREENS) {
      showScreen(s);
      const shown = panels.filter(p => getComputedStyle(p).display !== 'none');
      const want = panels.filter(p => tags(p).includes(s) && !p.hidden);
      if (shown.length !== want.length || !shown.every(p => tags(p).includes(s)))
        probs.push(s + ': visibles ' + shown.length + ' ≠ esperados ' + want.length);
      if (localStorage.getItem('subsdj.screen.v1') !== s) probs.push(s + ': no se recuerda');
      if (!document.querySelector('#screenTabs button.active[data-screen="' + s + '"]')) probs.push(s + ': pestaña sin marcar');
      for (const g of document.querySelectorAll('.rack-group')) {
        const has = [...g.querySelectorAll('.panel')].some(p => tags(p).includes(s));
        if (g.hidden === has) probs.push(s + ': grupo «' + ((g.querySelector('.rack-title') || {}).textContent || '?') + '» ' + (has ? 'oculto con módulos' : 'visible y vacío'));
      }
    }
    const bar = document.getElementById('presetBar');
    showScreen('secuenciacion');
    if (getComputedStyle(bar).display !== 'none') probs.push('la barra de presets sigue en Secuenciación');
    showScreen('presets');
    if (getComputedStyle(bar).display === 'none') probs.push('la barra de presets falta en Presets');
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
    push({ name: 'pantallas (huérfanos · filtro · memoria · lista de presets)', peak: 0, ok: !probs.length, problems: probs });
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
    push({ name: 'piel: knob publica --pos; el CSS gira y apaga el indicador', peak: 0, ok: !probs.length, problems: probs });
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
      loadState({ waveA: 'tabla', mix: 0, wtPos: 0 });
      const bA = await renderBuf(structuredClone(engine.S));
      loadState({ waveA: 'tabla', mix: 0, wtPos: 1 });
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
      loadState({ waveA: 'tabla', wtSet: 'usuario', mix: 0, wtPos: 0 });
      const bA = await renderBuf(structuredClone(engine.S));
      loadState({ waveA: 'tabla', wtSet: 'usuario', mix: 0, wtPos: 1 });
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
    body.appendChild(el('st-cat', 'Vocal 2.0'));
    let r;
    try {
      const diff = (x, y) => {
        const cX = x.getChannelData(0), cY = y.getChannelData(0);
        let d = 0, en = 0;
        for (let i = 0; i < cX.length; i += 16) { const e = cX[i] - cY[i]; d += e * e; en += cX[i] * cX[i]; }
        return Math.sqrt(d / Math.max(1e-12, en));
      };
      const rmsIni = (buf, secs) => {
        const d = buf.getChannelData(0), n = Math.min(d.length, Math.floor(44100 * secs));
        let s = 0; for (let i = 0; i < n; i++) s += d[i] * d[i];
        return Math.sqrt(s / Math.max(1, n));
      };
      loadState({ waveA: 'tabla', wtSet: 'glotal', mix: 0, wtPos: 0 });
      const bG0 = await renderBuf(structuredClone(engine.S));
      loadState({ waveA: 'tabla', wtSet: 'glotal', mix: 0, wtPos: 1 });
      const bG1 = await renderBuf(structuredClone(engine.S));
      loadState({ vocAmt: 1, vocBrillo: 0 });
      const bB0 = await renderBuf(structuredClone(engine.S));
      loadState({ vocAmt: 1, vocBrillo: 1 });
      const bB1 = await renderBuf(structuredClone(engine.S));
      loadState({ vocAmt: 1, vocAtk: 0, a: 0.005 });
      const bK0 = await renderBuf(structuredClone(engine.S));
      loadState({ vocAmt: 1, vocAtk: 1, a: 0.005 });
      const bK1 = await renderBuf(structuredClone(engine.S));
      const probs = [];
      const aG0 = analyze(bG0), aG1 = analyze(bG1), aB1 = analyze(bB1), aK1 = analyze(bK1);
      if (aG0.bad || aG1.bad || aB1.bad || aK1.bad) probs.push('NaN/Inf');
      if (aG0.peak <= SILENCE || aG1.peak <= SILENCE) probs.push('glotal en silencio (' + dB(aG0.peak) + ' / ' + dB(aG1.peak) + ')');
      if (aG1.peak > 1 || aK1.peak > 1) probs.push('clipping (glotal ' + dB(aG1.peak) + ' · golpe ' + dB(aK1.peak) + ')');
      const dG = diff(bG0, bG1), dB_ = diff(bB0, bB1);
      const kRatio = rmsIni(bK1, 0.05) / Math.max(1e-9, rmsIni(bK0, 0.05));
      const goe = (buf, f, t0, t1) => {         // energía de Goertzel de un tono en una ventana
        const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        const cw = 2 * Math.cos(2 * Math.PI * f / SR);
        let s1 = 0, s2 = 0;
        for (let i = i0; i < i1; i++) { const s0 = d[i] + cw * s1 - s2; s2 = s1; s1 = s0; }
        return s1 * s1 + s2 * s2 - cw * s1 * s2;
      };
      const uVsA = (b, t0, t1) => goe(b, 261.62, t0, t1) / Math.max(1e-12, goe(b, 654.06, t0, t1));
      const rr = b => uVsA(b, 0.008, 0.045) / Math.max(1e-12, uVsA(b, 0.3, 0.5));
      const trans = rr(bK1) / Math.max(1e-6, rr(bK0));   // medido ~76 (22.1 / 0.29)
      if (!(dG > 0.3)) probs.push('glotal: esfuerzo 0 vs 1 apenas difiere (diff ' + dG.toFixed(3) + ')');
      if (!(dB_ > 0.05)) probs.push('Brillo 0 vs 1 apenas difiere (diff ' + dB_.toFixed(3) + ')');
      if (!(kRatio > 1.2)) probs.push('el Golpe no añade energía al arranque (ratio ' + kRatio.toFixed(2) + ')');
      if (!(trans > 5)) probs.push('el Golpe no arranca con la boca cerrada (transición ' + trans.toFixed(1) + ')');
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
      const base = { waveA: 'tabla', mix: 0, wtPos: 0, bpm: 120 };
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
      const base = { waveA: 'sawtooth', mix: 0, cutoff: 12000, reso: 0.7, a: 0.002, d: 0.12, s: 0, r: 0.1,
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
      if (!(rEco0 > 1e-3)) probs.push('sin ecos en la ventana de cola (rms ' + dB(rEco0) + ')');
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
      const base = { waveA: 'sine', waveB: 'sine', mix: 0.5, fmRatio: 2, fmIndex: 0.5, cutoff: 20000,
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
      if (!(tail > 1e-3)) probs.push('sin cola de reverb de la parte 4 en la sala (' + dB(tail) + ')');
      console.log('partes: niveles', lv.map(v => dB(v)).join(' · '), '· cola', dB(tail), '· pico', dB(a.peak));
      r = { name: 'partes (estado↔controles · escena de 4 · sala compartida · mute · cola)', peak: a.peak, ok: !probs.length, problems: probs };
    } catch (e2) {
      r = { name: 'partes (estado↔controles · escena de 4 · sala compartida · mute · cola)', peak: 0, ok: false,
            problems: ['excepción: ' + ((e2 && e2.message) || e2)] };
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
    // ⇒ mismas MUESTRAS: dos renders offline de la misma escena (Math.random
    // sembrado: ruido e IR iguales; presets sin azar en el worklet) coinciden
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
      const secs = 4.0, realRandom = Math.random;
      const render = async (seed, mrSeed = 77) => {
        Math.random = mulberry32(mrSeed);
        try {
          const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
          const sc = await createScene(ctx, presets, { salaS: { bpm: 120 } });
          conf(sc.conductor); sc.conductor.setSeed(seed); sc.conductor.scheduleAll(secs);
          return { sc, buf: await ctx.startRendering() };
        } finally { Math.random = realRandom; }
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
      if (!(env[3] > 1e-4)) probs.push('Size 3: cola muerta a 1 s (' + dB(env[3]) + ')');
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
      const base = { waveA: 'fm4', mix: 0, cutoff: 20000, reso: 0.7, a: 0.002, d: 0.3, s: 0.8, r: 0.1, width: 0,
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
    // Curva de envolvente (Roadmap 4.0 · A3): con Curva 1 el ataque sube deprisa
    // (RMS a mitad del ataque ≫ que con rampas lineales) y el decay se posa
    // pronto (RMS a mitad del decay ≪); el sostenido es el mismo. Con Curva 0 el
    // camino es el de siempre (rampas lineales: lo cubre el golden).
    body.appendChild(el('st-cat', 'Curva de envolvente'));
    let r;
    try {
      const probs = [];
      const base = { waveA: 'sawtooth', mix: 0, cutoff: 20000, reso: 0.7, a: 0.3, d: 0.5, s: 0.3, r: 0.1, width: 0 };
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
      const bufs = {};
      for (const n of names) {
        loadState(bank.presets[n]);
        bufs[n] = await renderBuf(structuredClone(engine.S));
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
