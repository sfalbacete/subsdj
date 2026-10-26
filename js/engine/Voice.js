/* =====================================================================
   SubSDJ · Voice — one polyphonic note.
   Per-voice chain:
     osc A/B (worklet; each at freq·2^oct — Octave ±2), A×B, noise --Mixer (one level each)--> preFilter --> drive(tanh | fold, bias, dry/wet)
        --> VOCAL (formant bank, dry/wet; the noise already summed in = breath)
        --> RESONATOR (modal bank tuned to the note, dry/wet; engine/reson.js)
        --> filter LP↔HP morph | BP | notch, 12|24 dB (cutoff = base + filter env + LFO)
        --> VCA(ADSR) --> ampMod(matrix, base 1) --> pan --> bus
   Global modulation connected per voice: pitchOffset, freqLFO, pwmLFO, cutLFO, resLFO.
   With lfoPhase 'voice' the cutoff/reso/vibrato/PWM/pan LFOs are per-voice COPIES
   (nodes.mkVoiceLFO) started at the phase due to the voice (Weyl), and the
   matrix source «Drift (voice)» is a slow walk of each voice's own.
   Modulation matrix: slots source→GainNode(amt·span)→AudioParams of the
   target — the same plumbing as the dedicated routes, generalized.
   ===================================================================== */
import { MX_SLOTS, MX_SPAN, FM4_KEYS, STR_KEYS } from './params.js';
import { getWtSet } from './wavetable.js';
import { mkVoiceLFO, setVoiceLfoRate, setVoiceLfoShape, stopVoiceLFO, nextVoicePhase, ctxRandom } from './nodes.js';
import { resRatios, resQ, resGains, resNoiseGain, RES_BAR, RES_HARM } from './reson.js';
import { getVocalBank, bwMul, vocMakeup, brightMul, VOC_BRIGHT_IX,
         VOC_LIFE_CENTS, VOC_SMOOTH, VOC_ATK_GAIN, VOC_ATK_TAU, VOC_ATK_Q,
         VOC_ATK_GLIDE, VOC_ATK_TRANS } from './vocal.js';

// Saturation curve of the pre-filter drive, SHARED by all voices
// (tanh k=3 normalized to ±1; the input level lives in dvPre, as in the FX).
const DRIVE_CURVE = (() => {
  const n = 1024, c = new Float32Array(n), k = 3;
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return c;
})();
// «Fold» character (Roadmap 7.0 · 3.1): sine fold y = sin(π/2·x) for x in
// ±FOLD_R (the WaveShaper curve covers [−1, 1]: dvPre divides the input by FOLD_R).
// At gain 1 it is a soft saturation; at 10 the wave folds over several times per
// half cycle and the harmonics rise and FALL with the Drive (Bessel): a sweep that doesn't
// sound like a filter's. Odd number of points: input 0 falls in the centre and gives exactly 0.
const FOLD_R = 24;
const FOLD_CURVE = (() => {
  const n = 8193, c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.sin(Math.PI / 2 * FOLD_R * ((i / (n - 1)) * 2 - 1));
  return c;
})();
// Input gain at Drive 1 (1 + G·v) and bias at Asym 1, in units of the
// input x (measured with a sine at 0.6): in the tanh, 2nd harmonic from −31 dB (bias
// 0.05) to −16 dB (0.3); in the fold, bias 1 = a quarter wave: the curve becomes
// EVEN and only even harmonics come out (the octave). The fold sounds ~3 dB below
// the tanh at the same Drive (its level doesn't grow when pushed): DRV_FOLD_MK evens it out.
const DRV_GAIN = { soft: 4, fold: 9 }, DRV_BIAS = { soft: 0.3, fold: 1 }, DRV_FOLD_MK = 1.4;
const DRV_DC_HZ = 5;   // DC block of the saturated path: the bias creates DC along with the signal
// Value of the curve at u, interpolated the way the WaveShaper does (used by the bias compensation)
const curveAt = (c, u) => { const x = (c.length - 1) * (Math.max(-1, Math.min(1, u)) + 1) / 2, i = Math.min(c.length - 2, Math.floor(x)); return c[i] + (c[i + 1] - c[i]) * (x - i); };

// Looping Mod Env: ONE cycle (attack 0 → 1 over the fraction fa, fall 1 → 0 over the rest, with the
// RC curve if any) in a buffer of 4096 samples at 8 kHz; the voice reads it in a loop with
// playbackRate = duration/(A + D), so the period is exactly A + D. Cached per context and shape.
const ENVM_N = 4096, ENVM_SR = 8000, envmCache = new WeakMap();
function envmCycle(ctx, fa, curve) {
  let m = envmCache.get(ctx); if (!m) { m = new Map(); envmCache.set(ctx, m); }
  const key = fa.toFixed(4) + '|' + curve.toFixed(3);
  let b = m.get(key); if (b) return b;
  b = ctx.createBuffer(1, ENVM_N, ENVM_SR);
  const d = b.getChannelData(0), k = ENV_K * curve, den = 1 - Math.exp(-k), rc = u => (k > 0 ? (1 - Math.exp(-k * u)) / den : u);
  for (let i = 0; i < ENVM_N; i++) { const x = i / ENVM_N; d[i] = x < fa ? rc(x / fa) : 1 - rc((x - fa) / Math.max(1e-9, 1 - fa)); }
  m.set(key, b);
  return b;
}

// Envelope curve (envCurve 0..1): 0 = LINEAR ramps (as always);
// > 0 = RC-like exponential segments, as in an analog ADSR (the capacitor
// charges towards the target): the attack rises fast and slows down on arrival, the
// decay falls fast and settles slowly. k = curvature = ENV_K·envCurve. Why it
// sounds better: loudness is logarithmic — a decay linear in amplitude «hangs
// and then drops all at once»; the exponential one sounds even. The release
// follows the SAME knob (linear at 0, RC at 1; until the revision after block 13
// it was a fixed exponential with τ = r/4). Each segment is a CHAIN of ENV_SEG
// linear ramps that follow the exponential — NOT setValueCurveAtTime: in Chrome
// a running curve can't be cancelled or anchored (setValueAtTime inside
// its span throws NotSupportedError), so releasing the note during the attack
// or the decay left the voice hanging. Ramps can be cut without trouble.
const ENV_K = 6, ENV_SEG = 12;

// Weights for Voice.cost, in «simple voices» (two saws with a static filter =
// 1 ≈ 1.6 % of a core on the reference PC, offline render). Measured with
// 12 voices per variant (2026-10-12). What weighs most is the NUMBER OF NODES of
// the voice, not the oscillator's math: one more unison copy or a Supersaw
// barely adds (copy); what runs per sample in JS with sines does (FM, FM4).
const COST = {
  base: 1,            // the voice: ~30 nodes (mixer, noise, filter, VCA, pan) + 2 worklets
  copy: 0.005,        // each oscillator copy (unison, Supersaw = 7, stacked octaves): PolyBLEP, cheap
  sine: 0.06, sineFm: 0.18, fm4: 0.47,   // per copy: sines per sample (FM with index: two; FM4: four)
  filterMod: 0.07, filterMod24: 0.16,     // modulated filter (env, LFO, matrix): coefficients per sample
  drive: 0.15, fold: 0.13, vocal: 0.25, reson: 0.24,  // fold: what the fold adds (4x oversampling; measured 2026-10-20, Asym adds nothing)
  vocDyn: 0.26,       // Vocal made dynamic by Bite: 10 WaveShapers (biquads still k-rate)
  vocMx: 0.8,         // Vocal moved by the matrix: WaveShapers + a-rate biquads (measured on «Madrigal»)
  string: 0.01,       // each copy in String: the line, two filters and, with Stiffness, four allpasses (×1.2-1.8 a saw; measured 2026-10-25)
  syncMul: 2,         // A with Sync: each copy ×1.3-1.9 (saw-square) and ×1.4 on sine (measured 2026-10-25)
};
const mxDst = (S, d) => { for (let i = 1; i <= MX_SLOTS; i++) if (S['mx' + i + 'src'] !== 'off' && S['mx' + i + 'dst'] === d) return true; return false; };

