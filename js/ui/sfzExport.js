/* =====================================================================
   SubSDJ · exportador SFZ (botón 🎹 SFZ en la barra de presets).
   Congela el preset ACTUAL como instrumento multisample reutilizable en
   cualquier sampler (Sforzando, Renoise, TAL-Sampler…): renderiza una
   rejilla de notas en OfflineAudioContext —el mismo camino real que el
   self-test—, recorta el silencio de los extremos, normaliza en global
   y descarga un ZIP (entradas sin comprimir) con <preset>.sfz +
   samples/*.wav (16-bit estéreo).
   Decisiones:
   - Reverb y delay NO se hornean (sus ecos/colas quedan pegados a cada
     nota en un sampler; se añaden en el DAW). El resto de la cadena
     (drive, filtro, unison, chorus/ensemble, width…) es timbre y va.
   - 2 capas de velocidad solo si filterEnvAmt ≠ 0 (la velocity cambia
     el timbre); la parte de VOLUMEN de la velocity se compensa (×1/vel)
     al nivel de la capa dura, y el volumen continuo lo pone el sampler
     (amp_veltrack=100 por defecto en SFZ). Con env de filtro a 0 la
     velocity solo es volumen: basta 1 capa.
   - Sin loop points (v1): samples largos (hold + release completo) y
     ampeg_release = release del preset para que soltar la nota en el
     sampler suene como en el synth.
   ===================================================================== */
import { AudioEngine } from '../engine/AudioEngine.js';
import { part } from '../engine/parts.js';
import { encodeWav, download } from './recorder.js';

const SR = 44100;
const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

// Rejilla por defecto: C1..C7 cada 4 st (el sampler interpola ±2 st como mucho)
export const SFZ_GRID = { lo: 24, hi: 96, step: 4, hold: 3.0, maxDur: 8 };

// --- render offline de UNA nota (la receta del self-test) ---
async function renderNote(state, midi, vel, hold, maxDur) {
  const dur = Math.min(maxDur, hold + (state.r || 0.3) + 0.4);
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
  const eng = new AudioEngine();
  eng.S = state;
  await eng.init(ctx);
  eng.noteOn('sfz', midiHz(midi), vel);
  ctx.suspend(Math.min(hold, dur - 0.1)).then(() => { eng.noteOff('sfz'); ctx.resume(); });
  return ctx.startRendering();
}

// Recorta el silencio (< −70 dBFS) de los extremos y funde los últimos 15 ms
// a cero (sin click al acabar el sample en el sampler).
function trimBuffer(buf) {
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const thr = 3.2e-4, n = L.length;
  let a = 0; while (a < n && Math.abs(L[a]) < thr && Math.abs(R[a]) < thr) a++;
  let b = n - 1; while (b > a && Math.abs(L[b]) < thr && Math.abs(R[b]) < thr) b--;
  if (a >= b) { a = 0; b = n - 1; }                    // todo bajo el umbral: se deja tal cual
  a = Math.max(0, a - Math.floor(SR * 0.002));
  b = Math.min(n, b + 1 + Math.floor(SR * 0.05));
  const l = L.slice(a, b), r = R.slice(a, b), m = l.length;
  const fade = Math.min(m, Math.floor(SR * 0.015));
  for (let i = 0; i < fade; i++) { const g = i / fade; l[m - 1 - i] *= g; r[m - 1 - i] *= g; }
  return { l, r };
}

const slugify = s => (String(s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)) || 'preset';

