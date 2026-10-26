/* =====================================================================
   SubSDJ · Conductor — the scene's master clock: it keeps the musical
   position (in beats; bar = 4), the harmony, the arrangement and one player per
   part. Same pattern as Arp/Seq: a 25 ms setInterval that only
   WAKES the scheduler; each player schedules its notes on the audio
   clock with a 120 ms look-ahead. The tempo is the Room's BPM (S.bpm,
   shared): if it changes, it changes from the current position without jumps.
   The position lives in the context's COMMON CLOCK (engine/Clock.js): on
   starting, the conductor anchors its beat 0 and the parts' Arp/Seq land
   on its grid.
   Every ~100 ms it applies the slow stuff: the Open MACRO (arrangement energy →
   cents on the filters of all parts) and each player's drift.
   Offline (selftest): scheduleAll() schedules the whole stretch at once, with no
   ticker — deterministic with the seed; the macro is automated per
   bar on the AudioParam itself. `dry` = only log events.
   toJSON/fromJSON: what the scene saves of the conductor (seed, harmony,
   arrangement and each player's configuration).
   ===================================================================== */
import { Harmony } from './Harmony.js';
import { Player, PLAYER_DEF } from './Player.js';
import { Arrangement } from './Arrangement.js';
import { clockOf } from './Clock.js';

export const BEATS_PER_BAR = 4;
const LOOKAHEAD = 0.12, TICK_MS = 25, SLOW_S = 0.1;

export class Conductor {
  constructor(scene, { seed = 1 } = {}) {
    this.scene = scene; this.ctx = scene.ctx;
    this.seed = seed;
    this.harmony = new Harmony({ seed });
    this.arr = new Arrangement(this);
    this.players = scene.parts.map((p, i) => new Player(this, p, i));
    this.timer = null; this.running = false; this.dry = false;
    this.clock = clockOf(this.ctx);     // musical position: origin (beat 0) and bpm, shared with the Arp/Seqs
    this._slowT = -1;
    this.onDrift = null;                // (i, key, value) → the UI moves the knob if it is the part being edited
  }
  get bpm() { return this.scene.S.bpm || 120; }
  beatLen() { return this.clock.beatLen(); }
  timeAt(beat) { return this.clock.timeAt(beat); }
  swungTime(beat, div) { return this.clock.swungTime(beat, div); }   // the step of `div` at `beat`, with the clock's swing
  swingLen(beat, div) { return this.clock.swingLen(beat, div); }
  beatAt(t) { return this.clock.beatAt(t); }
  chordAtBeat(b) { return this.harmony.chordAt(Math.floor(b / BEATS_PER_BAR + 1e-9)); }
  arrangeFor(player, b) { return this.arr.stateAt(Math.floor(b / BEATS_PER_BAR + 1e-9), player.i, player.cfg); }
  barNow() { return Math.max(0, Math.floor(this.beatAt(this.ctx.currentTime) / BEATS_PER_BAR)); }

  setSeed(seed) { this.seed = seed; this.harmony.setSeed(seed); this.players.forEach(p => p.reset()); }

  start() {
    if (this.timer) return;
    this.clock.anchor(this, this.ctx.currentTime + 0.05, this.bpm);
    this.players.forEach(p => p.reset());
    this.running = true; this._slowT = -1;
    this._tick();
    this.timer = setInterval(() => this._tick(), TICK_MS);
  }
  stop() {
    if (!this.timer) return;
    clearInterval(this.timer); this.timer = null; this.running = false;
    this.clock.leave(this);
    const t = this.ctx.currentTime;
    this.players.forEach(p => {
      p.stop(t); const e = p.part.engine; e.setMacro(0);
      // a latched Seq would keep the phrase going after the root is released: stopping means stopping
      if (e.S.seqOn === 'on' && !e.seq.held.length && e.seq.latched) { e.seq.latched = null; e.seq._maybeStop(); }
    });
  }
  // Panic: stops the conductor, cancels what is pending and cuts everything in all parts
  panic() {
    this.stop();
    this.players.forEach(p => { p.clearPending(); p.part.engine.allNotesOff(); });
  }
  _tick() {
    const now = this.ctx.currentTime;
    this.clock.setBpm(this.bpm, now);                                         // a new BPM re-anchors at the current beat: no jumps
    const until = this.beatAt(now + LOOKAHEAD);
    for (const p of this.players) p.schedule(until);
    if (now - this._slowT >= SLOW_S) {                                        // the slow stuff: Open macro and drift
      this._slowT = now;
      const beat = this.beatAt(now), cents = this.arr.macroCents(beat / BEATS_PER_BAR);
      for (const p of this.players) { p.part.engine.setMacro(cents); p.drift(beat); }
    }
  }
  // Offline: `secs` seconds from t0, all at once (notes + macro per bar)
  scheduleAll(secs, t0 = 0) {
    this.clock.anchor(this, t0, this.bpm);
    this.players.forEach(p => p.reset());
    const until = secs / this.beatLen();
    for (const p of this.players) p.schedule(until);
    if (!this.dry) {
      const barLen = BEATS_PER_BAR * this.beatLen();
      for (let bar = 0; bar * barLen <= secs; bar++) {
        const cents = this.arr.macroCents(bar), t = t0 + bar * barLen;
        for (const p of this.players) p.part.engine.automateMacro(cents, t, bar > 0);
      }
    }
  }

  toJSON() {
    const h = this.harmony;
    return { seed: this.seed, harmony: { root: h.root, scale: h.scale, prog: [...h.prog], bars: h.bars, mode: h.mode },
             arrangement: { ...this.arr.cfg }, players: this.players.map(p => ({ ...p.cfg })) };
  }
  fromJSON(j) {
    if (!j) return;
    if (this.running) this.stop();
    if (j.harmony) Object.assign(this.harmony, j.harmony);
    if (j.arrangement) Object.assign(this.arr.cfg, j.arrangement);
    (j.players || []).forEach((cfg, i) => {
      const p = this.players[i]; if (!p) return;
      p.cfg = { ...PLAYER_DEF, ...cfg }; p.derivaKey = 'off'; p.derivaBase = undefined;
      if (p.cfg.drift === 'mix') p.cfg.drift = 'levelB';   // scenes from before the mixer (1.2.0)
    });
    this.setSeed(+j.seed || 1);         // resets the players and the walk with the saved seed
  }
}
