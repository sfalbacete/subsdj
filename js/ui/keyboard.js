/* SubSDJ · on-screen keyboard + PC keyboard (polyphonic) */
import { part, playOn, playOff, eachPart, forgetSounding, setPerf } from '../engine/parts.js';
import { setStatus } from './status.js';
import { bindSelect } from './registry.js';
import { BEND_RANGES } from '../engine/params.js';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// Tracker-style layout (FastTracker/Impulse): two rows of notes, semitones from the base octave.
// By physical POSITION (e.code), not by letter: Shift doesn't change the key (with e.key, Shift+2 = «"»
// and the note got stuck on release) and on AZERTY or Dvorak the piano stays in the same place.
const KEYMAP = {
  // bottom row = base octave
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11,
  Comma: 12, KeyL: 13, Period: 14,
  // top row = one octave above (includes the number row)
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18, KeyT: 19, Digit6: 20, KeyY: 21, Digit7: 22, KeyU: 23,
  KeyI: 24, Digit9: 25, KeyO: 26, Digit0: 27, KeyP: 28,
};
// Label of a physical key: a US keyboard's; with the Keyboard API (Chrome), the one printed
// on YOUR keyboard at that position (AZERTY: KeyQ = A). Loaded in initKeyboard.
const usLabel = c => c.startsWith('Key') ? c.slice(3) : c.startsWith('Digit') ? c.slice(5) : ({ Comma: ',', Period: '.' })[c] || c;
let keyLabel = usLabel;

const midiToFreq = m => 440 * Math.pow(2, (m - 69) / 12);

// Velocity with the mouse: the HEIGHT at which you press the key, as on a piano (you
// strike hard at the front edge). At the top, by the felt, VEL_MIN; it grows in a
// straight line up to VEL_FULL of the key's length, and from there to the edge it is full.
// The QWERTY knows nothing of force: it stays at 1. MIDI brings its own.
const VEL_MIN = 0.2;    // at the very top: −14 dB on the VCA (and less filter / FM where velocity moves them). Lower is barely audible
const VEL_FULL = 0.85;  // the 15 % at the edge gives 1: a click at the bottom sounds as before velocity existed
export const velFromY = f => VEL_MIN + (1 - VEL_MIN) * touchCurve(Math.min(1, Math.max(0, f) / VEL_FULL));

// Touch response (Roadmap 7.0 · 2.6): the velocity curve of whoever PLAYS, not of the
// preset (remembered in this browser). soft = little force already sounds loud
// (v^0.5: 64 → 90), hard = you have to press (v^2: 64 → 32). Applies to MIDI and to
// the mouse (on the press height, keeping its VEL_MIN floor); the
// QWERTY knows nothing of force and stays at 1.
const TOUCH = { soft: 0.5, linear: 1, hard: 2 };
const TOUCH_KEY = 'subsdj.touch.v2', TOUCH_KEY_V1 = 'subsdj.tacto.v1';   // the old key is still read
let touch = 'linear';
const TOUCH_ES = { suave: 'soft', lineal: 'linear', dura: 'hard' };   // stored up to 1.3.0
try { let t = localStorage.getItem(TOUCH_KEY) || localStorage.getItem(TOUCH_KEY_V1); t = TOUCH_ES[t] || t; if (t in TOUCH) touch = t; } catch (_) {}
export function touchCurve(v) { return Math.pow(Math.max(0, Math.min(1, v)), TOUCH[touch]); }
export function getTouch() { return touch; }
export function setTouch(t) {
  if (!(t in TOUCH)) return;
  touch = t;
  try { localStorage.setItem(TOUCH_KEY, t); } catch (_) {}
  document.querySelectorAll('#kbTouch button').forEach(b => b.classList.toggle('active', b.dataset.touch === t));
}

// Semitone (from the base octave) -> PC key, to paint it on the key. Where the bottom/top
// rows overlap (12-14) the top row wins: it comes later in KEYMAP and overwrites it.
const HINTS = {};
for (const [code, off] of Object.entries(KEYMAP)) HINTS[off] = code;
const hintChip = off => off in HINTS ? `<span class="klab">${keyLabel(HINTS[off]).toUpperCase()}</span>` : '';

