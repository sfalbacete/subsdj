/* SubSDJ · screens: Design / Sequencing / Presets. Each tab is its own
   FIXED panel (<div class="screen" data-screen-body="…">): one is shown
   and the others hidden, with no reflow — every module has its place.
   SHARED modules (data-slot="delay"…): Output, Delay, Reverb and Tape
   are needed in Design (preset effect) and in Sequencing (the scene's
   Room). They are not copied: each screen declares its slot (data-slot-host) and
   on tab change the SAME node is moved into the slot of the visible one —
   controls, canvases and listeners intact. Here the tab is also marked
   and the choice remembered. The engine and the LEDs never notice. */
export const SCREENS = ['design', 'sequencing', 'presets'];
const SCREENS_ES = { diseno: 'design', secuenciacion: 'sequencing' };   // remembered up to 1.3.0
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
  for (const m of document.querySelectorAll('[data-slot]')) {   // shared: into this screen's slot (if it has one)
    const host = body && body.querySelector('[data-slot-host="' + m.dataset.slot + '"]');
    if (host && m.parentElement !== host) host.appendChild(m);
  }
  try { localStorage.setItem(LS_KEY, s); } catch { /* no persistence */ }
  // The canvases of a screen that was hidden measured 0: a resize re-fits them
  // (ADSR, seq, wavetable, Wave Editor, oscilloscope).
  window.dispatchEvent(new Event('resize'));
  document.dispatchEvent(new CustomEvent('screen-changed', { detail: { screen: s } }));
}

export function initScreens() {
  const tabs = document.getElementById('screenTabs'); if (!tabs) return;
  tabs.addEventListener('click', e => {
    const b = e.target.closest('button[data-screen]'); if (!b) return;
    showScreen(b.dataset.screen); b.blur();   // no focus: the keys still belong to the piano
  });
  let saved = null;
  try { saved = localStorage.getItem(LS_KEY); } catch { /* no persistence */ }
  showScreen(SCREENS_ES[saved] || saved);
}
