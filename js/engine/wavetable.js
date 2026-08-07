/* =====================================================================
   SubSDJ · wavetable — tablas de ondas band-limited con morph.
   Un SET = F frames; cada frame se define por su ESPECTRO (amplitudes con
   signo de los armónicos 1..H; el signo codifica fase 0/π, suficiente para
   las clásicas: el triángulo son impares alternos). De cada espectro se
   generan MIPS por síntesis aditiva: un nivel por octava con los armónicos
   truncados a su tope — así la nota aguda lee una tabla SIN parciales por
   encima de Nyquist y no hay aliasing (el equivalente tabulado del PolyBLEP).
   El morph interpola linealmente entre frames: combinación lineal de señales
   band-limited => sigue band-limited. Los niveles bajos usan tablas más
   cortas (len = 4·armónicos, suelo 256): memoria mínima por nodo.
   El pipeline es agnóstico del ORIGEN del espectro: aquí hay sets de fábrica;
   el editor (W2) y las expresiones (W3) solo tienen que producir frames.
   ===================================================================== */

export const WT_H = 512;                 // armónicos del nivel 0 (cubre hasta ~38 Hz sin recorte)
export const WT_FRAMES = 8;              // frames por set (el morph los recorre)
const CAPS = [512, 256, 128, 64, 32, 16, 8, 4, 2, 1];   // tope de armónicos por nivel (mip)
const LENS = CAPS.map(c => Math.max(256, 4 * c));       // longitud de tabla por nivel

// ---------- espectros de fábrica (generadores; n = armónico 1..H) ----------
const specOf = fn => { const a = new Float32Array(WT_H); for (let n = 1; n <= WT_H; n++) a[n - 1] = fn(n); return a; };
const seno     = () => specOf(n => n === 1 ? 1 : 0);
const triangulo= () => specOf(n => n % 2 ? (((n - 1) / 2) % 2 ? -1 : 1) / (n * n) : 0);
const sierra   = (h = WT_H) => specOf(n => n <= h ? 1 / n : 0);
const cuadrada = () => specOf(n => n % 2 ? 1 / n : 0);
const pulso    = d => specOf(n => (2 / (n * Math.PI)) * Math.sin(Math.PI * n * d));
const organo   = pesos => specOf(n => pesos[n] || 0);                       // drawbars: peso por armónico
const formante = (c, s = 0.35) => specOf(n =>                               // campana log-normal + fundamental
  (n === 1 ? 0.3 : 0) + Math.exp(-Math.pow(Math.log(n) - Math.log(c), 2) / (2 * s * s)) / n ** 0.3);
const METAL_PARTS = [1, 4, 7, 11, 15, 22, 29, 38];  // parciales dispersos: sabor "campana"
const metalica = tilt => specOf(n => METAL_PARTS.includes(n) ? Math.pow(n, tilt) : 0);

// F frames por mezcla lineal a trozos entre keyframes (mezclar espectros
// equivale a mezclar ondas: misma operación lineal).
function framesDesdeClaves(claves, F = WT_FRAMES) {
  const out = [];
  for (let f = 0; f < F; f++) {
    const t = f / (F - 1) * (claves.length - 1), i = Math.min(claves.length - 2, Math.floor(t)), w = t - i;
    const a = claves[i], b = claves[i + 1], s = new Float32Array(WT_H);
    for (let n = 0; n < WT_H; n++) s[n] = a[n] * (1 - w) + b[n] * w;
    out.push(s);
  }
  return out;
}

export const WT_SETS = {
  'analógica': () => framesDesdeClaves([seno(), triangulo(), sierra(64), sierra(), cuadrada(), pulso(0.25), pulso(0.12)]),
  'órgano':    () => framesDesdeClaves([
    organo({ 1: 1 }),
    organo({ 1: 1, 2: 0.6 }),
    organo({ 1: 1, 2: 0.5, 3: 0.35, 4: 0.25 }),
    organo({ 1: 1, 2: 0.7, 3: 0.9, 4: 0.5, 6: 0.4, 8: 0.35, 10: 0.2, 12: 0.15, 16: 0.1 }),
  ]),
  'formante':  () => framesDesdeClaves([formante(2), formante(4), formante(8), formante(16), formante(26)]),
  'metálica':  () => framesDesdeClaves([metalica(-0.9), metalica(-0.3), metalica(0.15)]),
};
export const WT_DEFAULT = 'analógica';

