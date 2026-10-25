# SubSDJ · Plan

Fecha: 2026-10-25 · **publicada la 1.3.0**: del Roadmap 7.0, 1.3 medidor, 2.5 macros, 2.6 tacto,
3.2 sync, 3.3 cuerda, 4.1 delay que se desboca, 5.1 articulaciones, 5.4 swing y pulso que respira,
5.2 notas por grado; selector de presets; y la primera pasada de pulido (216/216). Lo que se haga a
partir de ahora va al CHANGELOG bajo «Sin publicar» hasta la siguiente.
(Antes: 1.2.0 el 2026-10-24, con los bloques 0.1-0.4, 1.1, 1.2, 2.1-2.4, 3.1 y 7.1.)

**Rumbo acordado el 2026-10-25 (Sergio):** el synth ya tiene mucha maquinaria y la combinatoria
crece; ahora toca APROVECHARLA. Criterio para cualquier feature nueva: que aporte algo diferencial,
más expresividad o más riqueza de sonidos; si duplica lo que ya hay, no entra. Orden:
1. **Última tanda de funciones: 4.1 → 5.1 → 5.4 → 5.2.** ✔ (2026-10-25) Y se para.
2. **Pulir y asentar** (antes de la 1.3.0): revisar la maquinaria para que dé sonido limpio — sin
   clics, sin saturaciones raras —, que sea fiable y que invite a tocar, a experimentar, a cambiar
   aquí y allá. Revisar y optimizar lo que hay, no añadir. ✔ *Primera pasada (2026-10-25): fábrica,
   knobs, eventos de nota y escenas auditados — sin limitador, sin clics, sin NaN; continua quitada
   (pulso centrado + acoplamiento en alterna); nada recortado con las Partes. Ver DISENO, «Pulir y
   asentar».*
3. **Publicar la 1.3.0.** ✔ (2026-10-25)
4. **Exportación:** 6.1 (SFZ con bucles y variaciones) y 6.2 (WAV).
5. **Inglés** (decidido el 2026-10-25): la interfaz entera traducida al inglés, una vez y SOLO al inglés —
   no multi-idioma: los soft-synths y las serigrafías de los teclados van en inglés como idioma neutro,
   y otros idiomas (alemán) alargan las palabras en un panel fijo—. Antes del banco nuevo, para que
   los presets nuevos nazcan ya en inglés (todos los de hoy se van a caer).
6. **Banco nuevo (8)**, con su propio plan (ver el bloque 8).
Descartados por el criterio: 3.4, 3.5, 4.2, 4.3 y 5.5 (ver «Lo que NO haremos»); 5.3 sin fecha.

## Roadmap 7.0 «el instrumento» (propuesto 2026-10-17 · pendiente de acordar)

**Rumbo (Sergio):** SubSDJ es un INSTRUMENTO de diseño y generación de sonido. Más capaz, más
expresivo, más sorprendente; abierto a otros tipos de generador además de la FM. Acompañamiento
ligero sí; un DAW no (ni línea de tiempo, ni multipista): los sonidos se exportan (SFZ, WAV) y las
canciones se hacen en un DAW.

**Los presets no son una restricción (Sergio, 2026-10-17).** Ninguna mejora se recorta para que los
presets de hoy sigan sonando igual. Si algo que implementamos los rompe, se aceptan los cambios y,
cuando toque, se rehace el banco desde cero con lo que el synth permita entonces (bloque 8). Las
conversiones de presets viejos se hacen solo si son baratas; si no, un preset viejo se descarta con
un aviso.

Cada bloque lleva **propósito · qué · cómo · encaje · verificación · coste · dependencias**. El
método de siempre: selftest en verde antes y después; pares A/B en `subsdj-demos.json` con prefijo
propio y sonda `?selftest=1&demos=PREFIJO` si es audible; capturas si es visual; DISENO.md y este
plan al día; commit por hito. Restricción de todo bloque con UI: el panel es fijo — un control nuevo
tiene que caber en su banda (check «nada recortado») o desplazar algo de forma acordada.

### Vista rápida

| # | Bloque | Qué nos da | Coste | Depende |
|---|--------|------------|-------|---------|
| **0** | **Arreglos** | | | |
| 0.1 | Teclado sin notas colgadas ✔ | atajos (Ctrl+Z) que no tocan notas; Shift y toques cancelados que no cuelgan — HECHO 2026-10-17 | bajo | — |
| 0.2 | SFZ con las capas de velocity reales ✔ | exportar el tacto de los presets con vel→FM, vel→filtro por la matriz o FM4 — HECHO 2026-10-17 (44 de 116 con capas; antes 30) | bajo | — |
| 0.3 | Tablas de onda sin ruido de interpolación ✔ | «Tabla» limpia: de −43 a −76 dB entre armónicos en Do4 — HECHO 2026-10-20 | bajo-medio | — |
| 0.4 | Un reloj común ✔ | arpegiador, secuenciador, jugadores y lo nuevo en la misma rejilla — HECHO 2026-10-20 | medio | — |
| **1** | **Taller de sonido** | | | |
| 1.1 | Deshacer / rehacer ✔ | probar sin miedo — HECHO 2026-10-17 | bajo-medio | 0.1 |
| 1.2 | Comparar con el guardado ✔ | ¿mi edición mejora el preset? — HECHO 2026-10-17 | bajo | 1.1 |
| 1.3 | Medidor de salida ✔ | margen y trabajo del limitador a la vista — HECHO 2026-10-25 (junto al espectro, en Salida) | bajo-medio | — |
| 1.4 | Biblioteca 2.0 | etiquetas, descripción de uso, buscador, escuchar sin cargar | medio | — |
| **2** | **Expresión y movimiento** | | | |
| 2.1 | Envolvente de modulación con bucle ✔ | ritmos de timbre atados a cada nota — HECHO 2026-10-20 (panel en Secuenciación) | medio | — |
| 2.2 | LFO a tempo, con reinicio y de una vez ✔ | modulación en compás; LFO como envolvente — HECHO 2026-10-20 | bajo-medio | 0.4 |
| 2.3 | Módulo de Pasos (polimetría) ✔ | timbre por pasos, complejo y rítmico — HECHO 2026-10-20 | alto | 0.4, 2.2 |
| 2.4 | Más destinos en la matriz ✔ | niveles del mezclador (vectorial), Drive, Pitch A, Material — HECHO 2026-10-20 (Decay no: ver abajo) | bajo | — |
| 2.5 | Macros de ejecución ✔ | un knob mueve varios destinos — HECHO 2026-10-25 (dos knobs al pie de la Matriz) | bajo | — |
| 2.6 | Respuesta al tacto ✔ | curva de velocity, rango del bend — HECHO 2026-10-25 (barra del teclado) | bajo | — |
| **3** | **Generadores nuevos** | | | |
| 3.1 | Drive con carácter: asimétrico y plegado ✔ | suave/plegado + Asimetría — HECHO 2026-10-20 | bajo-medio | — |
| 3.2 | Sincronización dura ✔ | el barrido de sync clásico — HECHO 2026-10-25 (botón en la cabecera del Osc A) | medio | 2.4 |
| 3.3 | Cuerda física ✔ | cuerdas pulsadas de verdad — HECHO 2026-10-25 (onda Cuerda + módulo Cuerda) | medio | — |
| 3.4 | Distorsión de fase | la síntesis de los Casio CZ | bajo-medio | — |
| 3.5 | Aditiva: editor de armónicos | dibujar el espectro | medio | — |
| **4** | **Carácter y espacio** | | | |
| 4.1 | Delay que se desboca ✔ | autooscilación estable, sirenas dub — HECHO 2026-10-25 (realim. y satur. al pie del Delay) | bajo | — |
| 4.2 | Placa: graves y modulación aleatoria | colas oscuras, menos «chorus» | medio | opcional |
| 4.3 | Phaser | el efecto que falta junto a flanger y chorus | bajo-medio | opcional |
| **5** | **Acompañamiento ligero** | | | |
| 5.1 | Secuenciador: acento, ligadura, slide, repeticiones ✔ | la línea de 303 — HECHO 2026-10-25 (Mayús/Alt/Ctrl + clic en el editor) | bajo | 0.4 |
| 5.2 | Notas por grado ✔ | el patrón sigue a la escala — HECHO 2026-10-25 | bajo-medio | — |
| 5.3 | Acordes que se encadenan | conducción de voces y disposiciones | bajo | — |
| 5.4 | Pulso que respira y swing ✔ | densidad que cambia por compás; swing global — HECHO 2026-10-25 (swing al pie del Arp; Respira y Ciclo en el Pulso) | bajo | 0.4 |
| 5.5 | Arpegiador: modos y repeticiones | convergente, divergente | bajo | 0.4 |
| **6** | **Exportar al DAW** | | | |
| 6.1 | SFZ con bucles y variaciones | samples cortos que sostienen; round robin | medio | 0.2 |
| 6.2 | Exportar el sonido a WAV | un clip listo para el DAW sin grabar en tiempo real | bajo | — |
| **7** | **Fiabilidad** | | | |
| 7.1 | Azar con semilla en los renders offline ✔ | renders repetibles; de paso, key sync del FM 2-op — HECHO 2026-10-20 | bajo-medio | — |
| 7.2 | Huella sonora de la fábrica | ningún preset cambia de sonido sin decidirlo | medio | 7.1 |
| 7.3 | Checks por categoría | ningún preset cuelga voces ni se pasa con acordes | bajo | — |
| 7.4 | Versión de formato | presets y bibliotecas que nunca se cargan mal | bajo | — |
| **8** | **Banco nuevo desde cero + idioma es/en** | solo presets interesantes, útiles, que gusten y sorprendan; synth y banco en español e inglés | medio-alto | 1.4 y lo que haya |

### Orden propuesto

1. **0.1 + 0.2** (una tarde: arreglos que se notan al tocar y al exportar).
2. **1.1 + 1.2** (el taller: deshacer y comparar cambian cómo se diseña).
3. **7.1** y la medida de **0.3** (barato; hace más estrictos los checks de todo lo que sigue). ✔
4. **3.1 + 2.4** (sorpresa barata: plegado y morph vectorial con lo que ya hay). ✔
5. **0.4 → 2.2 → 2.1 → 2.3** (el bloque grande: reloj, LFO a tempo, envolvente en bucle, Pasos). ✔
6. **1.3, 2.5, 2.6, 3.2, 3.3** ✔ (2026-10-25).
7. **Revisado el 2026-10-25** (arriba, «Rumbo acordado»): 4.1, 5.1, 5.4, 5.2; pulir; 1.3.0; 6.1/6.2;
   banco nuevo (8). 1.4 y 7.2-7.4 se deciden al llegar (1.4 encaja con el banco nuevo).

### Cabos sueltos (sin fecha; pequeños o de la recámara)

- **Deshacer en el Editor de ondas**: la tabla dibujada vive fuera de `CONTROLS` y no entra en el
  historial (1.1). Añadirla si se echa de menos.
- **Visualizadores en grande**: osciloscopio y espectro de la cabecera ampliables (recámara antigua);
  encaja con 1.3 (medidor).
- **Escena «Kit 909»**: cuatro partes de percusión con jugadores de Pulso; mejor con el banco nuevo (8).
- **Plegar el makeup del limitador (+1,71 dB) en el margen del máster**: cosmético, no cambia ni una
  muestra.
- **Granular**: aparcado desde el Roadmap 5.0 («para otro momento»).
- **Créditos** al publicar: una línea de agradecimientos en el README y, en el CHANGELOG, @tacowars
  donde entre algo inspirado en sus ideas (ya aparece así en la 1.1.0).

### Decisiones

Aceptadas el 2026-10-17 (las recomendaciones):
1. **5.1** entra: acento, ligadura, slide y repeticiones del secuenciador (figuraba en «Lo que NO
   haremos» como proyecto aparte; el patrón ya admite `7!` y `5~` y el motor los ignora).
2. **0.1** teclado del PC por POSICIÓN física (no por la letra): el diseño tracker queda en el mismo
   sitio en cualquier distribución de teclado.
3. **2.5** macros como fuentes de la matriz (barato). Las que mueven cualquier parámetro con rango y
   curva propios, no por ahora (chocan con deshacer y MIDI learn).
6. **2.3** empieza con 4 carriles × 32 pasos.

5. **Idioma es/en: de la mano del banco nuevo (8)** — así los nombres y descripciones de los presets
   nacen en los dos idiomas y la interfaz se traduce en la misma tanda.

