/* =====================================================================
   SubSDJ · Voice — una nota polifónica.
   Cadena por voz:
     osc A/B (worklet; cada uno a freq·2^oct — Octava ±2) + ruido --mezcla/ring--> preFilter --> drive(tanh, dry/wet)
        --> VOCAL (banco de formantes, dry/wet; el ruido ya sumado = aliento)
        --> RESONADOR (banco modal afinado a la nota, dry/wet; engine/reson.js)
        --> filtro LP↔HP morph | BP | notch, 12|24 dB (cutoff = base + envFiltro + LFO)
        --> VCA(ADSR) --> ampMod(matriz, base 1) --> pan --> bus
   Modulación global conectada por voz: pitchOffset, freqLFO, pwmLFO, cutLFO, resLFO.
   Con lfoPhase 'voz' los LFO de cutoff/reso/vibrato/PWM/pan son COPIAS por voz
   (nodes.mkVoiceLFO) arrancadas en la fase que le toca a la voz (Weyl), y la
   fuente «Deriva (voz)» de la matriz es un paseo lento propio de cada voz.
   Matriz de modulación: slots fuente→GainNode(amt·span)→AudioParams del
   destino — la misma fontanería que las rutas dedicadas, generalizada.
   ===================================================================== */
import { MX_SLOTS, MX_SPAN, FM4_KEYS } from './params.js';
import { getWtSet } from './wavetable.js';
import { mkVoiceLFO, setVoiceLfoRate, setVoiceLfoShape, stopVoiceLFO, nextVoicePhase } from './nodes.js';
import { resRatios, resQ, resGains, resNoiseGain } from './reson.js';
import { getVocalBank, bwMul, vocMakeup, brilloMul, VOC_BRILLO_IX,
         VOC_VIDA_CENTS, VOC_SMOOTH, VOC_ATK_GAIN, VOC_ATK_TAU, VOC_ATK_Q,
         VOC_ATK_GLIDE, VOC_ATK_TRANS } from './vocal.js';

// Curva de saturación del drive pre-filtro, COMPARTIDA por todas las voces
// (tanh k=3 normalizada a ±1; el nivel de entrada vive en dvPre, como en el FX).
const DRIVE_CURVE = (() => {
  const n = 1024, c = new Float32Array(n), k = 3;
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return c;
})();

// Curva de la envolvente (envCurve 0..1): 0 = rampas LINEALES (como siempre);
// > 0 = tramos exponenciales tipo RC, como en un ADSR analógico (el condensador
// se carga hacia el objetivo): el ataque sube deprisa y frena al llegar, el
// decay cae deprisa y se posa despacio. k = curvatura = ENV_K·envCurve. Por qué
// suena mejor: la sonoridad es logarítmica — un decay lineal en amplitud «se
// queda colgado y luego cae de golpe»; el exponencial se oye parejo. El release
// sigue al MISMO knob (lineal a 0, RC a 1; hasta la revisión tras el bloque 13
// era exponencial fijo con τ = r/4). Cada tramo va como CADENA de ENV_SEG rampas
// lineales que siguen la exponencial — NO como setValueCurveAtTime: en Chrome
// una curva en curso no se puede cancelar ni anclar (setValueAtTime dentro de
// su tramo lanza NotSupportedError), así que soltar la nota durante el ataque
// o el decay dejaba la voz colgada. Las rampas se cortan sin problema.
const ENV_K = 6, ENV_SEG = 12;

// Pesos de Voice.cost, en «voces simples» (dos sierras con el filtro quieto =
// 1 ≈ 1,6 % de un núcleo en el PC de referencia, render offline). Medidos con
// 12 voces por variante (2026-10-12). Lo que más pesa es el NÚMERO DE NODOS de
// la voz, no la matemática del oscilador: una copia más de unison o una Súper
// apenas suma (copy); lo que va por muestra en JS con senos sí (FM, FM4).
const COST = {
  base: 1,            // la voz: ~30 nodos (mezcla, ruido, filtro, VCA, pan) + 2 worklets
  copy: 0.005,        // cada copia de oscilador (unison, Súper = 7, octavas apiladas): PolyBLEP, barato
  sine: 0.06, sineFm: 0.18, fm4: 0.47,   // por copia: senos por muestra (FM con índice: dos; FM4: cuatro)
  filterMod: 0.07, filterMod24: 0.16,     // filtro modulado (env, LFO, matriz): coeficientes por muestra
  drive: 0.15, vocal: 0.25, reson: 0.24,
  vocDyn: 0.26,       // Vocal dinámico por el Golpe: 10 WaveShapers (biquads aún en k-rate)
  vocMx: 0.8,         // Vocal movido por la matriz: WaveShapers + biquads a-rate (medido en «Madrigal»)
};
const mxDst = (S, d) => { for (let i = 1; i <= MX_SLOTS; i++) if (S['mx' + i + 'src'] !== 'off' && S['mx' + i + 'dst'] === d) return true; return false; };

