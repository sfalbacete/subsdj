/* =====================================================================
   SubSDJ · pantalla de entrada — una ventana modal sobre el instrumento
   (que se ve detrás, apagado). Arriba, una pantallita de demoscene
   old-school a baja resolución (BW × BH, escalada a píxel doble):
     · fondo: PLASMA (suma de senos que se desplazan) con paleta cíclica, más
       la INTERFERENCIA de dos fuentes de ondas que se mueven en Lissajous:
       sus anillos se cruzan y dan el moiré;
     · el NOMBRE relleno de barras de cobre (el «Copper» del Amiga: un color
       por línea que se desplaza), con canto de luz, sombra y un brillo que lo
       recorre; entra con un fundido de TRAMA ordenada (Bayer 4×4), que es
       como se hacían los fundidos con pocos colores.
   Debajo, en HTML: el botón ENTRAR, que además arranca el audio (un
   navegador no deja sonar sin un gesto), y al pie la versión, su fecha
   (RELEASE), el código y la licencia. Intro también entra; mientras está,
   el teclado no toca notas. La ventana se escala con el instrumento.
   Fuera con ?selftest o ?nosplash (pruebas y capturas: tools/shot.mjs).
   ===================================================================== */
import { VERSION, RELEASE } from '../version.js';
import { part } from '../engine/parts.js';
import { setStatus } from './status.js';
import { tokenList } from './theme.js';
import { uiZoom } from './frame.js';

const BW = 168, BH = 66;        // búfer de baja resolución (se ve a 336 × 132: píxel doble)
const TAU = Math.PI * 2;
const SIN_N = 2048, SIN = new Float32Array(SIN_N);
for (let i = 0; i < SIN_N; i++) SIN[i] = Math.sin(i / SIN_N * TAU);
const sn = x => SIN[((x * (SIN_N / TAU)) | 0) & (SIN_N - 1)];   // seno por tabla (x en radianes, cualquier signo)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];   // umbrales 4×4 (0..15)

// --- Paletas (256 entradas) a partir de paradas de color. Las paradas viven en
// css/style.css (:root, --sp-plasma / --sp-copper): los colores de la marca, en un
// solo sitio; se leen al crear el primer efecto.
const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function ramp(stops, cyclic) {
  const n = stops.length, out = [];
  for (let i = 0; i < 256; i++) {
    const x = i / 256 * (cyclic ? n : n - 1), k = Math.floor(x), f = x - k, a = rgb(stops[k % n]), b = rgb(stops[(k + 1) % n]);
    out.push(a.map((v, j) => v + (b[j] - v) * f));
  }
  return out;
}
let PAL_BG, PAL_COPPER;
function palettes() {
  if (PAL_BG) return;
  PAL_BG = ramp(tokenList('--sp-plasma'), true); PAL_COPPER = ramp(tokenList('--sp-copper'), true);
}
const pack = (c, k = 1) => (255 << 24) | (Math.min(255, c[2] * k) << 16) | (Math.min(255, c[1] * k) << 8) | Math.min(255, c[0] * k);
const dim = (c, s) => (255 << 24) | ((((c >> 16) & 255) * s >> 8) << 16) | ((((c >> 8) & 255) * s >> 8) << 8) | ((c & 255) * s >> 8);

export function splashDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(d).replace(/\./g, '');
}
const ease = x => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3));

