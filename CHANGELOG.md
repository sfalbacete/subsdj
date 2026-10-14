# Cambios

Una entrada por versión publicada, la más reciente arriba. Numeración X.Y.Z:
**Z** = arreglos, **Y** = funciones nuevas, **X** = algo guardado deja de
cargar o de sonar igual (presets, escenas, bibliotecas, mapas MIDI). El porqué
de cada módulo está en [docs/DISENO.md](docs/DISENO.md).

## [1.1.0] — 2026-10-14

Ideas de un compañero que lo probó, arreglos que salieron al hacerlas y el
acorde «sucio».

- **Acordes limpios: margen en el máster.** Un acorde de pad entraba en el
  limitador de salida 4-8 dB por encima de su techo: recortaba todo el
  sostenido y su ganancia subía y bajaba con el batido de los osciladores
  desafinados (el acorde «sucio, con altibajos»). Ahora hay un margen fijo de
  −9 dB antes del limitador, calibrado con los 103 presets de fábrica: 9 de
  cada 10 aguantan un acorde abierto de cuatro notas sin tocarlo.
- **Sonoridad igualada en los presets de fábrica.** El margen es para acordes;
  un bajo o un lead, que tocan de una en una, se quedaban bajitos. Cada preset
  trae ahora un Master medido para sonar a la misma sonoridad (unos −14 LUFS) en su
  uso previsto — una nota para bajos, leads, percusión y efectos; un acorde de
  tres para lo demás — sin que ese uso llegue al limitador. Los que tienen un
  golpe inicial muy por encima del cuerpo (plucks, percusión) quedan tan
  fuertes como permite sonar limpios. La percusión sube en bloque: el
  equilibrio del kit no cambia. Tus presets guardados conservan su Master.
- **Master hasta +12 dB y delante del limitador**: bajarlo deja margen
  (limpio) y subirlo aprieta el limitador (más fuerte y comprimido). Se lee en
  dB. Antes iba detrás, llegaba solo a 1 y bajarlo no le quitaba trabajo.
- **Disparo en Mono** (módulo Voz): qué pasa cuando una nota llega con otra
  aún pulsada. *Legato* desliza la voz sin redisparar (trinos, el glide del
  303); *Cada nota* redispara siempre: envolventes, pitch env y operadores
  FM4 arrancan de nuevo, y la nota vieja se funde mientras sube el ataque de
  la nueva. Notas separadas redisparan en los dos.
- **Arpegiador y secuenciador en Mono redisparan cada paso**. Antes, a tempos
  rápidos (1/16) los pasos se ligaban sin querer y solo sonaba el ataque del
  primero: el note-off del paso iba por temporizador y llegaba después del
  note-on siguiente, que se programa con antelación. Ahora los note-off van
  programados en el reloj de audio y en orden, así que liga solo con
  Gate 1 (y Disparo en Legato).
- **Velocity por operador en FM4** (columna «vel»): el nivel de cada operador
  escala con la fuerza de la nota, como la *key velocity sensitivity* del
  DX7. En un modulador eso es el índice: tocar fuerte abre armónicos, no solo
  sube el volumen. El preset «FM4 · E-piano pares» ya la usa (a velocity 1
  suena como antes). Hace falta un teclado MIDI.
- **Grafo del algoritmo FM4 a la Yamaha** bajo su selector: portadoras abajo
  sobre la línea de salida, moduladores encima, lazo de feedback en el op 4
  (se enciende con el Feedback).
- **Arreglo — notas programadas (arp, secuenciador, músicos de las Partes)**:
  si la envolvente ya estaba en el sostenido, el note-off programado hacía caer
  la ganancia en recta desde el final del decay, de golpe al programarlo. Las
  notas largas de los músicos se apagaban solas antes de tiempo; ahora
  mantienen el sostenido hasta su note-off, así que **las escenas suenan algo
  distinto** (como debieron sonar siempre).
- **Arreglo — gate más corto que el look-ahead**: el note-off se adelantaba
  al arranque real de la nota y algunos golpes cortos de los músicos (Pulso
  con gate bajo) salían mudos. Ahora el note-off se traslada lo mismo que el
  arranque.
- **Pantalla Salida en dos líneas**: arriba el parámetro y lo que significa la
  opción elegida (o por qué no hace nada); abajo, en grande, un valor corto
  («3 · 2·3·4→1» en vez del tooltip entero). Lo que no cabe encoge la letra y,
  si ni así, se desplaza despacio como el LCD de un sinte. Antes un valor
  largo se comía la caja entera, nombre del parámetro incluido.
- La piel por defecto se llama ahora **Carbón** (antes «Cinescapes»; la
  elección guardada se conserva).
- Banco de demos: pares «Disparo» y «FMV»; tres checks nuevos en el selftest.

## [1.0.1] — 2026-10-12

- **Tarjeta al compartir el enlace**: Facebook, LinkedIn, WhatsApp o X
  enseñan título, descripción y una imagen del panel (etiquetas Open Graph).
  Antes la tarjeta salía vacía. Check «tarjeta para redes» en el selftest.

## [1.0.0] — 2026-10-12

Primera versión publicada. Lo que trae:

- **Fuente**: dos osciladores con octava propia, mezcla, ruido de colores,
  unison con deriva analógica, FM de 2 operadores con realimentación, FM de 4
  operadores (8 algoritmos), tabla de ondas con editor a mano y secuencia de
  tabla al estilo Wavestation, y un módulo Vocal de formantes con fuente glotal.
- **Voz**: resonador modal (cuerda ↔ barra), filtro LP/HP/BP/notch con
  pendiente, keytrack y drive, envolventes ADSR con curva lineal ↔ RC y golpes
  (flam) para percusión, mono con glide o polifónico.
- **Modulación**: banco de LFOs (seno, triángulo, sierra, cuadrada, S&H y
  deriva) con fade de entrada y fase global o por voz, matriz de modulación de
  6 ranuras y fuentes de ejecución (rueda, aftertouch, expresión).
- **Efectos**: distorsión, flanger, chorus/ensemble, delay de cinta, reverb de
  sala (convolución) o de placa (Dattorro) con shimmer y freeze, cinta en el
  máster (saturación, wow y flutter), espacio estéreo y limitador.
- **Música**: arpegiador, secuenciador de pasos con banco de frases, cuatro
  partes con mezclador y sala compartida, armonía, músicos generativos, arreglo
  y escenas.
- **Biblioteca** de presets y escenas con secciones, favoritos, búsqueda,
  importar y exportar; presets de fábrica por categorías (incluida percusión
  808/909) y un banco de demos A/B que hace oír cada mejora.
- **Interfaz**: panel fijo que se escala entero a la ventana, pantallas de
  Diseño, Secuenciación y Presets, temas, osciloscopio y espectro, y los
  controles que no hacen nada con la configuración actual se atenúan
  explicando por qué.
- **MIDI**: velocity, pitch bend, sustain, Program Change y MIDI learn por
  aparato.
- **Exportar**: grabación a WAV y el preset como instrumento SFZ.
- **Selftest** en el navegador (`?selftest=1`) que renderiza cada preset y
  mide cada módulo: 173 comprobaciones.
