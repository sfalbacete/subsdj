/* SubSDJ · the tempo on the keyboard bar (2026-11-08): the «Click» switch — a metronome
   (engine/Metronome.js) — and the «Tap» button (TapTempo). Both are of whoever PLAYS, not
   of the preset: nothing of them goes into presets, scenes or MIDI learn, and the click is
   not an undo step. The BPM the tap writes is a BPM like any other: it goes through the
   clock cell (CONTROLS.bpm), so the engine, the Output display and undo see it — a run of
   taps is ONE undo step (the gesture closes when the tapping stops, TAP_RESET_MS).
   The click's label blinks with each beat, more on the 1 (the metronome keeps the clicks it
   scheduled: Metronome.beatNow), so with the sound down it is still a visual metronome.
   The metronome is created on first use: the audio context exists only after the first
   gesture (the splash's ENTER); until then the switch stays off. */
import { part } from '../engine/parts.js';
import { PARAMS } from '../engine/params.js';
import { Metronome, TapTempo, TAP_MIN, TAP_RESET_MS } from '../engine/Metronome.js';
import { CONTROLS } from './registry.js';
import { begin as beginGesture, end as endGesture } from './history.js';

let metro = null;
export const metronome = () => metro;   // the live one (null before the first use) — the selftest looks at it
// The Click from code: a pattern take (ui/playerControls.js) switches it on while it records and off again after
let setClickFn = null;
export const clickOn = () => !!(metro && metro.running);
export function setClick(on) { if (setClickFn && on !== clickOn()) setClickFn(on); }

function initClick() {
  const grp = document.getElementById('kbClick'), sw = document.getElementById('clickSw');
  if (!grp || !sw) return;
  const [offBtn, onBtn] = sw.querySelectorAll('button');
  const paint = on => { offBtn.classList.toggle('active', !on); onBtn.classList.toggle('active', on); };
  let raf = 0;
  // the beat light: one frame after each click, the label flashes (the class is re-added: a reflow restarts the animation)
  const light = () => {
    const hit = metro && metro.running ? metro.beatNow() : null;
    if (hit) { grp.classList.remove('beat', 'bar'); void grp.offsetWidth; grp.classList.add(hit.bar ? 'bar' : 'beat'); }
    raf = metro && metro.running ? requestAnimationFrame(light) : 0;
  };
  const set = on => {
    const e = part();
    if (on && !e.ready) return;                   // no audio yet: nothing to click with
    if (!metro) metro = new Metronome(e.ctx, () => part().bpm);   // one context for the single engine and the parts
    if (on) { metro.start(); if (!raf) raf = requestAnimationFrame(light); }
    else { metro.stop(); grp.classList.remove('beat', 'bar'); }
    paint(metro.running);
  };
  // the inactive button lies on top (the .seg.sw switch), so any click toggles; blurred: Space must not «click» it again
  for (const b of [offBtn, onBtn]) b.addEventListener('click', () => { part().resume(); b.blur(); set(!(metro && metro.running)); });
  paint(false);
  setClickFn = set;
}

function initTap() {
  const btn = document.getElementById('tapBtn');
  if (!btn) return;
  const tapper = new TapTempo({ lo: PARAMS.bpm.min, hi: PARAMS.bpm.max });
  let closer = 0;
  const show = val => document.dispatchEvent(new CustomEvent('display-show', { detail: { who: 'Clock · Tap', val } }));
  btn.addEventListener('click', () => {
    part().resume(); btn.blur();
    if (!tapper.count) beginGesture();            // the first tap of a run opens the undo gesture: the whole run is one step
    const bpm = tapper.tap(performance.now());
    clearTimeout(closer);
    closer = setTimeout(() => { tapper.reset(); endGesture(); }, TAP_RESET_MS);   // the run is over: the step closes, the next tap starts anew
    if (bpm === null) { show('·'.repeat(tapper.count) + ' (' + TAP_MIN + ' taps)'); return; }
    if (CONTROLS.bpm.get() !== bpm) CONTROLS.bpm.set(bpm);
    show(bpm + ' bpm');
  });
}

export function initTempo() { initClick(); initTap(); }
