/* =====================================================================
   SubSDJ · pantalla de entrada — una intro de demoscene old-school.
   Todo a BAJA resolución (BW px de ancho, escalado con píxeles gordos, como
   en un Amiga) y calculado píxel a píxel cada fotograma:
     · fondo: PLASMA (suma de senos que se desplazan) con paleta cíclica, más
       la INTERFERENCIA de dos fuentes de ondas que se mueven en Lissajous:
       sus anillos se cruzan y dan el moiré;
     · el EMBLEMA del SubSDJ original (el icono del .exe de VB.Net): un aro
       con hueco y tres cuchillas curvas, dibujado como forma implícita
       (emblemAt) que gira; metal repujado — luz arriba a la izquierda,
       sombra abajo a la derecha — que refleja el plasma;
     · el NOMBRE relleno de barras de cobre (el «Copper» del Amiga: un color
       por línea que se desplaza) con sombra y un brillo que lo recorre;
     · un SCROLLER senoidal abajo;
     · la entrada: cada cosa aparece con un fundido de TRAMA ordenada (Bayer
       4×4), que es como se hacían los fundidos con pocos colores.
   Encima, nítidos (HTML): versión, fecha y el botón ENTRAR, que además
   arranca el audio (un navegador no deja sonar sin un gesto). Intro y
   Espacio también entran; mientras está, el teclado no toca notas.
   Fuera con ?selftest o ?nosplash (pruebas y capturas: tools/shot.mjs).
   ===================================================================== */
import { VERSION, RELEASE } from '../version.js';
import { part } from '../engine/parts.js';
import { setStatus } from './status.js';
import { tokenList } from './theme.js';

const BW = 400;                 // ancho del búfer de baja resolución (px «gordos»)
const TAU = Math.PI * 2;
const SIN_N = 2048, SIN = new Float32Array(SIN_N);
for (let i = 0; i < SIN_N; i++) SIN[i] = Math.sin(i / SIN_N * TAU);
const sn = x => SIN[((x * (SIN_N / TAU)) | 0) & (SIN_N - 1)];   // seno por tabla (x en radianes, cualquier signo)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];   // umbrales 4×4 (0..15)

// --- El emblema: 0 fuera · 1 metal · 2 hueco. Radio 1 = la punta de las cuchillas.
// Cada cuchilla es una media luna: un círculo menos otro igual desplazado en la
// tangente (y un poco hacia fuera); las tres, a 120°, salen del aro.
const EM = { hole: 0.15, ring: 0.30, d1: 0.47, r1: 0.50, t: 0.20, q: 0.06, r2: 0.50, rmax: 0.98 };
const BLADES = [0, 1, 2].map(k => {
  const a = k * TAU / 3 - Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
  const c1x = EM.d1 * ca, c1y = EM.d1 * sa;
  return { c1x, c1y, c2x: c1x - EM.t * sa + EM.q * ca, c2y: c1y + EM.t * ca + EM.q * sa };
});
export function emblemAt(x, y) {
  const r2 = x * x + y * y;
  if (r2 < EM.hole * EM.hole) return 2;
  if (r2 <= EM.ring * EM.ring) return 1;
  if (r2 > EM.rmax * EM.rmax) return 0;
  for (const b of BLADES) {
    const ax = x - b.c1x, ay = y - b.c1y, bx = x - b.c2x, by = y - b.c2y;
    if (ax * ax + ay * ay <= EM.r1 * EM.r1 && bx * bx + by * by > EM.r2 * EM.r2) return 1;
  }
  return 0;
}

// --- Paletas (256 entradas, Uint32 ABGR) a partir de paradas de color
const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function ramp(stops, cyclic) {
  const n = stops.length, out = [];
  for (let i = 0; i < 256; i++) {
    const x = i / 256 * (cyclic ? n : n - 1), k = Math.floor(x), f = x - k, a = rgb(stops[k % n]), b = rgb(stops[(k + 1) % n]);
    out.push(a.map((v, j) => v + (b[j] - v) * f));
  }
  return out;
}
// Las paradas viven en css/style.css (:root, --sp-plasma / --sp-metal / --sp-copper): los
// colores de la marca, en un solo sitio. Se leen al crear el primer efecto.
let PAL_BG, PAL_METAL, PAL_COPPER;
function palettes() {
  if (PAL_BG) return;
  PAL_BG = ramp(tokenList('--sp-plasma'), true); PAL_METAL = ramp(tokenList('--sp-metal'), false); PAL_COPPER = ramp(tokenList('--sp-copper'), true);
}
const pack = (c, k = 1) => (255 << 24) | (Math.min(255, c[2] * k) << 16) | (Math.min(255, c[1] * k) << 8) | Math.min(255, c[0] * k);

