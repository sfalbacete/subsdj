# SubSDJ · Substractive Synthesizer (WebAudio)

Recreación en **tiempo real** del viejo SubSDJ (soft-synth sustractivo hecho en VB.Net)
con HTML + **WebAudio API** nativa. Sin dependencias, sin build.

## Cómo arrancar

Los módulos ES y el AudioWorklet **no funcionan desde `file://`**: hay que servir por HTTP.

```
cd WebAudioAPI/synth_test
python -m http.server 8000
```

→ <http://127.0.0.1:8000/> (o Live Server de VSCode). El AudioContext arranca
suspendido y se reanuda con el primer gesto (tecla o clic).

## Self-test

→ <http://127.0.0.1:8000/?selftest=1>

Renderiza **cada preset de fábrica** en un `OfflineAudioContext` (acorde C3+G3,
1 s de nota + cola de release) pasando por el mismo camino que un preset real
(controles UI → estado del motor), y comprueba:

1. que todas las claves del preset existen en el registro de controles (typos),
2. que el render no contiene NaN/Infinity,
3. que no es silencio (pico > −40 dBFS),
4. que no hay clipping (pico ≤ 0 dBFS),
5. que no hay nombres duplicados en el banco.

Además: migración de presets v1→v2 (check estático) y un **estrés de 16 notas**
que ejercita el robo de voz (`MAX_POLY`) y el recorte de colas (`MAX_TAILS`).

Resultados en un panel en pantalla, en consola (`console.table`) y en el título
de la pestaña (`✓ SELFTEST 52/52`). **Úsalo antes y después de tocar el motor.**

## Grabación, presets y arpegiador

- **⏺ Grabar** (cabecera): graba la salida (lo mismo que suena) y al parar
  descarga un **WAV** 16-bit estéreo con fecha y hora en el nombre.
- **⇩ Exportar / ⇧ Importar** (barra de presets): el banco de usuario viaja como
  JSON. Al importar se validan las claves, se migran bancos v1 antiguos y no se
  machacan nombres existentes (se renombra con sufijo).
- **🎹 SFZ** (barra de presets): congela el preset actual como **instrumento
  multisample** reutilizable en un DAW o tracker. Renderiza offline C1–C7 cada
  4 semitonos (y 2 capas de velocidad si la envolvente de filtro escala con
  ella), recorta silencio, normaliza en global y descarga un zip con
  `samples/*.wav` + `.sfz` listo para Sforzando, Renoise, TAL-Sampler…
  Reverb y delay **no** se hornean (añádelos en el DAW); sin loop points en
  esta versión (nota sostenible ~3 s + release completo).
- **`subsdj-demos.json`** (raíz del proyecto): banco-evidencia importable. Cada
  mejora del motor entra con un par A/B — presets idénticos salvo el parámetro
  nuevo — para oír exactamente qué aporta. Crece con cada bloque de mejoras.
- **Arpegiador** (panel propio): mantén notas pulsadas y las secuencia al BPM del
  panel FX. Modos Up/Down/U·D/Rnd, división ¼/⅛/1/16, 1–3 octavas y knob Gate.
  Los pasos entran con precisión de reloj de audio (look-ahead de 120 ms).

## Teclado

- Layout estilo **tracker** (FastTracker), 2 filas:
  fila baja `Z S X D C V G B H N J M`, fila alta `Q 2 W 3 E R 5 T 6 Y 7 U`.
- Octava: `RePág` / `AvPág`. También con el ratón sobre el teclado en pantalla. Polifónico.

## MIDI

Conecta un teclado MIDI y acepta el permiso del navegador: se enlaza solo
(indicador 🎹 en la cabecera, reconecta en caliente). **Velocity** escala la
amplitud y la envolvente del filtro; **pitch bend** ±2 semitonos; **sustain**
(CC64). Las notas MIDI iluminan el teclado en pantalla.

### MIDI learn (🎛 MIDI map)

Cualquier rosca/slider/botón del cacharro puede gobernar cualquier control de
la UI. Botón **🎛 MIDI map** (cabecera) → clic en un control en pantalla →
mueve el mando físico: ligado (insignia `CCnn` sobre el control). Clic derecho
desliga; `Esc` sale. Funciona también con controles discretos (ondas, segs,
formas de LFO, octavas): el recorrido del mando se parte en N zonas.

