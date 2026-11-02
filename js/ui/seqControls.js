/* SubSDJ · the Arpeggiator / Sequencer module: the Mode, the shared controls,
   the canvas step editor (edits the string param seqPat), the length stepper and
   the mutual exclusion of arp and seq. The phrase is offsets in semitones over the
   held key ('.' = rest).
   ONE MODULE, TWO ENGINES. Arp and Seq never run together (the engine gives the Seq
   priority), so the module shows them as one: a Mode knob (Off · Arp · Seq) over the
   real keys arpMode / seqOn, and Division, Gate and Latch as SHARED widgets that show
   and write the active mode's own key (arpDiv or seqDiv…). The presets keep both
   sets, as they always did: nothing is migrated. The Mode, the Direction and the shared
   widgets are VIRTUAL controls in CONTROLS (registry.js: MIDI learn binds them, they are
   never a preset key); the real keys keep the widgets as their `el` (label for undo,
   target for deps) with learn: false. arpMode carries the arp's direction only while
   the arp is on (off|up|down|updown|random): while it is off, the Direction knob keeps
   the last one (lastDir) — touching it prepares the arp without switching it on. */
import { part } from '../engine/parts.js';
import { PARAMS } from '../engine/params.js';
import { CONTROLS, applyTarget, bindSelect, HELD } from './registry.js';
import { userPhrases, savePhrase, deletePhrase, restorePhrase } from './phraseBank.js';
import { undoable } from './presetBank.js';
import { SCALES } from '../engine/Harmony.js';
import { bindSeg } from './oscControls.js';
import { attachKnob } from './knobs.js';
import { SEQ_MAX_STEPS, SEQ_OFF_MIN, SEQ_OFF_MAX, parsePattern, stepFreq, stepToken, convertPattern } from '../engine/Seq.js';

const say = t => { const m = document.getElementById('presetMsg'); if (m) m.textContent = t; };   // the header's floating notice
import { token, tint } from './theme.js';
import { fitCanvas, uiZoom } from './frame.js';

const tokensOf = () => part().S.seqPat.trim().split(/\s+/).filter(Boolean).slice(0, SEQ_MAX_STEPS);

