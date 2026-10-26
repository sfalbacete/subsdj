/* =====================================================================
   SubSDJ · preset mega-bank, organized by type of sound.
   FORMAT v2: values in ENGINE SPACE (cutoff in Hz, times in s…),
   the keys are the canonical PARAMS names. Each preset declares
   only what deviates from the PRESET BASE (params.PRESET_BASE: the
   old defaults, not Reset's neutral ones); names are UNIQUE across
   the whole bank (the lookup is by name).
   v1 user presets (cutoff = slider position 0..1) are
   migrated automatically to v2 the first time (v1 stays as a copy).
   cutLFO RULE: the cutoff LFO ADDS Hz to the base value (Voice.js), so
   cutoff − cutLfoLvl must stay ≥ ~150 Hz; if the sum crosses 0 the
   lowpass gets stuck at 0 Hz and the preset goes silent every half cycle.
   ===================================================================== */
import { PARAMS, posToVal } from './params.js';

export const FACTORY = {
  'Basics': {
    'Init (default)': {},
  },

  'Bass': {
    /* RC curve: the same pluck bass with exponential attack and decay — compare it
       with «Pluck Bass» (linear): the hit arrives sooner and the body settles without a step */
    'RC Bass (curve)': { waveA: 'sawtooth', waveB: 'square', levelA: 0.65, levelB: 0.35, cutoff: 448, reso: 6,
      filterEnvAmt: 2600, envCurve: 0.85, a: 0.004, d: 0.35, s: 0.15, r: 0.15, master: 3.11 },
    'Round Sub': { waveA: 'sine', waveB: 'triangle', levelA: 0.65, levelB: 0.35, cutoff: 448, reso: 1,
      a: 0.005, d: 0.2, s: 0.6, r: 0.15, master: 1.79 },
    'Fat Bass': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -8, detuneB: 12, levelA: 0.5, levelB: 0.5,
      cutoff: 514, reso: 5, filterEnvAmt: 1500, dist: 0.15, a: 0.005, d: 0.25, s: 0.35, r: 0.18, master: 1.98 },
    'Reese': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -22, detuneB: 22, levelA: 0.5, levelB: 0.5,
      cutoff: 364, reso: 3, dist: 0.1, a: 0.005, d: 0.3, s: 0.85, r: 0.2, width: 0.3, master: 2.03 },
    'Pluck Bass': { waveA: 'sawtooth', waveB: 'square', levelA: 0.65, levelB: 0.35, cutoff: 448, reso: 6,
      filterEnvAmt: 2600, a: 0.002, d: 0.2, s: 0.0, r: 0.13, master: 2.36 },
    'Acid 303': { mode: 'mono', waveA: 'sawtooth', waveB: 'sawtooth', levelA: 0.85, levelB: 0.15, cutoff: 317, reso: 20,
      filterEnvAmt: 2800, glide: 0.06, dist: 0.35, a: 0.003, d: 0.2, s: 0.2, r: 0.1, master: 1.95 },
    'Slide Bass': { mode: 'mono', waveA: 'sawtooth', waveB: 'sawtooth', detuneB: 6, levelA: 0.9, levelB: 0.1,
      cutoff: 448, reso: 6, filterEnvAmt: 2000, glide: 0.12, a: 0.005, d: 0.2, s: 0.5, r: 0.2, master: 1.61 },
    'Dub Wobble': { waveA: 'sawtooth', waveB: 'square', levelA: 0.6, levelB: 0.4, cutoff: 900, reso: 12,
      cutLfoLvl: 750, cutLfoSpd: 5, dist: 0.3, a: 0.005, d: 0.3, s: 0.8, r: 0.2, master: 1.5 },
    'Creamy Bass (24 dB)': { waveA: 'sawtooth', waveB: 'sawtooth', detuneB: 10, levelA: 0.55, levelB: 0.45,
      cutoff: 420, reso: 3, filterSlope: '24', filterDrive: 0.5, filterEnvAmt: 1200,
      a: 0.005, d: 0.25, s: 0.5, r: 0.2, master: 2.99 },
    /* matrix: note→PW — wide pulse (fat) at the bottom, narrow (nasal) at the top:
       the timbre changes across the keyboard, not just the brightness */
    'Chameleon Bass (note→PW)': { waveA: 'square', waveB: 'square', pulseWidth: 0.35, levelA: 0.65, levelB: 0.35,
      cutoff: 900, reso: 3, keytrack: 0.3, filterEnvAmt: 1500,
      mx1src: 'note', mx1dst: 'pw', mx1amt: -0.35,
      a: 0.004, d: 0.22, s: 0.3, r: 0.15, master: 1.39 },
  },

  'Leads': {
    /* S&H LFO: the filter jumps to a random value on every LFO step (6 Hz) —
       techno's rhythmic «random»; the eighth-note echo locks onto the steps */
    'S&H Lead (random filter)': { waveA: 'sawtooth', waveB: 'square', levelA: 0.7, levelB: 0.3, cutoff: 900, reso: 8,
      cutLfoShape: 'sh', cutLfoLvl: 700, cutLfoSpd: 6, filterEnvAmt: 800, a: 0.005, d: 0.2, s: 0.7, r: 0.15,
      dlyAmt: 0.25, dlySync: '1/8', bpm: 120, master: 1.45 },
    'Bright Lead': { waveA: 'sawtooth', waveB: 'square', detuneB: 10, levelA: 0.55, levelB: 0.45, cutoff: 4080, reso: 3,
      freqLfoLvl: 12, freqLfoSpd: 5.5, dlyAmt: 0.25, dlyTime: 0.28, a: 0.01, d: 0.2, s: 0.8, r: 0.25, width: 0.25, master: 1.26 },
    'Square Lead': { waveA: 'square', waveB: 'square', pulseWidth: 0.35, detuneB: 6, levelA: 0.5, levelB: 0.5,
      cutoff: 2520, reso: 2, a: 0.01, d: 0.15, s: 0.8, r: 0.2, dlyAmt: 0.2, width: 0.25, master: 1 },
    'Supersaw Lead': { waveA: 'supersaw', spread: 0.5, waveB: 'square', levelA: 0.7, levelB: 0.3, cutoff: 4380, reso: 1.5,
      a: 0.01, d: 0.2, s: 0.85, r: 0.25, width: 0.4, reverbMix: 0.2, dlyAmt: 0.2, master: 1.38 },
    'Trance Supersaw': { waveA: 'supersaw', waveB: 'supersaw', spread: 0.7, detuneB: 5, levelA: 0.5, levelB: 0.5,
      cutoff: 5020, reso: 1.5, filterEnvAmt: 1500, a: 0.02, d: 0.35, s: 0.85, r: 0.45,
      dlyAmt: 0.28, dlyTime: 0.4, width: 0.7, reverbMix: 0.28, master: 1.16 },
    'Mono Glide Lead': { mode: 'mono', waveA: 'sawtooth', waveB: 'sawtooth', detuneB: 8, levelA: 0.7, levelB: 0.3,
      cutoff: 1260, reso: 4, filterEnvAmt: 1500, glide: 0.07, a: 0.005, d: 0.2, s: 0.7, r: 0.2, dlyAmt: 0.25, width: 0.3, master: 1.6 },
    'PWM Lead': { waveA: 'square', waveB: 'square', pulseWidth: 0.5, pwmLfoLvl: 0.3, pwmLfoSpd: 1.5,
      detuneB: 5, levelA: 0.5, levelB: 0.5, cutoff: 2890, reso: 2, a: 0.02, d: 0.2, s: 0.8, r: 0.3, width: 0.3, reverbMix: 0.15, master: 1 },
    'Vibrato Flute': { waveA: 'sine', waveB: 'triangle', levelA: 0.6, levelB: 0.4, freqLfoLvl: 18, freqLfoSpd: 5.5,
      cutoff: 2890, a: 0.08, d: 0.1, s: 0.9, r: 0.2, reverbMix: 0.28, width: 0.2, master: 1.35 },
    /* matrix: the SAME LFO does the vibrato (dedicated route) and opens the filter
       (matrix route, raw): wah and pitch in phase, like a guitarist's hand */
    'Vibrato Wah': { waveA: 'sawtooth', waveB: 'square', detuneB: 8, levelA: 0.6, levelB: 0.4,
      freqLfoLvl: 25, freqLfoSpd: 5, lfoFade: 0.5,
      cutoff: 1600, reso: 4, mx1src: 'lfoFreq', mx1dst: 'cutoff', mx1amt: 0.25,
      a: 0.01, d: 0.2, s: 0.8, r: 0.25, dlyAmt: 0.2, width: 0.3, master: 1.33 },
  },

  'Pads': {
    /* A4 · notch: LP + HP in parallel (exact zero at the cutoff) swept by the
       LFO — a single-notch phaser; compare it with Low↔Hi at 50 %, which is
       the same notch at −6 dB */
    /* drift LFO: the cutoff and the tuning wander slowly without repeating (smoothed
       random): the pad breathes instead of oscillating */
    'Breathing Pad (drift)': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -6, detuneB: 8, octavesB: 2, levelA: 0.5, levelB: 0.5,
      cutoff: 1400, reso: 1.5, cutLfoShape: 'drift', cutLfoLvl: 600, cutLfoSpd: 0.3, freqLfoShape: 'drift', freqLfoLvl: 6, freqLfoSpd: 0.4,
      a: 0.7, d: 0.5, s: 0.85, r: 1.8, width: 0.5, chMode: 'ensemble', chAmt: 0.4, chSpd: 0.4, reverbMix: 0.35, master: 1.01 },
    'Phaser Pad (notch)': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -7, detuneB: 9, levelA: 0.5, levelB: 0.5, cutoff: 1100, reso: 4,
      filterType: 'notch', cutLfoLvl: 700, cutLfoSpd: 0.25, a: 0.5, d: 0.5, s: 0.8, r: 1.2, width: 0.45, reverbMix: 0.25, master: 1.01 },
    /* algorithmic plate (Dattorro): growing density and a modulated tank —
       switch it to «Hall (IR)» to hear the difference: the plate's tail breathes */
    'Plate Pad': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -8, detuneB: 10, octavesB: 2, levelA: 0.5, levelB: 0.5,
      cutoff: 1400, reso: 1.5, a: 0.6, d: 0.5, s: 0.85, r: 1.8, width: 0.5,
      reverbType: 'plate', reverbMix: 0.4, reverbSize: 3.2, reverbDamp: 0.35, reverbPre: 0.02, master: 1.03 },
    'Warm Pad': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -10, detuneB: 14, octavesB: 2, levelA: 0.5, levelB: 0.5,
      cutoff: 1180, reso: 2, cutLfoLvl: 800, cutLfoSpd: 0.2, a: 0.8, d: 0.5, s: 0.8, r: 2.0,
      dlyAmt: 0.3, dlyTime: 0.5, width: 0.6, reverbMix: 0.32, reverbSize: 2.6, master: 0.95 },
    'PWM Strings': { waveA: 'square', waveB: 'square', detuneB: 8, octavesB: 2, levelA: 0.5, levelB: 0.5,
      pulseWidth: 0.5, pwmLfoLvl: 0.3, pwmLfoSpd: 0.6, cutoff: 2520, reso: 1, a: 0.3, d: 0.4, s: 0.85, r: 0.6,
      dlyAmt: 0.2, dlyTime: 0.4, width: 0.5, reverbMix: 0.3, master: 0.65 },
    'Supersaw Pad': { waveA: 'supersaw', waveB: 'supersaw', spread: 0.7, detuneB: 6, levelA: 0.5, levelB: 0.5,
      cutoff: 1260, reso: 1.5, a: 0.6, d: 0.5, s: 0.85, r: 1.8, width: 0.7, reverbMix: 0.35, reverbSize: 3, master: 0.96 },
    'Glass Pad': { waveA: 'sine', waveB: 'sine', ring: 0.3, detuneB: 12, octavesB: 2, levelA: 0.35, levelB: 0.35,
      cutoff: 5020, a: 0.5, d: 0.6, s: 0.7, r: 1.5, width: 0.5, reverbMix: 0.4, reverbSize: 3.2, master: 1.41 },
    'Evolving Pad': { waveA: 'sawtooth', waveB: 'triangle', detuneB: 10, levelA: 0.5, levelB: 0.5, cutoff: 1000,
      cutLfoLvl: 800, cutLfoSpd: 0.12, reso: 3, resLfoLvl: 4, resLfoSpd: 0.1, a: 1.0, d: 0.6, s: 0.8, r: 2.5,
      width: 0.6, reverbMix: 0.35, reverbSize: 3.5, master: 0.98 },
    'Choir': { waveA: 'supersaw', spread: 0.4, waveB: 'sine', levelA: 0.6, levelB: 0.4, cutoff: 1450,
      a: 0.7, d: 0.5, s: 0.85, r: 2.0, width: 0.6, reverbMix: 0.4, reverbSize: 3, master: 0.86 },
    'String Ensemble': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -6, detuneB: 9, levelA: 0.5, levelB: 0.5,
      cutoff: 2000, chMode: 'ensemble', chAmt: 0.7, chSpd: 0.5, drift: 3, a: 0.4, d: 0.4, s: 0.85, r: 1.2,
      width: 0.4, reverbMix: 0.25, master: 0.93 },
    'Solina Strings': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -4, detuneB: 5, octavesB: 2, levelA: 0.65, levelB: 0.35,
      cutoff: 3600, reso: 0.7, morph: 0.12, chMode: 'ensemble', chAmt: 0.85, chSpd: 0.65, drift: 4,
      freqLfoLvl: 7, freqLfoSpd: 5.2, lfoFade: 0.7, a: 0.22, d: 0.3, s: 0.9, r: 0.9,
      width: 0.35, reverbMix: 0.22, reverbSize: 2.2, master: 0.9 },
    'PWM Ensemble': { waveA: 'square', waveB: 'square', pulseWidth: 0.45, pwmLfoLvl: 0.28, pwmLfoSpd: 0.7,
      lfoFade: 0.9, detuneB: 6, levelA: 0.5, levelB: 0.5, cutoff: 2800, reso: 1, chMode: 'ensemble', chAmt: 0.75, chSpd: 0.55,
      drift: 3, a: 0.35, d: 0.4, s: 0.85, r: 1.1, width: 0.4, reverbMix: 0.25, master: 0.45 },
    'Butter Pad': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -7, detuneB: 9, levelA: 0.5, levelB: 0.5,
      cutoff: 900, reso: 1.2, filterSlope: '24', filterDrive: 0.35, chMode: 'ensemble', chAmt: 0.6, chSpd: 0.55,
      drift: 3, a: 0.5, d: 0.5, s: 0.85, r: 1.6, width: 0.5, reverbMix: 0.3, reverbSize: 2.6, master: 1.41 },
    'Cathedral Pad': { waveA: 'sawtooth', waveB: 'triangle', detuneA: -6, detuneB: 8, octavesB: 2, levelA: 0.55, levelB: 0.45,
      cutoff: 1600, reso: 1, filterSlope: '24', chMode: 'ensemble', chAmt: 0.5, chSpd: 0.5, drift: 3,
      a: 0.7, d: 0.6, s: 0.85, r: 2.2, width: 0.6,
      reverbMix: 0.42, reverbSize: 3.6, reverbDamp: 0.6, reverbPre: 0.04, master: 1.11 },
    'PWM Unison Pad': { waveA: 'square', waveB: 'square', pulseWidth: 0.45, pwmLfoLvl: 0.25, pwmLfoSpd: 0.6,
      lfoFade: 0.8, uniVoices: '5', uniDetune: 16, detuneB: 6, levelA: 0.5, levelB: 0.5, cutoff: 2400, reso: 1,
      filterSlope: '24', chMode: 'ensemble', chAmt: 0.55, chSpd: 0.55, drift: 2,
      a: 0.4, d: 0.4, s: 0.85, r: 1.3, width: 0.5,
      reverbMix: 0.28, reverbDamp: 0.5, reverbPre: 0.03, master: 0.35 },
    'Air Pad': { waveA: 'sawtooth', waveB: 'triangle', detuneA: -5, detuneB: 7, levelA: 0.6, levelB: 0.4,
      noise: 0.22, noiseColor: 0.85, cutoff: 2200, reso: 0.8, filterSlope: '24',
      chMode: 'ensemble', chAmt: 0.5, chSpd: 0.5, drift: 3, freqLfoLvl: 6, freqLfoSpd: 5, lfoFade: 0.6,
      a: 0.6, d: 0.5, s: 0.85, r: 1.8, width: 0.5,
      reverbMix: 0.32, reverbSize: 3, reverbDamp: 0.55, reverbPre: 0.03, master: 0.98 },
    /* matrix: S&H→pitch (each note is born ±18 ct off, analog poly), env→cutoff
       in octaves (exponential), and the RAW tremolo LFO panning slowly */
    'Matrix Pad': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -4, detuneB: 6, levelA: 0.5, levelB: 0.5,
      cutoff: 1400, reso: 1.5, a: 0.5, d: 0.5, s: 0.85, r: 1.6,
      mx1src: 'rnd', mx1dst: 'pitch', mx1amt: 0.015,
      mx2src: 'env', mx2dst: 'cutoff', mx2amt: 0.3,
      mx3src: 'lfoAmp', mx3dst: 'pan', mx3amt: 0.6, ampLfoSpd: 0.3,
      width: 0.5, reverbMix: 0.3, reverbSize: 2.6, master: 0.95 },
    /* 'formant' table + matrix env→wt: each note sweeps through vowels (the morph
       rides the envelope) — wavetable synthesis with the matrix closing the circle */
    'Vowel Choir (wavetable)': { waveA: 'wavetable', waveB: 'wavetable', detuneA: -5, detuneB: 7, levelA: 0.5, levelB: 0.5,
      wtSet: 'formant', wtPos: 0.2, mx1src: 'env', mx1dst: 'wt', mx1amt: 0.5,
      cutoff: 4000, a: 0.8, d: 0.6, s: 0.8, r: 2.0, chMode: 'ensemble', chAmt: 0.5, chSpd: 0.5,
      width: 0.6, reverbMix: 0.35, reverbSize: 3, master: 1.38 },
    /* looping wave sequence: a HELD chord = a timbral groove at the BPM
       (the '.' lengthen steps: uneven rhythm); each voice offsets its phrase */
    'Wavestation Texture (ws)': { waveA: 'wavetable', waveB: 'wavetable', detuneA: -5, detuneB: 7, levelA: 0.5, levelB: 0.5,
      wtSet: 'metallic', wtPos: 0,
      wsOn: 'on', wsPat: '0 . 7 . 3 5 7 2', wsDiv: '1/16', wsXf: 0.3,
      cutoff: 5000, reso: 1, a: 0.15, d: 0.4, s: 0.85, r: 1.5,
      dlySync: '1/8', dlyAmt: 0.25, width: 0.5, reverbMix: 0.3, reverbSize: 2.6, master: 1.16 },
    /* matrix: ONE single slow LFO (raw cutLFO at 0.08 Hz, its Level at 0) mov-
       ing THREE destinations at once — filter, pan and ±14 ct: correlated drift */
    'Organic Drift': { waveA: 'sawtooth', waveB: 'triangle', detuneA: -5, detuneB: 7, levelA: 0.55, levelB: 0.45,
      cutoff: 1300, reso: 1.5, cutLfoSpd: 0.08,
      mx1src: 'lfoCut', mx1dst: 'cutoff', mx1amt: 0.35,
      mx2src: 'lfoCut', mx2dst: 'pan', mx2amt: 0.6,
      mx3src: 'lfoCut', mx3dst: 'pitch', mx3amt: 0.012,
      a: 0.8, d: 0.5, s: 0.85, r: 2.0, width: 0.4, reverbMix: 0.3, reverbSize: 3, master: 0.96 },
  },

  /* Vocal module (per-voice formant bank): three corners of the
     robot ↔ human space — narrow Q and pinned formants = machine; natural Q +
     Life (micro-drift) + drift + vibrato with fade + breath = choir */
  /* Roadmap 5.0 «cinescape»: sounds at the scale of the landscape — times ×10
     (10 s attacks, 20-30 s releases, LFOs of minutes, 20 s reverbs) and
     octave per oscillator (−1 = sub-oscillator, −2 = basement). The category grows
     with each block of the roadmap. */
  'Cinescape': {
    /* block 1: 12 s attack, 25 s release, its own filter env even slower
       (8 s) and cutoff drift at 0.02 Hz (one turn every 50 s); B an
       octave down anchors the low end. Hold a chord and wait: it comes in from nothing */
    'Glacial Pad (12 s attack)': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -7, detuneB: 9, octB: -1, levelA: 0.55, levelB: 0.45,
      uniVoices: '3', uniDetune: 10, drift: 4, cutoff: 700, reso: 1.2, filterSlope: '24',
      fenvMode: 'own', filterEnvAmt: 900, fa: 8, fd: 6, fs: 0.5, fr: 20,
      cutLfoShape: 'drift', cutLfoLvl: 250, cutLfoSpd: 0.02,
      a: 12, d: 4, s: 1, r: 25, envCurve: 0.4, width: 0.6, chMode: 'ensemble', chAmt: 0.35, chSpd: 0.25,
      reverbType: 'plate', reverbMix: 0.5, reverbSize: 14, reverbDamp: 0.4, reverbPre: 0.06, master: 0.84 },
    /* block 1: A two octaves down (C3 → C1, 32 Hz) and B a sine one down; mono with
       a 3 s glide (the new note SLIDES), filter almost closed with slow drift */
    'Basement Drone (−2 octaves)': { waveA: 'sawtooth', octA: -2, waveB: 'sine', octB: -1, levelA: 0.6, levelB: 0.4, drift: 6,
      cutoff: 420, reso: 3, filterSlope: '24', cutLfoShape: 'drift', cutLfoLvl: 200, cutLfoSpd: 0.03,
      mode: 'mono', glide: 3, a: 4, d: 2, s: 1, r: 12, envCurve: 0.3, width: 0, dist: 0.2,
      reverbType: 'plate', reverbMix: 0.35, reverbSize: 9, reverbDamp: 0.6, master: 1.83 },
    /* block 2: Drift (voice) → cutoff and → pan at 0.04 Hz, PER-VOICE vibrato LFO with
       a 4 s fade — four notes, four winds: each one opens, closes and strolls
       across the stereo field at its own pace. Compare it with LFO · global phase: the block breathes */
    'Four Winds Pad (per-voice drift)': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -6, detuneB: 8, octB: -1, levelA: 0.55, levelB: 0.45,
      uniVoices: '2', uniDetune: 8, cutoff: 750, reso: 1.5, filterSlope: '24',
      mx1src: 'drift', mx1dst: 'cutoff', mx1amt: 0.4, mx2src: 'drift', mx2dst: 'pan', mx2amt: 0.8, mxDriftSpd: 0.04,
      lfoPhase: 'voice', freqLfoLvl: 5, freqLfoSpd: 0.15, lfoFade: 4,
      a: 6, d: 3, s: 1, r: 15, envCurve: 0.4, width: 0.3, chMode: 'ensemble', chAmt: 0.3, chSpd: 0.3,
      reverbType: 'plate', reverbMix: 0.45, reverbSize: 12, reverbDamp: 0.4, reverbPre: 0.05, master: 0.76 },
    /* block 3: shimmer — the tail re-enters the plate an octave up on
       every pass and turns into a rising choir (Eno/Lanois). Play a
       low note, release it and hear it rise on its own; ❄ Freeze holds it there */
    'Shimmer Pad (rising choir)': { waveA: 'sawtooth', waveB: 'triangle', detuneA: -5, detuneB: 7, octB: -1, levelA: 0.6, levelB: 0.4,
      cutoff: 1200, reso: 1, filterSlope: '24', drift: 3,
      a: 1.5, d: 2, s: 0.9, r: 6, envCurve: 0.3, width: 0.5, chMode: 'ensemble', chAmt: 0.3, chSpd: 0.3,
      reverbType: 'plate', reverbMix: 0.55, reverbSize: 8, reverbDamp: 0.3, reverbPre: 0.03, shimAmt: 0.7, shimInt: '+12', master: 0.99 },
    /* block 4: performance sources — the wheel (below the keyboard or CC1) opens the
       filter two octaves, the MIDI keyboard's pressure adds resonance and the expression
       pedal (CC11) turns it down when pressed: the pad is PLAYED during the note. At
       rest (all at 0) it is a dark, still pad */
    'Performance Pad (wheel, aftertouch, pedal)': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -6, detuneB: 8, octB: -1, levelA: 0.55, levelB: 0.45,
      cutoff: 450, reso: 1.5, filterSlope: '24', lfoPhase: 'voice',
      mx1src: 'wheel', mx1dst: 'cutoff', mx1amt: 0.5, mx2src: 'at', mx2dst: 'reso', mx2amt: 0.6, mx3src: 'expr', mx3dst: 'amp', mx3amt: -0.8,
      mx4src: 'drift', mx4dst: 'pan', mx4amt: 0.5, mxDriftSpd: 0.05,
      a: 2, d: 2, s: 1, r: 8, envCurve: 0.3, width: 0.4, chMode: 'ensemble', chAmt: 0.3, chSpd: 0.3,
      reverbType: 'plate', reverbMix: 0.4, reverbSize: 8, reverbDamp: 0.3, master: 0.96 },
    /* block 7: tape on the master — soft saturation that glues the mix and wow that
       makes the pitch of everything wander: the degraded glue of Arnalds and Frahm. Set
       both Tape knobs to 0 and compare: the same thing sounds «digital» */
    'Tape Pad (nostalgia)': { waveA: 'sawtooth', waveB: 'triangle', detuneA: -5, detuneB: 7, octB: -1, levelA: 0.6, levelB: 0.4,
      cutoff: 900, reso: 1, filterSlope: '24', lfoPhase: 'voice', drift: 3,
      mx1src: 'drift', mx1dst: 'pan', mx1amt: 0.5, mxDriftSpd: 0.05,
      a: 1.2, d: 2, s: 0.9, r: 6, envCurve: 0.3, width: 0.5, chMode: 'ensemble', chAmt: 0.25, chSpd: 0.3,
      reverbType: 'plate', reverbMix: 0.4, reverbSize: 6, reverbDamp: 0.4, reverbPre: 0.03,
      tapeSat: 0.5, tapeWow: 0.5, master: 1.86 },
    /* block 5: modal resonator excited by NOISE — six bowl modes (1 · 2.76 ·
       5.40…) tuned to the note, high Q: the bowl takes a while to sing and keeps singing.
       Hold the note and wait; each voice is a bowl (per-voice drift on the pan) */
    'Singing Bowl (noise + resonator)': { waveA: 'sine', levelA: 1, levelB: 0, noise: 1, noiseColor: 0.2,
      resAmt: 1, resMat: 1, resDecay: 0.85, resBright: 0.45, cutoff: 9000, reso: 0.7, lfoPhase: 'voice',
      mx1src: 'drift', mx1dst: 'pan', mx1amt: 0.6, mxDriftSpd: 0.05,
      a: 1.5, d: 2, s: 1, r: 12, envCurve: 0.3, width: 0.3,
      reverbType: 'plate', reverbMix: 0.5, reverbSize: 10, reverbDamp: 0.3, reverbPre: 0.04, master: 0.53 },
    /* block 5: a saw through a resonator halfway between string and bar (inharmonic
       like a prepared piano), medium Q and some noise: humming metal */
    'Bowed Metal (saw + resonator)': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -4, detuneB: 5, octB: -1, levelA: 0.6, levelB: 0.4, noise: 0.25, noiseColor: -0.2,
      resAmt: 0.75, resMat: 0.55, resDecay: 0.6, resBright: 0.6, filterDrive: 0.25, cutoff: 2500, reso: 1, filterSlope: '24',
      a: 0.8, d: 1.5, s: 0.9, r: 6, envCurve: 0.3, width: 0.5, chMode: 'ensemble', chAmt: 0.2, chSpd: 0.3,
      reverbType: 'plate', reverbMix: 0.4, reverbSize: 7, reverbDamp: 0.4, master: 2.19 },
  },

  /* Stepped: the timbre moving in STEPS with what is already there (Roadmap 6.0,
     exploration). All at 120 bpm, where a sixteenth = 8 Hz, an eighth = 4 Hz and
     an eighth-note triplet = 6 Hz (the LFOs run in Hz, not in tempo). Common trick: a
     RAW LFO enters the matrix even if its Level knob is at 0, so the LFOs
     not used for their own job (reso, PWM without a square wave…) are extra
     step sources, each at its own speed. Hold a note or a chord. */
  'Stepped': {
    /* ONE S&H in eighths moves cutoff, resonance and pan at once: each step is
       a new color and a new place (the «computer» of 70s movies) */
    'One S&H, Three Targets': { waveA: 'sawtooth', waveB: 'square', detuneB: 5, pulseWidth: 0.35, levelA: 0.65, levelB: 0.35,
      cutoff: 1100, reso: 6, filterSlope: '24',
      cutLfoShape: 'sh', cutLfoSpd: 4,
      mx1src: 'lfoCut', mx1dst: 'cutoff', mx1amt: 0.4, mx2src: 'lfoCut', mx2dst: 'reso', mx2amt: 0.35,
      mx3src: 'lfoCut', mx3dst: 'pan', mx3amt: 0.7,
      a: 0.01, d: 0.4, s: 0.85, r: 0.8, bpm: 120, dlyAmt: 0.3, dlySync: '1/8.', dlyDamp: 0.4,
      reverbType: 'plate', reverbMix: 0.25, reverbSize: 3, master: 0.67 },
    /* three layers at three speeds: the wave sequence changes timbre in
       sixteenths (written pattern), the filter jumps at random in eighths (S&H) and
       a square gate runs in triplets (the tremolo LFO, raw, to the
       amplitude): 4 against 3. In a chord, each voice starts its phrase on its own note */
    'Table, Filter and Gate (16 · 8 · triplet)': { waveA: 'wavetable', waveB: 'wavetable', detuneA: -6, detuneB: 6, levelA: 0.5, levelB: 0.5,
      wtSet: 'formant', wtPos: 0, wsOn: 'on', wsPat: '0 3 7 1 5 2 6 4', wsDiv: '1/16', wsXf: 0.1,
      cutoff: 2200, reso: 3, filterSlope: '24',
      cutLfoShape: 'sh', cutLfoSpd: 4, ampLfoShape: 'square', ampLfoSpd: 6,
      mx1src: 'lfoCut', mx1dst: 'cutoff', mx1amt: 0.3, mx2src: 'lfoAmp', mx2dst: 'amp', mx2amt: 0.6,
      a: 0.02, d: 0.5, s: 0.9, r: 1.2, width: 0.5, bpm: 120, dlyAmt: 0.3, dlySync: '1/8.', dlyDamp: 0.3,
      reverbType: 'plate', reverbMix: 0.3, reverbSize: 3.5, master: 0.59 },
    /* three SQUARE LFOs at 1, 2 and 4 Hz summed into the cutoff with weights 4:2:1 are
       a binary counter: eight steps of ~400 cents (the native square
       is worth ±0.849, see the Melody) that repeat every second (two beats at
       120). With a freshly created engine they come out as a staircase;
       when loaded live the LFO phases are not reset and the staircase gets
       shuffled — same eight levels, same cycle, another order */
    'Eight-Step Stairs (3 square LFOs)': { waveA: 'sawtooth', waveB: 'sawtooth', detuneB: 8, levelA: 0.6, levelB: 0.4,
      cutoff: 1000, reso: 9, filterSlope: '24',
      cutLfoShape: 'square', cutLfoSpd: 1, resLfoShape: 'square', resLfoSpd: 2, pwmLfoShape: 'square', pwmLfoSpd: 4,
      mx1src: 'lfoCut', mx1dst: 'cutoff', mx1amt: 0.2, mx2src: 'lfoRes', mx2dst: 'cutoff', mx2amt: 0.1,
      mx3src: 'lfoPwm', mx3dst: 'cutoff', mx3amt: 0.05,
      a: 0.01, d: 0.3, s: 0.9, r: 0.8, bpm: 120, dlyAmt: 0.25, dlySync: '1/8',
      reverbType: 'plate', reverbMix: 0.25, reverbSize: 2.5, master: 0.55 },
    /* the same counter, on PITCH: 400 + 200 + 100 cents → eight notes a whole
       tone apart (with +100 ct of tuning they fall on the note's whole-tone
       scale), one per eighth; the square tremolo LFO at 8 Hz articulates
       the sixteenths. A melody nobody has written: the LFOs play it.
       Mind the weights (0.3926 and not 1/3): the browser's NATIVE square is
       band-limited and normalizes the Gibbs peak to 1, so its plateau
       is worth ±0.849 — with 1/3 the whole tones came out at 170 cents (measured) */
    'LFO Melody (whole tone)': { waveA: 'square', waveB: 'triangle', octB: 1, pulseWidth: 0.4, levelA: 0.7, levelB: 0.3,
      cutoff: 2400, reso: 4, freqCents: 100,
      cutLfoShape: 'square', cutLfoSpd: 1, resLfoShape: 'square', resLfoSpd: 2, pwmLfoShape: 'square', pwmLfoSpd: 4,
      ampLfoShape: 'square', ampLfoSpd: 8,
      mx1src: 'lfoCut', mx1dst: 'pitch', mx1amt: 0.3926, mx2src: 'lfoRes', mx2dst: 'pitch', mx2amt: 0.1963,
      mx3src: 'lfoPwm', mx3dst: 'pitch', mx3amt: 0.0981, mx4src: 'lfoAmp', mx4dst: 'amp', mx4amt: 0.75,
      a: 0.01, d: 0.2, s: 0.9, r: 0.5, bpm: 120, dlyAmt: 0.35, dlySync: '1/8.', dlyDamp: 0.4,
      reverbType: 'plate', reverbMix: 0.2, reverbSize: 2.5, master: 0.41 },
    /* PER-VOICE LFO in S&H: each note of a chord jumps on its own — the vowel
       (eighths) and the place in the stereo field, and the filter in triplets. Hold a
       chord of three or four notes: a choir of machines that talks in steps */
    'Talking Chord (per-voice S&H)': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -5, detuneB: 6, levelA: 0.5, levelB: 0.5,
      cutoff: 3000, reso: 1.5, vocAmt: 0.85, vocVowel: 0.5, vocQ: 0.4, vocBright: 0.6,
      lfoPhase: 'voice', cutLfoShape: 'sh', cutLfoSpd: 4, resLfoShape: 'sh', resLfoSpd: 6,
      mx1src: 'lfoCut', mx1dst: 'vow', mx1amt: 0.9, mx2src: 'lfoCut', mx2dst: 'pan', mx2amt: 0.6,
      mx3src: 'lfoRes', mx3dst: 'cutoff', mx3amt: 0.25,
      a: 0.03, d: 0.5, s: 0.9, r: 1.5, width: 0.3, bpm: 120, dlyAmt: 0.25, dlySync: '1/8.',
      reverbType: 'plate', reverbMix: 0.35, reverbSize: 4, master: 0.91 },
    /* the idea of the «Steps module», halfway there: four cycles of different
       lengths — squares of 5, 6 and 8 sixteenths (1.6 · 1.333 · 1 Hz) to the
       cutoff, the vowel and the pan, and a wave phrase of 16 — they do not
       line up again until lcm(5, 6, 8, 16) = 240 sixteenths: 30 s. Each layer is
       dumb and regular; together they seem never to repeat. (Here each «lane» only
       has two values and cannot be written: that is what Steps would add) */
    'Three Cycles, 30 s Around (5 · 6 · 8 · 16)': { waveA: 'wavetable', waveB: 'sawtooth', detuneB: 7, octB: -1, levelA: 0.65, levelB: 0.35,
      wtSet: 'metallic', wtPos: 0, wsOn: 'on', wsPat: '0 2 4 7 . 5 3 1 6 . 2 7 . 4 1 .', wsDiv: '1/16', wsXf: 0.2,
      cutoff: 1600, reso: 4, filterSlope: '24', vocAmt: 0.6, vocQ: 0.45,
      cutLfoShape: 'square', cutLfoSpd: 1.6, resLfoShape: 'square', resLfoSpd: 1.33333, pwmLfoShape: 'square', pwmLfoSpd: 1,
      mx1src: 'lfoCut', mx1dst: 'cutoff', mx1amt: 0.25, mx2src: 'lfoRes', mx2dst: 'vow', mx2amt: 0.8,
      mx3src: 'lfoPwm', mx3dst: 'pan', mx3amt: 0.5,
      a: 0.05, d: 0.5, s: 0.9, r: 2, width: 0.4, bpm: 120, dlyAmt: 0.3, dlySync: '1/8.', dlyDamp: 0.4,
      reverbType: 'plate', reverbMix: 0.35, reverbSize: 5, master: 1.64 },
  },

  'Voice': {
    'Human Choir': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -6, detuneB: 8, levelA: 0.5, levelB: 0.5,
      vocAmt: 0.75, vocVowel: 0.5, vocQ: 0.65, vocLife: 0.6,
      noise: 0.08, noiseColor: 0.5, drift: 3, cutoff: 4500, reso: 0.8,
      chMode: 'ensemble', chAmt: 0.55, chSpd: 0.5, freqLfoLvl: 8, freqLfoSpd: 5.2, lfoFade: 0.8,
      a: 0.5, d: 0.5, s: 0.85, r: 1.6, width: 0.5, reverbMix: 0.3, reverbSize: 2.6, master: 1.04 },
    /* the RAW cutoff LFO (Level 0) babbles the vowels; no vibrato,
       no drift, no Life: frozen formants = a talking machine */
    'Talking Robot': { waveA: 'square', waveB: 'sawtooth', pulseWidth: 0.45, levelA: 0.65, levelB: 0.35,
      vocAmt: 1, vocVowel: 0.5, vocQ: 0.05, vocLife: 0,
      cutLfoSpd: 1.3, mx1src: 'lfoCut', mx1dst: 'vow', mx1amt: 0.7,
      dist: 0.15, cutoff: 5000, reso: 1, a: 0.01, d: 0.15, s: 0.8, r: 0.15, master: 0.99 },
    'Madrigal (vowel per note)': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -5, detuneB: 7, levelA: 0.5, levelB: 0.5,
      vocAmt: 0.85, vocVowel: 0.5, vocQ: 0.5, vocLife: 0.35,
      mx1src: 'rnd', mx1dst: 'vow', mx1amt: 1,
      drift: 2, cutoff: 4500, reso: 0.8, chMode: 'ensemble', chAmt: 0.4, chSpd: 0.5,
      a: 0.4, d: 0.5, s: 0.85, r: 1.4, width: 0.6, reverbMix: 0.3, reverbSize: 2.8, master: 1.31 },
    /* the CORRECT source: glottal pulse (set 'glottal') instead of a saw;
       env→wt = the vocal effort rides the envelope (attacks pressed,
       relaxes while sustaining) + high Bright = a soloist that cuts through the mix */
    'Glottal Voice (effort)': { waveA: 'wavetable', wtSet: 'glottal', wtPos: 0.2, levelA: 1, levelB: 0,
      vocAmt: 0.85, vocVowel: 0.55, vocQ: 0.6, vocLife: 0.5, vocBright: 0.75,
      mx1src: 'env', mx1dst: 'wt', mx1amt: 0.6,
      freqLfoLvl: 9, freqLfoSpd: 5.2, lfoFade: 0.6, drift: 2, cutoff: 5000, reso: 0.8,
      a: 0.15, d: 0.4, s: 0.8, r: 0.9, width: 0.4, reverbMix: 0.25, master: 2.15 },
    /* the recipe calibrated BY EAR (2026-08-18): a meaningful Bite lives
       LOW (~0.12 — higher up it degenerates into percussion); the consonant is
       rounded off by colored noise and a pinch of drive. Fast attack:
       each note syllabifies «ka» (the vowel changes and so does the consonant) */
    'Vocal Percussion (ka)': { waveA: 'sawtooth', waveB: 'square', pulseWidth: 0.4, levelA: 0.7, levelB: 0.3,
      vocAmt: 1, vocVowel: 0.5, vocQ: 0.45, vocAtk: 0.12, vocBright: 0.6,
      noise: 0.12, noiseColor: 0.35, dist: 0.18,
      cutoff: 4500, reso: 1, filterEnvAmt: 1200, a: 0.003, d: 0.25, s: 0.25, r: 0.2,
      dlyAmt: 0.2, dlyTime: 0.28, width: 0.3, master: 1.61 },
  },

  'Plucks & Keys': {
    'Pluck': { waveA: 'square', waveB: 'sawtooth', pulseWidth: 0.35, levelA: 0.6, levelB: 0.4, cutoff: 448, reso: 7,
      filterEnvAmt: 3500, a: 0.002, d: 0.18, s: 0.0, r: 0.12, dlyAmt: 0.3, dlyTime: 0.33, width: 0.3, master: 1.05 },
    'Bell (Ring)': { waveA: 'sine', waveB: 'sine', ring: 0.8, detuneB: 40, octavesB: 2, levelA: 0.1, levelB: 0.1,
      cutoff: 5020, reso: 1, a: 0.002, d: 1.4, s: 0.0, r: 0.9, dlyAmt: 0.25, dlyTime: 0.35, width: 0.4, reverbMix: 0.3, master: 1.76 },
    'Music Box': { waveA: 'sine', waveB: 'sine', ring: 0.5, detuneB: 24, octavesB: 2, levelA: 0.25, levelB: 0.25,
      cutoff: 7100, a: 0.002, d: 0.8, s: 0.0, r: 0.6, dlyAmt: 0.3, dlyTime: 0.35, width: 0.4, reverbMix: 0.35, master: 1.45 },
    'Electric Piano': { waveA: 'sine', waveB: 'triangle', levelA: 0.4675, levelB: 0.3825, ring: 0.15, cutoff: 2520,
      filterEnvAmt: 2000, a: 0.003, d: 0.5, s: 0.25, r: 0.3, width: 0.3, reverbMix: 0.2, master: 1.55 },
    'Supersaw Pluck': { waveA: 'supersaw', spread: 0.6, levelA: 0.8, levelB: 0.2, cutoff: 1260, reso: 3, filterEnvAmt: 3000,
      a: 0.002, d: 0.25, s: 0.1, r: 0.2, width: 0.5, reverbMix: 0.25, dlyAmt: 0.25, master: 0.89 },
    /* matrix: vel→cutoff in octaves — playing hard OPENS the filter (with a MIDI
       keyboard: dynamics are timbre, not only volume; low base on purpose) */
    'Touch Keys (vel→filter)': { waveA: 'sine', waveB: 'triangle', levelA: 0.4675, levelB: 0.3825, ring: 0.15,
      cutoff: 800, filterEnvAmt: 800, mx1src: 'vel', mx1dst: 'cutoff', mx1amt: 0.55,
      a: 0.003, d: 0.5, s: 0.25, r: 0.3, width: 0.3, reverbMix: 0.2, master: 1.55 },
    /* 'metallic' table + S&H→wt and →pan: each bell with its own mix of
       partials and its own place in the stereo field */
    'Wavetable Bells (S&H)': { waveA: 'wavetable', levelA: 1, levelB: 0, wtSet: 'metallic', wtPos: 0.3,
      mx1src: 'rnd', mx1dst: 'wt', mx1amt: 0.35, mx2src: 'rnd', mx2dst: 'pan', mx2amt: 0.7,
      a: 0.002, d: 1.4, s: 0.0, r: 1.0, dlyAmt: 0.25, dlyTime: 0.4,
      width: 0.4, reverbMix: 0.35, master: 1 },
    /* very fast 1shot sequence: starts on the bright frame and settles
       on the soft one — "attack sample + synth body", the D-50 trick */
    'Digital Attack (1shot)': { waveA: 'wavetable', levelA: 1, levelB: 0, wtSet: 'analog', wtPos: 1,
      wsOn: 'on', wsMode: '1shot', wsPat: '7 5 1', wsDiv: '1/16', wsXf: 1,
      cutoff: 3500, reso: 1.5, a: 0.003, d: 0.5, s: 0.55, r: 0.3,
      dlyAmt: 0.2, dlyTime: 0.3, width: 0.3, reverbMix: 0.2, master: 1.27 },
    /* matrix: S&H→cutoff and →pan — each note comes out with a different color and
       place (correlated: the SAME roll per voice); brutal with the arp */
    'Lottery Pluck (S&H)': { waveA: 'square', waveB: 'sawtooth', pulseWidth: 0.3, levelA: 0.6, levelB: 0.4,
      cutoff: 700, reso: 5, filterEnvAmt: 1800,
      mx1src: 'rnd', mx1dst: 'cutoff', mx1amt: 0.35,
      mx2src: 'rnd', mx2dst: 'pan', mx2amt: 0.8,
      a: 0.002, d: 0.2, s: 0.0, r: 0.15, dlyAmt: 0.3, dlyTime: 0.4, width: 0.2, master: 0.99 },
  },

  /* Plucked Strings (Roadmap 7.0 · 3.3): the «String» wave (Karplus-Strong). Envelope as a
     gate (sustain 1): the string dies away on its own with its Decay; the release is the hand
     that mutes it when the key is let go. Master measured by the PEAK of the strum (−3 dBFS),
     not by average loudness: a pick is almost all attack, and bringing it to −14 LUFS would
     make the limiter eat the hit. */
  'Plucked Strings': {
    'Nylon Guitar': { waveA: 'string', levelA: 0.8, levelB: 0, strBright: 0.3, strDecay: 2.5, strPos: 0.18,
      cutoff: 12000, reso: 0.7, a: 0, d: 0.05, s: 1, r: 0.35, reverbMix: 0.2, width: 0.3, master: 1.76 },
    'Twelve-String Guitar': { waveA: 'string', levelA: 0.8, levelB: 0, strBright: 0.7, strDecay: 4, strPos: 0.1,
      uniVoices: '2', uniDetune: 6, octavesA: 2, cutoff: 12000, reso: 0.7, a: 0, d: 0.05, s: 1, r: 0.5, reverbMix: 0.2, width: 0.5, master: 1.4 },
    'Harp': { waveA: 'string', levelA: 0.8, levelB: 0, strBright: 0.55, strDecay: 5, strPos: 0.3,
      cutoff: 12000, reso: 0.7, a: 0, d: 0.05, s: 1, r: 2.5, reverbMix: 0.35, width: 0.4, master: 1.19 },
    'Koto': { waveA: 'string', levelA: 0.8, levelB: 0, strBright: 0.6, strDecay: 2, strPos: 0.06,
      cutoff: 12000, reso: 0.7, a: 0, d: 0.05, s: 1, r: 0.6, dlyAmt: 0.2, dlyTime: 0.3, reverbMix: 0.2, width: 0.3, master: 1.38 },
    'Plucked Bass': { waveA: 'string', octA: -1, levelA: 0.8, levelB: 0, strBright: 0.25, strDecay: 2.5, strPos: 0.2,
      cutoff: 3000, reso: 0.7, a: 0, d: 0.05, s: 1, r: 0.15, master: 2.9 },
    'String Piano': { waveA: 'string', levelA: 0.8, levelB: 0, strBright: 0.45, strDecay: 6, strPos: 0.12, strStiff: 0.6,
      uniVoices: '3', uniDetune: 2, cutoff: 12000, reso: 0.7, a: 0, d: 0.05, s: 1, r: 0.6, reverbMix: 0.25, width: 0.4, master: 1.44 },
    'String Bell': { waveA: 'string', levelA: 0.8, levelB: 0, strBright: 0.85, strDecay: 8, strPos: 0.25, strStiff: 1,
      cutoff: 12000, reso: 0.7, a: 0, d: 0.05, s: 1, r: 3, reverbMix: 0.4, width: 0.4, master: 1.19 },
  },

  'FM': {
    'FM Piano (Rhodes)': { waveA: 'sine', waveB: 'sine', levelA: 0.65, levelB: 0.35, fmRatio: 1, fmIndex: 2.2,
      filterEnvAmt: 1200, a: 0.003, d: 0.6, s: 0.25, r: 0.4, width: 0.3, reverbMix: 0.22, master: 0.78 },
    'DX E-Piano': { waveA: 'sine', waveB: 'sine', levelA: 0.6, levelB: 0.4, fmRatio: 4, fmIndex: 1.4,
      filterEnvAmt: 2000, a: 0.002, d: 0.5, s: 0.2, r: 0.35, width: 0.3, reverbMix: 0.2, master: 0.63 },
    'FM Brass': { waveA: 'sine', waveB: 'sine', detuneB: 8, levelA: 0.5, levelB: 0.5, fmRatio: 1, fmIndex: 3,
      filterEnvAmt: 2500, a: 0.05, d: 0.25, s: 0.7, r: 0.25, width: 0.3, reverbMix: 0.18, master: 0.73 },
    'FM Clav': { waveA: 'sine', waveB: 'sine', levelA: 0.6, levelB: 0.4, fmRatio: 2, fmIndex: 2.6,
      cutoff: 2520, filterEnvAmt: 1500, a: 0.002, d: 0.25, s: 0.15, r: 0.15, dlyAmt: 0.15, width: 0.25, master: 0.92 },
    'FM Bass': { waveA: 'sine', waveB: 'sine', levelA: 0.7, levelB: 0.3, fmRatio: 1, fmIndex: 1.8,
      cutoff: 632, reso: 2, a: 0.005, d: 0.25, s: 0.4, r: 0.18, master: 1.54 },
    'DX Bass': { waveA: 'sine', waveB: 'sine', levelA: 0.7, levelB: 0.3, fmRatio: 2, fmIndex: 2.2,
      cutoff: 893, reso: 2, filterEnvAmt: 1200, a: 0.004, d: 0.22, s: 0.35, r: 0.16, master: 1.54 },
    'FM Marimba': { waveA: 'sine', waveB: 'sine', levelA: 0.6, levelB: 0.4, fmRatio: 4, fmIndex: 1.1,
      cutoff: 2520, a: 0.002, d: 0.32, s: 0.0, r: 0.18, width: 0.3, reverbMix: 0.2, master: 0.88 },
    'FM Glockenspiel': { waveA: 'sine', waveB: 'sine', levelA: 0.6, levelB: 0.4, fmRatio: 7, fmIndex: 2.4,
      a: 0.001, d: 0.5, s: 0.0, r: 0.4, dlyAmt: 0.2, width: 0.4, reverbMix: 0.32, master: 1.22 },
    'FM Bell': { waveA: 'sine', waveB: 'sine', levelA: 0.6, levelB: 0.4, fmRatio: 3.5, fmIndex: 4,
      a: 0.002, d: 1.6, s: 0.0, r: 1.0, dlyAmt: 0.2, dlyTime: 0.35, width: 0.4, reverbMix: 0.35, master: 0.79 },
    'Tubular Bell': { waveA: 'sine', waveB: 'sine', detuneB: 6, levelA: 0.55, levelB: 0.45, fmRatio: 1.41, fmIndex: 5,
      a: 0.003, d: 2.2, s: 0.0, r: 1.5, width: 0.45, reverbMix: 0.4, reverbSize: 3.2, master: 0.5 },
    'Metallic Gong': { waveA: 'sine', waveB: 'sine', ring: 0.2, detuneB: 20, levelA: 0.4, levelB: 0.4, fmRatio: 2.74, fmIndex: 8,
      a: 0.005, d: 2.5, s: 0.0, r: 2.0, cutLfoLvl: 1500, cutLfoSpd: 0.2, width: 0.5, reverbMix: 0.42, reverbSize: 3.5, master: 1.15 },
    'FM Glass Pad': { waveA: 'sine', waveB: 'sine', detuneB: 8, levelA: 0.5, levelB: 0.5, fmRatio: 2, fmIndex: 1.3,
      cutoff: 2890, a: 0.7, d: 0.6, s: 0.8, r: 2.0, width: 0.6, reverbMix: 0.4, reverbSize: 3, master: 0.51 },
    'Sci-Fi FM': { waveA: 'sine', waveB: 'sine', levelA: 0.5, levelB: 0.5, fmRatio: 5.7, fmIndex: 6,
      cutLfoLvl: 2000, cutLfoSpd: 0.18, a: 0.6, d: 0.6, s: 0.85, r: 2.0, dlyAmt: 0.3, dlyTime: 0.6, width: 0.5, reverbMix: 0.4, master: 0.76 },
    /* matrix → FM index: the index RIDES the envelope (env = the amp ADSR
       in «follow Amp Env» mode): a bright attack that fades with the note — the DX7's
       bell and pluck, impossible with a fixed index */
    'DX Bell (env→FM)': { waveA: 'sine', waveB: 'sine', detuneB: 5, levelA: 0.6, levelB: 0.4, fmRatio: 3.5, fmIndex: 0.6,
      mx1src: 'env', mx1dst: 'fm', mx1amt: 0.5,
      a: 0.002, d: 1.8, s: 0.0, r: 1.2, dlyAmt: 0.2, dlyTime: 0.35, width: 0.45, reverbMix: 0.35, reverbSize: 2.8, master: 0.8 },
    /* velocity → FM index: hitting hard opens the timbre, not only the volume (the
       DX7's touch); a short env→FM (own env, 120 ms) adds the attack's «tine» */
    'DX E-Piano (vel→FM)': { waveA: 'sine', waveB: 'sine', levelA: 0.6, levelB: 0.4, fmRatio: 1, fmIndex: 0.5,
      mx1src: 'vel', mx1dst: 'fm', mx1amt: 0.2, mx2src: 'env', mx2dst: 'fm', mx2amt: 0.15,
      fenvMode: 'own', fa: 0.002, fd: 0.12, fs: 0.0, fr: 0.2,
      a: 0.002, d: 0.9, s: 0.25, r: 0.4, chAmt: 0.25, chSpd: 0.5, width: 0.3, reverbMix: 0.22, master: 0.65 },
    /* modulator feedback: its sine turns into a saw and the brass gains bite */
    'FM Brass (feedback)': { waveA: 'sine', waveB: 'sine', detuneB: 7, levelA: 0.5, levelB: 0.5, fmRatio: 1, fmIndex: 1.2, fmFb: 0.45,
      mx1src: 'env', mx1dst: 'fm', mx1amt: 0.25,
      a: 0.06, d: 0.3, s: 0.7, r: 0.25, width: 0.35, reverbMix: 0.2, master: 0.87 },
  },

  'FM4': {
    /* stack 4→3→2→1: the high modulators decay fast (an attack with bite),
       op 2 stays (brass body); feedback on op 4 */
    'FM4 · Stacked Brass': { waveA: 'fm4', levelA: 1, levelB: 0, fm4Alg: '0', fmFb: 0.3,
      fm4R1: 1, fm4L1: 1, fm4D1: 4, fm4R2: 1, fm4L2: 0.55, fm4D2: 4, fm4R3: 1, fm4L3: 0.35, fm4D3: 0.4, fm4R4: 1, fm4L4: 0.3, fm4D4: 0.18,
      cutoff: 9000, a: 0.05, d: 0.3, s: 0.8, r: 0.3, width: 0.3, reverbMix: 0.18, master: 0.66 },
    /* two pairs: 2→1 is the body (ratio 1 with modulator 14 = the «tine»), 4→3 the hit;
       both modulators with velocity sensitivity: played soft it is round,
       hard brings out the tine and the growl (at velocity 1 it sounds as before) */
    'FM4 · Paired E-Piano': { waveA: 'fm4', levelA: 1, levelB: 0, fm4Alg: '1',
      fm4R1: 1, fm4L1: 1, fm4D1: 4, fm4R2: 14, fm4L2: 0.12, fm4D2: 0.1, fm4R3: 1, fm4L3: 0.7, fm4D3: 4, fm4R4: 1, fm4L4: 0.35, fm4D4: 0.6,
      fm4V2: 0.8, fm4V4: 0.7,
      cutoff: 9000, a: 0.002, d: 1.0, s: 0.2, r: 0.4, chAmt: 0.25, chSpd: 0.5, width: 0.35, reverbMix: 0.22, master: 0.8 },
    /* three modulators in parallel with non-integer ratios: dense inharmonic spectrum */
    'FM4 · Dense Bell': { waveA: 'fm4', levelA: 1, levelB: 0, fm4Alg: '2',
      fm4R1: 1, fm4L1: 1, fm4D1: 4, fm4R2: 3.5, fm4L2: 0.45, fm4D2: 1.2, fm4R3: 5.19, fm4L3: 0.3, fm4D3: 0.8, fm4R4: 7.3, fm4L4: 0.2, fm4D4: 0.5,
      cutoff: 12000, a: 0.002, d: 2.2, s: 0, r: 1.6, dlyAmt: 0.2, dlySync: '1/4.', width: 0.5, reverbMix: 0.35, reverbSize: 2.8, master: 0.5 },
    /* FM kick: modulator 2 with a 30 ms decay = the «click», pitch env = the body */
    'FM4 · Kick': { waveA: 'fm4', levelA: 1, levelB: 0, fm4Alg: '0',
      fm4R1: 1, fm4L1: 1, fm4D1: 4, fm4R2: 1, fm4L2: 0.9, fm4D2: 0.03, fm4R3: 0.5, fm4L3: 0.5, fm4D3: 0.02, fm4R4: 1, fm4L4: 0, fm4D4: 4,
      pitchEnvAmt: 1800, pitchEnvDec: 0.05, cutoff: 800, envCurve: 1, a: 0, d: 0.5, s: 0, r: 0.3, dist: 0.2, master: 1.48 },
    /* additive with full feedback on op 4: metallic noise; high non-integer ratios + high-pass = hat */
    'FM4 · Hat': { waveA: 'fm4', levelA: 1, levelB: 0, fm4Alg: '7', fmFb: 1,
      fm4R1: 5.7, fm4L1: 0.5, fm4D1: 0.06, fm4R2: 8.3, fm4L2: 0.5, fm4D2: 0.05, fm4R3: 11.1, fm4L3: 0.4, fm4D3: 0.08, fm4R4: 6.9, fm4L4: 0.6, fm4D4: 0.07,
      cutoff: 7000, morph: 1, a: 0, d: 0.09, s: 0, r: 0.06, width: 0.25, master: 3.18 },
  },

  'Organ': {
    'Tremolo Organ': { waveA: 'square', waveB: 'square', octavesB: 2, levelA: 0.5, levelB: 0.5, ampLfoLvl: 0.35, ampLfoSpd: 6,
      cutoff: 2520, reso: 1, a: 0.01, d: 0.1, s: 0.9, r: 0.2, width: 0.25, master: 0.47 },
    'Full Organ': { waveA: 'square', waveB: 'square', octavesA: 2, octavesB: 3, levelA: 0.5, levelB: 0.5,
      cutoff: 5770, reso: 1, a: 0.005, d: 0.05, s: 1.0, r: 0.1, width: 0.3, master: 0.69 },
    'Church Organ': { waveA: 'sine', waveB: 'sine', octavesA: 2, octavesB: 3, detuneB: 4, levelA: 0.5, levelB: 0.5,
      cutoff: 7100, a: 0.05, d: 0.1, s: 1.0, r: 0.4, width: 0.4, reverbMix: 0.45, reverbSize: 3.5, master: 1.04 },
    /* 'organ' table: morph = pulling out drawbars (from flute to full) */
    'Wavetable Organ': { waveA: 'wavetable', waveB: 'wavetable', octavesB: 2, detuneB: 4, levelA: 0.65, levelB: 0.35,
      wtSet: 'organ', wtPos: 0.75, cutoff: 7100, a: 0.01, d: 0.05, s: 1.0, r: 0.15,
      width: 0.3, reverbMix: 0.2, master: 0.94 },
  },

  /* Percussion: a deliberately synthetic 808/909 kit — that is how drum machines
     sounded: kick = sine with a pitch drop; snare = short tonal body + noise;
     cymbals = chaotic FM + high-passed noise. Almost all of them use Curve 1: a
     real drumhead is a damped resonator and decays exponentially from the
     first instant; with straight ramps the sound plateaus and then gets cut off
     (it sounded like a gated note, not a hit). Meant to be played in the octave
     of C3 (the selftest's); the keyboard transposes. */
  'Percussion': {
    /* what makes the «hit» is a BRIGHTNESS ENVELOPE: the first 30 ms rich in
       harmonics (the excited drumhead) and right away only the sine (the body). Here
       FM4's operator 2 provides it: ratio 1 with a 30 ms decay = saw harmonics
       that die out; op 3 (ratio 0.5, 20 ms) is the sub-click. Short pitch blip
       (700 ct in 40 ms, the 808's is small) and exponential drop. Until
       2026-10-01 it was a sine with an 1800 ct sweep and a linear drop: at any
       octave it sounded like a gated bass, not a kick (picked by ear among seven
       rendered candidates) */
    '808 Kick': { waveA: 'fm4', levelA: 1, levelB: 0, fm4Alg: '0',
      fm4R1: 1, fm4L1: 1, fm4D1: 4, fm4R2: 1, fm4L2: 0.9, fm4D2: 0.03, fm4R3: 0.5, fm4L3: 0.5, fm4D3: 0.02, fm4R4: 1, fm4L4: 0, fm4D4: 4,
      pitchEnvAmt: 700, pitchEnvDec: 0.04, cutoff: 2500, envCurve: 1,
      a: 0, d: 0.55, s: 0.0, r: 0.3, dist: 0.3, master: 2.02 },
    /* 909: the click is triangle B + a breath of airy noise; the per-voice drive
       (tanh before the filter) tightens the body; a longer pitch sweep than the 808's */
    '909 Kick': { waveA: 'sine', waveB: 'triangle', levelA: 0.8, levelB: 0.2, noise: 0.12, noiseColor: 0.5,
      pitchEnvAmt: 1000, pitchEnvDec: 0.07, cutoff: 2200, filterDrive: 0.3, dist: 0.4,
      envCurve: 1, a: 0, d: 0.5, s: 0.0, r: 0.3, amplitude: 1, master: 2.37 },
    'Synth Tom': { waveA: 'sine', waveB: 'triangle', levelA: 0.75, levelB: 0.25, pitchEnvAmt: 900, pitchEnvDec: 0.12,
      cutoff: 1260, envCurve: 1, a: 0, d: 0.45, s: 0.0, r: 0.25, reverbMix: 0.15, amplitude: 1, master: 2.37 },
    'Zap Snare': { waveA: 'triangle', levelA: 1, levelB: 0, noise: 0.7, pitchEnvAmt: 1200, pitchEnvDec: 0.04,
      cutoff: 2890, morph: 0.35, filterEnvAmt: 2500, fenvMode: 'own', fa: 0.001, fd: 0.1, fs: 0.0,
      envCurve: 1, a: 0, d: 0.25, s: 0.0, r: 0.12, amplitude: 1, master: 2.37 },
    /* the 808: two sines at 180 and 330 Hz (ratio 1.83 — not an octave, which is why
       they go as carriers of the additive FM4: ratios 1.38 and 2.52 over C3) that die
       in ~100 ms through their operator decay, + very airy noise that lasts longer and falls
       exponentially (the ADSR with Curve 1: with straight ramps the noise held
       150 ms flat and sounded like a gated «shhh»; picked by ear, 2026-10-01) */
    '808 Snare': { waveA: 'fm4', levelA: 1, levelB: 0, fm4Alg: '7',
      fm4R1: 1.38, fm4L1: 1, fm4D1: 0.11, fm4R2: 1, fm4L2: 0, fm4D2: 4, fm4R3: 2.52, fm4L3: 0.6, fm4D3: 0.07, fm4R4: 1, fm4L4: 0, fm4D4: 4,
      noise: 1, noiseColor: 0.7, pitchEnvAmt: 400, pitchEnvDec: 0.03, cutoff: 12000, reso: 1,
      envCurve: 1, a: 0, d: 0.3, s: 0.0, r: 0.15, dist: 0.1, reverbMix: 0.1, reverbSize: 0.8, master: 1.38 },
    /* 808 clap: it is not a single noise hit — it is three bursts ~11 ms apart (Flam) and then
       the tail, all through a band-pass at ~1.3 kHz (which eats almost all the noise's
       energy: hence amplitude and master at full and some distortion, which also
       gives it the 808's grain); A's sine is removed by the BP itself (130 Hz sits
       three octaves below the cutoff) */
    '808 Clap': { waveA: 'sine', levelA: 1, levelB: 0, noise: 1, noiseColor: 0.1, filterType: 'bp', cutoff: 1300, reso: 2.5,
      hits: 3, hitGap: 0.011, a: 0, d: 0.28, s: 0.0, r: 0.12, envCurve: 0.6, dist: 0.35,
      reverbMix: 0.15, reverbSize: 0.9, width: 0.3, amplitude: 1, master: 2.37 },
    /* 909 rimshot: a «ping» — a resonant band-pass that the filter envelope
       sweeps in 30 ms, over a triangle with an abrupt pitch drop and noise; the
       distortion adds the snap */
    '909 Rimshot': { waveA: 'triangle', levelA: 1, levelB: 0, noise: 0.8, noiseColor: 0.5, pitchEnvAmt: 1200, pitchEnvDec: 0.012,
      filterType: 'bp', cutoff: 1700, reso: 5, filterEnvAmt: 2500, fenvMode: 'own', fa: 0.001, fd: 0.03, fs: 0.0, fr: 0.05,
      envCurve: 1, a: 0, d: 0.1, s: 0.0, r: 0.06, filterDrive: 0.2, dist: 0.6, amplitude: 1, master: 2.37 },
    /* 808 cowbell: two oscillators at 587 and 845 Hz (ratio 1.44: ratios 4.49 and 6.46
       over C3, additive carriers); the 808 uses squares through a band-pass: here the
       sines go through the drive (tanh), which creates harmonics and intermodulation, and a
       wide BP at 1.2 kHz drops the body and keeps the «clank» */
    '808 Cowbell': { waveA: 'fm4', levelA: 1, levelB: 0, fm4Alg: '7',
      fm4R1: 4.49, fm4L1: 1, fm4D1: 0.45, fm4R2: 1, fm4L2: 0, fm4D2: 4, fm4R3: 6.46, fm4L3: 1, fm4D3: 0.3, fm4R4: 1, fm4L4: 0, fm4D4: 4,
      filterDrive: 0.5, dist: 0.45, filterType: 'bp', cutoff: 1200, reso: 1.2,
      envCurve: 1, a: 0, d: 0.5, s: 0.0, r: 0.2, width: 0.2, amplitude: 1, master: 2.37 },
    /* open hat: the same FM hat (full feedback = metallic noise) with a long
       decay and a bit of airy noise; the closed one is «FM Hat (feedback)» */
    'Open Hat': { waveA: 'sine', levelA: 1, levelB: 0, fmRatio: 5.7, fmIndex: 5, fmFb: 1, noise: 0.3, noiseColor: 0.8,
      cutoff: 7000, morph: 1, a: 0, d: 0.45, s: 0.0, r: 0.3, width: 0.25, master: 1.3 },
    /* FM with full feedback: the modulator goes chaotic = metallic noise; non-integer
       ratio + high-pass (morph 1) = hi-hat without touching the noise generator */
    'FM Hat (feedback)': { waveA: 'sine', levelA: 1, levelB: 0, fmRatio: 5.7, fmIndex: 5, fmFb: 1,
      cutoff: 6500, morph: 1, a: 0, d: 0.09, s: 0.0, r: 0.06, width: 0.2, master: 1.77 },
    /* 909 crash: four additive carriers with non-integer ratios and full feedback
       on op 4 (chaos = metallic noise) that decay in ~1 s, + airy white noise,
       all through a high-pass; a real cymbal has thousands of modes: this sounds like a 909 */
    '909 Crash': { waveA: 'fm4', levelA: 1, levelB: 0, fm4Alg: '7', fmFb: 1,
      fm4R1: 3.7, fm4L1: 0.5, fm4D1: 1.3, fm4R2: 5.3, fm4L2: 0.5, fm4D2: 1.0, fm4R3: 7.9, fm4L3: 0.4, fm4D3: 0.8, fm4R4: 4.1, fm4L4: 0.7, fm4D4: 1.1,
      noise: 0.55, noiseColor: 0.6, cutoff: 3500, morph: 1, envCurve: 1, a: 0, d: 2.0, s: 0.0, r: 1.2,
      reverbMix: 0.2, reverbSize: 2.0, width: 0.4, master: 1.3 },
    /* 909 ride: like the crash but with a «ping» (carrier 1 at ratio 9, long decay)
       that outlives the short splash of the other three */
    '909 Ride': { waveA: 'fm4', levelA: 1, levelB: 0, fm4Alg: '7', fmFb: 0.7,
      fm4R1: 9.0, fm4L1: 0.55, fm4D1: 1.4, fm4R2: 5.3, fm4L2: 0.3, fm4D2: 0.45, fm4R3: 7.9, fm4L3: 0.3, fm4D3: 0.35, fm4R4: 11.3, fm4L4: 0.5, fm4D4: 0.3,
      noise: 0.25, noiseColor: 0.7, cutoff: 4000, morph: 1, envCurve: 1, a: 0, d: 1.4, s: 0.0, r: 0.8,
      reverbMix: 0.12, reverbSize: 1.5, width: 0.3, amplitude: 1, master: 2.37 },
    /* rave hit (the 90s «orchestra hit»): saw + square in ×3 unison with a
       pinch of noise, its own filter envelope closing in 250 ms, distortion,
       a short pitch drop and a small room */
    'Rave Hit': { waveA: 'sawtooth', waveB: 'square', octavesB: 2, uniVoices: '3', uniDetune: 18, levelA: 0.5, levelB: 0.5, noise: 0.12,
      pitchEnvAmt: 200, pitchEnvDec: 0.08, cutoff: 1500, reso: 2, filterEnvAmt: 4500, fenvMode: 'own', fa: 0.001, fd: 0.25, fs: 0.0, fr: 0.2,
      envCurve: 1, a: 0, d: 0.6, s: 0.0, r: 0.3, dist: 0.3, reverbMix: 0.25, reverbSize: 1.2, width: 0.6, amplitude: 1, master: 2.13 },
    'Laser Zap': { waveA: 'sawtooth', levelA: 1, levelB: 0, pitchEnvAmt: -2400, pitchEnvDec: 0.25, cutoff: 5020,
      reso: 8, a: 0, d: 0.4, s: 0.0, r: 0.2, dlyAmt: 0.25, dlyTime: 0.25, width: 0.3, master: 1.6 },
  },

  'Stabs': {
    'Rave Hoover': { waveA: 'sawtooth', waveB: 'square', pulseWidth: 0.4, detuneA: -15, detuneB: 15, octavesB: 2,
      levelA: 0.5, levelB: 0.5, freqLfoLvl: 25, freqLfoSpd: 6, cutoff: 2000, reso: 4, flAmt: 0.4, flSpd: 0.5, dist: 0.2,
      a: 0.02, d: 0.3, s: 0.7, r: 0.3, width: 0.3, master: 0.82 },
    'Supersaw Stab': { waveA: 'supersaw', waveB: 'supersaw', spread: 0.8, levelA: 0.5, levelB: 0.5, cutoff: 2520, reso: 2,
      filterEnvAmt: 2000, a: 0.005, d: 0.25, s: 0.3, r: 0.25, dist: 0.1, width: 0.7, reverbMix: 0.25, master: 1.57 },
    'Metallic Stab': { waveA: 'sawtooth', waveB: 'sine', ring: 0.6, detuneB: 30, levelA: 0.2, levelB: 0.2, cutoff: 2520,
      filterEnvAmt: 2500, a: 0.003, d: 0.3, s: 0.2, r: 0.25, dist: 0.2, width: 0.4, reverbMix: 0.2, master: 1.48 },
  },

  'FX & Atmospheres': {
    /* S&H through the MATRIX to pitch (±720 ct, 5 jumps/s): a held note
       becomes a random melody — the spaceship's computer; the LFO's Level
       stays at 0: only the matrix reads it */
    'S&H Bleeps (random pitch)': { waveA: 'square', waveB: 'sine', levelA: 0.6, levelB: 0.4, cutoff: 3000, reso: 2,
      freqLfoShape: 'sh', freqLfoSpd: 5, mx1src: 'lfoFreq', mx1dst: 'pitch', mx1amt: 0.6,
      a: 0.003, d: 0.1, s: 0.8, r: 0.2, dlyAmt: 0.35, dlySync: '1/8.', bpm: 120, reverbMix: 0.2, master: 1.03 },
    'Sci-Fi Drone': { noise: 0.4, waveA: 'sine', waveB: 'sawtooth', ring: 0.4, detuneB: 25, levelA: 0.3, levelB: 0.3,
      cutoff: 800, reso: 8, cutLfoLvl: 650, cutLfoSpd: 0.15, resLfoLvl: 6, resLfoSpd: 0.1,
      a: 1.2, d: 0.5, s: 0.9, r: 2.5, dlyAmt: 0.4, dlyTime: 0.7, width: 0.5, reverbMix: 0.4, master: 1.3 },
    'Tension Riser': { noise: 0.5, waveA: 'sawtooth', levelA: 0.8, levelB: 0.2, cutoff: 224, filterEnvAmt: 2800,
      reso: 8, a: 2.0, d: 0.5, s: 0.9, r: 1.5, width: 0.5, reverbMix: 0.4, reverbSize: 3.5, master: 0.91 },
    'Spaceship': { ring: 0.7, waveA: 'sine', waveB: 'sine', detuneB: 35, octavesB: 2, levelA: 0.15, levelB: 0.15,
      cutoff: 1400, cutLfoLvl: 1200, cutLfoSpd: 0.2, a: 0.5, d: 0.5, s: 0.9, r: 2.0, flAmt: 0.4, flSpd: 0.3,
      width: 0.5, reverbMix: 0.4, master: 2.08 },
    'Resonant Blip': { waveA: 'sawtooth', levelA: 0.8, levelB: 0.2, cutoff: 1260, reso: 16, filterEnvAmt: 4000,
      a: 0.001, d: 0.15, s: 0.0, r: 0.1, width: 0.3, reverbMix: 0.2, master: 1.27 },
    'Syncopated Wobble': { waveA: 'sawtooth', waveB: 'square', levelA: 0.6, levelB: 0.4, cutoff: 1250, reso: 10,
      cutLfoLvl: 1000, cutLfoSpd: 2, cutLfoShape: 'square', dist: 0.25,
      dlyAmt: 0.35, dlySync: '1/8.', bpm: 140, panLfoLvl: 0.4, panLfoSpd: 0.8,
      a: 0.005, d: 0.3, s: 0.8, r: 0.2, master: 1.26 },
    /* tape delay: the loop loses highs on every pass (Damp) and the wow
       detunes each repeat a hair — the dub echo that a clean digital
       delay does not give (at Damp 0 and Wow 0 it is the usual ping-pong) */
    'Tape Dub': { waveA: 'square', waveB: 'sawtooth', pulseWidth: 0.4, detuneB: 5, levelA: 0.6, levelB: 0.4,
      cutoff: 1800, reso: 4, filterEnvAmt: 2200, a: 0.003, d: 0.18, s: 0, r: 0.25,
      dlyAmt: 0.6, dlySync: '1/4.', bpm: 90, dlyDamp: 0.65, dlyWow: 0.35,
      width: 0.3, reverbMix: 0.15, reverbSize: 2.2, master: 1.94 },
  },
};