export class Voice {
  constructor(ctx, S, mod, { freq, vel = 1, acc = 0, startFreq = null, startAt = null }) {
    this.ctx = ctx;
    this.mod = mod;
    this.S = S;
    this.disposed = false;
    // Look-ahead: we schedule a tiny bit into the future so that the attack ALWAYS starts
    // cleanly from 0. Without this, if building the voice takes longer than the attack (e.g. a
    // supersaw with 14 nodes), the ramp would land "in the past" and the gain would jump
    // at once, exposing the oscillator mid-wave -> click. That's why it clicked "sometimes".
    // The margin is set by the engine (mod.lookahead): 5 ms offline; live it depends on the
    // device (5 ms + 2·baseLatency), because the main thread's clock lags
    // behind the audio one and a fixed 5 ms wasn't enough on some cards (the pitch
    // blip and the kick's VCA landed in the past: it only hit sometimes).
    // startAt (optional): scheduled start on the audio clock (used by the arpeggiator).
    // Quantized to a render block boundary (128 samples): the worklet opens its
    // start gate per block, so the wave starts at its configured phase
    // EXACTLY when the VCA opens (identical hit on every note).
    const Q = 128 / ctx.sampleRate;
    const t = Math.ceil(((startAt || ctx.currentTime) + (mod.lookahead || 0.005)) / Q - 1e-6) * Q;
    this.t0 = t;                          // reference for the LFO fade-in (lfoFade)
    // How late the voice sounds AFTER its musical time (look-ahead + block boundary).
    // Later scheduled events (note-off, glide) are shifted by the same amount: that way
    // the gate lasts what the gate says, and a gate shorter than the look-ahead doesn't
    // close the VCA before opening it (the players' silent hit).
    this.lag = t - (startAt || ctx.currentTime);
    this.vel = vel;                       // fixed per note: read by the matrix (Velocity source) and the FM4 levels
    this.acc = acc;                       // 1 = accented sequencer step (matrix source «Accent»)
    const glide = (startFreq && S.glide > 0) ? S.glide : 0;

    // --- Per-voice modulation (Roadmap 5.0 · block 2) ---
    // Phase of this voice (Weyl sequence, nodes.js): used by its own LFOs
    // (lfoPhase 'voice', created on demand in _vlfo) and its drift ('drift' source).
    this.phase = nextVoicePhase(ctx);
    this.rnd = ctxRandom(ctx);            // the voice's randomness: Math.random live, seeded offline (7.1)
    // k -> own LFO (null = the engine's global ones): 'voice' starts them at the voice's phase,
    // 'retrig' and 'once' at phase 0 with the note ('once': a single cycle, Roadmap 7.0 · 2.2)
    this.vlfo = ['voice', 'retrig', 'once'].includes(S.lfoPhase) ? {} : null;
    this.drift = null;                              // matrix source «Drift (voice)», if any slot uses it

    // --- Oscillators (worklet) ---
    this.oscs = [];                       // {node, detune, pw, ratio}
    this._glideLast = new Map();          // AudioParam → {value, end}: its last pitch and until when its ramp lasts (glideTo)
    const busA = ctx.createGain(); busA.gain.value = 1 / Math.max(1, S.oscA.octaves);
    const busB = ctx.createGain(); busB.gain.value = 1 / Math.max(1, S.oscB.octaves);
    this._buildOscGroup(S.oscA, busA, freq, startFreq, glide, t);
    this._buildOscGroup(S.oscB, busB, freq, startFreq, glide, t);
    if (S.syncA === 'on') this.setSync(true);
    this._connPitch = this._connVib = this._connPwm = false;
    if (S.freqCents) this.ensurePitch();
    if (S.freqLfoLvl) this.ensureVib();
    if (S.pwmLfoLvl) this.ensurePwm();

    // --- Minimoog-style Mixer: each source with ITS level (A, B, ring, noise),
    // summed in preFilter. Raising one doesn't lower the others: A and B at max add up
    // (+3 dB detuned, +6 dB in phase) and with Drive they saturate more, like the
    // trick of turning up the Minimoog's mixer to push the filter. ---
    const gA = ctx.createGain(); gA.gain.value = S.levelA;
    const gB = ctx.createGain(); gB.gain.value = S.levelB;
    busA.connect(gA); busB.connect(gB);

    // --- Ring mod: A * B (gain at 0 + B on its AudioParam = the product) ---
    const ring = ctx.createGain(); ring.gain.value = 0;
    busA.connect(ring); busB.connect(ring.gain);
    const ringX = ctx.createGain(); ringX.gain.value = S.ring;
    ring.connect(ringX);

    // --- Colored noise: LP+HP in series (color<0 closes the LP = dark/wind;
    // color>0 raises the HP = "air"; at 0 both open = white). Q at -3 dB
    // (flat Butterworth: the LP/HP Q is in dB). The gain carries a
    // compensation (mk) so that the color changes the timbre, not the volume. ---
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = mod.noiseBuffer; noiseSrc.loop = true;
    const nf = Voice._noiseColorCfg(S.noiseColor);
    const nLP = ctx.createBiquadFilter(); nLP.type = 'lowpass'; nLP.Q.value = -3; nLP.frequency.value = nf.lp;
    const nHP = ctx.createBiquadFilter(); nHP.type = 'highpass'; nHP.Q.value = -3; nHP.frequency.value = nf.hp;
    const noiseGain = ctx.createGain(); noiseGain.gain.value = S.noise * nf.mk;
    noiseSrc.connect(nLP); nLP.connect(nHP); nHP.connect(noiseGain);

    // --- Pre-filter sum ---
    const preFilter = ctx.createGain();
    gA.connect(preFilter); gB.connect(preFilter); ringX.connect(preFilter); noiseGain.connect(preFilter);

    // --- Pre-filter drive (per-voice tanh saturation, dry/wet). Only the dry
    // path always exists: at 0 it passes at gain 1 (EXACTLY transparent). The wet
    // — a ×2 oversampled WaveShaper, costly even when its output is 0 — is born
    // on demand (ensureDrive) when the knob rises above 0. ---
    const dvDry = ctx.createGain(); dvDry.gain.value = 1 - S.filterDrive;
    const dvOut = ctx.createGain();
    preFilter.connect(dvDry); dvDry.connect(dvOut);

    // --- Vocal: dry/wet formant bank BEFORE the filter (the formants
    // enrich the source; the LP/HP keeps its role as global brightness).
    // Only the crossfade always exists: the bank (biquads + WaveShapers) is
    // created on demand (ensureVocal) — the common case vocAmt=0 pays no nodes.
    const vocDry = ctx.createGain(); vocDry.gain.value = 1 - S.vocAmt;
    const vocOut = ctx.createGain();
    dvOut.connect(vocDry); vocDry.connect(vocOut);

    // --- Resonator: dry/wet modal bank AFTER the Vocal (engine/reson.js). Like the
    // Vocal, only the crossfade always exists: the bank is born on demand (ensureReson).
    const resDry = ctx.createGain(); resDry.gain.value = 1 - S.resAmt;
    const resOut = ctx.createGain();
    vocOut.connect(resDry); resDry.connect(resOut);

    // --- Per-voice filter: LP + HP in parallel with crossfade (morph) ---
    // keytrack: the cutoff follows the note's pitch (0 = fixed, 1 = 1:1 with the pitch)
    // 24 dB slope: a 2nd stage in CASCADE in front, flat. DOUBLE WATCH OUT: in WebAudio
    // the lowpass/highpass Q is IN dB, and 0 dB = linear Q 1.0 (peak of ~1.25 dB);
    // the flat Butterworth (linear Q 0.707) is -3 dB. The resonance lives in the
    // final stage, so the Reso knob behaves the same as at 12 dB.
    // filterSlope is read when the voice is created (it changes the structure: applies per note).
    this.noteFreq = freq;
    this.ktMul = S.keytrack ? Math.pow(freq / 261.63, S.keytrack) : 1;
    const cutHz = Math.min(20000, S.cutoff * this.ktMul);
    // Type (filterType, per note): 'morph' = LP + HP in PARALLEL with crossfade
    // (Low↔Hi); 'bp' = LP and HP in SERIES with the same cutoff (band-pass: each
    // skirt 12 dB; with slope 24 each one carries its 2nd stage); 'notch' = LP
    // + HP in parallel at gain 1 each. The RBJ numerators of LP and HP
    // with the same cutoff add up to 1 − 2cos·z⁻¹ + z⁻²: the cookbook notch, an exact
    // zero at the cutoff whatever the Q (the Q only narrows it). It is the
    // morph at 50 % (0.5 + 0.5 = −6 dB) with +6 dB. No 2nd stage on the notch:
    // in cascade both skirts would reach the cutoff IN PHASE and the zero would
    // fill in (the slope doesn't apply).
    const ft = S.filterType || 'morph';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass';
    lp.frequency.value = hp.frequency.value = cutHz;
    lp.Q.value = hp.Q.value = ft === 'bp' ? S.reso / 2 : S.reso;   // BP: the resonance is split between the two skirts (the knob is still dB at the cutoff)
    let lp2 = null, hp2 = null, lpIn = lp, hpIn = hp;
    if (S.filterSlope === '24' && ft !== 'notch') {
      lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass';
      hp2 = ctx.createBiquadFilter(); hp2.type = 'highpass';
      lp2.frequency.value = hp2.frequency.value = cutHz;
      lp2.Q.value = hp2.Q.value = -3;
      lp2.connect(lp); hp2.connect(hp);
      lpIn = lp2; hpIn = hp2;
    }
    const lpMix = ctx.createGain(); lpMix.gain.value = ft === 'morph' ? 1 - S.morph : 1;
    const hpMix = ctx.createGain(); hpMix.gain.value = ft === 'morph' ? S.morph : 1;
    const filterOut = ctx.createGain();
    if (ft === 'bp') { resOut.connect(lpIn); lp.connect(hpIn); hp.connect(filterOut); }   // series
    else {                                                                                  // parallel (morph / notch)
      resOut.connect(lpIn); lp.connect(lpMix); lpMix.connect(filterOut);
      resOut.connect(hpIn); hp.connect(hpMix); hpMix.connect(filterOut);
    }

    // Filter modulation — cutoff LFO (all stages) and reso LFO (the
    // stage with resonance), filter envelope and the arrangement's opening
    // macro — is CONNECTED only when it moves something (ensureCutLfo, ensureResLfo,
    // ensureFenv, ensureMacro; also live, when its knob goes up). A connection
    // to an AudioParam of the biquad, even one carrying zeros, forces the browser to
    // recompute the coefficients on EVERY sample instead of once per block:
    // measured, the voice's filter cost more than twice as much with everything at 0.
    // Disconnected, the output is exactly the same (it added 0).

    // Filter envelope: ConstantSource(0..1) * envAmt(Hz) -> cutoff. The source
    // always exists: it is also the matrix source «Filter env».
    const fenv = ctx.createConstantSource(); fenv.offset.value = 0;
    const fenvGain = ctx.createGain(); fenvGain.gain.value = S.filterEnvAmt;
    fenv.connect(fenvGain);
    fenv.start(t);

    // --- VCA (amplitude envelope) + stereo placement ---
    const vca = ctx.createGain(); vca.gain.value = 0;
    // ampMod: the matrix's 'amp' target (1 ± mod). It sits AFTER the VCA on purpose:
    // on note release the VCA goes down to 0 and silences whatever the slot does
    // (summed into the VCA itself, a ± tremolo would keep sounding after the release).
    const ampMod = ctx.createGain(); ampMod.gain.value = 1;
    const panner = ctx.createStereoPanner();
    // base position by note pitch (±2 octaves from C4 => ±1), scaled by Width
    this.basePan = Math.max(-1, Math.min(1, Math.log2(freq / 261.63) / 2));
    panner.pan.value = this.basePan * S.width;
    filterOut.connect(vca); vca.connect(ampMod); ampMod.connect(panner); panner.connect(mod.voicesBus);
    noiseSrc.start(t);

    // --- ADSR envelope scheduling (amp + filter share A/D/S/R) ---
    const peak = vel, sus = S.s * vel;
    const g = vca.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(0, t);
    // Flam (hits > 1): before the ADSR, hits−1 short bursts hitGap apart —
    // the pulse train of the 808 clap (three or four hits ~10 ms apart on
    // the noise VCA, and then the tail). The full ADSR is the LAST hit;
    // with hits = 1 the path is the usual one (bit-identical).
    const tEnv = this._flam(g, t, peak);
    this._envSegs(g, 0, peak, sus, tEnv, S.a, S.d);
    this._envAmp = { t: tEnv, peak, sus, a: S.a, d: S.d };   // to estimate the value at a release scheduled in the future

    // Filter env: linked to the amplitude ADSR (link) or with its own times.
    // The peak scales with velocity (MIDI): hitting harder opens the filter more.
    const own = S.fenvMode === 'own';
    const FA = own ? S.fa : S.a, FD = own ? S.fd : S.d, FS = own ? S.fs : S.s;
    const fo = fenv.offset;
    fo.cancelScheduledValues(t); fo.setValueAtTime(0, t);
    this._envSegs(fo, 0, vel, FS * vel, t, FA, FD);
    this._envFil = { t, peak: vel, sus: FS * vel, a: FA, d: FD };

    // keep refs for live updates and cleanup
    Object.assign(this, { busA, busB, gA, gB, ringX, noiseGain, noiseSrc, nLP, nHP,
      filterType: ft, lp, hp, lp2, hp2, lpMix, hpMix, fenv, fenvGain, vca, ampMod, panner,
      preFilter, dvDry, dvOut, vocDry, vocOut, resDry, resOut });
    if (S.filterDrive > 0) this.ensureDrive();  // the drive's wet (2x WaveShaper) only if it bites
    if (S.cutLfoLvl > 0) this.ensureCutLfo();   // filter modulation: only what moves something (see above)
    if (S.resLfoLvl > 0) this.ensureResLfo();
    if (S.filterEnvAmt) this.ensureFenv();
    if (mod.macroOn && mod.macroOn()) this.ensureMacro();
    if (S.panLfoLvl) this.ensurePan();          // autopan (needs this.panner already assigned)
    if (S.vocAmt > 0) this.ensureVocal();       // formant bank (the matrix also creates it via 'vow')
    if (S.resAmt > 0) this.ensureReson();       // modal bank (needs vocOut and noiseGain already assigned)
    if (S.vocLife > 0) this.ensureLife();
    if (S.vocAtk > 0 && this.vocBqs) this._vocBurst(t, vel);   // consonant bite (note-start event)

    // modulation matrix (needs all the refs already assigned)
    this.mxSlots = [];                          // slot i -> {src, gain, dst}
    this._mxConsts = {};                        // per-voice scalar sources (vel/note/rnd), cached
    for (let i = 1; i <= MX_SLOTS; i++) this.mxRewire(i);
  }

