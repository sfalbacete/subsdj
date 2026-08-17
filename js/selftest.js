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
import { Seq, parsePattern, stepFreq } from './engine/Seq.js';
import { SEQ_PATTERNS } from './ui/seqControls.js';
import { FACTORY, migrateV1 } from './engine/presets.js';
import { espectroDe, puntosDeEspectro, saveUserFrames, defaultUserFrames, WT_LS, invalidateUserSet,
         encodeUserFrames, decodeUserFrames } from './engine/wavetable.js';
import { PARAMS } from './engine/params.js';
import { CONTROLS, loadState } from './ui/registry.js';
import { encodeWav } from './ui/recorder.js';
import { makeSfzKit, makeZip } from './ui/sfzExport.js';
import { ccToVal, zoneOf, applyCC, armLearn, learnCapture, setDevice, getDevice, getMap } from './ui/midimap.js';
import { loadPresetIndex } from './ui/presetBank.js';

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
    applyCC(34, 0.45);                            // zona 3 de 6 → 'sine' (6 ondas desde 'tabla')
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
    const n = sel.options.length, i0 = sel.selectedIndex;
    armLearn('presetNext'); learnCapture(36);
    applyCC(36, 1);                               // pulsar (127) → siguiente preset
    const okStep = sel.selectedIndex === (i0 + 1) % n;
    applyCC(36, 1);                               // mantenido: NO repite
    const okOnce = sel.selectedIndex === (i0 + 1) % n;
    applyCC(36, 0); applyCC(36, 1);               // soltar y pulsar → avanza otra vez
    const okEdge = sel.selectedIndex === (i0 + 2) % n;
    loadPresetIndex(i0 + 130);                    // program change: módulo del banco
    const okPC = sel.selectedIndex === (i0 + 130) % n;
    localStorage.removeItem(K);
    setDevice(prevDev);
    const okA = okStep && okOnce && okEdge && okPC;
    push({ name: 'MIDI acciones (banco: ‹ › y program change)', peak: 0, ok: okA,
           problems: okA ? [] : ['paso:' + okStep + ' única:' + okOnce + ' flanco:' + okEdge + ' pc:' + okPC] });
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
