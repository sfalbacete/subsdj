# SubSDJ · design and development notebook

A **real-time** recreation of the old SubSDJ (a subtractive soft-synth made in VB.Net)
with HTML + the native **WebAudio API**. No dependencies, no build.

This document is the **why** of each module: how it works, what was tried and
discarded, and with which measurements it was validated, in the order it was built. To
use the synth the [README](../README.md) is enough; the state of the plans is in
[PLAN.md](PLAN.md) and the changes per version in the [CHANGELOG](../CHANGELOG.md).

## Getting started

ES modules and the AudioWorklet **do not work from `file://`**: you have to serve over HTTP.

```
node tools/serve.mjs        # from the repo root
```

→ <http://127.0.0.1:8000/>. The AudioContext starts suspended and resumes
with the first gesture (key or click). `tools/serve.mjs` serves with
`Cache-Control: no-store`: **use this one and not `python -m http.server`** to
develop. Python sends no cache headers and the browser applies heuristic
caching to ES modules (fresh for 10 % of the time since the last
modification), so after editing the engine you could keep hearing the `Room.js`
from an hour ago even if you reloaded — it happened with the tape (block 7): three
versions of the wow and the ear kept hearing the first one. If you use another server,
reload with Ctrl+F5 after every change.

## Versions and publishing

The version lives in `js/version.js` (`VERSION`), it is shown next to the title and the
selftest checks that it matches the first entry of the CHANGELOG.
X.Y.Z numbering: **Z** = fixes; **Y** = new features; **X** = something
saved stops loading or sounding the same (presets, scenes, exported
libraries, MIDI maps).

Development lives in a private repo (folder `WebAudioAPI/synth_test`) and
this public repo receives that folder with its history via `git subtree`. To
publish, from the root of the development repo and with the `subsdj` remote:

```
git subtree push --prefix=WebAudioAPI/synth_test subsdj main
git tag subsdj-vX.Y.Z $(git subtree split --prefix=WebAudioAPI/synth_test)
git push subsdj subsdj-vX.Y.Z:refs/tags/vX.Y.Z
```

Beware of editing directly in the public repo (for example a file from
the GitHub web UI): that commit is not in the development history and the
next `subtree push` is rejected (it is not a fast-forward), and a `subtree pull`
doesn't work either («unrelated histories»: there was never a `subtree add` here). What was
done in 1.2.0 (a CHANGELOG fix made on the web that was already
here too): record that commit with a merge that changes nothing, with the
markers git-subtree recognizes, and publish the split, which already includes it:

```
git merge -s ours --allow-unrelated-histories <web-commit> -m "…

git-subtree-dir: WebAudioAPI/synth_test
git-subtree-mainline: <previous HEAD>
git-subtree-split: <web-commit>"
git push subsdj $(git subtree split --prefix=WebAudioAPI/synth_test):refs/heads/main
```

If the web change were NOT here, it has to be copied by hand first. The
simple thing is not to edit in the public repo.

GitHub Pages serves with about 10 minutes of cache: right after publishing,
a normal reload can mix old and new modules (Ctrl+F5). To
check the published version, the selftest against Pages:
`BASE=https://sfalbacete.github.io/subsdj/ node tools/run-selftest.mjs`.

## Self-test

→ <http://127.0.0.1:8000/?selftest=1>

It renders **every factory preset** in an `OfflineAudioContext` (C3+G3 chord,
1 s of note + release tail) going through the same path as a real preset
(UI controls → engine state), and checks:

1. that all the preset's keys exist in the control registry (typos),
2. that the render contains no NaN/Infinity,
3. that it is not silence (peak > −40 dBFS),
4. that there is no clipping (peak ≤ 0 dBFS),
5. that there are no duplicate names in the bank.

Also: v1→v2 preset migration (static check), **neutral Reset** (every module
at 0, filter open and flat, gate; each factory preset over `PRESET_BASE`) and a
**16-note stress test** that exercises voice stealing (`MAX_POLY`) and tail
trimming (`MAX_TAILS`).

Results in an on-screen panel, in the console (`console.table`) and in the tab
title (`✓ SELFTEST 52/52`). **Use it before and after touching the engine.**

Without opening the browser: `node tools/run-selftest.mjs ["selftest=1&demos=DLY"]` launches
headless Chrome over CDP with its own static server (8001), waits for the «done» ping
and prints a summary, failed rows with their reason, demo pairs (diff and peaks), measurement
logs and JS errors; it exits with 1 if anything fails. Only Node ≥ 22 and Chrome (path via the
`CHROME` variable if it isn't the usual one). It runs in TWO BATCHES (`?batch=checks` and
`?batch=factory`), each in a new Chrome, and adds them up: hundreds of OfflineAudioContexts
in a single page hang it without an error (neither the timers nor the debugger
respond; with the string and the sync it got stuck around render ~330), because each one
drags its worklet's thread along and it isn't released in time — calling `gc()` every 5
renders (Chrome with `--expose-gc`) didn't fix it. If a page stops answering,
the runner says so and counts it as a failure, instead of waiting forever. In the
browser, `?selftest=1` without a batch does everything in a row (it may not reach the end).

## Recording, presets and arpeggiator

- **Record** (header): records the output (the same thing that is sounding) and when stopped
  downloads a 16-bit stereo **WAV** with the date and time in its name.
- **Preset Library** (Presets screen; `engine/library.js`): ONE source
  of truth for presets and scenes, in sections that you create, rename,
  reorder and delete; items load with one click, move by dragging
  (to another section or to another position), are renamed inline, are marked ★
  (they appear in «★ Favorites» of the quick picker) and are deleted; search ignores
  accents and case. The header's **quick picker**
  (`ui/presetPicker.js`) replaces the dropdown, which with 300 presets in 16
  sections could no longer be browsed: a search box, categories with how many match in
  each and the list; a click or ↑ ↓ loads without closing (to AUDITION: after the
  click the focus leaves the search box and the PC keyboard plays notes again),
  and Esc closes it without a panic (keyboard.js asks first with the
  `escape-first` event). It lives entirely in localStorage (`subsdj.biblioteca.v1`).
  The factory (code), the repo banks (`subsdj-demos.json`,
  `subsdj-presets-2.0.json`), the scenes in `scenes/` and the old user
  presets are SEED: they come in the first time and from then on you are in
  charge. **⟲ Restore factory** puts back only what is missing: what was deleted returns to its
  section; what was renamed, moved or tweaked is not duplicated (every seeded item
  keeps its `origen:nombre` key, and the same name with the same content
  never comes in twice, wherever it comes from).
- **💾 Save**: into «★ Mine», or over the loaded preset if the name is
  its own. **⇩ Export / ⇧ Import** (preset bar): the whole library
  as JSON; importing merges (sections by name, no duplicates,
  never replaces), and loose v2 banks also come in (into «Imported», with
  the keys validated and the v1 ones migrated) and scenes (into «Scenes»). ‹ › and
  MIDI Program Change walk the library in order, without the ★ group (which
  would repeat).
- **🎹 SFZ** (preset bar): freezes the current preset as a reusable **multisample
  instrument** in a DAW or tracker. It renders offline C1–C7 every
  4 semitones (and 2 velocity layers if the filter envelope scales with
  it), trims silence, normalizes globally and downloads a zip with
  `samples/*.wav` + `.sfz` ready for Sforzando, Renoise, TAL-Sampler…
  Reverb and delay are **not** baked in (add them in the DAW); no loop points in
  this version (sustainable note ~3 s + full release).
- **`subsdj-demos.json`** (project root): evidence bank, seeded into the
  «A/B Demos» section of the library (`subsdj-presets-2.0.json`, into «Presets
  2.0»). Every
  engine improvement comes in with an A/B pair — identical presets except for the
  new parameter — to hear exactly what it brings. It grows with each block of improvements.
- **Arpeggiator** (its own panel): hold notes down and it sequences them at the BPM of the
  FX panel. Modes Up/Down/U·D/Rnd, division ¼/⅛/1/16, 1–3 octaves and a Gate knob.
  Steps come in with audio-clock precision (120 ms look-ahead).
- **Scenes** (`scenes/*.json`, Parts mode): the complete scene — room,
  harmony, arrangement, the 4 players and the 4 presets with their mix — as JSON.
  ⇧ Scene in the Arrangement module or a click in the «Scenes» section of the
  library loads it (it turns Parts on if needed); ▶ Play in Harmony, or
  the scene's ▶ in the library, starts it. Four in the repo: **Night Ambient** (D
  minor, 72 bpm: pad, sub, DX bell and hat coming in by energy), **Dorian
  Dawn** (F dorian, 84 bpm: wavetable Vowel Choir with the morph drifting,
  Creamy Bass, FM Glockenspiel and Music Box), **Hypnotic Techno** (A
  pentatonic, 126 bpm: a kick that drops out in the valleys, Acid 303 whose Seq phrase
  is transposed with the chord, arpeggiated Wavestation, hat E(7,16)) and
  **Robot Choir** (D hirajoshi, 66 bpm, harmony by functions: the whole
  Vocal module — Madrigal, Glottal Voice, Talking Robot and «ka» Vocal Percussion).

## Fixed panel, screens and header

The synth is a **fixed-size instrument**, like a physical one: an object of
1920 × 1000 px (`#inst`) that is scaled WHOLE to fit in the window —
`zoom = min(width/1920, height/1000)` (`ui/frame.js`). Nothing reflows: every
module is always in the same place, the resolution only changes the size
(on a 4K screen at 150 % it comes out at 130 %; on a 1366 × 650 laptop, at
65 %). Below 60 % it doesn't shrink any further (the knobs could no longer be
played) and the scroll appears. CSS `zoom` is used (standardized in Chrome
128), which does the layout at real size: sharp text and borders.
`getBoundingClientRect` gives the on-screen size and `clientWidth` the design
size, so the canvases draw in design px with a backing store of
dpr × zoom (`fitCanvas`) and pointers go from screen to design
by dividing by `uiZoom()`. And no canvas contributes a size of its own (`contain: size`):
if its box took the backing store as its natural width, every redraw would
enlarge it ×dpr×zoom until it blew up — it happened with the sequencer on a 4K at
150 % (×1.95 per redraw) and it is watched by the «canvas» check, which triples the
backing store of every visible canvas and demands that its box doesn't move.

Before, it was an `auto-fill` + `dense` grid: the number of columns came
from the window width and each module fell into the cell its order
gave it, so it changed place with the resolution; and each row was as tall as
its tallest module (FM4, the matrix), with a lot of empty panel and scroll.

**How it is laid out.** Each tab is its own fixed panel
(`<div class="screen" data-screen-body="…">`) made of fixed-height BANDS,
with sections separated by a silkscreen line. Sections take the size of
their content and `.grow` shares out what is left over: no stretched empty
cells. In **Design** the bands follow the signal from left to right and
from top to bottom:

- **Source** — Osc A · Osc B · Mixer · Unison · FM · FM4 · Wavetable ·
  Wave Editor. The engines that don't apply to the chosen wave (FM without
  «Sine», FM4 without «FM4», the wavetable without «Wavetable») are dimmed IN PLACE: nothing
  appears or disappears moving the others.
- **Voice** — Vocal → Resonator → Filter (with its character: type, slope,
  keytrack, drive) → Filter Env → Amp Env → Voice · Master → **Output**.
- **Modulation | effects** — the LFO bank and the Matrix; then the
  effects in the real order of the chain: Dist · Flanger → Chorus → Delay →
  Reverb → Tape → Stereo.

What lived in LFO modules without being an LFO went back to its natural place: P.Width
to Mixer, Amplitude and ±Cents to Voice · Master, Width to Stereo (and the autopan is
the Pan row of the bank). **Sequencing**: Arpeggiator · Sequencer · Wave
Sequence · Output; Part Mixer · Delay · Reverb · Tape (the room); Harmony ·
Player · Arrangement. With Parts off their modules stay in place,
dimmed, and the empty mixer says how to turn them on. **Presets**: the
whole library (`ui/libraryScreen.js`): sections in columns with their
own scroll, one click loads, ★, rename, drag, delete, accent-insensitive
search, «★ only» and ▶/⏹ on the scenes (it loads, turns Parts on and
starts; only one at a time).

**Shared.** Output, Delay, Reverb and Tape are in Design (the preset's
effect) and in Sequencing (the scene's room: with Parts they carry the
label «room» and only the sends belong to each part). They are not copied: they carry
`data-slot` and each screen declares its slot (`data-slot-host`); when changing
tab `ui/screens.js` MOVES the same node to the slot of the one being shown
(controls, canvases and listeners intact).

**Hardware controls.** Besides the knob (and its big version, the Cutoff, and
small one, the banks') there are three:

- **Rotary selector** (`.seg.rot`, `ui/rotary.js`) for everything that has
  three or more positions: wave, Octave (in feet, like the Minimoog's RANGE:
  32' 16' 8' 4' 2'), Stack, unison voices, FM4 algorithm (with its graph
  underneath), filter type, delay sync, shimmer interval, modes and
  divisions of the arpeggiator, the sequencers and the player. Click on a
  position = choose it; drag the knob = sweep through them; click on the knob = the
  next one.
- **Switch with LED** (`.seg.tog`) for two-state things: Poly/Mono,
  12/24 dB, Chorus/Ensemble, Hall/Plate, filter env times, LFO
  phase, Off/On of the sequencers…
- **Vertical fader** (`.slider.fader`) for the two envelopes, as on the
  Juno or Jupiter: they are time bars and vertically they take a quarter of the
  width. It is the same `<input range>` from `ui/sliders.js` stood upright with
  `writing-mode`: it keeps the exact value.

Selector and switch are the same old `<button data-…>` of a `.seg` with
another face: `bindSeg`, the registry, MIDI learn (zones) and the presets don't
notice. Octave and Stack went from stepper to selector and `bindSeg` learned
to store numbers (`num`): presets still carry `octA: -1`, not `"-1"`.
The **banks** (LFOs, FM4 operators) carry the label once per column
and once per row, like a mixing desk: same column = same control; each row
of the LFO bank has its LED, and the PWM one is dimmed without square waves.

**What does nothing, switched off** (`ui/deps.js`). A whole section or a
single control that, with the current configuration, DOES NOTHING is dimmed in
place — and stays playable: a setting can be prepared before turning on what
activates it, as on hardware (the knob turns just the same). It is a table of
[what, when] rules: what = a section (by its h2), a registry control
or a selector; when = a function of the state that returns null (alive) or the
REASON, which appears in the tooltip and, when touched, on the Output screen («no
effect: Index at 0: there is no modulator»). The rules come from reading the engine:

- **What sounds**: A reaches the output if its level (Mixer · Osc A) > 0 or
  Ring > 0; B the same (with Reset, the whole of B is off). What depends on a WAVE
  only counts those of the oscillators that sound.
- **Per wave**: the Supersaw ignores Phase (random phases) and the Unison (it already is one);
  Spread only opens it; P.Width and the PWM LFO only move the
  Square; FM: Ratio and Index only on Sine, and with no index (nor «FM index» in
  the matrix) Ratio and Feedback do nothing — but the Feedback also lives in
  op. 4 of FM4; FM4: an operator with level 0 neither sounds nor modulates (its Ratio
  and its Decay, out); Wavetable and Wave Sequence, only with some
  oscillator on Wavetable; the Wave Editor, in addition, only with the «user» table.
- **Keys inside a module**: Vocal and Resonator (everything hangs off their
  Mix), Noise Color (Noise), unison Detune (more than 1 voice),
  Low↔Hi (only in LP↔HP), slope (not in Notch), filter env (Amount ≠ 0
  or the «Filter env» source in the matrix; its times, only in «own»),
  flam Gap (more than one hit), P.Env Dec (P.Env Amt ≠ 0), Fl.Speed,
  Chorus, arpeggiator and sequencers (their mode / state).
- **Modulation**: an LFO's Speed and shape matter if its Level > 0 or if the
  matrix uses it raw; Fade only with vibrato or PWM in use; per-voice phase
  only with some cutoff/reso/vibrato/PWM/pan LFO in use; «drift» only if
  a slot uses «Drift (voice)». A matrix slot with no source, with amount 0
  or towards a destination that can't move (Wavetable without Wavetable, Pulse width
  without Square, FM index without Sine, Vocal with its Mix at 0) is switched off entirely.
- **Room**: with no send (Amount / Mix at 0; with Parts, from NO part) the
  delay and reverb times don't sound; Time doesn't count if the delay is
  synced; the shimmer interval, only with Shimmer; the BPM, only if
  something runs in tempo (synced delay, arpeggiator, sequencers, Parts).
- **Scene**: the progression doesn't count in «Functions»; the Cycle, without Sway;
  the part's arrangement, with the player Off; the Amount, without Drift.

Evidence: the «dependencies» check (each rule points to something that exists —
renaming an h2 or a control would leave it mute without warning— and 27 cases along the
path of the controls, from Reset, with the expected reason or «alive»; a
switched-off control stays playable).

**Output** is the instrument's display (`ui/display.js`): in large type, the
last parameter you TOUCH — with the mouse or with a MIDI control (`ctl-touch`
from midimap) — and its already formatted value; when a preset is loaded, its name.
Everything is read from the control itself (its label or `data-lab`, its `.val`, the
active button, the chosen option) and from its section: there is no other table of
names. Below, the master's oscilloscope and spectrum, now large.

**Output meter** (`ui/meter.js`, next to the spectrum): L and R peaks of what
GOES OUT (after the limiter; from −48 to 0 dBFS, yellow from −12, red
from −1, which is the ceiling), a line with the peak of the last second, the
limiter's gain reduction in violet (full = 12 dB), the highest
peak in figures and the **lim** LED, which lights up as soon as the limiter takes off
more than 0.1 dB and stays on until clicked: that way a squeeze that lasts an
instant can be seen. The data is computed by the limiter itself (`limiter-processor`): with
`meter-on` it accumulates the maxima of the interval (four comparisons per
sample) and every 50 ms sends them through its `port`. The main thread doesn't look at
samples: it paints when the data arrives, only with `transform` (the zones are the
fixed background of the bar and a semi-transparent cover hides it from above),
and with the tab hidden the limiter goes quiet (`meter-off`). The bars fall at
24 dB/s and the line waits 1 s before falling.

The **header** is a single row: title, tabs, presets (‹ picker ›,
name, Save and **File ▾** with Delete, Export, Import and SFZ — the
same buttons, folded), MIDI map, Reset, Panic, Record, Parts, theme and
status (two symbols: audio and MIDI; the color tells the state and the tooltip
explains it). The bank's notices float below the header and
fade out by themselves. The **keyboard** is part of the instrument: it scales with it and
is in all three tabs. The chosen tab is remembered
(`subsdj.screen.v1`); when changing, a `resize` is fired because the canvases
of a hidden screen measured 0.

Evidence: the selftest's «screens» check (each tab is a `.screen` in
the order of the tabs and every module lives in one; switching shows
EXACTLY its body, marks the tab and is remembered; the shared ones are
in the slot of the screen being shown; the header with the presets on all of them;
**nothing clipped**: neither the instrument nor any band overflows its box —
since the bands hide what overflows, one control too many would be silently
hidden; the Presets list reflects the library and a click loads and stays
marked) and screenshots with `node tools/shot.mjs "screen:sequencing" out.png
[width]` (`H=height` in the environment for the window height; the fourth
argument, `"@file.js"`, evaluates a probe before capturing).

## Skin: themes

The skin is a system of THEMES by tokens, not a skin engine. Every visual
decision (color, face, shadow, radius, font, what the knob's indicator draws)
lives in the token block at the start of `css/style.css`; the rest of the
sheet only uses `var(--…)`, and the canvases read the same tokens through
`ui/theme.js`. The JS publishes the state (`--pos` 0..1 on knobs and sliders) and the
CSS decides how to draw it: line, dot or value arc, filled track,
according to the tokens. A theme is a `:root[data-theme="id"]` block with
`--theme-name`; the base `:root` is the default theme. The header's
dropdown is filled by reading the sheets: adding a theme is adding CSS. It is
remembered in localStorage; `?theme=id` applies it without remembering it (screenshots:
`THEME=id node tools/shot.mjs …`; runner: `"selftest=1&theme=id"`).

- **Carbon** (default; it was called «Cinescapes» until 1.0.1, and the internal id still is) — flat charcoal, cyan for the rack and violet
  for the oscillators, knobs with a dot, bevel with the light on top and a value
  arc separated from the disc (the knob's box is always 44 px; the disc
  shrinks by `--knob-disc-inset` so the arc fits inside: outside there is no room
  in the rows of five knobs), sliders with a filled track, pill buttons,
  lowercase labels. Inspired by the Cinescapes Pro UI; it was renamed
  because the name clashed with the «Cinescape» preset category and said
  nothing about the look (measured when renaming: the text contrast is the same in
  both themes, 11.9:1 against 11.5:1; the differences are of style).
- **Classic** — the original look: green and cyan, gradients and relief, a line
  on the knob, spaced CAPITALS. It is also the proof that the tokens
  cover everything: it is reproduced with tokens alone (before/after screenshots at
  ≤ 5 levels out of 255).

Size is not the theme's business: the instrument always measures 1920 × 1000 and the
scale is set by the window (`ui/frame.js`). The selftest watches that there are no
hard-coded colors outside the token blocks (check «skin»).

## Performance: CPU per voice and shared budget

Origin (Sergio, 2026-10-12): with «Human Choir», many keys at once
overloaded the audio and made it drop out. Measured (offline render on his PC; live
also needs headroom, because every 2.7 ms block has to be
on time): 10 notes cost 48 % of a core, and **10 notes over the 10
release tails of the previous chord, 85 %** — live, dropouts. Also
the limiter received +5.8 dB with 12 notes and clipped up to 6 dB.

**Where the cost was.** Not in the oscillators' math (a unison
copy or a Supersaw hardly add anything) but in the NUMBER OF NODES of each voice and,
above all, in the filters that recomputed coefficients on EVERY sample:
any connection to a biquad's AudioParam —even if it carries zeros— forces
the browser to do it per sample instead of once per block. Measured with 12
voices: the voice's filter with the env, the LFOs and the macro connected at 0
cost more than double than when still; the Vocal bank with the Life at audio-rate,
four times what it costs at k-rate.

**What was done** (without changing the sound except for rounding; checked by rendering
the same thing with the old code and the new one: bit-for-bit identical with the filter
still, in 24 dB/BP with env, with per-voice LFO and with the matrix on the cutoff;
differences of 10⁻¹⁰ when combining env + LFOs + drive —the order of the sums— and
of 10⁻⁷ in the Vocal):

- The filter env, the cutoff and reso LFOs and the Parts **opening
  macro** are connected to the filter only when they move something (`ensureFenv`,
  `ensureCutLfo`, `ensureResLfo`, `ensureMacro`, also live). The
  macro was connected to all voices even without Parts.
- The wet of the **drive** (a ×2 oversampled WaveShaper) only exists with
  Drive > 0.
- **Vocal**: its 5 biquads at k-rate (the Life, the knob and the Bite move much
  more slowly than a block); a-rate only if the matrix moves the vowel. And with no
  matrix nor Bite, the formants are set with the value of the curves
  (`Voice._shape`, the same interpolation as a WaveShaper) instead of with 10
  WaveShapers at audio-rate.

Result: a «Human Choir» voice goes from ~3.9 % to ~2.4 % of a core;
the chained chords, from 85 % to 67 % (offline, with no cap).

**Shared budget** (`AudioEngine`, `VOICE_BUDGET` = 30 «simple voices»):
all the engines of the SAME context —the four parts of a scene— share
a single audio thread, so the cap is the grand total: it is kept per
context, not per engine. Each voice weighs what whatever it has switched on costs
(`Voice.cost`, measured weights: two saws with the filter still = 1; FM4 ≈ +0.47
per oscillator and copy; Vocal +0.25…). When over budget, it frees from what is heard
least to what is heard most: the oldest release tail of any part (faded out in
350 ms) and, if there are no tails left, the oldest held voice of the part requesting the
note — never another instrument's sustained note. Offline (selftest, SFZ) there are
no deadlines and no cap. Evidence: check «voice budget» (a 4-part
scene simulating live: it never goes over the cap, the 3 oldest tails go
first, with no tails it steals from the part requesting and not from the one sustaining; offline with no
cap).

**Layered scenes** (Sergio, same day: «Layer: keys play all parts», playing
fast or with many keys, «it clips pretty soon», with any scene).
Measured with the four scenes in the repo: the output did NOT go over 0 dBFS (it wasn't
a digital clip), but (1) the CPU shot up — with layer each key is four
voices, and playing fast the offline render cost from 107 to 209 % of a
core: live, dropouts and clicks that sound like clipping — and (2) the limiter
received up to +8.6 dB and clipped 9 dB, harsh. Also each engine, without notes,
already cost ~4 % (and in Parts there are five: the four parts and the single one, silent
underneath), and the budget didn't count that.

- **Insert effects on demand** (`AudioEngine._ensureDist / _ensureFl /
  _ensureCh / _ensureEns`): of each effect only the dry path always exists;
  the wet (×2 WaveShaper, modulated delay lines, 9 LFOs) is born when its
  amount is raised. An engine with no effects goes from 3.8 to 2.5 % (with its room).
- **The budget counts the engines** (`engineCost`, measured: 1 simple voice
  as a base + whatever each switched-on effect adds, 0.14–0.37). Checked LIVE
  (the Robot Choir scene layered, 24 notes at 8/s): maximum usage 28.4 of 30, 13
  live voices at most (with no cap, up to ~96 overlapping tails).
