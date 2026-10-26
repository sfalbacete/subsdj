/* =====================================================================
   SubSDJ · control registry.
   Every UI control registers in CONTROLS with {get, set, def} + `el` (its
   DOM node, for MIDI learn) and optionally `opts` (discrete values:
   midimap splits the controller's travel into N zones). On top of this are
   built Reset, snapshot (save), loadState (load preset) and midimap.
   applyTarget routes to the current PART (engine/parts.js: the single engine if
   the scene is off) and emits 'param-change' (listened to by the ADSR
   graph, the activity LEDs and the Part Mixer).
   Parts mode: the ROOM keys (Room.js · SALA_KEYS) do not belong to the
   preset — neither Reset nor loading a preset touch them — and syncControls() dumps
   the state of the chosen part into the controls WITHOUT re-applying it to the engine
   (it is already like that; re-applying would cut its notes: 'mode'/'seqOn' do allNotesOff).
   ===================================================================== */
import { part, sceneOn } from '../engine/parts.js';
import { SALA_KEYS } from '../engine/Room.js';
import { toControls, withPresetBase } from '../engine/state.js';
import { PARAMS } from '../engine/params.js';

export const CONTROLS = {};
let syncing = false;   // while syncControls is dumping, the controls' set() calls don't reach the engine

export function applyTarget(target, value) {
  if (!syncing) {
    const e = part();
    if (target.includes('.')) { const [o, k] = target.split('.'); e.setOsc(o, k, value); }
    else e.set(target, value);
  }
  document.dispatchEvent(new CustomEvent('param-change', { detail: { target, value } }));
}

// A <select> as a registry control: options = [{id, label}]; `opts` = zones for MIDI learn.
export function bindSelect(sel, name, options) {
  for (const o of options) sel.add(new Option(o.label, o.id));
  const set = v => {
    if ([...sel.options].some(x => x.value === v)) sel.value = v;   // unknown value: stays as it is
    applyTarget(name, sel.value);
  };
  sel.addEventListener('change', () => { part().resume(); applyTarget(name, sel.value); });
  CONTROLS[name] = { get: () => sel.value, set, def: PARAMS[name].def, el: sel, opts: options.map(o => o.id) };
  set(PARAMS[name].def);
}

const salaKey = k => sceneOn() && SALA_KEYS.has(k);   // in Parts mode the Room is not part of the preset

export function applyDefaults() { for (const k in CONTROLS) if (!salaKey(k)) CONTROLS[k].set(CONTROLS[k].def); }
export function snapshot()      { const o = {}; for (const k in CONTROLS) o[k] = CONTROLS[k].get(); return o; }

export function loadState(state) {
  const e = part();
  e.resume();
  e.allNotesOff();
  applyDefaults();                                  // clean base (neutral: {} = Reset)
  state = withPresetBase(state);                    // a preset goes on top of the preset base (params.js)
  for (const k in state) if (CONTROLS[k] && !salaKey(k)) CONTROLS[k].set(state[k]);
}

// Shows an engine's state S in the controls (on part change).
export function syncControls(S) {
  const c = toControls(S);
  syncing = true;
  try { for (const k in CONTROLS) if (k in c) CONTROLS[k].set(c[k]); }
  finally { syncing = false; }
}
