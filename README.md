# SubSDJ · sintetizador (WebAudio)

Recreación en **tiempo real** del viejo SubSDJ (soft-synth sustractivo hecho en VB.Net)
con HTML + **WebAudio API** nativa. Sin dependencias, sin build.

## Cómo arrancar

Los módulos ES y el AudioWorklet **no funcionan desde `file://`**: hay que servir por HTTP.

```
cd WebAudioAPI/synth_test
node tools/serve.mjs
```

→ <http://127.0.0.1:8000/>. El AudioContext arranca suspendido y se reanuda
con el primer gesto (tecla o clic). `tools/serve.mjs` sirve con
`Cache-Control: no-store`: **usa este y no `python -m http.server`** para
desarrollar. Python no manda cabeceras de caché y el navegador aplica caché
heurística a los módulos ES (fresco el 10 % del tiempo desde la última
modificación), así que tras editar el motor podías seguir oyendo el `Sala.js`
de hace una hora aunque recargases — pasó con la cinta (bloque 7): tres
versiones del wow y el oído seguía oyendo la primera. Si usas otro servidor,
recarga con Ctrl+F5 después de cada cambio.

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

Sin abrir el navegador: `node tools/run-selftest.mjs ["selftest=1&demos=DLY"]` lanza
Chrome headless por CDP con un servidor estático propio (8001), espera el ping «done»
e imprime resumen, filas fallidas con su motivo, pares de demos (diff y picos), logs
de medida y errores JS; sale con 1 si algo falla. Solo Node ≥ 22 y Chrome (ruta por la
variable `CHROME` si no es la habitual).

## Grabación, presets y arpegiador

- **Grabar** (cabecera): graba la salida (lo mismo que suena) y al parar
  descarga un **WAV** 16-bit estéreo con fecha y hora en el nombre.
- **Biblioteca de presets** (pantalla Presets; `engine/library.js`): UNA fuente
  de verdad para presets y escenas, en secciones que creas, renombras,
  reordenas y borras; los ítems se cargan con un clic, se mueven arrastrando
  (a otra sección o a otra posición), se renombran en línea, se marcan ★
  (salen los primeros en el selector rápido) y se borran; buscar ignora
  acentos y mayúsculas. Vive entera en localStorage (`subsdj.biblioteca.v1`).
  La fábrica (código), los bancos del repo (`subsdj-demos.json`,
  `subsdj-presets-2.0.json`), las escenas de `escenas/` y los presets de
  usuario antiguos son SEMILLA: entran la primera vez y desde entonces mandas
  tú. **⟲ Traer de fábrica** repone solo lo que falte: lo borrado vuelve a su
  sección; lo renombrado, movido o retocado no se duplica (cada ítem sembrado
  guarda su clave `origen:nombre`, y un mismo nombre con el mismo contenido
  nunca entra dos veces, venga de donde venga).
- **💾 Guardar**: en «★ Míos», o encima del preset cargado si el nombre es el
  suyo. **⇩ Exportar / ⇧ Importar** (barra de presets): la biblioteca entera
  como JSON; al importar se funde (secciones por nombre, sin duplicados,
  nunca sustituye), y también entran bancos v2 sueltos (a «Importados», con
  las claves validadas y los v1 migrados) y escenas (a «Escenas»). ‹ › y el
  Program Change MIDI recorren la biblioteca en orden, sin el grupo ★ (que
  repetiría).
- **🎹 SFZ** (barra de presets): congela el preset actual como **instrumento
  multisample** reutilizable en un DAW o tracker. Renderiza offline C1–C7 cada
  4 semitonos (y 2 capas de velocidad si la envolvente de filtro escala con
  ella), recorta silencio, normaliza en global y descarga un zip con
  `samples/*.wav` + `.sfz` listo para Sforzando, Renoise, TAL-Sampler…
  Reverb y delay **no** se hornean (añádelos en el DAW); sin loop points en
  esta versión (nota sostenible ~3 s + release completo).
- **`subsdj-demos.json`** (raíz del proyecto): banco-evidencia, sembrado en la
  sección «Demos A/B» de la biblioteca (`subsdj-presets-2.0.json`, en «Presets
  2.0»). Cada
  mejora del motor entra con un par A/B — presets idénticos salvo el parámetro
  nuevo — para oír exactamente qué aporta. Crece con cada bloque de mejoras.
- **Arpegiador** (panel propio): mantén notas pulsadas y las secuencia al BPM del
  panel FX. Modos Up/Down/U·D/Rnd, división ¼/⅛/1/16, 1–3 octavas y knob Gate.
  Los pasos entran con precisión de reloj de audio (look-ahead de 120 ms).
- **Escenas** (`escenas/*.json`, modo Partes): la escena completa — sala,
  armonía, arreglo, los 4 jugadores y los 4 presets con su mezcla — como JSON.
  ⇧ Escena en el módulo Arreglo o un clic en la sección «Escenas» de la
  biblioteca la carga (enciende Partes si hace falta); ▶ Tocar en Armonía, o
  el ▶ de la escena en la biblioteca, la arranca. Cuatro en el repo: **Ambient nocturno** (Re
  menor, 72 bpm: pad, sub, campana DX y hat entrando por energía), **Amanecer
  dórico** (Fa dórico, 84 bpm: coro de vocales de tabla con el morph derivando,
  bajo cremoso, glockenspiel FM y caja de música), **Techno hipnótico** (La
  pentatónica, 126 bpm: bombo que se cae en los valles, Ácido 303 cuya frase
  del Seq se transpone con el acorde, Wavestation arpegiada, hat E(7,16)) y
  **Coro robótico** (Re hirajoshi, 66 bpm, armonía por funciones: todo el
  módulo Vocal — madrigal, voz glotal, robot parlante y percusión «ka»).

## Pantallas y cabecera

El rack tiene ya ~35 módulos: en un monitor grande cabe todo pero apabulla, y
en uno pequeño no cabe. Tres pestañas enseñan solo lo que toca a cada tarea.
El rack es el MISMO: las pantallas son filtros, no copias. Cada `.panel`
declara en qué pantallas vive (`data-screens="diseno secuenciacion"`) y el
CSS oculta el resto (`body[data-screen]` lo pone `ui/screens.js`), así que
los ids, los LEDs, el MIDI learn y el motor no se enteran, y un módulo puede
estar en varias. Los módulos van en GRUPOS por función, cada grupo con su
propia rejilla y su título: así el relleno «dense» de la rejilla no saca un
módulo de su grupo, y un grupo sin módulos en la pantalla se oculta entero.
Las filas crecen con su módulo más alto (ya no hay alturas fijas de 2U, que
dejaban una fila casi vacía debajo de FM4 o de la matriz).

- **Diseño** — crear un sonido, en cuatro grupos: **Osciladores** (Osc A/B,
  mezcla, unison, LFO PWM, FM, FM4, tabla de ondas y su editor, vocal),
  **Filtro** (filtro, carácter, env de filtro, LFO cutoff y reso),
  **Amplitud y modulación** (ADSR, voz/master, LFO trémolo y vibrato, matriz)
  y **Efectos** (distorsión/flanger, chorus, delay, reverb, espacio). La
  barra rápida de presets vive aquí (y en Presets: guardar, borrar,
  exportar e importar son sus botones).
- **Secuenciación** — que la música se haga sola: **Secuencia y escena**
  (arpegiador, secuenciador, tabla · secuencia y, con ▦ Partes, mezclador,
  armonía, jugador y arreglo) y debajo **Efectos** con Delay y Reverb en su
  papel de sala compartida (etiqueta «sala»). Son el MISMO módulo que en
  Diseño: con Partes encendidas sus tiempos (tamaño, damping, tempo y
  realimentación del eco) son de la escena y solo los envíos de cada parte
  son del preset; están aquí para ajustar la sala sin cambiar de pestaña.
- **Presets** — la biblioteca entera a la vista y en la mano
  (`ui/libraryScreen.js`): secciones en columnas, un clic carga (un preset en
  la parte que edita el rack; una escena enciende las Partes) y el teclado
  sirve para probar; ★, renombrar en línea, arrastrar, borrar, buscar sin
  acentos y «solo ★». Las escenas llevan **▶**: carga la escena, enciende las
  Partes y arranca el director; el icono pasa a **⏹** (solo una escena suena
  a la vez) y ⏹ la para sin apagar las Partes. Detalle en «Grabación,
  presets y arpegiador».

La **cabecera** es un módulo fijo, pegado arriba: título, pestañas, botones,
el **osciloscopio y el espectro** del máster (globales como el teclado: lo
que suena, en todas las pantallas, a resolución física del monitor) y el
estado: dos símbolos, audio y MIDI (el color cuenta el estado; el
tooltip lo explica). El **teclado** está en las tres,
pegado al borde inferior (`position: sticky`): si el rack hace scroll sigue
a mano; si la página es corta se queda en su sitio. La pestaña elegida se
recuerda (`subsdj.screen.v1` en localStorage). Al cambiar de pestaña se
dispara un `resize` porque los canvas de un módulo oculto medían 0. El
plegado de módulos (clic en el título) se quitó: en una rejilla de unidades
no liberaba sitio.

