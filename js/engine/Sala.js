/* =====================================================================
   SubSDJ · Sala — el ESPACIO: delay ping-pong «de cinta», reverb por
   convolución (IR generada por código), limitador, máster y analizador.
   Modelo de ENVÍOS (send/return), como los multitímbricos de los 90: cada
   motor le manda su señal seca (la mezcla) y dos envíos — cuánto de él va
   al delay y cuánto a la reverb. La sala es UNA: tamaño, damp, tiempo del
   eco, BPM… Cuatro músicos en una sala: cada uno decide a qué distancia
   del micro se pone; ninguno decide el tamaño de la sala.
     · modo de siempre: cada AudioEngine crea la suya y suena como siempre
       (envío con retorno a 1 ≡ el wet de antes, por linealidad; los ecos
       entran en la reverb por `dlyToRev` = reverbMix, como antes).
     · modo Partes (engine/parts.js): UNA Sala compartida por las partes.
   SALA_KEYS = claves de PARAMS que son de la sala, no del instrumento: en
   modo Partes el rack las edita para todas las partes a la vez y los
   presets no las tocan (registry.loadState las salta). `engines` = motores
   enganchados: set() mantiene su S en sincronía (Arp/Seq/WaveSeq leen el
   S.bpm de su propio motor: un solo reloj para la escena).
   ===================================================================== */
import { makeIR, mkLFO } from './nodes.js';

export const SALA_KEYS = new Set(['bpm', 'dlyTime', 'dlySync', 'dlyDamp', 'dlyWow',
                                  'reverbSize', 'reverbDamp', 'reverbPre', 'reverbType']);

// Placa (worklets/plate-processor.js, Dattorro): el Size del knob es un RT60 en
// segundos. Tabla MEDIDA (impulso en Node, pendiente de la cola entre 0,5 y
// 1,5 s, damp 0): RT60 1,17 s ↔ decay 0,3 · 1,84 ↔ 0,5 (el del artículo) ·
// 2,38 ↔ 0,6 · 3,22 ↔ 0,7 · 4,72 ↔ 0,8 · 8,25 ↔ 0,9. Interpolación lineal
// entre puntos; por debajo del primero, la fórmula 10^(−0,61/RT).
const PLATE_RT = [[1.17, 0.3], [1.84, 0.5], [2.38, 0.6], [3.22, 0.7], [4.72, 0.8], [8.25, 0.9]];
function plateDecay(size) {
  if (size <= PLATE_RT[0][0]) return Math.pow(10, -0.611 / Math.max(0.2, size));
  for (let i = 1; i < PLATE_RT.length; i++) {
    const [s0, d0] = PLATE_RT[i - 1], [s1, d1] = PLATE_RT[i];
    if (size <= s1) return d0 + (d1 - d0) * (size - s0) / (s1 - s0);
  }
  return 0.9;
}
const PLATE_MOD = 0.5;   // excursión de los allpass modulados (0..1): descorrela los modos sin marear

// Delay «de cinta»: filtros DENTRO del bucle del ping-pong y wow del tiempo.
// Damp recorre en log el LP de Nyquist a DLY_DAMP_LP_MIN y el HP de 0 Hz a
// DLY_DAMP_HP_MAX (cinta/BBD: cada vuelta pierde agudos y algo de graves).
// Wow = dos LFOs lentos a velocidades distintas L/R sobre delayTime; a tope
// ±DLY_WOW_DEPTH s => desvío de pitch ≈ 2π·f·d ≈ ±1 % (unos 17 ct) por repetición.
const DLY_DAMP_LP_MIN = 1200;                        // Hz: LP del bucle a Damp 1
const DLY_DAMP_HP_MIN = 20, DLY_DAMP_HP_MAX = 200;   // Hz: HP del bucle (Damp 0+ … Damp 1)
const DLY_WOW_HZ = 0.6, DLY_WOW_DEPTH = 0.0025;      // s: ±2,5 ms a Wow 1

