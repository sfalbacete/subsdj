/* SubSDJ · dependencies: which part of the instrument DOES NOTHING with the
   current settings — and is switched off (dimmed IN PLACE).
   Each rule is [what, when]: WHAT is a section (by its h2 title:
   'sec:FM'), a registry control (by its key: 'fmRatio') or a CSS
   selector ('#seqCanvas'); WHEN is a function of the state that returns null if
   it is ALIVE or the REASON (short text) if it does nothing. The reason travels in
   data-off: the Output display shows it when touched and it appears in the tooltip.
   OFF IS NOT LOCKED: it is dimmed but can still be touched — to prepare a setting
   before switching on what activates it, as on hardware (the knob turns
   all the same). A control inside a switched-off section is not dimmed twice.
   (Locking was weighed and turned down, 2026-11-01: preparing before switching on
   is how the instrument is played, a wrong rule would make a control unreachable
   instead of just grey, and a hardware knob bound to it would go dead.)
   ENABLERS: each rule also says what turns its target on (its third element); with
   the pointer on a dimmed target, ui/enablers.js shows the reason at once and makes
   those controls pulse — or the tab of the screen they are on.
   The rules come from reading the engine (Voice.js, worklets/pulse-processor.js,
   Room.js, AudioEngine.js); if the engine changes, they change here:
   · A sounds if its level > 0 or Ring > 0; B the same (the Mixer sums
     levelA·A + levelB·B + ring·A×B; the ring needs both oscillators
     even if their levels are at 0). What depends on a WAVE only counts those
     of sounding oscillators.
   · Supersaw ignores Phase (random phases) and the unison (it already is one); Spread only
     widens it; P.Width only moves the Square; Ratio/Index only act on
     Sine; the Feedback, on Sine (with a modulator) and on op 4 of FM4.
   · The LFOs always run: Speed and shape matter if their Level > 0 or if the
     matrix uses them RAW. The filter env is also the «Filter env» source.
   · Delay and reverb: with no send (Amount / Mix at 0; in Parts, from no part)
     their times don't sound. The BPM is used by the synced delay, the arpeggiator,
     the sequencers and, with Parts, the conductor. */
import { part, sceneOn, getScene } from '../engine/parts.js';
import { MX_SLOTS } from '../engine/params.js';
import { CONTROLS } from './registry.js';

// --- what sounds ---------------------------------------------------------
// a level moved by the matrix also makes its oscillator sound (looked at raw: no dstWhy, which calls here)
const mxRaw = (S, d) => { for (let i = 1; i <= MX_SLOTS; i++) if (S['mx' + i + 'src'] !== 'off' && S['mx' + i + 'amt'] && S['mx' + i + 'dst'] === d) return true; return false; };
const oscOn = (S, o) => S['level' + o] > 0 || S.ring > 0 || mxRaw(S, 'lvl' + o) || mxRaw(S, 'lvlRing');
const waves = S => [oscOn(S, 'A') && S.oscA.wave, oscOn(S, 'B') && S.oscB.wave].filter(Boolean);
const has = (S, w) => waves(S).includes(w);
// Parts: the Room keys (delay, reverb, bpm) belong to everyone — it is enough that ONE part uses them
const anyPart = (S, f) => (sceneOn() ? getScene().parts.some(p => f(p.engine.S)) : f(S));
const conductor = () => (sceneOn() ? getScene().conductor : null);
// the Arpeggiator / Sequencer module's Mode (the same rule as ui/seqControls.js and the engine: the Seq wins)
const asModeOf = S => (S.seqOn === 'on' ? 'seq' : S.arpMode !== 'off' ? 'arp' : 'off');

