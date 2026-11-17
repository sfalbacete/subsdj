/* =====================================================================
   SubSDJ · a small QUESTION over the instrument (dimmed behind it), for the
   few gestures that throw work away with no undo: turning Parts off, a new
   scene (ui/partsControls.js).
     askConfirm({ title, text, buttons: [{ id, label, title? }] }) → Promise
   resolves the id of the button pressed, or null: Escape, a click outside
   and the LAST button (always the way back, and the one focused: Enter
   alone never discards anything). ← → and Tab move between the buttons.
   While it is up the keyboard plays no notes: its listener is registered
   when this module loads — before the keyboard's, which listens on window
   in capture too (the welcome window does the same: ui/splash.js).
   ===================================================================== */
import { uiZoom } from './frame.js';

let pending = null;   // { res, btns }
const el = () => document.getElementById('confirm');
export const confirmOpen = () => !!pending;

function close(id) {
  if (!pending) return;
  const { res } = pending; pending = null;
  el().hidden = true;
  res(id);
}

export function askConfirm({ title = '', text = '', buttons = [] } = {}) {
  const box = el();
  if (!box || pending || !buttons.length) return Promise.resolve(null);
  return new Promise(res => {
    box.querySelector('.cf-title').textContent = title;
    box.querySelector('.cf-text').textContent = text;
    const row = box.querySelector('.cf-btns'); row.innerHTML = '';
    const btns = buttons.map((b, i) => {
      const back = i === buttons.length - 1;
      const x = document.createElement('button');
      x.type = 'button'; x.className = 'btn'; x.textContent = b.label; x.dataset.id = b.id;
      if (b.title) x.title = b.title;
      x.addEventListener('click', () => close(back ? null : b.id));
      row.appendChild(x);
      return x;
    });
    pending = { res, btns };
    box.querySelector('.cf-card').style.zoom = uiZoom();   // at the instrument's scale
    box.hidden = false;
    btns[btns.length - 1].focus({ preventScroll: true });
  });
}

addEventListener('keydown', e => {
  if (!pending) return;
  const { btns } = pending, i = btns.indexOf(document.activeElement), n = btns.length;
  if (e.key === 'Escape') close(null);
  else if (e.key === 'Enter' || e.key === ' ') (btns[i] || btns[n - 1]).click();
  else if (e.key === 'Tab' || e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const d = e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey) ? -1 : 1;
    btns[((i < 0 ? n - 1 : i) + d + n) % n].focus({ preventScroll: true });
  }
  e.stopImmediatePropagation(); e.preventDefault();
}, true);
addEventListener('pointerdown', e => { if (pending && e.target === el()) close(null); }, true);