export class SplashFx {
  constructor(canvas) {
    palettes();
    this.c = canvas; this.g = canvas.getContext('2d');
    this.W = BW; this.H = BH; canvas.width = BW; canvas.height = BH;
    this.img = this.g.createImageData(BW, BH); this.px = new Uint32Array(this.img.data.buffer);
    this.stats = { title: 0 };
    this.exitT = null;
    this._titleMask();
    const v = new Uint16Array(BW * BH);                          // viñeta + líneas de barrido: un poco de tubo
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
      const dx = (x / BW - 0.5) * 1.5, dy = (y / BH - 0.5) * 1.8;
      v[y * BW + x] = Math.round(256 * Math.max(0.3, 1 - 0.5 * (dx * dx + dy * dy)) * (y & 1 ? 0.86 : 1));
    }
    this.vig = v;
  }
  // El nombre, una vez: texto en un lienzo aparte → máscara de píxeles, tan grande como quepa
  _titleMask() {
    const { W, H } = this, o = document.createElement('canvas'); o.width = W; o.height = H;
    const g = o.getContext('2d');
    g.fillStyle = 'white'; g.textAlign = 'center'; g.textBaseline = 'middle';   // solo es una máscara
    const font = sz => `900 ${sz}px "Arial Black", "Segoe UI Black", Impact, system-ui, sans-serif`;
    let sz = Math.round(H * 0.46); g.font = font(sz);
    const w = g.measureText('SubSDJ').width, avail = W * 0.84;
    if (w > avail) { sz = Math.floor(sz * avail / w); g.font = font(sz); }
    g.fillText('SubSDJ', W / 2, H * 0.5);
    const a = g.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H);
    let x0 = W, x1 = 0, y0 = H, y1 = 0;
    for (let i = 0; i < W * H; i++) if (a[i * 4 + 3] > 110) { m[i] = 1; const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    this.tmask = m; this.tbox = { x0, x1, y0, y1 };
  }

  frame(t) {
    const { W, H, px, vig } = this;
    const ex = this.exitT !== null ? ease((t - this.exitT) / 0.4) : 0;   // salida: todo se enciende
    const fade = Math.min(1, t / 1.0) * 0.8 * (1 + ex * 1.5);
    const pal = new Uint32Array(256); for (let i = 0; i < 256; i++) pal[i] = pack(PAL_BG[i], fade);
    // fuentes de la interferencia (Lissajous) y centro del plasma radial
    const s1x = W * (0.5 + 0.38 * sn(t * 0.31)), s1y = H * (0.5 + 0.34 * sn(t * 0.43 + 1)), s2x = W * (0.5 + 0.40 * sn(t * 0.27 + 2)), s2y = H * (0.5 + 0.36 * sn(t * 0.37 + 4));
    const rcx = W * (0.5 + 0.3 * sn(t * 0.21)), rcy = H * (0.5 + 0.3 * sn(t * 0.17 + 3));
    const cyc = t * 34;
    for (let y = 0; y < H; y++) {
      const py = sn(y * 0.16 - t * 0.9), dy1 = y - s1y, dy2 = y - s2y, dyr = y - rcy;
      for (let x = 0; x < W; x++) {
        const dx1 = x - s1x, dx2 = x - s2x, dxr = x - rcx;
        const p = sn(x * 0.11 + t * 1.1) + py + sn((x + y) * 0.08 + t * 0.6) + sn(Math.sqrt(dxr * dxr + dyr * dyr) * 0.13 - t * 1.4);
        const k = sn(Math.sqrt(dx1 * dx1 + dy1 * dy1) * 0.62 - t * 2.6) + sn(Math.sqrt(dx2 * dx2 + dy2 * dy2) * 0.62 - t * 2.6);
        const i = y * W + x;
        px[i] = dim(pal[((p + 4) * 22 + k * 20 + cyc) & 255], vig[i]);
      }
    }
    // --- el nombre: cobre que sube, canto de luz, sombra y brillo; entra con trama
    const tIn = Math.max(0, Math.min(1, (t - 0.5) / 0.9)), thr = tIn * 16;
    if (tIn > 0) {
      const tm = this.tmask, { x0, x1, y0, y1 } = this.tbox, span = 256 / Math.max(1, y1 - y0) * 0.7;
      const swp = ((t - 0.5) * 0.4) % 2.4 - 0.3;                           // brillo que recorre el nombre
      let n = 0;
      for (let y = Math.max(1, y0 - 1); y <= Math.min(H - 2, y1 + 2); y++) for (let x = Math.max(1, x0 - 1); x <= Math.min(W - 2, x1 + 2); x++) {
        const i = y * W + x;
        if (BAYER[(y & 3) * 4 + (x & 3)] >= thr) continue;
        if (tm[i]) {
          n++;
          let c = pack(PAL_COPPER[(((y - y0) * span - t * 60) | 0) & 255], 1 + ex);
          if (!tm[i - W] || !tm[i - 1]) c = 0xffffffff;                     // canto de luz
          else if (!tm[i + W]) c = dim(c, 140);
          const f = (x - x0) / (x1 - x0 + 1) - swp + (y - y0) * 0.01; if (f > 0 && f < 0.07) c = 0xffffffff;
          px[i] = c;
        } else if (tm[i - W - 1]) px[i] = dim(px[i], 64);                  // sombra arrojada
      }
      this.stats.title = n;
    }
    this.g.putImageData(this.img, 0, 0);
  }
}

