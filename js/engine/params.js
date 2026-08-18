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
     act       true = el 0 es "apagado" (no un ajuste): el knob se atenúa a 0
               y el parámetro cuenta para los LEDs de actividad (ui/activity.js)
   El switch de AudioEngine.set() sigue siendo quien APLICA cada parámetro
   al grafo: eso es lógica de audio, no metadatos, y ahí es legible.
   ===================================================================== */

import { VOC_ORDEN } from './vocal.js';

const msFmt = v => (v * 1000).toFixed(0) + ' ms';
const twoDec = v => v.toFixed(2);
// knob Vocal: enseña la vocal (u, o, a…) o el tramo entre dos (u·o)
const vowelFmt = v => {
  const p = v * (VOC_ORDEN.length - 1), i = Math.min(VOC_ORDEN.length - 2, Math.floor(p)), w = p - i;
  return w < 0.06 ? VOC_ORDEN[i] : w > 0.94 ? VOC_ORDEN[i + 1] : VOC_ORDEN[i] + '·' + VOC_ORDEN[i + 1];
};

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
  ring:     { def: 0, min: 0, max: 1, act: true },
  noise:    { def: 0, min: 0, max: 1, act: true },
  noiseColor:{ def: 0, min: -1, max: 1 },           // − oscuro (LP) · 0 blanco · + "aire" (HP)
  spread:   { def: 0.5, min: 0, max: 1 },
  drift:    { def: 0, min: 0, max: 15, unit: ' ct', act: true },   // deriva aleatoria lenta por oscilador (analógico)
  uniVoices:{ def: '1' },                               // unison: 1..7 copias por oscilador (seg; supersaw lo ignora)
  uniDetune:{ def: 12, min: 0, max: 50, unit: ' ct' },  // detune de los extremos del unison
  fmRatio:  { def: 1, min: 0.25, max: 12 },
  fmIndex:  { def: 0, min: 0, max: 12, act: true },
  wtSet:    { def: 'analógica' },                   // tabla de ondas (oscs en modo 'Tabla'; global A+B)
  wtPos:    { def: 0, min: 0, max: 1 },             // morph: posición entre los frames de la tabla
  wtUser:   { def: '' },                            // receta de la tabla 'usuario' DENTRO del preset ('' = respeta la dibujada)

  // --- Modulación ---
  pulseWidth: { def: 0.5, min: 0.02, max: 0.98, step: 0.01, fmt: v => (v * 100).toFixed(0) + '%' },
  pwmLfoLvl:  { def: 0, min: 0, max: 0.45, act: true },
  pwmLfoSpd:  { def: 3, min: 0.05, max: 20, unit: ' Hz' },
  pwmLfoShape:{ def: 'sine' },
  amplitude:  { def: 0.8, min: 0, max: 1, step: 0.01, fmt: twoDec },
  ampLfoLvl:  { def: 0, min: 0, max: 0.6, act: true },
  ampLfoSpd:  { def: 5, min: 0.05, max: 20, unit: ' Hz' },
  ampLfoShape:{ def: 'sine' },
  freqCents:  { def: 0, min: -1200, max: 1200, step: 1, fmt: v => v.toFixed(0) + ' ct' },
  freqLfoLvl: { def: 0, min: 0, max: 200, unit: ' ct', act: true },
  freqLfoSpd: { def: 5, min: 0.05, max: 20, unit: ' Hz' },
  freqLfoShape:{ def: 'sine' },
  lfoFade:    { def: 0, min: 0, max: 2, unit: ' s' },   // vibrato/PWM entran en rampa tras cada noteOn

  // --- Filtro (por voz) ---
  cutoff:    { def: 6000, min: 20, max: 20000, log: true,
               fmt: v => v >= 1000 ? (v / 1000).toFixed(2) + ' kHz' : v.toFixed(0) + ' Hz' },
  cutLfoLvl: { def: 0, min: 0, max: 5000, unit: ' Hz', act: true },
  cutLfoSpd: { def: 2, min: 0.05, max: 20, unit: ' Hz' },
  cutLfoShape:{ def: 'sine' },
  reso:      { def: 2, min: 0.1, max: 24, step: 0.1, fmt: v => v.toFixed(1) },
  resLfoLvl: { def: 0, min: 0, max: 15, act: true },
  resLfoSpd: { def: 2, min: 0.05, max: 20, unit: ' Hz' },
  resLfoShape:{ def: 'sine' },
  morph:        { def: 0, min: 0, max: 1 },
  filterEnvAmt: { def: 0, min: -6000, max: 6000, unit: ' Hz', act: true },
  keytrack:     { def: 0, min: 0, max: 1, act: true },  // el cutoff sigue la altura de la nota (1 = 1:1)
  filterSlope:  { def: '12' },                    // '12' | '24' dB/oct (2ª etapa en cascada; por nota)
  filterDrive:  { def: 0, min: 0, max: 1, act: true },  // saturación tanh PRE-filtro por voz (0 = transparente)
  fenvMode: { def: 'link' },                        // 'link' = la env del filtro usa el ADSR de amplitud
  fa: { def: 0.01, min: 0.001, max: 2, unit: ' s' },
  fd: { def: 0.2,  min: 0.001, max: 2, unit: ' s' },
  fs: { def: 0.7,  min: 0, max: 1 },
  fr: { def: 0.3,  min: 0.001, max: 3, unit: ' s' },

  // --- Vocal (banco de formantes por voz, entre el drive y el filtro) ---
  vocAmt:   { def: 0, min: 0, max: 1, act: true },  // dry/wet del tracto vocal (0 = sin banco)
  vocVowel: { def: 0.5, min: 0, max: 1, fmt: vowelFmt },   // recorrido u→o→a→e→i (0.5 = /a/)
  vocSize:  { def: 0, min: -1200, max: 1200, unit: ' ct' },// tamaño del tracto: + niño · − gigante
  vocQ:     { def: 0.5, min: 0, max: 1 },           // definición: 0 = robot (bandas finas) · 1 = suave
  vocVida:  { def: 0, min: 0, max: 1, act: true },  // micro-deriva de los formantes (humaniza)
  vocBrillo:{ def: 0.5, min: 0, max: 1 },           // formante del cantante (F4-F5): 0 = sin ellos · 0.5 = tabla · 1 = +12 dB
  vocAtk:   { def: 0, min: 0, max: 1, act: true },  // golpe consonántico: burst de ruido por el tracto al arrancar la nota

  // --- FX ---
  dist:    { def: 0, min: 0, max: 1, act: true },
  flAmt:   { def: 0, min: 0, max: 1, act: true },
  flSpd:   { def: 0.3, min: 0.05, max: 8, unit: ' Hz' },
  chAmt:   { def: 0, min: 0, max: 1, act: true },   // chorus/ensemble (mezcla wet)
  chSpd:   { def: 0.6, min: 0.05, max: 8, unit: ' Hz' },
  chMode:  { def: 'chorus' },                       // 'chorus' | 'ensemble' (triple chorus a 3 fases)
  dlyAmt:  { def: 0, min: 0, max: 0.9, act: true },
  dlyTime: { def: 0.3, min: 0.02, max: 1.5, unit: ' s' },
  dlySync: { def: 'libre' },                        // 'libre' | 1/8 | 1/8. | 1/4 | 1/4. | 1/2 (usa bpm)
  bpm:     { def: 120, min: 40, max: 220, unit: ' bpm' },

  // --- Espacio ---
  width:      { def: 0, min: 0, max: 1, act: true },
  panLfoLvl:  { def: 0, min: 0, max: 1, act: true },    // autopan por voz
  panLfoSpd:  { def: 0.4, min: 0.05, max: 8, unit: ' Hz' },
  reverbMix:  { def: 0, min: 0, max: 0.6, act: true },
  reverbSize: { def: 1.8, min: 0.2, max: 4, unit: ' s' },
  reverbDamp: { def: 0, min: 0, max: 1 },           // los agudos de la cola mueren antes (vive en la IR)
  reverbPre:  { def: 0, min: 0, max: 0.1, unit: ' s' },  // predelay: separa el ataque de la cola

  // --- Envolvente / voz / master ---
  a: { def: 0.01, min: 0.001, max: 2, step: 0.001, fmt: msFmt },
  d: { def: 0.2,  min: 0.001, max: 2, step: 0.001, fmt: msFmt },
  s: { def: 0.7,  min: 0, max: 1, step: 0.01, fmt: twoDec },
  r: { def: 0.3,  min: 0.001, max: 3, step: 0.001, fmt: msFmt },
  glide:  { def: 0, min: 0, max: 1, unit: ' s', act: true },
  pitchEnvAmt: { def: 0, min: -2400, max: 2400, unit: ' ct', act: true },   // envolvente de pitch por nota
  pitchEnvDec: { def: 0.08, min: 0.005, max: 1, unit: ' s' },
  mode:   { def: 'poly' },
  arpMode: { def: 'off' },                          // off | up | down | updown | random
  arpDiv:  { def: '1/16' },                         // división musical del paso (usa bpm)
  arpOct:  { def: '1' },                            // octavas del patrón (1..3, seg de botones)
  arpGate: { def: 0.5, min: 0.05, max: 1 },         // duración de cada paso (fracción)
  seqOn:     { def: 'off' },                        // off | on — secuenciador de pasos
  seqPat:    { def: '0 3 7 12 . 7 3 .' },           // frase en semitonos, '.'=silencio (máx 16 pasos)
  seqDiv:    { def: '1/16' },                       // división musical del paso (usa bpm)
  seqGate:   { def: 0.6, min: 0.05, max: 1 },       // duración de cada paso (fracción)
  seqLatch:  { def: 'off' },                        // on: la frase sigue al soltar la tecla
  seqRetrig: { def: 'off' },                        // on: nueva tecla reinicia la frase (en rejilla)
  wsOn:   { def: 'off' },                           // off | on — secuencia de tabla (wave sequencing)
  wsPat:  { def: '0 . 7 . 3 5 7 .' },               // frase de FRAMES 0..7, '.' = mantener (máx 16 pasos)
  wsDiv:  { def: '1/16' },                          // división musical del paso (usa bpm)
  wsMode: { def: 'loop' },                          // loop | 1shot (una pasada: envolvente de timbre)
  wsXf:   { def: 0.25, min: 0, max: 1, fmt: v => (v * 100).toFixed(0) + '%' },  // fundido: fracción del paso (1 = glissando)
  master: { def: 0.7, min: 0, max: 1, step: 0.01, fmt: twoDec },
};

