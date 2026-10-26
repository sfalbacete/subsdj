/* =====================================================================
   SubSDJ · nodos auxiliares del grafo: buffers de ruido y deriva, IR de la
   reverb, curva de distorsión y LFOs (los usan AudioEngine.js y Sala.js).
   ===================================================================== */
import { mulberry32 } from './Harmony.js';
// --- Azar por contexto (Roadmap 7.0 · 7.1) ---
// En directo, Math.random: cada nota distinta, como siempre. En un render
// OFFLINE (selftest, SFZ, huellas), un mulberry32 con semilla, uno por
// contexto: el mismo guion da las mismas muestras. Todo el azar del motor sale
// de aquí: el ruido, el IR de la reverb, la Vida y el Golpe del Vocal, el S&H
// por nota, el Arp aleatorio y — por la semilla que recibe cada oscilador — las
// fases libres y la deriva del worklet. seedRender(ctx, s) ANTES de crear el
// motor elige otra tirada (variaciones de un mismo sonido: round robin).
export const RENDER_SEED = 0x5eed7;
const rngCache = new WeakMap();
export function seedRender(ctx, seed) { rngCache.set(ctx, mulberry32(seed | 0)); }
export function ctxRandom(ctx) {
  let r = rngCache.get(ctx);
  if (!r) { r = typeof ctx.startRendering === 'function' ? mulberry32(RENDER_SEED) : Math.random; rngCache.set(ctx, r); }
  return r;
}
export function makeNoise(ctx) {
  const len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0), rnd = ctxRandom(ctx);
  for (let i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
  return b;
}
// Deriva LENTA normalizada a ±1 para la 'Vida' del módulo Vocal: suma de 4
// senos sub-Hz con ciclos ENTEROS en el buffer (loop sin costura — un paseo
// aleatorio a secas daría un salto de formante en cada vuelta) y fases al
// azar. Compartido: cada voz lo lee desde un offset aleatorio (descorrelado).
export function makeWander(ctx) {
  const secs = 8, len = ctx.sampleRate * secs, b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0), rnd = ctxRandom(ctx);
  const comps = [3, 5, 7, 11].map(k => ({ w: 2 * Math.PI * k / secs, ph: rnd() * 2 * Math.PI, a: 1 / k }));
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
  const fMax = 14000, fMin = fMax * Math.pow(200 / fMax, damp), rnd = ctxRandom(ctx);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0, expEnergy = 0, actEnergy = 0;
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, decay);
      const x = (rnd() * 2 - 1) * env;
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
// --- Formas de LFO que un OscillatorNode no tiene: S&H y deriva ('sh', 'drift') ---
// Son BUFFERS en loop leídos por un AudioBufferSourceNode; la velocidad del knob
// es su playbackRate. Unidad de tiempo del buffer: 0,1 s a 8 kHz (señal de
// control: sobra), así que rate = hz / 10 → un escalón (S&H) o ~un vaivén
// (deriva) por periodo del LFO. S&H: 128 escalones aleatorios (a 2 Hz el patrón
// tarda 64 s en repetirse). Deriva: suma de 5 senos con CICLOS ENTEROS en el
// loop (24, 40, 56, 88, 104 ciclos sobre 64 unidades = 0,375…1,625 × f), fases
// al azar, amplitud 1/f, normalizada a ±1: continua y sin costura al dar la
// vuelta (un paseo aleatorio a secas saltaría). Semilla fija (mulberry32):
// renders reproducibles. Un juego de buffers por contexto, compartido por todos
// los LFO; cada uno arranca en un offset distinto (descorrelados).
export const LFO_ALT = ['sh', 'drift'];
const LFO_SR = 8000, LFO_UNIT = 0.1, SH_STEPS = 128, DRIFT_UNITS = 64;
const lfoBufCache = new WeakMap();
export function lfoBuffers(ctx) {
  let b = lfoBufCache.get(ctx);
  if (b) return b;
  const rnd = mulberry32(0x5eed1f0), uLen = Math.round(LFO_SR * LFO_UNIT);
  const sh = ctx.createBuffer(1, uLen * SH_STEPS, LFO_SR), ds = sh.getChannelData(0);
  for (let k = 0; k < SH_STEPS; k++) ds.fill(rnd() * 2 - 1, k * uLen, (k + 1) * uLen);
  const dLen = uLen * DRIFT_UNITS, drift = ctx.createBuffer(1, dLen, LFO_SR), dd = drift.getChannelData(0);
  const comps = [24, 40, 56, 88, 104].map(c => ({ w: 2 * Math.PI * c / dLen, ph: rnd() * 2 * Math.PI, a: 24 / c }));
  let pk = 0;
  for (let i = 0; i < dLen; i++) { let v = 0; for (const c of comps) v += c.a * Math.sin(c.w * i + c.ph); dd[i] = v; if (Math.abs(v) > pk) pk = Math.abs(v); }
  for (let i = 0; i < dLen; i++) dd[i] /= pk;
  // Formas nativas como buffers de UN periodo (1 s a LFO_SR → rate = hz) para los
  // LFO POR VOZ: un buffer en loop admite fase inicial (offset de arranque), un
  // OscillatorNode no. Mismas fases que el oscilador nativo (sin/tri/saw/sqr
  // arrancan en 0, 0, 0, +1), así «por voz» con fase 0 suena como el global.
  const per = LFO_SR, mk = f => { const buf = ctx.createBuffer(1, per, LFO_SR), d = buf.getChannelData(0); for (let i = 0; i < per; i++) d[i] = f(i / per); return buf; };
  b = { sh, drift, rnd, unit: LFO_UNIT, seq: 0,
        sine: mk(x => Math.sin(2 * Math.PI * x)),
        triangle: mk(x => x < 0.25 ? 4 * x : x < 0.75 ? 2 - 4 * x : 4 * x - 4),
        sawtooth: mk(x => x < 0.5 ? 2 * x : 2 * x - 2),
        square: mk(x => x < 0.5 ? 1 : -1) };
  lfoBufCache.set(ctx, b);
  return b;
}
// --- LFO POR VOZ (Roadmap 5.0 · bloque 2: fase por voz y deriva por voz) ---
// Por qué: los LFO del motor son UNO por motor, así que un acorde respira en
// bloque. Con lfoPhase 'voice' cada voz lleva sus propias copias (cut/res/freq/
// pwm/pan) arrancadas en una FASE distinta; y la fuente «Deriva (voz)» de la
// matriz es un paseo lento propio de cada voz. La fase de cada voz sale de la
// secuencia de Weyl k·φ mod 1 (φ = razón áurea): determinista (renders y SFZ
// reproducibles; el selftest puede medirla) y máximamente repartida (dos notas
// seguidas nunca caen cerca; voz 0 = fase 0 = el sonido de siempre).
// Las seis formas son buffers en loop (sin/tri/saw/sqr: rate = hz; S&H/deriva:
// rate = hz·unit, como el LFO alternativo global). El contador vive por
// contexto (lfoBuffers): las partes de una escena comparten la secuencia.
export const LFO_WEYL = 0.6180339887498949;
export function nextVoicePhase(ctx) { const b = lfoBuffers(ctx); return (b.seq++ * LFO_WEYL) % 1; }
const voiceRate = (b, shape, hz) => LFO_ALT.includes(shape) ? hz * b.unit : hz;
// once («una vez», Roadmap 7.0 · 2.2): el buffer suena SIN loop — un ciclo desde
// la fase de arranque y se calla en su final (sin/tri/saw acaban en 0); S&H y
// deriva no tienen final y siguen en loop.
export function mkVoiceLFO(ctx, shape, hz, depth, t0, phase, once = false) {
  const out = ctx.createGain(), gain = ctx.createGain(); gain.gain.value = depth; out.connect(gain);
  const lfo = { out, depth: gain, src: null, shape: null, hz, t0, phase, born: false, once };
  setVoiceLfoShape(ctx, lfo, shape);
  return lfo;
}
// Fase en curso = la de nacimiento + lo recorrido desde el último ancla: cambiar
// de forma o de velocidad a mitad de nota no reinicia el ciclo. SIN envolver: en
// «una vez», 1 o más = el ciclo ya terminó.
const phaseNow = (lfo, now) => lfo.phase + lfo.hz * Math.max(0, now - lfo.t0);
const onceOf = (lfo, shape) => lfo.once && !LFO_ALT.includes(shape);
export function setVoiceLfoShape(ctx, lfo, shape) {
  if (lfo.shape === shape) return;
  const b = lfoBuffers(ctx), now = ctx.currentTime;
  if (lfo.born) { lfo.phase = phaseNow(lfo, now); lfo.t0 = Math.max(now, lfo.t0); }
  if (lfo.src) { try { lfo.src.stop(); lfo.src.disconnect(); } catch (e) {} lfo.src = null; }
  lfo.shape = shape; lfo.born = true;
  const once = onceOf(lfo, shape);
  if (once && lfo.phase >= 1) return;                  // «una vez» y ya recorrió su ciclo: se queda en su final
  const src = ctx.createBufferSource();
  src.buffer = b[shape] || b.sine; src.loop = !once;
  src.playbackRate.value = voiceRate(b, shape, lfo.hz);
  src.connect(lfo.out);
  src.start(Math.max(now, lfo.t0), (once ? lfo.phase : lfo.phase % 1) * src.buffer.duration);
  lfo.src = src;
}
export function setVoiceLfoRate(ctx, lfo, hz, t) {
  const now = ctx.currentTime;
  lfo.phase = phaseNow(lfo, now); if (!onceOf(lfo, lfo.shape)) lfo.phase %= 1;
  lfo.t0 = Math.max(now, lfo.t0); lfo.hz = hz;   // ancla la fase antes de cambiar la velocidad
  if (lfo.src) lfo.src.playbackRate.setTargetAtTime(voiceRate(lfoBuffers(ctx), lfo.shape, hz), t, 0.02);
}
export function stopVoiceLFO(lfo) {
  if (!lfo) return;
  if (lfo.src) { try { lfo.src.stop(); } catch (e) {} try { lfo.src.disconnect(); } catch (e) {} }
  try { lfo.out.disconnect(); } catch (e) {} try { lfo.depth.disconnect(); } catch (e) {}
}
// LFO: oscilador nativo (sin/tri/saw/sqr) o un BUFFER en loop — S&H y deriva
// siempre; cualquier forma A TEMPO (Roadmap 7.0 · 2.2), porque un buffer admite
// fase de arranque y un OscillatorNode no. Todo vertido en `out` (±1, crudo):
// quien consume el LFO (depth, la matriz) cuelga de `out` y no se entera de qué
// fuente hay detrás. El oscilador pasa por una puerta (gate): el cambio de fuente
// se programa LFO_SWITCH por delante y cae en una muestra exacta, sin hueco.
const LFO_SWITCH = 0.02;
export function mkLFO(ctx, freq, depth) {
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
  const gate = ctx.createGain(), out = ctx.createGain();
  const gain = ctx.createGain(); gain.gain.value = depth;
  osc.connect(gate); gate.connect(out); out.connect(gain); osc.start();
  // Siempre enganchado a la salida (ganancia 0): Chrome NO procesa lo que no llega al
  // destino, y un oscilador sin procesar no avanza su fase — el LFO «global» se quedaba
  // congelado entre notas y arrancaba donde se paró al engancharlo una voz (medido
  // 2026-10-20: dos notas a 0 y a 0,37 s se movían igual). Así corre libre de verdad
  // y, a tempo, sigue en la rejilla aunque no suene nada.
  const keep = ctx.createGain(); keep.gain.value = 0; out.connect(keep); keep.connect(ctx.destination);
  return { osc, gate, out, depth: gain, keep, alt: null, shape: 'sine', hz: freq, sync: 0, clock: null, born: ctx.currentTime };
}
// Rehace la fuente: con sincro, el buffer arranca en la fase que le toca en el
// reloj común (fase 0 en el pulso 0 del origen: el ciclo cae en la rejilla).
function relinkLfo(ctx, lfo) {
  const isAlt = LFO_ALT.includes(lfo.shape), useBuf = isAlt || lfo.sync > 0;
  const t0 = ctx.currentTime <= lfo.born ? ctx.currentTime : ctx.currentTime + LFO_SWITCH;   // recién nacido (el arranque del motor): no hay nada sonando que relevar
  if (lfo.alt) { const o = lfo.alt; try { o.stop(t0); } catch (e) {} o.onended = () => { try { o.disconnect(); } catch (e) {} }; lfo.alt = null; }
  if (!useBuf) { lfo.osc.type = lfo.shape; lfo.gate.gain.setValueAtTime(1, t0); return; }
  const b = lfoBuffers(ctx), src = ctx.createBufferSource();
  src.buffer = isAlt ? (lfo.shape === 'sh' ? b.sh : b.drift) : (b[lfo.shape] || b.sine); src.loop = true;
  src.playbackRate.value = isAlt ? lfo.hz * b.unit : lfo.hz;
  const d = src.buffer.duration;
  let off = b.rnd() * d;                                    // libre: cualquier punto (S&H / deriva descorrelados)
  if (lfo.sync > 0) { const cyc = lfo.clock.beatAt(t0) / lfo.sync; off = isAlt ? cyc * b.unit : cyc * d; off = ((off % d) + d) % d; }
  src.connect(lfo.out); src.start(t0, off);
  lfo.alt = src; lfo.gate.gain.setValueAtTime(0, t0);
}
export function setLfoRate(lfo, hz, t) {          // knob Speed: al oscilador y, si la hay, a la fuente por buffer
  lfo.hz = hz;
  lfo.osc.frequency.setTargetAtTime(hz, t, 0.02);
  if (lfo.alt) lfo.alt.playbackRate.setTargetAtTime(LFO_ALT.includes(lfo.shape) ? hz * lfoBuffers(lfo.alt.context).unit : hz, t, 0.02);
}
export function setLfoShape(ctx, lfo, shape) {
  if (lfo.shape === shape) return;
  lfo.shape = shape; relinkLfo(ctx, lfo);
}
// A tempo: beats = pulsos por ciclo (0 = libre), hz = la velocidad que toca. Se
// llama también cuando el reloj cambia (BPM u origen) para volver a la rejilla.
export function setLfoSync(ctx, lfo, beats, clock, hz) {
  const was = lfo.sync;
  lfo.sync = beats || 0; lfo.clock = clock; lfo.hz = hz;
  lfo.osc.frequency.setValueAtTime(hz, ctx.currentTime);
  if (lfo.sync || was) relinkLfo(ctx, lfo);
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
