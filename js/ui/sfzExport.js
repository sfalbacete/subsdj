/* =====================================================================
   SubSDJ · SFZ exporter (🎹 SFZ button in the preset bar).
   Freezes the CURRENT preset as a multisample instrument reusable in
   any sampler (Sforzando, Renoise, TAL-Sampler…): renders a
   grid of notes in OfflineAudioContext —the same real path as the
   self-test—, trims the silence at both ends, normalizes globally
   and downloads a ZIP (uncompressed entries) with <preset>.sfz +
   samples/*.wav (16-bit stereo).
   Decisions:
   - Reverb and delay are NOT baked in (their echoes/tails would stay glued to each
     note in a sampler; they are added in the DAW). The rest of the chain
     (drive, filter, unison, chorus/ensemble, width…) is timbre and goes in.
   - MEASURED velocity layers (velocityLayers): the reference note at
     soft and full velocity; if the BRIGHTNESS changes, velocity changes the
     timbre (filter env, matrix → filter or FM, FM4 operators… whatever
     it is, no list to maintain) and there are 2 or 3 layers; if only the
     volume changes, 1 is enough. Each layer is matched to the measured LEVEL of the hard one (not
     ×1/vel: velocity can move more than the VCA) and the continuous volume
     is set by the sampler (amp_veltrack=100 by default in SFZ).
   - No loop points (v1): long samples (hold + full release) and
     ampeg_release = the preset's release so that releasing the note in the
     sampler sounds like in the synth.
   ===================================================================== */
import { AudioEngine } from '../engine/AudioEngine.js';
import { part } from '../engine/parts.js';
import { encodeWav, download } from './recorder.js';
import { currentPreset } from './presetBank.js';

const SR = 44100;
const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

// Default grid: C1..C7 every 4 st (the sampler interpolates ±2 st at most)
export const SFZ_GRID = { lo: 24, hi: 96, step: 4, hold: 3.0, maxDur: 8 };

// --- offline render of ONE note (the self-test recipe) ---
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

