# SubSDJ · Plan

Date: 2026-10-25 · **1.3.0 published**: from Roadmap 7.0, 1.3 meter, 2.5 macros, 2.6 touch,
3.2 sync, 3.3 string, 4.1 runaway delay, 5.1 articulations, 5.4 swing and breathing pulse,
5.2 notes by degree; preset picker; and the first polishing pass (216/216). Whatever is done from
now on goes into the CHANGELOG under «Unreleased» until the next one.
(Before: 1.2.0 on 2026-10-24, with blocks 0.1-0.4, 1.1, 1.2, 2.1-2.4, 3.1 and 7.1.)

**Direction agreed on 2026-10-25 (Sergio):** the synth already has a lot of machinery and the
combinations keep growing; now it is time to MAKE THE MOST OF IT. Criterion for any new feature: it
must bring something distinctive, more expressiveness or a richer palette of sounds; if it duplicates
what is already there, it does not go in. Order:
1. **Last batch of features: 4.1 → 5.1 → 5.4 → 5.2.** ✔ (2026-10-25) And then it stops.
2. **Polish and settle** (before 1.3.0): review the machinery so that it gives clean sound — no
   clicks, no strange saturation —, so that it is reliable and invites you to play, to experiment, to
   change things here and there. Review and optimize what is there, not add. ✔ *First pass
   (2026-10-25): factory, knobs, note events and scenes audited — no limiter, no clicks, no NaN; DC
   removed (centered pulse + AC coupling); nothing clipped with the Parts. See DESIGN, «Polish and
   settle».*
3. **Publish 1.3.0.** ✔ (2026-10-25)
4. **Export:** 6.1 (SFZ with loops and variations) and 6.2 (WAV).
5. **English** ✔ (branch ingles, 2026-10-26; DESIGN, «English (1.4.0)») (decided on 2026-10-25): the whole interface translated into English, once and ONLY into English —
   not multi-language: soft synths and the silkscreen of keyboards use English as a neutral language,
   and other languages (German) make the words longer on a fixed panel—. Before the new bank, so that
   the new presets are born in English (all of today's are going to go).
6. **New bank (8)**, with its own plan (see block 8).
Discarded by the criterion: 3.4, 3.5, 4.2, 4.3 and 5.5 (see «What we will NOT do»); 5.3 with no date.

## Roadmap 7.0 «the instrument» (proposed 2026-10-17 · pending agreement)

**Direction (Sergio):** SubSDJ is an INSTRUMENT for sound design and generation. More capable, more
expressive, more surprising; open to other kinds of generator besides FM. Light accompaniment, yes;
a DAW, no (neither a timeline nor multitrack): sounds are exported (SFZ, WAV) and songs are made in a
DAW.

**Presets are not a constraint (Sergio, 2026-10-17).** No improvement is cut back so that today's
presets keep sounding the same. If something we implement breaks them, the changes are accepted and,
when the time comes, the bank is redone from scratch with whatever the synth allows by then (block 8).
Old presets are converted only if it is cheap; if not, an old preset is discarded with a warning.

Each block carries **purpose · what · how · fit · verification · cost · dependencies**. The usual
method: selftest green before and after; A/B pairs in `subsdj-demos.json` with their own prefix and
the probe `?selftest=1&demos=PREFIX` if it is audible; screenshots if it is visual; DESIGN.md and
this plan up to date; one commit per milestone. Constraint on every block with UI: the panel is
fixed — a new control has to fit in its band (check «nothing clipped») or displace something in an
agreed way.

### Quick view

| # | Block | What it gives us | Cost | Depends on |
|---|--------|------------|-------|---------|
| **0** | **Fixes** | | | |
| 0.1 | Keyboard without hanging notes ✔ | shortcuts (Ctrl+Z) that do not play notes; Shift and cancelled touches that do not hang — DONE 2026-10-17 | low | — |
| 0.2 | SFZ with the real velocity layers ✔ | export the touch of presets with vel→FM, vel→filter through the matrix or FM4 — DONE 2026-10-17 (44 of 116 with layers; 30 before) | low | — |
| 0.3 | Wavetables without interpolation noise ✔ | clean «Wavetable»: from −43 to −76 dB between harmonics at C4 — DONE 2026-10-20 | low-medium | — |
| 0.4 | A common clock ✔ | arpeggiator, sequencer, players and what is new on the same grid — DONE 2026-10-20 | medium | — |
| **1** | **Sound workshop** | | | |
| 1.1 | Undo / redo ✔ | try things without fear — DONE 2026-10-17 | low-medium | 0.1 |
| 1.2 | Compare with the saved one ✔ | does my edit improve the preset? — DONE 2026-10-17 | low | 1.1 |
| 1.3 | Output meter ✔ | headroom and limiter work in sight — DONE 2026-10-25 (next to the spectrum, in Output) | low-medium | — |
| 1.4 | Library 2.0 | tags, usage description, search, listen without loading | medium | — |
| **2** | **Expression and movement** | | | |
| 2.1 | Looping modulation envelope ✔ | timbre rhythms tied to each note — DONE 2026-10-20 (panel in Sequencing) | medium | — |
| 2.2 | Tempo-synced, retriggered and one-shot LFO ✔ | modulation in time; LFO as an envelope — DONE 2026-10-20 | low-medium | 0.4 |
| 2.3 | Steps module (polymetre) ✔ | step-by-step timbre, complex and rhythmic — DONE 2026-10-20 | high | 0.4, 2.2 |
| 2.4 | More destinations in the matrix ✔ | mixer levels (vector), Drive, Pitch A, Material — DONE 2026-10-20 (Decay no: see below) | low | — |
| 2.5 | Performance macros ✔ | one knob moves several destinations — DONE 2026-10-25 (two knobs at the foot of the Matrix) | low | — |
| 2.6 | Touch response ✔ | velocity curve, bend range — DONE 2026-10-25 (keyboard bar) | low | — |
| **3** | **New generators** | | | |
| 3.1 | Drive with character: asymmetric and folded ✔ | soft/fold + Asym — DONE 2026-10-20 | low-medium | — |
| 3.2 | Hard sync ✔ | the classic sync sweep — DONE 2026-10-25 (button in the Osc A header) | medium | 2.4 |
| 3.3 | Physical string ✔ | real plucked strings — DONE 2026-10-25 (String wave + String module) | medium | — |
| 3.4 | Phase distortion | the synthesis of the Casio CZ | low-medium | — |
| 3.5 | Additive: harmonic editor | draw the spectrum | medium | — |
| **4** | **Character and space** | | | |
| 4.1 | Runaway delay ✔ | stable self-oscillation, dub sirens — DONE 2026-10-25 (fdbk and sat at the foot of the Delay) | low | — |
| 4.2 | Plate: low end and random modulation | dark tails, less «chorus» | medium | optional |
| 4.3 | Phaser | the effect missing next to flanger and chorus | low-medium | optional |
| **5** | **Light accompaniment** | | | |
| 5.1 | Sequencer: accent, tie, slide, repeats ✔ | the 303 line — DONE 2026-10-25 (Shift/Alt/Ctrl + click in the editor) | low | 0.4 |
| 5.2 | Notes by degree ✔ | the pattern follows the scale — DONE 2026-10-25 | low-medium | — |
| 5.3 | Chords that chain | voice leading and voicings | low | — |
| 5.4 | Breathing pulse and swing ✔ | density that changes per bar; global swing — DONE 2026-10-25 (swing at the foot of the Arp; Breathe and Cycle in the Pulse) | low | 0.4 |
| 5.5 | Arpeggiator: modes and repeats | converge, diverge | low | 0.4 |
| **6** | **Export to the DAW** | | | |
| 6.1 | SFZ with loops and variations | short samples that sustain; round robin | medium | 0.2 |
| 6.2 | Export the sound to WAV | a clip ready for the DAW without recording in real time | low | — |
| **7** | **Reliability** | | | |
| 7.1 | Seeded randomness in offline renders ✔ | repeatable renders; and, along the way, key sync for 2-op FM — DONE 2026-10-20 | low-medium | — |
| 7.2 | Sound fingerprint of the factory | no preset changes its sound without deciding it | medium | 7.1 |
| 7.3 | Checks per category | no preset hangs voices or overshoots with chords | low | — |
| 7.4 | Format version | presets and libraries that never load wrong | low | — |
| **8** | **New bank from scratch + es/en language** | only interesting, useful presets that people like and that surprise; synth and bank in Spanish and English | medium-high | 1.4 and whatever there is |

### Proposed order

1. **0.1 + 0.2** (one afternoon: fixes you notice when playing and exporting).
2. **1.1 + 1.2** (the workshop: undo and compare change how you design).
3. **7.1** and the measurement for **0.3** (cheap; makes the checks of everything that follows
   stricter). ✔
4. **3.1 + 2.4** (cheap surprise: folding and vector morph with what is already there). ✔
5. **0.4 → 2.2 → 2.1 → 2.3** (the big block: clock, tempo-synced LFO, looping envelope, Steps). ✔
6. **1.3, 2.5, 2.6, 3.2, 3.3** ✔ (2026-10-25).
7. **Revised on 2026-10-25** (above, «Direction agreed»): 4.1, 5.1, 5.4, 5.2; polish; 1.3.0; 6.1/6.2;
   new bank (8). 1.4 and 7.2-7.4 are decided when we get there (1.4 fits with the new bank).

### Loose ends (no date; small or from the back burner)

- **Undo in the Wave Editor**: the drawn table lives outside `CONTROLS` and does not go into the
  history (1.1). Add it if it is missed.
- **Large visualizers**: oscilloscope and spectrum in the header, expandable (old back-burner item);
  fits with 1.3 (meter).
- **«909 Kit» scene**: four percussion parts with Pulse players; better with the new bank (8).
- **Fold the limiter makeup (+1.71 dB) into the master headroom**: cosmetic, does not change a single
  sample.
- **Granular**: parked since Roadmap 5.0 («for another time»).
- **Credits** on publishing: a line of acknowledgements in the README and, in the CHANGELOG, @tacowars
  wherever something inspired by his ideas goes in (it already appears that way in 1.1.0).

### Decisions

Accepted on 2026-10-17 (the recommendations):
1. **5.1** goes in: accent, tie, slide and repeats in the sequencer (it was listed in «What we will
   NOT do» as a separate project; the pattern already accepts `7!` and `5~` and the engine ignores
   them).
2. **0.1** computer keyboard by physical POSITION (not by the letter): the tracker layout stays in the
   same place on any keyboard layout.
3. **2.5** macros as matrix sources (cheap). Those that move any parameter with their own range and
   curve, not for now (they clash with undo and MIDI learn).
6. **2.3** starts with 4 lanes × 32 steps.

5. **es/en language: hand in hand with the new bank (8)** — that way the names and descriptions of
   the presets are born in both languages and the interface is translated in the same batch.

Open (they do not block anything):
4. **4.2 and 4.3** are optional: do they go in?

### 0 · Fixes

**0.1 · Keyboard without hanging notes.** ✔ DONE 2026-10-17 (details in DESIGN.md).
- *Today* (`ui/keyboard.js`): `keydown` does not look at Ctrl/Alt/Meta, so Ctrl+Z plays a C and
  Ctrl+C an E. The note is stored by `e.key`: with Shift between press and release a different key
  arrives (Shift+2 = `"`) and the note hangs until panic. `pointercancel` (the system cancels a
  touch) and `lostpointercapture` are not handled.
- *What:* (1) with Ctrl, Alt or Meta held, the key is not a note; (2) the map by physical position
  (`e.code`: `KeyZ`, `Digit2`, `Comma`…): Shift no longer matters and the tracker layout stays in
  place on AZERTY or Dvorak; (3) each mouse or finger note stored by `pointerId`; `pointercancel` and
  `lostpointercapture` release it; `touch-action: none` on the keys.
- *Verification:* check «keyboard without stuck notes»: `keydown Digit2` + `keyup` with `key '"'` →
  zero voices; Ctrl+`KeyZ` → no voice; `pointercancel` releases.
- *Cost:* low.

**0.2 · SFZ with the real velocity layers.** ✔ DONE 2026-10-17 (details in DESIGN.md; the final
measurement is by third-octave bands, not by the tilt proposed here: the tilt did not see changes in
weak harmonics).
- *Today* (`ui/sfzExport.js`): two layers only if `filterEnvAmt ≠ 0`. A preset with velocity → FM
  through the matrix, velocity → filter through the matrix or sensitivity on the FM4 operators exports
  ONE layer and loses the touch.
- *What:* decide by measuring, not with a list of parameters: render the reference note at velocity
  0.3 and 1, match levels and compare the spectral tilt (what the «Velocity in FM4» check already
  does). If it changes more than a threshold → layers (2 or 3). That way, any new velocity destination
  is covered without touching the exporter.
- *Verification:* check that exports «DX E-Piano (vel→FM)» in memory → ≥ 2 layers; Init → 1.
- *Cost:* low.

**0.3 · Wavetables without interpolation noise.** ✔ DONE 2026-10-20 (details in DESIGN.md). Once
measured, the noise was not in the low end but in the middle register (−43 dB at C4): 8× tables +
Hermite.
- *Today* (`engine/wavetable.js`): each mip is 4× its harmonics long (minimum 256 samples) and the
  worklet interpolates linearly. With such short tables the interpolation error falls BETWEEN the
  harmonics (inharmonic): harshness on low notes with many harmonics («Wavetable» saw at C1-C2).
- *What:* (1) measure first: «Wavetable» saw against PolyBLEP saw at C1, C2 and C3, energy outside the
  harmonics (FFT) in dB below the fundamental; (2) if the floor is above about −60 dB: longer tables
  in the mips with more harmonics (16-22×: memory ×4-5 per set) or 4-point cubic interpolation
  (Hermite: the lookup costs twice as much, no memory). The choice is made by measurement: memory per
  node versus CPU per sample.
- *Verification:* check «clean wavetable» with the measured threshold; WT before/after pairs.
- *Cost:* low-medium.

**0.4 · A common clock.** ✔ DONE 2026-10-20 (details in DESIGN.md). Arp and Seq count in clock
PULSES; a player's key comes in with its instant (not by timer). Still pending: Arp/Seq OFFLINE (they
run on setInterval: needed for 6.2, exporting to WAV what plays in the Seq/Arp). The wave sequence
stays per voice from its noteOn (that is its charm), not on the grid.
- *Purpose:* everything that runs in tempo — arpeggiator, sequencer, players and what is coming
  (tempo-synced LFO, Steps, swing) — shares one grid.
