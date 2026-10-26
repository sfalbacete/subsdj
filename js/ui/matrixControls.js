/* SubSDJ · panel «Matriz de modulación»: MX_SLOTS filas [fuente ▾] → [destino ▾] × knob.
   Las filas se GENERAN aquí desde MX_SOURCES/MX_DESTS (params.js, tabla única):
   el HTML solo aporta el contenedor #mxRows. OJO al orden de arranque: esto
   crea los .knob de cantidad, así que en main.js va ANTES de bindKnobs().
   Los selects se registran en CONTROLS con `opts` (zonas para MIDI learn). */
import { MX_SLOTS, MX_SOURCES, MX_DESTS } from '../engine/params.js';
import { bindSelect as bindSel } from './registry.js';

export function bindMatrixControls() {
  const host = document.getElementById('mxRows');
  if (!host) return;
  for (let i = 1; i <= MX_SLOTS; i++) {
    const row = document.createElement('div');
    row.className = 'mx-row';
    row.innerHTML =
      `<select id="mx${i}src" title="Modulation source"></select>` +
      `<span class="mx-arrow">→</span>` +
      `<select id="mx${i}dst" title="Destination"></select>` +
      `<div class="ctl ks" data-lab="Slot ${i} · amount"><div class="knob" data-knob="mx${i}amt" title="Amount (±)"><div class="ind"></div></div><div class="val"></div></div>`;
    host.appendChild(row);
    bindSel(row.querySelector(`#mx${i}src`), `mx${i}src`, MX_SOURCES);
    bindSel(row.querySelector(`#mx${i}dst`), `mx${i}dst`, MX_DESTS);
  }
}
