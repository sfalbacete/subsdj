/* =====================================================================
   SubSDJ · PARAMS — tabla ÚNICA de parámetros (fuente de verdad).
   Clave = nombre canónico (es la clave de CONTROLS y de los presets v2).
   Valores SIEMPRE en espacio-motor (Hz, segundos, cents, 0..1…).
   Campos:
     def       valor por defecto (de aquí derivan state.js y toda la UI): NEUTRO,
               es lo que deja Reset (los presets van sobre PRESET_BASE, abajo)
     min/max   rango del control
     t         target del motor si no coincide con la clave ('oscA.detune')
     unit      sufijo para el formato genérico de los knobs (' Hz', ' ct'…)
     step      granularidad del slider (solo sliders)
     fmt       formato de presentación específico (solo sliders)
     log       true = el slider trabaja en posición 0..1 con mapeo log min→max
     lmin      suelo del tramo log cuando min = 0 (posición 0 = 0 EXACTO —
               «apagado» o «escalón»—, y a partir de ahí log desde lmin)
     act       true = el 0 es "apagado" (no un ajuste): el knob se atenúa a 0
               y el parámetro cuenta para los LEDs de actividad (ui/activity.js)
   El switch de AudioEngine.set() sigue siendo quien APLICA cada parámetro
   al grafo: eso es lógica de audio, no metadatos, y ahí es legible.
   ===================================================================== */

import { VOC_ORDEN } from './vocal.js';

