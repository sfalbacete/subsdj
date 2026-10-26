/* SubSDJ · quick preset picker (header). Replaces the <select>:
   with 300 presets in 16 sections, a long dropdown can't be browsed.
   The button shows the current preset; opening it, a panel with a search box
   (accent- and case-insensitive), the categories on the left (All,
   ★ Favorites and each section, with how many match the search) and the
   list on the right. Designed to AUDITION quickly:
     click         loads and leaves the panel open (focus leaves the search box:
                   the PC keyboard plays notes again so you can hear it)
     ↑ ↓           moves and loads (like ‹ ›, within the filtered list)
     Enter / double click   loads and closes
     Esc / click outside    closes (Esc doesn't panic while it is open)
   «Browse all» goes to the Presets screen with the same search. Presets
   only: scenes live on the Presets screen. Here we only paint:
   loading goes through presetBank (the same path as ‹ › and the Presets screen). */
import { library, normaliza } from '../engine/library.js';
import { loadPresetId, currentPreset, currentPresetId } from './presetBank.js';
import { showScreen } from './screens.js';

const $ = id => document.getElementById(id);
const ALL = '*', FAV = '★';           // categories that aren't sections
let btn, nameEl, pop, search, cats, list, count;
let q = '', cat = ALL, hi = null, vis = [];   // hi: the highlighted one (↑ ↓ cursor); vis: visible ids in order

const isOpen = () => !pop.hidden;
function mk(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

function label() {
  const it = currentPreset();
  nameEl.textContent = it ? it.name : '—';
  btn.title = (it ? it.name + ' · ' + (library.seccion(it.section)?.name || '') + '\n' : '') +
    'Choose a preset: search, filter by category, ↑ ↓ to audition (‹ › step through the whole library)';
}

// What matches the search, per category (for the counters) and in the chosen one
function matches() {
  const nq = normaliza(q);
  return library.presets().filter(it => !nq || normaliza(it.name).includes(nq));
}
const inCat = (it, c) => c === ALL || (c === FAV ? it.fav : it.section === c);

function render() {
  const hits = matches(), cur = currentPresetId();
  // categories: All, ★ (if there are favorites) and every section that has presets
  cats.innerHTML = '';
  const secs = library.secciones().filter(s => library.items(s.id).some(it => it.type === 'preset'));
  const entries = [[ALL, 'All'], ...(library.presets().some(it => it.fav) ? [[FAV, '★ Favorites']] : []), ...secs.map(s => [s.id, s.name])];
  if (!entries.some(([id]) => id === cat)) cat = ALL;   // the chosen section disappeared
  for (const [id, nombre] of entries) {
    const n = hits.filter(it => inCat(it, id)).length;
    const c = mk('div', 'pp-cat' + (id === cat ? ' on' : '') + (n ? '' : ' empty'));
    c.appendChild(mk('span', 'pp-cname', nombre)); c.appendChild(mk('span', 'pp-cn', String(n)));
    c.addEventListener('click', () => { cat = id; hi = null; render(); });
    cats.appendChild(c);
  }
  // list: in «All», by sections with their title; in a category, continuous
  const scroll = list.scrollTop;
  list.innerHTML = ''; vis = [];
  const shown = hits.filter(it => inCat(it, cat));
  let lastSec = null;
  for (const it of shown) {
    if (cat === ALL && it.section !== lastSec) { lastSec = it.section; list.appendChild(mk('div', 'pp-sec', library.seccion(it.section)?.name || '')); }
    list.appendChild(row(it, cur));
    vis.push(it.id);
  }
  if (!shown.length) list.appendChild(mk('div', 'pp-none', cat === ALL ? 'Nothing matches.' : 'Nothing here: try «All».'));
  if (!vis.includes(hi)) hi = vis.includes(cur) ? cur : vis[0] || null;
  list.scrollTop = scroll;
  paintHi();
  count.textContent = shown.length + (shown.length === 1 ? ' preset' : ' presets');
}
function row(it, cur) {
  const r = mk('div', 'pp-item' + (it.id === cur ? ' cur' : '')); r.dataset.id = it.id;
  const star = mk('span', 'pp-star' + (it.fav ? ' on' : ''), '★');
  star.title = it.fav ? 'Remove from favorites' : 'Favorite: shows up in «★ Favorites»';
  star.addEventListener('click', e => { e.stopPropagation(); library.fav(it.id); });   // library-changed repaints
  r.appendChild(star);
  r.appendChild(mk('span', 'pp-name', it.name));
  if (cat === FAV) r.appendChild(mk('span', 'pp-tag', library.seccion(it.section)?.name || ''));
  r.addEventListener('click', () => { hi = it.id; load(it.id); });
  r.addEventListener('dblclick', () => close());   // the first click already loaded it
  return r;
}
function paintHi(scrollTo = false) {
  for (const r of list.querySelectorAll('.pp-item')) {
    const on = r.dataset.id === hi;
    r.classList.toggle('hi', on);
    if (on && scrollTo) r.scrollIntoView({ block: 'nearest' });
  }
}
function load(id) { if (id && id !== currentPresetId()) loadPresetId(id); }   // preset-loaded → mark() repaints «current»
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
  if (pop.contains(document.activeElement)) document.activeElement.blur();   // so the keys go back to the piano
}

export function initPresetPicker() {
  btn = $('presetPick'); nameEl = $('presetPickName'); pop = $('presetPop');
  search = $('ppSearch'); cats = $('ppCats'); list = $('ppList'); count = $('ppCount');
  if (!btn) return;
  btn.addEventListener('click', () => (isOpen() ? close() : open()));
  // The search box is an <input type=text>: keyboard.js plays no notes while typing
  search.addEventListener('input', () => { q = search.value; hi = null; list.scrollTop = 0; render(); });
  search.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); move(e.key === 'PageDown' ? 10 : -10); }
  });
  // ↑ ↓ and Enter, whether focus is in the search box or outside (after a click on the list)
  window.addEventListener('keydown', e => {
    if (!isOpen() || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); move(e.key === 'ArrowDown' ? 1 : -1); }
    else if (e.key === 'Enter') { e.preventDefault(); load(hi); close(); }
  });
  // Esc with focus outside the search box: keyboard.js asks before panicking
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
