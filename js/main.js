/* =====================================================================
   SubSDJ · punto de entrada. Sirve por HTTP (módulos ES + AudioWorklet).
   ===================================================================== */
import { engine } from './engine/AudioEngine.js';
import { bindKnobs } from './ui/knobs.js';
import { bindSliders } from './ui/sliders.js';
import { bindOscControls } from './ui/oscControls.js';
import { initKeyboard } from './ui/keyboard.js';
import { initMIDI } from './ui/midi.js';
import { initPresetBank } from './ui/presetBank.js';
import { initScope } from './ui/scope.js';
import { initADSRGraph } from './ui/adsrGraph.js';

// 1) UI primero (render inmediato; los controles guardan estado aunque el audio aún no exista)
bindKnobs();
bindSliders();
bindOscControls();
initKeyboard();
initMIDI();          // teclado MIDI: velocity, pitch bend, sustain, mod wheel
initPresetBank();
initADSRGraph(document.getElementById('adsrCanvas'));

// 2) Motor de audio (carga el worklet; el contexto arranca suspendido y se reanuda al primer gesto)
engine.init()
  .then(() => {
    initScope(document.getElementById('scope'), document.getElementById('spectrum'));
    const info = document.getElementById('powerInfo');
    if (info && !info.classList.contains('on')) info.textContent = '⏻ pulsa una tecla o nota para sonar';
  })
  .catch(err => {
    console.error('SubSDJ: no se pudo iniciar el audio', err);
    const info = document.getElementById('powerInfo');
    if (info) info.textContent = '⚠ error al iniciar el audio (mira la consola)';
  });

// 3) Mini-HUD de diagnóstico: voces pulsadas · colas de release · worklets vivos
setInterval(() => {
  const el = document.getElementById('dbgInfo');
  if (el && engine.ready) {
    const s = engine.stats();
    el.textContent = `voces ${s.pressed} · colas ${s.tails} · osc ${s.worklets}`;
  }
}, 500);

// 4) Self-test (?selftest=1): renderiza los presets de fábrica en un
//    OfflineAudioContext y valida la salida. No necesita el audio real.
if (new URLSearchParams(location.search).has('selftest')) {
  import('./selftest.js')
    .then(m => m.runSelfTest())
    .catch(err => console.error('SubSDJ selftest:', err));
}
