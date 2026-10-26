/* =====================================================================
   SubSDJ · Steps (Roadmap 7.0 · 2.3) — the timbre moving in STEPS.
   Four lanes; each one, a row of values −1..+1 (st{i}Pat, «0.5 -1 0
   …», up to 32) with its own division, smoothing, rotation and rotation drift.
   Lanes of different lengths only line up again after many steps
   (16 · 12 · 5 → 240 sixteenths = 15 bars): complex while still being
   rhythmic. Each lane is a matrix SOURCE in two flavors:
     «Steps i»        continuous signal: each step change also moves a
                      held note (one ConstantSource per lane and engine,
                      scheduled in the common clock's look-ahead);
     «Steps i · note» the value of the step in which each note STARTS, fixed for the whole
                      note: correct in polyphony, with no step changes inside the
                      note (arpeggios, plucks).
   A lane's step at t comes from the COMMON CLOCK (engine/Clock.js): k =
   stepAt(t, division), so it is computed without scheduling anything — exact
   offline too — and falls on the grid of the Arp, the Seq and the conductor.
   Index in the pattern = (k + rotation + drift) mod length, with drift = one
   more step every N bars (Reich's phasing).
   Reset (stReset): 'play' = the Steps join the clock with the first
   note after a silence (if nothing else is running in tempo, that note is step 0) and
   leave it when everything goes quiet · 'never' = they follow the clock's origin even if you stop
   · '1 bar' … '8 bars' = they go back to step 0 every N bars.
   ===================================================================== */
import { clockOf } from './Clock.js';

export const ST_LANES = 4, ST_MAX = 32;
export const ST_DIVS = { '1/32': 0.125, '1/16T': 1 / 6, '1/16': 0.25, '1/8T': 1 / 3, '1/8': 0.5, '1/4T': 2 / 3, '1/4': 1, '1/2': 2, '1 bar': 4 };
export const ST_DRIFTS = { 'off': 0, '1 bar': 1, '2 bars': 2, '4 bars': 4, '8 bars': 8, '16 bars': 16 };
export const ST_RESETS = { 'play': -1, 'never': 0, '1 bar': 1, '2 bars': 2, '4 bars': 4, '8 bars': 8 };
const BAR = 4, LOOKAHEAD = 0.12, TICK_MS = 25, MICRO = 0.004;   // MICRO: the shortest ramp (a step change without a click)

// '0.5 -1 0 …' → values in [−1, 1] (an odd token is worth 0), at most ST_MAX
export function parseSteps(str) {
  return String(str || '').trim().split(/\s+/).filter(Boolean).slice(0, ST_MAX)
    .map(t => { const v = +t; return Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0; });
}
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
const lcm = (a, b) => a / gcd(a, b) * b;
// Bars it takes for EVERYTHING that sounds (lanes in use) to repeat: in
// ticks of 1/96 of a beat (integers for all divisions and triplets).
export function cycleBars(S, lanes) {
  let L = 0;
  for (const i of lanes) {
    const len = parseSteps(S['st' + i + 'Pat']).length, div = ST_DIVS[S['st' + i + 'Div']] || 0.25, n = ST_DRIFTS[S['st' + i + 'Drift']] || 0;
    if (!len) continue;
    let ticks = Math.round(len * div * 96);
    if (n) ticks = lcm(ticks, len * n * BAR * 96);       // the rotation wraps around after len · N bars
    L = L ? lcm(L, ticks) : ticks;
  }
  const R = ST_RESETS[S.stReset];
  if (R > 0 && L) L = Math.min(L, R * BAR * 96);       // the reset every N bars cuts the cycle short
  return L / (96 * BAR);
}

