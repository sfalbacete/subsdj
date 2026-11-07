/* =====================================================================
   SubSDJ · destroy-processor (AudioWorklet) — the part's Dist · Flanger insert.
   One node per part, born on demand (AudioEngine._ensureFx). Chain:
     in ─┬─ Lows: LR4 low-pass at `keep` ──────────────────────────────────┐ (clean, delayed LAT)
         └─ LR4 high-pass ─┬─ Drive by type, ×2 oversampled ─┐               │
                           └─ dry, delayed LAT ──────────────┴─ Crush ─(+)───┴─ Flanger ─ out
                                                    residue high-passed at `keep` ┘
   DRIVE: amount·shape((1 + 6·amount)·x)/(1 + amount) + (1 − amount)·dry — the old
   Dist's law, so its presets keep their character. The dry branch is delayed by
   EXACTLY the oversampler's latency (LAT): with the old WaveShaper (oversample 2x)
   the wet branch arrived 128 frames late and the two summed into a comb (a notch
   every 345 Hz) at every in-between amount. Types:
     soft  tanh (the old Dist's curve, k = 4)        hard  clips flat
     fuzz  a dead zone (the tails choke and sputter) + asymmetric clip (even harmonics)
     rect  |x|: the octave above (and the mess of every interval in a chord)
   CRUSH (after the drive, without anti-aliasing: the aliasing IS the sound):
     rate  sample and hold at R = min(SR, RATE_TOP·(RATE_MIN/RATE_TOP)^rate): the
           harmonics above R/2 fold back down → inharmonic, a different metal on every key
     bits  quantization at 16 − 15·bits bits (fractional, so it can sweep)
   LOWS (keep): what is below `keep` Hz skips the drive and the crush (the bass stays
   whole). A real two-band split: Linkwitz-Riley 4 low-pass and high-pass (their sum is
   an all-pass: flat, only a phase turn around `keep`) — NOT «x − lows», which adds back up
   exactly but leaves most of the bass, phase-turned, in the «highs» (measured: the clip
   mangled the bass all the same). And the RESIDUE of the destruction (what it adds to the
   highs) is high-passed at `keep` too: the difference tones a clipped chord throws down
   there don't muddy the bass. With nothing to destroy, the output is the split's all-pass.
   FLANGER: y + mix·d, d = the line read τ ago, fed back by fb (±). τ = delay·2^mod·
   (1 + DEPTH_K·depth·lfo): `lfo` is the engine's flanger LFO (raw ±1, any shape, in
   tempo or free), `mod` the matrix (octaves). The read head may SLIDE (that is the
   flanger's sweep — a pitch bend, like tape) only up to SLEW_MAX in speed; a faster
   change (S&H, square, a Steps step) is a SPLICE: the old head and a new one at the
   target crossfade over XF — no chirp, no click.
   Amount-like controls are AudioParams (the matrix connects to them) and their ranges
   clamp knob + modulation. Keep the mappings in step with params.js (the knobs' fmt).
   ===================================================================== */
const TYPES = 4;                  // soft, hard, fuzz, rect (k-rate param `type`)
// Makeup per type: the wet's loudness of Soft at amount 0.5, measured on a saw arpeggio at the
// part's level (2026-11-07). Rect is low by nature: half of |x| is DC, which the blocker takes away.
const TYPE_MK = [1, 1.05, 1.2, 3.1];
const SOFT_K = 4, SOFT_N = Math.tanh(SOFT_K);
const FUZZ_GATE = 0.02;           // dead zone of the fuzz (on the driven signal): below it, silence
const FUZZ_GAIN = 6, FUZZ_NEG = 0.6;   // fuzz: extra gain and the lower clip (asymmetry → even harmonics)
const RECT_GAIN = 2;
const TYPE_XF = 0.01;             // s: crossfade when the type changes (a curve jumping = a click)
const RATE_TOP = 44100, RATE_MIN = 150;   // Hz: Rate at the start and at the end of its travel
const DC_HZ = 5;                  // DC blocker on the wet (fuzz and rect are asymmetric); low, so it barely turns the bass against the dry branch
const DEPTH_K = 2 / 3;            // depth 1: τ swings ±2/3 around Manual (3 ms → 1..5 ms, the old flanger)
const TAU_MIN = 0.0002, TAU_MAX = 0.04;   // s
const SLEW_MAX = 0.15;            // the read head may slide at most ±15 % in speed (≈ ±2.4 semitones)
const JUMP = 0.0003;              // s: a head further than this from its target is spliced, not slid
const XF = 0.01;                  // s: splice crossfade
const FB_SOFT = 4;                // above it the feedback loop is rounded off (only a runaway gets there)

