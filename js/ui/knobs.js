/* SubSDJ · knobs rotatorios (arrastre vertical). Config en PARAMS (tabla única).
   Soportan `log` (cutoff: el arrastre trabaja en posición 0..1 con mapeo
   exponencial, como hacían los sliders) y `fmt` (presentación específica).
   attachKnob() es el knob a secas — arrastre, doble clic = default, formato,
   atenuado a 0 si `act` — sin saber de PARAMS ni del registro: lo reutiliza
   el mezclador de partes (nivel / pan / envíos por parte). */
import { part } from '../engine/parts.js';
import { PARAMS, posToVal, valToPos } from '../engine/params.js';
import { CONTROLS, applyTarget } from './registry.js';

function fmt(v, unit) {
  const a = Math.abs(v);
  const s = a >= 100 ? v.toFixed(0) : (a >= 10 ? v.toFixed(1) : v.toFixed(2));
  return s + unit;
}

// cfg: {min, max, def, log?, fmt?, unit?, act?} · onChange(value) al girar (y al arrancar).
export function attachKnob(el, cfg, onChange) {
  const unit = cfg.unit || '';
  const ind = el.querySelector('.ind');
  const valEl = el.parentElement.querySelector('.val');
  let value = cfg.def;
  const render = () => {
    const pos = cfg.log ? valToPos(cfg, value) : (value - cfg.min) / (cfg.max - cfg.min);
    ind.style.transform = `rotate(${-135 + pos * 270}deg)`;
    if (valEl) valEl.textContent = cfg.fmt ? cfg.fmt(value) : fmt(value, unit);
    if (cfg.act) el.classList.toggle('off', value === 0);   // 0 = apagado: rayita atenuada
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
    if (cfg.log) {                              // en espacio-posición: resolución pareja en graves y agudos
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
    if (!cfg) return;                                        // knobs sin PARAMS (mezclador): no son controles del preset
    const target = cfg.t || name;
    const k = attachKnob(el, cfg, v => applyTarget(target, v));
    CONTROLS[name] = { get: k.get, set: k.set, def: cfg.def, el: el.parentElement };
  });
}