Abiertas (no bloquean nada):
4. **4.2 y 4.3** son opcionales: ¿entran?

### 0 · Arreglos

**0.1 · Teclado sin notas colgadas.** ✔ HECHO 2026-10-17 (detalle en DISENO.md).
- *Hoy* (`ui/keyboard.js`): el `keydown` no mira Ctrl/Alt/Meta, así que Ctrl+Z toca un Do y
  Ctrl+C, un Mi. La nota se archiva por `e.key`: con Shift entre pulsar y soltar llega otra tecla
  (Shift+2 = `"`) y la nota se queda colgada hasta el pánico. No se atienden `pointercancel` (el
  sistema cancela un toque) ni `lostpointercapture`.
- *Qué:* (1) con Ctrl, Alt o Meta pulsados la tecla no es nota; (2) el mapa por posición física
  (`e.code`: `KeyZ`, `Digit2`, `Comma`…): Shift deja de importar y el diseño tracker queda en su sitio
  en AZERTY o Dvorak; (3) cada nota de ratón o dedo archivada por `pointerId`; `pointercancel` y
  `lostpointercapture` la sueltan; `touch-action: none` en las teclas.
- *Verificación:* check «teclado sin notas colgadas»: `keydown Digit2` + `keyup` con `key '"'` → cero
  voces; Ctrl+`KeyZ` → ninguna voz; `pointercancel` suelta.
- *Coste:* bajo.

**0.2 · SFZ con las capas de velocity reales.** ✔ HECHO 2026-10-17 (detalle en DISENO.md; la medida
final es por bandas de tercio de octava, no por el tilt que se proponía aquí: el tilt no veía cambios
en armónicos débiles).
- *Hoy* (`ui/sfzExport.js`): dos capas solo si `filterEnvAmt ≠ 0`. Un preset con velocity → FM por la
  matriz, velocity → filtro por la matriz o sensibilidad en los operadores de FM4 exporta UNA capa y
  pierde el tacto.
- *Qué:* decidir midiendo, no con una lista de parámetros: renderizar la nota de referencia a
  velocity 0,3 y 1, igualar nivel y comparar el tilt espectral (lo que ya hace el check «Velocity en
  FM4»). Si cambia más de un umbral → capas (2 o 3). Así, cualquier destino nuevo de la velocity queda
  cubierto sin tocar el exportador.
- *Verificación:* check que exporta en memoria «E-piano DX (vel→FM)» → ≥ 2 capas; Init → 1.
- *Coste:* bajo.

**0.3 · Tablas de onda sin ruido de interpolación.** ✔ HECHO 2026-10-20 (detalle en DISENO.md). Medido,
el ruido no estaba en los graves sino en el registro medio (−43 dB en Do4): tablas 8× + Hermite.
- *Hoy* (`engine/wavetable.js`): cada mip mide 4× sus armónicos (mínimo 256 muestras) y el worklet
  interpola en línea recta. Con tablas tan cortas el error de la interpolación cae ENTRE los
  armónicos (inarmónico): aspereza en notas graves con muchos armónicos (sierra «Tabla» en C1-C2).
- *Qué:* (1) medir primero: sierra «Tabla» frente a sierra PolyBLEP en C1, C2 y C3, energía fuera de
  los armónicos (FFT) en dB bajo la fundamental; (2) si el suelo pasa de unos −60 dB: tablas más
  largas en los mips con más armónicos (16-22×: memoria ×4-5 por set) o interpolación cúbica de 4
  puntos (Hermite: el lookup cuesta el doble, sin memoria). Se elige por medida: memoria por nodo
  frente a CPU por muestra.
- *Verificación:* check «tabla limpia» con el umbral medido; pares WT antes/después.
- *Coste:* bajo-medio.

**0.4 · Un reloj común.** ✔ HECHO 2026-10-20 (detalle en DISENO.md). Arp y Seq cuentan en PULSOS del reloj;
la tecla de un jugador entra con su instante (no por temporizador). Sigue pendiente: Arp/Seq OFFLINE (van por
setInterval: hace falta para 6.2, exportar a WAV lo que suena en el Seq/Arp). La secuencia de tabla se queda
por voz desde su noteOn (es su gracia), no en la rejilla.
- *Propósito:* todo lo que va a tempo — arpegiador, secuenciador, jugadores y lo que viene (LFO a
  tempo, Pasos, swing) — comparte una rejilla.
- *Hoy:* el Arp y el Seq arrancan cada uno su reloj al pulsar (`currentTime + 0,03`); el director
  (`Conductor`) cuenta pulsos con otro. Cuando un jugador toca una parte con Arp o Seq, la «tecla»
  entra por `setTimeout` y el Arp/Seq arranca donde caiga: fuera de la rejilla del compás.
- *Qué / cómo:* `engine/Clock.js` con el origen (tiempo de audio del pulso 0) y el bpm; `nextGrid(t,
  div)`, `stepAt(t, div)`, `beatAt(t)`. Con Partes y el director en marcha, el origen es el suyo;
  tocando a mano, el origen se fija con la primera nota (sin latencia añadida, como hoy) y se
  conserva mientras algo suene a tempo. El Arp y el Seq calculan su paso siguiente con `nextGrid`,
  no desde «ahora». Un cambio de bpm reancla el origen en el pulso actual, sin saltos.
- *Encaje:* `Arp.js`, `Seq.js`, `WaveSeq.js`, `Conductor.js`; el bpm ya es común (la Sala).
- *Verificación:* check con jugador + Seq: los pasos caen en múltiplos exactos de la división desde
  el origen del director (|Δ| < 1 muestra); tocando a mano, la primera nota sin retraso.
- *Coste:* medio. Es la base de 2.2, 2.3, 5.1, 5.4 y 5.5.

### 1 · Taller de sonido

**1.1 · Deshacer y rehacer.** ✔ HECHO 2026-10-17 (detalle en DISENO.md).
- *Propósito:* diseñar sonidos es probar y volver; sin deshacer, se prueba con miedo.
- *Qué:* Ctrl+Z / Ctrl+Y (y Ctrl+Mayús+Z); botones ↶ ↷ en la cabecera con lo que deshacen
  («Deshacer Cutoff»). 100 pasos.
- *Cómo:* `ui/undo.js`. Antes de cada GESTO, `snapshot()` (un objeto plano de ~250 claves); al
  acabar, si algo cambió, se apila {antes, después, pantalla, parte}. Un gesto: el arrastre de un
  knob o fader de `pointerdown` a `pointerup`; rueda o flechas agrupadas si llegan a menos de 500 ms;
  el doble clic de reset; elegir en un selector; cargar un preset (deshacerlo devuelve el sonido de
  antes). Deshacer aplica SOLO las claves que difieren (`CONTROLS[k].set`), no `loadState`: no corta
  las notas que suenan. Vuelve a la pantalla donde se hizo el cambio. No entran los gestos de
  ejecución (teclado, rueda, bend, aftertouch).
- *Encaje:* `registry.js` (`CONTROLS`, `snapshot`); el nombre del parámetro ya se lee del DOM para la
  pantalla Salida y sirve para el título del botón.
- *Verificación:* check: un arrastre de cutoff = un paso; deshacer y rehacer restauran; cargar un
  preset y deshacer vuelve al anterior; una nota sostenida sigue sonando tras deshacer.
- *Coste:* bajo-medio.

**1.2 · Comparar con el guardado.** ✔ HECHO 2026-10-17 (detalle en DISENO.md).
- *Propósito:* la tecla «Compare» de los synths de hardware.
- *Qué:* punto de «modificado» junto al nombre del preset, calculado COMPARANDO el estado con el
  preset cargado (si devuelves el knob a su sitio, el punto se apaga); botón «Comparar»: mientras
  está activo suena el preset guardado y, al soltarlo, vuelve tu edición intacta.
- *Cómo:* al cargar, guardar el estado efectivo (con la base aplicada); comparación clave a clave
  con tolerancia para decimales; Comparar aplica diferencias en un sentido y en otro con el mismo
  mecanismo de 1.1, sin tocar el historial.
- *Verificación:* check: editar → punto; devolver → sin punto; comparar ida y vuelta conserva la
  edición.
- *Coste:* bajo.

**1.3 · Medidor de salida.**
- *Propósito:* ver el nivel mientras se diseña — más aún con el mezclador, que suma —: cuánto margen
  queda y cuándo trabaja el limitador.
- *Qué:* en la cabecera, junto al osciloscopio: picos L/R (retención 1 s, caída 24 dB/s, zonas a
  −12 y −1 dBFS), la reducción de ganancia del limitador y un LED «limitador» que se queda encendido
  hasta clicarlo.
- *Cómo:* `limiter-processor.js` ya calcula la ganancia: que mande por su `port`, cada ~50 ms, el pico
  de entrada y de salida y la reducción máxima del intervalo (máximos acumulados: sin coste extra
  por muestra). Barras con `transform: scaleY`, sin transiciones CSS (cuestan hilo principal),
  pintadas solo al llegar un dato y paradas con la pestaña oculta.
- *Verificación:* check: una ráfaga a +12 dB (como en «limitador») enciende el LED y marca > 6 dB de
  reducción; en silencio, −∞.
- *Coste:* bajo-medio.

**1.4 · Biblioteca 2.0: encontrar sonidos.**
- *Propósito:* con ~120 presets de fábrica, dos bancos y los tuyos, encontrar «un pad oscuro y
  lento» en segundos.
- *Qué:* (1) etiquetas por preset (oscuro, brillante, lento, percusivo, evolutivo, metálico, vocal,
  sub, ácido…) y una descripción corta de CÓMO tocarlo («acordes abiertos en Do3-Do5; ataque de
  12 s»); (2) buscador de varias palabras (todas en nombre, etiquetas, categoría o descripción);
  (3) filtros por etiqueta con su recuento (el número = presets que quedarían al elegirla);
  (4) escuchar sin cargar: mantener ▶ en una tarjeta toca una nota (o el acorde de su categoría)
  con ese preset en un motor aparte, sin tocar tu edición; (5) ‹ › de la barra rápida recorren la
  lista filtrada.
- *Cómo:* claves `tags` y `desc` en el preset, fuera de `CONTROLS` (metadatos, no sonido): la
  biblioteca las guarda con el ítem y `snapshot()` no las pisa. Etiquetado inicial de la fábrica a
  mano, categoría a categoría, con el uso previsto que ya se fijó al igualar la sonoridad (una nota
  o acorde de tres).
- *Verificación:* checks del modelo (`Library` sin DOM): búsqueda con todas las palabras,
  recuentos; la escucha no cambia el estado del rack.
- *Coste:* medio.

### 2 · Expresión y movimiento

**2.1 · Envolvente de modulación con bucle.** ✔ HECHO 2026-10-20 (detalle en DISENO.md). Panel «Env mod» en la
pantalla Secuenciación (decisión de Sergio: la banda Voz de Diseño estaba llena); en bucle el sostenido no cuenta.
- *Propósito:* una envolvente libre más para la matriz que además puede REPETIRSE: ritmos de timbre
  atados a cada nota, sin tempo.
- *Qué:* «Env mod» (ataque, decay, sustain, release, curva) como fuente de la matriz, con tres
  modos: normal · bucle (repite ataque + decay mientras la nota está pulsada: un LFO con forma de
  envolvente que arranca con la nota) · disparo (ignora el note-off: la curva completa siempre;
  para percusión con gate corto).
- *Cómo:* normal y disparo = `ConstantSource` por voz con las rampas de `_envSegs` (como la env de
  filtro, que ya es fuente). Bucle = un `AudioBufferSource` por voz con UN ciclo A + D en un buffer y
  `loop = true`, arrancado en `t0` (exactitud de muestra y coste mínimo, como los LFO S&H por
  buffer); al soltar, release desde el valor actual con ancla explícita (como el VCA).
- *Encaje:* `Voice.js` (fuente `envm` en `mxRewire`), `params.js` (`envm*`), panel en Diseño junto a
  Env filtro si cabe en la banda Voz → Salida.
- *Verificación:* check: en bucle con A 10 ms + D 90 ms la fuente repite a 10 Hz exactos (Goertzel
  sobre el destino Amplitud); en disparo, un gate de 20 ms completa la curva. Pares ENVM.
- *Coste:* medio.

