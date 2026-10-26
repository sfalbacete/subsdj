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
import { part, sceneOn, getScene, enableScene, disableScene, selectPart, setPartMute, setPartPan, setLayer } from '../engine/parts.js';
import { CONTROLS, syncControls } from './registry.js';
import { attachKnob } from './knobs.js';
import { PARAMS } from '../engine/params.js';
import { panic } from './keyboard.js';
import { currentPreset, markPreset, markPresetByName } from './presetBank.js';

const ROOM_PANELS = ['Delay', 'Reverb', 'Tape'];
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
    div.innerHTML = `<div class="shead"><button class="pname" title="Edit this part in the rack"></button>` +
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
    div.querySelector('.pname').addEventListener('click', () => choose(i));
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

function refreshNames() {
  const sc = getScene(); if (!sc) return;
  sc.parts.forEach((p, i) => {
    strips[i].div.querySelector('.pname').textContent = (i + 1) + ' · ' + (p.presetName || 'Init');
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
  selectPart(i);
  syncControls(part().S);                     // the rack shows the part (without cutting its notes)
  const p = sc.parts[i];
  if (p.presetVal) markPreset(p.presetVal);
  if (!currentPreset() && p.presetName) markPresetByName(p.presetName);   // scenes from before the Library ('f:Name'): by name
  const msg = $('presetMsg'); if (msg) msg.textContent = 'Part ' + (i + 1) + (p.presetName ? ' · ' + p.presetName : '');
  refreshNames();
  document.dispatchEvent(new CustomEvent('part-changed', { detail: { i } }));   // the Player module follows the part
}

// With Parts off, their modules stay IN PLACE, dimmed (fixed
// panel: nothing appears or disappears pushing the others around); the empty Part Mixer
// explains how to switch them on (CSS).
function setUI(on) {
  $('partsBtn').classList.toggle('on', on);
  $('partSel').hidden = !on;
  for (const id of ['mixer', 'harmony', 'player', 'arrange']) $(id).classList.toggle('parts-off', !on);
  if (!on) { $('mixStrips').innerHTML = ''; strips = []; }
  document.body.classList.toggle('parts', on);
  document.dispatchEvent(new CustomEvent('scene-changed', { detail: { on } }));
  for (const panel of roomPanels) {
    const h2 = panel.querySelector('h2');
    let tag = h2.querySelector('.tag-room');
    if (on && !tag) { tag = document.createElement('span'); tag.className = 'tag-room'; tag.textContent = 'room'; tag.title = 'Shared by all parts (except the send)'; h2.appendChild(tag); }
    if (!on && tag) tag.remove();
  }
}

async function toggle(btn) {
  if (sceneOn()) {
    disableScene(); setUI(false); syncControls(part().S);
    const msg = $('presetMsg'); if (msg) msg.textContent = 'Parts off: single engine';
    return;
  }
  if (!part().ready) return;
  btn.disabled = true;
  try { await enableScene(); } finally { btn.disabled = false; }
  buildStrips(); setUI(true); syncControls(part().S);
  const cur = currentPreset(), p0 = getScene().parts[0];      // part 1 inherits the sound (and its preset name)
  if (cur) { p0.presetVal = cur.id; p0.presetName = cur.name; refreshNames(); }
  const msg = $('presetMsg'); if (msg) msg.textContent = 'Parts: part 1 takes over the current sound';
}

export function initPartsControls() {
  const btn = $('partsBtn'); if (!btn) return;
  roomPanels = ROOM_PANELS.map(panelByTitle).filter(Boolean);
  btn.addEventListener('click', () => toggle(btn));
  // Panic: the conductor stops and cancels what is pending, and all parts release everything
  const pb = $('panicBtn');
  if (pb) pb.addEventListener('click', () => { const sc = getScene(); if (sc) sc.conductor.panic(); panic(); document.dispatchEvent(new CustomEvent('scene-changed', { detail: { on: sceneOn() } })); });
  document.querySelectorAll('#partSel button').forEach(b => b.addEventListener('click', () => { part().resume(); choose(+b.dataset.p); }));
  document.addEventListener('param-change', e => { if (sceneOn() && SEND_KEYS.has(e.detail.target)) refreshCurrent(); });
  // scene loaded from JSON (playerControls): strips, rack and scene modules brought up to date
  document.addEventListener('scene-loaded', () => { if (!sceneOn()) return; buildStrips(); setUI(true); syncControls(part().S); });
  document.addEventListener('preset-loaded', e => {
    const sc = getScene(); if (!sc) return;
    const p = sc.parts[sc.sel]; p.presetVal = e.detail.value; p.presetName = e.detail.name;
    refreshNames();
  });
}
