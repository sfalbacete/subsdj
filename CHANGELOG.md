# Cambios

Una entrada por versión publicada, la más reciente arriba; lo ya hecho que aún
no se ha publicado va en «Sin publicar». Numeración X.Y.Z:
**Z** = arreglos, **Y** = funciones nuevas, **X** = algo guardado deja de
cargar o de sonar igual (presets, escenas, bibliotecas, mapas MIDI). El porqué
de cada módulo está en [docs/DISENO.md](docs/DISENO.md).

## Sin publicar

- **Medidor de salida** en el módulo Salida, junto al espectro: picos L y R de
  lo que sale (amarillo desde −12 dBFS, rojo desde −1, el techo del
  limitador), la reducción del limitador y el LED **lim**, que se queda
  encendido si el limitador ha trabajado (clic para apagarlo). Los datos los
  manda el propio limitador cada 50 ms.
- **Ventana de entrada**: al abrir, una ventana sobre el instrumento (que se ve
  detrás, apagado) con una pantallita de demoscene — plasma con interferencia y
  el nombre en barras de cobre —, la versión y su fecha, y el botón **ENTRAR**
  (o Intro), que además arranca el audio. Se vuelve a abrir como «Acerca de»
  pulsando el título de la cabecera o desde Archivo ▾.
- **Selector de presets** nuevo en la cabecera, en lugar del desplegable: un
  buscador (sin importar acentos ni mayúsculas), las categorías a la izquierda
  con cuántos presets coinciden en cada una (Todos, ★ Favoritos y cada sección)
  y la lista a la derecha. Un clic o `↑` `↓` cargan el preset para probarlo sin
  cerrar; `Intro` o doble clic eligen y cierran; la ★ marca favoritos; y
  **Navegar todos** lleva a la pantalla Presets con la misma búsqueda.
- **Teclado del ordenador**: su octava va aparte de la del teclado en pantalla.
  Antes eran la misma, y como el teclado en pantalla enseña seis octavas y para
  en C9, la fila alta se quedaba en E5. Ahora la Z va de C0 a C7 (la fila alta
  llega a C9) y el teclado en pantalla se desplaza para enseñarla. De entrada,
  la Z es C3 y la Q el Do central (antes, la Z era C2).
- **Teclado en pantalla**: con el botón del ratón pulsado, pasar por las teclas
  las va tocando (glissando); antes solo sonaba la primera. Las teclas negras,
  centradas entre sus dos blancas (antes imitaban el desplazamiento de un piano
  acústico).

## [1.2.0] — 2026-10-24

Más instrumento: movimiento a tempo (reloj común, LFO a tempo, Pasos, una
envolvente en bucle), un drive con más caracteres, un mezclador a la Minimoog y
un taller para diseñar sin miedo (deshacer, comparar). Varias cosas salen de
la revisión que hizo @tacowars.

**Suenan distinto** (a propósito, como debieron sonar siempre):
- **FM de dos operadores (onda Seno con Index)**: la fase del modulador se
  sorteaba en cada nota y cada nota salía con otro timbre — en «DX bass», seis
  Do4 seguidos variaban casi 8 dB. Ahora arranca alineado con la portadora,
  como el FM4 y como un DX7: todas las notas iguales. «Bajo FM» queda algo más
  oscuro en el registro agudo.
- **LFO globales**: sin nada sonando se quedaban parados y la nota siguiente
  los retomaba donde se habían quedado; ahora corren siempre, así que la fase
  con la que arranca una nota depende de cuándo la tocas, como en un sinte de
  hardware. Si quieres que cada nota empiece igual, usa la fase «reinicio»
  (nueva, abajo).
- **Tabla de ondas más limpia**: menos ruido entre armónicos (sobre todo en el
  registro medio) y un poco más de brillo arriba.

