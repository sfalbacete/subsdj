/* =====================================================================
   SubSDJ · PARAMS — tabla ÚNICA de parámetros (fuente de verdad).
   Clave = nombre canónico (es la clave de CONTROLS y de los presets v2).
   Valores SIEMPRE en espacio-motor (Hz, segundos, cents, 0..1…).
   Campos:
     def       valor por defecto (de aquí derivan state.js y toda la UI)
     min/max   rango del control
     t         target del motor si no coincide con la clave ('oscA.detune')
     unit      sufijo para el formato genérico de los knobs (' Hz', ' ct'…)
     step      granularidad del slider (solo sliders)
     fmt       formato de presentación específico (solo sliders)
     log       true = el slider trabaja en posición 0..1 con mapeo log min→max
   El switch de AudioEngine.set() sigue siendo quien APLICA cada parámetro
   al grafo: eso es lógica de audio, no metadatos, y ahí es legible.
   ===================================================================== */

const msFmt = v => (v * 1000).toFixed(0) + ' ms';
const twoDec = v => v.toFixed(2);

export const PARAMS = {
  // --- Osciladores ---
  waveA:    { def: 'sawtooth', t: 'oscA.wave' },
  detuneA:  { def: 0, min: -50, max: 50, unit: ' ct', t: 'oscA.detune' },
  phaseA:   { def: 0, min: 0, max: 360, unit: '°', t: 'oscA.phase' },
  octavesA: { def: 1, min: 1, max: 4, t: 'oscA.octaves' },
  waveB:    { def: 'square', t: 'oscB.wave' },
  detuneB:  { def: 7, min: -50, max: 50, unit: ' ct', t: 'oscB.detune' },
  phaseB:   { def: 0, min: 0, max: 360, unit: '°', t: 'oscB.phase' },
  octavesB: { def: 1, min: 1, max: 4, t: 'oscB.octaves' },
  mix:      { def: 0.4, min: 0, max: 1 },
  ring:     { def: 0, min: 0, max: 1 },
  noise:    { def: 0, min: 0, max: 1 },
  noiseColor:{ def: 0, min: -1, max: 1 },           // − oscuro (LP) · 0 blanco · + "aire" (HP)
  spread:   { def: 0.5, min: 0, max: 1 },
  drift:    { def: 0, min: 0, max: 15, unit: ' ct' },   // deriva aleatoria lenta por oscilador (analógico)
  uniVoices:{ def: '1' },                               // unison: 1..7 copias por oscilador (seg; supersaw lo ignora)
  uniDetune:{ def: 12, min: 0, max: 50, unit: ' ct' },  // detune de los extremos del unison
  fmRatio:  { def: 1, min: 0.25, max: 12 },
  fmIndex:  { def: 0, min: 0, max: 12 },

  // --- Modulación ---
  pulseWidth: { def: 0.5, min: 0.02, max: 0.98, step: 0.01, fmt: v => (v * 100).toFixed(0) + '%' },
  pwmLfoLvl:  { def: 0, min: 0, max: 0.45 },
  pwmLfoSpd:  { def: 3, min: 0.05, max: 20, unit: ' Hz' },
  pwmLfoShape:{ def: 'sine' },
  amplitude:  { def: 0.8, min: 0, max: 1, step: 0.01, fmt: twoDec },
  ampLfoLvl:  { def: 0, min: 0, max: 0.6 },
  ampLfoSpd:  { def: 5, min: 0.05, max: 20, unit: ' Hz' },
  ampLfoShape:{ def: 'sine' },
  freqCents:  { def: 0, min: -1200, max: 1200, step: 1, fmt: v => v.toFixed(0) + ' ct' },
  freqLfoLvl: { def: 0, min: 0, max: 200, unit: ' ct' },
  freqLfoSpd: { def: 5, min: 0.05, max: 20, unit: ' Hz' },
  freqLfoShape:{ def: 'sine' },
  lfoFade:    { def: 0, min: 0, max: 2, unit: ' s' },   // vibrato/PWM entran en rampa tras cada noteOn

  // --- Filtro (por voz) ---
  cutoff:    { def: 6000, min: 20, max: 20000, log: true,
               fmt: v => v >= 1000 ? (v / 1000).toFixed(2) + ' kHz' : v.toFixed(0) + ' Hz' },
  cutLfoLvl: { def: 0, min: 0, max: 5000, unit: ' Hz' },
  cutLfoSpd: { def: 2, min: 0.05, max: 20, unit: ' Hz' },
  cutLfoShape:{ def: 'sine' },
  reso:      { def: 2, min: 0.1, max: 24, step: 0.1, fmt: v => v.toFixed(1) },
  resLfoLvl: { def: 0, min: 0, max: 15 },
  resLfoSpd: { def: 2, min: 0.05, max: 20, unit: ' Hz' },
  resLfoShape:{ def: 'sine' },
  morph:        { def: 0, min: 0, max: 1 },
  filterEnvAmt: { def: 0, min: -6000, max: 6000, unit: ' Hz' },
  keytrack:     { def: 0, min: 0, max: 1 },       // el cutoff sigue la altura de la nota (1 = 1:1)
  filterSlope:  { def: '12' },                    // '12' | '24' dB/oct (2ª etapa en cascada; por nota)
  filterDrive:  { def: 0, min: 0, max: 1 },       // saturación tanh PRE-filtro por voz (0 = transparente)
  fenvMode: { def: 'link' },                        // 'link' = la env del filtro usa el ADSR de amplitud
  fa: { def: 0.01, min: 0.001, max: 2, unit: ' s' },
  fd: { def: 0.2,  min: 0.001, max: 2, unit: ' s' },
  fs: { def: 0.7,  min: 0, max: 1 },
  fr: { def: 0.3,  min: 0.001, max: 3, unit: ' s' },

  // --- FX ---
  dist:    { def: 0, min: 0, max: 1 },
  flAmt:   { def: 0, min: 0, max: 1 },
  flSpd:   { def: 0.3, min: 0.05, max: 8, unit: ' Hz' },
  chAmt:   { def: 0, min: 0, max: 1 },              // chorus/ensemble (mezcla wet)
  chSpd:   { def: 0.6, min: 0.05, max: 8, unit: ' Hz' },
  chMode:  { def: 'chorus' },                       // 'chorus' | 'ensemble' (triple chorus a 3 fases)
  dlyAmt:  { def: 0, min: 0, max: 0.9 },
  dlyTime: { def: 0.3, min: 0.02, max: 1.5, unit: ' s' },
  dlySync: { def: 'libre' },                        // 'libre' | 1/8 | 1/8. | 1/4 | 1/4. | 1/2 (usa bpm)
  bpm:     { def: 120, min: 40, max: 220, unit: ' bpm' },

  // --- Espacio ---
  width:      { def: 0, min: 0, max: 1 },
  panLfoLvl:  { def: 0, min: 0, max: 1 },           // autopan por voz
  panLfoSpd:  { def: 0.4, min: 0.05, max: 8, unit: ' Hz' },
  reverbMix:  { def: 0, min: 0, max: 0.6 },
  reverbSize: { def: 1.8, min: 0.2, max: 4, unit: ' s' },
  reverbDamp: { def: 0, min: 0, max: 1 },           // los agudos de la cola mueren antes (vive en la IR)
  reverbPre:  { def: 0, min: 0, max: 0.1, unit: ' s' },  // predelay: separa el ataque de la cola

  // --- Envolvente / voz / master ---
  a: { def: 0.01, min: 0.001, max: 2, step: 0.001, fmt: msFmt },
  d: { def: 0.2,  min: 0.001, max: 2, step: 0.001, fmt: msFmt },
  s: { def: 0.7,  min: 0, max: 1, step: 0.01, fmt: twoDec },
  r: { def: 0.3,  min: 0.001, max: 3, step: 0.001, fmt: msFmt },
  glide:  { def: 0, min: 0, max: 1, unit: ' s' },
  pitchEnvAmt: { def: 0, min: -2400, max: 2400, unit: ' ct' },   // envolvente de pitch por nota
  pitchEnvDec: { def: 0.08, min: 0.005, max: 1, unit: ' s' },
  mode:   { def: 'poly' },
  arpMode: { def: 'off' },                          // off | up | down | updown | random
  arpDiv:  { def: '1/16' },                         // división musical del paso (usa bpm)
  arpOct:  { def: '1' },                            // octavas del patrón (1..3, seg de botones)
  arpGate: { def: 0.5, min: 0.05, max: 1 },         // duración de cada paso (fracción)
  master: { def: 0.7, min: 0, max: 1, step: 0.01, fmt: twoDec },
};

// Posición de slider (0..1 si log) <-> valor de motor. Para params sin `log`
// la posición ES el valor (el <input> lleva min/max/step reales).
export const posToVal = (p, x) => p.log ? p.min * Math.pow(p.max / p.min, x) : x;
export const valToPos = (p, v) => p.log ? Math.log(v / p.min) / Math.log(p.max / p.min) : v;
