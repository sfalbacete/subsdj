/* =====================================================================
   SubSDJ · Voice — una nota polifónica.
   Cadena por voz:
     osc A/B (worklet) + ruido --mezcla/ring--> preFilter --> drive(tanh, dry/wet)
        --> VOCAL (banco de formantes, dry/wet; el ruido ya sumado = aliento)
        --> filtro LP/HP morph 12|24 dB (cutoff = base + envFiltro + LFO)
        --> VCA(ADSR) --> ampMod(matriz, base 1) --> pan --> bus
   Modulación global conectada por voz: pitchOffset, freqLFO, pwmLFO, cutLFO, resLFO.
   Matriz de modulación: slots fuente→GainNode(amt·span)→AudioParams del
   destino — la misma fontanería que las rutas dedicadas, generalizada.
   ===================================================================== */
import { MX_SLOTS, MX_SPAN, FM4_KEYS } from './params.js';
import { getWtSet } from './wavetable.js';
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
// queda colgado y luego cae de golpe»; el exponencial se oye parejo (por eso el
// release ya era exponencial). Muestreada en ENV_PTS puntos (setValueCurveAtTime
// interpola entre ellos).
const ENV_K = 6, ENV_PTS = 48;
function envCurve(from, to, k, n = ENV_PTS) {
  const c = new Float32Array(n), den = 1 - Math.exp(-k);
  for (let i = 0; i < n; i++) { const x = i / (n - 1); c[i] = from + (to - from) * (1 - Math.exp(-k * x)) / den; }
  return c;
}

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
    // startAt (opcional): inicio programado en el reloj de audio (lo usa el arpegiador).
    const t = (startAt || ctx.currentTime) + 0.005;
    this.t0 = t;                          // referencia para el fade-in de LFOs (lfoFade)
    const glide = (startFreq && S.glide > 0) ? S.glide : 0;

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

    // --- Drive pre-filtro (saturación tanh por voz, dry/wet): a 0 el camino
    // dry pasa a ganancia 1 y el wet queda a 0 -> transparente ---
    const dv = S.filterDrive;
    const dvDry = ctx.createGain(); dvDry.gain.value = 1 - dv;
    const dvPre = ctx.createGain(); dvPre.gain.value = 1 + dv * 4;
    const dvShaper = ctx.createWaveShaper(); dvShaper.curve = DRIVE_CURVE; dvShaper.oversample = '2x';
    const dvPost = ctx.createGain(); dvPost.gain.value = 1 / (1 + dv * 1.5);
    const dvWet = ctx.createGain(); dvWet.gain.value = dv;
    const dvOut = ctx.createGain();
    preFilter.connect(dvDry); dvDry.connect(dvOut);
    preFilter.connect(dvPre); dvPre.connect(dvShaper); dvShaper.connect(dvPost); dvPost.connect(dvWet); dvWet.connect(dvOut);

    // --- Vocal: banco de formantes dry/wet ANTES del filtro (los formantes
    // enriquecen la fuente; el LP/HP conserva su papel de brillo global).
    // Solo el crossfade existe siempre: el banco (biquads + WaveShapers) se
    // crea bajo demanda (ensureVocal) — el caso común vocAmt=0 no paga nodos.
    const vocDry = ctx.createGain(); vocDry.gain.value = 1 - S.vocAmt;
    const vocOut = ctx.createGain();
    dvOut.connect(vocDry); vocDry.connect(vocOut);

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
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass';
    lp.frequency.value = hp.frequency.value = cutHz;
    lp.Q.value = hp.Q.value = S.reso;
    let lp2 = null, hp2 = null, lpIn = lp, hpIn = hp;
    if (S.filterSlope === '24') {
      lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass';
      hp2 = ctx.createBiquadFilter(); hp2.type = 'highpass';
      lp2.frequency.value = hp2.frequency.value = cutHz;
      lp2.Q.value = hp2.Q.value = -3;
      lp2.connect(lp); hp2.connect(hp);
      lpIn = lp2; hpIn = hp2;
    }
    const lpMix = ctx.createGain(); lpMix.gain.value = 1 - S.morph;
    const hpMix = ctx.createGain(); hpMix.gain.value = S.morph;
    const filterOut = ctx.createGain();
    vocOut.connect(lpIn); lp.connect(lpMix); lpMix.connect(filterOut);
    vocOut.connect(hpIn); hp.connect(hpMix); hpMix.connect(filterOut);

    // LFOs globales -> cutoff (todas las etapas) / Q (solo la etapa con resonancia)
    mod.cutLFOGain.connect(lp.frequency); mod.cutLFOGain.connect(hp.frequency);
    if (lp2) { mod.cutLFOGain.connect(lp2.frequency); mod.cutLFOGain.connect(hp2.frequency); }
    mod.resLFOGain.connect(lp.Q);         mod.resLFOGain.connect(hp.Q);
    // macro de apertura del arreglo (cents sobre el detune: exponencial)
    if (mod.macroCut) [lp, hp, lp2, hp2].forEach(f => { if (f) mod.macroCut.connect(f.detune); });

    // Envolvente de filtro: ConstantSource(0..1) * envAmt(Hz) -> cutoff
    const fenv = ctx.createConstantSource(); fenv.offset.value = 0;
    const fenvGain = ctx.createGain(); fenvGain.gain.value = S.filterEnvAmt;
    fenv.connect(fenvGain); fenvGain.connect(lp.frequency); fenvGain.connect(hp.frequency);
    if (lp2) { fenvGain.connect(lp2.frequency); fenvGain.connect(hp2.frequency); }
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
    this._envSegs(g, 0, peak, sus, t, S.a, S.d);

    // Env del filtro: enlazada al ADSR de amplitud (link) o con tiempos propios.
    // El pico escala con velocity (MIDI): pegar más fuerte abre más el filtro.
    const own = S.fenvMode === 'own';
    const FA = own ? S.fa : S.a, FD = own ? S.fd : S.d, FS = own ? S.fs : S.s;
    const fo = fenv.offset;
    fo.cancelScheduledValues(t); fo.setValueAtTime(0, t);
    this._envSegs(fo, 0, vel, FS * vel, t, FA, FD);

    // guardar refs para updates en vivo y limpieza
    Object.assign(this, { busA, busB, gA, gB, normX, ringX, noiseGain, noiseSrc, nLP, nHP,
      lp, hp, lp2, hp2, lpMix, hpMix, fenv, fenvGain, vca, ampMod, panner,
      dvDry, dvPre, dvShaper, dvPost, dvWet, dvOut, vocDry, vocOut });
    if (S.panLfoLvl) this.ensurePan();          // autopan (necesita this.panner ya asignado)
    if (S.vocAmt > 0) this.ensureVocal();       // banco de formantes (también lo crea la matriz vía 'vow')
    if (S.vocVida > 0) this.ensureVida();
    if (S.vocAtk > 0 && this.vocBqs) this._vocBurst(t, vel);   // golpe consonántico (evento de arranque)

    // matriz de modulación (necesita todas las refs ya asignadas)
    this.vel = vel;
    this.mxSlots = [];                          // slot i -> {src, gain, dst}
    this._mxConsts = {};                        // fuentes escalares por voz (vel/note/rnd), cacheadas
    for (let i = 1; i <= MX_SLOTS; i++) this.mxRewire(i);
  }

  _buildOscGroup(cfg, dest, freq, startFreq, glide, t) {
    // UN nodo por grupo: las octavas se apilan DENTRO del processor (antes,
    // un AudioWorkletNode por octava: hasta 8 worklets por voz; ahora 2).
    const node = new AudioWorkletNode(this.ctx, 'pulse-processor', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
      processorOptions: {
        type: cfg.wave, phase: (cfg.phase || 0) / 360, octaves: cfg.octaves,
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

    // afina ya el oscilador (durante el pre-roll de look-ahead la voz está en silencio)
    fParam.value = glide > 0 ? startFreq : freq;
    // glide (portamento): rampa exponencial desde la nota anterior
    if (glide > 0) {
      fParam.setValueAtTime(startFreq, t);
      fParam.exponentialRampToValueAtTime(freq, t + glide);
    } else {
      fParam.setValueAtTime(freq, t);
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
      isWt: cfg.wave === 'tabla', ratio: 1 });   // isWt: la secuencia de tabla solo automatiza estos
  }
  _clampPW(v) { return v < 0.01 ? 0.01 : (v > 0.99 ? 0.99 : v); }

  // Ataque y decay de una envolvente: lineales (envCurve 0: bit-idéntico a
  // siempre) o con curva RC (envCurve > 0). El decay arranca justo donde acaba
  // el ataque: setValueCurveAtTime exige que el siguiente evento no empiece antes.
  _envSegs(p, from, peak, sus, t, a, d) {
    const k = ENV_K * (this.S.envCurve || 0);
    if (!(k > 0)) { p.linearRampToValueAtTime(peak, t + a); p.linearRampToValueAtTime(sus, t + a + d); return; }
    a = Math.max(0.001, a); d = Math.max(0.001, d);
    p.setValueCurveAtTime(envCurve(from, peak, k), t, a);
    p.setValueCurveAtTime(envCurve(peak, sus, k), t + a, d);
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
    this.mod.freqLFOGain.connect(this.vibFade);
    this.oscs.forEach(o => this.vibFade.connect(o.detune));
  }
  ensurePwm() {
    if (this._connPwm || this.disposed) return; this._connPwm = true;
    this.pwmFade = this._lfoFadeGain();
    this.mod.pwmLFOGain.connect(this.pwmFade);
    this.oscs.forEach(o => this.pwmFade.connect(o.pw));
  }
  ensurePan()   { if (this._connPan   || this.disposed) return; this._connPan   = true; this.mod.panLFOGain.connect(this.panner.pan); }

  // ---------- vocal: banco de formantes (tabla y curvas en vocal.js) ----------
  // 3 bandpass en paralelo anclados a la frecuencia REF de cada formante; el
  // morph vocálico viaja por su DETUNE (cents ⇒ exponencial, 0 Hz imposible).
  // Señal de control (dominio ±1): ConstantSource del knob Vocal + los slots
  // de matriz 'vow' SUMAN en la entrada de los WaveShapers; cada shaper mapea
  // control → cents (freqCurve) o → ganancia lineal (gainCurve). OJO WebAudio:
  // la Q del bandpass es LINEAL (f/BW), no en dB como lowpass/highpass.
  ensureVocal() {
    if (this.vocBqs || this.disposed) return;
    const ctx = this.ctx, S = this.S, bank = getVocalBank(), mul = bwMul(S.vocQ);
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
    this.vocWet = ctx.createGain(); this.vocWet.gain.value = S.vocAmt * vocMakeup(S.vocQ);
    this.vocBqs = []; this.vocGains = []; this.vocShapers = []; this.vocBrillos = [];
    bank.forEach((f, i) => {
      const bq = ctx.createBiquadFilter(); bq.type = 'bandpass';
      bq.frequency.value = f.ref; bq.detune.value = S.vocSize;
      bq.Q.value = f.ref / (f.bw * mul);          // Q constante: el BW escala con el shift (natural)
      const g = ctx.createGain(); g.gain.value = 0;   // la ganancia la pone su shaper
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
      this.dvOut.connect(bq); bq.connect(g); g.connect(this.vocWet);
      this.vocBqs.push(bq); this.vocGains.push(g); this.vocShapers.push(shF, shG);
    });
    this.vocWet.connect(this.vocOut);
    // (los slots 'vow' de la matriz no necesitan recableo: mxRewire pasa por
    // _mxDestParams, que llama aquí ANTES de conectar — el banco siempre llega primero)
    if (this._needVida) this.ensureVida();
  }
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

  // ---------- matriz de modulación (tablas en params.js) ----------
  // Fuente de un slot: los LFO llegan CRUDOS (el oscilador global, ±1, sin
  // pasar por su knob Level); 'env' es el ConstantSource de la env de filtro;
  // vel/note/rnd son un valor fijo por nota => ConstantSource propio ("CV").
  _mxSrcNode(src) {
    if (src.startsWith('lfo')) return this.mod.mxLfo[src] || null;
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
      case 'vow':    this.ensureVocal(); return this.vocShapers || [];
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
  setReso(q)   { const tc = this.ctx.currentTime; this.lp.Q.setTargetAtTime(q, tc, 0.02); this.hp.Q.setTargetAtTime(q, tc, 0.02); }
  setMorph(m)  { const tc = this.ctx.currentTime; this.lpMix.gain.setTargetAtTime(1 - m, tc, 0.02); this.hpMix.gain.setTargetAtTime(m, tc, 0.02); }
  setFilterEnvAmt(hz) { this.fenvGain.gain.setTargetAtTime(hz, this.ctx.currentTime, 0.02); }
  setFilterDrive(v) {
    const tc = this.ctx.currentTime;
    this.dvDry.gain.setTargetAtTime(1 - v, tc, 0.02);
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
    if (this.vocCtl) this.vocCtl.offset.setTargetAtTime(v * 2 - 1, this.ctx.currentTime, VOC_SMOOTH);
  }
  setVocSize(ct) {
    const tc = this.ctx.currentTime;
    if (this.vocBqs) this.vocBqs.forEach(bq => bq.detune.setTargetAtTime(ct, tc, 0.02));
  }
  setVocQ(q) {
    if (!this.vocBqs) return;
    const tc = this.ctx.currentTime, mul = bwMul(q), bank = getVocalBank();
    this.vocBqs.forEach((bq, i) => bq.Q.setTargetAtTime(bank[i].ref / (bank[i].bw * mul), tc, 0.02));
    this.vocWet.gain.setTargetAtTime(this.S.vocAmt * vocMakeup(q), tc, 0.02);
  }
  setVocBrillo(b) {
    if (!this.vocBrillos) return;
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
    this.oscs.forEach(o => {
      const target = Math.max(1, freq * o.ratio), p = o.freq;
      if (time > 0) {
        if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
        else { p.cancelScheduledValues(t); p.setValueAtTime(Math.max(1, p.value), t); }
        p.exponentialRampToValueAtTime(target, t + time);
      } else {
        p.cancelScheduledValues(t); p.setValueAtTime(target, t);
      }
    });
  }

  // ---------- release ----------
  release(rel, at = null) {
    rel = Math.max(0.006, rel);
    const now = this.ctx.currentTime, tau = rel / 4;
    const t = at !== null && at > now ? at : now;   // los jugadores programan el note-off en el reloj de audio
    const fRel = this.S.fenvMode === 'own' ? Math.max(0.006, this.S.fr) : rel;
    // Release EXPONENCIAL anclando el valor ACTUAL. Clave: si sueltas a mitad de una rampa
    // (p.ej. el decay de un pluck con sustain 0), cancelScheduledValues a secas borra la
    // rampa-destino y el parámetro se queda clavado en el ÚLTIMO evento (el pico del attack)
    // -> la ganancia saltaría de golpe a peak = re-disparo audible al soltar. Anclar primero
    // el valor en curso evita ese salto; y al no usar cancelAndHoldAtTime tampoco hay click.
    const rp = t > now ? this._releaseParamAt : this._releaseParam;
    rp.call(this, this.vca.gain, t, tau);
    rp.call(this, this.fenv.offset, t, fRel / 4);
    return t + rel * 2;     // a ~8·tau la cola está sobre -70 dB: liberar los nodos ahí es inaudible
                            // (manda el release de amplitud: con el VCA cerrado el filtro no suena)
  }
  _releaseParam(param, t, tau) {
    const cur = param.value;            // refleja el valor de la rampa en curso
    param.cancelScheduledValues(t);
    param.setValueAtTime(cur, t);       // ancla aquí -> sin salto
    param.setTargetAtTime(0, t, tau);
  }
  // Release programado en el FUTURO (jugadores): el valor que tendrá la rampa
  // en t aún no se puede leer — cancelAndHoldAtTime congela la automatización
  // en t con ese valor y desde ahí cae el release. (cancelScheduledValues(t)
  // borraría una rampa de ataque que termine después de t: la nota callaría.)
  _releaseParamAt(param, t, tau) {
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
    else { const cur = param.value; param.cancelScheduledValues(t); param.setValueAtTime(cur, t); }
    param.setTargetAtTime(0, t, tau);
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
    if (this.vibFade) { try { m.freqLFOGain.disconnect(this.vibFade); } catch (e) {} try { this.vibFade.disconnect(); } catch (e) {} }
    if (this.pwmFade) { try { m.pwmLFOGain.disconnect(this.pwmFade); } catch (e) {} try { this.pwmFade.disconnect(); } catch (e) {} }
    this.oscs.forEach(o => {
      try { m.pitchOffset.disconnect(o.detune); } catch (e) {}
      try { o.node.port.postMessage('stop'); } catch (e) {}
      try { o.node.disconnect(); } catch (e) {}
    });
    try { m.panLFOGain.disconnect(this.panner.pan); } catch (e) {}
    try { m.cutLFOGain.disconnect(this.lp.frequency); } catch (e) {}
    try { m.cutLFOGain.disconnect(this.hp.frequency); } catch (e) {}
    if (this.lp2) { try { m.cutLFOGain.disconnect(this.lp2.frequency); } catch (e) {} }
    if (this.hp2) { try { m.cutLFOGain.disconnect(this.hp2.frequency); } catch (e) {} }
    try { m.resLFOGain.disconnect(this.lp.Q); } catch (e) {}
    try { m.resLFOGain.disconnect(this.hp.Q); } catch (e) {}
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
     ...(this.vocBrillos || [])].forEach(n => {
      if (n) { try { n.disconnect(); } catch (e) {} }
    });
    try { this.noiseSrc.stop(); } catch (e) {}
    try { this.fenv.stop(); } catch (e) {}
    if (this.vocCtl) { try { this.vocCtl.stop(); } catch (e) {} }
    if (this.vocWander) { try { this.vocWander.stop(); } catch (e) {} try { this.vocWander.disconnect(); } catch (e) {} }
    if (this.vocBurstSrc) { try { this.vocBurstSrc.stop(); } catch (e) {} try { this.vocBurstSrc.disconnect(); } catch (e) {} }
  }
}
