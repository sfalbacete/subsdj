/* =====================================================================
   SubSDJ · secuenciador de pasos con transposición por teclado.
   Cuando seqOn == 'on', noteOn/noteOff del engine desvían aquí las notas:
   la tecla mantenida NO suena — es la RAÍZ que transpone la frase (seqPat,
   offsets en semitonos, '.' = silencio). El loop no se reinicia al cambiar
   de tecla (el índice sigue; seqRetrig lo reinicia en rejilla). Con
   seqLatch la frase sigue sonando al soltar, con la última raíz.
   Mismo scheduler que el arpegiador: setInterval de 25 ms que solo
   DESPIERTA al planificador; el timing fino lo pone el look-ahead de
   120 ms sobre el reloj de audio. División musical sobre S.bpm, en la
   rejilla del RELOJ COMÚN (engine/Clock.js), como el arpegiador: dos Seq de
   dos partes, o un Seq y un Arp, caen juntos. Una tecla puede llegar con su
   instante («when», la de un jugador): es raíz a partir de ese paso.
   ===================================================================== */
import { clockOf, DIV_BEATS } from './Clock.js';
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
    this.held = [];          // {id, freq, vel, from} en orden de pulsación (cima = raíz; from: instante en que entra)
    this.latched = null;     // {freq, vel} si latch retiene la frase al soltar todo
    this.idx = 0;
    this.timer = null;
    this.nextT = 0;
    this.playQ = [];         // pasos ya planificados {i, t0, t1} — para el marcador de la UI
    this._patStr = null; this._pat = [];   // caché del parseo por identidad de string
    this.tie = null;         // {id, t}: off de la nota ligada (gate 1), pendiente del on siguiente
    this.retrigAt = null;    // seqRetrig con una tecla que entra más tarde: la frase vuelve al paso 0 en ese paso
  }

  _div() { return DIV_BEATS[this.e.S.seqDiv] || 0.25; }
  // Empezar a ir a tempo con el primer paso en t (o en la rejilla, si ya hay otros)
  _begin(t) { this.idx = 0; clockOf(this.e.ctx).begin(this, t, this._div(), this.e.bpm); }
  hold(id, freq, vel, when = null) {
    if (!this.held.find(h => h.id === id)) this.held.push({ id, freq, vel, from: when === null ? 0 : when });
    if (!this.timer) {
      this.playQ = [];
      this._begin(when === null ? this.e.ctx.currentTime + 0.03 : when);
      this.timer = setInterval(() => this._tick(), 25);
      this._tick();                                   // el primer paso, ya: no depende de cuándo llegue el primer intervalo
    } else if (this.e.S.seqRetrig === 'on') {           // reinicia la frase EN REJILLA (nextT intacto: sin flams)
      if (when === null) this.idx = 0; else this.retrigAt = when;
    }
  }
  unhold(id) {
    const gone = this.held.find(h => h.id === id);
    if (!gone) return;   // id que no sosteníamos (note-off de otra parte, o tras un allNotesOff): ni toca el latch ni para la frase
    this.held = this.held.filter(h => h.id !== id);
    if (!this.held.length) {
      if (this.e.S.seqLatch === 'on') this.latched = { freq: gone.freq, vel: gone.vel };
      else { this.latched = null; this._maybeStop(); }
    }
  }
  _maybeStop() { if (this.timer && !this.held.length && !this.latched) { clearInterval(this.timer); this.timer = null; this.playQ = []; this._flushTie(); clockOf(this.e.ctx).leave(this); } }
  // Note-off programado en el reloj de audio y emitido YA, en orden con los on:
  // así el motor sabe si dos pasos se solapan por el gate (en mono: legato o
  // redisparo), no por cuánto se adelanta el planificador. Con gate 1 la nota
  // toca a la siguiente: su off se emite DESPUÉS del on siguiente (ligadura).
  _off(id, t, tie) { if (tie) this.tie = { id, t }; else this.e._directOff(id, t); }
  _flushTie() { const p = this.tie; if (p) { this.tie = null; this.e._directOff(p.id, p.t); } }

  stop() { this.held = []; this.latched = null; this._maybeStop(); this.e.allNotesOff(); }

  // Raíz con prioridad de última nota; con latch, la última soltada
  _root() {
    for (let i = this.held.length - 1; i >= 0; i--) if (!(this.held[i].from > this.nextT + 1e-6)) return this.held[i];   // la última que ya ha entrado
    return this.latched;
  }

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
    const S = this.e.S, ctx = this.e.ctx, clock = clockOf(ctx), div = this._div();
    clock.sync(this, div, this.e.bpm);
    while (this.nextT < ctx.currentTime + 0.12) {
      if (this.retrigAt !== null && this.retrigAt <= this.nextT + 1e-6) { this.idx = 0; this.retrigAt = null; }
      const steps = this._steps(), root = this._root();
      if (!steps.length || !root) return;              // (una raíz que aún no ha entrado: el paso espera)
      const dur = div * clock.beatLen();
      const st = steps[this.idx % steps.length];       // módulo en cada paso: patrón editable en vivo
      this.playQ.push({ i: this.idx % steps.length, t0: this.nextT, t1: this.nextT + dur });
      if (this.playQ.length > 64) this.playQ.shift();  // tope por si la UI no consume (panel colapsado)
      if (st) {                                        // null = silencio: el tiempo avanza igual
        const id = 'seq' + (this.idx % 8);             // ids rotatorios, disjuntos de 'arp'+n
        this.e._directOn(id, stepFreq(root.freq, st.off), root.vel, this.nextT);
        this._flushTie();                              // la ligada del paso anterior se suelta tras este on
        const gate = Math.max(0.05, Math.min(1, S.seqGate));
        this._off(id, this.nextT + dur * gate, gate >= 1);
      } else this._flushTie();                         // silencio: la ligada termina aquí
      this.idx++;
      clock.advance(this, div);
    }
  }
}
