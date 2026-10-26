/* =====================================================================
   SubSDJ · limiter-processor (AudioWorklet) — the Room's output limiter.
   Replaces the DynamicsCompressorNode (threshold −3 dB, ratio 20, attack 2 ms):
   it was not a real limiter — it let peaks through and, when pushed hard (four
   parts layered, +9 dB of input), it sounded like harsh saturation.
   How: brickwall with LOOKAHEAD. The signal comes out delayed by L samples (6 ms,
   like Chrome's compressor: the latency does not change) and meanwhile we already
   know what is coming:
     r[n]   = min(1, ceiling / |x[n]|·makeup)  gain each sample needs (L/R linked)
     m[n]   = min of r over the last 2L        (monotonic queue: O(1) per sample)
     env[n] = drops instantly to m; rises towards m with the RELEASE constant
     g[n]   = mean of env over the last L      (the drop is spread over 6 ms: no click)
     y[n]   = x[n−L] · makeup · g[n]
   Guarantee: for the outgoing sample, x[k] with k = n−L, all the env values that
   g[n] averages (j ∈ [n−L+1, n]) come from minimum windows [j−2L+1, j] that
   contain k, so env[j] ≤ r[k] and g[n] ≤ r[k]: |y| ≤ ceiling ALWAYS.
   MAKEUP: Chrome's compressor added a fixed +1.71 dB (its automatic «makeup»,
   measured: a sine at −30 dBFS came out at −28.29). It is kept: whatever does not reach the
   limiter sounds exactly as before. Ceiling −1 dBFS: where the old one started
   compressing (−3 + 1.71) plus a hair of true-peak margin.
   METER (ui/meter.js): with 'meter-on', every METER_S it sends through the port the
   interval's maxima — L and R output peak, input peak (× makeup, what is
   compared with the ceiling) and the minimum gain applied —; with
   'meter-off' it goes quiet. Accumulating maxima costs four comparisons per sample. */
const METER_S = 0.05;
class LimiterProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const p = (options && options.processorOptions) || {};
    const L = this.L = Math.max(1, Math.round((p.lookahead ?? 0.006) * sampleRate));
    this.ceil = Math.pow(10, (p.ceilingDb ?? -1) / 20);
    this.makeup = Math.pow(10, (p.makeupDb ?? 1.71) / 20);
    this.rel = 1 - Math.exp(-1 / ((p.release ?? 0.1) * sampleRate));
    this.dl = [new Float32Array(L), new Float32Array(L)]; this.w = 0;      // delay line (lookahead)
    const W = this.W = 2 * L, cap = this.cap = W + 1;                       // monotonic queue for the minimum
    this.qI = new Float64Array(cap); this.qV = new Float32Array(cap); this.qh = 0; this.qt = 0;
    this.box = new Float64Array(L).fill(1); this.boxSum = L; this.bi = 0;   // moving average of env
    this.env = 1; this.n = 0; this.stopped = false;
    this.meterOn = false; this.mN = Math.round(METER_S * sampleRate); this.mc = 0;
    this.mReset();
    this.port.onmessage = e => {
      if (e.data === 'stop') this.stopped = true;
      else if (e.data === 'meter-on') { this.meterOn = true; this.mc = 0; this.mReset(); }
      else if (e.data === 'meter-off') this.meterOn = false;
    };
  }
  mReset() { this.mL = 0; this.mR = 0; this.mI = 0; this.mG = 1; }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    if (!out || !out.length) return !this.stopped;
    const N = out[0].length, L = this.L, W = this.W, cap = this.cap, mk = this.makeup, ceil = this.ceil, rel = this.rel;
    const iL = inp && inp[0], iR = inp && (inp[1] || inp[0]);
    const oL = out[0], oR = out[1] || out[0], dL = this.dl[0], dR = this.dl[1];
    const qI = this.qI, qV = this.qV, box = this.box;
    let { w, qh, qt, env, boxSum, bi, n, mL, mR, mI, mG } = this;
    for (let i = 0; i < N; i++, n++) {
      const xl = iL ? iL[i] : 0, xr = iR ? iR[i] : 0;
      const a = Math.max(Math.abs(xl), Math.abs(xr)) * mk;
      const r = a > ceil ? ceil / a : 1;
      while (qt !== qh && qV[(qt - 1 + cap) % cap] >= r) qt = (qt - 1 + cap) % cap;   // the queue keeps increasing minima
      qI[qt] = n; qV[qt] = r; qt = (qt + 1) % cap;
      while (qI[qh] <= n - W) qh = (qh + 1) % cap;                                    // drop what left the window
      const m = qV[qh];
      env = m < env ? m : env + (m - env) * rel;
      boxSum += env - box[bi]; box[bi] = env; bi = bi + 1 === L ? 0 : bi + 1;
      const g = boxSum / L;
      const yl = oL[i] = dL[w] * mk * g, yr = oR[i] = dR[w] * mk * g;                 // out goes what came in L samples ago
      if (a > mI) mI = a; if (g < mG) mG = g;                                         // meter: interval maxima
      if (yl > mL) mL = yl; else if (-yl > mL) mL = -yl;
      if (yr > mR) mR = yr; else if (-yr > mR) mR = -yr;
      dL[w] = xl; dR[w] = xr; w = w + 1 === L ? 0 : w + 1;
    }
    if (n > 1e12) { for (let k = 0; k < cap; k++) qI[k] -= n; n = 0; }                // (bounded counter; never happens in a lifetime)
    Object.assign(this, { w, qh, qt, env, boxSum, bi, n, mL, mR, mI, mG });
    if (this.meterOn && (this.mc += N) >= this.mN) {
      this.port.postMessage({ l: mL, r: mR, i: mI, g: mG });
      this.mc = 0; this.mReset();
    }
    return !this.stopped;
  }
}

registerProcessor('limiter-processor', LimiterProcessor);
