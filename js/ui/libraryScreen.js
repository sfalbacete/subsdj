/* SubSDJ · Presets screen (13b): the whole Library in view and at
   hand. Sections in columns (create, rename, reorder ‹ ›, delete) with
   items (preset or scene) that load with a click, get marked ★, are
   renamed inline, dragged to another section or position and
   deleted. Accent-insensitive search and a «★ only» filter. Here we only PAINT: everything
   goes through engine/library.js, which announces with library-changed. Loading a
   preset takes the same path as the quick picker; a scene, the one of
   ⇧ Scene in the Arrangement module (it turns Parts on if needed). */
import { library, normalize } from '../engine/library.js';
import { loadPresetId, currentPresetId } from './presetBank.js';
import { loadScene, setPlaying, isPlaying } from './playerControls.js';

const $ = id => document.getElementById(id);
let list, msgEl, query = '', favOnly = false, dragId = null, playingId = null;   // playingId: the scene that is playing (only one)
const msg = t => { if (msgEl) msgEl.textContent = t; };

function mk(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function btn(cls, text, title, onClick) {
  const b = mk('span', 'pl-btn' + (cls ? ' ' + cls : ''), text); b.title = title;
  b.addEventListener('click', e => { e.stopPropagation(); onClick(); });
  return b;
}

// Inline editing: the span becomes an input; Enter or blur save, Escape cancels.
// keyboard.js ignores <input type=text>, so the piano doesn't steal the letters.
function editInline(span, value, onCommit) {
  const inp = document.createElement('input'); inp.type = 'text'; inp.value = value; inp.maxLength = 48; inp.className = 'pl-edit';
  let done = false;
  const finish = ok => { if (done) return; done = true; const v = inp.value.trim(); inp.replaceWith(span); if (ok && v && v !== value) onCommit(v); };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
  inp.addEventListener('blur', () => finish(true));
  inp.addEventListener('click', e => e.stopPropagation());
  inp.draggable = false;
  span.replaceWith(inp); inp.focus(); inp.select();
}

function row(it, cur) {
  const r = mk('div', 'pl-item' + (it.id === cur ? ' cur' : '') + (it.type === 'scene' ? ' scene' : ''));
  r.dataset.id = it.id; r.draggable = true;
  r.title = it.type === 'scene' ? 'Load the scene (turns Parts on) · drag to move'
                                 : (it.play ? it.play + '\n' : '') + 'Load into the part the rack is editing · drag to move';
  const star = mk('span', 'pl-star' + (it.fav ? ' on' : ''), '★');
  star.title = it.fav ? 'Remove from favorites' : 'Favorite: shows up in «★ Favorites» in the quick picker';
  star.addEventListener('click', e => { e.stopPropagation(); library.fav(it.id); });
  r.appendChild(star);
  if (it.type === 'scene') {   // ▶ loads and starts the conductor; ⏹ stops it (Parts stay on)
    const on = playingId === it.id && isPlaying();
    const p = mk('span', 'pl-play' + (on ? ' on' : ''), on ? '⏹' : '▶');
    p.title = on ? 'Stop the scene (Parts stay on)' : 'Load the scene and start it playing (one at a time)';
    p.addEventListener('click', e => { e.stopPropagation(); togglePlay(it); });
    r.appendChild(p);
  }
  const label = mk('span', 'pl-label', it.name); r.appendChild(label);
  if (it.type === 'scene') r.appendChild(mk('span', 'pl-tag', 'scene'));
  const tools = mk('span', 'pl-tools');
  tools.appendChild(btn('', '✎', 'Rename', () => editInline(label, it.name, v => library.rename(it.id, v))));
  tools.appendChild(btn('del', '🗑', 'Delete' + (it.origin === 'factory' ? ' (⟲ Restore factory brings it back)' : ''), () => {
    if (confirm('Delete «' + it.name + '»?')) { library.remove(it.id); msg('Deleted «' + it.name + '».'); }
  }));
  r.appendChild(tools);
  r.addEventListener('click', () => loadItem(it));
  r.addEventListener('dragstart', e => { dragId = it.id; e.dataTransfer.setData('text/plain', it.id); e.dataTransfer.effectAllowed = 'move'; r.classList.add('drag'); });
  r.addEventListener('dragend', () => { r.classList.remove('drag'); dragId = null; list.querySelectorAll('.over').forEach(x => x.classList.remove('over')); });
  return r;
}

async function togglePlay(it) {
  if (playingId === it.id && isPlaying()) { setPlaying(false); msg('Scene stopped: ' + it.name + '.'); return; }
  try { await loadScene(it.data); } catch (err) { msg('Invalid scene: ' + (err.message || err)); return; }
  playingId = it.id;            // after loading: scene-loaded has just cleared it
  setPlaying(true); msg('Playing: ' + it.name + '.');
}
async function loadItem(it) {
  if (it.type === 'scene') {
    try { await loadScene(it.data); msg('Scene loaded: ' + it.name + ' (▶ Play in Harmony).'); }
    catch (err) { msg('Invalid scene: ' + (err.message || err)); }
    return;
  }
  loadPresetId(it.id);
}

function render() {
  if (!list) return;
  list.innerHTML = '';
  const q = normalize(query), cur = currentPresetId();
  for (const s of library.sections()) {
    const allItems = library.items(s.id);
    let items = allItems;
    if (q) items = items.filter(it => normalize(it.name + ' ' + (it.tags || []).join(' ')).includes(q));   // name or tags
    if (favOnly) items = items.filter(it => it.fav);
    if ((q || favOnly) && !items.length) continue;   // filtering: only sections with results
    const sec = mk('div', 'pl-sec' + (items.length > 30 ? ' big' : '')); sec.dataset.sec = s.id;   // big: split across columns
    const head = mk('div', 'pl-head');
    const name = mk('span', 'pl-name', s.name); head.appendChild(name);
    head.appendChild(mk('span', 'pl-n', String(allItems.length)));
    const tools = mk('span', 'pl-tools');
    tools.appendChild(btn('', '‹', 'Move the section towards the start', () => library.moveSection(s.id, -1)));
    tools.appendChild(btn('', '›', 'Move the section towards the end', () => library.moveSection(s.id, 1)));
    tools.appendChild(btn('', '✎', 'Rename the section', () => editInline(name, s.name, v => library.renameSection(s.id, v))));
    tools.appendChild(btn('del', '🗑', 'Delete the section and everything in it', () => {
      const n = allItems.length;
      if (confirm('Delete the section «' + s.name + '»' + (n ? ' and its ' + n + ' items' : '') + '?')) { library.deleteSection(s.id); msg('Section «' + s.name + '» deleted.'); }
    }));
    head.appendChild(tools);
    name.addEventListener('dblclick', () => editInline(name, s.name, v => library.renameSection(s.id, v)));
    sec.appendChild(head);
    for (const it of items) sec.appendChild(row(it, cur));
    // drop here: before the item it is dropped on, or at the end of the section
    sec.addEventListener('dragover', e => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; sec.classList.add('over'); } });
    sec.addEventListener('dragleave', e => { if (!sec.contains(e.relatedTarget)) sec.classList.remove('over'); });
    sec.addEventListener('drop', e => {
      e.preventDefault(); sec.classList.remove('over');
      const id = dragId || e.dataTransfer.getData('text/plain'); if (!id) return;
      const over = e.target.closest ? e.target.closest('.pl-item') : null;
      library.move(id, s.id, over && over.dataset.id !== id ? over.dataset.id : null);
      dragId = null;
    });
    list.appendChild(sec);
  }
  if (!list.children.length) list.appendChild(mk('div', 'note', q || favOnly ? 'Nothing matches.' : 'Empty library: ⟲ Restore factory.'));
}
function mark() { if (!list) return; const cur = currentPresetId(); list.querySelectorAll('.pl-item').forEach(r => r.classList.toggle('cur', r.dataset.id === cur)); }

