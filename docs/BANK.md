# SubSDJ · the factory bank (block 8 of Roadmap 7.0)

The plan of the new factory bank: why, what goes in, what every preset has to pass,
where the sounds come from and how the old bank is retired without breaking anybody's
library. Written before touching code (2026-10-26); the decisions are logged at the end.

## Purpose

Replace the bank that grew block by block — 124 factory presets plus the 36 of
`subsdj-presets-2.0.json`, many of them demonstrations of a feature with a demo's name
(«Table, Filter and Gate (16 · 8 · triplet)») and many near-duplicates (three supersaws,
four PWM pads, three DX e-pianos, three choirs) — with ONE consolidated bank thought out as
a whole: **useful, powerful, expressive presets that make you want to play, that show how
far the synth goes with its current topology, and that prove it does classic sounds and
modern ones**. Quality over quantity: the number is not a goal; covering the whole
instrument is.

Sergio's rules (2026-10-26): no two presets that sound alike; every capability explored,
the modulation matrix above all (its combinatorics is where the surprises are); presets
that show the sequencer and the arpeggiator; scenes with several parts that accompany
you while you play; reuse what was good in the old bank — universal names, sounds that
work — instead of reinventing it.

## What makes a preset good (the criteria)

1. **Playable as is.** It sounds right at the keyboard with nothing else touched, in its
   register and in its intended use (one note / a chord / a hit). Nothing pushes the
   limiter, no clicks, no DC, and the voices die after the release. Measured, not assumed.
2. **A clear use.** The name says what it is, in the language of the classic banks
   («Juno Brass», «Tubular Bells»), never in module jargon («Pad (per-voice S&H)»). One
   `play` line says how to play it: register, note or chord, what the wheel and the macros
   do.
3. **It shows something of the synth, on purpose**, and the bank as a whole covers every
   module, every matrix source and every matrix destination (checked by the selftest).
4. **It does not repeat another one.** Two presets that sound alike = one too many. The
   technical demonstrations stay in `subsdj-demos.json` (A/B pairs), outside the bank.
   A spectral fingerprint per preset flags the closest pairs; the ear decides.
