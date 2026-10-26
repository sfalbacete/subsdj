/* =====================================================================
   SubSDJ · MIDI learn — mapeo CC → control de la UI.
   Modo learn (botón 🎛 MIDI map en cabecera): clic en un control en
   pantalla y girar el mando físico → el par (CC → control) queda ligado;
   clic derecho desliga. El mapa se guarda solo en localStorage POR
   APARATO (la clave es el nombre del dispositivo MIDI: cada teclado
   recuerda su mapeo) y viaja como JSON con ⇩/⇧ Mapa.
   Binding {id, lo, hi}: lo/hi (0..1) acotan el tramo del rango que
   recorre el mando (learn crea 0..1; editable a mano en el JSON — el
   mapeo de fábrica usa hi 0.5 en la mod wheel). El canal MIDI se ignora
   a propósito: cambiar el canal global del teclado no rompe el mapa.
   Controles discretos (segs, formas de LFO, octavas): el recorrido del
   mando se parte en N zonas. Pickup opcional: si el control se movió por
   otra vía (preset, ratón), el mando no actúa hasta acercarse o cruzar
   el valor en pantalla (evita saltos al cambiar de preset).
   Además de parámetros hay ACCIONES mapeables (‹ › del banco de presets):
   no entran en presets/snapshot y disparan por flanco de subida (≥64),
   pensadas para botones físicos que mandan 0/127.
   ===================================================================== */
import { PARAM_KEYS } from '../engine/legacy.js';
import { PARAMS, posToVal, valToPos } from '../engine/params.js';
import { CONTROLS } from './registry.js';
import { stepPreset } from './presetBank.js';

const FORMAT = 'subsdj-midimap-v1';
const LS_PREFIX = 'subsdj.midimap.v1:';

// Mapeo de fábrica (lo que antes estaba fijo en midi.js).
const DEFAULT_CCS = {
  1:  { id: 'freqLfoLvl', lo: 0, hi: 0.5 },   // mod wheel → vibrato comedido
  74: { id: 'cutoff' },                       // brightness (convención GM)
  71: { id: 'reso' },                         // harmonic content (GM)
};

// Acciones mapeables que NO son parámetros (fuera de presets/snapshot).
// Se rellenan en initMidiMap, cuando sus botones existen en el DOM.
const ACTIONS = {};

let device = null;                 // nombre del aparato (clave del guardado)
let map = { pickup: false, ccs: {} };
let pending = null;                // id de control esperando CC (learn)
let learnOn = false;
let ccState = {};                  // por CC: {last, sent} en espacio 0..1
let msgEl = null;

const msg = t => { if (msgEl) msgEl.textContent = t; };

// CC (posición 0..1) <-> valor de motor. posToVal solo trata el caso log;
// para params lineales el CC recorre min..max explícitamente.
export const ccToVal = (p, x) => p.log ? posToVal(p, x) : p.min + x * (p.max - p.min);
export const valToCC = (p, v) => p.log ? valToPos(p, v) : (v - p.min) / (p.max - p.min);
// Controles discretos: el recorrido del mando se parte en N zonas.
export const zoneOf = (opts, x) =>
  opts[Math.min(opts.length - 1, Math.max(0, Math.floor(x * opts.length)))];

// ---------- persistencia (una clave de localStorage por aparato) ----------
const lsKey = () => LS_PREFIX + (device || 'default');
function save() { try { localStorage.setItem(lsKey(), JSON.stringify(map)); } catch (e) {} }

// Controles que cambiaron de clave: un mapa guardado sigue moviendo su sucesor
// (el Mix A↔B se partió en dos niveles en 1.2.0: el CC pasa a mover el del B;
// en 1.4.0 las claves en castellano pasaron al inglés: legacy.PARAM_KEYS).
const RENAMED = { mix: 'levelB', ...PARAM_KEYS };

