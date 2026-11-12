/* =====================================================================
   SubSDJ · the Pattern screen's editor (2026-11-12) — the loop of the
   Pattern player (engine/Player.js: cfg.pat) of the part the rack edits,
   as a grid: time across (bars · beats · the Quantize grid), pitch down
   (one row per semitone, a strip of piano keys on the left). It is there
   to FIX what was recorded, and to write a loop by hand if you like.
   No tools: what you do depends on where you grab —
     drag a note sideways     moves it in time, on the Quantize grid (Off: free)
     drag it up / down        changes its pitch by semitones (you hear it)
     drag its right edge      changes its length, on the grid
     wheel over a note        its velocity
     double click on empty    adds a note one grid step long
     double click on a note   deletes it (Delete does too, for the selected one)
     wheel over empty         scrolls the pitches
     Ctrl + wheel             zooms the time in and out around the pointer (− + Fit above too)
     Shift + wheel            scrolls the time
   ZOOM AND SCROLL. By default the whole loop fits the width; a long take makes its notes
   too small to grab, so the time zooms (zoomK px per beat, 0 = fit) and scrolls (scrollX,
   the beat at the left edge). Two scroll bars, also draggable: the one below is the time;
   the one on the right is the pitch, over the whole MIDI range, with a mark at the height
   of every note of the loop — so you can see there are notes above or below the view.
   Zoomed, the view follows the take as it grows and the playhead as it plays, a page at a
   time — except for a few seconds after you move the view or grab a note yourself.
   The take keeps the timing as played and Quantize is applied on playback,
   so a note is DRAWN where it will sound; moving it writes that position:
   what you fix by hand stays fixed. Every gesture is one undo step
   (Player.pushUndo; ↶ ↷ on the bar above). During a take the grid is
   read-only and shows the take growing.
   It only knows the player: it changes cfg.pat and announces it with
   'pattern-edited' (ui/playerControls.js repaints the buttons and the line
   of text); 'pattern-changed' comes back when the loop was replaced from
   outside (undo, Clear, a take) and the selection is let go.
   ===================================================================== */
import { patStart } from '../engine/Player.js';
import { BEATS_PER_BAR as BAR } from '../engine/Conductor.js';
import { NOTE_NAMES } from '../engine/Harmony.js';
import { fitCanvas } from './frame.js';
import { token } from './theme.js';
import { currentScreen } from './screens.js';
import { patPlayer, patRecording } from './playerControls.js';

const KEY_W = 46;        // px: the strip of piano keys
const RULER_H = 16;      // px: the bar numbers
const ROW_H = 13;        // px per semitone
const SB = 10;           // px: the scroll bars (below: time; right: pitch)
const EDGE_PX = 7;       // px at a note's right end that grab its length (a narrow note: its right 40 %)
const ZOOM_STEP = 1.25;  // a notch of zoom
const MAX_K = 320;       // px per beat at the closest zoom
const HANDS_OFF_MS = 4000;   // after you scroll, zoom or grab a note, the view stays put this long before following the playhead again
const MIN_PX = 6;        // a note is never drawn (or grabbed) narrower than this
const NEW_VEL = 0.8;     // velocity of a note added by hand
const NEW_GRID = 0.25;   // with Quantize off, a new note is a sixteenth on the sixteenth grid
const MIN_LEN = 0.05;    // beats: shortest length with Quantize off
const VEL_STEP = 0.05;   // a notch of the wheel
const WHEEL_GROUP_MS = 700;   // wheel notches closer than this are one undo step
const SCROLL_ROWS = 3;   // semitones per notch when scrolling the pitches
const PREVIEW_MS = 180;  // how long a note sounds when you grab or move it
const CENTER = 60;       // C4: the middle of an empty grid
const BLACK = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];

const noteName = m => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

let cv = null, g = null, W = 600, H = 300;
let top = CENTER + 12;       // the pitch of the first row
let zoomK = 0;               // px per beat; 0 = the whole loop fits
let scrollX = 0;             // the beat at the left edge
let handsT = -1e9;           // when you last moved the view or grabbed a note (performance.now)
const hands = () => { handsT = performance.now(); };
let sel = null;              // the selected note (an object of cfg.pat.notes)
let drag = null;             // { mode: 'move' | 'len', n, b0, m0, len0, x0, y0, saved }
let hover = null;            // { n, edge } under the pointer
let lastPl = null, raf = 0, prevT = 0, wheelT = 0;

