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
   · A suena si Mix < 1 o Ring > 0; B si Mix > 0 o Ring > 0 (gA = 1−mix, gB = mix;
     el ring A×B necesita los dos). Lo que depende de una ONDA cuenta solo las
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
const oscOn = (S, o) => (o === 'A' ? S.mix < 1 : S.mix > 0) || S.ring > 0;
const waves = S => [oscOn(S, 'A') && S.oscA.wave, oscOn(S, 'B') && S.oscB.wave].filter(Boolean);
const has = (S, w) => waves(S).includes(w);
// Partes: las claves de la sala (delay, reverb, bpm) son de todos — basta con que UNA parte las use
const anyPart = (S, f) => (sceneOn() ? getScene().parts.some(p => f(p.engine.S)) : f(S));
const conductor = () => (sceneOn() ? getScene().conductor : null);

// --- matriz ----------------------------------------------------------------
// Un destino que no puede moverse con la configuración actual (null = puede).
const dstWhy = (S, d) =>
  d === 'pw' ? (has(S, 'square') ? null : 'Pulse width: ningún oscilador que suene está en Cuadrada')
  : d === 'wt' ? (has(S, 'tabla') ? null : 'Wavetable: ningún oscilador que suene está en Tabla')
  : d === 'fm' ? (has(S, 'sine') ? null : 'FM índice: solo actúa en osciladores en Seno')
  : d === 'vow' ? (S.vocAmt > 0 ? null : 'Vocal: el módulo Vocal tiene el Mix a 0')
  : null;
const slotOn = (S, i) => S['mx' + i + 'src'] !== 'off' && !!S['mx' + i + 'amt'] && !dstWhy(S, S['mx' + i + 'dst']);
const mxFrom = (S, src) => { for (let i = 1; i <= MX_SLOTS; i++) if (S['mx' + i + 'src'] === src && slotOn(S, i)) return true; return false; };
const mxTo = (S, dst) => { for (let i = 1; i <= MX_SLOTS; i++) if (S['mx' + i + 'dst'] === dst && slotOn(S, i)) return true; return false; };
const slotWhy = (S, i, isAmt) => {
  if (S['mx' + i + 'src'] === 'off') return 'fuente «—»: el slot está libre';
  const w = dstWhy(S, S['mx' + i + 'dst']);
  if (w) return w;
  return !isAmt && !S['mx' + i + 'amt'] ? 'cantidad 0: el slot no mueve nada' : null;   // el knob de cantidad es la llave: no se apaga a sí mismo
};

// --- condiciones compartidas ----------------------------------------------
const fmIdle = S => !(S.fmIndex > 0) && !mxTo(S, 'fm');            // sin índice no hay modulador
const fenvUsed = S => S.filterEnvAmt !== 0 || mxFrom(S, 'env');
const LFO_SRC = { pwm: 'lfoPwm', cut: 'lfoCut', res: 'lfoRes', amp: 'lfoAmp', freq: 'lfoFreq' };
const lfoLive = (S, k) => k === 'pan' ? S.panLfoLvl > 0
  : ((S[k + 'LfoLvl'] > 0 && (k !== 'pwm' || has(S, 'square'))) || mxFrom(S, LFO_SRC[k]));
const dlyLive = S => anyPart(S, s => s.dlyAmt > 0);
const revLive = S => anyPart(S, s => s.reverbMix > 0);
const bpmUsed = S => (dlyLive(S) && S.dlySync !== 'libre') || sceneOn()
  || anyPart(S, s => s.arpMode !== 'off' || s.seqOn === 'on' || (s.wsOn === 'on' && has(s, 'tabla')));
const NO = w => 'ningún oscilador que suene está en ' + w;
const DLY_IDLE = () => (sceneOn() ? 'ninguna parte envía al delay' : 'Amount a 0: no entra nada en el delay');
const REV_IDLE = () => (sceneOn() ? 'ninguna parte envía a la reverb' : 'Mix a 0: no entra nada en la reverb');

const all = (keys, f) => keys.map(k => [k, f]);
const live = (keys, test, why) => all(keys, S => (test(S) ? null : (typeof why === 'function' ? why(S) : why)));

