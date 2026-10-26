/* =====================================================================
   SubSDJ · biblioteca de presets (13b). UNA fuente de verdad para todos
   los presets y escenas del synth: secciones ordenadas que el usuario
   crea, renombra, reordena y borra, con ítems (preset o escena) que se
   mueven, renombran, marcan como favoritos y borran. Vive entera en
   localStorage (LIB_KEY) y se exporta/importa como un solo JSON.

   Los orígenes de siempre son SEMILLA, no dueños: la primera vez se
   importan a la biblioteca (la fábrica desde el código, el banco del
   repo y las escenas por fetch, los presets de usuario del localStorage
   antiguo) y a partir de ahí manda el usuario. Cada ítem sembrado guarda
   su clave de semilla (origin:name) para que «Restore factory» reponga
   SOLO lo que falta: lo borrado vuelve a su sección; lo renombrado, movido
   o retocado no se duplica. Además, un ítem con el mismo nombre y el mismo
   contenido (huella canónica) nunca entra dos veces, venga de donde venga.

   Formato (1.4.0, en inglés): { format: 'subsdj-library-v2', next, files,
   sections: [{id, name}], items: [{id, type: 'preset'|'scene', name,
   section, fav, origin, seed, data}] }. La de hasta la 1.3.0 (en castellano,
   'subsdj-biblioteca-v1') se traduce al cargarla (legacy.migrateLibrary) y
   su copia antigua se queda donde estaba. Las demos A/B ya no se siembran:
   se cargan desde su JSON (File ▾ → Import).

   Sin DOM ni motor: el selftest la prueba con un almacenamiento falso. La
   UI se entera de cada cambio por `onChange` (presetBank lo convierte en
   el evento library-changed).
   ===================================================================== */
import { FACTORY, migrateV1, loadUser } from './presets.js';
import { LIBRARY_FORMAT, SCENE_FORMAT, migrateLibrary, migratePreset, migrateScene } from './legacy.js';

export const LIB_FORMATO = LIBRARY_FORMAT;
export const LIB_KEY = 'subsdj.library.v2';
const LIB_KEY_V1 = 'subsdj.biblioteca.v1';   // la de hasta la 1.3.0: se lee una vez y se traduce
export const SEC_MIOS = '★ Mine', SEC_ESCENAS = 'Scenes', SEC_IMPORT = 'Imported';
// Bancos y escenas del repo que se siembran por fetch (HTTP, como todo el synth)
export const FICHEROS_REPO = [
  { url: 'subsdj-presets-2.0.json', section: 'Presets 2.0', origin: 'v2' },
];
export const ESCENAS_REPO = ['ambient-nocturno', 'amanecer-dorico', 'techno-hipnotico', 'coro-robotico'];
const MAX_NOMBRE = 48;

// JSON canónico (claves ordenadas, recursivo): dos contenidos iguales dan la misma huella
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
const huellaDe = (nombre, datos) => nombre + '\u0000' + canon(datos);
export const normaliza = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const recorta = (s, alt) => (String(s == null ? '' : s).trim().slice(0, MAX_NOMBRE)) || alt;
const esV2 = d => d && d.format === LIBRARY_FORMAT && Array.isArray(d.sections) && Array.isArray(d.items);
// lo que entra a la biblioteca, ya en inglés
const datosDe = (tipo, src) => tipo === 'scene' ? migrateScene(src) : migratePreset(migrateV1(src));

export class Library {
  constructor({ key = LIB_KEY, keyV1 = LIB_KEY_V1, storage = null } = {}) {
    this.key = key; this.keyV1 = keyV1;
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.onChange = null;   // la UI se engancha aquí
    this.data = null;
  }
  vacia() { return { format: LIBRARY_FORMAT, next: 1, files: false, sections: [], items: [] }; }

