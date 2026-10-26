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

export const LIB_FORMATO = LIBRARY_FORMAT;
export const LIB_KEY = 'subsdj.library.v2';
const LIB_KEY_V1 = 'subsdj.biblioteca.v1';   // the one up to 1.3.0: read once and translated
export const SEC_MIOS = '★ Mine', SEC_ESCENAS = 'Scenes', SEC_IMPORT = 'Imported';
// Repo banks and scenes seeded by fetch (HTTP, like the whole synth)
export const FICHEROS_REPO = [
  { url: 'subsdj-presets-2.0.json', section: 'Presets 2.0', origin: 'v2' },
];
export const ESCENAS_REPO = ['night-ambient', 'dorian-dawn', 'hypnotic-techno', 'robot-choir'];
const MAX_NOMBRE = 48;

// Canonical JSON (sorted keys, recursive): two equal contents give the same fingerprint
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
const huellaDe = (nombre, datos) => nombre + '\u0000' + canon(datos);
export const normaliza = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const recorta = (s, alt) => (String(s == null ? '' : s).trim().slice(0, MAX_NOMBRE)) || alt;
const esV2 = d => d && d.format === LIBRARY_FORMAT && Array.isArray(d.sections) && Array.isArray(d.items);
// what goes into the library, already in English
const datosDe = (tipo, src) => tipo === 'scene' ? migrateScene(src) : migratePreset(migrateV1(src));

export class Library {
  constructor({ key = LIB_KEY, keyV1 = LIB_KEY_V1, storage = null } = {}) {
    this.key = key; this.keyV1 = keyV1;
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.onChange = null;   // the UI hooks in here
    this.data = null;
  }
  vacia() { return { format: LIBRARY_FORMAT, next: 1, files: false, sections: [], items: [] }; }

  // Reads from storage; if there is no library (or it is corrupt) it checks for one
  // from before (v1, in Spanish) and translates it; failing that, it creates one and seeds it with
  // the factory and the old user presets. Returns whether it was new.
  // The repo files are seeded separately (sembrarFicheros: asynchronous).
  load({ usuario, semilla = true } = {}) {
    const leer = k => { try { return JSON.parse(this.storage && k ? this.storage.getItem(k) : null); } catch (e) { return null; } };
    let d = leer(this.key);
    if (!esV2(d)) {
      const v1 = migrateLibrary(leer(this.keyV1));
      if (esV2(v1)) { this.data = v1; if (typeof this.data.next !== 'number') this.data.next = 1; this.save(); return false; }
    }
    const nueva = !esV2(d);
    this.data = nueva ? this.vacia() : d;
    if (nueva && semilla) { this.sembrarFabrica(); this.sembrarUsuario(usuario); this.save(); }
    return nueva;
  }
  save() {
    try { if (this.storage) this.storage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* no persistence */ }
    if (this.onChange) this.onChange();
  }
  _id(prefijo) { return prefijo + (this.data.next++).toString(36); }

  // ---------- sections ----------
  secciones() { return this.data.sections.slice(); }
  seccion(id) { return this.data.sections.find(s => s.id === id) || null; }
  seccionPorNombre(nombre) { return this.data.sections.find(s => s.name === nombre) || null; }
  crearSeccion(nombre, { save = true } = {}) {
    const s = { id: this._id('s'), name: recorta(nombre, 'Section') };
    this.data.sections.push(s);
    if (save) this.save();
    return s.id;
  }
  asegurarSeccion(nombre) { const s = this.seccionPorNombre(nombre); return s ? s.id : this.crearSeccion(nombre, { save: false }); }
  renombrarSeccion(id, nombre) { const s = this.seccion(id); if (!s) return false; s.name = recorta(nombre, s.name); this.save(); return true; }
  moverSeccion(id, delta) {           // reorders: delta −1 / +1
    const a = this.data.sections, i = a.findIndex(s => s.id === id), j = i + delta;
    if (i < 0 || j < 0 || j >= a.length) return false;
    [a[i], a[j]] = [a[j], a[i]]; this.save(); return true;
  }
  borrarSeccion(id) {                 // with everything it contains; returns how many items went with it
    if (!this.seccion(id)) return 0;
    const n = this.data.items.filter(it => it.section === id).length;
    this.data.items = this.data.items.filter(it => it.section !== id);
    this.data.sections = this.data.sections.filter(s => s.id !== id);
    this.save(); return n;
  }

