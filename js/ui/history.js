/* =====================================================================
   SubSDJ · deshacer, rehacer y comparar (Roadmap 7.0 · 1.1 y 1.2).
   DESHACER guarda GESTOS, no cambios sueltos: al empezar a tocar un control
   (ratón, teclado sobre él, un mando MIDI) se hace una foto del estado; cuando
   el gesto acaba —soltar y un silencio de QUIET_MS sin cambios; en un selector,
   al elegir— se guarda solo lo que cambió entre medias, con su antes y su
   después. Lo que mueve el código sin gesto (la deriva de los jugadores, cambiar
   de parte, el selftest) no entra. Cargar un preset y Reset son un paso cada
   uno (record). Deshacer aplica SOLO esas claves, control a control: no corta
   las notas que suenan (loadState sí lo haría), y vuelve a la pantalla donde se
   hizo el cambio. Una pila por parte. Fuera: la tabla dibujada del Editor de
   ondas (vive fuera de CONTROLS) y los gestos de ejecución (teclas, rueda).
   COMPARAR: el «Compare» de los synths de hardware. El punto ● junto al preset
   se enciende si el sonido ya no es el guardado (por COMPARACIÓN: si devuelves
   el knob a su sitio, se apaga). El botón alterna entre el guardado y tu
   edición; tocar cualquier control mientras compara vuelve antes a tu edición
   (lo que tocas se suma a ella: nunca se pierde).
   ===================================================================== */
import { CONTROLS, snapshot } from './registry.js';
import { PARAMS } from '../engine/params.js';
import { sceneOn, getScene } from '../engine/parts.js';
import { currentScreen, showScreen } from './screens.js';

const DEPTH = 100;      // pasos guardados por parte (una foto son ~250 claves: 100 pasos ≈ nada)
const QUIET_MS = 450;   // silencio que cierra un gesto sin «soltar» (rueda, flechas, mando MIDI); más corto parte un giro lento en varios pasos

const stacks = new Map();   // parte → { undo: [], redo: [] }
let open = null;            // gesto en curso: { before, part, screen, sel }
let applying = false;       // aplicando deshacer / rehacer / comparar: sus cambios no son gestos
let pointerDown = false, timer = 0;
const savedBy = new Map();  // parte → el estado del preset cargado (o guardado): la referencia de ● y Comparar
let comparing = null;       // { edited, part } mientras suena el guardado
let ui = {};                // botones y punto (initHistory)

const partKey = () => (sceneOn() ? getScene().sel : 'solo');
const stack = () => { const k = partKey(); if (!stacks.has(k)) stacks.set(k, { undo: [], redo: [] }); return stacks.get(k); };

// Iguales con tolerancia en los números (un knob devuelto «a su sitio» con el ratón no cae en el mismo float)
function same(k, a, b) {
  if (a === b) return true;
  if (typeof a !== 'number' || typeof b !== 'number') return false;
  const p = PARAMS[k], span = p && p.max !== undefined ? p.max - p.min : 1;
  return Math.abs(a - b) <= 1e-4 * span;
}
const diffKeys = (a, b) => Object.keys(b).filter(k => !same(k, a[k], b[k]));

// Nombre de un control como lo lee la pantalla Salida: «Filtro · Cutoff»
function labelOf(keys) {
  if (keys.length !== 1) return keys.length + ' cambios';
  const k = keys[0], el = CONTROLS[k] && CONTROLS[k].el;
  if (!el) return k;
  const ctl = el.closest('.ctl') || el;
  const lab = (ctl.dataset.lab || ctl.querySelector('.lab')?.textContent || el.title || k).trim();
  const h2 = el.closest('.panel')?.querySelector('h2');
  const sec = h2 ? [...h2.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() : '';
  return sec ? sec + ' · ' + lab : lab;
}

// Aplica valores a los controles sin que cuenten como gesto
function put(values) {
  applying = true;
  try { for (const k in values) if (CONTROLS[k]) CONTROLS[k].set(values[k]); }
  finally { applying = false; }
}

// ---------- gestos ----------
export function begin() {
  if (applying || open) return;
  if (comparing) exitCompare();                     // se toca tu edición, no el guardado
  open = { before: snapshot(), part: partKey(), screen: currentScreen() };
}
function later() { clearTimeout(timer); timer = setTimeout(end, QUIET_MS); }
export function end() {
  clearTimeout(timer);
  if (!open) return;
  const g = open; open = null;
  if (g.part !== partKey()) return;                 // cambió de parte a mitad: no hay a qué volver
  const after = snapshot(), keys = diffKeys(g.before, after);
  if (keys.length) push({ b: pick(g.before, keys), a: pick(after, keys), label: labelOf(keys), screen: g.screen });
}
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]));
function push(step) {
  const s = stack();
  s.undo.push(step); s.redo.length = 0;
  if (s.undo.length > DEPTH) s.undo.shift();
  refresh();
}

// Una ACCIÓN (cargar un preset, Reset) como un paso: lo que cambie dentro de fn.
// saved: el estado resultante pasa a ser el «guardado» (● apagado).
export function record(label, fn, { saved: markIt = false } = {}) {
  end();
  if (comparing) exitCompare();
  const before = snapshot(), screen = currentScreen();
  applying = true;
  try { fn(); } finally { applying = false; }
  const after = snapshot(), keys = diffKeys(before, after);
  if (keys.length) push({ b: pick(before, keys), a: pick(after, keys), label, screen });
  if (markIt) markSaved();
}

