/* SubSDJ · dependencias: qué parte del instrumento NO HACE NADA con la
   configuración actual — y se apaga (atenuada EN SU SITIO).
   Cada regla es [qué, cuándo]: QUÉ es una sección (por el título de su h2:
   'sec:FM'), un control del registro (por su clave: 'fmRatio') o un selector
   CSS ('#seqCanvas'); CUÁNDO es una función del estado que devuelve null si
   está VIVO o el MOTIVO (texto corto) si no hace nada. El motivo viaja en
   data-off: la pantalla Salida lo enseña al tocarlo y sale en el tooltip.
   APAGADO NO ES BLOQUEADO: se atenúa pero se puede tocar — preparar un ajuste
   antes de encender lo que lo activa, como en el hardware (el knob gira
   igual). Un control dentro de una sección apagada no se atenúa dos veces.
   Las reglas salen de leer el motor (Voice.js, worklets/pulse-processor.js,
   Sala.js, AudioEngine.js); si el motor cambia, cambian aquí:
   · A suena si su nivel > 0 o Ring > 0; B igual (el mezclador suma
     levelA·A + levelB·B + ring·A×B; el ring necesita los dos osciladores
     aunque sus niveles estén a 0). Lo que depende de una ONDA cuenta solo las
     de osciladores que suenan.
   · La Súper ignora Phase (fases al azar) y el unison (ya lo es); Spread solo
     la abre a ella; P.Width solo mueve la Cuadrada; Ratio/Index solo actúan en
     Seno; el Feedback, en Seno (con modulador) y en el op. 4 de FM4.
   · Los LFO corren siempre: Speed y forma importan si su Level > 0 o si la
     matriz los usa CRUDOS. La env de filtro es también la fuente «Env filtro».
   · Delay y reverb: sin envío (Amount / Mix a 0; en Partes, de ninguna parte)
     sus tiempos no suenan. El BPM lo usan el delay sincronizado, el arpegiador,
     los secuenciadores y, con Partes, el director. */
import { part, sceneOn, getScene } from '../engine/parts.js';
import { MX_SLOTS } from '../engine/params.js';
import { CONTROLS } from './registry.js';

// --- qué suena -----------------------------------------------------------
// un nivel movido por la matriz también hace sonar su oscilador (mirada en crudo: sin dstWhy, que llama aquí)
const mxRaw = (S, d) => { for (let i = 1; i <= MX_SLOTS; i++) if (S['mx' + i + 'src'] !== 'off' && S['mx' + i + 'amt'] && S['mx' + i + 'dst'] === d) return true; return false; };
const oscOn = (S, o) => S['level' + o] > 0 || S.ring > 0 || mxRaw(S, 'lvl' + o) || mxRaw(S, 'lvlRing');
const waves = S => [oscOn(S, 'A') && S.oscA.wave, oscOn(S, 'B') && S.oscB.wave].filter(Boolean);
const has = (S, w) => waves(S).includes(w);
// Partes: las claves de la sala (delay, reverb, bpm) son de todos — basta con que UNA parte las use
const anyPart = (S, f) => (sceneOn() ? getScene().parts.some(p => f(p.engine.S)) : f(S));
const conductor = () => (sceneOn() ? getScene().conductor : null);

// --- matriz ----------------------------------------------------------------
// Un destino que no puede moverse con la configuración actual (null = puede).
const dstWhy = (S, d) =>
  d === 'pw' ? (has(S, 'square') ? null : 'Pulse width: no sounding oscillator is on Square')
  : d === 'wt' ? (has(S, 'wavetable') ? null : 'Wavetable: no sounding oscillator is on Wavetable')
  : d === 'fm' ? (has(S, 'sine') ? null : 'FM index: only acts on oscillators on Sine')
  : d === 'vow' ? (S.vocAmt > 0 ? null : 'Vowel: the Vocal module\'s Mix is at 0')
  : d === 'drive' ? (S.filterDrive > 0 ? null : 'Drive: the Drive knob is at 0 and the signal doesn\'t go through the curve')
  : d === 'pitchA' ? (oscOn(S, 'A') ? null : 'Pitch A: oscillator A isn\'t sounding (Level A and Ring at 0)')
  : d === 'resMat' ? (S.resAmt > 0 ? null : 'Material: the Resonator\'s Mix is at 0')
  : null;
