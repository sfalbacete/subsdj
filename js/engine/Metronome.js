/* =====================================================================
   SubSDJ · Metronome and tap tempo (2026-11-08) — the tempo tools of the
   keyboard bar, for playing and recording in time with nothing else running.
   METRONOME: a click on every beat of the COMMON CLOCK (engine/Clock.js),
   the first of each bar accented (bar = 4 beats, as the conductor and the
   Steps count). Same scheduler as the Arp/Seq: a 25 ms setInterval that only
   WAKES it; the clicks are scheduled on the audio clock with a 120 ms
   look-ahead. It is one more USER of the clock: switched on with nothing
   else in tempo, it sets the grid (its first click is beat 0) and the next
   Arp, Seq or Steps land on it; switched on while a phrase loops, it lands
   on the phrase's grid and counts ITS bars. When the conductor starts it
   anchors a new origin and the click moves to the conductor's bars, as the
   Arp/Seq do (Clock.sync).
   The BPM is the Room's (shared by the parts), read on every tick: a change
   — the clock cell, a preset, the tap — reaches the click from the current
   beat, with no jump (the clock re-anchors at the beat of now).
   The click goes STRAIGHT to the destination, not through the Room: no echo,
   no reverb, the limiter does not duck the music for it, and the WAV
   recorder (which hangs off the analyser) does not hear it.
   The sound: a short sine burst, higher and louder on the 1 — the tick of a
   drum machine's click, not a tone. Constants below.
   Offline (selftest): scheduleAll(secs, t0) schedules the whole stretch at
   once, on whatever grid the clock has.
   TAP TEMPO: tap(now) with the instant (ms) of each press returns the BPM
   once there are TAP_MIN presses: the MEDIAN of the last intervals (a stray
   press does not pull it), whole beats, clamped to the Room's range; a pause
   longer than TAP_RESET_MS starts a new count. Pure: no DOM, no audio.
   ===================================================================== */
import { clockOf } from './Clock.js';
import { PARAMS } from './params.js';

const BAR = 4;                                    // beats per bar (4/4)
const LOOKAHEAD = 0.12, TICK_MS = 25;             // as the Arp/Seq: wake every 25 ms, schedule 120 ms ahead
export const CLICK_HZ = 1000, ACCENT_HZ = 1500;   // the beat and the 1
const CLICK_GAIN = 0.25, ACCENT_GAIN = 0.4;       // linear (−12 / −8 dB): heard over a mix, under a lead
const CLICK_S = 0.025;                            // decay to −60 dB: a tick, not a beep
const CLICK_RAMP = 0.001;                         // attack: without it the sine starts with a step and thumps
const QUEUE_MAX = 16;                             // scheduled clicks kept for the UI's beat light

export class Metronome {
  constructor(ctx, bpmOf) {
    this.ctx = ctx; this.bpmOf = bpmOf;           // bpmOf: () → the Room's BPM (read on every tick)
    this.timer = null;
    this.nextB = 0; this.nextT = 0; this.epoch = 0;   // the step the clock keeps for its users (Clock.begin / sync / advance)
    this.queue = [];                              // {t, bar}: scheduled clicks the UI reads to light the beat
  }
  get running() { return !!this.timer; }
  start() {
    if (this.timer) return;
    clockOf(this.ctx).begin(this, this.ctx.currentTime + 0.03, 1, this.bpmOf());   // alone: beat 0 now; with others: their grid
    this.queue = [];
    this.timer = setInterval(() => this._tick(), TICK_MS);
    this._tick();                                 // the first click now, not when the first interval arrives
  }
  stop() {
    if (!this.timer) return;
    clearInterval(this.timer); this.timer = null; this.queue = [];
    clockOf(this.ctx).leave(this);
  }
  _tick() {
    const clock = clockOf(this.ctx), now = this.ctx.currentTime;
    clock.sync(this, 1, this.bpmOf());            // the Room's tempo; a new origin (the conductor) relocates the step
    while (this.nextT < now + LOOKAHEAD) {
      const bar = ((Math.round(this.nextB) % BAR) + BAR) % BAR === 0;
      this.click(this.nextT, bar);
      this.queue.push({ t: this.nextT, bar }); if (this.queue.length > QUEUE_MAX) this.queue.shift();
      clock.advance(this, 1);
    }
  }
  // One click at t (audio time): a sine burst, higher and louder on the 1, straight to the output
  click(t, accent) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = accent ? ACCENT_HZ : CLICK_HZ;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(accent ? ACCENT_GAIN : CLICK_GAIN, t + CLICK_RAMP);
    g.gain.exponentialRampToValueAtTime(0.001, t + CLICK_RAMP + CLICK_S);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + CLICK_RAMP + CLICK_S + 0.005);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }
  // The click that has JUST sounded ({t, bar}), once, for the UI's beat light; null if none since the last call
  beatNow() {
    const now = this.ctx.currentTime; let hit = null;
    while (this.queue.length && this.queue[0].t <= now) hit = this.queue.shift();
    return hit;
  }
  // Offline: every beat of the clock's grid from t0 for `secs` seconds, at once
  scheduleAll(secs, t0 = 0) {
    const clock = clockOf(this.ctx);
    for (let b = clock.nextGridB(t0, 1); clock.timeAt(b) < t0 + secs - 1e-9; b++) this.click(clock.timeAt(b), ((b % BAR) + BAR) % BAR === 0);
  }
}

// ---------- tap tempo ----------
export const TAP_MIN = 3;          // presses before a tempo comes out (two intervals)
export const TAP_KEEP = 6;         // presses kept: the median of the last 5 intervals
export const TAP_RESET_MS = 2000;  // a longer pause starts a new count (40 BPM = 1500 ms between taps still counts)

export class TapTempo {
  constructor({ lo = PARAMS.bpm.min, hi = PARAMS.bpm.max } = {}) { this.lo = lo; this.hi = hi; this.times = []; }
  get count() { return this.times.length; }
  reset() { this.times = []; }
  // A press at `now` (ms, any monotonic clock). The BPM from TAP_MIN presses on, else null.
  tap(now) {
    const last = this.times[this.times.length - 1];
    if (last !== undefined && now - last > TAP_RESET_MS) this.times = [];
    this.times.push(now);
    if (this.times.length > TAP_KEEP) this.times.shift();
    if (this.times.length < TAP_MIN) return null;
    const iv = this.times.slice(1).map((t, i) => t - this.times[i]).sort((a, b) => a - b), n = iv.length;
    const med = n % 2 ? iv[(n - 1) / 2] : (iv[n / 2 - 1] + iv[n / 2]) / 2;   // the median: one early or late press does not pull it
    return Math.max(this.lo, Math.min(this.hi, Math.round(60000 / med)));
  }
}