  // ---------- items ----------
  // The order of `data.items` IS the order within each section; items() with no
  // argument gives them section by section (the quick selector's order).
  items(seccionId) {
    if (seccionId) return this.data.items.filter(it => it.section === seccionId);
    const out = [];
    for (const s of this.data.sections) for (const it of this.data.items) if (it.section === s.id) out.push(it);
    return out;
  }
  presets() { return this.items().filter(it => it.type === 'preset'); }
  item(id) { return this.data.items.find(it => it.id === id) || null; }
  añadir({ tipo = 'preset', nombre, seccion, datos, origen = 'user', semilla = null, fav = false }, { save = true } = {}) {
    const it = { id: this._id(tipo === 'scene' ? 'e' : 'p'), type: tipo, name: recorta(nombre, tipo), section: seccion, fav: !!fav, origin: origen, seed: semilla, data: datos || {} };
    this.data.items.push(it);
    if (save) this.save();
    return it.id;
  }
  renombrar(id, nombre) { const it = this.item(id); if (!it) return false; it.name = recorta(nombre, it.name); this.save(); return true; }
  actualizar(id, datos) { const it = this.item(id); if (!it) return false; it.data = datos || {}; this.save(); return true; }
  fav(id, on) { const it = this.item(id); if (!it) return false; it.fav = on === undefined ? !it.fav : !!on; this.save(); return it.fav; }
  borrar(id) { const n = this.data.items.length; this.data.items = this.data.items.filter(it => it.id !== id); if (this.data.items.length === n) return false; this.save(); return true; }
  mover(id, seccionId, antesDeId = null) {   // to another section and/or another position (before an item; without one, at the end)
    const it = this.item(id); if (!it || !this.seccion(seccionId)) return false;
    this.data.items = this.data.items.filter(x => x !== it);
    it.section = seccionId;
    const j = antesDeId ? this.data.items.findIndex(x => x.id === antesDeId && x.section === seccionId) : -1;
    if (j >= 0) this.data.items.splice(j, 0, it); else this.data.items.push(it);
    this.save(); return true;
  }
  favoritos() { return this.items().filter(it => it.fav); }
  buscar(texto) { const q = normaliza(texto); return q ? this.items().filter(it => normaliza(it.name).includes(q)) : this.items(); }