export class Steps {
  constructor(engine) {
    this.e = engine;
    this.src = [];             // i → ConstantSource of the continuous flavor (born on first use)
    this.lane = [];            // i → {nextB, nextT, epoch, prev}: the continuous flavor's scheduler
    this.timer = null;
    this._cache = {};          // i → {str, vals}
  }
  get clock() { return clockOf(this.e.ctx); }
  _vals(i) {
    const s = this.e.S['st' + i + 'Pat'], c = this._cache[i];
    if (c && c.str === s) return c.vals;
    const vals = parseSteps(s); this._cache[i] = { str: s, vals };
    return vals;
  }
  _div(i) { return ST_DIVS[this.e.S['st' + i + 'Div']] || 0.25; }
  // Does the matrix use any lane? (continuous, per note or both)
  usedLanes() {
    const S = this.e.S, out = new Set();
    for (let j = 1; j <= 6; j++) { const m = /^st(\d)n?$/.exec(S['mx' + j + 'src']); if (m && S['mx' + j + 'amt']) out.add(+m[1]); }
    return out;
  }
  // Value of lane i at the step containing t (no smoothing)
  valueAt(i, t) {
    const vals = this._vals(i), len = vals.length;
    if (!len) return 0;
    const S = this.e.S, clock = this.clock, div = this._div(i);
    let k = clock.stepAt(t, div);
    const R = ST_RESETS[S.stReset];
    if (R > 0) { const per = Math.round(R * BAR / div); k = ((k % per) + per) % per; }
    const n = ST_DRIFTS[S['st' + i + 'Drift']] || 0;
    const shift = n ? Math.floor(clock.beatAt(t + 1e-6) / (n * BAR)) : 0;
    const idx = (((k + Math.round(S['st' + i + 'Rot'] || 0) + shift) % len) + len) % len;
    return vals[idx];
  }
  playingStep(i) {             // for the panel's marker: index in the pattern sounding now
    if (!this.e.ctx || !this.clock.users.has(this)) return -1;
    const vals = this._vals(i), len = vals.length; if (!len) return -1;
    const S = this.e.S, t = this.e.ctx.currentTime, clock = this.clock, div = this._div(i);
    let k = clock.stepAt(t, div);
    const R = ST_RESETS[S.stReset];
    if (R > 0) { const per = Math.round(R * BAR / div); k = ((k % per) + per) % per; }
    const n = ST_DRIFTS[S['st' + i + 'Drift']] || 0, shift = n ? Math.floor(clock.beatAt(t) / (n * BAR)) : 0;
    return (((k + Math.round(S['st' + i + 'Rot'] || 0) + shift) % len) + len) % len;
  }

  // A note starts at t (the engine calls this BEFORE creating the voice). idle = nothing
  // was sounding: with reset 'play' it is «starting to play» and the clock is let go
  // and picked up again at t (if nothing else is running in tempo, t is step 0).
  noteOn(t, idle) {
    if (!this.usedLanes().size) return;
    const clock = this.clock;
    if (idle && this.e.S.stReset === 'play' && clock.users.has(this)) clock.leave(this);
    if (!clock.users.has(this)) clock.join(this, t, 0.25, this.e.bpm);
    if (this.src.some(Boolean)) this._run(t);
  }
  // All quiet (no voices or tails): with 'play', off the clock
  idle() {
    if (this.e.S.stReset === 'play') this.clock.leave(this);
    this._stop();
  }

  // Continuous flavor: lane i's source (requested by a voice's matrix)
  source(i, t) {
    if (!this.src[i]) {
      const ctx = this.e.ctx, c = ctx.createConstantSource();
      c.offset.value = this.clock.users.has(this) ? this.valueAt(i, ctx.currentTime) : 0; c.start();
      this.src[i] = c;
    }
    this._run(t);
    return this.src[i];
  }
  _run(t) {
    const ctx = this.e.ctx, clock = this.clock;
    if (!clock.users.has(this)) clock.join(this, t, 0.25, this.e.bpm);
    for (let i = 1; i <= ST_LANES; i++) {
      if (!this.src[i] || this.lane[i]) continue;
      const div = this._div(i), u = { prev: this.src[i].offset.value };
      u.nextB = clock.nextGridB(Math.max(t, ctx.currentTime), div); u.nextT = clock.swungTime(u.nextB, div); u.epoch = clock.epoch;
      this.lane[i] = u;
    }
    if (this.e.offline) { this._tick(ctx.length / ctx.sampleRate); return; }   // offline: everything at once, up to the end of the render
    this._tick();
    if (!this.timer) this.timer = setInterval(() => this._tick(), TICK_MS);
  }
  _stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } this.lane = []; }
  _tick(until = null) {
    const ctx = this.e.ctx, clock = this.clock, end = until !== null ? until : ctx.currentTime + LOOKAHEAD;
    for (let i = 1; i <= ST_LANES; i++) {
      const u = this.lane[i], src = this.src[i];
      if (!u || !src) continue;
      const div = this._div(i), sm = Math.max(0, Math.min(1, this.e.S['st' + i + 'Smooth'] || 0));
      if (until === null) clock.sync(u, div, this.e.bpm);
      const p = src.offset;
      while (u.nextT < end) {
        const v = this.valueAt(i, u.nextT + 1e-6), dur = clock.stepSecs(u, div);   // with swing, the real step
        const r = MICRO + sm * Math.max(0, dur - MICRO);
        p.setValueAtTime(u.prev, u.nextT); p.linearRampToValueAtTime(v, u.nextT + r);
        u.prev = v;
        clock.advance(u, div);
      }
    }
  }
}
