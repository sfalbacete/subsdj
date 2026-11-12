/* =====================================================================
   SubSDJ · Player — the «virtual fingers» of a part. It decides WHICH notes
   to play and WHEN; the engine is none the wiser: it only receives noteOn/noteOff with
   audio time (same path as the arpeggiator). Everything goes through the
   conductor's harmony (scale + current chord) and through the arrangement (does
   this part play in this bar? with how much energy?).
   Modes:
     pulse    Euclidean rhythm E(k, n): k hits spread as evenly as
              possible over n steps per bar — the same math that draws
              a line in pixels (Bresenham). E(3,8) is the tresillo, E(5,8)
              the Cuban clave… (Toussaint: almost all the world's rhythms).
              Plays the chord's root in its octave (kick, hat, perc).
              BREATHE (Roadmap 7.0 · 5.4): k rises bar by bar up to k +
              breathe and back, along a cosine of breatheCycle bars (like the
              Arrangement's Sway): the rhythm fills up and empties on its own.
     chord    holds the notes of the current chord (3 or 4); with the part's Arp
              on, it arpeggiates them; without it, it is a chord pad.
     melody   random walk over scale degrees with GRAVITY towards the
              chord notes on strong beats, a probability of rest and
              durations (eighth, quarter, half) according to the density.
     root     holds the root (± the fifth): a drone. Retriggers every N
              bars or on a chord change. With the part's Seq
              on, the held note is the ROOT that transposes its phrase.
     pattern  the only one that is not generative: a LOOP of notes of your own,
              recorded live from the keys (2026-11-12). cfg.pat = { bars, notes:
              [{ b, len, m, v }] } — start and length in beats from the loop's
              start, MIDI note, velocity — as they were PLAYED: the quantization
              (cfg.quant, in beats; 0 = off) is applied on playback, so it can be
              changed after the take, and a note beyond `bars` is not played but
              not lost either (shortening the loop truncates, lengthening brings
              it back). It ignores the harmony: the notes are the ones you played.
              With the part's Seq on they are the roots that transpose its phrase
              (same path as Root), so one mechanism covers «the bass line I played
              over the phrase» and a free melody or chords.
              A loop per part, not a timeline: no clips, no song.
              TAKE: startTake(origin) records a new loop from the bar line
              `origin` (the keys up to PAT_EARLY beats before it count as its
              beat 0); endTake(t) closes it and its length is the time played
              rounded to whole bars. startTake(_, true) OVERDUBS: the loop keeps
              playing and the keys add notes to it.
              UNDO: pushUndo() keeps a copy of the loop before a change (a take,
              Clear, an edit in ui/patternEditor.js); undo() / redo() walk them.
   Per-part arrangement: «Enters» = the energy threshold from which it plays;
   «Drift» = a preset parameter that wanders slowly (the hands of someone
   improvising): relative to the value it had when it was turned on, with 3 sines of
   prime periods and phases from the seed (it does not consume the notes' randomness).
   Note-offs are scheduled on the audio clock (Voice.release(rel, at))
   — so the selftest can render it all offline and deterministically. If the part
   has Arp/Seq active, the notes go in through noteOn with their instant (those
   sequence, on the common clock's grid) and the note-off, through a timer.
   ===================================================================== */
import { mulberry32 } from './Harmony.js';
import { PARAMS } from './params.js';

