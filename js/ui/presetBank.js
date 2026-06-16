/* SubSDJ · banco de presets (fábrica + usuario en localStorage) + botón Reset */
import { FACTORY, factoryPreset, loadUser, saveUser } from '../engine/presets.js';
import { loadState, snapshot } from './registry.js';

let selEl, msgEl;
const msg = t => { if (msgEl) msgEl.textContent = t; };

function addGroup(label, entries) {   // entries: [[value, text], ...]
  const og = document.createElement('optgroup'); og.label = label;
  entries.forEach(([value, text]) => {
    const o = document.createElement('option'); o.value = value; o.textContent = text; og.appendChild(o);
  });
  selEl.appendChild(og);
}

function refresh(selectValue) {
  selEl.innerHTML = '';
  for (const cat in FACTORY) {                          // un grupo por categoría de fábrica
    addGroup(cat, Object.keys(FACTORY[cat]).map(name => ['f:' + name, name]));
  }
  const names = Object.keys(loadUser()).sort();
  if (names.length) addGroup('★ Míos', names.map(name => ['u:' + name, name]));
  if (selectValue) selEl.value = selectValue;
}
function dataFor(v) {
  if (!v) return null;
  const kind = v.slice(0, 1), name = v.slice(2);
  return kind === 'f' ? factoryPreset(name) : loadUser()[name];
}

export function initPresetBank() {
  selEl = document.getElementById('presetSelect');
  msgEl = document.getElementById('presetMsg');

  const loadCurrent = () => {
    const data = dataFor(selEl.value);
    if (data) { loadState(data); msg('Cargado: ' + selEl.selectedOptions[0].textContent); }
  };
  const step = dir => {
    const n = selEl.options.length;          // incluye opciones de ambos optgroups
    if (!n) return;
    selEl.selectedIndex = (selEl.selectedIndex + dir + n) % n;   // recorre con wrap-around
    loadCurrent();
  };

  selEl.addEventListener('change', () => {
    loadCurrent();
    selEl.blur();   // suelta el foco para que las teclas toquen notas y no hagan "type-ahead" en el combo
  });
  document.getElementById('prevBtn').addEventListener('click', () => step(-1));
  document.getElementById('nextBtn').addEventListener('click', () => step(1));
  document.getElementById('saveBtn').addEventListener('click', () => {
    const inp = document.getElementById('presetName');
    const name = (inp.value || '').trim();
    if (!name) { inp.focus(); msg('Escribe un nombre para guardar.'); return; }
    const user = loadUser(); user[name] = snapshot(); saveUser(user);
    refresh('u:' + name); inp.value = '';
    msg('Guardado «' + name + '» en este navegador.');
  });
  document.getElementById('delBtn').addEventListener('click', () => {
    const v = selEl.value;
    if (v.slice(0, 1) !== 'u') { msg('Solo puedes borrar presets tuyos.'); return; }
    const name = v.slice(2), user = loadUser();
    delete user[name]; saveUser(user); refresh();
    msg('Borrado «' + name + '».');
  });
  document.getElementById('resetBtn').addEventListener('click', () => { loadState({}); msg('Valores por defecto.'); });

  refresh('f:Init (default)');
}