// Acepta JSON externo o de versiones futuras: filtra ids muertos y CCs imposibles.
function sanitize(raw) {
  const m = { pickup: !!(raw && raw.pickup), ccs: {} };
  const src = raw && raw.ccs && typeof raw.ccs === 'object' ? raw.ccs : {};
  for (const k in src) {
    const cc = +k, b = src[k], id = b && (RENAMED[b.id] || b.id);
    if (!(cc >= 0 && cc <= 127) || !b || !(id in CONTROLS || id in ACTIONS)) continue;
    m.ccs[cc] = {
      id,
      lo: Number.isFinite(+b.lo) ? +b.lo : 0,
      hi: Number.isFinite(+b.hi) ? +b.hi : 1,
    };
  }
  return m;
}

// midi.js anuncia aquí el aparato conectado; se carga SU mapa (o el de fábrica).
export function setDevice(name) {
  device = name || null;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(lsKey())); } catch (e) {}
  map = raw ? sanitize(raw) : sanitize({ ccs: DEFAULT_CCS });
  ccState = {};
  syncUI();
}
export const getDevice = () => device;
export const getMap = () => map;

// ---------- aplicar un CC entrante (devuelve true si estaba mapeado) ----------
export function applyCC(cc, x) {
  const b = map.ccs[cc];
  if (!b) return false;
  x = b.lo + x * (b.hi - b.lo);
  if (learnOn) msg('CC ' + cc + ' → ' + b.id);
  const act = ACTIONS[b.id];
  if (act) {                                   // acción (botón): flanco de subida
    const st = ccState[cc] || (ccState[cc] = {});
    if (x >= 0.5 && !(st.last >= 0.5)) { act.run(); flash(act.el); }
    st.last = x;
    return true;
  }
  const ctl = CONTROLS[b.id], p = PARAMS[b.id];
  if (!ctl) return true;                       // id muerto: consumir sin romper
  if (ctl.opts) { ctl.set(zoneOf(ctl.opts, x)); flash(ctl.el); return true; }
  if (!p || p.min == null) return true;
  const st = ccState[cc] || (ccState[cc] = {});
  const cur = valToCC(p, ctl.get());
  // pickup: si otro (preset, ratón) movió el control desde el último CC,
  // el mando no actúa hasta acercarse (2%) o cruzar el valor en pantalla
  const moved = st.sent == null || Math.abs(cur - st.sent) > 0.005;
  const near = Math.abs(x - cur) <= 0.02;
  const crossed = st.last != null && (st.last - cur) * (x - cur) <= 0;
  const hold = map.pickup && moved && !near && !crossed;
  st.last = x;
  if (hold) return true;
  ctl.set(ccToVal(p, Math.min(1, Math.max(0, x))));
  st.sent = valToCC(p, ctl.get());             // releído: los sliders cuantizan por step
  flash(ctl.el);
  return true;
}

// ---------- learn ----------
export function armLearn(id) {
  pending = id;
  paintPending();
  if (id) msg('mueve un mando físico para ligarlo a «' + id + '»…');
}
export function learnCapture(cc) {
  if (pending == null) return false;
  for (const k in map.ccs) if (map.ccs[k].id === pending) delete map.ccs[k];  // re-learn = mover el binding
  map.ccs[cc] = { id: pending, lo: 0, hi: 1 };
  delete ccState[cc];
  msg('ligado: CC ' + cc + ' → ' + pending);
  pending = null;
  paintPending(); save(); syncUI();
  return true;
}
function unbind(id) {
  let had = false;
  for (const k in map.ccs) if (map.ccs[k].id === id) { delete map.ccs[k]; had = true; }
  if (had) { save(); syncUI(); }
  msg(had ? '«' + id + '» desligado' : '«' + id + '» no estaba ligado');
}

// ---------- feedback visual ----------
function flash(el) {
  if (!el) return;
  el.classList.add('midi-hit');
  clearTimeout(el._mmT);
  el._mmT = setTimeout(() => el.classList.remove('midi-hit'), 180);
  document.dispatchEvent(new CustomEvent('ctl-touch', { detail: { el } }));   // la pantalla Salida enseña el mando que giras
}
const targetOf = id => CONTROLS[id] || ACTIONS[id];   // ambos llevan .el

