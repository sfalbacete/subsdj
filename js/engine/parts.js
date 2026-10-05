/* =====================================================================
   SubSDJ · Partes — varios motores COMPLETOS (AudioEngine) sobre un mismo
   AudioContext, mezclados en una Sala compartida (engine/Sala.js): el
   modelo send/return de los multitímbricos. Cada parte tiene su preset,
   sus voces, su Arp/Seq/WaveSeq y sus inserciones (dist, flanger, chorus);
   la sala (delay, reverb, BPM, limitador, máster) es una.
   `part()` es el motor que EDITA el rack y que toca el teclado: la UI solo
   habla con él (registry, keyboard, midi, seq…). Con la escena apagada,
   part() es el motor de siempre (`engine`) y NADA cambia.
   Escena = { ctx, sala, parts:[{i, engine, name, presetVal, presetName,
   pan, mute}], S (estado de la sala), sel, conductor }. Capa: el teclado
   toca todas. El director (engine/Conductor.js) lleva armonía y jugadores.
   Sin persistencia todavía (Roadmap 4.0 · C3 «escenas»).
   ===================================================================== */
import { AudioEngine, engine as single, loadWorklets } from './AudioEngine.js';
import { Sala, SALA_KEYS } from './Sala.js';
import { makeDefaultState, applyPreset, toControls, withPresetBase } from './state.js';
import { Conductor } from './Conductor.js';
import { PARAMS } from './params.js';
import { factoryPreset } from './presets.js';

export const ESCENA_FORMATO = 'subsdj-escena-v1';

export const N_PARTS = 4;
let scene = null, current = single, layer = false;

export const part = () => current;                 // el motor que edita el rack / toca el teclado
export const sceneOn = () => scene !== null;
export const getScene = () => scene;
export const isLayer = () => layer;
export function setLayer(on) { layer = !!on; }

// Gestos globales (bend, pánico): a todas las partes en escena, al motor único si no.
export const eachPart = fn => { if (scene) scene.parts.forEach(p => fn(p.engine)); else fn(single); };
export const setPerf = (id, v) => eachPart(e => e.setPerf(id, v));   // rueda / aftertouch / expresión (0..1): a todas las partes, como el bend

// Notas del teclado / MIDI: la parte actual, o todas en modo Capa (las
// silenciadas no). El note-off va a los MISMOS motores que recibieron el
// note-on (NoteRouter): si entre medias cambia la parte que edita el rack, o
// la Capa, la nota se suelta donde suena. Antes iba a la parte actual y la
// nota quedaba colgada en la otra: una voz ocupada para siempre (con varias,
// el robo de voz se comía las notas del jugador) y, en mono, las notas
// siguientes del jugador resbalaban en legato sobre ella en vez de re-disparar.
export class NoteRouter {
  constructor() { this.sounding = new Map(); }   // id → motores que recibieron el noteOn
  on(id, engines, freq, vel = 1) {
    if (this.sounding.has(id)) this.off(id);     // mismo id dos veces: suelta la anterior donde esté
    this.sounding.set(id, engines);
    for (const e of engines) e.noteOn(id, freq, vel);
  }
  off(id, fallback = []) {
    const targets = this.sounding.get(id) || fallback;
    this.sounding.delete(id);
    for (const e of targets) if (e.ready) e.noteOff(id);   // un motor desmontado (escena apagada) no tiene nada que soltar
  }
  clear() { this.sounding.clear(); }
}
const router = new NoteRouter();
const keyTargets = () => scene && layer ? scene.parts.filter(p => !p.mute).map(p => p.engine) : [current];
export function playOn(id, freq, vel = 1) { router.on(id, keyTargets(), freq, vel); }
export function playOff(id) { router.off(id, [current]); }
export function forgetSounding() { router.clear(); }   // tras un allNotesOff general (pánico): ya no suena nada

