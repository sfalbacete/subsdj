/* =====================================================================
   SubSDJ · generative scene UI: «Harmony» module (root, scale,
   progression, list/functions mode, seed, ▶ Play), «Player» (the one of the
   part the rack is editing: mode + its knobs; its arrangement,
   Enters / Drift, is a row of the Arrangement module)
   and «Arrangement» (energy, sway, cycle, open, surprise + the SCENE:
   ⇩ export, ⇧ import; the scene in progress survives closing the page with the
   rest of the session, ui/session.js).
   Only visible with the scene on (partsControls shows/hides them).
   The settings live in the scene's conductor (engine/Conductor.js), not
   in the presets: the preset is the instrument, the player is the musician.
   PATTERN (2026-11-12): the mode whose notes are yours. Instead of knobs it shows
   the take's buttons (Rec loop · + Dub · ↶ ↷ · Clear), the loop's Bars and Quantize, and
   a read-only view of the loop with its playhead; the same controls head the
   «Pattern» screen, where the loop is edited (ui/patternEditor.js) — every control
   is found by its data-pat, wherever it is. Rec loop only ARMS: the take starts with
   the first key (no count-in). A take listens to the live keys through
   parts.setNoteTap; the notes sound their usual way. It ends by pressing the button
   again, and by anything that takes the ground from under it: stopping the players,
   choosing another part, loading a scene, switching Parts off.
   ===================================================================== */
import { part, getScene, sceneOn, sceneToJSON, applySceneJSON, enableScene, setNoteTap, partLabel } from '../engine/parts.js';
import { SCALES, NOTE_NAMES, DEGREES, parseProg, PROGRESSIONS, progressionIndex } from '../engine/Harmony.js';
import { PLAYER_MODES, DRIFT_KEYS, PAT_MAX_BARS, PAT_EARLY, patStart } from '../engine/Player.js';
import { showScreen, currentScreen } from './screens.js';
import { library, SEC_SCENES, MAX_NAME } from '../engine/library.js';
import { inferHarmony } from '../engine/inferHarmony.js';
import { setUndoAlt, refreshHistory } from './history.js';
import { BEATS_PER_BAR as BAR } from '../engine/Conductor.js';
import { fitCanvas } from './frame.js';
import { token } from './theme.js';
import { setClick, clickOn } from './tempo.js';
import { attachKnob } from './knobs.js';
import { CONTROLS } from './registry.js';
import { download } from './recorder.js';

const $ = id => document.getElementById(id);
const conductor = () => { const sc = getScene(); return sc ? sc.conductor : null; };
const int = v => String(Math.round(v));
// knobs per mode: [key, label, min, max, integer?]
const KNOBS = {
  pulse:   [['k', 'Hits', 1, 16, 1], ['n', 'Steps', 4, 32, 1], ['rot', 'Rot', 0, 31, 1], ['prob', 'Prob', 0, 1],
            ['gate', 'Gate', 0.05, 1], ['accent', 'Accent', 0, 1], ['oct', 'Oct', 1, 7, 1], ['vel', 'Vel', 0.1, 1],
            ['breathe', 'Breathe', 0, 8, 1], ['breatheCycle', 'Cycle', 2, 16, 1]],   // the breathing pulse (Roadmap 7.0 · 5.4); its «Fixed» is the button in the module's header (no room for an 11th knob)
  chord:  [['notes', 'Notes', 3, 4, 1], ['oct', 'Oct', 1, 7, 1], ['vel', 'Vel', 0.1, 1]],
  melody: [['density', 'Density', 0, 1], ['rest', 'Rest', 0, 1], ['gravity', 'Gravity', 0, 1],
            ['range', 'Range', 1, 3, 1], ['legato', 'Legato', 0.1, 1], ['oct', 'Oct', 1, 7, 1], ['vel', 'Vel', 0.1, 1]],
  root:    [['fifth', 'Fifth', 0, 1, 1], ['every', 'Every', 1, 8, 1], ['oct', 'Oct', 1, 7, 1], ['vel', 'Vel', 0.1, 1]],
};
const ARR_KNOBS = [['energy', 'Energy', 0, 1], ['sway', 'Sway', 0, 1], ['cycle', 'Cycle', 4, 64, 1],
                   ['open', 'Open', 0, 1], ['surprise', 'Surprise', 0, 1]];
let infoTimer = null;
// the conductor's settings don't go through the registry: they notify ui/deps.js (what is off) by hand
const depsRefresh = () => document.dispatchEvent(new Event('deps-refresh'));

const knobEl = lab => { const ctl = document.createElement('div'); ctl.className = 'ctl';
  ctl.innerHTML = `<div class="knob"><div class="ind"></div></div><div class="lab">${lab}</div><div class="val"></div>`; return ctl; };
