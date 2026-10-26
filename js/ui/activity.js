/* SubSDJ · activity LEDs: which parts of the synth are DOING something.
   "Active" is computable: almost every amount has 0 as its inert value
   (those params carry act:true in PARAMS, which also dims their knob).
   One LED per section (in the h2) and another per row of the LFO bank. NOTE: an LFO counts
   as active if its Level > 0 OR if some matrix slot uses it raw.
   Event-driven: listens to the 'param-change' the registry already emits and
   recomputes with a one-frame debounce — no polling. */
import { part } from '../engine/parts.js';
import { MX_SLOTS } from '../engine/params.js';

const srcUsed = (S, id) => { for (let i = 1; i <= MX_SLOTS; i++) if (S['mx' + i + 'src'] === id && S['mx' + i + 'amt']) return true; return false; };
const dstUsed = (S, id) => { for (let i = 1; i <= MX_SLOTS; i++) if (S['mx' + i + 'src'] !== 'off' && S['mx' + i + 'dst'] === id && S['mx' + i + 'amt']) return true; return false; };
const mxAny   = S => { for (let i = 1; i <= MX_SLOTS; i++) if (S['mx' + i + 'src'] !== 'off' && S['mx' + i + 'amt']) return true; return false; };

// Rows of the LFO bank (by their data-lfo, immune to the titles).
const LFOS = {
  pwm:  S => S.pwmLfoLvl > 0 || srcUsed(S, 'lfoPwm'),
  amp:  S => S.ampLfoLvl > 0 || srcUsed(S, 'lfoAmp'),
  freq: S => S.freqLfoLvl > 0 || srcUsed(S, 'lfoFreq'),
  cut:  S => S.cutLfoLvl > 0 || srcUsed(S, 'lfoCut'),
  res:  S => S.resLfoLvl > 0 || srcUsed(S, 'lfoRes'),
  pan:  S => S.panLfoLvl > 0,
};
const anyWave = (S, w) => S.oscA.wave === w || S.oscB.wave === w;
// Sections (by the h2 title — NOTE: renaming an h2 means touching this):
// "something is moving here" — extras on top of the base path (the filter or the ADSR
// always exist; the LED marks movement). Each row of the LFO bank
// also carries its own LED.
const PANELS = {
  'Mixer':           S => S.ring > 0 || S.noise > 0 || S.drift > 0 || ['lvlA', 'lvlB', 'lvlRing', 'lvlNoise'].some(d => dstUsed(S, d)),
  'FM':              S => S.fmIndex > 0 || dstUsed(S, 'fm'),
  'FM4':             S => anyWave(S, 'fm4'),
  'Unison':          S => +S.uniVoices > 1,
  'Wavetable':       S => anyWave(S, 'wavetable'),
  'Vocal':           S => S.vocAmt > 0,
  'Resonator':       S => S.resAmt > 0,
  'Filter':          S => dstUsed(S, 'cutoff') || dstUsed(S, 'reso') || S.filterDrive > 0 || S.keytrack > 0,
  'Filter Env':      S => S.filterEnvAmt !== 0,
  'Mod Env':         S => srcUsed(S, 'envm'),
  'Steps':           S => [1, 2, 3, 4].some(i => srcUsed(S, 'st' + i) || srcUsed(S, 'st' + i + 'n')),
  'Voice · Master':  S => S.pitchEnvAmt !== 0 || S.glide > 0 || S.freqCents !== 0,
  'LFOs':            S => Object.values(LFOS).some(f => f(S)),
  'Matrix':          mxAny,
  'Dist · Flanger':  S => S.dist > 0 || S.flAmt > 0,
  'Chorus':          S => S.chAmt > 0,
  'Delay':           S => S.dlyAmt > 0,
  'Reverb':          S => S.reverbMix > 0,
  'Tape':            S => S.tapeSat > 0 || S.tapeWow > 0,
  'Stereo':          S => S.width > 0 || dstUsed(S, 'pan'),
  'Arpeggiator':     S => S.arpMode !== 'off',
  'Sequencer':       S => S.seqOn === 'on',
};
// (What does NOTHING with the current settings is dimmed in ui/deps.js.)

export function initActivity() {
  const leds = [];
  const mkLed = () => { const s = document.createElement('span'); s.className = 'led'; return s; };
  for (const h2 of document.querySelectorAll('.panel h2')) {
    const test = PANELS[h2.textContent.trim()];
    if (test) { const led = mkLed(); h2.prepend(led); leds.push({ el: led, test }); }
  }
  for (const row of document.querySelectorAll('.lfo-row[data-lfo]')) {
    const test = LFOS[row.dataset.lfo], rn = row.querySelector('.rn');
    if (test && rn) { const led = mkLed(); rn.prepend(led); leds.push({ el: led, test }); }
  }
  let pending = false;
  const refresh = () => {
    pending = false;
    const S = part().S;
    for (const l of leds) l.el.classList.toggle('on', !!l.test(S));
  };
  document.addEventListener('param-change', () => {
    if (!pending) { pending = true; requestAnimationFrame(refresh); }
  });
  refresh();
}
