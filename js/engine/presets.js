/* =====================================================================
   SubSDJ · mega-banco de presets, organizado por tipo de sonido.
   Valores a nivel de CONTROL (cutoff = posición 0..1 del slider, no Hz).
   Cada preset sólo declara lo que se desvía del default; los nombres son
   ÚNICOS en todo el banco (el lookup es por nombre).
   ===================================================================== */

export const FACTORY = {
  'Básicos': {
    'Init (default)': {},
  },

  'Bajos': {
    'Sub redondo': { waveA: 'sine', waveB: 'triangle', mix: 0.35, cutoff: 0.45, reso: 1,
      a: 0.005, d: 0.2, s: 0.6, r: 0.15, master: 0.82 },
    'Bajo grueso': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -8, detuneB: 12, mix: 0.5,
      cutoff: 0.47, reso: 5, filterEnvAmt: 1500, dist: 0.15, a: 0.005, d: 0.25, s: 0.35, r: 0.18, master: 0.78 },
    'Reese': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -22, detuneB: 22, mix: 0.5,
      cutoff: 0.42, reso: 3, dist: 0.1, a: 0.005, d: 0.3, s: 0.85, r: 0.2, width: 0.3, master: 0.72 },
    'Bajo pluck': { waveA: 'sawtooth', waveB: 'square', mix: 0.35, cutoff: 0.45, reso: 6,
      filterEnvAmt: 2600, a: 0.002, d: 0.2, s: 0.0, r: 0.13, master: 0.78 },
    'Ácido 303': { mode: 'mono', waveA: 'sawtooth', waveB: 'sawtooth', mix: 0.15, cutoff: 0.40, reso: 20,
      filterEnvAmt: 2800, glide: 0.06, cutLfoLvl: 800, cutLfoSpd: 4, dist: 0.35, a: 0.003, d: 0.2, s: 0.2, r: 0.1 },
    'Slide bass': { mode: 'mono', waveA: 'sawtooth', waveB: 'sawtooth', detuneB: 6, mix: 0.1,
      cutoff: 0.45, reso: 6, filterEnvAmt: 2000, glide: 0.12, a: 0.005, d: 0.2, s: 0.5, r: 0.2, master: 0.78 },
    'Wobble dub': { waveA: 'sawtooth', waveB: 'square', mix: 0.4, cutoff: 0.39, reso: 12,
      cutLfoLvl: 2500, cutLfoSpd: 5, dist: 0.3, a: 0.005, d: 0.3, s: 0.8, r: 0.2 },
  },

  'Leads': {
    'Lead brillante': { waveA: 'sawtooth', waveB: 'square', detuneB: 10, mix: 0.45, cutoff: 0.77, reso: 3,
      freqLfoLvl: 12, freqLfoSpd: 5.5, dlyAmt: 0.25, dlyTime: 0.28, a: 0.01, d: 0.2, s: 0.8, r: 0.25, width: 0.25 },
    'Lead cuadrado': { waveA: 'square', waveB: 'square', pulseWidth: 0.35, detuneB: 6, mix: 0.5,
      cutoff: 0.7, reso: 2, a: 0.01, d: 0.15, s: 0.8, r: 0.2, dlyAmt: 0.2, width: 0.25 },
    'Supersaw lead': { waveA: 'supersaw', spread: 0.5, waveB: 'square', mix: 0.3, cutoff: 0.78, reso: 1.5,
      a: 0.01, d: 0.2, s: 0.85, r: 0.25, width: 0.4, reverbMix: 0.2, dlyAmt: 0.2 },
    'Supersaw trance': { waveA: 'supersaw', waveB: 'supersaw', spread: 0.7, detuneB: 5, mix: 0.5,
      cutoff: 0.8, reso: 1.5, filterEnvAmt: 1500, a: 0.02, d: 0.35, s: 0.85, r: 0.45,
      dlyAmt: 0.28, dlyTime: 0.4, width: 0.7, reverbMix: 0.28, master: 0.52 },
    'Lead mono glide': { mode: 'mono', waveA: 'sawtooth', waveB: 'sawtooth', detuneB: 8, mix: 0.3,
      cutoff: 0.6, reso: 4, filterEnvAmt: 1500, glide: 0.07, a: 0.005, d: 0.2, s: 0.7, r: 0.2, dlyAmt: 0.25, width: 0.3 },
    'PWM lead': { waveA: 'square', waveB: 'square', pulseWidth: 0.5, pwmLfoLvl: 0.3, pwmLfoSpd: 1.5,
      detuneB: 5, mix: 0.5, cutoff: 0.72, reso: 2, a: 0.02, d: 0.2, s: 0.8, r: 0.3, width: 0.3, reverbMix: 0.15 },
    'Flauta vibrato': { waveA: 'sine', waveB: 'triangle', mix: 0.4, freqLfoLvl: 18, freqLfoSpd: 5.5,
      cutoff: 0.72, a: 0.08, d: 0.1, s: 0.9, r: 0.2, reverbMix: 0.28, width: 0.2 },
  },

  'Pads': {
    'Pad cálido': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -10, detuneB: 14, octavesB: 2, mix: 0.5,
      cutoff: 0.59, reso: 2, cutLfoLvl: 1500, cutLfoSpd: 0.2, a: 0.8, d: 0.5, s: 0.8, r: 2.0,
      dlyAmt: 0.3, dlyTime: 0.5, width: 0.6, reverbMix: 0.32, reverbSize: 2.6, master: 0.6 },
    'PWM strings': { waveA: 'square', waveB: 'square', detuneB: 8, octavesB: 2, mix: 0.5,
      pulseWidth: 0.5, pwmLfoLvl: 0.3, pwmLfoSpd: 0.6, cutoff: 0.7, reso: 1, a: 0.3, d: 0.4, s: 0.85, r: 0.6,
      dlyAmt: 0.2, dlyTime: 0.4, width: 0.5, reverbMix: 0.3, master: 0.6 },
    'Supersaw pad': { waveA: 'supersaw', waveB: 'supersaw', spread: 0.7, detuneB: 6, mix: 0.5,
      cutoff: 0.6, reso: 1.5, a: 0.6, d: 0.5, s: 0.85, r: 1.8, width: 0.7, reverbMix: 0.35, reverbSize: 3, master: 0.55 },
    'Pad de cristal': { waveA: 'sine', waveB: 'sine', ring: 0.3, detuneB: 12, octavesB: 2, mix: 0.5,
      cutoff: 0.8, a: 0.5, d: 0.6, s: 0.7, r: 1.5, width: 0.5, reverbMix: 0.4, reverbSize: 3.2, master: 0.6 },
    'Pad evolutivo': { waveA: 'sawtooth', waveB: 'triangle', detuneB: 10, mix: 0.5, cutoff: 0.5,
      cutLfoLvl: 1800, cutLfoSpd: 0.12, reso: 3, resLfoLvl: 4, resLfoSpd: 0.1, a: 1.0, d: 0.6, s: 0.8, r: 2.5,
      width: 0.6, reverbMix: 0.35, reverbSize: 3.5, master: 0.55 },
    'Coro (choir)': { waveA: 'supersaw', spread: 0.4, waveB: 'sine', mix: 0.4, cutoff: 0.62,
      a: 0.7, d: 0.5, s: 0.85, r: 2.0, width: 0.6, reverbMix: 0.4, reverbSize: 3, master: 0.55 },
  },

  'Plucks & Teclas': {
    'Pluck': { waveA: 'square', waveB: 'sawtooth', pulseWidth: 0.35, mix: 0.4, cutoff: 0.45, reso: 7,
      filterEnvAmt: 3500, a: 0.002, d: 0.18, s: 0.0, r: 0.12, dlyAmt: 0.3, dlyTime: 0.33, width: 0.3 },
    'Campana (Ring)': { waveA: 'sine', waveB: 'sine', ring: 0.8, detuneB: 40, octavesB: 2, mix: 0.5,
      cutoff: 0.8, reso: 1, a: 0.002, d: 1.4, s: 0.0, r: 0.9, dlyAmt: 0.25, dlyTime: 0.35, width: 0.4, reverbMix: 0.3 },
    'Caja de música': { waveA: 'sine', waveB: 'sine', ring: 0.5, detuneB: 24, octavesB: 2, mix: 0.5,
      cutoff: 0.85, a: 0.002, d: 0.8, s: 0.0, r: 0.6, dlyAmt: 0.3, dlyTime: 0.35, width: 0.4, reverbMix: 0.35 },
    'Piano eléctrico': { waveA: 'sine', waveB: 'triangle', mix: 0.45, ring: 0.15, cutoff: 0.7,
      filterEnvAmt: 2000, a: 0.003, d: 0.5, s: 0.25, r: 0.3, width: 0.3, reverbMix: 0.2 },
    'Pluck supersaw': { waveA: 'supersaw', spread: 0.6, mix: 0.2, cutoff: 0.6, reso: 3, filterEnvAmt: 3000,
      a: 0.002, d: 0.25, s: 0.1, r: 0.2, width: 0.5, reverbMix: 0.25, dlyAmt: 0.25 },
  },

  'Órgano': {
    'Órgano trémolo': { waveA: 'square', waveB: 'square', octavesB: 2, mix: 0.5, ampLfoLvl: 0.35, ampLfoSpd: 6,
      cutoff: 0.7, reso: 1, a: 0.01, d: 0.1, s: 0.9, r: 0.2, width: 0.25 },
    'Órgano pleno': { waveA: 'square', waveB: 'square', octavesA: 2, octavesB: 3, mix: 0.5,
      cutoff: 0.82, reso: 1, a: 0.005, d: 0.05, s: 1.0, r: 0.1, width: 0.3 },
    'Órgano de iglesia': { waveA: 'sine', waveB: 'sine', octavesA: 2, octavesB: 3, detuneB: 4, mix: 0.5,
      cutoff: 0.85, a: 0.05, d: 0.1, s: 1.0, r: 0.4, width: 0.4, reverbMix: 0.45, reverbSize: 3.5, master: 0.55 },
  },

  'Stabs': {
    'Hoover rave': { waveA: 'sawtooth', waveB: 'square', pulseWidth: 0.4, detuneA: -15, detuneB: 15, octavesB: 2,
      mix: 0.5, freqLfoLvl: 25, freqLfoSpd: 6, cutoff: 0.667, reso: 4, flAmt: 0.4, flSpd: 0.5, dist: 0.2,
      a: 0.02, d: 0.3, s: 0.7, r: 0.3, width: 0.3 },
    'Supersaw stab': { waveA: 'supersaw', waveB: 'supersaw', spread: 0.8, mix: 0.5, cutoff: 0.7, reso: 2,
      filterEnvAmt: 2000, a: 0.005, d: 0.25, s: 0.3, r: 0.25, dist: 0.1, width: 0.7, reverbMix: 0.25 },
    'Stab metálico': { waveA: 'sawtooth', waveB: 'sine', ring: 0.6, detuneB: 30, mix: 0.5, cutoff: 0.7,
      filterEnvAmt: 2500, a: 0.003, d: 0.3, s: 0.2, r: 0.25, dist: 0.2, width: 0.4, reverbMix: 0.2 },
  },

  'FX & Atmósferas': {
    'Drone sci-fi': { noise: 0.4, waveA: 'sine', waveB: 'sawtooth', ring: 0.4, detuneB: 25, mix: 0.5,
      cutoff: 0.49, reso: 8, cutLfoLvl: 2000, cutLfoSpd: 0.15, resLfoLvl: 6, resLfoSpd: 0.1,
      a: 1.2, d: 0.5, s: 0.9, r: 2.5, dlyAmt: 0.4, dlyTime: 0.7, width: 0.5, reverbMix: 0.4, master: 0.6 },
    'Riser tensión': { noise: 0.5, waveA: 'sawtooth', mix: 0.2, cutoff: 0.35, cutLfoLvl: 3000, cutLfoSpd: 0.08,
      reso: 8, a: 2.0, d: 0.5, s: 0.9, r: 1.5, width: 0.5, reverbMix: 0.4, reverbSize: 3.5, master: 0.6 },
    'Nave espacial': { ring: 0.7, waveA: 'sine', waveB: 'sine', detuneB: 35, octavesB: 2, mix: 0.5,
      cutoff: 0.6, cutLfoLvl: 2000, cutLfoSpd: 0.2, a: 0.5, d: 0.5, s: 0.9, r: 2.0, flAmt: 0.4, flSpd: 0.3,
      width: 0.5, reverbMix: 0.4, master: 0.6 },
    'Blip resonante': { waveA: 'sawtooth', mix: 0.2, cutoff: 0.6, reso: 16, filterEnvAmt: 4000,
      a: 0.001, d: 0.15, s: 0.0, r: 0.1, width: 0.3, reverbMix: 0.2 },
  },
};

// Los nombres son únicos en todo el banco -> lookup plano.
export function factoryPreset(name) {
  for (const cat in FACTORY) if (name in FACTORY[cat]) return FACTORY[cat][name];
  return null;
}

const LS_KEY = 'subsdj.presets.v1';
export function loadUser() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }
export function saveUser(o) { try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch (e) {} }
