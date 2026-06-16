/* SubSDJ · osciloscopio (dominio del tiempo) + analizador de espectro */
import { engine } from '../engine/AudioEngine.js';

function fit(c) { c.width = c.clientWidth || 300; c.height = c.clientHeight || 90; }

export function initScope(scopeCanvas, specCanvas) {
  const sctx = scopeCanvas.getContext('2d');
  const fctx = specCanvas.getContext('2d');
  const resize = () => { fit(scopeCanvas); fit(specCanvas); };
  resize(); window.addEventListener('resize', resize);

  let timeData = null, freqData = null;

  function drawScope(data) {
    const w = scopeCanvas.width, h = scopeCanvas.height;
    sctx.clearRect(0, 0, w, h);
    sctx.strokeStyle = 'rgba(125,138,153,.25)';
    sctx.beginPath(); sctx.moveTo(0, h / 2); sctx.lineTo(w, h / 2); sctx.stroke();
    sctx.lineWidth = 2; sctx.strokeStyle = '#39d4a3'; sctx.beginPath();
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
    const bars = Math.min(96, bins), bw = w / bars;
    for (let i = 0; i < bars; i++) {
      const idx = Math.min(bins - 1, Math.floor(Math.pow(i / bars, 2) * bins)); // énfasis en graves
      const v = data[idx] / 255, bh = v * h;
      fctx.fillStyle = `hsl(${165 - v * 45}, 80%, ${28 + v * 32}%)`;
      fctx.fillRect(i * bw, h - bh, bw - 1, bh);
    }
  }

  function frame() {
    requestAnimationFrame(frame);
    const an = engine.getAnalyser();
    if (!an) return;
    if (!timeData) { timeData = new Uint8Array(an.fftSize); freqData = new Uint8Array(an.frequencyBinCount); }
    an.getByteTimeDomainData(timeData); drawScope(timeData);
    an.getByteFrequencyData(freqData); drawSpectrum(freqData);
  }
  frame();
}
