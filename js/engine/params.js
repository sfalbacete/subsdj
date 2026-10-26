/* =====================================================================
   SubSDJ · PARAMS — the SINGLE parameter table (source of truth).
   Key = canonical name (it is the key of CONTROLS and of v2 presets).
   Values ALWAYS in engine space (Hz, seconds, cents, 0..1…).
   Fields:
     def       default value (state.js and the whole UI derive from it): NEUTRAL,
               it is what Reset leaves (presets go on top of PRESET_BASE, below)
     min/max   control range
     t         engine target if it differs from the key ('oscA.detune')
     unit      suffix for the knobs' generic format (' Hz', ' ct'…)
     step      slider granularity (sliders only)
     fmt       specific display format (sliders only)
     log       true = the slider works in a 0..1 position with a log mapping min→max
     lmin      floor of the log span when min = 0 (position 0 = EXACTLY 0 —
               «off» or «step»—, and from there on log from lmin)
     act       true = 0 is "off" (not a setting): the knob dims at 0
               and the parameter counts for the activity LEDs (ui/activity.js)
   The switch in AudioEngine.set() is still what APPLIES each parameter
   to the graph: that is audio logic, not metadata, and it reads well there.
   ===================================================================== */

import { VOC_ORDER } from './vocal.js';

const msFmt = v => (v * 1000).toFixed(0) + ' ms';
// Times ×10 (Roadmap 5.0 · block 1): ms below 1 s, seconds above
const secFmt = v => v >= 1 ? v.toFixed(2) + ' s' : (v * 1000).toFixed(0) + ' ms';
// Truly slow LFOs (0.005 Hz = one cycle every 200 s): three decimals below 0.1 Hz
export const dbFmt = v => (v <= 0 ? '−∞' : (d => (d >= 0.05 ? '+' : '') + d.toFixed(1).replace('-', '−') + ' dB')(20 * Math.log10(v)));   // linear gain → dB
const hzFmt = v => (v < 0.1 ? v.toFixed(3) : v < 10 ? v.toFixed(2) : v.toFixed(1)) + ' Hz';
const decFmt = v => v >= 3.99 ? '∞' : (v < 1 ? (v * 1000).toFixed(0) + ' ms' : v.toFixed(2) + ' s');   // per-operator decay (FM4): top = flat
const twoDec = v => v.toFixed(2);
// Vowel knob: shows the vowel (u, o, a…) or the span between two (u·o)
const vowelFmt = v => {
  const p = v * (VOC_ORDER.length - 1), i = Math.min(VOC_ORDER.length - 2, Math.floor(p)), w = p - i;
  return w < 0.06 ? VOC_ORDER[i] : w > 0.94 ? VOC_ORDER[i + 1] : VOC_ORDER[i] + '·' + VOC_ORDER[i + 1];
};