const viewW = () => W - KEY_W - SB, viewH = () => H - RULER_H - SB;
const rows = () => Math.max(1, Math.floor(viewH() / ROW_H));
const yOf = m => RULER_H + (top - m) * ROW_H;
const loopOf = pl => {       // what the grid shows: { notes, L (beats), q, live (a new take in progress) }
  const tk = pl.take, live = !!tk && !tk.dub, pat = pl.cfg.pat, c = pl.c;
  const rel = live ? c.beatAt(c.ctx.currentTime) - tk.origin : 0;
  return { live, rel, q: pl.cfg.quant, notes: live ? tk.notes : (pat ? pat.notes : []),
           L: live ? Math.max(1, Math.ceil(rel / BAR + 1e-9)) * BAR : (pat ? pat.bars * BAR : BAR) };
};
const pxb = L => Math.max(viewW() / L, zoomK);             // px per beat: the zoom, never less than the whole loop in view
const viewBeats = L => viewW() / pxb(L);
const clampScroll = L => { scrollX = clamp(scrollX, 0, Math.max(0, L - viewBeats(L))); };
const topAt = y => { const r = rows(); return clamp(Math.round(127 - (y - RULER_H) / viewH() * 128 + r / 2), r - 1, 127); };   // the pitch bar: the view centered where you point
const startOf = (n, lp) => (lp.live ? n.b : patStart(n, lp.q, lp.L));
function center(notes) {
  const r = rows();
  if (!notes.length) { top = clamp(CENTER + Math.floor(r / 2), r - 1, 127); return; }
  const lo = Math.min(...notes.map(n => n.m)), hi = Math.max(...notes.map(n => n.m));
  top = clamp(Math.round((lo + hi) / 2) + Math.floor(r / 2), r - 1, 127);
}
// The view follows: another part, or notes with none of them in sight (a loaded scene, a take in another octave)
function follow(pl, lp) {
  const vis = lp.notes.filter(n => n.b < lp.L - 1e-9), r = rows();
  if (pl !== lastPl) { lastPl = pl; sel = null; center(vis); return; }
  if (drag) return;
  const out = n => n.m > top || n.m < top - r + 1;
  if (vis.length && (lp.live ? vis.some(out) : vis.every(out))) center(vis);
}

