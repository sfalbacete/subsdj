/* SubSDJ · sliders (range): the vertical faders of the two envelopes
   (.slider.fader: the same <input> standing upright, via CSS). Config in PARAMS (single table);
   the HTML carries no min/max/step/value: they are set here. The `log` params (cutoff, A/D/R) use
   the slider as a 0..1 position, but CONTROLS get/set ALWAYS speak in
   engine space. The value lives in a variable, not in the <input>: set(v) stores it
   EXACTLY and places the thumb; get() returns it as is (a 1000-step log slider
   would quantize every preset on load: at a 12 s attack, ±1 %).
   Like the knob, the slider publishes its 0..1 position in --pos (the CSS fills
   the track up to the thumb if the theme asks for it). */
import { part } from '../engine/parts.js';
import { PARAMS, posToVal, valToPos } from '../engine/params.js';
import { CONTROLS, applyTarget } from './registry.js';

// [id of the <input>, id of the value <span>, canonical name]
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
  ['s_fa',     'v_fa',     'fa'],          // filter envelope: faders like the amp one
  ['s_fd',     'v_fd',     'fd'],
  ['s_fs',     'v_fs',     'fs'],
  ['s_fr',     'v_fr',     'fr'],
  ['s_ema',    'v_ema',    'envmA'],       // Mod Env (Sequencing)
  ['s_emd',    'v_emd',    'envmD'],
  ['s_ems',    'v_ems',    'envmS'],
  ['s_emr',    'v_emr',    'envmR'],
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
      if (vEl) vEl.textContent = p.fmt ? p.fmt(value) : (+value).toFixed(2);
    };
    el.addEventListener('input', () => { value = posToVal(p, parseFloat(el.value)); update(); });   // drag: the value comes from the position
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
