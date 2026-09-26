/* SubSDJ · pantalla Presets (13b): la biblioteca entera a la vista y en la
   mano. Secciones en columnas (crear, renombrar, reordenar ‹ ›, borrar) con
   ítems (preset o escena) que se cargan con un clic, se marcan ★, se
   renombran en línea, se arrastran a otra sección o a otra posición y se
   borran. Búsqueda sin acentos y filtro «solo ★». Aquí solo se PINTA: todo
   pasa por engine/library.js, que avisa con library-changed. Cargar un
   preset va por el mismo camino que el selector rápido; una escena, por el
   de ⇧ Escena del módulo Arreglo (enciende las Partes si hace falta). */
import { library, normaliza } from '../engine/library.js';
import { loadPresetId } from './presetBank.js';
import { loadScene, setPlaying, isPlaying } from './playerControls.js';

const $ = id => document.getElementById(id);
let list, sel, msgEl, filtro = '', soloFav = false, dragId = null, playingId = null;   // playingId: la escena que suena (solo una)
const msg = t => { if (msgEl) msgEl.textContent = t; };

function mk(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function btn(cls, text, title, onClick) {
  const b = mk('span', 'pl-btn' + (cls ? ' ' + cls : ''), text); b.title = title;
  b.addEventListener('click', e => { e.stopPropagation(); onClick(); });
  return b;
}

// Edición en línea: el span se vuelve input; Enter o blur guardan, Escape cancela.
// keyboard.js ignora los <input type=text>, así que el piano no roba las letras.
function editInline(span, valor, onCommit) {
  const inp = document.createElement('input'); inp.type = 'text'; inp.value = valor; inp.maxLength = 48; inp.className = 'pl-edit';
  let done = false;
  const fin = ok => { if (done) return; done = true; const v = inp.value.trim(); inp.replaceWith(span); if (ok && v && v !== valor) onCommit(v); };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') fin(true); else if (e.key === 'Escape') fin(false); });
  inp.addEventListener('blur', () => fin(true));
  inp.addEventListener('click', e => e.stopPropagation());
  inp.draggable = false;
  span.replaceWith(inp); inp.focus(); inp.select();
}

function row(it, cur) {
  const r = mk('div', 'pl-item' + (it.id === cur ? ' cur' : '') + (it.tipo === 'escena' ? ' esc' : ''));
  r.dataset.id = it.id; r.draggable = true;
  r.title = it.tipo === 'escena' ? 'Cargar la escena (enciende las Partes) · arrastra para mover'
                                 : 'Cargar en la parte que edita el rack · arrastra para mover';
  const star = mk('span', 'pl-star' + (it.fav ? ' on' : ''), '★');
  star.title = it.fav ? 'Quitar de favoritos' : 'Favorito: sale el primero en el selector rápido';
  star.addEventListener('click', e => { e.stopPropagation(); library.fav(it.id); });
  r.appendChild(star);
  if (it.tipo === 'escena') {   // ▶ carga y arranca el director; ⏹ lo para (las Partes siguen encendidas)
    const on = playingId === it.id && isPlaying();
    const p = mk('span', 'pl-play' + (on ? ' on' : ''), on ? '⏹' : '▶');
    p.title = on ? 'Parar la escena (las Partes siguen encendidas)' : 'Cargar la escena y ponerla a sonar (solo una a la vez)';
    p.addEventListener('click', e => { e.stopPropagation(); togglePlay(it); });
    r.appendChild(p);
  }
  const label = mk('span', 'pl-label', it.nombre); r.appendChild(label);
  if (it.tipo === 'escena') r.appendChild(mk('span', 'pl-tag', 'escena'));
  const tools = mk('span', 'pl-tools');
  tools.appendChild(btn('', '✎', 'Renombrar', () => editInline(label, it.nombre, v => library.renombrar(it.id, v))));
  tools.appendChild(btn('del', '🗑', 'Borrar' + (it.origen === 'fabrica' ? ' (⟲ Traer de fábrica lo devuelve)' : ''), () => {
    if (confirm('¿Borrar «' + it.nombre + '»?')) { library.borrar(it.id); msg('Borrado «' + it.nombre + '».'); }
  }));
  r.appendChild(tools);
  r.addEventListener('click', () => cargar(it));
  r.addEventListener('dragstart', e => { dragId = it.id; e.dataTransfer.setData('text/plain', it.id); e.dataTransfer.effectAllowed = 'move'; r.classList.add('drag'); });
  r.addEventListener('dragend', () => { r.classList.remove('drag'); dragId = null; list.querySelectorAll('.over').forEach(x => x.classList.remove('over')); });
  return r;
}

async function togglePlay(it) {
  if (playingId === it.id && isPlaying()) { setPlaying(false); msg('Escena parada: ' + it.nombre + '.'); return; }
  try { await loadScene(it.datos); } catch (err) { msg('Escena no válida: ' + (err.message || err)); return; }
  playingId = it.id;            // después de cargar: scene-loaded acaba de limpiarlo
  setPlaying(true); msg('Suena: ' + it.nombre + '.');
}
async function cargar(it) {
  if (it.tipo === 'escena') {
    try { await loadScene(it.datos); msg('Escena cargada: ' + it.nombre + ' (▶ Tocar en Armonía).'); }
    catch (err) { msg('Escena no válida: ' + (err.message || err)); }
    return;
  }
  loadPresetId(it.id);
}

function render() {
  if (!list) return;
  list.innerHTML = '';
  const q = normaliza(filtro), cur = sel ? sel.value : null;
  for (const s of library.secciones()) {
    const todos = library.items(s.id);
    let items = todos;
    if (q) items = items.filter(it => normaliza(it.nombre).includes(q));
    if (soloFav) items = items.filter(it => it.fav);
    if ((q || soloFav) && !items.length) continue;   // filtrando: solo secciones con resultados
    const sec = mk('div', 'pl-sec' + (items.length > 30 ? ' big' : '')); sec.dataset.sec = s.id;   // grande: se parte entre columnas
    const head = mk('div', 'pl-head');
    const name = mk('span', 'pl-name', s.nombre); head.appendChild(name);
    head.appendChild(mk('span', 'pl-n', String(todos.length)));
    const tools = mk('span', 'pl-tools');
    tools.appendChild(btn('', '‹', 'Mover la sección hacia el principio', () => library.moverSeccion(s.id, -1)));
    tools.appendChild(btn('', '›', 'Mover la sección hacia el final', () => library.moverSeccion(s.id, 1)));
    tools.appendChild(btn('', '✎', 'Renombrar la sección', () => editInline(name, s.nombre, v => library.renombrarSeccion(s.id, v))));
    tools.appendChild(btn('del', '🗑', 'Borrar la sección con todo lo que contiene', () => {
      const n = todos.length;
      if (confirm('¿Borrar la sección «' + s.nombre + '»' + (n ? ' y sus ' + n + ' elementos' : '') + '?')) { library.borrarSeccion(s.id); msg('Sección «' + s.nombre + '» borrada.'); }
    }));
    head.appendChild(tools);
    name.addEventListener('dblclick', () => editInline(name, s.nombre, v => library.renombrarSeccion(s.id, v)));
    sec.appendChild(head);
    for (const it of items) sec.appendChild(row(it, cur));
    // soltar aquí: antes del ítem sobre el que se suelta, o al final de la sección
    sec.addEventListener('dragover', e => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; sec.classList.add('over'); } });
    sec.addEventListener('dragleave', e => { if (!sec.contains(e.relatedTarget)) sec.classList.remove('over'); });
    sec.addEventListener('drop', e => {
      e.preventDefault(); sec.classList.remove('over');
      const id = dragId || e.dataTransfer.getData('text/plain'); if (!id) return;
      const over = e.target.closest ? e.target.closest('.pl-item') : null;
      library.mover(id, s.id, over && over.dataset.id !== id ? over.dataset.id : null);
      dragId = null;
    });
    list.appendChild(sec);
  }
  if (!list.children.length) list.appendChild(mk('div', 'note', q || soloFav ? 'Nada que coincida.' : 'Biblioteca vacía: ⟲ Traer de fábrica.'));
}
function mark() { if (!list || !sel) return; list.querySelectorAll('.pl-item').forEach(r => r.classList.toggle('cur', r.dataset.id === sel.value)); }