const slotOn = (S, i) => S['mx' + i + 'src'] !== 'off' && !!S['mx' + i + 'amt'] && !dstWhy(S, S['mx' + i + 'dst']);
const mxFrom = (S, src) => { for (let i = 1; i <= MX_SLOTS; i++) if (S['mx' + i + 'src'] === src && slotOn(S, i)) return true; return false; };
const mxTo = (S, dst) => { for (let i = 1; i <= MX_SLOTS; i++) if (S['mx' + i + 'dst'] === dst && slotOn(S, i)) return true; return false; };
const slotWhy = (S, i, isAmt) => {
  if (S['mx' + i + 'src'] === 'off') return 'source «—»: the slot is free';
  if (S['mx' + i + 'src'] === 'acc' && !(S.seqOn === 'on' && /!/.test(S.seqPat || '')))
    return 'Accent: only the sequencer gives it, when on, on steps marked «!»';
  const w = dstWhy(S, S['mx' + i + 'dst']);
  if (w) return w;
  return !isAmt && !S['mx' + i + 'amt'] ? 'amount 0: the slot moves nothing' : null;   // el knob de cantidad es la llave: no se apaga a sí mismo
};

// --- condiciones compartidas ----------------------------------------------
const fmIdle = S => !(S.fmIndex > 0) && !mxTo(S, 'fm');            // sin índice no hay modulador
const fenvUsed = S => S.filterEnvAmt !== 0 || mxFrom(S, 'env');
const LFO_SRC = { pwm: 'lfoPwm', cut: 'lfoCut', res: 'lfoRes', amp: 'lfoAmp', freq: 'lfoFreq' };
const lfoLive = (S, k) => k === 'pan' ? S.panLfoLvl > 0
  : ((S[k + 'LfoLvl'] > 0 && (k !== 'pwm' || has(S, 'square'))) || mxFrom(S, LFO_SRC[k]));
const dlyLive = S => anyPart(S, s => s.dlyAmt > 0);
const revLive = S => anyPart(S, s => s.reverbMix > 0);
const lfoSynced = (S, k) => S[k + 'LfoSync'] && S[k + 'LfoSync'] !== 'free';
const bpmUsed = S => (dlyLive(S) && S.dlySync !== 'free') || sceneOn()
  || anyPart(S, s => s.arpMode !== 'off' || s.seqOn === 'on' || (s.wsOn === 'on' && has(s, 'wavetable'))
    || ['pwm', 'cut', 'res', 'amp', 'freq', 'pan'].some(k => lfoSynced(s, k) && lfoLive(s, k)));   // un LFO a tempo en uso
// el swing columpia lo que va por PASOS (Arp, Seq, Pasos en la matriz, jugadores); el delay y los LFO a tempo, no
const swingUsed = S => sceneOn() || anyPart(S, s => s.arpMode !== 'off' || s.seqOn === 'on' || [1, 2, 3, 4, 5, 6].some(j => /^st\d/.test(s['mx' + j + 'src'] || '') && s['mx' + j + 'amt']));
const NO = w => 'no sounding oscillator is on ' + w;
const DLY_IDLE = () => (sceneOn() ? 'no part sends to the delay' : 'Amount at 0: nothing goes into the delay');
const REV_IDLE = () => (sceneOn() ? 'no part sends to the reverb' : 'Mix at 0: nothing goes into the reverb');

const all = (keys, f) => keys.map(k => [k, f]);
const live = (keys, test, why) => all(keys, S => (test(S) ? null : (typeof why === 'function' ? why(S) : why)));