// ---------- espectro -> mips (aditiva con armónicos truncados) ----------
// spec: Float32Array de senos (sets de fábrica) o {sin, cos} (dibujadas:
// el coseno conserva la FASE de cada armónico y el dibujo se ve como se hizo).
const WT_RMS = 0.5;      // sonoridad objetivo por frame (la sierra clásica ronda 0.52)
const WT_PEAK = 0.95;    // tope anti-clipping: manda solo si la onda es muy puntiaguda

function mipsDeEspectro(spec) {
  const sinA = spec.sin || spec, cosA = spec.cos || null;
  // ganancia única por frame para TODOS los niveles: los mips agudos
  // conservan el volumen del timbre, solo pierden los parciales imposibles
  const levels = [];
  for (let L = 0; L < CAPS.length; L++) {
    const cap = CAPS[L], len = LENS[L], d = new Float32Array(len), w = 2 * Math.PI / len;
    for (let n = 1; n <= Math.min(cap, WT_H); n++) {
      const a = sinA[n - 1], b = cosA ? cosA[n - 1] : 0;
      if (!a && !b) continue;
      for (let i = 0; i < len; i++) d[i] += a * Math.sin(w * n * i) + (b ? b * Math.cos(w * n * i) : 0);
    }
    levels.push(d);
  }
  // Normalización por SONORIDAD (RMS), no por pico: un dibujo puntiagudo a
  // pico máximo suena a la mitad que una sierra al mismo pico (factor de
  // cresta) — era el "las tablas de usuario suenan bajitas". El pico solo
  // actúa de tope anti-clipping; si manda, es que la onda no puede sonar
  // más fuerte sin recortar (física, no timidez).
  let peak = 0, energia = 0;
  for (const v of levels[0]) { const x = Math.abs(v); if (x > peak) peak = x; energia += v * v; }
  const rms = Math.sqrt(energia / levels[0].length);
  const g = (rms > 1e-9 && peak > 1e-9) ? Math.min(WT_RMS / rms, WT_PEAK / peak) : 1;
  for (const d of levels) for (let i = 0; i < d.length; i++) d[i] *= g;
  return levels;
}

// ---------- tabla «usuario»: puntos dibujados a mano (editor de ondas) ----------
// La receta persistida son los PUNTOS (WE_P por frame, localStorage), nunca
// las muestras band-limited: puntos -> DFT corta (espectro CON fase: senos y
// cosenos) -> mips como cualquier set de fábrica.
export const WE_P = 256;                 // puntos por frame dibujado (128 armónicos máx: de sobra a mano)
export const WT_LS = 'subsdj.wavetable.usuario.v1';

export function espectroDe(points) {     // DFT corta: puntos -> {sin, cos} (sin DC: un osc no lleva offset)
  const P = points.length, H = Math.min(WT_H, (P >> 1) - 1);
  const sin = new Float32Array(WT_H), cos = new Float32Array(WT_H);
  let mean = 0; for (const v of points) mean += v; mean /= P;
  for (let n = 1; n <= H; n++) {
    let a = 0, b = 0;
    for (let i = 0; i < P; i++) {
      const ph = 2 * Math.PI * n * i / P, x = points[i] - mean;
      a += x * Math.sin(ph); b += x * Math.cos(ph);
    }
    sin[n - 1] = 2 * a / P; cos[n - 1] = 2 * b / P;
  }
  return { sin, cos };
}
export function puntosDeEspectro(spec, P = WE_P) {   // resíntesis (para Suavizar y pintar)
  const out = new Array(P).fill(0), sinA = spec.sin || spec, cosA = spec.cos || null;
  for (let n = 1; n <= Math.min(WT_H, P >> 1); n++) {
    const a = sinA[n - 1], b = cosA ? cosA[n - 1] : 0;
    if (!a && !b) continue;
    for (let i = 0; i < P; i++) {
      const ph = 2 * Math.PI * n * i / P;
      out[i] += a * Math.sin(ph) + (b ? b * Math.cos(ph) : 0);
    }
  }
  return out;
}
// Alinea la fase del FUNDAMENTAL a 0 (rotación circular en el tiempo:
// inaudible en solitario — la fase absoluta no se oye — pero evita que dos
// frames dibujados "en contrafase" se CANCELEN al morfear: el 50% de una
// onda y su inversa es el silencio). φn' = φn − n·φ1.
function alineaFase(spec) {
  const { sin, cos } = spec;
  if (Math.hypot(sin[0], cos[0]) < 1e-6) return spec;   // sin fundamental: nada que alinear
  const f1 = Math.atan2(cos[0], sin[0]);
  const s2 = new Float32Array(sin.length), c2 = new Float32Array(cos.length);
  for (let n = 1; n <= sin.length; n++) {
    const a = sin[n - 1], b = cos[n - 1];
    if (!a && !b) continue;
    const R = Math.hypot(a, b), ph = Math.atan2(b, a) - n * f1;
    s2[n - 1] = R * Math.cos(ph); c2[n - 1] = R * Math.sin(ph);
  }
  return { sin: s2, cos: c2 };
}

