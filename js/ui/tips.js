/* SubSDJ · fast tooltip for the header's ICONS and clock. A button that is only an
   icon has its tooltip as its only label, and the browser's (title) takes about a second
   and can't be styled. Here it shows AT ONCE, in the same well as the modules' «?».
   The title stays the source: the code that writes .title (Save, Undo, Compare, the
   reason ui/deps.js gives, the audio / MIDI status…) keeps doing it, and an observer
   moves it to data-tip as soon as it appears, so the browser's never shows up as
   well. The text before the first «: », « (» or « · » is the name (in ink); the rest, the detail. */
const SEL = 'header .hico, header .clk, header #status .st';   // the picker, tabs and menus keep the browser's
const GAP = 8;                                                   // px between the element and the tooltip

let tip = null, over = null;

function adopt(el) {
  if (!el.matches || !el.matches(SEL)) return;
  const t = el.getAttribute('title');
  if (t === null) return;
  el.dataset.tip = t;
  el.removeAttribute('title');
  if (el === over) show(el);   // the text changed while hovered (Save after saving, Undo…)
}

function show(el) {
  const text = el.dataset.tip || '';
  if (!text) { hide(); return; }
  const m = /: | \(| · |\n/.exec(text), head = m ? text.slice(0, m.index) : text, rest = m ? text.slice(m.index) : '';
  tip.textContent = '';
  const b = document.createElement('b'); b.textContent = head;
  tip.append(b, rest);
  tip.hidden = false;
  const r = el.getBoundingClientRect();
  const x = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2));
  tip.style.left = x + 'px';
  tip.style.top = (r.bottom + GAP) + 'px';
}
function hide() { if (tip) tip.hidden = true; }

export function initTips() {
  const header = document.querySelector('header');
  if (!header) return;
  tip = document.createElement('div');
  tip.id = 'hdrTip'; tip.hidden = true; tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  header.querySelectorAll(SEL).forEach(adopt);
  new MutationObserver(ms => { for (const m of ms) adopt(m.target); })
    .observe(header, { attributes: true, attributeFilter: ['title'], subtree: true });
  header.addEventListener('pointerover', e => {
    const el = e.target.closest(SEL);
    if (el === over) return;
    over = el;
    if (el) show(el); else hide();
  });
  header.addEventListener('pointerleave', () => { over = null; hide(); });
  // pressing hides it (a click changes the state; the next hover shows the new text) and so does a drag of the clock
  header.addEventListener('pointerdown', () => { if (over) hide(); });
}
