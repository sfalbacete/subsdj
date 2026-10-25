/* =====================================================================
   SubSDJ · pulse-processor (AudioWorklet)
   Oscilador band-limited (PolyBLEP). Tipos (processorOptions.type):
     sawtooth | square | sine | triangle | supersaw | tabla | fm4
   FM4: síntesis FM de 4 operadores a la DX7/TX81Z. Un ALGORITMO es solo un
   grafo dirigido de quién modula a quién (FM4_ALGS): las hojas modulan, las
   raíces (portadoras) suenan. Cada operador tiene ratio (múltiplo de la
   nota), nivel y DECAY propio (nivel·e^(−t/decay); plano si decay ≥ FM4_DEC_FLAT):
   un modulador que decae = ataque brillante que se apaga, lo que hace
   pluck, campana, e-piano y bombo. El operador 4 lleva la realimentación
   (fmFb, como en el 2-op). Modulación de fase en ciclos: nivel 1 ⇒
   FM4_MOD ciclos ≈ 7,5 rad de índice. Params fm4Alg / fm4R1-4 / fm4L1-4 / fm4D1-4.
   TABLA (wavetable): processorOptions.wt = { lens, frames } (mips generados
   en el hilo principal, engine/wavetable.js). Lookup con interpolación
   cúbica (Hermite) + morph lineal entre frames adyacentes (param wtPos);
   el nivel (mip) se elige por frecuencia: la tabla leída no tiene parciales
   sobre Nyquist (el equivalente tabulado del PolyBLEP). Ignora pulseWidth,
   spread y FM; unison/octavas/drift funcionan igual que en el resto.
   MULTI-OCTAVA: processorOptions.octaves (1..4) apila las octavas DENTRO
   del processor (antes: un AudioWorkletNode por octava). La suma sale sin
   normalizar; el bus de la voz aplica 1/octavas, como siempre.
   Params (todos k-rate: un valor por bloque de 128; el pow del detune se
   paga 1 vez por bloque, no por muestra — a 20 Hz de vibrato el escalón de
   2.9 ms es inaudible): frequency (Hz, glide), detune (cents, vibrato),
   drift (cents, deriva aleatoria lenta independiente por oscilador),
   pulseWidth (PWM), spread (supersaw), fmRatio/fmIndex/fmFb (FM 2-op en
   seno; fmFb = realimentación del modulador),
   uniVoices/uniDetune (UNISON generalizado: 1..7 copias detunadas para
   cualquier onda salvo supersaw, que ya es unison; nivel 1/sqrt(N); la
   copia 0 conserva la fase configurada -> con N=1 es bit-idéntico al
   oscilador simple; las demás copias arrancan con fase aleatoria).
   AZAR (fases de las copias y del supersaw, deriva): processorOptions.seed
   (la manda la voz; offline sale de un generador con semilla: renders
   repetibles). Sin seed, Math.random.
   SYNC DURO (Roadmap 7.0 · 3.2): con syncRatio > 0 este oscilador (el A) es
   ESCLAVO del B: vuelve a empezar su ciclo con cada ciclo del B. Ver _synced.
   slave = cents que mueven SOLO al esclavo (la matriz «Pitch A»): el barrido
   del sync cambia el timbre y no arrastra al maestro.
   Salida mono. Se autodestruye al recibir el mensaje "stop".
   ===================================================================== */

// PRNG con semilla (mulberry32, el de engine/Harmony.js: los worklets no importan módulos del motor)
function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
function fract(x) { return x - Math.floor(x); }
// Lectura Hermite de la tabla (la del bucle de 'tabla', como función: la usa el sync)
function wtHermite(dA, dB, ff, len, p) {
  const xx = p * len, i1 = xx | 0, w = xx - i1;
  const i0 = i1 === 0 ? len - 1 : i1 - 1, i2 = i1 + 1 === len ? 0 : i1 + 1, i3 = i2 + 1 === len ? 0 : i2 + 1;
  const a0 = dA[i0], a1 = dA[i1], a2 = dA[i2], a3 = dA[i3];
  const y0 = a0 + (dB[i0] - a0) * ff, y1 = a1 + (dB[i1] - a1) * ff, y2 = a2 + (dB[i2] - a2) * ff, y3 = a3 + (dB[i3] - a3) * ff;
  const c1 = 0.5 * (y2 - y0), c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3, c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
  return ((c3 * w + c2) * w + c1) * w + y1;
}
const SYNC_TYPES = new Set(['sawtooth', 'square', 'triangle', 'sine', 'tabla']);   // supersaw y FM4: sin sync

