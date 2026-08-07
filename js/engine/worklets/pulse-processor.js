/* =====================================================================
   SubSDJ · pulse-processor (AudioWorklet)
   Oscilador band-limited (PolyBLEP). Tipos (processorOptions.type):
     sawtooth | square | sine | triangle | supersaw | tabla
   TABLA (wavetable): processorOptions.wt = { lens, frames } (mips generados
   en el hilo principal, engine/wavetable.js). Lookup con interpolación
   lineal de fase + morph lineal entre frames adyacentes (param wtPos);
   el nivel (mip) se elige por frecuencia: la tabla leída no tiene parciales
   sobre Nyquist (el equivalente tabulado del PolyBLEP). Ignora pulseWidth,
   spread y FM; unison/octavas/drift funcionan igual que en el resto.
   MULTI-OCTAVA: processorOptions.octaves (1..4) apila las octavas DENTRO
   del processor (antes: un AudioWorkletNode por octava). La suma sale sin
   normalizar; el bus de la voz aplica 1/octavas, como siempre.
   Params (todos k-rate: un valor por bloque de 128; el pow del detune se
   paga 1 vez por bloque, no por muestra — a 20 Hz de vibrato el escalón de
   2.9 ms es inaudible): frequency (Hz, glide), detune (cents, vibrato),
   drift (cents, deriva aleatoria lenta independiente por oscilador),
   pulseWidth (PWM), spread (supersaw), fmRatio/fmIndex (FM 2-op en seno),
   uniVoices/uniDetune (UNISON generalizado: 1..7 copias detunadas para
   cualquier onda salvo supersaw, que ya es unison; nivel 1/sqrt(N); la
   copia 0 conserva la fase configurada -> con N=1 es bit-idéntico al
   oscilador simple; las demás copias arrancan con fase aleatoria).
   Salida mono. Se autodestruye al recibir el mensaje "stop".
   ===================================================================== */

function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
function fract(x) { return x - Math.floor(x); }

// Offsets de detune del Super Saw (curva del JP-8000, según el análisis de Adam Szabo).
const SS_DETUNE = [-0.11002313, -0.06288439, -0.01952356, 0, 0.01952356, 0.06288439, 0.11002313];

class PulseProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 440, minValue: 0,     maxValue: 20000, automationRate: 'k-rate' },
      { name: 'detune',    defaultValue: 0,   minValue: -4800, maxValue: 4800,  automationRate: 'k-rate' },
      { name: 'drift',     defaultValue: 0,   minValue: 0,     maxValue: 25,    automationRate: 'k-rate' },
      { name: 'pulseWidth',defaultValue: 0.5, minValue: 0.01,  maxValue: 0.99,  automationRate: 'k-rate' },
      { name: 'spread',    defaultValue: 0.5, minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },
      { name: 'fmRatio',   defaultValue: 1,   minValue: 0,     maxValue: 12,    automationRate: 'k-rate' },
      { name: 'fmIndex',   defaultValue: 0,   minValue: 0,     maxValue: 12,    automationRate: 'k-rate' },
      { name: 'uniVoices', defaultValue: 1,   minValue: 1,     maxValue: 7,     automationRate: 'k-rate' },
      { name: 'uniDetune', defaultValue: 0,   minValue: 0,     maxValue: 50,    automationRate: 'k-rate' },
      { name: 'wtPos',     defaultValue: 0,   minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.type = o.type || 'sawtooth';
    this.octaves = Math.max(1, Math.min(4, (o.octaves | 0) || 1));
    const ph = (typeof o.phase === 'number') ? (o.phase % 1 + 1) % 1 : 0;
    if (this.type === 'supersaw') {
      // 7 fases aleatorias e independientes POR OCTAVA (evita el "peine" de fases alineadas)
      this.phases = new Float32Array(this.octaves * 7);
      for (let i = 0; i < this.phases.length; i++) this.phases[i] = Math.random();
    } else {
      // 7 slots por octava para el unison generalizado (idx = oct*7 + copia):
      // la copia 0 lleva la fase configurada (con uniVoices=1 todo es como antes),
      // el resto aleatoria. modPhases = moduladores FM (siempre aleatorios).
      this.phases = new Float32Array(this.octaves * 7);
      this.modPhases = new Float32Array(this.octaves * 7);
      for (let i = 0; i < this.phases.length; i++) {
        this.phases[i] = (i % 7 === 0) ? ph : Math.random();
        this.modPhases[i] = Math.random();
      }
    }
    this.stopped = false;
    this.driftZ = 0;    // estado del paseo aleatorio de drift (independiente por oscilador)
    this.wt = (this.type === 'tabla' && o.wt && o.wt.frames) ? o.wt : null;
    this.port.onmessage = (e) => { if (e.data === 'stop') this.stopped = true; };
  }

  process(inputs, outputs, params) {
    const out = outputs[0];
    if (!out || out.length === 0) return !this.stopped;
    const ch = out[0], N = ch.length;             // el buffer llega a cero: acumulamos con +=
    const sr = sampleRate, TWO_PI = Math.PI * 2;
    const type = this.type, oct = this.octaves, nyq = sr * 0.45;
    // Drift analógico: paseo aleatorio con retorno al centro (OU discreto, un paso
    // por bloque). Con a=0.998 la constante de tiempo es ~500 bloques (~1.3 s) y la
    // desviación típica de z es ~1, así que el knob (cents) ES la excursión típica.
    let driftCt = 0;
    const dAmt = params.drift[0];
    if (dAmt > 0) {
      this.driftZ = this.driftZ * 0.998 + (Math.random() * 2 - 1) * 0.0632;
      const z = this.driftZ < -2.5 ? -2.5 : (this.driftZ > 2.5 ? 2.5 : this.driftZ);
      driftCt = z * dAmt;
    }
    const f0 = params.frequency[0] * Math.pow(2, (params.detune[0] + driftCt) / 1200);

    // Unison generalizado (no aplica al supersaw, que ya es unison de 7 sierras).
    // Copias repartidas linealmente en ±uniDetune cents; nivel 1/sqrt(N).
    let uv = params.uniVoices[0] | 0; if (uv < 1) uv = 1; else if (uv > 7) uv = 7;
    const uniCt = params.uniDetune[0], lvl = 1 / Math.sqrt(uv);
    const uniMul = j => (uv < 2 || uniCt <= 0) ? 1
      : Math.pow(2, ((2 * j / (uv - 1) - 1) * uniCt) / 1200);

    if (type === 'supersaw') {
      const spread = params.spread[0], phases = this.phases;
      for (let k = 0; k < oct; k++) {
        const base = f0 * (1 << k);
        if (base >= nyq) continue;                // octava sobre Nyquist: silencio, no alias
        for (let j = 0; j < 7; j++) {
          const f = base * (1 + SS_DETUNE[j] * spread * 0.25);   // hasta ~±47 cents en los extremos
          const dt = f / sr, idx = k * 7 + j;
          let p = phases[idx];
          for (let i = 0; i < N; i++) {
            ch[i] += (2 * p - 1 - polyBlep(p, dt)) * 0.38;       // ~1/sqrt(7): nivel de una sierra
            p += dt; if (p >= 1) p -= 1;
          }
          phases[idx] = p;
        }
      }
    } else if (type === 'sine') {
      // FM = phase modulation (2-op estilo DX): modulador seno a freq*ratio. Limpio en seno.
      // Con unison, cada copia lleva su propio par portadora/modulador.
      const ratio = params.fmRatio[0], index = params.fmIndex[0];
      for (let k = 0; k < oct; k++) {
        const base = f0 * (1 << k);
        if (base >= nyq) continue;
        for (let j = 0; j < uv; j++) {
          const f = base * uniMul(j);
          const dt = f / sr, mdt = (f * ratio) / sr, idx = k * 7 + j;
          let p = this.phases[idx], mp = this.modPhases[idx];
          if (index > 0) {
            for (let i = 0; i < N; i++) {
              ch[i] += Math.sin(TWO_PI * (p + Math.sin(TWO_PI * mp) * index)) * lvl;
              p += dt; if (p >= 1) p -= 1;
              mp += mdt; if (mp >= 1) mp -= Math.floor(mp);
            }
          } else {
            for (let i = 0; i < N; i++) {
              ch[i] += Math.sin(TWO_PI * p) * lvl;
              p += dt; if (p >= 1) p -= 1;
            }
            mp = fract(mp + mdt * N);             // mantiene la fase del modulador coherente
          }
          this.phases[idx] = p; this.modPhases[idx] = mp;
        }
      }
    } else if (type === 'tabla') {
      const wt = this.wt;
      if (!wt) return !this.stopped;                // sin tablas: silencio (payload ausente)
      const F = wt.frames.length, h0 = wt.h0 || 512, LMAX = wt.frames[0].length - 1;
      // posición de morph -> par de frames adyacentes + peso
      let pos = params.wtPos[0]; if (pos < 0) pos = 0; else if (pos > 1) pos = 1;
      const x = pos * (F - 1), fA = F > 1 ? Math.min(F - 2, x | 0) : 0, ff = F > 1 ? x - fA : 0;
      const fB = fA + 1 < F ? fA + 1 : fA;
      for (let k = 0; k < oct; k++) {
        const base = f0 * (1 << k);
        if (base >= nyq) continue;
        for (let j = 0; j < uv; j++) {
          const f = base * uniMul(j);
          // nivel (mip): el mayor nº de armónicos que cabe bajo Nyquist a esta
          // frecuencia. Los caps van en h0 >> L => L = los "doblados" que sobran.
          const allowed = nyq / f;
          let L = 0; while ((h0 >> L) > allowed && L < LMAX) L++;
          const dA = wt.frames[fA][L], dB = wt.frames[fB][L], len = dA.length;
          const dt = f / sr, idx = k * 7 + j;
          let p = this.phases[idx];
          for (let i = 0; i < N; i++) {
            const xx = p * len, i0 = xx | 0, w = xx - i0, i1 = i0 + 1 === len ? 0 : i0 + 1;
            const vA = dA[i0] + (dA[i1] - dA[i0]) * w;
            const vB = dB[i0] + (dB[i1] - dB[i0]) * w;
            ch[i] += (vA + (vB - vA) * ff) * lvl;
            p += dt; if (p >= 1) p -= 1;
          }
          this.phases[idx] = p;
        }
      }
    } else if (type === 'triangle') {
      for (let k = 0; k < oct; k++) {
        const base = f0 * (1 << k);
        if (base >= nyq) continue;
        for (let j = 0; j < uv; j++) {
          const dt = base * uniMul(j) / sr, idx = k * 7 + j;
          let p = this.phases[idx];
          for (let i = 0; i < N; i++) {
            ch[i] += (4 * Math.abs(p - 0.5) - 1) * lvl;   // armónicos impares suaves (1/n²)
            p += dt; if (p >= 1) p -= 1;
          }
          this.phases[idx] = p;
        }
      }
    } else if (type === 'square') {
      let duty = params.pulseWidth[0];
      if (duty < 0.01) duty = 0.01; else if (duty > 0.99) duty = 0.99;
      for (let k = 0; k < oct; k++) {
        const base = f0 * (1 << k);
        if (base >= nyq) continue;
        for (let j = 0; j < uv; j++) {
          const dt = base * uniMul(j) / sr, idx = k * 7 + j;
          let p = this.phases[idx];
          for (let i = 0; i < N; i++) {
            let v = p < duty ? 1 : -1;
            v += polyBlep(p, dt);
            v -= polyBlep(fract(p - duty), dt);
            ch[i] += v * lvl;
            p += dt; if (p >= 1) p -= 1;
          }
          this.phases[idx] = p;
        }
      }
    } else {                                      // sawtooth
      for (let k = 0; k < oct; k++) {
        const base = f0 * (1 << k);
        if (base >= nyq) continue;
        for (let j = 0; j < uv; j++) {
          const dt = base * uniMul(j) / sr, idx = k * 7 + j;
          let p = this.phases[idx];
          for (let i = 0; i < N; i++) {
            ch[i] += (2 * p - 1 - polyBlep(p, dt)) * lvl;
            p += dt; if (p >= 1) p -= 1;
          }
          this.phases[idx] = p;
        }
      }
    }

    for (let c = 1; c < out.length; c++) out[c].set(ch);
    return !this.stopped;
  }
}

registerProcessor('pulse-processor', PulseProcessor);
