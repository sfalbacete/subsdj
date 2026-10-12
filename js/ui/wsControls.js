/* SubSDJ · panel de la secuencia de tabla (wave sequencing): segs + editor de
   pasos en canvas (edita el param string wsPat) + stepper de longitud.
   La frase son FRAMES de la tabla (0..7); '.' = mantener el frame anterior
   (así se hacen pasos largos: ritmo desigual). Clon adaptado del editor del
   secuenciador; el marcador sigue a la voz más reciente (cada voz lleva su
   propia fase — en un acorde el marcador es solo orientativo). */
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

  // wsPat: el editor canvas es su único widget. Sin `el`: fuera de MIDI learn.
  CONTROLS.wsPat = {
    get: () => part().S.wsPat,
    set: v => applyTarget('wsPat', String(v ?? PARAMS.wsPat.def)),
    def: PARAMS.wsPat.def,
  };
  CONTROLS.wsPat.set(PARAMS.wsPat.def);

  initWsEditor(document.getElementById('wsCanvas'));
  initWsLen();
}

// Editor de pasos: columnas = tokens; arrastre vertical = frame (0..7),
// toque corto = alterna frame <-> mantener ('.'). Los 'mantener' se pintan
// como guion tenue a la altura HEREDADA (se resuelve andando el patrón).
function initWsEditor(canvas) {
  if (!canvas) return;
  const g = canvas.getContext('2d');
  const PAD = 8;
  let W = 220, H = 96;                              // tamaño en px de diseño (fitCanvas: backing store a dpr × zoom)
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
    for (let f = 1; f < WS_TOP; f++) {                 // rejilla: una línea por frame
      const y = yOf(f);
      g.strokeStyle = tint('--dim', .10);
      g.beginPath(); g.moveTo(PAD, y); g.lineTo(w - PAD, y); g.stroke();
    }
    if (!steps.length) return;
    const cw = (w - 2 * PAD) / steps.length;
    g.font = '8px system-ui';
    let held = Math.round(part().S.wtPos * WS_TOP);    // '.' inicial hereda del knob Morph
    steps.forEach((st, i) => {
      const x0 = PAD + i * cw;
      if (i) { g.strokeStyle = tint('--dim', .10); g.beginPath(); g.moveTo(x0, PAD); g.lineTo(x0, h - PAD); g.stroke(); }
      if (i === play) {                                // marcador: columna que suena ahora
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
        g.fillRect(xa, Math.min(y, y0), xb - xa, Math.max(2, Math.abs(y - y0)));  // tallo hasta el frame 0
        g.fillStyle = token('--accent2');
        g.fillRect(xa, y - 1.5, xb - xa, 3);                                      // remate: frame del paso
      } else {
        g.fillStyle = tint('--dim', .4);
        g.fillRect(xa, yOf(held) - 1, xb - xa, 2);                                // mantener: guion a la altura heredada
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
    if (toks[drag.step] === String(fr)) return;        // solo al cambiar de frame
    toks[drag.step] = String(fr);                      // arrastrar un 'mantener' lo convierte en paso
    CONTROLS.wsPat.set(toks.join(' '));
  });
  const end = e => {
    if (!drag) return;
    if (!drag.moved) {                                 // toque corto: alterna frame <-> mantener
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
  window.addEventListener('resize', draw);             // screens.js dispara resize al cambiar de pestaña
  let lastPlay = -1;                                   // marcador: redibuja solo al cambiar de paso
  setInterval(() => {
    const p = part().ready ? part().wseq.playingStep() : -1;
    if (p !== lastPlay) { lastPlay = p; draw(); }
  }, 40);
  draw();
}

// Stepper de longitud: reescribe el string (+ añade 'mantener', − quita el último)
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
