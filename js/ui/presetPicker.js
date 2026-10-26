/* SubSDJ · selector rápido de presets (cabecera). Sustituye al <select>:
   con 300 presets en 16 secciones, un desplegable largo no se recorre.
   El botón enseña el preset actual; al abrirlo, un panel con buscador
   (sin acentos ni mayúsculas), las categorías a la izquierda (Todos,
   ★ Favoritos y cada sección, con cuántos coinciden con lo buscado) y la
   lista a la derecha. Pensado para PROBAR deprisa:
     clic          carga y deja el panel abierto (el foco sale del buscador:
                   el teclado del PC vuelve a tocar notas para escucharlo)
     ↑ ↓           mueve y carga (como ‹ ›, dentro de lo filtrado)
     Intro / doble clic   carga y cierra
     Esc / clic fuera     cierra (Esc no hace pánico mientras esté abierto)
   «Navegar todos» lleva a la pantalla Presets con la misma búsqueda. Solo
   presets: las escenas viven en la pantalla Presets. Aquí solo se pinta:
   cargar va por presetBank (el mismo camino que ‹ › y la pantalla Presets). */
import { library, normaliza } from '../engine/library.js';
import { loadPresetId, currentPreset, currentPresetId } from './presetBank.js';
import { showScreen } from './screens.js';

const $ = id => document.getElementById(id);
const ALL = '*', FAV = '★';           // categorías que no son secciones
let btn, nameEl, pop, search, cats, list, count;
let q = '', cat = ALL, hi = null, vis = [];   // hi: el resaltado (cursor de ↑ ↓); vis: ids visibles en orden

