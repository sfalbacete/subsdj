/* SubSDJ · knobs rotatorios (arrastre vertical). Config en PARAMS (tabla única). */
import { engine } from '../engine/AudioEngine.js';
import { PARAMS } from '../engine/params.js';
import { CONTROLS, applyTarget } from './registry.js';

function fmt(v, unit) {
  const a = Math.abs(v);
  const s = a >= 100 ? v.toFixed(0) : (a >= 10 ? v.toFixed(1) : v.toFixed(2));
  return s + unit;
}

export function bindKnobs() {
  document.querySelectorAll('.knob').forEach(el => {
    const name = el.dataset.knob, cfg = PARAMS[name];
    if (!cfg) return;
    const target = cfg.t || name;
    const unit = cfg.unit || '';
    const ind = el.querySelector('.ind');
    const valEl = el.parentElement.querySelector('.val');
    let value = cfg.def;
    const render = () => {
      const pos = (value - cfg.min) / (cfg.max - cfg.min);
      ind.style.transform = `rotate(${-135 + pos * 270}deg)`;
      if (valEl) valEl.textContent = fmt(value, unit);
    };
    const setVal = v => { value = Math.min(cfg.max, Math.max(cfg.min, v)); render(); applyTarget(target, value); };
    render(); applyTarget(target, value);

    let startY = 0, startV = 0, dragging = false;
    el.addEventListener('pointerdown', e => {
      engine.resume(); dragging = true; startY = e.clientY; startV = value;
      el.setPointerCapture(e.pointerId); e.preventDefault();
    });
    el.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dy = startY - e.clientY, span = cfg.max - cfg.min, fine = e.shiftKey ? 0.25 : 1;
      setVal(startV + dy * (span / 200) * fine);
    });
    const end = e => { dragging = false; try { el.releasePointerCapture(e.pointerId); } catch (_) {} };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('dblclick', () => setVal(cfg.def));
    CONTROLS[name] = { get: () => value, set: v => setVal(v), def: cfg.def, el: el.parentElement };
  });
}
