/* =====================================================================
   SubSDJ · Parts — several COMPLETE engines (AudioEngine) on the same
   AudioContext, mixed into a shared Room (engine/Room.js): the
   send/return model of multitimbral synths. Each part has its own preset,
   voices, Arp/Seq/WaveSeq and inserts (dist, flanger, chorus);
   there is a single Room (delay, reverb, BPM, limiter, master).
   `part()` is the engine the rack EDITS and the keyboard plays: the UI only
   talks to it (registry, keyboard, midi, seq…). With the scene off,
   part() is the usual engine (`engine`) and NOTHING changes.
   Scene = { ctx, room, parts:[{i, engine, name, presetVal, presetName,
   pan, mute, zone}], S (Room state), sel, keyMode, conductor }.
   KEY ZONES: with keyMode 'zones' a key goes to every part whose zone
   (a range of MIDI notes) holds it — a split, or a layer where two zones
   overlap; with 'part', to the part the rack edits. The conductor
   (engine/Conductor.js) handles harmony and players.
   No persistence yet (Roadmap 4.0 · C3 «scenes»).
   ===================================================================== */
import { AudioEngine, engine as single, loadWorklets } from './AudioEngine.js';
import { Room, ROOM_KEYS } from './Room.js';
import { makeDefaultState, applyPreset, toControls, withPresetBase } from './state.js';
import { Conductor } from './Conductor.js';
import { PARAMS } from './params.js';
import { factoryPreset } from './presets.js';
import { SCENE_FORMAT, migrateScene, unreadableReason } from './legacy.js';

export { SCENE_FORMAT };   // 'subsdj-scene-v2' (the v1 ones, in Spanish, are translated by legacy.migrateScene)

export const N_PARTS = 4;
let scene = null, current = single;

export const part = () => current;                 // the engine the rack edits / the keyboard plays
export const sceneOn = () => scene !== null;
export const getScene = () => scene;

// ---------- key zones ----------
// Who the keyboard plays. 'part': the part the rack edits (the usual). 'zones': every part whose ZONE holds
// the note — each part has a range of MIDI notes (lo..hi, both included) or none (zone.on false: only its
// player plays it). Two zones side by side are a split, two that overlap a layer; a note no zone holds is
// silent. Each part still has its own Arp / Seq / Latch on the common clock, so a hand on each zone can hold
// a latched arpeggio and play over it. The mode and the zones belong to the scene and are saved with it.
export const KEY_MODES = ['part', 'zones'];
export const NOTE_MAX = 127;
// A scene is born split at middle C: part 1 below it, part 2 from it up (on the computer keyboard, the bottom
// row and the top row); parts 3 and 4 with no keys — the room left for the players.
export const SPLIT_DEF = 60;
export const zoneDef = i => (i === 0 ? { on: true, lo: 0, hi: SPLIT_DEF - 1 } : i === 1 ? { on: true, lo: SPLIT_DEF, hi: NOTE_MAX } : { on: false, lo: 0, hi: NOTE_MAX });
const noteClamp = (v, d) => (Number.isFinite(+v) ? Math.max(0, Math.min(NOTE_MAX, Math.round(+v))) : d);
// A zone from anything (a scene file, the UI): whole notes inside 0..127, lo ≤ hi
export function cleanZone(z, def) {
  z = z || {};
  let lo = noteClamp(z.lo, def.lo), hi = noteClamp(z.hi, def.hi);
  if (lo > hi) [lo, hi] = [hi, lo];
  return { on: z.on === undefined ? def.on : !!z.on, lo, hi };
}
export const zoneHolds = (p, midi) => p.zone.on && midi >= p.zone.lo && midi <= p.zone.hi;
export const keyMode = (sc = scene) => (sc ? sc.keyMode : 'part');
export function setKeyMode(m, sc = scene) { if (sc) sc.keyMode = m === 'zones' ? 'zones' : 'part'; }
export function setPartZone(i, z, sc = scene) { const p = sc && sc.parts[i]; if (!p) return null; p.zone = cleanZone({ ...p.zone, ...z }, p.zone); return p.zone; }
// The parts (of the live scene) a key may reach right now, whatever the note: the ones a take has to listen to
export const keyParts = () => (scene && scene.keyMode === 'zones' ? scene.parts.filter(p => p.zone.on) : scene ? [scene.parts[scene.sel]] : []);
export const partOfEngine = e => (scene ? scene.parts.find(p => p.engine === e) || null : null);

// Global gestures (bend, panic): to all parts in a scene, otherwise to the single engine.
export const eachPart = fn => { if (scene) scene.parts.forEach(p => fn(p.engine)); else fn(single); };
export const setPerf = (id, v) => eachPart(e => e.setPerf(id, v));   // wheel / aftertouch / expression (0..1): to all parts, like the bend