// Renderiza el kit completo: samples WAV (Uint8Array) + texto .sfz.
// opts sobreescribe SFZ_GRID (el self-test usa una rejilla mínima).
export async function makeSfzKit(state, name, opts = {}, onProgress = null) {
  const o = { ...SFZ_GRID, ...opts };
  const S = structuredClone(state);
  S.arpMode = 'off';                       // el scheduler del arp es wall-clock: silenciaría el render
  S.mode = 'poly';                         // notas sueltas; mono/glide no aplica a un render aislado
  S.reverbMix = 0; S.dlyAmt = 0;           // espacio fuera del horneado (se añade en el DAW)
  const hold = Math.max(o.hold, (S.a || 0) + 1.2);     // que el ataque quepa entero
  const layers = S.filterEnvAmt
    ? [{ vel: 0.5, lovel: 0, hivel: 63 }, { vel: 1, lovel: 64, hivel: 127 }]
    : [{ vel: 1, lovel: 0, hivel: 127 }];
  const keys = [];
  for (let m = o.lo; m <= o.hi; m += o.step) keys.push(m);
  if (keys[keys.length - 1] !== o.hi) keys.push(o.hi);

  // 1) renders (secuencial: cada nota es un OfflineAudioContext propio)
  const rendered = [];
  const total = layers.length * keys.length;
  for (let li = 0; li < layers.length; li++) {
    for (const midi of keys) {
      const buf = await renderNote(structuredClone(S), midi, layers[li].vel, hold, o.maxDur);
      const { l, r } = trimBuffer(buf);
      if (layers[li].vel !== 1) {          // compensa el VCA lineal: capas al mismo nivel;
        const g = 1 / layers[li].vel;      // el volumen por velocity lo pone amp_veltrack
        for (let i = 0; i < l.length; i++) { l[i] *= g; r[i] *= g; }
      }
      rendered.push({ midi, li, l, r });
      if (onProgress) onProgress(rendered.length, total);
    }
  }

  // 2) normalización GLOBAL a −1 dBFS: una sola ganancia para todo el kit
  //    (conserva el balance entre notas y capas, solo ajusta el techo)
  let peak = 0;
  rendered.forEach(s => {
    for (let i = 0; i < s.l.length; i++) {
      const a = Math.abs(s.l[i]), b = Math.abs(s.r[i]);
      if (a > peak) peak = a; if (b > peak) peak = b;
    }
  });
  if (peak > 1e-6) {
    const g = Math.min(8, 0.891 / peak);
    rendered.forEach(s => { for (let i = 0; i < s.l.length; i++) { s.l[i] *= g; s.r[i] *= g; } });
  }

  // 3) WAVs + texto .sfz
  const slug = slugify(name);
  const samples = [];
  for (const s of rendered) {
    const fname = `${slug}_m${String(s.midi).padStart(3, '0')}_v${s.li + 1}.wav`;
    const bytes = new Uint8Array(await encodeWav([s.l], [s.r], SR).arrayBuffer());
    samples.push({ fname, midi: s.midi, layer: s.li, bytes });
  }
  const rel = Math.min(8, Math.max(0.03, S.r || 0.3));
  const lines = [
    '// SubSDJ · ' + name,
    '// Multisample del preset (rejilla de ' + o.step + ' st, ' + layers.length + ' capa(s) de velocidad).',
    '// Reverb y delay NO van horneados: añádelos en el DAW/tracker.',
    '// Sin loop points: nota sostenible ~' + hold.toFixed(1) + ' s + release.',
    '',
    '<control>',
    'default_path=samples/',
    '',
    '<global>',
    'loop_mode=no_loop',
    'ampeg_release=' + rel.toFixed(3),
  ];
  layers.forEach((layer, li) => {
    lines.push('', '<group>', 'lovel=' + layer.lovel, 'hivel=' + layer.hivel);
    keys.forEach((k, i) => {
      // bordes de teclado a mitad de camino entre keycenters vecinos (sin huecos)
      const lokey = i === 0 ? 0 : Math.floor((keys[i - 1] + k) / 2) + 1;
      const hikey = i === keys.length - 1 ? 127 : Math.floor((k + keys[i + 1]) / 2);
      const fname = samples.find(s => s.midi === k && s.layer === li).fname;
      lines.push('<region> sample=' + fname + ' lokey=' + lokey + ' hikey=' + hikey + ' pitch_keycenter=' + k);
    });
  });
  return { slug, sfz: lines.join('\n') + '\n', samples, layers: layers.length, keys };
}

// --- ZIP con entradas almacenadas (método STORE: el WAV apenas comprime
// y así el escritor cabe en 40 líneas sin dependencias) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = u8 => {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

export function makeZip(entries) {           // entries: [{name, data:Uint8Array}]
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [], central = [];
  let offset = 0, cdSize = 0;
  for (const e of entries) {
    const name = enc.encode(e.name), crc = crc32(e.data), sz = e.data.length;
    const lh = new DataView(new ArrayBuffer(30));          // cabecera local (campos no puestos = 0)
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true);
    lh.setUint16(26, name.length, true);
    parts.push(lh.buffer, name, e.data);
    const ch = new DataView(new ArrayBuffer(46));          // entrada del directorio central
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(ch.buffer, name);
    cdSize += 46 + name.length;
    offset += 30 + name.length + sz;
  }
  const eocd = new DataView(new ArrayBuffer(22));          // fin del directorio central
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, entries.length, true); eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, cdSize, true); eocd.setUint32(16, offset, true);
  return new Blob([...parts, ...central, eocd.buffer], { type: 'application/zip' });
}

export async function exportPresetSFZ(name, state, onProgress = null) {
  const kit = await makeSfzKit(state, name, {}, onProgress);
  const zip = makeZip([
    { name: kit.slug + '.sfz', data: new TextEncoder().encode(kit.sfz) },
    ...kit.samples.map(s => ({ name: 'samples/' + s.fname, data: s.bytes })),
  ]);
  download(zip, 'subsdj-' + kit.slug + '-sfz.zip');
  return kit;
}

export function initSfzExport() {
  const btn = document.getElementById('sfzBtn');
  if (!btn) return;
  const msg = document.getElementById('presetMsg');
  const say = t => { if (msg) msg.textContent = t; };
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    const sel = document.getElementById('presetSelect');
    const name = (sel && sel.selectedOptions[0] && sel.selectedOptions[0].textContent) || 'preset';
    try {
      // exporta lo que SUENA ahora: el preset cargado + los retoques de knobs
      const kit = await exportPresetSFZ(name, structuredClone(part().S),
        (i, n) => say('SFZ: render ' + i + '/' + n + '…'));
      say('SFZ exportado: ' + kit.samples.length + ' samples · cárgalo en Sforzando/Renoise.');
    } catch (e) {
      console.error('SubSDJ sfz:', e);
      say('Error exportando SFZ (mira la consola).');
    } finally { btn.disabled = false; }
  });
}