**2.2 · LFO a tempo, con reinicio y de una vez.** ✔ HECHO 2026-10-20 (detalle en DISENO.md). Sincro por LFO (selector
por fila) y el modo de fase, uno para todos (global · por voz · reinicio · una vez). De paso: los LFO globales
se quedaban CONGELADOS entre notas (Chrome no procesa lo que no llega a la salida); ahora corren siempre.
- *Qué:* cada LFO con «sincro» (Speed en divisiones: 4 compases … 1/32, tresillos y puntillos) y
  modo de fase: libre (como hoy) · reinicio (cada nota arranca el LFO en su fase 0) · una vez
  (recorre un ciclo y se queda: otra envolvente más).
- *Cómo:* velocidad = bpm / 60 / pulsos de la división; el LFO global se ancla al origen del reloj
  común (su máximo cae en la rejilla). Reinicio y una vez = LFO por voz (los buffers por voz de
  `lfoPhase 'voz'` ya existen) con fase 0 y, para una vez, `loop = false`.
- *Verificación:* check: a 120 bpm y 1/8 el LFO va a 4 Hz con el máximo en la rejilla (± 1 ms); en
  una vez, fijo tras un ciclo.
- *Coste:* bajo-medio. Depende de 0.4.

**2.3 · Módulo de Pasos (polimetría).** ✔ HECHO 2026-10-20 (detalle en DISENO.md). Panel en la banda de abajo de
Secuenciación (decisión de Sergio). Ojo a la cuenta de abajo: 240 semicorcheas son 15 compases, no 30.
- *Propósito:* el pendiente del Roadmap 6.0: el timbre moviéndose por PASOS, con ritmo, complejo sin
  dejar de ser rítmico. Carriles simples de longitudes distintas solo vuelven a coincidir tras
  muchos compases: 16 · 12 · 5 pasos → mcm 240 (30 compases en semicorcheas).
- *Qué:* 4 carriles; en cada uno: longitud 1-32 pasos; división (1/32 … 1 compás, tresillos); valor
  por paso −1..+1 dibujado con el ratón; suavizado (0 = escalón con una micro-rampa de 4 ms contra el
  clic … 1 = curva); rotación y deriva de la rotación (un paso cada N compases: el desfase de Reich).
  Cada carril es una FUENTE de la matriz en dos sabores: «Pasos 1» (señal continua: el escalón mueve
  también una nota sostenida) y «Pasos 1 · nota» (el valor se fija al empezar cada nota y la
  acompaña entera: correcto en polifonía y sin escalones dentro de una nota; para arpegios y
  plucks). Reinicio común de todos los carriles (al empezar a tocar / cada N compases / nunca) y un
  rótulo «el ciclo completo dura 30 compases».
- *Cómo:* `engine/Steps.js`; los patrones en claves planas («0.5 -1 0 …», como `wsPat`): presets,
  MIDI learn y Reset sin casos especiales. Continuo = un `ConstantSource` por carril y motor,
  programado en el look-ahead del reloj común (`setValueAtTime` + rampa corta) y conectado por la
  matriz como los LFO globales. Por nota = fuente escalar por voz (como «S&H por nota» en
  `_mxConsts`), leída con el paso del reloj en `t0`. Lo aprendido: no conectar a parámetros de los
  biquads salvo que se use (coeficientes por muestra).
- *Encaje:* pantalla Secuenciación, junto a Arp, Seq y la secuencia de tabla. La secuencia de tabla
  se queda como está (compatibilidad) y un carril sobre «Wavetable» la generaliza. Con 2.1 y 2.2
  completa el trío del movimiento: envolvente que repite, LFO a tempo, pasos. Una puerta de volumen
  a tempo (trance gate, bombeo) es un carril sobre Amplitud.
- *Verificación:* checks: (1) la escalera de un carril en el tiempo (portadora por destino
  Amplitud: valores y tiempos exactos); (2) 16 · 12 · 5 vuelven a coincidir en el paso 240; (3) «por
  nota» mantiene el valor toda la nota; (4) suavizado 0 sin clic (salto máximo entre muestras
  acotado). Pares PASOS 1-6 (pad quieto / con tres carriles; arpegio sin y con «por nota»).
- *Coste:* alto. Depende de 0.4 y 2.2.

**2.4 · Más destinos en la matriz.** ✔ HECHO 2026-10-20 (detalle en DISENO.md): niveles A, B, Ring y ruido,
Drive, Pitch A y Material (reafina los modos; sus pesos siguen al knob). Un nivel bajo 0 invierte la
fase y se deja (AM por cero). Decay NO: Q lineal frente a un knob en log y el refuerzo ∝ √Q del ruido.
- *Qué:* los niveles del mezclador (Osc A, Osc B, Ring, Ruido) → morph vectorial entre fuentes con
  un LFO, una envolvente o los Pasos; Drive; Material y Decay del resonador; Pitch solo de A (para el
  barrido de 3.2).
- *Cómo:* los nodos existen (`gA`, `gB`, `ringX`, `noiseGain`, `dvPre`, el banco modal); la matriz
  suma sobre su AudioParam con su escala (`MX_SPAN`). Un nivel modulado por debajo de 0 invierte la
  fase y suena igual de fuerte: fuentes unipolares o recorte (a decidir midiendo).
- *Verificación:* check por destino (se mueve lo que dice); pares VEC (dos osciladores fijos / los
  mismos con un LFO lento sobre los niveles).
- *Coste:* bajo.

**2.5 · Macros de ejecución.**
- *Qué:* 2 (o 4) knobs «Macro» guardados en el preset y aprendibles por MIDI, como FUENTES de la
  matriz (igual que la rueda o la expresión): un solo knob abre el filtro, sube el drive y baja la
  reverb a la vez, cada uno con la cantidad de su slot.
- *Cómo:* claves `macro1`/`macro2` (0..1) en `PARAMS`; fuente constante por motor (como
  `AudioEngine.perf` para rueda, aftertouch y expresión, que no se guardan; estas sí).
- *Coste:* bajo. (La alternativa — macros que mueven cualquier parámetro — en Decisiones.)

**2.6 · Respuesta al tacto.**
- *Qué:* curva de velocity (suave · lineal · dura) para MIDI y ratón; rango del pitch bend por preset
  (±2 por defecto, ±12 para bajos y efectos).
- *Coste:* bajo.

### 3 · Generadores nuevos

**3.1 · Drive con carácter: asimétrico y plegado.** ✔ HECHO 2026-10-20 (detalle en DISENO.md). En vez de tres
modos, «carácter» suave | plegado + knob Asimetría (el sesgo, en los dos): suave + Asimetría = el asimétrico.
- *Propósito:* dos colores que un filtro no da. Asimétrico: armónicos PARES (el cuerpo «torcido» de
  los bombos y las válvulas). Plegado: la síntesis de la Costa Oeste (Buchla) — al subir la ganancia
  la onda se dobla sobre sí misma y los armónicos aparecen y se mueven de forma no lineal; un
  barrido que no se parece a ningún filtro.
- *Qué:* selector «Carácter» en el Drive: suave (tanh, el de hoy) · asimétrico (sesgo:
  `y = f(g·x + b) − f(b)`: sin continua y con silencio exacto) · plegado (pliegue senoidal con
  «Simetría»). El Drive modulable por la matriz (2.4) = barridos de plegado con LFO, envolvente o
  Pasos.
- *Cómo:* la cadena `dvPre → WaveShaper → dvPost` de siempre; curvas nuevas compartidas (como
  `DRIVE_CURVE`) con rango de entrada amplio (el pliegue necesita ±8); sobremuestreo 4x en el
  plegado; el sesgo, un `ConstantSource` sumado delante del shaper.
- *Verificación:* check: asimétrico con 2º armónico > −30 dB y continua < −80 dB; plegado con el
  brillo subiendo de forma NO monótona con la ganancia; silencio exacto con entrada 0. Pares DRV.
- *Coste:* bajo-medio.

**3.2 · Sincronización dura (hard sync).**
- *Qué:* «Sync» en el Osc A: A reinicia su ciclo con cada ciclo de B. Barriendo el tono de A (pitch
  env, Pasos o LFO sobre «Pitch A») sale el chillido clásico del lead de sync.
- *Cómo:* los osciladores son nodos separados, pero el esclavo no necesita OÍR al maestro, solo su
  tiempo: A lleva dentro una fase «fantasma» a la frecuencia de B (nota × octava y detune de B, que
  se le pasan) y reinicia su fase al cruzarla, con la corrección PolyBLEP del salto (como ya hace
  en las aristas).
- *Verificación:* check: con A a 1,5× B, la fundamental es la de B; sin aliasing por encima de
  −60 dB. Pares SYNC. **Hecho:** los −60 dB no eran realistas con PolyBLEP (la sierra libre ya
  está en −43 a Do4); criterio: tan limpio como el oscilador libre a su altura (ver DISENO).
- *Coste:* medio. Depende de 2.4 (Pitch A).

**3.3 · Cuerda física (Karplus-Strong extendido).**
- *Propósito:* una familia nueva: cuerdas pulsadas que se apagan como las de verdad (cada armónico a
  su ritmo), con la fuerza de la pulsación cambiando el brillo.
- *Qué:* onda «Cuerda»: excitación de ruido filtrada por la velocity; línea de retardo afinada a la
  nota (afinación fina con allpass fraccional); filtro en el bucle (Brillo, Decay); posición de
  pulsación (peine: cerca del puente, metálico; al centro, redondo); Rigidez (dispersión con
  allpass: cuerdas de piano, campanas).
- *Cómo:* en `pulse-processor.js`, un tipo más con su buffer de retardo por instancia (2205
  muestras bastan hasta 20 Hz); reutiliza octava, detune y glide (la longitud sigue al tono).
- *Verificación:* check: afinación ± 2 cents en C2-C6; la fundamental dura más que el 5º armónico;
  velocity 0,3 frente a 1 cambia el brillo. Pares CUERDA.
- *Coste:* medio.

**3.4 · Distorsión de fase.**
- *Qué:* onda «Fase» (los Casio CZ): un coseno leído con la fase deformada; un knob «Forma» barre de
  seno a sierra o pulso, y las formas «resonantes» imitan un filtro resonante sin filtro. Modulable
  (destino «Forma»).
- *Cómo:* en `pulse-processor.js`; «Forma» como AudioParam a-rate (como la PW). Banda limitada por
  PolyBLEP o mips según la forma (a medir).
- *Coste:* bajo-medio.

**3.5 · Aditiva: editor de armónicos.**
- *Qué:* el Editor de ondas gana un modo «Armónicos»: dibujas las amplitudes de los armónicos 1-64
  en barras en vez de la forma de onda; la tabla «usuario» se genera desde ese espectro (la tubería
  de tablas ya trabaja con espectros). Dos espectros dibujados y el morph = timbres que respiran. Es
  la parte «editor de armónicos» del W3 aplazado.
- *Coste:* medio.

(Sin fecha: granular, aparcado desde el Roadmap 5.0.)

### 4 · Carácter y espacio

**4.1 · Delay que se desboca (dub).**
- *Qué:* «Saturación» dentro del bucle del delay y realimentación hasta 1,1: por encima de 1 el eco
  crece hasta que la saturación lo sujeta y se queda autooscilando a nivel estable (las sirenas del
  dub); Damp y Wow siguen dentro del bucle.
- *Cómo:* un WaveShaper (tanh) en la realimentación de la Sala (un `DelayNode` admite ciclos); con
  la tanh dentro, la amplitud del bucle queda acotada por construcción.
- *Verificación:* check: con realimentación 1,1 el nivel se estabiliza (< 1,5 dB de variación entre
  los segundos 5 y 10) y sin NaN; con saturación 0, el delay de hoy, idéntico. Pares DUB.
- *Coste:* bajo.

**4.2 · Placa: graves y modulación aleatoria** (opcional).
- *Qué:* decay propio de los graves (×0,5 … ×2: salas oscuras, o cortas de graves para no
  embarrar) y la modulación de los allpass del tanque con ruido suavizado en vez de senos a 1 y
  0,95 Hz (menos «chorus» en colas largas).
- *Cómo:* `plate-processor.js`: un cruce de bandas en el tanque con su factor; ruido suavizado con
  semilla. La placa ya no calcula en silencio.
- *Verificación:* RT60 por bandas medido; pares PL.
- *Coste:* medio.

**4.3 · Phaser** (opcional): 4-8 etapas allpass con realimentación y LFO, junto a Flanger y Chorus.
*Coste:* bajo-medio.

