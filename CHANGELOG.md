# Changelog

One entry per published version, newest first; work that is done but not yet
published goes under «Unreleased». Numbering X.Y.Z: **Z** = fixes, **Y** = new
features, **X** = something saved stops loading or sounding the same (presets,
scenes, libraries, MIDI maps). The why behind each module is in
[docs/DESIGN.md](docs/DESIGN.md), the development notebook.

## Unreleased (will go into 1.5.0)

A new factory bank, thought out as a whole: fewer presets, every one of them with a job,
measured, and showing what the synth can do — classic sounds and its own. The plan, the
criteria and the triage of the old bank are in [docs/BANK.md](docs/BANK.md).

- **New factory bank**: 103 presets in 12 categories by use (Bass, Leads, Brass &
  Strings, Keys, Plucks & Bells, Pads, Cinescape, Motion, Percussion, Voice, FX &
  Textures) replace the 124 + 36 that had grown block by block. The classics every bank
  has (Moog bass, Juno and OB brass, DX e-piano, Solina strings, hoover, supersaw, the
  808/909 kit…) next to what only this synth does (per-voice drift, resonators, wave
  sequences, Steps polymeters, the talking chord, shimmer at the fifth). Nothing that
  sounds like something else in the bank: the selftest measures the distance between every
  pair of presets (spectral fingerprint) and the closest ones are the first thing it logs.
- **Every preset says how to play it**: a «play» line (register, note or chord, what the
  wheel and the macros do) shows as the tooltip in the preset picker and on the Presets
  screen, and tags (warm, dark, rhythmic, techno, fm…) that the search finds. In every
  preset the **wheel opens the filter** (the vowel on voices) and **Macro 1 is the
  character knob** (drive, FM index, resonance, pulse width, material…).
- **Measured, all of them**: each preset at −14 LUFS in its intended use (one note, a
  chord or a hit — hits by their peak), no clipping, no DC, the voice gone after the
  release; the factory batch of the selftest renders every one and the bank is tuned from
  its numbers (`tools/bank-level.mjs`). Every feature of the synth — every wave, filter,
  LFO shape, matrix source and destination… — is shown by at least one preset
  (`tools/bank-report.mjs` prints the table).
- **Your library follows the bank**: the untouched, unstarred copies of the old factory
  presets are replaced by the new ones — whichever version seeded them (a library from
  before 1.1.0 still carried the Masters of that day: «Restore factory» never updated a
  copy); anything you renamed, moved, edited or starred stays where it is. The same rule
  applies to a library file exported by an earlier version: File ▾ → Import brings in
  your own presets and your tweaks, and skips the untouched factory copies it carries. The whole old bank — factory, «Presets 2.0» and the four scenes —
  is archived in `subsdj-bank-1.4.json`: File ▾ → Import brings any of it back.
- **Scenes**: eight — Night Ambient, Dorian Dawn, Hypnotic Techno, Robot Choir and four
  new ones: **Berlin School**, **Dub Session**, **909 Kit** and **Deep Space** — and all
  but the kit reserve a part for you: a lead loaded, its player off, the keyboard goes
  there when the scene loads. The synth accompanies, you play.
- Fixed: a part whose player was set to «off» crashed the offline scheduler of the
  selftest (never seen live).
- Fixed: a Pulse player at **100 % probability lost hits** — one in eight at the bottom
  of the energy sway, more at low Energy — because the arrangement multiplied the knob
  by its own 75-100 % thinning. Now 100 % means every hit, whatever the energy; below
  100 % the energy thins only the uncertainty the knob already allows. (The Accent knob
  still plays the off-beat hits softer, and Energy still lowers every part's velocity:
  a quiet hit is not a missing one.)

## [1.4.0] — 2026-10-26

SubSDJ speaks English: the interface, the factory bank, the data it saves, the code and
the docs. Everything saved with earlier versions keeps loading and sounding the same.

- **SubSDJ is now in English**: the whole interface (labels, tooltips, the «?»
  help, messages), the factory presets and their categories, the sequencer
  phrases, the repo scenes, the A/B demos and the docs. Notes are named with
  letters (C D E…). Before, everything was in Spanish. The code, its comments, the
  development notebook (docs/DESIGN.md), the plan and the selftest are in English too,
  and a few files moved: `scenes/` (was `escenas/`), `docs/DESIGN.md` and
  `docs/GLOSSARY.md`; the headless selftest batches are `?batch=checks` / `?batch=factory`.