const SCROLL = '  SUBSDJ ' + VERSION + '  ···  UN SINTETIZADOR EN EL NAVEGADOR CON LA WEB AUDIO API, SIN DEPENDENCIAS NI PASO DE BUILD  ···  ' +
  'FM · TABLAS DE ONDAS · FORMANTES · RESONADORES · LFO A TEMPO · PASOS · PARTES Y MÚSICA GENERATIVA  ···  ' +
  'HEREDERO DEL VIEJO SUBSDJ HECHO EN VB.NET  ···  SALUDOS A @TACOWARS  ···  PULSA ENTRAR  ···  ';

export function splashDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(d).replace(/\./g, '').toUpperCase();
}

const ease = x => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3));
const back = x => { if (x <= 0) return 0; if (x >= 1) return 1; const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

export class SplashFx {
  constructor(canvas, vw = innerWidth, vh = innerHeight) {
    palettes();
    this.c = canvas; this.g = canvas.getContext('2d');
    this.stats = { emblem: 0, title: 0 };
    this.exitT = null;
    this.resize(vw, vh);
  }
  resize(vw, vh) {
    const W = BW, H = Math.max(150, Math.min(360, Math.round(BW * vh / vw)));
    this.W = W; this.H = H; this.c.width = W; this.c.height = H;
    this.img = this.g.createImageData(W, H); this.px = new Uint32Array(this.img.data.buffer);
    this.wide = W / H >= 1.3;
    // composición: emblema y nombre lado a lado en pantallas anchas; uno sobre otro si no
    this.em = this.wide ? { x: W * 0.235, y: H * 0.47, r: H * 0.27 } : { x: W * 0.5, y: H * 0.28, r: Math.min(W * 0.3, H * 0.2) };
    // el nombre, en el hueco que deja el emblema (a la derecha, o debajo), tan grande como quepa
    this.ti = this.wide ? { x0: this.em.x + this.em.r * 1.15, x1: W * 0.95, y: H * 0.42, size: Math.round(H * 0.24) }
                        : { x0: W * 0.08, x1: W * 0.92, y: H * 0.57, size: Math.round(H * 0.13) };
    this._titleMask();
    this.mask = new Uint8Array(W * H);
    this.vig = null;
  }
  _vignette() {                                                  // 0..256 por píxel: 1 en el centro, penumbra en los bordes
    const { W, H } = this, v = new Uint16Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = (x / W - 0.5) * 1.6, dy = (y / H - 0.5) * 1.9; v[y * W + x] = Math.round(256 * Math.max(0.25, 1 - 0.55 * (dx * dx + dy * dy))); }
    return v;
  }
  // El nombre, una vez: texto en un lienzo aparte → máscara de píxeles
  _titleMask() {
    const { W, H } = this, o = document.createElement('canvas'); o.width = W; o.height = H;
    const g = o.getContext('2d');
    g.fillStyle = 'white'; g.textAlign = 'center'; g.textBaseline = 'middle';   // solo es una máscara
    const font = sz => `900 ${sz}px "Arial Black", "Segoe UI Black", Impact, system-ui, sans-serif`;
    let sz = this.ti.size; g.font = font(sz);
    const avail = this.ti.x1 - this.ti.x0, w = g.measureText('SubSDJ').width;
    if (w > avail) { sz = Math.floor(sz * avail / w); g.font = font(sz); }
    this.ti.x = (this.ti.x0 + this.ti.x1) / 2;
    g.fillText('SubSDJ', this.ti.x, this.ti.y);
    const a = g.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H);
    let x0 = W, x1 = 0, y0 = H, y1 = 0;
    for (let i = 0; i < W * H; i++) if (a[i * 4 + 3] > 110) { m[i] = 1; const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    this.tmask = m; this.tbox = { x0, x1, y0, y1 };
  }
  // Dónde va el HTML (versión, fecha, botón): fracciones de la ventana
  uiAnchor() { return this.wide ? { x: this.ti.x / this.W, y: (this.tbox.y1 + this.H * 0.08) / this.H } : { x: 0.5, y: (this.tbox.y1 + this.H * 0.05) / this.H }; }

  frame(t) {
    const { W, H, px, em } = this;
    const ex = this.exitT !== null ? ease((t - this.exitT) / 0.45) : 0;   // salida: todo se enciende
    const fade = Math.min(1, t / 1.2) * (1 + ex * 1.6);
    const pal = new Uint32Array(256); for (let i = 0; i < 256; i++) pal[i] = pack(PAL_BG[i], fade * 0.78);   // el fondo, algo más oscuro que el logo
    const vig = this.vig || (this.vig = this._vignette());
    // fuentes de la interferencia (Lissajous) y centro del plasma radial
    const s1x = W * (0.5 + 0.34 * sn(t * 0.31)), s1y = H * (0.5 + 0.30 * sn(t * 0.43 + 1)), s2x = W * (0.5 + 0.36 * sn(t * 0.27 + 2)), s2y = H * (0.5 + 0.32 * sn(t * 0.37 + 4));
    const rcx = W * (0.5 + 0.25 * sn(t * 0.21)), rcy = H * (0.5 + 0.25 * sn(t * 0.17 + 3));
    const cyc = t * 34;
    for (let y = 0; y < H; y++) {
      const py = sn(y * 0.071 - t * 0.9), dy1 = y - s1y, dy2 = y - s2y, dyr = y - rcy;
      for (let x = 0; x < W; x++) {
        const dx1 = x - s1x, dx2 = x - s2x, dxr = x - rcx;
        const p = sn(x * 0.052 + t * 1.1) + py + sn((x + y) * 0.037 + t * 0.6) + sn(Math.sqrt(dxr * dxr + dyr * dyr) * 0.06 - t * 1.4);
        const k = sn(Math.sqrt(dx1 * dx1 + dy1 * dy1) * 0.33 - t * 2.6) + sn(Math.sqrt(dx2 * dx2 + dy2 * dy2) * 0.33 - t * 2.6);
        const c = pal[((p + 4) * 22 + k * 20 + cyc) & 255], v = vig[y * W + x];   // viñeta: bordes en penumbra
        px[y * W + x] = (255 << 24) | ((((c >> 16) & 255) * v >> 8) << 16) | ((((c >> 8) & 255) * v >> 8) << 8) | ((c & 255) * v >> 8);
      }
    }
    // --- el emblema: entra con trama, girando deprisa y frenando
    const eIn = Math.max(0, Math.min(1, (t - 0.5) / 1.1)), thr = eIn * 16;
    if (eIn > 0) {
      const R = em.r * (0.65 + 0.35 * back(eIn)) * (1 + ex * 0.25), ang = t * 0.32 + 5 * Math.pow(1 - ease(eIn), 2);
      const ca = Math.cos(-ang), sa = Math.sin(-ang), mask = this.mask;
      const bx0 = Math.max(1, Math.floor(em.x - R - 2)), bx1 = Math.min(W - 2, Math.ceil(em.x + R + 2));
      const by0 = Math.max(1, Math.floor(em.y - R - 2)), by1 = Math.min(H - 2, Math.ceil(em.y + R + 2));
      for (let y = by0 - 1; y <= by1 + 1; y++) for (let x = bx0 - 1; x <= bx1 + 1; x++) {
        const u = (x - em.x) / R, v = (y - em.y) / R;
        mask[y * W + x] = emblemAt(u * ca - v * sa, u * sa + v * ca);
      }
      let n = 0;
      const shine = (t * 0.55) % 3 - 1;                                   // destello diagonal que cruza cada ~5 s
      for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
        const i = y * W + x, m = mask[i];
        if (BAYER[(y & 3) * 4 + (x & 3)] >= thr) continue;
        if (m === 1) {
          n++;
          let c;
          if (mask[i - W - 1] !== 1) c = 245;                              // canto iluminado (arriba-izquierda)
          else if (mask[i + W + 1] !== 1) c = 34;                          // canto en sombra (abajo-derecha)
          else {
            const r = Math.hypot(x - em.x, y - em.y) / R, refl = sn(x * 0.09 + y * 0.05 + t * 1.3) + sn(y * 0.11 - t);
            c = 118 + refl * 34 - r * 38;
            const d = (x - em.x + y - em.y) / (2 * R) - shine; if (d > -0.08 && d < 0.08) c += 90 * (1 - Math.abs(d) / 0.08);
          }
          px[i] = pack(PAL_METAL[Math.max(0, Math.min(255, c | 0))], 0.85 + 0.15 * fade);
        } else if (m === 2) px[i] = ((px[i] >> 2) & 0x3f3f3f) | (255 << 24);   // hueco: el plasma, apagado
        else if (mask[i - 1] === 1 || mask[i + 1] === 1 || mask[i - W] === 1 || mask[i + W] === 1) px[i] = 0xff040808;   // contorno
      }
      this.stats.emblem = n;
    }
    // --- el nombre: cobre que sube, sombra y brillo; entra con trama
    const tIn = Math.max(0, Math.min(1, (t - 1.4) / 0.9)), tthr = tIn * 16;
    if (tIn > 0) {
      const tm = this.tmask, { x0, x1, y0, y1 } = this.tbox, sh = Math.max(1, Math.round(H / 110));
      const swp = ((t - 1.4) * 0.45) % 2.6 - 0.3;                          // brillo que recorre el nombre
      let n = 0;
      for (let y = y0 - 1; y <= y1 + sh + 1; y++) for (let x = x0 - 1; x <= x1 + sh + 1; x++) {
        if (y < 1 || y >= H - 1 || x < 1 || x >= W - 1) continue;
        const i = y * W + x;
        if (BAYER[(y & 3) * 4 + (x & 3)] >= tthr) continue;
        if (tm[i]) {
          n++;
          let c = pack(PAL_COPPER[(((y - y0) * 7 - t * 70) | 0) & 255]);
          if (!tm[i - W] || !tm[i - 1]) c = 0xffffffff;                     // canto de luz
          else if (!tm[i + W]) c = ((c >> 1) & 0x7f7f7f) | (255 << 24);
          const f = (x - x0) / (x1 - x0 + 1) - swp + (y - y0) * 0.004; if (f > 0 && f < 0.06) c = 0xffffffff;
          px[i] = c;
        } else if (tm[i - sh * W - sh]) px[i] = ((px[i] >> 2) & 0x3f3f3f) | (255 << 24);   // sombra arrojada
      }
      this.stats.title = n;
    }
    this.g.putImageData(this.img, 0, 0);
    // --- scroller senoidal (texto del lienzo, a baja resolución: píxel gordo)
    if (t > 2.2) {
      const g = this.g, fs = Math.max(8, Math.round(H / 27)), base = H - fs * 1.6;
      g.font = `bold ${fs}px "Courier New", monospace`; g.textBaseline = 'middle';
      const cw = fs * 0.62, off = ((t - 2.2) * 46) % (SCROLL.length * cw);
      g.globalAlpha = Math.min(1, (t - 2.2) / 0.8) * (1 - ex);
      for (let k = 0; k < SCROLL.length; k++) {
        const x = W - off + k * cw; if (x < -cw || x > W) continue;
        const y = base + Math.sin(x * 0.045 + t * 3.1) * fs * 0.55;
        g.fillStyle = 'black'; g.fillText(SCROLL[k], x + 1, y + 1);
        const c = PAL_COPPER[((x * 1.6 + t * 90) | 0) & 255]; g.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
        g.fillText(SCROLL[k], x, y);
      }
      g.globalAlpha = 1;
    }
  }
}

