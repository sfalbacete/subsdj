/* =====================================================================
   SubSDJ · registro de controles.
   Cada control UI se inscribe en CONTROLS con {get, set, def} + `el` (su
   nodo DOM, para MIDI learn) y opcionalmente `opts` (valores discretos:
   midimap parte el recorrido del mando en N zonas). Sobre esto se
   construyen Reset, snapshot (guardar), loadState (cargar preset) y midimap.
   applyTarget enruta a la PARTE actual (engine/parts.js: el motor único si
   la escena está apagada) y emite 'param-change' (lo escuchan el gráfico
   ADSR, los LEDs de actividad y el mezclador).
   Modo Partes: las claves de la SALA (Sala.js · SALA_KEYS) no son del
   preset — ni Reset ni cargar un preset las tocan — y syncControls() vuelca
   el estado de la parte elegida en los controles SIN reaplicarlo al motor
   (ya está así; reaplicar cortaría sus notas: 'mode'/'seqOn' hacen allNotesOff).
   ===================================================================== */
import { part, sceneOn } from '../engine/parts.js';
import { SALA_KEYS } from '../engine/Sala.js';
import { toControls } from '../engine/state.js';

export const CONTROLS = {};
let syncing = false;   // mientras syncControls vuelca, los set() de los controles no llegan al motor

export function applyTarget(target, value) {
  if (!syncing) {
    const e = part();
    if (target.includes('.')) { const [o, k] = target.split('.'); e.setOsc(o, k, value); }
    else e.set(target, value);
  }
  document.dispatchEvent(new CustomEvent('param-change', { detail: { target, value } }));
}

const salaKey = k => sceneOn() && SALA_KEYS.has(k);   // en modo Partes la sala no es del preset

export function applyDefaults() { for (const k in CONTROLS) if (!salaKey(k)) CONTROLS[k].set(CONTROLS[k].def); }
export function snapshot()      { const o = {}; for (const k in CONTROLS) o[k] = CONTROLS[k].get(); return o; }

export function loadState(state) {
  const e = part();
  e.resume();
  e.allNotesOff();
  applyDefaults();                                  // base limpia
  for (const k in state) if (CONTROLS[k] && !salaKey(k)) CONTROLS[k].set(state[k]);
}

// Enseña en los controles el estado S de un motor (al cambiar de parte).
export function syncControls(S) {
  const c = toControls(S);
  syncing = true;
  try { for (const k in CONTROLS) if (k in c) CONTROLS[k].set(c[k]); }
  finally { syncing = false; }
}
