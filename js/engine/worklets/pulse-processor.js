/* =====================================================================
   SubSDJ · pulse-processor (AudioWorklet)
   Oscilador band-limited (PolyBLEP). Tipos (processorOptions.type):
     sawtooth | square | sine | triangle | supersaw
   MULTI-OCTAVA: processorOptions.octaves (1..4) apila las octavas DENTRO
   del processor (antes: un AudioWorkletNode por octava). La suma sale sin
   normalizar; el bus de la voz aplica 1/octavas, como siempre.
   Params (todos k-rate: un valor por bloque de 128; el pow del detune se
   paga 1 vez por bloque, no por muestra — a 20 Hz de vibrato el escalón de
   2.9 ms es inaudible): frequency (Hz, glide), detune (cents, vibrato),
   drift (cents, deriva aleatoria lenta independiente por oscilador),
   pulseWidth (PWM), spread (supersaw), fmRatio/fmIndex (FM 2-op en seno).
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
      this.phases = new Float32Array(this.octaves).fill(ph);
      this.modPhases = new Float32Array(this.octaves);       // moduladores FM (fase aleatoria)
      for (let i = 0; i < this.octaves; i++) this.modPhases[i] = Math.random();
    }
    this.stopped = false;
    this.driftZ = 0;    // estado del paseo aleatorio de drift (independiente por oscilador)
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
      const ratio = params.fmRatio[0], index = params.fmIndex[0];
      for (let k = 0; k < oct; k++) {
        const f = f0 * (1 << k);
        if (f >= nyq) continue;
        const dt = f / sr, mdt = (f * ratio) / sr;
        let p = this.phases[k], mp = this.modPhases[k];
        if (index > 0) {
          for (let i = 0; i < N; i++) {
            ch[i] += Math.sin(TWO_PI * (p + Math.sin(TWO_PI * mp) * index));
            p += dt; if (p >= 1) p -= 1;
            mp += mdt; if (mp >= 1) mp -= Math.floor(mp);
          }
        } else {
          for (let i = 0; i < N; i++) {
            ch[i] += Math.sin(TWO_PI * p);
            p += dt; if (p >= 1) p -= 1;
          }
          mp = fract(mp + mdt * N);               // mantiene la fase del modulador coherente
        }
        this.phases[k] = p; this.modPhases[k] = mp;
      }
    } else if (type === 'triangle') {
      for (let k = 0; k < oct; k++) {
        const f = f0 * (1 << k);
        if (f >= nyq) continue;
        const dt = f / sr;
        let p = this.phases[k];
        for (let i = 0; i < N; i++) {
          ch[i] += 4 * Math.abs(p - 0.5) - 1;     // armónicos impares suaves (1/n²)
          p += dt; if (p >= 1) p -= 1;
        }
        this.phases[k] = p;
      }
    } else if (type === 'square') {
      let duty = params.pulseWidth[0];
      if (duty < 0.01) duty = 0.01; else if (duty > 0.99) duty = 0.99;
      for (let k = 0; k < oct; k++) {
        const f = f0 * (1 << k);
        if (f >= nyq) continue;
        const dt = f / sr;
        let p = this.phases[k];
        for (let i = 0; i < N; i++) {
          let v = p < duty ? 1 : -1;
          v += polyBlep(p, dt);
          v -= polyBlep(fract(p - duty), dt);
          ch[i] += v;
          p += dt; if (p >= 1) p -= 1;
        }
        this.phases[k] = p;
      }
    } else {                                      // sawtooth
      for (let k = 0; k < oct; k++) {
        const f = f0 * (1 << k);
        if (f >= nyq) continue;
        const dt = f / sr;
        let p = this.phases[k];
        for (let i = 0; i < N; i++) {
          ch[i] += 2 * p - 1 - polyBlep(p, dt);
          p += dt; if (p >= 1) p -= 1;
        }
        this.phases[k] = p;
      }
    }

    for (let c = 1; c < out.length; c++) out[c].set(ch);
    return !this.stopped;
  }
}

registerProcessor('pulse-processor', PulseProcessor);
