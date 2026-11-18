/* =====================================================================
   SubSDJ · Parts UI: «Parts» button and 1-4 selector in the header +
   «Part Mixer» module. Switching the scene on creates 4 engines on the same
   context with a shared Room (engine/parts.js); the rack then
   edits the chosen part (syncControls dumps its state without cutting its
   notes). The Part Mixer shows the 4 parts: Level (= the Master of the part's
   preset), Pan, Delay/Reverb sends (= the preset's delay Amount and reverb
   Mix), M (mute); and the Room column: the scene's
   master, echo feedback and echo→reverb. Layer: the keys play all parts.
   The Delay, Reverb and Tape modules carry the «room» tag in a scene:
   except for Amount/Mix (sends), their knobs belong to the shared Room.
   ===================================================================== */
import { part, sceneOn, getScene, enableScene, disableScene, selectPart, setPartMute, setPartPan, setLayer, partLabel } from '../engine/parts.js';
import { CONTROLS, syncControls } from './registry.js';
import { attachKnob } from './knobs.js';
import { PARAMS } from '../engine/params.js';
import { panic } from './keyboard.js';
import { MAX_NAME } from '../engine/library.js';
import { currentPreset, markPreset, markPresetByName, initItem, initData } from './presetBank.js';
import { sceneEdited, soloPreset } from './session.js';
import { saveSceneToLibrary } from './playerControls.js';
import { askConfirm } from './confirm.js';

const ROOM_PANELS = ['Delay', 'Recycler', 'Reverb', 'Tape'];
const SEND_KEYS = new Set(['master', 'dlyAmt', 'reverbMix']);
const $ = id => document.getElementById(id);
let strips = [], silent = false, roomPanels = [];

// Resolved ONCE at startup (before hanging tags on the h2: afterwards its
// text would no longer match the title).
const panelByTitle = t => [...document.querySelectorAll('.panel h2')]
  .find(h => h.textContent.replace(/[\s?]/g, '') === t)?.closest('.panel');

const knobHtml = lab => `<div class="ctl"><div class="knob"><div class="ind"></div></div><div class="lab">${lab}</div><div class="val"></div></div>`;
const panFmt = v => v < -0.02 ? 'L' + Math.round(-v * 100) : v > 0.02 ? 'R' + Math.round(v * 100) : 'C';

function buildStrips() {
  const host = $('mixStrips'), sc = getScene();
  host.innerHTML = ''; strips = []; silent = true;   // knobs fire onChange when created: don't rewrite the engine
  sc.parts.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'strip'; div.dataset.i = i;
    div.innerHTML = `<div class="shead"><button class="pname" title="Edit this part in the rack · double click to rename it (the name is saved with the scene; loading a preset into the part puts the preset's name back)"></button>` +
      `<button class="mute" title="Mute the part">M</button></div>` +   // the M next to the name: one row less (fixed panel)
      `<div class="row tight">${knobHtml('Level')}${knobHtml('Pan')}${knobHtml('Delay')}${knobHtml('Reverb')}</div>`;
    host.appendChild(div);
    const [kLevel, kPan, kDly, kRev] = div.querySelectorAll('.knob');
    const S = p.engine.S;
    // Level / sends ARE parameters of the part's preset: they are written to its
    // engine and, if it is the part the rack is editing, also to its rack knob.
    const bindSend = (el, key, cfg) => attachKnob(el, { ...cfg, def: S[key] }, v => {
      if (silent) return;
      p.engine.set(key, v);
      document.dispatchEvent(new Event('deps-refresh'));   // a send from another part switches the Room on or off (ui/deps.js)
      if (p.engine === part() && CONTROLS[key] && CONTROLS[key].get() !== v) CONTROLS[key].set(v);
    });
    const st = {
      div,
      level: bindSend(kLevel, 'master', { ...PARAMS.master }),   // same travel as the rack knob (up to +12 dB)
      dly:   bindSend(kDly, 'dlyAmt', { min: 0, max: 0.9, act: true }),
      rev:   bindSend(kRev, 'reverbMix', { min: 0, max: 0.6, act: true }),
      pan:   attachKnob(kPan, { min: -1, max: 1, def: p.pan, fmt: panFmt }, v => { if (!silent) setPartPan(i, v); }),
    };
    strips.push(st);
    div.querySelector('button.pname').addEventListener('click', () => choose(i));
    div.querySelector('button.pname').addEventListener('dblclick', () => renamePart(i));
    div.querySelector('.mute').classList.toggle('on', p.mute); div.classList.toggle('muted', p.mute);
    div.querySelector('.mute').addEventListener('click', e => {
      setPartMute(i, !p.mute);
      e.currentTarget.classList.toggle('on', p.mute); div.classList.toggle('muted', p.mute);
    });
  });
  // Room column: scene master, echo feedback, echo → reverb
  const room = document.createElement('div');
  room.className = 'strip room';
  room.innerHTML = `<div class="pname static">Room</div>` +
    `<div class="row tight">${knobHtml('Master')}${knobHtml('Fdbk')}${knobHtml('Echo→Rev')}</div>` +
    `<label class="chk"><input type="checkbox" id="layerChk"> Layer: keys play all parts</label>`;
  host.appendChild(room);
  const [kM, kFb, kToRev] = room.querySelectorAll('.knob');
  attachKnob(kM, { ...PARAMS.master, def: sc.roomCfg.master }, v => { sc.roomCfg.master = v; sc.room.setMaster(v); });
  attachKnob(kFb, { min: 0, max: PARAMS.dlyFb.max, def: sc.roomCfg.fb, act: true }, v => { sc.roomCfg.fb = v; sc.room.setFeedback(v); });   // above 1, the echo runs away (Room)
  attachKnob(kToRev, { min: 0, max: 1, def: sc.roomCfg.dlyToRev, act: true }, v => { sc.roomCfg.dlyToRev = v; sc.room.setDlyToRev(v); });
  $('layerChk').addEventListener('change', e => setLayer(e.target.checked));
  silent = false;
  refreshNames();
}

