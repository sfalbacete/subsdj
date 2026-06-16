/* =====================================================================
   SubSDJ · estado del sintetizador (single source of truth en runtime)
   Los defaults de aquí deben coincidir con los `def` de los controles UI.
   ===================================================================== */

export function makeDefaultState() {
  return {
    oscA: { wave: 'sawtooth', detune: 0, phase: 0, octaves: 1 },
    oscB: { wave: 'square',   detune: 7, phase: 0, octaves: 1 },
    mix: 0.4, ring: 0, noise: 0, spread: 0.5,   // spread = anchura del supersaw
    fmRatio: 1, fmIndex: 0,                       // FM 2-op (sobre portadora seno): ratio y profundidad

    pulseWidth: 0.5, pwmLfoLvl: 0, pwmLfoSpd: 3,
    amplitude: 0.8,  ampLfoLvl: 0, ampLfoSpd: 5,
    freqCents: 0,    freqLfoLvl: 0, freqLfoSpd: 5,

    cutoff: 6000, cutLfoLvl: 0, cutLfoSpd: 2,
    reso: 2,      resLfoLvl: 0, resLfoSpd: 2,
    morph: 0,                         // 0 = LowPass, 1 = HiPass
    filterEnvAmt: 0,                  // Hz que abre/cierra el cutoff con la envolvente

    dist: 0, flAmt: 0, flSpd: 0.3, dlyAmt: 0, dlyTime: 0.3,
    width: 0,                          // reparto estéreo por voz (0 = mono/centro)
    reverbMix: 0, reverbSize: 1.8,     // reverb por convolución (IR generada)

    a: 0.01, d: 0.2, s: 0.7, r: 0.3,  // ADSR (compartida por amp y filtro)
    glide: 0,                          // portamento en segundos
    mode: 'poly',                      // 'poly' | 'mono' (mono = legato + prioridad última nota)
    master: 0.7,
  };
}
