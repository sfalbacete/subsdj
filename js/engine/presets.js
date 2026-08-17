/* =====================================================================
   SubSDJ · mega-banco de presets, organizado por tipo de sonido.
   FORMATO v2: valores en ESPACIO-MOTOR (cutoff en Hz, tiempos en s…),
   las claves son los nombres canónicos de PARAMS. Cada preset declara
   sólo lo que se desvía del default; los nombres son ÚNICOS en todo el
   banco (el lookup es por nombre).
   Los presets de usuario v1 (cutoff = posición 0..1 del slider) se
   migran automáticamente a v2 la primera vez (v1 queda como copia).
   REGLA cutLFO: el LFO de cutoff SUMA Hz al valor base (Voice.js), así
   que cutoff − cutLfoLvl debe quedar ≥ ~150 Hz; si la suma cruza 0 el
   lowpass se clava en 0 Hz y el preset se apaga en cada semiciclo.
   ===================================================================== */
import { PARAMS, posToVal } from './params.js';

export const FACTORY = {
  'Básicos': {
    'Init (default)': {},
  },

  'Bajos': {
    'Sub redondo': { waveA: 'sine', waveB: 'triangle', mix: 0.35, cutoff: 448, reso: 1,
      a: 0.005, d: 0.2, s: 0.6, r: 0.15, master: 0.82 },
    'Bajo grueso': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -8, detuneB: 12, mix: 0.5,
      cutoff: 514, reso: 5, filterEnvAmt: 1500, dist: 0.15, a: 0.005, d: 0.25, s: 0.35, r: 0.18, master: 0.78 },
    'Reese': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -22, detuneB: 22, mix: 0.5,
      cutoff: 364, reso: 3, dist: 0.1, a: 0.005, d: 0.3, s: 0.85, r: 0.2, width: 0.3, master: 0.72 },
    'Bajo pluck': { waveA: 'sawtooth', waveB: 'square', mix: 0.35, cutoff: 448, reso: 6,
      filterEnvAmt: 2600, a: 0.002, d: 0.2, s: 0.0, r: 0.13, master: 0.78 },
    'Ácido 303': { mode: 'mono', waveA: 'sawtooth', waveB: 'sawtooth', mix: 0.15, cutoff: 317, reso: 20,
      filterEnvAmt: 2800, glide: 0.06, dist: 0.35, a: 0.003, d: 0.2, s: 0.2, r: 0.1 },
    'Slide bass': { mode: 'mono', waveA: 'sawtooth', waveB: 'sawtooth', detuneB: 6, mix: 0.1,
      cutoff: 448, reso: 6, filterEnvAmt: 2000, glide: 0.12, a: 0.005, d: 0.2, s: 0.5, r: 0.2, master: 0.78 },
    'Wobble dub': { waveA: 'sawtooth', waveB: 'square', mix: 0.4, cutoff: 900, reso: 12,
      cutLfoLvl: 750, cutLfoSpd: 5, dist: 0.3, a: 0.005, d: 0.3, s: 0.8, r: 0.2 },
    'Bajo cremoso (24 dB)': { waveA: 'sawtooth', waveB: 'sawtooth', detuneB: 10, mix: 0.45,
      cutoff: 420, reso: 3, filterSlope: '24', filterDrive: 0.5, filterEnvAmt: 1200,
      a: 0.005, d: 0.25, s: 0.5, r: 0.2, master: 0.75 },
    /* matriz: nota→PW — abajo pulso ancho (gordo), arriba estrecho (nasal):
       el timbre cambia a lo largo del teclado, no solo el brillo */
    'Bajo camaleón (nota→PW)': { waveA: 'square', waveB: 'square', pulseWidth: 0.35, mix: 0.35,
      cutoff: 900, reso: 3, keytrack: 0.3, filterEnvAmt: 1500,
      mx1src: 'note', mx1dst: 'pw', mx1amt: -0.35,
      a: 0.004, d: 0.22, s: 0.3, r: 0.15, master: 0.75 },
  },

  'Leads': {
    'Lead brillante': { waveA: 'sawtooth', waveB: 'square', detuneB: 10, mix: 0.45, cutoff: 4080, reso: 3,
      freqLfoLvl: 12, freqLfoSpd: 5.5, dlyAmt: 0.25, dlyTime: 0.28, a: 0.01, d: 0.2, s: 0.8, r: 0.25, width: 0.25 },
    'Lead cuadrado': { waveA: 'square', waveB: 'square', pulseWidth: 0.35, detuneB: 6, mix: 0.5,
      cutoff: 2520, reso: 2, a: 0.01, d: 0.15, s: 0.8, r: 0.2, dlyAmt: 0.2, width: 0.25 },
    'Supersaw lead': { waveA: 'supersaw', spread: 0.5, waveB: 'square', mix: 0.3, cutoff: 4380, reso: 1.5,
      a: 0.01, d: 0.2, s: 0.85, r: 0.25, width: 0.4, reverbMix: 0.2, dlyAmt: 0.2 },
    'Supersaw trance': { waveA: 'supersaw', waveB: 'supersaw', spread: 0.7, detuneB: 5, mix: 0.5,
      cutoff: 5020, reso: 1.5, filterEnvAmt: 1500, a: 0.02, d: 0.35, s: 0.85, r: 0.45,
      dlyAmt: 0.28, dlyTime: 0.4, width: 0.7, reverbMix: 0.28, master: 0.52 },
    'Lead mono glide': { mode: 'mono', waveA: 'sawtooth', waveB: 'sawtooth', detuneB: 8, mix: 0.3,
      cutoff: 1260, reso: 4, filterEnvAmt: 1500, glide: 0.07, a: 0.005, d: 0.2, s: 0.7, r: 0.2, dlyAmt: 0.25, width: 0.3 },
    'PWM lead': { waveA: 'square', waveB: 'square', pulseWidth: 0.5, pwmLfoLvl: 0.3, pwmLfoSpd: 1.5,
      detuneB: 5, mix: 0.5, cutoff: 2890, reso: 2, a: 0.02, d: 0.2, s: 0.8, r: 0.3, width: 0.3, reverbMix: 0.15 },
    'Flauta vibrato': { waveA: 'sine', waveB: 'triangle', mix: 0.4, freqLfoLvl: 18, freqLfoSpd: 5.5,
      cutoff: 2890, a: 0.08, d: 0.1, s: 0.9, r: 0.2, reverbMix: 0.28, width: 0.2 },
    /* matriz: el MISMO LFO hace el vibrato (ruta dedicada) y abre el filtro
       (ruta de matriz, crudo): wah y pitch en fase, como la mano de un guitarrista */
    'Wah al vibrato': { waveA: 'sawtooth', waveB: 'square', detuneB: 8, mix: 0.4,
      freqLfoLvl: 25, freqLfoSpd: 5, lfoFade: 0.5,
      cutoff: 1600, reso: 4, mx1src: 'lfoFreq', mx1dst: 'cutoff', mx1amt: 0.25,
      a: 0.01, d: 0.2, s: 0.8, r: 0.25, dlyAmt: 0.2, width: 0.3 },
  },

  'Pads': {
    'Pad cálido': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -10, detuneB: 14, octavesB: 2, mix: 0.5,
      cutoff: 1180, reso: 2, cutLfoLvl: 800, cutLfoSpd: 0.2, a: 0.8, d: 0.5, s: 0.8, r: 2.0,
      dlyAmt: 0.3, dlyTime: 0.5, width: 0.6, reverbMix: 0.32, reverbSize: 2.6, master: 0.6 },
    'PWM strings': { waveA: 'square', waveB: 'square', detuneB: 8, octavesB: 2, mix: 0.5,
      pulseWidth: 0.5, pwmLfoLvl: 0.3, pwmLfoSpd: 0.6, cutoff: 2520, reso: 1, a: 0.3, d: 0.4, s: 0.85, r: 0.6,
      dlyAmt: 0.2, dlyTime: 0.4, width: 0.5, reverbMix: 0.3, master: 0.6 },
    'Supersaw pad': { waveA: 'supersaw', waveB: 'supersaw', spread: 0.7, detuneB: 6, mix: 0.5,
      cutoff: 1260, reso: 1.5, a: 0.6, d: 0.5, s: 0.85, r: 1.8, width: 0.7, reverbMix: 0.35, reverbSize: 3, master: 0.55 },
    'Pad de cristal': { waveA: 'sine', waveB: 'sine', ring: 0.3, detuneB: 12, octavesB: 2, mix: 0.5,
      cutoff: 5020, a: 0.5, d: 0.6, s: 0.7, r: 1.5, width: 0.5, reverbMix: 0.4, reverbSize: 3.2, master: 0.6 },
    'Pad evolutivo': { waveA: 'sawtooth', waveB: 'triangle', detuneB: 10, mix: 0.5, cutoff: 1000,
      cutLfoLvl: 800, cutLfoSpd: 0.12, reso: 3, resLfoLvl: 4, resLfoSpd: 0.1, a: 1.0, d: 0.6, s: 0.8, r: 2.5,
      width: 0.6, reverbMix: 0.35, reverbSize: 3.5, master: 0.55 },
    'Coro (choir)': { waveA: 'supersaw', spread: 0.4, waveB: 'sine', mix: 0.4, cutoff: 1450,
      a: 0.7, d: 0.5, s: 0.85, r: 2.0, width: 0.6, reverbMix: 0.4, reverbSize: 3, master: 0.55 },
    'Strings ensemble': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -6, detuneB: 9, mix: 0.5,
      cutoff: 2000, chMode: 'ensemble', chAmt: 0.7, chSpd: 0.5, drift: 3, a: 0.4, d: 0.4, s: 0.85, r: 1.2,
      width: 0.4, reverbMix: 0.25, master: 0.6 },
    'Solina strings': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -4, detuneB: 5, octavesB: 2, mix: 0.35,
      cutoff: 3600, reso: 0.7, morph: 0.12, chMode: 'ensemble', chAmt: 0.85, chSpd: 0.65, drift: 4,
      freqLfoLvl: 7, freqLfoSpd: 5.2, lfoFade: 0.7, a: 0.22, d: 0.3, s: 0.9, r: 0.9,
      width: 0.35, reverbMix: 0.22, reverbSize: 2.2, master: 0.6 },
    'Ensemble PWM': { waveA: 'square', waveB: 'square', pulseWidth: 0.45, pwmLfoLvl: 0.28, pwmLfoSpd: 0.7,
      lfoFade: 0.9, detuneB: 6, mix: 0.5, cutoff: 2800, reso: 1, chMode: 'ensemble', chAmt: 0.75, chSpd: 0.55,
      drift: 3, a: 0.35, d: 0.4, s: 0.85, r: 1.1, width: 0.4, reverbMix: 0.25, master: 0.6 },
    'Pad mantequilla': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -7, detuneB: 9, mix: 0.5,
      cutoff: 900, reso: 1.2, filterSlope: '24', filterDrive: 0.35, chMode: 'ensemble', chAmt: 0.6, chSpd: 0.55,
      drift: 3, a: 0.5, d: 0.5, s: 0.85, r: 1.6, width: 0.5, reverbMix: 0.3, reverbSize: 2.6, master: 0.6 },
    'Pad catedral': { waveA: 'sawtooth', waveB: 'triangle', detuneA: -6, detuneB: 8, octavesB: 2, mix: 0.45,
      cutoff: 1600, reso: 1, filterSlope: '24', chMode: 'ensemble', chAmt: 0.5, chSpd: 0.5, drift: 3,
      a: 0.7, d: 0.6, s: 0.85, r: 2.2, width: 0.6,
      reverbMix: 0.42, reverbSize: 3.6, reverbDamp: 0.6, reverbPre: 0.04, master: 0.58 },
    'Pad PWM unison': { waveA: 'square', waveB: 'square', pulseWidth: 0.45, pwmLfoLvl: 0.25, pwmLfoSpd: 0.6,
      lfoFade: 0.8, uniVoices: '5', uniDetune: 16, detuneB: 6, mix: 0.5, cutoff: 2400, reso: 1,
      filterSlope: '24', chMode: 'ensemble', chAmt: 0.55, chSpd: 0.55, drift: 2,
      a: 0.4, d: 0.4, s: 0.85, r: 1.3, width: 0.5,
      reverbMix: 0.28, reverbDamp: 0.5, reverbPre: 0.03, master: 0.55 },
    'Pad aire': { waveA: 'sawtooth', waveB: 'triangle', detuneA: -5, detuneB: 7, mix: 0.4,
      noise: 0.22, noiseColor: 0.85, cutoff: 2200, reso: 0.8, filterSlope: '24',
      chMode: 'ensemble', chAmt: 0.5, chSpd: 0.5, drift: 3, freqLfoLvl: 6, freqLfoSpd: 5, lfoFade: 0.6,
      a: 0.6, d: 0.5, s: 0.85, r: 1.8, width: 0.5,
      reverbMix: 0.32, reverbSize: 3, reverbDamp: 0.55, reverbPre: 0.03, master: 0.58 },
    /* matriz: S&H→pitch (cada nota nace ±18 ct, poli analógico), env→cutoff
       en octavas (exponencial), y el LFO de trémolo CRUDO paneando lento */
    'Pad matricial': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -4, detuneB: 6, mix: 0.5,
      cutoff: 1400, reso: 1.5, a: 0.5, d: 0.5, s: 0.85, r: 1.6,
      mx1src: 'rnd', mx1dst: 'pitch', mx1amt: 0.015,
      mx2src: 'env', mx2dst: 'cutoff', mx2amt: 0.3,
      mx3src: 'lfoAmp', mx3dst: 'pan', mx3amt: 0.6, ampLfoSpd: 0.3,
      width: 0.5, reverbMix: 0.3, reverbSize: 2.6, master: 0.6 },
    /* tabla 'formante' + matriz env→wt: cada nota barre de vocal (el morph
       cabalga la envolvente) — síntesis wavetable con la matriz cerrando el círculo */
    'Coro de vocales (tabla)': { waveA: 'tabla', waveB: 'tabla', detuneA: -5, detuneB: 7, mix: 0.5,
      wtSet: 'formante', wtPos: 0.2, mx1src: 'env', mx1dst: 'wt', mx1amt: 0.5,
      cutoff: 4000, a: 0.8, d: 0.6, s: 0.8, r: 2.0, chMode: 'ensemble', chAmt: 0.5, chSpd: 0.5,
      width: 0.6, reverbMix: 0.35, reverbSize: 3, master: 0.58 },
    /* matriz: UN solo LFO lento (cutLFO crudo a 0.08 Hz, su Level a 0) movien-
       do TRES destinos a la vez — filtro, pan y ±14 ct: deriva correlacionada */
    'Deriva orgánica': { waveA: 'sawtooth', waveB: 'triangle', detuneA: -5, detuneB: 7, mix: 0.45,
      cutoff: 1300, reso: 1.5, cutLfoSpd: 0.08,
      mx1src: 'lfoCut', mx1dst: 'cutoff', mx1amt: 0.35,
      mx2src: 'lfoCut', mx2dst: 'pan', mx2amt: 0.6,
      mx3src: 'lfoCut', mx3dst: 'pitch', mx3amt: 0.012,
      a: 0.8, d: 0.5, s: 0.85, r: 2.0, width: 0.4, reverbMix: 0.3, reverbSize: 3, master: 0.58 },
  },

  /* módulo Vocal (banco de formantes por voz): tres esquinas del espacio
     robot ↔ humano — Q fina y formantes clavados = máquina; Q natural +
     Vida (micro-deriva) + drift + vibrato con fade + aliento = coro */
  'Voz': {
    'Coro humano': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -6, detuneB: 8, mix: 0.5,
      vocAmt: 0.75, vocVowel: 0.5, vocQ: 0.65, vocVida: 0.6,
      noise: 0.08, noiseColor: 0.5, drift: 3, cutoff: 4500, reso: 0.8,
      chMode: 'ensemble', chAmt: 0.55, chSpd: 0.5, freqLfoLvl: 8, freqLfoSpd: 5.2, lfoFade: 0.8,
      a: 0.5, d: 0.5, s: 0.85, r: 1.6, width: 0.5, reverbMix: 0.3, reverbSize: 2.6, master: 0.62 },
    /* el LFO de cutoff CRUDO (Level 0) balbucea las vocales; sin vibrato,
       sin drift, sin Vida: formantes congelados = máquina que habla */
    'Robot parlante': { waveA: 'square', waveB: 'sawtooth', pulseWidth: 0.45, mix: 0.35,
      vocAmt: 1, vocVowel: 0.5, vocQ: 0.05, vocVida: 0,
      cutLfoSpd: 1.3, mx1src: 'lfoCut', mx1dst: 'vow', mx1amt: 0.7,
      dist: 0.15, cutoff: 5000, reso: 1, a: 0.01, d: 0.15, s: 0.8, r: 0.15, master: 0.7 },
    'Madrigal (vocal por nota)': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -5, detuneB: 7, mix: 0.5,
      vocAmt: 0.85, vocVowel: 0.5, vocQ: 0.5, vocVida: 0.35,
      mx1src: 'rnd', mx1dst: 'vow', mx1amt: 1,
      drift: 2, cutoff: 4500, reso: 0.8, chMode: 'ensemble', chAmt: 0.4, chSpd: 0.5,
      a: 0.4, d: 0.5, s: 0.85, r: 1.4, width: 0.6, reverbMix: 0.3, reverbSize: 2.8, master: 0.65 },
  },

  'Plucks & Teclas': {
    'Pluck': { waveA: 'square', waveB: 'sawtooth', pulseWidth: 0.35, mix: 0.4, cutoff: 448, reso: 7,
      filterEnvAmt: 3500, a: 0.002, d: 0.18, s: 0.0, r: 0.12, dlyAmt: 0.3, dlyTime: 0.33, width: 0.3 },
    'Campana (Ring)': { waveA: 'sine', waveB: 'sine', ring: 0.8, detuneB: 40, octavesB: 2, mix: 0.5,
      cutoff: 5020, reso: 1, a: 0.002, d: 1.4, s: 0.0, r: 0.9, dlyAmt: 0.25, dlyTime: 0.35, width: 0.4, reverbMix: 0.3 },
    'Caja de música': { waveA: 'sine', waveB: 'sine', ring: 0.5, detuneB: 24, octavesB: 2, mix: 0.5,
      cutoff: 7100, a: 0.002, d: 0.8, s: 0.0, r: 0.6, dlyAmt: 0.3, dlyTime: 0.35, width: 0.4, reverbMix: 0.35 },
    'Piano eléctrico': { waveA: 'sine', waveB: 'triangle', mix: 0.45, ring: 0.15, cutoff: 2520,
      filterEnvAmt: 2000, a: 0.003, d: 0.5, s: 0.25, r: 0.3, width: 0.3, reverbMix: 0.2 },
    'Pluck supersaw': { waveA: 'supersaw', spread: 0.6, mix: 0.2, cutoff: 1260, reso: 3, filterEnvAmt: 3000,
      a: 0.002, d: 0.25, s: 0.1, r: 0.2, width: 0.5, reverbMix: 0.25, dlyAmt: 0.25 },
    /* matriz: vel→cutoff en octavas — tocar fuerte ABRE el filtro (con teclado
       MIDI: la dinámica es timbre, no solo volumen; base grave a propósito) */
    'Teclas al tacto (vel→filtro)': { waveA: 'sine', waveB: 'triangle', mix: 0.45, ring: 0.15,
      cutoff: 800, filterEnvAmt: 800, mx1src: 'vel', mx1dst: 'cutoff', mx1amt: 0.55,
      a: 0.003, d: 0.5, s: 0.25, r: 0.3, width: 0.3, reverbMix: 0.2 },
    /* tabla 'metálica' + S&H→wt y →pan: cada campana con su mezcla de
       parciales y su sitio en el estéreo */
    'Campanas de tabla (S&H)': { waveA: 'tabla', mix: 0, wtSet: 'metálica', wtPos: 0.3,
      mx1src: 'rnd', mx1dst: 'wt', mx1amt: 0.35, mx2src: 'rnd', mx2dst: 'pan', mx2amt: 0.7,
      a: 0.002, d: 1.4, s: 0.0, r: 1.0, dlyAmt: 0.25, dlyTime: 0.4,
      width: 0.4, reverbMix: 0.35, master: 0.65 },
    /* matriz: S&H→cutoff y →pan — cada nota sale con un color y un sitio
       distintos (correlacionados: la MISMA tirada por voz); brutal con el arp */
    'Pluck lotería (S&H)': { waveA: 'square', waveB: 'sawtooth', pulseWidth: 0.3, mix: 0.4,
      cutoff: 700, reso: 5, filterEnvAmt: 1800,
      mx1src: 'rnd', mx1dst: 'cutoff', mx1amt: 0.35,
      mx2src: 'rnd', mx2dst: 'pan', mx2amt: 0.8,
      a: 0.002, d: 0.2, s: 0.0, r: 0.15, dlyAmt: 0.3, dlyTime: 0.4, width: 0.2, master: 0.7 },
  },

  'FM': {
    'Piano FM (Rhodes)': { waveA: 'sine', waveB: 'sine', mix: 0.35, fmRatio: 1, fmIndex: 2.2,
      filterEnvAmt: 1200, a: 0.003, d: 0.6, s: 0.25, r: 0.4, width: 0.3, reverbMix: 0.22 },
    'DX e-piano': { waveA: 'sine', waveB: 'sine', mix: 0.4, fmRatio: 4, fmIndex: 1.4,
      filterEnvAmt: 2000, a: 0.002, d: 0.5, s: 0.2, r: 0.35, width: 0.3, reverbMix: 0.2 },
    'FM brass': { waveA: 'sine', waveB: 'sine', detuneB: 8, mix: 0.5, fmRatio: 1, fmIndex: 3,
      filterEnvAmt: 2500, a: 0.05, d: 0.25, s: 0.7, r: 0.25, width: 0.3, reverbMix: 0.18 },
    'Clav FM': { waveA: 'sine', waveB: 'sine', mix: 0.4, fmRatio: 2, fmIndex: 2.6,
      cutoff: 2520, filterEnvAmt: 1500, a: 0.002, d: 0.25, s: 0.15, r: 0.15, dlyAmt: 0.15, width: 0.25 },
    'Bajo FM': { waveA: 'sine', waveB: 'sine', mix: 0.3, fmRatio: 1, fmIndex: 1.8,
      cutoff: 632, reso: 2, a: 0.005, d: 0.25, s: 0.4, r: 0.18, master: 0.78 },
    'DX bass': { waveA: 'sine', waveB: 'sine', mix: 0.3, fmRatio: 2, fmIndex: 2.2,
      cutoff: 893, reso: 2, filterEnvAmt: 1200, a: 0.004, d: 0.22, s: 0.35, r: 0.16, master: 0.78 },
    'Marimba FM': { waveA: 'sine', waveB: 'sine', mix: 0.4, fmRatio: 4, fmIndex: 1.1,
      cutoff: 2520, a: 0.002, d: 0.32, s: 0.0, r: 0.18, width: 0.3, reverbMix: 0.2 },
    'Glockenspiel FM': { waveA: 'sine', waveB: 'sine', mix: 0.4, fmRatio: 7, fmIndex: 2.4,
      a: 0.001, d: 0.5, s: 0.0, r: 0.4, dlyAmt: 0.2, width: 0.4, reverbMix: 0.32 },
    'Campana FM': { waveA: 'sine', waveB: 'sine', mix: 0.4, fmRatio: 3.5, fmIndex: 4,
      a: 0.002, d: 1.6, s: 0.0, r: 1.0, dlyAmt: 0.2, dlyTime: 0.35, width: 0.4, reverbMix: 0.35 },
    'Campana tubular': { waveA: 'sine', waveB: 'sine', detuneB: 6, mix: 0.45, fmRatio: 1.41, fmIndex: 5,
      a: 0.003, d: 2.2, s: 0.0, r: 1.5, width: 0.45, reverbMix: 0.4, reverbSize: 3.2, master: 0.6 },
    'Gong metálico': { waveA: 'sine', waveB: 'sine', ring: 0.2, detuneB: 20, mix: 0.5, fmRatio: 2.74, fmIndex: 8,
      a: 0.005, d: 2.5, s: 0.0, r: 2.0, cutLfoLvl: 1500, cutLfoSpd: 0.2, width: 0.5, reverbMix: 0.42, reverbSize: 3.5, master: 0.55 },
    'Pad FM vidrio': { waveA: 'sine', waveB: 'sine', detuneB: 8, mix: 0.5, fmRatio: 2, fmIndex: 1.3,
      cutoff: 2890, a: 0.7, d: 0.6, s: 0.8, r: 2.0, width: 0.6, reverbMix: 0.4, reverbSize: 3, master: 0.58 },
    'Sci-fi FM': { waveA: 'sine', waveB: 'sine', mix: 0.5, fmRatio: 5.7, fmIndex: 6,
      cutLfoLvl: 2000, cutLfoSpd: 0.18, a: 0.6, d: 0.6, s: 0.85, r: 2.0, dlyAmt: 0.3, dlyTime: 0.6, width: 0.5, reverbMix: 0.4, master: 0.55 },
  },

  'Órgano': {
    'Órgano trémolo': { waveA: 'square', waveB: 'square', octavesB: 2, mix: 0.5, ampLfoLvl: 0.35, ampLfoSpd: 6,
      cutoff: 2520, reso: 1, a: 0.01, d: 0.1, s: 0.9, r: 0.2, width: 0.25 },
    'Órgano pleno': { waveA: 'square', waveB: 'square', octavesA: 2, octavesB: 3, mix: 0.5,
      cutoff: 5770, reso: 1, a: 0.005, d: 0.05, s: 1.0, r: 0.1, width: 0.3 },
    'Órgano de iglesia': { waveA: 'sine', waveB: 'sine', octavesA: 2, octavesB: 3, detuneB: 4, mix: 0.5,
      cutoff: 7100, a: 0.05, d: 0.1, s: 1.0, r: 0.4, width: 0.4, reverbMix: 0.45, reverbSize: 3.5, master: 0.55 },
    /* tabla 'órgano': morph = tirar de drawbars (de flauta a pleno) */
    'Órgano de tabla': { waveA: 'tabla', waveB: 'tabla', octavesB: 2, detuneB: 4, mix: 0.35,
      wtSet: 'órgano', wtPos: 0.75, cutoff: 7100, a: 0.01, d: 0.05, s: 1.0, r: 0.15,
      width: 0.3, reverbMix: 0.2, master: 0.65 },
  },

  'Percusión': {
    'Bombo 808': { waveA: 'sine', mix: 0, pitchEnvAmt: 1800, pitchEnvDec: 0.05, cutoff: 700,
      a: 0.001, d: 0.35, s: 0.0, r: 0.2, dist: 0.25, master: 0.85 },
    'Tom sintético': { waveA: 'sine', waveB: 'triangle', mix: 0.25, pitchEnvAmt: 900, pitchEnvDec: 0.12,
      cutoff: 1260, a: 0.001, d: 0.3, s: 0.0, r: 0.25, reverbMix: 0.15, master: 0.8 },
    'Caja zap': { waveA: 'triangle', mix: 0, noise: 0.7, pitchEnvAmt: 1200, pitchEnvDec: 0.04,
      cutoff: 2890, morph: 0.35, filterEnvAmt: 2500, fenvMode: 'own', fa: 0.001, fd: 0.1, fs: 0.0,
      a: 0.001, d: 0.18, s: 0.0, r: 0.12, master: 0.8 },
    'Láser zap': { waveA: 'sawtooth', mix: 0, pitchEnvAmt: -2400, pitchEnvDec: 0.25, cutoff: 5020,
      reso: 8, a: 0.001, d: 0.4, s: 0.0, r: 0.2, dlyAmt: 0.25, dlyTime: 0.25, width: 0.3 },
  },

  'Stabs': {
    'Hoover rave': { waveA: 'sawtooth', waveB: 'square', pulseWidth: 0.4, detuneA: -15, detuneB: 15, octavesB: 2,
      mix: 0.5, freqLfoLvl: 25, freqLfoSpd: 6, cutoff: 2000, reso: 4, flAmt: 0.4, flSpd: 0.5, dist: 0.2,
      a: 0.02, d: 0.3, s: 0.7, r: 0.3, width: 0.3 },
    'Supersaw stab': { waveA: 'supersaw', waveB: 'supersaw', spread: 0.8, mix: 0.5, cutoff: 2520, reso: 2,
      filterEnvAmt: 2000, a: 0.005, d: 0.25, s: 0.3, r: 0.25, dist: 0.1, width: 0.7, reverbMix: 0.25 },
    'Stab metálico': { waveA: 'sawtooth', waveB: 'sine', ring: 0.6, detuneB: 30, mix: 0.5, cutoff: 2520,
      filterEnvAmt: 2500, a: 0.003, d: 0.3, s: 0.2, r: 0.25, dist: 0.2, width: 0.4, reverbMix: 0.2 },
  },

  'FX & Atmósferas': {
    'Drone sci-fi': { noise: 0.4, waveA: 'sine', waveB: 'sawtooth', ring: 0.4, detuneB: 25, mix: 0.5,
      cutoff: 800, reso: 8, cutLfoLvl: 650, cutLfoSpd: 0.15, resLfoLvl: 6, resLfoSpd: 0.1,
      a: 1.2, d: 0.5, s: 0.9, r: 2.5, dlyAmt: 0.4, dlyTime: 0.7, width: 0.5, reverbMix: 0.4, master: 0.6 },
    'Riser tensión': { noise: 0.5, waveA: 'sawtooth', mix: 0.2, cutoff: 224, filterEnvAmt: 2800,
      reso: 8, a: 2.0, d: 0.5, s: 0.9, r: 1.5, width: 0.5, reverbMix: 0.4, reverbSize: 3.5, master: 0.6 },
    'Nave espacial': { ring: 0.7, waveA: 'sine', waveB: 'sine', detuneB: 35, octavesB: 2, mix: 0.5,
      cutoff: 1400, cutLfoLvl: 1200, cutLfoSpd: 0.2, a: 0.5, d: 0.5, s: 0.9, r: 2.0, flAmt: 0.4, flSpd: 0.3,
      width: 0.5, reverbMix: 0.4, master: 0.6 },
    'Blip resonante': { waveA: 'sawtooth', mix: 0.2, cutoff: 1260, reso: 16, filterEnvAmt: 4000,
      a: 0.001, d: 0.15, s: 0.0, r: 0.1, width: 0.3, reverbMix: 0.2 },
    'Wobble sincopado': { waveA: 'sawtooth', waveB: 'square', mix: 0.4, cutoff: 1250, reso: 10,
      cutLfoLvl: 1000, cutLfoSpd: 2, cutLfoShape: 'square', dist: 0.25,
      dlyAmt: 0.35, dlySync: '1/8.', bpm: 140, panLfoLvl: 0.4, panLfoSpd: 0.8,
      a: 0.005, d: 0.3, s: 0.8, r: 0.2 },
  },
};

// Los nombres son únicos en todo el banco -> lookup plano.
export function factoryPreset(name) {
  for (const cat in FACTORY) if (name in FACTORY[cat]) return FACTORY[cat][name];
  return null;
}

// ---------- presets de usuario (localStorage) ----------
const LS_V1 = 'subsdj.presets.v1';       // v1: cutoff en posición 0..1 del slider
const LS_V2 = 'subsdj.presets.v2';       // v2: espacio-motor

// v1 -> v2: sólo cutoff cambia de espacio (posición 0..1 -> Hz). El resto de
// claves ya coincidían con el espacio-motor. Idempotente (un cutoff en Hz
// nunca es <= 1, y una posición nunca es > 1).
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
      localStorage.setItem(LS_V2, JSON.stringify(out));   // v1 se conserva como copia de seguridad
      return out;
    }
  } catch (e) {}
  return {};
}
export function saveUser(o) { try { localStorage.setItem(LS_V2, JSON.stringify(o)); } catch (e) {} }