// small knob with the label in front (the compact rows: the part's arrangement)
const ksEl = lab => { const ctl = document.createElement('div'); ctl.className = 'ctl ks'; ctl.dataset.lab = lab;
  ctl.innerHTML = `<span class="th">${lab}</span><div class="knob"><div class="ind"></div></div><div class="val"></div>`; return ctl; };
function knobRow(host, specs, cfg, onSet) {
  host.innerHTML = '';
  for (const [key, lab, min, max, isInt] of specs) {
    const ctl = knobEl(lab); ctl.dataset.key = key; host.appendChild(ctl);
    attachKnob(ctl.querySelector('.knob'), { min, max, def: cfg[key], fmt: isInt ? int : undefined },
               v => { cfg[key] = isInt ? Math.round(v) : v; if (onSet) onSet(key, cfg[key]); depsRefresh(); });
  }
}
function currentPlayer() { const sc = getScene(); return sc ? sc.conductor.players[sc.sel] : null; }

// ---------- pattern: takes ----------
let rec = null;      // the take from this UI: { pl, click, armed } (armed: waiting for the first key; click: the Click was switched on for it)
let patRaf = 0;
export const patRecording = () => !!rec;
export const patArmed = () => !!rec && rec.armed;
export const patPlayer = currentPlayer;
const pats = name => document.querySelectorAll('[data-pat="' + name + '"]');   // a control of the loop, in the Player module and on the Pattern screen
// The first key of an armed take. Stopped: the players start and that key is beat 0 of bar 1 (with the Click already
// running, its nearest beat: you were playing to it). Playing: the take is the bar the key falls in — or the next
// one, if it comes up to PAT_EARLY beats before its line.
function beginTake() {
  const pl = rec.pl, c = pl.c, now = c.ctx.currentTime;
  rec.armed = false;
  let origin = 0;
  if (!c.running) setPlaying(true, clickOn() ? c.clock.timeAt(Math.round(c.clock.beatAt(now))) : now);
  else { const b = c.beatAt(now), bar = Math.floor(b / BAR) * BAR; origin = b - bar > BAR - PAT_EARLY ? bar + BAR : bar; }
  pl.startTake(origin, false);
  if (!clickOn()) { setClick(true); rec.click = clickOn(); }   // a new loop has nothing to play against: the click, for the take only
  paintPat();
}
function tapKey(on, id, freq, vel) {
  if (!rec) return;
  if (rec.armed) { if (!on) return; beginTake(); }
  const pl = rec.pl, t = pl.c.ctx.currentTime;
  if (on) pl.recOn(id, 69 + 12 * Math.log2(freq / 440), vel, t); else pl.recOff(id, t);
}
// Rec loop arms a new take (it starts with the first key); + Dub starts adding to the loop at once
export function patRecStart(dub = false) {
  const c = conductor(), pl = currentPlayer();
  if (!c || !pl || rec) return false;
  part().resume();
  if (pl.cfg.mode !== 'pattern') pl.setMode('pattern');
  dub = dub && !!(pl.cfg.pat && pl.cfg.pat.notes.length);
  if (dub) { if (!c.running && !setPlaying(true)) return false; pl.startTake(0, true); }
  rec = { pl, click: false, armed: !dub };
  setNoteTap(tapKey);
  buildPlayerUI();
  return true;
}
export function patRecStop() {
  if (!rec) return;
  const { pl, click } = rec;
  rec = null; setNoteTap(null);
  if (pl.take) pl.endTake(pl.c.ctx.currentTime);
  if (click) setClick(false);
  if (getScene()) buildPlayerUI();
  document.dispatchEvent(new CustomEvent('pattern-changed'));
}
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
function patInfo(pl) {
  const pat = pl.cfg.pat, tk = pl.take, c = pl.c;
  if (rec && rec.pl === pl) {
    if (rec.armed) return 'Armed · play: your first key starts the take' + (c.running ? ', on its bar' : ' and the players') + ' · ● again to cancel';
    if (tk && tk.dub) return 'Overdub · ' + plural(tk.added, 'note') + ' added · + Dub again to finish';
    if (tk) return 'Recording · bar ' + (Math.max(0, Math.floor((c.beatAt(c.ctx.currentTime) - tk.origin) / BAR)) + 1) + ' · ' + plural(tk.notes.length, 'note') + ' · ● again to close the loop';
  }
  if (pl.cfg.mode !== 'pattern') return 'This part\'s player is on «' + pl.cfg.mode + '» · Rec loop, or a double click on the grid, puts it on Pattern';
  if (!pat) return 'Empty · Rec loop and play: the take starts with your first key, and Rec loop again closes it';
  const L = pat.bars * BAR, inside = pat.notes.filter(n => n.b < L - 1e-9).length, out = pat.notes.length - inside;
  return plural(pat.bars, 'bar') + ' · ' + plural(inside, 'note') + (out ? ' (+' + out + ' beyond the loop)' : '') + (c.running ? '' : ' · ▶ Play to hear it');
}
export function paintPat() {
  const pl = currentPlayer(), box = $('playerPat'); if (!box) return;
  const on = !!pl && pl.cfg.mode === 'pattern';
  box.hidden = !on; $('playerKnobs').hidden = on;
  if (!pl) { pats('info').forEach(e => { e.textContent = 'Turn on «Parts» in the header: a pattern is the loop a part\'s player repeats'; }); return; }
  const pat = pl.cfg.pat, mine = !!rec && rec.pl === pl, dub = mine && !!pl.take && pl.take.dub, neu = mine && !dub;
  pats('rec').forEach(b => { b.textContent = neu ? '■ Stop' : 'Rec loop'; b.classList.toggle('rec', neu); b.disabled = !!rec && !neu; });
  pats('dub').forEach(b => { b.textContent = dub ? '■ Stop' : '+ Dub'; b.classList.toggle('rec', dub); b.disabled = dub ? false : (!!rec || !(pat && pat.notes.length)); });
  pats('undo').forEach(b => { b.disabled = !!rec || !pl.canUndo(); });
  pats('redo').forEach(b => { b.disabled = !!rec || !pl.canRedo(); });
  pats('clear').forEach(b => { b.disabled = !!rec || !pat; });
  pats('bars').forEach(e => { e.textContent = pat ? pat.bars : '–'; });
  pats('bar-').forEach(b => { b.disabled = !!rec || !pat || pat.bars <= 1; });
  pats('bar+').forEach(b => { b.disabled = !!rec || !pat || pat.bars >= PAT_MAX_BARS; });
  pats('x2').forEach(b => { b.disabled = !!rec || !pl.canDoublePat(); });
  ['rot-', 'rot+'].forEach(k => pats(k).forEach(b => { b.disabled = !!rec || !(pat && pat.notes.length); }));
  document.querySelectorAll('[data-pat="quant"] button').forEach(b => b.classList.toggle('active', +b.dataset.q === pl.cfg.quant));
  document.querySelectorAll('[data-pat="follow"] button').forEach(b => b.classList.toggle('active', b.dataset.f === (pl.cfg.follow || 'off')));
  pats('who').forEach(e => { const sc = getScene(), p = sc.parts[sc.sel]; e.textContent = 'Part ' + (sc.sel + 1) + ' · ' + partLabel(p); });
  const info = patInfo(pl);
  pats('info').forEach(e => { e.textContent = info; });
  if (on && !patRaf) patRaf = requestAnimationFrame(drawPat);
  refreshHistory();                                          // on the Pattern screen the header's ↶ ↷ are the loop's
}
// The loop, read-only: bars and beats, each note a bar at its pitch (where it will SOUND: quantized), the playhead.
// A new take is drawn as it grows, bar by bar.
const PAT_PAD = 5;        // px above and below the notes
const PAT_SPAN = 12;      // semitones the view shows at least (one note alone sits in the middle)
function drawPat() {
  patRaf = 0;
  const cv = $('patCanvas'), pl = currentPlayer();
  if (!cv || !pl || pl.cfg.mode !== 'pattern' || !cv.offsetParent) return;   // not on screen: the loop stops (paintPat starts it again)
  patRaf = requestAnimationFrame(drawPat);
  const g = cv.getContext('2d'), { w, h } = fitCanvas(cv, g, 300, 58);
  g.clearRect(0, 0, w, h);
  const c = pl.c, nowB = c.beatAt(c.ctx.currentTime), tk = pl.take, live = !!tk && !tk.dub, pat = pl.cfg.pat;
  const notes = live ? tk.notes : (pat ? pat.notes : []);
  const q = pl.cfg.quant, rel = live ? nowB - tk.origin : 0;
  const L = live ? Math.max(1, Math.ceil(rel / BAR + 1e-9)) * BAR : (pat ? pat.bars * BAR : BAR);
  const x = b => b / L * w;
  g.fillStyle = token('--edge');
  for (let b = 0; b <= L; b++) { const bar = b % BAR === 0; g.globalAlpha = bar ? 1 : 0.45; g.fillRect(Math.round(x(b)), bar ? 0 : h - 6, 1, bar ? h : 6); }
  g.globalAlpha = 1;
  const vis = notes.filter(n => n.b < L - 1e-9);
  if (vis.length) {
    let lo = Math.min(...vis.map(n => n.m)), hi = Math.max(...vis.map(n => n.m));
    if (hi - lo < PAT_SPAN) { const mid = (hi + lo) / 2; lo = mid - PAT_SPAN / 2; hi = mid + PAT_SPAN / 2; }
    const rowH = Math.max(2, Math.min(6, (h - 2 * PAT_PAD) / (hi - lo + 1)));
    g.fillStyle = token(live ? '--hot' : '--accent');
    for (const n of vis) {
      const open = live && [...tk.open.values()].some(o => o.n === n);
      const s = live ? n.b : patStart(n, q, L), len = open ? Math.max(n.len, rel - n.b) : Math.min(n.len, L);
      const y = PAT_PAD + (hi - n.m) / (hi - lo) * (h - 2 * PAT_PAD - rowH);
      g.globalAlpha = 0.35 + 0.65 * n.v;
      g.fillRect(x(s), y, Math.max(2, x(len) - 1), rowH);
      if (s + len > L) g.fillRect(0, y, Math.max(0, x(s + len - L) - 1), rowH);   // a note held over the loop's end comes round
    }
    g.globalAlpha = 1;
  }
  if (c.running && (live ? rel >= 0 : !!pat)) {
    g.fillStyle = token(tk ? '--hot' : '--ink');
    g.fillRect(Math.round(x(live ? rel : pl.patPhase(c.ctx.currentTime) * L)), 0, 1.5, h);
  }
}