export class Voice {
  constructor(ctx, S, mod, { freq, vel = 1, startFreq = null, startAt = null }) {
    this.ctx = ctx;
    this.mod = mod;
    this.S = S;
    this.disposed = false;
    // Look-ahead: programamos un pelín en el futuro para que el ataque arranque SIEMPRE
    // desde 0 limpio. Sin esto, si construir la voz tarda más que el attack (p.ej. un
    // supersaw con 14 nodos), la rampa caería "en el pasado" y la ganancia saltaría de
    // golpe, exponiendo el oscilador a media onda -> click. Por eso clicaba "a veces".
    // El margen lo pone el motor (mod.lookahead): 5 ms offline; en directo depende del
    // dispositivo (5 ms + 2·baseLatency), porque el reloj del hilo principal va por
    // detrás del de audio y 5 ms fijos no bastaban en algunas tarjetas (el blip de
    // pitch y el VCA del bombo caían en el pasado: golpeaba solo a veces).
    // startAt (opcional): inicio programado en el reloj de audio (lo usa el arpegiador).
    // Cuantizado a frontera de bloque de render (128 muestras): el worklet abre su
    // puerta de arranque por bloques, así la onda empieza en su fase configurada
    // EXACTAMENTE cuando abre el VCA (golpe idéntico en cada nota).
    const Q = 128 / ctx.sampleRate;
    const t = Math.ceil(((startAt || ctx.currentTime) + (mod.lookahead || 0.005)) / Q - 1e-6) * Q;
    this.t0 = t;                          // referencia para el fade-in de LFOs (lfoFade)
    const glide = (startFreq && S.glide > 0) ? S.glide : 0;

    // --- Modulación por voz (Roadmap 5.0 · bloque 2) ---
    // Fase de esta voz (secuencia de Weyl, nodes.js): la usan sus LFO propios
    // (lfoPhase 'voz', creados bajo demanda en _vlfo) y su deriva (fuente 'drift').
    this.phase = nextVoicePhase(ctx);
    this.vlfo = S.lfoPhase === 'voz' ? {} : null;   // k -> LFO propio (null = los globales del motor)
    this.drift = null;                              // fuente «Deriva (voz)» de la matriz, si algún slot la usa

    // --- Osciladores (worklet) ---
    this.oscs = [];                       // {node, detune, pw, ratio}
    const busA = ctx.createGain(); busA.gain.value = 1 / Math.max(1, S.oscA.octaves);
    const busB = ctx.createGain(); busB.gain.value = 1 / Math.max(1, S.oscB.octaves);
    this._buildOscGroup(S.oscA, busA, freq, startFreq, glide, t);
    this._buildOscGroup(S.oscB, busB, freq, startFreq, glide, t);
    this._connPitch = this._connVib = this._connPwm = false;
    if (S.freqCents) this.ensurePitch();
    if (S.freqLfoLvl) this.ensureVib();
    if (S.pwmLfoLvl) this.ensurePwm();

    // --- Mezcla A<->B ---
    const gA = ctx.createGain(); gA.gain.value = 1 - S.mix;
    const gB = ctx.createGain(); gB.gain.value = S.mix;
    busA.connect(gA); busB.connect(gB);
    const normMix = ctx.createGain();
    gA.connect(normMix); gB.connect(normMix);

    // --- Ring mod: A * B ---
    const ring = ctx.createGain(); ring.gain.value = 0;
    busA.connect(ring); busB.connect(ring.gain);

    // --- Crossfade normal <-> ring ---
    const normX = ctx.createGain(); normX.gain.value = 1 - S.ring;
    const ringX = ctx.createGain(); ringX.gain.value = S.ring;
    normMix.connect(normX); ring.connect(ringX);

    // --- Ruido con color: LP+HP en serie (color<0 cierra el LP = oscuro/viento;
    // color>0 sube el HP = "aire"; a 0 ambos abiertos = blanco). Q a -3 dB
    // (Butterworth plano: la Q de LP/HP va en dB). La ganancia lleva una
    // compensación (mk) para que el color cambie el timbre, no el volumen. ---
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = mod.noiseBuffer; noiseSrc.loop = true;
    const nf = Voice._noiseColorCfg(S.noiseColor);
    const nLP = ctx.createBiquadFilter(); nLP.type = 'lowpass'; nLP.Q.value = -3; nLP.frequency.value = nf.lp;
    const nHP = ctx.createBiquadFilter(); nHP.type = 'highpass'; nHP.Q.value = -3; nHP.frequency.value = nf.hp;
    const noiseGain = ctx.createGain(); noiseGain.gain.value = S.noise * nf.mk;
    noiseSrc.connect(nLP); nLP.connect(nHP); nHP.connect(noiseGain);

    // --- Suma pre-filtro ---
    const preFilter = ctx.createGain();
    normX.connect(preFilter); ringX.connect(preFilter); noiseGain.connect(preFilter);

    // --- Drive pre-filtro (saturación tanh por voz, dry/wet). Solo el camino
    // seco existe siempre: a 0 pasa a ganancia 1 (transparente EXACTO). El wet
    // — un WaveShaper sobremuestreado ×2, caro aunque su salida valga 0 — nace
    // bajo demanda (ensureDrive) cuando el knob sube de 0. ---
    const dvDry = ctx.createGain(); dvDry.gain.value = 1 - S.filterDrive;
    const dvOut = ctx.createGain();
    preFilter.connect(dvDry); dvDry.connect(dvOut);

    // --- Vocal: banco de formantes dry/wet ANTES del filtro (los formantes
    // enriquecen la fuente; el LP/HP conserva su papel de brillo global).
    // Solo el crossfade existe siempre: el banco (biquads + WaveShapers) se
    // crea bajo demanda (ensureVocal) — el caso común vocAmt=0 no paga nodos.
    const vocDry = ctx.createGain(); vocDry.gain.value = 1 - S.vocAmt;
    const vocOut = ctx.createGain();
    dvOut.connect(vocDry); vocDry.connect(vocOut);

    // --- Resonador: banco modal dry/wet TRAS el Vocal (engine/reson.js). Como el
    // Vocal, solo el crossfade existe siempre: el banco nace bajo demanda (ensureReson).
    const resDry = ctx.createGain(); resDry.gain.value = 1 - S.resAmt;
    const resOut = ctx.createGain();
    vocOut.connect(resDry); resDry.connect(resOut);

    // --- Filtro por voz: LP + HP en paralelo con crossfade (morph) ---
    // keytrack: el cutoff sigue la altura de la nota (0 = fijo, 1 = 1:1 con el tono)
    // Pendiente 24 dB: 2ª etapa en CASCADA delante, plana. OJO doble: en WebAudio
    // la Q de lowpass/highpass va EN dB, y 0 dB = Q lineal 1.0 (pico de ~1.25 dB);
    // el Butterworth plano (Q lineal 0.707) son -3 dB. La resonancia vive en la
    // etapa final, así el knob Reso se comporta igual que a 12 dB.
    // filterSlope se lee al crear la voz (cambia la estructura: aplica por nota).
    this.noteFreq = freq;
    this.ktMul = S.keytrack ? Math.pow(freq / 261.63, S.keytrack) : 1;
    const cutHz = Math.min(20000, S.cutoff * this.ktMul);
    // Tipo (filterType, por nota): 'morph' = LP + HP en PARALELO con crossfade
    // (Low↔Hi); 'bp' = LP y HP en SERIE con el mismo corte (paso-banda: cada
    // flanco 12 dB; con pendiente 24 cada uno lleva su 2ª etapa); 'notch' = LP
    // + HP en paralelo a ganancia 1 cada uno. Los numeradores RBJ de LP y HP
    // con el mismo corte suman 1 − 2cos·z⁻¹ + z⁻²: el notch del cookbook, cero
    // exacto en el corte sea cual sea la Q (la Q solo lo estrecha). Es el
    // morph al 50 % (0,5 + 0,5 = −6 dB) con +6 dB. Sin 2ª etapa en el notch:
    // en cascada los dos flancos llegarían EN FASE al corte y el cero se
    // llenaría (la pendiente no aplica).
    const ft = S.filterType || 'morph';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass';
    lp.frequency.value = hp.frequency.value = cutHz;
    lp.Q.value = hp.Q.value = ft === 'bp' ? S.reso / 2 : S.reso;   // BP: la resonancia se reparte entre los dos flancos (el knob sigue siendo dB en el corte)
    let lp2 = null, hp2 = null, lpIn = lp, hpIn = hp;
    if (S.filterSlope === '24' && ft !== 'notch') {
      lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass';
      hp2 = ctx.createBiquadFilter(); hp2.type = 'highpass';
      lp2.frequency.value = hp2.frequency.value = cutHz;
      lp2.Q.value = hp2.Q.value = -3;
      lp2.connect(lp); hp2.connect(hp);
      lpIn = lp2; hpIn = hp2;
    }
    const lpMix = ctx.createGain(); lpMix.gain.value = ft === 'morph' ? 1 - S.morph : 1;
    const hpMix = ctx.createGain(); hpMix.gain.value = ft === 'morph' ? S.morph : 1;
    const filterOut = ctx.createGain();
    if (ft === 'bp') { resOut.connect(lpIn); lp.connect(hpIn); hp.connect(filterOut); }   // serie
    else {                                                                                  // paralelo (morph / notch)
      resOut.connect(lpIn); lp.connect(lpMix); lpMix.connect(filterOut);
      resOut.connect(hpIn); hp.connect(hpMix); hpMix.connect(filterOut);
    }

    // Modulación del filtro — LFO de cutoff (todas las etapas) y de reso (la
    // etapa con resonancia), envolvente de filtro y macro de apertura del
    // arreglo — se CONECTA solo cuando mueve algo (ensureCutLfo, ensureResLfo,
    // ensureFenv, ensureMacro; también en vivo, al subir su knob). Una conexión
    // a un AudioParam del biquad, aunque traiga ceros, obliga al navegador a
    // recalcular los coeficientes en CADA muestra en vez de una vez por bloque:
    // medido, el filtro de la voz costaba más del doble con todo a 0.
    // Desconectada, la salida es exactamente la misma (sumaba 0).

    // Envolvente de filtro: ConstantSource(0..1) * envAmt(Hz) -> cutoff. La fuente
    // existe siempre: es también la fuente «Env filtro» de la matriz.
    const fenv = ctx.createConstantSource(); fenv.offset.value = 0;
    const fenvGain = ctx.createGain(); fenvGain.gain.value = S.filterEnvAmt;
    fenv.connect(fenvGain);
    fenv.start(t);

    // --- VCA (envolvente de amplitud) + colocación estéreo ---
    const vca = ctx.createGain(); vca.gain.value = 0;
    // ampMod: destino 'amp' de la matriz (1 ± mod). Va TRAS el VCA a propósito:
    // al soltar la nota el VCA baja a 0 y silencia pase lo que pase el slot
    // (sumado al propio VCA, un trémolo ±  seguiría sonando tras el release).
    const ampMod = ctx.createGain(); ampMod.gain.value = 1;
    const panner = ctx.createStereoPanner();
    // posición base por altura de nota (±2 octavas desde C4 => ±1), escalada por Width
    this.basePan = Math.max(-1, Math.min(1, Math.log2(freq / 261.63) / 2));
    panner.pan.value = this.basePan * S.width;
    filterOut.connect(vca); vca.connect(ampMod); ampMod.connect(panner); panner.connect(mod.voicesBus);
    noiseSrc.start(t);

    // --- Programación de envolventes ADSR (amp + filtro comparten A/D/S/R) ---
    const peak = vel, sus = S.s * vel;
    const g = vca.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(0, t);
    // Flam (hits > 1): antes del ADSR, hits−1 ráfagas cortas separadas hitGap —
    // el tren de pulsos del clap de la 808 (tres o cuatro golpes a ~10 ms sobre
    // el VCA del ruido, y luego la cola). El ADSR completo es el ÚLTIMO golpe;
    // con hits = 1 el camino es el de siempre (bit-idéntico).
    const tEnv = this._flam(g, t, peak);
    this._envSegs(g, 0, peak, sus, tEnv, S.a, S.d);
    this._envAmp = { t: tEnv, peak, sus, a: S.a, d: S.d };   // para estimar el valor en un release programado en el futuro

    // Env del filtro: enlazada al ADSR de amplitud (link) o con tiempos propios.
    // El pico escala con velocity (MIDI): pegar más fuerte abre más el filtro.
    const own = S.fenvMode === 'own';
    const FA = own ? S.fa : S.a, FD = own ? S.fd : S.d, FS = own ? S.fs : S.s;
    const fo = fenv.offset;
    fo.cancelScheduledValues(t); fo.setValueAtTime(0, t);
    this._envSegs(fo, 0, vel, FS * vel, t, FA, FD);
    this._envFil = { t, peak: vel, sus: FS * vel, a: FA, d: FD };

    // guardar refs para updates en vivo y limpieza
    Object.assign(this, { busA, busB, gA, gB, normX, ringX, noiseGain, noiseSrc, nLP, nHP,
      filterType: ft, lp, hp, lp2, hp2, lpMix, hpMix, fenv, fenvGain, vca, ampMod, panner,
      preFilter, dvDry, dvOut, vocDry, vocOut, resDry, resOut });
    if (S.filterDrive > 0) this.ensureDrive();  // el wet del drive (WaveShaper 2x) solo si muerde
    if (S.cutLfoLvl > 0) this.ensureCutLfo();   // modulación del filtro: solo lo que mueve algo (ver arriba)
    if (S.resLfoLvl > 0) this.ensureResLfo();
    if (S.filterEnvAmt) this.ensureFenv();
    if (mod.macroOn && mod.macroOn()) this.ensureMacro();
    if (S.panLfoLvl) this.ensurePan();          // autopan (necesita this.panner ya asignado)
    if (S.vocAmt > 0) this.ensureVocal();       // banco de formantes (también lo crea la matriz vía 'vow')
    if (S.resAmt > 0) this.ensureReson();       // banco modal (necesita vocOut y noiseGain ya asignados)
    if (S.vocVida > 0) this.ensureVida();
    if (S.vocAtk > 0 && this.vocBqs) this._vocBurst(t, vel);   // golpe consonántico (evento de arranque)

    // matriz de modulación (necesita todas las refs ya asignadas)
    this.vel = vel;
    this.mxSlots = [];                          // slot i -> {src, gain, dst}
    this._mxConsts = {};                        // fuentes escalares por voz (vel/note/rnd), cacheadas
    for (let i = 1; i <= MX_SLOTS; i++) this.mxRewire(i);
  }

