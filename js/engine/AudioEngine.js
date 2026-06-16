/* =====================================================================
   SubSDJ · AudioEngine — grafo global, LFOs, gestión de voces.
   Cadena global:
     voicesBus(auto-gain) -> amp(+LFO trémolo) -> distorsión -> flanger
       -> delay -> limitador -> master -> analyser -> destino
   El filtro ahora es POR VOZ (en Voice.js). Los LFOs de cutoff/reso/freq/pwm
   son globales pero se conectan a los params de cada voz al crearse.
   ===================================================================== */
import { makeDefaultState } from './state.js';
import { Voice } from './Voice.js';

function makeNoise(ctx) {
  const len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
// Respuesta al impulso sintética para la reverb (ruido con decaimiento, estéreo descorrelacionado)
function makeIR(ctx, seconds, decay) {
  const rate = ctx.sampleRate, len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}
function makeDistCurve(drive) {
  const n = 1024, c = new Float32Array(n), k = 1 + drive * 6;
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return c;
}
function mkLFO(ctx, freq, depth) {
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
  const gain = ctx.createGain(); gain.gain.value = depth;
  osc.connect(gain); osc.start();
  return { osc, depth: gain };
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.S = makeDefaultState();
    this.voices = new Map();      // id -> Voice
    this.voiceCount = 0;
    this.lastFreq = null;         // para glide
    this.heldStack = [];          // notas pulsadas en modo mono (cima = sonando)
    this.monoVoice = null;        // voz única en modo mono
  }

  async init() {
    if (this.ctx) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.noiseBuffer = makeNoise(ctx);

    // Carga del worklet (relativo a este módulo, robusto)
    await ctx.audioWorklet.addModule(new URL('./worklets/pulse-processor.js', import.meta.url));

    const S = this.S;

    this.voicesBus = ctx.createGain(); this.voicesBus.gain.value = 1;
    this.amp = ctx.createGain(); this.amp.gain.value = S.amplitude;

    // Distorsión (dry/wet: a 0 es TRANSPARENTE). Un WaveShaper recorta a ±1 cualquier
    // pico >1 que le entre, así que tenerlo siempre en serie saturaba con politonía.
    // Ahora sólo se mezcla la parte "wet" según el drive; a 0 pasa todo seco.
    this.distDry = ctx.createGain(); this.distDry.gain.value = 1 - S.dist;
    this.distPre = ctx.createGain(); this.distPre.gain.value = 1 + S.dist * 2;
    this.shaper = ctx.createWaveShaper(); this.shaper.curve = makeDistCurve(S.dist); this.shaper.oversample = '2x';
    this.distPost = ctx.createGain(); this.distPost.gain.value = 1 / (1 + S.dist);
    this.distWet = ctx.createGain(); this.distWet.gain.value = S.dist;
    this.distOut = ctx.createGain();

    // Flanger
    this.flDry = ctx.createGain();
    this.flDelay = ctx.createDelay(0.05); this.flDelay.delayTime.value = 0.003;
    this.flFb = ctx.createGain(); this.flFb.gain.value = 0.35;
    this.flWet = ctx.createGain(); this.flWet.gain.value = S.flAmt;
    this.flOut = ctx.createGain();

    // Delay ping-pong (estéreo): los ecos rebotan L<->R
    this.dlDry = ctx.createGain();
    this.ppSend = ctx.createGain();                 // suma a mono el envío al ping-pong
    this.ppSend.channelCount = 1; this.ppSend.channelCountMode = 'explicit';
    this.dlyL = ctx.createDelay(2.0); this.dlyL.delayTime.value = S.dlyTime;
    this.dlyR = ctx.createDelay(2.0); this.dlyR.delayTime.value = S.dlyTime;
    this.ppFbL = ctx.createGain(); this.ppFbR = ctx.createGain();
    this.ppFbL.gain.value = this.ppFbR.gain.value = Math.min(0.8, S.dlyAmt * 0.85);
    this.ppMerge = ctx.createChannelMerger(2);
    this.dlWet = ctx.createGain(); this.dlWet.gain.value = S.dlyAmt;
    this.dlOut = ctx.createGain();

    // Reverb por convolución (IR generada), dry/wet
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = makeIR(ctx, S.reverbSize, 2.5);
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
    // Delay ping-pong
    this.flOut.connect(this.dlDry); this.dlDry.connect(this.dlOut);          // seco (conserva el estéreo de las voces)
    this.flOut.connect(this.ppSend); this.ppSend.connect(this.dlyL);          // envío mono
    this.dlyL.connect(this.ppMerge, 0, 0);                                    // dlyL -> canal izquierdo
    this.dlyR.connect(this.ppMerge, 0, 1);                                    // dlyR -> canal derecho
    this.dlyL.connect(this.ppFbL); this.ppFbL.connect(this.dlyR);             // realimentación cruzada L->R
    this.dlyR.connect(this.ppFbR); this.ppFbR.connect(this.dlyL);             // realimentación cruzada R->L
    this.ppMerge.connect(this.dlWet); this.dlWet.connect(this.dlOut);
    // Reverb
    this.dlOut.connect(this.revDry); this.revDry.connect(this.revOut);
    this.dlOut.connect(this.convolver); this.convolver.connect(this.revWet); this.revWet.connect(this.revOut);
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

    this.pitchOffset = ctx.createConstantSource(); this.pitchOffset.offset.value = S.freqCents; this.pitchOffset.start();

    // hub de modulación que se pasa a cada voz
    this.mod = {
      voicesBus: this.voicesBus, noiseBuffer: this.noiseBuffer,
      pitchOffset: this.pitchOffset,
      freqLFOGain: this.freqLFO.depth, pwmLFOGain: this.pwmLFO.depth,
      cutLFOGain: this.cutLFO.depth, resLFOGain: this.resLFO.depth,
    };

    this.ready = true;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  // ---------- voces ----------
  noteOn(id, freq, vel = 1) {
    if (!this.ready) return;
    if (this.S.mode === 'mono') return this._monoOn(id, freq, vel);
    const existing = this.voices.get(id);
    if (existing) { if (existing._timer) clearTimeout(existing._timer); this._dispose(existing); this.voices.delete(id); this.voiceCount = Math.max(0, this.voiceCount - 1); }
    const v = new Voice(this.ctx, this.S, this.mod, { freq, vel, startFreq: this.lastFreq });
    this.voices.set(id, v);
    this.lastFreq = freq;
    this.voiceCount++; this._updateBusGain();
  }
  noteOff(id) {
    if (this.S.mode === 'mono') return this._monoOff(id);
    this._releaseVoice(id, this.S.r);
  }
  allNotesOff() {
    this.heldStack = []; this.monoVoice = null;
    for (const id of [...this.voices.keys()]) this._releaseVoice(id, 0.03);
  }

  // ---- modo mono / legato (prioridad de última nota) ----
  _monoOn(id, freq, vel) {
    const had = this.heldStack.length > 0;
    this.heldStack = this.heldStack.filter(n => n.id !== id);
    this.heldStack.push({ id, freq, vel });
    if (had && this.monoVoice && !this.monoVoice.disposed) {
      this.monoVoice.glideTo(freq, this.S.glide);   // legato: desliza sin reiniciar envolvente
      this.lastFreq = freq;
    } else {
      this._killMono();
      const v = new Voice(this.ctx, this.S, this.mod, { freq, vel, startFreq: this.lastFreq });
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
    const end = v.release(rel);
    const ms = Math.max(20, (end - this.ctx.currentTime) * 1000 + 60);
    v._timer = setTimeout(() => this._dispose(v), ms);
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
    const end = v.release(rel);
    const ms = Math.max(20, (end - this.ctx.currentTime) * 1000 + 60);
    v._timer = setTimeout(() => this._dispose(v), ms);
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
      case 'cutoff':this._forVoices(v => v.setCutoff(value)); break;
      case 'reso':  this._forVoices(v => v.setReso(value)); break;
      case 'morph': this._forVoices(v => v.setMorph(value)); break;
      case 'filterEnvAmt': this._forVoices(v => v.setFilterEnvAmt(value)); break;
      case 'pulseWidth':   this._forVoices(v => v.setPulseWidth(value)); break;

      case 'amplitude': smooth(this.amp.gain, value); break;
      case 'ampLfoLvl': smooth(this.ampLFO.depth.gain, value); break;
      case 'ampLfoSpd': smooth(this.ampLFO.osc.frequency, value); break;
      case 'freqCents': smooth(this.pitchOffset.offset, value); break;
      case 'freqLfoLvl': smooth(this.freqLFO.depth.gain, value); break;
      case 'freqLfoSpd': smooth(this.freqLFO.osc.frequency, value); break;
      case 'pwmLfoLvl': smooth(this.pwmLFO.depth.gain, value); break;
      case 'pwmLfoSpd': smooth(this.pwmLFO.osc.frequency, value); break;
      case 'cutLfoLvl': smooth(this.cutLFO.depth.gain, value); break;
      case 'cutLfoSpd': smooth(this.cutLFO.osc.frequency, value); break;
      case 'resLfoLvl': smooth(this.resLFO.depth.gain, value); break;
      case 'resLfoSpd': smooth(this.resLFO.osc.frequency, value); break;

      case 'dist':
        this.shaper.curve = makeDistCurve(value);
        smooth(this.distPre.gain, 1 + value * 2);
        smooth(this.distPost.gain, 1 / (1 + value));
        smooth(this.distDry.gain, 1 - value);   // crossfade: a 0 = todo seco (limpio, sin recorte)
        smooth(this.distWet.gain, value);
        break;
      case 'flAmt': smooth(this.flWet.gain, value); break;
      case 'flSpd': smooth(this.flLFO.osc.frequency, value); break;
      case 'dlyAmt': { const fb = Math.min(0.8, value * 0.85); smooth(this.dlWet.gain, value); smooth(this.ppFbL.gain, fb); smooth(this.ppFbR.gain, fb); break; }
      case 'dlyTime': smooth(this.dlyL.delayTime, value); smooth(this.dlyR.delayTime, value); break;
      case 'width': this._forVoices(v => v.setWidth(value)); break;
      case 'reverbMix': smooth(this.revWet.gain, value); break;
      case 'reverbSize':                                   // regenerar IR es costoso: lo aplazamos (debounce)
        clearTimeout(this._revTimer);
        this._revTimer = setTimeout(() => { try { this.convolver.buffer = makeIR(this.ctx, value, 2.5); } catch (e) {} }, 120);
        break;
      case 'master': smooth(this.master.gain, value); break;
      case 'mode': this.allNotesOff(); break;   // cambio poli<->mono: corta todo para no dejar notas colgadas
      // a, d, s, r, glide: se leen al crear cada voz (sin nodo en vivo)
    }
  }

  getAnalyser() { return this.analyser; }
}

export const engine = new AudioEngine();
