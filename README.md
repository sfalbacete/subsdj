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
  AudioEngine.js               grafo global (FX, LFOs, limitador) + gestión de voces
  Voice.js                     cadena por nota: osc (worklet) → filtro LP/HP → VCA → pan
  presets.js                   banco de fábrica + presets de usuario (localStorage)
  worklets/pulse-processor.js  oscilador PolyBLEP (saw/square/sine/tri/supersaw, FM 2-op)
js/ui/
  registry.js                  registro CONTROLS {get,set,def,el,opts} → reset/snapshot/presets/midimap
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

Método por fase (el de siempre): selftest en verde antes y después; si la
mejora es audible, pares A/B en `subsdj-demos.json`; si es visual, capturas o
sondas CDP; commit por hito.
