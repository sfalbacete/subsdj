/* SubSDJ · teclado en pantalla + teclado del PC (polifónico) */
import { engine } from '../engine/AudioEngine.js';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// Layout estilo tracker (FastTracker/Impulse): dos filas de notas, semitonos desde la octava base.
const KEYMAP = {
  // fila inferior = octava base
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
  ',': 12, l: 13, '.': 14,
  // fila superior = una octava por encima (incluye la fila de números)
  q: 12, '2': 13, w: 14, '3': 15, e: 16, r: 17, '5': 18, t: 19, '6': 20, y: 21, '7': 22, u: 23,
  i: 24, '9': 25, o: 26, '0': 27, p: 28,
};

const midiToFreq = m => 440 * Math.pow(2, (m - 69) / 12);

let baseOctave = 4;
let kb, powerInfo;
const active = new Map();   // midi -> element|null
const held = new Set();

function buildKeyboard() {
  kb.innerHTML = '';
  const startMidi = (baseOctave + 1) * 12;
  const semis = [0, 2, 4, 5, 7, 9, 11];
  const blackAfter = { 0: 1, 2: 3, 5: 6, 7: 8, 9: 10 };
  const white = [], black = [];
  let count = 0;
  for (let oct = 0; oct < 2; oct++) {
    for (let i = 0; i < 7; i++) {
      const midi = startMidi + oct * 12 + semis[i];
      white.push({ midi });
      if (blackAfter[semis[i]] !== undefined) black.push({ midi: startMidi + oct * 12 + blackAfter[semis[i]], after: count });
      count++;
    }
  }
  white.push({ midi: startMidi + 24 }); count++;
  const wWidth = 100 / count;

  white.forEach(w => {
    const d = document.createElement('div');
    d.className = 'wkey'; d.dataset.midi = w.midi;
    d.textContent = NOTE_NAMES[w.midi % 12] + (Math.floor(w.midi / 12) - 1);
    kb.appendChild(d); bindKeyEl(d, w.midi);
  });
  black.forEach(b => {
    const d = document.createElement('div');
    d.className = 'bkey'; d.dataset.midi = b.midi;
    d.style.left = `calc(${(b.after + 1) * wWidth}% - 2.6%)`;
    kb.appendChild(d); bindKeyEl(d, b.midi);
  });
}

function press(midi) {
  if (active.has(midi)) return;
  engine.noteOn('m' + midi, midiToFreq(midi));
  const el = kb.querySelector(`[data-midi="${midi}"]`);
  if (el) el.classList.add('on');
  active.set(midi, el || null);
  powerInfo.classList.add('on'); powerInfo.textContent = '⏻ audio activo';
}
function release(midi) {
  if (!active.has(midi)) return;
  engine.noteOff('m' + midi);
  const el = active.get(midi); if (el) el.classList.remove('on');
  active.delete(midi);
}
function bindKeyEl(el, midi) {
  el.addEventListener('pointerdown', e => { engine.resume(); press(midi); el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointerup', () => release(midi));
  el.addEventListener('pointerleave', e => { if (e.buttons) release(midi); });
}
function panic() { held.clear(); engine.allNotesOff(); active.forEach(el => el && el.classList.remove('on')); active.clear(); }

export function initKeyboard() {
  kb = document.getElementById('keyboard');
  powerInfo = document.getElementById('powerInfo');
  buildKeyboard();

  window.addEventListener('keydown', e => {
    // Sólo el campo de TEXTO de presets bloquea el teclado; los sliders (input range) no.
    if (e.target.tagName === 'INPUT' && e.target.type === 'text') return;
    const k = e.key.toLowerCase();
    if (k === 'pageup' || k === 'pagedown') {        // octava arriba / abajo (RePág / AvPág)
      e.preventDefault(); panic();
      baseOctave = k === 'pageup' ? Math.min(7, baseOctave + 1) : Math.max(0, baseOctave - 1);
      buildKeyboard(); return;
    }
    if (!(k in KEYMAP) || held.has(k) || e.repeat) return;
    e.preventDefault();                              // evita atajos del navegador con '/', ',', etc.
    held.add(k); engine.resume();
    press((baseOctave + 1) * 12 + KEYMAP[k]);
  });
  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (!(k in KEYMAP)) return;
    held.delete(k);
    release((baseOctave + 1) * 12 + KEYMAP[k]);
  });
  window.addEventListener('blur', panic);
}
