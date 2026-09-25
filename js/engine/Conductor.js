/* =====================================================================
   SubSDJ · Director — el reloj maestro de la escena: lleva la posición
   musical (en beats; compás = 4), la armonía y un jugador por parte.
   Mismo patrón que Arp/Seq: un setInterval de 25 ms que solo DESPIERTA al
   planificador; cada jugador programa sus notas en el reloj de audio con
   look-ahead de 120 ms. El tempo es el BPM de la sala (S.bpm, compartido):
   si cambia, cambia desde la posición actual sin saltos.
   Offline (selftest): scheduleAll() planifica todo el tramo de golpe, sin
   ticker — determinista con la semilla. `dry` = solo registrar eventos.
   ===================================================================== */
import { Harmony } from './Harmony.js';
import { Player } from './Player.js';

export const BEATS_PER_BAR = 4;
const LOOKAHEAD = 0.12, TICK_MS = 25;

export class Conductor {
  constructor(scene, { seed = 1 } = {}) {
    this.scene = scene; this.ctx = scene.ctx;
    this.seed = seed;
    this.harmony = new Harmony({ seed });
    this.players = scene.parts.map((p, i) => new Player(this, p, i));
    this.timer = null; this.running = false; this.dry = false;
    this.pos = 0; this.posT = 0;        // posición musical (beats) y el instante de audio en que era esa
  }
  get bpm() { return this.scene.S.bpm || 120; }
  beatLen() { return 60 / this.bpm; }
  timeAt(beat) { return this.posT + (beat - this.pos) * this.beatLen(); }
  beatAt(t) { return this.pos + (t - this.posT) / this.beatLen(); }
  chordAtBeat(b) { return this.harmony.chordAt(Math.floor(b / BEATS_PER_BAR + 1e-9)); }
  barNow() { return Math.max(0, Math.floor(this.beatAt(this.ctx.currentTime) / BEATS_PER_BAR)); }

  setSeed(seed) { this.seed = seed; this.harmony.setSeed(seed); this.players.forEach(p => p.reset()); }

  start() {
    if (this.timer) return;
    this.pos = 0; this.posT = this.ctx.currentTime + 0.05;
    this.players.forEach(p => p.reset());
    this.running = true;
    this._tick();
    this.timer = setInterval(() => this._tick(), TICK_MS);
  }
  stop() {
    if (!this.timer) return;
    clearInterval(this.timer); this.timer = null; this.running = false;
    const t = this.ctx.currentTime;
    this.players.forEach(p => p.stop(t));
  }
  _tick() {
    const now = this.ctx.currentTime;
    if (now > this.posT) { this.pos = this.beatAt(now); this.posT = now; }   // avanza (con el BPM vigente)
    const until = this.beatAt(now + LOOKAHEAD);
    for (const p of this.players) p.schedule(until);
  }
  // Offline: `secs` segundos desde t0, todo de golpe
  scheduleAll(secs, t0 = 0) {
    this.pos = 0; this.posT = t0;
    this.players.forEach(p => p.reset());
    const until = secs / this.beatLen();
    for (const p of this.players) p.schedule(until);
  }
}
