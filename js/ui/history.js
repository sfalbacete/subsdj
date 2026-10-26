/* =====================================================================
   SubSDJ · undo, redo and compare (Roadmap 7.0 · 1.1 and 1.2).
   UNDO stores GESTURES, not loose changes: when you start touching a control
   (mouse, keyboard on it, a MIDI controller) a snapshot of the state is taken; when
   the gesture ends —release plus a QUIET_MS silence with no changes; on a selector,
   on choosing— only what changed in between is stored, with its before and its
   after. What code moves without a gesture (the players' drift, changing
   part, the selftest) doesn't go in. Loading a preset and Reset are one step
   each (record). Undo applies ONLY those keys, control by control: it doesn't cut
   the sounding notes (loadState would), and it goes back to the screen where the
   change was made. One stack per part. Left out: the drawn table of the Wave
   Editor (it lives outside CONTROLS) and performance gestures (keys, wheel).
   COMPARE: the «Compare» of hardware synths. The ● dot next to the preset
   lights up if the sound is no longer the saved one (by COMPARISON: if you put
   the knob back in place, it goes off). The button toggles between the saved one and your
   edit; touching any control while comparing first goes back to your edit
   (what you touch is added to it: it is never lost).
   ===================================================================== */
import { CONTROLS, snapshot } from './registry.js';
import { PARAMS } from '../engine/params.js';
import { sceneOn, getScene } from '../engine/parts.js';
import { currentScreen, showScreen } from './screens.js';

const DEPTH = 100;      // steps stored per part (a snapshot is ~250 keys: 100 steps ≈ nothing)
const QUIET_MS = 450;   // silence that closes a gesture with no «release» (wheel, arrows, MIDI controller); shorter splits a slow turn into several steps

const stacks = new Map();   // part → { undo: [], redo: [] }
let open = null;            // gesture in progress: { before, part, screen, sel }
let applying = false;       // applying undo / redo / compare: its changes are not gestures
let pointerDown = false, timer = 0;
const savedBy = new Map();  // part → the state of the loaded (or saved) preset: the reference for ● and Compare
let comparing = null;       // { edited, part } while the saved one is playing
let ui = {};                // buttons and dot (initHistory)

const partKey = () => (sceneOn() ? getScene().sel : 'solo');
const stack = () => { const k = partKey(); if (!stacks.has(k)) stacks.set(k, { undo: [], redo: [] }); return stacks.get(k); };

// Equal with a tolerance on numbers (a knob put back «in place» with the mouse doesn't land on the same float)
function same(k, a, b) {
  if (a === b) return true;
  if (typeof a !== 'number' || typeof b !== 'number') return false;
  const p = PARAMS[k], span = p && p.max !== undefined ? p.max - p.min : 1;
  return Math.abs(a - b) <= 1e-4 * span;
}
const diffKeys = (a, b) => Object.keys(b).filter(k => !same(k, a[k], b[k]));

