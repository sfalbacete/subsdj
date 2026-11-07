/* =====================================================================
   SubSDJ · the SESSION: unsaved work survives closing the page.
   Every EVERY_MS (and at once when the page is hidden or closed) the
   instrument is written to localStorage:
     · the rack — every control of the Design and Sequencing screens: the
       sound, the Arpeggiator / Sequencer with its phrase, the Wave Sequence,
       Steps, the matrix, the clock — with its preset and the REFERENCE of its ●
       (the preset as loaded or saved), plus the Arp / Seq lock;
     · in Parts, the whole scene (parts, mix, Room, harmony, players,
       arrangement), each part's ● reference, Layer and the single engine's
       sound underneath (the one Parts off brings back).
   The drawn wave, your phrases, the library, the theme, the screen and the MIDI
   map are stored on their own already.
   ONLY WHAT WOULD BE LOST is kept, and that is decided by COMPARISON, never by
   «the user did things» (a flag would get Reset, undo and a knob put back
   wrong). The test is the ●'s (history.js · same): something would be lost if
     — the rack differs from its reference (the ● is lit);
     — it equals it, but that preset is gone from the library and the rack is
       not what a fresh start gives (Init);
     — the Arp / Seq is LOCKED with a phrase that is not the start's: it rides
       over the presets and is in none of them;
     — in Parts, the scene differs from the one loaded (library or file) or the
       one Parts started with — and if the rack had unsaved work when Parts
       started, that work is in the scene: kept too.
   Reset, Ctrl+Z back to the start, a knob put back or Save leave nothing, and
   the stored session is deleted. When one is stored, the welcome window asks
   (ui/splash.js): CONTINUE puts it back with its ● still lit (it is saved
   nowhere: it must not look as if it were); «start from Init» deletes it.
   Until the answer nothing is written, so the pending session cannot be
   overwritten. A session that cannot be put back stays stored and nothing is
   written during that visit. Off with ?selftest and ?nosplash (tests and tools).
   ===================================================================== */
import { engine as single } from '../engine/AudioEngine.js';
import { sceneOn, getScene, sceneToJSON, isLayer, setLayer } from '../engine/parts.js';
import { ROOM_KEYS } from '../engine/Room.js';
import { toControls } from '../engine/state.js';
import { PARAMS } from '../engine/params.js';
import { library } from '../engine/library.js';
import { CONTROLS, snapshot, loadState } from './registry.js';
import { same, diffKeys, savedRef, setSavedRef } from './history.js';
import { currentPresetId, currentPreset, markPreset, markPresetByName } from './presetBank.js';
import { AS_KEYS, asLocked, setAsLock } from './seqControls.js';
import { loadScene } from './playerControls.js';
import { askOnWelcome } from './splash.js';
import { VERSION } from '../version.js';

export const SESSION_LS = 'subsdj.session.v1';
export const SESSION_FORMAT = 'subsdj-session-v1';
const EVERY_MS = 2000;   // a crash loses at most this much (hiding or closing the page writes at once)

let startup = null;      // the rack as a fresh start leaves it (Init): what «nothing to keep» looks like
let sceneRef = null;     // { core, ok }: what the scene in Parts is compared with
let solo = { ref: null, preset: null, name: '' };   // the single engine's reference while Parts is on
let lastName = '';       // the rack preset's name, kept when the preset is deleted
let restoring = false;   // putting a session back: its events are not new references
let wasOn = false;       // Parts on before this scene-changed (panic sends one too: it is no new reference)
let armed = false, lastBody = null;

const say = t => { const m = document.getElementById('presetMsg'); if (m) m.textContent = t; };
const presetExists = id => { const it = id && library.item(id); return !!(it && it.type === 'preset'); };
const differs = (a, b) => diffKeys(a, b).length > 0;
// The rack's keys (no virtual ones) of an engine state: the single engine underneath Parts
function rackOf(S) {
  const c = toControls(S), o = {};
  for (const k in CONTROLS) if (!CONTROLS[k].virtual && k in c) o[k] = c[k];
  return o;
}

