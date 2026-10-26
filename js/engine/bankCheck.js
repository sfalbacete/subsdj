/* =====================================================================
   SubSDJ · checks on the factory bank (docs/BANK.md). No DOM and no engine:
   the selftest runs them in the browser and tools/bank-report.mjs from Node.
     validateBank()  metadata: unique short names, a `play` line, tags from
                     TAGS, a valid `use`, keys the registry knows, the Ring and
                     cutLFO rules
     coverage()      which FEATURES of the synth the bank uses, and which it
                     does not: every wave, filter type, LFO shape, matrix source
                     and destination… has to be shown by at least one preset
   A feature is read on the EFFECTIVE value (the preset over PRESET_BASE and
   the defaults), and only when it can be heard: oscillator B counts if its
   level is up, an LFO shape if that LFO has a level or feeds the matrix.
   ===================================================================== */
import { BANK, TAGS } from './presets.js';
import { PARAMS, PRESET_BASE, MX_SLOTS, MX_SOURCES, MX_DESTS, LFO_KEYS } from './params.js';

export const MAX_NAME = 32;
export const USES = ['note', 'chord', 'hit'];

export function validateBank(isKnownKey = k => k in PARAMS) {
  const problems = [], seen = new Set();
  for (const c of BANK) for (const p of c.presets) {
    const who = c.cat + ' / ' + p.name, d = p.data;
    if (!p.name || p.name.length > MAX_NAME) problems.push(who + ': name missing or longer than ' + MAX_NAME);
    if (seen.has(p.name)) problems.push(who + ': duplicate name');
    seen.add(p.name);
    if (!USES.includes(p.use)) problems.push(who + ': use «' + p.use + '»');
    if (p.root !== undefined && !(p.root >= 0 && p.root <= 127)) problems.push(who + ': root ' + p.root);
    if (typeof p.play !== 'string' || !p.play.trim()) problems.push(who + ': no play line');
    if (!Array.isArray(p.tags)) problems.push(who + ': tags are not a list');
    else {
      for (const t of p.tags) if (!TAGS.includes(t)) problems.push(who + ': tag «' + t + '» is not in the vocabulary');
      if (!p.tags.length && p.name !== 'Init') problems.push(who + ': no tags');
    }
    if (!d || typeof d !== 'object') { problems.push(who + ': no data'); continue; }
    for (const k in d) if (!isKnownKey(k)) problems.push(who + ': unknown key «' + k + '»');
    if ('mix' in d) problems.push(who + ': Mix (pre-mixer preset)');
    if (d.ring > 0 && !('levelA' in d && 'levelB' in d)) problems.push(who + ': Ring without levels (it would be read as an old one)');
    if (d.cutLfoLvl > 0 && eff(d, 'cutoff') - d.cutLfoLvl < 150) problems.push(who + ': cutoff − cutLfoLvl under 150 Hz (the filter would close every half cycle)');
  }
  return problems;
}

// effective value of a key: the preset, else the preset base, else the neutral default
export const eff = (d, k) => (k in d ? d[k] : k in PRESET_BASE ? PRESET_BASE[k] : PARAMS[k] ? PARAMS[k].def : undefined);

const WAVES = ['sine', 'triangle', 'sawtooth', 'square', 'supersaw', 'wavetable', 'fm4', 'string'];
const WT_SETS = ['analog', 'organ', 'formant', 'metallic', 'glottal'];
const SHAPES = ['sine', 'triangle', 'sawtooth', 'square', 'sh', 'drift'];
const LFO_SRC = { cut: 'lfoCut', res: 'lfoRes', amp: 'lfoAmp', freq: 'lfoFreq', pwm: 'lfoPwm' };
const slots = d => { const o = []; for (let i = 1; i <= MX_SLOTS; i++) { const s = eff(d, 'mx' + i + 'src'); if (s !== 'off' && eff(d, 'mx' + i + 'amt')) o.push({ src: s, dst: eff(d, 'mx' + i + 'dst') }); } return o; };
const usesSrc = (d, id) => slots(d).some(s => s.src === id);
const usesDst = (d, id) => slots(d).some(s => s.dst === id);
const soundsA = d => eff(d, 'levelA') > 0, soundsB = d => eff(d, 'levelB') > 0;
const wave = (d, w) => (soundsA(d) && eff(d, 'waveA') === w) || (soundsB(d) && eff(d, 'waveB') === w);
// an LFO is heard if its level is up or the matrix reads it raw
const lfoOn = (d, k) => (k !== 'pan' && eff(d, k + 'LfoLvl') > 0) || (k === 'pan' && eff(d, 'panLfoLvl') > 0) || (LFO_SRC[k] && usesSrc(d, LFO_SRC[k]));
const lfoShape = (d, s) => LFO_KEYS.some(k => k !== 'pan' && lfoOn(d, k) && eff(d, k + 'LfoShape') === s);
const seqTok = (d, re) => eff(d, 'seqOn') === 'on' && re.test(eff(d, 'seqPat'));