// Construye una escena sobre `ctx` (pura: la usan enableScene y el selftest).
// states[i] = preset (claves de PARAMS) con el que nace la parte i.
// salaS = valores iniciales de la sala (SALA_KEYS); por defecto los de PARAMS.
// La sala MANDA sobre lo que traiga cada preset (un solo BPM, una sola sala).
export async function createScene(ctx, states = [], { salaS = null, fb = 0.45, dlyToRev = 0.5, master = 0.7, dest = null } = {}) {
  const S = makeDefaultState();
  if (salaS) for (const k of SALA_KEYS) if (k in salaS) S[k] = salaS[k];
  await loadWorklets(ctx);                                   // la Sala puede necesitar el worklet de la placa
  const sala = new Sala(ctx, S, { fb, dlyToRev, master, dest: dest || ctx.destination });
  const parts = [];
  for (let i = 0; i < N_PARTS; i++) {
    const e = new AudioEngine();
    e.S = applyPreset(makeDefaultState(), states[i] || {});
    for (const k of SALA_KEYS) e.S[k] = S[k];
    await e.init(ctx, { sala });
    parts.push({ i, engine: e, name: 'Parte ' + (i + 1), presetVal: '', presetName: '', pan: 0, mute: false });
  }
  const scene = { ctx, sala, parts, S, sel: 0, salaCfg: { fb, dlyToRev, master } };
  scene.conductor = new Conductor(scene, { seed: 1 });   // armonía + jugadores + arreglo (C2/C3)
  return scene;
}

// Aplica un estado (claves de PARAMS) a un motor VIVO sin pasar por la UI —
// el equivalente de loadState para las partes que no edita el rack. Las
// claves de la sala se saltan (son de la escena).
export function applyStateToEngine(e, state) {
  for (const k in state) {
    const p = PARAMS[k]; if (!p || SALA_KEYS.has(k)) continue;
    const t = p.t || k;
    if (t.includes('.')) { const [o, kk] = t.split('.'); e.setOsc(o, kk, state[k]); }
    else e.set(k, state[k]);
  }
}

// ---------- la ESCENA como JSON: sala + director (semilla, armonía, arreglo, jugadores) + partes ----------
export function sceneToJSON(sc) {
  const sala = {}; for (const k of SALA_KEYS) sala[k] = sc.S[k];
  return {
    formato: ESCENA_FORMATO, fecha: new Date().toISOString(),
    sala: { ...sala, ...sc.salaCfg },
    director: sc.conductor.toJSON(),
    partes: sc.parts.map(p => ({ nombre: p.presetName, presetVal: p.presetVal, pan: p.pan, mute: p.mute, estado: toControls(p.engine.S) })),
  };
}
// Una parte puede venir con `estado` completo (escena exportada) o con
// `preset` de fábrica + `ajustes` (escenas escritas a mano, como la demo).
export function applySceneJSON(sc, j) {
  if (!j || j.formato !== ESCENA_FORMATO) throw new Error('no es una escena SubSDJ (' + ESCENA_FORMATO + ')');
  const s = j.sala || {};
  for (const k of SALA_KEYS) if (k in s) sc.sala.set(k, s[k]);
  if (typeof s.fb === 'number') { sc.salaCfg.fb = s.fb; sc.sala.setFeedback(s.fb); }
  if (typeof s.dlyToRev === 'number') { sc.salaCfg.dlyToRev = s.dlyToRev; sc.sala.setDlyToRev(s.dlyToRev); }
  if (typeof s.master === 'number') { sc.salaCfg.master = s.master; sc.sala.setMaster(s.master); }
  (j.partes || []).forEach((pj, i) => {
    const p = sc.parts[i]; if (!p) return;
    let st = pj.estado;
    if (!st && pj.preset) st = { ...(factoryPreset(pj.preset) || {}), ...(pj.ajustes || {}) };
    if (st) { p.engine.allNotesOff(); applyStateToEngine(p.engine, { ...toControls(makeDefaultState()), ...withPresetBase(st) }); }   // base limpia + estado (sobre la base de los presets)
    p.presetName = pj.nombre || pj.preset || p.presetName;
    p.presetVal = pj.presetVal || (pj.preset ? 'f:' + pj.preset : p.presetVal);
    if (typeof pj.pan === 'number') { p.pan = pj.pan; p.engine.setPan(pj.pan); }
    p.mute = !!pj.mute; p.engine.setMute(p.mute);
  });
  if (j.director) sc.conductor.fromJSON(j.director);
}

// Enciende el modo Partes sobre el contexto del motor único. La parte 1
// hereda el sonido que había (y la sala, sus ajustes); el motor único se
// silencia y sigue vivo para volver.
export async function enableScene() {
  if (scene) return scene;
  if (!single.ready) throw new Error('el audio aún no está listo');
  const S = single.S;
  scene = await createScene(single.ctx, [toControls(S)],
    { salaS: S, fb: Math.min(0.8, S.dlyAmt * 0.85), dlyToRev: S.reverbMix, master: S.master });
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
