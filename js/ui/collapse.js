/* SubSDJ · paneles colapsables: clic en el título (h2) pliega/despliega el
   grupo. El estado se guarda por título en localStorage (sobrevive recargas). */
const LS_KEY = 'subsdj.panels.v1';

export function initCollapsiblePanels() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { /* JSON corrupto → empezar limpio */ }

  document.querySelectorAll('.panel, .viz-panel').forEach(panel => {
    const h = panel.querySelector('h2');
    if (!h) return;
    const key = h.textContent.trim();
    if (saved[key]) panel.classList.add('collapsed');
    h.title = 'Plegar / desplegar';
    h.addEventListener('click', () => {
      const collapsed = panel.classList.toggle('collapsed');
      if (collapsed) saved[key] = 1; else delete saved[key];
      try { localStorage.setItem(LS_KEY, JSON.stringify(saved)); } catch { /* sin persistencia */ }
      // los canvas (ADSR, scope, espectro) se re-ajustan escuchando resize
      if (!collapsed) window.dispatchEvent(new Event('resize'));
    });
  });
}
