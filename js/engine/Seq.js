/* =====================================================================
   SubSDJ · secuenciador de pasos con transposición por teclado.
   Cuando seqOn == 'on', noteOn/noteOff del engine desvían aquí las notas:
   la tecla mantenida NO suena — es la RAÍZ que transpone la frase (seqPat,
   offsets en semitonos, '.' = silencio). El loop no se reinicia al cambiar
   de tecla (el índice sigue; seqRetrig lo reinicia en rejilla). Con
   seqLatch la frase sigue sonando al soltar, con la última raíz.
   Mismo scheduler que el arpegiador: setInterval de 25 ms que solo
   DESPIERTA al planificador; el timing fino lo pone el look-ahead de
   120 ms sobre el reloj de audio. División musical sobre S.bpm.
   ===================================================================== */
export const SEQ_MAX_STEPS = 16, SEQ_OFF_MIN = -12, SEQ_OFF_MAX = 24;

// Token: entero con sufijo opcional '!' (acento) o '~' (tie) — se parsean ya
// (encoding ampliable, fase 2) aunque el _tick de hoy solo consume `off`.
// '.' o cualquier token inválido = silencio (null). Offsets clampeados.
export function parsePattern(str) {
  return String(str || '').trim().split(/\s+/).filter(Boolean)
    .slice(0, SEQ_MAX_STEPS)
    .map(tok => {
      const m = /^(-?\d+)([!~]?)$/.exec(tok);
      if (!m) return null;
      const off = Math.max(SEQ_OFF_MIN, Math.min(SEQ_OFF_MAX, +m[1]));
      return { off, accent: m[2] === '!', tie: m[2] === '~' };
    });
}

export const stepFreq = (rootFreq, off) => rootFreq * Math.pow(2, off / 12);

export class Seq {
  constructor(engine) {
    this.e = engine;
    this.held = [];          // {id, freq, vel} en orden de pulsación (cima = raíz)
    this.latched = null;     // {freq, vel} si latch retiene la frase al soltar todo
    this.idx = 0;
    this.timer = null;
    this.nextT = 0;
    this.playQ = [];         // pasos ya planificados {i, t0, t1} — para el marcador de la UI
    this._patStr = null; this._pat = [];   // caché del parseo por identidad de string
  }

  hold(id, freq, vel) {
    if (!this.held.find(h => h.id === id)) this.held.push({ id, freq, vel });
    if (!this.timer) {
      this.idx = 0;
      this.playQ = [];
      this.nextT = this.e.ctx.currentTime + 0.03;
      this.timer = setInterval(() => this._tick(), 25);
    } else if (this.e.S.seqRetrig === 'on') this.idx = 0;   // reinicia la frase EN REJILLA (nextT intacto: sin flams)
  }
  unhold(id) {
    const gone = this.held.find(h => h.id === id);
    this.held = this.held.filter(h => h.id !== id);
    if (!this.held.length) {
      if (this.e.S.seqLatch === 'on' && gone) this.latched = { freq: gone.freq, vel: gone.vel };
      else { this.latched = null; this._maybeStop(); }
    }
  }
  _maybeStop() { if (this.timer && !this.held.length && !this.latched) { clearInterval(this.timer); this.timer = null; this.playQ = []; } }
  stop() { this.held = []; this.latched = null; this._maybeStop(); this.e.allNotesOff(); }

  // Raíz con prioridad de última nota; con latch, la última soltada
  _root() { return this.held.length ? this.held[this.held.length - 1] : this.latched; }

  _steps() {
    const s = this.e.S.seqPat;
    if (s !== this._patStr) { this._patStr = s; this._pat = parsePattern(s); }
    return this._pat;
  }

  // Paso que SUENA ahora mismo (no el planificado): la UI pinta con esto el
  // marcador. Poda la cola de pasos vencidos; -1 si parado o aún sin sonar.
  playingStep() {
    if (!this.timer || !this.e.ctx) return -1;
    const t = this.e.ctx.currentTime;
    while (this.playQ.length && this.playQ[0].t1 <= t) this.playQ.shift();
    const c = this.playQ[0];
    return c && c.t0 <= t ? c.i : -1;
  }

  _tick() {
    const S = this.e.S, ctx = this.e.ctx;
    if (this.nextT < ctx.currentTime) this.nextT = ctx.currentTime + 0.01;  // se quedó atrás (pestaña oculta)
    while (this.nextT < ctx.currentTime + 0.12) {
      const steps = this._steps(), root = this._root();
      if (!steps.length || !root) return;
      const dur = (60 / S.bpm) * ({ '1/4': 1, '1/8': 0.5, '1/16': 0.25 }[S.seqDiv] || 0.25);
      const st = steps[this.idx % steps.length];       // módulo en cada paso: patrón editable en vivo
      this.playQ.push({ i: this.idx % steps.length, t0: this.nextT, t1: this.nextT + dur });
      if (this.playQ.length > 64) this.playQ.shift();  // tope por si la UI no consume (panel colapsado)
      if (st) {                                        // null = silencio: el tiempo avanza igual
        const id = 'seq' + (this.idx % 8);             // ids rotatorios, disjuntos de 'arp'+n
        this.e._directOn(id, stepFreq(root.freq, st.off), root.vel, this.nextT);
        const gate = Math.max(0.05, Math.min(1, S.seqGate));
        const offMs = Math.max(10, (this.nextT - ctx.currentTime + dur * gate) * 1000);
        setTimeout(() => this.e._directOff(id), offMs);
      }
      this.idx++;
      this.nextT += dur;
    }
  }
}
