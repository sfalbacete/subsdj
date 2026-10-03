/* SubSDJ · teclado en pantalla + teclado del PC (polifónico) */
import { part, playOn, playOff, eachPart, forgetSounding } from '../engine/parts.js';
import { setStatus } from './status.js';

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

// Semitono (desde la octava base) -> tecla del PC para pintarla sobre la tecla.
// OJO: Object.entries enumera primero las claves numéricas ('2','3',…), así que
// en los solapes fila baja/alta (12-14) fijamos la fila alta a mano.
const HINTS = {};
for (const [k, off] of Object.entries(KEYMAP)) HINTS[off] = k;
Object.assign(HINTS, { 12: 'q', 13: '2', 14: 'w' });
const hintChip = off => off in HINTS ? `<span class="klab">${HINTS[off].toUpperCase()}</span>` : '';

let baseOctave = 4;
let numOctaves = 2;
let octaveTouched = false;  // el usuario fijó octava con RePág/AvPág → no re-centrar al redimensionar
let kb;
const active = new Map();   // midi -> element|null
const held = new Set();

// Octavas que caben en el ancho disponible: ~38px por tecla blanca, 1..6.
const KEY_PX = 38;
const octavesForWidth = () =>
  Math.max(1, Math.min(6, Math.floor(((kb.clientWidth - 16) / KEY_PX - 1) / 7)));
// Octava base por defecto: rango centrado alrededor de C4-C5 (con tope en C9).
const defaultBase = n => Math.max(0, Math.min(9 - n, 5 - Math.ceil(n / 2)));

