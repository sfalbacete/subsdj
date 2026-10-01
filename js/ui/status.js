/* SubSDJ · estado en la cabecera: dos símbolos (audio y MIDI) sin texto. El
   estado se cuenta con el color (una clase) y se explica en el tooltip:
     ''    apagado / sin aparato (tinta apagada)
     wait  esperando un gesto del usuario (late despacio)
     on    activo / conectado (acento, con halo)
     err   error (rojo)
   Lo llaman main.js (audio listo / error), keyboard.js (primera nota) y
   midi.js (aparatos conectados). Los iconos viven en index.html (SVG con
   currentColor) y las clases en style.css (#status .st). */
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
