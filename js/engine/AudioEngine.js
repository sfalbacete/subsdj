/* =====================================================================
   SubSDJ · AudioEngine — grafo global, LFOs, gestión de voces.
   Cadena global:
     voicesBus(auto-gain) -> amp(+LFO trémolo) -> distorsión -> flanger
       -> chorus|ensemble -> delay ping-pong -> reverb -> limitador
       -> master -> analyser -> destino
   El filtro ahora es POR VOZ (en Voice.js). Los LFOs de cutoff/reso/freq/pwm
   son globales pero se conectan a los params de cada voz al crearse.
   ===================================================================== */
import { makeDefaultState } from './state.js';
import { Voice } from './Voice.js';
import { Arp } from './Arp.js';

function makeNoise(ctx) {
  const len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
// Respuesta al impulso sintética para la reverb (ruido con decaimiento, estéreo
// descorrelacionado). damp (0..1) = decaimiento dependiente de frecuencia: un
// one-pole lowpass cuyo cutoff se CIERRA exponencialmente a lo largo de la cola
// (14 kHz -> hasta 200 Hz a tope), como en una sala real. La energía se
// renormaliza a la del IR sin filtrar: el knob oscurece, no baja el wet.
function makeIR(ctx, seconds, decay, damp = 0) {
  const rate = ctx.sampleRate, len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  const fMax = 14000, fMin = fMax * Math.pow(200 / fMax, damp);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0, expEnergy = 0, actEnergy = 0;
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, decay);
      const x = (Math.random() * 2 - 1) * env;
      if (damp > 0) {
        const fc = fMax * Math.pow(fMin / fMax, i / len);
        const a = 1 - Math.exp(-6.2832 * fc / rate);
        y += a * (x - y);
        d[i] = y;
      } else d[i] = x;
      expEnergy += env * env; actEnergy += d[i] * d[i];
    }
    if (damp > 0 && actEnergy > 1e-12) {
      const g = Math.sqrt(expEnergy / 3 / actEnergy);   // E[x²] del ruido U(-1,1)·env = env²/3
      for (let i = 0; i < len; i++) d[i] *= g;
    }
  }
  return buf;
}
// Curva de saturación FIJA (tanh). Antes se regeneraba con cada gesto del knob
// Drive: un Float32Array(1024) por evento y el swap de curva podía hacer click.
// Ahora el drive vive en la ganancia de entrada (distPre) y la normalización (distPost).
function makeDistCurve() {
  const n = 1024, c = new Float32Array(n), k = 4;
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return c;
}
function mkLFO(ctx, freq, depth) {
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
  const gain = ctx.createGain(); gain.gain.value = depth;
  osc.connect(gain); osc.start();
  return { osc, depth: gain };
}
// LFO seno con fase inicial (los OscillatorNode no la tienen): un PeriodicWave
// con sin(wt+phi) = sin(phi)·cos(wt) + cos(phi)·sin(wt). Para el ensemble a 3 fases.
function mkPhasedLFO(ctx, freq, depth, phaseDeg) {
  const ph = phaseDeg * Math.PI / 180;
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(ctx.createPeriodicWave(
    new Float32Array([0, Math.sin(ph)]),
    new Float32Array([0, Math.cos(ph)]),
    { disableNormalization: true }));
  osc.frequency.value = freq;
  const gain = ctx.createGain(); gain.gain.value = depth;
  osc.connect(gain); osc.start();
  return { osc, depth: gain };
}

