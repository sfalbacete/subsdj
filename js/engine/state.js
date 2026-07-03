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