// Two distinct octaves: the VIEW's (the first key on screen, up to 6 octaves
// topping out at C9) and the QWERTY's (that of the Z), which is the one PgUp/PgDn and − / + move.
// They used to be the same, and the QWERTY, which only spans 2 octaves and a third, stopped
// where the view stopped: with 6 octaves on screen (C3–C9 at the very top), at E5.
let viewOctave = 4;
let numOctaves = 2;
let qOctave = 3;            // Z = C3, Q = C4 (middle C)
const Q_MAX = 7;            // Z = C7: the P reaches E9 (MIDI 124; MIDI tops out at 127)
const Q_TOP = 28;           // the P: two octaves and a third above the Z
const qStart = () => (qOctave + 1) * 12;
let kb;
const active = new Map();   // midi -> element|null: what is SOUNDING
// Who holds each note: 'k:KeyZ' (PC key), 'p:<pointerId>' (mouse or a finger), 'midi'.
// The note is released when the LAST one releases it: the mouse doesn't cut the one the QWERTY holds,
// nor does one finger cut another finger's on the same key.
const holders = new Map();  // midi -> Set of sources
const held = new Map();     // e.code -> midi (the note that key produced when pressed)
const pointers = new Map(); // pointerId -> midi it plays (null: button down outside the keys)

// Octaves that fit in the available width: ~38px per white key, 1..6.
const KEY_PX = 38;
const octavesForWidth = () =>
  Math.max(1, Math.min(6, Math.floor(((kb.clientWidth - 16) / KEY_PX - 1) / 7)));
// Default view octave: range centered around C4-C5 (topping out at C9).
const defaultBase = n => Math.max(0, Math.min(9 - n, 5 - Math.ceil(n / 2)));
// The view follows the QWERTY: it moves just enough for Z to P to fit
// (and, if the view is shorter than that, it starts at the Z).
function fitView() {
  let v = Math.max(Math.min(viewOctave, qOctave), qOctave + Math.ceil(Q_TOP / 12) - numOctaves);
  if (v > qOctave) v = qOctave;
  viewOctave = Math.max(0, Math.min(9 - numOctaves, v));
}

function buildKeyboard() {
  kb.innerHTML = '<div id="kbKeys"></div>';
  const row = kb.firstElementChild;
  const startMidi = (viewOctave + 1) * 12;
  const semis = [0, 2, 4, 5, 7, 9, 11];
  const blackAfter = { 0: 1, 2: 3, 5: 6, 7: 8, 9: 10 };
  const white = [], black = [];
  let count = 0;
  for (let oct = 0; oct < numOctaves; oct++) {
    for (let i = 0; i < 7; i++) {
      const midi = startMidi + oct * 12 + semis[i];
      white.push({ midi });
      if (blackAfter[semis[i]] !== undefined) black.push({ midi: startMidi + oct * 12 + blackAfter[semis[i]], after: count });
      count++;
    }
  }
  white.push({ midi: startMidi + numOctaves * 12 }); count++;
  const wWidth = 100 / count;
  const bWidth = wWidth * 0.58;   // black/white ratio of a real piano

  white.forEach(w => {
    const d = document.createElement('div');
    d.className = 'wkey'; d.dataset.midi = w.midi;
    const name = NOTE_NAMES[w.midi % 12];
    d.innerHTML = hintChip(w.midi - qStart()) +
      (name === 'C' ? `<span class="kname">C${Math.floor(w.midi / 12) - 1}</span>` : '');
    row.appendChild(d);
  });
  black.forEach(b => {
    const d = document.createElement('div');
    d.className = 'bkey'; d.dataset.midi = b.midi;
    const center = (b.after + 1) * wWidth;    // centered on the joint of its two white keys (without an acoustic piano's offset: Sergio's decision)
    d.style.left = `${(center - bWidth / 2).toFixed(3)}%`;
    d.style.width = `${bWidth.toFixed(3)}%`;
    d.innerHTML = hintChip(b.midi - qStart());
    row.appendChild(d);
  });

  const num = document.getElementById('kbOctNum');   // what the QWERTY reaches, from Z to P: C3–E5
  if (num) num.textContent = 'C' + qOctave + '–E' + (qOctave + 2);

  // After rebuilding (resize), the notes still sounding get their key back.
  active.forEach((el, midi) => {
    const d = row.querySelector(`[data-midi="${midi}"]`);
    if (d) d.classList.add('on');
    active.set(midi, d);
  });
}

