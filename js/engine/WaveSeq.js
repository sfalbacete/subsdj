/* =====================================================================
   SubSDJ · secuencia de tabla (wave sequencing, a la Korg Wavestation).
   El morph de la tabla deja de ser un knob y pasa a ser una FRASE: pasos
   de frames (0..7, '.' = mantener) a división musical, con fundido entre
   pasos. No genera espectro nuevo — organiza EN EL TIEMPO los frames que
   ya hay (ritmo en el dominio del timbre, no del pitch).
   Cómo: automatización del AudioParam wtPos POR VOZ (setValueAtTime +
   linearRampToValueAtTime desde su noteOn). Al ser el valor INTRÍNSECO
   del param, la matriz sigue sumando encima (sus rutas son inputs).
   Cada voz arranca su frase en su noteOn: un acorde arpegiado deja las
   voces desfasadas dentro de la misma frase (imposible con un LFO global).
   El fundido es una rampa que ATRAVIESA los frames intermedios (fase
   alineada: barrido de morph, no crossfade A→B puro — y suena mejor).
   Planificación:
     - contexto OFFLINE (selftest, SFZ, render de presets): todo de golpe
       en attach(), hasta el final del buffer — no hay setInterval fiable
       cuando el render va más rápido que el reloj de pared.
     - tiempo real, modo '1shot': la frase entera en attach() (≤16 pasos,
       acotado) — envolvente de timbre multi-tramo, se queda en el último.
     - tiempo real, modo 'loop': mismo patrón que Arp/Seq — setInterval de
       25 ms que solo DESPIERTA al planificador; look-ahead de 120 ms sobre
       el reloj de audio. Editar patrón/división/bpm en vivo entra en el
       siguiente paso planificado.
   ===================================================================== */
export const WS_MAX_STEPS = 16, WS_TOP = 7;   // tokens 0..7 = los 8 frames de un set (pos = n/7)

// Token: frame 0..7 (números fuera de rango se recortan); '.' o cualquier
// otra cosa = mantener la posición anterior (null). El tiempo avanza igual.
export function parseWsPattern(str) {
  return String(str || '').trim().split(/\s+/).filter(Boolean)
    .slice(0, WS_MAX_STEPS)
    .map(tok => /^-?\d+$/.test(tok) ? Math.max(0, Math.min(WS_TOP, +tok)) : null);
}

export class WaveSeq {
  constructor(engine) {
    this.e = engine;
    this.looping = new Set();     // voces en loop (tiempo real): el ticker las extiende
    this.timer = null;
    this.uiVoice = null;          // la voz más reciente pinta el marcador de la UI
    this.playQ = [];              // sus pasos ya planificados {i, t0, t1}
    this._patStr = null; this._pat = [];
  }

  _steps() {
    const s = this.e.S.wsPat;
    if (s !== this._patStr) { this._patStr = s; this._pat = parseWsPattern(s); }
    return this._pat;
  }
  _dur() {
    const S = this.e.S;
    return (60 / this.e.bpm) * ({ '1/4': 1, '1/8': 0.5, '1/16': 0.25 }[S.wsDiv] || 0.25);   // el BPM de la sala (en Partes, el de todas)
  }

  // Engancha una voz recién creada (la llaman los dos `new Voice` del engine).
  // Solo actúa con wsOn y algún oscilador en modo 'wavetable'; el estado de la
  // frase vive EN la voz ({idx, nextT, pos}) — el ticker es compartido.
  attach(v) {
    const S = this.e.S;
    if (S.wsOn !== 'on') return;
    const wts = v.oscs.filter(o => o.isWt && o.wt).map(o => o.wt);
    if (!wts.length || !this._steps().length) return;
    v._ws = { wts, idx: 0, nextT: v.t0, pos: S.wtPos, first: true };
    this.uiVoice = v; this.playQ = [];
    const offline = typeof OfflineAudioContext !== 'undefined' && this.e.ctx instanceof OfflineAudioContext;
    if (offline) {
      this._extend(v, this.e.ctx.length / this.e.ctx.sampleRate);
    } else if (S.wsMode === '1shot') {
      this._extend(v, Infinity);                 // acotado por la longitud de la frase
    } else {
      this._extend(v, this.e.ctx.currentTime + 0.12);
      this.looping.add(v);
      if (!this.timer) this.timer = setInterval(() => this._tick(), 25);
    }
  }

  // Planifica pasos de la voz hasta `horizon`. En '1shot' se detiene al agotar
  // la frase (idx no cicla); en loop cicla con módulo POR PASO (editable en vivo).
  _extend(v, horizon) {
    const S = this.e.S, w = v._ws;
    // pestaña oculta: consumir en seco los pasos perdidos (pos al día, sin ráfaga)
    const now = this.e.ctx.currentTime;
    while (w.nextT < now - 0.05 && S.wsMode !== '1shot') {
      const st = this._steps()[w.idx % this._steps().length];
      if (st !== null && st !== undefined) w.pos = st / WS_TOP;
      w.idx++; w.nextT += this._dur(); w.first = false;
    }
    while (w.nextT < horizon) {
      const steps = this._steps();
      if (!steps.length) return;
      if (S.wsMode === '1shot' && w.idx >= steps.length) return;
      const i = w.idx % steps.length, st = steps[i], dur = this._dur(), t = w.nextT;
      if (st !== null) {
        const to = st / WS_TOP;
        const xf = w.first ? 0 : Math.max(0, Math.min(1, S.wsXf)) * dur;  // el paso 1 ARRANCA clavado
        for (const wt of w.wts) {
          wt.setValueAtTime(w.pos, t);           // ancla: la rampa parte de aquí, no del evento previo
          if (xf > 0.003) wt.linearRampToValueAtTime(to, t + xf);
          else wt.setValueAtTime(to, t);
        }
        w.pos = to;
      }
      if (v === this.uiVoice) {
        this.playQ.push({ i, t0: t, t1: t + dur });
        if (this.playQ.length > 64) this.playQ.shift();   // tope por si la UI no consume
      }
      w.first = false;
      w.idx++;
      w.nextT += dur;
    }
  }

  _tick() {
    const horizon = this.e.ctx.currentTime + 0.12;
    for (const v of this.looping) {
      if (v.disposed) { this.looping.delete(v); continue; }
      this._extend(v, horizon);
    }
    if (!this.looping.size) { clearInterval(this.timer); this.timer = null; }
  }

  // Paso que SUENA ahora en la voz más reciente (para el marcador de la UI);
  // -1 si no hay voz secuenciando. Poda la cola de pasos vencidos.
  playingStep() {
    if (!this.uiVoice || this.uiVoice.disposed || !this.e.ctx) return -1;
    const t = this.e.ctx.currentTime;
    while (this.playQ.length && this.playQ[0].t1 <= t) this.playQ.shift();
    const c = this.playQ[0];
    return c && c.t0 <= t ? c.i : -1;
  }
}