5. **Expressive by convention** (knobs that always mean the same thing, as in modern
   banks): velocity matters in all of them (it already does by design; FM and String
   presets add vel→index / pluck strength); the **wheel opens the filter** in every preset
   (the vowel on voices; nothing on the String presets, whose filter is already open);
   **Macro 1 is the character knob** — drive, FM index, resonance, pulse width, fold,
   material, the drawbars — in almost every preset; **Macro 2 a second layer** (sub, noise,
   ring, morph) where it adds something. *Revised while building (2026-10-26):* the first
   idea was «wheel = vibrato on leads, Macro 2 = motion», but a matrix source is a VALUE,
   not a depth: the wheel can offset the pitch, not scale the vibrato LFO, and no
   destination reaches an LFO depth, the echo or the reverb. Vibrato comes in by itself
   with `lfoFade` instead. Amount modulation (a source scaling another slot's amount) is
   the capability the bank found missing: a candidate for the plan.
6. **Loudness matched by measurement**: about −14 LUFS at the output in its intended use
   (one note, a three-note chord or a hit — the hit by its peak), with that use never
   reaching the limiter. All of them, not a sample of five.
7. English, unique names, 32 characters at most.

## References: what the consolidated banks ship

Looked up on 2026-10-26 (sources at the end). What every one of them has, from the
1970s to today, is the canon our bank has to cover.

- **Yamaha DX7 ROM1A (1983, 32 voices)**: BRASS 1-3, STRINGS 1-3, ORCHESTRA, PIANO 1-3,
  E.PIANO 1, GUITAR 1-2, SYN-LEAD 1, BASS 1-2, E.ORGAN 1, PIPES 1, HARPSICH 1, CLAV 1,
  VIBE 1, MARIMBA, KOTO, FLUTE 1, ORCH-CHIME, TUB BELLS, STEEL DRUM, TIMPANI, REFS WHISL,
  VOICE 1, TRAIN, TAKE OFF. Instruments first, two effects at the end.
- **Roland Juno-106 (1984, 128)**: Bank A = Brass, Brass Swell, Trumpet, Flutes, Moving
  Strings, Choir, Piano, Organ I/II, Combo Organ, Calliope, Celeste, Elect. Piano I/II,
  Clock Chimes, Steel Drums, Xylophone, Fanfare, Pizzicato, Bass Clarinet, Guitar, Koto,
  Funky I-III, Synth Bass I/II, Lead I-III, Thud Wah, Clav, Snare/Toms/Timpani, Synth
  Pad, Sweep I/II, Pluck Bell, Gong, Dust Storm, Rocket Men, Hand Claps, Caverns…; Bank B
  adds Harpsichord, Nylon Guitar, Accordion, Helicopter, Vibes, Thunder, Surf's Up,
  Forbidden Planet. The same families, plus a handful of effects for fun.
- **Minimoog Sound Charts (Tom Rhea, 1974)**: imitations (flute, clarinet, trumpet,
  bowed/plucked bass viol, xylophone, harpsichord…), artist patches (Emerson's fat bass,
  Wakeman) and effects (wind, surf, thunder, siren, jet plane). The first «factory bank»
  was a book of charts.
- **Sequential Prophet-5 / Prophet-10 (Rev4 factory)**: evocative names next to generic
  ones — It's a Prophet 5, Stabby Brass, Cars Strings (the Cars' sync lead era), Fat Poly
  Bass, Choral Voices, Antique Bell, Sync Bass, Midnight PWM, Vintage Wurly, Vocal Pad,
  Morse Code Lead… The Rev2 list (512) is the same mix: Discovery Pad, FM Bass, Pizz I
  Cato, Tangerillo Arp, ClassicBrass 24dB, Sync Bass, Kalimba Dance, Harpseechord, Choir,
  GroovyGate, Arpbass, Trem Pad.
- **Korg minilogue xd (2019, 200 programs)**: Poly Synth 47, Bass 25, Lead 20, Pad 17,
  Arp 14, SFX 10, Drum 10, Chord 7 and 50 Templates. A modern hardware poly ships about
  150 finished sounds, a third of them polysynth sounds (brass, strings, stabs, keys).
- **Roland D-50 (1987)**: Fantasia, Digital Native Dance, Pizzagogo, Staccato Heaven,
  Glass Voices, Living Calliope, Soundtrack, Atmosphere — the «attack sample + synth
  body» recipe and the big reverb that defined the late 80s.
- **General MIDI** (the universal taxonomy): Piano, Chromatic Percussion, Organ, Guitar,
  Bass, Strings, Ensemble, Brass, Reed, Pipe, Synth Lead (square, sawtooth, calliope,
  chiff, charang, voice, fifths, bass+lead), Synth Pad (new age, warm, polysynth, choir,
  bowed glass, metallic, halo, sweep), Synth Effects (rain, soundtrack, crystal,
  atmosphere, brightness, goblins, echoes, sci-fi), Ethnic, Percussive, Sound Effects.
- **Iconic single presets** (the ones every bank nods to): DX7 E.PIANO 1 and TUB BELLS,
  TX81Z Lately Bass, OB-Xa «Jump» brass, the Cars' hard-sync lead, Alpha Juno «hoover»,
  JP-8000 supersaw, TB-303 acid, Solina strings, D-50 Fantasia/Pizzagogo, M1 organ,
  Berlin-school sequences, 808/909 kits.
- **Modern soft synths** (Serum, Vital, Pigments and their packs): categories by use —
  Bass, Lead, Pad, Keys, Pluck, Sequence/Arp, FX, Drums, Vocal, Chord — and tags on top:
  type, style (ambient, techno, trance, cinematic, lo-fi…) and character (warm, dark,
  bright, evolving, metallic, airy, dirty…), which is what makes a browser useful.