export class Sala {
  // S: estado con las SALA_KEYS (modo único: el S del propio motor; modo
  // Partes: el estado de la escena). fb = realimentación del delay (modo
  // único: sigue al knob Amount, como siempre; Partes: knob de la sala).
  // dlyToRev = cuánto eco entra en la reverb (modo único = reverbMix).
  constructor(ctx, S, { fb = 0.45, dlyToRev = 0.5, master = 0.7, dest = ctx.destination } = {}) {
    this.ctx = ctx; this.S = S;
    this.engines = [];                               // motores cuyo S se mantiene en sincronía

    // --- Entradas ---
    this.dry = ctx.createGain();                     // mezcla seca de los motores
    this.dlyIn = ctx.createGain();                   // envío al delay: suma a mono (el ping-pong parte del centro)
    this.dlyIn.channelCount = 1; this.dlyIn.channelCountMode = 'explicit';
    this.revIn = ctx.createGain();                   // envío a la reverb (estéreo)
    this.sum = ctx.createGain();                     // seco + retornos

    // --- Delay ping-pong (estéreo): los ecos rebotan L<->R ---
    this.dlyL = ctx.createDelay(2.0); this.dlyL.delayTime.value = this._effDelay();
    this.dlyR = ctx.createDelay(2.0); this.dlyR.delayTime.value = this._effDelay();
    this.ppFbL = ctx.createGain(); this.ppFbR = ctx.createGain();
    this.ppFbL.gain.value = this.ppFbR.gain.value = fb;
    this.ppMerge = ctx.createChannelMerger(2);
    this.dlRet = ctx.createGain();                   // retorno a 1: el nivel lo pone el ENVÍO de cada parte
    // «Cinta»: LP+HP Butterworth (Q en dB: −3 = plano) a la ENTRADA de cada
    // línea — así la 1ª repetición ya pasa una vez por el filtro, la 2ª dos…
    // como el eco de cinta/BBD, que oscurece cada vuelta. A Damp 0 el LP se
    // pone en Nyquist y el HP en 0 Hz: el biquad de WebAudio los reduce a la
    // IDENTIDAD exacta (coeficientes unidad), los presets de siempre no cambian.
    const dampF = this._dampFreqs(S.dlyDamp);
    const mkDamp = () => {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';  lp.Q.value = -3; lp.frequency.value = dampF.lp;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.Q.value = -3; hp.frequency.value = dampF.hp;
      lp.connect(hp); return { lp, hp };
    };
    this.dampL = mkDamp(); this.dampR = mkDamp();
    // wow: dos LFOs lentos a velocidades distintas L/R (descorrelados: cada
    // rebote del ping-pong se desafina distinto y el eco se ensancha)
    this.wowL = mkLFO(ctx, DLY_WOW_HZ, S.dlyWow * DLY_WOW_DEPTH);        this.wowL.depth.connect(this.dlyL.delayTime);
    this.wowR = mkLFO(ctx, DLY_WOW_HZ * 1.13, S.dlyWow * DLY_WOW_DEPTH); this.wowR.depth.connect(this.dlyR.delayTime);

    // --- Reverb por convolución (IR generada). DOS convolvers en A/B: la IR
    // nueva entra por el que está apagado y se cruza en ~50 ms, sin cortar en
    // seco la cola de la anterior. Predelay: DelayNode antes de los convolvers
    // (separa el ataque de la cola). ---
    this.revPre = ctx.createDelay(0.1); this.revPre.delayTime.value = S.reverbPre;
    this.convA = ctx.createConvolver(); this.convA.buffer = makeIR(ctx, S.reverbSize, 2.5, S.reverbDamp);
    this.convB = ctx.createConvolver();
    this.revXA = ctx.createGain(); this.revXA.gain.value = 1;
    this.revXB = ctx.createGain(); this.revXB.gain.value = 0;
    this._revFront = 'A'; this._irStale = false;
    // Dos reverbs a elegir (reverbType): «sala» = convolución con la IR de
    // ruido; «placa» = algorítmica (worklet Dattorro, se crea al elegirla).
    // Crossfade entre ambas; solo la activa recibe entrada (la otra no gasta).
    this.irMix = ctx.createGain(); this.irMix.gain.value = S.reverbType === 'placa' ? 0 : 1;
    this.plateMix = ctx.createGain(); this.plateMix.gain.value = S.reverbType === 'placa' ? 1 : 0;
    this.plate = null;
    this.revRet = ctx.createGain();                  // retorno a 1 (idem: el nivel lo pone el envío)
    this.dlyToRev = ctx.createGain(); this.dlyToRev.gain.value = dlyToRev;   // eco → reverb (los ecos viven en la sala)

    // --- Limitador de salida -> máster -> analizador ---
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -3; this.comp.knee.value = 0; this.comp.ratio.value = 20;
    this.comp.attack.value = 0.002; this.comp.release.value = 0.1;
    this.master = ctx.createGain(); this.master.gain.value = master;
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0.8;

    // --- Conexiones ---
    this.dry.connect(this.sum);
    this.dlyIn.connect(this.dampL.lp);                                        // envío mono -> filtro de cinta -> línea L
    this.dampL.hp.connect(this.dlyL); this.dampR.hp.connect(this.dlyR);
    this.dlyL.connect(this.ppMerge, 0, 0);                                    // dlyL -> canal izquierdo
    this.dlyR.connect(this.ppMerge, 0, 1);                                    // dlyR -> canal derecho
    this.dlyL.connect(this.ppFbL); this.ppFbL.connect(this.dampR.lp);         // realimentación cruzada L->R (filtrada otra vez)
    this.dlyR.connect(this.ppFbR); this.ppFbR.connect(this.dampL.lp);         // realimentación cruzada R->L
    this.ppMerge.connect(this.dlRet); this.dlRet.connect(this.sum);
    this.dlRet.connect(this.dlyToRev); this.dlyToRev.connect(this.revIn);     // los ecos también reverberan
    this.revIn.connect(this.revPre);
    this.convA.connect(this.revXA); this.revXA.connect(this.irMix);          // (convB no recibe entrada hasta el primer cambio de Size/Damp)
    this.convB.connect(this.revXB); this.revXB.connect(this.irMix);
    this.irMix.connect(this.revRet); this.plateMix.connect(this.revRet);
    if (S.reverbType === 'placa') { this._ensurePlate(); this.revPre.connect(this.plate); }
    else this.revPre.connect(this.convA);
    this.revRet.connect(this.sum);
    this.sum.connect(this.comp); this.comp.connect(this.master);
    this.master.connect(this.analyser); this.analyser.connect(dest);
  }

