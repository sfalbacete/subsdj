/* =====================================================================
   SubSDJ · vocal — formant bank (the vocal tract as a filter).
   Source-filter model of speech: the glottis is a pulse train rich in
   harmonics (≈ saw) and the vocal tract a filter with 3-5 resonances,
   the FORMANTS. The identity of a vowel is the position of F1/F2
   (F3 adds naturalness) and their relative amplitudes. The key property:
   formants do NOT depend on the note (singing /a/ at C2 or C4 changes
   which harmonic falls inside the bell, not the bell). That's why this is
   a FILTERING stage at absolute frequencies per voice — the 'formant'
   wavetable set can't sing: its peaks live at harmonic n and are
   transposed with the pitch (chipmunk effect).

   Here live the vowel table and the morph CURVES: the path of each
   formant (frequency and gain) along u→o→a→e→i, sampled at VOC_N
   points. Each curve is mounted in a WaveShaper per voice: control
   signal (Vowel knob + matrix, ±1 domain) → curve → AudioParam (biquad
   detune in cents / linear gain). So the vowel morph is pure plumbing
   and works at audio rate.
   ===================================================================== */

/* Vowel table (5 formants: [Hz], [dB]) — classic singing values in the
   Csound style (tenor), rounded: vowel perception is robust, what matters
   is the ZONE of F1/F2, not the exact Hz. F4-F5 barely change between
   vowels: they CLUSTER with F3 around 2.8-3.4 kHz and that cluster is the
   «singer's formant» — the fixed brilliance that lets an operatic voice be
   heard over an orchestra (Bright knob: scales the gain of F4-F5). ORDER
   of the path u→o→a→e→i: F2 rises monotonically (700→2140) and F1 draws an
   arc (closed→open→closed) — a single knob sweeps without zigzags; the
   alphabetical order would make F2 rise and collapse (a→o). */
export const VOWELS = [
  { v: 'u', f: [325, 700, 2530, 2900, 3300], db: [0, -12, -17, -14, -22] },
  { v: 'o', f: [450, 800, 2830, 3000, 3350], db: [0, -10, -14, -12, -22] },
  { v: 'a', f: [660, 1120, 2750, 3000, 3350], db: [0, -6, -12, -9, -18] },
  { v: 'e', f: [440, 1800, 2700, 3100, 3400], db: [0, -9, -10, -8, -18] },
  { v: 'i', f: [270, 2140, 2950, 3300, 3600], db: [0, -12, -9, -10, -16] },
];
export const VOC_ORDER = VOWELS.map(w => w.v).join('');   // 'uoaei' (knob format)
const N_FORM = 5;
export const VOC_BRIGHT_IX = 3;   // Bright acts from this index on (F4-F5, the singer's cluster)
// 0 = no F4-F5 (the usual 3-band bank) · 0.5 = the table · 1 = +12 dB
export const brightMul = b => (2 * b) * (2 * b);

/* Natural bandwidth per formant (Hz). Fixed per formant (the vowel
   identity lives in position+amplitude; the BW is second-order) and
   scaled by the Q knob: narrow bands = electronic/vocoder, wide ones =
   soft. WATCH OUT, WebAudio: the Q of the BANDPASS is LINEAR (Q = f/BW),
   not in dB like lowpass/highpass — the July trap, mirrored. */
const BWS = [75, 90, 120, 130, 140];
const BW_MUL_MIN = 0.35;      // Q knob at 0: robot (Q ≈ 3× the natural one)
const BW_MUL_MAX = 2.5;       // Q knob at 1: soft, almost breathy
export const bwMul = q => BW_MUL_MIN * Math.pow(BW_MUL_MAX / BW_MUL_MIN, q);

/* Makeup of the wet path: 3 narrow bands take a lot of energy out of the
   full spectrum (compensating = the knob changes timbre, not volume; the
   same medicine as noiseColor.mk). Narrowing the BW by m makes the energy
   that passes drop ~m ⇒ amplitude ~√m: the makeup grows with 1/√m. */
const VOC_MAKEUP = 3.0;
export const vocMakeup = q => VOC_MAKEUP / Math.sqrt(bwMul(q));

export const VOC_LIFE_CENTS = 60;   // 'Life' at max: the formants wander ±60 ct (~±3.5%)
export const VOC_SMOOTH = 0.045;    // articulation of the Vowel knob (the mouth takes ~50 ms)

/* 'Bite': percussive consonant at the note start, in TWO parts.
   (1) The formant TRANSITION: the mouth comes out of a closure (position
   shifted towards /u/: F1 and F2 down) and opens towards the vowel in
   ~70 ms. The classic perception experiments (Haskins) showed that THIS
   is what the ear uses to hear a stop consonant — the transition alone,
   with no noise, is already heard as a consonant. (2) The noise BURST of
   the release, through a WIDE band-pass centred on the vowel's F2 (the
   «place of articulation»: «ka» ≠ «ku»). Wide on purpose: through the
   narrow bank the plosive lost ~97% of its energy and was left as a timid
   click (measured: +3% RMS). The knob scales BOTH: low = soft «wa/da»,
   high = hard «ka»; and it scales with velocity and with Mix. It is a
   pre-VCA transient: with a slow ADSR attack it gets lost (like a real
   choir, which doesn't articulate /k/ in a crescendo either). */
export const VOC_ATK_GAIN = 6.0;    // burst level at max (wide band, no makeup)
export const VOC_ATK_TAU = 0.015;   // burst decay (τ; audible ~50 ms: a plosive, not a breath)
export const VOC_ATK_Q = 1.2;       // Q of the burst band-pass (wide: an explosion, not a whistle)
export const VOC_ATK_GLIDE = 1.5;   // closure at Bite 1 (on the u↔i axis: from /a/ it reaches /u/)
export const VOC_ATK_TRANS = 0.024; // τ of the closure→vowel transition (~95% at 3τ ≈ 70 ms)

/* ---------- morph curves (once, shared by all voices) ----------
   For each formant: REF frequency = geometric mean of the 5 vowels
   (the biquad is anchored there and the morph travels through its detune,
   in cents ⇒ exponential and never crossing 0 Hz — the cutLFO lesson
   again) and two curves of VOC_N points over the control domain [-1,1]:
     freqCurve  cents relative to REF (piecewise linear in log-frequency)
     gainCurve  linear gain (interpolated in dB between vowels)
   VOC_N odd and a multiple of (vowels−1)·2^k: the vowels fall EXACTLY on
   the WaveShaper grid and its linear interpolation reproduces the curve. */
export const VOC_N = 257;

let _bank = null;
export function getVocalBank() {
  if (_bank) return _bank;
  const V = VOWELS.length;
  _bank = [];
  for (let f = 0; f < N_FORM; f++) {
    let lg = 0;
    for (const w of VOWELS) lg += Math.log(w.f[f]);
    const ref = Math.exp(lg / V);
    const fc = new Float32Array(VOC_N), gc = new Float32Array(VOC_N);
    for (let i = 0; i < VOC_N; i++) {
      const p = (i / (VOC_N - 1)) * (V - 1);            // vowel position 0..4
      const k = Math.min(V - 2, Math.floor(p)), w = p - k;
      const A = VOWELS[k], B = VOWELS[k + 1];
      fc[i] = 1200 * ((1 - w) * Math.log2(A.f[f] / ref) + w * Math.log2(B.f[f] / ref));
      gc[i] = Math.pow(10, ((1 - w) * A.db[f] + w * B.db[f]) / 20);
    }
    _bank.push({ ref, bw: BWS[f], freqCurve: fc, gainCurve: gc });
  }
  return _bank;
}
