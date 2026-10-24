# SubSDJ · diseño y diario de desarrollo

Recreación en **tiempo real** del viejo SubSDJ (soft-synth sustractivo hecho en VB.Net)
con HTML + **WebAudio API** nativa. Sin dependencias, sin build.

Este documento es el **porqué** de cada módulo: cómo funciona, qué se probó y
se descartó, y con qué medidas se validó, en el orden en que se construyó. Para
usar el synth basta el [README](../README.md); el estado de los planes está en
[PLAN.md](PLAN.md) y los cambios por versión en el [CHANGELOG](../CHANGELOG.md).

## Cómo arrancar

Los módulos ES y el AudioWorklet **no funcionan desde `file://`**: hay que servir por HTTP.

```
node tools/serve.mjs        # desde la raíz del repo
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

## Versiones y publicación

La versión vive en `js/version.js` (`VERSION`), se ve junto al título y el
selftest comprueba que coincide con la primera entrada del CHANGELOG.
Numeración X.Y.Z: **Z** = arreglos; **Y** = funciones nuevas; **X** = algo
guardado deja de cargar o de sonar igual (presets, escenas, bibliotecas
exportadas, mapas MIDI).

El desarrollo vive en un repo privado (carpeta `WebAudioAPI/synth_test`) y
este repo público recibe esa carpeta con su historia vía `git subtree`. Para
publicar, desde la raíz del repo de desarrollo y con el remoto `subsdj`:

```
git subtree push --prefix=WebAudioAPI/synth_test subsdj main
git tag subsdj-vX.Y.Z $(git subtree split --prefix=WebAudioAPI/synth_test)
git push subsdj subsdj-vX.Y.Z:refs/tags/vX.Y.Z
```

Ojo con editar directamente en el repo público (por ejemplo un fichero desde
la web de GitHub): ese commit no está en la historia de desarrollo y el
`subtree push` siguiente se rechaza (no es fast-forward), y un `subtree pull`
tampoco sirve («unrelated histories»: aquí nunca hubo `subtree add`). Lo que se
hizo en la 1.2.0 (una corrección del CHANGELOG hecha en la web que ya estaba
también aquí): registrar ese commit con un merge que no cambia nada, con las
marcas que git-subtree reconoce, y publicar el split, que ya lo incluye:

```
git merge -s ours --allow-unrelated-histories <commit-web> -m "…

git-subtree-dir: WebAudioAPI/synth_test
git-subtree-mainline: <HEAD de antes>
git-subtree-split: <commit-web>"
git push subsdj $(git subtree split --prefix=WebAudioAPI/synth_test):refs/heads/main
```

Si el cambio de la web NO estuviera aquí, antes hay que copiarlo a mano. Lo
sencillo es no editar en el repo público.

GitHub Pages sirve con unos 10 minutos de caché: justo después de publicar,
una recarga normal puede mezclar módulos viejos y nuevos (Ctrl+F5). Para
comprobar la versión publicada, el selftest contra Pages:
`BASE=https://sfalbacete.github.io/subsdj/ node tools/run-selftest.mjs`.

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

Además: migración de presets v1→v2 (check estático), **Reset neutro** (todo módulo
a 0, filtro abierto y plano, puerta; cada preset de fábrica sobre `PRESET_BASE`) y un
**estrés de 16 notas** que ejercita el robo de voz (`MAX_POLY`) y el recorte de colas
(`MAX_TAILS`).

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
  (salen en «★ Favoritos» del selector rápido) y se borran; buscar ignora
  acentos y mayúsculas. El **selector rápido** de la cabecera
  (`ui/presetPicker.js`) sustituye al desplegable, que con 300 presets en 16
  secciones ya no se recorría: buscador, categorías con cuántos coinciden en
  cada una y la lista; un clic o ↑ ↓ cargan sin cerrar (para PROBAR: tras el
  clic el foco sale del buscador y el teclado del PC vuelve a tocar notas),
  y Esc lo cierra sin hacer pánico (keyboard.js pregunta antes con el evento
  `escape-first`). Vive entera en localStorage (`subsdj.biblioteca.v1`).
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

## Panel fijo, pantallas y cabecera

El synth es un **instrumento de tamaño fijo**, como uno físico: un objeto de
1920 × 1000 px (`#inst`) que se escala ENTERO para caber en la ventana —
`zoom = min(ancho/1920, alto/1000)` (`ui/frame.js`). Nada refluye: cada
módulo está siempre en el mismo sitio, la resolución solo cambia el tamaño
(en una pantalla 4K al 150 % sale al 130 %; en un portátil de 1366 × 650, al
65 %). Por debajo del 60 % no encoge más (los knobs dejarían de poder
tocarse) y aparece el scroll. Se usa CSS `zoom` (estandarizado en Chrome
128), que hace el layout a tamaño real: texto y bordes nítidos.
`getBoundingClientRect` da el tamaño en pantalla y `clientWidth` el de
diseño, así que los canvas dibujan en px de diseño con un backing store de
dpr × zoom (`fitCanvas`) y los punteros pasan de pantalla a diseño
dividiendo por `uiZoom()`. Y ningún canvas aporta tamaño propio (`contain: size`):
si su caja tomara el backing store como ancho natural, cada redibujado lo
agrandaría ×dpr×zoom hasta reventar — pasó con el secuenciador en una 4K al
150 % (×1,95 por redibujado) y lo vigila el check «canvas», que triplica el
backing store de cada canvas visible y exige que su caja no se mueva.

Antes era una rejilla `auto-fill` + `dense`: el número de columnas salía
del ancho de la ventana y cada módulo caía en la casilla que le tocaba por
orden, así que cambiaba de sitio con la resolución; y cada fila medía lo que
su módulo más alto (FM4, la matriz), con mucho panel vacío y scroll.

**Cómo está ordenado.** Cada pestaña es un panel fijo propio
(`<div class="screen" data-screen-body="…">`) hecho de BANDAS de alto fijo,
con secciones separadas por una línea de serigrafía. Las secciones miden lo
que su contenido y `.grow` reparte lo que sobra: sin celdas vacías
estiradas. En **Diseño** las bandas siguen la señal de izquierda a derecha y
de arriba abajo:

- **Fuente** — Osc A · Osc B · Mezcla · Unison · FM · FM4 · Tabla de ondas ·
  Editor de ondas. Los motores que no aplican a la onda elegida (FM sin
  «Seno», FM4 sin «FM4», la tabla sin «Tabla») se atenúan EN SU SITIO: nada
  aparece ni desaparece moviendo a los demás.
- **Voz** — Vocal → Resonador → Filtro (con su carácter: tipo, pendiente,
  keytrack, drive) → Env filtro → Env amp → Voz · Master → **Salida**.
- **Modulación | efectos** — el banco de LFOs y la Matriz; después los
  efectos en el orden real de la cadena: Dist · Flanger → Chorus → Delay →
  Reverb → Cinta → Espacio.

Lo que vivía en módulos de LFO sin ser LFO volvió a su sitio natural: P.Width
a Mezcla, Amplitud y ±Cents a Voz · Master, Width a Espacio (y el autopan es
la fila Pan del banco). **Secuenciación**: Arpegiador · Secuenciador · Tabla ·
secuencia · Salida; Mezclador · Delay · Reverb · Cinta (la sala); Armonía ·
Jugador · Arreglo. Con las Partes apagadas sus módulos siguen en su sitio,
atenuados, y el mezclador vacío dice cómo encenderlas. **Presets**: la
biblioteca entera (`ui/libraryScreen.js`): secciones en columnas con su
propio scroll, un clic carga, ★, renombrar, arrastrar, borrar, buscar sin
acentos, «solo ★» y ▶/⏹ en las escenas (carga, enciende las Partes y
arranca; una sola a la vez).

**Compartidos.** Salida, Delay, Reverb y Cinta están en Diseño (efecto del
preset) y en Secuenciación (la sala de la escena: con Partes llevan la
etiqueta «sala» y solo los envíos son de cada parte). No se copian: llevan
`data-slot` y cada pantalla declara su hueco (`data-slot-host`); al cambiar
de pestaña `ui/screens.js` MUEVE el mismo nodo al hueco de la que se ve
(controles, canvas y escuchadores intactos).

**Mandos de hardware.** Además del knob (y su versión grande, el Cutoff, y
pequeña, la de los bancos) hay tres:

- **Selector giratorio** (`.seg.rot`, `ui/rotary.js`) para todo lo que tiene
  tres o más posiciones: onda, Octava (en pies, como el RANGE del Minimoog:
  32' 16' 8' 4' 2'), Apiladas, voces del unison, algoritmo FM4 (con su grafo
  debajo), tipo de filtro, sync del delay, intervalo del shimmer, modos y
  divisiones del arpegiador, los secuenciadores y el jugador. Clic en una
  posición = elegirla; arrastrar el knob = recorrerlas; clic en el knob = la
  siguiente.
- **Conmutador con LED** (`.seg.tog`) para lo de dos estados: Poli/Mono,
  12/24 dB, Chorus/Ensemble, Sala/Placa, tiempos de la env de filtro, fase de
  los LFO, Off/On de los secuenciadores…
- **Fader vertical** (`.slider.fader`) para las dos envolventes, como en
  Juno o Jupiter: son barras de tiempo y en vertical ocupan la cuarta parte de
  ancho. Es el mismo `<input range>` de `ui/sliders.js` puesto de pie con
  `writing-mode`: guarda el valor exacto.

Selector y conmutador son los `<button data-…>` de un `.seg` de siempre con
otra cara: `bindSeg`, el registro, MIDI learn (zonas) y los presets no se
enteran. Octava y Apiladas pasaron de stepper a selector y `bindSeg` aprendió
a guardar números (`num`): los presets siguen llevando `octA: -1`, no `"-1"`.
Los **bancos** (LFOs, operadores FM4) llevan la etiqueta una vez por columna
y una por fila, como un mezclador: misma columna = mismo mando; cada fila
del banco de LFOs tiene su LED, y la de PWM se atenúa sin ondas cuadradas.

**Lo que no hace nada, apagado** (`ui/deps.js`). Una sección entera o un
control suelto que, con la configuración actual, NO HACE NADA se atenúa en
su sitio — y sigue tocable: se puede preparar un ajuste antes de encender lo
que lo activa, como en el hardware (el knob gira igual). Es una tabla de
reglas [qué, cuándo]: qué = una sección (por su h2), un control del registro
o un selector; cuándo = una función del estado que devuelve null (vivo) o el
MOTIVO, que sale en el tooltip y, al tocarlo, en la pantalla Salida («sin
efecto: Index a 0: no hay modulador»). Las reglas salen de leer el motor:

