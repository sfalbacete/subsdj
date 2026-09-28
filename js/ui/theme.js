/* SubSDJ · tokens de piel para los canvas (ADSR, osciloscopio y espectro,
   Seq, WaveSeq, editor de ondas). El CSS es la ÚNICA fuente de color: aquí
   solo se LEEN las variables del bloque de tokens (css/style.css) y se
   sirven como Canvas2D las entiende. El truco para normalizar: asignar
   cualquier color CSS a fillStyle y leerlo devuelve '#rrggbb' (o 'rgba(…)'
   si lleva alfa), así un token puede escribirse como hex, rgb(), hsl() o
   color-mix() sin que a los canvas les importe. Cache por nombre; se vacía
   con el evento «theme-changed» (lo emitirá el selector de tema). */
const probe = document.createElement('canvas').getContext('2d');
const cache = new Map();
document.addEventListener('theme-changed', () => cache.clear());

export function token(name) {            // '--accent' → '#39d4a3'
  let v = cache.get(name);
  if (v === undefined) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    probe.fillStyle = '#000'; probe.fillStyle = raw || '#000';   // un valor inválido deja el negro
    v = probe.fillStyle; cache.set(name, v);
  }
  return v;
}

function rgb(name) {                     // [r, g, b] 0..255
  const c = token(name);
  if (c[0] === '#') return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  return (c.match(/[\d.]+/g) || ['0', '0', '0']).slice(0, 3).map(Number);
}

export function tint(name, alpha) {      // ('--accent', .14) → 'rgba(57,212,163,0.14)': rejillas, rellenos, halos
  return `rgba(${rgb(name).join(',')},${alpha})`;
}

export function hue(name) {              // tono 0..360 del token (el espectro se colorea alrededor del acento)
  const [r, g, b] = rgb(name).map(x => x / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
