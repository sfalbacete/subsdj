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
   - Capas de velocidad MEDIDAS (velocityLayers): la nota de referencia a
     velocity suave y a tope; si el BRILLO cambia, la velocity cambia el
     timbre (env de filtro, matriz → filtro o FM, operadores FM4… lo que
     sea, sin lista que mantener) y van 2 o 3 capas; si solo cambia el
     volumen, basta 1. Cada capa se iguala al NIVEL medido de la dura (no
     ×1/vel: la velocity puede mover más que el VCA) y el volumen continuo
     lo pone el sampler (amp_veltrack=100 por defecto en SFZ).
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

// ¿Cambia el TIMBRE con la velocity? La nota de referencia a VEL_SOFT y a 1,
// cada una como ESPECTRO por bandas de tercio de octava (FFT promediada; en dB
// respecto a su total: el nivel no cuenta). Timbre = la banda que más se mueve,
// entre las que suenan (BAND_FLOOR): si pasa de VEL_DB → 2 capas; de VEL_DB3 → 3.
// El azar del preset (fases libres, ruido, S&H por nota, deriva) no confunde la
// medida: los renders offline llevan semilla (Roadmap 7.0 · 7.1), así que las dos
// notas comparten la misma tirada y solo difieren en la velocity. (Antes, un
// segundo render a velocity 1 medía ese azar y la velocity tenía que superarlo.)
// Cada capa se iguala al NIVEL de la dura (RMS medido).
// Medido en los 117 de fábrica (2026-10-20, ya con semilla): 2 capas o más en 45, 21 de ellos con 3
// (antes de 0.2, 30, por la env de filtro), con la velocity por la matriz, FM4 y la distorsión
// (una nota floja satura menos) bien vistas. Con el azar fuera de la medida aparecen los que
// lo tapaba: «Pluck lotería (S&H)» pasa de 1 capa a 3 (su env de filtro sigue a la velocity:
// 15 dB en la banda que más se mueve; antes el S&H por nota lo escondía).
const VEL_REF = 60, VEL_SOFT = 0.3;
const VEL_DB = 2;     // una banda que se mueve 2 dB: otro timbre, no solo más flojo (un falso «sí» solo engorda el zip)
const VEL_DB3 = 10;   // 10 dB: una capa intermedia evita el salto entre las dos
const BAND_FLOOR = -30; // solo las bandas que SUENAN (a menos de 30 dB del total): las más débiles no se oyen y su medida es ruido
const FFT_N = 4096;
function fft(re, im) {                               // radix-2 en sitio
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2, tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
// Bandas de tercio de octava de 100 Hz a 16 kHz, en dB respecto al total (Welch: Hann, 50 %)
function thirdOctaves(d, n) {
  const pow = new Float64Array(FFT_N / 2), re = new Float64Array(FFT_N), im = new Float64Array(FFT_N);
  for (let s = 0; s + FFT_N <= n; s += FFT_N / 2) {
    for (let i = 0; i < FFT_N; i++) { re[i] = d[s + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FFT_N - 1))); im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < FFT_N / 2; k++) pow[k] += re[k] * re[k] + im[k] * im[k];
  }
  const bands = [];
  let tot = 0;
  for (let f = 100; f < 16000; f *= Math.pow(2, 1 / 3)) {
    const k0 = Math.floor(f * FFT_N / SR), k1 = Math.floor(f * Math.pow(2, 1 / 3) * FFT_N / SR);
    let e = 0; for (let k = k0; k < k1; k++) e += pow[k];
    bands.push(e); tot += e;
  }
  return bands.map(e => 10 * Math.log10(e / Math.max(1e-30, tot) + 1e-30));
}
const bandDev = (a, b) => a.reduce((m, x, i) => (Math.max(x, b[i]) > BAND_FLOOR ? Math.max(m, Math.abs(x - b[i])) : m), 0);
export async function velocityLayers(S, hold) {
  const m = async vel => {
    const d = (await renderNote(structuredClone(S), VEL_REF, vel, hold, hold + 0.2)).getChannelData(0);
    const n = Math.min(d.length, Math.floor(SR * hold));
    let e = 0; for (let i = 0; i < n; i++) e += d[i] * d[i];
    return { rms: Math.sqrt(e / n), bands: thirdOctaves(d, n) };
  };
  const hard = await m(1), soft = await m(VEL_SOFT);
  const dev = bandDev(hard.bands, soft.bands);
  const one = [{ vel: 1, lovel: 0, hivel: 127, gain: 1 }];
  if (!(dev > VEL_DB) || hard.rms < 1e-6 || soft.rms < 1e-6) return { layers: one, timbre: dev };
  const vels = dev > VEL_DB3 ? [[0.35, 0, 42], [0.7, 43, 84], [1, 85, 127]] : [[0.5, 0, 63], [1, 64, 127]];
  const layers = [];
  for (const [vel, lovel, hivel] of vels)
    layers.push({ vel, lovel, hivel, gain: vel === 1 ? 1 : hard.rms / Math.max(1e-9, (await m(vel)).rms) });
  return { layers, timbre: dev };
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
  const { layers, timbre } = await velocityLayers(S, Math.min(hold, 1.5));
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
      if (layers[li].gain !== 1) {         // capas al nivel de la dura (medido);
        const g = layers[li].gain;         // el volumen por velocity lo pone amp_veltrack
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
  return { slug, sfz: lines.join('\n') + '\n', samples, layers: layers.length, timbre, keys };
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