// Offsets de detune del Super Saw (curva del JP-8000, según el análisis de Adam Szabo).
const SS_DETUNE = [-0.11002313, -0.06288439, -0.01952356, 0, 0.01952356, 0.06288439, 0.11002313];

// Realimentación del modulador FM (fmFb 0..1 → β radianes): y = sin(θ + β·ȳ),
// con ȳ = media de las DOS salidas anteriores (el truco de Yamaha: sin
// promediar, a β alta la muestra alterna de signo y el bucle silba a Nyquist).
// β ≈ 1.5 ya da una sierra razonable; hacia 3 el bucle se vuelve caótico =
// ruido metálico (los hats FM del TX81Z, sin generador de ruido).
const FM_FB_MAX = 3;

// FM4: algoritmos = para cada operador (0..3), sus MODULADORES (índices mayores:
// se calculan de 3 a 0) y qué operadores son PORTADORAS (suman a la salida).
const FM4_ALGS = [
  { mods: [[1], [2], [3], []], car: [0] },            // 0 pila 4→3→2→1 (brass; feedback en 4)
  { mods: [[1], [], [3], []], car: [0, 2] },          // 1 dos pares 2→1 · 4→3 (e-piano)
  { mods: [[1, 2, 3], [], [], []], car: [0] },        // 2 tres moduladores en paralelo → 1 (campana densa)
  { mods: [[1, 2], [], [3], []], car: [0] },          // 3 Y: 2 y 3 → 1, 4 → 3
  { mods: [[3], [3], [3], []], car: [0, 1, 2] },      // 4 un modulador para tres portadoras (órgano, coro)
  { mods: [[1], [2], [], []], car: [0, 3] },          // 5 pila de tres + portadora 4 sola (cama de seno)
  { mods: [[1], [], [], []], car: [0, 2, 3] },        // 6 par 2→1 + dos portadoras puras
  { mods: [[], [], [], []], car: [0, 1, 2, 3] },      // 7 aditivo: las cuatro suenan (feedback en 4 = sierra)
];
const FM4_MOD = 1.2;          // ciclos de fase por unidad de nivel del modulador (≈ 7,5 rad de índice a nivel 1)
const FM4_DEC_FLAT = 3.99;    // decay ≥ esto = sin envolvente (nivel constante)

class PulseProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 440, minValue: 0,     maxValue: 20000, automationRate: 'k-rate' },
      { name: 'detune',    defaultValue: 0,   minValue: -4800, maxValue: 4800,  automationRate: 'k-rate' },
      { name: 'drift',     defaultValue: 0,   minValue: 0,     maxValue: 25,    automationRate: 'k-rate' },
      { name: 'pulseWidth',defaultValue: 0.5, minValue: 0.01,  maxValue: 0.99,  automationRate: 'k-rate' },
      { name: 'spread',    defaultValue: 0.5, minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },
      { name: 'fmRatio',   defaultValue: 1,   minValue: 0,     maxValue: 12,    automationRate: 'k-rate' },
      { name: 'fmIndex',   defaultValue: 0,   minValue: 0,     maxValue: 12,    automationRate: 'k-rate' },
      { name: 'fmFb',      defaultValue: 0,   minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },
      { name: 'uniVoices', defaultValue: 1,   minValue: 1,     maxValue: 7,     automationRate: 'k-rate' },
      { name: 'uniDetune', defaultValue: 0,   minValue: 0,     maxValue: 50,    automationRate: 'k-rate' },
      { name: 'wtPos',     defaultValue: 0,   minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },
      { name: 'fm4Alg',    defaultValue: 0,   minValue: 0,     maxValue: 7,     automationRate: 'k-rate' },
      { name: 'syncRatio', defaultValue: 0,   minValue: 0,     maxValue: 64,    automationRate: 'k-rate' },   // 0 = libre; si no, f(B)/f(A sin slave)
      { name: 'slave',     defaultValue: 0,   minValue: -4800, maxValue: 4800,  automationRate: 'k-rate' },   // cents solo del esclavo (Pitch A)
      ...[1, 2, 3, 4].flatMap(n => [
        { name: 'fm4R' + n, defaultValue: 1,   minValue: 0.25,  maxValue: 12,  automationRate: 'k-rate' },
        { name: 'fm4L' + n, defaultValue: 0.5, minValue: 0,     maxValue: 1,   automationRate: 'k-rate' },
        { name: 'fm4D' + n, defaultValue: 4,   minValue: 0.005, maxValue: 4,   automationRate: 'k-rate' },
      ]),
    ];
  }

  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.type = o.type || 'sawtooth';
    this.octaves = Math.max(1, Math.min(4, (o.octaves | 0) || 1));
    const ph = (typeof o.phase === 'number') ? (o.phase % 1 + 1) % 1 : 0;
    const rnd = this.rnd = (typeof o.seed === 'number') ? mulberry32(o.seed) : Math.random;
    if (this.type === 'supersaw') {
      // 7 fases aleatorias e independientes POR OCTAVA (evita el "peine" de fases alineadas)
      this.phases = new Float32Array(this.octaves * 7);
      for (let i = 0; i < this.phases.length; i++) this.phases[i] = rnd();
    } else {
      // 7 slots por octava para el unison generalizado (idx = oct*7 + copia):
      // la copia 0 lleva la fase configurada (con uniVoices=1 todo es como antes),
      // el resto aleatoria. modPhases = moduladores FM: la copia 0 arranca en la
      // fase de la portadora (key sync, como el FM4 y el DX7). Antes, al azar: con
      // ratios enteros la fase relativa reparte la energía entre armónicos y cada
      // nota salía con otro timbre («DX bass», seis Do4 seguidos: 7,7 dB de diferencia).
      this.phases = new Float32Array(this.octaves * 7);
      this.modPhases = new Float32Array(this.octaves * 7);
      this.fb1 = new Float32Array(this.octaves * 7);   // últimas dos salidas del modulador (feedback)
      this.fb2 = new Float32Array(this.octaves * 7);
      this.fm4Ph = new Float32Array(this.octaves * 7 * 4);   // FM4: 4 fases por copia (la copia 0 arranca en la fase configurada)
      this.fm4Fb = new Float32Array(this.octaves * 7 * 2);   // FM4: memoria de realimentación del op 4
      for (let i = 0; i < this.octaves * 7; i++) for (let op = 0; op < 4; op++) this.fm4Ph[i * 4 + op] = (i % 7 === 0) ? ph : rnd();
      this.fm4Out = new Float32Array(4);
      for (let i = 0; i < this.phases.length; i++) {
        this.phases[i] = (i % 7 === 0) ? ph : rnd();
        this.modPhases[i] = (i % 7 === 0) ? ph : rnd();
      }
    }
    this.gph = (typeof o.gphase === 'number') ? (o.gphase % 1 + 1) % 1 : 0;   // fase fantasma del maestro (sync): arranca donde el B
    this.pend = null;   // sync: residuo PolyBLEP pendiente para la muestra siguiente, por copia
    this.stopped = false;
    this.t = 0;         // segundos desde que nació el nodo (reserva: si la Voice no manda t0)
    // t0: instante (reloj de audio) en que ARRANCA la nota — el VCA abre ahí. Las
    // envolventes por operador del FM4 se miden desde t0, no desde que nace el
    // nodo: entre crear el worklet y que suene pasan el look-ahead (5 ms), el
    // nacimiento del processor y el jitter del hilo principal (en directo, de 5 a
    // 30 ms y variable; con notas programadas por el arp o los jugadores, hasta
    // 120 ms). Con el reloj propio, un modulador de 30 ms (el «clic» de un bombo)
    // ya se había gastado cuando abría el VCA — unas veces sí y otras no.
    // Y si el processor nace DESPUÉS de t0 (en directo el nodo tarda 6-12 ms en
    // producir), el sonido empieza al nacer: la envolvente cuenta desde ese
    // primer bloque (tBirth), no desde un t0 que ya pasó — el clic llega entero.
    this.t0 = (typeof o.t0 === 'number') ? o.t0 : null;
    this.tBirth = null;
    this.driftZ = 0;    // estado del paseo aleatorio de drift (independiente por oscilador)
    this.wt = (this.type === 'tabla' && o.wt && o.wt.frames) ? o.wt : null;
    this.port.onmessage = (e) => { if (e.data === 'stop') this.stopped = true; };
  }

  process(inputs, outputs, params) {
    const out = outputs[0];
    if (!out || out.length === 0) return !this.stopped;
    const ch = out[0], N = ch.length;             // el buffer llega a cero: acumulamos con +=
    const sr = sampleRate, TWO_PI = Math.PI * 2;
    // Puerta de arranque: hasta t0 (el arranque de la nota, que la Voice cuantiza a
    // frontera de bloque) el oscilador CALLA y sus fases no avanzan, así la nota
    // empieza exactamente en la fase configurada, igual en cada golpe. Antes corría
    // libre desde que nacía el nodo y la fase en t0 era azar: con ataque 0
    // (percusión) el escalón del VCA pillaba la onda en cualquier punto y el golpe
    // cambiaba de una nota a otra. El bloque que EMPIEZA en t0 ya se procesa.
    if (this.t0 !== null && currentTime + N / sr <= this.t0 + 1e-6) return !this.stopped;
    const type = this.type, oct = this.octaves, nyq = sr * 0.45;
    // Drift analógico: paseo aleatorio con retorno al centro (OU discreto, un paso
    // por bloque). Con a=0.998 la constante de tiempo es ~500 bloques (~1.3 s) y la
    // desviación típica de z es ~1, así que el knob (cents) ES la excursión típica.
    let driftCt = 0;
    const dAmt = params.drift[0];
    if (dAmt > 0) {
      this.driftZ = this.driftZ * 0.998 + (this.rnd() * 2 - 1) * 0.0632;
      const z = this.driftZ < -2.5 ? -2.5 : (this.driftZ > 2.5 ? 2.5 : this.driftZ);
      driftCt = z * dAmt;
    }
    const f0 = params.frequency[0] * Math.pow(2, (params.detune[0] + driftCt) / 1200);
    // Tono propio del esclavo (Pitch A): a 0, exactamente f0 (los presets de siempre, bit a bit)
    const slave = params.slave ? params.slave[0] : 0, fs = slave ? f0 * Math.pow(2, slave / 1200) : f0;
    const syncR = params.syncRatio ? params.syncRatio[0] : 0;

    // Unison generalizado (no aplica al supersaw, que ya es unison de 7 sierras).
    // Copias repartidas linealmente en ±uniDetune cents; nivel 1/sqrt(N).
    let uv = params.uniVoices[0] | 0; if (uv < 1) uv = 1; else if (uv > 7) uv = 7;
    const uniCt = params.uniDetune[0], lvl = 1 / Math.sqrt(uv);
    const uniMul = j => (uv < 2 || uniCt <= 0) ? 1
      : Math.pow(2, ((2 * j / (uv - 1) - 1) * uniCt) / 1200);

    if (syncR > 0 && SYNC_TYPES.has(type) && !(type === 'sine' && params.fmIndex[0] > 0)) {
      this._synced(ch, N, params, fs, f0 * syncR, uv, lvl, uniMul);
    } else if (type === 'supersaw') {
      const spread = params.spread[0], phases = this.phases;
      for (let k = 0; k < oct; k++) {
        const base = fs * (1 << k);
        if (base >= nyq) continue;                // octava sobre Nyquist: silencio, no alias
        for (let j = 0; j < 7; j++) {
          const f = base * (1 + SS_DETUNE[j] * spread * 0.25);   // hasta ~±47 cents en los extremos
          const dt = f / sr, idx = k * 7 + j;
          let p = phases[idx];
          for (let i = 0; i < N; i++) {
            ch[i] += (2 * p - 1 - polyBlep(p, dt)) * 0.38;       // ~1/sqrt(7): nivel de una sierra
            p += dt; if (p >= 1) p -= 1;
          }
          phases[idx] = p;
        }
      }
    } else if (type === 'sine') {
      // FM = phase modulation (2-op estilo DX): modulador seno a freq*ratio. Limpio en seno.
      // Con unison, cada copia lleva su propio par portadora/modulador.
      const ratio = params.fmRatio[0], index = params.fmIndex[0];
      const beta = (params.fmFb ? params.fmFb[0] : 0) * FM_FB_MAX;
      for (let k = 0; k < oct; k++) {
        const base = fs * (1 << k);
        if (base >= nyq) continue;
        for (let j = 0; j < uv; j++) {
          const f = base * uniMul(j);
          const dt = f / sr, mdt = (f * ratio) / sr, idx = k * 7 + j;
          let p = this.phases[idx], mp = this.modPhases[idx];
          if (index > 0 && beta > 0) {
            // modulador realimentado: su propia salida (promediada) entra en su fase
            let y1 = this.fb1[idx], y2 = this.fb2[idx];
            for (let i = 0; i < N; i++) {
              const m = Math.sin(TWO_PI * mp + beta * (y1 + y2) * 0.5);
              y2 = y1; y1 = m;
              ch[i] += Math.sin(TWO_PI * (p + m * index)) * lvl;
              p += dt; if (p >= 1) p -= 1;
              mp += mdt; if (mp >= 1) mp -= Math.floor(mp);
            }
            this.fb1[idx] = y1; this.fb2[idx] = y2;
          } else if (index > 0) {
            for (let i = 0; i < N; i++) {
              ch[i] += Math.sin(TWO_PI * (p + Math.sin(TWO_PI * mp) * index)) * lvl;
              p += dt; if (p >= 1) p -= 1;
              mp += mdt; if (mp >= 1) mp -= Math.floor(mp);
            }
          } else {
            for (let i = 0; i < N; i++) {
              ch[i] += Math.sin(TWO_PI * p) * lvl;
              p += dt; if (p >= 1) p -= 1;
            }
            mp = fract(mp + mdt * N);             // mantiene la fase del modulador coherente
          }
          this.phases[idx] = p; this.modPhases[idx] = mp;
        }
      }
    } else if (type === 'tabla') {
      const wt = this.wt;
      if (!wt) return !this.stopped;                // sin tablas: silencio (payload ausente)
      const F = wt.frames.length, h0 = wt.h0 || 512, LMAX = wt.frames[0].length - 1;
      // posición de morph -> par de frames adyacentes + peso
      let pos = params.wtPos[0]; if (pos < 0) pos = 0; else if (pos > 1) pos = 1;
      const x = pos * (F - 1), fA = F > 1 ? Math.min(F - 2, x | 0) : 0, ff = F > 1 ? x - fA : 0;
      const fB = fA + 1 < F ? fA + 1 : fA;
      // Compensación de sonoridad del morph: la mezcla lineal de frames poco
      // correlados pierde energía a mitad de camino (y dos ondas en contrafase
      // se CANCELAN). rms² de la mezcla = fórmula cerrada con la energía por
      // frame y la correlación de vecinos (precalculadas). Tope ×2: un nulo
      // real no se amplifica hasta el ruido. En los extremos la ganancia es 1.
      let gMix = 1;
      if (fB !== fA && wt.energia && wt.corr) {
        const Ea = wt.energia[fA], Eb = wt.energia[fB], c = wt.corr[fA];
        const mixE = (1 - ff) * (1 - ff) * Ea + ff * ff * Eb + 2 * ff * (1 - ff) * c;
        const target = (1 - ff) * Math.sqrt(Ea) + ff * Math.sqrt(Eb);
        gMix = mixE > 1e-6 ? Math.min(2, target / Math.sqrt(mixE)) : 2;
      }
      for (let k = 0; k < oct; k++) {
        const base = fs * (1 << k);
        if (base >= nyq) continue;
        for (let j = 0; j < uv; j++) {
          const f = base * uniMul(j);
          // nivel (mip): el mayor nº de armónicos que cabe bajo Nyquist a esta
          // frecuencia. Los caps van en h0 >> L => L = los "doblados" que sobran.
          const allowed = nyq / f;
          let L = 0; while ((h0 >> L) > allowed && L < LMAX) L++;
          const dA = wt.frames[fA][L], dB = wt.frames[fB][L], len = dA.length;
          const dt = f / sr, idx = k * 7 + j, amp = lvl * gMix;
          let p = this.phases[idx];
          for (let i = 0; i < N; i++) {
            // Hermite de 4 puntos (Catmull-Rom) sobre la MEZCLA de los dos frames
            // (el morph es lineal: mezclar antes de interpolar da lo mismo y la
            // cúbica se calcula una vez). Con la lineal y tablas 4×, el error caía ENTRE armónicos:
            // suelo inarmónico de −43 dB en Do4; con Hermite y tablas 8×, −76.
            const xx = p * len, i1 = xx | 0, w = xx - i1;
            const i0 = i1 === 0 ? len - 1 : i1 - 1, i2 = i1 + 1 === len ? 0 : i1 + 1, i3 = i2 + 1 === len ? 0 : i2 + 1;
            const a0 = dA[i0], a1 = dA[i1], a2 = dA[i2], a3 = dA[i3];
            const y0 = a0 + (dB[i0] - a0) * ff, y1 = a1 + (dB[i1] - a1) * ff, y2 = a2 + (dB[i2] - a2) * ff, y3 = a3 + (dB[i3] - a3) * ff;
            const c1 = 0.5 * (y2 - y0), c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3, c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
            ch[i] += (((c3 * w + c2) * w + c1) * w + y1) * amp;
            p += dt; if (p >= 1) p -= 1;
          }
          this.phases[idx] = p;
        }
      }
    } else if (type === 'fm4') {
      const alg = FM4_ALGS[Math.max(0, Math.min(FM4_ALGS.length - 1, params.fm4Alg[0] | 0))];
      const R = [params.fm4R1[0], params.fm4R2[0], params.fm4R3[0], params.fm4R4[0]];
      const beta = (params.fmFb ? params.fmFb[0] : 0) * FM_FB_MAX / TWO_PI;   // realimentación del op 4, en ciclos
      // envolvente por operador, k-rate (un valor por bloque de 2,9 ms: el
      // escalón es inaudible; con decay ≥ FM4_DEC_FLAT el nivel es constante)
      if (this.tBirth === null) this.tBirth = currentTime;   // primer bloque procesado (currentTime: reloj del AudioWorkletGlobalScope)
      const env = this.fm4Out, t = this.t0 !== null ? Math.max(0, currentTime - Math.max(this.t0, this.tBirth)) : this.t;
      const Lv = [params.fm4L1[0], params.fm4L2[0], params.fm4L3[0], params.fm4L4[0]];
      const D = [params.fm4D1[0], params.fm4D2[0], params.fm4D3[0], params.fm4D4[0]];
      for (let op = 0; op < 4; op++) env[op] = Lv[op] * (D[op] >= FM4_DEC_FLAT ? 1 : Math.exp(-t / Math.max(0.005, D[op])));
      const carG = lvl / Math.sqrt(alg.car.length), out = [0, 0, 0, 0], ph = this.fm4Ph, fbm = this.fm4Fb;
      for (let k = 0; k < oct; k++) {
        const base = fs * (1 << k);
        if (base >= nyq) continue;
        for (let j = 0; j < uv; j++) {
          const f = base * uniMul(j), idx = k * 7 + j, o = idx * 4, fo = idx * 2;
          const dt0 = f * R[0] / sr, dt1 = f * R[1] / sr, dt2 = f * R[2] / sr, dt3 = f * R[3] / sr;
          for (let i = 0; i < N; i++) {
            // de 3 a 0: los moduladores siempre tienen índice mayor que lo que modulan
            for (let op = 3; op >= 0; op--) {
              let m = 0; const ms = alg.mods[op]; for (let q = 0; q < ms.length; q++) m += out[ms[q]];
              let phase = ph[o + op] + m * FM4_MOD;
              if (op === 3 && beta > 0) phase += beta * (fbm[fo] + fbm[fo + 1]) * 0.5;
              const y = Math.sin(TWO_PI * phase) * env[op];
              out[op] = y;
              if (op === 3) { fbm[fo + 1] = fbm[fo]; fbm[fo] = y; }
            }
            let s = 0; const cs = alg.car; for (let q = 0; q < cs.length; q++) s += out[cs[q]];
            ch[i] += s * carG;
            ph[o] += dt0; if (ph[o] >= 1) ph[o] -= 1;
            ph[o + 1] += dt1; if (ph[o + 1] >= 1) ph[o + 1] -= Math.floor(ph[o + 1]);
            ph[o + 2] += dt2; if (ph[o + 2] >= 1) ph[o + 2] -= Math.floor(ph[o + 2]);
            ph[o + 3] += dt3; if (ph[o + 3] >= 1) ph[o + 3] -= Math.floor(ph[o + 3]);
          }
        }
      }
    } else if (type === 'triangle') {
      for (let k = 0; k < oct; k++) {
        const base = fs * (1 << k);
        if (base >= nyq) continue;
        for (let j = 0; j < uv; j++) {
          const dt = base * uniMul(j) / sr, idx = k * 7 + j;
          let p = this.phases[idx];
          for (let i = 0; i < N; i++) {
            ch[i] += (4 * Math.abs(p - 0.5) - 1) * lvl;   // armónicos impares suaves (1/n²)
            p += dt; if (p >= 1) p -= 1;
          }
          this.phases[idx] = p;
        }
      }
    } else if (type === 'square') {
      let duty = params.pulseWidth[0];
      if (duty < 0.01) duty = 0.01; else if (duty > 0.99) duty = 0.99;
      for (let k = 0; k < oct; k++) {
        const base = fs * (1 << k);
        if (base >= nyq) continue;
        for (let j = 0; j < uv; j++) {
          const dt = base * uniMul(j) / sr, idx = k * 7 + j;
          let p = this.phases[idx];
          for (let i = 0; i < N; i++) {
            let v = p < duty ? 1 : -1;
            v += polyBlep(p, dt);
            v -= polyBlep(fract(p - duty), dt);
            ch[i] += v * lvl;
            p += dt; if (p >= 1) p -= 1;
          }
          this.phases[idx] = p;
        }
      }
    } else {                                      // sawtooth
      for (let k = 0; k < oct; k++) {
        const base = fs * (1 << k);
        if (base >= nyq) continue;
        for (let j = 0; j < uv; j++) {
          const dt = base * uniMul(j) / sr, idx = k * 7 + j;
          let p = this.phases[idx];
          for (let i = 0; i < N; i++) {
            ch[i] += (2 * p - 1 - polyBlep(p, dt)) * lvl;
            p += dt; if (p >= 1) p -= 1;
          }
          this.phases[idx] = p;
        }
      }
    }

    this.t += N / sr;
    for (let c = 1; c < out.length; c++) out[c].set(ch);
    return !this.stopped;
  }

  // SYNC DURO. El esclavo no OYE al maestro: lleva una fase FANTASMA a la frecuencia
  // del B (fm = la del A sin Pitch A × syncRatio, que trae las octavas y los detunes de
  // los dos; vibrato, pitch env, glide y bend mueven a los dos igual y se cancelan) y,
  // cuando esa fase da la vuelta, reinicia la suya a 0. Cada reinicio es un ESCALÓN de
  // altura H = w(0) − w(fase a la que se cortó), y un escalón digital a pelo genera
  // aliasing (ruido metálico que no sigue la nota). Se corrige con el residuo PolyBLEP
  // del escalón, el de las aristas de la sierra pero con su altura real: si cae a τ
  // muestras de la muestra n, n recibe H/2·(1−τ)² y n+1 −H/2·τ² (por eso se guarda un
  // residuo pendiente por copia). Las aristas NATURALES (el diente de la sierra, los
  // flancos de la cuadrada) van por el mismo camino: sin reinicios, esto es el PolyBLEP
  // de siempre. Un solo maestro para todas las copias: octavas apiladas y unison se
  // reinician juntas, como en un sync analógico. La deriva del maestro es la del A (el
  // B real tiene la suya: el sync sigue a la nota, no a la deriva del B).
  // El reinicio también rompe la PENDIENTE (en el triángulo, el seno y la tabla, lo
  // único que cambia de golpe cuando el valor casualmente coincide): un cambio de
  // pendiente ΔS (por muestra) se corrige con el PolyBLAMP, la integral del residuo
  // anterior: ΔS·(1−τ)³/6 a la muestra de antes y ΔS·τ³/6 a la de después. Sin él,
  // el triángulo con sync quedaba ~20 dB más sucio que sin sync.
  _synced(ch, N, params, fs, fm, uv, lvl, uniMul) {
    const sr = sampleRate, nyq = sr * 0.45, type = this.type, oct = this.octaves;
    // 1) dónde da la vuelta el maestro en este bloque: rst[i] = τ si es entre la muestra i y la i+1, −1 si no
    const rst = this.rst && this.rst.length >= N ? this.rst : (this.rst = new Float32Array(N));
    const dtm = Math.min(0.999, fm / sr);
    let g = this.gph;
    for (let i = 0; i < N; i++) {
      if (g + dtm >= 1) { rst[i] = (1 - g) / dtm; g += dtm - 1; } else { rst[i] = -1; g += dtm; }
    }
    this.gph = g;
    if (!this.pend) this.pend = new Float32Array(oct * 7);
    // 2) la onda: valor ingenuo w(p) y aristas naturales [fase, altura]
    let duty = params.pulseWidth[0]; if (duty < 0.01) duty = 0.01; else if (duty > 0.99) duty = 0.99;
    // y su pendiente por unidad de fase, s(p)
    let w = null, s = null, edges = [], amp = lvl, wt = null;
    if (type === 'sawtooth') { w = p => 2 * p - 1; s = () => 2; edges = [[1, -2]]; }
    else if (type === 'square') { w = p => (p < duty ? 1 : -1); s = () => 0; edges = [[duty, -2], [1, 2]]; }
    else if (type === 'triangle') { w = p => 4 * Math.abs(p - 0.5) - 1; s = p => (p < 0.5 ? -4 : 4); }   // sus picos, sin corregir: como arriba
    else if (type === 'sine') { w = p => Math.sin(2 * Math.PI * p); s = p => 2 * Math.PI * Math.cos(2 * Math.PI * p); }
    else if (type === 'tabla') { wt = this._wtMorph(params); if (!wt) return; amp = lvl * wt.gMix; }
    for (let k = 0; k < oct; k++) {
      const base = fs * (1 << k);
      if (base >= nyq) continue;
      for (let j = 0; j < uv; j++) {
        const f = base * uniMul(j), dt = f / sr, idx = k * 7 + j;
        let wv = w, sv = s;
        if (wt) {                                    // tabla: el mip de esta frecuencia
          const allowed = nyq / f, LMAX = this.wt.frames[0].length - 1, h0 = this.wt.h0 || 512;
          let L = 0; while ((h0 >> L) > allowed && L < LMAX) L++;
          const dA = this.wt.frames[wt.fA][L], dB = this.wt.frames[wt.fB][L], len = dA.length, ff = wt.ff;
          wv = p => wtHermite(dA, dB, ff, len, p);
          const e = 0.25 / len;                    // pendiente: diferencia centrada a un cuarto de muestra de tabla
          sv = p => (wtHermite(dA, dB, ff, len, fract(p + e)) - wtHermite(dA, dB, ff, len, fract(p - e + 1))) / (2 * e);
        }
        const w0 = wv(0), s0 = sv(0);
        let p = this.phases[idx], pend = this.pend[idx];
        for (let i = 0; i < N; i++) {
          let y = wv(p) + pend; pend = 0;
          const tau = rst[i];
          const pe = tau >= 0 ? p + tau * dt : p + dt;   // hasta dónde llega la fase: el reinicio o el final del intervalo
          for (let e = 0; e < edges.length; e++) {
            const ph = edges[e][0];
            let te = -1;
            if (p < ph && ph <= pe) te = (ph - p) / dt;
            else if (ph < 1 && ph <= pe - 1) te = (1 + ph - p) / dt;   // flanco tras la vuelta natural (ciclo de trabajo mínimo)
            if (te >= 0) { const h = edges[e][1] * 0.5; y += h * (1 - te) * (1 - te); pend -= h * te * te; }
          }
          if (tau >= 0) {
            const pr = pe >= 1 ? pe - 1 : pe;
            const h = (w0 - wv(pr)) * 0.5;                   // el escalón del reinicio (PolyBLEP)
            y += h * (1 - tau) * (1 - tau); pend -= h * tau * tau;
            const dS = (s0 - sv(pr)) * dt, u = 1 - tau;      // y su cambio de pendiente (PolyBLAMP)
            y += dS * u * u * u / 6; pend += dS * tau * tau * tau / 6;
            p = (1 - tau) * dt;
            for (let e = 0; e < edges.length; e++) {   // un flanco ya en el tramo tras el reinicio (cuadrada muy estrecha)
              const ph = edges[e][0];
              if (ph <= p) { const te = tau + ph / dt, h = edges[e][1] * 0.5; y += h * (1 - te) * (1 - te); pend -= h * te * te; }
            }
          } else p = pe >= 1 ? pe - 1 : pe;
          ch[i] += y * amp;
        }
        this.phases[idx] = p; this.pend[idx] = pend;
      }
    }
  }

  // Morph de la tabla: par de frames adyacentes, peso y compensación de sonoridad
  // (la del bucle de 'tabla', aquí para el sync). null sin tablas.
  _wtMorph(params) {
    const wt = this.wt; if (!wt) return null;
    const F = wt.frames.length;
    let pos = params.wtPos[0]; if (pos < 0) pos = 0; else if (pos > 1) pos = 1;
    const x = pos * (F - 1), fA = F > 1 ? Math.min(F - 2, x | 0) : 0, ff = F > 1 ? x - fA : 0;
    const fB = fA + 1 < F ? fA + 1 : fA;
    let gMix = 1;
    if (fB !== fA && wt.energia && wt.corr) {
      const Ea = wt.energia[fA], Eb = wt.energia[fB], c = wt.corr[fA];
      const mixE = (1 - ff) * (1 - ff) * Ea + ff * ff * Eb + 2 * ff * (1 - ff) * c;
      const target = (1 - ff) * Math.sqrt(Ea) + ff * Math.sqrt(Eb);
      gMix = mixE > 1e-6 ? Math.min(2, target / Math.sqrt(mixE)) : 2;
    }
    return { fA, fB, ff, gMix };
  }
}

registerProcessor('pulse-processor', PulseProcessor);
