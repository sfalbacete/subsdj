/* SubSDJ · status in the header: two symbols (audio and MIDI) without text. The
   state is told by color (a class) and explained in the tooltip:
     ''    off / no device (dimmed ink)
     wait  waiting for a user gesture (pulses slowly)
     on    active / connected (accent, with halo)
     err   error (red)
   Called by main.js (audio ready / error), keyboard.js (first note) and
   midi.js (devices connected). The icons live in index.html (SVG with
   currentColor) and the classes in style.css (#status .st). */
const STATES = ['wait', 'on', 'err'];

export function setStatus(id, state, title) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove(...STATES);
  if (state) el.classList.add(state);
  el.title = title;
}

export function isStatus(id, state) {
  const el = document.getElementById(id);
  return !!el && el.classList.contains(state);
}
