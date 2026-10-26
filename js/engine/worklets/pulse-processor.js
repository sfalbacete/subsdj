/* =====================================================================
   SubSDJ · pulse-processor (AudioWorklet)
   Band-limited oscillator (PolyBLEP). Types (processorOptions.type):
     sawtooth | square | sine | triangle | supersaw | wavetable | fm4 | string
   FM4: 4-operator FM synthesis à la DX7/TX81Z. An ALGORITHM is just a
   directed graph of who modulates whom (FM4_ALGS): the leaves modulate, the
   roots (carriers) sound. Each operator has its own ratio (multiple of the
   note), level and DECAY (level·e^(−t/decay); flat if decay ≥ FM4_DEC_FLAT):
   a modulator that decays = a bright attack that fades, which is what makes
   pluck, bell, e-piano and kick. Operator 4 carries the feedback
   (fmFb, as in the 2-op). Phase modulation in cycles: level 1 ⇒
   FM4_MOD cycles ≈ 7.5 rad of index. Params fm4Alg / fm4R1-4 / fm4L1-4 / fm4D1-4.
   WAVETABLE: processorOptions.wt = { lens, frames } (mips generated
   on the main thread, engine/wavetable.js). Lookup with cubic (Hermite)
   interpolation + linear morph between adjacent frames (param wtPos);
   the level (mip) is chosen by frequency: the table read has no partials
   above Nyquist (the tabulated equivalent of PolyBLEP). Ignores pulseWidth,
   spread and FM; unison/octaves/drift work the same as in the rest.
   MULTI-OCTAVE: processorOptions.octaves (1..4) stacks the octaves INSIDE
   the processor (before: one AudioWorkletNode per octave). The sum comes out
   unnormalized; the voice bus applies 1/octaves, as always.
   Params (all k-rate: one value per 128-sample block; the detune pow is
   paid once per block, not per sample — at 20 Hz of vibrato the 2.9 ms
   step is inaudible): frequency (Hz, glide), detune (cents, vibrato),
   drift (cents, slow random drift independent per oscillator),
   pulseWidth (PWM), spread (supersaw), fmRatio/fmIndex/fmFb (2-op FM on
   sine; fmFb = modulator feedback),
   uniVoices/uniDetune (generalized UNISON: 1..7 detuned copies for
   any wave except supersaw, which already is a unison; level 1/sqrt(N);
   copy 0 keeps the configured phase -> with N=1 it is bit-identical to the
   simple oscillator; the other copies start at a random phase).
   RANDOMNESS (phases of the copies and of the supersaw, drift): processorOptions.seed
   (sent by the voice; offline it comes from a seeded generator: repeatable
   renders). Without seed, Math.random.
   STRING (Roadmap 7.0 · 3.3): extended Karplus-Strong — a plucked string
   simulated with a delay loop one period long. See _string. Params
   strBright / strDecay / strPos / strStiff; the velocity arrives in
   processorOptions.vel (fixed per note: the force of the pluck).
   HARD SYNC (Roadmap 7.0 · 3.2): with syncRatio > 0 this oscillator (A) is
   the SLAVE of B: it restarts its cycle on every cycle of B. See _synced.
   slave = cents that move ONLY the slave (the matrix «Pitch A»): the sync
   sweep changes the timbre and does not drag the master along.
   Mono output. Self-destructs on receiving the "stop" message.
   ===================================================================== */

// Seeded PRNG (mulberry32, the one in engine/Harmony.js: worklets do not import engine modules)
function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
function fract(x) { return x - Math.floor(x); }
// Hermite read of the table (the one in the 'wavetable' loop, as a function: sync uses it)
function wtHermite(dA, dB, ff, len, p) {
  const xx = p * len, i1 = xx | 0, w = xx - i1;
  const i0 = i1 === 0 ? len - 1 : i1 - 1, i2 = i1 + 1 === len ? 0 : i1 + 1, i3 = i2 + 1 === len ? 0 : i2 + 1;
  const a0 = dA[i0], a1 = dA[i1], a2 = dA[i2], a3 = dA[i3];
  const y0 = a0 + (dB[i0] - a0) * ff, y1 = a1 + (dB[i1] - a1) * ff, y2 = a2 + (dB[i2] - a2) * ff, y3 = a3 + (dB[i3] - a3) * ff;
  const c1 = 0.5 * (y2 - y0), c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3, c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
  return ((c3 * w + c2) * w + c1) * w + y1;
}
const SYNC_TYPES = new Set(['sawtooth', 'square', 'triangle', 'sine', 'wavetable']);   // supersaw, FM4 and string: no sync

// STRING (extended Karplus-Strong, Jaffe and Smith 1983). Constants:
const STR_LEN = 4096;          // samples in the line (power of 2): down to ~12 Hz at 48 kHz
const STR_BRIGHT = [0.03, 0.9]; // Bright 0..1 → how long the 8th harmonic lasts relative to the fundamental (log): 3 % muted, 90 % metallic
const STR_HREF = 8;             // the reference harmonic for Bright
const STR_VEL_OCT = [0.5, 6];   // velocity 0..1 → cutoff of the pick (two poles), in octaves above the note: soft, dark; hard, almost all the noise
const STR_DECAY_TRACK = 0.5;   // Decay is C4's; an octave higher lasts ×0.71 (high strings die out sooner)
const STR_DISP = 19;           // Stiffness 0..1 → DC delay of each dispersion allpass, from 1 to 19 samples (log: the
                               // stretching grows very fast at the end; this way 0.5 is already a piano and 1 a bell)