// Bank of ready-made phrases (offsets over the root; div = recommended division).
// The selector is UI sugar: it only rewrites seqPat/seqDiv via CONTROLS.
export const SEQ_PATTERNS = [
  { name: 'Octaves',            pat: '0 12 0 12 0 12 0 12',                         div: '1/16' },
  { name: 'Acid Bass',          pat: '0 0 12 0 3 3 7 10',                           div: '1/16' },
  { name: 'Syncopated Acid',    pat: '0 . 0 12 . 10 3 .',                           div: '1/16' },
  { name: 'Minor Arpeggio',     pat: '0 3 7 12 . 7 3 .',                            div: '1/16' },
  { name: 'Major Arpeggio',     pat: '0 4 7 12 16 12 7 4',                          div: '1/16' },
  { name: 'Rolling Fifths',     pat: '0 7 . 7 0 7 10 7',                            div: '1/16' },
  { name: 'Trance Hook',        pat: '0 . 7 . 12 . 7 .',                            div: '1/16' },
  { name: 'Phrygian Descent',   pat: '12 . 10 . 7 . 1 0',                           div: '1/8' },
  { name: 'Two-Octave Stairs',  pat: '0 3 7 10 12 15 19 22 24 22 19 15 12 10 7 3', div: '1/16' },
  { name: 'Call and Response',  pat: '0 3 5 7 . 7 10 12 . 12 10 7 5 3 . .',        div: '1/16' },
  { name: 'Dembow Sub',         pat: '0 . . 0 . . 12 .',                            div: '1/8' },
  // With articulations (Roadmap 7.0 · 5.1): ! accent · ~ tie · / slide · x2-x4 repeats
  { name: 'Acid Slides',        pat: '0! 0 12/ 0 3 0! 10/ 7',                       div: '1/16' },
  { name: 'Questioning Acid',   pat: '0 0! . 0/ 12 . 3! 5/ 7 . 0 10! . 12/ 0 .',    div: '1/16' },
  { name: 'Long Ties',          pat: '0~ 0 7/ 5 3~ 3 . -2/',                         div: '1/8' },
  { name: 'Rolls',              pat: '0! . 0 0x2 0! . 0x3 0x4',                      div: '1/8' },
  // By degree (5.2): when chosen, if the notes are in semitones they switch to the major scale
  { grp: 'By degree', name: 'Scale Arpeggio',        pat: '0 2 4 7 4 2 0 -3',            div: '1/16', notes: 'major' },
  { grp: 'By degree', name: 'Scale Up and Down',     pat: '0 1 2 3 4 5 6 7 6 5 4 3 2 1 0 -1', div: '1/16', notes: 'major' },
  { grp: 'By degree', name: 'Rolling Thirds',        pat: '0 2 1 3 2 4 3 5',             div: '1/16', notes: 'major' },
  { name: 'Fanfare',            pat: '0 12 24 12 0 12 24 12',                       div: '1/16' },
  // Classics: famous synth riffs transcribed by ear (approximations, personal
  // use). Relative to the held key; bpm = tempo of the original.
  { grp: 'Classics', name: 'Blade Runner · Vangelis',  pat: '0 . 0 0 12 . 0 0 10 . 0 0 12 . 0 0', div: '1/16', bpm: 140 },
  { grp: 'Classics', name: 'Blade Runner · Sergio',  pat: '0 0 2 3', div: '1/16', bpm: 125 },
  { grp: 'Classics', name: 'Chase · Moroder',          pat: '0 7 12 7 0 7 12 7',                  div: '1/16', bpm: 130 },
  { grp: 'Classics', name: 'Stranger Things',          pat: '0 4 7 11 12 11 7 4',                 div: '1/16', bpm: 86 },
  { grp: 'Classics', name: 'Blue Monday · New Order',  pat: '0 0 0 0 0 0 0 0 0 0 0 0 -2 -2 -5 -5', div: '1/16', bpm: 130 },
  { grp: 'Classics', name: 'On The Run · Pink Floyd',  pat: '0 3 5 3 10 8 10 12',                 div: '1/16', bpm: 165 },
  { grp: 'Classics', name: 'The Robots · Kraftwerk',   pat: '0 . 0 12 . 0 . 12 0 . 0 12 10 . 7 .', div: '1/16', bpm: 110 },
  { grp: 'Classics', name: 'I Feel Love · Moroder',    pat: '0 12 0 12 0 12 0 12',                div: '1/16', bpm: 125 },
  { grp: 'Classics', name: 'The Model · Kraftwerk',    pat: '0 0 0 0 8 8 7 7',                    div: '1/8',  bpm: 106 },
  { grp: 'Classics', name: 'Axel F · Faltermeyer',     pat: '0 . . 3 . . 0 . 0 5 . 0 . -2 . .',   div: '1/16', bpm: 118 },
];

// ---------- Mode and the shared controls ----------
const DIRS = ['up', 'down', 'updown', 'random'];
const MODES = ['off', 'arp', 'seq'];
export const asModeOf = S => (S.seqOn === 'on' ? 'seq' : S.arpMode !== 'off' ? 'arp' : 'off');