// Half-band FIR for the ×2 oversampling (Blackman window, 63 taps): the odd offsets from the
// centre are 0, so each polyphase branch has 32 taps (even) or just the centre. Each branch
// is normalised to gain ½ (×2 when upsampling): DC passes at exactly 1.
const HB_N = 63, HB_C = 31;
const HE = (() => { const e = new Float64Array(32); let s = 0;
  for (let j = 0; j < 32; j++) { const k = 2 * j, x = (k - HB_C) / 2;
    e[j] = Math.sin(Math.PI * x) / (Math.PI * x) * (0.42 - 0.5 * Math.cos(2 * Math.PI * k / (HB_N - 1)) + 0.08 * Math.cos(4 * Math.PI * k / (HB_N - 1))); s += e[j]; }
  for (let j = 0; j < 32; j++) e[j] *= 0.5 / s; return e; })();
const HC = 0.5;
const LAT = 31;                   // latency of up + down, in samples (the dry branch is delayed by this much)
const RING = 128, RM = RING - 1;  // rings of the oversampler (base rate): history enough to warm it up

// Two identical 2nd-order sections in cascade (transposed direct form II; b2 = b0 for both the
// low-pass and the high-pass): a Linkwitz-Riley 4. st: 4 states.
function lr4(x, st, b0, b1, a1, a2) {
  const y = b0 * x + st[0]; st[0] = b1 * x - a1 * y + st[1]; st[1] = b0 * x - a2 * y;
  const z = b0 * y + st[2]; st[2] = b1 * y - a1 * z + st[3]; st[3] = b0 * y - a2 * z;
  return z;
}
function shape(t, u) {
  switch (t) {
    case 1: return u > 0.5 ? 1 : u < -0.5 ? -1 : 2 * u;
    case 2: { const w = u > FUZZ_GATE ? u - FUZZ_GATE : u < -FUZZ_GATE ? u + FUZZ_GATE : 0;
      return w >= 0 ? Math.tanh(FUZZ_GAIN * w) : FUZZ_NEG * Math.tanh(FUZZ_GAIN * w / FUZZ_NEG); }
    case 3: return Math.tanh(RECT_GAIN * (u < 0 ? -u : u));
    default: { const c = u > 1 ? 1 : u < -1 ? -1 : u; return Math.tanh(SOFT_K * c) / SOFT_N; }
  }
}

class DestroyProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'amount', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'type',   defaultValue: 0, minValue: 0, maxValue: TYPES - 1, automationRate: 'k-rate' },
      { name: 'bits',   defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'rate',   defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'keep',   defaultValue: 0, minValue: 0, maxValue: 2000, automationRate: 'k-rate' },
      { name: 'mix',    defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'delay',  defaultValue: 0.003, minValue: TAU_MIN, maxValue: TAU_MAX, automationRate: 'k-rate' },
      { name: 'depth',  defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'fb',     defaultValue: 0.35, minValue: -0.95, maxValue: 0.95, automationRate: 'k-rate' },
      { name: 'lfo',    defaultValue: 0, minValue: -4, maxValue: 4, automationRate: 'a-rate' },
      { name: 'mod',    defaultValue: 0, minValue: -8, maxValue: 8, automationRate: 'a-rate' },
    ];
  }
  constructor() {
    super();
    this.mk = TYPE_MK;
    const len = 1 << Math.ceil(Math.log2(TAU_MAX * sampleRate + 4));
    this.L = len; this.LM = len - 1; this.w = 0;
    this.c = [0, 1].map(() => ({
      hi: new Float64Array(RING), lo: new Float64Array(RING), ve: new Float64Array(RING), vo: new Float64Array(RING),
      lp: new Float64Array(4), hp: new Float64Array(4), rh: new Float64Array(4),   // Lows: LR4 low / high and the residue's high-pass (2 biquads, 2 states each)
      dcx: 0, dcy: 0, hold: 0,          // DC blocker, sample and hold
      line: new Float32Array(len),      // flanger line
    }));
    this.n = 0;                         // sample counter (index into the rings)
    this.awake = false;                 // the drive was computed in the previous block
    this.t = 0; this.tPrev = 0; this.tXf = 0; this.tXfN = Math.max(1, Math.round(TYPE_XF * sampleRate));
    this.ph = 1;                        // phase of the sample and hold (shared by L and R: the same instants)
    this.rR = -1; this.rInc = 1; this.bB = -1; this.bQ = 0;     // caches of Rate and Bits
    this.keepF = -1; this.bq = null;    // Lows: frequency and coefficients
    this.cur = -1; this.old = 0; this.g = 1; this.xf = false;   // flanger head: τ now, spliced-from τ, crossfade
    this.dcR = Math.exp(-2 * Math.PI * DC_HZ / sampleRate);
    this.slew = SLEW_MAX / sampleRate; this.xfStep = 1 / (XF * sampleRate);
  }
  _lows(f) {                            // Butterworth (Q 0.7071) twice in cascade = Linkwitz-Riley 4, low and high
    this.keepF = f;
    if (!(f > 0)) { this.bq = null; return; }
    const w = 2 * Math.PI * Math.min(f, sampleRate * 0.45) / sampleRate, cw = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2), a0 = 1 + al;
    this.bq = { l0: (1 - cw) / 2 / a0, l1: (1 - cw) / a0, h0: (1 + cw) / 2 / a0, h1: -(1 + cw) / a0, a1: -2 * cw / a0, a2: (1 - al) / a0 };
  }
  // The two oversampled values at ring index i of channel s (hi[i] = its newest sample), shaped
  // at drive a; during a type change the old curve's share is blended in (the shapes have no
  // memory and the down filter is linear, so blending here = crossfading the outputs).
  _v(s, i, a) {
    const hi = s.hi; let acc = 0;
    for (let j = 0; j < 32; j++) acc += HE[j] * hi[(i - j) & RM];
    const g = 1 + 6 * a, e = g * 2 * acc, o = g * hi[(i - 15) & RM];   // even: interpolated (time −15.5) · odd: hi at −15
    let ve = shape(this.t, e), vo = shape(this.t, o);
    if (this.tXf > 0) { const w = this.tXf / this.tXfN; ve += w * (shape(this.tPrev, e) - ve); vo += w * (shape(this.tPrev, o) - vo); }
    s.ve[i] = ve; s.vo[i] = vo;
  }
  process(inputs, outputs, P) {
    const inp = inputs[0], out = outputs[0];
    if (!out || !out.length) return true;
    const N = out[0].length, C = Math.min(2, out.length), SR = sampleRate;
    const amt = P.amount, bitsP = P.bits, rateP = P.rate, mixP = P.mix, lfoP = P.lfo, modP = P.mod;
    const t = Math.round(P.type[0]);
    if (t !== this.t) { this.tPrev = this.t; this.t = t; this.tXf = this.tXfN; }
    if (P.keep[0] !== this.keepF) this._lows(P.keep[0]);
    const bq = this.bq, delay = P.delay[0], depth = P.depth[0], fb = P.fb[0], mk = this.mk;
    // the drive only runs when something can be heard from it (amount > 0 somewhere in the block, or a type fade)
    let live = this.tXf > 0;
    if (!live) for (let i = 0; i < amt.length; i++) if (amt[i] > 0) { live = true; break; }
    if (live && !this.awake)            // waking up: rebuild the last oversampled values from the history (no transient)
      for (let c = 0; c < C; c++) for (let q = 33; q >= 1; q--) this._v(this.c[c], (this.n - q) & RM, amt[0]);
    this.awake = live;
    for (let i = 0; i < N; i++) {
      const a = amt.length > 1 ? amt[i] : amt[0];
      const b = bitsP.length > 1 ? bitsP[i] : bitsP[0], r = rateP.length > 1 ? rateP[i] : rateP[0];
      const n = this.n, k = n & RM;
      let take = true;                  // sample and hold: one decision per sample for both channels
      if (r > 0) {
        if (r !== this.rR) { this.rR = r; this.rInc = Math.min(SR, RATE_TOP * Math.pow(RATE_MIN / RATE_TOP, r)) / SR; }
        this.ph += this.rInc; take = this.ph >= 1; if (take) this.ph -= Math.floor(this.ph);
      }
      if (b > 0 && b !== this.bB) { this.bB = b; this.bQ = 2 / Math.pow(2, 16 - 15 * b); }
      const q = b > 0 ? this.bQ : 0;
      // flanger head (shared by L and R): slide up to SLEW_MAX, splice beyond
      const lf = lfoP.length > 1 ? lfoP[i] : lfoP[0], md = modP.length > 1 ? modP[i] : modP[0];
      let tg = delay * Math.pow(2, md) * (1 + DEPTH_K * depth * lf);
      tg = tg < TAU_MIN ? TAU_MIN : tg > TAU_MAX ? TAU_MAX : tg;
      if (this.cur < 0) this.cur = tg;
      const dv = tg - this.cur;
      if (!this.xf && (dv > JUMP || dv < -JUMP)) { this.old = this.cur; this.cur = tg; this.g = 0; this.xf = true; }
      else {
        this.cur += dv > this.slew ? this.slew : dv < -this.slew ? -this.slew : dv;
        if (this.xf) { this.g += this.xfStep; if (this.g >= 1) { this.g = 1; this.xf = false; } }
      }
      const mix = mixP.length > 1 ? mixP[i] : mixP[0];
      const pNew = this.w - this.cur * SR, pOld = this.w - this.old * SR;
      for (let c = 0; c < C; c++) {
        const s = this.c[c], src = inp && (inp[c] || inp[0]), x = src ? src[i] : 0;
        let lo = 0, hv = x;             // Lows: the two bands (LR4)
        if (bq) { lo = lr4(x, s.lp, bq.l0, bq.l1, bq.a1, bq.a2); hv = lr4(x, s.hp, bq.h0, bq.h1, bq.a1, bq.a2); }
        s.hi[k] = hv; s.lo[k] = lo;
        const dry = s.hi[(n - LAT) & RM], low = s.lo[(n - LAT) & RM];
        let v = dry;
        if (live) {
          this._v(s, k, a);
          let acc = HC * s.vo[(n - 16) & RM];
          for (let j = 0; j < 32; j++) acc += HE[j] * s.ve[(n - j) & RM];
          const wet = acc - s.dcx + this.dcR * s.dcy; s.dcx = acc; s.dcy = wet;   // DC-blocked (fuzz and rect are asymmetric)
          v = (1 - a) * dry + a * wet * mk[this.t] / (1 + a);
        }
        if (r > 0) { if (take) s.hold = v; v = s.hold; }         // crush: on the destroyed part only
        if (q > 0) v = Math.round(v / q) * q;
        if (bq) v = dry + lr4(v - dry, s.rh, bq.h0, bq.h1, bq.a1, bq.a2);   // what the destruction added, kept above Lows
        const y = low + v;
        const line = s.line, LM = this.LM;                       // flanger
        let i0 = Math.floor(pNew), f = pNew - i0;
        let d = line[i0 & LM] + (line[(i0 + 1) & LM] - line[i0 & LM]) * f;
        if (this.xf) { i0 = Math.floor(pOld); f = pOld - i0;
          const dOld = line[i0 & LM] + (line[(i0 + 1) & LM] - line[i0 & LM]) * f; d = dOld + (d - dOld) * this.g; }
        let wv = y + fb * d;
        if (wv > FB_SOFT) wv = FB_SOFT + Math.tanh(wv - FB_SOFT); else if (wv < -FB_SOFT) wv = -FB_SOFT + Math.tanh(wv + FB_SOFT);
        line[this.w] = wv;
        out[c][i] = y + mix * d;
      }
      if (this.tXf > 0) this.tXf--;
      this.w = (this.w + 1) & this.LM;
      this.n++;
    }
    return true;
  }
}

registerProcessor('destroy-processor', DestroyProcessor);
