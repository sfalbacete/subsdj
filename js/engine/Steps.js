/* =====================================================================
   SubSDJ · Pasos (Roadmap 7.0 · 2.3) — el timbre moviéndose por PASOS.
   Cuatro carriles; cada uno, una fila de valores −1..+1 (st{i}Pat, «0.5 -1 0
   …», hasta 32) con su división, suavizado, rotación y deriva de la rotación.
   Carriles de longitudes distintas solo vuelven a coincidir tras muchos pasos
   (16 · 12 · 5 → 240 semicorcheas = 15 compases): complejo sin dejar de ser
   rítmico. Cada carril es una FUENTE de la matriz en dos sabores:
     «Pasos i»        señal continua: el escalón mueve también una nota
                      sostenida (una ConstantSource por carril y motor,
                      programada en el look-ahead del reloj común);
     «Pasos i · nota» el valor del paso en que EMPIEZA cada nota, fijo toda la
                      nota: correcto en polifonía, sin escalones dentro de la
                      nota (arpegios, plucks).
   El paso de un carril en t sale del RELOJ COMÚN (engine/Clock.js): k =
   stepAt(t, división), así que se calcula sin planificar nada — exacto
   también offline — y cae en la rejilla del Arp, el Seq y el director.
   Índice en el patrón = (k + rotación + deriva) mod longitud, con deriva = un
   paso más cada N compases (el desfase de Reich).
   Reinicio (stReset): 'play' = los Pasos se unen al reloj con la primera
   nota tras el silencio (si nadie más va a tempo, esa nota es el paso 0) y lo
   sueltan al callar todo · 'never' = siguen el origen del reloj aunque pares
   · '1 bar' … '8 bars' = vuelven al paso 0 cada N compases.
   ===================================================================== */
import { clockOf } from './Clock.js';

export const ST_LANES = 4, ST_MAX = 32;
export const ST_DIVS = { '1/32': 0.125, '1/16T': 1 / 6, '1/16': 0.25, '1/8T': 1 / 3, '1/8': 0.5, '1/4T': 2 / 3, '1/4': 1, '1/2': 2, '1 bar': 4 };
export const ST_DRIFTS = { 'off': 0, '1 bar': 1, '2 bars': 2, '4 bars': 4, '8 bars': 8, '16 bars': 16 };
export const ST_RESETS = { 'play': -1, 'never': 0, '1 bar': 1, '2 bars': 2, '4 bars': 4, '8 bars': 8 };
const BAR = 4, LOOKAHEAD = 0.12, TICK_MS = 25, MICRO = 0.004;   // MICRO: la rampa más corta (un escalón sin clic)

// '0.5 -1 0 …' → valores en [−1, 1] (un token raro vale 0), como mucho ST_MAX
export function parseSteps(str) {
  return String(str || '').trim().split(/\s+/).filter(Boolean).slice(0, ST_MAX)
    .map(t => { const v = +t; return Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0; });
}
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
const lcm = (a, b) => a / gcd(a, b) * b;
// Compases que tarda en repetirse TODO lo que suena (carriles en uso): en
// ticks de 1/96 de pulso (enteros para todas las divisiones y tresillos).
export function cycleBars(S, lanes) {
  let L = 0;
  for (const i of lanes) {
    const len = parseSteps(S['st' + i + 'Pat']).length, div = ST_DIVS[S['st' + i + 'Div']] || 0.25, n = ST_DRIFTS[S['st' + i + 'Drift']] || 0;
    if (!len) continue;
    let ticks = Math.round(len * div * 96);
    if (n) ticks = lcm(ticks, len * n * BAR * 96);       // la rotación da la vuelta tras len · N compases
    L = L ? lcm(L, ticks) : ticks;
  }
  const R = ST_RESETS[S.stReset];
  if (R > 0 && L) L = Math.min(L, R * BAR * 96);       // el reinicio cada N compases corta el ciclo
  return L / (96 * BAR);
}

