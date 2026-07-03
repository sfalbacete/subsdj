/* =====================================================================
   SubSDJ · recorder-processor: captura su entrada (estéreo) y envía los
   bloques al hilo principal mientras graba ('start' / 'stop' por el port).
   El nodo es único y permanente: process devuelve true siempre.
   ===================================================================== */
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.rec = false;
    this.port.onmessage = (e) => { this.rec = e.data === 'start'; };
  }
  process(inputs) {
    const inp = inputs[0];
    if (this.rec && inp && inp.length) {
      const L = inp[0].slice(0);
      const R = (inp[1] || inp[0]).slice(0);
      this.port.postMessage({ L, R }, [L.buffer, R.buffer]);   // transferencia: sin copia extra
    }
    return true;
  }
}
registerProcessor('recorder-processor', RecorderProcessor);
