/* =====================================================================
   SubSDJ · the synthesizer's runtime state (engine space).
   It is DERIVED from the single PARAMS table (params.js): there are no
   defaults of its own here, so engine and UI cannot diverge.
   ===================================================================== */
import { PARAMS, PRESET_BASE } from './params.js';
import { migratePreset } from './legacy.js';

// Mixer (1.2.0): the voice used to sum (1−ring)·[(1−mix)·A + mix·B] + ring·A×B;
// now levelA·A + levelB·B + ring·A×B. A preset WITHOUT levelA/levelB predates it
// (or inherits the base's levels): with Mix or with Ring it is translated EXACTLY
// — same coefficients, same sound —; with neither, the base already
// carries the levels of the Mix 0.4 of back then. Libraries store COPIES of
// the presets, so this translation is forever, not a one-off.
const LEGACY_MIX = 0.4;                                     // the old base's Mix
const r6 = x => Math.round(x * 1e6) / 1e6;                  // 0.7·0.5 → 0.35, not 0.35000000000000003
export function migrateMix(p) {
  if (!p || 'levelA' in p || 'levelB' in p || !('mix' in p || p.ring > 0)) return p;
  const { mix = LEGACY_MIX, ...q } = p, ring = p.ring || 0;
  q.levelA = r6((1 - ring) * (1 - mix));
  q.levelB = r6((1 - ring) * mix);
  return q;
}

// Delay (Roadmap 7.0 · 4.1): the feedback was 0.85·Amount (capped at 0.8) and now has its own
// knob (dlyFb). A preset WITHOUT dlyFb predates it: it gets it computed this way — the same echo, exactly.
export function migrateFb(p) {
  if (!p || 'dlyFb' in p) return p;
  return { ...p, dlyFb: r6(Math.min(0.8, ('dlyAmt' in p ? p.dlyAmt : PARAMS.dlyAmt.def) * 0.85)) };
}

// A preset is a DIFFERENCE over PRESET_BASE (params.js), not over the
// neutral defaults: that way the old ones sound the same. {} = Reset (no base).
// What was saved up to 1.3.0 arrives in Spanish: legacy.migratePreset turns it into English.
export const withPresetBase = p => (p && Object.keys(p).length ? { ...PRESET_BASE, ...migrateFb(migrateMix(migratePreset(p))) } : {});

export function makeDefaultState() {
  const S = { oscA: {}, oscB: {} };
  for (const name in PARAMS) {
    const p = PARAMS[name], t = p.t || name;
    if (t.includes('.')) { const [o, k] = t.split('.'); S[o][k] = p.def; }
    else S[t] = p.def;
  }
  return S;
}

// Preset (PARAMS keys, engine space) -> state S, WITHOUT going through the UI
// (parts are born with their preset). Unknown keys are ignored, as
// in loadState. Goes on top of the preset base. Returns the same S.
export function applyPreset(S, preset) {
  preset = withPresetBase(preset);
  for (const name in preset) {
    const p = PARAMS[name]; if (!p) continue;
    const t = p.t || name;
    if (t.includes('.')) { const [o, k] = t.split('.'); S[o][k] = preset[name]; }
    else S[t] = preset[name];
  }
  return S;
}
// State S -> object with the PARAMS keys (what the controls show):
// the inverse of applyPreset; when switching parts, the rack loads it into its controls (syncControls).
export function toControls(S) {
  const o = {};
  for (const name in PARAMS) {
    const t = PARAMS[name].t || name;
    if (t.includes('.')) { const [a, k] = t.split('.'); o[name] = S[a][k]; }
    else o[name] = S[t];
  }
  return o;
}