const msFmt = v => (v * 1000).toFixed(0) + ' ms';
// Tiempos ×10 (Roadmap 5.0 · bloque 1): ms por debajo de 1 s, segundos por encima
const secFmt = v => v >= 1 ? v.toFixed(2) + ' s' : (v * 1000).toFixed(0) + ' ms';
// LFOs lentos de verdad (0,005 Hz = un ciclo cada 200 s): tres decimales por debajo de 0,1 Hz
const hzFmt = v => (v < 0.1 ? v.toFixed(3) : v < 10 ? v.toFixed(2) : v.toFixed(1)) + ' Hz';
const decFmt = v => v >= 3.99 ? '∞' : (v < 1 ? (v * 1000).toFixed(0) + ' ms' : v.toFixed(2) + ' s');   // decay por operador (FM4): tope = plano
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
  octA:     { def: 0, min: -2, max: 2, t: 'oscA.oct' },        // Octava: transposición ±2 (−1 = suboscilador; por nota)
  octavesA: { def: 1, min: 1, max: 4, t: 'oscA.octaves' },    // Apiladas: 1-4 octavas hacia ARRIBA dentro del oscilador
  waveB:    { def: 'square', t: 'oscB.wave' },
  detuneB:  { def: 0, min: -50, max: 50, unit: ' ct', t: 'oscB.detune' },
  phaseB:   { def: 0, min: 0, max: 360, unit: '°', t: 'oscB.phase' },
  octB:     { def: 0, min: -2, max: 2, t: 'oscB.oct' },
  octavesB: { def: 1, min: 1, max: 4, t: 'oscB.octaves' },
  mix:      { def: 0, min: 0, max: 1 },                // 0 = solo A · 1 = solo B (Reset: el oscilador A a solas)
  ring:     { def: 0, min: 0, max: 1, act: true },
  noise:    { def: 0, min: 0, max: 1, act: true },
  noiseColor:{ def: 0, min: -1, max: 1 },           // − oscuro (LP) · 0 blanco · + "aire" (HP)
  spread:   { def: 0.5, min: 0, max: 1 },
  drift:    { def: 0, min: 0, max: 15, unit: ' ct', act: true },   // deriva aleatoria lenta por oscilador (analógico)
  uniVoices:{ def: '1' },                               // unison: 1..7 copias por oscilador (seg; supersaw lo ignora)
  uniDetune:{ def: 12, min: 0, max: 50, unit: ' ct' },  // detune de los extremos del unison
  fmRatio:  { def: 1, min: 0.25, max: 12 },
  fmIndex:  { def: 0, min: 0, max: 12, act: true },
  fmFb:     { def: 0, min: 0, max: 1, act: true },   // realimentación del modulador (op. 6 del DX7): su seno se acerca a una sierra; a tope, ruido
  // FM4 (onda 'fm4'): algoritmo + ratio / nivel / decay de cada operador (el 1 es la portadora básica)
  fm4Alg: { def: '0' },                             // índice en FM4_ALGS del worklet (seg de 8 botones)
  fm4R1: { def: 1, min: 0.25, max: 12 }, fm4L1: { def: 1,   min: 0, max: 1 }, fm4D1: { def: 4,    min: 0.005, max: 4, log: true, fmt: decFmt },
  fm4R2: { def: 2, min: 0.25, max: 12 }, fm4L2: { def: 0.4, min: 0, max: 1 }, fm4D2: { def: 0.6,  min: 0.005, max: 4, log: true, fmt: decFmt },
  fm4R3: { def: 1, min: 0.25, max: 12 }, fm4L3: { def: 0.3, min: 0, max: 1 }, fm4D3: { def: 0.3,  min: 0.005, max: 4, log: true, fmt: decFmt },
  fm4R4: { def: 3, min: 0.25, max: 12 }, fm4L4: { def: 0.2, min: 0, max: 1 }, fm4D4: { def: 0.15, min: 0.005, max: 4, log: true, fmt: decFmt },
  wtSet:    { def: 'analógica' },                   // tabla de ondas (oscs en modo 'Tabla'; global A+B)
  wtPos:    { def: 0, min: 0, max: 1 },             // morph: posición entre los frames de la tabla
  wtUser:   { def: '' },                            // receta de la tabla 'usuario' DENTRO del preset ('' = respeta la dibujada)

  // --- Modulación ---
  pulseWidth: { def: 0.5, min: 0.02, max: 0.98, step: 0.01, fmt: v => (v * 100).toFixed(0) + '%' },
  // LFOs: Speed en log desde 0,005 Hz (un ciclo cada 200 s: la escala del
  // paisaje, no del vibrato) — Roadmap 5.0 · bloque 1 «tiempo ×10»
  pwmLfoLvl:  { def: 0, min: 0, max: 0.45, act: true },
  pwmLfoSpd:  { def: 3, min: 0.005, max: 20, log: true, fmt: hzFmt },
  pwmLfoShape:{ def: 'sine' },
  amplitude:  { def: 0.8, min: 0, max: 1, step: 0.01, fmt: twoDec },
  ampLfoLvl:  { def: 0, min: 0, max: 0.6, act: true },
  ampLfoSpd:  { def: 5, min: 0.005, max: 20, log: true, fmt: hzFmt },
  ampLfoShape:{ def: 'sine' },
  freqCents:  { def: 0, min: -1200, max: 1200, step: 1, fmt: v => v.toFixed(0) + ' ct' },
  freqLfoLvl: { def: 0, min: 0, max: 200, unit: ' ct', act: true },
  freqLfoSpd: { def: 5, min: 0.005, max: 20, log: true, fmt: hzFmt },
  freqLfoShape:{ def: 'sine' },
  lfoFade:    { def: 0, min: 0, max: 20, log: true, lmin: 0.05, fmt: secFmt, act: true },   // vibrato/PWM entran en rampa tras cada noteOn (0 = inmediato)

  // --- Filtro (por voz) ---
  cutoff:    { def: 20000, min: 20, max: 20000, log: true,   // Reset: abierto (con Reso −3 dB, plano a ±0,02 dB hasta 12 kHz)
               fmt: v => v >= 1000 ? (v / 1000).toFixed(2) + ' kHz' : v.toFixed(0) + ' Hz' },
  cutLfoLvl: { def: 0, min: 0, max: 5000, unit: ' Hz', act: true },
  cutLfoSpd: { def: 2, min: 0.005, max: 20, log: true, fmt: hzFmt },
  cutLfoShape:{ def: 'sine' },
  // Q en dB (la de lowpass/highpass en WebAudio): −3 dB = Q lineal 0,707, el Butterworth PLANO (sin pico); 0 dB ya marca ~1,25 dB en el corte
  reso:      { def: -3, min: -3, max: 24, step: 0.1, fmt: v => v.toFixed(1) },
  resLfoLvl: { def: 0, min: 0, max: 15, act: true },
  resLfoSpd: { def: 2, min: 0.005, max: 20, log: true, fmt: hzFmt },
  resLfoShape:{ def: 'sine' },
  morph:        { def: 0, min: 0, max: 1 },
  filterEnvAmt: { def: 0, min: -6000, max: 6000, unit: ' Hz', act: true },
  keytrack:     { def: 0, min: 0, max: 1, act: true },  // el cutoff sigue la altura de la nota (1 = 1:1)
  filterSlope:  { def: '12' },                    // '12' | '24' dB/oct (2ª etapa en cascada; por nota)
  filterType:   { def: 'morph' },                 // 'morph' (LP↔HP paralelo) | 'bp' (LP y HP en serie) | 'notch' (LP + HP a 1); estructura: por nota
  filterDrive:  { def: 0, min: 0, max: 1, act: true },  // saturación tanh PRE-filtro por voz (0 = transparente)
  fenvMode: { def: 'link' },                        // 'link' = la env del filtro usa el ADSR de amplitud
  fa: { def: 0.01, min: 0.001, max: 20, log: true, fmt: secFmt },   // tiempos ×10, en log (1 ms y 20 s en el mismo knob)
  fd: { def: 0.2,  min: 0.001, max: 20, log: true, fmt: secFmt },
  fs: { def: 0.7,  min: 0, max: 1 },
  fr: { def: 0.3,  min: 0.001, max: 30, log: true, fmt: secFmt },

  // --- Vocal (banco de formantes por voz, entre el drive y el filtro) ---
  vocAmt:   { def: 0, min: 0, max: 1, act: true },  // dry/wet del tracto vocal (0 = sin banco)
  vocVowel: { def: 0.5, min: 0, max: 1, fmt: vowelFmt },   // recorrido u→o→a→e→i (0.5 = /a/)
  vocSize:  { def: 0, min: -1200, max: 1200, unit: ' ct' },// tamaño del tracto: + niño · − gigante
  vocQ:     { def: 0.5, min: 0, max: 1 },           // definición: 0 = robot (bandas finas) · 1 = suave
  vocVida:  { def: 0, min: 0, max: 1, act: true },  // micro-deriva de los formantes (humaniza)
  vocBrillo:{ def: 0.5, min: 0, max: 1 },           // formante del cantante (F4-F5): 0 = sin ellos · 0.5 = tabla · 1 = +12 dB
  vocAtk:   { def: 0, min: 0, max: 1, act: true },  // golpe consonántico: burst de ruido por el tracto al arrancar la nota

  // --- Resonador (Roadmap 5.0 · bloque 5): banco modal por voz afinado a la nota, tras el Vocal; engine/reson.js ---
  resAmt:    { def: 0, min: 0, max: 1, act: true },  // dry/wet del banco (0 = sin banco)
  resMat:    { def: 0.5, min: 0, max: 1 },           // material: 0 = cuerda/tubo (armónicos 1, 2, 3…) … 1 = barra/cuenco (1, 2,76, 5,40…)
  resDecay:  { def: 0.5, min: 0, max: 1 },           // Q en log 10 → 600: cuánto tarda cada modo en cantar y en apagarse (τ = Q/(π·f))
  resBrillo: { def: 0.5, min: 0, max: 1 },           // reparto entre modos graves y agudos (0 oscuro · 0,77 plano · 1 brillante), a nivel constante

  // --- FX ---
  dist:    { def: 0, min: 0, max: 1, act: true },
  flAmt:   { def: 0, min: 0, max: 1, act: true },
  flSpd:   { def: 0.3, min: 0.05, max: 8, unit: ' Hz' },
  chAmt:   { def: 0, min: 0, max: 1, act: true },   // chorus/ensemble (mezcla wet)
  chSpd:   { def: 0.6, min: 0.05, max: 8, unit: ' Hz' },
  chMode:  { def: 'chorus' },                       // 'chorus' | 'ensemble' (triple chorus a 3 fases)
  dlyAmt:  { def: 0, min: 0, max: 0.9, act: true },
  dlyTime: { def: 0.3, min: 0.02, max: 4, log: true, fmt: secFmt },   // hasta 4 s (ecos en el horizonte); Sala.DLY_MAX acompaña
  dlySync: { def: 'libre' },                        // 'libre' | 1/8 | 1/8. | 1/4 | 1/4. | 1/2 (usa bpm)
  dlyDamp: { def: 0, min: 0, max: 1, act: true },   // filtro EN EL BUCLE: cada repetición pierde agudos (y algo de graves), como cinta/BBD
  dlyWow:  { def: 0, min: 0, max: 1, act: true },   // modulación lenta del tiempo: cada repetición se desafina un pelo (wow de cinta)
  bpm:     { def: 120, min: 40, max: 220, unit: ' bpm' },

  // --- Espacio ---
  width:      { def: 0, min: 0, max: 1, act: true },
  panLfoLvl:  { def: 0, min: 0, max: 1, act: true },    // autopan por voz
  panLfoSpd:  { def: 0.4, min: 0.005, max: 8, log: true, fmt: hzFmt },
  reverbMix:  { def: 0, min: 0, max: 0.6, act: true },
  reverbSize: { def: 1.8, min: 0.2, max: 20, log: true, fmt: secFmt },   // hasta 20 s: IR de 20 s (CPU lineal con la IR) o placa (tabla medida hasta 26 s)
  reverbDamp: { def: 0, min: 0, max: 1 },           // los agudos de la cola mueren antes (vive en la IR)
  reverbPre:  { def: 0, min: 0, max: 0.25, unit: ' s', fmt: msFmt },  // predelay: separa el ataque de la cola (hasta 250 ms: la sala «lejos»)
  reverbType: { def: 'sala' },                      // 'sala' = convolución (IR de ruido) | 'placa' = algorítmica (Dattorro)
  // Shimmer (Roadmap 5.0 · bloque 3; claves de la SALA): la cola vuelve a entrar
  // en la reverb desplazada de tono → un coro que asciende en cada vuelta
  shimAmt:    { def: 0, min: 0, max: 1, act: true },   // cuánto vuelve (energía por vuelta = shimAmt·Sala.SHIM_LOOP_MAX)
  shimInt:    { def: '+12' },                          // intervalo: '+12' octava (el clásico) | '+7' quinta | '+5' cuarta | '-12' octava abajo
  // Cinta en el máster (Roadmap 5.0 · bloque 7; claves de la SALA): saturación
  // suave y wow/flutter sobre la mezcla entera — a 0 exactas (el siseo se quitó tras escucharlo: no aportaba)
  tapeSat:    { def: 0, min: 0, max: 1, act: true },   // tanh con entrada hasta ×2 (el knob entra al cuadrado) + pérdida de agudos (log 20 → 8 kHz)
  tapeWow:    { def: 0, min: 0, max: 1, act: true },   // deriva irregular del tono (≈ ±40 ct a tope: cinta estropeada; ±12 a 0,3) + flutter a 6,5 Hz (≈ ±6 ct)

  // --- Envolvente / voz / master ---
  // Tiempos ×10 (Roadmap 5.0 · bloque 1): hasta 20 s de ataque y 30 s de release.
  // En LOG: un slider lineal de 0..20 s pondría el milisegundo en el 0,005 % del
  // recorrido; en log, 1 ms y 20 s caben en la misma barra con resolución pareja.
  // El ataque conserva el 0 EXACTO en la posición 0 (lmin): el golpe es el escalón.
  // Reset = PUERTA: sustain 1 y ataque/release de 2/20 ms (lo justo contra el clic)
  a: { def: 0.002, min: 0, max: 20, log: true, lmin: 0.001, fmt: secFmt },   // 0 = escalón (percusión: el golpe es el escalón)
  d: { def: 0.2,  min: 0.001, max: 20, log: true, fmt: secFmt },
  s: { def: 1,    min: 0, max: 1, step: 0.01, fmt: twoDec },
  r: { def: 0.02, min: 0.001, max: 30, log: true, fmt: secFmt },
  envCurve: { def: 0, min: 0, max: 1, act: true },   // 0 = rampas lineales (como siempre) · 1 = tramos RC (analógico): ataque y decay exponenciales
  // Flam (clap 808): hits−1 ráfagas cortas separadas hitGap ANTES del ADSR (Voice._flam); 1 = sin flam (camino de siempre)
  hits:   { def: 1, min: 1, max: 4, step: 1, fmt: v => Math.round(v) + (Math.round(v) > 1 ? ' golpes' : ' golpe') },
  hitGap: { def: 0.012, min: 0.005, max: 0.04, unit: ' s', fmt: v => (v * 1000).toFixed(0) + ' ms' },
  glide:  { def: 0, min: 0, max: 10, log: true, lmin: 0.01, fmt: secFmt, act: true },   // hasta 10 s: drones que resbalan
  pitchEnvAmt: { def: 0, min: -2400, max: 2400, unit: ' ct', act: true },   // envolvente de pitch por nota
  pitchEnvDec: { def: 0.08, min: 0.005, max: 10, log: true, fmt: secFmt },  // hasta 10 s: risers y caídas lentas
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
export const FM4_KEYS = ['fm4Alg', 'fm4R1', 'fm4L1', 'fm4D1', 'fm4R2', 'fm4L2', 'fm4D2', 'fm4R3', 'fm4L3', 'fm4D3', 'fm4R4', 'fm4L4', 'fm4D4'];

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
  { id: 'drift',   label: 'Deriva (voz)' },  // paseo lento PROPIO de cada voz (nodes.mkVoiceLFO 'drift' a mxDriftSpd): el acorde respira voz a voz
  // Fuentes de EJECUCIÓN (Roadmap 5.0 · bloque 4), 0..1 por motor (AudioEngine.perf):
  // el pad se TOCA durante la nota. 0 = reposo, así un preset suena igual sin tocarlas.
  { id: 'wheel',   label: 'Rueda (CC1)' },   // rueda de modulación: la de pantalla (bajo el teclado) o el CC1
  { id: 'at',      label: 'Aftertouch' },    // presión del teclado MIDI (canal; el polifónico se trata igual)
  { id: 'expr',    label: 'Expresión (CC11)' },  // pedal de expresión
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
  { id: 'fm',     label: 'FM índice' },     // índice de modulación (el AudioParam recorta en 0): env→fm = pluck DX, vel→fm = tacto DX
];
export const MX_SPAN = { pitch: 1200, pw: 0.45, cutoff: 4800, reso: 12, amp: 1, pan: 1, wt: 1, vow: 1, fm: 8 };
for (let i = 1; i <= MX_SLOTS; i++) {
  PARAMS['mx' + i + 'src'] = { def: 'off' };
  PARAMS['mx' + i + 'dst'] = { def: 'cutoff' };
  PARAMS['mx' + i + 'amt'] = { def: 0, min: -1, max: 1, act: true };
}
// Modulación POR VOZ (Roadmap 5.0 · bloque 2): velocidad de la fuente «Deriva
// (voz)» (0,05 Hz = un vaivén cada 20 s) y fase de los LFO de cutoff/reso/
// vibrato/PWM/pan: 'global' = un LFO por motor (como siempre; el acorde respira
// en bloque) · 'voz' = cada voz arranca los suyos en una fase distinta
// (estructura: aplica por nota, como filterSlope).
PARAMS.mxDriftSpd = { def: 0.05, min: 0.005, max: 5, log: true, fmt: hzFmt };
PARAMS.lfoPhase = { def: 'global' };

