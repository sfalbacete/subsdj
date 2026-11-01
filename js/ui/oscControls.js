/* SubSDJ · wave, octave and stack selectors + segments (voice mode,
   filter envelope…) + wavetable selector. Defaults from PARAMS
   (the HTML marks no .active). A seg can look like a row of buttons, a
   rotary selector (.rot, ui/rotary.js) or a switch with LED (.tog):
   for bindSeg it is all the same, a row of <button data-KEY>. */
import { part } from '../engine/parts.js';
import { PARAMS, LFO_DIVS } from '../engine/params.js';
import { WT_SETS } from '../engine/wavetable.js';
import { CONTROLS, applyTarget, bindSelect } from './registry.js';

// Generic button segment: <button data-KEY="value">. Registers the canonical
// control `name` and applies to the engine target. num: the value is a number
// (octave, stack): it is applied and stored as a number, not as text.
export function bindSeg(segId, key, name, target, num = false) {
  const seg = document.getElementById(segId);
  if (!seg) return;
  const val = b => (num ? +b.dataset[key] : b.dataset[key]);
  const select = b => {
    seg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    applyTarget(target, val(b));
  };
  seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => select(b)));
  CONTROLS[name] = {
    get: () => val(seg.querySelector('button.active')),
    set: v => { const b = seg.querySelector('button[data-' + key + '="' + v + '"]'); if (b) select(b); },
    def: PARAMS[name].def,
    el: seg,
    opts: [...seg.querySelectorAll('button')].map(val),   // zones for midimap
  };
  CONTROLS[name].set(PARAMS[name].def);
}

// LFO waveform button: cycles sin→tri→saw→sqr→S&H→drift on each click
// (S&H = random steps at the LFO's speed; drift = smooth, slow random).
const SHAPES = ['sine', 'triangle', 'sawtooth', 'square', 'sh', 'drift'];
const SHAPE_LABEL = { sine: 'sin', triangle: 'tri', sawtooth: 'saw', square: 'sqr', sh: 'S&H', drift: 'drift' };
function bindLfoShapes() {
  document.querySelectorAll('.lfoShape').forEach(btn => {
    const name = btn.dataset.shape;
    if (!PARAMS[name]) return;
    const set = v => {
      if (!SHAPES.includes(v)) v = 'sine';
      btn.dataset.cur = v; btn.textContent = SHAPE_LABEL[v];
      applyTarget(name, v);
    };
    btn.addEventListener('click', () => { part().resume(); set(SHAPES[(SHAPES.indexOf(btn.dataset.cur) + 1) % SHAPES.length]); });
    CONTROLS[name] = { get: () => btn.dataset.cur, set, def: PARAMS[name].def, el: btn, opts: SHAPES };
    set(PARAMS[name].def);
  });
}

// ❄ Freeze of the Room: a performance gesture, not a preset parameter (a frozen
// tail makes no sense saved). Plate only: with the IR the button is
// disabled. Panic/Escape release it (keyboard.panic emits 'freeze-changed').
function bindFreeze() {
  const fz = document.getElementById('freezeBtn');
  if (!fz) return;
  const paint = () => { const s = part().room; fz.classList.toggle('on', !!(s && s.frozen)); };
  fz.addEventListener('click', () => { part().resume(); const s = part().room; if (s) s.setFreeze(!s.frozen); paint(); });
  document.addEventListener('freeze-changed', paint);
  document.addEventListener('param-change', e => { if (e.detail.target === 'reverbType') { fz.disabled = e.detail.value !== 'plate'; paint(); } });
  fz.disabled = PARAMS.reverbType.def !== 'plate';
}

// Osc A Sync (Roadmap 7.0 · 3.2): a button in the module header that
// toggles off / on. It doesn't fold the module (a click on the header would).
function bindSync() {
  const b = document.getElementById('syncA'); if (!b) return;
  const on = () => b.classList.contains('active');
  const set = v => { b.classList.toggle('active', v === 'on'); b.setAttribute('aria-pressed', String(v === 'on')); applyTarget('syncA', v === 'on' ? 'on' : 'off'); };
  b.addEventListener('click', e => { e.stopPropagation(); part().resume(); set(on() ? 'off' : 'on'); });
  CONTROLS.syncA = { get: () => (on() ? 'on' : 'off'), set, def: PARAMS.syncA.def, el: b, opts: ['off', 'on'] };
  set(PARAMS.syncA.def);
}