  // Claves de la sala (SALA_KEYS): actualiza el estado de TODOS los motores
  // enganchados (un solo BPM, una sola sala) y aplica al grafo.
  set(name, value) {
    this.S[name] = value;
    for (const e of this.engines) e.S[name] = value;
    const now = this.ctx.currentTime, smooth = (p, v) => p.setTargetAtTime(v, now, 0.02);
    switch (name) {
      case 'dlyDamp': { const f = this._dampFreqs(value);
        [this.dampL, this.dampR].forEach(d => { smooth(d.lp.frequency, f.lp); smooth(d.hp.frequency, f.hp); }); break; }
      case 'dlyWow': smooth(this.wowL.depth.gain, value * DLY_WOW_DEPTH); smooth(this.wowR.depth.gain, value * DLY_WOW_DEPTH); break;
      case 'dlyTime':                                      // con sync activo manda el bpm, no el knob
      case 'dlySync':
      case 'bpm': { const tt = this._effDelay(); smooth(this.dlyL.delayTime, tt); smooth(this.dlyR.delayTime, tt); break; }
      case 'reverbPre': smooth(this.revPre.delayTime, value); break;
      case 'reverbSize':                                   // regenerar IR es costoso: lo aplazamos (debounce)
      case 'reverbDamp':                                   // (el damp vive en la IR: misma ruta)
        this._plateParams();                               // la placa cambia al instante (son dos params)
        if (this.S.reverbType === 'placa') { this._irStale = true; break; }   // la IR se rehará al volver a «sala»
        clearTimeout(this._revTimer);
        this._revTimer = setTimeout(() => this._swapIR(this.S.reverbSize), 120);
        break;
      case 'reverbType': this._setType(value); break;
    }
  }

