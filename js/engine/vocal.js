/* =====================================================================
   SubSDJ · vocal — banco de formantes (el tracto vocal como filtro).
   Modelo fuente-filtro del habla: la glotis es un tren de pulsos rico en
   armónicos (≈ sierra) y el tracto vocal un filtro con 3-5 resonancias,
   los FORMANTES. La identidad de una vocal son las posiciones de F1/F2
   (F3 añade naturalidad) y sus amplitudes relativas. La propiedad clave:
   los formantes NO dependen de la nota (cantar /a/ en Do2 o Do4 mueve
   qué armónico cae dentro de la campana, no la campana). Por eso esto es
   una etapa de FILTRADO a frecuencias absolutas por voz — el set
   wavetable 'formante' no puede cantar: sus picos viven en el armónico n
   y se transponen con el pitch (efecto ardilla).

   Aquí viven la tabla de vocales y las CURVAS de morph: el recorrido de
   cada formante (frecuencia y ganancia) a lo largo de u→o→a→e→i,
   muestreado en VOC_N puntos. Cada curva se monta en un WaveShaper por
   voz: señal de control (knob Vocal + matriz, dominio ±1) → curva →
   AudioParam (detune del biquad en cents / ganancia lineal). Así el
   morph vocálico es fontanería pura y funciona a audio-rate.
   ===================================================================== */

/* Tabla de vocales (5 formantes: [Hz], [dB]) — valores clásicos de canto
   estilo Csound (tenor), redondeados: la percepción vocálica es robusta,
   manda la ZONA de F1/F2, no el Hz exacto. F4-F5 apenas cambian de vocal:
   se APIÑAN con F3 hacia 2.8-3.4 kHz y ese racimo es el «formante del
   cantante» — el brillo fijo que deja oír una voz lírica sobre una
   orquesta (knob Brillo: escala la ganancia de F4-F5). ORDEN del recorrido
   u→o→a→e→i: F2 sube monótono (700→2140) y F1 dibuja un arco (cerrada→
   abierta→cerrada) — un solo knob barre sin zigzags; el orden alfabético
   haría a F2 subir y desplomarse (a→o). */
export const VOWELS = [
  { v: 'u', f: [325, 700, 2530, 2900, 3300], db: [0, -12, -17, -14, -22] },
  { v: 'o', f: [450, 800, 2830, 3000, 3350], db: [0, -10, -14, -12, -22] },
  { v: 'a', f: [660, 1120, 2750, 3000, 3350], db: [0, -6, -12, -9, -18] },
  { v: 'e', f: [440, 1800, 2700, 3100, 3400], db: [0, -9, -10, -8, -18] },
  { v: 'i', f: [270, 2140, 2950, 3300, 3600], db: [0, -12, -9, -10, -16] },
];
export const VOC_ORDEN = VOWELS.map(w => w.v).join('');   // 'uoaei' (formato del knob)
const N_FORM = 5;
export const VOC_BRILLO_IX = 3;   // desde este índice actúa Brillo (F4-F5, el racimo del cantante)
// 0 = sin F4-F5 (el banco de 3 de siempre) · 0.5 = la tabla · 1 = +12 dB
export const brilloMul = b => (2 * b) * (2 * b);

/* Ancho de banda natural por formante (Hz). Fijo por formante (la
   identidad vocálica vive en posición+amplitud; el BW es de segundo
   orden) y escalado por el knob Q: bandas finas = electrónico/vocoder,
   anchas = blando. OJO WebAudio: la Q del BANDPASS es LINEAL (Q = f/BW),
   no en dB como lowpass/highpass — la trampa de julio, en espejo. */
const BWS = [75, 90, 120, 130, 140];
const BW_MUL_MIN = 0.35;      // knob Q a 0: robot (Q ≈ 3× la natural)
const BW_MUL_MAX = 2.5;       // knob Q a 1: suave, casi soplado
export const bwMul = q => BW_MUL_MIN * Math.pow(BW_MUL_MAX / BW_MUL_MIN, q);