**What this tells us.** (1) The families are stable for fifty years: brass, strings,
organ, e-piano, clav, harpsichord, bells, mallets, bass, lead, pad, voice, plucks, a
kit, a few effects. A bank that lacks a brass or an organ feels incomplete, however
clever its pads. (2) Hardware ships ~100-150 finished sounds; the thousands come from
packs. (3) Names: an instrument name when it is one («Harpsichord»), an evocative name
when it is a synth sound («Four Winds»), and never a parameter list. (4) Tags by type,
style and character are the modern expectation; the old bank had none.

## Categories

Eleven, by use (the old bank had fifteen, by module). «Brass & Strings» is new: the
classic polysynth sounds you PLAY (fast attack, chords and lines) are a family in every
reference bank and were scattered among the pads. The old «Stepped», «Stabs», «Organ»,
«FM», «FM4» and «Plucked Strings» go: a category names a use, not an engine.

Each list below is the canon the bank starts from. Source: **keep** (old preset, as it
was, plus metadata and macros), **rework** (the idea stays, the preset is redone),
**merge** (several old ones become one), **new**. The ear and the measurements prune it.

| Category | Presets (what it shows · source) |
|---|---|
| **Basics** | Init (Reset, `{}`) |
| **Bass** (10) | Sub Bass (sine + triangle, the layering sub · keep Round Sub) · Moog Bass (mono legato glide, 24 dB, drive: the Minimoog · merge Slide/Creamy/RC) · Funk Bass (pluck bass, RC curve, note→PW · merge Pluck/RC/Chameleon) · Fat Saw Bass (two detuned saws, drive · keep) · Reese (±22 ct, width · keep) · DX Bass (2-op FM, vel→index: Lately Bass · merge DX/FM Bass) · Neuro Bass (FM growl + synced saw LFO + flanger · merge FM Growl/Neuro Wobble) · Plucked Bass (String wave · keep) · Dub Wobble (tempo-synced cutoff LFO, Macro 2 = depth · rework) · Sync Bass (hard sync, env→Pitch A · new) |
| **Leads** (9) | Moog Lead (mono, glide, wheel→vibrato · rework Mono Glide) · PWM Lead (merge Square/PWM) · Supersaw Lead (JP-8000 · merge Supersaw/Trance Supersaw) · Sync Lead (the Cars: sync + mod env→Pitch A · new) · Fold Lead (West Coast wavefolder, Macro 1 = fold · new) · Hoover (Alpha Juno · merge Rave Hoover/Hoover 2.0) · Breath Flute (noise breath, wheel vibrato with fade · rework Vibrato Flute) · Vox Lead (formants, wheel→vowel · new) · S&H Lead (random filter in eighths with echo · keep + pan) |
| **Brass & Strings** (8) | Juno Brass (saw + filter env + chorus · new) · OB Brass (unison, 24 dB: «Jump» · new) · FM Brass (FM4 stack with feedback · keep FM4 Stacked Brass) · Brass Stab (own fast filter env: house stab · new, replaces Supersaw Stab) · Orchestra Hit (keep Rave Hit) · Solina Strings (ensemble · keep) · PWM Ensemble (merge PWM Strings/Ensemble/Unison Pad/String Ensemble) · Pizzicato (short saw pluck + ensemble · new) |
| **Keys** (11) | Rhodes (2-op FM, vel→index, tine env · merge FM Piano/DX E-Piano ×2/Electric Piano/Touch Keys/Dreamy EP) · DX E-Piano (FM4 paired, velocity on the modulators · keep FM4 Paired) · Clavinet (keytrack, own env · keep Funky Clavinet) · Harpsichord (String wave plucked at the bridge · merge String Piano/Harpsichord) · Drawbar Organ (organ table + chorus Leslie · merge Wavetable/Full/Tremolo/Leslie Organ) · Church Organ (keep) · Vibraphone (FM + tremolo · keep) · Marimba (keep FM Marimba) · Music Box (keep) · Accordion (keep) · Digital Keys (1-shot wave sequence: the D-50 attack · keep Digital Attack) |
| **Plucks & Bells** (9) | Synth Pluck (filter env, S&H→cutoff/pan · merge Pluck/Lottery/Supersaw Pluck) · Nylon Guitar · Twelve-String · Harp · Koto (String wave · keep) · Glockenspiel (FM ratio 7, env→index · merge FM Glockenspiel/DX Bell) · Tubular Bells (keep) · Crystal Bell (FM4 three parallel modulators · keep FM4 Dense Bell) · Gong (keep Metallic Gong) |
| **Pads** (10) | Warm Pad (keep + S&H→pitch: analog poly) · Glass Pad (sine ring · keep) · Cathedral Pad (keep) · Vowel Choir (formant table, env→morph · merge Choir/Vowel Choir) · Breathing Pad (drift LFO to three destinations · merge Breathing/Evolving/Organic Drift) · Supersaw Pad (keep) · Phaser Pad (notch sweep · rework) · Wave Sequence Pad (keep Wavestation Texture) · Dawn Pad (own slow filter env: the Jupiter sweep · rework Cine · Dawn) · Vector Pad (LFO→Level A/B crossfade · new) |
| **Cinescape** (9) | Glacier Pad (12 s attack) · Basement Drone (−2 oct, 3 s glide · merge Abyss) · Four Winds (per-voice drift) · Shimmer Choir (+12) · Expressive Pad (wheel, aftertouch, pedal) · Nostalgia Tape (tape sat + wow) · Singing Bowl (noise + resonator) · Bowed Metal (saw + resonator) — all keep — · Interstellar (FM pad, shimmer +7, autopan · rework) |
| **Motion** (11) | Acid Line (Seq with accents, slides, ties · merge Acid 303/Acid Squelch) · Berlin Sequence (mono arp, latch, echo in eighths · new) · Uplift Arp (supersaw up-down · keep) · Crystal Arp (bells, random, 3 oct · merge Crystals/Magic Box) · Motorik Bass (arp on a bass · keep) · Trance Gate (synced square tremolo · rework) · Pumping Pad (looping mod env→amp: sidechain · rework Sidechain Pump) · Polymeter Steps (Steps 16·12·5·8 to four destinations · rework Three Cycles) · Steps Melody (a Steps lane as a pitch sequencer, values in twelfths · replaces LFO Melody) · Talking Chord (per-voice S&H→vowel · keep) · Tape Dub (echo with damp, wow and feedback on the edge · merge Tape Dub/Dub Echo) |
| **Percussion** (12) | 808 Kick · 909 Kick · 808 Snare · 909 Snare (merge Zap/909 Snare) · 808 Clap · 909 Rimshot · 808 Cowbell · Closed Hat (FM feedback) · Open Hat · 909 Crash · 909 Ride · Synth Tom — the kit, played in the octave of C3; the «909 Kit» scene plays it |
| **Voice** (5) | Human Choir · Talking Robot · Madrigal (vowel per note) · Solo Voice (glottal source, effort on the envelope · keep Glottal Voice) · Syllables (consonant bite: «ka» · keep Vocal Percussion) |
| **FX & Textures** (8) | Riser (mod env in trigger mode → pitch and filter · rework Tension Riser) · Spaceship (ring + flanger · keep) · Sonar (sine ping + half-note echo · keep Bathysphere) · Computer (S&H→pitch bleeps · keep S&H Bleeps) · Old Radio (keep) · Polar Wind (merge Polar Wind/Tundra) · Ocean (keep Waves) · Laser Zap (keep) |