export function initSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  const q = new URLSearchParams(location.search);
  if (q.has('selftest') || q.has('nosplash')) { el.remove(); return; }
  const canvas = el.querySelector('canvas'), ui = el.querySelector('.sp-ui'), btn = el.querySelector('#spEnter');
  el.querySelector('#spVer').textContent = 'v' + VERSION;
  el.querySelector('#spDate').textContent = splashDate(RELEASE);
  const fx = new SplashFx(canvas);
  const place = () => { const a = fx.uiAnchor(); ui.style.left = (a.x * 100) + '%'; ui.style.top = (a.y * 100) + '%'; };
  place();
  addEventListener('resize', () => { fx.resize(innerWidth, innerHeight); place(); });
  let t0 = null, raf = 0, gone = false;
  const loop = now => {
    if (t0 === null) t0 = now;
    const t = (now - t0) / 1000;
    fx.frame(t);
    if (t > 2.0) ui.classList.add('show');
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  const enter = () => {
    if (gone) return; gone = true;
    try {                                                     // el gesto que el navegador pide para sonar
      const e = part();
      if (e && e.ctx && e.ctx.state === 'suspended') e.ctx.resume().then(() => setStatus('powerInfo', 'on', 'audio activo')).catch(() => {});
    } catch (err) {}
    fx.exitT = (performance.now() - (t0 ?? performance.now())) / 1000;
    el.classList.add('out');
    removeEventListener('keydown', keys, true);
    setTimeout(() => { cancelAnimationFrame(raf); el.remove(); }, 520);
  };
  const keys = e => {                                         // mientras está la intro, el teclado no toca notas
    if (e.key === 'Enter' || e.key === ' ') enter();
    e.stopImmediatePropagation(); e.preventDefault();   // también frente a otros listeners de window (el teclado escucha ahí)
  };
  addEventListener('keydown', keys, true);
  btn.addEventListener('click', enter);
  btn.focus({ preventScroll: true });
}
