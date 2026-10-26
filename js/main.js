/* =====================================================================
   SubSDJ · punto de entrada. Sirve por HTTP (módulos ES + AudioWorklet).
   ===================================================================== */
import { engine } from './engine/AudioEngine.js';
import { bindKnobs } from './ui/knobs.js';
import { bindSliders } from './ui/sliders.js';
import { bindOscControls } from './ui/oscControls.js';
import { bindMatrixControls } from './ui/matrixControls.js';
import { initWaveEditor } from './ui/waveEditor.js';
import { bindSeqControls } from './ui/seqControls.js';
import { bindWsControls } from './ui/wsControls.js';
import { bindStepsControls } from './ui/stepsControls.js';
import { initKeyboard } from './ui/keyboard.js';
import { initMIDI } from './ui/midi.js';
import { initMidiMap } from './ui/midimap.js';
import { initPresetBank } from './ui/presetBank.js';
import { initPresetPicker } from './ui/presetPicker.js';
import { initRecorder } from './ui/recorder.js';
import { initSfzExport } from './ui/sfzExport.js';
import { initScope } from './ui/scope.js';
import { initMeter } from './ui/meter.js';
import { initADSRGraph } from './ui/adsrGraph.js';
import { initActivity } from './ui/activity.js';
import { initHelp } from './ui/help.js';
import { initPartsControls } from './ui/partsControls.js';
import { initPlayerControls } from './ui/playerControls.js';
import { initScreens } from './ui/screens.js';
import { initTheme } from './ui/theme.js';
import { initFrame } from './ui/frame.js';
import { initSplash, openSplash } from './ui/splash.js';
import { initRotaries } from './ui/rotary.js';
import { initFm4Graph } from './ui/fm4Graph.js';
import { initDisplay } from './ui/display.js';
import { initDeps } from './ui/deps.js';
import { initLibraryScreen } from './ui/libraryScreen.js';
import { initHistory } from './ui/history.js';
import { setStatus, isStatus } from './ui/status.js';
import { VERSION } from './version.js';

// 1) UI primero (render inmediato; los controles guardan estado aunque el audio aún no exista)
document.getElementById('verBadge').textContent = 'v' + VERSION;   // junto al título (js/version.js)
initFrame();          // el instrumento: objeto de tamaño fijo escalado a la ventana (antes que cualquier canvas mida)
initTheme();          // piel: ?theme= o el tema recordado, antes de que ningún canvas lea tokens
initSplash();         // ventana de entrada (demoscene; ya está en el HTML y tapa el montaje): tras initFrame, para su escala; ENTRAR arranca el audio
for (const id of ['aboutBtn', 'verBadge', 'aboutItem']) document.getElementById(id)?.addEventListener('click', () => openSplash(true));   // «Acerca de»: la misma ventana
bindMatrixControls(); // genera las filas de la matriz (crea sus .knob: SIEMPRE antes de bindKnobs)
bindKnobs();          // knobs para casi todo (log/fmt viven en el knob)
bindSliders();        // sliders SOLO en el ADSR: una envolvente se dibuja, no se gira
bindOscControls();
bindSeqControls();   // secuenciador (antes de initMidiMap/initPresetBank: CONTROLS ya poblado)
bindWsControls();    // secuencia de tabla (wave sequencing)
bindStepsControls(); // Pasos: cuatro carriles para la matriz (Roadmap 7.0 · 2.3)
initRotaries();      // selectores giratorios: los .seg.rot ya tienen su posición activa
initFm4Graph();      // grafo del algoritmo FM4 bajo su selector (sigue a fm4Alg y al Feedback)
initKeyboard();
initMidiMap();       // mapeo CC→control con MIDI learn (necesita CONTROLS ya poblado)
initMIDI();          // teclado MIDI: velocity, pitch bend, sustain + CCs vía midimap
initPresetBank();
initPresetPicker();  // selector rápido de la cabecera: buscar, categorías, ↑ ↓ para probar
initLibraryScreen(); // pantalla Presets: la biblioteca (secciones, ★, buscar, arrastrar, escenas)
initRecorder();      // grabación de la salida a WAV
initSfzExport();     // preset actual → multisample SFZ (zip)
initADSRGraph(document.getElementById('adsrCanvas'));
initScreens();       // pestañas Diseño / Secuenciación / Presets (un panel fijo cada una; recuerdan la elección)
initActivity();      // LEDs de actividad (después de los binders: lee engine.S ya poblado)
initWaveEditor();    // editor de la tabla «usuario» (estado propio, fuera de CONTROLS)
initHelp();          // tooltips «?» por módulo (los textos ya no ocupan superficie)
initPartsControls(); // modo Partes: selector en la cabecera + mezclador (después de help: etiqueta los h2)
initPlayerControls(); // armonía + jugadores de la escena (escucha scene-changed / part-changed)
initDisplay();       // pantalla Salida (último parámetro tocado), menú Archivo y avisos del banco
initDeps();          // apaga (atenuado, tocable) lo que no hace nada con la configuración actual, con su motivo
initHistory();       // deshacer / rehacer por gestos (Ctrl+Z · Ctrl+Y) y comparar con el preset guardado

// Los <select> sueltan el foco al elegir: si no, las teclas del piano QWERTY
// siguen navegando el desplegable por primera letra y cambian la selección.
document.addEventListener('change', e => { if (e.target.tagName === 'SELECT') e.target.blur(); });

// 2) Motor de audio (carga el worklet; el contexto arranca suspendido y se reanuda al primer gesto)
engine.init()
  .then(() => {
    initScope(document.getElementById('scope'), document.getElementById('spectrum'));
    initMeter();         // medidor de salida: picos L/R y reducción del limitador
    if (!isStatus('powerInfo', 'on')) setStatus('powerInfo', 'wait', 'audio ready: press a key or a note to play');
  })
  .catch(err => {
    console.error('SubSDJ: could not start the audio', err);
    setStatus('powerInfo', 'err', 'error starting the audio (see the console)');
  });

// 3) Self-test (?selftest=1): renderiza los presets de fábrica en un
//    OfflineAudioContext y valida la salida. No necesita el audio real.
if (new URLSearchParams(location.search).has('selftest')) {
  import('./selftest.js')
    .then(m => m.runSelfTest())
    .catch(err => console.error('SubSDJ selftest:', err));
}
