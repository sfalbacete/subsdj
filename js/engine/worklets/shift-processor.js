/* =====================================================================
   SubSDJ · shift-processor (AudioWorklet) — desplazador de tono GRANULAR para
   el shimmer de la Sala (Roadmap 5.0 · bloque 3).
   La idea (Eno/Lanois 1983, Eventide H3000): dentro de la realimentación de
   la reverb, lo que vuelve a entrar sube una octava en cada vuelta → la cola
   se convierte en un coro que asciende. Aquí vive solo el desplazador; el
   bucle (HP → LP → esto → ganancia → entrada de la reverb) está en Sala.js.
   Cómo: una línea de retardo y DOS cabezas de lectura cuyo retardo baja en
   rampa (dientes de sierra) de W a 0. Leer «acercándose» a la escritura es
   leer más deprisa: el tono sube por el factor r = 2^(st/12). Al llegar a 0
   la cabeza salta de vuelta a W; para que el salto no se oiga, cada cabeza
   lleva una ventana seno (0 en el salto, 1 en medio) y las dos van a media
   vuelta: sen² + cos² = 1, potencia constante. El periodo de la rampa es
   W/(r−1): a +12 st con W = 100 ms salen 10 granos por segundo (el leve
   «trémolo» de 10 Hz de todo shimmer clásico; dentro de la reverb se
   disuelve). Hacia abajo (st < 0) la rampa sube de 0 a W: lee más despacio.
   Estéreo: las mismas cabezas para L y R (la imagen no se mueve).
   ===================================================================== */
const WINDOW = 0.1;      // s: longitud del grano (más largo = menos trémolo, más borroso)
const BUF_SECS = 0.5;    // s: línea de retardo (sobra: una cabeza nunca pasa de WINDOW)

class ShiftProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'semitones', defaultValue: 12, minValue: -24, maxValue: 24, automationRate: 'k-rate' }];
  }
  constructor() {
    super();
    this.n = Math.ceil(sampleRate * BUF_SECS);
    this.buf = [new Float32Array(this.n), new Float32Array(this.n)];
    this.w = 0;            // índice de escritura
    this.p = 0;            // fase de la rampa (0..1)
    this.stopped = false;
    this.port.onmessage = e => { if (e.data === 'stop') this.stopped = true; };
  }
  read(c, d) {             // muestra de hace d muestras (fraccional, interpolación lineal)
    let pos = this.w - d; if (pos < 0) pos += this.n;
    const i0 = Math.floor(pos), f = pos - i0, i1 = i0 + 1 >= this.n ? 0 : i0 + 1;
    return this.buf[c][i0] * (1 - f) + this.buf[c][i1] * f;
  }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!out || !out.length) return !this.stopped;
    const N = out[0].length, ch = Math.min(2, out.length);
    const r = Math.pow(2, params.semitones[0] / 12), W = WINDOW * sampleRate, dp = (r - 1) / W;   // avance de fase por muestra
    for (let i = 0; i < N; i++) {
      for (let c = 0; c < ch; c++) { const src = inp && (inp[c] || inp[0]); this.buf[c][this.w] = src ? src[i] : 0; }
      const f1 = this.p, f2 = f1 + 0.5 >= 1 ? f1 - 0.5 : f1 + 0.5;          // las dos cabezas, a media vuelta
      const d1 = W * (1 - f1), d2 = W * (1 - f2);                            // retardo en muestras: de W a 0
      const g1 = Math.sin(Math.PI * f1), g2 = Math.sin(Math.PI * f2);        // ventanas seno: 0 en el salto
      for (let c = 0; c < ch; c++) out[c][i] = g1 * this.read(c, d1) + g2 * this.read(c, d2);
      if (++this.w === this.n) this.w = 0;
      this.p += dp; if (this.p >= 1) this.p -= 1; else if (this.p < 0) this.p += 1;
    }
    return !this.stopped;
  }
}

registerProcessor('shift-processor', ShiftProcessor);