function buildPlayerUI() {
  const sc = getScene(), pl = currentPlayer(); if (!pl) return;
  const p = sc.parts[sc.sel];
  $('playerWho').textContent = 'Part ' + (sc.sel + 1) + ' · ' + partLabel(p);
  document.querySelectorAll('#playerMode button').forEach(b => b.classList.toggle('active', b.dataset.pm === pl.cfg.mode));
  knobRow($('playerKnobs'), KNOBS[pl.cfg.mode] || [], pl.cfg);
  const fx = $('playerFixed');   // Pulse only: always the same note (drums), deaf to the harmony
  if (fx) { fx.hidden = pl.cfg.mode !== 'pulse'; fx.classList.toggle('active', !!pl.cfg.fixed); fx.setAttribute('aria-pressed', String(!!pl.cfg.fixed));
    fx.onclick = e => { e.stopPropagation(); const p = currentPlayer(); if (!p) return; p.cfg.fixed = p.cfg.fixed ? 0 : 1; fx.classList.toggle('active', !!p.cfg.fixed); fx.setAttribute('aria-pressed', String(!!p.cfg.fixed)); }; }
  paintPat();
  // the part's arrangement (compact row of the Arrangement panel): Enters (threshold) · Drift (parameter) · Amount
  $('arrPartWho').textContent = 'Part ' + (sc.sel + 1);
  const host = $('playerArr'); host.innerHTML = '';
  const kU = ksEl('Enters'); kU.dataset.key = 'threshold'; host.appendChild(kU);
  attachKnob(kU.querySelector('.knob'), { min: 0, max: 1, def: pl.cfg.threshold }, v => { pl.cfg.threshold = v; });
  const sel = document.createElement('select'); sel.id = 'derivaSel'; sel.title = 'Drift: a parameter of the part\'s preset that wanders slowly («—» = none)';
  host.appendChild(sel);
  DRIFT_KEYS.forEach(k => sel.add(new Option(k === 'off' ? '—' : k, k)));
  sel.value = pl.cfg.drift || 'off';
  sel.addEventListener('change', () => { pl.setDrift(sel.value); depsRefresh(); if (sel.value !== 'off' && CONTROLS[sel.value]) CONTROLS[sel.value].set(pl.part.engine.S[sel.value]); });
  const kA = ksEl('Amt'); kA.dataset.key = 'driftAmt'; kA.title = 'Amount of drift'; host.appendChild(kA);
  attachKnob(kA.querySelector('.knob'), { min: 0, max: 1, def: pl.cfg.driftAmt, act: true }, v => { pl.cfg.driftAmt = v; });
  depsRefresh();
}

