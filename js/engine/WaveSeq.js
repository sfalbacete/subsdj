/* =====================================================================
   SubSDJ · wave sequence (wave sequencing, à la Korg Wavestation).
   The table morph stops being a knob and becomes a PHRASE: steps
   of frames (0..7, '.' = hold) at a musical division, with a crossfade between
   steps. It generates no new spectrum — it arranges IN TIME the frames that
   are already there (rhythm in the timbre domain, not the pitch domain).
   How: automation of the wtPos AudioParam PER VOICE (setValueAtTime +
   linearRampToValueAtTime from its noteOn). Since this is the param's INTRINSIC
   value, the matrix still adds on top (its routes are inputs).
   Each voice starts its phrase at its noteOn: an arpeggiated chord leaves the
   voices offset within the same phrase (impossible with a global LFO).
   The crossfade is a ramp that GOES THROUGH the intermediate frames (phase-
   aligned: a morph sweep, not a pure A→B crossfade — and it sounds better).
   Scheduling:
     - OFFLINE context (selftest, SFZ, preset render): everything at once
       in attach(), up to the end of the buffer — there is no reliable setInterval
       when the render runs faster than the wall clock.
     - real time, '1shot' mode: the whole phrase in attach() (≤16 steps,
       bounded) — a multi-segment timbre envelope; it stays on the last one.
     - real time, 'loop' mode: same pattern as Arp/Seq — a 25 ms setInterval
       that only WAKES the scheduler; 120 ms look-ahead on the
       audio clock. Editing pattern/division/bpm live takes effect on the
       next scheduled step.
   ===================================================================== */
export const WS_MAX_STEPS = 16, WS_TOP = 7;   // tokens 0..7 = the 8 frames of a set (pos = n/7)

// Token: frame 0..7 (out-of-range numbers are clamped); '.' or anything
// else = hold the previous position (null). Time advances all the same.
export function parseWsPattern(str) {
  return String(str || '').trim().split(/\s+/).filter(Boolean)
    .slice(0, WS_MAX_STEPS)
    .map(tok => /^-?\d+$/.test(tok) ? Math.max(0, Math.min(WS_TOP, +tok)) : null);
}

export class WaveSeq {
  constructor(engine) {
    this.e = engine;
    this.looping = new Set();     // voices in loop (real time): the ticker extends them
    this.timer = null;
    this.uiVoice = null;          // the most recent voice drives the UI's marker
    this.playQ = [];              // its steps already scheduled {i, t0, t1}
    this._patStr = null; this._pat = [];
  }

  _steps() {
    const s = this.e.S.wsPat;
    if (s !== this._patStr) { this._patStr = s; this._pat = parseWsPattern(s); }
    return this._pat;
  }
  _dur() {
    const S = this.e.S;
    return (60 / this.e.bpm) * ({ '1/4': 1, '1/8': 0.5, '1/16': 0.25 }[S.wsDiv] || 0.25);   // the Room's BPM (with Parts, shared by all)
  }

  // Hooks up a freshly created voice (called from both of the engine's `new Voice`).
  // Only acts with wsOn and some oscillator in 'wavetable' mode; the phrase's
  // state lives IN the voice ({idx, nextT, pos}) — the ticker is shared.
  attach(v) {
    const S = this.e.S;
    if (S.wsOn !== 'on') return;
    const wts = v.oscs.filter(o => o.isWt && o.wt).map(o => o.wt);
    if (!wts.length || !this._steps().length) return;
    v._ws = { wts, idx: 0, nextT: v.t0, pos: S.wtPos, first: true };
    this.uiVoice = v; this.playQ = [];
    const offline = typeof OfflineAudioContext !== 'undefined' && this.e.ctx instanceof OfflineAudioContext;
    if (offline) {
      this._extend(v, this.e.ctx.length / this.e.ctx.sampleRate);
    } else if (S.wsMode === '1shot') {
      this._extend(v, Infinity);                 // bounded by the phrase's length
    } else {
      this._extend(v, this.e.ctx.currentTime + 0.12);
      this.looping.add(v);
      if (!this.timer) this.timer = setInterval(() => this._tick(), 25);
    }
  }

  // Schedules the voice's steps up to `horizon`. In '1shot' it stops when the
  // phrase runs out (idx does not cycle); in loop it cycles with a PER-STEP modulo (editable live).
  _extend(v, horizon) {
    const S = this.e.S, w = v._ws;
    // hidden tab: silently consume the missed steps (pos up to date, no burst)
    const now = this.e.ctx.currentTime;
    while (w.nextT < now - 0.05 && S.wsMode !== '1shot') {
      const st = this._steps()[w.idx % this._steps().length];
      if (st !== null && st !== undefined) w.pos = st / WS_TOP;
      w.idx++; w.nextT += this._dur(); w.first = false;
    }
    while (w.nextT < horizon) {
      const steps = this._steps();
      if (!steps.length) return;
      if (S.wsMode === '1shot' && w.idx >= steps.length) return;
      const i = w.idx % steps.length, st = steps[i], dur = this._dur(), t = w.nextT;
      if (st !== null) {
        const to = st / WS_TOP;
        const xf = w.first ? 0 : Math.max(0, Math.min(1, S.wsXf)) * dur;  // step 1 STARTS pinned
        for (const wt of w.wts) {
          wt.setValueAtTime(w.pos, t);           // anchor: the ramp starts here, not from the previous event
          if (xf > 0.003) wt.linearRampToValueAtTime(to, t + xf);
          else wt.setValueAtTime(to, t);
        }
        w.pos = to;
      }
      if (v === this.uiVoice) {
        this.playQ.push({ i, t0: t, t1: t + dur });
        if (this.playQ.length > 64) this.playQ.shift();   // cap in case the UI does not consume
      }
      w.first = false;
      w.idx++;
      w.nextT += dur;
    }
  }

  _tick() {
    const horizon = this.e.ctx.currentTime + 0.12;
    for (const v of this.looping) {
      if (v.disposed) { this.looping.delete(v); continue; }
      this._extend(v, horizon);
    }
    if (!this.looping.size) { clearInterval(this.timer); this.timer = null; }
  }

  // The step SOUNDING now in the most recent voice (for the UI's marker);
  // -1 if no voice is sequencing. Prunes the queue of expired steps.
  playingStep() {
    if (!this.uiVoice || this.uiVoice.disposed || !this.e.ctx) return -1;
    const t = this.e.ctx.currentTime;
    while (this.playQ.length && this.playQ[0].t1 <= t) this.playQ.shift();
    const c = this.playQ[0];
    return c && c.t0 <= t ? c.i : -1;
  }
}