- **New limiter** (`worklets/limiter-processor.js`, instead of the
  DynamicsCompressorNode): brickwall with 6 ms of lookahead — the signal comes out
  delayed 6 ms (the same as the old one) and the gain reduction is spread
  over that time, so nothing goes over the ceiling (−1 dBFS) and there is no harshness.
  Below the ceiling it is linear with +1.71 dB, the fixed gain (automatic
  «makeup») that Chrome's added — measured: −30 and −6 dBFS come out identical
  (−28.29 / −4.29) and with the same delay (289 samples). Squeezed: a sine at
  +12 dBFS came out at −0.10 dBFS with 0.62 % distortion; now at −1.00 with
  0.00 %. In the layered scenes, peaks stay at −4.1 dBFS (ceiling minus
  the scene's master) instead of rising to −2.1: what is heavily squeezed sounds a bit
  quieter and clean; what doesn't reach the limiter, the same.

**The Master stays after the limiter.** It was tried before it (so that lowering it would
take work off the limiter): below the threshold it is identical, but the peak
that the limiter of the time let through (2 ms attack) was no longer
attenuated and «16 notes + voice stealing» clipped (+0.3 dB). With the new limiter
that could no longer happen, but it isn't needed. What remains, **pending listening**,
is the gain sharing by number of voices (today it doesn't compensate until the 5th note
of each part, and in layer the four parts add up).

## Keyboard

- **Tracker**-style layout (FastTracker), 2 rows:
  bottom row `Z S X D C V G B H N J M`, top row `Q 2 W 3 E R 5 T 6 Y 7 U`.
- Octave: `PgUp` / `PgDn`, or the − / + buttons below the keyboard (they show what
  the PC keyboard reaches, from Z to P: e.g. C3–E5). It is the octave
  of the PC KEYBOARD, separate from that of the on-screen keyboard: Z goes from C0 to C7
  (the top row reaches C9) and the on-screen one (up to 6 octaves, top C9)
  shifts just enough to show it. Before they were the same one and, with 6 octaves on
  screen, P stopped at E5. At startup, Z = C3 and Q = C4 (middle C).
- With the mouse over the on-screen keyboard: the height of the press is the
  velocity and, with the button held, each key it steps on sounds and releases the
  previous one (glissando; the pointer is delegated to the container, with capture).
  Polyphonic.

## MIDI

Connect a MIDI keyboard and accept the browser's permission: it links up by itself
(MIDI symbol in the header: lit with a device, off without one, the
tooltip says which; it reconnects hot). **Velocity** scales the
amplitude and the filter envelope (with the **Touch** curve); **pitch bend** with the preset's range (±2 by default); **sustain**
(CC64). MIDI notes light up the on-screen keyboard.

### MIDI learn (MIDI map)

Any knob/slider/button on the device can govern any control of
the UI. **MIDI map** button (header) → click on an on-screen control →
move the physical control: linked (a `CCnn` badge over the control). Right click
unlinks; `Esc` exits. It also works with discrete controls (waves, segs,
LFO shapes, octaves): the control's travel is split into N zones.

- **Persistence**: the map is saved by itself in localStorage **per device**
  (key = name of the MIDI device); each keyboard remembers its mapping.
  **⇩/⇧ Map** exports/imports it as JSON (`{formato:'subsdj-midimap-v1',
  ccs:{74:{id:'cutoff',lo:0,hi:1}}}` — `lo/hi` bound the stretch of the range that
  the control sweeps, editable by hand). **⟲ Factory** restores the default
  mapping: CC74 → cutoff, CC71 → resonance. (Until 2026-11-11 it also had CC1 → the Vibrato
  knob; the mod wheel is now the modulation strip and needs no mapping — see below.)
- **Pickup** (checkbox): the control doesn't act until it reaches or crosses the on-screen
  value — no jumps when changing preset with absolute knobs.
- **Presets from the device**: the bank's **‹ ›** buttons are also
  mappable (they fire on the rising edge: meant for physical buttons that
  send 0/127, although a knob also works — it fires when crossing the center).
  And **Program Change** messages directly load preset *n* of the
  bank (modulo its size), without learn: the keyboard's program buttons
  navigate the bank as is.
- The MIDI channel is ignored on purpose (changing the keyboard's global channel
  doesn't break the map). If you remap CC64 you no longer have a sustain pedal: the foot
  is yours.

## Structure

```
index.html                     the instrument: header, one fixed panel per tab (bands of sections) and keyboard
css/style.css                  single sheet; it STARTS with the skin TOKEN block (color, faces, shadow, shape, font)
js/main.js                     entry point: wires up the UI and starts the engine
js/selftest.js                 offline self-test (?selftest=1)
js/engine/
  params.js                    PARAMS: the SINGLE table of parameters (defaults, ranges, format)
  state.js                     the synth's state S, derived from PARAMS
  AudioEngine.js               graph of ONE instrument (LFOs, inserts) + voice management
  Room.js                      the space: tape delay, reverb, limiter, master (by sends; shared in Parts)
  parts.js                     Parts mode: 4 engines over one context + shared Room; part() = the one the rack edits
  nodes.js                     auxiliary nodes: per-context randomness (offline seed), noise, drift, reverb IR, distortion curve, LFOs
  Harmony.js                   the scene's harmony: scales, progression / walk of functions, chords, seeded PRNG
  Player.js                    player per part: euclidean pulse, chord, melody, root (virtual fingers)
  Conductor.js                 master clock in beats: ticker + look-ahead; scheduleAll() for the offline render; toJSON/fromJSON
  Arrangement.js               arrangement: energy in cycles of bars, entry threshold, surprise, opening macro
  Voice.js                     per-note chain: osc (worklet) → LP/HP filter → VCA → pan
  presets.js                   the factory BANK (1.5.0: categories of entries with tags/use/root/play + data; FACTORY and META derived; BANK_REV) + v1→v2 migration of the old localStorage
  bankCheck.js                 metadata validation and feature coverage of the bank (the selftest and tools/bank-report.mjs)
  library.js                   the LIBRARY: sections and items (preset/scene), seed, ★, search, export/import (no DOM)
  worklets/pulse-processor.js  PolyBLEP oscillator (saw/square/sine/tri/supersaw/wavetable/fm4; 2-op FM + feedback; FM4 4 ops with algorithms; wavetable with Hermite)
  worklets/plate-processor.js  algorithmic plate reverb (Dattorro): diffusers + modulated tank, 100 % wet
  worklets/limiter-processor.js the Room's output limiter: brickwall with 6 ms lookahead, ceiling −1 dBFS
js/ui/
  registry.js                  CONTROLS registry {get,set,def,el,opts} → reset/snapshot/presets/midimap
  theme.js                     skin: token()/tint()/hue() serve the CSS tokens to the canvases; theme selector (reads the themes from the sheets)
  partsControls.js             Parts button + 1-4 selector in the header + Part Mixer module
  playerControls.js            Harmony (▶ Play, scale, progression, seed), Player (mode + knobs), Arrangement (+ the part's Enters/Drift row) modules
                               and Arrangement (energy, sway, cycle, open, surprise; ⇩⇧ scene)
scenes/*.json                 the repo's scenes (⇧ Scene in the Arrangement module): night ambient, dorian
                               dawn, hypnotic techno, robot choir — the selftest renders them all
  frame.js                     the fixed-size instrument scaled to the window (zoom); fitCanvas/uiZoom for the canvases
  screens.js                   Design / Sequencing / Presets tabs: one fixed panel each; moves the shared ones (data-slot)
  rotary.js                    rotary selector: a .seg.rot with its buttons in an arc around a knob
  session.js                   the session: unsaved work kept while you play, offered back by the welcome window (compares, like the ●)
  display.js                   Output display (last parameter touched and, if it is switched off, why), File menu and bank notices
  (engine) Voice.cost + AudioEngine.VOICE_BUDGET   CPU budget shared by the parts (see «Performance»)
  deps.js                      dependencies: switches off (dimmed, playable) whatever does nothing with the current configuration, with its reason
  libraryScreen.js             Presets screen: the library (sections, ★, rename, drag, search, scenes)
  knobs.js sliders.js oscControls.js   controls (ranges and defaults live here)
  midi.js                      Web MIDI input (notes, bend, sustain; CCs → midimap)
  midimap.js                   MIDI learn: CC→control map, pickup, export/import, per device
  keyboard.js presetBank.js recorder.js scope.js adsrGraph.js
tools/run-selftest.mjs         selftest in headless Chrome (CDP, no dependencies): node tools/run-selftest.mjs "selftest=1&demos=DLY"
tools/shot.mjs                 PNG capture of a module or of a screen: node tools/shot.mjs "screen:presets" out.png [width] ["previous JS"]
tools/bank-report.mjs          the bank from Node: metadata problems, presets per category, tags, the coverage table and its holes (--full)
tools/bank-level.mjs           writes the Masters suggested by the factory batch into presets.js (BANK_OUT=file.json on the runner)
```

Presets (format **v2**) store values in **engine space** (`cutoff` in Hz,
times in seconds…). The user presets of the old localStorage (v1 or v2)
come into the library («★ Mine») the first time, migrated; the old copies
are kept as a backup.

**Reset is neutral** (and that is how the synth starts, since 2026-10-05): oscillator A
alone (level A 1 and B 0, B not detuned), the filter open and flat (20 kHz with Reso −3 dB,
the Butterworth with no peak: ±0.02 dB up to 12 kHz), the envelope as a gate (A 2 ms ·
S 1 · R 20 ms, just enough against the click) and all modules at 0: the pure wave
sounds. Presets, on the other hand, are saved as **differences** and go over the
**preset base** (`PRESET_BASE` in `params.js`: the old defaults —
B at +7 ct mixed at 0.4 — today levels A 0.6 · B 0.4 —, LP at 6 kHz with 2 dB, ADSR 10 ms / 0.7 / 300 ms), so
the factory ones, the repo banks, the scenes and the imported ones sound
exactly as before (verified: the 560 effective states, identical);
those saved with Save carry all the keys and the base changes nothing for them.
A new preset written by hand starts from that base (or sets the keys); `{}`
(«Init (default)») is Reset.

## Roadmap (agreed 2026-07)

1. **Consolidation** ✔ *(done 2026-07-03)* — single table of parameters (`params.js`);
   v2 presets in engine space with migration; polyphony cap with voice stealing
   (`MAX_POLY=10`) and tail trimming (`MAX_TAILS=12`); fixed-curve distortion;
   A/B crossfade when regenerating the reverb IR.
2. **Performance** ✔ *(done 2026-07-03)* — multi-octave worklet (octaves inside the
   processor: 2 worklets per voice instead of up to 8); worklet params at k-rate
   (the detune's pow is paid once per block, not 128 times); pitch/vibrato/PWM are
   connected to the voices on demand; mini-HUD (voices · tails · osc) in the header (removed on 2026-09-28;
   `engine.stats()` is still there for the console).
3. **Expressiveness** ✔ *(done 2026-07-03)* — Web MIDI (velocity → amp+filter,
   pitch bend, sustain, mod wheel, CC74/71); filter envelope with its own
   times (toggle «Follow ADSR / Own» — until 2026-09-28 «= Amp» —, compatible with the old presets);
   per-note pitch envelope (Amount/Decay) + «Percussion» preset category.
4. **Sound** ✔ *(done 2026-07-03)* — stereo chorus/ensemble; waveform per LFO
   (sin/tri/saw/sqr button in each group; since 2026-09-28 also S&H and drift); delay syncable to BPM (Free/⅛/⅛·/¼/¼·/½);
   keytrack→cutoff; autopan (LFO→pan). Instead of a generic matrix the missing
   routes were added — a source→destination matrix remains as a future option.
5. **Utility** ✔ *(done 2026-07-04)* — WAV recorder (worklet + own encoder);
   preset export/import to JSON with validation and migration; arpeggiator
   (up/down/updown/random, musical division, octaves, gate) synced to the BPM.

**Roadmap completed.** Then came the «pro sound» block (ensemble, drift,
LFO fade, unison, 24 dB filter + drive, reverb damp/predelay, noise color),
**MIDI learn** (CC→control mapping with per-device persistence) and the **SFZ
exporter** (preset → multisample). Minor ideas in reserve: more divisions/swing
in the arp and automatic loop points in the SFZ exporter. The modulation matrix
is promoted to Roadmap 3.0 ↓.

Parked on purpose (do not implement unless requested): the original synth's *static*
sample generation (morphing for modtrackers).

## Roadmap 3.0 «an instrument with character» (agreed 2026-08-05)

The goal is to deepen the **instrument** — richness of generation and its own
identity — not to add tools around it. Discarded on purpose: a multitrack
sequencer (for sequencing there are already DAWs; the SFZ exporter is the bridge). Pace:
no hurry, one phase at a time, each thing taken to where we want to take it.

1. **Modulation matrix** ✔ *(done 2026-08-06)* — semi-modular in the classic
   way: the audio chain stays fixed (that's what makes it sound good;
   a lesson from the modular synth), the modulation is set free. Panel with 6 rows
   source → destination × amount (±, double click = 0). Sources: the 5 LFOs
   **raw** (their Level knob doesn't take part), the filter envelope, velocity,
   note pitch and a random per-note S&H. Destinations: pitch, pulse
   width, cutoff, resonance, amplitude and pan — all of them per-voice AudioParams;
   each one scales the amount by its `MX_SPAN` (params.js). The cutoff is
   modulated through the **filter's detune** (cents ⇒ exponential): it can't cross
   0 Hz by construction — the cutLFO lesson, guaranteed. Flat keys
   `mx1src…mx6amt` in v2 presets (compatible with snapshot, Reset and MIDI
   learn with no special cases). Evidence: a functional check in the selftest
   (env→amp attenuates; cutoff at full negative doesn't silence), factory preset
   «Matrix Pad» and A/B pairs «MX 1‑6» in `subsdj-demos.json`.
2. **Wavetable oscillator + editor** — IN PROGRESS.
   **W1 engine ✔** *(done 2026-08-07)*: «Wavetable» wave in the worklet — interpolated
   lookup with **per-octave mips** (each level truncates harmonics to what
   fits below Nyquist at that frequency: the tabulated equivalent of PolyBLEP),
   4 factory sets defined by spectrum (`engine/wavetable.js`: analog,
   organ, formant, metallic; 8 frames per set, linear blend between
   keyframes), a **Morph** knob (`wtPos`) that sweeps the frames live and is the
   **«Wavetable» destination of the matrix** — the circle with phase 1 closed:
   env→wt = sweeping vowels, S&H→wt = different bells per note.
   Unison/octaves/drift/glide work the same over the wavetable. Evidence:
   A/B check in the selftest (morph 0 ≠ 1), presets «Wavetable Organ»,
   «Vowel Choir (wavetable)» and «Wavetable Bells (S&H)», pairs WT 1-4 in
   the demo bank.
   **W2 editor ✔** *(done 2026-08-07)*: «Wave Editor» panel — draws
   freehand the A/B frames of the **«user»** table (canvas with the other
   frame as a ghost to draw the morph with intent); «Smooth» attenuates
   high harmonics IN THE SPECTRUM and resynthesizes. The persisted recipe is
   the POINTS (localStorage, 256/frame): points → short DFT with phase
   (sines+cosines: the drawing looks as it was made) → band-limited mips, the
   same pipeline as the factory sets. Selftest: the DFT recovers a known
   spectrum, exact round trip, user morph A≠B.
   **W3** (decision postponed): `f(x, t)` expressions — with the variable t
   they generate a FAMILY of coherent frames, impossible by hand — and/or a
   harmonics editor (pure additive).
3. **Skin and personality** — selectable light/dark theme (CSS variables +
   `data-theme` persisted in localStorage); physical look: rack background,
   screws in the corners of the panels (like the primordial SubSDJ),
   turned knobs with a notch, sliders with a milled guide, a plate with its own
   logo. Verification with CDP screenshots in both themes and several widths.
   Independent of the other two phases: it is interleaved whenever we feel like it.
   **First step ✔ — normalized rack** *(2026-08-07/08, merged to master)*:
   modules split by function (Osc A/B, Mixer, FM, Unison, Wavetable, Filter,
   Filter·character, Filter Env, ADSR, Voice·Master, 3 LFOs, Matrix, 4 FX,
   Stereo, Reverb, Arp, Seq, visualizers) in a Eurorack-style grid of UNITS
   (`--rackU`; 1U/2U/3U + `.wide`, `grid-auto-flow: dense`),
   ordered by signal flow. ZERO loss: all ids intact (the
   binders don't notice), PARAMS↔CONTROLS probe with no gaps, selftest 88/88.
   Refined with the user's review: help in «?» tooltips (they never take up
   surface), almost everything to knobs (log/fmt in knobs.js; the ADSR keeps
   sliders — an envelope is drawn, not turned), SVG wave icons with
   `currentColor` (immune to the theme), FM and LFO PWM switch off if no osc
   can use them. Testing also yielded three wavetable improvements:
   loudness normalization (RMS), morph without cancellations (phase
   alignment + correlation compensation) and `wtUser` (the drawn wave travels
   inside the preset).
   **Second step ✔ — skin tokens** *(2026-09-28)*: decided that there will be NO
   skin engine (free CSS per selector: every new control would have to
   work under N skins) but THEMES BY TOKENS, and that size is not the theme's
   business (knob and rack unit go coupled; the scale is the browser's
   zoom). The sheet starts with a block of tokens in `:root`
   (surfaces, ink, accents, knob, keyboard, faces composed with
   `color-mix()`, shadows, radii, font) and the rest only uses `var(--…)`;
   the five canvases (ADSR, scope and spectrum, Seq, WaveSeq, wave editor)
   read the same tokens through `ui/theme.js` (`token()`, `tint()`, `hue()`:
   the trick is to assign the value to a `fillStyle` and read it back already normalized).
   Outside the block only `rgba(0,0,0,·)` and `rgba(255,255,255,·)` are allowed
   (shadow and shine, not color); the selftest's «skin» check scans
   style.css, js/ui and index.html and fails on any literal (tested
   by injecting a hex in CSS and another in JS). The look doesn't change: screenshots
   before/after at 1500 px, 99 % of the pixels at ≤ 8 levels and the rest
   are the tints that are now DERIVED from the accent (thumbs, active
   buttons, pressed keys) instead of being written by hand. Selftest
   121/121. A theme = a `:root[data-theme="…"]` block (on html, not on
   body: the composed faces resolve their `var()` where they are declared).
   **Third step ✔ — the knob publishes, the CSS draws** *(2026-09-28)*: knobs.js
   no longer rotates anything; it writes the 0..1 position into the `--pos` variable of the
   `.knob` (and `.off` when an amount knob is at 0). In the CSS, `.ind`
   is a transparent carrier that rotates with `rotate(calc(-135deg + var(--pos)
   * 270deg))`; its `::before` is the line, its `::after` the dot, and the
   knob's `::after` is the value arc: a `conic-gradient` from 225°
   cut to a ring with a radial `mask` (in a mask only the alpha counts).
   The halo is a `drop-shadow` of the carrier: what isn't drawn has no
   halo. Tokens `--knob-line`, `--knob-dot`, `--knob-arc` (with `-top`, `-gap`,
   `-track`): at 0px they switch each piece off, so a theme chooses line, dot, arc
   or a mix without touching JS. Check «skin: knob and slider publish --pos» in the selftest (min/max
   → 0/1 and −135°/135° measured in the transform matrix, def of a log knob
   = valToPos, act at 0 → .off and indicator at `--edge-hi`), 122/122. The Design
   screen only changes in the lines (pivot now at the exact center). Along the
   way, `tools/shot.mjs` captures modules with the viewport at the height of the
   page: sticky header and keyboard no longer cover low modules.
   **Fourth step ✔ — theme selector** *(2026-09-28)*: a theme is a
   `:root[data-theme="id"]` block of the sheet that redefines tokens and presents itself with
   `--theme-name:"Nombre"`; the base `:root` IS the default theme (it declares
   `--theme-id` and `--theme-name`). `ui/theme.js` reads the sheets
   (`document.styleSheets`) to fill the header's `<select>`: adding
   a theme is adding CSS, without touching JS. On choosing: `data-theme` on html, the
   token cache is emptied, a `theme-changed` event, a `resize` so the
   canvases redraw, and it is remembered (`subsdj.theme.v1`). `?theme=id` in the
   URL applies it without remembering it (screenshots: `THEME=id node tools/shot.mjs …`;
   runner: `"selftest=1&theme=id"`). Check in the selftest with an injected
   theme (it appears in the list, it changes the computed token and the one
   served to the canvases, it is remembered, it notifies, it goes back to the base), 123/123.
   **Fifth step ✔ — the themes** *(2026-09-28)*: the base block becomes
   «Cinescapes» (flat charcoal, cyan/violet, dot + arc on the knob, slider track
   filled up to the thumb — sliders.js publishes `--pos` like the
   knob —, pills, lowercase) and «Classic» is a
   `:root[data-theme="clasico"]` block with the usual tokens. New tokens
   so that the knob and the track could change character: `--knob-face`,
   `--knob-edge`, `--knob-ring`, `--knob-shadow`, `--track-face`,
   `--track-fill`. Verification: `THEME=clasico` screenshots against the
   previous screen (0.1 % of pixels changed, ≤ 5 levels: Classic is
   reproduced with tokens alone) and Cinescapes screenshots of Design,
   Sequencing and three modules at ×2. Selftest 123/123. PHASE 3 COMPLETE;
   screws, a plate with a logo and animated LFOs remain as an optional whim.

4. **VOCAL module (formants)** ✔ *(done 2026-08-17)* — the human voice as
   what it physically is: a FILTER (source-filter model of speech; the
   formants live FIXED in Hz and don't follow the note — that's why the
   «formant» wavetable set doesn't sing: its peaks are transposed with the pitch). A bank of 3
   bandpass biquads PER VOICE between the drive and the LP/HP (`engine/vocal.js` +
   dry/wet stage in Voice.js, on demand: at Mix 0 there are no nodes): the noise
   already added becomes breath and the SFZ bakes it. Vowel morph u→o→a→e→i
   via WaveShaper (control ±1 → cents curve → biquad detune:
   exponential, audio-rate, and the matrix's **«Vowel»** destination — S&H = one
   vowel per note, env = articulation). A playable robot↔human axis: **Q**
   (narrow bands = vocoder ↔ wide = soft, with 1/√BW makeup), **Life**
   (formant micro-drift: 4 shared sub-Hz sines, random offset
   per voice), **Size** (±1200 ct = child↔giant). Evidence: A/B check in
   the selftest (the bank sounds, /u/ ≠ /i/), presets «Human Choir», «Talking
   Robot» and «Madrigal (vowel per note)», pairs VOC 1-6 in the demo
   bank (diffs 0.87/0.57/1.55 by CDP probe).
   **Vocal 2.0 ✔** *(same day)* — the three pieces with the best
   understanding/effort ratio: (a) **glottal source** — «glottal» wavetable set
   (Rosenberg model: open-close-rest flow, derivative = lip
   radiation; the editor's points→DFT→mips pipeline reused); the Morph
   becomes vocal EFFORT (relaxed almost-sine → bright pressed) and is
   modulable (env→wt = the effort rides the envelope). (b) **F4-F5 +
   singer's formant**: the table grows to 5 formants; F4-F5 cluster
   with F3 towards ~3 kHz (the cluster that lets an operatic voice be heard over the
   orchestra) and the **Bright** knob scales their gain (0 = the bank of 3,
   1 = +12 dB). (c) **Bite** — a consonant at the start of the note, in two
   parts: the **formant transition** (the mouth starts closed —
   shifted towards /u/ on the vowel axis, proportional to the knob — and
   opens to the vowel in ~70 ms; it is the cue the ear uses to hear a
   plosive, Haskins) + the **burst** of the explosion through a WIDE
   band-pass centered on the F2 of the current vowel (place of articulation:
   «ka» ≠ «ku»), scales with velocity; through the narrow bank it lost 97% of
   the energy (measured: +3% RMS — hence its own band). Verification of
   the transition with Goertzel: the onset is «u-ish» (E262/E654 = 13.1
   with Bite 1 against 0.17 without it). Presets «Glottal Voice (effort)» and
   «Vocal Percussion (ka)», pairs VOC 7-12, selftest 95/95 (checks: glottal
   morphs, Bright audible, the Bite adds energy and starts closed).

5. **Wave sequence (wave sequencing)** ✔ *(done 2026-08-19)* — the
   timbre goes from knob to PHRASE, the same promotion the Seq gave the
   pitch (idea stolen from the Korg Wavestation). «Wave Sequence» module:
   a pattern of frames 0..7 ('.' = hold → long steps, uneven rhythm),
   division over the BPM, **Xfade** (0 = dry jump · 100% = glissando:
   the ramp CROSSES the intermediate frames with aligned phase — a morph
   sweep, a color the Wavestation didn't even have) and **Loop / 1shot** mode
   (one pass that stays on the last frame: a multi-segment timbre
   envelope, the D-50's «attack sample + synth body»).
   How (`engine/WaveSeq.js`): automation of the `wtPos` AudioParam PER
   VOICE from its noteOn (`setValueAtTime` + ramp) — each voice starts its
   phrase when born, so an arpeggiated chord ends up internally out of phase
   (impossible with a global LFO); since it is the param's intrinsic value,
   the matrix keeps adding on top. Scheduling: offline (selftest/SFZ)
   everything at once on the noteOn; live, a 25 ms ticker + 120 ms
   look-ahead (the Arp/Seq pattern) — editing pattern/division/bpm comes in at the
   next step. It adds no spectrum: it organizes IN TIME the frames
   that already exist; with the Seq at another phrase length you get
   pitch×timbre polyrhythm. Evidence: checks in the selftest (parser, audible
   sequence, 1shot converges to the last frame), presets «Wavestation Texture
   (ws)» and «Digital Attack (1shot)», pairs WS 1-6 in the demo bank
   (diffs 0.56/0.55/0.50, selftest 98/98). Along the way, the pair probe is
   institutionalized: `?selftest=1&demos=PREFIJO` renders the pairs of the
   demo bank with that prefix and pings the diff of each one (headless:
   it stays in the http.server log) — the bank's rule with a tool.

Method per phase (the usual one): selftest green before and after; if the
improvement is audible, A/B pairs in `subsdj-demos.json`; if it is visual, screenshots or
CDP probes; a commit per milestone.

## Roadmap 4.0 «parts and generative music» (agreed 2026-09-10)

Origin: a colleague of the user showed a generative ambient music engine
(4 FM parts with DX algorithms, Parts/Mixer/Sequencers/Harmony/
Arrangement tabs, no keyboard). It isn't copied: we take the GAPS it reveals.
Three independent axes; the current rack isn't touched and with Parts off the
synth is exactly today's. The keyboard stays: it is the test bench
for crafting a sound before saving it as a preset and using it in a
scene. Left out on purpose: piano roll / timeline (nobody writes notes:
they are PLAYERS) and duplicating the rack per part.

**Axis A · make it sound refined** (small pieces, each with its A/B pair):

- **A1 Damped delay** ✔ *(done 2026-09-10)* — **Damp** and **Wow** knobs in
  the Delay module. Damp = Butterworth LP+HP (Q −3 dB) at the INPUT of each
  line of the ping-pong, so the 1st repeat already goes through the filter once, the
  2nd twice… (tape/BBD: the echo loses highs —and some lows— on each pass;
  log travel, LP from Nyquist to 1.2 kHz and HP from 0 to 200 Hz). At 0 the LP sits
  at Nyquist and the HP at 0 Hz, which the WebAudio biquad reduces to the exact
  identity: the usual presets don't change by a single sample. Wow = two slow
  LFOs (0.6 Hz on L, ×1.13 on R: decorrelated) on `delayTime`, ±2.5 ms
  at full ≈ ±1 % pitch per repeat — the echo widens and goes out of tune a
  hair. Why: an undamped digital echo repeats the whole spectrum on
  each pass and the ear reads it as cheap; hence the «sounds good» of the
  classic delays. Evidence: check in the selftest (at Damp 0 the echoes have
  the SAME spectral tilt as the direct note; Damp 1 lowers it to less than
  half without killing them; the wow changes the echoes), preset «Tape Dub» and pairs
  DLY 1-4 in the demo bank.
- **A2 Algorithmic plate reverb** ✔ *(done 2026-09-27)* —
  `worklets/plate-processor.js`, Dattorro's topology (JAES 1997, the
  Lexicon 224 lineage) exactly as in the paper: mono input → bandwidth
  low-pass → 4 diffusion allpasses in series (142/107/379/277, g 0.75 and
  0.625) → TANK in a figure of eight: two crossed branches, each one a
  MODULATED allpass (672 / 908 ± 16, g 0.7, LFOs of 1 and 0.95 Hz) → delay (4453 / 4217)
  → damping low-pass → ×decay → allpass (1800 / 2656, g 0.5) → delay
  (3720 / 3163) → ×decay to the other branch; L/R output = 7 different taps from
  the tank's lines (table 2). Lengths at 29 761 Hz scaled to the
  context. Why it sounds better than the noise IR: the echo density
  GROWS over time (each allpass multiplies reflections) and the modulation
  decorrelates the modes and kills the metal. **Hall (IR) / Plate** selector in the
  Reverb module (`reverbType`, a room key: shared in Parts) with
  a 50 ms crossfade; only the active reverb receives input. Size = RT60 in
  seconds with a MEASURED table (impulse in Node: 1.17 s ↔ decay 0.3 … 8.25 s
  ↔ 0.9); Damp = the tank's low-pass; output at 0.18 (−10.5 dB against the paper's 0.6)
  to match the energy of the noise IR — measured in the
  same Room: IR −12.7 / −7.2 dB, plate −11.5 / −8.5 dB at Size 1 / 3, so
  switching reverb doesn't change the volume (the ConvolverNode NORMALIZES its IR:
  the noise one isn't as hot as it seems). The worklets are loaded ONCE
  per context (`loadWorklets`, `?v=5`). Bug caught by the check: the worklet's
  rest mode (not computing in silence) kicked in before the signal
  reached any tap (lines of 6000 samples): now only after more than
  one complete pass through the tank without signal. Evidence: the selftest's «plate
  reverb» check (impulse: monotonic tail −54 → −95 dB in 2.5 s, alive at
  1 s with Size 3 and dead with Size 0.5; L/R correlation −0.01; density
  3 → 732 live samples between the first 20 ms and 100-120 ms; hall ≠ plate
  diff 0.28), 110/110; preset «Plate Pad» and pairs PL 1-4 in the demo
  bank (diffs 0.24 and 1.39).
- **A3 Envelope curve** ✔ *(done 2026-09-27)* — **Curve** knob
  (`envCurve`, 0..1) in the ADSR module: at 0 the attack and decay ramps are
  linear, as always (bit-identical: the golden doesn't change); turning it up
  makes them RC-type exponential segments, as in an analog ADSR (the
  capacitor charges towards the target): the attack rises fast and slows down on
  arriving, the decay falls fast and settles slowly. Curvature k = 6·Curve;
  each segment goes as a CHAIN of 12 linear ramps that follow the exponential —
  not as `setValueCurveAtTime`: in Chrome a curve in progress can't be
  cancelled nor anchored (releasing the note during the attack threw an exception,
  the voice got stuck and the page could even crash; the user caught it
  on first use and now the selftest releases a note halfway through the attack and
  demands that it dies); it serves the amplitude envelope and the filter's
  (`Voice._envSegs`); the ADSR graph draws the real curve. Why:
  loudness is logarithmic, a decay that is linear in amplitude «hangs and
  then falls all at once»; the release was a fixed exponential (since the review after
  block 13 it follows the same knob). Evidence: check in the
  selftest (halfway through the attack the curve is ×1.92 higher than the ramp, halfway
  through the decay ×0.51, the sustain ×1.000), 118/118; preset «RC Bass
  (curve)» and pairs ENV 1-4 in the demo bank (diffs 0.51 and 0.59).
- **A4 Explicit BP and notch filter** ✔ *(2026-09-28)* — «Type» selector in
  Filter · character (`filterType`, a per-note structure like the slope):
  **LP↔HP** (the usual morph: LP and HP in parallel with crossfade), **BP**
  (LP and HP in SERIES with the same cutoff; the resonance is split, half
  on each flank, so the knob is still dB at the cutoff; at 24 dB each
  flank carries its 2nd stage) and **Notch** (LP + HP in PARALLEL at gain 1:
  the RBJ numerators of LP and HP with the same cutoff add up to 1 − 2cos·z⁻¹ + z⁻²,
  the cookbook notch, an exact zero at the cutoff whatever the Q; the
  slope doesn't apply because in cascade the flanks would arrive in phase at the
  cutoff and the zero would fill up). Selftest with Goertzel (saw at C3, cutoff
  at its 4th harmonic): notch −39 dB at the cutoff against LP, BP +23.7 dB of
  cutoff over the fundamental, BP 24 dB +18.6 dB more, and the demonstration: the
  morph at 50 % gives an RMS of exactly 0.500 × that of the notch (it IS the notch at
  −6 dB). Preset «Phaser Pad (notch)» and pairs FLT 1-6 in the demo bank
  (diffs 0.92 / 1.12 / 0.61; pair 1-2 doubles the peak: 0.26 → 0.50).
  Selftest 125/125.
- **LFO with S&H and drift** ✔ *(2026-09-28, point 9 of the PLAN)* — two more
  shapes on each LFO's button (sin→tri→saw→sqr→**S&H**→**drift**). An
  OscillatorNode doesn't have them, so they are looped BUFFERS read by an
  AudioBufferSourceNode whose `playbackRate` is the Speed knob (buffer unit
  0.1 s at 8 kHz: rate = Hz/10 → one step or ~one swing per period).
  S&H: 128 random steps (at 2 Hz it takes 64 s to repeat). Drift:
  a sum of 5 sines with WHOLE cycles in the loop (0.375…1.625 × f), random
  phases, normalized to ±1: continuous and seamless. Fixed seed: reproducible
  renders. Each LFO now pours into a fixed `out` output (±1) from
  which its Level and the matrix hang, so switching source rewires
  nothing. Selftest: buffers (constant steps and 127 jumps; drift with a
  per-sample jump < 0.01, peak 1, seamless), different renders (diffs
  0.30 / 0.33 against the sine), staircase vs continuous by spectral tilt in
  windows of 4 periods (S&H: 73 % of windows still; drift: maximum jump
  14 % of the range), and the matrix reads the new shape (diff 0.51).
  Presets «S&H Lead (random filter)», «Breathing Pad (drift)» and «S&H Bleeps
  (random pitch)» (S&H through the matrix to the pitch, ±720 ct: a held
  note becomes a random melody) and pairs LFO 1-6 in the demo
  bank (diffs 0.40 / 1.23 / 1.38). Selftest 129/129.
- **Percussion: 808/909 kit + clap flam** ✔ *(2026-10-01, point 14 of the
  PLAN)* — nine new presets in the «Percussion» category (there were already 808 Kick,
  Synth Tom, Zap Snare, Laser Zap and FM Hat): **909 Kick** (triangle + a puff of
  noise = the click; per-voice drive), **808 Snare** (the 808's two sines, 180
  and 330 Hz — ratio 1.83, it isn't an octave —, as carriers of the additive
  FM4 with an operator decay of ~100 ms, plus very airy noise that lasts
  longer), **808 Clap**, **909 Rimshot** (a resonant BP that the filter
  envelope sweeps in 30 ms), **808 Cowbell** (587 and 845 Hz as carriers; the
  tanh drive adds the square waves' harmonics and a wide BP at 1.2 kHz keeps
  the «clank»), **Open Hat**, **909 Crash** and **909 Ride** (four
  carriers with non-integer ratios and feedback at full = metallic noise, plus
  high-passed noise; the ride with a «ping» at ratio 9 that survives the
  splash) and **Rave Hit** (saw + square in unison ×3, its own filter
  envelope, distortion, pitch drop). Levels matched by measurement
  (peak / RMS of 300 ms of a C3 note, with 808 Kick as the reference: −8 /
  −18 dB). They sound like a drum machine on purpose: that's how they were made (the 808 was
  pure analog synthesis: damped «bridged-T» resonators for kick,
  toms and snare, six filtered inharmonic squares for cymbals and cowbell,
  a pulse train for the clap; the 909 was hybrid, with hi-hats and cymbals
  sampled at 6 bits; pure sampling came with Linn, DMX and MPC).
  **Listening test (2026-10-01, HD668B headphones):** the first batch of
  kicks and snares didn't sound like percussion in any octave — it sounded like a gated
  bass. Measured: the 808 Kick held a flat −10 dB from 50 to 200 ms and
  cut off at 400 (LINEAR decay), when a real drumhead is a damped resonator
  that decays exponentially from the first instant. And what
  makes the «hit» is a **brightness envelope**: the first 30 ms rich in
  harmonics and right away only the sine. Candidates were rendered as WAV
  (CDP probe) and chosen by ear: **808 Kick** becomes the FM4 design
  (operator 2 at ratio 1 with a 30 ms decay = the hit, operator 3 at ratio 0.5
  = sub-click, a 700 ct pitch blip in 40 ms, exponential drop); **808
  Snare** with Curve 1 and airier noise; and **Curve 1** with decays ~1.5× across
  the whole category except the three that already convinced (Clap, FM Hat, Open
  Hat). Lesson: the measurement display doesn't replace the ear, but it explains
  what the ear rejects.
  **Bug caught by the user when first trying the kick** («the hit only comes in
  sometimes»): the FM4's per-operator envelopes counted time from when
  the worklet was born (the processor's `this.t`), not from when the note starts.
  Between creating the node and the VCA opening there are the look-ahead (5 ms), the
  processor's birth and the main thread's jitter — live from 5 to
  30 ms and VARIABLE, and with notes scheduled by the arp or the players up to
  120 ms — so a modulator with a 30 ms decay (the click) had already been
  spent when the VCA opened, sometimes yes and sometimes no; in the offline render the
  offset was fixed and that's why in the WAVs the hit always sounded. Fix: the
  Voice passes `t0` (the note's start on the audio clock) in the
  `processorOptions` and the processor measures time from `max(t0, tBirth)`,
  tBirth being the first block it processes (if the processor is born after
  t0, the sound starts at birth and the envelope counts from there: the click
  arrives whole); `currentTime` is the AudioWorkletGlobalScope's clock; without
  t0 (old worklet) it falls back to its own clock. Along the way it fixes the attack of ALL
  the FM4 presets played by the arp, the Seq and the players, which always
  lost the hit. Double evidence: check «FM4 operator clock» (a note
  scheduled 250 ms in the future against an immediate one, the spectral tilt of the
  first 25 ms is the same and both ×12-16 that of the body; verified that it fails
  without the fix) and a REAL-TIME test (a real AudioContext in
  headless Chrome, 18 hits at irregular intervals with the main thread
  blocked 0-30 ms after each noteOn, recorded with the recorder-processor):
  with the old clock the attack's brightness went from ×21 to ×240 that of the body
  depending on the hit (that is «only comes in sometimes»); with the fix, from ×80 to
  ×240, always with a click. Second lesson from the same bug: when touching a worklet
  you have to BUMP `WK_V` in AudioEngine.js (?v=N in the addModule URL) —
  Ctrl+F5 doesn't refresh the AudioWorklet's modules and the user kept
  hearing the old processor after the first fix. And the third, the one that was missing
  on his machine (Realtek, WASAPI output): the **note look-ahead** was
  a fixed 5 ms, but the clock the main thread sees lags behind the audio
  clock by up to one device callback period (`baseLatency`: 2.7 ms
  with 128 samples, 10-20 ms on a WASAPI card) and the events take as long again
  to arrive; when the VCA opening, the pitch blip and the flam bursts
  fall «in the past» they are applied all at once, with no transient. In
  headless and offline that delay is constant (hence the kick always hit
  in the test recordings and not in the user's synth). Now
  `mod.lookahead` = 5 ms + 2·baseLatency live (25 ms on a typical
  card; it is printed in the console at startup) and 5 ms offline (golden intact):
  in the real-time test the start goes from falling between 8 and 17 ms after
  the noteOn, variable, to a locked 25.7 ms, with the VCA's attack whole. Cost:
  ~20 ms more keyboard latency.
  **And the fourth, the real one** (when the adaptive margin was put in, the kick
  stopped hitting ALWAYS, and all the percussion lost punch): what the ear reads
  as a «hit» wasn't the FM click nor the blip, it was the **step** — the VCA already
  open when the oscillator started sounding, something that used to happen at random
  (when the event arrived late) and with the adaptive margin never, because the
  1 ms attack, even if it is RC, eats the first millisecond of the transient,
  which is where the crack lives. Fix in three pieces: (1) **attack 0 = step**
  (`a` admits 0; `_envSegs` sets `setValueAtTime(peak, t)`; the flam's pulses
  are also steps, as in the 808's clap) and the whole
  Percussion category and the percussive FM4s carry `a: 0`; (2) **start
  gate in the worklet**: until t0 the oscillator is silent and its phases don't
  advance, so the wave starts at its configured phase exactly when the
  VCA opens (before, it ran free from birth and with a step the hit would have
  changed from one note to another depending on the phase it caught); (3) t0 **quantized to a
  block boundary** (128 samples) in the Voice, because the gate works by
  blocks. Result in the real-time test: the twelve hits come out
  IDENTICAL (brightness ×241.8 that of the body and −11.3 dB in all of them, with the main
  thread blocked or not). Check «deterministic onset»: with attack 0 the
  first quarter of a millisecond is already at level (×1.7 relative to 5 ms later)
  and two notes scheduled at 200 and 300 ms give the same samples aligned by
  start (tolerance ±1 sample: the step is rounded to a sample). Oscillator A's
  **Phase** knob becomes a control of the hit: 90° on a sine is
  the maximum step. Selftest 142/142.
  The clap asked for an engine piece: an 808 clap isn't a noise hit,
  it is three or four bursts ~10 ms apart (a pulse train on the noise
  VCA) and then the tail through a band-pass at ~1 kHz; the LFOs don't cut it
  (global, ≤ 20 Hz, no per-note retrigger). **Flam** in the ADSR module:
  **Hits** (`hits`, 1..4) and **Gap** (`hitGap`, 5..40 ms) knobs. With
  Hits > 1, `Voice._flam` schedules Hits−1 bursts before the ADSR: each
  one rises 0 → peak in the attack (capped at a third of the gap: a burst
  has to be a hit) and falls to 0 over the rest of the gap with the curve of the
  Curve knob (`_relChain`: linear or RC), so the next one starts from a clean
  0 and between hit and hit there is a valley; the full ADSR is the last
  hit (`_envAmp.t` shifts with it: the releases scheduled by the
  players still work). With Hits = 1 the path is the usual one
  (bit-identical). Releasing during the flam works as always: release()
  anchors the current value and cancels the remaining bursts. The ADSR
  graph paints the bursts. Evidence: check «clap flam» (sine at 880 Hz,
  windows measured from the real start of the sound, at 11 ms: valley/burst
  0.28 with 3 hits against 1.42 without flam, sustain ×1.000, the note dies on
  release and also when releasing at 12 ms, in the middle of the flam); pairs PRC 1-4 in
  the demo bank (clap without/with flam, diff 1.55; 808 snare without/with
  a two-hit roll at 30 ms, diff 1.49). Selftest 141/141.

**Axis B · real FM** — FM as a SOURCE that then goes through our
filter, vocal and matrix: what the DX7 never had. Note: an inverted saw
has the same magnitude spectrum as the normal one (on its own it sounds the same: the ear
is almost deaf to phase); it only matters as an FM MODULATOR, added to another
oscillator or after a non-linear stage — hence the TX81Z's extra waves.

- **B1 `fmIndex` as a matrix destination + feedback** ✔ *(done 2026-09-25)*
  — «FM index» destination in the matrix (`MX_SPAN.fm = 8`, on each worklet's
  `fmIndex` AudioParam, which clips at 0): env→index = DX pluck and bell
  (bright attack, soft body), vel→index = the DX7's touch,
  S&H→index = a different bell per note. **Feedback** knob (`fmFb`): the
  modulator feeds back with the average of its two previous outputs (Yamaha's
  trick so it doesn't whistle at Nyquist), `y = sin(θ + β·ȳ)` with β
  up to 3 rad — at ~1.5 the sine is already a reasonable saw; at full the loop is
  chaotic = metallic noise (the TX81Z's FM hats, with no noise generator).
  Why it matters: static FM is boring; the DX7 lives off the index changing
  DURING the note. Evidence (the selftest's «FM in the matrix» check, measured):
  env→FM multiplies the onset's spectral tilt by 24 against the
  sustain (0.9 in the control with a fixed index); vel 1 against 0.3 gives ×7
  brightness; feedback at full raises the tilt ×11 (with 0.6 it came out ×1.3-2.4
  depending on the modulator's random phase: the check is measured at full); feedback 1 with index 12: peak
  −4.7 dB, no NaN. Presets «DX Bell (env→FM)», «DX E-Piano (vel→FM)»,
  «FM Brass (feedback)» and «FM Hat (feedback)»; pairs FM 1-4 in the demo
  bank (diffs 1.37 and 1.38). Selftest 105/105. The worklet goes up to `?v=4`.
- **B2 «FM4» oscillator** ✔ *(done 2026-09-27)* — «FM4» wave in Osc A/B
  (worklet): 4 operators with their own ratio, level and DECAY (level·e^(−t/decay);
  at full, constant) and 8 algorithms in a table of who modulates whom
  (`FM4_ALGS`: stack 4→3→2→1, two pairs, three in parallel, Y, one modulator
  for three carriers, stack of three + sine, pair + two sines, additive) — an
  algorithm is just a directed graph: the leaves modulate, the roots sound.
  Phase modulation in cycles (level 1 ≈ 7.5 rad of index); the operators
  are computed from 4 to 1; the FM module's Feedback goes to op. 4 (in the
  additive one it turns it into a saw). The DX7's recipe in one knob: a modulator with
  a short decay = a bright attack that dies out. **FM4** module (2U): algorithm
  selector + Ratio/Level/Decay × 4; it switches off if no osc uses the wave.
  Downstream everything still applies (filter, vocal, matrix, wave sequencing,
  SFZ). 13 flat `fm4*` params (presets, MIDI learn and snapshot with no special
  cases); the worklet goes up to `?v=6`. Presets «FM4 · Stacked Brass», «FM4 ·
  Paired E-Piano», «FM4 · Dense Bell», «FM4 · Kick», «FM4 · Hat»; pairs
  F4 1-4 in the demo bank (diffs 1.16 and 1.43). Evidence: check in the
  selftest (the 8 algorithms sound and each differs from the previous one, diffs
  1.2-2.0; op 2's decay: onset/sustain tilt 1095 against 1.03 with
  flat decays; FM4 ≠ 2-op sine), 116/116.

**Axis C · parts and generative music** (the big turn; it isn't a multitrack):

- **C1 Parts + mixer** ✔ *(done 2026-09-25; decision «global room by
  send» confirmed by the user)* — `engine/Room.js`: the SPACE (ping-pong tape
  delay, reverb, limiter, master, analyser) leaves the engine for
  a class of its own with a send/return model, that of the 90s multitimbral
  synths: each engine sends it its dry signal and two SENDS (the preset's `dlyAmt` and
  `reverbMix`). In the usual mode each engine creates its own Sala and
  sounds the same — tested with a DETERMINISTIC render (seeded Math.random) of
  8 presets before and after the refactoring: of 1.37 M samples at
  16 bit, 380 differ by 1 LSB (reordering linear gains changes the
  order of the floating-point sums) and the rest are identical.
  `engine/parts.js`: PART = a complete `AudioEngine` (`init(ctx, {sala})`)
  over the shared context; `part()` is the engine the rack edits and
  the keyboard plays — the UI only talks to it (registry, keyboard, midi,
  seq…); with the scene off it is the single engine and nothing changes. `ROOM_KEYS`
  (bpm, time/sync/damp/wow of the echo, size/damp/pre of the reverb) belong to the
  room: in a scene the rack edits them for all the parts (label «room»
  on Delay and Reverb), presets don't touch them and Reset doesn't reset them;
  `master` becomes the part's fader. `syncControls` dumps the state
  of the chosen part into the controls WITHOUT reapplying it (reapplying would cut
  its notes: 'mode'/'seqOn' do allNotesOff). UI: **▦ Parts** button +
  1-4 selector in the header; a full-width **Part Mixer** module: per
  part Level/Pan/Delay/Reverb/M (mute), a Room column (the scene's
  master, echo feedback, echo→reverb) and **Layer** (the keyboard plays
  all of them). Part 1 inherits the sound that was there when switched on. No
  persistence yet (C3). Evidence: check «parts» in the selftest
  (state↔controls round trip; an offline 4-part scene: each one
  sounds in its window, the muted one doesn't, bpm/predelay/size reach the S of
  all of them, part 4's reverb tail stays in the room at −44 dB; 106/106),
  a CDP probe on the real page (21 checks: switch on, inherit the
  sound, choose a part, load a preset without touching the room, room knobs to
  all of them, strip↔rack, layer, mute, switch off) and screenshots of header and mixer.
- **C2 Harmony + players** ✔ *(done 2026-09-26)* — `engine/Harmony.js`:
  root + scale (13: major, minor, harmonic minor, dorian, phrygian, lydian,
  mixolydian, pentatonics, blues, whole tone, hirajoshi, in sen) +
  a progression of degrees with N bars per chord («1 6 4 5» or «I vi IV V»)
  or a WALK of tonal functions (T rest · S soft tension · D tension that
  resolves, with the probabilities of common practice: T→S/D, S→D, D→T).
  Chords by thirds ON THE SCALE (degree, +2, +4, +6 steps): in 7
  notes the diatonic triads come out; in a pentatonic a foreign note never
  comes out. Seeded PRNG (mulberry32): same seed, same session;
  each player with its own stream. `engine/Player.js`: one player per
  part, four modes (the five in the plan ended up as four because
  Arpeggio and Phrase come out by themselves): **Pulse** = euclidean rhythm E(k, n) — a hit
  on step i when the accumulator i·k mod n wraps around, the line of
  slope k/n drawn in pixels (Bresenham); E(3,8) is the tresillo —
  with rotation, probability, accent and gate, on the chord's
  root; **Chord** = holds 3-4 notes of the chord (with the part's Arp
  on it arpeggiates them; without it, a pad); **Melody** = a walk through the
  scale degrees with gravity towards the chord on strong beats, rests and
  durations according to the density; **Root** = the root (± fifth)
  retriggered every N bars (with the Seq on it is the root that
  transposes the phrase). `engine/Conductor.js`: master clock in beats
  (bar = 4) with the Arp's pattern (25 ms ticker + 120 ms look-ahead);
  tempo = the room's BPM; `scheduleAll()` schedules everything at once for the
  offline render. The note-offs are SCHEDULED on the audio clock:
  `Voice.release(rel, at)` uses `cancelAndHoldAtTime` (cancelScheduledValues
  would delete an attack ramp that ends after t) and `when` travels through
  `_directOff → _releaseVoice → _scheduleTail`. UI: **Harmony** modules
  (▶ Play, root, scale, progression, bars/chord, List/Functions,
  seed 🎲, bar and chord indicator) and **Player** (that of the part the
  rack edits: mode + its knobs). Evidence: check in the selftest
  (quantization with ties rounding down; I/vi/V of C major; a deterministic
  walk with the seed and a different one with another; E(3,8) = 10010010 and k
  hits in every rotation; an offline scene of 4 players over 4 parts, 2
  bars: notes 8/7/6/4, 0 outside the scale, pulse on the sixteenth-note
  grid, no NaN nor clipping; two conductors with the same seed
  emit identical events), 107/107; CDP probe of the real page 16/16
  (harmony through the UI, modes per part, ▶ emits on all parts and in
  scale, the Player follows the part, ■ leaves zero voices) and screenshots.
- **C3 Arrangement and scenes** ✔ *(done 2026-09-26)* — `engine/Arrangement.js`:
  form on the scale of minutes. ENERGY E(bar) = Energy (center) +
  Sway × a cosine swing of Cycle bars (it starts low, peaks halfway,
  goes back down). Each part has a threshold («Enters», in Player):
  it plays only when E ≥ threshold — the drone at 0 always, the kick at 0.7 when
  things liven up; the curve carries no noise, so there is no flickering. The
  energy also scales velocity (70-100 %), the pulse's probability
  (75-100 %) and the melody's density (±0.25). SURPRISE = one-bar
  rests per part, a deterministic hash of (seed, bar, part). OPEN
  = a macro that adds cents to the filter detune of all the voices of
  all the parts (`macroCut`, the same exponential route as the matrix's Cutoff
  destination): ±1 octave between energy 0 and 1; live it is smoothed
  every 100 ms, offline automated per bar on the AudioParam itself.
  DRIFT per part («Drift» + «Amount» in Player): a preset parameter
  wanders slowly around the value it had — 3 sines with prime periods
  (23, 37, 59 beats) with phases from the seed; cutoff in octaves, the
  rest in ± half the range; the rack's knob follows it if it is the part you
  are editing. Everything deterministic with the seed. SCENE = JSON
  (`subsdj-escena-v1`): room (SALA_KEYS + master, feedback,
  echo→reverb), conductor (seed, harmony, arrangement, the 4 players) and
  parts (complete preset state, name, pan, mute; or else a factory `preset`
  + `ajustes`, like the hand-written demo). Buttons in Arrangement:
  ⇩ exports, ⇧ imports (turns Parts on if needed), ↺ Last recovers
  the autosave (localStorage every 3 s and on closing). `subsdj-escena-demo.
  json`: «Night Ambient», D minor i-VI-III-VII at 72 bpm, pad (chord,
  cutoff drift), sub (root), DX bell (sparse melody) and FM hat
  (pulse E(5,16)) coming in at thresholds 0 / 0.3 / 0.55 / 0.75.
  Two findings along the way: (1) the engine now knows whether the context is
  OFFLINE (`ctx.startRendering`) and then doesn't apply the tail cap nor
  its wall-clock timers — offline the audio clock runs
  faster and `MAX_TAILS` killed voices at the wrong time, non-deterministically and
  silencing notes still to sound (it affected renders with many short notes);
  (2) WebAudio adds a node's inputs in an order that depends on
  memory addresses: two identical renders differ in the last bit
  (~1e-7, −140 dB), so «same seed = same samples» is measured with
  that tolerance. Evidence: check in the selftest (energy E(0)=0.3 and
  E(8)=0.9 with Energy 0.6/Sway 0.6/Cycle 16; threshold 0.85 is silent at
  the start and comes in at the peak; deterministic surprise, 13/40 at full; JSON
  export → alter → import returns exactly what was exported; same
  seed: max 2e-7 between renders, another seed: 0.6; macro −480/+960 ct;
  the demo loads and sounds at −4 dB), 108/108; CDP probe of the real page 19/19
  (demo through the UI path, strips and rack, harmony and room from the
  scene, macro and drift live with the knob following it, indicator of
  cycle/energy/who plays, autosave and ↺ Last) and screenshots. Caught
  later: two notes hanging when stopping (a probe that reproduces them): (a) the
  parts with Arp/Seq receive the player's notes by timer, and when
  stopping inside the anticipation window the note-off arrived BEFORE
  the note-on → the Arp stayed holding (now the pending note-ons
  are cancelled and the «now» note-offs are synchronous); (b) the Seq with latch
  kept the phrase going when the root was released (stopping clears it). **⏹ Panic** button in
  the header (and the Escape key): stops the conductor and cuts everything in all the
  parts.

**Outside the axes · 13a Screens** ✔ *(done 2026-09-27; proposed by the
user)* — Design / Sequencing / Presets tabs as filters over the
same rack (`data-screens` per module + CSS, `ui/screens.js`), sticky
keyboard, a Presets screen with the whole bank by sections
(`ui/presetScreen.js`), a «Scene» notice in Sequencing with Parts
off. Check «screens» in the selftest, 119/119; «Screens» section
above. Along the way, the headless runner and the screenshot tool now live in `tools/`
(point 11 of the plan): `node tools/run-selftest.mjs` exits with 1 if anything fails.

**13b Preset Library** ✔ *(done 2026-09-27)* — `engine/library.js`
(a model with no DOM: sections and preset/scene items, seed with an
`origen:nombre` key plus a canonical fingerprint of the content, favorites, accent-insensitive
search, export/import that merges), `ui/presetBank.js` on top (★ Favorites
first; ‹ › and Program Change skip the ★ group) and `ui/libraryScreen.js`
(columns, click loads, ★, inline rename, drag between sections and
positions, delete, search, «★ only», ⟲ Restore factory, scenes through the
⇧ Scene path). The user's decisions: factory items can be deleted
(with the ⟲ safety net), scenes are a section, the quick bar walks the whole
library. Evidence: the selftest's «library» check over a fake
storage (it seeds factory + migrated v1 user; reseeding doesn't
duplicate; deleting from factory and restoring puts it back in ITS section; renamed or
tweaked doesn't come back; sections create/rename/move with order/reorder/
delete; ★; accent-insensitive search; export → import exact round trip and
repeating doesn't duplicate; loose v2 bank and scene; persistence; repo
files by fetch: 114 the first time, 0 the second), 120/120; screenshots of the
screen with a favorite and a filter. Scenes saved before the library
(`presetVal` of the form `f:Nombre`) still label the part: they are
resolved by name.

**Review after 13** *(2026-09-27, the user's suggestions)* — header
as a fixed module with oscilloscope and spectrum («Screens and
header» section); Design in groups by function with a title, each group with its
grid, collapsible (click) and «only this one» (double click); **▶/⏹** on the library's
scenes (it loads, turns Parts on and starts; only one at a time; ⏹
stops without turning Parts off); the **release follows the Curve knob** like attack
and decay (straight to 0 with Curve 0, RC with Curve 1; before it was a fixed exponential,
τ = r/4, and the graph drew it straight: BEWARE, presets with Curve 0
now release in a straight line), also in the players' scheduled note-offs
(the value at t is computed with the same curve); out go module collapsing
and the «Scene» notice; no fixed 2U heights. A «CPU audio» meter
was tried (a worklet timing the gaps between quanta) and removed: it didn't
measure well. Check «envelope curve» extended (straight release at half
halfway through; RC settles; both at 0 at r), 120/120.

**Visual batch** *(2026-09-28, Sergio's list)* — a header without noise: out go
the voices/tails/osc HUD, the «WebAudio · AudioWorklet» and the subtitle
«Substractive Synthesizer» (it is no longer only subtractive); the status is left in
two **symbols** (`ui/status.js`: ⏻ audio and a MIDI DIN, SVG with
`currentColor`): off, waiting (pulsing), active (accent with a halo) or
error (red), and the tooltip explains it. The **SubSDJ** logo carries an
accent→accent2 gradient clipped to the text (`background-clip:text`) that flows back
and forth every 10 s and a halo via `drop-shadow` (a `text-shadow` would be painted
OVER the clipped gradient); it comes from the tokens, so it changes with the theme,
and `prefers-reduced-motion` stops it. Buttons without symbols (MIDI map, Reset,
Panic, Record, Parts, Save, Delete, Export, Import, SFZ: they weren't
homogeneous). **Selects at the height of the buttons**: a single `select` rule
with the padding and body of a `.btn` (each one had its own, 3-4 px /
11 px, and with `appearance:base-select` the browser adds no frame of its own: the
gap you see is exactly ours); the theme one is a pill like its
neighbors. Out goes the «Presets» label. Wave Editor: Sine and Saw with their
icon (the same SVGs as the oscillators) and Smooth as a «zigzag →
wave» icon. The Filter Env's «= Amp» becomes **«Follow ADSR»**. Below the keyboard, instead
of the explanatory text, an **octave** stepper (− / +, it shows the visible
range, e.g. C4–C6; PgUp/PgDn still work). Selftest 129/129.

**Hanging note when changing part** (caught by the user, 2026-10-01:
«I change part while I'm playing and the audio gets corrupted, the instruments get
cut off»). The note-off from the keyboard and from MIDI went to the CURRENT part
(`part()`), not to the one that had received the note-on: when changing part with a
key held down, the note stayed hanging in the previous part — a voice
taken forever (with several, MAX_POLY's voice stealing ate the
player's notes: «they get cut off») and, in mono, the player no longer retriggered
but SLID in legato over the hanging note («it gets corrupted»). Fix:
`NoteRouter` in `engine/parts.js` remembers which engines each note-on went to and
sends the note-off to those same ones (it also covers Layer and the window's
blur). Along the way, a foreign id no longer touches the engine: `Seq.unhold` doesn't switch off the
latch nor stop the phrase, and `_monoOff` doesn't re-slide someone else's mono voice. Check
«keyboard ↔ parts» in the selftest; 130/130.

Order: A1 → B1 → C1 → C2 → C3; A2 and B2 are large independent blocks
to interleave whenever we feel like it. Method per phase: the usual one.

## Roadmap 5.0 «cinescape» (agreed 2026-10-03)

Origin: «I'm not able to get sounds that grab attention: what comes out is
classic». Diagnosis: the engine is a complete subtractive, but (1) **everything
moves at once** — the LFOs are global to the engine and a chord breathes as one
block; (2) **the time constants are an instrument's, not a landscape's** —
attack ≤ 2 s, release ≤ 3 s, LFO ≥ 0.05 Hz, room ≤ 4 s; (3) **the spectrum is
always harmonic and stable**. What is cinematic is each voice at its own pace, ten
times slower, in a room that sounds more than the note, with material that isn't
in the note. The «saw + square + unison + 24 dB LP + big reverb» recipe
of any tutorial IS the classic factory pad («Supersaw Pad», «Cathedral
Pad»): it doesn't get you out of there. Of that recipe only the sub-oscillator was missing.

Blocks, by value against cost: **1 time ×10 + octave per oscillator** ·
**2 per-voice drift as a matrix source** (and random per-voice phase in the
LFOs: decorrelation) · **3 shimmer and freeze in the Room** (granular pitch shifter
+12/+7 in the reverb's feedback; freeze = decay ≈ 1 with the input
closed) · **4 performance sources** (wheel, aftertouch, expression in the
matrix: the pad is played) · **5 resonators** (a bank of combs or inharmonic modes
excited by continuous noise: bowls, bowed metal; the Vocal bank is already a
bank of band-passes) · **6 granular** (clouds of grains over the user table
or the last thing recorded: the only thing that never repeats) · **7 tape on the master**
(hiss, wow of a few ms, soft saturation). Order: 1 → 2 (listen) → 3; 5 and 6
when time and decorrelation are solved (without that they would also sound
classic). Detail per block in PLAN.md. **Status (2026-10-03): 1, 2, 3, 4,
7 and 5 done, listened to and on master; 6 (granular) is PARKED at
Sergio's request («for another time»).**

**1 Time ×10 + octave per oscillator** ✔ *(done 2026-10-03)* — Ranges: attack
and decay up to 20 s and release up to 30 s (ADSR and Filter Env), glide 10 s, LFO
Fade 20 s, P.Env Dec 10 s, the six LFO Speeds from 0.005 Hz (one cycle every
200 s: at that scale the LFO drifts, it doesn't oscillate), Delay up to 4 s (`DLY_MAX` 4.5 s
in the line; the sync is clipped to 4), reverb Size up to 20 s and predelay up to
250 ms. The 20 s IR is generated in ~55 ms and the convolver spends CPU in proportion
to the IR (that's why 20 and not 60; the plate doesn't pay for length). Plate: the
RT60→decay table is extended with points MEASURED in Node between 1 and 15 s — the tank's late
tail falls more slowly than the initial segment (the allpasses' diffusion
spreads the energy at the start), and in a 20 s tail the late slope
rules: 16.2 s ↔ 0.93 · 21.8 ↔ 0.95 · 26.3 ↔ 0.96; Size 20 ↔ decay 0.944 (the
worklet admits 0.98); the six old points are kept (presets don't
change). Everything in **log** (`params.js`): a linear 0..20 s slider would put the
millisecond at 0.005 % of the travel; with `lmin`, position 0 is still
EXACTLY 0 (attack = step, glide off) and the rest goes in log from the old
step. **Sliders store the value** instead of re-reading it from the position: a
1000-step log slider quantized every preset when loading it (±1 % at 12 s of
attack). **Octave** per oscillator (`octA`/`octB`, −2..+2; «Octave» stepper
next to «Stack», the old «Octaves»): the oscillator sounds at f·2^oct as a frequency
RATIO (`o.ratio`, the same one the glide uses), so the cents and the
portamento still mean the same; −1 is the sub-oscillator that was missing (the
stacked octaves only went upwards). Tails: `MAX_TAILS` 12 → 16 and the
fade of the surplus tail goes from 10 to 350 ms (with a 25 s release the oldest
tail still sounds at half level when its turn to go comes: 10 ms was a click).
Evidence: four checks in the selftest — «octave per oscillator» (zero
crossings: 131.0 / 65.5 / 261.5 Hz at 0 / −1 / +1; the mono glide at −1 ends at
98.0 Hz), «times ×10» (10 s attack: level at 1 s / 2 s = 0.482; 20 s release:
0.901 at 2 s after release; PARAMS table round trip with exact 0; controls
return exactly what they are given), «LFO at 0.005 Hz» (sine 0.0314 =
sin(2π·0.005); S&H without changing step in 1 s) and «long room and delay» (IR of
20 s: level at 10 s 0.179 ≈ (½)^2.5; tail at 3.5 s with Size 20 / 4: IR −39 / −87
dB, plate −43 / −74 dB; echo at 3.5 s −28 dB with the previous gap silent);
148/148. **Cinescape** factory category («Glacial Pad (12 s attack)»,
«Basement Drone (−2 octaves)») and pairs **TIME 1-4** (diff 0.73 / 0.30) and
**OCT 1-2** (0.73) in the demo bank.

**2 Per-voice drift + per-voice LFO phase** ✔ *(done 2026-10-03)* — The
problem: there is ONE of each LFO per engine, so a chord breathes as a block; the
ear reads «alive» when each voice does its own thing at its own pace. Two pieces, both in
the Matrix module. (a) **«Drift (voice)»** source: a slow walk OF EACH
voice's OWN — the LFOs' drift buffer (`nodes.lfoBuffers`, a sum of 5 sines with
whole cycles: continuous and seamless) read by one `AudioBufferSource` per
voice at the speed of the **Drift Spd** knob (0.005–5 Hz, log; 0.05 Hz = one
swing every 20 s), ±1 raw; to cutoff, pan, wavetable or amplitude, each note of the
chord evolves on its own. It is only created if some slot uses it. (b)
**LFO global / LFO per voice** selector (`lfoPhase`, per note): with «per voice»
each voice creates its COPIES of the cutoff/reso/vibrato/PWM/pan LFOs
(`nodes.mkVoiceLFO`; cutoff and reso at birth because they are always wired,
the others on demand like the `ensure*`) and starts them at its phase; the
tremolo is still global because it comes after the mix. An `OscillatorNode` doesn't
admit an initial phase, so the per-voice LFOs are **one-period buffers** (1 s
at 8 kHz, `playbackRate` = Hz) with the same phases as the native oscillator
(sin/tri/saw start at 0 rising, sqr at +1); S&H and drift use the usual
buffers. Changing shape or Speed mid-note anchors the current phase and
carries on (it doesn't restart the cycle). **Each voice's phase** comes from the
Weyl sequence k·φ mod 1 (φ = golden ratio, a per-context counter): deterministic —
reproducible renders and SFZ, and the selftest can MEASURE it— and maximally
spread (two consecutive notes never fall close together); voice 0 has phase 0, so
a single note sounds as with the global LFO. Live voices receive
Level/Speed/shape live (`Voice.setLfo`, `setMxDriftSpd`). Evidence: check
«per-voice phase» — a C3+G3 chord with LFO→amplitude via the matrix and a per-note amplitude
track (Goertzel with Hann, 50 ms): correlation between notes 1.000 in global and
**−0.738 per voice, which is cos(2π·0.618) = −0.74**; voice 0 per voice against
global 0.999; shape buffers with the native's phases. Check «per-voice
drift»: correlation between notes 0.122 (the buffer's autocorrelation at the
Weyl offset comes out ≈0.13 by hand), swing ×31 on each voice, two renders equal **bit
for bit** (max |Δ| = 0), at 0.005 Hz swing 1.03 in 2 s; 151/151. Lesson from the
check: with two sines at normal level the **Room's limiter** (threshold −3 dB)
compressed the sum and coupled the tracks (a false corr −0.995); the test
render goes at −12 dB. Preset «Four Winds Pad (per-voice drift)» in
Cinescape; pairs **PHASE 1-2** (diff 0.45) and **VDRIFT 1-2** (0.52).

**3 Shimmer + freeze in the Room** ✔ *(done 2026-10-03)* — **Shimmer**: a loop
tail → HP 120 Hz → LP 5 kHz → pitch shifter → ×g → reverb input
(it works for the IR and for the plate; Room keys `shimAmt`, `shimInt`:
shared in Parts and outside the preset in that mode). The shifter
(`worklets/shift-processor.js`) is the classic granular one: a delay line and
two heads whose delay ramps down from 100 ms to 0 — reading while approaching the
write head is reading faster, ×2^(st/12) —, each one with a sine window (0 at
the jump) and half a turn apart (sin² + cos² = 1: constant power); at +12 you get
10 grains per second, the slight tremolo of every shimmer, which the reverb
dissolves. Intervals +12 / +7 / +5 / −12. The loop gain is **calibrated
against the reverb's energy**: the first version carried a fixed gain
of 0.8 and there was no choir — the check caught it: the tail with shimmer weighed the same
as without it. A reverb returns much LESS energy than goes in: the IR
normalized by the ConvolverNode has a fixed RMS of 0.00126 (its calibration
constant), hence energy 0.07·Size; the plate, measured with an impulse in Node,
0.08 at Size 1 and 0.54 at Size 20 (`PLATE_G`). With a fixed gain each pass
lost ~9 dB. Now g = √(amt·0.8 / G): the energy per pass is amt·0.8 whatever
the Size and the type (steady-state accumulation 1/(1−0.8) = ×5, which Mix and
the limiter absorb), and turning Size doesn't change the shimmer. **Freeze** (button
❄: a performance gesture, not a parameter — a frozen tail isn't saved): plate
only. It closes the reverb's input (and with it the shimmer loop:
feeding back a lossless tank would grow without limit) and sets the decay to 0.9995
(the worklet admits up to 1; before 0.98): what was sounding stays, rocked by the
tank's modulation, half an hour until it falls 60 dB. The IR is an FIR and doesn't
retain anything: with «Hall» the button is disabled, and switching to IR while frozen
releases. Panic and Escape release. Evidence: check «shifter» (sine of 440
Hz → 880 at +12, ratio 8710 over the fundamental; → 659 at +7, 5547; energy
1.28), «shimmer» (pluck at Size 4: tail at 3-4 s with/without, plate −55 / −69.5
dB, IR −41.5 / −71.6 dB; tilt ×190 / ×38; at 7-8 s it weighs 0.006 / 0.125 of what
it weighed at 2-3 s: stable; `reverbEnergyGain` reproduces the measurements
0.189 / 0.280) and «freeze» (frozen at 0.5 s, at 5 s it weighs 0.969 of what it
weighed at 1 s; free, 4·10⁻⁵; released at 3 s it falls to 10⁻³ at 6; with the IR it doesn't
act); 155/155; `WK_V` v10. Preset «Shimmer Pad (rising choir)» in
Cinescape; pairs **SHIM 1-2** (diff 0.21) and **SHIM 3-4** (+12 vs +7, 0.24).

**4 Performance sources** ✔ *(done 2026-10-03)* — Wheel (CC1), aftertouch and
expression (CC11) as matrix sources: `wheel`, `at`, `expr`, 0..1 per
engine (0 = rest: a preset sounds the same as long as they aren't touched), one
`ConstantSource` each in `AudioEngine.perf` with 20 ms smoothing (the
MIDI arrives in jumps of 1/127). They are GESTURES, outside CONTROLS and the presets,
like the bend; in Parts they go to all the parts (`parts.setPerf`). They come in through
`ui/midi.js` (`handleMidi`, exported for the probe): CC1 and CC11 ALWAYS feed
their source, in addition to whatever they have mapped. **The wheel's default job
(2026-11-11):** while no matrix row takes «Wheel (CC1)» as its source, the wheel is
vibrato — the Vibrato LFO, raw, through a gain the wheel opens up to ±50 cents
(`WHEEL_VIB_CT`, `AudioEngine._wheelVibSync`), added to the preset's own vibrato and
hooked to a voice only once it has been opened. It is a gesture: nothing is written on
the preset (the old factory mapping turned the Vibrato knob, which did). A row that takes
the wheel ends it: the matrix rules. Measured: ±49.9 ct at the top, ±24.9 at half, 0 at
rest and 0 with a row. Channel aftertouch and
polyphonic aftertouch feed `at` (the source is per engine, not per note). And an
**on-screen wheel** below the keyboard, next to the octave stepper, to play
with the mouse: it moves `wheel` and follows the MIDI wheel ('perf-change'); double click
= rest. Semantics: Wheel → Cutoff at 0.5 opens two octaves; Expression →
Amplitude with amount −1 silences when pressed and with +1 raises up to ×2 (the destination is
1 + amount·source). Evidence: check «performance sources» — wheel →
cutoff at 0.6 (2.4 octaves): tilt ×5.4; aftertouch → pitch at 0.5 (600 ct): the
sine goes from 130.8 to 185.0 Hz, the exact value; expression → amplitude at −0.8:
×0.200; synthetic MIDI CC1 127 / pressure 64 / CC11 0 → sources 1 / 0.504 / 0
in the live engine and the on-screen wheel at 1; 157/157. Preset «Performance
Pad (wheel, aftertouch, pedal)» in Cinescape. No A/B pair in the demo
bank: the probe loads presets and the performance sources don't live in the preset;
the evidence is the check, which goes down the same path (real matrix, real note).

**7 Tape on the master** ✔ *(done 2026-10-03, revised the same day after
listening to it)* — **Tape** module (Room keys `tapeSat`, `tapeWow`): the
whole mix (dry + delay + reverb, all the parts) goes through the same
tape between the sum and the limiter — the «degraded glue» of Arnalds,
Frahm or Guðnadóttir. Two stages, each one EXACT at 0 (dry paths at
gain 1 and wet ones at 0: the usual renders don't change by a single sample;
the «start» check still nails the step at 11.8 ms). **Saturation**:
plain tanh(x) (slope 1 at the origin: a small signal comes out as it goes in),
input 1 + sat² (up to ×2) and compensation 1/(1 + 0.52·sat²) (at full, a sine
of peak 0.5 comes out at the same level), plus a low-pass that comes down in log from 20 to
8 kHz with the knob: the tape darkens as it saturates. **Wow**: an 8 ms line
modulated by an irregular drift (the LFOs' 'drift' buffer at 0.8 Hz,
±6 ms) and a sinusoidal flutter at 6.5 Hz (±6 cents); at 0 the dry path passes
whole, with no latency, and with wow > 0 everything goes through the line. The pitch
deviation is the DERIVATIVE of the delay (2π·f·d): measured, ±33 cents at full on a
440 Hz sine (16.8 Hz of swing) — at full it is deliberately broken tape,
at 0.3 it is the ±12 cents of a real deck.
**The revision** (what Sergio heard with the first version): (1) the saturation
«crackled» with a three-note chord as soon as it was turned up a bit — it was
intermodulation: with the sub at −1 the mix's peak goes over 1.5 and with the
knee k = 2 and input ×3 that was already hard clipping; hence the softer curve,
the ×2 input and the knob squared (the lower half is only color); (2) the wow
at ±7 cents couldn't be heard on a pad that already carries ±7 detune and ensemble, and at ±15
(2nd version) neither («it does nothing»): now ±33 measured; along the way the check
tests the KNOB's path (the Room is born with wow 0 and it is raised live with
`set`: 16.8 Hz, the same as being born at full — the engine wasn't the problem; a
module served from the browser cache could have been: reload with
Ctrl+F5); (3) the **hiss was removed**: a fixed noise that doesn't react to what
you play adds nothing («it doesn't say much to me»), and the air that follows the notes is already
given by each voice's Noise knob. Evidence: check «tape on the master» — 3rd
harmonic of a C3 sine at saturation 0 / 0.3 / 1 = 0.0019 / 0.0139 / 0.1035
(at 0.3 it must be < 2 %: color, not clipping), level at full ×1.00; instantaneous
frequency of a 440 Hz sine (interpolated zero crossings, 20 periods):
it wanders 16.8 Hz with wow at full, born at full and raised live, and 0.000
without; keys in `ROOM_KEYS`; 159/159. Preset «Tape Pad (nostalgia)» in
Cinescape; pairs **TAPE 1-2** and **TAPE 3-4** (wow only).

**5 Resonators** ✔ *(done 2026-10-03)* — **Resonator** module
(`engine/reson.js`, per voice, between the Vocal and the filter, dry/wet like the
Vocal): six modal resonators (2-pole bandpass biquads) tuned to the
NOTE, f_i = f0·ratio_i. «Lite» modal synthesis: a vibrating body is its
modes, and each biquad is a mode with its frequency, its Q (τ = Q/(π·f): how long
it takes to sing and to die out) and its gain. **Material** interpolates the
LOGARITHM of the ratios between a string or tube (harmonics 1…6) and a free-free
bar (Fletcher & Rossing, ∝ (2n+1)²: 1 · 2.76 · 5.40 · 8.93 · 13.3 ·
18.6): in between, the inharmonicity of a piano or a bell. **Decay** = Q
from 10 to 600 in log. **Bright** shares the weight between low and high modes
with Σg² = 2 constant (it doesn't change the level). The bank follows the note and the glide
(its modes slide with the oscillators in mono). **The level problem**,
solved with two input paths: the tonal signal comes in at gain 1 (a
partial right on a mode passes at 0 dB: a saw doesn't blow up), and the voice's
NOISE comes in through its own path boosted ∝ √Q — the noise power that
a resonator lets through is ∝ its width f/Q, so with a common gain at
high Q the bowl didn't sound (−35…−48 dB per mode) and if it was raised for the
noise, the saw blew up. Modes above Nyquist, muted. Evidence:
check «modal resonator» — tables (ratios, Q 10/600, Σg² = 2); noise + sine
at C3 through the bank and, with the note still held (the VCA comes after the bank),
the noise is cut and the modes' **free tail** is measured: with Material 0
it sings at 2·f0 (74 dB over 2.76·f0) and with Material 1 at 2.76·f0 (84 dB over
2·f0); with Decay 1 (Q 600) the tail falls with τ = 0.731 and 0.530 s, against
the theoretical Q/(π·f) = 0.730 and 0.530; with Decay 0 (Q 10) the mode has died by
0.15 s (−67 dB); the bowl with noise sounds at −19 dB RMS; in mono the
bank follows the glide (after C3 → G3 the tail sings at 2·G3, 80 dB over 2·C3,
which is no longer a mode); 162/162 when it was closed. The first version measured the noise
itself (a ratio of two Goertzels, 2·f0 against 2.1·f0) and failed every now and
then: a Goertzel over noise is a Rayleigh draw (two degrees of
freedom; lengthening the window narrows it, it doesn't average it) and the ratio of
two draws has a long tail — 2 out of 30 repetitions failed. The free
tail is deterministic in its rate: the noise decides how much each
mode starts with, not how it dies out. Rewritten on 2026-10-12 and tested by breaking the
resonator (Decay with no effect and Material stuck on string): it detects it. Presets «Singing Bowl (noise + resonator)» and «Bowed Metal
(saw + resonator)» in Cinescape; pairs **RES 1-2** (noise + sine, diff 0.73)
and **RES 3-4** (saw as a string, 0.27).

## Roadmap 6.0 — under exploration (2026-10-04)

Origin: «how do we get richer sounds, with more texture?». I read it as
FINE texture (irregularity on a millisecond scale inside each voice) and a
first block was made, the **Grain**: the voice multiplied by a noise of bandwidth
B (tremor, rasp or breath stuck to the harmonics). **Discarded after
listening to it** («it wasn't what I expected, nor what I was looking for») and removed from the
code. What is really being sought is **complex, stepped sounds**:
the timbre moving in STEPS, with rhythm, generated by an LFO or something like that.
Lesson: faced with a broad word («texture»), ask for a reference before
building.

**What already exists** for that: S&H on any LFO (random steps, one
per period), the wave sequence (the only hand-written step pattern:
frames in tempo, per voice), the RAW LFOs as matrix sources (an LFO that
isn't used for its own job —the PWM one without square waves, for example— is one more
stepped source, at its own speed), per-voice phase (each note of
a chord with its own steps) and the tempo delay. Demonstration: the
**Stepped** factory category (six presets at 120 bpm: one S&H to three
destinations; wavetable + filter + gate in sixteenths, eighths and triplets;
a cutoff staircase and a pitch melody made with three square LFOs at 1, 2 and
4 Hz with weights 4:2:1 — an eight-level binary counter; per-voice S&H; and
four cycles of 5, 6, 8 and 16 steps). Measured: the melody gives exactly 800, 600 … −600
cents, one note per eighth. A fact you need to know: the browser's NATIVE square
wave is band-limited and normalizes the Gibbs peak to 1,
so its plateau is worth ±0.849 — with weights 1/3, 1/6, 1/12 the whole
tones came out at 170 cents; they go ×1/0.849. **What is missing**: written patterns for
any destination (not just the wavetable), tempo LFOs (today they run in Hz: at 120 bpm the
sixteenth is 8 Hz, and they don't start in phase with the bar) and, above all,
several patterns of different LENGTHS — 16, 12 and 5 steps don't
coincide again until lcm = 240 steps (30 s in sixteenths at 120 bpm): each layer is
simple and regular, the whole sounds complex and is still rhythmic (Reich's
phasing, Eno's loops of different lengths). Candidate: a
**Steps** module (lanes with length, division and value per step, as
matrix sources). **Pending until Sergio sees it clearly** before
planning anything.

## Fixed panel (2026-10-12)

Proposed by Sergio: «it's really hard to find the modules… on a physical synth they
would be anchored in a rack and always in the same position». The rack that
reflowed (`auto-fill` + `dense` grid, collapsible groups) becomes a
**fixed-size instrument scaled to the window**, with the whole of Design in
view and no scroll — before, at 1500 px wide, you saw less than a third
of the rack at a time. First it was validated with a static mock-up (approved as
is: «I like everything I see»); then it was built on the
`ui-panel` branch. New: `ui/frame.js`, `ui/rotary.js` (rotary selector),
`ui/display.js` (Output display), switch with LED and vertical faders
(CSS only, over the usual segs and sliders), LFO bank, FM4 operator
table, matrix in compact rows, shared modules that move
between screens. Out: `ui/groups.js` and the `data-screens` filters. The
engine isn't touched and all the `id` / `data-knob` are kept: presets, MIDI
learn and snapshots stay the same. Detail in «Fixed panel, screens and
header». Check «screens» rewritten with the «nothing clipped» invariant and a
«canvas» check (the size is set by the CSS: the sequencer blew up when touched
at zoom 1.3 × dpr 1.5); 170/170.

**Dependencies** *(2026-10-12, requested by Sergio: «if a module, or part
of a module, isn't in use or can't be used with the current configuration,
it should be switched off»)* — `ui/deps.js`: a table of rules read from the engine (what
sounds, per wave, keys inside each module, modulation, room, scene);
switched off = dimmed in place but playable, with the reason in the tooltip and on
the Output display. It replaces the previous dimming (only FM, FM4 and the PWM row,
and blocked). Check «dependencies»; 171/171. Seen along the way: the
resonator check («Decay narrows the modes») is unstable in itself — it excites a mode
of Q 600 (0.4 Hz wide) with random white noise and measures it in 1.1 s; the
ratio came out 90.5 · 30.9 · 7.3 in three passes and once fell below the threshold
(×4). This change doesn't touch it; pending making it deterministic.

## A colleague's opinions (2026-10-14) · 1.1.0

After publishing 1.0, Pat (a work colleague who knows Yamaha FM well)
tried it and left four ideas. They were analyzed against the code before touching
anything:

- **«The arpeggiator in mono should retrigger the envelope»** — it was a bug,
  not a preference. The arp schedules each note-on ~100 ms in advance (120 ms
  look-ahead in 25 ms ticks) but released the previous step with a
  `setTimeout` at the end of its gate. If the gap `dur·(1−gate)` was smaller than
  that lead (1/16 at 120 BPM with gate 0.5: 62 ms), the previous note was still
  «held» when the new one arrived and `_monoOn` took it for legato: it only
  slid, and moreover the slide fell ~100 ms before the grid
  (`glideTo` used `currentTime`). The result depended on the tempo and the
  gate. With FM4 it was more noticeable: the operators' decays didn't
  restart and the pluck only sounded on the first step. Fix: Arp and Seq
  emit the SCHEDULED note-off (`_directOff(id, t)`) right after the on, in
  order, so the overlap is decided by the gate; with gate 1 the off is emitted after
  the next on (tie). `glideTo(freq, time, at)` falls in its place.
  On top of that, the **Trigger** parameter (`monoTrig`: legato | retrig) decides what
  happens when the notes DO overlap (keyboard played legato, gate 1): the
  single / multi trigger of the Moogs and the ARPs. In retrig the old voice
  fades out in max(5 ms, attack) starting exactly at the new one's t0: an
  analog ADSR retriggers from its level, without going back to 0.
- **Look-ahead offset in the note-offs** (the players' «mute hit»,
  seen on 2026-10-02): the voice sounds `lag` = t0 − startAt after
  its musical time (look-ahead + block boundary), but the scheduled
  note-off wasn't shifted: the real gate was gate − look-ahead and, below
  that, mute. `Voice.lag` and `release(rel, at)` / `glideTo` add `lag`.
- **Finding while measuring the handover**: `_releaseParamAt` trusted that
  `cancelAndHoldAtTime(t)` leaves an anchor at t. The specification only inserts
  an event if a ramp CROSSES t; with the envelope settled at the sustain it
  adds nothing and the release ramp starts from the last event (the end of the
  decay, in the past): the gain fell in a straight line from there, all at once when
  scheduled. It affected all the players' scheduled note-offs
  since C2 (their long notes were fading out by themselves). Explicit anchor
  `setValueAtTime(v, t)` with the computed value. The scenes sound somewhat
  different (the tail of the «parts» check goes from −45.3 to −40.6 dB).
- **«Tie the velocity to the operator levels»** — true, and the
  gap was right in FM4: the matrix already had vel→index for the 2-operator FM
  (preset «DX E-Piano»), but FM4 only responded to velocity with
  amplitude and filter. **vel** column (`fm4V1-4`): level × (1 − v + v·velocity),
  computed when the voice is born (the velocity is fixed per note) and live through
  `setFm4`. In a modulator the level is the index. Measured: modulator with vel,
  hard/soft brightness ×12.4; without vel ×1.00; carrier with vel: brightness ×1.00 and
  level ×11.1 (against ×3.3 from the VCA alone).
- **«The algorithms, better with Yamaha's graph than with the knob»** — the
  knob stays (MIDI learn and presets don't change) and the text legend
  «4→3→2→1» becomes the DX7's box diagram, generated from a COPY of
  `FM4_ALGS` in `ui/fm4Graph.js` (a worklet can't be imported from the page;
  the selftest compares the two tables by reading the worklet's source).
  Automatic placement: row = height above the output, column = average of
  those of its targets, fanned out if they coincide.
- **«I like the Classic skin better»** — measured: the text contrast is the
  same (11.9:1 against 11.5:1; labels 4.8:1 against 4.9:1); what changes
  is style (line against dot and arc, CAPITALS, volume). It stays
  as it is; the base is renamed **Carbon** (it clashed with the
  «Cinescape» category).

New checks: «FM4 graph», «Mono trigger» (it simulates the real scheduler
by suspending the render every 25 ms and calling `_tick()`; it counts the attacks of a
pluck: arp/Seq with gate < 1 → 8 of 8, gate 1 legato → 1, every note → 8;
handover with no gap with 45 ms look-ahead; a 30 ms gate with 45 ms look-ahead
sounds; sustain intact until a scheduled off) and «Velocity in FM4»; 177/177.
The demo probe accepts `"velocidad": {prefijo: v}` in the bank (the FMV
pairs can only be told apart by playing softly). Seen along the way: the «vocal 2.0» check
(the Bite's transition) is unstable — it failed 1 of 9 passes today without going through any
of this.

**Output display in two lines** (same day, Sergio's request: «sometimes
it tries to fit a text that's too big and it doesn't fit»). A seg showed as its
value the whole title of its button — an explanation, not a value — and the
value column, of `auto` width, ate the name's: you couldn't even see which
parameter it was. Now: on top the parameter and, to its right, what the
option means (the title without repeating the label) or why it does nothing (that one wins); below,
the SHORT value (the button's label + its `data-cap`: «3 · 2·3·4→1»). Whatever doesn't
fit shrinks the font from 24 to 13 px (monospaced: a rule of three) and, if
not even then, it scrolls back and forth at 35 px/s with a pause at the ends. On
purpose without `prefers-reduced-motion`, like the logo: Sergio has Windows'
animation effects turned off and the text would stay cut off.
Check «Output display»; 178/178.

**Clean chords: headroom on the master** (same day; Sergio: «playing a
chord it sounds like it has ups and downs in volume, as if something were controlling the
total amplitude and clipping»). Measured before touching anything: a C-E-G chord with
each factory preset, limiter bypassed and its algorithm simulated over the
signal. Almost all the pads came in 4-8 dB above the ceiling and the limiter
clipped 5-7 dB throughout the sustain, with a SWING of 4-6 dB (10 in PWM Unison
Pad): its gain followed the peaks of the beating of the detuned saws.
No distortion nor tape saturation on the pads: it was the limiter, meant
as a safety net and working non-stop. Underlying cause: no headroom (a
single note already brushed the ceiling; some went over) and the Master AFTER the
limiter, so lowering it took no work off it. Sergio listened to A/B pairs
(today / with 9 dB of headroom, same peak): «the A ones sound like I tried to
describe to you, and the B ones sound very clean».

Fix (Room.js): `sum → tape → headroom (HEADROOM_DB = −9) → Master →
limiter`. The tape stays before the headroom (its saturation sees the usual
level). The Master in front had been tried and reverted on 2026-10-12 with the
DynamicsCompressor, which let peaks through; the current limiter is
brickwall: 16 notes with the Master at 1 give −1.8 dB. Calibration (103 presets,
dB over the ceiling with the preset's Master, without headroom): 1 note median −3.9 /
p90 −1.1 / max +2.0; 3 notes +1.8 / +5.7 / +10.7; 4 notes in open voicing (C-G-
C-E) +3.5 / +8.5 / +12.0. With −9, the p90 of four notes stays below
the ceiling; the six that still went over (squares and PWM: PWM Unison Pad,
Tremolo Organ, LFO Melody, Chameleon Bass, PWM Ensemble, Table, Filter and
Gate) were also the loudest with one note and lower their Master by −3 dB.
Cost: everything sounded 9 dB quieter — solved with the matched loudness (below). Compensation by number of voices from 2
notes on wasn't used: the sustained notes would change volume when playing or releasing others.
Check «headroom» (4 notes with six pads: peak < −1.3 dBFS = the limiter didn't
get to act; 16 notes with Master at full below the ceiling); the selftest's absolute
level thresholds carry the headroom inside (`HR`); 179/179.
Lesson from the probe: hundreds of OfflineAudioContexts in a single page
knock over the headless renderer (the capture keeps waiting forever):
in batches, one browser per batch.

**Matched loudness in the factory presets** (same day; Sergio, after
trying the headroom: «it sounds really refined and clean, but there are presets that sound
quiet, above all the ones not meant for chords, like the basses»).
The headroom is for chords and was applied the same to a bass that never plays more than
one note; before, the limiter «inflated» everything and hid the differences. A loudness
probe (BS.1770 K-weighting, maximum of 400 ms blocks ≈ momentary
max) per preset with one note and with a chord: medians in their use from −23.9 LUFS
(basses) to −19.8 (pads with a chord) and −28 (plucks, voice, stabs); 40 of 116
within ±2 dB of the median. Rule: each preset goes up or down towards the same
target IN ITS INTENDED USE (one note: basses, leads, percussion, effects and
everything mono; a three-note chord: the rest) with the condition that that use doesn't
reach the limiter (peak of the open four-note chord, or of one note + 3 dB
in case two get tied, below −2 dBFS). Percussion goes up as a block (the
median, capped by each hit's peak) so as not to break the
kit's balance. «Init» stays as `{}` (neutral Reset). Result measured afterwards:
median −15.6 (before −21.1), p10 −19.5 (before −27.5), 82 of 116 within
±2 dB; at the output, with the limiter's makeup, about −14 LUFS. The ones that
fall short have a hit far above the body (plucks, percussion):
as loud as it lets them sound clean. For that the **Master** goes up to ×4
(+12 dB), in log from 0.01 (0.7 falls at 71 % of the turn, as before) and it is
read in dB; the level faders of the Parts mixer and the scene's
master use the same travel. The user's saved presets keep
their Master. Discarded: compensating by number of voices (the sustained ones
would change volume) and a slow automatic leveler (it flattens
crescendos). Checks: «factory loudness» (one note of Slide Bass and Bright
Lead against a chord of Supersaw Pad, DX E-Piano and String Ensemble:
−14 ± 3 LUFS and less than 3.5 dB between them; measured 1.3) and «headroom» redone:
what you hear isn't a peak brushing the ceiling (with random phases and
drifts the peak of a chord varies ±1 dB between passes) but the
limiter working all the time, so it measures the % of 10 ms blocks
clipped (0 % now; 20-32 % with the headroom removed, checked). 180/180.

**Second opinion on the limiter** (same day: Sergio showed
`limiter-processor.js` to another AI, which only saw that file). Its underlying
diagnosis — a peak limiter doesn't match loudness; what's needed is a per-preset
adjustment measured in LUFS (BS.1770) with a reference sequence, and the
limiter only as final protection — is what had already been done (headroom +
Master measured by use). What it contributed and was applied:
- Its warning «if a preset asks for +12 dB, be suspicious» uncovered a flaw in the
  normalization: the probe held the notes for 2 s and ten presets take longer to
  reach their level (Glacial Pad, 12 s attack, received the +12 dB cap;
  with the full attack its chord gave −5.9 LUFS and went over the ceiling by 6.4 dB).
  Re-measured with attack + decay + 1.5 s of sustain and recalculated with the
  same rule (Glacial −9.1 dB, Four Winds −6, Basement Drone −3…).
  LESSON: measure the real sustain, not a fixed window.
- Check «limiter» with test signals: transparent below the ceiling
  (|Δ| 1.5·10⁻⁸ against the input delayed 6 ms × makeup), a burst at
  +12 dB — and another only on R — leaves no sample above −1 dBFS,
  no NaN, and the gain comes back after the silence; TRUE peak between samples
  (×4, windowed sinc) in the worst musical case — 16 bright notes with the
  Master at +12 dB — −0.5 dBTP: the sample ceiling at −1 dBFS leaves the margin
  its dBTP objection asked for; no true-peak detector is needed. 181/181.
What wasn't applied, and why: a «master dynamic control» between the
normalization and the limiter (a compressor that follows the performance is what
made the chords breathe; it itself advises against normalizing note by
note); an `outputTrimDb` separate from the Master (with the Master already saved in the
preset and before the limiter it is the same gain; separating it would only change
what the knob shows); and the limiter's +1.71 dB makeup is a leftover from
when it replaced the DynamicsCompressor (linear, it could be folded into the headroom
without changing a sample).

## Minimoog-style mixer (2026-10-17)

What was noted when closing 1.1.0: the A↔B Mix was a crossfade, and at the center
it lost 3.5 dB with the oscillators detuned. The voice added
`(1−ring)·[(1−mix)·A + mix·B] + ring·A×B`: raising B lowered A, and raising the Ring
lowered both. At the center each oscillator goes at 0.5 (−6 dB), and two uncorrelated
signals (detuned) add POWERS, not amplitudes: 0.5² + 0.5² = 0.5,
that is −3 dB against a single one. Now it is a mixer like the Minimoog's:
`levelA·A + levelB·B + ring·A×B + noise·N`, each source with its own level
(Mixer: Osc A · Osc B · Ring Mod · Noise, linear, read in dB). The Ring
becomes one more source, as on the ARP Odyssey (Sergio's decision): it no
longer eats A or B. In `Voice.js` `normMix` and the `normX` crossfade
disappear: two fewer nodes per voice.

**Exact migration.** Same coefficients: `levelA = (1−ring)(1−mix)`,
`levelB = (1−ring)·mix`, `ring` the same. All the paths through which a
preset comes in (`loadState`, the parts' `applyPreset`, `applySceneJSON`) go through
`withPresetBase`, and that's where `state.migrateMix` does it. It is PERMANENT, not a one-off:
the library keeps copies of the presets in localStorage, all of them with
`mix`. A preset without `levelA`/`levelB` is an old one; if it carries Mix or Ring > 0 it is
translated, and if not, it inherits the base (`PRESET_BASE` already carries A 0.6 · B 0.4, the
Mix 0.4 of back then). The trap: a NEW hand-written preset with Ring and
without levels would be read as an old one. That's why the factory ones with Ring carry
their levels, and the check watches it. The factory (116), the demos (116) and the
2.0 bank (36) were rewritten with a text script (it keeps the format and
line endings). The players' `mix` drift becomes `levelB` (B
comes in and out over A; `Conductor.fromJSON` translates the scenes), and a MIDI learn CC
linked to `mix` now moves `levelB` (`RENAMED` in `midimap.js`).

**The price of adding.** Measured: A and B at full sound **+6.02 dB** over A alone
if they are the same wave in phase (they add amplitudes: ×2) and **+2.88 dB** detuned
50 ct (powers: ×√2). Relative to the old Mix at the center they are +6 dB
detuned. The factory presets don't change by a single decibel (the translation
is exact), but raising both oscillators of a pad eats the master's
headroom: Warm Pad with a four-note chord goes from a limiter that doesn't work
(0 %) to clipping 19-21 % of the 10 ms blocks. It is the same as raising the
Master 3-6 dB, and it is fixed the same way: lowering it. It wasn't compensated automatically,
because dividing by the sum of levels would bring back the crossfade (raising one
would lower the others). There's a prize: the filter's Drive (pre-gain
1 + 4·drive before the tanh) receives the sum, so raising the mixer
saturates more. It is the Minimoog trick of opening the mixer to drive the
filter's input harder.

Check «mixer» (its own category): superposition (a mix at 0.3 · 0.5 · 0.2
against the sum of A, B and A×B rendered separately: −133 dB), in phase
+6.02 ± 0.1, detuned between +2.5 and +3.5 (at 50 ct the fundamental beats at
3.9 Hz and 5 beats fit in the window; with 7 ct a 2 s beat would be needed)
and an old preset against its translation. This last one can't be compared bit
for bit: two renders of the SAME state already differ by ~1·10⁻⁸ (−125 dB from the peak),
so the threshold is −100 dB. Static check «mixer migration» (the
cases of the formula, `{}` is still Reset, no factory preset with `mix`, every
Ring with its levels). In «MIDI learn», the renaming; in «dependencies»,
only B, only Ring. Pairs MIX 1-4 in the demo bank (ring in crossfade
against added; drive with the mixer halfway against full). 183/183.

## Reliable checks and on-screen keyboard velocity (2026-10-17)

**Two checks that failed every now and then**, measured before touching them (a
probe that repeats the check's measurements 20 times, through `tools/shot.mjs` with the
previous JS in a file):
- **«vocal 2.0» (the Bite's transition)**: from 6.3 to 238 with the threshold at 5.
  The no-Bite one is deterministic (0.253 always). What wobbled was the burst:
  it starts at a RANDOM point of the noise (each consonant different, on purpose)
  and is added AFTER the formant bank. A one-bin Goertzel over noise is
  a draw, and the check divided one draw by another: the same disease that
  the resonator had. The transition itself (the vowel axis drops 1.5 and comes back with
  τ = 24 ms) is deterministic. Fix: not removing the randomness, AVERAGING it: eight
  hits in one render (notes every 206 blocks, short release) and the powers
  added before dividing (2·8 degrees of freedom instead of 2). Measured: 15-38
  in 20 repetitions. Without the transition, the burst alone (centered on F2) would give
  less than 1, so the threshold still discriminates.
- **«resonator»**: the 2026-10-12 redesign (measuring the modes' free tail,
  not the noise) holds up; what was borderline was the bowl's LEVEL, from −30.0 to
  −27.1 dB with the threshold at −30. That absolute threshold was left unadjusted when
  the master's −9 dB headroom went in in 1.1.0 (the others carry `HR`
  inside). Now it is measured without the headroom: −19 dB. Five consecutive passes of the
  complete selftest in green.

**Velocity with the mouse.** The on-screen keyboard played everything at 1. Now the
velocity comes from the HEIGHT at which you press the key, as on a piano (you hit
hard at the front edge): at the top, next to the felt, 0.2 (−14 dB on the VCA,
and less filter or FM where velocity moves them); it rises in a straight line up to 85 %
of the length; the 15 % at the edge gives 1, so a click at the bottom sounds as before
(`velFromY` and its two constants at the start of `ui/keyboard.js`). The QWERTY
knows nothing about force and stays at 1; MIDI brings its own. The pressed key glows
according to velocity (`--vel` in the CSS) and the Output display shows «Keyboard · C4
/ vel 0.48», only with the mouse (MIDI and QWERTY don't step on the knob being
turned). Tested with a REAL mouse through CDP with the panel at zoom 1.3 (Sergio's
screen): `getBoundingClientRect` and `clientY` speak the same
space and the heights 5/30/60/97 % give 0.25/0.48/0.76/1.00, as expected. Check
«on-screen keyboard: velocity» (the curve, and a real pointerdown on a
key: voice, `--vel` and display). 184/184.

## Roadmap 7.0 «the instrument» (2026-10-17)

Course set by Sergio: SubSDJ is an instrument for sound design and generation,
not a DAW; more capable, expressive and surprising, open to other
generators; the sounds are exported (SFZ, WAV). The presets are not a
constraint: if an improvement breaks the bank, it is redone from scratch (and along the way,
bilingual). Complete plan in PLAN.md.

**0.1 · Keyboard without hanging notes.** Three faults of the PC keyboard and of
touch: (1) the `keydown` didn't look at Ctrl/Alt/Meta, so Ctrl+Z played a C;
(2) the note was filed by `e.key`, and with Shift pressed in between the
released key arrived as another one (Shift+2 = «"» on the Spanish keyboard): the note hung
until the panic; (3) neither `pointercancel` (the system cancels a touch) nor
`lostpointercapture`. Fix: the tracker map by physical POSITION (`e.code`:
`KeyZ`, `Digit2`, `Comma`…), which also leaves the piano in its place on AZERTY or
Dvorak; the keys' labels are read from the real keyboard with the Keyboard API
(`navigator.keyboard.getLayoutMap`, Chrome) and, without it, those of a US one; with Ctrl,
Alt or Meta the key is a shortcut (AltGr too: it is Ctrl+Alt on Windows). And each
note knows WHO holds it (`'k:KeyZ'`, `'p:<pointerId>'`, `'midi'`): it sounds with the
first one and goes quiet with the last, so the mouse doesn't cut the one the QWERTY holds
nor one finger another's; `pointercancel` and `lostpointercapture` release;
`touch-action: none` on the keys. Check «keyboard without stuck notes» (real
events: Shift between press and release, Ctrl+Z, cancelled touch, two fingers).

**0.2 · SFZ with the real velocity layers.** The exporter made 2 layers only
if `filterEnvAmt ≠ 0`: a preset with velocity → FM through the matrix, → filter through the
matrix or with sensitivity in the FM4 operators came out with ONE layer and lost the
touch; and the soft layer was compensated ×1/vel, as if velocity only moved the
VCA. Now it is MEASURED (`velocityLayers`): the reference note (C4) at velocity 0.3
and 1 as a third-octave band spectrum (averaged FFT, Hann at 50 %),
in dB relative to its total; timbre = the band that moves most among those that
sound (less than 30 dB below the total). A second render at velocity 1 gives the
preset's own RANDOMNESS (free phases, noise, per-note S&H, drift), and the velocity
has to beat it by 2 dB (→ 2 layers) or by 10 (→ 3). Each layer is matched to the measured
level of the hard one. Along the way, two estimators discarded by measurement: the
«brightness» (energy of the 1st difference / energy) is dominated by the fundamental and didn't
see «Touch Keys (vel→filter)» (×1.01: the filter moves weak harmonics);
and the maximum over bands down to −50 dB, or with the randomness as a ×2 factor, gave
false positives in presets with randomness and missed DX Bass (Δ 14 dB with randomness of 8).
Result in the factory: 44 of 116 with layers (17 with three), before 30; well
seen are velocity through the matrix, FM4 and DISTORTION (a soft note saturates
less: Reese, Hoover, Wobble); the per-note S&H ones stay at one (their thing is
randomness: round robin, Roadmap 7.0 · 6.1). Seen along the way: several FM presets differ
by up to 10 dB from one render to another; with seeded randomness offline (7.1) this
measurement will be exact. Check: Reset → 1 layer; «DX E-Piano (vel→FM)» → 3 (Δ 43 dB),
the soft one raised ×3 (more than the ×2.9 of 1/vel: the FM also changes the level).
185/185.

**1.1 · Undo and redo.** `ui/history.js`. GESTURES are saved, not loose
changes: when you start touching a control (pressing inside the screens, a
key over a control, a MIDI control) a snapshot of the state is taken; the gesture
ends on release and after 450 ms without changes (wheel, arrows, MIDI control; on a
selector, on choosing, because it changes AFTER release), and only what
changed in between is saved, with its before and its after. Why gestures and not «every
change that goes through the controls»: in Parts mode the players' drift
moves knobs from the code and would fill the history with steps nobody made.
Loading a preset and Reset are one step each (`record`, it wraps the action).
Undo applies only those keys, control by control: it doesn't cut the notes that are
sounding (loadState does, with allNotesOff), and it goes back to the screen where the
change was made; the Output display says what was undone («Undo · Filter · Cutoff»).
A stack of 100 steps per part. Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z (in a text
field, the field's own undo); ↶ ↷ in the header with what they would do in the
title. Left out, for now: the Wave Editor's drawn table (it lives outside
CONTROLS) and the performance gestures (keys, wheel, bend).

**1.2 · Compare with the saved one.** The «Compare» of hardware synths. ●
next to the preset: it lights up if what is sounding is no longer the loaded (or
saved) preset, computed by COMPARING states with a tolerance of 1e-4 of the range of
each parameter (a knob put back «in its place» with the mouse doesn't land on the same
float): if you put it back, it goes off. Compare toggles between the saved one and your
edit; touching any control while comparing first goes back to your edit (what
you touch is added to it: nothing is ever lost). Per part, like the history;
loading a scene forgets the saved ones. Check «undo · redo · compare»
(gesture = step, the drift isn't; undo doesn't cut a note; preset = step; ● and
Compare; Ctrl+Z undoes and doesn't play a C). 186/186.

**7.1 · Seeded randomness in offline renders.** All the engine's randomness now comes
from `ctxRandom(ctx)` (nodes.js): live it is `Math.random`, as always;
in an `OfflineAudioContext`, a seeded mulberry32 (one per context;
`seedRender(ctx, s)` before creating the engine chooses another roll, meant for the
round robin of 6.1). It is used by the noise, the reverb IR, the Vocal's Life and
Bite, the per-note S&H, the random Arp and — through a seed that the voice passes to
each oscillator in `processorOptions` — the worklet's free phases and drift
(which carries its own copy of mulberry32: worklets don't import the engine).
Result: two equal renders differ by 6e-8 (the order in which Chrome adds the
inputs of a node), another seed 0.3. The scenes check no longer seeds
`Math.random` by hand (and no longer demands «presets without randomness in the worklet»); a new
check «seeded randomness» with a state that carries ALL the randomness at once.

Where the 10 dB between renders seen when measuring 0.2 came from: a probe over
the 117 factory presets, three renders of C4 with the main thread's randomness already
seeded (only the worklet's remains). Supersaw, unison and drift move the level
up to 2.6 dB (the beating of detuned copies: analog character, it stays). The
big one was the **phase of the 2-op FM modulator**, drawn on each note: with integer
ratios the relative phase shares the energy among harmonics in a different way, and
after the filter «DX Bass» varied 6 dB. It wasn't only a renders thing: live,
a phrase of six identical C4s came out from −21.7 to −29.4 dB (7.7 dB) on
«DX Bass» and from −19.7 to −27.8 on «FM Bass»; at C2, ±1 dB. **Key sync**: copy
0 of the modulator now starts at the carrier's phase (that of the Phase knob),
like the FM4 and like the DX7 by default; the unison copies stay random.
Every note is identical. With the DX7's phase «FM Bass» ends up darker at C4
than its old average (−32.4 against −24.5 dB); in its register (C2) the same.

With repeatable renders, the SFZ exporter no longer does a second render at
velocity 1 to measure the preset's randomness (it was the floor that velocity had to
beat): the two notes share the roll and only differ in velocity.
Factory: 45 of 117 with layers (21 with three); what the randomness hid appears:
«Lottery Pluck (S&H)» goes from 1 layer to 3 (its filter env follows velocity).
187/187.

**0.3 · Wavetables without interpolation noise.** Measured first, and the
plan's hypothesis (harshness in the lows) was the other way round. Method: the oscillator
alone, with no window, at f0 = k·SR/N so that each harmonic falls EXACTLY on a bin
(with Blackman-Harris the leakage of 512 harmonics added over thousands of bins doesn't let
you see anything below −50 dB); everything that isn't a multiple of k is error. With
linear and tables of 4 samples per harmonic: −52 dB at C1, −49 at C2, −46 at
C3, −43 at C4 (peak −57 around 2.2 kHz), −61 at C6. It rises 3 dB per octave
because the tables get shorter (each mip measures 4× its harmonic cap), until
the 256-sample floor oversamples them again. (The PolyBLEP saw:
−50…−35 dB, but its aliasing falls next to Nyquist.) Alternatives measured: 4× +
Hermite, −49 at C4 (the bottleneck is the oversampling, not the interpolator); 16× +
linear, −61.5 at the worst level with memory ×3.2; **8× + Hermite: from −76 to −85
dB on all notes**, memory ×1.7 (~290 KB per set), +5 % CPU on the Wavetable
and creating a node 0.28 → 0.31 ms. Chosen. Hermite (Catmull-Rom) over the mix
of the morph's two frames (it is linear: mixing first gives the same). Along the way
linear's drop in the highs disappears (−1.6 dB at 16 kHz → −0.03). Check
«clean wavetable» (frame 4 of 'analog', full-band saw + square):
C2 −77 · C4 −70.9 · C6 −83.5 dB, threshold −65. 188/188.

**3.1 · Drive with character.** Two curves and a bias instead of the three modes the
plan proposed: **soft** «character» (the usual tanh) or **fold** (a sinusoidal
fold y = sin(π/2·x) over ±24, in an 8193-point curve: with gain 1 it is
a soft saturation, at 10 the wave folds several times per half-cycle), and an
**Asym** knob that works for both: it is the bias b of y = f(g·x + b) − f(b).
«Soft + Asym» is the plan's asymmetric; «fold + Asym», the wavefolder's
symmetry — a third «asymmetric» mode would have been the soft one with a fixed bias.
Preliminary numbers in Node (sine at 0.6): in the tanh the 2nd harmonic goes from −31 dB (bias
0.05) to −16 dB (0.3), with a great deal of DC (−6 dB below the fundamental); in the
fold the brightness rises and FALLS with the Drive (centroid 5.47 → 5.26 → 5.61 at 0.7 / 0.8
/ 0.9) and the level barely moves (±1.5 dB), ~3 dB below the tanh (DRV_FOLD_MK
1.4 matches it); with symmetry 1 (a quarter wave) the curve becomes even and the
fundamental disappears: the octave sounds. How: the bias and its compensation are
ConstantSources (at the input and at the output of the curve: the knob moves without
regenerating curves, and −f(b) is computed by interpolating the curve like the WaveShaper), and a
1st-order DC blocker at 5 Hz (IIRFilterNode) on the saturated path (−0.1
dB at 40 Hz; the soft one without bias doesn't change audibly). Fold oversampled
4x (it adds 0.13 «simple voices» to the cost, measured; the Asym, nothing). The character
changes live (the curve jumps: a click, like changing wave). Check «character drive» with f0 = SR/336 and a window of 60 periods (each harmonic in its bin, the
mean = the real DC): asymmetric H2 −13 dB and DC −∞; exact silence
with all the bias in both characters; brightness of the fold sweeping the Drive through the
matrix (velocity → Drive) 1.00 … 2.98 → 2.82 … 5.32 → 4.75, the soft one always
rising; symmetry at full: fundamental −∞. UI: the drive group (Drive ·
Asym · character) on the Filter's bottom row and the slope on top, next to
Type (the filter's structure); that row at 52 px per control to fit in the band.

**2.4 · More destinations in the matrix.** Levels A, B, Ring and noise (the mixer's
gains), Drive, Pitch A and Material. A level that goes below 0 inverts the phase and
sounds: it is left like that (AM through zero; with reasonable bases, 0.5 ± 0.5, it doesn't happen, and
clipping it would cost a WaveShaper per voice and slot). Drive: the slot comes in through
a gain of the voice's own (the knob's travel in curve units: 4 in the
soft one, 9/24 in the fold) to the input gain; it only sounds with Drive > 0 (the
rule says so). Pitch A: the detune of oscillator A alone (for the sync sweep,
3.2). Material: the knob interpolates the LOG of the ratios, so in cents it is linear
and each mode moves what separates string from bar (0, 555, 1019, 1391, 1699, 1962
ct): exact; but the modes' WEIGHTS (gains ∝ r^−e normalized) follow those
of the knob, so «knob 0 + matrix +1» doesn't sound the same as «knob 1» (13 %
difference): it retunes, it doesn't change material entirely. Decay does NOT come in: the biquad's Q
is linear and the knob goes in log, and the noise comes into the bank with a gain ∝ √Q that
would have to be moved at the same time. Check «matrix · new targets» (levels at 0 go silent,
noise and ring appear, Pitch A raises A by an octave and leaves B) and, in the
resonator one, the free tail with Material through the matrix sings at 2.756·f0 (94 dB over
2·f0). Pairs DRV 1-8 (asymmetry, fold, LFO to the Drive, symmetry) and VEC 1-2 (vector
morph with an LFO). 190/190.

**0.4 · A common clock.** `engine/Clock.js`, one per context (the parts of a
scene share a context): the ORIGIN (audio instant of beat 0) and the BPM;
`nextGrid(t, div)`, `stepAt`, `beatAt`, `timeAt`. Before, each Arp and each Seq
started its clock on the key press (now + 30 ms) and added up durations; the conductor
kept another one (pos, posT); and a player that played a part with Arp or Seq gave it
the key through a `setTimeout`, so the arpeggio started wherever the
timer happened to fall. Now: the conductor ANCHORS the origin when starting (its beat 0); without it,
the first one that runs in tempo sets it on its first note (+30 ms from the key, with no
added delay) and those that join go to the grid; the origin is kept
as long as someone is still in tempo. Arp and Seq store the next step in BEATS
(`clock.begin / sync / advance`): a new BPM re-anchors at the current beat and the
remaining steps are remapped without jumps; if the origin is set again (the
conductor starts with an arpeggio sounding), each one relocates to the first point
of the new grid (the clock's «epoch»). Changing the division on the fly jumps to the
next multiple of the new one. A player's key arrives right away, with its instant
(`noteOn(id, f, vel, when)`): it joins the arpeggio, or is the Seq's root, from
that step on (`from`), and the Seq's Retrig is applied at that step; the note-off still goes
by timer and `clearPending` removes from the Arp/Seq whatever hasn't started yet. The
first step is scheduled on the spot (it doesn't wait for the first `setInterval`). The
wave sequence still runs per voice from its noteOn (an arpeggiated chord leaves the
voices out of phase in the same phrase: that's its charm). Check «common clock» (clock
arithmetic + real time with two engines and `_directOn` intercepted: by hand
+30.0 ms; Arp 1/16 and Seq 1/8 coming in 130 ms later, on the grid at 0.000
samples; a key with an instant at beat 2 of an anchored origin, Δ 0; after 120 →
90 BPM, on the new grid and with the gaps of 90). The «trigger» check simulates the
Arp offline: now it starts with `_begin(0.03)`, like a key. Pending: Arp and
Seq OFFLINE (they run on `setInterval`), needed to export to WAV what sounds
in them (6.2). 191/191.
Along the way, an old Parts fault: the BPM knob only reaches the `S` of the
chosen part (and the room, shared); the Arp, the Seq and the wave sequence of the
OTHER parts read their old `S.bpm` — with the common clock it would have been worse (on
joining, a part could impose its old tempo on all of them). Now the right tempo is
`engine.bpm` = the room's, and the clock syncs with it at each step,
wherever the change comes from (knob, loading a scene, the conductor).

**2.2 · Tempo LFOs, with retrigger and one-shot.** Each LFO of the bank with its
**sync** (one selector per row): free (Speed in Hz) or a division — 4 bars … 1/32,
with dots (×1.5) and triplets (×2/3) — and then its speed comes from the BPM and
Speed is switched off (the rule says so). How it falls on the grid: an OscillatorNode doesn't
admit a start phase, so a global tempo LFO is read from a looped one-period
BUFFER (the same ones as the per-voice LFOs) started with the phase it
should have on the common clock (phase 0 at the origin's beat 0); the oscillator goes through
a gate and the handover is scheduled 20 ms ahead, sample-exact. The
clock NOTIFIES (`clock.listen`) when the BPM or the origin changes and the engine rebuilds its
tempo LFOs and the speed of each voice's ones. The **phase** goes from two to four
modes, one for all the LFOs that can go per voice (cutoff, reso, vibrato, PWM,
pan; the tremolo always goes after the mix, global): global · per voice (Weyl) ·
**retrig** (each note starts them at phase 0: the LFO tied to the note) · **once**
(one cycle from the note, the buffer WITHOUT loop, and it goes quiet at its end: sin,
tri and saw end at 0; S&H and drift have no end and behave as in retrig). The
per-voice phase no longer wraps (`phaseNow`): in «once», 1 = finished.

Finding along the way, measured: **the «global» LFOs stayed frozen
between notes.** Chrome doesn't process a node that doesn't reach the destination, and an
unprocessed oscillator doesn't advance its phase; the global LFO only reaches the destination
through the voices that use it, so in silence it stopped and, when
the next note hooked it, it carried on where it had left off — in practice,
almost a «retrig» (two notes at 0 and at 0.37 s moved the same, 0.0000
difference). With sync it would have come out 100.8 ms off the grid (measured
by removing the fix). Fix: each global LFO hooked to the destination through a
gain of 0 — it truly runs free, as its design said. Along the way it changes the
phase with which notes start in presets with a global LFO: now it depends on
when you play, as on a hardware synth (whoever wants the old behavior has
«retrig»). And the engine's startup hands over the source on the spot (not 20 ms
later: there is nothing sounding to hand over). Check «tempo LFO» (1/8 at 120 BPM =
4.000 Hz at 0.000 ms from the grid of an anchored origin, hooked to the output
halfway through the render; after 90 BPM, 3.000 Hz on the new grid; retrig 0.0000
against global 0.468; once ×3 in its cycle and ×1.0000 afterwards). Pairs LFOT 1-6 and
PHASE 3-6. 192/192.

**2.1 · Mod Env: a modulation envelope with loop.** A FREE envelope, only
for the matrix («Mod env» source, 0..1, no velocity), with A/D/S/R, its curve and
three modes. A panel on the **Sequencing** screen (Sergio's decision: Design's Voice
band was full; it is, besides, the screen of movement), in front
of the Part Mixer, which gives up its place. **normal** = ADSR, like the filter's;
**trigger** = A → D → R in a row, the note-off doesn't touch it (the whole curve even if
the note lasts 20 ms); **loop** = A (0 → 1) + D (1 → 0) repeated while the
note lasts — the sustain doesn't count (if the loop went back to the sustain, it would jump from S to
0 on each pass) —: ONE cycle in a 4096-sample buffer at 8 kHz (the attack
fraction and the curve; cached by shape) read in a loop with playbackRate =
duration/(A + D), so the period is EXACTLY A + D and it doesn't cost a node per
repetition. On release, the buffer stops at t and a ConstantSource carries on from the
value it had — computed, because the shape is known, also for the players'
scheduled note-offs — with the release and the curve. It is born on
demand (a slot that uses it); if the matrix asks for it mid-note, the loop
starts at the phase it should have. The three envelope helpers
(`_envSegs`, `_relChain`, `_envValueAt`) now accept the curve as an argument.
Check «Mod env» with its raw output on a separate channel: loop A 10 ms + D 90 ms
periodic at 0.1 s with an error of 2.4e-7, from 0.000 to 1.000; on release, a jump of 0.0003 and 0
after R; trigger with a 20 ms note: 0.500 in A + D and 0 after R (in normal, the same
note is already at 0.344); normal holds at 0.500. Pairs ENVM 1-4. 193/193.

**2.3 · Steps (polymeter).** `engine/Steps.js` (one per engine) and
`ui/stepsControls.js`. Four lanes of values −1…+1 (up to 32; flat keys
st{i}Pat like wsPat), each one with division (1/32 … 1 bar, triplets),
smoothing, rotation and rotation drift (+1 every N bars: Reich's
phase shift), and a common reset. A panel in the bottom band of **Sequencing**,
between Harmony and Player (Sergio's decision; the Player shrinks and the band stops
being Parts-only). The core idea: a lane's step at t is COMPUTED from the common
clock — k = `stepAt(t, division)`, index = (k + rotation + drift) mod length
— without scheduling anything; so «Steps i · note» (the value of the step on which the
note starts, fixed for the whole note: arpeggios, plucks, polyphony) is exact offline too,
and everything falls on the grid of the Arp, the Seq and the conductor. The continuous
flavor («Steps i»: the step also moves a sustained note) is one ConstantSource
per lane and engine scheduled in the look-ahead (offline, everything at once up to the
end of the render): a step = `setValueAtTime` + a 4 ms ramp (a click-free step)
up to the whole step (smoothing 1: a glide that arrives at the end of the step).
Reset «on play»: the Steps join the clock with the first note after
silence — if nobody else runs in tempo, that note is step 0 — and they RELEASE it when
the engine is left with no voices nor tails (otherwise, an Arp that started later would have
to wait for its grid instead of sounding at +30 ms); «never» = they follow the clock's
origin; «every N bars» = they go back to 0. The real-time scheduler
stops when things go quiet. The label computes how long what is sounding takes to repeat (in
ticks of 1/96 of a beat: integers for all the divisions): 16 · 12 · 5 in
sixteenths = 240 = 15 bars (the plan said 30: wrong); with drift, the rotation's
lap counts (5 steps + 1 every 2 bars = 10 bars). A trance gate is a
lane on Amplitude. A naming detail: the CSS classes go with `ps-` because
`st-row` already belonged to the selftest panel (and it threw it completely out of place). Check «Steps»
(exact staircase with 0 error at mid-step; maximum jump 0.0113 per sample
from −1 to +1 = the 4 ms ramp; smoothing 1 at the middle = 0; rotation and drift; cycle
15 and 10; per note 1 / 0.5; after the silence, «on play» goes back to step 0 and
«never» carries on — the voice's start falls 5 ms after the key, on step
11). Also tested in real time (the source's value follows the computed
step with error 0; the scheduler stops when things go quiet). Pairs STEPS 1-6.
194/194.

## Welcome window and black keys (2026-10-24)

**Welcome window** (`ui/splash.js`, Sergio's idea after seeing a
colleague's: ours, with an old-school demoscene touch). At first it was a
full-screen intro (the old SubSDJ's emblem spinning in metal, a scroller…);
Sergio preferred it modest: a centered MODAL window, with the instrument
behind it darkened and desaturated (`backdrop-filter`), no emblem nor scroller.
On top, a little 168 × 66 px screen at double pixel (`image-rendering:
pixelated`), computed pixel by pixel every frame: plasma (four sines that
shift, one radial) with a cyclic 256-color palette plus the interference
of two wave sources moving in Lissajous (their rings cross: the
moiré), with a vignette and scan lines; and the **name** in copper bars (one
color per line, rising: the Amiga's Copper) with a light edge, shadow and a
shine that runs across it, which comes in with an **ordered dither** fade (Bayer
4×4). Below, in HTML: the **ENTER** button with cut corners and a flowing gradient
border — the gesture the browser asks for to start the audio;
Enter also goes in, and while the window is up the keyboard doesn't play notes
(`stopImmediatePropagation` in capture) —, and at the
foot the version, its date (`RELEASE` in `version.js`; the version check
demands that it be the CHANGELOG's), the code (with the GitHub icon) and the license. The window scales
with the instrument (`zoom` = `uiZoom()`: on a 4K at 150 %, 1.3).
It reopens as **«About»** (the «SubSDJ v1.2.0» title in the header, or
File ▾ → About SubSDJ…): the button says BACK, and Escape or a click outside
close it. That's why on closing it is HIDDEN and the effect stops, instead of
being deleted. Watch out for the keyboard: it also listens in capture on `window`, so
the window's guard is registered ONCE at startup, before it (the
first registered is the first to hear), and only acts with the window open.
The colors are the brand's, not the theme's: `--sp-*` tokens in `:root` (the skin's rule: no color
literal outside there), the canvas palettes as lists of stops read
with `tokenList` from `theme.js`. It sits statically in `index.html` to be there
from the first paint; out with `?selftest` or `?nosplash`
(`tools/shot.mjs` removes it unless `SPLASH=1`). Check «welcome window»
(a frame that paints, the whole name, the date).

**Black keys centered** between their two white ones (Sergio's decision). Before
they imitated the offset of an acoustic piano (C# and F# towards the left, D# and A#
towards the right), and on screen it looked as if they were misplaced.

**1.3 · Output meter.** In the Output module, next to the spectrum: see
«Output meter» above, under Screens. Check «output meter»: a
burst at +12 dB marks 14.8 dB of reduction and lights the LED, the output doesn't
go over the ceiling (−1.00 dBFS) and in silence the peaks are 0 («−∞»).

**2.5 · Macros.** Two knobs, **macro 1** and **macro 2**, at the foot of the Matrix:
sources `mac1` / `mac2` (0..1) through the same path as the wheel or the
expression (a `ConstantSource` in `AudioEngine.perf`, 20 ms smoothing), but
their value belongs to the PRESET (`macro1` / `macro2` in `PARAMS`): they are saved,
go into undo and are learned with MIDI map like any knob. With the
same macro in several slots, a single control moves several destinations, each one
with its slot's amount. At 0 they move nothing (like everything that is `act`), and
with no slot using them they come out dimmed with their reason. The alternative —
macros that move any parameter with their own range and curve — was parked
(it would clash with undo and MIDI learn). Check «macros»: Macro 1 → pitch +0.5 and
→ amplitude −0.5 in two slots: the sine goes from 130.6 to 185.0 Hz (the exact
value) and stays at ×0.500; Macro 2 → cutoff at 0.6: tilt ×5.4. Pair **MAC 1-2**
(a pad with three slots on Macro 1: filter, drive and resonance), diff 0.98.

**2.6 · Touch response.** Two different things, in the keyboard bar
next to the wheel. **Touch** (soft · linear · hard) is the velocity curve
of whoever PLAYS, not of the preset: v^0.5, v, v^2 (a MIDI note at 64 is born at 0.71 /
0.50 / 0.25), it is remembered in this browser (`subsdj.tacto.v1`) and applies to
MIDI and to the mouse — on the mouse, over the height of the press and
keeping the floor of 0.2, so that the top of the key still sounds —; the
PC keyboard knows nothing about force. **Bend** (±1…±24 semitones) belongs to the PRESET
(`bendRange`): MIDI sends the normalized bend (−1..1) and each engine scales it
with its range, so in Parts the bass can drop an octave (±12) while the
pad bends a tone (±2) with the same wheel; changing the range with the wheel moved
rescales live. Check «touch response»: the three curves through MIDI and through
the mouse, buttons and memory; bend at full with ±12: 130.8 → 261.3 Hz (the octave),
with ±2: 146.9; live +0.5 gives 100 ct with ±2 and 600 with ±12. No A/B pair: the
probe doesn't move the bend nor play softly.

**3.2 · Hard sync (sync).** **sync** button in the Osc A header
(it didn't fit in its rows): A starts its cycle again with each cycle of B.
The resulting wave repeats at B's rate, so the NOTE is B's, and
A's pitch becomes TIMBRE: how many pieces of its wave fit in each cycle
of B before the cut. Sweeping A's pitch (matrix «Pitch A») gives the screech
of the sync lead; moving both (vibrato, pitch env, «Pitch») changes the note
and leaves the timbre. Inside (`pulse-processor`, `_synced`): A doesn't hear
B; it carries a GHOST phase at B's frequency — its own without Pitch A ×
`syncRatio` = 2^(octB−octA)·2^((detB−detA)/1200), which the voice sets per note
like the octaves and the detunes; everything else moves both and cancels out — and when
it wraps around it resets its own. For that «Pitch A» now goes to a separate
parameter of A, `slave`, which doesn't touch the master (without sync, everything sounds the same as
before). Each reset is a step of height H = w(0) − w(phase at the cut):
it is corrected with the step's PolyBLEP residual (the edges' one, with its
real height: H/2·(1−τ)² on the sample before, −H/2·τ² on the one after) and its
change of slope with PolyBLAMP (ΔS·(1−τ)³/6 and ΔS·τ³/6); the natural
edges go through the same path, so without resets it is the usual
PolyBLEP. A single master for all the copies (stacked and unison are
reset together). Waves: saw, square, triangle, sine without FM and wavetable; the
Supersaw and FM4, without sync (the button comes out dimmed). With B at level 0 the
Osc B module stays alive — it keeps time — except its wave and its stacked copies; A's
Phase is dimmed (it goes back to 0 with each cycle of B).

Measured at f0 = k·SR/N (energy outside B's harmonics): the plan's
target was −60 dB, and it wasn't realistic with two-sample PolyBLEP — the FREE
saw is already at −43 dB at C4 —; the criterion becomes «as clean as the
free oscillator at its pitch». Saw at C4 with A at +702 ct: −41.5 dB with
sync, −41.3 the free saw at 1.5×, −21.4 the uncorrected sync (20 dB less);
square −44.2; sine −82.1 (−65.7 without the slope correction). The
triangle at 1.5× ends up like the saw (−42.8): the cut catches it in the trough
and gives a full-height jump. Cost: ×1.3-1.9 per copy (`COST.syncMul`
2). Check «hard sync» (through the engine and with the loose oscillator; live, the
button reaches the sounding notes with the octaves' ratio) and pairs
**SYNC 1-4** (env and LFO to Pitch A, without and with sync; diff 1.38 and 1.35).

**3.3 · String (extended Karplus-Strong).** **String** wave in the wave
rotaries (A and B) and a **String** module (Bright, Decay, Position, Stiffness; common to
both oscillators) next to FM4: it didn't fit, and the Wave Editor, the widest
in the band, gave up its 139 px (its canvas goes down to a 150 px minimum and its bar is
squeezed into one row). Inside (`pulse-processor`, `_string`): a delay
line of one period per copy (4096 samples: down to ~12 Hz) into which, when
the note is born, a period of noise is injected — the pluck — and which on each pass
goes through a FRACTIONAL all-pass (the non-integer part of the period; its
coefficient is computed to give the right phase delay AT the note, not the
0 Hz Thiran approximation), a one-pole low-pass (Bright), four dispersion
all-passes (Stiffness) and the loop gain (Decay). The tuning
matches the phase delay of the whole loop at the note with sr/f: measured,
0.00 cents (resolution 0.05) at C2, C4 and C6, with and without stiffness; and from C2 to C7 in the probe.
- **Decay** = T60 of the fundamental at C4, which shortens towards the highs
  (×(261.63/f)^0.5, as in real strings); the gain discounts the
  low-pass's loss at the note and never goes above 0.9995 (stable).
- **Bright** is NOT a cutoff: it is how long the 8th harmonic lasts relative to the
  fundamental (from 3 % to 90 %, log), and the pole is computed per note and per Decay
  to achieve it (a quadratic in b: (1−R²)b² − 2(cos ω − R²cos hω)b + (1−R²) =
  0). So Decay lengthens without changing the color and the color is the same across the whole
  range; with a fixed cutoff, the highs of a long note died just as
  fast. First version (cutoff at 1-7 octaves above the note): discarded for
  that reason.
- **Position**: a comb over the pluck (plucking at a fraction β cancels the
  harmonics that are multiples of 1/β: in the center, the even ones).
- **Stiffness**: the DC delay of each all-pass goes from 1 to 19 samples
  on a log scale (linear in the coefficient, from 0 to 0.5 nothing happened and everything
  happened at the end): at 0.5 the 10th harmonic rises 3 cents (a piano), at 0.75 26 and
  at 1 almost a semitone and a half (bell). On high notes it is limited so that it
  fits in the loop.
- **Velocity** = the pluck's force: a two-pole low-pass on the noise from
  0.5 to 6 octaves above the note; from 0.3 to 1, the attack's highs rise
  14.9 dB. The pluck is normalized in level: the volume is the VCA's business.

Cost: ×1.2 a saw per copy, ×1.8 with Stiffness (`COST.string` 0.01).
Check «string» (tuning, how it dies out, Decay without changing the color, velocity
and stiffness, through the whole voice); pairs **STRING 1-6** (bright, position,
stiffness) and the **Plucked Strings** factory category (Nylon Guitar, Twelve-String Guitar, Harp, Koto,
Plucked Bass, String Piano and String Bell), with the Master measured by the PEAK of the strum
(−3 dBFS) and not by the average loudness: a pluck is almost all attack, and
taking it to −14 LUFS would make the limiter eat the hit.

**4.1 · A delay that runs away.** The delay's feedback is no longer tied to the
Amount (it was 0.85·Amount with a 0.8 cap): its own **fdbk** knob (0-110 %), at the foot
of the Delay next to **sat** (tape saturation INSIDE the loop). Amount is
only the send. Above 100 % each repeat comes back louder and the echo
grows until the saturation holds it: it stays oscillating stably (the dub
siren; with Time moving, the pitch slides). In the Room, each branch of the
ping-pong's cross feedback is split between the clean path (1 − w)
and a saturated one tanh(D·x)/D (w) — gain 1 at small signal, ceiling 1/D —, with
w = the Saturation or, if greater, the one the feedback demands (from 0 to 1
between 90 and 100 %): above 1 the loop is bounded by construction. D = 1
+ 9·sat² (the lower half is color). No oversampling in the WaveShaper: its
delay would misalign the two paths (comb). Compatibility: a preset without
`dlyFb` receives it computed as before (`state.migrateFb`, in
`withPresetBase`) and with Saturation 0 the saturated branch is worth 0: the usual
echoes, exact. In Parts, the Fdbk knob in the mixer's Room column
is the same control (up to 110 %) and the Saturation belongs to the room. The wheel and
the macros don't reach here (the matrix modulates the voice; the echo is in the room):
to play it, MIDI map. In Sequencing the band is lower: the foot of the
Delay goes with a 2 px margin. Measured: at 110 % the level goes from −19.8 to −18.6 dB
between seconds 5-6 and 9-10 (stable, peak 0.22); at 50 % it falls more than 150 dB;
the 3rd harmonic of the repeats of a loud sine, from −150 to −13.9 dB with
Saturation 1. Check «runaway delay»; pairs **DUB 1-4**.

**5.1 · Sequencer articulations.** Per-step suffixes, as on a 303:
`!` accent, `~` tie, `/` slide, `x2`-`x4` repeats, combinable
(«7!/», «0x3»). In the step editor: Shift + click = accent, Alt + click =
tie → slide → nothing, Ctrl + click = repeats; they are drawn (a yellow, thicker
cap, a dash, a diagonal up to the height of the next one, a split
cap) and dragging the pitch keeps them (`stepToken`, the canonical token).
- **Relative accent**: if the pattern has any, the steps without accent drop to
  0.6 of the velocity (with the QWERTY, which always goes at 1, otherwise the accent wouldn't
  be heard); and the matrix source **«Accent (Seq)»** is worth 1 on the accented
  note (`Voice.acc`, like the velocity): the preset decides what an
  accent does — Accent → Cutoff is the 303's. Dimmed if the Seq isn't on
  or the pattern has no «!».
- **Tie and slide**: the step doesn't release its note; the next one CONTINUES it
  with `AudioEngine._directGlide` (it changes the pitch of the sounding voice without
  a new attack: all at once in the tie, with the preset's Glide — or 60 ms if
  it is at 0 — in the slide), in Poly and in Mono. A rest ends it.
- **Repeats**: n hits in the step, each one with 0.8 of its gap at
  most (so that the next one attacks again).
- **A fix along the way — the glide started too early.** `Voice.glideTo` used
  `cancelAndHoldAtTime(t)` to fix the starting point, but if there is
  no automation after t (the note already reached its pitch) Chrome doesn't
  leave that point, and the ramp started from the last event: the note's start.
  The slide rose from the beginning of the step (158 Hz on average where there should
  have been 130.8) and the Mono legato with Glide, the same. Now each parameter
  remembers its last pitch and until when its ramp lasts: with one in progress,
  cancelAndHold cuts it; without one, the point is set by hand.
Check «Seq articulations» (4 / 2 / 3 attacks for plain / tied /
repeats; accent +4.4 dB and the source only on its note; slide 131 → 260 Hz in
one attack, Poly and Mono; legato with Glide not moving before the key) and pairs
**ART 1-2** (flat line / with accents and slides; hold a key). Four
new phrases in the Seq bank: «Acid Slides», «Questioning Acid»,
«Long Ties», «Rolls».

**5.4 · Swing and breathing pulse.** Global **Swing** (a Room key, like the
BPM; knob at the foot of the Arpeggiator): in each pair of steps of a binary grid
of an eighth or less, the second one arrives late — it falls at the `swing` fraction of the
pair (50 % straight, 67 % triplet, 75 % dotted) — and the pair lasts the same. It is
applied by the COMMON CLOCK (`Clock`: `swingDelay`, `swingLen`, `swungTime`, and
swung `stepAt`/`nextGrid`), so the arpeggiator, the sequencer (and its
repeats), the Steps and the players (Pulse and Melody) swing at the same time;
each step lasts what it really lasts (`stepSecs`), so the gate doesn't step on the
next one. Quarters and triplets aren't swung; nor are the delay and the tempo LFOs
(they don't go by steps). **Breathing pulse**: two more knobs on the Player's
Pulse — **Breathe** (extra hits at the peak) and **Cycle** (bars) —:
k rises bar by bar up to k + Breathe and comes back, on the cosine of the
Arrangement's Sway; with Breathe 0, the usual pulse. Check «swing and breathing
pulse» (the clock arithmetic; the Seq at 0 / 166 / 249 / 415 ms with 2/3
swing — expected 0 / 167 / 250 / 417 —; hits 2-4-6-4) and pairs **SWG 1-2**.

**5.2 · Notes by degree.** A selector next to the Seq's phrases (`seqNotes`):
«semitones» (as always) or DEGREES of a scale from Harmony, counted from
the held key — degree 0 is the key, going past the last one goes up an octave and
the negative ones go down —, or «harmony»: the SCENE's scale (Parts; each part
receives `engine.harmony` when created) starting from the key, which is placed in that
scale (or on the degree below if it isn't one of its own): with the root the player gives,
the phrase moves inside the key (from the F of C major, F lydian).
Without a scene, «harmony» goes in major from the key (dimmed, with the reason).
`Seq.semis(off, raíz)` computes it and it is used by the engine, the editor's preview and
the editor's octave line (on the degree that closes it). Three new phrases
«by degrees» that, when chosen, set the major scale if the notes were in
semitones. Check «notes by degree» (correspondences; the Seq in dorian, measured:
steps at 300 and 711 cents — 300 and 700 —; the parts see the harmony) and pairs
**DEG 1-2** (the same phrase in major and in dorian).

## Polish and settle (before 1.3.0)

**Factory audit** (2026-10-25): the 124 presets, each one in its intended
use (one note for basses, leads, percussion and FX; a three-note chord for the
rest), measured: how hard the limiter squeezes (its own meter data),
clicks on attack (where the attack isn't 0 on purpose) and on release (the second
difference of the signal against that of the sustained note, and against the peak),
DC (the mean against the RMS of the sustained stretch), NaN. Result: no
preset squeezes the limiter in its use, none clicks, none gives NaN — and 19
carried **DC**, up to 61 % of their level. (Careful when measuring: in a sound that
has already died out, the ratios shoot up on leftovers at −100 dB or less; you have
to look at them relative to the peak too.)

**No DC.** A pulse of width d has mean 2d − 1 (the 20 % one, −0.6): on
an analog synth the output is AC-coupled and that doesn't come out; here it reached
the tape, the limiter (headroom lost on one side) and the delay loop whole,
where it accumulates. Two fixes: (1) the **pulse comes out centered** from the
oscillator (pulse-processor: it subtracts 2d − 1 on each block; at 50 %, exactly
0), so PWM no longer moves the DC at the rate of its LFO — which a high-pass
can't remove without eating lows —; (2) **AC coupling** at the
end of each part (AudioEngine: a one-pole high-pass at 5 Hz after distortion,
flanger and chorus, before the sends), which catches whatever anything else
adds. At 20 Hz it takes off 0.25 dB. Measured: «Square Lead» from 57 % to 0.25 %, «Rave
Hoover» from 61 % to 0.16 %, «PWM Ensemble» from 59 % to 0.31 %. The centered pulse has
somewhat higher peaks (up to +1.6 dB on «Square Lead»), but the loudest in the
factory is still at −1.0 dBFS and none gets to compress. Check «no DC».

**No clicks when moving knobs.** Audit: with a note sounding in a state with almost everything
switched on, the 135 numeric parameters changed ALL AT ONCE from one end to the other (like a MIDI
control that jumps), measuring the jump at the sample of the change against the note before and the one
after. Only one gave a scrape: **delay Time** (from 0.3 to 4 s the head traveled 3.7 s of
tape in 20 ms: pitch ×185). Now the echo time changes as on a tape (Sala, DLY_SLEW 0.9:
the initial slope never goes above 0.9 s per second, so the tape never runs backwards): a
small move arrives in 20 ms and slides the pitch (the dub); a large one is a continuous sweep —
when lengthening the echo the pitch falls by up to ~3 octaves, the tape braking —. Check «no clicks when moving
knobs» with ten representative ones.

**Note events and scenes.** Voice stealing (14 notes over 10 voices, pad and bass), Panic with a
low chord sounding and the same key again during its release: no jump above
×1.8 (the ×1.8 is the new note's attack). The repo's scenes (Parts, offline 34-60 s, the
limiter's own meter): none squeezes it, but three sounded ~10 dB quieter than the
ambient one and than the presets (RMS from −25 to −31 dB, peaks from −8 to −13). They are made of hits and arpeggios, with
16-20 dB between peak and mean, so they aren't matched on the mean (they would hit the limiter) but by the
peak: the room's master from 0.7 to 1.93 (Dorian Dawn), 1.12 (Robot Choir) and 1.66
(Hypnotic Techno), for peaks around −4 dBFS; the choir measured: peak −4.1, RMS −21.4, limiter
not working. (The copies of the scenes already in a library don't change by themselves: delete them
and ⟲ Restore factory.)

**Nothing clipped with Parts on.** The screens check measured with Parts off, and there the
scene's modules are empty or «off». With them on, the **Player** spilled into the Arrangement in
all its modes (its content measured 487-545 px in a 349 px panel: the mode's knobs plus the
«Part arrangement» column) and the **Part Mixer** overflowed 27 px at the bottom: the fixed panel cut off the M of
each part and the Room's «Layer» checkbox without anything failing. Now: the part's arrangement (Enters ·
Drift · Amount) is a compact row in the **Arrangement** panel («part N», the one the rack edits),
the Player keeps only the mode and its knobs in five columns (the Pulse, with ten, in two rows), the
Steps canvases go from 384 to 288 px (9 px per step with 32) to make room for it, and in the
Part Mixer the M moves up to the name's row. Two checks: «screens» also checks that no module
overflows (those with scroll, like the Library, don't count) and a new one turns Parts on and
goes through the Player's modes. On the old code, it fails with the Player in chord, melody,
root and pulse, and with the Part Mixer.

## English (1.4.0)

Decided on 2026-10-25: SubSDJ goes ONLY in English (the neutral language of soft-synths and of
panel silkscreens; no multi-language: other languages lengthen the words on a fixed panel). And on
2026-10-26, Sergio: the inside too — the keys and values of the JSON — and, even though
we talk in Spanish, everything that goes into the synth, in English.

**Glossary first** (docs/GLOSSARY.md, approved by Sergio): every term fixed once —
modules, controls, matrix sources and destinations, notes and scales, categories, the 160
presets, phrases, scenes and the internal identifiers —, with the convention of synth
panels (Cutoff, Resonance, Glide…) and device abbreviations if it doesn't fit (Fdbk, Sat, Amt).

**What was saved still loads** (engine/legacy.js). Presets, scenes, libraries and MIDI
maps stored keys and values in Spanish; since 1.4.0 everything is written in English and what
came before is translated WHEN LOADED: `migratePreset` (three parameter keys — vocVida,
vocBrillo, resBrillo — and the text values: 'tabla' → 'wavetable', 'placa' → 'plate',
'1 c' → '1 bar'…) in withPresetBase, like migrateMix and migrateFb; `migrateScene`
(subsdj-escena-v1 → subsdj-scene-v2: the keys of the conductor, the players and the arrangement,
modes, scale, and the names of the factory presets it refers to) in
applySceneJSON; `migrateLibrary` (subsdj-biblioteca-v1 → subsdj-library-v2) when reading the
library from its old localStorage key — which is kept intact — and when importing an
old file; and midimap.RENAMED for the maps. In the library, a factory preset that
the user didn't rename (its name is its seed's) moves to the English name and its seed with
it, so «Restore factory» doesn't duplicate it; what was renamed keeps its name. Check
«1.3.0 compatibility»: a preset with old values = its English version over the base; an
applied v1 scene = the same scene written in v2 (identical JSON); a v1 library in its
old key (sections, seeds, favorite, user data, demos out, restoring the factory
without duplicating); a MIDI map with vocVida.

**How it was translated without breaking anything.** In phases, each one with the selftest green: (1) the
inside, with literal substitutions per file and, for the conductor's keys, only in
the CODE part of each line (a naive pattern turned «pulso que respira:» —«breathing pulse:»— in a
comment into «breathe:»); the repo's JSON banks were translated keeping their hand-written
format, checking that each translated preset = migratePreset of the original (with the
keys sorted: a rename changes the order); (2) the interface: index.html in stretches with
exact substitutions that have to appear exactly N times (otherwise nothing is written),
and the JavaScript's texts; the module titles are also KEYS (deps.js «sec:» rules,
activity.js LEDs, SALA_PANELS), so they change at the same time; (3) the demos (prefixes
in English: STRING, TAPE, PHASE, MIX, DEG…) and the whole README and CHANGELOG.

**The A/B demos leave the main bank**: they are test pairs, not instruments. They are no longer
seeded (FICHEROS_REPO) and the migration removes the seeded ones; they are loaded with File ▾ → Import.
Without them, the whole library fits on the Presets screen.

**Everything else followed** (Sergio, 2026-10-26: «I would move EVERYTHING to English»): the code
comments, this notebook, PLAN.md, the glossary and the selftest were translated the same day — six
parallel passes, each checked with a script that strips the comments and requires the remaining
code to be byte-identical to git HEAD — and from then on everything new is written in English,
commit messages included. Only the conversation with the assistant stays in Spanish. The
identifiers still in Spanish (sembrar, ESCALAS, Sala…) and the Spanish file names get their own pass.

## The 1.5.0 factory bank (2026-10-26)

Block 8 of Roadmap 7.0, with its own plan in [BANK.md](BANK.md): criteria, references
(what the DX7, the Juno-106, the Minimoog charts, the Prophets, the minilogue xd, the D-50,
General MIDI and the modern soft synths ship), the triage of the 160 old presets and the
format. What the notebook keeps is how it was built and what was measured.

**Format.** `engine/presets.js` is a list of categories, each a list of entries
`{name, tags, use, root, play, data}`; `FACTORY` ({category: {name: data}}) and `META`
(name → entry) are derived, so the library, the scenes (`factoryPreset`) and the selftest
kept their API. `use` (note / chord / hit) and `root` are what the selftest renders;
`tags` (a fixed vocabulary, `TAGS`) and `play` travel with the library item outside `data`
(Save never overwrites them), the search matches tags, the picker and the Presets screen
show `play` as the tooltip. `engine/bankCheck.js` validates the metadata and computes the
**coverage**: 131 features (every wave and wavetable set, sync, unison, ring, noise, FM and
feedback, every LFO shape and sync and phase mode, every filter type, drive and fold, every
mod-env mode, vocal, resonator, every FX, flam, glide, every arp mode, the sequencer's
tokens, both wave-sequence modes, swing, every matrix source and destination), each read on
the effective value and only when audible (B counts if its level is up; an LFO shape if the
LFO has a level or feeds the matrix). `tools/bank-report.mjs` prints the table; the selftest
fails on a hole. The first draft had 14 holes (square LFO, retrig/once phases, normal mod
env, arp down/random, ties and repeats, swing, the raw tremolo and PWM LFOs as sources, the
four «Steps · note» sources): each one became a preset that needed it anyway (the robot
talks in square steps, the wobble restarts with the note, the pluck reads a Steps lane at
note-on, Sonar pings a chord at random).

**Retiring the old bank without touching anybody's library.** The library seeds the
factory and keeps copies; replacing the factory meant telling an untouched copy from one
the user edited. Each seeded item now stores the fingerprint of its data at seeding
(`seedFp`, FNV-1a of the canonical JSON) and its section (`seedSec`); for what 1.4 seeded
there is a table of 164 fingerprints in `engine/legacy.js` (`LEGACY_FP`), generated from
the old code before it was replaced. `library.syncBank` runs when `BANK_REV` differs from
the library's: a factory / repo-bank / scene item with its seed name, its seed section, its
seed fingerprint and no ★ goes; everything else stays; empty bank sections go, a user's
empty section stays; the new bank comes in with its categories first; `files = false` so
the scenes re-seed. Seed keys carry the revision (`factory:2:Name`) so an old tweaked
«Warm Pad» (key `factory:Warm Pad`) does not block the new one; and the library's old
rule — same name and same content never twice — means an old ★ copy identical to a new
preset simply stays as the new one. The archive `subsdj-bank-1.4.json` is a library file
(sections «1.4 · …», the scenes with their presets inlined) that imports whole, twice
without duplicates; the 13 old presets kept as they were are skipped by that same rule.
*Same day, Sergio: «why do I see repeated presets?»* His library had been seeded weeks
before 1.4 and «Restore factory» only ever ADDED what was missing, never updated a copy: his
factory presets still had the Masters from before the 1.1.0 loudness matching, so the sync —
comparing with the 1.4 content only — took every one of them for an edited copy and kept it
next to the new one. Fix: the table now holds every version the factory ever shipped, built
from git (the 45 commits that touched `presets.js`, the 2.0 file or the scenes, each imported
and translated with the current `migratePreset`/`migrateScene`: 238 seeds, 605 fingerprints,
with the sections each one was seeded into), and `BANK_REV` went to 3 so the already-synced
libraries sync again. The lesson: a library is a copy, and a copy seeded at any commit is
«untouched» only against the history, not against today's code.

**Measuring the bank.** The factory batch renders each preset in its use — one note at
`root` (C2 for basses, C4 for leads, C3 for the rest), a major triad, or one 50 ms hit —
with the sequencer and the arpeggiator off (wall clock), holding for attack + decay +
1.5 s (the 1.1.0 lesson: measure the real sustain; Glacier Pad renders 24 s). Per preset:
NaN, silence, the limiter working (% of 10 ms blocks over −1.3 dBFS: 0 % everywhere), the
momentary loudness (BS.1770, −14 ± 3 LUFS), DC (mean of the last 400 ms of the sustain
against the peak: under 1 %), a second short render without space FX for the dry tail (all
below −80 dB 0.4 s after the release), and the Master that would land it on the target
(bounded by a peak ceiling: −5 dBFS for a note, −3 for a chord, so a tied note or a fourth
one still clears the limiter; hits aim at a −4 dBFS peak instead of a loudness). The ping
carries the suggestion and `tools/bank-level.mjs` writes it into the bank: one pass put
71 presets at −14.0 ± 0.5 LUFS; the decaying ones (plucks, strings, arps) stop at their
peak ceiling, 3 to 10 dB lower in momentary loudness, as loud as they can be while clean.

**Similarity.** From the same render, a spectral fingerprint: energy in dB of 24
third-octave bands (50 Hz – 12.8 kHz, biquad band-passes of Q 4.3) over three windows —
the first 250 ms, 250 ms around 70 % of the hold, the first 250 ms of the release — each
vector centred on its mean (level-independent); the distance between two presets is the
RMS of the dB differences. Over the 103 presets the median distance is 16.8 dB and the
closest pairs are 1.8–2.6 dB (Cathedral Pad / Supersaw Pad, Juno Brass / OB Brass, Juno
Brass / Accordion…). The fingerprint sees the spectral envelope, not the motion, so
Solina Strings / Trance Gate (2.3) are alike on paper and nothing alike by ear; the
threshold is 1.5 dB and the batch logs the twelve closest pairs for the ear to judge.

**What the bank taught about the instrument.** (1) The matrix has no amount
modulation: a source is a value, so the wheel can offset the pitch but cannot scale the
vibrato, and nothing reaches an LFO depth, the echo or the reverb — the «wheel = vibrato»
convention fell on that; vibrato comes in with `lfoFade` instead, and amount modulation
goes to the plan. (2) A player set to «off» crashed `Player.schedule` offline: the mode
resolved to `this._off`, the note-off helper; live the Conductor never scheduled it. (3) A
Steps lane with values in twelfths × a pitch amount of 1 is an exact semitone sequencer
(Steps Melody). (4) Scenes can reserve a part for the player (`keys`): seven of the eight
do, and they are levelled by the peak of a 16 s offline render.

## Amount modulation in the matrix (2026-10-31)

What the bank found missing (BANK.md, criterion 5): a matrix source is a VALUE, so the wheel
could offset the pitch but not dial the vibrato in, and nothing reached a modulation's depth.
The fix is the smallest one that makes the matrix general: six destinations **Amount 1 …
Amount 6**. A slot pointing at «Amount n» adds its source to slot n's amount, in the units of
slot n's knob (±1): wheel → Amount of the vibrato slot is the mod wheel of every keyboard;
aftertouch → Amount of a filter LFO; Env → Amount makes the vibrato wide at the attack and
calm in the sustain; S&H → Amount gives each note its own depth; a macro → three Amounts is
one knob over three modulations. Modulation of modulation: the DX7's «amplitude modulation
sensitivity», the Eurorack VCA on a CV.

**How it is wired** (`Voice.js`). Each slot is already a per-voice `GainNode` whose gain is
`amount × span(destination)` with the source connected to it. For «Amount n» the destination
params are simply `[mxSlots[n].gain.gain]`: the modulator's gain node feeds the target's gain
AudioParam, which ADDS to its base value. The span of an «Amount n» destination is the span
of slot n's own destination (`_mxSpan`, following chains, cycles = 1), so ±1 of the modulator
equals ±1 of the target's knob. Two details: (1) `mxRewire(i)` chains — after wiring slot i it
rewires every slot j whose destination is «Amount i», because a rewired slot has a NEW gain
node and the modulators pointed at the old one; a `seen` set cuts the chains, so a modulator
defined before its target (slot 1 → Amount 3) gets wired when slot 3 is, and cycles stop.
(2) A slot pointing at its own amount is ignored. `deps.js`: a slot whose knob is at 0 but
is fed by another slot is live (it used to be dimmed as «amount 0»), «Amount n» of a free
slot is dimmed with its reason, and a self-pointing slot says why.

**Measured** (check «amount modulation», with a sine and `hzOf` by zero crossings): vel →
Pitch at 0 plus wheel → Amount 1 at 0.5: wheel 0 → 130.8 Hz, wheel 1 → 185.0 Hz (+600 ct
exactly, vel 1 × 0.5 × 1200); the same with the modulator in slot 1 and the target in slot 3;
a self-modulating slot → 130.8; Env → Amount with sustain 0.2: +600 ct at the attack, +120 ct
in the sustain. A/B pair AMT 1-2 in the demo bank. In the bank, the four leads route the
vibrato LFO to the pitch with a hair of depth (0.004–0.005) and the wheel to that slot's
amount (0.03 = ±36 ct at full): wheel = vibrato depth and brightness.

## Ear session: Marimba, Gong, Accordion (2026-10-31)

Sergio's verdict on the 1.5.0 bank: fine, but the FM imitations «are far from what they name
and not clean». The method of the percussion session, now a tool: `tools/render.mjs` renders
a JSON of candidates (notes, durations, velocities) through the real engine to WAVs normalised
to −3 dBFS, and a Goertzel scan of each WAV says which partials are there. Three rounds:

- **Marimba.** The old preset was 2-op FM with ratio 4. Measured at C4: partials at 1×, **7×
  and 9× at 0 dB**, 11× at −10 — nasal metal. A wooden bar is additive: its tuned partials sit
  at 1×, 4× and 10×, and FM with ratio 4 can only produce 1 ± 4k = 3, 5, 7, 9… — no setting of
  the index reaches 4 or 10. FM4 in additive mode (algorithm 7, four carriers) with ratios 1 ·
  3.92 · 9.8 and decays 1.4 · 0.16 · 0.05 s, velocity on the two upper partials and a 120 ct
  thump: «genuinely good». FM stays useful only for a mallet click.
- **Gong.** The old 2-op FM (ratio 2.74, index 8) rang like a struck wire. A gong is a plate:
  inharmonic partials with their own decays, and the brightness arrives AFTER the strike. FM4
  additive with 0.5 · 1 · 1.52 · 2.37, decays 3-4 s, the filter closed at the hit and opened
  by its own envelope over a second, feedback on op 4 for the air, a 6 s plate. The first
  version (1 · 1.52 · 2.37 · 3.61) was «genuine, a small gong»; the sub partial and the longer
  decays made it big.
- **Accordion.** Two saws with chorus and vibrato are a saw with chorus. The accordion is the
  musette: three reeds per note beating at 2-4 Hz (unison ×3 at ±10 ct), a narrow pulse for
  the reed, a breath of air, the filter following the keyboard and a 5.5 Hz bellows tremolo —
  no chorus, no vibrato.

The lesson for the rest of the FM presets: measure the partials before tuning by ear; when the
target has a known spectrum (bars, plates, reeds) the additive algorithm with per-operator
decays gets there in one round, and FM proper is for sounds whose spectrum IS the sideband
family (e-pianos, bells, brass).


## Sound fingerprint and format version (2026-11-01)

Two small pieces of plan items 7.2 and 7.4, built together because they answer the same
question Sergio asked: *what happens to the people who were using the synth when we update?*

**What happens today, in order.** The code comes from GitHub Pages, so everyone runs the latest
version (after the browser cache lets go of the old modules: Ctrl+F5). The library lives in
their browser (localStorage of this origin) and is a copy: the factory, the repo scenes and
the old user presets were *seeded* into it the first time, and from then on the user owns it.
When the factory bank changes, `BANK_REV` goes up and `library.syncBank` runs once: the
factory copies the user never touched (same name, same section, same content, no ★) leave and
the new bank comes in, so untouched factory presets *do* update themselves; a copy the user
edited, renamed, moved or starred stays as it is, with its old sound, and the new preset of the
same name comes in beside it (the Presets screen marks the edited copy with ●, and ⟲ Restore
factory brings the factory as it is now without touching what the user changed). Their own
presets keep every setting: a key that changed its meaning is converted on load, exactly
(cutoff 0..1 → Hz, Spanish → English, Mix → levels in `withPresetBase`), a setting a later
version added is missing in the old preset and takes the default, and a setting the version
does not know is dropped when the preset is loaded into the rack. The version number says how
far that goes: Z and Y never change the sound of anything saved; X means something saved may.

**What was missing.** Three holes, all of them «old code meets newer data», rare with Pages but
cheap to close, and one silent loss:

- The library in localStorage written by a NEWER SubSDJ (a local copy, a fork, a browser profile
  that visited a newer deployment): `load()` did not recognise its format, took the key as
  empty and **overwrote it** with a freshly seeded library. Now it is moved aside under
  `subsdj.library.v2.unreadable`, reported (`library.unreadable.reason`), the preset bar says
  so and File ▾ gets *Export unreadable copy* / *Discard unreadable copy*; a fresh library is
  seeded beside it. Junk in the key (not JSON, not ours) is kept aside the same way.
- Importing a file with a format this version does not know (a `subsdj-library-v3`) fell
  through to the «loose map of presets» path and made junk items out of its top-level keys. Now
  every file SubSDJ writes says `subsdj-<kind>-v<N>` (`legacy.KNOWN_FORMATS` has the kinds and
  the highest N this version reads; the Spanish v1 kinds are translated as before) and
  `unreadableReason` refuses a newer N whole, with «made by a newer SubSDJ: update the synth»,
  and an unknown kind with «not a SubSDJ file». Scenes get the same message.
- A newer file with settings this version does not know was imported with them silently
  dropped. The cleaner now counts what it drops and the notice says «N settings this version
  does not know were left out (file from SubSDJ 1.7.0)»: `exportData` carries `app`.
- A save that did not land (quota, private window, blocked storage) was swallowed: the user kept
  editing and lost everything at the next reload. `save()` now reports it (`onSaveError`, the
  bar says «File ▾ → Export it»), and `navigator.storage.persist()` is asked for once so the
  browser does not evict the library under storage pressure.

**The fingerprint (7.2).** The factory batch already rendered every preset in its use and
computed a spectral fingerprint (24 third-octave bands × 3 windows, dB, mean-centred) to find
look-alikes. `subsdj-fingerprints.json` now stores, per preset, the hash of its data
(`library.canon/fnv`, the same one the library uses for seeds) and that print. In the batch,
a preset whose data hash matches the stored one is compared with its print: further than
`FP_TOL` = 0.1 dB away and it fails — *the sound changed with the same data*, which is exactly
what a refactor of Voice, a shared clock or a changed default would do without anyone noticing.
A preset whose data changed (or a new one) has no valid reference and a summary row says so
until it is renewed: `BANK_OUT=x.json node tools/run-selftest.mjs "selftest=1&batch=factory"`
then `node tools/bank-fp.mjs x.json` (only the changed ones; `--all` rewrites every print).
Measured on 2026-11-01: two renders of the whole bank are at most 0.004 dB apart (seeded offline
renders; the stored print is rounded to 0.01 dB), 25× below the alarm. The script is the
preset's own use rather than the «awkward» one the plan imagined: the batch that tunes the bank
is the reference, and one render per preset keeps the batch at ~75 s.


## The exciter: a bowed string (2026-11-01)

Everything SubSDJ had was a strike: energy at the start (the pick, the hit, the FM4
decays) or an oscillator through an envelope. Sustained noise into the resonator is wind over
a body — linear, no pitch lock, no regime. Roadmap 7.0's «new generators» and the agreed order
after 1.5.0 put a *continuous exciter* next: energy fed in through the body's own motion, a
nonlinearity plus feedback, which is what makes a bowed string or a blown pipe answer to a
GESTURE with its timbre and not only its level. Sergio: «lo que mejore cualidades y
expresividad». The bow came first; the breath is next.

**The model.** The String already lived inside the oscillator worklet as a Karplus-Strong loop
one period long (the fractional allpass, the Bright lowpass, the Stiffness allpasses, the Decay
gain), which is where a bow has to go: a loop with exact sample delays cannot be closed in the
WebAudio graph. `_bowed` is the same loop split in two at the bow point — Smith's digital
waveguide bowed string. Position is the fraction of the string on the bridge side: that segment
is a pure integer delay with an inverting end; the long one carries the losses and the
fractional tuning, so the total is sr/f and the pitch is measured within a couple of cents of
the pluck's (C2 +5, C3 −1, C5 +1; the friction pulls a little, as on a real string). At the
junction: vh = the two incoming velocity waves; Δv = v_bow − vh; the friction passes a fraction
f(Δv) ∈ [0, 1] of Δv — STK's bow table, ((|Δv + 0.001|·slope) + 0.75)⁻⁴ clamped — ~1 when
stuck and falling fast once it slips, and that velocity goes out both ways. Stick, drag, slip,
once per round trip: Helmholtz motion locked to the loop. The output is the wave travelling
towards the bridge through a one-pole at f0: the bow's velocity is a pulse train (flat up to
1/β), the bridge FORCE is its integral, a sawtooth — measured h2…h5 at +2, −9, −13, −16 dB, and
without the integrator +6, −2, −4, −5 (nasal). Pressure is the table's slope = how wide the
stick region is, read in units of the bow speed so that Speed only scales the motion and
Pressure alone sets the regime (before normalising, a slow bow behaved like a heavy one and the
level followed Speed at ×0.4 only): 0.8 (light: it lets go easily, thin), 0.64 at the middle of
the knob (the classic bow, a sawtooth), 0.065 (heavy: it sticks most of the period and the
fundamental takes over; below 0.03 the string chokes). The knob is a curve: between the two
regimes (slope 0.3-0.55) the motion settles slowly, ~6 dB over a second, and the knob crosses
that zone between 0.5 and 0.7 so that neither the default nor the heavy end sit in it (a scan
of thirteen pressures, 2026-11-01). The landing also seeds the loop with white noise ∝ (1 −
contact) · speed, the bite of the first grip: without it a mid bow took a second to build up.
Measured at C3: harmonics
2-8 move 10 dB RMS from mid to heavy, around 0.7 the 2nd harmonic cancels (stick and slip even
out: hollow). Speed is the bow velocity, 0.03 … 0.3 in velocity-wave units, scaled by the key
velocity; Noise is slow noise on it, the grain of the hair. The bow point colours as it should:
sul ponticello (4 %) keeps 10 dB more upper partials than sul tasto (40 %).

**The envelope is the note's.** Contact and speed rise from 0 over the Amp Env's attack (the bow
lands: contact first, √e, then speed — 0 is a bite, 0.3 s a swell) and, when the note is
released, the Voice posts `{lift, rel}` and they fall over the release: the bow comes off and
the string rings on by Decay (measured: with r 1 the string is still at −24 dB half a second
after the lift). No Onset or Lift knobs: the ADSR already says it, and the String module had no
room for them. That was the layout decision: the agreed «scroll body» layout waits; the bow is
a button in the String title and three mini knobs (Pressure, Speed, Noise) in a row under the
four — the panel grew 0 px in width and the band 0 px in height.

**Playing it.** Bow pressure and Bow speed are Matrix destinations (±1 = the whole knob): the
aftertouch → pressure of the Cello is the note that swells and digs in, expression → speed the
dynamics, an LFO → pressure a bow tremolo, a macro → both. Mono legato keeps the same bow and
slides with Glide: a finger on the string. Checks («bowed string»): sustains within 3 dB over a
second, tuning ±6 ct C2–C6, the bow point ≥ 8 dB, the three pressures all sustain within 8 dB
and heavy is another regime (≥ 6 dB RMS on h2-8), the landing follows the attack, aftertouch →
pressure and expression → speed through the real path. Pairs BOW 1-6. Presets: Cello, String
Section, Bowed Glass, Bowed Metal remade (BANK_REV 9), rendered for Sergio's ear.

**What the breath will share.** The same two-segment loop with an open end, a jet nonlinearity
(a saturating curve with the jet's own delay) in place of the friction table, breath noise ∝
pressure, and the same Pressure / Speed / Noise knobs: pressure = breath, speed = the jet's
length (which harmonic it locks to: the overblow), noise = air.


## The exciter, second half: the breath (2026-11-01)

The same loop, blown. Cook's flute as in STK is the skeleton: the bore is a delay line open at
both ends (no inversion over the round trip, like the pluck's loop), the returning wave goes
through the loop's losses — Bright, Stiffness, and the open end's reflection = min(0.9, the
Decay gain): a pipe cannot ring like a string — and is DC-blocked; the jet feels the breath
minus half of that wave (the embouchure), travels its own length and hits the edge, x − x³
clamped: the jet deflects one way or the other and saturates, so what it feeds the bore depends
on the bore's own pressure (the feedback), on where it rests on the edge (the DC of x) and on
the delay (the phase it arrives with). That last point is the whole instrument, and STK leaves
it as a fixed ratio. Here the jet's travel is **tied to the breath**: a harder breath is a faster
jet, a shorter time to the edge — ½ of the bore up to the reference breath (the fundamental in
phase: the note in tune), then 0.5 / breath down to ¼ (the second mode in phase: the octave).
So Pressure does what it does on a flute: little, the jet never reaches the slope and only
the air goes through the pipe; enough, the fundamental locks; pushing, the note goes sharp
(+16 cents at 0.6); past the jump (≈ 0.65), a clean, stable octave, slightly flat. The jet's
injection is capped at 1.3 × the reference: beyond it the regime went chaotic (0.8 a mess, 0.9
the octave, 1 a mess). The **Jet** knob is where the jet rests on the edge, 0 … 0.35: centred,
x − x³ is odd and only the odd harmonics come out (hollow, a closed pipe); offset, all of them;
beyond 0.35 the slope is too low (0.375 overblew by itself, 0.5 died). **Air** is white noise
into the bore ∝ breath, the puff of the first instant is the bite. The output is scaled by
(1 − reflection) so the level does not follow Decay; a long Decay still brightens the loop
(Bright's pole is computed against T60) and a 3 s bore at Pressure 0.5 overblows by itself —
the Overblown Drone sits there on purpose.

**Two measurements that mattered.** (1) The first scan came out 20-60 cents sharp everywhere:
the DC blocker inside the bore (a one-pole at 0.995) LEADS by ~8° at C4, and a lead in a loop
is a shorter loop. R = 0.999 and its phase delay paid back in the line like the lowpass's:
−0.1 … +1 cents from C3 to C5. (2) With the jet's travel clamped to 0.6 below the reference,
the note was +30 cents at low breath; clamped at ½ it is in tune down to the threshold.

Checks («blown pipe»): sustains, ±8 ct C3-C5, little breath ≥ 20 dB below the note, a lot
overblows (the strongest partial at 1200 ± 60 cents), aftertouch → Bow pressure takes it from
the fundamental to the octave, the edge moves the 2nd harmonic ≥ 4 dB, the landing follows the
attack. Pairs BREATH 1-6. Presets: Breath Flute remade (the Vocal «u» as a tube is gone: the
tube is the loop), Pan Pipe, Bottle, Overblown Drone (BANK_REV 10).


## The breath, debugged by ear (1.6.1, 2026-11-01)

Sergio, an hour after 1.6.0: «hay una especie de vibrato/vibración, un poco artificial y
tirando a molesta» on a held Breath Flute, not the vibrato LFO. Measured (a held C4, the RMS
envelope every 5 ms and its spectrum; the pitch every 50 ms): a 19 Hz breathing, 20-50 % peak
to peak, sidebands at f0 ± 19 Hz at −15 dB, the pitch wandering ±12 cents; at G5, ±41 Hz.

**The cause** was the DC blocker inside the bore's loop. A one-pole high-pass at 7.6 Hz lets a
19 Hz component through at 0.93 and leads it in phase; in a loop of gain 0.9 with a
nonlinearity that is enough for a slow limit cycle. Raising its corner to f0/3 killed the
breathing but misaligned the second mode (a lead can only be paid back at one frequency) and
with it the overblow; removing it left the DC to shift the operating point. **The fix**: the
blocker sits in the jet's branch only — what the jet feels is DC-free, the bore's own DC rides
along (bounded: the jet's offset × 10) and is blocked at the output; the slow loop gain through
the jet is 0.9 − 0.37 < 1, so nothing breathes, and the blocker's lead is paid back in the
jet's travel. Two more things came out of the same session: Cook's x − x³ folds back beyond
0.58 and bred chaos at mid breath (±18-50 cents) once the blocker moved — a tanh sigmoid at the
edge keeps every regime steady (±0.0 cents at C4, G5; the overblown octave within ±0.1); and
with the jet at half the bore an asymmetric deflection adds no even harmonics (the jet cancels
its own), so the Jet knob is the jet's rest point on the edge, 0 … 1 (2nd harmonic −61 → −28 dB).
The jet now shortens as (reference / breath)^1.6 past the reference, so the sharpening before
the jump stays under 50 cents and the octave arrives at 0.8 on the knob, steady.

The lesson for the notebook: a high-pass inside a high-gain feedback loop is never free — its
phase lead at the loop's slow modes can breed a slow oscillation, and its lead at the modes
you tune can only be compensated at one of them. Put it where the loop does not go round.

## A lighter header: icons and a clock (2026-11-01)

Sergio, after time playing: the BPM looked like the Delay's and the swing like the Arpeggiator's,
yet both drive everything in tempo; and the header, measured at 1920 with Parts on, had **0 px**
left (the Save-as field was already giving up 33 px). He once took the icons out because icon +
label on every button was redundant; an icon **alone**, with its name in a tooltip, is the other
half of that decision. A canvas mock-up first (two variants for Parts and Reset; he chose
layers over two quavers, and the circular arrow over an eraser, keeping Reset in the bar —
Ctrl+Z undoes it), then the code.

- **Icons**: inline SVG, 16 px, stroke 1.6, `currentColor`: the theme colors them, and hover,
  «on» and disabled come from `.btn` as they did with text. 13 buttons of 32 × 28 (the same
  height): the nine text buttons went from 575 px to about 300.
- **The tooltip is the label**, so it cannot take a second: `ui/tips.js` shows its own at once.
  The `title` stays the source (Save, Undo, Compare, the deps reason and the status keep writing
  `.title`) and an observer moves it to `data-tip` as it appears, so the browser's never doubles
  it. Only for the icons and the clock: the picker's rows (how to play each preset) keep the slow one.
- **Save as** went into a popover (150 px) and the **theme** into the File menu (80 px): set once,
  they did not earn the bar. With Parts on, about 240 px are free now.
- **The clock** (`ui/clock.js`): BPM and swing as two numbers in one well. Dragged like a knob
  (the same 200 px for the range), typed with a double-click (a tempo is often a number you
  know: 128), arrows when focused. They register in CONTROLS like knobs, so presets, Reset, undo
  (the gesture listener now covers the clock), MIDI learn and the deps dimming work unchanged.

## Arpeggiator / Sequencer, one module (2026-11-01)

Sergio, once BPM and swing were in the header: the two modules looked like one. They never ran
together: the engine routes the keys to the Seq if it is on, else to the Arp, and a listener
switched one off when the other came on — the «magic» he noticed. A mock-up on the real page
first (the page served from the scratchpad with the merged markup, real CSS and JS, captured in
three states and two themes); his calls: the title «Arpeggiator / Sequencer», a knob for the
Mode, round toggle switches for what is on or off, smaller than the first try (28 × 16, the
10 px label of the rest).

- **Nothing migrated.** The presets keep arpMode / seqOn and both sets of Division, Gate and
  Latch, as always. The Mode is a VIRTUAL control over arpMode / seqOn, and Division, Gate and
  Latch are shared widgets that show and write the active mode's own key. Virtual controls
  (registry.js: `virtual: true`) are in CONTROLS for MIDI learn and the Output display but are
  never saved, reset or loaded; the real keys keep the widget as their `el` (the undo label, the
  deps target) with `learn: false`, so MIDI learn binds the virtual one. A virtual control with a
  continuous range brings it (`param`) for midimap.
- **arpMode carries the direction only while the arp is on** (off | up | down | updown | random).
  While it is off the Direction knob keeps the last one: touching it prepares the arp without
  switching it on, as touching any dimmed control does.
- **The arp's Latch** (arpLatch, new, off by default) is the gesture, not the keys held: every key
  pressed since the hands were last off, even the ones let go meanwhile — the way a hardware Hold
  builds a chord. Once every key is up it stays; the next key starts a new chord; a foreign
  note-off (another part, an allNotesOff) touches nothing.
- **The switch** is CSS over the same 2-button .seg (Off · On): both buttons cover the switch and
  the inactive one is on top, so a click toggles and bindSeg, CONTROLS, MIDI learn and the presets
  never notice; `:has(button:last-child.active)` draws it on. In the oscillator-colored modules
  (.panel.osc) it lights in accent2, like their LEDs.

## Who turns it on (2026-11-01)

Sergio asked whether the dimmed controls should be locked, not just grey. Turned down, for three
reasons: preparing a setting before switching on what activates it is how the instrument is
played (the delay's time before its Amount, the phrase before the Seq: switching on first lets
the sound in half set); the rules come from reading the engine, and a wrong one would make a
control unreachable instead of just grey; and a hardware knob bound to a locked control would
either move it anyway or go dead without a word. What locking was after — knowing why something
does nothing, and what to touch — is answered better by pointing at the cause.

- **Every rule names its enablers** (its third element, `ui/deps.js`): keys, sections or
  selectors like its target, a list or a function of the state when they depend on the reason
  (A's phase: its wave, or Sync). A wave condition points at both wave selectors and at the level
  of an oscillator that isn't sounding — B's wave alone would not turn on P.Width while B is
  silent. The selftest walks a handful of states and fails if anything dimmed names nothing, or
  names something that does not exist.
- **Over a dimmed control** (`ui/enablers.js`): its tooltip at once (why · «Turns on with …» in
  the accent · its own title, dimmer) and a breathing ring on each enabler while the pointer
  stays. The rings are fixed overlays in the body, not styles on the controls: a dimmed
  section's opacity would fade them (B's wave sits inside the dimmed Osc B) and the screen tabs'
  overflow would clip them. An enabler on another screen is not visible: its screen's tab pulses
  and the tooltip says which. The names are read from the DOM (section · label), as the Output
  display does; the section goes before each one unless they all live in the dimmed control's
  section, so «Mixer · Osc B» never reads as the oscillator.
- **A dimmed control keeps no title** while it is dimmed (it goes to data-title0 and comes back
  when it is alive): the browser's tooltip would come up a second later over ours.

## Phrases, recording, chords and labels (2026-11-02)

Sergio left the list while he was out — the five points of the sequencer conversation of 1.7.0 —
and each one went in its own commit, so any of them can be reverted alone.

- **Units keep the melody.** The selector only changed what the numbers meant, so choosing a
  scale turned a phrase into another melody. By hand it now converts (`Seq.convertPattern`):
  semitones → a scale goes to the nearest degree (a tie to the lower one, and the notice counts
  what moved); scale → scale keeps the degrees, which is the point of degrees (the same phrase in
  a new mode); back to semitones is exact. A programmatic set (a preset, undo, MIDI) converts
  nothing: those bring their phrase with its units. A factory phrase in semitones sets semitones;
  one by degrees keeps the scale you have on. 'harmony' converts as major: its scale depends on
  the key you hold.
- **Phrases are the sequencer's, not the instrument's.** Yours (`ui/phraseBank.js`) keep steps,
  division and units — the units, because degrees read as semitones are another melody. They live
  in localStorage and ride along with Export library as an optional `phrases` field: an older
  version ignores it, so the library format did not change. The actions (save, delete) are two
  icons in the module's title, beside rec and lock: the phrase row was full. They first sat at the
  end of the phrase list itself, and Sergio did not like it — an action hidden among the things it
  acts on. The bin is faded (not disabled: its tooltip still says why) on a phrase that is not
  yours, and `ui/tips.js` gives the title's icons the header's instant tooltip, since an icon's
  tooltip is its only label. The **lock** holds every
  key of the module (registry `HELD`, the same mechanism as the room keys in Parts mode): the
  whole module, not only the phrase, because a preset with the arp on would otherwise switch the
  phrase off through the mutex.
- **Step recording** takes the live keys at the engine (`AudioEngine.recHook`, keys without a
  time: a player's notes are not recorded), so QWERTY, the screen and MIDI all write. 0 is the C
  of the octave the take starts in — the first note as 0 would break phrases that start on the
  fifth. The take is one undo step: the phrase goes back to where it was and the result is set
  inside a `record()`. A preset or a part change during the take drops it without touching the
  phrase (restoring it would overwrite the preset's).
- **Chord root** rather than chords per step: the editor has one value per column, and a held
  chord covers stabs and progressions without a new editor. On a fixed scale the chord moves
  around its LOWEST note (each held note gets its degree from it), which makes it diatonic; with
  the scene's harmony every note already moves in the scene's scale. `link` and `tie` became
  lists (per voice); with Chord off a step has one root and the calls of before. In Mono (Sergio's
  catch) a chord cannot sound: its notes reached the one voice at the same instant, the last-note
  priority kept the top one and, in legato, every step glided up from the bottom note — so Mono
  ignores Chord (one root, the last key) and the switch dims there with its reason.
- **Label case**: written «Capitalized», uppercased by Classic through `--lab-case`, which now also
  reaches option buttons, row names and a module's buttons. Uppercase is wider: «FOLLOW AMP ENV»
  pushed the Voice band out, so the option became «Amp Env» (beside «Times»), and the selftest now
  checks that Classic clips nothing — the screens check only looked at the default theme.
- Two bugs met on the way: a button in a module title hid its activity LED (the LEDs matched the
  title's whole text), and Panic did not stop 1.7.0's latched arpeggio.

## FM4, done well (2026-11-02)

Sergio had seen a DX7 in JavaScript whose piano sounded good and asked whether 6 operators and 32
algorithms were worth bringing in. They are not what makes a DX piano: Yamaha's 4-operator line
(DX21, TX81Z) had 8 algorithms — the FM4's — and good electric pianos. What the FM4 lacked was the
detail of each operator: one decay was its only envelope, it scaled nothing with the key and every
operator followed the note. A full DX7 (6 operators, 32 algorithms, .syx) was turned down: it would
be a second instrument with ~150 controls that do not fit the fixed panel, and its patches are
Yamaha's. The FM4 grew instead, in layers, after a mock-up of the panel was approved.

- **An ADSR per operator.** Attack (a straight line; 0 = the step), the Decay that was already there
  (its knob is still the time constant τ, ∞ = flat), Sustain (the level it decays to) and Release
  from the note-off (exponential, τ; ∞ = it ignores the key and carries on). The DEFAULTS are the
  old operator — attack 0, decays to 0, ignores the key — so no preset needed a migration and every
  one sounds bit for bit as before (the fingerprint batch: Δ 0.003 dB, its floor). The release
  needs the note-off inside the worklet: the same `{lift}` message the bow already used.
- **The envelope is evaluated once per block** (2.9 ms), as it always was, EXCEPT while an attack
  or a release runs, where it is joined by a straight line inside the block. The first version
  interpolated always and the 808 Kick moved 0.33 dB from its fingerprint: a 20-30 ms modulator
  lives on its first steps, and smoothing them takes some click away. So the old regime is kept
  exactly where the old operator lived, and the smoothing only where something new happens (an
  attack of a few ms in 2.9 ms steps would buzz).
- **Key scaling, pivoting on C4** (the note's key reaches the worklet in its options, from the
  frequency at note-on). Key time, ONE for the four operators: ×2^(−Kt·octaves), so at full each
  octave above C4 halves the times and each one below doubles them. The DX7 has one rate scaling
  per operator, but presets mostly set them alike, and one knob left room in the detail row for
  Detune and Fixed. Key, per operator: −1..1, 6 dB per octave at full, taken away on ONE side of C4
  (− above, + below) and never added — a level that grew with the key could push a carrier into
  the limiter, or a modulator into aliasing.
- **Detune and Fixed** per operator: cents, and a frequency of its own in Hz (the same in every
  unison or octave copy: it does not follow the key). The ratio's range went from 12 to 24, and
  log, so 0.5, 1, 2… keep their room. «DX E-Piano» asked for a ratio of 14, clipped to 12 by the
  old range: its data now says 12, which its render confirms is what it always sounded at (print
  difference 0.000 dB; BANK_REV 11 so the libraries pick it up).
- **The FM4's own Feedback** (fm4Fb). It was the FM module's fmFb, shared with the 2-operator FM,
  so the FM module lit up for an FM4 alone. A saved preset without fm4Fb takes fmFb's value
  (state.migrateFm4Fb): the same sound, exactly.
- **The shape travels by options and messages, not AudioParams.** Attack, sustain, release, key
  scaling, detune and fixed are read once per block; 29 more AudioParams on EVERY oscillator node
  of every voice would cost per block whether the wave is FM4 or not. They go in
  `processorOptions.fm4` at birth and as `{fm4}` when a knob moves (only to FM4 nodes).
- **The panel.** The graph became the navigator: large, its boxes select an operator, whose ADSR,
  Vel, Key, Detune and Fixed are edited below; the four detail rows are always in the DOM (MIDI
  learn, undo, presets and the selftest reach every knob) and only the selected one shows. Each
  operator's row draws its envelope as it RUNS — a note held 1.5 s and released, on a √time axis —
  so a 70 ms tine and a 3 s body read apart at a glance. The algorithm is a stepper plus a popover
  with the eight drawn: that popover IS the fm4Alg .seg (bindSeg, the display, MIDI and undo see a
  normal selector); its buttons say their label through data-txt, because their SVG has text. The
  Source band was full to the pixel: the new panel takes 409 px where the old one took 407.

## Init is the start (2026-11-02)

Init used to be {} — the engine's neutral, the gate envelope (2 ms · 1 · 20 ms) — and the synth
marked it as the current preset at startup without loading it: they were the same thing. When Init
got a gentle Amp Env (Sergio: 155 ms · 354 ms · 0.65 · 1.57 s), that broke: the picker said «Init»
while the neutral sounded, and Reset went to a state that was not Init. Sergio could not fit the
two together, and he was right: a person should see ONE start. So Init is it: the synth loads it at
startup (after the history is up, so it is «saved» and no undo step), Reset goes back to it (one
undo step, marked as the current preset) and the parts that Parts adds are born with it. The
engine's neutral stays where it belongs, as the base presets are written on (loadState starts
from it). It is the library's Init: saving over it makes it your own starting point.

## The session survives closing the page (2026-11-07)

Sergio: «you will not always save the design in progress, and losing it — knowingly or not — is no
fun». So the work in progress is kept while you play and offered back when you come in
(`ui/session.js`).

**What is kept.** The rack as `snapshot()` — that is the Design and Sequencing screens whole: every
control in CONTROLS, which already includes the Arpeggiator / Sequencer phrase, the Wave Sequence,
Steps, the matrix and the clock — plus its preset and the REFERENCE of its ● (history.js), and the
Arp / Seq lock (it lives outside CONTROLS, in HELD). In Parts: `sceneToJSON`, each part's ● reference,
Layer and the single engine's sound underneath (the one Parts off brings back). Not kept: the undo
stacks, and what is already stored on its own (the drawn wave, your phrases, the library, theme,
screen, MIDI map).

**When there is something to keep: by comparison, never by «the user did things».** A «touched» flag
gets three ordinary cases wrong: Reset after editing, undoing back to the start and a knob put back.
The question is «would closing now lose something that is nowhere else?», and the ● already answers
most of it: the rack against its reference, with its tolerance. The rules (the table agreed with
Sergio): kept if the ● is lit; if the ● is off but that preset was deleted from the library and the
rack is not what a fresh start gives (Init); if the Arp / Seq is locked with a phrase that is not the
start's; in Parts, if the scene differs from the one loaded (library or file) or from the one Parts
started with — and if the rack had unsaved work when Parts started, the scene carries it: kept. A
preset loaded as it is, Save, Reset, undo to the start: nothing to keep, and the stored session is
deleted, so next time there is no question.

Two catches found on the way. (1) THE LOCK: a locked phrase is written into the ●'s reference when a
preset loads (loadState keeps the HELD keys and markSaved snapshots them), so the ● goes off with the
phrase in no preset at all — hence its own rule. Consequence worth knowing: Reset with the lock on
leaves the phrase (that is what the lock is for), so it still asks, and the question says «Arp / Seq
locked». (2) THE PLAYERS' DRIFT moves a parameter of a part while a scene plays and leaves it moved:
the scene is compared with the drift's base, or every scene played would count as edited.

**Only on entering, never a «recover last session».** Sergio: it would be ambiguous (the session from
before entering, or the latest autosave?) and Reset has to keep meaning Reset. So the only way back
is the question at the door; discarding there is a decision. For the same reason nothing is written
until the answer: the pending session cannot be overwritten by the first knob turned. A session that
fails to come back stays stored, and nothing is written during that visit.

**The question is the welcome window's.** Not a second popup and never `confirm()`: the window that
already asks for the gesture the audio needs shows what was left («Warm Pad» · 8 changes · Arp / Seq
locked — last change today, 12:22) and the big button becomes CONTINUE (Enter, and Escape too: keeping
is the default); «start from Init» under it takes a deliberate click. One gesture answers and starts
the audio.

**Back with its ● lit.** The work is still not saved; a session that came back looking saved is
exactly how it would get lost the second time.

**Writing.** Every 2 s, only if the content changed (the date is left out of the comparison: the date
shown is that of the last change), and at once on `pagehide` / `visibilitychange` (`beforeunload`
is unreliable on phones). Off with ?selftest and ?nosplash (tests and tools). ↺ Last, the scene's own
autosave, is gone: it duplicated this, by hand and only for scenes.

Verified: the selftest check «session» (the table, the round trip exact with its ● and lock, Parts
with a drifting player, the welcome's question) and an end-to-end probe in headless Chrome with real
reloads: edits all over, reload, CONTINUE, Reset, Parts, start from Init, a knob put back — 21 steps,
all as expected. Known limits: with two tabs open the last one to write wins; a scene loaded from the
library and then deleted from it still counts as one that can be loaded again.

## Seq Rec: recording while it plays (2026-11-07)

Sergio had seen it on other synths: a quick «record» where the sequence plays while you enter it,
each key adding the next note. The 1.8.0 take was silent on purpose — a phrase playing would cover
what you write —, but when the phrase playing IS what you write, that reason goes away.

**It grows with every key — the second try.** The first version kept the phrase's length (Steps),
blanked it and filled it in order, wrapping at the end: I had recommended it, because a loop that
grows changes its bar on every key (one note repeated at 1/16, then two, then three…) and because the
Seq picked its step as `idx % length`, so a length changing under the playhead made it jump. Sergio
tried it and corrected it: what he had seen grows, and a fixed length obliges you to fill it. The
jump was the real objection, and it has a cheap fix in `Seq._tick`: the next step is now
`idx % length + 1` instead of `idx + 1` — the same while the length stays put, and a phrase that grows
under the playhead plays its new step next. So the take starts EMPTY and every key appends; the
first one sets it looping on its own (one note over and over is part of the gesture). Full (16 steps)
the cursor goes back to the first and writes over it — the earlier choice, kept: the take never runs
out. Timing does not matter — a key is the NEXT step, not the one under the playhead; recording in
real time (where you press is where the note falls) was left for if it is ever missed.

**A switch on the keyboard bar.** The module lives on the Sequencing screen only, and its «rec» was
dimmed unless the Mode was Seq. Sergio wanted it «global»: it is now «Seq Rec», a pill switch beside
Octave, Wheel, Bend and Touch — you record with the keys, and the keyboard is on every screen.
Switching it on puts the module on Seq (an undo step of its own, so two undos take everything back)
and arms the take; off ends it and leaves the Mode on Seq. While armed the switch and its label take
the alarm color and breathe. It is not a parameter: nothing of it goes into presets or MIDI learn.

**The phrase is the take's buffer.** Before, the take lived in its own array and was copied into
the phrase for the editor to show it; now each key writes straight into `seqPat`, so the Seq plays
it at once (it reads the phrase on every step) and Steps or the phrase list keep working in the
middle of a take. The editor draws one column more while the phrase is growing: the empty slot the
next key fills. The undo is as before: at the end the phrase goes back to where it was and the
result is set inside a `record()`. Both the arming click and the stopping click close the history's
open gesture first (`end()`): otherwise the click that stops a take stored the half take as a step
of its own — that was already so in 1.8.0, unseen because the selftest clicks without a pointer.

**A root of its own: `Seq.pin`.** The Seq plays only while a key holds (or Latch keeps) its root, and
during a take the keys write instead of transposing. So the take pins a root — the take's C, the
same 0 the phrase is written from, so it plays exactly what was written — above keys and latch,
from the first key on. The loop starts ON the step just written, so that key needs no note of its own
(no double attack); later keys sound as you play them and again when the loop reaches them — except
in Mono, where the key and the loop would fight over the one voice and the loop alone is heard. At
the end `unpin(keep)`: with Latch the pin becomes the latched root (the loop goes on, and a key
transposes it as usual), without it the phrase stops. Panic or the Mode switched off drop the pin;
the take stays armed and the next key starts the loop again. A part change drops the take and gives
the old part its phrase back (the take had been writing into it); a preset or a scene brought their
own, which is not touched.

## Dist · Flanger: destruction, and the part's insert in the matrix (2026-11-07)

Sergio had moved the cutoff along the arpeggio with a synced LFO and asked why the flanger couldn't
do the same, and why the Dist wasn't in the matrix either. Then: «there are synth modules that
specialise in destruction, with different methods — can you look into it?». The answer to the first
question is the chain: the matrix lived inside the voice, and the Dist and the flanger come after the
voices are summed — one per part. Nobody had given them a path. The answer to the second was a
catalogue (saturation, gated fuzz, rectification, wavefolding, bitcrush, sample-rate reduction,
erosion, fixed-carrier ring, bit logic, codecs, glitch, multiband) rendered as A/B samples over one
arpeggio, and a module with the methods that add something the synth didn't have.

**Not moved: the Filter's Drive.** It looks like «another method», but what defines it is WHERE it is:
before the filter (the filter tames the harmonics it makes: warm, not raw), per voice (a chord stays a
chord: no intermodulation) and modulated per note (it is already the matrix's «Drive»). Moving it
would have lost all three; Fold stays there too (folding a chord's sum is chaos). Two «Drive» knobs
were confusing, so the part's one is now called **Dist**.

**One worklet per part (`worklets/destroy-processor.js`), born on demand.** Until something needs it,
the part goes through a gain (exactly transparent); once born, the whole part goes through it, with a
crossfade from the bypass when it is born live (its 31 samples of latency would otherwise jump). Chain:
Lows split → Dist by type (×2 oversampled) → Crush (rate, then bits) → the residue's high-pass →
flanger. Every amount is an AudioParam, so the matrix connects straight to them and their ranges clamp
knob + modulation.

**The Dist had a comb.** Measuring the old Dist to calibrate the samples, the model only matched the
engine (corr 0.998) with the wet branch 128 frames LATE: the WaveShaper's oversampling ('2x') delays
what goes through it, and the dry branch beside it didn't wait. At every in-between amount the two
summed into a comb — a notch every 345 Hz, 2.9 ms apart: the Dist sounded hollow, a still flanger
under every preset that used it. The worklet delays its dry branch by exactly its own latency (an
impulse comes out as ONE echo, 6·10⁻⁴ of a second one). The same pattern was in the Filter's Drive
(128 frames) and in the Tape's saturation (129) — see the end of this section. The Dist's law is
the old one (`amount·tanh(4·(1 + 6·amount)·x)/tanh 4/(1 + amount) + (1 − amount)·x`; a sine follows
it within 1.3 %): the presets keep their character and lose the comb. The bank's fingerprint alarm
caught exactly the 21 presets with Dist and the 2 with flanger.

**Four types, a makeup each.** Soft (the old tanh) · Hard (flat clip) · Fuzz (×6 more gain, an
asymmetric clip, and a dead zone: under it the signal is silence, so a fading note chokes and sputters
— the starved fuzz) · Rect (|x|: the octave; on a chord every interval clashes). Each type's makeup
gives Soft's loudness at a middling amount, measured on a saw arpeggio at the part's level (the
insert sees peaks of +6 dBFS: the headroom comes later, in the Room). Rect needs ×3.1: half of |x| is
DC, which the blocker takes away. Changing type crossfades the curves over 10 ms (a curve jumping is
a click); the shapes have no memory and the down filter is linear, so the blend happens on the
oversampled values.

**Crush without anti-aliasing, on purpose.** Rate is a sample and hold (one decision per sample for
both channels): the harmonics above R/2 fold back down, inharmonic, a different metal on each key; the
knob goes from 44.1 kHz to 150 Hz in log, and the hold rate measured is the one the knob shows (3418
for 3417 Hz). Bits quantize at 16 − 15·bits bits, fractional so they sweep; the step is fixed and the
signal shrinks, so the noise GROWS as a note fades until the tail breaks up.

**Lows: a real split — the first one wasn't.** «Below this, nothing is destroyed». The first version
split «lows» with a low-pass and «the rest» as `x − lows`: it adds back up exactly, but it is not a
high-pass — the low-pass turns the phase, and «the rest» kept nearly all of the bass, phase-turned, so
the clip mangled it all the same. Now a Linkwitz-Riley 4 pair (their sum is an all-pass: flat, a phase
turn around the cutoff), and the RESIDUE of the destruction (what it adds to the highs) high-passed
at the cutoff too: the difference tones a distorted chord throws below don't muddy the bass. Measured
on 55 Hz + 1500 + 1580: the bass comes out at 0.00 dB with its 3rd harmonic at −97 dB (−21 without
Lows); the rectifier's 80 Hz difference tone, +24 dB OVER the bass without Lows, stays at −27. (The
worklet also runs in Node — a harness that fakes the AudioWorklet globals — which reproduced the
browser's numbers to the decimal and made choosing that scenario quick.)

**The flanger: the same one, then more.** Manual (0.5-20 ms), Depth (1 = ±2/3 of Manual: at 3 ms the
old 1-5 ms), Feedback ±95 % (− = the hollow comb, odd harmonics), and its own LFO with the bank's
shapes and tempo sync (mkLFO + setLfoSync, so it lands on the common clock). At Depth 0 with feedback
it is a TUNED comb: it rings at 1/τ (+fb) or 1/2τ (−fb). Its default settings reproduce the old
flanger as closely as a model of it did (corr 0.955: the DelayNode's interpolation). Measured on the
way: Chrome did NOT clamp the old flanger's DelayNode-in-a-cycle to 128 frames (a free model matched
0.95, a clamped one 0.59).

**Splice, don't slide.** Sliding a delay's read head is speeding a tape: the pitch bends. That IS the
flanger's sweep, but a jump (S&H, square, a Steps step with its 4 ms ramp) slid that way chirps — the
first prototype measured 3.6× the high-frequency energy at every step. The head may slide up to ±15 %
in speed (the old flanger's sweep at its fastest needs 10 %); further than 0.3 ms from its target, it
is a splice: the old head and a new one at the target crossfade over 10 ms. Measured: a jump of the LFO
from −1 to +1 leaves the 440 Hz periods around it untouched (0 of 87 off by more than 5 %).

**The matrix at part level.** Four destinations — Dist, Crush bits, Crush rate, Flanger (Manual's
position, in octaves: ±1 = the knob's whole travel) — wired by the ENGINE once per part
(`AudioEngine.fxRewire`), not by the voices (which skip them). Only part-level sources reach them: the
global LFOs (raw), Steps continuous (`Steps.node`: the lane's source without starting the clock — the
notes start it), wheel, aftertouch, expression and the macros; a per-note source has no single value
to give a part and does nothing (the dependencies say so, and it doesn't even wake the insert). The
amount of a slot aimed at the insert can be modulated by another part-level slot (Comb Arp's M1). With
the knob at 0 a slot can switch the Dist on: Steps 0 0 0 1 → Dist destroys one note in four and leaves
the rest bit-identical (measured 0.000 / 0.75).

**Cost.** Measured on the worklet itself: 0.3 % of a core born and idle, 1.4-1.6 % with the Dist
running (the oversampling: two 32-tap filters per sample and channel) — the shared budget counts it
that way. Presets: Crushed Arp, Comb Arp (Motion) and Jet Pad (Pads) show it; demo pairs DST 1-14 and
FLG 1-8.

**The same comb, in the Filter's Drive and in the Tape.** Both mix a clean branch and a saturated
one, and the saturated one goes through an oversampled WaveShaper (2x; 4x for Fold): 2.9 ms late. How
deep the comb is depends on how alike the two branches are in level; in the curve's linear region the
Filter's Drive at 0.2 — the most common value in the bank — gives 33 dB from peak to notch, and the
Tape at 0.5 gives 26 dB across the whole mix. And since the saturated branch compresses as a note gets
louder, the balance — and the comb's depth — moved along every note. Sergio: «if you think it's good
for the synth, go ahead; if we don't like the result, we go back». The fix is cheaper than a worklet:
the clean branch goes through a STRAIGHT shaper with the same oversampling (`nodes.mkLinearShaper`, a
two-point curve with the input scaled into its ±1), so both carry the same latency in any browser,
whatever its number. It is born with the saturated branch (Drive or Saturation above 0): at 0 nothing
changes, not even by its latency; a sounding voice hands over with a 10 ms crossfade. Measured with a
saw quiet enough for the curves to be linear, the harmonics against the clean render spread 30 dB
before (Drive 0.2) and 23 dB (Tape 0.5); after, 0.02 and 0.12 dB (check «aligned branches»). The
second shaper costs what the first did — almost all of it is the oversampling: the Drive goes from
0.15 to 0.25 «simple voices» and the Fold's extra from 0.13 to 0.30 (10 voices × 20 s, before and
after). 18 factory presets use them (17 the Drive, Nostalgia Tape the tape).

**By ear, then the bank.** The before/after of the 33 presets that changed (22 for the Dist and the
flanger, 18 for the Drive and the Tape, 7 in both) went to Sergio first: «more punch; it doesn't change
much, some timbres move a little, but not towards anything bad — it just sounds fatter where it should
(the percussion)». Then the fingerprints were renewed — BEFORE the levels: with the alarm still up, every
one of the 33 counted as failing and the level tool would have moved them all to −14 LUFS exactly,
not just the ones out of tolerance — and nine Masters came back to the bank's rules (bank rev 14):
louder now, Neuro Bass, Hoover, Nostalgia Tape, Talking Robot and Syllables; the 909 Kick, 909 Snare
and 808 Cowbell over the hits' peak; and Motorik Bass, quieter in LUFS but peakier, held by its peak
ceiling (a note keeps 5 dB of room before the limiter).

## Parts on: the level stays (2026-11-07)

Sergio, trying the bank: «when I switched to Sequencing (Parts), suddenly everything got louder». Measured:
switching Parts on multiplied the sound by its own Master again — +6.8 dB for Moog Bass (×2.38), +5.5 for
Syllables (limited; +8.2 without the limiter), +2.6 for Glass Pad, −6.8 for Jet Pad (×0.47). `enableScene`
gave the new scene's Room the preset's Master as its master, and part 1 kept that same Master as its fader
(in Parts `master` is the part's fader): Master². Harmless when Masters were around 0.7; since 1.1.0 they are
makeups up to ×4. Now the scene born from the rack starts with a NEUTRAL master (1 = 0 dB, `sceneFromRack`,
shared by `enableScene` and the selftest): part 1 = Room 1 × fader Master = what the single engine gave.
Measured on a dry saw at ×0.47 / ×1 / ×2.4: 0.0 dB. A pad can still differ by ±1 dB from one context to the
other — the scene builds more engines, so the seeded random draws (phases, drift, the reverb's IR) come out
different; that is the same note played twice, not a level. Scene files carry their own master and keep it.
(The same afternoon, pads that «saturated» after continuing a session were a restored scene with Layer on —
Reset only takes the part being edited back to Init; the others went on sounding.)

## The bank after the destruction and the FM4: quality, not evidence (2026-11-07)

Sergio asked whether, after Dist · Flanger and the comb, the bank needed a look, or presets that show what
the synth can do. Three findings: the coverage check in `engine/bankCheck.js` was blind to the new knobs (it
only knew `dist > 0` and `flAmt > 0`; the four part-level destinations entered on their own through
MX_DESTS), so its 131/131 was true only of what it looked at; the FM4 of 1.8.0 — operator envelopes, key
scaling, detune, fixed frequency — was in no factory preset at all (the 16 FM4 presets were the ones from
before); and of the destruction the bank showed Hard, Lows, Steps → Dist/Rate and Macro → Bits (Crushed Arp),
the tuned comb (Comb Arp) and the flanger in tempo (Jet Pad), nothing else. Sergio's rule: **presets of
quality, not evidence** — what the consolidated banks ship (docs/BANK.md), not a demonstration of a knob.

**The coverage first.** Thirteen features added (Dist hard / fuzz, Crush bits, Crush rate, Lows, the comb at
Depth 0 with feedback, the flanger LFO in tempo, FM4 attack / sustain / release, key scaling, detune, fixed,
the sequencer in chords), each read on the effective value and only when it can be heard (a Dist type counts
when the Dist sounds, by its knob or by the matrix driving it from 0). From then on the selftest names the
holes instead of guessing them. Rect is NOT asked for (below).

**FM4 by ear — the layer 5 that was pending.** Applied to the presets whose classic has it, with the settings
the demo pairs already carried: **DX E-Piano** gets the DX chorus (ops 3-4 +5 ct, the second pair against the
first) and key scaling (Key time 0.6, the tine −0.5 up the keyboard): measured, the high chord's centroid
737 → 701 Hz and its decay to −20 dB 2.03 → 1.93 s; a variant with the tine at ratio 14 — the DX7's E.PIANO 1 —
goes to the ear beside it (centroid 857: much brighter). **Rhodes**: the bark (op 2, ratio 1) fades up the
keyboard (−0.5) and Key time 0.4; the tine's own level scaling was tried (−0.3) and dropped: a real Rhodes is
a bell up high, the tine must stay. **FM Brass**: attack 150 / 100 ms on ops 2-3 (the modulators swell in: the
start 5 dB quieter, the brightness arriving over the first 200 ms) and op 2's release 0.2 s, so the tail
darkens (centroid 363 → 302 Hz, 250 ms after the key). **Marimba and Glockenspiel** were given Key time 0.5 /
0.4 and it was taken out again: the fundamental's level at +0.25 / +0.45 / +0.65 s came out IDENTICAL with and
without it, on every note from C3 to C7. Their decay lives in the Amp Env (d 1.0 / 2.5 s, s 0), which ends
the note before the operators' decays (1.4 / 2.5 s) count; for Key time to shorten the small bars the operators
would have to carry the decay under a flat Amp Env — another preset, for another day.

**Six presets, each with its reference.** Fuzz Bass (the bass fuzz with a clean blend: Lows at 110 Hz keeps
the fundamental of C1–F2 whole — the sine under the saw — and the harmonics are fuzzed; Fuzz rather than
Hard for its asymmetry: the 2nd harmonic 4 dB up, measured). Fuzz Lead (the Minimoog charts' «fuzz
guitar»: saw + triangle sub, the filter closed and tracking, aftertouch and Macro 1 → Dist). Chip Lead (the
8-bit console as the modern packs ship it: a 12 % pulse, delayed vibrato, the chips' echo channel, 8 bits
and a 10 kHz hold for the sheen; Macro 1 walks the duty cycle 12 → 50 %). Lo-Fi Keys (the lo-fi beat's
e-piano: a Rhodes at 10 bits and 17 kHz on a worn tape — the SP-1200's 12 bit / 26 kHz goes to the ear beside
it). Steel Drum (DX7 ROM1A «STEEL DRUM», Juno-106 «Steel Drums»: carriers at 1× and 2× — the octave tuned into
the same dent —, each pair's modulator only in the strike, and op 4 FIXED at 1870 Hz: the pan's clank, the
same metal on every key; a 40 ct blip; Key time 0.3). Chord Sequence (the chord sequencer every modern poly
has: Chord on, the tresillo stab riff with its octave jumps in the phrase, the dotted-eighth echo in the
rests). Rendered for the ear with `tools/render.mjs`; the sequence with the selftest's trick (the Seq's ticks
driven from `ctx.suspend` every 25 ms, since a setInterval does not run inside an offline render): the
tresillo lands where it should at 124 bpm.

**The Octavia that wasn't.** The first lead was «Octave Fuzz» on the Rect type: |x| of a tone IS its octave,
so the dry half keeps the note and the wet half should ring an octave up. Measured on C5 (523 Hz): the octave
sat 11 dB under the fundamental — 13 with Soft, so Rect added 2 dB of octave. The reason is the insert's
level: it sees peaks of +6 dBFS by design (the headroom comes later, in the Room), and the drive is tied to the
amount (gain 1 + 6·amount), so the rectifier runs at tanh(2·4·x) with x near 1: flat most of the period, a
dip at each zero crossing — a pulse train, not a rectified sine — and the DC blocker takes away what |x|
mostly is. With the oscillators 10 dB down and the filter sitting ON the note with full keytrack (the neck
pickup with the tone rolled off, which is how an Octavia is played) the octave reaches −8 dB; for a clean
one the input would have to drop another 10 dB, and ×4 of Master cannot bring that back to the bank's
level. So Rect stays a demo (DST 7-8) and the lead became Fuzz Lead. Noted for the module: a Rect with
its own input trim would be the real Octavia.

**The fuzz's dead zone, in context.** FUZZ_GATE 0.02 on the driven signal chokes below −47 dBFS at the
insert: on a bass with a 0.18-0.3 s release the tails of Fuzz and Hard came out identical (RMS every 100 ms
after the key). The sputter the demo DST 4 shows needs a long, fading note; the preset's play line no
longer claims it.

**Levels and fingerprints.** The factory batch leveled the newcomers (Fuzz Bass, Steel Drum and Chord
Sequence were off by more than 3 dB at Master 1: ×1.86, ×1.53, ×2.24; the other three landed within the
rule at Master 1) and the fingerprints of the nine presets whose data changed against the reference were
renewed: selftest 245/245 (checks 123/123, factory 122/122), coverage 152/152; the ear session's WAVs are in `x/ear-2026-11-07/` (keys, keys2, brass, leads, bass,
bass2, steel, steel2, chordseq), A/B for the refinements and variants for the newcomers, for Sergio to
decide before anything is committed.

**The ear's verdict (Sergio, the same evening).** Of the WAVs: Fuzz Bass WITHOUT Lows (the bass fuzzed whole
rather than the sub kept clean — Lows stays shown by Crushed Arp), FM Brass B, Chord Sequence, DX E-Piano C
(B plus the tine at ratio 14, the DX7's — the 12 it carried was the old range's ceiling), Lo-Fi Keys at 10
bits and 17 kHz (not the SP-1200's 12 / 26), Rhodes A — as it was, no key scaling —, Chip Lead at 12 % with
its crush, Fuzz Lead on HARD (over Fuzz and Soft), Steel Drum with the blip DOWN. Applied, re-leveled, the
fingerprints renewed; the coverage still names every feature (Fuzz Bass keeps `dist:fuzz`, Fuzz Lead and
Crushed Arp `dist:hard`, DX E-Piano, Lo-Fi Keys and Steel Drum the FM4 key scaling).

## Click, Tap, and a take that survives a part change (2026-11-08)

Sergio brought a conversation with another assistant about playing SubSDJ live — recording a
phrase while others loop, moving to another part, keeping the whole thing in time. Most of what it
proposed was already here (the common clock, the parts, the phrase bank, Seq Rec, Latch, Steps as
per-step locks); what was not, and was clearly worth it: a metronome, a tap tempo, and a snag in
Seq Rec that the live flow ran straight into. The rest (a timed take, phrase slots that switch on the
bar, parts on demand) he keeps to think about.

**The click is a user of the common clock, not a timer of its own.** `engine/Metronome.js` runs the
same scheduler as the Arp and the Seq: a 25 ms ticker that wakes a 120 ms look-ahead, and
`Clock.begin / sync / advance` for its step, with a division of one beat. That is the whole point:
switched on with nothing else in tempo, its first click is beat 0 and the next arpeggio or phrase
lands on ITS grid; switched on over a loop, it lands on the loop's grid and counts its bars; when the
conductor starts and anchors a new origin, `sync` relocates it to the conductor's bars, as it does
the Arp/Seq. The accent is beat 0 modulo 4: the bar as the conductor and the Steps count it. The BPM
is read on every tick from the Room (`part().bpm`), so a change from the clock cell, a preset or the
tap reaches it from the current beat — the clock re-anchors at the beat of now, nothing jumps.

**Straight to the destination.** The click does not go through the Room: it would pick up the echo
and the reverb, the limiter would duck the music for it, and the WAV recorder (which hangs off the
analyser) would print it. So it connects to `ctx.destination` on its own — the only thing in SubSDJ
that does. The sound is a sine burst with a 1 ms attack (without it the sine starts with a step and
thumps) and a 25 ms decay to −60 dB: a tick, not a beep; 1 kHz at −12 dB, and 1.5 kHz at −8 dB on
the 1. Constants at the top of the file. No subdivisions, no sound menu, no count-in: a count-in only
means something before a take that is timed, and Seq Rec's is not (a key is the next step, whenever
it comes); if the timed take ever arrives, the count-in comes with it.

**The label is the beat light.** The metronome keeps the clicks it scheduled (`beatNow` hands the
UI the one that has just sounded) and `ui/tempo.js` flashes the «Click» label on each, more on the
1: with the sound down it is still a metronome. A `requestAnimationFrame` loop runs only while the
click is on.

**Tap: the median, from the third tap.** `TapTempo` is pure (no DOM, no audio, checked in the
selftest with numbers): the last six presses, their intervals sorted, the middle one — a mean would
let one early or late tap pull the tempo, the median ignores it until the taps around it agree. Two
presses give one interval and a nervous number, so the tempo comes out from the third; a pause of
two seconds starts a new count (40 BPM is 1.5 s between taps and still counts). Whole beats,
clamped to the Room's range. The BPM is written through `CONTROLS.bpm` — the clock cell — so the
engine, the Output display and undo see it as they do a drag; the first tap of a run opens an undo
gesture and the pause closes it, so a run is one step, not six. Neither the click nor the tap are
parameters: nothing of them goes into presets, scenes or MIDI learn.

**Seq Rec: Latch goes on with the take, and a part change ends it instead of dropping it.** The
live flow is: record a loop on part 1, choose part 2, record on top. Two things broke it. The loop
died the moment the take ended unless Latch happened to be on — the preset's default is off, and
the 1.9.0 note said so as a feature: «with Latch it keeps playing». A loop you have just recorded
dying is the surprise, not the other way round, so arming the take now switches Latch on along with
the Mode, in the same `record()`: two undos still take everything back. And choosing another part
in the middle of a take dropped it: the `part-changed` event fires after the rack has moved to the
new part, so the only safe thing then was to give the old part its phrase back directly. Now
`partsControls.choose` dispatches `part-changing` BEFORE `selectPart`, while `CONTROLS` still write
the part that recorded and the undo stack is still its own, and Seq Rec ends the take there exactly
as Enter would — the phrase stays, the loop goes on latched, the take is one undo step on that part.
The `part-changed` listener stays as the fallback for any other path.
