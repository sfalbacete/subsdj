/* =====================================================================
   SubSDJ · biblioteca de presets (13b). UNA fuente de verdad para todos
   los presets y escenas del synth: secciones ordenadas que el usuario
   crea, renombra, reordena y borra, con ítems (preset o escena) que se
   mueven, renombran, marcan como favoritos y borran. Vive entera en
   localStorage (LIB_KEY) y se exporta/importa como un solo JSON.

   Los orígenes de siempre son SEMILLA, no dueños: la primera vez se
   importan a la biblioteca (la fábrica desde el código, los bancos del
   repo y las escenas por fetch, los presets de usuario del localStorage
   antiguo) y a partir de ahí manda el usuario. Cada ítem sembrado guarda
   su clave de semilla (origen:nombre) para que «traer de fábrica» reponga
   SOLO lo que falta: lo borrado vuelve a su sección; lo renombrado, movido
   o retocado no se duplica. Además, un ítem con el mismo nombre y el mismo
   contenido (huella canónica) nunca entra dos veces, venga de donde venga.

   Sin DOM ni motor: el selftest la prueba con un almacenamiento falso. La
   UI se entera de cada cambio por `onChange` (presetBank lo convierte en
   el evento library-changed).
   ===================================================================== */
import { FACTORY, migrateV1, loadUser } from './presets.js';

