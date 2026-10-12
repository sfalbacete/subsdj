/* SubSDJ · el instrumento es un OBJETO de tamaño fijo (FRAME_W × FRAME_H px
   CSS) que se escala entero para caber en la ventana: zoom = min(ancho/W,
   alto/H). Nada refluye: cada módulo está SIEMPRE en el mismo sitio, como en
   un synth físico (te acercas o te alejas; no se recoloca). Por debajo de
   MIN_ZOOM no encoge más (los knobs dejarían de poder tocarse): sale el scroll.
   CSS zoom (estandarizado en Chrome 128): el layout se hace a tamaño real, así
   que texto y bordes salen nítidos; getBoundingClientRect da el tamaño EN
   PANTALLA y clientWidth el de DISEÑO. Los canvas dibujan en unidades de
   diseño y piden a fitCanvas un backing store de dpr × zoom (si no, a 130 %
   en una pantalla al 150 % se verían a la mitad de resolución); los punteros
   pasan de pantalla a diseño dividiendo por uiZoom(). */
export const FRAME_W = 1920, FRAME_H = 1000, MIN_ZOOM = 0.6;
let zoom = 1;

export const uiZoom = () => zoom;

// Ajusta el backing store del canvas a su tamaño en pantalla y deja el
// contexto dibujando en px de diseño. Devuelve {w, h} en px de diseño.
export function fitCanvas(c, ctx, defW, defH) {
  const w = c.clientWidth || defW, h = c.clientHeight || defH;
  const k = (window.devicePixelRatio || 1) * zoom, bw = Math.round(w * k), bh = Math.round(h * k);
  if (c.width !== bw) c.width = bw;
  if (c.height !== bh) c.height = bh;
  ctx.setTransform(bw / w, 0, 0, bh / h, 0, 0);
  return { w, h };
}

export function initFrame() {
  const inst = document.getElementById('inst');
  if (!inst) return;
  const fit = () => {
    zoom = Math.max(MIN_ZOOM, Math.min(innerWidth / FRAME_W, innerHeight / FRAME_H));
    inst.style.zoom = zoom;
    document.documentElement.classList.toggle('frame-scroll', zoom * FRAME_W > innerWidth + 0.5 || zoom * FRAME_H > innerHeight + 0.5);
  };
  addEventListener('resize', fit);   // registrado antes que los canvas: cuando se redibujan, el zoom ya es el nuevo
  fit();
}