// --- matrix ----------------------------------------------------------------
// A destination that cannot move with the current settings (null = it can).
const dstWhy = (S, d) =>
  d === 'pw' ? (has(S, 'square') ? null : 'Pulse width: no sounding oscillator is on Square')
  : d === 'wt' ? (has(S, 'wavetable') ? null : 'Wavetable: no sounding oscillator is on Wavetable')
  : d === 'fm' ? (has(S, 'sine') ? null : 'FM index: only acts on oscillators on Sine')
  : d === 'vow' ? (S.vocAmt > 0 ? null : 'Vowel: the Vocal module\'s Mix is at 0')
  : d === 'drive' ? (S.filterDrive > 0 ? null : 'Drive: the Drive knob is at 0 and the signal doesn\'t go through the curve')
  : d === 'pitchA' ? (oscOn(S, 'A') ? null : 'Pitch A: oscillator A isn\'t sounding (Level A and Ring at 0)')
  : d === 'resMat' ? (S.resAmt > 0 ? null : 'Material: the Resonator\'s Mix is at 0')
  : /^amt\d$/.test(d) ? (S['mx' + d.slice(3) + 'src'] !== 'off' ? null : 'Amount ' + d.slice(3) + ': that slot is free (source «—»)')
  : null;
// another slot feeds this slot's amount: with the knob at 0 it still moves (the modulator sets the depth)
const amtFed = (S, i) => { for (let j = 1; j <= MX_SLOTS; j++) if (j !== i && S['mx' + j + 'src'] !== 'off' && S['mx' + j + 'amt'] && S['mx' + j + 'dst'] === 'amt' + i) return true; return false; };
const slotOn = (S, i) => S['mx' + i + 'src'] !== 'off' && (!!S['mx' + i + 'amt'] || amtFed(S, i)) && !dstWhy(S, S['mx' + i + 'dst']);
const mxFrom = (S, src) => { for (let i = 1; i <= MX_SLOTS; i++) if (S['mx' + i + 'src'] === src && slotOn(S, i)) return true; return false; };
const mxTo = (S, dst) => { for (let i = 1; i <= MX_SLOTS; i++) if (S['mx' + i + 'dst'] === dst && slotOn(S, i)) return true; return false; };
const slotWhy = (S, i, isAmt) => {
  if (S['mx' + i + 'src'] === 'off') return 'source «—»: the slot is free';
  if (S['mx' + i + 'src'] === 'acc' && !(S.seqOn === 'on' && /!/.test(S.seqPat || '')))
    return 'Accent: only the sequencer gives it, when on, on steps marked «!»';
  if (S['mx' + i + 'dst'] === 'amt' + i) return 'Amount ' + i + ': a slot cannot modulate its own amount';
  const w = dstWhy(S, S['mx' + i + 'dst']);
  if (w) return w;
  return !isAmt && !S['mx' + i + 'amt'] && !amtFed(S, i) ? 'amount 0: the slot moves nothing' : null;   // the amount knob is the switch: it doesn't switch itself off (unless another slot feeds it)
};

// --- shared conditions ----------------------------------------------------
const fmIdle = S => !(S.fmIndex > 0) && !mxTo(S, 'fm');            // no index, no modulator
const fenvUsed = S => S.filterEnvAmt !== 0 || mxFrom(S, 'env');
const LFO_SRC = { pwm: 'lfoPwm', cut: 'lfoCut', res: 'lfoRes', amp: 'lfoAmp', freq: 'lfoFreq' };
const lfoLive = (S, k) => k === 'pan' ? S.panLfoLvl > 0
  : ((S[k + 'LfoLvl'] > 0 && (k !== 'pwm' || has(S, 'square'))) || mxFrom(S, LFO_SRC[k]));
const dlyLive = S => anyPart(S, s => s.dlyAmt > 0);
const revLive = S => anyPart(S, s => s.reverbMix > 0);
const lfoSynced = (S, k) => S[k + 'LfoSync'] && S[k + 'LfoSync'] !== 'free';
const bpmUsed = S => (dlyLive(S) && S.dlySync !== 'free') || sceneOn()
  || anyPart(S, s => s.arpMode !== 'off' || s.seqOn === 'on' || (s.wsOn === 'on' && has(s, 'wavetable'))
    || ['pwm', 'cut', 'res', 'amp', 'freq', 'pan'].some(k => lfoSynced(s, k) && lfoLive(s, k)));   // a tempo-synced LFO in use