- *Today:* the Arp and the Seq each start their own clock on key press (`currentTime + 0.03`); the
  conductor (`Conductor`) counts pulses with another one. When a player plays a part with Arp or Seq,
  the «key» comes in through `setTimeout` and the Arp/Seq starts wherever it lands: off the bar grid.
- *What / how:* `engine/Clock.js` with the origin (audio time of pulse 0) and the bpm; `nextGrid(t,
  div)`, `stepAt(t, div)`, `beatAt(t)`. With Parts and the conductor running, the origin is the
  conductor's; when playing by hand, the origin is set by the first note (no added latency, as today)
  and kept while something plays in tempo. The Arp and the Seq compute their next step with
  `nextGrid`, not from «now». A bpm change re-anchors the origin at the current pulse, without jumps.
- *Fit:* `Arp.js`, `Seq.js`, `WaveSeq.js`, `Conductor.js`; the bpm is already shared (the Room).
- *Verification:* check with player + Seq: the steps fall on exact multiples of the division from the
  conductor's origin (|Δ| < 1 sample); playing by hand, the first note without delay.
- *Cost:* medium. It is the basis of 2.2, 2.3, 5.1, 5.4 and 5.5.

### 1 · Sound workshop

**1.1 · Undo and redo.** ✔ DONE 2026-10-17 (details in DESIGN.md).
- *Purpose:* designing sounds is trying and going back; without undo, you try things with fear.
- *What:* Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z); ↶ ↷ buttons in the header showing what they undo
  («Undo Cutoff»). 100 steps.
- *How:* `ui/undo.js`. Before each GESTURE, `snapshot()` (a flat object of ~250 keys); at the end, if
  something changed, {before, after, screen, part} is pushed. A gesture: dragging a knob or fader
  from `pointerdown` to `pointerup`; wheel or arrows grouped if they arrive less than 500 ms apart;
  the reset double click; choosing in a selector; loading a preset (undoing it brings back the sound
  from before). Undo applies ONLY the keys that differ (`CONTROLS[k].set`), not `loadState`: it does
  not cut the notes that are playing. It goes back to the screen where the change was made.
  Performance gestures (keyboard, wheel, bend, aftertouch) are not included.
- *Fit:* `registry.js` (`CONTROLS`, `snapshot`); the parameter name is already read from the DOM for
  the Output screen and serves for the button title.
- *Verification:* check: one cutoff drag = one step; undo and redo restore; loading a preset and
  undoing goes back to the previous one; a sustained note keeps playing after undo.
- *Cost:* low-medium.

**1.2 · Compare with the saved one.** ✔ DONE 2026-10-17 (details in DESIGN.md).
- *Purpose:* the «Compare» key of hardware synths.
- *What:* a «modified» dot next to the preset name, computed by COMPARING the state with the loaded
  preset (if you put the knob back where it was, the dot goes out); «Compare» button: while it is
  active the saved preset plays and, when released, your edit comes back intact.
- *How:* on loading, store the effective state (with the base applied); key-by-key comparison with a
  tolerance for decimals; Compare applies differences in one direction and the other with the same
  mechanism as 1.1, without touching the history.
- *Verification:* check: edit → dot; put back → no dot; comparing there and back keeps the edit.
- *Cost:* low.

**1.3 · Output meter.**
- *Purpose:* see the level while designing — even more with the mixer, which adds up —: how much
  headroom is left and when the limiter is working.
- *What:* in the header, next to the oscilloscope: L/R peaks (1 s hold, 24 dB/s fall, zones at
  −12 and −1 dBFS), the limiter's gain reduction and a «limiter» LED that stays lit until clicked.
- *How:* `limiter-processor.js` already computes the gain: let it send through its `port`, every
  ~50 ms, the input and output peak and the maximum reduction in the interval (accumulated maxima:
  no extra cost per sample). Bars with `transform: scaleY`, without CSS transitions (they cost main
  thread), painted only when data arrives and stopped while the tab is hidden.
- *Verification:* check: a burst at +12 dB (as in «limiter») lights the LED and shows > 6 dB of
  reduction; in silence, −∞.
- *Cost:* low-medium.

