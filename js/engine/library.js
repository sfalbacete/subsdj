/* =====================================================================
   SubSDJ · preset library (13b). ONE source of truth for all of
   the synth's presets and scenes: ordered sections that the user
   creates, renames, reorders and deletes, with items (preset or scene) that are
   moved, renamed, marked as favorites and deleted. It lives entirely in
   localStorage (LIB_KEY) and is exported/imported as a single JSON.

   The usual origins are SEEDS, not owners: the first time, they are
   imported into the library (the factory from the code, the repo's bank
   and the scenes by fetch, the user presets from the old
   localStorage) and from then on the user is in charge. Each seeded item keeps
   its seed key (origin:name) so that «Restore factory» puts back
   ONLY what is missing: what was deleted returns to its section; what was renamed, moved
   or tweaked is not duplicated. Also, an item with the same name and the same
   content (canonical fingerprint) never gets in twice, wherever it comes from.

   Format (1.4.0, in English): { format: 'subsdj-library-v2', next, files,
   sections: [{id, name}], items: [{id, type: 'preset'|'scene', name,
   section, fav, origin, seed, data}] }. The one up to 1.3.0 (in Spanish,
   'subsdj-biblioteca-v1') is translated on load (legacy.migrateLibrary) and
   its old copy stays where it was. The A/B demos are no longer seeded:
   they are loaded from their JSON (File ▾ → Import).

   No DOM and no engine: the selftest tests it with a fake storage. The
   UI learns of every change through `onChange` (presetBank turns it into
   the library-changed event).
   ===================================================================== */
import { FACTORY, migrateV1, loadUser } from './presets.js';
import { LIBRARY_FORMAT, SCENE_FORMAT, migrateLibrary, migratePreset, migrateScene } from './legacy.js';

export const LIB_KEY = 'subsdj.library.v2';
const LIB_KEY_V1 = 'subsdj.biblioteca.v1';   // the one up to 1.3.0: read once and translated
export const SEC_MINE = '★ Mine', SEC_SCENES = 'Scenes', SEC_IMPORT = 'Imported';
// Repo banks and scenes seeded by fetch (HTTP, like the whole synth)
export const REPO_FILES = [
  { url: 'subsdj-presets-2.0.json', section: 'Presets 2.0', origin: 'v2' },
];
export const REPO_SCENES = ['night-ambient', 'dorian-dawn', 'hypnotic-techno', 'robot-choir'];
const MAX_NAME = 48;

// Canonical JSON (sorted keys, recursive): two equal contents give the same fingerprint
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
const fingerprintOf = (name, data) => name + '\u0000' + canon(data);
export const normalize = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const trimName = (s, alt) => (String(s == null ? '' : s).trim().slice(0, MAX_NAME)) || alt;
const isV2 = d => d && d.format === LIBRARY_FORMAT && Array.isArray(d.sections) && Array.isArray(d.items);
// what goes into the library, already in English
const dataOf = (type, src) => type === 'scene' ? migrateScene(src) : migratePreset(migrateV1(src));

export class Library {
  constructor({ key = LIB_KEY, keyV1 = LIB_KEY_V1, storage = null } = {}) {
    this.key = key; this.keyV1 = keyV1;
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.onChange = null;   // the UI hooks in here
    this.data = null;
  }
  empty() { return { format: LIBRARY_FORMAT, next: 1, files: false, sections: [], items: [] }; }

  // Reads from storage; if there is no library (or it is corrupt) it checks for one
  // from before (v1, in Spanish) and translates it; failing that, it creates one and seeds it with
  // the factory and the old user presets. Returns whether it was new.
  // The repo files are seeded separately (seedRepoFiles: asynchronous).
  load({ user, seed = true } = {}) {
    const read = k => { try { return JSON.parse(this.storage && k ? this.storage.getItem(k) : null); } catch (e) { return null; } };
    const d = read(this.key);
    if (!isV2(d)) {
      const v1 = migrateLibrary(read(this.keyV1));
      if (isV2(v1)) { this.data = v1; if (typeof this.data.next !== 'number') this.data.next = 1; this.save(); return false; }
    }
    const isNew = !isV2(d);
    this.data = isNew ? this.empty() : d;
    if (isNew && seed) { this.seedFactory(); this.seedUser(user); this.save(); }
    return isNew;
  }
  save() {
    try { if (this.storage) this.storage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* no persistence */ }
    if (this.onChange) this.onChange();
  }
  _id(prefix) { return prefix + (this.data.next++).toString(36); }