- **What gets saved is in English too**: presets, scenes, the library and MIDI
  maps now store their keys and values in English. Everything saved with
  1.3.0 or earlier — your library in the browser, exported files, scenes, MIDI
  maps — is translated when it loads and sounds exactly the same; your old
  library stays untouched in the browser as a copy. Factory presets you didn't
  rename get their English names; the ones you created keep the names you gave
  them. Files exported from now on don't open in 1.3.0.
- **The A/B demos leave the main library**: they are test pairs, not
  instruments. They can still be loaded with File ▾ → Import
  (`subsdj-demos.json`).
- **Wave Editor**: with a narrow window (the instrument scaled below 1), its
  toolbar wrapped its last button onto a second row; now it always fits on one.

## [1.3.0] — 2026-10-25

More expression and new sounds, and a polishing pass. Two new sources (the
plucked string and hard sync), a sequencer that articulates like a 303, swing,
a delay that runs away, macros and touch response; a picker to find presets in
a moment; and the whole factory bank audited: no DC, no clicks and no limiter
pumping in normal use.

**Sound different** (on purpose, the way they always should have):
- **Cleaner sound**: all 124 factory presets audited in their normal use (none
  pushes the limiter or clicks). The ones carrying DC offset — every narrow
  pulse or PWM preset, up to 61 % of their level — no longer do: the pulse
  comes out centered and every part is AC-coupled, like the output of an
  analog synth. More headroom, and symmetric echoes and tape saturation.
- **Glide** (Mono portamento in legato): it started sliding from the beginning
  of the note; now it slides when the next note arrives.
- **Scenes**: «Dorian Dawn», «Robot Choir» and «Hypnotic Techno» sounded
  ~10 dB quieter than the rest; now they reach the same peak (−4 dBFS) without
  touching the limiter.

New:
- **String**: a new source, the «String» wave (on both oscillators), which
  models a plucked string (Karplus-Strong): every note is a pluck, and the
  string dies away on its own, the treble going before the fundamental. String
  module with Bright, Decay, Position (near the bridge, metallic; in the middle,
  round) and Stiffness (from guitar string to piano and bell). Velocity is the
  strength of the pluck. Factory category Plucked Strings (nylon, twelve-string,
  harp, koto, bass, string piano and string bell) and A/B demo pairs STRING 1-6.
  The Wave Editor got narrower to make room.
- **Hard sync** on Osc A («sync» button in its header): A restarts its cycle
  with every cycle of B. B sets the note (it can sit at level 0) and A's pitch
  becomes timbre: sweep it from the matrix («Pitch A» from the envelope, an
  LFO, Steps, the wheel or a macro) for the classic scream of sync leads.
  «Pitch A» no longer moves the master. Demo pairs SYNC 1-4.
- **Sequencer articulations**, as on a 303: **accent** (Shift + click on a step:
  louder, and the «Accent (Seq)» matrix source so the preset decides what it
  does — open the filter, more drive…), **tie** and **slide** (Alt + click: the
  note carries on without a new attack, or glides to the next) and **repeats**
  (Ctrl + click: the step fires 2, 3 or 4 times). Four new phrases that use
  them and demo pairs ART 1-2.
- **Runaway delay**: feedback has its own knob (**fdbk**, up to 110 %),
  separate from Amount, which is now only how much goes into the echo. Above
  100 % the echo grows until the tape saturation in the loop holds it and it
  keeps ringing on its own — move Time and the pitch slides, as in dub.
  **sat** dirties every repeat. Older presets sound the same (they get the
  feedback they had). Demo pairs DUB 1-4.
- **Swing**, global (at the foot of the Arpeggiator; saved like the BPM): the
  second eighth or sixteenth of each pair arrives late, from straight (50 %) to
  dotted (75 %), in the arpeggiator, the sequencer, the Steps and the players
  all at once.
- **Breathing pulse**: the Player's Pulse gains Breathe and Cycle — the hits
  rise and fall on their own bar by bar, and the rhythm fills up and empties.
- **Notes by degree** in the sequencer (selector next to the phrases): the
  numbers can be degrees of a scale instead of semitones — the same phrase plays
  in major, dorian or pentatonic without rewriting it —, or follow the scene's
  harmony in Parts mode. Three new «by degree» phrases and demo pairs DEG 1-2.
