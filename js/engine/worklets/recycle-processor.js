/* =====================================================================
   SubSDJ · recycle-processor (AudioWorklet) — the Room's RECYCLER: an
   accompaniment made of pieces of what was just played.
   Not an echo: an echo repeats the past whole, in order, at its pitch. Here the
   last seconds are kept in a circular buffer and GRAINS are cut from it — from any
   point of that memory, at another pitch (reading faster or slower), some
   backwards — and scattered in stereo beside the dry sound, which is not touched.
   Only the past is read, so nothing is pre-generated and it runs live.
   Two ways of throwing the grains:
     · free (step = 0): `density` grains per second at random moments (a Poisson
       process: the gaps are exponential), each a Hann bell — a texture.
     · in tempo (step > 0): on every step of the grid a grain falls with
       probability `chance`, as a flat slice with short fades — a stepped counter-line.
   A grain that reads `rate` times faster covers len·rate of memory while len goes
   by: it must START at least that far back so its read head never catches the
   write head. Reversed grains read that same stretch from its end.
   Level: N = density·size grains overlap on average and add up in power, so each
   one goes at 1/√N (N ≥ 1): the accompaniment's level doesn't depend on Density.
   That also bounds the feedback (grains written back into the memory, so they get
   recycled again): energy per lap ≤ feedback² · 0.375 (the Hann's power) < 1.
   Deterministic (its own seeded generator): the same input gives the same output.
   ===================================================================== */
const BUF_SECS = 4.3;        // s of memory kept (the Memory knob goes up to 4)
const MAX_GRAINS = 48;       // grains alive at once (40 /s × 0.6 s × 1.3 = 31 at the very most)
const SLICE_FADE = 0.008;    // s: fades of a slice (in tempo)
const SIZE_JITTER = 0.3;     // free: each grain's length varies ± this fraction
const PAN_WIDTH = 0.8;       // how far from the center a grain may fall (1 = hard left/right)
// the pitches a grain may take (read speeds): the Pitch selector
const SETS = { uni: [1], sub: [1, 1, 0.5], oct: [2, 2, 4], fifth: [1, 2, 2, 1.5], high: [2, 2, 3, 4] };

class RecycleProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const k = (name, defaultValue, minValue, maxValue) => ({ name, defaultValue, minValue, maxValue, automationRate: 'k-rate' });
    return [k('density', 8, 0.1, 60), k('chance', 0.6, 0, 1), k('size', 0.09, 0.005, 1), k('memory', 2, 0.05, 4),
            k('reverse', 0.2, 0, 1), k('feedback', 0, 0, 0.95), k('step', 0, 0, 4)];
  }
  constructor() {
    super();
    this.N = Math.ceil(BUF_SECS * sampleRate);
    this.bL = new Float32Array(this.N); this.bR = new Float32Array(this.N);
    this.w = 0;                                   // samples written so far (absolute: index = w mod N)
    this.next = 0;                                // free: samples until the next grain
    this.set = SETS.oct; this.seed = 0x2545F491; this.stopped = false;
    const G = MAX_GRAINS;
    this.on = new Uint8Array(G); this.rp = new Float64Array(G); this.inc = new Float32Array(G);
    this.i = new Int32Array(G); this.len = new Int32Array(G); this.gL = new Float32Array(G); this.gR = new Float32Array(G);
    this.slice = new Uint8Array(G);
    this.port.onmessage = e => {
      if (e.data === 'stop') this.stopped = true;
      else if (e.data === 'clear') { this.bL.fill(0); this.bR.fill(0); this.on.fill(0); }   // panic: forget everything, grains included
      else if (e.data && SETS[e.data.pitch]) this.set = SETS[e.data.pitch];
    };
  }
  rnd() { let s = this.seed; s ^= s << 13; s ^= s >>> 17; s ^= s << 5; this.seed = s >>>= 0; return s / 4294967296; }

  // a grain that starts `off` samples into this block (i < 0 until then)
  spawn(off, p, free) {
    let g = 0; while (g < MAX_GRAINS && this.on[g]) g++;
    if (g === MAX_GRAINS) return;
    const rate = this.set[Math.floor(this.rnd() * this.set.length)];
    let secs = p.size * (free ? 1 - SIZE_JITTER + 2 * SIZE_JITTER * this.rnd() : 1);
    if (!free) secs = Math.min(secs, p.step * 0.95);
    const len = Math.max(32, Math.round(secs * sampleRate)), span = len * rate;
    const mem = Math.min(p.memory * sampleRate, this.N - span - 512);
    const back = span + 2 + this.rnd() * Math.max(0, mem - span), start = this.w + off - back;
    const rev = this.rnd() < p.reverse, pan = (this.rnd() * 2 - 1) * PAN_WIDTH;
    const lvl = free ? 1 / Math.sqrt(Math.max(1, p.density * p.size)) : 1;
    this.on[g] = 1; this.i[g] = -off; this.len[g] = len; this.slice[g] = free ? 0 : 1;
    this.rp[g] = rev ? start + span : start; this.inc[g] = rev ? -rate : rate;
    this.gL[g] = lvl * Math.cos((pan + 1) * Math.PI / 4); this.gR[g] = lvl * Math.sin((pan + 1) * Math.PI / 4);
  }

  process(inputs, outputs, params) {
    const out = outputs[0];
    if (!out || !out.length) return !this.stopped;
    const oL = out[0], oR = out[1] || out[0], n = oL.length, inp = inputs[0];
    const iL = inp && inp[0], iR = inp && (inp[1] || inp[0]);
    const p = { density: params.density[0], chance: params.chance[0], size: params.size[0], memory: params.memory[0],
                reverse: params.reverse[0], step: params.step[0] };
    const fb = params.feedback[0], N = this.N, bL = this.bL, bR = this.bR;

    // --- which grains start in this block ---
    if (p.step > 0) {                             // in tempo: the grid is anchored at frame 0 of the audio clock
      const st = p.step * sampleRate, k = Math.ceil(currentFrame / st), off = Math.floor(k * st - currentFrame);   // floor: a step at 127.6 belongs to THIS block (rounding it to 128 lost it)
      if (off < n && this.rnd() < p.chance) this.spawn(off, p, false);
      this.next = 0;
    } else {
      while (this.next < n) {
        this.spawn(Math.floor(this.next), p, true);
        this.next += Math.min(4, -Math.log(1 - this.rnd())) * sampleRate / p.density;   // exponential gaps, capped at 4 averages
      }
      this.next -= n;
    }

    // --- the grains, then the memory ---
    for (let s = 0; s < n; s++) { oL[s] = 0; if (oR !== oL) oR[s] = 0; }
    const nf = Math.round(SLICE_FADE * sampleRate);
    for (let g = 0; g < MAX_GRAINS; g++) {
      if (!this.on[g]) continue;
      const len = this.len[g], inc = this.inc[g], gL = this.gL[g], gR = this.gR[g], slice = this.slice[g];
      let i = this.i[g], rp = this.rp[g];
      for (let s = 0; s < n; s++, i++) {
        if (i < 0) continue;
        if (i >= len) break;
        const w = slice ? Math.min(1, i / nf, (len - 1 - i) / nf) : 0.5 - 0.5 * Math.cos(2 * Math.PI * i / len);
        const q = rp + i * inc, k = Math.floor(q), fr = q - k, a = ((k % N) + N) % N, b = a + 1 === N ? 0 : a + 1;
        const l = (bL[a] + (bL[b] - bL[a]) * fr) * w, r = (bR[a] + (bR[b] - bR[a]) * fr) * w;
        oL[s] += l * gL; if (oR !== oL) oR[s] += r * gR; else oL[s] += r * gR;
      }
      this.i[g] = i; if (i >= len) this.on[g] = 0;
    }
    let w = this.w % N;
    for (let s = 0; s < n; s++) {                 // memory = what comes in + the grains fed back (bounded: tanh)
      bL[w] = (iL ? iL[s] : 0) + (fb ? fb * Math.tanh(oL[s]) : 0);
      bR[w] = (iR ? iR[s] : 0) + (fb ? fb * Math.tanh(oR[s]) : 0);
      if (++w === N) w = 0;
    }
    this.w += n;
    return !this.stopped;
  }
}
registerProcessor('recycle-processor', RecycleProcessor);