- **Qué suena**: A llega a la salida si su nivel (Mezcla · Osc A) > 0 o
  Ring > 0; B igual (con Reset, el B entero está apagado). Lo que depende de una ONDA
  cuenta solo las de osciladores que suenan.
- **Por onda**: la Súper ignora Phase (fases al azar) y el Unison (ya lo es);
  Spread solo la abre a ella; P.Width y el LFO de PWM solo mueven la
  Cuadrada; FM: Ratio e Index solo en Seno, y sin índice (ni «FM índice» en
  la matriz) Ratio y Feedback no hacen nada — pero el Feedback vive también en
  el op. 4 de FM4; FM4: un operador con nivel 0 ni suena ni modula (su Ratio
  y su Decay, fuera); Tabla de ondas y Tabla · secuencia, solo con algún
  oscilador en Tabla; el Editor de ondas, además, solo con la tabla «usuario».
- **Llaves dentro de un módulo**: Vocal y Resonador (todo cuelga de su
  Mix/Mezcla), Color del ruido (Ruido), Detune del unison (más de 1 voz),
  Low↔Hi (solo en LP↔HP), pendiente (no en Notch), env de filtro (Amount ≠ 0
  o la fuente «Env filtro» en la matriz; sus tiempos, solo en «propios»),
  Hueco del flam (más de un golpe), P.Env Dec (P.Env Amt ≠ 0), Fl.Speed,
  Chorus, arpegiador y secuenciadores (su modo / estado).
- **Modulación**: Speed y forma de un LFO importan si su Level > 0 o si la
  matriz lo usa crudo; Fade solo con vibrato o PWM en uso; la fase por voz
  solo con algún LFO de cutoff/reso/vibrato/PWM/pan en uso; «deriva» solo si
  un slot usa «Deriva (voz)». Un slot de la matriz sin fuente, con cantidad 0
  o hacia un destino que no puede moverse (Wavetable sin Tabla, Pulse width
  sin Cuadrada, FM índice sin Seno, Vocal con su Mix a 0) se apaga entero.
- **Sala**: sin envío (Amount / Mix a 0; con Partes, de NINGUNA parte) los
  tiempos del delay y de la reverb no suenan; Time no cuenta si el delay va
  sincronizado; el intervalo del shimmer, solo con Shimmer; el BPM, solo si
  algo va a tempo (delay sincronizado, arpegiador, secuenciadores, Partes).
- **Escena**: la progresión no cuenta en «Funciones»; el Ciclo, sin Vaivén;
  el arreglo de la parte, con el jugador en Off; la Cantidad, sin Deriva.

Evidencia: check «dependencias» (cada regla apunta a algo que existe —
renombrar un h2 o un control la dejaría muda sin avisar— y 27 casos por el
camino de los controles, desde Reset, con el motivo esperado o «vivo»; un
control apagado sigue tocable).

**Salida** es la pantalla del instrumento (`ui/display.js`): en grande, el
último parámetro que TOCAS — con el ratón o con un mando MIDI (`ctl-touch`
de midimap) — y su valor ya formateado; al cargar un preset, su nombre.
Todo se lee del propio control (su etiqueta o `data-lab`, su `.val`, el
botón activo, la opción elegida) y de su sección: no hay otra tabla de
nombres. Debajo, el osciloscopio y el espectro del máster, ahora grandes.

La **cabecera** es una sola fila: título, pestañas, presets (‹ selector ›,
nombre, Guardar y **Archivo ▾** con Borrar, Exportar, Importar y SFZ — los
mismos botones, plegados), MIDI map, Reset, Pánico, Grabar, Partes, tema y
estado (dos símbolos: audio y MIDI; el color cuenta el estado y el tooltip
lo explica). Los avisos del banco salen flotando bajo la cabecera y se
apagan solos. El **teclado** es parte del instrumento: se escala con él y
está en las tres pestañas. La pestaña elegida se recuerda
(`subsdj.screen.v1`); al cambiar se dispara un `resize` porque los canvas
de una pantalla oculta medían 0.

Evidencia: check «pantallas» del selftest (cada pestaña es un `.screen` en
el orden de las pestañas y todo módulo vive en uno; cambiar enseña
EXACTAMENTE su cuerpo, marca la pestaña y se recuerda; los compartidos están
en el hueco de la pantalla que se ve; la cabecera con los presets en todas;
**nada recortado**: ni el instrumento ni ninguna banda desbordan su caja —
como las bandas ocultan lo que sobra, un mando de más quedaría escondido en
silencio; la lista de Presets refleja la biblioteca y un clic carga y queda
marcado) y capturas con `node tools/shot.mjs "pantalla:secuenciacion" out.png
[ancho]` (`H=alto` en el entorno para el alto de la ventana; el cuarto
argumento, `"@fichero.js"`, evalúa una sonda antes de capturar).

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

- **Carbón** (por defecto; se llamó «Cinescapes» hasta la 1.0.1, el id interno lo sigue siendo) — carbón plano, cian para el rack y violeta
  para los osciladores, knobs con punto, bisel con la luz arriba y arco de
  valor separado del disco (la caja del knob mide siempre 44 px; el disco se
  encoge `--knob-disc-inset` para que el arco quepa dentro: fuera no hay sitio
  en las filas de cinco knobs), sliders con carril relleno, botones píldora,
  etiquetas en minúsculas. Inspirado en la UI de Cinescapes Pro; se renombró
  porque el nombre chocaba con la categoría de presets «Cinescape» y no decía
  nada del aspecto (medido al renombrar: el contraste de texto es el mismo en
  los dos temas, 11,9:1 frente a 11,5:1; las diferencias son de estilo).
- **Clásico** — el look original: verde y cian, degradados y relieve, rayita
  en el knob, MAYÚSCULAS espaciadas. Es también la prueba de que los tokens
  cubren todo: se reproduce solo con tokens (capturas antes/después a
  ≤ 5 niveles de 255).

El tamaño no es cosa del tema: el instrumento mide siempre 1920 × 1000 y la
escala la pone la ventana (`ui/frame.js`). El selftest vigila que no haya colores a
fuego fuera de los bloques de tokens (check «piel»).

## Rendimiento: CPU por voz y presupuesto común

Origen (Sergio, 2026-10-12): con «Coro humano», muchas teclas a la vez
saturaban el audio y lo cortaban. Medido (render offline en su PC; el
directo necesita además margen, porque cada bloque de 2,7 ms tiene que estar
a tiempo): 10 notas costaban el 48 % de un núcleo, y **10 notas sobre las 10
colas de release del acorde anterior, el 85 %** — en directo, cortes. Además
el limitador recibía +5,8 dB con 12 notas y recortaba hasta 6 dB.

**Dónde estaba el coste.** No en la matemática de los osciladores (una copia
de unison o una Súper apenas suman) sino en el NÚMERO DE NODOS de cada voz y,
sobre todo, en los filtros que recalculaban coeficientes en CADA muestra:
cualquier conexión a un AudioParam de un biquad —aunque traiga ceros— obliga
al navegador a hacerlo por muestra en vez de una vez por bloque. Medido con 12
voces: el filtro de la voz con la env, los LFO y la macro conectados a 0
costaba más del doble que quieto; el banco del Vocal con la Vida a audio-rate,
cuatro veces lo que cuesta en k-rate.

**Qué se hizo** (sin cambiar el sonido salvo redondeo; comprobado renderizando
lo mismo con el código anterior y el nuevo: bit a bit idéntico con el filtro
quieto, en 24 dB/BP con env, con LFO por voz y con la matriz al cutoff;
diferencias de 10⁻¹⁰ al combinar env + LFOs + drive —el orden de las sumas— y
de 10⁻⁷ en el Vocal):

- La env de filtro, los LFO de cutoff y reso y la **macro de apertura** de
  Partes se conectan al filtro solo cuando mueven algo (`ensureFenv`,
  `ensureCutLfo`, `ensureResLfo`, `ensureMacro`, también en vivo). La
  macro estaba conectada a todas las voces incluso sin Partes.
- El wet del **drive** (un WaveShaper sobremuestreado ×2) solo existe con
  Drive > 0.
- **Vocal**: sus 5 biquads en k-rate (la Vida, el knob y el Golpe van mucho
  más despacio que un bloque); a-rate solo si la matriz mueve la vocal. Y sin
  matriz ni Golpe, los formantes se fijan con el valor de las curvas
  (`Voice._shape`, la misma interpolación que un WaveShaper) en vez de con 10
  WaveShapers a audio-rate.

Resultado: una voz de «Coro humano» pasa de ~3,9 % a ~2,4 % de un núcleo;
los acordes encadenados, de 85 % a 67 % (offline, sin tope).

**Presupuesto común** (`AudioEngine`, `VOICE_BUDGET` = 30 «voces simples»):
todos los motores de un MISMO contexto —las cuatro partes de una escena— se
reparten un solo hilo de audio, así que el tope es total-total: se lleva por
contexto, no por motor. Cada voz pesa lo que cuesta lo que lleva encendido
(`Voice.cost`, pesos medidos: dos sierras con el filtro quieto = 1; FM4 ≈ +0,47
por oscilador y copia; Vocal +0,25…). Al pasarse se libera de lo que menos se
oye a lo que más: la cola de release más vieja de cualquier parte (fundida en
350 ms) y, si no quedan colas, la voz pulsada más vieja de la parte que pide la
nota — nunca la nota sostenida de otro instrumento. Offline (selftest, SFZ) no
hay plazos y no hay tope. Evidencia: check «presupuesto de voces» (escena de 4
partes simulando el directo: nunca pasa del tope, caen primero las 3 colas más
viejas, sin colas roba a la parte que pide y no a la que sostiene; offline sin
tope).

**Escenas en capa** (Sergio, mismo día: «Capa: el teclado toca todas», tocando
rápido o con muchas teclas, «clipea bastante pronto», con cualquier escena).
Medido con las cuatro escenas del repo: la salida NO pasaba de 0 dBFS (no era
un clip digital), pero (1) la CPU se disparaba — con capa cada tecla son cuatro
voces, y tocando rápido el render offline costaba del 107 al 209 % de un
núcleo: en directo, cortes y chasquidos que suenan a clip — y (2) el limitador
recibía hasta +8,6 dB y recortaba 9 dB, áspero. Además cada motor, sin notas,
ya costaba ~4 % (y en Partes hay cinco: las cuatro partes y el único, callado
debajo), y eso el presupuesto no lo contaba.