export const PLAYER_MODES = ['off', 'pulse', 'chord', 'melody', 'root', 'pattern'];
export const MODE_OCT = { pulse: 2, chord: 4, melody: 5, root: 2 };   // default octave when choosing the mode
// levelB: B comes in and out over A (replaces 'mix' since the mixer; Conductor.fromJSON translates the scenes)
export const DRIFT_KEYS = ['off', 'cutoff', 'morph', 'wtPos', 'levelB', 'pulseWidth', 'fmIndex', 'reverbMix', 'dlyAmt', 'width', 'vocVowel', 'chAmt'];
export const PLAYER_DEF = {
  mode: 'off', oct: 4, vel: 0.9,
  k: 4, n: 16, rot: 0, prob: 1, gate: 0.5, accent: 0.3,     // pulse
  breathe: 0, breatheCycle: 4,                                    // breathing pulse: extra hits at the top of an N-bar cycle
  notes: 3,                                                 // chord
  density: 0.5, rest: 0.2, gravity: 0.6, range: 1, legato: 0.8,   // melody
  fifth: 0, every: 2,                                       // root
  pat: null, quant: 0.25,                                   // pattern: the loop ({bars, notes}) and the playback grid in beats (0 = as played)
  threshold: 0, drift: 'off', driftAmt: 0.3,                 // the part's arrangement
};
export const PAT_MAX_BARS = 16;                // longest loop
export const PAT_QUANTS = [0, 1, 0.5, 0.25];   // playback grids, in beats: off · 1/4 · 1/8 · 1/16
const PAT_STEP = 0.25;      // beats scheduled per call: the loop is read in windows of a sixteenth
export const PAT_EARLY = 0.5;      // beats before the take's bar line in which a key already counts as its beat 0 (you land a bit early on the 1)
const PAT_MIN_LEN = 0.05;   // beats: shortest note kept (a key struck and released within one audio block)
const PAT_UNDO = 40;        // copies of the loop kept for undo
const PAT_FRESH = 1;        // beats after it was played in which an overdubbed note is not played back (quantized forward, it would sound twice)
export const clonePat = p => (p ? { bars: p.bars, notes: p.notes.map(n => ({ b: n.b, len: n.len, m: n.m, v: n.v })) } : null);
// Where a note starts in a loop of L beats on the grid q: its own beat, or the nearest grid point (the loop's end is its start)
export function patStart(n, q, L) { const s = q > 0 ? Math.round(n.b / q) * q : n.b; return s >= L - 1e-9 ? s - L : s; }
const BAR = 4;            // beats per bar (4/4)
const GRID_MEL = 0.5;     // melody grid: eighths (in beats)
const clamp01 = x => x < 0 ? 0 : (x > 1 ? 1 : x);

// Euclidean rhythm E(k, n) rotated `rot` steps: a hit on step i when the
// accumulator i·k (mod n) has just wrapped around — the line of slope k/n
// drawn in pixels (Bresenham). Step 0 always gets a hit: E(3,8) = x..x..x.
export function euclid(k, n, rot = 0) {
  n = Math.max(1, n | 0); k = Math.max(0, Math.min(n, k | 0));
  const p = new Array(n);
  for (let i = 0; i < n; i++) p[i] = ((i * k) % n) < k ? 1 : 0;
  const r = ((rot % n) + n) % n;
  return r ? p.slice(n - r).concat(p.slice(0, n - r)) : p;
}

export class Player {
  constructor(conductor, part, index) {
    this.c = conductor; this.part = part; this.i = index;
    this.cfg = { ...PLAYER_DEF };
    this.log = null;            // [] to log the events (selftest)
    this.driftKey = 'off'; this.driftBase = undefined;
    this.pending = new Map();   // id → {when}: a key already given to the part's Arp/Seq that has not started yet (or has no note-off)
    this.take = null;           // the recording in progress: {origin, dub, notes, open: id → {n, at}, snap, added}
    this.hist = []; this.redoStack = [];   // copies of the loop before each change, and the ones undone
    this.fresh = new WeakMap(); // overdubbed note → the beat from which it may be played back
    this.reset();
  }
  reset() {
    if (this.held && this.held.length) this.releaseHeld(this.c.ctx.currentTime);   // changing the seed on the fly leaves no orphan notes
    if (this.pending) this.clearPending();
    this.nextBeat = 0; this.held = []; this.seq = 0; this.busy = 0; this.melIdx = -1; this.lastKey = null;
    this.patOrigin = 0; this.take = null;   // the loop starts with the conductor's beat 0; a take does not survive a restart
    this.rng = mulberry32((this.c.seed * 7919 + this.i * 104729 + 13) | 0);
    const rngD = mulberry32((this.c.seed * 31 + this.i * 17 + 5) | 0);
    this.driftPhase = [0, 1, 2].map(() => rngD() * 2 * Math.PI);
  }
  setMode(mode) {
    if (mode === this.cfg.mode) return;
    this.releaseHeld(this.c.ctx.currentTime); this.clearPending();
    this.take = null;                                  // a take belongs to the pattern mode: leaving it drops it
    this.cfg.mode = mode;
    if (MODE_OCT[mode] !== undefined) this.cfg.oct = MODE_OCT[mode];
    this.busy = 0; this.melIdx = -1; this.lastKey = null;
  }
  // Drift: when the parameter changes, the previous one is put back at its base value
  setDrift(key) {
    if (this.driftKey !== 'off' && this.driftBase !== undefined) this.part.engine.set(this.driftKey, this.driftBase);
    this.cfg.drift = key; this.driftKey = key;
    this.driftBase = key !== 'off' ? this.part.engine.S[key] : undefined;
  }
  stop(when) { if (this.take) this.endTake(when); this.releaseHeld(when); this.clearPending(); this.busy = 0; this.lastKey = null; }   // stopping the conductor closes the take: what was played is kept
  releaseHeld(when) { for (const id of this.held) this._off(id, when); this.held = []; }
  // Withdraws from the part's Arp/Seq the keys given to it that have no note-off yet
  // (those not yet started and the held ones): otherwise, after stopping (or
  // changing mode) they would stay in it — the «resident sound».
  clearPending() { const e = this.part.engine; for (const id of this.pending.keys()) e.noteOff(id); this.pending.clear(); }