function draw() {
  raf = 0;
  if (!cv || !cv.offsetParent) return;                     // not on screen: the loop stops ('screen-changed' starts it)
  raf = requestAnimationFrame(draw);
  ({ w: W, h: H } = fitCanvas(cv, g, 600, 300));
  g.clearRect(0, 0, W, H);
  const pl = patPlayer();
  const lp = pl ? loopOf(pl) : { live: false, rel: 0, q: 0.25, notes: [], L: BAR };
  if (pl) follow(pl, lp);
  if (zoomK && zoomK <= viewW() / lp.L) zoomK = 0;         // zoomed out to the whole loop: back to fit
  const r = rows(), k = pxb(lp.L), vb = viewBeats(lp.L), ink = token('--ink'), dim = token('--dim'), edge = token('--edge');
  if (pl && zoomK && !drag) {                              // zoomed: follow the take's end, or the playhead while the pointer is elsewhere
    const free = performance.now() - handsT > HANDS_OFF_MS;
    const ph = lp.live ? lp.rel : (pl.c.running && pl.cfg.pat && free ? pl.patPhase(pl.c.ctx.currentTime) * lp.L : -1);
    if (ph >= 0 && (ph < scrollX || ph > scrollX + vb)) scrollX = ph - vb * 0.05;   // a page on: the playhead enters from the left
  }
  clampScroll(lp.L);
  const X = b => KEY_W + (b - scrollX) * k, VW = viewW(), VH = viewH();
  // rows: the black keys' a shade darker, a line under every C
  for (let i = 0; i < r; i++) {
    const m = top - i, y = RULER_H + i * ROW_H, pc = ((m % 12) + 12) % 12;
    if (BLACK[pc]) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(KEY_W, y, VW, ROW_H); }
    if (pc === 0) { g.fillStyle = edge; g.globalAlpha = 0.9; g.fillRect(KEY_W, y + ROW_H - 1, VW, 1); g.globalAlpha = 1; }
    // the key strip
    g.fillStyle = BLACK[pc] ? token('--screen') : ink; g.globalAlpha = BLACK[pc] ? 1 : 0.2;
    g.fillRect(0, y, KEY_W - 1, ROW_H - 1); g.globalAlpha = 1;
    if (pc === 0 || (hover && hover.row === m) || (sel && sel.m === m)) {
      g.fillStyle = ink; g.globalAlpha = pc === 0 && !(sel && sel.m === m) && !(hover && hover.row === m) ? 0.75 : 1; g.font = '10px system-ui, sans-serif'; g.textBaseline = 'middle';
      g.fillText(noteName(m), 5, y + ROW_H / 2 + 0.5); g.globalAlpha = 1;
    }
  }
  // time: bars, beats and the Quantize grid (when its steps are wide enough to tell apart)
  g.save(); g.beginPath(); g.rect(KEY_W, 0, VW, H - SB); g.clip();
  const sub = lp.q > 0 && lp.q < 1 && k * lp.q >= 7 ? lp.q : 1;
  g.fillStyle = edge;
  for (let b = Math.floor(scrollX / sub) * sub; b <= Math.min(lp.L, scrollX + vb) + 1e-9; b += sub) {
    const bar = Math.abs(b / BAR - Math.round(b / BAR)) < 1e-9, beat = Math.abs(b - Math.round(b)) < 1e-9;
    g.globalAlpha = bar ? 1 : beat ? 0.6 : 0.28;
    g.fillRect(Math.round(X(b)), bar ? 0 : RULER_H, 1, H);
  }
  g.globalAlpha = 1;
  g.fillStyle = dim; g.font = '10px system-ui, sans-serif'; g.textBaseline = 'middle';
  const every = Math.max(1, Math.ceil(22 / (BAR * k)));    // bar numbers, as many as fit
  for (let bar = 0; bar * BAR < lp.L; bar += every) g.fillText(String(bar + 1), X(bar * BAR) + 5, RULER_H / 2 + 0.5);
  // notes, where they will sound
  g.beginPath(); g.rect(KEY_W, RULER_H, VW, VH); g.clip();
  const col = token(lp.live ? '--hot' : '--accent');
  for (const n of lp.notes) {
    if (n.b >= lp.L - 1e-9) continue;
    const open = lp.live && [...pl.take.open.values()].some(o => o.n === n);
    const s = startOf(n, lp), len = open ? Math.max(n.len, lp.rel - n.b) : Math.min(n.len, lp.L);
    const x = X(s), y = yOf(n.m) + 1, w = Math.max(MIN_PX, len * k - 1), h = ROW_H - 2;
    g.fillStyle = col; g.globalAlpha = 0.3 + 0.7 * n.v;
    g.fillRect(x, y, w, h);
    if (s + len > lp.L + 1e-9) g.fillRect(X(0), y, (s + len - lp.L) * k - 1, h);   // held over the loop's end: it comes round
    g.globalAlpha = 1;
    if (n === sel) { g.strokeStyle = ink; g.lineWidth = 1.5; g.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5); }
    else if (hover && hover.n === n) { g.strokeStyle = ink; g.globalAlpha = 0.5; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); g.globalAlpha = 1; }
  }
  g.restore();
  // the scroll bars. Time (below): the thumb is the stretch of the loop in view. Pitch (right): the whole MIDI range,
  // the thumb is the rows in view and every note of the loop leaves a mark at its height
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(KEY_W, H - SB, VW, SB); g.fillRect(W - SB, RULER_H, SB, VH);
  g.fillStyle = dim;
  g.globalAlpha = vb < lp.L - 1e-9 ? 0.55 : 0.18;
  g.fillRect(KEY_W + scrollX / lp.L * VW, H - SB + 2, Math.max(8, vb / lp.L * VW), SB - 4);
  g.globalAlpha = 0.55;
  g.fillRect(W - SB + 2, RULER_H + (127 - top) / 128 * VH, SB - 4, Math.max(8, r / 128 * VH));
  g.globalAlpha = 1; g.fillStyle = col;
  for (const n of lp.notes) if (n.b < lp.L - 1e-9) g.fillRect(W - SB + 1, RULER_H + (127 - n.m) / 128 * VH, SB - 2, 2);
  // the playhead
  if (pl && pl.c.running && (lp.live ? lp.rel >= 0 : !!pl.cfg.pat)) {
    g.fillStyle = token(pl.take ? '--hot' : '--ink');
    const px = X(lp.live ? lp.rel : pl.patPhase(pl.c.ctx.currentTime) * lp.L);
    if (px >= KEY_W && px <= KEY_W + VW) g.fillRect(Math.round(px), 0, 1.5, H - SB);
  }
}

