/* =====================================================================
   SubSDJ · Sala — el ESPACIO: delay ping-pong «de cinta», reverb por
   convolución (IR generada por código), limitador, máster y analizador.
   Modelo de ENVÍOS (send/return), como los multitímbricos de los 90: cada
   motor le manda su señal seca (la mezcla) y dos envíos — cuánto de él va
   al delay y cuánto a la reverb. La sala es UNA: tamaño, damp, tiempo del
   eco, BPM… Cuatro músicos en una sala: cada uno decide a qué distancia
   del micro se pone; ninguno decide el tamaño de la sala.
     · modo de siempre: cada AudioEngine crea la suya y suena como siempre
       (envío con retorno a 1 ≡ el wet de antes, por linealidad; los ecos
       entran en la reverb por `dlyToRev` = reverbMix, como antes).
     · modo Partes (engine/parts.js): UNA Sala compartida por las partes.
   SALA_KEYS = claves de PARAMS que son de la sala, no del instrumento: en
   modo Partes el rack las edita para todas las partes a la vez y los
   presets no las tocan (registry.loadState las salta). `engines` = motores
   enganchados: set() mantiene su S en sincronía (Arp/Seq/WaveSeq leen el
   S.bpm de su propio motor: un solo reloj para la escena).
   ===================================================================== */
import { makeIR, mkLFO, setLfoShape } from './nodes.js';

// Limitador de salida (ver worklets/limiter-processor.js): mismo retraso (6 ms) y
// misma ganancia por debajo del umbral (+1,71 dB, medida) que el DynamicsCompressor
// al que sustituye; techo de verdad en −1 dBFS; release como el de antes.
export const LIM_LOOKAHEAD = 0.006, LIM_CEIL_DB = -1, LIM_MAKEUP_DB = 1.71, LIM_RELEASE = 0.1;
// Margen fijo delante del limitador (1.1.0). Antes cada voz iba tan fuerte que una
// nota sola ya rozaba el techo, y un acorde de pad lo pisaba 4-8 dB: el limitador
// recortaba todo el sostenido y su ganancia subía y bajaba con los picos del batido
// de las sierras desafinadas (el acorde «sucio, con altibajos» que oyó Sergio).
// Con este margen un acorde de cuatro notas de un pad no lo toca: el limitador
// vuelve a ser red de seguridad. Calibrado midiendo los presets de fábrica.
export const HEADROOM_DB = -9;

export const SALA_KEYS = new Set(['bpm', 'swing', 'dlyTime', 'dlySync', 'dlyDamp', 'dlyWow', 'dlySat',
                                  'reverbSize', 'reverbDamp', 'reverbPre', 'reverbType', 'shimAmt', 'shimInt',
                                  'tapeSat', 'tapeWow']);