export class Steps {
  constructor(engine) {
    this.e = engine;
    this.src = [];             // i → ConstantSource del sabor continuo (nace al primer uso)
    this.lane = [];            // i → {nextB, nextT, epoch, prev}: el planificador del continuo
    this.timer = null;
    this._cache = {};          // i → {str, vals}
  }
  get clock() { return clockOf(this.e.ctx); }
  _vals(i) {
    const s = this.e.S['st' + i + 'Pat'], c = this._cache[i];
    if (c && c.str === s) return c.vals;
    const vals = parseSteps(s); this._cache[i] = { str: s, vals };
    return vals;
  }
  _div(i) { return ST_DIVS[this.e.S['st' + i + 'Div']] || 0.25; }
  // ¿Usa la matriz algún carril? (continuo, por nota o ambos)
  usedLanes() {
    const S = this.e.S, out = new Set();
    for (let j = 1; j <= 6; j++) { const m = /^st(\d)n?$/.exec(S['mx' + j + 'src']); if (m && S['mx' + j + 'amt']) out.add(+m[1]); }
    return out;
  }
  // Valor del carril i en el paso que contiene t (sin suavizado)
  valueAt(i, t) {
    const vals = this._vals(i), len = vals.length;
    if (!len) return 0;
    const S = this.e.S, clock = this.clock, div = this._div(i);
    let k = clock.stepAt(t, div);
    const R = ST_RESETS[S.stReset];
    if (R > 0) { const per = Math.round(R * BAR / div); k = ((k % per) + per) % per; }
    const n = ST_DRIFTS[S['st' + i + 'Drift']] || 0;
    const shift = n ? Math.floor(clock.beatAt(t + 1e-6) / (n * BAR)) : 0;
    const idx = (((k + Math.round(S['st' + i + 'Rot'] || 0) + shift) % len) + len) % len;
    return vals[idx];
  }
  playingStep(i) {             // para el marcador del panel: índice en el patrón que suena ahora
    if (!this.e.ctx || !this.clock.users.has(this)) return -1;
    const vals = this._vals(i), len = vals.length; if (!len) return -1;
    const S = this.e.S, t = this.e.ctx.currentTime, clock = this.clock, div = this._div(i);
    let k = clock.stepAt(t, div);
    const R = ST_RESETS[S.stReset];
    if (R > 0) { const per = Math.round(R * BAR / div); k = ((k % per) + per) % per; }
    const n = ST_DRIFTS[S['st' + i + 'Drift']] || 0, shift = n ? Math.floor(clock.beatAt(t) / (n * BAR)) : 0;
    return (((k + Math.round(S['st' + i + 'Rot'] || 0) + shift) % len) + len) % len;
  }

  // Una nota empieza en t (la llama el motor ANTES de crear la voz). idle = no
  // sonaba nada: con reinicio 'play' es «empezar a tocar» y el reloj se suelta
  // y se retoma en t (si nadie más va a tempo, t es el paso 0).
  noteOn(t, idle) {
    if (!this.usedLanes().size) return;
    const clock = this.clock;
    if (idle && this.e.S.stReset === 'play' && clock.users.has(this)) clock.leave(this);
    if (!clock.users.has(this)) clock.join(this, t, 0.25, this.e.bpm);
    if (this.src.some(Boolean)) this._run(t);
  }
  // Todo callado (sin voces ni colas): con 'play', fuera del reloj
  idle() {
    if (this.e.S.stReset === 'play') this.clock.leave(this);
    this._stop();
  }

  // Sabor continuo: la fuente del carril i (la pide la matriz de una voz)
  source(i, t) {
    if (!this.src[i]) {
      const ctx = this.e.ctx, c = ctx.createConstantSource();
      c.offset.value = this.clock.users.has(this) ? this.valueAt(i, ctx.currentTime) : 0; c.start();
      this.src[i] = c;
    }
    this._run(t);
    return this.src[i];
  }
  _run(t) {
    const ctx = this.e.ctx, clock = this.clock;
    if (!clock.users.has(this)) clock.join(this, t, 0.25, this.e.bpm);
    for (let i = 1; i <= ST_LANES; i++) {
      if (!this.src[i] || this.lane[i]) continue;
      const div = this._div(i), u = { prev: this.src[i].offset.value };
      u.nextB = clock.nextGridB(Math.max(t, ctx.currentTime), div); u.nextT = clock.swungTime(u.nextB, div); u.epoch = clock.epoch;
      this.lane[i] = u;
    }
    if (this.e.offline) { this._tick(ctx.length / ctx.sampleRate); return; }   // offline: todo de golpe, hasta el final del render
    this._tick();
    if (!this.timer) this.timer = setInterval(() => this._tick(), TICK_MS);
  }
  _stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } this.lane = []; }
  _tick(until = null) {
    const ctx = this.e.ctx, clock = this.clock, end = until !== null ? until : ctx.currentTime + LOOKAHEAD;
    for (let i = 1; i <= ST_LANES; i++) {
      const u = this.lane[i], src = this.src[i];
      if (!u || !src) continue;
      const div = this._div(i), sm = Math.max(0, Math.min(1, this.e.S['st' + i + 'Smooth'] || 0));
      if (until === null) clock.sync(u, div, this.e.bpm);
      const p = src.offset;
      while (u.nextT < end) {
        const v = this.valueAt(i, u.nextT + 1e-6), dur = clock.stepSecs(u, div);   // con swing, el paso real
        const r = MICRO + sm * Math.max(0, dur - MICRO);
        p.setValueAtTime(u.prev, u.nextT); p.linearRampToValueAtTime(v, u.nextT + r);
        u.prev = v;
        clock.advance(u, div);
      }
    }
  }
}