const isOpen = () => !pop.hidden;
function mk(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

function label() {
  const it = currentPreset();
  nameEl.textContent = it ? it.name : '—';
  btn.title = (it ? it.name + ' · ' + (library.seccion(it.section)?.name || '') + '\n' : '') +
    'Elegir preset: buscar, filtrar por categoría, ↑ ↓ para probar (‹ › recorren la biblioteca entera)';
}

// Lo que coincide con la búsqueda, por categoría (para los contadores) y lo de la elegida
function matches() {
  const nq = normaliza(q);
  return library.presets().filter(it => !nq || normaliza(it.name).includes(nq));
}
const inCat = (it, c) => c === ALL || (c === FAV ? it.fav : it.section === c);

function render() {
  const hits = matches(), cur = currentPresetId();
  // categorías: Todos, ★ (si hay favoritos) y cada sección que tenga presets
  cats.innerHTML = '';
  const secs = library.secciones().filter(s => library.items(s.id).some(it => it.type === 'preset'));
  const entries = [[ALL, 'Todos'], ...(library.presets().some(it => it.fav) ? [[FAV, '★ Favoritos']] : []), ...secs.map(s => [s.id, s.name])];
  if (!entries.some(([id]) => id === cat)) cat = ALL;   // la sección elegida desapareció
  for (const [id, nombre] of entries) {
    const n = hits.filter(it => inCat(it, id)).length;
    const c = mk('div', 'pp-cat' + (id === cat ? ' on' : '') + (n ? '' : ' empty'));
    c.appendChild(mk('span', 'pp-cname', nombre)); c.appendChild(mk('span', 'pp-cn', String(n)));
    c.addEventListener('click', () => { cat = id; hi = null; render(); });
    cats.appendChild(c);
  }
  // lista: en «Todos», por secciones con su título; en una categoría, seguida
  const scroll = list.scrollTop;
  list.innerHTML = ''; vis = [];
  const shown = hits.filter(it => inCat(it, cat));
  let lastSec = null;
  for (const it of shown) {
    if (cat === ALL && it.section !== lastSec) { lastSec = it.section; list.appendChild(mk('div', 'pp-sec', library.seccion(it.section)?.name || '')); }
    list.appendChild(row(it, cur));
    vis.push(it.id);
  }
  if (!shown.length) list.appendChild(mk('div', 'pp-none', cat === ALL ? 'Nada que coincida.' : 'Nada aquí: prueba en «Todos».'));
  if (!vis.includes(hi)) hi = vis.includes(cur) ? cur : vis[0] || null;
  list.scrollTop = scroll;
  paintHi();
  count.textContent = shown.length + (shown.length === 1 ? ' preset' : ' presets');
}
function row(it, cur) {
  const r = mk('div', 'pp-item' + (it.id === cur ? ' cur' : '')); r.dataset.id = it.id;
  const star = mk('span', 'pp-star' + (it.fav ? ' on' : ''), '★');
  star.title = it.fav ? 'Quitar de favoritos' : 'Favorito: sale en «★ Favoritos»';
  star.addEventListener('click', e => { e.stopPropagation(); library.fav(it.id); });   // library-changed repinta
  r.appendChild(star);
  r.appendChild(mk('span', 'pp-name', it.name));
  if (cat === FAV) r.appendChild(mk('span', 'pp-tag', library.seccion(it.section)?.name || ''));
  r.addEventListener('click', () => { hi = it.id; load(it.id); });
  r.addEventListener('dblclick', () => close());   // el primer clic ya lo cargó
  return r;
}
function paintHi(scrollTo = false) {
  for (const r of list.querySelectorAll('.pp-item')) {
    const on = r.dataset.id === hi;
    r.classList.toggle('hi', on);
    if (on && scrollTo) r.scrollIntoView({ block: 'nearest' });
  }
}
function load(id) { if (id && id !== currentPresetId()) loadPresetId(id); }   // preset-loaded → mark() repinta «actual»
function mark() {
  label();
  if (!isOpen()) return;
  const cur = currentPresetId();
  for (const r of list.querySelectorAll('.pp-item')) r.classList.toggle('cur', r.dataset.id === cur);
}
function move(d) {
  if (!vis.length) return;
  const i = vis.indexOf(hi);
  hi = vis[i < 0 ? 0 : Math.max(0, Math.min(vis.length - 1, i + d))];
  paintHi(true); load(hi);
}

function open() {
  q = ''; search.value = ''; hi = null;
  pop.hidden = false; btn.classList.add('on'); btn.setAttribute('aria-expanded', 'true');
  list.scrollTop = 0; render(); paintHi(true);
  search.focus();
}
function close() {
  if (!isOpen()) return;
  pop.hidden = true; btn.classList.remove('on'); btn.setAttribute('aria-expanded', 'false');
  if (pop.contains(document.activeElement)) document.activeElement.blur();   // que las teclas vuelvan al piano
}

export function initPresetPicker() {
  btn = $('presetPick'); nameEl = $('presetPickName'); pop = $('presetPop');
  search = $('ppSearch'); cats = $('ppCats'); list = $('ppList'); count = $('ppCount');
  if (!btn) return;
  btn.addEventListener('click', () => (isOpen() ? close() : open()));
  // El buscador es un <input type=text>: keyboard.js no toca notas mientras se escribe
  search.addEventListener('input', () => { q = search.value; hi = null; list.scrollTop = 0; render(); });
  search.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); move(e.key === 'PageDown' ? 10 : -10); }
  });
  // ↑ ↓ e Intro, esté el foco en el buscador o fuera (tras un clic en la lista)
  window.addEventListener('keydown', e => {
    if (!isOpen() || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); move(e.key === 'ArrowDown' ? 1 : -1); }
    else if (e.key === 'Enter') { e.preventDefault(); load(hi); close(); }
  });
  // Esc con el foco fuera del buscador: keyboard.js pregunta antes de hacer pánico
  document.addEventListener('escape-first', e => { if (isOpen()) { e.preventDefault(); close(); } });
  document.addEventListener('pointerdown', e => { if (isOpen() && !pop.contains(e.target) && !btn.contains(e.target)) close(); }, true);
  $('ppAll').addEventListener('click', () => {
    const query = q; close(); showScreen('presets');
    const ls = $('libSearch');
    if (ls && query) { ls.value = query; ls.dispatchEvent(new Event('input')); }
  });
  document.addEventListener('preset-loaded', mark);
  document.addEventListener('preset-marked', mark);
  document.addEventListener('library-changed', () => { label(); if (isOpen()) render(); });
  label();
}
