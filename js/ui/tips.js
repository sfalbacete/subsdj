/* SubSDJ · ONE tooltip for everything that carries a title (2026-11-12). The browser's own takes about a
   second, can't be styled and looked nothing like the modules' «?» or the dimmed controls' one; this
   one is the same glass as those two, with the same reading: the text before the first «: », « (» or
   « · » is the NAME (in ink), the rest the detail.
   The title attribute stays the source everywhere — whoever writes .title (Save, Undo, Compare, the
   reason ui/deps.js gives, the status icons, the library rows…) keeps doing it — and it is moved to
   data-tip so the browser's never shows as well:
   - the ICONS (FAST: the header's, the clock, the icons in a module's title) for good, as soon as the
     title appears: an icon's tooltip is its only label, so it shows AT ONCE;
   - everything else only WHILE HOVERED (and its ancestors with a title too: the browser would show the
     nearest one), and the title goes back on leaving: the code that READS titles (the Output display,
     undo's labels, the dimmed tooltip) finds them where they always were — and, hovered, in data-tip
     (tipOf). It shows after DELAY, so crossing the panel does not flash a trail of them.
   A dimmed control ([data-off]) keeps its own tooltip (ui/enablers.js): this one stays out of it. */
const FAST = 'header .hico, header .clk, header #status .st, .panel h2 .h2tog.ico';
const OWN = '.qmark, #hdrTip, #depTip, #helpTip';                // they have, or are, a tooltip of their own
const GAP = 8;                                                   // px between the element and the tooltip
const DELAY = 380;                                               // ms before a non-icon tooltip shows

let tip = null, over = null, timer = 0, down = false;
let swapped = [];                                                // elements whose title is in data-tip only while hovered

// A control's title wherever it is right now (hovered, it lives in data-tip)
export const tipOf = el => (el ? el.getAttribute('title') ?? el.dataset.tip ?? '' : '');

function adopt(el) {
  if (!el.matches) return;
  const t = el.getAttribute('title');
  if (t === null) return;
  if (el.matches(FAST)) { el.dataset.tip = t; el.removeAttribute('title'); if (el === over) show(el); return; }
  if (swapped.includes(el)) { el.dataset.tip = t; el.removeAttribute('title'); if (el === over && !tip.hidden) show(el); }   // written while hovered (Lock, a library row…)
}
function swap(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (!n.hasAttribute('title') || n.matches(FAST)) continue;
    n.dataset.tip = n.getAttribute('title'); n.removeAttribute('title'); swapped.push(n);
  }
}
function restore() {
  const list = swapped; swapped = [];
  for (const n of list) if (n.dataset.tip !== undefined && !n.hasAttribute('title')) { n.setAttribute('title', n.dataset.tip); delete n.dataset.tip; }
}

function show(el) {
  const text = el.dataset.tip || '';
  if (!text) { hide(); return; }
  const m = /: | \(| · |\n/.exec(text), head = m ? text.slice(0, m.index) : text, rest = m ? text.slice(m.index) : '';
  tip.textContent = '';
  const b = document.createElement('b'); b.textContent = head;
  tip.append(b, rest);
  tip.hidden = false;
  const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  const below = r.bottom + GAP;                                  // under the element; over it when there is no room under
  tip.style.top = (below + h > window.innerHeight - 8 && r.top - GAP - h > 8 ? r.top - GAP - h : below) + 'px';
}
function hide() { clearTimeout(timer); if (tip) tip.hidden = true; }
function leave() { over = null; hide(); restore(); }

export function initTips() {
  tip = document.createElement('div');
  tip.id = 'hdrTip'; tip.hidden = true; tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  document.querySelectorAll(FAST).forEach(adopt);
  new MutationObserver(ms => { for (const m of ms) adopt(m.target); })
    .observe(document.body, { attributes: true, attributeFilter: ['title'], subtree: true });
  document.addEventListener('pointerover', e => {
    let el = e.target.closest && !e.target.closest(OWN) ? e.target.closest('[title], [data-tip]') : null;
    if (el && el.closest('[data-off]')) el = null;               // dimmed: ui/enablers.js's tooltip says why
    if (el === over) return;
    const was = !tip.hidden;
    hide(); restore();
    over = el;
    if (!el) return;
    swap(el);
    if (down) return;                                            // mid-drag (a knob crossing its neighbours): nothing shows
    if (el.matches(FAST) || was) show(el);                       // an icon, or sliding from one tooltip to the next: at once
    else timer = setTimeout(() => { if (over === el && !down) show(el); }, DELAY);
  });
  // pressing hides it (a click changes the state; the next hover shows the new text) and so does a drag
  document.addEventListener('pointerdown', () => { down = true; hide(); }, true);
  for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, () => { down = false; }, true);
  // leaving ANY element that holds the hovered one (pointerleave does not bubble: capture sees every one of them) —
  // the header, a module, the window itself
  document.addEventListener('pointerleave', e => { if (over && e.target.contains && e.target.contains(over)) leave(); }, true);
  window.addEventListener('blur', leave);
  window.addEventListener('scroll', () => hide(), true);
}
