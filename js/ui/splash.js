/* =====================================================================
   SubSDJ · welcome window — a modal window over the instrument
   (visible behind it, dimmed). On top, a small old-school demoscene
   screen at low resolution (BW × BH, scaled to double pixels):
     · background: PLASMA (a sum of moving sines) with a cyclic palette, plus
       the INTERFERENCE of two wave sources moving in Lissajous figures:
       their rings cross and produce the moiré;
     · the NAME filled with copper bars (the Amiga «Copper»: one color
       per line, scrolling), with a lit edge, a shadow and a glint that
       sweeps across it; it fades in with an ordered DITHER (Bayer 4×4), which is
       how fades were done with few colors.
   Below, in HTML: the ENTER button, which also starts the audio (a
   browser won't make sound without a gesture), and at the bottom the version, its date
   (RELEASE), the code and the license. Enter also gets you in; while it is up,
   the keyboard plays no notes. The window scales with the instrument.
   It can also ASK (askOnWelcome, ui/session.js): unsaved work from the last
   visit → the button says CONTINUE (Enter, Escape) and «start from Init»
   appears under it (a click, or Tab to it and Enter); the answer comes with
   the same gesture that starts the audio.
   Off with ?selftest or ?nosplash (tests and screenshots: tools/shot.mjs).

   As «About» it LISTENS to the instrument, the way the old player
   visualizers did: the output is split in three bands (bandLevels), each one
   followed by an envelope and the lows watched for hits (AudioReact), and
   those few numbers push the effect (SplashFx.react). The music never sets a
   speed: it ADDS to a phase, so the picture is pushed along instead of
   jumping. In silence every push is 0 and the frame is the one it always was.
   ===================================================================== */
import { VERSION, RELEASE } from '../version.js';
import { part } from '../engine/parts.js';
import { setStatus } from './status.js';
import { tokenList } from './theme.js';
import { uiZoom } from './frame.js';

const BW = 168, BH = 66;        // low-resolution buffer (shown at 336 × 132: double pixels)
const TAU = Math.PI * 2;
const SINE_N = 2048, SIN = new Float32Array(SINE_N);
for (let i = 0; i < SINE_N; i++) SIN[i] = Math.sin(i / SINE_N * TAU);
const sn = x => SIN[((x * (SINE_N / TAU)) | 0) & (SINE_N - 1)];   // table sine (x in radians, any sign)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];   // 4×4 thresholds (0..15)

// --- Palettes (256 entries) built from color stops. The stops live in
// css/style.css (:root, --sp-plasma / --sp-copper): the brand colors, in a
// single place; they are read when the first effect is created.
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

// --- Listening: what is measured ---------------------------------------
const X_LO = 150, X_HI = 2000;  // Hz: the two crossovers → lows (kick, bass) / mids / highs (hats, air)
const WIN = 2048, WARM = 1024;  // samples measured (~43 ms: one cycle of 25 Hz fits) and samples before them that only settle the filters
const FLOOR = 0.004;            // RMS under which a band counts as silence (−48 dB): the gain below never lifts noise
const TILT = [1, 2, 4];         // music carries less and less energy going up: mids and highs are weighed up to count like the lows
const AGC_T = 6;                // s: the bands are read against the recent peak of the loudest, which falls back this slowly (a quiet patch moves it too)
const REL_T = 0.28;             // s: a level rises at once and falls this slowly (no flicker)
const AVG_T = 0.4;              // s: the «usual» lows a hit is compared with (a hit raises it to itself: a held note hits once)
const BEAT_RATIO = 1.45;        // a hit = lows this many times above the usual (a held pad never is)
const BEAT_GAP = 0.12;          // s: no two hits closer than this
const BEAT_T = 0.16;            // s: how fast the pulse of a hit dies away
// --- Listening: what it moves (every one 0 = the effect as it was) -----
const RING_PUSH = 8;            // lows → extra rad/s on the interference rings (they run at 2.6 on their own)
const RING_OPEN = 0.15;         // lows → the two wave sources swing this much wider
const PAL_PUSH = 90;            // mids → extra palette steps/s on the plasma (34 on its own)
const COP_PUSH = 200;           // highs → extra lines/s on the copper bars of the name (60 on their own)
const BEAT_FLASH = 0.5;         // hit → the background this much brighter, for an instant
const TEAR_PX = 8;              // hit → the lines of the name jump sideways up to this many pixels and slide back as the pulse dies (BEAT_T)
const TEAR_ROWS = 0.6;          // …this share of them; the rest stay put
const TEAR_BAND = 3;            // …in bands of 1 to this many lines that move together