export const FEATURES = [
  ...WAVES.map(w => ({ id: 'wave:' + w, label: 'wave ' + w, test: d => wave(d, w) })),
  ...WT_SETS.map(s => ({ id: 'wt:' + s, label: 'table ' + s, test: d => wave(d, 'wavetable') && eff(d, 'wtSet') === s })),
  { id: 'sync', label: 'hard sync', test: d => eff(d, 'syncA') === 'on' },
  { id: 'unison', label: 'unison', test: d => +eff(d, 'uniVoices') > 1 },
  { id: 'octaves', label: 'octave stack', test: d => eff(d, 'octavesA') > 1 || eff(d, 'octavesB') > 1 },
  { id: 'oct', label: 'oscillator octave', test: d => eff(d, 'octA') !== 0 || eff(d, 'octB') !== 0 },
  { id: 'ring', label: 'ring modulation', test: d => eff(d, 'ring') > 0 },
  { id: 'noise', label: 'noise', test: d => eff(d, 'noise') > 0 },
  { id: 'drift', label: 'oscillator drift', test: d => eff(d, 'drift') > 0 },
  { id: 'fm', label: 'FM (2 operators)', test: d => eff(d, 'fmIndex') > 0 || usesDst(d, 'fm') },
  { id: 'fmFb', label: 'FM feedback', test: d => eff(d, 'fmFb') > 0 },
  { id: 'fm4vel', label: 'FM4 operator velocity', test: d => wave(d, 'fm4') && [1, 2, 3, 4].some(i => eff(d, 'fm4V' + i) > 0) },
  { id: 'pwm', label: 'PWM', test: d => eff(d, 'pwmLfoLvl') > 0 },
  { id: 'tremolo', label: 'tremolo LFO', test: d => eff(d, 'ampLfoLvl') > 0 },
  { id: 'vibrato', label: 'vibrato LFO', test: d => eff(d, 'freqLfoLvl') > 0 },
  { id: 'lfoFade', label: 'LFO fade-in', test: d => eff(d, 'lfoFade') > 0 },
  { id: 'cutLfo', label: 'cutoff LFO (dedicated)', test: d => eff(d, 'cutLfoLvl') > 0 },
  { id: 'resLfo', label: 'resonance LFO', test: d => eff(d, 'resLfoLvl') > 0 },
  { id: 'panLfo', label: 'autopan', test: d => eff(d, 'panLfoLvl') > 0 },
  ...SHAPES.map(s => ({ id: 'lfo:' + s, label: 'LFO shape ' + s, test: d => lfoShape(d, s) })),
  { id: 'lfoSync', label: 'LFO in tempo', test: d => LFO_KEYS.some(k => lfoOn(d, k) && eff(d, k + 'LfoSync') !== 'free') },
  ...['voice', 'retrig', 'once'].map(m => ({ id: 'phase:' + m, label: 'LFO phase ' + m, test: d => eff(d, 'lfoPhase') === m })),
  { id: 'filter:bp', label: 'band-pass filter', test: d => eff(d, 'filterType') === 'bp' },
  { id: 'filter:notch', label: 'notch filter', test: d => eff(d, 'filterType') === 'notch' },
  { id: 'morph', label: 'LP↔HP morph', test: d => eff(d, 'filterType') === 'morph' && eff(d, 'morph') > 0 },
  { id: 'slope24', label: '24 dB slope', test: d => eff(d, 'filterSlope') === '24' },
  { id: 'drive', label: 'drive', test: d => eff(d, 'filterDrive') > 0 },
  { id: 'fold', label: 'wavefolder', test: d => eff(d, 'filterDrive') > 0 && eff(d, 'driveChar') === 'fold' },
  { id: 'asym', label: 'drive asymmetry', test: d => eff(d, 'filterDrive') > 0 && eff(d, 'driveAsym') > 0 },
  { id: 'keytrack', label: 'key tracking', test: d => eff(d, 'keytrack') > 0 },
  { id: 'fenv', label: 'filter envelope', test: d => eff(d, 'filterEnvAmt') !== 0 },
  { id: 'fenvOwn', label: 'own filter envelope', test: d => eff(d, 'fenvMode') === 'own' },
  ...['normal', 'loop', 'trigger'].map(m => ({ id: 'envm:' + m, label: 'mod env ' + m, test: d => usesSrc(d, 'envm') && eff(d, 'envmMode') === m })),
  { id: 'vocal', label: 'vocal (formants)', test: d => eff(d, 'vocAmt') > 0 },
  { id: 'vocAtk', label: 'consonant bite', test: d => eff(d, 'vocAmt') > 0 && eff(d, 'vocAtk') > 0 },
  { id: 'vocLife', label: 'formant drift (Life)', test: d => eff(d, 'vocAmt') > 0 && eff(d, 'vocLife') > 0 },
  { id: 'resonator', label: 'modal resonator', test: d => eff(d, 'resAmt') > 0 },
  { id: 'dist', label: 'distortion', test: d => eff(d, 'dist') > 0 },
  { id: 'flanger', label: 'flanger', test: d => eff(d, 'flAmt') > 0 },
  { id: 'chorus', label: 'chorus', test: d => eff(d, 'chAmt') > 0 && eff(d, 'chMode') === 'chorus' },
  { id: 'ensemble', label: 'ensemble', test: d => eff(d, 'chAmt') > 0 && eff(d, 'chMode') === 'ensemble' },
  { id: 'delay', label: 'delay', test: d => eff(d, 'dlyAmt') > 0 },
  { id: 'dlySync', label: 'delay in tempo', test: d => eff(d, 'dlyAmt') > 0 && eff(d, 'dlySync') !== 'free' },
  { id: 'dlyDamp', label: 'delay damping', test: d => eff(d, 'dlyAmt') > 0 && eff(d, 'dlyDamp') > 0 },
  { id: 'dlyWow', label: 'delay wow', test: d => eff(d, 'dlyAmt') > 0 && eff(d, 'dlyWow') > 0 },
  { id: 'dlyFb', label: 'delay feedback ≥ 80 %', test: d => eff(d, 'dlyAmt') > 0 && eff(d, 'dlyFb') >= 0.8 },
  { id: 'dlySat', label: 'delay loop saturation', test: d => eff(d, 'dlyAmt') > 0 && eff(d, 'dlySat') > 0 },
  { id: 'reverb:hall', label: 'hall reverb', test: d => eff(d, 'reverbMix') > 0 && eff(d, 'reverbType') === 'hall' },
  { id: 'reverb:plate', label: 'plate reverb', test: d => eff(d, 'reverbMix') > 0 && eff(d, 'reverbType') === 'plate' },
  { id: 'shimmer', label: 'shimmer', test: d => eff(d, 'reverbMix') > 0 && eff(d, 'shimAmt') > 0 },
  { id: 'tapeSat', label: 'tape saturation', test: d => eff(d, 'tapeSat') > 0 },
  { id: 'tapeWow', label: 'tape wow', test: d => eff(d, 'tapeWow') > 0 },
  { id: 'width', label: 'stereo width', test: d => eff(d, 'width') > 0 },
  { id: 'envCurve', label: 'RC envelope curve', test: d => eff(d, 'envCurve') > 0 },
  { id: 'flam', label: 'flam', test: d => eff(d, 'hits') > 1 },
  { id: 'glide', label: 'glide', test: d => eff(d, 'glide') > 0 },
  { id: 'pitchEnv', label: 'pitch envelope', test: d => eff(d, 'pitchEnvAmt') !== 0 },
  { id: 'mono', label: 'mono mode', test: d => eff(d, 'mode') === 'mono' },
  ...['up', 'down', 'updown', 'random'].map(m => ({ id: 'arp:' + m, label: 'arpeggiator ' + m, test: d => eff(d, 'arpMode') === m })),
  { id: 'seq', label: 'sequencer', test: d => eff(d, 'seqOn') === 'on' },
  { id: 'seq:accent', label: 'sequencer accent (!)', test: d => seqTok(d, /!/) },
  { id: 'seq:tie', label: 'sequencer tie (~)', test: d => seqTok(d, /~/) },
  { id: 'seq:slide', label: 'sequencer slide (/)', test: d => seqTok(d, /\//) },
  { id: 'seq:repeat', label: 'sequencer repeats (x2…)', test: d => seqTok(d, /x[234]/) },
  { id: 'ws:loop', label: 'wave sequence (loop)', test: d => eff(d, 'wsOn') === 'on' && eff(d, 'wsMode') === 'loop' },
  { id: 'ws:1shot', label: 'wave sequence (1-shot)', test: d => eff(d, 'wsOn') === 'on' && eff(d, 'wsMode') === '1shot' },
  { id: 'swing', label: 'swing', test: d => eff(d, 'swing') > 0.5 },
  ...MX_SOURCES.filter(s => s.id !== 'off').map(s => ({ id: 'src:' + s.id, label: 'matrix source ' + s.label, test: d => usesSrc(d, s.id) })),
  ...MX_DESTS.map(t => ({ id: 'dst:' + t.id, label: 'matrix destination ' + t.label, test: d => usesDst(d, t.id) })),
];

// { features: [{id, label, presets: [names]}], holes: [ids] }
export function coverage(bank = BANK) {
  const features = FEATURES.map(f => ({ id: f.id, label: f.label, presets: [] }));
  for (const c of bank) for (const p of c.presets) {
    if (!p.data || !Object.keys(p.data).length) continue;   // Init
    FEATURES.forEach((f, i) => { let hit = false; try { hit = !!f.test(p.data); } catch (e) { hit = false; } if (hit) features[i].presets.push(p.name); });
  }
  return { features, holes: features.filter(f => !f.presets.length).map(f => f.id) };
}
