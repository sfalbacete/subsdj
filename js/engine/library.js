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
import { FACTORY, META, BANK, BANK_REV, factoryPreset, migrateV1, loadUser, LS_USER_KEYS } from './presets.js';
import { LIBRARY_FORMAT, SCENE_FORMAT, migrateLibrary, migratePreset, migrateScene, LEGACY_FP, DEMO_FP } from './legacy.js';

export const LIB_KEY = 'subsdj.library.v2';
const LIB_KEY_V1 = 'subsdj.biblioteca.v1';   // the one up to 1.3.0: read once and translated
export const SEC_MINE = '★ Mine', SEC_SCENES = 'Scenes', SEC_IMPORT = 'Imported';
// Repo banks seeded by fetch (HTTP, like the whole synth). Empty since 1.5.0: the «Presets 2.0»
// bank retired with the old factory (both live in subsdj-bank-1.4.json, File ▾ → Import).
export const REPO_FILES = [];
export const REPO_SCENES = ['night-ambient', 'dorian-dawn', 'hypnotic-techno', 'robot-choir', 'berlin-school', 'dub-session', 'kit-909', 'deep-space'];
const MAX_NAME = 48;

// Canonical JSON (sorted keys, recursive): two equal contents give the same fingerprint
export function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
// FNV-1a (32 bit, 8 hex chars) of a string: the short fingerprint stored with each seeded item
export function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }
const fingerprintOf = (name, data) => name + '\u0000' + canon(data);
const seedNameOf = s => s.replace(/^[a-z0-9]+:(?:\d+:)?/, '');   // 'factory:2:Warm Pad' → 'Warm Pad'
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
  // the factory and the old user presets. A library from another bank revision is synced
  // with the code (syncBank). Returns whether it was new.
  // The repo files are seeded separately (seedRepoFiles: asynchronous).
  load({ user, seed = true } = {}) {
    const read = k => { try { return JSON.parse(this.storage && k ? this.storage.getItem(k) : null); } catch (e) { return null; } };
    let d = read(this.key), fromV1 = false;
    if (!isV2(d)) { const v1 = migrateLibrary(read(this.keyV1)); if (isV2(v1)) { d = v1; fromV1 = true; } }
    const isNew = !isV2(d);
    this.data = isNew ? this.empty() : d;
    if (typeof this.data.next !== 'number') this.data.next = 1;
    if (isNew) { if (seed) { this.seedFactory(); this.seedUser(user); this.data.bankRev = BANK_REV; } this.save(); }   // no bank, no revision (tests)
    else if (this.data.bankRev !== BANK_REV && seed) { this.syncBank(); this.save(); }
    else if (fromV1) this.save();
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
  deleteSection(id) { const snap = this.deleteSectionUndoable(id); return snap ? snap.items.length : 0; }   // returns how many items went with it
  deleteSectionUndoable(id) {         // with everything it contains; what restore() needs to put it all back
    const sectionAt = this.data.sections.findIndex(s => s.id === id); if (sectionAt < 0) return null;
    const items = []; this.data.items.forEach((it, at) => { if (it.section === id) items.push({ it, at }); });
    this.data.items = this.data.items.filter(it => it.section !== id);
    const [section] = this.data.sections.splice(sectionAt, 1);
    this.save(); return { section, sectionAt, items };
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
  // `tags` and `play` (factory metadata) travel with the item, outside `data`: Save never
  // overwrites them. `seedFp`/`seedSec` remember how a seeded item came in (syncBank).
  add({ type = 'preset', name, section, data, origin = 'user', seed = null, fav = false, tags, play, seedFp, seedSec }, { save = true } = {}) {
    const it = { id: this._id(type === 'scene' ? 'e' : 'p'), type, name: trimName(name, type), section, fav: !!fav, origin, seed, data: data || {} };
    if (Array.isArray(tags) && tags.length) it.tags = tags.slice();
    if (typeof play === 'string' && play) it.play = play;
    if (seedFp) { it.seedFp = seedFp; it.seedSec = seedSec; }
    this.data.items.push(it);
    if (save) this.save();
    return it.id;
  }
  rename(id, name) { const it = this.item(id); if (!it) return false; it.name = trimName(name, it.name); this.save(); return true; }
  update(id, data) { const it = this.item(id); if (!it) return false; it.data = data || {}; this.save(); return true; }
  fav(id, on) { const it = this.item(id); if (!it) return false; it.fav = on === undefined ? !it.fav : !!on; this.save(); return it.fav; }
  // Deletions return what they removed (and where), so the UI can offer «Undo» instead of a
  // confirm; restore() puts it back where it was (the section too, if it went with it).
  remove(id) {
    const at = this.data.items.findIndex(it => it.id === id); if (at < 0) return null;
    const [it] = this.data.items.splice(at, 1); this.save();
    return { items: [{ it, at }] };
  }
  restore(snap) {
    if (!snap) return false;
    if (snap.section && !this.section(snap.section.id)) this.data.sections.splice(Math.min(snap.sectionAt, this.data.sections.length), 0, snap.section);
    for (const { it, at } of snap.items) if (!this.item(it.id)) this.data.items.splice(Math.min(at, this.data.items.length), 0, it);
    this.save(); return true;
  }
  // ---------- what an item is (the Presets screen marks it) ----------
  // 'factory' = as seeded · 'modified' = a factory preset edited in place (its content no longer
  // matches the fingerprint it was seeded with) · 'old' = a copy of a previous bank the sync
  // respected (renamed, moved, edited or ★ back then) · 'scene' · 'user' · 'import'
  kind(it) {
    if (it.type === 'scene') return 'scene';
    if (it.origin === 'factory' || it.origin === 'v2') return !it.seedFp ? 'old' : fnv(canon(it.data)) === it.seedFp ? 'factory' : 'modified';
    return it.origin === 'user' ? 'user' : 'import';
  }
  // the current factory values of a factory item (by its seed name), if the bank still has that name
  factoryDataOf(it) { const n = it.seed ? seedNameOf(it.seed) : it.name, src = factoryPreset(n); return src ? { name: n, data: dataOf('preset', src) } : null; }
  resetToFactory(id) {
    const it = this.item(id), f = it && this.factoryDataOf(it); if (!f) return false;
    it.data = f.data; it.seedFp = fnv(canon(f.data)); if (!it.seedSec) it.seedSec = (this.section(it.section) || {}).name;
    const m = META[f.name]; if (m) { it.tags = (m.tags || []).slice(); it.play = m.play; }
    this.save(); return true;
  }
  // Wipe: forgets the library AND everything a load could rebuild it from (the pre-1.4 Spanish
  // one, the pre-library user presets): the next load seeds from scratch. The UI downloads a copy first.
  wipe() { for (const k of [this.key, this.keyV1, ...LS_USER_KEYS]) { try { if (this.storage) this.storage.removeItem(k); } catch (e) { /* no persistence */ } } this.data = null; }
  move(id, sectionId, beforeId = null) {   // to another section and/or another position (before an item; without one, at the end)
    const it = this.item(id); if (!it || !this.section(sectionId)) return false;
    this.data.items = this.data.items.filter(x => x !== it);
    it.section = sectionId;
    const j = beforeId ? this.data.items.findIndex(x => x.id === beforeId && x.section === sectionId) : -1;
    if (j >= 0) this.data.items.splice(j, 0, it); else this.data.items.push(it);
    this.save(); return true;
  }
  favorites() { return this.items().filter(it => it.fav); }
  search(text) { const q = normalize(text); return q ? this.items().filter(it => normalize(it.name + ' ' + (it.tags || []).join(' ')).includes(q)) : this.items(); }   // name or tags

  // ---------- seed ----------
  // Adds to the section (creating it) the entries of the map {name: data} that are missing:
  // neither their seed key nor their fingerprint (name + content) is there yet. No save.
  // The seed key carries the bank revision (`factory:2:Name`): a preset the user tweaked
  // under a previous revision keeps its key and the new one still comes in. `meta` (name →
  // {tags, play}) travels with the item.
  seed(origin, sectionName, map, type = 'preset', { withSeed = true, rev = null, meta = null } = {}) {
    let n = 0;
    const secId = this.ensureSection(sectionName);
    const keys = new Set(this.data.items.map(it => it.seed).filter(Boolean));
    const prints = new Set(this.data.items.map(it => fingerprintOf(it.name, it.data)));
    for (const name in map) {
      const src = map[name]; if (!src || typeof src !== 'object') continue;
      const data = dataOf(type, src);
      const key = origin + ':' + (rev ? rev + ':' : '') + name, fp = fingerprintOf(trimName(name, type), data);
      if ((withSeed && keys.has(key)) || prints.has(fp)) continue;
      const m = meta && meta[name];
      this.add({ type, name, section: secId, data, origin, seed: withSeed ? key : null,
                 seedFp: withSeed ? fnv(canon(data)) : null, seedSec: sectionName, tags: m && m.tags, play: m && m.play }, { save: false });
      keys.add(key); prints.add(fp); n++;
    }
    return n;
  }
  seedFactory() { let n = 0; for (const cat in FACTORY) n += this.seed('factory', cat, FACTORY[cat], 'preset', { rev: BANK_REV, meta: META }); return n; }
  // The code's bank changed (BANK_REV ≠ the library's): the factory and repo items that are still
  // exactly as they were seeded — same name, same section, same content — and not ★ go (the
  // archive subsdj-bank-1.4.json has the old ones); what the user renamed, moved, edited or
  // starred stays where it is. Then the current bank comes in, its categories first, and the
  // repo scenes are re-seeded at the next start (files = false). «As seeded» is known by the
  // fingerprint stored with the item (seedFp) or, for what 1.4 seeded, by legacy.LEGACY_FP.
  // A seeded copy of the factory / repo bank / scenes the user never touched: its seed name, a section
  // and a content it was seeded with, and no ★ — by seedFp/seedSec for what 1.5.0 seeds, by LEGACY_FP
  // (every version ever shipped) for what came before. `secName` is the name of the item's section.
  _legacyCopy(it, secName) {
    if (!it.seed || it.fav || !/^(factory|v2|scene):/.test(it.seed) || it.name !== seedNameOf(it.seed)) return false;
    if (it.seedFp) return secName === it.seedSec && fnv(canon(it.data)) === it.seedFp;
    const old = LEGACY_FP[it.seed];
    return !!old && old.s.includes(secName) && old.f.includes(fnv(canon(it.data)));
  }
  syncBank() {
    const secName = it => { const s = this.section(it.section); return s ? s.name : null; };
    // …and the A/B demo pairs that the pre-library import flattened into «★ Mine» as the user's own
    const demoCopy = it => it.origin === 'user' && it.type === 'preset' && !it.fav && secName(it) === SEC_MINE &&
      it.seed === 'user:' + it.name && DEMO_FP.has(fnv(canon(it.data)));
    const gone = new Set(this.data.items.filter(it => this._legacyCopy(it, secName(it)) || demoCopy(it)).map(it => it.id));
    this.data.items = this.data.items.filter(it => !gone.has(it.id));
    // empty bank sections (old categories, the retired repo bank, the scenes) go; a user's empty section stays
    const bankSecs = new Set([...Object.values(LEGACY_FP).flatMap(v => v.s), ...BANK.map(c => c.cat), SEC_SCENES]);
    const used = new Set(this.data.items.map(it => it.section));
    this.data.sections = this.data.sections.filter(s => used.has(s.id) || !bankSecs.has(s.name));
    const added = this.seedFactory();
    const order = BANK.map(c => c.cat), rank = s => (order.indexOf(s.name) + 1) || 1e3;   // the bank's categories first, in its order
    this.data.sections.sort((a, b) => rank(a) - rank(b));
    this.data.files = false;
    this.data.bankRev = BANK_REV;
    return { removed: gone.size, added };
  }
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
      try { const j = migrateScene(await (await f('scenes/' + file + '.json', { cache: 'no-store' })).json()); n += this.seed('scene', SEC_SCENES, { [j.name || file]: j }, 'scene', { rev: BANK_REV }); }
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
        // an untouched copy of an old factory / repo item (from any version) does not come into a
        // library that has the bank: the bank has its successor and the archive the original
        if (this.data.bankRev !== undefined && this._legacyCopy({ ...it, data }, (json.sections.find(s => s.id === it.section) || {}).name)) continue;
        this.add({ type, name: it.name, section: sectionMap[it.section] || this.ensureSection(SEC_IMPORT), data,
                   origin: it.origin || 'import', seed: it.seed || null, fav: it.fav, tags: it.tags, play: it.play, seedFp: it.seedFp, seedSec: it.seedSec }, { save: false });
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