  _id() { return 'p' + this.i + '_' + (this.seq++); }
  // Is the note with this id still alive in the engine? (poly voice, mono stack, or held
  // by the part's Arp/Seq). If something cut the held notes — loading
  // a preset, Reset, switching poly↔mono, turning on the Seq — the player notices and
  // puts them back in the next bar instead of waiting for the chord change.
  _alive(id) { const e = this.part.engine; return e.voices.has(id) || e.heldStack.some(n => n.id === id) || e.arp.held.some(h => h.id === id) || e.seq.held.some(h => h.id === id); }
  _checkHeld() { if (this.held.length && !this.held.some(id => this._alive(id))) { this.held = []; this.lastKey = null; } }
  _routed() { const S = this.part.engine.S; return S.seqOn === 'on' || S.arpMode !== 'off'; }
  _on(id, midi, vel, when) {
    if (this.log) this.log.push([+when.toFixed(4), 'on', midi, +vel.toFixed(2)]);
    if (this.c.dry) return;
    const e = this.part.engine, f = 440 * Math.pow(2, (midi - 69) / 12);
    if (this._routed()) { e.noteOn(id, f, vel, when); this.pending.set(id, { when }); }
    else e._directOn(id, f, vel, when);
  }
  _off(id, when) {
    if (this.log) this.log.push([+when.toFixed(4), 'off']);
    if (this.c.dry) return;
    const e = this.part.engine;
    if (this._routed()) {
      const p = this.pending.get(id);
      this.pending.delete(id);
      if (p && when <= p.when + 1e-6) { e.noteOff(id); return; }   // had not started yet: it does not start (withdrawn from the Arp/Seq right away)
      const ms = (when - e.ctx.currentTime) * 1000;
      if (ms < 1) e.noteOff(id); else setTimeout(() => e.noteOff(id), ms);   // «now» is synchronous: stop() clears the Seq's latch right after
    } else e._directOff(id, when);
  }
  base() { return 12 * (this.cfg.oct + 1); }   // MIDI of the C of the chosen octave (oct 4 → 60)
  _arr(b) { return this.c.arrangeFor(this, b); }   // {E, active, velMul, probMul, dens}

  // Schedules everything that falls before `untilBeat` (in conductor beats)
  schedule(untilBeat) {
    if (this.cfg.mode === 'off') return;   // (the note-off helper is also called _off: never resolve it as a mode)
    const fn = this['_' + this.cfg.mode];
    if (!fn) return;
    const nowB = this.c.beatAt(this.c.ctx.currentTime);   // in case it fell behind (hidden tab)
    let guard = 0;
    while (this.nextBeat < untilBeat && guard++ < 4096) fn.call(this, nowB);
  }