// Shimmer (Roadmap 5.0 · bloque 3): bucle cola → HP → LP → desplazador de tono
// (worklets/shift-processor.js) → ×ganancia → entrada de la reverb. Cada vuelta
// sube el intervalo elegido: la cola se vuelve un coro que asciende (Eno/Lanois).
// La ganancia del bucle se CALIBRA contra la energía de la reverb: una reverb
// devuelve mucha menos energía de la que entra (la IR normalizada por WebAudio
// tiene RMS fija 0,00126 → energía ≈ 0,07·Size; la placa, medida en Node con un
// impulso, de 0,08 a Size 1 a 0,54 a Size 20), así que con una ganancia fija
// cada vuelta perdía ~9 dB y no había coro. Con g = √(amt·SHIM_LOOP_MAX / G) la
// energía por vuelta es amt·SHIM_LOOP_MAX sea cual sea el Size y el tipo: a
// tope, 0,8 < 1 (estable; la acumulación en régimen es 1/(1−0,8) = ×5 de
// energía, que el knob Mix y el limitador absorben), y da igual girar Size.
// HP/LP del bucle: sin graves que se acumulen vuelta tras vuelta y con el
// espectro de entrada al desplazador acotado (a +12 lo que entra a 5 kHz sale
// a 10 kHz: ahí la escalera de octavas se extingue sola).
const SHIM_LOOP_MAX = 0.8, SHIM_G_MAX = 8, SHIM_HP = 120, SHIM_LP = 5000;
const IR_G_PER_S = 0.0699;   // 44100 · 0,00125893²: la constante de normalización del ConvolverNode
const PLATE_G = [[0.5, 0.075], [1, 0.082], [2, 0.114], [4, 0.189], [8, 0.351], [12, 0.409], [20, 0.538]];   // medida (damp 0)
const tableAt = (tab, x) => {
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) { const [x0, y0] = tab[i - 1], [x1, y1] = tab[i]; if (x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return tab[tab.length - 1][1];
};
export const reverbEnergyGain = (type, size) => type === 'placa' ? tableAt(PLATE_G, size) : IR_G_PER_S * size;
// Freeze: la placa a decay FREEZE_DECAY (un pelo bajo 1: el tanque es casi sin
// pérdidas y la cola tarda ~media hora en caer 60 dB) con la ENTRADA cerrada: lo
// que estaba sonando se queda. Solo la placa tiene estado que congelar (la IR
// es un FIR: no retiene nada). Al cerrar la entrada se corta también el bucle
// del shimmer: realimentar un tanque sin pérdidas crecería sin tope.
export const FREEZE_DECAY = 0.9995;

// Cinta en el MÁSTER (Roadmap 5.0 · bloque 7): suma (seco + retornos) →
// saturación suave → wow/flutter → limitador. El «pegamento degradado» de
// Arnalds, Frahm o Guðnadóttir: la mezcla entera pasa por la misma cinta, así
// que las partes se funden. Las dos etapas son transparentes EXACTAS a 0
// (caminos secos a ganancia 1 y húmedos a 0: los renders de siempre no cambian
// ni una muestra; el wow a 0 ni siquiera añade su latencia).
// Revisión tras ESCUCHAR (Sergio, 2026-10-03): la primera versión (rodilla
// k = 2, entrada ×3) «petardeaba» con un acorde de tres notas — era
// intermodulación: con el sub a −1 el pico de la mezcla pasa de 1,5 y eso, con
// esa curva, ya es recorte duro, no cinta. Ahora la curva es tanh(x) a secas
// (pendiente 1 en el origen: la señal pequeña sale como entra), la entrada sube
// como mucho ×2 y el knob entra AL CUADRADO (la mitad baja es solo color; la
// alta, compresión). El wow a ±7 ct no se oía en un pad que ya lleva detune
// de ±7 y ensemble: ahora ±25 ct a tope. El siseo fijo se QUITÓ: un ruido que
// no reacciona a lo que tocas no aporta (el aire que sigue a las notas ya lo da
// el knob Ruido de cada voz).
const TAPE_SAT_DRIVE = 1;         // ganancia de entrada a tope: 1 + DRIVE·sat² = ×2 (+6 dB)
const TAPE_SAT_MAKEUP = 0.52;     // 1/(1 + 0,52·sat²): a tope, un seno de pico 0,5 sale al mismo nivel (tanh(1)·0,656 = 0,5)
const TAPE_LP_MIN = 8000;         // Hz: la cinta pierde agudos al saturar (log de 20 kHz a esto)
const TAPE_DLY = 0.008;           // s: retardo base de la línea de wow (mayor que la excursión máxima)
// Wow: la desviación de tono es la DERIVADA del retardo (2π·f·d). Con la forma
// 'drift' (componentes 0,375…1,625 × f, normalizada a ±1) y 6 ms a 0,8 Hz salen
// ≈ ±40 ct a tope: a tope es cinta ESTROPEADA, a propósito (a 0,3, ±12 ct, el
// vaivén de una pletina real). La 2ª versión (±15 ct medidos) Sergio no la oía.
const TAPE_WOW_HZ = 0.8, TAPE_WOW_DEPTH = 0.006;      // deriva irregular: ≈ ±40 ct a tope
const TAPE_FLUT_HZ = 6.5, TAPE_FLUT_DEPTH = 0.00008;  // flutter (el motor de arrastre): ≈ ±6 ct
const TAPE_CURVE = (() => { const n = 2048, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x); } return c; })();
const tapeLP = sat => 20000 * Math.pow(TAPE_LP_MIN / 20000, sat);
const tapePre = sat => 1 + TAPE_SAT_DRIVE * sat * sat, tapePost = sat => 1 / (1 + TAPE_SAT_MAKEUP * sat * sat);

// Placa (worklets/plate-processor.js, Dattorro): el Size del knob es un RT60 en
// segundos. Tabla MEDIDA (impulso en Node, pendiente de la cola entre 0,5 y
// 1,5 s, damp 0): RT60 1,17 s ↔ decay 0,3 · 1,84 ↔ 0,5 (el del artículo) ·
// 2,38 ↔ 0,6 · 3,22 ↔ 0,7 · 4,72 ↔ 0,8 · 8,25 ↔ 0,9. Interpolación lineal
// entre puntos; por debajo del primero, la fórmula 10^(−0,61/RT).
// Colas LARGAS (Roadmap 5.0, Size hasta 20 s): la caída del tanque no es una
// exponencial pura — el tramo inicial cae más deprisa (la difusión de los
// allpass reparte la energía) y la cola tardía, más despacio. Para lo que se
// OYE en una cola de 20 s manda la pendiente tardía, así que los puntos nuevos
// se midieron entre 1 y 15 s (mismo impulso, damp 0, mod 0,5): 16,2 s ↔ 0,93 ·
// 21,8 ↔ 0,95 · 26,3 ↔ 0,96. Los seis primeros se conservan tal cual (los
// presets de siempre no cambian); entre 8,25 y 16,2 la interpolación une
// ambas medidas de forma monótona. Size 20 ↔ decay ≈ 0,943 (el worklet admite 0,98).
const PLATE_RT = [[1.17, 0.3], [1.84, 0.5], [2.38, 0.6], [3.22, 0.7], [4.72, 0.8], [8.25, 0.9],
                  [16.2, 0.93], [21.8, 0.95], [26.3, 0.96]];
