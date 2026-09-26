/* SubSDJ · pantallas (13a): tres vistas por función sobre el MISMO rack.
   Cada módulo declara en qué pestañas vive (data-screens="diseno
   secuenciacion presets") y el CSS oculta el resto: son FILTROS, no copias
   (un módulo puede estar en varias: Delay y Reverb son efecto del preset en
   Diseño y sala compartida en Secuenciación). Aquí solo se pone
   body[data-screen], se marca la pestaña activa y se recuerda la elección.
   El motor, los LEDs y el plegado no se enteran. */
export const SCREENS = ['diseno', 'secuenciacion', 'presets'];
const LS_KEY = 'subsdj.screen.v1';
let cur = null;

export function currentScreen() { return cur; }

export function showScreen(s) {
  if (!SCREENS.includes(s)) s = SCREENS[0];
  cur = s;
  document.body.dataset.screen = s;
  document.querySelectorAll('#screenTabs button').forEach(b => b.classList.toggle('active', b.dataset.screen === s));
  try { localStorage.setItem(LS_KEY, s); } catch { /* sin persistencia */ }
  // Los canvas de un módulo que estaba oculto medían 0: como al desplegar un
  // panel, un resize los re-ajusta (scope, espectro, ADSR, seq, tabla, editor).
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
