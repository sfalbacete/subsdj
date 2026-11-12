/* =====================================================================
   SubSDJ · the harmony FROM a pattern (2026-11-12) — given the loops of
   the Pattern players, guess what the Harmony module should say so that
   the generative players (Pulse, Chord, Melody, Root) play in the key of
   what you played: tonic, scale, progression and bars per chord.
   It is a guess, and it says so: it returns CANDIDATES, best first. The
   same notes are C major and A minor; what tells them apart is where the
   music rests, and that is only estimated. The UI walks the list and the
   ear chooses (ui/playerControls.js: «From pattern»).
   How:
   1. Each note weighs its length (PAT_W_MIN..PAT_W_MAX beats: a held note
      counts more, but one drone does not drown the rest), more on a beat
      and more still on a bar line. H[pc] = the weight of each of the 12
      pitch classes.
   2. TONIC evidence for each pitch class: its share of H, whether the loop
      STARTS on it (the strongest hint: a line usually begins at home) and
      its share of the bar lines.
   3. Every scale of the synth on every root gets
        fit    = weight inside the scale − OUT_COST × weight outside
        + TONIC_W × the tonic evidence of its root
        + a small prior (major and minor are the usual answer)
        − UNUSED_COST per scale note never played (five notes played and
          all in a pentatonic: the pentatonic says it more exactly).
   4. For a candidate, the PROGRESSION: for each bar, the degree whose
      triad (stacked on the scale, as Harmony.chordAt does) holds most of
      what sounds in it — its root counts ROOT_W, its other notes TRIAD_W,
      and the bar's lowest note being the root adds BASS_W (a bass line IS
      the roots). A silent bar keeps the chord before it.
   5. Bars per chord: while every chord lasts an even number of bars the
      bars are paired (1 1 4 4 → 1 4 at 2 bars each); a progression that
      is the same thing repeated is written once.
   Several loops: each one is unrolled over the longest, starting from
   ITS bar 0 as it sounds against the first one (\`origin\`, in beats).
   Pure: no DOM, no audio.
   ===================================================================== */
import { SCALES, NOTE_NAMES } from './Harmony.js';
import { patStart } from './Player.js';

const BAR = 4;
const PAT_W_MIN = 0.25, PAT_W_MAX = 2;     // beats a note weighs, whatever its length
const BEAT_W = 0.5, BARLINE_W = 0.5;       // extra weight (× the note's) for starting on a beat / on a bar line
const OUT_COST = 1.5;                      // a note outside the scale costs this much more than one inside gives
const TONIC_W = 0.5;                       // how much «the music rests here» counts against «the notes fit»
const FIRST_W = 1, BARS_W = 0.4, SHARE_W = 0.5;   // the tonic evidence: the loop starts on it · its share of the bar lines · its share of all
const UNUSED_COST = 0.02;                  // per scale note never played
const PRIOR = { 'major': 0.12, 'minor': 0.12, 'minor penta': 0.08, 'major penta': 0.08, 'dorian': 0.06, 'mixolydian': 0.06,
                'harmonic minor': 0.04, 'blues': 0.04, 'phrygian': 0.03, 'lydian': 0.03 };   // the rest: 0
const ROOT_W = 1, TRIAD_W = 0.5, BASS_W = 0.75;   // a bar's chord: its root · its other two notes · the lowest note is the root
const KEEP_W = 0.05;                       // a tie goes to the chord of the bar before (it does not change for nothing)
const ON_GRID = 0.13;                      // beats: this close to a beat or a bar line is on it (played, not drawn)
const MAX_PROG = 16;                       // chords in a progression (Harmony.parseProg's limit)
const pcOf = m => ((Math.round(m) % 12) + 12) % 12;
const near = (x, step) => Math.abs(x / step - Math.round(x / step)) * step < ON_GRID;

// The notes of every loop over the LONGEST one: [{ s (beat from bar 0), len, m, w }]
function unroll(pats) {
  const bars = Math.max(...pats.map(p => p.bars)), L = bars * BAR, ref = pats[0].origin || 0, out = [];
  for (const p of pats) {
    const Lp = p.bars * BAR, shift = ((((p.origin || 0) - ref) % Lp) + Lp) % Lp;   // where this loop's bar 0 falls in the first one's time
    for (const n of p.notes) {
      if (n.b >= Lp - 1e-9) continue;
      const s0 = patStart(n, p.quant || 0, Lp);
      for (let lap = 0; lap * Lp < L + Lp; lap++) {
        const s = s0 + shift + (lap - 1) * Lp;
        if (s < -1e-9 || s >= L - 1e-9) continue;
        const w = Math.max(PAT_W_MIN, Math.min(PAT_W_MAX, n.len)) * (1 + (near(s, 1) ? BEAT_W : 0) + (near(s, BAR) ? BARLINE_W : 0));
        out.push({ s: Math.max(0, s), len: Math.min(n.len, Lp), m: Math.round(n.m), w });
      }
    }
  }
  return { notes: out, bars };
}
const triad = (root, scale, deg) => { const n = SCALES[scale], len = n.length; return [0, 1, 2].map(j => (root + n[(deg - 1 + 2 * j) % len]) % 12); };