export const PARAMS = {
  // --- Oscillators ---
  waveA:    { def: 'sawtooth', t: 'oscA.wave' },
  detuneA:  { def: 0, min: -50, max: 50, unit: ' ct', t: 'oscA.detune' },
  phaseA:   { def: 0, min: 0, max: 360, unit: '°', t: 'oscA.phase' },
  octA:     { def: 0, min: -2, max: 2, t: 'oscA.oct' },        // Octave: ±2 transposition (−1 = sub-oscillator; per note)
  octavesA: { def: 1, min: 1, max: 4, t: 'oscA.octaves' },    // Stack: 1-4 octaves UPWARD inside the oscillator
  syncA:    { def: 'off' },   // Hard sync (Roadmap 7.0 · 3.2): 'on' = A restarts its cycle on every cycle of B
  waveB:    { def: 'square', t: 'oscB.wave' },
  detuneB:  { def: 0, min: -50, max: 50, unit: ' ct', t: 'oscB.detune' },
  phaseB:   { def: 0, min: 0, max: 360, unit: '°', t: 'oscB.phase' },
  octB:     { def: 0, min: -2, max: 2, t: 'oscB.oct' },
  octavesB: { def: 1, min: 1, max: 4, t: 'oscB.octaves' },
  // Minimoog-style mixer (1.2.0): each source with ITS own level, summed before the
  // filter (replaces the Mix A↔B crossfade; state.migrateMix translates older
  // presets). Linear, shown in dB. Two at full add up: +3 dB if detuned
  // (powers), +6 dB if they are the same wave in phase; with Drive, more saturation.
  levelA:   { def: 1, min: 0, max: 1, fmt: dbFmt, act: true },   // Reset: oscillator A alone
  levelB:   { def: 0, min: 0, max: 1, fmt: dbFmt, act: true },
  ring:     { def: 0, min: 0, max: 1, fmt: dbFmt, act: true },   // A×B, summed as one more source (it no longer lowers A and B)
  noise:    { def: 0, min: 0, max: 1, fmt: dbFmt, act: true },
  noiseColor:{ def: 0, min: -1, max: 1 },           // − dark (LP) · 0 white · + "air" (HP)
  spread:   { def: 0.5, min: 0, max: 1 },
  drift:    { def: 0, min: 0, max: 15, unit: ' ct', act: true },   // slow random drift per oscillator (analog)
  uniVoices:{ def: '1' },                               // unison: 1..7 copies per oscillator (seg; supersaw ignores it)
  uniDetune:{ def: 12, min: 0, max: 50, unit: ' ct' },  // detune of the outermost unison copies
  fmRatio:  { def: 1, min: 0.25, max: 12 },
  fmIndex:  { def: 0, min: 0, max: 12, act: true },
  fmFb:     { def: 0, min: 0, max: 1, act: true },   // modulator feedback (DX7 op. 6): its sine approaches a saw; at full, noise
  // FM4 (wave 'fm4'): algorithm + ratio / level / decay of each operator (op 1 is the basic carrier)
  fm4Alg: { def: '0' },                             // index into the worklet's FM4_ALGS (seg of 8 buttons)
  // String (Roadmap 7.0 · 3.3): the oscillators' «String» wave (Karplus-Strong), shared by A and B
  strBright: { def: 0.5, min: 0, max: 1 },                                  // how long the highs hold up against the fundamental
  strDecay:  { def: 3, min: 0.05, max: 30, log: true, fmt: secFmt },        // T60 of the fundamental at C4 (higher notes, less)
  strPos:    { def: 0.12, min: 0.02, max: 0.5, fmt: v => Math.round(v * 100) + ' %' },   // where it is plucked: % of the string (50 = the center)
  strStiff:  { def: 0, min: 0, max: 1 },                                    // stiffness: stretched harmonics (piano, bell)
  fm4R1: { def: 1, min: 0.25, max: 12 }, fm4L1: { def: 1,   min: 0, max: 1 }, fm4D1: { def: 4,    min: 0.005, max: 4, log: true, fmt: decFmt },
  fm4R2: { def: 2, min: 0.25, max: 12 }, fm4L2: { def: 0.4, min: 0, max: 1 }, fm4D2: { def: 0.6,  min: 0.005, max: 4, log: true, fmt: decFmt },
  fm4R3: { def: 1, min: 0.25, max: 12 }, fm4L3: { def: 0.3, min: 0, max: 1 }, fm4D3: { def: 0.3,  min: 0.005, max: 4, log: true, fmt: decFmt },
  fm4R4: { def: 3, min: 0.25, max: 12 }, fm4L4: { def: 0.2, min: 0, max: 1 }, fm4D4: { def: 0.15, min: 0.005, max: 4, log: true, fmt: decFmt },
  // velocity sensitivity of each operator: level × (1 − v + v·velocity); 0 = as always
  fm4V1: { def: 0, min: 0, max: 1, act: true }, fm4V2: { def: 0, min: 0, max: 1, act: true }, fm4V3: { def: 0, min: 0, max: 1, act: true }, fm4V4: { def: 0, min: 0, max: 1, act: true },
  wtSet:    { def: 'analog' },                   // wavetable (oscs in 'wavetable' mode; global A+B)
  wtPos:    { def: 0, min: 0, max: 1 },             // morph: position between the table's frames
  wtUser:   { def: '' },                            // recipe of the 'user' table INSIDE the preset ('' = keep the drawn one)

  // --- Modulation ---
  pulseWidth: { def: 0.5, min: 0.02, max: 0.98, step: 0.01, fmt: v => (v * 100).toFixed(0) + '%' },
  // LFOs: Speed in log from 0.005 Hz (one cycle every 200 s: the scale of the
  // landscape, not of vibrato) — Roadmap 5.0 · block 1 «time ×10»
  pwmLfoLvl:  { def: 0, min: 0, max: 0.45, act: true },
  pwmLfoSpd:  { def: 3, min: 0.005, max: 20, log: true, fmt: hzFmt },
  pwmLfoShape:{ def: 'sine' },
  amplitude:  { def: 0.8, min: 0, max: 1, step: 0.01, fmt: twoDec },
  ampLfoLvl:  { def: 0, min: 0, max: 0.6, act: true },
  ampLfoSpd:  { def: 5, min: 0.005, max: 20, log: true, fmt: hzFmt },
  ampLfoShape:{ def: 'sine' },
  freqCents:  { def: 0, min: -1200, max: 1200, step: 1, fmt: v => v.toFixed(0) + ' ct' },
  freqLfoLvl: { def: 0, min: 0, max: 200, unit: ' ct', act: true },
  freqLfoSpd: { def: 5, min: 0.005, max: 20, log: true, fmt: hzFmt },
  freqLfoShape:{ def: 'sine' },
  lfoFade:    { def: 0, min: 0, max: 20, log: true, lmin: 0.05, fmt: secFmt, act: true },   // vibrato/PWM ramp in after each noteOn (0 = immediate)

  // --- Filter (per voice) ---
  cutoff:    { def: 20000, min: 20, max: 20000, log: true,   // Reset: open (with Reso −3 dB, flat within ±0.02 dB up to 12 kHz)
               fmt: v => v >= 1000 ? (v / 1000).toFixed(2) + ' kHz' : v.toFixed(0) + ' Hz' },
  cutLfoLvl: { def: 0, min: 0, max: 5000, unit: ' Hz', act: true },
  cutLfoSpd: { def: 2, min: 0.005, max: 20, log: true, fmt: hzFmt },
  cutLfoShape:{ def: 'sine' },
  // Q in dB (as WebAudio's lowpass/highpass take it): −3 dB = linear Q 0.707, the FLAT Butterworth (no peak); 0 dB already shows ~1.25 dB at the cutoff
  reso:      { def: -3, min: -3, max: 24, step: 0.1, fmt: v => v.toFixed(1) },
  resLfoLvl: { def: 0, min: 0, max: 15, act: true },
  resLfoSpd: { def: 2, min: 0.005, max: 20, log: true, fmt: hzFmt },
  resLfoShape:{ def: 'sine' },
  morph:        { def: 0, min: 0, max: 1 },
  filterEnvAmt: { def: 0, min: -6000, max: 6000, unit: ' Hz', act: true },
  keytrack:     { def: 0, min: 0, max: 1, act: true },  // the cutoff follows the note's pitch (1 = 1:1)
  filterSlope:  { def: '12' },                    // '12' | '24' dB/oct (2nd stage in cascade; per note)
  filterType:   { def: 'morph' },                 // 'morph' (LP↔HP parallel) | 'bp' (LP and HP in series) | 'notch' (LP + HP at 1); structure: per note
  filterDrive:  { def: 0, min: 0, max: 1, act: true },  // PRE-filter saturation per voice (0 = transparent)
  // Drive character (Roadmap 7.0 · 3.1): 'soft' = tanh (the usual one) · 'fold' = sine
  // fold (West Coast: as Drive rises the wave folds over and the brightness rises and falls). Asym =
  // bias at the curve's input, y = f(g·x + b) − f(b): EVEN harmonics (tube, «twisted»
  // kick); in fold it is the wavefolder's symmetry (at full, only evens: the octave).
  driveChar:    { def: 'soft' },
  driveAsym:    { def: 0, min: 0, max: 1, act: true },
  fenvMode: { def: 'link' },                        // 'link' = the filter env uses the amplitude ADSR
  fa: { def: 0.01, min: 0.001, max: 20, log: true, fmt: secFmt },   // times ×10, in log (1 ms and 20 s on the same knob)
  fd: { def: 0.2,  min: 0.001, max: 20, log: true, fmt: secFmt },
  fs: { def: 0.7,  min: 0, max: 1 },
  fr: { def: 0.3,  min: 0.001, max: 30, log: true, fmt: secFmt },
  // Mod Env (Roadmap 7.0 · 2.1): a FREE envelope, only for the matrix (source «Mod env», 0..1,
  // no velocity), on the Sequencing screen. Mode: 'normal' (ADSR) · 'loop' (A + D repeated
  // while the note lasts: an envelope-shaped LFO that starts with the note; sustain does not
  // count) · 'trigger' (ignores the note-off: A → D → R in full even if the note lasts 20 ms).
  envmMode: { def: 'normal' },
  envmA: { def: 0.01, min: 0.001, max: 20, log: true, fmt: secFmt },
  envmD: { def: 0.3,  min: 0.001, max: 20, log: true, fmt: secFmt },
  envmS: { def: 0.5,  min: 0, max: 1 },
  envmR: { def: 0.3,  min: 0.001, max: 30, log: true, fmt: secFmt },
  envmCurve: { def: 0, min: 0, max: 1 },             // like the Amp Env one: 0 = linear ramps, 1 = RC

  // --- Vocal (per-voice formant bank, between the drive and the filter) ---
  vocAmt:   { def: 0, min: 0, max: 1, act: true },  // dry/wet of the vocal tract (0 = no bank)
  vocVowel: { def: 0.5, min: 0, max: 1, fmt: vowelFmt },   // path u→o→a→e→i (0.5 = /a/)
  vocSize:  { def: 0, min: -1200, max: 1200, unit: ' ct' },// tract size: + child · − giant
  vocQ:     { def: 0.5, min: 0, max: 1 },           // definition: 0 = robot (narrow bands) · 1 = soft
  vocLife:  { def: 0, min: 0, max: 1, act: true },  // formant micro-drift (humanizes)
  vocBright:{ def: 0.5, min: 0, max: 1 },           // singer's formant (F4-F5): 0 = none · 0.5 = as in the table · 1 = +12 dB
  vocAtk:   { def: 0, min: 0, max: 1, act: true },  // consonant bite: a noise burst through the tract when the note starts

  // --- Resonator (Roadmap 5.0 · block 5): per-voice modal bank tuned to the note, after the Vocal; engine/reson.js ---
  resAmt:    { def: 0, min: 0, max: 1, act: true },  // dry/wet of the bank (0 = no bank)
  resMat:    { def: 0.5, min: 0, max: 1 },           // material: 0 = string/tube (harmonics 1, 2, 3…) … 1 = bar/bowl (1, 2.76, 5.40…)
  resDecay:  { def: 0.5, min: 0, max: 1 },           // Q in log 10 → 600: how long each mode takes to ring up and to die out (τ = Q/(π·f))
  resBright: { def: 0.5, min: 0, max: 1 },           // balance between low and high modes (0 dark · 0.77 flat · 1 bright), at constant level

  // --- FX ---
  dist:    { def: 0, min: 0, max: 1, act: true },
  flAmt:   { def: 0, min: 0, max: 1, act: true },
  flSpd:   { def: 0.3, min: 0.05, max: 8, unit: ' Hz' },
  chAmt:   { def: 0, min: 0, max: 1, act: true },   // chorus/ensemble (wet mix)
  chSpd:   { def: 0.6, min: 0.05, max: 8, unit: ' Hz' },
  chMode:  { def: 'chorus' },                       // 'chorus' | 'ensemble' (triple chorus, 3 phases)
  dlyAmt:  { def: 0, min: 0, max: 0.9, act: true },   // how much goes into the echo (send)
  // Feedback (Roadmap 7.0 · 4.1): it used to be 0.85·Amount capped at 0.8; now it has its own knob, up to 1.1.
  // Above 1 each repeat comes back louder and the echo runs away (held in check by the loop's
  // saturation: Room). A preset without dlyFb predates it and gets it computed (state.migrateFb).
  dlyFb:   { def: 0.4, min: 0, max: 1.1, fmt: v => Math.round(v * 100) + ' %' },
  dlySat:  { def: 0, min: 0, max: 1, act: true },      // tape saturation INSIDE the echo loop (a Room key)
  dlyTime: { def: 0.3, min: 0.02, max: 4, log: true, fmt: secFmt },   // up to 4 s (echoes on the horizon); Room.DLY_MAX goes along
  dlySync: { def: 'free' },                        // 'free' | 1/8 | 1/8. | 1/4 | 1/4. | 1/2 (uses bpm)
  dlyDamp: { def: 0, min: 0, max: 1, act: true },   // filter IN THE LOOP: each repeat loses highs (and some lows), like tape/BBD
  dlyWow:  { def: 0, min: 0, max: 1, act: true },   // slow modulation of the time: each repeat detunes a hair (tape wow)
  bpm:     { def: 120, min: 40, max: 220, unit: ' bpm' },
  // Swing (Roadmap 7.0 · 5.4): a Room key, like the BPM; the common clock applies it to everything in tempo
  swing:   { def: 0.5, min: 0.5, max: 0.75, fmt: v => Math.round(v * 100) + ' %' },
  seqNotes:{ def: 'semitones' },   // Seq: the numbers are semitones, or degrees of a scale ('harmony' = the scene's) (5.2)

  // --- Stereo ---
  width:      { def: 0, min: 0, max: 1, act: true },
  panLfoLvl:  { def: 0, min: 0, max: 1, act: true },    // per-voice autopan
  panLfoSpd:  { def: 0.4, min: 0.005, max: 8, log: true, fmt: hzFmt },
  reverbMix:  { def: 0, min: 0, max: 0.6, act: true },
  reverbSize: { def: 1.8, min: 0.2, max: 20, log: true, fmt: secFmt },   // up to 20 s: 20 s IR (CPU linear in the IR) or plate (table measured up to 26 s)
  reverbDamp: { def: 0, min: 0, max: 1 },           // the tail's highs die sooner (lives in the IR)
  reverbPre:  { def: 0, min: 0, max: 0.25, unit: ' s', fmt: msFmt },  // predelay: separates the attack from the tail (up to 250 ms: the room «far away»)
  reverbType: { def: 'hall' },                      // 'hall' = convolution (noise IR) | 'plate' = algorithmic (Dattorro)
  // Shimmer (Roadmap 5.0 · block 3; ROOM keys): the tail re-enters
  // the reverb pitch-shifted → a choir that rises on every pass
  shimAmt:    { def: 0, min: 0, max: 1, act: true },   // how much comes back (energy per pass = shimAmt·Room.SHIM_LOOP_MAX)
  shimInt:    { def: '+12' },                          // interval: '+12' octave (the classic) | '+7' fifth | '+5' fourth | '-12' octave down
  // Tape on the master (Roadmap 5.0 · block 7; ROOM keys): soft saturation
  // and wow/flutter over the whole mix — exact at 0 (the hiss was removed after listening: it added nothing)
  tapeSat:    { def: 0, min: 0, max: 1, act: true },   // tanh with input up to ×2 (the knob enters squared) + high loss (log 20 → 8 kHz)
  tapeWow:    { def: 0, min: 0, max: 1, act: true },   // irregular pitch drift (≈ ±40 ct at full: damaged tape; ±12 at 0.3) + flutter at 6.5 Hz (≈ ±6 ct)

  // --- Envelope / voice / master ---
  // Times ×10 (Roadmap 5.0 · block 1): up to 20 s of attack and 30 s of release.
  // In LOG: a linear 0..20 s slider would put the millisecond at 0.005 % of the
  // travel; in log, 1 ms and 20 s fit on the same bar with even resolution.
  // The attack keeps EXACT 0 at position 0 (lmin): the hit is the step.
  // Reset = GATE: sustain 1 and attack/release of 2/20 ms (just enough against the click)
  a: { def: 0.002, min: 0, max: 20, log: true, lmin: 0.001, fmt: secFmt },   // 0 = step (percussion: the hit is the step)
  d: { def: 0.2,  min: 0.001, max: 20, log: true, fmt: secFmt },
  s: { def: 1,    min: 0, max: 1, step: 0.01, fmt: twoDec },
  r: { def: 0.02, min: 0.001, max: 30, log: true, fmt: secFmt },
  envCurve: { def: 0, min: 0, max: 1, act: true },   // 0 = linear ramps (as always) · 1 = RC segments (analog): exponential attack and decay
  // Flam (808 clap): hits−1 short bursts spaced hitGap BEFORE the ADSR (Voice._flam); 1 = no flam (the usual path)
  hits:   { def: 1, min: 1, max: 4, step: 1, fmt: v => Math.round(v) + (Math.round(v) > 1 ? ' hits' : ' hit') },
  hitGap: { def: 0.012, min: 0.005, max: 0.04, unit: ' s', fmt: v => (v * 1000).toFixed(0) + ' ms' },
  glide:  { def: 0, min: 0, max: 10, log: true, lmin: 0.01, fmt: secFmt, act: true },   // up to 10 s: drones that slide
  pitchEnvAmt: { def: 0, min: -2400, max: 2400, unit: ' ct', act: true },   // per-note pitch envelope
  pitchEnvDec: { def: 0.08, min: 0.005, max: 10, log: true, fmt: secFmt },  // up to 10 s: risers and slow drops
  mode:   { def: 'poly' },
  monoTrig: { def: 'legato' },                      // Mono trigger, when notes OVERLAP: legato (glides without retriggering) | retrig (every note retriggers)
  arpMode: { def: 'off' },                          // off | up | down | updown | random
  arpDiv:  { def: '1/16' },                         // musical division of the step (uses bpm)
  arpOct:  { def: '1' },                            // octaves of the pattern (1..3, button seg)
  arpGate: { def: 0.5, min: 0.05, max: 1 },         // length of each step (fraction)
  seqOn:     { def: 'off' },                        // off | on — step sequencer
  seqPat:    { def: '0 3 7 12 . 7 3 .' },           // phrase in semitones, '.'=rest (max 16 steps)
  seqDiv:    { def: '1/16' },                       // musical division of the step (uses bpm)
  seqGate:   { def: 0.6, min: 0.05, max: 1 },       // length of each step (fraction)
  seqLatch:  { def: 'off' },                        // on: the phrase keeps going after the key is released
  seqRetrig: { def: 'off' },                        // on: a new key restarts the phrase (on the grid)
  wsOn:   { def: 'off' },                           // off | on — wave sequence (wave sequencing)
  wsPat:  { def: '0 . 7 . 3 5 7 .' },               // phrase of FRAMES 0..7, '.' = hold (max 16 steps)
  // Steps (Roadmap 7.0 · 2.3, engine/Steps.js): 4 lanes of values −1..+1 (up to 32), each
  // with division, smoothing (0 = step with a 4 ms micro-ramp … 1 = ramp over the whole step),
  // rotation and rotation drift (one more step every N bars). They only act if the matrix
  // uses «Steps i» or «Steps i · note»: the starting patterns do nothing on their own and
  // come with different lengths (16 · 12 · 5 · 8) so the polymeter is heard on the first try.
  st1Pat: { def: '1 0 0.5 0 -0.5 0 0.5 0 1 0 0.5 0 -0.5 0 -1 0' },
  st2Pat: { def: '1 0.5 0 -0.5 -1 -0.5 0 0.5 1 0.5 0 -0.5' },
  st3Pat: { def: '1 -1 0.5 -0.5 0' },
  st4Pat: { def: '1 0 0 1 0 0 1 0' },
  stReset: { def: 'play' },                          // 'play' | 'never' | '1 bar' | '2 bars' | '4 bars' | '8 bars'
  wsDiv:  { def: '1/16' },                          // musical division of the step (uses bpm)
  wsMode: { def: 'loop' },                          // loop | 1shot (a single pass: a timbre envelope)
  wsXf:   { def: 0.25, min: 0, max: 1, fmt: v => (v * 100).toFixed(0) + '%' },  // crossfade: fraction of the step (1 = glissando)
  // Master: IN FRONT of the limiter (1.1.0) and up to ×4 (+12 dB): single-note presets (basses, leads)
  // need to make up what the master's headroom takes away for chords. Log: 0.7 lands where it always did (71 %).
  master: { def: 0.7, min: 0, max: 4, log: true, lmin: 0.01, fmt: dbFmt },
};

