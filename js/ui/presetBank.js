/* SubSDJ · preset bank on top of the LIBRARY (engine/library.js). Here
   lives the CURRENT preset (its id) and the path to load it; the header's
   quick picker is ui/presetPicker.js (search, categories) and the
   large view, ui/libraryScreen.js. Presets only: scenes live on the
   Presets screen. ‹ › and MIDI program change step through the Library in
   order. Save, delete, export and import act on the whole
   Library. Every model change emits library-changed; changing the current one
   without loading it (a part, saving), preset-marked. */
import { library, SEC_MINE } from '../engine/library.js';
import { CONTROLS, loadState, snapshot } from './registry.js';
import { download } from './recorder.js';
import { record, markSaved } from './history.js';

let curId = null, msgEl, ready = Promise.resolve();
const msg = t => { if (msgEl) msgEl.textContent = t; };
export const cleanPreset = d => { const c = {}; for (const k in d) if (k in CONTROLS) c[k] = d[k]; return c; };   // drops unknown keys
export function presetBankReady() { return ready; }   // seeding the repo banks is asynchronous

const asPreset = id => { const it = id && library.item(id); return it && it.type === 'preset' ? it : null; };
export const currentPreset = () => asPreset(curId);
export const currentPresetId = () => currentPreset() ? curId : null;
// Mark the current one WITHOUT loading it (the part being chosen, what was just saved). If it
// no longer exists there is no current one (the rack keeps the sound).
export function markPreset(id) {
  curId = asPreset(id) ? id : null;
  document.dispatchEvent(new CustomEvent('preset-marked', { detail: { value: curId } }));
  return !!curId;
}
export function markPresetByName(name) { const it = library.presets().find(p => p.name === name); return it ? markPreset(it.id) : false; }
export function navIds() { return library.presets().map(it => it.id); }   // the Library in order (section by section)

function loadCurrent() {
  const it = library.item(curId);
  if (!it || it.type !== 'preset') return;
  record('Preset «' + it.name + '»', () => loadState(it.data), { saved: true });   // undo brings back the previous sound
  msg('Loaded: ' + it.name);
  document.dispatchEvent(new CustomEvent('preset-loaded', { detail: { name: it.name, value: it.id } }));   // the Part Mixer labels the part
}
export function loadPresetId(id) { if (!asPreset(id)) return false; curId = id; loadCurrent(); return true; }
export function stepPreset(dir) {
  const nav = navIds(), n = nav.length; if (!n) return;
  const i = nav.indexOf(curId);
  curId = nav[(((i + dir) % n) + n) % n];   // steps with wrap-around
  loadCurrent();
}
export function loadPresetIndex(i) {           // program change n → preset n of the Library (modulo its size)
  const nav = navIds(), n = nav.length; if (!n) return;
  curId = nav[((i % n) + n) % n];
  loadCurrent();
}

export function initPresetBank() {
  msgEl = document.getElementById('presetMsg');

  library.load();                                // first time: seeds the factory and the old user presets
  library.onChange = () => { if (!asPreset(curId)) curId = null; document.dispatchEvent(new CustomEvent('library-changed')); };
  const init = library.presets().find(it => it.name === 'Init (default)');
  curId = init ? init.id : null;
  if (!library.data.files)                    // repo banks and scenes: by fetch, once
    ready = library.seedRepoFiles().then(r => { if (r.n) msg('Library: brought in ' + r.n + ' presets and scenes from the repo.'); });

  document.getElementById('prevBtn').addEventListener('click', () => stepPreset(-1));
  document.getElementById('nextBtn').addEventListener('click', () => stepPreset(1));
  document.getElementById('saveBtn').addEventListener('click', () => {
    const inp = document.getElementById('presetName');
    const name = (inp.value || '').trim();
    if (!name) { inp.focus(); msg('Type a name to save.'); return; }
    // Same name as the loaded preset → it is updated wherever it is; otherwise, in
    // «★ Mine» (over the one with that name there, or as a new one).
    const cur = currentPreset();
    let target = cur && cur.type === 'preset' && cur.name === name ? cur : null;
    if (!target) { const mine = library.sectionByName(SEC_MINE); if (mine) target = library.items(mine.id).find(it => it.name === name) || null; }
    let id;
    if (target) { library.update(target.id, snapshot()); id = target.id; msg('Updated «' + name + '».'); }
    else { id = library.add({ name, section: library.ensureSection(SEC_MINE), data: snapshot() }); msg('Saved «' + name + '» in ' + SEC_MINE + ' (this browser).'); }
    markPreset(id); inp.value = '';
    markSaved();                                  // what is sounding IS now the saved preset: ● goes off
  });
  document.getElementById('delBtn').addEventListener('click', () => {
    const it = currentPreset();
    if (!it) { msg('Pick a preset first.'); return; }
    if (!confirm('Delete «' + it.name + '» from the library?' + (it.origin === 'factory' ? ' (⟲ Restore factory brings it back)' : ''))) return;
    library.remove(it.id); msg('Deleted «' + it.name + '».');
  });
  document.getElementById('resetBtn').addEventListener('click', () => { record('Reset', () => loadState({}), { saved: true }); msg('Default values.'); });

  // ---- export / import the whole Library (JSON) ----
  document.getElementById('expBtn').addEventListener('click', () => {
    const j = library.exportData();
    download(new Blob([JSON.stringify(j, null, 1)], { type: 'application/json' }), 'subsdj-library.json');
    msg('Library exported: ' + j.items.length + ' items in ' + j.sections.length + ' sections.');
  });
  const impFile = document.getElementById('impFile');
  document.getElementById('impBtn').addEventListener('click', () => impFile.click());
  impFile.addEventListener('change', () => {
    const f = impFile.files[0]; if (!f) return;
    f.text().then(txt => {
      let data; try { data = JSON.parse(txt); } catch (e) { msg('That file is not valid JSON.'); return; }
      try {
        const r = library.importData(data, { clean: cleanPreset });
        msg(r.type === 'library' ? 'Library merged: ' + r.n + ' new items.'
          : r.type === 'scene' ? (r.n ? 'Scene added to «Scenes».' : 'That scene was already there.')
          : (r.n ? 'Imported ' + r.n + ' presets (into «Imported»).' : 'The file had no new presets.'));
      } catch (err) { msg('Could not import: ' + (err.message || err)); }
      impFile.value = '';
    });
  });
}