// RMS of the three bands of a block of samples. One-pole filters, each used TWICE in a row
// (12 dB/oct: once, a pure 60 Hz tone still read a third of itself in the mids):
// lows = lp·lp at X_LO, highs = hp·hp at X_HI, mids = what is left between them (lp·lp at X_HI, then hp·hp at X_LO).
// A one-pole highpass is the signal minus its lowpass.
export function bandLevels(td, sr, out = [0, 0, 0]) {
  const n = td.length, meas = Math.max(0, n - WIN), from = Math.max(0, meas - WARM);
  const a1 = 1 - Math.exp(-TAU * X_LO / sr), a2 = 1 - Math.exp(-TAU * X_HI / sr);
  let b1 = 0, b2 = 0, c1 = 0, c2 = 0, h1 = 0, m1 = 0, m2 = 0, sb = 0, sm = 0, sh = 0;
  for (let i = from; i < n; i++) {
    const x = td[i];
    b1 += a1 * (x - b1); b2 += a1 * (b1 - b2);                    // lows
    c1 += a2 * (x - c1); c2 += a2 * (c1 - c2);                    // everything under X_HI
    const hp = x - c1; h1 += a2 * (hp - h1); const h = hp - h1;   // highs
    m1 += a1 * (c2 - m1); const mp = c2 - m1; m2 += a1 * (mp - m2); const m = mp - m2;   // mids
    if (i >= meas) { sb += b2 * b2; sm += m * m; sh += h * h; }
  }
  const k = 1 / Math.max(1, n - meas);
  out[0] = Math.sqrt(sb * k); out[1] = Math.sqrt(sm * k); out[2] = Math.sqrt(sh * k);
  return out;
}

// From raw band levels to the few 0..1 numbers that move the picture: bass, mid, high
// (fast up, slow down, each against its own recent peak), beat (1 on a hit, then dying away)
// and hit (true only on the frame of the hit).
export class AudioReact {
  constructor() { this.reset(); }
  reset() { this.env = [0, 0, 0]; this.peak = FLOOR; this.avg = 0; this.cool = 0; this.bass = this.mid = this.high = this.beat = 0; this.hit = false; }
  update(raw, dt) {
    const rel = Math.exp(-dt / REL_T), agc = Math.exp(-dt / AGC_T);
    this.peak = Math.max(FLOOR, this.peak * agc, raw[0] * TILT[0], raw[1] * TILT[1], raw[2] * TILT[2]);
    for (let b = 0; b < 3; b++) {
      const x = raw[b] < FLOOR ? 0 : raw[b] * TILT[b] / this.peak;
      let e = x > this.env[b] ? x : x + (this.env[b] - x) * rel;
      if (e < 1e-4) e = 0;                                        // all the way to silence, not forever nearly there
      this.env[b] = e;
    }
    [this.bass, this.mid, this.high] = this.env;
    this.cool -= dt;
    this.hit = this.cool <= 0 && raw[0] > FLOOR * 4 && raw[0] > this.avg * BEAT_RATIO;
    if (this.hit) { this.beat = 1; this.cool = BEAT_GAP; this.avg = raw[0]; }
    else { this.beat *= Math.exp(-dt / BEAT_T); if (this.beat < 1e-4) this.beat = 0; this.avg += (raw[0] - this.avg) * (1 - Math.exp(-dt / AVG_T)); }
    return this;
  }
}

