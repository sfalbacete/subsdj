/* SubSDJ · «Output» display and header.
   DISPLAY: the multiplexed display of the hardware. It shows large the last
   parameter you TOUCH (mouse, or a MIDI controller via midimap's 'ctl-touch') with
   its value already formatted. Everything is read from the control itself — its label (.lab
   or data-lab), its .val, the active button of a seg, the option of a select — and
   the section from its panel's h2: there is no second table of names to
   maintain. If the touched control is OFF (ui/deps.js), the top right says why; otherwise,
   what the chosen option means. What doesn't come from a gesture (loading a preset, changing part)
   doesn't clutter it: then it shows the preset name.
   HEADER: the «File ▾» menu (Delete, Export, Import, SFZ: the same
   buttons with their ids, just folded away) and #presetMsg as a floating notice
   (it no longer has a fixed spot in the row). */
const $ = id => document.getElementById(id);
const TOUCH_MS = 2500;   // after a gesture, changes arriving within this margin are «from the gesture» (a <select> changes on release)
// Fitting to the box: the value shrinks from VAL_PX down to MIN_PX (the font is monospaced:
// the width is proportional to the size, a rule of three is enough); if it still doesn't fit, it
// scrolls back and forth at SCROLL_PXS px/s with a pause at each end (CSS .scroll).
const VAL_PX = 24, MIN_PX = 13, SIDE_PX = 10, SCROLL_PXS = 35;

function fit(box, max, min) {
  const t = box && box.firstElementChild;
  if (!t) return;
  box.classList.remove('scroll'); box.style.fontSize = max + 'px';
  const w = box.clientWidth;
  if (!w) return;                                    // hidden (another screen): fitted when it shows (ResizeObserver)
  if (t.offsetWidth > w && min < max) box.style.fontSize = Math.max(min, Math.floor(max * w / t.offsetWidth)) + 'px';
  const over = t.offsetWidth - w;
  if (over > 0) {
    box.style.setProperty('--dx', -over + 'px');
    box.style.setProperty('--t', (1.5 + over / SCROLL_PXS).toFixed(1) + 's');
    box.classList.add('scroll');
  }
}

// Option of a seg → {val, det}: the SHORT value (the button's label, with its data-cap
// caption if it has one: «3 · 2·3·4→1»; an icon button has no label and its
// name is the title) and, separately, what it means (the rest of the title, without repeating
// the label: «Legato: the note…» → «the note…»). The whole title doesn't fit as a value.
function segValue(b) {
  const txt = b.textContent.trim(), tit = (b.title || '').trim(), cap = b.dataset.cap || '';
  if (!txt) { const i = tit.indexOf(':'); return i > 0 ? { val: tit.slice(0, i), det: tit.slice(i + 1).trim() } : { val: tit, det: '' }; }
  const det = tit.toLowerCase().startsWith(txt.toLowerCase() + ':') ? tit.slice(txt.length + 1).trim() : tit;
  return { val: cap ? txt + ' · ' + cap : txt, det };
}

const textOf = h2 => [...(h2?.childNodes || [])].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();   // without LED or «?»

// Touched control → {who, val} read from the DOM.
function describe(el) {
  const panel = el.closest('.panel');
  if (!panel) return null;
  const sec = textOf(panel.querySelector('h2'));
  const row = el.closest('[data-name]');                                  // row of a bank (LFO PWM…)
  const lab = el.dataset.lab || el.querySelector(':scope > .lab, .head .lab')?.textContent
           || el.parentElement?.querySelector(':scope > .lab, :scope > .fieldlab')?.textContent || el.title || '';   // .fieldlab: switches with LED (voice, trigger)
  let val = '', det = '';
  if (el.matches('.seg')) { const b = el.querySelector('button.active'); if (b) ({ val, det } = segValue(b)); }
  else if (el.matches('select')) val = el.selectedOptions[0]?.textContent || '';
  else if (el.matches('.lfoShape')) val = el.textContent;
  else val = el.querySelector('.val')?.textContent || '';
  const who = [row ? sec + ' ' + row.dataset.name : sec, lab].filter(Boolean).join(' · ');
  const off = el.closest('[data-off]');   // off (ui/deps.js): the control or its section does nothing right now
  return { who, val: val.trim(), det, why: off ? 'no effect: ' + off.dataset.off : '' };
}