// Una sola ventana en la página: se abre al cargar (entrada: ENTRAR arranca el audio)
// y se reabre como «Acerca de» (el título de la cabecera, el menú Archivo): VOLVER,
// Escape o un clic fuera la cierran. Al cerrar se OCULTA (no se borra) y se para el efecto.
let open = () => {};
export const openSplash = (about = true) => open(about);

export function initSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  const card = el.querySelector('.sp-card'), btn = el.querySelector('#spEnter'), label = btn.querySelector('span');
  el.querySelector('#spVer').textContent = 'v' + VERSION;
  el.querySelector('#spDate').textContent = splashDate(RELEASE);
  const fx = new SplashFx(el.querySelector('canvas'));
  const scale = () => { card.style.zoom = uiZoom(); };          // a la escala del instrumento (en una 4K al 150 %, ~1,3)
  let t0 = null, raf = 0, shown = false, about = false, timer = 0;
  const loop = now => {
    if (t0 === null) t0 = now;
    fx.frame((now - t0) / 1000);
    raf = requestAnimationFrame(loop);
  };
  // Mientras está la ventana, el teclado no toca notas. Se registra UNA vez, aquí, antes que el
  // teclado (que también escucha en captura sobre window): el primero registrado, el primero en oír.
  const keys = e => {
    if (!shown) return;
    if (e.key === 'Enter' || e.key === ' ' || (about && e.key === 'Escape')) close();
    e.stopImmediatePropagation(); e.preventDefault();          // también frente a otros listeners de window (el teclado escucha ahí)
  };
  function close() {
    if (!shown) return; shown = false;
    if (!about) try {                                         // la entrada: el gesto que el navegador pide para sonar
      const e = part();
      if (e && e.ctx && e.ctx.state === 'suspended') e.ctx.resume().then(() => setStatus('powerInfo', 'on', 'audio on')).catch(() => {});
    } catch (err) {}
    fx.exitT = (performance.now() - (t0 ?? performance.now())) / 1000;
    el.classList.add('out');
    removeEventListener('resize', scale);
    timer = setTimeout(() => { cancelAnimationFrame(raf); el.hidden = true; }, 460);
  }
  open = (asAbout) => {
    if (shown) return; shown = true; about = asAbout;
    clearTimeout(timer); cancelAnimationFrame(raf);
    label.textContent = about ? 'BACK' : 'ENTER';
    fx.exitT = null; t0 = null;
    el.hidden = false; el.classList.remove('out');
    scale(); addEventListener('resize', scale);
    raf = requestAnimationFrame(loop);
    btn.focus({ preventScroll: true });
  };
  addEventListener('keydown', keys, true);
  btn.addEventListener('click', close);
  el.addEventListener('click', e => { if (about && !card.contains(e.target)) close(); });   // «Acerca de»: un clic fuera también cierra
  const q = new URLSearchParams(location.search);
  if (q.has('selftest') || q.has('nosplash')) el.hidden = true;   // pruebas y capturas: sin entrada (el «Acerca de» sigue)
  else open(false);
}
