/* =====================================================================
   SubSDJ · MIDI learn — CC → UI control mapping.
   Learn mode (🎛 MIDI map button in the header): click a control on
   screen and turn the hardware knob → the pair (CC → control) is bound;
   right click unbinds. The map is stored only in localStorage PER
   DEVICE (the key is the MIDI device name: each keyboard
   remembers its mapping) and travels as JSON with ⇩/⇧ Map.
   Binding {id, lo, hi}: lo/hi (0..1) bound the part of the range the
   knob sweeps (learn creates 0..1; editable by hand in the JSON — the
   factory mapping uses hi 0.5 on the mod wheel). The MIDI channel is ignored
   on purpose: changing the keyboard's global channel doesn't break the map.
   Discrete controls (segs, LFO shapes, octaves): the knob's travel
   is split into N zones. Optional pickup: if the control was moved some
   other way (preset, mouse), the knob does nothing until it gets close to or crosses
   the on-screen value (avoids jumps when changing preset).
   Besides parameters there are mappable ACTIONS (‹ › of the preset bank):
   they don't go into presets/snapshot and fire on the rising edge (≥64),
   meant for hardware buttons that send 0/127.
   ===================================================================== */
import { PARAM_KEYS } from '../engine/legacy.js';
import { PARAMS, posToVal, valToPos } from '../engine/params.js';
import { CONTROLS } from './registry.js';
import { stepPreset } from './presetBank.js';

const FORMAT = 'subsdj-midimap-v1';
const LS_PREFIX = 'subsdj.midimap.v1:';

// Factory mapping (what used to be hard-wired in midi.js).
const DEFAULT_CCS = {
  1:  { id: 'freqLfoLvl', lo: 0, hi: 0.5 },   // mod wheel → restrained vibrato
  74: { id: 'cutoff' },                       // brightness (GM convention)
  71: { id: 'reso' },                         // harmonic content (GM)
};

// Mappable actions that are NOT parameters (outside presets/snapshot).
// Filled in initMidiMap, once their buttons exist in the DOM.
const ACTIONS = {};

let device = null;                 // device name (storage key)
let map = { pickup: false, ccs: {} };
let pending = null;                // control id waiting for a CC (learn)
let learnOn = false;
let ccState = {};                  // per CC: {last, sent} in 0..1 space
let msgEl = null;

const msg = t => { if (msgEl) msgEl.textContent = t; };

// CC (0..1 position) <-> engine value. posToVal only handles the log case;
// for linear params the CC sweeps min..max explicitly.
export const ccToVal = (p, x) => p.log ? posToVal(p, x) : p.min + x * (p.max - p.min);
export const valToCC = (p, v) => p.log ? valToPos(p, v) : (v - p.min) / (p.max - p.min);
// Discrete controls: the knob's travel is split into N zones.
export const zoneOf = (opts, x) =>
  opts[Math.min(opts.length - 1, Math.max(0, Math.floor(x * opts.length)))];

// ---------- persistence (one localStorage key per device) ----------
const lsKey = () => LS_PREFIX + (device || 'default');
function save() { try { localStorage.setItem(lsKey(), JSON.stringify(map)); } catch (e) {} }

// Controls whose key changed: a saved map keeps moving its successor
// (the Mix A↔B was split into two levels in 1.2.0: the CC now moves B's;
// in 1.4.0 the Spanish keys became English: legacy.PARAM_KEYS).
const RENAMED = { mix: 'levelB', ...PARAM_KEYS };

// Accepts external JSON or JSON from future versions: filters out dead ids and impossible CCs.
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

// midi.js announces the connected device here; ITS map is loaded (or the factory one).
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

// ---------- apply an incoming CC (returns true if it was mapped) ----------
export function applyCC(cc, x) {
  const b = map.ccs[cc];
  if (!b) return false;
  x = b.lo + x * (b.hi - b.lo);
  if (learnOn) msg('CC ' + cc + ' → ' + b.id);
  const act = ACTIONS[b.id];
  if (act) {                                   // action (button): rising edge
    const st = ccState[cc] || (ccState[cc] = {});
    if (x >= 0.5 && !(st.last >= 0.5)) { act.run(); flash(act.el); }
    st.last = x;
    return true;
  }
  const ctl = CONTROLS[b.id], p = PARAMS[b.id];
  if (!ctl) return true;                       // dead id: consume without breaking
  if (ctl.opts) { ctl.set(zoneOf(ctl.opts, x)); flash(ctl.el); return true; }
  if (!p || p.min == null) return true;
  const st = ccState[cc] || (ccState[cc] = {});
  const cur = valToCC(p, ctl.get());
  // pickup: if something else (preset, mouse) moved the control since the last CC,
  // the knob does nothing until it gets close (2%) to or crosses the on-screen value
  const moved = st.sent == null || Math.abs(cur - st.sent) > 0.005;
  const near = Math.abs(x - cur) <= 0.02;
  const crossed = st.last != null && (st.last - cur) * (x - cur) <= 0;
  const hold = map.pickup && moved && !near && !crossed;
  st.last = x;
  if (hold) return true;
  ctl.set(ccToVal(p, Math.min(1, Math.max(0, x))));
  st.sent = valToCC(p, ctl.get());             // read back: the sliders quantize by step
  flash(ctl.el);
  return true;
}