// the swing swings what runs in STEPS (Arp, Seq, Steps in the matrix, players); the delay and synced LFOs don't
const swingUsed = S => sceneOn() || anyPart(S, s => s.arpMode !== 'off' || s.seqOn === 'on' || [1, 2, 3, 4, 5, 6].some(j => /^st\d/.test(s['mx' + j + 'src'] || '') && s['mx' + j + 'amt']));
const NO = w => 'no sounding oscillator is on ' + w;
const DLY_IDLE = () => (sceneOn() ? 'no part sends to the delay' : 'Amount at 0: nothing goes into the delay');
const REV_IDLE = () => (sceneOn() ? 'no part sends to the reverb' : 'Mix at 0: nothing goes into the reverb');

// --- ENABLERS: what the hand has to touch for each target to do something ---
// A rule's third element (ui/enablers.js makes them pulse while the pointer is on the dimmed target):
// targets like the first one (registry keys, 'sec:…' or selectors), a list or a function of the state
// when it depends on the reason (A's phase: its wave, or Sync). Several are fine: all of them pulse.
// A wave condition is touched at the wave selectors — and at the level of an oscillator that isn't sounding.
const waveBy = S => [...(oscOn(S, 'A') ? ['waveA'] : ['waveA', 'levelA']), ...(oscOn(S, 'B') ? ['waveB'] : ['waveB', 'levelB'])];
const MX_SRCS = Array.from({ length: MX_SLOTS }, (_, j) => 'mx' + (j + 1) + 'src');
const dstBy = (S, d) => (['pw', 'wt', 'fm'].includes(d) ? waveBy(S) : d === 'vow' ? ['vocAmt'] : d === 'drive' ? ['filterDrive']
  : d === 'pitchA' ? ['levelA', 'ring'] : d === 'resMat' ? ['resAmt'] : /^amt\d$/.test(d) ? ['mx' + d.slice(3) + 'src'] : []);
const slotBy = (S, i) => {           // the same order as slotWhy
  if (S['mx' + i + 'src'] === 'off') return ['mx' + i + 'src'];
  if (S['mx' + i + 'src'] === 'acc' && !(S.seqOn === 'on' && /!/.test(S.seqPat || ''))) return S.seqOn === 'on' ? ['#seqCanvas'] : ['asMode'];
  if (S['mx' + i + 'dst'] === 'amt' + i) return ['mx' + i + 'dst'];
  if (dstWhy(S, S['mx' + i + 'dst'])) return dstBy(S, S['mx' + i + 'dst']);
  return ['mx' + i + 'amt'];
};
const fenvBy = S => (!fenvUsed(S) ? ['filterEnvAmt'] : ['fenvMode']);

const all = (keys, f, by) => keys.map(k => [k, f, by]);
const live = (keys, test, why, by) => all(keys, S => (test(S) ? null : (typeof why === 'function' ? why(S) : why)), by);

