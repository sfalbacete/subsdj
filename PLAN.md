# SubSDJ · Plan de pendientes

Fecha: 2026-09-25 · Estado: Roadmap 4.0 acordado el 2026-09-10 (README), fase **A1 delay de
cinta HECHA** (commit `1db2a19`, selftest 100/100). Este documento complementa al README: allí
vive el roadmap resumido; aquí, cada bloque pendiente con su **propósito**, qué haremos, cómo,
cómo lo verificamos, qué cuesta y de qué depende. Cuando un bloque se termina se marca ✔ aquí
y en el README.

El orden de la lista es **por lo que más nos da → lo que menos**. El orden de EJECUCIÓN es otro
y va aparte, porque conviene meter primero los baratos.

## Vista rápida

| # | Bloque | Qué nos da | Coste | Depende de |
|---|--------|------------|-------|------------|
| 1 | **C1 Partes + mezclador** | la puerta a todo lo generativo: 4 presets sonando a la vez | alto (arquitectura) | decisión «Sala» |
| 2 | **C2 Armonía + jugadores** | la musiquita: sonido que se hace solo y suena musical | alto | C1 |
| 3 | **C3 Arreglo + escenas** | ambient de verdad: evolución lenta, sesiones reproducibles | medio | C2 |
| 4 | **A2 Reverb de placa** | el «suena fino» más grande; la sala donde vive el ambient | alto (DSP) | — |
| 5 | **B1 fmIndex en la matriz + feedback** | pluck, campana y tacto DX por casi nada | bajo | — |
| 6 | **B2 Oscilador FM4** | la FM completa: 4 operadores y algoritmos | alto | B1 (conviene) |
| 7 | **A3 Curva de envolvente** | ataques y decays que suenan naturales | bajo | — |
| 8 | **A4 Filtro BP + notch** | dos tipos de filtro más y una demostración bonita | bajo | — |
| 9 | **LFO con S&H y deriva** | el random rítmico y la deriva lenta como formas de LFO | bajo-medio | — |
| 10 | **Piel del rack** | identidad visual (fase 3 del Roadmap 3.0) | medio | — |
| 11 | **Runner headless en el repo** | verificar selftest y capturas sin depender de la sesión | bajo | — |
| 12 | **Recámara antigua** | swing del arp, loop points SFZ, W3 expresiones | — | — |

**Orden de ejecución acordado:** B1 → C1 → C2 → C3, con A2 y B2 intercalados cuando apetezca;
A3, A4 y 9 como tardes sueltas; 10 cuando el cuerpo lo pida.

**Método de siempre en cada bloque:** selftest en verde antes y después; si la mejora es audible,
pares A/B en `subsdj-demos.json` con prefijo propio y sonda `?selftest=1&demos=PREFIJO`; si es
visual, capturas CDP; commit por hito; README y este plan al día.

## Decisiones abiertas (te tocan a ti)

1. **«Sala» como módulo de escena (C1).** Hoy un preset mezcla dos clases de parámetros: los del
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
   parecen cortos o largos, son constantes al principio de `AudioEngine.js`.
4. **Partes: 4 ranuras genéricas con nombre** (propuesta) o número configurable. Y en modo Partes,
   si el teclado toca solo la parte seleccionada o hay un botón «capa» para tocar varias.

## Detalle por bloque

### 1 · C1 Partes + mezclador

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

**Coste.** Alto: es el bloque arquitectónico. Dos o tres sesiones.

### 2 · C2 Armonía + jugadores

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

**Coste.** Alto, pero repartido: armonía + un jugador (Pulso) es una sesión; cada jugador
siguiente, una tarde.

### 3 · C3 Arreglo y escenas

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

**Coste.** Medio.

### 4 · A2 Reverb de placa algorítmica

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

**Coste.** Alto: ~250 líneas de DSP y afinado de tiempos de delay (primos entre sí) y ganancias.

### 5 · B1 fmIndex como destino de la matriz + feedback del operador

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

**Coste.** Bajo: una tarde. Es el siguiente en el orden de ejecución.

### 6 · B2 Oscilador «FM4»

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

**Coste.** Alto: worklet + UI. Conviene después de B1 (comparte el feedback y el destino de
matriz, que puede apuntar al índice global del FM4).

### 7 · A3 Curva de envolvente

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

**Coste.** Bajo.

### 8 · A4 Filtro BP y notch explícitos

**Propósito.** Dos tipos de filtro más (los que él tiene y nosotros no) y una demostración: la
suma de los numeradores RBJ de un LP y un HP con el mismo corte da `1 − 2cos·z⁻¹ + z⁻²`, el
notch del cookbook. Nuestro morph al 50 % YA es un notch, a −6 dB.

**Qué haremos.** Selector «Tipo» en el módulo Filtro: **LP↔HP** (el morph de hoy), **BP** (LP y
HP en serie con el mismo corte: paso-banda de 4º orden) y **Notch** (LP + HP en paralelo a
partes iguales, con +6 dB de compensación). Cambio estructural por nota, como la pendiente.

**Evidencia.** Selftest con Goertzel: en Notch la energía en la frecuencia de corte cae más de
20 dB frente a la de un tono lejano; en BP, lo contrario.

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

**Qué haremos.** Tema claro/oscuro (variables CSS + `data-theme` en localStorage), fondo de rack,
tornillos en las esquinas de los paneles, knobs torneados con muesca, sliders con guía fresada,
placa con logo, LFOs animados (el indicador gira a la velocidad real).

**Evidencia.** Capturas CDP en ambos temas y a varios anchos; ninguna regresión de ids ni de
`PARAMS↔CONTROLS`.

**Coste.** Medio. Independiente de todo: se intercala cuando apetezca.

### 11 · Runner headless en el repo

**Propósito.** Verificar sin depender de la sesión de Claude. Hoy el selftest se lanza en
Chrome headless con dos scripts Node que viven en el scratchpad de la sesión (efímero):
`run-selftest.mjs` (servidor estático propio en 8001 que captura los pings, CDP por
`DevToolsActivePort`, imprime resultados, fallos y diffs de pares) y `shot.mjs` (captura PNG de
un panel por el texto de su título). Python no está en el PATH de Git Bash, así que Node es
el camino.

**Qué haremos.** Copiarlos a `tools/` con una nota en el README (`node tools/run-selftest.mjs
"selftest=1&demos=DLY"`). No es build: el proyecto sigue sin dependencias.

**Coste.** Mínimo.

### 12 · Recámara antigua (ya en el README)

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
