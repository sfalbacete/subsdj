/* SubSDJ · gráfico de la envolvente ADSR (amp + filtro comparten A/D/S/R) */
import { part } from '../engine/parts.js';
import { token, tint } from './theme.js';
import { fitCanvas } from './frame.js';

export function initADSRGraph(canvas) {
  const ctx = canvas.getContext('2d');

  function draw() {
    const { w, h } = fitCanvas(canvas, ctx, 220, 90);   // px de diseño; backing store a dpr × zoom
    const S = part().S, pad = 8;
    ctx.clearRect(0, 0, w, h);

    const { a, d, s, r } = S;
    // env de filtro: tiempos propios (own) o los de amplitud (link)
    const own = S.fenvMode === 'own';
    const fa = own ? S.fa : a, fd = own ? S.fd : d, fs = own ? S.fs : s, fr = own ? S.fr : r;
    // flam (hits > 1): hits−1 ráfagas de hitGap antes del ADSR de amplitud (Voice._flam);
    // la envolvente del filtro no se desplaza (arranca con la nota, como en el motor)
    const nH = Math.round(S.hits || 1), gap = Math.max(0.005, S.hitGap || 0.012), flam = nH > 1 ? (nH - 1) * gap : 0;
    const susT = Math.max(0.15, Math.max(flam + a + d + r, fa + fd + fr) * 0.4);   // ancho visual del sustain
    const total = Math.max(flam + a + d + susT + r, fa + fd + susT + fr) || 1;
    const X = t => pad + (t / total) * (w - 2 * pad);
    const Y = v => (h - pad) - v * (h - 2 * pad);

    // rejilla
    ctx.strokeStyle = tint('--dim', .18); ctx.lineWidth = 1;
    ctx.strokeRect(pad, pad, w - 2 * pad, h - 2 * pad);

    // tramos A y D con la misma curva RC que el motor (envCurve 0 = rectas)
    const k = 6 * (S.envCurve || 0), den = 1 - Math.exp(-k);
    const seg = (t0, t1, v0, v1) => { const n = k > 0 ? 14 : 1, out = [];
      for (let i = 1; i <= n; i++) { const x = i / n; out.push([t0 + (t1 - t0) * x, v0 + (v1 - v0) * (k > 0 ? (1 - Math.exp(-k * x)) / den : x)]); }
      return out; };
    // release con la misma curva (Voice._relChain): recta a 0 con Curva 0, RC con Curva 1
    const rel = (t0, t1, v0) => { const n = k > 0 ? 14 : 1, out = [];
      for (let i = 1; i <= n; i++) { const x = i / n; out.push([t0 + (t1 - t0) * x, i === n ? 0 : v0 * (1 - (k > 0 ? (1 - Math.exp(-k * x)) / den : x))]); }
      return out; };
    const atkB = Math.min(a, gap / 3), bursts = [];
    for (let i = 0; i < nH - 1; i++) { const t0 = i * gap; bursts.push([t0, 0], [t0 + atkB, 1], ...rel(t0 + atkB, t0 + gap, 1)); }
    const A0 = flam;   // el ADSR arranca tras el flam
    const pts = [[0, 0], ...bursts, [A0, 0], ...seg(A0, A0 + a, 0, 1), ...seg(A0 + a, A0 + a + d, 1, s), [A0 + a + d + susT, s], ...rel(A0 + a + d + susT, A0 + a + d + susT + r, s)];

    // relleno bajo la curva de amplitud
    ctx.beginPath(); ctx.moveTo(X(0), Y(0));
    pts.forEach(([t, v]) => ctx.lineTo(X(t), Y(v)));
    ctx.lineTo(X(A0 + a + d + susT + r), Y(0)); ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad, 0, h - pad);
    grad.addColorStop(0, tint('--accent', .40));
    grad.addColorStop(0.55, tint('--accent', .14));
    grad.addColorStop(1, tint('--accent', .02));
    ctx.fillStyle = grad; ctx.fill();

    // curva de amplitud
    ctx.lineWidth = 2; ctx.strokeStyle = token('--accent'); ctx.beginPath();
    pts.forEach(([t, v], i) => (i ? ctx.lineTo(X(t), Y(v)) : ctx.moveTo(X(t), Y(v))));
    ctx.stroke();

    // overlay de la envolvente de filtro (tiempos propios si own; invertida si amount < 0)
    if (S.filterEnvAmt) {
      const up = S.filterEnvAmt > 0;
      const fp = [[0, 0], ...seg(0, fa, 0, 1), ...seg(fa, fa + fd, 1, fs), [fa + fd + susT, fs], ...rel(fa + fd + susT, fa + fd + susT + fr, fs)]
        .map(([t, v]) => [t, up ? v : 1 - v]);
      ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5; ctx.strokeStyle = token('--accent2');
      ctx.beginPath();
      fp.forEach(([t, v], i) => (i ? ctx.lineTo(X(t), Y(v)) : ctx.moveTo(X(t), Y(v))));
      ctx.stroke(); ctx.setLineDash([]);
    }

    // etiquetas de fase (sobre la envolvente de amplitud)
    ctx.fillStyle = tint('--dim', .8); ctx.font = '9px system-ui';
    ctx.fillText('A', X(A0 + a / 2), h - 2);
    ctx.fillText('D', X(A0 + a + d / 2), h - 2);
    ctx.fillText('S', X(A0 + a + d + susT / 2), h - 2);
    ctx.fillText('R', X(A0 + a + d + susT + r / 2), h - 2);
  }

  const WATCH = new Set(['a', 'd', 's', 'r', 'filterEnvAmt', 'fenvMode', 'fa', 'fd', 'fs', 'fr', 'envCurve', 'hits', 'hitGap']);
  document.addEventListener('param-change', e => { if (WATCH.has(e.detail.target)) draw(); });
  window.addEventListener('resize', draw);
  draw();
}