// ---------- would closing now lose anything? ----------
// so = { state, ref, preset }: the rack, its ● reference and its preset (null: none, or deleted)
export function soloDirty(so, lock, base = startup) {
  const { state, ref, preset } = so;
  if (!ref) return differs(base, state);                                   // no reference: anything but the start is yours
  if (differs(ref, state)) return true;                                    // the ● is lit
  if (!preset && differs(base, state)) return true;                        // as loaded, but its preset is gone
  if (lock && AS_KEYS.some(k => !same(k, state[k], base[k]))) return true; // a locked phrase is in no preset
  return false;
}
// The scene as it matters for «is there work»: the sound of each part, its mix, the Room and the
// conductor — not the names, nor which part the rack edits. A part whose player DRIFTS a parameter
// counts with the drift's base: the wandering is the player playing, not an edit.
export function sceneCore(sc) {
  const j = sceneToJSON(sc);
  return {
    room: j.room, conductor: j.conductor,
    parts: j.parts.map((p, i) => {
      const st = { ...p.state }, pl = sc.conductor.players[i];
      for (const k of ROOM_KEYS) delete st[k];                             // the Room's: compared once, in room
      if (pl && pl.driftKey && pl.driftKey !== 'off' && pl.driftBase !== undefined && pl.driftKey in st) st[pl.driftKey] = pl.driftBase;
      return { pan: p.pan, mute: p.mute, state: st };
    }),
  };
}
// Deep equality with the ●'s tolerance (PARAMS keys) or a relative one (the rest)
function near(a, b, k) {
  if (typeof a === 'number' && typeof b === 'number') return k in PARAMS ? same(k, a, b) : Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const x of new Set([...Object.keys(a), ...Object.keys(b)])) if (!near(a[x], b[x], x)) return false;
    return true;
  }
  return a === b;
}
export const sceneDirty = (core, ref) => !ref || !ref.ok || !near(core, ref.core);

// ---------- the session as it would be stored now ----------
export function captureSession() {
  const s = { format: SESSION_FORMAT, app: VERSION, date: new Date().toISOString(), lock: asLocked() };
  if (sceneOn()) {
    const sc = getScene();
    s.solo = { state: rackOf(single.S), ref: solo.ref, preset: presetExists(solo.preset) ? solo.preset : null, name: solo.name };
    s.scene = { json: sceneToJSON(sc), refs: sc.parts.map((_, i) => savedRef(i)), layer: isLayer(), ref: sceneRef };
  } else {
    const cur = currentPreset(); if (cur) lastName = cur.name;
    s.solo = { state: snapshot(), ref: savedRef('solo'), preset: currentPresetId(), name: lastName };
  }
  return s;
}
export function sessionDirty(s) {
  return s.scene ? sceneDirty(sceneCore(getScene()), s.scene.ref) : soloDirty(s.solo, s.lock);
}

// ---------- putting it back ----------
export async function restoreSession(s, audioReady = Promise.resolve()) {
  restoring = true;
  try {
    loadState(s.solo.state);                              // the rack (or the single engine underneath Parts); the lock goes after: locked, it would keep the Arp / Seq out
    markPreset(s.solo.preset);                            // gone from the library: no current preset
    lastName = s.solo.name || '';
    setSavedRef('solo', s.solo.ref);
    if (s.scene) {
      await audioReady;                                   // the parts are engines: they need the audio context
      solo = { ref: s.solo.ref, preset: s.solo.preset, name: s.solo.name || '' };
      await loadScene(s.scene.json);                      // Parts on + the scene; its scene-loaded clears the ● references…
      setSavedRef('solo', s.solo.ref);                    // …so they go back after it
      (s.scene.refs || []).forEach((r, i) => setSavedRef(i, r));
      setLayer(!!s.scene.layer);
      const chk = document.getElementById('layerChk'); if (chk) chk.checked = !!s.scene.layer;
      sceneRef = s.scene.ref || null;
      const sc = getScene(), p = sc.parts[sc.sel];
      if (!(p.presetVal && markPreset(p.presetVal)) && p.presetName) markPresetByName(p.presetName);
    }
    setAsLock(!!s.lock);
    // the Output display shows the preset as it does on loading one (a scene's parts are not «loaded»: it would keep saying Init)
    const name = document.getElementById('presetPickName')?.textContent || '';
    document.dispatchEvent(new CustomEvent('display-show', { detail: { who: 'Preset', val: name, det: 'your unsaved session, brought back' } }));
  } finally { restoring = false; }
}

