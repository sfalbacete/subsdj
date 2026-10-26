/* SubSDJ · editor de ondas: dibuja a mano alzada los frames A/B de la tabla
   «usuario» (aparece en el selector de tabla de Osciladores; Morph = A→B).
   Se guarda la RECETA (los puntos, localStorage) y wavetable.js la convierte
   en espectro + mips band-limited. «Suavizar» atenúa armónicos altos EN EL
   ESPECTRO y resintetiza: suaviza el timbre, no solo el trazo. El frame que
   no se edita se pinta como fantasma para dibujar el morph con intención. */
import { part } from '../engine/parts.js';
import { CONTROLS } from './registry.js';
import { WE_P, loadUserFrames, saveUserFrames, defaultUserFrames, getWtSet,
         espectroDe, puntosDeEspectro, encodeUserFrames, decodeUserFrames } from '../engine/wavetable.js';
import { token, tint } from './theme.js';
import { fitCanvas } from './frame.js';

const SUAVE = n => 1 / (1 + Math.pow(n / 12, 1.6));   // rolloff por pulsación de «Suavizar»

export function initWaveEditor() {
  const cv = document.getElementById('weCanvas');
  if (!cv) return;
  const g = cv.getContext('2d');
  const frames = loadUserFrames() || defaultUserFrames();
  let cur = 0, dragging = false, last = null;

  function draw() {
    const { w, h } = fitCanvas(cv, g, 300, 96);   // px de diseño; backing store a dpr × zoom
    g.clearRect(0, 0, w, h);
    g.strokeStyle = tint('--dim', .25); g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    const path = (pts, color, width) => {
      g.strokeStyle = color; g.lineWidth = width; g.beginPath();
      for (let i = 0; i < WE_P; i++) {
        const x = i / (WE_P - 1) * w, y = (1 - pts[i]) * h / 2;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke(); g.lineWidth = 1;
    };
    path(frames[1 - cur], tint('--dim', .35), 1);        // el otro frame, de fantasma
    path(frames[cur], token(cur ? '--accent2' : '--accent'), 2);
  }

  function commit() {
    saveUserFrames(frames);
    try { getWtSet('user'); } catch (e) {}   // precalienta: la próxima nota ya lo lee
  }
  function paint(e) {
    const r = cv.getBoundingClientRect();
    const i = Math.max(0, Math.min(WE_P - 1, Math.round((e.clientX - r.left) / r.width * (WE_P - 1))));
    const v = Math.max(-1, Math.min(1, 1 - 2 * (e.clientY - r.top) / r.height));
    const pts = frames[cur];
    if (last && Math.abs(i - last.i) > 1) {     // interpola el tramo saltado por el arrastre rápido
      const d = i > last.i ? 1 : -1;
      for (let k = last.i + d; k !== i; k += d) pts[k] = last.v + (v - last.v) * (k - last.i) / (i - last.i);
    }
    pts[i] = v; last = { i, v };
    draw();
  }
  cv.addEventListener('pointerdown', e => { part().resume(); dragging = true; last = null; cv.setPointerCapture(e.pointerId); paint(e); e.preventDefault(); });
  cv.addEventListener('pointermove', e => { if (dragging) paint(e); });
  const end = e => { if (!dragging) return; dragging = false; last = null; try { cv.releasePointerCapture(e.pointerId); } catch (_) {} commit(); };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);

  // frame A/B (estado del editor, no del synth: fuera de CONTROLS a propósito)
  const seg = document.getElementById('weFrameSel');
  seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    seg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    cur = +b.dataset.wf; last = null; draw();
  }));
  seg.querySelector('button').classList.add('active');

  const setFrame = fn => { const p = frames[cur]; for (let i = 0; i < WE_P; i++) p[i] = fn(i / WE_P); commit(); draw(); };
  document.getElementById('weSine').addEventListener('click', () => setFrame(t => Math.sin(2 * Math.PI * t)));
  document.getElementById('weSaw').addEventListener('click', () => setFrame(t => 2 * t - 1));
  document.getElementById('weSmooth').addEventListener('click', () => {
    const sp = espectroDe(frames[cur]);
    for (let n = 1; n <= WE_P >> 1; n++) { sp.sin[n - 1] *= SUAVE(n); sp.cos[n - 1] *= SUAVE(n); }
    const pts = puntosDeEspectro(sp);
    let peak = 0; for (const v of pts) peak = Math.max(peak, Math.abs(v));
    const k = peak > 0.05 ? Math.min(1, 0.95 / peak) : 1;    // recupera nivel sin amplificar residuos
    for (let i = 0; i < WE_P; i++) frames[cur][i] = pts[i] * k;
    commit(); draw();
  });

  // Control VIRTUAL wtUser (sin DOM): mete la onda dibujada DENTRO del preset.
  // get: solo aporta la receta si el preset usa la tabla 'user' (los demás
  // presets no cargan con ~2.5 KB de puntos). set: '' = "no traigo onda,
  // respeta la dibujada" (es lo que aplica el Reset previo a cada carga).
  CONTROLS.wtUser = {
    get: () => part().S.wtSet === 'user' ? encodeUserFrames(frames) : '',
    set: v => {
      part().S.wtUser = v;                       // constancia en S (el motor no tiene case: dato de receta)
      if (!v) return;
      const fr = decodeUserFrames(v);
      if (!fr) return;
      frames.splice(0, frames.length, ...fr);
      commit(); draw();
    },
    def: '',
  };

  window.addEventListener('resize', draw);
  draw();
}
