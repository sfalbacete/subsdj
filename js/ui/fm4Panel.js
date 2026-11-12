/* SubSDJ · the FM4 panel (2026-11-02). What it adds to the knobs (ui/knobs.js binds those):
   - the algorithm: ‹ › step through the eight; the number opens a popover with all eight drawn
     (it IS the .seg of fm4Alg: MIDI, undo and the display see a normal selector); the graph,
     large, with the selected operator filled — clicking one of its boxes selects it;
   - the four operators at a glance: each row shows its ratio (or its Hz, with Fixed on), its
     level and its envelope AS IT RUNS — a note held TH seconds, then released — on a √time
     axis, so a 70 ms tine and a 3 s body read apart; carriers in the module's accent;
   - the selected operator in detail: its A D S R, Vel, Key, Detune and Fixed. The four detail
     rows are always in the DOM (MIDI learn, undo, presets, the selftest reach every knob); only
     the selected one shows. Which one is selected is the panel's, not the sound's: it is not saved. */
import { tipOf } from './tips.js';
import { CONTROLS } from './registry.js';
import { FM4_ALGS, svgFor, LARGE } from './fm4Graph.js';
import { bindSeg } from './oscControls.js';

const TH = 1.5, TR = 1.5;      // the envelope's picture: a note held 1.5 s, then 1.5 s of release
const FLAT = 3.99;             // decay / release at the top of the knob = ∞ (as in the worklet)
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// An operator's envelope as the worklet runs it (worklets/pulse-processor fm4EnvAt), at C4, as SVG
// paths in a W×H box: the note-off at XOFF (dashed); a release ∞ (it ignores the key) drawn dashed.
function envSvg(a, d, s, rel) {
  const W = 116, H = 22, top = 3, bot = H - 3, XOFF = 76, yOf = v => (bot - clamp(v, 0, 1) * (bot - top)).toFixed(1);
  const flat = d >= FLAT, relFlat = rel >= FLAT;
  const held = t => (t < a ? t / a : flat ? 1 : s + (1 - s) * Math.exp(-(t - a) / Math.max(0.005, d)));
  const L0 = held(TH), after = t => (relFlat ? held(TH + t) : L0 * Math.exp(-t / Math.max(0.005, rel)));
  const pts = [], tail = [];
  for (let i = 0; i <= 48; i++) { const u = i / 48; pts.push(`${(2 + (XOFF - 2) * u).toFixed(1)} ${yOf(held(TH * u * u))}`); }
  for (let i = 1; i <= 24; i++) { const u = i / 24; tail.push(`${(XOFF + (W - 2 - XOFF) * u).toFixed(1)} ${yOf(after(TR * u * u))}`); }
  const line = 'M' + pts.join(' L'), rest = 'M' + pts[pts.length - 1] + ' L' + tail.join(' L');
  const fill = `M2 ${bot} L` + pts.join(' L') + ' L' + tail.join(' L') + ` L${W - 2} ${bot} Z`;
  return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><line x1="${XOFF}" y1="1" x2="${XOFF}" y2="${H - 1}"/>`
    + `<path class="f" d="${fill}"/><path class="l" d="${line}"/><path class="l${relFlat ? ' amp' : ''}" d="${rest}"/></svg>`;
}

export function initFm4Panel() {
  const seg = $('fm4AlgSel'), pop = $('fm4AlgPop'), num = $('fm4AlgNum'), name = $('fm4AlgName'), graph = $('fm4Graph');
  if (!seg || !pop || !num || !graph) return;
  const panel = $('fm4Panel'), detOp = $('fm4DetOp'), role = $('fm4DetRole');
  const boxes = [...panel.querySelectorAll('.f4-box')], envs = [...panel.querySelectorAll('.f4-env')];
  const rats = [...panel.querySelectorAll('.f4-rat')], rows = [...panel.querySelectorAll('.f4-detrow')];
  for (let i = 1; i <= 4; i++) bindSeg('fm4Fix' + i + 'Sel', 'fix', 'fm4Fix' + i, 'fm4Fix' + i);   // Fixed: a switch per operator
  // the picker's eight buttons get their small graph; data-txt keeps their label for the display («3 · 2·3·4→1»)
  seg.dataset.lab = 'Algorithm';
  seg.querySelectorAll('button').forEach(b => { b.dataset.txt = String(+b.dataset.alg + 1); b.insertAdjacentHTML('afterbegin', '<span class="fm4g">' + svgFor(+b.dataset.alg) + '</span>'); });
  // MIDI learn and the enablers point at the visible selector (‹ n ›), not at the hidden popover
  if (CONTROLS.fm4Alg) CONTROLS.fm4Alg.el = num.closest('.f4-algsel') || num;

  let sel = 0;   // the operator in detail (0..3)
  const alg = () => FM4_ALGS[+CONTROLS.fm4Alg.get() || 0] || FM4_ALGS[0];
  const paint = () => {
    const a = alg(), ai = +CONTROLS.fm4Alg.get() || 0, b = seg.querySelector('button[data-alg="' + ai + '"]');
    num.textContent = String(ai + 1);
    if (name) name.textContent = b ? b.dataset.name : '';
    graph.innerHTML = svgFor(ai, +CONTROLS.fm4Fb.get() > 0, { ...LARGE, sel });
    graph.title = b ? tipOf(b) + ' · click a box to edit that operator' : '';
    for (let i = 0; i < 4; i++) {
      const car = a.car.includes(i), k = n => +CONTROLS[n + (i + 1)].get();
      boxes[i].classList.toggle('car', car); boxes[i].classList.toggle('sel', i === sel);
      envs[i].classList.toggle('car', car); envs[i].classList.toggle('sel', i === sel);
      envs[i].innerHTML = envSvg(k('fm4A'), k('fm4D'), k('fm4S'), k('fm4Rel'));
      rats[i].classList.toggle('fixed', CONTROLS['fm4Fix' + (i + 1)].get() === 'on');
      rows[i].hidden = i !== sel;
    }
    if (detOp) detOp.textContent = 'Op ' + (sel + 1);
    if (role) {
      const targets = a.mods.flatMap((m, t) => (m.includes(sel) ? [t + 1] : []));
      role.textContent = a.car.includes(sel) ? 'carrier · it sounds' : 'modulator · it shapes ' + targets.join(' and ');
    }
  };
  let queued = false;
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; paint(); }); } };
  const select = op => { if (op >= 0 && op < 4 && op !== sel) { sel = op; paint(); } };

  // ‹ › and the number: the algorithm (a touch for the display and the undo, like any control)
  const touch = () => document.dispatchEvent(new CustomEvent('ctl-touch', { detail: { el: seg } }));
  const step = d => { CONTROLS.fm4Alg.set(String(((+CONTROLS.fm4Alg.get() || 0) + d + 8) % 8)); touch(); };
  $('fm4AlgPrev')?.addEventListener('click', () => step(-1));
  $('fm4AlgNext')?.addEventListener('click', () => step(1));
  const close = () => { pop.hidden = true; num.setAttribute('aria-expanded', 'false'); };
  num.addEventListener('click', () => { pop.hidden = !pop.hidden; num.setAttribute('aria-expanded', String(!pop.hidden)); });
  seg.addEventListener('click', e => { if (e.target.closest('button')) close(); });   // bindSeg already chose it
  document.addEventListener('pointerdown', e => { if (!pop.hidden && !e.target.closest('#fm4AlgPop, #fm4AlgNum')) close(); });
  document.addEventListener('escape-first', e => { if (!pop.hidden) { e.preventDefault(); close(); } });   // Esc closes it before being «panic»

  // selecting an operator: its row (box or envelope) or its box in the graph
  boxes.forEach((b, i) => b.addEventListener('click', () => select(i)));
  envs.forEach((b, i) => b.addEventListener('click', () => select(i)));
  graph.addEventListener('click', e => { const g = e.target.closest('[data-op]'); if (g) select(+g.dataset.op - 1); });

  // whatever moves an FM4 key (a knob, a preset, undo, MIDI, a part change) repaints, once per frame
  document.addEventListener('param-change', e => { if (String(e.detail.target).startsWith('fm4')) later(); });
  paint();
}
