/* SubSDJ · gráfico de la envolvente ADSR (amp + filtro comparten A/D/S/R) */
import { engine } from '../engine/AudioEngine.js';

export function initADSRGraph(canvas) {
  const ctx = canvas.getContext('2d');
  const fit = () => { canvas.width = canvas.clientWidth || 220; canvas.height = canvas.clientHeight || 90; };

  function draw() {
    fit();
    const S = engine.S, w = canvas.width, h = canvas.height, pad = 8;
    ctx.clearRect(0, 0, w, h);

    const { a, d, s, r } = S;
    const susT = Math.max(0.15, (a + d + r) * 0.4);     // ancho visual del sustain
    const total = a + d + susT + r || 1;
    const X = t => pad + (t / total) * (w - 2 * pad);
    const Y = v => (h - pad) - v * (h - 2 * pad);

    // rejilla
    ctx.strokeStyle = 'rgba(125,138,153,.18)'; ctx.lineWidth = 1;
    ctx.strokeRect(pad, pad, w - 2 * pad, h - 2 * pad);

    const pts = [[0, 0], [a, 1], [a + d, s], [a + d + susT, s], [total, 0]];

    // relleno bajo la curva de amplitud
    ctx.beginPath(); ctx.moveTo(X(0), Y(0));
    pts.forEach(([t, v]) => ctx.lineTo(X(t), Y(v)));
    ctx.lineTo(X(total), Y(0)); ctx.closePath();
    ctx.fillStyle = 'rgba(57,212,163,.15)'; ctx.fill();

    // curva de amplitud
    ctx.lineWidth = 2; ctx.strokeStyle = '#39d4a3'; ctx.beginPath();
    pts.forEach(([t, v], i) => (i ? ctx.lineTo(X(t), Y(v)) : ctx.moveTo(X(t), Y(v))));
    ctx.stroke();

    // overlay de la envolvente de filtro (misma forma, escalada por el signo del amount)
    if (S.filterEnvAmt) {
      const sign = S.filterEnvAmt > 0 ? 1 : -1;
      const fp = sign > 0 ? pts : [[0, 1], [a, 0], [a + d, 1 - s], [a + d + susT, 1 - s], [total, 1]];
      ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5; ctx.strokeStyle = '#34c0ff';
      ctx.beginPath();
      fp.forEach(([t, v], i) => (i ? ctx.lineTo(X(t), Y(v)) : ctx.moveTo(X(t), Y(v))));
      ctx.stroke(); ctx.setLineDash([]);
    }

    // etiquetas de fase
    ctx.fillStyle = 'rgba(125,138,153,.8)'; ctx.font = '9px system-ui';
    ctx.fillText('A', X(a / 2), h - 2);
    ctx.fillText('D', X(a + d / 2), h - 2);
    ctx.fillText('S', X(a + d + susT / 2), h - 2);
    ctx.fillText('R', X(a + d + susT + r / 2), h - 2);
  }

  const WATCH = new Set(['a', 'd', 's', 'r', 'filterEnvAmt']);
  document.addEventListener('param-change', e => { if (WATCH.has(e.detail.target)) draw(); });
  window.addEventListener('resize', draw);
  draw();
}
