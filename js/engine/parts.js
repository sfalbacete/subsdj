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
   pan, mute}], S (estado de la sala), sel }. Capa: el teclado toca todas.
   Sin persistencia todavía (Roadmap 4.0 · C3 «escenas»).
   ===================================================================== */
import { AudioEngine, engine as single } from './AudioEngine.js';
import { Sala, SALA_KEYS } from './Sala.js';
import { makeDefaultState, applyPreset, toControls } from './state.js';

export const N_PARTS = 4;
let scene = null, current = single, layer = false;

export const part = () => current;                 // el motor que edita el rack / toca el teclado
export const sceneOn = () => scene !== null;
export const getScene = () => scene;
export const isLayer = () => layer;
export function setLayer(on) { layer = !!on; }

// Gestos globales (bend, pánico): a todas las partes en escena, al motor único si no.
export const eachPart = fn => { if (scene) scene.parts.forEach(p => fn(p.engine)); else fn(single); };

// Notas del teclado / MIDI: la parte actual, o todas en modo Capa (las silenciadas no).
export function playOn(id, freq, vel = 1) {
  if (scene && layer) scene.parts.forEach(p => { if (!p.mute) p.engine.noteOn(id, freq, vel); });
  else current.noteOn(id, freq, vel);
}
export function playOff(id) {
  if (scene && layer) scene.parts.forEach(p => p.engine.noteOff(id));
  else current.noteOff(id);
}

// Construye una escena sobre `ctx` (pura: la usan enableScene y el selftest).
// states[i] = preset (claves de PARAMS) con el que nace la parte i.
// salaS = valores iniciales de la sala (SALA_KEYS); por defecto los de PARAMS.
// La sala MANDA sobre lo que traiga cada preset (un solo BPM, una sola sala).
export async function createScene(ctx, states = [], { salaS = null, fb = 0.45, dlyToRev = 0.5, master = 0.7, dest = null } = {}) {
  const S = makeDefaultState();
  if (salaS) for (const k of SALA_KEYS) if (k in salaS) S[k] = salaS[k];
  const sala = new Sala(ctx, S, { fb, dlyToRev, master, dest: dest || ctx.destination });
  const parts = [];
  for (let i = 0; i < N_PARTS; i++) {
    const e = new AudioEngine();
    e.S = applyPreset(makeDefaultState(), states[i] || {});
    for (const k of SALA_KEYS) e.S[k] = S[k];
    await e.init(ctx, { sala });
    parts.push({ i, engine: e, name: 'Parte ' + (i + 1), presetVal: '', presetName: '', pan: 0, mute: false });
  }
  return { ctx, sala, parts, S, sel: 0 };
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
  single.allNotesOff();
  single.sala.setMaster(0);
  current = scene.parts[0].engine;
  return scene;
}
export function disableScene() {
  if (!scene) return;
  for (const p of scene.parts) p.engine.dispose();
  scene.sala.dispose();
  scene = null; layer = false; current = single;
  single.sala.setMaster(single.S.master);
}
export function selectPart(i) { if (!scene || !scene.parts[i]) return; scene.sel = i; current = scene.parts[i].engine; }
export function setPartMute(i, on) { const p = scene && scene.parts[i]; if (!p) return; p.mute = !!on; p.engine.setMute(p.mute); }
export function setPartPan(i, v)   { const p = scene && scene.parts[i]; if (!p) return; p.pan = v; p.engine.setPan(v); }