export class SplashFx {
  constructor(canvas) {
    palettes();
    this.c = canvas; this.g = canvas.getContext('2d');
    this.W = BW; this.H = BH; canvas.width = BW; canvas.height = BH;
    this.img = this.g.createImageData(BW, BH); this.px = new Uint32Array(this.img.data.buffer);
    this.stats = { title: 0 };
    this.exitT = null;
    this.quiet();
    this._titleMask();
    const v = new Uint16Array(BW * BH);                          // vignette + scanlines: a bit of CRT tube
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
      const dx = (x / BW - 0.5) * 1.5, dy = (y / BH - 0.5) * 1.8;
      v[y * BW + x] = Math.round(256 * Math.max(0.3, 1 - 0.5 * (dx * dx + dy * dy)) * (y & 1 ? 0.86 : 1));
    }
    this.vig = v;
  }
  // The name, once: text on a separate canvas → pixel mask, as large as it fits
  _titleMask() {
    const { W, H } = this, o = document.createElement('canvas'); o.width = W; o.height = H;
    const g = o.getContext('2d');
    g.fillStyle = 'white'; g.textAlign = 'center'; g.textBaseline = 'middle';   // it is only a mask
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

  // The music: nothing heard, nothing pushed (the frame is then a function of t alone)
  quiet() { this.ph = { ring: 0, pal: 0, cop: 0 }; this.bass = 0; this.beat = 0; this.tear = new Float32Array(BH); }
  // a = { bass, mid, high, beat, hit } (AudioReact) or null. Levels ADD to phases: speed, not position.
  react(a, dt) {
    if (!a) { this.bass = this.beat = 0; return; }
    this.ph.ring += dt * RING_PUSH * a.bass; this.ph.pal += dt * PAL_PUSH * a.mid; this.ph.cop += dt * COP_PUSH * a.high;
    this.bass = a.bass; this.beat = a.beat;
    if (a.hit) for (let y = 0; y < BH;) {                          // a new tear per hit: each band of lines, its own jump (−1..1)
      const v = Math.random() < TEAR_ROWS ? Math.random() * 2 - 1 : 0;
      for (let k = 1 + (Math.random() * TEAR_BAND | 0); k-- && y < BH;) this.tear[y++] = v;
    }
  }

  frame(t) {
    const { W, H, px, vig, ph } = this;
    const ex = this.exitT !== null ? ease((t - this.exitT) / 0.4) : 0;   // exit: everything lights up
    const fade = Math.min(1, t / 1.0) * 0.8 * (1 + ex * 1.5) * (1 + BEAT_FLASH * this.beat);
    const pal = new Uint32Array(256); for (let i = 0; i < 256; i++) pal[i] = pack(PAL_BG[i], fade);
    // interference sources (Lissajous) and center of the radial plasma
    const wide = 1 + RING_OPEN * this.bass;
    const s1x = W * (0.5 + 0.38 * wide * sn(t * 0.31)), s1y = H * (0.5 + 0.34 * wide * sn(t * 0.43 + 1)), s2x = W * (0.5 + 0.40 * wide * sn(t * 0.27 + 2)), s2y = H * (0.5 + 0.36 * wide * sn(t * 0.37 + 4));
    const rcx = W * (0.5 + 0.3 * sn(t * 0.21)), rcy = H * (0.5 + 0.3 * sn(t * 0.17 + 3));
    const cyc = t * 34 + ph.pal, ring = t * 2.6 + ph.ring, cop = t * 60 + ph.cop;
    for (let y = 0; y < H; y++) {
      const py = sn(y * 0.16 - t * 0.9), dy1 = y - s1y, dy2 = y - s2y, dyr = y - rcy;
      for (let x = 0; x < W; x++) {
        const dx1 = x - s1x, dx2 = x - s2x, dxr = x - rcx;
        const p = sn(x * 0.11 + t * 1.1) + py + sn((x + y) * 0.08 + t * 0.6) + sn(Math.sqrt(dxr * dxr + dyr * dyr) * 0.13 - t * 1.4);
        const k = sn(Math.sqrt(dx1 * dx1 + dy1 * dy1) * 0.62 - ring) + sn(Math.sqrt(dx2 * dx2 + dy2 * dy2) * 0.62 - ring);
        const i = y * W + x;
        px[i] = dim(pal[((p + 4) * 22 + k * 20 + cyc) & 255], vig[i]);
      }
    }
    // --- the name: rising copper, lit edge, shadow and glint; fades in with dither
    const tIn = Math.max(0, Math.min(1, (t - 0.5) / 0.9)), thr = tIn * 16;
    if (tIn > 0) {
      const tm = this.tmask, { x0, x1, y0, y1 } = this.tbox, span = 256 / Math.max(1, y1 - y0) * 0.7;
      const swp = ((t - 0.5) * 0.4) % 2.4 - 0.3;                           // glint sweeping across the name
      const amp = TEAR_PX * this.beat, pad = Math.ceil(amp);              // a hit tears the name: its lines, pushed sideways
      let n = 0;
      for (let y = Math.max(1, y0 - 1); y <= Math.min(H - 2, y1 + 2); y++) {
        const sh = Math.round(this.tear[y] * amp);                         // this line's jump; j = where it reads the name from
        for (let x = Math.max(1 + pad, x0 - 1 - pad); x <= Math.min(W - 2 - pad, x1 + 2 + pad); x++) {
          const i = y * W + x, j = i - sh;
          if (BAYER[(y & 3) * 4 + (x & 3)] >= thr) continue;
          if (tm[j]) {
            n++;
            let c = pack(PAL_COPPER[(((y - y0) * span - cop) | 0) & 255], 1 + ex);
            if (!tm[j - W] || !tm[j - 1]) c = 0xffffffff;                   // lit edge
            else if (!tm[j + W]) c = dim(c, 140);
            const f = (x - sh - x0) / (x1 - x0 + 1) - swp + (y - y0) * 0.01; if (f > 0 && f < 0.07) c = 0xffffffff;
            px[i] = c;
          } else if (tm[j - W - 1]) px[i] = dim(px[i], 64);                // drop shadow
        }
      }
      this.stats.title = n;
    }
    this.g.putImageData(this.img, 0, 0);
  }
}