// ---------- deshacer / rehacer ----------
function travel(from, to, side, verb) {
  end();
  if (comparing) exitCompare();
  const step = from.pop(); if (!step) return null;
  put(step[side]);
  to.push(step);
  if (step.screen && step.screen !== currentScreen()) showScreen(step.screen);
  document.dispatchEvent(new CustomEvent('display-show', { detail: { who: verb, val: step.label } }));
  refresh();
  return step;
}
export const undo = () => { const s = stack(); return travel(s.undo, s.redo, 'b', 'Deshacer'); };
export const redo = () => { const s = stack(); return travel(s.redo, s.undo, 'a', 'Rehacer'); };
export const historyDepth = () => ({ undo: stack().undo.length, redo: stack().redo.length });

// ---------- comparar con el guardado ----------
export function markSaved() { savedBy.set(partKey(), snapshot()); refresh(); }
const saved = () => savedBy.get(partKey());          // sin preset conocido en esta parte: ni ● ni Comparar
export const isModified = () => !!saved() && diffKeys(saved(), snapshot()).length > 0;
export function enterCompare() {
  end();
  if (comparing || !isModified()) return;
  comparing = { edited: snapshot(), part: partKey() };
  put(saved());
  refresh();
}
export function exitCompare() {
  if (!comparing) return;
  const c = comparing; comparing = null;
  if (c.part === partKey()) put(c.edited);
  refresh();
}
export const isComparing = () => !!comparing;

// ---------- UI ----------
let pend = false;
function refresh() {
  if (pend) return; pend = true;
  requestAnimationFrame(() => {
    pend = false;
    const s = stack(), u = s.undo[s.undo.length - 1], r = s.redo[s.redo.length - 1];
    if (ui.undo) { ui.undo.disabled = !u; ui.undo.title = u ? 'Deshacer: ' + u.label + ' (Ctrl+Z)' : 'Nada que deshacer'; }
    if (ui.redo) { ui.redo.disabled = !r; ui.redo.title = r ? 'Rehacer: ' + r.label + ' (Ctrl+Y)' : 'Nada que rehacer'; }
    const mod = comparing ? true : isModified();
    if (ui.dot) ui.dot.classList.toggle('on', mod);
    if (ui.cmp) {
      ui.cmp.classList.toggle('on', !!comparing);
      ui.cmp.disabled = !mod;
      ui.cmp.title = comparing ? 'Suena el preset GUARDADO: clic para volver a tu edición (tocar cualquier control también vuelve)'
        : mod ? 'Comparar: oír el preset guardado y volver a tu edición' : 'Sin cambios respecto al preset guardado';
    }
  });
}

export function initHistory() {
  ui = { undo: document.getElementById('undoBtn'), redo: document.getElementById('redoBtn'),
         cmp: document.getElementById('cmpBtn'), dot: document.getElementById('modDot') };
  const main = document.getElementById('screens');
  // Gestos: tocar algo de las pantallas (no el teclado ni la rueda: son ejecución)
  document.addEventListener('pointerdown', e => {
    if (!main.contains(e.target)) return;
    if (open && open.sel && !open.sel.contains(e.target)) end();   // un selector que se abrió y no se usó
    pointerDown = true; begin();
    const sel = e.target.closest('select');
    if (open && sel) open.sel = sel;                 // un selector cambia al ELEGIR, después de soltar
  }, true);
  window.addEventListener('pointerup', () => { if (!pointerDown) return; pointerDown = false; if (open && !open.sel) later(); }, true);
  document.addEventListener('change', e => { if (open && open.sel === e.target) later(); }, true);
  document.addEventListener('focusout', e => { if (open && open.sel === e.target) later(); }, true);
  document.addEventListener('keydown', e => {      // flechas en un deslizador, escribir un patrón…
    if (main.contains(e.target) && !(e.ctrlKey || e.metaKey)) { begin(); later(); }
  }, true);
  document.addEventListener('ctl-touch', () => { begin(); later(); });   // un mando MIDI
  document.addEventListener('param-change', () => {
    if (applying) return;
    if (open && !pointerDown && !open.sel) later();
    refresh();
  });
  // Cambiar de parte o encender las Partes: antes, se cierra lo abierto y se sale de comparar
  document.getElementById('partsBar')?.addEventListener('pointerdown', () => { end(); exitCompare(); }, true);
  document.addEventListener('scene-loaded', () => { savedBy.clear(); refresh(); });   // las partes traen sonidos nuevos
  // Atajos: Ctrl+Z · Ctrl+Y / Ctrl+Mayús+Z (en un campo de texto, el deshacer del propio campo)
  window.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const t = e.target, txt = t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type === 'text') || t.isContentEditable);
    if (txt) return;
    if (e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) { e.preventDefault(); redo(); }
  });
  ui.undo?.addEventListener('click', undo);
  ui.redo?.addEventListener('click', redo);
  ui.cmp?.addEventListener('click', () => (comparing ? exitCompare() : enterCompare()));
  markSaved();                                       // lo que suena al arrancar es «el guardado»
}