  // Pulse hits in bar «bar»: k, or k + what it breathes in its cycle
  kAt(bar) {
    const c = this.cfg, r = Math.max(0, Math.round(c.breathe || 0));
    if (!r) return c.k;
    const N = Math.max(1, Math.round(c.breatheCycle || 4));
    return Math.min(c.n, c.k + Math.round(r * (1 - Math.cos(2 * Math.PI * (bar % N) / N)) / 2));
  }
  _pulse(nowB) {
    const c = this.cfg, step = BAR / Math.max(1, c.n);
    if (this.nextBeat < nowB - 1) this.nextBeat = Math.ceil(nowB / step) * step;
    const b = this.nextBeat, idx = Math.round(b / step) % c.n, a = this._arr(b);
    // Probability 100 % means EVERY hit, whatever the energy: the arrangement's thinning
    // (probMul, 75-100 %) only eats into the uncertainty the knob already allows. Until
    // 2026-10-26 it multiplied the knob outright, and a hat at 100 % lost one hit in eight
    // in the energy valleys (Sergio: «not all the hits came out»).
    const p = c.prob * (a.probMul + (1 - a.probMul) * c.prob);
    if (a.active && euclid(this.kAt(Math.floor(b / BAR + 1e-9)), c.n, c.rot)[idx] && this.rng() < p) {
      const t = this.c.swungTime(b, step), onBeat = Math.abs(b - Math.round(b)) < 1e-6;   // the clock's swing (if the grid is binary)
      const vel = Math.min(1, c.vel * a.velMul * (onBeat ? 1 : 1 - c.accent) * (0.92 + 0.16 * this.rng()));
      const id = this._id();
      this._on(id, this.base() + this.c.chordAtBeat(b).rootPc, vel, t);
      this._off(id, t + this.c.swingLen(b, step) * c.gate * this.c.beatLen());
    }
    this.nextBeat = b + step;
  }

  _chord(nowB) {
    const c = this.cfg;
    if (this.nextBeat < nowB - 1) this.nextBeat = Math.ceil(nowB / BAR) * BAR;
    const b = this.nextBeat, a = this._arr(b);
    if (!a.active) { if (this.held.length) this.releaseHeld(this.c.timeAt(b)); this.lastKey = null; this.nextBeat = b + BAR; return; }
    this._checkHeld();
    const ch = this.c.chordAtBeat(b), pcs = ch.tones.slice(0, c.notes), key = pcs.join(',');
    if (key !== this.lastKey) {                     // only on a chord change (a pad is held)
      const t = this.c.timeAt(b);
      this.releaseHeld(t);
      let prev = this.base() + ch.rootPc - 1;       // close voicing: each note, the next one above
      for (const pc of pcs) {
        let m = prev + 1; while (m % 12 !== pc) m++; prev = m;
        const id = this._id(); this._on(id, m, Math.min(1, c.vel * a.velMul), t); this.held.push(id);
      }
      this.lastKey = key;
    }
    this.nextBeat = b + BAR;
  }

  _root(nowB) {
    const c = this.cfg;
    if (this.nextBeat < nowB - 1) this.nextBeat = Math.ceil(nowB / BAR) * BAR;
    const b = this.nextBeat, bar = Math.round(b / BAR), a = this._arr(b);
    if (!a.active) { if (this.held.length) this.releaseHeld(this.c.timeAt(b)); this.lastKey = null; this.nextBeat = b + BAR; return; }
    this._checkHeld();
    const ch = this.c.chordAtBeat(b);
    if (ch.rootPc !== this.lastKey || bar % Math.max(1, c.every) === 0) {
      const t = this.c.timeAt(b);
      this.releaseHeld(t);
      const root = this.base() + ch.rootPc;
      // the fifth, WITHIN the scale: on some degrees of hirajoshi or blues there is no perfect fifth
      const notes = c.fifth ? [root, this.c.harmony.quantize(root + 7)] : [root];
      for (const m of notes) { const id = this._id(); this._on(id, m, Math.min(1, c.vel * a.velMul), t); this.held.push(id); }
      this.lastKey = ch.rootPc;
    }
    this.nextBeat = b + BAR;
  }

