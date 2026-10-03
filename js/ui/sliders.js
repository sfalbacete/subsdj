/* SubSDJ · sliders (range). Config en PARAMS (tabla única); el HTML no lleva
   min/max/step/value: se fijan aquí. Los params `log` (cutoff, A/D/R) usan el
   slider como posición 0..1, pero CONTROLS get/set hablan SIEMPRE en
   espacio-motor. El valor vive en una variable, no en el <input>: set(v) lo
   guarda EXACTO y coloca el pulgar; get() lo devuelve tal cual (un slider log
   de 1000 pasos cuantizaría cada preset al cargarlo: a 12 s de ataque, ±1 %).
   Como el knob, el slider publica su posición 0..1 en --pos (el CSS rellena
   el carril hasta el pulgar si el tema lo pide). */
import { part } from '../engine/parts.js';
import { PARAMS, posToVal, valToPos } from '../engine/params.js';
import { CONTROLS, applyTarget } from './registry.js';

// [id del <input>, id del <span> de valor, nombre canónico]
const SLIDERS = [
  ['s_pw',     'v_pw',     'pulseWidth'],
  ['s_amp',    'v_amp',    'amplitude'],
  ['s_freq',   'v_freq',   'freqCents'],
  ['s_cut',    'v_cut',    'cutoff'],
  ['s_res',    'v_res',    'reso'],
  ['s_a',      'v_a',      'a'],
  ['s_d',      'v_d',      'd'],
  ['s_s',      'v_s',      's'],
  ['s_r',      'v_r',      'r'],
  ['s_master', 'v_master', 'master'],
];

export function bindSliders() {
  SLIDERS.forEach(([id, valId, name]) => {
    const el = document.getElementById(id), vEl = document.getElementById(valId), p = PARAMS[name];
    if (!el || !p) return;
    if (p.log) { el.min = 0; el.max = 1; el.step = 0.001; }
    else { el.min = p.min; el.max = p.max; el.step = p.step != null ? p.step : 0.01; }
    let value = p.def;
    const update = () => {
      el.style.setProperty('--pos', ((parseFloat(el.value) - el.min) / (el.max - el.min)).toFixed(4));
      applyTarget(p.t || name, value);
      if (vEl) vEl.textContent = p.fmt ? p.fmt(value) : String(value);
    };
    el.addEventListener('input', () => { value = posToVal(p, parseFloat(el.value)); update(); });   // arrastre: el valor sale de la posición
    el.addEventListener('pointerdown', () => part().resume());
    el.value = valToPos(p, p.def);
    update();
    CONTROLS[name] = {
      get: () => value,
      set: v => { value = Math.min(p.max, Math.max(p.min, +v)); el.value = valToPos(p, value); update(); },
      def: p.def,
      el: el.closest('.slider'),
    };
  });
}
