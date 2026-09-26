/* SubSDJ · pantalla Presets (13a): todo el banco a la vista, por secciones
   (las mismas del selector rápido), un clic carga. La fuente de verdad sigue
   siendo el <select> de presetBank.js: esta lista lo refleja (MutationObserver:
   guardar, borrar e importar la repueblan solos) y carga por el mismo camino
   que él (value + change). 13b la sustituirá por la biblioteca con secciones
   propias, favoritos y búsqueda. */
export function initPresetScreen() {
  const sel = document.getElementById('presetSelect'), list = document.getElementById('presetList');
  if (!sel || !list) return;

  function render() {
    list.innerHTML = '';
    for (const og of sel.querySelectorAll('optgroup')) {
      const sec = document.createElement('div'); sec.className = 'pl-sec';
      const head = document.createElement('div'); head.className = 'pl-head';
      head.textContent = og.label + ' · ' + og.children.length;
      sec.appendChild(head);
      for (const o of og.children) {
        const b = document.createElement('button'); b.type = 'button';
        b.className = 'pl-item' + (o.value === sel.value ? ' cur' : '');
        b.dataset.v = o.value; b.textContent = o.textContent;
        sec.appendChild(b);
      }
      list.appendChild(sec);
    }
  }
  const mark = () => list.querySelectorAll('.pl-item').forEach(b => b.classList.toggle('cur', b.dataset.v === sel.value));

  list.addEventListener('click', e => {
    const b = e.target.closest('.pl-item'); if (!b) return;
    sel.value = b.dataset.v;
    sel.dispatchEvent(new Event('change'));   // presetBank carga y avisa (preset-loaded)
  });
  sel.addEventListener('change', mark);
  document.addEventListener('preset-loaded', mark);   // ‹ › y program change
  document.addEventListener('part-changed', mark);    // cambiar de parte pone sel.value sin change
  new MutationObserver(render).observe(sel, { childList: true, subtree: true });
  render();
}
