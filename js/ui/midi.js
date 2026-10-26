/* =====================================================================
   SubSDJ · entrada Web MIDI.
   Notas con velocity -> pressNote/releaseNote (comparte ids y visuales con
   el teclado en pantalla), pasada por la curva de tacto (keyboard.js).
   Pitch bend normalizado (−1..1) -> setBend de cada parte, que lo escala por
   el rango de su preset (bendRange). Sustain (CC64) retenido aquí, salvo que el usuario lo
   remapee. El resto de CCs pasa por el mapa de midimap.js (MIDI learn);
   de fábrica: CC1 -> vibrato, CC74/CC71 -> cutoff/resonancia (los
   controles giran en pantalla: misma filosofía que un panel analógico).
   Program change n -> preset n del banco (módulo del tamaño del banco).
   Fuentes de EJECUCIÓN de la matriz (Roadmap 5.0 · bloque 4): la rueda (CC1)
   y la expresión (CC11) alimentan SIEMPRE su fuente ('wheel', 'expr'), además
   de lo que tengan mapeado (de fábrica, CC1 → vibrato: quitar ese mapeo deja
   la rueda solo para la matriz); el aftertouch de canal (y el polifónico, que
   se trata igual: la fuente es por motor) alimenta 'at'.
   ===================================================================== */
import { part, eachPart, setPerf } from '../engine/parts.js';
import { pressNote, releaseNote, touchCurve } from './keyboard.js';
import { applyCC, learnCapture, setDevice } from './midimap.js';
import { loadPresetIndex } from './presetBank.js';
import { setStatus } from './status.js';

let pedal = false;
const pedalHeld = new Set();     // notas soltadas con el pedal pisado

// Fuente de ejecución → motores (todas las partes) + aviso a la UI (la rueda en pantalla sigue al CC1)
function perf(id, v) { setPerf(id, v); document.dispatchEvent(new CustomEvent('perf-change', { detail: { id, value: v } })); }

// Un mensaje MIDI (sus bytes). Exportado: la sonda del selftest lo llama con mensajes sintéticos.
export function handleMidi(data) {
  const [st, d1, d2] = data;
  const cmd = st & 0xf0;
  if (cmd === 0x90 && d2 > 0) {                        // note on
    part().resume();
    if (pedalHeld.has(d1)) { pedalHeld.delete(d1); releaseNote(d1); }   // retrigger de nota sostenida
    pressNote(d1, touchCurve(d2 / 127));
  } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {   // note off
    if (pedal) pedalHeld.add(d1);
    else releaseNote(d1);
  } else if (cmd === 0xb0) {                           // control change
    if (learnCapture(d1)) return;                      // modo learn: liga este CC al control elegido
    if (d1 === 1) perf('wheel', d2 / 127);             // rueda y expresión: fuentes de la matriz, SIEMPRE (además del mapeo)
    else if (d1 === 11) perf('expr', d2 / 127);
    if (applyCC(d1, d2 / 127)) return;                 // mapeo del usuario (midimap.js)
    if (d1 === 64) {                                   // sustain (si no está remapeado)
      pedal = d2 >= 64;
      if (!pedal) { pedalHeld.forEach(n => releaseNote(n)); pedalHeld.clear(); }
    }
  } else if (cmd === 0xd0) {                           // aftertouch de canal → fuente 'at'
    perf('at', d1 / 127);
  } else if (cmd === 0xa0) {                           // aftertouch polifónico: como el de canal (la fuente es por motor, no por nota)
    perf('at', d2 / 127);
  } else if (cmd === 0xc0) {                           // program change → preset del banco
    loadPresetIndex(d1);
  } else if (cmd === 0xe0) {                           // pitch bend: −1..1 (el rango lo pone el preset)
    eachPart(e => e.setBend((((d2 << 7) | d1) - 8192) / 8192));
  }
}
function onMsg(e) { handleMidi(e.data); }

export function initMIDI() {
  if (!navigator.requestMIDIAccess) {                  // navegador sin Web MIDI
    const btn = document.getElementById('midiLearnBtn');
    if (btn) btn.hidden = true;
    setStatus('midiInfo', '', 'this browser has no Web MIDI');
    return;
  }
  navigator.requestMIDIAccess().then(acc => {
    const rebind = () => {
      const names = [];
      acc.inputs.forEach(inp => { inp.onmidimessage = onMsg; names.push(inp.name); });
      setDevice(names[0] || null);                     // carga el mapa de ESTE aparato
      setStatus('midiInfo', names.length ? 'on' : '', names.length ? 'MIDI: ' + names.join(' · ') : 'no MIDI device');   // símbolo de la cabecera
    };
    acc.onstatechange = rebind;                        // conectar/desconectar en caliente
    rebind();
  }).catch(() => setStatus('midiInfo', '', 'MIDI: no permission from the browser'));   // permiso denegado: sin MIDI, sin ruido
}
