/* SubSDJ · grafo del algoritmo FM4, a la Yamaha. El diagrama de cajas del DX7
   es el idioma común de la FM: las PORTADORAS (lo que suena) en la fila de
   abajo, sobre la línea de salida; cada MODULADOR encima del operador al que
   modula, unido por su cable; el feedback, un lazo sobre el op 4. Se lee de un
   vistazo y enseña qué es un algoritmo: solo un grafo de quién modula a quién.
   Va bajo el selector giratorio (en lugar de la leyenda «4→3→2→1»); el lazo se
   enciende cuando el Feedback del módulo FM es > 0.
   La tabla es la del worklet (FM4_ALGS en worklets/pulse-processor.js),
   COPIADA: un worklet no se puede importar desde la página. El selftest
   comprueba que las dos no se separan.
   Colocación: fila = altura sobre la salida (portadora 0; un modulador, una
   más que el más alto de sus destinos); columna = la media de las de sus
   destinos, y los que caen en el mismo sitio se abren en abanico. */
import { CONTROLS } from './registry.js';

// para cada operador (0..3), sus MODULADORES; y qué operadores son PORTADORAS
export const FM4_ALGS = [
  { mods: [[1], [2], [3], []], car: [0] },            // 0 pila 4→3→2→1 (brass; feedback en 4)
  { mods: [[1], [], [3], []], car: [0, 2] },          // 1 dos pares 2→1 · 4→3 (e-piano)
  { mods: [[1, 2, 3], [], [], []], car: [0] },        // 2 tres moduladores en paralelo → 1 (campana densa)
  { mods: [[1, 2], [], [3], []], car: [0] },          // 3 Y: 2 y 3 → 1, 4 → 3
  { mods: [[3], [3], [3], []], car: [0, 1, 2] },      // 4 un modulador para tres portadoras (órgano, coro)
  { mods: [[1], [2], [], []], car: [0, 3] },          // 5 pila de tres + portadora 4 sola (cama de seno)
  { mods: [[1], [], [], []], car: [0, 2, 3] },        // 6 par 2→1 + dos portadoras puras
  { mods: [[], [], [], []], car: [0, 1, 2, 3] },      // 7 aditivo: las cuatro suenan (feedback en 4 = sierra)
];

const W = 100, H = 80;                 // lienzo fijo: la escala no cambia entre algoritmos
const COL = 22, ROW = 18, BW = 16, BH = 12;   // paso de rejilla y caja de operador
const FB_OP = 3;                       // el Feedback realimenta el op 4

// {col, row} de cada operador (columnas desde 0)
export function layout(alg) {
  const targets = op => alg.mods.flatMap((m, t) => (m.includes(op) ? [t] : []));
  const row = [];
  const rowOf = op => (row[op] ??= alg.car.includes(op) ? 0 : 1 + Math.max(...targets(op).map(rowOf)));
  for (let op = 0; op < 4; op++) rowOf(op);
  const col = [];
  alg.car.forEach((op, i) => { col[op] = i; });
  for (let r = 1; r <= Math.max(...row); r++) {
    const ops = [0, 1, 2, 3].filter(op => row[op] === r);
    const want = new Map();            // columna deseada → operadores que la quieren
    for (const op of ops) {
      const ts = targets(op), c = ts.reduce((s, t) => s + col[t], 0) / ts.length;
      want.set(c, [...(want.get(c) || []), op]);
    }
    for (const [c, group] of want) group.forEach((op, j) => { col[op] = c + j - (group.length - 1) / 2; });
  }
  const c0 = Math.min(...col);
  return [0, 1, 2, 3].map(op => ({ col: col[op] - c0, row: row[op] }));
}

export function svgFor(algIdx, fbOn = false) {
  const alg = FM4_ALGS[algIdx] || FM4_ALGS[0], pos = layout(alg);
  const cols = Math.max(...pos.map(p => p.col)), rows = Math.max(...pos.map(p => p.row));
  const x0 = (W - (cols * COL + BW)) / 2 - 2;          // −2: sitio para el lazo a la derecha
  const y0 = 5 + ((H - 15) - (rows * ROW + BH)) / 2;   // arriba el lazo, abajo la línea de salida
  const x = op => x0 + pos[op].col * COL, y = op => y0 + (rows - pos[op].row) * ROW;
  const cx = op => x(op) + BW / 2;
  const out = [];
  // cables: de la base del modulador a la cabeza de su destino, en codo si no está debajo
  alg.mods.forEach((ms, t) => ms.forEach(m => {
    const yA = y(m) + BH, yB = y(t), mid = (yA + yB) / 2;
    out.push(`<path class="w" d="M${cx(m)} ${yA} V${mid} H${cx(t)} V${yB}"/>`);
  }));
  // salida: las portadoras bajan a una línea común
  const yL = y0 + rows * ROW + BH + 5, xs = alg.car.map(cx);
  alg.car.forEach(op => out.push(`<path class="o" d="M${cx(op)} ${y(op) + BH} V${yL}"/>`));
  const xm = (Math.min(...xs) + Math.max(...xs)) / 2;
  out.push(`<path class="o" d="M${Math.min(...xs)} ${yL} H${Math.max(...xs)} M${xm} ${yL} V${yL + 4}"/>`);
  // lazo de feedback del op 4: de su costado a su propia entrada
  const fx = x(FB_OP), fy = y(FB_OP);
  out.push(`<path class="fb${fbOn ? ' on' : ''}" d="M${fx + BW} ${fy + BH / 2} H${fx + BW + 4} V${fy - 4} H${fx + BW / 2} V${fy}"/>`);
  for (let op = 0; op < 4; op++) {
    out.push(`<g class="op${alg.car.includes(op) ? ' car' : ''}"><rect x="${x(op)}" y="${y(op)}" width="${BW}" height="${BH}" rx="2"/>` +
             `<text x="${cx(op)}" y="${y(op) + BH / 2}">${op + 1}</text></g>`);
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${out.join('')}</svg>`;
}

export function initFm4Graph() {
  const box = document.getElementById('fm4Graph'), seg = document.getElementById('fm4AlgSel');
  if (!box || !seg) return;
  let alg = +CONTROLS.fm4Alg.get() || 0, fb = +CONTROLS.fmFb.get() > 0;
  const paint = () => {
    box.innerHTML = svgFor(alg, fb);
    const b = seg.querySelector('button[data-alg="' + alg + '"]');
    box.title = b ? b.title : '';
  };
  // param-change llega venga de donde venga: clic, knob, preset, MIDI, cambio de parte
  document.addEventListener('param-change', e => {
    const { target, value } = e.detail;
    if (target === 'fm4Alg') { alg = +value || 0; paint(); }
    else if (target === 'fmFb' && (+value > 0) !== fb) { fb = +value > 0; paint(); }
  });
  paint();
}
