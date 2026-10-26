/* SubSDJ · the instrument is a fixed-size OBJECT (FRAME_W × FRAME_H CSS px)
   that is scaled as a whole to fit the window: zoom = min(width/W,
   height/H). Nothing reflows: every module is ALWAYS in the same place, as on
   a physical synth (you move closer or further away; it never rearranges). Below
   MIN_ZOOM it shrinks no further (the knobs would become untouchable): scrolling appears.
   CSS zoom (standardized in Chrome 128): layout happens at real size, so
   text and borders stay crisp; getBoundingClientRect gives the ON-SCREEN size
   and clientWidth the DESIGN size. Canvases draw in design units
   and ask fitCanvas for a backing store of dpr × zoom (otherwise, at 130 %
   on a 150 % display they would look half-resolution); pointers
   go from screen to design by dividing by uiZoom(). */
export const FRAME_W = 1920, FRAME_H = 1000, MIN_ZOOM = 0.6;
let zoom = 1;

export const uiZoom = () => zoom;

// Fits the canvas backing store to its on-screen size and leaves the
// context drawing in design px. Returns {w, h} in design px.
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
  addEventListener('resize', fit);   // registered before the canvases: when they redraw, the zoom is already the new one
  fit();
}