function bindArpSeq() {
  const $ = id => document.getElementById(id);
  const modeSeg = $('asModeSel'), dirSeg = $('arpDirSel'), divSeg = $('asDivSel'), latchSeg = $('asLatchSel'), gateKnob = $('asGateKnob');
  if (!modeSeg || !dirSeg || !divSeg || !latchSeg || !gateKnob) return;
  const modeCtl = modeSeg.closest('.ctl'), dirCtl = dirSeg.closest('.ctl'), divCtl = divSeg.closest('.ctl'), gateCtl = gateKnob.closest('.ctl'), latchCtl = $('asLatchCtl');
  const KEYS = ['arpMode', 'seqOn', 'arpDiv', 'seqDiv', 'arpGate', 'seqGate', 'arpLatch', 'seqLatch'];
  const val = {};
  for (const k of KEYS) val[k] = PARAMS[k].def;
  let lastDir = 'up';     // the arp's direction while it is off
  let owner = 'arp';      // whose Division / Gate / Latch the shared widgets show: the active mode's, or the last one that was on
  const mode = () => asModeOf(val);
  const own = () => { const m = mode(); if (m !== 'off') owner = m; return owner; };
  const mark = (seg, attr, v) => { for (const b of seg.querySelectorAll('button')) b.classList.toggle('active', b.dataset[attr] === v); };

  let painting = true;    // the knob calls back on creation and on every repaint: only a hand on it writes
  // its range is the same for both; the default (double click) is the active mode's own (Arp 0.5 · Seq 0.6)
  const gateCfg = { min: PARAMS.seqGate.min, max: PARAMS.seqGate.max, get def() { return PARAMS[own() + 'Gate'].def; } };
  const gate = attachKnob(gateKnob, gateCfg, v => { if (!painting) CONTROLS[own() + 'Gate'].set(v); });
  const paint = () => {
    const o = own();
    painting = true;
    mark(modeSeg, 'asm', mode());
    mark(dirSeg, 'dir', val.arpMode !== 'off' ? val.arpMode : lastDir);
    mark(divSeg, 'v', val[o + 'Div']);
    mark(latchSeg, 'v', val[o + 'Latch']);
    gate.set(val[o + 'Gate']);
    painting = false;
  };

  // the REAL keys (presets, undo, the engine): their value, its write and a repaint
  const opts = { arpMode: ['off', ...DIRS], seqOn: ['off', 'on'], arpDiv: ['1/4', '1/8', '1/16'], seqDiv: ['1/4', '1/8', '1/16'], arpLatch: ['off', 'on'], seqLatch: ['off', 'on'] };
  const els = { arpMode: dirCtl, seqOn: modeCtl, arpDiv: divCtl, seqDiv: divCtl, arpGate: gateCtl, seqGate: gateCtl, arpLatch: latchCtl, seqLatch: latchCtl };
  for (const k of KEYS) {
    CONTROLS[k] = {
      get: () => val[k],
      set: v => {
        if (opts[k] && !opts[k].includes(v)) return;                   // an unknown value: stays as it is (like a seg)
        val[k] = v;
        if (k === 'arpMode' && v !== 'off') lastDir = v;
        applyTarget(k, v);
        paint();
      },
      def: PARAMS[k].def, el: els[k], learn: false, ...(opts[k] ? { opts: opts[k] } : {}),
    };
  }

  // the VIRTUAL controls (the widgets, for the hand and for MIDI learn): they write the real keys
  const setMode = m => {
    part().resume();
    if (m === 'off') { CONTROLS.arpMode.set('off'); CONTROLS.seqOn.set('off'); }
    else if (m === 'arp') { CONTROLS.seqOn.set('off'); CONTROLS.arpMode.set(lastDir); }
    else if (m === 'seq') { CONTROLS.arpMode.set('off'); CONTROLS.seqOn.set('on'); }
  };
  const setDir = d => { if (!DIRS.includes(d)) return; lastDir = d; if (mode() === 'arp') CONTROLS.arpMode.set(d); else paint(); };
  const shared = s => ({ get: () => val[own() + s], set: v => CONTROLS[own() + s].set(v) });
  CONTROLS.asMode = { get: mode, set: setMode, def: 'off', el: modeCtl, opts: MODES, virtual: true };
  CONTROLS.asDir = { get: () => (val.arpMode !== 'off' ? val.arpMode : lastDir), set: setDir, def: 'up', el: dirCtl, opts: DIRS, virtual: true };
  CONTROLS.asDiv = { ...shared('Div'), def: PARAMS.seqDiv.def, el: divCtl, opts: opts.seqDiv, virtual: true };
  CONTROLS.asGate = { ...shared('Gate'), def: PARAMS.seqGate.def, el: gateCtl, param: PARAMS.seqGate, virtual: true };
  CONTROLS.asLatch = { ...shared('Latch'), def: 'off', el: latchCtl, opts: opts.seqLatch, virtual: true };

  modeSeg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.asm)));
  dirSeg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => setDir(b.dataset.dir)));
  divSeg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { part().resume(); CONTROLS.asDiv.set(b.dataset.v); }));
  latchSeg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { part().resume(); CONTROLS.asLatch.set(b.dataset.v); }));
  for (const k of KEYS) CONTROLS[k].set(PARAMS[k].def);   // like a seg: the defaults reach the engine at startup
}