export const RULES = [
  // ---------- Fuente ----------
  ['sec:Osc A', S => (oscOn(S, 'A') ? null : 'Level A and Ring at 0 in the Mixer: A doesn\'t reach the output')],
  // con Sync el B manda aunque no suene (nivel 0): su octava, su detune y su fase marcan el tiempo del A
  ['sec:Osc B', S => (oscOn(S, 'B') || S.syncA === 'on' ? null : 'Level B and Ring at 0 in the Mixer: B doesn\'t reach the output')],
  ...live(['waveB', 'octavesB'], S => oscOn(S, 'B'), 'B isn\'t sounding (level 0): with Sync it only keeps A\'s time, and for that only its octave, detune and phase count'),
  ['phaseA', S => (S.oscA.wave === 'supersaw' ? 'Supersaw starts each saw at a random phase'
    : S.oscA.wave === 'string' ? 'String starts with the pluck: it has no phase'
    : S.syncA === 'on' ? 'with Sync, A goes back to 0 on every cycle of B: its start phase doesn\'t count' : null)],
  ['syncA', S => (['supersaw', 'fm4', 'string'].includes(S.oscA.wave) ? 'Supersaw, FM4 and String have no sync'
    : S.oscA.wave === 'sine' && S.fmIndex > 0 ? 'Sine with FM (Index > 0) has no sync' : null)],
  ['phaseB', S => (S.oscB.wave === 'supersaw' ? 'Supersaw starts each saw at a random phase'
    : S.oscB.wave === 'string' ? 'String starts with the pluck: it has no phase' : null)],
  ['noiseColor', S => (S.noise > 0 ? null : 'Noise at 0')],
  ['spread', S => (has(S, 'supersaw') ? null : 'only widens the Supersaw: ' + NO('Supersaw'))],
  ['pulseWidth', S => (has(S, 'square') ? null : 'only moves the Square: ' + NO('Square'))],
  ['sec:Unison', S => (waves(S).some(w => w !== 'supersaw') ? null : 'Supersaw is already unison and ignores it')],
  ['uniDetune', S => (+S.uniVoices > 1 ? null : '1 voice: no copies to detune')],
  ['sec:FM', S => (has(S, 'sine') || has(S, 'fm4') ? null : NO('Sine') + ' (nor on FM4, which uses the Feedback)')],
  ['fmIndex', S => (has(S, 'sine') ? null : 'the index only acts on Sine (FM4 uses its operators\' levels)')],
  ['fmRatio', S => (!has(S, 'sine') ? 'the ratio only acts on Sine' : fmIdle(S) ? 'Index at 0: there is no modulator' : null)],
  ['fmFb', S => (has(S, 'fm4') || !has(S, 'sine') ? null : fmIdle(S) ? 'Index at 0: there is no modulator to feed back' : null)],
  ['sec:FM4', S => (has(S, 'fm4') ? null : NO('FM4'))],
  ...[1, 2, 3, 4].flatMap(i => live(['fm4R' + i, 'fm4D' + i, 'fm4V' + i], S => +S['fm4L' + i] > 0, 'Op ' + i + ' at level 0: it neither sounds nor modulates')),
  ['sec:String', S => (has(S, 'string') ? null : NO('String'))],
  ['sec:Wavetable', S => (has(S, 'wavetable') ? null : NO('Wavetable'))],
  ['sec:Wave Editor', S => (!has(S, 'wavetable') ? NO('Wavetable')
    : S.wtSet !== 'user' ? 'draws the «user» table: pick it in Wavetable' : null)],

  // ---------- Voz ----------
  ...live(['vocVowel', 'vocSize', 'vocQ', 'vocLife', 'vocBright', 'vocAtk'], S => S.vocAmt > 0, 'Mix at 0: the vocal tract isn\'t in the signal'),
  ...live(['resMat', 'resDecay', 'resBright'], S => S.resAmt > 0, 'Mix at 0: the resonator isn\'t in the signal'),
  ['morph', S => (S.filterType === 'morph' ? null : 'Low↔Hi only blends in LP↔HP')],
  ...live(['driveChar', 'driveAsym'], S => S.filterDrive > 0, 'Drive at 0: the signal doesn\'t go through the curve'),
  ['filterSlope', S => (S.filterType === 'notch' ? 'Notch has no 2nd stage: it has no slope' : null)],
  ...live(['fenvMode'], fenvUsed, 'Amount at 0 (and the matrix doesn\'t use «Filter env»)'),
  ...all(['fa', 'fd', 'fs', 'fr'], S => (!fenvUsed(S) ? 'Amount at 0 (and the matrix doesn\'t use «Filter env»)'
    : S.fenvMode !== 'own' ? 'follows Amp Env: these times aren\'t used' : null)),
  ['hitGap', S => (Math.round(S.hits) > 1 ? null : 'a single hit: there is no gap between hits')],
  ['pitchEnvDec', S => (S.pitchEnvAmt ? null : 'P.Env Amt at 0: no pitch drop')],
  ['monoTrig', S => (S.mode === 'mono' ? null : 'Mono only: in Poly each note has its own voice and always starts from zero')],

  // ---------- Modulación ----------
  ['pwmLfoLvl', S => (has(S, 'square') ? null : 'PWM only moves the Square: ' + NO('Square'))],
  ...['pwm', 'cut', 'res', 'amp', 'freq', 'pan'].flatMap(k => {
    const idle = k === 'pwm' ? 'no effect: Level at 0 (or no Square) and the matrix doesn\'t use it' : k === 'pan' ? 'Level at 0' : 'Level at 0 and the matrix doesn\'t use it';
    return [
      ...live([k + 'LfoShape', k + 'LfoSync'].filter(x => x !== 'panLfoShape'), S => lfoLive(S, k), idle),
      [k + 'LfoSpd', S => (!lfoLive(S, k) ? idle : lfoSynced(S, k) ? 'in tempo: the BPM division rules (sync)' : null)],
    ];
  }),
  ...live(['lfoFade'], S => S.freqLfoLvl > 0 || (S.pwmLfoLvl > 0 && has(S, 'square')),   // la rampa va en la ruta del Level, no en la matriz
    'it only ramps in the vibrato and the PWM, and neither is in use'),
  ...live(['lfoPhase'], S => ['cut', 'res', 'freq', 'pwm', 'pan'].some(k => lfoLive(S, k)), 'no cutoff, reso, vibrato, PWM or pan LFO in use'),
  ...live(['mxDriftSpd'], S => mxFrom(S, 'drift'), 'no matrix slot uses «Drift (voice)»'),
  ...live(['macro1'], S => mxFrom(S, 'mac1'), 'no matrix slot uses «Macro 1»'),
  ...live(['macro2'], S => mxFrom(S, 'mac2'), 'no matrix slot uses «Macro 2»'),
  ['sec:Mod Env', S => (mxFrom(S, 'envm') ? null : 'no matrix slot uses «Mod env»: pick it as a source in the Matrix')],
  ['sec:Steps', S => ([1, 2, 3, 4].some(i => mxFrom(S, 'st' + i) || mxFrom(S, 'st' + i + 'n')) ? null : 'no matrix slot uses «Steps»: pick «Steps 1…4» as a source in the Matrix')],
  ...[1, 2, 3, 4].map(i => ['.ps-row[data-lane="' + i + '"]', S => (mxFrom(S, 'st' + i) || mxFrom(S, 'st' + i + 'n') ? null : 'no matrix slot uses «Steps ' + i + '»')]),
  ['envmS', S => (S.envmMode === 'loop' ? 'in loop the sustain doesn\'t count: attack and decay repeat' : null)],
  ...Array.from({ length: MX_SLOTS }, (_, j) => j + 1).flatMap(i => [
    ['mx' + i + 'dst', S => slotWhy(S, i, false)],
    ['mx' + i + 'amt', S => slotWhy(S, i, true)],
  ]),

  // ---------- Efectos ----------
  ...live(['flSpd'], S => S.flAmt > 0, 'Fl.Amount at 0'),
  ...live(['chMode', 'chSpd'], S => S.chAmt > 0, 'Amount at 0'),
  ...live(['dlyDamp', 'dlyWow', 'dlySync', 'dlySat'], dlyLive, DLY_IDLE),
  ['dlyFb', S => (!dlyLive(S) ? DLY_IDLE() : sceneOn() ? 'in Parts mode the Room\'s Fdbk rules (part mixer)' : null)],
  ['dlyTime', S => (!dlyLive(S) ? DLY_IDLE() : S.dlySync !== 'free' ? 'synced: the BPM division rules' : null)],
  ...live(['bpm'], bpmUsed, 'nothing runs in tempo: delay free or off, no arpeggiator or sequencers'),
  ['seqNotes', S => (S.seqNotes === 'harmony' && !sceneOn() ? 'without Parts there is no scene harmony: degrees play in major from the key' : null)],
  ...live(['swing'], swingUsed, 'nothing in tempo to swing: no arpeggiator, sequencer, Steps or players'),
  ...live(['reverbSize', 'reverbDamp', 'reverbPre', 'reverbType', 'shimAmt', '#freezeBtn'], revLive, REV_IDLE),
  ['shimInt', S => (!revLive(S) ? REV_IDLE() : S.shimAmt > 0 ? null : 'Shimmer at 0')],

  // ---------- Secuenciación ----------
  ...live(['arpDiv', 'arpOct', 'arpGate'], S => S.arpMode !== 'off', 'Mode Off'),
  ...live(['seqDiv', 'seqGate', 'seqLatch', 'seqRetrig', '#seqPatSel', '#seqCanvas', '.ctl:has(#seqLenNum)'], S => S.seqOn === 'on', 'State Off'),
  ['sec:Wave Sequence', S => (has(S, 'wavetable') ? null : 'it only moves the Wavetable Morph: ' + NO('Wavetable'))],
  ...live(['wsDiv', 'wsMode', 'wsXf', '#wsCanvas', '.ctl:has(#wsLenNum)'], S => S.wsOn === 'on', 'State Off'),
  // escena (Partes): estado del director, no del preset
  ['#harmProg', () => (conductor() && conductor().harmony.mode === 'functions' ? 'Functions: the walk doesn\'t use the list' : null)],
  ['#arrKnobs [data-key="cycle"]', () => (conductor() && !(conductor().arr.cfg.sway > 0) ? 'Sway at 0: there is no cycle' : null)],
  ['#playerArr', () => { const c = conductor(); return c && c.players[getScene().sel].cfg.mode === 'off' ? 'the player is Off' : null; }],
  ['#playerKnobs [data-key="breatheCycle"]', () => { const c = conductor(); return c && !(c.players[getScene().sel].cfg.breathe > 0) ? 'Breathe at 0: the pulse doesn\'t change from bar to bar' : null; }],
  ['#playerArr [data-key="driftAmt"]', () => { const c = conductor(); return c && (c.players[getScene().sel].cfg.drift || 'off') === 'off' ? 'Drift «—»: no parameter to wander' : null; }],
];

