/* =====================================================================
   SubSDJ · AudioEngine — grafo de UN instrumento: LFOs, gestión de voces,
   inserciones. Cadena:
     voicesBus(auto-gain) -> amp(+LFO trémolo) -> distorsión -> flanger
       -> chorus|ensemble -> nivel -> [seco + envío delay + envío reverb]
       -> Sala (engine/Sala.js: delay ping-pong, reverb, limitador, máster)
   Modo de siempre: el motor crea su propia Sala. Modo Partes (parts.js):
   varios motores comparten UNA Sala (modelo send/return).
   El filtro es POR VOZ (en Voice.js). Los LFOs de cutoff/reso/freq/pwm
   son globales al motor pero se conectan a los params de cada voz al crearse
   (o, con lfoPhase 'voz', cada voz crea sus copias en su propia fase: nodes.mkVoiceLFO).
   ===================================================================== */
import { makeDefaultState } from './state.js';
import { Voice } from './Voice.js';
import { Arp } from './Arp.js';
import { Seq } from './Seq.js';
import { WaveSeq } from './WaveSeq.js';
import { getWtSet } from './wavetable.js';

import { makeNoise, makeWander, makeDistCurve, mkLFO, mkPhasedLFO, setLfoRate, setLfoShape } from './nodes.js';
import { Sala, SALA_KEYS } from './Sala.js';

const MAX_POLY = 10;    // voces pulsadas a la vez; al pasar, se roba la más antigua
const MAX_TAILS = 16;   // colas de release vivas; por encima, fundido de la más vieja (TAIL_FADE)
// Fundido de la cola que sobra. Era 10 ms («entre 12 colas es inaudible»): con
// releases de 20-30 s (Roadmap 5.0) la cola más vieja aún suena a medio nivel
// cuando le toca irse, y un corte de 10 ms se oye como un clic de pad. 350 ms
// entre 16 colas y la reverb no se distingue de la propia caída.
const TAIL_FADE = 0.35;
// Presupuesto de CPU de audio (solo en directo). Todos los motores de un MISMO
// contexto — las 4 partes de una escena — se renderizan en el mismo hilo de
// audio, así que el tope es COMÚN: se lleva por contexto (budgetOf), no por
// motor. Cada voz pesa lo que cuesta lo que lleva encendido (Voice.cost, en
// «voces simples»: dos sierras con el filtro quieto = 1). Al pasarse, se libera
// de lo que menos se oye a lo que más: (1) la cola de release más vieja de
// CUALQUIER parte, fundida en TAIL_FADE; (2) la voz pulsada más vieja de la
// parte que pide la nota — nunca la nota sostenida de otro instrumento.
// VOICE_BUDGET: 30 voces simples ≈ 47 % de un núcleo en el PC de referencia,
// más los efectos y la sala (4-15 %): el hilo queda por debajo de ~60 %, con
// margen para los picos (crear voces a ráfagas). Offline (selftest, SFZ) no
// hay plazos y no hay tope.
export const VOICE_BUDGET = 30;
// Coste fijo de un motor sin notas, en las mismas «voces simples» (medido: 2,5 %
// de un núcleo con su sala y sin efectos; cada efecto, lo que suma encendido).
const ENGINE_COST = { base: 1, dist: 0.17, fl: 0.14, ch: 0.22, ens: 0.37 };
const budgets = new WeakMap();
const budgetOf = ctx => { let s = budgets.get(ctx); if (!s) budgets.set(ctx, (s = new Set())); return s; };
// Fuentes de ejecución (rueda, aftertouch, expresión): suavizado de los saltos de 1/127 del MIDI
const PERF_TAU = 0.02;