Las **secciones** se pliegan con un clic en su título (la sección entera
desaparece y deja su sitio: para centrarse en una) y un doble clic deja SOLO
esa abierta; el estado se recuerda (`subsdj.groups.v1`). Pendiente para
cuando haga falta: ver el osciloscopio y el espectro en grande.

Evidencia: check «pantallas» del selftest (ningún módulo huérfano y ninguna
pantalla vacía; cada pestaña muestra EXACTAMENTE sus módulos, por estilo
computado, y oculta los grupos sin módulos; la pestaña se marca y se
recuerda; la barra rápida está en Diseño y Presets y no en Secuenciación; la
lista de Presets refleja la biblioteca y un clic carga y queda marcado) y
capturas con `node tools/shot.mjs "pantalla:secuenciacion" out.png` (el
cuarto argumento, `"@fichero.js"`, evalúa una sonda antes de capturar).

## Piel: temas

La piel es un sistema de TEMAS por tokens, no un motor de skins. Toda decisión
visual (color, cara, sombra, radio, letra, qué dibuja el indicador del knob)
vive en el bloque de tokens al principio de `css/style.css`; el resto de la
hoja solo usa `var(--…)`, y los canvas leen los mismos tokens por
`ui/theme.js`. El JS publica el estado (`--pos` 0..1 en knobs y sliders) y el
CSS decide cómo dibujarlo: rayita, punto o arco de valor, carril relleno,
según tokens. Un tema es un bloque `:root[data-theme="id"]` con
`--theme-name`; el `:root` base es el tema por defecto. El desplegable de la
cabecera se llena leyendo las hojas: añadir un tema es añadir CSS. Se
recuerda en localStorage; `?theme=id` lo aplica sin recordarlo (capturas:
`THEME=id node tools/shot.mjs …`; runner: `"selftest=1&theme=id"`).

- **Cinescapes** (por defecto) — carbón plano, cian para el rack y violeta
  para los osciladores, knobs con punto, bisel con la luz arriba y arco de
  valor separado del disco (la caja del knob mide siempre 44 px; el disco se
  encoge `--knob-disc-inset` para que el arco quepa dentro: fuera no hay sitio
  en las filas de cinco knobs), sliders con carril relleno, botones píldora,
  etiquetas en minúsculas. Inspirado en la UI de Cinescapes Pro.
- **Clásico** — el look original: verde y cian, degradados y relieve, rayita
  en el knob, MAYÚSCULAS espaciadas. Es también la prueba de que los tokens
  cubren todo: se reproduce solo con tokens (capturas antes/después a
  ≤ 5 niveles de 255).

El tamaño no es cosa del tema: knob y unidad de rack van acoplados, y la
escala es el zoom del navegador. El selftest vigila que no haya colores a
fuego fuera de los bloques de tokens (check «piel»).

## Teclado

- Layout estilo **tracker** (FastTracker), 2 filas:
  fila baja `Z S X D C V G B H N J M`, fila alta `Q 2 W 3 E R 5 T 6 Y 7 U`.
- Octava: `RePág` / `AvPág`, o los botones − / + bajo el teclado (muestran el
  rango visible, p. ej. C4–C6). Las notas, también con el ratón sobre el
  teclado en pantalla. Polifónico.

## MIDI

Conecta un teclado MIDI y acepta el permiso del navegador: se enlaza solo
(símbolo MIDI en la cabecera: encendido con aparato, apagado sin él, el
tooltip dice cuál; reconecta en caliente). **Velocity** escala la
amplitud y la envolvente del filtro; **pitch bend** ±2 semitonos; **sustain**
(CC64). Las notas MIDI iluminan el teclado en pantalla.

### MIDI learn (MIDI map)

Cualquier rosca/slider/botón del cacharro puede gobernar cualquier control de
la UI. Botón **MIDI map** (cabecera) → clic en un control en pantalla →
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
css/style.css                  hoja única; ARRANCA con el bloque de TOKENS de piel (color, caras, sombra, forma, letra)
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
  Conductor.js                 reloj maestro en beats: ticker + look-ahead; scheduleAll() para el render offline; toJSON/fromJSON
  Arrangement.js               arreglo: energía en ciclos de compases, umbral de entrada, sorpresa, macro de apertura
  Voice.js                     cadena por nota: osc (worklet) → filtro LP/HP → VCA → pan
  presets.js                   banco de FÁBRICA (semilla de la biblioteca) + migración v1→v2 del localStorage antiguo
  library.js                   la BIBLIOTECA: secciones e ítems (preset/escena), semilla, ★, búsqueda, export/import (sin DOM)
  worklets/pulse-processor.js  oscilador PolyBLEP (saw/square/sine/tri/supersaw/tabla/fm4; FM 2-op + feedback; FM4 4 op con algoritmos)
  worklets/plate-processor.js  reverb de placa algorítmica (Dattorro): difusores + tanque modulado, 100 % wet
js/ui/
  registry.js                  registro CONTROLS {get,set,def,el,opts} → reset/snapshot/presets/midimap
  theme.js                     piel: token()/tint()/hue() sirven los tokens CSS a los canvas; selector de tema (lee los temas de las hojas)
  partsControls.js             botón Partes + selector 1-4 en la cabecera + módulo Mezclador
  playerControls.js            módulos Armonía (▶ Tocar, escala, progresión, semilla), Jugador (modo + knobs + Entra/Deriva)
                               y Arreglo (energía, vaivén, ciclo, apertura, sorpresa; ⇩⇧↺ escena)