  // ---------- sections ----------
  sections() { return this.data.sections.slice(); }
  section(id) { return this.data.sections.find(s => s.id === id) || null; }
  sectionByName(name) { return this.data.sections.find(s => s.name === name) || null; }
  createSection(name, { save = true } = {}) {
    const s = { id: this._id('s'), name: trimName(name, 'Section') };
    this.data.sections.push(s);
    if (save) this.save();
    return s.id;
  }
  ensureSection(name) { const s = this.sectionByName(name); return s ? s.id : this.createSection(name, { save: false }); }
  renameSection(id, name) { const s = this.section(id); if (!s) return false; s.name = trimName(name, s.name); this.save(); return true; }
  moveSection(id, delta) {            // reorders: delta −1 / +1
    const a = this.data.sections, i = a.findIndex(s => s.id === id), j = i + delta;
    if (i < 0 || j < 0 || j >= a.length) return false;
    [a[i], a[j]] = [a[j], a[i]]; this.save(); return true;
  }
  deleteSection(id) {                 // with everything it contains; returns how many items went with it
    if (!this.section(id)) return 0;
    const n = this.data.items.filter(it => it.section === id).length;
    this.data.items = this.data.items.filter(it => it.section !== id);
    this.data.sections = this.data.sections.filter(s => s.id !== id);
    this.save(); return n;
  }

  // ---------- items ----------
  // The order of `data.items` IS the order within each section; items() with no
  // argument gives them section by section (the quick picker's order).
  items(sectionId) {
    if (sectionId) return this.data.items.filter(it => it.section === sectionId);
    const out = [];
    for (const s of this.data.sections) for (const it of this.data.items) if (it.section === s.id) out.push(it);
    return out;
  }
  presets() { return this.items().filter(it => it.type === 'preset'); }
  item(id) { return this.data.items.find(it => it.id === id) || null; }
  add({ type = 'preset', name, section, data, origin = 'user', seed = null, fav = false }, { save = true } = {}) {
    const it = { id: this._id(type === 'scene' ? 'e' : 'p'), type, name: trimName(name, type), section, fav: !!fav, origin, seed, data: data || {} };
    this.data.items.push(it);
    if (save) this.save();
    return it.id;
  }
  rename(id, name) { const it = this.item(id); if (!it) return false; it.name = trimName(name, it.name); this.save(); return true; }
  update(id, data) { const it = this.item(id); if (!it) return false; it.data = data || {}; this.save(); return true; }
  fav(id, on) { const it = this.item(id); if (!it) return false; it.fav = on === undefined ? !it.fav : !!on; this.save(); return it.fav; }
  remove(id) { const n = this.data.items.length; this.data.items = this.data.items.filter(it => it.id !== id); if (this.data.items.length === n) return false; this.save(); return true; }
  move(id, sectionId, beforeId = null) {   // to another section and/or another position (before an item; without one, at the end)
    const it = this.item(id); if (!it || !this.section(sectionId)) return false;
    this.data.items = this.data.items.filter(x => x !== it);
    it.section = sectionId;
    const j = beforeId ? this.data.items.findIndex(x => x.id === beforeId && x.section === sectionId) : -1;
    if (j >= 0) this.data.items.splice(j, 0, it); else this.data.items.push(it);
    this.save(); return true;
  }
  favorites() { return this.items().filter(it => it.fav); }
  search(text) { const q = normalize(text); return q ? this.items().filter(it => normalize(it.name).includes(q)) : this.items(); }