- **Persistencia**: el mapa se guarda solo en localStorage **por aparato**
  (clave = nombre del dispositivo MIDI); cada teclado recuerda su mapeo.
  **⇩/⇧ Mapa** lo exporta/importa como JSON (`{formato:'subsdj-midimap-v1',
  ccs:{74:{id:'cutoff',lo:0,hi:1}}}` — `lo/hi` acotan el tramo del rango que
  recorre el mando, editable a mano). **⟲ Fábrica** restaura el mapeo por
  defecto: CC1 (mod wheel) → vibrato, CC74 → cutoff, CC71 → resonancia.
- **Pickup** (checkbox): el mando no actúa hasta alcanzar o cruzar el valor
  en pantalla — sin saltos al cambiar de preset con roscas absolutas.
- **Presets desde el cacharro**: los botones **‹ ›** del banco también son
  mapeables (disparan por flanco de subida: pensados para botones físicos que
  mandan 0/127, aunque una rosca también sirve — dispara al cruzar el centro).
  Y los mensajes **Program Change** cargan directamente el preset *n* del
  banco (módulo su tamaño), sin learn: los botones de programa del teclado
  navegan el banco tal cual.
- El canal MIDI se ignora a propósito (cambiar el canal global del teclado
  no rompe el mapa). Si remapeas CC64 dejas de tener pedal de sustain: tuyo
  es el pie.

## Estructura

```
index.html                     maqueta y paneles (knobs/sliders declarados en HTML)
css/style.css
js/main.js                     entrada: enlaza la UI y arranca el motor
js/selftest.js                 autotest offline (?selftest=1)
js/engine/
  params.js                    PARAMS: tabla ÚNICA de parámetros (defaults, rangos, formato)
  state.js                     estado S del synth, derivado de PARAMS
  AudioEngine.js               grafo de UN instrumento (LFOs, inserciones) + gestión de voces
  Sala.js                      el espacio: delay de cinta, reverb, limitador, máster (por envíos; compartida en Partes)
  parts.js                     modo Partes: 4 motores sobre un contexto + Sala compartida; part() = el que edita el rack
  nodes.js                     nodos auxiliares: ruido, deriva, IR de reverb, curva de distorsión, LFOs
  Harmony.js                   armonía de la escena: escalas, progresión / paseo de funciones, acordes, PRNG con semilla
  Player.js                    jugador por parte: pulso euclídeo, acorde, melodía, raíz (dedos virtuales)
  Conductor.js                 reloj maestro en beats: ticker + look-ahead; scheduleAll() para el render offline
  Voice.js                     cadena por nota: osc (worklet) → filtro LP/HP → VCA → pan
  presets.js                   banco de fábrica + presets de usuario (localStorage)
  worklets/pulse-processor.js  oscilador PolyBLEP (saw/square/sine/tri/supersaw/tabla, FM 2-op + feedback)
js/ui/
  registry.js                  registro CONTROLS {get,set,def,el,opts} → reset/snapshot/presets/midimap
  partsControls.js             botón ▦ Partes + selector 1-4 en la cabecera + módulo Mezclador
  playerControls.js            módulos Armonía (▶ Tocar, escala, progresión, semilla) y Jugador (modo + knobs)
  knobs.js sliders.js oscControls.js   controles (rangos y defaults viven aquí)
  midi.js                      entrada Web MIDI (notas, bend, sustain; CCs → midimap)
  midimap.js                   MIDI learn: mapa CC→control, pickup, export/import, por-aparato
  keyboard.js presetBank.js recorder.js scope.js adsrGraph.js
```

Los presets (formato **v2**) guardan valores en **espacio-motor** (`cutoff` en Hz,
tiempos en segundos…). Los presets de usuario v1 del localStorage se migran
automáticamente al cargar; la copia v1 se conserva como respaldo.

## Roadmap (acordado 2026-07)

1. **Consolidación** ✔ *(hecha 2026-07-03)* — tabla única de parámetros (`params.js`);
   presets v2 en espacio-motor con migración; tope de polifonía con robo de voz
   (`MAX_POLY=10`) y recorte de colas (`MAX_TAILS=12`); distorsión de curva fija;
   crossfade A/B al regenerar la IR de la reverb.
