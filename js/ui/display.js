/* SubSDJ · pantalla «Salida» y cabecera.
   PANTALLA: el display multiplexado del hardware. Enseña en grande el último
   parámetro que TOCAS (ratón, o un mando MIDI vía 'ctl-touch' de midimap) con
   su valor ya formateado. Todo se lee del propio control — su etiqueta (.lab
   o data-lab), su .val, el botón activo de un seg, la opción de un select — y
   la sección del h2 de su panel: no hay una segunda tabla de nombres que
   mantener. Si lo tocado está APAGADO (ui/deps.js), debajo sale por qué. Lo que no viene de un gesto (cargar un preset, cambiar de parte)
   no la ensucia: entonces enseña el nombre del preset.
   CABECERA: el menú «Archivo ▾» (Borrar, Exportar, Importar, SFZ: los mismos
   botones con sus id, solo que plegados) y #presetMsg como aviso flotante
   (ya no tiene sitio fijo en la fila). */
const $ = id => document.getElementById(id);
const TOUCH_MS = 2500;   // tras un gesto, los cambios que lleguen en este margen son «del gesto» (un <select> cambia al soltar)

const textOf = h2 => [...(h2?.childNodes || [])].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();   // sin LED ni «?»

// Control tocado → {who, val} leídos del DOM.
function describe(el) {
  const panel = el.closest('.panel');
  if (!panel) return null;
  const sec = textOf(panel.querySelector('h2'));
  const row = el.closest('[data-name]');                                  // fila de un banco (LFO PWM…)
  const lab = el.dataset.lab || el.querySelector(':scope > .lab, .head .lab')?.textContent
           || el.parentElement?.querySelector(':scope > .lab')?.textContent || el.title || '';
  let val = '';
  if (el.matches('.seg')) { const b = el.querySelector('button.active'); val = b ? (b.title || b.textContent) : ''; }
  else if (el.matches('select')) val = el.selectedOptions[0]?.textContent || '';
  else if (el.matches('.lfoShape')) val = el.textContent;
  else val = el.querySelector('.val')?.textContent || '';
  const who = [row ? sec + ' ' + row.dataset.name : sec, lab].filter(Boolean).join(' · ');
  const off = el.closest('[data-off]');   // apagado (ui/deps.js): el control o su sección no hacen nada ahora
  return { who, val: val.trim(), why: off ? 'sin efecto: ' + off.dataset.off : '' };
}

export function initDisplay() {
  const who = $('dispWho'), val = $('dispVal'), why = $('dispWhy');
  const show = (w, v, y = '') => { if (who) who.textContent = w; if (val) val.textContent = v; if (why) why.textContent = y; };
  let touched = null, until = 0, pointer = false, pending = false;

  const CTL = '.ctl, .slider, .seg, select, .lfoShape';
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest(CTL);
    if (el && el.closest('.panel')) { touched = el.matches('.knob') ? el.parentElement : el; pointer = true; until = Infinity; }
  }, true);
  document.addEventListener('pointerup', () => { if (pointer) { pointer = false; until = performance.now() + TOUCH_MS; } }, true);
  document.addEventListener('ctl-touch', e => { touched = e.detail.el; until = performance.now() + TOUCH_MS; });   // mando MIDI
  const render = () => {
    pending = false;
    const d = touched && describe(touched.matches(CTL) ? touched : touched.closest(CTL) || touched);
    if (d) show(d.who, d.val, d.why);
  };
  const later = () => { if (!pending) { pending = true; requestAnimationFrame(render); } };
  document.addEventListener('param-change', () => { if (touched && performance.now() < until) later(); });
  document.addEventListener('ctl-touch', later);
  document.addEventListener('deps-changed', () => { if (touched && performance.now() < until) later(); });   // el motivo de apagado puede cambiar al tocar
  document.addEventListener('preset-loaded', e => { touched = null; show('Preset', e.detail?.name || ''); });
  show('Preset', $('presetSelect')?.selectedOptions[0]?.textContent || '—');

  // Menú Archivo: se abre con su botón y se cierra al elegir o al pulsar fuera
  const fb = $('fileBtn'), fm = $('fileMenu');
  if (fb && fm) {
    fb.addEventListener('click', e => { e.stopPropagation(); fm.hidden = !fm.hidden; fb.classList.toggle('on', !fm.hidden); fb.blur(); });
    document.addEventListener('click', e => { if (!fm.hidden && !e.target.closest('#fileMenu input')) { fm.hidden = true; fb.classList.remove('on'); } });
  }

  // #presetMsg como aviso: aparece al cambiar su texto y se apaga solo
  const msg = $('presetMsg');
  if (msg) {
    let t = null;
    new MutationObserver(() => {
      msg.classList.toggle('show', !!msg.textContent.trim());
      clearTimeout(t); t = setTimeout(() => msg.classList.remove('show'), 4000);
    }).observe(msg, { childList: true, characterData: true, subtree: true });
  }
}