/* --- Modulation matrix: MX_SLOTS rows source → destination × amount. ---
   FLAT keys (mx1src…mx6amt) generated right here: that way v2 presets,
   snapshot, Reset and MIDI learn work without any special case.
   The amount is in ±1 and each destination scales it by MX_SPAN (engine space).
   The cutoff is modulated through the filter's DETUNE (cents ⇒ exponential, symmetric
   octaves): mathematically unable to cross 0 Hz — the lesson of the
   cutLFO (presets that went silent) guaranteed by construction. */
export const STR_KEYS = ['strBright', 'strDecay', 'strPos', 'strStiff'];   // the worklet's params have the same names
export const FM4_KEYS = ['fm4Alg', 'fm4R1', 'fm4L1', 'fm4D1', 'fm4R2', 'fm4L2', 'fm4D2', 'fm4R3', 'fm4L3', 'fm4D3', 'fm4R4', 'fm4L4', 'fm4D4'];

export const MX_SLOTS = 6;
export const MX_SOURCES = [                 // signals: RAW LFOs (±1, their Level knob plays no part) and filter env (0..1·vel)
  { id: 'off',     label: '—' },            // per-note values ("CV"): velocity, note pitch, random S&H
  { id: 'lfoCut',  label: 'LFO cutoff' },
  { id: 'lfoRes',  label: 'LFO reso' },
  { id: 'lfoAmp',  label: 'LFO tremolo' },
  { id: 'lfoFreq', label: 'LFO vibrato' },
  { id: 'lfoPwm',  label: 'LFO PWM' },
  { id: 'env',     label: 'Filter env' },
  { id: 'envm',    label: 'Mod env' },        // the free envelope (Sequencing): normal, loop or trigger
  // Steps (Sequencing): continuous (each step moves a held note) or «· note» (the value of the step where the note starts)
  { id: 'st1',     label: 'Steps 1' },
  { id: 'st2',     label: 'Steps 2' },
  { id: 'st3',     label: 'Steps 3' },
  { id: 'st4',     label: 'Steps 4' },
  { id: 'st1n',    label: 'Steps 1 · note' },
  { id: 'st2n',    label: 'Steps 2 · note' },
  { id: 'st3n',    label: 'Steps 3 · note' },
  { id: 'st4n',    label: 'Steps 4 · note' },
  { id: 'vel',     label: 'Velocity' },
  { id: 'acc',     label: 'Accent (Seq)' },   // 1 on sequencer steps with «!», 0 on the rest (Roadmap 7.0 · 5.1)
  { id: 'note',    label: 'Note (pitch)' },
  { id: 'rnd',     label: 'S&H per note' },
  { id: 'drift',   label: 'Drift (voice)' },  // each voice's OWN slow walk (nodes.mkVoiceLFO 'drift' at mxDriftSpd): the chord breathes voice by voice
  // PERFORMANCE sources (Roadmap 5.0 · block 4), 0..1 per engine (AudioEngine.perf):
  // the pad is PLAYED during the note. 0 = rest, so a preset sounds the same without touching them.
  { id: 'wheel',   label: 'Wheel (CC1)' },   // modulation wheel: the on-screen one (below the keyboard) or CC1
  { id: 'at',      label: 'Aftertouch' },    // MIDI keyboard pressure (channel; polyphonic is treated the same)
  { id: 'expr',    label: 'Expression (CC11)' },  // expression pedal
  // Macros (Roadmap 7.0 · 2.5): two 0..1 knobs at the foot of the matrix that ARE saved in the
  // preset. Several slots with the same macro = a single control that opens the filter, raises the
  // drive and the resonance at once, each destination with its slot's amount.
  { id: 'mac1',    label: 'Macro 1' },
  { id: 'mac2',    label: 'Macro 2' },
];
export const MX_DESTS = [
  { id: 'pitch',  label: 'Pitch' },         // cents on the detune of both oscillators
  { id: 'pw',     label: 'Pulse width' },   // the worklet's AudioParam clips to [0.01, 0.99]
  { id: 'cutoff', label: 'Cutoff' },        // octaves (filter detune, ±4 oct)
  { id: 'reso',   label: 'Resonance' },    // dB on the Q of the final stage
  { id: 'amp',    label: 'Amplitude' },      // per-voice gain AFTER the VCA (1 ± mod)
  { id: 'pan',    label: 'Pan' },
  { id: 'wt',     label: 'Wavetable' },     // wavetable morph (the AudioParam clips to [0,1])
  { id: 'vow',    label: 'Vowel' },         // sweeps the vowels at audio rate (the WaveShapers saturate at u/i)
  { id: 'fm',     label: 'FM index' },     // modulation index (the AudioParam clips at 0): env→fm = DX pluck, vel→fm = DX touch
  // Roadmap 7.0 · 2.4: the mixer levels (vector morph: an LFO that lowers A and raises B),
  // the Drive's input gain (fold sweeps), the pitch of A alone (sync sweep)
  // and the resonator's Material. A level going below 0 inverts the phase (AM through zero): it sounds,
  // and with sensible bases (0.5 ± 0.5) it does not happen — clipping it would cost a WaveShaper per voice.
  { id: 'lvlA',   label: 'Level A' },       // mixer gain (linear: 1 = 0 dB)
  { id: 'lvlB',   label: 'Level B' },
  { id: 'lvlRing',label: 'Level Ring' },
  { id: 'lvlNoise', label: 'Level Noise' },
  { id: 'drive',  label: 'Drive' },         // input gain of the curve (±1 = the knob's whole travel); needs Drive > 0
  { id: 'pitchA', label: 'Pitch A' },       // cents on oscillator A only
  { id: 'resMat', label: 'Material' },      // resonator: ±1 = from string to bar (each mode, its own cents)
];
export const MX_SPAN = { pitch: 1200, pw: 0.45, cutoff: 4800, reso: 12, amp: 1, pan: 1, wt: 1, vow: 1, fm: 8,
  lvlA: 1, lvlB: 1, lvlRing: 1, lvlNoise: 1, drive: 1, pitchA: 1200, resMat: 1 };   // drive and resMat: the voice scales them (per character / per mode)