Nuevo:
- **Mezclador a la Minimoog**: Osc A, Osc B, Ring y Ruido con su nivel cada
  uno. Subir uno no baja los otros: suman, y con Drive saturan más (el truco de
  subir el mezclador del Minimoog). Los presets de antes se traducen solos y
  suenan igual.
- **Drive con carácter** (módulo Filtro): *suave* (el de siempre) o *plegado*
  — al subir el Drive la onda se dobla sobre sí misma y los armónicos aparecen,
  suben y vuelven a bajar (la síntesis de la Costa Oeste) —, y **Asimetría**,
  que añade armónicos pares (el cuerpo de una válvula); en el plegado, a tope,
  suena la octava.
- **Más destinos en la matriz**: los niveles del mezclador (un LFO que baja A
  mientras sube B funde una onda en otra: síntesis vectorial), el Drive, el tono
  solo del oscilador A y el Material del resonador.
- **Reloj común**: arpegiador, secuenciador y los músicos de las Partes en la
  misma rejilla. Dos arpegios de dos partes caen juntos, y una parte con
  arpegiador que toca un músico arranca en su pulso, no donde cae.
- **LFO a tempo**: cada LFO puede ir sincronizado al BPM (de 4 compases a
  1/32, con puntillos y tresillos), con su ciclo en la rejilla. Y la fase tiene
  dos modos más: **reinicio** (cada nota arranca sus LFO desde el principio) y
  **una vez** (recorren un ciclo y se quedan: un LFO que hace de envolvente).
- **Env mod** (pantalla Secuenciación): una envolvente libre para la matriz,
  aparte de la del filtro, en modo *normal*, *bucle* (ataque y caída repetidos
  mientras dura la nota: ritmos de timbre atados a cada nota) o *disparo* (la
  curva entera aunque la nota dure un instante).
- **Pasos** (pantalla Secuenciación): cuatro carriles que se dibujan con el
  ratón, cada uno con su longitud (hasta 32), división, suavizado, rotación y
  deriva. Son fuentes de la matriz: continuas («Pasos 1») o fijas por nota
  («Pasos 1 · nota», cada nota de un arpegio con su color). Con longitudes
  distintas (16 · 12 · 5) tardan 15 compases en volver a coincidir — el panel
  lo dice —; un carril sobre Amplitud es un *trance gate*.
- **Deshacer y rehacer** (Ctrl+Z, Ctrl+Y, ↶ ↷ en la cabecera): por gestos, con
  lo que deshace en el título; no corta las notas que suenan.
- **Comparar con el guardado**: ● junto al preset cuando lo que suena ya no es
  lo guardado (y se apaga si lo devuelves); «Comparar» alterna entre el guardado
  y tu edición.
- **Velocity con el ratón**: en el teclado de pantalla, la altura a la que
  pulsas la tecla es la fuerza.
- **Exportar SFZ**: las capas de velocity se deciden midiendo el sonido, así
  que los presets cuya velocity cambia el timbre por la matriz, por los
  operadores FM4 o por la distorsión exportan su tacto (45 de 117 de fábrica,
  antes 30). Exportar dos veces da exactamente lo mismo.

Arreglos:
- **Teclado del ordenador**: Ctrl+Z ya no toca un Do, Shift entre pulsar y
  soltar ya no deja la nota colgada, y las teclas van por posición (el piano
  queda en su sitio en AZERTY o Dvorak). Un toque cancelado en pantalla
  táctil ya no cuelga la nota.
- **Partes**: cambiar el BPM solo llegaba a la parte que estabas editando; el
  arpegiador, el secuenciador y la secuencia de tabla de las demás seguían al
  tempo viejo.
- Banco de demos: pares MEZ, DRV, VEC, LFOT, FASE, ENVM y PASOS para oír cada
  cosa; checks nuevos en el selftest (194).

## [1.1.0] — 2026-10-14

Ideas de @tacowars que lo probó, arreglos que salieron al hacerlas y solución a los
acordes «sucios».

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