2. **Rendimiento** ✔ *(hecha 2026-07-03)* — worklet multi-octava (octavas dentro del
   processor: 2 worklets por voz en vez de hasta 8); params del worklet a k-rate
   (el pow del detune se paga 1 vez por bloque, no 128); pitch/vibrato/PWM se
   conectan a las voces bajo demanda; mini-HUD (voces · colas · osc) en la cabecera.
3. **Expresividad** ✔ *(hecha 2026-07-03)* — Web MIDI (velocity → amp+filtro,
   pitch bend, sustain, mod wheel, CC74/71); envolvente de filtro con tiempos
   propios (toggle «= Amp / Propia», compatible con los presets antiguos);
   pitch envelope por nota (Amount/Decay) + categoría de presets «Percusión».
4. **Sonido** ✔ *(hecha 2026-07-03)* — chorus/ensemble estéreo; forma de onda por LFO
   (botón sin/tri/saw/sqr en cada grupo); delay sincable a BPM (Libre/⅛/⅛·/¼/¼·/½);
   keytrack→cutoff; autopan (LFO→pan). En lugar de una matriz genérica se añadieron
   las rutas que faltaban — una matriz fuente→destino queda como opción futura.
5. **Utilidad** ✔ *(hecha 2026-07-04)* — grabador WAV (worklet + encoder propio);
   export/import de presets a JSON con validación y migración; arpegiador
   (up/down/updown/random, división musical, octavas, gate) sincronizado al BPM.

**Roadmap completado.** Después llegaron el bloque «sonido pro» (ensemble, drift,
LFO fade, unison, filtro 24 dB + drive, reverb damp/predelay, color de ruido),
**MIDI learn** (mapeo CC→control con persistencia por aparato) y el **exportador
SFZ** (preset → multisample). Ideas menores en la recámara: más divisiones/swing
en el arp y loop points automáticos en el exportador SFZ. La matriz de modulación
se promociona al Roadmap 3.0 ↓.

Aparcado a propósito (no implementar salvo petición): la generación *estática*
de samples del synth original (morphing para modtrackers).

## Roadmap 3.0 «instrumento con carácter» (acordado 2026-08-05)

El objetivo es profundizar el **instrumento** — riqueza de generación e identidad
propia — no añadir herramientas alrededor. Descartado a propósito: secuenciador
multipista (para secuenciar ya hay DAWs; el exportador SFZ es el puente). Ritmo:
sin prisa, una fase cada vez, cada cosa llevada a donde queremos llevarla.

1. **Matriz de modulación** ✔ *(hecha 2026-08-06)* — semi-modular a la manera
   clásica: la cadena de audio sigue fija (es lo que hace que suene bien;
   lección del synth modular), la modulación se libera. Panel con 6 filas
   fuente → destino × cantidad (±, doble clic = 0). Fuentes: los 5 LFOs
   **crudos** (su knob Level no interviene), la envolvente de filtro, velocity,
   altura de la nota y un S&H aleatorio por nota. Destinos: pitch, pulse
   width, cutoff, resonancia, amplitud y pan — todos AudioParams por voz;
   cada uno escala la cantidad por su `MX_SPAN` (params.js). El cutoff se
   modula por el **detune del filtro** (cents ⇒ exponencial): no puede cruzar
   0 Hz por construcción — la lección del cutLFO, garantizada. Claves planas
   `mx1src…mx6amt` en presets v2 (compatibles con snapshot, Reset y MIDI
   learn sin casos especiales). Evidencia: check funcional en el selftest
   (env→amp atenúa; cutoff a tope negativo no silencia), preset de fábrica
   «Pad matricial» y pares A/B «MX 1‑6» en `subsdj-demos.json`.
