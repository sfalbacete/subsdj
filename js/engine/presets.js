/* =====================================================================
   SubSDJ · the FACTORY BANK (1.5.0, docs/BANK.md): one consolidated bank,
   by use, with each preset's metadata next to its sound.
     name   unique, ≤ 32 chars, in the language of the classic banks
     tags   from TAGS (engine/bankCheck.js checks them): character, motion, use, style
     use    what the selftest renders to measure it: 'note' (one note at `root`),
            'chord' (root + major third + fifth) or 'hit' (one short note, by its peak)
     root   MIDI note of the measurement; by category when missing (ROOT_OF)
     play   one line: register, note or chord, what the wheel and the macros do
     data   the v2 preset: ENGINE SPACE (cutoff in Hz, times in s…), canonical
            PARAMS keys, only what deviates from PRESET_BASE (params.js)
   Conventions (docs/BANK.md): the WHEEL opens the filter in (almost) every
   preset (the vowel in voices); MACRO 1 is the character knob (drive, FM index,
   resonance, pulse width, material…); MACRO 2 a second layer or blend (sub,
   noise, ring, morph) where it adds something. Velocity matters everywhere.
   `FACTORY` ({category: {name: data}}) and `META` (name → entry) are derived
   from BANK: the library seeds from them and the scenes look presets up by name.
   cutLFO RULE: the dedicated cutoff LFO ADDS Hz (Voice.js), so cutoff − cutLfoLvl
   must stay ≥ ~150 Hz; the matrix's cutoff route is exponential and safe.
   BANK_REV: bump it whenever the bank changes — a library from an earlier
   revision follows the code (library.syncBank), keeping what the user touched.
   The bank up to 1.4.0 is archived in subsdj-bank-1.4.json.
   ===================================================================== */
import { PARAMS, posToVal } from './params.js';

export const BANK_REV = 4;   // 3: the sync recognises every historical version of the old factory (2 took older copies for edited ones); 4: it also clears the demo copies out of «★ Mine»

// Tag vocabulary. Search matches them; the selftest rejects any other.
export const TAGS = [
  'analog', 'digital', 'warm', 'bright', 'dark', 'soft', 'hard', 'metallic', 'glassy', 'airy', 'dirty', 'deep', 'wide',   // character
  'evolving', 'rhythmic', 'random', 'slow', 'short', 'long',                                                             // motion
  'chords', 'mono', 'arp', 'seq', 'drone', 'kit', 'expressive',                                                          // use
  'classic', 'cinematic', 'ambient', 'techno', 'trance', 'house', 'dub', 'berlin', 'synthwave', 'orchestral', 'world',   // style
  'fm', 'wavetable', 'string', 'vocal', 'noise', 'resonator', 'sync', 'fold',                                             // source
];
// Measurement register when the entry has no `root`: basses at C2, leads at C4, the rest at C3
export const ROOT_OF = { 'Bass': 36, 'Leads': 60 };
const WHEEL = (amt = 0.4) => ({ mx6src: 'wheel', mx6dst: 'cutoff', mx6amt: amt });   // slot 6 is the wheel's in the whole bank
const MAC1 = (dst, amt) => ({ mx5src: 'mac1', mx5dst: dst, mx5amt: amt });            // slot 5: Macro 1
const MAC2 = (dst, amt) => ({ mx4src: 'mac2', mx4dst: dst, mx4amt: amt });            // slot 4: Macro 2

