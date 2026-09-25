/* =====================================================================
   SubSDJ · Jugador — los «dedos virtuales» de una parte. Decide QUÉ notas
   tocar y CUÁNDO; el motor no se entera: solo recibe noteOn/noteOff con
   tiempo de audio (mismo camino que el arpegiador). Todo pasa por la
   armonía del director (escala + acorde vigente).
   Modos:
     pulso    ritmo euclídeo E(k, n): k golpes repartidos lo más uniformemente
              posible en n pasos por compás — la misma matemática que dibuja
              una recta en píxeles (Bresenham). E(3,8) es el tresillo, E(5,8)
              la clave cubana… (Toussaint: casi todos los ritmos del mundo).
              Toca la fundamental del acorde en su octava (bombo, hat, perc).
     acorde   mantiene las notas del acorde vigente (3 o 4); con el Arp de la
              parte encendido, las arpegia; sin él, es un pad de acordes.
     melodia  paseo aleatorio por grados de la escala con GRAVEDAD hacia las
              notas del acorde en tiempos fuertes, probabilidad de silencio y
              duraciones (corchea, negra, blanca) según la densidad.
     raiz     mantiene la fundamental (± la quinta): dron. Re-dispara cada N
              compases o al cambiar de acorde. Con el Seq de la parte
              encendido, la nota mantenida es la RAÍZ que transpone su frase.
   Los note-off van programados en el reloj de audio (Voice.release(rel, at))
   — así el selftest puede renderlo todo offline y determinista. Si la parte
   tiene Arp/Seq activos, las notas entran por noteOn/noteOff (ellos
   secuencian) con un temporizador al instante justo.
   ===================================================================== */
import { mulberry32 } from './Harmony.js';

export const PLAYER_MODES = ['off', 'pulso', 'acorde', 'melodia', 'raiz'];
export const MODE_OCT = { pulso: 2, acorde: 4, melodia: 5, raiz: 2 };   // octava por defecto al elegir el modo
export const PLAYER_DEF = {
  mode: 'off', oct: 4, vel: 0.9,
  k: 4, n: 16, rot: 0, prob: 1, gate: 0.5, acento: 0.3,     // pulso
  notas: 3,                                                 // acorde
  densidad: 0.5, silencio: 0.2, gravedad: 0.6, rango: 1, legato: 0.8,   // melodía
  quinta: 0, cada: 2,                                       // raíz
};
const BAR = 4;            // beats por compás (4/4)
const GRID_MEL = 0.5;     // rejilla de la melodía: corcheas (en beats)

// Ritmo euclídeo E(k, n) rotado `rot` pasos: golpe en el paso i cuando el
// acumulador i·k (mod n) acaba de dar la vuelta — la recta de pendiente k/n
// dibujada en píxeles (Bresenham). El paso 0 siempre lleva golpe: E(3,8) = x..x..x.
export function euclid(k, n, rot = 0) {
  n = Math.max(1, n | 0); k = Math.max(0, Math.min(n, k | 0));
  const p = new Array(n);
  for (let i = 0; i < n; i++) p[i] = ((i * k) % n) < k ? 1 : 0;
  const r = ((rot % n) + n) % n;
  return r ? p.slice(n - r).concat(p.slice(0, n - r)) : p;
}

export class Player {
  constructor(conductor, part, index) {
    this.c = conductor; this.part = part; this.i = index;
    this.cfg = { ...PLAYER_DEF };
    this.log = null;            // [] para registrar los eventos (selftest)
    this.reset();
  }
  reset() {
    this.nextBeat = 0; this.held = []; this.seq = 0; this.busy = 0; this.melIdx = -1; this.lastKey = null;
    this.rng = mulberry32((this.c.seed * 7919 + this.i * 104729 + 13) | 0);
  }
  setMode(mode) {
    if (mode === this.cfg.mode) return;
    this.releaseHeld(this.c.ctx.currentTime);
    this.cfg.mode = mode;
    if (MODE_OCT[mode] !== undefined) this.cfg.oct = MODE_OCT[mode];
    this.busy = 0; this.melIdx = -1; this.lastKey = null;
  }
  stop(when) { this.releaseHeld(when); this.busy = 0; this.lastKey = null; }
  releaseHeld(when) { for (const id of this.held) this._off(id, when); this.held = []; }

  _id() { return 'p' + this.i + '_' + (this.seq++); }
  _routed() { const S = this.part.engine.S; return S.seqOn === 'on' || S.arpMode !== 'off'; }
  _on(id, midi, vel, when) {
    if (this.log) this.log.push([+when.toFixed(4), 'on', midi, +vel.toFixed(2)]);
    if (this.c.dry) return;
    const e = this.part.engine, f = 440 * Math.pow(2, (midi - 69) / 12);
    if (this._routed()) setTimeout(() => e.noteOn(id, f, vel), Math.max(0, (when - e.ctx.currentTime) * 1000));
    else e._directOn(id, f, vel, when);
  }
  _off(id, when) {
    if (this.log) this.log.push([+when.toFixed(4), 'off']);
    if (this.c.dry) return;
    const e = this.part.engine;
    if (this._routed()) setTimeout(() => e.noteOff(id), Math.max(0, (when - e.ctx.currentTime) * 1000));
    else e._directOff(id, when);
  }
  base() { return 12 * (this.cfg.oct + 1); }   // MIDI del Do de la octava elegida (oct 4 → 60)

  // Planifica todo lo que caiga antes de `untilBeat` (en beats del director)
  schedule(untilBeat) {
    const fn = this['_' + this.cfg.mode];
    if (!fn) return;
    const nowB = this.c.beatAt(this.c.ctx.currentTime);   // por si se quedó atrás (pestaña oculta)
    let guard = 0;
    while (this.nextBeat < untilBeat && guard++ < 4096) fn.call(this, nowB);
  }

