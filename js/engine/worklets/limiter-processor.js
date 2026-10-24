/* =====================================================================
   SubSDJ · limiter-processor (AudioWorklet) — limitador de salida de la Sala.
   Sustituye al DynamicsCompressorNode (umbral −3 dB, ratio 20, ataque 2 ms):
   no era un limitador de verdad — dejaba pasar picos y, muy apretado (cuatro
   partes en capa, +9 dB de entrada), sonaba a saturación áspera.
   Cómo: brickwall con LOOKAHEAD. La señal sale retrasada L muestras (6 ms,
   como el compresor de Chrome: la latencia no cambia) y mientras tanto ya se
   sabe qué viene:
     r[n]   = min(1, techo / |x[n]|·makeup)    ganancia que necesita cada muestra (L/R enlazados)
     m[n]   = mín de r en las últimas 2L       (cola monótona: O(1) por muestra)
     env[n] = baja al instante a m; sube hacia m con la constante de RELEASE
     g[n]   = media de env en las últimas L    (la bajada se reparte en 6 ms: sin clic)
     y[n]   = x[n−L] · makeup · g[n]
   Garantía: para la muestra que sale, x[k] con k = n−L, todas las env que
   promedia g[n] (j ∈ [n−L+1, n]) vienen de ventanas de mínimo [j−2L+1, j] que
   contienen k, así que env[j] ≤ r[k] y g[n] ≤ r[k]: |y| ≤ techo SIEMPRE.
   MAKEUP: el compresor de Chrome sumaba +1,71 dB fijos (su «makeup» automático,
   medido: un seno a −30 dBFS salía a −28,29). Se conservan: lo que no llega al
   limitador suena exactamente igual que antes. Techo −1 dBFS: donde empezaba
   a comprimir el de antes (−3 + 1,71) más un pelo de margen de pico real.
   MEDIDOR (ui/meter.js): con 'meter-on', cada METER_S manda por el port los
   máximos del intervalo — pico de salida L y R, pico de entrada (× makeup, lo
   que se compara con el techo) y la ganancia mínima aplicada —; con
   'meter-off' calla. Acumular máximos cuesta cuatro comparaciones por muestra. */
const METER_S = 0.05;
class LimiterProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const p = (options && options.processorOptions) || {};
    const L = this.L = Math.max(1, Math.round((p.lookahead ?? 0.006) * sampleRate));
    this.ceil = Math.pow(10, (p.ceilingDb ?? -1) / 20);
    this.makeup = Math.pow(10, (p.makeupDb ?? 1.71) / 20);
    this.rel = 1 - Math.exp(-1 / ((p.release ?? 0.1) * sampleRate));
    this.dl = [new Float32Array(L), new Float32Array(L)]; this.w = 0;      // línea de retardo (lookahead)
    const W = this.W = 2 * L, cap = this.cap = W + 1;                       // cola monótona del mínimo
    this.qI = new Float64Array(cap); this.qV = new Float32Array(cap); this.qh = 0; this.qt = 0;
    this.box = new Float64Array(L).fill(1); this.boxSum = L; this.bi = 0;   // media móvil de env
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
      while (qt !== qh && qV[(qt - 1 + cap) % cap] >= r) qt = (qt - 1 + cap) % cap;   // la cola guarda mínimos crecientes
      qI[qt] = n; qV[qt] = r; qt = (qt + 1) % cap;
      while (qI[qh] <= n - W) qh = (qh + 1) % cap;                                    // fuera lo que salió de la ventana
      const m = qV[qh];
      env = m < env ? m : env + (m - env) * rel;
      boxSum += env - box[bi]; box[bi] = env; bi = bi + 1 === L ? 0 : bi + 1;
      const g = boxSum / L;
      const yl = oL[i] = dL[w] * mk * g, yr = oR[i] = dR[w] * mk * g;                 // sale lo de hace L muestras
      if (a > mI) mI = a; if (g < mG) mG = g;                                         // medidor: máximos del intervalo
      if (yl > mL) mL = yl; else if (-yl > mL) mL = -yl;
      if (yr > mR) mR = yr; else if (-yr > mR) mR = -yr;
      dL[w] = xl; dR[w] = xr; w = w + 1 === L ? 0 : w + 1;
    }
    if (n > 1e12) { for (let k = 0; k < cap; k++) qI[k] -= n; n = 0; }                // (contador acotado; no pasa en una vida)
    Object.assign(this, { w, qh, qt, env, boxSum, bi, n, mL, mR, mI, mG });
    if (this.meterOn && (this.mc += N) >= this.mN) {
      this.port.postMessage({ l: mL, r: mR, i: mI, g: mG });
      this.mc = 0; this.mReset();
    }
    return !this.stopped;
  }
}

registerProcessor('limiter-processor', LimiterProcessor);
