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
   ARTICULACIONES (Roadmap 7.0 · 5.1), sufijos del paso en el patrón:
     !   acento: suena más fuerte que los pasos sin acento (si el patrón tiene
         alguno, los demás bajan a SEQ_UNACCENT) y enciende la fuente de la
         matriz «Acento» de esa nota — el preset decide qué hace un acento
     ~   ligadura: la nota NO se corta; el paso siguiente la continúa sin ataque
         nuevo (si tiene otra altura, salta a ella)
     /   slide: como la ligadura, pero la altura RESBALA hasta la del paso
         siguiente (el Glide del preset, o SEQ_SLIDE si está a 0): el 303
     x2…x4  repeticiones: el paso se dispara 2-4 veces dentro de su tiempo
   Se combinan: «7!/», «0x3», «3!~».
   NOTAS POR GRADO (Roadmap 7.0 · 5.2): con seqNotes = una escala, el número
   del paso es un GRADO contado desde la tecla mantenida (pasar del último sube
   de octava); con 'armonía', los grados de la escala de la ESCENA (Partes) a
   partir de la tecla — la raíz del acorde si la pone el jugador —: la frase se
   mueve dentro de la tonalidad. 'semitonos' = como siempre.
   ===================================================================== */
import { clockOf, DIV_BEATS } from './Clock.js';
import { ESCALAS } from './Harmony.js';
export const SEQ_MAX_STEPS = 16, SEQ_OFF_MIN = -12, SEQ_OFF_MAX = 24;
const SEQ_UNACCENT = 0.6;   // con acentos en el patrón, los pasos sin acento suenan a este factor de la velocity
const SEQ_SLIDE = 0.06;     // s: el slide con el Glide a 0 (el tiempo fijo del 303)
const SEQ_RATCHET_GATE = 0.8;   // fracción de cada golpe de una repetición (deja hueco para el siguiente ataque)

// Token: entero con sufijos opcionales en cualquier orden — '!' acento, '~'
// ligadura, '/' slide (ligadura y slide se excluyen: gana el último), 'x2'…'x4'
// repeticiones. '.' o cualquier token inválido = silencio (null). Offsets clampeados.
export function parsePattern(str) {
  return String(str || '').trim().split(/\s+/).filter(Boolean)
    .slice(0, SEQ_MAX_STEPS)
    .map(tok => {
      const m = /^(-?\d+)((?:!|~|\/|x[1-4])*)$/.exec(tok);
      if (!m) return null;
      const off = Math.max(SEQ_OFF_MIN, Math.min(SEQ_OFF_MAX, +m[1]));
      const st = { off, accent: false, tie: false, slide: false, rep: 1 };
      for (const f of m[2].match(/!|~|\/|x[1-4]/g) || []) {
        if (f === '!') st.accent = true;
        else if (f === '~') { st.tie = true; st.slide = false; }
        else if (f === '/') { st.slide = true; st.tie = false; }
        else st.rep = +f[1];
      }
      return st;
    });
}
// El token de un paso (para el editor): altura + sufijos en orden canónico
export const stepToken = st => !st ? '.'
  : String(st.off) + (st.accent ? '!' : '') + (st.slide ? '/' : st.tie ? '~' : '') + (st.rep > 1 ? 'x' + st.rep : '');

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
    this.link = null;        // {id, mode: 'tie'|'slide'}: la nota que el paso anterior dejó ligada al siguiente
    this.nid = 0;            // contador de ids de nota (las repeticiones gastan varios por paso)
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
  _maybeStop() { if (this.timer && !this.held.length && !this.latched) { clearInterval(this.timer); this.timer = null; this.playQ = []; this._flushTie(); this._unlink(this.e.ctx.currentTime); clockOf(this.e.ctx).leave(this); } }
  // la nota que quedaba ligada al paso siguiente termina en t
  _unlink(t) { const l = this.link; if (l) { this.link = null; this.e._directOff(l.id, t); } }
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

  // Escala de los grados (intervalos desde su tónica) e índice de la tecla en ella; null = semitonos
  _scale(rootFreq) {
    const mode = this.e.S.seqNotes;
    if (!mode || mode === 'semitonos') return null;
    if (mode !== 'armonía') return { I: ESCALAS[mode] || ESCALAS.mayor, i0: 0 };
    const h = this.e.harmony ? this.e.harmony() : null;
    if (!h) return { I: ESCALAS.mayor, i0: 0 };      // sin escena no hay armonía: mayor desde la tecla
    const I = h.notes, pc = ((Math.round(69 + 12 * Math.log2(rootFreq / 440)) - h.root) % 12 + 12) % 12;
    let i0 = 0; for (let i = 0; i < I.length; i++) if (I[i] <= pc) i0 = i;   // la tecla (o el grado de debajo, si no es de la escala)
    return { I, i0 };
  }
  // Semitonos sobre la tecla del paso «off» (con grados: su grado; el grado 0 es la tecla)
  semis(off, rootFreq) {
    const sc = this._scale(rootFreq); if (!sc) return off;
    const { I, i0 } = sc, len = I.length, j = i0 + off, oct = Math.floor(j / len), idx = j - oct * len;
    return 12 * oct + I[idx] - I[i0];
  }
  // Pasos de una octava en el editor: 12 semitonos o los grados de la escala
  octaveSteps() { const sc = this._scale(261.63); return sc ? sc.I.length : 12; }

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
      const dur = clock.stepSecs(this, div);           // con swing, el par se reparte desigual
      const st = steps[this.idx % steps.length];       // módulo en cada paso: patrón editable en vivo
      this.playQ.push({ i: this.idx % steps.length, t0: this.nextT, t1: this.nextT + dur });
      if (this.playQ.length > 64) this.playQ.shift();  // tope por si la UI no consume (panel colapsado)
      if (st) {                                        // null = silencio: el tiempo avanza igual
        const gate = Math.max(0.05, Math.min(1, S.seqGate)), f = stepFreq(root.freq, this.semis(st.off, root.freq)), t = this.nextT;
        const linkNext = st.slide ? 'slide' : st.tie ? 'tie' : null;
        if (this.link) {                               // el paso anterior pidió ligadura o slide: este CONTINÚA su nota
          const { id, mode } = this.link; this.link = null;
          this.e._directGlide(id, f, t, mode === 'slide' ? (S.glide > 0 ? S.glide : SEQ_SLIDE) : 0);
          if (linkNext) this.link = { id, mode: linkNext };
          else this._off(id, t + dur * gate, gate >= 1);
        } else {
          // acento: con acentos en el patrón, los demás pasos bajan; la fuente «Acento» de la matriz, en la nota
          const vel = st.accent || !steps.some(s => s && s.accent) ? root.vel : root.vel * SEQ_UNACCENT;
          const n = st.rep, sub = dur / n;
          for (let k = 0; k < n; k++) {                // repeticiones: n golpes dentro del paso
            const id = 'seq' + (this.nid++ % 16), tk = t + k * sub, last = k === n - 1;   // ids rotatorios, disjuntos de 'arp'+n
            this.e._directOn(id, f, vel, tk, st.accent ? 1 : 0);
            if (k === 0) this._flushTie();             // la ligada (gate 1) del paso anterior se suelta tras este on
            if (last && linkNext) this.link = { id, mode: linkNext };
            else if (n > 1) this.e._directOff(id, tk + sub * Math.min(gate, SEQ_RATCHET_GATE));
            else this._off(id, tk + sub * gate, gate >= 1);
          }
        }
      } else { this._flushTie(); this._unlink(this.nextT); }   // silencio: la ligada termina aquí
      this.idx++;
      clock.advance(this, div);
    }
  }
}