  _pulso(nowB) {
    const c = this.cfg, step = BAR / Math.max(1, c.n);
    if (this.nextBeat < nowB - 1) this.nextBeat = Math.ceil(nowB / step) * step;
    const b = this.nextBeat, idx = Math.round(b / step) % c.n;
    if (euclid(c.k, c.n, c.rot)[idx] && this.rng() < c.prob) {
      const t = this.c.timeAt(b), onBeat = Math.abs(b - Math.round(b)) < 1e-6;
      const vel = Math.min(1, c.vel * (onBeat ? 1 : 1 - c.acento) * (0.92 + 0.16 * this.rng()));
      const id = this._id();
      this._on(id, this.base() + this.c.chordAtBeat(b).rootPc, vel, t);
      this._off(id, t + step * c.gate * this.c.beatLen());
    }
    this.nextBeat = b + step;
  }

  _acorde(nowB) {
    const c = this.cfg;
    if (this.nextBeat < nowB - 1) this.nextBeat = Math.ceil(nowB / BAR) * BAR;
    const b = this.nextBeat, ch = this.c.chordAtBeat(b), pcs = ch.tones.slice(0, c.notas), key = pcs.join(',');
    if (key !== this.lastKey) {                     // solo al cambiar de acorde (un pad se mantiene)
      const t = this.c.timeAt(b);
      this.releaseHeld(t);
      let prev = this.base() + ch.rootPc - 1;       // voz cerrada: cada nota, la siguiente por encima
      for (const pc of pcs) {
        let m = prev + 1; while (m % 12 !== pc) m++; prev = m;
        const id = this._id(); this._on(id, m, c.vel, t); this.held.push(id);
      }
      this.lastKey = key;
    }
    this.nextBeat = b + BAR;
  }

  _raiz(nowB) {
    const c = this.cfg;
    if (this.nextBeat < nowB - 1) this.nextBeat = Math.ceil(nowB / BAR) * BAR;
    const b = this.nextBeat, bar = Math.round(b / BAR), ch = this.c.chordAtBeat(b);
    if (ch.rootPc !== this.lastKey || bar % Math.max(1, c.cada) === 0) {
      const t = this.c.timeAt(b);
      this.releaseHeld(t);
      const root = this.base() + ch.rootPc;
      for (const m of (c.quinta ? [root, root + 7] : [root])) { const id = this._id(); this._on(id, m, c.vel, t); this.held.push(id); }
      this.lastKey = ch.rootPc;
    }
    this.nextBeat = b + BAR;
  }

  _melodia(nowB) {
    const c = this.cfg, step = GRID_MEL;
    if (this.nextBeat < nowB - 1) { this.nextBeat = Math.ceil(nowB / step) * step; this.busy = 0; }
    const b = this.nextBeat;
    if (this.busy > 1e-9) { this.busy -= step; this.nextBeat = b + step; return; }   // la nota (o el silencio) sigue sonando
    const h = this.c.harmony, ch = this.c.chordAtBeat(b);
    const lo = this.base(), hi = lo + 12 * Math.max(1, c.rango);
    const pool = h.notesIn(lo, hi, h.scaleSet());
    if (!pool.length) { this.nextBeat = b + step; return; }
    // duración en corcheas: 1, 2 o 4 — con más densidad, más cortas
    const w = [c.densidad + 0.05, 0.5, 1.05 - c.densidad], tot = w[0] + w[1] + w[2];
    let x = this.rng() * tot; const len = x < w[0] ? 1 : (x < w[0] + w[1] ? 2 : 4);
    if (this.rng() < c.silencio) { this.busy = (len - 1) * step; this.nextBeat = b + step; return; }   // silencio de esa duración
    // altura: arranca en una nota del acorde; en tiempo fuerte, gravedad hacia
    // la nota del acorde más cercana; si no, paso (±1, ±2), quedarse o salto
    const chordSet = new Set(ch.tones), strong = Math.abs(b % 2) < 1e-6;
    let idx = this.melIdx;
    if (idx < 0) {
      const cands = pool.map((m, i) => i).filter(i => chordSet.has(pool[i] % 12));
      idx = cands.length ? cands[Math.floor(cands.length / 2)] : Math.floor(pool.length / 2);
    } else if (strong && this.rng() < c.gravedad) {
      let best = idx, bd = 99;
      for (let i = 0; i < pool.length; i++) if (chordSet.has(pool[i] % 12)) { const d = Math.abs(i - idx); if (d < bd) { bd = d; best = i; } }
      idx = best;
    } else {
      const r = this.rng(), dir = this.rng() < 0.5 ? -1 : 1;
      const d = r < 0.15 ? 0 : r < 0.6 ? 1 : r < 0.85 ? 2 : 3 + Math.floor(this.rng() * 3);
      idx += dir * d;
      if (idx < 0) idx = -idx;                                        // rebota en los bordes del registro
      if (idx >= pool.length) idx = 2 * (pool.length - 1) - idx;
      idx = Math.max(0, Math.min(pool.length - 1, idx));
    }
    this.melIdx = idx;
    const t = this.c.timeAt(b), bar1 = Math.abs(b % BAR) < 1e-6;
    const vel = Math.min(1, c.vel * (bar1 ? 1 : 0.85) * (0.9 + 0.2 * this.rng()));
    const id = this._id();
    this._on(id, pool[idx], vel, t);
    this._off(id, t + len * step * this.c.beatLen() * c.legato);
    this.busy = (len - 1) * step;
    this.nextBeat = b + step;
  }
}