// ---------- what the welcome window says ----------
// The pieces go joined by « · », and the line may only break there (no-break spaces inside each one)
const piece = t => t.replace(/ /g, ' ');
export function describe(s) {
  if (s.scene) {
    const j = s.scene.json || {};
    return 'Parts' + (j.name ? ' · «' + j.name + '»' : '') + ' · ' + (j.parts || []).map(p => p.name || 'Init').join(', ');
  }
  const so = s.solo, n = diffKeys(so.ref || startup || {}, so.state).length, bits = [so.name ? '«' + so.name + '»' : piece('Your sound')];
  if (n) bits.push(piece(n + (n > 1 ? ' changes' : ' change')));
  else if (!so.preset) bits.push(piece('no longer in the library'));
  if (s.lock) bits.push(piece('Arp / Seq locked'));
  return bits.join(' · ');
}
function whenOf(iso) {
  const d = new Date(iso); if (isNaN(d)) return '';
  const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const ago = Math.round((day(new Date()) - day(d)) / 864e5);
  const dayTxt = ago === 0 ? 'today' : ago === 1 ? 'yesterday'
    : new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  return 'last change ' + dayTxt + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ---------- writing ----------
function write() {
  if (!armed) return;
  let s, dirty;
  try { s = captureSession(); dirty = sessionDirty(s); } catch (e) { return; }   // never break the instrument over this
  try {
    if (!dirty) { if (lastBody !== '') { localStorage.removeItem(SESSION_LS); lastBody = ''; } return; }
    const body = JSON.stringify({ ...s, date: 0 });       // the date is that of the last CHANGE: no change, no write
    if (body === lastBody) return;
    localStorage.setItem(SESSION_LS, JSON.stringify(s));
    lastBody = body;
  } catch (e) { /* storage full or blocked: the session is simply not kept */ }
}
function arm() {
  if (armed) return; armed = true;
  setInterval(write, EVERY_MS);
  addEventListener('pagehide', write);
  document.addEventListener('visibilitychange', () => { if (document.hidden) write(); });
}

// The scene's reference: when Parts goes on (from the rack: «ok» only if the rack had nothing unsaved)
// and when a scene is loaded (library or file: it can be loaded again)
function listen() {
  document.addEventListener('scene-changed', e => {
    const on = !!e.detail.on;
    if (on && !wasOn && !restoring && getScene()) {
      const so = { state: rackOf(single.S), ref: savedRef('solo'), preset: currentPresetId() };
      solo = { ref: so.ref, preset: so.preset, name: currentPreset()?.name || lastName };
      sceneRef = { core: sceneCore(getScene()), ok: !soloDirty(so, asLocked()) };
    }
    if (!on) sceneRef = null;
    wasOn = on;
  });
  document.addEventListener('scene-loaded', () => { if (!restoring && getScene()) sceneRef = { core: sceneCore(getScene()), ok: true }; });
}

// At startup, once the rack is on Init (main.js). audioReady: the engine's init (Parts needs it).
export function initSession(audioReady) {
  const q = new URLSearchParams(location.search);
  if (q.has('selftest') || q.has('nosplash')) return;    // tests and tools: never read, never write
  startup = snapshot();
  listen();
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(SESSION_LS) || 'null'); } catch (e) { /* unreadable: as if there were none */ }
  if (!stored || stored.format !== SESSION_FORMAT || !stored.solo || !stored.solo.state) { arm(); return; }
  const what = describe(stored);
  askOnWelcome({ what, when: whenOf(stored.date) }).then(async choice => {
    if (choice === 'fresh') {
      try { localStorage.removeItem(SESSION_LS); } catch (e) { /* blocked: nothing to delete */ }
      say('Started from Init: the unsaved work was left behind.');
      arm(); return;
    }
    if (choice !== 'continue') return;                     // nobody answered: it stays stored, and nothing is written
    try {
      if (stored.scene) say('Bringing back your session…');
      await restoreSession(stored, audioReady);
      say('Back where you left off: ' + what + '.');
      arm();
    } catch (err) {
      console.error('SubSDJ: could not restore the session', err);
      say('Could not bring back the last session (' + ((err && err.message) || err) + '): it stays stored for the next visit.');
    }
  });
}
