/* =====================================================================
   SubSDJ · recorder-processor: captures its (stereo) input and sends the
   blocks to the main thread while recording ('start' / 'stop' through the port).
   The node is unique and permanent: process always returns true.
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
      this.port.postMessage({ L, R }, [L.buffer, R.buffer]);   // transfer: no extra copy
    }
    return true;
  }
}
registerProcessor('recorder-processor', RecorderProcessor);
