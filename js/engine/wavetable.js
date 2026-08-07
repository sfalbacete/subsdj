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
function mipsDeEspectro(spec) {
  // ganancia única por frame (pico del nivel 0 a 0.9): los niveles agudos
  // conservan el volumen del timbre, solo pierden los parciales imposibles
  const levels = [];
  for (let L = 0; L < CAPS.length; L++) {
    const cap = CAPS[L], len = LENS[L], d = new Float32Array(len), w = 2 * Math.PI / len;
    for (let n = 1; n <= Math.min(cap, WT_H); n++) {
      const a = spec[n - 1];
      if (!a) continue;
      for (let i = 0; i < len; i++) d[i] += a * Math.sin(w * n * i);
    }
    levels.push(d);
  }
  let peak = 0;
  for (const v of levels[0]) { const x = Math.abs(v); if (x > peak) peak = x; }
  const g = peak > 1e-9 ? 0.9 / peak : 1;
  for (const d of levels) for (let i = 0; i < d.length; i++) d[i] *= g;
  return levels;
}

// set construido y cacheado: { lens, frames: [ [Float32Array x niveles] x F ] }
const cache = new Map();
export function getWtSet(name) {
  const key = WT_SETS[name] ? name : WT_DEFAULT;
  if (!cache.has(key)) {
    const frames = WT_SETS[key]().map(mipsDeEspectro);
    cache.set(key, { h0: WT_H, lens: LENS.slice(), frames });
  }
  return cache.get(key);
}
