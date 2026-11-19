/* SubSDJ · oscilloscope (time domain) + spectrum analyzer of the
   master, on the «Output» screen (what is sounding: all parts). Canvases at
   physical resolution (devicePixelRatio × instrument zoom).

   OSCILLOSCOPE, two modes (a click on it switches; remembered):
   · scope: the last SCOPE_N samples (~43 ms), triggered so the wave stands still.
   · cycle: ONE period stretched to the full width and normalized to its peak, to read
     the SHAPE of the wave. The period is MEASURED on the signal (YIN, see detectPeriod),
     not taken from the key: it follows detune, octave, FM, glide. With no clear period
     (chords, noise, silence) it draws like scope.
   TRIGGER. A plain «rising zero crossing» jumps between the several crossings a rich wave
   has per period. Here: the lowest sample of one period is found and the display starts at
   the first rising crossing after it — one single point per period.

   SPECTRUM: a curve, not bars. X is logarithmic (each octave the same width: a cutoff
   sweep moves at constant speed) and Y is in dB (a 12 / 24 dB/oct filter is a straight
   slope). Where a pixel column holds several FFT bins the loudest wins; where bins are
   wider than pixels (the lows) the curve is interpolated between them. A second line
   keeps the peaks and falls slowly: the trail of a sweep.
   Three modes (a click on it cycles; remembered):
   · detail: the curve as measured, every harmonic a spike.
   · smooth: the ENVELOPE — the line that rides the crests. Each column takes the loudest
     value within ±SMOOTH_OCT (so the valleys between harmonics up to an octave apart are
     bridged), then two box blurs of half that width round the steps. The blur never spans
     more than the plateau the max left, so the curve still touches each isolated crest.
   · polar: the detail curve wrapped around a circle — frequency is the angle (20 Hz at
     12 o'clock, clockwise, each octave the same arc), level is the radius. */
import { part } from '../engine/parts.js';
import { token, tint } from './theme.js';
import { uiZoom } from './frame.js';

const SCOPE_N = 2048;        // samples across the screen in scope mode
const SILENCE = 0.002;       // peak under which there is nothing to trigger on or measure
const CYCLE_FILL = 0.88;     // cycle mode: the peak reaches this fraction of the half height
const PITCH_EVERY = 6;       // frames between period measurements (~10 per second)
const YIN_DEC = 4;           // the period is searched on the signal decimated ×4, then refined
const YIN_WIN = 768;         // decimated samples compared at each lag
const YIN_MAXLAG = 640;      // longest period searched, decimated (2560 samples ≈ 19 Hz at 48 kHz)
const YIN_MINLAG = 4;        // shortest (16 samples ≈ 3 kHz)
const YIN_THR = 0.15;        // «this lag repeats the wave»: normalized difference below this
const F_MIN = 20, F_MAX = 20000;      // spectrum: frequency axis (Hz, logarithmic)
const DB_TOP = -12, DB_BOT = -96;     // spectrum: level axis (a full-scale sine reads ≈ −13 dB: Blackman window)
const PEAK_FALL = 9;         // spectrum: fall of the peak line (dB/s)
const GRID_HZ = [[100, '100'], [1000, '1k'], [10000, '10k']];
const GRID_DB = 24;          // spectrum: a horizontal line every this many dB
const SPEC_MODES = ['detail', 'smooth', 'polar'];
const SMOOTH_OCT = 0.5;      // smooth mode: reach of the envelope to each side, in octaves (0.5 bridges harmonics 1 and 2)
const POLAR_HOLE = 0.3;      // polar mode: radius of the silence circle (DB_BOT), as a fraction of the outer one (DB_TOP)
const LS_KEY = 'subsdj.scope.v1', LS_SPEC = 'subsdj.spectrum.v1';

const dpr = () => (window.devicePixelRatio || 1) * uiZoom();   // physical px per design px (the instrument is scaled)
function fit(c) { c.width = Math.round((c.clientWidth || 170) * dpr()); c.height = Math.round((c.clientHeight || 36) * dpr()); }

