/* SubSDJ · the header CLOCK: tempo (BPM) and swing, the two GLOBAL timing
   settings. They used to be knobs in the Delay and Arpeggiator modules, but they
   drive much more than either (the sequencers, the Steps, the synced delay and
   LFOs, the players) and with Parts on they belong to every part (Room keys), so
   they live in the header, visible from every screen.
   Each one is a number you DRAG (vertical, like a knob: 200 px = the whole range,
   Shift = ×1/4) or TYPE (double-click, or Enter when focused: Enter sets it, Esc
   cancels, leaving the field sets it); with focus, the arrows nudge it. They register
   in CONTROLS like any knob ({get, set, def, el}), so presets, Reset, undo, MIDI
   learn and the dimming of ui/deps.js treat them as they did the knobs. */
import { part } from '../engine/parts.js';
import { PARAMS } from '../engine/params.js';
import { CONTROLS, applyTarget } from './registry.js';

const DRAG_PX = 200;   // px of vertical drag for the whole range (the knobs use the same)
const CELLS = [
  // BPM: whole beats when dragged or nudged; typed, one decimal is kept (a tempo taken from a record: 122.5)
  { id: 'clkBpm', key: 'bpm', snap: 1, nudge: 1, show: v => String(Math.round(v * 10) / 10), parse: s => parseFloat(s),
    say: v => Math.round(v * 10) / 10 + ' bpm' },
  // swing 0.5..0.75 shown and typed in percent («54» or «54 %»)
  { id: 'clkSwing', key: 'swing', snap: 0.01, nudge: 0.01, show: v => Math.round(v * 100) + '%', parse: s => parseFloat(s) / 100,
    say: v => Math.round(v * 100) + ' %' },
];

function attachClockCell(el, c) {
  const p = PARAMS[c.key], valEl = el.querySelector('.val');
  const clamp = v => Math.min(p.max, Math.max(p.min, v));
  let value = p.def, editing = null;
  const render = () => {
    if (!editing) valEl.textContent = c.show(value);
    el.setAttribute('aria-valuenow', String(value));
    el.setAttribute('aria-valuetext', c.say(value));
  };
  const set = v => { value = clamp(v); render(); applyTarget(c.key, value); };
  // a change by the user's hand: the Output display shows it, as it does a knob's
  const touched = () => document.dispatchEvent(new CustomEvent('display-show', { detail: { who: 'Clock · ' + el.dataset.lab, val: c.say(value) } }));
  el.setAttribute('aria-valuemin', String(p.min)); el.setAttribute('aria-valuemax', String(p.max));

  // drag: vertical, like a knob; snapped to whole steps (the position keeps the fractions, so a slow drag still moves)
  let drag = null;
  el.addEventListener('pointerdown', e => {
    if (editing || e.button !== 0) return;
    part().resume();
    drag = { y: e.clientY, v: value };
    el.setPointerCapture(e.pointerId); el.classList.add('drag');
    e.preventDefault();
  });
  el.addEventListener('pointermove', e => {
    if (!drag) return;
    const dy = drag.y - e.clientY, fine = e.shiftKey ? 0.25 : 1;
    const v = clamp(Math.round((drag.v + dy * (p.max - p.min) / DRAG_PX * fine) / c.snap) * c.snap);
    if (v !== value) { set(v); touched(); }
  });
  const end = e => { if (!drag) return; drag = null; el.classList.remove('drag'); try { el.releasePointerCapture(e.pointerId); } catch (_) {} };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  // typing: the number becomes a field (the QWERTY piano ignores text fields)
  const edit = (fromKey = false) => {
    if (editing) return;
    editing = document.createElement('input');
    editing.type = 'text'; editing.className = 'clk-in'; editing.value = c.show(value).replace('%', '');
    editing.setAttribute('aria-label', el.getAttribute('aria-label'));
    valEl.textContent = ''; valEl.appendChild(editing);
    editing.focus(); editing.select();
    const finish = ok => {
      if (!editing) return;
      const v = c.parse(editing.value), inp = editing;
      editing = null; inp.remove();
      if (ok && Number.isFinite(v)) { set(v); touched(); } else render();
      if (fromKey) el.focus();                              // opened with Enter: the focus stays for the arrows
    };
    editing.addEventListener('keydown', e => {
      e.stopPropagation();                                  // Escape here cancels the field, it is not «panic»
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    editing.addEventListener('blur', () => finish(true));
    editing.addEventListener('pointerdown', e => e.stopPropagation());   // clicking inside the field is not a drag
  };
  el.addEventListener('dblclick', e => { e.preventDefault(); edit(); });
  el.addEventListener('keydown', e => {
    if (editing) return;
    if (e.key === 'Enter') { e.preventDefault(); edit(true); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      set(Math.round((value + (e.key === 'ArrowUp' ? 1 : -1) * c.nudge) / c.snap) * c.snap); touched();
    }
  });

  set(p.def);   // like a knob: the default reaches the engine at startup
  return { get: () => value, set, edit };
}

export function initClock() {
  for (const c of CELLS) {
    const el = document.getElementById(c.id);
    if (!el) continue;
    const k = attachClockCell(el, c);
    CONTROLS[c.key] = { get: k.get, set: k.set, def: PARAMS[c.key].def, el };
  }
}
