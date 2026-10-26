/* SubSDJ · panel del secuenciador: segs, editor de pasos en canvas (edita el
   param string seqPat), stepper de longitud y exclusión mutua con el arp.
   La frase son offsets en semitonos sobre la tecla mantenida ('.' = silencio). */
import { part } from '../engine/parts.js';
import { PARAMS } from '../engine/params.js';
import { CONTROLS, applyTarget, bindSelect } from './registry.js';
import { ESCALAS } from '../engine/Harmony.js';
import { bindSeg } from './oscControls.js';
import { SEQ_MAX_STEPS, SEQ_OFF_MIN, SEQ_OFF_MAX, parsePattern, stepFreq, stepToken } from '../engine/Seq.js';
import { token, tint } from './theme.js';
import { fitCanvas, uiZoom } from './frame.js';

const tokensOf = () => part().S.seqPat.trim().split(/\s+/).filter(Boolean).slice(0, SEQ_MAX_STEPS);

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
  // Con articulaciones (Roadmap 7.0 · 5.1): ! acento · ~ ligadura · / slide · x2-x4 repeticiones
  { name: 'Ácido con slides',   pat: '0! 0 12/ 0 3 0! 10/ 7',                       div: '1/16' },
  { name: 'Ácido que pregunta', pat: '0 0! . 0/ 12 . 3! 5/ 7 . 0 10! . 12/ 0 .',    div: '1/16' },
  { name: 'Ligaduras largas',   pat: '0~ 0 7/ 5 3~ 3 . -2/',                         div: '1/8' },
  { name: 'Redobles',           pat: '0! . 0 0x2 0! . 0x3 0x4',                      div: '1/8' },
  // Por grados (5.2): al elegirlas, si las notas están en semitonos pasan a la escala mayor
  { grp: 'Por grados', name: 'Arpegio de la escala',  pat: '0 2 4 7 4 2 0 -3',            div: '1/16', notes: 'major' },
  { grp: 'Por grados', name: 'Escala que sube y baja', pat: '0 1 2 3 4 5 6 7 6 5 4 3 2 1 0 -1', div: '1/16', notes: 'major' },
  { grp: 'Por grados', name: 'Terceras rodando',      pat: '0 2 1 3 2 4 3 5',             div: '1/16', notes: 'major' },
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
    get: () => part().S.seqPat,
    set: v => applyTarget('seqPat', String(v ?? PARAMS.seqPat.def)),
    def: PARAMS.seqPat.def,
  };
  CONTROLS.seqPat.set(PARAMS.seqPat.def);

  const notes = document.getElementById('seqNotesSel');   // notas por grado (5.2)
  if (notes) bindSelect(notes, 'seqNotes', [{ id: 'semitones', label: 'semitones' }, { id: 'harmony', label: 'grados · armonía' },
    ...Object.keys(ESCALAS).map(k => ({ id: k, label: 'grados · ' + k }))]);
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
    const cur = norm(part().S.seqPat);
    const chosen = SEQ_PATTERNS[+sel.value];
    if (chosen && norm(chosen.pat) === cur) return;   // la selección vigente ya casa (hay patrones repetidos entre grupos)
    const i = SEQ_PATTERNS.findIndex(p => norm(p.pat) === cur);
    sel.value = i >= 0 ? String(i) : '';
  };
  sel.addEventListener('change', () => {
    const p = SEQ_PATTERNS[+sel.value];
    if (!p) { sync(); return; }               // «personalizada» no pisa nada
    part().resume();
    CONTROLS.seqPat.set(p.pat);
    CONTROLS.seqDiv.set(p.div);
    if (p.notes && CONTROLS.seqNotes.get() === 'semitones') CONTROLS.seqNotes.set(p.notes);   // una frase por grados necesita escala
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
  let W = 220, H = 110;                              // tamaño en px de diseño (fitCanvas: backing store a dpr × zoom)
  const fit = () => { ({ w: W, h: H } = fitCanvas(canvas, g, 220, 110)); };
  const yOf = off => (H - PAD) - ((off - SEQ_OFF_MIN) / SPAN) * (H - 2 * PAD);

  function draw() {
    fit();
    const w = W, h = H, steps = parsePattern(part().S.seqPat);
    const play = part().ready && part().seq.timer ? part().seq.playingStep() : -1;
    g.clearRect(0, 0, w, h);
    g.lineWidth = 1;
    g.strokeStyle = tint('--dim', .18);
    g.strokeRect(PAD, PAD, w - 2 * PAD, h - 2 * PAD);
    const hline = y => { g.beginPath(); g.moveTo(PAD, y); g.lineTo(w - PAD, y); g.stroke(); };
    g.strokeStyle = tint('--dim', .35); hline(yOf(0));                       // raíz
    const oct = part().ready ? part().seq.octaveSteps() : 12;                  // la octava: 12 semitonos o los grados de la escala
    g.setLineDash([3, 4]); g.strokeStyle = tint('--dim', .22); hline(yOf(oct)); g.setLineDash([]);
    if (!steps.length) return;
    const cw = (w - 2 * PAD) / steps.length;
    g.font = '8px system-ui';
    steps.forEach((st, i) => {
      const x0 = PAD + i * cw;
      if (i) { g.strokeStyle = tint('--dim', .10); g.beginPath(); g.moveTo(x0, PAD); g.lineTo(x0, h - PAD); g.stroke(); }
      if (i === play) {                                // marcador: columna que suena ahora
        g.fillStyle = tint('--accent', .12);
        g.fillRect(x0 + 1, PAD + 1, cw - 2, h - 2 * PAD - 2);
        g.fillStyle = token('--accent');
        g.fillRect(x0 + 1, PAD + 1, cw - 2, 2);
      }
      if (i % 4 === 0) { g.fillStyle = tint('--dim', .6); g.fillText(String(i + 1), x0 + 2, PAD + 8); }
      const xa = x0 + cw * 0.18, xb = x0 + cw * 0.82;
      if (st) {
        const y = yOf(st.off), y0 = yOf(0);
        g.fillStyle = tint('--accent', .22);
        g.fillRect(xa, Math.min(y, y0), xb - xa, Math.max(2, Math.abs(y - y0)));  // tallo hasta la raíz
        // remate: la altura del paso. Acento = más grueso y en el color de la estrella;
        // repeticiones = el remate partido en tantos trozos como golpes
        const capH = st.accent ? 5 : 3, n = st.rep, seg = (xb - xa) / n;
        g.fillStyle = st.accent ? token('--star') : token('--accent');
        for (let k = 0; k < n; k++) g.fillRect(xa + k * seg + (k ? 1 : 0), y - capH / 2, seg - (n > 1 ? 1 : 0), capH);
        if (st.tie || st.slide) {                      // ligadura: raya horizontal · slide: diagonal hasta la altura del siguiente
          const nx = steps[(i + 1) % steps.length], xn = PAD + (i + 1) * cw + cw * 0.18;
          g.strokeStyle = token('--accent'); g.lineWidth = 1.5; g.beginPath(); g.moveTo(xb, y);
          g.lineTo(xn, st.slide && nx ? yOf(nx.off) : y); g.stroke(); g.lineWidth = 1;
        }
      } else {
        g.fillStyle = tint('--dim', .35);
        g.fillRect(xa, h - PAD - 3, xb - xa, 2);                                  // silencio: marca en la base
      }
    });
  }

  // Previsualización al editar: suena la nota del paso que estás fijando
  // (raíz de referencia C4). Si la frase YA está sonando, el loop te guía.
  let prevTimer = null;
  function preview(off) {
    if (!part().ready || part().seq.timer) return;
    if (part().S.mode === 'mono' && part().heldStack.length) return;   // no robar una voz mono en uso
    part()._directOn('seqprev', stepFreq(261.63, part().seq.semis(off, 261.63)), 0.8);   // con grados, su nota en la escala
    clearTimeout(prevTimer);
    prevTimer = setTimeout(() => part()._directOff('seqprev'), 180);
  }

  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    part().resume();
    const toks = tokensOf();
    if (!toks.length) return;
    const rect = canvas.getBoundingClientRect();
    const cw = (W - 2 * PAD) / toks.length;
    const step = Math.max(0, Math.min(toks.length - 1, Math.floor(((e.clientX - rect.left) / uiZoom() - PAD) / cw)));
    const st = parsePattern(part().S.seqPat)[step];
    // articulaciones (Roadmap 7.0 · 5.1), sobre un paso con nota: Mayús = acento,
    // Alt = ligadura → slide → nada, Ctrl = repeticiones 1 → 2 → 3 → 4
    if (st && (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey)) {
      const nx = { ...st };
      if (e.shiftKey) nx.accent = !st.accent;
      else if (e.altKey) { nx.tie = !st.tie && !st.slide; nx.slide = st.tie; }
      else nx.rep = st.rep % 4 + 1;
      toks[step] = stepToken(nx);
      CONTROLS.seqPat.set(toks.join(' '));
      e.preventDefault();
      return;
    }
    drag = { step, startY: e.clientY, startOff: st ? st.off : 0, wasRest: !st, st, moved: false };
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const dy = (drag.startY - e.clientY) / uiZoom();
    if (Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    const pxPerSemi = (H - 2 * PAD) / SPAN;
    const off = Math.max(SEQ_OFF_MIN, Math.min(SEQ_OFF_MAX, Math.round(drag.startOff + dy / pxPerSemi)));
    const toks = tokensOf();
    if (toks[drag.step] === String(off)) return;     // solo al cambiar de semitono
    toks[drag.step] = drag.st ? stepToken({ ...drag.st, off }) : String(off);   // conserva sus marcas; arrastrar un silencio lo convierte en nota
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

  document.addEventListener('param-change', e => { if (e.detail.target === 'seqPat' || e.detail.target === 'seqNotes') draw(); });
  window.addEventListener('resize', draw);           // screens.js dispara resize al cambiar de pestaña
  let lastPlay = -1;                                 // marcador: redibuja solo al cambiar de paso
  setInterval(() => {
    const p = part().ready && part().seq.timer ? part().seq.playingStep() : -1;
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