// ---------- pointer ----------
// Screen → design px (the instrument is zoomed as a whole: the box on screen is the canvas' size × the zoom)
function at(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
function hit(p, pl, lp) {
  const k = pxb(lp.L), row = top - Math.floor((p.y - RULER_H) / ROW_H);
  const res = { n: null, edge: false, row, beat: scrollX + (p.x - KEY_W) / k, zone: p.x >= W - SB ? 'sy' : p.y >= H - SB ? 'sx' : p.x < KEY_W || p.y < RULER_H ? 'out' : 'grid' };
  if (res.zone !== 'grid') return res;
  for (let i = lp.notes.length - 1; i >= 0; i--) {          // the last added is on top
    const n = lp.notes[i]; if (n.m !== row || n.b >= lp.L - 1e-9) continue;
    const s = startOf(n, lp), x = KEY_W + (s - scrollX) * k, w = Math.max(MIN_PX, Math.min(n.len, lp.L) * k - 1);
    const inside = (p.x >= x && p.x <= x + w) || (s + n.len > lp.L && p.x <= KEY_W + (s + n.len - lp.L - scrollX) * k);
    if (inside) { res.n = n; res.edge = p.x >= x + w - Math.min(EDGE_PX, Math.max(3, w * 0.4)) && p.x <= x + w; return res; }
  }
  return res;
}
const editable = pl => !!pl && !patRecording();
const edited = () => document.dispatchEvent(new CustomEvent('pattern-edited'));
function preview(pl, n) {
  const e = pl.part.engine; if (!e.ready) return;
  e.resume();
  clearTimeout(prevT); e._directOff('patprev');
  e._directOn('patprev', 440 * Math.pow(2, (n.m - 69) / 12), n.v);
  prevT = setTimeout(() => e._directOff('patprev'), PREVIEW_MS);
}
function describe(n, lp) {
  const s = startOf(n, lp), bar = Math.floor(s / BAR + 1e-9), beat = s - bar * BAR + 1;
  const f = x => String(+x.toFixed(2));
  return noteName(n.m) + ' · bar ' + (bar + 1) + ', beat ' + f(beat) + ' · ' + f(n.len) + (Math.abs(n.len - 1) < 0.005 ? ' beat' : ' beats') + ' · vel ' + Math.round(n.v * 100);
}
function say(pl) {
  const el = document.getElementById('patEdNote'); if (!el) return;
  const n = drag ? drag.n : (hover && hover.n) || sel;
  el.textContent = n && pl ? describe(n, loopOf(pl)) : '';
}
const snap = (v, q) => (q > 0 ? Math.round(v / q) * q : v);

// Dragging a scroll bar: the view goes where the pointer is (its thumb centered there)
function scrollTo(mode, p, L) {
  hands();
  if (mode === 'sy') top = topAt(p.y);
  else { scrollX = (p.x - KEY_W) / viewW() * L - viewBeats(L) / 2; clampScroll(L); }
}
function down(e) {
  const pl = patPlayer(); if (!pl || e.button) return;
  const p = at(e), lp = loopOf(pl), h = hit(p, pl, lp);
  if (h.zone === 'sx' || h.zone === 'sy') {
    drag = { mode: h.zone }; scrollTo(h.zone, p, lp.L);
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault(); return;
  }
  if (!editable(pl)) return;
  if (!h.n) { sel = null; say(pl); return; }
  sel = h.n; hands();
  drag = { mode: h.edge ? 'len' : 'move', n: h.n, b0: startOf(h.n, lp), m0: h.n.m, len0: h.n.len, p0: at(e), saved: false };
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}   // a synthetic pointer (the selftest) can't be captured
  e.preventDefault();
  preview(pl, h.n); say(pl);
}
function move(e) {
  const pl = patPlayer(), p = at(e);
  if (!pl) return;
  const lp = loopOf(pl);
  if (!drag) {
    const h = hit(p, pl, lp);
    hover = h.zone === 'grid' ? { n: h.n, edge: h.edge, row: h.row } : null;
    cv.style.cursor = h.zone !== 'grid' || !editable(pl) ? 'default' : h.n ? (h.edge ? 'ew-resize' : 'grab') : 'crosshair';
    say(pl); return;
  }
  if (drag.mode === 'sx' || drag.mode === 'sy') { scrollTo(drag.mode, p, lp.L); return; }
  hands();
  const n = drag.n, k = pxb(lp.L), db = (p.x - drag.p0.x) / k, q = lp.q;
  const save = () => { if (!drag.saved) { pl.pushUndo(); drag.saved = true; } };
  if (drag.mode === 'len') {
    const len = Math.max(q > 0 ? q : MIN_LEN, Math.min(lp.L, snap(drag.len0 + db, q)));
    if (Math.abs(len - n.len) > 1e-9) { save(); n.len = len; }
  } else {
    // in time: only if it actually moves a grid step (a pure pitch drag leaves the timing as played)
    const nb = clamp(snap(drag.b0 + db, q), 0, lp.L - (q > 0 ? q : MIN_LEN));
    if (Math.abs(nb - drag.b0) > 1e-9 || drag.movedB) { if (Math.abs(nb - startOf(n, lp)) > 1e-9) { save(); n.b = nb; drag.movedB = true; } }
    const m = clamp(drag.m0 - Math.round((p.y - drag.p0.y) / ROW_H), 0, 127);
    if (m !== n.m) { save(); n.m = m; preview(pl, n); }
  }
  say(pl);
}
function up() {
  if (!drag) return;
  const changed = drag.saved; drag = null;
  if (changed) edited();
  say(patPlayer());
}
function dbl(e) {
  const pl = patPlayer(); if (!editable(pl)) return;
  const lp = loopOf(pl), p = at(e), h = hit(p, pl, lp);
  if (h.zone !== 'grid') return;
  if (h.n) {                                               // on a note: out
    pl.pushUndo();
    const a = pl.cfg.pat.notes, i = a.indexOf(h.n); if (i >= 0) a.splice(i, 1);
    if (sel === h.n) sel = null; hover = null;
  } else {                                                 // on empty: a note one grid step long, on the step under the pointer
    if (h.row < 0 || h.row > 127) return;
    if (pl.cfg.mode !== 'pattern') pl.setMode('pattern');  // writing a loop for this part means its player plays it
    pl.pushUndo();
    if (!pl.cfg.pat) pl.cfg.pat = { bars: 1, notes: [] };
    const gq = lp.q > 0 ? lp.q : NEW_GRID, L = pl.cfg.pat.bars * BAR;
    const n = { b: clamp(Math.floor(h.beat / gq + 1e-9) * gq, 0, L - gq), len: gq, m: h.row, v: NEW_VEL };
    pl.cfg.pat.notes.push(n); sel = n;
    preview(pl, n);
  }
  edited(); say(pl);
}
function wheel(e) {
  const pl = patPlayer(); if (!pl) return;
  e.preventDefault();
  const p = at(e), lp = loopOf(pl), h = hit(p, pl, lp), dir = -Math.sign(e.deltaY || e.deltaX);
  if (!dir) return;
  if (e.ctrlKey || e.metaKey) { zoomBy(dir > 0 ? ZOOM_STEP : 1 / ZOOM_STEP, lp.L, Math.max(0, p.x - KEY_W)); return; }
  if (e.shiftKey || h.zone === 'sx') { hands(); scrollX -= dir * viewBeats(lp.L) * 0.2; clampScroll(lp.L); return; }
  if (h.n && editable(pl)) {                               // velocity: a run of notches is one undo step
    const v = clamp(Math.round((h.n.v + dir * VEL_STEP) * 100) / 100, 0.05, 1);
    if (v === h.n.v) return;
    if (!wheelT) pl.pushUndo();
    clearTimeout(wheelT); wheelT = setTimeout(() => { wheelT = 0; }, WHEEL_GROUP_MS);
    h.n.v = v; sel = h.n;
    edited(); say(pl);
  } else { const r = rows(); top = clamp(top + dir * SCROLL_ROWS, r - 1, 127); }
}
function key(e) {
  if (e.key !== 'Delete' || currentScreen() !== 'pattern' || !sel) return;
  if (e.target.tagName === 'INPUT' && e.target.type === 'text') return;
  const pl = patPlayer(); if (!editable(pl) || !pl.cfg.pat) return;
  const a = pl.cfg.pat.notes, i = a.indexOf(sel); if (i < 0) return;
  e.preventDefault();
  pl.pushUndo(); a.splice(i, 1); sel = null;
  edited(); say(pl);
}

