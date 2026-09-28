/* =====================================================================
   SubSDJ · punto de entrada. Sirve por HTTP (módulos ES + AudioWorklet).
   ===================================================================== */
import { engine } from './engine/AudioEngine.js';
import { part } from './engine/parts.js';
import { bindKnobs } from './ui/knobs.js';
import { bindSliders } from './ui/sliders.js';
import { bindOscControls } from './ui/oscControls.js';
import { bindMatrixControls } from './ui/matrixControls.js';
import { initWaveEditor } from './ui/waveEditor.js';
import { bindSeqControls } from './ui/seqControls.js';
import { bindWsControls } from './ui/wsControls.js';
import { initKeyboard } from './ui/keyboard.js';
import { initMIDI } from './ui/midi.js';
import { initMidiMap } from './ui/midimap.js';
import { initPresetBank } from './ui/presetBank.js';
import { initRecorder } from './ui/recorder.js';
import { initSfzExport } from './ui/sfzExport.js';
import { initScope } from './ui/scope.js';
import { initADSRGraph } from './ui/adsrGraph.js';
import { initActivity } from './ui/activity.js';
import { initHelp } from './ui/help.js';
import { initPartsControls } from './ui/partsControls.js';
import { initPlayerControls } from './ui/playerControls.js';
import { initScreens } from './ui/screens.js';
import { initTheme } from './ui/theme.js';
import { initGroups } from './ui/groups.js';
import { initLibraryScreen } from './ui/libraryScreen.js';

// 1) UI primero (render inmediato; los controles guardan estado aunque el audio aún no exista)
initTheme();          // piel: ?theme= o el tema recordado, antes de que ningún canvas lea tokens
bindMatrixControls(); // genera las filas de la matriz (crea sus .knob: SIEMPRE antes de bindKnobs)
bindKnobs();          // knobs para casi todo (log/fmt viven en el knob)
bindSliders();        // sliders SOLO en el ADSR: una envolvente se dibuja, no se gira
bindOscControls();
bindSeqControls();   // secuenciador (antes de initMidiMap/initPresetBank: CONTROLS ya poblado)
bindWsControls();    // secuencia de tabla (wave sequencing)
initKeyboard();
initMidiMap();       // mapeo CC→control con MIDI learn (necesita CONTROLS ya poblado)
initMIDI();          // teclado MIDI: velocity, pitch bend, sustain + CCs vía midimap
initPresetBank();
initLibraryScreen(); // pantalla Presets: la biblioteca (secciones, ★, buscar, arrastrar, escenas)
initRecorder();      // grabación de la salida a WAV
initSfzExport();     // preset actual → multisample SFZ (zip)
initADSRGraph(document.getElementById('adsrCanvas'));
initScreens();       // pestañas Diseño / Secuenciación / Presets (filtran el rack; recuerdan la elección)
initGroups();        // secciones plegables (clic) y «solo esta» (doble clic); estado en localStorage
initActivity();      // LEDs de actividad (después de los binders: lee engine.S ya poblado)
initWaveEditor();    // editor de la tabla «usuario» (estado propio, fuera de CONTROLS)
initHelp();          // tooltips «?» por módulo (los textos ya no ocupan superficie)
initPartsControls(); // modo Partes: selector en la cabecera + mezclador (después de help: etiqueta los h2)
initPlayerControls(); // armonía + jugadores de la escena (escucha scene-changed / part-changed)

// Los <select> sueltan el foco al elegir: si no, las teclas del piano QWERTY
// siguen navegando el desplegable por primera letra y cambian la selección.
document.addEventListener('change', e => { if (e.target.tagName === 'SELECT') e.target.blur(); });

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
  if (el && part().ready) {                   // la parte que edita el rack (el motor único si no hay escena)
    const s = part().stats();
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
