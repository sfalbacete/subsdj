/* SubSDJ · osciloscopio (dominio del tiempo) + analizador de espectro del
   máster, en la pantalla «Salida» (lo que suena: todas las partes). Canvas a
   resolución física (devicePixelRatio × zoom del instrumento). */
import { part } from '../engine/parts.js';
import { token, tint, hue } from './theme.js';
import { uiZoom } from './frame.js';

const dpr = () => (window.devicePixelRatio || 1) * uiZoom();   // px físicos por px de diseño (el instrumento va escalado)
function fit(c) { c.width = Math.round((c.clientWidth || 170) * dpr()); c.height = Math.round((c.clientHeight || 36) * dpr()); }

export function initScope(scopeCanvas, specCanvas) {
  const sctx = scopeCanvas.getContext('2d');
  const fctx = specCanvas.getContext('2d');
  const resize = () => { fit(scopeCanvas); fit(specCanvas); };
  resize(); window.addEventListener('resize', resize);

  let timeData = null, freqData = null;

  function drawScope(data) {
    const w = scopeCanvas.width, h = scopeCanvas.height;
    sctx.clearRect(0, 0, w, h);
    sctx.strokeStyle = tint('--dim', .25);
    sctx.beginPath(); sctx.moveTo(0, h / 2); sctx.lineTo(w, h / 2); sctx.stroke();
    sctx.lineWidth = 1.4 * dpr(); sctx.strokeStyle = token('--accent'); sctx.beginPath();
    const n = data.length;
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1) * w, y = (1 - data[i] / 255) * h;
      i ? sctx.lineTo(x, y) : sctx.moveTo(x, y);
    }
    sctx.stroke();
  }

  function drawSpectrum(data) {
    const w = specCanvas.width, h = specCanvas.height, bins = data.length;
    fctx.clearRect(0, 0, w, h);
    const bars = Math.min(64, bins), bw = w / bars, h0 = hue('--accent');   // vira alrededor del tono del acento
    for (let i = 0; i < bars; i++) {
      const idx = Math.min(bins - 1, Math.floor(Math.pow(i / bars, 2) * bins)); // énfasis en graves
      const v = data[idx] / 255, bh = v * h;
      fctx.fillStyle = `hsl(${h0 - v * 45}, 80%, ${28 + v * 32}%)`;
      fctx.fillRect(i * bw, h - bh, Math.max(1, bw - dpr()), bh);
    }
  }

  function frame() {
    requestAnimationFrame(frame);
    const an = part().getAnalyser();
    if (!an) return;
    if (!timeData) { timeData = new Uint8Array(an.fftSize); freqData = new Uint8Array(an.frequencyBinCount); }
    an.getByteTimeDomainData(timeData); drawScope(timeData);
    an.getByteFrequencyData(freqData); drawSpectrum(freqData);
  }
  frame();
}