  // ---------- seed ----------
  // Adds to the section (creating it) the entries of the map {name: data} that are missing:
  // neither their seed key nor their fingerprint (name + content) is there yet. No save.
  seed(origin, sectionName, map, type = 'preset', { withSeed = true } = {}) {
    let n = 0;
    const secId = this.ensureSection(sectionName);
    const keys = new Set(this.data.items.map(it => it.seed).filter(Boolean));
    const prints = new Set(this.data.items.map(it => fingerprintOf(it.name, it.data)));
    for (const name in map) {
      const src = map[name]; if (!src || typeof src !== 'object') continue;
      const data = dataOf(type, src);
      const key = origin + ':' + name, fp = fingerprintOf(trimName(name, type), data);
      if ((withSeed && keys.has(key)) || prints.has(fp)) continue;
      this.add({ type, name, section: secId, data, origin, seed: withSeed ? key : null }, { save: false });
      keys.add(key); prints.add(fp); n++;
    }
    return n;
  }
  seedFactory() { let n = 0; for (const cat in FACTORY) n += this.seed('factory', cat, FACTORY[cat]); return n; }
  seedUser(map) { const m = map || loadUser(); return Object.keys(m).length ? this.seed('user', SEC_MINE, m) : 0; }
  async seedRepoFiles(fetchFn) {
    const f = fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!f) return { n: 0, errors: ['no fetch'] };
    let n = 0; const errors = [];
    for (const rf of REPO_FILES) {
      try { const j = await (await f(rf.url, { cache: 'no-store' })).json(); n += this.seed(rf.origin, rf.section, j.presets || j); }
      catch (e) { errors.push(rf.url); }
    }
    for (const file of REPO_SCENES) {
      try { const j = migrateScene(await (await f('scenes/' + file + '.json', { cache: 'no-store' })).json()); n += this.seed('scene', SEC_SCENES, { [j.name || file]: j }, 'scene'); }
      catch (e) { errors.push(file); }
    }
    this.data.files = true;
    this.save();
    return { n, errors };
  }
  // «Restore factory»: code + repo bank + scenes; only what is missing
  async restoreFactory(fetchFn) { const a = this.seedFactory(); const r = await this.seedRepoFiles(fetchFn); return { n: a + r.n, errors: r.errors }; }

  // ---------- export / import ----------
  exportData() { return { format: LIBRARY_FORMAT, date: new Date().toISOString(), sections: this.data.sections, items: this.data.items }; }
  // Merges, never replaces. Accepts: a library (sections by NAME, items
  // with a new id; also those up to 1.3.0), a bank {format, presets:{}}
  // or a map {name: data} (into «Imported»), or a loose scene (into «Scenes»).
  // `clean(data)` is supplied by the UI to discard keys the rack does not know.
  // Returns { type: 'library' | 'scene' | 'bank', n }.
  importData(json, { clean } = {}) {
    if (!json || typeof json !== 'object') throw new Error('not a SubSDJ JSON');
    const cl = clean || (d => d);
    json = migrateLibrary(migrateScene(json));   // if it is from before, in Spanish
    if (isV2(json)) {
      const sectionMap = {};
      for (const s of json.sections) sectionMap[s.id] = this.ensureSection(s.name);
      const prints = new Set(this.data.items.map(it => fingerprintOf(it.name, it.data)));
      let n = 0;
      for (const it of json.items) {
        if (!it || typeof it !== 'object') continue;
        const type = it.type === 'scene' ? 'scene' : 'preset';
        const data = type === 'scene' ? migrateScene(it.data || {}) : cl(dataOf('preset', it.data || {}));
        const fp = fingerprintOf(trimName(it.name, type), data);
        if (prints.has(fp)) continue;
        this.add({ type, name: it.name, section: sectionMap[it.section] || this.ensureSection(SEC_IMPORT), data,
                   origin: it.origin || 'import', seed: it.seed || null, fav: it.fav }, { save: false });
        prints.add(fp); n++;
      }
      this.save(); return { type: 'library', n };
    }
    if (json.format === SCENE_FORMAT) {
      const n = this.seed('import', SEC_SCENES, { [json.name || 'Imported scene']: json }, 'scene', { withSeed: false });
      this.save(); return { type: 'scene', n };
    }
    const src = json.presets && typeof json.presets === 'object' ? json.presets : json;
    const map = {};
    for (const name in src) if (src[name] && typeof src[name] === 'object') map[name] = cl(dataOf('preset', src[name]));   // translate BEFORE cleaning (vocVida…)
    const n = this.seed('import', SEC_IMPORT, map, 'preset', { withSeed: false });
    this.save(); return { type: 'bank', n };
  }
}

export const library = new Library();   // the synth's own (localStorage); presetBank loads it
