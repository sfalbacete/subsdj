/* SubSDJ · rotary knobs (vertical drag). Config in PARAMS (single table).
   They support `log` (cutoff: the drag works on a 0..1 position with exponential
   mapping, as the sliders used to) and `fmt` (specific display formatting).
   attachKnob() is the bare knob — drag, double click = default, formatting,
   dimmed at 0 if `act` — knowing nothing about PARAMS or the registry: the
   Part Mixer reuses it (level / pan / sends per part).
   CONTRACT WITH THE SKIN: the knob draws nothing; it publishes its 0..1 position in
   the CSS variable --pos of the .knob (and .off when an `act` is at 0) and the CSS
   decides what to do with it: turn the tick, the dot, paint the arc… */
import { part } from '../engine/parts.js';
import { PARAMS, posToVal, valToPos } from '../engine/params.js';
import { CONTROLS, applyTarget } from './registry.js';

function fmt(v, unit) {
  const a = Math.abs(v);
  const s = a >= 100 ? v.toFixed(0) : (a >= 10 ? v.toFixed(1) : v.toFixed(2));
  return s + unit;
}

// cfg: {min, max, def, log?, fmt?, unit?, act?} · onChange(value) when turned (and at startup).
export function attachKnob(el, cfg, onChange) {
  const unit = cfg.unit || '';
  const valEl = el.parentElement.querySelector('.val');
  let value = cfg.def;
  const render = () => {
    const pos = cfg.log ? valToPos(cfg, value) : (value - cfg.min) / (cfg.max - cfg.min);
    el.style.setProperty('--pos', pos.toFixed(4));           // published state: the CSS turns / paints with this
    if (valEl) valEl.textContent = cfg.fmt ? cfg.fmt(value) : fmt(value, unit);
    if (cfg.act) el.classList.toggle('off', value === 0);   // 0 = off: dimmed tick
  };
  const setVal = v => { value = Math.min(cfg.max, Math.max(cfg.min, v)); render(); onChange(value); };
  render(); onChange(value);

  let startY = 0, startV = 0, startP = 0, dragging = false;
  el.addEventListener('pointerdown', e => {
    part().resume(); dragging = true; startY = e.clientY;
    startV = value; startP = cfg.log ? valToPos(cfg, value) : 0;
    el.setPointerCapture(e.pointerId); e.preventDefault();
  });
  el.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dy = startY - e.clientY, fine = e.shiftKey ? 0.25 : 1;
    if (cfg.log) {                              // in position space: even resolution in lows and highs
      const p = Math.min(1, Math.max(0, startP + dy / 200 * fine));
      setVal(posToVal(cfg, p));
    } else {
      setVal(startV + dy * ((cfg.max - cfg.min) / 200) * fine);
    }
  });
  const end = e => { dragging = false; try { el.releasePointerCapture(e.pointerId); } catch (_) {} };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('dblclick', () => setVal(cfg.def));
  return { get: () => value, set: setVal };
}

export function bindKnobs() {
  document.querySelectorAll('.knob').forEach(el => {
    const name = el.dataset.knob, cfg = PARAMS[name];
    if (!cfg) return;                                        // knobs without PARAMS (Part Mixer): not preset controls
    const target = cfg.t || name;
    const k = attachKnob(el, cfg, v => applyTarget(target, v));
    CONTROLS[name] = { get: k.get, set: k.set, def: cfg.def, el: el.parentElement };
  });
}