About 100 with the kit; the measured similarity and the ear decide what goes.

### Scenes

Each scene = three parts of accompaniment (players) + one part for you, with a lead or
keys preset loaded and its player off, so the idea «the synth accompanies, you play»
shows the moment it loads. Keep the four (re-pointed to the new names: Night Ambient,
Dorian Dawn, Hypnotic Techno, Robot Choir) and add **909 Kit** (four percussion parts with
Pulse players, the old loose end), **Berlin School** (sequenced bass, PWM pad, Moog Lead
for you) and **Dub Session** (Reese, skank chord through the tape echo, kit, Vox Lead for
you).

## Triage of the 1.4 bank

Every one of the 160 old presets (124 factory + 36 «Presets 2.0») and the 4 scenes, with
its fate: **keep**, **rework**, **merge →**, or **drop** (why). Nothing is lost: the whole
old bank is archived in `subsdj-bank-1.4.json` (importable).

- **Basics**: Init → keep.
- **Bass**: RC Bass (curve) → merge Funk Bass · Round Sub → keep as Sub Bass · Fat Bass →
  keep as Fat Saw Bass · Reese → keep · Pluck Bass → merge Funk Bass · Acid 303 → merge
  Acid Line (Motion) · Slide Bass → merge Moog Bass · Dub Wobble → rework (synced LFO) ·
  Creamy Bass (24 dB) → merge Moog Bass · Chameleon Bass (note→PW) → merge Funk Bass.