- **Macros**: two knobs, macro 1 and macro 2, at the foot of the Matrix, saved
  with the preset and usable as matrix sources. With the same macro on several
  slots, a single control opens the filter, raises the drive and the resonance
  at once, each destination by its own amount; with MIDI map, from a hardware
  knob. Demo pair MAC 1-2.
- **Touch response**, in the keyboard bar: **Touch** (soft · linear · hard),
  the velocity curve of your MIDI keyboard and the mouse, remembered in the
  browser; and **Bend**, the pitch bend range (±1 to ±24 semitones), saved
  with the preset (before, a fixed ±2). In Parts mode, each part has its own.
- **Output meter** in the Output module, next to the spectrum: L and R peaks
  of what comes out (yellow from −12 dBFS, red from −1, the limiter ceiling),
  the limiter's gain reduction and the **lim** LED, which stays lit once the
  limiter has worked (click to clear it). The data comes from the limiter itself
  every 50 ms.
- **Welcome window**: on opening, a window over the instrument (visible behind
  it, switched off) with a small demoscene screen — interfering plasma and the
  name in copper bars —, the version and its date, and the **ENTER** button (or
  Enter), which also starts the audio. It opens again as «About» by clicking
  the title in the header or from File ▾.
- **New preset picker** in the header, replacing the drop-down: a search box
  (ignoring accents and case), the categories on the left with how many
  presets match in each (All, ★ Favorites and every section) and the list on
  the right. A click or `↑` `↓` loads a preset to audition it without closing;
  `Enter` or a double click picks and closes; ★ marks favorites; and **Browse
  all** opens the Presets screen with the same search.
- **Computer keyboard**: its octave is now separate from the on-screen
  keyboard's. They used to be the same, and since the on-screen keyboard shows
  six octaves and stops at C9, the top row got stuck at E5. Now Z goes from C0
  to C7 (the top row reaches C9) and the on-screen keyboard scrolls to show it.
  By default, Z is C3 and Q is middle C (before, Z was C2).
- **On-screen keyboard**: dragging across the keys with the mouse button held
  plays them (glissando); before, only the first one sounded. The black keys
  are centered between their two white keys (before, they imitated the offset
  of an acoustic piano).

Fixes:
- **Delay Time**: moving it abruptly (a MIDI knob, changing division or BPM)
  gave a scrape; now it sweeps like tape. The other knobs were audited: none
  clicks when moved abruptly with a note playing.
- **Parts**: with Parts on, the Player spilled into the Arrangement panel in
  all its modes, and the Part Mixer cut off each part's M and the «Layer» box.
  The part's arrangement (enters · Drift · amount) moves to the Arrangement
  panel, as a row for the part the rack is editing; the M sits next to each
  strip's name.
- **Note events**: voice stealing, Panic and repeating a key during its release,
  audited: no clicks.
- Demo bank: pairs MAC, SYNC, STRING, DUB, ART, SWG and DEG to hear each change;
  new checks in the selftest (216).

## [1.2.0] — 2026-10-24

More instrument: movement in tempo (a common clock, tempo-synced LFOs, Steps, a
looping envelope), a drive with more characters, a Minimoog-style mixer and a
workshop to design without fear (undo, compare). Several things come from the
review @tacowars did.

**Sound different** (on purpose, the way they always should have):
- **2-operator FM (Sine wave with Index)**: the modulator's phase was
  randomized on every note, so every note came out with a different timbre —
  on «DX Bass», six C4s in a row varied by almost 8 dB. Now it starts aligned
  with the carrier, like FM4 and like a DX7: every note the same. «FM Bass» is
  a little darker in the upper register.
- **Global LFOs**: with nothing playing they stopped, and the next note picked
  them up where they had stopped; now they always run, so the phase a note
  starts with depends on when you play it, as on a hardware synth. If you want
  every note to start the same, use the «retrig» phase (new, below).
- **Cleaner wavetable**: less noise between harmonics (especially in the middle
  register) and a little more brightness up top.

