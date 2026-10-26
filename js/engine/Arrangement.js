/* =====================================================================
   SubSDJ · Arrangement — form at the scale of minutes (that is what ambient is:
   slow change, long tails, sparse events). All deterministic with the
   scene's seed: same seed, same session.
   · ENERGY E(bar) ∈ [0,1]: the Energy knob is the center and Sway the
     amplitude of a cosine sway over `cycle` bars (starts low,
     peaks halfway through the cycle, comes back down: crescendo and descent).
   · ENTRIES: each part has a threshold (the player's «Enters» knob): it plays
     only when E ≥ threshold — the drone at 0 always sounds, the kick at 0.7
     comes in when things liven up. No noise in the curve ⇒ no flickering.
   · SURPRISE: one-bar rests scattered at random (deterministic hash
     of seed·bar·part): the gaps a musician who listens leaves.
   · Energy also scales velocity, pulse probability and melody
     density (Player.js) and OPENS the filter of all parts
     (macro in cents on the filters' detune: Open).
   ===================================================================== */
import { mulberry32 } from './Harmony.js';

export const ARR_DEF = { energy: 0.7, sway: 0.4, cycle: 32, open: 0.5, surprise: 0.15 };
const MACRO_CENTS = 2400;   // Open 1 ⇒ ±1 octave of cutoff between energy 0 and 1
const clamp01 = x => x < 0 ? 0 : (x > 1 ? 1 : x);

export class Arrangement {
  constructor(conductor) { this.c = conductor; this.cfg = { ...ARR_DEF }; }
  // Energy at the bar (accepts a fraction of a bar: the macro moves smoothly)
  energyAt(bar) {
    const c = this.cfg, n = Math.max(1, c.cycle), ph = ((bar % n) + n) % n / n;
    return clamp01(c.energy + c.sway * 0.5 * -Math.cos(2 * Math.PI * ph));
  }
  // Surprise rest of part i at the bar: deterministic (seed, bar, part)
  rest(bar, i) {
    if (!(this.cfg.surprise > 0)) return false;
    return mulberry32((this.c.seed * 2654435761 + bar * 97 + i * 7919) | 0)() < this.cfg.surprise * 0.25;
  }
  // What player i needs to know about this bar
  stateAt(bar, i, pcfg) {
    const E = this.energyAt(bar);
    const active = E + 1e-9 >= (pcfg.threshold || 0) && !this.rest(bar, i);
    // velocity 70-100 %, pulse probability 75-100 % (a kick must not fall apart), density ±0.25
    return { E, active, velMul: 0.7 + 0.3 * E, probMul: 0.75 + 0.25 * E, dens: (E - 0.5) * 0.5 };
  }
  macroCents(bar) { return this.cfg.open * MACRO_CENTS * (this.energyAt(bar) - 0.5); }
}