- **Leads**: S&H Lead → keep · Bright Lead → drop (Moog Lead covers it) · Square Lead →
  merge PWM Lead · Supersaw Lead + Trance Supersaw → merge Supersaw Lead · Mono Glide
  Lead → rework Moog Lead · PWM Lead → keep · Vibrato Flute → rework Breath Flute ·
  Vibrato Wah → drop (a demo of a shared LFO).
- **Pads**: Breathing Pad + Evolving Pad + Organic Drift → merge Breathing Pad · Phaser
  Pad (notch) → rework · Plate Pad → drop (same two saws as Warm Pad; the plate lives in
  Cinescape) · Warm Pad → keep · PWM Strings + PWM Ensemble + PWM Unison Pad + String
  Ensemble → merge PWM Ensemble (Brass & Strings) · Supersaw Pad → keep · Glass Pad →
  keep · Choir + Vowel Choir (wavetable) → merge Vowel Choir · Solina Strings → keep
  (Brass & Strings) · Butter Pad, Air Pad → drop (Warm Pad with a different filter) ·
  Cathedral Pad → keep · Matrix Pad → drop (its three ideas go into Warm Pad and
  Breathing Pad) · Wavestation Texture (ws) → keep as Wave Sequence Pad.
- **Cinescape**: all eight → keep (renamed without the parenthesis).
- **Stepped**: One S&H, Three Targets → merge S&H Lead · Table, Filter and Gate · Eight-Step
  Stairs → drop (LFO tricks that the Steps module does properly) · LFO Melody → replaced
  by Steps Melody · Talking Chord → keep (Motion) · Three Cycles → rework Polymeter Steps.
- **Voice**: all five → keep (Glottal Voice as Solo Voice, Vocal Percussion as Syllables).
- **Plucks & Keys**: Pluck + Lottery Pluck + Supersaw Pluck → merge Synth Pluck · Bell
  (Ring) → drop (bells covered) · Music Box → keep · Electric Piano + Touch Keys → merge
  Rhodes · Wavetable Bells (S&H) → drop (Crystal Bell) · Digital Attack (1shot) → keep as
  Digital Keys.
- **Plucked Strings**: Nylon Guitar, Twelve-String, Harp, Koto, Plucked Bass → keep ·
  String Piano → merge Harpsichord · String Bell → drop (bells covered).
- **FM**: FM Piano (Rhodes) + DX E-Piano + DX E-Piano (vel→FM) → merge Rhodes · FM Brass +
  FM Brass (feedback) → merge FM Brass (the FM4 stack) · FM Clav → drop (Clavinet) · FM
  Bass + DX Bass → merge DX Bass · FM Marimba → keep · FM Glockenspiel + DX Bell (env→FM) →
  merge Glockenspiel · FM Bell → drop · Tubular Bell → keep · Metallic Gong → keep as Gong ·
  FM Glass Pad → drop (Glass Pad) · Sci-Fi FM → drop (Spaceship).