New:
- **Minimoog-style mixer**: Osc A, Osc B, Ring and Noise, each with its own
  level. Raising one doesn't lower the others: they add up, and with Drive they
  saturate harder (the trick of opening up the Minimoog's mixer). Older presets
  are translated automatically and sound the same.
- **Drive with character** (Filter module): *soft* (the usual one) or *fold* —
  as Drive goes up the wave folds over itself and harmonics appear, rise and
  fall again (West Coast synthesis) —, and **Asym**, which adds even harmonics
  (the body of a tube); on fold, at full, you hear the octave.
- **More matrix destinations**: the mixer levels (an LFO that lowers A while
  raising B blends one wave into the other: vector synthesis), the Drive, the
  pitch of oscillator A alone and the resonator's Material.
- **Common clock**: arpeggiator, sequencer and the Parts' players on the same
  grid. Two arpeggios in two parts land together, and a part with an
  arpeggiator played by a player starts on its beat, not wherever it falls.
- **LFO in tempo**: each LFO can be synced to the BPM (from 4 bars to 1/32,
  with dotted and triplet values), with its cycle on the grid. And the phase
  has two more modes: **retrig** (each note starts its LFOs from the beginning)
  and **once** (they run one cycle and stay: an LFO acting as an envelope).
- **Mod Env** (Sequencing screen): a free envelope for the matrix, separate from
  the filter's, in *normal*, *loop* (attack and decay repeated for as long as
  the note lasts: timbre rhythms tied to each note) or *trigger* mode (the
  whole curve even if the note lasts an instant).
- **Steps** (Sequencing screen): four lanes you draw with the mouse, each with
  its own length (up to 32), division, smoothing, rotation and drift. They are
  matrix sources: continuous («Steps 1») or fixed per note («Steps 1 · note»,
  each note of an arpeggio with its own color). With different lengths
  (16 · 12 · 5) they take 15 bars to line up again — the panel tells you —; a
  lane on Amplitude is a *trance gate*.
- **Undo and redo** (Ctrl+Z, Ctrl+Y, ↶ ↷ in the header): by gesture, with what
  it undoes in the tooltip; it doesn't cut the notes that are playing.
- **Compare with the saved preset**: ● next to the preset when what you hear is
  no longer what was saved (it goes out if you put it back); «Compare» toggles
  between the saved preset and your edit.
- **Velocity with the mouse**: on the on-screen keyboard, how high on the key
  you click is the strength.
- **Export SFZ**: the velocity layers are decided by measuring the sound, so
  presets whose velocity changes the timbre through the matrix, the FM4
  operators or the distortion export their touch (45 of 117 factory presets,
  30 before). Exporting twice gives exactly the same result.

Fixes:
- **Computer keyboard**: Ctrl+Z no longer plays a C, Shift between pressing and
  releasing no longer leaves a note hanging, and the keys go by position (the
  piano stays in place on AZERTY or Dvorak). A cancelled touch on a touch screen
  no longer hangs the note.
- **Parts**: changing the BPM only reached the part you were editing; the
  arpeggiator, sequencer and wave sequence of the others kept the old tempo.
- Demo bank: pairs MIX, DRV, VEC, LFOT, PHASE, ENVM and STEPS to hear each
  change; new checks in the selftest (194).

## [1.1.0] — 2026-10-14

Ideas from @tacowars, who tried it out, fixes that came up while doing them, and
a cure for «dirty» chords.

- **Clean chords: headroom on the master.** A pad chord hit the output limiter
  4-8 dB above its ceiling: it clipped the whole sustain and its gain pumped with
  the beating of the detuned oscillators (the «dirty, wobbly» chord). Now there
  is a fixed −9 dB of headroom before the limiter, calibrated with the 103
  factory presets: 9 out of 10 hold an open four-note chord without touching it.
- **Matched loudness in the factory presets.** The headroom is for chords; a
  bass or a lead, played one note at a time, ended up quiet. Every preset now
  comes with a Master measured to sound at the same loudness (about −14 LUFS) in
  its intended use — one note for basses, leads, percussion and effects; a
  three-note chord for the rest — without that use reaching the limiter. Those
  with an initial hit far above their body (plucks, percussion) are as loud as
  they can be while staying clean. Percussion goes up as a block: the balance
  of the kit doesn't change. Your saved presets keep their Master.
- **Master up to +12 dB and before the limiter**: lowering it leaves headroom
  (clean) and raising it pushes the limiter (louder and compressed). It reads in
  dB. Before, it came after, only reached 1 and lowering it didn't relieve the
  limiter.