### 5 · Acompañamiento ligero

**5.1 · Secuenciador: acento, ligadura, slide y repeticiones** (DECISIÓN 1).
- *Hoy:* el patrón ya admite `7!` (acento) y `5~` (ligadura); `Seq.js` (`_tick`) los ignora.
- *Qué:* `!` = más velocity + fuente de matriz «Acento» (el preset decide qué hace un acento: abrir
  el filtro, más drive…); `~` = ligadura (la nota continúa sin redisparar); `/` = slide (en Mono,
  legato con glide hacia la siguiente: el 303); `x2`…`x4` = repeticiones dentro del paso.
- *Coste:* bajo. Depende de 0.4.

**5.2 · Notas por grado.** ✔ *HECHO 2026-10-25 (selector junto a las frases).* Opción del Seq «grados»: los números son grados de la escala (la de la
Armonía con Partes, o una elegida en el Seq). «0 2 4 2» suena en mayor, dórico o pentatónica sin
reescribirlo; pasar del último grado sube de octava, no se recorta. *Coste:* bajo-medio.

**5.3 · Acordes que se encadenan.** El jugador «acorde» mantiene las notas comunes entre acordes y
mueve las demás al tono más cercano (conducción de voces), con disposiciones: cerrada, drop 2,
abierta, por cuartas. Hoy redispara en posición cerrada en cada cambio. *Coste:* bajo.

**5.4 · Pulso que respira y swing.** El Pulso euclídeo con k entre un mínimo y un máximo que cambia
por compás (una onda de N compases o un paseo); swing global 50-75 % aplicado por el reloj común a
Arp, Seq, jugadores y Pasos. *Coste:* bajo. Depende de 0.4.

**5.5 · Arpegiador:** modos convergente y divergente, swing (5.4) y repeticiones. *Coste:* bajo.

### 6 · Exportar al DAW

**6.1 · SFZ con bucles y variaciones.**
- *Qué:* (1) loop points automáticos en los sonidos sostenidos (en el sostenido, el tramo de
  periodos enteros con menor discontinuidad + fundido): samples cortos y notas que sostienen lo que
  haga falta en el sampler; (2) round robin (2-3 variantes por nota) en presets con azar (drift,
  S&H, ruido, fases libres): el sampler no repite la misma muestra; (3) las capas de 0.2.
- *Verificación:* check: el bucle no salta más del umbral; el `.sfz` lleva `loop_start`/`loop_end` y
  `seq_length`.
- *Coste:* medio. Depende de 0.2.

**6.2 · Exportar el sonido a WAV.** «Exportar WAV» renderiza offline el preset tocando una nota, un
acorde o lo que suene en el Seq/Arp durante N compases, con su cola: un clip listo para arrastrar al
DAW, sin grabar en tiempo real. *Coste:* bajo.

### 7 · Fiabilidad

**7.1 · Azar con semilla en los renders offline.** ✔ HECHO 2026-10-20 (detalle en DISENO.md). El
azar de los 10 dB era la fase del modulador FM 2-op, sorteada en cada nota también en directo
(hasta 7,7 dB entre Do4 iguales): ahora arranca en la fase de la portadora (key sync, como FM4).
(Visto al medir 0.2: varios presets FM difieren
hasta 10 dB de un render a otro; averiguar de dónde sale ese azar.) El ruido, el punto de arranque del Golpe, la
deriva, el S&H y las fases libres salen de un generador con semilla cuando el motor es offline (en
directo, el azar de siempre). Renders repetibles: checks más estrictos y la huella de 7.2.
*Coste:* bajo-medio.

**7.2 · Huella sonora de la fábrica** (opcional). Cada preset renderizado con un guion incómodo
(notas fuera de la frontera de bloque, un glide, un note-off temprano) → una huella compacta (energía
por bandas cada 50 ms) en un JSON. Con los presets fuera de las restricciones, NO sirve para
proteger el banco: es una alarma de cambios que nadie buscaba durante un refactor (el reloj común,
por ejemplo, no debería cambiar el sonido de nada). Un cambio buscado la renueva sin más
(`?selftest=1&huellas=renovar`). No bit a bit: Chrome suma las entradas de un nodo en orden no fijo
(medido: ~1e-8). *Coste:* medio. Depende de 7.1.

**7.3 · Checks por categoría.** Todo preset sostenido suena en su registro; tras el release quedan
cero voces vivas; pads y cuerdas con un acorde de 4 bajo el techo (hoy «margen» lo mide para seis).
*Coste:* bajo.

**7.4 · Versión de formato.** Presets, biblioteca y escenas con su número de formato. Un fichero de
un formato que no se entiende (más nuevo, o uno viejo cuya conversión no compensa) se lista con
Exportar y Borrar, pero nunca se carga a medias ni sonando a otra cosa (rechazar sin destruir). Las
conversiones baratas (v1 → v2, Mix → niveles) en una tabla ordenada. Pedir almacenamiento persistente
(`navigator.storage.persist()`) para que el navegador no vacíe la biblioteca por falta de espacio.
*Coste:* bajo.

### 8 · Banco nuevo desde cero (idea futura; el idioma se decidió aparte: solo inglés, antes)

- *Propósito:* sustituir el banco de fábrica actual (que creció bloque a bloque, muchas veces como
  demostración de cada mejora) por uno pensado entero: solo presets interesantes, útiles, que gusten
  y que sorprendan.
- *Cuándo:* cuando el synth tenga lo de las fases 2 y 3 (Pasos, envolvente en bucle, generadores
  nuevos), o antes si un cambio del motor deja el banco actual sin sentido.
- *Cómo:* criterios por escrito antes de empezar (qué hace bueno a un preset: tocable, con un uso
  claro, que enseñe algo del synth); cada preset con etiquetas y descripción de cómo tocarlo (1.4);
  la sonoridad igualada por medida (como en la 1.1.0); los pares A/B de `subsdj-demos.json` siguen
  siendo el sitio de las demostraciones técnicas, separados del banco. El banco actual se retira
  (como mucho, exportado una vez a un JSON por si se quiere recuperar alguno).
- *Idioma — SUPERADO el 2026-10-25: solo inglés, traducción entera antes del banco (punto 5 del
  rumbo).* Lo que se pensó entonces: capa de textos de la interfaz (`t()` y los textos en tablas aparte;
  ids, claves de parámetros y campos JSON intactos; «jugador» → «músico» como etiqueta) y el banco
  nuevo escrito ya en los dos idiomas: nombre, descripción de cómo tocarlo y etiquetas con su
  versión inglesa en el propio preset (las etiquetas como ids traducidos por tabla, para que buscar
  funcione en cualquier idioma). Así cada preset se escribe una vez, no se traduce después.
- *Coste:* medio-alto (diseño y oído en el banco; la capa de textos es mecánica pero toca toda la UI).
- **Lo que pide Sergio (2026-10-25), para su plan propio cuando lleguemos:**
  - Antes de nada, el banco actual entero a un JSON de copia, como referencia.
  - Presets ricos, sólidos, contundentes y útiles, organizados por categorías, que exploren y
    exploten lo que el synth sabe hacer; un banco limpio en el que cada preset diga algo y se
    pueda usar. No es obvio ni es solo trabajo de máquina: plan con objetivos clásicos y no tan
    clásicos, inspirado en bancos de synths conocidos, y ver hasta dónde se llega (quizá con
    ayuda de un modelo para explorar). Aviso del compañero de Windsor: un banco bueno es
    difícil; en el suyo muchos presets suenan parecido.
  - Demos y pruebas FUERA del banco principal: cargables desde su .json, pero no sembradas en la
    biblioteca.

---

# Planes anteriores (histórico)

Fecha: 2026-10-04 · **Roadmap 6.0 en exploración** (sección propia más abajo): el Grano se probó y se
DESCARTÓ; la dirección buscada son sonidos complejos y escalonados (modulación por pasos); presets
«Escalonados» con lo que ya hay; el módulo de Pasos, pendiente de que Sergio lo vea claro.
**Roadmap 5.0 «cinescape» acordado el 2026-10-03** (sección propia más abajo;
bloques 1 a 5 y 7 HECHOS y en master (`bbba744`), selftest 162/162; el 6 granular APARCADO «para otro
momento»). Estado anterior (2026-09-27): Roadmap 4.0 acordado el 2026-09-10 (DISENO.md); hechas **A1 delay de
cinta** (`1db2a19`), **B1 FM en la matriz + feedback** (`8978cd6`), **C1 Partes + mezclador**
(`12b71f6`), **C2 Armonía + jugadores** (`f06fa8b`), **C3 Arreglo + escenas** (`8bf1f8e`) y
**A2 Reverb de placa** (`0b77967`), **B2 Oscilador FM4** (`a4d20a4`) y **A3 Curva de envolvente**
(2026-09-27), **13a Pantallas**, **11 runner en `tools/`** y **13b Biblioteca de presets** (2026-09-27); selftest 120/120. Los ejes B y C están
COMPLETOS y del eje A solo queda A4. Fuera del plan:
notas colgadas + Pánico (`4e2b47e`), cuatro
escenas en `escenas/` (`c718c63`; la placa en las dos ambientales, `29f172d`). Este documento
complementa a DISENO.md: allí
vive el roadmap resumido; aquí, cada bloque pendiente con su **propósito**, qué haremos, cómo,
cómo lo verificamos, qué cuesta y de qué depende. Cuando un bloque se termina se marca ✔ aquí
y en DISENO.md.

El orden de la lista es **por lo que más nos da → lo que menos**. El orden de EJECUCIÓN es otro
y va aparte, porque conviene meter primero los baratos.

## Vista rápida

| # | Bloque | Qué nos da | Coste | Depende de |
|---|--------|------------|-------|------------|
| 1 | **C1 Partes + mezclador** ✔ | la puerta a todo lo generativo: 4 presets sonando a la vez — HECHO | alto (arquitectura) | — |
| 2 | **C2 Armonía + jugadores** ✔ | la musiquita: sonido que se hace solo y suena musical — HECHO | alto | — |
| 3 | **C3 Arreglo + escenas** ✔ | ambient de verdad: evolución lenta, sesiones reproducibles — HECHO | medio | — |
| 4 | **A2 Reverb de placa** ✔ | el «suena fino» más grande; la sala donde vive el ambient — HECHO | alto (DSP) | — |
| 5 | **B1 fmIndex en la matriz + feedback** ✔ | pluck, campana y tacto DX por casi nada — HECHO | bajo | — |
| 6 | **B2 Oscilador FM4** ✔ | la FM completa: 4 operadores y algoritmos — HECHO | alto | — |
| 7 | **A3 Curva de envolvente** ✔ | ataques y decays que suenan naturales — HECHO | bajo | — |
| 8 | **A4 Filtro BP + notch** ✔ | selector Tipo LP↔HP / BP / Notch; Goertzel: notch −39 dB, BP +23,7 dB; morph 50 % = notch a −6 dB (RMS ×0,500) — HECHO 2026-09-28 | bajo | — |
| 9 | **LFO con S&H y deriva** ✔ | formas S&H y deriva en el botón de cada LFO (buffers en loop, playbackRate = Speed; salida fija `out`); 3 presets + pares LFO 1-6 — HECHO 2026-09-28 | bajo-medio | — |
| 10 | **Piel del rack** ✔ | temas por tokens: tokens + check «piel», knob y slider publican `--pos`, selector leído de las hojas, temas «Cinescapes» (base) y «Clásico» — HECHO 2026-09-28 (4 commits) | medio | — |
| 11 | **Runner headless en el repo** ✔ | selftest y capturas sin depender de la sesión — HECHO (`tools/`) | bajo | — |
| 12 | **Recámara antigua** | swing del arp, loop points SFZ, W3 expresiones | — | — |
| 13 | **Pantallas + biblioteca de presets** ✔ | que el synth vuelva a ser disfrutable: ver solo lo que toca; presets que se pueden ordenar, podar y querer — HECHO (13a y 13b) | 13a bajo · 13b alto | — |
| 14 | **Percusión: kit 808/909 + flam de palmada** ✔ | 9 presets (bombo 909, caja 808, palmada, rimshot, cencerro, hat abierto, crash, ride, hit rave) con niveles medidos + knobs Golpes/Hueco en el ADSR (el tren de ráfagas del clap 808: `Voice._flam`); check «flam de palmada» y pares PRC 1-4; tras prueba de oído, bombo y caja rediseñados (envolvente de brillo FM4 + Curva 1 en toda la categoría); bug del reloj de operadores FM4 arreglado (t0 en el worklet), look-ahead adaptativo (5 ms + 2·baseLatency) y el hallazgo final: el golpe ES el escalón → ataque 0 + puerta de arranque en el worklet + t0 en frontera de bloque (golpes idénticos en directo) — HECHO 2026-10-01 | bajo | — |

