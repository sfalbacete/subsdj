/* SubSDJ · per-module help: the explanations no longer take up panel
   surface — they live in a hidden <div class="help"> inside the module and are
   shown with the «?» icon in the h2 (pattern from the modular synth). The tooltip
   is a single fixed div repositioned next to the icon. */
export function initHelp() {
  const tip = document.createElement('div');
  tip.id = 'helpTip'; tip.hidden = true;
  document.body.appendChild(tip);

  for (const p of document.querySelectorAll('.panel')) {
    const help = p.querySelector('.help');
    if (!help) continue;
    const h2 = p.querySelector('h2');
    const q = document.createElement('span');
    q.className = 'qmark'; q.textContent = '?';
    h2.appendChild(q);
    const show = () => {
      tip.innerHTML = help.innerHTML;
      tip.hidden = false;
      const r = q.getBoundingClientRect();
      const x = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, r.right - tip.offsetWidth));
      tip.style.left = x + 'px';
      tip.style.top = (r.bottom + 8) + 'px';
    };
    q.addEventListener('mouseenter', show);
    q.addEventListener('mouseleave', () => { tip.hidden = true; });
    q.addEventListener('click', e => {           // touch: toggles; and must NOT fold the module
      e.stopPropagation();
      tip.hidden ? show() : (tip.hidden = true);
    });
  }
}