export function bindSeqControls() {
  bindArpSeq();
  bindSeg('seqRetrigSel', 'sretrig', 'seqRetrig', 'seqRetrig');

  // seqPat: the canvas editor is its only widget. No `el`: outside MIDI learn
  // (a CC can't edit a string; applyCC would swallow it with no effect anyway).
  CONTROLS.seqPat = {
    get: () => part().S.seqPat,
    set: v => applyTarget('seqPat', String(v ?? PARAMS.seqPat.def)),
    def: PARAMS.seqPat.def,
  };
  CONTROLS.seqPat.set(PARAMS.seqPat.def);

  const notes = document.getElementById('seqNotesSel');   // notes by degree (5.2)
  if (notes) {
    // Changing the units BY HAND rewrites the phrase so that it keeps its melody (Seq.convertPattern):
    // semitones → a scale turns it into degrees (notes outside the scale go to the nearest one), back
    // to semitones is exact, and scale → scale keeps the degrees (the phrase moves to the new mode).
    // A preset, the undo or a MIDI CC set the units as they are, without converting (they carry their phrase).
    // Registered BEFORE bindSelect and in the capture phase: it sees the units still unchanged.
    let notesNow = PARAMS.seqNotes.def;
    document.addEventListener('param-change', e => { if (e.detail.target === 'seqNotes') notesNow = e.detail.value; });
    notes.addEventListener('change', () => {
      const r = convertPattern(CONTROLS.seqPat.get(), notesNow, notes.value);
      if (r.pat !== CONTROLS.seqPat.get()) CONTROLS.seqPat.set(r.pat);
      if (r.moved) say(r.moved + (r.moved > 1 ? ' notes' : ' note') + ' outside the scale moved to the nearest degree');
    }, true);
    bindSelect(notes, 'seqNotes', [{ id: 'semitones', label: 'semitones' }, { id: 'harmony', label: 'degrees · harmony' },
      ...Object.keys(SCALES).map(k => ({ id: k, label: 'degrees · ' + k }))]);
  }
  initSeqEditor(document.getElementById('seqCanvas'));
  initSeqLen();
  initSeqPatterns();
  initLock();
  initMutex();
}