**Orden de ejecución acordado:** ~~B1~~ → ~~C1~~ → ~~C2~~ → ~~C3~~ → ~~A2~~ → ~~B2~~ (ejes B y C completos);
→ ~~A3~~ → ~~13a~~ (pantallas, 2026-09-27) → ~~11~~ (runner en `tools/`, de paso) → ~~13b~~ (biblioteca,
2026-09-27; el bloque 13 completo). **10 (piel) COMPLETO el 2026-09-28** (1 tokens → 2 knob con arco → 3 selector → 4 temas) → **A4 ✔ (2026-09-28)**.
**9 ✔ (2026-09-28). 14 (percusión + flam) ✔ (2026-10-01). Siguiente: la recámara (12) — visualizadores en grande, swing del arp, loop points SFZ, W3.** Después A4 y 9 como
tardes sueltas. Queda también la recámara (12).

**Método de siempre en cada bloque:** selftest en verde antes y después; si la mejora es audible,
pares A/B en `subsdj-demos.json` con prefijo propio y sonda `?selftest=1&demos=PREFIJO`; si es
visual, capturas CDP; commit por hito; DISENO.md y este plan al día.

## Decisiones abiertas (te tocan a ti)

1. **«Sala» como módulo de escena (C1).** ✔ DECIDIDA el 2026-09-25: opción (b), sala global por
   envío, hecha en C1. El razonamiento, para el recuerdo: un preset mezcla dos clases de parámetros: los del
   INSTRUMENTO (voz, inserciones, arp/seq/ws y los envíos `reverbMix`/`dlyAmt`) y los de la
   SALA (`reverbSize`/`Damp`/`Pre`, tiempo/sync/realimentación del delay, `bpm`, `master`). Con
   cuatro partes y una sola reverb compartida solo puede haber una sala. Opciones: (a) «el
   último preset cargado manda» — cargar un bajo en la parte 2 encoge la catedral de la parte 1;
   (b) la sala sale del preset a un módulo global de la escena; los presets conservan sus envíos;
   con Partes apagadas todo como hoy. **Recomendada: (b).** Es lo que hacían los
   multitímbricos de los 90 (la Performance tiene la reverb, cada Part su envío).
2. **CSS de las filas `tight`** (hecho de paso en A1): los `.ctl` reparten el ancho en vez de medir
   62 px fijos, así caben 5 knobs en una fila (Delay, y de paso el Env filtro, cuya R saltaba
   abajo). Aceptar o revertir (una línea en `css/style.css`).
3. **Escucha de A1:** preset «Dub de cinta» y pares DLY 1/2 (damp) y DLY 3/4 (wow) del banco de
   demos. Si el recorrido de Damp (LP hasta 1,2 kHz, HP hasta 200 Hz) o el wow (±2,5 ms) te
   parecen cortos o largos, son constantes al principio de `Sala.js` (vivían en
   `AudioEngine.js` hasta C1).
4. ✔ Resuelta en C1: 4 ranuras genéricas (constante `N_PARTS` en `engine/parts.js`) y casilla
   «Capa» en el mezclador para que el teclado toque todas las partes.
5. ✔ **13b · biblioteca de presets** — DECIDIDAS el 2026-09-27 (el usuario aceptó las tres
   recomendaciones) y hechas ese mismo día. (a) ¿Los de fábrica se BORRAN de la
   biblioteca, con «volver a traer de fábrica» como red, o solo se ocultan? **Recomendada: borrar
   con la red** — es lo que pide «quedarse con lo que le gusta»; ocultar es un borrado que no
   libera la lista. (b) ¿Las escenas (`escenas/*.json`) entran como sección propia? **Recomendada:
   sí**, sección «Escenas» con la misma tarjeta (cargar = ⇧ Escena del módulo Arreglo); así hay un
   solo sitio donde buscar. (c) ¿La barra rápida de Diseño recorre la biblioteca entera o solo una
   sección «activa»? **Recomendada: entera**, con los optgroups = secciones y los favoritos
   primero: ‹ › y el Program Change MIDI siguen recorriendo todo, como hoy.

## Hecho fuera del plan (2026-09-26/27)

- **Panel fijo** (propuesto por Sergio, 2026-10-12; rama `ui-panel`): el rack que refluía pasa a ser un
  instrumento de 1920 × 1000 escalado a la ventana (`ui/frame.js`), Diseño entero a la vista sin scroll
  (bandas Fuente / Voz / Modulación-efectos en el orden de la señal), selectores giratorios
  (`ui/rotary.js`), conmutadores con LED, faders en las envolventes, banco de LFOs, pantalla Salida
  (`ui/display.js`); fuera `ui/groups.js` y los filtros `data-screens`. Check «pantallas» con «nada
  recortado» y check «canvas»; 170/170. Detalle en DISENO.md («Panel fijo, pantallas y cabecera»).
- **Dependencias** (2026-10-12, misma rama): `ui/deps.js` apaga (atenuado, tocable, con motivo en tooltip y en
  la pantalla Salida) lo que no hace nada con la configuración actual; check «dependencias»; 171/171.
  El check del resonador, inestable, ya es determinista (2026-10-12): medía ruido con un Goertzel (un
  sorteo de Rayleigh; el cociente de dos fallaba ~7 % en 30 repeticiones, y Material y glide tenían el mismo
  defecto); ahora corta el ruido con la nota pulsada y mide la cola libre de los modos (τ = Q/(π·f):
  0,731 / 0,530 s medidos frente a 0,730 / 0,530). Probado rompiendo el resonador: lo detecta.
- **Rendimiento** (2026-10-12, misma rama; «Coro humano» con muchas teclas se cortaba): filtro sin modulación
  conectada si no la usa, drive bajo demanda, Vocal en k-rate y sin WaveShapers si la vocal no se mueve
  (voz −40 %; acordes encadenados 85 % → 67 %) y presupuesto de CPU común a las partes (colas primero, nunca
  la nota sostenida de otra parte); check «presupuesto de voces»; 172/172. El Master se probó delante del
  limitador y se dejó detrás (clipeaba). PENDIENTE de escuchar: compensación de ganancia desde 2 notas.
- **Escenas en capa** (2026-10-12, misma rama; «clipea bastante pronto»): efectos de inserción bajo demanda
  (motor en reposo 3,8 → 2,5 %), el presupuesto cuenta el coste fijo de los motores (en directo: 28,4 de 30,
  13 voces vivas como mucho) y limitador nuevo en worklet (brickwall con lookahead de 6 ms, techo −1 dBFS,
  lineal +1,71 dB debajo como el de Chrome: idéntico en nivel y retraso; apretado, sin aspereza). 172/172.
- **Revisión tras el bloque 13** (sugerencias del usuario, 2026-09-27): cabecera como módulo fijo con
  osciloscopio y espectro (globales, como el teclado); Diseño en grupos por función con título
  (Osciladores / Filtro / Amplitud y modulación / Efectos), cada grupo con su rejilla, plegables
  (clic; doble clic = solo esa); **▶/⏹** en las escenas de la biblioteca (carga + enciende Partes +
  arranca; una sola; ⏹ no apaga las Partes); el **release sigue al knob Curva** (recta a 0, RC a 1;
  antes exponencial fijo τ = r/4 y el gráfico lo dibujaba recto → los presets con Curva 0 sueltan
  ahora en recta); fuera el plegado de módulos (en una rejilla de unidades no liberaba sitio) y el
  aviso «Escena»; sin alturas fijas de 2U. Un medidor «CPU audio» (worklet cronometrando huecos
  entre quanta: Chrome no expone la carga ni performance.now() en el worklet) se probó y se quitó
  a petición del usuario: no medía bien. Respuestas dadas: los presets viven en localStorage (por
  navegador y origen) con la fábrica/repo como semilla; Delay/Reverb son el mismo módulo en Diseño
  y Secuenciación (sala compartida en Partes).
- **Notas colgadas al parar el director** (`4e2b47e`). En partes con Arp/Seq el note-on del
  jugador va por temporizador y, al parar dentro de la ventana de anticipación, el note-off
  llegaba antes: el Arp se quedaba sosteniendo. Ahora los note-on pendientes se cancelan, los
  note-off «ya» son síncronos y parar limpia el latch del Seq. Botón **⏹ Pánico** en la cabecera
  y tecla Escape: paran el director y cortan todo en todas las partes.
- **Cuatro escenas en `escenas/`** (`c718c63`): ambient nocturno, amanecer dórico, techno
  hipnótico y coro robótico. Niveles equilibrados con una sonda offline que renderiza cada parte
  en solo; la quinta del dron se cuantiza a la escala (bug cazado: nota fuera de escala en
  hirajoshi). Las dos ambientales usan la placa (`29f172d`). El selftest las renderiza todas.
- **Cortes con la escena tocando** (reportado por el usuario, 2026-09-27): el blur de la ventana y
  RePág/AvPág llamaban al pánico, que cortaba todas las voces de todas las partes; ahora solo
  sueltan las teclas del teclado. Y los jugadores Acorde/Raíz reponen sus notas en el compás
  siguiente si alguien las cortó (cargar un preset, Reset, poli↔mono, encender el Seq); cambiar la
  semilla en marcha suelta antes las notas. Sonda `probe-focus.mjs`.
- **Nota colgada al cambiar de parte** (reportado por el usuario, 2026-10-01: «cambio de parte
  mientras toco y el audio se corrompe, los instrumentos se interrumpen»): el note-off del
  teclado/MIDI iba a la parte ACTUAL, no a la que recibió el note-on; la nota quedaba colgada en
  la parte anterior (voz ocupada → robo de voz sobre el jugador; en mono, legato resbalando sobre
  ella). `NoteRouter` en `engine/parts.js` manda el off a los motores que recibieron el on (también
  Capa y blur). `Seq.unhold` y `_monoOff` ignoran ids ajenos. Check «teclado ↔ partes», 130/130.
- **Curva de envolvente**: cazado por el usuario al primer uso — `setValueCurveAtTime` no se puede
  cancelar a mitad en Chrome (notas colgadas y caída de la página); ahora cadena de 12 rampas.
- **Herramientas de verificación**, hoy en `%TEMP%\subsdj-tools` (efímeras: de ahí el punto 11):
  `run-selftest.mjs` (selftest headless + pings), `shot.mjs` (captura de un módulo por su título),
  `golden.mjs` (render determinista con `Math.random` sembrado antes y después de un refactor,
  comparación muestra a muestra a 16 bit), `probe-*.mjs` (sondas de la página real: partes,
  jugadores, escenas, notas colgadas, niveles por parte, energía de las reverbs) y `patch2.mjs`
  (reemplazos exactos multi-archivo, todo o nada).

## Detalle por bloque

### 1 · C1 Partes + mezclador

**✔ HECHO 2026-09-25** — selftest 106/106; detalle, medidas y evidencia en DISENO.md.

**Propósito.** Poder echar a andar varios instrumentos (presets) a la vez. Sin esto no existe
nada de lo generativo. No es un multipista: nadie escribe notas.

**Qué haremos.**
- **Parte** = un `AudioEngine` completo en el AudioContext compartido, con su preset, sus voces,
  su Arp/Seq/WaveSeq y sus inserciones (dist, flanger, chorus/ensemble). `init(ctx)` ya acepta
  un contexto externo y el selftest ya instancia varios motores: cuatro partes son cuatro
  motores, no una reescritura.
- **Mezclador**: por parte nivel, pan, envío a delay y envío a reverb. La salida de cada motor
  deja de ir a `ctx.destination` y va al mezclador.
- **Delay y reverb compartidos** (una sola sala) → limitador → máster → analizador. Los knobs
  `reverbMix`/`dlyAmt` del preset se leen como nivel de envío de esa parte.
- **El rack edita la parte seleccionada.** Selector de 4 partes en la cabecera. La única
  indirección: `registry.applyTarget` y las ~14 referencias al singleton `engine` en `ui/`
  pasan por «parte actual». Cambiar de parte = cargar su snapshot en los controles (el mismo
  camino que cargar un preset). Teclado y MIDI tocan la parte seleccionada.
