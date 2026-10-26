/* SubSDJ · rotary selector: a .seg with class .rot is drawn like the
   hardware rotary switch — a knob in the center and the positions
   screen-printed around it. The buttons ARE the positions (the same
   <button data-…> of the usual seg), so bindSeg, CONTROLS, MIDI learn
   and the presets never notice the change of look. Here we only lay
   the buttons out in an arc, add the knob (no data-knob: it is not a control
   of its own) and turn it with the active position. A MutationObserver
   on the .active class follows it: the change arrives the same wherever it comes from (click,
   preset, MIDI, part change).
   Gesture: click on a position = pick it; vertical drag on the knob =
   step through positions; click on the knob = the next one (wraps around).
   Geometry: STEP degrees between positions, at most ARC (the knob's
   travel, ±135°); the labels sit on a circle of radius R around the
   center (CX, CY) of a 104 × 80 px box (style.css: .seg.rot). */
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

    const cap = seg.parentElement.querySelector('.rcap');   // optional caption for the position (data-cap); the FM4 draws its graph separately (fm4Graph.js) and its data-cap is the short value for the Output screen
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
      try { knob.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      if (!moved) btns[(Math.max(0, cur()) + 1) % n].click();
    };
    knob.addEventListener('pointerup', end);
    knob.addEventListener('pointercancel', end);
  }
}
