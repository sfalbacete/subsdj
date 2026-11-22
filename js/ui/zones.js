/* =====================================================================
   SubSDJ · key zones over the keyboard (engine/parts.js: keyMode, zone).
   With «Keys · Zones» (the Room column of the Part Mixer) each part plays
   the keys inside its zone. Here the zones are DRAWN and MOVED: one lane
   per part that has a zone, over the keys and aligned with them — a bar
   from its lowest note to its highest. Drag an end to move it (past the
   end of the keyboard on screen = open: down to the first MIDI note, or up
   to the last), the middle to slide the whole zone. Two bars side by side
   are a split; where they overlap, both parts sound.
   The keyboard on screen is a window (2 to 6 octaves) on the 128 notes: a
   zone that goes on beyond it has a dashed end there, and one that lies
   wholly outside shows as a stub at that edge (move the octave to reach it).
   Which parts have a zone is the K of their mixer strip (ui/partsControls.js).
   The lanes are built once per scene and only PLACED afterwards, so a bar
   keeps the pointer while it is dragged. Any change is announced with
   'zones-changed'.
   ===================================================================== */
import { getScene, setPartZone, partLabel, NOTE_MAX } from '../engine/parts.js';
import { viewRange } from './keyboard.js';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK = new Set([1, 3, 6, 8, 10]);
export const noteName = m => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
export const zoneText = z => (z.lo <= 0 && z.hi >= NOTE_MAX ? 'all keys' : z.lo <= 0 ? 'up to ' + noteName(z.hi)
  : z.hi >= NOTE_MAX ? noteName(z.lo) + ' and up' : z.lo === z.hi ? noteName(z.lo) : noteName(z.lo) + '–' + noteName(z.hi));

let host = null, lanes = [], drag = null;

// Where each note on screen STARTS, in px from the left of the keys — bounds[m − lo] for m = lo..hi+1 (the last one
// is the right end). Notes tile the width: a black key takes its own width out of its two white neighbors.
function bounds() {
  const keys = document.getElementById('kbKeys'); if (!keys || !keys.clientWidth) return null;
  const { lo, hi } = viewRange(), el = {};
  keys.querySelectorAll('[data-midi]').forEach(k => { el[+k.dataset.midi] = k; });
  const b = [];
  for (let m = lo; m <= hi; m++) {
    const k = el[m], prev = el[m - 1]; if (!k) return null;
    b.push(m === lo ? 0 : BLACK.has(m % 12) ? k.offsetLeft : prev && BLACK.has((m - 1) % 12) ? prev.offsetLeft + prev.offsetWidth : k.offsetLeft);
  }
  b.push(keys.clientWidth);
  return { lo, hi, b, w: keys.clientWidth };
}
// The note under x (px from the left of the keys), inside the view
function noteAt(g, x) {
  let m = g.lo;
  while (m < g.hi && x >= g.b[m - g.lo + 1]) m++;
  return m;
}

function build() {
  const sc = getScene();
  host.innerHTML = ''; lanes = [];
  if (!sc) return;
  sc.parts.forEach((p, i) => {
    const lane = document.createElement('div');
    lane.className = 'zlane'; lane.dataset.i = i;
    lane.innerHTML = '<div class="zbar"><span class="zh l"></span><span class="zt"></span><span class="zh r"></span></div>';
    host.appendChild(lane);
    const bar = lane.firstElementChild;
    bar.addEventListener('pointerdown', e => {
      const g = bounds(); if (!g) return;
      e.preventDefault(); e.stopPropagation();
      const kind = e.target.classList.contains('zh') ? (e.target.classList.contains('l') ? 'lo' : 'hi') : 'move';
      const r = host.getBoundingClientRect(), k = g.w / r.width;   // the instrument is zoomed: screen px → layout px
      drag = { i, kind, g, r, k, z0: { ...p.zone }, n0: noteAt(g, (e.clientX - r.left) * k) };
      try { bar.setPointerCapture(e.pointerId); } catch (_) {}
      lane.classList.add('drag');
    });
    bar.addEventListener('pointermove', e => {
      if (!drag || drag.i !== i) return;
      const { g, r, k, z0, kind, n0 } = drag, x = (e.clientX - r.left) * k, n = noteAt(g, x);
      let z;
      if (kind === 'lo') z = { lo: Math.min(z0.hi, x < 0 ? 0 : n) };                  // past the left end: open downwards
      else if (kind === 'hi') z = { hi: Math.max(z0.lo, x > g.w ? NOTE_MAX : n) };   // past the right end: open upwards
      else { const d = Math.max(-z0.lo, Math.min(NOTE_MAX - z0.hi, n - n0)); z = { lo: z0.lo + d, hi: z0.hi + d }; }
      const cur = getScene().parts[i].zone;
      if ((z.lo ?? cur.lo) === cur.lo && (z.hi ?? cur.hi) === cur.hi) return;
      const now = setPartZone(i, z);
      document.dispatchEvent(new CustomEvent('display-show', { detail: { who: 'Key zone · Part ' + (i + 1), val: zoneText(now) } }));
      document.dispatchEvent(new CustomEvent('zones-changed'));
    });
    const end = () => { if (drag && drag.i === i) { drag = null; lane.classList.remove('drag'); } };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) bar.addEventListener(ev, end);
    lanes.push({ lane, bar, text: bar.querySelector('.zt') });
  });
}

function place() {
  const sc = getScene(), on = !!sc && sc.keyMode === 'zones';
  host.hidden = !on;                     // the lanes take their height from the keys (the module does not grow: fixed panel)
  if (!on) return;
  if (lanes.length !== sc.parts.length) build();
  const g = bounds();
  sc.parts.forEach((p, i) => {
    const L = lanes[i], z = p.zone;
    L.lane.hidden = !z.on;
    L.lane.classList.toggle('cur', i === sc.sel);
    L.lane.classList.toggle('alt', i % 2 === 1);
    L.text.textContent = (i + 1) + ' · ' + partLabel(p) + ' · ' + zoneText(z);
    L.bar.title = 'Part ' + (i + 1) + ' · ' + partLabel(p) + ': ' + zoneText(z) + ' — drag an end to move it (past the end of the keyboard = open), the middle to slide the zone';
    if (!z.on || !g) return;
    const outL = z.hi < g.lo, outR = z.lo > g.hi;
    L.bar.classList.toggle('out', outL || outR);
    L.bar.classList.toggle('more-l', !outL && !outR && z.lo < g.lo);
    L.bar.classList.toggle('more-r', !outL && !outR && z.hi > g.hi);
    const pct = x => (100 * x / g.w).toFixed(3) + '%';
    if (outL || outR) { L.bar.style.left = outL ? '0' : ''; L.bar.style.right = outR ? '0' : ''; L.bar.style.width = ''; L.text.textContent = outL ? '‹ ' + (i + 1) : (i + 1) + ' ›'; return; }
    const x0 = g.b[Math.max(z.lo, g.lo) - g.lo], x1 = g.b[Math.min(z.hi, g.hi) - g.lo + 1];
    L.bar.style.left = pct(x0); L.bar.style.right = ''; L.bar.style.width = pct(x1 - x0);
  });
}

export function initZones() {
  host = document.getElementById('kbZones'); if (!host) return;
  const again = () => { if (!drag) build(); place(); };
  for (const ev of ['scene-changed', 'scene-loaded']) document.addEventListener(ev, again);
  for (const ev of ['zones-changed', 'kb-built', 'part-changed', 'part-renamed', 'preset-loaded']) document.addEventListener(ev, place);
  place();
}
