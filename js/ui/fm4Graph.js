/* SubSDJ · FM4 algorithm graph, Yamaha style. The DX7 box diagram
   is the common language of FM: the CARRIERS (what sounds) in the bottom
   row, above the output line; each MODULATOR above the operator it
   modulates, joined by its wire; the feedback, a loop over op 4. It reads at a
   glance and shows what an algorithm is: just a graph of who modulates whom.
   It sits under the rotary selector (instead of the «4→3→2→1» caption); the loop
   lights up when the FM module's Feedback is > 0.
   The table is the worklet's (FM4_ALGS in worklets/pulse-processor.js),
   COPIED: a worklet cannot be imported from the page. The selftest
   checks that the two don't drift apart.
   Placement: row = height above the output (carrier 0; a modulator, one
   more than the highest of its targets); column = the mean of its
   targets' columns, and those landing on the same spot fan out. */
import { CONTROLS } from './registry.js';

// for each operator (0..3), its MODULATORS; and which operators are CARRIERS
export const FM4_ALGS = [
  { mods: [[1], [2], [3], []], car: [0] },            // 0 stack 4→3→2→1 (brass; feedback on 4)
  { mods: [[1], [], [3], []], car: [0, 2] },          // 1 two pairs 2→1 · 4→3 (e-piano)
  { mods: [[1, 2, 3], [], [], []], car: [0] },        // 2 three parallel modulators → 1 (dense bell)
  { mods: [[1, 2], [], [3], []], car: [0] },          // 3 Y: 2 and 3 → 1, 4 → 3
  { mods: [[3], [3], [3], []], car: [0, 1, 2] },      // 4 one modulator for three carriers (organ, choir)
  { mods: [[1], [2], [], []], car: [0, 3] },          // 5 stack of three + carrier 4 alone (sine bed)
  { mods: [[1], [], [], []], car: [0, 2, 3] },        // 6 pair 2→1 + two pure carriers
  { mods: [[], [], [], []], car: [0, 1, 2, 3] },      // 7 additive: all four sound (feedback on 4 = saw)
];

const W = 100, H = 80;                 // fixed canvas: the scale doesn't change between algorithms
const COL = 22, ROW = 18, BW = 16, BH = 12;   // grid pitch and operator box
const FB_OP = 3;                       // the Feedback feeds back op 4

// {col, row} of each operator (columns from 0)
export function layout(alg) {
  const targets = op => alg.mods.flatMap((m, t) => (m.includes(op) ? [t] : []));
  const row = [];
  const rowOf = op => (row[op] ??= alg.car.includes(op) ? 0 : 1 + Math.max(...targets(op).map(rowOf)));
  for (let op = 0; op < 4; op++) rowOf(op);
  const col = [];
  alg.car.forEach((op, i) => { col[op] = i; });
  for (let r = 1; r <= Math.max(...row); r++) {
    const ops = [0, 1, 2, 3].filter(op => row[op] === r);
    const want = new Map();            // desired column → operators that want it
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
  const x0 = (W - (cols * COL + BW)) / 2 - 2;          // −2: room for the loop on the right
  const y0 = 5 + ((H - 15) - (rows * ROW + BH)) / 2;   // the loop on top, the output line at the bottom
  const x = op => x0 + pos[op].col * COL, y = op => y0 + (rows - pos[op].row) * ROW;
  const cx = op => x(op) + BW / 2;
  const out = [];
  // wires: from the modulator's base to the head of its target, elbowed if it isn't right below
  alg.mods.forEach((ms, t) => ms.forEach(m => {
    const yA = y(m) + BH, yB = y(t), mid = (yA + yB) / 2;
    out.push(`<path class="w" d="M${cx(m)} ${yA} V${mid} H${cx(t)} V${yB}"/>`);
  }));
  // output: the carriers drop down to a common line
  const yL = y0 + rows * ROW + BH + 5, xs = alg.car.map(cx);
  alg.car.forEach(op => out.push(`<path class="o" d="M${cx(op)} ${y(op) + BH} V${yL}"/>`));
  const xm = (Math.min(...xs) + Math.max(...xs)) / 2;
  out.push(`<path class="o" d="M${Math.min(...xs)} ${yL} H${Math.max(...xs)} M${xm} ${yL} V${yL + 4}"/>`);
  // op 4 feedback loop: from its side to its own input
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
  // param-change arrives wherever it comes from: click, knob, preset, MIDI, part change
  document.addEventListener('param-change', e => {
    const { target, value } = e.detail;
    if (target === 'fm4Alg') { alg = +value || 0; paint(); }
    else if (target === 'fmFb' && (+value > 0) !== fb) { fb = +value > 0; paint(); }
  });
  paint();
}