export const RULES = [
  // ---------- Source ----------
  ['sec:Osc A', S => (oscOn(S, 'A') ? null : 'Level A and Ring at 0 in the Mixer: A doesn\'t reach the output'), ['levelA', 'ring']],
  // with Sync, B rules even when silent (level 0): its octave, detune and phase set A's timing
  ['sec:Osc B', S => (oscOn(S, 'B') || S.syncA === 'on' ? null : 'Level B and Ring at 0 in the Mixer: B doesn\'t reach the output'), ['levelB', 'ring', 'syncA']],
  ...live(['waveB', 'octavesB'], S => oscOn(S, 'B'), 'B isn\'t sounding (level 0): with Sync it only keeps A\'s time, and for that only its octave, detune and phase count', ['levelB', 'ring']),
  ['phaseA', S => (S.oscA.wave === 'supersaw' ? 'Supersaw starts each saw at a random phase'
    : S.oscA.wave === 'string' ? 'String starts with the pluck: it has no phase'
    : S.syncA === 'on' ? 'with Sync, A goes back to 0 on every cycle of B: its start phase doesn\'t count' : null),
    S => (['supersaw', 'string'].includes(S.oscA.wave) ? ['waveA'] : ['syncA'])],
  ['syncA', S => (['supersaw', 'fm4', 'string'].includes(S.oscA.wave) ? 'Supersaw, FM4 and String have no sync'
    : S.oscA.wave === 'sine' && S.fmIndex > 0 ? 'Sine with FM (Index > 0) has no sync' : null),
    S => (S.oscA.wave === 'sine' ? ['fmIndex', 'waveA'] : ['waveA'])],
  ['phaseB', S => (S.oscB.wave === 'supersaw' ? 'Supersaw starts each saw at a random phase'
    : S.oscB.wave === 'string' ? 'String starts with the pluck: it has no phase' : null), ['waveB']],
  ['noiseColor', S => (S.noise > 0 ? null : 'Noise at 0'), ['noise']],
  ['spread', S => (has(S, 'supersaw') ? null : 'only widens the Supersaw: ' + NO('Supersaw')), waveBy],
  ['pulseWidth', S => (has(S, 'square') ? null : 'only moves the Square: ' + NO('Square')), waveBy],
  ['sec:Unison', S => (waves(S).some(w => w !== 'supersaw') ? null : 'Supersaw is already unison and ignores it'), waveBy],
  ['uniDetune', S => (+S.uniVoices > 1 ? null : '1 voice: no copies to detune'), ['uniVoices']],
  ['sec:FM', S => (has(S, 'sine') || has(S, 'fm4') ? null : NO('Sine') + ' (nor on FM4, which uses the Feedback)'), waveBy],
  ['fmIndex', S => (has(S, 'sine') ? null : 'the index only acts on Sine (FM4 uses its operators\' levels)'), waveBy],
  ['fmRatio', S => (!has(S, 'sine') ? 'the ratio only acts on Sine' : fmIdle(S) ? 'Index at 0: there is no modulator' : null),
    S => (!has(S, 'sine') ? waveBy(S) : ['fmIndex'])],
  ['fmFb', S => (has(S, 'fm4') || !has(S, 'sine') ? null : fmIdle(S) ? 'Index at 0: there is no modulator to feed back' : null), ['fmIndex']],
  ['sec:FM4', S => (has(S, 'fm4') ? null : NO('FM4')), waveBy],
  ...[1, 2, 3, 4].flatMap(i => live(['fm4R' + i, 'fm4D' + i, 'fm4V' + i], S => +S['fm4L' + i] > 0, 'Op ' + i + ' at level 0: it neither sounds nor modulates', ['fm4L' + i])),
  ['sec:String', S => (has(S, 'string') ? null : NO('String')), waveBy],
  ...live(['excPress', 'excSpeed', 'excNoise'], S => S.excMode !== 'pluck', 'Pluck: the pick sets the string going; Pressure, Speed and Noise belong to the bow and the breath', ['excMode']),
  ['strPos', S => (S.excMode === 'breath' ? 'the breath has no bow point: Position does nothing on a pipe' : null), ['excMode']],
  ['sec:Wavetable', S => (has(S, 'wavetable') ? null : NO('Wavetable')), waveBy],
  ['sec:Wave Editor', S => (!has(S, 'wavetable') ? NO('Wavetable')
    : S.wtSet !== 'user' ? 'draws the «user» table: pick it in Wavetable' : null),
    S => (!has(S, 'wavetable') ? waveBy(S) : ['wtSet'])],

  // ---------- Voice ----------
  ...live(['vocVowel', 'vocSize', 'vocQ', 'vocLife', 'vocBright', 'vocAtk'], S => S.vocAmt > 0, 'Mix at 0: the vocal tract isn\'t in the signal', ['vocAmt']),
  ...live(['resMat', 'resDecay', 'resBright'], S => S.resAmt > 0, 'Mix at 0: the resonator isn\'t in the signal', ['resAmt']),
  ['morph', S => (S.filterType === 'morph' ? null : 'Low↔Hi only blends in LP↔HP'), ['filterType']],
  ...live(['driveChar', 'driveAsym'], S => S.filterDrive > 0, 'Drive at 0: the signal doesn\'t go through the curve', ['filterDrive']),
  ['filterSlope', S => (S.filterType === 'notch' ? 'Notch has no 2nd stage: it has no slope' : null), ['filterType']],
  ...live(['fenvMode'], fenvUsed, 'Amount at 0 (and the matrix doesn\'t use «Filter env»)', ['filterEnvAmt']),
  ...all(['fa', 'fd', 'fs', 'fr'], S => (!fenvUsed(S) ? 'Amount at 0 (and the matrix doesn\'t use «Filter env»)'
    : S.fenvMode !== 'own' ? 'follows Amp Env: these times aren\'t used' : null), fenvBy),
  ['hitGap', S => (Math.round(S.hits) > 1 ? null : 'a single hit: there is no gap between hits'), ['hits']],
  ['pitchEnvDec', S => (S.pitchEnvAmt ? null : 'P.Env Amt at 0: no pitch drop'), ['pitchEnvAmt']],
  ['monoTrig', S => (S.mode === 'mono' ? null : 'Mono only: in Poly each note has its own voice and always starts from zero'), ['mode']],

  // ---------- Modulation ----------
  ['pwmLfoLvl', S => (has(S, 'square') ? null : 'PWM only moves the Square: ' + NO('Square')), waveBy],
  ...['pwm', 'cut', 'res', 'amp', 'freq', 'pan'].flatMap(k => {
    const idle = k === 'pwm' ? 'no effect: Level at 0 (or no Square) and the matrix doesn\'t use it' : k === 'pan' ? 'Level at 0' : 'Level at 0 and the matrix doesn\'t use it';
    const lvlBy = S => (k === 'pwm' && S.pwmLfoLvl > 0 ? waveBy(S) : [k + 'LfoLvl']);   // the PWM row: a Level without a Square needs the wave
    return [
      ...live([k + 'LfoShape', k + 'LfoSync'].filter(x => x !== 'panLfoShape'), S => lfoLive(S, k), idle, lvlBy),
      [k + 'LfoSpd', S => (!lfoLive(S, k) ? idle : lfoSynced(S, k) ? 'in tempo: the BPM division rules (sync)' : null),
        S => (!lfoLive(S, k) ? lvlBy(S) : [k + 'LfoSync'])],
    ];
  }),
  ...live(['lfoFade'], S => S.freqLfoLvl > 0 || (S.pwmLfoLvl > 0 && has(S, 'square')),   // the ramp sits on the Level path, not in the matrix
    'it only ramps in the vibrato and the PWM, and neither is in use', ['freqLfoLvl', 'pwmLfoLvl']),
  ...live(['lfoPhase'], S => ['cut', 'res', 'freq', 'pwm', 'pan'].some(k => lfoLive(S, k)), 'no cutoff, reso, vibrato, PWM or pan LFO in use',
    ['cutLfoLvl', 'resLfoLvl', 'freqLfoLvl', 'pwmLfoLvl', 'panLfoLvl']),
  ...live(['mxDriftSpd'], S => mxFrom(S, 'drift'), 'no matrix slot uses «Drift (voice)»', MX_SRCS),
  ...live(['macro1'], S => mxFrom(S, 'mac1'), 'no matrix slot uses «Macro 1»', MX_SRCS),
  ...live(['macro2'], S => mxFrom(S, 'mac2'), 'no matrix slot uses «Macro 2»', MX_SRCS),
  ['sec:Mod Env', S => (mxFrom(S, 'envm') ? null : 'no matrix slot uses «Mod env»: pick it as a source in the Matrix'), MX_SRCS],
  ['sec:Steps', S => ([1, 2, 3, 4].some(i => mxFrom(S, 'st' + i) || mxFrom(S, 'st' + i + 'n')) ? null : 'no matrix slot uses «Steps»: pick «Steps 1…4» as a source in the Matrix'), MX_SRCS],
  ...[1, 2, 3, 4].map(i => ['.ps-row[data-lane="' + i + '"]', S => (mxFrom(S, 'st' + i) || mxFrom(S, 'st' + i + 'n') ? null : 'no matrix slot uses «Steps ' + i + '»'), MX_SRCS]),
  ['envmS', S => (S.envmMode === 'loop' ? 'in loop the sustain doesn\'t count: attack and decay repeat' : null), ['envmMode']],
  ...Array.from({ length: MX_SLOTS }, (_, j) => j + 1).flatMap(i => [
    ['mx' + i + 'dst', S => slotWhy(S, i, false), S => slotBy(S, i)],
    ['mx' + i + 'amt', S => slotWhy(S, i, true), S => slotBy(S, i)],
  ]),

  // ---------- Effects ----------
  ...live(['flSpd'], S => S.flAmt > 0, 'Fl.Amount at 0', ['flAmt']),
  ...live(['chMode', 'chSpd'], S => S.chAmt > 0, 'Amount at 0', ['chAmt']),
  ...live(['dlyDamp', 'dlyWow', 'dlySync', 'dlySat'], dlyLive, DLY_IDLE, ['dlyAmt']),
  ['dlyFb', S => (!dlyLive(S) ? DLY_IDLE() : sceneOn() ? 'in Parts mode the Room\'s Fdbk rules (part mixer)' : null), S => (!dlyLive(S) ? ['dlyAmt'] : [])],
  ['dlyTime', S => (!dlyLive(S) ? DLY_IDLE() : S.dlySync !== 'free' ? 'synced: the BPM division rules' : null), S => (!dlyLive(S) ? ['dlyAmt'] : ['dlySync'])],
  ...live(['bpm'], bpmUsed, 'nothing runs in tempo: delay free or off, no arpeggiator or sequencers', ['asMode', 'dlySync', 'wsOn']),
  ['seqNotes', S => (asModeOf(S) !== 'seq' ? (asModeOf(S) === 'off' ? 'Mode Off' : 'Seq only: the Mode is on Arp')
    : S.seqNotes === 'harmony' && !sceneOn() ? 'without Parts there is no scene harmony: degrees play in major from the key' : null),
    S => (asModeOf(S) !== 'seq' ? ['asMode'] : ['#partsBtn'])],
  ...live(['swing'], swingUsed, 'nothing in tempo to swing: no arpeggiator, sequencer, Steps or players', ['asMode']),
  ...live(['reverbSize', 'reverbDamp', 'reverbPre', 'reverbType', 'shimAmt', '#freezeBtn'], revLive, REV_IDLE, ['reverbMix']),
  ['shimInt', S => (!revLive(S) ? REV_IDLE() : S.shimAmt > 0 ? null : 'Shimmer at 0'), S => (!revLive(S) ? ['reverbMix'] : ['shimAmt'])],

  // ---------- Sequencing ----------
  // Arpeggiator / Sequencer, one module: Off dims all but the Mode; Arp, the Seq's half; Seq, the Arp's.
  // The shared widgets are targeted through their virtual controls (asDiv…: ui/seqControls.js)
  ...live(['asDiv', 'asGate', 'asLatch'], S => asModeOf(S) !== 'off', 'Mode Off', ['asMode']),
  ...live(['asDir', '.ctl:has(#arpOctSel)'], S => asModeOf(S) === 'arp', S => (asModeOf(S) === 'off' ? 'Mode Off' : 'Arp only: the Mode is on Seq'), ['asMode']),
  ...live(['#seqRetrigCtl', '#seqPatSel', '#seqCanvas', '#seqLenCtl', '#seqRecBtn'], S => asModeOf(S) === 'seq', S => (asModeOf(S) === 'off' ? 'Mode Off' : 'Seq only: the Mode is on Arp'), ['asMode']),
  ['sec:Wave Sequence', S => (has(S, 'wavetable') ? null : 'it only moves the Wavetable Morph: ' + NO('Wavetable')), waveBy],
  ...live(['wsDiv', 'wsMode', 'wsXf', '#wsCanvas', '.ctl:has(#wsLenNum)'], S => S.wsOn === 'on', 'State Off', ['wsOn']),
  // scene (Parts): conductor state, not preset state
  ['#harmProg', () => (conductor() && conductor().harmony.mode === 'functions' ? 'Functions: the walk doesn\'t use the list' : null), ['#harmMode']],
  ['#arrKnobs [data-key="cycle"]', () => (conductor() && !(conductor().arr.cfg.sway > 0) ? 'Sway at 0: there is no cycle' : null), ['#arrKnobs [data-key="sway"]']],
  ['#playerArr', () => { const c = conductor(); return c && c.players[getScene().sel].cfg.mode === 'off' ? 'the player is Off' : null; }, ['#playerMode']],
  ['#playerKnobs [data-key="breatheCycle"]', () => { const c = conductor(); return c && !(c.players[getScene().sel].cfg.breathe > 0) ? 'Breathe at 0: the pulse doesn\'t change from bar to bar' : null; }, ['#playerKnobs [data-key="breathe"]']],
  ['#playerArr [data-key="driftAmt"]', () => { const c = conductor(); return c && (c.players[getScene().sel].cfg.drift || 'off') === 'off' ? 'Drift «—»: no parameter to wander' : null; }, ['#derivaSel']],
];