// ---------- the harmony FROM the patterns (engine/inferHarmony.js) ----------
// «From pattern» reads the loop of the part the rack edits — or, with «All parts» on, of every part whose player is on
// Pattern — and writes root, scale, progression and bars per chord into the conductor's harmony, in List mode. It is a
// guess with candidates: pressing again with nothing changed takes the next one (and comes round). The progression
// starts where the loop does (harmony.offset = the bar its take began on).
let fromAll = false, fromState = null;   // { key, list, i }: the candidates of the last reading and which one is in
const loopOfPl = pl => ({ bars: pl.cfg.pat.bars, notes: pl.cfg.pat.notes, quant: pl.cfg.quant, origin: pl.patOrigin });
const hasLoop = pl => !!(pl && pl.cfg.pat && pl.cfg.pat.notes.some(n => n.b < pl.cfg.pat.bars * BAR - 1e-9));
const follows = pl => !!pl && (pl.cfg.follow || 'off') !== 'off';   // a loop that follows the harmony is not read: it would read the harmony it is moved by
export function harmonyFromPattern() {
  const c = conductor(), cur = currentPlayer(); if (!c || !cur) return null;
  const pls = (fromAll ? [cur, ...c.players.filter(p => p !== cur)].filter(p => hasLoop(p) && (p === cur || p.cfg.mode === 'pattern')) : [cur].filter(hasLoop)).filter(p => !follows(p));
  const say = t => { $('harmFromInfo').textContent = t; return null; };
  if (!pls.length && (fromAll ? c.players.some(p => hasLoop(p) && follows(p)) : hasLoop(cur) && follows(cur))) { fromState = null; return say('On Follow, a pattern is moved by the harmony and cannot tell it: set Follow to Off to read it'); }
  if (!pls.length) { fromState = null; return say(fromAll ? 'No pattern in any part: record one first' : 'This part has no pattern: record one first'); }
  const pats = pls.map(loopOfPl), key = JSON.stringify([fromAll, pats]);
  if (fromState && fromState.key === key) fromState.i = (fromState.i + 1) % fromState.list.length;
  else fromState = { key, list: inferHarmony(pats), i: 0 };
  const cand = fromState.list[fromState.i]; if (!cand) return say('Nothing to read');
  const h = c.harmony;
  Object.assign(h, { root: cand.root, scale: cand.scale, prog: cand.prog.slice(), bars: cand.bars, mode: 'list', offset: pls[0].patOrigin / BAR });
  syncHarmonyUI();
  const out = Math.round((1 - cand.fit) * 100);
  $('harmFromInfo').textContent = (fromState.i + 1) + '/' + fromState.list.length + ' · ' + cand.label + (out ? ' · ' + out + ' % of the notes outside' : '');
  document.dispatchEvent(new CustomEvent('display-show', { detail: { who: 'Harmony · From pattern', val: cand.label } }));
  return cand;
}
export function setHarmonyFromAll(on) {
  fromAll = !!on; fromState = null;
  const [off, onB] = document.querySelectorAll('#harmFromAll button');
  off.classList.toggle('active', !fromAll); onB.classList.toggle('active', fromAll);
}

