/* SubSDJ · output meter (Roadmap 7.0 · 1.3), in the Output module next to the
   oscilloscope: L/R peaks of what comes out (after the limiter), the limiter's gain
   reduction and an LED that stays lit if it has been working.
   The data is sent by the limiter itself (worklets/limiter-processor.js) every
   50 ms: maxima of the interval, no per-sample work on the main thread.
   It only paints when data arrives, using transform (no layout or CSS
   transitions), and the limiter goes quiet while the tab is hidden.
   The bars are LED ladders (SEGS segments, cut by a CSS mask): levels are rounded UP to
   whole segments, so a segment is lit or not, and the held peak is one segment that stays. */
import { part } from '../engine/parts.js';

const FLOOR_DB = -48;     // bottom of the bars' scale (dBFS)
const FALL_DB_S = 24;     // fall rate of the bars and of the hold (dB/s)
const HOLD_S = 1;         // peak hold
const GR_FULL_DB = 12;    // the reduction bar is full at 12 dB
const LED_DB = 0.1;       // reduction above which the limiter «has been working»
const SEGS = 24;          // segments of each ladder (css: --mt-segs): 2 dB each on the peaks, 0.5 dB on the reduction
const ZONES = [[SEGS - 1, 'hot'], [SEGS * 0.75, 'warn']];   // held segment's color, like the bar under it: top segment, from −12 dBFS

const dB = v => (v > 0 ? 20 * Math.log10(v) : -Infinity);
const frac = d => Math.max(0, Math.min(1, (d - FLOOR_DB) / -FLOOR_DB));
const seg = f => Math.ceil(f * SEGS - 1e-6);              // 0..1 → segments lit
let el, covers, marks, grBar, pkEl, led, comp = null;
let lvl = [-Infinity, -Infinity], hold = [-Infinity, -Infinity], holdT = [0, 0], gr = 0, lastT = 0, pkTxt = '';

// One reading from the limiter {l, r: output peaks; i: input peak; g: minimum gain}.
// `now` in seconds (the selftest passes its own).
export function feedMeter(d, now = performance.now() / 1000) {
  const dt = lastT ? Math.min(0.25, Math.max(0, now - lastT)) : 0; lastT = now;
  const fall = FALL_DB_S * dt;
  [d.l, d.r].forEach((v, c) => {
    const p = dB(v);
    lvl[c] = Math.max(p, lvl[c] - fall);
    if (p >= hold[c]) { hold[c] = p; holdT[c] = now; }
    else if (now - holdT[c] > HOLD_S) hold[c] = Math.max(p, hold[c] - fall);
    covers[c].style.transform = 'scaleY(' + (1 - seg(frac(lvl[c])) / SEGS).toFixed(4) + ')';
    const hs = seg(frac(hold[c])), z = (ZONES.find(([from]) => hs > from) || [0, ''])[1];   // hs = 0: below the bar, out of sight
    marks[c].style.transform = 'translateY(' + ((1 - hs / SEGS) * 100).toFixed(2) + '%)';
    if (marks[c].dataset.z !== z) marks[c].dataset.z = z;
  });
  const red = -dB(d.g);                                   // dB the limiter is taking off
  gr = Math.max(red, gr - fall);
  grBar.style.transform = 'scaleY(' + (seg(Math.min(1, gr / GR_FULL_DB)) / SEGS).toFixed(4) + ')';
  if (red > LED_DB) led.classList.add('on');
  const top = Math.max(hold[0], hold[1]);
  const t = top > FLOOR_DB ? (top > -0.05 ? '0.0' : top.toFixed(1)).replace('-', '−') : '−∞';
  if (t !== pkTxt) pkEl.textContent = pkTxt = t;
}
export const meterLedOn = () => led.classList.contains('on');

const post = m => { try { comp && comp.port.postMessage(m); } catch (_) {} };
// The Room (and its limiter) can change (Parts on/off): it is checked every half second.
function attach() {
  const c = part()?.room?.comp || null;
  if (c === comp) return;
  if (comp) { post('meter-off'); comp.port.onmessage = null; }
  comp = c;
  if (!comp) return;
  comp.port.onmessage = e => { if (el.offsetParent) feedMeter(e.data); };   // off screen (Presets): not painted
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