// Name of a control as the Output display reads it: «Filter · Cutoff»
function labelOf(keys) {
  if (keys.length !== 1) return keys.length + ' changes';
  const k = keys[0], el = CONTROLS[k] && CONTROLS[k].el;
  if (!el) return k;
  const ctl = el.closest('.ctl') || el;
  const lab = (ctl.dataset.lab || ctl.querySelector('.lab')?.textContent || el.title || k).trim();
  const h2 = el.closest('.panel')?.querySelector('h2');
  const sec = h2 ? [...h2.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() : '';
  return sec ? sec + ' · ' + lab : lab;
}

// Applies values to the controls without them counting as a gesture
function put(values) {
  applying = true;
  try { for (const k in values) if (CONTROLS[k]) CONTROLS[k].set(values[k]); }
  finally { applying = false; }
}

// ---------- gestures ----------
export function begin() {
  if (applying || open) return;
  if (comparing) exitCompare();                     // you touch your edit, not the saved one
  open = { before: snapshot(), part: partKey(), screen: currentScreen() };
}
function later() { clearTimeout(timer); timer = setTimeout(end, QUIET_MS); }
export function end() {
  clearTimeout(timer);
  if (!open) return;
  const g = open; open = null;
  if (g.part !== partKey()) return;                 // part changed midway: nothing to go back to
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

// An ACTION (loading a preset, Reset) as one step: whatever changes inside fn.
// saved: the resulting state becomes the «saved» one (● off).
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

// ---------- undo / redo ----------
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
export const undo = () => { const s = stack(); return travel(s.undo, s.redo, 'b', 'Undo'); };
export const redo = () => { const s = stack(); return travel(s.redo, s.undo, 'a', 'Redo'); };
export const historyDepth = () => ({ undo: stack().undo.length, redo: stack().redo.length });

// ---------- compare with the saved one ----------
export function markSaved() { savedBy.set(partKey(), snapshot()); refresh(); }
const saved = () => savedBy.get(partKey());          // no known preset in this part: neither ● nor Compare
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
    if (ui.undo) { ui.undo.disabled = !u; ui.undo.title = u ? 'Undo: ' + u.label + ' (Ctrl+Z)' : 'Nothing to undo'; }
    if (ui.redo) { ui.redo.disabled = !r; ui.redo.title = r ? 'Redo: ' + r.label + ' (Ctrl+Y)' : 'Nothing to redo'; }
    const mod = comparing ? true : isModified();
    if (ui.dot) ui.dot.classList.toggle('on', mod);
    document.dispatchEvent(new CustomEvent('modified-changed', { detail: { modified: mod } }));   // the Save button follows the ●
    if (ui.cmp) {
      ui.cmp.classList.toggle('on', !!comparing);
      ui.cmp.disabled = !mod;
      ui.cmp.title = comparing ? 'Playing the SAVED preset: click to go back to your edit (touching any control goes back too)'
        : mod ? 'Compare: hear the saved preset and come back to your edit' : 'No changes from the saved preset';
    }
  });
}

export function initHistory() {
  ui = { undo: document.getElementById('undoBtn'), redo: document.getElementById('redoBtn'),
         cmp: document.getElementById('cmpBtn'), dot: document.getElementById('modDot') };
  const main = document.getElementById('screens');
  // Gestures: touching something on the screens (not the keyboard or the wheel: those are performance)
  document.addEventListener('pointerdown', e => {
    if (!main.contains(e.target)) return;
    if (open && open.sel && !open.sel.contains(e.target)) end();   // a selector that was opened and not used
    pointerDown = true; begin();
    const sel = e.target.closest('select');
    if (open && sel) open.sel = sel;                 // a selector changes on CHOOSING, after release
  }, true);
  window.addEventListener('pointerup', () => { if (!pointerDown) return; pointerDown = false; if (open && !open.sel) later(); }, true);
  document.addEventListener('change', e => { if (open && open.sel === e.target) later(); }, true);
  document.addEventListener('focusout', e => { if (open && open.sel === e.target) later(); }, true);
  document.addEventListener('keydown', e => {      // arrows on a slider, typing a pattern…
    if (main.contains(e.target) && !(e.ctrlKey || e.metaKey)) { begin(); later(); }
  }, true);
  document.addEventListener('ctl-touch', () => { begin(); later(); });   // a MIDI controller
  document.addEventListener('param-change', () => {
    if (applying) return;
    if (open && !pointerDown && !open.sel) later();
    refresh();
  });
  // Changing part or switching Parts on: first, close what is open and leave compare
  document.getElementById('partsBar')?.addEventListener('pointerdown', () => { end(); exitCompare(); }, true);
  document.addEventListener('scene-loaded', () => { savedBy.clear(); refresh(); });   // the parts bring new sounds
  // Shortcuts: Ctrl+Z · Ctrl+Y / Ctrl+Shift+Z (in a text field, the field's own undo);
  // Ctrl+S = Save (if there is something to save) · Ctrl+Shift+S = Save as (the name field), anywhere
  window.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (e.code === 'KeyS') {
      e.preventDefault();   // never the browser's «save page»
      if (e.shiftKey) { const inp = document.getElementById('presetName'); if (inp) { if (inp.value.trim()) document.getElementById('saveAsBtn')?.click(); else { inp.focus(); inp.select(); } } }
      else { const b = document.getElementById('saveBtn'); if (b && !b.disabled) b.click(); }
      return;
    }
    const t = e.target, txt = t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type === 'text') || t.isContentEditable);
    if (txt) return;
    if (e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) { e.preventDefault(); redo(); }
  });
  ui.undo?.addEventListener('click', undo);
  ui.redo?.addEventListener('click', redo);
  ui.cmp?.addEventListener('click', () => (comparing ? exitCompare() : enterCompare()));
  markSaved();                                       // what sounds at startup is «the saved one»
}
