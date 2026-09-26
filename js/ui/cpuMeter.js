/* SubSDJ · indicador «CPU audio» de la cabecera: carga del hilo de audio
   (tiempo renderizando por segundo de reloj) medida por el worklet
   engine/worklets/load-processor.js (allí está el cómo y el porqué). Un
   nodo mudo conectado a la salida (sin conexión no se procesaría), un
   mensaje por segundo, suavizado EMA y color: normal < 50 %, ámbar < 80 %,
   rojo a partir de ahí. Si el worklet no carga, el indicador no aparece. */
export async function initCpuMeter(ctx) {
  const el = document.getElementById('cpuInfo');
  if (!el || !ctx || !ctx.audioWorklet) return;
  try {
    await ctx.audioWorklet.addModule(new URL('../engine/worklets/load-processor.js?v=1', import.meta.url));
    const node = new AudioWorkletNode(ctx, 'load-processor', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
      processorOptions: { periodMs: Math.round((ctx.baseLatency || 0.01) * 1000) },
    });
    const mute = ctx.createGain(); mute.gain.value = 0;
    node.connect(mute).connect(ctx.destination);
    let ema = -1;
    node.port.onmessage = e => {
      const v = e.data.load;
      ema = ema < 0 ? v : ema * 0.6 + v * 0.4;
      const pct = Math.min(100, Math.round(ema * 100));
      el.hidden = false; el.textContent = 'CPU audio ' + pct + ' %';
      el.classList.toggle('warn', pct >= 50 && pct < 80); el.classList.toggle('hot', pct >= 80);
    };
    el._meter = node;   // referencia viva (que el GC no se lleve el nodo)
  } catch (e) { console.warn('SubSDJ: sin medidor de carga del audio', e); }
}