export function initDisplay() {
  const who = $('dispWho'), val = $('dispVal'), side = $('dispWhy');
  const refit = () => { fit(val, VAL_PX, MIN_PX); fit(side, SIDE_PX, SIDE_PX); };
  // the top-right line: why it does nothing (takes precedence) or what the option means
  const show = (w, v, y = '', det = '') => {
    if (who) who.textContent = w;
    if (val) val.firstElementChild.textContent = v;
    if (side) { side.firstElementChild.textContent = y || det; side.classList.toggle('off', !!y); }
    refit();
  };
  const ro = document.querySelector('.readout');
  if (ro && window.ResizeObserver) new ResizeObserver(refit).observe(ro);   // screen or zoom change
  let touched = null, until = 0, pointer = false, pending = false;

  const CTL = '.ctl, .slider, .seg, select, .lfoShape';
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest(CTL);
    if (el && el.closest('.panel')) { touched = el.matches('.knob') ? el.parentElement : el; pointer = true; until = Infinity; }
  }, true);
  document.addEventListener('pointerup', () => { if (pointer) { pointer = false; until = performance.now() + TOUCH_MS; } }, true);
  document.addEventListener('ctl-touch', e => { touched = e.detail.el; until = performance.now() + TOUCH_MS; });   // MIDI controller
  const render = () => {
    pending = false;
    const d = touched && describe(touched.matches(CTL) ? touched : touched.closest(CTL) || touched);
    if (d) show(d.who, d.val, d.why, d.det);
  };
  const later = () => { if (!pending) { pending = true; requestAnimationFrame(render); } };
  document.addEventListener('param-change', () => { if (touched && performance.now() < until) later(); });
  document.addEventListener('ctl-touch', later);
  document.addEventListener('deps-changed', () => { if (touched && performance.now() < until) later(); });   // the reason for being off can change on touch
  document.addEventListener('preset-loaded', e => { touched = null; show('Preset', e.detail?.name || ''); });
  // a message from another module (undo / redo: what was undone)
  document.addEventListener('display-show', e => { touched = null; show(e.detail.who || '', e.detail.val || '', '', e.detail.det || ''); });
  // note played with the mouse on the on-screen keyboard: its velocity (comes from the height of the press)
  document.addEventListener('kb-note', e => { touched = null; show('Keyboard · ' + e.detail.name, 'vel ' + e.detail.vel.toFixed(2), '', 'top of the key = soft · bottom = hard'); });
  show('Preset', $('presetPickName')?.textContent || '—');

  // File menu: opens with its button and closes on choosing or clicking outside
  const fb = $('fileBtn'), fm = $('fileMenu');
  if (fb && fm) {
    fb.addEventListener('click', e => { e.stopPropagation(); fm.hidden = !fm.hidden; fb.classList.toggle('on', !fm.hidden); fb.blur(); });
    document.addEventListener('click', e => { if (!fm.hidden && !e.target.closest('#fileMenu input')) { fm.hidden = true; fb.classList.remove('on'); } });
  }

  // #presetMsg as a notice: appears when its text changes and fades out by itself
  const msg = $('presetMsg');
  if (msg) {
    let t = null;
    new MutationObserver(() => {
      msg.classList.toggle('show', !!msg.textContent.trim());
      clearTimeout(t); t = setTimeout(() => msg.classList.remove('show'), 4000);
    }).observe(msg, { childList: true, characterData: true, subtree: true });
  }
}
