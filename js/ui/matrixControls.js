/* SubSDJ · panel «Matriz de modulación»: MX_SLOTS filas [fuente ▾] → [destino ▾] × knob.
   Las filas se GENERAN aquí desde MX_SOURCES/MX_DESTS (params.js, tabla única):
   el HTML solo aporta el contenedor #mxRows. OJO al orden de arranque: esto
   crea los .knob de cantidad, así que en main.js va ANTES de bindKnobs().
   Los selects se registran en CONTROLS con `opts` (zonas para MIDI learn). */
import { part } from '../engine/parts.js';
import { PARAMS, MX_SLOTS, MX_SOURCES, MX_DESTS } from '../engine/params.js';
import { CONTROLS, applyTarget } from './registry.js';

function bindSel(sel, name, options) {
  for (const o of options) sel.add(new Option(o.label, o.id));
  const set = v => {
    if ([...sel.options].some(x => x.value === v)) sel.value = v;   // valor desconocido: se queda como está
    applyTarget(name, sel.value);
  };
  sel.addEventListener('change', () => { part().resume(); applyTarget(name, sel.value); });
  CONTROLS[name] = { get: () => sel.value, set, def: PARAMS[name].def, el: sel, opts: options.map(o => o.id) };
  set(PARAMS[name].def);
}

export function bindMatrixControls() {
  const host = document.getElementById('mxRows');
  if (!host) return;
  for (let i = 1; i <= MX_SLOTS; i++) {
    const row = document.createElement('div');
    row.className = 'mx-row';
    row.innerHTML =
      `<select id="mx${i}src" title="Fuente de modulación"></select>` +
      `<span class="mx-arrow">→</span>` +
      `<select id="mx${i}dst" title="Destino"></select>` +
      `<div class="ctl"><div class="knob" data-knob="mx${i}amt" title="Cantidad (±)"><div class="ind"></div></div><div class="val"></div></div>`;
    host.appendChild(row);
    bindSel(row.querySelector(`#mx${i}src`), `mx${i}src`, MX_SOURCES);
    bindSel(row.querySelector(`#mx${i}dst`), `mx${i}dst`, MX_DESTS);
  }
}