for (let i = 1; i <= MX_SLOTS; i++) {
  PARAMS['mx' + i + 'src'] = { def: 'off' };
  PARAMS['mx' + i + 'dst'] = { def: 'cutoff' };
  PARAMS['mx' + i + 'amt'] = { def: 0, min: -1, max: 1, act: true };
}
// PER-VOICE modulation (Roadmap 5.0 · block 2): speed of the «Drift
// (voice)» source (0.05 Hz = one sway every 20 s) and phase of the cutoff/reso/
// vibrato/PWM/pan LFOs: 'global' = one LFO per engine (as always; the chord breathes
// as a block) · 'voice' = each voice starts its own at a different phase ·
// 'retrig' = each note starts them at their phase 0 (the LFO tied to the note) ·
// 'once' = once: they run one cycle from the note and stay at its end
// (another envelope; S&H and drift have no end: they behave as in retrig).
// Structure: applies per note, like filterSlope. The tremolo is always global.
PARAMS.mxDriftSpd = { def: 0.05, min: 0.005, max: 5, log: true, fmt: hzFmt };
// Macros: matrix sources 'mac1' / 'mac2' (AudioEngine.perf); at 0 they move nothing
PARAMS.macro1 = { def: 0, min: 0, max: 1, act: true };
PARAMS.macro2 = { def: 0, min: 0, max: 1, act: true };
// Pitch bend range in semitones (Roadmap 7.0 · 2.6), stored in the preset: ±2 the norm,
// ±12 for basses and effects. The bend arrives normalized (−1..1) and the engine scales it.
export const BEND_RANGES = ['1', '2', '3', '5', '7', '12', '24'];
PARAMS.bendRange = { def: '2' };
PARAMS.lfoPhase = { def: 'global' };

