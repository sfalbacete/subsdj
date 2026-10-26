/* SubSDJ · Wave Sequence panel (wave sequencing): segs + canvas step
   editor (edits the string param wsPat) + length stepper.
   The phrase is FRAMES of the table (0..7); '.' = hold the previous frame
   (that is how long steps are made: uneven rhythm). Adapted clone of the
   sequencer's editor; the marker follows the most recent voice (each voice has its
   own phase — in a chord the marker is only a rough guide). */
import { part } from '../engine/parts.js';
import { PARAMS } from '../engine/params.js';
import { CONTROLS, applyTarget } from './registry.js';
import { bindSeg } from './oscControls.js';
import { WS_MAX_STEPS, WS_TOP, parseWsPattern } from '../engine/WaveSeq.js';
import { token, tint } from './theme.js';
import { fitCanvas, uiZoom } from './frame.js';

const tokensOf = () => part().S.wsPat.trim().split(/\s+/).filter(Boolean).slice(0, WS_MAX_STEPS);

export function bindWsControls() {
  bindSeg('wsOnSel', 'wson', 'wsOn', 'wsOn');
  bindSeg('wsDivSel', 'wsdiv', 'wsDiv', 'wsDiv');
  bindSeg('wsModeSel', 'wsmode', 'wsMode', 'wsMode');

  // wsPat: the canvas editor is its only widget. No `el`: outside MIDI learn.
  CONTROLS.wsPat = {
    get: () => part().S.wsPat,
    set: v => applyTarget('wsPat', String(v ?? PARAMS.wsPat.def)),
    def: PARAMS.wsPat.def,
  };
  CONTROLS.wsPat.set(PARAMS.wsPat.def);

  initWsEditor(document.getElementById('wsCanvas'));
  initWsLen();
}

// Step editor: columns = tokens; vertical drag = frame (0..7),
// short tap = toggles frame <-> hold ('.'). The 'holds' are painted
// as a faint dash at the INHERITED height (resolved by walking the pattern).
function initWsEditor(canvas) {
  if (!canvas) return;
  const g = canvas.getContext('2d');
  const PAD = 8;
  let W = 220, H = 96;                              // size in design px (fitCanvas: backing store at dpr × zoom)
  const fit = () => { ({ w: W, h: H } = fitCanvas(canvas, g, 220, 96)); };
  const yOf = fr => (H - PAD) - (fr / WS_TOP) * (H - 2 * PAD);

  function draw() {
    fit();
    const w = W, h = H, steps = parseWsPattern(part().S.wsPat);
    const play = part().ready ? part().wseq.playingStep() : -1;
    g.clearRect(0, 0, w, h);
    g.lineWidth = 1;
    g.strokeStyle = tint('--dim', .18);
    g.strokeRect(PAD, PAD, w - 2 * PAD, h - 2 * PAD);
    for (let f = 1; f < WS_TOP; f++) {                 // grid: one line per frame
      const y = yOf(f);
      g.strokeStyle = tint('--dim', .10);
      g.beginPath(); g.moveTo(PAD, y); g.lineTo(w - PAD, y); g.stroke();
    }
    if (!steps.length) return;
    const cw = (w - 2 * PAD) / steps.length;
    g.font = '8px system-ui';
    let held = Math.round(part().S.wtPos * WS_TOP);    // a leading '.' inherits from the Morph knob
    steps.forEach((st, i) => {
      const x0 = PAD + i * cw;
      if (i) { g.strokeStyle = tint('--dim', .10); g.beginPath(); g.moveTo(x0, PAD); g.lineTo(x0, h - PAD); g.stroke(); }
      if (i === play) {                                // marker: the column sounding now
        g.fillStyle = tint('--accent2', .12);
        g.fillRect(x0 + 1, PAD + 1, cw - 2, h - 2 * PAD - 2);
        g.fillStyle = token('--accent2');
        g.fillRect(x0 + 1, PAD + 1, cw - 2, 2);
      }
      if (i % 4 === 0) { g.fillStyle = tint('--dim', .6); g.fillText(String(i + 1), x0 + 2, PAD + 8); }
      const xa = x0 + cw * 0.18, xb = x0 + cw * 0.82;
      if (st !== null) {
        held = st;
        const y = yOf(st), y0 = yOf(0);
        g.fillStyle = tint('--accent2', .22);
        g.fillRect(xa, Math.min(y, y0), xb - xa, Math.max(2, Math.abs(y - y0)));  // stem down to frame 0
        g.fillStyle = token('--accent2');
        g.fillRect(xa, y - 1.5, xb - xa, 3);                                      // cap: the step's frame
      } else {
        g.fillStyle = tint('--dim', .4);
        g.fillRect(xa, yOf(held) - 1, xb - xa, 2);                                // hold: dash at the inherited height
      }
    });
  }

  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    part().resume();
    const toks = tokensOf();
    if (!toks.length) return;
    const rect = canvas.getBoundingClientRect();
    const cw = (W - 2 * PAD) / toks.length;
    const step = Math.max(0, Math.min(toks.length - 1, Math.floor(((e.clientX - rect.left) / uiZoom() - PAD) / cw)));
    const st = parseWsPattern(part().S.wsPat)[step];
    drag = { step, startY: e.clientY, startFr: st !== null ? st : 0, wasHold: st === null, moved: false };
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const dy = (drag.startY - e.clientY) / uiZoom();
    if (Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    const pxPerFr = (H - 2 * PAD) / WS_TOP;
    const fr = Math.max(0, Math.min(WS_TOP, Math.round(drag.startFr + dy / pxPerFr)));
    const toks = tokensOf();
    if (toks[drag.step] === String(fr)) return;        // only when the frame changes
    toks[drag.step] = String(fr);                      // dragging a 'hold' turns it into a step
    CONTROLS.wsPat.set(toks.join(' '));
  });
  const end = e => {
    if (!drag) return;
    if (!drag.moved) {                                 // short tap: toggles frame <-> hold
      const toks = tokensOf();
      toks[drag.step] = drag.wasHold ? String(drag.startFr) : '.';
      CONTROLS.wsPat.set(toks.join(' '));
    }
    drag = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  document.addEventListener('param-change', e => {
    if (e.detail.target === 'wsPat' || e.detail.target === 'wtPos') draw();
  });
  window.addEventListener('resize', draw);             // screens.js fires resize on tab change
  let lastPlay = -1;                                   // marker: redraws only when the step changes
  setInterval(() => {
    const p = part().ready ? part().wseq.playingStep() : -1;
    if (p !== lastPlay) { lastPlay = p; draw(); }
  }, 40);
  draw();
}

// Length stepper: rewrites the string (+ adds a 'hold', − removes the last one)
function initWsLen() {
  const num = document.getElementById('wsLenNum');
  const sync = () => { if (num) num.textContent = tokensOf().length; };
  document.getElementById('wsLenInc').addEventListener('click', () => {
    const t = tokensOf(); if (t.length >= WS_MAX_STEPS) return;
    t.push('.'); CONTROLS.wsPat.set(t.join(' '));
  });
  document.getElementById('wsLenDec').addEventListener('click', () => {
    const t = tokensOf(); if (t.length <= 1) return;
    t.pop(); CONTROLS.wsPat.set(t.join(' '));
  });
  document.addEventListener('param-change', e => { if (e.detail.target === 'wsPat') sync(); });
  sync();
}
