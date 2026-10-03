/* =====================================================================
   SubSDJ · reson — banco de RESONADORES modales por voz (Roadmap 5.0 · bloque 5).
   Qué: seis resonadores de 2 polos (biquad bandpass) afinados a la NOTA,
   f_i = f0·razón_i, en paralelo, entre el Vocal y el filtro (dry/wet).
   Síntesis modal «lite»: un cuerpo que vibra son sus modos; cada biquad es
   un modo con su frecuencia, su Q (cuánto tarda en cantar y en apagarse:
   τ = Q/(π·f)) y su ganancia. Excitado con RUIDO (knob Ruido) suena a cuenco
   frotado, a viento sobre cuerdas; con una sierra, a metal que zumba.
   Material: morph continuo entre los modos de una CUERDA o tubo (armónicos
   1, 2, 3…) y los de una BARRA libre-libre (Fletcher & Rossing, ∝ (2n+1)²:
   1, 2,76, 5,40, 8,93, 13,3, 18,6), interpolando el LOGARITMO de las
   razones: en medio, inarmonicidad «de piano» o «de campana».
   Nivel: la señal TONAL entra al banco a ganancia 1 (un parcial justo en un
   modo pasa a 0 dB: acotado, una sierra no revienta); el RUIDO entra por un
   camino propio con ganancia ∝ √Q, porque la potencia de ruido que deja
   pasar un resonador es ∝ su anchura f/Q — con una ganancia común, a Q alta
   el cuenco no sonaba (−35…−48 dB por modo) o la sierra reventaba.
   ===================================================================== */
export const RES_HARM = [1, 2, 3, 4, 5, 6];
export const RES_BAR = [1, 2.756, 5.404, 8.933, 13.344, 18.638];
export const RES_Q_MIN = 10, RES_Q_MAX = 600;              // Decay 0..1 → Q en log
export const RES_NOISE_K = 0.8;                            // ganancia del camino de ruido = K·√Q (Q 77 → ×7 · Q 600 → ×20)
export const RES_BRILLO_E0 = 1, RES_BRILLO_E1 = -0.3;      // exponente e de las ganancias r^(−e): 1 = 1/r (oscuro) … −0,3 = r^0,3 (brillante); plano en Brillo 0,77

export const resRatios = mat => RES_HARM.map((h, i) => Math.pow(h, 1 - mat) * Math.pow(RES_BAR[i], mat));
export const resQ = decay => RES_Q_MIN * Math.pow(RES_Q_MAX / RES_Q_MIN, decay);
export const resNoiseGain = q => RES_NOISE_K * Math.sqrt(q);
// ganancias de los modos, normalizadas a Σg² = 2: Brillo reparte, no sube ni baja
export function resGains(ratios, brillo) {
  const e = RES_BRILLO_E0 + (RES_BRILLO_E1 - RES_BRILLO_E0) * brillo;
  const g = ratios.map(r => Math.pow(r, -e)), s = Math.sqrt(2 / g.reduce((a, x) => a + x * x, 0));
  return g.map(x => x * s);
}
