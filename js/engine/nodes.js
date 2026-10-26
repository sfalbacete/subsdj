/* =====================================================================
   SubSDJ · auxiliary nodes of the graph: noise and drift buffers, reverb
   IR, distortion curve and LFOs (used by AudioEngine.js and Room.js).
   ===================================================================== */
import { mulberry32 } from './Harmony.js';
// --- Per-context randomness (Roadmap 7.0 · 7.1) ---
// Live, Math.random: every note different, as always. In an OFFLINE render
// (selftest, SFZ, fingerprints), a seeded mulberry32, one per context: the same
// script gives the same samples. All the engine's randomness comes from here:
// the noise, the reverb IR, the Vocal's Life and Bite, the per-note S&H, the
// random Arp and — through the seed each oscillator receives — the free phases
// and the drift of the worklet. seedRender(ctx, s) BEFORE creating the engine
// picks another roll (variations of the same sound: round robin).
export const RENDER_SEED = 0x5eed7;
const rngCache = new WeakMap();
export function seedRender(ctx, seed) { rngCache.set(ctx, mulberry32(seed | 0)); }
export function ctxRandom(ctx) {
  let r = rngCache.get(ctx);
  if (!r) { r = typeof ctx.startRendering === 'function' ? mulberry32(RENDER_SEED) : Math.random; rngCache.set(ctx, r); }
  return r;
}
export function makeNoise(ctx) {
  const len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0), rnd = ctxRandom(ctx);
  for (let i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
  return b;
}
// SLOW drift normalized to ±1 for the 'Life' of the Vocal module: sum of 4
// sub-Hz sines with WHOLE cycles in the buffer (seamless loop — a plain random
// walk would give a formant jump on every lap) and random phases. Shared:
// each voice reads it from a random offset (decorrelated).
export function makeWander(ctx) {
  const secs = 8, len = ctx.sampleRate * secs, b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0), rnd = ctxRandom(ctx);
  const comps = [3, 5, 7, 11].map(k => ({ w: 2 * Math.PI * k / secs, ph: rnd() * 2 * Math.PI, a: 1 / k }));
  let pk = 0;
  for (let i = 0; i < len; i++) {
    const t = i / ctx.sampleRate;
    let v = 0; for (const c of comps) v += c.a * Math.sin(c.w * t + c.ph);
    d[i] = v; const x = Math.abs(v); if (x > pk) pk = x;
  }
  if (pk > 1e-9) for (let i = 0; i < len; i++) d[i] /= pk;
  return b;
}
// Synthetic impulse response for the reverb (decaying noise, decorrelated
// stereo). damp (0..1) = frequency-dependent decay: a one-pole lowpass whose
// cutoff CLOSES exponentially along the tail (14 kHz -> down to 200 Hz at max),
// as in a real room. The energy is renormalized to that of the unfiltered IR:
// the knob darkens, it doesn't lower the wet.
export function makeIR(ctx, seconds, decay, damp = 0) {
  const rate = ctx.sampleRate, len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  const fMax = 14000, fMin = fMax * Math.pow(200 / fMax, damp), rnd = ctxRandom(ctx);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0, expEnergy = 0, actEnergy = 0;
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, decay);
      const x = (rnd() * 2 - 1) * env;
      if (damp > 0) {
        const fc = fMax * Math.pow(fMin / fMax, i / len);
        const a = 1 - Math.exp(-6.2832 * fc / rate);
        y += a * (x - y);
        d[i] = y;
      } else d[i] = x;
      expEnergy += env * env; actEnergy += d[i] * d[i];
    }
    if (damp > 0 && actEnergy > 1e-12) {
      const g = Math.sqrt(expEnergy / 3 / actEnergy);   // E[x²] of the U(-1,1)·env noise = env²/3
      for (let i = 0; i < len; i++) d[i] *= g;
    }
  }
  return buf;
}
// FIXED saturation curve (tanh). It used to be regenerated on every gesture of the
// Drive knob: one Float32Array(1024) per event, and swapping the curve could click.
// Now the drive lives in the input gain (distPre) and the normalization (distPost).
export function makeDistCurve() {
  const n = 1024, c = new Float32Array(n), k = 4;
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return c;
}
// --- LFO shapes an OscillatorNode doesn't have: S&H and drift ('sh', 'drift') ---
// They are looped BUFFERS read by an AudioBufferSourceNode; the knob's speed is
// their playbackRate. Time unit of the buffer: 0.1 s at 8 kHz (a control signal:
// plenty), so rate = hz / 10 → one step (S&H) or ~one swing (drift) per LFO
// period. S&H: 128 random steps (at 2 Hz the pattern takes 64 s to repeat).
// Drift: sum of 5 sines with WHOLE CYCLES in the loop (24, 40, 56, 88, 104 cycles
// over 64 units = 0.375…1.625 × f), random phases, 1/f amplitude, normalized to
// ±1: continuous and seamless when it wraps around (a plain random walk would
// jump). Fixed seed (mulberry32): reproducible renders. One set of buffers per
// context, shared by all the LFOs; each one starts at a different offset
// (decorrelated).
export const LFO_ALT = ['sh', 'drift'];
const LFO_SR = 8000, LFO_UNIT = 0.1, SH_STEPS = 128, DRIFT_UNITS = 64;
const lfoBufCache = new WeakMap();
export function lfoBuffers(ctx) {
  let b = lfoBufCache.get(ctx);
  if (b) return b;
  const rnd = mulberry32(0x5eed1f0), uLen = Math.round(LFO_SR * LFO_UNIT);
  const sh = ctx.createBuffer(1, uLen * SH_STEPS, LFO_SR), ds = sh.getChannelData(0);
  for (let k = 0; k < SH_STEPS; k++) ds.fill(rnd() * 2 - 1, k * uLen, (k + 1) * uLen);
  const dLen = uLen * DRIFT_UNITS, drift = ctx.createBuffer(1, dLen, LFO_SR), dd = drift.getChannelData(0);
  const comps = [24, 40, 56, 88, 104].map(c => ({ w: 2 * Math.PI * c / dLen, ph: rnd() * 2 * Math.PI, a: 24 / c }));
  let pk = 0;
  for (let i = 0; i < dLen; i++) { let v = 0; for (const c of comps) v += c.a * Math.sin(c.w * i + c.ph); dd[i] = v; if (Math.abs(v) > pk) pk = Math.abs(v); }
  for (let i = 0; i < dLen; i++) dd[i] /= pk;
  // Native shapes as buffers of ONE period (1 s at LFO_SR → rate = hz) for the
  // PER-VOICE LFOs: a looped buffer accepts a start phase (start offset), an
  // OscillatorNode doesn't. Same phases as the native oscillator (sin/tri/saw/sqr
  // start at 0, 0, 0, +1), so «per voice» with phase 0 sounds like the global one.
  const per = LFO_SR, mk = f => { const buf = ctx.createBuffer(1, per, LFO_SR), d = buf.getChannelData(0); for (let i = 0; i < per; i++) d[i] = f(i / per); return buf; };
  b = { sh, drift, rnd, unit: LFO_UNIT, seq: 0,
        sine: mk(x => Math.sin(2 * Math.PI * x)),
        triangle: mk(x => x < 0.25 ? 4 * x : x < 0.75 ? 2 - 4 * x : 4 * x - 4),
        sawtooth: mk(x => x < 0.5 ? 2 * x : 2 * x - 2),
        square: mk(x => x < 0.5 ? 1 : -1) };
  lfoBufCache.set(ctx, b);
  return b;
}
// --- PER-VOICE LFO (Roadmap 5.0 · block 2: per-voice phase and per-voice drift) ---
// Why: the engine's LFOs are ONE per engine, so a chord breathes as a block.
// With lfoPhase 'voice' each voice carries its own copies (cut/res/freq/pwm/pan)
// started at a different PHASE; and the matrix source «Drift (voice)» is a slow
// walk of each voice's own. Each voice's phase comes from the Weyl sequence
// k·φ mod 1 (φ = golden ratio): deterministic (reproducible renders and SFZ; the
// selftest can measure it) and maximally spread (two consecutive notes never
// land close together; voice 0 = phase 0 = the usual sound).
// The six shapes are looped buffers (sin/tri/saw/sqr: rate = hz; S&H/drift:
// rate = hz·unit, like the global alternative LFO). The counter lives per
// context (lfoBuffers): the parts of a scene share the sequence.
export const LFO_WEYL = 0.6180339887498949;
export function nextVoicePhase(ctx) { const b = lfoBuffers(ctx); return (b.seq++ * LFO_WEYL) % 1; }
const voiceRate = (b, shape, hz) => LFO_ALT.includes(shape) ? hz * b.unit : hz;
// once («once», Roadmap 7.0 · 2.2): the buffer plays WITHOUT loop — one cycle from
// the start phase, then it goes silent at its end (sin/tri/saw end at 0); S&H and
// drift have no end and keep looping.
export function mkVoiceLFO(ctx, shape, hz, depth, t0, phase, once = false) {
  const out = ctx.createGain(), gain = ctx.createGain(); gain.gain.value = depth; out.connect(gain);
  const lfo = { out, depth: gain, src: null, shape: null, hz, t0, phase, born: false, once };
  setVoiceLfoShape(ctx, lfo, shape);
  return lfo;
}
// Current phase = the birth one + what has elapsed since the last anchor: changing
// shape or speed mid-note doesn't restart the cycle. NOT wrapped: in «once», 1 or
// more = the cycle is already over.
const phaseNow = (lfo, now) => lfo.phase + lfo.hz * Math.max(0, now - lfo.t0);
const onceOf = (lfo, shape) => lfo.once && !LFO_ALT.includes(shape);
export function setVoiceLfoShape(ctx, lfo, shape) {
  if (lfo.shape === shape) return;
  const b = lfoBuffers(ctx), now = ctx.currentTime;
  if (lfo.born) { lfo.phase = phaseNow(lfo, now); lfo.t0 = Math.max(now, lfo.t0); }
  if (lfo.src) { try { lfo.src.stop(); lfo.src.disconnect(); } catch (e) {} lfo.src = null; }
  lfo.shape = shape; lfo.born = true;
  const once = onceOf(lfo, shape);
  if (once && lfo.phase >= 1) return;                  // «once» and it already ran its cycle: it stays at its end
  const src = ctx.createBufferSource();
  src.buffer = b[shape] || b.sine; src.loop = !once;
  src.playbackRate.value = voiceRate(b, shape, lfo.hz);
  src.connect(lfo.out);
  src.start(Math.max(now, lfo.t0), (once ? lfo.phase : lfo.phase % 1) * src.buffer.duration);
  lfo.src = src;
}
export function setVoiceLfoRate(ctx, lfo, hz, t) {
  const now = ctx.currentTime;
  lfo.phase = phaseNow(lfo, now); if (!onceOf(lfo, lfo.shape)) lfo.phase %= 1;
  lfo.t0 = Math.max(now, lfo.t0); lfo.hz = hz;   // anchors the phase before changing the speed
  if (lfo.src) lfo.src.playbackRate.setTargetAtTime(voiceRate(lfoBuffers(ctx), lfo.shape, hz), t, 0.02);
}
export function stopVoiceLFO(lfo) {
  if (!lfo) return;
  if (lfo.src) { try { lfo.src.stop(); } catch (e) {} try { lfo.src.disconnect(); } catch (e) {} }
  try { lfo.out.disconnect(); } catch (e) {} try { lfo.depth.disconnect(); } catch (e) {}
}
// LFO: native oscillator (sin/tri/saw/sqr) or a looped BUFFER — always for S&H and
// drift; for any shape IN TEMPO (Roadmap 7.0 · 2.2), because a buffer accepts a
// start phase and an OscillatorNode doesn't. Everything poured into `out` (±1, raw):
// whoever consumes the LFO (depth, the matrix) hangs off `out` and never learns
// which source is behind it. The oscillator goes through a gate: the source switch
// is scheduled LFO_SWITCH ahead and lands on an exact sample, with no gap.
const LFO_SWITCH = 0.02;
export function mkLFO(ctx, freq, depth) {
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
  const gate = ctx.createGain(), out = ctx.createGain();
  const gain = ctx.createGain(); gain.gain.value = depth;
  osc.connect(gate); gate.connect(out); out.connect(gain); osc.start();
  // Always hooked to the output (gain 0): Chrome does NOT process what doesn't reach the
  // destination, and an unprocessed oscillator doesn't advance its phase — the «global» LFO
  // stayed frozen between notes and started where it had stopped when a voice hooked it
  // (measured 2026-10-20: two notes at 0 and at 0.37 s moved the same). This way it truly
  // runs free and, in tempo, stays on the grid even when nothing is playing.
  const keep = ctx.createGain(); keep.gain.value = 0; out.connect(keep); keep.connect(ctx.destination);
  return { osc, gate, out, depth: gain, keep, alt: null, shape: 'sine', hz: freq, sync: 0, clock: null, born: ctx.currentTime };
}
// Rebuilds the source: with sync, the buffer starts at the phase it is due in the
// shared clock (phase 0 at beat 0 of the origin: the cycle lands on the grid).
function relinkLfo(ctx, lfo) {
  const isAlt = LFO_ALT.includes(lfo.shape), useBuf = isAlt || lfo.sync > 0;
  const t0 = ctx.currentTime <= lfo.born ? ctx.currentTime : ctx.currentTime + LFO_SWITCH;   // newborn (engine start-up): nothing is playing that needs handing over
  if (lfo.alt) { const o = lfo.alt; try { o.stop(t0); } catch (e) {} o.onended = () => { try { o.disconnect(); } catch (e) {} }; lfo.alt = null; }
  if (!useBuf) { lfo.osc.type = lfo.shape; lfo.gate.gain.setValueAtTime(1, t0); return; }
  const b = lfoBuffers(ctx), src = ctx.createBufferSource();
  src.buffer = isAlt ? (lfo.shape === 'sh' ? b.sh : b.drift) : (b[lfo.shape] || b.sine); src.loop = true;
  src.playbackRate.value = isAlt ? lfo.hz * b.unit : lfo.hz;
  const d = src.buffer.duration;
  let off = b.rnd() * d;                                    // free: any point (S&H / drift decorrelated)
  if (lfo.sync > 0) { const cyc = lfo.clock.beatAt(t0) / lfo.sync; off = isAlt ? cyc * b.unit : cyc * d; off = ((off % d) + d) % d; }
  src.connect(lfo.out); src.start(t0, off);
  lfo.alt = src; lfo.gate.gain.setValueAtTime(0, t0);
}
export function setLfoRate(lfo, hz, t) {          // Speed knob: to the oscillator and, if there is one, to the buffer source
  lfo.hz = hz;
  lfo.osc.frequency.setTargetAtTime(hz, t, 0.02);
  if (lfo.alt) lfo.alt.playbackRate.setTargetAtTime(LFO_ALT.includes(lfo.shape) ? hz * lfoBuffers(lfo.alt.context).unit : hz, t, 0.02);
}
export function setLfoShape(ctx, lfo, shape) {
  if (lfo.shape === shape) return;
  lfo.shape = shape; relinkLfo(ctx, lfo);
}
// In tempo: beats = beats per cycle (0 = free), hz = the speed that applies. Also
// called when the clock changes (BPM or origin) to get back onto the grid.
export function setLfoSync(ctx, lfo, beats, clock, hz) {
  const was = lfo.sync;
  lfo.sync = beats || 0; lfo.clock = clock; lfo.hz = hz;
  lfo.osc.frequency.setValueAtTime(hz, ctx.currentTime);
  if (lfo.sync || was) relinkLfo(ctx, lfo);
}
// Sine LFO with a start phase (OscillatorNodes don't have one): a PeriodicWave
// with sin(wt+phi) = sin(phi)·cos(wt) + cos(phi)·sin(wt). For the 3-phase ensemble.
export function mkPhasedLFO(ctx, freq, depth, phaseDeg) {
  const ph = phaseDeg * Math.PI / 180;
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(ctx.createPeriodicWave(
    new Float32Array([0, Math.sin(ph)]),
    new Float32Array([0, Math.cos(ph)]),
    { disableNormalization: true }));
  osc.frequency.value = freq;
  const gain = ctx.createGain(); gain.gain.value = depth;
  osc.connect(gain); osc.start();
  return { osc, depth: gain };
}
