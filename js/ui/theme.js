/* SubSDJ · piel: tokens para los canvas + selector de tema.

   TOKENS. El CSS es la ÚNICA fuente de color: aquí solo se LEEN las variables
   del bloque de tokens (css/style.css) y se sirven como Canvas2D las
   entiende (ADSR, osciloscopio y espectro, Seq, WaveSeq, editor de ondas).
   El truco para normalizar: asignar cualquier color CSS a fillStyle y leerlo
   devuelve '#rrggbb' (o 'rgba(…)' si lleva alfa), así un token puede
   escribirse como hex, rgb(), hsl() o color-mix() sin que a los canvas les
   importe. Cache por nombre; se vacía al cambiar de tema.

   TEMAS. Un tema es un bloque `:root[data-theme="id"]` de la hoja que
   redefine los tokens que quiera y se presenta con `--theme-name:"Nombre"`;
   el bloque `:root` base ES el tema por defecto (declara --theme-id y
   --theme-name). Aquí se leen las hojas (document.styleSheets) para llenar
   el <select>: añadir un tema es añadir un bloque CSS, sin tocar JS. Los
   temas van en html (:root), no en body, porque las caras compuestas
   (--seg-on, --thumb-face, teclas…) resuelven sus var() donde se declaran.
   `?theme=id` en la URL lo aplica sin recordarlo (capturas, selftest); el
   selector lo recuerda (localStorage). Al cambiar: se vacía la caché, se
   avisa con «theme-changed» y se dispara «resize» para que los canvas se
   redibujen con los tokens nuevos. */
const probe = document.createElement('canvas').getContext('2d');
const cache = new Map();
const LS_KEY = 'subsdj.theme.v1';

export function token(name) {            // '--accent' → '#39d4a3'
  let v = cache.get(name);
  if (v === undefined) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    probe.fillStyle = '#000'; probe.fillStyle = raw || '#000';   // un valor inválido deja el negro
    v = probe.fillStyle; cache.set(name, v);
  }
  return v;
}

function rgb(name) {                     // [r, g, b] 0..255
  const c = token(name);
  if (c[0] === '#') return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  return (c.match(/[\d.]+/g) || ['0', '0', '0']).slice(0, 3).map(Number);
}

export function tint(name, alpha) {      // ('--accent', .14) → 'rgba(57,212,163,0.14)': rejillas, rellenos, halos
  return `rgba(${rgb(name).join(',')},${alpha})`;
}

export function hue(name) {              // tono 0..360 del token (el espectro se colorea alrededor del acento)
  const [r, g, b] = rgb(name).map(x => x / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

// ---------- temas ----------
const unq = s => (s || '').trim().replace(/^["']|["']$/g, '');   // --theme-name:"Clásico" → Clásico

export function listThemes() {           // [{id, name, base}] leídos de las hojas, en su orden
  const out = [];
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }   // hoja de otro origen: ilegible, no es nuestra
    for (const r of rules) {
      if (!r.selectorText) continue;
      const m = r.selectorText.match(/^:root\[data-theme="([^"]+)"\]$/);
      if (m) out.push({ id: m[1], name: unq(r.style.getPropertyValue('--theme-name')) || m[1], base: false });
      else if (r.selectorText === ':root' && r.style.getPropertyValue('--theme-id'))
        out.push({ id: unq(r.style.getPropertyValue('--theme-id')), name: unq(r.style.getPropertyValue('--theme-name')), base: true });
    }
  }
  return out;
}

export function currentTheme() {
  return document.documentElement.dataset.theme || (listThemes().find(t => t.base) || { id: '' }).id;
}

function fillSelect(sel, themes) {       // opciones desde las hojas; se rehacen si la lista cambió (un tema añadido después también entra)
  const ids = themes.map(t => t.id).join('|');
  if (sel.dataset.ids === ids) return;
  sel.innerHTML = '';
  for (const t of themes) sel.appendChild(new Option(t.name, t.id));
  sel.dataset.ids = ids;
}

export function setTheme(id, { remember = true } = {}) {
  const themes = listThemes(), t = themes.find(x => x.id === id) || themes.find(x => x.base);
  if (!t) return;
  if (t.base) delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t.id;
  cache.clear();
  if (remember) try { localStorage.setItem(LS_KEY, t.id); } catch { /* sin persistencia */ }
  const sel = document.getElementById('themeSel'); if (sel) { fillSelect(sel, themes); sel.value = t.id; }
  document.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: t.id } }));
  window.dispatchEvent(new Event('resize'));   // los canvas se redibujan con los tokens nuevos
}

export function initTheme() {
  const sel = document.getElementById('themeSel');
  if (sel) {
    fillSelect(sel, listThemes());
    sel.addEventListener('change', () => { setTheme(sel.value); sel.blur(); });   // sin foco: las teclas siguen siendo del piano
  }
  const fromUrl = new URLSearchParams(location.search).get('theme');
  let saved = null; try { saved = localStorage.getItem(LS_KEY); } catch { /* sin persistencia */ }
  setTheme(fromUrl || saved || '', { remember: false });   // '' → el tema base
}
