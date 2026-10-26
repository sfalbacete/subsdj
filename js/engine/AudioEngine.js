/* =====================================================================
   SubSDJ · AudioEngine — the graph of ONE instrument: LFOs, voice management,
   inserts. Chain:
     voicesBus(auto-gain) -> amp(+tremolo LFO) -> distortion -> flanger
       -> chorus|ensemble -> level -> [dry + delay send + reverb send]
       -> Sala (engine/Room.js, the Room: ping-pong delay, reverb, limiter, master)
   Usual mode: the engine creates its own Room. Parts mode (parts.js):
   several engines share ONE Room (send/return model).
   The filter is PER VOICE (in Voice.js). The cutoff/reso/freq/pwm LFOs
   are global to the engine but are connected to each voice's params when it is created
   (or, with lfoPhase 'voice', each voice creates its copies at its own phase: nodes.mkVoiceLFO).
   ===================================================================== */
import { makeDefaultState } from './state.js';
import { Voice } from './Voice.js';
import { Arp } from './Arp.js';
import { Seq } from './Seq.js';
import { WaveSeq } from './WaveSeq.js';
import { clockOf } from './Clock.js';
import { Steps } from './Steps.js';
import { getWtSet } from './wavetable.js';

import { makeNoise, makeWander, makeDistCurve, mkLFO, mkPhasedLFO, setLfoRate, setLfoShape, setLfoSync } from './nodes.js';
import { LFO_KEYS, lfoHz, lfoBeats, STR_KEYS } from './params.js';
import { Sala, SALA_KEYS } from './Room.js';

const MAX_POLY = 10;    // voices held at once; beyond that, the oldest is stolen
const MAX_TAILS = 16;   // live release tails; above that, the oldest one fades out (TAIL_FADE)
// Fade of the surplus tail. It was 10 ms («among 12 tails it's inaudible»): with
// 20-30 s releases (Roadmap 5.0) the oldest tail still sounds at half level
// when its turn to go comes, and a 10 ms cut is heard as a pad click. 350 ms
// among 16 tails and the reverb can't be told apart from the natural decay.
const TAIL_FADE = 0.35;
// Mono with trigger «Retrig»: the sounding voice fades out while the attack of the
// new one rises (handover at the same instant, max(MONO_XF, attack)). It's what an
// analog ADSR does when retriggered from its current level, without the dip back to 0.
const MONO_XF = 0.005;
// Audio CPU budget (live only). All the engines of the SAME context — the
// 4 parts of a scene — render on the same audio thread, so the limit is
// SHARED: it is kept per context (budgetOf), not per engine. Each voice weighs
// what the things it has switched on cost (Voice.cost, in «simple voices»: two
// saws with a static filter = 1). When over, it frees from what is heard least
// to what is heard most: (1) the oldest release tail of ANY part, faded out in
// TAIL_FADE; (2) the oldest held voice of the part asking for the note — never
// a sustained note of another instrument.
// VOICE_BUDGET: 30 simple voices ≈ 47 % of a core on the reference PC, plus
// the effects and the Room (4-15 %): the thread stays below ~60 %, with
// headroom for peaks (voices created in bursts). Offline (selftest, SFZ) there
// are no deadlines and no limit.
export const VOICE_BUDGET = 30;
// Fixed cost of an engine with no notes, in the same «simple voices» (measured: 2.5 %
// of a core with its Room and no effects; each effect, what it adds when on).
const ENGINE_COST = { base: 1, dist: 0.17, fl: 0.14, ch: 0.22, ens: 0.37 };
const budgets = new WeakMap();
const budgetOf = ctx => { let s = budgets.get(ctx); if (!s) budgets.set(ctx, (s = new Set())); return s; };
// Performance sources (wheel, aftertouch, expression): smoothing of MIDI's 1/127 jumps
const PERF_TAU = 0.02;
// AC coupling of each part's output (polish, 2026-10-25): a one-pole high-pass
// at AC_HZ, like the output capacitor of an analog synth. A pulse with a width other than
// 50 % has a mean ≠ 0 (the «Square Lead» carried 57 % of its level as DC): it ate
// headroom on one side, saturated asymmetrically in the tape and the limiter, and built up in
// the delay loop. It sits at the END of the part (after distortion, flanger and chorus: it catches
// whatever any of them adds), before the sends. At 20 Hz it takes off 0.25 dB; above, nothing
// audible. The pulse, besides, comes out centred from the oscillator (pulse-processor): its PWM
// no longer moves the DC.
const AC_HZ = 5;
const MACROS = [['mac1', 'macro1'], ['mac2', 'macro2']];   // matrix source ← preset parameter

