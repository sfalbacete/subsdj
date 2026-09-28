# SubSDJ · Plan de pendientes

Fecha: 2026-09-27 · Estado: Roadmap 4.0 acordado el 2026-09-10 (README); hechas **A1 delay de
cinta** (`1db2a19`), **B1 FM en la matriz + feedback** (`8978cd6`), **C1 Partes + mezclador**
(`12b71f6`), **C2 Armonía + jugadores** (`f06fa8b`), **C3 Arreglo + escenas** (`8bf1f8e`) y
**A2 Reverb de placa** (`0b77967`), **B2 Oscilador FM4** (`a4d20a4`) y **A3 Curva de envolvente**
(2026-09-27), **13a Pantallas**, **11 runner en `tools/`** y **13b Biblioteca de presets** (2026-09-27); selftest 120/120. Los ejes B y C están
COMPLETOS y del eje A solo queda A4. Fuera del plan:
notas colgadas + Pánico (`4e2b47e`), cuatro
escenas en `escenas/` (`c718c63`; la placa en las dos ambientales, `29f172d`). Este documento
complementa al README: allí
vive el roadmap resumido; aquí, cada bloque pendiente con su **propósito**, qué haremos, cómo,
cómo lo verificamos, qué cuesta y de qué depende. Cuando un bloque se termina se marca ✔ aquí
y en el README.

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
| 9 | **LFO con S&H y deriva** | el random rítmico y la deriva lenta como formas de LFO | bajo-medio | — |
| 10 | **Piel del rack** ✔ | temas por tokens: tokens + check «piel», knob y slider publican `--pos`, selector leído de las hojas, temas «Cinescapes» (base) y «Clásico» — HECHO 2026-09-28 (4 commits) | medio | — |
| 11 | **Runner headless en el repo** ✔ | selftest y capturas sin depender de la sesión — HECHO (`tools/`) | bajo | — |
| 12 | **Recámara antigua** | swing del arp, loop points SFZ, W3 expresiones | — | — |
| 13 | **Pantallas + biblioteca de presets** ✔ | que el synth vuelva a ser disfrutable: ver solo lo que toca; presets que se pueden ordenar, podar y querer — HECHO (13a y 13b) | 13a bajo · 13b alto | — |

**Orden de ejecución acordado:** ~~B1~~ → ~~C1~~ → ~~C2~~ → ~~C3~~ → ~~A2~~ → ~~B2~~ (ejes B y C completos);
→ ~~A3~~ → ~~13a~~ (pantallas, 2026-09-27) → ~~11~~ (runner en `tools/`, de paso) → ~~13b~~ (biblioteca,
2026-09-27; el bloque 13 completo). **10 (piel) COMPLETO el 2026-09-28** (1 tokens → 2 knob con arco → 3 selector → 4 temas) → **A4 ✔ (2026-09-28)**.
**Siguiente: 9 (LFO S&H y deriva) como tarde suelta; luego la recámara (12).** Después A4 y 9 como
tardes sueltas. Queda también la recámara (12).

**Método de siempre en cada bloque:** selftest en verde antes y después; si la mejora es audible,
pares A/B en `subsdj-demos.json` con prefijo propio y sonda `?selftest=1&demos=PREFIJO`; si es
visual, capturas CDP; commit por hito; README y este plan al día.

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

**✔ HECHO 2026-09-25** — selftest 106/106; detalle, medidas y evidencia en el README.

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

**✔ HECHO 2026-09-26** — selftest 107/107; detalle, medidas y evidencia en el README. Los cinco
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

**✔ HECHO 2026-09-26** — selftest 108/108; detalle, medidas y evidencia en el README. La
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

**✔ HECHO 2026-09-27** — selftest 110/110; detalle, medidas y evidencia en el README.

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

**✔ HECHO 2026-09-25** — selftest 105/105; el detalle y las medidas están en el README.

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

**✔ HECHO 2026-09-27** — selftest 116/116; detalle, medidas y evidencia en el README.

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

**✔ HECHO 2026-09-27** — selftest 118/118; detalle y medidas en el README.

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

**Qué haremos.** Copiarlos a `tools/` con una nota en el README (`node tools/run-selftest.mjs
"selftest=1&demos=DLY"`). No es build: el proyecto sigue sin dependencias.

**Coste.** Mínimo.

### 13 · Pantallas y biblioteca de presets (propuesto por el usuario, 2026-09-27)

**Propósito.** El rack tiene ya ~35 módulos: en un monitor 4K está todo lleno y con zoom-out se ve
pequeño y apabullante. No hace falta ver todo en todo momento. Tres pantallas por función, y una
gestión de presets de verdad.

**13a · Pantallas** ✔ **HECHO 2026-09-27** — selftest 119/119 (check «pantallas»); sección «Pantallas»
del README; capturas de las tres pantallas. Lo que quedó distinto del plan: la barra rápida vive en
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
sobre almacenamiento falso); detalle en el README («Grabación, presets y arpegiador» y Roadmap
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

### 12 · Recámara antigua (ya en el README)

- **Visualizadores en grande**: el osciloscopio y el espectro de la cabecera (170×36) ampliables
  cuando haga falta verlos bien (pedido por el usuario «eventualmente», 2026-09-27).
- **Arpegiador**: más divisiones y swing.
- **Exportador SFZ**: loop points automáticos (hoy nota sostenible ~3 s + release).
- **Wavetable W3**: expresiones `f(x, t)` que generan una familia de frames coherentes, y/o
  editor de armónicos (aditiva pura). Decisión aplazada.

## Lo que NO haremos (decidido)

- **Piano roll / línea de tiempo** con notas escritas: para eso están los DAWs y el SFZ es el
  puente. Lo generativo son jugadores, no partituras.
- **Duplicar el rack por parte**: el rack edita la parte seleccionada.
- **Secuenciador multipista tipo DAW** (decisión del Roadmap 3.0, sigue vigente).
- **Seq fase 2** (ties, acentos, cuantización, step-record): solo como proyecto aparte.
- **Piano acústico** y **generación estática de samples** del synth original: aparcados.
- **El teclado se queda**: es el banco de pruebas para confeccionar un sonido antes de guardarlo
  como preset y usarlo en una escena.
