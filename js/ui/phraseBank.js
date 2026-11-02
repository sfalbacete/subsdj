/* SubSDJ · YOUR sequencer phrases (2026-11-02). A phrase is the sequencer's
   material, not an instrument's: its steps, division and UNITS (semitones or a
   scale — degrees read as semitones would be another melody). Saving it here lets
   you load it on any preset (and with the module's lock, keep it while browsing).
   Stored in this browser (localStorage, PHRASE_LS) and carried by the library's
   export as an optional `phrases` field — an older SubSDJ ignores the field, so
   the library format does not change. Names share the library's limit (MAX_NAME).
   Every change emits 'phrases-changed' (the phrase selector rebuilds). */
import { MAX_NAME } from '../engine/library.js';

export const PHRASE_LS = 'subsdj.phrases.v1';
const clean = p => p && typeof p === 'object' && typeof p.pat === 'string' && String(p.name || '').trim()
  ? { name: String(p.name).trim().slice(0, MAX_NAME), pat: p.pat.trim().split(/\s+/).join(' '), div: String(p.div || '1/16'), notes: String(p.notes || 'semitones') }
  : null;

let list = null;
function load() {
  if (list) return list;
  list = [];
  try { const j = JSON.parse(localStorage.getItem(PHRASE_LS) || '[]'); if (Array.isArray(j)) list = j.map(clean).filter(Boolean); } catch (e) { /* unreadable or blocked: start empty */ }
  return list;
}
function save() {
  try { localStorage.setItem(PHRASE_LS, JSON.stringify(list)); } catch (e) { /* storage full or blocked: kept for this session */ }
  document.dispatchEvent(new CustomEvent('phrases-changed'));
}

export const userPhrases = () => load().map(p => ({ ...p }));
// Saves (or overwrites the one with that name); returns its index, or -1 if it is not a phrase
export function savePhrase(p) {
  const c = clean(p); if (!c) return -1;
  load();
  let i = list.findIndex(x => x.name === c.name);
  if (i >= 0) list[i] = c; else { list.push(c); i = list.length - 1; }
  save();
  return i;
}
// Removes it and returns {item, index} (to put it back: restorePhrase), or null
export function deletePhrase(name) {
  load();
  const i = list.findIndex(x => x.name === name);
  if (i < 0) return null;
  const [item] = list.splice(i, 1);
  save();
  return { item, index: i };
}
export function restorePhrase(snap) {
  if (!snap || !snap.item) return;
  load(); list.splice(Math.min(snap.index, list.length), 0, snap.item); save();
}
// From an imported file: the ones not already here (same name and steps) come in; returns how many
export function mergePhrases(arr) {
  if (!Array.isArray(arr)) return 0;
  load();
  let n = 0;
  for (const p of arr.map(clean).filter(Boolean)) {
    if (list.some(x => x.name === p.name && x.pat === p.pat)) continue;
    let name = p.name, k = 2;
    while (list.some(x => x.name === name)) name = (p.name.slice(0, MAX_NAME - 3) + ' ' + k++).slice(0, MAX_NAME);   // a different phrase with the same name: numbered
    list.push({ ...p, name }); n++;
  }
  if (n) save();
  return n;
}
// For the selftest: forget the in-memory copy (the next read comes from storage)
export function reloadPhrases() { list = null; load(); document.dispatchEvent(new CustomEvent('phrases-changed')); }