// ★ Save: the scene as it is now into the Library's «Scenes», under the name in the field. A scene of YOURS with that
// name is written over (saving again is saving); a seeded one (the repo's) is never touched: the library refreshes
// those when the bank changes, and your work would go with it — yours is added beside it.
export function saveSceneToLibrary(name) {
  const sc = getScene(); if (!sc) return null;
  const d = new Date(), p = x => String(x).padStart(2, '0');
  name = String(name || sc.name || 'Scene ' + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes())).trim().slice(0, MAX_NAME);
  sc.name = name;
  const j = sceneToJSON(sc);
  const old = library.items().find(it => it.type === 'scene' && it.name === name && !it.seed);
  const r = old ? { id: old.id, name, over: true }
    : { id: library.add({ type: 'scene', name, section: library.ensureSection(SEC_SCENES), data: j, origin: 'user' }), name, over: false };
  if (old) library.update(old.id, j);
  document.dispatchEvent(new CustomEvent('scene-saved', { detail: r }));   // the session: from here on, «edited» is counted from this save
  return r;
}
// The list of well-known progressions shows the one the harmony is on, or «Your own» when it is none of them
function syncProgPreset() { const c = conductor(), sel = $('harmPreset'); if (c && sel) sel.value = String(progressionIndex(c.harmony.prog, c.harmony.scale)); }
// The «Now» strip: the progression as cells — degree + the chord it is on this root and scale —, the one sounding lit
// and filling with its bars. List: the whole list. Functions: the walk in pages of STRIP_FN chords (the cursor crosses
// the page, then the page turns): it is deterministic with the seed, so the chords to come are known.
const STRIP_FN = 8, STRIP_NAMES = 8;   // chords per page of the walk · above this many cells there is room for the number alone
let stripKey = '';
function chordLabel(ch) {   // quality from the chord's own third and fifth; a pentatonic's «thirds» are neither: the note alone
  const iv = j => (ch.tones[j] - ch.tones[0] + 12) % 12, third = iv(1);
  return NOTE_NAMES[ch.rootPc] + (third === 3 ? (iv(2) === 6 ? '°' : 'm') : '');
}
function paintStrip() {
  const c = conductor(), el = $('harmStrip'); if (!c || !el) return;
  const h = c.harmony, bars = Math.max(1, h.bars), fn = h.mode === 'functions';
  const pos = c.running ? Math.max(0, c.beatAt(c.ctx.currentTime) / BAR - (h.offset || 0)) / bars : -1;   // in chords; −1 = stopped
  const i = Math.floor(pos), n = fn ? STRIP_FN : Math.max(1, h.prog.length), first = fn ? Math.max(0, Math.floor(i / n)) * n : 0;
  const cells = Array.from({ length: n }, (_, k) => h.chordAt((h.offset || 0) + (first + k) * bars));
  const key = cells.map(ch => ch.degree + chordLabel(ch)).join(' ');
  if (key !== stripKey || el.children.length !== n) {
    stripKey = key;
    el.replaceChildren(...cells.map(ch => { const d = document.createElement('span'); d.className = 'hc';
      const b = document.createElement('b'); b.textContent = ch.degree; d.append(b); if (n <= STRIP_NAMES) d.append(chordLabel(ch)); return d; }));
  }
  const cur = pos < 0 ? -1 : ((i - first) % n + n) % n;
  [...el.children].forEach((d, k) => { d.classList.toggle('cur', k === cur); if (k === cur) d.style.setProperty('--p', (pos - i).toFixed(3)); });
}
function syncHarmonyUI() {
  const c = conductor(); if (!c) return;
  const h = c.harmony;
  $('sceneName').value = getScene().name || '';
  $('harmRoot').value = h.root; $('harmScale').value = h.scale;
  $('harmProg').value = h.prog.join(' '); $('harmBars').textContent = h.bars;
  syncProgPreset();
  document.querySelectorAll('#harmMode button').forEach(b => b.classList.toggle('active', b.dataset.m === h.mode));
  $('harmSeed').value = c.seed;
  setPlayBtn(c.running);
  paintStrip();
  knobRow($('arrKnobs'), ARR_KNOBS, c.arr.cfg);
  depsRefresh();
}
function setPlayBtn(on) {
  const b = $('playBtn'); b.classList.toggle('on', on); b.setAttribute('aria-label', on ? 'Stop' : 'Play');   // the transport, in the header: its icon turns into the stop square (css)
  if (!on) { $('harmInfo').textContent = 'Stopped'; $('arrInfo').textContent = '—'; paintStrip(); }
}
export function isPlaying() { const c = conductor(); return !!(c && c.running); }
// ▶ Play and the scenes' ▶/⏹ in the Library go through here; announces with play-changed
export function setPlaying(on, at) {   // at: the audio time of beat 0 (a pattern take: its first key)
  const c = conductor(); if (!c) return false;
  if (on && !c.running) { part().resume(); c.start(at); }
  else if (!on && c.running) c.stop();
  setPlayBtn(c.running);
  document.dispatchEvent(new CustomEvent('play-changed', { detail: { on: c.running } }));
  return c.running;
}
function refreshInfo() {
  if (rec && !rec.armed && !rec.pl.take) patRecStop();       // the engine closed the take on its own (the conductor stopped, another mode)
  const pp = currentPlayer();
  if (pp) { const info = patInfo(pp); pats('info').forEach(e => { e.textContent = info; }); }
  paintStrip();                                              // also stopped: it follows the root, the scale, the list, the seed
  const c = conductor(); if (!c || !c.running) return;
  const bar = c.barNow(), ch = c.harmony.chordAt(bar);
  $('harmInfo').textContent = 'Bar ' + (bar + 1) + ' · ' + (DEGREES[ch.degree - 1] || ch.degree) + ' · ' + NOTE_NAMES[ch.rootPc];
  const E = c.arr.energyAt(bar), n = Math.max(1, c.arr.cfg.cycle);
  $('arrInfo').textContent = 'Cycle ' + ((bar % n) + 1) + '/' + n + ' · energy ' + E.toFixed(2) +
    ' · playing ' + c.players.map((p, i) => c.arr.stateAt(bar, i, p.cfg).active && p.cfg.mode !== 'off' ? (i + 1) : '·').join('');
}

