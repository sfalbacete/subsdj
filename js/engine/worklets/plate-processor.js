/* =====================================================================
   SubSDJ · plate-processor (AudioWorklet) — reverb de PLACA algorítmica.
   Topología de Dattorro («Effect Design Part 1», JAES 1997): el linaje del
   Lexicon 224. Por qué suena mejor que una IR de ruido: la densidad de ecos
   CRECE con el tiempo (cada allpass multiplica las reflexiones) y el tanque
   lleva modulación, que descorrela los modos y mata el «metal».
     entrada (mono) → paso-bajo de ancho de banda → 4 allpass de DIFUSIÓN en
     serie → TANQUE en figura de ocho: dos ramas cruzadas, cada una
       allpass MODULADO (difusión de decay 1) → delay → paso-bajo (damping)
       → ×decay → allpass (difusión de decay 2) → delay → ×decay → a la OTRA rama
     salida L/R = sumas de 7 «grifos» (taps) distintos de las líneas del
     tanque (Dattorro, tabla 2): estéreo descorrelado de un solo tanque.
   Longitudes en muestras a la frecuencia del diseño (29 761 Hz), escaladas
   a la del contexto. Sale 100 % wet: el nivel lo pone el envío (Sala.js).
   Params (k-rate): decay (0..1, la Sala lo deriva del Size; ≈1 = FREEZE: el
   tanque es un bucle de allpass y retardos, sin pérdidas a decay 1, así que
   la cola se queda sonando tal cual), damp (0..1, paso-bajo del tanque), mod
   (0..1, excursión de los allpass modulados).
   Si no entra nada y el tanque está vacío, no calcula (silencio barato).
   ===================================================================== */
const REF_SR = 29761;
const TWO_PI = Math.PI * 2;
const EXCURSION = 16;        // muestras (a REF_SR) de excursión máxima de los allpass modulados
const MOD_HZ_L = 1.0, MOD_HZ_R = 0.95;   // LFOs de la modulación (distintos: descorrela más)
const BANDWIDTH = 0.9995;    // paso-bajo de entrada (coeficiente de Dattorro: casi abierto)
const IN_DIFF = [[142, 0.75], [107, 0.75], [379, 0.625], [277, 0.625]];   // allpass de entrada [longitud, g]
const DECAY_DIFF1 = 0.70, DECAY_DIFF2 = 0.50;
const OUT_GAIN = 0.18;       // 0,6 en el artículo; −10,5 dB más para igualar la energía de la IR de ruido
                             // del modo «sala» (medido: a igual envío la placa salía 9-12 dB más caliente)

// Línea de retardo circular: read(d) devuelve la muestra escrita hace d escrituras.
class Line {
  constructor(n) { this.n = Math.max(2, n | 0); this.buf = new Float32Array(this.n); this.w = 0; }
  write(x) { this.buf[this.w] = x; if (++this.w === this.n) this.w = 0; }
  read(d) { let i = this.w - d; if (i < 0) i += this.n; if (i < 0) i = 0; return this.buf[i]; }
  readFrac(d) { const i = Math.floor(d), f = d - i; return this.read(i) * (1 - f) + this.read(i + 1) * f; }
}
// Allpass de Schroeder sobre una línea: v = x + g·z ; y = z − g·v
class Allpass {
  constructor(len, g) { this.line = new Line(len + 2); this.len = len; this.g = g; }
  process(x, len = this.len) {
    const z = len === this.len ? this.line.read(this.len) : this.line.readFrac(len);
    const v = x + this.g * z;
    this.line.write(v);
    return z - this.g * v;
  }
}

class PlateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'decay', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },   // 1 = freeze (Sala.FREEZE_DECAY se queda un pelo por debajo)
      { name: 'damp',  defaultValue: 0.3, minValue: 0, maxValue: 1,    automationRate: 'k-rate' },
      { name: 'mod',   defaultValue: 0.5, minValue: 0, maxValue: 1,    automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    const k = sampleRate / REF_SR, S = n => Math.round(n * k);
    this.k = k;
    this.bw = 0;                                            // estado del paso-bajo de entrada
    this.inDiff = IN_DIFF.map(([len, g]) => new Allpass(S(len), g));
    // tanque: rama izquierda y derecha (nombres de las líneas según los nodos del artículo)
    this.apL1 = new Allpass(S(672) + S(EXCURSION) * 2, DECAY_DIFF1); this.apL1.base = S(672);
    this.dL1 = new Line(S(4453) + 1);
    this.apL2 = new Allpass(S(1800), DECAY_DIFF2);
    this.dL2 = new Line(S(3720) + 1);
    this.apR1 = new Allpass(S(908) + S(EXCURSION) * 2, DECAY_DIFF1); this.apR1.base = S(908);
    this.dR1 = new Line(S(4217) + 1);
    this.apR2 = new Allpass(S(2656), DECAY_DIFF2);
    this.dR2 = new Line(S(3163) + 1);
    this.lpL = 0; this.lpR = 0;                             // estados del damping
    this.fbL = 0; this.fbR = 0;                             // lo que cada rama manda a la otra
    this.phL = 0; this.phR = 0;                             // fases de los LFOs de modulación
    // grifos de salida (tabla 2 del artículo), ya escalados
    this.taps = {
      L: [[this.dR1, S(266)], [this.dR1, S(2974)], [this.apR2.line, S(1913), -1], [this.dR2, S(1996)],
          [this.dL1, S(1990), -1], [this.apL2.line, S(187), -1], [this.dL2, S(1066), -1]],
      R: [[this.dL1, S(353)], [this.dL1, S(3627)], [this.apL2.line, S(1228), -1], [this.dL2, S(2673)],
          [this.dR1, S(2111), -1], [this.apR2.line, S(335), -1], [this.dR2, S(121), -1]],
    };
    // Reposo: sin entrada y sin salida durante MÁS de un recorrido completo del
    // tanque (la señal puede estar viajando por una línea de 6000 muestras sin
    // haber llegado aún a ningún grifo) ⇒ el tanque está vacío de verdad.
    this.quiet = 0;                                         // bloques seguidos sin entrada ni salida
    this.idleLimit = Math.ceil((S(4453) + S(3720) + S(672) + S(1800) + 2 * S(EXCURSION)) / 128) + 16;
    this.stopped = false;
    this.port.onmessage = e => { if (e.data === 'stop') this.stopped = true; };
  }

  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!out || !out.length) return !this.stopped;
    const L = out[0], R = out[1] || out[0], N = L.length;
    const inL = inp && inp[0], inR = inp && inp[1];
    // ¿hay algo que hacer? Sin entrada y con el tanque agotado, silencio directo.
    let energy = 0;
    if (inL) for (let i = 0; i < N; i++) energy += inL[i] * inL[i];
    if (energy < 1e-12 && this.quiet > this.idleLimit) { L.fill(0); if (R !== L) R.fill(0); return !this.stopped; }
    const decay = params.decay[0], damp = params.damp[0] * 0.85, exc = params.mod[0] * EXCURSION * this.k;
    const dphL = TWO_PI * MOD_HZ_L / sampleRate, dphR = TWO_PI * MOD_HZ_R / sampleRate;
    const tapsL = this.taps.L, tapsR = this.taps.R;
    let outEnergy = 0;
    for (let i = 0; i < N; i++) {
      // entrada mono → ancho de banda → difusión
      let x = inL ? (inR ? 0.5 * (inL[i] + inR[i]) : inL[i]) : 0;
      this.bw = BANDWIDTH * x + (1 - BANDWIDTH) * this.bw; x = this.bw;
      for (const ap of this.inDiff) x = ap.process(x);
      // tanque: cada rama recibe la difusión + lo que le manda la otra
      this.phL += dphL; if (this.phL > TWO_PI) this.phL -= TWO_PI;
      this.phR += dphR; if (this.phR > TWO_PI) this.phR -= TWO_PI;
      let a = this.apL1.process(x + this.fbR, this.apL1.base + exc * Math.sin(this.phL));
      let d = this.dL1.read(this.dL1.n - 1); this.dL1.write(a);
      this.lpL = (1 - damp) * d + damp * this.lpL;
      a = this.apL2.process(this.lpL * decay);
      d = this.dL2.read(this.dL2.n - 1); this.dL2.write(a);
      const newFbL = d * decay;
      a = this.apR1.process(x + this.fbL, this.apR1.base + exc * Math.sin(this.phR));
      d = this.dR1.read(this.dR1.n - 1); this.dR1.write(a);
      this.lpR = (1 - damp) * d + damp * this.lpR;
      a = this.apR2.process(this.lpR * decay);
      d = this.dR2.read(this.dR2.n - 1); this.dR2.write(a);
      this.fbR = d * decay; this.fbL = newFbL;
      // salidas: 7 grifos por canal
      let yl = 0, yr = 0;
      for (const t of tapsL) yl += (t[2] || 1) * t[0].read(t[1]);
      for (const t of tapsR) yr += (t[2] || 1) * t[0].read(t[1]);
      L[i] = yl * OUT_GAIN; if (R !== L) R[i] = yr * OUT_GAIN;
      outEnergy += yl * yl;
    }
    this.quiet = (energy < 1e-12 && outEnergy < 1e-12) ? this.quiet + 1 : 0;
    return !this.stopped;
  }
}

registerProcessor('plate-processor', PlateProcessor);