export function initLibraryScreen() {
  list = $('presetList'); msgEl = $('libMsg');
  if (!list) return;
  $('libSearch').addEventListener('input', e => { query = e.target.value; render(); });
  $('libFavOnly').addEventListener('change', e => { favOnly = e.target.checked; render(); });
  $('libNewSec').addEventListener('click', () => {
    const id = library.createSection('New section');   // library-changed already repainted: now to name it
    const name = list.querySelector('.pl-sec[data-sec="' + id + '"] .pl-name');
    if (name) editInline(name, 'New section', v => library.renameSection(id, v));
  });
  $('libSeed').addEventListener('click', async () => {
    const r = await library.restoreFactory();
    msg((r.n ? 'Brought back ' + r.n + ' items from the factory and the repo.' : 'Nothing was missing from the factory.')
        + (r.errors.length ? ' Could not read: ' + r.errors.join(', ') + '.' : ''));
  });
  document.addEventListener('library-changed', render);
  document.addEventListener('preset-loaded', mark);   // quick picker, ‹ ›, program change
  document.addEventListener('preset-marked', mark);   // changing part or saving: the current one changes without loading
  document.addEventListener('play-changed', render);   // scenes' ▶/⏹ kept up to date (also from ▶ Play)
  document.addEventListener('scene-changed', render);  // Panic or Parts switched off stop the conductor
  document.addEventListener('scene-loaded', () => { playingId = null; render(); });   // another scene (⇧ Scene, ↺ Last)
  render();
}
