/* =====================================================================
   SubSDJ · entrada Web MIDI.
   Notas con velocity -> pressNote/releaseNote (comparte ids y visuales con
   el teclado en pantalla). Pitch bend ±200 ct -> part().setBend (no pasa
   por presets). Sustain (CC64) retenido aquí, salvo que el usuario lo
   remapee. El resto de CCs pasa por el mapa de midimap.js (MIDI learn);
   de fábrica: CC1 -> vibrato, CC74/CC71 -> cutoff/resonancia (los
   controles giran en pantalla: misma filosofía que un panel analógico).
   Program change n -> preset n del banco (módulo del tamaño del banco).
   ===================================================================== */
import { part, eachPart } from '../engine/parts.js';
import { pressNote, releaseNote } from './keyboard.js';
import { applyCC, learnCapture, setDevice } from './midimap.js';
import { loadPresetIndex } from './presetBank.js';

let pedal = false;
const pedalHeld = new Set();     // notas soltadas con el pedal pisado

function onMsg(e) {
  const [st, d1, d2] = e.data;
  const cmd = st & 0xf0;
  if (cmd === 0x90 && d2 > 0) {                        // note on
    part().resume();
    if (pedalHeld.has(d1)) { pedalHeld.delete(d1); releaseNote(d1); }   // retrigger de nota sostenida
    pressNote(d1, d2 / 127);
  } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {   // note off
    if (pedal) pedalHeld.add(d1);
    else releaseNote(d1);
  } else if (cmd === 0xb0) {                           // control change
    if (learnCapture(d1)) return;                      // modo learn: liga este CC al control elegido
    if (applyCC(d1, d2 / 127)) return;                 // mapeo del usuario (midimap.js)
    if (d1 === 64) {                                   // sustain (si no está remapeado)
      pedal = d2 >= 64;
      if (!pedal) { pedalHeld.forEach(n => releaseNote(n)); pedalHeld.clear(); }
    }
  } else if (cmd === 0xc0) {                           // program change → preset del banco
    loadPresetIndex(d1);
  } else if (cmd === 0xe0) {                           // pitch bend ±200 ct (±2 semitonos)
    eachPart(e => e.setBend((((d2 << 7) | d1) - 8192) / 8192 * 200));
  }
}

export function initMIDI() {
  const el = document.getElementById('midiInfo');
  if (!navigator.requestMIDIAccess) {                  // navegador sin Web MIDI
    const btn = document.getElementById('midiLearnBtn');
    if (btn) btn.hidden = true;
    return;
  }
  navigator.requestMIDIAccess().then(acc => {
    const rebind = () => {
      const names = [];
      acc.inputs.forEach(inp => { inp.onmidimessage = onMsg; names.push(inp.name); });
      setDevice(names[0] || null);                     // carga el mapa de ESTE aparato
      if (el) el.textContent = names.length ? '🎹 ' + names.join(' · ') : '🎹 sin dispositivo MIDI';
    };
    acc.onstatechange = rebind;                        // conectar/desconectar en caliente
    rebind();
  }).catch(() => {});                                  // permiso denegado: sin MIDI, sin ruido
}
