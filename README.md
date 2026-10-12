# SubSDJ

Sintetizador para el navegador hecho con la **Web Audio API**, sin dependencias
ni paso de build. Empezó como recreación del viejo SubSDJ, un soft-synth
sustractivo que hice en VB.Net, y ha crecido hasta incluir FM, tablas de
ondas, formantes, resonadores, efectos, partes y música generativa.

*A browser synthesizer built on the Web Audio API, with no dependencies and no
build step. The interface and the docs are in Spanish.*

**▶ Pruébalo: <https://sfalbacete.github.io/subsdj/>**

![SubSDJ, pantalla Diseño](docs/img/subsdj.png)

## Cómo se toca

- **Teclado del ordenador**, al estilo tracker: fila baja `Z S X D C V G B H N J M`,
  fila alta `Q 2 W 3 E R 5 T 6 Y 7 U`; la octava, con `RePág` / `AvPág`.
  También se toca con el ratón sobre el teclado en pantalla.
- **Teclado MIDI**: se conecta solo al aceptar el permiso del navegador
  (velocity, pitch bend, sustain y Program Change). **MIDI map** liga
  cualquier mando físico a cualquier control.
- El audio arranca con el primer clic o la primera tecla: los navegadores no
  dejan sonar una página antes.
- `Escape` o **Pánico** cortan todas las notas.
- Tres pantallas: **Diseño** (el sonido), **Secuenciación** (arpegiador,
  secuenciador, partes y escenas) y **Presets** (la biblioteca).
- Cada módulo tiene su **?** con la explicación. Un control atenuado no hace
  nada con la configuración actual, y su tooltip dice por qué.

## Tus presets

Se guardan **en tu navegador** (localStorage), no en ningún servidor: en otro
navegador o en otro ordenador no estarán. Para llevártelos o compartirlos:
**Archivo ▾ → Exportar biblioteca**, y en el otro lado **Importar…** (se
funde con lo que haya, nunca lo sustituye).

## Navegadores

Desarrollado y probado en **Chrome**; Edge usa el mismo motor. Firefox y
Safari no se han probado, y Safari no tiene Web MIDI. Si tras una
actualización algo suena raro, recarga con **Ctrl+F5**: el navegador puede
haber mezclado ficheros de la versión anterior.

## Ejecutarlo en local

Los módulos ES y los AudioWorklet no funcionan abriendo `index.html` con
doble clic: hace falta servirlo por HTTP. Con Node:

```
node tools/serve.mjs
```

→ <http://127.0.0.1:8000/>. El selftest, en <http://127.0.0.1:8000/?selftest=1>,
o sin ventana con `node tools/run-selftest.mjs` (Node ≥ 22 y Chrome).

## Documentación

- [docs/DISENO.md](docs/DISENO.md): cómo funciona cada módulo y por qué, con
  las medidas que lo validan. Es el diario de desarrollo.
- [docs/PLAN.md](docs/PLAN.md): planes y pendientes.
- [CHANGELOG.md](CHANGELOG.md): los cambios de cada versión.

## Licencia

[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only).