2. **Oscilador de tabla de ondas + editor** — EN CURSO.
   **W1 motor ✔** *(hecho 2026-08-07)*: onda «Tabla» en el worklet — lookup
   interpolado con **mips por octava** (cada nivel trunca armónicos a lo que
   cabe bajo Nyquist a esa frecuencia: el equivalente tabulado del PolyBLEP),
   4 sets de fábrica definidos por espectro (`engine/wavetable.js`: analógica,
   órgano, formante, metálica; 8 frames por set, mezcla lineal entre
   keyframes), knob **Morph** (`wtPos`) que recorre los frames en vivo y es
   **destino «Wavetable» de la matriz** — el círculo con la fase 1 cerrado:
   env→wt = vocales que barren, S&H→wt = campanas distintas por nota.
   Unison/octavas/drift/glide funcionan igual sobre la tabla. Evidencia:
   check A/B en el selftest (morph 0 ≠ 1), presets «Órgano de tabla»,
   «Coro de vocales (tabla)» y «Campanas de tabla (S&H)», pares WT 1-4 en
   el banco de demos.
   **W2 editor ✔** *(hecho 2026-08-07)*: panel «Editor de ondas» — dibuja a
   mano alzada los frames A/B de la tabla **«usuario»** (canvas con el otro
   frame de fantasma para dibujar el morph con intención); «Suavizar» atenúa
   armónicos altos EN EL ESPECTRO y resintetiza. La receta persistida son
   los PUNTOS (localStorage, 256/frame): puntos → DFT corta con fase
   (senos+cosenos: el dibujo se ve como se hizo) → mips band-limited, el
   mismo pipeline que los sets de fábrica. Selftest: DFT recupera espectro
   conocido, ida-y-vuelta exacta, morph usuario A≠B.
   **W3** (decisión aplazada): expresiones `f(x, t)` — con la variable t
   generan una FAMILIA de frames coherentes, imposible a mano — y/o editor
   de armónicos (aditiva pura).
3. **Piel y personalidad** — tema claro/oscuro seleccionable (variables CSS +
   `data-theme` persistido en localStorage); aspecto físico: fondo de rack,
   tornillos en las esquinas de los paneles (como el SubSDJ primigenio),
   knobs torneados con muesca, sliders con guía fresada, placa con logo
   propio. Verificación con capturas CDP en ambos temas y varios anchos.
   Independiente de las otras dos fases: se intercala cuando apetezca.
   **Primer paso ✔ — rack normalizado** *(2026-08-07/08, fusionado a master)*:
   módulos partidos por función (Osc A/B, Mezcla, FM, Unison, Tabla, Filtro,
   Filtro·carácter, Env filtro, ADSR, Voz·Master, 3 LFOs, Matriz, 4 FX,
   Espacio, Reverb, Arp, Seq, visualizadores) en una rejilla de UNIDADES
   estilo Eurorack (`--rackU`; 1U/2U/3U + `.wide`, `grid-auto-flow: dense`),
   orden por flujo de señal. CERO pérdida: todos los ids intactos (los
   binders no se enteran), sonda PARAMS↔CONTROLS sin faltas, selftest 88/88.
   Refinado con el repaso del usuario: ayudas en tooltips «?» (nunca ocupan
   superficie), casi todo a knobs (log/fmt en knobs.js; el ADSR conserva
   sliders — una envolvente se dibuja, no se gira), iconos SVG de onda con
   `currentColor` (inmunes al tema), FM y LFO PWM se apagan si ningún osc
   los puede usar. Del testeo salieron además tres mejoras de wavetable:
   normalización por sonoridad (RMS), morph sin cancelaciones (alineado de
   fase + compensación por correlación) y `wtUser` (la onda dibujada viaja
   dentro del preset).

