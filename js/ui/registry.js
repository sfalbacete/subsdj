/* =====================================================================
   SubSDJ · registro de controles.
   Cada control UI se inscribe en CONTROLS con {get, set, def}. Sobre esto
   se construyen Reset, snapshot (guardar) y loadState (cargar preset).
   applyTarget enruta al engine y emite 'param-change' (lo escucha el gráfico ADSR).
   ===================================================================== */
import { engine } from '../engine/AudioEngine.js';

export const CONTROLS = {};

export function applyTarget(target, value) {
  if (target.includes('.')) { const [o, k] = target.split('.'); engine.setOsc(o, k, value); }
  else engine.set(target, value);
  document.dispatchEvent(new CustomEvent('param-change', { detail: { target, value } }));
}

export function applyDefaults() { for (const k in CONTROLS) CONTROLS[k].set(CONTROLS[k].def); }
export function snapshot()      { const o = {}; for (const k in CONTROLS) o[k] = CONTROLS[k].get(); return o; }

export function loadState(state) {
  engine.resume();
  engine.allNotesOff();
  applyDefaults();                                  // base limpia
  for (const k in state) if (CONTROLS[k]) CONTROLS[k].set(state[k]);
}