  // Estimated cost of a voice in audio CPU, in «simple voices» (two saws
  // with a static filter and no modules = 1): used by AudioEngine's shared
  // budget (VOICE_BUDGET). MEASURED weights (offline render of 12 voices per
  // variant; see docs/DESIGN.md): what's expensive is what is computed per sample.
  static cost(S) {
    const c = COST;
    const osc = o => {
      const copies = (o.wave === 'supersaw' ? 7 : (+S.uniVoices || 1)) * Math.max(1, o.octaves || 1);
      const w = o.wave === 'sine' ? (S.fmIndex > 0 ? c.sineFm : c.sine) : o.wave === 'fm4' ? c.fm4 : o.wave === 'string' ? c.string : c.copy;
      return copies * w;
    };
    let k = c.base + osc(S.oscA) * (S.syncA === 'on' ? c.syncMul : 1) + osc(S.oscB);
    const fmod = S.filterEnvAmt || S.cutLfoLvl > 0 || S.resLfoLvl > 0 || mxDst(S, 'cutoff') || mxDst(S, 'reso');
    if (fmod) k += S.filterSlope === '24' && S.filterType !== 'notch' ? c.filterMod24 : c.filterMod;
    if (S.filterDrive > 0) k += c.drive + (S.driveChar === 'fold' ? c.fold : 0);
    if (S.vocAmt > 0) k += c.vocal + (mxDst(S, 'vow') ? c.vocMx : S.vocAtk > 0 ? c.vocDyn : 0);   // Life, measured, adds nothing
    if (S.resAmt > 0) k += c.reson;
    return k;
  }

  _buildOscGroup(cfg, dest, freq, startFreq, glide, t) {
    // ONE node per group: the octaves are stacked INSIDE the processor (before,
    // one AudioWorkletNode per octave: up to 8 worklets per voice; now 2).
    const node = new AudioWorkletNode(this.ctx, 'pulse-processor', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
      processorOptions: {
        type: cfg.wave, phase: (cfg.phase || 0) / 360, octaves: cfg.octaves,
        t0: t,                                 // note start: the per-operator envelopes (FM4) count from here
        seed: (this.rnd() * 4294967296) >>> 0,  // seed of the worklet's randomness (free phases, drift): repeatable offline
        ...(this.oscs.length === 0 ? { gphase: (this.S.oscB.phase || 0) / 360 } : {}),   // A: its ghost master (sync) starts at B's phase
        ...(cfg.wave === 'string' ? { vel: this.vel } : {}),   // the string: the strength of the pluck colors the plectrum
        // mip tables (cloned by the options postMessage, ~290 KB per node: 0.3 ms)
        ...(cfg.wave === 'wavetable' ? { wt: getWtSet(this.S.wtSet) } : {}),
      },
    });
    if (this.mod.stats) this.mod.stats.worklets++;
    const fParam = node.parameters.get('frequency');
    const dParam = node.parameters.get('detune');
    const pParam = node.parameters.get('pulseWidth');
    const sParam = node.parameters.get('spread');
    sParam.value = this.S.spread;
    const drParam = node.parameters.get('drift'); drParam.value = this.S.drift;
    const uvParam = node.parameters.get('uniVoices'); uvParam.value = +this.S.uniVoices || 1;
    const udParam = node.parameters.get('uniDetune'); udParam.value = this.S.uniDetune;
    const fmRParam = node.parameters.get('fmRatio'); fmRParam.value = this.S.fmRatio;
    const fmIParam = node.parameters.get('fmIndex'); fmIParam.value = this.S.fmIndex;
    const fmFParam = node.parameters.get('fmFb'); if (fmFParam) fmFParam.value = this.S.fmFb;   // may be missing (old cached worklet)
    // FM4: algorithm + ratio/level/decay × 4, set at birth and live by name (setFm4)
    const fm4P = {};
    for (const k of FM4_KEYS) { const ap = node.parameters.get(k); if (ap) { ap.value = /^fm4L\d$/.test(k) ? this._fm4Lvl(+k[4]) : +this.S[k]; fm4P[k] = ap; } }
    // may be missing if the browser served an old worklet from cache: degrade without crashing
    const wtParam = node.parameters.get('wtPos'); if (wtParam) wtParam.value = this.S.wtPos;
    const syncParam = node.parameters.get('syncRatio'), slaveParam = node.parameters.get('slave');   // sync (only A uses them)
    const strP = {};   // string: Bright, Decay, Position and Stiffness, at birth and live (setStr)
    for (const k of STR_KEYS) { const ap = node.parameters.get(k); if (ap) { ap.value = +this.S[k]; strP[k] = ap; } }

    // Octave (cfg.oct, −2..+2): the oscillator sounds at freq·2^oct — −1 is the
    // classic sub-oscillator, +1/+2 stack upwards without resorting to Stack.
    // It goes as a frequency RATIO (not in cents): so the glide (glideTo uses o.ratio)
    // and the detune in cents still mean the same as at the base octave.
    const ratio = Math.pow(2, cfg.oct || 0);
    const fEnd = freq * ratio, fStart = startFreq ? startFreq * ratio : fEnd;
    // tune the oscillator right away (during the look-ahead pre-roll the voice is silent)
    fParam.value = glide > 0 ? fStart : fEnd;
    // glide (portamento): exponential ramp from the previous note
    if (glide > 0) {
      fParam.setValueAtTime(fStart, t);
      fParam.exponentialRampToValueAtTime(fEnd, t + glide);
    } else {
      fParam.setValueAtTime(fEnd, t);
    }
    this._glideLast.set(fParam, { value: fEnd, end: t + glide });
    dParam.value = cfg.detune;
    // Per-note pitch envelope: it starts pitchEnvAmt cents off and decays
    // exponentially to the base detune (percussion, zaps, lasers)
    if (this.S.pitchEnvAmt) {
      dParam.setValueAtTime(cfg.detune + this.S.pitchEnvAmt, t);
      dParam.setTargetAtTime(cfg.detune, t, Math.max(0.001, this.S.pitchEnvDec) / 4);
    }
    pParam.value = this._clampPW(this.S.pulseWidth);

