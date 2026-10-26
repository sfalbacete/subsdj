/* =====================================================================
   SubSDJ · Armonía — la tonalidad de la escena: raíz + escala + progresión.
   Todo lo que emiten los jugadores pasa por aquí: por eso lo aleatorio
   suena musical — el conjunto de alturas está ACOTADO (escala) y las notas
   «de reposo» de cada compás también (acorde vigente); densidad, registro y
   ritmo hacen el resto.
   Acordes por terceras SOBRE LA ESCALA: grado, +2, +4, +6 pasos de escala.
   En una escala de 7 notas salen las tríadas/séptimas diatónicas (I = do-mi-
   sol, ii = re-fa-la…); en una pentatónica los «saltos de dos» siguen dentro
   de la escala: nunca sale una nota ajena.
   Progresión: lista de grados con N compases por acorde («1 6 4 5»), o un
   PASEO de funciones tonales (T reposo · S tensión suave · D tensión que
   resuelve) con las probabilidades del uso común: de T se va a S o D, de S
   casi siempre a D, D resuelve a T. Determinista: PRNG con semilla
   (mulberry32) — misma semilla, misma sesión (base de las escenas de C3).
   ===================================================================== */
export const ESCALAS = {
  'major':          [0, 2, 4, 5, 7, 9, 11],
  'minor':          [0, 2, 3, 5, 7, 8, 10],
  'harmonic minor': [0, 2, 3, 5, 7, 8, 11],
  'dorian':         [0, 2, 3, 5, 7, 9, 10],
  'phrygian':       [0, 1, 3, 5, 7, 8, 10],
  'lydian':         [0, 2, 4, 6, 7, 9, 11],
  'mixolydian':     [0, 2, 4, 5, 7, 9, 10],
  'major penta':    [0, 2, 4, 7, 9],
  'minor penta':    [0, 3, 5, 7, 10],
  'blues':          [0, 3, 5, 6, 7, 10],
  'whole tone':     [0, 2, 4, 6, 8, 10],
  'hirajoshi':      [0, 2, 3, 7, 8],
  'in sen':         [0, 1, 5, 7, 10],
};
export const NOTAS = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
export const GRADOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

// PRNG con semilla (mulberry32, 32 bits): misma semilla ⇒ misma secuencia.
// Cada jugador y la armonía llevan su PROPIO flujo: cambiar un jugador no
// altera lo que hacen los demás.
export function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Funciones tonales de cada grado y transiciones (probabilidades) del paseo
const FUNCION = { 1: 'T', 2: 'S', 3: 'T', 4: 'S', 5: 'D', 6: 'T', 7: 'D' };
const SIGUIENTE = { T: [['S', 0.45], ['D', 0.35], ['T', 0.20]],
                    S: [['D', 0.60], ['T', 0.30], ['S', 0.10]],
                    D: [['T', 0.80], ['S', 0.05], ['D', 0.15]] };
const GRADOS_DE = { T: [1, 1, 6, 3], S: [4, 4, 2], D: [5, 5, 7] };   // repetidos = más probables

// «1 6 4 5», «I vi IV V»… → [1, 6, 4, 5] (1..7; lo que no se entiende se salta)
export function parseProg(str) {
  const rom = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };
  const out = String(str || '').trim().split(/[\s,·|-]+/).filter(Boolean).map(tok => {
    const t = tok.toLowerCase().replace(/[^a-z0-9]/g, '');
    const n = /^\d+$/.test(t) ? +t : rom[t];
    return n >= 1 && n <= 7 ? n : null;
  }).filter(Boolean);
  return out.length ? out.slice(0, 16) : [1];
}

export class Harmony {
  constructor({ root = 0, scale = 'minor', prog = [1, 6, 4, 5], bars = 2, mode = 'list', seed = 1 } = {}) {
    this.root = root; this.scale = scale; this.prog = prog; this.bars = bars; this.mode = mode;
    this.setSeed(seed);
  }
  setSeed(seed) { this.seed = seed; this._walk = []; this._rng = mulberry32((seed * 7919 + 17) | 0); }
  get notes() { return ESCALAS[this.scale] || ESCALAS.major; }

  // Grado vigente en el compás `bar` (cada acorde dura `bars` compases)
  degreeAt(bar) {
    const i = Math.max(0, Math.floor(bar / Math.max(1, this.bars)));
    if (this.mode === 'functions') return this._walkDegree(i);
    const p = this.prog && this.prog.length ? this.prog : [1];
    return p[i % p.length];
  }
  // Paseo de funciones: se genera bajo demanda y se guarda (determinista con la semilla)
  _walkDegree(i) {
    while (this._walk.length <= i) {
      const prev = this._walk.length ? this._walk[this._walk.length - 1] : 1;
      const from = FUNCION[prev] || 'T';
      let r = this._rng(), fn = 'T';
      for (const [f, p] of SIGUIENTE[from]) { if (r < p) { fn = f; break; } r -= p; }
      const cands = GRADOS_DE[fn];
      this._walk.push(cands[Math.floor(this._rng() * cands.length)]);
    }
    return this._walk[i];
  }
  // Acorde del compás: {degree, rootPc, tones:[4 clases de altura 0..11]}
  chordAt(bar) {
    const deg = this.degreeAt(bar), n = this.notes, len = n.length;
    const tones = [0, 1, 2, 3].map(j => (this.root + n[(deg - 1 + 2 * j) % len]) % 12);
    return { degree: deg, rootPc: tones[0], tones, bar };
  }
  scaleSet() { return new Set(this.notes.map(n => (this.root + n) % 12)); }
  // Nota MIDI → la más cercana de la escala (empate: hacia abajo)
  quantize(midi, pcs = this.scaleSet()) {
    for (let d = 0; d <= 6; d++) {
      if (pcs.has((((midi - d) % 12) + 12) % 12)) return midi - d;
      if (pcs.has((midi + d) % 12)) return midi + d;
    }
    return midi;
  }
  // Notas MIDI en [lo, hi] cuya clase de altura está en `pcs`
  notesIn(lo, hi, pcs) { const out = []; for (let m = lo; m <= hi; m++) if (pcs.has(m % 12)) out.push(m); return out; }
  nombre(bar) { const c = this.chordAt(bar); return (GRADOS[c.degree - 1] || c.degree) + ' · ' + NOTAS[c.rootPc]; }
}