// Zoom by a factor keeping the beat under `px` (from the keys' edge) where it is; below the whole loop it is «fit»
function zoomBy(f, L, px = viewW() / 2) {
  hands();
  const k0 = pxb(L), beat = scrollX + px / k0, k1 = clamp(k0 * f, viewW() / L, MAX_K);
  zoomK = k1 <= viewW() / L * 1.001 ? 0 : k1;
  scrollX = beat - px / pxb(L); clampScroll(L);
}
export function patZoom(what) {                            // the − + Fit buttons above the grid
  const pl = patPlayer(), L = pl ? loopOf(pl).L : BAR;
  if (what === 'fit') { zoomK = 0; scrollX = 0; } else zoomBy(what === '+' ? ZOOM_STEP : 1 / ZOOM_STEP, L);
}
export const patView = () => ({ zoomK, scrollX, top });
export function patHandsOff() { handsT = -1e9; }             // (selftest) as if nobody had touched the view for a while

// For the selftest: where a note is on the canvas, in CLIENT px (its middle, and its right edge)
export function patEdGeom(n) {
  const pl = patPlayer(); if (!pl || !cv) return null;
  ({ w: W, h: H } = fitCanvas(cv, g, 600, 300));
  const lp = loopOf(pl), k = pxb(lp.L), r = cv.getBoundingClientRect(), sx = r.width / W, sy = r.height / H;
  clampScroll(lp.L);
  const s = startOf(n, lp), x = KEY_W + (s - scrollX) * k, w = Math.max(MIN_PX, Math.min(n.len, lp.L) * k - 1), y = yOf(n.m) + ROW_H / 2;
  return { mid: { x: r.left + (x + Math.min(w / 2, 4)) * sx, y: r.top + y * sy }, edge: { x: r.left + (x + w - 2) * sx, y: r.top + y * sy },
           beatPx: k * sx, rowPx: ROW_H * sy, left: r.left + (KEY_W - scrollX * k) * sx, top: r.top + RULER_H * sy, topNote: top,
           barX: r.left + (W - SB / 2) * sx, barY: m => r.top + (RULER_H + (127 - m) / 128 * viewH()) * sy, timeBarY: r.top + (H - SB / 2) * sy, gridLeft: r.left + KEY_W * sx, gridW: viewW() * sx };
}
export const patEdSelected = () => sel;

export function initPatternEditor() {
  cv = document.getElementById('patEd'); if (!cv) return;
  g = cv.getContext('2d');
  cv.addEventListener('pointerdown', down);
  cv.addEventListener('pointermove', move);
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) cv.addEventListener(ev, up);
  cv.addEventListener('pointerleave', () => { if (!drag) { hover = null; say(patPlayer()); } });
  cv.addEventListener('dblclick', dbl);
  cv.addEventListener('wheel', wheel, { passive: false });
  window.addEventListener('keydown', key);
  document.querySelectorAll('[data-patzoom]').forEach(b => b.addEventListener('click', () => { b.blur(); patZoom(b.dataset.patzoom); }));
  const kick = () => { if (!raf) raf = requestAnimationFrame(draw); };
  document.addEventListener('screen-changed', kick);
  window.addEventListener('resize', kick);
  document.addEventListener('pattern-changed', () => { sel = null; hover = null; drag = null; say(patPlayer()); });   // the loop was replaced: its notes are other objects
  for (const ev of ['part-changed', 'scene-changed', 'scene-loaded']) document.addEventListener(ev, () => { sel = null; hover = null; drag = null; lastPl = null; say(patPlayer()); kick(); });
  kick();
}
