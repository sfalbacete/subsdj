/* =====================================================================
   SubSDJ · estado del sintetizador en runtime (espacio-motor).
   Se DERIVA de la tabla única PARAMS (params.js): aquí no hay defaults
   propios, así no pueden divergir motor y UI.
   ===================================================================== */
import { PARAMS, PRESET_BASE } from './params.js';

// Mezclador (1.2.0): antes la voz sumaba (1−ring)·[(1−mix)·A + mix·B] + ring·A×B;
// ahora levelA·A + levelB·B + ring·A×B. Un preset SIN levelA/levelB es de antes
// (o hereda los niveles de la base): con Mix o con Ring se traduce EXACTO
// — mismos coeficientes, mismo sonido —; sin ninguno de los dos, la base ya
// lleva los niveles del Mix 0,4 de entonces. Las bibliotecas guardan COPIAS de
// los presets, así que esta traducción es para siempre, no de una vez.
const LEGACY_MIX = 0.4;                                     // el Mix de la base de antes
const r6 = x => Math.round(x * 1e6) / 1e6;                  // 0,7·0,5 → 0,35, no 0,35000000000000003
export function migrateMix(p) {
  if (!p || 'levelA' in p || 'levelB' in p || !('mix' in p || p.ring > 0)) return p;
  const { mix = LEGACY_MIX, ...q } = p, ring = p.ring || 0;
  q.levelA = r6((1 - ring) * (1 - mix));
  q.levelB = r6((1 - ring) * mix);
  return q;
}

// Delay (Roadmap 7.0 · 4.1): la realimentación era 0,85·Amount (tope 0,8) y ahora tiene su
// knob (dlyFb). Un preset SIN dlyFb es de antes: la recibe calculada así — el mismo eco, exacto.
export function migrateFb(p) {
  if (!p || 'dlyFb' in p) return p;
  return { ...p, dlyFb: r6(Math.min(0.8, ('dlyAmt' in p ? p.dlyAmt : PARAMS.dlyAmt.def) * 0.85)) };
}

// Un preset es una DIFERENCIA sobre PRESET_BASE (params.js), no sobre los
// defaults neutros: así los de siempre suenan igual. {} = Reset (sin base).
export const withPresetBase = p => (p && Object.keys(p).length ? { ...PRESET_BASE, ...migrateFb(migrateMix(p)) } : {});

export function makeDefaultState() {
  const S = { oscA: {}, oscB: {} };
  for (const name in PARAMS) {
    const p = PARAMS[name], t = p.t || name;
    if (t.includes('.')) { const [o, k] = t.split('.'); S[o][k] = p.def; }
    else S[t] = p.def;
  }
  return S;
}

// Preset (claves de PARAMS, espacio-motor) -> estado S, SIN pasar por la UI
// (las partes nacen con su preset). Claves desconocidas: se ignoran, como
// en loadState. Va sobre la base de los presets. Devuelve el mismo S.
export function applyPreset(S, preset) {
  preset = withPresetBase(preset);
  for (const name in preset) {
    const p = PARAMS[name]; if (!p) continue;
    const t = p.t || name;
    if (t.includes('.')) { const [o, k] = t.split('.'); S[o][k] = preset[name]; }
    else S[t] = preset[name];
  }
  return S;
}
// Estado S -> objeto con las claves de PARAMS (lo que enseñan los controles):
// la inversa de applyPreset; al cambiar de parte el rack la vuelca (syncControls).
export function toControls(S) {
  const o = {};
  for (const name in PARAMS) {
    const t = PARAMS[name].t || name;
    if (t.includes('.')) { const [a, k] = t.split('.'); o[name] = S[a][k]; }
    else o[name] = S[t];
  }
  return o;
}
