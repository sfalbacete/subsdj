/* SubSDJ · panel del secuenciador: segs, editor de pasos en canvas (edita el
   param string seqPat), stepper de longitud y exclusión mutua con el arp.
   La frase son offsets en semitonos sobre la tecla mantenida ('.' = silencio). */
import { engine } from '../engine/AudioEngine.js';
import { PARAMS } from '../engine/params.js';
import { CONTROLS, applyTarget } from './registry.js';
import { bindSeg } from './oscControls.js';
import { SEQ_MAX_STEPS, SEQ_OFF_MIN, SEQ_OFF_MAX, parsePattern, stepFreq } from '../engine/Seq.js';

const tokensOf = () => engine.S.seqPat.trim().split(/\s+/).filter(Boolean).slice(0, SEQ_MAX_STEPS);

// Banco de frases prefabricadas (offsets sobre la raíz; div = división recomendada).
// El selector es azúcar de UI: solo reescribe seqPat/seqDiv vía CONTROLS.
export const SEQ_PATTERNS = [
  { name: 'Octavas',            pat: '0 12 0 12 0 12 0 12',                         div: '1/16' },
  { name: 'Bajo ácido',         pat: '0 0 12 0 3 3 7 10',                           div: '1/16' },
  { name: 'Ácido sincopado',    pat: '0 . 0 12 . 10 3 .',                           div: '1/16' },
  { name: 'Arpegio menor',      pat: '0 3 7 12 . 7 3 .',                            div: '1/16' },
  { name: 'Arpegio mayor',      pat: '0 4 7 12 16 12 7 4',                          div: '1/16' },
  { name: 'Quintas rodando',    pat: '0 7 . 7 0 7 10 7',                            div: '1/16' },
  { name: 'Hook trance',        pat: '0 . 7 . 12 . 7 .',                            div: '1/16' },
  { name: 'Bajada frigia',      pat: '12 . 10 . 7 . 1 0',                           div: '1/8' },
  { name: 'Escalera 2 octavas', pat: '0 3 7 10 12 15 19 22 24 22 19 15 12 10 7 3', div: '1/16' },
  { name: 'Pregunta-respuesta', pat: '0 3 5 7 . 7 10 12 . 12 10 7 5 3 . .',        div: '1/16' },
  { name: 'Dembow sub',         pat: '0 . . 0 . . 12 .',                            div: '1/8' },
  { name: 'Fanfarria',          pat: '0 12 24 12 0 12 24 12',                       div: '1/16' },
  // Clásicas: riffs de synth famosos transcritos de oído (aproximaciones, uso
  // personal). Relativos a la tecla mantenida; bpm = tempo del original.
  { grp: 'Clásicas', name: 'Blade Runner · Vangelis',  pat: '0 . 0 0 12 . 0 0 10 . 0 0 12 . 0 0', div: '1/16', bpm: 140 },
  { grp: 'Clásicas', name: 'Blade Runner · Sergio',  pat: '0 0 2 3', div: '1/16', bpm: 125 },
  { grp: 'Clásicas', name: 'Chase · Moroder',          pat: '0 7 12 7 0 7 12 7',                  div: '1/16', bpm: 130 },
  { grp: 'Clásicas', name: 'Stranger Things',          pat: '0 4 7 11 12 11 7 4',                 div: '1/16', bpm: 86 },
  { grp: 'Clásicas', name: 'Blue Monday · New Order',  pat: '0 0 0 0 0 0 0 0 0 0 0 0 -2 -2 -5 -5', div: '1/16', bpm: 130 },
  { grp: 'Clásicas', name: 'On The Run · Pink Floyd',  pat: '0 3 5 3 10 8 10 12',                 div: '1/16', bpm: 165 },
  { grp: 'Clásicas', name: 'The Robots · Kraftwerk',   pat: '0 . 0 12 . 0 . 12 0 . 0 12 10 . 7 .', div: '1/16', bpm: 110 },
  { grp: 'Clásicas', name: 'I Feel Love · Moroder',    pat: '0 12 0 12 0 12 0 12',                div: '1/16', bpm: 125 },
  { grp: 'Clásicas', name: 'The Model · Kraftwerk',    pat: '0 0 0 0 8 8 7 7',                    div: '1/8',  bpm: 106 },
  { grp: 'Clásicas', name: 'Axel F · Faltermeyer',     pat: '0 . . 3 . . 0 . 0 5 . 0 . -2 . .',   div: '1/16', bpm: 118 },
];

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
  initSeqPatterns();
  initMutex();
}