// A single window on the page: it opens on load (welcome: ENTER starts the audio)
// and reopens as «About» (the header title, the File menu): BACK,
// Escape or a click outside close it. On close it is HIDDEN (not removed) and the effect stops.
let open = () => {};
export const openSplash = (about = true) => open(about);
// The welcome asks { what, when }: resolves 'continue' or 'fresh' when it closes; null if no welcome is up
// (?selftest, ?nosplash, the «About»): then nobody answered
let ask = () => Promise.resolve(null);
export const askOnWelcome = info => ask(info);

export function initSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  const card = el.querySelector('.sp-card'), btn = el.querySelector('#spEnter'), label = btn.querySelector('span');
  const sess = el.querySelector('#spSession'), fresh = el.querySelector('#spFresh');
  let answer = null;   // the pending question's resolve
  el.querySelector('#spVer').textContent = 'v' + VERSION;
  el.querySelector('#spDate').textContent = splashDate(RELEASE);
  const fx = new SplashFx(el.querySelector('canvas'));
  const scale = () => { card.style.zoom = uiZoom(); };          // at the instrument's scale (on a 4K at 150 %, ~1.3)
  let t0 = null, raf = 0, shown = false, about = false, timer = 0, last = 0, td = null;
  const ears = new AudioReact(), raw = [0, 0, 0];
  // What the instrument is putting out right now (the analyser of the output: the scope's). Only as «About»:
  // the welcome comes before the audio is on.
  const listen = dt => {
    let an = null; try { an = about ? part().getAnalyser() : null; } catch (err) {}
    if (!an || an.context.state !== 'running') return null;
    if (!td || td.length !== an.fftSize) td = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(td);
    return ears.update(bandLevels(td, an.context.sampleRate, raw), dt);
  };
  const loop = now => {
    if (t0 === null) t0 = last = now;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    fx.react(listen(dt), dt);
    fx.frame((now - t0) / 1000);
    raf = requestAnimationFrame(loop);
  };
  // While the window is up, the keyboard plays no notes. Registered ONCE, here, before the
  // keyboard (which also listens in capture on window): first registered, first to hear.
  const keys = e => {
    if (!shown) return;
    const inst = el.querySelector('#spInstall'), at = document.activeElement;
    const stops = [btn, ...(answer ? [fresh] : []), ...(inst && !inst.hidden ? [inst] : [])];   // the buttons on show: Tab goes round them
    if (e.key === 'Tab') { if (stops.length > 1) stops[(stops.indexOf(at) + 1) % stops.length].focus({ preventScroll: true }); }
    else if ((e.key === 'Enter' || e.key === ' ') && at === inst && stops.includes(inst)) inst.click();   // «install» is not an answer: the window stays
    else if (e.key === 'Enter' || e.key === ' ') close(answer && document.activeElement === fresh ? 'fresh' : 'continue');
    else if ((about || answer) && e.key === 'Escape') close('continue');   // with a question, Escape keeps the work: discarding it takes a deliberate choice
    e.stopImmediatePropagation(); e.preventDefault();          // also against other window listeners (the keyboard listens there)
  };
  function close(choice = 'continue') {
    if (!shown) return; shown = false;
    if (answer) { const res = answer; answer = null; res(choice); }
    if (!about) try {                                         // the welcome: the gesture the browser requires before making sound
      const e = part();
      if (e && e.ctx && e.ctx.state === 'suspended') e.ctx.resume().then(() => setStatus('powerInfo', 'on', 'audio on')).catch(() => {});
    } catch (err) {}
    fx.exitT = (performance.now() - (t0 ?? performance.now())) / 1000;
    el.classList.add('out');
    removeEventListener('resize', scale);
    timer = setTimeout(() => { cancelAnimationFrame(raf); el.hidden = true; sess.hidden = fresh.hidden = true; }, 460);
  }
  ask = ({ what = '', when = '' } = {}) => new Promise(res => {
    if (!shown || about || answer) { res(null); return; }
    answer = res;
    el.querySelector('#spSessWhat').textContent = what;
    el.querySelector('#spSessWhen').textContent = when;
    sess.hidden = fresh.hidden = false;
    label.textContent = 'CONTINUE';
    btn.focus({ preventScroll: true });
  });
  open = (asAbout) => {
    if (shown) return; shown = true; about = asAbout;
    clearTimeout(timer); cancelAnimationFrame(raf);
    sess.hidden = fresh.hidden = true;
    label.textContent = about ? 'BACK' : 'ENTER';
    fx.exitT = null; t0 = null; fx.quiet(); ears.reset();
    el.hidden = false; el.classList.remove('out');
    scale(); addEventListener('resize', scale);
    raf = requestAnimationFrame(loop);
    btn.focus({ preventScroll: true });
  };
  addEventListener('keydown', keys, true);
  btn.addEventListener('click', () => close('continue'));
  fresh.addEventListener('click', () => close('fresh'));
  el.addEventListener('click', e => { if (about && !card.contains(e.target)) close(); });   // «About»: a click outside also closes
  const q = new URLSearchParams(location.search);
  if (q.has('selftest') || q.has('nosplash')) el.hidden = true;   // tests and screenshots: no welcome (the «About» still works)
  else open(false);
}