4. **Módulo VOCAL (formantes)** ✔ *(hecho 2026-08-17)* — la voz humana como
   lo que es físicamente: un FILTRO (modelo fuente-filtro del habla; los
   formantes viven FIJOS en Hz y no siguen la nota — por eso el set wavetable
   «formante» no canta: sus picos se transponen con el pitch). Banco de 3
   biquad bandpass POR VOZ entre el drive y el LP/HP (`engine/vocal.js` +
   etapa dry/wet en Voice.js, bajo demanda: a Mix 0 no hay nodos): el ruido
   ya sumado se vuelve aliento y el SFZ lo hornea. Morph vocálico u→o→a→e→i
   por WaveShaper (control ±1 → curva de cents → detune del biquad:
   exponencial, audio-rate, y destino **«Vocal»** de la matriz — S&H = una
   vocal por nota, env = articulación). Eje robot↔humano jugable: **Q**
   (bandas finas = vocoder ↔ anchas = suave, con makeup 1/√BW), **Vida**
   (micro-deriva de formantes: 4 senos sub-Hz compartidos, offset aleatorio
   por voz), **Tamaño** (±1200 ct = niño↔gigante). Evidencia: check A/B en
   el selftest (banco suena, /u/ ≠ /i/), presets «Coro humano», «Robot
   parlante» y «Madrigal (vocal por nota)», pares VOC 1-6 en el banco de
   demos (diffs 0.87/0.57/1.55 por sonda CDP).
   **Vocal 2.0 ✔** *(mismo día)* — las tres piezas con mejor ratio
   comprensión/esfuerzo: (a) **fuente glotal** — set wavetable «glotal»
   (modelo Rosenberg: flujo abrir-cerrar-descansar, derivado = radiación de
   los labios; pipeline puntos→DFT→mips del editor reutilizado); el Morph
   pasa a ser ESFUERZO vocal (relajado casi-seno → prensado brillante) y es
   modulable (env→wt = el esfuerzo cabalga la envolvente). (b) **F4-F5 +
   formante del cantante**: la tabla crece a 5 formantes; F4-F5 se apiñan
   con F3 hacia ~3 kHz (el racimo que deja oír una voz lírica sobre la
   orquesta) y el knob **Brillo** escala su ganancia (0 = el banco de 3,
   1 = +12 dB). (c) **Golpe** — consonante al arrancar la nota, en dos
   partes: la **transición de formantes** (la boca arranca cerrada —
   desplazada hacia /u/ en el eje vocálico, proporcional al knob — y se
   abre a la vocal en ~70 ms; es el indicio que el oído usa para oír una
   oclusiva, Haskins) + el **burst** de la explosión por un paso-banda
   ANCHO centrado en el F2 de la vocal actual (punto de articulación:
   «ka» ≠ «ku»), escala con velocity; por el banco fino perdía el 97% de
   la energía (medido: +3% RMS — de ahí la banda propia). Verificación de
   la transición con Goertzel: el arranque es «u-esco» (E262/E654 = 13.1
   con Golpe 1 frente a 0.17 sin él). Presets «Voz glotal (esfuerzo)» y
   «Percusión vocal (ka)», pares VOC 7-12, selftest 95/95 (checks: glotal
   morfa, Brillo audible, el Golpe añade energía y arranca cerrado).

5. **Secuencia de tabla (wave sequencing)** ✔ *(hecho 2026-08-19)* — el
   timbre pasa de knob a FRASE, la misma promoción que el Seq le dio al
   pitch (idea robada del Korg Wavestation). Módulo «Tabla · secuencia»:
   patrón de frames 0..7 ('.' = mantener → pasos largos, ritmo desigual),
   división sobre el BPM, **Fundido** (0 = salto seco · 100% = glissando:
   la rampa ATRAVIESA los frames intermedios con fase alineada — barrido
   de morph, un color que el Wavestation ni tenía) y modo **Loop / 1shot**
   (una pasada que se queda en el último frame: envolvente de timbre
   multi-tramo, el «sample de ataque + synth de cuerpo» del D-50).
   Cómo (`engine/WaveSeq.js`): automatización del AudioParam `wtPos` POR
   VOZ desde su noteOn (`setValueAtTime` + rampa) — cada voz arranca su
   frase al nacer, así un acorde arpegiado queda internamente desfasado
   (imposible con un LFO global); al ser el valor intrínseco del param,
   la matriz sigue sumando encima. Planificación: offline (selftest/SFZ)
   todo de golpe en el noteOn; en vivo, ticker de 25 ms + look-ahead de
   120 ms (el patrón de Arp/Seq) — editar patrón/división/bpm entra en el
   siguiente paso. No añade espectro: organiza EN EL TIEMPO los frames
   que ya hay; con el Seq a otra longitud de frase sale polirritmia
   pitch×timbre. Evidencia: checks en el selftest (parser, secuencia
   audible, 1shot converge al último frame), presets «Textura Wavestation
   (ws)» y «Ataque digital (1shot)», pares WS 1-6 en el banco de demos
   (diffs 0.56/0.55/0.50, selftest 98/98). De paso, la sonda de pares se
   institucionaliza: `?selftest=1&demos=PREFIJO` renderiza los pares del
   banco de demos con ese prefijo y pinga el diff de cada uno (headless:
   queda en el log del http.server) — la regla del banco con herramienta.

