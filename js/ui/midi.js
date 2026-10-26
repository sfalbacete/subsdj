/* =====================================================================
   SubSDJ · Web MIDI input.
   Notes with velocity -> pressNote/releaseNote (shares ids and visuals with
   the on-screen keyboard), passed through the touch curve (keyboard.js).
   Normalized pitch bend (−1..1) -> setBend of each part, which scales it by
   its preset's range (bendRange). Sustain (CC64) is held here, unless the user
   remaps it. The rest of the CCs go through the midimap.js map (MIDI learn);
   factory: CC1 -> vibrato, CC74/CC71 -> cutoff/resonance (the
   controls turn on screen: same philosophy as an analog panel).
   Program change n -> preset n of the bank (modulo the bank size).
   PERFORMANCE sources of the matrix (Roadmap 5.0 · block 4): the wheel (CC1)
   and expression (CC11) ALWAYS feed their source ('wheel', 'expr'), on top
   of whatever they are mapped to (factory: CC1 → vibrato; removing that mapping leaves
   the wheel for the matrix only); channel aftertouch (and polyphonic, which
   is treated the same: the source is per engine) feeds 'at'.
   ===================================================================== */
import { part, eachPart, setPerf } from '../engine/parts.js';
import { pressNote, releaseNote, touchCurve } from './keyboard.js';
import { applyCC, learnCapture, setDevice } from './midimap.js';
import { loadPresetIndex } from './presetBank.js';
import { setStatus } from './status.js';

let pedal = false;
const pedalHeld = new Set();     // notes released while the pedal is down

// Performance source → engines (all parts) + notice to the UI (the on-screen wheel follows CC1)
function perf(id, v) { setPerf(id, v); document.dispatchEvent(new CustomEvent('perf-change', { detail: { id, value: v } })); }

// One MIDI message (its bytes). Exported: the selftest probe calls it with synthetic messages.
export function handleMidi(data) {
  const [st, d1, d2] = data;
  const cmd = st & 0xf0;
  if (cmd === 0x90 && d2 > 0) {                        // note on
    part().resume();
    if (pedalHeld.has(d1)) { pedalHeld.delete(d1); releaseNote(d1); }   // retrigger of a sustained note
    pressNote(d1, touchCurve(d2 / 127));
  } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {   // note off
    if (pedal) pedalHeld.add(d1);
    else releaseNote(d1);
  } else if (cmd === 0xb0) {                           // control change
    if (learnCapture(d1)) return;                      // learn mode: binds this CC to the chosen control
    if (d1 === 1) perf('wheel', d2 / 127);             // wheel and expression: matrix sources, ALWAYS (on top of the mapping)
    else if (d1 === 11) perf('expr', d2 / 127);
    if (applyCC(d1, d2 / 127)) return;                 // user mapping (midimap.js)
    if (d1 === 64) {                                   // sustain (if not remapped)
      pedal = d2 >= 64;
      if (!pedal) { pedalHeld.forEach(n => releaseNote(n)); pedalHeld.clear(); }
    }
  } else if (cmd === 0xd0) {                           // channel aftertouch → source 'at'
    perf('at', d1 / 127);
  } else if (cmd === 0xa0) {                           // polyphonic aftertouch: like channel (the source is per engine, not per note)
    perf('at', d2 / 127);
  } else if (cmd === 0xc0) {                           // program change → bank preset
    loadPresetIndex(d1);
  } else if (cmd === 0xe0) {                           // pitch bend: −1..1 (the preset sets the range)
    eachPart(e => e.setBend((((d2 << 7) | d1) - 8192) / 8192));
  }
}
function onMsg(e) { handleMidi(e.data); }

export function initMIDI() {
  if (!navigator.requestMIDIAccess) {                  // browser without Web MIDI
    const btn = document.getElementById('midiLearnBtn');
    if (btn) btn.hidden = true;
    setStatus('midiInfo', '', 'this browser has no Web MIDI');
    return;
  }
  navigator.requestMIDIAccess().then(acc => {
    const rebind = () => {
      const names = [];
      acc.inputs.forEach(inp => { inp.onmidimessage = onMsg; names.push(inp.name); });
      setDevice(names[0] || null);                     // loads the map of THIS device
      setStatus('midiInfo', names.length ? 'on' : '', names.length ? 'MIDI: ' + names.join(' · ') : 'no MIDI device');   // header symbol
    };
    acc.onstatechange = rebind;                        // hot plug/unplug
    rebind();
  }).catch(() => setStatus('midiInfo', '', 'MIDI: no permission from the browser'));   // permission denied: no MIDI, no fuss
}