  _melody(nowB) {
    const c = this.cfg, step = GRID_MEL;
    if (this.nextBeat < nowB - 1) { this.nextBeat = Math.ceil(nowB / step) * step; this.busy = 0; }
    const b = this.nextBeat;
    if (this.busy > 1e-9) { this.busy -= step; this.nextBeat = b + step; return; }   // the note (or the rest) is still sounding
    const a = this._arr(b);
    if (!a.active) { this.nextBeat = b + step; return; }
    const h = this.c.harmony, ch = this.c.chordAtBeat(b);
    const lo = this.base(), hi = lo + 12 * Math.max(1, c.range);
    const pool = h.notesIn(lo, hi, h.scaleSet());
    if (!pool.length) { this.nextBeat = b + step; return; }
    // duration in eighths: 1, 2 or 4 — with more density (and more energy), shorter
    const dens = clamp01(c.density + a.dens), restProb = clamp01(c.rest - a.dens * 0.6);
    const w = [dens + 0.05, 0.5, 1.05 - dens], tot = w[0] + w[1] + w[2];
    let x = this.rng() * tot; const len = x < w[0] ? 1 : (x < w[0] + w[1] ? 2 : 4);
    if (this.rng() < restProb) { this.busy = (len - 1) * step; this.nextBeat = b + step; return; }   // a rest of that duration
    // pitch: starts on a chord note; on a strong beat, gravity towards
    // the nearest chord note; otherwise, a step (±1, ±2), staying put, or a leap
    const chordSet = new Set(ch.tones), strong = Math.abs(b % 2) < 1e-6;
    let idx = this.melIdx;
    if (idx < 0) {
      const cands = pool.map((m, i) => i).filter(i => chordSet.has(pool[i] % 12));
      idx = cands.length ? cands[Math.floor(cands.length / 2)] : Math.floor(pool.length / 2);
    } else if (strong && this.rng() < c.gravity) {
      let best = idx, bd = 99;
      for (let i = 0; i < pool.length; i++) if (chordSet.has(pool[i] % 12)) { const d = Math.abs(i - idx); if (d < bd) { bd = d; best = i; } }
      idx = best;
    } else {
      const r = this.rng(), dir = this.rng() < 0.5 ? -1 : 1;
      const d = r < 0.15 ? 0 : r < 0.6 ? 1 : r < 0.85 ? 2 : 3 + Math.floor(this.rng() * 3);
      idx += dir * d;
      if (idx < 0) idx = -idx;                                        // bounces off the edges of the register
      if (idx >= pool.length) idx = 2 * (pool.length - 1) - idx;
      idx = Math.max(0, Math.min(pool.length - 1, idx));
    }
    this.melIdx = idx;
    const t = this.c.swungTime(b, step), bar1 = Math.abs(b % BAR) < 1e-6;   // eighths with the clock's swing
    const vel = Math.min(1, c.vel * a.velMul * (bar1 ? 1 : 0.85) * (0.9 + 0.2 * this.rng()));
    const id = this._id();
    this._on(id, pool[idx], vel, t);
    this._off(id, t + (this.c.swungTime(b + len * step, step) - t) * c.legato);
    this.busy = (len - 1) * step;
    this.nextBeat = b + step;
  }

