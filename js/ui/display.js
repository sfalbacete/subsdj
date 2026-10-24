/* SubSDJ · pantalla «Salida» y cabecera.
   PANTALLA: el display multiplexado del hardware. Enseña en grande el último
   parámetro que TOCAS (ratón, o un mando MIDI vía 'ctl-touch' de midimap) con
   su valor ya formateado. Todo se lee del propio control — su etiqueta (.lab
   o data-lab), su .val, el botón activo de un seg, la opción de un select — y
   la sección del h2 de su panel: no hay una segunda tabla de nombres que
   mantener. Si lo tocado está APAGADO (ui/deps.js), arriba a la derecha sale por qué; si no, qué significa la opción elegida. Lo que no viene de un gesto (cargar un preset, cambiar de parte)
   no la ensucia: entonces enseña el nombre del preset.
   CABECERA: el menú «Archivo ▾» (Borrar, Exportar, Importar, SFZ: los mismos
   botones con sus id, solo que plegados) y #presetMsg como aviso flotante
   (ya no tiene sitio fijo en la fila). */
const $ = id => document.getElementById(id);
const TOUCH_MS = 2500;   // tras un gesto, los cambios que lleguen en este margen son «del gesto» (un <select> cambia al soltar)
// Ajuste a la caja: el valor encoge de VAL_PX hasta MIN_PX (la letra es monoespaciada:
// el ancho es proporcional al tamaño, basta una regla de tres); si ni así cabe, se
// desplaza ida y vuelta a SCROLL_PXS px/s con una pausa en cada extremo (CSS .scroll).
const VAL_PX = 24, MIN_PX = 13, SIDE_PX = 10, SCROLL_PXS = 35;

function fit(box, max, min) {
  const t = box && box.firstElementChild;
  if (!t) return;
  box.classList.remove('scroll'); box.style.fontSize = max + 'px';
  const w = box.clientWidth;
  if (!w) return;                                    // oculta (otra pantalla): se ajusta al verse (ResizeObserver)
  if (t.offsetWidth > w && min < max) box.style.fontSize = Math.max(min, Math.floor(max * w / t.offsetWidth)) + 'px';
  const over = t.offsetWidth - w;
  if (over > 0) {
    box.style.setProperty('--dx', -over + 'px');
    box.style.setProperty('--t', (1.5 + over / SCROLL_PXS).toFixed(1) + 's');
    box.classList.add('scroll');
  }
}

// Opción de un seg → {val, det}: el valor CORTO (el rótulo del botón, con su leyenda
// data-cap si la tiene: «3 · 2·3·4→1»; un botón con icono no tiene rótulo y su
// nombre es el title) y, aparte, lo que significa (el resto del title, sin repetir
// el rótulo: «Legato: la nota…» → «la nota…»). El title entero no cabe como valor.
function segValue(b) {
  const txt = b.textContent.trim(), tit = (b.title || '').trim(), cap = b.dataset.cap || '';
  if (!txt) { const i = tit.indexOf(':'); return i > 0 ? { val: tit.slice(0, i), det: tit.slice(i + 1).trim() } : { val: tit, det: '' }; }
  const det = tit.toLowerCase().startsWith(txt.toLowerCase() + ':') ? tit.slice(txt.length + 1).trim() : tit;
  return { val: cap ? txt + ' · ' + cap : txt, det };
}

const textOf = h2 => [...(h2?.childNodes || [])].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();   // sin LED ni «?»

// Control tocado → {who, val} leídos del DOM.
function describe(el) {
  const panel = el.closest('.panel');
  if (!panel) return null;
  const sec = textOf(panel.querySelector('h2'));
  const row = el.closest('[data-name]');                                  // fila de un banco (LFO PWM…)
  const lab = el.dataset.lab || el.querySelector(':scope > .lab, .head .lab')?.textContent
           || el.parentElement?.querySelector(':scope > .lab, :scope > .fieldlab')?.textContent || el.title || '';   // .fieldlab: conmutadores con LED (voz, disparo)
  let val = '', det = '';
  if (el.matches('.seg')) { const b = el.querySelector('button.active'); if (b) ({ val, det } = segValue(b)); }
  else if (el.matches('select')) val = el.selectedOptions[0]?.textContent || '';
  else if (el.matches('.lfoShape')) val = el.textContent;
  else val = el.querySelector('.val')?.textContent || '';
  const who = [row ? sec + ' ' + row.dataset.name : sec, lab].filter(Boolean).join(' · ');
  const off = el.closest('[data-off]');   // apagado (ui/deps.js): el control o su sección no hacen nada ahora
  return { who, val: val.trim(), det, why: off ? 'sin efecto: ' + off.dataset.off : '' };
}

export function initDisplay() {
  const who = $('dispWho'), val = $('dispVal'), side = $('dispWhy');
  const refit = () => { fit(val, VAL_PX, MIN_PX); fit(side, SIDE_PX, SIDE_PX); };
  // la línea de arriba a la derecha: por qué no hace nada (manda) o qué significa la opción
  const show = (w, v, y = '', det = '') => {
    if (who) who.textContent = w;
    if (val) val.firstElementChild.textContent = v;
    if (side) { side.firstElementChild.textContent = y || det; side.classList.toggle('off', !!y); }
    refit();
  };
  const ro = document.querySelector('.readout');
  if (ro && window.ResizeObserver) new ResizeObserver(refit).observe(ro);   // cambio de pantalla o de zoom
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
    if (d) show(d.who, d.val, d.why, d.det);
  };
  const later = () => { if (!pending) { pending = true; requestAnimationFrame(render); } };
  document.addEventListener('param-change', () => { if (touched && performance.now() < until) later(); });
  document.addEventListener('ctl-touch', later);
  document.addEventListener('deps-changed', () => { if (touched && performance.now() < until) later(); });   // el motivo de apagado puede cambiar al tocar
  document.addEventListener('preset-loaded', e => { touched = null; show('Preset', e.detail?.name || ''); });
  // un mensaje de otro módulo (deshacer / rehacer: qué se ha deshecho)
  document.addEventListener('display-show', e => { touched = null; show(e.detail.who || '', e.detail.val || '', '', e.detail.det || ''); });
  // nota tocada con el ratón en el teclado de pantalla: su velocity (sale de la altura de la pulsación)
  document.addEventListener('kb-note', e => { touched = null; show('Teclado · ' + e.detail.name, 'vel ' + e.detail.vel.toFixed(2), '', 'arriba de la tecla = suave · abajo = fuerte'); });
  show('Preset', $('presetPickName')?.textContent || '—');

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
