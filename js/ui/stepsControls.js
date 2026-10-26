/* SubSDJ · panel «Pasos» (Roadmap 7.0 · 2.3): cuatro carriles de valores
   −1..+1 que la matriz usa como fuentes («Pasos i» y «Pasos i · nota»).
   Cada carril: un canvas donde se DIBUJAN los pasos arrastrando (la altura es
   el valor; cerca del centro se pega a 0), un stepper de longitud (1..32), la
   división, el suavizado, la rotación y la deriva de la rotación. Arriba, el
   reinicio común y cuánto tarda en repetirse todo («el ciclo completo dura…»).
   Los patrones son claves planas (st{i}Pat, como wsPat): presets, Reset y
   deshacer sin casos especiales; sin `el`, fuera de MIDI learn. El ancho de
   un paso es FIJO (32 por fila): un carril de 5 ocupa 5/32 y la polimetría se
   ve. El marcador sigue al paso que suena (calculado del reloj común). */
import { part } from '../engine/parts.js';
import { PARAMS } from '../engine/params.js';
import { CONTROLS, applyTarget, bindSelect } from './registry.js';
import { ST_LANES, ST_MAX, ST_DIVS, ST_DRIFTS, parseSteps, cycleBars } from '../engine/Steps.js';
import { token, tint } from './theme.js';
import { fitCanvas, uiZoom } from './frame.js';

const fmtV = v => String(Math.round(v * 100) / 100);
const valsOf = i => parseSteps(part().S['st' + i + 'Pat']);
const setPat = (i, vals) => CONTROLS['st' + i + 'Pat'].set(vals.map(fmtV).join(' '));
const SNAP = 0.08;   // cerca del centro, el paso vale 0 (dibujar un cero a mano es imposible si no)
const fmtBars = b => b >= 1 ? (Number.isInteger(b) ? b : b.toFixed(2)) + (b === 1 ? ' bar' : ' bars') : (Math.round(b * 4 * 100) / 100) + ' beats';

export function bindStepsControls() {
  for (let i = 1; i <= ST_LANES; i++) {
    const key = 'st' + i + 'Pat';
    CONTROLS[key] = { get: () => part().S[key], set: v => applyTarget(key, String(v ?? PARAMS[key].def)), def: PARAMS[key].def };
    CONTROLS[key].set(PARAMS[key].def);
    const row = document.querySelector('.ps-row[data-lane="' + i + '"]');
    if (!row) continue;
    bindSelect(row.querySelector('.ps-div'), 'st' + i + 'Div', Object.keys(ST_DIVS).map(d => ({ id: d, label: d })));
    bindSelect(row.querySelector('.ps-drift'), 'st' + i + 'Drift', Object.keys(ST_DRIFTS).map(d => ({ id: d, label: d === 'off' ? '—' : '+1 / ' + d })));
    initLane(i, row.querySelector('canvas'));
    initLen(i, row);
  }
  const rs = document.getElementById('stResetSel');
  if (rs) bindSelect(rs, 'stReset', [{ id: 'play', label: 'on play' }, { id: 'never', label: 'never' },
    ...['1 bar', '2 bars', '4 bars', '8 bars'].map(d => ({ id: d, label: 'every ' + d }))]);
  const cyc = document.getElementById('stCycle');
  const upd = () => {
    if (!cyc) return;
    const used = [...part().steps.usedLanes()].sort();
    const b = cycleBars(part().S, used.length ? used : [1, 2, 3, 4]);
    cyc.textContent = (used.length ? 'lanes ' + used.join(' · ') + ': ' : 'all four: ') + 'the full cycle lasts ' + fmtBars(b);
  };
  document.addEventListener('param-change', e => { if (/^st|^mx\d/.test(e.detail.target)) upd(); });
  for (const ev of ['part-changed', 'preset-loaded', 'scene-loaded']) document.addEventListener(ev, upd);
  upd();
}