  // ---------- pattern: the loop and its takes ----------
  _pattern(nowB) {
    const c = this.cfg, step = PAT_STEP;
    if (this.nextBeat < nowB - 1) this.nextBeat = Math.ceil(nowB / step) * step;
    const b = this.nextBeat, pat = c.pat, tk = this.take;
    this.nextBeat = b + step;
    if (tk && !tk.dub && b >= tk.origin - 1e-9) return;        // a new take replaces the loop: silent from its bar line on
    if (!pat || !pat.notes.length) return;
    const a = this._arr(b);
    if (!a.active) return;
    const L = pat.bars * BAR, q = c.quant, pos = (((b - this.patOrigin) % L) + L) % L, cyc = b - pos;
    for (const n of pat.notes) {
      if (n.b >= L - 1e-9) continue;                           // beyond the loop's length: kept, not played
      const s = patStart(n, q, L);
      if (s < pos - 1e-9 || s >= pos + step - 1e-9) continue;
      const at = cyc + s;
      if (this.fresh.get(n) > at) continue;                    // just played by hand: it comes in on the next lap
      const t = q > 0 ? this.c.swungTime(at, q) : this.c.timeAt(at);   // on a grid, with the clock's swing
      const id = this._id();
      this._on(id, n.m, Math.min(1, n.v * a.velMul), t);
      this._off(id, t + Math.max(PAT_MIN_LEN, Math.min(n.len, L)) * this.c.beatLen());
    }
  }
  // A take from the bar line `origin` (conductor beats); dub = add to the loop that is playing
  startTake(origin, dub = false) {
    const c = this.cfg;
    if (dub && !(c.pat && c.pat.notes.length)) dub = false;    // nothing to add to: it is a new take
    this.take = { origin: dub ? this.patOrigin : origin, dub, notes: [], open: new Map(), snap: dub ? clonePat(c.pat) : null, added: 0 };
    return this.take;
  }
  // A live key at audio time t (ui: parts.setNoteTap). It sounds through the usual path; here it is only written down
  recOn(id, midi, vel, t) {
    const tk = this.take; if (!tk) return false;
    const abs = this.c.beatAt(t);
    let b = abs - tk.origin;
    if (tk.dub) { const L = this.cfg.pat.bars * BAR; b = ((b % L) + L) % L; }
    else if (b < -PAT_EARLY) return false;                     // still counting in
    else if (b < 0) b = 0;
    const n = { b, len: PAT_MIN_LEN, m: Math.round(midi), v: Math.max(0.05, Math.min(1, vel)) };
    if (tk.dub) { this.cfg.pat.notes.push(n); this.fresh.set(n, abs + PAT_FRESH); tk.added++; }
    else tk.notes.push(n);
    tk.open.set(id, { n, at: Math.max(abs, tk.origin) });
    return true;
  }
  recOff(id, t) {
    const tk = this.take, o = tk && tk.open.get(id); if (!o) return;
    tk.open.delete(id);
    o.n.len = Math.max(PAT_MIN_LEN, this.c.beatAt(t) - o.at);
  }
  // Closes the take at t. A new one becomes the loop, as long as what was played, in whole bars (the nearest: stopping
  // just after the bar line does not add an empty bar); with no notes, the loop there was stays. Returns true if it changed
  endTake(t) {
    const tk = this.take; if (!tk) return false;
    for (const id of [...tk.open.keys()]) this.recOff(id, t);
    this.take = null;
    if (tk.dub) { if (tk.added) { this.hist.push(tk.snap); this.redoStack.length = 0; } return tk.added > 0; }
    if (!tk.notes.length) return false;
    const bars = Math.max(1, Math.min(PAT_MAX_BARS, Math.round((this.c.beatAt(t) - tk.origin) / BAR)));
    this.pushUndo();
    this.cfg.pat = { bars, notes: tk.notes };
    this.patOrigin = tk.origin;
    return true;
  }
  // Undo: call pushUndo() BEFORE changing the loop. The copies are whole loops (they are small); undo and redo
  // swap the live one for a copy, so whoever holds a note of the old one (a selection) must let go of it
  pushUndo() { this.hist.push(clonePat(this.cfg.pat)); if (this.hist.length > PAT_UNDO) this.hist.shift(); this.redoStack.length = 0; }
  canUndo() { return !this.take && this.hist.length > 0; }
  canRedo() { return !this.take && this.redoStack.length > 0; }
  undo() { if (!this.canUndo()) return false; this.redoStack.push(clonePat(this.cfg.pat)); this.cfg.pat = this.hist.pop(); return true; }
  redo() { if (!this.canRedo()) return false; this.hist.push(clonePat(this.cfg.pat)); this.cfg.pat = this.redoStack.pop(); return true; }
  clearHist() { this.hist.length = 0; this.redoStack.length = 0; }
  clearPat() { if (this.take || !this.cfg.pat) return; this.pushUndo(); this.cfg.pat = null; }
  setPatBars(bars) { const p = this.cfg.pat; if (p) p.bars = Math.max(1, Math.min(PAT_MAX_BARS, Math.round(bars))); }
  // Where the loop is now, 0..1 (the UI's playhead); −1 if there is none
  patPhase(t) { const p = this.cfg.pat; if (!p) return -1; const L = p.bars * BAR; return ((((this.c.beatAt(t) - this.patOrigin) % L) + L) % L) / L; }

  // Slow drift of the chosen parameter (the conductor calls it every ~100 ms, live).
  // Smooth walk ≈ ±1: 3 sines of prime periods (in beats) with phases from the seed.
  drift(beat) {
    const c = this.cfg, key = c.drift;
    if (!key || key === 'off' || !(c.driftAmt > 0)) return;
    const p = PARAMS[key]; if (!p) return;
    if (this.driftKey !== key || this.driftBase === undefined) { this.driftKey = key; this.driftBase = this.part.engine.S[key]; }
    const ph = this.driftPhase;
    const w = (Math.sin(beat / 23 + ph[0]) + 0.6 * Math.sin(beat / 37 + ph[1]) + 0.4 * Math.sin(beat / 59 + ph[2])) / 2;
    let v = p.log ? this.driftBase * Math.pow(2, c.driftAmt * w * 1.5)             // cutoff: in octaves
                  : this.driftBase + c.driftAmt * w * 0.5 * (p.max - p.min);       // linear: ± half the range
    v = Math.max(p.min, Math.min(p.max, v));
    this.part.engine.set(key, v);
    if (this.c.onDrift) this.c.onDrift(this.i, key, v);
  }
}