- **Trigger in Mono** (Voice module): what happens when a note arrives while
  another is still held. *Legato* slides the voice without retriggering
  (trills, the 303 glide); *Retrig* always retriggers: envelopes, pitch env and
  FM4 operators start again, and the old note fades while the new one's attack
  rises. Separate notes retrigger in both.
- **Arpeggiator and sequencer in Mono retrigger every step**. Before, at fast
  tempos (1/16) the steps tied by accident and only the first one's attack
  sounded: the step's note-off went by timer and arrived after the next note-on,
  which is scheduled ahead. Now note-offs are scheduled on the audio clock and in
  order, so it only ties with Gate 1 (and Trigger on Legato).
- **Per-operator velocity in FM4** («vel» column): each operator's level scales
  with how hard the note is played, like the DX7's *key velocity sensitivity*.
  On a modulator that is the index: playing harder opens harmonics, not just
  volume. The preset «FM4 · Paired E-Piano» already uses it (at velocity 1 it
  sounds as before). You need a MIDI keyboard.
- **Yamaha-style FM4 algorithm graph** under its selector: carriers at the
  bottom on the output line, modulators above, a feedback loop on op 4 (it lights
  up with Feedback).
- **Arrangement — scheduled notes (arp, sequencer, Parts players)**: if the
  envelope was already in its sustain, the scheduled note-off made the gain fall
  in a straight line from the end of the decay, abruptly when it was scheduled.
  The players' long notes died away too early; now they hold their sustain until
  their note-off, so **scenes sound a little different** (the way they always
  should have).
- **Arrangement — gate shorter than the look-ahead**: the note-off came before
  the note actually started and some short hits from the players (Pulse with a
  low gate) came out silent. Now the note-off is shifted by the same amount as
  the start.
- **Output display on two lines**: on top, the parameter and what the chosen
  option means (or why it does nothing); below, in large type, a short value
  («3 · 2·3·4→1» instead of the whole tooltip). Whatever doesn't fit shrinks its
  type and, if even that fails, scrolls slowly like a synth LCD. Before, a long
  value took over the whole box, parameter name included.
- The default skin is now called **Carbon** (before, «Cinescapes»; the saved
  choice is kept).
- Demo bank: «Trig» and «FMV» pairs; three new checks in the selftest.

## [1.0.1] — 2026-10-12

- **Link preview card**: Facebook, LinkedIn, WhatsApp or X show a title, a
  description and a picture of the panel (Open Graph tags). Before, the card was
  empty. «Link card» check in the selftest.

## [1.0.0] — 2026-10-12

First published version. What it brings:

- **Source**: two oscillators with their own octave, mix, colored noise, unison
  with analog drift, 2-operator FM with feedback, 4-operator FM (8 algorithms),
  a wavetable with a freehand editor and Wavestation-style wave sequencing, and
  a Vocal formant module with a glottal source.
- **Voice**: modal resonator (string ↔ bar), LP/HP/BP/notch filter with slope,
  keytrack and drive, ADSR envelopes with a linear ↔ RC curve and hits (flam)
  for percussion, mono with glide or polyphonic.
- **Modulation**: an LFO bank (sine, triangle, saw, square, S&H and drift) with
  fade-in and global or per-voice phase, a 6-slot modulation matrix and
  performance sources (wheel, aftertouch, expression).
- **Effects**: distortion, flanger, chorus/ensemble, tape delay, hall
  (convolution) or plate (Dattorro) reverb with shimmer and freeze, tape on the
  master (saturation, wow and flutter), stereo width and a limiter.
- **Music**: arpeggiator, step sequencer with a bank of phrases, four parts with
  a mixer and a shared room, harmony, generative players, arrangement and
  scenes.
- **Library** of presets and scenes with sections, favorites, search, import and
  export; factory presets by category (808/909 percussion included) and an A/B
  demo bank that lets you hear every improvement.
- **Interface**: a fixed panel that scales as a whole to the window, Design,
  Sequencing and Presets screens, themes, oscilloscope and spectrum, and the
  controls that do nothing with the current settings dim and explain why.
- **MIDI**: velocity, pitch bend, sustain, Program Change and MIDI learn per
  device.
- **Export**: recording to WAV and the preset as an SFZ instrument.
- **Selftest** in the browser (`?selftest=1`) that renders every preset and
  measures every module: 173 checks.