function press(midi, vel = 1) {
  if (active.has(midi)) return;
  playOn('m' + midi, midiToFreq(midi), vel);
  const el = kb.querySelector(`[data-midi="${midi}"]`);
  if (el) { el.classList.add('on'); el.style.setProperty('--vel', vel.toFixed(2)); }   // the key's glow follows the force
  active.set(midi, el || null);
  setStatus('powerInfo', 'on', 'audio on');
}
function release(midi) {
  if (!active.has(midi)) return;
  playOff('m' + midi);
  const el = active.get(midi); if (el) el.classList.remove('on');
  active.delete(midi);
}
// Hold / release per SOURCE: it sounds with the first that presses it, goes silent with the last that releases it.
function hold(midi, src, vel = 1) {
  const h = holders.get(midi);
  if (h) { h.add(src); return; }                     // already sounding: one more source holds it
  holders.set(midi, new Set([src]));
  press(midi, vel);
}
function unhold(midi, src) {
  const h = holders.get(midi);
  if (!h || !h.delete(src) || h.size) return;
  holders.delete(midi);
  release(midi);
}
// Mouse (or finger) on the on-screen keyboard, delegated to the container (the keys
// are rebuilt on octave change). Pressing plays the key; dragging with the button
// down plays the ones it passes over (glissando): each new key releases the previous one and
// sounds with the velocity of the height at which it enters. Outside the keys, silence
// until it enters again. Capture goes to the container: moves keep
// reaching it even if the pointer leaves, and so does the release.
const keyAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('#keyboard [data-midi]') || null;
function strike(e, el) {
  const midi = +el.dataset.midi, r = el.getBoundingClientRect(), vel = velFromY((e.clientY - r.top) / r.height);
  pointers.set(e.pointerId, midi);
  hold(midi, 'p:' + e.pointerId, vel);
  // to the Output display: only what is played with the mouse (MIDI and QWERTY don't overwrite the knob you are turning)
  document.dispatchEvent(new CustomEvent('kb-note', { detail: { name: NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1), vel } }));
}
function lift(id) {
  const midi = pointers.get(id);
  if (midi != null) unhold(midi, 'p:' + id);
  pointers.set(id, null);
}
function bindPointer() {
  kb.addEventListener('pointerdown', e => {
    const el = e.target.closest?.('[data-midi]'); if (!el) return;
    part().resume();
    lift(e.pointerId); strike(e, el);
    try { kb.setPointerCapture(e.pointerId); } catch (_) {}   // a synthetic pointer (the selftest) can't be captured
  });
  kb.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId) || !e.buttons) return;
    const el = keyAt(e.clientX, e.clientY), midi = el ? +el.dataset.midi : null;
    if (midi === pointers.get(e.pointerId)) return;
    lift(e.pointerId);
    if (el) strike(e, el);
  });
  // Release: on lifting, if the system CANCELS the touch (a gesture, a call…) or if capture is
  // lost (the window loses focus with the button down). Without the last two, the note got stuck.
  const end = e => { if (!pointers.has(e.pointerId)) return; lift(e.pointerId); pointers.delete(e.pointerId); };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) kb.addEventListener(ev, end);
}
export function panic() {
  held.clear(); holders.clear(); pointers.clear();
  eachPart(e => e.allNotesOff()); forgetSounding(); active.forEach(el => el && el.classList.remove('on')); active.clear();
  // and releases the frozen reverb (❄ Freeze of the Room): «cut everything» means that too
  const s = part().room;
  if (s && s.frozen) { s.setFreeze(false); document.dispatchEvent(new CustomEvent('freeze-changed')); }
}
// Release only what THIS keyboard holds (QWERTY / mouse / MIDI): when the window
// loses focus the keyups are lost. It used to call panic(), which
// cut ALL voices of all parts — with the scene playing, the players' pads
// and drones vanished until the next chord.
function releaseHeldKeys() { for (const midi of [...active.keys()]) release(midi); held.clear(); holders.clear(); pointers.clear(); }
// QWERTY octave up/down (PgUp/PgDn and the − / + buttons under the keyboard):
// releases what this keyboard holds (its notes would change key), drags the
// view along if needed and rebuilds.
function shiftOctave(d) {
  releaseHeldKeys();
  qOctave = Math.max(0, Math.min(Q_MAX, qOctave + d));
  fitView(); buildKeyboard();
}

// API for MIDI input (ui/midi.js): same notes and ids as the keyboard,
// so QWERTY and MIDI share visual state and don't double-trigger.
export function pressNote(midi, vel = 1) { hold(midi, 'midi', vel); }
export function releaseNote(midi) { unhold(midi, 'midi'); }