// The degree of each bar for a key, then written as { prog, bars }
function progression(notes, nBars, root, scale) {
  const degs = [], nDeg = SCALES[scale].length;
  for (let bar = 0; bar < nBars; bar++) {
    const b0 = bar * BAR, b1 = b0 + BAR, W = new Array(12).fill(0);
    let low = null, any = false;
    for (const n of notes) {
      const over = Math.min(b1, n.s + n.len) - Math.max(b0, n.s);        // how much of the note sounds in this bar
      if (over <= 1e-9) continue;
      const starts = n.s >= b0 - 1e-9 && n.s < b1;
      const w = Math.max(PAT_W_MIN, Math.min(PAT_W_MAX, over)) * (starts && near(n.s - b0, BAR) && n.s - b0 < 1 ? 2 : 1);   // on the bar's 1: double
      W[pcOf(n.m)] += w; any = true;
      if (!low || n.m < low.m) low = { m: n.m, w };
    }
    const prev = degs.length ? degs[degs.length - 1] : 1;
    if (!any) { degs.push(prev); continue; }
    let best = prev, bs = -1;
    for (let d = 1; d <= nDeg; d++) {
      const t = triad(root, scale, d);
      const sc = ROOT_W * W[t[0]] + TRIAD_W * (W[t[1]] + W[t[2]]) + (pcOf(low.m) === t[0] ? BASS_W * low.w : 0) + (d === prev && degs.length ? KEEP_W : 0);
      if (sc > bs + 1e-9) { bs = sc; best = d; }
    }
    degs.push(best);
  }
  let prog = degs, bars = 1;
  while (prog.length % 2 === 0 && prog.every((d, i) => d === prog[i - (i % 2)])) { prog = prog.filter((_, i) => i % 2 === 0); bars *= 2; }   // every chord lasts two: pair them
  for (let p = 1; p <= prog.length / 2; p++)                                    // the same thing repeated: once
    if (prog.length % p === 0 && prog.every((d, i) => d === prog[i % p])) { prog = prog.slice(0, p); break; }
  if (prog.length === 1) bars = 1;                                              // one chord: how long it lasts says nothing
  return { prog: prog.slice(0, MAX_PROG), bars: Math.min(8, bars) };
}

// pats: [{ bars, notes: [{b, len, m, v}], quant, origin (beats) }] — the first one is the reference for bar 0.
// Returns up to `max` candidates, best first: { root, scale, prog, bars, score, fit (0..1: weight inside the scale), label }
export function inferHarmony(pats, { max = 6 } = {}) {
  pats = (pats || []).filter(p => p && p.bars > 0 && Array.isArray(p.notes) && p.notes.some(n => n.b < p.bars * BAR - 1e-9));
  if (!pats.length) return [];
  const { notes, bars } = unroll(pats);
  if (!notes.length) return [];
  const H = new Array(12).fill(0), B = new Array(12).fill(0), F = new Array(12).fill(0);
  let T = 0, TB = 0;
  for (const n of notes) { const pc = pcOf(n.m); H[pc] += n.w; T += n.w; if (near(n.s, BAR)) { B[pc] += n.w; TB += n.w; } }
  const s0 = Math.min(...notes.map(n => n.s)), firsts = notes.filter(n => n.s < s0 + 0.26);
  F[pcOf(firsts.reduce((a, n) => (n.m < a.m ? n : a)).m)] = 1;                  // the loop starts here (a chord: its lowest note)
  const tonic = pc => SHARE_W * H[pc] / T + FIRST_W * F[pc] + BARS_W * (TB ? B[pc] / TB : 0);
  const cands = [];
  for (const scale in SCALES) for (let root = 0; root < 12; root++) {
    const set = new Set(SCALES[scale].map(x => (root + x) % 12));
    let inside = 0, unused = 0;
    for (let pc = 0; pc < 12; pc++) if (set.has(pc)) { inside += H[pc]; if (!H[pc]) unused++; }
    const fit = inside / T;
    cands.push({ root, scale, fit, score: fit - OUT_COST * (1 - fit) + TONIC_W * tonic(root) + (PRIOR[scale] || 0) - UNUSED_COST * unused });
  }
  cands.sort((a, b) => b.score - a.score);
  return cands.slice(0, max).map(c => {
    const p = progression(notes, bars, c.root, c.scale);
    return { ...c, ...p, label: NOTE_NAMES[c.root] + ' ' + c.scale + ' · ' + p.prog.join(' ') + (p.bars > 1 ? ' · ' + p.bars + ' bars each' : '') };
  });
}