Método por fase (el de siempre): selftest en verde antes y después; si la
mejora es audible, pares A/B en `subsdj-demos.json`; si es visual, capturas o
sondas CDP; commit por hito.

## Roadmap 4.0 «partes y música generativa» (acordado 2026-09-10)

Origen: un compañero del usuario enseñó un motor de música ambiental generativa
(4 partes FM con algoritmos DX, pestañas Parts/Mixer/Sequencers/Harmony/
Arrangement, sin teclado). No se copia: se toman los HUECOS que deja ver.
Tres ejes independientes; el rack actual no se toca y con Partes apagadas el
synth es exactamente el de hoy. El teclado se queda: es el banco de pruebas
para confeccionar un sonido antes de guardarlo como preset y usarlo en una
escena. Fuera a propósito: piano roll / línea de tiempo (nadie escribe notas:
son JUGADORES) y duplicar el rack por parte.

**Eje A · que suene fino** (piezas pequeñas, cada una con su par A/B):

- **A1 Delay amortiguado** ✔ *(hecho 2026-09-10)* — knobs **Damp** y **Wow** en
  el módulo Delay. Damp = LP+HP Butterworth (Q −3 dB) a la ENTRADA de cada
  línea del ping-pong, así la 1ª repetición ya pasa una vez por el filtro, la
  2ª dos… (cinta/BBD: el eco pierde agudos —y algo de graves— en cada vuelta;
  recorrido log, LP de Nyquist a 1,2 kHz y HP de 0 a 200 Hz). A 0 el LP queda
  en Nyquist y el HP en 0 Hz, que el biquad de WebAudio reduce a la identidad
  exacta: los presets de siempre no cambian ni una muestra. Wow = dos LFOs
  lentos (0,6 Hz en L, ×1,13 en R: descorrelados) sobre `delayTime`, ±2,5 ms
  a tope ≈ ±1 % de pitch por repetición — el eco se ensancha y se desafina un
  pelo. Por qué: un eco digital sin amortiguar repite el espectro entero en
  cada vuelta y el oído lo lee como barato; de ahí el «suena bien» de los
  delays clásicos. Evidencia: check en el selftest (a Damp 0 los ecos tienen
  el MISMO tilt espectral que la nota directa; Damp 1 lo baja a menos de la
  mitad sin apagarlos; el wow cambia los ecos), preset «Dub de cinta» y pares
  DLY 1-4 en el banco de demos.
- **A2 Reverb de placa algorítmica** (modelo Dattorro, linaje Lexicon 224)
  como AudioWorklet: difusores allpass + tanque en figura de ocho con
  modulación. La densidad de ecos CRECE con el tiempo y la modulación mata los
  modos metálicos; la IR de ruido es estática y granulada. La convolución se
  queda como opción «Sala (IR)» junto a «Placa».
- **A3 Curva de envolvente** — knob lineal↔exponencial en ataque y decay (el
  release ya es exponencial: la sonoridad es logarítmica, un decay lineal en
  amplitud «se queda colgado y luego cae de golpe»).
- **A4 Filtro BP y notch explícitos** — BP = LP y HP en serie. Notch: la suma
  de los numeradores RBJ de LP y HP con el mismo corte da 1 − 2cos·z⁻¹ + z⁻²,
  el notch del cookbook: el morph al 50 % YA es un notch a −6 dB. Prioridad
  baja; demostración bonita para el selftest (sonda Goertzel en el corte).

**Eje B · FM de verdad** — la FM como FUENTE que luego pasa por nuestro
filtro, vocal y matriz: lo que el DX7 nunca tuvo. Nota: una sierra invertida
tiene el mismo espectro de magnitud que la normal (sola suena igual: el oído
es casi sordo a la fase); solo importa como MODULADORA de FM, sumada a otro
oscilador o tras una etapa no lineal — por eso las ondas extra del TX81Z.

