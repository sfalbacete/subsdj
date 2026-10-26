/* =====================================================================
   SubSDJ · entry point. Serve over HTTP (ES modules + AudioWorklet).
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

// 1) UI first (immediate render; the controls keep state even though the audio doesn't exist yet)
document.getElementById('verBadge').textContent = 'v' + VERSION;   // next to the title (js/version.js)
initFrame();          // the instrument: fixed-size object scaled to the window (before any canvas measures)
initTheme();          // skin: ?theme= or the remembered theme, before any canvas reads tokens
initSplash();         // welcome window (demoscene; already in the HTML, covering the assembly): after initFrame, for its scale; ENTER starts the audio
for (const id of ['aboutBtn', 'verBadge', 'aboutItem']) document.getElementById(id)?.addEventListener('click', () => openSplash(true));   // «About»: the same window
bindMatrixControls(); // generates the matrix rows (creates their .knob: ALWAYS before bindKnobs)
bindKnobs();          // knobs for almost everything (log/fmt live in the knob)
bindSliders();        // sliders ONLY in the ADSR: an envelope is drawn, not turned
bindOscControls();
bindSeqControls();   // sequencer (before initMidiMap/initPresetBank: CONTROLS already populated)
bindWsControls();    // Wave Sequence (wave sequencing)
bindStepsControls(); // Steps: four lanes for the matrix (Roadmap 7.0 · 2.3)
initRotaries();      // rotary selectors: the .seg.rot already have their active position
initFm4Graph();      // FM4 algorithm graph under its selector (follows fm4Alg and the Feedback)
initKeyboard();
initMidiMap();       // CC→control mapping with MIDI learn (needs CONTROLS already populated)
initMIDI();          // MIDI keyboard: velocity, pitch bend, sustain + CCs via midimap
initPresetBank();
initPresetPicker();  // the header's quick picker: search, categories, ↑ ↓ to audition
initLibraryScreen(); // Presets screen: the Library (sections, ★, search, drag, scenes)
initRecorder();      // recording of the output to WAV
initSfzExport();     // current preset → SFZ multisample (zip)
initADSRGraph(document.getElementById('adsrCanvas'));
initScreens();       // Design / Sequencing / Presets tabs (one fixed panel each; they remember the choice)
initActivity();      // activity LEDs (after the binders: reads engine.S already populated)
initWaveEditor();    // editor of the «user» table (its own state, outside CONTROLS)
initHelp();          // «?» tooltips per module (the texts no longer take up surface)
initPartsControls(); // Parts mode: selector in the header + Part Mixer (after help: it tags the h2s)
initPlayerControls(); // the scene's harmony + players (listens to scene-changed / part-changed)
initDisplay();       // Output display (last parameter touched), File menu and bank notices
initDeps();          // dims (still touchable) what does nothing with the current settings, with its reason
initHistory();       // undo / redo by gestures (Ctrl+Z · Ctrl+Y) and compare with the saved preset

// <select>s drop focus after a choice: otherwise the QWERTY piano keys
// keep browsing the dropdown by first letter and change the selection.
document.addEventListener('change', e => { if (e.target.tagName === 'SELECT') e.target.blur(); });

// 2) Audio engine (loads the worklet; the context starts suspended and resumes on the first gesture)
engine.init()
  .then(() => {
    initScope(document.getElementById('scope'), document.getElementById('spectrum'));
    initMeter();         // output meter: L/R peaks and limiter reduction
    if (!isStatus('powerInfo', 'on')) setStatus('powerInfo', 'wait', 'audio ready: press a key or a note to play');
  })
  .catch(err => {
    console.error('SubSDJ: could not start the audio', err);
    setStatus('powerInfo', 'err', 'error starting the audio (see the console)');
  });

// 3) Self-test (?selftest=1): renders the factory presets in an
//    OfflineAudioContext and validates the output. It doesn't need the real audio.
if (new URLSearchParams(location.search).has('selftest')) {
  import('./selftest.js')
    .then(m => m.runSelfTest())
    .catch(err => console.error('SubSDJ selftest:', err));
}