// Carga de los worklets en un contexto, UNA vez por contexto (lo usan init() y
// parts.createScene, que construye la Sala compartida antes de ningún motor).
// El ?v=N rompe la caché heurística del navegador: SUBIRLO al cambiar código
// de worklet (si no, el navegador puede casar módulos nuevos con un processor
// viejo y los parámetros nuevos llegan undefined -> crash al crear voces).
const WK_V = '?v=10';  // v10: shift-processor (shimmer) + decay de la placa hasta 1 (freeze); v9: puerta de arranque en t0 + reloj FM4
const workletsLoaded = new WeakSet();
export async function loadWorklets(ctx) {
  if (workletsLoaded.has(ctx)) return;
  await Promise.all(['pulse-processor', 'recorder-processor', 'plate-processor', 'shift-processor', 'limiter-processor']
    .map(n => ctx.audioWorklet.addModule(new URL('./worklets/' + n + '.js' + WK_V, import.meta.url))));
  workletsLoaded.add(ctx);
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.S = makeDefaultState();
    this.voices = new Map();      // id -> Voice (voces PULSADAS)
    this.tails = new Set();       // voces sueltas sonando su release
    this.voiceCount = 0;
    this.lastFreq = null;         // para glide
    this.heldStack = [];          // notas pulsadas en modo mono (cima = sonando)
    this.monoVoice = null;        // voz única en modo mono
    this.arp = new Arp(this);     // arpegiador (activo cuando S.arpMode != 'off')
    this.seq = new Seq(this);     // secuenciador de pasos (activo cuando S.seqOn == 'on')
    this.wseq = new WaveSeq(this);// secuencia de tabla (activa cuando S.wsOn == 'on')
    this.perfVal = { wheel: 0, at: 0, expr: 0 };   // fuentes de ejecución (0..1); los nodos nacen en init()
  }

  // ctx opcional: el self-test pasa un OfflineAudioContext; por defecto crea el real.
  // sala opcional: la Sala COMPARTIDA (modo Partes); sin ella el motor crea la suya.
  async init(providedCtx = null, { sala = null } = {}) {
    if (this.ctx) return;
    const ctx = providedCtx || new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    // Render offline (selftest, SFZ): el reloj de audio corre más rápido que el
    // de pared, así que los temporizadores de las colas no valen (y matarían
    // voces a destiempo, de forma NO determinista). Sin tope de colas offline.
    this.offline = typeof ctx.startRendering === 'function';
    this.budget = budgetOf(ctx); this.budget.add(this);   // presupuesto de CPU común a los motores de este contexto
    this.noiseBuffer = makeNoise(ctx);
    this.wanderBuffer = makeWander(ctx);   // deriva lenta compartida (Vocal · Vida)

    await loadWorklets(ctx);               // pulse, recorder y plate (una vez por contexto)

    const S = this.S;

    this.voicesBus = ctx.createGain(); this.voicesBus.gain.value = 1;
    this.amp = ctx.createGain(); this.amp.gain.value = S.amplitude;

    // EFECTOS DE INSERCIÓN BAJO DEMANDA. De cada efecto existe siempre solo el
    // camino SECO (una ganancia); el wet — el WaveShaper ×2 de la distorsión, las
    // líneas de retardo moduladas del flanger, el chorus y el ensemble, y sus 9
    // LFO — nace la primera vez que su cantidad sube de 0 (_ensureDist, _ensureFl,
    // _ensureCh, _ensureEns) y se queda. A 0 la salida es la misma (sumaba 0),
    // pero un motor sin notas costaba ~4 % de un núcleo con todo a 0 — y en
    // Partes hay cinco motores (las 4 partes y el único, callado debajo).
    // Distorsión (dry/wet: a 0 es TRANSPARENTE). Un WaveShaper recorta a ±1 cualquier
    // pico >1 que le entre, así que tenerlo siempre en serie saturaba con politonía.
    // Sólo se mezcla la parte "wet" según el drive; a 0 pasa todo seco.
    this.distDry = ctx.createGain(); this.distDry.gain.value = 1 - S.dist;
    this.distOut = ctx.createGain();
    this.flDry = ctx.createGain(); this.flOut = ctx.createGain();     // flanger
    // Chorus estéreo (dos líneas cortas moduladas a distinta velocidad) y
    // ensemble (triple chorus estilo Solina): ver _ensureCh / _ensureEns
    this.chDry = ctx.createGain(); this.chOut = ctx.createGain();
    this.ensSlow = []; this.ensFast = [];

    // --- Salida del motor: nivel → seco + dos ENVÍOS (delay, reverb) → Sala ---
    // La Sala (engine/Sala.js) es el espacio: delay ping-pong de cinta, reverb,
    // limitador, máster y analizador. Modo de siempre: este motor crea la suya
    // (y `master` es su máster, como siempre). Modo Partes (engine/parts.js):
    // recibe la Sala COMPARTIDA; `master` pasa a ser el fader de la parte y
    // los knobs de la sala (tiempo, damp, size, bpm…) la editan para todas.
    this.ownsSala = !sala;
    this.sala = sala || new Sala(ctx, S, { fb: Math.min(0.8, S.dlyAmt * 0.85), dlyToRev: S.reverbMix, master: S.master });
    this.sala.engines.push(this);
    this.level = ctx.createGain(); this.level.gain.value = this.ownsSala ? 1 : S.master;
    this.muteG = ctx.createGain();                                            // mute de la parte (mezclador)
    this.partPan = ctx.createStereoPanner();                                  // pan de la parte (mezclador)
    this.sendDly = ctx.createGain(); this.sendDly.gain.value = S.dlyAmt;      // envío al delay
    this.sendRev = ctx.createGain(); this.sendRev.gain.value = S.reverbMix;   // envío a la reverb

    // Conexiones globales (los wets se enganchan al crearse)
    this.voicesBus.connect(this.amp);
    this.amp.connect(this.distDry); this.distDry.connect(this.distOut);
    this.distOut.connect(this.flDry); this.flDry.connect(this.flOut);
    this.flOut.connect(this.chDry); this.chDry.connect(this.chOut);
    // Salida: chOut -> nivel -> mute -> [pan -> seco de la Sala] + [envíos]
    this.chOut.connect(this.level); this.level.connect(this.muteG);
    this.muteG.connect(this.partPan); this.partPan.connect(this.sala.dry);
    this.muteG.connect(this.sendDly); this.sendDly.connect(this.sala.dlyIn);
    this.muteG.connect(this.sendRev); this.sendRev.connect(this.sala.revIn);

    // LFOs
    this.ampLFO = mkLFO(ctx, S.ampLfoSpd, S.ampLfoLvl); this.ampLFO.depth.connect(this.amp.gain);
    this.cutLFO = mkLFO(ctx, S.cutLfoSpd, S.cutLfoLvl);   // depth se conecta por voz
    this.resLFO = mkLFO(ctx, S.resLfoSpd, S.resLfoLvl);
    this.freqLFO = mkLFO(ctx, S.freqLfoSpd, S.freqLfoLvl);
    this.pwmLFO = mkLFO(ctx, S.pwmLfoSpd, S.pwmLfoLvl);
    this.panLFO = mkLFO(ctx, S.panLfoSpd, S.panLfoLvl);   // autopan: depth se conecta por voz
    if (S.dist > 0) this._ensureDist();                  // efectos que el estado ya trae encendidos
    if (S.flAmt > 0) this._ensureFl();
    if (S.chAmt > 0) { if (S.chMode === 'ensemble') this._ensureEns(); else this._ensureCh(); }
    // formas de onda de los LFOs (el estado puede traerlas de un preset); sin/tri/saw/sqr
    // son el oscilador nativo, S&H y deriva una fuente alternativa (nodes.js)
    setLfoShape(ctx, this.ampLFO, S.ampLfoShape);   setLfoShape(ctx, this.freqLFO, S.freqLfoShape);
    setLfoShape(ctx, this.pwmLFO, S.pwmLfoShape);   setLfoShape(ctx, this.cutLFO, S.cutLfoShape);
    setLfoShape(ctx, this.resLFO, S.resLfoShape);

    this.pitchOffset = ctx.createConstantSource(); this.pitchOffset.offset.value = S.freqCents; this.pitchOffset.start();
    // Macro de apertura (arreglo de la escena): cents que se SUMAN al detune
    // de los filtros de todas las voces (exponencial, sin cruzar 0 Hz — la
    // misma ruta que el destino Cutoff de la matriz). A 0 no hace nada — y no se
    // conecta a las voces hasta que el arreglo la mueve (_macroOn): conectada,
    // aunque valga 0, el filtro de cada voz recalcularía coeficientes por muestra.
    this.macroCut = ctx.createConstantSource(); this.macroCut.offset.value = 0; this.macroCut.start();
    this._macroOn = false;
    // Fuentes de EJECUCIÓN (Roadmap 5.0 · bloque 4): rueda (CC1), aftertouch y
    // expresión (CC11) como ConstantSource 0..1 por motor; la matriz las ofrece
    // como fuentes 'wheel' / 'at' / 'expr' (Voice._mxSrcNode). Llegan por MIDI
    // (ui/midi.js) o por la rueda en pantalla (ui/keyboard.js); en modo Partes
    // van a todas las partes (parts.setPerf), como el bend.
    this.perf = {};
    for (const k in this.perfVal) { const c = ctx.createConstantSource(); c.offset.value = this.perfVal[k]; c.start(); this.perf[k] = c; }

    // hub de modulación que se pasa a cada voz
    this.modStats = { worklets: 0 };     // contador de osciladores worklet vivos (HUD)
    this.mod = {
      voicesBus: this.voicesBus, noiseBuffer: this.noiseBuffer, wanderBuffer: this.wanderBuffer,
      pitchOffset: this.pitchOffset, macroCut: this.macroCut, macroOn: () => this._macroOn, perf: this.perf,
      freqLFOGain: this.freqLFO.depth, pwmLFOGain: this.pwmLFO.depth,
      cutLFOGain: this.cutLFO.depth, resLFOGain: this.resLFO.depth,
      panLFOGain: this.panLFO.depth,
      // matriz de modulación: los LFO entran CRUDOS (su salida `out`, ±1, sea
      // oscilador o S&H/deriva) — el knob Level de cada LFO gobierna su ruta
      // dedicada, no la matriz
      mxLfo: { lfoAmp: this.ampLFO.out, lfoFreq: this.freqLFO.out, lfoPwm: this.pwmLFO.out,
               lfoCut: this.cutLFO.out, lfoRes: this.resLFO.out },
      stats: this.modStats,
    };
    // Look-ahead de las notas en directo (lo lee Voice): el reloj que ve el hilo
    // principal va por detrás del hilo de audio hasta un periodo de callback del
    // dispositivo (baseLatency: 128 muestras en headless, 10-20 ms en una tarjeta
    // WASAPI) y los eventos tardan otro tanto en llegar. Con 5 ms fijos, en algunas
    // tarjetas la apertura del VCA, el blip de pitch y las ráfagas del flam caían
    // «en el pasado» y se aplicaban de golpe: el bombo golpeaba solo a veces (en
    // headless y offline el retraso es constante y no se nota). Offline: 5 ms (golden).
    this.mod.lookahead = this.offline ? 0.005 : Math.max(0.005, 0.005 + 2 * (ctx.baseLatency || 0.01));
    if (!this.offline) console.info('SubSDJ · look-ahead de nota', (this.mod.lookahead * 1000).toFixed(1), 'ms (baseLatency', ((ctx.baseLatency || 0) * 1000).toFixed(1), 'ms · outputLatency', ((ctx.outputLatency || 0) * 1000).toFixed(1), 'ms)');

    this.ready = true;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  // ---------- voces ----------
  noteOn(id, freq, vel = 1) {
    if (!this.ready) return;
    if (this.S.seqOn === 'on') return this.seq.hold(id, freq, vel);      // la tecla es la raíz de la frase
    if (this.S.arpMode !== 'off') return this.arp.hold(id, freq, vel);   // el arp secuencia las notas
    this._directOn(id, freq, vel);
  }
  noteOff(id) {
    if (this.S.seqOn === 'on') return this.seq.unhold(id);
    if (this.S.arpMode !== 'off') return this.arp.unhold(id);
    this._directOff(id);
  }
  // Camino directo (lo usa también el arpegiador, con inicio programado `when`)
  _directOn(id, freq, vel = 1, when = null) {
    if (this.S.mode === 'mono') return this._monoOn(id, freq, vel, when);
    const existing = this.voices.get(id);
    if (existing) { if (existing._timer) clearTimeout(existing._timer); this._dispose(existing); this.voices.delete(id); this.voiceCount = Math.max(0, this.voiceCount - 1); }
    if (this.voiceCount >= MAX_POLY) {                     // robo de voz: la más antigua
      const oldest = this.voices.keys().next().value;      // Map conserva orden de inserción
      if (oldest !== undefined) this._releaseVoice(oldest, 0.02);
    }
    const cost = Voice.cost(this.S);
    this._makeRoom(cost);                                  // presupuesto de CPU común (ver VOICE_BUDGET)
    const v = new Voice(this.ctx, this.S, this.mod, { freq, vel, startFreq: this.lastFreq, startAt: when });
    v.cost = cost;
    if (this._bend) v.ensurePitch();     // bend activo: engancha el pitch global a la voz nueva
    this.wseq.attach(v);                 // secuencia de tabla: cada voz arranca su frase en su noteOn
    this.voices.set(id, v);
    this.lastFreq = freq;
    this.voiceCount++; this._updateBusGain();
  }
  // `when` opcional: note-off programado en el reloj de audio (jugadores)
  _directOff(id, when = null) {
    if (this.S.mode === 'mono') return this._monoOff(id, when);
    this._releaseVoice(id, this.S.r, when);
  }
  allNotesOff() {
    this.arp.held = []; this.arp._maybeStop();
    this.seq.held = []; this.seq.latched = null; this.seq._maybeStop();
    this.heldStack = []; this.monoVoice = null;
    for (const id of [...this.voices.keys()]) this._releaseVoice(id, 0.03);
  }

  // ---- modo mono / legato (prioridad de última nota) ----
  _monoOn(id, freq, vel, when = null) {
    const had = this.heldStack.length > 0;
    this.heldStack = this.heldStack.filter(n => n.id !== id);
    this.heldStack.push({ id, freq, vel });
    if (had && this.monoVoice && !this.monoVoice.disposed) {
      this.monoVoice.glideTo(freq, this.S.glide);   // legato: desliza sin reiniciar envolvente
      this.lastFreq = freq;
    } else {
      this._killMono();
      const cost = Voice.cost(this.S);
      this._makeRoom(cost);
      const v = new Voice(this.ctx, this.S, this.mod, { freq, vel, startFreq: this.lastFreq, startAt: when });
      v.cost = cost;
      if (this._bend) v.ensurePitch();
      this.wseq.attach(v);               // en legato NO se recrea la voz: la frase sigue (como el Seq)
      this.monoVoice = v; this.voices.set('mono', v);
      this.lastFreq = freq;
      this.voiceCount++; this._updateBusGain();
    }
  }
  _monoOff(id, when = null) {
    if (!this.heldStack.some(n => n.id === id)) return;   // id ajeno (note-off de otra parte): ni re-desliza ni suelta la voz de otro
    this.heldStack = this.heldStack.filter(n => n.id !== id);
    if (this.heldStack.length) {
      const top = this.heldStack[this.heldStack.length - 1];
      if (this.monoVoice && !this.monoVoice.disposed) { this.monoVoice.glideTo(top.freq, this.S.glide); this.lastFreq = top.freq; }
    } else {
      this._releaseMono(this.S.r, when);
    }
  }
  _releaseMono(rel, when = null) {
    const v = this.monoVoice; if (!v) return;
    this.voices.delete('mono'); this.monoVoice = null;
    this.voiceCount = Math.max(0, this.voiceCount - 1); this._updateBusGain();
    this._scheduleTail(v, rel, when);
  }
  _killMono() {
    const v = this.monoVoice; if (!v) return;
    if (v._timer) clearTimeout(v._timer);
    this._dispose(v); this.voices.delete('mono'); this.monoVoice = null;
    this.voiceCount = Math.max(0, this.voiceCount - 1); this._updateBusGain();
  }

  _releaseVoice(id, rel, when = null) {
    const v = this.voices.get(id); if (!v) return;
    this.voices.delete(id);
    this.voiceCount = Math.max(0, this.voiceCount - 1);   // deja de contar como "pulsada" al soltar
    this._updateBusGain();
    this._scheduleTail(v, rel, when);
  }
  // La voz soltada pasa a ser una "cola": suena su release y se libera al acabar.
  // MAX_TAILS acota el coste de acumular colas largas tocando rápido.
  _scheduleTail(v, rel, when = null) {
    this.tails.add(v);
    v._relAt = when !== null ? when : this.ctx.currentTime;   // edad de la cola: el presupuesto funde primero la más vieja
    const end = v.release(rel, when);
    if (this.offline) return;                     // offline: la cola vive hasta el final del render
    const ms = Math.max(20, (end - this.ctx.currentTime) * 1000 + 60);
    v._timer = setTimeout(() => { this.tails.delete(v); this._dispose(v); }, ms);
    if (this.tails.size > MAX_TAILS) this._fadeKill(this.tails.values().next().value);
  }
  _fadeKill(v) {            // fundido TAIL_FADE y liberar (ver arriba)
    if (!v) return;
    v._going = true;
    this.tails.delete(v);
    if (v._timer) clearTimeout(v._timer);
    if (v.disposed) return;
    v.fadeOut(TAIL_FADE);
    v._timer = setTimeout(() => this._dispose(v), TAIL_FADE * 1000 + 60);
  }
  // ---------- efectos de inserción bajo demanda (ver init) ----------
  _ensureDist() {
    if (this.shaper) return;
    const ctx = this.ctx, S = this.S;
    this.distPre = ctx.createGain(); this.distPre.gain.value = 1 + S.dist * 6;
    this.shaper = ctx.createWaveShaper(); this.shaper.curve = makeDistCurve(); this.shaper.oversample = '2x';
    this.distPost = ctx.createGain(); this.distPost.gain.value = 1 / (1 + S.dist);
    this.distWet = ctx.createGain(); this.distWet.gain.value = S.dist;
    this.amp.connect(this.distPre); this.distPre.connect(this.shaper); this.shaper.connect(this.distPost);
    this.distPost.connect(this.distWet); this.distWet.connect(this.distOut);
  }
  _ensureFl() {
    if (this.flDelay) return;
    const ctx = this.ctx, S = this.S;
    this.flDelay = ctx.createDelay(0.05); this.flDelay.delayTime.value = 0.003;
    this.flFb = ctx.createGain(); this.flFb.gain.value = 0.35;
    this.flWet = ctx.createGain(); this.flWet.gain.value = S.flAmt;
    this.distOut.connect(this.flDelay); this.flDelay.connect(this.flWet); this.flWet.connect(this.flOut);
    this.flDelay.connect(this.flFb); this.flFb.connect(this.flDelay);
    this.flLFO = mkLFO(ctx, S.flSpd, 0.002); this.flLFO.depth.connect(this.flDelay.delayTime);
  }
  // Chorus estéreo: dos líneas cortas moduladas por LFOs a distinta
  // velocidad (descorrela L/R), sin feedback.
  _ensureCh() {
    if (this.chWet) return;
    const ctx = this.ctx, S = this.S;
    this.chSend = ctx.createGain(); this.chSend.channelCount = 1; this.chSend.channelCountMode = 'explicit';
    this.chD1 = ctx.createDelay(0.06); this.chD1.delayTime.value = 0.020;
    this.chD2 = ctx.createDelay(0.06); this.chD2.delayTime.value = 0.028;
    this.chMerge = ctx.createChannelMerger(2);
    this.chWet = ctx.createGain(); this.chWet.gain.value = S.chMode === 'chorus' ? S.chAmt : 0;
    this.flOut.connect(this.chSend);
    this.chSend.connect(this.chD1); this.chSend.connect(this.chD2);
    this.chD1.connect(this.chMerge, 0, 0); this.chD2.connect(this.chMerge, 0, 1);
    this.chMerge.connect(this.chWet); this.chWet.connect(this.chOut);
    this.chLFO1 = mkLFO(ctx, S.chSpd, 0.006); this.chLFO1.depth.connect(this.chD1.delayTime);
    this.chLFO2 = mkLFO(ctx, S.chSpd * 1.17, 0.008); this.chLFO2.depth.connect(this.chD2.delayTime);
  }
  // Ensemble "máquina de cuerdas" (triple chorus estilo Solina): 3 líneas de
  // ~5 ms, cada una modulada por la SUMA de un LFO lento (chSpd) y otro
  // rápido (x10), con las fases repartidas a 120° entre líneas. Línea 1 -> L,
  // línea 3 -> R, línea 2 al centro. Comparte chAmt/chSpd con el chorus;
  // chMode decide cuál de los dos wets suena (el otro queda a 0).
  _ensureEns() {
    if (this.ensWet) return;
    const ctx = this.ctx, S = this.S;
    this.ensSend = ctx.createGain(); this.ensSend.channelCount = 1; this.ensSend.channelCountMode = 'explicit';
    this.ensL = ctx.createGain(); this.ensR = ctx.createGain();
    this.ensL.gain.value = this.ensR.gain.value = 0.6;   // 2 líneas por canal ~ nivel del chorus
    this.ensCtr = ctx.createGain(); this.ensCtr.gain.value = 0.71;
    this.ensMerge = ctx.createChannelMerger(2);
    this.ensWet = ctx.createGain(); this.ensWet.gain.value = S.chMode === 'ensemble' ? S.chAmt : 0;
    this.ensDelays = [];
    for (let i = 0; i < 3; i++) {
      const d = ctx.createDelay(0.03); d.delayTime.value = 0.005;
      const slow = mkPhasedLFO(ctx, S.chSpd, 0.0022, i * 120);
      const fast = mkPhasedLFO(ctx, Math.min(12, S.chSpd * 10), 0.00035, i * 120 + 90);
      slow.depth.connect(d.delayTime); fast.depth.connect(d.delayTime);
      this.ensDelays.push(d); this.ensSlow.push(slow); this.ensFast.push(fast);
    }
    this.flOut.connect(this.ensSend);
    this.ensDelays.forEach(d => this.ensSend.connect(d));
    this.ensDelays[0].connect(this.ensL);
    this.ensDelays[2].connect(this.ensR);
    this.ensDelays[1].connect(this.ensCtr); this.ensCtr.connect(this.ensL); this.ensCtr.connect(this.ensR);
    this.ensL.connect(this.ensMerge, 0, 0); this.ensR.connect(this.ensMerge, 0, 1);
    this.ensMerge.connect(this.ensWet); this.ensWet.connect(this.chOut);
  }
  // Coste fijo del motor (sin notas) en «voces simples», medido: lo cuenta el
  // presupuesto común junto con las voces (en Partes hay cinco motores).
  engineCost() {
    if (!this.ready) return 0;
    return ENGINE_COST.base + (this.shaper ? ENGINE_COST.dist : 0) + (this.flDelay ? ENGINE_COST.fl : 0)
      + (this.chWet ? ENGINE_COST.ch : 0) + (this.ensWet ? ENGINE_COST.ens : 0);
  }
  // Presupuesto de CPU (VOICE_BUDGET): hace sitio para una voz de coste `cost`
  // sumando lo que suenan TODOS los motores de este contexto. Primero funde la
  // cola más vieja de cualquiera de ellos; si no quedan colas, roba la voz
  // pulsada más vieja de ESTE motor (la parte que pide la nota). Lo que ya se
  // está yendo (_going) no cuenta: libera CPU en cuanto termina su fundido.
  _makeRoom(cost) {
    if (this.offline) return;
    const live = v => v && !v.disposed && !v._going;
    let used = 0;
    for (const e of this.budget) {
      used += e.engineCost();
      for (const v of e.voices.values()) if (live(v)) used += v.cost || 1;
      for (const v of e.tails) if (live(v)) used += v.cost || 1;
    }
    while (used + cost > VOICE_BUDGET + 1e-9) {          // (margen: que el redondeo de la suma no funda una cola de más)
      let old = null, owner = null;
      for (const e of this.budget) for (const v of e.tails) if (live(v) && (!old || v._relAt < old._relAt)) { old = v; owner = e; }
      if (old) { used -= old.cost || 1; owner._fadeKill(old); continue; }
      const id = [...this.voices.keys()].find(k => live(this.voices.get(k)));
      if (id === undefined) break;                          // nada más que soltar: la voz entra igual
      const v = this.voices.get(id);
      used -= v.cost || 1; this._releaseVoice(id, 0.02); v._going = true;
    }
  }
  _dispose(v) {             // libera nodos tras la cola de release (NO toca el contador)
    if (v.disposed) return;
    v.dispose();
  }
  _updateBusGain() {
    if (!this.ready) return;
    // Sólo cuenta voces PULSADAS (no las colas de release). Sin reducción hasta 4 voces;
    // por encima, compensación suave y lenta para no "bombear" pads y acordes sostenidos.
    const n = this.voiceCount;
    const scale = n <= 4 ? 1 : 1 / Math.sqrt(n / 4);
    this.voicesBus.gain.setTargetAtTime(scale, this.ctx.currentTime, 0.15);
  }
  _forVoices(fn) { this.voices.forEach(fn); }

  // ---------- API de parámetros ----------
  setOsc(which, key, value) { this.S[which][key] = value; }   // aplica en la siguiente nota

  set(name, value) {
    this.S[name] = value;
    if (!this.ready) return;
    // Matriz de modulación (claves planas mx{1..6}{src,dst,amt}): amt reajusta
    // la ganancia del slot en vivo; src/dst recablean el slot en las voces vivas.
    // Las voces NUEVAS leen S.mx* al construirse, como el resto del estado.
    const mx = /^mx(\d)(src|dst|amt)$/.exec(name);
    if (mx) { this._forVoices(v => mx[2] === 'amt' ? v.mxSetAmt(+mx[1]) : v.mxRewire(+mx[1])); return; }
    if (name.startsWith('fm4')) { this._forVoices(v => v.setFm4(name, value)); return; }   // FM4: params del worklet por nombre
    // Claves de la SALA (bpm, tiempo/damp/wow del eco, size/damp/pre de la
    // reverb): las aplica la Sala, que en modo Partes es compartida — y
    // propaga el valor al S de todas las partes (un solo reloj).
    if (SALA_KEYS.has(name)) { this.sala.set(name, value); return; }
    // LFOs por voz (lfoPhase 'voz'): Level/Speed/forma del LFO k también a las
    // copias de cada voz viva; el LFO global del motor sigue cambiando en el switch.
    const lf = /^(cut|res|freq|pwm|pan)Lfo(Lvl|Spd|Shape)$/.exec(name);
    if (lf) this._forVoices(v => v.setLfo(lf[1], lf[2].toLowerCase(), value));
    const now = this.ctx.currentTime, smooth = (p, val) => p.setTargetAtTime(val, now, 0.02);
    switch (name) {
      case 'mxDriftSpd': this._forVoices(v => v.setMxDriftSpd(value)); break;   // deriva por voz (fuente 'drift' de la matriz)
      // lfoPhase: estructura de la voz (LFO globales o propios): aplica por nota, como filterSlope
      case 'mix':   this._forVoices(v => v.setMix(value)); break;
      case 'ring':  this._forVoices(v => v.setRing(value)); break;
      case 'noise': this._forVoices(v => v.setNoise(value)); break;
      case 'noiseColor': this._forVoices(v => v.setNoiseColor(value)); break;
      case 'spread': this._forVoices(v => v.setSpread(value)); break;
      case 'drift':  this._forVoices(v => v.setDrift(value)); break;
      case 'uniVoices':                                    // el seg da string: coerción en setUnison
      case 'uniDetune': this._forVoices(v => v.setUnison(this.S.uniVoices, this.S.uniDetune)); break;
      case 'fmRatio':
      case 'fmIndex':
      case 'fmFb':    this._forVoices(v => v.setFM(this.S.fmRatio, this.S.fmIndex, this.S.fmFb)); break;
      case 'wtPos': this._forVoices(v => v.setWtPos(value)); break;
      case 'wtSet': try { getWtSet(value); } catch (e) {} break;   // precalienta el set (aplica en la siguiente nota)
      case 'cutoff':this._forVoices(v => v.setCutoff(value)); break;
      case 'reso':  this._forVoices(v => v.setReso(value)); break;
      case 'morph': this._forVoices(v => v.setMorph(value)); break;
      case 'filterEnvAmt': this._forVoices(v => v.setFilterEnvAmt(value)); break;
      case 'filterDrive': this._forVoices(v => v.setFilterDrive(value)); break;
      case 'keytrack': this._forVoices(v => v.setKeytrack(value, this.S.cutoff)); break;
      case 'pulseWidth':   this._forVoices(v => v.setPulseWidth(value)); break;
      case 'vocAmt':   this._forVoices(v => v.setVocAmt(value)); break;
      case 'vocVowel': this._forVoices(v => v.setVocVowel(value)); break;
      case 'vocSize':  this._forVoices(v => v.setVocSize(value)); break;
      case 'vocQ':     this._forVoices(v => v.setVocQ(value)); break;
      case 'vocVida':  this._forVoices(v => v.setVocVida(value)); break;
      case 'vocBrillo':this._forVoices(v => v.setVocBrillo(value)); break;
      // vocAtk es un evento de arranque de nota: se lee al crear cada voz
      case 'resAmt':    this._forVoices(v => v.setResAmt(value)); break;     // resonador modal (engine/reson.js)
      case 'resMat':    this._forVoices(v => v.setResMat(value)); break;
      case 'resDecay':  this._forVoices(v => v.setResDecay(value)); break;
      case 'resBrillo': this._forVoices(v => v.setResBrillo(value)); break;

      case 'amplitude': smooth(this.amp.gain, value); break;
      case 'ampLfoLvl': smooth(this.ampLFO.depth.gain, value); break;
      case 'ampLfoSpd': setLfoRate(this.ampLFO, value, now); break;
      // pitch/vibrato/PWM se conectan a los worklets bajo demanda (ver Voice.ensure*)
      case 'freqCents': smooth(this.pitchOffset.offset, value + (this._bend || 0)); if (value) this._forVoices(v => v.ensurePitch()); break;
      case 'freqLfoLvl': smooth(this.freqLFO.depth.gain, value); if (value) this._forVoices(v => v.ensureVib()); break;
      case 'freqLfoSpd': setLfoRate(this.freqLFO, value, now); break;
      case 'pwmLfoLvl': smooth(this.pwmLFO.depth.gain, value); if (value) this._forVoices(v => v.ensurePwm()); break;
      case 'pwmLfoSpd': setLfoRate(this.pwmLFO, value, now); break;
      case 'cutLfoLvl': smooth(this.cutLFO.depth.gain, value); if (value) this._forVoices(v => v.ensureCutLfo()); break;   // conectar al filtro solo al usarlo (Voice)
      case 'cutLfoSpd': setLfoRate(this.cutLFO, value, now); break;
      case 'resLfoLvl': smooth(this.resLFO.depth.gain, value); if (value) this._forVoices(v => v.ensureResLfo()); break;
      case 'resLfoSpd': setLfoRate(this.resLFO, value, now); break;
      case 'panLfoLvl': smooth(this.panLFO.depth.gain, value); if (value) this._forVoices(v => v.ensurePan()); break;
      case 'panLfoSpd': smooth(this.panLFO.osc.frequency, value); break;

      // formas de onda de los LFOs (nativas: cambio instantáneo; S&H/deriva: fuente alternativa)
      case 'ampLfoShape':  setLfoShape(this.ctx, this.ampLFO, value); break;
      case 'freqLfoShape': setLfoShape(this.ctx, this.freqLFO, value); break;
      case 'pwmLfoShape':  setLfoShape(this.ctx, this.pwmLFO, value); break;
      case 'cutLfoShape':  setLfoShape(this.ctx, this.cutLFO, value); break;
      case 'resLfoShape':  setLfoShape(this.ctx, this.resLFO, value); break;

      case 'dist':
        if (value > 0) this._ensureDist();
        smooth(this.distDry.gain, 1 - value);   // crossfade: a 0 = todo seco (limpio, sin recorte)
        if (this.shaper) {
          smooth(this.distPre.gain, 1 + value * 6);   // el drive vive aquí (curva fija)
          smooth(this.distPost.gain, 1 / (1 + value));
          smooth(this.distWet.gain, value);
        }
        break;
      case 'flAmt': if (value > 0) this._ensureFl(); if (this.flWet) smooth(this.flWet.gain, value); break;
      case 'flSpd': if (this.flLFO) smooth(this.flLFO.osc.frequency, value); break;
      case 'chAmt': {
        const ens = this.S.chMode === 'ensemble';
        if (value > 0) { if (ens) this._ensureEns(); else this._ensureCh(); }
        const w = ens ? this.ensWet : this.chWet; if (w) smooth(w.gain, value);
        break;
      }
      case 'chSpd':
        if (this.chLFO1) { smooth(this.chLFO1.osc.frequency, value); smooth(this.chLFO2.osc.frequency, value * 1.17); }
        this.ensSlow.forEach(l => smooth(l.osc.frequency, value));
        this.ensFast.forEach(l => smooth(l.osc.frequency, Math.min(12, value * 10)));
        break;
      case 'chMode':          // crossfade suave entre los dos wets (sin clicks)
        if (this.S.chAmt > 0) { if (value === 'ensemble') this._ensureEns(); else this._ensureCh(); }
        if (this.chWet) smooth(this.chWet.gain, value === 'chorus' ? this.S.chAmt : 0);
        if (this.ensWet) smooth(this.ensWet.gain, value === 'ensemble' ? this.S.chAmt : 0);
        break;
      // Envíos a la Sala. En modo único la realimentación del eco sigue al
      // Amount y los ecos entran en la reverb según el Mix — como siempre; en
      // modo Partes eso lo gobierna la columna Sala del mezclador.
      case 'dlyAmt': smooth(this.sendDly.gain, value); if (this.ownsSala) this.sala.setFeedback(Math.min(0.8, value * 0.85)); break;
      case 'width': this._forVoices(v => v.setWidth(value)); break;
      case 'reverbMix': smooth(this.sendRev.gain, value); if (this.ownsSala) this.sala.setDlyToRev(value); break;
      case 'master': if (this.ownsSala) this.sala.setMaster(value); else smooth(this.level.gain, value); break;   // Partes: fader de la parte
      case 'mode': this.allNotesOff(); break;   // cambio poli<->mono: corta todo para no dejar notas colgadas
      case 'arpMode': if (value === 'off') this.arp.stop(); break;   // div/oct/gate los lee el planificador en vivo
      case 'seqOn': if (value === 'off') this.seq.stop(); else this.allNotesOff(); break;   // pat/div/gate en vivo
      case 'seqLatch': if (value === 'off' && !this.seq.held.length) { this.seq.latched = null; this.seq._maybeStop(); } break;
      // a, d, s, r, glide, lfoFade, filterSlope, filterType: se leen al crear cada voz (sin nodo en vivo)
    }
  }

  // Rueda / aftertouch / expresión (0..1): fuentes de ejecución de la matriz. Fuera
  // de CONTROLS/presets (son gestos, como el bend). Antes de init() solo se anota.
  setPerf(id, v) {
    if (!(id in this.perfVal)) return;
    v = Math.max(0, Math.min(1, +v || 0)); this.perfVal[id] = v;
    if (this.ready) this.perf[id].offset.setTargetAtTime(v, this.ctx.currentTime, PERF_TAU);
  }

  // Pitch bend MIDI (cents). Va por fuera de CONTROLS/presets: se SUMA al
  // slider de cents en el mismo ConstantSource compartido (pitchOffset).
  setBend(cents) {
    this._bend = cents;
    if (!this.ready) return;
    this.pitchOffset.offset.setTargetAtTime(this.S.freqCents + cents, this.ctx.currentTime, 0.005);
    if (cents) this._forVoices(v => v.ensurePitch());
  }

  // ---------- modo Partes: mute / pan / macro / desmontaje ----------
  setMute(on) { if (this.ready) this.muteG.gain.setTargetAtTime(on ? 0 : 1, this.ctx.currentTime, 0.02); }
  setMacro(cents, tau = 0.3) { if (!this.ready) return; if (cents) this._macroConnect(); this.macroCut.offset.setTargetAtTime(cents, this.ctx.currentTime, tau); }
  // La macro se engancha a los filtros la primera vez que vale algo (en directo
  // al moverla el arreglo; offline al automatizarla) — voces vivas y colas incluidas.
  _macroConnect() {
    if (this._macroOn) return;
    this._macroOn = true;
    this._forVoices(v => v.ensureMacro()); this.tails.forEach(v => v.ensureMacro());
  }
  automateMacro(cents, t, ramp) {     // offline: valor (o rampa hasta) `cents` en t
    if (!this.ready) return;
    this._macroConnect();
    if (ramp) this.macroCut.offset.linearRampToValueAtTime(cents, t); else this.macroCut.offset.setValueAtTime(cents, t);
  }
  setPan(v)   { if (this.ready) this.partPan.pan.setTargetAtTime(Math.max(-1, Math.min(1, v)), this.ctx.currentTime, 0.02); }
  // Desmonta el motor (al apagar la escena): suelta voces y colas, para los
  // planificadores y los osciladores de LFO — un OscillatorNode arrancado
  // sigue consumiendo aunque nadie lo escuche — y se desengancha de la Sala.
  dispose() {
    if (!this.ready) return;
    this.allNotesOff();
    for (const v of this.tails) { if (v._timer) clearTimeout(v._timer); this._dispose(v); }
    this.tails.clear();
    clearInterval(this.wseq.timer); this.wseq.timer = null; this.wseq.looping.clear();
    const lfos = [this.ampLFO, this.cutLFO, this.resLFO, this.freqLFO, this.pwmLFO, this.flLFO,
                  this.chLFO1, this.chLFO2, this.panLFO, ...this.ensSlow, ...this.ensFast].filter(Boolean);   // los de los efectos, si llegaron a nacer
    for (const l of lfos) { try { l.osc.stop(); l.osc.disconnect(); } catch (e) {} if (l.alt) { try { l.alt.stop(); l.alt.disconnect(); } catch (e) {} } }
    try { this.pitchOffset.stop(); this.pitchOffset.disconnect(); } catch (e) {}
    try { this.macroCut.stop(); this.macroCut.disconnect(); } catch (e) {}
    for (const k in this.perf) { try { this.perf[k].stop(); this.perf[k].disconnect(); } catch (e) {} }
    for (const n of [this.chOut, this.level, this.muteG, this.partPan, this.sendDly, this.sendRev]) { try { n.disconnect(); } catch (e) {} }
    this.sala.engines = this.sala.engines.filter(e => e !== this);
    this.budget.delete(this);
    if (this.ownsSala) this.sala.dispose();
    this.ready = false;
  }

  getAnalyser() { return this.sala ? this.sala.analyser : null; }
  stats() { return { pressed: this.voiceCount, tails: this.tails.size, worklets: this.modStats ? this.modStats.worklets : 0 }; }
}

export const engine = new AudioEngine();