// Does the TIMBRE change with velocity? The reference note at VEL_SOFT and at 1,
// each as a third-octave band SPECTRUM (averaged FFT; in dB
// relative to its total: the level doesn't count). Timbre = the band that moves most,
// among those that sound (BAND_FLOOR): above VEL_DB → 2 layers; above VEL_DB3 → 3.
// The preset's randomness (free phases, noise, per-note S&H, drift) doesn't confuse the
// measurement: offline renders are seeded (Roadmap 7.0 · 7.1), so the two
// notes share the same roll and differ only in velocity. (Before, a
// second render at velocity 1 measured that randomness and velocity had to exceed it.)
// Each layer is matched to the LEVEL of the hard one (measured RMS).
// Measured on the 117 factory presets (2026-10-20, already seeded): 2 layers or more in 45, 21 of them with 3
// (before 0.2, 30, from the filter env), with velocity via the matrix, FM4 and distortion
// (a soft note saturates less) correctly detected. With randomness out of the measurement, the ones
// it was masking show up: «Lottery Pluck (S&H)» goes from 1 layer to 3 (its filter env follows velocity:
// 15 dB in the band that moves most; before, the per-note S&H hid it).
const VEL_REF = 60, VEL_SOFT = 0.3;
const VEL_DB = 2;     // a band moving 2 dB: a different timbre, not just quieter (a false «yes» only bloats the zip)
const VEL_DB3 = 10;   // 10 dB: an intermediate layer avoids the jump between the two
const BAND_FLOOR = -30; // only the bands that SOUND (within 30 dB of the total): weaker ones aren't heard and their measurement is noise
const FFT_N = 4096;
function fft(re, im) {                               // in-place radix-2
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
// Third-octave bands from 100 Hz to 16 kHz, in dB relative to the total (Welch: Hann, 50 %)
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

// Trims the silence (< −70 dBFS) at both ends and fades the last 15 ms
// to zero (no click when the sample ends in the sampler).
function trimBuffer(buf) {
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const thr = 3.2e-4, n = L.length;
  let a = 0; while (a < n && Math.abs(L[a]) < thr && Math.abs(R[a]) < thr) a++;
  let b = n - 1; while (b > a && Math.abs(L[b]) < thr && Math.abs(R[b]) < thr) b--;
  if (a >= b) { a = 0; b = n - 1; }                    // all below the threshold: left as is
  a = Math.max(0, a - Math.floor(SR * 0.002));
  b = Math.min(n, b + 1 + Math.floor(SR * 0.05));
  const l = L.slice(a, b), r = R.slice(a, b), m = l.length;
  const fade = Math.min(m, Math.floor(SR * 0.015));
  for (let i = 0; i < fade; i++) { const g = i / fade; l[m - 1 - i] *= g; r[m - 1 - i] *= g; }
  return { l, r };
}

const slugify = s => (String(s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)) || 'preset';

// Renders the whole kit: WAV samples (Uint8Array) + .sfz text.
// opts overrides SFZ_GRID (the self-test uses a minimal grid).
export async function makeSfzKit(state, name, opts = {}, onProgress = null) {
  const o = { ...SFZ_GRID, ...opts };
  const S = structuredClone(state);
  S.arpMode = 'off';                       // the arp scheduler is wall-clock: it would silence the render
  S.mode = 'poly';                         // single notes; mono/glide doesn't apply to an isolated render
  S.reverbMix = 0; S.dlyAmt = 0;           // space left out of the bake (added in the DAW)
  const hold = Math.max(o.hold, (S.a || 0) + 1.2);     // so the whole attack fits
  const { layers, timbre } = await velocityLayers(S, Math.min(hold, 1.5));
  const keys = [];
  for (let m = o.lo; m <= o.hi; m += o.step) keys.push(m);
  if (keys[keys.length - 1] !== o.hi) keys.push(o.hi);

  // 1) renders (sequential: each note is its own OfflineAudioContext)
  const rendered = [];
  const total = layers.length * keys.length;
  for (let li = 0; li < layers.length; li++) {
    for (const midi of keys) {
      const buf = await renderNote(structuredClone(S), midi, layers[li].vel, hold, o.maxDur);
      const { l, r } = trimBuffer(buf);
      if (layers[li].gain !== 1) {         // layers at the hard one's level (measured);
        const g = layers[li].gain;         // the volume per velocity is set by amp_veltrack
        for (let i = 0; i < l.length; i++) { l[i] *= g; r[i] *= g; }
      }
      rendered.push({ midi, li, l, r });
      if (onProgress) onProgress(rendered.length, total);
    }
  }

  // 2) GLOBAL normalization to −1 dBFS: a single gain for the whole kit
  //    (keeps the balance between notes and layers, only adjusts the ceiling)
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

  // 3) WAVs + .sfz text
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
    '// Multisample of the preset (grid of ' + o.step + ' st, ' + layers.length + ' velocity layer(s)).',
    '// Reverb and delay are NOT baked in: add them in the DAW/tracker.',
    '// No loop points: notes sustain ~' + hold.toFixed(1) + ' s + release.',
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
      // key boundaries halfway between neighboring keycenters (no gaps)
      const lokey = i === 0 ? 0 : Math.floor((keys[i - 1] + k) / 2) + 1;
      const hikey = i === keys.length - 1 ? 127 : Math.floor((k + keys[i + 1]) / 2);
      const fname = samples.find(s => s.midi === k && s.layer === li).fname;
      lines.push('<region> sample=' + fname + ' lokey=' + lokey + ' hikey=' + hikey + ' pitch_keycenter=' + k);
    });
  });
  return { slug, sfz: lines.join('\n') + '\n', samples, layers: layers.length, timbre, keys };
}

// --- ZIP with stored entries (STORE method: WAV barely compresses
// and this way the writer fits in 40 lines with no dependencies) ---
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
    const lh = new DataView(new ArrayBuffer(30));          // local header (fields not set = 0)
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true);
    lh.setUint16(26, name.length, true);
    parts.push(lh.buffer, name, e.data);
    const ch = new DataView(new ArrayBuffer(46));          // central directory entry
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(ch.buffer, name);
    cdSize += 46 + name.length;
    offset += 30 + name.length + sz;
  }
  const eocd = new DataView(new ArrayBuffer(22));          // end of central directory
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
    const name = currentPreset()?.name || 'preset';
    try {
      // exports what is SOUNDING now: the loaded preset + the knob tweaks
      const kit = await exportPresetSFZ(name, structuredClone(part().S),
        (i, n) => say('SFZ: render ' + i + '/' + n + '…'));
      say('SFZ exported: ' + kit.samples.length + ' samples · load it in Sforzando/Renoise.');
    } catch (e) {
      console.error('SubSDJ sfz:', e);
      say('Error exporting SFZ (see the console).');
    } finally { btn.disabled = false; }
  });
}
