/* SubSDJ · selector giratorio: un .seg con clase .rot se dibuja como el
   conmutador rotativo del hardware — un knob en el centro y las posiciones
   serigrafiadas alrededor. Los botones SON las posiciones (los mismos
   <button data-…> del seg de siempre), así que bindSeg, CONTROLS, MIDI learn
   y los presets no se enteran del cambio de aspecto. Aquí solo se colocan
   los botones en arco, se añade el knob (sin data-knob: no es un control
   propio) y se gira con la posición activa. La sigue un MutationObserver
   sobre la clase .active: el cambio llega igual venga de donde venga (clic,
   preset, MIDI, cambio de parte).
   Gesto: clic en una posición = elegirla; arrastre vertical sobre el knob =
   recorrer posiciones; clic en el knob = la siguiente (da la vuelta).
   Geometría: STEP grados entre posiciones, como mucho ARC (el recorrido del
   knob, ±135°); las etiquetas van en un círculo de radio R alrededor del
   centro (CX, CY) de una caja de 104 × 80 px (style.css: .seg.rot). */
const STEP = 45, ARC = 270, R = 38, CX = 52, CY = 42, DRAG_PX = 16;

export function initRotaries(root = document) {
  for (const seg of root.querySelectorAll('.seg.rot')) {
    if (seg.dataset.rot) continue;
    seg.dataset.rot = '1';
    const btns = [...seg.querySelectorAll('button')], n = btns.length;
    const spread = Math.min(ARC, (n - 1) * STEP);
    const ang = i => (n < 2 ? 0 : -spread / 2 + i * spread / (n - 1));
    btns.forEach((b, i) => {
      const t = ang(i) * Math.PI / 180;
      b.style.left = (CX + R * Math.sin(t)).toFixed(1) + 'px';
      b.style.top = (CY - R * Math.cos(t)).toFixed(1) + 'px';
    });
    const knob = document.createElement('div');
    knob.className = 'knob';
    knob.innerHTML = '<div class="ind"></div>';
    seg.appendChild(knob);

    const cap = seg.parentElement.querySelector('.rcap');   // leyenda opcional de la posición (data-cap); el FM4 dibuja su grafo aparte (fm4Graph.js) y su data-cap es el valor corto de la pantalla Salida
    const cur = () => btns.findIndex(b => b.classList.contains('active'));
    const paint = () => {
      const i = cur();
      knob.style.setProperty('--pos', i < 0 ? '0' : ((ang(i) + ARC / 2) / ARC).toFixed(4));
      if (cap) cap.textContent = i < 0 ? '' : (btns[i].dataset.cap || '');
    };
    new MutationObserver(paint).observe(seg, { subtree: true, attributes: true, attributeFilter: ['class'] });
    paint();

    let down = false, moved = false, y0 = 0, i0 = 0;
    knob.addEventListener('pointerdown', e => {
      down = true; moved = false; y0 = e.clientY; i0 = Math.max(0, cur());
      knob.setPointerCapture(e.pointerId); e.preventDefault();
    });
    knob.addEventListener('pointermove', e => {
      if (!down) return;
      const d = Math.round((y0 - e.clientY) / DRAG_PX);
      if (d) moved = true;
      const i = Math.max(0, Math.min(n - 1, i0 + d));
      if (i !== cur()) btns[i].click();
    });
    const end = e => {
      if (!down) return;
      down = false;
      try { knob.releasePointerCapture(e.pointerId); } catch { /* ya suelto */ }
      if (!moved) btns[(Math.max(0, cur()) + 1) % n].click();
    };
    knob.addEventListener('pointerup', end);
    knob.addEventListener('pointercancel', end);
  }
}
