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

export const PLAYER_MODES = ['off', 'pulse', 'chord', 'melody', 'root'];
export const MODE_OCT = { pulse: 2, chord: 4, melody: 5, root: 2 };   // default octave when choosing the mode
// levelB: B comes in and out over A (replaces 'mix' since the mixer; Conductor.fromJSON translates the scenes)
export const DERIVA_KEYS = ['off', 'cutoff', 'morph', 'wtPos', 'levelB', 'pulseWidth', 'fmIndex', 'reverbMix', 'dlyAmt', 'width', 'vocVowel', 'chAmt'];
export const PLAYER_DEF = {
  mode: 'off', oct: 4, vel: 0.9,
  k: 4, n: 16, rot: 0, prob: 1, gate: 0.5, accent: 0.3,     // pulse
  breathe: 0, breatheCycle: 4,                                    // breathing pulse: extra hits at the top of an N-bar cycle
  notes: 3,                                                 // chord
  density: 0.5, rest: 0.2, gravity: 0.6, range: 1, legato: 0.8,   // melody
  fifth: 0, every: 2,                                       // root
  threshold: 0, drift: 'off', driftAmt: 0.3,                 // the part's arrangement
};
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
    this.derivaKey = 'off'; this.derivaBase = undefined;
    this.pending = new Map();   // id → {when}: a key already given to the part's Arp/Seq that has not started yet (or has no note-off)
    this.reset();
  }
  reset() {
    if (this.held && this.held.length) this.releaseHeld(this.c.ctx.currentTime);   // changing the seed on the fly leaves no orphan notes
    if (this.pending) this.clearPending();
    this.nextBeat = 0; this.held = []; this.seq = 0; this.busy = 0; this.melIdx = -1; this.lastKey = null;
    this.rng = mulberry32((this.c.seed * 7919 + this.i * 104729 + 13) | 0);
    const rngD = mulberry32((this.c.seed * 31 + this.i * 17 + 5) | 0);
    this.derivaPhase = [0, 1, 2].map(() => rngD() * 2 * Math.PI);
  }
  setMode(mode) {
    if (mode === this.cfg.mode) return;
    this.releaseHeld(this.c.ctx.currentTime); this.clearPending();
    this.cfg.mode = mode;
    if (MODE_OCT[mode] !== undefined) this.cfg.oct = MODE_OCT[mode];
    this.busy = 0; this.melIdx = -1; this.lastKey = null;
  }
  // Drift: when the parameter changes, the previous one is put back at its base value
  setDeriva(key) {
    if (this.derivaKey !== 'off' && this.derivaBase !== undefined) this.part.engine.set(this.derivaKey, this.derivaBase);
    this.cfg.drift = key; this.derivaKey = key;
    this.derivaBase = key !== 'off' ? this.part.engine.S[key] : undefined;
  }
  stop(when) { this.releaseHeld(when); this.clearPending(); this.busy = 0; this.lastKey = null; }
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
    if (a.active && euclid(this.kAt(Math.floor(b / BAR + 1e-9)), c.n, c.rot)[idx] && this.rng() < c.prob * a.probMul) {
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
    const dens = clamp01(c.density + a.dens), sil = clamp01(c.rest - a.dens * 0.6);
    const w = [dens + 0.05, 0.5, 1.05 - dens], tot = w[0] + w[1] + w[2];
    let x = this.rng() * tot; const len = x < w[0] ? 1 : (x < w[0] + w[1] ? 2 : 4);
    if (this.rng() < sil) { this.busy = (len - 1) * step; this.nextBeat = b + step; return; }   // a rest of that duration
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

  // Slow drift of the chosen parameter (the conductor calls it every ~100 ms, live).
  // Smooth walk ≈ ±1: 3 sines of prime periods (in beats) with phases from the seed.
  drift(beat) {
    const c = this.cfg, key = c.drift;
    if (!key || key === 'off' || !(c.driftAmt > 0)) return;
    const p = PARAMS[key]; if (!p) return;
    if (this.derivaKey !== key || this.derivaBase === undefined) { this.derivaKey = key; this.derivaBase = this.part.engine.S[key]; }
    const ph = this.derivaPhase;
    const w = (Math.sin(beat / 23 + ph[0]) + 0.6 * Math.sin(beat / 37 + ph[1]) + 0.4 * Math.sin(beat / 59 + ph[2])) / 2;
    let v = p.log ? this.derivaBase * Math.pow(2, c.driftAmt * w * 1.5)             // cutoff: in octaves
                  : this.derivaBase + c.driftAmt * w * 0.5 * (p.max - p.min);       // linear: ± half the range
    v = Math.max(p.min, Math.min(p.max, v));
    this.part.engine.set(key, v);
    if (this.c.onDrift) this.c.onDrift(this.i, key, v);
  }
}