function buildKeyboard() {
  kb.innerHTML = '<div id="kbKeys"></div>';
  const row = kb.firstElementChild;
  const startMidi = (baseOctave + 1) * 12;
  const semis = [0, 2, 4, 5, 7, 9, 11];
  const blackAfter = { 0: 1, 2: 3, 5: 6, 7: 8, 9: 10 };
  // Sesgo real de las negras respecto a la juntura de blancas (fracción del
  // ancho de una blanca): C# y F# caen hacia la izquierda, D# y A# a la derecha.
  const blackBias = { 1: -0.13, 3: 0.13, 6: -0.16, 8: 0, 10: 0.16 };
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
  const bWidth = wWidth * 0.58;   // proporción negra/blanca de un piano real

  white.forEach(w => {
    const d = document.createElement('div');
    d.className = 'wkey'; d.dataset.midi = w.midi;
    const name = NOTE_NAMES[w.midi % 12];
    d.innerHTML = hintChip(w.midi - startMidi) +
      (name === 'C' ? `<span class="kname">C${Math.floor(w.midi / 12) - 1}</span>` : '');
    row.appendChild(d); bindKeyEl(d, w.midi);
  });
  black.forEach(b => {
    const d = document.createElement('div');
    d.className = 'bkey'; d.dataset.midi = b.midi;
    const center = (b.after + 1 + blackBias[b.midi % 12]) * wWidth;
    d.style.left = `${(center - bWidth / 2).toFixed(3)}%`;
    d.style.width = `${bWidth.toFixed(3)}%`;
    d.innerHTML = hintChip(b.midi - startMidi);
    row.appendChild(d); bindKeyEl(d, b.midi);
  });

  const num = document.getElementById('kbOctNum');   // rango visible bajo el teclado: C4–C6
  if (num) num.textContent = 'C' + baseOctave + '–C' + (baseOctave + numOctaves);

  // Tras reconstruir (resize), las notas que siguen sonando recuperan su tecla.
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
  if (el) el.classList.add('on');
  active.set(midi, el || null);
  setStatus('powerInfo', 'on', 'audio activo');
}
function release(midi) {
  if (!active.has(midi)) return;
  playOff('m' + midi);
  const el = active.get(midi); if (el) el.classList.remove('on');
  active.delete(midi);
}
function bindKeyEl(el, midi) {
  el.addEventListener('pointerdown', e => { part().resume(); press(midi); el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointerup', () => release(midi));
  el.addEventListener('pointerleave', e => { if (e.buttons) release(midi); });
}
export function panic() {
  held.clear(); eachPart(e => e.allNotesOff()); forgetSounding(); active.forEach(el => el && el.classList.remove('on')); active.clear();
  // y suelta la reverb congelada (❄ Freeze de la Sala): «cortar todo» también es eso
  const s = part().sala;
  if (s && s.frozen) { s.setFreeze(false); document.dispatchEvent(new CustomEvent('freeze-changed')); }
}
// Soltar solo lo que sostiene ESTE teclado (QWERTY / ratón / MIDI): al perder el
// foco de la ventana los keyup se pierden. Antes se llamaba a panic(), que
// cortaba TODAS las voces de todas las partes — con la escena tocando, los pads
// y drones de los jugadores desaparecían hasta el siguiente acorde.
function releaseHeldKeys() { for (const midi of [...active.keys()]) release(midi); held.clear(); }
// Octava arriba/abajo (RePág/AvPág y los botones − / + bajo el teclado): suelta
// lo que sostiene este teclado (sus notas cambiarían de tecla) y reconstruye.
function shiftOctave(d) {
  releaseHeldKeys(); octaveTouched = true;
  baseOctave = Math.max(0, Math.min(9 - numOctaves, baseOctave + d));
  buildKeyboard();
}

// API para la entrada MIDI (ui/midi.js): mismas notas e ids que el teclado,
// así QWERTY y MIDI comparten estado visual y no se doble-disparan.
export function pressNote(midi, vel = 1) { press(midi, vel); }
export function releaseNote(midi) { release(midi); }

export function initKeyboard() {
  kb = document.getElementById('keyboard');
  numOctaves = octavesForWidth();
  baseOctave = defaultBase(numOctaves);
  buildKeyboard();
  document.querySelectorAll('#kbOct button[data-kbo]').forEach(b => b.addEventListener('click', () => shiftOctave(+b.dataset.kbo)));

  // Al cambiar el ancho, recalcular cuántas octavas caben y reconstruir.
  let rszT;
  new ResizeObserver(() => {
    clearTimeout(rszT);
    rszT = setTimeout(() => {
      const n = octavesForWidth();
      if (n === numOctaves) return;
      numOctaves = n;
      baseOctave = octaveTouched ? Math.min(baseOctave, 9 - numOctaves) : defaultBase(numOctaves);
      buildKeyboard();
    }, 120);
  }).observe(kb);

  window.addEventListener('keydown', e => {
    // Sólo el campo de TEXTO de presets bloquea el teclado; los sliders (input range) no.
    if (e.target.tagName === 'INPUT' && e.target.type === 'text') return;
    const k = e.key.toLowerCase();
    // Un combo puede quedarse con el foco sin que se note (se cerró sin elegir,
    // o eligió la misma opción) y entonces "roba" las letras para navegar sus
    // opciones. Si la tecla es del piano y su desplegable está CERRADO, se la
    // quitamos antes de que la vea (captura + stopPropagation) y sigue el piano.
    if (e.target.tagName === 'SELECT' && (k in KEYMAP || k === 'pageup' || k === 'pagedown')) {
      let open = false;
      try { open = e.target.matches(':open'); } catch (_) {}
      if (open) return;                              // desplegable abierto de verdad: respétalo
      e.stopPropagation(); e.target.blur();
    }
    if (k === 'escape') { e.preventDefault(); panic(); return; }   // Escape = pánico (corta todo)
    if (k === 'pageup' || k === 'pagedown') {        // octava arriba / abajo (RePág / AvPág)
      e.preventDefault(); shiftOctave(k === 'pageup' ? 1 : -1); return;
    }
    if (!(k in KEYMAP)) return;
    if (held.has(k) || e.repeat) { e.preventDefault(); return; }  // el auto-repeat tampoco debe llegar al navegador
    e.preventDefault();                              // evita atajos del navegador con '/', ',', etc.
    held.add(k); part().resume();
    press((baseOctave + 1) * 12 + KEYMAP[k]);
  }, true);   // fase de CAPTURA: corre antes de que un combo enfocado procese la tecla
  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (!(k in KEYMAP)) return;
    held.delete(k);
    release((baseOctave + 1) * 12 + KEYMAP[k]);
  });
  window.addEventListener('blur', releaseHeldKeys);
}