// ---------- scene: export / import ----------
export async function loadScene(json) {   // also from the Library (Presets screen)
  if (!sceneOn()) { await enableScene(); document.dispatchEvent(new CustomEvent('scene-loaded')); }   // switches on (and the UI is assembled)
  applySceneJSON(getScene(), json);
  document.dispatchEvent(new CustomEvent('scene-loaded'));   // partsControls: strips + rack + scene-changed → syncAll here
}
function syncAll() { syncHarmonyUI(); buildPlayerUI(); }

export function initPlayerControls() {
  const rootSel = $('harmRoot'), scaleSel = $('harmScale'); if (!rootSel) return;
  NOTE_NAMES.forEach((n, i) => rootSel.add(new Option(n, i)));
  Object.keys(SCALES).forEach(k => scaleSel.add(new Option(k.charAt(0).toUpperCase() + k.slice(1), k)));
  rootSel.addEventListener('change', () => { const c = conductor(); if (c) c.harmony.root = +rootSel.value; });
  scaleSel.addEventListener('change', () => { const c = conductor(); if (c) { c.harmony.scale = scaleSel.value; syncProgPreset(); } });
  $('harmProg').addEventListener('change', () => { const c = conductor(); if (!c) return; c.harmony.prog = parseProg($('harmProg').value); $('harmProg').value = c.harmony.prog.join(' '); syncProgPreset(); });
  // well-known progressions: the degrees and the scale they are known in (bars only where the form fixes them); the root stays
  const preSel = $('harmPreset');
  preSel.add(new Option('Your own', '-1'));
  PROGRESSIONS.forEach((p, i) => {
    let g = [...preSel.querySelectorAll('optgroup')].find(o => o.label === p.group);
    if (!g) { g = document.createElement('optgroup'); g.label = p.group; preSel.append(g); }
    g.append(new Option(p.name + ' · ' + (p.prog.length > 8 ? p.prog.length + ' chords' : p.prog.join(' ')), String(i)));   // the long ones would not fit the closed list
  });
  preSel.addEventListener('change', () => {
    const c = conductor(), p = PROGRESSIONS[+preSel.value]; if (!c || !p) return syncProgPreset();   // «Your own» is not a choice: back to what there is
    const h = c.harmony;
    h.prog = p.prog.slice(); if (p.scale) h.scale = p.scale; if (p.bars) h.bars = p.bars;
    h.mode = 'list';                                                                                  // a written progression is what List plays
    syncHarmonyUI(); depsRefresh();
  });
  document.querySelectorAll('[data-hbar]').forEach(b => b.addEventListener('click', () => {
    const c = conductor(); if (!c) return;
    c.harmony.bars = Math.max(1, Math.min(8, c.harmony.bars + (+b.dataset.hbar)));
    $('harmBars').textContent = c.harmony.bars;
  }));
  document.querySelectorAll('#harmMode button').forEach(b => b.addEventListener('click', () => {
    const c = conductor(); if (!c) return;
    c.harmony.mode = b.dataset.m;
    document.querySelectorAll('#harmMode button').forEach(x => x.classList.toggle('active', x === b));
    depsRefresh();
  }));
  $('harmSeed').addEventListener('change', () => { const c = conductor(); if (c) c.setSeed(Math.max(1, +$('harmSeed').value | 0)); });
  $('harmDice').addEventListener('click', () => { const c = conductor(); if (!c) return; const s = 1 + Math.floor(Math.random() * 99999); $('harmSeed').value = s; c.setSeed(s); });
  $('playBtn').addEventListener('click', () => setPlaying(!isPlaying()));
  $('harmFrom').addEventListener('click', e => { e.currentTarget.blur(); harmonyFromPattern(); });
  document.querySelectorAll('#harmFromAll button').forEach(b => b.addEventListener('click', () => { b.blur(); setHarmonyFromAll(!fromAll); }));   // the inactive one lies on top: any click toggles
  setHarmonyFromAll(false);
  for (const ev of ['part-changed', 'scene-loaded']) document.addEventListener(ev, () => { fromState = null; if ($('harmFromInfo')) $('harmFromInfo').textContent = ''; });
  document.querySelectorAll('#playerMode button').forEach(b => b.addEventListener('click', () => {
    const pl = currentPlayer(); if (!pl || !PLAYER_MODES.includes(b.dataset.pm)) return;
    if (rec && rec.pl === pl && b.dataset.pm !== 'pattern') patRecStop();   // leaving the mode ends the take (kept)
    pl.setMode(b.dataset.pm); buildPlayerUI();
  }));
  // pattern: takes, length and grid (the same controls in the Player module and on the Pattern screen)
  const edited = () => { paintPat(); document.dispatchEvent(new CustomEvent('pattern-changed')); };
  const click = (name, fn) => pats(name).forEach(b => b.addEventListener('click', e => { e.currentTarget.blur(); fn(currentPlayer()); }));   // blurred: Space or Enter must not press it again while you play
  click('rec', () => { if (rec) patRecStop(); else patRecStart(false); });
  click('dub', () => { if (rec) patRecStop(); else patRecStart(true); });
  click('undo', pl => { if (pl && !rec && pl.undo()) edited(); });
  click('redo', pl => { if (pl && !rec && pl.redo()) edited(); });
  click('clear', pl => { if (pl && !rec) { pl.clearPat(); edited(); } });
  click('bar-', pl => { if (pl && !rec && pl.cfg.pat) { pl.setPatBars(pl.cfg.pat.bars - 1); edited(); } });
  click('bar+', pl => { if (pl && !rec && pl.cfg.pat) { pl.setPatBars(pl.cfg.pat.bars + 1); edited(); } });
  click('x2', pl => { if (pl && !rec && pl.doublePat()) edited(); });
  click('rot-', pl => { if (pl && !rec && pl.rotatePat(-1)) edited(); });
  click('rot+', pl => { if (pl && !rec && pl.rotatePat(1)) edited(); });
  click('edit', () => showScreen('pattern'));
  document.querySelectorAll('[data-pat="follow"] button').forEach(b => b.addEventListener('click', () => {   // Follow (P4): on playback, from the next note
    const pl = currentPlayer(); if (!pl) return;
    pl.cfg.follow = b.dataset.f; b.blur(); paintPat();
  }));
  document.querySelectorAll('[data-pat="quant"] button').forEach(b => b.addEventListener('click', () => {
    const pl = currentPlayer(); if (!pl) return;
    pl.cfg.quant = +b.dataset.q; b.blur(); edited();
  }));
  document.addEventListener('pattern-edited', paintPat);     // the editor changed the loop (ui/patternEditor.js)
  // The small view stops drawing while its screen is hidden (drawPat): coming back starts it again, with whatever
  // the Pattern screen did to the loop meanwhile
  document.addEventListener('screen-changed', () => { if (getScene()) paintPat(); else refreshHistory(); });
  // On the Pattern screen, the header's ↶ ↷ and Ctrl+Z / Ctrl+Y undo the loop (the same steps as its own ↶ ↷)
  setUndoAlt(() => {
    const pl = currentPlayer();
    if (currentScreen() !== 'pattern' || !pl) return null;
    return { canUndo: !rec && pl.canUndo(), canRedo: !rec && pl.canRedo(), what: 'the pattern',
             undo: () => { if (!rec && pl.undo()) edited(); }, redo: () => { if (!rec && pl.redo()) edited(); } };
  });
  document.addEventListener('play-changed', e => { if (!e.detail.on) patRecStop(); if (getScene()) paintPat(); });
  document.addEventListener('part-changed', patRecStop);     // (before the listener below rebuilds the panel for the new part)
  document.addEventListener('scene-loaded', patRecStop);
  // scene
  $('sceneExp').addEventListener('click', () => {
    const sc = getScene(); if (!sc) return;
    const d = new Date(), p = x => String(x).padStart(2, '0'), stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
    const j = sceneToJSON(sc); if (!j.name) j.name = 'Scene ' + stamp;   // a scene built by hand has no name yet: the file's date is its name
    download(new Blob([JSON.stringify(j, null, 1)], { type: 'application/json' }), `subsdj-scene-${stamp}.json`);
  });
  $('sceneSave').addEventListener('click', () => {
    const r = saveSceneToLibrary($('sceneName').value); if (!r) return;
    $('sceneName').value = r.name;
    $('presetMsg').textContent = (r.over ? 'Scene saved over «' : 'Scene saved as «') + r.name + '» in the Library (Presets · Scenes)';
  });
  $('sceneName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('sceneSave').click(); e.target.blur(); } });
  $('sceneImp').addEventListener('click', () => $('sceneFile').click());
  $('sceneFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { await loadScene(JSON.parse(await f.text())); $('presetMsg').textContent = 'Scene loaded: ' + f.name; }
    catch (err) { $('presetMsg').textContent = 'Invalid scene: ' + (err.message || err); }
  });

  document.addEventListener('part-changed', buildPlayerUI);
  document.addEventListener('preset-loaded', () => { if (getScene()) buildPlayerUI(); });
  document.addEventListener('scene-changed', e => {
    clearInterval(infoTimer); infoTimer = null;
    if (!e.detail.on && rec) { rec = null; setNoteTap(null); }   // Parts off: the scene and its take are gone
    if (!e.detail.on) paintPat();
    if (e.detail.on) {
      const c = conductor();
      c.onDrift = (i, key, v) => { const sc = getScene(); if (sc && sc.sel === i && CONTROLS[key] && Math.abs(CONTROLS[key].get() - v) > 1e-9) CONTROLS[key].set(v); };
      syncAll();
      infoTimer = setInterval(refreshInfo, 200);
    }
  });
}