// Phrase selector: the factory phrases, YOURS («★ Mine», ui/phraseBank.js) and, at the end, two
// actions: save the phrase you have as yours (a popover asks its name) and delete yours. Choosing a
// phrase writes seqPat + its division + its UNITS (a phrase of yours comes back exactly as saved; a
// factory one by degrees keeps the scale you have on). Editing the pattern by hand shows «custom».
function initSeqPatterns() {
  const sel = document.getElementById('seqPatSel');
  if (!sel) return;
  const pop = document.getElementById('phrasePop'), inp = document.getElementById('phraseName'), go = document.getElementById('phraseSaveGo');
  const norm = s => String(s).trim().split(/\s+/).join(' ');
  const opt = (parent, v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; parent.appendChild(o); return o; };
  const group = label => { const og = document.createElement('optgroup'); og.label = label; sel.appendChild(og); return og; };
  const mine = () => { const cur = norm(CONTROLS.seqPat.get()), n = CONTROLS.seqNotes.get(); return userPhrases().findIndex(p => p.pat === cur && p.notes === n); };
  const factory = () => { const cur = norm(CONTROLS.seqPat.get()); return SEQ_PATTERNS.findIndex(p => norm(p.pat) === cur); };
  let chosen = '';   // the option last picked: several phrases can share the same steps, the one picked stays shown
  const sync = () => {
    const m = mine(), f = factory(), cur = norm(CONTROLS.seqPat.get());
    const keep = chosen && (chosen[0] === 'u' ? +chosen.slice(1) === m : SEQ_PATTERNS[+chosen] && norm(SEQ_PATTERNS[+chosen].pat) === cur);
    sel.value = keep ? chosen : m >= 0 ? 'u' + m : f >= 0 ? String(f) : '';
  };
  const build = () => {
    sel.textContent = '';
    opt(sel, '', '— custom —');
    const groups = new Map();
    SEQ_PATTERNS.forEach((p, i) => { const g = p.grp || 'Phrases'; if (!groups.has(g)) groups.set(g, group(g)); opt(groups.get(g), String(i), p.name); });
    const ups = userPhrases();
    if (ups.length) { const g = group('★ Mine'); ups.forEach((p, i) => opt(g, 'u' + i, p.name)); }
    const act = group('Your phrases');
    opt(act, '+save', 'Save this phrase as mine…');
    const m = mine();
    if (m >= 0) opt(act, '-del', 'Delete «' + ups[m].name + '»');
    sync();
  };

  // «save as mine»: the name in a popover under the selector (Enter saves, Esc or a click outside closes)
  const closeSave = () => { if (pop) pop.hidden = true; if (inp) inp.blur(); };
  const openSave = () => {
    if (!pop || !inp) return;
    const m = mine(), f = factory();
    inp.value = m >= 0 ? userPhrases()[m].name : f >= 0 ? SEQ_PATTERNS[f].name.split(' · ')[0] : '';
    pop.hidden = false; inp.focus(); inp.select();
  };
  const doSave = () => {
    const name = (inp.value || '').trim();
    if (!name) { inp.focus(); say('Save the phrase: type a name first.'); return; }
    const i = savePhrase({ name, pat: CONTROLS.seqPat.get(), div: CONTROLS.seqDiv.get(), notes: CONTROLS.seqNotes.get() });
    if (i >= 0) { chosen = 'u' + i; build(); say('Phrase «' + name + '» saved in ★ Mine (this browser; it travels with Export library).'); }
    closeSave();
  };
  if (go) go.addEventListener('click', doSave);
  if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSave(); } else if (e.key === 'Escape') { e.preventDefault(); closeSave(); } });
  document.addEventListener('pointerdown', e => { if (pop && !pop.hidden && !e.target.closest('#phraseWrap')) closeSave(); });
  document.addEventListener('escape-first', e => { if (pop && !pop.hidden) { e.preventDefault(); closeSave(); } });   // Esc closes it before being «panic»

  sel.addEventListener('change', () => {
    const v = sel.value;
    if (v === '+save') { sync(); openSave(); return; }
    if (v === '-del') {
      const ups = userPhrases(), m = mine();
      chosen = '';
      if (m >= 0) { const snap = deletePhrase(ups[m].name); undoable(document.getElementById('presetMsg'), 'Phrase «' + ups[m].name + '» deleted.', () => restorePhrase(snap)); }
      else sync();
      return;
    }
    if (v[0] === 'u') {                       // yours: exactly as saved (steps, division, units)
      const p = userPhrases()[+v.slice(1)];
      if (!p) { sync(); return; }
      part().resume();
      chosen = v;
      CONTROLS.seqNotes.set(p.notes);
      CONTROLS.seqPat.set(p.pat);
      CONTROLS.seqDiv.set(p.div);
      return;
    }
    const p = SEQ_PATTERNS[+v];
    if (!v || !p) { sync(); return; }         // «custom» overwrites nothing
    part().resume();
    chosen = v;
    CONTROLS.seqPat.set(p.pat);
    CONTROLS.seqDiv.set(p.div);
    // each phrase brings its units: one by degrees needs a scale (the one you have on, if any: degrees
    // travel between scales; else its own) and one in semitones sets semitones back — read as degrees
    // it would be another melody
    if (p.notes) { if (CONTROLS.seqNotes.get() === 'semitones') CONTROLS.seqNotes.set(p.notes); }
    else if (CONTROLS.seqNotes.get() !== 'semitones') CONTROLS.seqNotes.set('semitones');
    if (p.bpm) CONTROLS.bpm.set(p.bpm);       // the classics land on their tempo
  });
  // the steps or the units changed (by hand, a preset, undo…): the selection and «Delete» follow
  document.addEventListener('param-change', e => { if (e.detail.target === 'seqPat' || e.detail.target === 'seqNotes') build(); });
  document.addEventListener('phrases-changed', build);
  build();
}

// The module's LOCK (the «lock» in its title): while it is on, loading a preset or Reset leave every key
// of the Arpeggiator / Sequencer as it is (registry HELD) — the same sequence on other instruments.
export const AS_KEYS = ['arpMode', 'arpDiv', 'arpOct', 'arpGate', 'arpLatch', 'seqOn', 'seqPat', 'seqDiv', 'seqGate', 'seqLatch', 'seqRetrig', 'seqNotes'];
function initLock() {
  const b = document.getElementById('asLockBtn');
  if (!b) return;
  const set = on => {
    for (const k of AS_KEYS) { if (on) HELD.add(k); else HELD.delete(k); }
    b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on));
    b.title = (on ? 'Locked: changing preset (or Reset) leaves this module as it is' : 'Lock: changing preset (or Reset) leaves this whole module as it is')
      + ' — mode, phrase, division, gate, latch… — so you can hear the same sequence on other instruments. Off: each preset brings its own';
  };
  b.addEventListener('click', () => { set(!b.classList.contains('active')); say(b.classList.contains('active') ? 'Arpeggiator / Sequencer locked: presets keep out of it.' : 'Arpeggiator / Sequencer unlocked: each preset brings its own.'); });
  set(false);
}