// Names are unique across the whole bank -> flat lookup.
export function factoryPreset(name) {
  for (const cat in FACTORY) if (name in FACTORY[cat]) return FACTORY[cat][name];
  return null;
}

// ---------- user presets (localStorage) ----------
const LS_V1 = 'subsdj.presets.v1';       // v1: cutoff as slider position 0..1
const LS_V2 = 'subsdj.presets.v2';       // v2: engine space

// v1 -> v2: only cutoff changes space (position 0..1 -> Hz). The other
// keys already matched engine space. Idempotent (a cutoff in Hz
// is never <= 1, and a position is never > 1).
export function migrateV1(p) {
  const q = { ...p };
  if (typeof q.cutoff === 'number' && q.cutoff <= 1) q.cutoff = Math.round(posToVal(PARAMS.cutoff, q.cutoff));
  return q;
}

export function loadUser() {
  try {
    const v2 = localStorage.getItem(LS_V2);
    if (v2 !== null) return JSON.parse(v2) || {};
    const v1 = JSON.parse(localStorage.getItem(LS_V1));
    if (v1 && typeof v1 === 'object') {
      const out = {};
      for (const name in v1) out[name] = migrateV1(v1[name]);
      localStorage.setItem(LS_V2, JSON.stringify(out));   // v1 is kept as a backup copy
      return out;
    }
  } catch (e) {}
  return {};
}
export function saveUser(o) { try { localStorage.setItem(LS_V2, JSON.stringify(o)); } catch (e) {} }