// --- apply -------------------------------------------------------------------
const h2Text = h2 => [...h2.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();   // without LED or «?»
export function depTargets(what) {
  if (what.startsWith('sec:')) return [...document.querySelectorAll('.panel h2')].filter(h => h2Text(h) === what.slice(4)).map(h => h.closest('.panel'));
  if (/^[\w]+$/.test(what)) return CONTROLS[what] && CONTROLS[what].el ? [CONTROLS[what].el] : [];
  return [...document.querySelectorAll(what)];
}

// el._depBy: the enablers of the rule that dims it (resolved for the current state), for ui/enablers.js.
// While dimmed the element has NO title: its own tooltip (ui/enablers.js) says the reason, what turns it on
// and the original title (kept in data-title0), and the browser's would come up as well a second later.
function apply(el, why, by) {
  if (!el) return;
  el._depBy = why ? by || [] : null;
  const was = el.dataset.off;
  if (why) {
    if (was === why) return;
    if (!('title0' in el.dataset)) el.dataset.title0 = el.getAttribute('title') || el.dataset.tip || '';   // data-tip: the header's fast tooltip keeps it there (ui/tips.js)
    el.dataset.off = why; el.classList.add('dep-off');
    el.removeAttribute('title');
  } else if (was !== undefined) {
    delete el.dataset.off; el.classList.remove('dep-off');
    if (el.dataset.title0) el.title = el.dataset.title0; else { el.removeAttribute('title'); delete el.dataset.tip; }
    delete el.dataset.title0;
    // back on softly: a one-shot animation (style.css .dep-on) instead of a cut
    el.classList.add('dep-on'); clearTimeout(el._depOnT); el._depOnT = setTimeout(() => el.classList.remove('dep-on'), 400);
  }
}

export function refreshDeps() {
  const S = part().S;
  for (const [what, f, by] of RULES) {
    let why = null, en = null;
    try { why = f(S); } catch (e) { why = null; }   // half-built state (startup, scene being assembled): alive
    if (why) { try { en = typeof by === 'function' ? by(S) : by; } catch (e) { en = null; } }
    for (const el of depTargets(what)) apply(el, why, en);
  }
}

export function initDeps() {
  let pending = false;
  const later = () => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; refreshDeps(); document.dispatchEvent(new Event('deps-changed')); }); } };   // deps-changed: the Output display re-reads the reason
  for (const ev of ['param-change', 'scene-changed', 'scene-loaded', 'part-changed', 'preset-loaded', 'deps-refresh'])
    document.addEventListener(ev, later);
  refreshDeps();
}