- **B1 `fmIndex` como destino de la matriz + feedback** ✔ *(hecho 2026-09-25)*
  — destino «FM índice» en la matriz (`MX_SPAN.fm = 8`, sobre el AudioParam
  `fmIndex` de cada worklet, que recorta en 0): env→índice = pluck y campana
  DX (ataque brillante, cuerpo suave), vel→índice = el tacto del DX7,
  S&H→índice = una campana distinta por nota. Knob **Feedback** (`fmFb`): el
  modulador se realimenta con la media de sus dos salidas anteriores (el
  truco de Yamaha para que no silbe a Nyquist), `y = sin(θ + β·ȳ)` con β
  hasta 3 rad — a ~1,5 el seno ya es una sierra razonable; a tope el bucle es
  caótico = ruido metálico (los hats FM del TX81Z, sin generador de ruido).
  Por qué importa: la FM estática aburre; el DX7 vive de que el índice cambie
  DURANTE la nota. Evidencia (check «FM en la matriz» del selftest, medido):
  env→FM multiplica por 24 el tilt espectral del arranque frente al
  sostenido (0,9 en el control con índice fijo); vel 1 frente a 0,3 da ×7 de
  brillo; feedback 0,6 sube el tilt ×2,25; feedback 1 con índice 12: pico
  −4,7 dB, sin NaN. Presets «Campana DX (env→FM)», «E-piano DX (vel→FM)»,
  «Brass FM (feedback)» y «Hat FM (feedback)»; pares FM 1-4 en el banco de
  demos (diffs 1,37 y 1,38). Selftest 105/105. El worklet sube a `?v=4`.
- **B2 Oscilador «FM4»** — tipo de onda nuevo, como lo fue «Tabla»: 4
  operadores, ~8 algoritmos dibujados como grafos (las hojas modulan, las
  raíces suenan), ratio/nivel/feedback y decay por operador. Aguas abajo todo
  sigue valiendo: filtro, vocal, wave sequencing, SFZ.

**Eje C · partes y música generativa** (el giro de cabeza; no es un multipista):

- **C1 Partes + mezclador** ✔ *(hecho 2026-09-25; decisión «sala global por
  envío» confirmada por el usuario)* — `engine/Sala.js`: el ESPACIO (delay
  ping-pong de cinta, reverb, limitador, máster, analizador) sale del motor a
  una clase propia con modelo send/return, el de los multitímbricos de los
  90: cada motor le manda su señal seca y dos ENVÍOS (el `dlyAmt` y el
  `reverbMix` del preset). En modo de siempre cada motor crea su Sala y
  suena igual — probado con un render DETERMINISTA (Math.random sembrado) de
  8 presets antes y después de la refactorización: de 1,37 M de muestras a
  16 bit, 380 difieren en 1 LSB (reordenar ganancias lineales cambia el
  orden de las sumas en coma flotante) y el resto son idénticas.
  `engine/parts.js`: PARTE = `AudioEngine` completo (`init(ctx, {sala})`)
  sobre el contexto compartido; `part()` es el motor que edita el rack y
  toca el teclado — la UI solo habla con él (registry, keyboard, midi,
  seq…); con la escena apagada es el motor único y nada cambia. `SALA_KEYS`
  (bpm, tiempo/sync/damp/wow del eco, size/damp/pre de la reverb) son de la
  sala: en escena el rack las edita para todas las partes (etiqueta «sala»
  en Delay y Reverb), los presets no las tocan y Reset no las resetea;
  `master` pasa a ser el fader de la parte. `syncControls` vuelca el estado
  de la parte elegida en los controles SIN reaplicarlo (reaplicar cortaría
  sus notas: 'mode'/'seqOn' hacen allNotesOff). UI: botón **▦ Partes** +
  selector 1-4 en la cabecera; módulo **Mezclador** a todo el ancho: por
  parte Nivel/Pan/Delay/Reverb/M (silenciar), columna Sala (máster de la
  escena, realimentación del eco, eco→reverb) y **Capa** (el teclado toca
  todas). La parte 1 hereda el sonido que había al encender. Sin
  persistencia todavía (C3). Evidencia: check «partes» en el selftest
  (estado↔controles ida y vuelta; escena offline de 4 partes: cada una
  suena en su ventana, la silenciada no, bpm/predelay/size llegan al S de
  todas, la cola de reverb de la parte 4 queda en la sala a −44 dB; 106/106),
  sonda CDP en la página real (21 comprobaciones: encender, heredar el
  sonido, elegir parte, cargar preset sin tocar la sala, knobs de sala a
  todas, tira↔rack, capa, mute, apagar) y capturas de cabecera y mezclador.
