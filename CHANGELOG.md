# Cambios

Una entrada por versión publicada, la más reciente arriba. Numeración X.Y.Z:
**Z** = arreglos, **Y** = funciones nuevas, **X** = algo guardado deja de
cargar o de sonar igual (presets, escenas, bibliotecas, mapas MIDI). El porqué
de cada módulo está en [docs/DISENO.md](docs/DISENO.md).

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