function paintPending() {
  document.querySelectorAll('.midi-wait').forEach(e => e.classList.remove('midi-wait'));
  const t = pending && targetOf(pending);
  if (t && t.el) t.el.classList.add('midi-wait');
}
function syncUI() {   // insignias CCnn sobre los controles ligados + checkbox pickup
  document.querySelectorAll('[data-cc]').forEach(e => e.removeAttribute('data-cc'));
  for (const cc in map.ccs) {
    const t = targetOf(map.ccs[cc].id);
    if (t && t.el) t.el.setAttribute('data-cc', cc);
  }
  const pk = document.getElementById('mmPickup');
  if (pk) pk.checked = !!map.pickup;
}

// ---------- modo learn (captura clics sobre los controles) ----------
function findIn(reg, target) {
  for (const k in reg) {
    const el = reg[k].el;
    if (el && (el === target || el.contains(target))) return k;
  }
  return null;
}
const controlAt = target => findIn(CONTROLS, target) || findIn(ACTIONS, target);
function setLearn(on) {
  learnOn = on;
  document.body.classList.toggle('midi-learn', on);
  const btn = document.getElementById('midiLearnBtn');
  if (btn) btn.classList.toggle('on', on);
  const bar = document.getElementById('midiBar');
  if (bar) bar.hidden = !on;
  armLearn(null);
  if (on) {
    for (const k in CONTROLS) if (CONTROLS[k].el) CONTROLS[k].el.classList.add('mappable');
    for (const k in ACTIONS) if (ACTIONS[k].el) ACTIONS[k].el.classList.add('mappable');
    syncUI();
    msg(device ? 'aparato: ' + device : 'sin aparato MIDI — conecta uno para ligar mandos');
  }
}
function intercept(e) {   // en modo learn los controles no se accionan: se eligen
  if (!learnOn) return;
  const id = controlAt(e.target);
  if (id == null) return;
  e.preventDefault(); e.stopPropagation();
  if (e.type === 'pointerdown') armLearn(id);
}
function onCtx(e) {       // clic derecho en modo learn = desligar
  if (!learnOn) return;
  const id = controlAt(e.target);
  if (id == null) return;
  e.preventDefault(); e.stopPropagation();
  unbind(id);
}

export function initMidiMap() {
  msgEl = document.getElementById('mmMsg');

  // acciones: navegar el banco de presets desde botones físicos
  const act = (id, elId, run) => {
    const el = document.getElementById(elId);
    if (el) ACTIONS[id] = { el, run };
  };
  act('presetPrev', 'prevBtn', () => stepPreset(-1));
  act('presetNext', 'nextBtn', () => stepPreset(1));

  setDevice(null);        // mapa 'default' hasta que midi.js anuncie el aparato

  const btn = document.getElementById('midiLearnBtn');
  if (btn) btn.addEventListener('click', () => setLearn(!learnOn));
  const close = document.getElementById('mmClose');
  if (close) close.addEventListener('click', () => setLearn(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && learnOn) setLearn(false); });
  ['pointerdown', 'click', 'dblclick'].forEach(t => document.addEventListener(t, intercept, true));
  document.addEventListener('contextmenu', onCtx, true);

  const pk = document.getElementById('mmPickup');
  if (pk) pk.addEventListener('change', () => { map.pickup = pk.checked; save(); });

  const def = document.getElementById('mmDef');
  if (def) def.addEventListener('click', () => {
    map = sanitize({ ccs: DEFAULT_CCS }); ccState = {};
    save(); syncUI(); msg('mapeo de fábrica (CC1 · CC74 · CC71)');
  });

  // export/import del mapeo (mismo patrón que el banco de presets)
  const exp = document.getElementById('mmExp');
  if (exp) exp.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ format: FORMAT, device, ...map }, null, 2)],
      { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'subsdj-midimap.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    msg('mapeo exportado (' + Object.keys(map.ccs).length + ' CCs)');
  });
  const impFile = document.getElementById('mmFile');
  const imp = document.getElementById('mmImp');
  if (imp) imp.addEventListener('click', () => impFile.click());
  if (impFile) impFile.addEventListener('change', () => {
    const f = impFile.files[0]; if (!f) return;
    f.text().then(txt => {
      let data; try { data = JSON.parse(txt); } catch (e) { msg('ese archivo no es JSON válido'); return; }
      map = sanitize(data); ccState = {};
      save(); syncUI();
      msg('mapeo importado (' + Object.keys(map.ccs).length + ' CCs válidos)');
      impFile.value = '';
    });
  });
}
