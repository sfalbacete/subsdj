/* SubSDJ · panel del secuenciador: segs, editor de pasos en canvas (edita el
   param string seqPat), stepper de longitud y exclusión mutua con el arp.
   La frase son offsets en semitonos sobre la tecla mantenida ('.' = silencio). */
import { engine } from '../engine/AudioEngine.js';
import { PARAMS } from '../engine/params.js';
import { CONTROLS, applyTarget } from './registry.js';
import { bindSeg } from './oscControls.js';
import { SEQ_MAX_STEPS, SEQ_OFF_MIN, SEQ_OFF_MAX, parsePattern } from '../engine/Seq.js';

const tokensOf = () => engine.S.seqPat.trim().split(/\s+/).filter(Boolean).slice(0, SEQ_MAX_STEPS);

export function bindSeqControls() {
  bindSeg('seqOnSel', 'seqon', 'seqOn', 'seqOn');
  bindSeg('seqDivSel', 'sdiv', 'seqDiv', 'seqDiv');
  bindSeg('seqLatchSel', 'slatch', 'seqLatch', 'seqLatch');
  bindSeg('seqRetrigSel', 'sretrig', 'seqRetrig', 'seqRetrig');

  // seqPat: el editor canvas es su único widget. Sin `el`: fuera de MIDI learn
  // (un CC no puede editar un string; applyCC lo consumiría sin efecto igualmente).
  CONTROLS.seqPat = {
    get: () => engine.S.seqPat,
    set: v => applyTarget('seqPat', String(v ?? PARAMS.seqPat.def)),
    def: PARAMS.seqPat.def,
  };
  CONTROLS.seqPat.set(PARAMS.seqPat.def);

  initSeqEditor(document.getElementById('seqCanvas'));
  initSeqLen();
  initMutex();
}

// Editor de pasos: columnas = tokens del patrón; arrastre vertical = altura
// (cuantizada a semitonos, −12..+24), toque corto = alterna nota/silencio.
function initSeqEditor(canvas) {
  if (!canvas) return;
  const g = canvas.getContext('2d');
  const PAD = 8, SPAN = SEQ_OFF_MAX - SEQ_OFF_MIN;
  const fit = () => { canvas.width = canvas.clientWidth || 220; canvas.height = canvas.clientHeight || 110; };
  const yOf = off => (canvas.height - PAD) - ((off - SEQ_OFF_MIN) / SPAN) * (canvas.height - 2 * PAD);

  function draw() {
    fit();
    const w = canvas.width, h = canvas.height, steps = parsePattern(engine.S.seqPat);
    g.clearRect(0, 0, w, h);
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(125,138,153,.18)';
    g.strokeRect(PAD, PAD, w - 2 * PAD, h - 2 * PAD);
    const hline = y => { g.beginPath(); g.moveTo(PAD, y); g.lineTo(w - PAD, y); g.stroke(); };
    g.strokeStyle = 'rgba(125,138,153,.35)'; hline(yOf(0));                       // raíz
    g.setLineDash([3, 4]); g.strokeStyle = 'rgba(125,138,153,.22)'; hline(yOf(12)); g.setLineDash([]);
    if (!steps.length) return;
    const cw = (w - 2 * PAD) / steps.length;
    g.font = '8px system-ui';
    steps.forEach((st, i) => {
      const x0 = PAD + i * cw;
      if (i) { g.strokeStyle = 'rgba(125,138,153,.10)'; g.beginPath(); g.moveTo(x0, PAD); g.lineTo(x0, h - PAD); g.stroke(); }
      if (i % 4 === 0) { g.fillStyle = 'rgba(125,138,153,.6)'; g.fillText(String(i + 1), x0 + 2, PAD + 8); }
      const xa = x0 + cw * 0.18, xb = x0 + cw * 0.82;
      if (st) {
        const y = yOf(st.off), y0 = yOf(0);
        g.fillStyle = 'rgba(57,212,163,.22)';
        g.fillRect(xa, Math.min(y, y0), xb - xa, Math.max(2, Math.abs(y - y0)));  // tallo hasta la raíz
        g.fillStyle = '#39d4a3';
        g.fillRect(xa, y - 1.5, xb - xa, 3);                                      // remate: altura del paso
      } else {
        g.fillStyle = 'rgba(125,138,153,.35)';
        g.fillRect(xa, h - PAD - 3, xb - xa, 2);                                  // silencio: marca en la base
      }
    });
  }

  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    engine.resume();
    const toks = tokensOf();
    if (!toks.length) return;
    const rect = canvas.getBoundingClientRect();
    const cw = (canvas.width - 2 * PAD) / toks.length;
    const step = Math.max(0, Math.min(toks.length - 1, Math.floor((e.clientX - rect.left - PAD) / cw)));
    const st = parsePattern(engine.S.seqPat)[step];
    drag = { step, startY: e.clientY, startOff: st ? st.off : 0, wasRest: !st, moved: false };
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const dy = drag.startY - e.clientY;
    if (Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    const pxPerSemi = (canvas.height - 2 * PAD) / SPAN;
    const off = Math.max(SEQ_OFF_MIN, Math.min(SEQ_OFF_MAX, Math.round(drag.startOff + dy / pxPerSemi)));
    const toks = tokensOf();
    toks[drag.step] = String(off);                   // arrastrar un silencio lo convierte en nota
    CONTROLS.seqPat.set(toks.join(' '));
  });
  const end = e => {
    if (!drag) return;
    if (!drag.moved) {                               // toque corto: alterna nota <-> silencio
      const toks = tokensOf();
      toks[drag.step] = drag.wasRest ? '0' : '.';
      CONTROLS.seqPat.set(toks.join(' '));
    }
    drag = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  document.addEventListener('param-change', e => { if (e.detail.target === 'seqPat') draw(); });
  window.addEventListener('resize', draw);           // collapse.js dispara resize al desplegar
  draw();
}

// Stepper de longitud: reescribe el string (+ añade silencio, − quita el último)
function initSeqLen() {
  const num = document.getElementById('seqLenNum');
  const sync = () => { if (num) num.textContent = tokensOf().length; };
  document.getElementById('seqLenInc').addEventListener('click', () => {
    const t = tokensOf(); if (t.length >= SEQ_MAX_STEPS) return;
    t.push('.'); CONTROLS.seqPat.set(t.join(' '));
  });
  document.getElementById('seqLenDec').addEventListener('click', () => {
    const t = tokensOf(); if (t.length <= 1) return;
    t.pop(); CONTROLS.seqPat.set(t.join(' '));
  });
  document.addEventListener('param-change', e => { if (e.detail.target === 'seqPat') sync(); });
  sync();
}

// Arp y seq no tienen sentido a la vez: encender uno apaga el otro.
function initMutex() {
  let busy = false;
  document.addEventListener('param-change', e => {
    if (busy) return;
    const { target, value } = e.detail;
    busy = true;
    try {
      if (target === 'seqOn' && value === 'on' && CONTROLS.arpMode.get() !== 'off') CONTROLS.arpMode.set('off');
      if (target === 'arpMode' && value !== 'off' && CONTROLS.seqOn.get() === 'on') CONTROLS.seqOn.set('off');
    } finally { busy = false; }
  });
}
