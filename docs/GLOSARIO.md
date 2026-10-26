# SubSDJ · Glosario español → inglés

Para la traducción de la interfaz (decidido el 2026-10-25: solo inglés). Fija cada término una
vez para que salga igual en etiquetas, tooltips, ayudas, presets y documentos. Las filas con
**⚑** son decisiones con alternativa; el resto es la convención habitual de los sintes.

## Criterios

1. **La convención de los sintes manda**: lo que diría el panel de un Moog, un Juno o un DX
   (Cutoff, Resonance, Glide, Env Amount…), no la traducción literal.
2. **Cortas**: el panel es fijo; si la palabra inglesa no cabe, la abreviatura que usan los
   aparatos (Res, Amt, Fdbk, Sat, Len…).
3. **Los identificadores internos no cambian** (`'semitonos'`, `'acorde'`, `'dorica'`,
   `'analógica'`, las claves de los parámetros…): solo lo que se ve. Así los presets, escenas,
   bibliotecas y mapas MIDI guardados siguen cargando y sonando igual.
4. **Notas en letras** (C D E F G A B, con #), no Do Re Mi.
5. **Nombres de presets en Title Case** ⚑ («Warm Pad»), como en los bancos de los sintes en
   inglés. Los paréntesis de los nombres (lo que enseña el preset) se quedan en minúsculas.
6. **Se queda en castellano**: el código y sus comentarios, DISENO.md, PLAN.md, este glosario y
   el selftest (herramienta de desarrollo). README y CHANGELOG (entero) pasan a inglés.

## Cabecera y pantallas

| Español | English | |
|---|---|---|
| Diseño · Secuenciación · Presets | Design · Sequencing · Presets | ⚑ alternativa: Sound |
| Guardar · Archivo ▾ · Comparar | Save · File ▾ · Compare | |
| Borrar preset · Exportar biblioteca · Importar… | Delete preset · Export library · Import… | |
| Exportar SFZ · Acerca de SubSDJ… | Export SFZ · About SubSDJ… | |
| Pánico · Grabar · Partes · Reset · MIDI map | Panic · Record · Parts · Reset · MIDI map | |
| nombre del preset… · buscar… | preset name… · search… | |
| Navegar todos → | Browse all → | |
| clic o ↑ ↓ prueban · Intro elige · Esc cierra | click or ↑ ↓ to audition · Enter picks · Esc closes | |
| ENTRAR · código | ENTER · code | ventana de entrada |
| sintetizador · web audio | synthesizer · web audio | |

## Módulos

| Español | English | |
|---|---|---|
| Osc A · Osc B · Unison · FM · FM4 | (igual) | |
| Mezcla | Mixer | ⚑ el de los osciladores, a la Minimoog |
| Mezclador (Partes) | Part Mixer | ⚑ para no chocar con «Mixer» |
| Cuerda | String | |
| Tabla de ondas · Editor de ondas | Wavetable · Wave Editor | |
| Vocal · Resonador · Filtro | Vocal · Resonator · Filter | |
| Env filtro · Env amp · Env mod | Filter Env · Amp Env · Mod Env | |
| Voz · Master · Salida | Voice · Master · Output | |
| LFOs · Matriz | LFOs · Matrix | |
| Dist · Flanger · Chorus · Delay · Reverb | (igual) | |
| Cinta | Tape | |
| Espacio | Stereo | ⚑ solo lleva Width; alternativa: Space |
| Arpegiador · Secuenciador | Arpeggiator · Sequencer | |
| Tabla · secuencia | Wave Sequence | como en la Wavestation |
| Armonía · Pasos · Jugador · Arreglo | Harmony · Steps · Player · Arrangement | |
| Biblioteca | Library | |

## Conceptos

| Español | English | |
|---|---|---|
| Partes · parte 1 | Parts · part 1 | |
| Escena | Scene | |
| Sala (lo compartido por las partes: delay, reverb, cinta) | Room | ⚑ etiqueta «room» en sus módulos |
| tipo de reverb: Sala · Placa | Hall · Plate | ⚑ «Hall» para no repetir «Room» |
| Capa: el teclado toca todas | Layer: keys play all parts | |
| Deriva (LFO, fuente, arreglo) | Drift | |
| fábrica · ⟲ Traer de fábrica | factory · ⟲ Restore factory | |
| Demos A/B | A/B Demos | ⚑ salen del banco principal, cargables por JSON |

## Controles

| Módulo | Español | English |
|---|---|---|
| Osc | Onda · Octava · Apiladas · sync | Wave · Octave · Stack · sync |
| Mixer | Ring M. · Ruido · Color · Spread · Drift · P.Width | Ring Mod · Noise · Color · Spread · Drift · P.Width |
| Unison | Voces | Voices |
| FM4 | Algoritmo · ratio · nivel · decay · vel | Algorithm · ratio · level · decay · vel |
| String | Brillo · Decay · Posición · Rigidez | Bright · Decay · Position · Stiffness |
| Vocal | Vocal (selector) · Tamaño · Q · Vida · Brillo · Golpe | Vowel · Size · Q · Life ⚑ · Bright · Bite ⚑ |
| Resonator | Mezcla · Material (cuerda ↔ barra) · Decay · Brillo | Mix · Material (string ↔ bar) · Decay · Bright |
| Filter | Reso · Tipo · pendiente · carácter: suave · plegado | Reso · Type · slope · character: soft · fold |
| Filter | Low ↔ Hi · Keytrack · Drive · Asimetría | Low ↔ Hi · Keytrack · Drive · Asym |
| Filter Env | tiempos: sigue Env amp · propios | times: follow Amp Env · own |
| Amp Env | curva · flam: golpes · hueco | curve · flam: hits · gap |
| Voice | voz: Poli · Mono · disparo: Legato · Cada nota | voice: Poly · Mono · trigger: Legato · Retrig |
| Voice | P.Env Amt · P.Env Dec · ±Cents · Amplitud | P.Env Amt · P.Env Dec · ±Cents · Amplitude |
| Output | lim | lim |
| LFOs | forma · level · speed · sync: libre · fade · fase: global/voz · deriva | shape · level · speed · sync: free · fade · phase: global/voice · drift |
| LFOs | Trémolo · formas sin/tri/saw/sqr/S&H/deriva | Tremolo · sin/tri/saw/sqr/S&H/drift |
| Matrix | macro 1 · macro 2 | macro 1 · macro 2 |
| Delay | Time · BPM · Damp · Wow · libre · Sync · realim. · satur. | Time · BPM · Damp · Wow · free · Sync · fdbk · sat |
| Reverb | tipo · Intervalo · ❄ Freeze | type · Interval · ❄ Freeze |
| Tape | Saturación · Wow | Saturation · Wow |
| Arpeggiator | Modo · División · Octavas · Gate · swing | Mode · Division · Octaves · Gate · swing |
| Sequencer | estado · latch · retrig · Pasos · semitonos · grados | state · latch · retrig · Steps · semitones · degrees |
| Wave Sequence | modo · Loop · 1shot · Fundido | mode · Loop · 1shot · Xfade |
| Mod Env | normal · bucle · disparo · Curva | normal · loop · trigger · Curve |
| Part Mixer | Nivel · Pan · Delay · Reverb · M · Máster · Realim. · Eco→Rev | Level · Pan · Delay · Reverb · M · Master · Fdbk · Echo→Rev |
| Harmony | ▶ Tocar · parado · Raíz · Escala · Lista · Funciones · Semilla | ▶ Play · stopped · Root · Scale · List · Functions · Seed |
| Harmony | Progresión · compases por acorde | Progression · bars per chord |
| Steps | reinicio: al tocar · nunca · long. · división · suav. · rot. · deriva | reset: on play · never · len · div · smooth · rot · drift |
| Player | modos Off · Acorde · Pulso · Melodía · Raíz | Off · Chord · Pulse · Melody · Root |
| Player | Golpes · Pasos · Rot · Prob · Gate · Acento · Oct · Vel · Respira · Ciclo | Hits · Steps · Rot · Prob · Gate · Accent · Oct · Vel · Breathe ⚑ · Cycle |
| Player | Notas · Densidad · Silencio · Gravedad · Rango · Legato · Quinta · Cada | Notes · Density · Rest · Gravity · Range · Legato · Fifth · Every |
| Arrangement | Energía · Vaivén · Ciclo · Apertura · Sorpresa | Energy · Sway ⚑ · Cycle · Open ⚑ · Surprise |
| Arrangement | parte N: entra · Deriva · cant. · ⇩ ⇧ Escena · ↺ Última | part N: enters · Drift · amt · ⇩ ⇧ Scene · ↺ Last |
| Library | ★ solo favoritos · + Sección · ★ Míos · Escenas · Importados | ★ favorites only · + Section · ★ Mine · Scenes · Imported |
| Teclado | Octava · Rueda · Bend · Tacto: suave · lineal · dura | Octave · Wheel · Bend · Touch ⚑: soft · linear · hard |
| MIDI map | MIDI LEARN · Esc sale · Pickup · ⇩ ⇧ Mapa · ⟲ Fábrica | MIDI LEARN · Esc exits · Pickup · ⇩ ⇧ Map · ⟲ Factory |

## Matriz: fuentes y destinos

| Español | English |
|---|---|
| LFO cutoff · LFO reso · LFO trémolo · LFO vibrato · LFO PWM | LFO cutoff · LFO reso · LFO tremolo · LFO vibrato · LFO PWM |
| Env filtro · Env mod · Pasos 1-4 · Pasos 1-4 · nota | Filter env · Mod env · Steps 1-4 · Steps 1-4 · note |
| Velocity · Acento (Seq) · Nota (altura) · S&H por nota | Velocity · Accent (Seq) · Note (pitch) · S&H per note |
| Deriva (voz) · Rueda (CC1) · Aftertouch · Expresión (CC11) · Macro 1-2 | Drift (voice) · Wheel (CC1) · Aftertouch · Expression (CC11) · Macro 1-2 |
| Pitch · Pulse width · Cutoff · Resonancia · Amplitud · Pan | Pitch · Pulse width · Cutoff · Resonance · Amplitude · Pan |
| Wavetable · Vocal · FM índice · Nivel A · Nivel B · Nivel Ring · Nivel ruido | Wavetable · Vowel · FM index · Level A · Level B · Level Ring · Level Noise |
| Drive · Pitch A · Material | Drive · Pitch A · Material |

## Armonía: notas y escalas

| Español | English |
|---|---|
| Do Do# Re Re# Mi Fa Fa# Sol Sol# La La# Si | C C# D D# E F F# G G# A A# B |
| mayor · menor · menor armónica | major · minor · harmonic minor |
| dórica · frigia · lidia · mixolidia | dorian · phrygian · lydian · mixolydian |
| penta mayor · penta menor · blues · tonos enteros | major penta · minor penta · blues · whole tone |
| hirajoshi · in sen | hirajoshi · in sen |

## Tablas de ondas

analógica → analog · órgano → organ · formante → formant · metálica → metallic · glotal →
glottal · usuario → user

## Frases del secuenciador

| Español | English |
|---|---|
| Octavas · Bajo ácido · Ácido sincopado · Ácido con slides · Ácido que pregunta | Octaves · Acid Bass · Syncopated Acid · Acid Slides · Questioning Acid |
| Arpegio menor · Arpegio mayor · Arpegio de la escala | Minor Arpeggio · Major Arpeggio · Scale Arpeggio |
| Quintas rodando · Terceras rodando · Hook trance · Bajada frigia | Rolling Fifths · Rolling Thirds · Trance Hook · Phrygian Descent |
| Escalera 2 octavas · Escala que sube y baja · Pregunta-respuesta | Two-Octave Staircase · Scale Up and Down · Call and Response |
| Dembow sub · Ligaduras largas · Redobles · Fanfarria | Dembow Sub · Long Ties · Rolls · Fanfare |
| Blade Runner · Vangelis, Chase · Moroder… (las citas) | (igual) |

## Categorías

| Español | English |
|---|---|
| Básicos · Bajos · Leads · Pads · Cinescape | Basics · Bass · Leads · Pads · Cinescape |
| Escalonados · Voz · Plucks & Teclas | Stepped · Voice · Plucks & Keys |
| Cuerdas | Plucked Strings ⚑ (los «strings» de un sinte son pads de cuerda) |
| FM · FM4 · Órgano · Percusión · Stabs · FX & Atmósferas | FM · FM4 · Organ · Percussion · Stabs · FX & Atmospheres |
| Presets 2.0 (prefijos Arp · Cine · Duro · Ritmo · Tecla · Textura) | Presets 2.0 (Arp · Cine · Hard · Rhythm · Keys · Texture) |

## Presets de fábrica

| Español | English |
|---|---|
| Init (default) | Init (default) |
| **Bajos** | **Bass** |
| Bajo RC (curva) · Sub redondo · Bajo grueso · Reese · Bajo pluck | RC Bass (curve) · Round Sub · Fat Bass · Reese · Pluck Bass |
| Ácido 303 · Slide bass · Wobble dub · Bajo cremoso (24 dB) | Acid 303 · Slide Bass · Dub Wobble · Creamy Bass (24 dB) |
| Bajo camaleón (nota→PW) | Chameleon Bass (note→PW) |
| **Leads** | **Leads** |
| Lead S&H (filtro random) · Lead brillante · Lead cuadrado | S&H Lead (random filter) · Bright Lead · Square Lead |
| Supersaw lead · Supersaw trance · Lead mono glide · PWM lead | Supersaw Lead · Trance Supersaw · Mono Glide Lead · PWM Lead |
| Flauta vibrato · Wah al vibrato | Vibrato Flute · Vibrato Wah |
| **Pads** | **Pads** |
| Pad que respira (deriva) · Pad phaser (notch) · Pad de placa · Pad cálido | Breathing Pad (drift) · Phaser Pad (notch) · Plate Pad · Warm Pad |
| PWM strings · Supersaw pad · Pad de cristal · Pad evolutivo · Coro (choir) | PWM Strings · Supersaw Pad · Glass Pad · Evolving Pad · Choir |
| Strings ensemble · Solina strings · Ensemble PWM · Pad mantequilla | String Ensemble · Solina Strings · PWM Ensemble · Butter Pad |
| Pad catedral · Pad PWM unison · Pad aire · Pad matricial | Cathedral Pad · PWM Unison Pad · Air Pad · Matrix Pad |
| Coro de vocales (tabla) · Textura Wavestation (ws) · Deriva orgánica | Vowel Choir (wavetable) · Wavestation Texture (ws) · Organic Drift |
| **Cinescape** | **Cinescape** |
| Pad glaciar (ataque 12 s) · Drone de sótano (−2 octavas) | Glacial Pad (12 s attack) · Basement Drone (−2 octaves) |
| Pad de cuatro vientos (deriva por voz) · Pad shimmer (coro que sube) | Four Winds Pad (per-voice drift) · Shimmer Pad (rising choir) |
| Pad de ejecución (rueda, aftertouch, pedal) · Pad de cinta (nostalgia) | Performance Pad (wheel, aftertouch, pedal) · Tape Pad (nostalgia) |
| Cuenco tibetano (ruido + resonador) · Metal frotado (sierra + resonador) | Singing Bowl (noise + resonator) · Bowed Metal (saw + resonator) |
| **Escalonados** | **Stepped** |
| Un S&H, tres destinos · Tabla, filtro y puerta (16 · 8 · tresillo) | One S&H, Three Targets · Table, Filter and Gate (16 · 8 · triplet) |
| Escalera de ocho (3 LFO cuadrados) · Melodía de LFO (tonos enteros) | Eight-Step Stairs (3 square LFOs) · LFO Melody (whole tone) |
| Acorde que habla (S&H por voz) · Tres ciclos que tardan 30 s (5 · 6 · 8 · 16) | Talking Chord (per-voice S&H) · Three Cycles, 30 s Around (5 · 6 · 8 · 16) |
| **Voz** | **Voice** |
| Coro humano · Robot parlante · Madrigal (vocal por nota) | Human Choir · Talking Robot · Madrigal (vowel per note) |
| Voz glotal (esfuerzo) · Percusión vocal (ka) | Glottal Voice (effort) · Vocal Percussion (ka) |
| **Plucks & Teclas** | **Plucks & Keys** |
| Pluck · Campana (Ring) · Caja de música · Piano eléctrico · Pluck supersaw | Pluck · Bell (Ring) · Music Box · Electric Piano · Supersaw Pluck |
| Teclas al tacto (vel→filtro) · Campanas de tabla (S&H) | Touch Keys (vel→filter) · Wavetable Bells (S&H) |
| Ataque digital (1shot) · Pluck lotería (S&H) | Digital Attack (1shot) · Lottery Pluck (S&H) |
| **Cuerdas** | **Plucked Strings** |
| Guitarra de nailon · Guitarra de doce cuerdas · Arpa · Koto | Nylon Guitar · Twelve-String Guitar · Harp · Koto |
| Bajo pulsado · Piano de cuerda · Campana de cuerda | Plucked Bass · String Piano · String Bell |
| **FM** | **FM** |
| Piano FM (Rhodes) · DX e-piano · FM brass · Clav FM · Bajo FM · DX bass | FM Piano (Rhodes) · DX E-Piano · FM Brass · FM Clav · FM Bass · DX Bass |
| Marimba FM · Glockenspiel FM · Campana FM · Campana tubular · Gong metálico | FM Marimba · FM Glockenspiel · FM Bell · Tubular Bell · Metallic Gong |
| Pad FM vidrio · Sci-fi FM · Campana DX (env→FM) · E-piano DX (vel→FM) | FM Glass Pad · Sci-Fi FM · DX Bell (env→FM) · DX E-Piano (vel→FM) |
| Brass FM (feedback) | FM Brass (feedback) |
| **FM4** | **FM4** |
| FM4 · Brass pila · FM4 · E-piano pares · FM4 · Campana densa | FM4 · Stacked Brass · FM4 · Paired E-Piano · FM4 · Dense Bell |
| FM4 · Bombo · FM4 · Hat | FM4 · Kick · FM4 · Hat |
| **Órgano** | **Organ** |
| Órgano trémolo · Órgano pleno · Órgano de iglesia · Órgano de tabla | Tremolo Organ · Full Organ · Church Organ · Wavetable Organ |
| **Percusión** | **Percussion** |
| Bombo 808 · Bombo 909 · Tom sintético · Caja zap · Caja 808 · Palmada 808 | 808 Kick · 909 Kick · Synth Tom · Zap Snare · 808 Snare · 808 Clap |
| Rimshot 909 · Cencerro 808 · Hat abierto · Hat FM (feedback) | 909 Rimshot · 808 Cowbell · Open Hat · FM Hat (feedback) |
| Crash 909 · Ride 909 · Hit rave · Láser zap | 909 Crash · 909 Ride · Rave Hit · Laser Zap |
| **Stabs** | **Stabs** |
| Hoover rave · Supersaw stab · Stab metálico | Rave Hoover · Supersaw Stab · Metallic Stab |
| **FX & Atmósferas** | **FX & Atmospheres** |
| Bleeps S&H (pitch random) · Drone sci-fi · Riser tensión · Nave espacial | S&H Bleeps (random pitch) · Sci-Fi Drone · Tension Riser · Spaceship |
| Blip resonante · Wobble sincopado · Dub de cinta | Resonant Blip · Syncopated Wobble · Tape Dub |
| **Presets 2.0** | **Presets 2.0** |
| Arp · Acid squelch · Trance uplift · Cristales al alba · Bajo motorik · Cajita mágica · Pulso oscuro | Arp · Acid Squelch · Trance Uplift · Crystals at Dawn · Motorik Bass · Magic Box · Dark Pulse |
| Cine · Amanecer · Abismo · Coro espectral · Interestelar · Tundra · Batisfera | Cine · Dawn · Abyss · Spectral Choir · Interstellar · Tundra · Bathysphere |
| Duro · Hoover 2.0 · Growl FM · Neuro wobble · Bombo gabber · Sierra industrial · Órgano rave | Hard · Hoover 2.0 · FM Growl · Neuro Wobble · Gabber Kick · Industrial Saw · Rave Organ |
| Ritmo · Trance gate · Sidechain pump · Helicóptero · Eco dub · Vaivén · Cuerdas trémolo | Rhythm · Trance Gate · Sidechain Pump · Helicopter · Dub Echo · Sway · Tremolo Strings |
| Tecla · Clavinet funky · EP soñador · Órgano Leslie · Clavecín · Vibráfono · Acordeón | Keys · Funky Clavinet · Dreamy EP · Leslie Organ · Harpsichord · Vibraphone · Accordion |
| Textura · Hi-hat · Caja 909 · Olas · Viento polar · Radio vieja · Motor diésel | Texture · Hi-Hat · 909 Snare · Waves · Polar Wind · Old Radio · Diesel Engine |

## Escenas

Amanecer dórico → Dorian Dawn · Ambient nocturno (demo) → Night Ambient (demo) · Coro
robótico → Robot Choir · Techno hipnótico → Hypnotic Techno. Los ficheros de `escenas/` no
cambian de nombre (son identificadores).
