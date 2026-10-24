/* SubSDJ · medidor de salida (Roadmap 7.0 · 1.3), en el módulo Salida junto al
   osciloscopio: picos L/R de lo que sale (después del limitador), la reducción
   de ganancia del limitador y un LED que se queda encendido si ha trabajado.
   Los datos los manda el propio limitador (worklets/limiter-processor.js) cada
   50 ms: máximos del intervalo, sin trabajo por muestra en el hilo principal.
   Se pinta solo al llegar un dato, con transform (sin layout ni transiciones
   CSS), y el limitador calla con la pestaña oculta. */
import { part } from '../engine/parts.js';

const FLOOR_DB = -48;     // fondo de escala de las barras (dBFS)
const FALL_DB_S = 24;     // caída de las barras y de la retención (dB/s)
const HOLD_S = 1;         // retención del pico
const GR_FULL_DB = 12;    // la barra de reducción llega a tope con 12 dB
const LED_DB = 0.1;       // reducción a partir de la cual el limitador «ha trabajado»

const dB = v => (v > 0 ? 20 * Math.log10(v) : -Infinity);
const frac = d => Math.max(0, Math.min(1, (d - FLOOR_DB) / -FLOOR_DB));
let el, covers, marks, grBar, pkEl, led, comp = null;
let lvl = [-Infinity, -Infinity], hold = [-Infinity, -Infinity], holdT = [0, 0], gr = 0, lastT = 0, pkTxt = '';

// Un dato del limitador {l, r: picos de salida; i: pico de entrada; g: ganancia mínima}.
// `now` en segundos (el selftest le pasa el suyo).
export function feedMeter(d, now = performance.now() / 1000) {
  const dt = lastT ? Math.min(0.25, Math.max(0, now - lastT)) : 0; lastT = now;
  const fall = FALL_DB_S * dt;
  [d.l, d.r].forEach((v, c) => {
    const p = dB(v);
    lvl[c] = Math.max(p, lvl[c] - fall);
    if (p >= hold[c]) { hold[c] = p; holdT[c] = now; }
    else if (now - holdT[c] > HOLD_S) hold[c] = Math.max(p, hold[c] - fall);
    covers[c].style.transform = 'scaleY(' + (1 - frac(lvl[c])).toFixed(4) + ')';
    marks[c].style.transform = 'translateY(' + ((1 - frac(hold[c])) * 100).toFixed(2) + '%)';
  });
  const red = -dB(d.g);                                   // dB que está quitando el limitador
  gr = Math.max(red, gr - fall);
  grBar.style.transform = 'scaleY(' + Math.min(1, gr / GR_FULL_DB).toFixed(4) + ')';
  if (red > LED_DB) led.classList.add('on');
  const top = Math.max(hold[0], hold[1]);
  const t = top > FLOOR_DB ? (top > -0.05 ? '0.0' : top.toFixed(1)).replace('-', '−') : '−∞';
  if (t !== pkTxt) pkEl.textContent = pkTxt = t;
}
export const meterLedOn = () => led.classList.contains('on');

const post = m => { try { comp && comp.port.postMessage(m); } catch (_) {} };
// La Sala (y su limitador) puede cambiar (Partes on/off): se comprueba cada medio segundo.
function attach() {
  const c = part()?.sala?.comp || null;
  if (c === comp) return;
  if (comp) { post('meter-off'); comp.port.onmessage = null; }
  comp = c;
  if (!comp) return;
  comp.port.onmessage = e => { if (el.offsetParent) feedMeter(e.data); };   // fuera de pantalla (Presets): no se pinta
  if (!document.hidden) post('meter-on');
}

export function initMeter() {
  el = document.getElementById('meter'); if (!el) return;
  covers = [...el.querySelectorAll('.mt-ch i')]; marks = [...el.querySelectorAll('.mt-ch b')];
  grBar = el.querySelector('.mt-gr i'); pkEl = document.getElementById('mtPk'); led = document.getElementById('mtLed');
  led.addEventListener('click', () => { led.classList.remove('on'); hold = [-Infinity, -Infinity]; });
  document.addEventListener('visibilitychange', () => post(document.hidden ? 'meter-off' : 'meter-on'));
  attach(); setInterval(attach, 500);
}