// Keyboard / MIDI notes: the current part, or — with key zones — the parts whose zone holds the note
// (except the muted ones). The note-off goes to the SAME engines that received the
// note-on (NoteRouter): if in between the part the rack edits changes, or
// a zone does, the note is released where it is sounding. It used to go to the current part and the
// note got stuck in the other one: a voice taken forever (with several,
// voice stealing ate the player's notes) and, in mono, the player's following
// notes slid in legato over it instead of retriggering.
export class NoteRouter {
  constructor() { this.sounding = new Map(); }   // id → engines that received the noteOn
  on(id, engines, freq, vel = 1) {
    if (this.sounding.has(id)) this.off(id);     // same id twice: release the previous one wherever it is
    this.sounding.set(id, engines);
    for (const e of engines) e.noteOn(id, freq, vel);
  }
  off(id, fallback = []) {
    const targets = this.sounding.get(id) || fallback;
    this.sounding.delete(id);
    for (const e of targets) if (e.ready) e.noteOff(id);   // a torn-down engine (scene off) has nothing to release
  }
  clear() { this.sounding.clear(); }
}
const router = new NoteRouter();
const midiOf = freq => Math.round(69 + 12 * Math.log2(freq / 440));
export const keyTargets = (midi, sc = scene) => sc && sc.keyMode === 'zones' ? sc.parts.filter(p => !p.mute && zoneHolds(p, midi)).map(p => p.engine) : [sc ? sc.parts[sc.sel].engine : current];
// The tap: whoever records what is PLAYED (the players' pattern take, ui/playerControls.js) hears every live
// key here — (true, id, freq, vel, engines) / (false, id) — before it sounds; `engines` are the parts the key
// goes to (its zone's), so a take can write it down for each of them. It only listens: the note goes its usual way.
let noteTap = null;
export function setNoteTap(fn) { noteTap = fn; }
export function playOn(id, freq, vel = 1) { const to = keyTargets(midiOf(freq)); if (noteTap) noteTap(true, id, freq, vel, to); router.on(id, to, freq, vel); }
export function playOff(id) { if (noteTap) noteTap(false, id); router.off(id, [current]); }
export function forgetSounding() { router.clear(); }   // after a general allNotesOff (panic): nothing is sounding any more

// Builds a scene on `ctx` (pure: used by enableScene and the selftest).
// states[i] = preset (PARAMS keys) that part i is born with.
// roomS = initial Room values (ROOM_KEYS); by default those of PARAMS.
// The Room OVERRIDES whatever each preset brings (a single BPM, a single Room).
export async function createScene(ctx, states = [], { roomS = null, fb = 0.45, dlyToRev = 0.5, master = 0.7, dest = null } = {}) {
  const S = makeDefaultState();
  if (roomS) for (const k of ROOM_KEYS) if (k in roomS) S[k] = roomS[k];
  await loadWorklets(ctx);                                   // the Room may need the plate worklet
  const room = new Room(ctx, S, { fb, dlyToRev, master, dest: dest || ctx.destination });
  const parts = [];
  for (let i = 0; i < N_PARTS; i++) {
    const e = new AudioEngine();
    e.S = applyPreset(makeDefaultState(), states[i] || {});
    for (const k of ROOM_KEYS) e.S[k] = S[k];
    await e.init(ctx, { room });
    parts.push({ i, engine: e, name: 'Part ' + (i + 1), presetVal: '', presetName: '', label: '', pan: 0, mute: false, zone: zoneDef(i) });
  }
  const scene = { ctx, room, parts, S, sel: 0, keyMode: 'part', roomCfg: { fb, dlyToRev, master } };
  scene.conductor = new Conductor(scene, { seed: 1 });   // harmony + players + arrangement (C2/C3)
  for (const p of parts) p.engine.harmony = () => scene.conductor.harmony;   // the Seq by «harmony» degrees (5.2)
  return scene;
}

// Applies a state (PARAMS keys) to a LIVE engine without going through the UI —
// the equivalent of loadState for the parts the rack is not editing. The
// Room's keys are skipped (they belong to the scene).
export function applyStateToEngine(e, state) {
  for (const k in state) {
    const p = PARAMS[k]; if (!p || ROOM_KEYS.has(k)) continue;
    const t = p.t || k;
    if (t.includes('.')) { const [o, kk] = t.split('.'); e.setOsc(o, kk, state[k]); }
    else e.set(k, state[k]);
  }
}

// What a part is CALLED. A part holds its whole sound (its state), so it doesn't need the preset it came
// from; `presetName` / `presetVal` only remember that preset, to mark it in the selector if you still have
// it. `label` is the part's own name, given by hand and saved with the scene: it wins over the preset's,
// and loading another preset into the part clears it (the part is called after what it holds again).
export const partLabel = p => p.label || p.presetName || 'Init';

