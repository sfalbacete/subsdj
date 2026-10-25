/* =====================================================================
   SubSDJ · Director — el reloj maestro de la escena: lleva la posición
   musical (en beats; compás = 4), la armonía, el arreglo y un jugador por
   parte. Mismo patrón que Arp/Seq: un setInterval de 25 ms que solo
   DESPIERTA al planificador; cada jugador programa sus notas en el reloj de
   audio con look-ahead de 120 ms. El tempo es el BPM de la sala (S.bpm,
   compartido): si cambia, cambia desde la posición actual sin saltos.
   La posición vive en el RELOJ COMÚN del contexto (engine/Clock.js): al
   arrancar, el director ancla su pulso 0 y los Arp/Seq de las partes caen
   en su rejilla.
   Cada ~100 ms aplica lo lento: la MACRO de apertura (energía del arreglo →
   cents en los filtros de todas las partes) y la deriva de cada jugador.
   Offline (selftest): scheduleAll() planifica todo el tramo de golpe, sin
   ticker — determinista con la semilla; la macro va automatizada por
   compás en el propio AudioParam. `dry` = solo registrar eventos.
   toJSON/fromJSON: lo que la escena guarda del director (semilla, armonía,
   arreglo y la configuración de cada jugador).
   ===================================================================== */
import { Harmony } from './Harmony.js';
import { Player, PLAYER_DEF } from './Player.js';
import { Arrangement } from './Arrangement.js';
import { clockOf } from './Clock.js';

export const BEATS_PER_BAR = 4;
const LOOKAHEAD = 0.12, TICK_MS = 25, SLOW_S = 0.1;

export class Conductor {
  constructor(scene, { seed = 1 } = {}) {
    this.scene = scene; this.ctx = scene.ctx;
    this.seed = seed;
    this.harmony = new Harmony({ seed });
    this.arr = new Arrangement(this);
    this.players = scene.parts.map((p, i) => new Player(this, p, i));
    this.timer = null; this.running = false; this.dry = false;
    this.clock = clockOf(this.ctx);     // posición musical: origen (pulso 0) y bpm, compartidos con los Arp/Seq
    this._slowT = -1;
    this.onDrift = null;                // (i, key, value) → la UI mueve el knob si es la parte que edita
  }
  get bpm() { return this.scene.S.bpm || 120; }
  beatLen() { return this.clock.beatLen(); }
  timeAt(beat) { return this.clock.timeAt(beat); }
  swungTime(beat, div) { return this.clock.swungTime(beat, div); }   // el paso de `div` en `beat`, con el swing del reloj
  swingLen(beat, div) { return this.clock.swingLen(beat, div); }
  beatAt(t) { return this.clock.beatAt(t); }
  chordAtBeat(b) { return this.harmony.chordAt(Math.floor(b / BEATS_PER_BAR + 1e-9)); }
  arrangeFor(player, b) { return this.arr.stateAt(Math.floor(b / BEATS_PER_BAR + 1e-9), player.i, player.cfg); }
  barNow() { return Math.max(0, Math.floor(this.beatAt(this.ctx.currentTime) / BEATS_PER_BAR)); }

  setSeed(seed) { this.seed = seed; this.harmony.setSeed(seed); this.players.forEach(p => p.reset()); }

  start() {
    if (this.timer) return;
    this.clock.anchor(this, this.ctx.currentTime + 0.05, this.bpm);
    this.players.forEach(p => p.reset());
    this.running = true; this._slowT = -1;
    this._tick();
    this.timer = setInterval(() => this._tick(), TICK_MS);
  }
  stop() {
    if (!this.timer) return;
    clearInterval(this.timer); this.timer = null; this.running = false;
    this.clock.leave(this);
    const t = this.ctx.currentTime;
    this.players.forEach(p => {
      p.stop(t); const e = p.part.engine; e.setMacro(0);
      // el Seq con latch seguiría la frase tras soltar la raíz: parar es parar
      if (e.S.seqOn === 'on' && !e.seq.held.length && e.seq.latched) { e.seq.latched = null; e.seq._maybeStop(); }
    });
  }
  // Pánico: para el director, cancela lo pendiente y corta todo en todas las partes
  panic() {
    this.stop();
    this.players.forEach(p => { p.clearPending(); p.part.engine.allNotesOff(); });
  }
  _tick() {
    const now = this.ctx.currentTime;
    this.clock.setBpm(this.bpm, now);                                         // un BPM nuevo reancla en el pulso de ahora: sin saltos
    const until = this.beatAt(now + LOOKAHEAD);
    for (const p of this.players) p.schedule(until);
    if (now - this._slowT >= SLOW_S) {                                        // lo lento: macro de apertura y deriva
      this._slowT = now;
      const beat = this.beatAt(now), cents = this.arr.macroCents(beat / BEATS_PER_BAR);
      for (const p of this.players) { p.part.engine.setMacro(cents); p.drift(beat); }
    }
  }
  // Offline: `secs` segundos desde t0, todo de golpe (notas + macro por compás)
  scheduleAll(secs, t0 = 0) {
    this.clock.anchor(this, t0, this.bpm);
    this.players.forEach(p => p.reset());
    const until = secs / this.beatLen();
    for (const p of this.players) p.schedule(until);
    if (!this.dry) {
      const barLen = BEATS_PER_BAR * this.beatLen();
      for (let bar = 0; bar * barLen <= secs; bar++) {
        const cents = this.arr.macroCents(bar), t = t0 + bar * barLen;
        for (const p of this.players) p.part.engine.automateMacro(cents, t, bar > 0);
      }
    }
  }

  toJSON() {
    const h = this.harmony;
    return { seed: this.seed, armonia: { root: h.root, scale: h.scale, prog: [...h.prog], bars: h.bars, modo: h.modo },
             arreglo: { ...this.arr.cfg }, jugadores: this.players.map(p => ({ ...p.cfg })) };
  }
  fromJSON(j) {
    if (!j) return;
    if (this.running) this.stop();
    if (j.armonia) Object.assign(this.harmony, j.armonia);
    if (j.arreglo) Object.assign(this.arr.cfg, j.arreglo);
    (j.jugadores || []).forEach((cfg, i) => {
      const p = this.players[i]; if (!p) return;
      p.cfg = { ...PLAYER_DEF, ...cfg }; p.derivaKey = 'off'; p.derivaBase = undefined;
      if (p.cfg.deriva === 'mix') p.cfg.deriva = 'levelB';   // escenas de antes del mezclador (1.2.0)
    });
    this.setSeed(+j.seed || 1);         // resetea jugadores y paseo con la semilla guardada
  }
}
