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
   go from screen to design by dividing by uiZoom().
   ELASTIC: FRAME_W × FRAME_H is the base (1.92:1). A window of another shape would
   leave bars beside or above the object, so the side that has room to spare grows,
   up to MAX_W or MAX_H: the zoom is still the one of the base, the controls keep their
   size and their order, and the leftover goes to what has no fixed size — in height the
   keyboard (longer keys), in width the .grow sections and the keys. 16:9 full screen
   is 1920 × 1080; a tab with the bookmarks bar, about 2050 × 1000. Past the caps, bars. */
export const FRAME_W = 1920, FRAME_H = 1000, MAX_W = 2100, MAX_H = 1100, MIN_ZOOM = 0.6;
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

// The object for a window of iw × ih CSS px: the zoom of the BASE frame and the design size, which is
// the window in design px clamped to base…max — so only the side with room to spare ends up above its
// base (floor: never a px over the window).
export function frameSize(iw, ih) {
  const zoom = Math.max(MIN_ZOOM, Math.min(iw / FRAME_W, ih / FRAME_H));
  const px = v => Math.floor(v / zoom + 1e-6);   // 1440 / (2560 / 1920) must be 1080, not 1079.9999…
  return { zoom, w: Math.max(FRAME_W, Math.min(MAX_W, px(iw))), h: Math.max(FRAME_H, Math.min(MAX_H, px(ih))) };
}

// The selftest lays the object out at a design size the window doesn't have (the extremes of the elastic
// frame); forceFrame() with no arguments goes back to the window's. The resize it fires refits everything.
let forced = null;
export function forceFrame(w, h) { forced = w ? { w, h } : null; dispatchEvent(new Event('resize')); }

export function initFrame() {
  const inst = document.getElementById('inst');
  if (!inst) return;
  const fit = () => {
    const f = frameSize(innerWidth, innerHeight);
    zoom = f.zoom;
    inst.style.zoom = zoom;
    inst.style.width = (forced ? forced.w : f.w) + 'px';
    inst.style.height = (forced ? forced.h : f.h) + 'px';
    document.documentElement.style.setProperty('--ui-zoom', zoom.toFixed(4));   // the tooltips live outside #inst: they scale with this (style.css)
    document.documentElement.classList.toggle('frame-scroll', zoom * FRAME_W > innerWidth + 0.5 || zoom * FRAME_H > innerHeight + 0.5);
  };
  addEventListener('resize', fit);   // registered before the canvases: when they redraw, the zoom is already the new one
  fit();
}
