/* =====================================================================
   SubSDJ · reloj común (Roadmap 7.0 · 0.4) — una rejilla para todo lo que
   va a tempo en un contexto de audio: el director (Partes), el arpegiador y
   el secuenciador de cada motor (y lo que venga: LFO a tempo, Pasos, swing).
   Qué es: el ORIGEN (instante de audio del pulso 0) y el BPM. El pulso en t
   es (t − origen)/(60/bpm); la rejilla de `div` pulsos son sus múltiplos.
   Por qué: antes cada uno arrancaba su reloj al pulsar (ahora + 30 ms) y
   sumaba duraciones; el director contaba con otro. Dos arpegios de dos
   partes, o un jugador que toca una parte con Arp, caían donde cayera el
   temporizador — fuera del compás.
   Quién manda: el director ANCLA el origen al arrancar (su pulso 0). Sin él,
   el primero que empieza a ir a tempo lo fija en su primera nota (sin
   retraso añadido, como siempre) y los que se suman van a la rejilla; el
   origen se conserva mientras alguien siga a tempo. Un cambio de BPM
   reancla en el pulso de AHORA: la posición no salta.
   Uno por contexto (las partes de una escena comparten contexto).
   ===================================================================== */
const TOL = 1e-6;   // s: menos que una muestra — un instante que ya está en la rejilla no salta al punto siguiente

export class Clock {
  constructor(ctx) {
    this.ctx = ctx;
    this.origin = 0;          // instante de audio del pulso 0
    this.bpm = 120;
    this.users = new Set();   // quién va a tempo ahora (Arp, Seq, director)
    this.epoch = 0;           // sube cada vez que el origen se fija de nuevo (los pulsos de antes ya no valen)
    this.listeners = new Set();   // avisos de cambio de BPM u origen (los LFO a tempo se reubican)
  }
  listen(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _changed() { for (const f of this.listeners) { try { f(this); } catch (e) { console.error(e); } } }
  beatLen() { return 60 / this.bpm; }
  beatAt(t) { return (t - this.origin) / this.beatLen(); }
  timeAt(beat) { return this.origin + beat * this.beatLen(); }
  // Primer punto de la rejilla de `div` pulsos en t o después
  nextGrid(t, div) { return this.timeAt(Math.ceil((t - this.origin - TOL) / (div * this.beatLen())) * div); }
  // Índice del paso de `div` pulsos que contiene t
  stepAt(t, div) { return Math.floor((t - this.origin + TOL) / (div * this.beatLen())); }
  setBpm(bpm, now = this.ctx.currentTime) {
    if (!(bpm > 0) || bpm === this.bpm) return;
    const b = this.beatAt(now);
    this.bpm = bpm; this.origin = now - b * this.beatLen();
    this._changed();
  }
  // Empezar a ir a tempo en t: devuelve el instante del primer paso.
  join(user, t, div, bpm) {
    if (!this.users.size) { this.bpm = bpm > 0 ? bpm : this.bpm; this.origin = t; this.epoch++; this._changed(); }
    else this.setBpm(bpm, t);
    this.users.add(user);
    return this.nextGrid(t, div);
  }
  // El director: su pulso 0 es t, y manda sobre la rejilla de los demás
  anchor(user, t, bpm) { this.bpm = bpm > 0 ? bpm : this.bpm; this.origin = t; this.epoch++; this.users.add(user); this._changed(); }
  leave(user) { this.users.delete(user); }

  // --- El paso de quien va a la rejilla (Arp, Seq): u.nextB = pulso del paso
  // siguiente, u.nextT = su instante. Se guarda en PULSOS: un BPM nuevo (que
  // reancla en el pulso de ahora) remapea los pasos que faltan sin saltos.
  // Si el origen se fija de nuevo (el director arranca), los pulsos viejos no
  // valen: el paso se reubica en el primer punto de la rejilla nueva. ---
  begin(u, t, div, bpm) { u.nextT = this.join(u, t, div, bpm); u.nextB = Math.round(this.beatAt(u.nextT) / div) * div; u.epoch = this.epoch; }
  sync(u, div, bpm) {
    const now = this.ctx.currentTime;
    if (bpm) this.setBpm(bpm, now);   // el tempo bueno (la sala), venga el cambio de donde venga
    if (u.epoch !== this.epoch) { u.nextB = Math.round(this.beatAt(this.nextGrid(u.nextT, div)) / div) * div; u.epoch = this.epoch; }
    u.nextT = this.timeAt(u.nextB);
    if (u.nextT < now) { u.nextB = Math.round(this.beatAt(this.nextGrid(now + 0.01, div)) / div) * div; u.nextT = this.timeAt(u.nextB); }   // se quedó atrás (pestaña oculta)
  }
  advance(u, div) { u.nextB = (Math.floor(u.nextB / div + 1e-9) + 1) * div; u.nextT = this.timeAt(u.nextB); }   // con otra división, al siguiente múltiplo
}

const clocks = new WeakMap();
export function clockOf(ctx) {
  let c = clocks.get(ctx);
  if (!c) { c = new Clock(ctx); clocks.set(ctx, c); }
  return c;
}

// División de los selectores (Arp, Seq, secuencia de tabla) en pulsos
export const DIV_BEATS = { '1/4': 1, '1/8': 0.5, '1/16': 0.25 };