- **Efectos de inserción bajo demanda** (`AudioEngine._ensureDist / _ensureFl /
  _ensureCh / _ensureEns`): de cada efecto existe siempre solo el camino seco;
  el wet (WaveShaper ×2, líneas de retardo moduladas, 9 LFO) nace al subir su
  cantidad. Un motor sin efectos pasa de 3,8 a 2,5 % (con su sala).
- **El presupuesto cuenta los motores** (`engineCost`, medido: 1 voz simple
  de base + lo de cada efecto encendido, 0,14–0,37). Comprobado EN DIRECTO
  (escena coro-robótico en capa, 24 notas a 8/s): uso máximo 28,4 de 30, 13
  voces vivas como mucho (sin tope, hasta ~96 colas solapadas).
- **Limitador nuevo** (`worklets/limiter-processor.js`, en lugar del
  DynamicsCompressorNode): brickwall con 6 ms de lookahead — la señal sale
  retrasada 6 ms (lo mismo que el de antes) y la bajada de ganancia se reparte
  en ese tiempo, así que nada pasa del techo (−1 dBFS) y no hay aspereza.
  Debajo del techo es lineal con +1,71 dB, la ganancia fija («makeup»
  automático) que sumaba el de Chrome — medido: −30 y −6 dBFS salen idénticos
  (−28,29 / −4,29) y con el mismo retraso (289 muestras). Apretado: un seno a
  +12 dBFS salía a −0,10 dBFS con 0,62 % de distorsión; ahora a −1,00 con
  0,00 %. En las escenas en capa, los picos se quedan en −4,1 dBFS (techo menos
  el máster de la escena) en vez de subir a −2,1: lo muy apretado suena un poco
  más bajo y limpio; lo que no llega al limitador, igual.

**El Master sigue detrás del limitador.** Se probó delante (para que bajarlo le
quitara trabajo al limitador): por debajo del umbral es idéntico, pero el pico
que el limitador de entonces dejaba pasar (ataque de 2 ms) ya no quedaba
atenuado y «16 notas + robo de voz» clipeaba (+0,3 dB). Con el limitador nuevo
eso ya no podría pasar, pero no hace falta. Queda, **pendiente de escucharlo**,
el reparto de ganancia por número de voces (hoy no compensa hasta la 5.ª nota
de cada parte, y en capa las cuatro partes suman).

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
index.html                     el instrumento: cabecera, un panel fijo por pestaña (bandas de secciones) y teclado
css/style.css                  hoja única; ARRANCA con el bloque de TOKENS de piel (color, caras, sombra, forma, letra)
js/main.js                     entrada: enlaza la UI y arranca el motor
js/selftest.js                 autotest offline (?selftest=1)
js/engine/
  params.js                    PARAMS: tabla ÚNICA de parámetros (defaults, rangos, formato)
  state.js                     estado S del synth, derivado de PARAMS
  AudioEngine.js               grafo de UN instrumento (LFOs, inserciones) + gestión de voces
  Sala.js                      el espacio: delay de cinta, reverb, limitador, máster (por envíos; compartida en Partes)
  parts.js                     modo Partes: 4 motores sobre un contexto + Sala compartida; part() = el que edita el rack
  nodes.js                     nodos auxiliares: azar por contexto (semilla offline), ruido, deriva, IR de reverb, curva de distorsión, LFOs
  Harmony.js                   armonía de la escena: escalas, progresión / paseo de funciones, acordes, PRNG con semilla
  Player.js                    jugador por parte: pulso euclídeo, acorde, melodía, raíz (dedos virtuales)
  Conductor.js                 reloj maestro en beats: ticker + look-ahead; scheduleAll() para el render offline; toJSON/fromJSON
  Arrangement.js               arreglo: energía en ciclos de compases, umbral de entrada, sorpresa, macro de apertura
  Voice.js                     cadena por nota: osc (worklet) → filtro LP/HP → VCA → pan
  presets.js                   banco de FÁBRICA (semilla de la biblioteca) + migración v1→v2 del localStorage antiguo
  library.js                   la BIBLIOTECA: secciones e ítems (preset/escena), semilla, ★, búsqueda, export/import (sin DOM)
  worklets/pulse-processor.js  oscilador PolyBLEP (saw/square/sine/tri/supersaw/tabla/fm4; FM 2-op + feedback; FM4 4 op con algoritmos; tabla con Hermite)
  worklets/plate-processor.js  reverb de placa algorítmica (Dattorro): difusores + tanque modulado, 100 % wet
  worklets/limiter-processor.js limitador de salida de la Sala: brickwall con lookahead de 6 ms, techo −1 dBFS
js/ui/
  registry.js                  registro CONTROLS {get,set,def,el,opts} → reset/snapshot/presets/midimap
  theme.js                     piel: token()/tint()/hue() sirven los tokens CSS a los canvas; selector de tema (lee los temas de las hojas)
  partsControls.js             botón Partes + selector 1-4 en la cabecera + módulo Mezclador
  playerControls.js            módulos Armonía (▶ Tocar, escala, progresión, semilla), Jugador (modo + knobs + Entra/Deriva)
                               y Arreglo (energía, vaivén, ciclo, apertura, sorpresa; ⇩⇧↺ escena)
