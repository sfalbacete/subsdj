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
const SEQ_IDS = 64;             // rotating note ids: a chord of several voices with repeats and ties must not reuse a sounding one

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

// ---------- units: semitones ↔ degrees (2026-11-02) ----------
// The scale of a units setting: null for semitones; 'harmony' converts as major (the scene's scale
// depends on the key you hold, so there is nothing fixed to convert to: major is its fallback too).
export const scaleOfNotes = n => (!n || n === 'semitones' ? null : n === 'harmony' ? SCALES.major : SCALES[n] || SCALES.major);
// Degree j (0 = the key) → semitones above the key, the same arithmetic Seq.semis uses with the key as tonic
export function fromDegrees(j, I) {
  const len = I.length, oct = Math.floor(j / len), idx = j - oct * len;
  return 12 * oct + I[idx] - I[0];
}
// Semitones above the key → the nearest degree (a tie goes to the lower one); exact = it was in the scale
export function toDegrees(s, I) {
  const len = I.length, o = Math.floor(s / 12);
  let best = 0, bd = Infinity;
  for (let j = (o - 1) * len; j <= (o + 1) * len + len; j++) {
    const d = Math.abs(fromDegrees(j, I) - s);
    if (d < bd) { bd = d; best = j; }
  }
  return { deg: best, exact: bd === 0 };
}
// A pattern written in `from` units, rewritten in `to` units so that the MELODY stays: semitones →
// a scale = degrees (what is outside the scale goes to the nearest degree: `moved` counts them);
// a scale → semitones = exact; scale → scale = the same degrees (the phrase moves to the new mode,
// which is what degrees are for). Accents, ties, slides and repeats stay; rests too.
export function convertPattern(str, from, to) {
  const A = scaleOfNotes(from), B = scaleOfNotes(to);
  let moved = 0;
  if ((A && B) || (!A && !B)) return { pat: String(str || ''), moved };
  const out = parsePattern(str).map(st => {
    if (!st) return '.';
    let off;
    if (!A) { const r = toDegrees(st.off, B); off = r.deg; if (!r.exact) moved++; }
    else off = fromDegrees(st.off, A);
    return stepToken({ ...st, off: Math.max(SEQ_OFF_MIN, Math.min(SEQ_OFF_MAX, off)) });
  });
  return { pat: out.join(' '), moved };
}

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
    this.tie = [];           // [{id, t}]: offs of the tied notes (gate 1), pending the next on
    this.retrigAt = null;    // seqRetrig with a key that comes in later: the phrase goes back to step 0 at that step
    this.link = null;        // [{id, mode: 'tie'|'slide'}] per voice: the notes the previous step left tied to the next
    this.gesture = [];       // Chord: every key pressed since the hands were last off (what Latch keeps)
    this.latchedChord = null;   // Chord + Latch: the chord left sounding once every key is up
    this.pinned = null;      // {freq, vel}: a root of its own, above keys and latch (the step recording's loop: pin/unpin)
    this.nid = 0;            // note id counter (repeats use up several per step)
  }

  _div() { return DIV_BEATS[this.e.S.seqDiv] || 0.25; }
  // Start running in tempo with the first step at t (or on the grid, if others are already running)
  _begin(t) { this.idx = 0; clockOf(this.e.ctx).begin(this, t, this._div(), this.e.bpm); }
  // Sets the phrase running from step `from`; false if it already was
  _run(t, from = 0) {
    if (this.timer) return false;
    this.playQ = [];
    this._begin(t);
    this.idx = from;
    this.timer = setInterval(() => this._tick(), 25);
    this._tick();                                     // the first step, now: it does not depend on when the first interval arrives
    return true;
  }
  hold(id, freq, vel, when = null) {
    if (!this.held.length) this.gesture = [];   // a new gesture (the latched chord stays until the new keys come in)
    if (!this.held.find(h => h.id === id)) {
      const h = { id, freq, vel, from: when === null ? 0 : when };
      this.held.push(h);
      if (!this.gesture.find(g => g.id === id)) this.gesture.push(h);
    }
    if (this.timer) {
      if (this.e.S.seqRetrig === 'on') {              // restarts the phrase ON THE GRID (nextT untouched: no flams)
        if (when === null) this.idx = 0; else this.retrigAt = when;
      }
    } else this._run(when === null ? this.e.ctx.currentTime + 0.03 : when);
  }
  // The step recording's loop (ui/seqControls.js): while the take lasts the keys write instead of
  // transposing, so the phrase gets a root of its own — the take's C — and plays exactly what was
  // written so far, with no key held (one note: that note over and over; each key appends one more).
  // From: the step to start on if the phrase was stopped (the one just written: it sounds now, so the
  // key needs no note of its own). True if it started it.
  pin(freq, vel, from = 0) {
    this.pinned = { freq, vel };
    return this._run(this.e.ctx.currentTime + 0.03, from);
  }
  // The take is over. keep: the phrase goes on as if latched on that C (a key transposes it as usual)
  unpin(keep = false) {
    const p = this.pinned; if (!p) return;
    this.pinned = null;
    if (keep && !this.held.length) { this.latched = p; this.latchedChord = null; }
    this._maybeStop();
  }
  unhold(id) {
    const gone = this.held.find(h => h.id === id);
    if (!gone) return;   // an id we were not holding (note-off from another part, or after an allNotesOff): neither touches the latch nor stops the phrase
    this.held = this.held.filter(h => h.id !== id);
    if (!this.held.length) {
      if (this.e.S.seqLatch === 'on') { this.latched = { freq: gone.freq, vel: gone.vel }; this.latchedChord = this.gesture.slice(); }
      else { this.latched = null; this.latchedChord = null; this._maybeStop(); }
    }
  }
  _maybeStop() { if (this.timer && !this.held.length && !this.latched && !this.pinned) { clearInterval(this.timer); this.timer = null; this.playQ = []; this._flushTie(); this._unlink(this.e.ctx.currentTime); clockOf(this.e.ctx).leave(this); } }
  // the note left tied to the next step ends at t
  _unlink(t) { const l = this.link; if (l) { this.link = null; for (const x of l) this.e._directOff(x.id, t); } }
  // Note-off scheduled on the audio clock and emitted NOW, in order with the ons:
  // this way the engine knows whether two steps overlap because of the gate (in mono: legato or
  // retrigger), not because of how far ahead the scheduler runs. With gate 1 the note
  // touches the next one: its off is emitted AFTER the next on (tie).
  _off(id, t, tie) { if (tie) this.tie.push({ id, t }); else this.e._directOff(id, t); }
  _flushTie() { const p = this.tie; if (p.length) { this.tie = []; for (const x of p) this.e._directOff(x.id, x.t); } }

  stop() { this.held = []; this.gesture = []; this.latched = null; this.latchedChord = null; this.pinned = null; this._maybeStop(); this.e.allNotesOff(); }

  // Root with last-note priority; with latch, the last one released (a pinned root goes first)
  _root() {
    if (this.pinned) return this.pinned;
    for (let i = this.held.length - 1; i >= 0; i--) if (!(this.held[i].from > this.nextT + 1e-6)) return this.held[i];   // the last one that has already come in
    return this.latched;
  }

  // The roots of a step: one (last-note priority, or the latched one) — or, with Chord on, EVERY key held
  // (with Latch, the whole gesture; once every key is up, the latched chord), lowest first. In Mono a
  // chord cannot sound: its notes would reach the one voice at the same instant and the last-note
  // priority would keep the top one (in legato, gliding up from the bottom on every step) — so Mono
  // plays one root, as with Chord off (and the switch is dimmed: ui/deps.js)
  _roots() {
    if (this.pinned || this.e.S.seqChord !== 'on' || this.e.S.mode === 'mono') { const r = this._root(); return r ? [r] : []; }
    const src = this.held.length ? (this.e.S.seqLatch === 'on' ? this.gesture : this.held)
      : (this.latchedChord && this.latchedChord.length ? this.latchedChord : this.latched ? [this.latched] : []);
    return src.filter(h => !(h.from > this.nextT + 1e-6)).sort((a, b) => a.freq - b.freq);
  }
  // The pitches of a step for its roots. One root: as always. A chord: in semitones, parallel; on a fixed
  // scale, DIATONIC around the lowest note — each note moves `off` degrees inside the scale, so the chord
  // changes quality as it climbs (C-E-G in major, «0 3 4» = C, F, G major); with the scene's harmony each
  // note already moves inside the scene's scale.
  _stepFreqs(off, roots) {
    const mode = this.e.S.seqNotes;
    if (roots.length < 2 || !mode || mode === 'semitones' || mode === 'harmony') return roots.map(r => stepFreq(r.freq, this.semis(off, r.freq)));
    const I = SCALES[mode] || SCALES.major, tonic = roots[0].freq;
    return roots.map(r => stepFreq(tonic, fromDegrees(toDegrees(Math.round(12 * Math.log2(r.freq / tonic)), I).deg + off, I)));
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
      const steps = this._steps(), roots = this._roots();
      if (!steps.length || !roots.length) return;      // (a root that has not come in yet: the step waits)
      const dur = clock.stepSecs(this, div);           // with swing, the pair is split unevenly
      const st = steps[this.idx % steps.length];       // modulo on every step: pattern editable live
      this.playQ.push({ i: this.idx % steps.length, t0: this.nextT, t1: this.nextT + dur });
      if (this.playQ.length > 64) this.playQ.shift();  // cap in case the UI does not consume (collapsed panel)
      if (st) {                                        // null = rest: time advances all the same
        const gate = Math.max(0.05, Math.min(1, S.seqGate)), fs = this._stepFreqs(st.off, roots), t = this.nextT;
        const linkNext = st.slide ? 'slide' : st.tie ? 'tie' : null;
        if (this.link) {                               // the previous step asked for a tie or slide: this one CONTINUES its notes, voice by voice
          const links = this.link, next = [];
          this.link = null;
          fs.forEach((f, v) => {
            const l = links[v];
            if (l) {
              this.e._directGlide(l.id, f, t, l.mode === 'slide' ? (S.glide > 0 ? S.glide : SEQ_SLIDE) : 0);
              if (linkNext) next.push({ id: l.id, mode: linkNext });
              else this._off(l.id, t + dur * gate, gate >= 1);
            } else {                                   // the chord grew: the new voice starts here
              const id = 'seq' + (this.nid++ % SEQ_IDS);
              this.e._directOn(id, f, roots[v].vel, t, st.accent ? 1 : 0);
              if (linkNext) next.push({ id, mode: linkNext });
              else this._off(id, t + dur * gate, gate >= 1);
            }
          });
          for (const l of links.slice(fs.length)) this.e._directOff(l.id, t);   // the chord shrank: those voices end here
          if (next.length) this.link = next;
        } else {
          // accent: with accents in the pattern, the other steps drop; the matrix's «Accent» source, in the note
          const accents = steps.some(s => s && s.accent);
          const n = st.rep, sub = dur / n;
          for (let k = 0; k < n; k++) {                // repeats: n hits within the step
            const tk = t + k * sub, last = k === n - 1;
            const ids = fs.map((f, v) => {             // one voice per root (rotating ids, disjoint from 'arp'+n)
              const id = 'seq' + (this.nid++ % SEQ_IDS), vel = st.accent || !accents ? roots[v].vel : roots[v].vel * SEQ_UNACCENT;
              this.e._directOn(id, f, vel, tk, st.accent ? 1 : 0);
              return id;
            });
            if (k === 0) this._flushTie();             // the tied notes (gate 1) of the previous step are released after these ons
            if (last && linkNext) this.link = ids.map(id => ({ id, mode: linkNext }));
            else if (n > 1) for (const id of ids) this.e._directOff(id, tk + sub * Math.min(gate, SEQ_RATCHET_GATE));
            else for (const id of ids) this._off(id, tk + sub * gate, gate >= 1);
          }
        }
      } else { this._flushTie(); this._unlink(this.nextT); }   // rest: the tied note ends here
      // the next step is the one AFTER this, whatever the length does meanwhile: a phrase that grows
      // under the playhead (the step recording appends) plays its new step next instead of jumping to
      // idx % newLength — the same as idx++ while the length stays put
      this.idx = this.idx % steps.length + 1;
      clock.advance(this, div);
    }
  }
}