// Rename a part: double click on its name → a field in its place. Enter or leaving it keeps the name, Escape
// doesn't; empty (or the preset's own name) goes back to the preset's name. The link to the preset is not
// touched: the selector still marks it and Save still writes over it.
function renamePart(i) {
  const sc = getScene(), p = sc && sc.parts[i], btn = p && strips[i].div.querySelector('button.pname');
  if (!btn || btn.hidden) return;
  const inp = document.createElement('input');
  inp.className = 'pname pname-edit'; inp.maxLength = MAX_NAME; inp.value = partLabel(p); inp.spellcheck = false;
  let done = false;
  const end = keep => {
    if (done) return; done = true;
    if (keep) { const v = inp.value.trim(); p.label = v && v !== p.presetName ? v : ''; }
    inp.remove(); btn.hidden = false; refreshNames();
    document.dispatchEvent(new CustomEvent('part-renamed', { detail: { i } }));
  };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') end(true); else if (e.key === 'Escape') end(false); });   // typing a name is not playing, and Escape here is not panic
  inp.addEventListener('keyup', e => e.stopPropagation());
  inp.addEventListener('blur', () => end(true));
  btn.hidden = true; btn.before(inp); inp.focus(); inp.select();
}

function refreshNames() {
  const sc = getScene(); if (!sc) return;
  sc.parts.forEach((p, i) => {
    strips[i].div.querySelector('button.pname').textContent = (i + 1) + ' · ' + partLabel(p);
    strips[i].div.classList.toggle('cur', i === sc.sel);
  });
  document.querySelectorAll('#partSel button').forEach(b => b.classList.toggle('active', +b.dataset.p === sc.sel));
}

// The strip of the part the rack is editing mirrors its Master / Amount / Mix knobs
function refreshCurrent() {
  const sc = getScene(); if (!sc) return;
  const st = strips[sc.sel]; if (!st) return;   // in the middle of rebuilding the strips it doesn't exist yet
  const S = part().S;
  silent = true;
  try { st.level.set(S.master); st.dly.set(S.dlyAmt); st.rev.set(S.reverbMix); }
  finally { silent = false; }
}

function choose(i) {
  const sc = getScene(); if (!sc || i === sc.sel) return;
  document.dispatchEvent(new CustomEvent('part-changing', { detail: { from: sc.sel, to: i } }));   // BEFORE the rack moves: a Seq Rec take ends on the part that recorded it
  selectPart(i);
  syncControls(part().S);                     // the rack shows the part (without cutting its notes)
  const p = sc.parts[i];
  if (p.presetVal) markPreset(p.presetVal);
  if (!currentPreset() && p.presetName) markPresetByName(p.presetName);   // scenes from before the Library ('f:Name'): by name
  const msg = $('presetMsg'); if (msg) msg.textContent = 'Part ' + (i + 1) + ' · ' + partLabel(p);
  refreshNames();
  document.dispatchEvent(new CustomEvent('part-changed', { detail: { i } }));   // the Player module follows the part
}

// With Parts off, their modules stay IN PLACE, dimmed (fixed
// panel: nothing appears or disappears pushing the others around); the empty Part Mixer
// explains how to switch them on (CSS).
function setUI(on) {
  $('partsBtn').classList.toggle('on', on);
  $('partSel').hidden = !on;
  for (const id of ['mixer', 'harmony', 'player', 'arrange', 'pattern']) $(id).classList.toggle('parts-off', !on);
  if (!on) { $('mixStrips').innerHTML = ''; strips = []; }
  document.body.classList.toggle('parts', on);
  document.dispatchEvent(new CustomEvent('scene-changed', { detail: { on } }));
  for (const panel of roomPanels) {
    const h2 = panel.querySelector('h2');
    // shared by all parts: said by the title's color, not by a «room» tag — the tag made the narrow modules (Tape) wider
    h2.classList.toggle('room-shared', on);
    if (on) h2.title = 'Room: shared by all parts (except the send)'; else h2.removeAttribute('title');
  }
}

