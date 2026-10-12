/* SubSDJ · pantallas: Diseño / Secuenciación / Presets. Cada pestaña es un
   panel FIJO propio (<div class="screen" data-screen-body="…">): se enseña
   uno y se esconden los otros, sin reflujo — cada módulo tiene su sitio.
   Módulos COMPARTIDOS (data-slot="delay"…): Salida, Delay, Reverb y Cinta
   hacen falta en Diseño (efecto del preset) y en Secuenciación (sala de la
   escena). No se copian: cada pantalla declara su hueco (data-slot-host) y
   al cambiar de pestaña el MISMO nodo se mueve al hueco de la que se ve —
   controles, canvas y escuchadores intactos. Aquí también se marca la
   pestaña y se recuerda la elección. El motor y los LEDs no se enteran. */
export const SCREENS = ['diseno', 'secuenciacion', 'presets'];
const LS_KEY = 'subsdj.screen.v1';
let cur = null;

export function currentScreen() { return cur; }
export const screenBody = s => document.querySelector('.screen[data-screen-body="' + s + '"]');

export function showScreen(s) {
  if (!SCREENS.includes(s)) s = SCREENS[0];
  cur = s;
  document.body.dataset.screen = s;
  document.querySelectorAll('#screenTabs button').forEach(b => b.classList.toggle('active', b.dataset.screen === s));
  for (const b of document.querySelectorAll('.screen')) b.hidden = b.dataset.screenBody !== s;
  const body = screenBody(s);
  for (const m of document.querySelectorAll('[data-slot]')) {   // compartidos: al hueco de esta pantalla (si tiene)
    const host = body && body.querySelector('[data-slot-host="' + m.dataset.slot + '"]');
    if (host && m.parentElement !== host) host.appendChild(m);
  }
  try { localStorage.setItem(LS_KEY, s); } catch { /* sin persistencia */ }
  // Los canvas de una pantalla que estaba oculta medían 0: un resize los re-ajusta
  // (ADSR, seq, tabla, editor de ondas, osciloscopio).
  window.dispatchEvent(new Event('resize'));
  document.dispatchEvent(new CustomEvent('screen-changed', { detail: { screen: s } }));
}

export function initScreens() {
  const tabs = document.getElementById('screenTabs'); if (!tabs) return;
  tabs.addEventListener('click', e => {
    const b = e.target.closest('button[data-screen]'); if (!b) return;
    showScreen(b.dataset.screen); b.blur();   // sin foco: las teclas siguen siendo del piano
  });
  let saved = null;
  try { saved = localStorage.getItem(LS_KEY); } catch { /* sin persistencia */ }
  showScreen(saved);
}