// Step editor: columns = pattern tokens; vertical drag = pitch
// (quantized to semitones, −12..+24), short tap = toggles note/rest.
function initSeqEditor(canvas) {
  if (!canvas) return;
  const g = canvas.getContext('2d');
  const PAD = 8, SPAN = SEQ_OFF_MAX - SEQ_OFF_MIN;
  let W = 220, H = 110;                              // size in design px (fitCanvas: backing store at dpr × zoom)
  const fit = () => { ({ w: W, h: H } = fitCanvas(canvas, g, 220, 110)); };
  const yOf = off => (H - PAD) - ((off - SEQ_OFF_MIN) / SPAN) * (H - 2 * PAD);

  function draw() {
    fit();
    const w = W, h = H, steps = parsePattern(part().S.seqPat);
    const play = part().ready && part().seq.timer ? part().seq.playingStep() : -1;
    g.clearRect(0, 0, w, h);
    g.lineWidth = 1;
    g.strokeStyle = tint('--dim', .18);
    g.strokeRect(PAD, PAD, w - 2 * PAD, h - 2 * PAD);
    const hline = y => { g.beginPath(); g.moveTo(PAD, y); g.lineTo(w - PAD, y); g.stroke(); };
    g.strokeStyle = tint('--dim', .35); hline(yOf(0));                       // root
    const oct = part().ready ? part().seq.octaveSteps() : 12;                  // the octave: 12 semitones or the scale's degrees
    g.setLineDash([3, 4]); g.strokeStyle = tint('--dim', .22); hline(yOf(oct)); g.setLineDash([]);
    if (!steps.length) return;
    const cw = (w - 2 * PAD) / steps.length;
    g.font = '8px system-ui';
    steps.forEach((st, i) => {
      const x0 = PAD + i * cw;
      if (i) { g.strokeStyle = tint('--dim', .10); g.beginPath(); g.moveTo(x0, PAD); g.lineTo(x0, h - PAD); g.stroke(); }
      if (i === play) {                                // marker: the column sounding now
        g.fillStyle = tint('--accent', .12);
        g.fillRect(x0 + 1, PAD + 1, cw - 2, h - 2 * PAD - 2);
        g.fillStyle = token('--accent');
        g.fillRect(x0 + 1, PAD + 1, cw - 2, 2);
      }
      if (i % 4 === 0) { g.fillStyle = tint('--dim', .6); g.fillText(String(i + 1), x0 + 2, PAD + 8); }
      const xa = x0 + cw * 0.18, xb = x0 + cw * 0.82;
      if (st) {
        const y = yOf(st.off), y0 = yOf(0);
        g.fillStyle = tint('--accent', .22);
        g.fillRect(xa, Math.min(y, y0), xb - xa, Math.max(2, Math.abs(y - y0)));  // stem down to the root
        // cap: the step's pitch. Accent = thicker and in the star color;
        // repeats = the cap split into as many pieces as hits
        const capH = st.accent ? 5 : 3, n = st.rep, seg = (xb - xa) / n;
        g.fillStyle = st.accent ? token('--star') : token('--accent');
        for (let k = 0; k < n; k++) g.fillRect(xa + k * seg + (k ? 1 : 0), y - capH / 2, seg - (n > 1 ? 1 : 0), capH);
        if (st.tie || st.slide) {                      // tie: horizontal line · slide: diagonal up to the next one's pitch
          const nx = steps[(i + 1) % steps.length], xn = PAD + (i + 1) * cw + cw * 0.18;
          g.strokeStyle = token('--accent'); g.lineWidth = 1.5; g.beginPath(); g.moveTo(xb, y);
          g.lineTo(xn, st.slide && nx ? yOf(nx.off) : y); g.stroke(); g.lineWidth = 1;
        }
      } else {
        g.fillStyle = tint('--dim', .35);
        g.fillRect(xa, h - PAD - 3, xb - xa, 2);                                  // rest: mark at the base
      }
    });
  }

  // Preview while editing: the note of the step you are setting sounds
  // (reference root C4). If the phrase is ALREADY playing, the loop guides you.
  let prevTimer = null;
  function preview(off) {
    if (!part().ready || part().seq.timer) return;
    if (part().S.mode === 'mono' && part().heldStack.length) return;   // don't steal a mono voice in use
    part()._directOn('seqprev', stepFreq(261.63, part().seq.semis(off, 261.63)), 0.8);   // with degrees, its note in the scale
    clearTimeout(prevTimer);
    prevTimer = setTimeout(() => part()._directOff('seqprev'), 180);
  }

  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    part().resume();
    const toks = tokensOf();
    if (!toks.length) return;
    const rect = canvas.getBoundingClientRect();
    const cw = (W - 2 * PAD) / toks.length;
    const step = Math.max(0, Math.min(toks.length - 1, Math.floor(((e.clientX - rect.left) / uiZoom() - PAD) / cw)));
    const st = parsePattern(part().S.seqPat)[step];
    // articulations (Roadmap 7.0 · 5.1), on a step with a note: Shift = accent,
    // Alt = tie → slide → none, Ctrl = repeats 1 → 2 → 3 → 4
    if (st && (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey)) {
      const nx = { ...st };
      if (e.shiftKey) nx.accent = !st.accent;
      else if (e.altKey) { nx.tie = !st.tie && !st.slide; nx.slide = st.tie; }
      else nx.rep = st.rep % 4 + 1;
      toks[step] = stepToken(nx);
      CONTROLS.seqPat.set(toks.join(' '));
      e.preventDefault();
      return;
    }
    drag = { step, startY: e.clientY, startOff: st ? st.off : 0, wasRest: !st, st, moved: false };
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const dy = (drag.startY - e.clientY) / uiZoom();
    if (Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    const pxPerSemi = (H - 2 * PAD) / SPAN;
    const off = Math.max(SEQ_OFF_MIN, Math.min(SEQ_OFF_MAX, Math.round(drag.startOff + dy / pxPerSemi)));
    const toks = tokensOf();
    if (toks[drag.step] === String(off)) return;     // only when the semitone changes
    toks[drag.step] = drag.st ? stepToken({ ...drag.st, off }) : String(off);   // keeps its marks; dragging a rest turns it into a note
    CONTROLS.seqPat.set(toks.join(' '));
    preview(off);
  });
  const end = e => {
    if (!drag) return;
    if (!drag.moved) {                               // short tap: toggles note <-> rest
      const toks = tokensOf();
      toks[drag.step] = drag.wasRest ? '0' : '.';
      CONTROLS.seqPat.set(toks.join(' '));
      if (drag.wasRest) preview(0);
    }
    drag = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  document.addEventListener('param-change', e => { if (e.detail.target === 'seqPat' || e.detail.target === 'seqNotes') draw(); });
  window.addEventListener('resize', draw);           // screens.js fires resize on tab change
  let lastPlay = -1;                                 // marker: redraws only when the step changes
  setInterval(() => {
    const p = part().ready && part().seq.timer ? part().seq.playingStep() : -1;
    if (p !== lastPlay) { lastPlay = p; draw(); }
  }, 40);
  draw();
}