// La receta del preset (`wtUser`): los puntos dibujados como cadena compacta
// (milésimas separadas por comas; frames por ';'). Con esto el preset viaja
// AUTOCONTENIDO: la onda va dentro, no depende del localStorage de la máquina.
export function encodeUserFrames(frames) {
  return frames.map(f => Array.from(f, v => Math.round(v * 1000)).join(',')).join(';');
}
export function decodeUserFrames(str) {
  if (!str) return null;
  const fr = String(str).split(';').map(s => s.split(',').map(x => +x / 1000));
  if (!fr.length || fr.some(f => f.length !== WE_P || f.some(v => !Number.isFinite(v)))) return null;
  return fr;
}

export function defaultUserFrames() {    // sin nada dibujado: A = seno, B = sierra (algo que morfear)
  const a = new Array(WE_P), b = new Array(WE_P);
  for (let i = 0; i < WE_P; i++) { const t = i / WE_P; a[i] = Math.sin(2 * Math.PI * t); b[i] = 2 * t - 1; }
  return [a, b];
}
export function loadUserFrames() {
  try {
    const j = JSON.parse(localStorage.getItem(WT_LS));
    if (Array.isArray(j) && j.length && j.every(f => Array.isArray(f) && f.length === WE_P)) return j;
  } catch (e) {}
  return null;
}
export function saveUserFrames(frames) {
  try { localStorage.setItem(WT_LS, JSON.stringify(frames.map(f => [...f].map(v => +(+v).toFixed(3))))); } catch (e) {}
  cache.delete('usuario');               // la próxima nota reconstruye los mips
}
WT_SETS['usuario'] = () => (loadUserFrames() || defaultUserFrames()).map(p => alineaFase(espectroDe(p)));
export function invalidateUserSet() { cache.delete('usuario'); }   // tras tocar localStorage a mano (selftest)

// set construido y cacheado: { lens, frames: [ [Float32Array x niveles] x F ] }
const cache = new Map();
export function getWtSet(name) {
  const key = WT_SETS[name] ? name : WT_DEFAULT;
  if (!cache.has(key)) {
    const frames = WT_SETS[key]().map(mipsDeEspectro);
    // energía por frame y correlación entre vecinos (nivel 0): con ellas el
    // worklet aplana la sonoridad del morph — rms²(f) de la mezcla lineal es
    // fórmula cerrada y la ganancia compensa el bache de frames poco correlados
    const F = frames.length;
    const energia = new Float32Array(F), corr = new Float32Array(Math.max(1, F - 1));
    for (let i = 0; i < F; i++) {
      const d = frames[i][0]; let e = 0;
      for (let k = 0; k < d.length; k++) e += d[k] * d[k];
      energia[i] = e / d.length;
    }
    for (let i = 0; i + 1 < F; i++) {
      const A = frames[i][0], B = frames[i + 1][0];
      let s = 0; for (let k = 0; k < A.length; k++) s += A[k] * B[k];
      corr[i] = s / A.length;
    }
    cache.set(key, { h0: WT_H, lens: LENS.slice(), frames, energia, corr });
  }
  return cache.get(key);
}