  // Coste estimado de una voz en CPU de audio, en «voces simples» (dos sierras
  // con el filtro quieto y sin módulos = 1): lo usa el presupuesto común de
  // AudioEngine (VOICE_BUDGET). Pesos MEDIDOS (render offline de 12 voces por
  // variante; ver docs/DISENO.md): lo caro es lo que se calcula por muestra.
  static cost(S) {
    const c = COST;
    const osc = o => {
      const copies = (o.wave === 'supersaw' ? 7 : (+S.uniVoices || 1)) * Math.max(1, o.octaves || 1);
      const w = o.wave === 'sine' ? (S.fmIndex > 0 ? c.sineFm : c.sine) : o.wave === 'fm4' ? c.fm4 : c.copy;
      return copies * w;
    };
    let k = c.base + osc(S.oscA) + osc(S.oscB);
    const fmod = S.filterEnvAmt || S.cutLfoLvl > 0 || S.resLfoLvl > 0 || mxDst(S, 'cutoff') || mxDst(S, 'reso');
    if (fmod) k += S.filterSlope === '24' && S.filterType !== 'notch' ? c.filterMod24 : c.filterMod;
    if (S.filterDrive > 0) k += c.drive;
    if (S.vocAmt > 0) k += c.vocal + (mxDst(S, 'vow') ? c.vocMx : S.vocAtk > 0 ? c.vocDyn : 0);   // la Vida, medida, no suma
    if (S.resAmt > 0) k += c.reson;
    return k;
  }

  _buildOscGroup(cfg, dest, freq, startFreq, glide, t) {
    // UN nodo por grupo: las octavas se apilan DENTRO del processor (antes,
    // un AudioWorkletNode por octava: hasta 8 worklets por voz; ahora 2).
    const node = new AudioWorkletNode(this.ctx, 'pulse-processor', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
      processorOptions: {
        type: cfg.wave, phase: (cfg.phase || 0) / 360, octaves: cfg.octaves,
        t0: t,                                 // arranque de la nota: las envolventes por operador (FM4) cuentan desde aquí
        // tablas mip (clonadas por el postMessage de opciones, ~170 KB por nodo)
        ...(cfg.wave === 'tabla' ? { wt: getWtSet(this.S.wtSet) } : {}),
      },
    });
    if (this.mod.stats) this.mod.stats.worklets++;
    const fParam = node.parameters.get('frequency');
    const dParam = node.parameters.get('detune');
    const pParam = node.parameters.get('pulseWidth');
    const sParam = node.parameters.get('spread');
    sParam.value = this.S.spread;
    const drParam = node.parameters.get('drift'); drParam.value = this.S.drift;
    const uvParam = node.parameters.get('uniVoices'); uvParam.value = +this.S.uniVoices || 1;
    const udParam = node.parameters.get('uniDetune'); udParam.value = this.S.uniDetune;
    const fmRParam = node.parameters.get('fmRatio'); fmRParam.value = this.S.fmRatio;
    const fmIParam = node.parameters.get('fmIndex'); fmIParam.value = this.S.fmIndex;
    const fmFParam = node.parameters.get('fmFb'); if (fmFParam) fmFParam.value = this.S.fmFb;   // puede faltar (worklet viejo en caché)
    // FM4: algoritmo + ratio/nivel/decay × 4, fijados al nacer y en vivo por nombre (setFm4)
    const fm4P = {};
    for (const k of FM4_KEYS) { const ap = node.parameters.get(k); if (ap) { ap.value = +this.S[k]; fm4P[k] = ap; } }
    // puede faltar si el navegador sirvió un worklet viejo de caché: degradar sin crash
    const wtParam = node.parameters.get('wtPos'); if (wtParam) wtParam.value = this.S.wtPos;

    // Octava (cfg.oct, −2..+2): el oscilador suena a freq·2^oct — −1 es el
    // suboscilador clásico, +1/+2 apilan hacia arriba sin recurrir a Apiladas.
    // Va como RATIO de frecuencia (no en cents): así el glide (glideTo usa o.ratio)
    // y el detune en cents siguen significando lo mismo que a la octava base.
    const ratio = Math.pow(2, cfg.oct || 0);
    const fEnd = freq * ratio, fStart = startFreq ? startFreq * ratio : fEnd;
    // afina ya el oscilador (durante el pre-roll de look-ahead la voz está en silencio)
    fParam.value = glide > 0 ? fStart : fEnd;
    // glide (portamento): rampa exponencial desde la nota anterior
    if (glide > 0) {
      fParam.setValueAtTime(fStart, t);
      fParam.exponentialRampToValueAtTime(fEnd, t + glide);
    } else {
      fParam.setValueAtTime(fEnd, t);
    }
    dParam.value = cfg.detune;
    // Pitch envelope por nota: arranca desviado pitchEnvAmt cents y decae
    // exponencialmente al detune base (percusión, zaps, láseres)
    if (this.S.pitchEnvAmt) {
      dParam.setValueAtTime(cfg.detune + this.S.pitchEnvAmt, t);
      dParam.setTargetAtTime(cfg.detune, t, Math.max(0.001, this.S.pitchEnvDec) / 4);
    }
    pParam.value = this._clampPW(this.S.pulseWidth);