**1.4 · Library 2.0: finding sounds.**
- *Purpose:* with ~120 factory presets, two banks and your own, find «a dark, slow pad» in seconds.
- *What:* (1) tags per preset (dark, bright, slow, percussive, evolving, metallic, vocal, sub,
  acid…) and a short description of HOW to play it («open chords in C3-C5; 12 s attack»);
  (2) multi-word search (all of them in name, tags, category or description); (3) tag filters with
  their count (the number = presets that would remain if you chose it); (4) listen without loading:
  holding ▶ on a card plays a note (or its category's chord) with that preset on a separate engine,
  without touching your edit; (5) ‹ › in the quick bar step through the filtered list.
- *How:* `tags` and `desc` keys in the preset, outside `CONTROLS` (metadata, not sound): the library
  stores them with the item and `snapshot()` does not overwrite them. Initial tagging of the factory
  by hand, category by category, with the intended use that was already fixed when the loudness was
  matched (a note or a three-note chord).
- *Verification:* model checks (`Library` without DOM): search with all the words, counts; listening
  does not change the rack state.
- *Cost:* medium.

### 2 · Expression and movement

**2.1 · Looping modulation envelope.** ✔ DONE 2026-10-20 (details in DESIGN.md). «Mod Env» panel on
the Sequencing screen (Sergio's decision: the Voice band in Design was full); in loop mode the
sustain does not count.
- *Purpose:* one more free envelope for the matrix that can also REPEAT: timbre rhythms tied to each
  note, without tempo.
- *What:* «Mod Env» (attack, decay, sustain, release, curve) as a matrix source, with three modes:
  normal · loop (repeats attack + decay while the note is held: an envelope-shaped LFO that starts
  with the note) · trigger (ignores the note-off: always the whole curve; for percussion with a short
  gate).
- *How:* normal and trigger = a `ConstantSource` per voice with the ramps from `_envSegs` (like the
  filter env, which is already a source). Loop = one `AudioBufferSource` per voice with ONE A + D
  cycle in a buffer and `loop = true`, started at `t0` (sample accuracy and minimal cost, like the
  buffer-based S&H LFOs); on release, release from the current value with an explicit anchor (like
  the VCA).
- *Fit:* `Voice.js` (source `envm` in `mxRewire`), `params.js` (`envm*`), panel in Design next to
  Filter Env if it fits in the Voice → Output band.
- *Verification:* check: in loop with A 10 ms + D 90 ms the source repeats at exactly 10 Hz
  (Goertzel on the Amplitude destination); in trigger, a 20 ms gate completes the curve. ENVM pairs.
- *Cost:* medium.

**2.2 · Tempo-synced, retriggered and one-shot LFO.** ✔ DONE 2026-10-20 (details in DESIGN.md). Sync
per LFO (selector per row) and the phase mode, one for all (global · per voice · retrig · once).
Along the way: the global LFOs got FROZEN between notes (Chrome does not process what does not reach
the output); now they always run.
- *What:* each LFO with «sync» (Speed in divisions: 4 bars … 1/32, triplets and dotted) and phase
  mode: free (as today) · retrig (each note starts the LFO at its phase 0) · once (goes through one
  cycle and stays: yet another envelope).
- *How:* speed = bpm / 60 / pulses of the division; the global LFO is anchored to the origin of the
  common clock (its maximum falls on the grid). Retrig and once = per-voice LFO (the per-voice buffers
  of `lfoPhase 'voz'` already exist) with phase 0 and, for once, `loop = false`.
- *Verification:* check: at 120 bpm and 1/8 the LFO runs at 4 Hz with its maximum on the grid
  (± 1 ms); in once, fixed after one cycle.
- *Cost:* low-medium. Depends on 0.4.

**2.3 · Steps module (polymetre).** ✔ DONE 2026-10-20 (details in DESIGN.md). Panel in the bottom
band of Sequencing (Sergio's decision). Mind the count below: 240 sixteenths are 15 bars, not 30.
- *Purpose:* the pending item from Roadmap 6.0: the timbre moving in STEPS, with rhythm, complex while
  still rhythmic. Simple lanes of different lengths only line up again after many bars: 16 · 12 · 5
  steps → LCM 240 (30 bars in sixteenths).
- *What:* 4 lanes; in each one: length 1-32 steps; division (1/32 … 1 bar, triplets); value per step
  −1..+1 drawn with the mouse; smoothing (0 = step with a 4 ms micro-ramp against the click … 1 =
  curve); rotation and rotation drift (one step every N bars: Reich's phasing). Each lane is a matrix
  SOURCE in two flavours: «Steps 1» (continuous signal: the step also moves a sustained note) and
  «Steps 1 · note» (the value is fixed when each note starts and stays with it the whole note: correct
  in polyphony and with no steps inside a note; for arpeggios and plucks). A common reset for all the
  lanes (on starting to play / every N bars / never) and a label «the full cycle lasts 30 bars».
- *How:* `engine/Steps.js`; the patterns in flat keys («0.5 -1 0 …», like `wsPat`): presets, MIDI
  learn and Reset without special cases. Continuous = one `ConstantSource` per lane and engine,
  scheduled in the look-ahead of the common clock (`setValueAtTime` + short ramp) and connected
  through the matrix like the global LFOs. Per note = a scalar source per voice (like «S&H per note»
  in `_mxConsts`), read with the clock's step at `t0`. Lesson learned: do not connect to biquad
  parameters unless they are used (per-sample coefficients).
- *Fit:* Sequencing screen, next to Arp, Seq and the wave sequence. The wave sequence stays as it is
  (compatibility) and a lane on «Wavetable» generalizes it. With 2.1 and 2.2 it completes the
  movement trio: an envelope that repeats, a tempo-synced LFO, steps. A tempo-synced volume gate
  (trance gate, pumping) is a lane on Amplitude.
- *Verification:* checks: (1) the staircase of a lane over time (carrier through the Amplitude
  destination: exact values and times); (2) 16 · 12 · 5 line up again at step 240; (3) «per note»
  keeps the value for the whole note; (4) smoothing 0 without a click (maximum jump between samples
  bounded). Pairs STEPS 1-6 (static pad / with three lanes; arpeggio without and with «per note»).
- *Cost:* high. Depends on 0.4 and 2.2.

**2.4 · More destinations in the matrix.** ✔ DONE 2026-10-20 (details in DESIGN.md): levels A, B,
Ring and noise, Drive, Pitch A and Material (retunes the modes; their weights follow the knob). A
level below 0 inverts the phase and is left that way (AM through zero). Decay NO: linear Q against a
log knob and the ∝ √Q boost of the noise.
- *What:* the mixer levels (Osc A, Osc B, Ring, Noise) → vector morph between sources with an LFO,
  an envelope or the Steps; Drive; Material and Decay of the resonator; Pitch of A only (for the
  sweep of 3.2).
- *How:* the nodes exist (`gA`, `gB`, `ringX`, `noiseGain`, `dvPre`, the modal bank); the matrix sums
  onto their AudioParam with its scale (`MX_SPAN`). A level modulated below 0 inverts the phase and
  sounds just as loud: unipolar sources or clipping (to be decided by measuring).
- *Verification:* check per destination (what it says moves); VEC pairs (two fixed oscillators / the
  same with a slow LFO on the levels).
- *Cost:* low.

**2.5 · Performance macros.**
- *What:* 2 (or 4) «Macro» knobs saved in the preset and MIDI-learnable, as matrix SOURCES (just like
  the wheel or expression): a single knob opens the filter, raises the drive and lowers the reverb at
  the same time, each with the amount of its slot.
- *How:* keys `macro1`/`macro2` (0..1) in `PARAMS`; a constant source per engine (like
  `AudioEngine.perf` for wheel, aftertouch and expression, which are not saved; these are).
- *Cost:* low. (The alternative — macros that move any parameter — in Decisions.)

**2.6 · Touch response.**
- *What:* velocity curve (soft · linear · hard) for MIDI and mouse; pitch bend range per preset
  (±2 by default, ±12 for basses and effects).
- *Cost:* low.

### 3 · New generators

**3.1 · Drive with character: asymmetric and folded.** ✔ DONE 2026-10-20 (details in DESIGN.md).
Instead of three modes, «character» soft | fold + an Asym knob (the bias, in both): soft + Asym =
the asymmetric one.
- *Purpose:* two colours a filter does not give. Asymmetric: EVEN harmonics (the «twisted» body of
  kick drums and valves). Folded: West Coast synthesis (Buchla) — as the gain rises the wave folds
  over itself and the harmonics appear and move non-linearly; a sweep that sounds like no filter.
- *What:* «Character» selector on the Drive: soft (tanh, today's) · asymmetric (bias:
  `y = f(g·x + b) − f(b)`: no DC and exact silence) · fold (sine fold with «Symmetry»). The Drive
  modulable from the matrix (2.4) = fold sweeps with an LFO, an envelope or Steps.
- *How:* the usual `dvPre → WaveShaper → dvPost` chain; new shared curves (like `DRIVE_CURVE`) with a
  wide input range (the fold needs ±8); 4x oversampling in the fold; the bias, a `ConstantSource`
  added in front of the shaper.
- *Verification:* check: asymmetric with 2nd harmonic > −30 dB and DC < −80 dB; fold with the
  brightness rising NON-monotonically with the gain; exact silence with input 0. DRV pairs.
- *Cost:* low-medium.

**3.2 · Hard sync.**
- *What:* «Sync» on Osc A: A restarts its cycle with every cycle of B. Sweeping A's pitch (pitch env,
  Steps or LFO on «Pitch A») gives the classic scream of the sync lead.
- *How:* the oscillators are separate nodes, but the slave does not need to HEAR the master, only its
  timing: A carries inside a «ghost» phase at B's frequency (note × octave and detune of B, which are
  passed to it) and resets its phase when crossing it, with the PolyBLEP correction of the jump (as it
  already does at the edges).
- *Verification:* check: with A at 1.5× B, the fundamental is B's; no aliasing above −60 dB. SYNC
  pairs. **Done:** the −60 dB was not realistic with PolyBLEP (the free saw is already at −43 at
  C4); criterion: as clean as the free oscillator at its pitch (see DESIGN).
- *Cost:* medium. Depends on 2.4 (Pitch A).

**3.3 · Physical string (extended Karplus-Strong).**
- *Purpose:* a new family: plucked strings that die away like real ones (each harmonic at its own
  rate), with the strength of the pluck changing the brightness.
- *What:* «String» wave: noise excitation filtered by velocity; delay line tuned to the note (fine
  tuning with a fractional allpass); filter in the loop (Bright, Decay); pluck position (comb: near
  the bridge, metallic; in the middle, round); Stiffness (dispersion with allpass: piano strings,
  bells).
- *How:* in `pulse-processor.js`, one more type with its delay buffer per instance (2205 samples are
  enough down to 20 Hz); reuses octave, detune and glide (the length follows the pitch).
- *Verification:* check: tuning ± 2 cents in C2-C6; the fundamental lasts longer than the 5th
  harmonic; velocity 0.3 against 1 changes the brightness. STRING pairs.
- *Cost:* medium.

**3.4 · Phase distortion.**
- *What:* «Phase» wave (the Casio CZ): a cosine read with a warped phase; a «Shape» knob sweeps from
  sine to saw or pulse, and the «resonant» shapes imitate a resonant filter without a filter.
  Modulable («Shape» destination).
- *How:* in `pulse-processor.js`; «Shape» as an a-rate AudioParam (like the PW). Band-limited by
  PolyBLEP or mips depending on the shape (to be measured).
- *Cost:* low-medium.

**3.5 · Additive: harmonic editor.**
- *What:* the Wave Editor gains a «Harmonics» mode: you draw the amplitudes of harmonics 1-64 as bars
  instead of the waveform; the «user» table is generated from that spectrum (the wavetable pipeline
  already works with spectra). Two drawn spectra and the morph = timbres that breathe. It is the
  «harmonic editor» part of the postponed W3.
- *Cost:* medium.

(No date: granular, parked since Roadmap 5.0.)

### 4 · Character and space

**4.1 · Runaway delay (dub).**
- *What:* «Saturation» inside the delay loop and feedback up to 1.1: above 1 the echo grows until the
  saturation holds it and it stays self-oscillating at a stable level (the dub sirens); Damp and Wow
  stay inside the loop.
- *How:* a WaveShaper (tanh) in the feedback of the Room (a `DelayNode` allows cycles); with the tanh
  inside, the loop amplitude is bounded by construction.
- *Verification:* check: with feedback 1.1 the level settles (< 1.5 dB of variation between seconds
  5 and 10) and no NaN; with saturation 0, today's delay, identical. DUB pairs.
- *Cost:* low.

**4.2 · Plate: low end and random modulation** (optional).
- *What:* a decay of its own for the low end (×0.5 … ×2: dark rooms, or short in the lows so as not
  to muddy) and modulation of the tank allpasses with smoothed noise instead of sines at 1 and
  0.95 Hz (less «chorus» on long tails).
- *How:* `plate-processor.js`: a band crossover in the tank with its factor; seeded smoothed noise.
  The plate no longer computes in silence.
- *Verification:* RT60 measured per band; PL pairs.
- *Cost:* medium.

**4.3 · Phaser** (optional): 4-8 allpass stages with feedback and LFO, next to Flanger and Chorus.
*Cost:* low-medium.

### 5 · Light accompaniment

**5.1 · Sequencer: accent, tie, slide and repeats** (DECISION 1).
- *Today:* the pattern already accepts `7!` (accent) and `5~` (tie); `Seq.js` (`_tick`) ignores them.
- *What:* `!` = more velocity + matrix source «Accent» (the preset decides what an accent does: open
  the filter, more drive…); `~` = tie (the note carries on without retriggering); `/` = slide (in
  Mono, legato with glide towards the next: the 303); `x2`…`x4` = repeats within the step.
- *Cost:* low. Depends on 0.4.

**5.2 · Notes by degree.** ✔ *DONE 2026-10-25 (selector next to the phrases).* Seq option
«degrees»: the numbers are degrees of the scale (the Harmony's with Parts, or one chosen in the Seq).
«0 2 4 2» plays in major, dorian or pentatonic without rewriting it; going past the last degree goes
up an octave, it is not clipped. *Cost:* low-medium.

**5.3 · Chords that chain.** The «chord» player keeps the notes common to consecutive chords and
moves the rest to the nearest pitch (voice leading), with voicings: close, drop 2, open, in fourths.
Today it retriggers in close position on every change. *Cost:* low.

**5.4 · Breathing pulse and swing.** The Euclidean Pulse with k between a minimum and a maximum that
changes per bar (a wave of N bars or a walk); global swing 50-75 % applied by the common clock to
Arp, Seq, players and Steps. *Cost:* low. Depends on 0.4.

**5.5 · Arpeggiator:** converge and diverge modes, swing (5.4) and repeats. *Cost:* low.

### 6 · Export to the DAW

**6.1 · SFZ with loops and variations.**
- *What:* (1) automatic loop points on sustained sounds (in the sustain, the stretch of whole periods
  with the smallest discontinuity + crossfade): short samples and notes that sustain as long as
  needed in the sampler; (2) round robin (2-3 variants per note) on presets with randomness (drift,
  S&H, noise, free phases): the sampler does not repeat the same sample; (3) the layers from 0.2.
- *Verification:* check: the loop does not jump more than the threshold; the `.sfz` carries
  `loop_start`/`loop_end` and `seq_length`.
- *Cost:* medium. Depends on 0.2.

**6.2 · Export the sound to WAV.** «Export WAV» renders offline the preset playing a note, a chord or
whatever plays in the Seq/Arp for N bars, with its tail: a clip ready to drag into the DAW, without
recording in real time. *Cost:* low.

### 7 · Reliability

**7.1 · Seeded randomness in offline renders.** ✔ DONE 2026-10-20 (details in DESIGN.md). The
randomness of the 10 dB was the phase of the 2-op FM modulator, drawn on every note live as well (up
to 7.7 dB between identical C4s): now it starts at the carrier's phase (key sync, like FM4).
(Seen while measuring 0.2: several FM presets differ by up to 10 dB from one render to the next; find
out where that randomness comes from.) The noise, the start point of the Bite, the drift, the S&H and
the free phases come from a seeded generator when the engine is offline (live, the usual
randomness). Repeatable renders: stricter checks and the fingerprint of 7.2.
*Cost:* low-medium.

**7.2 · Sound fingerprint of the factory** (optional). Each preset rendered with an awkward script
(notes off the block boundary, a glide, an early note-off) → a compact fingerprint (energy per band
every 50 ms) in a JSON. With presets outside the constraints, it does NOT serve to protect the bank:
it is an alarm for changes nobody was looking for during a refactor (the common clock, for example,
should not change the sound of anything). A deliberate change simply renews it
(`?selftest=1&fingerprints=renew`). Not bit for bit: Chrome sums a node's inputs in a non-fixed order
(measured: ~1e-8). *Cost:* medium. Depends on 7.1.

**7.3 · Checks per category.** Every sustained preset plays in its register; after the release there
are zero live voices; pads and strings with a 4-note chord under the ceiling (today «headroom»
measures it for six). *Cost:* low.

**7.4 · Format version.** Presets, library and scenes with their format number. A file in a format
that is not understood (newer, or an old one whose conversion is not worth it) is listed with Export
and Delete, but is never half loaded or sounding like something else (reject without destroying).
Cheap conversions (v1 → v2, Mix → levels) in an ordered table. Ask for persistent storage
(`navigator.storage.persist()`) so that the browser does not empty the library for lack of space.
*Cost:* low.

### 8 · New bank from scratch (future idea; the language was decided separately: English only, before)

- *Purpose:* replace the current factory bank (which grew block by block, often as a demonstration of
  each improvement) with one thought out as a whole: only interesting, useful presets that people
  like and that surprise.
- *When:* when the synth has what phases 2 and 3 bring (Steps, looping envelope, new generators), or
  earlier if an engine change makes the current bank meaningless.
- *How:* written criteria before starting (what makes a preset good: playable, with a clear use,
  showing something of the synth); each preset with tags and a description of how to play it (1.4);
  loudness matched by measurement (as in 1.1.0); the A/B pairs in `subsdj-demos.json` remain the place
  for the technical demonstrations, separate from the bank. The current bank is retired (at most,
  exported once to a JSON in case anyone wants to recover one).
- *Language — SUPERSEDED on 2026-10-25: English only, full translation before the bank (point 5 of
  the direction).* What was thought at the time: a layer of interface texts (`t()` and the texts in
  separate tables; ids, parameter keys and JSON fields intact; «jugador» → «músico», player → musician, as a label) and
  the new bank written in both languages from the start: name, description of how to play it and tags
  with their English version in the preset itself (tags as ids translated by a table, so that search
  works in any language). That way each preset is written once, not translated afterwards.
- *Cost:* medium-high (design and listening for the bank; the text layer is mechanical but touches
  the whole UI).
- **What Sergio asks for (2026-10-25), for its own plan when we get there:**
  - Before anything else, the whole current bank to a backup JSON, as a reference.
  - Rich, solid, punchy and useful presets, organized by category, that explore and exploit what the
    synth can do; a clean bank in which every preset says something and can be used. It is not
    obvious, nor is it just machine work: a plan with classic and not-so-classic goals, inspired by
    the banks of well-known synths, and see how far we get (perhaps with the help of a model to
    explore). A warning from the Windsor colleague: a good bank is hard; in his, many presets sound
    alike.
  - Demos and tests OUTSIDE the main bank: loadable from their .json, but not seeded into the library.

---

# Earlier plans (history)

Date: 2026-10-04 · **Roadmap 6.0 under exploration** (its own section further down): the Grain was
tried and DISCARDED; the direction sought is complex, stepped sounds (step modulation); «Stepped»
presets with what is already there; the Steps module, pending until Sergio sees it clearly.
**Roadmap 5.0 «cinescape» agreed on 2026-10-03** (its own section further down; blocks 1 to 5 and 7
DONE and in master (`bbba744`), selftest 162/162; number 6, granular, PARKED «for another time»).
Previous state (2026-09-27): Roadmap 4.0 agreed on 2026-09-10 (DESIGN.md); done **A1 tape delay**
(`1db2a19`), **B1 FM in the matrix + feedback** (`8978cd6`), **C1 Parts + mixer** (`12b71f6`),
**C2 Harmony + players** (`f06fa8b`), **C3 Arrangement + scenes** (`8bf1f8e`) and **A2 Plate
reverb** (`0b77967`), **B2 FM4 oscillator** (`a4d20a4`) and **A3 Envelope curve** (2026-09-27),
**13a Screens**, **11 runner in `tools/`** and **13b Preset library** (2026-09-27); selftest 120/120.
Axes B and C are COMPLETE and of axis A only A4 remains. Outside the plan: hanging notes + Panic
(`4e2b47e`), four scenes in `scenes/` (`c718c63`; the plate in the two ambient ones, `29f172d`).
This document complements DESIGN.md: the summarized roadmap lives there; here, each pending block
with its **purpose**, what we will do, how, how we verify it, what it costs and what it depends on.
When a block is finished it is marked ✔ here and in DESIGN.md.

The order of the list is **from what gives us most → least**. The order of EXECUTION is a different
one and goes separately, because it pays to put the cheap ones in first.

## Quick view

| # | Block | What it gives us | Cost | Depends on |
|---|--------|------------|-------|------------|
| 1 | **C1 Parts + mixer** ✔ | the door to everything generative: 4 presets playing at once — DONE | high (architecture) | — |
| 2 | **C2 Harmony + players** ✔ | the little tune: sound that makes itself and sounds musical — DONE | high | — |
| 3 | **C3 Arrangement + scenes** ✔ | real ambient: slow evolution, reproducible sessions — DONE | medium | — |
| 4 | **A2 Plate reverb** ✔ | the biggest «sounds fine»; the room where ambient lives — DONE | high (DSP) | — |
| 5 | **B1 fmIndex in the matrix + feedback** ✔ | pluck, bell and DX touch for almost nothing — DONE | low | — |
| 6 | **B2 FM4 oscillator** ✔ | full FM: 4 operators and algorithms — DONE | high | — |
| 7 | **A3 Envelope curve** ✔ | attacks and decays that sound natural — DONE | low | — |
| 8 | **A4 BP + notch filter** ✔ | Type selector LP↔HP / BP / Notch; Goertzel: notch −39 dB, BP +23.7 dB; morph 50 % = notch at −6 dB (RMS ×0.500) — DONE 2026-09-28 | low | — |
| 9 | **LFO with S&H and drift** ✔ | S&H and drift shapes on each LFO's button (looping buffers, playbackRate = Speed; fixed output `out`); 3 presets + pairs LFO 1-6 — DONE 2026-09-28 | low-medium | — |
| 10 | **Rack skin** ✔ | themes by tokens: tokens + check «skin», knob and slider publish `--pos`, selector read from the stylesheets, themes «Cinescapes» (base) and «Classic» — DONE 2026-09-28 (4 commits) | medium | — |
| 11 | **Headless runner in the repo** ✔ | selftest and screenshots without depending on the session — DONE (`tools/`) | low | — |
| 12 | **Old back burner** | arp swing, SFZ loop points, W3 expressions | — | — |
| 13 | **Screens + preset library** ✔ | make the synth enjoyable again: see only what matters; presets you can sort, prune and love — DONE (13a and 13b) | 13a low · 13b high | — |
| 14 | **Percussion: 808/909 kit + clap flam** ✔ | 9 presets (909 kick, 808 snare, clap, rimshot, cowbell, open hat, crash, ride, rave hit) with measured levels + Hits/Gap knobs in the ADSR (the burst train of the 808 clap: `Voice._flam`); check «clap flam» and pairs PRC 1-4; after a listening test, kick and snare redesigned (FM4 brightness envelope + Curve 1 across the whole category); FM4 operator clock bug fixed (t0 in the worklet), adaptive look-ahead (5 ms + 2·baseLatency) and the final finding: the hit IS the step → attack 0 + start gate in the worklet + t0 on a block boundary (identical hits live) — DONE 2026-10-01 | low | — |

**Agreed order of execution:** ~~B1~~ → ~~C1~~ → ~~C2~~ → ~~C3~~ → ~~A2~~ → ~~B2~~ (axes B and C
complete); → ~~A3~~ → ~~13a~~ (screens, 2026-09-27) → ~~11~~ (runner in `tools/`, along the way) →
~~13b~~ (library, 2026-09-27; block 13 complete). **10 (skin) COMPLETE on 2026-09-28** (1 tokens →
2 knob with arc → 3 selector → 4 themes) → **A4 ✔ (2026-09-28)**.
**9 ✔ (2026-09-28). 14 (percussion + flam) ✔ (2026-10-01). Next: the back burner (12) — large
visualizers, arp swing, SFZ loop points, W3.** Then A4 and 9 as odd afternoons. The back burner (12)
also remains.

**Usual method in each block:** selftest green before and after; if the improvement is audible, A/B
pairs in `subsdj-demos.json` with their own prefix and the probe `?selftest=1&demos=PREFIX`; if it is
visual, CDP screenshots; one commit per milestone; DESIGN.md and this plan up to date.

## Open decisions (yours to make)

1. **«Room» as a scene module (C1).** ✔ DECIDED on 2026-09-25: option (b), global room by send, done
   in C1. The reasoning, for the record: a preset mixes two classes of parameters: those of the
   INSTRUMENT (voice, inserts, arp/seq/ws and the sends `reverbMix`/`dlyAmt`) and those of the ROOM
   (`reverbSize`/`Damp`/`Pre`, delay time/sync/feedback, `bpm`, `master`). With four parts and a
   single shared reverb there can only be one room. Options: (a) «the last preset loaded rules» —
   loading a bass into part 2 shrinks the cathedral of part 1; (b) the room moves out of the preset
   into a global scene module; presets keep their sends; with Parts off everything as today.
   **Recommended: (b).** It is what the multitimbral synths of the 90s did (the Performance has the
   reverb, each Part its send).
2. **CSS of the `tight` rows** (done along the way in A1): the `.ctl` share the width instead of
   measuring a fixed 62 px, so 5 knobs fit in a row (Delay, and along the way the Filter Env, whose R
   jumped down). Accept or revert (one line in `css/style.css`).
3. **Listening to A1:** preset «Tape Dub» and pairs DLY 1/2 (damp) and DLY 3/4 (wow) from the demo
   bank. If the range of Damp (LP down to 1.2 kHz, HP up to 200 Hz) or the wow (±2.5 ms) seems short
   or long to you, they are constants at the top of `Room.js` (they lived in `AudioEngine.js` until
   C1).
4. ✔ Resolved in C1: 4 generic slots (constant `N_PARTS` in `engine/parts.js`) and a «Layer» box in
   the Part Mixer so the keyboard plays all the parts.
5. ✔ **13b · preset library** — DECIDED on 2026-09-27 (the user accepted the three recommendations)
   and done that same day. (a) Are factory presets DELETED from the library, with «restore from
   factory» as a safety net, or only hidden? **Recommended: delete with the net** — it is what
   «keeping what you like» asks for; hiding is a deletion that does not free up the list. (b) Do the
   scenes (`scenes/*.json`) come in as their own section? **Recommended: yes**, a «Scenes» section
   with the same card (load = ⇧ Scene of the Arrangement module); that way there is a single place to
   look. (c) Does the Design quick bar step through the whole library or only an «active» section?
   **Recommended: the whole one**, with optgroups = sections and favorites first: ‹ › and MIDI
   Program Change keep stepping through everything, as today.

## Done outside the plan (2026-09-26/27)

- **Fixed panel** (proposed by Sergio, 2026-10-12; branch `ui-panel`): the rack that reflowed becomes
  a 1920 × 1000 instrument scaled to the window (`ui/frame.js`), the whole of Design in view without
  scrolling (bands Source / Voice / Modulation-effects in signal order), rotary selectors
  (`ui/rotary.js`), switches with LEDs, faders on the envelopes, LFO bank, Output screen
  (`ui/display.js`); out go `ui/groups.js` and the `data-screens` filters. Check «screens» with
  «nothing clipped» and check «canvas»; 170/170. Details in DESIGN.md («Fixed panel, screens and
  header»).
- **Dependencies** (2026-10-12, same branch): `ui/deps.js` switches off (dimmed, still playable, with
  the reason in the tooltip and on the Output screen) whatever does nothing with the current
  configuration; check «dependencies»; 171/171. The resonator check, which was unstable, is now
  deterministic (2026-10-12): it measured noise with a Goertzel (a Rayleigh draw; the ratio of two
  failed ~7 % over 30 repeats, and Material and glide had the same defect); now it cuts the noise
  with the note held and measures the free tail of the modes (τ = Q/(π·f): 0.731 / 0.530 s measured
  against 0.730 / 0.530). Tested by breaking the resonator: it detects it.
- **Performance** (2026-10-12, same branch; «Human Choir» with many keys was cutting out): filter
  without modulation connected if it does not use it, drive on demand, Vocal at k-rate and without
  WaveShapers if the vowel does not move (voice −40 %; chained chords 85 % → 67 %) and a CPU budget
  shared by the parts (tails first, never the sustained note of another part); check «voice budget»;
  172/172. The Master was tried in front of the limiter and left behind it (it clipped). PENDING a
  listen: gain compensation from 2 notes.
- **Layered scenes** (2026-10-12, same branch; «it clips quite early»): insert effects on demand
  (engine at rest 3.8 → 2.5 %), the budget counts the fixed cost of the engines (live: 28.4 of 30,
  13 live voices at most) and a new limiter in a worklet (brickwall with 6 ms lookahead, ceiling
  −1 dBFS, linear +1.71 dB below like Chrome's: identical in level and delay; tight, without
  harshness). 172/172.
- **Review after block 13** (the user's suggestions, 2026-09-27): header as a fixed module with
  oscilloscope and spectrum (global, like the keyboard); Design in groups by function with a title
  (Oscillators / Filter / Amplitude and modulation / Effects), each group with its grid, collapsible
  (click; double click = only that one); **▶/⏹** on the scenes in the library (load + switch Parts
  on + start; only one; ⏹ does not switch Parts off); the **release follows the Curve knob**
  (straight at 0, RC at 1; before, a fixed exponential τ = r/4 and the graph drew it straight → the
  presets with Curve 0 now release in a straight line); out go the module folding (in a grid of
  units it did not free any space) and the «Scene» warning; no fixed 2U heights. An «audio CPU»
  meter (a worklet timing the gaps between quanta: Chrome exposes neither the load nor
  performance.now() in the worklet) was tried and removed at the user's request: it did not measure
  well. Answers given: presets live in localStorage (per browser and origin) with the factory/repo as
  seed; Delay/Reverb are the same module in Design and Sequencing (shared room in Parts).
- **Hanging notes when stopping the conductor** (`4e2b47e`). In parts with Arp/Seq the player's
  note-on goes by timer and, when stopping within the look-ahead window, the note-off arrived first:
  the Arp kept sustaining. Now pending note-ons are cancelled, «immediate» note-offs are synchronous
  and stopping clears the Seq latch. **⏹ Panic** button in the header and the Escape key: they stop
  the conductor and cut everything in every part.
- **Four scenes in `scenes/`** (`c718c63`): night ambient, dorian dawn, hypnotic techno and robot
  choir. Levels balanced with an offline probe that renders each part solo; the drone's fifth is
  quantized to the scale (bug caught: an out-of-scale note in hirajoshi). The two ambient ones use the
  plate (`29f172d`). The selftest renders all of them.
- **Cuts with the scene playing** (reported by the user, 2026-09-27): window blur and PgUp/PgDn
  called panic, which cut all the voices of all the parts; now they only release the keys of the
  keyboard. And the Chord/Root players restore their notes in the next bar if someone cut them
  (loading a preset, Reset, poly↔mono, switching the Seq on); changing the seed while running
  releases the notes first. Probe `probe-focus.mjs`.
- **Hanging note when changing part** (reported by the user, 2026-10-01: «I change part while I play
  and the audio gets corrupted, the instruments get interrupted»): the keyboard/MIDI note-off went to
  the CURRENT part, not to the one that received the note-on; the note was left hanging in the
  previous part (busy voice → voice stealing over the player; in mono, legato sliding over it).
  `NoteRouter` in `engine/parts.js` sends the off to the engines that received the on (also Layer and
  blur). `Seq.unhold` and `_monoOff` ignore foreign ids. Check «keyboard ↔ parts», 130/130.
- **Envelope curve**: caught by the user on first use — `setValueCurveAtTime` cannot be cancelled
  halfway in Chrome (hanging notes and the page crashing); now a chain of 12 ramps.
- **Verification tools**, today in `%TEMP%\subsdj-tools` (ephemeral: hence point 11):
  `run-selftest.mjs` (headless selftest + pings), `shot.mjs` (screenshot of a module by its title),
  `golden.mjs` (deterministic render with `Math.random` seeded before and after a refactor,
  sample-by-sample comparison at 16 bit), `probe-*.mjs` (probes of the real page: parts, players,
  scenes, hanging notes, levels per part, reverb energy) and `patch2.mjs` (exact multi-file
  replacements, all or nothing).

## Detail by block

### 1 · C1 Parts + mixer

**✔ DONE 2026-09-25** — selftest 106/106; details, measurements and evidence in DESIGN.md.

**Purpose.** To be able to get several instruments (presets) going at once. Without this, nothing
generative exists. It is not a multitrack: nobody writes notes.

**What we will do.**
- **Part** = a complete `AudioEngine` in the shared AudioContext, with its preset, its voices, its
  Arp/Seq/WaveSeq and its inserts (dist, flanger, chorus/ensemble). `init(ctx)` already accepts an
  external context and the selftest already instantiates several engines: four parts are four
  engines, not a rewrite.
- **Part Mixer**: per part, level, pan, send to delay and send to reverb. The output of each engine
  stops going to `ctx.destination` and goes to the mixer.
- **Shared delay and reverb** (a single room) → limiter → master → analyser. The preset's
  `reverbMix`/`dlyAmt` knobs are read as that part's send level.
- **The rack edits the selected part.** A 4-part selector in the header. The only indirection:
  `registry.applyTarget` and the ~14 references to the `engine` singleton in `ui/` go through
  «current part». Changing part = loading its snapshot into the controls (the same path as loading
  a preset). Keyboard and MIDI play the selected part.
- **With Parts off the synth is exactly today's.** Preset format intact.

**How (delicate points).**
- Configurable engine output (`init(ctx, out)`): today `analyser.connect(ctx.destination)`.
- A single BPM per scene (today it lives in the preset): it moves out to the scene along with the
  room.
- Global room: see open decision 1.
- CPU: 4 engines × `MAX_POLY`. Voices only exist while they sound, and at Mix 0 the vocal bank
  creates no nodes; the real cost is each part's inserts (always alive) and the reverb's two
  convolvers, which become a single shared one.
- UI modules that assume a single engine: SFZ (exports the selected part), recorder (captures the
  master, fine as it is), scope/spectrum (master), activity LEDs (selected part), MIDI learn (map on
  the selected part: acceptable in v1).

**Evidence.** Offline scene in the selftest: 4 parts with different presets, N bars of scheduled
notes; no NaN, no clipping, each part audible separately (mute the other three and measure the
peak). Screenshot of the selector and the mixer.

**Cost.** High: it is the architectural block. Done in one session.

### 2 · C2 Harmony + players

**✔ DONE 2026-09-26** — selftest 107/107; details, measurements and evidence in DESIGN.md. The five
players of the plan ended up as four modes: Chord with the part's Arp on IS the Arpeggio, and Root
with the Seq on IS the Phrase.

**Purpose.** Music playing without writing it: each part has a player that decides which notes to
play, and a global harmony makes everything they play fit together.

**What we will do.**
- **Harmony (global):** root, scale (major, natural/harmonic minor, dorian, mixolydian, major/minor
  pentatonic, whole tone, hirajoshi, blues…) and progression: a list of degrees with bars per chord,
  or a Markov walk over tonal functions (T→S→D→T with probabilities). Everything the players emit
  goes through `aEscala()` and `aAcorde()`. Why something random sounds musical: the pitches are
  constrained; density, register and rhythm do the rest.
- **One player per part**, with its own parameters:
  - **Pulse**: Bjorklund's Euclidean rhythms E(k, n) (k hits spread as evenly as possible over
    n steps: E(3,8) is the Cuban tresillo, E(5,8) the clave), rotation, probability per hit, accent
    (velocity). Kick, hat, percussion.
  - **Arpeggio**: our current Arp fed with the notes of the current chord (the player «holds» those
    keys); octaves and mode as today, plus a probability of skipping steps.
  - **Melody**: a random walk over the degrees of the scale with gravity towards the chord notes,
    probability of rest, step/leap ratio, constrained register.
  - **Drone**: sustains the root or fifth (one or two notes), changes with the progression,
    retriggers every N bars (so that the preset's attack is heard).
  - **Phrase**: our Seq with the root set by the current chord (the player provides the «held key»).
- **Scheduling**: the same pattern as Arp/Seq (25 ms ticker + 120 ms look-ahead on the audio
  clock). Each player only calls `_directOn(id, freq, vel, when)` / `_directOff` of its part:
  virtual fingers, the engine does not notice. A master clock in bars and beats derived from the
  scene's BPM.

**Evidence.** Selftest: E(k,n) reproduces known patterns; quantization: 100 % of the emitted notes
are in the scale; offline scene with players (deterministic with a seed, see C3) without NaN or
clipping. A/B pairs: same preset with Pulse player E(3,8) vs E(5,8).

**Cost.** High. Done in one session.

### 3 · C3 Arrangement and scenes

**✔ DONE 2026-09-26** — selftest 108/108; details, measurements and evidence in DESIGN.md. The
«density curve per part» ended up as an entry threshold per part over a single energy curve
(simpler to understand and to play); the sections come out of the thresholds on their own.

**Purpose.** For the music to evolve on its own on a scale of minutes (that is ambient: slow change,
long tails, sparse events) and for a good session to be repeatable and savable.

**What we will do.**
- **Master clock** in bars; **density curve** per part over a long cycle (e.g. 64 bars); **«energy»
  macro** that scales density, velocity and filter opening of all the parts; **mute/activate** parts
  with a probability per section.
- **Slow drift**: 1-2 parameters per part governed by an LFO of minutes (the hands of the improviser):
  cutoff opening, wavetable morph, reverb send…
- **Seed**: our own PRNG (mulberry32) for everything random in players and arrangement. Same seed =
  same session.
- **Scene** = seed + 4 presets + harmony + room + players + arrangement → exportable and importable
  JSON (like the preset bank). «New seed» button. The recorder already captures the master: recording
  ten minutes of ambient is pressing ⏺.

**Evidence.** Two offline renders with the same seed are identical sample by sample; with a
different seed they differ. Demo scene in the repo.

**Cost.** Medium. Done in one session.

### 4 · A2 Algorithmic plate reverb

**✔ DONE 2026-09-27** — selftest 110/110; details, measurements and evidence in DESIGN.md.

**Purpose.** The biggest «sounds fine». Our reverb is convolution with a noise IR generated by code:
the tail is static and grainy. An algorithmic reverb has an echo density that GROWS over time and
internal modulation that kills the metallic modes. It is the room where the ambient will live, and
what impressed most about the colleague's synth.

**What we will do.** AudioWorklet `plate-processor.js` with Dattorro's topology (1997, the lineage
of the Lexicon 224): predelay → input diffusion (4 allpasses in series) → figure-of-eight tank (two
cross-coupled branches: modulated allpass → delay → damping LP → allpass → delay) with feedback =
decay; L/R outputs as sums of different taps of the tank. Knobs: Mix, Size/Decay, Damp, Modulation,
Predelay. The convolution stays as an option «Hall (IR)» next to «Plate» (selector in the Reverb
module).

**Evidence.** Selftest with an impulse: the energy curve of the tail decays monotonically, the RT60
grows with Size, L and R decorrelated (correlation < 0.5), no NaN or unstable feedback at maximum
Decay. A/B pairs: same pad with IR vs plate. And listening, lots of listening.

**Cost.** Done in one session: ~150 lines of worklet + the integration into the Room; the lengths
are those of the paper and the calibration (RT60 and level) came from measuring, not from listening.

### 5 · B1 fmIndex as a matrix destination + operator feedback

**✔ DONE 2026-09-25** — selftest 105/105; the details and measurements are in DESIGN.md.

**Purpose.** Static FM is boring: the DX7 lives on the modulation index changing during the note.
With the index in the matrix: env→index = pluck and bell (bright attack, soft body); velocity→index
= the DX7's touch; S&H→index = a different bell per note. And operator feedback brings the sine
closer to a saw (the trick of the DX7's operator 6).

**What we will do.**
- `MX_DESTS` gains `fm` («FM index»), `MX_SPAN.fm` = index range; `Voice.mxRewire` connects the
  slot's gain to the worklet's `fmIndex` AudioParam (it already exists per voice, k-rate, clipped at
  0 by its `minValue`).
- Param `fmFb` (0..1) in the worklet: the modulator modulates itself with its previous output
  (`m = sin(2π·mp + fb·mPrev)`). **Feedback** knob in the FM module.
- FM module LED: active also if the matrix uses `fm`.

**Evidence.** Selftest: with env→index the spectral tilt of the first 100 ms is clearly higher than
that of the sustained stretch; with feedback the spectrum gains harmonics (tilt rises). Presets
«DX Bell (env→FM)», «DX E-Piano (vel→FM)»; pairs FM 1-4.

**Cost.** Low: one afternoon. Done.

### 6 · B2 «FM4» oscillator

**✔ DONE 2026-09-27** — selftest 116/116; details, measurements and evidence in DESIGN.md.

**Purpose.** Full FM as a SOURCE that then goes through our filter, vocal, matrix and wave
sequencing — what the DX7 never had. And to understand the «algorithms» once and for all: a directed
graph of who modulates whom; the leaves modulate, the roots sound.

**What we will do.** New wave type `fm4` in the worklet (as «Wavetable» was): 4 operators with
ratio, level, feedback and decay per operator; about 8 chosen algorithms (a stack of 4; one carrier
with 3 modulators in parallel; two pairs; two carriers with a common modulator; three carriers and
one modulator…) drawn as SVG graphs in a selector; the per-operator decay is what makes a modulator
shine on the attack and fade out (FM percussion, bells, e-pianos). A 2U «FM4» module with 4
columns. The current mode (sine + 2-op FM) is kept.

**Evidence.** Selftest: each algorithm sounds, differs from the others, no NaN at maximum index; the
decay of a modulator shows up as a fall in the tilt. Presets per family (bass, e-piano, bell, FM
kick, FM hat: the colleague's four instruments, as a demonstration).

**Cost.** Done in one session: ~90 lines in the worklet (algorithm table + 4-operator loop), 13 flat
params and the FM4 module.

### 7 · A3 Envelope curve

**✔ DONE 2026-09-27** — selftest 118/118; details and measurements in DESIGN.md.

**Purpose.** Attack and decay are LINEAR ramps in amplitude; loudness is logarithmic, so a linear
decay «hangs and then drops all at once». Analog envelopes are RC (exponential) curves and that is
why they sound natural. We already made the release exponential for this reason.

**What we will do.** Param `envCurve` (0 = linear, 1 = exponential) applied to the attack and decay
of amp and filter: `setValueCurveAtTime` with a power curve, or `setTargetAtTime` with the time
constant derived from the knob's time. **Curve** knob in the ADSR module; the envelope graph draws
the real curve.

**Evidence.** Selftest: the envelope measured on the VCA (RMS per window) follows the requested
curve; old presets (curve 0) do not change.

**Cost.** Low. Done in one afternoon.

### 8 · A4 Explicit BP and notch filter

**Purpose.** Two more filter types (the ones he has and we do not) and a demonstration: the sum of
the RBJ numerators of an LP and an HP with the same cutoff gives `1 − 2cos·z⁻¹ + z⁻²`, the
cookbook's notch. Our morph at 50 % ALREADY is a notch, at −6 dB.

**What we will do.** «Type» selector in the Filter module: **LP↔HP** (today's morph), **BP** (LP and
HP in series with the same cutoff: 4th-order band-pass) and **Notch** (LP + HP in parallel in equal
parts, with +6 dB of compensation). A structural change per note, like the slope.

**Evidence.** Selftest with Goertzel: in Notch the energy at the cutoff frequency drops more than
20 dB against that of a distant tone; in BP, the opposite.

**DONE 2026-09-28.** `filterType` (morph | bp | notch, per note). Measured (saw at C3, cutoff at its
4th harmonic, window 0.15-0.55 s): notch −39.0 dB at the cutoff against LP; BP +23.7 dB of cutoff
over fundamental; BP 24 dB +18.6 dB more than 12; morph 50 % / notch = RMS ×0.500 (the cookbook
demonstration, exact). In BP the resonance is shared out (half per slope); the notch ignores the
slope (in cascade the slopes arrive in phase at the cutoff). Preset «Phaser Pad (notch)»; pairs
FLT 1-6 (diffs 0.92 / 1.12 / 0.61). Selftest 125/125.

**Cost.** Low. Low priority.

### 9 · LFO with S&H and drift as waveforms

**Purpose.** Today the LFOs are native oscillators (sin/tri/saw/sqr). The two shapes most used in
ambient and techno are missing: **S&H** (random steps at the LFO's speed: the rhythmic «random»
filter) and **drift** (smoothed random, slow: pads that breathe). We already have the per-note S&H
in the matrix and the drift buffer of the Vocal module («Life»): it is a matter of generalizing
them.

**What we will do.** An alternative source per LFO: a looping `AudioBufferSource` with random steps
(S&H) or with the normalized sum of sub-Hz sines (drift) at the knob's speed, switchable with the
current shapes without touching the routing.

**Evidence.** Selftest: S&H→cutoff produces steps (derivative of the measured cutoff almost always
0, with jumps); drift has no jumps.

**DONE 2026-09-28.** Buffers shared per context (nodes.js `lfoBuffers`): S&H 128 steps, drift 5
sines with whole cycles (0.375…1.625 × f) normalized; looping `AudioBufferSourceNode` with
`playbackRate = Hz/10`; each LFO pours into `out` (±1) and Level and the matrix hang from there
(changing source does not rewire). Measured: S&H 73 % of 4-period windows still; drift maximum jump
14 % of the range; the matrix reads the shape (diff 0.51). Presets «S&H Lead (random filter)»,
«Breathing Pad (drift)», «S&H Bleeps (random pitch)»; pairs LFO 1-6 (diffs 0.40 / 1.23 / 1.38).
Selftest 129/129.

**Cost.** Low-medium.

### 10 · Rack skin (phase 3 of Roadmap 3.0)

**Purpose.** An identity of its own: SubSDJ recognizable at first sight, like the original one with
its screws.

**Decided (2026-09-28).** No skin engine (free CSS per selector: a maintenance tax × N skins);
THEMES BY TOKENS: the JS publishes the state of the control and the CSS decides how to draw it. Size
is not the theme's business (knob and `--rackU` are coupled; the scale is the browser zoom). Visual
reference: Cinescapes Pro (flat charcoal surfaces, value arc on the knob, two accents with meaning,
pill buttons, lowercase typography). Steps:

1. ✔ **Tokens** *(2026-09-28)*: a `:root` block in style.css (surfaces, ink, accents, knob, keyboard,
   faces with `color-mix()`, shadows, radii, font); canvas through `ui/theme.js`; check «skin» in the
   selftest (no literal outside `:root`/`[data-theme]`, except black/white with alpha). 121/121.
2. ✔ **Knob with published state** *(2026-09-28)*: knobs.js writes `--pos` 0..1 on the `.knob`; the
   CSS rotates the carrier `.ind` (line `::before`, dot `::after`) and paints the arc (`.knob::after`,
   conic-gradient + mask); tokens `--knob-line/-dot/-arc` at 0px switch each piece off. Check «skin: knob and slider publish --pos». 122/122.
3. ✔ **Theme selector** *(2026-09-28)*: a `<select>` in the header filled from the stylesheets (a
   theme = a `:root[data-theme="id"]` block with `--theme-name`; the base `:root` is the default
   theme); `data-theme` on html, localStorage, `?theme=` (shot.mjs: `THEME=id`), `theme-changed`
   event + `resize`. Check with an injected theme. 123/123.
4. ✔ **Themes «Cinescapes»** (base) **and «Classic»** (block) *(2026-09-28)*: Classic reproduces the
   previous look with tokens only (screenshots within ≤ 5 levels); Cinescapes = flat charcoal,
   cyan/violet, dot + arc, filled track (sliders.js publishes `--pos`), pills, lowercase. New tokens
   `--knob-face/-edge/-ring/-shadow`, `--track-face/-fill`. 123/123. Left as an optional whim:
   screws, a plate with the logo, animated LFOs.

**Evidence.** CDP screenshots in both themes and at several widths; no regression of ids or of
`PARAMS↔CONTROLS`.

**Cost.** Medium. Independent of everything: slotted in whenever we feel like it.

### 11 · Headless runner in the repo

**✔ DONE 2026-09-27** (along the way, with 13a): `tools/run-selftest.mjs` (exits with 1 if there are
failures) and `tools/shot.mjs` (module by title or a whole `screen:NAME`, with optional prior JS).
Path relative to the script; Chrome through the `CHROME` variable if it is not in the usual path.
golden/probes stay in temp.

**Purpose.** Verify without depending on Claude's session. Today the selftest is launched in
headless Chrome with two Node scripts that live in the session's scratchpad (ephemeral):
`run-selftest.mjs` (its own static server on 8001 that captures the pings, CDP through
`DevToolsActivePort`, prints results, failures and pair diffs) and `shot.mjs` (PNG screenshot of a
panel by the text of its title). Python is not on Git Bash's PATH, so Node is the way.

**What we will do.** Copy them to `tools/` with a note in DESIGN.md (`node tools/run-selftest.mjs
"selftest=1&demos=DLY"`). It is not a build: the project still has no dependencies.

**Cost.** Minimal.

### 13 · Screens and preset library (proposed by the user, 2026-09-27)

**Purpose.** The rack already has ~35 modules: on a 4K monitor it is all packed and zoomed out it
looks small and overwhelming. There is no need to see everything all the time. Three screens by
function, and real preset management.

**13a · Screens** ✔ **DONE 2026-09-27** — selftest 119/119 (check «screens»); section «Screens» in
DESIGN.md; screenshots of the three screens. What turned out different from the plan: the quick bar
lives in Design AND in Presets (save/delete/export/import are its buttons); a «Scene» notice in
Sequencing with Parts off (it explains and switches them on); the Presets screen debuts a v0 list of
the bank by sections fed from the `<select>` (13b will replace it with the library); the keyboard is
`position: sticky`. The plan was: tabs in the header: **Design** (creating sounds: Osc A/B, Mixer,
FM, FM4, Unison, Wavetable + editor, Vocal, Filter + character, LFOs, Filter Env, ADSR,
Voice · Master, Matrix, Distortion · Flanger, Chorus, Delay, Stereo, Reverb, Oscilloscope, Spectrum),
**Sequencing** (generating and automating music: Arpeggiator, Sequencer, Wave Sequence, Parts/Part
Mixer, Harmony, Player, Arrangement, and Delay/Reverb in their role as the shared Room) and
**Presets** (13b). A module can live on several screens: the screens are FILTERS over the same rack
(each `.panel` carries `data-screens="diseno secuenciacion"` and a CSS rule hides the rest), not
copies. The **keyboard** on all three, fixed at the bottom, for trying out and improvising; the quick
preset bar stays in Design. The tab is remembered in localStorage; LEDs, folding and the engine are
not touched. Evidence: screenshots of the three screens and a probe that checks that no module is
left orphaned (all of them on at least one screen).

**13b · Preset library** ✔ **DONE 2026-09-27** — selftest 120/120 (check «library», model over fake
storage); details in DESIGN.md («Recording, presets and arpeggiator» and Roadmap 4.0); screenshots
of the screen with a favorite and a filter. Different from the plan: dragging also reorders within
the section; the scenes are items of type «scene» in a normal section («Scenes»); importing MERGES
(never replaces) and accepts a library, a v2 bank or a scene; the quick bar lists the whole library
with ★ Favorites first (‹ › and Program Change skip that group). The plan was (one or two
sessions): today the management is a cramped selector and the presets live in three places: factory
(code), `subsdj-demos.json` / `subsdj-presets-2.0.json` (files) and the user's (localStorage). A
single LIBRARY (`subsdj.biblioteca.v1` in localStorage, exportable/importable whole as JSON) with
SECTIONS that are created, renamed and deleted; moving presets between sections, deleting, renaming,
favorites, search; the factory ones and the repo files as a SEED: they are imported into the library
the first time (and from a «restore from factory» button) and from then on the user rules: keep what
they like and throw away what they do not. A screen with a list by sections, preview on click (loads
into the part the rack is editing; the keyboard plays underneath) and drag to move. The quick
selector and MIDI Program Change step through the library. Evidence: selftest of the model
(create/move/delete sections and presets, import/export there and back, migration of the three
origins without duplicates) and a probe of the screen.

**Decisions, taken on 2026-09-27 (point 5 of «Open decisions»): delete with the ⟲ net, scenes as a
section, whole quick bar with ★ first.** They were: can the factory presets be DELETED from the
library (with «restore from factory» as a net) or only hidden? Do the scenes (`scenes/*.json`) also
go into the library, as their own section? Does the Design quick bar show the whole library or only
an «active» section?

### 12 · Old back burner (already in DESIGN.md)

- **Large visualizers**: the header's oscilloscope and spectrum (170×36) expandable when you need to
  see them properly (requested by the user «eventually», 2026-09-27).
- **Arpeggiator**: more divisions and swing.
- **«909 Kit» scene**: four percussion parts (kick, snare, hat, clap) with Pulse players E(k,n) —
  it all exists already (C1 + C2 + the presets of point 14); the scene remains to be composed.
- **SFZ exporter**: automatic loop points (today a sustainable note ~3 s + release).
- **Wavetable W3**: `f(x, t)` expressions that generate a family of coherent frames, and/or a
  harmonic editor (pure additive). Decision postponed.

## Roadmap 5.0 «cinescape» (agreed 2026-10-03)

Origin: Sergio, playing with the synth, does not get «sounds that grab your attention»: interesting
but classic timbres. He wants what you hear in films: long, deep, ambient, rich in textures.
Diagnosis (DESIGN.md, section Roadmap 5.0): three properties that the ear reads as «80s synth» —
global LFOs (everything moves at once), instrument time constants (attack ≤ 2 s, release ≤ 3 s,
LFO ≥ 0.05 Hz, room ≤ 4 s) and a spectrum that is always harmonic and stable. The tutorial recipe
(saw + square + unison + LP24 + reverb) is the classic factory pad.

| # | Block | What it gives us | Cost | Depends on |
|---|--------|------------|-------|------------|
| 1 | **Time ×10 + octave per oscillator** ✔ | the scale of the landscape: 20 s attack, 30 s release, LFOs of minutes, 20 s room, 4 s delay; sub-oscillator — DONE 2026-10-03 | low | — |
| 2 | **Per-voice drift + per-voice phase** ✔ | each note of the chord evolves on its own: source «Drift (voice)» + LFO selector global / per voice (deterministic Weyl phase) — DONE 2026-10-03 | low | 1 |
| 3 | **Shimmer + freeze in the Room** ✔ | the tail rises in octaves and turns into an ethereal choir (Eno/Lanois, BigSky); freeze = decay ≈ 1 with the input closed — DONE 2026-10-03 (loop calibrated by the reverb's energy) | medium | — |
| 4 | **Performance sources** ✔ | wheel, aftertouch and expression as matrix sources: the pad is PLAYED for 30 s — DONE 2026-10-03 (+ on-screen wheel under the keyboard) | low | — |
| 5 | **Resonators** ✔ | bowls, bowed metal, wind over strings: a modal bank per voice tuned to the note, Material string↔bar, noise boosted ∝ √Q — DONE 2026-10-03 | medium | 1, 2 |
| 6 | **Granular** | clouds of grains over the user table or the last recording (recorder): the only thing that never repeats — PARKED 2026-10-03 («for another time») | high | 1, 2 |
| 7 | **Tape on the master** ✔ | hiss + a few ms of wow + soft saturation over the whole mix: the degraded glue — DONE 2026-10-03 (Tape module, Room keys, exact at 0) | low | — |

**Agreed order:** 1 → 2 → listen → 3 (shimmer) → 4 → 7; 5 and 6 when time and decorrelation are
solved (without that they would also sound classic). A recipe to test the diagnosis with what is
already there: Layer with four parts (sine sub with drift · 7-voice supersaw LP 600 Hz + LFO
0.05 Hz + ensemble · noise with Vowel «u» and Life · FM4 bell with a long release), Plate at Size 4.

**1 · Time ×10 + octave per oscillator** ✔ **DONE 2026-10-03** — details in DESIGN.md. Summary:
ranges ×10 in log with `lmin` (position 0 = exactly 0), sliders that store the exact value, LFO
Speed from 0.005 Hz, Delay 4 s (`DLY_MAX`), Size 20 s (IR ~55 ms to generate; plate with the
RT60→decay table extended with measurements in Node between 1 and 15 s: 16.2 ↔ 0.93 · 21.8 ↔ 0.95 ·
26.3 ↔ 0.96), predelay 250 ms, `octA`/`octB` −2..+2 as a frequency ratio («Octave» stepper next to
«Stack»), `MAX_TAILS` 16 with a 350 ms fade. Four new checks (148/148), category «Cinescape»
(«Glacial Pad (12 s attack)», «Basement Drone (−2 octaves)»), pairs TIME 1-4 and OCT 1-2. Left out
on purpose: raising the reverb Mix ceiling (0.6; the levels are matched by measurement) and the
chorus/flanger Speeds (effects, not landscape).

**2 · Per-voice drift + per-voice phase** ✔ **DONE 2026-10-03** — details in DESIGN.md. Different
from the plan: the drift uses the LFOs' drift buffer (`lfoBuffers.drift`, mulberry32) and not
Vocal's `wander`; the per-voice phase is NOT random but the Weyl sequence k·φ (deterministic:
reproducible renders and SFZ, the selftest measures it), with an `lfoPhase` selector global/per
voice per note (bit-compatible by default); the per-voice LFOs are one-period buffers (an
OscillatorNode does not accept an initial phase), not PeriodicWaves. Measurements: corr between notes
1.000 global / −0.738 per voice (= cos 2π·0.618), drift 0.122, renders bit-for-bit identical;
151/151. Preset «Four Winds Pad»; pairs PHASE 1-2 and VDRIFT 1-2. Lesson: checks that measure
amplitude per voice must render at −12 dB or the Room's limiter couples the tracks. The plan was:
source «Drift (per voice)» in `MX_SOURCES` from a random offset and random phase per voice for the
dedicated LFOs.

**3 · Shimmer + freeze** ✔ **DONE 2026-10-03** — details in DESIGN.md. Different from the plan: the
loop gain is NOT fixed: it is calibrated against the reverb's energy (IR 0.07·Size because of the
ConvolverNode's normalization constant; plate measured in Node, table `PLATE_G`) so that the energy
per round trip is amt·0.8 — with a fixed gain there was no choir (each round trip lost ~9 dB; the
check caught it). Sine windows (not Hann) at half a turn: constant power. Freeze at decay 0.9995
(the worklet raises its ceiling to 1) and as a button, not a parameter; with the IR it is disabled.
Measurements: 440 → 880 Hz ratio 8710; tail at 3-4 s +14 dB (plate) / +30 dB (IR) with shimmer;
stable (7 s/2 s 0.006 / 0.125); frozen it holds 0.969 at 5 s; 155/155. Preset «Shimmer Pad»; pairs
SHIM 1-4. The plan was: a granular pitch shifter worklet (two grains with a Hann window and sawtooth
reading, +12 or +7 st) in a loop reverb → LP → shifter → ×amt → reverb; Freeze with decay 0.999.

**4 · Performance sources** ✔ **DONE 2026-10-03** — details in DESIGN.md. As planned: a
ConstantSource 0..1 per source and engine (`AudioEngine.perf`), `parts.setPerf` to all the parts,
`handleMidi` exported for the probe. Added: an on-screen wheel under the keyboard (it follows CC1).
Decisions: CC1/CC11 ALWAYS feed the source in addition to the mapping (factory CC1 → vibrato);
polyphonic aftertouch is treated like channel aftertouch (the source is per engine); 0 = rest.
Measurements: wheel → cutoff tilt ×5.4; aftertouch → pitch exactly 185.0 Hz; expression → amplitude
×0.200; synthetic MIDI → sources 1 / 0.504 / 0; 157/157. Preset «Performance Pad». No A/B pair
(they are gestures, they do not live in the preset): the evidence is the check. The plan was: wheel
(CC1), aftertouch and expression (CC11) as matrix sources; verification with a synthetic MIDI probe.

**5 · Resonators** ✔ **DONE 2026-10-03** — details in DESIGN.md. Different from the plan: a module of
its own (`engine/reson.js`, 6 bandpass biquads per voice after the Vocal), not a mode of the Vocal
nor Karplus-Strong combs (a loop with a native DelayNode has a minimum latency of 128 samples: it
does not tune above ~340 Hz). Material knob = log morph between string (harmonics) and free bar
(∝ (2n+1)²); Decay = Q 10→600; Bright with constant Σg². Finding: two input paths — tonal at 0 dB,
noise ∝ √Q — because the noise power that passes through a resonator is ∝ f/Q. Measurements: 2nd
mode 37× / 82× in its place depending on Material; selectivity ×1.1 (Q 10) vs ×19 (Q 600); bowl
with noise −15.7 dB; follows the glide (40×); 162/162. Presets «Singing Bowl» and «Bowed Metal»;
pairs RES 1-4. The plan was: a «resonator» mode of the Vocal bank (inharmonic ratios, high Q, noise
as the source) or a bank of Karplus-Strong combs per voice.

**6 · Granular** — a «grain» wave mode in the worklet (N grains reading the table with random phases
and Hann windows, density and pitch/pan scatter) or a granulator on the recorder's buffer. High
cost.

**7 · Tape on the master** ✔ **DONE 2026-10-03, revised after listening to it** — details in
DESIGN.md. In the Room (sum → tape → limiter): saturation tanh(x) with input 1 + sat² (up to ×2)
and treble loss, and wow (an 8 ms line with 'drift' wander at 0.8 Hz ≈ ±33 ct measured + flutter
6.5 Hz ≈ ±6 ct); both exact at 0 (wow at 0 adds no latency). Revision by Sergio's ear: the first
saturation (k = 2, ×3) crackled with three notes (intermodulation of the sub) → a soft curve and the
knob squared; the wow at ±7 ct could not be heard, nor at ±15 → ±33 at full (deliberately broken
tape) and the check also tests the knob's path (set live: 16.8 Hz, the same as being born at full;
suspected module cache in the browser: Ctrl+F5); the fixed hiss did NOT add anything → removed (the
per-note air is already the Noise knob). Check: 3rd harmonic 0.0019 / 0.0139 / 0.1035 at 0 / 0.3 /
1, level ×1.00; wow 16.8 Hz of sway at 440 Hz; 159/159. Preset «Tape Pad (nostalgia)»; pairs
TAPE 1-4. The plan was: noise at −50 dB, a modulated DelayNode of a few ms, soft tanh; in the Room.

## Roadmap 6.0 — under exploration (2026-10-04)

Origin: «how do we get richer sounds, with more texture?». Full context in DESIGN.md.

**Discarded: 1 · Grain** (the voice × noise of bandwidth B: tremor / rasp / breath stuck to the
harmonics). It was done in full (module, check, pairs GRAIN 1-8, two presets) and, after listening to
it: «it was not what I expected, nor what I was looking for». Removed from the code without a commit.
It answered «texture» as FINE grain (ms); what was sought was another scale. What was learned and
holds for whatever comes: the Room's limiter (−3 dB) comes BEFORE the master — a normal pad already
brushes the limiter, and any source with a high crest factor (multiplied noise, Gaussian peaks)
loses level there; to measure levels without it, lower `amplitude`.

**The direction sought: complex, stepped sounds** — the timbre moving in steps, with rhythm,
generated by an LFO or similar. Step 1 (in progress): «Stepped» presets with what is ALREADY there
(S&H, wave sequence, raw LFOs in the matrix, per-voice phase, tempo-synced delay) to hear how far
the current topology goes. Step 2 (pending until Sergio sees it clearly, do NOT plan yet): a
**Steps** module — lanes of different lengths (polymetre: 16·12·5 → LCM 240 steps), division and
value per step, as matrix sources; generalize what the wave sequence already does for wtPos. And a
tempo-synced LFO.

## What we will NOT do (decided)

- **Piano roll / timeline** with written notes: that is what DAWs are for and the SFZ is the bridge.
  The generative side is players, not scores.
- **Duplicating the rack per part**: the rack edits the selected part.
- **DAW-style multitrack sequencer** (a Roadmap 3.0 decision, still in force).
- **Seq phase 2** (ties, accents, quantization, step-record): only as a separate project. *Revised
  2026-10-17: accent, tie, slide and repeats come back as a proposal (Roadmap 7.0, 5.1, pending a
  decision); quantization and step-record stay out.*
- **A DAW** (decided 2026-10-17): no timeline, no multitrack, no regions, no per-track automation,
  no mixer with per-channel inserts. SubSDJ is an instrument for sound design and generation; songs
  are made in a DAW with the exported sounds (SFZ, WAV).
- **Acoustic piano** and **static sample generation** from the original synth: parked.
- **Discarded on 2026-10-25 by the criterion «it must bring something distinctive»** (the synth
  already covers it): **3.4 phase distortion** (its sweep is that of the filter or the wavetable
  morph, and its resonant shapes, those of the resonant filter and sync); **3.5 harmonic editor**
  (another way of drawing what the Wave Editor already draws); **4.2 plate with its own low end** (a
  touch-up, only if a flaw is heard); **4.3 phaser** (it overlaps with flanger, chorus and the notch
  with an LFO); **5.5 arpeggiator modes** (too little). **5.3 chained chords**: no date.
- **The keyboard stays**: it is the test bench for crafting a sound before saving it as a preset and
  using it in a scene.