/* Makeup del camino wet: 3 bandas estrechas tiran mucha energía del
   espectro completo (compensar = el knob cambia timbre, no volumen; la
   misma medicina que noiseColor.mk). Al estrechar el BW por m la energía
   que pasa cae ~m ⇒ amplitud ~√m: el makeup crece con 1/√m. */
const VOC_MAKEUP = 3.0;
export const vocMakeup = q => VOC_MAKEUP / Math.sqrt(bwMul(q));

export const VOC_VIDA_CENTS = 60;   // 'Vida' a tope: los formantes vagan ±60 ct (~±3.5%)
export const VOC_SMOOTH = 0.045;    // articulación del knob Vocal (la boca tarda ~50 ms)

/* 'Golpe': consonante percusiva al arrancar la nota, en DOS partes.
   (1) La TRANSICIÓN de formantes: la boca sale de un cierre (posición
   desplazada hacia /u/: F1 y F2 abajo) y se abre hacia la vocal en ~70 ms.
   Los experimentos clásicos de percepción (Haskins) demostraron que ESTO
   es lo que el oído usa para oír una oclusiva — la transición sola, sin
   ruido, ya se percibe como consonante. (2) El BURST de ruido de la
   explosión, por un paso-banda ANCHO centrado en el F2 de la vocal (el
   «punto de articulación»: «ka» ≠ «ku»). Ancho a propósito: por el banco
   fino la plosiva perdía ~97% de la energía y quedaba en click tímido
   (medido: +3% de RMS). El knob escala AMBAS: bajo = «wa/da» blanda,
   alto = «ka» dura; y escala con velocity y con Mix. Es un transitorio
   pre-VCA: con attack lento del ADSR se pierde (como un coro real, que
   tampoco articula /k/ en un crescendo). */
export const VOC_ATK_GAIN = 6.0;    // nivel del burst a tope (banda ancha, sin makeup)
export const VOC_ATK_TAU = 0.015;   // caída del burst (τ; audible ~50 ms: plosiva, no soplo)
export const VOC_ATK_Q = 1.2;       // Q del paso-banda del burst (ancho: una explosión, no un silbido)
export const VOC_ATK_GLIDE = 1.5;   // cierre a Golpe 1 (en el eje u↔i: desde /a/ llega hasta /u/)
export const VOC_ATK_TRANS = 0.024; // τ de la transición cierre→vocal (~95% a 3τ ≈ 70 ms)

/* ---------- curvas de morph (una vez, compartidas por todas las voces) ----------
   Para cada formante: frecuencia REF = media geométrica de las 5 vocales
   (el biquad se ancla ahí y el morph viaja por su detune, en cents ⇒
   exponencial y sin cruzar 0 Hz — la lección del cutLFO otra vez) y dos
   curvas de VOC_N puntos sobre el dominio de control [-1,1]:
     freqCurve  cents respecto a REF (lineal a trozos en log-frecuencia)
     gainCurve  ganancia lineal (interpolada en dB entre vocales)
   VOC_N impar y múltiplo de (vocales−1)·2^k: las vocales caen EXACTAS en
   la rejilla del WaveShaper y su interpolación lineal reproduce la curva. */
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
      const p = (i / (VOC_N - 1)) * (V - 1);            // posición vocálica 0..4
      const k = Math.min(V - 2, Math.floor(p)), w = p - k;
      const A = VOWELS[k], B = VOWELS[k + 1];
      fc[i] = 1200 * ((1 - w) * Math.log2(A.f[f] / ref) + w * Math.log2(B.f[f] / ref));
      gc[i] = Math.pow(10, ((1 - w) * A.db[f] + w * B.db[f]) / 20);
    }
    _bank.push({ ref, bw: BWS[f], freqCurve: fc, gainCurve: gc });
  }
  return _bank;
}