export function plateDecay(size) {
  if (size <= PLATE_RT[0][0]) return Math.pow(10, -0.611 / Math.max(0.2, size));
  for (let i = 1; i < PLATE_RT.length; i++) {
    const [s0, d0] = PLATE_RT[i - 1], [s1, d1] = PLATE_RT[i];
    if (size <= s1) return d0 + (d1 - d0) * (size - s0) / (s1 - s0);
  }
  return PLATE_RT[PLATE_RT.length - 1][1];
}
// Topes de las líneas de retardo (se fijan al crear el nodo): el delay llega a
// 4 s (PARAMS.dlyTime.max) más el wow; el predelay de la reverb a 250 ms.
export const DLY_MAX = 4.5, REV_PRE_MAX = 0.25;
const PLATE_MOD = 0.5;   // excursión de los allpass modulados (0..1): descorrela los modos sin marear

// Delay «de cinta»: filtros DENTRO del bucle del ping-pong y wow del tiempo.
// Damp recorre en log el LP de Nyquist a DLY_DAMP_LP_MIN y el HP de 0 Hz a
// DLY_DAMP_HP_MAX (cinta/BBD: cada vuelta pierde agudos y algo de graves).
// Wow = dos LFOs lentos a velocidades distintas L/R sobre delayTime; a tope
// ±DLY_WOW_DEPTH s => desvío de pitch ≈ 2π·f·d ≈ ±1 % (unos 17 ct) por repetición.
const DLY_DAMP_LP_MIN = 1200;                        // Hz: LP del bucle a Damp 1
const DLY_DAMP_HP_MIN = 20, DLY_DAMP_HP_MAX = 200;   // Hz: HP del bucle (Damp 0+ … Damp 1)
const DLY_WOW_HZ = 0.6, DLY_WOW_DEPTH = 0.0025;      // s: ±2,5 ms a Wow 1
// Velocidad máxima a la que cambia el tiempo de eco (s de retardo por s): como una cinta, no salta.
// La lectura va a 1 − dD/dt de velocidad: un cambio pequeño (girar el knob) llega en ~20 ms y el
// tono resbala (el dub); uno grande (un mando MIDI de golpe, otra división, otro BPM) barre seguido
// en vez de dar un raspazo — de 0,3 a 4 s el cabezal recorría 3,7 s de cinta en 20 ms (tono ×185).
// Por debajo de 1 la cinta nunca va hacia atrás: con 0,9, al alargar el eco el tono cae hasta ~3
// octavas (la cinta frenando) y al acortarlo sube hasta ~11 semitonos.
const DLY_SLEW = 0.9;
// Delay que se desboca (Roadmap 7.0 · 4.1): saturación DENTRO del bucle del ping-pong. Cada rama de
// realimentación se reparte entre un camino limpio (1 − w) y uno saturado (w), tanh(D·x)/D: ganancia 1
// en pequeña señal (los dos caminos suenan igual de fuertes) y techo 1/D. w es la Saturación, pero
// sube SOLA cuando la realimentación pasa de DLY_SAT_AUTO[0]: por encima de 1 cada vuelta crecería sin
// fin, y con el tanh dentro crece hasta que el techo la sujeta y se queda oscilando estable (la sirena
// del dub). Con w = 0 el camino limpio es el de siempre: los ecos de antes, exactos. Sin sobremuestreo:
// el retraso del sobremuestreo descuadraría los dos caminos (peine) en la mezcla.
const DLY_SAT_AUTO = [0.9, 1];     // la saturación entra sola entre estas realimentaciones (a 1, entera)
const DLY_SAT_DRIVE = 9;           // Saturación 1 → drive ×10, en cuadrado (la mitad baja es color; a tope, ecos sucios ya a −20 dBFS)
const DLY_SAT_RANGE = 8;           // la curva cubre ±8 a la entrada (el bucle desbocado no pasa de ~2)
const DLY_SAT_CURVE = (() => { const n = 8193, c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(DLY_SAT_RANGE * (2 * i / (n - 1) - 1)); return c; })();

