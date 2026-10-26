/* =====================================================================
   SubSDJ · shared clock (Roadmap 7.0 · 0.4) — one grid for everything that
   runs in tempo within an audio context: the conductor (Parts), and the
   arpeggiator and sequencer of each engine (and whatever comes: tempo LFO,
   Steps, swing).
   What it is: the ORIGIN (audio time of beat 0) and the BPM. The beat at t
   is (t − origin)/(60/bpm); the grid of `div` beats is its multiples.
   Why: before, each one started its own clock on key press (now + 30 ms)
   and added up durations; the conductor counted with another one. Two
   arpeggios on two parts, or a player playing a part with the Arp on, landed
   wherever the timer happened to fire — off the bar.
   Who rules: the conductor ANCHORS the origin when it starts (its beat 0).
   Without it, the first one to start running in tempo sets it on its first
   note (with no added delay, as always) and those who join go to the grid;
   the origin is kept while someone is still in tempo. A BPM change
   re-anchors at the beat of NOW: the position does not jump.
   One per context (the parts of a scene share a context).
   SWING (Roadmap 7.0 · 5.4): in each PAIR of steps of a binary grid of an
   eighth or shorter (1/8, 1/16, 1/32), the second one arrives late: it lands
   at the `swing` fraction of the pair (0.5 = straight, 0.667 = triplet,
   0.75 = dotted); the pair keeps its length, so the first gets longer and
   the second shorter. The clock applies it to everyone (Arp, Seq, Steps and
   players): everything swings the same. Quarters and triplets don't swing
   (that's not swing).
   ===================================================================== */
const TOL = 1e-6;   // s: less than one sample — an instant already on the grid doesn't jump to the next point

export class Clock {
  constructor(ctx) {
    this.ctx = ctx;
    this.origin = 0;          // audio time of beat 0
    this.bpm = 120;
    this.users = new Set();   // who is running in tempo now (Arp, Seq, conductor)
    this.epoch = 0;           // goes up each time the origin is set anew (earlier beats are no longer valid)
    this.listeners = new Set();   // notices of a BPM or origin change (tempo LFOs relocate)
    this.swing = 0.5;             // fraction of the pair where the 2nd step lands (0.5 = straight)
  }
  // Does this grid swing? (in beats: 1/8 = 0.5, 1/16 = 0.25, 1/32 = 0.125)
  swings(div) { return this.swing > 0.5 && (Math.abs(div - 0.5) < 1e-9 || Math.abs(div - 0.25) < 1e-9 || Math.abs(div - 0.125) < 1e-9); }
  // Delay (in beats) of the `div` step that starts at beat b: the odd ones of the pair arrive late
  swingDelay(b, div) { return this.swings(div) && Math.round(b / div) % 2 !== 0 ? (this.swing - 0.5) * 2 * div : 0; }
  // Real length (in beats) of that step: the 1st of the pair gets longer and the 2nd shorter
  swingLen(b, div) { return !this.swings(div) ? div : (Math.round(b / div) % 2 !== 0 ? 1 - this.swing : this.swing) * 2 * div; }
  // Time of the step that starts at beat b, swung
  swungTime(b, div) { return this.timeAt(b + this.swingDelay(b, div)); }
  listen(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _changed() { for (const f of this.listeners) { try { f(this); } catch (e) { console.error(e); } } }
  beatLen() { return 60 / this.bpm; }
  beatAt(t) { return (t - this.origin) / this.beatLen(); }
  timeAt(beat) { return this.origin + beat * this.beatLen(); }
  // Beat of the first step of the `div`-beat grid that sounds at t or later (swung)
  nextGridB(t, div) {
    let k = Math.ceil((t - this.origin - TOL) / (div * this.beatLen()));
    if (this.swings(div)) { k--; while (this.swungTime(k * div, div) < t - TOL) k++; }   // a delayed odd step can still land after t
    return k * div;
  }
  // First point of the `div`-beat grid at t or later
  nextGrid(t, div) { const b = this.nextGridB(t, div); return this.swungTime(b, div); }
  // Index of the `div`-beat step that contains t (with swing, the odd one starts late)
  stepAt(t, div) {
    const x = (t - this.origin + TOL) / (div * this.beatLen());
    if (!this.swings(div)) return Math.floor(x);
    const pair = Math.floor(x / 2);
    return 2 * pair + (x - 2 * pair >= 2 * this.swing ? 1 : 0);
  }
  setBpm(bpm, now = this.ctx.currentTime) {
    if (!(bpm > 0) || bpm === this.bpm) return;
    const b = this.beatAt(now);
    this.bpm = bpm; this.origin = now - b * this.beatLen();
    this._changed();
  }
  // Start running in tempo at t: returns the time of the first step.
  join(user, t, div, bpm) {
    if (!this.users.size) { this.bpm = bpm > 0 ? bpm : this.bpm; this.origin = t; this.epoch++; this._changed(); }
    else this.setBpm(bpm, t);
    this.users.add(user);
    return this.nextGrid(t, div);
  }
  // The conductor: its beat 0 is t, and it rules the grid of the others
  anchor(user, t, bpm) { this.bpm = bpm > 0 ? bpm : this.bpm; this.origin = t; this.epoch++; this.users.add(user); this._changed(); }
  leave(user) { this.users.delete(user); }

  // --- The step of whoever runs on the grid (Arp, Seq): u.nextB = beat of the
  // next step, u.nextT = its time. It is stored in BEATS: a new BPM (which
  // re-anchors at the beat of now) remaps the remaining steps without jumps.
  // If the origin is set anew (the conductor starts), the old beats are not
  // valid: the step is relocated to the first point of the new grid. ---
  begin(u, t, div, bpm) { this.join(u, t, div, bpm); u.nextB = this.nextGridB(t, div); u.nextT = this.swungTime(u.nextB, div); u.epoch = this.epoch; }
  sync(u, div, bpm) {
    const now = this.ctx.currentTime;
    if (bpm) this.setBpm(bpm, now);   // the right tempo (the Room's), wherever the change comes from
    if (u.epoch !== this.epoch) { u.nextB = this.nextGridB(u.nextT, div); u.epoch = this.epoch; }
    u.nextT = this.swungTime(u.nextB, div);
    if (u.nextT < now) { u.nextB = this.nextGridB(now + 0.01, div); u.nextT = this.swungTime(u.nextB, div); }   // it fell behind (hidden tab)
  }
  advance(u, div) { u.nextB = (Math.floor(u.nextB / div + 1e-9) + 1) * div; u.nextT = this.swungTime(u.nextB, div); }   // with another division, to the next multiple
  // How long (in s) the step due for `u` really lasts (with swing, the pair is split unevenly)
  stepSecs(u, div) { return this.swingLen(u.nextB, div) * this.beatLen(); }
}

const clocks = new WeakMap();
export function clockOf(ctx) {
  let c = clocks.get(ctx);
  if (!c) { c = new Clock(ctx); clocks.set(ctx, c); }
  return c;
}

// Division of the selectors (Arp, Seq, wave sequence) in beats
export const DIV_BEATS = { '1/4': 1, '1/8': 0.5, '1/16': 0.25 };