- **FM4**: Stacked Brass → keep as FM Brass · Paired E-Piano → keep as DX E-Piano · Dense
  Bell → keep as Crystal Bell · Kick → drop (it is the 808 Kick) · Hat → merge Closed Hat.
- **Organ**: Tremolo, Full, Wavetable → merge Drawbar Organ · Church Organ → keep.
- **Percussion**: all → keep except Zap Snare → merge 909 Snare, Rave Hit → Orchestra Hit
  (Brass & Strings), Laser Zap → FX, FM Hat (feedback) → Closed Hat.
- **Stabs**: Rave Hoover → merge Hoover (Leads) · Supersaw Stab → replaced by Brass Stab ·
  Metallic Stab → drop.
- **FX & Atmospheres**: S&H Bleeps → keep as Computer · Sci-Fi Drone → drop (Spaceship) ·
  Tension Riser → rework Riser · Spaceship → keep · Resonant Blip → drop · Syncopated
  Wobble → drop (Dub Wobble) · Tape Dub → keep (Motion).
- **Presets 2.0**: Acid Squelch → merge Acid Line · Trance Uplift → keep as Uplift Arp ·
  Crystals at Dawn + Magic Box → merge Crystal Arp · Motorik Bass → keep · Dark Pulse →
  drop · Dawn → rework Dawn Pad · Abyss → merge Basement Drone · Spectral Choir → drop ·
  Interstellar → rework · Tundra → merge Polar Wind · Bathysphere → keep as Sonar ·
  Hoover 2.0 → merge Hoover · FM Growl + Neuro Wobble → merge Neuro Bass · Gabber Kick,
  Industrial Saw, Rave Organ → drop · Trance Gate → rework · Sidechain Pump → rework
  Pumping Pad · Helicopter → drop · Dub Echo → merge Tape Dub · Sway, Tremolo Strings →
  drop · Funky Clavinet → keep as Clavinet · Dreamy EP → merge Rhodes · Leslie Organ →
  merge Drawbar Organ · Harpsichord → merge · Vibraphone, Accordion → keep · Hi-Hat →
  drop · 909 Snare → keep (merged) · Waves → keep as Ocean · Polar Wind → keep · Old
  Radio → keep · Diesel Engine → drop.
- **Scenes**: Night Ambient, Dorian Dawn, Hypnotic Techno, Robot Choir → keep, re-pointed
  to the new names and with one part for the player.

## Format and infrastructure

**The bank in code** (`js/engine/presets.js`), one entry per preset with its metadata
NEXT to its sound, commented like the rest of the synth:

```js
{ name: 'Moog Bass', tags: ['analog', 'warm', 'mono'], use: 'note', root: 36,
  play: 'C1–C3, one note at a time (legato glides). Wheel: vibrato · M1: cutoff · M2: drive.',
  data: { mode: 'mono', waveA: 'sawtooth', … } },
```

- `data` is the v2 preset as always (engine space, differences over `PRESET_BASE`).
  `FACTORY` (`{category: {name: data}}`) is derived from the list, so the library, the
  scenes (`factoryPreset`) and the selftest keep working.
- `use` is what the selftest renders to measure it: `note` (one note at `root`, MIDI
  number; C2 for basses, C3 for the rest), `chord` (root + major third + fifth), `hit`
  (one short note: percussion, measured by its peak). Presets with the sequencer or the
  arpeggiator on are measured with them off (they run on the wall clock, not offline).
- `tags` from a fixed vocabulary (the selftest rejects others): character — *analog,
  digital, warm, bright, dark, soft, hard, metallic, glassy, airy, dirty, deep, wide* —,
  motion — *evolving, rhythmic, random, slow, short, long* —, use — *chords, mono, arp,
  seq, drone, kit, expressive* —, style — *classic, cinematic, ambient, techno, trance,
  house, dub, berlin, synthwave, orchestral, world*.