// Length stepper: rewrites the string (+ adds a rest, − removes the last one)
function initSeqLen() {
  const num = document.getElementById('seqLenNum');
  const sync = () => { if (num) num.textContent = tokensOf().length; };
  document.getElementById('seqLenInc').addEventListener('click', () => {
    const t = tokensOf(); if (t.length >= SEQ_MAX_STEPS) return;
    t.push('.'); CONTROLS.seqPat.set(t.join(' '));
  });
  document.getElementById('seqLenDec').addEventListener('click', () => {
    const t = tokensOf(); if (t.length <= 1) return;
    t.pop(); CONTROLS.seqPat.set(t.join(' '));
  });
  document.addEventListener('param-change', e => { if (e.detail.target === 'seqPat') sync(); });
  sync();
}

// Arp and seq make no sense at the same time: switching one on switches the other off.
function initMutex() {
  let busy = false;
  document.addEventListener('param-change', e => {
    if (busy) return;
    const { target, value } = e.detail;
    busy = true;
    try {
      if (target === 'seqOn' && value === 'on' && CONTROLS.arpMode.get() !== 'off') CONTROLS.arpMode.set('off');
      if (target === 'arpMode' && value !== 'off' && CONTROLS.seqOn.get() === 'on') CONTROLS.seqOn.set('off');
    } finally { busy = false; }
  });
}