// Period of x in samples (fractional), 0 if there is none. YIN: d(τ) = Σ (x[i] − x[i+τ])² is ~0
// when τ is a period; dividing by its running mean makes the dip independent of the level, and
// taking the FIRST dip under the threshold avoids answering with 2 or 3 periods. Searched on the
// signal averaged in groups of YIN_DEC (16× cheaper) and refined at full rate around the answer.
const dec = new Float32Array(YIN_WIN + YIN_MAXLAG), dn = new Float32Array(YIN_MAXLAG + 1);
export function detectPeriod(x) {
  const N = x.length, M = dec.length, off = N - M * YIN_DEC;
  if (off < 0) return 0;
  let peak = 0;
  for (let m = 0; m < M; m++) {
    let s = 0; for (let k = 0, i = off + m * YIN_DEC; k < YIN_DEC; k++) s += x[i + k];
    dec[m] = s /= YIN_DEC; if (s > peak) peak = s; else if (-s > peak) peak = -s;
  }
  if (peak < SILENCE) return 0;
  let sum = 0, lag = 0;
  for (let t = 1; t <= YIN_MAXLAG; t++) {
    let d = 0; for (let i = 0; i < YIN_WIN; i++) { const e = dec[i] - dec[i + t]; d += e * e; }
    sum += d; dn[t] = sum ? d * t / sum : 1;
  }
  for (let t = YIN_MINLAG; t < YIN_MAXLAG; t++) {
    if (dn[t] < YIN_THR) { while (t + 1 < YIN_MAXLAG && dn[t + 1] < dn[t]) t++; lag = t; break; }
  }
  if (!lag) return 0;
  // full rate, ±6 samples around lag·YIN_DEC, and a parabola through the minimum for the fraction
  const c = lag * YIN_DEC, R = 6, W = Math.min(2048, N - c - R - 1), base = N - W - c - R - 1, d = [];
  let best = 0;
  for (let k = -R; k <= R; k++) {
    let s = 0; for (let i = 0; i < W; i++) { const e = x[base + i] - x[base + i + c + k]; s += e * e; }
    d.push(s); if (s < d[best]) best = d.length - 1;
  }
  let fr = 0;
  if (best > 0 && best < 2 * R) { const a = d[best - 1], b = d[best], cc = d[best + 1], den = a - 2 * b + cc; if (den > 0) fr = 0.5 * (a - cc) / den; }
  return c + best - R + fr;
}

// Where to start drawing `need` samples: the first rising zero crossing after the lowest sample
// of a stretch of length L (one period if known). Fractional: the crossing is interpolated.
export function triggerStart(x, need, L) {
  const N = x.length, end = N - need - 1, a = Math.max(1, end - 2 * L);
  if (end <= a) return Math.max(0, end);
  let lo = a; const b = Math.min(end, a + L);
  for (let i = a; i < b; i++) if (x[i] < x[lo]) lo = i;
  for (let i = lo + 1; i <= end; i++) if (x[i - 1] < 0 && x[i] >= 0) return i - 1 + x[i - 1] / (x[i - 1] - x[i]);
  return end;
}