export const LIB_FORMATO = 'subsdj-biblioteca-v1';
export const LIB_KEY = 'subsdj.biblioteca.v1';
export const SEC_MIOS = '★ Míos', SEC_ESCENAS = 'Escenas', SEC_IMPORT = 'Importados';
// Bancos y escenas del repo que se siembran por fetch (HTTP, como todo el synth)
export const FICHEROS_REPO = [
  { url: 'subsdj-presets-2.0.json', seccion: 'Presets 2.0', origen: 'v2' },
  { url: 'subsdj-demos.json', seccion: 'Demos A/B', origen: 'demos' },
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

export class Library {
  constructor({ key = LIB_KEY, storage = null } = {}) {
    this.key = key;
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.onChange = null;   // la UI se engancha aquí
    this.data = null;
  }
  vacia() { return { formato: LIB_FORMATO, next: 1, ficheros: false, secciones: [], items: [] }; }

  // Lee del almacenamiento; si no hay biblioteca (o está corrupta) crea una y la
  // siembra con la fábrica y los presets de usuario antiguos. Devuelve si era nueva.
  // Los ficheros del repo se siembran aparte (sembrarFicheros: asíncrono).
  load({ usuario, semilla = true } = {}) {
    let d = null;
    try { d = JSON.parse(this.storage ? this.storage.getItem(this.key) : null); } catch (e) { /* JSON corrupto → nueva */ }
    const nueva = !(d && d.formato === LIB_FORMATO && Array.isArray(d.secciones) && Array.isArray(d.items));
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
  secciones() { return this.data.secciones.slice(); }
  seccion(id) { return this.data.secciones.find(s => s.id === id) || null; }
  seccionPorNombre(nombre) { return this.data.secciones.find(s => s.nombre === nombre) || null; }
  crearSeccion(nombre, { save = true } = {}) {
    const s = { id: this._id('s'), nombre: recorta(nombre, 'Sección') };
    this.data.secciones.push(s);
    if (save) this.save();
    return s.id;
  }
  asegurarSeccion(nombre) { const s = this.seccionPorNombre(nombre); return s ? s.id : this.crearSeccion(nombre, { save: false }); }
  renombrarSeccion(id, nombre) { const s = this.seccion(id); if (!s) return false; s.nombre = recorta(nombre, s.nombre); this.save(); return true; }
  moverSeccion(id, delta) {           // reordena: delta −1 / +1
    const a = this.data.secciones, i = a.findIndex(s => s.id === id), j = i + delta;
    if (i < 0 || j < 0 || j >= a.length) return false;
    [a[i], a[j]] = [a[j], a[i]]; this.save(); return true;
  }
  borrarSeccion(id) {                 // con todo lo que contiene; devuelve cuántos ítems se fueron
    if (!this.seccion(id)) return 0;
    const n = this.data.items.filter(it => it.seccion === id).length;
    this.data.items = this.data.items.filter(it => it.seccion !== id);
    this.data.secciones = this.data.secciones.filter(s => s.id !== id);
    this.save(); return n;
  }

  // ---------- ítems ----------
  // El orden de `data.items` ES el orden dentro de cada sección; items() sin
  // argumento los da por secciones (el orden del selector rápido).
  items(seccionId) {
    if (seccionId) return this.data.items.filter(it => it.seccion === seccionId);
    const out = [];
    for (const s of this.data.secciones) for (const it of this.data.items) if (it.seccion === s.id) out.push(it);
    return out;
  }
  presets() { return this.items().filter(it => it.tipo === 'preset'); }
  item(id) { return this.data.items.find(it => it.id === id) || null; }
  añadir({ tipo = 'preset', nombre, seccion, datos, origen = 'usuario', semilla = null, fav = false }, { save = true } = {}) {
    const it = { id: this._id(tipo === 'escena' ? 'e' : 'p'), tipo, nombre: recorta(nombre, tipo), seccion, fav: !!fav, origen, semilla, datos: datos || {} };
    this.data.items.push(it);
    if (save) this.save();
    return it.id;
  }
  renombrar(id, nombre) { const it = this.item(id); if (!it) return false; it.nombre = recorta(nombre, it.nombre); this.save(); return true; }
  actualizar(id, datos) { const it = this.item(id); if (!it) return false; it.datos = datos || {}; this.save(); return true; }
  fav(id, on) { const it = this.item(id); if (!it) return false; it.fav = on === undefined ? !it.fav : !!on; this.save(); return it.fav; }
  borrar(id) { const n = this.data.items.length; this.data.items = this.data.items.filter(it => it.id !== id); if (this.data.items.length === n) return false; this.save(); return true; }
  mover(id, seccionId, antesDeId = null) {   // a otra sección y/o a otra posición (antes de un ítem; sin él, al final)
    const it = this.item(id); if (!it || !this.seccion(seccionId)) return false;
    this.data.items = this.data.items.filter(x => x !== it);
    it.seccion = seccionId;
    const j = antesDeId ? this.data.items.findIndex(x => x.id === antesDeId && x.seccion === seccionId) : -1;
    if (j >= 0) this.data.items.splice(j, 0, it); else this.data.items.push(it);
    this.save(); return true;
  }
  favoritos() { return this.items().filter(it => it.fav); }
  buscar(texto) { const q = normaliza(texto); return q ? this.items().filter(it => normaliza(it.nombre).includes(q)) : this.items(); }

  // ---------- semilla ----------
  // Añade a la sección (creándola) los del mapa {nombre: datos} que falten: ni
  // su clave de semilla ni su huella (nombre + contenido) están ya. Sin save.
  sembrar(origen, seccionNombre, mapa, tipo = 'preset', { conSemilla = true } = {}) {
    let n = 0;
    const secId = this.asegurarSeccion(seccionNombre);
    const claves = new Set(this.data.items.map(it => it.semilla).filter(Boolean));
    const huellas = new Set(this.data.items.map(it => huellaDe(it.nombre, it.datos)));
    for (const nombre in mapa) {
      const src = mapa[nombre]; if (!src || typeof src !== 'object') continue;
      const datos = tipo === 'preset' ? migrateV1(src) : src;
      const clave = origen + ':' + nombre, h = huellaDe(recorta(nombre, tipo), datos);
      if ((conSemilla && claves.has(clave)) || huellas.has(h)) continue;
      this.añadir({ tipo, nombre, seccion: secId, datos, origen, semilla: conSemilla ? clave : null }, { save: false });
      claves.add(clave); huellas.add(h); n++;
    }
    return n;
  }
  sembrarFabrica() { let n = 0; for (const cat in FACTORY) n += this.sembrar('fabrica', cat, FACTORY[cat]); return n; }
  sembrarUsuario(mapa) { const m = mapa || loadUser(); return Object.keys(m).length ? this.sembrar('usuario', SEC_MIOS, m) : 0; }
  async sembrarFicheros(fetchFn) {
    const f = fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!f) return { n: 0, errores: ['sin fetch'] };
    let n = 0; const errores = [];
    for (const fr of FICHEROS_REPO) {
      try { const j = await (await f(fr.url, { cache: 'no-store' })).json(); n += this.sembrar(fr.origen, fr.seccion, j.presets || j); }
      catch (e) { errores.push(fr.url); }
    }
    for (const nombre of ESCENAS_REPO) {
      try { const j = await (await f('escenas/' + nombre + '.json', { cache: 'no-store' })).json(); n += this.sembrar('escena', SEC_ESCENAS, { [j.nombre || nombre]: j }, 'escena'); }
      catch (e) { errores.push(nombre); }
    }
    this.data.ficheros = true;
    this.save();
    return { n, errores };
  }
  // «Traer de fábrica»: código + bancos del repo + escenas; solo lo que falte
  async traerDeFabrica(fetchFn) { const a = this.sembrarFabrica(); const r = await this.sembrarFicheros(fetchFn); return { n: a + r.n, errores: r.errores }; }

  // ---------- exportar / importar ----------
  exportar() { return { formato: LIB_FORMATO, fecha: new Date().toISOString(), secciones: this.data.secciones, items: this.data.items }; }
  // Funde, nunca sustituye. Acepta: una biblioteca (secciones por NOMBRE, ítems
  // con id nuevo), un banco v2 {formato, presets:{}} o un mapa {nombre: datos}
  // (a «Importados»), o una escena suelta (a «Escenas»). `limpiar(datos)` la
  // pone la UI para descartar claves que el rack no conoce.
  importar(json, { limpiar } = {}) {
    if (!json || typeof json !== 'object') throw new Error('no es JSON de SubSDJ');
    const lim = limpiar || (d => d);
    if (json.formato === LIB_FORMATO && Array.isArray(json.items)) {
      const mapaSec = {};
      for (const s of json.secciones || []) mapaSec[s.id] = this.asegurarSeccion(s.nombre);
      const huellas = new Set(this.data.items.map(it => huellaDe(it.nombre, it.datos)));
      let n = 0;
      for (const it of json.items) {
        if (!it || typeof it !== 'object') continue;
        const tipo = it.tipo === 'escena' ? 'escena' : 'preset';
        const datos = tipo === 'escena' ? (it.datos || {}) : lim(migrateV1(it.datos || {}));
        const h = huellaDe(recorta(it.nombre, tipo), datos);
        if (huellas.has(h)) continue;
        this.añadir({ tipo, nombre: it.nombre, seccion: mapaSec[it.seccion] || this.asegurarSeccion(SEC_IMPORT), datos,
                      origen: it.origen || 'import', semilla: it.semilla || null, fav: it.fav }, { save: false });
        huellas.add(h); n++;
      }
      this.save(); return { tipo: 'biblioteca', n };
    }
    if (json.formato === 'subsdj-escena-v1') {
      const n = this.sembrar('import', SEC_ESCENAS, { [json.nombre || 'Escena importada']: json }, 'escena', { conSemilla: false });
      this.save(); return { tipo: 'escena', n };
    }
    const src = json.presets && typeof json.presets === 'object' ? json.presets : json;
    const mapa = {};
    for (const nombre in src) if (src[nombre] && typeof src[nombre] === 'object') mapa[nombre] = lim(src[nombre]);
    const n = this.sembrar('import', SEC_IMPORT, mapa, 'preset', { conSemilla: false });
    this.save(); return { tipo: 'banco', n };
  }
}

export const library = new Library();   // la del synth (localStorage); presetBank la carga
