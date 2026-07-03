/* =====================================================================
   SubSDJ · mega-banco de presets, organizado por tipo de sonido.
   FORMATO v2: valores en ESPACIO-MOTOR (cutoff en Hz, tiempos en s…),
   las claves son los nombres canónicos de PARAMS. Cada preset declara
   sólo lo que se desvía del default; los nombres son ÚNICOS en todo el
   banco (el lookup es por nombre).
   Los presets de usuario v1 (cutoff = posición 0..1 del slider) se
   migran automáticamente a v2 la primera vez (v1 queda como copia).
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
      filterEnvAmt: 2800, glide: 0.06, cutLfoLvl: 800, cutLfoSpd: 4, dist: 0.35, a: 0.003, d: 0.2, s: 0.2, r: 0.1 },
    'Slide bass': { mode: 'mono', waveA: 'sawtooth', waveB: 'sawtooth', detuneB: 6, mix: 0.1,
      cutoff: 448, reso: 6, filterEnvAmt: 2000, glide: 0.12, a: 0.005, d: 0.2, s: 0.5, r: 0.2, master: 0.78 },
    'Wobble dub': { waveA: 'sawtooth', waveB: 'square', mix: 0.4, cutoff: 296, reso: 12,
      cutLfoLvl: 2500, cutLfoSpd: 5, dist: 0.3, a: 0.005, d: 0.3, s: 0.8, r: 0.2 },
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
  },

  'Pads': {
    'Pad cálido': { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -10, detuneB: 14, octavesB: 2, mix: 0.5,
      cutoff: 1180, reso: 2, cutLfoLvl: 1500, cutLfoSpd: 0.2, a: 0.8, d: 0.5, s: 0.8, r: 2.0,
      dlyAmt: 0.3, dlyTime: 0.5, width: 0.6, reverbMix: 0.32, reverbSize: 2.6, master: 0.6 },
    'PWM strings': { waveA: 'square', waveB: 'square', detuneB: 8, octavesB: 2, mix: 0.5,
      pulseWidth: 0.5, pwmLfoLvl: 0.3, pwmLfoSpd: 0.6, cutoff: 2520, reso: 1, a: 0.3, d: 0.4, s: 0.85, r: 0.6,
      dlyAmt: 0.2, dlyTime: 0.4, width: 0.5, reverbMix: 0.3, master: 0.6 },
    'Supersaw pad': { waveA: 'supersaw', waveB: 'supersaw', spread: 0.7, detuneB: 6, mix: 0.5,
      cutoff: 1260, reso: 1.5, a: 0.6, d: 0.5, s: 0.85, r: 1.8, width: 0.7, reverbMix: 0.35, reverbSize: 3, master: 0.55 },
    'Pad de cristal': { waveA: 'sine', waveB: 'sine', ring: 0.3, detuneB: 12, octavesB: 2, mix: 0.5,
      cutoff: 5020, a: 0.5, d: 0.6, s: 0.7, r: 1.5, width: 0.5, reverbMix: 0.4, reverbSize: 3.2, master: 0.6 },
    'Pad evolutivo': { waveA: 'sawtooth', waveB: 'triangle', detuneB: 10, mix: 0.5, cutoff: 632,
      cutLfoLvl: 1800, cutLfoSpd: 0.12, reso: 3, resLfoLvl: 4, resLfoSpd: 0.1, a: 1.0, d: 0.6, s: 0.8, r: 2.5,
      width: 0.6, reverbMix: 0.35, reverbSize: 3.5, master: 0.55 },
    'Coro (choir)': { waveA: 'supersaw', spread: 0.4, waveB: 'sine', mix: 0.4, cutoff: 1450,
      a: 0.7, d: 0.5, s: 0.85, r: 2.0, width: 0.6, reverbMix: 0.4, reverbSize: 3, master: 0.55 },
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
      cutoff: 590, reso: 8, cutLfoLvl: 2000, cutLfoSpd: 0.15, resLfoLvl: 6, resLfoSpd: 0.1,
      a: 1.2, d: 0.5, s: 0.9, r: 2.5, dlyAmt: 0.4, dlyTime: 0.7, width: 0.5, reverbMix: 0.4, master: 0.6 },
    'Riser tensión': { noise: 0.5, waveA: 'sawtooth', mix: 0.2, cutoff: 224, cutLfoLvl: 3000, cutLfoSpd: 0.08,
      reso: 8, a: 2.0, d: 0.5, s: 0.9, r: 1.5, width: 0.5, reverbMix: 0.4, reverbSize: 3.5, master: 0.6 },
    'Nave espacial': { ring: 0.7, waveA: 'sine', waveB: 'sine', detuneB: 35, octavesB: 2, mix: 0.5,
      cutoff: 1260, cutLfoLvl: 2000, cutLfoSpd: 0.2, a: 0.5, d: 0.5, s: 0.9, r: 2.0, flAmt: 0.4, flSpd: 0.3,
      width: 0.5, reverbMix: 0.4, master: 0.6 },
    'Blip resonante': { waveA: 'sawtooth', mix: 0.2, cutoff: 1260, reso: 16, filterEnvAmt: 4000,
      a: 0.001, d: 0.15, s: 0.0, r: 0.1, width: 0.3, reverbMix: 0.2 },
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