// Tempo-synced LFO (Roadmap 7.0 · 2.2): each LFO with its own sync — 'free' (Speed in Hz)
// or a division: beats per cycle ('1 bar' = a bar of 4; «.» = dotted,
// ×1.5; «T» = triplet, ×2/3). With sync the cycle falls on the grid of the
// common clock (engine/Clock.js) and Speed is not used.
export const LFO_DIVS = { '4 bars': 16, '2 bars': 8, '1 bar': 4, '1/2.': 3, '1/2': 2, '1/2T': 4 / 3, '1/4.': 1.5, '1/4': 1, '1/4T': 2 / 3,
  '1/8.': 0.75, '1/8': 0.5, '1/8T': 1 / 3, '1/16.': 0.375, '1/16': 0.25, '1/16T': 1 / 6, '1/32': 0.125 };
for (let i = 1; i <= 4; i++) {                    // Steps: each lane's settings (the patterns, above)
  PARAMS['st' + i + 'Div'] = { def: '1/16' };
  PARAMS['st' + i + 'Smooth'] = { def: 0, min: 0, max: 1, act: true };
  PARAMS['st' + i + 'Rot'] = { def: 0, min: 0, max: 31, step: 1, fmt: v => Math.round(v) + '' };
  PARAMS['st' + i + 'Drift'] = { def: 'off' };
}
export const LFO_KEYS = ['pwm', 'cut', 'res', 'amp', 'freq', 'pan'];
for (const k of LFO_KEYS) PARAMS[k + 'LfoSync'] = { def: 'free' };
// Effective speed of LFO k (Hz): the division at the BPM, or the Speed knob
export const lfoHz = (S, k, bpm) => { const b = LFO_DIVS[S[k + 'LfoSync']]; return b ? bpm / 60 / b : S[k + 'LfoSpd']; };
export const lfoBeats = (S, k) => LFO_DIVS[S[k + 'LfoSync']] || 0;   // 0 = free

