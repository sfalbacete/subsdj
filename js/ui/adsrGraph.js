/* SubSDJ · gráfico de la envolvente ADSR (amp + filtro comparten A/D/S/R) */
import { part } from '../engine/parts.js';

export function initADSRGraph(canvas) {
  const ctx = canvas.getContext('2d');
  const fit = () => { canvas.width = canvas.clientWidth || 220; canvas.height = canvas.clientHeight || 90; };

  function draw() {
    fit();
    const S = part().S, w = canvas.width, h = canvas.height, pad = 8;
    ctx.clearRect(0, 0, w, h);

    const { a, d, s, r } = S;
    // env de filtro: tiempos propios (own) o los de amplitud (link)
    const own = S.fenvMode === 'own';
    const fa = own ? S.fa : a, fd = own ? S.fd : d, fs = own ? S.fs : s, fr = own ? S.fr : r;
    const susT = Math.max(0.15, Math.max(a + d + r, fa + fd + fr) * 0.4);   // ancho visual del sustain
    const total = Math.max(a + d + susT + r, fa + fd + susT + fr) || 1;
    const X = t => pad + (t / total) * (w - 2 * pad);
    const Y = v => (h - pad) - v * (h - 2 * pad);

    // rejilla
    ctx.strokeStyle = 'rgba(125,138,153,.18)'; ctx.lineWidth = 1;
    ctx.strokeRect(pad, pad, w - 2 * pad, h - 2 * pad);

    // tramos A y D con la misma curva RC que el motor (envCurve 0 = rectas)
    const k = 6 * (S.envCurve || 0), den = 1 - Math.exp(-k);
    const seg = (t0, t1, v0, v1) => { const n = k > 0 ? 14 : 1, out = [];
      for (let i = 1; i <= n; i++) { const x = i / n; out.push([t0 + (t1 - t0) * x, v0 + (v1 - v0) * (k > 0 ? (1 - Math.exp(-k * x)) / den : x)]); }
      return out; };
    // release: el motor hace setTargetAtTime(0, t, r/4) (Voice.release), exponencial SIEMPRE
    // (no depende del knob Curva): v = s·e^(−4x); a x = 1 queda s·e⁻⁴ ≈ 2 %, se cierra a 0.
    const rel = (t0, t1, v0) => { const n = 14, out = [];
      for (let i = 1; i <= n; i++) { const x = i / n; out.push([t0 + (t1 - t0) * x, i === n ? 0 : v0 * Math.exp(-4 * x)]); }
      return out; };
    const pts = [[0, 0], ...seg(0, a, 0, 1), ...seg(a, a + d, 1, s), [a + d + susT, s], ...rel(a + d + susT, a + d + susT + r, s)];

    // relleno bajo la curva de amplitud
    ctx.beginPath(); ctx.moveTo(X(0), Y(0));
    pts.forEach(([t, v]) => ctx.lineTo(X(t), Y(v)));
    ctx.lineTo(X(a + d + susT + r), Y(0)); ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad, 0, h - pad);
    grad.addColorStop(0, 'rgba(57,212,163,.40)');
    grad.addColorStop(0.55, 'rgba(57,212,163,.14)');
    grad.addColorStop(1, 'rgba(57,212,163,.02)');
    ctx.fillStyle = grad; ctx.fill();

    // curva de amplitud
    ctx.lineWidth = 2; ctx.strokeStyle = '#39d4a3'; ctx.beginPath();
    pts.forEach(([t, v], i) => (i ? ctx.lineTo(X(t), Y(v)) : ctx.moveTo(X(t), Y(v))));
    ctx.stroke();

    // overlay de la envolvente de filtro (tiempos propios si own; invertida si amount < 0)
    if (S.filterEnvAmt) {
      const up = S.filterEnvAmt > 0;
      const fp = [[0, 0], ...seg(0, fa, 0, 1), ...seg(fa, fa + fd, 1, fs), [fa + fd + susT, fs], ...rel(fa + fd + susT, fa + fd + susT + fr, fs)]
        .map(([t, v]) => [t, up ? v : 1 - v]);
      ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5; ctx.strokeStyle = '#34c0ff';
      ctx.beginPath();
      fp.forEach(([t, v], i) => (i ? ctx.lineTo(X(t), Y(v)) : ctx.moveTo(X(t), Y(v))));
      ctx.stroke(); ctx.setLineDash([]);
    }

    // etiquetas de fase (sobre la envolvente de amplitud)
    ctx.fillStyle = 'rgba(125,138,153,.8)'; ctx.font = '9px system-ui';
    ctx.fillText('A', X(a / 2), h - 2);
    ctx.fillText('D', X(a + d / 2), h - 2);
    ctx.fillText('S', X(a + d + susT / 2), h - 2);
    ctx.fillText('R', X(a + d + susT + r / 2), h - 2);
  }

  const WATCH = new Set(['a', 'd', 's', 'r', 'filterEnvAmt', 'fenvMode', 'fa', 'fd', 'fs', 'fr', 'envCurve']);
  document.addEventListener('param-change', e => { if (WATCH.has(e.detail.target)) draw(); });
  window.addEventListener('resize', draw);
  draw();
}