  // ---------- placa ----------
  _ensurePlate() {
    if (this.plate) return this.plate;
    this.plate = new AudioWorkletNode(this.ctx, 'plate-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    this.plate.connect(this.plateMix);
    this._plateParams(true);
    return this.plate;
  }
  _plateParams(now = false) {
    if (!this.plate) return;
    const t = this.ctx.currentTime, p = this.plate.parameters;
    const put = (name, v) => { const ap = p.get(name); if (!ap) return; if (now) ap.value = v; else ap.setTargetAtTime(v, t, 0.05); };
    put('decay', plateDecay(this.S.reverbSize)); put('damp', this.S.reverbDamp); put('mod', PLATE_MOD);
  }
  _front() { return this._revFront === 'A' ? this.convA : this.convB; }
  // Cambio de reverb con fundido de 50 ms; la entrada de la que se apaga se
  // desconecta al acabar (un convolver o un worklet con entrada gastan CPU).
  _setType(type) {
    const placa = type === 'placa', t = this.ctx.currentTime;
    if (placa) { this._ensurePlate(); this.revPre.connect(this.plate); }
    else if (this._irStale) { this._irStale = false; clearTimeout(this._revTimer); this._swapIR(this.S.reverbSize); }
    else this.revPre.connect(this._front());
    this.irMix.gain.setTargetAtTime(placa ? 0 : 1, t, 0.05);
    this.plateMix.gain.setTargetAtTime(placa ? 1 : 0, t, 0.05);
    clearTimeout(this._typeTimer);
    this._typeTimer = setTimeout(() => {
      const off = placa ? [this.convA, this.convB] : [this.plate];
      for (const n of off) { try { if (n) this.revPre.disconnect(n); } catch (e) {} }
    }, 400);
  }
  setFeedback(fb) { const t = this.ctx.currentTime; this.ppFbL.gain.setTargetAtTime(fb, t, 0.02); this.ppFbR.gain.setTargetAtTime(fb, t, 0.02); }
  setDlyToRev(v)  { this.dlyToRev.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02); }
  setMaster(v)    { this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02); }

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

  // Damp 0..1 -> cortes del filtro del bucle (recorrido log): LP de Nyquist a
  // DLY_DAMP_LP_MIN, HP de DLY_DAMP_HP_MIN a DLY_DAMP_HP_MAX. A 0 exactamente
  // Nyquist / 0 Hz (identidad en el biquad), por eso la rama aparte.
  _dampFreqs(d) {
    const nyq = this.ctx.sampleRate / 2;
    if (!(d > 0)) return { lp: nyq, hp: 0 };
    return { lp: nyq * Math.pow(DLY_DAMP_LP_MIN / nyq, d),
             hp: DLY_DAMP_HP_MIN * Math.pow(DLY_DAMP_HP_MAX / DLY_DAMP_HP_MIN, d) };
  }

  // Tiempo efectivo del delay: libre (knob Time) o división musical del BPM
  _effDelay() {
    const div = { '1/8': 0.5, '1/8.': 0.75, '1/4': 1, '1/4.': 1.5, '1/2': 2 }[this.S.dlySync];
    return div ? Math.min(1.5, (60 / this.S.bpm) * div) : this.S.dlyTime;
  }

  // Desmontaje (al apagar la escena): para los LFOs del wow y rompe el bucle
  // de realimentación; sin fuentes vivas, el grafo se libera solo.
  dispose() {
    clearTimeout(this._revTimer); clearTimeout(this._revOffTimer); clearTimeout(this._typeTimer);
    for (const l of [this.wowL, this.wowR]) { try { l.osc.stop(); l.osc.disconnect(); } catch (e) {} }
    if (this.plate) { try { this.plate.port.postMessage('stop'); this.plate.disconnect(); } catch (e) {} }
    for (const n of [this.dry, this.dlyIn, this.revIn, this.sum, this.dlyL, this.dlyR, this.ppFbL, this.ppFbR,
                     this.ppMerge, this.dlRet, this.dlyToRev, this.revPre, this.convA, this.convB, this.irMix, this.plateMix,
                     this.revRet, this.comp, this.master, this.analyser]) { try { n.disconnect(); } catch (e) {} }
  }
}
