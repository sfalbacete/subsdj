/* SubSDJ · secciones plegables del rack (Osciladores, Filtro, Efectos…):
   clic en el título pliega/despliega la sección entera y libera su sitio
   (no es el plegado de módulos de antes, que en una rejilla de unidades no
   ganaba nada); doble clic deja SOLO esa sección abierta, para trabajar en
   ella. El estado se recuerda por título en localStorage. */
const LS_KEY = 'subsdj.groups.v1';

export function initGroups() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { /* JSON corrupto → limpio */ }
  const groups = [...document.querySelectorAll('.rack-group')].filter(g => g.querySelector('.rack-title'));
  const key = g => g.querySelector('.rack-title').textContent.trim();
  const save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(saved)); } catch { /* sin persistencia */ } };
  const set = (g, collapsed) => { g.classList.toggle('collapsed', collapsed); if (collapsed) saved[key(g)] = 1; else delete saved[key(g)]; };
  const done = () => { save(); window.dispatchEvent(new Event('resize')); };   // los canvas que estaban ocultos medían 0
  for (const g of groups) {
    set(g, !!saved[key(g)]);
    const h = g.querySelector('.rack-title');
    h.addEventListener('click', () => { set(g, !g.classList.contains('collapsed')); done(); });
    h.addEventListener('dblclick', () => { for (const o of groups) set(o, o !== g); done(); });   // solo esta
  }
}