export function initScope(scopeCanvas, specCanvas) {
  const sctx = scopeCanvas.getContext('2d');
  const fctx = specCanvas.getContext('2d');
  const resize = () => { fit(scopeCanvas); fit(specCanvas); };
  resize(); window.addEventListener('resize', resize);

  let mode = 'scope'; try { if (localStorage.getItem(LS_KEY) === 'cycle') mode = 'cycle'; } catch { /* no persistence */ }
  scopeCanvas.addEventListener('click', () => {
    mode = mode === 'cycle' ? 'scope' : 'cycle';
    try { localStorage.setItem(LS_KEY, mode); } catch { /* no persistence */ }
  });

  let specMode = SPEC_MODES[0]; try { const m = localStorage.getItem(LS_SPEC); if (SPEC_MODES.includes(m)) specMode = m; } catch { /* no persistence */ }
  specCanvas.addEventListener('click', () => {
    specMode = SPEC_MODES[(SPEC_MODES.indexOf(specMode) + 1) % SPEC_MODES.length];
    if (peaks) peaks.fill(DB_BOT);                               // the trail belongs to the curve that left it
    try { localStorage.setItem(LS_SPEC, specMode); } catch { /* no persistence */ }
  });

  let timeData = null, freqData = null, period = 0, tick = 0, pk = 0, lastT = 0;
  let cols = null, peaks = null, colsKey = '';

  const at = (x, p) => { const i = p | 0, f = p - i; return x[i] + (x[i + 1] - x[i]) * f; };   // linear interpolation
  const label = (ctx, s, x, y, align = 'left') => {
    ctx.font = `${Math.round(9 * dpr())}px Consolas, "Cascadia Mono", ui-monospace, monospace`;
    ctx.textAlign = align; ctx.fillStyle = tint('--dim', .85); ctx.fillText(s, x, y);
  };
  // the line with its halo and, under it, the fill that fades away from it
  function glowLine(ctx, path, grad) {
    ctx.fillStyle = grad; ctx.fill(path.fill, path.rule || 'nonzero');
    ctx.lineWidth = 1.4 * dpr(); ctx.lineJoin = 'round'; ctx.strokeStyle = token('--accent');
    ctx.shadowColor = tint('--accent', .7); ctx.shadowBlur = 5 * dpr();
    ctx.stroke(path.line); ctx.shadowBlur = 0;
  }

  function drawScope(x, sr) {
    const w = scopeCanvas.width, h = scopeCanvas.height, mid = h / 2, d = dpr();
    sctx.clearRect(0, 0, w, h);
    sctx.lineWidth = d; sctx.strokeStyle = tint('--dim', .25);
    sctx.beginPath(); sctx.moveTo(0, mid); sctx.lineTo(w, mid); sctx.stroke();
    const cycle = mode === 'cycle' && period > 0;
    const span = cycle ? period : SCOPE_N;                       // samples across the screen
    const start = triggerStart(x, Math.ceil(span) + 2, period ? Math.ceil(period) : SCOPE_N / 2);
    const n = cycle ? Math.min(Math.round(w), 512) : SCOPE_N;    // points drawn
    let gain = 1;
    if (cycle) {
      let p = 0; for (let j = 0; j <= n; j++) { const v = Math.abs(at(x, start + j / n * span)); if (v > p) p = v; }
      pk += (p - pk) * (pk ? 0.25 : 1);                          // the scale follows the level without flickering
      gain = CYCLE_FILL / Math.max(pk, SILENCE);
    } else pk = 0;
    const line = new Path2D(), fill = new Path2D();
    fill.moveTo(0, mid);
    for (let j = 0; j <= n; j++) {
      const px = j / n * w, py = mid - Math.max(-1, Math.min(1, at(x, start + j / n * span) * gain)) * mid;
      j ? line.lineTo(px, py) : line.moveTo(px, py); fill.lineTo(px, py);
    }
    fill.lineTo(w, mid); fill.closePath();
    const grad = sctx.createLinearGradient(0, 0, 0, h);          // strongest at the crests, nothing at the axis
    grad.addColorStop(0, tint('--accent', .34)); grad.addColorStop(0.5, tint('--accent', 0)); grad.addColorStop(1, tint('--accent', .34));
    glowLine(sctx, { line, fill }, grad);
    const hz = period ? sr / period : 0;
    label(sctx, mode + (mode === 'cycle' ? ' · ' + (hz ? (hz < 100 ? hz.toFixed(1) : Math.round(hz)) + ' Hz' : '—') : ''), 6 * d, 12 * d);
  }

  // Per pixel column, the stretch of FFT bins it covers (fractional): computed once per size
  function layout(w, sr, bins) {
    const key = w + '|' + sr + '|' + bins; if (key === colsKey) return;
    colsKey = key;
    const step = Math.max(1, Math.round(dpr())), n = Math.ceil(w / step) + 1, binHz = sr / 2 / bins;
    const fTop = Math.min(F_MAX, sr / 2), f = px => F_MIN * Math.pow(fTop / F_MIN, px / w);
    cols = { n, step, lo: new Float32Array(n), hi: new Float32Array(n), v: new Float32Array(n), tmp: new Float32Array(n), fTop,
             k: Math.max(1, Math.round(SMOOTH_OCT * w / Math.log2(fTop / F_MIN) / step)) };   // SMOOTH_OCT in columns
    for (let c = 0; c < n; c++) { cols.lo[c] = f(c * step - step / 2) / binHz; cols.hi[c] = f(c * step + step / 2) / binHz; }
    peaks = new Float32Array(n).fill(DB_BOT);
  }

  // v → its envelope, in place: running max over ±k columns, then two box blurs of ±k/2
  function envelope(v, t, k) {
    const n = v.length, kb = k >> 1, cl = i => i < 0 ? 0 : i >= n ? n - 1 : i;
    for (let i = 0; i < n; i++) { let m = v[i]; for (let j = Math.max(0, i - k), e = Math.min(n - 1, i + k); j <= e; j++) if (v[j] > m) m = v[j]; t[i] = m; }
    const blur = (a, b) => { for (let i = 0; i < n; i++) { let s = 0; for (let j = i - kb; j <= i + kb; j++) s += a[cl(j)]; b[i] = s / (2 * kb + 1); } };
    blur(t, v); blur(v, t); v.set(t);
  }

  function drawPolar(vals, w, h, d) {
    const cx = w / 2, cy = h / 2, R = h / 2 - 3 * d, r0 = R * POLAR_HOLE, TAU = 2 * Math.PI;
    const rad = v => r0 + Math.min(1, Math.max(0, (v - DB_BOT) / (DB_TOP - DB_BOT))) * (R - r0);
    const ang = px => -Math.PI / 2 + px / w * TAU;
    fctx.lineWidth = d;
    fctx.strokeStyle = tint('--dim', .10); fctx.beginPath();
    for (let v = DB_TOP; v >= DB_BOT; v -= GRID_DB) { fctx.moveTo(cx + rad(v), cy); fctx.arc(cx, cy, rad(v), 0, TAU); }
    fctx.stroke();
    fctx.strokeStyle = tint('--dim', .20); fctx.beginPath(); fctx.textBaseline = 'middle';
    for (const [hz, s] of GRID_HZ) {
      const a = ang(Math.log(hz / F_MIN) / Math.log(cols.fTop / F_MIN) * w), ca = Math.cos(a), sa = Math.sin(a);
      fctx.moveTo(cx + ca * r0, cy + sa * r0); fctx.lineTo(cx + ca * R, cy + sa * R);
      label(fctx, s, cx + ca * (R + 5 * d), Math.min(h - 6 * d, Math.max(6 * d, cy + sa * (R + 5 * d))), ca < 0 ? 'right' : 'left');
    }
    fctx.stroke(); fctx.textBaseline = 'alphabetic';
    const line = new Path2D(), fill = new Path2D(), pline = new Path2D();
    for (let c = 0; c < cols.n; c++) {
      const a = ang(Math.min(w, c * cols.step)), ca = Math.cos(a), sa = Math.sin(a), r = rad(vals[c]), rp = rad(peaks[c]);
      c ? line.lineTo(cx + ca * r, cy + sa * r) : line.moveTo(cx + ca * r, cy + sa * r);
      c ? pline.lineTo(cx + ca * rp, cy + sa * rp) : pline.moveTo(cx + ca * rp, cy + sa * rp);
    }
    line.closePath(); pline.closePath();                         // 20 kHz meets 20 Hz at 12 o'clock
    fill.addPath(line); fill.moveTo(cx + r0, cy); fill.arc(cx, cy, r0, 0, TAU);   // the ring between the hole and the curve
    fctx.strokeStyle = tint('--accent2', .6); fctx.stroke(pline);
    const grad = fctx.createRadialGradient(cx, cy, r0, cx, cy, R);
    grad.addColorStop(0, tint('--accent', .03)); grad.addColorStop(0.45, tint('--accent', .16)); grad.addColorStop(1, tint('--accent', .45));
    glowLine(fctx, { line, fill, rule: 'evenodd' }, grad);
  }

  function drawSpectrum(data, sr, dt) {
    const w = specCanvas.width, h = specCanvas.height, bins = data.length, d = dpr();
    layout(w, sr, bins);
    fctx.clearRect(0, 0, w, h);
    const g = i => { const v = data[i < 0 ? 0 : i >= bins ? bins - 1 : i]; return v > DB_BOT ? v : DB_BOT; };   // −Infinity in silence
    const vals = cols.v;
    for (let c = 0; c < cols.n; c++) {
      const lo = cols.lo[c], hi = cols.hi[c]; let v;
      if (hi - lo >= 1) { v = DB_BOT; for (let i = Math.ceil(lo); i <= hi; i++) if (g(i) > v) v = g(i); }   // several bins: the loudest
      else {                                                     // less than a bin per column: Catmull-Rom between bins
        const p = (lo + hi) / 2, i = Math.floor(p), t = p - i, a = g(i - 1), b = g(i), cc = g(i + 1), e = g(i + 2);
        v = b + 0.5 * t * (cc - a + t * (2 * a - 5 * b + 4 * cc - e + t * (3 * (b - cc) + e - a)));
      }
      vals[c] = v;
    }
    if (specMode === 'smooth') envelope(vals, cols.tmp, cols.k);
    for (let c = 0; c < cols.n; c++) peaks[c] = Math.max(vals[c], peaks[c] - PEAK_FALL * dt);
    if (specMode === 'polar') { drawPolar(vals, w, h, d); label(fctx, specMode, 6 * d, 12 * d); return; }
    const Y = v => (DB_TOP - v) / (DB_TOP - DB_BOT) * h;
    const X = hz => Math.log(hz / F_MIN) / Math.log(cols.fTop / F_MIN) * w;
    fctx.lineWidth = d;
    fctx.strokeStyle = tint('--dim', .10); fctx.beginPath();
    for (let v = DB_TOP - GRID_DB; v > DB_BOT; v -= GRID_DB) { fctx.moveTo(0, Y(v)); fctx.lineTo(w, Y(v)); }
    fctx.stroke();
    fctx.strokeStyle = tint('--dim', .20); fctx.beginPath();
    for (const [hz] of GRID_HZ) { fctx.moveTo(X(hz), 0); fctx.lineTo(X(hz), h); }
    fctx.stroke();
    for (const [hz, s] of GRID_HZ) label(fctx, s, X(hz) - 3 * d, 11 * d, 'right');

    const line = new Path2D(), fill = new Path2D(), pline = new Path2D();
    fill.moveTo(0, h);
    for (let c = 0; c < cols.n; c++) {
      const v = vals[c], pkv = peaks[c];
      const px = c * cols.step, py = Math.min(h, Math.max(0, Y(v))), pp = Math.min(h, Math.max(0, Y(pkv)));
      c ? line.lineTo(px, py) : line.moveTo(px, py); fill.lineTo(px, py);
      c ? pline.lineTo(px, pp) : pline.moveTo(px, pp);
    }
    fill.lineTo((cols.n - 1) * cols.step, h); fill.closePath();
    fctx.lineWidth = d; fctx.strokeStyle = tint('--accent2', .6); fctx.stroke(pline);   // the trail, under the curve
    const grad = fctx.createLinearGradient(0, 0, 0, h);          // same fall-off as the envelope graph
    grad.addColorStop(0, tint('--accent', .45)); grad.addColorStop(0.55, tint('--accent', .16)); grad.addColorStop(1, tint('--accent', .03));
    glowLine(fctx, { line, fill }, grad);
    label(fctx, specMode, 6 * d, h - 6 * d);                     // bottom left: the top belongs to the Hz marks
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const an = part().getAnalyser();
    if (!an || !scopeCanvas.offsetParent) return;                // off screen (Presets): not painted
    if (!timeData || timeData.length !== an.fftSize) { timeData = new Float32Array(an.fftSize); freqData = new Float32Array(an.frequencyBinCount); }
    const sr = an.context.sampleRate, dt = lastT ? Math.min(0.25, Math.max(0, (now - lastT) / 1000)) : 0; lastT = now;
    an.getFloatTimeDomainData(timeData);
    if (tick++ % PITCH_EVERY === 0) period = detectPeriod(timeData);
    drawScope(timeData, sr);
    an.getFloatFrequencyData(freqData); drawSpectrum(freqData, sr, dt);
  }
  requestAnimationFrame(frame);
}