escenas/*.json                 escenas del repo (⇧ Escena en el módulo Arreglo): ambient nocturno, amanecer
                               dórico, techno hipnótico, coro robótico — el selftest las renderiza todas
  frame.js                     el instrumento de tamaño fijo escalado a la ventana (zoom); fitCanvas/uiZoom para los canvas
  screens.js                   pestañas Diseño / Secuenciación / Presets: un panel fijo cada una; mueve los compartidos (data-slot)
  rotary.js                    selector giratorio: un .seg.rot con sus botones en arco alrededor de un knob
  display.js                   pantalla Salida (último parámetro tocado y, si está apagado, por qué), menú Archivo y avisos del banco
  (engine) Voice.cost + AudioEngine.VOICE_BUDGET   presupuesto de CPU común a las partes (ver «Rendimiento»)
  deps.js                      dependencias: apaga (atenuado, tocable) lo que no hace nada con la configuración actual, con su motivo
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

**Reset es neutro** (y así arranca el synth, desde 2026-10-05): el oscilador A a
solas (nivel A 1 y B 0, B sin desafinar), el filtro abierto y plano (20 kHz con Reso −3 dB,
el Butterworth sin pico: ±0,02 dB hasta 12 kHz), la envolvente en puerta (A 2 ms ·
S 1 · R 20 ms, lo justo contra el clic) y todos los módulos a 0: suena la onda
pura. Los presets, en cambio, se guardan como **diferencias** y van sobre la
**base de los presets** (`PRESET_BASE` en `params.js`: los defaults de antes —
B a +7 ct mezclado al 0,4 — hoy niveles A 0,6 · B 0,4 —, LP a 6 kHz con 2 dB, ADSR 10 ms / 0,7 / 300 ms), así
que los de fábrica, los bancos del repo, las escenas y los importados suenan
exactamente igual que antes (verificado: los 560 estados efectivos, idénticos);
los guardados con Guardar llevan todas las claves y la base no les cambia nada.
Un preset nuevo escrito a mano parte de esa base (o fija las claves); `{}`
(«Init (default)») es Reset.

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
en C3 por el banco y, con la nota aún pulsada (el VCA va detrás del banco),
se corta el ruido y se mide la **cola libre** de los modos: con Material 0
canta en 2·f0 (74 dB sobre 2,76·f0) y con Material 1 en 2,76·f0 (84 dB sobre
2·f0); con Decay 1 (Q 600) la cola cae con τ = 0,731 y 0,530 s, frente a
los Q/(π·f) = 0,730 y 0,530 teóricos; con Decay 0 (Q 10) el modo ha muerto a
los 0,15 s (−67 dB); el cuenco con ruido suena a −19 dB RMS; en mono el
banco sigue el glide (tras C3 → G3 la cola canta en 2·G3, 80 dB sobre 2·C3,
que ya no es modo); 162/162 al cerrarlo. La primera versión medía el ruido
mismo (cociente de dos Goertzel, 2·f0 frente a 2,1·f0) y fallaba de vez en
cuando: un Goertzel sobre ruido es un sorteo de Rayleigh (dos grados de
libertad; alargar la ventana lo estrecha, no lo promedia) y el cociente de
dos sorteos tiene una cola larga — 2 de 30 repeticiones suspendían. La cola
libre es determinista en su ritmo: el ruido decide con cuánto empieza cada
modo, no cómo se apaga. Reescrito el 2026-10-12 y probado rompiendo el
resonador (Decay sin efecto y Material clavado en cuerda): lo detecta. Presets «Cuenco tibetano (ruido + resonador)» y «Metal frotado
(sierra + resonador)» en Cinescape; pares **RES 1-2** (ruido + seno, diff 0,73)
y **RES 3-4** (sierra por cuerda, 0,27).

## Roadmap 6.0 — en exploración (2026-10-04)

Origen: «¿cómo conseguimos sonidos más ricos, con más textura?». Lo leí como
textura FINA (irregularidad a escala de milisegundos dentro de cada voz) y se
hizo un primer bloque, el **Grano**: la voz multiplicada por un ruido de ancho
B (temblor, raspa o aliento pegados a los armónicos). **Descartado tras
escucharlo** («no era lo que esperaba, ni lo que buscaba») y quitado del
código. Lo que se busca en realidad son **sonidos complejos y escalonados**:
el timbre moviéndose por PASOS, con ritmo, generado por LFO o algo así.
Lección: ante una palabra ancha («textura»), pedir una referencia antes de
construir.

**Qué hay ya** para eso: el S&H en cualquier LFO (escalones aleatorios, uno
por periodo), la secuencia de tabla (el único patrón de pasos escrito a mano:
frames a tempo, por voz), los LFO CRUDOS como fuentes de la matriz (un LFO que
no se usa para lo suyo —el de PWM sin ondas cuadradas, por ejemplo— es una
fuente escalonada más, a su propia velocidad), la fase por voz (cada nota de
un acorde con sus propios escalones) y el delay a tempo. Demostración: la
categoría de fábrica **Escalonados** (seis presets a 120 bpm: un S&H a tres
destinos; tabla + filtro + puerta a semicorcheas, corcheas y tresillos;
escalera de cutoff y melodía de pitch hechas con tres LFO cuadrados a 1, 2 y
4 Hz con pesos 4:2:1 — un contador binario de ocho niveles; S&H por voz; y
cuatro ciclos de 5, 6, 8 y 16 pasos). Medido: la melodía da 800, 600 … −600
cents exactos, una nota por corchea. Dato que hay que saber: la onda
cuadrada NATIVA del navegador está limitada en banda y normaliza a 1 el pico
de Gibbs, así que su meseta vale ±0,849 — con pesos 1/3, 1/6, 1/12 los tonos
enteros salían de 170 cents; van ×1/0,849. **Qué falta**: patrones escritos para
cualquier destino (no solo la tabla), LFO a tempo (hoy van en Hz: a 120 bpm la
semicorchea son 8 Hz, y no arrancan en fase con el compás) y, sobre todo,
varios patrones de LONGITUDES distintas — 16, 12 y 5 pasos no vuelven a
coincidir hasta mcm = 240 pasos (30 s en semicorcheas a 120 bpm): cada capa es
simple y regular, el conjunto suena complejo y sigue siendo rítmico (el
phasing de Reich, los bucles de longitudes distintas de Eno). Candidato: un
módulo de **Pasos** (carriles con longitud, división y valor por paso, como
fuentes de la matriz). **Pendiente de que Sergio lo vea claro** antes de
planificar nada.

## Panel fijo (2026-10-12)

Propuesto por Sergio: «cuesta mucho encontrar los módulos… en un synth físico
estarían anclados en un rack y siempre en la misma posición». El rack que
refluía (rejilla `auto-fill` + `dense`, grupos plegables) pasa a ser un
**instrumento de tamaño fijo escalado a la ventana**, con Diseño entero a la
vista y sin scroll — antes, a 1500 px de ancho, se veía menos de un tercio
del rack cada vez. Primero se validó con una maqueta estática (aprobada tal
cual: «me gusta todo lo que veo»); luego se construyó en la rama
`ui-panel`. Nuevos: `ui/frame.js`, `ui/rotary.js` (selector giratorio),
`ui/display.js` (pantalla Salida), conmutador con LED y faders verticales
(solo CSS sobre los segs y sliders de siempre), banco de LFOs, tabla de
operadores FM4, matriz en filas compactas, módulos compartidos que se mueven
entre pantallas. Fuera: `ui/groups.js` y los filtros `data-screens`. El
motor no se toca y todos los `id` / `data-knob` se conservan: presets, MIDI
learn y snapshots siguen igual. Detalle en «Panel fijo, pantallas y
cabecera». Check «pantallas» reescrito con la invariante «nada recortado» y
check «canvas» (el tamaño lo pone el CSS: el secuenciador reventaba al tocarlo
a zoom 1,3 × dpr 1,5); 170/170.

**Dependencias** *(2026-10-12, pedido por Sergio: «si un módulo, o una parte
de un módulo, no está en uso o no puede usarse con la configuración actual,
que esté apagado»)* — `ui/deps.js`: tabla de reglas leídas del motor (qué
suena, por onda, llaves dentro de cada módulo, modulación, sala, escena);
apagado = atenuado en su sitio pero tocable, con el motivo en el tooltip y en
la pantalla Salida. Sustituye al atenuado anterior (solo FM, FM4 y la fila PWM,
y bloqueado). Check «dependencias»; 171/171. Visto de paso: el check del
resonador («Decay estrecha los modos») es inestable de por sí — excita un modo
de Q 600 (0,4 Hz de ancho) con ruido blanco aleatorio y lo mide en 1,1 s; la
razón salió 90,5 · 30,9 · 7,3 en tres pasadas y una vez cayó bajo el umbral
(×4). No lo toca este cambio; pendiente de hacerlo determinista.

## Opiniones de un compañero (2026-10-14) · 1.1.0

Tras publicar la 1.0, Pat (compañero de trabajo, conoce bien la FM de Yamaha)
lo probó y dejó cuatro ideas. Se analizaron contra el código antes de tocar
nada:

- **«El arpegiador en mono debería redisparar la envolvente»** — era un bug,
  no una preferencia. El arp programa cada note-on ~100 ms antes (look-ahead
  de 120 ms en ticks de 25 ms) pero soltaba el paso anterior con un
  `setTimeout` al acabar su gate. Si el hueco `dur·(1−gate)` era menor que
  esa antelación (1/16 a 120 BPM con gate 0,5: 62 ms), la nota anterior seguía
  «pulsada» cuando llegaba la nueva y `_monoOn` lo tomaba por legato: solo
  deslizaba, y además el deslizamiento caía ~100 ms antes de la rejilla
  (`glideTo` usaba `currentTime`). El resultado dependía del tempo y del
  gate. Con FM4 se notaba más: los decays de los operadores no se
  reiniciaban y el pluck sonaba solo en el primer paso. Arreglo: Arp y Seq
  emiten el note-off PROGRAMADO (`_directOff(id, t)`) justo después del on, en
  orden, así que el solape lo decide el gate; con gate 1 el off se emite tras
  el on siguiente (ligadura). `glideTo(freq, time, at)` cae en su sitio.
  Encima, el parámetro **Disparo** (`monoTrig`: legato | retrig) decide qué
  pasa cuando las notas SÍ se solapan (teclado tocado ligado, gate 1): el
  single / multi trigger de los Moog y los ARP. En retrig la voz vieja se
  funde en max(5 ms, ataque) empezando exactamente en el t0 de la nueva: un
  ADSR analógico redispara desde su nivel, sin volver a 0.
- **Desfase del look-ahead en los note-off** (el «golpe mudo» de los
  jugadores, visto el 2026-10-02): la voz suena `lag` = t0 − startAt después de
  su hora musical (look-ahead + frontera de bloque), pero el note-off
  programado no se trasladaba: la puerta real era gate − look-ahead y, por
  debajo, muda. `Voice.lag` y `release(rel, at)` / `glideTo` suman `lag`.
- **Hallazgo al medir el relevo**: `_releaseParamAt` confiaba en que
  `cancelAndHoldAtTime(t)` deja un ancla en t. La especificación solo inserta
  un evento si una rampa CRUZA t; con la envolvente posada en el sostenido no
  añade nada y la rampa del release sale del último evento (el fin del
  decay, en el pasado): la ganancia caía en recta desde allí, de golpe al
  programarlo. Afectaba a todos los note-off programados de los jugadores
  desde C2 (sus notas largas se iban apagando solas). Ancla explícita
  `setValueAtTime(v, t)` con el valor calculado. Las escenas suenan algo
  distinto (la cola del check «partes» pasa de −45,3 a −40,6 dB).
- **«Liga la velocity a los niveles de los operadores»** — cierto, y el
  hueco estaba justo en FM4: la matriz ya tenía vel→índice para el FM de 2
  operadores (preset «E-piano DX»), pero FM4 solo respondía a la velocity con
  amplitud y filtro. Columna **vel** (`fm4V1-4`): nivel × (1 − v + v·velocity),
  calculado al nacer la voz (la velocity es fija por nota) y en vivo por
  `setFm4`. En un modulador el nivel es el índice. Medido: modulador con vel,
  brillo fuerte/flojo ×12,4; sin vel ×1,00; portadora con vel: brillo ×1,00 y
  nivel ×11,1 (frente a ×3,3 solo del VCA).
- **«Los algoritmos, mejor con el grafo de Yamaha que con el knob»** — el
  knob se queda (MIDI learn y presets no cambian) y la leyenda de texto
  «4→3→2→1» pasa a ser el diagrama de cajas del DX7, generado de una COPIA de
  `FM4_ALGS` en `ui/fm4Graph.js` (un worklet no se importa desde la página;
  el selftest compara las dos tablas leyendo el fuente del worklet).
  Colocación automática: fila = altura sobre la salida, columna = media de las
  de sus destinos, en abanico si coinciden.
- **«Me gusta más la piel Clásico»** — medido: el contraste de texto es el
  mismo (11,9:1 frente a 11,5:1; rótulos 4,8:1 frente a 4,9:1); lo que cambia
  es estilo (rayita frente a punto y arco, MAYÚSCULAS, volumen). Se queda
  como está; la base se renombra **Carbón** (chocaba con la categoría
  «Cinescape»).

Checks nuevos: «grafo FM4», «Disparo mono» (simula el planificador real
suspendiendo el render cada 25 ms y llamando a `_tick()`; cuenta ataques de un
pluck: arp/Seq con gate < 1 → 8 de 8, gate 1 legato → 1, cada nota → 8;
relevo sin hueco con look-ahead de 45 ms; gate de 30 ms con look-ahead de 45 ms
suena; sostenido intacto hasta un off programado) y «Velocity en FM4»; 177/177.
La sonda de demos acepta `"velocidad": {prefijo: v}` en el banco (los pares
FMV solo se distinguen tocando flojo). Visto de paso: el check «vocal 2.0»
(transición del Golpe) es inestable — falló 1 de 9 pasadas de hoy sin pasar por nada
de esto.

**Pantalla Salida en dos líneas** (mismo día, pedido de Sergio: «a veces
intenta meter un texto demasiado grande y no cabe»). Un seg enseñaba como
valor el title entero de su botón — una explicación, no un valor — y la
columna del valor, de ancho `auto`, se comía la del nombre: no se veía ni qué
parámetro era. Ahora: arriba el parámetro y, a su derecha, qué significa la
opción (el title sin repetir el rótulo) o por qué no hace nada (manda); abajo
el valor CORTO (rótulo del botón + su `data-cap`: «3 · 2·3·4→1»). Lo que no
cabe encoge la letra de 24 a 13 px (monoespaciada: una regla de tres) y, si
ni así, se desplaza ida y vuelta a 35 px/s con pausa en los extremos. A
propósito sin `prefers-reduced-motion`, como el logo: Sergio tiene los
efectos de animación de Windows apagados y el texto se quedaría cortado.
Check «pantalla Salida»; 178/178.

**Acordes limpios: margen en el máster** (mismo día; Sergio: «tocando un
acorde suena como con altibajos en volumen, como si algo controlara la
amplitud total y recortara»). Medido antes de tocar nada: acorde Do-Mi-Sol con
cada preset de fábrica, limitador puenteado y su algoritmo simulado sobre la
señal. Casi todos los pads entraban 4-8 dB por encima del techo y el limitador
recortaba 5-7 dB todo el sostenido, con un VAIVÉN de 4-6 dB (10 en Pad PWM
unison): su ganancia seguía los picos del batido de las sierras desafinadas.
Sin distorsión ni saturación de cinta en los pads: era el limitador, pensado
como red de seguridad y trabajando sin parar. Causa de fondo: sin margen (una
nota sola ya rozaba el techo; algunas lo pasaban) y el Master DETRÁS del
limitador, así que bajarlo no le quitaba trabajo. Sergio escuchó pares A/B
(hoy / con 9 dB de margen, mismo pico): «los A suenan como te intenté
describir, y los B suenan muy limpios».

Arreglo (Sala.js): `suma → cinta → margen (HEADROOM_DB = −9) → Master →
limitador`. La cinta queda antes del margen (su saturación ve el nivel de
siempre). El Master delante se había probado y revertido el 2026-10-12 con el
DynamicsCompressor, que dejaba pasar picos; el limitador de ahora es
brickwall: 16 notas con el Master a 1 dan −1,8 dB. Calibración (103 presets,
dB sobre el techo con el Master del preset, sin margen): 1 nota mediana −3,9 /
p90 −1,1 / máx +2,0; 3 notas +1,8 / +5,7 / +10,7; 4 notas en abierto (Do-Sol-
Do-Mi) +3,5 / +8,5 / +12,0. Con −9, el p90 de cuatro notas queda por debajo
del techo; los seis que aún lo pasaban (cuadradas y PWM: Pad PWM unison,
Órgano trémolo, Melodía de LFO, Bajo camaleón, Ensemble PWM, Tabla, filtro y
puerta) eran también los más fuertes con una nota y bajan su Master −3 dB.
Coste: todo sonaba 9 dB más bajo — resuelto con la sonoridad igualada (abajo). No se usó la compensación por número de voces desde 2
notas: las notas sostenidas cambiarían de volumen al tocar o soltar otras.
Check «margen» (4 notas con seis pads: pico < −1,3 dBFS = el limitador no
llegó a actuar; 16 notas con Master a tope bajo el techo); los umbrales
absolutos de nivel del selftest llevan el margen dentro (`HR`); 179/179.
Lección de la sonda: cientos de OfflineAudioContext en una sola página
tumban el renderer headless (la captura se queda esperando para siempre):
por tandas, un navegador por tanda.

**Sonoridad igualada en los presets de fábrica** (mismo día; Sergio, tras
probar el margen: «suena finísimo y limpio, pero hay presets que suenan
bajito, sobre todo los que no están pensados para acordes, como los bajos»).
El margen es para acordes y se aplicaba igual a un bajo que nunca toca más de
una nota; antes, el limitador «inflaba» todo y tapaba las diferencias. Sonda
de sonoridad (K-weighting de BS.1770, máximo de bloques de 400 ms ≈ momentary
max) por preset con una nota y con acorde: medianas en su uso de −23,9 LUFS
(bajos) a −19,8 (pads con acorde) y −28 (plucks, voz, stabs); 40 de 116
dentro de ±2 dB de la mediana. Regla: cada preset sube o baja hacia un mismo
objetivo EN SU USO PREVISTO (una nota: bajos, leads, percusión, efectos y
todo lo mono; un acorde de tres: lo demás) con la condición de que ese uso no
llegue al limitador (pico del acorde abierto de cuatro, o de una nota + 3 dB
por si se ligan dos, por debajo de −2 dBFS). La percusión sube en bloque (la
mediana, recortada por el pico de cada golpe) para no romper el equilibrio
del kit. «Init» se queda en `{}` (Reset neutro). Resultado medido después:
mediana −15,6 (antes −21,1), p10 −19,5 (antes −27,5), 82 de 116 dentro de
±2 dB; a la salida, con el makeup del limitador, unos −14 LUFS. Los que se
quedan cortos tienen un golpe muy por encima del cuerpo (plucks, percusión):
tan fuertes como deja sonar limpio. Para eso el **Master** llega a ×4
(+12 dB), en log desde 0,01 (0,7 cae en el 71 % del giro, como antes) y se
lee en dB; los faders de nivel del mezclador de Partes y el máster de la
escena usan el mismo recorrido. Los presets guardados del usuario conservan
su Master. Se descartaron: compensar por número de voces (las sostenidas
cambiarían de volumen) y un nivelador automático lento (aplana los
crescendos). Checks: «sonoridad de fábrica» (una nota de Slide bass y Lead
brillante frente a un acorde de Supersaw pad, DX e-piano y Strings ensemble:
−14 ± 3 LUFS y menos de 3,5 dB entre ellos; medido 1,3) y «margen» rehecho:
lo que se oye no es que un pico roce el techo (con fases y derivas
aleatorias el pico de un acorde varía ±1 dB entre pasadas) sino que el
limitador trabaje todo el rato, así que mide el % de bloques de 10 ms
recortados (0 % ahora; 20-32 % con el margen quitado, comprobado). 180/180.

**Segunda opinión sobre el limitador** (mismo día: Sergio le enseñó
`limiter-processor.js` a otra IA, que solo vio ese fichero). Su diagnóstico
de fondo — un limitador de picos no iguala sonoridades; hace falta un ajuste
por preset medido en LUFS (BS.1770) con una secuencia de referencia, y el
limitador solo como protección final — es lo que ya se había hecho (margen +
Master medido por uso). Lo que aportó y se aplicó:
- Su aviso «si un preset pide +12 dB, sospecha» destapó un fallo de la
  normalización: la sonda mantenía las notas 2 s y diez presets tardan más en
  llegar a su nivel (Pad glaciar, ataque de 12 s, recibió el tope de +12 dB;
  con el ataque completo su acorde daba −5,9 LUFS y pasaba el techo 6,4 dB).
  Re-medidos con ataque + decay + 1,5 s de sostenido y recalculados con la
  misma regla (glaciar −9,1 dB, cuatro vientos −6, drone de sótano −3…).
  LECCIÓN: medir el sostenido de verdad, no una ventana fija.
- Check «limitador» con señales de prueba: transparente bajo el techo
  (|Δ| 1,5·10⁻⁸ frente a la entrada retrasada 6 ms × makeup), una ráfaga a
  +12 dB — y otra solo en R — no deja ninguna muestra por encima de −1 dBFS,
  sin NaN, y la ganancia vuelve tras el silencio; pico REAL entre muestras
  (×4, sinc enventanado) en el peor caso musical — 16 notas brillantes con el
  Master a +12 dB — −0,5 dBTP: el techo de muestra a −1 dBFS deja el margen
  que pedía su objeción de dBTP; no hace falta detector de true peak. 181/181.
Lo que no se aplicó, y por qué: un «control dinámico maestro» entre la
normalización y el limitador (un compresor que siga la interpretación es lo
que hacía respirar los acordes; ella misma desaconseja normalizar nota a
nota); un `outputTrimDb` separado del Master (con el Master ya guardado en el
preset y delante del limitador es la misma ganancia; separarlo solo cambiaría
qué enseña el knob); y el makeup de +1,71 dB del limitador es un resto de
cuando sustituyó al DynamicsCompressor (lineal, se podría plegar en el margen
sin cambiar una muestra).

## Mezclador a la Minimoog (2026-10-17)

Lo apuntado al cerrar la 1.1.0: el Mix A↔B era un crossfade, y al centro
perdía 3,5 dB con los osciladores desafinados. La voz sumaba
`(1−ring)·[(1−mix)·A + mix·B] + ring·A×B`: subir B bajaba A, y subir el Ring
bajaba los dos. Al centro cada oscilador va a 0,5 (−6 dB), y dos señales sin
correlación (desafinadas) suman POTENCIAS, no amplitudes: 0,5² + 0,5² = 0,5,
o sea −3 dB frente a uno solo. Ahora es un mezclador como el del Minimoog:
`levelA·A + levelB·B + ring·A×B + ruido·N`, cada fuente con su nivel
(Mezcla: Osc A · Osc B · Ring M. · Ruido, lineales, leídos en dB). El Ring
pasa a ser una fuente más, como en el ARP Odyssey (decisión de Sergio): ya
no se come a A ni a B. En `Voice.js` desaparecen `normMix` y el crossfade
`normX`: dos nodos menos por voz.

**Migración exacta.** Mismos coeficientes: `levelA = (1−ring)(1−mix)`,
`levelB = (1−ring)·mix`, `ring` igual. Todos los caminos por los que entra un
preset (`loadState`, `applyPreset` de las partes, `applySceneJSON`) pasan por
`withPresetBase`, y ahí la hace `state.migrateMix`. Es PERMANENTE, no de una
vez: la biblioteca guarda copias de los presets en localStorage, todas con
`mix`. Un preset sin `levelA`/`levelB` es de antes; si lleva Mix o Ring > 0 se
traduce, y si no, hereda la base (`PRESET_BASE` lleva ya A 0,6 · B 0,4, el
Mix 0,4 de entonces). La trampa: un preset NUEVO escrito a mano con Ring y
sin niveles se leería como de antes. Por eso los de fábrica con Ring llevan
sus niveles, y el check lo vigila. La fábrica (116), las demos (116) y el
banco 2.0 (36) se reescribieron con un script de texto (conserva formato y
finales de línea). La deriva de los jugadores `mix` pasa a `levelB` (el B
entra y sale sobre el A; `Conductor.fromJSON` traduce las escenas), y un CC
de MIDI learn ligado a `mix` pasa a mover `levelB` (`RENAMED` en `midimap.js`).

**El precio de sumar.** Medido: A y B a tope suenan **+6,02 dB** sobre A solo
si son la misma onda en fase (suman amplitudes: ×2) y **+2,88 dB** desafinados
50 ct (potencias: ×√2). Respecto al Mix al centro de antes son +6 dB
desafinados. Los presets de fábrica no cambian ni un decibelio (la traducción
es exacta), pero subir los dos osciladores de un pad se come el margen del
máster: Pad cálido con un acorde de cuatro pasa de un limitador que no trabaja
(0 %) a recortar el 19-21 % de los bloques de 10 ms. Es lo mismo que subir el
Master 3-6 dB, y se arregla igual: bajándolo. No se compensó automáticamente,
porque dividir por la suma de niveles devolvería el crossfade (subir uno
bajaría los otros). Tiene premio: el Drive del filtro (pre-ganancia
1 + 4·drive delante de la tanh) recibe la suma, así que subir el mezclador
satura más. Es el truco del Minimoog de abrir el mezclador para apretar la
entrada del filtro.

Check «mezclador» (categoría propia): superposición (mezcla a 0,3 · 0,5 · 0,2
frente a la suma de A, B y A×B renderizados por separado: −133 dB), en fase
+6,02 ± 0,1, desafinados entre +2,5 y +3,5 (a 50 ct la fundamental bate a
3,9 Hz y caben 5 batidos en la ventana; con 7 ct haría falta un batido de 2 s)
y un preset de antes frente a su traducción. Este último no puede compararse bit
a bit: dos renders del MISMO estado ya difieren ~1·10⁻⁸ (−125 dB del pico),
así que el umbral es −100 dB. Check estático «migración del mezclador» (los
casos de la fórmula, `{}` sigue siendo Reset, ninguna fábrica con `mix`, todo
Ring con sus niveles). En «MIDI learn», el renombrado; en «dependencias»,
solo B, solo Ring. Pares MEZ 1-4 en el banco de demos (ring en crossfade
frente a sumado; drive con el mezclador a medias frente a tope). 183/183.

## Checks fiables y velocity del teclado de pantalla (2026-10-17)

**Dos checks que fallaban de vez en cuando**, medidos antes de tocarlos (una
sonda que repite las medidas del check 20 veces, por `tools/shot.mjs` con el
JS previo en un fichero):
- **«vocal 2.0» (la transición del Golpe)**: de 6,3 a 238 con el umbral en 5.
  El sin-Golpe es determinista (0,253 siempre). Lo que bailaba era el burst:
  arranca en un punto AL AZAR del ruido (cada consonante distinta, a propósito)
  y se suma DESPUÉS del banco de formantes. Un Goertzel de un bin sobre ruido es
  un sorteo, y el check dividía un sorteo entre otro: la misma enfermedad que
  tuvo el resonador. La transición en sí (el eje vocálico cae 1,5 y vuelve con
  τ = 24 ms) es determinista. Arreglo: no quitar el azar, PROMEDIARLO: ocho
  golpes en un render (notas cada 206 bloques, release corto) y las potencias
  sumadas antes de dividir (2·8 grados de libertad en vez de 2). Medido: 15-38
  en 20 repeticiones. Sin la transición, el burst solo (centrado en F2) daría
  menos de 1, así que el umbral sigue discriminando.
- **«resonador»**: el rediseño del 2026-10-12 (medir la cola libre de los
  modos, no el ruido) aguanta; lo que rozaba era el NIVEL del cuenco, de −30,0 a
  −27,1 dB con el umbral en −30. Ese umbral absoluto se quedó sin ajustar al
  meter el margen de −9 dB del máster en la 1.1.0 (los demás llevan `HR`
  dentro). Ahora se mide sin el margen: −19 dB. Cinco pasadas seguidas del
  selftest completo en verde.

**Velocity con el ratón.** El teclado de pantalla tocaba todo a 1. Ahora la
velocity sale de la ALTURA a la que pulsas la tecla, como en un piano (se pega
fuerte en el borde delantero): arriba, junto al fieltro, 0,2 (−14 dB en el VCA,
y menos filtro o FM donde la velocity los mueve); sube en recta hasta el 85 %
del largo; el 15 % del borde da 1, así que un clic abajo suena como antes
(`velFromY` y sus dos constantes al principio de `ui/keyboard.js`). El QWERTY
no sabe de fuerza y sigue a 1; el MIDI trae la suya. La tecla pulsada brilla
según la velocity (`--vel` en el CSS) y la pantalla Salida enseña «Teclado · C4
/ vel 0.48», solo con el ratón (el MIDI y el QWERTY no pisan el knob que se
está girando). Probado con ratón REAL por CDP con el panel a zoom 1,3 (la
pantalla de Sergio): `getBoundingClientRect` y `clientY` hablan el mismo
espacio y las alturas 5/30/60/97 % dan 0,25/0,48/0,76/1,00, lo esperado. Check
«teclado de pantalla: velocity» (la curva, y un pointerdown de verdad sobre una
tecla: voz, `--vel` y pantalla). 184/184.

## Roadmap 7.0 «el instrumento» (2026-10-17)

Rumbo fijado por Sergio: SubSDJ es un instrumento de diseño y generación de
sonido, no un DAW; más capaz, expresivo y sorprendente, abierto a otros
generadores; los sonidos se exportan (SFZ, WAV). Los presets no son una
restricción: si una mejora rompe el banco, se rehace desde cero (y de paso,
bilingüe). Plan completo en PLAN.md.

**0.1 · Teclado sin notas colgadas.** Tres fallos del teclado del PC y del
táctil: (1) el `keydown` no miraba Ctrl/Alt/Meta, así que Ctrl+Z tocaba un Do;
(2) la nota se archivaba por `e.key`, y con Shift pulsado entre medias la tecla
soltada llegaba como otra (Shift+2 = «"» en el teclado español): la nota colgaba
hasta el pánico; (3) ni `pointercancel` (el sistema cancela un toque) ni
`lostpointercapture`. Arreglo: el mapa tracker por POSICIÓN física (`e.code`:
`KeyZ`, `Digit2`, `Comma`…), que además deja el piano en su sitio en AZERTY o
Dvorak; los rótulos de las teclas se leen del teclado real con la Keyboard API
(`navigator.keyboard.getLayoutMap`, Chrome) y, sin ella, los de un US; con Ctrl,
Alt o Meta la tecla es un atajo (AltGr también: es Ctrl+Alt en Windows). Y cada
nota sabe QUIÉN la sostiene (`'k:KeyZ'`, `'p:<pointerId>'`, `'midi'`): suena con el
primero y se calla con el último, así el ratón no corta la que mantiene el QWERTY
ni un dedo la de otro; `pointercancel` y `lostpointercapture` sueltan;
`touch-action: none` en las teclas. Check «teclado sin notas colgadas» (eventos
de verdad: Shift entre pulsar y soltar, Ctrl+Z, toque cancelado, dos dedos).

**0.2 · SFZ con las capas de velocity reales.** El exportador hacía 2 capas solo
si `filterEnvAmt ≠ 0`: un preset con velocity → FM por la matriz, → filtro por la
matriz o con sensibilidad en los operadores de FM4 salía con UNA capa y perdía el
tacto; y la capa suave se compensaba ×1/vel, como si la velocity solo moviera el
VCA. Ahora se MIDE (`velocityLayers`): la nota de referencia (Do4) a velocity 0,3
y 1 como espectro por bandas de tercio de octava (FFT promediada, Hann al 50 %),
en dB respecto a su total; timbre = la banda que más se mueve entre las que
suenan (a menos de 30 dB del total). Un segundo render a velocity 1 da el AZAR
del propio preset (fases libres, ruido, S&H por nota, deriva), y la velocity
tiene que pasarlo en 2 dB (→ 2 capas) o en 10 (→ 3). Cada capa se iguala al nivel
medido de la dura. Por el camino, dos estimadores descartados por medida: el
«brillo» (energía de la 1ª diferencia / energía) lo domina la fundamental y no
veía «Teclas al tacto (vel→filtro)» (×1,01: el filtro mueve armónicos débiles);
y el máximo sobre bandas de hasta −50 dB, o con el azar como factor ×2, daba
falsos positivos en presets con azar y perdía DX bass (Δ 14 dB con azar de 8).
Resultado en la fábrica: 44 de 116 con capas (17 con tres), antes 30; bien
vistas la velocity por la matriz, FM4 y la DISTORSIÓN (una nota floja satura
menos: Reese, Hoover, Wobble); los de S&H por nota se quedan en una (lo suyo es
azar: round robin, Roadmap 7.0 · 6.1). Visto de paso: varios presets FM difieren
hasta 10 dB de un render a otro; con el azar con semilla en offline (7.1) esta
medida será exacta. Check: Reset → 1 capa; «E-piano DX (vel→FM)» → 3 (Δ 43 dB),
la suave subida ×3 (más que el ×2,9 de 1/vel: la FM también cambia el nivel).
185/185.

**1.1 · Deshacer y rehacer.** `ui/history.js`. Se guardan GESTOS, no cambios
sueltos: al empezar a tocar un control (pulsar dentro de las pantallas, una
tecla sobre un control, un mando MIDI) se hace una foto del estado; el gesto
acaba al soltar y tras 450 ms sin cambios (rueda, flechas, mando MIDI; en un
selector, al elegir, porque cambia DESPUÉS de soltar), y se guarda solo lo que
cambió entre medias, con su antes y su después. Por qué gestos y no «todo
cambio que pase por los controles»: en modo Partes la deriva de los jugadores
mueve knobs desde el código y llenaría el historial de pasos que nadie hizo.
Cargar un preset y Reset son un paso cada uno (`record`, envuelve la acción).
Deshacer aplica solo esas claves, control a control: no corta las notas que
suenan (loadState sí, con allNotesOff), y vuelve a la pantalla donde se hizo el
cambio; la pantalla Salida dice qué se deshizo («Deshacer · Filtro · Cutoff»).
Una pila de 100 pasos por parte. Ctrl+Z, Ctrl+Y y Ctrl+Mayús+Z (en un campo de
texto, el deshacer del propio campo); ↶ ↷ en la cabecera con lo que harían en el
título. Fuera, por ahora: la tabla dibujada del Editor de ondas (vive fuera de
CONTROLS) y los gestos de ejecución (teclas, rueda, bend).

**1.2 · Comparar con el guardado.** El «Compare» de los synths de hardware. ●
junto al preset: se enciende si lo que suena ya no es el preset cargado (o
guardado), calculado COMPARANDO estados con una tolerancia de 1e-4 del rango de
cada parámetro (un knob devuelto «a su sitio» con el ratón no cae en el mismo
float): si lo devuelves, se apaga. Comparar alterna entre el guardado y tu
edición; tocar cualquier control mientras compara vuelve antes a tu edición (lo
que tocas se suma a ella: nunca se pierde nada). Por parte, como el historial;
cargar una escena olvida los guardados. Check «deshacer · rehacer · comparar»
(gesto = paso, la deriva no; deshacer no corta una nota; preset = paso; ● y
Comparar; Ctrl+Z deshace y no toca un Do). 186/186.

**7.1 · Azar con semilla en los renders offline.** Todo el azar del motor sale
ahora de `ctxRandom(ctx)` (nodes.js): en directo es `Math.random`, como siempre;
en un `OfflineAudioContext`, un mulberry32 con semilla (uno por contexto;
`seedRender(ctx, s)` antes de crear el motor elige otra tirada, pensado para el
round robin de 6.1). Lo usan el ruido, el IR de la reverb, la Vida y el Golpe del
Vocal, el S&H por nota, el Arp aleatorio y — por una semilla que la voz pasa a
cada oscilador en `processorOptions` — las fases libres y la deriva del worklet
(que lleva su propia copia de mulberry32: los worklets no importan el motor).
Resultado: dos renders iguales difieren 6e-8 (el orden en que Chrome suma las
entradas de un nodo), otra semilla 0,3. El check de escenas ya no siembra
`Math.random` a mano (y ya no exige «presets sin azar en el worklet»); check
nuevo «azar con semilla» con un estado que lleva TODO el azar a la vez.

De dónde salían los 10 dB entre renders que se vieron al medir 0.2: sonda sobre
los 117 de fábrica, tres renders de Do4 con el azar del hilo principal ya
sembrado (queda solo el del worklet). Supersaw, unison y deriva mueven el nivel
hasta 2,6 dB (el batido de copias desafinadas: carácter analógico, se queda). Lo
gordo era la **fase del modulador FM 2-op**, sorteada en cada nota: con ratios
enteros la fase relativa reparte la energía entre armónicos de otra manera, y
tras el filtro «DX bass» variaba 6 dB. No era solo cosa de los renders: en
directo, una frase de seis Do4 iguales salía de −21,7 a −29,4 dB (7,7 dB) en
«DX bass» y de −19,7 a −27,8 en «Bajo FM»; en Do2, ±1 dB. **Key sync**: la copia
0 del modulador arranca ahora en la fase de la portadora (la del knob Phase),
como el FM4 y como el DX7 por defecto; las copias del unison siguen al azar.
Cada nota es idéntica. Con la fase del DX7 el «Bajo FM» queda en Do4 más oscuro
que su media vieja (−32,4 frente a −24,5 dB); en su registro (Do2) igual.

Con renders repetibles, el exportador SFZ ya no hace un segundo render a
velocity 1 para medir el azar del preset (era el suelo que la velocity tenía que
superar): las dos notas comparten la tirada y solo difieren en la velocity.
Fábrica: 45 de 117 con capas (21 con tres); aparece lo que el azar tapaba:
«Pluck lotería (S&H)» pasa de 1 capa a 3 (su env de filtro sigue a la velocity).
187/187.

**0.3 · Tablas de onda sin ruido de interpolación.** Medido primero, y la
hipótesis del plan (aspereza en los graves) era al revés. Método: el oscilador
solo, sin ventana, a f0 = k·SR/N para que cada armónico caiga EXACTO en un bin
(con Blackman-Harris la fuga de 512 armónicos sumada en miles de bins no deja
ver nada por debajo de −50 dB); todo lo que no es múltiplo de k es error. Con la
lineal y tablas de 4 muestras por armónico: −52 dB en Do1, −49 en Do2, −46 en
Do3, −43 en Do4 (pico −57 hacia 2,2 kHz), −61 en Do6. Sube 3 dB por octava
porque las tablas se acortan (cada mip mide 4× su tope de armónicos), hasta que
el suelo de 256 muestras las vuelve a sobremuestrear. (La sierra PolyBLEP:
−50…−35 dB, pero su aliasing cae junto a Nyquist.) Alternativas medidas: 4× +
Hermite, −49 en Do4 (el cuello es el sobremuestreo, no el interpolador); 16× +
lineal, −61,5 en el peor nivel con memoria ×3,2; **8× + Hermite: de −76 a −85
dB en todas las notas**, memoria ×1,7 (~290 KB por set), +5 % de CPU en la Tabla
y crear un nodo 0,28 → 0,31 ms. Elegida. Hermite (Catmull-Rom) sobre la mezcla
de los dos frames del morph (es lineal: mezclar antes da lo mismo). De paso
desaparece la caída de la lineal en agudos (−1,6 dB a 16 kHz → −0,03). Check
«tabla limpia» (frame 4 de 'analógica', sierra + cuadrada de banda completa):
Do2 −77 · Do4 −70,9 · Do6 −83,5 dB, umbral −65. 188/188.

**3.1 · Drive con carácter.** Dos curvas y un sesgo en vez de los tres modos que
proponía el plan: «carácter» **suave** (el tanh de siempre) o **plegado** (pliegue
senoidal y = sin(π/2·x) sobre ±24, en una curva de 8193 puntos: con ganancia 1 es
una saturación suave, a 10 la onda se dobla varias veces por semiciclo), y un knob
**Asimetría** que vale para los dos: es el sesgo b de y = f(g·x + b) − f(b).
«Suave + Asimetría» es el asimétrico del plan; «plegado + Asimetría», la simetría
del wavefolder — un tercer modo «asimétrico» habría sido el suave con un sesgo fijo.
Cuentas previas en Node (seno a 0,6): en el tanh el 2.º armónico va de −31 dB (sesgo
0,05) a −16 dB (0,3), con muchísima continua (−6 dB bajo la fundamental); en el
pliegue el brillo sube y BAJA con el Drive (centroide 5,47 → 5,26 → 5,61 en 0,7 / 0,8
/ 0,9) y el nivel apenas se mueve (±1,5 dB), ~3 dB por debajo del tanh (DRV_FOLD_MK
1,4 lo iguala); con simetría 1 (un cuarto de onda) la curva queda par y la
fundamental desaparece: suena la octava. Cómo: el sesgo y su compensación son
ConstantSources (a la entrada y a la salida de la curva: el knob se mueve sin
regenerar curvas, y −f(b) se calcula interpolando la curva como el WaveShaper), y un
bloqueo de continua de 1er orden a 5 Hz (IIRFilterNode) en el camino saturado (−0,1
dB a 40 Hz; el suave sin sesgo no cambia de forma audible). Plegado sobremuestreado
4x (suma 0,13 «voces simples» al coste, medido; la Asimetría, nada). El carácter
cambia en vivo (la curva salta: un clic, como cambiar de onda). Check «drive con
carácter» con f0 = SR/336 y una ventana de 60 periodos (cada armónico en su bin, la
media = la continua de verdad): asimétrico H2 −13 dB y continua −∞; silencio exacto
con todo el sesgo en los dos caracteres; brillo del plegado barriendo el Drive por la
matriz (velocity → Drive) 1,00 … 2,98 → 2,82 … 5,32 → 4,75, el suave siempre
subiendo; simetría a tope: fundamental −∞. UI: el grupo del drive (Drive ·
Asimetría · carácter) en la fila de abajo del Filtro y la pendiente arriba, junto a
Tipo (la estructura del filtro); esa fila a 52 px por control para caber en la banda.

**2.4 · Más destinos en la matriz.** Niveles A, B, Ring y ruido (las ganancias del
mezclador), Drive, Pitch A y Material. Un nivel que baja de 0 invierte la fase y
suena: se deja así (AM por cero; con bases razonables, 0,5 ± 0,5, no pasa, y
recortarlo costaría un WaveShaper por voz y slot). Drive: el slot entra por una
ganancia propia de la voz (el recorrido del knob en unidades de la curva: 4 en el
suave, 9/24 en el plegado) a la ganancia de entrada; solo suena con Drive > 0 (la
regla lo dice). Pitch A: el detune del oscilador A solo (para el barrido del sync,
3.2). Material: el knob interpola el LOG de las razones, así que en cents es lineal
y cada modo se mueve lo que separa cuerda de barra (0, 555, 1019, 1391, 1699, 1962
ct): exacto; pero los PESOS de los modos (ganancias ∝ r^−e normalizadas) siguen los
del knob, así que «knob 0 + matriz +1» no suena igual que «knob 1» (13 % de
diferencia): reafina, no cambia de material entero. Decay NO entra: la Q del biquad
es lineal y el knob va en log, y el ruido entra al banco con una ganancia ∝ √Q que
habría que mover a la vez. Check «matriz · destinos nuevos» (niveles a 0 callan,
ruido y ring aparecen, Pitch A sube el A una octava y deja el B) y, en el del
resonador, la cola libre con Material por la matriz canta en 2,756·f0 (94 dB sobre
2·f0). Pares DRV 1-8 (asimetría, plegado, LFO al Drive, simetría) y VEC 1-2 (morph
vectorial con un LFO). 190/190.

**0.4 · Un reloj común.** `engine/Clock.js`, uno por contexto (las partes de una
escena comparten contexto): el ORIGEN (instante de audio del pulso 0) y el BPM;
`nextGrid(t, div)`, `stepAt`, `beatAt`, `timeAt`. Antes cada Arp y cada Seq
arrancaban su reloj al pulsar (ahora + 30 ms) y sumaban duraciones; el director
llevaba otro (pos, posT); y un jugador que tocaba una parte con Arp o Seq le daba
la tecla por un `setTimeout`, así que el arpegio arrancaba donde cayera el
temporizador. Ahora: el director ANCLA el origen al arrancar (su pulso 0); sin él,
el primero que va a tempo lo fija en su primera nota (+30 ms de la tecla, sin
retraso añadido) y los que se suman van a la rejilla; el origen se conserva
mientras alguien siga a tempo. Arp y Seq guardan el paso siguiente en PULSOS
(`clock.begin / sync / advance`): un BPM nuevo reancla en el pulso de ahora y los
pasos que faltan se remapean sin saltos; si el origen se fija de nuevo (el
director arranca con un arpegio sonando), cada uno se reubica en el primer punto
de la rejilla nueva («época» del reloj). Cambiar la división en marcha salta al
siguiente múltiplo de la nueva. La tecla de un jugador llega ya, con su instante
(`noteOn(id, f, vel, when)`): entra en el arpegio, o es raíz del Seq, a partir de
ese paso (`from`), y el Retrig del Seq se aplica en ese paso; el note-off sigue
por temporizador y `clearPending` retira del Arp/Seq lo que aún no empezó. El
primer paso se planifica en el acto (no espera al primer `setInterval`). La
secuencia de tabla sigue por voz desde su noteOn (un acorde arpegiado deja las
voces desfasadas en la misma frase: es su gracia). Check «reloj común» (cuentas
del reloj + tiempo real con dos motores y el `_directOn` interceptado: a mano
+30,0 ms; Arp 1/16 y Seq 1/8 que entra 130 ms después, en la rejilla a 0,000
muestras; tecla con instante en el pulso 2 de un origen anclado, Δ 0; tras 120 →
90 BPM, en la rejilla nueva y con los huecos de 90). El check «disparo» simula el
Arp offline: ahora arranca con `_begin(0,03)`, como una tecla. Pendiente: Arp y
Seq OFFLINE (van por `setInterval`), necesario para exportar a WAV lo que suena
en ellos (6.2). 191/191.
De paso, un fallo viejo de Partes: el knob BPM solo llega al `S` de la parte
elegida (y a la sala, compartida); el Arp, el Seq y la secuencia de tabla de las
DEMÁS partes leían su `S.bpm` viejo — con el reloj común habría sido peor (al
unirse, una parte podía imponer su tempo viejo a todas). Ahora el tempo bueno es
`engine.bpm` = el de la sala, y el reloj se sincroniza con él en cada paso,
venga el cambio de donde venga (knob, cargar una escena, el director).

**2.2 · LFO a tempo, con reinicio y de una vez.** Cada LFO del banco con su
**sync** (un selector por fila): libre (Speed en Hz) o una división — 4 c … 1/32,
con puntillos (×1,5) y tresillos (×2/3) — y entonces su velocidad sale del BPM y
Speed se apaga (la regla lo dice). Cómo cae en la rejilla: un OscillatorNode no
admite fase de arranque, así que un LFO global a tempo se lee de un BUFFER de un
periodo en loop (los mismos que los LFO por voz) arrancado con la fase que le
toca en el reloj común (fase 0 en el pulso 0 del origen); el oscilador pasa por
una puerta y el relevo se programa 20 ms por delante, exacto a la muestra. El
reloj AVISA (`clock.listen`) al cambiar el BPM o el origen y el motor rehace sus
LFO a tempo y la velocidad de los de cada voz. La **fase** pasa de dos a cuatro
modos, uno para todos los LFO que pueden ir por voz (cutoff, reso, vibrato, PWM,
pan; el trémolo va siempre tras la mezcla, global): global · por voz (Weyl) ·
**reinicio** (cada nota los arranca en fase 0: el LFO atado a la nota) · **una
vez** (un ciclo desde la nota, el buffer SIN loop, y se calla en su final: sin,
tri y saw acaban en 0; S&H y deriva no tienen final y van como en reinicio). La
fase por voz ya no se envuelve (`phaseNow`): en «una vez», 1 = terminado.

Hallazgo por el camino, medido: **los LFO «globales» se quedaban congelados
entre notas.** Chrome no procesa un nodo que no llega al destino, y un
oscilador sin procesar no avanza su fase; el LFO global solo llega al destino
a través de las voces que lo usan, así que en silencio se paraba y, al
engancharlo la nota siguiente, seguía donde se había quedado — en la práctica,
casi un «reinicio» (dos notas a 0 y a 0,37 s se movían igual, 0,0000 de
diferencia). Con sincro habría salido 100,8 ms fuera de la rejilla (medido
quitando el arreglo). Arreglo: cada LFO global enganchado al destino por una
ganancia 0 — corre libre de verdad, como decía su diseño. Cambia, de paso, la
fase con que arrancan las notas en los presets con LFO global: ahora depende de
cuándo tocas, como en un sinte de hardware (quien quiera lo de antes tiene
«reinicio»). Y el arranque del motor releva la fuente en el acto (no 20 ms
después: no hay nada sonando que relevar). Check «LFO a tempo» (1/8 a 120 BPM =
4,000 Hz a 0,000 ms de la rejilla de un origen anclado, enganchado a la salida a
mitad del render; tras 90 BPM, 3,000 Hz en la rejilla nueva; reinicio 0,0000
frente a global 0,468; una vez ×3 en su ciclo y ×1,0000 después). Pares LFOT 1-6 y
FASE 3-6. 192/192.

**2.1 · Env mod: envolvente de modulación con bucle.** Una envolvente LIBRE, solo
para la matriz (fuente «Env mod», 0..1, sin velocity), con A/D/S/R, su curva y
tres modos. Panel en la pantalla **Secuenciación** (decisión de Sergio: la banda
Voz de Diseño estaba llena; es, además, la pantalla del movimiento), delante
del Mezclador, que cede el sitio. **normal** = ADSR, como la de filtro;
**disparo** = A → D → R seguidos, el note-off no la toca (la curva entera aunque
la nota dure 20 ms); **bucle** = A (0 → 1) + D (1 → 0) repetidos mientras dura la
nota — el sostenido no cuenta (si el bucle volviera al sostenido, saltaría de S a
0 en cada vuelta) —: UN ciclo en un buffer de 4096 muestras a 8 kHz (la fracción
de ataque y la curva; cacheado por forma) leído en loop con playbackRate =
duración/(A + D), así el periodo es A + D EXACTO y no cuesta un nodo por
repetición. Al soltar, el buffer para en t y una ConstantSource sigue desde el
valor que tenía — calculado, porque la forma es conocida, también para los
note-off programados de los jugadores — con el release y la curva. Nace bajo
demanda (un slot que la usa); si la matriz la pide a mitad de nota, el bucle
arranca en la fase que le toca. Las tres ayudas de envolvente
(`_envSegs`, `_relChain`, `_envValueAt`) aceptan ahora la curva como argumento.
Check «Env mod» con su salida cruda en un canal aparte: bucle A 10 ms + D 90 ms
periódico a 0,1 s con error 2,4e-7, de 0,000 a 1,000; al soltar, salto 0,0003 y 0
tras R; disparo con 20 ms de nota: 0,500 en A + D y 0 tras R (en normal, la misma
nota ya va por 0,344); normal sostiene en 0,500. Pares ENVM 1-4. 193/193.

**2.3 · Pasos (polimetría).** `engine/Steps.js` (uno por motor) y
`ui/stepsControls.js`. Cuatro carriles de valores −1…+1 (hasta 32; claves planas
st{i}Pat como wsPat), cada uno con división (1/32 … 1 compás, tresillos),
suavizado, rotación y deriva de la rotación (+1 cada N compases: el desfase de
Reich), y un reinicio común. Panel en la banda de abajo de **Secuenciación**,
entre Armonía y Jugador (decisión de Sergio; el Jugador encoge y la banda deja
de ser solo de Partes). Lo central: el paso de un carril en t se CALCULA del reloj
común — k = `stepAt(t, división)`, índice = (k + rotación + deriva) mod longitud
— sin planificar nada; así «Pasos i · nota» (el valor del paso en que arranca la
nota, fijo toda la nota: arpegios, plucks, polifonía) es exacto también offline,
y todo cae en la rejilla del Arp, el Seq y el director. El sabor continuo
(«Pasos i»: el escalón mueve también una nota sostenida) es una ConstantSource
por carril y motor programada en el look-ahead (offline, todo de golpe hasta el
final del render): un paso = `setValueAtTime` + rampa de 4 ms (escalón sin clic)
hasta el paso entero (suavizado 1: un glide que llega al final del paso).
Reinicio «al tocar»: los Pasos se unen al reloj con la primera nota tras el
silencio — si nadie más va a tempo, esa nota es el paso 0 — y lo SUELTAN cuando
el motor se queda sin voces ni colas (si no, un Arp que empezase después tendría
que esperar a su rejilla en vez de sonar a +30 ms); «nunca» = siguen el origen
del reloj; «cada N compases» = vuelven al 0. El planificador en tiempo real se
para al callar. El rótulo calcula cuánto tarda en repetirse lo que suena (en
ticks de 1/96 de pulso: enteros para todas las divisiones): 16 · 12 · 5 en
semicorcheas = 240 = 15 compases (el plan decía 30: mal); con deriva, la vuelta de
la rotación cuenta (5 pasos + 1 cada 2 c = 10 compases). Un trance gate es un
carril sobre Amplitud. Detalle de nombres: las clases CSS van con `ps-` porque
`st-row` ya era del panel del selftest (y lo descolocaba entero). Check «Pasos»
(escalera exacta a 0 de error a mitad de paso; salto máximo 0,0113 por muestra
de −1 a +1 = la rampa de 4 ms; suavizado 1 a mitad = 0; rotación y deriva; ciclo
15 y 10; por nota 1 / 0,5; tras el silencio, «al tocar» vuelve al paso 0 y
«nunca» sigue — el arranque de la voz cae 5 ms después de la tecla, en el paso
11). Probado también en tiempo real (el valor de la fuente sigue al paso
calculado con error 0; el planificador se para al callar). Pares PASOS 1-6.
194/194.

## Ventana de entrada y teclas negras (2026-10-24)

**Ventana de entrada** (`ui/splash.js`, idea de Sergio tras ver la de un
compañero: la nuestra, con un toque de demoscene old-school). Primero fue una
intro a pantalla completa (emblema del SubSDJ viejo girando en metal, scroller…);
Sergio la prefirió modesta: una ventana MODAL centrada, con el instrumento
detrás oscurecido y desaturado (`backdrop-filter`), sin emblema ni scroller.
Arriba, una pantallita de 168 × 66 px a píxel doble (`image-rendering:
pixelated`), calculada píxel a píxel cada fotograma: plasma (cuatro senos que
se desplazan, uno radial) con paleta cíclica de 256 colores más la interferencia
de dos fuentes de ondas que se mueven en Lissajous (sus anillos se cruzan: el
moiré), con viñeta y líneas de barrido; y el **nombre** en barras de cobre (un
color por línea que sube: el Copper del Amiga) con canto de luz, sombra y un
brillo que lo recorre, que entra con un fundido de **trama ordenada** (Bayer
4×4). Debajo, en HTML: el botón **ENTRAR** de esquinas cortadas con borde de
gradiente que fluye — el gesto que el navegador pide para arrancar el audio;
Intro también entra, y mientras la ventana está el teclado no toca notas
(`stopImmediatePropagation` en captura) —, y al
pie la versión, su fecha (`RELEASE` en `version.js`; el check de versión
exige que sea la del CHANGELOG), el código (con el icono de GitHub) y la licencia. La ventana se escala
con el instrumento (`zoom` = `uiZoom()`: en una 4K al 150 %, 1,3).
Se reabre como **«Acerca de»** (el título «SubSDJ v1.2.0» de la cabecera, o
Archivo ▾ → Acerca de SubSDJ…): el botón dice VOLVER, y Escape o un clic fuera
la cierran. Por eso al cerrar se OCULTA y se para el efecto, en vez de
borrarse. Ojo con el teclado: también escucha en captura sobre `window`, así
que la guarda de la ventana se registra UNA vez al iniciar, antes que él (el
primero registrado es el primero en oír), y solo actúa con la ventana abierta.
Los colores son de la marca, no del tema: tokens `--sp-*` en `:root` (la regla de la piel: ningún literal de
color fuera de ahí), las paletas del lienzo como listas de paradas que se leen
con `tokenList` de `theme.js`. Va estática en `index.html` para estar
desde el primer pintado; fuera con `?selftest` o `?nosplash`
(`tools/shot.mjs` la quita salvo `SPLASH=1`). Check «ventana de entrada»
(un fotograma que pinta, el nombre entero, la fecha).

**Teclas negras centradas** entre sus dos blancas (decisión de Sergio). Antes
imitaban el sesgo de un piano acústico (C# y F# hacia la izquierda, D# y A#
hacia la derecha), y en pantalla parecía que estaban mal colocadas.