const MAX_POLY = 10;    // voces pulsadas a la vez; al pasar, se roba la más antigua
const MAX_TAILS = 12;   // colas de release vivas; por encima, fundido exprés de la más vieja

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
  }

  // ctx opcional: el self-test pasa un OfflineAudioContext; por defecto crea el real.
  async init(providedCtx = null) {
    if (this.ctx) return;
    const ctx = providedCtx || new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.noiseBuffer = makeNoise(ctx);

    // Carga de los worklets (relativo a este módulo, robusto)
    await Promise.all([
      ctx.audioWorklet.addModule(new URL('./worklets/pulse-processor.js', import.meta.url)),
      ctx.audioWorklet.addModule(new URL('./worklets/recorder-processor.js', import.meta.url)),
    ]);

    const S = this.S;

    this.voicesBus = ctx.createGain(); this.voicesBus.gain.value = 1;
    this.amp = ctx.createGain(); this.amp.gain.value = S.amplitude;

    // Distorsión (dry/wet: a 0 es TRANSPARENTE). Un WaveShaper recorta a ±1 cualquier
    // pico >1 que le entre, así que tenerlo siempre en serie saturaba con politonía.
    // Ahora sólo se mezcla la parte "wet" según el drive; a 0 pasa todo seco.
    this.distDry = ctx.createGain(); this.distDry.gain.value = 1 - S.dist;
    this.distPre = ctx.createGain(); this.distPre.gain.value = 1 + S.dist * 6;
    this.shaper = ctx.createWaveShaper(); this.shaper.curve = makeDistCurve(); this.shaper.oversample = '2x';
    this.distPost = ctx.createGain(); this.distPost.gain.value = 1 / (1 + S.dist);
    this.distWet = ctx.createGain(); this.distWet.gain.value = S.dist;
    this.distOut = ctx.createGain();

    // Flanger
    this.flDry = ctx.createGain();
    this.flDelay = ctx.createDelay(0.05); this.flDelay.delayTime.value = 0.003;
    this.flFb = ctx.createGain(); this.flFb.gain.value = 0.35;
    this.flWet = ctx.createGain(); this.flWet.gain.value = S.flAmt;
    this.flOut = ctx.createGain();

    // Chorus estéreo: dos líneas cortas moduladas por LFOs a distinta
    // velocidad (descorrela L/R), sin feedback. A 0 es transparente (solo dry).
    this.chDry = ctx.createGain();
    this.chSend = ctx.createGain(); this.chSend.channelCount = 1; this.chSend.channelCountMode = 'explicit';
    this.chD1 = ctx.createDelay(0.06); this.chD1.delayTime.value = 0.020;
    this.chD2 = ctx.createDelay(0.06); this.chD2.delayTime.value = 0.028;
    this.chMerge = ctx.createChannelMerger(2);
    this.chWet = ctx.createGain(); this.chWet.gain.value = S.chMode === 'chorus' ? S.chAmt : 0;
    this.chOut = ctx.createGain();

    // Ensemble "máquina de cuerdas" (triple chorus estilo Solina): 3 líneas de
    // ~5 ms, cada una modulada por la SUMA de un LFO lento (chSpd) y otro
    // rápido (x10), con las fases repartidas a 120° entre líneas. Línea 1 -> L,
    // línea 3 -> R, línea 2 al centro. Comparte chAmt/chSpd con el chorus;
    // chMode decide cuál de los dos wets suena (el otro queda a 0).
    this.ensSend = ctx.createGain(); this.ensSend.channelCount = 1; this.ensSend.channelCountMode = 'explicit';
    this.ensL = ctx.createGain(); this.ensR = ctx.createGain();
    this.ensL.gain.value = this.ensR.gain.value = 0.6;   // 2 líneas por canal ~ nivel del chorus
    this.ensCtr = ctx.createGain(); this.ensCtr.gain.value = 0.71;
    this.ensMerge = ctx.createChannelMerger(2);
    this.ensWet = ctx.createGain(); this.ensWet.gain.value = S.chMode === 'ensemble' ? S.chAmt : 0;
    this.ensDelays = []; this.ensSlow = []; this.ensFast = [];
    for (let i = 0; i < 3; i++) {
      const d = ctx.createDelay(0.03); d.delayTime.value = 0.005;
      const slow = mkPhasedLFO(ctx, S.chSpd, 0.0022, i * 120);
      const fast = mkPhasedLFO(ctx, Math.min(12, S.chSpd * 10), 0.00035, i * 120 + 90);
      slow.depth.connect(d.delayTime); fast.depth.connect(d.delayTime);
      this.ensDelays.push(d); this.ensSlow.push(slow); this.ensFast.push(fast);
    }

    // Delay ping-pong (estéreo): los ecos rebotan L<->R
    this.dlDry = ctx.createGain();
    this.ppSend = ctx.createGain();                 // suma a mono el envío al ping-pong
    this.ppSend.channelCount = 1; this.ppSend.channelCountMode = 'explicit';
    this.dlyL = ctx.createDelay(2.0); this.dlyL.delayTime.value = this._effDelay();
    this.dlyR = ctx.createDelay(2.0); this.dlyR.delayTime.value = this._effDelay();
    this.ppFbL = ctx.createGain(); this.ppFbR = ctx.createGain();
    this.ppFbL.gain.value = this.ppFbR.gain.value = Math.min(0.8, S.dlyAmt * 0.85);
    this.ppMerge = ctx.createChannelMerger(2);
    this.dlWet = ctx.createGain(); this.dlWet.gain.value = S.dlyAmt;
    this.dlOut = ctx.createGain();

    // Reverb por convolución (IR generada), dry/wet. DOS convolvers en A/B:
    // la IR nueva entra por el que está apagado y se cruza en ~50 ms, sin
    // cortar en seco la cola de la anterior (antes: swap de buffer = corte).
    // Predelay: DelayNode antes de los convolvers (separa el ataque de la cola).
    this.revPre = ctx.createDelay(0.1); this.revPre.delayTime.value = S.reverbPre;
    this.convA = ctx.createConvolver(); this.convA.buffer = makeIR(ctx, S.reverbSize, 2.5, S.reverbDamp);
    this.convB = ctx.createConvolver();
    this.revXA = ctx.createGain(); this.revXA.gain.value = 1;
    this.revXB = ctx.createGain(); this.revXB.gain.value = 0;
    this._revFront = 'A';
    this.revDry = ctx.createGain();
    this.revWet = ctx.createGain(); this.revWet.gain.value = S.reverbMix;
    this.revOut = ctx.createGain();

    // Limitador de salida -> master -> analyser
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -3; this.comp.knee.value = 0; this.comp.ratio.value = 20;
    this.comp.attack.value = 0.002; this.comp.release.value = 0.1;
    this.master = ctx.createGain(); this.master.gain.value = S.master;
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0.8;

    // Conexiones globales
    this.voicesBus.connect(this.amp);
    this.amp.connect(this.distDry); this.distDry.connect(this.distOut);
    this.amp.connect(this.distPre); this.distPre.connect(this.shaper); this.shaper.connect(this.distPost); this.distPost.connect(this.distWet); this.distWet.connect(this.distOut);
    this.distOut.connect(this.flDry); this.flDry.connect(this.flOut);
    this.distOut.connect(this.flDelay); this.flDelay.connect(this.flWet); this.flWet.connect(this.flOut);
    this.flDelay.connect(this.flFb); this.flFb.connect(this.flDelay);
    // Chorus (entre flanger y delay)
    this.flOut.connect(this.chDry); this.chDry.connect(this.chOut);
    this.flOut.connect(this.chSend);
    this.chSend.connect(this.chD1); this.chSend.connect(this.chD2);
    this.chD1.connect(this.chMerge, 0, 0); this.chD2.connect(this.chMerge, 0, 1);
    this.chMerge.connect(this.chWet); this.chWet.connect(this.chOut);
    // Ensemble (en paralelo con el chorus; su wet está a 0 si chMode='chorus')
    this.flOut.connect(this.ensSend);
    this.ensDelays.forEach(d => this.ensSend.connect(d));
    this.ensDelays[0].connect(this.ensL);
    this.ensDelays[2].connect(this.ensR);
    this.ensDelays[1].connect(this.ensCtr); this.ensCtr.connect(this.ensL); this.ensCtr.connect(this.ensR);
    this.ensL.connect(this.ensMerge, 0, 0); this.ensR.connect(this.ensMerge, 0, 1);
    this.ensMerge.connect(this.ensWet); this.ensWet.connect(this.chOut);
    // Delay ping-pong
    this.chOut.connect(this.dlDry); this.dlDry.connect(this.dlOut);          // seco (conserva el estéreo de las voces)
    this.chOut.connect(this.ppSend); this.ppSend.connect(this.dlyL);          // envío mono
    this.dlyL.connect(this.ppMerge, 0, 0);                                    // dlyL -> canal izquierdo
    this.dlyR.connect(this.ppMerge, 0, 1);                                    // dlyR -> canal derecho
    this.dlyL.connect(this.ppFbL); this.ppFbL.connect(this.dlyR);             // realimentación cruzada L->R
    this.dlyR.connect(this.ppFbR); this.ppFbR.connect(this.dlyL);             // realimentación cruzada R->L
    this.ppMerge.connect(this.dlWet); this.dlWet.connect(this.dlOut);
    // Reverb (convB no recibe entrada hasta el primer cambio de Size/Damp)
    this.dlOut.connect(this.revDry); this.revDry.connect(this.revOut);
    this.dlOut.connect(this.revPre); this.revPre.connect(this.convA);
    this.convA.connect(this.revXA); this.revXA.connect(this.revWet);
    this.convB.connect(this.revXB); this.revXB.connect(this.revWet);
    this.revWet.connect(this.revOut);
    // Salida
    this.revOut.connect(this.comp); this.comp.connect(this.master);
    this.master.connect(this.analyser); this.analyser.connect(ctx.destination);

    // LFOs
    this.ampLFO = mkLFO(ctx, S.ampLfoSpd, S.ampLfoLvl); this.ampLFO.depth.connect(this.amp.gain);
    this.cutLFO = mkLFO(ctx, S.cutLfoSpd, S.cutLfoLvl);   // depth se conecta por voz
    this.resLFO = mkLFO(ctx, S.resLfoSpd, S.resLfoLvl);
    this.freqLFO = mkLFO(ctx, S.freqLfoSpd, S.freqLfoLvl);
    this.pwmLFO = mkLFO(ctx, S.pwmLfoSpd, S.pwmLfoLvl);
    this.flLFO = mkLFO(ctx, S.flSpd, 0.002); this.flLFO.depth.connect(this.flDelay.delayTime);
    this.chLFO1 = mkLFO(ctx, S.chSpd, 0.006); this.chLFO1.depth.connect(this.chD1.delayTime);
    this.chLFO2 = mkLFO(ctx, S.chSpd * 1.17, 0.008); this.chLFO2.depth.connect(this.chD2.delayTime);
    this.panLFO = mkLFO(ctx, S.panLfoSpd, S.panLfoLvl);   // autopan: depth se conecta por voz
    // formas de onda de los LFOs (el estado puede traerlas de un preset)
    this.ampLFO.osc.type = S.ampLfoShape;   this.freqLFO.osc.type = S.freqLfoShape;
    this.pwmLFO.osc.type = S.pwmLfoShape;   this.cutLFO.osc.type = S.cutLfoShape;
    this.resLFO.osc.type = S.resLfoShape;

    this.pitchOffset = ctx.createConstantSource(); this.pitchOffset.offset.value = S.freqCents; this.pitchOffset.start();

    // hub de modulación que se pasa a cada voz
    this.modStats = { worklets: 0 };     // contador de osciladores worklet vivos (HUD)
    this.mod = {
      voicesBus: this.voicesBus, noiseBuffer: this.noiseBuffer,
      pitchOffset: this.pitchOffset,
      freqLFOGain: this.freqLFO.depth, pwmLFOGain: this.pwmLFO.depth,
      cutLFOGain: this.cutLFO.depth, resLFOGain: this.resLFO.depth,
      panLFOGain: this.panLFO.depth,
      stats: this.modStats,
    };

    this.ready = true;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  // ---------- voces ----------
  noteOn(id, freq, vel = 1) {
    if (!this.ready) return;
    if (this.S.arpMode !== 'off') return this.arp.hold(id, freq, vel);   // el arp secuencia las notas
    this._directOn(id, freq, vel);
  }
  noteOff(id) {
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
    const v = new Voice(this.ctx, this.S, this.mod, { freq, vel, startFreq: this.lastFreq, startAt: when });
    if (this._bend) v.ensurePitch();     // bend activo: engancha el pitch global a la voz nueva
    this.voices.set(id, v);
    this.lastFreq = freq;
    this.voiceCount++; this._updateBusGain();
  }
  _directOff(id) {
    if (this.S.mode === 'mono') return this._monoOff(id);
    this._releaseVoice(id, this.S.r);
  }
  allNotesOff() {
    this.arp.held = []; this.arp._maybeStop();
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
      const v = new Voice(this.ctx, this.S, this.mod, { freq, vel, startFreq: this.lastFreq, startAt: when });
      if (this._bend) v.ensurePitch();
      this.monoVoice = v; this.voices.set('mono', v);
      this.lastFreq = freq;
      this.voiceCount++; this._updateBusGain();
    }
  }
  _monoOff(id) {
    this.heldStack = this.heldStack.filter(n => n.id !== id);
    if (this.heldStack.length) {
      const top = this.heldStack[this.heldStack.length - 1];
      if (this.monoVoice && !this.monoVoice.disposed) { this.monoVoice.glideTo(top.freq, this.S.glide); this.lastFreq = top.freq; }
    } else {
      this._releaseMono(this.S.r);
    }
  }
  _releaseMono(rel) {
    const v = this.monoVoice; if (!v) return;
    this.voices.delete('mono'); this.monoVoice = null;
    this.voiceCount = Math.max(0, this.voiceCount - 1); this._updateBusGain();
    this._scheduleTail(v, rel);
  }
  _killMono() {
    const v = this.monoVoice; if (!v) return;
    if (v._timer) clearTimeout(v._timer);
    this._dispose(v); this.voices.delete('mono'); this.monoVoice = null;
    this.voiceCount = Math.max(0, this.voiceCount - 1); this._updateBusGain();
  }

  _releaseVoice(id, rel) {
    const v = this.voices.get(id); if (!v) return;
    this.voices.delete(id);
    this.voiceCount = Math.max(0, this.voiceCount - 1);   // deja de contar como "pulsada" al soltar
    this._updateBusGain();
    this._scheduleTail(v, rel);
  }
  // La voz soltada pasa a ser una "cola": suena su release y se libera al acabar.
  // MAX_TAILS acota el coste de acumular colas largas tocando rápido.
  _scheduleTail(v, rel) {
    this.tails.add(v);
    const end = v.release(rel);
    const ms = Math.max(20, (end - this.ctx.currentTime) * 1000 + 60);
    v._timer = setTimeout(() => { this.tails.delete(v); this._dispose(v); }, ms);
    if (this.tails.size > MAX_TAILS) this._fadeKill(this.tails.values().next().value);
  }
  _fadeKill(v) {            // fundido exprés (~40 ms) y liberar: entre 12 colas es inaudible
    if (!v) return;
    this.tails.delete(v);
    if (v._timer) clearTimeout(v._timer);
    if (v.disposed) return;
    v.fadeOut(0.01);
    v._timer = setTimeout(() => this._dispose(v), 60);
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
    const now = this.ctx.currentTime, smooth = (p, val) => p.setTargetAtTime(val, now, 0.02);
    switch (name) {
      case 'mix':   this._forVoices(v => v.setMix(value)); break;
      case 'ring':  this._forVoices(v => v.setRing(value)); break;
      case 'noise': this._forVoices(v => v.setNoise(value)); break;
      case 'spread': this._forVoices(v => v.setSpread(value)); break;
      case 'drift':  this._forVoices(v => v.setDrift(value)); break;
      case 'uniVoices':                                    // el seg da string: coerción en setUnison
      case 'uniDetune': this._forVoices(v => v.setUnison(this.S.uniVoices, this.S.uniDetune)); break;
      case 'fmRatio':
      case 'fmIndex': this._forVoices(v => v.setFM(this.S.fmRatio, this.S.fmIndex)); break;
      case 'cutoff':this._forVoices(v => v.setCutoff(value)); break;
      case 'reso':  this._forVoices(v => v.setReso(value)); break;
      case 'morph': this._forVoices(v => v.setMorph(value)); break;
      case 'filterEnvAmt': this._forVoices(v => v.setFilterEnvAmt(value)); break;
      case 'filterDrive': this._forVoices(v => v.setFilterDrive(value)); break;
      case 'keytrack': this._forVoices(v => v.setKeytrack(value, this.S.cutoff)); break;
      case 'pulseWidth':   this._forVoices(v => v.setPulseWidth(value)); break;

      case 'amplitude': smooth(this.amp.gain, value); break;
      case 'ampLfoLvl': smooth(this.ampLFO.depth.gain, value); break;
      case 'ampLfoSpd': smooth(this.ampLFO.osc.frequency, value); break;
      // pitch/vibrato/PWM se conectan a los worklets bajo demanda (ver Voice.ensure*)
      case 'freqCents': smooth(this.pitchOffset.offset, value + (this._bend || 0)); if (value) this._forVoices(v => v.ensurePitch()); break;
      case 'freqLfoLvl': smooth(this.freqLFO.depth.gain, value); if (value) this._forVoices(v => v.ensureVib()); break;
      case 'freqLfoSpd': smooth(this.freqLFO.osc.frequency, value); break;
      case 'pwmLfoLvl': smooth(this.pwmLFO.depth.gain, value); if (value) this._forVoices(v => v.ensurePwm()); break;
      case 'pwmLfoSpd': smooth(this.pwmLFO.osc.frequency, value); break;
      case 'cutLfoLvl': smooth(this.cutLFO.depth.gain, value); break;
      case 'cutLfoSpd': smooth(this.cutLFO.osc.frequency, value); break;
      case 'resLfoLvl': smooth(this.resLFO.depth.gain, value); break;
      case 'resLfoSpd': smooth(this.resLFO.osc.frequency, value); break;
      case 'panLfoLvl': smooth(this.panLFO.depth.gain, value); if (value) this._forVoices(v => v.ensurePan()); break;
      case 'panLfoSpd': smooth(this.panLFO.osc.frequency, value); break;

      // formas de onda de los LFOs (osciladores nativos: cambio instantáneo)
      case 'ampLfoShape':  this.ampLFO.osc.type = value; break;
      case 'freqLfoShape': this.freqLFO.osc.type = value; break;
      case 'pwmLfoShape':  this.pwmLFO.osc.type = value; break;
      case 'cutLfoShape':  this.cutLFO.osc.type = value; break;
      case 'resLfoShape':  this.resLFO.osc.type = value; break;

      case 'dist':
        smooth(this.distPre.gain, 1 + value * 6);   // el drive vive aquí (curva fija)
        smooth(this.distPost.gain, 1 / (1 + value));
        smooth(this.distDry.gain, 1 - value);   // crossfade: a 0 = todo seco (limpio, sin recorte)
        smooth(this.distWet.gain, value);
        break;
      case 'flAmt': smooth(this.flWet.gain, value); break;
      case 'flSpd': smooth(this.flLFO.osc.frequency, value); break;
      case 'chAmt': smooth(this.S.chMode === 'ensemble' ? this.ensWet.gain : this.chWet.gain, value); break;
      case 'chSpd':
        smooth(this.chLFO1.osc.frequency, value); smooth(this.chLFO2.osc.frequency, value * 1.17);
        this.ensSlow.forEach(l => smooth(l.osc.frequency, value));
        this.ensFast.forEach(l => smooth(l.osc.frequency, Math.min(12, value * 10)));
        break;
      case 'chMode':          // crossfade suave entre los dos wets (sin clicks)
        smooth(this.chWet.gain, value === 'chorus' ? this.S.chAmt : 0);
        smooth(this.ensWet.gain, value === 'ensemble' ? this.S.chAmt : 0);
        break;
      case 'dlyAmt': { const fb = Math.min(0.8, value * 0.85); smooth(this.dlWet.gain, value); smooth(this.ppFbL.gain, fb); smooth(this.ppFbR.gain, fb); break; }
      case 'dlyTime':                                      // con sync activo manda el bpm, no el knob
      case 'dlySync':
      case 'bpm': { const tt = this._effDelay(); smooth(this.dlyL.delayTime, tt); smooth(this.dlyR.delayTime, tt); break; }
      case 'width': this._forVoices(v => v.setWidth(value)); break;
      case 'reverbMix': smooth(this.revWet.gain, value); break;
      case 'reverbPre': smooth(this.revPre.delayTime, value); break;
      case 'reverbSize':                                   // regenerar IR es costoso: lo aplazamos (debounce)
      case 'reverbDamp':                                   // (el damp vive en la IR: misma ruta)
        clearTimeout(this._revTimer);
        this._revTimer = setTimeout(() => this._swapIR(this.S.reverbSize), 120);
        break;
      case 'master': smooth(this.master.gain, value); break;
      case 'mode': this.allNotesOff(); break;   // cambio poli<->mono: corta todo para no dejar notas colgadas
      case 'arpMode': if (value === 'off') this.arp.stop(); break;   // div/oct/gate los lee el planificador en vivo
      // a, d, s, r, glide, lfoFade, filterSlope: se leen al crear cada voz (sin nodo en vivo)
    }
  }

  // Nueva IR por el convolver trasero + crossfade; el delantero se desconecta
  // al acabar el fundido (un convolver con entrada consume CPU aunque su salida
  // esté a 0). connect() duplicado sobre el mismo par es inocuo (lo ignora).
  _swapIR(seconds) {
    const t = this.ctx.currentTime;
    const front = this._revFront === 'A' ? { c: this.convA, g: this.revXA } : { c: this.convB, g: this.revXB };
    const back  = this._revFront === 'A' ? { c: this.convB, g: this.revXB } : { c: this.convA, g: this.revXA };
    try { back.c.buffer = makeIR(this.ctx, seconds, 2.5, this.S.reverbDamp); } catch (e) { return; }
    this.revPre.connect(back.c);
    back.g.gain.setTargetAtTime(1, t, 0.05);
    front.g.gain.setTargetAtTime(0, t, 0.05);
    clearTimeout(this._revOffTimer);
    this._revOffTimer = setTimeout(() => { try { this.revPre.disconnect(front.c); } catch (e) {} }, 400);
    this._revFront = this._revFront === 'A' ? 'B' : 'A';
  }

  // Tiempo efectivo del delay: libre (knob Time) o división musical del BPM
  _effDelay() {
    const div = { '1/8': 0.5, '1/8.': 0.75, '1/4': 1, '1/4.': 1.5, '1/2': 2 }[this.S.dlySync];
    return div ? Math.min(1.5, (60 / this.S.bpm) * div) : this.S.dlyTime;
  }

  // Pitch bend MIDI (cents). Va por fuera de CONTROLS/presets: se SUMA al
  // slider de cents en el mismo ConstantSource compartido (pitchOffset).
  setBend(cents) {
    this._bend = cents;
    if (!this.ready) return;
    this.pitchOffset.offset.setTargetAtTime(this.S.freqCents + cents, this.ctx.currentTime, 0.005);
    if (cents) this._forVoices(v => v.ensurePitch());
  }

  getAnalyser() { return this.analyser; }
  stats() { return { pressed: this.voiceCount, tails: this.tails.size, worklets: this.modStats ? this.modStats.worklets : 0 }; }
}

export const engine = new AudioEngine();