// ---------- the SCENE as JSON: Room + conductor (seed, harmony, arrangement, players) + parts ----------
export function sceneToJSON(sc) {
  const room = {}; for (const k of ROOM_KEYS) room[k] = sc.S[k];
  return {
    format: SCENE_FORMAT, name: sc.name || undefined, date: new Date().toISOString(),   // the name travels with the scene (an exported one used to come back as «Imported scene»)
    room: { ...room, ...sc.roomCfg },
    conductor: sc.conductor.toJSON(),
    parts: sc.parts.map(p => ({ name: p.presetName, label: p.label || undefined, presetVal: p.presetVal, pan: p.pan, mute: p.mute, zone: { ...p.zone }, state: toControls(p.engine.S) })),
    keys: sc.sel + 1,   // the part the keyboard plays (1-4): a scene can reserve one for the player
    keyMode: sc.keyMode,   // 'part' (that one) | 'zones' (each part's `zone`: { on, lo, hi } in MIDI notes)
  };
}
// A part may come with a full `state` (exported scene) or with a
// factory `preset` + `settings` (hand-written scenes, like the demo).
export function applySceneJSON(sc, j) {
  j = migrateScene(j);   // those up to 1.3.0, in Spanish
  if (!j || j.format !== SCENE_FORMAT) throw new Error(unreadableReason(j) || 'not a SubSDJ scene (' + SCENE_FORMAT + ')');
  if (typeof j.name === 'string' && j.name) sc.name = j.name;
  const s = j.room || {};
  for (const k of ROOM_KEYS) if (k in s) sc.room.set(k, s[k]);
  if (typeof s.fb === 'number') { sc.roomCfg.fb = s.fb; sc.room.setFeedback(s.fb); }
  if (typeof s.dlyToRev === 'number') { sc.roomCfg.dlyToRev = s.dlyToRev; sc.room.setDlyToRev(s.dlyToRev); }
  if (typeof s.master === 'number') { sc.roomCfg.master = s.master; sc.room.setMaster(s.master); }
  (j.parts || []).forEach((pj, i) => {
    const p = sc.parts[i]; if (!p) return;
    let st = pj.state;
    if (!st && pj.preset) st = { ...(factoryPreset(pj.preset) || {}), ...(pj.settings || {}) };
    if (st) { p.engine.allNotesOff(); applyStateToEngine(p.engine, { ...toControls(makeDefaultState()), ...withPresetBase(st) }); }   // clean base + state (over the preset base)
    p.presetName = pj.name || pj.preset || p.presetName;
    p.label = typeof pj.label === 'string' ? pj.label : '';
    p.presetVal = pj.presetVal || (pj.preset ? 'f:' + pj.preset : p.presetVal);
    if (typeof pj.pan === 'number') { p.pan = pj.pan; p.engine.setPan(pj.pan); }
    p.mute = !!pj.mute; p.engine.setMute(p.mute);
    p.zone = cleanZone(pj.zone, zoneDef(i));   // scenes from before the zones: the split a scene is born with
  });
  sc.parts.forEach((p, i) => { if (!(j.parts || [])[i]) p.zone = zoneDef(i); });
  sc.keyMode = j.keyMode === 'zones' ? 'zones' : 'part';
  if (j.conductor) sc.conductor.fromJSON(j.conductor);
  // «keys»: the part reserved for the player (its player is usually off); the rack edits it and the keyboard plays it
  if (j.keys >= 1 && sc.parts[j.keys - 1]) { sc.sel = j.keys - 1; if (sc === scene) current = sc.parts[sc.sel].engine; }
}

// Turns on Parts mode on the single engine's context. Part 1
// inherits the sound that was there (and the Room, its settings); the single engine is
// muted and stays alive to come back to.
// born: the preset the other parts are born with (the UI passes Init, the blank page; {} = the neutral)
// The scene's Room as it is born from the rack: its settings, and a NEUTRAL master (1 = 0 dB). Part 1
// keeps the preset's Master as its fader, so it sounds exactly as it did with Parts off. The scene master
// used to start at the preset's Master as well: the part came out at Master² — with the makeups presets
// carry since 1.1.0 (up to ×4), up to +12 dB the moment Parts went on, and a ×0.47 one 7 dB quieter
// (measured by Sergio's ear and then by the selftest, 2026-11-07). Scene files bring their own master.
export const sceneFromRack = S => ({ roomS: S, fb: S.dlyFb, dlyToRev: S.reverbMix, master: 1 });
export async function enableScene(born = {}) {
  if (scene) return scene;
  if (!single.ready) throw new Error('the audio is not ready yet');
  const S = single.S;
  scene = await createScene(single.ctx, Array.from({ length: N_PARTS }, (_, i) => (i ? born : toControls(S))), sceneFromRack(S));
  single.allNotesOff(); router.clear();
  single.room.setMaster(0);
  current = scene.parts[0].engine;
  return scene;
}
export function disableScene() {
  if (!scene) return;
  scene.conductor.stop();
  for (const p of scene.parts) p.engine.dispose();
  scene.room.dispose();
  scene = null; current = single; router.clear();
  single.room.setMaster(single.S.master);
}
export function selectPart(i) { if (!scene || !scene.parts[i]) return; scene.sel = i; current = scene.parts[i].engine; }
export function setPartMute(i, on) { const p = scene && scene.parts[i]; if (!p) return; p.mute = !!on; p.engine.setMute(p.mute); }
export function setPartPan(i, v)   { const p = scene && scene.parts[i]; if (!p) return; p.pan = v; p.engine.setPan(v); }