// Turning Parts off — and «New» — THROW THE SCENE AWAY with no undo: the four sounds, the mix, the Room, the
// harmony, the players with their patterns, the arrangement. They ask first, but only when there is something
// to lose: a scene edited since it was started, loaded or saved (session.js · sceneEdited). A question that
// always comes up gets answered without reading. The selftest's other checks switch Parts on and off all the
// time: there the question is off unless a check turns it on (setDiscardAsk).
let asking = !new URLSearchParams(location.search).has('selftest');
export function setDiscardAsk(on) { asking = !!on; }
const say = t => { const msg = $('presetMsg'); if (msg) msg.textContent = t; };
// → null (stay), or { saved } (go on; saved = the name it was saved under first, if it was)
const mustAsk = () => asking && sceneEdited();
async function mayDiscard(off) {
  const a = await askConfirm({
    title: off ? 'Turn Parts off?' : 'Start a new scene?',
    text: 'This scene has unsaved changes, and ' + (off ? 'turning Parts off' : 'a new scene') + ' discards it: the four sounds, the mix, the room, ' +
      'the harmony, the players with their patterns and the arrangement. There is no undo.\n' +
      (off ? 'The rack goes back to the sound you had before Parts.' : 'Part 1 starts with the sound you had before Parts, the others on Init.'),
    buttons: [
      { id: 'save', label: off ? '★ Save and turn off' : '★ Save and start new', title: 'Saves the scene in the Library\'s «Scenes» first, under the name in the Arrangement module (or today\'s date if it has none)' },
      { id: 'go', label: off ? 'Turn off' : 'Start new' },
      { id: 'back', label: 'Cancel' },
    ],
  });
  if (!a || !sceneOn()) return null;
  if (a !== 'save') return {};
  const r = saveSceneToLibrary($('sceneName').value);
  return r ? { saved: r.name } : null;
}
const savedMsg = d => (d.saved ? 'Scene saved as «' + d.saved + '» · ' : '');

function partsOff() {
  disableScene(); setUI(false); syncControls(part().S);
  markPreset(soloPreset());   // the rack is the single engine's again: its preset, not the last part's
}
async function partsOn(btn) {
  btn.disabled = true;
  try { await enableScene(initData()); } finally { btn.disabled = false; }   // the other parts are born with Init (the blank page)
  buildStrips(); setUI(true); syncControls(part().S);
  const cur = currentPreset(), sc = getScene(), p0 = sc.parts[0], init = initItem();   // part 1 inherits the sound (and its preset name)
  if (cur) { p0.presetVal = cur.id; p0.presetName = cur.name; }
  if (init) for (const p of sc.parts.slice(1)) { p.presetVal = init.id; p.presetName = init.name; }
  refreshNames();
}
async function toggle(btn) {
  if (sceneOn()) {
    const d = mustAsk() ? await mayDiscard(true) : {}; if (!d) return;   // nothing to ask: off AT ONCE (no await: whoever clicked can count on it)
    partsOff();
    say(savedMsg(d) + 'Parts off: single engine');
    return;
  }
  if (!part().ready) return;
  await partsOn(btn);
  say('Parts: part 1 takes over the current sound');
}
// «New» (Arrangement module): the scene starts over, exactly as Parts off and on again does
async function newScene() {
  if (!sceneOn()) return;
  const d = mustAsk() ? await mayDiscard(false) : {}; if (!d) return;
  partsOff();
  await partsOn($('partsBtn'));
  say(savedMsg(d) + 'New scene: part 1 has the sound you had before Parts');
}

export function initPartsControls() {
  const btn = $('partsBtn'); if (!btn) return;
  roomPanels = ROOM_PANELS.map(panelByTitle).filter(Boolean);
  btn.addEventListener('click', () => toggle(btn));
  $('sceneNew')?.addEventListener('click', e => { e.currentTarget.blur(); newScene(); });
  // Panic: the conductor stops and cancels what is pending, and all parts release everything
  const pb = $('panicBtn');
  if (pb) pb.addEventListener('click', () => { const sc = getScene(); if (sc) sc.conductor.panic(); panic(); document.dispatchEvent(new CustomEvent('scene-changed', { detail: { on: sceneOn() } })); });
  document.querySelectorAll('#partSel button').forEach(b => b.addEventListener('click', () => { part().resume(); choose(+b.dataset.p); }));
  document.addEventListener('param-change', e => { if (sceneOn() && SEND_KEYS.has(e.detail.target)) refreshCurrent(); });
  // scene loaded from JSON (playerControls): strips, rack and scene modules brought up to date
  document.addEventListener('scene-loaded', () => { if (!sceneOn()) return; buildStrips(); setUI(true); syncControls(part().S); });
  document.addEventListener('preset-loaded', e => {
    const sc = getScene(); if (!sc) return;
    const p = sc.parts[sc.sel]; p.presetVal = e.detail.value; p.presetName = e.detail.name; p.label = '';   // a preset loaded into the part: it is called after it again
    refreshNames();
  });
}
