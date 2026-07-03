/* =====================================================================
   SubSDJ · entrada Web MIDI.
   Notas con velocity -> pressNote/releaseNote (comparte ids y visuales con
   el teclado en pantalla). Pitch bend ±200 ct -> engine.setBend (no pasa
   por presets). Sustain (CC64) retenido aquí. Mod wheel (CC1) mueve el
   knob de vibrato; CC74/CC71 mueven cutoff/resonancia (los controles giran
   en pantalla: misma filosofía que un panel analógico).
   ===================================================================== */
import { engine } from '../engine/AudioEngine.js';
import { PARAMS, posToVal } from '../engine/params.js';
import { CONTROLS } from './registry.js';
import { pressNote, releaseNote } from './keyboard.js';

let pedal = false;
const pedalHeld = new Set();     // notas soltadas con el pedal pisado

function onMsg(e) {
  const [st, d1, d2] = e.data;
  const cmd = st & 0xf0;
  if (cmd === 0x90 && d2 > 0) {                        // note on
    engine.resume();
    if (pedalHeld.has(d1)) { pedalHeld.delete(d1); releaseNote(d1); }   // retrigger de nota sostenida
    pressNote(d1, d2 / 127);
  } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {   // note off
    if (pedal) pedalHeld.add(d1);
    else releaseNote(d1);
  } else if (cmd === 0xb0) {                           // control change
    if (d1 === 64) {                                   // sustain
      pedal = d2 >= 64;
      if (!pedal) { pedalHeld.forEach(n => releaseNote(n)); pedalHeld.clear(); }
    } else if (d1 === 1 && CONTROLS.freqLfoLvl) {      // mod wheel -> vibrato (media escala)
      CONTROLS.freqLfoLvl.set((d2 / 127) * 100);
    } else if (d1 === 74 && CONTROLS.cutoff) {         // brightness -> cutoff (log)
      CONTROLS.cutoff.set(posToVal(PARAMS.cutoff, d2 / 127));
    } else if (d1 === 71 && CONTROLS.reso) {           // resonance
      const p = PARAMS.reso;
      CONTROLS.reso.set(p.min + (d2 / 127) * (p.max - p.min));
    }
  } else if (cmd === 0xe0) {                           // pitch bend ±200 ct (±2 semitonos)
    engine.setBend((((d2 << 7) | d1) - 8192) / 8192 * 200);
  }
}

export function initMIDI() {
  const el = document.getElementById('midiInfo');
  if (!navigator.requestMIDIAccess) return;            // navegador sin Web MIDI
  navigator.requestMIDIAccess().then(acc => {
    const rebind = () => {
      const names = [];
      acc.inputs.forEach(inp => { inp.onmidimessage = onMsg; names.push(inp.name); });
      if (el) el.textContent = names.length ? '🎹 ' + names.join(' · ') : '🎹 sin dispositivo MIDI';
    };
    acc.onstatechange = rebind;                        // conectar/desconectar en caliente
    rebind();
  }).catch(() => {});                                  // permiso denegado: sin MIDI, sin ruido
}