  // Lee del almacenamiento; si no hay biblioteca (o está corrupta) mira si hay una
  // de antes (v1, en castellano) y la traduce; si tampoco, crea una y la siembra con
  // la fábrica y los presets de usuario antiguos. Devuelve si era nueva.
  // Los ficheros del repo se siembran aparte (sembrarFicheros: asíncrono).
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
    try { if (this.storage) this.storage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* sin persistencia */ }
    if (this.onChange) this.onChange();
  }
  _id(prefijo) { return prefijo + (this.data.next++).toString(36); }

  // ---------- secciones ----------
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
  moverSeccion(id, delta) {           // reordena: delta −1 / +1
    const a = this.data.sections, i = a.findIndex(s => s.id === id), j = i + delta;
    if (i < 0 || j < 0 || j >= a.length) return false;
    [a[i], a[j]] = [a[j], a[i]]; this.save(); return true;
  }
  borrarSeccion(id) {                 // con todo lo que contiene; devuelve cuántos ítems se fueron
    if (!this.seccion(id)) return 0;
    const n = this.data.items.filter(it => it.section === id).length;
    this.data.items = this.data.items.filter(it => it.section !== id);
    this.data.sections = this.data.sections.filter(s => s.id !== id);
    this.save(); return n;
  }

  // ---------- ítems ----------
  // El orden de `data.items` ES el orden dentro de cada sección; items() sin
  // argumento los da por secciones (el orden del selector rápido).
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
  mover(id, seccionId, antesDeId = null) {   // a otra sección y/o a otra posición (antes de un ítem; sin él, al final)
    const it = this.item(id); if (!it || !this.seccion(seccionId)) return false;
    this.data.items = this.data.items.filter(x => x !== it);
    it.section = seccionId;
    const j = antesDeId ? this.data.items.findIndex(x => x.id === antesDeId && x.section === seccionId) : -1;
    if (j >= 0) this.data.items.splice(j, 0, it); else this.data.items.push(it);
    this.save(); return true;
  }
  favoritos() { return this.items().filter(it => it.fav); }
  buscar(texto) { const q = normaliza(texto); return q ? this.items().filter(it => normaliza(it.name).includes(q)) : this.items(); }

  // ---------- semilla ----------
  // Añade a la sección (creándola) los del mapa {nombre: datos} que falten: ni
  // su clave de semilla ni su huella (nombre + contenido) están ya. Sin save.
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
      try { const j = migrateScene(await (await f('escenas/' + fichero + '.json', { cache: 'no-store' })).json()); n += this.sembrar('scene', SEC_ESCENAS, { [j.name || fichero]: j }, 'scene'); }
      catch (e) { errores.push(fichero); }
    }
    this.data.files = true;
    this.save();
    return { n, errores };
  }
  // «Restore factory»: código + banco del repo + escenas; solo lo que falte
  async traerDeFabrica(fetchFn) { const a = this.sembrarFabrica(); const r = await this.sembrarFicheros(fetchFn); return { n: a + r.n, errores: r.errores }; }

  // ---------- exportar / importar ----------
  exportar() { return { format: LIBRARY_FORMAT, date: new Date().toISOString(), sections: this.data.sections, items: this.data.items }; }
  // Funde, nunca sustituye. Acepta: una biblioteca (secciones por NOMBRE, ítems
  // con id nuevo; también las de hasta la 1.3.0), un banco {format, presets:{}}
  // o un mapa {nombre: datos} (a «Imported»), o una escena suelta (a «Scenes»).
  // `limpiar(datos)` la pone la UI para descartar claves que el rack no conoce.
  // Devuelve { type: 'library' | 'scene' | 'bank', n }.
  importar(json, { limpiar } = {}) {
    if (!json || typeof json !== 'object') throw new Error('not a SubSDJ JSON');
    const lim = limpiar || (d => d);
    json = migrateLibrary(migrateScene(json));   // si es de antes, en castellano
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
    for (const nombre in src) if (src[nombre] && typeof src[nombre] === 'object') mapa[nombre] = lim(datosDe('preset', src[nombre]));   // traducir ANTES de limpiar (vocVida…)
    const n = this.sembrar('import', SEC_IMPORT, mapa, 'preset', { conSemilla: false });
    this.save(); return { type: 'bank', n };
  }
}

export const library = new Library();   // la del synth (localStorage); presetBank la carga