    node.connect(dest);
    this.oscs.push({ node, freq: fParam, detune: dParam, pw: pParam, sp: sParam, dr: drParam,
      uv: uvParam, ud: udParam, fmR: fmRParam, fmI: fmIParam, fmF: fmFParam, wt: wtParam, fm4P,
      isWt: cfg.wave === 'tabla', ratio });   // isWt: la secuencia de tabla solo automatiza estos · ratio: octava (glideTo)
  }
  _clampPW(v) { return v < 0.01 ? 0.01 : (v > 0.99 ? 0.99 : v); }

  // Ataque y decay de una envolvente: lineales (envCurve 0: bit-idéntico a
  // siempre) o con curva RC (envCurve > 0) aproximada por ENV_SEG rampas por tramo.
  _envSegs(p, from, peak, sus, t, a, d) {
    const k = ENV_K * (this.S.envCurve || 0);
    // Ataque 0 = ESCALÓN (percusión): el «golpe» de un parche es ese escalón — una
    // rampa, aunque sea de 1 ms, se come el primer milisegundo del transitorio, que
    // es donde vive el crack (lo cazó el usuario: el bombo solo golpeaba cuando, por
    // azar, el VCA ya estaba abierto al nacer el oscilador).
    if (!(a > 0)) { p.setValueAtTime(peak, t); a = 0; }
    if (!(k > 0)) { if (a > 0) p.linearRampToValueAtTime(peak, t + a); p.linearRampToValueAtTime(sus, t + a + d); return; }
    const den = 1 - Math.exp(-k);
    const tramo = (v0, v1, t0, dur) => {
      for (let i = 1; i <= ENV_SEG; i++) { const x = i / ENV_SEG; p.linearRampToValueAtTime(v0 + (v1 - v0) * (1 - Math.exp(-k * x)) / den, t0 + dur * x); }
    };
    if (a > 0) tramo(from, peak, t, a);
    tramo(peak, sus, t + a, d);
  }
  // Flam: hits−1 ráfagas sobre el param p desde t; devuelve el instante en que
  // arranca el ADSR (t si no hay flam). Cada ráfaga sube 0 → peak en el ataque
  // (acotado a un tercio del hueco: una ráfaga tiene que ser un golpe) y cae a 0
  // en el resto del hueco con la curva del knob (lineal o RC, como el release),
  // así la siguiente arranca de 0 limpio y entre golpe y golpe hay un valle.
  // Soltar la nota durante el flam funciona como siempre: release() ancla el
  // valor en curso y cancela las ráfagas que quedaban.
  _flam(p, t, peak) {
    const n = Math.round(this.S.hits || 1);
    if (!(n > 1)) return t;
    const gap = Math.max(0.005, this.S.hitGap || 0.012), atk = Math.min(this.S.a, gap / 3);
    for (let i = 0; i < n - 1; i++) {
      const ti = t + i * gap;
      if (atk > 0) { p.setValueAtTime(0, ti); p.linearRampToValueAtTime(peak, ti + atk); }
      else p.setValueAtTime(peak, ti);          // ataque 0: pulsos de verdad (el clap de la 808)
      this._relChain(p, ti + atk, peak, gap - atk);
    }
    const tEnv = t + (n - 1) * gap;
    p.setValueAtTime(0, tEnv);
    return tEnv;
  }
  // Valor que tendrá la envolvente en el instante t (release programado en el
  // futuro por los jugadores: el AudioParam aún no lo sabe). Misma curva que _envSegs.
  _envValueAt(e, t) {
    if (!e) return 0;
    const k = ENV_K * (this.S.envCurve || 0), den = 1 - Math.exp(-k);
    const rc = x => (k > 0 ? (1 - Math.exp(-k * x)) / den : x);
    const x = t - e.t;
    if (x <= 0) return 0;
    if (x < e.a) return e.peak * rc(x / e.a);
    if (x < e.a + e.d) return e.peak + (e.sus - e.peak) * rc((x - e.a) / e.d);
    return e.sus;
  }
  // Release desde cur hasta 0 en rel segundos con la curva del knob: lineal (k = 0) o RC
  // como cadena de ENV_SEG rampas (cae deprisa y se posa). Llega a 0 EXACTO en t + rel.
  _relChain(p, t, cur, rel) {
    const k = ENV_K * (this.S.envCurve || 0);
    if (!(k > 0) || !(cur > 0)) { p.linearRampToValueAtTime(0, t + rel); return; }
    const den = 1 - Math.exp(-k);
    for (let i = 1; i <= ENV_SEG; i++) {
      const x = i / ENV_SEG;
      p.linearRampToValueAtTime(i === ENV_SEG ? 0 : cur * (1 - (1 - Math.exp(-k * x)) / den), t + rel * x);
    }
  }

  // Color del ruido -> cutoffs de LP/HP (barridos exponenciales) + makeup de
  // ganancia (el LP cerrado quita mucha más energía que el HP: compensa más).
  static _noiseColorCfg(c) {
    return {
      lp: c < 0 ? 18000 * Math.pow(150 / 18000, -c) : 18000,
      hp: c > 0 ? 30 * Math.pow(8000 / 30, c) : 30,
      mk: c < 0 ? 1 - c * 2.2 : 1 + c * 0.8,
    };
  }

  // Modulación global -> params del worklet SOLO cuando está activa: con todo
  // a 0 (el caso común) el param queda constante y sin edges que computar.
  // Si un knob pasa de 0 a activo, el engine llama a estos ensure* en vivo.
  // Vibrato y PWM pasan por una ganancia de fade POR VOZ (lfoFade): el LFO
  // entra en rampa 0->1 desde el noteOn, como el vibrato retardado de un
  // intérprete. Programar la rampa anclada a t0 también funciona si el LFO se
  // conecta a mitad de nota (eventos en el pasado = valor ya alcanzado).
  _lfoFadeGain() {
    const g = this.ctx.createGain();
    if (this.S.lfoFade > 0) {
      g.gain.setValueAtTime(0, this.t0);
      g.gain.linearRampToValueAtTime(1, this.t0 + this.S.lfoFade);
    }
    return g;
  }
  ensurePitch() { if (this._connPitch || this.disposed) return; this._connPitch = true; this.oscs.forEach(o => this.mod.pitchOffset.connect(o.detune)); }
  ensureVib() {
    if (this._connVib || this.disposed) return; this._connVib = true;
    this.vibFade = this._lfoFadeGain();
    this.vibG = this._lfoGain('freq'); this.vibG.connect(this.vibFade);
    this.oscs.forEach(o => this.vibFade.connect(o.detune));
  }
  ensurePwm() {
    if (this._connPwm || this.disposed) return; this._connPwm = true;
    this.pwmFade = this._lfoFadeGain();
    this.pwmG = this._lfoGain('pwm'); this.pwmG.connect(this.pwmFade);
    this.oscs.forEach(o => this.pwmFade.connect(o.pw));
  }
  ensurePan()   { if (this._connPan   || this.disposed) return; this._connPan   = true; this.panG = this._lfoGain('pan'); this.panG.connect(this.panner.pan); }
  // Modulación del filtro y drive, bajo demanda (el porqué, en el constructor)
  _filters() { return [this.lp, this.hp, this.lp2, this.hp2].filter(Boolean); }
  ensureCutLfo() { if (this.cutG || this.disposed) return; this.cutG = this._lfoGain('cut'); this._filters().forEach(f => this.cutG.connect(f.frequency)); }
  ensureResLfo() { if (this.resG || this.disposed) return; this.resG = this._lfoGain('res'); this.resG.connect(this.lp.Q); this.resG.connect(this.hp.Q); }
  ensureFenv()   { if (this._connFenv || this.disposed) return; this._connFenv = true; this._filters().forEach(f => this.fenvGain.connect(f.frequency)); }
  ensureMacro()  { if (this._connMacro || this.disposed || !this.mod.macroCut) return; this._connMacro = true; this._filters().forEach(f => this.mod.macroCut.connect(f.detune)); }
  ensureDrive() {
    if (this.dvShaper || this.disposed) return;
    const ctx = this.ctx, dv = this.S.filterDrive;
    this.dvPre = ctx.createGain(); this.dvPre.gain.value = 1 + dv * 4;
    this.dvShaper = ctx.createWaveShaper(); this.dvShaper.curve = DRIVE_CURVE; this.dvShaper.oversample = '2x';
    this.dvPost = ctx.createGain(); this.dvPost.gain.value = 1 / (1 + dv * 1.5);
    this.dvWet = ctx.createGain(); this.dvWet.gain.value = dv;
    this.preFilter.connect(this.dvPre); this.dvPre.connect(this.dvShaper); this.dvShaper.connect(this.dvPost);
    this.dvPost.connect(this.dvWet); this.dvWet.connect(this.dvOut);
  }

  // ---------- LFOs y deriva POR VOZ (Roadmap 5.0 · bloque 2) ----------
  // _vlfo(k): el LFO propio k ('cut'|'res'|'freq'|'pwm'|'pan'), creado al primer
  // uso leyendo el estado (forma, Speed, Level) y arrancado en la fase de la voz.
  // _lfoGain(k): la ganancia de profundidad que hay que conectar al destino —
  // la del LFO propio con lfoPhase 'voz', la global del motor si no.
  _vlfo(k) {
    if (!this.vlfo[k]) this.vlfo[k] = mkVoiceLFO(this.ctx, this.S[k + 'LfoShape'] || 'sine', this.S[k + 'LfoSpd'], this.S[k + 'LfoLvl'], this.t0, this.phase);
    return this.vlfo[k];
  }
  _lfoGain(k) { return this.vlfo ? this._vlfo(k).depth : this.mod[k + 'LFOGain']; }
  // Fuente «Deriva (voz)»: el buffer de deriva (nodes.lfoBuffers) leído desde la
  // fase de la voz a la velocidad mxDriftSpd, ±1 crudo (la cantidad la pone el slot).
  _driftSrc() {
    if (!this.drift) this.drift = mkVoiceLFO(this.ctx, 'drift', this.S.mxDriftSpd, 1, this.t0, this.phase);
    return this.drift.out;
  }
  // Level / Speed / forma del LFO k en vivo (los llama el engine; con lfoPhase
  // 'global' no hay copia propia y no hace nada: el global ya cambió).
  setLfo(k, what, value) {
    if (!this.vlfo || !this.vlfo[k] || this.disposed) return;
    const l = this.vlfo[k], tc = this.ctx.currentTime;
    if (what === 'lvl') l.depth.gain.setTargetAtTime(value, tc, 0.02);
    else if (what === 'spd') setVoiceLfoRate(this.ctx, l, value, tc);
    else setVoiceLfoShape(this.ctx, l, value);
  }
  setMxDriftSpd(hz) { if (this.drift && !this.disposed) setVoiceLfoRate(this.ctx, this.drift, hz, this.ctx.currentTime); }

  // ---------- vocal: banco de formantes (tabla y curvas en vocal.js) ----------
  // 3 bandpass en paralelo anclados a la frecuencia REF de cada formante; el
  // morph vocálico viaja por su DETUNE (cents ⇒ exponencial, 0 Hz imposible).
  // Señal de control (dominio ±1): ConstantSource del knob Vocal + los slots
  // de matriz 'vow' SUMAN en la entrada de los WaveShapers; cada shaper mapea
  // control → cents (freqCurve) o → ganancia lineal (gainCurve). OJO WebAudio:
  // la Q del bandpass es LINEAL (f/BW), no en dB como lowpass/highpass.
  //
  // DOS MODOS, por coste. ESTÁTICO (el normal: solo el knob mueve la vocal): los
  // formantes se fijan con el valor de las curvas en el control (Voice._shape,
  // misma interpolación que un WaveShaper) y se deslizan con setTargetAtTime.
  // DINÁMICO (Golpe > 0, o un slot de la matriz hacia 'Vocal'): como siempre —
  // ConstantSource del knob + slots → 10 WaveShapers → cents y ganancias a
  // audio-rate (_vocGoDynamic; también a mitad de nota si llega un slot).
  // Y los 5 biquads van en K-RATE (coeficientes una vez por bloque de 128
  // muestras, 2,7 ms) salvo con la matriz: la Vida (paseo lento), el knob
  // (~50 ms) y la transición del Golpe (τ 24 ms) son mucho más lentos que un
  // bloque, y recalcular por muestra era la mitad del CPU de una voz de coro
  // (medido: banco + Vida a audio-rate ×4 frente a k-rate sin shapers). Un
  // LFO hacia 'Vocal' sí puede barrer deprisa: con matriz, a-rate.
  ensureVocal() {
    if (this.vocBqs || this.disposed) return;
    const ctx = this.ctx, S = this.S, bank = getVocalBank(), mul = bwMul(S.vocQ), x = S.vocVowel * 2 - 1;
    this.vocWet = ctx.createGain(); this.vocWet.gain.value = S.vocAmt * vocMakeup(S.vocQ);
    this.vocBqs = []; this.vocGains = []; this.vocShapers = []; this.vocBrillos = [];
    bank.forEach((f, i) => {
      const bq = ctx.createBiquadFilter(); bq.type = 'bandpass';
      Voice._rate(bq, 'k-rate');
      bq.frequency.value = f.ref;
      bq.detune.value = S.vocSize + Voice._shape(f.freqCurve, x);
      bq.Q.value = f.ref / (f.bw * mul);          // Q constante: el BW escala con el shift (natural)
      const g = ctx.createGain(); g.gain.value = Voice._shape(f.gainCurve, x) * this._vocBrillo(i, S.vocBrillo);
      this.dvOut.connect(bq); bq.connect(g); g.connect(this.vocWet);
      this.vocBqs.push(bq); this.vocGains.push(g);
    });
    this.vocWet.connect(this.vocOut);
    if (S.vocAtk > 0 || this._mxHasVow()) this._vocGoDynamic();
    // (los slots 'vow' de la matriz no necesitan recableo: mxRewire pasa por
    // _mxDestParams, que llama aquí ANTES de conectar — el banco siempre llega primero)
    if (this._needVida) this.ensureVida();
  }
  // Paso a modo dinámico: la señal de control y sus 10 WaveShapers (ver arriba).
  _vocGoDynamic() {
    if (this.vocCtl || !this.vocBqs || this.disposed) return;
    const ctx = this.ctx, S = this.S, bank = getVocalBank();
    this.vocCtl = ctx.createConstantSource();
    const vTarget = S.vocVowel * 2 - 1;
    this.vocCtl.offset.value = vTarget;
    // 'Golpe' parte 1 — transición de formantes: la boca ARRANCA cerrada
    // (desplazada hacia /u/, proporcional al knob) y se abre a la vocal.
    // Programada sobre t0 aunque el banco nazca a mitad de nota: eventos en
    // el pasado = valor ya convergido (el truco del lfoFade).
    if (S.vocAtk > 0) {
      this.vocCtl.offset.setValueAtTime(Math.max(-1, vTarget - S.vocAtk * VOC_ATK_GLIDE), this.t0);
      this.vocCtl.offset.setTargetAtTime(vTarget, this.t0, VOC_ATK_TRANS);
    }
    this.vocCtl.start(this.t0);
    if (this._mxHasVow()) this.vocBqs.forEach(bq => Voice._rate(bq, 'a-rate'));   // la matriz puede barrer deprisa
    bank.forEach((f, i) => {
      const bq = this.vocBqs[i], g = this.vocGains[i];
      bq.detune.cancelScheduledValues(0); bq.detune.value = S.vocSize;   // base: el Tamaño; la vocal la suma su shaper
      g.gain.cancelScheduledValues(0); g.gain.value = 0;                // la ganancia la pone su shaper
      const shF = ctx.createWaveShaper(); shF.curve = f.freqCurve;
      const shG = ctx.createWaveShaper(); shG.curve = f.gainCurve;
      this.vocCtl.connect(shF); this.vocCtl.connect(shG);
      shF.connect(bq.detune);
      // F4-F5 (racimo del cantante): su ganancia pasa por el escalado Brillo
      if (i >= VOC_BRILLO_IX) {
        const bg = ctx.createGain(); bg.gain.value = brilloMul(S.vocBrillo);
        shG.connect(bg); bg.connect(g.gain);
        this.vocBrillos.push(bg);
      } else shG.connect(g.gain);
      this.vocShapers.push(shF, shG);
    });
  }
  _vocBrillo(i, b) { return i >= VOC_BRILLO_IX ? brilloMul(b) : 1; }
  _mxHasVow() { for (let i = 1; i <= MX_SLOTS; i++) if (this.S['mx' + i + 'src'] !== 'off' && this.S['mx' + i + 'dst'] === 'vow') return true; return false; }
  // Valor de una curva en el control x ∈ [−1, 1] con la interpolación del
  // WaveShaper (spec: índice (N−1)·(x+1)/2, lineal entre vecinos, recorte en los bordes).
  static _shape(curve, x) {
    const N = curve.length, v = (N - 1) * (x + 1) / 2;
    if (!(v > 0)) return curve[0];
    if (v >= N - 1) return curve[N - 1];
    const k = Math.floor(v), f = v - k;
    return curve[k] + (curve[k + 1] - curve[k]) * f;
  }
  static _rate(bq, rate) { for (const p of [bq.frequency, bq.detune, bq.Q, bq.gain]) { try { p.automationRate = rate; } catch (e) { /* navegador sin automationRate: se queda a-rate */ } } }
  // 'Vida': micro-deriva de los formantes — un paseo lento compartido
  // (mod.wanderBuffer) leído desde un offset ALEATORIO por voz (coro
  // descorrelacionado con un solo buffer), sumado en cents al detune de los
  // 3 biquads a la vez (correlado dentro de la voz: la mandíbula es una).
  ensureVida() {
    if (this.vocWander || this.disposed) return;
    if (!this.vocBqs) { this._needVida = true; return; }   // sin banco aún: se engancha al crearlo
    const ctx = this.ctx, buf = this.mod.wanderBuffer;
    if (!buf) return;
    this.vocWander = ctx.createBufferSource();
    this.vocWander.buffer = buf; this.vocWander.loop = true;
    this.vocWanderGain = ctx.createGain();
    this.vocWanderGain.gain.value = this.S.vocVida * VOC_VIDA_CENTS;
    this.vocWander.connect(this.vocWanderGain);
    this.vocBqs.forEach(bq => this.vocWanderGain.connect(bq.detune));
    this.vocWander.start(this.t0, Math.random() * buf.duration);
  }
  // 'Golpe' parte 2 — burst de ruido de una sola vez por un paso-banda ANCHO
  // centrado en el F2 de la vocal actual (punto de articulación: «ka» ≠ «ku»);
  // entra en vocOut = sigue pasando por LP/HP, VCA y pan como todo lo demás.
  // Se agota en ~50 ms y se autolimpia; no toca el VCA ni el release.
  _vocBurst(t, vel) {
    const S = this.S, bank = getVocalBank();
    const f2 = bank[1];                       // F2: cents en la posición vocálica actual + Tamaño
    const ix = Math.max(0, Math.min(f2.freqCurve.length - 1, Math.round(S.vocVowel * (f2.freqCurve.length - 1))));
    const hz = f2.ref * Math.pow(2, (f2.freqCurve[ix] + S.vocSize) / 1200);
    const src = this.ctx.createBufferSource();
    src.buffer = this.mod.noiseBuffer; src.loop = true;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(S.vocAtk * VOC_ATK_GAIN * vel * S.vocAmt, t);
    g.gain.setTargetAtTime(0, t, VOC_ATK_TAU);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = hz; bp.Q.value = VOC_ATK_Q;
    src.connect(g); g.connect(bp); bp.connect(this.vocOut);
    src.start(t, Math.random() * 1.5);        // offset aleatorio: cada consonante es distinta
    src.stop(t + 0.25);                       // a ~16·τ el burst está a -140 dB: liberar
    src.onended = () => { try { src.disconnect(); } catch (e) {} try { g.disconnect(); } catch (e) {} try { bp.disconnect(); } catch (e) {} };
    this.vocBurstSrc = src; this.vocBurstGain = g; this.vocBurstBp = bp;
  }

  // ---------- resonador: banco modal (tablas y fórmulas en reson.js) ----------
  // Seis bandpass en paralelo a f0·razón_i, entrada = la señal de la voz tras el
  // Vocal (ganancia 1) + el ruido de la voz REFORZADO ∝ √Q (ver reson.js); la
  // suma pasa por resWet (= Mezcla) a resOut, donde ya espera el camino seco.
  ensureReson() {
    if (this.resBqs || this.disposed) return;
    const ctx = this.ctx, S = this.S, q = resQ(S.resDecay), nyq = ctx.sampleRate * 0.45;
    this.resRatios = resRatios(S.resMat); this.resFreq = this.noteFreq;
    const gains = resGains(this.resRatios, S.resBrillo);
    this.resIn = ctx.createGain();
    this.resNoise = ctx.createGain(); this.resNoise.gain.value = resNoiseGain(q);
    this.vocOut.connect(this.resIn); this.noiseGain.connect(this.resNoise); this.resNoise.connect(this.resIn);
    this.resWet = ctx.createGain(); this.resWet.gain.value = S.resAmt;
    this.resBqs = []; this.resGs = [];
    this.resRatios.forEach((r, i) => {
      const f = this.noteFreq * r, bq = ctx.createBiquadFilter(); bq.type = 'bandpass';
      bq.frequency.value = Math.min(nyq, f); bq.Q.value = q;                 // Q LINEAL en el bandpass (f/BW)
      const g = ctx.createGain(); g.gain.value = f < nyq ? gains[i] : 0;     // modo sobre Nyquist: mudo
      this.resIn.connect(bq); bq.connect(g); g.connect(this.resWet);
      this.resBqs.push(bq); this.resGs.push(g);
    });
    this.resWet.connect(this.resOut);
  }
  _resRetune(tau = 0.03) {       // frecuencias (nota actual × razones) y ganancias (Brillo), suavizadas
    if (!this.resBqs) return;
    const tc = this.ctx.currentTime, nyq = this.ctx.sampleRate * 0.45, gains = resGains(this.resRatios, this.S.resBrillo);
    this.resBqs.forEach((bq, i) => {
      const f = this.resFreq * this.resRatios[i];
      bq.frequency.setTargetAtTime(Math.min(nyq, f), tc, tau);
      this.resGs[i].gain.setTargetAtTime(f < nyq ? gains[i] : 0, tc, tau);
    });
  }
  setResAmt(v) {
    if (v > 0) this.ensureReson();
    const tc = this.ctx.currentTime;
    this.resDry.gain.setTargetAtTime(1 - v, tc, 0.02);
    if (this.resWet) this.resWet.gain.setTargetAtTime(v, tc, 0.02);
  }
  setResMat(m)    { if (!this.resBqs) return; this.resRatios = resRatios(m); this._resRetune(); }
  setResBrillo()  { this._resRetune(); }
  setResDecay(d) {
    if (!this.resBqs) return;
    const q = resQ(d), tc = this.ctx.currentTime;
    this.resBqs.forEach(bq => bq.Q.setTargetAtTime(q, tc, 0.03));
    this.resNoise.gain.setTargetAtTime(resNoiseGain(q), tc, 0.03);
  }

  // ---------- matriz de modulación (tablas en params.js) ----------
  // Fuente de un slot: los LFO llegan CRUDOS (el oscilador global, ±1, sin
  // pasar por su knob Level); 'env' es el ConstantSource de la env de filtro;
  // vel/note/rnd son un valor fijo por nota => ConstantSource propio ("CV").
  _mxSrcNode(src) {
    if (src.startsWith('lfo')) {        // con lfoPhase 'voz', el LFO propio (crudo, ±1); el trémolo es siempre el global (va tras la mezcla)
      const k = { lfoCut: 'cut', lfoRes: 'res', lfoFreq: 'freq', lfoPwm: 'pwm' }[src];
      return (this.vlfo && k) ? this._vlfo(k).out : (this.mod.mxLfo[src] || null);
    }
    if (src === 'drift') return this._driftSrc();
    if (this.mod.perf && this.mod.perf[src]) return this.mod.perf[src];   // rueda / aftertouch / expresión (0..1, del motor)
    if (src === 'env') return this.fenv;
    if (this._mxConsts[src]) return this._mxConsts[src];
    const val = src === 'vel' ? this.vel
      : src === 'note' ? Math.max(-1, Math.min(1, Math.log2(this.noteFreq / 261.63) / 2))
      : src === 'rnd' ? Math.random() * 2 - 1 : null;
    if (val === null) return null;
    const c = this.ctx.createConstantSource(); c.offset.value = val; c.start(this.t0);
    return this._mxConsts[src] = c;
  }
  _mxDestParams(dst) {
    switch (dst) {
      case 'pitch':  return this.oscs.map(o => o.detune);
      case 'pw':     return this.oscs.map(o => o.pw);
      // cutoff por el DETUNE del biquad (cents): computedFreq = freq·2^(det/1200),
      // exponencial y sin cruce por 0 Hz. Todas las etapas, como el cutLFO.
      case 'cutoff': return [this.lp, this.hp, this.lp2, this.hp2].filter(Boolean).map(f => f.detune);
      case 'reso':   return [this.lp.Q, this.hp.Q];
      case 'amp':    return [this.ampMod.gain];
      case 'pan':    return [this.panner.pan];
      case 'wt':     return this.oscs.map(o => o.wt).filter(Boolean);
      case 'fm':     return this.oscs.map(o => o.fmI);           // índice FM (k-rate; su min 0 recorta)
      // vocal: el slot suma su señal en la ENTRADA de los WaveShapers (junto
      // al ConstantSource del knob) — connect() acepta nodos igual que params.
      // Fuera de [-1,1] el shaper satura: el barrido se queda en u / i.
      case 'vow':    this.ensureVocal(); this._vocGoDynamic(); (this.vocBqs || []).forEach(bq => Voice._rate(bq, 'a-rate')); return this.vocShapers || [];
    }
    return [];
  }
  mxRewire(i) {                 // (re)cablea el slot i leyendo el estado actual
    if (this.disposed) return;
    const old = this.mxSlots[i];
    if (old) {
      try { old.src.disconnect(old.gain); } catch (e) {}
      try { old.gain.disconnect(); } catch (e) {}
      this.mxSlots[i] = null;
    }
    const S = this.S, srcId = S['mx' + i + 'src'], dstId = S['mx' + i + 'dst'];
    if (!srcId || srcId === 'off') return;
    const src = this._mxSrcNode(srcId), params = this._mxDestParams(dstId);
    if (!src || !params.length) return;
    const gain = this.ctx.createGain();
    gain.gain.value = (S['mx' + i + 'amt'] || 0) * (MX_SPAN[dstId] || 0);
    src.connect(gain);
    params.forEach(p => gain.connect(p));
    this.mxSlots[i] = { src, gain, dst: dstId };
  }
  mxSetAmt(i) {                 // sólo cambia la ganancia del slot (barato, en vivo)
    const slot = this.mxSlots[i]; if (!slot || this.disposed) return;
    slot.gain.gain.setTargetAtTime((this.S['mx' + i + 'amt'] || 0) * (MX_SPAN[slot.dst] || 0), this.ctx.currentTime, 0.02);
  }

  // ---------- updates en vivo (los llama el engine al girar knobs) ----------
  setMix(mix)  { const tc = this.ctx.currentTime; this.gA.gain.setTargetAtTime(1 - mix, tc, 0.02); this.gB.gain.setTargetAtTime(mix, tc, 0.02); }
  setRing(r)   { const tc = this.ctx.currentTime; this.normX.gain.setTargetAtTime(1 - r, tc, 0.02); this.ringX.gain.setTargetAtTime(r, tc, 0.02); }
  setNoise(n)  { this.noiseGain.gain.setTargetAtTime(n * Voice._noiseColorCfg(this.S.noiseColor).mk, this.ctx.currentTime, 0.02); }
  setNoiseColor(c) {
    const tc = this.ctx.currentTime, nf = Voice._noiseColorCfg(c);
    this.nLP.frequency.setTargetAtTime(nf.lp, tc, 0.02);
    this.nHP.frequency.setTargetAtTime(nf.hp, tc, 0.02);
    this.noiseGain.gain.setTargetAtTime(this.S.noise * nf.mk, tc, 0.02);
  }
  setCutoff(hz){ const tc = this.ctx.currentTime, v = Math.min(20000, hz * this.ktMul);
    [this.lp, this.hp, this.lp2, this.hp2].forEach(f => f && f.frequency.setTargetAtTime(v, tc, 0.02)); }
  setKeytrack(kt, cutoffHz) { this.ktMul = kt ? Math.pow(this.noteFreq / 261.63, kt) : 1; this.setCutoff(cutoffHz); }
  setReso(q)   { const tc = this.ctx.currentTime, v = this.filterType === 'bp' ? q / 2 : q; this.lp.Q.setTargetAtTime(v, tc, 0.02); this.hp.Q.setTargetAtTime(v, tc, 0.02); }
  setMorph(m)  { if (this.filterType !== 'morph') return; const tc = this.ctx.currentTime; this.lpMix.gain.setTargetAtTime(1 - m, tc, 0.02); this.hpMix.gain.setTargetAtTime(m, tc, 0.02); }
  setFilterEnvAmt(hz) { if (hz) this.ensureFenv(); this.fenvGain.gain.setTargetAtTime(hz, this.ctx.currentTime, 0.02); }
  setFilterDrive(v) {
    if (v > 0) this.ensureDrive();
    const tc = this.ctx.currentTime;
    this.dvDry.gain.setTargetAtTime(1 - v, tc, 0.02);
    if (!this.dvWet) return;
    this.dvPre.gain.setTargetAtTime(1 + v * 4, tc, 0.02);
    this.dvPost.gain.setTargetAtTime(1 / (1 + v * 1.5), tc, 0.02);
    this.dvWet.gain.setTargetAtTime(v, tc, 0.02);
  }
  setPulseWidth(pw)   { const tc = this.ctx.currentTime, v = this._clampPW(pw); this.oscs.forEach(o => o.pw.setTargetAtTime(v, tc, 0.02)); }
  setSpread(v)        { const tc = this.ctx.currentTime; this.oscs.forEach(o => o.sp.setTargetAtTime(v, tc, 0.02)); }
  setDrift(v)         { const tc = this.ctx.currentTime; this.oscs.forEach(o => o.dr.setTargetAtTime(v, tc, 0.02)); }
  setUnison(n, ct)    { const tc = this.ctx.currentTime; this.oscs.forEach(o => { o.uv.setValueAtTime(+n || 1, tc); o.ud.setTargetAtTime(ct, tc, 0.02); }); }
  setFM(ratio, index, fb = 0) { const tc = this.ctx.currentTime; this.oscs.forEach(o => { o.fmR.setValueAtTime(ratio, tc); o.fmI.setTargetAtTime(index, tc, 0.02); if (o.fmF) o.fmF.setTargetAtTime(fb, tc, 0.02); }); }
  setFm4(key, v) { const tc = this.ctx.currentTime; this.oscs.forEach(o => { const ap = o.fm4P && o.fm4P[key]; if (!ap) return; if (key === 'fm4Alg') ap.setValueAtTime(+v, tc); else ap.setTargetAtTime(+v, tc, 0.02); }); }
  setWtPos(v)         { const tc = this.ctx.currentTime; this.oscs.forEach(o => o.wt && o.wt.setTargetAtTime(v, tc, 0.02)); }
  setWidth(w)         { this.panner.pan.setTargetAtTime(this.basePan * w, this.ctx.currentTime, 0.03); }

  // ---------- vocal en vivo ----------
  setVocAmt(v) {
    if (v > 0) this.ensureVocal();
    const tc = this.ctx.currentTime;
    this.vocDry.gain.setTargetAtTime(1 - v, tc, 0.02);
    if (this.vocWet) this.vocWet.gain.setTargetAtTime(v * vocMakeup(this.S.vocQ), tc, 0.02);
  }
  setVocVowel(v) {   // articulación ~50 ms: el knob "pronuncia", no salta
    if (this.vocCtl) { this.vocCtl.offset.setTargetAtTime(v * 2 - 1, this.ctx.currentTime, VOC_SMOOTH); return; }
    this._vocStatic(v * 2 - 1, VOC_SMOOTH);          // modo estático: los formantes, directamente
  }
  setVocSize(ct) {
    const tc = this.ctx.currentTime;
    if (!this.vocBqs) return;
    if (this.vocCtl) this.vocBqs.forEach(bq => bq.detune.setTargetAtTime(ct, tc, 0.02));
    else this._vocStatic(this.S.vocVowel * 2 - 1, 0.02, ct);
  }
  // Modo estático: lleva frecuencias (cents) y ganancias al punto x de las curvas
  _vocStatic(x, tau, size = this.S.vocSize) {
    if (!this.vocBqs || this.vocCtl) return;
    const tc = this.ctx.currentTime, bank = getVocalBank();
    bank.forEach((f, i) => {
      this.vocBqs[i].detune.setTargetAtTime(size + Voice._shape(f.freqCurve, x), tc, tau);
      this.vocGains[i].gain.setTargetAtTime(Voice._shape(f.gainCurve, x) * this._vocBrillo(i, this.S.vocBrillo), tc, tau);
    });
  }
  setVocQ(q) {
    if (!this.vocBqs) return;
    const tc = this.ctx.currentTime, mul = bwMul(q), bank = getVocalBank();
    this.vocBqs.forEach((bq, i) => bq.Q.setTargetAtTime(bank[i].ref / (bank[i].bw * mul), tc, 0.02));
    this.vocWet.gain.setTargetAtTime(this.S.vocAmt * vocMakeup(q), tc, 0.02);
  }
  setVocBrillo(b) {
    if (!this.vocBqs) return;
    if (!this.vocCtl) { this._vocStatic(this.S.vocVowel * 2 - 1, 0.02); return; }   // estático: Brillo va en la ganancia de F4-F5
    const tc = this.ctx.currentTime;
    this.vocBrillos.forEach(g => g.gain.setTargetAtTime(brilloMul(b), tc, 0.02));
  }
  setVocVida(v) {
    if (v > 0) this.ensureVida();
    if (this.vocWanderGain) this.vocWanderGain.gain.setTargetAtTime(v * VOC_VIDA_CENTS, this.ctx.currentTime, 0.02);
  }

  // Desliza la afinación a una nueva nota (mono/legato), SIN retrigger de envolvente.
  glideTo(freq, time) {
    const t = this.ctx.currentTime;
    const slide = (p, target) => {
      if (time > 0) {
        if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
        else { p.cancelScheduledValues(t); p.setValueAtTime(Math.max(1, p.value), t); }
        p.exponentialRampToValueAtTime(target, t + time);
      } else {
        p.cancelScheduledValues(t); p.setValueAtTime(target, t);
      }
    };
    this.oscs.forEach(o => slide(o.freq, Math.max(1, freq * o.ratio)));
    // el banco de resonadores sigue la nota: sus modos resbalan con los osciladores
    if (this.resBqs) { const nyq = this.ctx.sampleRate * 0.45; this.resFreq = freq; this.resBqs.forEach((bq, i) => slide(bq.frequency, Math.min(nyq, freq * this.resRatios[i]))); }
  }

  // ---------- release ----------
  release(rel, at = null) {
    rel = Math.max(0.006, rel);
    const now = this.ctx.currentTime;
    const t = at !== null && at > now ? at : now;   // los jugadores programan el note-off en el reloj de audio
    const fRel = this.S.fenvMode === 'own' ? Math.max(0.006, this.S.fr) : rel;
    // Release con la curva del knob, anclando el valor ACTUAL. Clave: si sueltas a mitad de una rampa
    // (p.ej. el decay de un pluck con sustain 0), cancelScheduledValues a secas borra la
    // rampa-destino y el parámetro se queda clavado en el ÚLTIMO evento (el pico del attack)
    // -> la ganancia saltaría de golpe a peak = re-disparo audible al soltar. Anclar primero
    // el valor en curso evita ese salto; y al no usar cancelAndHoldAtTime tampoco hay click.
    if (t > now) { this._releaseParamAt(this.vca.gain, t, rel, this._envAmp); this._releaseParamAt(this.fenv.offset, t, fRel, this._envFil); }
    else { this._releaseParam(this.vca.gain, t, rel); this._releaseParam(this.fenv.offset, t, fRel); }
    return t + rel + 0.03;  // la cadena llega a 0 exacto en t + rel: liberar los nodos ahí es inaudible
                            // (manda el release de amplitud: con el VCA cerrado el filtro no suena)
  }
  _releaseParam(param, t, rel) {
    const cur = param.value;            // refleja el valor de la rampa en curso
    param.cancelScheduledValues(t);
    param.setValueAtTime(cur, t);       // ancla aquí -> sin salto
    this._relChain(param, t, cur, rel);
  }
  // Release programado en el FUTURO (jugadores): el valor que tendrá la rampa
  // en t aún no se puede leer — cancelAndHoldAtTime congela la automatización
  // en t con ese valor y desde ahí cae el release. (cancelScheduledValues(t)
  // borraría una rampa de ataque que termine después de t: la nota callaría.)
  _releaseParamAt(param, t, rel, env) {
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
    else { const cur = param.value; param.cancelScheduledValues(t); param.setValueAtTime(cur, t); }
    this._relChain(param, t, this._envValueAt(env, t), rel);   // el valor en t se calcula: el param aún no lo sabe
  }

  // Corte rápido sin click (robo de voz / recorte de colas): re-rampa el VCA a cero.
  fadeOut(tau = 0.01) {
    const t = this.ctx.currentTime;
    this._releaseParam(this.vca.gain, t, tau);
    this._releaseParam(this.fenv.offset, t, tau);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const m = this.mod;
    if (m.stats) m.stats.worklets -= this.oscs.length;
    // desconectar la modulación global de los params de esta voz y parar worklets
    // (vibrato/PWM llegan a través de las ganancias de fade por voz)
    if (this.vibFade) { try { this.vibG.disconnect(this.vibFade); } catch (e) {} try { this.vibFade.disconnect(); } catch (e) {} }
    if (this.pwmFade) { try { this.pwmG.disconnect(this.pwmFade); } catch (e) {} try { this.pwmFade.disconnect(); } catch (e) {} }
    this.oscs.forEach(o => {
      try { m.pitchOffset.disconnect(o.detune); } catch (e) {}
      try { o.node.port.postMessage('stop'); } catch (e) {}
      try { o.node.disconnect(); } catch (e) {}
    });
    // (cutG/resG/panG son los gains globales del motor o los propios de la voz: la misma desconexión)
    if (this.panG) { try { this.panG.disconnect(this.panner.pan); } catch (e) {} }
    if (this.cutG) this._filters().forEach(f => { try { this.cutG.disconnect(f.frequency); } catch (e) {} });
    if (this.resG) { try { this.resG.disconnect(this.lp.Q); } catch (e) {} try { this.resG.disconnect(this.hp.Q); } catch (e) {} }
    if (this._connMacro) this._filters().forEach(f => { try { this.mod.macroCut.disconnect(f.detune); } catch (e) {} });   // la macro es del motor: soltar solo lo de esta voz
    // LFOs y deriva propios de la voz: parar sus buffers (un BufferSource en loop no se para solo)
    if (this.vlfo) for (const k in this.vlfo) stopVoiceLFO(this.vlfo[k]);
    stopVoiceLFO(this.drift);
    // matriz: soltar los slots (la fuente puede ser un LFO global: hay que
    // desconectarla del gain del slot para no dejar basura en el grafo)
    this.mxSlots.forEach(s => {
      if (!s) return;
      try { s.src.disconnect(s.gain); } catch (e) {}
      try { s.gain.disconnect(); } catch (e) {}
    });
    for (const k in this._mxConsts) {
      try { this._mxConsts[k].stop(); } catch (e) {}
      try { this._mxConsts[k].disconnect(); } catch (e) {}
    }
    [this.busA, this.busB, this.gA, this.gB, this.normX, this.ringX, this.noiseGain, this.nLP, this.nHP,
     this.lp, this.hp, this.lp2, this.hp2, this.lpMix, this.hpMix, this.fenvGain, this.vca, this.ampMod, this.panner,
     this.dvDry, this.dvPre, this.dvShaper, this.dvPost, this.dvWet, this.dvOut,
     this.vocDry, this.vocOut, this.vocWet, this.vocCtl, this.vocWanderGain, this.vocBurstGain, this.vocBurstBp,
     ...(this.vocBqs || []), ...(this.vocGains || []), ...(this.vocShapers || []),
     ...(this.vocBrillos || []),
     this.resDry, this.resOut, this.resIn, this.resNoise, this.resWet, ...(this.resBqs || []), ...(this.resGs || [])].forEach(n => {
      if (n) { try { n.disconnect(); } catch (e) {} }
    });
    try { this.noiseSrc.stop(); } catch (e) {}
    try { this.fenv.stop(); } catch (e) {}
    if (this.vocCtl) { try { this.vocCtl.stop(); } catch (e) {} }
    if (this.vocWander) { try { this.vocWander.stop(); } catch (e) {} try { this.vocWander.disconnect(); } catch (e) {} }
    if (this.vocBurstSrc) { try { this.vocBurstSrc.stop(); } catch (e) {} try { this.vocBurstSrc.disconnect(); } catch (e) {} }
  }
}