- **C2 Armonía + jugadores** ✔ *(hecho 2026-09-26)* — `engine/Harmony.js`:
  raíz + escala (13: mayor, menor, menor armónica, dórica, frigia, lidia,
  mixolidia, pentatónicas, blues, tonos enteros, hirajoshi, in sen) +
  progresión de grados con N compases por acorde («1 6 4 5» o «I vi IV V»)
  o PASEO de funciones tonales (T reposo · S tensión suave · D tensión que
  resuelve, con las probabilidades del uso común: T→S/D, S→D, D→T).
  Acordes por terceras SOBRE LA ESCALA (grado, +2, +4, +6 pasos): en 7
  notas salen las tríadas diatónicas; en una pentatónica nunca sale una
  nota ajena. PRNG con semilla (mulberry32): misma semilla, misma sesión;
  cada jugador con su propio flujo. `engine/Player.js`: un jugador por
  parte, cuatro modos (los cinco del plan quedaron en cuatro porque
  Arpegio y Frase salen solos): **Pulso** = ritmo euclídeo E(k, n) — golpe
  en el paso i cuando el acumulador i·k mod n da la vuelta, la recta de
  pendiente k/n dibujada en píxeles (Bresenham); E(3,8) es el tresillo —
  con rotación, probabilidad, acento y gate, sobre la fundamental del
  acorde; **Acorde** = mantiene 3-4 notas del acorde (con el Arp de la
  parte encendido las arpegia; sin él, pad); **Melodía** = paseo por grados
  de la escala con gravedad hacia el acorde en tiempos fuertes, silencios y
  duraciones según la densidad; **Raíz** = fundamental (± quinta)
  re-disparada cada N compases (con el Seq encendido es la raíz que
  transpone la frase). `engine/Conductor.js`: reloj maestro en beats
  (compás = 4) con el patrón del Arp (ticker 25 ms + look-ahead 120 ms);
  tempo = BPM de la sala; `scheduleAll()` planifica todo de golpe para el
  render offline. Los note-off van PROGRAMADOS en el reloj de audio:
  `Voice.release(rel, at)` usa `cancelAndHoldAtTime` (cancelScheduledValues
  borraría una rampa de ataque que acabe después de t) y `when` viaja por
  `_directOff → _releaseVoice → _scheduleTail`. UI: módulos **Armonía**
  (▶ Tocar, raíz, escala, progresión, compases/acorde, Lista/Funciones,
  semilla 🎲, indicador de compás y acorde) y **Jugador** (el de la parte que
  edita el rack: modo + sus knobs). Evidencia: check en el selftest
  (cuantización con empate hacia abajo; I/vi/V de Do mayor; paseo
  determinista con la semilla y distinto con otra; E(3,8) = 10010010 y k
  golpes en toda rotación; escena offline de 4 jugadores sobre 4 partes, 2
  compases: notas 8/7/6/4, 0 fuera de la escala, pulso en la rejilla de
  semicorcheas, sin NaN ni clipping; dos directores con la misma semilla
  emiten eventos idénticos), 107/107; sonda CDP de la página real 16/16
  (armonía por la UI, modos por parte, ▶ emite en todas las partes y en
  escala, el Jugador sigue a la parte, ■ deja cero voces) y capturas.
- **C3 Arreglo y escenas** — reloj maestro en compases, curva de densidad por
  parte sobre un ciclo largo, macro «energía» (densidad, velocity, apertura del
  filtro), deriva lenta de 1-2 parámetros por parte (las manos del que
  improvisa). PRNG con semilla: ESCENA = semilla + 4 presets + armonía + sala,
  exportable como JSON y reproducible. El grabador ya captura el máster.

Orden: A1 → B1 → C1 → C2 → C3; A2 y B2 son bloques grandes independientes
para intercalar cuando apetezca. Método por fase: el de siempre.