export function initKeyboard() {
  kb = document.getElementById('keyboard');
  numOctaves = octavesForWidth();
  viewOctave = defaultBase(numOctaves); fitView();
  buildKeyboard(); bindPointer();
  document.querySelectorAll('#kbOct button[data-kbo]').forEach(b => b.addEventListener('click', () => shiftOctave(+b.dataset.kbo)));

  // On-screen mod wheel: the matrix's «Wheel (CC1)» source
  // (parts.setPerf → all parts). It also follows the MIDI wheel via
  // 'perf-change' (ui/midi.js). Double click = rest. Not a preset control.
  const wheel = document.getElementById('kbWheel');
  if (wheel) {
    wheel.addEventListener('input', () => { part().resume(); setPerf('wheel', +wheel.value); });
    wheel.addEventListener('dblclick', () => { wheel.value = 0; setPerf('wheel', 0); });
    document.addEventListener('perf-change', e => { if (e.detail.id === 'wheel') wheel.value = e.detail.value; });
  }
  // Bend range (the preset's) and touch (yours), next to the wheel
  const bend = document.getElementById('bendRangeSel');
  if (bend) bindSelect(bend, 'bendRange', BEND_RANGES.map(n => ({ id: n, label: '±' + n })));
  document.querySelectorAll('#kbTouch button').forEach(b => b.addEventListener('click', () => setTouch(b.dataset.touch)));
  setTouch(touch);

  // When the width changes, recompute how many octaves fit and rebuild.
  let rszT;
  new ResizeObserver(() => {
    clearTimeout(rszT);
    rszT = setTimeout(() => {
      const n = octavesForWidth();
      if (n === numOctaves) return;
      numOctaves = n;
      viewOctave = defaultBase(numOctaves); fitView();
      buildKeyboard();
    }, 120);
  }).observe(kb);

  window.addEventListener('keydown', e => {
    // Only the preset TEXT field blocks the keyboard; sliders (input range) don't.
    if (e.target.tagName === 'INPUT' && e.target.type === 'text') return;
    const k = e.key.toLowerCase();
    // With Ctrl, Alt or Meta it is a SHORTCUT (Ctrl+Z, Ctrl+C…), not a note: Ctrl+Z used to play a C.
    // (AltGr counts as Ctrl+Alt on Windows: it doesn't play either.) Shift does let you play: with e.code the key doesn't change.
    const note = e.code in KEYMAP && !(e.ctrlKey || e.altKey || e.metaKey);
    // A combo box can keep focus unnoticed (it closed without a choice,
    // or the same option was chosen) and then it "steals" the letters to browse its
    // options. If the key belongs to the piano and its dropdown is CLOSED, we take it
    // away before it sees it (capture + stopPropagation) and the piano carries on.
    if (e.target.tagName === 'SELECT' && (note || k === 'pageup' || k === 'pagedown')) {
      let open = false;
      try { open = e.target.matches(':open'); } catch (_) {}
      if (open) return;                              // dropdown really open: respect it
      e.stopPropagation(); e.target.blur();
    }
    if (k === 'escape') {                            // Escape = panic (cuts everything)… unless it first closes something
      e.preventDefault();                            // open (the preset picker): that one cancels escape-first
      if (document.dispatchEvent(new CustomEvent('escape-first', { cancelable: true }))) panic();
      return;
    }
    if (k === 'pageup' || k === 'pagedown') {        // octave up / down (PgUp / PgDn)
      e.preventDefault(); shiftOctave(k === 'pageup' ? 1 : -1); return;
    }
    if (!note) return;
    if (held.has(e.code) || e.repeat) { e.preventDefault(); return; }  // auto-repeat must not reach the browser either
    e.preventDefault();                              // avoids browser shortcuts with '/', ',', etc.
    const midi = qStart() + KEYMAP[e.code];
    held.set(e.code, midi); part().resume();
    hold(midi, 'k:' + e.code);
  }, true);   // CAPTURE phase: runs before a focused combo box processes the key
  window.addEventListener('keyup', e => {
    // releases the note that key PRODUCED (even if a modifier changed in between)
    const midi = held.get(e.code);
    if (midi === undefined) return;
    held.delete(e.code);
    unhold(midi, 'k:' + e.code);
  });
  window.addEventListener('blur', releaseHeldKeys);

  // Key labels: the ones printed on the real keyboard (Keyboard API, Chrome).
  // Without it (or in another browser), a US keyboard's.
  try {
    navigator.keyboard?.getLayoutMap?.().then(m => { keyLabel = c => m.get(c) || usLabel(c); buildKeyboard(); }).catch(() => {});
  } catch (_) {}
}
