/* =====================================================================
   SubSDJ · arpegiador.
   Cuando arpMode != 'off', noteOn/noteOff del engine desvían aquí las
   notas (hold/unhold). Un setInterval de 25 ms solo DESPIERTA al
   planificador: el timing fino lo pone el look-ahead de 120 ms sobre el
   reloj de audio (cada paso entra con startAt exacto en la voz, y su
   note-off también va programado: ver _off).
   División musical sobre S.bpm (compartido con el delay sincado).
   ===================================================================== */
export class Arp {
  constructor(engine) {
    this.e = engine;
    this.held = [];          // {id, freq, vel} en orden de pulsación
    this.idx = 0;
    this.timer = null;
    this.nextT = 0;
    this.tie = null;         // {id, t}: off de la nota ligada (gate 1), pendiente del on siguiente
  }

  hold(id, freq, vel) {
    if (!this.held.find(h => h.id === id)) this.held.push({ id, freq, vel });
    if (!this.timer) {
      this.idx = 0;
      this.nextT = this.e.ctx.currentTime + 0.03;
      this.timer = setInterval(() => this._tick(), 25);
    }
  }
  unhold(id) {
    this.held = this.held.filter(h => h.id !== id);
    this._maybeStop();
  }
  _maybeStop() { if (this.timer && !this.held.length) { clearInterval(this.timer); this.timer = null; this._flushTie(); } }
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
    const base = [...this.held].sort((a, b) => a.freq - b.freq);
    const seq = [];
    for (let o = 0; o < oct; o++) base.forEach(h => seq.push({ freq: h.freq * (1 << o), vel: h.vel }));
    return seq;
  }

  _tick() {
    const S = this.e.S, ctx = this.e.ctx;
    if (this.nextT < ctx.currentTime) this.nextT = ctx.currentTime + 0.01;  // se quedó atrás (pestaña oculta)
    while (this.nextT < ctx.currentTime + 0.12) {
      const seq = this._seq();
      if (!seq.length) return;
      const n = seq.length;
      let i;
      if (S.arpMode === 'random') i = Math.floor(Math.random() * n);
      else if (S.arpMode === 'down') i = (n - 1) - (this.idx % n);
      else if (S.arpMode === 'updown') { const m = Math.max(1, 2 * n - 2), k = this.idx % m; i = k < n ? k : m - k; }
      else i = this.idx % n;                                  // 'up'
      const note = seq[i];
      const dur = (60 / S.bpm) * ({ '1/4': 1, '1/8': 0.5, '1/16': 0.25 }[S.arpDiv] || 0.25);
      const id = 'arp' + (this.idx % 8);                      // ids rotatorios (gate<=1 => sin solapes)
      this.e._directOn(id, note.freq, note.vel, this.nextT);
      this._flushTie();                                       // la ligada del paso anterior se suelta tras este on
      const gate = Math.max(0.05, Math.min(1, S.arpGate));
      this._off(id, this.nextT + dur * gate, gate >= 1);
      this.idx++;
      this.nextT += dur;
    }
  }
}
