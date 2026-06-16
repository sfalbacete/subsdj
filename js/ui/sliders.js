/* SubSDJ · sliders (range) */
import { engine } from '../engine/AudioEngine.js';
import { CONTROLS, applyTarget } from './registry.js';

const logCut = x => 20 * Math.pow(1000, x);   // 0..1 -> 20 Hz .. 20 kHz

// [id, valId, target, mapFn, fmtFn]
const SLIDERS = [
  ['s_pw',    'v_pw',    'pulseWidth', null,   v => (v * 100).toFixed(0) + '%'],
  ['s_amp',   'v_amp',   'amplitude',  null,   v => v.toFixed(2)],
  ['s_freq',  'v_freq',  'freqCents',  null,   v => v.toFixed(0) + ' ct'],
  ['s_cut',   'v_cut',   'cutoff',     logCut, v => v >= 1000 ? (v / 1000).toFixed(2) + ' kHz' : v.toFixed(0) + ' Hz'],
  ['s_res',   'v_res',   'reso',       null,   v => v.toFixed(1)],
  ['s_a',     'v_a',     'a',          null,   v => (v * 1000).toFixed(0) + ' ms'],
  ['s_d',     'v_d',     'd',          null,   v => (v * 1000).toFixed(0) + ' ms'],
  ['s_s',     'v_s',     's',          null,   v => v.toFixed(2)],
  ['s_r',     'v_r',     'r',          null,   v => (v * 1000).toFixed(0) + ' ms'],
  ['s_master','v_master','master',     null,   v => v.toFixed(2)],
];

export function bindSliders() {
  SLIDERS.forEach(([id, valId, target, mapFn, fmtFn]) => {
    const el = document.getElementById(id), v = document.getElementById(valId);
    if (!el) return;
    const def = el.value;
    const update = () => {
      const raw = parseFloat(el.value);
      const mapped = mapFn ? mapFn(raw) : raw;
      applyTarget(target, mapped);
      if (v) v.textContent = fmtFn ? fmtFn(mapped) : mapped;
    };
    el.addEventListener('input', update);
    el.addEventListener('pointerdown', () => engine.resume());
    update();
    CONTROLS[target] = { get: () => parseFloat(el.value), set: x => { el.value = x; update(); }, def: parseFloat(def) };
  });
}
