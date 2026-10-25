/* =====================================================================
   SubSDJ · arpegiador.
   Cuando arpMode != 'off', noteOn/noteOff del engine desvían aquí las
   notas (hold/unhold). Un setInterval de 25 ms solo DESPIERTA al
   planificador: el timing fino lo pone el look-ahead de 120 ms sobre el
   reloj de audio (cada paso entra con startAt exacto en la voz, y su
   note-off también va programado: ver _off).
   División musical sobre S.bpm (compartido con el delay sincado). Los pasos
   caen en la rejilla del RELOJ COMÚN (engine/Clock.js): el primero que va a
   tempo fija el origen en su primera nota y los demás (otro Arp, un Seq, el
   director) se alinean. Una tecla puede llegar con su instante («when», la
   de un jugador): entra en el arpegio a partir de ese paso, no antes.
   ===================================================================== */
import { ctxRandom } from './nodes.js';
import { clockOf, DIV_BEATS } from './Clock.js';

export class Arp {
  constructor(engine) {
    this.e = engine;
    this.held = [];          // {id, freq, vel, from} en orden de pulsación (from: instante en que entra)
    this.idx = 0;
    this.timer = null;
    this.nextT = 0;
    this.tie = null;         // {id, t}: off de la nota ligada (gate 1), pendiente del on siguiente
  }

  _div() { return DIV_BEATS[this.e.S.arpDiv] || 0.25; }
  // Empezar a ir a tempo con el primer paso en t (o en la rejilla, si ya hay otros)
  _begin(t) { this.idx = 0; clockOf(this.e.ctx).begin(this, t, this._div(), this.e.bpm); }
  hold(id, freq, vel, when = null) {
    if (!this.held.find(h => h.id === id)) this.held.push({ id, freq, vel, from: when === null ? 0 : when });
    if (!this.timer) {
      this._begin(when === null ? this.e.ctx.currentTime + 0.03 : when);
      this.timer = setInterval(() => this._tick(), 25);
      this._tick();                                   // el primer paso, ya: no depende de cuándo llegue el primer intervalo
    }
  }
  unhold(id) {
    this.held = this.held.filter(h => h.id !== id);
    this._maybeStop();
  }
  _maybeStop() { if (this.timer && !this.held.length) { clearInterval(this.timer); this.timer = null; this._flushTie(); clockOf(this.e.ctx).leave(this); } }
  // Note-off programado en el reloj de audio y emitido YA, en orden con los on:
  // así el motor sabe si dos pasos se solapan por el gate (en mono: legato o
  // redisparo), no por cuánto se adelanta el planificador. Con gate 1 la nota
  // toca a la siguiente: su off se emite DESPUÉS del on siguiente (ligadura).
  _off(id, t, tie) { if (tie) this.tie = { id, t }; else this.e._directOff(id, t); }
  _flushTie() { const p = this.tie; if (p) { this.tie = null; this.e._directOff(p.id, p.t); } }

  stop() { this.held = []; this._maybeStop(); this.e.allNotesOff(); }

  // Secuencia: notas retenidas ordenadas por altura, repetidas por octavas
  _seq() {
    const oct = Math.max(1, Math.min(3, +this.e.S.arpOct || 1));
    const base = this.held.filter(h => !(h.from > this.nextT + 1e-6)).sort((a, b) => a.freq - b.freq);   // las que ya han entrado
    const seq = [];
    for (let o = 0; o < oct; o++) base.forEach(h => seq.push({ freq: h.freq * (1 << o), vel: h.vel }));
    return seq;
  }

  _tick() {
    const S = this.e.S, ctx = this.e.ctx, clock = clockOf(ctx), div = this._div();
    clock.sync(this, div, this.e.bpm);
    while (this.nextT < ctx.currentTime + 0.12) {
      const seq = this._seq();
      if (!seq.length) return;                                // (teclas que aún no han entrado: el paso espera)
      const n = seq.length;
      let i;
      if (S.arpMode === 'random') i = Math.floor(ctxRandom(ctx)() * n);
      else if (S.arpMode === 'down') i = (n - 1) - (this.idx % n);
      else if (S.arpMode === 'updown') { const m = Math.max(1, 2 * n - 2), k = this.idx % m; i = k < n ? k : m - k; }
      else i = this.idx % n;                                  // 'up'
      const note = seq[i];
      const dur = clock.stepSecs(this, div);                  // con swing, el par se reparte desigual
      const id = 'arp' + (this.idx % 8);                      // ids rotatorios (gate<=1 => sin solapes)
      this.e._directOn(id, note.freq, note.vel, this.nextT);
      this._flushTie();                                       // la ligada del paso anterior se suelta tras este on
      const gate = Math.max(0.05, Math.min(1, S.arpGate));
      this._off(id, this.nextT + dur * gate, gate >= 1);
      this.idx++;
      clock.advance(this, div);
    }
  }
}