- **Con Partes apagadas el synth es exactamente el de hoy.** Formato de presets intacto.

**Cómo (puntos delicados).**
- Salida configurable del motor (`init(ctx, out)`): hoy `analyser.connect(ctx.destination)`.
- Un solo BPM por escena (hoy vive en el preset): sale a la escena junto con la sala.
- Sala global: ver decisión abierta 1.
- CPU: 4 motores × `MAX_POLY`. Las voces solo existen mientras suenan, y a Mix 0 el banco vocal
  no crea nodos; el coste real son las inserciones de cada parte (siempre vivas) y los dos
  convolvers de la reverb, que pasan a ser uno compartido.
- Módulos de UI que asumen un solo motor: SFZ (exporta la parte seleccionada), grabador
  (captura el máster, vale tal cual), scope/espectro (máster), LEDs de actividad (parte
  seleccionada), MIDI learn (mapa sobre la parte seleccionada: aceptable en v1).

**Evidencia.** Escena offline en el selftest: 4 partes con presets distintos, N compases de
notas programadas; sin NaN, sin clipping, cada parte audible por separado (silenciar las otras
tres y medir pico). Captura del selector y del mezclador.

**Coste.** Alto: es el bloque arquitectónico. Hecho en una sesión.

### 2 · C2 Armonía + jugadores

**✔ HECHO 2026-09-26** — selftest 107/107; detalle, medidas y evidencia en DISENO.md. Los cinco
jugadores del plan quedaron en cuatro modos: Acorde con el Arp de la parte encendido ES el
Arpegio, y Raíz con el Seq encendido ES la Frase.

**Propósito.** Que suene música sin escribirla: cada parte tiene un jugador que decide qué notas
tocar, y una armonía global hace que todo lo que toquen encaje.

**Qué haremos.**
- **Armonía (global):** raíz, escala (mayor, menor natural/armónica, dórica, mixolidia,
  pentatónica mayor/menor, tonos enteros, hirajoshi, blues…) y progresión: lista de grados con
  compases por acorde, o un paseo de Markov sobre funciones tonales (T→S→D→T con
  probabilidades). Todo lo que emiten los jugadores pasa por `aEscala()` y `aAcorde()`.
  Por qué suena musical algo aleatorio: las alturas están acotadas; densidad, registro y ritmo
  hacen el resto.
- **Un jugador por parte**, con parámetros propios:
  - **Pulso**: ritmos euclídeos E(k, n) de Bjorklund (k golpes repartidos lo más uniformemente
    posible en n pasos: E(3,8) es el tresillo cubano, E(5,8) la clave), rotación, probabilidad
    por golpe, acento (velocity). Kick, hat, percusión.
  - **Arpegio**: nuestro Arp actual alimentado con las notas del acorde vigente (el jugador
    «mantiene» esas teclas); octavas y modo como hoy, más probabilidad de saltar pasos.
  - **Melodía**: paseo aleatorio por grados de la escala con gravedad hacia las notas del
    acorde, probabilidad de silencio, proporción paso/salto, registro acotado.
  - **Dron**: sostiene raíz o quinta (una o dos notas), cambia con la progresión, re-dispara
    cada N compases (para que el ataque del preset se oiga).
  - **Frase**: nuestro Seq con la raíz puesta por el acorde vigente (la «tecla mantenida» la
    pone el jugador).
- **Planificación**: el mismo patrón que Arp/Seq (ticker de 25 ms + look-ahead de 120 ms sobre
  el reloj de audio). Cada jugador solo llama a `_directOn(id, freq, vel, when)` /
  `_directOff` de su parte: dedos virtuales, el motor no se entera. Un reloj maestro en
  compases y tiempos derivado del BPM de la escena.

**Evidencia.** Selftest: E(k,n) reproduce patrones conocidos; cuantización: el 100 % de las
notas emitidas están en la escala; escena offline con jugadores (determinista con semilla,
ver C3) sin NaN ni clipping. Pares A/B: mismo preset con jugador Pulso E(3,8) vs E(5,8).

**Coste.** Alto. Hecho en una sesión.

### 3 · C3 Arreglo y escenas

**✔ HECHO 2026-09-26** — selftest 108/108; detalle, medidas y evidencia en DISENO.md. La
«curva de densidad por parte» quedó como un umbral de entrada por parte sobre una sola curva
de energía (más simple de entender y de tocar); las secciones salen solas de los umbrales.

**Propósito.** Que la música evolucione sola a escala de minutos (eso es el ambient: cambio
lento, colas largas, eventos escasos) y que una sesión buena se pueda repetir y guardar.

**Qué haremos.**
- **Reloj maestro** en compases; **curva de densidad** por parte sobre un ciclo largo (p. ej. 64
  compases); **macro «energía»** que escala densidad, velocity y apertura del filtro de todas
  las partes; **silenciar/activar** partes con probabilidad por sección.
- **Deriva lenta**: 1-2 parámetros por parte gobernados por un LFO de minutos (las manos del
  que improvisa): apertura del cutoff, morph de la tabla, envío a reverb…
- **Semilla**: PRNG propio (mulberry32) para todo lo aleatorio de jugadores y arreglo. Misma
  semilla = misma sesión.
- **Escena** = semilla + 4 presets + armonía + sala + jugadores + arreglo → JSON exportable e
  importable (como el banco de presets). Botón «nueva semilla». El grabador ya captura el
  máster: grabar diez minutos de ambient es pulsar ⏺.

**Evidencia.** Dos renders offline con la misma semilla son idénticos muestra a muestra; con
semilla distinta difieren. Escena de demo en el repo.

**Coste.** Medio. Hecho en una sesión.

### 4 · A2 Reverb de placa algorítmica

**✔ HECHO 2026-09-27** — selftest 110/110; detalle, medidas y evidencia en DISENO.md.

**Propósito.** El «suena fino» más grande. Nuestra reverb es convolución con una IR de ruido
generada por código: la cola es estática y granulada. Una reverb algorítmica tiene densidad de
ecos que CRECE con el tiempo y modulación interna que mata los modos metálicos. Es la sala en
la que vivirá el ambient, y lo que más impresionó del synth del compañero.

**Qué haremos.** AudioWorklet `plate-processor.js` con la topología de Dattorro (1997, el linaje
del Lexicon 224): predelay → difusión de entrada (4 allpass en serie) → tanque en figura de
ocho (dos ramas cruzadas: allpass modulado → delay → LP de amortiguación → allpass → delay)
con realimentación = decaimiento; salidas L/R como sumas de taps distintos del tanque. Knobs:
Mix, Size/Decay, Damp, Modulación, Predelay. La convolución se queda como opción «Sala (IR)»
junto a «Placa» (selector en el módulo Reverb).

**Evidencia.** Selftest con impulso: la curva de energía de la cola decae de forma monótona, el
RT60 crece con Size, L y R descorrelados (correlación < 0,5), sin NaN ni realimentación
inestable a Decay máximo. Pares A/B: mismo pad con IR vs placa. Y oído, mucho oído.

**Coste.** Hecho en una sesión: ~150 líneas de worklet + la integración en la Sala; las
longitudes son las del artículo y la calibración (RT60 y nivel) salió de medir, no de oído.

### 5 · B1 fmIndex como destino de la matriz + feedback del operador

**✔ HECHO 2026-09-25** — selftest 105/105; el detalle y las medidas están en DISENO.md.

**Propósito.** La FM estática aburre: el DX7 vive de que el índice de modulación cambie durante
la nota. Con el índice en la matriz: env→índice = pluck y campana (ataque brillante, cuerpo
suave); velocity→índice = el tacto del DX7; S&H→índice = una campana distinta por nota. Y el
feedback del operador acerca el seno a una sierra (el truco del operador 6 del DX7).

**Qué haremos.**
- `MX_DESTS` gana `fm` («FM índice»), `MX_SPAN.fm` = rango del índice; `Voice.mxRewire`
  conecta la ganancia del slot al AudioParam `fmIndex` del worklet (ya existe por voz, k-rate,
  recorta en 0 por su `minValue`).
- Param `fmFb` (0..1) en el worklet: el modulador se automodula con su salida anterior
  (`m = sin(2π·mp + fb·mPrev)`). Knob **Feedback** en el módulo FM.
- LED del módulo FM: activo también si la matriz usa `fm`.

**Evidencia.** Selftest: con env→índice el tilt espectral de los primeros 100 ms es claramente
mayor que el del tramo sostenido; con feedback el espectro gana armónicos (tilt sube). Presets
«Campana DX (env→FM)», «E-piano DX (vel→FM)»; pares FM 1-4.

**Coste.** Bajo: una tarde. Hecho.

### 6 · B2 Oscilador «FM4»

**✔ HECHO 2026-09-27** — selftest 116/116; detalle, medidas y evidencia en DISENO.md.

**Propósito.** La FM completa como FUENTE que luego pasa por nuestro filtro, vocal, matriz y
wave sequencing — lo que el DX7 nunca tuvo. Y entender de una vez los «algoritmos»: un grafo
dirigido de quién modula a quién; las hojas modulan, las raíces suenan.

**Qué haremos.** Tipo de onda nuevo `fm4` en el worklet (como lo fue «Tabla»): 4 operadores
con ratio, nivel, feedback y decay por operador; unos 8 algoritmos elegidos (pila de 4; un
portador con 3 moduladores en paralelo; dos pares; dos portadores con un modulador común;
tres portadores y un modulador…) dibujados como grafos SVG en un selector; el decay por
operador es lo que hace que un modulador brille al ataque y se apague (percusión FM, campanas,
e-pianos). Módulo «FM4» de 2U con 4 columnas. El modo actual (seno + FM 2-op) se conserva.

**Evidencia.** Selftest: cada algoritmo suena, difiere de los demás, sin NaN a índice máximo;
el decay de un modulador se ve como caída del tilt. Presets por familia (bajo, e-piano,
campana, kick FM, hat FM: los cuatro instrumentos del compañero, como demostración).

**Coste.** Hecho en una sesión: ~90 líneas en el worklet (tabla de algoritmos + bucle de 4
operadores), 13 params planos y el módulo FM4.

### 7 · A3 Curva de envolvente

**✔ HECHO 2026-09-27** — selftest 118/118; detalle y medidas en DISENO.md.

**Propósito.** Ataque y decay son rampas LINEALES en amplitud; la sonoridad es logarítmica, así
que un decay lineal «se queda colgado y luego cae de golpe». Las envolventes analógicas son
curvas RC (exponenciales) y por eso suenan naturales. El release ya lo hicimos exponencial por
esta razón.

**Qué haremos.** Param `envCurve` (0 = lineal, 1 = exponencial) aplicado a ataque y decay de
amp y filtro: `setValueCurveAtTime` con una curva potencia, o `setTargetAtTime` con la constante
de tiempo derivada del tiempo del knob. Knob **Curva** en el módulo ADSR; el gráfico de la
envolvente dibuja la curva real.

**Evidencia.** Selftest: la envolvente medida sobre el VCA (RMS por ventanas) sigue la curva
pedida; los presets antiguos (curva 0) no cambian.

**Coste.** Bajo. Hecho en una tarde.

### 8 · A4 Filtro BP y notch explícitos

**Propósito.** Dos tipos de filtro más (los que él tiene y nosotros no) y una demostración: la
suma de los numeradores RBJ de un LP y un HP con el mismo corte da `1 − 2cos·z⁻¹ + z⁻²`, el
notch del cookbook. Nuestro morph al 50 % YA es un notch, a −6 dB.

**Qué haremos.** Selector «Tipo» en el módulo Filtro: **LP↔HP** (el morph de hoy), **BP** (LP y
HP en serie con el mismo corte: paso-banda de 4º orden) y **Notch** (LP + HP en paralelo a
partes iguales, con +6 dB de compensación). Cambio estructural por nota, como la pendiente.

**Evidencia.** Selftest con Goertzel: en Notch la energía en la frecuencia de corte cae más de
20 dB frente a la de un tono lejano; en BP, lo contrario.