function initLane(i, canvas) {
  if (!canvas) return;
  const g = canvas.getContext('2d'), PAD = 3;
  let W = 288, H = 32;
  const fit = () => { ({ w: W, h: H } = fitCanvas(canvas, g, 288, 32)); };
  const cw = () => (W - 2 * PAD) / ST_MAX;
  const yOf = v => PAD + (1 - (v + 1) / 2) * (H - 2 * PAD);
  function draw() {
    fit();
    const vals = valsOf(i), n = vals.length, play = part().ready ? part().steps.playingStep(i) : -1, w = cw();
    g.clearRect(0, 0, W, H);
    g.fillStyle = tint('--dim', .06); g.fillRect(PAD + n * w, PAD, W - 2 * PAD - n * w, H - 2 * PAD);   // más allá de la longitud
    g.strokeStyle = tint('--dim', .18); g.lineWidth = 1; g.strokeRect(PAD, PAD, W - 2 * PAD, H - 2 * PAD);
    const y0 = yOf(0);
    g.strokeStyle = tint('--dim', .22); g.beginPath(); g.moveTo(PAD, y0); g.lineTo(PAD + n * w, y0); g.stroke();
    for (let k = 0; k < n; k++) {
      const x0 = PAD + k * w;
      if (k && k % 4 === 0) { g.strokeStyle = tint('--dim', .14); g.beginPath(); g.moveTo(x0, PAD); g.lineTo(x0, H - PAD); g.stroke(); }
      if (k === play) { g.fillStyle = tint('--accent2', .16); g.fillRect(x0 + 0.5, PAD + 0.5, w - 1, H - 2 * PAD - 1); }
      const y = yOf(vals[k]), xa = x0 + w * 0.15, xb = x0 + w * 0.85;
      g.fillStyle = tint('--accent2', k === play ? .5 : .28);
      g.fillRect(xa, Math.min(y, y0), xb - xa, Math.max(1.5, Math.abs(y - y0)));
      g.fillStyle = token('--accent2');
      g.fillRect(xa, y - 1, xb - xa, 2);
    }
  }
  let drag = null;
  const at = e => {
    const r = canvas.getBoundingClientRect(), z = uiZoom();
    const x = (e.clientX - r.left) / z, y = (e.clientY - r.top) / z;
    let v = 1 - 2 * (y - PAD) / (H - 2 * PAD); v = Math.max(-1, Math.min(1, v)); if (Math.abs(v) < SNAP) v = 0;
    return { k: Math.floor((x - PAD) / cw()), v: Math.round(v * 100) / 100 };
  };
  const paint = e => {
    const vals = valsOf(i), { k, v } = at(e);
    if (k < 0 || k >= vals.length || vals[k] === v) return;
    vals[k] = v; setPat(i, vals);
  };
  canvas.addEventListener('pointerdown', e => { part().resume(); drag = true; canvas.setPointerCapture(e.pointerId); paint(e); e.preventDefault(); });
  canvas.addEventListener('pointermove', e => { if (drag) paint(e); });
  const end = e => { drag = null; try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  document.addEventListener('param-change', e => { if (e.detail.target === 'st' + i + 'Pat') draw(); });
  window.addEventListener('resize', draw);                 // screens.js dispara resize al cambiar de pestaña
  let last = -2;
  setInterval(() => { const p = part().ready ? part().steps.playingStep(i) : -1; if (p !== last) { last = p; draw(); } }, 40);
  draw();
}

// Stepper de longitud: + añade un paso a 0, − quita el último
function initLen(i, row) {
  const num = row.querySelector('.num'), dec = row.querySelector('[data-stlen="-"]'), inc = row.querySelector('[data-stlen="+"]');
  const sync = () => { if (num) num.textContent = valsOf(i).length; };
  inc.addEventListener('click', () => { const v = valsOf(i); if (v.length >= ST_MAX) return; v.push(0); setPat(i, v); });
  dec.addEventListener('click', () => { const v = valsOf(i); if (v.length <= 1) return; v.pop(); setPat(i, v); });
  document.addEventListener('param-change', e => { if (e.detail.target === 'st' + i + 'Pat') sync(); });
  sync();
}
