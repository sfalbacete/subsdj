/* =====================================================================
   SubSDJ · plate-processor (AudioWorklet) — algorithmic PLATE reverb.
   Dattorro's topology («Effect Design Part 1», JAES 1997): the lineage of the
   Lexicon 224. Why it sounds better than a noise IR: the echo density
   GROWS over time (each allpass multiplies the reflections) and the tank
   is modulated, which decorrelates the modes and kills the «metal».
     input (mono) → bandwidth lowpass → 4 DIFFUSION allpasses in
     series → figure-of-eight TANK: two cross-coupled branches, each one
       MODULATED allpass (decay diffusion 1) → delay → lowpass (damping)
       → ×decay → allpass (decay diffusion 2) → delay → ×decay → to the OTHER branch
     output L/R = sums of 7 different «taps» from the tank's
     lines (Dattorro, table 2): decorrelated stereo from a single tank.
   Lengths in samples at the design rate (29 761 Hz), scaled
   to the context's. Output is 100 % wet: the level is set by the send (Sala.js).
   Params (k-rate): decay (0..1, the Room derives it from Size; ≈1 = FREEZE: the
   tank is a loop of allpasses and delays, lossless at decay 1, so
   the tail keeps sounding as is), damp (0..1, tank lowpass), mod
   (0..1, excursion of the modulated allpasses).
   If nothing comes in and the tank is empty, it does not compute (cheap silence).
   ===================================================================== */
const REF_SR = 29761;
const TWO_PI = Math.PI * 2;
const EXCURSION = 16;        // samples (at REF_SR) of maximum excursion of the modulated allpasses
const MOD_HZ_L = 1.0, MOD_HZ_R = 0.95;   // modulation LFOs (different: decorrelates more)
const BANDWIDTH = 0.9995;    // input lowpass (Dattorro's coefficient: almost open)
const IN_DIFF = [[142, 0.75], [107, 0.75], [379, 0.625], [277, 0.625]];   // input allpasses [length, g]
const DECAY_DIFF1 = 0.70, DECAY_DIFF2 = 0.50;
const OUT_GAIN = 0.18;       // 0.6 in the paper; −10.5 dB more to match the energy of the noise IR
                             // of the «hall» mode (measured: at equal send the plate came out 9-12 dB hotter)

// Circular delay line: read(d) returns the sample written d writes ago.
class Line {
  constructor(n) { this.n = Math.max(2, n | 0); this.buf = new Float32Array(this.n); this.w = 0; }
  write(x) { this.buf[this.w] = x; if (++this.w === this.n) this.w = 0; }
  read(d) { let i = this.w - d; if (i < 0) i += this.n; if (i < 0) i = 0; return this.buf[i]; }
  readFrac(d) { const i = Math.floor(d), f = d - i; return this.read(i) * (1 - f) + this.read(i + 1) * f; }
}
// Schroeder allpass over a line: v = x + g·z ; y = z − g·v
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
      { name: 'decay', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },   // 1 = freeze (Sala.FREEZE_DECAY stays a hair below)
      { name: 'damp',  defaultValue: 0.3, minValue: 0, maxValue: 1,    automationRate: 'k-rate' },
      { name: 'mod',   defaultValue: 0.5, minValue: 0, maxValue: 1,    automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    const k = sampleRate / REF_SR, S = n => Math.round(n * k);
    this.k = k;
    this.bw = 0;                                            // state of the input lowpass
    this.inDiff = IN_DIFF.map(([len, g]) => new Allpass(S(len), g));
    // tank: left and right branch (line names follow the paper's nodes)
    this.apL1 = new Allpass(S(672) + S(EXCURSION) * 2, DECAY_DIFF1); this.apL1.base = S(672);
    this.dL1 = new Line(S(4453) + 1);
    this.apL2 = new Allpass(S(1800), DECAY_DIFF2);
    this.dL2 = new Line(S(3720) + 1);
    this.apR1 = new Allpass(S(908) + S(EXCURSION) * 2, DECAY_DIFF1); this.apR1.base = S(908);
    this.dR1 = new Line(S(4217) + 1);
    this.apR2 = new Allpass(S(2656), DECAY_DIFF2);
    this.dR2 = new Line(S(3163) + 1);
    this.lpL = 0; this.lpR = 0;                             // damping states
    this.fbL = 0; this.fbR = 0;                             // what each branch sends to the other
    this.phL = 0; this.phR = 0;                             // phases of the modulation LFOs
    // output taps (table 2 of the paper), already scaled
    this.taps = {
      L: [[this.dR1, S(266)], [this.dR1, S(2974)], [this.apR2.line, S(1913), -1], [this.dR2, S(1996)],
          [this.dL1, S(1990), -1], [this.apL2.line, S(187), -1], [this.dL2, S(1066), -1]],
      R: [[this.dL1, S(353)], [this.dL1, S(3627)], [this.apL2.line, S(1228), -1], [this.dL2, S(2673)],
          [this.dR1, S(2111), -1], [this.apR2.line, S(335), -1], [this.dR2, S(121), -1]],
    };
    // Idle: no input and no output for MORE than one full trip around the
    // tank (the signal may be traveling down a 6000-sample line without
    // having reached any tap yet) ⇒ the tank is truly empty.
    this.quiet = 0;                                         // consecutive blocks with neither input nor output
    this.idleLimit = Math.ceil((S(4453) + S(3720) + S(672) + S(1800) + 2 * S(EXCURSION)) / 128) + 16;
    this.stopped = false;
    this.port.onmessage = e => { if (e.data === 'stop') this.stopped = true; };
  }

  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!out || !out.length) return !this.stopped;
    const L = out[0], R = out[1] || out[0], N = L.length;
    const inL = inp && inp[0], inR = inp && inp[1];
    // anything to do? With no input and the tank exhausted, straight silence.
    let energy = 0;
    if (inL) for (let i = 0; i < N; i++) energy += inL[i] * inL[i];
    if (energy < 1e-12 && this.quiet > this.idleLimit) { L.fill(0); if (R !== L) R.fill(0); return !this.stopped; }
    const decay = params.decay[0], damp = params.damp[0] * 0.85, exc = params.mod[0] * EXCURSION * this.k;
    const dphL = TWO_PI * MOD_HZ_L / sampleRate, dphR = TWO_PI * MOD_HZ_R / sampleRate;
    const tapsL = this.taps.L, tapsR = this.taps.R;
    let outEnergy = 0;
    for (let i = 0; i < N; i++) {
      // mono input → bandwidth → diffusion
      let x = inL ? (inR ? 0.5 * (inL[i] + inR[i]) : inL[i]) : 0;
      this.bw = BANDWIDTH * x + (1 - BANDWIDTH) * this.bw; x = this.bw;
      for (const ap of this.inDiff) x = ap.process(x);
      // tank: each branch receives the diffusion + what the other one sends it
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
      // outputs: 7 taps per channel
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