// Selector de frases: elegir una escribe seqPat (+ división recomendada);
// editar el patrón a mano lo devuelve a «personalizada».
function initSeqPatterns() {
  const sel = document.getElementById('seqPatSel');
  if (!sel) return;
  const opt = (parent, v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; parent.appendChild(o); };
  opt(sel, '', '— personalizada —');
  const groups = new Map();
  SEQ_PATTERNS.forEach((p, i) => {
    const gname = p.grp || 'Frases';
    if (!groups.has(gname)) { const og = document.createElement('optgroup'); og.label = gname; sel.appendChild(og); groups.set(gname, og); }
    opt(groups.get(gname), String(i), p.name);
  });
  const norm = s => String(s).trim().split(/\s+/).join(' ');
  const sync = () => {
    const cur = norm(engine.S.seqPat);
    const chosen = SEQ_PATTERNS[+sel.value];
    if (chosen && norm(chosen.pat) === cur) return;   // la selección vigente ya casa (hay patrones repetidos entre grupos)
    const i = SEQ_PATTERNS.findIndex(p => norm(p.pat) === cur);
    sel.value = i >= 0 ? String(i) : '';
  };
  sel.addEventListener('change', () => {
    const p = SEQ_PATTERNS[+sel.value];
    if (!p) { sync(); return; }               // «personalizada» no pisa nada
    engine.resume();
    CONTROLS.seqPat.set(p.pat);
    CONTROLS.seqDiv.set(p.div);
    if (p.bpm) CONTROLS.bpm.set(p.bpm);       // las clásicas caen en su tempo
  });
  document.addEventListener('param-change', e => { if (e.detail.target === 'seqPat') sync(); });
  sync();
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
    const play = engine.ready && engine.seq.timer ? engine.seq.playingStep() : -1;
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
      if (i === play) {                                // marcador: columna que suena ahora
        g.fillStyle = 'rgba(57,212,163,.12)';
        g.fillRect(x0 + 1, PAD + 1, cw - 2, h - 2 * PAD - 2);
        g.fillStyle = '#39d4a3';
        g.fillRect(x0 + 1, PAD + 1, cw - 2, 2);
      }
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

  // Previsualización al editar: suena la nota del paso que estás fijando
  // (raíz de referencia C4). Si la frase YA está sonando, el loop te guía.
  let prevTimer = null;
  function preview(off) {
    if (!engine.ready || engine.seq.timer) return;
    if (engine.S.mode === 'mono' && engine.heldStack.length) return;   // no robar una voz mono en uso
    engine._directOn('seqprev', stepFreq(261.63, off), 0.8);
    clearTimeout(prevTimer);
    prevTimer = setTimeout(() => engine._directOff('seqprev'), 180);
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
    if (toks[drag.step] === String(off)) return;     // solo al cambiar de semitono
    toks[drag.step] = String(off);                   // arrastrar un silencio lo convierte en nota
    CONTROLS.seqPat.set(toks.join(' '));
    preview(off);
  });
  const end = e => {
    if (!drag) return;
    if (!drag.moved) {                               // toque corto: alterna nota <-> silencio
      const toks = tokensOf();
      toks[drag.step] = drag.wasRest ? '0' : '.';
      CONTROLS.seqPat.set(toks.join(' '));
      if (drag.wasRest) preview(0);
    }
    drag = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  document.addEventListener('param-change', e => { if (e.detail.target === 'seqPat') draw(); });
  window.addEventListener('resize', draw);           // collapse.js dispara resize al desplegar
  let lastPlay = -1;                                 // marcador: redibuja solo al cambiar de paso
  setInterval(() => {
    const p = engine.ready && engine.seq.timer ? engine.seq.playingStep() : -1;
    if (p !== lastPlay) { lastPlay = p; draw(); }
  }, 40);
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