    node.connect(dest);
    this.oscs.push({ node, freq: fParam, detune: dParam, pw: pParam, sp: sParam, dr: drParam,
      uv: uvParam, ud: udParam, fmR: fmRParam, fmI: fmIParam, fmF: fmFParam, wt: wtParam, fm4P, syncR: syncParam, slave: slaveParam, strP,
      isWt: cfg.wave === 'wavetable', ratio });   // isWt: the wave sequence only automates these · ratio: octave (glideTo)
  }
  _clampPW(v) { return v < 0.01 ? 0.01 : (v > 0.99 ? 0.99 : v); }

  // Hard sync (Roadmap 7.0 · 3.2): A, slave to B. A's worklet only
  // needs the frequency ratio B / A (without Pitch A): the octaves and the
  // detunes of both, which are set per note just like in the oscillators. The
  // rest (vibrato, pitch env, glide, bend, the matrix's «Pitch») moves both
  // at once and doesn't change the ratio. 0 = free. Live: the Sync button.
  setSync(on) {
    const a = this.oscs[0]; if (!a || !a.syncR) return;   // old cached worklet: no sync
    const { oscA, oscB } = this.S;
    a.syncR.value = on ? Math.pow(2, (oscB.oct || 0) - (oscA.oct || 0) + ((oscB.detune || 0) - (oscA.detune || 0)) / 1200) : 0;
  }

  // Attack and decay of an envelope: linear (envCurve 0: bit-identical to
  // always) or with an RC curve (envCurve > 0) approximated by ENV_SEG ramps per segment.
  _envSegs(p, from, peak, sus, t, a, d, curve = this.S.envCurve) {
    const k = ENV_K * (curve || 0);
    // Attack 0 = STEP (percussion): the «hit» of a drumhead is that step — a
    // ramp, even a 1 ms one, eats the first millisecond of the transient, which
    // is where the crack lives (the user caught it: the kick only hit when, by
    // chance, the VCA was already open when the oscillator was born).
    if (!(a > 0)) { p.setValueAtTime(peak, t); a = 0; }
    if (!(k > 0)) { if (a > 0) p.linearRampToValueAtTime(peak, t + a); p.linearRampToValueAtTime(sus, t + a + d); return; }
    const den = 1 - Math.exp(-k);
    const segment = (v0, v1, t0, dur) => {
      for (let i = 1; i <= ENV_SEG; i++) { const x = i / ENV_SEG; p.linearRampToValueAtTime(v0 + (v1 - v0) * (1 - Math.exp(-k * x)) / den, t0 + dur * x); }
    };
    if (a > 0) segment(from, peak, t, a);
    segment(peak, sus, t + a, d);
  }
  // Flam: hits−1 bursts on param p from t; returns the instant at which
  // the ADSR starts (t if there is no flam). Each burst rises 0 → peak during the attack
  // (bounded to a third of the gap: a burst has to be a hit) and falls to 0
  // over the rest of the gap with the knob's curve (linear or RC, like the release),
  // so the next one starts cleanly from 0 and there is a valley between hits.
  // Releasing the note during the flam works as always: release() anchors the
  // current value and cancels the remaining bursts.
  _flam(p, t, peak) {
    const n = Math.round(this.S.hits || 1);
    if (!(n > 1)) return t;
    const gap = Math.max(0.005, this.S.hitGap || 0.012), atk = Math.min(this.S.a, gap / 3);
    for (let i = 0; i < n - 1; i++) {
      const ti = t + i * gap;
      if (atk > 0) { p.setValueAtTime(0, ti); p.linearRampToValueAtTime(peak, ti + atk); }
      else p.setValueAtTime(peak, ti);          // attack 0: real pulses (the 808 clap)
      this._relChain(p, ti + atk, peak, gap - atk);
    }
    const tEnv = t + (n - 1) * gap;
    p.setValueAtTime(0, tEnv);
    return tEnv;
  }
  // Value the envelope will have at instant t (release scheduled in the
  // future by the players: the AudioParam doesn't know it yet). Same curve as _envSegs.
  _envValueAt(e, t) {
    if (!e) return 0;
    const k = ENV_K * ((e.curve !== undefined ? e.curve : this.S.envCurve) || 0), den = 1 - Math.exp(-k);
    const rc = x => (k > 0 ? (1 - Math.exp(-k * x)) / den : x);
    const x = t - e.t;
    if (x <= 0) return 0;
    if (x < e.a) return e.peak * rc(x / e.a);
    if (x < e.a + e.d) return e.peak + (e.sus - e.peak) * rc((x - e.a) / e.d);
    return e.sus;
  }
  // Release from cur to 0 in rel seconds with the knob's curve: linear (k = 0) or RC
  // as a chain of ENV_SEG ramps (falls fast and settles). Reaches EXACTLY 0 at t + rel.
  _relChain(p, t, cur, rel, curve = this.S.envCurve) {
    const k = ENV_K * (curve || 0);
    if (!(k > 0) || !(cur > 0)) { p.linearRampToValueAtTime(0, t + rel); return; }
    const den = 1 - Math.exp(-k);
    for (let i = 1; i <= ENV_SEG; i++) {
      const x = i / ENV_SEG;
      p.linearRampToValueAtTime(i === ENV_SEG ? 0 : cur * (1 - (1 - Math.exp(-k * x)) / den), t + rel * x);
    }
  }

  // Noise color -> LP/HP cutoffs (exponential sweeps) + gain makeup
  // (the closed LP removes much more energy than the HP: it compensates more).
  static _noiseColorCfg(c) {
    return {
      lp: c < 0 ? 18000 * Math.pow(150 / 18000, -c) : 18000,
      hp: c > 0 ? 30 * Math.pow(8000 / 30, c) : 30,
      mk: c < 0 ? 1 - c * 2.2 : 1 + c * 0.8,
    };
  }

  // Global modulation -> worklet params ONLY when it is active: with everything
  // at 0 (the common case) the param stays constant with no edges to compute.
  // If a knob goes from 0 to active, the engine calls these ensure* live.
  // Vibrato and PWM go through a PER-VOICE fade gain (lfoFade): the LFO
  // comes in on a 0->1 ramp from the noteOn, like a performer's delayed
  // vibrato. Scheduling the ramp anchored at t0 also works if the LFO is
  // connected mid-note (events in the past = value already reached).
  _lfoFadeGain() {
    const g = this.ctx.createGain();
    if (this.S.lfoFade > 0) {
      g.gain.setValueAtTime(0, this.t0);
      g.gain.linearRampToValueAtTime(1, this.t0 + this.S.lfoFade);
    }
    return g;
  }
  ensurePitch() { if (this._connPitch || this.disposed) return; this._connPitch = true; this.oscs.forEach(o => this.mod.pitchOffset.connect(o.detune)); }
  ensureVib() {
    if (this._connVib || this.disposed) return; this._connVib = true;
    this.vibFade = this._lfoFadeGain();
    this.vibG = this._lfoGain('freq'); this.vibG.connect(this.vibFade);
    this.oscs.forEach(o => this.vibFade.connect(o.detune));
  }
  ensurePwm() {
    if (this._connPwm || this.disposed) return; this._connPwm = true;
    this.pwmFade = this._lfoFadeGain();
    this.pwmG = this._lfoGain('pwm'); this.pwmG.connect(this.pwmFade);
    this.oscs.forEach(o => this.pwmFade.connect(o.pw));
  }
  ensurePan()   { if (this._connPan   || this.disposed) return; this._connPan   = true; this.panG = this._lfoGain('pan'); this.panG.connect(this.panner.pan); }
  // Filter and drive modulation, on demand (the reason why, in the constructor)
  _filters() { return [this.lp, this.hp, this.lp2, this.hp2].filter(Boolean); }
  ensureCutLfo() { if (this.cutG || this.disposed) return; this.cutG = this._lfoGain('cut'); this._filters().forEach(f => this.cutG.connect(f.frequency)); }
  ensureResLfo() { if (this.resG || this.disposed) return; this.resG = this._lfoGain('res'); this.resG.connect(this.lp.Q); this.resG.connect(this.hp.Q); }
  ensureFenv()   { if (this._connFenv || this.disposed) return; this._connFenv = true; this._filters().forEach(f => this.fenvGain.connect(f.frequency)); }
  ensureMacro()  { if (this._connMacro || this.disposed || !this.mod.macroCut) return; this._connMacro = true; this._filters().forEach(f => this.mod.macroCut.connect(f.detune)); }
  // Drive with character: the curve's input is u = pre·x + bias, and the output
  // post·(f(u) − f(bias)) — in silence, exactly 0 (y = f(g·x + b) − f(b)). Bias and
  // compensation are ConstantSources: Asym moves without regenerating curves.
  _driveCfg() {
    const S = this.S, v = S.filterDrive, ch = S.driveChar === 'fold' ? 'fold' : 'soft';
    const R = ch === 'fold' ? FOLD_R : 1, curve = ch === 'fold' ? FOLD_CURVE : DRIVE_CURVE;
    const bias = (S.driveAsym || 0) * DRV_BIAS[ch] / R;
    return { ch, curve, os: ch === 'fold' ? '4x' : '2x', bias, comp: -curveAt(curve, bias),
             pre: (1 + DRV_GAIN[ch] * v) / R, mod: DRV_GAIN[ch] / R, post: (ch === 'fold' ? DRV_FOLD_MK : 1) / (1 + v * 1.5) };
  }
  ensureDrive() {
    if (this.dvShaper || this.disposed) return;
    const ctx = this.ctx, c = this._driveCfg(), now = ctx.currentTime;
    this.dvPre = ctx.createGain(); this.dvPre.gain.value = c.pre;
    this.dvShaper = ctx.createWaveShaper(); this.dvShaper.curve = c.curve; this.dvShaper.oversample = c.os; this.dvChar = c.ch;
    this.dvBias = ctx.createConstantSource(); this.dvBias.offset.value = c.bias; this.dvBias.start(now);
    this.dvComp = ctx.createConstantSource(); this.dvComp.offset.value = c.comp; this.dvComp.start(now);
    this.dvPost = ctx.createGain(); this.dvPost.gain.value = c.post;
    this.dvDC = ctx.createIIRFilter([1, -1], [1, -Math.exp(-2 * Math.PI * DRV_DC_HZ / ctx.sampleRate)]);   // 1st order: −0.1 dB at 40 Hz
    this.dvWet = ctx.createGain(); this.dvWet.gain.value = this.S.filterDrive;
    this.preFilter.connect(this.dvPre); this.dvPre.connect(this.dvShaper); this.dvBias.connect(this.dvShaper);
    this.dvShaper.connect(this.dvPost); this.dvComp.connect(this.dvPost);
    this.dvPost.connect(this.dvDC); this.dvDC.connect(this.dvWet); this.dvWet.connect(this.dvOut);
    // matrix (Drive target): the slot comes in through dvMod — its gain is the knob's travel
    // in curve units — onto the input gain (fold sweeps)
    this.dvMod = ctx.createGain(); this.dvMod.gain.value = c.mod; this.dvMod.connect(this.dvPre.gain);
  }
  _driveApply(tau = 0.02) {
    if (!this.dvShaper) return;
    const c = this._driveCfg(), tc = this.ctx.currentTime;
    if (this.dvChar !== c.ch) { this.dvShaper.curve = c.curve; this.dvShaper.oversample = c.os; this.dvChar = c.ch; }   // character change (the curve jumps: a click, like changing waveform)
    this.dvPre.gain.setTargetAtTime(c.pre, tc, tau);
    this.dvPost.gain.setTargetAtTime(c.post, tc, tau);
    this.dvMod.gain.setTargetAtTime(c.mod, tc, tau);
    this.dvBias.offset.setTargetAtTime(c.bias, tc, tau);
    this.dvComp.offset.setTargetAtTime(c.comp, tc, tau);
  }
  setDriveChar() { this._driveApply(); }
  setDriveAsym() { this._driveApply(); }

  // ---------- PER-VOICE LFOs and drift (Roadmap 5.0 · block 2) ----------
  // _vlfo(k): the own LFO k ('cut'|'res'|'freq'|'pwm'|'pan'), created on first
  // use reading the state (shape, speed, Level) and started at the phase that is due.
  // _lfoGain(k): the depth gain to be connected to the target —
  // the own LFO's with lfoPhase 'voice', the engine's global one otherwise.
  _vlfo(k) {
    const S = this.S;
    if (!this.vlfo[k]) this.vlfo[k] = mkVoiceLFO(this.ctx, S[k + 'LfoShape'] || 'sine', this.mod.lfoHz(k), S[k + 'LfoLvl'], this.t0,
      S.lfoPhase === 'voice' ? this.phase : 0, S.lfoPhase === 'once');   // the effective speed: in tempo, the division at the BPM
    return this.vlfo[k];
  }
  _lfoGain(k) { return this.vlfo ? this._vlfo(k).depth : this.mod[k + 'LFOGain']; }
  // «Drift (voice)» source: the drift buffer (nodes.lfoBuffers) read from the
  // voice's phase at speed mxDriftSpd, raw ±1 (the amount is set by the slot).
  _driftSrc() {
    if (!this.drift) this.drift = mkVoiceLFO(this.ctx, 'drift', this.S.mxDriftSpd, 1, this.t0, this.phase);
    return this.drift.out;
  }
  // Level / Speed / shape of LFO k live (called by the engine; with lfoPhase
  // 'global' there is no own copy and it does nothing: the global one already changed).
  setLfo(k, what, value) {
    if (!this.vlfo || !this.vlfo[k] || this.disposed) return;
    const l = this.vlfo[k], tc = this.ctx.currentTime;
    if (what === 'lvl') l.depth.gain.setTargetAtTime(value, tc, 0.02);
    else if (what === 'spd') setVoiceLfoRate(this.ctx, l, value, tc);
    else setVoiceLfoShape(this.ctx, l, value);
  }
  setMxDriftSpd(hz) { if (this.drift && !this.disposed) setVoiceLfoRate(this.ctx, this.drift, hz, this.ctx.currentTime); }

  // ---------- vocal: formant bank (table and curves in vocal.js) ----------
  // 3 bandpasses in parallel anchored at each formant's REF frequency; the
  // vowel morph travels through their DETUNE (cents ⇒ exponential, 0 Hz impossible).
  // Control signal (±1 domain): ConstantSource of the Vowel knob + the matrix
  // slots 'vow' ADD UP at the input of the WaveShapers; each shaper maps
  // control → cents (freqCurve) or → linear gain (gainCurve). WATCH OUT, WebAudio:
  // the bandpass Q is LINEAR (f/BW), not in dB like lowpass/highpass.
  //
  // TWO MODES, for cost. STATIC (the normal one: only the knob moves the vowel): the
  // formants are set with the curves' value at the control (Voice._shape,
  // same interpolation as a WaveShaper) and glide with setTargetAtTime.
  // DYNAMIC (Bite > 0, or a matrix slot towards 'Vowel'): as always —
  // ConstantSource of the knob + slots → 10 WaveShapers → cents and gains at
  // audio rate (_vocGoDynamic; also mid-note if a slot arrives).
  // And the 5 biquads run at K-RATE (coefficients once per block of 128
  // samples, 2.7 ms) except with the matrix: Life (slow walk), the knob
  // (~50 ms) and the Bite transition (τ 24 ms) are much slower than a
  // block, and recomputing per sample was half the CPU of a choir voice
  // (measured: bank + Life at audio rate ×4 versus k-rate without shapers). An
  // LFO towards 'Vowel' can indeed sweep fast: with the matrix, a-rate.
  ensureVocal() {
    if (this.vocBqs || this.disposed) return;
    const ctx = this.ctx, S = this.S, bank = getVocalBank(), mul = bwMul(S.vocQ), x = S.vocVowel * 2 - 1;
    this.vocWet = ctx.createGain(); this.vocWet.gain.value = S.vocAmt * vocMakeup(S.vocQ);
    this.vocBqs = []; this.vocGains = []; this.vocShapers = []; this.vocBrights = [];
    bank.forEach((f, i) => {
      const bq = ctx.createBiquadFilter(); bq.type = 'bandpass';
      Voice._rate(bq, 'k-rate');
      bq.frequency.value = f.ref;
      bq.detune.value = S.vocSize + Voice._shape(f.freqCurve, x);
      bq.Q.value = f.ref / (f.bw * mul);          // constant Q: the BW scales with the shift (natural)
      const g = ctx.createGain(); g.gain.value = Voice._shape(f.gainCurve, x) * this._vocBright(i, S.vocBright);
      this.dvOut.connect(bq); bq.connect(g); g.connect(this.vocWet);
      this.vocBqs.push(bq); this.vocGains.push(g);
    });
    this.vocWet.connect(this.vocOut);
    if (S.vocAtk > 0 || this._mxHasVow()) this._vocGoDynamic();
    // (the matrix's 'vow' slots need no rewiring: mxRewire goes through
    // _mxDestParams, which calls here BEFORE connecting — the bank always arrives first)
    if (this._needLife) this.ensureLife();
  }
  // Switch to dynamic mode: the control signal and its 10 WaveShapers (see above).
  _vocGoDynamic() {
    if (this.vocCtl || !this.vocBqs || this.disposed) return;
    const ctx = this.ctx, S = this.S, bank = getVocalBank();
    this.vocCtl = ctx.createConstantSource();
    const vTarget = S.vocVowel * 2 - 1;
    this.vocCtl.offset.value = vTarget;
    // 'Bite' part 1 — formant transition: the mouth STARTS closed
    // (shifted towards /u/, proportionally to the knob) and opens to the vowel.
    // Scheduled at t0 even if the bank is born mid-note: events in
    // the past = value already converged (the lfoFade trick).
    if (S.vocAtk > 0) {
      this.vocCtl.offset.setValueAtTime(Math.max(-1, vTarget - S.vocAtk * VOC_ATK_GLIDE), this.t0);
      this.vocCtl.offset.setTargetAtTime(vTarget, this.t0, VOC_ATK_TRANS);
    }
    this.vocCtl.start(this.t0);
    if (this._mxHasVow()) this.vocBqs.forEach(bq => Voice._rate(bq, 'a-rate'));   // the matrix can sweep fast
    bank.forEach((f, i) => {
      const bq = this.vocBqs[i], g = this.vocGains[i];
      bq.detune.cancelScheduledValues(0); bq.detune.value = S.vocSize;   // base: the Size; the vowel is added by its shaper
      g.gain.cancelScheduledValues(0); g.gain.value = 0;                // the gain is set by its shaper
      const shF = ctx.createWaveShaper(); shF.curve = f.freqCurve;
      const shG = ctx.createWaveShaper(); shG.curve = f.gainCurve;
      this.vocCtl.connect(shF); this.vocCtl.connect(shG);
      shF.connect(bq.detune);
      // F4-F5 (the singer's cluster): their gain goes through the Bright scaling
      if (i >= VOC_BRIGHT_IX) {
        const bg = ctx.createGain(); bg.gain.value = brightMul(S.vocBright);
        shG.connect(bg); bg.connect(g.gain);
        this.vocBrights.push(bg);
      } else shG.connect(g.gain);
      this.vocShapers.push(shF, shG);
    });
  }
  _vocBright(i, b) { return i >= VOC_BRIGHT_IX ? brightMul(b) : 1; }
  _mxHasVow() { for (let i = 1; i <= MX_SLOTS; i++) if (this.S['mx' + i + 'src'] !== 'off' && this.S['mx' + i + 'dst'] === 'vow') return true; return false; }
  // Value of a curve at control x ∈ [−1, 1] with the WaveShaper's
  // interpolation (spec: index (N−1)·(x+1)/2, linear between neighbours, clipped at the edges).
  static _shape(curve, x) {
    const N = curve.length, v = (N - 1) * (x + 1) / 2;
    if (!(v > 0)) return curve[0];
    if (v >= N - 1) return curve[N - 1];
    const k = Math.floor(v), f = v - k;
    return curve[k] + (curve[k + 1] - curve[k]) * f;
  }
  static _rate(bq, rate) { for (const p of [bq.frequency, bq.detune, bq.Q, bq.gain]) { try { p.automationRate = rate; } catch (e) { /* browser without automationRate: stays a-rate */ } } }
  // 'Life': micro-drift of the formants — a shared slow walk
  // (mod.wanderBuffer) read from a RANDOM offset per voice (a
  // decorrelated choir from a single buffer), added in cents to the detune of the
  // 3 biquads at once (correlated within the voice: there's only one jaw).
  ensureLife() {
    if (this.vocWander || this.disposed) return;
    if (!this.vocBqs) { this._needLife = true; return; }   // no bank yet: it hooks up when the bank is created
    const ctx = this.ctx, buf = this.mod.wanderBuffer;
    if (!buf) return;
    this.vocWander = ctx.createBufferSource();
    this.vocWander.buffer = buf; this.vocWander.loop = true;
    this.vocWanderGain = ctx.createGain();
    this.vocWanderGain.gain.value = this.S.vocLife * VOC_LIFE_CENTS;
    this.vocWander.connect(this.vocWanderGain);
    this.vocBqs.forEach(bq => this.vocWanderGain.connect(bq.detune));
    this.vocWander.start(this.t0, this.rnd() * buf.duration);
  }
  // 'Bite' part 2 — one-shot noise burst through a WIDE band-pass
  // centred on the current vowel's F2 (place of articulation: «ka» ≠ «ku»);
  // it enters vocOut = it still goes through LP/HP, VCA and pan like everything else.
  // It dies out in ~50 ms and cleans itself up; it doesn't touch the VCA or the release.
  _vocBurst(t, vel) {
    const S = this.S, bank = getVocalBank();
    const f2 = bank[1];                       // F2: cents at the current vowel position + Size
    const ix = Math.max(0, Math.min(f2.freqCurve.length - 1, Math.round(S.vocVowel * (f2.freqCurve.length - 1))));
    const hz = f2.ref * Math.pow(2, (f2.freqCurve[ix] + S.vocSize) / 1200);
    const src = this.ctx.createBufferSource();
    src.buffer = this.mod.noiseBuffer; src.loop = true;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(S.vocAtk * VOC_ATK_GAIN * vel * S.vocAmt, t);
    g.gain.setTargetAtTime(0, t, VOC_ATK_TAU);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = hz; bp.Q.value = VOC_ATK_Q;
    src.connect(g); g.connect(bp); bp.connect(this.vocOut);
    src.start(t, this.rnd() * 1.5);           // random offset: each consonant is different
    src.stop(t + 0.25);                       // at ~16·τ the burst is at -140 dB: free it
    src.onended = () => { try { src.disconnect(); } catch (e) {} try { g.disconnect(); } catch (e) {} try { bp.disconnect(); } catch (e) {} };
    this.vocBurstSrc = src; this.vocBurstGain = g; this.vocBurstBp = bp;
  }

  // ---------- resonator: modal bank (tables and formulas in reson.js) ----------
  // Six bandpasses in parallel at f0·ratio_i, input = the voice's signal after the
  // Vocal (gain 1) + the voice's noise BOOSTED ∝ √Q (see reson.js); the
  // sum goes through resWet (= Mix) to resOut, where the dry path is already waiting.
  ensureReson() {
    if (this.resBqs || this.disposed) return;
    const ctx = this.ctx, S = this.S, q = resQ(S.resDecay), nyq = ctx.sampleRate * 0.45;
    this.resRatios = resRatios(S.resMat); this.resFreq = this.noteFreq;
    const gains = resGains(this.resRatios, S.resBright);
    this.resIn = ctx.createGain();
    this.resNoise = ctx.createGain(); this.resNoise.gain.value = resNoiseGain(q);
    this.vocOut.connect(this.resIn); this.noiseGain.connect(this.resNoise); this.resNoise.connect(this.resIn);
    this.resWet = ctx.createGain(); this.resWet.gain.value = S.resAmt;
    this.resBqs = []; this.resGs = [];
    this.resRatios.forEach((r, i) => {
      const f = this.noteFreq * r, bq = ctx.createBiquadFilter(); bq.type = 'bandpass';
      bq.frequency.value = Math.min(nyq, f); bq.Q.value = q;                 // LINEAR Q on the bandpass (f/BW)
      const g = ctx.createGain(); g.gain.value = f < nyq ? gains[i] : 0;     // mode above Nyquist: muted
      this.resIn.connect(bq); bq.connect(g); g.connect(this.resWet);
      this.resBqs.push(bq); this.resGs.push(g);
    });
    this.resWet.connect(this.resOut);
  }
  _resRetune(tau = 0.03) {       // frequencies (current note × ratios) and gains (Bright), smoothed
    if (!this.resBqs) return;
    const tc = this.ctx.currentTime, nyq = this.ctx.sampleRate * 0.45, gains = resGains(this.resRatios, this.S.resBright);
    this.resBqs.forEach((bq, i) => {
      const f = this.resFreq * this.resRatios[i];
      bq.frequency.setTargetAtTime(Math.min(nyq, f), tc, tau);
      this.resGs[i].gain.setTargetAtTime(f < nyq ? gains[i] : 0, tc, tau);
    });
  }
  setResAmt(v) {
    if (v > 0) this.ensureReson();
    const tc = this.ctx.currentTime;
    this.resDry.gain.setTargetAtTime(1 - v, tc, 0.02);
    if (this.resWet) this.resWet.gain.setTargetAtTime(v, tc, 0.02);
  }
  setResMat(m)    { if (!this.resBqs) return; this.resRatios = resRatios(m); this._resRetune(); }
  // Material via the matrix: the knob interpolates the LOG of the ratios (string → bar),
  // so in cents it is linear and each mode moves by the gap between its two ratios
  // (0, 555, 1019, 1391, 1699, 1962 ct): the tuning adds to the knob with no approximation. The WEIGHTS
  // of the modes (resGains, which depend on the ratios) follow the knob's: it retunes, it doesn't change material entirely.
  _resMatMods() {
    if (!this.resBqs) return [];
    if (!this.resMatG) this.resMatG = this.resBqs.map((bq, i) => {
      const g = this.ctx.createGain(); g.gain.value = 1200 * Math.log2(RES_BAR[i] / RES_HARM[i]); g.connect(bq.detune); return g;
    });
    return this.resMatG;
  }
  setResBright()  { this._resRetune(); }
  setResDecay(d) {
    if (!this.resBqs) return;
    const q = resQ(d), tc = this.ctx.currentTime;
    this.resBqs.forEach(bq => bq.Q.setTargetAtTime(q, tc, 0.03));
    this.resNoise.gain.setTargetAtTime(resNoiseGain(q), tc, 0.03);
  }

  // ---------- modulation matrix (tables in params.js) ----------
  // Source of a slot: the LFOs come in RAW (the global oscillator, ±1, without
  // going through its Level knob); 'env' is the filter env's ConstantSource;
  // vel/note/rnd are a fixed value per note => their own ConstantSource ("CV").
  _mxSrcNode(src) {
    if (src.startsWith('lfo')) {        // with lfoPhase 'voice', the own LFO (raw, ±1); the tremolo is always the global one (it sits after the mix)
      const k = { lfoCut: 'cut', lfoRes: 'res', lfoFreq: 'freq', lfoPwm: 'pwm' }[src];
      return (this.vlfo && k) ? this._vlfo(k).out : (this.mod.mxLfo[src] || null);
    }
    if (src === 'drift') return this._driftSrc();
    if (this.mod.perf && this.mod.perf[src]) return this.mod.perf[src];   // wheel / aftertouch / expression (0..1, from the engine)
    if (src === 'env') return this.fenv;
    if (src === 'envm') return this._envmSrc();
    if (this._mxConsts[src]) return this._mxConsts[src];
    const st = /^st(\d)(n?)$/.exec(src);              // Steps (Roadmap 7.0 · 2.3)
    if (st && !st[2]) return this.mod.stepSrc(+st[1], this.t0);   // continuous: the engine's source
    if (st) {                                          // · note: the value of the step in which the note starts, fixed
      const c = this.ctx.createConstantSource(); c.offset.value = this.mod.stepVal(+st[1], this.t0); c.start(this.t0);
      return this._mxConsts[src] = c;
    }
    const val = src === 'vel' ? this.vel
      : src === 'acc' ? this.acc
      : src === 'note' ? Math.max(-1, Math.min(1, Math.log2(this.noteFreq / 261.63) / 2))
      : src === 'rnd' ? this.rnd() * 2 - 1 : null;
    if (val === null) return null;
    const c = this.ctx.createConstantSource(); c.offset.value = val; c.start(this.t0);
    return this._mxConsts[src] = c;
  }
  _mxDestParams(dst) {
    switch (dst) {
      case 'pitch':  return this.oscs.map(o => o.detune);
      case 'pw':     return this.oscs.map(o => o.pw);
      // cutoff through the biquad's DETUNE (cents): computedFreq = freq·2^(det/1200),
      // exponential and never crossing 0 Hz. All the stages, like the cutLFO.
      case 'cutoff': return [this.lp, this.hp, this.lp2, this.hp2].filter(Boolean).map(f => f.detune);
      case 'reso':   return [this.lp.Q, this.hp.Q];
      case 'amp':    return [this.ampMod.gain];
      case 'pan':    return [this.panner.pan];
      case 'wt':     return this.oscs.map(o => o.wt).filter(Boolean);
      case 'fm':     return this.oscs.map(o => o.fmI);           // FM index (k-rate; its min 0 clips)
      // Roadmap 7.0 · 2.4 — Mixer: the gain of each source (below 0, inverted phase)
      case 'lvlA':   return [this.gA.gain];
      case 'lvlB':   return [this.gB.gain];
      case 'lvlRing':return [this.ringX.gain];
      case 'lvlNoise': return [this.noiseGain.gain];
      case 'pitchA': return [this.oscs[0].slave || this.oscs[0].detune];   // only A, and only as SLAVE: the sync sweep doesn't move the master
      case 'drive':  this.ensureDrive(); return [this.dvMod];    // input gain of the curve (audible with Drive > 0)
      case 'resMat': this.ensureReson(); return this._resMatMods();
      // vocal: the slot adds its signal at the INPUT of the WaveShapers (next
      // to the knob's ConstantSource) — connect() accepts nodes just like params.
      // Outside [-1,1] the shaper saturates: the sweep stops at u / i.
      case 'vow':    this.ensureVocal(); this._vocGoDynamic(); (this.vocBqs || []).forEach(bq => Voice._rate(bq, 'a-rate')); return this.vocShapers || [];
    }
    return [];
  }
  mxRewire(i) {                 // (re)wires slot i reading the current state
    if (this.disposed) return;
    const old = this.mxSlots[i];
    if (old) {
      try { old.src.disconnect(old.gain); } catch (e) {}
      try { old.gain.disconnect(); } catch (e) {}
      this.mxSlots[i] = null;
    }
    const S = this.S, srcId = S['mx' + i + 'src'], dstId = S['mx' + i + 'dst'];
    if (!srcId || srcId === 'off') return;
    const src = this._mxSrcNode(srcId), params = this._mxDestParams(dstId);
    if (!src || !params.length) return;
    const gain = this.ctx.createGain();
    gain.gain.value = (S['mx' + i + 'amt'] || 0) * (MX_SPAN[dstId] || 0);
    src.connect(gain);
    params.forEach(p => gain.connect(p));
    this.mxSlots[i] = { src, gain, dst: dstId };
  }
  mxSetAmt(i) {                 // only changes the slot's gain (cheap, live)
    const slot = this.mxSlots[i]; if (!slot || this.disposed) return;
    slot.gain.gain.setTargetAtTime((this.S['mx' + i + 'amt'] || 0) * (MX_SPAN[slot.dst] || 0), this.ctx.currentTime, 0.02);
  }

  // ---------- live updates (called by the engine when knobs are turned) ----------
  setLevel(o, v) { (o === 'A' ? this.gA : this.gB).gain.setTargetAtTime(v, this.ctx.currentTime, 0.02); }
  setRing(r)   { this.ringX.gain.setTargetAtTime(r, this.ctx.currentTime, 0.02); }
  setNoise(n)  { this.noiseGain.gain.setTargetAtTime(n * Voice._noiseColorCfg(this.S.noiseColor).mk, this.ctx.currentTime, 0.02); }
  setNoiseColor(c) {
    const tc = this.ctx.currentTime, nf = Voice._noiseColorCfg(c);
    this.nLP.frequency.setTargetAtTime(nf.lp, tc, 0.02);
    this.nHP.frequency.setTargetAtTime(nf.hp, tc, 0.02);
    this.noiseGain.gain.setTargetAtTime(this.S.noise * nf.mk, tc, 0.02);
  }
  setCutoff(hz){ const tc = this.ctx.currentTime, v = Math.min(20000, hz * this.ktMul);
    [this.lp, this.hp, this.lp2, this.hp2].forEach(f => f && f.frequency.setTargetAtTime(v, tc, 0.02)); }
  setKeytrack(kt, cutoffHz) { this.ktMul = kt ? Math.pow(this.noteFreq / 261.63, kt) : 1; this.setCutoff(cutoffHz); }
  setReso(q)   { const tc = this.ctx.currentTime, v = this.filterType === 'bp' ? q / 2 : q; this.lp.Q.setTargetAtTime(v, tc, 0.02); this.hp.Q.setTargetAtTime(v, tc, 0.02); }
  setMorph(m)  { if (this.filterType !== 'morph') return; const tc = this.ctx.currentTime; this.lpMix.gain.setTargetAtTime(1 - m, tc, 0.02); this.hpMix.gain.setTargetAtTime(m, tc, 0.02); }
  setFilterEnvAmt(hz) { if (hz) this.ensureFenv(); this.fenvGain.gain.setTargetAtTime(hz, this.ctx.currentTime, 0.02); }
  setFilterDrive(v) {
    if (v > 0) this.ensureDrive();
    const tc = this.ctx.currentTime;
    this.dvDry.gain.setTargetAtTime(1 - v, tc, 0.02);
    if (!this.dvWet) return;
    this._driveApply();
    this.dvWet.gain.setTargetAtTime(v, tc, 0.02);
  }
  setPulseWidth(pw)   { const tc = this.ctx.currentTime, v = this._clampPW(pw); this.oscs.forEach(o => o.pw.setTargetAtTime(v, tc, 0.02)); }
  setSpread(v)        { const tc = this.ctx.currentTime; this.oscs.forEach(o => o.sp.setTargetAtTime(v, tc, 0.02)); }
  setDrift(v)         { const tc = this.ctx.currentTime; this.oscs.forEach(o => o.dr.setTargetAtTime(v, tc, 0.02)); }
  setUnison(n, ct)    { const tc = this.ctx.currentTime; this.oscs.forEach(o => { o.uv.setValueAtTime(+n || 1, tc); o.ud.setTargetAtTime(ct, tc, 0.02); }); }
  setFM(ratio, index, fb = 0) { const tc = this.ctx.currentTime; this.oscs.forEach(o => { o.fmR.setValueAtTime(ratio, tc); o.fmI.setTargetAtTime(index, tc, 0.02); if (o.fmF) o.fmF.setTargetAtTime(fb, tc, 0.02); }); }
  // Level of operator i with its velocity sensitivity (fm4V, the DX7's «key velocity
  // sensitivity»): at 0 the level doesn't depend on how hard you hit; at 1 it is
  // proportional to velocity. In a modulator the level IS the index: hitting
  // harder = more harmonics, not just more volume.
  _fm4Lvl(i) { const s = +this.S['fm4V' + i] || 0; return +this.S['fm4L' + i] * (1 - s + s * this.vel); }
  setFm4(key, v) {
    const lv = /^fm4[LV](\d)$/.exec(key);   // Level and Vel move the same worklet param
    if (lv) { key = 'fm4L' + lv[1]; v = this._fm4Lvl(+lv[1]); }
    const tc = this.ctx.currentTime; this.oscs.forEach(o => { const ap = o.fm4P && o.fm4P[key]; if (!ap) return; if (key === 'fm4Alg') ap.setValueAtTime(+v, tc); else ap.setTargetAtTime(+v, tc, 0.02); }); }
  setStr(key, v)      { const tc = this.ctx.currentTime; this.oscs.forEach(o => o.strP && o.strP[key] && o.strP[key].setTargetAtTime(+v, tc, 0.02)); }
  setWtPos(v)         { const tc = this.ctx.currentTime; this.oscs.forEach(o => o.wt && o.wt.setTargetAtTime(v, tc, 0.02)); }
  setWidth(w)         { this.panner.pan.setTargetAtTime(this.basePan * w, this.ctx.currentTime, 0.03); }

  // ---------- live vocal ----------
  setVocAmt(v) {
    if (v > 0) this.ensureVocal();
    const tc = this.ctx.currentTime;
    this.vocDry.gain.setTargetAtTime(1 - v, tc, 0.02);
    if (this.vocWet) this.vocWet.gain.setTargetAtTime(v * vocMakeup(this.S.vocQ), tc, 0.02);
  }
  setVocVowel(v) {   // ~50 ms articulation: the knob "pronounces", it doesn't jump
    if (this.vocCtl) { this.vocCtl.offset.setTargetAtTime(v * 2 - 1, this.ctx.currentTime, VOC_SMOOTH); return; }
    this._vocStatic(v * 2 - 1, VOC_SMOOTH);          // static mode: the formants, directly
  }
  setVocSize(ct) {
    const tc = this.ctx.currentTime;
    if (!this.vocBqs) return;
    if (this.vocCtl) this.vocBqs.forEach(bq => bq.detune.setTargetAtTime(ct, tc, 0.02));
    else this._vocStatic(this.S.vocVowel * 2 - 1, 0.02, ct);
  }
  // Static mode: takes frequencies (cents) and gains to point x of the curves
  _vocStatic(x, tau, size = this.S.vocSize) {
    if (!this.vocBqs || this.vocCtl) return;
    const tc = this.ctx.currentTime, bank = getVocalBank();
    bank.forEach((f, i) => {
      this.vocBqs[i].detune.setTargetAtTime(size + Voice._shape(f.freqCurve, x), tc, tau);
      this.vocGains[i].gain.setTargetAtTime(Voice._shape(f.gainCurve, x) * this._vocBright(i, this.S.vocBright), tc, tau);
    });
  }
  setVocQ(q) {
    if (!this.vocBqs) return;
    const tc = this.ctx.currentTime, mul = bwMul(q), bank = getVocalBank();
    this.vocBqs.forEach((bq, i) => bq.Q.setTargetAtTime(bank[i].ref / (bank[i].bw * mul), tc, 0.02));
    this.vocWet.gain.setTargetAtTime(this.S.vocAmt * vocMakeup(q), tc, 0.02);
  }
  setVocBright(b) {
    if (!this.vocBqs) return;
    if (!this.vocCtl) { this._vocStatic(this.S.vocVowel * 2 - 1, 0.02); return; }   // static: Bright goes into the gain of F4-F5
    const tc = this.ctx.currentTime;
    this.vocBrights.forEach(g => g.gain.setTargetAtTime(brightMul(b), tc, 0.02));
  }
  setVocLife(v) {
    if (v > 0) this.ensureLife();
    if (this.vocWanderGain) this.vocWanderGain.gain.setTargetAtTime(v * VOC_LIFE_CENTS, this.ctx.currentTime, 0.02);
  }

  // Glides the tuning to a new note (mono/legato), WITHOUT retriggering the envelope.
  // `at` (optional): musical time of the note (arp/Seq/players schedule it
  // ahead): the change lands at its place on the grid, not when it is scheduled.
  glideTo(freq, time, at = null) {
    const now = this.ctx.currentTime;
    const t = at !== null ? Math.max(now, at + this.lag) : now;
    // Starting point of the ramp. cancelAndHoldAtTime only leaves one if there is an
    // automation AFTER t to cut; if not (the note already reached its pitch),
    // the ramp started from the last event — the note's start — and the glide
    // began early (the sequencer slide rose from the beginning
    // of the step; the Mono legato, the same). Each parameter remembers its last pitch
    // and until when its ramp lasts: with a ramp running at t, cancelAndHold cuts it
    // where it is; without one, the point is set by hand at the pitch it reached.
    const slide = (p, target) => {
      const last = this._glideLast.get(p) || { value: p.value, end: 0 };
      if (time > 0) {
        if (last.end > t && p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
        else { p.cancelScheduledValues(t); p.setValueAtTime(Math.max(1, last.end > t ? p.value : last.value), t); }
        p.exponentialRampToValueAtTime(target, t + time);
      } else {
        p.cancelScheduledValues(t); p.setValueAtTime(target, t);
      }
      this._glideLast.set(p, { value: target, end: t + time });
    };
    this.oscs.forEach(o => slide(o.freq, Math.max(1, freq * o.ratio)));
    // the resonator bank follows the note: its modes slide with the oscillators
    if (this.resBqs) { const nyq = this.ctx.sampleRate * 0.45; this.resFreq = freq; this.resBqs.forEach((bq, i) => slide(bq.frequency, Math.min(nyq, freq * this.resRatios[i]))); }
  }

  // ---------- Mod Env (Roadmap 7.0 · 2.1): the matrix's free envelope ----------
  // Born on demand (a slot with source «Mod env»), 0..1 and without velocity, with its
  // curve. normal = ADSR (like the filter one); trigger = A → D → R in a row, the
  // note-off doesn't touch it; loop = A (0 → 1) + D (1 → 0) repeated while the
  // note lasts: ONE cycle in a looped buffer started at t0 — sample-exact and with no
  // nodes per repetition —; on release, the buffer stops and a ConstantSource carries on
  // from the value it had (computed: the shape is known) with the release.
  _envmSrc() {
    if (this.envm) return this.envm.out;
    const ctx = this.ctx, S = this.S, now = ctx.currentTime, t0 = this.t0;
    const A = Math.max(0.001, S.envmA), D = Math.max(0.001, S.envmD), mode = S.envmMode, curve = S.envmCurve || 0;
    const out = ctx.createGain(), c = ctx.createConstantSource(); c.offset.value = 0; c.connect(out); c.start(Math.min(now, t0));
    const e = { out, c, mode, A, D, sus: S.envmS, R: Math.max(0.006, S.envmR), curve, t0, loop: null };
    if (mode === 'loop') {
      const T = A + D, cyc = envmCycle(ctx, A / T, curve), src = ctx.createBufferSource();
      src.buffer = cyc; src.loop = true; src.playbackRate.value = cyc.duration / T;
      src.connect(out);
      if (t0 >= now) src.start(t0); else src.start(now, (((now - t0) % T) / T) * cyc.duration);   // born mid-note (the matrix changed)
      e.loop = src; e.T = T;
    } else {
      const p = c.offset;
      p.setValueAtTime(0, t0);
      this._envSegs(p, 0, 1, e.sus, t0, A, D, curve);
      if (mode === 'trigger') this._relChain(p, t0 + A + D, e.sus, e.R, curve);
      e.env = { t: t0, peak: 1, sus: e.sus, a: A, d: D, curve };
    }
    this.envm = e;
    return out;
  }
  // Value of the loop at t (the cycle's shape: attack and fall with the curve)
  _envmLoopAt(t) {
    const e = this.envm, x = (((t - e.t0) % e.T) + e.T) % e.T, fa = e.A / e.T, k = ENV_K * e.curve, den = 1 - Math.exp(-k);
    const rc = u => (k > 0 ? (1 - Math.exp(-k * u)) / den : u);
    return x < e.A ? rc(x / e.A) : 1 - rc((x - e.A) / e.D);
  }
  _envmRelease(t) {
    const e = this.envm, now = this.ctx.currentTime;
    if (e.mode === 'trigger') return;                 // ignores the note-off: the curve runs in full
    if (e.mode === 'loop') {
      const v = this._envmLoopAt(t), p = e.c.offset;
      try { e.loop.stop(t); } catch (err) {}
      p.setValueAtTime(v, t); this._relChain(p, t, v, e.R, e.curve);
      return;
    }
    if (t > now) this._releaseParamAt(e.c.offset, t, e.R, e.env); else this._releaseParam(e.c.offset, t, e.R, e.curve);
  }

  // ---------- release ----------
  // `at` (optional): MUSICAL time of the note-off (the scale of startAt); it sounds `lag` later.
  release(rel, at = null) {
    rel = Math.max(0.006, rel);
    const now = this.ctx.currentTime;
    const t = at !== null ? Math.max(now, at + this.lag) : now;   // arp/Seq/players schedule the note-off on the audio clock
    const fRel = this.S.fenvMode === 'own' ? Math.max(0.006, this.S.fr) : rel;
    // Release with the knob's curve, anchoring the CURRENT value. Key: if you release mid-ramp
    // (e.g. the decay of a pluck with sustain 0), a bare cancelScheduledValues erases the
    // target ramp and the parameter stays stuck at the LAST event (the attack peak)
    // -> the gain would jump at once to peak = audible retrigger on release. Anchoring the
    // current value first avoids that jump; and since cancelAndHoldAtTime isn't used there's no click either.
    if (t > now) { this._releaseParamAt(this.vca.gain, t, rel, this._envAmp); this._releaseParamAt(this.fenv.offset, t, fRel, this._envFil); }
    else { this._releaseParam(this.vca.gain, t, rel); this._releaseParam(this.fenv.offset, t, fRel); }
    if (this.envm) this._envmRelease(t);
    return t + rel + 0.03;  // the chain reaches exactly 0 at t + rel: freeing the nodes there is inaudible
                            // (the amplitude release rules: with the VCA closed the filter isn't heard)
  }
  _releaseParam(param, t, rel, curve) {
    const cur = param.value;            // reflects the value of the running ramp
    param.cancelScheduledValues(t);
    param.setValueAtTime(cur, t);       // anchor here -> no jump
    this._relChain(param, t, cur, rel, curve);
  }
  // Release scheduled in the FUTURE (arp, Seq, players): the value the ramp
  // will have at t can't be read yet — it is computed. cancelAndHoldAtTime cuts at t
  // the ramp that crosses it (cancelScheduledValues(t) would erase it: if it's the
  // attack's, the note would go silent). But WATCH OUT: per the spec it only leaves an
  // event at t if a ramp CROSSES it; if the envelope had already settled on the
  // sustain, it adds nothing and the release ramp would start from the LAST event (the
  // end of the decay, in the past): the gain would fall in a straight line from there, all at once
  // when scheduled. Hence the explicit anchor at t.
  _releaseParamAt(param, t, rel, env) {
    const v = this._envValueAt(env, t);
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
    else param.cancelScheduledValues(t);
    param.setValueAtTime(v, t);
    this._relChain(param, t, v, rel, env.curve);
  }

  // Fast click-free cut (voice stealing / tail trimming): re-ramps the VCA to zero.
  fadeOut(tau = 0.01) {
    const t = this.ctx.currentTime;
    this._releaseParam(this.vca.gain, t, tau);
    this._releaseParam(this.fenv.offset, t, tau);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const m = this.mod;
    if (m.stats) m.stats.worklets -= this.oscs.length;
    // disconnect the global modulation from this voice's params and stop worklets
    // (vibrato/PWM arrive through the per-voice fade gains)
    if (this.vibFade) { try { this.vibG.disconnect(this.vibFade); } catch (e) {} try { this.vibFade.disconnect(); } catch (e) {} }
    if (this.pwmFade) { try { this.pwmG.disconnect(this.pwmFade); } catch (e) {} try { this.pwmFade.disconnect(); } catch (e) {} }
    this.oscs.forEach(o => {
      try { m.pitchOffset.disconnect(o.detune); } catch (e) {}
      try { o.node.port.postMessage('stop'); } catch (e) {}
      try { o.node.disconnect(); } catch (e) {}
    });
    // (cutG/resG/panG are the engine's global gains or the voice's own: the same disconnection)
    if (this.panG) { try { this.panG.disconnect(this.panner.pan); } catch (e) {} }
    if (this.cutG) this._filters().forEach(f => { try { this.cutG.disconnect(f.frequency); } catch (e) {} });
    if (this.resG) { try { this.resG.disconnect(this.lp.Q); } catch (e) {} try { this.resG.disconnect(this.hp.Q); } catch (e) {} }
    if (this._connMacro) this._filters().forEach(f => { try { this.mod.macroCut.disconnect(f.detune); } catch (e) {} });   // the macro belongs to the engine: release only this voice's part
    // the voice's own LFOs and drift: stop their buffers (a looped BufferSource doesn't stop by itself)
    if (this.vlfo) for (const k in this.vlfo) stopVoiceLFO(this.vlfo[k]);
    stopVoiceLFO(this.drift);
    // matrix: release the slots (the source may be a global LFO: it must be
    // disconnected from the slot's gain so as not to leave garbage in the graph)
    this.mxSlots.forEach(s => {
      if (!s) return;
      try { s.src.disconnect(s.gain); } catch (e) {}
      try { s.gain.disconnect(); } catch (e) {}
    });
    for (const k in this._mxConsts) {
      try { this._mxConsts[k].stop(); } catch (e) {}
      try { this._mxConsts[k].disconnect(); } catch (e) {}
    }
    [this.busA, this.busB, this.gA, this.gB, this.ringX, this.noiseGain, this.nLP, this.nHP,
     this.lp, this.hp, this.lp2, this.hp2, this.lpMix, this.hpMix, this.fenvGain, this.vca, this.ampMod, this.panner,
     this.dvDry, this.dvPre, this.dvShaper, this.dvPost, this.dvWet, this.dvOut, this.dvBias, this.dvComp, this.dvDC, this.dvMod, ...(this.resMatG || []),
     this.vocDry, this.vocOut, this.vocWet, this.vocCtl, this.vocWanderGain, this.vocBurstGain, this.vocBurstBp,
     ...(this.vocBqs || []), ...(this.vocGains || []), ...(this.vocShapers || []),
     ...(this.vocBrights || []),
     this.resDry, this.resOut, this.resIn, this.resNoise, this.resWet, ...(this.resBqs || []), ...(this.resGs || [])].forEach(n => {
      if (n) { try { n.disconnect(); } catch (e) {} }
    });
    try { this.noiseSrc.stop(); } catch (e) {}
    try { this.fenv.stop(); } catch (e) {}
    if (this.envm) { const m = this.envm; try { m.c.stop(); } catch (e) {} if (m.loop) { try { m.loop.stop(); } catch (e) {} try { m.loop.disconnect(); } catch (e) {} } try { m.c.disconnect(); } catch (e) {} try { m.out.disconnect(); } catch (e) {} }
    if (this.dvBias) { try { this.dvBias.stop(); } catch (e) {} try { this.dvComp.stop(); } catch (e) {} }
    if (this.vocCtl) { try { this.vocCtl.stop(); } catch (e) {} }
    if (this.vocWander) { try { this.vocWander.stop(); } catch (e) {} try { this.vocWander.disconnect(); } catch (e) {} }
    if (this.vocBurstSrc) { try { this.vocBurstSrc.stop(); } catch (e) {} try { this.vocBurstSrc.disconnect(); } catch (e) {} }
  }
}
