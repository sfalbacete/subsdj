/* SubSDJ · «Modulation matrix» panel: MX_SLOTS rows [source ▾] → [destination ▾] × knob.
   The rows are GENERATED here from MX_SOURCES/MX_DESTS (params.js, single table):
   the HTML only provides the #mxRows container. MIND the startup order: this
   creates the amount .knob elements, so in main.js it goes BEFORE bindKnobs().
   The selects are registered in CONTROLS with `opts` (zones for MIDI learn). */
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
