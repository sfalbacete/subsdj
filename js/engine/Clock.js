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
   SWING (Roadmap 7.0 · 5.4): en cada PAR de pasos de una rejilla binaria de
   corchea o menos (1/8, 1/16, 1/32), el segundo llega tarde: cae en la
   fracción `swing` del par (0,5 = recto, 0,667 = tresillo, 0,75 = puntillo);
   el par mide lo mismo, así que el primero se alarga y el segundo se acorta.
   Lo aplica el reloj a todos (Arp, Seq, Pasos y jugadores): todo columpia
   igual. Negras y tresillos no se columpian (no es swing).
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
    this.swing = 0.5;             // fracción del par en que cae el 2º paso (0,5 = recto)
  }
  // ¿Se columpia esta rejilla? (en pulsos: 1/8 = 0,5, 1/16 = 0,25, 1/32 = 0,125)
  swings(div) { return this.swing > 0.5 && (Math.abs(div - 0.5) < 1e-9 || Math.abs(div - 0.25) < 1e-9 || Math.abs(div - 0.125) < 1e-9); }
  // Retraso (en pulsos) del paso de `div` que empieza en el pulso b: los impares del par llegan tarde
  swingDelay(b, div) { return this.swings(div) && Math.round(b / div) % 2 !== 0 ? (this.swing - 0.5) * 2 * div : 0; }
  // Duración real (en pulsos) de ese paso: el 1º del par se alarga y el 2º se acorta
  swingLen(b, div) { return !this.swings(div) ? div : (Math.round(b / div) % 2 !== 0 ? 1 - this.swing : this.swing) * 2 * div; }
  // Instante del paso que empieza en el pulso b, columpiado
  swungTime(b, div) { return this.timeAt(b + this.swingDelay(b, div)); }
  listen(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _changed() { for (const f of this.listeners) { try { f(this); } catch (e) { console.error(e); } } }
  beatLen() { return 60 / this.bpm; }
  beatAt(t) { return (t - this.origin) / this.beatLen(); }
  timeAt(beat) { return this.origin + beat * this.beatLen(); }
  // Pulso del primer paso de la rejilla de `div` pulsos que suena en t o después (columpiado)
  nextGridB(t, div) {
    let k = Math.ceil((t - this.origin - TOL) / (div * this.beatLen()));
    if (this.swings(div)) { k--; while (this.swungTime(k * div, div) < t - TOL) k++; }   // un impar retrasado aún puede caer después de t
    return k * div;
  }
  // Primer punto de la rejilla de `div` pulsos en t o después
  nextGrid(t, div) { const b = this.nextGridB(t, div); return this.swungTime(b, div); }
  // Índice del paso de `div` pulsos que contiene t (con swing, el impar empieza tarde)
  stepAt(t, div) {
    const x = (t - this.origin + TOL) / (div * this.beatLen());
    if (!this.swings(div)) return Math.floor(x);
    const pair = Math.floor(x / 2);
    return 2 * pair + (x - 2 * pair >= 2 * this.swing ? 1 : 0);
  }
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
  begin(u, t, div, bpm) { this.join(u, t, div, bpm); u.nextB = this.nextGridB(t, div); u.nextT = this.swungTime(u.nextB, div); u.epoch = this.epoch; }
  sync(u, div, bpm) {
    const now = this.ctx.currentTime;
    if (bpm) this.setBpm(bpm, now);   // el tempo bueno (la sala), venga el cambio de donde venga
    if (u.epoch !== this.epoch) { u.nextB = this.nextGridB(u.nextT, div); u.epoch = this.epoch; }
    u.nextT = this.swungTime(u.nextB, div);
    if (u.nextT < now) { u.nextB = this.nextGridB(now + 0.01, div); u.nextT = this.swungTime(u.nextB, div); }   // se quedó atrás (pestaña oculta)
  }
  advance(u, div) { u.nextB = (Math.floor(u.nextB / div + 1e-9) + 1) * div; u.nextT = this.swungTime(u.nextB, div); }   // con otra división, al siguiente múltiplo
  // Lo que dura de verdad (en s) el paso que toca a `u` (con swing, el par se reparte desigual)
  stepSecs(u, div) { return this.swingLen(u.nextB, div) * this.beatLen(); }
}

const clocks = new WeakMap();
export function clockOf(ctx) {
  let c = clocks.get(ctx);
  if (!c) { c = new Clock(ctx); clocks.set(ctx, c); }
  return c;
}

// División de los selectores (Arp, Seq, secuencia de tabla) en pulsos
export const DIV_BEATS = { '1/4': 1, '1/8': 0.5, '1/16': 0.25 };