- `play`: one line. The library item carries `tags` and `play` (next to `fav`, outside
  `data`, so Save never overwrites them); search matches name and tags; the quick picker
  and the Presets screen show `play` as the row's tooltip.

**Retiring the old bank** (`engine/library.js`):
- `subsdj-bank-1.4.json`: the whole old bank (factory + Presets 2.0 + the 4 scenes with
  their presets inlined) as a library file with sections «1.4 · Bass»…, importable with
  File ▾ → Import. `subsdj-presets-2.0.json` is no longer seeded and leaves the repo.
- **Bank revision** (`BANK_REV` in the code, `bankRev` in the library). When they differ,
  the library syncs with the code: factory and repo items that are **untouched and not
  favorites** (same name, same section, same content as when they were seeded) are
  removed, the empty factory sections too, and the new bank is seeded with its sections
  first. Renamed, moved, edited or ★ items stay where they are. «Untouched» is known by
  the fingerprint stored at seeding (`seedFp`, new) or, for what 1.4 seeded, by a table
  of the old bank's fingerprints shipped in `engine/legacy.js`. The same mechanism keeps
  a library in step during development (every batch bumps the revision).
- The selftest checks the sync on a fake 1.4 library: untouched → gone, tweaked /
  renamed / moved / ★ → kept, new bank in, nothing duplicated, archive importable.

**Selftest (new or changed checks):**
- *bank metadata*: unique names ≤ 32, non-empty `play`, tags from the vocabulary, valid
  `use`, no data key unknown to the registry.
- *bank coverage*: every wave, filter type and slope, drive character, LFO shape, LFO
  sync, phase mode, mod-env mode, every matrix source and destination, Steps, Seq, Arp,
  wave sequence (loop and 1-shot), vocal, resonator, string, FM4, shimmer, tape, delay
  sync/damp/wow, both reverbs, chorus/ensemble, flanger, unison, flam… used by at least
  one preset. `tools/bank-report.mjs` prints the table (and the holes) from Node.
- *factory batch*: each preset rendered in its `use`: no NaN, not silent, 0 % clipped
  10 ms blocks, −14 ± 3 LUFS (hits: peak between −6 and −1 dBFS), DC below 1 % of the
  peak, and after the release the dry voice is gone (voices and tails at zero). Pads and
  strings also with a four-note chord under the ceiling (7.3).
- *bank similarity*: a spectral fingerprint per preset (energy per third-octave band ×
  time) from the same render; the batch logs the ten closest pairs and fails if any pair
  falls under the threshold calibrated on the first measurement.
- The checks that used factory presets by name (Warm Pad, Glass Pad, 808 Kick, Pluck
  Bass, Square Lead, Plate Pad, Cathedral Pad, DX E-Piano) get frozen fixtures of their
  own: the bank is free to change.

**Measurement protocol** (how each preset is tuned): `node tools/run-selftest.mjs
"selftest=1&batch=factory"` renders the bank and logs, per preset, LUFS, peak, clipped
%, DC, tail and the Master that would land it on −14 LUFS; the Master is written into
the preset; the batch is rerun until the bank is green. Then the ear: category by
category in the browser (Ctrl+F5; the revision sync brings the bank in).

## Workflow

1. This document. 2. Archive of the old bank + fingerprint table (before the code
changes). 3. Infrastructure: bank format with metadata, library sync, selftest fixtures,
new checks, coverage tool, `play` in the UI. 4. The presets, category by category
(Bass first; Motion, Percussion and the scenes last), measured at every step.
5. Scenes. 6. Docs (DESIGN, README, CHANGELOG under «Unreleased», PLAN block 8 ✔) and
screenshots. One commit per milestone; version 1.5.0 by the numbering rule (nothing
saved stops loading: the old bank comes back from the archive).

