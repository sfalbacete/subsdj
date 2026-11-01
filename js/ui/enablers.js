/* SubSDJ · who turns it on. With the pointer on something DIMMED (ui/deps.js:
   it does nothing with the current settings), a tooltip says at once why, and
   the control(s) that would turn it on PULSE — a breathing ring in the theme's
   accent — for as long as the pointer stays; several triggers, all of them. One
   on another screen is not visible: the tab of its screen pulses instead and the
   tooltip says where. The rings are fixed overlays in the body, not styles on the
   controls: a dimmed section's opacity would fade them and a container's overflow
   would clip them (the screen tabs).
   The enablers come from the rules (deps.js, their third element), resolved for the
   current state in el._depBy. Their names are read from the DOM, the way the Output
   display reads a control (section · label), so there is no second table of names. */
import { depTargets } from './deps.js';
import { currentScreen } from './screens.js';

const PAD = 4;            // px between a control and its ring
const GAP = 16;           // px from the pointer to the tooltip

let tip = null, cur = null, rings = [], px = 0, py = 0;

const h2Text = h2 => (h2 ? [...h2.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() : '');
const sectionOf = el => h2Text(el.closest('.panel')?.querySelector('h2'));
// A control's name as a person reads it: its label (.lab, data-lab, the field label, aria-label, title)
function labelOf(el) {
  const ctl = el.closest('.ctl, .swc, .togc') || el;
  const lab = ctl.dataset.lab || ctl.querySelector(':scope > .lab, :scope > .fieldlab')?.textContent
    || el.getAttribute('aria-label') || el.getAttribute('title') || el.dataset.title0 || el.dataset.tip || el.textContent || '';
  return lab.trim().split(/[:(]/)[0].trim();   // «Modulation source», not the whole title
}
// the screen a control lives on (shared modules move between screens: wherever it is now)
const screenOf = el => el.closest('.screen')?.dataset.screenBody || null;
const tabOf = screen => document.querySelector('#screenTabs button[data-screen="' + screen + '"]');

function ring(el) {
  if (!el.matches('#screenTabs button')) el = el.closest('.ctl, .togc, .swc') || el;   // the whole control, with its label (a rotary's seg is only the dial)
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const d = document.createElement('div');
  d.className = 'dep-ring' + (el.matches('#screenTabs button, .seg.sw') ? ' pill' : '');
  d.style.left = (r.left - PAD) + 'px'; d.style.top = (r.top - PAD) + 'px';
  d.style.width = (r.width + 2 * PAD) + 'px'; d.style.height = (r.height + 2 * PAD) + 'px';
  document.body.appendChild(d);
  rings.push(d);
}
function clear() {
  for (const d of rings) d.remove();
  rings = [];
  if (tip) tip.hidden = true;
}

// The enablers of a dimmed element → [{el, name, screen}] (unique, not the element itself)
function enablersOf(el) {
  const out = [], seen = new Set();
  for (const t of el._depBy || []) {
    for (const e of depTargets(t)) {
      if (!e || seen.has(e) || e === el || el.contains(e)) continue;
      seen.add(e);
      out.push({ el: e, sec: sectionOf(e), name: labelOf(e), screen: screenOf(e) });
    }
  }
  return out;
}

function show(el) {
  clear();
  const here = currentScreen(), sec = sectionOf(el), en = enablersOf(el);
  const away = new Set();
  for (const x of en) {
    if (x.screen && x.screen !== here) away.add(x.screen);
    else if (x.el.offsetParent) ring(x.el);
  }
  for (const s of away) { const tab = tabOf(s); if (tab) ring(tab); }
  // the tooltip: why · what turns it on (names in the accent, like the rings) · its own title
  tip.textContent = '';
  const line = () => { const d = document.createElement('div'); tip.appendChild(d); return d; };
  const l1 = line(), b = document.createElement('b'); b.textContent = 'No effect'; l1.append(b, ' · ' + el.dataset.off);
  // the section goes before each name unless they all live in the dimmed one's («Amount»): with several,
  // «Mixer · Osc B» must not read as the oscillator
  const local = en.every(x => !x.sec || x.sec === sec);
  const names = [...new Set(en.map(x => (!local && x.sec ? x.sec + ' · ' : '') + x.name).filter(Boolean))];
  if (names.length) {
    const l2 = line(); l2.append('Turns on with ');
    names.forEach((n, i) => {
      if (i) l2.append(i === names.length - 1 ? ' or ' : ', ');
      const s = document.createElement('span'); s.className = 'en'; s.textContent = n; l2.append(s);
    });
    if (away.size) {
      l2.append(' · on the ');
      [...away].forEach((s, i) => { if (i) l2.append(' and '); const t = document.createElement('span'); t.className = 'en'; t.textContent = tabOf(s)?.textContent.trim() || s; l2.append(t); });
      l2.append(away.size > 1 ? ' screens' : ' screen');
    }
  }
  const own = (el.dataset.title0 || '').trim();
  if (own) { const l3 = line(); l3.className = 'own'; l3.textContent = own; }
  tip.hidden = false;
  const x = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, px - tip.offsetWidth / 2));
  const y = py + GAP + tip.offsetHeight > window.innerHeight - 8 ? py - GAP - tip.offsetHeight : py + GAP;
  tip.style.left = x + 'px'; tip.style.top = Math.max(8, y) + 'px';
}

export function initEnablers() {
  tip = document.createElement('div');
  tip.id = 'depTip'; tip.hidden = true; tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  document.addEventListener('pointerover', e => {
    px = e.clientX; py = e.clientY;
    const el = e.target.closest && !e.target.closest('.qmark, #depTip, #helpTip') ? e.target.closest('[data-off]') : null;   // the «?» has its own tooltip
    if (el === cur) return;
    cur = el;
    if (el) show(el); else clear();
  });
  document.addEventListener('pointerdown', () => { if (tip) tip.hidden = true; });   // the hand is on it: the rings stay, the text gets out of the way
  document.addEventListener('deps-changed', () => { if (cur && !cur.isConnected) { cur = null; clear(); } else if (cur && cur.dataset.off) { if (!tip.hidden) show(cur); } else if (cur) { cur = null; clear(); } });
  window.addEventListener('scroll', () => { cur = null; clear(); }, true);   // the rings are fixed: if the page scrolls, they would stay behind
  window.addEventListener('blur', () => { cur = null; clear(); });
  document.addEventListener('pointerleave', () => { cur = null; clear(); });
}