escenas/*.json                 escenas del repo (⇧ Escena en el módulo Arreglo): ambient nocturno, amanecer
                               dórico, techno hipnótico, coro robótico — el selftest las renderiza todas
  screens.js                   pestañas Diseño / Secuenciación / Presets: filtros (data-screens) sobre el mismo rack; grupos
  groups.js                    secciones plegables del rack (clic: plegar; doble clic: solo esta); estado en localStorage
  libraryScreen.js             pantalla Presets: la biblioteca (secciones, ★, renombrar, arrastrar, buscar, escenas)
  knobs.js sliders.js oscControls.js   controles (rangos y defaults viven aquí)
  midi.js                      entrada Web MIDI (notas, bend, sustain; CCs → midimap)
  midimap.js                   MIDI learn: mapa CC→control, pickup, export/import, por-aparato
  keyboard.js presetBank.js recorder.js scope.js adsrGraph.js
tools/run-selftest.mjs         selftest en Chrome headless (CDP, sin dependencias): node tools/run-selftest.mjs "selftest=1&demos=DLY"
tools/shot.mjs                 captura PNG de un módulo o de una pantalla: node tools/shot.mjs "pantalla:presets" out.png [ancho] ["JS previo"]
```

Los presets (formato **v2**) guardan valores en **espacio-motor** (`cutoff` en Hz,
tiempos en segundos…). Los presets de usuario del localStorage antiguo (v1 o v2)
entran en la biblioteca («★ Míos») la primera vez, migrados; las copias antiguas
se conservan como respaldo.

## Roadmap (acordado 2026-07)

1. **Consolidación** ✔ *(hecha 2026-07-03)* — tabla única de parámetros (`params.js`);
   presets v2 en espacio-motor con migración; tope de polifonía con robo de voz
   (`MAX_POLY=10`) y recorte de colas (`MAX_TAILS=12`); distorsión de curva fija;
   crossfade A/B al regenerar la IR de la reverb.
2. **Rendimiento** ✔ *(hecha 2026-07-03)* — worklet multi-octava (octavas dentro del
   processor: 2 worklets por voz en vez de hasta 8); params del worklet a k-rate
   (el pow del detune se paga 1 vez por bloque, no 128); pitch/vibrato/PWM se
   conectan a las voces bajo demanda; mini-HUD (voces · colas · osc) en la cabecera (quitado el 2026-09-28;
   `engine.stats()` sigue ahí para la consola).
3. **Expresividad** ✔ *(hecha 2026-07-03)* — Web MIDI (velocity → amp+filtro,
   pitch bend, sustain, mod wheel, CC74/71); envolvente de filtro con tiempos
   propios (toggle «Sigue ADSR / Propia» — hasta el 2026-09-28 «= Amp» —, compatible con los presets antiguos);
   pitch envelope por nota (Amount/Decay) + categoría de presets «Percusión».
4. **Sonido** ✔ *(hecha 2026-07-03)* — chorus/ensemble estéreo; forma de onda por LFO
   (botón sin/tri/saw/sqr en cada grupo; desde 2026-09-28 también S&H y deriva); delay sincable a BPM (Libre/⅛/⅛·/¼/¼·/½);
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
   **Segundo paso ✔ — tokens de piel** *(2026-09-28)*: decidido que NO habrá
   motor de skins (CSS libre por selector: cada control nuevo tendría que
   funcionar bajo N skins) sino TEMAS POR TOKENS, y que el tamaño no es cosa
   del tema (knob y unidad de rack van acoplados; la escala es el zoom del
   navegador). La hoja arranca con un bloque de tokens en `:root`
   (superficies, tinta, acentos, knob, teclado, caras compuestas con
   `color-mix()`, sombras, radios, letra) y el resto solo usa `var(--…)`;
   los cinco canvas (ADSR, scope y espectro, Seq, WaveSeq, editor de ondas)
   leen los mismos tokens por `ui/theme.js` (`token()`, `tint()`, `hue()`:
   el truco es asignar el valor a un `fillStyle` y leerlo ya normalizado).
   Fuera del bloque solo se admiten `rgba(0,0,0,·)` y `rgba(255,255,255,·)`
   (sombra y brillo, no color); el check «piel» del selftest escanea
   style.css, js/ui e index.html y falla con cualquier literal (probado
   inyectando un hex en CSS y otro en JS). El look no cambia: capturas
   antes/después a 1500 px, el 99 % de los píxeles a ≤ 8 niveles y el resto
   son los tintes que ahora se DERIVAN del acento (pulgares, botones
   activos, teclas pulsadas) en vez de estar escritos a mano. Selftest
   121/121. Un tema = un bloque `:root[data-theme="…"]` (en html, no en
   body: las caras compuestas resuelven sus `var()` donde se declaran).
   **Tercer paso ✔ — el knob publica, el CSS dibuja** *(2026-09-28)*: knobs.js
   ya no gira nada; escribe la posición 0..1 en la variable `--pos` del
   `.knob` (y `.off` cuando un knob de cantidad está a 0). En el CSS, `.ind`
   es un portador transparente que gira con `rotate(calc(-135deg + var(--pos)
   * 270deg))`; su `::before` es la rayita, su `::after` el punto, y el
   `::after` del knob es el arco de valor: un `conic-gradient` desde 225°
   recortado a anillo con una `mask` radial (en una mask solo cuenta el alfa).
   El halo es un `drop-shadow` del portador: de lo que no se dibuja no hay
   halo. Tokens `--knob-line`, `--knob-dot`, `--knob-arc` (con `-top`, `-gap`,
   `-track`): a 0px apagan cada pieza, así un tema elige rayita, punto, arco
   o mezcla sin tocar JS. Check «knob publica --pos» en el selftest (mín/máx
   → 0/1 y −135°/135° medidos en la matriz del transform, def de un knob log
   = valToPos, act a 0 → .off e indicador a `--edge-hi`), 122/122. La pantalla
   Diseño solo cambia en las rayitas (pivote ahora en el centro exacto). De
   paso, `tools/shot.mjs` captura módulos con el viewport a la altura de la
   página: cabecera y teclado pegajosos ya no tapan módulos bajos.
   **Cuarto paso ✔ — selector de tema** *(2026-09-28)*: un tema es un bloque
   `:root[data-theme="id"]` de la hoja que redefine tokens y se presenta con
   `--theme-name:"Nombre"`; el `:root` base ES el tema por defecto (declara
   `--theme-id` y `--theme-name`). `ui/theme.js` lee las hojas
   (`document.styleSheets`) para llenar el `<select>` de la cabecera: añadir
   un tema es añadir CSS, sin tocar JS. Al elegir: `data-theme` en html, se
   vacía la caché de tokens, evento `theme-changed`, `resize` para que los
   canvas se redibujen, y se recuerda (`subsdj.theme.v1`). `?theme=id` en la
   URL lo aplica sin recordarlo (capturas: `THEME=id node tools/shot.mjs …`;
   runner: `"selftest=1&theme=id"`). Check en el selftest con un tema
   inyectado (aparece en la lista, cambia el token computado y el que se
   sirve a los canvas, se recuerda, avisa, vuelve al base), 123/123.
   **Quinto paso ✔ — los temas** *(2026-09-28)*: el bloque base pasa a ser
   «Cinescapes» (carbón plano, cian/violeta, punto + arco en el knob, carril
   del slider relleno hasta el pulgar — sliders.js publica `--pos` como el
   knob —, píldoras, minúsculas) y «Clásico» es un bloque
   `:root[data-theme="clasico"]` con los tokens de siempre. Tokens nuevos
   para que el knob y el carril pudieran cambiar de carácter: `--knob-face`,
   `--knob-edge`, `--knob-ring`, `--knob-shadow`, `--track-face`,
   `--track-fill`. Verificación: capturas `THEME=clasico` frente a la
   pantalla previa (0,1 % de píxeles cambiados, ≤ 5 niveles: el Clásico se
   reproduce solo con tokens) y capturas de Cinescapes en Diseño,
   Secuenciación y tres módulos a ×2. Selftest 123/123. FASE 3 COMPLETA;
   tornillos, placa con logo y LFOs animados quedan como capricho opcional.

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
- **A2 Reverb de placa algorítmica** ✔ *(hecho 2026-09-27)* —
  `worklets/plate-processor.js`, la topología de Dattorro (JAES 1997, el
  linaje del Lexicon 224) tal cual el artículo: entrada mono → paso-bajo de
  ancho de banda → 4 allpass de difusión en serie (142/107/379/277, g 0,75 y
  0,625) → TANQUE en figura de ocho: dos ramas cruzadas, cada una allpass
  MODULADO (672 / 908 ± 16, g 0,7, LFOs de 1 y 0,95 Hz) → delay (4453 / 4217)
  → paso-bajo de damping → ×decay → allpass (1800 / 2656, g 0,5) → delay
  (3720 / 3163) → ×decay a la otra rama; salida L/R = 7 grifos distintos de
  las líneas del tanque (tabla 2). Longitudes a 29 761 Hz escaladas al
  contexto. Por qué suena mejor que la IR de ruido: la densidad de ecos
  CRECE con el tiempo (cada allpass multiplica reflexiones) y la modulación
  descorrela los modos y mata el metal. Selector **Sala (IR) / Placa** en el
  módulo Reverb (`reverbType`, clave de la sala: compartido en Partes) con
  fundido de 50 ms; solo la reverb activa recibe entrada. Size = RT60 en
  segundos con una tabla MEDIDA (impulso en Node: 1,17 s ↔ decay 0,3 … 8,25 s
  ↔ 0,9); Damp = paso-bajo del tanque; salida a 0,18 (−10,5 dB frente al 0,6
  del artículo) para igualar la energía de la IR de ruido — medido en la
  misma Sala: IR −12,7 / −7,2 dB, placa −11,5 / −8,5 dB a Size 1 / 3, así
  cambiar de reverb no cambia el volumen (el ConvolverNode NORMALIZA su IR:
  la de ruido no es tan caliente como parece). Los worklets se cargan UNA vez
  por contexto (`loadWorklets`, `?v=5`). Bug cazado por el check: el reposo
  del worklet (no calcular en silencio) se activaba antes de que la señal
  llegara a ningún grifo (líneas de 6000 muestras): ahora solo tras más de
  un recorrido completo del tanque sin señal. Evidencia: check «reverb de
  placa» del selftest (impulso: cola monótona −54 → −95 dB en 2,5 s, viva a
  1 s con Size 3 y muerta con Size 0,5; correlación L/R −0,01; densidad
  3 → 732 muestras vivas entre los primeros 20 ms y 100-120 ms; sala ≠ placa
  diff 0,28), 110/110; preset «Pad de placa» y pares PL 1-4 en el banco de
  demos (diffs 0,24 y 1,39).
- **A3 Curva de envolvente** ✔ *(hecho 2026-09-27)* — knob **Curva**
  (`envCurve`, 0..1) en el módulo ADSR: a 0 las rampas de ataque y decay son
  lineales, como siempre (bit-idéntico: el golden no cambia); al subirla se
  vuelven tramos exponenciales tipo RC, como en un ADSR analógico (el
  condensador se carga hacia el objetivo): el ataque sube deprisa y frena al
  llegar, el decay cae deprisa y se posa despacio. Curvatura k = 6·Curva;
  cada tramo va como CADENA de 12 rampas lineales que siguen la exponencial —
  no como `setValueCurveAtTime`: en Chrome una curva en curso no se puede
  cancelar ni anclar (soltar la nota durante el ataque lanzaba una excepción,
  la voz se quedaba colgada y la página llegaba a caerse; lo cazó el usuario
  al primer uso y ahora el selftest suelta una nota a mitad del ataque y
  exige que muera); vale para la envolvente de amplitud y la del filtro
  (`Voice._envSegs`); el gráfico del ADSR dibuja la curva real. Por qué: la
  sonoridad es logarítmica, un decay lineal en amplitud «se queda colgado y
  luego cae de golpe»; el release era exponencial fijo (desde la revisión tras
  el bloque 13 sigue al mismo knob). Evidencia: check en el
  selftest (a mitad del ataque la curva va ×1,92 más alta que la rampa, a
  mitad del decay ×0,51, el sostenido ×1,000), 118/118; preset «Bajo RC
  (curva)» y pares ENV 1-4 en el banco de demos (diffs 0,51 y 0,59).
- **A4 Filtro BP y notch explícitos** ✔ *(2026-09-28)* — selector «Tipo» en
  Filtro · carácter (`filterType`, estructura por nota como la pendiente):
  **LP↔HP** (el morph de siempre: LP y HP en paralelo con crossfade), **BP**
  (LP y HP en SERIE con el mismo corte; la resonancia se reparte, la mitad
  en cada flanco, para que el knob siga siendo dB en el corte; a 24 dB cada
  flanco lleva su 2ª etapa) y **Notch** (LP + HP en PARALELO a ganancia 1:
  los numeradores RBJ de LP y HP con el mismo corte suman 1 − 2cos·z⁻¹ + z⁻²,
  el notch del cookbook, cero exacto en el corte sea cual sea la Q; la
  pendiente no aplica porque en cascada los flancos llegarían en fase al
  corte y el cero se llenaría). Selftest con Goertzel (sierra en C3, corte
  en su 4º armónico): notch −39 dB en el corte frente a LP, BP +23,7 dB de
  corte sobre fundamental, BP 24 dB +18,6 dB más, y la demostración: el
  morph al 50 % da un RMS exactamente 0,500 × el del notch (ES el notch a
  −6 dB). Preset «Pad phaser (notch)» y pares FLT 1-6 en el banco de demos
  (diffs 0,92 / 1,12 / 0,61; el par 1-2 dobla el pico: 0,26 → 0,50).
  Selftest 125/125.
- **LFO con S&H y deriva** ✔ *(2026-09-28, punto 9 del PLAN)* — dos formas
  más en el botón de cada LFO (sin→tri→saw→sqr→**S&H**→**deriva**). Un
  OscillatorNode no las tiene, así que son BUFFERS en loop leídos por un
  AudioBufferSourceNode cuyo `playbackRate` es el knob Speed (unidad del
  buffer 0,1 s a 8 kHz: rate = Hz/10 → un escalón o ~un vaivén por periodo).
  S&H: 128 escalones aleatorios (a 2 Hz tarda 64 s en repetirse). Deriva:
  suma de 5 senos con ciclos ENTEROS en el loop (0,375…1,625 × f), fases al
  azar, normalizada a ±1: continua y sin costura. Semilla fija: renders
  reproducibles. Cada LFO vierte ahora en una salida fija `out` (±1) de la
  que cuelgan su Level y la matriz, así que cambiar de fuente no recablea
  nada. Selftest: buffers (escalones constantes y 127 saltos; deriva con
  salto por muestra < 0,01, pico 1, sin costura), renders distintos (diffs
  0,30 / 0,33 frente al seno), escalera vs continuo por tilt espectral en
  ventanas de 4 periodos (S&H: 73 % de ventanas quietas; deriva: salto
  máximo 14 % del rango), y la matriz lee la forma nueva (diff 0,51).
  Presets «Lead S&H (filtro random)», «Pad que respira (deriva)» y «Bleeps
  S&H (pitch random)» (S&H por la matriz al pitch, ±720 ct: una nota
  mantenida se vuelve melodía aleatoria) y pares LFO 1-6 en el banco de
  demos (diffs 0,40 / 1,23 / 1,38). Selftest 129/129.
- **Percusión: kit 808/909 + flam de palmada** ✔ *(2026-10-01, punto 14 del
  PLAN)* — nueve presets nuevos en la categoría «Percusión» (ya había bombo
  808, tom, caja zap, láser y hat FM): **Bombo 909** (triángulo + soplo de
  ruido = el clic; drive por voz), **Caja 808** (los dos senos de la 808, 180
  y 330 Hz — relación 1,83, no es una octava —, como portadoras del FM4
  aditivo con decay de operador de ~100 ms, más ruido con mucho aire que dura
  más), **Palmada 808**, **Rimshot 909** (BP resonante que la envolvente del
  filtro barre en 30 ms), **Cencerro 808** (587 y 845 Hz como portadoras; el
  drive tanh pone los armónicos de las cuadradas y un BP ancho a 1,2 kHz se
  queda con el «clank»), **Hat abierto**, **Crash 909** y **Ride 909** (cuatro
  portadoras con ratios no enteros y feedback a tope = ruido metálico, más
  ruido por paso-alto; el ride con un «ping» a ratio 9 que sobrevive al
  chapoteo) e **Hit rave** (sierra + cuadrada en unison ×3, envolvente de
  filtro propia, distorsión, caída de pitch). Niveles igualados por medida
  (pico / RMS de 300 ms de una nota C3, con Bombo 808 de referencia: −8 /
  −18 dB). Suenan a caja de ritmos a propósito: así se hacían (la 808 era
  síntesis analógica pura: resonadores amortiguados «bridged-T» para bombo,
  toms y caja, seis cuadradas inarmónicas filtradas para platos y cencerro,
  tren de pulsos para la palmada; la 909 era híbrida, con charles y platos
  muestreados a 6 bits; el sampling puro vino con Linn, DMX y MPC).
  **Prueba de oído (2026-10-01, auriculares HD668B):** la primera tanda de
  bombos y cajas no sonaba a percusión en ninguna octava — sonaba a bajo con
  puerta. Medido: el Bombo 808 se mantenía a −10 dB planos de 50 a 200 ms y
  se cortaba a 400 (decay LINEAL), cuando un parche real es un resonador
  amortiguado que decae exponencialmente desde el primer instante. Y lo que
  hace «golpe» es una **envolvente de brillo**: los primeros 30 ms ricos en
  armónicos y enseguida solo el seno. Se renderizaron candidatos en WAV
  (sonda CDP) y se eligió a oído: **Bombo 808** pasa a ser el diseño FM4
  (operador 2 a ratio 1 con decay de 30 ms = el golpe, operador 3 a ratio 0,5
  = sub-clic, blip de pitch de 700 ct en 40 ms, caída exponencial); **Caja
  808** con Curva 1 y ruido con más aire; y **Curva 1** con decays ~1,5× en
  toda la categoría salvo los tres que ya convencían (Palmada, Hat FM, Hat
  abierto). Lección: la pantalla de medida no sustituye al oído, pero explica
  lo que el oído rechaza.
  **Bug cazado por el usuario al estrenar el bombo** («el golpe solo entra a
  veces»): las envolventes por operador del FM4 contaban el tiempo desde que
  nacía el worklet (`this.t` del processor), no desde que arranca la nota.
  Entre crear el nodo y que abra el VCA pasan el look-ahead (5 ms), el
  nacimiento del processor y el jitter del hilo principal — en directo de 5 a
  30 ms y VARIABLE, y con notas programadas por el arp o los jugadores hasta
  120 ms — así que un modulador con decay de 30 ms (el clic) ya se había
  gastado al abrir el VCA, unas veces sí y otras no; en el render offline el
  desfase era fijo y por eso en los WAV el golpe sonaba siempre. Arreglo: la
  Voice pasa `t0` (el arranque de la nota en el reloj de audio) en las
  `processorOptions` y el processor mide el tiempo desde `max(t0, tBirth)`,
  siendo tBirth el primer bloque que procesa (si el processor nace después de
  t0, el sonido empieza al nacer y la envolvente cuenta desde ahí: el clic
  llega entero); `currentTime` es el reloj del AudioWorkletGlobalScope; sin
  t0 (worklet viejo) cae al reloj propio. De paso arregla el ataque de TODOS
  los presets FM4 tocados por el arp, el Seq y los jugadores, que perdían
  siempre el golpe. Evidencia doble: check «FM4 reloj de operadores» (nota
  programada 250 ms en el futuro frente a inmediata, el tilt espectral de los
  primeros 25 ms es igual y ambos ×12-16 el del cuerpo; verificado que falla
  sin el arreglo) y una prueba EN TIEMPO REAL (AudioContext de verdad en
  Chrome headless, 18 golpes a intervalos irregulares con el hilo principal
  bloqueado 0-30 ms tras cada noteOn, grabados con el recorder-processor):
  con el reloj viejo el brillo del ataque iba de ×21 a ×240 el del cuerpo
  según el golpe (eso es «solo entra a veces»); con el arreglo, de ×80 a
  ×240, siempre con clic. Segunda lección del mismo bug: al tocar un worklet
  hay que SUBIR `WK_V` en AudioEngine.js (?v=N en la URL de addModule) —
  Ctrl+F5 no refresca los módulos del AudioWorklet y el usuario siguió
  oyendo el processor viejo tras el primer arreglo. Y tercera, la que faltaba
  en su máquina (Realtek, salida WASAPI): el **look-ahead de la nota** era
  fijo de 5 ms, pero el reloj que ve el hilo principal va por detrás del de
  audio hasta un periodo de callback del dispositivo (`baseLatency`: 2,7 ms
  con 128 muestras, 10-20 ms en una tarjeta WASAPI) y los eventos tardan otro
  tanto en llegar; cuando la apertura del VCA, el blip de pitch y las ráfagas
  del flam caen «en el pasado» se aplican de golpe, sin transitorio. En
  headless y offline ese retraso es constante (de ahí que el bombo golpeara
  siempre en las grabaciones de prueba y no en el synth del usuario). Ahora
  `mod.lookahead` = 5 ms + 2·baseLatency en directo (25 ms en una tarjeta
  típica; se imprime en consola al arrancar) y 5 ms offline (golden intacto):
  en la prueba en tiempo real el arranque pasa de caer entre 8 y 17 ms tras
  el noteOn, variable, a 25,7 ms clavados, con el ataque del VCA entero. Coste:
  ~20 ms más de latencia de teclado.
  **Y la cuarta, la de verdad** (al poner el margen adaptativo el bombo dejó
  de golpear SIEMPRE, y toda la percusión perdió pegada): lo que el oído lee
  como «golpe» no era el clic FM ni el blip, era el **escalón** — el VCA ya
  abierto cuando el oscilador empezaba a sonar, cosa que antes ocurría al azar
  (cuando el evento llegaba tarde) y con el margen adaptativo nunca, porque el
  ataque de 1 ms, aunque sea RC, se come el primer milisegundo del transitorio,
  que es donde vive el crack. Arreglo en tres piezas: (1) **ataque 0 = escalón**
  (`a` admite 0; `_envSegs` pone `setValueAtTime(peak, t)`; los pulsos
  del flam también son escalones, como en el clap de la 808) y toda la
  categoría Percusión y los FM4 percusivos llevan `a: 0`; (2) **puerta de
  arranque en el worklet**: hasta t0 el oscilador calla y sus fases no
  avanzan, así la onda arranca en su fase configurada exactamente cuando abre
  el VCA (antes corría libre desde que nacía y con escalón el golpe habría
  cambiado de una nota a otra según la fase que pillara); (3) t0 **cuantizado a
  frontera de bloque** (128 muestras) en la Voice, porque la puerta es por
  bloques. Resultado en la prueba en tiempo real: los doce golpes salen
  IDÉNTICOS (brillo ×241,8 el del cuerpo y −11,3 dB en todos, con el hilo
  principal bloqueado o no). Check «arranque determinista»: con ataque 0 el
  primer cuarto de milisegundo ya está a nivel (×1,7 respecto a 5 ms después)
  y dos notas programadas a 200 y 300 ms dan las mismas muestras alineadas por
  arranque (tolerancia ±1 muestra: el escalón se redondea a muestra). El knob
  **Fase** del oscilador A pasa a ser un control del golpe: 90° en un seno es
  el escalón máximo. Selftest 142/142.
  La palmada pedía una pieza de motor: un clap 808 no es un golpe de ruido,
  son tres o cuatro ráfagas a ~10 ms (un tren de pulsos sobre el VCA del
  ruido) y luego la cola por un paso-banda a ~1 kHz; los LFOs no llegan
  (globales, ≤ 20 Hz, sin redisparo por nota). **Flam** en el módulo ADSR:
  knobs **Golpes** (`hits`, 1..4) y **Hueco** (`hitGap`, 5..40 ms). Con
  Golpes > 1, `Voice._flam` programa Golpes−1 ráfagas antes del ADSR: cada
  una sube 0 → pico en el ataque (acotado a un tercio del hueco: una ráfaga
  tiene que ser un golpe) y cae a 0 en el resto del hueco con la curva del
  knob Curva (`_relChain`: lineal o RC), así la siguiente arranca de 0
  limpio y entre golpe y golpe hay un valle; el ADSR completo es el último
  golpe (`_envAmp.t` se desplaza con él: los releases programados por los
  jugadores siguen bien). Con Golpes = 1 el camino es el de siempre
  (bit-idéntico). Soltar durante el flam funciona como siempre: release()
  ancla el valor en curso y cancela las ráfagas que quedaban. El gráfico del
  ADSR pinta las ráfagas. Evidencia: check «flam de palmada» (seno a 880 Hz,
  ventanas medidas desde el arranque real del sonido, a 11 ms: valle/ráfaga
  0,28 con 3 golpes frente a 1,42 sin flam, sostenido ×1,000, la nota muere al
  soltar y también soltando a los 12 ms, en mitad del flam); pares PRC 1-4 en
  el banco de demos (palmada sin/con flam, diff 1,55; caja 808 sin/con
  redoble de dos golpes a 30 ms, diff 1,49). Selftest 141/141.

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
  brillo; feedback a tope sube el tilt ×11 (con 0,6 salía ×1,3-2,4
  según la fase aleatoria del modulador: el check se mide a tope); feedback 1 con índice 12: pico
  −4,7 dB, sin NaN. Presets «Campana DX (env→FM)», «E-piano DX (vel→FM)»,
  «Brass FM (feedback)» y «Hat FM (feedback)»; pares FM 1-4 en el banco de
  demos (diffs 1,37 y 1,38). Selftest 105/105. El worklet sube a `?v=4`.
- **B2 Oscilador «FM4»** ✔ *(hecho 2026-09-27)* — onda «FM4» en Osc A/B
  (worklet): 4 operadores con ratio, nivel y DECAY propios (nivel·e^(−t/decay);
  a tope, constante) y 8 algoritmos en una tabla de quién modula a quién
  (`FM4_ALGS`: pila 4→3→2→1, dos pares, tres en paralelo, Y, un modulador
  para tres portadoras, pila de tres + seno, par + dos senos, aditivo) — un
  algoritmo es solo un grafo dirigido: las hojas modulan, las raíces suenan.
  Modulación de fase en ciclos (nivel 1 ≈ 7,5 rad de índice); los operadores
  se calculan del 4 al 1; el Feedback del módulo FM va al op. 4 (en el
  aditivo lo vuelve sierra). La receta del DX7 en un knob: un modulador con
  decay corto = ataque brillante que se apaga. Módulo **FM4** (2U): selector
  de algoritmo + Ratio/Nivel/Decay × 4; se apaga si ningún osc usa la onda.
  Aguas abajo todo sigue valiendo (filtro, vocal, matriz, wave sequencing,
  SFZ). 13 params `fm4*` planos (presets, MIDI learn y snapshot sin casos
  especiales); el worklet sube a `?v=6`. Presets «FM4 · Brass pila», «FM4 ·
  E-piano pares», «FM4 · Campana densa», «FM4 · Bombo», «FM4 · Hat»; pares
  F4 1-4 en el banco de demos (diffs 1,16 y 1,43). Evidencia: check en el
  selftest (los 8 algoritmos suenan y cada uno difiere del anterior, diffs
  1,2-2,0; decay del op 2: tilt arranque/sostenido 1095 frente a 1,03 con
  decays planos; FM4 ≠ seno 2-op), 116/116.

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
- **C3 Arreglo y escenas** ✔ *(hecho 2026-09-26)* — `engine/Arrangement.js`:
  la forma a escala de minutos. ENERGÍA E(compás) = Energía (centro) +
  Vaivén × un vaivén en coseno de Ciclo compases (arranca abajo, culmina a
  mitad, vuelve a bajar). Cada parte tiene un umbral («Entra», en Jugador):
  toca solo cuando E ≥ umbral — el dron a 0 siempre, el bombo a 0,7 cuando
  la cosa se anima; la curva no lleva ruido, así no hay parpadeos. La
  energía escala además velocity (70-100 %), probabilidad del pulso
  (75-100 %) y densidad de la melodía (±0,25). SORPRESA = silencios de un
  compás por parte, hash determinista de (semilla, compás, parte). APERTURA
  = macro que suma cents al detune de los filtros de todas las voces de
  todas las partes (`macroCut`, la misma ruta exponencial que el destino
  Cutoff de la matriz): ±1 octava entre energía 0 y 1; en vivo va suavizada
  cada 100 ms, offline automatizada por compás en el propio AudioParam.
  DERIVA por parte («Deriva» + «Cantidad» en Jugador): un parámetro del
  preset pasea despacio alrededor del valor que tenía — 3 senos de periodos
  primos (23, 37, 59 beats) con fases de la semilla; cutoff en octavas, el
  resto en ± mitad del rango; el knob del rack la sigue si es la parte que
  editas. Todo determinista con la semilla. ESCENA = JSON
  (`subsdj-escena-v1`): sala (SALA_KEYS + máster, realimentación,
  eco→reverb), director (semilla, armonía, arreglo, los 4 jugadores) y
  partes (estado completo del preset, nombre, pan, mute; o bien `preset` de
  fábrica + `ajustes`, como la demo escrita a mano). Botones en Arreglo:
  ⇩ exporta, ⇧ importa (enciende Partes si hace falta), ↺ Última recupera
  el autoguardado (localStorage cada 3 s y al cerrar). `subsdj-escena-demo.
  json`: «Ambient nocturno», Re menor i-VI-III-VII a 72 bpm, pad (acorde,
  deriva de cutoff), sub (raíz), campana DX (melodía escasa) y hat FM
  (pulso E(5,16)) entrando por umbrales 0 / 0,3 / 0,55 / 0,75.
  Dos hallazgos por el camino: (1) el motor ahora sabe si el contexto es
  OFFLINE (`ctx.startRendering`) y entonces no aplica el tope de colas ni
  sus temporizadores de reloj de pared — offline el reloj de audio corre
  más rápido y `MAX_TAILS` mataba voces a destiempo, no determinista y
  silenciando notas por sonar (afectaba a renders con muchas notas cortas);
  (2) WebAudio suma las entradas de un nodo en un orden que depende de
  direcciones de memoria: dos renders idénticos difieren en el último bit
  (~1e-7, −140 dB), así que «misma semilla = mismas muestras» se mide con
  esa tolerancia. Evidencia: check en el selftest (energía E(0)=0,3 y
  E(8)=0,9 con Energía 0,6/Vaivén 0,6/Ciclo 16; umbral 0,85 calla al
  arrancar y entra en la cumbre; sorpresa determinista, 13/40 a tope; JSON
  exportar → alterar → importar devuelve exactamente lo exportado; misma
  semilla: máx 2e-7 entre renders, otra semilla: 0,6; macro −480/+960 ct;
  la demo carga y suena a −4 dB), 108/108; sonda CDP de la página real 19/19
  (demo por el camino de la UI, tiras y rack, armonía y sala desde la
  escena, macro y deriva en vivo con el knob siguiéndola, indicador de
  ciclo/energía/quién toca, autoguardado y ↺ Última) y capturas. Cazadas
  después dos notas colgadas al parar (sonda que las reproduce): (a) las
  partes con Arp/Seq reciben las notas del jugador por temporizador, y al
  parar dentro de la ventana de anticipación el note-off llegaba ANTES que
  el note-on → el Arp se quedaba sosteniendo (ahora los note-on pendientes
  se cancelan y los note-off «ya» son síncronos); (b) el Seq con latch
  seguía la frase al soltar la raíz (parar la limpia). Botón **⏹ Pánico** en
  la cabecera (y tecla Escape): para el director y corta todo en todas las
  partes.

**Fuera de los ejes · 13a Pantallas** ✔ *(hecho 2026-09-27; propuesto por el
usuario)* — pestañas Diseño / Secuenciación / Presets como filtros sobre el
mismo rack (`data-screens` por módulo + CSS, `ui/screens.js`), teclado
pegajoso, pantalla Presets con el banco entero por secciones
(`ui/presetScreen.js`), aviso «Escena» en Secuenciación con las Partes
apagadas. Check «pantallas» en el selftest, 119/119; sección «Pantallas»
arriba. De paso, el runner headless y la captura viven ya en `tools/`
(punto 11 del plan): `node tools/run-selftest.mjs` sale con 1 si algo falla.

**13b Biblioteca de presets** ✔ *(hecho 2026-09-27)* — `engine/library.js`
(modelo sin DOM: secciones e ítems preset/escena, semilla con clave
`origen:nombre` más huella canónica del contenido, favoritos, búsqueda sin
acentos, exportar/importar que funde), `ui/presetBank.js` encima (★ Favoritos
primero; ‹ › y Program Change saltan el grupo ★) y `ui/libraryScreen.js`
(columnas, clic carga, ★, renombrar en línea, arrastrar entre secciones y
posiciones, borrar, buscar, «solo ★», ⟲ Traer de fábrica, escenas por el
camino de ⇧ Escena). Decisiones del usuario: lo de fábrica se puede borrar
(con la red de ⟲), las escenas son una sección, la barra rápida recorre toda
la biblioteca. Evidencia: check «biblioteca» del selftest sobre un
almacenamiento falso (siembra fábrica + usuario v1 migrado; resembrar no
duplica; borrar de fábrica y traer lo repone en SU sección; renombrado o
retocado no vuelve; secciones crear/renombrar/mover con orden/reordenar/
borrar; ★; buscar sin acentos; exportar → importar ida y vuelta exacta y
repetir no duplica; banco v2 y escena sueltos; persistencia; ficheros del
repo por fetch: 114 la primera vez, 0 la segunda), 120/120; capturas de la
pantalla con favorito y filtro. Las escenas guardadas antes de la biblioteca
(`presetVal` de la forma `f:Nombre`) siguen etiquetando la parte: se
resuelven por nombre.

**Revisión tras 13** *(2026-09-27, sugerencias del usuario)* — cabecera
como módulo fijo con osciloscopio y espectro (sección «Pantallas y
cabecera»); Diseño en grupos por función con título, cada grupo con su
rejilla, plegables (clic) y «solo esta» (doble clic); **▶/⏹** en las escenas
de la biblioteca (carga, enciende Partes y arranca; una sola a la vez; ⏹
para sin apagar las Partes); el **release sigue al knob Curva** como ataque
y decay (recta a 0 con Curva 0, RC con Curva 1; antes era exponencial fijo,
τ = r/4, y el gráfico lo dibujaba recto: OJO, los presets con Curva 0
sueltan ahora en línea recta), también en los note-off programados de los
jugadores (el valor en t se calcula con la misma curva); fuera el plegado de
módulos y el aviso «Escena»; sin alturas fijas de 2U. Se probó un medidor
«CPU audio» (worklet cronometrando los huecos entre quanta) y se quitó: no
medía bien. Check «curva de envolvente» ampliado (release recto a la mitad
a mitad de camino; RC se posa; ambos a 0 en r), 120/120.

**Tanda visual** *(2026-09-28, lista de Sergio)* — cabecera sin ruido: fuera
el HUD de voces/colas/osc, el «WebAudio · AudioWorklet» y el subtítulo
«Substractive Synthesizer» (ya no es solo sustractivo); el estado queda en
dos **símbolos** (`ui/status.js`: ⏻ audio y un DIN MIDI, SVG con
`currentColor`): apagado, esperando (late), activo (acento con halo) o
error (rojo), y el tooltip lo explica. El logo **SubSDJ** lleva un degradado
acento→acento2 recortado al texto (`background-clip:text`) que fluye ida y
vuelta cada 10 s y un halo por `drop-shadow` (un `text-shadow` se pintaría
ENCIMA del degradado recortado); sale de los tokens, así cambia con el tema,
y `prefers-reduced-motion` lo para. Botones sin símbolos (MIDI map, Reset,
Pánico, Grabar, Partes, Guardar, Borrar, Exportar, Importar, SFZ: no eran
homogéneos). **Selects a la altura de los botones**: una sola regla `select`
con el padding y el cuerpo de un `.btn` (cada uno llevaba el suyo, 3-4 px /
11 px, y con `appearance:base-select` el navegador no añade marco propio: el
hueco que se ve es exactamente el nuestro); el de tema es píldora como sus
vecinos. Fuera la etiqueta «Presets». Editor de ondas: Seno y Sierra con su
icono (los mismos SVG de los osciladores) y Suavizar como icono «zigzag →
onda». «= Amp» del Env filtro pasa a **«Sigue ADSR»**. Bajo el teclado, en
vez del texto explicativo, un stepper de **octava** (− / +, muestra el rango
visible, p. ej. C4–C6; RePág/AvPág siguen). Selftest 129/129.

**Nota colgada al cambiar de parte** (cazado por el usuario, 2026-10-01:
«cambio de parte mientras toco y el audio se corrompe, los instrumentos se
interrumpen»). El note-off del teclado y del MIDI iba a la parte ACTUAL
(`part()`), no a la que había recibido el note-on: al cambiar de parte con una
tecla pulsada, la nota se quedaba colgada en la parte anterior — una voz
ocupada para siempre (con varias, el robo de voz de MAX_POLY se comía las
notas del jugador: «se interrumpen») y, en mono, el jugador ya no re-disparaba
sino que RESBALABA en legato sobre la nota colgada («se corrompe»). Arreglo:
`NoteRouter` en `engine/parts.js` recuerda a qué motores fue cada note-on y
manda el note-off a esos mismos (cubre también la Capa y el blur de la
ventana). De paso, un id ajeno ya no toca al motor: `Seq.unhold` no apaga el
latch ni para la frase, y `_monoOff` no re-desliza la voz mono de otro. Check
«teclado ↔ partes» en el selftest; 130/130.

Orden: A1 → B1 → C1 → C2 → C3; A2 y B2 son bloques grandes independientes
para intercalar cuando apetezca. Método por fase: el de siempre.

## Roadmap 5.0 «cinescape» (acordado 2026-10-03)

Origen: «no soy capaz de sacar sonidos que llamen la atención: lo que sale es
clásico». Diagnóstico: el motor es un sustractivo completo, pero (1) **todo se
mueve a la vez** — los LFOs son globales al motor y un acorde respira como un
bloque; (2) **las constantes de tiempo son de instrumento, no de paisaje** —
ataque ≤ 2 s, release ≤ 3 s, LFO ≥ 0,05 Hz, sala ≤ 4 s; (3) **el espectro es
siempre armónico y estable**. Lo cinematográfico es cada voz a su ritmo, diez
veces más lento, en una sala que suena más que la nota, con material que no está
en la nota. La receta «sierra + cuadrada + unísono + LP 24 dB + reverb grande»
de cualquier tutorial ES el pad clásico de fábrica («Supersaw pad», «Pad
catedral»): no saca de ahí. De esa receta solo faltaba el suboscilador.

Bloques, por valor frente a coste: **1 tiempo ×10 + octava por oscilador** ·
**2 deriva por voz como fuente de la matriz** (y fase aleatoria por voz en los
LFOs: decorrelación) · **3 shimmer y freeze en la Sala** (pitch shifter granular
+12/+7 en la realimentación de la reverb; freeze = decay ≈ 1 con la entrada
cerrada) · **4 fuentes de ejecución** (rueda, aftertouch, expresión en la
matriz: el pad se toca) · **5 resonadores** (banco de combs o modos inarmónicos
excitado por ruido continuo: cuencos, metal frotado; el banco Vocal ya es un
banco de pasabandas) · **6 granular** (nubes de granos sobre la tabla de usuario
o lo último grabado: lo único que no repite nunca) · **7 cinta en máster**
(siseo, wow de pocos ms, saturación suave). Orden: 1 → 2 (escuchar) → 3; 5 y 6
cuando tiempo y decorrelación estén resueltos (sin eso también sonarían
clásicos). Detalle por bloque en PLAN.md. **Estado (2026-10-03): 1, 2, 3, 4,
7 y 5 hechos, escuchados y en master; el 6 (granular) queda APARCADO a
petición de Sergio («para otro momento»).**

**1 Tiempo ×10 + octava por oscilador** ✔ *(hecho 2026-10-03)* — Rangos: ataque
y decay hasta 20 s y release hasta 30 s (ADSR y Env filtro), glide 10 s, LFO
Fade 20 s, P.Env Dec 10 s, los seis Speed de LFO desde 0,005 Hz (un ciclo cada
200 s: a esa escala el LFO deriva, no oscila), Delay hasta 4 s (`DLY_MAX` 4,5 s
en la línea; el sync se recorta a 4), Size de reverb hasta 20 s y predelay hasta
250 ms. La IR de 20 s se genera en ~55 ms y el convolver gasta CPU en proporción
a la IR (por eso 20 y no 60; la placa no paga longitud). Placa: la tabla
RT60→decay se amplía con puntos MEDIDOS en Node entre 1 y 15 s — la cola tardía
del tanque cae más despacio que el tramo inicial (la difusión de los allpass
reparte la energía al principio), y en una cola de 20 s manda la pendiente
tardía: 16,2 s ↔ 0,93 · 21,8 ↔ 0,95 · 26,3 ↔ 0,96; Size 20 ↔ decay 0,944 (el
worklet admite 0,98); los seis puntos viejos se conservan (los presets no
cambian). Todo en **log** (`params.js`): un slider lineal de 0..20 s pondría el
milisegundo en el 0,005 % del recorrido; con `lmin`, la posición 0 sigue siendo
0 EXACTO (ataque = escalón, glide apagado) y el resto va en log desde el paso
viejo. Los **sliders guardan el valor** en vez de releerlo de la posición: un
slider log de 1000 pasos cuantizaba cada preset al cargarlo (±1 % a 12 s de
ataque). **Octava** por oscilador (`octA`/`octB`, −2..+2; stepper «Octava»
junto a «Apiladas», el antiguo «Octavas»): el oscilador suena a f·2^oct como
RATIO de frecuencia (`o.ratio`, el mismo que usa el glide), así los cents y el
portamento siguen significando lo mismo; −1 es el suboscilador que faltaba (las
octavas apiladas solo iban hacia arriba). Colas: `MAX_TAILS` 12 → 16 y el
fundido de la cola que sobra pasa de 10 a 350 ms (con 25 s de release la cola
más vieja aún suena a medio nivel cuando le toca irse: 10 ms era un clic).
Evidencia: cuatro checks en el selftest — «octava por oscilador» (cruces por
cero: 131,0 / 65,5 / 261,5 Hz a 0 / −1 / +1; el glide en mono a −1 acaba en
98,0 Hz), «tiempos ×10» (ataque 10 s: nivel a 1 s / 2 s = 0,482; release 20 s:
a 2 s de soltar 0,901; tabla PARAMS ida y vuelta con 0 exacto; controles
devuelven exacto lo que se les pone), «LFO a 0,005 Hz» (seno 0,0314 =
sin(2π·0,005); S&H sin cambiar de escalón en 1 s) y «sala y delay largos» (IR de
20 s: nivel a 10 s 0,179 ≈ (½)^2,5; cola a 3,5 s con Size 20 / 4: IR −39 / −87
dB, placa −43 / −74 dB; eco a 3,5 s −28 dB con el hueco anterior en silencio);
148/148. Categoría **Cinescape** en fábrica («Pad glaciar (ataque 12 s)»,
«Drone de sótano (−2 octavas)») y pares **TIEMPO 1-4** (diff 0,73 / 0,30) y
**OCT 1-2** (0,73) en el banco de demos.

**2 Deriva por voz + fase por voz de los LFO** ✔ *(hecho 2026-10-03)* — El
problema: los LFO son UNO por motor, así que un acorde respira en bloque; el
oído lee «vivo» cuando cada voz hace lo suyo a su ritmo. Dos piezas, ambas en
el módulo Matriz. (a) Fuente **«Deriva (voz)»**: un paseo lento PROPIO de cada
voz — el buffer de deriva de los LFO (`nodes.lfoBuffers`, suma de 5 senos con
ciclos enteros: continuo y sin costura) leído por un `AudioBufferSource` por
voz a la velocidad del knob **Deriva Spd** (0,005–5 Hz, log; 0,05 Hz = un
vaivén cada 20 s), ±1 crudo; a cutoff, pan, wavetable o amplitud, cada nota del
acorde evoluciona por su cuenta. Se crea solo si algún slot la usa. (b)
Selector **LFO global / LFO por voz** (`lfoPhase`, por nota): con «por voz»
cada voz crea sus COPIAS de los LFO de cutoff/reso/vibrato/PWM/pan
(`nodes.mkVoiceLFO`; cutoff y reso al nacer porque siempre van cableados,
los demás bajo demanda como los `ensure*`) y las arranca en su fase; el
trémolo sigue siendo global porque va tras la mezcla. Un `OscillatorNode` no
admite fase inicial, así que los LFO por voz son **buffers de un periodo** (1 s
a 8 kHz, `playbackRate` = Hz) con las mismas fases que el oscilador nativo
(sin/tri/saw arrancan en 0 subiendo, sqr en +1); S&H y deriva usan los buffers
de siempre. Cambiar forma o Speed a mitad de nota ancla la fase en curso y
sigue (no reinicia el ciclo). La **fase de cada voz** sale de la secuencia de
Weyl k·φ mod 1 (φ = razón áurea, contador por contexto): determinista —
renders y SFZ reproducibles, y el selftest puede MEDIRLA— y máximamente
repartida (dos notas seguidas nunca caen cerca); la voz 0 tiene fase 0, así
que una nota sola suena como con el LFO global. Las voces vivas reciben
Level/Speed/forma en vivo (`Voice.setLfo`, `setMxDriftSpd`). Evidencia: check
«fase por voz» — acorde C3+G3 con LFO→amplitud vía matriz y pista de amplitud
por nota (Goertzel con Hann, 50 ms): correlación entre notas 1,000 en global y
**−0,738 por voz, que es cos(2π·0,618) = −0,74**; la voz 0 por voz contra
global 0,999; buffers de forma con las fases del nativo. Check «deriva por
voz»: correlación entre notas 0,122 (la autocorrelación del buffer al desfase
de Weyl sale ≈0,13 a mano), vaivén ×31 en cada voz, dos renders iguales **bit
a bit** (máx |Δ| = 0), a 0,005 Hz vaivén 1,03 en 2 s; 151/151. Lección del
check: con dos senos a nivel normal el **limitador de la Sala** (umbral −3 dB)
comprimía la suma y acoplaba las pistas (corr −0,995 falsa); el render de
prueba va a −12 dB. Preset «Pad de cuatro vientos (deriva por voz)» en
Cinescape; pares **FASE 1-2** (diff 0,45) y **DERIVA 1-2** (0,52).

**3 Shimmer + freeze en la Sala** ✔ *(hecho 2026-10-03)* — **Shimmer**: bucle
cola → HP 120 Hz → LP 5 kHz → desplazador de tono → ×g → entrada de la reverb
(vale para la IR y para la placa; claves de la Sala `shimAmt`, `shimInt`:
compartidas en Partes y fuera del preset en ese modo). El desplazador
(`worklets/shift-processor.js`) es el granular clásico: una línea de retardo y
dos cabezas cuyo retardo baja en rampa de 100 ms a 0 — leer acercándose a la
escritura es leer más deprisa, ×2^(st/12) —, cada una con ventana seno (0 en
el salto) y a media vuelta (sen² + cos² = 1: potencia constante); a +12 salen
10 granos por segundo, el leve trémolo de todo shimmer, que la reverb
disuelve. Intervalos +12 / +7 / +5 / −12. La ganancia del bucle se **calibra
contra la energía de la reverb**: la primera versión llevaba una ganancia fija
de 0,8 y no había coro — el check lo cazó: la cola con shimmer pesaba lo mismo
que sin él. Una reverb devuelve mucha MENOS energía de la que entra: la IR
normalizada por el ConvolverNode tiene RMS fija 0,00126 (su constante de
calibración), luego energía 0,07·Size; la placa, medida con impulso en Node,
0,08 a Size 1 y 0,54 a Size 20 (`PLATE_G`). Con ganancia fija cada vuelta
perdía ~9 dB. Ahora g = √(amt·0,8 / G): la energía por vuelta es amt·0,8 sea
cual sea el Size y el tipo (acumulación en régimen 1/(1−0,8) = ×5, que Mix y
el limitador absorben), y girar Size no cambia el shimmer. **Freeze** (botón
❄: gesto de ejecución, no parámetro — una cola congelada no se guarda): solo
placa. Cierra la entrada de la reverb (y con ella el bucle del shimmer:
realimentar un tanque sin pérdidas crecería sin tope) y pone el decay a 0,9995
(el worklet admite hasta 1; antes 0,98): lo que sonaba se queda, mecido por la
modulación del tanque, media hora hasta caer 60 dB. La IR es un FIR y no
retiene nada: con «Sala» el botón se desactiva, y pasar a IR estando congelada
suelta. Pánico y Escape sueltan. Evidencia: check «desplazador» (seno de 440
Hz → 880 a +12, relación 8710 sobre el fundamental; → 659 a +7, 5547; energía
1,28), «shimmer» (pluck a Size 4: cola a los 3-4 s con/sin, placa −55 / −69,5
dB, IR −41,5 / −71,6 dB; tilt ×190 / ×38; a los 7-8 s pesa 0,006 / 0,125 de lo
que pesaba a los 2-3 s: estable; `reverbEnergyGain` reproduce las medidas
0,189 / 0,280) y «freeze» (congelada a 0,5 s, a los 5 s pesa 0,969 de lo que
pesaba a 1 s; libre, 4·10⁻⁵; soltada a los 3 s cae a 10⁻³ a los 6; con la IR no
actúa); 155/155; `WK_V` v10. Preset «Pad shimmer (coro que sube)» en
Cinescape; pares **SHIM 1-2** (diff 0,21) y **SHIM 3-4** (+12 vs +7, 0,24).

**4 Fuentes de ejecución** ✔ *(hecho 2026-10-03)* — Rueda (CC1), aftertouch y
expresión (CC11) como fuentes de la matriz: `wheel`, `at`, `expr`, 0..1 por
motor (0 = reposo: un preset suena igual mientras no se tocan), un
`ConstantSource` cada una en `AudioEngine.perf` con suavizado de 20 ms (el
MIDI llega a saltos de 1/127). Son GESTOS, fuera de CONTROLS y de los presets,
como el bend; en Partes van a todas las partes (`parts.setPerf`). Entran por
`ui/midi.js` (`handleMidi`, exportado para la sonda): CC1 y CC11 alimentan
SIEMPRE su fuente, además de lo que tengan mapeado (de fábrica CC1 → vibrato;
quitar ese mapeo deja la rueda solo para la matriz); el aftertouch de canal y
el polifónico alimentan `at` (la fuente es por motor, no por nota). Y una
**rueda en pantalla** bajo el teclado, junto al stepper de octava, para tocar
con el ratón: mueve `wheel` y sigue a la rueda MIDI ('perf-change'); doble clic
= reposo. Semántica: Rueda → Cutoff a 0,5 abre dos octavas; Expresión →
Amplitud con cantidad −1 apaga al pisar y con +1 sube hasta ×2 (el destino es
1 + cantidad·fuente). Evidencia: check «fuentes de ejecución» — rueda →
cutoff a 0,6 (2,4 octavas): tilt ×5,4; aftertouch → pitch a 0,5 (600 ct): el
seno pasa de 130,8 a 185,0 Hz, el valor exacto; expresión → amplitud a −0,8:
×0,200; MIDI sintético CC1 127 / presión 64 / CC11 0 → fuentes 1 / 0,504 / 0
en el motor en vivo y la rueda en pantalla a 1; 157/157. Preset «Pad de
ejecución (rueda, aftertouch, pedal)» en Cinescape. Sin par A/B en el banco de
demos: la sonda carga presets y las fuentes de ejecución no viven en el preset;
la evidencia es el check, que recorre el mismo camino (matriz real, nota real).

**7 Cinta en el máster** ✔ *(hecho 2026-10-03, revisado el mismo día tras
escucharlo)* — Módulo **Cinta** (claves de la Sala `tapeSat`, `tapeWow`): la
mezcla entera (seco + delay + reverb, todas las partes) pasa por la misma
cinta entre la suma y el limitador — el «pegamento degradado» de Arnalds,
Frahm o Guðnadóttir. Dos etapas, cada una EXACTA a 0 (caminos secos a
ganancia 1 y húmedos a 0: los renders de siempre no cambian ni una muestra;
el check «arranque» sigue clavando el escalón en 11,8 ms). **Saturación**:
tanh(x) a secas (pendiente 1 en el origen: la señal pequeña sale como entra),
entrada 1 + sat² (hasta ×2) y compensación 1/(1 + 0,52·sat²) (a tope, un seno
de pico 0,5 sale al mismo nivel), más un paso-bajo que baja en log de 20 a
8 kHz con el knob: la cinta oscurece al saturar. **Wow**: una línea de 8 ms
modulada por una deriva irregular (el buffer 'drift' de los LFO a 0,8 Hz,
±6 ms) y un flutter senoidal a 6,5 Hz (±6 cents); a 0 el camino seco pasa
entero, sin latencia, y con wow > 0 todo pasa por la línea. La desviación de
tono es la DERIVADA del retardo (2π·f·d): medida, ±33 cents a tope sobre un
seno de 440 Hz (16,8 Hz de vaivén) — a tope es cinta estropeada a propósito,
a 0,3 son los ±12 cents de una pletina real.
**La revisión** (lo que oyó Sergio con la primera versión): (1) la saturación
«petardeaba» con un acorde de tres notas en cuanto se subía un poco — era
intermodulación: con el sub a −1 el pico de la mezcla pasa de 1,5 y con la
rodilla k = 2 y entrada ×3 eso ya era recorte duro; de ahí la curva más suave,
la entrada ×2 y el knob al cuadrado (la mitad baja es solo color); (2) el wow
a ±7 cents no se oía en un pad que ya lleva detune de ±7 y ensemble, y a ±15
(2ª versión) tampoco («no hace nada»): ahora ±33 medidos; de paso el check
prueba el camino del KNOB (la Sala nace con wow 0 y se sube en vivo con
`set`: 16,8 Hz, igual que naciendo a tope — el motor no era el problema; un
módulo servido de la caché del navegador sí pudo serlo: recargar con
Ctrl+F5); (3) el **siseo se quitó**: un ruido fijo que no reacciona a lo que
tocas no aporta («no me dice mucho»), y el aire que sigue a las notas ya lo
da el knob Ruido de cada voz. Evidencia: check «cinta en el máster» — 3er
armónico de un seno de C3 a saturación 0 / 0,3 / 1 = 0,0019 / 0,0139 / 0,1035
(a 0,3 debe ser < 2 %: color, no recorte), nivel a tope ×1,00; frecuencia
instantánea de un seno de 440 Hz (cruces por cero interpolados, 20 periodos):
vaga 16,8 Hz con wow a tope, naciendo a tope y subiéndolo en vivo, y 0,000
sin; claves en `SALA_KEYS`; 159/159. Preset «Pad de cinta (nostalgia)» en
Cinescape; pares **CINTA 1-2** y **CINTA 3-4** (solo wow).

**5 Resonadores** ✔ *(hecho 2026-10-03)* — Módulo **Resonador**
(`engine/reson.js`, por voz, entre el Vocal y el filtro, dry/wet como el
Vocal): seis resonadores modales (biquad bandpass de 2 polos) afinados a la
NOTA, f_i = f0·razón_i. Síntesis modal «lite»: un cuerpo que vibra son sus
modos, y cada biquad es un modo con su frecuencia, su Q (τ = Q/(π·f): cuánto
tarda en cantar y en apagarse) y su ganancia. **Material** interpola el
LOGARITMO de las razones entre una cuerda o tubo (armónicos 1…6) y una barra
libre-libre (Fletcher & Rossing, ∝ (2n+1)²: 1 · 2,76 · 5,40 · 8,93 · 13,3 ·
18,6): en medio, la inarmonicidad de un piano o de una campana. **Decay** = Q
de 10 a 600 en log. **Brillo** reparte el peso entre modos graves y agudos
con Σg² = 2 constante (no cambia el nivel). El banco sigue la nota y el glide
(sus modos resbalan con los osciladores en mono). **El problema del nivel**,
resuelto con dos caminos de entrada: la señal tonal entra a ganancia 1 (un
parcial justo en un modo pasa a 0 dB: una sierra no revienta), y el RUIDO de
la voz entra por un camino propio reforzado ∝ √Q — la potencia de ruido que
deja pasar un resonador es ∝ su anchura f/Q, así que con una ganancia común a
Q alta el cuenco no sonaba (−35…−48 dB por modo) y si se subía para el
ruido, la sierra reventaba. Modos por encima de Nyquist, mudos. Evidencia:
check «resonador modal» — tablas (razones, Q 10/600, Σg² = 2); ruido + seno
en C3 por el banco: con Material 0 el 2º modo canta en 2·f0 (37 veces más que
en 2,76·f0) y con Material 1 en 2,76·f0 (82 veces más que en 2·f0); Decay
estrecha los modos (2·f0 frente a 2,1·f0: ×1,1 a Q 10, ×19 a Q 600); el
cuenco con ruido a Q 600 suena a −15,7 dB RMS; en mono el banco sigue el
glide (tras C3 → G3, 2·G3 canta 40 veces más que 2·C3, que ya no es modo);
162/162. Presets «Cuenco tibetano (ruido + resonador)» y «Metal frotado
(sierra + resonador)» en Cinescape; pares **RES 1-2** (ruido + seno, diff 0,73)
y **RES 3-4** (sierra por cuerda, 0,27).
