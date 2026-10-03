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
    /* curva RC: el mismo bajo pluck con ataque y decay exponenciales — compáralo
       con «Bajo pluck» (lineal): el golpe llega antes y el cuerpo se posa sin escalón */
    'Bajo RC (curva)': { waveA: 'sawtooth', waveB: 'square', mix: 0.35, cutoff: 448, reso: 6,
      filterEnvAmt: 2600, envCurve: 0.85, a: 0.004, d: 0.35, s: 0.15, r: 0.15, master: 0.78 },
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
    /* LFO S&H: el filtro salta a un valor aleatorio en cada paso del LFO (6 Hz) —
       el «random» rítmico del techno; el eco a corcheas engancha los escalones */
    'Lead S&H (filtro random)': { waveA: 'sawtooth', waveB: 'square', mix: 0.3, cutoff: 900, reso: 8,
      cutLfoShape: 'sh', cutLfoLvl: 700, cutLfoSpd: 6, filterEnvAmt: 800, a: 0.005, d: 0.2, s: 0.7, r: 0.15,
      dlyAmt: 0.25, dlySync: '1/8', bpm: 120, master: 0.7 },
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
    /* A4 · notch: LP + HP en paralelo (cero exacto en el corte) barrido por el
       LFO — un phaser de una sola muesca; compáralo con Low↔Hi al 50 %, que es
       el mismo notch a −6 dB */
    /* LFO deriva: el cutoff y la afinación vagan despacio sin repetirse (random
       suavizado): el pad respira en vez de oscilar */
    'Pad que respira (deriva)': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -6, detuneB: 8, octavesB: 2, mix: 0.5,
      cutoff: 1400, reso: 1.5, cutLfoShape: 'drift', cutLfoLvl: 600, cutLfoSpd: 0.3, freqLfoShape: 'drift', freqLfoLvl: 6, freqLfoSpd: 0.4,
      a: 0.7, d: 0.5, s: 0.85, r: 1.8, width: 0.5, chMode: 'ensemble', chAmt: 0.4, chSpd: 0.4, reverbMix: 0.35, master: 0.6 },
    'Pad phaser (notch)': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -7, detuneB: 9, mix: 0.5, cutoff: 1100, reso: 4,
      filterType: 'notch', cutLfoLvl: 700, cutLfoSpd: 0.25, a: 0.5, d: 0.5, s: 0.8, r: 1.2, width: 0.45, reverbMix: 0.25, master: 0.6 },
    /* placa algorítmica (Dattorro): densidad que crece y tanque modulado —
       pásalo a «Sala (IR)» para oír la diferencia: la cola de la placa respira */
    'Pad de placa': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -8, detuneB: 10, octavesB: 2, mix: 0.5,
      cutoff: 1400, reso: 1.5, a: 0.6, d: 0.5, s: 0.85, r: 1.8, width: 0.5,
      reverbType: 'placa', reverbMix: 0.4, reverbSize: 3.2, reverbDamp: 0.35, reverbPre: 0.02, master: 0.58 },
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
    /* secuencia de tabla en loop: acorde MANTENIDO = groove tímbrico al BPM
       (los '.' alargan pasos: ritmo desigual); cada voz desfasa su frase */
    'Textura Wavestation (ws)': { waveA: 'tabla', waveB: 'tabla', detuneA: -5, detuneB: 7, mix: 0.5,
      wtSet: 'metálica', wtPos: 0,
      wsOn: 'on', wsPat: '0 . 7 . 3 5 7 2', wsDiv: '1/16', wsXf: 0.3,
      cutoff: 5000, reso: 1, a: 0.15, d: 0.4, s: 0.85, r: 1.5,
      dlySync: '1/8', dlyAmt: 0.25, width: 0.5, reverbMix: 0.3, reverbSize: 2.6, master: 0.6 },
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
  /* Roadmap 5.0 «cinescape»: sonidos a la escala del paisaje — tiempos ×10
     (ataques de 10 s, releases de 20-30 s, LFOs de minutos, salas de 20 s) y
     octava por oscilador (−1 = suboscilador, −2 = sótano). La categoría crece
     con cada bloque del roadmap. */
  'Cinescape': {
    /* bloque 1: 12 s de ataque, 25 s de release, env de filtro propia aún más
       lenta (8 s) y deriva de cutoff a 0,02 Hz (una vuelta cada 50 s); B una
       octava abajo ancla el grave. Mantén un acorde y espera: entra de la nada */
    'Pad glaciar (ataque 12 s)': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -7, detuneB: 9, octB: -1, mix: 0.45,
      uniVoices: '3', uniDetune: 10, drift: 4, cutoff: 700, reso: 1.2, filterSlope: '24',
      fenvMode: 'own', filterEnvAmt: 900, fa: 8, fd: 6, fs: 0.5, fr: 20,
      cutLfoShape: 'drift', cutLfoLvl: 250, cutLfoSpd: 0.02,
      a: 12, d: 4, s: 1, r: 25, envCurve: 0.4, width: 0.6, chMode: 'ensemble', chAmt: 0.35, chSpd: 0.25,
      reverbType: 'placa', reverbMix: 0.5, reverbSize: 14, reverbDamp: 0.4, reverbPre: 0.06, master: 0.6 },
    /* bloque 1: A dos octavas abajo (C3 → C1, 32 Hz) y B seno una abajo; mono con
       glide de 3 s (la nota nueva RESBALA), filtro casi cerrado con deriva lenta */
    'Drone de sótano (−2 octavas)': { waveA: 'sawtooth', octA: -2, waveB: 'sine', octB: -1, mix: 0.4, drift: 6,
      cutoff: 420, reso: 3, filterSlope: '24', cutLfoShape: 'drift', cutLfoLvl: 200, cutLfoSpd: 0.03,
      mode: 'mono', glide: 3, a: 4, d: 2, s: 1, r: 12, envCurve: 0.3, width: 0, dist: 0.2,
      reverbType: 'placa', reverbMix: 0.35, reverbSize: 9, reverbDamp: 0.6, master: 0.65 },
    /* bloque 2: Deriva (voz) → cutoff y → pan a 0,04 Hz, LFO de vibrato POR VOZ con
       fade de 4 s — cuatro notas, cuatro vientos: cada una abre, cierra y se pasea
       por el estéreo a su aire. Compáralo con LFO · fase global: el bloque respira */
    'Pad de cuatro vientos (deriva por voz)': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -6, detuneB: 8, octB: -1, mix: 0.45,
      uniVoices: '2', uniDetune: 8, cutoff: 750, reso: 1.5, filterSlope: '24',
      mx1src: 'drift', mx1dst: 'cutoff', mx1amt: 0.4, mx2src: 'drift', mx2dst: 'pan', mx2amt: 0.8, mxDriftSpd: 0.04,
      lfoPhase: 'voz', freqLfoLvl: 5, freqLfoSpd: 0.15, lfoFade: 4,
      a: 6, d: 3, s: 1, r: 15, envCurve: 0.4, width: 0.3, chMode: 'ensemble', chAmt: 0.3, chSpd: 0.3,
      reverbType: 'placa', reverbMix: 0.45, reverbSize: 12, reverbDamp: 0.4, reverbPre: 0.05, master: 0.6 },
    /* bloque 3: shimmer — la cola vuelve a entrar en la placa una octava arriba en
       cada vuelta y se convierte en un coro que asciende (Eno/Lanois). Toca una
       nota grave, suéltala y escucha cómo sube sola; ❄ Freeze la deja ahí */
    'Pad shimmer (coro que sube)': { waveA: 'sawtooth', waveB: 'triangle', detuneA: -5, detuneB: 7, octB: -1, mix: 0.4,
      cutoff: 1200, reso: 1, filterSlope: '24', drift: 3,
      a: 1.5, d: 2, s: 0.9, r: 6, envCurve: 0.3, width: 0.5, chMode: 'ensemble', chAmt: 0.3, chSpd: 0.3,
      reverbType: 'placa', reverbMix: 0.55, reverbSize: 8, reverbDamp: 0.3, reverbPre: 0.03, shimAmt: 0.7, shimInt: '+12', master: 0.55 },
  },

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
    /* la fuente CORRECTA: pulso glotal (set 'glotal') en vez de sierra;
       env→wt = el esfuerzo vocal cabalga la envolvente (ataca prensado,
       se relaja al sostener) + Brillo alto = solista que corta la mezcla */
    'Voz glotal (esfuerzo)': { waveA: 'tabla', wtSet: 'glotal', wtPos: 0.2, mix: 0,
      vocAmt: 0.85, vocVowel: 0.55, vocQ: 0.6, vocVida: 0.5, vocBrillo: 0.75,
      mx1src: 'env', mx1dst: 'wt', mx1amt: 0.6,
      freqLfoLvl: 9, freqLfoSpd: 5.2, lfoFade: 0.6, drift: 2, cutoff: 5000, reso: 0.8,
      a: 0.15, d: 0.4, s: 0.8, r: 0.9, width: 0.4, reverbMix: 0.25, master: 0.65 },
    /* la receta calibrada DE OÍDO (2026-08-18): el Golpe con sentido vive
       BAJO (~0.12 — más arriba degenera en percusión); la consonante la
       redondean el ruido con color y una pizca de drive. Ataque rápido:
       cada nota silabiza «ka» (cambia la vocal y cambia la consonante) */
    'Percusión vocal (ka)': { waveA: 'sawtooth', waveB: 'square', pulseWidth: 0.4, mix: 0.3,
      vocAmt: 1, vocVowel: 0.5, vocQ: 0.45, vocAtk: 0.12, vocBrillo: 0.6,
      noise: 0.12, noiseColor: 0.35, dist: 0.18,
      cutoff: 4500, reso: 1, filterEnvAmt: 1200, a: 0.003, d: 0.25, s: 0.25, r: 0.2,
      dlyAmt: 0.2, dlyTime: 0.28, width: 0.3, master: 0.68 },
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
    /* secuencia 1shot rapidísima: arranca en el frame brillante y se asienta
       en el suave — "sample de ataque + synth de cuerpo", el truco del D-50 */
    'Ataque digital (1shot)': { waveA: 'tabla', mix: 0, wtSet: 'analógica', wtPos: 1,
      wsOn: 'on', wsMode: '1shot', wsPat: '7 5 1', wsDiv: '1/16', wsXf: 1,
      cutoff: 3500, reso: 1.5, a: 0.003, d: 0.5, s: 0.55, r: 0.3,
      dlyAmt: 0.2, dlyTime: 0.3, width: 0.3, reverbMix: 0.2, master: 0.7 },
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
    /* matriz → FM índice: el índice CABALGA la envolvente (env = el ADSR de amp
       en modo «= Amp»): ataque brillante que se apaga con la nota — la campana
       y el pluck del DX7, imposibles con índice fijo */
    'Campana DX (env→FM)': { waveA: 'sine', waveB: 'sine', detuneB: 5, mix: 0.4, fmRatio: 3.5, fmIndex: 0.6,
      mx1src: 'env', mx1dst: 'fm', mx1amt: 0.5,
      a: 0.002, d: 1.8, s: 0.0, r: 1.2, dlyAmt: 0.2, dlyTime: 0.35, width: 0.45, reverbMix: 0.35, reverbSize: 2.8, master: 0.6 },
    /* velocity → FM índice: pegar fuerte abre el timbre, no solo el volumen (el
       tacto del DX7); un env→FM corto (env propia, 120 ms) pone el «tine» del ataque */
    'E-piano DX (vel→FM)': { waveA: 'sine', waveB: 'sine', mix: 0.4, fmRatio: 1, fmIndex: 0.5,
      mx1src: 'vel', mx1dst: 'fm', mx1amt: 0.2, mx2src: 'env', mx2dst: 'fm', mx2amt: 0.15,
      fenvMode: 'own', fa: 0.002, fd: 0.12, fs: 0.0, fr: 0.2,
      a: 0.002, d: 0.9, s: 0.25, r: 0.4, chAmt: 0.25, chSpd: 0.5, width: 0.3, reverbMix: 0.22 },
    /* feedback del modulador: su seno se vuelve sierra y el brass gana mordiente */
    'Brass FM (feedback)': { waveA: 'sine', waveB: 'sine', detuneB: 7, mix: 0.5, fmRatio: 1, fmIndex: 1.2, fmFb: 0.45,
      mx1src: 'env', mx1dst: 'fm', mx1amt: 0.25,
      a: 0.06, d: 0.3, s: 0.7, r: 0.25, width: 0.35, reverbMix: 0.2 },
  },

  'FM4': {
    /* pila 4→3→2→1: los moduladores altos decaen rápido (ataque con mordiente),
       el 2 se queda (cuerpo brass); feedback en el 4 */
    'FM4 · Brass pila': { waveA: 'fm4', mix: 0, fm4Alg: '0', fmFb: 0.3,
      fm4R1: 1, fm4L1: 1, fm4D1: 4, fm4R2: 1, fm4L2: 0.55, fm4D2: 4, fm4R3: 1, fm4L3: 0.35, fm4D3: 0.4, fm4R4: 1, fm4L4: 0.3, fm4D4: 0.18,
      cutoff: 9000, a: 0.05, d: 0.3, s: 0.8, r: 0.3, width: 0.3, reverbMix: 0.18 },
    /* dos pares: 2→1 es el cuerpo (ratio 1 con modulador 14 = el «tine»), 4→3 el golpe */
    'FM4 · E-piano pares': { waveA: 'fm4', mix: 0, fm4Alg: '1',
      fm4R1: 1, fm4L1: 1, fm4D1: 4, fm4R2: 14, fm4L2: 0.12, fm4D2: 0.1, fm4R3: 1, fm4L3: 0.7, fm4D3: 4, fm4R4: 1, fm4L4: 0.35, fm4D4: 0.6,
      cutoff: 9000, a: 0.002, d: 1.0, s: 0.2, r: 0.4, chAmt: 0.25, chSpd: 0.5, width: 0.35, reverbMix: 0.22 },
    /* tres moduladores en paralelo con ratios no enteros: espectro inarmónico denso */
    'FM4 · Campana densa': { waveA: 'fm4', mix: 0, fm4Alg: '2',
      fm4R1: 1, fm4L1: 1, fm4D1: 4, fm4R2: 3.5, fm4L2: 0.45, fm4D2: 1.2, fm4R3: 5.19, fm4L3: 0.3, fm4D3: 0.8, fm4R4: 7.3, fm4L4: 0.2, fm4D4: 0.5,
      cutoff: 12000, a: 0.002, d: 2.2, s: 0, r: 1.6, dlyAmt: 0.2, dlySync: '1/4.', width: 0.5, reverbMix: 0.35, reverbSize: 2.8, master: 0.6 },
    /* bombo FM: modulador 2 con decay de 30 ms = el «clic», pitch env = el cuerpo */
    'FM4 · Bombo': { waveA: 'fm4', mix: 0, fm4Alg: '0',
      fm4R1: 1, fm4L1: 1, fm4D1: 4, fm4R2: 1, fm4L2: 0.9, fm4D2: 0.03, fm4R3: 0.5, fm4L3: 0.5, fm4D3: 0.02, fm4R4: 1, fm4L4: 0, fm4D4: 4,
      pitchEnvAmt: 1800, pitchEnvDec: 0.05, cutoff: 800, envCurve: 1, a: 0, d: 0.5, s: 0, r: 0.3, dist: 0.2, master: 0.85 },
    /* aditivo con feedback a tope en el 4: ruido metálico; ratios altos no enteros + paso-alto = hat */
    'FM4 · Hat': { waveA: 'fm4', mix: 0, fm4Alg: '7', fmFb: 1,
      fm4R1: 5.7, fm4L1: 0.5, fm4D1: 0.06, fm4R2: 8.3, fm4L2: 0.5, fm4D2: 0.05, fm4R3: 11.1, fm4L3: 0.4, fm4D3: 0.08, fm4R4: 6.9, fm4L4: 0.6, fm4D4: 0.07,
      cutoff: 7000, morph: 1, a: 0, d: 0.09, s: 0, r: 0.06, width: 0.25, master: 0.8 },
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

  /* Percusión: un kit 808/909 sintético a propósito — así sonaban las cajas de
     ritmos: bombo = seno con caída de pitch; caja = cuerpo tonal corto + ruido;
     platos = FM caótica + ruido por paso-alto. Casi todos llevan Curva 1: un
     parche real es un resonador amortiguado y decae exponencialmente desde el
     primer instante; con rampas rectas el sonido se queda en meseta y se corta
     (sonaba a nota con puerta, no a golpe). Pensados para tocarse en la octava
     de C3 (la del selftest); el teclado transpone. */
  'Percusión': {
    /* lo que hace «golpe» es una ENVOLVENTE DE BRILLO: los primeros 30 ms ricos en
       armónicos (el parche excitado) y enseguida solo el seno (el cuerpo). Aquí la
       pone el operador 2 del FM4: ratio 1 con decay de 30 ms = armónicos de sierra
       que se apagan; el 3 (ratio 0,5, 20 ms) es el sub-clic. Blip de pitch corto
       (700 ct en 40 ms, el de la 808 es pequeño) y caída exponencial. Hasta
       2026-10-01 era un seno con barrido de 1800 ct y caída lineal: a cualquier
       octava sonaba a bajo con puerta, no a bombo (elegido a oído entre siete
       candidatos renderizados) */
    'Bombo 808': { waveA: 'fm4', mix: 0, fm4Alg: '0',
      fm4R1: 1, fm4L1: 1, fm4D1: 4, fm4R2: 1, fm4L2: 0.9, fm4D2: 0.03, fm4R3: 0.5, fm4L3: 0.5, fm4D3: 0.02, fm4R4: 1, fm4L4: 0, fm4D4: 4,
      pitchEnvAmt: 700, pitchEnvDec: 0.04, cutoff: 2500, envCurve: 1,
      a: 0, d: 0.55, s: 0.0, r: 0.3, dist: 0.3, master: 0.85 },
    /* 909: el clic es el triángulo B + un soplo de ruido con aire; el drive por voz
       (tanh antes del filtro) aprieta el cuerpo; barrido de pitch más largo que el 808 */
    'Bombo 909': { waveA: 'sine', waveB: 'triangle', mix: 0.2, noise: 0.12, noiseColor: 0.5,
      pitchEnvAmt: 1000, pitchEnvDec: 0.07, cutoff: 2200, filterDrive: 0.3, dist: 0.4,
      envCurve: 1, a: 0, d: 0.5, s: 0.0, r: 0.3, amplitude: 1, master: 1 },
    'Tom sintético': { waveA: 'sine', waveB: 'triangle', mix: 0.25, pitchEnvAmt: 900, pitchEnvDec: 0.12,
      cutoff: 1260, envCurve: 1, a: 0, d: 0.45, s: 0.0, r: 0.25, reverbMix: 0.15, amplitude: 1, master: 1 },
    'Caja zap': { waveA: 'triangle', mix: 0, noise: 0.7, pitchEnvAmt: 1200, pitchEnvDec: 0.04,
      cutoff: 2890, morph: 0.35, filterEnvAmt: 2500, fenvMode: 'own', fa: 0.001, fd: 0.1, fs: 0.0,
      envCurve: 1, a: 0, d: 0.25, s: 0.0, r: 0.12, amplitude: 1, master: 1 },
    /* la 808: dos senos a 180 y 330 Hz (relación 1,83 — no es una octava, por eso
       van como portadoras del FM4 aditivo: ratios 1,38 y 2,52 sobre C3) que mueren
       en ~100 ms por su decay de operador, + ruido con mucho aire que dura más y cae
       exponencialmente (el ADSR con Curva 1: con rampas rectas el ruido aguantaba
       150 ms plano y sonaba a «shhh» con puerta; elegido a oído, 2026-10-01) */
    'Caja 808': { waveA: 'fm4', mix: 0, fm4Alg: '7',
      fm4R1: 1.38, fm4L1: 1, fm4D1: 0.11, fm4R2: 1, fm4L2: 0, fm4D2: 4, fm4R3: 2.52, fm4L3: 0.6, fm4D3: 0.07, fm4R4: 1, fm4L4: 0, fm4D4: 4,
      noise: 1, noiseColor: 0.7, pitchEnvAmt: 400, pitchEnvDec: 0.03, cutoff: 12000, reso: 1,
      envCurve: 1, a: 0, d: 0.3, s: 0.0, r: 0.15, dist: 0.1, reverbMix: 0.1, reverbSize: 0.8, master: 0.85 },
    /* clap 808: no es un golpe de ruido — son tres ráfagas a ~11 ms (Flam) y luego
       la cola, todo por un paso-banda a ~1,3 kHz (que se come casi toda la energía
       del ruido: de ahí amplitude y master a tope y algo de distorsión, que además
       le da el grano de la 808); al seno de A lo quita el propio BP (130 Hz queda
       tres octavas por debajo del corte) */
    'Palmada 808': { waveA: 'sine', mix: 0, noise: 1, noiseColor: 0.1, filterType: 'bp', cutoff: 1300, reso: 2.5,
      hits: 3, hitGap: 0.011, a: 0, d: 0.28, s: 0.0, r: 0.12, envCurve: 0.6, dist: 0.35,
      reverbMix: 0.15, reverbSize: 0.9, width: 0.3, amplitude: 1, master: 1 },
    /* rimshot 909: un «ping» — paso-banda resonante que la envolvente del filtro
       barre en 30 ms, sobre un triángulo con caída de pitch brusca y ruido; la
       distorsión pone el chasquido */
    'Rimshot 909': { waveA: 'triangle', mix: 0, noise: 0.8, noiseColor: 0.5, pitchEnvAmt: 1200, pitchEnvDec: 0.012,
      filterType: 'bp', cutoff: 1700, reso: 5, filterEnvAmt: 2500, fenvMode: 'own', fa: 0.001, fd: 0.03, fs: 0.0, fr: 0.05,
      envCurve: 1, a: 0, d: 0.1, s: 0.0, r: 0.06, filterDrive: 0.2, dist: 0.6, amplitude: 1, master: 1 },
    /* cencerro 808: dos osciladores a 587 y 845 Hz (relación 1,44: ratios 4,49 y 6,46
       sobre C3, portadoras aditivas); la 808 usa cuadradas por un paso-banda: aquí los
       senos pasan por el drive (tanh), que les crea armónicos e intermodulación, y un
       BP ancho a 1,2 kHz deja el cuerpo y se queda con el «clank» */
    'Cencerro 808': { waveA: 'fm4', mix: 0, fm4Alg: '7',
      fm4R1: 4.49, fm4L1: 1, fm4D1: 0.45, fm4R2: 1, fm4L2: 0, fm4D2: 4, fm4R3: 6.46, fm4L3: 1, fm4D3: 0.3, fm4R4: 1, fm4L4: 0, fm4D4: 4,
      filterDrive: 0.5, dist: 0.45, filterType: 'bp', cutoff: 1200, reso: 1.2,
      envCurve: 1, a: 0, d: 0.5, s: 0.0, r: 0.2, width: 0.2, amplitude: 1, master: 1 },
    /* hat abierto: el mismo hat FM (feedback a tope = ruido metálico) con el decay
       largo y un poco de ruido con aire; el cerrado es «Hat FM (feedback)» */
    'Hat abierto': { waveA: 'sine', mix: 0, fmRatio: 5.7, fmIndex: 5, fmFb: 1, noise: 0.3, noiseColor: 0.8,
      cutoff: 7000, morph: 1, a: 0, d: 0.45, s: 0.0, r: 0.3, width: 0.25, master: 0.55 },
    /* FM con feedback a tope: el modulador entra en caos = ruido metálico; ratio
       no entero + paso-alto (morph 1) = hi-hat sin tocar el generador de ruido */
    'Hat FM (feedback)': { waveA: 'sine', mix: 0, fmRatio: 5.7, fmIndex: 5, fmFb: 1,
      cutoff: 6500, morph: 1, a: 0, d: 0.09, s: 0.0, r: 0.06, width: 0.2, master: 0.8 },
    /* crash 909: cuatro portadoras aditivas con ratios no enteros y feedback a tope
       en la 4 (caos = ruido metálico) que decaen en ~1 s, + ruido blanco con aire,
       todo por paso-alto; un platillo real tiene miles de modos: esto suena a 909 */
    'Crash 909': { waveA: 'fm4', mix: 0, fm4Alg: '7', fmFb: 1,
      fm4R1: 3.7, fm4L1: 0.5, fm4D1: 1.3, fm4R2: 5.3, fm4L2: 0.5, fm4D2: 1.0, fm4R3: 7.9, fm4L3: 0.4, fm4D3: 0.8, fm4R4: 4.1, fm4L4: 0.7, fm4D4: 1.1,
      noise: 0.55, noiseColor: 0.6, cutoff: 3500, morph: 1, envCurve: 1, a: 0, d: 2.0, s: 0.0, r: 1.2,
      reverbMix: 0.2, reverbSize: 2.0, width: 0.4, master: 0.55 },
    /* ride 909: como el crash pero con un «ping» (portadora 1 a ratio 9, decay largo)
       que sobrevive al chapoteo corto de las otras tres */
    'Ride 909': { waveA: 'fm4', mix: 0, fm4Alg: '7', fmFb: 0.7,
      fm4R1: 9.0, fm4L1: 0.55, fm4D1: 1.4, fm4R2: 5.3, fm4L2: 0.3, fm4D2: 0.45, fm4R3: 7.9, fm4L3: 0.3, fm4D3: 0.35, fm4R4: 11.3, fm4L4: 0.5, fm4D4: 0.3,
      noise: 0.25, noiseColor: 0.7, cutoff: 4000, morph: 1, envCurve: 1, a: 0, d: 1.4, s: 0.0, r: 0.8,
      reverbMix: 0.12, reverbSize: 1.5, width: 0.3, amplitude: 1, master: 1 },
    /* hit rave (el «orchestra hit» de los 90): sierra + cuadrada en unison ×3 con
       pizca de ruido, envolvente de filtro propia que cierra en 250 ms, distorsión,
       caída de pitch corta y sala pequeña */
    'Hit rave': { waveA: 'sawtooth', waveB: 'square', octavesB: 2, uniVoices: '3', uniDetune: 18, mix: 0.5, noise: 0.12,
      pitchEnvAmt: 200, pitchEnvDec: 0.08, cutoff: 1500, reso: 2, filterEnvAmt: 4500, fenvMode: 'own', fa: 0.001, fd: 0.25, fs: 0.0, fr: 0.2,
      envCurve: 1, a: 0, d: 0.6, s: 0.0, r: 0.3, dist: 0.3, reverbMix: 0.25, reverbSize: 1.2, width: 0.6, amplitude: 1, master: 0.9 },
    'Láser zap': { waveA: 'sawtooth', mix: 0, pitchEnvAmt: -2400, pitchEnvDec: 0.25, cutoff: 5020,
      reso: 8, a: 0, d: 0.4, s: 0.0, r: 0.2, dlyAmt: 0.25, dlyTime: 0.25, width: 0.3 },
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
    /* S&H por la MATRIZ al pitch (±720 ct, 5 saltos/s): una nota mantenida se
       vuelve una melodía aleatoria — el ordenador de la nave; el Level del LFO
       queda a 0: solo la matriz lo lee */
    'Bleeps S&H (pitch random)': { waveA: 'square', waveB: 'sine', mix: 0.4, cutoff: 3000, reso: 2,
      freqLfoShape: 'sh', freqLfoSpd: 5, mx1src: 'lfoFreq', mx1dst: 'pitch', mx1amt: 0.6,
      a: 0.003, d: 0.1, s: 0.8, r: 0.2, dlyAmt: 0.35, dlySync: '1/8.', bpm: 120, reverbMix: 0.2, master: 0.6 },
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
    /* delay de cinta: el bucle pierde agudos en cada vuelta (Damp) y el wow
       desafina un pelo cada repetición — el eco dub que un delay digital
       limpio no da (a Damp 0 y Wow 0 es el ping-pong de siempre) */
    'Dub de cinta': { waveA: 'square', waveB: 'sawtooth', pulseWidth: 0.4, detuneB: 5, mix: 0.4,
      cutoff: 1800, reso: 4, filterEnvAmt: 2200, a: 0.003, d: 0.18, s: 0, r: 0.25,
      dlyAmt: 0.6, dlySync: '1/4.', bpm: 90, dlyDamp: 0.65, dlyWow: 0.35,
      width: 0.3, reverbMix: 0.15, reverbSize: 2.2, master: 0.65 },
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
