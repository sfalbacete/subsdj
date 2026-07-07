/* =====================================================================
   SubSDJ · Voice — una nota polifónica.
   Cadena por voz:
     osc A/B (worklet) + ruido --mezcla/ring--> preFilter
        --> filtro LP/HP morph (cutoff = base + envFiltro + LFO) --> VCA(ADSR) --> bus
   Modulación global conectada por voz: pitchOffset, freqLFO, pwmLFO, cutLFO, resLFO.
   ===================================================================== */

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

    // --- Ruido ---
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = mod.noiseBuffer; noiseSrc.loop = true;
    const noiseGain = ctx.createGain(); noiseGain.gain.value = S.noise;
    noiseSrc.connect(noiseGain);

    // --- Suma pre-filtro ---
    const preFilter = ctx.createGain();
    normX.connect(preFilter); ringX.connect(preFilter); noiseGain.connect(preFilter);

    // --- Filtro por voz: LP + HP en paralelo con crossfade (morph) ---
    // keytrack: el cutoff sigue la altura de la nota (0 = fijo, 1 = 1:1 con el tono)
    this.noteFreq = freq;
    this.ktMul = S.keytrack ? Math.pow(freq / 261.63, S.keytrack) : 1;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass';
    lp.frequency.value = hp.frequency.value = Math.min(20000, S.cutoff * this.ktMul);
    lp.Q.value = hp.Q.value = S.reso;
    const lpMix = ctx.createGain(); lpMix.gain.value = 1 - S.morph;
    const hpMix = ctx.createGain(); hpMix.gain.value = S.morph;
    const filterOut = ctx.createGain();
    preFilter.connect(lp); lp.connect(lpMix); lpMix.connect(filterOut);
    preFilter.connect(hp); hp.connect(hpMix); hpMix.connect(filterOut);

    // LFOs globales -> cutoff / Q de este filtro
    mod.cutLFOGain.connect(lp.frequency); mod.cutLFOGain.connect(hp.frequency);
    mod.resLFOGain.connect(lp.Q);         mod.resLFOGain.connect(hp.Q);

    // Envolvente de filtro: ConstantSource(0..1) * envAmt(Hz) -> cutoff
    const fenv = ctx.createConstantSource(); fenv.offset.value = 0;
    const fenvGain = ctx.createGain(); fenvGain.gain.value = S.filterEnvAmt;
    fenv.connect(fenvGain); fenvGain.connect(lp.frequency); fenvGain.connect(hp.frequency);
    fenv.start(t);

    // --- VCA (envolvente de amplitud) + colocación estéreo ---
    const vca = ctx.createGain(); vca.gain.value = 0;
    const panner = ctx.createStereoPanner();
    // posición base por altura de nota (±2 octavas desde C4 => ±1), escalada por Width
    this.basePan = Math.max(-1, Math.min(1, Math.log2(freq / 261.63) / 2));
    panner.pan.value = this.basePan * S.width;
    filterOut.connect(vca); vca.connect(panner); panner.connect(mod.voicesBus);
    noiseSrc.start(t);

    // --- Programación de envolventes ADSR (amp + filtro comparten A/D/S/R) ---
    const peak = vel, sus = S.s * vel;
    const g = vca.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(peak, t + S.a);
    g.linearRampToValueAtTime(sus,  t + S.a + S.d);

    // Env del filtro: enlazada al ADSR de amplitud (link) o con tiempos propios.
    // El pico escala con velocity (MIDI): pegar más fuerte abre más el filtro.
    const own = S.fenvMode === 'own';
    const FA = own ? S.fa : S.a, FD = own ? S.fd : S.d, FS = own ? S.fs : S.s;
    const fo = fenv.offset;
    fo.cancelScheduledValues(t); fo.setValueAtTime(0, t);
    fo.linearRampToValueAtTime(vel,      t + FA);
    fo.linearRampToValueAtTime(FS * vel, t + FA + FD);

    // guardar refs para updates en vivo y limpieza
    Object.assign(this, { busA, busB, gA, gB, normX, ringX, noiseGain, noiseSrc,
      lp, hp, lpMix, hpMix, fenv, fenvGain, vca, panner });
    if (S.panLfoLvl) this.ensurePan();          // autopan (necesita this.panner ya asignado)
  }

  _buildOscGroup(cfg, dest, freq, startFreq, glide, t) {
    // UN nodo por grupo: las octavas se apilan DENTRO del processor (antes,
    // un AudioWorkletNode por octava: hasta 8 worklets por voz; ahora 2).
    const node = new AudioWorkletNode(this.ctx, 'pulse-processor', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
      processorOptions: { type: cfg.wave, phase: (cfg.phase || 0) / 360, octaves: cfg.octaves },
    });
    if (this.mod.stats) this.mod.stats.worklets++;
    const fParam = node.parameters.get('frequency');
    const dParam = node.parameters.get('detune');
    const pParam = node.parameters.get('pulseWidth');
    const sParam = node.parameters.get('spread');
    sParam.value = this.S.spread;
    const drParam = node.parameters.get('drift'); drParam.value = this.S.drift;
    const fmRParam = node.parameters.get('fmRatio'); fmRParam.value = this.S.fmRatio;
    const fmIParam = node.parameters.get('fmIndex'); fmIParam.value = this.S.fmIndex;

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
    this.oscs.push({ node, freq: fParam, detune: dParam, pw: pParam, sp: sParam, dr: drParam, fmR: fmRParam, fmI: fmIParam, ratio: 1 });
  }
  _clampPW(v) { return v < 0.01 ? 0.01 : (v > 0.99 ? 0.99 : v); }

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

  // ---------- updates en vivo (los llama el engine al girar knobs) ----------
  setMix(mix)  { const tc = this.ctx.currentTime; this.gA.gain.setTargetAtTime(1 - mix, tc, 0.02); this.gB.gain.setTargetAtTime(mix, tc, 0.02); }
  setRing(r)   { const tc = this.ctx.currentTime; this.normX.gain.setTargetAtTime(1 - r, tc, 0.02); this.ringX.gain.setTargetAtTime(r, tc, 0.02); }
  setNoise(n)  { this.noiseGain.gain.setTargetAtTime(n, this.ctx.currentTime, 0.02); }
  setCutoff(hz){ const tc = this.ctx.currentTime, v = Math.min(20000, hz * this.ktMul); this.lp.frequency.setTargetAtTime(v, tc, 0.02); this.hp.frequency.setTargetAtTime(v, tc, 0.02); }
  setKeytrack(kt, cutoffHz) { this.ktMul = kt ? Math.pow(this.noteFreq / 261.63, kt) : 1; this.setCutoff(cutoffHz); }
  setReso(q)   { const tc = this.ctx.currentTime; this.lp.Q.setTargetAtTime(q, tc, 0.02); this.hp.Q.setTargetAtTime(q, tc, 0.02); }
  setMorph(m)  { const tc = this.ctx.currentTime; this.lpMix.gain.setTargetAtTime(1 - m, tc, 0.02); this.hpMix.gain.setTargetAtTime(m, tc, 0.02); }
  setFilterEnvAmt(hz) { this.fenvGain.gain.setTargetAtTime(hz, this.ctx.currentTime, 0.02); }
  setPulseWidth(pw)   { const tc = this.ctx.currentTime, v = this._clampPW(pw); this.oscs.forEach(o => o.pw.setTargetAtTime(v, tc, 0.02)); }
  setSpread(v)        { const tc = this.ctx.currentTime; this.oscs.forEach(o => o.sp.setTargetAtTime(v, tc, 0.02)); }
  setDrift(v)         { const tc = this.ctx.currentTime; this.oscs.forEach(o => o.dr.setTargetAtTime(v, tc, 0.02)); }
  setFM(ratio, index) { const tc = this.ctx.currentTime; this.oscs.forEach(o => { o.fmR.setValueAtTime(ratio, tc); o.fmI.setTargetAtTime(index, tc, 0.02); }); }
  setWidth(w)         { this.panner.pan.setTargetAtTime(this.basePan * w, this.ctx.currentTime, 0.03); }

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
  release(rel) {
    rel = Math.max(0.006, rel);
    const t = this.ctx.currentTime, tau = rel / 4;
    const fRel = this.S.fenvMode === 'own' ? Math.max(0.006, this.S.fr) : rel;
    // Release EXPONENCIAL anclando el valor ACTUAL. Clave: si sueltas a mitad de una rampa
    // (p.ej. el decay de un pluck con sustain 0), cancelScheduledValues a secas borra la
    // rampa-destino y el parámetro se queda clavado en el ÚLTIMO evento (el pico del attack)
    // -> la ganancia saltaría de golpe a peak = re-disparo audible al soltar. Anclar primero
    // el valor en curso evita ese salto; y al no usar cancelAndHoldAtTime tampoco hay click.
    this._releaseParam(this.vca.gain, t, tau);
    this._releaseParam(this.fenv.offset, t, fRel / 4);
    return t + rel * 2;     // a ~8·tau la cola está sobre -70 dB: liberar los nodos ahí es inaudible
                            // (manda el release de amplitud: con el VCA cerrado el filtro no suena)
  }
  _releaseParam(param, t, tau) {
    const cur = param.value;            // refleja el valor de la rampa en curso
    param.cancelScheduledValues(t);
    param.setValueAtTime(cur, t);       // ancla aquí -> sin salto
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
    try { m.resLFOGain.disconnect(this.lp.Q); } catch (e) {}
    try { m.resLFOGain.disconnect(this.hp.Q); } catch (e) {}
    [this.busA, this.busB, this.gA, this.gB, this.normX, this.ringX, this.noiseGain,
     this.lp, this.hp, this.lpMix, this.hpMix, this.fenvGain, this.vca, this.panner].forEach(n => {
      try { n.disconnect(); } catch (e) {}
    });
    try { this.noiseSrc.stop(); } catch (e) {}
    try { this.fenv.stop(); } catch (e) {}
  }
}
