/* =====================================================================
   SubSDJ · Director — el reloj maestro de la escena: lleva la posición
   musical (en beats; compás = 4), la armonía, el arreglo y un jugador por
   parte. Mismo patrón que Arp/Seq: un setInterval de 25 ms que solo
   DESPIERTA al planificador; cada jugador programa sus notas en el reloj de
   audio con look-ahead de 120 ms. El tempo es el BPM de la sala (S.bpm,
   compartido): si cambia, cambia desde la posición actual sin saltos.
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
    this.pos = 0; this.posT = 0;        // posición musical (beats) y el instante de audio en que era esa
    this._slowT = -1;
    this.onDrift = null;                // (i, key, value) → la UI mueve el knob si es la parte que edita
  }
  get bpm() { return this.scene.S.bpm || 120; }
  beatLen() { return 60 / this.bpm; }
  timeAt(beat) { return this.posT + (beat - this.pos) * this.beatLen(); }
  beatAt(t) { return this.pos + (t - this.posT) / this.beatLen(); }
  chordAtBeat(b) { return this.harmony.chordAt(Math.floor(b / BEATS_PER_BAR + 1e-9)); }
  arrangeFor(player, b) { return this.arr.stateAt(Math.floor(b / BEATS_PER_BAR + 1e-9), player.i, player.cfg); }
  barNow() { return Math.max(0, Math.floor(this.beatAt(this.ctx.currentTime) / BEATS_PER_BAR)); }

  setSeed(seed) { this.seed = seed; this.harmony.setSeed(seed); this.players.forEach(p => p.reset()); }

  start() {
    if (this.timer) return;
    this.pos = 0; this.posT = this.ctx.currentTime + 0.05;
    this.players.forEach(p => p.reset());
    this.running = true; this._slowT = -1;
    this._tick();
    this.timer = setInterval(() => this._tick(), TICK_MS);
  }
  stop() {
    if (!this.timer) return;
    clearInterval(this.timer); this.timer = null; this.running = false;
    const t = this.ctx.currentTime;
    this.players.forEach(p => { p.stop(t); p.part.engine.setMacro(0); });
  }
  _tick() {
    const now = this.ctx.currentTime;
    if (now > this.posT) { this.pos = this.beatAt(now); this.posT = now; }   // avanza (con el BPM vigente)
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
    this.pos = 0; this.posT = t0;
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
    (j.jugadores || []).forEach((cfg, i) => { const p = this.players[i]; if (!p) return; p.cfg = { ...PLAYER_DEF, ...cfg }; p.derivaKey = 'off'; p.derivaBase = undefined; });
    this.setSeed(+j.seed || 1);         // resetea jugadores y paseo con la semilla guardada
  }
}
