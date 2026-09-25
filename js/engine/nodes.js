/* =====================================================================
   SubSDJ · nodos auxiliares del grafo: buffers de ruido y deriva, IR de la
   reverb, curva de distorsión y LFOs (los usan AudioEngine.js y Sala.js).
   ===================================================================== */
export function makeNoise(ctx) {
  const len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
// Deriva LENTA normalizada a ±1 para la 'Vida' del módulo Vocal: suma de 4
// senos sub-Hz con ciclos ENTEROS en el buffer (loop sin costura — un paseo
// aleatorio a secas daría un salto de formante en cada vuelta) y fases al
// azar. Compartido: cada voz lo lee desde un offset aleatorio (descorrelado).
export function makeWander(ctx) {
  const secs = 8, len = ctx.sampleRate * secs, b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  const comps = [3, 5, 7, 11].map(k => ({ w: 2 * Math.PI * k / secs, ph: Math.random() * 2 * Math.PI, a: 1 / k }));
  let pk = 0;
  for (let i = 0; i < len; i++) {
    const t = i / ctx.sampleRate;
    let v = 0; for (const c of comps) v += c.a * Math.sin(c.w * t + c.ph);
    d[i] = v; const x = Math.abs(v); if (x > pk) pk = x;
  }
  if (pk > 1e-9) for (let i = 0; i < len; i++) d[i] /= pk;
  return b;
}
// Respuesta al impulso sintética para la reverb (ruido con decaimiento, estéreo
// descorrelacionado). damp (0..1) = decaimiento dependiente de frecuencia: un
// one-pole lowpass cuyo cutoff se CIERRA exponencialmente a lo largo de la cola
// (14 kHz -> hasta 200 Hz a tope), como en una sala real. La energía se
// renormaliza a la del IR sin filtrar: el knob oscurece, no baja el wet.
export function makeIR(ctx, seconds, decay, damp = 0) {
  const rate = ctx.sampleRate, len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  const fMax = 14000, fMin = fMax * Math.pow(200 / fMax, damp);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0, expEnergy = 0, actEnergy = 0;
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, decay);
      const x = (Math.random() * 2 - 1) * env;
      if (damp > 0) {
        const fc = fMax * Math.pow(fMin / fMax, i / len);
        const a = 1 - Math.exp(-6.2832 * fc / rate);
        y += a * (x - y);
        d[i] = y;
      } else d[i] = x;
      expEnergy += env * env; actEnergy += d[i] * d[i];
    }
    if (damp > 0 && actEnergy > 1e-12) {
      const g = Math.sqrt(expEnergy / 3 / actEnergy);   // E[x²] del ruido U(-1,1)·env = env²/3
      for (let i = 0; i < len; i++) d[i] *= g;
    }
  }
  return buf;
}
// Curva de saturación FIJA (tanh). Antes se regeneraba con cada gesto del knob
// Drive: un Float32Array(1024) por evento y el swap de curva podía hacer click.
// Ahora el drive vive en la ganancia de entrada (distPre) y la normalización (distPost).
export function makeDistCurve() {
  const n = 1024, c = new Float32Array(n), k = 4;
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return c;
}
export function mkLFO(ctx, freq, depth) {
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
  const gain = ctx.createGain(); gain.gain.value = depth;
  osc.connect(gain); osc.start();
  return { osc, depth: gain };
}
// LFO seno con fase inicial (los OscillatorNode no la tienen): un PeriodicWave
// con sin(wt+phi) = sin(phi)·cos(wt) + cos(phi)·sin(wt). Para el ensemble a 3 fases.
export function mkPhasedLFO(ctx, freq, depth, phaseDeg) {
  const ph = phaseDeg * Math.PI / 180;
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(ctx.createPeriodicWave(
    new Float32Array([0, Math.sin(ph)]),
    new Float32Array([0, Math.cos(ph)]),
    { disableNormalization: true }));
  osc.frequency.value = freq;
  const gain = ctx.createGain(); gain.gain.value = depth;
  osc.connect(gain); osc.start();
  return { osc, depth: gain };
}
