/* =====================================================================
   SubSDJ · estado del sintetizador en runtime (espacio-motor).
   Se DERIVA de la tabla única PARAMS (params.js): aquí no hay defaults
   propios, así no pueden divergir motor y UI.
   ===================================================================== */
import { PARAMS } from './params.js';

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
// en loadState. Devuelve el mismo S.
export function applyPreset(S, preset) {
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