/* --- Base de los presets ---
   Los `def` de arriba son NEUTROS: Reset (y el arranque) dejan el oscilador A
   a solas, sin desafinar, con el filtro abierto y plano y la envolvente en
   puerta; ningún módulo toca la señal. Pero los presets se guardan como
   DIFERENCIAS (fábrica, bancos del repo, demos, escenas a mano: solo lo que
   se desvía), y se escribieron sobre los defaults de antes (hasta oct-2026):
   B a +7 ct mezclado al 0,4, LP a 6 kHz con 2 dB, ADSR 10 ms / 0,7 / 300 ms.
   Un preset NO vacío se aplica sobre esta base (state.withPresetBase) y suena
   exactamente igual que antes; los guardados con Guardar llevan todas las
   claves (snapshot), así que la base no les cambia nada. {} sigue siendo Reset.
   Un preset NUEVO escrito a mano también parte de aquí (o fija las claves). */
export const PRESET_BASE = { detuneB: 7, mix: 0.4, cutoff: 6000, reso: 2, a: 0.01, s: 0.7, r: 0.3 };

// Posición de slider (0..1 si log) <-> valor de motor. Para params sin `log`
// la posición ES el valor (el <input> lleva min/max/step reales).
// Log con min = 0 (`lmin`): la posición 0 es 0 EXACTO (ataque = escalón, glide
// apagado) y el resto del recorrido va en log desde lmin hasta max. Un valor
// entre 0 y lmin cae en la posición 0 (no hay presets ahí: lmin es el paso viejo).
const logLo = p => p.min > 0 ? p.min : p.lmin;
export const posToVal = (p, x) => !p.log ? x : (x <= 0 ? p.min : logLo(p) * Math.pow(p.max / logLo(p), x));
export const valToPos = (p, v) => !p.log ? v : (v <= p.min ? 0 : Math.max(0, Math.log(v / logLo(p)) / Math.log(p.max / logLo(p))));