export function initLibraryScreen() {
  list = $('presetList'); sel = $('presetSelect'); msgEl = $('libMsg');
  if (!list) return;
  $('libSearch').addEventListener('input', e => { filtro = e.target.value; render(); });
  $('libFavOnly').addEventListener('change', e => { soloFav = e.target.checked; render(); });
  $('libNewSec').addEventListener('click', () => {
    const id = library.crearSeccion('Nueva sección');   // library-changed ya repintó: a ponerle nombre
    const name = list.querySelector('.pl-sec[data-sec="' + id + '"] .pl-name');
    if (name) editInline(name, 'Nueva sección', v => library.renombrarSeccion(id, v));
  });
  $('libSeed').addEventListener('click', async () => {
    const r = await library.traerDeFabrica();
    msg((r.n ? 'Traídos ' + r.n + ' elementos de fábrica y del repo.' : 'No faltaba nada de fábrica.')
        + (r.errores.length ? ' No se pudo leer: ' + r.errores.join(', ') + '.' : ''));
  });
  document.addEventListener('library-changed', render);
  if (sel) sel.addEventListener('change', mark);
  document.addEventListener('preset-loaded', mark);   // ‹ ›, program change
  document.addEventListener('part-changed', mark);    // cambiar de parte pone sel.value sin change
  document.addEventListener('play-changed', render);   // ▶/⏹ de las escenas al día (también desde ▶ Tocar)
  document.addEventListener('scene-changed', render);  // Pánico o Partes apagadas paran el director
  document.addEventListener('scene-loaded', () => { playingId = null; render(); });   // otra escena (⇧ Escena, ↺ Última)
  render();
}