## Status (2026-10-26, first measured draft)

- **103 presets in 12 categories** (with Basics), **131/131 features covered**, every
  matrix source and destination used. Measured in their use: 71 at −14.0 ± 0.5 LUFS; the
  rest are hits (peak −4 dBFS) or decaying sounds capped by their peak ceiling (Funk Bass,
  Plucked Bass, Koto, Pizzicato, Nylon Guitar, Harp, Synth Pluck, Berlin Sequence, Uplift
  Arp, Crystal Arp, Motorik Bass: −17 to −24 LUFS momentary — «as loud as they can be
  while clean»). 0 % clipped blocks everywhere, DC under 1 % of the peak, every dry tail
  below −80 dB after the release.
- **Similarity** (spectral fingerprint, RMS of dB differences over 24 third-octave bands
  × 3 windows): median distance 16.8 dB; closest pairs Cathedral Pad / Supersaw Pad 1.8,
  Juno Brass / OB Brass 1.9, Juno Brass / Accordion 2.1, Solina Strings / Trance Gate
  2.3, Fat Saw Bass / Acid Line 2.4. The fingerprint sees the spectral envelope, not the
  motion (a gate, an arpeggio, a seq): those pairs are different by ear; the first two
  are the ones to listen to when pruning. Threshold set at 1.5 dB.
- **Eight scenes**, levelled by the peak of a 16 s offline render (−4 to −6 dBFS; the
  Seq-driven parts are silent offline, so Berlin School and Hypnotic Techno sit lower there
  than live).
- **Library sync** tested on a fake 1.4 library (untouched → gone; moved, renamed, edited
  or ★ → kept; an old ★ copy identical to a new preset stays and the new one is not
  duplicated; the user's empty sections stay; a second load changes nothing) and on the
  1.3.0-compatibility fixture (translated AND synced).
- Pending: **Sergio's ear** — prune or rework what does not earn its place; the candidate
  merges above; then the rest of 1.4 (tag filters, audition without loading).

## Decisions

- 2026-10-26 (Sergio): quality over quantity; categories as proposed; explore every
  capability, the matrix above all; presets for the sequencer and the arpeggiator;
  scenes to play along with; reuse the good old presets; nothing that sounds like
  something else in the bank; look at what the consolidated synths ship. The rest left
  to Claude's judgment, with measurements as evidence.
- Eleven categories (Brass & Strings added, by the references); ~100 as the starting
  canon, to be pruned by the similarity measure and the ear.
- Wheel = filter in every preset (vowel on voices); Macro 1 = character; Macro 2 = a
  second layer where it adds (see criterion 5 for why not «vibrato» and «motion»).
- Seed keys carry the bank revision (`factory:2:Name`), so a preset the user tweaked under
  an earlier revision keeps its key and the new one still comes in; an old copy whose
  name and content equal a new preset's is not duplicated (the library's fingerprint rule).
- Hits are measured by peak (−4 dBFS), not loudness: a kick is 50 ms of transient.
- A scene can reserve a part for the player (`keys`, 1-4): its player off, the rack and the
  keyboard go to it on load; exported scenes carry it too.

## Sources

DX7 ROM1A voice list (dx7dump README, github.com/lexonic/dx7dump) · Juno-106 factory
names (hinzen.de/midi/juno-106, after SynthMania; Roland Cloud «The Original 128») ·
Minimoog Sound Charts, Tom Rhea 1974 (matrixsynth.com, 2020-08) · Prophet-5/10 factory
preset list 1.02 and Prophet Rev2 factory preset list (sequential.com) · minilogue xd
program list tallied from the owner's manual (github.com/miclip/patchscore, issue 618) ·
Roland D-50 (Wikipedia) · General MIDI level 1 (Wikipedia) · «The most famous synth
presets of all time» (Gearspace), «5 synth presets that changed pop music» (GearNews) ·
Pigments 5 manual (Types / Styles tags), Serum and Vital pack categories.
