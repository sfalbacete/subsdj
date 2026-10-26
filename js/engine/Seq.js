/* =====================================================================
   SubSDJ · step sequencer with keyboard transposition.
   When seqOn == 'on', the engine's noteOn/noteOff divert the notes here:
   the held key does NOT sound — it is the ROOT that transposes the phrase (seqPat,
   offsets in semitones, '.' = rest). The loop does not restart when the
   key changes (the index carries on; seqRetrig restarts it on the grid). With
   seqLatch the phrase keeps playing after release, with the last root.
   Same scheduler as the arpeggiator: a 25 ms setInterval that only
   WAKES the scheduler; fine timing comes from the 120 ms look-ahead
   on the audio clock. Musical division over S.bpm, on the
   grid of the COMMON CLOCK (engine/Clock.js), like the arpeggiator: two Seqs in
   two parts, or a Seq and an Arp, land together. A key may arrive with its own
   instant («when», a player's): it is the root from that step on.
   ARTICULATIONS (Roadmap 7.0 · 5.1), step suffixes in the pattern:
     !   accent: sounds louder than the unaccented steps (if the pattern has
         any, the others drop to SEQ_UNACCENT) and lights the matrix source
         «Accent» for that note — the preset decides what an accent does
     ~   tie: the note is NOT cut; the next step continues it with no new
         attack (if it has another pitch, it jumps to it)
     /   slide: like the tie, but the pitch SLIDES to the next step's
         (the preset's Glide, or SEQ_SLIDE if it is at 0): the 303
     x2…x4  repeats: the step fires 2-4 times within its time
   They combine: «7!/», «0x3», «3!~».
   NOTES BY DEGREE (Roadmap 7.0 · 5.2): with seqNotes = a scale, the step's
   number is a DEGREE counted from the held key (going past the last one goes up
   an octave); with 'harmony', the degrees of the SCENE's scale (Parts) counted
   from the key — the chord's root if the player sets it —: the phrase
   moves within the key. 'semitones' = as always.
   ===================================================================== */
import { clockOf, DIV_BEATS } from './Clock.js';
import { SCALES } from './Harmony.js';
export const SEQ_MAX_STEPS = 16, SEQ_OFF_MIN = -12, SEQ_OFF_MAX = 24;
const SEQ_UNACCENT = 0.6;   // with accents in the pattern, unaccented steps sound at this factor of the velocity
const SEQ_SLIDE = 0.06;     // s: the slide with Glide at 0 (the 303's fixed time)
const SEQ_RATCHET_GATE = 0.8;   // fraction of each hit of a repeat (leaves room for the next attack)

// Token: integer with optional suffixes in any order — '!' accent, '~'
// tie, '/' slide (tie and slide exclude each other: the last one wins), 'x2'…'x4'
// repeats. '.' or any invalid token = rest (null). Offsets clamped.
export function parsePattern(str) {
  return String(str || '').trim().split(/\s+/).filter(Boolean)
    .slice(0, SEQ_MAX_STEPS)
    .map(tok => {
      const m = /^(-?\d+)((?:!|~|\/|x[1-4])*)$/.exec(tok);
      if (!m) return null;
      const off = Math.max(SEQ_OFF_MIN, Math.min(SEQ_OFF_MAX, +m[1]));
      const st = { off, accent: false, tie: false, slide: false, rep: 1 };
      for (const f of m[2].match(/!|~|\/|x[1-4]/g) || []) {
        if (f === '!') st.accent = true;
        else if (f === '~') { st.tie = true; st.slide = false; }
        else if (f === '/') { st.slide = true; st.tie = false; }
        else st.rep = +f[1];
      }
      return st;
    });
}
// A step's token (for the editor): pitch + suffixes in canonical order
export const stepToken = st => !st ? '.'
  : String(st.off) + (st.accent ? '!' : '') + (st.slide ? '/' : st.tie ? '~' : '') + (st.rep > 1 ? 'x' + st.rep : '');

export const stepFreq = (rootFreq, off) => rootFreq * Math.pow(2, off / 12);

