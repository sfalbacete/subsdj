/* SubSDJ · banco de presets sobre la BIBLIOTECA (engine/library.js). Aquí
   vive el preset ACTUAL (su id) y el camino para cargarlo; el selector
   rápido de la cabecera es ui/presetPicker.js (buscar, categorías) y la
   vista grande, ui/libraryScreen.js. Solo presets: las escenas viven en la
   pantalla Presets. ‹ › y el program change MIDI recorren la biblioteca en
   orden. Guardar, borrar, exportar e importar actúan sobre la biblioteca
   entera. Cada cambio del modelo emite library-changed; cambiar el actual
   sin cargarlo (una parte, guardar), preset-marked. */
import { library, SEC_MIOS } from '../engine/library.js';
import { CONTROLS, loadState, snapshot } from './registry.js';
import { download } from './recorder.js';
import { record, markSaved } from './history.js';

let curId = null, msgEl, ready = Promise.resolve();
const msg = t => { if (msgEl) msgEl.textContent = t; };
export const limpiar = d => { const c = {}; for (const k in d) if (k in CONTROLS) c[k] = d[k]; return c; };   // descarta claves desconocidas
export function presetBankReady() { return ready; }   // la siembra de los bancos del repo es asíncrona

const asPreset = id => { const it = id && library.item(id); return it && it.tipo === 'preset' ? it : null; };
export const currentPreset = () => asPreset(curId);
export const currentPresetId = () => currentPreset() ? curId : null;
// Marcar el actual SIN cargarlo (la parte que se elige, lo recién guardado). Si ya
// no existe queda sin actual (el rack conserva el sonido).
export function markPreset(id) {
  curId = asPreset(id) ? id : null;
  document.dispatchEvent(new CustomEvent('preset-marked', { detail: { value: curId } }));
  return !!curId;
}
export function markPresetByName(nombre) { const it = library.presets().find(p => p.nombre === nombre); return it ? markPreset(it.id) : false; }
export function navIds() { return library.presets().map(it => it.id); }   // la biblioteca en orden (sección a sección)

function loadCurrent() {
  const it = library.item(curId);
  if (!it || it.tipo !== 'preset') return;
  record('Preset «' + it.nombre + '»', () => loadState(it.datos), { saved: true });   // deshacer devuelve el sonido de antes
  msg('Cargado: ' + it.nombre);
  document.dispatchEvent(new CustomEvent('preset-loaded', { detail: { name: it.nombre, value: it.id } }));   // el mezclador etiqueta la parte
}
export function loadPresetId(id) { if (!asPreset(id)) return false; curId = id; loadCurrent(); return true; }
export function stepPreset(dir) {
  const nav = navIds(), n = nav.length; if (!n) return;
  const i = nav.indexOf(curId);
  curId = nav[(((i + dir) % n) + n) % n];   // recorre con wrap-around
  loadCurrent();
}
export function loadPresetIndex(i) {           // program change n → preset n de la biblioteca (módulo su tamaño)
  const nav = navIds(), n = nav.length; if (!n) return;
  curId = nav[((i % n) + n) % n];
  loadCurrent();
}

export function initPresetBank() {
  msgEl = document.getElementById('presetMsg');

  library.load();                                // primera vez: siembra la fábrica y los presets de usuario antiguos
  library.onChange = () => { if (!asPreset(curId)) curId = null; document.dispatchEvent(new CustomEvent('library-changed')); };
  const init = library.presets().find(it => it.nombre === 'Init (default)');
  curId = init ? init.id : null;
  if (!library.data.ficheros)                    // bancos del repo y escenas: por fetch, una vez
    ready = library.sembrarFicheros().then(r => { if (r.n) msg('Biblioteca: traídos ' + r.n + ' presets y escenas del repo.'); });

  document.getElementById('prevBtn').addEventListener('click', () => stepPreset(-1));
  document.getElementById('nextBtn').addEventListener('click', () => stepPreset(1));
  document.getElementById('saveBtn').addEventListener('click', () => {
    const inp = document.getElementById('presetName');
    const name = (inp.value || '').trim();
    if (!name) { inp.focus(); msg('Escribe un nombre para guardar.'); return; }
    // Mismo nombre que el preset cargado → se actualiza donde esté; si no, en
    // «★ Míos» (encima del que tenga ese nombre allí, o nuevo).
    const cur = currentPreset();
    let target = cur && cur.tipo === 'preset' && cur.nombre === name ? cur : null;
    if (!target) { const mios = library.seccionPorNombre(SEC_MIOS); if (mios) target = library.items(mios.id).find(it => it.nombre === name) || null; }
    let id;
    if (target) { library.actualizar(target.id, snapshot()); id = target.id; msg('Actualizado «' + name + '».'); }
    else { id = library.añadir({ nombre: name, seccion: library.asegurarSeccion(SEC_MIOS), datos: snapshot() }); msg('Guardado «' + name + '» en ' + SEC_MIOS + ' (este navegador).'); }
    markPreset(id); inp.value = '';
    markSaved();                                  // lo que suena ES ahora el preset guardado: ● se apaga
  });
  document.getElementById('delBtn').addEventListener('click', () => {
    const it = currentPreset();
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
