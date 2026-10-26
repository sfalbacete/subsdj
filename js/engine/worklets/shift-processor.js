/* =====================================================================
   SubSDJ · shift-processor (AudioWorklet) — GRANULAR pitch shifter for
   the Room's shimmer (Roadmap 5.0 · block 3).
   The idea (Eno/Lanois 1983, Eventide H3000): inside the reverb's feedback,
   whatever re-enters goes up an octave on every pass → the tail
   turns into a rising choir. Only the shifter lives here; the
   loop (HP → LP → this → gain → reverb input) is in Sala.js.
   How: a delay line and TWO read heads whose delay ramps down
   (sawtooth) from W to 0. Reading while «approaching» the write head means
   reading faster: the pitch rises by the factor r = 2^(st/12). On reaching 0
   the head jumps back to W; so the jump is not heard, each head
   carries a sine window (0 at the jump, 1 in the middle) and the two run half a
   cycle apart: sin² + cos² = 1, constant power. The ramp period is
   W/(r−1): at +12 st with W = 100 ms that gives 10 grains per second (the slight
   10 Hz «tremolo» of every classic shimmer; inside the reverb it
   dissolves). Downward (st < 0) the ramp rises from 0 to W: it reads more slowly.
   Stereo: the same heads for L and R (the image does not move).
   ===================================================================== */
const WINDOW = 0.1;      // s: grain length (longer = less tremolo, more blur)
const BUF_SECS = 0.5;    // s: delay line (more than enough: a head never goes past WINDOW)

class ShiftProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'semitones', defaultValue: 12, minValue: -24, maxValue: 24, automationRate: 'k-rate' }];
  }
  constructor() {
    super();
    this.n = Math.ceil(sampleRate * BUF_SECS);
    this.buf = [new Float32Array(this.n), new Float32Array(this.n)];
    this.w = 0;            // write index
    this.p = 0;            // ramp phase (0..1)
    this.stopped = false;
    this.port.onmessage = e => { if (e.data === 'stop') this.stopped = true; };
  }
  read(c, d) {             // the sample from d samples ago (fractional, linear interpolation)
    let pos = this.w - d; if (pos < 0) pos += this.n;
    const i0 = Math.floor(pos), f = pos - i0, i1 = i0 + 1 >= this.n ? 0 : i0 + 1;
    return this.buf[c][i0] * (1 - f) + this.buf[c][i1] * f;
  }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!out || !out.length) return !this.stopped;
    const N = out[0].length, ch = Math.min(2, out.length);
    const r = Math.pow(2, params.semitones[0] / 12), W = WINDOW * sampleRate, dp = (r - 1) / W;   // phase advance per sample
    for (let i = 0; i < N; i++) {
      for (let c = 0; c < ch; c++) { const src = inp && (inp[c] || inp[0]); this.buf[c][this.w] = src ? src[i] : 0; }
      const f1 = this.p, f2 = f1 + 0.5 >= 1 ? f1 - 0.5 : f1 + 0.5;          // the two heads, half a cycle apart
      const d1 = W * (1 - f1), d2 = W * (1 - f2);                            // delay in samples: from W to 0
      const g1 = Math.sin(Math.PI * f1), g2 = Math.sin(Math.PI * f2);        // sine windows: 0 at the jump
      for (let c = 0; c < ch; c++) out[c][i] = g1 * this.read(c, d1) + g2 * this.read(c, d2);
      if (++this.w === this.n) this.w = 0;
      this.p += dp; if (this.p >= 1) this.p -= 1; else if (this.p < 0) this.p += 1;
    }
    return !this.stopped;
  }
}

registerProcessor('shift-processor', ShiftProcessor);