export class Seq {
  constructor(engine) {
    this.e = engine;
    this.held = [];          // {id, freq, vel, from} in press order (top = root; from: the instant it comes in)
    this.latched = null;     // {freq, vel} if latch holds the phrase once everything is released
    this.idx = 0;
    this.timer = null;
    this.nextT = 0;
    this.playQ = [];         // steps already scheduled {i, t0, t1} — for the UI's marker
    this._patStr = null; this._pat = [];   // parse cache by string identity
    this.tie = null;         // {id, t}: off of the tied note (gate 1), pending the next on
    this.retrigAt = null;    // seqRetrig with a key that comes in later: the phrase goes back to step 0 at that step
    this.link = null;        // {id, mode: 'tie'|'slide'}: the note the previous step left tied to the next
    this.nid = 0;            // note id counter (repeats use up several per step)
  }

  _div() { return DIV_BEATS[this.e.S.seqDiv] || 0.25; }
  // Start running in tempo with the first step at t (or on the grid, if others are already running)
  _begin(t) { this.idx = 0; clockOf(this.e.ctx).begin(this, t, this._div(), this.e.bpm); }
  hold(id, freq, vel, when = null) {
    if (!this.held.find(h => h.id === id)) this.held.push({ id, freq, vel, from: when === null ? 0 : when });
    if (!this.timer) {
      this.playQ = [];
      this._begin(when === null ? this.e.ctx.currentTime + 0.03 : when);
      this.timer = setInterval(() => this._tick(), 25);
      this._tick();                                   // the first step, now: it does not depend on when the first interval arrives
    } else if (this.e.S.seqRetrig === 'on') {           // restarts the phrase ON THE GRID (nextT untouched: no flams)
      if (when === null) this.idx = 0; else this.retrigAt = when;
    }
  }
  unhold(id) {
    const gone = this.held.find(h => h.id === id);
    if (!gone) return;   // an id we were not holding (note-off from another part, or after an allNotesOff): neither touches the latch nor stops the phrase
    this.held = this.held.filter(h => h.id !== id);
    if (!this.held.length) {
      if (this.e.S.seqLatch === 'on') this.latched = { freq: gone.freq, vel: gone.vel };
      else { this.latched = null; this._maybeStop(); }
    }
  }
  _maybeStop() { if (this.timer && !this.held.length && !this.latched) { clearInterval(this.timer); this.timer = null; this.playQ = []; this._flushTie(); this._unlink(this.e.ctx.currentTime); clockOf(this.e.ctx).leave(this); } }
  // the note left tied to the next step ends at t
  _unlink(t) { const l = this.link; if (l) { this.link = null; this.e._directOff(l.id, t); } }
  // Note-off scheduled on the audio clock and emitted NOW, in order with the ons:
  // this way the engine knows whether two steps overlap because of the gate (in mono: legato or
  // retrigger), not because of how far ahead the scheduler runs. With gate 1 the note
  // touches the next one: its off is emitted AFTER the next on (tie).
  _off(id, t, tie) { if (tie) this.tie = { id, t }; else this.e._directOff(id, t); }
  _flushTie() { const p = this.tie; if (p) { this.tie = null; this.e._directOff(p.id, p.t); } }

  stop() { this.held = []; this.latched = null; this._maybeStop(); this.e.allNotesOff(); }

  // Root with last-note priority; with latch, the last one released
  _root() {
    for (let i = this.held.length - 1; i >= 0; i--) if (!(this.held[i].from > this.nextT + 1e-6)) return this.held[i];   // the last one that has already come in
    return this.latched;
  }

