/* =====================================================================
   SubSDJ · Parts — several COMPLETE engines (AudioEngine) on the same
   AudioContext, mixed into a shared Room (engine/Sala.js): the
   send/return model of multitimbral synths. Each part has its own preset,
   voices, Arp/Seq/WaveSeq and inserts (dist, flanger, chorus);
   there is a single Room (delay, reverb, BPM, limiter, master).
   `part()` is the engine the rack EDITS and the keyboard plays: the UI only
   talks to it (registry, keyboard, midi, seq…). With the scene off,
   part() is the usual engine (`engine`) and NOTHING changes.
   Scene = { ctx, sala, parts:[{i, engine, name, presetVal, presetName,
   pan, mute}], S (Room state), sel, conductor }. Layer: the keyboard
   plays all of them. The conductor (engine/Conductor.js) handles harmony and players.
   No persistence yet (Roadmap 4.0 · C3 «scenes»).
   ===================================================================== */
import { AudioEngine, engine as single, loadWorklets } from './AudioEngine.js';
import { Sala, SALA_KEYS } from './Sala.js';
import { makeDefaultState, applyPreset, toControls, withPresetBase } from './state.js';
import { Conductor } from './Conductor.js';
import { PARAMS } from './params.js';
import { factoryPreset } from './presets.js';
import { SCENE_FORMAT, migrateScene } from './legacy.js';

export const ESCENA_FORMATO = SCENE_FORMAT;   // 'subsdj-scene-v2' (the v1 ones, in Spanish, are translated by legacy.migrateScene)

export const N_PARTS = 4;
let scene = null, current = single, layer = false;

export const part = () => current;                 // the engine the rack edits / the keyboard plays
export const sceneOn = () => scene !== null;
export const getScene = () => scene;
export const isLayer = () => layer;
export function setLayer(on) { layer = !!on; }

// Global gestures (bend, panic): to all parts in a scene, otherwise to the single engine.
export const eachPart = fn => { if (scene) scene.parts.forEach(p => fn(p.engine)); else fn(single); };
export const setPerf = (id, v) => eachPart(e => e.setPerf(id, v));   // wheel / aftertouch / expression (0..1): to all parts, like the bend

// Keyboard / MIDI notes: the current part, or all of them in Layer mode (except the
// muted ones). The note-off goes to the SAME engines that received the
// note-on (NoteRouter): if in between the part the rack edits changes, or
// the Layer does, the note is released where it is sounding. It used to go to the current part and the
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
const keyTargets = () => scene && layer ? scene.parts.filter(p => !p.mute).map(p => p.engine) : [current];
export function playOn(id, freq, vel = 1) { router.on(id, keyTargets(), freq, vel); }
export function playOff(id) { router.off(id, [current]); }
export function forgetSounding() { router.clear(); }   // after a general allNotesOff (panic): nothing is sounding any more

// Builds a scene on `ctx` (pure: used by enableScene and the selftest).
// states[i] = preset (PARAMS keys) that part i is born with.
// salaS = initial Room values (SALA_KEYS); by default those of PARAMS.
// The Room OVERRIDES whatever each preset brings (a single BPM, a single Room).
export async function createScene(ctx, states = [], { salaS = null, fb = 0.45, dlyToRev = 0.5, master = 0.7, dest = null } = {}) {
  const S = makeDefaultState();
  if (salaS) for (const k of SALA_KEYS) if (k in salaS) S[k] = salaS[k];
  await loadWorklets(ctx);                                   // the Room may need the plate worklet
  const sala = new Sala(ctx, S, { fb, dlyToRev, master, dest: dest || ctx.destination });
  const parts = [];
  for (let i = 0; i < N_PARTS; i++) {
    const e = new AudioEngine();
    e.S = applyPreset(makeDefaultState(), states[i] || {});
    for (const k of SALA_KEYS) e.S[k] = S[k];
    await e.init(ctx, { sala });
    parts.push({ i, engine: e, name: 'Part ' + (i + 1), presetVal: '', presetName: '', pan: 0, mute: false });
  }
  const scene = { ctx, sala, parts, S, sel: 0, salaCfg: { fb, dlyToRev, master } };
  scene.conductor = new Conductor(scene, { seed: 1 });   // harmony + players + arrangement (C2/C3)
  for (const p of parts) p.engine.harmony = () => scene.conductor.harmony;   // the Seq by «harmony» degrees (5.2)
  return scene;
}