**HECHO 2026-09-28.** `filterType` (morph | bp | notch, por nota). Medido (sierra en C3, corte en su 4º
armónico, ventana 0,15-0,55 s): notch −39,0 dB en el corte frente a LP; BP +23,7 dB de corte sobre
fundamental; BP 24 dB +18,6 dB más que 12; morph 50 % / notch = RMS ×0,500 (la demostración del
cookbook, exacta). En BP la resonancia se reparte (mitad por flanco); el notch ignora la pendiente (en
cascada los flancos llegan en fase al corte). Preset «Pad phaser (notch)»; pares FLT 1-6 (diffs
0,92 / 1,12 / 0,61). Selftest 125/125.

**Coste.** Bajo. Prioridad baja.

### 9 · LFO con S&H y deriva como formas de onda

**Propósito.** Hoy los LFOs son osciladores nativos (sin/tri/saw/sqr). Faltan las dos formas que
más se usan en ambient y techno: **S&H** (escalones aleatorios a la velocidad del LFO: el
filtro «random» rítmico) y **deriva** (random suavizado, lento: pads que respiran). Tenemos ya
el S&H por nota en la matriz y el buffer de deriva del módulo Vocal («Vida»): es generalizarlos.

**Qué haremos.** Fuente alternativa por LFO: un `AudioBufferSource` en loop con escalones
aleatorios (S&H) o con la suma de senos sub-Hz normalizada (deriva) a la velocidad del knob,
conmutable con las formas actuales sin tocar las rutas.

**Evidencia.** Selftest: S&H→cutoff produce escalones (derivada del cutoff medido casi siempre
0 con saltos); deriva no tiene saltos.

**HECHO 2026-09-28.** Buffers compartidos por contexto (nodes.js `lfoBuffers`): S&H 128 escalones, deriva
5 senos con ciclos enteros (0,375…1,625 × f) normalizada; `AudioBufferSourceNode` en loop con
`playbackRate = Hz/10`; cada LFO vierte en `out` (±1) y de ahí cuelgan Level y matriz (cambiar de fuente
no recablea). Medido: S&H 73 % de ventanas de 4 periodos quietas; deriva salto máximo 14 % del rango;
matriz lee la forma (diff 0,51). Presets «Lead S&H (filtro random)», «Pad que respira (deriva)», «Bleeps
S&H (pitch random)»; pares LFO 1-6 (diffs 0,40 / 1,23 / 1,38). Selftest 129/129.

**Coste.** Bajo-medio.

### 10 · Piel del rack (fase 3 del Roadmap 3.0)

**Propósito.** Identidad propia: que el SubSDJ se reconozca a primera vista, como el primigenio
con sus tornillos.

**Decidido (2026-09-28).** Nada de motor de skins (CSS libre por selector: impuesto de mantenimiento
× N skins); TEMAS POR TOKENS: el JS publica el estado del control y el CSS decide cómo dibujarlo.
El tamaño no es cosa del tema (knob y `--rackU` van acoplados; la escala es el zoom del navegador).
Referencia visual: Cinescapes Pro (superficies planas carbón, arco de valor en el knob, dos acentos
con significado, botones píldora, tipografía en minúsculas). Pasos:

1. ✔ **Tokens** *(2026-09-28)*: bloque `:root` en style.css (superficies, tinta, acentos, knob, teclado,
   caras con `color-mix()`, sombras, radios, letra); canvas por `ui/theme.js`; check «piel» en el
   selftest (ningún literal fuera de `:root`/`[data-theme]`, salvo negro/blanco con alfa). 121/121.
2. ✔ **Knob con estado publicado** *(2026-09-28)*: knobs.js escribe `--pos` 0..1 en el `.knob`; el CSS gira el
   portador `.ind` (rayita `::before`, punto `::after`) y pinta el arco (`.knob::after`, conic-gradient + mask);
   tokens `--knob-line/-dot/-arc` a 0px apagan cada pieza. Check «knob publica --pos». 122/122.
3. ✔ **Selector de tema** *(2026-09-28)*: `<select>` en la cabecera llenado desde las hojas (un tema = bloque
   `:root[data-theme="id"]` con `--theme-name`; el `:root` base es el tema por defecto); `data-theme` en html,
   localStorage, `?theme=` (shot.mjs: `THEME=id`), evento `theme-changed` + `resize`. Check con tema inyectado. 123/123.
4. ✔ **Temas «Cinescapes»** (base) **y «Clásico»** (bloque) *(2026-09-28)*: Clásico reproduce el look anterior
   solo con tokens (capturas a ≤ 5 niveles); Cinescapes = carbón plano, cian/violeta, punto + arco, carril
   relleno (sliders.js publica `--pos`), píldoras, minúsculas. Tokens nuevos `--knob-face/-edge/-ring/-shadow`,
   `--track-face/-fill`. 123/123. Quedan como capricho opcional: tornillos, placa con logo, LFOs animados.

**Evidencia.** Capturas CDP en ambos temas y a varios anchos; ninguna regresión de ids ni de
`PARAMS↔CONTROLS`.

**Coste.** Medio. Independiente de todo: se intercala cuando apetezca.

### 11 · Runner headless en el repo

**✔ HECHO 2026-09-27** (de paso, con 13a): `tools/run-selftest.mjs` (sale con 1 si hay fallos) y
`tools/shot.mjs` (módulo por título o `pantalla:NOMBRE` entera, con JS previo opcional). Ruta relativa al
script; Chrome por la variable `CHROME` si no está en la ruta habitual. golden/sondas siguen en el temp.

**Propósito.** Verificar sin depender de la sesión de Claude. Hoy el selftest se lanza en
Chrome headless con dos scripts Node que viven en el scratchpad de la sesión (efímero):
`run-selftest.mjs` (servidor estático propio en 8001 que captura los pings, CDP por
`DevToolsActivePort`, imprime resultados, fallos y diffs de pares) y `shot.mjs` (captura PNG de
un panel por el texto de su título). Python no está en el PATH de Git Bash, así que Node es
el camino.

**Qué haremos.** Copiarlos a `tools/` con una nota en DISENO.md (`node tools/run-selftest.mjs
"selftest=1&demos=DLY"`). No es build: el proyecto sigue sin dependencias.

**Coste.** Mínimo.

### 13 · Pantallas y biblioteca de presets (propuesto por el usuario, 2026-09-27)

**Propósito.** El rack tiene ya ~35 módulos: en un monitor 4K está todo lleno y con zoom-out se ve
pequeño y apabullante. No hace falta ver todo en todo momento. Tres pantallas por función, y una
gestión de presets de verdad.

**13a · Pantallas** ✔ **HECHO 2026-09-27** — selftest 119/119 (check «pantallas»); sección «Pantallas»
de DISENO.md; capturas de las tres pantallas. Lo que quedó distinto del plan: la barra rápida vive en
Diseño Y en Presets (guardar/borrar/exportar/importar son sus botones); un aviso «Escena» en
Secuenciación con las Partes apagadas (explica y las enciende); la pantalla Presets estrena una
lista v0 del banco por secciones alimentada del `<select>` (13b la sustituirá por la biblioteca);
el teclado es `position: sticky`. El plan era: pestañas en la cabecera: **Diseño** (crear sonidos: Osc A/B,
Mezcla, FM, FM4, Unison, Tabla de ondas + editor, Vocal, Filtro + carácter, LFOs, Env filtro,
ADSR, Voz·Master, Matriz, Distorsión·Flanger, Chorus, Delay, Espacio, Reverb, Osciloscopio,
Espectro), **Secuenciación** (generar y automatizar música: Arpegiador, Secuenciador,
Tabla·secuencia, Partes/Mezclador, Armonía, Jugador, Arreglo, y Delay/Reverb en su papel de
Sala compartida) y **Presets** (13b). Un módulo puede vivir en varias pantallas: las pantallas
son FILTROS sobre el mismo rack (cada `.panel` lleva `data-screens="diseno secuenciacion"` y
un CSS oculta el resto), no copias. El **teclado** en las tres, fijo abajo, para probar e
improvisar; la barra de presets rápida se queda en Diseño. La pestaña se recuerda en
localStorage; LEDs, plegado y el motor no se tocan. Evidencia: capturas de las tres pantallas y
sonda que comprueba que ningún módulo queda huérfano (todos en al menos una pantalla).

**13b · Biblioteca de presets** ✔ **HECHO 2026-09-27** — selftest 120/120 (check «biblioteca», modelo
sobre almacenamiento falso); detalle en DISENO.md («Grabación, presets y arpegiador» y Roadmap
4.0); capturas de la pantalla con favorito y filtro. Distinto del plan: el arrastre también reordena
dentro de la sección; las escenas son ítems de tipo «escena» en una sección normal («Escenas»);
importar FUNDE (nunca sustituye) y acepta biblioteca, banco v2 o escena; la barra rápida lista toda
la biblioteca con ★ Favoritos primero (‹ › y Program Change saltan ese grupo). El plan era (una o
dos sesiones): hoy la gestión es un selector apretado y
los presets viven en tres sitios: fábrica (código), `subsdj-demos.json` / `subsdj-presets-2.0.json`
(ficheros) y los del usuario (localStorage). Una BIBLIOTECA única (`subsdj.biblioteca.v1` en
localStorage, exportable/importable entera como JSON) con SECCIONES que se crean, renombran y
borran; mover presets entre secciones, borrar, renombrar, favoritos, buscar; los de fábrica y
los ficheros del repo como SEMILLA: se importan a la biblioteca la primera vez (y desde un botón
«volver a traer de fábrica») y a partir de ahí manda el usuario: quedarse con lo que le gusta y
tirar lo que no. Pantalla con lista por secciones, previsualización al pulsar (carga en la parte
que edita el rack; el teclado suena debajo) y arrastrar para mover. El selector rápido y el
Program Change MIDI recorren la biblioteca. Evidencia: selftest del modelo (crear/mover/borrar
secciones y presets, importar/exportar ida y vuelta, migración de los tres orígenes sin
duplicados) y sonda de la pantalla.

**Decisiones, tomadas el 2026-09-27 (punto 5 de «Decisiones abiertas»): borrar con la red de ⟲,
escenas como sección, barra rápida entera con ★ primero.** Eran: ¿los presets de fábrica se pueden
BORRAR de la biblioteca (con
«volver a traer de fábrica» como red) o solo ocultar? ¿Las escenas (`escenas/*.json`) entran
también en la biblioteca, como sección propia? ¿La barra rápida de Diseño muestra la biblioteca
entera o solo una sección «activa»?

### 12 · Recámara antigua (ya en DISENO.md)

- **Visualizadores en grande**: el osciloscopio y el espectro de la cabecera (170×36) ampliables
  cuando haga falta verlos bien (pedido por el usuario «eventualmente», 2026-09-27).
- **Arpegiador**: más divisiones y swing.
- **Escena «Kit 909»**: cuatro partes de percusión (bombo, caja, hat, palmada) con jugadores de
  Pulso E(k,n) — todo existe ya (C1 + C2 + los presets del punto 14); falta componer la escena.
- **Exportador SFZ**: loop points automáticos (hoy nota sostenible ~3 s + release).
- **Wavetable W3**: expresiones `f(x, t)` que generan una familia de frames coherentes, y/o
  editor de armónicos (aditiva pura). Decisión aplazada.

## Roadmap 5.0 «cinescape» (acordado 2026-10-03)

Origen: Sergio, jugando con el synth, no saca «sonidos que llamen la atención»: timbres
interesantes pero clásicos. Quiere lo de las películas: largo, profundo, ambiental, rico en
texturas. Diagnóstico (DISENO.md, sección Roadmap 5.0): tres propiedades que el oído lee como
«sinte de los 80» — LFOs globales (todo se mueve a la vez), constantes de tiempo de instrumento
(ataque ≤ 2 s, release ≤ 3 s, LFO ≥ 0,05 Hz, sala ≤ 4 s) y espectro siempre armónico y estable.
La receta del tutorial (sierra + cuadrada + unísono + LP24 + reverb) es el pad clásico de fábrica.