  // ---------- seed ----------
  // Adds to the section (creating it) the entries of the map {name: data} that are missing:
  // neither their seed key nor their fingerprint (name + content) is there yet. No save.
  sembrar(origen, seccionNombre, mapa, tipo = 'preset', { conSemilla = true } = {}) {
    let n = 0;
    const secId = this.asegurarSeccion(seccionNombre);
    const claves = new Set(this.data.items.map(it => it.seed).filter(Boolean));
    const huellas = new Set(this.data.items.map(it => huellaDe(it.name, it.data)));
    for (const nombre in mapa) {
      const src = mapa[nombre]; if (!src || typeof src !== 'object') continue;
      const datos = datosDe(tipo, src);
      const clave = origen + ':' + nombre, h = huellaDe(recorta(nombre, tipo), datos);
      if ((conSemilla && claves.has(clave)) || huellas.has(h)) continue;
      this.añadir({ tipo, nombre, seccion: secId, datos, origen, semilla: conSemilla ? clave : null }, { save: false });
      claves.add(clave); huellas.add(h); n++;
    }
    return n;
  }
  sembrarFabrica() { let n = 0; for (const cat in FACTORY) n += this.sembrar('factory', cat, FACTORY[cat]); return n; }
  sembrarUsuario(mapa) { const m = mapa || loadUser(); return Object.keys(m).length ? this.sembrar('user', SEC_MIOS, m) : 0; }
  async sembrarFicheros(fetchFn) {
    const f = fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!f) return { n: 0, errores: ['no fetch'] };
    let n = 0; const errores = [];
    for (const fr of FICHEROS_REPO) {
      try { const j = await (await f(fr.url, { cache: 'no-store' })).json(); n += this.sembrar(fr.origin, fr.section, j.presets || j); }
      catch (e) { errores.push(fr.url); }
    }
    for (const fichero of ESCENAS_REPO) {
      try { const j = migrateScene(await (await f('scenes/' + fichero + '.json', { cache: 'no-store' })).json()); n += this.sembrar('scene', SEC_ESCENAS, { [j.name || fichero]: j }, 'scene'); }
      catch (e) { errores.push(fichero); }
    }
    this.data.files = true;
    this.save();
    return { n, errores };
  }
  // «Restore factory»: code + repo bank + scenes; only what is missing
  async traerDeFabrica(fetchFn) { const a = this.sembrarFabrica(); const r = await this.sembrarFicheros(fetchFn); return { n: a + r.n, errores: r.errores }; }

  // ---------- export / import ----------
  exportar() { return { format: LIBRARY_FORMAT, date: new Date().toISOString(), sections: this.data.sections, items: this.data.items }; }
  // Merges, never replaces. Accepts: a library (sections by NAME, items
  // with a new id; also those up to 1.3.0), a bank {format, presets:{}}
  // or a map {name: data} (into «Imported»), or a loose scene (into «Scenes»).
  // `limpiar(datos)` is supplied by the UI to discard keys the rack does not know.
  // Returns { type: 'library' | 'scene' | 'bank', n }.
  importar(json, { limpiar } = {}) {
    if (!json || typeof json !== 'object') throw new Error('not a SubSDJ JSON');
    const lim = limpiar || (d => d);
    json = migrateLibrary(migrateScene(json));   // if it is from before, in Spanish
    if (esV2(json)) {
      const mapaSec = {};
      for (const s of json.sections) mapaSec[s.id] = this.asegurarSeccion(s.name);
      const huellas = new Set(this.data.items.map(it => huellaDe(it.name, it.data)));
      let n = 0;
      for (const it of json.items) {
        if (!it || typeof it !== 'object') continue;
        const tipo = it.type === 'scene' ? 'scene' : 'preset';
        const datos = tipo === 'scene' ? migrateScene(it.data || {}) : lim(datosDe('preset', it.data || {}));
        const h = huellaDe(recorta(it.name, tipo), datos);
        if (huellas.has(h)) continue;
        this.añadir({ tipo, nombre: it.name, seccion: mapaSec[it.section] || this.asegurarSeccion(SEC_IMPORT), datos,
                      origen: it.origin || 'import', semilla: it.seed || null, fav: it.fav }, { save: false });
        huellas.add(h); n++;
      }
      this.save(); return { type: 'library', n };
    }
    if (json.format === SCENE_FORMAT) {
      const n = this.sembrar('import', SEC_ESCENAS, { [json.name || 'Imported scene']: json }, 'scene', { conSemilla: false });
      this.save(); return { type: 'scene', n };
    }
    const src = json.presets && typeof json.presets === 'object' ? json.presets : json;
    const mapa = {};
    for (const nombre in src) if (src[nombre] && typeof src[nombre] === 'object') mapa[nombre] = lim(datosDe('preset', src[nombre]));   // translate BEFORE cleaning (vocVida…)
    const n = this.sembrar('import', SEC_IMPORT, mapa, 'preset', { conSemilla: false });
    this.save(); return { type: 'bank', n };
  }
}

export const library = new Library();   // the synth's own (localStorage); presetBank loads it
