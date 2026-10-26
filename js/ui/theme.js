/* SubSDJ · skin: tokens for the canvases + theme selector.

   TOKENS. The CSS is the ONLY source of color: here the variables of the
   token block (css/style.css) are only READ and served the way Canvas2D
   understands them (ADSR, oscilloscope and spectrum, Seq, WaveSeq, Wave Editor).
   The trick to normalize: assigning any CSS color to fillStyle and reading it back
   returns '#rrggbb' (or 'rgba(…)' if it has alpha), so a token can be
   written as hex, rgb(), hsl() or color-mix() without the canvases
   caring. Cached by name; cleared on theme change.

   THEMES. A theme is a `:root[data-theme="id"]` block in the stylesheet that
   redefines whatever tokens it wants and introduces itself with `--theme-name:"Name"`;
   the base `:root` block IS the default theme (it declares --theme-id and
   --theme-name). Here the stylesheets (document.styleSheets) are read to fill
   the <select>: adding a theme is adding a CSS block, without touching JS. The
   themes go on html (:root), not on body, because the composite faces
   (--seg-on, --thumb-face, keys…) resolve their var() where they are declared.
   `?theme=id` in the URL applies it without remembering it (screenshots, selftest); the
   selector remembers it (localStorage). On change: the cache is cleared,
   «theme-changed» is announced and «resize» is fired so the canvases
   redraw with the new tokens. */
const probe = document.createElement('canvas').getContext('2d');
const cache = new Map();
const LS_KEY = 'subsdj.theme.v1';

// A token that is a LIST of colors (gradient stops: "#02090a,#041d1c,…"): raw, split
export function tokenList(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).split(",").map(x => x.trim()).filter(Boolean); }
export function token(name) {            // '--accent' → '#39d4a3'
  let v = cache.get(name);
  if (v === undefined) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    probe.fillStyle = '#000'; probe.fillStyle = raw || '#000';   // an invalid value leaves the black
    v = probe.fillStyle; cache.set(name, v);
  }
  return v;
}

function rgb(name) {                     // [r, g, b] 0..255
  const c = token(name);
  if (c[0] === '#') return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  return (c.match(/[\d.]+/g) || ['0', '0', '0']).slice(0, 3).map(Number);
}

export function tint(name, alpha) {      // ('--accent', .14) → 'rgba(57,212,163,0.14)': grids, fills, halos
  return `rgba(${rgb(name).join(',')},${alpha})`;
}

export function hue(name) {              // hue 0..360 of the token (the spectrum is colored around the accent)
  const [r, g, b] = rgb(name).map(x => x / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

// ---------- themes ----------
const unq = s => (s || '').trim().replace(/^["']|["']$/g, '');   // --theme-name:"Classic" → Classic

export function listThemes() {           // [{id, name, base}] read from the stylesheets, in their order
  const out = [];
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }   // cross-origin stylesheet: unreadable, not ours
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

function fillSelect(sel, themes) {       // options from the stylesheets; rebuilt if the list changed (a theme added later also gets in)
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
  if (remember) try { localStorage.setItem(LS_KEY, t.id); } catch { /* no persistence */ }
  const sel = document.getElementById('themeSel'); if (sel) { fillSelect(sel, themes); sel.value = t.id; }
  document.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: t.id } }));
  window.dispatchEvent(new Event('resize'));   // the canvases redraw with the new tokens
}

export function initTheme() {
  const sel = document.getElementById('themeSel');
  if (sel) {
    fillSelect(sel, listThemes());
    sel.addEventListener('change', () => { setTheme(sel.value); sel.blur(); });   // no focus: the keys still belong to the piano
  }
  const fromUrl = new URLSearchParams(location.search).get('theme');
  let saved = null; try { saved = localStorage.getItem(LS_KEY); } catch { /* no persistence */ }
  setTheme(fromUrl || saved || '', { remember: false });   // '' → the base theme
}