| # | Bloque | Qué nos da | Coste | Depende de |
|---|--------|------------|-------|------------|
| 1 | **Tiempo ×10 + octava por oscilador** ✔ | la escala del paisaje: 20 s de ataque, 30 s de release, LFOs de minutos, sala de 20 s, delay de 4 s; suboscilador — HECHO 2026-10-03 | bajo | — |
| 2 | **Deriva por voz + fase por voz** ✔ | cada nota del acorde evoluciona por su cuenta: fuente «Deriva (voz)» + selector LFO global / por voz (fase Weyl determinista) — HECHO 2026-10-03 | bajo | 1 |
| 3 | **Shimmer + freeze en la Sala** ✔ | la cola sube octavas y se vuelve coro etéreo (Eno/Lanois, BigSky); freeze = decay ≈ 1 con la entrada cerrada — HECHO 2026-10-03 (bucle calibrado por energía de la reverb) | medio | — |
| 4 | **Fuentes de ejecución** ✔ | rueda, aftertouch y expresión como fuentes de la matriz: el pad se TOCA durante 30 s — HECHO 2026-10-03 (+ rueda en pantalla bajo el teclado) | bajo | — |
| 5 | **Resonadores** ✔ | cuencos, metal frotado, viento sobre cuerdas: banco modal por voz afinado a la nota, Material cuerda↔barra, ruido reforzado ∝ √Q — HECHO 2026-10-03 | medio | 1, 2 |
| 6 | **Granular** | nubes de granos sobre la tabla de usuario o lo último grabado (recorder): lo único que no repite nunca — APARCADO 2026-10-03 («para otro momento») | alto | 1, 2 |
| 7 | **Cinta en máster** ✔ | siseo + wow de pocos ms + saturación suave sobre toda la mezcla: el pegamento degradado — HECHO 2026-10-03 (módulo Cinta, claves de la Sala, exactas a 0) | bajo | — |

**Orden acordado:** 1 → 2 → escuchar → 3 (shimmer) → 4 → 7; 5 y 6 cuando tiempo y decorrelación estén
resueltos (sin eso también sonarían clásicos). Receta para probar el diagnóstico con lo que ya hay:
Capa con cuatro partes (sub seno con drift · supersaw 7 voces LP 600 Hz + LFO 0,05 Hz + ensemble ·
ruido con Vocal «u» y Vida · campana FM4 con release largo), Placa a Size 4.

**1 · Tiempo ×10 + octava por oscilador** ✔ **HECHO 2026-10-03** — detalle en DISENO.md. Resumen:
rangos ×10 en log con `lmin` (posición 0 = 0 exacto), sliders que guardan el valor exacto, Speed de
LFO desde 0,005 Hz, Delay 4 s (`DLY_MAX`), Size 20 s (IR ~55 ms de generación; placa con tabla
RT60→decay ampliada con medidas en Node entre 1 y 15 s: 16,2 ↔ 0,93 · 21,8 ↔ 0,95 · 26,3 ↔ 0,96),
predelay 250 ms, `octA`/`octB` −2..+2 como ratio de frecuencia (stepper «Octava» junto a «Apiladas»),
`MAX_TAILS` 16 con fundido de 350 ms. Cuatro checks nuevos (148/148), categoría «Cinescape»
(«Pad glaciar (ataque 12 s)», «Drone de sótano (−2 octavas)»), pares TIEMPO 1-4 y OCT 1-2.
Fuera a propósito: subir el tope de Mix de reverb (0,6; los niveles están igualados por medida) y
los Speed de chorus/flanger (efectos, no paisaje).

**2 · Deriva por voz + fase por voz** ✔ **HECHO 2026-10-03** — detalle en DISENO.md. Distinto del
plan: la deriva usa el buffer de deriva de los LFO (`lfoBuffers.drift`, mulberry32) y no el `wander`
de Vocal; la fase por voz NO es aleatoria sino la secuencia de Weyl k·φ (determinista: renders y SFZ
reproducibles, el selftest la mide), con un selector `lfoPhase` global/por voz por nota (bit-compatible
por defecto); los LFO por voz son buffers de un periodo (un OscillatorNode no admite fase inicial),
no PeriodicWaves. Medidas: corr entre notas 1,000 global / −0,738 por voz (= cos 2π·0,618), deriva
0,122, renders bit a bit iguales; 151/151. Preset «Pad de cuatro vientos»; pares FASE 1-2 y DERIVA 1-2.
Lección: los checks que miden amplitud por voz deben renderizar a −12 dB o el limitador de la Sala
acopla las pistas. El plan era: fuente «Deriva (por voz)» en `MX_SOURCES` desde un offset aleatorio
y fase aleatoria por voz para los LFOs dedicados.

**3 · Shimmer + freeze** ✔ **HECHO 2026-10-03** — detalle en DISENO.md. Distinto del plan: la
ganancia del bucle NO es fija: se calibra contra la energía de la reverb (IR 0,07·Size por la
constante de normalización del ConvolverNode; placa medida en Node, tabla `PLATE_G`) para que la
energía por vuelta sea amt·0,8 — con ganancia fija no había coro (cada vuelta perdía ~9 dB; el
check lo cazó). Ventanas seno (no Hann) a media vuelta: potencia constante. Freeze a decay 0,9995
(el worklet sube su tope a 1) y como botón, no parámetro; con la IR se desactiva. Medidas: 440 →
880 Hz relación 8710; cola a 3-4 s +14 dB (placa) / +30 dB (IR) con shimmer; estable (7 s/2 s
0,006 / 0,125); congelada mantiene 0,969 a los 5 s; 155/155. Preset «Pad shimmer»; pares SHIM 1-4.
El plan era: worklet pitch shifter granular (dos granos con ventana Hann y lectura en dientes de
sierra, +12 o +7 st) en un bucle reverb → LP → shifter → ×amt → reverb; Freeze con decay 0,999.

**4 · Fuentes de ejecución** ✔ **HECHO 2026-10-03** — detalle en DISENO.md. Como estaba planeado:
ConstantSource 0..1 por fuente y motor (`AudioEngine.perf`), `parts.setPerf` a todas las partes,
`handleMidi` exportado para la sonda. Añadido: rueda en pantalla bajo el teclado (sigue al CC1).
Decisiones: CC1/CC11 alimentan la fuente SIEMPRE además del mapeo (de fábrica CC1 → vibrato); el
aftertouch polifónico se trata como el de canal (la fuente es por motor); 0 = reposo. Medidas:
rueda → cutoff tilt ×5,4; aftertouch → pitch 185,0 Hz exactos; expresión → amplitud ×0,200; MIDI
sintético → fuentes 1 / 0,504 / 0; 157/157. Preset «Pad de ejecución». Sin par A/B (son gestos, no
viven en el preset): la evidencia es el check. El plan era: rueda (CC1), aftertouch y expresión
(CC11) como fuentes de la matriz; verificación con sonda MIDI sintética.

**5 · Resonadores** ✔ **HECHO 2026-10-03** — detalle en DISENO.md. Distinto del plan: módulo propio
(`engine/reson.js`, 6 biquads bandpass por voz tras el Vocal), no un modo del Vocal ni combs
Karplus-Strong (un bucle con DelayNode nativo tiene 128 muestras de latencia mínima: no afina por encima
de ~340 Hz). Knob Material = morph log entre cuerda (armónicos) y barra libre (∝ (2n+1)²); Decay = Q
10→600; Brillo con Σg² constante. Hallazgo: dos caminos de entrada — tonal a 0 dB, ruido ∝ √Q —
porque la potencia de ruido que pasa un resonador es ∝ f/Q. Medidas: 2º modo 37× / 82× en su sitio
según Material; selectividad ×1,1 (Q 10) vs ×19 (Q 600); cuenco con ruido −15,7 dB; sigue el glide
(40×); 162/162. Presets «Cuenco tibetano» y «Metal frotado»; pares RES 1-4. El plan era: modo
«resonador» del banco Vocal (ratios inarmónicos, Q alta, ruido como fuente) o banco de combs
Karplus-Strong por voz.

**6 · Granular** — modo de onda
«grano» en el worklet (N granos leyendo la tabla con fases aleatorias y ventanas Hann, densidad y
dispersión de tono/pan) o granulador sobre el buffer del recorder. Coste alto.

**7 · Cinta en máster** ✔ **HECHO 2026-10-03, revisado tras escucharlo** — detalle en DISENO.md. En la
Sala (suma → cinta → limitador): saturación tanh(x) con entrada 1 + sat² (hasta ×2) y pérdida de
agudos, y wow (línea de 8 ms con deriva 'drift' a 0,8 Hz ≈ ±33 ct medidos + flutter 6,5 Hz ≈ ±6 ct);
las dos exactas a 0 (el wow a 0 no añade latencia). Revisión por el oído de Sergio: la primera
saturación (k = 2, ×3) petardeaba con tres notas (intermodulación del sub) → curva suave y knob al
cuadrado; el wow a ±7 ct no se oía, y a ±15 tampoco → ±33 a tope (cinta estropeada a propósito) y el
check prueba también el camino del knob (set en vivo: 16,8 Hz, igual que naciendo a tope; sospecha
de caché de módulos en el navegador: Ctrl+F5); el siseo fijo NO aportaba → quitado (el aire por nota
ya es el knob Ruido). Check: 3er armónico 0,0019 / 0,0139 / 0,1035 a 0 / 0,3 / 1, nivel ×1,00; wow
16,8 Hz de vaivén a 440 Hz; 159/159. Preset «Pad de cinta (nostalgia)»; pares CINTA 1-4. El plan era: ruido a −50 dB, DelayNode
de pocos ms modulado, tanh suave; en la Sala.

## Roadmap 6.0 — en exploración (2026-10-04)

Origen: «¿cómo conseguimos sonidos más ricos, con más textura?». Contexto completo en DISENO.md.

**Descartado: 1 · Grano** (la voz × ruido de ancho B: temblor / raspa / aliento pegados a los
armónicos). Se hizo entero (módulo, check, pares GRANO 1-8, dos presets) y, tras escucharlo: «no era lo
que esperaba, ni lo que buscaba». Quitado del código sin commit. Respondía a «textura» como grano FINO
(ms); lo buscado era otra escala. Lo que se aprendió y vale para lo que venga: el limitador de la Sala
(−3 dB) va ANTES del master — un pad normal ya roza el limitador, y cualquier fuente con mucha cresta
(ruido multiplicado, picos gaussianos) pierde nivel ahí; para medir niveles sin él, bajar `amplitude`.

**La dirección buscada: sonidos complejos y escalonados** — el timbre moviéndose por pasos, con ritmo,
generado por LFO o similar. Paso 1 (en curso): presets «Escalonados» con lo que YA hay (S&H, secuencia
de tabla, LFO crudos en la matriz, fase por voz, delay a tempo) para oír hasta dónde llega la
topología actual. Paso 2 (pendiente de que Sergio lo vea claro, NO planificar aún): módulo de **Pasos**
— carriles de distinta longitud (polimetría: 16·12·5 → mcm 240 pasos), división y valor por paso,
como fuentes de la matriz; generalizar lo que la secuencia de tabla ya hace para wtPos. Y LFO a tempo.

## Lo que NO haremos (decidido)

- **Piano roll / línea de tiempo** con notas escritas: para eso están los DAWs y el SFZ es el
  puente. Lo generativo son jugadores, no partituras.
- **Duplicar el rack por parte**: el rack edita la parte seleccionada.
- **Secuenciador multipista tipo DAW** (decisión del Roadmap 3.0, sigue vigente).
- **Seq fase 2** (ties, acentos, cuantización, step-record): solo como proyecto aparte. *Revisado
  2026-10-17: acento, ligadura, slide y repeticiones vuelven como propuesta (Roadmap 7.0, 5.1,
  pendiente de decisión); cuantización y step-record siguen fuera.*
- **Un DAW** (decidido 2026-10-17): ni línea de tiempo, ni multipista, ni regiones, ni automatización
  por pistas, ni mezclador con inserciones por canal. SubSDJ es un instrumento de diseño y
  generación de sonido; las canciones se hacen en un DAW con los sonidos exportados (SFZ, WAV).
- **Piano acústico** y **generación estática de samples** del synth original: aparcados.
- **Descartados el 2026-10-25 por el criterio «que aporte algo diferencial»** (el synth ya lo cubre):
  **3.4 distorsión de fase** (su barrido es el del filtro o el morph de la tabla, y sus formas
  resonantes, las del filtro resonante y el sync); **3.5 editor de armónicos** (otra forma de
  dibujar lo que ya dibuja el Editor de ondas); **4.2 placa con graves propios** (retoque, solo si
  se oye un fallo); **4.3 phaser** (se solapa con flanger, chorus y el notch con LFO); **5.5 modos
  del arpegiador** (poco). **5.3 acordes encadenados**: sin fecha.
- **El teclado se queda**: es el banco de pruebas para confeccionar un sonido antes de guardarlo
  como preset y usarlo en una escena.
