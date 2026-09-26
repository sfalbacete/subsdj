/* SubSDJ · medidor de carga del hilo de audio («CPU audio» de la cabecera).
   Chrome (152) no expone AudioContext.renderCapacity ni performance.now()
   dentro del AudioWorkletGlobalScope, así que se mide con lo que hay:
   Date.now() (1 ms) y la ESTRUCTURA del render. El hilo de audio trabaja a
   RÁFAGAS: cada callback de la tarjeta (P ≈ baseLatency: 10 ms = 480
   muestras) renderiza sus 3-4 quanta de 128 muestras seguidos y duerme el
   resto. Este nodo se procesa una vez por quantum, en su turno del grafo: el
   hueco entre dos llamadas seguidas DENTRO de una ráfaga es el tiempo de
   render de un quantum del grafo entero (nodos nativos incluidos); el hueco
   largo es el sueño. Por ventana de ~1 s: los N huecos mayores (N = ventana /
   P) son los sueños; ocupado = ventana − sueños, corregido por Q/(Q−1) porque
   de cada ráfaga de Q quanta solo se ven Q−1 huecos. Con un reloj de 1 ms
   cada hueco vale 0 o 1, pero la suma telescopa (cuenta cruces de
   milisegundo): estimador sin sesgo, ruidoso, que la UI suaviza.
   Orientativo: no ve el hilo principal (UI) y supone que P es el callback
   real (si la tarjeta usa otro, el reparto ráfaga/sueño se desvía). */
class LoadProcessor extends AudioWorkletProcessor {
  constructor(opts) {
    super();
    const o = (opts && opts.processorOptions) || {};
    this.P = Math.max(2, o.periodMs || 10);   // ms por callback de la tarjeta (baseLatency)
    this.win = 1000;                           // ventana de medida (ms)
    this.gaps = []; this.last = -1; this.t0 = -1;
  }
  process() {
    const t = Date.now();
    if (this.t0 < 0) this.t0 = t;
    if (this.last >= 0) this.gaps.push(t - this.last);
    this.last = t;
    const wall = t - this.t0;
    if (wall >= this.win && this.gaps.length > 8) {
      const N = Math.max(1, Math.round(wall / this.P));            // ráfagas (callbacks) en la ventana
      const g = this.gaps.slice().sort((a, b) => b - a);
      let sleep = 0; for (let i = 0; i < N && i < g.length; i++) sleep += g[i];
      const Q = this.gaps.length / N;                               // quanta por ráfaga
      const busy = Math.max(0, wall - sleep) * (Q > 1 ? Q / (Q - 1) : 1);
      this.port.postMessage({ load: Math.min(1.5, busy / wall), quanta: this.gaps.length, bursts: N });
      this.gaps.length = 0; this.t0 = t;
    }
    return true;
  }
}
registerProcessor('load-processor', LoadProcessor);
