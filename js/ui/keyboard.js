/* SubSDJ · teclado en pantalla + teclado del PC (polifónico) */
import { part, playOn, playOff, eachPart, forgetSounding, setPerf } from '../engine/parts.js';
import { setStatus } from './status.js';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// Layout estilo tracker (FastTracker/Impulse): dos filas de notas, semitonos desde la octava base.
// Por POSICIÓN física (e.code), no por letra: Shift no cambia la tecla (con e.key, Shift+2 = «"»
// y la nota se quedaba colgada al soltar) y en AZERTY o Dvorak el piano queda en el mismo sitio.
const KEYMAP = {
  // fila inferior = octava base
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11,
  Comma: 12, KeyL: 13, Period: 14,
  // fila superior = una octava por encima (incluye la fila de números)
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18, KeyT: 19, Digit6: 20, KeyY: 21, Digit7: 22, KeyU: 23,
  KeyI: 24, Digit9: 25, KeyO: 26, Digit0: 27, KeyP: 28,
};
// Rótulo de una tecla física: el de un teclado US; con la Keyboard API (Chrome), el que lleva
// impreso TU teclado en esa posición (AZERTY: KeyQ = A). Se carga en initKeyboard.
const usLabel = c => c.startsWith('Key') ? c.slice(3) : c.startsWith('Digit') ? c.slice(5) : ({ Comma: ',', Period: '.' })[c] || c;
let keyLabel = usLabel;

const midiToFreq = m => 440 * Math.pow(2, (m - 69) / 12);

// Velocity con el ratón: la ALTURA a la que pulsas la tecla, como en un piano (se
// pega fuerte en el borde delantero). Arriba, junto al fieltro, VEL_MIN; crece en
// línea recta hasta VEL_FULL del largo de la tecla, y de ahí al borde va a tope.
// El QWERTY no sabe de fuerza: sigue a 1. El MIDI trae la suya.
const VEL_MIN = 0.2;    // arriba del todo: −14 dB en el VCA (y menos filtro / FM donde la velocity los mueve). Más bajo casi no se oye
const VEL_FULL = 0.85;  // el 15 % del borde da 1: un clic abajo suena como antes de haber velocity
export const velFromY = f => VEL_MIN + (1 - VEL_MIN) * Math.min(1, Math.max(0, f) / VEL_FULL);

// Semitono (desde la octava base) -> tecla del PC para pintarla sobre la tecla. En los
// solapes fila baja/alta (12-14) gana la fila alta: va después en KEYMAP y la pisa.
const HINTS = {};
for (const [code, off] of Object.entries(KEYMAP)) HINTS[off] = code;
const hintChip = off => off in HINTS ? `<span class="klab">${keyLabel(HINTS[off]).toUpperCase()}</span>` : '';

let baseOctave = 4;
let numOctaves = 2;
let octaveTouched = false;  // el usuario fijó octava con RePág/AvPág → no re-centrar al redimensionar
let kb;
const active = new Map();   // midi -> element|null: lo que SUENA
// Quién sostiene cada nota: 'k:KeyZ' (tecla del PC), 'p:<pointerId>' (ratón o un dedo), 'midi'.
// La nota se suelta cuando la suelta el ÚLTIMO: el ratón no corta la que mantiene el QWERTY,
// ni un dedo la de otro dedo sobre la misma tecla.
const holders = new Map();  // midi -> Set de fuentes
const held = new Map();     // e.code -> midi (la nota que dio esa tecla al pulsarla)
const pointers = new Map(); // pointerId -> midi

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
    const center = (b.after + 1) * wWidth;    // centrada en la juntura de sus dos blancas (sin el sesgo de un piano acústico: decisión de Sergio)
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
  if (el) { el.classList.add('on'); el.style.setProperty('--vel', vel.toFixed(2)); }   // el brillo de la tecla sigue a la fuerza
  active.set(midi, el || null);
  setStatus('powerInfo', 'on', 'audio activo');
}
function release(midi) {
  if (!active.has(midi)) return;
  playOff('m' + midi);
  const el = active.get(midi); if (el) el.classList.remove('on');
  active.delete(midi);
}
// Sostener / soltar por FUENTE: suena con el primero que la pulsa, se calla con el último que la suelta.
function hold(midi, src, vel = 1) {
  const h = holders.get(midi);
  if (h) { h.add(src); return; }                     // ya suena: una fuente más la sostiene
  holders.set(midi, new Set([src]));
  press(midi, vel);
}
function unhold(midi, src) {
  const h = holders.get(midi);
  if (!h || !h.delete(src) || h.size) return;
  holders.delete(midi);
  release(midi);
}
function bindKeyEl(el, midi) {
  el.addEventListener('pointerdown', e => {
    part().resume();
    const r = el.getBoundingClientRect(), vel = velFromY((e.clientY - r.top) / r.height);
    pointers.set(e.pointerId, midi);
    hold(midi, 'p:' + e.pointerId, vel);
    // a la pantalla Salida: solo lo tocado con el ratón (el MIDI y el QWERTY no le pisan el knob que giras)
    document.dispatchEvent(new CustomEvent('kb-note', { detail: { name: NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1), vel } }));
    try { el.setPointerCapture(e.pointerId); } catch (_) {}   // un puntero sintético (el selftest) no se puede capturar
  });
  // Soltar: al levantar, si el sistema CANCELA el toque (un gesto, una llamada…) o si se pierde la
  // captura (la ventana pierde el foco con el botón pulsado). Sin los dos últimos, la nota colgaba.
  const lift = e => { if (pointers.get(e.pointerId) !== midi) return; pointers.delete(e.pointerId); unhold(midi, 'p:' + e.pointerId); };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, lift);
  el.addEventListener('pointerleave', e => { if (e.buttons) lift(e); });
}
export function panic() {
  held.clear(); holders.clear(); pointers.clear();
  eachPart(e => e.allNotesOff()); forgetSounding(); active.forEach(el => el && el.classList.remove('on')); active.clear();
  // y suelta la reverb congelada (❄ Freeze de la Sala): «cortar todo» también es eso
  const s = part().sala;
  if (s && s.frozen) { s.setFreeze(false); document.dispatchEvent(new CustomEvent('freeze-changed')); }
}
// Soltar solo lo que sostiene ESTE teclado (QWERTY / ratón / MIDI): al perder el
// foco de la ventana los keyup se pierden. Antes se llamaba a panic(), que
// cortaba TODAS las voces de todas las partes — con la escena tocando, los pads
// y drones de los jugadores desaparecían hasta el siguiente acorde.
function releaseHeldKeys() { for (const midi of [...active.keys()]) release(midi); held.clear(); holders.clear(); pointers.clear(); }
// Octava arriba/abajo (RePág/AvPág y los botones − / + bajo el teclado): suelta
// lo que sostiene este teclado (sus notas cambiarían de tecla) y reconstruye.
function shiftOctave(d) {
  releaseHeldKeys(); octaveTouched = true;
  baseOctave = Math.max(0, Math.min(9 - numOctaves, baseOctave + d));
  buildKeyboard();
}

