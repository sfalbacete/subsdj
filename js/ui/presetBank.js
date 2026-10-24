/* SubSDJ · banco de presets sobre la BIBLIOTECA (engine/library.js). El
   selector rápido lista ★ Favoritos y luego cada sección (solo presets; las
   escenas viven en la pantalla Presets). ‹ › y el program change MIDI
   recorren la biblioteca en orden SIN el grupo ★ (repite ítems). Guardar,
   borrar, exportar e importar actúan sobre la biblioteca entera; la vista
   grande es ui/libraryScreen.js. Cada cambio del modelo repuebla el
   selector y emite library-changed. */
import { library, SEC_MIOS } from '../engine/library.js';
import { CONTROLS, loadState, snapshot } from './registry.js';
import { download } from './recorder.js';
import { record, markSaved } from './history.js';

let selEl, msgEl, ready = Promise.resolve();
const msg = t => { if (msgEl) msgEl.textContent = t; };
export const limpiar = d => { const c = {}; for (const k in d) if (k in CONTROLS) c[k] = d[k]; return c; };   // descarta claves desconocidas
export function presetBankReady() { return ready; }   // la siembra de los bancos del repo es asíncrona

function addGroup(label, items, fav) {
  const og = document.createElement('optgroup'); og.label = label;
  for (const it of items) {
    const o = document.createElement('option'); o.value = it.id; o.textContent = it.nombre;
    if (fav) o.dataset.fav = '1';
    og.appendChild(o);
  }
  selEl.appendChild(og);
}
function refresh(selectValue) {
  selEl.innerHTML = '';
  const favs = library.presets().filter(it => it.fav);
  if (favs.length) addGroup('★ Favoritos', favs, true);
  for (const s of library.secciones()) {
    const ps = library.items(s.id).filter(it => it.tipo === 'preset');
    if (ps.length) addGroup(s.nombre, ps, false);
  }
  if (selectValue) selEl.value = selectValue;   // si ya no existe queda sin selección (el rack conserva el sonido)
}
export function navOptions() { return [...selEl.options].filter(o => !o.dataset.fav); }   // la biblioteca en orden, sin duplicados

function loadCurrent() {
  const it = library.item(selEl.value);
  if (!it || it.tipo !== 'preset') return;
  record('Preset «' + it.nombre + '»', () => loadState(it.datos), { saved: true });   // deshacer devuelve el sonido de antes
  msg('Cargado: ' + it.nombre);
  document.dispatchEvent(new CustomEvent('preset-loaded', { detail: { name: it.nombre, value: it.id } }));   // el mezclador etiqueta la parte
}
export function loadPresetId(id) { if (!library.item(id)) return false; selEl.value = id; loadCurrent(); return true; }
export function stepPreset(dir) {
  const nav = navOptions(), n = nav.length; if (!n) return;
  const i = nav.findIndex(o => o.value === selEl.value);
  selEl.value = nav[(((i + dir) % n) + n) % n].value;   // recorre con wrap-around
  loadCurrent();
}
export function loadPresetIndex(i) {           // program change n → preset n de la biblioteca (módulo su tamaño)
  const nav = navOptions(), n = nav.length; if (!n) return;
  selEl.value = nav[((i % n) + n) % n].value;
  loadCurrent();
}

export function initPresetBank() {
  selEl = document.getElementById('presetSelect');
  msgEl = document.getElementById('presetMsg');

  library.load();                                // primera vez: siembra la fábrica y los presets de usuario antiguos
  library.onChange = () => { refresh(selEl.value); document.dispatchEvent(new CustomEvent('library-changed')); };
  const init = library.presets().find(it => it.nombre === 'Init (default)');
  refresh(init ? init.id : null);
  if (!library.data.ficheros)                    // bancos del repo y escenas: por fetch, una vez
    ready = library.sembrarFicheros().then(r => { if (r.n) msg('Biblioteca: traídos ' + r.n + ' presets y escenas del repo.'); });

  selEl.addEventListener('change', () => {
    loadCurrent();
    selEl.blur();   // suelta el foco para que las teclas toquen notas y no hagan "type-ahead" en el combo
  });
  document.getElementById('prevBtn').addEventListener('click', () => stepPreset(-1));
  document.getElementById('nextBtn').addEventListener('click', () => stepPreset(1));
  document.getElementById('saveBtn').addEventListener('click', () => {
    const inp = document.getElementById('presetName');
    const name = (inp.value || '').trim();
    if (!name) { inp.focus(); msg('Escribe un nombre para guardar.'); return; }
    // Mismo nombre que el preset cargado → se actualiza donde esté; si no, en
    // «★ Míos» (encima del que tenga ese nombre allí, o nuevo).
    const cur = library.item(selEl.value);
    let target = cur && cur.tipo === 'preset' && cur.nombre === name ? cur : null;
    if (!target) { const mios = library.seccionPorNombre(SEC_MIOS); if (mios) target = library.items(mios.id).find(it => it.nombre === name) || null; }
    let id;
    if (target) { library.actualizar(target.id, snapshot()); id = target.id; msg('Actualizado «' + name + '».'); }
    else { id = library.añadir({ nombre: name, seccion: library.asegurarSeccion(SEC_MIOS), datos: snapshot() }); msg('Guardado «' + name + '» en ' + SEC_MIOS + ' (este navegador).'); }
    selEl.value = id; inp.value = '';
    markSaved();                                  // lo que suena ES ahora el preset guardado: ● se apaga
  });
  document.getElementById('delBtn').addEventListener('click', () => {
    const it = library.item(selEl.value);
    if (!it) { msg('Elige antes un preset.'); return; }
    if (!confirm('¿Borrar «' + it.nombre + '» de la biblioteca?' + (it.origen === 'fabrica' ? ' (⟲ Traer de fábrica lo devuelve)' : ''))) return;
    library.borrar(it.id); msg('Borrado «' + it.nombre + '».');
  });
  document.getElementById('resetBtn').addEventListener('click', () => { record('Reset', () => loadState({}), { saved: true }); msg('Valores por defecto.'); });

  // ---- exportar / importar la biblioteca entera (JSON) ----
  document.getElementById('expBtn').addEventListener('click', () => {
    const j = library.exportar();
    download(new Blob([JSON.stringify(j, null, 1)], { type: 'application/json' }), 'subsdj-biblioteca.json');
    msg('Exportada la biblioteca: ' + j.items.length + ' elementos en ' + j.secciones.length + ' secciones.');
  });
  const impFile = document.getElementById('impFile');
  document.getElementById('impBtn').addEventListener('click', () => impFile.click());
  impFile.addEventListener('change', () => {
    const f = impFile.files[0]; if (!f) return;
    f.text().then(txt => {
      let data; try { data = JSON.parse(txt); } catch (e) { msg('Ese archivo no es JSON válido.'); return; }
      try {
        const r = library.importar(data, { limpiar });
        msg(r.tipo === 'biblioteca' ? 'Biblioteca fundida: ' + r.n + ' elementos nuevos.'
          : r.tipo === 'escena' ? (r.n ? 'Escena añadida a «Escenas».' : 'Esa escena ya estaba.')
          : (r.n ? 'Importados ' + r.n + ' presets (en «Importados»).' : 'El archivo no contenía presets nuevos.'));
      } catch (err) { msg('No se pudo importar: ' + (err.message || err)); }
      impFile.value = '';
    });
  });
}