export class Sala {
  // S: estado con las SALA_KEYS (modo único: el S del propio motor; modo
  // Partes: el estado de la escena). fb = realimentación del delay (modo
  // único: sigue al knob Amount, como siempre; Partes: knob de la sala).
  // dlyToRev = cuánto eco entra en la reverb (modo único = reverbMix).
  constructor(ctx, S, { fb = 0.45, dlyToRev = 0.5, master = 0.7, dest = ctx.destination } = {}) {
    this.ctx = ctx; this.S = S;
    this.engines = [];                               // motores cuyo S se mantiene en sincronía

    // --- Entradas ---
    this.dry = ctx.createGain();                     // mezcla seca de los motores
    this.dlyIn = ctx.createGain();                   // envío al delay: suma a mono (el ping-pong parte del centro)
    this.dlyIn.channelCount = 1; this.dlyIn.channelCountMode = 'explicit';
    this.revIn = ctx.createGain();                   // envío a la reverb (estéreo)
    this.sum = ctx.createGain();                     // seco + retornos

    // --- Delay ping-pong (estéreo): los ecos rebotan L<->R ---
    this.dlyL = ctx.createDelay(DLY_MAX); this.dlyL.delayTime.value = this._dlyT = this._effDelay();
    this.dlyR = ctx.createDelay(DLY_MAX); this.dlyR.delayTime.value = this._effDelay();
    this.ppFbL = ctx.createGain(); this.ppFbR = ctx.createGain();
    this.ppFbL.gain.value = this.ppFbR.gain.value = fb;
    this._fb = fb;
    // saturación del bucle (ver DLY_SAT_*): limpio (1 − w) + tanh(D·x)/D (w), en cada rama
    const mkSat = () => {
      const dry = ctx.createGain(), pre = ctx.createGain(), sh = ctx.createWaveShaper(), post = ctx.createGain(), wet = ctx.createGain();
      sh.curve = DLY_SAT_CURVE; pre.connect(sh); sh.connect(post); post.connect(wet);
      return { dry, pre, sh, post, wet };
    };
    this.fbSatL = mkSat(); this.fbSatR = mkSat();
    this._dlySatGains((p, v) => { p.value = v; });
    this.ppMerge = ctx.createChannelMerger(2);
    this.dlRet = ctx.createGain();                   // retorno a 1: el nivel lo pone el ENVÍO de cada parte
    // «Cinta»: LP+HP Butterworth (Q en dB: −3 = plano) a la ENTRADA de cada
    // línea — así la 1ª repetición ya pasa una vez por el filtro, la 2ª dos…
    // como el eco de cinta/BBD, que oscurece cada vuelta. A Damp 0 el LP se
    // pone en Nyquist y el HP en 0 Hz: el biquad de WebAudio los reduce a la
    // IDENTIDAD exacta (coeficientes unidad), los presets de siempre no cambian.
    const dampF = this._dampFreqs(S.dlyDamp);
    const mkDamp = () => {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';  lp.Q.value = -3; lp.frequency.value = dampF.lp;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.Q.value = -3; hp.frequency.value = dampF.hp;
      lp.connect(hp); return { lp, hp };
    };
    this.dampL = mkDamp(); this.dampR = mkDamp();
    // wow: dos LFOs lentos a velocidades distintas L/R (descorrelados: cada
    // rebote del ping-pong se desafina distinto y el eco se ensancha)
    this.wowL = mkLFO(ctx, DLY_WOW_HZ, S.dlyWow * DLY_WOW_DEPTH);        this.wowL.depth.connect(this.dlyL.delayTime);
    this.wowR = mkLFO(ctx, DLY_WOW_HZ * 1.13, S.dlyWow * DLY_WOW_DEPTH); this.wowR.depth.connect(this.dlyR.delayTime);

    // --- Reverb por convolución (IR generada). DOS convolvers en A/B: la IR
    // nueva entra por el que está apagado y se cruza en ~50 ms, sin cortar en
    // seco la cola de la anterior. Predelay: DelayNode antes de los convolvers
    // (separa el ataque de la cola). ---
    this.revPre = ctx.createDelay(REV_PRE_MAX); this.revPre.delayTime.value = S.reverbPre;
    this.convA = ctx.createConvolver(); this.convA.buffer = makeIR(ctx, S.reverbSize, 2.5, S.reverbDamp);
    this.convB = ctx.createConvolver();
    this.revXA = ctx.createGain(); this.revXA.gain.value = 1;
    this.revXB = ctx.createGain(); this.revXB.gain.value = 0;
    this._revFront = 'A'; this._irStale = false;
    // Dos reverbs a elegir (reverbType): «sala» = convolución con la IR de
    // ruido; «placa» = algorítmica (worklet Dattorro, se crea al elegirla).
    // Crossfade entre ambas; solo la activa recibe entrada (la otra no gasta).
    this.irMix = ctx.createGain(); this.irMix.gain.value = S.reverbType === 'placa' ? 0 : 1;
    this.plateMix = ctx.createGain(); this.plateMix.gain.value = S.reverbType === 'placa' ? 1 : 0;
    this.plate = null;
    this.revRet = ctx.createGain();                  // retorno a 1 (idem: el nivel lo pone el envío)
    this.dlyToRev = ctx.createGain(); this.dlyToRev.gain.value = dlyToRev;   // eco → reverb (los ecos viven en la sala)

    // --- Limitador de salida -> máster -> analizador ---
    // Brickwall con 6 ms de lookahead (worklets/limiter-processor.js): nunca deja
    // pasar nada por encima de LIM_CEIL_DB y reparte la bajada de ganancia en el
    // lookahead (sin la aspereza del DynamicsCompressor de antes al apretarlo).
    // Por debajo del techo es lineal con +1,71 dB: lo mismo que sumaba aquel.
    this.comp = new AudioWorkletNode(ctx, 'limiter-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      processorOptions: { lookahead: LIM_LOOKAHEAD, ceilingDb: LIM_CEIL_DB, makeupDb: LIM_MAKEUP_DB, release: LIM_RELEASE } });
    this.headroom = ctx.createGain(); this.headroom.gain.value = Math.pow(10, HEADROOM_DB / 20);
    this.master = ctx.createGain(); this.master.gain.value = master;
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0.8;

    // --- Cinta en el máster (ver constantes TAPE_*): dos etapas, cada una exacta a 0 ---
    this.tapeIn = ctx.createGain();
    // 1) saturación dry/wet
    this.satDry = ctx.createGain(); this.satDry.gain.value = 1 - S.tapeSat;
    this.satPre = ctx.createGain(); this.satPre.gain.value = tapePre(S.tapeSat);
    this.satShaper = ctx.createWaveShaper(); this.satShaper.curve = TAPE_CURVE; this.satShaper.oversample = '2x';
    this.satPost = ctx.createGain(); this.satPost.gain.value = tapePost(S.tapeSat);
    this.satLP = ctx.createBiquadFilter(); this.satLP.type = 'lowpass'; this.satLP.Q.value = -3; this.satLP.frequency.value = tapeLP(S.tapeSat);
    this.satWet = ctx.createGain(); this.satWet.gain.value = S.tapeSat;
    this.satOut = ctx.createGain();
    // 2) wow/flutter: línea corta modulada por una deriva irregular (buffer 'drift') y un seno rápido;
    //    a 0 el camino seco pasa entero (ni latencia ni fase); con wow > 0 pasa todo por la línea
    const wowOn = S.tapeWow > 0 ? 1 : 0;
    this.wowDry = ctx.createGain(); this.wowDry.gain.value = 1 - wowOn;
    this.wowWet = ctx.createGain(); this.wowWet.gain.value = wowOn;
    this.tapeDelay = ctx.createDelay(0.02); this.tapeDelay.delayTime.value = TAPE_DLY;
    this.tapeWowLFO = mkLFO(ctx, TAPE_WOW_HZ, S.tapeWow * TAPE_WOW_DEPTH); setLfoShape(ctx, this.tapeWowLFO, 'drift');
    this.tapeFlutLFO = mkLFO(ctx, TAPE_FLUT_HZ, S.tapeWow * TAPE_FLUT_DEPTH);
    this.tapeWowLFO.depth.connect(this.tapeDelay.delayTime); this.tapeFlutLFO.depth.connect(this.tapeDelay.delayTime);
    this.tapeOut = ctx.createGain();

    // --- Conexiones ---
    this.dry.connect(this.sum);
    this.dlyIn.connect(this.dampL.lp);                                        // envío mono -> filtro de cinta -> línea L
    this.dampL.hp.connect(this.dlyL); this.dampR.hp.connect(this.dlyR);
    this.dlyL.connect(this.ppMerge, 0, 0);                                    // dlyL -> canal izquierdo
    this.dlyR.connect(this.ppMerge, 0, 1);                                    // dlyR -> canal derecho
    this.dlyL.connect(this.ppFbL); this.dlyR.connect(this.ppFbR);
    for (const [fb, sat, damp] of [[this.ppFbL, this.fbSatL, this.dampR], [this.ppFbR, this.fbSatR, this.dampL]]) {
      fb.connect(sat.dry); sat.dry.connect(damp.lp);                         // realimentación cruzada L->R / R->L (filtrada otra vez)…
      fb.connect(sat.pre); sat.wet.connect(damp.lp);                         // …limpia y saturada, mezcladas por w
    }
    this.ppMerge.connect(this.dlRet); this.dlRet.connect(this.sum);
    this.dlRet.connect(this.dlyToRev); this.dlyToRev.connect(this.revIn);     // los ecos también reverberan
    this.revIn.connect(this.revPre);
    this.convA.connect(this.revXA); this.revXA.connect(this.irMix);          // (convB no recibe entrada hasta el primer cambio de Size/Damp)
    this.convB.connect(this.revXB); this.revXB.connect(this.irMix);
    this.irMix.connect(this.revRet); this.plateMix.connect(this.revRet);
    if (S.reverbType === 'placa') { this._ensurePlate(); this.revPre.connect(this.plate); }
    else this.revPre.connect(this.convA);
    this.revRet.connect(this.sum);
    // suma → cinta (saturación → wow) → margen → máster → limitador → analizador. El
    // máster va DELANTE del limitador (1.1.0): bajarlo le quita trabajo (limpio) y
    // subirlo lo aprieta (más fuerte, comprimido). Se probó así el 2026-10-12 y se
    // revirtió porque el DynamicsCompressor de entonces dejaba pasar picos («16 notas»
    // clipeaba +0,3 dB); el limitador de ahora es brickwall con lookahead: |y| ≤ techo.
    // La cinta queda antes del margen: su saturación ve el mismo nivel de siempre.
    this.sum.connect(this.tapeIn);
    this.tapeIn.connect(this.satDry); this.satDry.connect(this.satOut);
    this.tapeIn.connect(this.satPre); this.satPre.connect(this.satShaper); this.satShaper.connect(this.satPost);
    this.satPost.connect(this.satLP); this.satLP.connect(this.satWet); this.satWet.connect(this.satOut);
    this.satOut.connect(this.wowDry); this.wowDry.connect(this.tapeOut);
    this.satOut.connect(this.tapeDelay); this.tapeDelay.connect(this.wowWet); this.wowWet.connect(this.tapeOut);
    this.tapeOut.connect(this.headroom); this.headroom.connect(this.master); this.master.connect(this.comp);
    this.comp.connect(this.analyser); this.analyser.connect(dest);

    // --- Shimmer (bajo demanda: el caso común shimAmt = 0 no paga el worklet) y freeze ---
    this.shim = null; this.frozen = false;
    if (S.shimAmt > 0) this._ensureShim();
  }

  // ---------- shimmer ----------
  _shimSemis() { return parseInt(this.S.shimInt, 10) || 12; }
  // ganancia (amplitud) del bucle para que la energía por vuelta sea amt·SHIM_LOOP_MAX
  _shimGain() {
    const G = reverbEnergyGain(this.S.reverbType, this.S.reverbSize);
    return Math.min(SHIM_G_MAX, Math.sqrt(this.S.shimAmt * SHIM_LOOP_MAX / Math.max(1e-3, G)));
  }
  _shimUpdate(smooth) { if (this.shim) smooth(this.shim.fb.gain, this._shimGain()); }
  _ensureShim() {
    if (this.shim) return this.shim;
    const ctx = this.ctx;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.Q.value = -3; hp.frequency.value = SHIM_HP;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';  lp.Q.value = -3; lp.frequency.value = SHIM_LP;
    const shift = new AudioWorkletNode(ctx, 'shift-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    shift.parameters.get('semitones').value = this._shimSemis();
    const fb = ctx.createGain(); fb.gain.value = this._shimGain();
    this.revRet.connect(hp); hp.connect(lp); lp.connect(shift); shift.connect(fb); fb.connect(this.revIn);   // revIn: con freeze se cierra y corta el bucle
    return this.shim = { hp, lp, shift, fb };
  }
  // Freeze (solo placa). `at` opcional en el reloj de audio (lo usa el selftest).
  // Devuelve si cambió algo: con la IR no hay estado que congelar y no hace nada.
  setFreeze(on, at = null) {
    on = !!on;
    if (on === this.frozen) return false;
    if (on && this.S.reverbType !== 'placa') return false;
    this.frozen = on;
    const t = at !== null ? at : this.ctx.currentTime;
    this.revIn.gain.setTargetAtTime(on ? 0 : 1, t, 0.05);
    this._ensurePlate().parameters.get('decay').setTargetAtTime(on ? FREEZE_DECAY : plateDecay(this.S.reverbSize), t, 0.05);
    return true;
  }

  // Claves de la sala (SALA_KEYS): actualiza el estado de TODOS los motores
  // enganchados (un solo BPM, una sola sala) y aplica al grafo.
  set(name, value) {
    this.S[name] = value;
    for (const e of this.engines) e.S[name] = value;
    const now = this.ctx.currentTime, smooth = (p, v) => p.setTargetAtTime(v, now, 0.02);
    switch (name) {
      case 'dlyDamp': { const f = this._dampFreqs(value);
        [this.dampL, this.dampR].forEach(d => { smooth(d.lp.frequency, f.lp); smooth(d.hp.frequency, f.hp); }); break; }
      case 'dlyWow': smooth(this.wowL.depth.gain, value * DLY_WOW_DEPTH); smooth(this.wowR.depth.gain, value * DLY_WOW_DEPTH); break;
      case 'dlySat': this._dlySatGains(smooth); break;
      case 'dlyTime':                                      // con sync activo manda el bpm, no el knob
      case 'dlySync':
      case 'bpm': { const tt = this._effDelay(), tau = Math.max(0.02, Math.abs(tt - (this._dlyT ?? tt)) / DLY_SLEW);   // pendiente inicial Δ/τ ≤ DLY_SLEW
        this._dlyT = tt; this.dlyL.delayTime.setTargetAtTime(tt, now, tau); this.dlyR.delayTime.setTargetAtTime(tt, now, tau); break; }
      case 'reverbPre': smooth(this.revPre.delayTime, value); break;
      case 'reverbSize':                                   // regenerar IR es costoso: lo aplazamos (debounce)
      case 'reverbDamp':                                   // (el damp vive en la IR: misma ruta)
        this._plateParams();                               // la placa cambia al instante (son dos params)
        this._shimUpdate(smooth);                          // la ganancia del bucle del shimmer sigue a la energía de la reverb (Size)
        if (this.S.reverbType === 'placa') { this._irStale = true; break; }   // la IR se rehará al volver a «sala»
        clearTimeout(this._revTimer);
        this._revTimer = setTimeout(() => this._swapIR(this.S.reverbSize), 120);
        break;
      case 'reverbType': if (this.frozen && value !== 'placa') this.setFreeze(false); this._setType(value); this._shimUpdate(smooth); break;   // la IR no congela: soltar antes de cambiar
      // cinta en el máster (TAPE_*): cada etapa vuelve a ser exacta a 0
      case 'tapeSat':
        smooth(this.satDry.gain, 1 - value); smooth(this.satWet.gain, value);
        smooth(this.satPre.gain, tapePre(value)); smooth(this.satPost.gain, tapePost(value));
        smooth(this.satLP.frequency, tapeLP(value)); break;
      case 'tapeWow': { const on = value > 0 ? 1 : 0;
        smooth(this.wowDry.gain, 1 - on); smooth(this.wowWet.gain, on);
        smooth(this.tapeWowLFO.depth.gain, value * TAPE_WOW_DEPTH); smooth(this.tapeFlutLFO.depth.gain, value * TAPE_FLUT_DEPTH); break; }
      case 'shimAmt': if (value > 0) this._ensureShim(); this._shimUpdate(smooth); break;
      case 'shimInt': if (this.shim) this.shim.shift.parameters.get('semitones').setValueAtTime(this._shimSemis(), now); break;
    }
  }

  // ---------- placa ----------
  _ensurePlate() {
    if (this.plate) return this.plate;
    this.plate = new AudioWorkletNode(this.ctx, 'plate-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    this.plate.connect(this.plateMix);
    this._plateParams(true);
    return this.plate;
  }
  _plateParams(now = false) {
    if (!this.plate) return;
    const t = this.ctx.currentTime, p = this.plate.parameters;
    const put = (name, v) => { const ap = p.get(name); if (!ap) return; if (now) ap.value = v; else ap.setTargetAtTime(v, t, 0.05); };
    put('decay', this.frozen ? FREEZE_DECAY : plateDecay(this.S.reverbSize)); put('damp', this.S.reverbDamp); put('mod', PLATE_MOD);   // congelada: el Size no la suelta
  }
  _front() { return this._revFront === 'A' ? this.convA : this.convB; }
  // Cambio de reverb con fundido de 50 ms; la entrada de la que se apaga se
  // desconecta al acabar (un convolver o un worklet con entrada gastan CPU).
  _setType(type) {
    const placa = type === 'placa', t = this.ctx.currentTime;
    if (placa) { this._ensurePlate(); this.revPre.connect(this.plate); }
    else if (this._irStale) { this._irStale = false; clearTimeout(this._revTimer); this._swapIR(this.S.reverbSize); }
    else this.revPre.connect(this._front());
    this.irMix.gain.setTargetAtTime(placa ? 0 : 1, t, 0.05);
    this.plateMix.gain.setTargetAtTime(placa ? 1 : 0, t, 0.05);
    clearTimeout(this._typeTimer);
    this._typeTimer = setTimeout(() => {
      const off = placa ? [this.convA, this.convB] : [this.plate];
      for (const n of off) { try { if (n) this.revPre.disconnect(n); } catch (e) {} }
    }, 400);
  }
  setFeedback(fb) {
    const t = this.ctx.currentTime, smooth = (p, v) => p.setTargetAtTime(v, t, 0.02);
    this._fb = fb; smooth(this.ppFbL.gain, fb); smooth(this.ppFbR.gain, fb);
    this._dlySatGains(smooth);                       // por encima de DLY_SAT_AUTO[0], la saturación entra sola
  }
  // Saturación del bucle: w = la del knob, o la que exige la realimentación; drive D por el knob
  _dlySatGains(apply) {
    const sat = +this.S.dlySat || 0, fb = this._fb || 0;
    const w = Math.max(sat, Math.min(1, Math.max(0, (fb - DLY_SAT_AUTO[0]) / (DLY_SAT_AUTO[1] - DLY_SAT_AUTO[0]))));
    const D = 1 + DLY_SAT_DRIVE * sat * sat;
    for (const s of [this.fbSatL, this.fbSatR]) {
      apply(s.dry.gain, 1 - w); apply(s.wet.gain, w);
      apply(s.pre.gain, D / DLY_SAT_RANGE); apply(s.post.gain, 1 / D);
    }
  }
  setDlyToRev(v)  { this.dlyToRev.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02); }
  setMaster(v)    { this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02); }

  // Nueva IR por el convolver trasero + crossfade; el delantero se desconecta
  // al acabar el fundido (un convolver con entrada consume CPU aunque su salida
  // esté a 0). connect() duplicado sobre el mismo par es inocuo (lo ignora).
  _swapIR(seconds) {
    const t = this.ctx.currentTime;
    const front = this._revFront === 'A' ? { c: this.convA, g: this.revXA } : { c: this.convB, g: this.revXB };
    const back  = this._revFront === 'A' ? { c: this.convB, g: this.revXB } : { c: this.convA, g: this.revXA };
    try { back.c.buffer = makeIR(this.ctx, seconds, 2.5, this.S.reverbDamp); } catch (e) { return; }
    this.revPre.connect(back.c);
    back.g.gain.setTargetAtTime(1, t, 0.05);
    front.g.gain.setTargetAtTime(0, t, 0.05);
    clearTimeout(this._revOffTimer);
    this._revOffTimer = setTimeout(() => { try { this.revPre.disconnect(front.c); } catch (e) {} }, 400);
    this._revFront = this._revFront === 'A' ? 'B' : 'A';
  }

  // Damp 0..1 -> cortes del filtro del bucle (recorrido log): LP de Nyquist a
  // DLY_DAMP_LP_MIN, HP de DLY_DAMP_HP_MIN a DLY_DAMP_HP_MAX. A 0 exactamente
  // Nyquist / 0 Hz (identidad en el biquad), por eso la rama aparte.
  _dampFreqs(d) {
    const nyq = this.ctx.sampleRate / 2;
    if (!(d > 0)) return { lp: nyq, hp: 0 };
    return { lp: nyq * Math.pow(DLY_DAMP_LP_MIN / nyq, d),
             hp: DLY_DAMP_HP_MIN * Math.pow(DLY_DAMP_HP_MAX / DLY_DAMP_HP_MIN, d) };
  }

  // Tiempo efectivo del delay: libre (knob Time) o división musical del BPM
  _effDelay() {
    const div = { '1/8': 0.5, '1/8.': 0.75, '1/4': 1, '1/4.': 1.5, '1/2': 2 }[this.S.dlySync];
    return div ? Math.min(4, (60 / this.S.bpm) * div) : Math.min(4, this.S.dlyTime);   // tope = PARAMS.dlyTime.max (la línea mide DLY_MAX)
  }

  // Desmontaje (al apagar la escena): para los LFOs del wow y rompe el bucle
  // de realimentación; sin fuentes vivas, el grafo se libera solo.
  dispose() {
    clearTimeout(this._revTimer); clearTimeout(this._revOffTimer); clearTimeout(this._typeTimer);
    for (const l of [this.wowL, this.wowR, this.tapeWowLFO, this.tapeFlutLFO]) {
      try { l.osc.stop(); l.osc.disconnect(); } catch (e) {}
      if (l.alt) { try { l.alt.stop(); l.alt.disconnect(); } catch (e) {} }   // el wow de cinta es un buffer 'drift'
    }
    for (const n of [this.tapeIn, this.satDry, this.satPre, this.satShaper, this.satPost, this.satLP, this.satWet, this.satOut,
                     this.wowDry, this.wowWet, this.tapeDelay, this.tapeOut]) { try { n.disconnect(); } catch (e) {} }
    if (this.plate) { try { this.plate.port.postMessage('stop'); this.plate.disconnect(); } catch (e) {} }
    try { this.comp.port.postMessage('stop'); } catch (e) {}   // el limitador es un worklet: que deje de procesar
    if (this.shim) { try { this.shim.shift.port.postMessage('stop'); } catch (e) {} for (const n of [this.shim.hp, this.shim.lp, this.shim.shift, this.shim.fb]) { try { n.disconnect(); } catch (e) {} } }
    for (const s of [this.fbSatL, this.fbSatR]) for (const n of [s.dry, s.pre, s.sh, s.post, s.wet]) { try { n.disconnect(); } catch (e) {} }
    for (const n of [this.dry, this.dlyIn, this.revIn, this.sum, this.dlyL, this.dlyR, this.ppFbL, this.ppFbR,
                     this.ppMerge, this.dlRet, this.dlyToRev, this.revPre, this.convA, this.convB, this.irMix, this.plateMix,
                     this.revRet, this.headroom, this.comp, this.master, this.analyser]) { try { n.disconnect(); } catch (e) {} }
  }
}