// API para la entrada MIDI (ui/midi.js): mismas notas e ids que el teclado,
// así QWERTY y MIDI comparten estado visual y no se doble-disparan.
export function pressNote(midi, vel = 1) { hold(midi, 'midi', vel); }
export function releaseNote(midi) { unhold(midi, 'midi'); }

export function initKeyboard() {
  kb = document.getElementById('keyboard');
  numOctaves = octavesForWidth();
  baseOctave = defaultBase(numOctaves);
  buildKeyboard();
  document.querySelectorAll('#kbOct button[data-kbo]').forEach(b => b.addEventListener('click', () => shiftOctave(+b.dataset.kbo)));

  // Rueda de modulación en pantalla: fuente «Rueda (CC1)» de la matriz
  // (parts.setPerf → todas las partes). Sigue también a la rueda MIDI vía
  // 'perf-change' (ui/midi.js). Doble clic = reposo. No es un control del preset.
  const wheel = document.getElementById('kbWheel');
  if (wheel) {
    wheel.addEventListener('input', () => { part().resume(); setPerf('wheel', +wheel.value); });
    wheel.addEventListener('dblclick', () => { wheel.value = 0; setPerf('wheel', 0); });
    document.addEventListener('perf-change', e => { if (e.detail.id === 'wheel') wheel.value = e.detail.value; });
  }

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
    // Con Ctrl, Alt o Meta es un ATAJO (Ctrl+Z, Ctrl+C…), no una nota: antes Ctrl+Z tocaba un Do.
    // (AltGr cuenta como Ctrl+Alt en Windows: tampoco toca.) Shift sí deja tocar: con e.code no cambia la tecla.
    const note = e.code in KEYMAP && !(e.ctrlKey || e.altKey || e.metaKey);
    // Un combo puede quedarse con el foco sin que se note (se cerró sin elegir,
    // o eligió la misma opción) y entonces "roba" las letras para navegar sus
    // opciones. Si la tecla es del piano y su desplegable está CERRADO, se la
    // quitamos antes de que la vea (captura + stopPropagation) y sigue el piano.
    if (e.target.tagName === 'SELECT' && (note || k === 'pageup' || k === 'pagedown')) {
      let open = false;
      try { open = e.target.matches(':open'); } catch (_) {}
      if (open) return;                              // desplegable abierto de verdad: respétalo
      e.stopPropagation(); e.target.blur();
    }
    if (k === 'escape') { e.preventDefault(); panic(); return; }   // Escape = pánico (corta todo)
    if (k === 'pageup' || k === 'pagedown') {        // octava arriba / abajo (RePág / AvPág)
      e.preventDefault(); shiftOctave(k === 'pageup' ? 1 : -1); return;
    }
    if (!note) return;
    if (held.has(e.code) || e.repeat) { e.preventDefault(); return; }  // el auto-repeat tampoco debe llegar al navegador
    e.preventDefault();                              // evita atajos del navegador con '/', ',', etc.
    const midi = (baseOctave + 1) * 12 + KEYMAP[e.code];
    held.set(e.code, midi); part().resume();
    hold(midi, 'k:' + e.code);
  }, true);   // fase de CAPTURA: corre antes de que un combo enfocado procese la tecla
  window.addEventListener('keyup', e => {
    // suelta la nota que DIO esa tecla (aunque entre medias haya cambiado un modificador)
    const midi = held.get(e.code);
    if (midi === undefined) return;
    held.delete(e.code);
    unhold(midi, 'k:' + e.code);
  });
  window.addEventListener('blur', releaseHeldKeys);

  // Rótulos de las teclas: los que lleva impresos el teclado de verdad (Keyboard API, Chrome).
  // Sin ella (u otro navegador), los de un teclado US.
  try {
    navigator.keyboard?.getLayoutMap?.().then(m => { keyLabel = c => m.get(c) || usLabel(c); buildKeyboard(); }).catch(() => {});
  } catch (_) {}
}
