/* SubSDJ · ayuda por módulo: las explicaciones ya no ocupan superficie de
   panel — viven en un <div class="help"> oculto dentro del módulo y se
   muestran con el icono «?» del h2 (patrón del synth modular). El tooltip
   es un div fijo único reposicionado junto al icono. */
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
    q.addEventListener('click', e => {           // táctil: alterna; y que NO pliegue el módulo
      e.stopPropagation();
      tip.hidden ? show() : (tip.hidden = true);
    });
  }
}
