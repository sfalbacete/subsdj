/* =====================================================================
   SubSDJ · reson — bank of modal RESONATORS per voice (Roadmap 5.0 · block 5).
   What: six 2-pole resonators (biquad bandpass) tuned to the NOTE,
   f_i = f0·ratio_i, in parallel, between the Vocal and the filter (dry/wet).
   «Lite» modal synthesis: a vibrating body is its modes; each biquad is
   one mode with its frequency, its Q (how long it takes to ring and to die
   out: τ = Q/(π·f)) and its gain. Excited with NOISE (Noise knob) it sounds
   like a bowed bowl, wind over strings; with a saw, like humming metal.
   Material: continuous morph between the modes of a STRING or tube
   (harmonics 1, 2, 3…) and those of a free-free BAR (Fletcher & Rossing,
   ∝ (2n+1)²: 1, 2.76, 5.40, 8.93, 13.3, 18.6), interpolating the LOGARITHM
   of the ratios: in between, «piano» or «bell» inharmonicity.
   Level: the TONAL signal enters the bank at gain 1 (a partial right on a
   mode passes at 0 dB: bounded, a saw doesn't blow up); the NOISE enters by
   its own path with gain ∝ √Q, because the noise power a resonator lets
   through is ∝ its bandwidth f/Q — with a shared gain, at high Q the bowl
   was silent (−35…−48 dB per mode) or the saw blew up.
   ===================================================================== */
export const RES_HARM = [1, 2, 3, 4, 5, 6];
export const RES_BAR = [1, 2.756, 5.404, 8.933, 13.344, 18.638];
export const RES_Q_MIN = 10, RES_Q_MAX = 600;              // Decay 0..1 → Q on a log scale
export const RES_NOISE_K = 0.8;                            // gain of the noise path = K·√Q (Q 77 → ×7 · Q 600 → ×20)
export const RES_BRIGHT_E0 = 1, RES_BRIGHT_E1 = -0.3;      // exponent e of the gains r^(−e): 1 = 1/r (dark) … −0.3 = r^0.3 (bright); flat at Bright 0.77

export const resRatios = mat => RES_HARM.map((h, i) => Math.pow(h, 1 - mat) * Math.pow(RES_BAR[i], mat));
export const resQ = decay => RES_Q_MIN * Math.pow(RES_Q_MAX / RES_Q_MIN, decay);
export const resNoiseGain = q => RES_NOISE_K * Math.sqrt(q);
// gains of the modes, normalized to Σg² = 2: Bright redistributes, it doesn't raise or lower the level
export function resGains(ratios, bright) {
  const e = RES_BRIGHT_E0 + (RES_BRIGHT_E1 - RES_BRIGHT_E0) * bright;
  const g = ratios.map(r => Math.pow(r, -e)), s = Math.sqrt(2 / g.reduce((a, x) => a + x * x, 0));
  return g.map(x => x * s);
}