  // Scale of the degrees (intervals from its tonic) and index of the key in it; null = semitones
  _scale(rootFreq) {
    const mode = this.e.S.seqNotes;
    if (!mode || mode === 'semitones') return null;
    if (mode !== 'harmony') return { I: SCALES[mode] || SCALES.major, i0: 0 };
    const h = this.e.harmony ? this.e.harmony() : null;
    if (!h) return { I: SCALES.major, i0: 0 };      // no scene, no harmony: major from the key
    const I = h.notes, pc = ((Math.round(69 + 12 * Math.log2(rootFreq / 440)) - h.root) % 12 + 12) % 12;
    let i0 = 0; for (let i = 0; i < I.length; i++) if (I[i] <= pc) i0 = i;   // the key (or the degree below it, if it is not in the scale)
    return { I, i0 };
  }
  // Semitones above the key for step «off» (with degrees: its degree; degree 0 is the key)
  semis(off, rootFreq) {
    const sc = this._scale(rootFreq); if (!sc) return off;
    const { I, i0 } = sc, len = I.length, j = i0 + off, oct = Math.floor(j / len), idx = j - oct * len;
    return 12 * oct + I[idx] - I[i0];
  }
  // Steps in an octave for the editor: 12 semitones or the scale's degrees
  octaveSteps() { const sc = this._scale(261.63); return sc ? sc.I.length : 12; }

  _steps() {
    const s = this.e.S.seqPat;
    if (s !== this._patStr) { this._patStr = s; this._pat = parsePattern(s); }
    return this._pat;
  }

  // The step SOUNDING right now (not the scheduled one): the UI draws the
  // marker with this. Prunes the queue of expired steps; -1 if stopped or not sounding yet.
  playingStep() {
    if (!this.timer || !this.e.ctx) return -1;
    const t = this.e.ctx.currentTime;
    while (this.playQ.length && this.playQ[0].t1 <= t) this.playQ.shift();
    const c = this.playQ[0];
    return c && c.t0 <= t ? c.i : -1;
  }

  _tick() {
    const S = this.e.S, ctx = this.e.ctx, clock = clockOf(ctx), div = this._div();
    clock.sync(this, div, this.e.bpm);
    while (this.nextT < ctx.currentTime + 0.12) {
      if (this.retrigAt !== null && this.retrigAt <= this.nextT + 1e-6) { this.idx = 0; this.retrigAt = null; }
      const steps = this._steps(), root = this._root();
      if (!steps.length || !root) return;              // (a root that has not come in yet: the step waits)
      const dur = clock.stepSecs(this, div);           // with swing, the pair is split unevenly
      const st = steps[this.idx % steps.length];       // modulo on every step: pattern editable live
      this.playQ.push({ i: this.idx % steps.length, t0: this.nextT, t1: this.nextT + dur });
      if (this.playQ.length > 64) this.playQ.shift();  // cap in case the UI does not consume (collapsed panel)
      if (st) {                                        // null = rest: time advances all the same
        const gate = Math.max(0.05, Math.min(1, S.seqGate)), f = stepFreq(root.freq, this.semis(st.off, root.freq)), t = this.nextT;
        const linkNext = st.slide ? 'slide' : st.tie ? 'tie' : null;
        if (this.link) {                               // the previous step asked for a tie or slide: this one CONTINUES its note
          const { id, mode } = this.link; this.link = null;
          this.e._directGlide(id, f, t, mode === 'slide' ? (S.glide > 0 ? S.glide : SEQ_SLIDE) : 0);
          if (linkNext) this.link = { id, mode: linkNext };
          else this._off(id, t + dur * gate, gate >= 1);
        } else {
          // accent: with accents in the pattern, the other steps drop; the matrix's «Accent» source, in the note
          const vel = st.accent || !steps.some(s => s && s.accent) ? root.vel : root.vel * SEQ_UNACCENT;
          const n = st.rep, sub = dur / n;
          for (let k = 0; k < n; k++) {                // repeats: n hits within the step
            const id = 'seq' + (this.nid++ % 16), tk = t + k * sub, last = k === n - 1;   // rotating ids, disjoint from 'arp'+n
            this.e._directOn(id, f, vel, tk, st.accent ? 1 : 0);
            if (k === 0) this._flushTie();             // the tied note (gate 1) of the previous step is released after this on
            if (last && linkNext) this.link = { id, mode: linkNext };
            else if (n > 1) this.e._directOff(id, tk + sub * Math.min(gate, SEQ_RATCHET_GATE));
            else this._off(id, tk + sub * gate, gate >= 1);
          }
        }
      } else { this._flushTie(); this._unlink(this.nextT); }   // rest: the tied note ends here
      this.idx++;
      clock.advance(this, div);
    }
  }
}
