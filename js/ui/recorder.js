/* =====================================================================
   SubSDJ · grabador a WAV.
   Un worklet permanente cuelga del analyser (la misma señal que va a los
   altavoces) y acumula bloques mientras graba; al parar se codifica un
   WAV 16-bit estéreo y se descarga.
   ===================================================================== */
import { part } from '../engine/parts.js';

let node = null, chunksL = null, chunksR = null, recording = false, t0 = 0, timer = null;

export function encodeWav(cl, cr, sampleRate) {
  let n = 0; cl.forEach(c => { n += c.length; });
  const buf = new ArrayBuffer(44 + n * 4);                   // 16-bit × 2 canales
  const dv = new DataView(buf);
  const wstr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  wstr(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); wstr(8, 'WAVE');
  wstr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * 4, true);
  dv.setUint16(32, 4, true); dv.setUint16(34, 16, true);
  wstr(36, 'data'); dv.setUint32(40, n * 4, true);
  let o = 44;
  for (let c = 0; c < cl.length; c++) {
    const L = cl[c], R = cr[c] || L;
    for (let i = 0; i < L.length; i++) {
      const l = Math.max(-1, Math.min(1, L[i])), r = Math.max(-1, Math.min(1, R[i]));
      dv.setInt16(o, l * 32767, true); o += 2;
      dv.setInt16(o, r * 32767, true); o += 2;
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function startRec(btn) {
  if (!node) {
    node = new AudioWorkletNode(part().ctx, 'recorder-processor',
      { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    part().getAnalyser().connect(node);
    node.connect(part().ctx.destination);     // salida (silencio): garantiza que el grafo lo procese
    node.port.onmessage = (e) => { if (recording) { chunksL.push(e.data.L); chunksR.push(e.data.R); } };
  }
  chunksL = []; chunksR = [];
  recording = true; t0 = performance.now();
  node.port.postMessage('start');
  btn.classList.add('rec'); btn.textContent = 'Stop · 0 s';
  timer = setInterval(() => { btn.textContent = 'Stop · ' + Math.round((performance.now() - t0) / 1000) + ' s'; }, 500);
}

function stopRec(btn) {
  node.port.postMessage('stop');
  recording = false; clearInterval(timer);
  btn.classList.remove('rec'); btn.textContent = 'Record';
  const blob = encodeWav(chunksL, chunksR, part().ctx.sampleRate);
  const d = new Date(), p = x => String(x).padStart(2, '0');
  download(blob, `subsdj-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.wav`);
  chunksL = chunksR = null;
}

export function initRecorder() {
  const btn = document.getElementById('recBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    part().resume();
    if (!part().ready) return;
    if (recording) stopRec(btn); else startRec(btn);
  });
}