/* --- Preset base ---
   The `def` values above are NEUTRAL: Reset (and startup) leave oscillator A
   alone, undetuned, with the filter open and flat and the envelope as a
   gate; no module touches the signal. But presets are saved as
   DIFFERENCES (factory, repo banks, demos, hand-written scenes: only what
   deviates), and they were written on top of the old defaults (until Oct 2026):
   B at +7 ct mixed at 0.4 (today levels A 0.6 · B 0.4), LP at 6 kHz with 2 dB,
   ADSR 10 ms / 0.7 / 300 ms.
   A NON-empty preset is applied on top of this base (state.withPresetBase) and sounds
   exactly as before; the ones saved with Save carry all the
   keys (snapshot), so the base changes nothing for them. {} is still Reset.
   A NEW hand-written preset also starts from here (or sets the keys).
   CAREFUL: one with Ring > 0 and without levelA/levelB is read as being from BEFORE the
   mixer (state.migrateMix): presets with Ring carry their levels. */
export const PRESET_BASE = { detuneB: 7, levelA: 0.6, levelB: 0.4, cutoff: 6000, reso: 2, a: 0.01, s: 0.7, r: 0.3 };

// Slider position (0..1 if log) <-> engine value. For params without `log`
// the position IS the value (the <input> carries the real min/max/step).
// Log with min = 0 (`lmin`): position 0 is EXACTLY 0 (attack = step, glide
// off) and the rest of the travel goes in log from lmin to max. A value
// between 0 and lmin falls at position 0 (no presets there: lmin is the old slider step).
const logLo = p => p.min > 0 ? p.min : p.lmin;
export const posToVal = (p, x) => !p.log ? x : (x <= 0 ? p.min : logLo(p) * Math.pow(p.max / logLo(p), x));
export const valToPos = (p, v) => !p.log ? v : (v <= p.min ? 0 : Math.max(0, Math.log(v / logLo(p)) / Math.log(p.max / logLo(p))));