/* --- Matriz de modulación: MX_SLOTS filas fuente → destino × cantidad. ---
   Claves PLANAS (mx1src…mx6amt) generadas aquí mismo: así presets v2,
   snapshot, Reset y MIDI learn funcionan sin ningún caso especial.
   La cantidad va en ±1 y cada destino la escala por MX_SPAN (espacio-motor).
   El cutoff se modula por el DETUNE del filtro (cents ⇒ exponencial, octavas
   simétricas): matemáticamente incapaz de cruzar 0 Hz — la lección del
   cutLFO (presets que se apagaban) garantizada por construcción. */
export const MX_SLOTS = 6;
export const MX_SOURCES = [                 // señales: LFOs CRUDOS (±1, su knob Level no interviene) y env de filtro (0..1·vel)
  { id: 'off',     label: '—' },            // valores por nota ("CV"): velocity, altura de la nota, S&H aleatorio
  { id: 'lfoCut',  label: 'LFO cutoff' },
  { id: 'lfoRes',  label: 'LFO reso' },
  { id: 'lfoAmp',  label: 'LFO trémolo' },
  { id: 'lfoFreq', label: 'LFO vibrato' },
  { id: 'lfoPwm',  label: 'LFO PWM' },
  { id: 'env',     label: 'Env filtro' },
  { id: 'vel',     label: 'Velocity' },
  { id: 'note',    label: 'Nota (altura)' },
  { id: 'rnd',     label: 'S&H por nota' },
];
export const MX_DESTS = [
  { id: 'pitch',  label: 'Pitch' },         // cents sobre el detune de ambos osciladores
  { id: 'pw',     label: 'Pulse width' },   // el AudioParam del worklet recorta a [0.01, 0.99]
  { id: 'cutoff', label: 'Cutoff' },        // octavas (detune del filtro, ±4 oct)
  { id: 'reso',   label: 'Resonancia' },    // dB sobre la Q de la etapa final
  { id: 'amp',    label: 'Amplitud' },      // ganancia por voz TRAS el VCA (1 ± mod)
  { id: 'pan',    label: 'Pan' },
  { id: 'wt',     label: 'Wavetable' },     // morph de la tabla (el AudioParam recorta a [0,1])
  { id: 'vow',    label: 'Vocal' },         // recorre las vocales a audio-rate (los WaveShapers saturan en u/i)
];
export const MX_SPAN = { pitch: 1200, pw: 0.45, cutoff: 4800, reso: 12, amp: 1, pan: 1, wt: 1, vow: 1 };
for (let i = 1; i <= MX_SLOTS; i++) {
  PARAMS['mx' + i + 'src'] = { def: 'off' };
  PARAMS['mx' + i + 'dst'] = { def: 'cutoff' };
  PARAMS['mx' + i + 'amt'] = { def: 0, min: -1, max: 1, act: true };
}

// Posición de slider (0..1 si log) <-> valor de motor. Para params sin `log`
// la posición ES el valor (el <input> lleva min/max/step reales).
export const posToVal = (p, x) => p.log ? p.min * Math.pow(p.max / p.min, x) : x;
export const valToPos = (p, v) => p.log ? Math.log(v / p.min) / Math.log(p.max / p.min) : v;
