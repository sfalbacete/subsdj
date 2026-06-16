/* =====================================================================
   SubSDJ · pulse-processor (AudioWorklet)
   Oscilador band-limited (PolyBLEP). Tipos (processorOptions.type):
     sawtooth | square | sine | triangle | supersaw
   Params a-rate: frequency (Hz, glide), detune (cents, vibrato),
                  pulseWidth (0..1, PWM). spread (0..1, k-rate) = anchura del supersaw.
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
      { name: 'frequency', defaultValue: 440, minValue: 0,     maxValue: 20000, automationRate: 'a-rate' },
      { name: 'detune',    defaultValue: 0,   minValue: -4800, maxValue: 4800,  automationRate: 'a-rate' },
      { name: 'pulseWidth',defaultValue: 0.5, minValue: 0.01,  maxValue: 0.99,  automationRate: 'a-rate' },
      { name: 'spread',    defaultValue: 0.5, minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },
      { name: 'fmRatio',   defaultValue: 1,   minValue: 0,     maxValue: 12,    automationRate: 'k-rate' },
      { name: 'fmIndex',   defaultValue: 0,   minValue: 0,     maxValue: 12,    automationRate: 'a-rate' },
    ];
  }

  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.type = o.type || 'sawtooth';
    this.phase = (typeof o.phase === 'number') ? (o.phase % 1 + 1) % 1 : 0;
    // 7 fases aleatorias e independientes para el supersaw (evita el "peine" de fases alineadas)
    this.phases = new Float32Array(7);
    for (let i = 0; i < 7; i++) this.phases[i] = Math.random();
    this.modPhase = Math.random();        // fase del modulador FM (2-operadores, phase modulation)
    this.stopped = false;
    this.port.onmessage = (e) => { if (e.data === 'stop') this.stopped = true; };
  }

  process(inputs, outputs, params) {
    const out = outputs[0];
    if (!out || out.length === 0) return !this.stopped;
    const ch = out[0], n = ch.length;
    const fA = params.frequency, dA = params.detune, pA = params.pulseWidth, sA = params.spread;
    const mA = params.fmRatio, iA = params.fmIndex;
    const fConst = fA.length === 1, dConst = dA.length === 1, pConst = pA.length === 1, iConst = iA.length === 1;
    const sr = sampleRate, TWO_PI = Math.PI * 2, type = this.type;

    if (type === 'supersaw') {
      const spread = sA[0], phases = this.phases;
      for (let i = 0; i < n; i++) {
        const base = (fConst ? fA[0] : fA[i]) * Math.pow(2, (dConst ? dA[0] : dA[i]) / 1200);
        let sum = 0;
        for (let j = 0; j < 7; j++) {
          const f = base * (1 + SS_DETUNE[j] * spread * 0.25);   // hasta ~±47 cents en los extremos
          const dt = f / sr;
          let ph = phases[j];
          sum += 2 * ph - 1 - polyBlep(ph, dt);
          ph += dt; if (ph >= 1) ph -= 1;
          phases[j] = ph;
        }
        ch[i] = sum * 0.38;          // normaliza (~1/sqrt(7)) para igualar nivel con una sierra
      }
    } else {
      let phase = this.phase, modPhase = this.modPhase;
      const ratio = mA[0];
      for (let i = 0; i < n; i++) {
        const f = (fConst ? fA[0] : fA[i]) * Math.pow(2, (dConst ? dA[0] : dA[i]) / 1200);
        const dt = f / sr;
        let v;
        if (type === 'sine') {
          // FM = phase modulation (2-op estilo DX): modulador seno a freq*ratio. Limpio en seno.
          const index = iConst ? iA[0] : iA[i];
          const mod = index > 0 ? Math.sin(TWO_PI * modPhase) * index : 0;
          v = Math.sin(TWO_PI * (phase + mod));
          modPhase += (f * ratio) / sr;
          if (modPhase >= 1) modPhase -= Math.floor(modPhase);
        } else if (type === 'triangle') {
          v = 4 * Math.abs(phase - 0.5) - 1;            // armónicos impares suaves (1/n²)
        } else if (type === 'square') {
          let duty = pConst ? pA[0] : pA[i];
          if (duty < 0.01) duty = 0.01; else if (duty > 0.99) duty = 0.99;
          v = phase < duty ? 1 : -1;
          v += polyBlep(phase, dt);
          v -= polyBlep(fract(phase - duty), dt);
        } else {                                         // sawtooth
          v = 2 * phase - 1 - polyBlep(phase, dt);
        }
        ch[i] = v;
        phase += dt; if (phase >= 1) phase -= 1;
      }
      this.phase = phase; this.modPhase = modPhase;
    }

    for (let c = 1; c < out.length; c++) out[c].set(ch);
    return !this.stopped;
  }
}

registerProcessor('pulse-processor', PulseProcessor);