export const RULES = [
  // ---------- Fuente ----------
  ['sec:Osc A', S => (oscOn(S, 'A') ? null : 'Mix todo en B y Ring a 0: el A no llega a la salida')],
  ['sec:Osc B', S => (oscOn(S, 'B') ? null : 'Mix todo en A y Ring a 0: el B no llega a la salida')],
  ['phaseA', S => (S.oscA.wave === 'supersaw' ? 'la Súper arranca cada sierra en una fase al azar' : null)],
  ['phaseB', S => (S.oscB.wave === 'supersaw' ? 'la Súper arranca cada sierra en una fase al azar' : null)],
  ['mix', S => (S.ring >= 1 ? 'Ring a tope: solo suena A×B, sin la mezcla' : null)],
  ['noiseColor', S => (S.noise > 0 ? null : 'Ruido a 0')],
  ['spread', S => (has(S, 'supersaw') ? null : 'solo abre la Súper: ' + NO('Súper'))],
  ['pulseWidth', S => (has(S, 'square') ? null : 'solo mueve la Cuadrada: ' + NO('Cuadrada'))],
  ['sec:Unison', S => (waves(S).some(w => w !== 'supersaw') ? null : 'la Súper ya es unison y lo ignora')],
  ['uniDetune', S => (+S.uniVoices > 1 ? null : '1 voz: no hay copias que desafinar')],
  ['sec:FM', S => (has(S, 'sine') || has(S, 'fm4') ? null : NO('Seno') + ' (ni en FM4, que usa el Feedback)')],
  ['fmIndex', S => (has(S, 'sine') ? null : 'el índice solo actúa en Seno (FM4 lleva los niveles de sus operadores)')],
  ['fmRatio', S => (!has(S, 'sine') ? 'el ratio solo actúa en Seno' : fmIdle(S) ? 'Index a 0: no hay modulador' : null)],
  ['fmFb', S => (has(S, 'fm4') || !has(S, 'sine') ? null : fmIdle(S) ? 'Index a 0: no hay modulador que realimentar' : null)],
  ['sec:FM4', S => (has(S, 'fm4') ? null : NO('FM4'))],
  ...[1, 2, 3, 4].flatMap(i => live(['fm4R' + i, 'fm4D' + i], S => +S['fm4L' + i] > 0, 'Op ' + i + ' con nivel 0: ni suena ni modula')),
  ['sec:Tabla de ondas', S => (has(S, 'tabla') ? null : NO('Tabla'))],
  ['sec:Editor de ondas', S => (!has(S, 'tabla') ? NO('Tabla')
    : S.wtSet !== 'usuario' ? 'dibuja la tabla «usuario»: elígela en Tabla de ondas' : null)],

  // ---------- Voz ----------
  ...live(['vocVowel', 'vocSize', 'vocQ', 'vocVida', 'vocBrillo', 'vocAtk'], S => S.vocAmt > 0, 'Mix a 0: el tracto vocal no está en la señal'),
  ...live(['resMat', 'resDecay', 'resBrillo'], S => S.resAmt > 0, 'Mezcla a 0: el resonador no está en la señal'),
  ['morph', S => (S.filterType === 'morph' ? null : 'Low↔Hi solo funde en LP↔HP')],
  ['filterSlope', S => (S.filterType === 'notch' ? 'el Notch no lleva 2ª etapa: no tiene pendiente' : null)],
  ...live(['fenvMode'], fenvUsed, 'Amount a 0 (y la matriz no usa «Env filtro»)'),
  ...all(['fa', 'fd', 'fs', 'fr'], S => (!fenvUsed(S) ? 'Amount a 0 (y la matriz no usa «Env filtro»)'
    : S.fenvMode !== 'own' ? 'sigue a Env amp: estos tiempos no se usan' : null)),
  ['hitGap', S => (Math.round(S.hits) > 1 ? null : 'un solo golpe: no hay hueco entre golpes')],
  ['pitchEnvDec', S => (S.pitchEnvAmt ? null : 'P.Env Amt a 0: no hay caída de tono')],

  // ---------- Modulación ----------
  ['pwmLfoLvl', S => (has(S, 'square') ? null : 'el PWM solo mueve la Cuadrada: ' + NO('Cuadrada'))],
  ...['pwm', 'cut', 'res', 'amp', 'freq'].flatMap(k => live([k + 'LfoSpd', k + 'LfoShape'], S => lfoLive(S, k),
    k === 'pwm' ? 'sin efecto: Level a 0 (o ninguna Cuadrada) y la matriz no lo usa' : 'Level a 0 y la matriz no lo usa')),
  ...live(['panLfoSpd'], S => S.panLfoLvl > 0, 'Level a 0'),
  ...live(['lfoFade'], S => S.freqLfoLvl > 0 || (S.pwmLfoLvl > 0 && has(S, 'square')),   // la rampa va en la ruta del Level, no en la matriz
    'solo hace entrar en rampa el vibrato y el PWM, y ninguno está en uso'),
  ...live(['lfoPhase'], S => ['cut', 'res', 'freq', 'pwm', 'pan'].some(k => lfoLive(S, k)), 'ningún LFO de cutoff, reso, vibrato, PWM o pan en uso'),
  ...live(['mxDriftSpd'], S => mxFrom(S, 'drift'), 'ningún slot de la matriz usa «Deriva (voz)»'),
  ...Array.from({ length: MX_SLOTS }, (_, j) => j + 1).flatMap(i => [
    ['mx' + i + 'dst', S => slotWhy(S, i, false)],
    ['mx' + i + 'amt', S => slotWhy(S, i, true)],
  ]),

  // ---------- Efectos ----------
  ...live(['flSpd'], S => S.flAmt > 0, 'Fl.Amount a 0'),
  ...live(['chMode', 'chSpd'], S => S.chAmt > 0, 'Amount a 0'),
  ...live(['dlyDamp', 'dlyWow', 'dlySync'], dlyLive, DLY_IDLE),
  ['dlyTime', S => (!dlyLive(S) ? DLY_IDLE() : S.dlySync !== 'libre' ? 'sincronizado: manda la división del BPM' : null)],
  ...live(['bpm'], bpmUsed, 'nada va a tempo: delay libre o apagado, sin arpegiador ni secuenciadores'),
  ...live(['reverbSize', 'reverbDamp', 'reverbPre', 'reverbType', 'shimAmt', '#freezeBtn'], revLive, REV_IDLE),
  ['shimInt', S => (!revLive(S) ? REV_IDLE() : S.shimAmt > 0 ? null : 'Shimmer a 0')],

  // ---------- Secuenciación ----------
  ...live(['arpDiv', 'arpOct', 'arpGate'], S => S.arpMode !== 'off', 'Modo Off'),
  ...live(['seqDiv', 'seqGate', 'seqLatch', 'seqRetrig', '#seqPatSel', '#seqCanvas', '.ctl:has(#seqLenNum)'], S => S.seqOn === 'on', 'Estado Off'),
  ['sec:Tabla · secuencia', S => (has(S, 'tabla') ? null : 'solo mueve el Morph de la Tabla: ' + NO('Tabla'))],
  ...live(['wsDiv', 'wsMode', 'wsXf', '#wsCanvas', '.ctl:has(#wsLenNum)'], S => S.wsOn === 'on', 'Estado Off'),
  // escena (Partes): estado del director, no del preset
  ['#harmProg', () => (conductor() && conductor().harmony.modo === 'funciones' ? 'Funciones: el paseo no usa la lista' : null)],
  ['#arrKnobs [data-key="ciclo"]', () => (conductor() && !(conductor().arr.cfg.vaiven > 0) ? 'Vaivén a 0: no hay ciclo' : null)],
  ['#playerArr', () => { const c = conductor(); return c && c.players[getScene().sel].cfg.mode === 'off' ? 'el jugador está en Off' : null; }],
  ['#playerArr [data-key="derivaAmt"]', () => { const c = conductor(); return c && (c.players[getScene().sel].cfg.deriva || 'off') === 'off' ? 'Deriva «—»: no hay parámetro que pasee' : null; }],
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
    el.title = 'Sin efecto: ' + why + (el.dataset.title0 ? '\n' + el.dataset.title0 : '');
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