// String's exciter (2026-11-01): a button in the module header that cycles the modes
// (pluck → bow → breath). Off = pluck; the text names the mode when on, and the three mini
// knobs are relabelled for it (Speed is the bow's speed or the jet's length; Noise the scratch or the air).
const EXC_MODES = ['pluck', 'bow', 'breath'];
const EXC_LABELS = {
  bow:    { excPress: ['Pressure', 'Bow pressure: light, the bow lets go easily (thin, the upper partials); around 0.7 hollow; heavy, the fundamental takes over (dark, fat)'],
            excSpeed: ['Speed', 'Bow speed = the level of the bowed note (the key velocity scales it)'],
            excNoise: ['Noise', 'Scratch: slow noise on the bow speed, the grain of the hair'] },
  breath: { excPress: ['Breath', 'Breath: little, only air; enough, the note; a lot, the octave (overblow). Aftertouch → Bow pressure overblows'],
            excSpeed: ['Jet', 'The jet\'s length as a fraction of the bore: which register it favours (short, the fundamental; long, the octave comes sooner)'],
            excNoise: ['Air', 'The air in the breath: white noise with the pressure'] },
};
EXC_LABELS.pluck = EXC_LABELS.bow;
function bindExc() {
  const b = document.getElementById('excModeBtn'); if (!b) return;
  const set = v => {
    if (!EXC_MODES.includes(v)) v = 'pluck';
    b.dataset.cur = v; b.textContent = v === 'pluck' ? 'bow' : v;
    b.classList.toggle('active', v !== 'pluck'); b.setAttribute('aria-pressed', String(v !== 'pluck'));
    for (const k in EXC_LABELS[v]) { const kn = document.querySelector('.knob[data-knob="' + k + '"]'); if (!kn) continue;
      const lab = kn.parentElement.querySelector('.lab'); if (lab) lab.textContent = EXC_LABELS[v][k][0]; kn.title = EXC_LABELS[v][k][1]; }
    applyTarget('excMode', v);
  };
  b.addEventListener('click', e => { e.stopPropagation(); part().resume(); set(EXC_MODES[(EXC_MODES.indexOf(b.dataset.cur) + 1) % EXC_MODES.length]); });
  CONTROLS.excMode = { get: () => b.dataset.cur, set, def: PARAMS.excMode.def, el: b, opts: EXC_MODES };
  set(PARAMS.excMode.def);
}

export function bindOscControls() {
  bindSync(); bindExc();
  bindSeg('waveA', 'w', 'waveA', 'oscA.wave');
  bindSeg('waveB', 'w', 'waveB', 'oscB.wave');
  bindSeg('modeSel', 'mode', 'mode', 'mode');              // Poly / Mono
  bindSeg('monoTrigSel', 'trig', 'monoTrig', 'monoTrig');  // Trigger in Mono: legato / retrig
  bindSeg('fenvModeSel', 'fenv', 'fenvMode', 'fenvMode');  // filter env: =Amp / Own
  bindSeg('filterSlopeSel', 'slope', 'filterSlope', 'filterSlope');  // 12 / 24 dB per octave
  bindSeg('filterTypeSel', 'ftype', 'filterType', 'filterType');     // LP↔HP / BP / Notch (structure: per note)
  bindSeg('driveCharSel', 'dchar', 'driveChar', 'driveChar');      // drive soft (tanh) / fold (live)
  bindSeg('envmModeSel', 'envm', 'envmMode', 'envmMode');           // Mod Env: normal / loop / trigger (per note)
  bindSeg('dlySyncSel', 'sync', 'dlySync', 'dlySync');     // delay: free / BPM division
  bindSeg('chModeSel', 'chm', 'chMode', 'chMode');         // chorus 2 lines / ensemble 3 phases
  bindSeg('reverbTypeSel', 'rt', 'reverbType', 'reverbType');   // reverb: hall (IR) / plate (Dattorro)
  bindSeg('fm4AlgSel', 'alg', 'fm4Alg', 'fm4Alg');              // FM4: algorithm (who modulates whom)
  bindSeg('uniVoicesSel', 'uv', 'uniVoices', 'uniVoices'); // unison: no. of copies per oscillator
  const ph = document.getElementById('lfoPhaseSel');   // LFOs: phase global / per voice (Weyl) / retrig / once (Roadmap 7.0 · 2.2)
  if (ph) bindSelect(ph, 'lfoPhase', [{ id: 'global', label: 'global' }, { id: 'voice', label: 'per voice' }, { id: 'retrig', label: 'retrig' }, { id: 'once', label: 'once' }]);
  const divs = [{ id: 'free', label: 'free' }, ...Object.keys(LFO_DIVS).map(d => ({ id: d, label: d }))];
  document.querySelectorAll('select.lfoSync').forEach(sel => bindSelect(sel, sel.dataset.sync, divs));   // tempo-synced LFO
  bindSeg('shimIntSel', 'shi', 'shimInt', 'shimInt');      // shimmer: pitch shifter interval (a Room key)
  bindFreeze();
  bindSeg('arpModeSel', 'arp', 'arpMode', 'arpMode');      // arpeggiator
  bindSeg('arpDivSel', 'div', 'arpDiv', 'arpDiv');
  bindSeg('arpOctSel', 'aoct', 'arpOct', 'arpOct');
  bindLfoShapes();

  // Wavetable selector (the sets live in engine/wavetable.js)
  const wtSel = document.getElementById('wtSetSel');
  if (wtSel) {
    for (const n of Object.keys(WT_SETS)) wtSel.add(new Option(n, n));
    wtSel.addEventListener('change', () => { part().resume(); applyTarget('wtSet', wtSel.value); });
    CONTROLS.wtSet = {
      get: () => wtSel.value,
      set: v => { if ([...wtSel.options].some(o => o.value === v)) wtSel.value = v; applyTarget('wtSet', wtSel.value); },
      def: PARAMS.wtSet.def, el: wtSel, opts: Object.keys(WT_SETS),
    };
    CONTROLS.wtSet.set(PARAMS.wtSet.def);
  }

  // Octave (oct: transposition −2..+2, in feet: 16' = sub-oscillator) and Stack
  // (octaves: 1-4 octaves upwards inside the oscillator): numeric selectors
  ['A', 'B'].forEach(s => {
    bindSeg('osc' + s + 'Oct', 'oct', 'oct' + s, 'osc' + s + '.oct', true);
    bindSeg('osc' + s + 'Stack', 'stk', 'octaves' + s, 'osc' + s + '.octaves', true);
  });
}
