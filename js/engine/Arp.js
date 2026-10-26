/* =====================================================================
   SubSDJ · arpeggiator.
   When arpMode != 'off', the engine's noteOn/noteOff divert the
   notes here (hold/unhold). A 25 ms setInterval only WAKES the
   scheduler: fine timing comes from the 120 ms look-ahead on the
   audio clock (each step comes in with an exact startAt on the voice, and its
   note-off is scheduled too: see _off).
   Musical division over S.bpm (shared with the synced delay). The steps
   land on the COMMON CLOCK's grid (engine/Clock.js): the first one to run in
   tempo sets the origin at its first note and the others (another Arp, a Seq, the
   conductor) line up. A key may arrive with its own instant («when», a
   player's): it joins the arpeggio from that step on, not before.
   ===================================================================== */
import { ctxRandom } from './nodes.js';
import { clockOf, DIV_BEATS } from './Clock.js';

export class Arp {
  constructor(engine) {
    this.e = engine;
    this.held = [];          // {id, freq, vel, from} in press order (from: the instant it comes in)
    this.idx = 0;
    this.timer = null;
    this.nextT = 0;
    this.tie = null;         // {id, t}: off of the tied note (gate 1), pending the next on
  }

  _div() { return DIV_BEATS[this.e.S.arpDiv] || 0.25; }
  // Start running in tempo with the first step at t (or on the grid, if others are already running)
  _begin(t) { this.idx = 0; clockOf(this.e.ctx).begin(this, t, this._div(), this.e.bpm); }
  hold(id, freq, vel, when = null) {
    if (!this.held.find(h => h.id === id)) this.held.push({ id, freq, vel, from: when === null ? 0 : when });
    if (!this.timer) {
      this._begin(when === null ? this.e.ctx.currentTime + 0.03 : when);
      this.timer = setInterval(() => this._tick(), 25);
      this._tick();                                   // the first step, now: it does not depend on when the first interval arrives
    }
  }
  unhold(id) {
    this.held = this.held.filter(h => h.id !== id);
    this._maybeStop();
  }
  _maybeStop() { if (this.timer && !this.held.length) { clearInterval(this.timer); this.timer = null; this._flushTie(); clockOf(this.e.ctx).leave(this); } }
  // Note-off scheduled on the audio clock and emitted NOW, in order with the ons:
  // this way the engine knows whether two steps overlap because of the gate (in mono: legato or
  // retrigger), not because of how far ahead the scheduler runs. With gate 1 the note
  // touches the next one: its off is emitted AFTER the next on (tie).
  _off(id, t, tie) { if (tie) this.tie = { id, t }; else this.e._directOff(id, t); }
  _flushTie() { const p = this.tie; if (p) { this.tie = null; this.e._directOff(p.id, p.t); } }

  stop() { this.held = []; this._maybeStop(); this.e.allNotesOff(); }

  // Sequence: held notes sorted by pitch, repeated across octaves
  _seq() {
    const oct = Math.max(1, Math.min(3, +this.e.S.arpOct || 1));
    const base = this.held.filter(h => !(h.from > this.nextT + 1e-6)).sort((a, b) => a.freq - b.freq);   // the ones that have already come in
    const seq = [];
    for (let o = 0; o < oct; o++) base.forEach(h => seq.push({ freq: h.freq * (1 << o), vel: h.vel }));
    return seq;
  }

  _tick() {
    const S = this.e.S, ctx = this.e.ctx, clock = clockOf(ctx), div = this._div();
    clock.sync(this, div, this.e.bpm);
    while (this.nextT < ctx.currentTime + 0.12) {
      const seq = this._seq();
      if (!seq.length) return;                                // (keys that have not come in yet: the step waits)
      const n = seq.length;
      let i;
      if (S.arpMode === 'random') i = Math.floor(ctxRandom(ctx)() * n);
      else if (S.arpMode === 'down') i = (n - 1) - (this.idx % n);
      else if (S.arpMode === 'updown') { const m = Math.max(1, 2 * n - 2), k = this.idx % m; i = k < n ? k : m - k; }
      else i = this.idx % n;                                  // 'up'
      const note = seq[i];
      const dur = clock.stepSecs(this, div);                  // with swing, the pair is split unevenly
      const id = 'arp' + (this.idx % 8);                      // rotating ids (gate<=1 => no overlaps)
      this.e._directOn(id, note.freq, note.vel, this.nextT);
      this._flushTie();                                       // the previous step's tied note is released after this on
      const gate = Math.max(0.05, Math.min(1, S.arpGate));
      this._off(id, this.nextT + dur * gate, gate >= 1);
      this.idx++;
      clock.advance(this, div);
    }
  }
}