// Applies a state (PARAMS keys) to a LIVE engine without going through the UI —
// the equivalent of loadState for the parts the rack is not editing. The
// Room's keys are skipped (they belong to the scene).
export function applyStateToEngine(e, state) {
  for (const k in state) {
    const p = PARAMS[k]; if (!p || SALA_KEYS.has(k)) continue;
    const t = p.t || k;
    if (t.includes('.')) { const [o, kk] = t.split('.'); e.setOsc(o, kk, state[k]); }
    else e.set(k, state[k]);
  }
}

// ---------- the SCENE as JSON: Room + conductor (seed, harmony, arrangement, players) + parts ----------
export function sceneToJSON(sc) {
  const sala = {}; for (const k of SALA_KEYS) sala[k] = sc.S[k];
  return {
    format: ESCENA_FORMATO, date: new Date().toISOString(),
    room: { ...sala, ...sc.salaCfg },
    conductor: sc.conductor.toJSON(),
    parts: sc.parts.map(p => ({ name: p.presetName, presetVal: p.presetVal, pan: p.pan, mute: p.mute, state: toControls(p.engine.S) })),
  };
}
// A part may come with a full `state` (exported scene) or with a
// factory `preset` + `settings` (hand-written scenes, like the demo).
export function applySceneJSON(sc, j) {
  j = migrateScene(j);   // those up to 1.3.0, in Spanish
  if (!j || j.format !== ESCENA_FORMATO) throw new Error('not a SubSDJ scene (' + ESCENA_FORMATO + ')');
  const s = j.room || {};
  for (const k of SALA_KEYS) if (k in s) sc.sala.set(k, s[k]);
  if (typeof s.fb === 'number') { sc.salaCfg.fb = s.fb; sc.sala.setFeedback(s.fb); }
  if (typeof s.dlyToRev === 'number') { sc.salaCfg.dlyToRev = s.dlyToRev; sc.sala.setDlyToRev(s.dlyToRev); }
  if (typeof s.master === 'number') { sc.salaCfg.master = s.master; sc.sala.setMaster(s.master); }
  (j.parts || []).forEach((pj, i) => {
    const p = sc.parts[i]; if (!p) return;
    let st = pj.state;
    if (!st && pj.preset) st = { ...(factoryPreset(pj.preset) || {}), ...(pj.settings || {}) };
    if (st) { p.engine.allNotesOff(); applyStateToEngine(p.engine, { ...toControls(makeDefaultState()), ...withPresetBase(st) }); }   // clean base + state (over the preset base)
    p.presetName = pj.name || pj.preset || p.presetName;
    p.presetVal = pj.presetVal || (pj.preset ? 'f:' + pj.preset : p.presetVal);
    if (typeof pj.pan === 'number') { p.pan = pj.pan; p.engine.setPan(pj.pan); }
    p.mute = !!pj.mute; p.engine.setMute(p.mute);
  });
  if (j.conductor) sc.conductor.fromJSON(j.conductor);
}

// Turns on Parts mode on the single engine's context. Part 1
// inherits the sound that was there (and the Room, its settings); the single engine is
// muted and stays alive to come back to.
export async function enableScene() {
  if (scene) return scene;
  if (!single.ready) throw new Error('the audio is not ready yet');
  const S = single.S;
  scene = await createScene(single.ctx, [toControls(S)],
    { salaS: S, fb: S.dlyFb, dlyToRev: S.reverbMix, master: S.master });
  single.allNotesOff(); router.clear();
  single.sala.setMaster(0);
  current = scene.parts[0].engine;
  return scene;
}
export function disableScene() {
  if (!scene) return;
  scene.conductor.stop();
  for (const p of scene.parts) p.engine.dispose();
  scene.sala.dispose();
  scene = null; layer = false; current = single; router.clear();
  single.sala.setMaster(single.S.master);
}
export function selectPart(i) { if (!scene || !scene.parts[i]) return; scene.sel = i; current = scene.parts[i].engine; }
export function setPartMute(i, on) { const p = scene && scene.parts[i]; if (!p) return; p.mute = !!on; p.engine.setMute(p.mute); }
export function setPartPan(i, v)   { const p = scene && scene.parts[i]; if (!p) return; p.pan = v; p.engine.setPan(v); }