// Loading of the worklets into a context, ONCE per context (used by init() and
// parts.createScene, which builds the shared Room before any engine).
// The ?v=N breaks the browser's heuristic cache: BUMP IT when worklet code
// changes (otherwise the browser may pair new modules with an old processor
// and the new parameters arrive undefined -> crash when creating voices).
const WK_V = '?v=16';  // v16: waves 'wavetable' and 'string' (formerly 'tabla' and 'cuerda'); v15: the pulse comes out centred (without the DC of its width); v14: «string» wave (Karplus-Strong); v13: hard sync (syncRatio, slave) in the oscillator; v12: the limiter sends peaks and reduction to the meter; v11: seeded randomness + key sync of the 2-op FM modulator; v10: shift-processor (shimmer) + plate decay up to 1 (freeze); v9: start gate at t0 + FM4 clock
const workletsLoaded = new WeakSet();
export async function loadWorklets(ctx) {
  if (workletsLoaded.has(ctx)) return;
  await Promise.all(['pulse-processor', 'recorder-processor', 'plate-processor', 'shift-processor', 'limiter-processor']
    .map(n => ctx.audioWorklet.addModule(new URL('./worklets/' + n + '.js' + WK_V, import.meta.url))));
  workletsLoaded.add(ctx);
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.S = makeDefaultState();
    this.voices = new Map();      // id -> Voice (HELD voices)
    this.tails = new Set();       // released voices playing their release
    this.voiceCount = 0;
    this.lastFreq = null;         // for glide
    this.heldStack = [];          // notes held in mono mode (top = sounding)
    this.monoVoice = null;        // single voice in mono mode
    this.arp = new Arp(this);     // arpeggiator (active when S.arpMode != 'off')
    this.seq = new Seq(this);     // step sequencer (active when S.seqOn == 'on')
    this.wseq = new WaveSeq(this);// wave sequence (active when S.wsOn == 'on')
    this.steps = new Steps(this); // Steps: 4 lanes for the matrix (Roadmap 7.0 · 2.3)
    this.perfVal = { wheel: 0, at: 0, expr: 0 };   // performance sources (0..1); the nodes are born in init()
  }

  // optional ctx: the self-test passes an OfflineAudioContext; by default it creates the real one.
  // optional sala: the SHARED Room (Parts mode); without it the engine creates its own.
  async init(providedCtx = null, { sala = null } = {}) {
    if (this.ctx) return;
    const ctx = providedCtx || new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    // Offline render (selftest, SFZ): the audio clock runs faster than the
    // wall clock, so the tail timers are useless (and would kill voices at
    // the wrong time, NON-deterministically). No tail limit offline.
    this.offline = typeof ctx.startRendering === 'function';
    this.budget = budgetOf(ctx); this.budget.add(this);   // CPU budget shared by the engines of this context
    this.noiseBuffer = makeNoise(ctx);
    this.wanderBuffer = makeWander(ctx);   // shared slow drift (Vocal · Life)

    await loadWorklets(ctx);               // pulse, recorder and plate (once per context)

    const S = this.S;

    this.voicesBus = ctx.createGain(); this.voicesBus.gain.value = 1;
    this.amp = ctx.createGain(); this.amp.gain.value = S.amplitude;

    // INSERT EFFECTS ON DEMAND. Of each effect only the DRY path always exists
    // (a gain); the wet — the ×2 WaveShaper of the distortion, the modulated
    // delay lines of the flanger, the chorus and the ensemble, and their 9
    // LFOs — is born the first time its amount rises above 0 (_ensureDist, _ensureFl,
    // _ensureCh, _ensureEns) and stays. At 0 the output is the same (it added 0),
    // but an engine with no notes cost ~4 % of a core with everything at 0 — and in
    // Parts there are five engines (the 4 parts and the single one, silent underneath).
    // Distortion (dry/wet: at 0 it is TRANSPARENT). A WaveShaper clips to ±1 any
    // peak >1 that enters it, so keeping it always in series saturated with polyphony.
    // Only the "wet" part is mixed in according to the drive; at 0 everything passes dry.
    this.distDry = ctx.createGain(); this.distDry.gain.value = 1 - S.dist;
    this.distOut = ctx.createGain();
    this.flDry = ctx.createGain(); this.flOut = ctx.createGain();     // flanger
    // Stereo chorus (two short lines modulated at different speeds) and
    // ensemble (Solina-style triple chorus): see _ensureCh / _ensureEns
    this.chDry = ctx.createGain(); this.chOut = ctx.createGain();
    this.ensSlow = []; this.ensFast = [];

    // --- Engine output: level → dry + two SENDS (delay, reverb) → Room ---
    // The Room (engine/Room.js) is the space: tape ping-pong delay, reverb,
    // limiter, master and analyser. Usual mode: this engine creates its own
    // (and `master` is its master, as always). Parts mode (engine/parts.js):
    // it receives the SHARED Room; `master` becomes the part's fader and
    // the Room knobs (time, damp, size, bpm…) edit it for all of them.
    this.ownsSala = !sala;
    this.sala = sala || new Sala(ctx, S, { fb: S.dlyFb, dlyToRev: S.reverbMix, master: S.master });
    this.sala.engines.push(this);
    this.level = ctx.createGain(); this.level.gain.value = this.ownsSala ? 1 : S.master;
    this.muteG = ctx.createGain();                                            // part mute (Part Mixer)
    this.partPan = ctx.createStereoPanner();                                  // part pan (Part Mixer)
    this.sendDly = ctx.createGain(); this.sendDly.gain.value = S.dlyAmt;      // delay send
    this.sendRev = ctx.createGain(); this.sendRev.gain.value = S.reverbMix;   // reverb send

    // Global connections (the wets get hooked when they are created)
    this.acCoup = ctx.createIIRFilter([1, -1], [1, -Math.exp(-2 * Math.PI * AC_HZ / ctx.sampleRate)]);   // no DC (see AC_HZ)
    this.voicesBus.connect(this.amp);
    this.amp.connect(this.distDry); this.distDry.connect(this.distOut);
    this.distOut.connect(this.flDry); this.flDry.connect(this.flOut);
    this.flOut.connect(this.chDry); this.chDry.connect(this.chOut);
    // Output: chOut -> level -> mute -> [pan -> Room dry] + [sends]
    this.chOut.connect(this.acCoup); this.acCoup.connect(this.level); this.level.connect(this.muteG);   // no DC, wherever it comes from (see AC_HZ)
    this.muteG.connect(this.partPan); this.partPan.connect(this.sala.dry);
    this.muteG.connect(this.sendDly); this.sendDly.connect(this.sala.dlyIn);
    this.muteG.connect(this.sendRev); this.sendRev.connect(this.sala.revIn);

    // LFOs
    this.ampLFO = mkLFO(ctx, S.ampLfoSpd, S.ampLfoLvl); this.ampLFO.depth.connect(this.amp.gain);
    this.cutLFO = mkLFO(ctx, S.cutLfoSpd, S.cutLfoLvl);   // depth is connected per voice
    this.resLFO = mkLFO(ctx, S.resLfoSpd, S.resLfoLvl);
    this.freqLFO = mkLFO(ctx, S.freqLfoSpd, S.freqLfoLvl);
    this.pwmLFO = mkLFO(ctx, S.pwmLfoSpd, S.pwmLfoLvl);
    this.panLFO = mkLFO(ctx, S.panLfoSpd, S.panLfoLvl);   // autopan: depth is connected per voice
    if (S.dist > 0) this._ensureDist();                  // effects the state already brings switched on
    if (S.flAmt > 0) this._ensureFl();
    if (S.chAmt > 0) { if (S.chMode === 'ensemble') this._ensureEns(); else this._ensureCh(); }
    // LFO waveforms (the state may bring them from a preset); sin/tri/saw/sqr
    // are the native oscillator, S&H and drift an alternative source (nodes.js)
    setLfoShape(ctx, this.ampLFO, S.ampLfoShape);   setLfoShape(ctx, this.freqLFO, S.freqLfoShape);
    setLfoShape(ctx, this.pwmLFO, S.pwmLfoShape);   setLfoShape(ctx, this.cutLFO, S.cutLfoShape);
    setLfoShape(ctx, this.resLFO, S.resLfoShape);
    // Tempo LFO (Roadmap 7.0 · 2.2): the shared clock notifies when the BPM or the
    // origin changes, and the synced LFOs (global ones and each voice's own) go back to their grid
    const clock = clockOf(ctx);
    clock.setBpm(this.bpm, ctx.currentTime);
    clock.swing = (this.sala && this.sala.S.swing) || S.swing || 0.5;   // swing: from the Room, like the BPM
    this._unlisten = clock.listen(() => this._lfoClock());
    this._lfoClock();

    this.pitchOffset = ctx.createConstantSource(); this.pitchOffset.offset.value = S.freqCents; this.pitchOffset.start();
    // Opening macro (the scene's arrangement): cents that are ADDED to the detune
    // of the filters of all the voices (exponential, never crossing 0 Hz — the
    // same route as the matrix's Cutoff target). At 0 it does nothing — and it isn't
    // connected to the voices until the arrangement moves it (_macroOn): connected,
    // even at 0, each voice's filter would recompute coefficients per sample.
    this.macroCut = ctx.createConstantSource(); this.macroCut.offset.value = 0; this.macroCut.start();
    this._macroOn = false;
    // PERFORMANCE sources (Roadmap 5.0 · block 4): wheel (CC1), aftertouch and
    // expression (CC11) as a 0..1 ConstantSource per engine; the matrix offers them
    // as sources 'wheel' / 'at' / 'expr' (Voice._mxSrcNode). They arrive via MIDI
    // (ui/midi.js) or via the on-screen wheel (ui/keyboard.js); in Parts mode
    // they go to all the parts (parts.setPerf), like the bend.
    this.perf = {};
    for (const k in this.perfVal) { const c = ctx.createConstantSource(); c.offset.value = this.perfVal[k]; c.start(); this.perf[k] = c; }
    // Macros (Roadmap 7.0 · 2.5): same path as the performance ones, but their value
    // belongs to the preset (S.macro1/2), not to a gesture: sources 'mac1' / 'mac2'
    for (const [k, p] of MACROS) { const c = ctx.createConstantSource(); c.offset.value = S[p] || 0; c.start(); this.perf[k] = c; }

    // modulation hub passed to each voice
    this.modStats = { worklets: 0 };     // counter of live worklet oscillators (HUD)
    this.mod = {
      voicesBus: this.voicesBus, noiseBuffer: this.noiseBuffer, wanderBuffer: this.wanderBuffer,
      pitchOffset: this.pitchOffset, macroCut: this.macroCut, macroOn: () => this._macroOn, perf: this.perf,
      lfoHz: k => this._lfoHz(k),        // effective speed of LFO k (in tempo: the division at the BPM)
      stepSrc: (i, t) => this.steps.source(i, t),   // Steps i (continuous): the engine's source
      stepVal: (i, t) => this.steps.valueAt(i, t),  // Steps i · note: the step's value at t
      freqLFOGain: this.freqLFO.depth, pwmLFOGain: this.pwmLFO.depth,
      cutLFOGain: this.cutLFO.depth, resLFOGain: this.resLFO.depth,
      panLFOGain: this.panLFO.depth,
      // modulation matrix: the LFOs come in RAW (their `out` output, ±1, whether
      // oscillator or S&H/drift) — each LFO's Level knob governs its dedicated
      // route, not the matrix
      mxLfo: { lfoAmp: this.ampLFO.out, lfoFreq: this.freqLFO.out, lfoPwm: this.pwmLFO.out,
               lfoCut: this.cutLFO.out, lfoRes: this.resLFO.out },
      stats: this.modStats,
    };
    // Look-ahead of live notes (read by Voice): the clock the main thread sees
    // lags behind the audio thread by up to one device callback period
    // (baseLatency: 128 samples headless, 10-20 ms on a WASAPI card) and
    // events take about as long again to arrive. With a fixed 5 ms, on some
    // cards the VCA opening, the pitch blip and the flam bursts landed
    // «in the past» and were applied all at once: the kick only hit sometimes (in
    // headless and offline the delay is constant and it doesn't show). Offline: 5 ms (golden).
    this.mod.lookahead = this.offline ? 0.005 : Math.max(0.005, 0.005 + 2 * (ctx.baseLatency || 0.01));
    if (!this.offline) console.info('SubSDJ · note look-ahead', (this.mod.lookahead * 1000).toFixed(1), 'ms (baseLatency', ((ctx.baseLatency || 0) * 1000).toFixed(1), 'ms · outputLatency', ((ctx.outputLatency || 0) * 1000).toFixed(1), 'ms)');

    this.ready = true;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  // The right BPM is the ROOM's: in Parts it is shared and only the selected part
  // receives the knob (its S.bpm); the others would have the old one.
  get bpm() { return (this.sala && this.sala.S.bpm) || this.S.bpm || 120; }
  _lfoHz(k) { return lfoHz(this.S, k, clockOf(this.ctx).bpm); }   // with sync, the division at the clock's BPM (= the Room's)
  _lfoClock() {
    if (!this.ctx) return;
    const clock = clockOf(this.ctx);
    for (const k of LFO_KEYS) {
      const beats = lfoBeats(this.S, k), lfo = this[k + 'LFO'];
      if (!lfo || (!beats && !lfo.sync)) continue;
      const hz = this._lfoHz(k);
      setLfoSync(this.ctx, lfo, beats, clock, hz);
      if (k !== 'amp') this._forVoices(v => v.setLfo(k, 'spd', hz));
    }
  }

  // ---------- voices ----------
  // when (optional): audio time of the key — the players; the Arp/Seq put it into that grid step
  noteOn(id, freq, vel = 1, when = null) {
    if (!this.ready) return;
    if (this.S.seqOn === 'on') return this.seq.hold(id, freq, vel, when);      // the key is the root of the phrase
    if (this.S.arpMode !== 'off') return this.arp.hold(id, freq, vel, when);   // the arp sequences the notes
    this._directOn(id, freq, vel, when);
  }
  noteOff(id) {
    if (this.S.seqOn === 'on') return this.seq.unhold(id);
    if (this.S.arpMode !== 'off') return this.arp.unhold(id);
    this._directOff(id);
  }
  // Direct path (also used by the arpeggiator, with a scheduled start `when`)
  // acc: 1 if the note carries a sequencer accent (matrix source «Accent»)
  _directOn(id, freq, vel = 1, when = null, acc = 0) {
    if (this.S.mode === 'mono') return this._monoOn(id, freq, vel, when, acc);
    this.steps.noteOn(when !== null ? when : this.ctx.currentTime, !this.voices.size && !this.tails.size);   // Steps: is it starting to play?
    const existing = this.voices.get(id);
    if (existing) { if (existing._timer) clearTimeout(existing._timer); this._dispose(existing); this.voices.delete(id); this.voiceCount = Math.max(0, this.voiceCount - 1); }
    if (this.voiceCount >= MAX_POLY) {                     // voice stealing: the oldest one
      const oldest = this.voices.keys().next().value;      // Map keeps insertion order
      if (oldest !== undefined) this._releaseVoice(oldest, 0.02);
    }
    const cost = Voice.cost(this.S);
    this._makeRoom(cost);                                  // shared CPU budget (see VOICE_BUDGET)
    const v = new Voice(this.ctx, this.S, this.mod, { freq, vel, acc, startFreq: this.lastFreq, startAt: when });
    v.cost = cost;
    if (this._bend) v.ensurePitch();     // bend active: hooks the global pitch to the new voice
    this.wseq.attach(v);                 // wave sequence: each voice starts its phrase at its noteOn
    this.voices.set(id, v);
    this.lastFreq = freq;
    this.voiceCount++; this._updateBusGain();
  }
  // optional `when`: note-off scheduled on the audio clock (players)
  _directOff(id, when = null) {
    if (this.S.mode === 'mono') return this._monoOff(id, when);
    this._releaseVoice(id, this.S.r, when);
  }
  // Sequencer tie and slide (Roadmap 7.0 · 5.1): the sounding note `id` changes
  // pitch at t WITHOUT a new attack — over `time` s, or at once with 0. Poly: its voice;
  // Mono: the single voice (and the note in the stack moves to that pitch).
  _directGlide(id, freq, t, time = 0) {
    if (this.S.mode === 'mono') {
      const n = this.heldStack.find(h => h.id === id); if (n) n.freq = freq;
      if (this.monoVoice && !this.monoVoice.disposed) this.monoVoice.glideTo(freq, time, t);
    } else { const v = this.voices.get(id); if (v && !v.disposed) v.glideTo(freq, time, t); }
    this.lastFreq = freq;
  }
  allNotesOff() {
    this.arp.tie = this.seq.tie = this.seq.link = null;   // the tied note that was waiting for its off goes down with the rest (fast cut below)
    this.arp.held = []; this.arp._maybeStop();
    this.seq.held = []; this.seq.latched = null; this.seq._maybeStop();
    this.heldStack = []; this.monoVoice = null;
    for (const id of [...this.voices.keys()]) this._releaseVoice(id, 0.03);
  }

  // ---- mono mode (last-note priority) ----
  // A note that arrives with NO other held always retriggers. If it arrives with another
  // still held, the trigger setting (monoTrig) decides: 'legato' glides the sounding voice
  // without restarting anything; 'retrig' hands over to a new voice (envelopes, pitch env
  // and FM4 operators from the start). «Held» is in MUSICAL time: arp, Seq
  // and players send scheduled on and off in order, so the overlap is
  // decided by the gate, not by how far ahead the scheduler runs.
  _monoOn(id, freq, vel, when = null, acc = 0) {
    const had = this.heldStack.length > 0;
    this.steps.noteOn(when !== null ? when : this.ctx.currentTime, !had && !this.tails.size && !this.monoVoice);
    this.heldStack = this.heldStack.filter(n => n.id !== id);
    this.heldStack.push({ id, freq, vel });
    const old = had && this.monoVoice && !this.monoVoice.disposed ? this.monoVoice : null;
    if (old && this.S.monoTrig !== 'retrig') {
      old.glideTo(freq, this.S.glide, when);   // legato: glides without restarting the envelope
      this.lastFreq = freq;
      return;
    }
    if (old) { this.voices.delete('mono'); this.monoVoice = null; this.voiceCount = Math.max(0, this.voiceCount - 1); }
    else this._killMono();
    const cost = Voice.cost(this.S);
    this._makeRoom(cost);
    const v = new Voice(this.ctx, this.S, this.mod, { freq, vel, acc, startFreq: this.lastFreq, startAt: when });
    v.cost = cost;
    if (this._bend) v.ensurePitch();
    this.wseq.attach(v);               // in legato the voice is NOT recreated: the phrase carries on (like the Seq)
    this.monoVoice = v; this.voices.set('mono', v);
    this.lastFreq = freq;
    this.voiceCount++; this._updateBusGain();
    // handover (retrig): the old one starts fading out right when the new one starts
    // (release(at) adds its lag: v.t0 − old.lag lands exactly on v.t0)
    if (old) this._scheduleTail(old, Math.max(MONO_XF, this.S.a), v.t0 - old.lag);
  }
  _monoOff(id, when = null) {
    const i = this.heldStack.findIndex(n => n.id === id);
    if (i < 0) return;   // foreign id (note-off from another part): neither re-glides nor releases someone else's voice
    const wasTop = i === this.heldStack.length - 1;
    this.heldStack.splice(i, 1);
    if (this.heldStack.length) {
      // the sounding one is released: it goes back to the one below, gliding (releasing another changes nothing)
      const top = this.heldStack[this.heldStack.length - 1];
      if (wasTop && this.monoVoice && !this.monoVoice.disposed) { this.monoVoice.glideTo(top.freq, this.S.glide, when); this.lastFreq = top.freq; }
    } else {
      this._releaseMono(this.S.r, when);
    }
  }
  _releaseMono(rel, when = null) {
    const v = this.monoVoice; if (!v) return;
    this.voices.delete('mono'); this.monoVoice = null;
    this.voiceCount = Math.max(0, this.voiceCount - 1); this._updateBusGain();
    this._scheduleTail(v, rel, when);
  }
  _killMono() {
    const v = this.monoVoice; if (!v) return;
    if (v._timer) clearTimeout(v._timer);
    this._dispose(v); this.voices.delete('mono'); this.monoVoice = null;
    this.voiceCount = Math.max(0, this.voiceCount - 1); this._updateBusGain();
  }

  _releaseVoice(id, rel, when = null) {
    const v = this.voices.get(id); if (!v) return;
    this.voices.delete(id);
    this.voiceCount = Math.max(0, this.voiceCount - 1);   // stops counting as "held" on release
    this._updateBusGain();
    this._scheduleTail(v, rel, when);
  }
  // The released voice becomes a "tail": it plays its release and is freed when done.
  // MAX_TAILS bounds the cost of piling up long tails when playing fast.
  _scheduleTail(v, rel, when = null) {
    this.tails.add(v);
    v._relAt = when !== null ? when : this.ctx.currentTime;   // age of the tail: the budget fades out the oldest first
    const end = v.release(rel, when);
    if (this.offline) return;                     // offline: the tail lives until the end of the render
    const ms = Math.max(20, (end - this.ctx.currentTime) * 1000 + 60);
    v._timer = setTimeout(() => { this.tails.delete(v); this._dispose(v); this._maybeIdle(); }, ms);
    if (this.tails.size > MAX_TAILS) this._fadeKill(this.tails.values().next().value);
  }
  _fadeKill(v) {            // TAIL_FADE fade-out and free (see above)
    if (!v) return;
    v._going = true;
    this.tails.delete(v);
    if (v._timer) clearTimeout(v._timer);
    if (v.disposed) return;
    v.fadeOut(TAIL_FADE);
    v._timer = setTimeout(() => { this._dispose(v); this._maybeIdle(); }, TAIL_FADE * 1000 + 60);
  }
  // All silent (no voices, no tails): the Steps let go of the clock (reset «on play»)
  _maybeIdle() { if (!this.voices.size && !this.tails.size) this.steps.idle(); }
  // ---------- insert effects on demand (see init) ----------
  _ensureDist() {
    if (this.shaper) return;
    const ctx = this.ctx, S = this.S;
    this.distPre = ctx.createGain(); this.distPre.gain.value = 1 + S.dist * 6;
    this.shaper = ctx.createWaveShaper(); this.shaper.curve = makeDistCurve(); this.shaper.oversample = '2x';
    this.distPost = ctx.createGain(); this.distPost.gain.value = 1 / (1 + S.dist);
    this.distWet = ctx.createGain(); this.distWet.gain.value = S.dist;
    this.amp.connect(this.distPre); this.distPre.connect(this.shaper); this.shaper.connect(this.distPost);
    this.distPost.connect(this.distWet); this.distWet.connect(this.distOut);
  }
  _ensureFl() {
    if (this.flDelay) return;
    const ctx = this.ctx, S = this.S;
    this.flDelay = ctx.createDelay(0.05); this.flDelay.delayTime.value = 0.003;
    this.flFb = ctx.createGain(); this.flFb.gain.value = 0.35;
    this.flWet = ctx.createGain(); this.flWet.gain.value = S.flAmt;
    this.distOut.connect(this.flDelay); this.flDelay.connect(this.flWet); this.flWet.connect(this.flOut);
    this.flDelay.connect(this.flFb); this.flFb.connect(this.flDelay);
    this.flLFO = mkLFO(ctx, S.flSpd, 0.002); this.flLFO.depth.connect(this.flDelay.delayTime);
  }
  // Stereo chorus: two short lines modulated by LFOs at different
  // speeds (decorrelates L/R), no feedback.
  _ensureCh() {
    if (this.chWet) return;
    const ctx = this.ctx, S = this.S;
    this.chSend = ctx.createGain(); this.chSend.channelCount = 1; this.chSend.channelCountMode = 'explicit';
    this.chD1 = ctx.createDelay(0.06); this.chD1.delayTime.value = 0.020;
    this.chD2 = ctx.createDelay(0.06); this.chD2.delayTime.value = 0.028;
    this.chMerge = ctx.createChannelMerger(2);
    this.chWet = ctx.createGain(); this.chWet.gain.value = S.chMode === 'chorus' ? S.chAmt : 0;
    this.flOut.connect(this.chSend);
    this.chSend.connect(this.chD1); this.chSend.connect(this.chD2);
    this.chD1.connect(this.chMerge, 0, 0); this.chD2.connect(this.chMerge, 0, 1);
    this.chMerge.connect(this.chWet); this.chWet.connect(this.chOut);
    this.chLFO1 = mkLFO(ctx, S.chSpd, 0.006); this.chLFO1.depth.connect(this.chD1.delayTime);
    this.chLFO2 = mkLFO(ctx, S.chSpd * 1.17, 0.008); this.chLFO2.depth.connect(this.chD2.delayTime);
  }
  // "String machine" ensemble (Solina-style triple chorus): 3 lines of
  // ~5 ms, each modulated by the SUM of a slow LFO (chSpd) and a fast
  // one (x10), with the phases spread 120° apart between lines. Line 1 -> L,
  // line 3 -> R, line 2 in the center. Shares chAmt/chSpd with the chorus;
  // chMode decides which of the two wets sounds (the other stays at 0).
  _ensureEns() {
    if (this.ensWet) return;
    const ctx = this.ctx, S = this.S;
    this.ensSend = ctx.createGain(); this.ensSend.channelCount = 1; this.ensSend.channelCountMode = 'explicit';
    this.ensL = ctx.createGain(); this.ensR = ctx.createGain();
    this.ensL.gain.value = this.ensR.gain.value = 0.6;   // 2 lines per channel ~ chorus level
    this.ensCtr = ctx.createGain(); this.ensCtr.gain.value = 0.71;
    this.ensMerge = ctx.createChannelMerger(2);
    this.ensWet = ctx.createGain(); this.ensWet.gain.value = S.chMode === 'ensemble' ? S.chAmt : 0;
    this.ensDelays = [];
    for (let i = 0; i < 3; i++) {
      const d = ctx.createDelay(0.03); d.delayTime.value = 0.005;
      const slow = mkPhasedLFO(ctx, S.chSpd, 0.0022, i * 120);
      const fast = mkPhasedLFO(ctx, Math.min(12, S.chSpd * 10), 0.00035, i * 120 + 90);
      slow.depth.connect(d.delayTime); fast.depth.connect(d.delayTime);
      this.ensDelays.push(d); this.ensSlow.push(slow); this.ensFast.push(fast);
    }
    this.flOut.connect(this.ensSend);
    this.ensDelays.forEach(d => this.ensSend.connect(d));
    this.ensDelays[0].connect(this.ensL);
    this.ensDelays[2].connect(this.ensR);
    this.ensDelays[1].connect(this.ensCtr); this.ensCtr.connect(this.ensL); this.ensCtr.connect(this.ensR);
    this.ensL.connect(this.ensMerge, 0, 0); this.ensR.connect(this.ensMerge, 0, 1);
    this.ensMerge.connect(this.ensWet); this.ensWet.connect(this.chOut);
  }
  // Fixed cost of the engine (no notes) in «simple voices», measured: the shared
  // budget counts it along with the voices (in Parts there are five engines).
  engineCost() {
    if (!this.ready) return 0;
    return ENGINE_COST.base + (this.shaper ? ENGINE_COST.dist : 0) + (this.flDelay ? ENGINE_COST.fl : 0)
      + (this.chWet ? ENGINE_COST.ch : 0) + (this.ensWet ? ENGINE_COST.ens : 0);
  }
  // CPU budget (VOICE_BUDGET): makes room for a voice of cost `cost`
  // adding up what ALL the engines of this context are playing. First it fades out the
  // oldest tail of any of them; if there are no tails left, it steals the oldest
  // held voice of THIS engine (the part asking for the note). What is already
  // on its way out (_going) doesn't count: it frees CPU as soon as its fade ends.
  _makeRoom(cost) {
    if (this.offline) return;
    const live = v => v && !v.disposed && !v._going;
    let used = 0;
    for (const e of this.budget) {
      used += e.engineCost();
      for (const v of e.voices.values()) if (live(v)) used += v.cost || 1;
      for (const v of e.tails) if (live(v)) used += v.cost || 1;
    }
    while (used + cost > VOICE_BUDGET + 1e-9) {          // (margin: so that rounding in the sum doesn't fade out one tail too many)
      let old = null, owner = null;
      for (const e of this.budget) for (const v of e.tails) if (live(v) && (!old || v._relAt < old._relAt)) { old = v; owner = e; }
      if (old) { used -= old.cost || 1; owner._fadeKill(old); continue; }
      const id = [...this.voices.keys()].find(k => live(this.voices.get(k)));
      if (id === undefined) break;                          // nothing else to release: the voice goes in anyway
      const v = this.voices.get(id);
      used -= v.cost || 1; this._releaseVoice(id, 0.02); v._going = true;
    }
  }
  _dispose(v) {             // frees nodes after the release tail (does NOT touch the counter)
    if (v.disposed) return;
    v.dispose();
  }
  _updateBusGain() {
    if (!this.ready) return;
    // Only HELD voices count (not the release tails). No reduction up to 4 voices;
    // above that, a soft and slow compensation so as not to "pump" pads and sustained chords.
    const n = this.voiceCount;
    const scale = n <= 4 ? 1 : 1 / Math.sqrt(n / 4);
    this.voicesBus.gain.setTargetAtTime(scale, this.ctx.currentTime, 0.15);
  }
  _forVoices(fn) { this.voices.forEach(fn); }

  // ---------- parameter API ----------
  setOsc(which, key, value) { this.S[which][key] = value; }   // applies on the next note

  set(name, value) {
    this.S[name] = value;
    if (!this.ready) return;
    if (name === 'bpm') clockOf(this.ctx).setBpm(value, this.ctx.currentTime);   // shared clock: the Arp/Seq follow the new tempo from the current beat
    if (name === 'swing') clockOf(this.ctx).swing = value;                       // shared clock: swings everything that runs in tempo
    // Modulation matrix (flat keys mx{1..6}{src,dst,amt}): amt readjusts
    // the slot's gain live; src/dst rewire the slot in the live voices.
    // NEW voices read S.mx* when they are built, like the rest of the state.
    const mx = /^mx(\d)(src|dst|amt)$/.exec(name);
    if (mx) { this._forVoices(v => mx[2] === 'amt' ? v.mxSetAmt(+mx[1]) : v.mxRewire(+mx[1])); return; }
    if (name.startsWith('fm4')) { this._forVoices(v => v.setFm4(name, value)); return; }   // FM4: worklet params by name
    if (STR_KEYS.includes(name)) { this._forVoices(v => v.setStr(name, value)); return; }   // String: same (Position only counts at the pluck)
    // ROOM keys (bpm, echo time/damp/wow, reverb size/damp/pre): applied by
    // the Room, which in Parts mode is shared — and it propagates the value to
    // the S of all the parts (a single clock).
    if (SALA_KEYS.has(name)) { this.sala.set(name, value); return; }
    // Per-voice LFOs (lfoPhase 'voice'): Level/Speed/shape of LFO k also go to the
    // copies of each live voice; the engine's global LFO keeps changing in the switch.
    const lf = /^(cut|res|freq|pwm|pan)Lfo(Lvl|Spd|Shape|Sync)$/.exec(name);
    if (lf) {
      const what = lf[2] === 'Sync' ? 'spd' : lf[2].toLowerCase(), val = what === 'spd' ? this._lfoHz(lf[1]) : value;   // Speed and sync: the effective speed
      this._forVoices(v => v.setLfo(lf[1], what, val));
    }
    const ls = /^(pwm|cut|res|amp|freq|pan)LfoSync$/.exec(name);
    if (ls) { const lfo = this[ls[1] + 'LFO']; if (lfo) setLfoSync(this.ctx, lfo, lfoBeats(this.S, ls[1]), clockOf(this.ctx), this._lfoHz(ls[1])); return; }
    const now = this.ctx.currentTime, smooth = (p, val) => p.setTargetAtTime(val, now, 0.02);
    switch (name) {
      case 'mxDriftSpd': this._forVoices(v => v.setMxDriftSpd(value)); break;   // per-voice drift (matrix source 'drift')
      // lfoPhase: structure of the voice (global or own LFOs): applies per note, like filterSlope
      case 'levelA': this._forVoices(v => v.setLevel('A', value)); break;
      case 'levelB': this._forVoices(v => v.setLevel('B', value)); break;
      case 'ring':  this._forVoices(v => v.setRing(value)); break;
      case 'noise': this._forVoices(v => v.setNoise(value)); break;
      case 'noiseColor': this._forVoices(v => v.setNoiseColor(value)); break;
      case 'spread': this._forVoices(v => v.setSpread(value)); break;
      case 'drift':  this._forVoices(v => v.setDrift(value)); break;
      case 'uniVoices':                                    // the segmented control gives a string: coercion in setUnison
      case 'uniDetune': this._forVoices(v => v.setUnison(this.S.uniVoices, this.S.uniDetune)); break;
      case 'fmRatio':
      case 'fmIndex':
      case 'fmFb':    this._forVoices(v => v.setFM(this.S.fmRatio, this.S.fmIndex, this.S.fmFb)); break;
      case 'wtPos': this._forVoices(v => v.setWtPos(value)); break;
      case 'wtSet': try { getWtSet(value); } catch (e) {} break;   // prewarms the set (applies on the next note)
      case 'cutoff':this._forVoices(v => v.setCutoff(value)); break;
      case 'reso':  this._forVoices(v => v.setReso(value)); break;
      case 'morph': this._forVoices(v => v.setMorph(value)); break;
      case 'filterEnvAmt': this._forVoices(v => v.setFilterEnvAmt(value)); break;
      case 'filterDrive': this._forVoices(v => v.setFilterDrive(value)); break;
      case 'driveChar': this._forVoices(v => v.setDriveChar(value)); break;   // soft (tanh) | fold
      case 'driveAsym': this._forVoices(v => v.setDriveAsym(value)); break;
      case 'keytrack': this._forVoices(v => v.setKeytrack(value, this.S.cutoff)); break;
      case 'pulseWidth':   this._forVoices(v => v.setPulseWidth(value)); break;
      case 'vocAmt':   this._forVoices(v => v.setVocAmt(value)); break;
      case 'vocVowel': this._forVoices(v => v.setVocVowel(value)); break;
      case 'vocSize':  this._forVoices(v => v.setVocSize(value)); break;
      case 'vocQ':     this._forVoices(v => v.setVocQ(value)); break;
      case 'vocLife':  this._forVoices(v => v.setVocVida(value)); break;
      case 'vocBright':this._forVoices(v => v.setVocBrillo(value)); break;
      // vocAtk is a note-start event: it is read when each voice is created
      case 'resAmt':    this._forVoices(v => v.setResAmt(value)); break;     // modal resonator (engine/reson.js)
      case 'resMat':    this._forVoices(v => v.setResMat(value)); break;
      case 'resDecay':  this._forVoices(v => v.setResDecay(value)); break;
      case 'resBright': this._forVoices(v => v.setResBrillo(value)); break;

      case 'amplitude': smooth(this.amp.gain, value); break;
      case 'ampLfoLvl': smooth(this.ampLFO.depth.gain, value); break;
      case 'ampLfoSpd': if (!this.ampLFO.sync) setLfoRate(this.ampLFO, value, now); break;   // in tempo the division rules
      // pitch/vibrato/PWM are connected to the worklets on demand (see Voice.ensure*)
      case 'freqCents': smooth(this.pitchOffset.offset, value + (this._bend || 0)); if (value) this._forVoices(v => v.ensurePitch()); break;
      case 'freqLfoLvl': smooth(this.freqLFO.depth.gain, value); if (value) this._forVoices(v => v.ensureVib()); break;
      case 'freqLfoSpd': if (!this.freqLFO.sync) setLfoRate(this.freqLFO, value, now); break;
      case 'pwmLfoLvl': smooth(this.pwmLFO.depth.gain, value); if (value) this._forVoices(v => v.ensurePwm()); break;
      case 'pwmLfoSpd': if (!this.pwmLFO.sync) setLfoRate(this.pwmLFO, value, now); break;
      case 'cutLfoLvl': smooth(this.cutLFO.depth.gain, value); if (value) this._forVoices(v => v.ensureCutLfo()); break;   // connect to the filter only when used (Voice)
      case 'cutLfoSpd': if (!this.cutLFO.sync) setLfoRate(this.cutLFO, value, now); break;
      case 'resLfoLvl': smooth(this.resLFO.depth.gain, value); if (value) this._forVoices(v => v.ensureResLfo()); break;
      case 'resLfoSpd': if (!this.resLFO.sync) setLfoRate(this.resLFO, value, now); break;
      case 'panLfoLvl': smooth(this.panLFO.depth.gain, value); if (value) this._forVoices(v => v.ensurePan()); break;
      case 'panLfoSpd': if (!this.panLFO.sync) setLfoRate(this.panLFO, value, now); break;

      // LFO waveforms (native: instant change; S&H/drift: alternative source)
      case 'ampLfoShape':  setLfoShape(this.ctx, this.ampLFO, value); break;
      case 'freqLfoShape': setLfoShape(this.ctx, this.freqLFO, value); break;
      case 'pwmLfoShape':  setLfoShape(this.ctx, this.pwmLFO, value); break;
      case 'cutLfoShape':  setLfoShape(this.ctx, this.cutLFO, value); break;
      case 'resLfoShape':  setLfoShape(this.ctx, this.resLFO, value); break;

      case 'dist':
        if (value > 0) this._ensureDist();
        smooth(this.distDry.gain, 1 - value);   // crossfade: at 0 = all dry (clean, no clipping)
        if (this.shaper) {
          smooth(this.distPre.gain, 1 + value * 6);   // the drive lives here (fixed curve)
          smooth(this.distPost.gain, 1 / (1 + value));
          smooth(this.distWet.gain, value);
        }
        break;
      case 'flAmt': if (value > 0) this._ensureFl(); if (this.flWet) smooth(this.flWet.gain, value); break;
      case 'flSpd': if (this.flLFO) smooth(this.flLFO.osc.frequency, value); break;
      case 'chAmt': {
        const ens = this.S.chMode === 'ensemble';
        if (value > 0) { if (ens) this._ensureEns(); else this._ensureCh(); }
        const w = ens ? this.ensWet : this.chWet; if (w) smooth(w.gain, value);
        break;
      }
      case 'chSpd':
        if (this.chLFO1) { smooth(this.chLFO1.osc.frequency, value); smooth(this.chLFO2.osc.frequency, value * 1.17); }
        this.ensSlow.forEach(l => smooth(l.osc.frequency, value));
        this.ensFast.forEach(l => smooth(l.osc.frequency, Math.min(12, value * 10)));
        break;
      case 'chMode':          // smooth crossfade between the two wets (no clicks)
        if (this.S.chAmt > 0) { if (value === 'ensemble') this._ensureEns(); else this._ensureCh(); }
        if (this.chWet) smooth(this.chWet.gain, value === 'chorus' ? this.S.chAmt : 0);
        if (this.ensWet) smooth(this.ensWet.gain, value === 'ensemble' ? this.S.chAmt : 0);
        break;
      // Sends to the Room. In single mode the echo feedback follows the
      // Amount and the echoes enter the reverb according to the Mix — as always; in
      // Parts mode that is governed by the Room column of the Part Mixer.
      case 'dlyAmt': smooth(this.sendDly.gain, value); break;
      case 'dlyFb': if (this.ownsSala) this.sala.setFeedback(value); break;   // in Parts the Room's Fdbk rules (Part Mixer)
      case 'width': this._forVoices(v => v.setWidth(value)); break;
      case 'reverbMix': smooth(this.sendRev.gain, value); if (this.ownsSala) this.sala.setDlyToRev(value); break;
      case 'master': if (this.ownsSala) this.sala.setMaster(value); else smooth(this.level.gain, value); break;   // Parts: the part's fader
      case 'mode': this.allNotesOff(); break;   // poly<->mono switch: cuts everything so no notes are left hanging
      case 'arpMode': if (value === 'off') this.arp.stop(); break;   // div/oct/gate are read live by the scheduler
      case 'bendRange': if (this._bendNorm) this.setBend(this._bendNorm); break;   // a bend already moved gets rescaled
      case 'syncA': this._forVoices(v => v.setSync(value === 'on')); break;      // hard sync: also to the sounding notes
      case 'macro1': case 'macro2': this.perf['mac' + name.slice(-1)].offset.setTargetAtTime(value, this.ctx.currentTime, PERF_TAU); break;
      case 'seqOn': if (value === 'off') this.seq.stop(); else this.allNotesOff(); break;   // pat/div/gate live
      case 'seqLatch': if (value === 'off' && !this.seq.held.length) { this.seq.latched = null; this.seq._maybeStop(); } break;
      // a, d, s, r, glide, lfoFade, filterSlope, filterType: read when each voice is created (no live node)
    }
  }

  // Wheel / aftertouch / expression (0..1): performance sources of the matrix. Outside
  // CONTROLS/presets (they are gestures, like the bend). Before init() it is only noted down.
  setPerf(id, v) {
    if (!(id in this.perfVal)) return;
    v = Math.max(0, Math.min(1, +v || 0)); this.perfVal[id] = v;
    if (this.ready) this.perf[id].offset.setTargetAtTime(v, this.ctx.currentTime, PERF_TAU);
  }

  // MIDI pitch bend, normalized (−1..1). It goes outside CONTROLS/presets: it is
  // ADDED to the cents slider in the same shared ConstantSource (pitchOffset),
  // scaled by the PRESET's range (bendRange, semitones): in Parts, each
  // part with its own (the bass at ±12 and the pad at ±2 with the same wheel).
  setBend(norm) {
    this._bendNorm = Math.max(-1, Math.min(1, +norm || 0));
    const cents = this._bend = this._bendNorm * (+this.S.bendRange || 2) * 100;
    if (!this.ready) return;
    this.pitchOffset.offset.setTargetAtTime(this.S.freqCents + cents, this.ctx.currentTime, 0.005);
    if (cents) this._forVoices(v => v.ensurePitch());
  }

  // ---------- Parts mode: mute / pan / macro / teardown ----------
  setMute(on) { if (this.ready) this.muteG.gain.setTargetAtTime(on ? 0 : 1, this.ctx.currentTime, 0.02); }
  setMacro(cents, tau = 0.3) { if (!this.ready) return; if (cents) this._macroConnect(); this.macroCut.offset.setTargetAtTime(cents, this.ctx.currentTime, tau); }
  // The macro is hooked to the filters the first time it has a value (live
  // when the arrangement moves it; offline when it is automated) — live voices and tails included.
  _macroConnect() {
    if (this._macroOn) return;
    this._macroOn = true;
    this._forVoices(v => v.ensureMacro()); this.tails.forEach(v => v.ensureMacro());
  }
  automateMacro(cents, t, ramp) {     // offline: value (or ramp up to) `cents` at t
    if (!this.ready) return;
    this._macroConnect();
    if (ramp) this.macroCut.offset.linearRampToValueAtTime(cents, t); else this.macroCut.offset.setValueAtTime(cents, t);
  }
  setPan(v)   { if (this.ready) this.partPan.pan.setTargetAtTime(Math.max(-1, Math.min(1, v)), this.ctx.currentTime, 0.02); }
  // Tears down the engine (when the scene is switched off): releases voices and tails, stops the
  // schedulers and the LFO oscillators — a started OscillatorNode
  // keeps consuming even if nobody listens to it — and unhooks from the Room.
  dispose() {
    if (!this.ready) return;
    this.allNotesOff();
    for (const v of this.tails) { if (v._timer) clearTimeout(v._timer); this._dispose(v); }
    this.tails.clear();
    clearInterval(this.wseq.timer); this.wseq.timer = null; this.wseq.looping.clear();
    const lfos = [this.ampLFO, this.cutLFO, this.resLFO, this.freqLFO, this.pwmLFO, this.flLFO,
                  this.chLFO1, this.chLFO2, this.panLFO, ...this.ensSlow, ...this.ensFast].filter(Boolean);   // the effects' ones, if they were ever born
    for (const l of lfos) { try { l.osc.stop(); l.osc.disconnect(); } catch (e) {} if (l.alt) { try { l.alt.stop(); l.alt.disconnect(); } catch (e) {} } if (l.keep) { try { l.keep.disconnect(); } catch (e) {} } }
    if (this._unlisten) this._unlisten();                     // the shared clock stops notifying this engine
    this.steps._stop(); clockOf(this.ctx).leave(this.steps); this.steps.src.forEach(c => { if (c) { try { c.stop(); c.disconnect(); } catch (e) {} } });
    try { this.pitchOffset.stop(); this.pitchOffset.disconnect(); } catch (e) {}
    try { this.macroCut.stop(); this.macroCut.disconnect(); } catch (e) {}
    for (const k in this.perf) { try { this.perf[k].stop(); this.perf[k].disconnect(); } catch (e) {} }
    for (const n of [this.chOut, this.level, this.muteG, this.partPan, this.sendDly, this.sendRev]) { try { n.disconnect(); } catch (e) {} }
    this.sala.engines = this.sala.engines.filter(e => e !== this);
    this.budget.delete(this);
    if (this.ownsSala) this.sala.dispose();
    this.ready = false;
  }

  getAnalyser() { return this.sala ? this.sala.analyser : null; }
  stats() { return { pressed: this.voiceCount, tails: this.tails.size, worklets: this.modStats ? this.modStats.worklets : 0 }; }
}

export const engine = new AudioEngine();