export const BANK = [
  { cat: 'Basics', presets: [
    { name: 'Init', tags: [], use: 'note', play: 'Reset: oscillator A alone, filter open, gate envelope — the blank page.', data: {} },
  ] },

  /* ---------- Bass: one note at a time, C1-C3 ---------- */
  { cat: 'Bass', presets: [
    { name: 'Sub Bass', tags: ['analog', 'deep', 'soft', 'classic'], use: 'note',
      play: 'C1–C2, one note; sits under anything. Wheel: opens the filter · M2: more triangle on top.',
      data: { waveA: 'sine', waveB: 'triangle', levelA: 0.65, levelB: 0.35, cutoff: 448, reso: 1, a: 0.005, d: 0.2, s: 0.6, r: 0.15,
        ...WHEEL(0.5), ...MAC2('lvlB', 0.5), master: 2.59 } },
    /* the Minimoog bass: mono, legato glide, 24 dB ladder with drive and an RC decay */
    { name: 'Moog Bass', tags: ['analog', 'warm', 'mono', 'classic'], use: 'note',
      play: 'C1–C3, mono: overlapping notes glide. Wheel: opens the filter · M1: drive · M2: the sub square.',
      data: { mode: 'mono', monoTrig: 'legato', glide: 0.05, waveA: 'sawtooth', waveB: 'square', detuneB: 4, octB: -1, levelA: 0.6, levelB: 0.45,
        cutoff: 520, reso: 4, filterSlope: '24', filterDrive: 0.35, filterEnvAmt: 1800, envCurve: 0.8, a: 0.004, d: 0.35, s: 0.4, r: 0.18,
        ...WHEEL(0.4), ...MAC1('drive', 0.8), ...MAC2('lvlB', 0.5), master: 2.38 } },
    /* note→pulse width: wide (fat) at the bottom, narrow (nasal) at the top — the timbre
       changes across the keyboard, not only the brightness */
    { name: 'Funk Bass', tags: ['analog', 'short', 'bright', 'classic'], use: 'note',
      play: 'C1–C3, short notes; the pulse narrows as you go up. Wheel: opens the filter · M1: resonance.',
      data: { waveA: 'sawtooth', waveB: 'square', pulseWidth: 0.35, levelA: 0.6, levelB: 0.4, cutoff: 448, reso: 6, filterEnvAmt: 2600, envCurve: 0.85, keytrack: 0.3,
        a: 0.003, d: 0.22, s: 0.05, r: 0.13, mx1src: 'note', mx1dst: 'pw', mx1amt: -0.35,
        ...WHEEL(0.4), ...MAC1('reso', 0.5), master: 3.33 } },
    { name: 'Fat Saw Bass', tags: ['analog', 'warm', 'wide', 'synthwave'], use: 'note',
      play: 'C1–C2, two detuned saws with a little grit. Wheel: opens the filter · M1: drive.',
      data: { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -8, detuneB: 12, levelA: 0.5, levelB: 0.5, cutoff: 514, reso: 5, filterEnvAmt: 1500,
        filterDrive: 0.2, dist: 0.15, a: 0.005, d: 0.25, s: 0.35, r: 0.18, ...WHEEL(0.4), ...MAC1('drive', 0.8), master: 2.33 } },
    { name: 'Reese', tags: ['analog', 'dark', 'wide', 'dub'], use: 'note',
      play: 'C1–C2, long notes: the two saws beat against each other. Wheel: opens the filter · M1: resonance.',
      data: { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -22, detuneB: 22, levelA: 0.5, levelB: 0.5, cutoff: 364, reso: 3, dist: 0.1,
        a: 0.005, d: 0.3, s: 0.85, r: 0.2, width: 0.3, ...WHEEL(0.5), ...MAC1('reso', 0.5), master: 1.65 } },
    /* two-operator FM with velocity on the index: hit hard and the bass barks (the DX/TX bass) */
    { name: 'DX Bass', tags: ['fm', 'digital', 'bright', 'classic'], use: 'note',
      play: 'C1–C3; velocity opens the FM index. Wheel: opens the filter · M1: more index.',
      data: { waveA: 'sine', waveB: 'sine', levelA: 0.7, levelB: 0.3, fmRatio: 1, fmIndex: 1.2, fmFb: 0.15, cutoff: 1200, reso: 1,
        fenvMode: 'own', fa: 0.002, fd: 0.12, fs: 0, fr: 0.2, filterEnvAmt: 600, a: 0.003, d: 0.25, s: 0.3, r: 0.15,
        mx1src: 'vel', mx1dst: 'fm', mx1amt: 0.25, mx2src: 'env', mx2dst: 'fm', mx2amt: 0.15,
        ...WHEEL(0.3), ...MAC1('fm', 0.4), master: 1.72 } },
    /* FM growl (ratio ½, high index) + a saw LFO on the tempo grid through the matrix + flanger */
    { name: 'Neuro Bass', tags: ['fm', 'dirty', 'rhythmic', 'hard', 'dub'], use: 'note',
      play: 'C1–C2, hold it: the filter falls on every eighth. Wheel: opens the filter · M1: FM index.',
      data: { waveA: 'sine', waveB: 'sine', levelA: 0.7, levelB: 0.3, fmRatio: 0.5, fmIndex: 5, fmFb: 0.3, cutoff: 900, reso: 8, filterDrive: 0.5, dist: 0.3,
        cutLfoShape: 'sawtooth', cutLfoSync: '1/8', mx1src: 'lfoCut', mx1dst: 'cutoff', mx1amt: 0.35, flAmt: 0.25, flSpd: 0.4,
        a: 0.004, d: 0.3, s: 0.85, r: 0.15, ...WHEEL(0.4), ...MAC1('fm', 0.5), master: 1.14 } },
    { name: 'Plucked Bass', tags: ['string', 'warm', 'short', 'classic'], use: 'note',
      play: 'C1–C3, every note is a pluck; velocity is the strength. Wheel: opens the filter · M1: drive.',
      data: { waveA: 'string', octA: -1, levelA: 0.8, levelB: 0, strBright: 0.25, strDecay: 2.5, strPos: 0.2, cutoff: 3000, reso: 0.7, filterDrive: 0.15,
        a: 0, d: 0.05, s: 1, r: 0.15, ...WHEEL(0.5), ...MAC1('drive', 0.8), master: 2.03 } },
    /* the wobble on the clock (triangle LFO at 1/8) through the matrix — it never crosses 0 Hz —
       restarted by every note (retrig): the wobble always begins where the note does */
    { name: 'Dub Wobble', tags: ['analog', 'rhythmic', 'dirty', 'dub'], use: 'note',
      play: 'C1–C2, hold a note: it wobbles in eighths at the tempo, from the top. Wheel: opens the filter · M1: resonance · M2: sub.',
      data: { waveA: 'sawtooth', waveB: 'square', octB: -1, levelA: 0.6, levelB: 0.4, cutoff: 700, reso: 12, filterSlope: '24',
        cutLfoShape: 'triangle', cutLfoSync: '1/8', lfoPhase: 'retrig', mx1src: 'lfoCut', mx1dst: 'cutoff', mx1amt: 0.45, dist: 0.3,
        a: 0.005, d: 0.3, s: 0.8, r: 0.2, ...WHEEL(0.3), ...MAC1('reso', 0.4), ...MAC2('lvlB', 0.5), master: 1.63 } },
    /* hard sync: the filter envelope sweeps the slave's pitch and the sweep is timbre, not pitch */
    { name: 'Sync Bass', tags: ['analog', 'sync', 'hard', 'bright'], use: 'note',
      play: 'C1–C3, short notes: the sync sweep is the attack. Wheel: opens the filter · M1: slave pitch (the timbre).',
      data: { waveA: 'sawtooth', waveB: 'square', syncA: 'on', levelA: 0.85, levelB: 0.25, cutoff: 2500, reso: 2, filterDrive: 0.2,
        fenvMode: 'own', fa: 0.003, fd: 0.35, fs: 0.15, fr: 0.2, mx1src: 'env', mx1dst: 'pitchA', mx1amt: 0.7,
        a: 0.003, d: 0.3, s: 0.5, r: 0.15, ...WHEEL(0.3), ...MAC1('pitchA', 0.5), master: 2.01 } },
  ] },

  /* ---------- Leads: C3-C6, one note at a time ---------- */
  { cat: 'Leads', presets: [
    /* mono, legato glide, 24 dB, vibrato that comes in after half a second (lfoFade) */
    { name: 'Moog Lead', tags: ['analog', 'warm', 'mono', 'classic'], use: 'note',
      play: 'C3–C6, mono: overlapping notes glide; the vibrato fades in. Wheel: opens the filter · M1: drive.',
      data: { mode: 'mono', monoTrig: 'legato', glide: 0.07, waveA: 'sawtooth', waveB: 'sawtooth', detuneB: 8, levelA: 0.7, levelB: 0.3,
        cutoff: 1260, reso: 4, filterSlope: '24', filterDrive: 0.2, filterEnvAmt: 1500, freqLfoLvl: 9, freqLfoSpd: 5.5, lfoFade: 0.6,
        a: 0.005, d: 0.2, s: 0.7, r: 0.2, dlyAmt: 0.25, width: 0.3, ...WHEEL(0.5), ...MAC1('drive', 0.7), master: 1.77 } },
    { name: 'PWM Lead', tags: ['analog', 'bright', 'wide', 'classic'], use: 'note',
      play: 'C3–C6; two pulses with the width moving slowly. Wheel: opens the filter · M1: narrows the pulse.',
      data: { waveA: 'square', waveB: 'square', pulseWidth: 0.5, pwmLfoLvl: 0.3, pwmLfoSpd: 1.5, detuneB: 5, levelA: 0.5, levelB: 0.5,
        cutoff: 2890, reso: 2, a: 0.02, d: 0.2, s: 0.8, r: 0.3, width: 0.3, reverbMix: 0.15, ...WHEEL(0.4), ...MAC1('pw', -0.6), master: 0.94 } },
    { name: 'Supersaw Lead', tags: ['analog', 'wide', 'bright', 'trance'], use: 'note',
      play: 'C3–C6, with the dotted-eighth echo. Wheel: opens the filter · M1: resonance.',
      data: { waveA: 'supersaw', waveB: 'supersaw', spread: 0.7, detuneB: 5, levelA: 0.5, levelB: 0.5, cutoff: 5020, reso: 1.5, filterEnvAmt: 1500,
        a: 0.02, d: 0.35, s: 0.85, r: 0.45, dlyAmt: 0.28, dlySync: '1/8.', width: 0.7, reverbMix: 0.28, ...WHEEL(0.4), ...MAC1('reso', 0.3), master: 1.56 } },
    /* the Cars' lead: A synced to B, its own 1.2 s envelope sweeping the slave's pitch (timbre) */
    { name: 'Sync Lead', tags: ['analog', 'sync', 'hard', 'classic'], use: 'note',
      play: 'C3–C5: each note starts bright and settles (the sync sweep). Wheel: opens the filter · M1: slave pitch.',
      data: { waveA: 'sawtooth', waveB: 'square', syncA: 'on', levelA: 0.8, levelB: 0, cutoff: 7000, reso: 1,
        fenvMode: 'own', fa: 0.005, fd: 1.2, fs: 0.1, fr: 0.3, mx1src: 'env', mx1dst: 'pitchA', mx1amt: 1,
        a: 0.005, d: 0.9, s: 0.25, r: 0.3, reverbMix: 0.2, dlyAmt: 0.2, ...WHEEL(0.3), ...MAC1('pitchA', 0.6), master: 1.57 } },
    /* West Coast: a triangle through the wavefolder; velocity folds harder, the macro folds more */
    { name: 'Fold Lead', tags: ['fold', 'bright', 'hard', 'mono'], use: 'note',
      play: 'C3–C5, mono: play hard and the wave folds over. M1: fold amount · wheel: opens the filter.',
      data: { mode: 'mono', glide: 0.03, waveA: 'triangle', waveB: 'sine', octB: -1, levelA: 0.7, levelB: 0.3, filterDrive: 0.7, driveChar: 'fold', driveAsym: 0.3,
        cutoff: 9000, reso: 0, freqLfoLvl: 8, freqLfoSpd: 5, lfoFade: 0.5, a: 0.02, d: 0.5, s: 0.9, r: 0.4, reverbMix: 0.2, dlyAmt: 0.2,
        mx1src: 'vel', mx1dst: 'drive', mx1amt: 0.4, ...WHEEL(0.3), ...MAC1('drive', 0.8), master: 1.38 } },
    /* the Alpha Juno «hoover»: detuned saw + pulse an octave up, PWM, a pitch drop and chorus */
    { name: 'Hoover', tags: ['analog', 'dirty', 'wide', 'techno', 'classic'], use: 'note',
      play: 'C2–C4, chords too: every note dives in. Wheel: opens the filter · M1: pulse width.',
      data: { waveA: 'sawtooth', waveB: 'square', pulseWidth: 0.42, detuneA: -18, detuneB: 18, octavesB: 2, levelA: 0.5, levelB: 0.5,
        pwmLfoLvl: 0.25, pwmLfoSpd: 5, freqLfoLvl: 20, freqLfoSpd: 5.5, pitchEnvAmt: -700, pitchEnvDec: 0.18, cutoff: 2300, reso: 3,
        chAmt: 0.5, chSpd: 0.8, dist: 0.22, a: 0.01, d: 0.3, s: 0.75, r: 0.35, width: 0.5, reverbMix: 0.15, ...WHEEL(0.4), ...MAC1('pw', 0.5), master: 1.42 } },
    { name: 'Breath Flute', tags: ['soft', 'airy', 'mono', 'classic'], use: 'note',
      play: 'C4–C6, mono; the vibrato comes in late. Wheel: opens the filter · M1: more breath.',
      data: { mode: 'mono', waveA: 'sine', waveB: 'triangle', levelA: 0.6, levelB: 0.4, noise: 0.12, noiseColor: 0.6, freqLfoLvl: 14, freqLfoSpd: 5.3, lfoFade: 0.5,
        cutoff: 2890, a: 0.08, d: 0.1, s: 0.9, r: 0.2, reverbMix: 0.28, width: 0.2, ...WHEEL(0.3), ...MAC1('lvlNoise', 0.6), master: 1.16 } },
    /* glottal source through the formant bank: the wheel sweeps the vowel, Macro 1 the vocal effort */
    { name: 'Vox Lead', tags: ['vocal', 'wavetable', 'expressive', 'mono'], use: 'note',
      play: 'C3–C5, mono. Wheel: the vowel (u→i) · M1: effort (brighter glottis).',
      data: { mode: 'mono', glide: 0.04, waveA: 'wavetable', wtSet: 'glottal', wtPos: 0.25, levelA: 1, levelB: 0,
        vocAmt: 0.9, vocVowel: 0.45, vocQ: 0.55, vocLife: 0.4, vocBright: 0.7, freqLfoLvl: 10, freqLfoSpd: 5.2, lfoFade: 0.6,
        cutoff: 5000, reso: 0.8, a: 0.05, d: 0.3, s: 0.85, r: 0.3, reverbMix: 0.25,
        mx6src: 'wheel', mx6dst: 'vow', mx6amt: 0.5, ...MAC1('wt', 0.6), master: 2.55 } },
    /* the filter jumps to a random value on every eighth (S&H on the clock) and the pan follows it */
    { name: 'S&H Lead', tags: ['analog', 'random', 'rhythmic', 'techno'], use: 'note',
      play: 'C3–C5, hold a note: a new color and place on every eighth, locked to the echo. Wheel: opens the filter · M1: resonance.',
      data: { waveA: 'sawtooth', waveB: 'square', levelA: 0.7, levelB: 0.3, cutoff: 900, reso: 8, cutLfoShape: 'sh', cutLfoSync: '1/8', cutLfoLvl: 700, filterEnvAmt: 800,
        mx1src: 'lfoCut', mx1dst: 'pan', mx1amt: 0.5, a: 0.005, d: 0.2, s: 0.7, r: 0.15, dlyAmt: 0.25, dlySync: '1/8', ...WHEEL(0.3), ...MAC1('reso', 0.4), master: 1.31 } },
  ] },

  /* ---------- Brass & Strings: the polysynth sounds you play, chords and lines ---------- */
  { cat: 'Brass & Strings', presets: [
    { name: 'Juno Brass', tags: ['analog', 'warm', 'chords', 'classic'], use: 'chord',
      play: 'C2–C5 chords; the filter swells in on each note. Wheel: opens the filter · M1: drive.',
      data: { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -5, detuneB: 6, levelA: 0.5, levelB: 0.5, cutoff: 900, reso: 2, filterDrive: 0.15,
        filterEnvAmt: 2200, fenvMode: 'own', fa: 0.04, fd: 0.5, fs: 0.5, fr: 0.3, a: 0.03, d: 0.3, s: 0.8, r: 0.3,
        chAmt: 0.45, chSpd: 0.6, width: 0.4, reverbMix: 0.15, ...WHEEL(0.4), ...MAC1('drive', 0.6), master: 1.05 } },
    /* the «Jump» brass: saw + square in ×3 unison, 24 dB, a touch of drift */
    { name: 'OB Brass', tags: ['analog', 'wide', 'bright', 'chords', 'classic'], use: 'chord',
      play: 'C2–C5 big chords. Wheel: opens the filter · M1: drive.',
      data: { waveA: 'sawtooth', waveB: 'square', detuneB: 7, levelA: 0.5, levelB: 0.5, uniVoices: '3', uniDetune: 12, drift: 3,
        cutoff: 1200, reso: 1.5, filterSlope: '24', filterDrive: 0.1, filterEnvAmt: 2500, a: 0.02, d: 0.4, s: 0.7, r: 0.35,
        width: 0.6, reverbMix: 0.2, dlyAmt: 0.1, ...WHEEL(0.4), ...MAC1('drive', 0.6), master: 0.87 } },
    /* FM4 stack 4→3→2→1: the high modulators decay fast (bite), op 2 stays (body); feedback on op 4 */
    { name: 'FM Brass', tags: ['fm', 'digital', 'bright', 'chords', 'classic'], use: 'chord',
      play: 'C2–C5 chords or lines; the DX brass. Wheel: opens the filter · M1: drive.',
      data: { waveA: 'fm4', levelA: 1, levelB: 0, fm4Alg: '0', fmFb: 0.3,
        fm4R1: 1, fm4L1: 1, fm4D1: 4, fm4R2: 1, fm4L2: 0.55, fm4D2: 4, fm4R3: 1, fm4L3: 0.35, fm4D3: 0.4, fm4R4: 1, fm4L4: 0.3, fm4D4: 0.18,
        cutoff: 9000, filterDrive: 0.1, a: 0.05, d: 0.3, s: 0.8, r: 0.3, width: 0.3, reverbMix: 0.18, ...WHEEL(0.3), ...MAC1('drive', 0.6), master: 0.69 } },
    /* the house stab: own 220 ms filter envelope, unison, a small room */
    { name: 'Brass Stab', tags: ['analog', 'short', 'hard', 'chords', 'house'], use: 'chord',
      play: 'C2–C4 short chords, off-beat. Wheel: opens the filter · M1: resonance.',
      data: { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -9, detuneB: 11, octB: -1, levelA: 0.5, levelB: 0.5, uniVoices: '2', uniDetune: 10,
        cutoff: 800, reso: 3, filterEnvAmt: 3500, fenvMode: 'own', fa: 0.001, fd: 0.22, fs: 0.1, fr: 0.2, a: 0.002, d: 0.35, s: 0.3, r: 0.25, dist: 0.1,
        width: 0.6, reverbMix: 0.2, reverbSize: 1.2, ...WHEEL(0.4), ...MAC1('reso', 0.4), master: 1.41 } },
    /* the 90s «orchestra hit»: saw + square in ×3 unison with a pinch of noise, its own filter
       envelope closing in 250 ms, distortion, a short pitch drop and a small room */
    { name: 'Orchestra Hit', tags: ['hard', 'short', 'chords', 'orchestral', 'classic'], use: 'chord',
      play: 'C2–C4, one chord per hit. Wheel: opens the filter.',
      data: { waveA: 'sawtooth', waveB: 'square', octavesB: 2, uniVoices: '3', uniDetune: 18, levelA: 0.5, levelB: 0.5, noise: 0.12,
        pitchEnvAmt: 200, pitchEnvDec: 0.08, cutoff: 1500, reso: 2, filterEnvAmt: 4500, fenvMode: 'own', fa: 0.001, fd: 0.25, fs: 0.0, fr: 0.2,
        envCurve: 1, a: 0, d: 0.6, s: 0.0, r: 0.3, dist: 0.3, reverbMix: 0.25, reverbSize: 1.2, width: 0.6, amplitude: 1, ...WHEEL(0.3), master: 1.69 } },
    { name: 'Solina Strings', tags: ['analog', 'warm', 'wide', 'chords', 'classic'], use: 'chord',
      play: 'C2–C5 chords; the ensemble does the rest. Wheel: opens the filter.',
      data: { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -4, detuneB: 5, octavesB: 2, levelA: 0.65, levelB: 0.35,
        cutoff: 3600, reso: 0.7, morph: 0.12, chMode: 'ensemble', chAmt: 0.85, chSpd: 0.65, drift: 4,
        freqLfoLvl: 7, freqLfoSpd: 5.2, lfoFade: 0.7, a: 0.22, d: 0.3, s: 0.9, r: 0.9, width: 0.35, reverbMix: 0.22, reverbSize: 2.2, ...WHEEL(0.3), master: 0.94 } },
    { name: 'PWM Ensemble', tags: ['analog', 'warm', 'wide', 'chords', 'classic'], use: 'chord',
      play: 'C2–C5 chords; the Juno strings. Wheel: opens the filter · M1: narrows the pulse.',
      data: { waveA: 'square', waveB: 'square', pulseWidth: 0.45, pwmLfoLvl: 0.28, pwmLfoSpd: 0.7, lfoFade: 0.9, detuneB: 6, levelA: 0.5, levelB: 0.5,
        uniVoices: '3', uniDetune: 14, cutoff: 2800, reso: 1, chMode: 'ensemble', chAmt: 0.75, chSpd: 0.55, drift: 3,
        mx1src: 'lfoPwm', mx1dst: 'pan', mx1amt: 0.3,   // the PWM LFO also sways the chord across the stereo field
        a: 0.35, d: 0.4, s: 0.85, r: 1.1, width: 0.4, reverbMix: 0.25, ...WHEEL(0.3), ...MAC1('pw', 0.4), master: 0.52 } },
    { name: 'Pizzicato', tags: ['analog', 'short', 'chords', 'orchestral'], use: 'chord',
      play: 'C2–C5 short notes and chords. Wheel: opens the filter.',
      data: { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -4, detuneB: 5, levelA: 0.5, levelB: 0.5, cutoff: 2500, reso: 1,
        filterEnvAmt: 2500, fenvMode: 'own', fa: 0.001, fd: 0.08, fs: 0, fr: 0.1, a: 0.001, d: 0.18, s: 0, r: 0.12, envCurve: 0.8,
        chMode: 'ensemble', chAmt: 0.5, chSpd: 0.5, width: 0.4, reverbMix: 0.3, reverbSize: 2, ...WHEEL(0.3), master: 1.15 } },
  ] },

  /* ---------- Keys: keyboard instruments ---------- */
  { cat: 'Keys', presets: [
    /* 2-op FM with velocity on the index (hit hard and the tine barks) and a short own envelope for the attack */
    { name: 'Rhodes', tags: ['fm', 'warm', 'soft', 'chords', 'classic'], use: 'chord',
      play: 'C2–C6 chords; velocity brings out the tine. Wheel: opens the filter · M1: more index (bark).',
      data: { waveA: 'sine', waveB: 'sine', levelA: 0.6, levelB: 0.4, fmRatio: 1, fmIndex: 0.6, fenvMode: 'own', fa: 0.002, fd: 0.12, fs: 0, fr: 0.2,
        mx1src: 'vel', mx1dst: 'fm', mx1amt: 0.25, mx2src: 'env', mx2dst: 'fm', mx2amt: 0.15, cutoff: 4000, keytrack: 0.4,
        a: 0.002, d: 0.9, s: 0.25, r: 0.4, chAmt: 0.25, chSpd: 0.5, width: 0.3, reverbMix: 0.22, ...WHEEL(0.3), ...MAC1('fm', 0.3), master: 0.52 } },
    /* two FM pairs: 2→1 is the body (modulator 14 = the «tine»), 4→3 the hit; both modulators
       follow velocity: soft is round, hard brings the tine and the growl */
    { name: 'DX E-Piano', tags: ['fm', 'digital', 'bright', 'chords', 'classic'], use: 'chord',
      play: 'C2–C6; play soft for the round piano, hard for the DX bark. Wheel: opens the filter.',
      data: { waveA: 'fm4', levelA: 1, levelB: 0, fm4Alg: '1',
        fm4R1: 1, fm4L1: 1, fm4D1: 4, fm4R2: 14, fm4L2: 0.12, fm4D2: 0.1, fm4R3: 1, fm4L3: 0.7, fm4D3: 4, fm4R4: 1, fm4L4: 0.35, fm4D4: 0.6,
        fm4V2: 0.8, fm4V4: 0.7, cutoff: 9000, a: 0.002, d: 1.0, s: 0.2, r: 0.4, chAmt: 0.25, chSpd: 0.5, width: 0.35, reverbMix: 0.22, ...WHEEL(0.3), master: 0.75 } },
    { name: 'Clavinet', tags: ['analog', 'bright', 'short', 'classic'], use: 'chord',
      play: 'C2–C5, short notes; the filter follows the keyboard. Wheel: opens the filter · M1: resonance.',
      data: { waveA: 'square', pulseWidth: 0.22, waveB: 'sawtooth', levelA: 0.7, levelB: 0.3, cutoff: 1200, reso: 4, keytrack: 0.8,
        fenvMode: 'own', filterEnvAmt: 3200, fa: 0.001, fd: 0.09, fs: 0.15, fr: 0.08, dist: 0.1, a: 0.001, d: 0.4, s: 0.35, r: 0.08,
        width: 0.25, dlyAmt: 0.12, ...WHEEL(0.4), ...MAC1('reso', 0.4), master: 0.94 } },
    /* a plucked string near the bridge (the plectrum), a little stiff: the quill of a harpsichord */
    { name: 'Harpsichord', tags: ['string', 'bright', 'short', 'chords', 'classic'], use: 'chord',
      play: 'C2–C6; no dynamics, like the real one (velocity is the pluck). Wheel: opens the filter.',
      data: { waveA: 'string', levelA: 0.8, levelB: 0, strBright: 0.75, strDecay: 2.5, strPos: 0.07, strStiff: 0.35, uniVoices: '2', uniDetune: 3,
        cutoff: 12000, reso: 0.7, a: 0, d: 0.05, s: 1, r: 0.3, reverbMix: 0.22, reverbSize: 1.8, width: 0.35, ...WHEEL(0.3), master: 1.4 } },
    /* the organ table: the morph pulls the drawbars out (flute → full); fast chorus = the Leslie */
    { name: 'Drawbar Organ', tags: ['wavetable', 'warm', 'chords', 'classic'], use: 'chord',
      play: 'C2–C5 chords. M1: pulls the drawbars out · wheel: opens the filter.',
      data: { waveA: 'wavetable', waveB: 'wavetable', wtSet: 'organ', wtPos: 0.5, octavesB: 2, detuneB: 4, levelA: 0.65, levelB: 0.35,
        cutoff: 7100, a: 0.01, d: 0.05, s: 1, r: 0.15, chAmt: 0.5, chSpd: 5.5, ampLfoLvl: 0.12, ampLfoSpd: 6.5, dist: 0.08,
        width: 0.3, reverbMix: 0.15, ...WHEEL(0.3), ...MAC1('wt', 0.5), master: 0.88 } },
    { name: 'Church Organ', tags: ['soft', 'deep', 'chords', 'classic'], use: 'chord',
      play: 'C1–C5, sustained chords in a big room. Wheel: opens the filter.',
      data: { waveA: 'sine', waveB: 'sine', octavesA: 2, octavesB: 3, detuneB: 4, levelA: 0.5, levelB: 0.5, cutoff: 7100,
        a: 0.05, d: 0.1, s: 1.0, r: 0.4, width: 0.4, reverbMix: 0.45, reverbSize: 3.5, ...WHEEL(0.3), master: 0.96 } },
    { name: 'Vibraphone', tags: ['fm', 'metallic', 'soft', 'classic'], use: 'chord',
      play: 'C3–C6; the tremolo is the motor. Wheel: opens the filter · M1: harder mallet.',
      data: { waveA: 'sine', waveB: 'sine', levelA: 0.6, levelB: 0.4, fmRatio: 4, fmIndex: 1.2, keytrack: 0.6, ampLfoLvl: 0.4, ampLfoSpd: 4.5,
        cutoff: 4000, a: 0.002, d: 1.2, s: 0, r: 0.9, width: 0.4, reverbMix: 0.28, ...WHEEL(0.3), ...MAC1('fm', 0.3), master: 0.59 } },
    { name: 'Marimba', tags: ['fm', 'warm', 'short', 'classic'], use: 'chord',
      play: 'C3–C6, fast lines and rolls. Wheel: opens the filter · M1: harder mallet.',
      data: { waveA: 'sine', waveB: 'sine', levelA: 0.6, levelB: 0.4, fmRatio: 4, fmIndex: 1.1, cutoff: 2520,
        a: 0.002, d: 0.32, s: 0.0, r: 0.18, width: 0.3, reverbMix: 0.2, ...WHEEL(0.3), ...MAC1('fm', 0.3), master: 1.05 } },
    { name: 'Music Box', tags: ['glassy', 'soft', 'short', 'classic'], use: 'chord',
      play: 'C4–C7, single notes and little chords. Wheel: opens the filter · M1: more ring (metal).',
      data: { waveA: 'sine', waveB: 'sine', ring: 0.5, detuneB: 24, octavesB: 2, levelA: 0.25, levelB: 0.25, cutoff: 7100,
        a: 0.002, d: 0.8, s: 0.0, r: 0.6, dlyAmt: 0.3, dlyTime: 0.35, width: 0.4, reverbMix: 0.35, ...WHEEL(0.3), ...MAC1('lvlRing', 0.4), master: 1.68 } },
    { name: 'Accordion', tags: ['analog', 'warm', 'chords', 'world'], use: 'chord',
      play: 'C2–C5 chords and melodies; the reeds beat. Wheel: opens the filter.',
      data: { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -10, detuneB: 12, levelA: 0.5, levelB: 0.5, octavesB: 2, cutoff: 2200, reso: 1,
        chAmt: 0.5, chSpd: 3.5, freqLfoLvl: 6, freqLfoSpd: 5, a: 0.06, d: 0.1, s: 0.95, r: 0.15, width: 0.25, reverbMix: 0.15, ...WHEEL(0.3), master: 0.86 } },
    /* a 1-shot wave sequence: starts on the bright frame and settles on the soft one —
       «attack sample + synth body», the D-50 trick */
    { name: 'Digital Keys', tags: ['wavetable', 'digital', 'bright', 'chords', 'classic'], use: 'chord',
      play: 'C2–C6 chords; each note starts bright and settles. Wheel: opens the filter · M1: the body frame.',
      data: { waveA: 'wavetable', levelA: 1, levelB: 0, wtSet: 'analog', wtPos: 1, wsOn: 'on', wsMode: '1shot', wsPat: '7 5 1', wsDiv: '1/16', wsXf: 1,
        cutoff: 3500, reso: 1.5, a: 0.003, d: 0.5, s: 0.55, r: 0.3, dlyAmt: 0.2, dlyTime: 0.3, width: 0.3, reverbMix: 0.2, ...WHEEL(0.3), ...MAC1('wt', 0.5), master: 1.17 } },
  ] },

  /* ---------- Plucks & Bells ---------- */
  { cat: 'Plucks & Bells', presets: [
    /* each note is born with its own color and place (the same roll per voice) and the pulse width of
       the Steps lane 4 at that moment; the Mod env (RC curve) does the pluck of the filter */
    { name: 'Synth Pluck', tags: ['analog', 'short', 'random', 'trance'], use: 'chord',
      play: 'C3–C6, arpeggios and chords; every note a little different. Wheel: opens the filter · M1: resonance.',
      data: { waveA: 'square', waveB: 'sawtooth', pulseWidth: 0.35, levelA: 0.6, levelB: 0.4, cutoff: 600, reso: 6, filterEnvAmt: 1500, envCurve: 0.7,
        envmMode: 'normal', envmA: 0.002, envmD: 0.25, envmS: 0, envmR: 0.2, envmCurve: 0.7,
        mx1src: 'rnd', mx1dst: 'cutoff', mx1amt: 0.3, mx2src: 'rnd', mx2dst: 'pan', mx2amt: 0.7, mx3src: 'envm', mx3dst: 'cutoff', mx3amt: 0.45, mx4src: 'st4n', mx4dst: 'pw', mx4amt: 0.3,
        a: 0.002, d: 0.2, s: 0, r: 0.15, dlyAmt: 0.3, dlySync: '1/8.', width: 0.3, reverbMix: 0.2, ...WHEEL(0.4), ...MAC1('reso', 0.4), master: 1.15 } },
    /* String wave (Karplus-Strong): the envelope is a gate, the string dies on its own; the release is the hand muting it */
    { name: 'Nylon Guitar', tags: ['string', 'warm', 'soft', 'chords', 'classic'], use: 'chord',
      play: 'C2–C5, arpeggios; velocity is the pluck; releasing mutes the string.',
      data: { waveA: 'string', levelA: 0.8, levelB: 0, strBright: 0.3, strDecay: 2.5, strPos: 0.18,
        cutoff: 12000, reso: 0.7, a: 0, d: 0.05, s: 1, r: 0.35, reverbMix: 0.2, width: 0.3, master: 1.53 } },
    { name: 'Twelve-String', tags: ['string', 'bright', 'wide', 'chords', 'classic'], use: 'chord',
      play: 'C2–C5, strummed chords: every string doubled an octave up.',
      data: { waveA: 'string', levelA: 0.8, levelB: 0, strBright: 0.7, strDecay: 4, strPos: 0.1, uniVoices: '2', uniDetune: 6, octavesA: 2,
        cutoff: 12000, reso: 0.7, a: 0, d: 0.05, s: 1, r: 0.5, reverbMix: 0.2, width: 0.5, master: 1.89 } },
    { name: 'Harp', tags: ['string', 'soft', 'long', 'chords', 'orchestral'], use: 'chord',
      play: 'C2–C6, glissandi and arpeggios; the strings ring on after the key.',
      data: { waveA: 'string', levelA: 0.8, levelB: 0, strBright: 0.55, strDecay: 5, strPos: 0.3,
        cutoff: 12000, reso: 0.7, a: 0, d: 0.05, s: 1, r: 2.5, reverbMix: 0.35, width: 0.4, master: 1.41 } },
    { name: 'Koto', tags: ['string', 'bright', 'short', 'world'], use: 'note', root: 60,
      play: 'C3–C6, single notes plucked near the bridge, with a short echo.',
      data: { waveA: 'string', levelA: 0.8, levelB: 0, strBright: 0.6, strDecay: 2, strPos: 0.06,
        cutoff: 12000, reso: 0.7, a: 0, d: 0.05, s: 1, r: 0.6, dlyAmt: 0.2, dlyTime: 0.3, reverbMix: 0.2, width: 0.3, master: 2.54 } },
    /* FM ratio 7: the index RIDES the envelope (bright strike, pure tail) and follows velocity */
    { name: 'Glockenspiel', tags: ['fm', 'glassy', 'bright', 'short', 'orchestral'], use: 'note', root: 72,
      play: 'C4–C7, single notes; velocity is the mallet. M1: harder mallet.',
      data: { waveA: 'sine', waveB: 'sine', levelA: 0.6, levelB: 0.4, fmRatio: 7, fmIndex: 1.4, mx1src: 'env', mx1dst: 'fm', mx1amt: 0.4, mx2src: 'vel', mx2dst: 'fm', mx2amt: 0.2,
        a: 0.001, d: 0.5, s: 0.0, r: 0.4, dlyAmt: 0.2, dlySync: '1/8.', width: 0.4, reverbMix: 0.32, ...MAC1('fm', 0.3), master: 1.72 } },
    { name: 'Tubular Bells', tags: ['fm', 'metallic', 'long', 'orchestral', 'classic'], use: 'note', root: 60,
      play: 'C3–C5, one note at a time, let it ring. M1: harder strike.',
      data: { waveA: 'sine', waveB: 'sine', detuneB: 6, levelA: 0.55, levelB: 0.45, fmRatio: 1.41, fmIndex: 5,
        a: 0.003, d: 2.2, s: 0.0, r: 1.5, width: 0.45, reverbMix: 0.4, reverbSize: 3.2, ...MAC1('fm', 0.3), master: 1.12 } },
    /* three modulators in parallel with non-integer ratios: a dense inharmonic spectrum */
    { name: 'Crystal Bell', tags: ['fm', 'glassy', 'digital', 'long'], use: 'note', root: 72,
      play: 'C4–C7, single notes and slow arpeggios. Wheel: opens the filter.',
      data: { waveA: 'fm4', levelA: 1, levelB: 0, fm4Alg: '2',
        fm4R1: 1, fm4L1: 1, fm4D1: 4, fm4R2: 3.5, fm4L2: 0.45, fm4D2: 1.2, fm4R3: 5.19, fm4L3: 0.3, fm4D3: 0.8, fm4R4: 7.3, fm4L4: 0.2, fm4D4: 0.5,
        cutoff: 12000, a: 0.002, d: 2.2, s: 0, r: 1.6, dlyAmt: 0.2, dlySync: '1/4.', width: 0.5, reverbMix: 0.35, reverbSize: 2.8, ...WHEEL(0.3), master: 0.61 } },
    { name: 'Gong', tags: ['fm', 'metallic', 'long', 'dark', 'world'], use: 'note', root: 48,
      play: 'C1–C3, one note; the strike blooms and dies slowly. M1: harder strike.',
      data: { waveA: 'sine', waveB: 'sine', ring: 0.2, detuneB: 20, levelA: 0.4, levelB: 0.4, fmRatio: 2.74, fmIndex: 8,
        a: 0.005, d: 2.5, s: 0.0, r: 2.0, cutLfoLvl: 1500, cutLfoSpd: 0.2, width: 0.5, reverbMix: 0.42, reverbSize: 3.5, ...MAC1('fm', 0.3), master: 1.57 } },
  ] },

  /* ---------- Pads: slow, for chords ---------- */
  { cat: 'Pads', presets: [
    /* S&H→pitch: each note is born ±14 ct off, like an analog poly whose oscillators never quite agree */
    { name: 'Warm Pad', tags: ['analog', 'warm', 'slow', 'chords', 'classic'], use: 'chord',
      play: 'C2–C5 chords, held. Wheel: opens the filter · M2: more of the upper saw.',
      data: { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -10, detuneB: 14, octavesB: 2, levelA: 0.5, levelB: 0.5,
        cutoff: 1180, reso: 2, cutLfoLvl: 800, cutLfoSpd: 0.2, mx1src: 'rnd', mx1dst: 'pitch', mx1amt: 0.012, a: 0.8, d: 0.5, s: 0.8, r: 2.0,
        dlyAmt: 0.3, dlyTime: 0.5, width: 0.6, reverbMix: 0.32, reverbSize: 2.6, ...WHEEL(0.4), ...MAC2('lvlB', 0.4), master: 1.01 } },
    { name: 'Glass Pad', tags: ['glassy', 'soft', 'slow', 'chords'], use: 'chord',
      play: 'C3–C6 open chords. Wheel: opens the filter · M1: more ring (glassier).',
      data: { waveA: 'sine', waveB: 'sine', ring: 0.3, detuneB: 12, octavesB: 2, levelA: 0.35, levelB: 0.35, cutoff: 5020,
        a: 0.5, d: 0.6, s: 0.7, r: 1.5, width: 0.5, reverbMix: 0.4, reverbSize: 3.2, ...WHEEL(0.3), ...MAC1('lvlRing', 0.5), master: 1.3 } },
    { name: 'Cathedral Pad', tags: ['warm', 'deep', 'slow', 'chords', 'cinematic'], use: 'chord',
      play: 'C2–C4 low chords in a long room. Wheel: opens the filter.',
      data: { waveA: 'sawtooth', waveB: 'triangle', detuneA: -6, detuneB: 8, octavesB: 2, levelA: 0.55, levelB: 0.45,
        cutoff: 1600, reso: 1, filterSlope: '24', chMode: 'ensemble', chAmt: 0.5, chSpd: 0.5, drift: 3, a: 0.7, d: 0.6, s: 0.85, r: 2.2, width: 0.6,
        reverbMix: 0.42, reverbSize: 3.6, reverbDamp: 0.6, reverbPre: 0.04, ...WHEEL(0.3), master: 0.91 } },
    /* the formant table with env→morph: each note sweeps through the vowels as it swells */
    { name: 'Vowel Choir', tags: ['wavetable', 'vocal', 'slow', 'chords'], use: 'chord',
      play: 'C3–C5 chords; the vowels open with each note. Wheel: opens the filter · M1: the vowel frame.',
      data: { waveA: 'wavetable', waveB: 'wavetable', detuneA: -5, detuneB: 7, levelA: 0.5, levelB: 0.5, wtSet: 'formant', wtPos: 0.2,
        mx1src: 'env', mx1dst: 'wt', mx1amt: 0.5, cutoff: 4000, a: 0.8, d: 0.6, s: 0.8, r: 2.0, chMode: 'ensemble', chAmt: 0.5, chSpd: 0.5,
        width: 0.6, reverbMix: 0.35, reverbSize: 3, ...WHEEL(0.3), ...MAC1('wt', 0.5), master: 1.5 } },
    /* ONE slow drift LFO per voice moving the filter, the pan and ±14 ct at once: the chord breathes voice by voice */
    { name: 'Breathing Pad', tags: ['analog', 'evolving', 'slow', 'chords', 'ambient'], use: 'chord',
      play: 'C2–C5, hold a chord and wait: each note wanders on its own. Wheel: opens the filter.',
      data: { waveA: 'sawtooth', waveB: 'triangle', detuneA: -6, detuneB: 8, levelA: 0.5, levelB: 0.5, cutoff: 1200, reso: 2,
        cutLfoShape: 'drift', cutLfoSpd: 0.08, lfoPhase: 'voice', mx1src: 'lfoCut', mx1dst: 'cutoff', mx1amt: 0.35, mx2src: 'lfoCut', mx2dst: 'pan', mx2amt: 0.6,
        mx3src: 'lfoCut', mx3dst: 'pitch', mx3amt: 0.012, resLfoLvl: 4, resLfoSpd: 0.1, a: 0.8, d: 0.5, s: 0.85, r: 2.0,
        width: 0.5, chMode: 'ensemble', chAmt: 0.4, chSpd: 0.4, reverbMix: 0.35, reverbSize: 3, ...WHEEL(0.3), master: 0.88 } },
    { name: 'Supersaw Pad', tags: ['analog', 'wide', 'bright', 'chords', 'trance'], use: 'chord',
      play: 'C2–C5 wide chords. Wheel: opens the filter.',
      data: { waveA: 'supersaw', waveB: 'supersaw', spread: 0.7, detuneB: 6, levelA: 0.5, levelB: 0.5, cutoff: 1260, reso: 1.5,
        a: 0.6, d: 0.5, s: 0.85, r: 1.8, width: 0.7, reverbMix: 0.35, reverbSize: 3, ...WHEEL(0.4), master: 0.8 } },
    /* notch filter (LP + HP in parallel, an exact zero at the cutoff) swept by the LFO: a single-notch phaser */
    { name: 'Phaser Pad', tags: ['analog', 'evolving', 'slow', 'chords', 'synthwave'], use: 'chord',
      play: 'C2–C5 chords; the notch sweeps through them. Wheel: moves the notch · M1: narrower notch.',
      data: { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -7, detuneB: 9, levelA: 0.5, levelB: 0.5, cutoff: 1100, reso: 4, filterType: 'notch',
        cutLfoLvl: 700, cutLfoSpd: 0.25, a: 0.5, d: 0.5, s: 0.8, r: 1.2, width: 0.45, reverbMix: 0.25, ...WHEEL(0.3), ...MAC1('reso', 0.5), master: 0.93 } },
    /* looping wave sequence: a HELD chord is a timbral groove at the BPM; each voice offsets its phrase */
    { name: 'Wave Sequence Pad', tags: ['wavetable', 'digital', 'rhythmic', 'chords', 'classic'], use: 'chord',
      play: 'C3–C5, hold a chord: the timbre steps through the table in sixteenths. Wheel: opens the filter.',
      data: { waveA: 'wavetable', waveB: 'wavetable', detuneA: -5, detuneB: 7, levelA: 0.5, levelB: 0.5, wtSet: 'metallic', wtPos: 0,
        wsOn: 'on', wsPat: '0 . 7 . 3 5 7 2', wsDiv: '1/16', wsXf: 0.3, cutoff: 5000, reso: 1, a: 0.15, d: 0.4, s: 0.85, r: 1.5,
        dlySync: '1/8', dlyAmt: 0.25, width: 0.5, reverbMix: 0.3, reverbSize: 2.6, ...WHEEL(0.3), master: 1.05 } },
    /* its own slow filter envelope (1.8 s up, 1 s down to 85 %): the Jupiter sweep on every chord */
    { name: 'Dawn Pad', tags: ['analog', 'bright', 'evolving', 'chords', 'cinematic'], use: 'chord',
      play: 'C2–C5 chords: each one opens over two seconds. Wheel: opens the filter.',
      data: { waveA: 'supersaw', spread: 0.5, waveB: 'sawtooth', detuneB: -7, octavesB: 2, levelA: 0.65, levelB: 0.35, cutoff: 500, reso: 1.5,
        fenvMode: 'own', filterEnvAmt: 3500, fa: 1.8, fd: 1, fs: 0.85, fr: 2, a: 1.2, d: 0.5, s: 0.85, r: 2.5, chAmt: 0.5, chSpd: 0.4,
        width: 0.7, reverbMix: 0.4, reverbSize: 3.5, ...WHEEL(0.3), master: 0.76 } },
    /* vector synthesis: a per-voice triangle LFO lowers A (saw) while it raises B (sine an octave up) */
    { name: 'Vector Pad', tags: ['analog', 'evolving', 'slow', 'chords'], use: 'chord',
      play: 'C2–C5, hold a chord: it crossfades between the saw and the sine, voice by voice. Wheel: opens the filter · M1: more sine.',
      data: { waveA: 'sawtooth', waveB: 'sine', octB: 1, detuneB: 7, levelA: 0.5, levelB: 0.5, cutoff: 4000, reso: 1, a: 0.3, d: 1, s: 0.8, r: 1.2,
        cutLfoShape: 'triangle', cutLfoSpd: 0.25, lfoPhase: 'voice', mx1src: 'lfoCut', mx1dst: 'lvlA', mx1amt: -0.5, mx2src: 'lfoCut', mx2dst: 'lvlB', mx2amt: 0.5,
        reverbMix: 0.3, width: 0.5, ...WHEEL(0.3), ...MAC1('lvlB', 0.5), master: 0.65 } },
  ] },

  /* ---------- Cinescape: sounds at the scale of the landscape (times ×10, octave per oscillator) ---------- */
  { cat: 'Cinescape', presets: [
    /* 12 s attack, 25 s release, its own filter env even slower (8 s) and a cutoff drift at 0.02 Hz:
       hold a chord and wait, it comes in from nothing */
    { name: 'Glacier Pad', tags: ['slow', 'long', 'evolving', 'chords', 'cinematic'], use: 'chord',
      play: 'C2–C4, hold a chord for 15 seconds: it arrives from nothing and takes half a minute to leave. Wheel: opens the filter.',
      data: { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -7, detuneB: 9, octB: -1, levelA: 0.55, levelB: 0.45, uniVoices: '3', uniDetune: 10, drift: 4,
        cutoff: 700, reso: 1.2, filterSlope: '24', fenvMode: 'own', filterEnvAmt: 900, fa: 8, fd: 6, fs: 0.5, fr: 20,
        cutLfoShape: 'drift', cutLfoLvl: 250, cutLfoSpd: 0.02, a: 12, d: 4, s: 1, r: 25, envCurve: 0.4, width: 0.6, chMode: 'ensemble', chAmt: 0.35, chSpd: 0.25,
        reverbType: 'plate', reverbMix: 0.5, reverbSize: 14, reverbDamp: 0.4, reverbPre: 0.06, ...WHEEL(0.3), master: 0.79 } },
    /* A two octaves down (C3 → 32 Hz), B a sine one down; mono with a 3 s glide: the new note SLIDES */
    { name: 'Basement Drone', tags: ['deep', 'dark', 'drone', 'mono', 'cinematic'], use: 'note', root: 36,
      play: 'C2–C4, one note; the next one slides down to it over three seconds. Wheel: opens the filter · M1: drive.',
      data: { waveA: 'sawtooth', octA: -2, waveB: 'sine', octB: -1, levelA: 0.6, levelB: 0.4, drift: 6,
        cutoff: 420, reso: 3, filterSlope: '24', filterDrive: 0.15, cutLfoShape: 'drift', cutLfoLvl: 200, cutLfoSpd: 0.03,
        mode: 'mono', glide: 3, a: 4, d: 2, s: 1, r: 12, envCurve: 0.3, width: 0, dist: 0.2,
        reverbType: 'plate', reverbMix: 0.35, reverbSize: 9, reverbDamp: 0.6, ...WHEEL(0.4), ...MAC1('drive', 0.7), master: 1.44 } },
    /* per-voice Drift to the cutoff and the pan at 0.04 Hz, a per-voice vibrato with a 4 s fade:
       four notes, four winds, each one opens, closes and strolls across the stereo field at its own pace */
    { name: 'Four Winds', tags: ['evolving', 'slow', 'wide', 'chords', 'ambient'], use: 'chord',
      play: 'C2–C4 chords, hold them a minute. Wheel: opens the filter.',
      data: { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -6, detuneB: 8, octB: -1, levelA: 0.55, levelB: 0.45, uniVoices: '2', uniDetune: 8,
        cutoff: 750, reso: 1.5, filterSlope: '24', mx1src: 'drift', mx1dst: 'cutoff', mx1amt: 0.4, mx2src: 'drift', mx2dst: 'pan', mx2amt: 0.8, mxDriftSpd: 0.04,
        lfoPhase: 'voice', freqLfoLvl: 5, freqLfoSpd: 0.15, lfoFade: 4, a: 6, d: 3, s: 1, r: 15, envCurve: 0.4, width: 0.3, chMode: 'ensemble', chAmt: 0.3, chSpd: 0.3,
        reverbType: 'plate', reverbMix: 0.45, reverbSize: 12, reverbDamp: 0.4, reverbPre: 0.05, ...WHEEL(0.3), master: 0.76 } },
    /* shimmer: the tail re-enters the plate an octave up on every pass and turns into a rising choir;
       play a low note, release it and hear it rise on its own (❄ Freeze holds it there) */
    { name: 'Shimmer Choir', tags: ['long', 'evolving', 'airy', 'ambient', 'cinematic'], use: 'chord',
      play: 'C2–C4, play a chord and let go: the tail climbs on its own. Wheel: opens the filter.',
      data: { waveA: 'sawtooth', waveB: 'triangle', detuneA: -5, detuneB: 7, octB: -1, levelA: 0.6, levelB: 0.4, cutoff: 1200, reso: 1, filterSlope: '24', drift: 3,
        a: 1.5, d: 2, s: 0.9, r: 6, envCurve: 0.3, width: 0.5, chMode: 'ensemble', chAmt: 0.3, chSpd: 0.3,
        reverbType: 'plate', reverbMix: 0.55, reverbSize: 8, reverbDamp: 0.3, reverbPre: 0.03, shimAmt: 0.7, shimInt: '+12', ...WHEEL(0.3), master: 0.92 } },
    /* performance sources: the wheel opens the filter two octaves, pressure adds resonance and the
       expression pedal turns it down — at rest it is a dark, still pad */
    { name: 'Expressive Pad', tags: ['expressive', 'dark', 'slow', 'chords', 'cinematic'], use: 'chord',
      play: 'C2–C4 chords and PLAY them: wheel opens two octaves, aftertouch adds resonance, the pedal (CC11) fades it out.',
      data: { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -6, detuneB: 8, octB: -1, levelA: 0.55, levelB: 0.45, cutoff: 450, reso: 1.5, filterSlope: '24', lfoPhase: 'voice',
        mx1src: 'wheel', mx1dst: 'cutoff', mx1amt: 0.5, mx2src: 'at', mx2dst: 'reso', mx2amt: 0.6, mx3src: 'expr', mx3dst: 'amp', mx3amt: -0.8,
        mx4src: 'drift', mx4dst: 'pan', mx4amt: 0.5, mxDriftSpd: 0.05,
        a: 2, d: 2, s: 1, r: 8, envCurve: 0.3, width: 0.4, chMode: 'ensemble', chAmt: 0.3, chSpd: 0.3,
        reverbType: 'plate', reverbMix: 0.4, reverbSize: 8, reverbDamp: 0.3, master: 0.88 } },
    /* tape on the master: soft saturation that glues and wow that makes the pitch of everything wander */
    { name: 'Nostalgia Tape', tags: ['warm', 'dirty', 'slow', 'chords', 'ambient'], use: 'chord',
      play: 'C2–C4 chords; the whole mix goes through a worn tape. Wheel: opens the filter.',
      data: { waveA: 'sawtooth', waveB: 'triangle', detuneA: -5, detuneB: 7, octB: -1, levelA: 0.6, levelB: 0.4, cutoff: 900, reso: 1, filterSlope: '24', lfoPhase: 'voice', drift: 3,
        mx1src: 'drift', mx1dst: 'pan', mx1amt: 0.5, mxDriftSpd: 0.05, a: 1.2, d: 2, s: 0.9, r: 6, envCurve: 0.3, width: 0.5, chMode: 'ensemble', chAmt: 0.25, chSpd: 0.3,
        reverbType: 'plate', reverbMix: 0.4, reverbSize: 6, reverbDamp: 0.4, reverbPre: 0.03, tapeSat: 0.5, tapeWow: 0.5, ...WHEEL(0.3), master: 1.7 } },
    /* a modal resonator excited by noise: six bowl modes tuned to the note, high Q — it takes a while to sing */
    { name: 'Singing Bowl', tags: ['resonator', 'metallic', 'slow', 'drone', 'world'], use: 'chord',
      play: 'C3–C5, hold a note or two and wait for them to sing. M1: material (towards a string) · wheel: opens the filter.',
      data: { waveA: 'sine', levelA: 1, levelB: 0, noise: 1, noiseColor: 0.2, resAmt: 1, resMat: 1, resDecay: 0.85, resBright: 0.45, cutoff: 9000, reso: 0.7, lfoPhase: 'voice',
        mx1src: 'drift', mx1dst: 'pan', mx1amt: 0.6, mxDriftSpd: 0.05, a: 1.5, d: 2, s: 1, r: 12, envCurve: 0.3, width: 0.3,
        reverbType: 'plate', reverbMix: 0.5, reverbSize: 10, reverbDamp: 0.3, reverbPre: 0.04, ...WHEEL(0.3), ...MAC1('resMat', -0.5), master: 0.49 } },
    /* a saw through a resonator halfway between string and bar (inharmonic like a prepared piano): humming metal */
    { name: 'Bowed Metal', tags: ['resonator', 'metallic', 'dark', 'chords', 'cinematic'], use: 'chord',
      play: 'C2–C4 slow chords. M1: material (towards a bar) · wheel: opens the filter.',
      data: { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -4, detuneB: 5, octB: -1, levelA: 0.6, levelB: 0.4, noise: 0.25, noiseColor: -0.2,
        resAmt: 0.75, resMat: 0.55, resDecay: 0.6, resBright: 0.6, filterDrive: 0.25, cutoff: 2500, reso: 1, filterSlope: '24',
        a: 0.8, d: 1.5, s: 0.9, r: 6, envCurve: 0.3, width: 0.5, chMode: 'ensemble', chAmt: 0.2, chSpd: 0.3,
        reverbType: 'plate', reverbMix: 0.4, reverbSize: 7, reverbDamp: 0.4, ...WHEEL(0.3), ...MAC1('resMat', 0.5), master: 2.79 } },
    /* FM pad with a half-note echo, slow autopan and shimmer at the FIFTH: the tail turns into a dense
       choir; the LFOs run ONCE per note (an 11 s swell of the filter, one pass of the pan) and stay */
    { name: 'Interstellar', tags: ['fm', 'glassy', 'long', 'evolving', 'cinematic'], use: 'chord',
      play: 'C3–C5 sparse notes, let the echoes and the fifths pile up. Wheel: opens the filter · M1: more index.',
      data: { waveA: 'sine', waveB: 'sine', levelA: 0.55, levelB: 0.45, fmRatio: 3.5, fmIndex: 2.5, detuneB: 5, cutoff: 3500, cutLfoLvl: 1200, cutLfoSpd: 0.09, lfoPhase: 'once',
        a: 0.8, d: 0.8, s: 0.8, r: 3, dlyAmt: 0.45, dlySync: '1/2', bpm: 84, panLfoLvl: 0.6, panLfoSpd: 0.07, width: 0.5,
        reverbType: 'plate', reverbMix: 0.45, reverbSize: 8, shimAmt: 0.5, shimInt: '+7', ...WHEEL(0.3), ...MAC1('fm', 0.4), master: 0.62 } },
  ] },

  /* ---------- Motion: the sequencer, the arpeggiator, Steps and the looping envelope do the playing ---------- */
  { cat: 'Motion', presets: [
    /* the 303 line: accents («!») hit the filter through the matrix, slides («/») glide into the next step */
    { name: 'Acid Line', tags: ['analog', 'seq', 'mono', 'rhythmic', 'techno', 'classic'], use: 'note', root: 36,
      play: 'Hold one key (C1–C2): the phrase plays with accents and slides. Wheel: opens the filter · M1: resonance · M2: drive.',
      data: { mode: 'mono', monoTrig: 'legato', glide: 0, waveA: 'sawtooth', levelA: 0.9, levelB: 0, cutoff: 450, reso: 9, filterEnvAmt: 1800,
        a: 0.002, d: 0.2, s: 0.25, r: 0.08, filterDrive: 0.3, seqOn: 'on', seqDiv: '1/16', seqGate: 0.5, bpm: 128,
        seqPat: '0! 0 12/ 0 3 0! 10/ 7 0 0! 3/ 7 12 10! 7/ 0', swing: 0.56, dlyAmt: 0.25, dlySync: '1/8.',
        mx1src: 'acc', mx1dst: 'cutoff', mx1amt: 0.45, ...WHEEL(0.4), ...MAC1('reso', 0.5), ...MAC2('drive', 0.6), master: 2.16 } },
    /* Berlin school: a sixteenth-note phrase with the dotted-eighth echo; Steps lane 1 moves the filter step by step */
    { name: 'Berlin Sequence', tags: ['analog', 'seq', 'mono', 'rhythmic', 'berlin', 'classic'], use: 'note',
      play: 'Hold one key (C2–C3): the sequence runs, the filter steps with it. Wheel: opens the filter · M1: resonance.',
      data: { mode: 'mono', waveA: 'sawtooth', waveB: 'square', octB: -1, levelA: 0.7, levelB: 0.3, cutoff: 700, reso: 5, filterEnvAmt: 2200,
        a: 0.002, d: 0.18, s: 0.2, r: 0.1, seqOn: 'on', seqDiv: '1/16', seqGate: 0.45, seqPat: '0 12 7~ 7 0 12x2 10 12 3 15~ 15 10 0 12 7x2 12', bpm: 120,
        mx1src: 'st1', mx1dst: 'cutoff', mx1amt: 0.35, dlyAmt: 0.35, dlySync: '1/8.', dlyDamp: 0.3, dlyFb: 0.55, reverbMix: 0.15,
        ...WHEEL(0.4), ...MAC1('reso', 0.4), master: 1.44 } },
    /* the Steps lane 1 (16 steps, read when each note starts) accents the arpeggio's filter */
    { name: 'Uplift Arp', tags: ['analog', 'arp', 'bright', 'rhythmic', 'trance'], use: 'chord',
      play: 'Hold a chord (C3–C5): up-down arpeggio over two octaves, accented in sixteens. Wheel: opens the filter.',
      data: { arpMode: 'updown', arpDiv: '1/16', arpOct: '2', arpGate: 0.45, bpm: 138, waveA: 'supersaw', spread: 0.6, waveB: 'supersaw', detuneB: 4, levelA: 0.6, levelB: 0.4,
        cutoff: 1600, reso: 2.5, filterEnvAmt: 2800, mx1src: 'st1n', mx1dst: 'cutoff', mx1amt: 0.4,
        a: 0.002, d: 0.16, s: 0, r: 0.14, dlyAmt: 0.32, dlySync: '1/8.', width: 0.6, reverbMix: 0.22, ...WHEEL(0.4), master: 1.41 } },
    /* bells falling over three octaves; the Steps lane 2 (12 steps) places each bell in the stereo field */
    { name: 'Crystal Arp', tags: ['glassy', 'arp', 'soft', 'ambient'], use: 'chord', root: 60,
      play: 'Hold a chord (C4–C6): bells falling over three octaves with the dotted-quarter echo. Wheel: opens the filter.',
      data: { arpMode: 'down', arpDiv: '1/8', arpOct: '3', arpGate: 0.4, bpm: 96, waveA: 'sine', waveB: 'sine', ring: 0.45, detuneB: 18, octavesB: 2, levelA: 0.275, levelB: 0.275,
        mx1src: 'st2n', mx1dst: 'pan', mx1amt: 0.7,
        cutoff: 6500, a: 0.002, d: 0.5, s: 0, r: 0.5, dlyAmt: 0.35, dlySync: '1/4.', width: 0.5, reverbMix: 0.4, reverbSize: 3.2, ...WHEEL(0.3), master: 1.13 } },
    /* the Steps lane 3 (5 steps) against the eighths: the accent lands somewhere else every bar */
    { name: 'Motorik Bass', tags: ['analog', 'arp', 'rhythmic', 'mono', 'berlin'], use: 'note', root: 36,
      play: 'Hold a key or two (C1–C2): eighth-note bass that never stops, accented in fives. Wheel: opens the filter.',
      data: { arpMode: 'up', arpDiv: '1/8', arpOct: '2', arpGate: 0.6, bpm: 124, waveA: 'sawtooth', waveB: 'square', pulseWidth: 0.4, levelA: 0.55, levelB: 0.45,
        cutoff: 520, reso: 5, filterEnvAmt: 1800, keytrack: 0.4, mx1src: 'st3n', mx1dst: 'cutoff', mx1amt: 0.3,
        a: 0.002, d: 0.2, s: 0.2, r: 0.1, dist: 0.12, ...WHEEL(0.4), master: 2.11 } },
    /* Steps lane 4 → Amplitude: the gate pattern is written, not an LFO (0 = sounds, −1 = silence) */
    { name: 'Trance Gate', tags: ['analog', 'rhythmic', 'wide', 'chords', 'trance'], use: 'chord',
      play: 'Hold a chord (C2–C4): the gate chops it in sixteenths. Wheel: opens the filter.',
      data: { waveA: 'supersaw', spread: 0.6, waveB: 'supersaw', levelA: 0.6, levelB: 0.4, cutoff: 2200, reso: 1.5, a: 0.01, d: 0.2, s: 0.9, r: 0.3,
        bpm: 138, st4Pat: '0 -1 0 -1 0 0 -1 0 0 -1 0 -1 0 -1 0 0', st4Div: '1/16', st4Smooth: 0.08, mx1src: 'st4', mx1dst: 'amp', mx1amt: 1,
        dlyAmt: 0.3, dlySync: '1/8', width: 0.6, reverbMix: 0.25, ...WHEEL(0.4), master: 1.08 } },
    /* the looping Mod env ducks the amplitude on every cycle: the sidechain pump without a compressor */
    { name: 'Pumping Pad', tags: ['analog', 'rhythmic', 'warm', 'chords', 'house'], use: 'chord',
      play: 'Hold a chord (C2–C4): it pumps about twice a second. Wheel: opens the filter.',
      data: { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -8, detuneB: 8, octB: -1, levelA: 0.5, levelB: 0.5, cutoff: 1100, a: 0.05, d: 0.3, s: 0.9, r: 0.4,
        chAmt: 0.35, width: 0.5, reverbMix: 0.25, envmMode: 'loop', envmA: 0.015, envmD: 0.47, envmCurve: 0.7, mx1src: 'envm', mx1dst: 'amp', mx1amt: -0.85,
        bpm: 120, ...WHEEL(0.3), master: 1.08 } },
    /* four Steps lanes of different lengths (16 · 12 · 5 · 8) to the filter, the pan, B's level and the
       pulse width: dumb and regular each, together they do not line up for 240 sixteenths */
    { name: 'Polymeter Steps', tags: ['analog', 'rhythmic', 'evolving', 'chords', 'techno'], use: 'chord',
      play: 'Hold a chord (C2–C4) and listen for a minute: the four cycles never quite repeat. Wheel: opens the filter.',
      data: { waveA: 'sawtooth', waveB: 'square', detuneB: 8, levelA: 0.5, levelB: 0.4, cutoff: 1400, reso: 5, a: 0.2, d: 0.6, s: 0.85, r: 1, bpm: 118,
        mx1src: 'st1', mx1dst: 'cutoff', mx1amt: 0.4, mx2src: 'st2', mx2dst: 'pan', mx2amt: 0.7, mx3src: 'st3', mx3dst: 'lvlB', mx3amt: 0.35, mx4src: 'st4', mx4dst: 'pw', mx4amt: 0.3,
        st3Drift: '2 bars', reverbMix: 0.25, dlyAmt: 0.15, dlySync: '1/8.', ...WHEEL(0.3), master: 0.67 } },
    /* a Steps lane as a pitch sequencer: values in twelfths × 1200 ct = exact semitones (0 3 7 12 7 3 10 7);
       a second lane of 7 steps gates the notes against the 8 of the melody */
    { name: 'Steps Melody', tags: ['analog', 'rhythmic', 'seq', 'bright', 'berlin'], use: 'note',
      play: 'Hold one key (C2–C4): the Steps play a minor-pentatonic figure in eighths, gated in sevens. Wheel: opens the filter.',
      data: { waveA: 'square', pulseWidth: 0.3, waveB: 'triangle', octB: 1, levelA: 0.7, levelB: 0.3, cutoff: 2400, reso: 4, a: 0.01, d: 0.2, s: 0.9, r: 0.5, bpm: 120,
        st1Pat: '0 0.25 0.58333 1 0.58333 0.25 0.83333 0.58333', st1Div: '1/8', st2Pat: '0 0 1 0 0 1 0', st2Div: '1/16',
        mx1src: 'st1', mx1dst: 'pitch', mx1amt: 1, mx2src: 'st2', mx2dst: 'amp', mx2amt: -0.9,
        dlyAmt: 0.35, dlySync: '1/8.', dlyDamp: 0.4, reverbMix: 0.2, ...WHEEL(0.3), master: 1.07 } },
    /* per-voice S&H LFOs: each note of the chord jumps on its own — the vowel in eighths, the filter in triplets */
    { name: 'Talking Chord', tags: ['vocal', 'random', 'rhythmic', 'chords', 'techno'], use: 'chord',
      play: 'Hold three or four notes (C3–C5): a choir of machines talking in steps. Wheel: opens the filter.',
      data: { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -5, detuneB: 6, levelA: 0.5, levelB: 0.5, cutoff: 3000, reso: 1.5, vocAmt: 0.85, vocVowel: 0.5, vocQ: 0.4, vocBright: 0.6,
        lfoPhase: 'voice', cutLfoShape: 'sh', cutLfoSpd: 4, resLfoShape: 'sh', resLfoSpd: 6,
        mx1src: 'lfoCut', mx1dst: 'vow', mx1amt: 0.9, mx2src: 'lfoCut', mx2dst: 'pan', mx2amt: 0.6, mx3src: 'lfoRes', mx3dst: 'cutoff', mx3amt: 0.25,
        a: 0.03, d: 0.5, s: 0.9, r: 1.5, width: 0.3, bpm: 120, dlyAmt: 0.25, dlySync: '1/8.', reverbType: 'plate', reverbMix: 0.35, reverbSize: 4, ...WHEEL(0.3), master: 1.08 } },
    /* tape echo on the edge: 85 % feedback, loop saturation, damping and wow — every repeat darker and dirtier */
    { name: 'Tape Dub', tags: ['analog', 'rhythmic', 'dirty', 'chords', 'dub'], use: 'chord',
      play: 'Short chords on the off-beat (C3–C4) and let the echo carry them. Wheel: opens the filter · M1: resonance.',
      data: { waveA: 'square', waveB: 'sawtooth', pulseWidth: 0.4, detuneB: 5, levelA: 0.6, levelB: 0.4, cutoff: 1800, reso: 4, filterEnvAmt: 2200,
        a: 0.003, d: 0.18, s: 0, r: 0.25, dlyAmt: 0.6, dlySync: '1/4.', bpm: 90, dlyFb: 0.85, dlyDamp: 0.55, dlyWow: 0.35, dlySat: 0.6,
        width: 0.3, reverbMix: 0.15, reverbSize: 2.2, ...WHEEL(0.4), ...MAC1('reso', 0.4), master: 1.54 } },
  ] },

  /* ---------- Percussion: a deliberately synthetic 808/909 kit, played in the octave of C3.
     Kick = sine with a pitch drop; snare = short tonal body + noise; cymbals = chaotic FM + high-passed
     noise. Almost all with Curve 1: a drumhead is a damped resonator and decays exponentially. ---------- */
  { cat: 'Percussion', presets: [
    /* the «hit» is a BRIGHTNESS envelope: FM4 op 2 (ratio 1, 30 ms decay) gives the first 30 ms of
       harmonics, op 3 (ratio ½, 20 ms) the sub-click; a short pitch blip and an exponential drop */
    { name: '808 Kick', tags: ['kit', 'deep', 'short', 'classic'], use: 'hit',
      play: 'C3 (any key transposes it). Velocity is the hit.',
      data: { waveA: 'fm4', levelA: 1, levelB: 0, fm4Alg: '0',
        fm4R1: 1, fm4L1: 1, fm4D1: 4, fm4R2: 1, fm4L2: 0.9, fm4D2: 0.03, fm4R3: 0.5, fm4L3: 0.5, fm4D3: 0.02, fm4R4: 1, fm4L4: 0, fm4D4: 4,
        pitchEnvAmt: 700, pitchEnvDec: 0.04, cutoff: 2500, envCurve: 1, a: 0, d: 0.55, s: 0.0, r: 0.3, dist: 0.3, master: 2.16 } },
    /* 909: the click is triangle B + a breath of airy noise; the per-voice drive tightens the body */
    { name: '909 Kick', tags: ['kit', 'hard', 'short', 'techno', 'classic'], use: 'hit',
      play: 'C3. Harder and longer than the 808.',
      data: { waveA: 'sine', waveB: 'triangle', levelA: 0.8, levelB: 0.2, noise: 0.12, noiseColor: 0.5, pitchEnvAmt: 1000, pitchEnvDec: 0.07,
        cutoff: 2200, filterDrive: 0.3, dist: 0.4, envCurve: 1, a: 0, d: 0.5, s: 0.0, r: 0.3, amplitude: 1, master: 3.2 } },
    /* two sines at 180 and 330 Hz (additive FM4 carriers) that die in ~100 ms + airy noise that lasts longer */
    { name: '808 Snare', tags: ['kit', 'short', 'classic'], use: 'hit',
      play: 'C3.',
      data: { waveA: 'fm4', levelA: 1, levelB: 0, fm4Alg: '7',
        fm4R1: 1.38, fm4L1: 1, fm4D1: 0.11, fm4R2: 1, fm4L2: 0, fm4D2: 4, fm4R3: 2.52, fm4L3: 0.6, fm4D3: 0.07, fm4R4: 1, fm4L4: 0, fm4D4: 4,
        noise: 1, noiseColor: 0.7, pitchEnvAmt: 400, pitchEnvDec: 0.03, cutoff: 12000, reso: 1, envCurve: 1, a: 0, d: 0.3, s: 0.0, r: 0.15, dist: 0.1,
        reverbMix: 0.1, reverbSize: 0.8, master: 1.45 } },
    { name: '909 Snare', tags: ['kit', 'hard', 'short', 'techno', 'classic'], use: 'hit',
      play: 'C3. Velocity is the hit.',
      data: { noise: 0.85, waveA: 'triangle', levelA: 1, levelB: 0, pitchEnvAmt: 600, pitchEnvDec: 0.05, cutoff: 4500, morph: 0.55, reso: 3,
        fenvMode: 'own', filterEnvAmt: 2500, fa: 0.001, fd: 0.12, fs: 0, fr: 0.1, envCurve: 1, a: 0, d: 0.16, s: 0, r: 0.12, dist: 0.15, master: 3.58 } },
    /* not one noise hit: three bursts 11 ms apart (Flam) and then the tail, all through a band-pass at 1.3 kHz */
    { name: '808 Clap', tags: ['kit', 'short', 'classic'], use: 'hit',
      play: 'C3.',
      data: { waveA: 'sine', levelA: 1, levelB: 0, noise: 1, noiseColor: 0.1, filterType: 'bp', cutoff: 1300, reso: 2.5, hits: 3, hitGap: 0.011,
        a: 0, d: 0.28, s: 0.0, r: 0.12, envCurve: 0.6, dist: 0.35, reverbMix: 0.15, reverbSize: 0.9, width: 0.3, amplitude: 1, master: 3.31 } },
    /* a «ping»: a resonant band-pass that the filter envelope sweeps in 30 ms over a triangle with an abrupt pitch drop */
    { name: '909 Rimshot', tags: ['kit', 'short', 'bright', 'classic'], use: 'hit',
      play: 'C3.',
      data: { waveA: 'triangle', levelA: 1, levelB: 0, noise: 0.8, noiseColor: 0.5, pitchEnvAmt: 1200, pitchEnvDec: 0.012,
        filterType: 'bp', cutoff: 1700, reso: 5, filterEnvAmt: 2500, fenvMode: 'own', fa: 0.001, fd: 0.03, fs: 0.0, fr: 0.05,
        envCurve: 1, a: 0, d: 0.1, s: 0.0, r: 0.06, filterDrive: 0.2, dist: 0.6, amplitude: 1, master: 2.92 } },
    /* two sines at 587 and 845 Hz (ratio 1.44) through the drive: harmonics and intermodulation; a wide BP keeps the «clank» */
    { name: '808 Cowbell', tags: ['kit', 'metallic', 'short', 'classic'], use: 'hit',
      play: 'C3 (more cowbell: C3).',
      data: { waveA: 'fm4', levelA: 1, levelB: 0, fm4Alg: '7',
        fm4R1: 4.49, fm4L1: 1, fm4D1: 0.45, fm4R2: 1, fm4L2: 0, fm4D2: 4, fm4R3: 6.46, fm4L3: 1, fm4D3: 0.3, fm4R4: 1, fm4L4: 0, fm4D4: 4,
        filterDrive: 0.5, dist: 0.45, filterType: 'bp', cutoff: 1200, reso: 1.2, envCurve: 1, a: 0, d: 0.5, s: 0.0, r: 0.2, width: 0.2, amplitude: 1, master: 4 } },
    /* FM with full feedback: the modulator goes chaotic = metallic noise; non-integer ratio + high-pass = hi-hat */
    { name: 'Closed Hat', tags: ['kit', 'metallic', 'short', 'classic'], use: 'hit',
      play: 'C3.',
      data: { waveA: 'sine', levelA: 1, levelB: 0, fmRatio: 5.7, fmIndex: 5, fmFb: 1, cutoff: 6500, morph: 1, a: 0, d: 0.09, s: 0.0, r: 0.06, width: 0.2, master: 1.52 } },
    { name: 'Open Hat', tags: ['kit', 'metallic', 'airy', 'classic'], use: 'hit',
      play: 'C3.',
      data: { waveA: 'sine', levelA: 1, levelB: 0, fmRatio: 5.7, fmIndex: 5, fmFb: 1, noise: 0.3, noiseColor: 0.8, cutoff: 7000, morph: 1,
        a: 0, d: 0.45, s: 0.0, r: 0.3, width: 0.25, master: 1.16 } },
    /* four additive carriers with non-integer ratios and full feedback on op 4 that decay in ~1 s, + airy noise, all high-passed */
    { name: '909 Crash', tags: ['kit', 'metallic', 'long', 'classic'], use: 'hit',
      play: 'C3.',
      data: { waveA: 'fm4', levelA: 1, levelB: 0, fm4Alg: '7', fmFb: 1,
        fm4R1: 3.7, fm4L1: 0.5, fm4D1: 1.3, fm4R2: 5.3, fm4L2: 0.5, fm4D2: 1.0, fm4R3: 7.9, fm4L3: 0.4, fm4D3: 0.8, fm4R4: 4.1, fm4L4: 0.7, fm4D4: 1.1,
        noise: 0.55, noiseColor: 0.6, cutoff: 3500, morph: 1, envCurve: 1, a: 0, d: 2.0, s: 0.0, r: 1.2, reverbMix: 0.2, reverbSize: 2.0, width: 0.4, master: 1.99 } },
    /* like the crash but with a «ping» (carrier 1 at ratio 9, long decay) that outlives the splash */
    { name: '909 Ride', tags: ['kit', 'metallic', 'classic'], use: 'hit',
      play: 'C3.',
      data: { waveA: 'fm4', levelA: 1, levelB: 0, fm4Alg: '7', fmFb: 0.7,
        fm4R1: 9.0, fm4L1: 0.55, fm4D1: 1.4, fm4R2: 5.3, fm4L2: 0.3, fm4D2: 0.45, fm4R3: 7.9, fm4L3: 0.3, fm4D3: 0.35, fm4R4: 11.3, fm4L4: 0.5, fm4D4: 0.3,
        noise: 0.25, noiseColor: 0.7, cutoff: 4000, morph: 1, envCurve: 1, a: 0, d: 1.4, s: 0.0, r: 0.8, reverbMix: 0.12, reverbSize: 1.5, width: 0.3, amplitude: 1, master: 2.78 } },
    { name: 'Synth Tom', tags: ['kit', 'deep', 'short', 'classic'], use: 'hit',
      play: 'C2–C4: the pitch drop follows the key.',
      data: { waveA: 'sine', waveB: 'triangle', levelA: 0.75, levelB: 0.25, pitchEnvAmt: 900, pitchEnvDec: 0.12, cutoff: 1260, envCurve: 1,
        a: 0, d: 0.45, s: 0.0, r: 0.25, reverbMix: 0.15, amplitude: 1, master: 2.69 } },
  ] },

  /* ---------- Voice: the formant bank, from choir to machine ---------- */
  { cat: 'Voice', presets: [
    /* natural Q + Life (formant micro-drift) + drift + vibrato with fade + breath = a choir */
    { name: 'Human Choir', tags: ['vocal', 'warm', 'soft', 'chords', 'classic'], use: 'chord',
      play: 'C3–C5 chords. Wheel: the vowel (u→i).',
      data: { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -6, detuneB: 8, levelA: 0.5, levelB: 0.5, vocAmt: 0.75, vocVowel: 0.5, vocQ: 0.65, vocLife: 0.6,
        noise: 0.08, noiseColor: 0.5, drift: 3, cutoff: 4500, reso: 0.8, chMode: 'ensemble', chAmt: 0.55, chSpd: 0.5, freqLfoLvl: 8, freqLfoSpd: 5.2, lfoFade: 0.8,
        a: 0.5, d: 0.5, s: 0.85, r: 1.6, width: 0.5, reverbMix: 0.3, reverbSize: 2.6, mx6src: 'wheel', mx6dst: 'vow', mx6amt: 0.4, master: 1.37 } },
    /* narrow Q, no vibrato, no drift, no Life: frozen formants = a talking machine; the raw cutoff LFO babbles the vowels */
    { name: 'Talking Robot', tags: ['vocal', 'digital', 'hard', 'mono'], use: 'note', root: 60,
      play: 'C3–C5 single notes; it babbles on its own. Wheel: the vowel · M1: drive.',
      data: { waveA: 'square', waveB: 'sawtooth', pulseWidth: 0.45, levelA: 0.65, levelB: 0.35, vocAmt: 1, vocVowel: 0.5, vocQ: 0.05, vocLife: 0,
        cutLfoShape: 'square', cutLfoSpd: 1.3, mx1src: 'lfoCut', mx1dst: 'vow', mx1amt: 0.7, dist: 0.15, filterDrive: 0.1, cutoff: 5000, reso: 1, a: 0.01, d: 0.15, s: 0.8, r: 0.15,
        mx6src: 'wheel', mx6dst: 'vow', mx6amt: 0.4, ...MAC1('drive', 0.6), master: 2.29 } },
    /* S&H per note → vowel: each voice of the chord sings a different vowel */
    { name: 'Madrigal', tags: ['vocal', 'random', 'soft', 'chords', 'classic'], use: 'chord',
      play: 'C3–C5 chords: every note gets its own vowel. Wheel: shifts them all.',
      data: { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -5, detuneB: 7, levelA: 0.5, levelB: 0.5, vocAmt: 0.85, vocVowel: 0.5, vocQ: 0.5, vocLife: 0.35,
        mx1src: 'rnd', mx1dst: 'vow', mx1amt: 1, drift: 2, cutoff: 4500, reso: 0.8, chMode: 'ensemble', chAmt: 0.4, chSpd: 0.5,
        a: 0.4, d: 0.5, s: 0.85, r: 1.4, width: 0.6, reverbMix: 0.3, reverbSize: 2.8, mx6src: 'wheel', mx6dst: 'vow', mx6amt: 0.3, master: 1.1 } },
    /* the CORRECT source: a glottal pulse instead of a saw; env→morph = the vocal effort rides the envelope */
    { name: 'Solo Voice', tags: ['vocal', 'wavetable', 'bright', 'mono', 'expressive'], use: 'note', root: 60,
      play: 'C3–C5, one voice; attacks pressed, relaxing while it holds. Wheel: the vowel · M1: effort.',
      data: { waveA: 'wavetable', wtSet: 'glottal', wtPos: 0.2, levelA: 1, levelB: 0, vocAmt: 0.85, vocVowel: 0.55, vocQ: 0.6, vocLife: 0.5, vocBright: 0.75,
        mx1src: 'env', mx1dst: 'wt', mx1amt: 0.6, freqLfoLvl: 9, freqLfoSpd: 5.2, lfoFade: 0.6, drift: 2, cutoff: 5000, reso: 0.8,
        a: 0.15, d: 0.4, s: 0.8, r: 0.9, width: 0.4, reverbMix: 0.25, mx6src: 'wheel', mx6dst: 'vow', mx6amt: 0.4, ...MAC1('wt', 0.5), master: 2.87 } },
    /* consonant bite (~0.12: higher it turns into percussion) rounded off by colored noise and a pinch of drive: each note «ka» */
    { name: 'Syllables', tags: ['vocal', 'short', 'rhythmic', 'noise'], use: 'note', root: 60,
      play: 'C3–C5, fast repeated notes: ka-ka-ka. Wheel: the vowel · M1: more bite.',
      data: { waveA: 'sawtooth', waveB: 'square', pulseWidth: 0.4, levelA: 0.7, levelB: 0.3, vocAmt: 1, vocVowel: 0.5, vocQ: 0.45, vocAtk: 0.12, vocBright: 0.6,
        noise: 0.12, noiseColor: 0.35, dist: 0.18, cutoff: 4500, reso: 1, filterEnvAmt: 1200, a: 0.003, d: 0.25, s: 0.25, r: 0.2,
        dlyAmt: 0.2, dlyTime: 0.28, width: 0.3, mx6src: 'wheel', mx6dst: 'vow', mx6amt: 0.4, ...MAC1('lvlNoise', 0.5), master: 4 } },
  ] },

  /* ---------- FX & Textures ---------- */
  { cat: 'FX & Textures', presets: [
    /* the Mod env in TRIGGER mode: six seconds up (pitch an octave, filter, noise) and down again, whatever the key does */
    { name: 'Riser', tags: ['noise', 'evolving', 'long', 'cinematic'], use: 'note', root: 48,
      play: 'Hold one key (C2–C3): it climbs for six seconds and falls. Wheel: opens the filter.',
      data: { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -10, detuneB: 12, levelA: 0.5, levelB: 0.5, noise: 0.5, noiseColor: 0.3, cutoff: 300, reso: 6, filterSlope: '24',
        envmMode: 'trigger', envmA: 6, envmD: 0.5, envmS: 1, envmR: 1, envmCurve: 0.3,
        mx1src: 'envm', mx1dst: 'cutoff', mx1amt: 0.9, mx2src: 'envm', mx2dst: 'pitch', mx2amt: 1, mx3src: 'envm', mx3dst: 'lvlNoise', mx3amt: 0.5,
        a: 0.5, d: 0.5, s: 1, r: 1.5, width: 0.6, reverbMix: 0.4, reverbSize: 4, ...WHEEL(0.3), master: 1.06 } },
    { name: 'Spaceship', tags: ['metallic', 'evolving', 'drone', 'cinematic'], use: 'note', root: 48,
      play: 'C2–C4, hold a note: the ring modulator and the flanger do the rest. Wheel: opens the filter.',
      data: { ring: 0.7, waveA: 'sine', waveB: 'sine', detuneB: 35, octavesB: 2, levelA: 0.15, levelB: 0.15, cutoff: 1400, cutLfoLvl: 1200, cutLfoSpd: 0.2,
        a: 0.5, d: 0.5, s: 0.9, r: 2.0, flAmt: 0.4, flSpd: 0.3, width: 0.5, reverbMix: 0.4, ...WHEEL(0.3), master: 2.36 } },
    /* a sine ping with a pitch blip and the half-note echo at 80 bpm: the submarine; a chord
       held is pinged at random, one note every half note */
    { name: 'Sonar', tags: ['soft', 'short', 'rhythmic', 'arp', 'cinematic'], use: 'note', root: 72,
      play: 'C4–C6, one note every few seconds, or hold a chord: random pings every half note; the echo answers.',
      data: { waveA: 'sine', waveB: 'sine', octavesB: 2, levelA: 0.75, levelB: 0.25, cutoff: 2000, pitchEnvAmt: 250, pitchEnvDec: 0.06,
        arpMode: 'random', arpDiv: '1/2', arpOct: '2', arpGate: 0.3,
        a: 0.002, d: 0.4, s: 0, r: 0.4, dlyAmt: 0.55, dlySync: '1/2', bpm: 80, width: 0.4, reverbMix: 0.45, reverbSize: 4, master: 1.78 } },
    /* S&H through the matrix to the pitch (±720 ct, 5 jumps/s): a held note becomes a random melody */
    { name: 'Computer', tags: ['digital', 'random', 'rhythmic', 'cinematic'], use: 'note', root: 60,
      play: 'Hold one key (C3–C5): the computer of a 70s film. Wheel: opens the filter.',
      data: { waveA: 'square', waveB: 'sine', levelA: 0.6, levelB: 0.4, cutoff: 3000, reso: 2, freqLfoShape: 'sh', freqLfoSpd: 5,
        mx1src: 'lfoFreq', mx1dst: 'pitch', mx1amt: 0.6, a: 0.003, d: 0.1, s: 0.8, r: 0.2, dlyAmt: 0.35, dlySync: '1/8.', bpm: 120, reverbMix: 0.2, ...WHEEL(0.3), master: 0.95 } },
    { name: 'Old Radio', tags: ['dirty', 'dark', 'mono', 'classic'], use: 'note', root: 60,
      play: 'C3–C5 melodies, in mono through a tiny speaker. Wheel: opens the filter.',
      data: { waveA: 'square', pulseWidth: 0.35, waveB: 'sine', levelA: 0.75, levelB: 0.25, noise: 0.25, cutoff: 1800, morph: 0.5, reso: 5, dist: 0.4,
        ampLfoLvl: 0.15, ampLfoSpd: 0.9, width: 0, a: 0.01, d: 0.2, s: 0.8, r: 0.15, ...WHEEL(0.3), master: 1.2 } },
    /* noise through a resonant filter that the LFO sweeps slowly, the pitch of the sine wandering under it */
    { name: 'Polar Wind', tags: ['noise', 'airy', 'evolving', 'drone', 'cinematic'], use: 'note', root: 48,
      play: 'Hold one key (C2–C4) and let it blow. Wheel: opens the filter.',
      data: { noise: 0.7, waveA: 'sine', octavesA: 2, levelA: 0.95, levelB: 0.05, cutoff: 1200, reso: 12, cutLfoLvl: 900, cutLfoSpd: 0.13, morph: 0.35,
        freqLfoLvl: 15, freqLfoSpd: 0.2, freqLfoShape: 'triangle', a: 1.2, d: 0.5, s: 0.9, r: 2, panLfoLvl: 0.5, panLfoSpd: 0.2, width: 0.6,
        reverbMix: 0.3, reverbSize: 3.2, ...WHEEL(0.3), master: 1.73 } },
    /* the tremolo LFO is the wave: it swells the level and, through the matrix, opens the filter with it */
    { name: 'Ocean', tags: ['noise', 'slow', 'evolving', 'drone', 'ambient'], use: 'note', root: 48,
      play: 'Hold one key: waves every fifteen seconds. Wheel: opens the filter.',
      data: { noise: 0.8, waveA: 'sine', levelA: 1, levelB: 0, cutoff: 850, reso: 2, cutLfoLvl: 700, cutLfoSpd: 0.08, cutLfoShape: 'triangle',
        ampLfoLvl: 0.3, ampLfoSpd: 0.07, ampLfoShape: 'triangle', mx1src: 'lfoAmp', mx1dst: 'cutoff', mx1amt: 0.3,
        a: 1.5, d: 0.5, s: 0.95, r: 2.5, panLfoLvl: 0.4, panLfoSpd: 0.06, width: 0.7,
        reverbMix: 0.35, reverbSize: 3, ...WHEEL(0.3), master: 0.7 } },
    { name: 'Laser Zap', tags: ['bright', 'short', 'hard', 'digital'], use: 'note', root: 60,
      play: 'C3–C6, short notes: pew. Wheel: opens the filter.',
      data: { waveA: 'sawtooth', levelA: 1, levelB: 0, pitchEnvAmt: -2400, pitchEnvDec: 0.25, cutoff: 5020, reso: 8, a: 0, d: 0.4, s: 0.0, r: 0.2,
        dlyAmt: 0.25, dlyTime: 0.25, width: 0.3, ...WHEEL(0.3), master: 1.21 } },
  ] },
];

// Derived views: FACTORY {category: {name: data}} (library seed, scenes) and META name → entry (+ cat)
export const FACTORY = {}, META = {};
for (const c of BANK) {
  FACTORY[c.cat] = {};
  for (const p of c.presets) { FACTORY[c.cat][p.name] = p.data; META[p.name] = { ...p, cat: c.cat }; }
}
export const rootOf = m => m.root || ROOT_OF[m.cat] || 48;

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