// ---------- learn ----------
export function armLearn(id) {
  pending = id;
  paintPending();
  if (id) msg('move a hardware knob to bind it to «' + id + '»…');
}
export function learnCapture(cc) {
  if (pending == null) return false;
  for (const k in map.ccs) if (map.ccs[k].id === pending) delete map.ccs[k];  // re-learn = move the binding
  map.ccs[cc] = { id: pending, lo: 0, hi: 1 };
  delete ccState[cc];
  msg('bound: CC ' + cc + ' → ' + pending);
  pending = null;
  paintPending(); save(); syncUI();
  return true;
}
function unbind(id) {
  let had = false;
  for (const k in map.ccs) if (map.ccs[k].id === id) { delete map.ccs[k]; had = true; }
  if (had) { save(); syncUI(); }
  msg(had ? '«' + id + '» unbound' : '«' + id + '» was not bound');
}

// ---------- visual feedback ----------
function flash(el) {
  if (!el) return;
  el.classList.add('midi-hit');
  clearTimeout(el._mmT);
  el._mmT = setTimeout(() => el.classList.remove('midi-hit'), 180);
  document.dispatchEvent(new CustomEvent('ctl-touch', { detail: { el } }));   // the Output display shows the knob you are turning
}
const targetOf = id => CONTROLS[id] || ACTIONS[id];   // both carry .el

function paintPending() {
  document.querySelectorAll('.midi-wait').forEach(e => e.classList.remove('midi-wait'));
  const t = pending && targetOf(pending);
  if (t && t.el) t.el.classList.add('midi-wait');
}
function syncUI() {   // CCnn badges on the bound controls + pickup checkbox
  document.querySelectorAll('[data-cc]').forEach(e => e.removeAttribute('data-cc'));
  for (const cc in map.ccs) {
    const t = targetOf(map.ccs[cc].id);
    if (t && t.el) t.el.setAttribute('data-cc', cc);
  }
  const pk = document.getElementById('mmPickup');
  if (pk) pk.checked = !!map.pickup;
}

// ---------- learn mode (captures clicks on the controls) ----------
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
    msg(device ? 'device: ' + device : 'no MIDI device — connect one to bind knobs');
  }
}
function intercept(e) {   // in learn mode the controls aren't operated: they are picked
  if (!learnOn) return;
  const id = controlAt(e.target);
  if (id == null) return;
  e.preventDefault(); e.stopPropagation();
  if (e.type === 'pointerdown') armLearn(id);
}
function onCtx(e) {       // right click in learn mode = unbind
  if (!learnOn) return;
  const id = controlAt(e.target);
  if (id == null) return;
  e.preventDefault(); e.stopPropagation();
  unbind(id);
}

export function initMidiMap() {
  msgEl = document.getElementById('mmMsg');

  // actions: browse the preset bank from hardware buttons
  const act = (id, elId, run) => {
    const el = document.getElementById(elId);
    if (el) ACTIONS[id] = { el, run };
  };
  act('presetPrev', 'prevBtn', () => stepPreset(-1));
  act('presetNext', 'nextBtn', () => stepPreset(1));

  setDevice(null);        // 'default' map until midi.js announces the device

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
    save(); syncUI(); msg('factory mapping (CC1 · CC74 · CC71)');
  });

  // mapping export/import (same pattern as the preset bank)
  const exp = document.getElementById('mmExp');
  if (exp) exp.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ format: FORMAT, device, ...map }, null, 2)],
      { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'subsdj-midimap.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    msg('mapping exported (' + Object.keys(map.ccs).length + ' CCs)');
  });
  const impFile = document.getElementById('mmFile');
  const imp = document.getElementById('mmImp');
  if (imp) imp.addEventListener('click', () => impFile.click());
  if (impFile) impFile.addEventListener('change', () => {
    const f = impFile.files[0]; if (!f) return;
    f.text().then(txt => {
      let data; try { data = JSON.parse(txt); } catch (e) { msg('that file is not valid JSON'); return; }
      map = sanitize(data); ccState = {};
      save(); syncUI();
      msg('mapping imported (' + Object.keys(map.ccs).length + ' valid CCs)');
      impFile.value = '';
    });
  });
}