// --- aplicar -----------------------------------------------------------------
const h2Text = h2 => [...h2.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();   // sin LED ni «?»
export function depTargets(what) {
  if (what.startsWith('sec:')) return [...document.querySelectorAll('.panel h2')].filter(h => h2Text(h) === what.slice(4)).map(h => h.closest('.panel'));
  if (/^[\w]+$/.test(what)) return CONTROLS[what] && CONTROLS[what].el ? [CONTROLS[what].el] : [];
  return [...document.querySelectorAll(what)];
}

function apply(el, why) {
  if (!el) return;
  const was = el.dataset.off;
  if (why) {
    if (was === why) return;
    if (!('title0' in el.dataset)) el.dataset.title0 = el.getAttribute('title') || '';
    el.dataset.off = why; el.classList.add('dep-off');
    el.title = 'No effect: ' + why + (el.dataset.title0 ? '\n' + el.dataset.title0 : '');
  } else if (was !== undefined) {
    delete el.dataset.off; el.classList.remove('dep-off');
    if (el.dataset.title0) el.title = el.dataset.title0; else el.removeAttribute('title');
    delete el.dataset.title0;
  }
}

export function refreshDeps() {
  const S = part().S;
  for (const [what, f] of RULES) {
    let why = null;
    try { why = f(S); } catch (e) { why = null; }   // estado a medias (arranque, escena montándose): vivo
    for (const el of depTargets(what)) apply(el, why);
  }
}

export function initDeps() {
  let pending = false;
  const later = () => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; refreshDeps(); document.dispatchEvent(new Event('deps-changed')); }); } };   // deps-changed: la pantalla Salida relee el motivo
  for (const ev of ['param-change', 'scene-changed', 'scene-loaded', 'part-changed', 'preset-loaded', 'deps-refresh'])
    document.addEventListener(ev, later);
  refreshDeps();
}
