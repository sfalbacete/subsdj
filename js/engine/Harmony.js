/* =====================================================================
   SubSDJ · Harmony — the scene's key: root + scale + progression.
   Everything the players emit goes through here: that is why the randomness
   sounds musical — the set of pitches is BOUNDED (scale) and so are each bar's
   «resting» notes (current chord); density, register and
   rhythm do the rest.
   Chords stacked in thirds OVER THE SCALE: degree, +2, +4, +6 scale steps.
   In a 7-note scale the diatonic triads/sevenths come out (I = C-E-
   G, ii = D-F-A…); in a pentatonic the «skips of two» stay within
   the scale: a foreign note never comes out.
   Progression: a list of degrees with N bars per chord («1 6 4 5»), or a
   WALK of tonal functions (T rest · S mild tension · D tension that
   resolves) with common-practice probabilities: from T it goes to S or D, from S
   almost always to D, D resolves to T. Deterministic: seeded PRNG
   (mulberry32) — same seed, same session (the basis of C3's scenes).
   ===================================================================== */
export const SCALES = {
  'major':          [0, 2, 4, 5, 7, 9, 11],
  'minor':          [0, 2, 3, 5, 7, 8, 10],
  'harmonic minor': [0, 2, 3, 5, 7, 8, 11],
  'dorian':         [0, 2, 3, 5, 7, 9, 10],
  'phrygian':       [0, 1, 3, 5, 7, 8, 10],
  'lydian':         [0, 2, 4, 6, 7, 9, 11],
  'mixolydian':     [0, 2, 4, 5, 7, 9, 10],
  'major penta':    [0, 2, 4, 7, 9],
  'minor penta':    [0, 3, 5, 7, 10],
  'blues':          [0, 3, 5, 6, 7, 10],
  'whole tone':     [0, 2, 4, 6, 8, 10],
  'hirajoshi':      [0, 2, 3, 7, 8],
  'in sen':         [0, 1, 5, 7, 10],
};
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const DEGREES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

// Seeded PRNG (mulberry32, 32 bits): same seed ⇒ same sequence.
// Each player and the harmony carry their OWN stream: changing one player does not
// alter what the others do.
export function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Tonal functions of each degree and transitions (probabilities) of the walk
const FUNCTION_OF = { 1: 'T', 2: 'S', 3: 'T', 4: 'S', 5: 'D', 6: 'T', 7: 'D' };
const NEXT_FN = { T: [['S', 0.45], ['D', 0.35], ['T', 0.20]],
                    S: [['D', 0.60], ['T', 0.30], ['S', 0.10]],
                    D: [['T', 0.80], ['S', 0.05], ['D', 0.15]] };
const DEGREES_OF = { T: [1, 1, 6, 3], S: [4, 4, 2], D: [5, 5, 7] };   // repeated = more likely

// «1 6 4 5», «I vi IV V»… → [1, 6, 4, 5] (1..7; whatever is not understood is skipped)
export function parseProg(str) {
  const roman = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };
  const out = String(str || '').trim().split(/[\s,·|-]+/).filter(Boolean).map(tok => {
    const t = tok.toLowerCase().replace(/[^a-z0-9]/g, '');
    const n = /^\d+$/.test(t) ? +t : roman[t];
    return n >= 1 && n <= 7 ? n : null;
  }).filter(Boolean);
  return out.length ? out.slice(0, 16) : [1];
}

export class Harmony {
  constructor({ root = 0, scale = 'minor', prog = [1, 6, 4, 5], bars = 2, mode = 'list', seed = 1 } = {}) {
    this.root = root; this.scale = scale; this.prog = prog; this.bars = bars; this.mode = mode;
    this.setSeed(seed);
  }
  setSeed(seed) { this.seed = seed; this._walk = []; this._rng = mulberry32((seed * 7919 + 17) | 0); }
  get notes() { return SCALES[this.scale] || SCALES.major; }

  // Current degree at bar `bar` (each chord lasts `bars` bars)
  degreeAt(bar) {
    const i = Math.max(0, Math.floor(bar / Math.max(1, this.bars)));
    if (this.mode === 'functions') return this._walkDegree(i);
    const p = this.prog && this.prog.length ? this.prog : [1];
    return p[i % p.length];
  }
  // Function walk: generated on demand and stored (deterministic with the seed)
  _walkDegree(i) {
    while (this._walk.length <= i) {
      const prev = this._walk.length ? this._walk[this._walk.length - 1] : 1;
      const from = FUNCTION_OF[prev] || 'T';
      let r = this._rng(), fn = 'T';
      for (const [f, p] of NEXT_FN[from]) { if (r < p) { fn = f; break; } r -= p; }
      const cands = DEGREES_OF[fn];
      this._walk.push(cands[Math.floor(this._rng() * cands.length)]);
    }
    return this._walk[i];
  }
  // The bar's chord: {degree, rootPc, tones:[4 pitch classes 0..11]}
  chordAt(bar) {
    const deg = this.degreeAt(bar), n = this.notes, len = n.length;
    const tones = [0, 1, 2, 3].map(j => (this.root + n[(deg - 1 + 2 * j) % len]) % 12);
    return { degree: deg, rootPc: tones[0], tones, bar };
  }
  scaleSet() { return new Set(this.notes.map(n => (this.root + n) % 12)); }
  // MIDI note → the nearest one in the scale (tie: downward)
  quantize(midi, pcs = this.scaleSet()) {
    for (let d = 0; d <= 6; d++) {
      if (pcs.has((((midi - d) % 12) + 12) % 12)) return midi - d;
      if (pcs.has((midi + d) % 12)) return midi + d;
    }
    return midi;
  }
  // MIDI notes in [lo, hi] whose pitch class is in `pcs`
  notesIn(lo, hi, pcs) { const out = []; for (let m = lo; m <= hi; m++) if (pcs.has(m % 12)) out.push(m); return out; }
  chordName(bar) { const c = this.chordAt(bar); return (DEGREES[c.degree - 1] || c.degree) + ' · ' + NOTE_NAMES[c.rootPc]; }
}