const STR_EXC_RMS = 0.5;       // the pick is normalized to this level: velocity sets the color, the VCA the volume

// Super Saw detune offsets (JP-8000 curve, per Adam Szabo's analysis).
const SS_DETUNE = [-0.11002313, -0.06288439, -0.01952356, 0, 0.01952356, 0.06288439, 0.11002313];

// FM modulator feedback (fmFb 0..1 → β radians): y = sin(θ + β·ȳ),
// with ȳ = mean of the TWO previous outputs (Yamaha's trick: without
// averaging, at high β the sample alternates sign and the loop whistles at Nyquist).
// β ≈ 1.5 already gives a reasonable saw; towards 3 the loop goes chaotic =
// metallic noise (the TX81Z's FM hats, with no noise generator).
const FM_FB_MAX = 3;

// FM4: algorithms = for each operator (0..3), its MODULATORS (higher indices:
// computed from 3 down to 0) and which operators are CARRIERS (summed to the output).
const FM4_ALGS = [
  { mods: [[1], [2], [3], []], car: [0] },            // 0 stack 4→3→2→1 (brass; feedback on 4)
  { mods: [[1], [], [3], []], car: [0, 2] },          // 1 two pairs 2→1 · 4→3 (e-piano)
  { mods: [[1, 2, 3], [], [], []], car: [0] },        // 2 three modulators in parallel → 1 (dense bell)
  { mods: [[1, 2], [], [3], []], car: [0] },          // 3 Y: 2 and 3 → 1, 4 → 3
  { mods: [[3], [3], [3], []], car: [0, 1, 2] },      // 4 one modulator for three carriers (organ, choir)
  { mods: [[1], [2], [], []], car: [0, 3] },          // 5 stack of three + carrier 4 alone (sine bed)
  { mods: [[1], [], [], []], car: [0, 2, 3] },        // 6 pair 2→1 + two pure carriers
  { mods: [[], [], [], []], car: [0, 1, 2, 3] },      // 7 additive: all four sound (feedback on 4 = saw)
];
const FM4_MOD = 1.2;          // phase cycles per unit of modulator level (≈ 7.5 rad of index at level 1)
const FM4_DEC_FLAT = 3.99;    // decay ≥ this = no envelope (constant level)

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
      { name: 'fmFb',      defaultValue: 0,   minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },
      { name: 'uniVoices', defaultValue: 1,   minValue: 1,     maxValue: 7,     automationRate: 'k-rate' },
      { name: 'uniDetune', defaultValue: 0,   minValue: 0,     maxValue: 50,    automationRate: 'k-rate' },
      { name: 'wtPos',     defaultValue: 0,   minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },
      { name: 'fm4Alg',    defaultValue: 0,   minValue: 0,     maxValue: 7,     automationRate: 'k-rate' },
      { name: 'syncRatio', defaultValue: 0,   minValue: 0,     maxValue: 64,    automationRate: 'k-rate' },   // 0 = free; otherwise f(B)/f(A without slave)
      { name: 'slave',     defaultValue: 0,   minValue: -4800, maxValue: 4800,  automationRate: 'k-rate' },   // cents of the slave only (Pitch A)
      { name: 'strBright', defaultValue: 0.5, minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },   // string: loop brightness
      { name: 'strDecay',  defaultValue: 3,   minValue: 0.05,  maxValue: 30,    automationRate: 'k-rate' },   // string: T60 of the fundamental at C4 (s)
      { name: 'strPos',    defaultValue: 0.12,minValue: 0.02,  maxValue: 0.5,   automationRate: 'k-rate' },   // string: pluck point (0.5 = the center)
      { name: 'strStiff',  defaultValue: 0,   minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },   // string: stiffness (stretched harmonics)
      ...[1, 2, 3, 4].flatMap(n => [
        { name: 'fm4R' + n, defaultValue: 1,   minValue: 0.25,  maxValue: 12,  automationRate: 'k-rate' },
        { name: 'fm4L' + n, defaultValue: 0.5, minValue: 0,     maxValue: 1,   automationRate: 'k-rate' },
        { name: 'fm4D' + n, defaultValue: 4,   minValue: 0.005, maxValue: 4,   automationRate: 'k-rate' },
      ]),
    ];
  }

  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.type = o.type || 'sawtooth';
    this.octaves = Math.max(1, Math.min(4, (o.octaves | 0) || 1));
    const ph = (typeof o.phase === 'number') ? (o.phase % 1 + 1) % 1 : 0;
    const rnd = this.rnd = (typeof o.seed === 'number') ? mulberry32(o.seed) : Math.random;
    if (this.type === 'supersaw') {
      // 7 random, independent phases PER OCTAVE (avoids the "comb" of aligned phases)
      this.phases = new Float32Array(this.octaves * 7);
      for (let i = 0; i < this.phases.length; i++) this.phases[i] = rnd();
    } else {
      // 7 slots per octave for the generalized unison (idx = oct*7 + copy):
      // copy 0 carries the configured phase (with uniVoices=1 everything is as before),
      // the rest a random one. modPhases = FM modulators: copy 0 starts at the
      // carrier's phase (key sync, like FM4 and the DX7). Before, at random: with
      // integer ratios the relative phase spreads the energy among harmonics and each
      // note came out with a different timbre («DX Bass», six C4s in a row: 7.7 dB apart).
      this.phases = new Float32Array(this.octaves * 7);
      this.modPhases = new Float32Array(this.octaves * 7);
      this.fb1 = new Float32Array(this.octaves * 7);   // last two outputs of the modulator (feedback)
      this.fb2 = new Float32Array(this.octaves * 7);
      this.fm4Ph = new Float32Array(this.octaves * 7 * 4);   // FM4: 4 phases per copy (copy 0 starts at the configured phase)
      this.fm4Fb = new Float32Array(this.octaves * 7 * 2);   // FM4: feedback memory of op 4
      for (let i = 0; i < this.octaves * 7; i++) for (let op = 0; op < 4; op++) this.fm4Ph[i * 4 + op] = (i % 7 === 0) ? ph : rnd();
      this.fm4Out = new Float32Array(4);
      for (let i = 0; i < this.phases.length; i++) {
        this.phases[i] = (i % 7 === 0) ? ph : rnd();
        this.modPhases[i] = (i % 7 === 0) ? ph : rnd();
      }
    }
    this.gph = (typeof o.gphase === 'number') ? (o.gphase % 1 + 1) % 1 : 0;   // master's ghost phase (sync): starts where B does
    this.pend = null;   // sync: pending PolyBLEP residual for the next sample, per copy
    this.vel = typeof o.vel === 'number' ? o.vel : 1;   // string: force of the pluck
    this.str = null;    // string: the state of each string (one per copy), created in the first block
    this.stopped = false;
    this.t = 0;         // seconds since the node was born (fallback: if the Voice does not send t0)
    // t0: instant (audio clock) at which the note STARTS — the VCA opens there. The
    // FM4 per-operator envelopes are measured from t0, not from the node's
    // birth: between creating the worklet and it sounding come the look-ahead (5 ms), the
    // processor's birth and the main thread's jitter (live, from 5 to
    // 30 ms and variable; with notes scheduled by the arp or the players, up to
    // 120 ms). With its own clock, a 30 ms modulator (a kick's «click»)
    // had already been spent by the time the VCA opened — sometimes, and sometimes not.
    // And if the processor is born AFTER t0 (live, the node takes 6-12 ms to
    // produce), the sound starts at birth: the envelope counts from that
    // first block (tBirth), not from a t0 already gone — the click arrives whole.
    this.t0 = (typeof o.t0 === 'number') ? o.t0 : null;
    this.tBirth = null;
    this.driftZ = 0;    // state of the drift random walk (independent per oscillator)
    this.wt = (this.type === 'wavetable' && o.wt && o.wt.frames) ? o.wt : null;
    this.port.onmessage = (e) => { if (e.data === 'stop') this.stopped = true; };
  }

  process(inputs, outputs, params) {
    const out = outputs[0];
    if (!out || out.length === 0) return !this.stopped;
    const ch = out[0], N = ch.length;             // the buffer arrives zeroed: we accumulate with +=
    const sr = sampleRate, TWO_PI = Math.PI * 2;
    // Start gate: until t0 (the note start, which the Voice quantizes to a
    // block boundary) the oscillator is SILENT and its phases do not advance, so the note
    // starts exactly at the configured phase, the same on every hit. Before, it ran
    // free from the node's birth and the phase at t0 was random: with attack 0
    // (percussion) the VCA step caught the wave at any point and the hit
    // changed from one note to the next. The block that STARTS at t0 is already processed.
    if (this.t0 !== null && currentTime + N / sr <= this.t0 + 1e-6) return !this.stopped;
    const type = this.type, oct = this.octaves, nyq = sr * 0.45;
    // Analog drift: random walk with return to center (discrete OU, one step
    // per block). With a=0.998 the time constant is ~500 blocks (~1.3 s) and the
    // standard deviation of z is ~1, so the knob (cents) IS the typical excursion.
    let driftCt = 0;
    const dAmt = params.drift[0];
    if (dAmt > 0) {
      this.driftZ = this.driftZ * 0.998 + (this.rnd() * 2 - 1) * 0.0632;
      const z = this.driftZ < -2.5 ? -2.5 : (this.driftZ > 2.5 ? 2.5 : this.driftZ);
      driftCt = z * dAmt;
    }
    const f0 = params.frequency[0] * Math.pow(2, (params.detune[0] + driftCt) / 1200);
    // The slave's own pitch (Pitch A): at 0, exactly f0 (the usual presets, bit for bit)
    const slave = params.slave ? params.slave[0] : 0, fs = slave ? f0 * Math.pow(2, slave / 1200) : f0;
    const syncR = params.syncRatio ? params.syncRatio[0] : 0;

    // Generalized unison (does not apply to supersaw, which already is a unison of 7 saws).
    // Copies spread linearly over ±uniDetune cents; level 1/sqrt(N).
    let uv = params.uniVoices[0] | 0; if (uv < 1) uv = 1; else if (uv > 7) uv = 7;
    const uniCt = params.uniDetune[0], lvl = 1 / Math.sqrt(uv);
    const uniMul = j => (uv < 2 || uniCt <= 0) ? 1
      : Math.pow(2, ((2 * j / (uv - 1) - 1) * uniCt) / 1200);

    if (type === 'string') {
      this._string(ch, N, params, fs, uv, lvl, uniMul);
    } else if (syncR > 0 && SYNC_TYPES.has(type) && !(type === 'sine' && params.fmIndex[0] > 0)) {
      this._synced(ch, N, params, fs, f0 * syncR, uv, lvl, uniMul);
    } else if (type === 'supersaw') {
      const spread = params.spread[0], phases = this.phases;
      for (let k = 0; k < oct; k++) {
        const base = fs * (1 << k);
        if (base >= nyq) continue;                // octave above Nyquist: silence, not alias
        for (let j = 0; j < 7; j++) {
          const f = base * (1 + SS_DETUNE[j] * spread * 0.25);   // up to ~±47 cents at the extremes
          const dt = f / sr, idx = k * 7 + j;
          let p = phases[idx];
          for (let i = 0; i < N; i++) {
            ch[i] += (2 * p - 1 - polyBlep(p, dt)) * 0.38;       // ~1/sqrt(7): the level of one saw
            p += dt; if (p >= 1) p -= 1;
          }
          phases[idx] = p;
        }
      }
    } else if (type === 'sine') {
      // FM = phase modulation (DX-style 2-op): sine modulator at freq*ratio. Clean on sine.
      // With unison, each copy carries its own carrier/modulator pair.
      const ratio = params.fmRatio[0], index = params.fmIndex[0];
      const beta = (params.fmFb ? params.fmFb[0] : 0) * FM_FB_MAX;
      for (let k = 0; k < oct; k++) {
        const base = fs * (1 << k);
        if (base >= nyq) continue;
        for (let j = 0; j < uv; j++) {
          const f = base * uniMul(j);
          const dt = f / sr, mdt = (f * ratio) / sr, idx = k * 7 + j;
          let p = this.phases[idx], mp = this.modPhases[idx];
          if (index > 0 && beta > 0) {
            // fed-back modulator: its own (averaged) output enters its phase
            let y1 = this.fb1[idx], y2 = this.fb2[idx];
            for (let i = 0; i < N; i++) {
              const m = Math.sin(TWO_PI * mp + beta * (y1 + y2) * 0.5);
              y2 = y1; y1 = m;
              ch[i] += Math.sin(TWO_PI * (p + m * index)) * lvl;
              p += dt; if (p >= 1) p -= 1;
              mp += mdt; if (mp >= 1) mp -= Math.floor(mp);
            }
            this.fb1[idx] = y1; this.fb2[idx] = y2;
          } else if (index > 0) {
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
            mp = fract(mp + mdt * N);             // keeps the modulator's phase coherent
          }
          this.phases[idx] = p; this.modPhases[idx] = mp;
        }
      }
    } else if (type === 'wavetable') {
      const wt = this.wt;
      if (!wt) return !this.stopped;                // no tables: silence (missing payload)
      const F = wt.frames.length, h0 = wt.h0 || 512, LMAX = wt.frames[0].length - 1;
      // morph position -> pair of adjacent frames + weight
      let pos = params.wtPos[0]; if (pos < 0) pos = 0; else if (pos > 1) pos = 1;
      const x = pos * (F - 1), fA = F > 1 ? Math.min(F - 2, x | 0) : 0, ff = F > 1 ? x - fA : 0;
      const fB = fA + 1 < F ? fA + 1 : fA;
      // Morph loudness compensation: the linear mix of poorly correlated
      // frames loses energy halfway (and two waves in antiphase
      // CANCEL). rms² of the mix = closed formula with the energy per
      // frame and the neighbor correlation (precomputed). Cap ×2: a real
      // null is not amplified up into noise. At the extremes the gain is 1.
      let gMix = 1;
      if (fB !== fA && wt.energia && wt.corr) {
        const Ea = wt.energia[fA], Eb = wt.energia[fB], c = wt.corr[fA];
        const mixE = (1 - ff) * (1 - ff) * Ea + ff * ff * Eb + 2 * ff * (1 - ff) * c;
        const target = (1 - ff) * Math.sqrt(Ea) + ff * Math.sqrt(Eb);
        gMix = mixE > 1e-6 ? Math.min(2, target / Math.sqrt(mixE)) : 2;
      }
      for (let k = 0; k < oct; k++) {
        const base = fs * (1 << k);
        if (base >= nyq) continue;
        for (let j = 0; j < uv; j++) {
          const f = base * uniMul(j);
          // level (mip): the largest number of harmonics that fits below Nyquist at this
          // frequency. The caps go as h0 >> L => L = the surplus "halvings".
          const allowed = nyq / f;
          let L = 0; while ((h0 >> L) > allowed && L < LMAX) L++;
          const dA = wt.frames[fA][L], dB = wt.frames[fB][L], len = dA.length;
          const dt = f / sr, idx = k * 7 + j, amp = lvl * gMix;
          let p = this.phases[idx];
          for (let i = 0; i < N; i++) {
            // 4-point Hermite (Catmull-Rom) on the MIX of the two frames
            // (the morph is linear: mixing before interpolating gives the same result and the
            // cubic is computed once). With linear interpolation and 4× tables, the error fell BETWEEN harmonics:
            // an inharmonic floor of −43 dB at C4; with Hermite and 8× tables, −76.
            const xx = p * len, i1 = xx | 0, w = xx - i1;
            const i0 = i1 === 0 ? len - 1 : i1 - 1, i2 = i1 + 1 === len ? 0 : i1 + 1, i3 = i2 + 1 === len ? 0 : i2 + 1;
            const a0 = dA[i0], a1 = dA[i1], a2 = dA[i2], a3 = dA[i3];
            const y0 = a0 + (dB[i0] - a0) * ff, y1 = a1 + (dB[i1] - a1) * ff, y2 = a2 + (dB[i2] - a2) * ff, y3 = a3 + (dB[i3] - a3) * ff;
            const c1 = 0.5 * (y2 - y0), c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3, c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
            ch[i] += (((c3 * w + c2) * w + c1) * w + y1) * amp;
            p += dt; if (p >= 1) p -= 1;
          }
          this.phases[idx] = p;
        }
      }
    } else if (type === 'fm4') {
      const alg = FM4_ALGS[Math.max(0, Math.min(FM4_ALGS.length - 1, params.fm4Alg[0] | 0))];
      const R = [params.fm4R1[0], params.fm4R2[0], params.fm4R3[0], params.fm4R4[0]];
      const beta = (params.fmFb ? params.fmFb[0] : 0) * FM_FB_MAX / TWO_PI;   // op 4 feedback, in cycles
      // per-operator envelope, k-rate (one value per 2.9 ms block: the
      // step is inaudible; with decay ≥ FM4_DEC_FLAT the level is constant)
      if (this.tBirth === null) this.tBirth = currentTime;   // first processed block (currentTime: the AudioWorkletGlobalScope clock)
      const env = this.fm4Out, t = this.t0 !== null ? Math.max(0, currentTime - Math.max(this.t0, this.tBirth)) : this.t;
      const Lv = [params.fm4L1[0], params.fm4L2[0], params.fm4L3[0], params.fm4L4[0]];
      const D = [params.fm4D1[0], params.fm4D2[0], params.fm4D3[0], params.fm4D4[0]];
      for (let op = 0; op < 4; op++) env[op] = Lv[op] * (D[op] >= FM4_DEC_FLAT ? 1 : Math.exp(-t / Math.max(0.005, D[op])));
      const carG = lvl / Math.sqrt(alg.car.length), out = [0, 0, 0, 0], ph = this.fm4Ph, fbm = this.fm4Fb;
      for (let k = 0; k < oct; k++) {
        const base = fs * (1 << k);
        if (base >= nyq) continue;
        for (let j = 0; j < uv; j++) {
          const f = base * uniMul(j), idx = k * 7 + j, o = idx * 4, fo = idx * 2;
          const dt0 = f * R[0] / sr, dt1 = f * R[1] / sr, dt2 = f * R[2] / sr, dt3 = f * R[3] / sr;
          for (let i = 0; i < N; i++) {
            // from 3 down to 0: modulators always have a higher index than what they modulate
            for (let op = 3; op >= 0; op--) {
              let m = 0; const ms = alg.mods[op]; for (let q = 0; q < ms.length; q++) m += out[ms[q]];
              let phase = ph[o + op] + m * FM4_MOD;
              if (op === 3 && beta > 0) phase += beta * (fbm[fo] + fbm[fo + 1]) * 0.5;
              const y = Math.sin(TWO_PI * phase) * env[op];
              out[op] = y;
              if (op === 3) { fbm[fo + 1] = fbm[fo]; fbm[fo] = y; }
            }
            let s = 0; const cs = alg.car; for (let q = 0; q < cs.length; q++) s += out[cs[q]];
            ch[i] += s * carG;
            ph[o] += dt0; if (ph[o] >= 1) ph[o] -= 1;
            ph[o + 1] += dt1; if (ph[o + 1] >= 1) ph[o + 1] -= Math.floor(ph[o + 1]);
            ph[o + 2] += dt2; if (ph[o + 2] >= 1) ph[o + 2] -= Math.floor(ph[o + 2]);
            ph[o + 3] += dt3; if (ph[o + 3] >= 1) ph[o + 3] -= Math.floor(ph[o + 3]);
          }
        }
      }
    } else if (type === 'triangle') {
      for (let k = 0; k < oct; k++) {
        const base = fs * (1 << k);
        if (base >= nyq) continue;
        for (let j = 0; j < uv; j++) {
          const dt = base * uniMul(j) / sr, idx = k * 7 + j;
          let p = this.phases[idx];
          for (let i = 0; i < N; i++) {
            ch[i] += (4 * Math.abs(p - 0.5) - 1) * lvl;   // soft odd harmonics (1/n²)
            p += dt; if (p >= 1) p -= 1;
          }
          this.phases[idx] = p;
        }
      }
    } else if (type === 'square') {
      let duty = params.pulseWidth[0];
      if (duty < 0.01) duty = 0.01; else if (duty > 0.99) duty = 0.99;
      // centered: a pulse of width d has mean 2d − 1 (the 20 % one, −0.6): it is subtracted, so
      // PWM does not move the output's DC (at 50 %, exactly 0: the usual square)
      const dcOff = 2 * duty - 1;
      for (let k = 0; k < oct; k++) {
        const base = fs * (1 << k);
        if (base >= nyq) continue;
        for (let j = 0; j < uv; j++) {
          const dt = base * uniMul(j) / sr, idx = k * 7 + j;
          let p = this.phases[idx];
          for (let i = 0; i < N; i++) {
            let v = p < duty ? 1 : -1;
            v += polyBlep(p, dt);
            v -= polyBlep(fract(p - duty), dt);
            ch[i] += (v - dcOff) * lvl;
            p += dt; if (p >= 1) p -= 1;
          }
          this.phases[idx] = p;
        }
      }
    } else {                                      // sawtooth
      for (let k = 0; k < oct; k++) {
        const base = fs * (1 << k);
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

    this.t += N / sr;
    for (let c = 1; c < out.length; c++) out[c].set(ch);
    return !this.stopped;
  }

  // HARD SYNC. The slave does not HEAR the master: it keeps a GHOST phase at B's
  // frequency (fm = A's without Pitch A × syncRatio, which carries the octaves and detunes of
  // both; vibrato, pitch env, glide and bend move both equally and cancel out) and,
  // when that phase wraps around, resets its own to 0. Each reset is a STEP of
  // height H = w(0) − w(phase at which it was cut), and a bare digital step generates
  // aliasing (metallic noise that does not follow the note). It is corrected with the PolyBLEP
  // residual of the step, the one used for the saw's edges but with its real height: if it falls τ
  // samples past sample n, n gets H/2·(1−τ)² and n+1 −H/2·τ² (that is why a
  // pending residual is kept per copy). The NATURAL edges (the saw's tooth, the
  // square's flanks) take the same path: with no resets, this is the usual
  // PolyBLEP. A single master for all copies: stacked octaves and unison
  // reset together, as in analog sync. The master's drift is A's (the
  // real B has its own: the sync follows the note, not B's drift).
  // The reset also breaks the SLOPE (in the triangle, the sine and the table, the
  // only thing that jumps when the value happens to match): a slope change
  // ΔS (per sample) is corrected with PolyBLAMP, the integral of the previous
  // residual: ΔS·(1−τ)³/6 to the sample before and ΔS·τ³/6 to the one after. Without it,
  // the synced triangle was ~20 dB dirtier than without sync.
  _synced(ch, N, params, fs, fm, uv, lvl, uniMul) {
    const sr = sampleRate, nyq = sr * 0.45, type = this.type, oct = this.octaves;
    // 1) where the master wraps around in this block: rst[i] = τ if between sample i and i+1, −1 if not
    const rst = this.rst && this.rst.length >= N ? this.rst : (this.rst = new Float32Array(N));
    const dtm = Math.min(0.999, fm / sr);
    let g = this.gph;
    for (let i = 0; i < N; i++) {
      if (g + dtm >= 1) { rst[i] = (1 - g) / dtm; g += dtm - 1; } else { rst[i] = -1; g += dtm; }
    }
    this.gph = g;
    if (!this.pend) this.pend = new Float32Array(oct * 7);
    // 2) the wave: naive value w(p) and natural edges [phase, height]
    let duty = params.pulseWidth[0]; if (duty < 0.01) duty = 0.01; else if (duty > 0.99) duty = 0.99;
    // and its slope per unit of phase, s(p)
    let w = null, s = null, edges = [], amp = lvl, wt = null;
    if (type === 'sawtooth') { w = p => 2 * p - 1; s = () => 2; edges = [[1, -2]]; }
    else if (type === 'square') { w = p => (p < duty ? 1 : -1); s = () => 0; edges = [[duty, -2], [1, 2]]; }
    else if (type === 'triangle') { w = p => 4 * Math.abs(p - 0.5) - 1; s = p => (p < 0.5 ? -4 : 4); }   // its peaks, uncorrected: as above
    else if (type === 'sine') { w = p => Math.sin(2 * Math.PI * p); s = p => 2 * Math.PI * Math.cos(2 * Math.PI * p); }
    else if (type === 'wavetable') { wt = this._wtMorph(params); if (!wt) return; amp = lvl * wt.gMix; }
    for (let k = 0; k < oct; k++) {
      const base = fs * (1 << k);
      if (base >= nyq) continue;
      for (let j = 0; j < uv; j++) {
        const f = base * uniMul(j), dt = f / sr, idx = k * 7 + j;
        let wv = w, sv = s;
        if (wt) {                                    // table: the mip for this frequency
          const allowed = nyq / f, LMAX = this.wt.frames[0].length - 1, h0 = this.wt.h0 || 512;
          let L = 0; while ((h0 >> L) > allowed && L < LMAX) L++;
          const dA = this.wt.frames[wt.fA][L], dB = this.wt.frames[wt.fB][L], len = dA.length, ff = wt.ff;
          wv = p => wtHermite(dA, dB, ff, len, p);
          const e = 0.25 / len;                    // slope: centered difference at a quarter of a table sample
          sv = p => (wtHermite(dA, dB, ff, len, fract(p + e)) - wtHermite(dA, dB, ff, len, fract(p - e + 1))) / (2 * e);
        }
        const w0 = wv(0), s0 = sv(0);
        let p = this.phases[idx], pend = this.pend[idx];
        for (let i = 0; i < N; i++) {
          let y = wv(p) + pend; pend = 0;
          const tau = rst[i];
          const pe = tau >= 0 ? p + tau * dt : p + dt;   // how far the phase gets: the reset or the end of the interval
          for (let e = 0; e < edges.length; e++) {
            const ph = edges[e][0];
            let te = -1;
            if (p < ph && ph <= pe) te = (ph - p) / dt;
            else if (ph < 1 && ph <= pe - 1) te = (1 + ph - p) / dt;   // edge after the natural wrap (minimum duty cycle)
            if (te >= 0) { const h = edges[e][1] * 0.5; y += h * (1 - te) * (1 - te); pend -= h * te * te; }
          }
          if (tau >= 0) {
            const pr = pe >= 1 ? pe - 1 : pe;
            const h = (w0 - wv(pr)) * 0.5;                   // the reset step (PolyBLEP)
            y += h * (1 - tau) * (1 - tau); pend -= h * tau * tau;
            const dS = (s0 - sv(pr)) * dt, u = 1 - tau;      // and its slope change (PolyBLAMP)
            y += dS * u * u * u / 6; pend += dS * tau * tau * tau / 6;
            p = (1 - tau) * dt;
            for (let e = 0; e < edges.length; e++) {   // an edge already in the stretch after the reset (very narrow square)
              const ph = edges[e][0];
              if (ph <= p) { const te = tau + ph / dt, h = edges[e][1] * 0.5; y += h * (1 - te) * (1 - te); pend -= h * te * te; }
            }
          } else p = pe >= 1 ? pe - 1 : pe;
          ch[i] += y * amp;
        }
        this.phases[idx] = p; this.pend[idx] = pend;
      }
    }
  }

  // STRING (extended Karplus-Strong). One string per copy: a delay line
  // through which the wave circulates; each round trip lasts exactly one period of the note,
  // so what circulates repeats itself and sounds at that note. At birth a one-period
  // noise burst (the pick) is injected and, on every round trip, it goes through:
  //   · a FRACTIONAL allpass: the line only measures whole samples and in the
  //     highs the rounding detunes (at 2 kHz, ~70 cents); the allpass supplies the
  //     fraction. Its coefficient is computed so that its phase delay AT THE NOTE
  //     is exactly what is missing (not Thiran's approximation, which holds near 0 Hz).
  //   · a one-pole lowpass (BRIGHT): each round trip removes some highs, so
  //     the upper harmonics die out before the fundamental — what a real
  //     string does without being programmed to. Bright is not a cutoff: it is HOW LONG the
  //     8th harmonic LASTS relative to the fundamental (r), and the pole is computed per note to
  //     achieve it — so Decay lengthens the note without changing its color, and the color is the
  //     same across the whole range. (One pole cannot remove more than ~1/8 per round trip at the 8th:
  //     if more is asked for, it stays there.)
  //   · four DISPERSION allpasses (STIFFNESS): they delay the lows more than the
  //     highs, and the upper harmonics end up somewhat sharper than n·f0: the piano's
  //     taut, thick string; at the extreme, a bell.
  //   · the loop gain (DECAY): sets how long the fundamental takes to fall
  //     60 dB, discounting the lowpass loss at the note.
  // The tuning: the total round-trip delay AT THE NOTE (line + fractional +
  // lowpass phase delay + the dispersion's) is exactly sr/f.
  // The pick: seeded noise, darkened by the velocity (one pole), with the comb of
  // the POSITION (plucking at a fraction β of the string cancels the harmonics that are multiples
  // of 1/β: at the center, the even ones — round, hollow —; near the bridge almost all
  // remain — thin, metallic), DC-free and level-normalized.
  _string(ch, N, params, fs, uv, lvl, uniMul) {
    const sr = sampleRate, M = STR_LEN - 1, TWO_PI = Math.PI * 2;
    const bright = params.strBright[0], decay = params.strDecay[0], pos = params.strPos[0], stiff = params.strStiff[0];
    if (!this.str) this.str = [];
    for (let k = 0; k < this.octaves; k++) {
      for (let j = 0; j < uv; j++) {
        const idx = k * 7 + j;
        let f = fs * (1 << k) * uniMul(j);
        if (!(f > 0)) continue;
        let P = sr / f;
        if (P < 6) continue;                             // above ~8 kHz a string does not fit: silence, not alias
        if (P > STR_LEN - 8) { P = STR_LEN - 8; f = sr / P; }
        let st = this.str[idx];
        if (!st) st = this.str[idx] = { buf: new Float32Array(STR_LEN), w: 0, exc: null, ei: 0, apX: 0, apY: 0, lp: 0, dx: new Float64Array(4), dy: new Float64Array(4) };
        if (!st.exc) st.exc = this._pluck(P, f, pos);
        const w0 = TWO_PI * f / sr, sw = Math.sin(w0), cw = Math.cos(w0);
        // loop lowpass: the pole b that makes the reference harmonic last r times as long as the
        // fundamental. Per round trip, that harmonic must lose (60/(T60·f))·(1/r − 1) dB more than it:
        // R = |H(h·ω)| / |H(ω)|; with |H|² = a² / (1 − 2b·cos ω + b²) a quadratic in b comes out
        // (roots b and 1/b): (1 − R²)·b² − 2(cos ω − R²·cos hω)·b + (1 − R²) = 0
        const T60 = decay * Math.pow(261.63 / f, STR_DECAY_TRACK);
        const r = STR_BRIGHT[0] * Math.pow(STR_BRIGHT[1] / STR_BRIGHT[0], bright);
        const h = Math.min(STR_HREF, Math.floor(0.45 * sr / f));
        let b1 = 0;
        if (h >= 2 && r < 1) {
          const R = Math.pow(10, -(60 / (T60 * f)) * (1 / r - 1) / 20), q = 1 - R * R, C = cw - R * R * Math.cos(h * w0);
          const disc = C * C - q * q;
          b1 = disc > 0 && C > 0 ? Math.min(0.9999, (C - Math.sqrt(disc)) / q) : 0.9999;
        }
        const a = 1 - b1;
        const lpMag = a / Math.hypot(1 - b1 * cw, b1 * sw), lpDel = Math.atan2(b1 * sw, 1 - b1 * cw) / w0;
        // dispersion: the coefficient is limited so that its delay fits in the round trip (high notes)
        const dd = Math.pow(STR_DISP, stiff);           // DC delay of each allpass; coefficient c = (1 − d)/(1 + d)
        let c = (1 - dd) / (1 + dd);
        const cMin = (1 - P / 8) / (1 + P / 8); if (c < cMin) c = cMin;
        const disp = c < -1e-4;
        const dispDel = disp ? 4 * (w0 - 2 * Math.atan(c * sw / (1 + c * cw))) / w0 : 0;
        // integer line + fractional allpass (its delay in [0.5, 1.5): stable coefficient)
        const rest = P - lpDel - dispDel;
        const Ni = Math.max(1, Math.floor(rest - 0.5)), D = rest - Ni;
        const t = Math.tan(w0 * (1 - D) / 2), eta = t / (sw - t * cw);
        // gain per round trip: −60 dB at this pitch's T60, discounting the lowpass; always < 1 (stable)
        const g = Math.min(0.9995, Math.pow(10, -3 / (T60 * f)) / lpMag);
        const buf = st.buf, exc = st.exc, dx = st.dx, dy = st.dy;
        let w = st.w, ei = st.ei, apX = st.apX, apY = st.apY, lp = st.lp;
        for (let i = 0; i < N; i++) {
          const x = buf[(w - Ni) & M];
          const ap = eta * x + apX - eta * apY; apX = x; apY = ap;
          lp += a * (ap - lp);
          let v = lp;
          if (disp) for (let m = 0; m < 4; m++) { const y = c * v + dx[m] - c * dy[m]; dx[m] = v; dy[m] = y; v = y; }
          const y = g * v + (ei < exc.length ? exc[ei++] : 0);
          buf[w] = y; w = (w + 1) & M;
          ch[i] += y * lvl;
        }
        st.w = w; st.ei = ei; st.apX = apX; st.apY = apY; st.lp = lp;
      }
    }
  }
  // The pick: one period of noise, darkened by the velocity (two poles), with the comb
  // of the pluck position, DC-free and at a fixed level.
  _pluck(P, f, pos) {
    const L = Math.max(2, Math.round(P)), raw = new Float32Array(L), e = new Float32Array(L);
    const fc = Math.min(sampleRate * 0.45, f * Math.pow(2, STR_VEL_OCT[0] + (STR_VEL_OCT[1] - STR_VEL_OCT[0]) * this.vel));
    const a = 1 - Math.exp(-2 * Math.PI * fc / sampleRate);
    let l1 = 0, l2 = 0;
    for (let n = 0; n < L; n++) { l1 += a * ((this.rnd() * 2 - 1) - l1); l2 += a * (l1 - l2); raw[n] = l2; }
    const m = Math.max(1, Math.round(pos * L));
    let mean = 0;
    for (let n = 0; n < L; n++) { e[n] = raw[n] - (n >= m ? raw[n - m] : 0); mean += e[n]; }
    mean /= L;
    let pw = 0; for (let n = 0; n < L; n++) { e[n] -= mean; pw += e[n] * e[n]; }
    const k = pw > 0 ? STR_EXC_RMS / Math.sqrt(pw / L) : 0;
    for (let n = 0; n < L; n++) e[n] *= k;
    return e;
  }

  // Table morph: pair of adjacent frames, weight and loudness compensation
  // (the one in the 'wavetable' loop, here for sync). null without tables.
  _wtMorph(params) {
    const wt = this.wt; if (!wt) return null;
    const F = wt.frames.length;
    let pos = params.wtPos[0]; if (pos < 0) pos = 0; else if (pos > 1) pos = 1;
    const x = pos * (F - 1), fA = F > 1 ? Math.min(F - 2, x | 0) : 0, ff = F > 1 ? x - fA : 0;
    const fB = fA + 1 < F ? fA + 1 : fA;
    let gMix = 1;
    if (fB !== fA && wt.energia && wt.corr) {
      const Ea = wt.energia[fA], Eb = wt.energia[fB], c = wt.corr[fA];
      const mixE = (1 - ff) * (1 - ff) * Ea + ff * ff * Eb + 2 * ff * (1 - ff) * c;
      const target = (1 - ff) * Math.sqrt(Ea) + ff * Math.sqrt(Eb);
      gMix = mixE > 1e-6 ? Math.min(2, target / Math.sqrt(mixE)) : 2;
    }
    return { fA, fB, ff, gMix };
  }
}

registerProcessor('pulse-processor', PulseProcessor);
